/**
 * EduMate — État du fil d'actualités, des sondages et des notifications.
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  CE QUE « NOTIFICATION » VEUT DIRE ICI — ET SA LIMITE HONNÊTE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Trois niveaux, du plus simple au plus complet :
 *
 *   1. **Badge chiffré** dans la barre supérieure et la barre latérale :
 *      toujours actif, aucune permission requise.
 *   2. **Notification de bureau** via l'API `Notification` du navigateur :
 *      fonctionne quand le navigateur est ouvert, **y compris onglet en
 *      arrière-plan ou fenêtre minimisée** — c'est le cas « l'élève travaille
 *      sur autre chose ». Nécessite une permission explicite.
 *   3. **Push Web réel** (navigateur complètement fermé) : exige des clés VAPID
 *      et un service de push. Ce n'est **pas** implémenté : cela introduirait un
 *      nouveau secret à gérer, exactement ce que le projet cherche à éviter.
 *      Le modèle de données et le polling sont prêts à l'accueillir plus tard.
 *
 * Le niveau 2 couvre l'essentiel de l'usage scolaire : pendant une session de
 * travail, l'onglet EduMate est ouvert.
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  COÛT : le polling n'interroge que `/api/feed/unread`, qui renvoie deux
 *  nombres. Deux lectures Upstash par passage, soit ~960 commandes/jour à un
 *  intervalle de 3 minutes — très loin du quota gratuit de 10 000.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { create } from 'zustand';
import type { FeedItem, FeedResponse, Poll } from '../../shared/types.js';
import { endpoints } from './api.js';
import { useAuth } from './store.js';

/** Intervalle d'interrogation du badge, en millisecondes. */
export const FEED_POLL_INTERVAL_MS = 3 * 60 * 1000;

/** Clé localStorage de la permission de notification demandée. */
const NOTIF_PREF_KEY = 'edumate:notifPref';

interface FeedState {
  items: FeedItem[];
  polls: Record<string, Poll>;
  myVotes: Record<string, string[]>;
  readIds: string[];
  readAllAt: string | null;
  unreadCount: number;
  loaded: boolean;
  loading: boolean;
  error: string | null;
  /** Identifiant du sondage en cours de vote (désactive ses boutons). */
  votingId: string | null;

  load: () => Promise<void>;
  refreshUnread: () => Promise<number>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  vote: (pollId: string, optionIds: string[]) => Promise<boolean>;
}

/** Applique une réponse complète du fil. */
function applyFeed(set: (partial: Partial<FeedState>) => void, data: FeedResponse): void {
  set({
    items: Array.isArray(data.items) ? data.items : [],
    polls: data.polls ?? {},
    myVotes: data.myVotes ?? {},
    readIds: Array.isArray(data.readIds) ? data.readIds : [],
    readAllAt: data.readAllAt ?? null,
    unreadCount: Number.isFinite(data.unreadCount) ? data.unreadCount : 0,
    loaded: true,
    loading: false,
    error: null,
  });
}

export const useFeed = create<FeedState>((set, get) => ({
  items: [],
  polls: {},
  myVotes: {},
  readIds: [],
  readAllAt: null,
  unreadCount: 0,
  loaded: false,
  loading: false,
  error: null,
  votingId: null,

  load: async () => {
    if (!useAuth.getState().user) {
      set({ items: [], polls: {}, myVotes: {}, unreadCount: 0, loaded: true, loading: false });
      return;
    }
    set({ loading: true, error: null });
    try {
      const data = await endpoints.feed(30);
      applyFeed(set, data);
    } catch (error) {
      set({ loading: false, error: error instanceof Error ? error.message : 'Le fil est inaccessible.' });
    }
  },

  /*
   * Interrogation légère : ne récupère que le compteur. Utilisée par le polling,
   * donc elle ne doit JAMAIS réinitialiser `items` (le panneau ouvert perdrait
   * son contenu à chaque passage).
   */
  refreshUnread: async () => {
    if (!useAuth.getState().user) return 0;
    try {
      const data = await endpoints.feedUnread();
      const next = Number.isFinite(data.unreadCount) ? data.unreadCount : 0;
      const previous = get().unreadCount;
      set({ unreadCount: next });
      if (next > previous) notifyNewItems(next - previous);
      return next;
    } catch {
      // Silencieux : un échec de polling ne doit pas interrompre l'élève.
      return get().unreadCount;
    }
  },

  markRead: async (id) => {
    // Optimiste : le badge réagit immédiatement.
    const previous = get();
    if (!previous.readIds.includes(id)) {
      set({
        readIds: [...previous.readIds, id],
        unreadCount: Math.max(0, previous.unreadCount - 1),
      });
    }
    try {
      const result = await endpoints.markFeedRead(id);
      set({ readIds: result.readIds ?? get().readIds, unreadCount: result.unreadCount ?? get().unreadCount });
    } catch {
      // Retour arrière : l'élément n'a pas été marqué côté serveur.
      set({ readIds: previous.readIds, unreadCount: previous.unreadCount });
    }
  },

  markAllRead: async () => {
    const previous = get();
    set({ readIds: previous.items.map((item) => item.id), unreadCount: 0, readAllAt: new Date().toISOString() });
    try {
      const result = await endpoints.markFeedAllRead();
      set({ unreadCount: result.unreadCount ?? 0, readAllAt: result.readAllAt ?? null });
    } catch {
      set({ readIds: previous.readIds, unreadCount: previous.unreadCount, readAllAt: previous.readAllAt });
    }
  },

  vote: async (pollId, optionIds) => {
    const previous = get();
    set({ votingId: pollId });
    // Optimiste : les barres de résultat se dessinent immédiatement.
    const optimisticPolls = { ...previous.polls };
    const poll = optimisticPolls[pollId];
    if (poll) {
      const counts = new Map(poll.options.map((option) => [option.id, option.count]));
      for (const id of previous.myVotes[pollId] ?? []) counts.set(id, Math.max(0, (counts.get(id) ?? 0) - 1));
      for (const id of optionIds) counts.set(id, (counts.get(id) ?? 0) + 1);
      optimisticPolls[pollId] = {
        ...poll,
        options: poll.options.map((option) => ({ ...option, count: counts.get(option.id) ?? 0 })),
      };
      set({ polls: optimisticPolls, myVotes: { ...previous.myVotes, [pollId]: optionIds } });
    }

    try {
      const result = await endpoints.votePoll(pollId, optionIds);
      set({
        polls: { ...get().polls, [pollId]: result.poll },
        myVotes: { ...get().myVotes, [pollId]: result.myVotes },
        votingId: null,
      });
      return true;
    } catch (error) {
      // Retour arrière complet : mieux vaut rejouer le vote que laisser des
      // pourcentages faux à l'écran.
      set({
        polls: previous.polls,
        myVotes: previous.myVotes,
        votingId: null,
        error: error instanceof Error ? error.message : 'Le vote n’a pas pu être enregistré.',
      });
      return false;
    }
  },
}));

/* ------------------------------------------------------------------ */
/*  Notifications de bureau                                            */
/* ------------------------------------------------------------------ */

export type NotificationPermissionState = 'unsupported' | 'default' | 'granted' | 'denied';

/** État de la permission, normalisé (l'API diffère selon les navigateurs). */
export function notificationPermission(): NotificationPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  const value = Notification.permission;
  return value === 'granted' || value === 'denied' ? value : 'default';
}

/**
 * Demande la permission. Doit être appelé depuis un geste utilisateur (clic) :
 * les navigateurs ignorent une demande déclenchée au chargement.
 */
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    return Notification.permission;
  }
  try {
    await Notification.requestPermission();
  } catch {
    /* certains navigateurs lèvent si la demande est trop rapprochée */
  }
  const state = notificationPermission();
  try {
    window.localStorage.setItem(NOTIF_PREF_KEY, state);
  } catch {
    /* stockage indisponible */
  }
  return state;
}

/**
 * Émet une notification de bureau pour de nouveaux éléments.
 *
 * Deux garde-fous importants :
 *   - **uniquement si l'onglet n'est pas visible**. Si l'élève regarde déjà le
 *     badge s'incrémenter, une notification en plus serait du bruit ;
 *   - une seule notification à la fois (la précédente est fermée), pour ne pas
 *     empiler dix bulles après une longue absence.
 */
let lastNotification: Notification | null = null;

export function notifyNewItems(count: number): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible') return;
  if (count <= 0) return;

  try {
    lastNotification?.close();
    const title = count === 1 ? 'EduMate — 1 nouveauté' : `EduMate — ${count} nouveautés`;
    const body =
      count === 1
        ? 'Une actualité ou un sondage t’attend dans le fil.'
        : 'Des actualités et des sondages t’attendent dans le fil.';
    lastNotification = new Notification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'edumate-feed', // même `tag` : remplace au lieu d'empiler
      lang: 'fr',
    });
    lastNotification.onclick = (): void => {
      window.focus();
      window.location.assign('/fil');
      lastNotification?.close();
      lastNotification = null;
    };
  } catch {
    /* notification refusée par le système (mode économie, focus assist…) */
  }
}

/* ------------------------------------------------------------------ */
/*  Polling                                                            */
/* ------------------------------------------------------------------ */

let pollTimer: number | null = null;

/** Démarre l'interrogation périodique du badge (sans effet si déjà active). */
export function startFeedPolling(): void {
  if (pollTimer !== null) return;
  pollTimer = window.setInterval(() => {
    void useFeed.getState().refreshUnread();
  }, FEED_POLL_INTERVAL_MS);
}

/** Arrête l'interrogation (déconnexion, démontage). */
export function stopFeedPolling(): void {
  if (pollTimer !== null) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
}
