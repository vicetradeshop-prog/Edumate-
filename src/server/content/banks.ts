/**
 * EduMate — Banques de questions rédigées à la main.
 *
 * Les banques vivent dans `data/quiz/*.json`, séparées de l'interface et du
 * code : ajouter des questions ne demande aucune modification de composant.
 *
 * Format d'un fichier de banque :
 * {
 *   "banks": [
 *     { "topic": "francais-seconde-methodologie-commentaire",
 *       "questions": [
 *         { "prompt": "...", "options": ["bonne réponse", "distracteur", ...],
 *           "answer": 0, "explanation": "...", "skill": "...", "difficulty": "moyen" }
 *       ] }
 *   ]
 * }
 *
 * Chaque banque est exposée comme une famille de générateurs (`bank:<topic>`),
 * ce qui la rend interchangeable avec les familles algorithmiques.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Difficulty, Question } from '../../shared/types.js';
import type { QuestionFamily } from './types.js';
import { qcm, trueFalse, shortAnswer } from './lib.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export interface RawBankQuestion {
  prompt: string;
  options?: string[];
  answer?: number;
  accept?: string[];
  truth?: boolean;
  explanation: string;
  skill?: string;
  difficulty?: Difficulty;
}

export interface RawBank {
  topic: string;
  questions: RawBankQuestion[];
}

/** topic → questions */
export const BANKS = new Map<string, RawBankQuestion[]>();
export const BANK_SIZES = new Map<string, number>();

let loaded = false;

function bankDirectories(): string[] {
  const candidates = [
    path.resolve(dirname, '../../../data/quiz'),
    path.resolve(dirname, '../../data/quiz'),
    path.resolve(process.cwd(), 'data/quiz'),
  ];
  return candidates.filter((dir) => existsSync(dir));
}

/** Charge (une seule fois) toutes les banques JSON présentes dans data/quiz. */
export function loadBanks(): Map<string, RawBankQuestion[]> {
  if (loaded) return BANKS;
  loaded = true;
  for (const dir of bankDirectories()) {
    let files: string[] = [];
    try {
      files = readdirSync(dir).filter((f) => f.endsWith('.json'));
    } catch {
      continue;
    }
    for (const file of files) {
      try {
        const raw = readFileSync(path.join(dir, file), 'utf-8');
        const parsed = JSON.parse(raw) as { banks?: RawBank[] };
        for (const bank of parsed.banks ?? []) {
          if (!bank?.topic || !Array.isArray(bank.questions) || bank.questions.length === 0) continue;
          BANKS.set(bank.topic, bank.questions);
          BANK_SIZES.set(bank.topic, bank.questions.length);
        }
      } catch (error) {
        // Une banque illisible ne doit jamais casser le serveur : on la signale.
        console.warn(`[EduMate] Banque illisible ignorée : ${file}`, (error as Error).message);
      }
    }
  }
  return BANKS;
}

/** Crée la famille de générateurs associée à une banque de questions. */
function bankFamily(topicId: string, questions: RawBankQuestion[]): QuestionFamily {
  return {
    id: `bank:${topicId}`,
    label: `Banque — ${topicId}`,
    pool: questions.length,
    make(ctx) {
      const { rng } = ctx;
      const raw = rng.pick(questions);
      if (raw.options && raw.options.length >= 2 && raw.answer !== undefined) {
        const correct = raw.options[raw.answer];
        const distractors = raw.options.filter((_, i) => i !== raw.answer);
        return qcm({
          topicId,
          prompt: raw.prompt,
          correct,
          distractors,
          explanation: raw.explanation,
          difficulty: raw.difficulty ?? 'moyen',
          skill: raw.skill,
          rng,
        });
      }
      if (raw.truth !== undefined) {
        return trueFalse(topicId, raw.prompt, raw.truth, raw.explanation, raw.difficulty ?? 'facile', raw.skill);
      }
      if (raw.accept && raw.accept.length) {
        return shortAnswer(topicId, raw.prompt, raw.accept, raw.explanation, raw.difficulty ?? 'moyen', raw.skill);
      }
      return null;
    },
  };
}

let families: QuestionFamily[] | null = null;

/** Familles issues des banques (chargées paresseusement). */
export function getBankFamilies(): QuestionFamily[] {
  if (families) return families;
  loadBanks();
  families = [...BANKS.entries()].map(([topicId, questions]) => bankFamily(topicId, questions));
  return families;
}

export const BANK_FAMILIES: QuestionFamily[] = getBankFamilies();
