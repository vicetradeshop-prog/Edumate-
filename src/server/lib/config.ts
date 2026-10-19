/**
 * EduMate — Configuration centralisée.
 *
 * Toutes les valeurs sensibles proviennent EXCLUSIVEMENT des variables
 * d'environnement : AUCUNE clé n'est jamais codée en dur dans le dépôt.
 * Le fichier `.env.example` documente l'ensemble des variables attendues.
 *
 * ⚠️ Une clé d'API écrite dans le code source est définitivement compromise :
 *    elle part sur GitHub, où « Push Protection » bloque le push (erreur GH013),
 *    et elle reste lisible dans l'historique git même après suppression.
 *    La clé de l'assistant se configure donc uniquement via :
 *      - `.env` en local (fichier ignoré par git),
 *      - Render → Environment → AI_API_KEY en production.
 */


function bool(value: string | undefined, fallback = false): boolean {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function int(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Convertit une durée lisible ("7d", "12h", "30m") en secondes. */
function durationToSeconds(value: string | undefined, fallbackSec: number): number {
  if (!value) return fallbackSec;
  const match = value.trim().match(/^(\d+)\s*([smhd])$/i);
  if (!match) return fallbackSec;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const factors: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return amount * (factors[unit] ?? 1);
}

/* ------------------------------------------------------------------ */
/*  Assistant IA : fournisseur déduit du format de la clé              */
/* ------------------------------------------------------------------ */

/** Fournisseurs reconnus (tous exposent une API compatible OpenAI). */
export type AiProviderId = 'none' | 'openai' | 'groq' | 'mistral' | 'xai';

/** Clé lue une seule fois, jamais présente dans le dépôt. */
const aiApiKey = (process.env.AI_API_KEY ?? '').trim();

/**
 * Détermine le fournisseur d'IA à utiliser.
 *
 * `AI_PROVIDER` gagne toujours. S'il est absent ou vide, le fournisseur est
 * déduit du FORMAT de la clé : cela évite de retomber en mode « none » après
 * un copier-coller de `.env` incomplet, sans pour autant stocker la moindre
 * clé dans le code. Sans clé du tout, le tuteur intégré hors-ligne prend le
 * relais et l'application reste entièrement fonctionnelle.
 */
function inferAiProvider(key: string): AiProviderId {
  const explicit = (process.env.AI_PROVIDER ?? '').trim().toLowerCase();
  const known: AiProviderId[] = ['openai', 'groq', 'mistral', 'xai'];
  if (explicit === 'none' || explicit === '') {
    if (explicit === 'none') return 'none';
  } else if (known.includes(explicit as AiProviderId)) {
    return explicit as AiProviderId;
  } else if (explicit) {
    // Alias courant : « grok » désigne le fournisseur xAI.
    if (explicit === 'grok') return 'xai';
    console.warn(
      `[EduMate] AI_PROVIDER=« ${explicit} » est inconnu (openai, groq, mistral, xai, none) : valeur ignorée.`,
    );
  }
  if (!key) return 'none';
  if (key.startsWith('gsk_')) return 'groq';
  if (key.startsWith('xai-')) return 'xai';
  if (key.startsWith('sk-')) return 'openai';
  return 'openai';
}

const aiProvider = inferAiProvider(aiApiKey);

const nodeEnv = process.env.NODE_ENV ?? 'development';
const isProduction = nodeEnv === 'production';

export const config = {
  env: nodeEnv,
  isProduction,
  port: int(process.env.PORT, 8787),
  appUrl: process.env.APP_URL ?? (isProduction ? '' : 'http://localhost:5173'),

  session: {
    secret: process.env.SESSION_SECRET ?? 'edumate-dev-secret-a-changer-en-production',
    maxAgeSec: durationToSeconds(process.env.SESSION_MAX_AGE, 7 * 86400),
    cookieName: 'edumate_session',
    secure: isProduction,
  },

  database: {
    upstashUrl: process.env.UPSTASH_REDIS_REST_URL ?? '',
    upstashToken: process.env.UPSTASH_REDIS_REST_TOKEN ?? '',
    keyPrefix: process.env.UPSTASH_KEY_PREFIX ?? 'edumate',
    fallback: (process.env.FALLBACK_STORAGE ?? 'memory') as 'memory' | 'file',
    fileDir: process.env.STORAGE_FILE_DIR ?? './data/local',
  },

  ai: {
    provider: aiProvider,
    apiKey: aiApiKey,
    model: process.env.AI_MODEL ?? '',
    baseUrl: process.env.AI_BASE_URL ?? '',
    maxTokens: int(process.env.AI_MAX_TOKENS, 900),
  },

  /*
   * Musique recommandée hébergée PAR L'ÉLÈVE (s'il en détient les droits) :
   * URL directe de streaming (https, CORS autorisé) servie au client.
   * Sans valeur, le site propose le dépôt du fichier dans public/music/.
   */
  music: {
    recommendedUrl: (process.env.RECOMMENDED_MUSIC_URL ?? '').trim(),
  },

  services: {
    translateProvider: process.env.TRANSLATE_PROVIDER ?? 'mymemory',
    schoolsProvider: process.env.SCHOOLS_PROVIDER ?? 'dataeducation',
    requestTimeoutMs: int(process.env.EXTERNAL_TIMEOUT_MS, 9000),
  },

  security: {
    /**
     * Compte de démonstration partagé (« Camille »).
     *
     * DÉSACTIVÉ PAR DÉFAUT : un compte partagé anonyme n'a pas sa place sur une
     * instance réelle (progression mélangée entre visiteurs, données visibles
     * par tous, surface d'abus). Il reste disponible pour une démo ponctuelle
     * en posant explicitement ALLOW_DEMO_ACCOUNT=true.
     */
    allowDemoAccount: bool(process.env.ALLOW_DEMO_ACCOUNT, false),
    /**
     * Adresses e-mail autorisées à administrer la plateforme, séparées par des
     * virgules (ADMIN_EMAIL). Indépendamment de cette liste, le tout premier
     * compte créé sur une base vide devient administrateur : sans cela, la
     * section Administration serait inaccessible à jamais.
     */
    adminEmails: (process.env.ADMIN_EMAIL ?? '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
    rateLimitWindowMs: 60_000,
    // Valeurs volontairement larges : un établissement scolaire partage souvent
    // une seule adresse IP publique derrière son NAT.
    rateLimitMax: int(process.env.RATE_LIMIT_MAX, 900),
    authRateLimitMax: int(process.env.AUTH_RATE_LIMIT_MAX, 90),
  },
} as const;

export type AppConfig = typeof config;

/** Renvo true si la base Upstash est correctement configurée. */
export function hasUpstash(): boolean {
  return Boolean(config.database.upstashUrl && config.database.upstashToken);
}

/** Renvoie true si l'adresse e-mail figure parmi les administrateurs déclarés. */
export function isAdminEmail(email: string | undefined): boolean {
  return Boolean(email) && config.security.adminEmails.includes(String(email).trim().toLowerCase());
}

/** Renvoie true si un fournisseur d'IA est utilisable. */
export function hasAiProvider(): boolean {
  return config.ai.provider !== 'none' && Boolean(config.ai.apiKey);
}
