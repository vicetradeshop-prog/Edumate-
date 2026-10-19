/**
 * EduMate — Contrat des familles de générateurs de questions.
 *
 * Chaque famille sait :
 *  - produire des questions fraîches à la demande (variation infinie),
 *  - annoncer la taille de son vivier de questions (`pool`),
 *  - produire un lot unique et sans doublon pour une session de quiz.
 */
import type { Difficulty, Question } from '../../shared/types.js';
import type { Rng } from './lib.js';

export interface GeneratorContext {
  topicId: string;
  params: Record<string, unknown>;
  rng: Rng;
  difficulty: Difficulty;
  /** Nombre de questions demandées */
  count: number;
}

export interface QuestionFamily {
  id: string;
  /** Nom lisible, utilisé dans les statistiques internes */
  label: string;
  /**
   * Taille du vivier : nombre de questions distinctes raisonnablement
   * disponibles. 0 ou Infinity = génération infinie (algorithmique).
   */
  pool: number | ((params: Record<string, unknown>) => number);
  /** Fabrique une question. Retourne null si la tentative est invalide. */
  make(ctx: GeneratorContext): Question | null;
}

export type FamilyRegistry = Record<string, QuestionFamily>;
