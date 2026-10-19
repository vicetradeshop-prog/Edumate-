/**
 * EduMate — Couche de données (users, progression, favoris, organisation,
 * conversations).
 *
 * Toutes les lectures/écritures passent par `Storage`, donc fonctionnent
 * à l'identique sur Upstash Redis, en fichier local ou en mémoire.
 * Les clés sont préfixées et structurées pour rester lisibles dans la console
 * Upstash.
 */
import type {
  LessonCompletion,
  LessonStat,
  CalendarEvent,
  Conversation,
  Preferences,
  QuizAttempt,
  SubjectProgress,
  Task,
  TopicMastery,
  User,
} from '../../shared/types.js';
import { getStorage, readList, writeList } from './storage.js';
import { newId } from './auth.js';
import { findTopic } from './catalog.js';

/**
 * Seuil de VALIDATION d'une leçon (fiche de révision, case « leçon » du
 * planning) : 80 % des exercices justes. En dessous, la leçon reste
 * « à rejouer » — l'essai est tout de même enregistré (historique, temps).
 */
export const LESSON_VALIDATE_RATIO = 0.8;

/* ------------------------------------------------------------------ */
/*  Clés                                                               */
/* ------------------------------------------------------------------ */

export const K = {
  userById: (id: string): string => `user:${id}`,
  userIdByEmail: (email: string): string => `email:${normalizeEmail(email)}`,
  users: 'users:index',
  attempts: (userId: string): string => `progress:${userId}:attempts`,
  favorites: (userId: string): string => `favorites:${userId}`,
  events: (userId: string): string => `calendar:${userId}`,
  tasks: (userId: string): string => `tasks:${userId}`,
  conversations: (userId: string): string => `tutor:${userId}`,
  /** Fiches de révision débloquées par l'élève (donnée personnelle). */
  fiches: (userId: string): string => `fiches:${userId}`,
  /** Contrôles saisis pour le planning de révision automatique. */
  exams: (userId: string): string => `planning:${userId}:exams`,
  /** États des séances de révision (terminée / reportée / ignorée). */
  examSessions: (userId: string): string => `planning:${userId}:sessions`,
  /** Historique des leçons terminées (progression + temps de travail). */
  lessonResults: (userId: string): string => `lessons:${userId}:results`,
  /**
   * Cache du contenu de leçon généré par l'IA, par sujet.
   * Contenu PÉDAGOGIQUE partagé entre élèves (pas une donnée personnelle) :
   * il ne fait donc pas partie des clés supprimées avec un compte.
   */
  lessonAi: (topicId: string): string => `lesson:ai:${topicId}`,
};

export function normalizeEmail(email: string): string {
  return String(email ?? '').trim().toLowerCase();
}

/* ------------------------------------------------------------------ */
/*  Utilisateurs                                                       */
/* ------------------------------------------------------------------ */

export interface StoredUser extends User {
  passwordHash: string;
  demo?: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = {
  /* v3.0 : l'identité « Liquid Glass » est pensée pour le thème sombre
     (verres dépolis sur aurora violette). L'utilisateur peut bien sûr
     repasser en clair ou en auto dans les paramètres. */
  theme: 'sombre',
  accent: '#6c5ce7',
  density: 'confort',
  animations: true,
  sounds: true,
  dailyGoal: 20,
  focusMusic: 'lofi',
};

/** Retire les champs sensibles avant tout renvoi au client. */
export function toPublicUser(user: StoredUser): User {
  const { passwordHash: _hash, ...rest } = user;
  return rest as User;
}

export async function findUserByEmail(email: string): Promise<StoredUser | null> {
  const store = await getStorage();
  const id = await store.get<string>(K.userIdByEmail(email));
  if (!id) return null;
  return store.get<StoredUser>(K.userById(id));
}

export async function findUserById(id: string): Promise<StoredUser | null> {
  const store = await getStorage();
  return store.get<StoredUser>(K.userById(id));
}

export async function createUser(input: {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName?: string;
  age?: number;
  school?: string;
  level?: string;
  subjects?: string[];
  avatar?: string;
  preferences?: Partial<Preferences>;
  role?: 'eleve' | 'admin';
  onboarded?: boolean;
  demo?: boolean;
}): Promise<StoredUser> {
  const store = await getStorage();
  const email = normalizeEmail(input.email);
  const id = newId();
  const now = new Date().toISOString();
  const user: StoredUser = {
    id,
    email,
    passwordHash: input.passwordHash,
    firstName: input.firstName,
    lastName: input.lastName,
    age: input.age,
    school: input.school,
    level: input.level,
    subjects: input.subjects ?? [],
    avatar: input.avatar ?? '🦉',
    role: input.role ?? 'eleve',
    onboarded: input.onboarded ?? true,
    createdAt: now,
    preferences: { ...DEFAULT_PREFERENCES, ...(input.preferences ?? {}) },
    demo: input.demo,
  };
  await store.set(K.userById(id), user);
  await store.set(K.userIdByEmail(email), id);
  const index = await readList<string>(store, K.users);
  if (!index.includes(id)) {
    index.push(id);
    await writeList(store, K.users, index);
  }
  return user;
}

export async function updateUser(id: string, patch: Partial<Omit<StoredUser, 'id' | 'createdAt'>>): Promise<StoredUser | null> {
  const store = await getStorage();
  const user = await store.get<StoredUser>(K.userById(id));
  if (!user) return null;

  const updated: StoredUser = { ...user, ...patch };
  // Les préférences sont fusionnées, jamais écrasées partiellement.
  if (patch.preferences) {
    updated.preferences = { ...user.preferences, ...patch.preferences };
  }
  // Si l'e-mail change, il faut déplacer l'index.
  if (patch.email && normalizeEmail(patch.email) !== user.email) {
    const newEmail = normalizeEmail(patch.email);
    await store.del(K.userIdByEmail(user.email));
    await store.set(K.userIdByEmail(newEmail), id);
    updated.email = newEmail;
  }
  await store.set(K.userById(id), updated);
  return updated;
}

/** Toutes les clés rattachées à un compte (suppression en cascade, export). */
export function userDataKeys(userId: string): string[] {
  return [
    K.userById(userId),
    K.attempts(userId),
    K.favorites(userId),
    K.events(userId),
    K.tasks(userId),
    K.conversations(userId),
    K.fiches(userId),
    K.exams(userId),
    K.examSessions(userId),
    K.lessonResults(userId),
  ];
}

/**
 * Supprime un compte et TOUTES ses données de la base : profil, index e-mail,
 * progression, favoris, calendrier, tâches et conversations. Aucune clé orpheline
 * ne subsiste ; l'opération est vérifiée puis retracée dans les journaux.
 */
export async function deleteUser(id: string): Promise<{ deletedKeys: string[] }> {
  const store = await getStorage();

  // 1) Lecture groupée du compte et de l'index global : une seule requête HTTP.
  const [user, rawIndex] = await store.getMany<StoredUser | string[]>([K.userById(id), K.users]);
  const account = (user as StoredUser | null) ?? null;

  // Toutes les clés du compte, y compris l'index e-mail, sont effacées en une
  // seule commande DEL (Redis accepte plusieurs clés). Sans ce groupage, la
  // suppression coûterait une dizaine de requêtes HTTP — à rapprocher du quota
  // gratuit d'Upstash (10 000 commandes par jour).
  const keysToDelete = [...userDataKeys(id)];
  if (account) keysToDelete.push(K.userIdByEmail(account.email));
  const uniqueKeys = [...new Set(keysToDelete)];

  // 2) Suppression + réécriture de l'index : une seule requête HTTP.
  const index = (Array.isArray(rawIndex) ? (rawIndex as string[]) : []).filter((value) => value !== id);
  if (store.delAndSet) {
    await store.delAndSet(uniqueKeys, K.users, index);
  } else {
    await store.del(uniqueKeys);
    await writeList(store, K.users, index);
  }

  // 3) Contrôle : plus aucune donnée ne doit subsister.
  const remaining = await store.get<StoredUser>(K.userById(id));
  if (remaining) {
    throw new Error(`Suppression incomplète du compte ${id}`);
  }
  console.log(`[EduMate] Compte supprimé : ${account?.email ?? id} (${uniqueKeys.length} clés effacées)`);
  return { deletedKeys: uniqueKeys };
}

/**
 * Exporte l'intégralité des données d'un compte (transparence / RGPD).
 * Utilisé par « Télécharger mes données » dans les paramètres.
 */
export async function exportUserData(id: string): Promise<Record<string, unknown>> {
  const store = await getStorage();
  // Lecture groupée : 2 requêtes HTTP au lieu de 6 (quota Upstash préservé).
  const [user, attempts, favorites, events, tasks, conversations, fiches, exams, examSessions, lessonResults] = await store.getMany<unknown>([
    K.userById(id),
    K.attempts(id),
    K.favorites(id),
    K.events(id),
    K.tasks(id),
    K.conversations(id),
    K.fiches(id),
    K.exams(id),
    K.examSessions(id),
    K.lessonResults(id),
  ]);
  const asList = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
  const account = (user as StoredUser | null) ?? null;
  return {
    exportedAt: new Date().toISOString(),
    account: account ? toPublicUser(account) : null,
    progress: { attempts: asList<QuizAttempt>(attempts), summary: computeProgress(asList<QuizAttempt>(attempts)) },
    favorites: asList<string>(favorites),
    calendar: asList<CalendarEvent>(events),
    tasks: asList<Task>(tasks),
    conversations: asList<Conversation>(conversations),
    fiches: asList<unknown>(fiches),
    planning: { exams: asList<unknown>(exams), sessions: examSessions ?? {} },
    lessons: asList<unknown>(lessonResults),
  };
}

/** Nombre de comptes enregistrés (sert à repérer le tout premier). */
export async function countUsers(): Promise<number> {
  const store = await getStorage();
  const ids = await readList<string>(store, K.users);
  return ids.length;
}

export async function listUsers(): Promise<StoredUser[]> {
  const store = await getStorage();
  const ids = await readList<string>(store, K.users);
  if (!ids.length) return [];
  // Une seule requête groupée (pipeline) au lieu de N allers-retours :
  // indispensable pour rester sous le quota gratuit d'Upstash.
  const users = await store.getMany<StoredUser>(ids.map((id) => K.userById(id)));
  return users.filter((user): user is StoredUser => Boolean(user));
}

/* ------------------------------------------------------------------ */
/*  Progression                                                        */
/* ------------------------------------------------------------------ */

export async function addAttempt(userId: string, attempt: Omit<QuizAttempt, 'id' | 'userId'>): Promise<QuizAttempt> {
  const store = await getStorage();
  const record: QuizAttempt = { ...attempt, id: newId(), userId };
  const list = await readList<QuizAttempt>(store, K.attempts(userId));
  list.push(record);
  // On borne l'historique pour éviter une croissance illimitée de la clé.
  const trimmed = list.slice(-500);
  await writeList(store, K.attempts(userId), trimmed);
  return record;
}

export async function listAttempts(userId: string): Promise<QuizAttempt[]> {
  const store = await getStorage();
  const list = await readList<QuizAttempt>(store, K.attempts(userId));
  return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export interface ProgressSummary {
  attempts: number;
  correct: number;
  total: number;
  successRate: number;
  bestScore: number;
  totalDurationSec: number;
  streakDays: number;
  bySubject: SubjectProgress[];
  byTopic: TopicMastery[];
  mastered: string[];
  toReview: string[];
  last30Days: { date: string; score: number; total: number }[];
  recent: QuizAttempt[];
}

export function computeProgress(attempts: QuizAttempt[]): ProgressSummary {
  const correct = attempts.reduce((sum, a) => sum + a.score, 0);
  const total = attempts.reduce((sum, a) => sum + a.total, 0);
  const totalDurationSec = attempts.reduce((sum, a) => sum + (a.durationSec ?? 0), 0);
  const bestScore = attempts.reduce((max, a) => Math.max(max, a.total ? a.score / a.total : 0), 0);

  const subjectMap = new Map<string, SubjectProgress>();
  for (const attempt of attempts) {
    const entry = subjectMap.get(attempt.subjectId) ?? {
      subjectId: attempt.subjectId,
      attempts: 0,
      correct: 0,
      total: 0,
    };
    entry.attempts += 1;
    entry.correct += attempt.score;
    entry.total += attempt.total;
    entry.lastPlayedAt = attempt.createdAt;
    subjectMap.set(attempt.subjectId, entry);
  }

  const topicMap = new Map<string, TopicMastery>();
  for (const attempt of attempts) {
    const entry = topicMap.get(attempt.topicId) ?? {
      topicId: attempt.topicId,
      attempts: 0,
      bestScore: 0,
      lastScore: 0,
      total: 0,
      correct: 0,
      mastered: false,
      lastPlayedAt: attempt.createdAt,
    };
    const rate = attempt.total ? attempt.score / attempt.total : 0;
    entry.attempts += 1;
    entry.bestScore = Math.max(entry.bestScore, rate);
    entry.lastScore = rate;
    entry.correct += attempt.score;
    entry.total += attempt.total;
    entry.lastPlayedAt = attempt.createdAt;
    topicMap.set(attempt.topicId, entry);
  }
  for (const entry of topicMap.values()) {
    const globalRate = entry.total ? entry.correct / entry.total : 0;
    entry.mastered = entry.attempts >= 2 && globalRate >= 0.8;
  }

  // Série de jours consécutifs d'entraînement
  const days = new Set(attempts.map((a) => a.createdAt.slice(0, 10)));
  let streakDays = 0;
  const cursor = new Date();
  cursor.setHours(12, 0, 0, 0);
  for (let i = 0; i < 400; i += 1) {
    const key = cursor.toISOString().slice(0, 10);
    if (days.has(key)) {
      streakDays += 1;
      cursor.setDate(cursor.getDate() - 1);
    } else if (i === 0) {
      // Aujourd'hui pas encore joué : on vérifie la veille avant d'arrêter.
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }

  // Agrégat des 30 derniers jours
  const last30: { date: string; score: number; total: number }[] = [];
  const dayMap = new Map<string, { score: number; total: number }>();
  for (const attempt of attempts) {
    const day = attempt.createdAt.slice(0, 10);
    const entry = dayMap.get(day) ?? { score: 0, total: 0 };
    entry.score += attempt.score;
    entry.total += attempt.total;
    dayMap.set(day, entry);
  }
  const start = new Date();
  start.setDate(start.getDate() - 29);
  for (let i = 0; i < 30; i += 1) {
    const day = start.toISOString().slice(0, 10);
    const entry = dayMap.get(day) ?? { score: 0, total: 0 };
    last30.push({ date: day, ...entry });
    start.setDate(start.getDate() + 1);
  }

  const byTopic = [...topicMap.values()];
  return {
    attempts: attempts.length,
    correct,
    total,
    successRate: total ? correct / total : 0,
    bestScore,
    totalDurationSec,
    streakDays,
    bySubject: [...subjectMap.values()],
    byTopic,
    mastered: byTopic.filter((t) => t.mastered).map((t) => t.topicId),
    toReview: byTopic
      .filter((t) => !t.mastered && t.lastScore < 0.6)
      .sort((a, b) => a.lastScore - b.lastScore)
      .map((t) => t.topicId),
    last30Days: last30,
    recent: attempts.slice(0, 8),
  };
}

/* ------------------------------------------------------------------ */
/*  Favoris                                                            */
/* ------------------------------------------------------------------ */

export async function listFavorites(userId: string): Promise<string[]> {
  const store = await getStorage();
  return readList<string>(store, K.favorites(userId));
}

export async function toggleFavorite(userId: string, topicId: string): Promise<{ favorites: string[]; added: boolean }> {
  const store = await getStorage();
  const current = await readList<string>(store, K.favorites(userId));
  const exists = current.includes(topicId);
  const next = exists ? current.filter((id) => id !== topicId) : [...current, topicId].slice(-200);
  await writeList(store, K.favorites(userId), next);
  return { favorites: next, added: !exists };
}

/* ------------------------------------------------------------------ */
/*  Calendrier & tâches                                                */
/* ------------------------------------------------------------------ */

export async function listEvents(userId: string): Promise<CalendarEvent[]> {
  const store = await getStorage();
  const list = await readList<CalendarEvent>(store, K.events(userId));
  return list.sort((a, b) => a.date.localeCompare(b.date));
}

export async function saveEvent(userId: string, event: Omit<CalendarEvent, 'userId'>): Promise<CalendarEvent[]> {
  const store = await getStorage();
  const list = await readList<CalendarEvent>(store, K.events(userId));
  const index = list.findIndex((e) => e.id === event.id);
  const record: CalendarEvent = { ...event, userId };
  if (index >= 0) list[index] = record;
  else list.push(record);
  await writeList(store, K.events(userId), list.slice(-500));
  return list.sort((a, b) => a.date.localeCompare(b.date));
}

export async function deleteEvent(userId: string, id: string): Promise<CalendarEvent[]> {
  const store = await getStorage();
  const list = (await readList<CalendarEvent>(store, K.events(userId))).filter((e) => e.id !== id);
  await writeList(store, K.events(userId), list);
  return list.sort((a, b) => a.date.localeCompare(b.date));
}

export async function listTasks(userId: string): Promise<Task[]> {
  const store = await getStorage();
  return readList<Task>(store, K.tasks(userId));
}

export async function saveTask(userId: string, task: Omit<Task, 'userId'>): Promise<Task[]> {
  const store = await getStorage();
  const list = await readList<Task>(store, K.tasks(userId));
  const index = list.findIndex((t) => t.id === task.id);
  const record: Task = { ...task, userId };
  if (index >= 0) list[index] = record;
  else list.push(record);
  await writeList(store, K.tasks(userId), list.slice(-300));
  return list;
}

export async function deleteTask(userId: string, id: string): Promise<Task[]> {
  const store = await getStorage();
  const list = (await readList<Task>(store, K.tasks(userId))).filter((t) => t.id !== id);
  await writeList(store, K.tasks(userId), list);
  return list;
}

/* ------------------------------------------------------------------ */
/*  Conversations de l'assistant                                       */
/* ------------------------------------------------------------------ */

export async function listConversations(userId: string): Promise<Conversation[]> {
  const store = await getStorage();
  const list = await readList<Conversation>(store, K.conversations(userId));
  return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function saveConversation(userId: string, conversation: Omit<Conversation, 'userId'>): Promise<Conversation[]> {
  const store = await getStorage();
  const list = await readList<Conversation>(store, K.conversations(userId));
  const index = list.findIndex((c) => c.id === conversation.id);
  const record: Conversation = { ...conversation, userId };
  if (index >= 0) list[index] = record;
  else list.push(record);
  const trimmed = list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 40);
  await writeList(store, K.conversations(userId), trimmed);
  return trimmed;
}

export async function deleteConversation(userId: string, id: string): Promise<Conversation[]> {
  const store = await getStorage();
  const list = (await readList<Conversation>(store, K.conversations(userId))).filter((c) => c.id !== id);
  await writeList(store, K.conversations(userId), list);
  return list;
}

/* ------------------------------------------------------------------ */
/*  Leçons terminées (historique, validation, temps de travail)        */
/* ------------------------------------------------------------------ */

/** Tous les terminés de leçons d'un compte, plus récents d'abord. */
export async function listLessonCompletions(userId: string): Promise<LessonCompletion[]> {
  const store = await getStorage();
  const raw = await store.get<LessonCompletion[]>(K.lessonResults(userId));
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry) => entry && typeof entry.topicId === 'string' && typeof entry.at === 'string')
    .sort((a, b) => (a.at < b.at ? 1 : -1));
}

/**
 * Enregistre un terminé de leçon (même sous 80 % : cela nourrit l'historique
 * et le temps de travail). La VALIDATION (fiche, planning) exige ≥ 80 %.
 */
export async function addLessonCompletion(userId: string, completion: LessonCompletion): Promise<LessonCompletion[]> {
  const store = await getStorage();
  const list = await listLessonCompletions(userId);
  const next = [completion, ...list].slice(0, 300);
  await store.set(K.lessonResults(userId), next);
  return next;
}

/** Agrège l'historique de leçons par sujet (page Progression, dashboard). */
export function aggregateLessons(completions: LessonCompletion[]): LessonStat[] {
  const byTopic = new Map<string, LessonCompletion[]>();
  for (const completion of completions) {
    const list = byTopic.get(completion.topicId) ?? [];
    list.push(completion);
    byTopic.set(completion.topicId, list);
  }
  const stats: LessonStat[] = [];
  for (const [topicId, list] of byTopic) {
    const topic = findTopic(topicId);
    if (!topic) continue;
    const bestRate = Math.max(...list.map((entry) => entry.rate));
    stats.push({
      topicId,
      name: topic.name,
      emoji: topic.emoji,
      color: topic.color,
      completions: list.length,
      bestRate,
      validated: bestRate >= LESSON_VALIDATE_RATIO,
      totalDurationSec: list.reduce((sum, entry) => sum + (entry.durationSec || 0), 0),
      lastAt: list[0].at,
    });
  }
  return stats.sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));
}

/** Secondes de leçon travaillées un jour donné (AAAA-MM-JJ). */
export function lessonSecondsOn(completions: LessonCompletion[], day: string): number {
  return completions
    .filter((entry) => entry.at.slice(0, 10) === day)
    .reduce((sum, entry) => sum + (entry.durationSec || 0), 0);
}
