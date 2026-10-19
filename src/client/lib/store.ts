/**
 * EduMate — État global (Zustand).
 *
 * Quatre magasins légers, sans boilerplate :
 *   useAuth    → session, profil, préférences (persistées côté serveur),
 *   useUi      → thème, toasts, barre latérale mobile,
 *   useCatalog → matières, niveaux, statistiques du catalogue,
 *   useQuiz    → session de quiz en cours + résultat (mémoire, non persisté).
 */
import { create } from 'zustand';
import type { Preferences, PublicUser, Subject, Level } from '../../shared/types.js';
import { ApiError, endpoints, onUnauthorized, setCsrfToken, type CatalogResponse, type QuizQuestionClient, type SessionResponse } from '../lib/api.js';

/* ------------------------------------------------------------------ */
/*  Auth                                                               */
/* ------------------------------------------------------------------ */

interface AuthState {
  user: PublicUser | null;
  status: 'loading' | 'anonymous' | 'authenticated';
  aiConfigured: boolean;
  demoAvailable: boolean;
  /**
   * Le serveur met du temps à répondre et de nouvelles tentatives sont en cours.
   *
   * Cas typique : plan gratuit Render, conteneur endormi après ~15 min
   * d'inactivité, premier accès prenant jusqu'à ~30 s. Sans cet indicateur,
   * l'échec réseau était interprété comme une déconnexion et l'élève arrivait
   * sur la page d'accueil **alors que son cookie de session était toujours
   * valide** — le plus trompeur des comportements possibles ici.
   */
  waking: boolean;
  /** Nombre de tentatives de chargement de session déjà effectuées. */
  sessionAttempts: number;
  loadSession: () => Promise<void>;
  signup: (payload: Record<string, unknown>) => Promise<PublicUser>;
  login: (email: string, password: string) => Promise<PublicUser>;
  loginDemo: () => Promise<PublicUser>;
  logout: () => Promise<void>;
  updateUser: (patch: Record<string, unknown>) => Promise<void>;
  updatePreferences: (patch: Partial<Preferences>) => Promise<void>;
}

function applyPreferencesToDom(user: PublicUser | null): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const prefs = user?.preferences;
  /* Identité v3.0 « Liquid Glass » : sans préférence enregistrée (visiteur
     anonyme, première visite), le thème sombre est le défaut — c'est sur le
     fond quasi noir que les verres et l'aurora s'expriment le mieux. Les
     utilisateurs ayant déjà choisi (clair / sombre / auto) ne sont pas
     touchés : leur choix enregistré prime toujours. */
  const requested = prefs?.theme ?? 'sombre';
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  const resolved = requested === 'auto' ? (prefersDark ? 'sombre' : 'clair') : requested;
  root.dataset.theme = resolved;
  root.dataset.animations = prefs?.animations === false ? 'off' : 'on';
  root.dataset.density = prefs?.density ?? 'confort';
  if (prefs?.accent) root.style.setProperty('--ed-primary', prefs.accent);
}

/* ------------------------------------------------------------------ */
/*  Chargement de session tolérant au serveur froid                     */
/* ------------------------------------------------------------------ */

/**
 * Délais entre les tentatives, en millisecondes.
 *
 * Le premier essai est immédiat. Les suivants couvrent le réveil d'un conteneur
 * Render (jusqu'à ~30 s) sans marteler le serveur : 1,5 s, 3 s, 5 s, 7 s, 9 s,
 * 11 s — soit ~36 s de couverture cumulée, largement au-dessus du pire cas.
 */
const SESSION_RETRY_DELAYS_MS = [1500, 3000, 5000, 7000, 9000, 11000];

type AuthSetter = (partial: Partial<AuthState>) => void;

/**
 * Distingue un serveur injoignable d'une authentification réellement refusée.
 *
 * C'est la clé du correctif : seule une erreur **réseau** justifie de réessayer.
 * Une réponse 401/403 signifie que le serveur a répondu — la session est bel et
 * bien close, et réessayer ne ferait que bloquer l'élève sur un écran de
 * chargement.
 */
function isNetworkFailure(error: unknown): boolean {
  if (error instanceof ApiError) {
    // `status === 0` : la requête n'a jamais abouti (réseau coupé, DNS, CORS).
    // `>= 500` : le serveur a répondu mais est en défaut — pendant un réveil de
    // conteneur, Render peut renvoyer un 502/503 avant que Node ne serve.
    return error.status === 0 || error.code === 'network' || error.code === 'timeout' || error.status >= 500;
  }
  // `fetch` rejeté directement (hors couche `api.ts`) : TypeError réseau.
  return error instanceof TypeError;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadSessionWithRetry(set: AuthSetter, get: () => AuthState): Promise<void> {
  for (let attempt = 0; attempt <= SESSION_RETRY_DELAYS_MS.length; attempt += 1) {
    if (attempt > 0) {
      set({ waking: true, sessionAttempts: attempt });
      await delay(SESSION_RETRY_DELAYS_MS[attempt - 1]);
    }
    try {
      const session: SessionResponse = await endpoints.session();
      setCsrfToken(session.csrfToken);
      set({
        user: session.user,
        status: session.user ? 'authenticated' : 'anonymous',
        waking: false,
        sessionAttempts: attempt + 1,
        aiConfigured: Boolean(session.aiConfigured),
        demoAvailable: session.demoAvailable,
      });
      applyPreferencesToDom(session.user);
      return;
    } catch (error) {
      // Le serveur a répondu « non autorisé » : inutile d'insister.
      if (!isNetworkFailure(error)) {
        set({ user: null, status: 'anonymous', waking: false, sessionAttempts: attempt + 1 });
        applyPreferencesToDom(null);
        return;
      }
      if (attempt < SESSION_RETRY_DELAYS_MS.length) continue;
    }
  }

  /*
   * Toutes les tentatives ont échoué sur un problème réseau.
   *
   * On bascule en anonyme pour ne pas bloquer l'application : les outils locaux
   * (horloge, minuteur, chronomètre, tableau interactif, musique générée)
   * restent utilisables. Le cookie de session n'est PAS supprimé — s'il est
   * toujours valide, la reconnexion sera automatique au prochain chargement.
   */
  set({ user: null, status: 'anonymous', waking: false });
  applyPreferencesToDom(null);
  // `get` est conservé dans la signature pour symétrie avec les autres actions.
  void get;
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  status: 'loading',
  waking: false,
  sessionAttempts: 0,
  aiConfigured: false,
  // `false` par défaut : le bouton de démonstration ne doit jamais apparaître,
  // même une fraction de seconde, avant que la session ne soit chargée.
  demoAvailable: false,

  loadSession: async () => {
    await loadSessionWithRetry(set, get);
  },

  signup: async (payload) => {
    const result = await endpoints.signup(payload);
    setCsrfToken(result.csrfToken);
    set({ user: result.user, status: 'authenticated' });
    applyPreferencesToDom(result.user);
    return result.user;
  },

  login: async (email, password) => {
    const result = await endpoints.login({ email, password });
    setCsrfToken(result.csrfToken);
    set({ user: result.user, status: 'authenticated' });
    applyPreferencesToDom(result.user);
    return result.user;
  },

  loginDemo: async () => {
    const result = await endpoints.demo();
    setCsrfToken(result.csrfToken);
    set({ user: result.user, status: 'authenticated' });
    applyPreferencesToDom(result.user);
    return result.user;
  },

  logout: async () => {
    try {
      await endpoints.logout();
    } catch {
      // La déconnexion locale prime : on nettoie même si le réseau échoue.
    }
    setCsrfToken('');
    set({ user: null, status: 'anonymous' });
    applyPreferencesToDom(null);
  },

  updateUser: async (patch) => {
    const result = await endpoints.updateMe(patch);
    set({ user: result.user });
    applyPreferencesToDom(result.user);
  },

  updatePreferences: async (patch) => {
    const result = await endpoints.updatePreferences(patch);
    set({ user: result.user });
    applyPreferencesToDom(result.user);
  },
}));

/** Bascule locale du thème (sans attendre le serveur). */
export function toggleTheme(): void {
  const { user, updatePreferences } = useAuth.getState();
  const current = user?.preferences?.theme ?? 'auto';
  const next: Preferences['theme'] = current === 'clair' ? 'sombre' : current === 'sombre' ? 'auto' : 'clair';
  const root = document.documentElement;
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  root.dataset.theme = next === 'auto' ? (prefersDark ? 'sombre' : 'clair') : next;
  if (user) void updatePreferences({ theme: next });
  else useUi.getState().notify(`Thème : ${next}`, 'info');
}

/* Écoute du changement de préférence système quand le thème est en « auto ». */
if (typeof window !== 'undefined' && window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const prefs = useAuth.getState().user?.preferences;
    if (!prefs || prefs.theme === 'auto') applyPreferencesToDom(useAuth.getState().user);
  });
}

/* Session expirée → retour en mode anonyme avec message clair. */
if (typeof window !== 'undefined') {
  let notified = false;
  onUnauthorized(() => {
    const { user } = useAuth.getState();
    if (!user) return;
    setCsrfToken('');
    useAuth.setState({ user: null, status: 'anonymous' });
    applyPreferencesToDom(null);
    if (!notified) {
      notified = true;
      useUi.getState().notify('Ta session a expiré. Reconnecte-toi pour continuer.', 'warning');
      setTimeout(() => {
        notified = false;
      }, 4000);
    }
  });
}

/* ------------------------------------------------------------------ */
/*  UI                                                                 */
/* ------------------------------------------------------------------ */

export type ToastKind = 'success' | 'error' | 'warning' | 'info';
export interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}

interface UiState {
  toasts: Toast[];
  sidebarOpen: boolean;
  notify: (message: string, kind?: ToastKind, duration?: number) => void;
  dismiss: (id: number) => void;
  setSidebar: (open: boolean) => void;
}

let toastId = 0;

export const useUi = create<UiState>((set, get) => ({
  toasts: [],
  sidebarOpen: false,
  notify: (message, kind = 'info', duration = 4200) => {
    const id = ++toastId;
    set({ toasts: [...get().toasts.slice(-3), { id, message, kind }] });
    setTimeout(() => get().dismiss(id), duration);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((toast) => toast.id !== id) }),
  setSidebar: (open) => set({ sidebarOpen: open }),
}));

/** Raccourci : `toast.success('Bravo !')` */
export const toast = {
  success: (message: string): void => useUi.getState().notify(message, 'success'),
  error: (message: string): void => useUi.getState().notify(message, 'error', 6000),
  warning: (message: string): void => useUi.getState().notify(message, 'warning', 5200),
  info: (message: string): void => useUi.getState().notify(message, 'info'),
  fromError: (error: unknown, fallback = 'Une erreur est survenue.'): void => {
    const message = error instanceof Error && error.message ? error.message : fallback;
    useUi.getState().notify(message, 'error', 6000);
  },
};

/* ------------------------------------------------------------------ */
/*  Catalogue                                                          */
/* ------------------------------------------------------------------ */

interface CatalogState {
  subjects: Subject[];
  levels: Level[];
  stats: CatalogResponse['stats'] | null;
  loaded: boolean;
  load: () => Promise<void>;
  subjectById: (id?: string) => Subject | undefined;
  levelById: (id?: string) => Level | undefined;
}

export const useCatalog = create<CatalogState>((set, get) => ({
  subjects: [],
  levels: [],
  stats: null,
  loaded: false,
  load: async () => {
    if (get().loaded) return;
    try {
      const catalog = await endpoints.catalog();
      set({
        subjects: catalog.subjects as Subject[],
        levels: catalog.levels as Level[],
        stats: catalog.stats,
        loaded: true,
      });
    } catch {
      set({ loaded: true });
    }
  },
  subjectById: (id) => get().subjects.find((subject) => subject.id === id),
  levelById: (id) => get().levels.find((level) => level.id === id),
}));

/* ------------------------------------------------------------------ */
/*  Session de quiz (mémoire uniquement)                               */
/* ------------------------------------------------------------------ */

export interface QuizAnswer {
  questionId: string;
  value: string | number;
}

interface QuizState {
  session: {
    topicId: string;
    topicName: string;
    subjectName: string;
    themeName: string;
    levelName: string;
    emoji: string;
    color: string;
    accent: string;
    seed: number;
    durationSec: number;
    questions: QuizQuestionClient[];
    startedAt: number;
  } | null;
  result: {
    topicId: string;
    topicName: string;
    emoji: string;
    color: string;
    score: number;
    total: number;
    percent: number;
    durationSec: number;
    results: import('./api.js').GradeResult[];
    /** Identifiant de l'essai enregistré : cible du bouton « Réviser ce quiz ». */
    attemptId: string | null;
  } | null;
  setSession: (session: QuizState['session']) => void;
  setResult: (result: QuizState['result']) => void;
  clear: () => void;
}

export const useQuiz = create<QuizState>((set) => ({
  session: null,
  result: null,
  setSession: (session) => set({ session, result: null }),
  setResult: (result) => set({ result, session: null }),
  clear: () => set({ session: null, result: null }),
}));
