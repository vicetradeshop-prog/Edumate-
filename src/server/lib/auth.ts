/**
 * EduMate — Sécurité : hachage des mots de passe et jetons de session.
 *
 * Choix volontaires :
 *   - `scrypt` de la bibliothèque standard Node (robuste, aucune dépendance),
 *   - jetons HS256 signés à la main (JWT standard, zéro dépendance externe),
 *   - comparaison en temps constant pour éviter les attaques temporelles.
 *
 * Aucun mot de passe n'est jamais stocké ni renvoyé en clair.
 */
import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { config } from './config.js';

/* ------------------------------------------------------------------ */
/*  Mots de passe                                                      */
/* ------------------------------------------------------------------ */

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password.normalize('NFKC'), salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, expected] = parts;
  try {
    const derived = scryptSync(password.normalize('NFKC'), salt, 64);
    const expectedBuffer = Buffer.from(expected, 'hex');
    if (derived.length !== expectedBuffer.length) return false;
    return timingSafeEqual(derived, expectedBuffer);
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  Jetons de session (JWT HS256)                                      */
/* ------------------------------------------------------------------ */

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function sign(data: string): string {
  return createHmac('sha256', config.session.secret).update(data).digest('base64url');
}

export interface TokenPayload {
  sub: string;
  email: string;
  role: 'eleve' | 'admin';
  demo?: boolean;
  iat: number;
  exp: number;
}

export function createToken(payload: Omit<TokenPayload, 'iat' | 'exp'>): string {
  const now = Math.floor(Date.now() / 1000);
  const body: TokenPayload = { ...payload, iat: now, exp: now + config.session.maxAgeSec };
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const claims = base64url(JSON.stringify(body));
  return `${header}.${claims}.${sign(`${header}.${claims}`)}`;
}

export function verifyToken(token: string): TokenPayload | null {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, claims, signature] = parts;
  const expected = sign(`${header}.${claims}`);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(claims, 'base64url').toString('utf-8')) as TokenPayload;
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (!payload.sub) return null;
    return payload;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Jeton anti-CSRF (double soumission de cookie)                      */
/* ------------------------------------------------------------------ */

export function createCsrfToken(): string {
  return randomBytes(24).toString('hex');
}

export function newId(): string {
  return randomUUID();
}
