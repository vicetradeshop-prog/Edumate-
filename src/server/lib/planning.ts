/**
 * EduMate — Planning de révision automatique.
 *
 * Le planning n'est JAMAIS stocké tel quel : il est recalculé à chaque lecture
 * à partir (a) du contrôle, (b) de la maîtrise RÉELLE de l'élève (essais de
 * quiz), (c) des états de séances persistés (terminée / reportée / ignorée).
 * Conséquence : dès qu'un quiz est joué, les priorités et les séances futures
 * s'adaptent toutes seules — le planning est vivant par construction.
 *
 * Réutilisations de l'existant (aucun système parallèle) :
 *   - maîtrise par notion  : computeProgress() de lib/store.js ;
 *   - séances « cours »    : route /lecons/:topicId ;
 *   - séances questions    : route /quiz/:topicId/jouer ;
 *   - séances révision     : route /quiz/:topicId/revision ;
 *   - rappels/formules     : buildFicheContent() de lib/fiches.js ;
 *   - calendrier           : un événement « examen » est créé avec le contrôle.
 */
import type {
  Exam,
  ExamPlan,
  PlanJournalEntry,
  LessonCompletion,
  ExamSelfLevel,
  NotionPriority,
  NotionPriorityLevel,
  PlanDay,
  PlanSession,
  QuizAttempt,
  SessionState,
  SessionStatus,
  TodayPlan,
} from '../../shared/types.js';
import { findTopic, getCatalog } from './catalog.js';
import { buildFicheContent, buildFicheLesson, listFicheRecords } from './fiches.js';

export { listFicheRecords };
import { computeProgress, deleteEvent, K, LESSON_VALIDATE_RATIO, listEvents, saveEvent, type ProgressSummary } from './store.js';
import { getStorage } from './storage.js';
import { newId } from './auth.js';

/* ------------------------------------------------------------------ */
/*  Petits utilitaires de date                                         */
/* ------------------------------------------------------------------ */

/**
 * Jour de référence de l'application : fuseau Europe/Paris (public cible).
 * En UTC brut, un élève français travaillant à 23 h verrait « aujourd'hui »
 * basculer sur le lendemain : toutes les règles (verrous, séances du jour,
 * rapports) auraient un jour de décalage. Paris fait foi côté serveur comme
 * côté client (`appToday()` de lib/planningUi.ts).
 */
export function todayKey(now = new Date()): string {
  try {
    return new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

function parseDay(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

function addDays(date: string, delta: number): string {
  const day = parseDay(date);
  day.setUTCDate(day.getUTCDate() + delta);
  return day.toISOString().slice(0, 10);
}

/** Nombre de jours entre aujourd'hui et la date cible (0 = aujourd'hui). */
export function daysUntil(date: string, now = new Date()): number {
  const diff = parseDay(date).getTime() - parseDay(todayKey(now)).getTime();
  return Math.round(diff / 86_400_000);
}

function dayLabel(date: string, now = new Date()): string {
  const delta = daysUntil(date, now);
  if (delta === 0) return 'Aujourd’hui';
  if (delta === 1) return 'Demain';
  const day = parseDay(date);
  const label = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(day);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function round5(value: number): number {
  return Math.max(5, Math.round(value / 5) * 5);
}

/* ------------------------------------------------------------------ */
/*  Priorisation intelligente des notions                              */
/* ------------------------------------------------------------------ */

const LEVEL_BASE: Record<ExamSelfLevel, number> = {
  maitrise: 0.85,
  moyen: 0.6,
  difficultes: 0.4,
  zero: 0.15,
};

export const PRIORITY_META: Record<NotionPriorityLevel, { label: string; dot: string; tone: 'danger' | 'warning' | 'primary' | 'success' }> = {
  urgent: { label: 'Urgent', dot: '🔴', tone: 'danger' },
  travail: { label: 'À travailler', dot: '🟠', tone: 'warning' },
  revoir: { label: 'À revoir', dot: '🟡', tone: 'primary' },
  maitrise: { label: 'Maîtrisé', dot: '🟢', tone: 'success' },
};

/**
 * Priorité d'une notion : maîtrise réelle (taux, erreurs, ancienneté),
 * corrigée par le niveau auto-déclaré et l'urgence du contrôle.
 * Une notion jamais travaillée hérite du niveau déclaré : pas de donnée
 * ne veut pas dire « pas de problème ».
 */
export function notionPriority(
  topicId: string,
  summary: ProgressSummary,
  selfLevel: ExamSelfLevel,
  daysLeft: number,
  lessonOk = false,
): NotionPriority | null {
  const topic = findTopic(topicId);
  if (!topic) return null;
  const mastery = summary.byTopic.find((entry) => entry.topicId === topicId);
  const attempts = mastery?.attempts ?? 0;
  const rate = attempts > 0 && mastery ? mastery.correct / Math.max(1, mastery.total) : null;
  const best = attempts > 0 && mastery ? mastery.bestScore : null;
  const errors = mastery ? Math.max(0, mastery.total - mastery.correct) : 0;
  const lastPlayedAt = attempts > 0 && mastery ? mastery.lastPlayedAt : null;
  const daysSince = lastPlayedAt ? Math.max(0, Math.round((Date.now() - Date.parse(lastPlayedAt)) / 86_400_000)) : null;

  /* ------------------------- Validation en deux cases ------------------------ */
  const quizOk = best !== null && best >= LESSON_VALIDATE_RATIO;
  const validated = quizOk && lessonOk;

  /* -------------------------- Score de priorité ---------------------------- */
  // Maîtrise effective : réel si joué, sinon niveau auto-déclaré.
  const base = rate ?? LEVEL_BASE[selfLevel];
  const weakness = 1 - base;
  // Pression du contrôle : plus il est proche, plus les faiblesses pèsent.
  const pressure = daysLeft <= 1 ? 0.22 : daysLeft <= 3 ? 0.16 : daysLeft <= 7 ? 0.1 : daysLeft <= 14 ? 0.05 : 0.02;
  // Ancienneté : une notion non revue se dégrade (jamais jouée = encore pire).
  const staleness = daysSince === null ? 0.08 : Math.min(0.12, daysSince * 0.01);
  // Masse d'erreurs accumulées.
  const errorMass = Math.min(0.12, errors * 0.008);
  // Cases manquantes : leçon non validée / quiz sous le seuil.
  const gaps = (lessonOk ? 0 : 0.08) + (quizOk ? 0 : 0.06);
  let weight = 0.6 * weakness + pressure + staleness + errorMass + gaps;
  if (validated) weight = Math.min(weight, 0.18); // notion validée : entretien seul
  weight = Math.max(0, Math.min(1, weight));

  const level: NotionPriorityLevel = validated
    ? 'maitrise'
    : weight >= 0.62
      ? 'urgent'
      : weight >= 0.42
        ? 'travail'
        : weight >= 0.25
          ? 'revoir'
          : 'maitrise';

  /* --------------------- Raisons lisibles (affichées) ---------------------- */
  const reasons: string[] = [];
  reasons.push(rate === null ? 'jamais jouée' : `${Math.round(rate * 100)} % de réussite`);
  if (errors > 0) reasons.push(`${errors} erreur${errors > 1 ? 's' : ''}`);
  reasons.push(daysSince === null ? 'jamais révisée' : `non revue depuis ${daysSince} j`);
  reasons.push(daysLeft <= 1 ? 'contrôle imminent' : daysLeft <= 3 ? `J-${daysLeft} : contrôle proche` : `J-${daysLeft}`);
  if (!validated) {
    if (!quizOk && attempts > 0 && !lessonOk) reasons.push('leçon à valider + quiz à repasser ≥ 80 %');
    else if (!quizOk && attempts > 0) reasons.push('quiz à repasser ≥ 80 %');
    else if (!lessonOk && !quizOk) reasons.push('leçon + quiz à valider');
    else if (!lessonOk) reasons.push('leçon à valider');
    else reasons.push('quiz à repasser ≥ 80 %');
  } else {
    reasons.push('notion validée ✔');
  }

  return {
    topicId,
    name: topic.name,
    emoji: topic.emoji,
    color: topic.color,
    rate,
    bestScore: best,
    attempts,
    errors,
    lastPlayedAt,
    daysSince,
    level,
    weight,
    quizOk,
    lessonOk,
    validated,
    reasons,
  };
}

export function prioritiesForExam(
  exam: Exam,
  summary: ProgressSummary,
  daysLeft: number,
  lessonResults: LessonCompletion[] = [],
): NotionPriority[] {
  const lessonOkFor = new Set(
    lessonResults.filter((entry) => entry.rate >= LESSON_VALIDATE_RATIO).map((entry) => entry.topicId),
  );
  return exam.topics
    .map((topicId) => notionPriority(topicId, summary, exam.selfLevel, daysLeft, lessonOkFor.has(topicId)))
    .filter((entry): entry is NotionPriority => entry !== null)
    .sort((a, b) => b.weight - a.weight);
}

/** Notions proposées quand l'élève n'en a renseigné aucune. */
export function suggestTopics(subjectId: string, summary: ProgressSummary, levelId?: string): string[] {
  // 1) les sujets fragiles de la matière (toReview) ;
  const weak = summary.toReview.filter((topicId) => findTopic(topicId)?.subjectId === subjectId);
  if (weak.length >= 3) return weak.slice(0, 6);
  // 2) sinon les sujets déjà joués et non maîtrisés ;
  const played = summary.byTopic
    .filter((entry) => !entry.mastered && findTopic(entry.topicId)?.subjectId === subjectId)
    .sort((a, b) => a.lastScore - b.lastScore)
    .map((entry) => entry.topicId);
  const merged = [...new Set([...weak, ...played])];
  if (merged.length >= 3) return merged.slice(0, 6);
  // 3) sinon des sujets du catalogue au niveau de l'élève (jamais de vide).
  const catalog = getCatalog().topics.filter(
    (topic) => topic.subjectId === subjectId && (!levelId || topic.levelId === levelId),
  );
  const pool = catalog.length ? catalog : getCatalog().topics.filter((topic) => topic.subjectId === subjectId);
  return pool.slice(0, 4).map((topic) => topic.id);
}

/* ------------------------------------------------------------------ */
/*  Génération du planning                                             */
/* ------------------------------------------------------------------ */

const ACTIVITY_LABEL: Record<PlanSession['activity'], string> = {
  cours: 'Découverte / cours',
  exercices: 'Exercices ciblés',
  quiz: 'Entraînement quiz',
  revision: 'Révision des erreurs',
  quizblanc: 'Quiz blanc',
  express: 'Révision express',
};

function startPathFor(activity: PlanSession['activity'], topicId: string): string {
  switch (activity) {
    case 'cours':
      return `/lecons/${encodeURIComponent(topicId)}`;
    case 'exercices':
    case 'quiz':
    case 'quizblanc':
      return `/quiz/${encodeURIComponent(topicId)}/jouer`;
    case 'revision':
    case 'express':
      return `/quiz/${encodeURIComponent(topicId)}/revision`;
    default:
      return `/quiz/${encodeURIComponent(topicId)}`;
  }
}

/** Rappels courts (formules + pièges) pour la séance express du jour J. */
function expressReminders(topicId: string): string[] {
  const topic = findTopic(topicId);
  if (!topic) return [];
  try {
    const lesson = buildFicheLesson(topic, null);
    const { formulas, sections } = buildFicheContent(lesson);
    const traps = sections.find((section) => section.id === 'pieges')?.items.slice(0, 2) ?? [];
    const keeps = sections.find((section) => section.id === 'retenir')?.items.slice(0, 2) ?? [];
    return [...keeps, ...traps, ...formulas.slice(0, 2).map((tex) => `$${tex}$`)];
  } catch {
    return [];
  }
}

interface BlockSpec {
  topic: NotionPriority;
  activity: PlanSession['activity'];
  durationMin: number;
  questionCount: number;
  exerciseCount: number;
  objective: string;
  steps: { min: number; label: string }[];
}

function blockFor(notion: NotionPriority, minutes: number, seen: boolean, daysLeft: number): BlockSpec {
  const base = { topic: notion };
  // Notion jamais vue ou très faible + temps suffisant → on commence par le cours.
  if (!seen && (notion.rate === null || notion.rate < 0.4) && minutes >= 15) {
    return {
      ...base,
      activity: 'cours',
      durationMin: minutes,
      questionCount: 0,
      exerciseCount: 0,
      objective: `Comprendre « ${notion.name} » de zéro : mission, notions clés et pièges.`,
      steps: [
        { min: Math.round(minutes * 0.6), label: 'Leçon interactive (mission + notions clés)' },
        { min: minutes - Math.round(minutes * 0.6), label: 'Relire le bilan et noter 3 idées clés' },
      ],
    };
  }
  if (notion.level === 'maitrise') {
    return {
      ...base,
      activity: 'revision',
      durationMin: Math.max(10, minutes - 5),
      questionCount: 5,
      exerciseCount: 0,
      objective: `Entretenir « ${notion.name} » : revoir seulement ce qui fut fragile.`,
      steps: [
        { min: 5, label: 'Relire les points clés / cartes mémo' },
        { min: Math.max(5, minutes - 10), label: '5 questions de contrôle espacé' },
      ],
    };
  }
  if (minutes <= 15) {
    return {
      ...base,
      activity: 'exercices',
      durationMin: minutes,
      questionCount: Math.max(4, Math.round(minutes / 2)),
      exerciseCount: 1,
      objective: `Série courte sur « ${notion.name} » pour ancrer les réflexes.`,
      steps: [
        { min: 3, label: 'Relire la notion (fiche ou leçon)' },
        { min: minutes - 6, label: `${Math.max(4, Math.round(minutes / 2))} questions ciblées` },
        { min: 3, label: 'Corriger ses erreurs à chaud' },
      ],
    };
  }
  const questions = Math.max(6, Math.round(minutes / 2.2));
  return {
    ...base,
    activity: daysLeft <= 2 ? 'quiz' : 'exercices',
    durationMin: minutes,
    questionCount: questions,
    exerciseCount: 2,
    objective: `Faire monter « ${notion.name} » : questions progressives puis exercices corrigés.`,
    steps: [
      { min: Math.max(5, Math.round(minutes * 0.3), ), label: 'Revoir la notion (leçon ou fiche)' },
      { min: Math.max(5, Math.round(minutes * 0.45)), label: `${questions} questions ciblées` },
      { min: Math.max(5, Math.round(minutes * 0.25)), label: '2 exercices + correction détaillée' },
    ],
  };
}

/**
 * Construit le planning complet d'un contrôle.
 *
 * @param states états persistés des séances (terminée/reportée/ignorée).
 */
export function buildExamPlan(
  exam: Exam,
  attempts: QuizAttempt[],
  states: Record<string, SessionState>,
  options: { lessonResults?: LessonCompletion[]; now?: Date } = {},
): ExamPlan {
  const now = options.now ?? new Date();
  const lessonResults = options.lessonResults ?? [];
  const summary = computeProgress(attempts);
  const today = todayKey(now);
  const daysLeft = daysUntil(exam.date, now);
  const notions = prioritiesForExam(exam, summary, Math.max(0, daysLeft), lessonResults);

  /* Contrôle déjà passé : plus aucun jour à planifier (jamais de séances
     fantômes après la date). */
  if (daysLeft < 0) {
    return {
      exam,
      days: [],
      notions,
      daysLeft,
      past: true,
      prepPercent: 100,
      totalMinutes: 0,
      doneMinutes: 0,
      totalQuestions: 0,
      totalExercises: 0,
      quizBlancCount: 0,
      remainingSessions: 0,
      sessionCount: 0,
    };
  }

  /* Répartition du temps quotidien entre plusieurs contrôles actifs :
     proportionnelle à l'urgence (proximité × faiblesses), plafonnée au temps
     déclaré pour ce contrôle. Avec un seul contrôle : tout son budget. */
  const capacity = exam.dailyMinutes;

  const days: PlanDay[] = [];
  const sessions: PlanSession[] = [];
  const seenTopics = new Set<string>();

  /* Jours disponibles : du jour courant jusqu'au jour du contrôle inclus.
     Contrôle déjà passé : une unique séance express symbolique. */
  const horizon = Math.max(0, daysLeft);
  const dayDates: string[] = [];
  for (let offset = 0; offset <= horizon; offset += 1) dayDates.push(addDays(today, offset));
  if (!dayDates.length) dayDates.push(today);

  const normalDays = dayDates.filter((date) => date !== exam.date && date !== addDays(exam.date, -1));
  const notionQueue = [...notions];
  // Les notions maîtrisées passent après : le temps va d'abord aux faiblesses.
  notionQueue.sort((a, b) => b.weight - a.weight);

  let notionCursor = 0;
  let totalMinutes = 0;
  let doneMinutes = 0;

  const pushSession = (rawSession: PlanSession): void => {
    // Durées toujours entières (affichages, totaux et calendrier lisibles).
    const session: PlanSession = { ...rawSession, durationMin: Math.max(5, Math.round(rawSession.durationMin)) };
    const state = states[session.id];
    if (state) {
      session.status = state.status;
      session.postponedTimes = state.postponedTimes ?? 0;
      if (state.status === 'postponed') {
        // Report : la séance glisse au jour suivant (sans jamais dépasser
        // le jour du contrôle). Le regroupement par jour se fait PLUS BAS,
        // donc la séance apparaît bien à sa nouvelle date — le reste du
        // planning est recalculé autour, rien n'est supprimé.
        const shifted = addDays(session.date, Math.max(1, state.postponedTimes));
        session.date = shifted <= exam.date ? shifted : exam.date;
      }
    }
    if (state?.status === 'skipped') return; // ignorée : hors planning visible
    sessions.push(session);
  };

  for (const date of dayDates) {
    const isExamDay = date === exam.date;
    const isQuizBlancDay = !isExamDay && date === addDays(exam.date, -1) && horizon >= 2;
    if (isExamDay) {
      /* Jour J : révision express courte (5-10 min), jamais une grosse session. */
      const top = notionQueue[0];
      const duration = capacity >= 30 ? 10 : 5;
      const reminders = top ? expressReminders(top.topicId) : [];
      const session: PlanSession = {
        id: `${exam.id}|${date}|express`,
        examId: exam.id,
        topicId: top?.topicId ?? exam.topics[0] ?? '',
        topicName: top?.name ?? exam.title,
        emoji: top?.emoji ?? '⚡',
        color: top?.color ?? '#6c5ce7',
        date,
        durationMin: duration,
        activity: 'express',
        questionCount: 5,
        exerciseCount: 0,
        objective: 'Réveil mémoire : formules essentielles et TES erreurs fréquentes, rien de plus.',
        steps: [
          { min: 2, label: 'Relire les rappels ci-dessous' },
          { min: duration - 4, label: '5 questions importantes, sans stress' },
          { min: 2, label: 'Un dernier œil sur tes pièges personnels' },
        ],
        priority: top?.level ?? 'revoir',
        status: 'prevue',
        startPath: startPathFor('express', top?.topicId ?? exam.topics[0] ?? ''),
        reminders,
        postponedTimes: 0,
      };
      pushSession(session);
    } else if (isQuizBlancDay) {
      /* Veille du contrôle : quiz blanc sur les notions importantes. */
      const targets = notionQueue.filter((notion) => notion.level !== 'maitrise').slice(0, 4);
      const pool = targets.length ? targets : notionQueue.slice(0, 3);
      const main = pool[0] ?? notionQueue[0];
      const questions = Math.max(6, Math.min(15, pool.length * 4));
      const session: PlanSession = {
        id: `${exam.id}|${date}|quizblanc`,
        examId: exam.id,
        topicId: main?.topicId ?? exam.topics[0] ?? '',
        topicName: pool.length > 1 ? `${pool.length} notions clés` : (main?.name ?? exam.title),
        emoji: '📝',
        color: main?.color ?? '#6c5ce7',
        date,
        durationMin: Math.min(capacity, Math.max(15, Math.round(questions * 1.4))),
        activity: 'quizblanc',
        questionCount: questions,
        exerciseCount: 0,
        objective: 'Conditions réelles : un quiz blanc couvrant les notions importantes, difficulté adaptée.',
        steps: [
          { min: 3, label: 'Respirer, lire chaque énoncé deux fois' },
          { min: Math.max(5, Math.min(capacity, Math.round(questions * 1.4)) - 6), label: `${questions} questions en conditions d'examen` },
          { min: 3, label: 'Noter les 2 dernières faiblesses pour demain matin' },
        ],
        priority: main?.level ?? 'travail',
        status: 'prevue',
        startPath: startPathFor('quizblanc', main?.topicId ?? exam.topics[0] ?? ''),
        postponedTimes: 0,
      };
      pushSession(session);
    } else {
      /* Jour normal : blocs répartis sur les notions prioritaires. */
      let budget = capacity;
      const localQueue = [...notionQueue];
      let guard = 0;
      while (budget >= 10 && localQueue.length && guard < 6) {
        guard += 1;
        // Pick next notion: cycle through priority order, skip mastered once seen twice.
        const notion = localQueue[notionCursor % localQueue.length];
        notionCursor += 1;
        if (!notion) break;
        const seen = seenTopics.has(notion.topicId);
        if (notion.level === 'maitrise' && seen && budget < 30) continue;
        const share = localQueue.length === 1 ? budget : Math.min(budget, Math.max(10, round5(capacity / Math.min(3, localQueue.length))));
        const duration = Math.min(budget, share);
        if (duration < 10) break;
        const spec = blockFor(notion, duration, seen, daysLeft);
        const session: PlanSession = {
          id: `${exam.id}|${date}|${notion.topicId}|${spec.activity}|${guard}`,
          examId: exam.id,
          topicId: notion.topicId,
          topicName: notion.name,
          emoji: notion.emoji,
          color: notion.color,
          date,
          durationMin: duration,
          activity: spec.activity,
          questionCount: spec.questionCount,
          exerciseCount: spec.exerciseCount,
          objective: spec.objective,
          steps: spec.steps,
          priority: notion.level,
          status: 'prevue',
          startPath: startPathFor(spec.activity, notion.topicId),
          postponedTimes: 0,
        };
        pushSession(session);
        seenTopics.add(notion.topicId);
        budget -= duration;
      }
    }

    void isExamDay;
  }

  /* ------------------------------------------------------------------ */
  /*  Détection automatique de complétion (quiz liés)                     */
  /*                                                                      */
  /*  Trois règles, cohérentes avec le reste d'EduMate :                   */
  /*   1. anti-rétroactivité : seuls les essais POSTÉRIEURS à la création   */
  /*      du contrôle comptent ;                                          */
  /*   2. RÉUSSITE exigée : un essai sous 80 % ne valide RIEN — la séance   */
  /*      reste à faire et l'élève est invité à rejouer (comme pour les    */
  /*      leçons). Un échec ne doit jamais être compté comme du travail    */
  /*      fait ;                                                          */
  /*   3. un essai réussi valide une seule séance, dans l'ordre du plan.   */
  /*  Les séances « cours » suivent la même logique via les leçons          */
  /*  terminées à ≥ 80 % après la création du contrôle.                    */
  /* ------------------------------------------------------------------ */
  const cutoff = Date.parse(exam.createdAt);
  const attemptsByTopic = new Map<string, QuizAttempt[]>();
  for (const attempt of attempts) {
    if (!exam.topics.includes(attempt.topicId)) continue;
    if (Date.parse(attempt.createdAt) < cutoff) continue;
    if (attempt.total <= 0 || attempt.score / attempt.total < LESSON_VALIDATE_RATIO) continue; // essai non réussi
    const list = attemptsByTopic.get(attempt.topicId) ?? [];
    list.push(attempt);
    attemptsByTopic.set(attempt.topicId, list);
  }
  for (const list of attemptsByTopic.values()) list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  // Leçon TERMINÉE (≥ 80 %) après la création du contrôle → séance « cours » validée.
  const lessonDoneTopics = new Set(
    lessonResults
      .filter((entry) => exam.topics.includes(entry.topicId) && entry.rate >= LESSON_VALIDATE_RATIO && Date.parse(entry.at) >= cutoff)
      .map((entry) => entry.topicId),
  );
  const quizCursor = new Map<string, number>();
  for (const session of sessions) {
    // Une séance reportée peut aussi être validée par un quiz réussi :
    // le report déplace le jour, il n'annule pas le travail fait.
    if (session.status !== 'prevue' && session.status !== 'postponed') continue;
    if (session.activity === 'cours') {
      if (lessonDoneTopics.has(session.topicId)) {
        session.status = 'done';
        session.autoDone = true;
      }
      continue;
    }
    if (session.activity === 'exercices' || session.activity === 'quiz' || session.activity === 'quizblanc') {
      const list = attemptsByTopic.get(session.topicId) ?? [];
      const used = quizCursor.get(session.topicId) ?? 0;
      if (used < list.length) {
        const attempt = list[used];
        quizCursor.set(session.topicId, used + 1);
        session.status = 'done';
        session.autoDone = true;
        session.autoScore = attempt.total > 0 ? Math.round((attempt.score / attempt.total) * 100) : undefined;
      }
    }
  }

  /* Regroupement par date EFFECTIVE (après reports) : une séance reportée
     apparaît bien sur son nouveau jour, et les totaux suivent. */
  for (const date of dayDates) {
    const daySessions = sessions.filter((session) => session.date === date);
    for (const session of daySessions) {
      totalMinutes += session.durationMin;
      if (session.status === 'done') doneMinutes += session.durationMin;
    }
    days.push({
      date,
      label: dayLabel(date, now),
      isToday: date === today,
      isExamDay: date === exam.date,
      minutes: daySessions.reduce((sum, session) => sum + session.durationMin, 0),
      sessions: daySessions,
    });
  }

  const active = sessions;
  const remaining = active.filter((session) => session.status !== 'done' && session.date >= today);
  const prepPercent = totalMinutes > 0 ? Math.round((doneMinutes / totalMinutes) * 100) : 0;

  return {
    exam,
    days,
    notions,
    daysLeft,
    past: false,
    prepPercent,
    totalMinutes,
    doneMinutes,
    totalQuestions: active.reduce((sum, session) => sum + session.questionCount, 0),
    totalExercises: active.reduce((sum, session) => sum + session.exerciseCount, 0),
    quizBlancCount: active.filter((session) => session.activity === 'quizblanc').length,
    remainingSessions: remaining.length,
    sessionCount: active.length,
  };
}

/* ------------------------------------------------------------------ */
/*  Vue « aujourd'hui » multi-contrôles                                */
/* ------------------------------------------------------------------ */

/** Poids d'urgence d'un contrôle (proximité × faiblesses restantes). */
function examUrgency(plan: ExamPlan): number {
  const weakness = plan.notions.length ? plan.notions.reduce((sum, notion) => sum + notion.weight, 0) / plan.notions.length : 0.5;
  const proximity = plan.daysLeft <= 0 ? 3 : plan.daysLeft <= 2 ? 2.2 : plan.daysLeft <= 5 ? 1.5 : 1;
  return (0.35 + weakness) * proximity;
}

export function buildTodayPlan(
  exams: Exam[],
  attempts: QuizAttempt[],
  statesByExam: Record<string, Record<string, SessionState>>,
  options: { lessonResults?: LessonCompletion[]; now?: Date } = {},
): TodayPlan {
  const now = options.now ?? new Date();
  const lessonResults = options.lessonResults ?? [];
  const today = todayKey(now);
  const active = exams.filter((exam) => exam.status === 'actif' && daysUntil(exam.date, now) >= 0);
  const plans = active.map((exam) => buildExamPlan(exam, attempts, statesByExam[exam.id] ?? {}, { lessonResults, now }));

  /* Capacité quotidienne de l'élève = le plus grand budget déclaré
     (c'est son temps disponible global), répartie entre les contrôles. */
  const capacity = plans.length ? Math.max(...plans.map((plan) => plan.exam.dailyMinutes)) : 0;
  const weights = plans.map(examUrgency);
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0) || 1;

  const allocation: TodayPlan['allocation'] = [];
  const sessions: PlanSession[] = [];

  plans.forEach((plan, index) => {
    const allocated = plans.length === 1 ? plan.exam.dailyMinutes : round5((capacity * weights[index]) / weightSum);
    const budget = Math.min(allocated, plan.exam.dailyMinutes);
    const dayPlan = plan.days.find((day) => day.date === today);
    const pending = (dayPlan?.sessions ?? []).filter((session) => session.status === 'prevue' || session.status === 'postponed');
    if (!pending.length) return;

    // On remplit le budget avec les séances du jour, priorités en tête.
    let left = budget;
    const chosen: PlanSession[] = [];
    for (const session of pending) {
      if (left <= 0) break;
      chosen.push(session);
      left -= session.durationMin;
    }
    if (!chosen.length) return;
    allocation.push({
      examId: plan.exam.id,
      title: plan.exam.title,
      emoji: findTopic(plan.exam.topics[0] ?? '')?.emoji ?? subjectEmoji(plan.exam.subjectId),
      color: findTopic(plan.exam.topics[0] ?? '')?.color ?? '#6c5ce7',
      minutes: chosen.reduce((sum, session) => sum + session.durationMin, 0),
    });
    sessions.push(...chosen);
  });

  sessions.sort((a, b) => (a.priority === b.priority ? a.durationMin - b.durationMin : weightOf(a.priority) - weightOf(b.priority)));

  const next = plans
    .slice()
    .sort((a, b) => a.daysLeft - b.daysLeft)[0];
  const nextDaySessions = next?.days.find((day) => day.date === today)?.sessions.filter((session) => session.status !== 'done' && session.status !== 'skipped') ?? [];

  return {
    date: today,
    capacityMinutes: capacity,
    allocation,
    sessions,
    nextExam: next
      ? {
          exam: next.exam,
          daysLeft: next.daysLeft,
          prepPercent: next.prepPercent,
          // Uniquement une séance jouable AUJOURD'HUI : jamais de bouton
          // « Commencer » vers une séance future verrouillée.
          topSession: nextDaySessions[0] ?? null,
        }
      : null,
  };
}

function weightOf(priority: NotionPriorityLevel): number {
  return { urgent: 0, travail: 1, revoir: 2, maitrise: 3 }[priority];
}

function subjectEmoji(subjectId: string): string {
  return getCatalog().subjects.find((subject) => subject.id === subjectId)?.emoji ?? '📘';
}

export { ACTIVITY_LABEL, addDays };

/* ------------------------------------------------------------------ */
/*  Thèmes du catalogue                                                */
/* ------------------------------------------------------------------ */

/** Sujets d'un thème (8 max) : le planning cible le thème entier. */
export function resolveThemeTopics(themeId: string): string[] {
  return getCatalog()
    .topics.filter((topic) => topic.themeId === themeId)
    .slice(0, 8)
    .map((topic) => topic.id);
}

export function themeName(themeId: string): string | undefined {
  return getCatalog().themes.find((theme) => theme.id === themeId)?.name;
}

/* ------------------------------------------------------------------ */
/*  Synchronisation des séances vers le calendrier                     */
/* ------------------------------------------------------------------ */

/**
 * Reflète les séances du planning dans l'agenda existant (kind « travail ») :
 * création, déplacement (report), validation (done) et retrait (séance
 * ignorée ou contrôle clôturé). La correspondance séance→événement est
 * conservée sur le contrôle (`sessionEvents`) : rien n'est dupliqué.
 */
export async function syncSessionEvents(userId: string, exam: Exam, plan: ExamPlan): Promise<Exam> {
  const events = await listEvents(userId);
  const existing = new Map(events.map((event) => [event.id, event]));
  const map: Record<string, string> = { ...(exam.sessionEvents ?? {}) };
  const kept = new Set<string>();

  for (const day of plan.days) {
    for (const session of day.sessions) {
      let eventId: string | undefined = map[session.id];
      if (eventId && !existing.has(eventId)) eventId = undefined; // événement supprimé à la main
      const payload = {
        id: eventId ?? newId(),
        title: `Révision · ${session.topicName} (${session.durationMin} min)`,
        kind: 'travail' as const,
        subjectId: exam.subjectId,
        date: session.date,
        notes: `planning:${exam.id}:${session.id} · Séance « ${ACTIVITY_LABEL[session.activity]} » du planning « ${exam.title} » — à gérer dans le Planning.`,
        done: session.status === 'done',
        createdAt: exam.createdAt,
      };
      try {
        await saveEvent(userId, payload);
        map[session.id] = payload.id;
        kept.add(session.id);
      } catch (error) {
        console.warn('[EduMate] Synchronisation calendrier impossible :', error instanceof Error ? error.message : error);
      }
    }
  }

  // Séances disparues (ignorées, contrôle clôturé…) : on retire leur événement.
  for (const [sessionId, eventId] of Object.entries(map)) {
    if (kept.has(sessionId)) continue;
    if (existing.has(eventId)) {
      await deleteEvent(userId, eventId).catch(() => undefined);
    }
    delete map[sessionId];
  }

  return { ...exam, sessionEvents: map };
}

/* ------------------------------------------------------------------ */
/*  Stockage des contrôles & états de séances (partagé par les routes) */
/* ------------------------------------------------------------------ */

export async function listExams(userId: string): Promise<Exam[]> {
  const store = await getStorage();
  const raw = await store.get<Exam[]>(K.exams(userId));
  if (!Array.isArray(raw)) return [];
  return raw.filter((exam) => exam && typeof exam.id === 'string' && typeof exam.date === 'string');
}

export async function saveExams(userId: string, exams: Exam[]): Promise<void> {
  const store = await getStorage();
  await store.set(K.exams(userId), exams);
}

export async function readSessionStates(userId: string): Promise<Record<string, Record<string, SessionState>>> {
  const store = await getStorage();
  const raw = await store.get<Record<string, Record<string, SessionState>>>(K.examSessions(userId));
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
}

export async function writeSessionStates(userId: string, states: Record<string, Record<string, SessionState>>): Promise<void> {
  const store = await getStorage();
  await store.set(K.examSessions(userId), states);
}

/* ------------------------------------------------------------------ */
/*  Journal des ajustements                                            */
/* ------------------------------------------------------------------ */

/** Ajoute une entrée au journal du contrôle (plus récent d'abord, 30 max). */
export function pushJournal(exam: Exam, kind: PlanJournalEntry['kind'], message: string): Exam {
  const entry: PlanJournalEntry = { id: newId(), at: new Date().toISOString(), kind, message };
  return { ...exam, journal: [entry, ...(exam.journal ?? [])].slice(0, 30) };
}

/**
 * Après un essai de quiz : explique l'effet sur les contrôles concernés
 * (validation de séance, évolution de maîtrise et de priorité).
 * Renvoie les contrôles mis à jour (à persister avec saveExams).
 */
export async function journalAfterAttempt(userId: string, attempt: QuizAttempt, attemptsBefore: QuizAttempt[]): Promise<Exam[]> {
  const exams = await listExams(userId);
  const today = todayKey();
  let changed = false;
  const updated = exams.map((exam) => {
    if (exam.status !== 'actif' || daysUntil(exam.date) < 0) return exam;
    if (!exam.topics.includes(attempt.topicId)) return exam;
    const percent = attempt.total > 0 ? Math.round((attempt.score / attempt.total) * 100) : 0;
    const topic = findTopic(attempt.topicId);
    const name = topic?.name ?? attempt.topicName;
    let message: string;
    if (percent >= 80) {
      message = `Quiz réussi : ${percent} % sur « ${name} ». La séance liée se grise automatiquement et la notion passe en priorité basse — profite du temps libéré pour tes notions faibles.`;
    } else {
      message = `Quiz à ${percent} % sur « ${name} » : sous 80 %, rien n'est validé. La séance reste au programme — rejoue-la quand tu veux.`;
    }
    // Évolution de maîtrise / priorité si mesurable.
    const before = computeProgress(attemptsBefore).byTopic.find((entry) => entry.topicId === attempt.topicId);
    const after = computeProgress([...attemptsBefore, attempt]).byTopic.find((entry) => entry.topicId === attempt.topicId);
    if (before && after && before.lastScore !== after.lastScore) {
      const from = Math.round(before.lastScore * 100);
      const to = Math.round(after.lastScore * 100);
      const level = (score: number): string => (score >= 80 ? '🟢 maîtrisé' : score >= 60 ? '🟡 à revoir' : score >= 40 ? '🟠 à travailler' : '🔴 urgent');
      message += ` Ta maîtrise passe de ${from} % à ${to} % (${level(from)} → ${level(to)}).`;
    }
    changed = true;
    return pushJournal(exam, 'quiz', message);
  });
  return changed ? updated : exams;
}
