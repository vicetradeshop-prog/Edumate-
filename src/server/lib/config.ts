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

/* ------------------------------------------------------------------ */
/*  E-mails : fournisseur validé dès la lecture de l'environnement      */
/* ------------------------------------------------------------------ */

/**
 * Valeurs acceptées pour `MAIL_PROVIDER`.
 *
 * `auto` (défaut, variable vide) laisse `lib/mailer.ts` déduire le fournisseur
 * du FORMAT de la clé — même principe que pour l'assistant IA. `log` n'envoie
 * rien et écrit le message dans les journaux : pratique en local et pour les
 * tests automatisés.
 */
export const MAIL_PROVIDERS = ['auto', 'none', 'log', 'resend', 'brevo', 'sendgrid', 'mailgun', 'postmark', 'smtp'] as const;
export type MailProviderSetting = (typeof MAIL_PROVIDERS)[number];

function normalizeMailProvider(value: string | undefined): MailProviderSetting {
  const raw = (value ?? '').trim().toLowerCase();
  if (!raw) return 'auto';
  // Alias tolérés : noms commerciaux ou fautes de frappe courantes.
  const aliases: Record<string, MailProviderSetting> = {
    sendinblue: 'brevo',
    sib: 'brevo',
    resend: 'resend',
    brevo: 'brevo',
    sendgrid: 'sendgrid',
    mailgun: 'mailgun',
    postmark: 'postmark',
    smtp: 'smtp',
    gmail: 'smtp',
    console: 'log',
    log: 'log',
    none: 'none',
    off: 'none',
  };
  const resolved = aliases[raw];
  if (resolved) return resolved;
  console.warn(
    `[EduMate] MAIL_PROVIDER=« ${raw} » est inconnu (${MAIL_PROVIDERS.join(', ')}) : repli sur « log » (aucun e-mail envoyé).`,
  );
  return 'log';
}

const nodeEnv = process.env.NODE_ENV ?? 'development';
const isProduction = nodeEnv === 'production';

/* ------------------------------------------------------------------ */
/*  Hébergement : Render bloque les ports SMTP sur le plan gratuit      */
/* ------------------------------------------------------------------ */

/**
 * True quand l'application tourne sur Render.
 *
 * Render injecte ces variables dans tous ses services ; elles servent ici à
 * prévenir d'un piège précis : **depuis septembre 2025, les services web du plan
 * GRATUIT bloquent le trafic sortant vers les ports SMTP 25, 465 et 587**.
 * Un `MAIL_PROVIDER=smtp` parfaitement configuré s'y traduit donc par un
 * timeout silencieux, sans aucun message d'erreur explicite.
 *
 * https://render.com/changelog/free-web-services-will-no-longer-allow-outbound-traffic-to-smtp-ports
 */
export const isRenderHost = Boolean(
  process.env.RENDER_SERVICE_ID || process.env.RENDER_EXTERNAL_URL || process.env.RENDER,
);

/** Ports SMTP fermés par le pare-feu sortant de Render (plan gratuit). */
export const RENDER_BLOCKED_SMTP_PORTS = [25, 465, 587] as const;

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
   * Envoi d'e-mails (mot de passe oublié).
   * Aucune clé n'est versionnée : tout vient de l'environnement, exactement
   * comme pour l'assistant IA. Sans configuration, EduMate n'envoie rien et
   * écrit le lien de réinitialisation dans les journaux du serveur.
   */
  mail: {
    provider: normalizeMailProvider(process.env.MAIL_PROVIDER),
    apiKey: (process.env.MAIL_API_KEY ?? '').trim(),
    /**
     * Expéditeur : « EduMate <no-reply@mondomaine.fr> » ou adresse nue.
     *
     * Non renseigné, il est déduit de `SMTP_USER` : avec Gmail/OVH l'expéditeur
     * DOIT être le compte authentifié, donc une seule variable suffit au lieu de
     * deux (et on évite l'erreur classique « 553 authentication required »).
     */
    from:
      (process.env.MAIL_FROM ?? '').trim() ||
      ((process.env.SMTP_USER ?? '').trim() ? `EduMate <${(process.env.SMTP_USER ?? '').trim()}>` : '') ||
      'EduMate <no-reply@edumate.local>',
    fromName: (process.env.MAIL_FROM_NAME ?? '').trim() || 'EduMate',
    replyTo: (process.env.MAIL_REPLY_TO ?? '').trim(),
    mailgunDomain: (process.env.MAILGUN_DOMAIN ?? '').trim(),
    mailgunBaseUrl: (process.env.MAILGUN_BASE_URL ?? '').trim() || 'https://api.mailgun.net',
    timeoutMs: int(process.env.MAIL_TIMEOUT_MS, 10_000),
    smtp: {
      host: (process.env.SMTP_HOST ?? '').trim(),
      port: int(process.env.SMTP_PORT, 587),
      // 465 = SMTPS implicite (Gmail, OVH) ; 587 = STARTTLS (secure: false).
      secure: bool(process.env.SMTP_SECURE, Number(process.env.SMTP_PORT ?? 587) === 465),
      user: (process.env.SMTP_USER ?? '').trim(),
      pass: process.env.SMTP_PASS ?? '',
    },
  },

  /*
   * Réinitialisation de mot de passe par lien envoyé par e-mail.
   */
  passwordReset: {
    /** Durée de validité du lien, en minutes (30 min par défaut). */
    ttlMinutes: Math.min(1440, Math.max(5, int(process.env.PASSWORD_RESET_TTL_MINUTES, 30))),
    /** Chemin côté client du formulaire de nouveau mot de passe. */
    path: (process.env.PASSWORD_RESET_PATH ?? '').trim() || '/reinitialiser',
    /** Délai minimal entre deux demandes pour une même adresse (secondes). */
    cooldownSeconds: Math.max(0, int(process.env.PASSWORD_RESET_COOLDOWN_SECONDS, 60)),
    /** Nombre maximal de demandes par adresse et par heure. */
    maxPerHour: Math.max(1, int(process.env.PASSWORD_RESET_MAX_PER_HOUR, 5)),
    /**
     * Renvoie le lien dans la réponse HTTP.
     *
     * Réservé au développement et aux tests automatisés, où aucun prestataire
     * d'e-mails n'est configuré. **Forcé à `false` en production**, quelle que
     * soit la valeur de `EXPOSE_RESET_LINK` : ce réglage permettrait à
     * n'importe qui de prendre le contrôle d'un compte en connaissant son
     * adresse, et il trahirait aussi l'existence des comptes (le lien n'est
     * renvoyé que si le compte existe). En production, le dépannage passe par
     * les journaux du serveur ou par RECOVERY_EMAIL / RECOVERY_PASSWORD.
     */
    exposeLink: isProduction ? false : bool(process.env.EXPOSE_RESET_LINK, true),
  },

  /*
   * Dépannage d'urgence d'un compte (mot de passe administrateur perdu,
   * adresse e-mail inaccessible, aucun prestataire d'e-mail configuré).
   *
   * Fonctionne sans e-mail : au démarrage, le serveur applique le nouveau mot
   * de passe au compte RECOVERY_EMAIL puis journalise l'opération. Les
   * variables doivent être RETIRÉES de Render immédiatement après, sinon le
   * mot de passe est réappliqué à chaque redémarrage.
   */
  recovery: {
    email: (process.env.RECOVERY_EMAIL ?? '').trim().toLowerCase(),
    password: process.env.RECOVERY_PASSWORD ?? '',
    makeAdmin: bool(process.env.RECOVERY_MAKE_ADMIN, false),
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

/* ------------------------------------------------------------------ */
/*  Adresses publiques                                                 */
/* ------------------------------------------------------------------ */

/**
 * Base publique du site, sans « / » final.
 *
 * `APP_URL` prime (c'est la valeur renseignée sur Render). En son absence on
 * retombe sur l'URL d'exécution fournie par Render (`RENDER_EXTERNAL_URL`),
 * puis sur localhost en développement. Sert à construire les liens des e-mails :
 * un lien relatif y serait inutilisable.
 */
export function appBaseUrl(): string {
  const explicit = (config.appUrl ?? '').trim();
  const render = (process.env.RENDER_EXTERNAL_URL ?? '').trim();
  const base = explicit || render || (config.isProduction ? '' : 'http://localhost:5173');
  return base.replace(/\/+$/, '');
}

/**
 * Construit le lien de réinitialisation complet envoyé par e-mail.
 * Exemple : https://edumateapp.onrender.com/reinitialiser?token=abc123
 */
export function passwordResetUrl(rawToken: string): string {
  const base = appBaseUrl();
  const path = config.passwordReset.path.startsWith('/') ? config.passwordReset.path : `/${config.passwordReset.path}`;
  return `${base}${path}?token=${encodeURIComponent(rawToken)}`;
}

