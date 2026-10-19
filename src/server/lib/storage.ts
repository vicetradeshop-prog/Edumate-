/**
 * EduMate — Couche de persistance.
 *
 * Un seul contrat (`Storage`) avec trois implémentations :
 *   1. Upstash Redis (production, via l'API REST — aucune dépendance externe),
 *   2. fichier JSON local (développement sans Upstash),
 *   3. mémoire (développement / tests, non persistant).
 *
 * L'implémentation Upstash est durcie pour un hébergement serverless :
 *   - nouvelles tentatives avec recul exponentiel sur les erreurs transitoires,
 *   - disjoncteur (« circuit breaker ») pour ne pas marteler une base injoignable
 *     et répondre vite à l'utilisateur,
 *   - requêtes groupées (pipeline) pour limiter la consommation du quota gratuit,
 *   - diagnostic détaillé (latence, dernière erreur) exposé par /api/health.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { config, hasUpstash } from './config.js';
import { serviceUnavailable } from './middleware.js';

export interface Storage {
  readonly kind: 'upstash' | 'file' | 'memory';
  get<T>(key: string): Promise<T | null>;
  getMany<T>(keys: string[]): Promise<(T | null)[]>;
  set<T>(key: string, value: T): Promise<void>;
  /** Supprime une clé, ou plusieurs clés en une seule opération. */
  del(key: string | string[]): Promise<void>;
  /** Efface des clés puis en écrit une autre, en une seule requête HTTP. */
  delAndSet?: <T>(keysToDelete: string[], keyToWrite: string, value: T) => Promise<void>;
  /** Liste les clés portant un préfixe (sans le préfixe global). */
  keys(prefix: string): Promise<string[]>;
  /** État de santé détaillé, utilisé par /api/health. */
  health(): Promise<StorageHealth>;
}

export interface StorageHealth {
  ready: boolean;
  kind: Storage['kind'];
  latencyMs: number | null;
  lastError: string | null;
  notice: string | null;
  /** Nombre d'opérations réussies depuis le démarrage (indicateur d'activité). */
  operations: number;
}

const FULL_PREFIX = `${config.database.keyPrefix}:`;

/** Erreurs considérées comme transitoires (réseau, saturation, redémarrage). */
const RETRYABLE = /timeout|aborted|network|socket|429|50[0234]|ECONN|EAI_AGAIN|fetch failed/i;

/** Traduit toute défaillance de stockage en réponse HTTP claire pour l'élève. */
export function storageError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof StorageUnavailableError) {
    throw serviceUnavailable(
      'Tes données sont momentanément inaccessibles. Réessaie dans quelques secondes — rien n’est perdu.',
    );
  }
  console.error('[EduMate] Erreur de stockage :', message);
  throw serviceUnavailable('Le stockage est momentanément indisponible. Réessaie dans un instant.');
}

export class StorageUnavailableError extends Error {
  cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'StorageUnavailableError';
    this.cause = cause;
  }
}

/* ------------------------------------------------------------------ */
/*  Upstash Redis (API REST)                                           */
/* ------------------------------------------------------------------ */

interface BreakerState {
  failures: number;
  openUntil: number;
}

/**
 * Normalise l'URL REST d'Upstash pour tolérer les variantes de copier-coller
 * depuis la console : espaces, « / » final, ou « /pipeline » collé par erreur.
 *
 * Sans cela, un `UPSTASH_REDIS_REST_URL` terminé par « /pipeline » produirait
 * « .../pipeline/pipeline » (404) et les commandes simples échoueraient.
 */
export function normalizeUpstashUrl(rawUrl: string): string {
  let url = String(rawUrl ?? '').trim().replace(/\/+$/, '');
  const lowered = url.toLowerCase();
  for (const suffix of ['/pipeline', '/multi', '/monitor']) {
    if (lowered.endsWith(suffix)) {
      const trimmed = url.slice(0, url.length - suffix.length).replace(/\/+$/, '');
      console.warn(
        `[EduMate] UPSTASH_REDIS_REST_URL se terminait par « ${suffix} » : corrigé en « ${trimmed} ». ` +
          'Utilise l\'URL de base, sans suffixe.',
      );
      url = trimmed;
      break;
    }
  }
  return url;
}

class UpstashStorage implements Storage {
  readonly kind = 'upstash' as const;
  private url: string;
  private token: string;
  private breaker: BreakerState = { failures: 0, openUntil: 0 };
  private lastError: string | null = null;
  private lastLatency: number | null = null;
  private operations = 0;
  private readonly maxRetries: number;
  private readonly failureThreshold = 4;
  private readonly cooldownMs = 15_000;

  constructor(url: string, token: string) {
    this.url = normalizeUpstashUrl(url);
    this.token = token.trim();
    this.maxRetries = Number(process.env.UPSTASH_MAX_RETRIES ?? 2);
  }

  /** Le disjoncteur est-il ouvert (base réputée indisponible) ? */
  private breakerOpen(): boolean {
    return this.breaker.failures >= this.failureThreshold && Date.now() < this.breaker.openUntil;
  }

  private recordSuccess(): void {
    this.breaker.failures = 0;
    this.breaker.openUntil = 0;
    this.operations += 1;
  }

  private recordFailure(message: string): void {
    this.lastError = message;
    this.breaker.failures += 1;
    if (this.breaker.failures >= this.failureThreshold) {
      this.breaker.openUntil = Date.now() + this.cooldownMs;
      console.warn(
        `[EduMate] Upstash injoignable (${this.breaker.failures} échecs) — nouvelles tentatives suspendues ${this.cooldownMs / 1000}s.`,
      );
    }
  }

  /**
   * Exécute UNE commande Redis.
   * API Upstash : POST {url}/ avec le corps `[commande, ...args]`.
   */
  private async command<T>(command: string, args: (string | number)[] = []): Promise<T> {
    const payload = await this.request<{ result: T; error?: string }>([command, ...args.map(String)], false);
    if (payload.error) throw new StorageUnavailableError(`Upstash : ${String(payload.error).slice(0, 200)}`);
    return payload.result;
  }

  /**
   * Exécute PLUSIEURS commandes en un seul aller-retour HTTP.
   * API Upstash : POST {url}/pipeline avec le corps `[[cmd, ...args], ...]`.
   * Un tableau de commandes envoyé sur l'endpoint racine provoque
   * « ERR unsupported arg type » : les deux formats ne sont pas interchangeables.
   */
  private async pipeline<T>(commands: (string | number)[][]): Promise<T[]> {
    if (commands.length === 0) return [];
    const payload = await this.request<{ result: T; error?: string }[]>(
      commands.map((command) => command.map(String)),
      true,
    );
    return payload.map((entry) => {
      if (!entry) return null as unknown as T;
      if (entry.error) {
        console.warn(`[EduMate] Upstash pipeline : ${String(entry.error).slice(0, 160)}`);
        return null as unknown as T;
      }
      return entry.result;
    });
  }

  private async request<T>(payload: unknown, isPipeline: boolean): Promise<T> {
    if (this.breakerOpen()) {
      throw new StorageUnavailableError('Upstash Redis momentanément indisponible (disjoncteur ouvert).');
    }

    let attempt = 0;
    let lastMessage = '';
    while (attempt <= this.maxRetries) {
      if (attempt > 0) {
        // Recul exponentif : 180 ms, 360 ms…
        await new Promise((resolve) => setTimeout(resolve, 180 * 2 ** (attempt - 1)));
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.services.requestTimeoutMs);
      const startedAt = Date.now();
      try {
        const response = await fetch(isPipeline ? `${this.url}/pipeline` : this.url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        if (response.status === 429 || response.status >= 500) {
          lastMessage = `Upstash HTTP ${response.status}`;
          attempt += 1;
          continue;
        }
        if (!response.ok) {
          const detail = await response.text().catch(() => '');
          throw new StorageUnavailableError(`Upstash HTTP ${response.status} ${detail.slice(0, 160)}`);
        }

        const body = (await response.json()) as T;
        this.lastLatency = Date.now() - startedAt;
        this.recordSuccess();
        return body;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (error instanceof StorageUnavailableError && !RETRYABLE.test(message)) {
          this.recordFailure(message);
          throw error;
        }
        lastMessage = message;
        if (!RETRYABLE.test(message)) {
          this.recordFailure(message);
          throw new StorageUnavailableError(message, error);
        }
        attempt += 1;
      } finally {
        clearTimeout(timer);
      }
    }

    this.recordFailure(lastMessage || 'Upstash : échec après nouvelles tentatives');
    throw new StorageUnavailableError(lastMessage || 'Upstash indisponible');
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.command<string | null>('GET', [FULL_PREFIX + key]);
    if (raw === null || raw === undefined) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      console.warn(`[EduMate] Donnée illisible ignorée : ${key}`);
      return null;
    }
  }

  async getMany<T>(keys: string[]): Promise<(T | null)[]> {
    if (!keys.length) return [];
    // Un seul aller-retour HTTP pour toute la liste : préserve le quota gratuit.
    const results = await this.pipeline<string | null>(keys.map((key) => ['GET', FULL_PREFIX + key]));
    return results.map((raw) => {
      if (raw === null || raw === undefined) return null;
      try {
        return JSON.parse(raw) as T;
      } catch {
        console.warn('[EduMate] Donnée illisible ignorée pendant la lecture groupée.');
        return null;
      }
    });
  }

  async set<T>(key: string, value: T): Promise<void> {
    await this.command<string>('SET', [FULL_PREFIX + key, JSON.stringify(value)]);
  }

  async del(key: string | string[]): Promise<void> {
    // Redis accepte plusieurs clés dans un seul DEL : autant d'économies sur
    // le quota de commandes d'Upstash.
    const keys = (Array.isArray(key) ? key : [key]).map((item) => FULL_PREFIX + item);
    if (!keys.length) return;
    await this.command<number>('DEL', keys);
  }

  /**
   * Efface des clés puis en écrit une autre, le tout en UNE requête HTTP.
   * Utile pour la suppression de compte : les clés du compte disparaissent et
   * l'index global est réécrit sans aller-retour supplémentaire.
   */
  async delAndSet<T>(keysToDelete: string[], keyToWrite: string, value: T): Promise<void> {
    const commands: (string | number)[][] = [];
    const uniqueKeys = [...new Set(keysToDelete)].map((key) => FULL_PREFIX + key);
    if (uniqueKeys.length) commands.push(['DEL', ...uniqueKeys]);
    commands.push(['SET', FULL_PREFIX + keyToWrite, JSON.stringify(value)]);
    await this.pipeline<unknown>(commands);
  }

  async keys(prefix: string): Promise<string[]> {
    const found = await this.command<string[] | null>('KEYS', [`${FULL_PREFIX}${prefix}*`]);
    return (found ?? []).map((key) => key.slice(FULL_PREFIX.length));
  }

  async health(): Promise<StorageHealth> {
    const startedAt = Date.now();
    try {
      // Force une tentative même si le disjoncteur est ouvert : c'est justement
      // ce qui permet de constater le rétablissement de la base.
      this.breaker.openUntil = 0;
      const result = await this.command<string>('PING');
      const ready = String(result).toUpperCase().includes('PONG');
      return {
        ready,
        kind: this.kind,
        latencyMs: Date.now() - startedAt,
        lastError: ready ? null : this.lastError,
        notice: null,
        operations: this.operations,
      };
    } catch (error) {
      return {
        ready: false,
        kind: this.kind,
        latencyMs: null,
        lastError: error instanceof Error ? error.message : String(error),
        notice: 'Upstash Redis est configuré mais injoignable (URL, token ou région à vérifier).',
        operations: this.operations,
      };
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Stockage fichier (développement)                                   */
/* ------------------------------------------------------------------ */

class FileStorage implements Storage {
  readonly kind = 'file' as const;
  private file: string;
  private data: Record<string, unknown> = {};
  private writing: Promise<void> | null = null;
  private dirty = false;
  private operations = 0;

  constructor(dir: string) {
    mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, 'edumate-store.json');
    if (existsSync(this.file)) {
      try {
        this.data = JSON.parse(readFileSync(this.file, 'utf-8')) as Record<string, unknown>;
      } catch (error) {
        console.warn('[EduMate] Fichier de stockage illisible, démarrage à vide :', (error as Error).message);
        this.data = {};
      }
    }
  }

  private async flush(): Promise<void> {
    if (!this.dirty) return;
    this.dirty = false;
    // Écriture sérialisée pour éviter deux écritures concurrentes.
    this.writing = (async () => {
      await writeFileSync(this.file, JSON.stringify(this.data, null, 1), 'utf-8');
    })();
    return this.writing;
  }

  async get<T>(key: string): Promise<T | null> {
    this.operations += 1;
    const value = this.data[FULL_PREFIX + key];
    return value === undefined ? null : (value as T);
  }

  async getMany<T>(keys: string[]): Promise<(T | null)[]> {
    return Promise.all(keys.map((key) => this.get<T>(key)));
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.operations += 1;
    this.data[FULL_PREFIX + key] = value;
    this.dirty = true;
    await this.flush();
  }

  async del(key: string | string[]): Promise<void> {
    this.operations += 1;
    for (const item of Array.isArray(key) ? key : [key]) {
      delete this.data[FULL_PREFIX + item];
    }
    this.dirty = true;
    await this.flush();
  }

  async keys(prefix: string): Promise<string[]> {
    const full = `${FULL_PREFIX}${prefix}`;
    return Object.keys(this.data)
      .filter((key) => key.startsWith(full))
      .map((key) => key.slice(FULL_PREFIX.length));
  }

  async health(): Promise<StorageHealth> {
    const writable = (() => {
      try {
        return existsSync(path.dirname(this.file));
      } catch {
        return false;
      }
    })();
    return {
      ready: writable,
      kind: this.kind,
      latencyMs: 0,
      lastError: null,
      notice: writable
        ? 'Stockage fichier local : les données ne survivent pas à un redéploiement (Render). Configure Upstash en production.'
        : 'Le répertoire de stockage est inaccessible.',
      operations: this.operations,
    };
  }
}

/* ------------------------------------------------------------------ */
/*  Stockage mémoire                                                   */
/* ------------------------------------------------------------------ */

class MemoryStorage implements Storage {
  readonly kind = 'memory' as const;
  private data = new Map<string, unknown>();
  private operations = 0;

  async get<T>(key: string): Promise<T | null> {
    this.operations += 1;
    const value = this.data.get(FULL_PREFIX + key);
    return value === undefined ? null : (value as T);
  }

  async getMany<T>(keys: string[]): Promise<(T | null)[]> {
    return Promise.all(keys.map((key) => this.get<T>(key)));
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.operations += 1;
    this.data.set(FULL_PREFIX + key, value);
  }

  async del(key: string | string[]): Promise<void> {
    this.operations += 1;
    for (const item of Array.isArray(key) ? key : [key]) {
      this.data.delete(FULL_PREFIX + item);
    }
  }

  async keys(prefix: string): Promise<string[]> {
    const full = `${FULL_PREFIX}${prefix}`;
    return [...this.data.keys()].filter((key) => key.startsWith(full)).map((key) => key.slice(FULL_PREFIX.length));
  }

  async health(): Promise<StorageHealth> {
    return {
      ready: true,
      kind: this.kind,
      latencyMs: 0,
      lastError: null,
      notice: 'Aucune base configurée : les données sont conservées en mémoire et seront perdues au redémarrage.',
      operations: this.operations,
    };
  }
}

/* ------------------------------------------------------------------ */
/*  Sélection automatique                                              */
/* ------------------------------------------------------------------ */

let storage: Storage | null = null;
let startupNotice: string | null = null;

export async function getStorage(): Promise<Storage> {
  if (storage) return storage;

  if (hasUpstash()) {
    const candidate = new UpstashStorage(config.database.upstashUrl, config.database.upstashToken);
    const health = await candidate.health();
    if (health.ready) {
      storage = candidate;
      console.log(`[EduMate] Base de données : Upstash Redis ✔ (latence ${health.latencyMs} ms)`);
      return storage;
    }
    startupNotice = health.notice ?? health.lastError;
    console.warn(`[EduMate] ${startupNotice}`);
    // On conserve malgré tout l'implémentation Upstash : le disjoncteur se
    // referme tout seul dès que la base répond à nouveau, sans redémarrage.
    storage = candidate;
    if (config.database.fallback !== 'memory') {
      console.warn('[EduMate] Les requêtes échoueront proprement (503) tant que la base ne répond pas.');
    }
    return storage;
  }

  if (config.database.fallback === 'file') {
    storage = new FileStorage(path.resolve(process.cwd(), config.database.fileDir));
    console.log(`[EduMate] Base de données : fichier local (${config.database.fileDir})`);
    if (config.isProduction) {
      console.warn('[EduMate] ⚠️  Le stockage fichier n’est pas persistant sur Render : configure UPSTASH_REDIS_REST_URL/TOKEN.');
    }
    return storage;
  }

  storage = new MemoryStorage();
  console.log('[EduMate] Base de données : mémoire (volatil — configure Upstash pour persister)');
  if (!startupNotice) {
    startupNotice = 'Aucune base configurée : les données sont conservées en mémoire uniquement.';
  }
  return storage;
}

export function getStartupError(): string | null {
  return startupNotice;
}

/* ------------------------------------------------------------------ */
/*  Aides génériques                                                   */
/* ------------------------------------------------------------------ */

/** Lit une liste typée, en tolérant l'absence de donnée. */
export async function readList<T>(store: Storage, key: string): Promise<T[]> {
  const value = await store.get<T[]>(key);
  return Array.isArray(value) ? value : [];
}

/** Écrit une liste typée. */
export async function writeList<T>(store: Storage, key: string, list: T[]): Promise<void> {
  await store.set(key, list);
}
