/**
 * EduMate — Middlewares Express.
 *
 * Sécurité et robustesse : gestion d'erreurs homogène (messages lisibles,
 * jamais de trace technique exposée), limitation de débit en mémoire,
 * authentification par cookie httpOnly et en-tête CSRF.
 */
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { config } from '../lib/config.js';
import { verifyToken, type TokenPayload } from '../lib/auth.js';
import { findUserById } from '../lib/store.js';

/* ------------------------------------------------------------------ */
/*  Erreurs HTTP                                                       */
/* ------------------------------------------------------------------ */

export class HttpError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown): HttpError => new HttpError(400, 'bad_request', message, details);
export const unauthorized = (message = 'Vous devez être connecté pour accéder à cette ressource.'): HttpError => new HttpError(401, 'unauthorized', message);
export const forbidden = (message = 'Cette action ne vous est pas autorisée.'): HttpError => new HttpError(403, 'forbidden', message);
export const notFound = (message = 'Ressource introuvable.'): HttpError => new HttpError(404, 'not_found', message);
export const conflict = (message: string): HttpError => new HttpError(409, 'conflict', message);
export const serviceUnavailable = (message: string): HttpError => new HttpError(503, 'service_unavailable', message);

/** Enveloppe les gestionnaires asynchrones pour propager les erreurs. */
export function asyncHandler<T extends RequestHandler>(handler: T): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

/** Gestionnaire d'erreurs central : messages simples pour l'utilisateur. */
export function errorHandler(error: unknown, _req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(error);
    return;
  }
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.code, message: error.message, details: error.details });
    return;
  }

  const message = error instanceof Error ? error.message : String(error);
  const isAbort = /aborted|timeout|fetch failed/i.test(message);
  const payload = /body parser|json/i.test(message)
    ? { error: 'bad_request', message: 'La requête envoyée est invalide.' }
    : isAbort
      ? { error: 'timeout', message: 'Le service met trop de temps à répondre. Réessayez dans un instant.' }
      : { error: 'server_error', message: 'Une erreur inattendue est survenue. Réessayez dans un instant.' };

  if (!config.isProduction) {
    console.error('[EduMate] Erreur non gérée :', error);
  } else {
    console.error('[EduMate] Erreur non gérée :', message);
  }
  res.status(isAbort ? 504 : 500).json(payload);
}

export function notFoundHandler(req: Request, res: Response): void {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ error: 'not_found', message: 'Cette route d’API n’existe pas.' });
    return;
  }
  res.status(404).type('html').send('<h1>404</h1><p>Page introuvable.</p>');
}

/* ------------------------------------------------------------------ */
/*  Limitation de débit (mémoire, suffisante pour un seul process)      */
/* ------------------------------------------------------------------ */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

function sweep(now: number): void {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt < now) buckets.delete(key);
  }
}

export function rateLimit(options: { max: number; windowMs?: number; name?: string } = { max: 240 }): RequestHandler {
  const windowMs = options.windowMs ?? config.security.rateLimitWindowMs;
  const name = options.name ?? 'global';
  return (req, res, next) => {
    const now = Date.now();
    sweep(now);
    const key = `${name}:${req.ip ?? 'inconnu'}`;
    const bucket = buckets.get(key) ?? { count: 0, resetAt: now + windowMs };
    if (bucket.resetAt < now) {
      bucket.count = 0;
      bucket.resetAt = now + windowMs;
    }
    bucket.count += 1;
    buckets.set(key, bucket);
    res.setHeader('RateLimit-Limit', String(options.max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, options.max - bucket.count)));
    if (bucket.count > options.max) {
      res.status(429).json({
        error: 'too_many_requests',
        message: 'Trop de requêtes en peu de temps. Patientez une minute puis réessayez.',
      });
      return;
    }
    next();
  };
}

/* ------------------------------------------------------------------ */
/*  Authentification                                                   */
/* ------------------------------------------------------------------ */

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: TokenPayload;
    }
  }
}

export function readToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return header.slice(7).trim();
  const cookie = req.cookies?.[config.session.cookieName];
  if (typeof cookie === 'string' && cookie) return cookie;
  return null;
}

/** Rattache l'utilisateur connecté à la requête, sans la bloquer. */
export function attachUser(): RequestHandler {
  return (req, _res, next) => {
    const token = readToken(req);
    if (token) {
      const payload = verifyToken(token);
      if (payload) req.auth = payload;
    }
    next();
  };
}

/** Exige une session valide. */
export function requireAuth(): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) {
      next(unauthorized());
      return;
    }
    next();
  };
}

/**
 * Exige un compte administrateur.
 *
 * Le rôle est relu en base à chaque appel (et non pris dans le jeton) :
 *   - une promotion via ADMIN_EMAIL prend effet immédiatement,
 *   - une révocation coupe l'accès sans attendre l'expiration du jeton.
 * En cas d'indisponibilité de la base, on retombe sur le rôle du jeton pour ne
 * pas bloquer l'administration plus que nécessaire.
 */
export function requireAdmin(): RequestHandler {
  return async (req, _res, next) => {
    if (!req.auth) {
      next(unauthorized());
      return;
    }
    let role = req.auth.role;
    try {
      const fresh = await findUserById(req.auth.sub);
      if (!fresh) {
        next(unauthorized('Session expirée : reconnecte-toi.'));
        return;
      }
      role = fresh.role;
    } catch (error) {
      console.warn(`[EduMate] Contrôle administrateur dégradé (base injoignable) : ${(error as Error).message}`);
    }
    if (role !== 'admin') {
      next(forbidden('Cette section est réservée aux administrateurs.'));
      return;
    }
    next();
  };
}

/**
 * Vérifie l'en-tête anti-CSRF pour les requêtes mutatives.
 *
 * Le jeton est délivré par /api/auth/session et stocké dans un cookie lisible
 * par le script (technique de « double soumission de cookie »).
 *
 * Deux cas où le contrôle est inutile :
 *   - méthodes sûres (GET/HEAD/OPTIONS),
 *   - authentification par en-tête `Authorization: Bearer` : un site tiers ne
 *     peut pas forger cet en-tête, le risque CSRF n'existe donc pas.
 */
export function requireCsrf(): RequestHandler {
  return (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      next();
      return;
    }
    const authorization = req.headers.authorization;
    if (typeof authorization === 'string' && authorization.startsWith('Bearer ') && authorization.length > 10) {
      next();
      return;
    }
    const sessionCookie = req.cookies?.[config.session.cookieName];
    if (!sessionCookie) {
      // Aucune session cookie en jeu : rien à protéger côté CSRF.
      next();
      return;
    }
    const cookie = req.cookies?.edumate_csrf;
    const header = req.headers['x-csrf-token'];
    if (!cookie || typeof header !== 'string' || header.length < 16 || header !== cookie) {
      res.status(403).json({
        error: 'csrf',
        message: 'Votre session a expiré. Rechargez la page puis réessayez.',
      });
      return;
    }
    next();
  };
}

/* ------------------------------------------------------------------ */
/*  En-têtes de sécurité                                               */
/* ------------------------------------------------------------------ */

export function securityHeaders(): RequestHandler {
  return (_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        /*
         * `https:` ajouté pour les logos de webradios (favicon renvoyé par
         * l'annuaire Radio Browser, hébergé chez chaque station).
         */
        "img-src 'self' data: blob: https:",
        "font-src 'self' data:",
        /*
         * `https:` est INDISPENSABLE à l'outil Musique : les webradios diffusent
         * depuis leurs propres serveurs. Sans cet élargissement, le navigateur
         * bloque silencieusement le flux et le lecteur reste muet.
         *
         * Deux garde-fous compensent cet assouplissement :
         *   - seul `https:` est autorisé, jamais `http:` ni les schémas exotiques
         *     (une page HTTPS refuserait de toute façon le « mixed content ») ;
         *   - les URL ne proviennent que du serveur, qui filtre l'annuaire
         *     (codec audio, débit minimal, stations cassées écartées). L'élève
         *     ne peut pas faire lire une URL arbitraire : `connect-src` reste
         *     strictement `'self'`, donc aucune requête réseau directe du
         *     navigateur vers un tiers n'est possible hors média.
         */
        "media-src 'self' blob: data: https:",
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "object-src 'none'",
      ].join('; '),
    );
    next();
  };
}
