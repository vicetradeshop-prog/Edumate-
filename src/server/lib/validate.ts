/**
 * EduMate — Validation des valeurs métier (partagée et testable).
 *
 * Ces fonctions ne dépendent d'Express : elles lèvent une erreur simple que
 * la couche HTTP traduit en réponse 400 compréhensible.
 */

import { EMAIL_MAX_LENGTH, isValidEmailValue, normalizeEmailValue } from '../../shared/email.js';
import { PASSWORD_MAX_LENGTH } from '../../shared/password.js';

export const LIMITS = {
  firstName: 40,
  lastName: 40,
  // Valeur partagée avec le client (src/shared/email.ts).
  email: EMAIL_MAX_LENGTH,
  // Valeur partagée avec le client : les deux builds refusent la même longueur.
  password: PASSWORD_MAX_LENGTH,
  school: 120,
  tagline: 120,
  title: 140,
  notes: 1000,
  message: 4000,
  text: 5000,
} as const;

/** Erreur de validation (traduite en HTTP 400 par la couche routes). */
export class ValidationError extends Error {
  field?: string;
  constructor(message: string, field?: string) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

/** Supprime les caractères de contrôle et normalise les espaces. */
export function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

/**
 * Adresse e-mail : règles définies UNE seule fois dans `src/shared/email.ts`,
 * réexportées ici pour conserver l'API historique du serveur.
 */
export function normalizeEmail(email: string): string {
  return normalizeEmailValue(email);
}

export function isValidEmail(value: string): boolean {
  return isValidEmailValue(value);
}

/**
 * Politique de mot de passe : définie UNE seule fois dans `src/shared/password.ts`
 * et réexportée ici, pour que le serveur et le client appliquent exactement les
 * mêmes règles (voir le commentaire du module partagé).
 */
export {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  isStrongPassword,
  passwordChecks,
  passwordIssues,
  passwordStrength,
} from '../../shared/password.js';

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_RE = /^\d{2}:\d{2}$/;

export function isValidDate(value: string): boolean {
  return DATE_RE.test(value) && !Number.isNaN(Date.parse(value));
}

export function isValidTime(value: string): boolean {
  if (!TIME_RE.test(value)) return false;
  const [hours, minutes] = value.split(':').map(Number);
  return hours <= 23 && minutes <= 59;
}
