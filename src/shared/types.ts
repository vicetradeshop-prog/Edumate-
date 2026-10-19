/**
 * EduMate — Types partagés entre le frontend et le backend.
 * Un seul fichier de vérité pour les structures de données.
 */

/* ------------------------------------------------------------------ */
/*  Catalogue pédagogique                                              */
/* ------------------------------------------------------------------ */

export type SubjectId =
  | 'mathematiques'
  | 'francais'
  | 'physique-chimie'
  | 'svt'
  | 'histoire-geographie'
  | 'philosophie'
  | 'anglais'
  | 'espagnol'
  | 'nsi'
  | 'ses';

export type LevelId = 'troisieme' | 'seconde' | 'premiere' | 'terminale';

export type Difficulty = 'facile' | 'moyen' | 'difficile';

export interface Subject {
  id: SubjectId;
  name: string;
  short: string;
  emoji: string;
  /** Palette propre à la matière (thème visuel) */
  color: string;
  colorSoft: string;
  accent: string;
  /** Motif d'arrière-plan propre à la matière */
  pattern: 'geometry' | 'books' | 'lab' | 'map' | 'tech' | 'nature' | 'globe' | 'mind' | 'language' | 'economy';
  description: string;
}

export interface Level {
  id: LevelId;
  name: string;
  short: string;
  order: number;
}

export interface Theme {
  id: string;
  subjectId: SubjectId;
  levelId: LevelId;
  name: string;
}

export interface Topic {
  id: string;
  subjectId: SubjectId;
  levelId: LevelId;
  themeId: string;
  name: string;
  /** Famille de génération ou banque de questions statique */
  source: string;
  /** Paramètres transmis au générateur */
  params?: Record<string, unknown>;
  /** Nombre de questions distinctes disponibles (9999 = génération infinie) */
  pool: number;
  /** true si les questions sont fabriquées à la volée (variation infinie) */
  generated?: boolean;
  difficulty: Difficulty;
  keywords?: string[];
}

/** Vue aplatie d'un sujet de quiz, telle qu'envoyée au client. */
export interface CatalogTopic extends Topic {
  subjectName: string;
  levelName: string;
  themeName: string;
  emoji: string;
  color: string;
  accent: string;
}

/* ------------------------------------------------------------------ */
/*  Questions & quiz                                                   */
/* ------------------------------------------------------------------ */

export type QuestionKind = 'qcm' | 'vrai-faux' | 'texte';

export interface Question {
  id: string;
  topicId: string;
  kind: QuestionKind;
  /** Énoncé (peut contenir du LaTeX entre $...$) */
  prompt: string;
  /** Propositions pour les QCM */
  options?: string[];
  /** Index de la bonne réponse (QCM) */
  answer?: number;
  /** Réponse attendue pour les questions ouvertes (normalisée) */
  accept?: string[];
  /** true pour « Vrai » */
  truth?: boolean;
  explanation: string;
  difficulty: Difficulty;
  /** Notion travaillée, affichée dans le bilan */
  skill?: string;
}

export interface QuizSession {
  topicId: string;
  questions: Question[];
  durationSec: number;
  startedAt: string;
}

/* ------------------------------------------------------------------ */
/*  Leçons interactives & révisions de quiz                            */
/* ------------------------------------------------------------------ */

/**
 * Nature d'une étape du parcours de leçon.
 *
 * Le lecteur d'étapes (client) connaît exactement un rendu par nature :
 * toute étape inconnue est ignorée plutôt que de faire planter la page.
 */
export type LessonStepKind = 'mission' | 'concept' | 'exemple' | 'exercice' | 'piege' | 'recap';

/** Exercice intégré à une leçon : corrigé immédiatement côté client. */
export interface LessonExercise {
  id: string;
  kind: QuestionKind;
  prompt: string;
  options: string[];
  /** Index de la bonne réponse (qcm / vrai-faux), null pour « texte ». */
  answer: number | null;
  /** Réponses acceptées (questions « texte »), null sinon. */
  accept: string[] | null;
  explanation: string;
  skill: string | null;
}

/**
 * Étape d'une leçon. Union discriminée sur `kind` : chaque variante porte
 * uniquement les données dont son rendu a besoin.
 */
export type LessonStep =
  | { id: string; kind: 'mission'; emoji: string; title: string; intro: string; goals: string[] }
  | { id: string; kind: 'concept'; emoji: string; title: string; points: string[]; /** true si l'IA peut enrichir cette étape. */ ai: boolean }
  | { id: string; kind: 'exemple'; emoji: string; title: string; prompt: string; answerLabel: string; solution: string[] }
  | { id: string; kind: 'exercice'; emoji: string; title: string; question: LessonExercise }
  | { id: string; kind: 'piege'; emoji: string; title: string; text: string }
  | { id: string; kind: 'recap'; emoji: string; title: string; chips: string[]; tip: string };

/** Contenu de leçon généré par l'IA (mis en cache côté serveur). */
export interface AiLessonContent {
  hook: string;
  goals: string[];
  method: string[];
  trap: string;
  tip: string;
  chips: string[];
  provider?: string;
  createdAt?: string;
}

/** Leçon complète d'un sujet, prête à être jouée étape par étape. */
export interface Lesson {
  topicId: string;
  topicName: string;
  subjectName: string;
  themeName: string;
  levelName: string;
  emoji: string;
  color: string;
  accent: string;
  difficulty: Difficulty;
  seed: number;
  steps: LessonStep[];
  /** true si un fournisseur d'IA est configuré sur ce serveur. */
  aiAvailable: boolean;
  /** Contenu IA en cache (null = jamais généré). */
  ai: AiLessonContent | null;
}

/* ------------------------------------------------------------------ */
/*  Fiches de révision automatiques                                    */
/* ------------------------------------------------------------------ */

/**
 * Enregistrement personnel : une fiche est DÉBLOQUÉE quand l'élève réussit
 * la leçon du sujet (score d'exercices ≥ 70 %). Le contenu pédagogique, lui,
 * est dérivé du catalogue + de la leçon : il n'est jamais stocké.
 */
export interface FicheRecord {
  topicId: string;
  unlockedAt: string;
  updatedAt: string;
  lessonScore: number;
  lessonTotal: number;
}

/** Une section thématique de la fiche (affichée en cascade animée). */
export interface FicheSection {
  id: string;
  icon: string;
  title: string;
  items: string[];
}

/** Carte mémo recto/verso (mode « cartes » de la fiche, animation flip 3D). */
export interface FicheFlashcard {
  id: string;
  icon: string;
  front: string;
  back: string;
}

/** Fiche de révision complète d'un sujet, prête à afficher. */
export interface Fiche {
  topicId: string;
  topicName: string;
  subjectId: string;
  subjectName: string;
  themeName: string;
  levelName: string;
  emoji: string;
  color: string;
  accent: string;
  difficulty: Difficulty;
  unlockedAt: string;
  lessonScore: number;
  lessonTotal: number;
  /** Meilleur score de quiz sur ce sujet (null = jamais joué). */
  quizBest: number | null;
  quizAttempts: number;
  sections: FicheSection[];
  /** Formules LaTeX extraites de la leçon (rendues par KaTeX). */
  formulas: string[];
  flashcards: FicheFlashcard[];
}

/* ------------------------------------------------------------------ */
/*  Planning de révision automatique                                   */
/* ------------------------------------------------------------------ */

/** Niveau auto-déclaré à la création d'un contrôle. */
export type ExamSelfLevel = 'maitrise' | 'moyen' | 'difficultes' | 'zero';

export type ExamStatus = 'actif' | 'termine';

/** Retour de l'élève après le contrôle (améliore les recommandations). */
export type ExamFeedback = 'difficile' | 'moyen' | 'bien' | 'tresbien';

/** Un contrôle / examen saisi par l'élève. */
export interface Exam {
  id: string;
  subjectId: string;
  title: string;
  /** Date du contrôle (AAAA-MM-JJ). */
  date: string;
  /** Heure facultative (HH:MM). */
  time?: string;
  /** Thème du catalogue ciblé (ex. « Suites ») : source des notions. */
  themeId?: string;
  themeName?: string;
  /** Notions concernées (identifiants de sujets du catalogue). */
  topics: string[];
  /** Temps de révision disponible par jour, en minutes. */
  dailyMinutes: number;
  selfLevel: ExamSelfLevel;
  status: ExamStatus;
  feedback?: ExamFeedback;
  grade?: number;
  gradeMax?: number;
  /** true une fois que l'élève a demandé la génération du planning. */
  planReady: boolean;
  /** Identifiant de l'événement calendrier créé automatiquement. */
  calendarEventId?: string;
  /** Correspondance séance → événement calendrier (synchronisation). */
  sessionEvents?: Record<string, string>;
  /** Journal des ajustements : pourquoi le planning a changé (du plus récent au plus ancien). */
  journal?: PlanJournalEntry[];
  createdAt: string;
  updatedAt: string;
}

/** Entrée du journal des ajustements du planning. */
export interface PlanJournalEntry {
  id: string;
  at: string;
  kind: 'generate' | 'quiz' | 'lesson' | 'session' | 'exam';
  /** Message humain, une phrase, toujours orienté « quoi faire ensuite ». */
  message: string;
}

/** État persisté d'une séance (terminée / reportée / ignorée). */
export type SessionStatus = 'prevue' | 'done' | 'postponed' | 'skipped';

export interface SessionState {
  status: SessionStatus;
  /** Nombre de reports successifs (décale la séance d'autant de jours). */
  postponedTimes: number;
  updatedAt: string;
  /** Score obtenu si la séance a été faite (quiz), pour affichage. */
  score?: number;
  total?: number;
}

/** Priorité calculée pour une notion (mêle maîtrise réelle et urgence). */
export type NotionPriorityLevel = 'urgent' | 'travail' | 'revoir' | 'maitrise';

export interface NotionPriority {
  topicId: string;
  name: string;
  emoji: string;
  color: string;
  /** Taux de réussite réel (null = jamais travaillé). */
  rate: number | null;
  /** Meilleur score de quiz sur la notion (0..1, null = jamais joué). */
  bestScore: number | null;
  attempts: number;
  errors: number;
  lastPlayedAt: string | null;
  daysSince: number | null;
  level: NotionPriorityLevel;
  /** Score de priorité 0..1 (plus haut = à traiter en premier). */
  weight: number;
  /* --- v2.5 : la notion est suivie par deux validations indépendantes --- */
  /** Quiz lié réussi à ≥ 80 %. */
  quizOk: boolean;
  /** Leçon terminée à ≥ 80 %. */
  lessonOk: boolean;
  /** quizOk && lessonOk : la notion est validée, case entière cochée. */
  validated: boolean;
  /** Explications humaines de la priorité (affichées sous la notion). */
  reasons: string[];
}

/** Un terminé de leçon enregistré (historique + temps de travail). */
export interface LessonCompletion {
  topicId: string;
  /** Score des exercices de la leçon (0..1). */
  rate: number;
  score: number;
  total: number;
  durationSec: number;
  at: string;
}

/** Leçon agrégée pour la page Progression et le tableau de bord. */
export interface LessonStat {
  topicId: string;
  name: string;
  emoji: string;
  color: string;
  completions: number;
  bestRate: number;
  /** true si au moins un terminé ≥ 80 % (leçon validée). */
  validated: boolean;
  totalDurationSec: number;
  lastAt: string;
}

export type SessionActivity = 'cours' | 'exercices' | 'quiz' | 'revision' | 'quizblanc' | 'express';

export interface SessionStep {
  min: number;
  label: string;
}

/** Une séance de révision générée automatiquement. */
export interface PlanSession {
  /** Identifiant stable (indépendant du report) : clé de l'état persisté. */
  id: string;
  examId: string;
  topicId: string;
  topicName: string;
  emoji: string;
  color: string;
  /** Date planifiée APRES application des reports (AAAA-MM-JJ). */
  date: string;
  durationMin: number;
  activity: SessionActivity;
  questionCount: number;
  exerciseCount: number;
  objective: string;
  steps: SessionStep[];
  priority: NotionPriorityLevel;
  status: SessionStatus;
  /** Route EduMate qui permet de réaliser la séance (réutilise l'existant). */
  startPath: string;
  /** Formules/rappels affichés pour les séances express. */
  reminders?: string[];
  postponedTimes: number;
  /** true si la séance a été terminée automatiquement (quiz lié joué). */
  autoDone?: boolean;
  /** Score du quiz lié ayant validé la séance (pourcentage). */
  autoScore?: number;
}

export interface PlanDay {
  date: string;
  /** « Aujourd'hui », « Demain », « Lundi 12 mai »… */
  label: string;
  isToday: boolean;
  isExamDay: boolean;
  minutes: number;
  sessions: PlanSession[];
}

/** Planning complet d'un contrôle, calculé à la demande. */
export interface ExamPlan {
  exam: Exam;
  days: PlanDay[];
  notions: NotionPriority[];
  daysLeft: number;
  /** true si la date du contrôle est passée. */
  past: boolean;
  prepPercent: number;
  totalMinutes: number;
  doneMinutes: number;
  totalQuestions: number;
  totalExercises: number;
  quizBlancCount: number;
  remainingSessions: number;
  sessionCount: number;
}

/** Vue agrégée « aujourd'hui », tous contrôles confondus. */
export interface TodayPlan {
  date: string;
  capacityMinutes: number;
  allocation: { examId: string; title: string; emoji: string; color: string; minutes: number }[];
  sessions: PlanSession[];
  nextExam: {
    exam: Exam;
    daysLeft: number;
    prepPercent: number;
    topSession: PlanSession | null;
  } | null;
}

/** Contrôle enrichi pour les listes (hub, dashboard). */
export interface ExamView {
  exam: Exam;
  daysLeft: number;
  prepPercent: number;
  remainingSessions: number;
  sessionCount: number;
  notionCount: number;
  topNotion: NotionPriority | null;
  nextSession: PlanSession | null;
}

/** Vue liste (hub des fiches) : plus légère que la fiche complète. */
export interface FicheSummary {
  topicId: string;
  topicName: string;
  subjectId: string;
  subjectName: string;
  themeName: string;
  emoji: string;
  color: string;
  unlockedAt: string;
  lessonScore: number;
  lessonTotal: number;
  quizBest: number | null;
  quizAttempts: number;
  /** Nombre de cartes mémo disponibles (affiché sur la carte du hub). */
  cardCount: number;
  sectionCount: number;
}

/** Question d'une révision de quiz : l'originale corrigée + un exercice de rattrapage. */
export interface RevisionQuestion {
  id: string;
  kind: QuestionKind;
  prompt: string;
  options: string[];
  answer: number | null;
  accept: string[] | null;
  /** Réponse donnée pendant le quiz (null en mode entraînement). */
  given: string | number | null;
  /** null en mode entraînement (question jamais jouée). */
  correct: boolean | null;
  explanation: string;
  skill: string | null;
  /** Exercise neuf sur la même notion, proposé après une erreur. */
  remediation: LessonExercise | null;
}

/**
 * Charge de la page « Révision du quiz ».
 *
 * `mode = 'quiz'` : on rejoue le corrigé d'un essai réel (graine conservée).
 * `mode = 'entrainement'` : pas d'essai exploitable (historique antérieur à la
 * conservation de la graine, catalogue régénéré…) → on génère une session neuve.
 */
export interface RevisionPayload {
  mode: 'quiz' | 'entrainement';
  topicId: string;
  topicName: string;
  subjectName: string;
  themeName: string;
  emoji: string;
  color: string;
  accent: string;
  attempt: { id: string; score: number; total: number; percent: number; createdAt: string } | null;
  items: RevisionQuestion[];
  seed: number;
}

/* ------------------------------------------------------------------ */
/*  Utilisateurs                                                       */
/* ------------------------------------------------------------------ */

export interface Preferences {
  theme: 'clair' | 'sombre' | 'auto';
  accent: string;
  density: 'confort' | 'compact';
  animations: boolean;
  sounds: boolean;
  dailyGoal: number;
  focusMusic: string;
}

export interface UserProfile {
  firstName: string;
  lastName?: string;
  age?: number;
  email: string;
  school?: string;
  level?: LevelId | string;
  subjects: string[];
  avatar: string;
  tagline?: string;
  onboarded: boolean;
}

export interface User extends UserProfile {
  id: string;
  role: 'eleve' | 'admin';
  createdAt: string;
  preferences: Preferences;
  /** true pour le compte de démonstration partagé (lecture seule) */
  demo?: boolean;
}

/** Profil public (sans données sensibles) renvoyé par l'API. */
export type PublicUser = User;

/* ------------------------------------------------------------------ */
/*  Progression                                                        */
/* ------------------------------------------------------------------ */

export interface QuizAttempt {
  id: string;
  userId: string;
  topicId: string;
  subjectId: SubjectId;
  levelId: LevelId;
  themeName: string;
  topicName: string;
  score: number;
  total: number;
  durationSec: number;
  answers: { questionId: string; correct: boolean; given?: string | number }[];
  /**
   * Graine de la session : permet de régénérer EXACTEMENT les mêmes questions
   * pour la page de révision interactive. Absente sur les essais antérieurs à
   * son introduction (la révision bascule alors en mode « entraînement »).
   */
  seed?: number;
  createdAt: string;
}

export interface SubjectProgress {
  subjectId: SubjectId;
  attempts: number;
  correct: number;
  total: number;
  lastPlayedAt?: string;
}

export interface TopicMastery {
  topicId: string;
  attempts: number;
  bestScore: number;
  lastScore: number;
  total: number;
  correct: number;
  mastered: boolean;
  lastPlayedAt: string;
}

/* ------------------------------------------------------------------ */
/*  Organisation                                                       */
/* ------------------------------------------------------------------ */

export type EventKind = 'devoir' | 'travail' | 'examen' | 'autre';

export interface CalendarEvent {
  id: string;
  userId: string;
  title: string;
  kind: EventKind;
  subjectId?: SubjectId | string;
  date: string; // AAAA-MM-JJ
  time?: string; // HH:MM
  notes?: string;
  done: boolean;
  createdAt: string;
}

export interface Task {
  id: string;
  userId: string;
  title: string;
  subjectId?: string;
  dueDate?: string;
  done: boolean;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/*  Assistant IA                                                       */
/* ------------------------------------------------------------------ */

export type TutorMode = 'expliquer' | 'reformuler' | 'methode' | 'exercices' | 'questions' | 'corriger';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
}

export interface TutorRequest {
  subjectId?: string;
  level?: string;
  mode: TutorMode;
  message: string;
  history?: ChatMessage[];
}

export interface TutorResponse {
  content: string;
  provider: string;
  offline: boolean;
}

export interface Conversation {
  id: string;
  userId: string;
  title: string;
  subjectId?: string;
  level?: string;
  messages: ChatMessage[];
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/*  API                                                                */
/* ------------------------------------------------------------------ */

export interface ApiError {
  error: string;
  message: string;
  details?: unknown;
}

export interface HealthResponse {
  ok: boolean;
  app: string;
  version: string;
  uptime: number;
  database: 'upstash' | 'file' | 'memory';
  databaseReady: boolean;
  ai: { provider: string; configured: boolean };
  catalog: { subjects: number; topics: number; playable: number; questions: number };
  time: string;
}

/* ------------------------------------------------------------------ */
/*  Fil d'actualités, sondages et notifications                        */
/* ------------------------------------------------------------------ */

/** Nature d'un élément du fil. */
export type FeedKind = 'news' | 'poll';

/** Importance affichée (couleur et icône côté client). */
export type FeedImportance = 'info' | 'update' | 'urgent';

/** Élément publié par un administrateur dans le fil. */
export interface FeedItem {
  id: string;
  kind: FeedKind;
  title: string;
  /** Corps en Markdown léger (rendu par `renderRichText`, qui échappe le HTML). */
  body: string;
  importance: FeedImportance;
  /** Identifiant du sondage associé, quand `kind === 'poll'`. */
  pollId?: string;
  authorId?: string;
  authorName?: string;
  createdAt: string;
  /** Lien interne facultatif (ex. `/quiz`, `/parametres`). */
  link?: string;
}

/** Option d'un sondage. */
export interface PollOption {
  id: string;
  label: string;
  /** Nombre de votes. */
  count: number;
}

export interface Poll {
  id: string;
  question: string;
  options: PollOption[];
  /** Un seul vote par élève (`false` = cases à cocher multiples). */
  singleChoice: boolean;
  createdAt: string;
  /** Date de clôture ISO, ou null si le sondage reste ouvert. */
  closesAt: string | null;
  closed: boolean;
  voters: number;
}

/** État de lecture d'un élève pour le fil. */
export interface FeedReadState {
  /** Identifiants déjà lus (borné). */
  readIds: string[];
  /** Dernier marquage global « tout lire ». */
  readAllAt: string | null;
}

/** Réponse de `GET /api/feed`. */
export interface FeedResponse {
  items: FeedItem[];
  polls: Record<string, Poll>;
  /** Identifiants d'options votés par l'élève, par sondage. */
  myVotes: Record<string, string[]>;
  unreadCount: number;
  readIds: string[];
  readAllAt: string | null;
}
