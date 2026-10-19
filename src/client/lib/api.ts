/**
 * EduMate — Client API.
 *
 * Un seul point de sortie vers le backend :
 *  - injecte automatiquement l'en-tête anti-CSRF,
 *  - traduit les erreurs techniques en messages compréhensibles,
 *  - signale l'expiration de session (déconnexion propre côté UI),
 *  - gère l'indisponibilité réseau sans jamais planter l'interface.
 */

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  get isSessionExpired(): boolean {
    return this.status === 401 || this.code === 'csrf';
  }
}

type Listeners = {
  unauthorized: (() => void)[];
};

const listeners: Listeners = { unauthorized: [] };

/** Permet à l'UI de réagir à une session expirée (redirect + message). */
export function onUnauthorized(handler: () => void): () => void {
  listeners.unauthorized.push(handler);
  return () => {
    listeners.unauthorized = listeners.unauthorized.filter((fn) => fn !== handler);
  };
}

let csrfToken = '';
export function setCsrfToken(token: string | null | undefined): void {
  csrfToken = token ?? '';
}
export function getCsrfToken(): string {
  return csrfToken || readCookie('edumate_csrf');
}

export function readCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : '';
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  timeoutMs?: number;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(path, window.location.origin);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
  }
  return `${url.pathname}${url.search}`;
}

async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  let body: BodyInit | undefined;
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }
  if (method !== 'GET' && method !== 'HEAD') {
    const token = getCsrfToken();
    if (token) headers['X-CSRF-Token'] = token;
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      ...options,
      method,
      headers,
      body,
      credentials: 'same-origin',
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    const aborted = error instanceof DOMException && error.name === 'AbortSignalTimeout';
    throw new ApiError(
      0,
      aborted ? 'timeout' : 'network',
      aborted
        ? 'Le serveur met trop de temps à répondre. Vérifie ta connexion puis réessaie.'
        : 'Impossible de joindre EduMate. Vérifie ta connexion Internet.',
    );
  } finally {
    clearTimeout(timeout);
  }

  const text = await response.text().catch(() => '');
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    const data = (payload ?? {}) as { error?: string; message?: string; details?: unknown };
    const code = data.error ?? `http_${response.status}`;
    const message =
      data.message ??
      (response.status === 404
        ? 'Ressource introuvable.'
        : response.status >= 500
          ? 'Le serveur rencontre un problème. Réessaie dans un instant.'
          : 'La requête a été refusée.');
    const error = new ApiError(response.status, code, message, data.details);
    if (error.isSessionExpired && code !== 'unauthorized_login') {
      listeners.unauthorized.forEach((handler) => handler());
    }
    throw error;
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>('GET', path, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('POST', path, { ...options, body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('PUT', path, { ...options, body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('PATCH', path, { ...options, body }),
  delete: <T>(path: string, options?: RequestOptions) => request<T>('DELETE', path, options),
};

/* ------------------------------------------------------------------ */
/*  Endpoints typés                                                    */
/* ------------------------------------------------------------------ */

import type {
  AiLessonContent,
  CalendarEvent,
  Exam,
  ExamPlan,
  ExamSelfLevel,
  ExamView,
  Fiche,
  FicheSummary,
  LessonStat,
  CatalogTopic,
  Conversation,
  FeedImportance,
  FeedItem,
  SessionState,
  SessionStatus,
  TodayPlan,
  FeedResponse,
  HealthResponse,
  Lesson,
  Poll,
  Preferences,
  PublicUser,
  Question,
  RevisionPayload,
  Task,
  TutorMode,
} from '../../shared/types.js';

export type { HealthResponse, Lesson, LessonStep, LessonExercise, RevisionPayload, RevisionQuestion, AiLessonContent, Fiche, FicheSummary, FicheSection, FicheFlashcard, Exam, ExamView, ExamPlan, ExamSelfLevel, ExamFeedback, TodayPlan, PlanSession, PlanDay, NotionPriority, NotionPriorityLevel, SessionStatus, SessionState, SessionActivity } from '../../shared/types.js';

export interface SessionResponse {
  user: PublicUser | null;
  csrfToken: string | null;
  demoAvailable: boolean;
  aiConfigured?: boolean;
}

export interface CatalogResponse {
  subjects: { id: string; name: string; short: string; emoji: string; color: string; colorSoft: string; accent: string; pattern: string; description: string }[];
  levels: { id: string; name: string; short: string; order: number }[];
  stats: { subjects: number; levels: number; themes: number; topics: number; playable: number; questionPool: number };
  generatedAt: string;
}

export interface SearchResponse {
  total: number;
  items: (CatalogTopic & { favorite?: boolean })[];
  facets: {
    subjects: { id: string; name: string; count: number }[];
    levels: { id: string; name: string; count: number }[];
    difficulties: { id: string; count: number }[];
    themes: { id: string; name: string; count: number }[];
  };
}

export interface QuizQuestionClient {
  id: string;
  kind: Question['kind'];
  prompt: string;
  options: string[];
  difficulty: Question['difficulty'];
  skill: string | null;
}

export interface GeneratedQuiz {
  topic: {
    id: string;
    name: string;
    subjectId: string;
    subjectName: string;
    levelName: string;
    themeName: string;
    emoji: string;
    color: string;
    accent: string;
    difficulty: string;
  };
  seed: number;
  durationSec: number;
  questions: QuizQuestionClient[];
}

export interface GradeResult {
  questionId: string;
  prompt: string;
  correct: boolean;
  given: string | number | null;
  answer: number | null;
  options: string[];
  accept: string[] | null;
  explanation: string;
  skill: string | null;
}

export interface GradeResponse {
  score: number;
  total: number;
  percent: number;
  durationSec: number;
  attemptId: string;
  results: GradeResult[];
}

export interface ProgressStats {
  /** Leçons terminées (historique + validation ≥ 80 %). */
  lessons: LessonStat[];
  /** Secondes de leçon travaillées aujourd'hui (objectif du jour). */
  lessonSecondsToday: number;
  attempts: number;
  correct: number;
  total: number;
  successRate: number;
  bestScore: number;
  totalDurationSec: number;
  streakDays: number;
  bySubject: { subjectId: string; subjectName: string; emoji: string; color: string; attempts: number; correct: number; total: number; successRate: number }[];
  mastered: { topicId: string; name: string; subjectName: string; themeName: string; emoji: string; color: string }[];
  toReview: { topicId: string; name: string; subjectName: string; themeName: string; emoji: string; color: string }[];
  last30Days: { date: string; score: number; total: number }[];
  recent: { id: string; topicId: string; topicName: string; themeName: string; subjectId: string; emoji: string; score: number; total: number; percent: number; durationSec: number; createdAt: string }[];
}

export interface TodayResponse {
  today: string;
  upcoming: CalendarEvent[];
  overdue: CalendarEvent[];
  tasks: Task[];
}

export interface Recommendations {
  toReview: CatalogTopic[];
  favorites: CatalogTopic[];
  bySubject: { subjectId: string; items: CatalogTopic[] }[];
  fresh: CatalogTopic[];
}

export const endpoints = {
  health: () => api.get<HealthResponse>('/api/health'),

  session: () => api.get<SessionResponse>('/api/auth/session'),
  signup: (payload: Record<string, unknown>) => api.post<{ user: PublicUser; csrfToken: string }>('/api/auth/signup', payload),
  login: (payload: { email: string; password: string }) => api.post<{ user: PublicUser; csrfToken: string }>('/api/auth/login', payload),
  logout: () => api.post<{ ok: boolean }>('/api/auth/logout', {}),
  demo: () => api.post<{ user: PublicUser; csrfToken: string; demo: boolean }>('/api/auth/demo', {}),
  options: () =>
    api.get<{
      levels: { id: string; name: string; short: string }[];
      subjects: { id: string; name: string; emoji: string; color: string }[];
      subjectsByLevel: Record<string, string[]>;
      avatars: string[];
      accents: string[];
      demoAvailable: boolean;
    }>('/api/auth/options'),
  updateMe: (payload: Record<string, unknown>) => api.put<{ user: PublicUser }>('/api/auth/me', payload),
  updatePreferences: (payload: Partial<Preferences>) => api.put<{ user: PublicUser }>('/api/auth/me/preferences', payload),
  changePassword: (payload: { currentPassword: string; newPassword: string }) => api.post<{ ok: boolean }>('/api/auth/me/password', payload),
  deleteAccount: () => api.delete<{ ok: boolean; deletedKeys: number }>('/api/auth/me'),
  /** Télécharge l'export JSON de toutes les données du compte. */
  exportData: async (): Promise<Blob> => {
    const response = await fetch('/api/auth/me/export', {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    });
    if (!response.ok) {
      throw new ApiError(response.status, 'export_failed', 'Impossible de générer l’export de tes données.');
    }
    return response.blob();
  },

  catalog: () => api.get<CatalogResponse>('/api/catalog'),
  browse: (params?: { subject?: string; level?: string }) => api.get<{ subjects: any[]; levels: any[]; themes: { id: string; name: string; count: number }[] }>('/api/browse', { query: params as never }),
  search: (params: Record<string, string | number | boolean | undefined>) => api.get<SearchResponse>('/api/search', { query: params }),
  topic: (id: string) => api.get<{ topic: CatalogTopic; related: CatalogTopic[] }>(`/api/topics/${encodeURIComponent(id)}`),
  generate: (payload: { topicId: string; count?: number; seed?: number; difficulty?: string }) => api.post<GeneratedQuiz>('/api/generate', payload),
  grade: (payload: { topicId: string; seed: number; durationSec: number; answers: { questionId: string; value: string | number }[] }) =>
    api.post<GradeResponse>('/api/grade', payload, { timeoutMs: 45_000 }),

  favorites: () => api.get<{ favorites: string[]; items: CatalogTopic[] }>('/api/favorites'),
  toggleFavorite: (topicId: string) => api.post<{ favorites: string[]; added: boolean }>('/api/favorites', { topicId }),
  recommendations: () => api.get<Recommendations>('/api/recommendations'),

  /** Coach IA post-quiz : explications et méthode après les résultats. */
  quizCoach: (payload: {
    topicName?: string;
    score?: number;
    total?: number;
    message: string;
    history?: { role: 'user' | 'assistant'; content: string }[];
    questions?: {
      prompt: string;
      options?: string[];
      answer?: number | null;
      given?: string | number | null;
      accept?: string[] | null;
      explanation?: string;
      correct?: boolean;
      skill?: string | null;
    }[];
  }) => api.post<{ content: string; offline: boolean }>('/api/coach', payload, { timeoutMs: 60_000 }),

  stats: () => api.get<ProgressStats>('/api/progress/stats'),
  history: (limit = 30) => api.get<{ items: any[]; total: number }>('/api/progress/history', { query: { limit } }),
  mastery: () => api.get<{ items: any[] }>('/api/progress/topics'),
  /** Leçon interactive d'un sujet (étapes jouables, exemples, exercices). */
  lesson: (topicId: string, seed?: number) =>
    api.get<{ lesson: Lesson }>(`/api/lessons/${encodeURIComponent(topicId)}`, { query: { seed } }),
  /** Génère (et met en cache) la version enrichie par l'IA d'une leçon. */
  enrichLesson: (topicId: string) =>
    api.post<{ ai: AiLessonContent | null; cached?: boolean; message?: string }>(`/api/lessons/${encodeURIComponent(topicId)}/enrich`, {}, { timeoutMs: 60_000 }),
  /** Révision interactive d'un quiz joué (ou session d'entraînement neuve). */
  revision: (topicId: string, attemptId?: string, seed?: number) =>
    api.get<RevisionPayload>(`/api/lessons/revision/${encodeURIComponent(topicId)}`, {
      query: { attempt: attemptId, seed },
    }),

  /* ------------------------- Fiches de révision ------------------------- */

  /** Toutes les fiches débloquées (hub). */
  fiches: () => api.get<{ fiches: FicheSummary[] }>('/api/lessons/fiches'),

  /** Fiche complète d'un sujet (erreur `fiche_verrouillee` si non débloquée). */
  fiche: (topicId: string) => api.get<{ fiche: Fiche }>(`/api/lessons/fiches/${encodeURIComponent(topicId)}`),

  /** Fin de leçon : débloque automatiquement la fiche si le score suffit. */
  completeLesson: (topicId: string, payload: { score: number; total: number; durationSec?: number }) =>
    api.post<{
      success: boolean;
      validated: boolean;
      rate: number;
      bestRate: number;
      already?: boolean;
      message?: string;
      fiche?: Fiche;
    }>(`/api/lessons/${encodeURIComponent(topicId)}/complete`, payload),

  events: (month?: string) => api.get<{ events: CalendarEvent[] }>('/api/organize/events', { query: { month } }),
  createEvent: (payload: Partial<CalendarEvent>) => api.post<{ events: CalendarEvent[]; event: CalendarEvent }>('/api/organize/events', payload),
  updateEvent: (id: string, payload: Partial<CalendarEvent>) => api.put<{ events: CalendarEvent[]; event: CalendarEvent }>(`/api/organize/events/${id}`, payload),
  deleteEvent: (id: string) => api.delete<{ events: CalendarEvent[] }>(`/api/organize/events/${id}`),
  tasks: () => api.get<{ tasks: Task[] }>('/api/organize/tasks'),
  createTask: (payload: Partial<Task>) => api.post<{ tasks: Task[]; task: Task }>('/api/organize/tasks', payload),
  updateTask: (id: string, payload: Partial<Task>) => api.put<{ tasks: Task[]; task: Task }>(`/api/organize/tasks/${id}`, payload),
  deleteTask: (id: string) => api.delete<{ tasks: Task[] }>(`/api/organize/tasks/${id}`),
  today: () => api.get<TodayResponse>('/api/organize/today'),

  tutorStatus: () => api.get<{ provider: string; configured: boolean; model?: string; modes: TutorMode[] }>('/api/tutor/status'),
  ask: (payload: { message: string; mode: TutorMode; subjectId?: string; level?: string; conversationId?: string; history?: unknown[] }) =>
    api.post<{ conversationId: string; content: string; provider: string; offline: boolean; mode: TutorMode; durationMs: number }>('/api/tutor/ask', payload, { timeoutMs: 60_000 }),

  /**
   * Question avec réponse progressive (SSE).
   *
   * `onDelta` reçoit chaque fragment de texte ; la promesse se résout avec la
   * réponse finale (identique à `ask`). Lève une `ApiError` si le serveur
   * refuse la requête ou ne sait pas streamer — l'appelant retombe alors sur
   * `ask()`, l'expérience reste identique (sans l'effet « machine à écrire »).
   */
  askStream: async (
    payload: { message: string; mode: TutorMode; subjectId?: string; level?: string; conversationId?: string; history?: unknown[] },
    onDelta: (text: string) => void,
    signal?: AbortSignal,
  ): Promise<{ conversationId: string; content: string; provider: string; offline: boolean; mode: TutorMode; durationMs: number }> => {
    const response = await fetch('/api/tutor/ask/stream', {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
        ...(getCsrfToken() ? { 'X-CSRF-Token': getCsrfToken() } : {}),
      },
      body: JSON.stringify(payload),
      credentials: 'same-origin',
      signal,
    });

    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => '');
      let data: { error?: string; message?: string } = {};
      try {
        data = JSON.parse(text) as { error?: string; message?: string };
      } catch {
        /* réponse non-JSON : message générique */
      }
      throw new ApiError(response.status, data.error ?? `http_${response.status}`, data.message ?? 'Le flux de réponse est indisponible.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let done: { conversationId: string; content: string; provider: string; offline: boolean; mode: TutorMode; durationMs: number } | null = null;
    let streamError: string | null = null;

    const handleFrame = (frame: string): void => {
      let event = 'message';
      const dataLines: string[] = [];
      for (const line of frame.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
      }
      if (!dataLines.length) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(dataLines.join('\n'));
      } catch {
        return;
      }
      if (event === 'delta') {
        const piece = (parsed as { text?: string }).text;
        if (piece) onDelta(piece);
      } else if (event === 'done') {
        done = parsed as typeof done;
      } else if (event === 'error') {
        streamError = (parsed as { message?: string }).message ?? 'Réponse interrompue.';
      }
    };

    for (;;) {
      const { done: finished, value } = await reader.read();
      if (finished) break;
      buffer += decoder.decode(value, { stream: true });
      let separator = buffer.indexOf('\n\n');
      while (separator !== -1) {
        handleFrame(buffer.slice(0, separator));
        buffer = buffer.slice(separator + 2);
        separator = buffer.indexOf('\n\n');
      }
    }
    if (buffer.trim()) handleFrame(buffer);

    if (done) return done;
    throw new ApiError(0, 'stream_failed', streamError ?? 'La réponse a été interrompue avant la fin.');
  },

  conversations: () => api.get<{ conversations: { id: string; title: string; subjectId?: string; level?: string; updatedAt: string; messageCount: number; preview: string }[] }>('/api/tutor/conversations'),
  conversation: (id: string) => api.get<{ conversation: Conversation }>(`/api/tutor/conversations/${id}`),
  deleteConversation: (id: string) => api.delete<{ conversations: Conversation[] }>(`/api/tutor/conversations/${id}`),

  languages: () => api.get<{ languages: { code: string; name: string; flag: string }[] }>('/api/services/translate/languages'),
  translate: (params: { q: string; source?: string; target?: string }) =>
    api.get<{ source: string; target: string; translatedText: string; detected?: string; provider?: string }>('/api/services/translate', { query: params, timeoutMs: 20_000 }),
  detectLanguage: (q: string) => api.get<{ language: string }>('/api/services/translate/detect', { query: { q } }),
  /* --------------------- Planning de révision automatique ---------------- */

  planningExams: () => api.get<{ exams: ExamView[] }>('/api/planning/exams'),
  planningToday: () => api.get<{ today: TodayPlan }>('/api/planning/today'),
  planningExam: (id: string) => api.get<{ plan: ExamPlan }>(`/api/planning/exams/${encodeURIComponent(id)}`),
  planningGenerate: (id: string) => api.post<{ plan: ExamPlan }>(`/api/planning/exams/${encodeURIComponent(id)}/generate`, {}),
  planningCreateExam: (payload: {
    subjectId: string;
    themeId?: string;
    title: string;
    date: string;
    time?: string;
    topics?: string[];
    dailyMinutes: number;
    selfLevel: ExamSelfLevel;
  }) => api.post<{ exam: Exam; view: ExamView }>('/api/planning/exams', payload),
  planningUpdateExam: (id: string, payload: Partial<Exam>) =>
    api.patch<{ exam: Exam; plan: ExamPlan }>(`/api/planning/exams/${encodeURIComponent(id)}`, payload),
  planningDeleteExam: (id: string) => api.delete<{ exams: ExamView[] }>(`/api/planning/exams/${encodeURIComponent(id)}`),
  planningSessionStatus: (examId: string, sessionId: string, payload: { status: SessionStatus; score?: number; total?: number }) =>
    api.post<{ plan: ExamPlan; state: SessionState }>(
      `/api/planning/exams/${encodeURIComponent(examId)}/sessions/${encodeURIComponent(sessionId)}`,
      payload,
    ),

  /* ---------------------- Fil d'actualités & sondages --------------------- */

  /** Fil complet : éléments, sondages, votes de l'élève et nombre de non-lus. */
  feed: (limit = 30) => api.get<FeedResponse>('/api/feed', { query: { limit } }),

  /** Compte de non-lus seul — utilisé par le badge, interrogé périodiquement. */
  feedUnread: () => api.get<{ unreadCount: number; total: number }>('/api/feed/unread'),

  markFeedRead: (id: string) =>
    api.post<{ ok: boolean; unreadCount: number; readIds: string[] }>(`/api/feed/${id}/read`, {}),

  markFeedAllRead: () =>
    api.post<{ ok: boolean; unreadCount: number; readAllAt: string }>('/api/feed/read-all', {}),

  pollDetail: (id: string) => api.get<{ poll: Poll; myVotes: string[] }>(`/api/feed/polls/${id}`),

  votePoll: (id: string, optionIds: string[]) =>
    api.post<{ poll: Poll; myVotes: string[]; changed: boolean; totalVotes: number }>(
      `/api/feed/polls/${id}/vote`,
      { optionIds },
    ),

  /* --------------------------- Administration ---------------------------- */

  adminFeed: () =>
    api.get<{ items: FeedItem[]; polls: Record<string, Poll>; total: number }>('/api/admin/feed'),

  adminPublishNews: (payload: { title: string; body: string; importance?: FeedImportance; link?: string }) =>
    api.post<{ item: FeedItem }>('/api/admin/feed', payload),

  adminCreatePoll: (payload: {
    question: string;
    options: string[];
    singleChoice?: boolean;
    closesAt?: string | null;
    body?: string;
  }) => api.post<{ poll: Poll; item: FeedItem }>('/api/admin/polls', payload),

  adminClosePoll: (id: string, closed: boolean) => api.patch<{ poll: Poll }>(`/api/admin/polls/${id}`, { closed }),

  adminDeleteFeedItem: (id: string) =>
    api.delete<{ ok: boolean; removedPollId: string | null }>(`/api/admin/feed/${id}`),

  /** Ambiances musicales servies par de vraies webradios. */
  musicMoods: () =>
    api.get<{
      moods: { id: string; label: string; emoji: string; description: string; source: 'radio' }[];
      source: string;
    }>('/api/services/music/moods'),

  /**
   * Stations d'une ambiance. `timeoutMs` élargi : l'annuaire Radio Browser est
   * interrogé côté serveur et peut prendre une à deux secondes au premier appel
   * (les suivants sont servis depuis le cache de 6 h).
   */
  musicStations: (mood: string) =>
    api.get<{
      mood: string;
      stations: {
        id: string;
        name: string;
        url: string;
        homepage: string;
        favicon: string;
        codec: string;
        bitrate: number;
        country: string;
        tags: string[];
        votes: number;
      }[];
      source: string;
    }>('/api/services/music/stations', { query: { mood }, timeoutMs: 25_000 }),

  schools: (q: string, level = 'lycee') => api.get<{ schools: { name: string; city: string; postalCode?: string; nature: string; kind: string }[]; source: string }>('/api/services/schools', { query: { q, level }, timeoutMs: 15_000 }),
};
