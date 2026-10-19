/**
 * EduMate — Registre central du contenu pédagogique.
 *
 * C'est le point d'entrée unique utilisé par :
 *  - le script de génération du catalogue (`npm run build:data`),
 *  - l'API (`/api/generate`, `/api/grade`, `/api/search`…) qui fabrique les sessions de quiz.
 *
 * Ajouter une nouvelle famille de questions = 1 import + 1 ligne dans FAMILIES.
 * Ajouter un nouveau sujet de quiz       = 1 ligne dans topics.ts.
 */
import type { Question } from '../../shared/types.js';
import type { QuestionFamily } from './types.js';
import { createRng, resetIdCounter, shuffleArray, type Rng } from './lib.js';
import { MATH_FAMILIES } from './families/math.js';
import { PHYSICS_FAMILIES } from './families/physics.js';
import { LANGUAGE_FAMILIES } from './families/languages.js';
import { KNOWLEDGE_FAMILIES } from './families/knowledge.js';
import { BANK_FAMILIES, BANK_SIZES, loadBanks } from './banks.js';

export const FAMILIES: Record<string, QuestionFamily> = {};

for (const family of [...MATH_FAMILIES, ...PHYSICS_FAMILIES, ...LANGUAGE_FAMILIES, ...KNOWLEDGE_FAMILIES, ...BANK_FAMILIES]) {
  if (FAMILIES[family.id]) {
    // Une famille dupliquée est une erreur de configuration du contenu.
    throw new Error(`Famille de questions en double : ${family.id}`);
  }
  FAMILIES[family.id] = family;
}

export type { QuestionFamily, GeneratorContext } from './types.js';
export { FAMILIES as FAMILY_REGISTRY };

/* ------------------------------------------------------------------ */
/*  Banques de questions rédigées                                      */
/* ------------------------------------------------------------------ */

/** Retourne la taille du vivier d'une famille (0 = infinie). */
export function familyPool(source: string, params: Record<string, unknown> = {}): number {
  const family = FAMILIES[source];
  if (!family) return 0;
  if (typeof family.pool === 'function') {
    try {
      const value = family.pool(params);
      return Number.isFinite(value) ? Math.round(value) : 9999;
    } catch {
      return 0;
    }
  }
  return Number.isFinite(family.pool) ? family.pool : 9999;
}

export { BANK_SIZES, loadBanks };

/* ------------------------------------------------------------------ */
/*  Fabrique de questions                                              */
/* ------------------------------------------------------------------ */

export interface BuildOptions {
  topicId: string;
  source: string;
  params?: Record<string, unknown>;
  difficulty?: Question['difficulty'];
  count?: number;
  seed?: string | number;
}

/**
 * Fabrique un lot de questions uniques pour un sujet de quiz.
 * Retente jusqu'à 12 fois par question manquante afin d'écarter les
 * tentatives invalides (distracteurs en doublon, données manquantes…).
 */
export function buildQuestions(options: BuildOptions): Question[] {
  const { topicId, source, params = {}, difficulty = 'moyen', count = 10, seed } = options;
  const family = FAMILIES[source];
  if (!family) throw new Error(`Famille de questions introuvable : ${source}`);

  const rng: Rng = createRng(seed ?? `${topicId}-${Date.now()}-${Math.floor(Math.random() * 1e9)}`);
  const questions: Question[] = [];
  const seen = new Set<string>();
  let attempts = 0;
  const maxAttempts = count * 12 + 20;

  while (questions.length < count && attempts < maxAttempts) {
    attempts += 1;
    let question: Question | null = null;
    try {
      question = family.make({ topicId, params, rng, difficulty, count });
    } catch {
      question = null;
    }
    if (!question) continue;

    // Dédoublonnage sur l'énoncé + les propositions
    const fingerprint = `${question.prompt}|${(question.options ?? []).slice().sort().join('|')}`;
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    questions.push(question);
  }

  resetIdCounter();
  return questions.map((q, index) => ({ ...q, id: `${topicId}-${index + 1}` }));
}

/**
 * Construit une session de quiz complète : questions mélangées, avec une
 * durée conseillée calculée à partir du nombre et de la difficulté.
 */
export function buildQuiz(options: BuildOptions & { durationPerQuestion?: number }): { questions: Question[]; durationSec: number } {
  const count = Math.max(3, Math.min(30, options.count ?? 10));
  const questions = buildQuestions({ ...options, count });
  const perQuestion = options.durationPerQuestion ?? 45;
  const factor = options.difficulty === 'facile' ? 0.8 : options.difficulty === 'difficile' ? 1.3 : 1;
  return { questions, durationSec: Math.max(120, Math.round(questions.length * perQuestion * factor)) };
}

/**
 * Mélange les propositions d'une question (utile pour les banques statiques
 * dont la bonne réponse est toujours en première position dans les données).
 */
export function shuffleQuestionOptions(question: Question, rng?: Rng): Question {
  if (!question.options || question.options.length < 2) return question;
  const correctText = question.answer !== undefined ? question.options[question.answer] : undefined;
  const options = rng ? rng.shuffle(question.options) : shuffleArray(question.options);
  const answer = correctText !== undefined ? options.indexOf(correctText) : question.answer;
  return { ...question, options, answer };
}

export const FAMILY_COUNT = Object.keys(FAMILIES).length;
