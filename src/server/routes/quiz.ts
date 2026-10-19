/**
 * EduMate — API Quiz : catalogue, génération de sessions, correction, favoris.
 *
 * Les questions sont générées côté serveur à partir d'une graine. La même
 * graine reproduit exactement la même session : la correction est donc
 * vérifiable côté serveur (le client ne peut pas s'auto-attribuer un score).
 */
import { Router } from 'express';
import type { Question } from '../../shared/types.js';
import { buildQuiz } from '../content/index.js';
import { browse, findTopic, getCatalog, searchTopics } from '../lib/catalog.js';
import { addAttempt, findUserById, listAttempts, listFavorites, toggleFavorite } from '../lib/store.js';
import { journalAfterAttempt, saveExams } from '../lib/planning.js';
import { asyncHandler, badRequest, notFound, requireAuth, requireCsrf } from '../lib/middleware.js';
import { optionalStringArray, requireIntInRange } from '../lib/validation.js';
import { LIMITS, cleanText } from '../lib/validation.js';
import { checkShortAnswer } from '../content/lib.js';
import { chatCompletion } from '../lib/ai.js';
import { hasAiProvider } from '../lib/config.js';

export const quizRouter = Router();
quizRouter.use(requireCsrf());

interface QuizPayload {
  topicId: string;
  seed: number;
  durationSec: number;
  questions: Question[];
}

/** Fabrique une session reproductible à partir de la graine. */
function makeQuiz(topicId: string, seed: number, count: number, difficulty?: 'facile' | 'moyen' | 'difficile'): QuizPayload {
  const topic = findTopic(topicId);
  if (!topic) throw notFound('Ce sujet de quiz n’existe pas (ou plus) dans le catalogue.');
  if (topic.pool < 4) throw badRequest('Ce sujet ne dispose pas encore d’assez de questions.');
  const { questions, durationSec } = buildQuiz({
    topicId,
    source: topic.source,
    params: topic.params ?? {},
    difficulty: difficulty ?? topic.difficulty,
    count,
    seed: `${topicId}#${seed}`,
  });
  if (questions.length < 3) {
    throw badRequest('Impossible de générer assez de questions pour ce sujet. Essaie un autre sujet.');
  }
  return { topicId, seed, durationSec, questions };
}

/** Questions renvoyées au client (sans les réponses ni les explications). */
function publicQuestions(questions: Question[]) {
  return questions.map((question) => ({
    id: question.id,
    kind: question.kind,
    prompt: question.prompt,
    options: question.options ?? [],
    difficulty: question.difficulty,
    skill: question.skill ?? null,
  }));
}

/* ------------------------------------------------------------------ */
/*  Catalogue                                                          */
/* ------------------------------------------------------------------ */

quizRouter.get('/catalog', (_req, res) => {
  const catalog = getCatalog();
  res.json({
    subjects: catalog.subjects,
    levels: catalog.levels,
    stats: catalog.stats,
    generatedAt: catalog.generatedAt,
  });
});

quizRouter.get('/browse', (req, res) => {
  const subjectId = typeof req.query.subject === 'string' ? req.query.subject : undefined;
  const levelId = typeof req.query.level === 'string' ? req.query.level : undefined;
  const { subjects, levels, themes } = browse(subjectId, levelId);
  res.json({ subjects, levels, themes });
});

quizRouter.get('/search', asyncHandler(async (req, res) => {
  const q = req.query;
  const favorites = req.auth ? await listFavorites(req.auth.sub) : [];
  const result = searchTopics({
    query: typeof q.q === 'string' ? q.q : undefined,
    subjectId: typeof q.subject === 'string' ? q.subject : undefined,
    levelId: typeof q.level === 'string' ? q.level : undefined,
    themeId: typeof q.theme === 'string' ? q.theme : undefined,
    difficulty: typeof q.difficulty === 'string' ? (q.difficulty as 'facile' | 'moyen' | 'difficile') : undefined,
    favorites,
    onlyFavorites: q.favorites === '1' || q.favorites === 'true',
    sort: (['pertinence', 'matiere', 'difficulte', 'nom'] as const).includes(q.sort as never) ? (q.sort as never) : 'pertinence',
    limit: Number(q.limit) || 24,
    offset: Number(q.offset) || 0,
  });
  const favoriteSet = new Set(favorites);
  res.json({
    ...result,
    items: result.items.map((topic) => ({ ...topic, favorite: favoriteSet.has(topic.id) })),
  });
}));

quizRouter.get('/topics/:id', (req, res) => {
  const topic = findTopic(req.params.id);
  if (!topic) throw notFound('Sujet introuvable.');
  const related = searchTopics({
    subjectId: topic.subjectId,
    themeId: topic.themeId,
    limit: 6,
  }).items.filter((item) => item.id !== topic.id);
  res.json({ topic, related });
});

/* ------------------------------------------------------------------ */
/*  Sessions de quiz                                                   */
/* ------------------------------------------------------------------ */

quizRouter.post('/generate', (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const topicId = typeof body.topicId === 'string' ? body.topicId.trim() : '';
  if (!topicId) throw badRequest('Le sujet est requis.');
  const count = requireIntInRange(body.count ?? 10, 'nombre de questions', 3, 30);
  const seed = requireIntInRange(body.seed ?? Math.floor(Math.random() * 1_000_000), 'seed', 0, 1_000_000);
  const difficulty = ['facile', 'moyen', 'difficile'].includes(String(body.difficulty))
    ? (String(body.difficulty) as 'facile' | 'moyen' | 'difficile')
    : undefined;

  const quiz = makeQuiz(topicId, seed, count, difficulty);
  const topic = findTopic(topicId)!;
  res.json({
    topic: {
      id: topic.id,
      name: topic.name,
      subjectId: topic.subjectId,
      subjectName: topic.subjectName,
      levelName: topic.levelName,
      themeName: topic.themeName,
      emoji: topic.emoji,
      color: topic.color,
      accent: topic.accent,
      difficulty: difficulty ?? topic.difficulty,
    },
    seed: quiz.seed,
    durationSec: quiz.durationSec,
    questions: publicQuestions(quiz.questions),
  });
});

/** Correction côté serveur + enregistrement de la progression. */
quizRouter.post(
  '/grade',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const topicId = typeof body.topicId === 'string' ? body.topicId.trim() : '';
    if (!topicId) throw badRequest('Le sujet est requis.');
    const seed = requireIntInRange(body.seed ?? 0, 'seed', 0, 1_000_000);
    const durationSec = requireIntInRange(body.durationSec ?? 0, 'durée', 0, 20_000);
    const answers = Array.isArray(body.answers) ? (body.answers as Record<string, unknown>[]) : [];

    const quiz = makeQuiz(topicId, seed, Math.max(3, Math.min(30, answers.length || 10)));
    const topic = findTopic(topicId)!;
    const byId = new Map(quiz.questions.map((question) => [question.id, question]));

    const results = quiz.questions.map((question) => {
      const given = answers.find((a) => a?.questionId === question.id) ?? answers.find((_, index) => index === quiz.questions.indexOf(question));
      const provided = given?.value;
      let correct = false;
      if (question.kind === 'texte') {
        correct = checkShortAnswer(question, String(provided ?? ''));
      } else {
        const index = Number(provided);
        correct = Number.isInteger(index) && index === question.answer;
      }
      return {
        questionId: question.id,
        prompt: question.prompt,
        correct,
        given: provided ?? null,
        answer: question.answer ?? null,
        options: question.options ?? [],
        accept: question.accept ?? null,
        explanation: question.explanation,
        skill: question.skill ?? null,
      };
    });

    const score = results.filter((r) => r.correct).length;
    const total = results.length;

    /* Historique AVANT l'essai : permet d'expliquer l'évolution de maîtrise
       dans le journal du planning (« 42 % → 85 % »). */
    const attemptsBefore = await listAttempts(req.auth!.sub);

    const attempt = await addAttempt(req.auth!.sub, {
      topicId,
      subjectId: topic.subjectId,
      levelId: topic.levelId,
      themeName: topic.themeName,
      topicName: topic.name,
      score,
      total,
      durationSec,
      answers: results.map((r) => ({
        questionId: r.questionId,
        correct: r.correct,
        given: typeof r.given === 'string' || typeof r.given === 'number' ? r.given : undefined,
      })),
      /*
       * La graine est conservée avec l'essai : c'est elle qui permet à la page
       * de révision interactive (`/quiz/:topicId/revision`) de régénérer à
       * l'identique les questions jouées, avec les réponses de l'élève.
       */
      seed,
      createdAt: new Date().toISOString(),
    });

    /* Journal du planning : « ton planning a été ajusté après ton quiz ». */
    try {
      const updatedExams = await journalAfterAttempt(req.auth!.sub, attempt, attemptsBefore);
      await saveExams(req.auth!.sub, updatedExams);
    } catch (error) {
      console.warn('[EduMate] Journal planning impossible :', error instanceof Error ? error.message : error);
    }

    res.json({
      score,
      total,
      percent: total ? Math.round((score / total) * 100) : 0,
      durationSec,
      attemptId: attempt.id,
      results,
      unused: byId.size - results.length,
    });
  }),
);

/* ------------------------------------------------------------------ */
/*  Coach de quiz (chat post-résultat)                                 */
/* ------------------------------------------------------------------ */

interface CoachQuestion {
  prompt: string;
  options: string[];
  answer: number | null;
  given: string | number | null;
  accept: string[] | null;
  explanation: string;
  correct: boolean;
  skill: string | null;
}

/** Contexte compact du quiz, transmis à l'assistant (taille bornée). */
function formatQuizContext(topicName: string, score: number, total: number, questions: CoachQuestion[]): string {
  const lines = questions.map((question, index) => {
    const parts = [`Question ${index + 1} (${question.correct ? 'réussie' : 'ratée'})${question.skill ? ` [${question.skill}]` : ''} : ${question.prompt}`];
    if (question.options.length) {
      parts.push(
        `Propositions : ${question.options.map((option, optionIndex) => `${'ABCD'[optionIndex] ?? optionIndex + 1}. ${option}`).join(' | ')}`,
      );
      if (question.answer !== null) parts.push(`Bonne réponse : ${'ABCD'[question.answer] ?? question.answer + 1}`);
      if (question.given !== null) parts.push(`Réponse de l'élève : ${typeof question.given === 'number' ? ('ABCD'[question.given] ?? question.given + 1) : question.given}`);
    } else {
      if (question.accept?.length) parts.push(`Réponse attendue : ${question.accept.join(' ou ')}`);
      if (question.given !== null) parts.push(`Réponse de l'élève : ${question.given}`);
    }
    if (question.explanation) parts.push(`Explication : ${question.explanation}`);
    return parts.join('\n');
  });
  return `Quiz « ${topicName} » — score de l'élève : ${score}/${total}.\n\n${lines.join('\n\n')}`.slice(0, 9000);
}

/** Aide locale de repli : s'appuie sur les explications de la bibliothèque. */
function localCoachAnswer(questions: CoachQuestion[], message: string): string {
  const lower = message.toLowerCase();
  const match = lower.match(/question\s*(\d+)/);
  const asked = match ? Number(match[1]) : null;

  if (asked && asked >= 1 && asked <= questions.length) {
    const question = questions[asked - 1];
    const parts = [
      `## Question ${asked}\n`,
      `**${question.prompt}**\n`,
      question.options.length
        ? `Bonne réponse : **${'ABCD'[question.answer ?? -1] ?? question.answer ?? '?'}**${question.answer !== null && question.options[question.answer] ? ` — ${question.options[question.answer]}` : ''}\n`
        : `Réponse attendue : **${question.accept?.join(' ou ') ?? '?'}**\n`,
      `### Comment la trouver\n\n${question.explanation || 'Relis la correction détaillée ci-dessus : elle contient le raisonnement complet.'}\n`,
    ];
    if (!question.correct && question.given !== null) {
      parts.push(`> Ta réponse (${typeof question.given === 'number' ? ('ABCD'[question.given] ?? question.given + 1) : question.given}) n'était pas la bonne : compare-la avec le raisonnement ci-dessus pour comprendre l'écart.\n`);
    }
    return parts.join('\n');
  }

  const missed = questions.filter((question) => !question.correct);
  const parts = ['## Reprenons ton quiz ensemble\n'];
  if (missed.length) {
    parts.push(`Tu as manqué ${missed.length} question(s). Voici l'essentiel à retenir :\n`);
    missed.slice(0, 6).forEach((question) => {
      const position = questions.indexOf(question) + 1;
      parts.push(`- **Question ${position}** — ${question.prompt.slice(0, 140)}\n  → ${question.explanation.slice(0, 300)}`);
    });
  } else {
    parts.push('Sans faute ! Pour aller plus loin, demande-moi un approfondissement ou un moyen mnémotechnique sur une notion du quiz.');
  }
  parts.push('\n## Méthode pour progresser\n');
  parts.push(
    [
      '1. Relis chaque explication en reformulant la réponse avec tes propres mots.',
      '2. Refais le quiz : les questions changent à chaque partie.',
      '3. Note les notions qui t’ont manqué et entraîne-toi dessus avec l’aide aux devoirs.',
    ].join('\n'),
  );
  return parts.join('\n');
}

/**
 * Chat du coach : l'élève vient de terminer un quiz et peut demander comment
 * trouver les réponses, des méthodes, des moyens mnémotechniques…
 */
quizRouter.post(
  '/coach',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const message = cleanText(body.message, LIMITS.message);
    if (message.length < 2) throw badRequest('Écris ta question (au moins 2 caractères).');

    const topicName = cleanText(body.topicName, 120) || 'ce quiz';
    const score = Number.isFinite(Number(body.score)) ? Math.max(0, Math.min(200, Number(body.score))) : 0;
    const total = Number.isFinite(Number(body.total)) ? Math.max(0, Math.min(200, Number(body.total))) : 0;

    const questions: CoachQuestion[] = (Array.isArray(body.questions) ? body.questions : [])
      .slice(0, 30)
      .map((item) => {
        const raw = (item ?? {}) as Record<string, unknown>;
        return {
          prompt: cleanText(raw.prompt, 600),
          options: (Array.isArray(raw.options) ? raw.options : []).slice(0, 8).map((option) => cleanText(option, 300)),
          answer: Number.isInteger(raw.answer) ? Number(raw.answer) : null,
          given: typeof raw.given === 'string' ? cleanText(raw.given, 300) : typeof raw.given === 'number' ? raw.given : null,
          accept: (Array.isArray(raw.accept) ? raw.accept : []).slice(0, 8).map((value) => cleanText(value, 200)),
          explanation: cleanText(raw.explanation, 900),
          correct: Boolean(raw.correct),
          skill: typeof raw.skill === 'string' ? cleanText(raw.skill, 60) : null,
        };
      })
      .filter((question) => question.prompt.length > 0);

    const history = Array.isArray(body.history)
      ? (body.history as { role?: string; content?: string }[])
          .filter((entry) => entry && typeof entry.content === 'string' && (entry.role === 'user' || entry.role === 'assistant'))
          .slice(-8)
          .map((entry) => ({
            role: entry.role as 'user' | 'assistant',
            content: String(entry.content).slice(0, LIMITS.message),
          }))
      : [];

    const user = await findUserById(req.auth!.sub);
    const levelLabel = user?.level ? String(user.level) : undefined;

    if (hasAiProvider()) {
      try {
        const content = await chatCompletion(
          [
            {
              role: 'system',
              content: [
                "Tu es le coach pédagogique d'EduMate. Un élève vient de terminer un quiz et discute avec toi juste après ses résultats.",
                `${user?.firstName ? `L'élève s'appelle ${user.firstName}` : "L'élève est anonyme"}${levelLabel ? `, niveau : ${levelLabel}` : ''}.`,
                'Ta mission : expliquer COMMENT trouver la bonne réponse (raisonnement, méthode, indices dans l’énoncé), donner des moyens mnémotechniques, des pièges à éviter et des conseils pour progresser.',
                'Règles :',
                '- Réponds toujours en français, avec un ton chaleureux et encourageant, adapté à un collégien/lycéen.',
                '- Markdown propre : titres courts (##), listes, gras sur les mots-clés.',
                '- Formules mathématiques : utilise EXCLUSIVEMENT $...$ (en ligne) et $$...$$ (en bloc). N’utilise jamais \\(...\\) ni \\[...\\].',
                '- Explique le raisonnement pas à pas, jamais seulement le résultat.',
                "- Appuie-toi sur le contexte du quiz ci-dessous ; si l'élève demande une question précise (« question 3 »), utilise les données de cette question.",
                '- Longueur cible : 120 à 300 mots. Termine souvent par une petite question ou une piste pour vérifier que l’élève a compris.',
                "- Reste dans le cadre scolaire : ne réponds pas à des demandes sans lien avec le quiz ou les études, et n'invente pas de données.",
                '',
                'Contexte du quiz terminé :',
                formatQuizContext(topicName, score, total, questions),
              ].join('\n'),
            },
            ...history,
            { role: 'user', content: message },
          ],
          { maxTokens: 1000, temperature: 0.5, timeoutMs: 40_000 },
        );
        res.json({ content, offline: false });
        return;
      } catch (error) {
        console.warn('[EduMate] Coach IA indisponible, repli local :', error instanceof Error ? error.message : String(error));
      }
    }

    res.json({ content: localCoachAnswer(questions, message), offline: true });
  }),
);

/* ------------------------------------------------------------------ */
/*  Favoris                                                            */
/* ------------------------------------------------------------------ */

quizRouter.get(
  '/favorites',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const favorites = await listFavorites(req.auth!.sub);
    const catalog = getCatalog();
    const items = favorites
      .map((id) => catalog.topics.find((topic) => topic.id === id))
      .filter((topic): topic is NonNullable<typeof topic> => Boolean(topic));
    res.json({ favorites, items });
  }),
);

quizRouter.post(
  '/favorites',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const topicId = typeof body.topicId === 'string' ? body.topicId.trim() : '';
    if (!topicId || !findTopic(topicId)) throw badRequest('Sujet de quiz invalide.');
    const result = await toggleFavorite(req.auth!.sub, topicId);
    res.json(result);
  }),
);

/* ------------------------------------------------------------------ */
/*  Recommandations personnalisées                                     */
/* ------------------------------------------------------------------ */

quizRouter.get(
  '/recommendations',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const [attempts, favorites] = await Promise.all([listAttempts(req.auth!.sub), listFavorites(req.auth!.sub)]);
    const played = new Set(attempts.map((a) => a.topicId));
    const subjects = attempts.length
      ? [...new Set(attempts.map((a) => a.subjectId))].slice(0, 4)
      : [];

    const picks = new Map<string, ReturnType<typeof searchTopics>['items']>();
    for (const subjectId of subjects) {
      picks.set(subjectId, searchTopics({ subjectId, exclude: [...played], limit: 3, sort: 'pertinence' }).items);
    }
    const toReview = attempts
      .filter((a) => a.total > 0 && a.score / a.total < 0.6)
      .slice(0, 4)
      .map((a) => findTopic(a.topicId))
      .filter((topic): topic is NonNullable<typeof topic> => Boolean(topic));

    const fresh = searchTopics({ exclude: [...played], limit: 8, sort: 'pertinence' }).items;
    const favoriteItems = optionalStringArray(favorites, 8)
      .map((id) => findTopic(id))
      .filter((topic): topic is NonNullable<typeof topic> => Boolean(topic));

    res.json({
      toReview,
      favorites: favoriteItems,
      bySubject: [...picks.entries()].map(([subjectId, items]) => ({ subjectId, items })),
      fresh,
    });
  }),
);
