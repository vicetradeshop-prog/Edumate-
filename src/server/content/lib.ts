/**
 * EduMate — Moteur de contenu pédagogique : utilitaires.
 *
 * Ces fonctions sont partagées par toutes les familles de générateurs de
 * questions. Elles garantissent un comportement déterministe (graine),
 * un formatage français correct et des QCM sans doublon.
 */
import type { Difficulty, Question } from '../../shared/types.js';
import { normalizeAnswer } from '../../shared/answers.js';

/*
 * Normalisation et comparaison des réponses ouvertes : implémentation unique
 * dans `src/shared/answers.ts`, partagée avec le client (les exercices de
 * leçons sont corrigés immédiatement côté navigateur et doivent appliquer la
 * MÊME règle que le serveur). Ré-exportées ici pour ne casser aucun import.
 */
export { normalizeAnswer, checkShortAnswer } from '../../shared/answers.js';

/* ------------------------------------------------------------------ */
/*  Générateur pseudo-aléatoire déterministe (mulberry32)              */
/* ------------------------------------------------------------------ */

export interface Rng {
  int(min: number, max: number): number;
  float(min: number, max: number, digits?: number): number;
  pick<T>(list: readonly T[]): T;
  pickMany<T>(list: readonly T[], n: number): T[];
  shuffle<T>(list: readonly T[]): T[];
  chance(probability: number): boolean;
  sign(): number;
}

export function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function createRng(seed: number | string): Rng {
  let a = typeof seed === 'string' ? hashString(seed) : seed >>> 0;
  const next = (): number => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (min: number, max: number): number => Math.floor(next() * (max - min + 1)) + min;

  const pick = <T,>(list: readonly T[]): T => list[Math.floor(next() * list.length)];

  const shuffle = <T,>(list: readonly T[]): T[] => {
    const arr = [...list];
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  return {
    int,
    float: (min, max, digits = 1) => Number((next() * (max - min) + min).toFixed(digits)),
    pick,
    pickMany: <T,>(list: readonly T[], n: number): T[] => shuffle(list).slice(0, n),
    shuffle,
    chance: (p) => next() < p,
    sign: () => (next() < 0.5 ? -1 : 1),
  };
}

/* ------------------------------------------------------------------ */
/*  Formatage                                                          */
/* ------------------------------------------------------------------ */

/** Écrit un nombre à la française (virgule décimale, espaces de milliers). */
export function fr(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return String(value);
  const fixed = Number(value.toFixed(digits + 2));
  const rounded = Number(fixed.toFixed(digits));
  return rounded.toLocaleString('fr-FR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Arrondi propre évitant les artefacts flottants (0.30000000000000004). */
export function round(value: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

export function gcd(a: number, b: number): number {
  const x = Math.abs(Math.trunc(a));
  const y = Math.abs(Math.trunc(b));
  return y === 0 ? x || 1 : gcd(y, x % y);
}

export function lcm(a: number, b: number): number {
  return Math.abs(a * b) / gcd(a, b);
}

export function simplifyFraction(n: number, d: number): [number, number] {
  const g = gcd(n, d);
  let nn = n / g;
  let dd = d / g;
  if (dd < 0) {
    nn = -nn;
    dd = -dd;
  }
  return [nn, dd];
}

export function fractionLatex(n: number, d: number): string {
  const [nn, dd] = simplifyFraction(n, d);
  if (dd === 1) return String(nn);
  const sign = nn < 0 ? '-' : '';
  return `${sign}$\\dfrac{${Math.abs(nn)}}{${dd}}$`;
}

/** Puissance en exposant unicode (pour les unités : m², m³, cm²). */
export function sup(n: number): string {
  const map: Record<string, string> = {
    '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
    '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻',
  };
  return String(n)
    .split('')
    .map((c) => map[c] ?? c)
    .join('');
}

/* ------------------------------------------------------------------ */
/*  Construction des questions                                         */
/* ------------------------------------------------------------------ */

let uid = 0;
const nextId = (topicId: string): string => {
  uid = (uid + 1) % 100000;
  return `${topicId}-${uid}-${Math.floor(Math.random() * 1e6).toString(36)}`;
};

export function resetIdCounter(): void {
  uid = 0;
}

export interface QcmInput {
  topicId: string;
  prompt: string;
  correct: string;
  distractors: string[];
  explanation: string;
  difficulty?: Difficulty;
  skill?: string;
  rng?: Rng;
}

/** Construit un QCM en mélangeant les propositions et en supprimant les doublons. */
export function qcm(input: QcmInput): Question | null {
  const { topicId, prompt, correct, distractors, explanation, difficulty = 'moyen', skill, rng } = input;
  const seen = new Set<string>();
  const clean: string[] = [];
  for (const raw of [correct, ...distractors]) {
    const value = String(raw ?? '').trim();
    const key = value.toLowerCase().replace(/\s+/g, ' ');
    if (!value || seen.has(key)) continue;
    seen.add(key);
    clean.push(value);
  }
  if (clean.length < 2) return null;
  const options = rng ? rng.shuffle(clean) : shuffleArray(clean);
  const answer = options.findIndex((o) => o === correct);
  if (answer < 0) return null;
  return {
    id: nextId(topicId),
    topicId,
    kind: 'qcm',
    prompt,
    options,
    answer,
    explanation,
    difficulty,
    skill,
  };
}

export function shuffleArray<T>(list: readonly T[]): T[] {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function trueFalse(topicId: string, prompt: string, truth: boolean, explanation: string, difficulty: Difficulty = 'facile', skill?: string): Question {
  return {
    id: nextId(topicId),
    topicId,
    kind: 'vrai-faux',
    prompt,
    options: ['Vrai', 'Faux'],
    answer: truth ? 0 : 1,
    truth,
    explanation,
    difficulty,
    skill,
  };
}

export function shortAnswer(
  topicId: string,
  prompt: string,
  accept: string[],
  explanation: string,
  difficulty: Difficulty = 'moyen',
  skill?: string,
): Question {
  return {
    id: nextId(topicId),
    topicId,
    kind: 'texte',
    prompt,
    accept: accept.map((a) => normalizeAnswer(a)),
    explanation,
    difficulty,
    skill,
  };
}

/** Génère des distracteurs numériques proches de la bonne réponse. */
export function numericDistractors(correct: number, rng: Rng, opts: { digits?: number; spread?: number; extras?: number[] } = {}): string[] {
  const { digits = 0, spread = 0.25, extras = [] } = opts;
  const out: string[] = [];
  const push = (v: number): void => {
    if (!Number.isFinite(v)) return;
    const s = fr(round(v, digits), digits);
    if (s !== fr(round(correct, digits), digits) && !out.includes(s)) out.push(s);
  };
  for (const e of extras) push(e);
  let guard = 0;
  while (out.length < 3 && guard < 40) {
    guard += 1;
    const delta = correct * spread * (rng.int(1, 4) / 4) * rng.sign();
    push(round(correct + (delta || rng.int(1, 5) * rng.sign()), digits));
  }
  return out.slice(0, 3);
}
