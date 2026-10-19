/**
 * EduMate — API Leçons interactives & révisions de quiz.
 *
 * Trois points d'entrée :
 *   GET  /api/lessons/:topicId            → leçon complète (étapes jouables)
 *   POST /api/lessons/:topicId/enrich     → contenu IA sur mesure (mis en cache)
 *   GET  /api/lessons/revision/:topicId   → révision interactive d'un quiz joué
 *
 * Les leçons sont publiques (comme le catalogue) : aucun compte n'est requis
 * pour apprendre. L'enrichissement IA et la révision d'un essai personnel
 * exigent en revanche une session authentifiée.
 */
import { Router } from 'express';
import type { AiLessonContent, FicheRecord } from '../../shared/types.js';
import { buildAiLessonPrompt, buildLesson, parseAiLesson } from '../content/lessons.js';
import { buildRevisionPayload } from '../lib/revision.js';
import {
  addLessonCompletion,
} from '../lib/store.js';
import { listExams, pushJournal, saveExams } from '../lib/planning.js';
import {
  buildFiche,
  buildFicheSummaries,
  lessonSuccess,
  listFicheRecords,
  unlockFiche,
} from '../lib/fiches.js';
import { findTopic } from '../lib/catalog.js';
import { K, listAttempts } from '../lib/store.js';
import { getStorage } from '../lib/storage.js';
import { asyncHandler, badRequest, notFound, requireAuth, requireCsrf } from '../lib/middleware.js';
import { hasAiProvider } from '../lib/config.js';
import { chatCompletion } from '../lib/ai.js';

export const lessonsRouter = Router();
lessonsRouter.use(requireCsrf());

/** Lit le contenu IA en cache d'un sujet (null si absent ou corrompu). */
async function readCachedAiLesson(topicId: string): Promise<AiLessonContent | null> {
  try {
    const store = await getStorage();
    const raw = await store.get<AiLessonContent>(K.lessonAi(topicId));
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    // Revalidation : un cache corrompu ne doit jamais atteindre le client.
    return parseAiLesson(JSON.stringify(raw));
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Révision interactive d'un quiz                                     */
/* ------------------------------------------------------------------ */

/*
 * ⚠️ Déclarée AVANT `/:topicId` : Express teste les routes dans l'ordre,
 * sinon « revision » serait pris pour un identifiant de sujet.
 */
lessonsRouter.get(
  '/revision/:topicId',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const topic = findTopic(req.params.topicId);
    if (!topic) throw notFound('Ce sujet n’existe pas (ou plus) dans le catalogue.');

    const attemptId = typeof req.query.attempt === 'string' ? req.query.attempt.trim() : '';
    const attempts = await listAttempts(req.auth!.sub);
    const attempt = attemptId
      ? (attempts.find((entry) => entry.id === attemptId && entry.topicId === topic.id) ?? null)
      : (attempts.find((entry) => entry.topicId === topic.id) ?? null);

    const seedParam = Number(req.query.seed);
    res.json(
      buildRevisionPayload({
        topic,
        attempt,
        seed: Number.isFinite(seedParam) ? Math.trunc(seedParam) : undefined,
      }),
    );
  }),
);

/* ------------------------------------------------------------------ */
/*  Fiches de révision automatiques                                    */
/* ------------------------------------------------------------------ */

/*
 * ⚠️ Déclarées AVANT `/:topicId` : « fiches » serait sinon interprété comme
 * un identifiant de sujet.
 */

/** Hub : toutes les fiches débloquées par l'élève, plus récentes d'abord. */
lessonsRouter.get(
  '/fiches',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const fiches = await buildFicheSummaries(req.auth!.sub);
    res.json({ fiches });
  }),
);

/** Fiche complète d'un sujet (404 lisible si non débloquée ou inexistante). */
lessonsRouter.get(
  '/fiches/:topicId',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const topic = findTopic(req.params.topicId);
    if (!topic) throw notFound('Ce sujet n’existe pas (ou plus) dans le catalogue.');
    const fiche = await buildFiche(req.auth!.sub, topic.id);
    if (!fiche) {
      res.status(404).json({
        error: 'fiche_verrouillee',
        message: 'Cette fiche n’est pas encore débloquée : réussis la leçon du sujet pour la créer automatiquement.',
        topicId: topic.id,
      });
      return;
    }
    res.json({ fiche });
  }),
);

/* ------------------------------------------------------------------ */
/*  Leçon d'un sujet                                                   */
/* ------------------------------------------------------------------ */

lessonsRouter.get(
  '/:topicId',
  asyncHandler(async (req, res) => {
    const topic = findTopic(req.params.topicId);
    if (!topic) throw notFound('Ce sujet de leçon n’existe pas (ou plus) dans le catalogue.');

    const seedParam = Number(req.query.seed);
    const seed = Number.isFinite(seedParam) ? Math.trunc(seedParam) : undefined;
    const ai = await readCachedAiLesson(topic.id);

    res.json({
      lesson: buildLesson({ topic, seed, ai, aiAvailable: hasAiProvider() }),
    });
  }),
);

/* ------------------------------------------------------------------ */
/*  Fin de leçon : déblocage automatique de la fiche                   */
/* ------------------------------------------------------------------ */

/**
 * Appelée une fois par partie terminée par le lecteur d'étapes.
 * Si le score d'exercices atteint 70 %, la fiche de révision du sujet est
 * créée (ou mise à jour) et renvoyée au client pour l'écran de félicitations.
 */
lessonsRouter.post(
  '/:topicId/complete',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const topic = findTopic(req.params.topicId);
    if (!topic) throw notFound('Ce sujet de leçon n’existe pas (ou plus) dans le catalogue.');

    const body = (req.body ?? {}) as Record<string, unknown>;
    const total = Number(body.total);
    const score = Number(body.score);
    const durationSec = Math.max(0, Math.min(20_000, Math.round(Number(body.durationSec) || 0)));
    if (!Number.isInteger(total) || total < 0 || total > 64) throw badRequest('Nombre d’exercices invalide.');
    if (!Number.isInteger(score) || score < 0 || score > total) throw badRequest('Score invalide.');

    /* Chaque terminé de leçon est ENREGISTRÉ (historique, temps de travail,
       progression) — même sous le seuil. La VALIDATION (fiche, case « leçon »
       du planning) exige ≥ 80 % : en dessous, la leçon reste à rejouer. */
    const rate = total > 0 ? score / total : 0;
    const at = new Date().toISOString();
    const history = await addLessonCompletion(req.auth!.sub, { topicId: topic.id, rate, score, total, durationSec, at });
    const bestRate = Math.max(...history.filter((entry) => entry.topicId === topic.id).map((entry) => entry.rate));
    const validated = lessonSuccess(score, total);

    if (!validated) {
      res.json({
        success: false,
        validated: false,
        rate,
        bestRate,
        message:
          total > 0
            ? `Presque : ${Math.round(rate * 100)} % d’exercices justes. À partir de 80 %, la leçon est validée et sa fiche de révision se crée. Rejoue-la quand tu veux !`
            : 'Cette leçon ne contient aucun exercice à valider.',
      });
      return;
    }

    const now = new Date().toISOString();
    const record: FicheRecord = {
      topicId: topic.id,
      unlockedAt: now,
      updatedAt: now,
      lessonScore: score,
      lessonTotal: total,
    };
    // Si la fiche existait déjà, on garde la date de premier déblocage.
    const records = await listFicheRecords(req.auth!.sub);
    const existing = records.find((entry) => entry.topicId === topic.id);
    if (existing) record.unlockedAt = existing.unlockedAt;

    const { already } = await unlockFiche(req.auth!.sub, record);
    const fiche = await buildFiche(req.auth!.sub, topic.id);

    /* Journal du planning : la case « leçon » vient de se cocher. */
    try {
      const exams = await listExams(req.auth!.sub);
      let changed = false;
      const updated = exams.map((exam) => {
        if (exam.status !== 'actif' || !exam.topics.includes(topic.id)) return exam;
        changed = true;
        return pushJournal(
          exam,
          'lesson',
          `Leçon validée : ${Math.round(rate * 100)} % sur « ${topic.name} ». Case leçon cochée, séance « cours » validée et fiche de révision ${already ? 'mise à jour' : 'créée'}.`,
        );
      });
      if (changed) await saveExams(req.auth!.sub, updated);
    } catch (error) {
      console.warn('[EduMate] Journal planning impossible :', error instanceof Error ? error.message : error);
    }

    res.json({ success: true, validated: true, rate, bestRate, already, fiche });
  }),
);

/* ------------------------------------------------------------------ */
/*  Enrichissement IA (optionnel, mis en cache)                        */
/* ------------------------------------------------------------------ */

lessonsRouter.post(
  '/:topicId/enrich',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const topic = findTopic(req.params.topicId);
    if (!topic) throw notFound('Ce sujet de leçon n’existe pas (ou plus) dans le catalogue.');

    if (!hasAiProvider()) {
      // Pas d'erreur HTTP : la leçon locale reste pleinement utilisable et le
      // client affiche simplement un message d'information.
      res.json({ ai: null, message: 'L’assistant IA n’est pas configuré sur ce serveur : la leçon reste disponible dans sa version complète.' });
      return;
    }

    // Cache partagé entre élèves : une génération par sujet, jamais deux.
    const cached = await readCachedAiLesson(topic.id);
    if (cached) {
      res.json({ ai: cached, cached: true });
      return;
    }

    let content: string;
    try {
      content = await chatCompletion(
        [
          {
            role: 'system',
            content:
              "Tu es le concepteur pédagogique d'EduMate, une plateforme de révisions pour collégiens et lycéens francophones. " +
              'Tu produis des contenus de leçons exacts, concrets et motivants. Tu réponds strictement en JSON valide.',
          },
          { role: 'user', content: buildAiLessonPrompt(topic) },
        ],
        { maxTokens: 900, temperature: 0.6, timeoutMs: 40_000 },
      );
    } catch (error) {
      console.warn('[EduMate] Enrichissement IA indisponible :', error instanceof Error ? error.message : String(error));
      res.json({ ai: null, message: 'L’assistant IA n’a pas pu répondre pour l’instant. La leçon complète reste disponible.' });
      return;
    }

    const ai = parseAiLesson(content);
    if (!ai) {
      res.json({ ai: null, message: 'La réponse de l’assistant était inexploitable. La leçon complète reste disponible.' });
      return;
    }

    const stored: AiLessonContent = {
      ...ai,
      createdAt: new Date().toISOString(),
    };
    try {
      const store = await getStorage();
      await store.set(K.lessonAi(topic.id), stored);
    } catch (error) {
      // Un échec de cache ne doit jamais priver l'élève du contenu généré.
      console.warn('[EduMate] Cache de leçon IA impossible :', error instanceof Error ? error.message : String(error));
    }
    res.json({ ai: stored, cached: false });
  }),
);
