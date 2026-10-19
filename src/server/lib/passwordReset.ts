/**
 * EduMate — Jetons de réinitialisation de mot de passe.
 *
 * Règles de sécurité appliquées (les mêmes que pour un service grand public) :
 *
 *   1. **Le jeton brut n'est jamais stocké.** Seule son empreinte SHA-256 est
 *      écrite en base : une fuite de la base ne permet donc pas de se connecter
 *      à la place d'un élève.
 *   2. **Un seul jeton actif par compte.** Une nouvelle demande révoque la
 *      précédente (le lien déjà reçu par e-mail cesse de fonctionner).
 *   3. **Usage unique.** Le jeton est effacé dès qu'il a servi, qu'il soit
 *      valide ou non, ce qui coupe toute rejeu.
 *   4. **Durée de vie courte** (30 min par défaut, `PASSWORD_RESET_TTL_MINUTES`).
 *   5. **Anti-énumération.** Les réponses HTTP sont identiques que l'adresse
 *      existe ou non ; seule la limitation de débit distingue les cas, et elle
 *      s'applique par adresse AVANT toute recherche en base.
 *   6. **Limitation de débit** par adresse e-mail (délai minimal + plafond
 *      horaire) pour empêcher le harcèlement d'un élève par e-mails.
 *
 * Le stockage passe par la couche `Storage` existante : les jetons vivent donc
 * dans Upstash en production et en mémoire pendant les tests. L'interface
 * `Storage` n'exposant pas de TTL, l'expiration est portée par la donnée
 * elle-même (`expiresAt`) et vérifiée à chaque lecture, avec nettoyage paresseux.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from './config.js';
import { getStorage } from './storage.js';
import { K, findUserByEmail, normalizeEmail, type StoredUser } from './store.js';

/** Données persistées pour un jeton (empreinte uniquement, jamais le brut). */
export interface ResetTokenRecord {
  userId: string;
  email: string;
  /** Empreinte SHA-256 du jeton brut (hexadécimal). */
  hash: string;
  /** Horodatage d'expiration, en millisecondes depuis l'époque. */
  expiresAt: number;
  createdAt: number;
  /** Adresse IP ayant demandé le jeton (diagnostic d'abus, jamais renvoyée). */
  ip?: string;
}

/** Compteur de limitation de débit, par adresse e-mail. */
interface ThrottleRecord {
  windowStart: number;
  count: number;
  lastAt: number;
}

/** Résultat d'une vérification de jeton, avec la raison d'un éventuel refus. */
export type ResetTokenState =
  | { valid: true; userId: string; email: string; expiresAt: number }
  | { valid: false; reason: 'introuvable' | 'expire' | 'illisible' };

const ONE_HOUR_MS = 60 * 60 * 1000;

/** Empreinte SHA-256 (hexadécimal) du jeton brut : c'est elle qui est stockée. */
export function hashResetToken(rawToken: string): string {
  return createHash('sha256').update(String(rawToken)).digest('hex');
}

/**
 * Génère un jeton brut de 256 bits, encodé en base64url.
 *
 * base64url plutôt qu'hexadécimal : 43 caractères au lieu de 64, donc un lien
 * plus court dans l'e-mail — et aucune ambiguïté de casse pour un recopiage
 * manuel. Les caractères « + » et « / » sont exclus, l'URL reste propre.
 */
export function generateResetToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Normalise le jeton reçu du client (les e-mails sont parfois recopiés). */
function sanitizeToken(rawToken: unknown): string {
  if (typeof rawToken !== 'string') return '';
  return rawToken.trim().replace(/\s+/g, '').slice(0, 128);
}

/* ------------------------------------------------------------------ */
/*  Limitation de débit par adresse e-mail                             */
/* ------------------------------------------------------------------ */

export interface ThrottleVerdict {
  allowed: boolean;
  /** Secondes à attendre avant la prochaine demande autorisée. */
  retryAfterSec: number;
  /** Demandes encore possibles dans l'heure courante. */
  remaining: number;
}

/**
 * Évalue (sans l'incrémenter) le droit d'envoyer un nouveau lien.
 * Deux garde-fous cumulatifs :
 *   - un délai minimal entre deux demandes (anti-clic frénétique),
 *   - un plafond horaire (anti-harcèlement d'un tiers).
 */
export async function checkResetThrottle(email: string): Promise<ThrottleVerdict> {
  const { cooldownSeconds, maxPerHour } = config.passwordReset;
  const store = await getStorage();
  const key = K.passwordResetLimit(email);
  const now = Date.now();
  const record = (await store.get<ThrottleRecord>(key).catch(() => null)) ?? null;

  if (!record || now - record.windowStart >= ONE_HOUR_MS) {
    return { allowed: true, retryAfterSec: 0, remaining: maxPerHour };
  }
  const sinceLast = Math.round((now - record.lastAt) / 1000);
  if (cooldownSeconds > 0 && sinceLast < cooldownSeconds) {
    return { allowed: false, retryAfterSec: cooldownSeconds - sinceLast, remaining: Math.max(0, maxPerHour - record.count) };
  }
  if (record.count >= maxPerHour) {
    const retryAfterSec = Math.max(1, Math.round((record.windowStart + ONE_HOUR_MS - now) / 1000));
    return { allowed: false, retryAfterSec, remaining: 0 };
  }
  return { allowed: true, retryAfterSec: 0, remaining: maxPerHour - record.count };
}

/** Enregistre une demande d'envoi (à appeler uniquement si un lien est produit). */
export async function recordResetRequest(email: string): Promise<void> {
  const store = await getStorage();
  const key = K.passwordResetLimit(email);
  const now = Date.now();
  const existing = (await store.get<ThrottleRecord>(key).catch(() => null)) ?? null;
  const record: ThrottleRecord =
    existing && now - existing.windowStart < ONE_HOUR_MS
      ? { windowStart: existing.windowStart, count: existing.count + 1, lastAt: now }
      : { windowStart: now, count: 1, lastAt: now };
  await store.set(key, record).catch((error: unknown) => {
    // Un échec de comptage ne doit jamais empêcher l'élève de récupérer son compte.
    console.warn(`[EduMate] Compteur anti-abus non mis à jour : ${(error as Error).message}`);
  });
}

/* ------------------------------------------------------------------ */
/*  Cycle de vie du jeton                                              */
/* ------------------------------------------------------------------ */

/**
 * Crée un jeton pour un compte et révoque le précédent.
 * Renvoie le jeton BRUT (à ne transmettre que par e-mail, jamais stocké).
 */
export async function issueResetToken(user: StoredUser, ip?: string): Promise<{ rawToken: string; expiresAt: number; minutes: number }> {
  const store = await getStorage();
  const email = normalizeEmail(user.email);
  const rawToken = generateResetToken();
  const hash = hashResetToken(rawToken);
  const now = Date.now();
  const minutes = config.passwordReset.ttlMinutes;
  const expiresAt = now + minutes * 60 * 1000;

  const record: ResetTokenRecord = { userId: user.id, email, hash, expiresAt, createdAt: now, ip };

  /*
   * Révocation du jeton précédent : on lit l'empreinte encore active pour ce
   * compte puis on l'efface, afin qu'un lien déjà envoyé ne reste pas valable
   * après une nouvelle demande. Le tout en un seul aller-retour quand la couche
   * de stockage le permet (`delAndSet`).
   */
  const previousHash = await store.get<string>(K.passwordResetByUser(user.id)).catch(() => null);
  const keysToDelete: string[] = [];
  if (previousHash) keysToDelete.push(K.passwordResetToken(previousHash));

  if (store.delAndSet) {
    await store.delAndSet(keysToDelete, K.passwordResetToken(hash), record);
    await store.set(K.passwordResetByUser(user.id), hash);
  } else {
    if (keysToDelete.length) await store.del(keysToDelete);
    await store.set(K.passwordResetToken(hash), record);
    await store.set(K.passwordResetByUser(user.id), hash);
  }
  return { rawToken, expiresAt, minutes };
}

/**
 * Vérifie un jeton SANS le consommer : sert à l'ouverture du formulaire, pour
 * afficher immédiatement « lien expiré » plutôt qu'après la saisie du mot de passe.
 */
export async function peekResetToken(rawToken: unknown): Promise<ResetTokenState> {
  const store = await getStorage();
  const token = sanitizeToken(rawToken);
  if (!token) return { valid: false, reason: 'illisible' };

  const hash = hashResetToken(token);
  const record = await store.get<ResetTokenRecord>(K.passwordResetToken(hash)).catch(() => null);
  if (!record || typeof record !== 'object' || !record.userId) return { valid: false, reason: 'introuvable' };
  if (!record.expiresAt || Date.now() > record.expiresAt) {
    // Nettoyage paresseux : le jeton périmé disparaît de la base.
    await store.del([K.passwordResetToken(hash), K.passwordResetByUser(record.userId)]).catch(() => undefined);
    return { valid: false, reason: 'expire' };
  }
  return { valid: true, userId: record.userId, email: record.email, expiresAt: record.expiresAt };
}

/**
 * Consomme un jeton : le supprime de la base puis renvoie l'identité du compte.
 *
 * La suppression a lieu AVANT tout traitement : même si la mise à jour du mot
 * de passe échoue ensuite, le jeton ne peut pas être rejoué.
 */
export async function consumeResetToken(rawToken: unknown): Promise<{ userId: string; email: string } | null> {
  const peeked = await peekResetToken(rawToken);
  if (!peeked.valid) return null;

  const store = await getStorage();
  const token = sanitizeToken(rawToken);
  const hash = hashResetToken(token);
  await store.del([K.passwordResetToken(hash), K.passwordResetByUser(peeked.userId)]).catch(() => undefined);
  return { userId: peeked.userId, email: peeked.email };
}

/** Révoque tous les jetons en attente d'un compte (changement de mot de passe, suppression). */
export async function revokeResetTokens(userId: string): Promise<void> {
  const store = await getStorage();
  const hash = await store.get<string>(K.passwordResetByUser(userId)).catch(() => null);
  const keys = [K.passwordResetByUser(userId)];
  if (hash) keys.push(K.passwordResetToken(hash));
  await store.del(keys).catch(() => undefined);
}

/**
 * Efface les jetons périmés encore présents en base.
 *
 * Nécessaire parce que la couche `Storage` n'expose pas de TTL Redis : sans ce
 * balayage, les empreintes expirées s'accumuleraient indéfiniment dans Upstash
 * (et compteraient dans le quota de clés du plan gratuit).
 */
export async function sweepExpiredResetTokens(): Promise<number> {
  const store = await getStorage();
  let removed = 0;
  try {
    const keys = await store.keys('pwreset:token:');
    if (!keys.length) return 0;
    const now = Date.now();
    for (const key of keys) {
      const record = await store.get<ResetTokenRecord>(key).catch(() => null);
      if (!record || !record.expiresAt || record.expiresAt <= now) {
        await store.del(key).catch(() => undefined);
        removed += 1;
      }
    }
  } catch (error) {
    console.warn(`[EduMate] Balayage des jetons expirés ignoré : ${(error as Error).message}`);
  }
  return removed;
}

/* ------------------------------------------------------------------ */
/*  Aides utilisées par les routes                                     */
/* ------------------------------------------------------------------ */

/**
 * Compare deux empreintes en temps constant.
 *
 * Défense en profondeur : la clé de base est déjà l'empreinte du jeton, donc la
 * comparaison n'expose pas de secret, mais une comparaison à temps constant
 * évite toute fuite d'information sur la longueur ou le préfixe d'une empreinte.
 */
export function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(String(a ?? ''), 'hex');
  const right = Buffer.from(String(b ?? ''), 'hex');
  if (left.length === 0 || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Cherche un compte par adresse e-mail, en tolérant une base injoignable.
 * Renvoie `null` aussi bien pour « inconnu » que pour « erreur » : la route
 * répond de toute façon 200 sans révéler laquelle des deux situations c'est.
 */
export async function findAccountForReset(email: string): Promise<StoredUser | null> {
  try {
    return await findUserByEmail(email);
  } catch (error) {
    console.warn(`[EduMate] Recherche de compte impossible : ${(error as Error).message}`);
    return null;
  }
}
