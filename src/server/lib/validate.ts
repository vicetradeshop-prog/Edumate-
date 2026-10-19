/**
 * EduMate — Validation des valeurs métier (partagée et testable).
 *
 * Ces fonctions ne dépendent d'Express : elles lèvent une erreur simple que
 * la couche HTTP traduit en réponse 400 compréhensible.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

export const LIMITS = {
  firstName: 40,
  lastName: 40,
  email: 160,
  password: 128,
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

export function normalizeEmail(email: string): string {
  return String(email ?? '').trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(normalizeEmail(value));
}

export function passwordIssues(value: string): string[] {
  const issues: string[] = [];
  if (typeof value !== 'string' || value.length < 8) issues.push('8 caractères minimum');
  else {
    if (!/[a-zA-Z]/.test(value)) issues.push('au moins une lettre');
    if (!/\d/.test(value)) issues.push('au moins un chiffre');
  }
  return issues;
}

export function isStrongPassword(value: unknown): boolean {
  return typeof value === 'string' && value.length <= LIMITS.password && passwordIssues(value).length === 0;
}

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
