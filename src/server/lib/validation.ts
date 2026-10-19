/**
 * EduMate — Validation des entrées HTTP (défense en profondeur).
 *
 * Couche fine au-dessus de `validate.ts` : chaque donnée reçue du client est
 * contrôlée (type, longueur, format, valeurs autorisées) puis transformée en
 * erreur HTTP 400 explicite et compréhensible par l'élève.
 */
import { badRequest } from './middleware.js';
import {
  LIMITS as LIMITS_CORE,
  ValidationError,
  cleanText as cleanTextCore,
  isValidDate,
  isValidEmail,
  isValidTime,
  normalizeEmail as normalizeEmailCore,
  passwordIssues as passwordIssuesCore,
} from './validate.js';

export const LIMITS = LIMITS_CORE;
export const cleanText = cleanTextCore;
export const normalizeEmail = normalizeEmailCore;
export const passwordIssues = passwordIssuesCore;

export function requireString(value: unknown, field: string, opts: { min?: number; max?: number } = {}): string {
  const text = cleanText(value, opts.max ?? 500);
  const min = opts.min ?? 1;
  if (text.length < min) throw badRequest(`Le champ « ${field} » est requis.`, { field });
  return text;
}

export function optionalString(value: unknown, max: number): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const text = cleanText(value, max);
  return text.length ? text : undefined;
}

export function requireEmail(value: unknown): string {
  const email = cleanText(value, LIMITS.email);
  if (!isValidEmail(email)) throw badRequest('L’adresse e-mail n’est pas valide.', { field: 'email' });
  return normalizeEmail(email);
}

export function requirePassword(value: unknown): string {
  if (typeof value !== 'string') throw badRequest('Le mot de passe est requis.', { field: 'password' });
  if (value.length < 8) throw badRequest('Le mot de passe doit contenir au moins 8 caractères.', { field: 'password' });
  if (value.length > LIMITS.password) throw badRequest('Le mot de passe est trop long.', { field: 'password' });
  const issues = passwordIssues(value);
  if (issues.length) {
    throw badRequest(`Le mot de passe doit contenir : ${issues.join(', ')}.`, { field: 'password' });
  }
  return value;
}


export function optionalInt(value: unknown, min: number, max: number): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

export function optionalEnum<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  if (typeof value !== 'string') return undefined;
  return allowed.includes(value as T) ? (value as T) : undefined;
}

export function optionalStringArray(value: unknown, maxLength: number, itemMax = 60): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, maxLength)
    .map((item) => cleanText(item, itemMax))
    .filter((item) => item.length > 0);
}

export function requireDate(value: unknown): string {
  const text = cleanText(value, 10);
  if (!isValidDate(text)) {
    throw badRequest('La date doit être au format AAAA-MM-JJ.', { field: 'date' });
  }
  return text;
}

export function optionalTime(value: unknown): string | undefined {
  const text = cleanText(value, 5);
  if (!text) return undefined;
  return isValidTime(text) ? text : undefined;
}

/** Force un entier dans une plage, sinon erreur 400 explicite. */
export function requireIntInRange(value: unknown, field: string, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw badRequest(`Le champ « ${field} » doit être un nombre.`, { field });
  const bounded = Math.trunc(parsed);
  if (bounded < min || bounded > max) {
    throw badRequest(`Le champ « ${field} » doit être compris entre ${min} et ${max}.`, { field });
  }
  return bounded;
}
