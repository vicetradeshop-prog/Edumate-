/**
 * EduMate — Construction des révisions interactives de quiz.
 *
 * La page « Révision du quiz » rejoue le corrigé d'un essai réel, question par
 * question, avec un exercice de rattrapage après chaque erreur. Pour retrouver
 * EXACTEMENT les questions jouées, l'essai doit avoir conservé sa **graine** :
 * les questions sont alors régénérées à l'identique (génération déterministe).
 *
 * Repli « entraînement » : essai trop ancien (pas de graine), catalogue
 * régénéré entre-temps, ou aucun essai du tout → on génère une session neuve
 * que l'élève traite comme des exercices de révision classiques. La page reste
 * toujours jouable : jamais d'écran vide ni d'erreur.
 */
import type {
  CatalogTopic,
  LessonExercise,
  Question,
  QuizAttempt,
  RevisionPayload,
  RevisionQuestion,
} from '../../shared/types.js';
import { buildQuiz } from '../content/index.js';
import { toExercise } from '../content/lessons.js';

/** Nombre de questions d'une session d'entraînement. */
export const TRAINING_COUNT = 6;

/** Nombre maximal d'exercices de rattrapage générés par révision. */
export const MAX_REMEDIATION = 8;

/** Mêmes paramètres de régénération que `POST /api/grade` (quiz.ts). */
function regenerate(topic: CatalogTopic, seed: number, count: number): Question[] {
  return buildQuiz({
    topicId: topic.id,
    source: topic.source,
    params: topic.params ?? {},
    difficulty: topic.difficulty,
    count,
    seed: `${topic.id}#${seed}`,
  }).questions;
}

/**
 * Régénère les questions d'un essai enregistré.
 * Retourne `null` si la reconstruction n'est pas fiable (graine absente,
 * catalogue modifié depuis, réponses incohérentes) : l'appelant bascule alors
 * en mode « entraînement ».
 */
export function rebuildAttemptQuestions(topic: CatalogTopic, attempt: QuizAttempt): Question[] | null {
  const seed = attempt.seed;
  if (typeof seed !== 'number' || !Number.isFinite(seed) || seed < 0) return null;

  const count = Math.max(3, Math.min(30, attempt.total || 10));
  let questions: Question[];
  try {
    questions = regenerate(topic, Math.trunc(seed), count);
  } catch {
    return null;
  }

  // Le nombre de questions doit correspondre à l'essai enregistré, et chaque
  // réponse doit retrouver SA question : sinon le catalogue a changé depuis.
  if (questions.length !== attempt.total) return null;
  const answers = new Map(attempt.answers.map((entry) => [entry.questionId, entry]));
  for (const question of questions) {
    if (!answers.has(question.id)) return null;
  }
  return questions;
}

/**
 * Génère un exercice de rattrapage par erreur, dans la même famille de
 * questions. Les questions déjà jouées (mêmes énoncés) sont écartées, et un
 * même exercice n'est jamais proposé deux fois.
 */
export function buildRemediation(
  topic: CatalogTopic,
  missed: Question[],
  playedPrompts: Set<string>,
  seed: number,
): Map<string, LessonExercise> {
  const result = new Map<string, LessonExercise>();
  if (!missed.length) return result;

  // Un vivier double : assez de matière pour éviter les doublons d'énoncés.
  let pool: Question[] = [];
  try {
    pool = regenerate(topic, seed + 7919, Math.min(30, missed.length * 2 + 2));
  } catch {
    return result;
  }

  const used = new Set<string>();
  let cursor = 0;
  for (const question of missed.slice(0, MAX_REMEDIATION)) {
    while (cursor < pool.length) {
      const candidate = pool[cursor];
      cursor += 1;
      if (!candidate) continue;
      if (playedPrompts.has(candidate.prompt) || used.has(candidate.prompt)) continue;
      used.add(candidate.prompt);
      result.set(question.id, toExercise(candidate, `rem-${question.id}`));
      break;
    }
  }
  return result;
}

export interface BuildRevisionOptions {
  topic: CatalogTopic;
  /** Essai à rejouer (le plus récent du sujet, ou celui demandé). */
  attempt?: QuizAttempt | null;
  /** Graine de la session d'entraînement (mode repli). */
  seed?: number;
}

/** Construit la charge complète de la page de révision. */
export function buildRevisionPayload(options: BuildRevisionOptions): RevisionPayload {
  const { topic, attempt } = options;
  const base = {
    topicId: topic.id,
    topicName: topic.name,
    subjectName: topic.subjectName,
    themeName: topic.themeName,
    emoji: topic.emoji,
    color: topic.color,
    accent: topic.accent,
  };

  const rebuilt = attempt ? rebuildAttemptQuestions(topic, attempt) : null;

  /* --------------------- Mode « quiz » : essai rejouable --------------------- */
  if (attempt && rebuilt) {
    const answers = new Map(attempt.answers.map((entry) => [entry.questionId, entry]));
    const missed = rebuilt.filter((question) => !answers.get(question.id)?.correct);
    const remediation = buildRemediation(
      topic,
      missed,
      new Set(rebuilt.map((question) => question.prompt)),
      Math.trunc(attempt.seed ?? 0),
    );

    const items: RevisionQuestion[] = rebuilt.map((question) => {
      const entry = answers.get(question.id);
      const correct = Boolean(entry?.correct);
      return {
        id: question.id,
        kind: question.kind,
        prompt: question.prompt,
        options: question.options ?? [],
        answer: question.kind === 'texte' ? null : (question.answer ?? null),
        accept: question.kind === 'texte' ? (question.accept ?? []) : null,
        given: entry && (typeof entry.given === 'string' || typeof entry.given === 'number') ? entry.given : null,
        correct,
        explanation: question.explanation ?? '',
        skill: question.skill ?? null,
        remediation: correct ? null : (remediation.get(question.id) ?? null),
      };
    });

    return {
      ...base,
      mode: 'quiz',
      attempt: {
        id: attempt.id,
        score: attempt.score,
        total: attempt.total,
        percent: attempt.total ? Math.round((attempt.score / attempt.total) * 100) : 0,
        createdAt: attempt.createdAt,
      },
      items,
      seed: Math.trunc(attempt.seed ?? 0),
    };
  }

  /* ------------------- Mode « entraînement » : session neuve ------------------ */
  const seed = Number.isInteger(options.seed) && Number.isFinite(options.seed)
    ? Math.abs(Math.trunc(options.seed as number)) % 1_000_000
    : Math.floor(Math.random() * 1_000_000);

  let questions: Question[] = [];
  try {
    questions = regenerate(topic, seed, TRAINING_COUNT);
  } catch {
    questions = [];
  }

  return {
    ...base,
    mode: 'entrainement',
    attempt: null,
    items: questions.map((question) => ({
      id: question.id,
      kind: question.kind,
      prompt: question.prompt,
      options: question.options ?? [],
      answer: question.kind === 'texte' ? null : (question.answer ?? null),
      accept: question.kind === 'texte' ? (question.accept ?? []) : null,
      given: null,
      correct: null,
      explanation: question.explanation ?? '',
      skill: question.skill ?? null,
      remediation: null,
    })),
    seed,
  };
}
