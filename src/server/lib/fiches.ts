/**
 * EduMate — Fiches de révision automatiques.
 *
 * Principe : une fiche est DÉBLOQUÉE quand l'élève réussit la leçon d'un sujet
 * (≥ 70 % des exercices justes). Son contenu, lui, n'est JAMAIS stocké : il
 * est dérivé à la demande du catalogue + de la leçon du sujet (déterministe :
 * même graine ⇒ même fiche), enrichi du meilleur score de quiz de l'élève.
 *
 * Seuls les enregistrements personnels (`FicheRecord`) sont persistés par
 * compte : date de déblocage et score de leçon.
 */
import type {
  AiLessonContent,
  CatalogTopic,
  Fiche,
  FicheFlashcard,
  FicheRecord,
  FicheSection,
  FicheSummary,
  Lesson,
  LessonExercise,
  QuizAttempt,
} from '../../shared/types.js';
import { buildLesson, parseAiLesson } from '../content/lessons.js';
import { findTopic } from './catalog.js';
import { K, listAttempts } from './store.js';
import { getStorage } from './storage.js';

/** Seuil de réussite de leçon pour débloquer la fiche : 80 % (partagé). */
import { LESSON_VALIDATE_RATIO as FICHE_SUCCESS_RATIO } from './store.js';
export { FICHE_SUCCESS_RATIO };

/** Graine stable : la fiche d'un sujet ne change pas entre deux visites. */
const FICHE_SEED = 424_242;

/** Nombre maximal de formules affichées sur une fiche. */
const MAX_FORMULAS = 6;

/* ------------------------------------------------------------------ */
/*  Enregistrements persistés                                          */
/* ------------------------------------------------------------------ */

export async function listFicheRecords(userId: string): Promise<FicheRecord[]> {
  const store = await getStorage();
  const raw = await store.get<FicheRecord[]>(K.fiches(userId));
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (entry) => entry && typeof entry.topicId === 'string' && typeof entry.unlockedAt === 'string',
  );
}

/**
 * Enregistre (ou met à jour) le déblocage d'une fiche.
 * `already` indique si la fiche était déjà débloquée avant cet appel.
 */
export async function unlockFiche(
  userId: string,
  record: FicheRecord,
): Promise<{ records: FicheRecord[]; already: boolean }> {
  const store = await getStorage();
  const records = await listFicheRecords(userId);
  const existing = records.find((entry) => entry.topicId === record.topicId);
  if (existing) {
    const updated = records.map((entry) => (entry.topicId === record.topicId ? { ...entry, ...record } : entry));
    await store.set(K.fiches(userId), updated);
    return { records: updated, already: true };
  }
  const updated = [record, ...records];
  await store.set(K.fiches(userId), updated);
  return { records: updated, already: false };
}

/** Un score de leçon donné suffit-il à débloquer la fiche ? */
export function lessonSuccess(score: number, total: number): boolean {
  if (!Number.isFinite(score) || !Number.isFinite(total) || total <= 0) return false;
  return Math.max(0, Math.min(total, score)) / total >= FICHE_SUCCESS_RATIO;
}

/* ------------------------------------------------------------------ */
/*  Génération du contenu                                              */
/* ------------------------------------------------------------------ */

/** Libellé de la bonne réponse d'un exercice de leçon (pour les cartes mémo). */
function answerLabel(exercise: LessonExercise): string {
  if (exercise.answer !== null && exercise.options[exercise.answer] !== undefined) {
    return exercise.options[exercise.answer];
  }
  return exercise.accept?.[0] ?? 'voir la correction';
}

/** Extrait les formules LaTeX ($…$ et $$…$$) d'un texte, sans doublons. */
function extractFormulas(texts: string[]): string[] {
  const seen = new Set<string>();
  const formulas: string[] = [];
  for (const text of texts) {
    for (const match of text.matchAll(/\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g)) {
      const tex = (match[1] ?? match[2] ?? '').trim();
      if (!tex || seen.has(tex)) continue;
      // Une « formule » d'un seul caractère, purement textuelle ou réduite à
      // un nombre (ex. $54$ : un dénominateur mis en avant dans la leçon)
      // n'a pas sa place dans l'encadré « formules à connaître ».
      if (tex.length < 2 || /^[a-zà-ÿ\s.,;:!?]+$/i.test(tex)) continue;
      if (/^\d+([.,]\d+)?\s?%?$/.test(tex)) continue;
      seen.add(tex);
      formulas.push(tex);
      if (formulas.length >= MAX_FORMULAS) return formulas;
    }
  }
  return formulas;
}

/** Lit le contenu IA en cache d'un sujet (null si absent ou corrompu). */
async function readCachedAiLesson(topicId: string): Promise<AiLessonContent | null> {
  try {
    const store = await getStorage();
    const raw = await store.get<AiLessonContent>(K.lessonAi(topicId));
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    return parseAiLesson(JSON.stringify(raw));
  } catch {
    return null;
  }
}

/** Construit la leçon de référence d'un sujet (déterministe, avec cache IA). */
export function buildFicheLesson(topic: CatalogTopic, ai: Lesson['ai']): Lesson {
  return buildLesson({ topic, seed: FICHE_SEED, ai, aiAvailable: Boolean(ai) });
}

/**
 * Compile une leçon en fiche de révision : sections thématiques, formules et
 * cartes mémo recto/verso. Fonction pure → testable sans base de données.
 */
export function buildFicheContent(lesson: Lesson): { sections: FicheSection[]; formulas: string[]; flashcards: FicheFlashcard[] } {
  const sections: FicheSection[] = [];
  const flashcards: FicheFlashcard[] = [];
  const allTexts: string[] = [];

  const mission = lesson.steps.find((step) => step.kind === 'mission');
  if (mission && mission.kind === 'mission' && mission.goals.length) {
    sections.push({ id: 'essentiel', icon: '🎯', title: 'L’essentiel à savoir', items: mission.goals });
    allTexts.push(...mission.goals);
    flashcards.push({
      id: 'fc-mission',
      icon: '🎯',
      front: `Quelle est la mission de cette leçon ? (${lesson.topicName})`,
      back: mission.goals.join(' · '),
    });
  }

  const concepts = lesson.steps.filter((step) => step.kind === 'concept');
  const points = concepts.flatMap((step) => (step.kind === 'concept' ? step.points : []));
  if (points.length) {
    sections.push({ id: 'notions', icon: '📖', title: 'Notions clés', items: points.slice(0, 7) });
    allTexts.push(...points);
    points.slice(0, 4).forEach((point, index) => {
      flashcards.push({
        id: `fc-concept-${index}`,
        icon: '📖',
        front: `Notion clé n°${index + 1} : de quoi parle-t-on ?`,
        back: point,
      });
    });
  }

  const exemples = lesson.steps.filter((step) => step.kind === 'exemple');
  const solutions = exemples.flatMap((step) => (step.kind === 'exemple' ? step.solution : []));
  if (solutions.length) {
    sections.push({ id: 'methode', icon: '🧭', title: 'Méthode en action', items: solutions.slice(0, 6) });
    allTexts.push(...solutions);
  }

  const pieges = lesson.steps.filter((step) => step.kind === 'piege');
  const piegeTexts = pieges.flatMap((step) => (step.kind === 'piege' ? [step.text] : []));
  if (piegeTexts.length) {
    sections.push({ id: 'pieges', icon: '⚠️', title: 'Pièges à éviter', items: piegeTexts });
    allTexts.push(...piegeTexts);
    piegeTexts.slice(0, 2).forEach((text, index) => {
      flashcards.push({
        id: `fc-piege-${index}`,
        icon: '⚠️',
        front: `Quel piège faut-il éviter ici ? (indice ${index + 1})`,
        back: text,
      });
    });
  }

  const exercices = lesson.steps.filter((step) => step.kind === 'exercice');
  exercices.forEach((step, index) => {
    if (step.kind !== 'exercice') return;
    allTexts.push(step.question.prompt, step.question.explanation);
    flashcards.push({
      id: `fc-exo-${index}`,
      icon: '✍️',
      front: step.question.prompt,
      back: `✅ ${answerLabel(step.question)} — ${step.question.explanation}`,
    });
  });

  const recap = lesson.steps.find((step) => step.kind === 'recap');
  if (recap && recap.kind === 'recap') {
    if (recap.chips.length) {
      sections.push({ id: 'retenir', icon: '🧠', title: 'À retenir', items: recap.chips });
      allTexts.push(...recap.chips);
    }
    if (recap.tip) {
      sections.push({ id: 'astuce', icon: '💡', title: 'Astuce du chef', items: [recap.tip] });
      allTexts.push(recap.tip);
    }
    flashcards.push({
      id: 'fc-recap',
      icon: '🧠',
      front: `Résume « ${lesson.topicName} » en une phrase.`,
      back: recap.tip || recap.chips.join(' · '),
    });
  }

  return { sections, formulas: extractFormulas(allTexts), flashcards };
}

/** Meilleur pourcentage de l'élève sur un sujet (null si jamais joué). */
export function bestQuizScore(attempts: QuizAttempt[], topicId: string): { best: number | null; count: number } {
  const mine = attempts.filter((attempt) => attempt.topicId === topicId && attempt.total > 0);
  if (!mine.length) return { best: null, count: 0 };
  const best = Math.max(...mine.map((attempt) => attempt.score / attempt.total));
  return { best: Math.round(best * 100), count: mine.length };
}

/** Fiche complète d'un sujet débloqué (ou `null` si sujet introuvable). */
export async function buildFiche(userId: string, topicId: string): Promise<Fiche | null> {
  const topic = findTopic(topicId);
  if (!topic) return null;
  const records = await listFicheRecords(userId);
  const record = records.find((entry) => entry.topicId === topicId);
  if (!record) return null;

  const ai = await readCachedAiLesson(topicId);
  const lesson = buildFicheLesson(topic, ai);
  const { sections, formulas, flashcards } = buildFicheContent(lesson);
  const attempts = await listAttempts(userId);
  const quiz = bestQuizScore(attempts, topicId);

  return {
    topicId: topic.id,
    topicName: topic.name,
    subjectId: topic.subjectId,
    subjectName: topic.subjectName,
    themeName: topic.themeName,
    levelName: topic.levelName,
    emoji: topic.emoji,
    color: topic.color,
    accent: topic.accent,
    difficulty: topic.difficulty,
    unlockedAt: record.unlockedAt,
    lessonScore: record.lessonScore,
    lessonTotal: record.lessonTotal,
    quizBest: quiz.best,
    quizAttempts: quiz.count,
    sections,
    formulas,
    flashcards,
  };
}

/** Résumé de toutes les fiches débloquées d'un compte (hub). */
export async function buildFicheSummaries(userId: string): Promise<FicheSummary[]> {
  const records = await listFicheRecords(userId);
  if (!records.length) return [];
  const attempts = await listAttempts(userId);
  const summaries: FicheSummary[] = [];

  for (const record of records) {
    const topic = findTopic(record.topicId);
    if (!topic) continue; // sujet retiré du catalogue : fiche invisible, pas d'erreur
    const ai = null; // le hub n'a pas besoin du contenu IA : léger et rapide
    const lesson = buildFicheLesson(topic, ai);
    const { sections, flashcards } = buildFicheContent(lesson);
    const quiz = bestQuizScore(attempts, topic.id);
    summaries.push({
      topicId: topic.id,
      topicName: topic.name,
      subjectId: topic.subjectId,
      subjectName: topic.subjectName,
      themeName: topic.themeName,
      emoji: topic.emoji,
      color: topic.color,
      unlockedAt: record.unlockedAt,
      lessonScore: record.lessonScore,
      lessonTotal: record.lessonTotal,
      quizBest: quiz.best,
      quizAttempts: quiz.count,
      cardCount: flashcards.length,
      sectionCount: sections.length,
    });
  }

  return summaries.sort((a, b) => (a.unlockedAt < b.unlockedAt ? 1 : -1));
}
