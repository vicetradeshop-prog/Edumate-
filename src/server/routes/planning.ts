/**
 * EduMate — API Planning de révision automatique.
 *
 *   GET    /api/planning/exams                     → contrôles + résumés
 *   POST   /api/planning/exams                     → créer un contrôle
 *   GET    /api/planning/exams/:id                 → planning complet calculé
 *   POST   /api/planning/exams/:id/generate        → marque le planning prêt
 *   PATCH  /api/planning/exams/:id                 → maj / terminé / note
 *   DELETE /api/planning/exams/:id                 → suppression propre
 *   POST   /api/planning/exams/:id/sessions/:sid   → état d'une séance
 *   GET    /api/planning/today                     → vue « aujourd'hui »
 *
 * Le planning est RECALCULÉ à chaque lecture depuis la maîtrise réelle de
 * l'élève : rien à migrer, rien à resynchroniser. Seuls les contrôles et les
 * états de séances sont persistés.
 */
import { Router } from 'express';
import type { Exam, ExamFeedback, ExamSelfLevel, ExamView, SessionState, SessionStatus } from '../../shared/types.js';
import { asyncHandler, badRequest, notFound, requireAuth, requireCsrf } from '../lib/middleware.js';
import { deleteEvent, listAttempts, saveEvent } from '../lib/store.js';
import { newId } from '../lib/auth.js';
import { cleanText, optionalString } from '../lib/validation.js';
import { SUBJECTS } from '../content/meta.js';
import { findTopic } from '../lib/catalog.js';
import {
  buildExamPlan,
  buildTodayPlan,
  listExams,
  pushJournal,
  readSessionStates,
  resolveThemeTopics,
  saveExams,
  suggestTopics,
  syncSessionEvents,
  themeName,
  todayKey,
  writeSessionStates,
} from '../lib/planning.js';
import { aggregateLessons, lessonSecondsOn, listLessonCompletions } from '../lib/store.js';

export const planningRouter = Router();
planningRouter.use(requireAuth());
planningRouter.use(requireCsrf());

function formatJournalDate(date: string): string {
  const label = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${date}T12:00:00Z`));
  return label;
}

const SELF_LEVELS: ExamSelfLevel[] = ['maitrise', 'moyen', 'difficultes', 'zero'];
const SESSION_STATUSES: SessionStatus[] = ['prevue', 'done', 'postponed', 'skipped'];
const FEEDBACKS: ExamFeedback[] = ['difficile', 'moyen', 'bien', 'tresbien'];
const DAILY_CHOICES = [10, 20, 30, 45, 60];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

/* ------------------------------------------------------------------ */
/*  Persistance                                                        */
/* ------------------------------------------------------------------ */

/* Le stockage des contrôles / états de séances vit dans lib/planning.ts
   (partagé avec les routes quiz et leçons pour le journal). */
const readStates = readSessionStates;
const writeStates = writeSessionStates;

/** Résumé de chaque contrôle (listes, dashboard). */
async function examViews(userId: string, exams: Exam[]): Promise<ExamView[]> {
  const attempts = await listAttempts(userId);
  const states = await readStates(userId);
  const lessonResults = await listLessonCompletions(userId);
  return exams
    .map((exam) => {
      const plan = buildExamPlan(exam, attempts, states[exam.id] ?? {}, { lessonResults });
      const future = plan.days
        .flatMap((day) => day.sessions)
        .find((session) => session.status === 'prevue' || session.status === 'postponed');
      return {
        exam,
        daysLeft: plan.daysLeft,
        prepPercent: plan.prepPercent,
        remainingSessions: plan.remainingSessions,
        sessionCount: plan.sessionCount,
        notionCount: plan.notions.length,
        topNotion: plan.notions[0] ?? null,
        nextSession: future ?? null,
      } satisfies ExamView;
    })
    .sort((a, b) => (a.exam.date < b.exam.date ? -1 : 1));
}

/* ------------------------------------------------------------------ */
/*  Routes                                                             */
/* ------------------------------------------------------------------ */

planningRouter.get(
  '/exams',
  asyncHandler(async (req, res) => {
    const exams = await listExams(req.auth!.sub);
    res.json({ exams: await examViews(req.auth!.sub, exams) });
  }),
);

planningRouter.post(
  '/exams',
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const subjectId = cleanText(body.subjectId, 40);
    if (!SUBJECTS.some((subject) => subject.id === subjectId)) throw badRequest('Choisis une matière valide.');
    const title = cleanText(body.title, 80);
    if (title.length < 3) throw badRequest('Donne un nom à ton contrôle (3 caractères minimum).');
    const date = cleanText(body.date, 10);
    if (!DATE_RE.test(date) || Number.isNaN(Date.parse(date))) throw badRequest('Date invalide.');
    if (date < todayKey()) throw badRequest('La date du contrôle doit être aujourd’hui ou plus tard.');
    const time = optionalString(body.time, 5);
    if (time && !TIME_RE.test(time)) throw badRequest('Heure invalide (format HH:MM).');
    const selfLevel = SELF_LEVELS.includes(body.selfLevel as ExamSelfLevel) ? (body.selfLevel as ExamSelfLevel) : 'moyen';
    let dailyMinutes = Number(body.dailyMinutes);
    if (!Number.isFinite(dailyMinutes)) dailyMinutes = 30;
    dailyMinutes = Math.max(5, Math.min(240, Math.round(dailyMinutes)));

    /* Thème ciblé (ex. « Suites ») : le planning travaille sur les sujets du
       thème ; l'élève peut restreindre à des notions précises s'il le veut. */
    const themeId = optionalString(body.themeId, 64);
    const themeLabel = themeId ? themeName(themeId) : undefined;
    const themeTopics = themeLabel ? resolveThemeTopics(themeId!) : [];
    const rawTopics = Array.isArray(body.topics) ? (body.topics as unknown[]).filter((entry): entry is string => typeof entry === 'string') : [];
    const chosen = [...new Set(rawTopics.map((entry) => entry.trim()).filter((entry) => findTopic(entry) !== null))].slice(0, 12);
    const topics = chosen.length ? chosen : themeTopics;

    const exams = await listExams(req.auth!.sub);
    const now = new Date().toISOString();
    const exam: Exam = {
      id: newId(),
      subjectId,
      title,
      date,
      time: time || undefined,
      themeId: themeLabel ? themeId : undefined,
      themeName: themeLabel,
      topics,
      dailyMinutes,
      selfLevel,
      status: 'actif',
      planReady: false,
      createdAt: now,
      updatedAt: now,
    };

    /* Notions non renseignées : proposition intelligente (sujets fragiles de
       la matière) — jamais de planning vide. */
    if (!exam.topics.length) {
      const attempts = await listAttempts(req.auth!.sub);
      const { computeProgress } = await import('../lib/store.js');
      exam.topics = suggestTopics(subjectId, computeProgress(attempts), String(req.body?.level ?? ''));
    }

    /* Intégration calendrier : le contrôle apparaît aussi dans l'agenda. */
    try {
      const events = await saveEvent(req.auth!.sub, {
        id: newId(),
        title: `Contrôle : ${title}`,
        kind: 'examen',
        subjectId,
        date,
        time: time || undefined,
        notes: `planning-exam:${exam.id} · Créé depuis le planning de révision automatique. Gère-le depuis le Planning.`,
        done: false,
        createdAt: now,
      });
      exam.calendarEventId = events[events.length - 1]?.id;
    } catch (error) {
      console.warn('[EduMate] Événement calendrier impossible pour le contrôle :', error instanceof Error ? error.message : error);
    }

    const withJournal = pushJournal(
      exam,
      'generate',
      `Contrôle « ${exam.title} » ajouté (${formatJournalDate(exam.date)}) : le planning sera généré en un clic, puis ajusté après chaque quiz ou leçon.`,
    );
    await saveExams(req.auth!.sub, [...exams, withJournal]);
    const [view] = await examViews(req.auth!.sub, [withJournal]);
    res.status(201).json({ exam, view });
  }),
);

planningRouter.get(
  '/today',
  asyncHandler(async (req, res) => {
    const exams = (await listExams(req.auth!.sub)).filter((exam) => exam.status === 'actif');
    const attempts = await listAttempts(req.auth!.sub);
    const allStates = await readStates(req.auth!.sub);
    const lessonResults = await listLessonCompletions(req.auth!.sub);
    res.json({ today: buildTodayPlan(exams, attempts, allStates, { lessonResults }) });
  }),
);

planningRouter.get(
  '/exams/:id',
  asyncHandler(async (req, res) => {
    const exams = await listExams(req.auth!.sub);
    const exam = exams.find((entry) => entry.id === req.params.id);
    if (!exam) throw notFound('Ce contrôle n’existe pas (ou plus).');
    const attempts = await listAttempts(req.auth!.sub);
    const states = await readStates(req.auth!.sub);
    const lessonResults = await listLessonCompletions(req.auth!.sub);
    res.json({ plan: buildExamPlan(exam, attempts, states[exam.id] ?? {}, { lessonResults }) });
  }),
);

planningRouter.post(
  '/exams/:id/generate',
  asyncHandler(async (req, res) => {
    const exams = await listExams(req.auth!.sub);
    const exam = exams.find((entry) => entry.id === req.params.id);
    if (!exam) throw notFound('Ce contrôle n’existe pas (ou plus).');
    exam.planReady = true;
    exam.updatedAt = new Date().toISOString();
    const attempts = await listAttempts(req.auth!.sub);
    const states = await readStates(req.auth!.sub);
    const lessonResults = await listLessonCompletions(req.auth!.sub);
    const plan = buildExamPlan(exam, attempts, states[exam.id] ?? {}, { lessonResults });
    // Les séances apparaissent dans le calendrier dès la génération.
    const synced0 = await syncSessionEvents(req.auth!.sub, exam, plan);
    const journaled = pushJournal(
      synced0,
      'generate',
      `Planning généré : ${plan.sessionCount} séances réparties sur ${plan.days.length} jour${plan.days.length > 1 ? 's' : ''} (${exam.dailyMinutes} min/j), quiz blanc la veille et révision express le jour J.`,
    );
    Object.assign(exam, journaled);
    await saveExams(req.auth!.sub, exams);
    res.json({ plan: { ...plan, exam: journaled } });
  }),
);

planningRouter.patch(
  '/exams/:id',
  asyncHandler(async (req, res) => {
    const exams = await listExams(req.auth!.sub);
    const exam = exams.find((entry) => entry.id === req.params.id);
    if (!exam) throw notFound('Ce contrôle n’existe pas (ou plus).');
    const body = (req.body ?? {}) as Record<string, unknown>;

    const changes: string[] = [];
    if (typeof body.title === 'string') {
      const title = cleanText(body.title, 80);
      if (title.length >= 3 && title !== exam.title) {
        exam.title = title;
        changes.push('nom');
      }
    }
    if (typeof body.date === 'string') {
      if (!DATE_RE.test(body.date)) throw badRequest('Date invalide.');
      if (body.date !== exam.date) {
        exam.date = body.date;
        changes.push(`nouvelle date : ${formatJournalDate(body.date)}`);
      }
    }
    if (body.time !== undefined) {
      const time = optionalString(body.time, 5);
      if (time && !TIME_RE.test(time)) throw badRequest('Heure invalide (format HH:MM).');
      exam.time = time;
    }
    if (typeof body.dailyMinutes === 'number' && Number.isFinite(body.dailyMinutes)) {
      const minutes = Math.max(5, Math.min(240, Math.round(body.dailyMinutes)));
      if (minutes !== exam.dailyMinutes) {
        exam.dailyMinutes = minutes;
        changes.push(`temps quotidien : ${minutes} min`);
      }
    }
    if (SELF_LEVELS.includes(body.selfLevel as ExamSelfLevel)) exam.selfLevel = body.selfLevel as ExamSelfLevel;
    if (Array.isArray(body.topics)) {
      const topics = [...new Set((body.topics as unknown[]).filter((entry): entry is string => typeof entry === 'string' && findTopic(entry) !== null))].slice(0, 12);
      if (topics.length && topics.join() !== exam.topics.join()) {
        exam.topics = topics;
        changes.push(`notions : ${topics.length}`);
      }
    }
    if (body.status === 'termine' || body.status === 'actif') {
      if (body.status !== exam.status) changes.push(body.status === 'termine' ? 'contrôle clôturé' : 'contrôle rouvert');
      exam.status = body.status;
      if (body.status === 'termine' && exam.calendarEventId) {
        // L'événement agenda correspondant est marqué fait, pas supprimé.
        await saveEvent(req.auth!.sub, { id: exam.calendarEventId, title: `Contrôle : ${exam.title}`, kind: 'examen', subjectId: exam.subjectId, date: exam.date, time: exam.time, done: true, createdAt: exam.createdAt }).catch(() => undefined);
      }
    }
    if (FEEDBACKS.includes(body.feedback as ExamFeedback)) {
      if (exam.feedback !== body.feedback) changes.push('ressenti enregistré');
      exam.feedback = body.feedback as ExamFeedback;
    }
    if (typeof body.grade === 'number' && Number.isFinite(body.grade)) {
      exam.grade = Math.max(0, Math.min(20, body.grade));
      changes.push(`note : ${exam.grade}/20`);
    }
    if (typeof body.gradeMax === 'number' && Number.isFinite(body.gradeMax)) exam.gradeMax = Math.max(1, Math.min(100, body.gradeMax));
    exam.updatedAt = new Date().toISOString();

    /* Le calendrier suit le contrôle : date / heure / titre resynchronisés. */
    if (exam.calendarEventId && (changes.includes('nom') || changes.some((change) => change.startsWith('nouvelle date')))) {
      await saveEvent(req.auth!.sub, {
        id: exam.calendarEventId,
        title: `Contrôle : ${exam.title}`,
        kind: 'examen',
        subjectId: exam.subjectId,
        date: exam.date,
        time: exam.time,
        notes: `planning-exam:${exam.id} · Créé depuis le planning de révision automatique.`,
        done: exam.status === 'termine',
        createdAt: exam.createdAt,
      }).catch(() => undefined);
    }

    if (changes.length) {
      Object.assign(
        exam,
        pushJournal(
          exam,
          'exam',
          `Contrôle modifié (${changes.join(', ')}) : planning recalculé. Tes séances terminées restent acquises, les autres se répartissent sur les jours restants.`,
        ),
      );
    }

    const attempts = await listAttempts(req.auth!.sub);
    const states = await readStates(req.auth!.sub);
    const lessonResults = await listLessonCompletions(req.auth!.sub);
    let plan = buildExamPlan(exam, attempts, states[exam.id] ?? {}, { lessonResults });
    if (exam.status === 'termine') {
      // Contrôle clôturé : on libère l'agenda (les séances n'ont plus lieu d'être).
      for (const eventId of Object.values(exam.sessionEvents ?? {})) {
        await deleteEvent(req.auth!.sub, eventId).catch(() => undefined);
      }
      exam.sessionEvents = {};
    } else {
      const synced = await syncSessionEvents(req.auth!.sub, exam, plan);
      Object.assign(exam, synced);
      plan = { ...plan, exam: synced };
    }
    await saveExams(req.auth!.sub, exams);
    res.json({ exam, plan });
  }),
);

planningRouter.delete(
  '/exams/:id',
  asyncHandler(async (req, res) => {
    const exams = await listExams(req.auth!.sub);
    const exam = exams.find((entry) => entry.id === req.params.id);
    if (!exam) throw notFound('Ce contrôle n’existe pas (ou plus).');
    await saveExams(req.auth!.sub, exams.filter((entry) => entry.id !== exam.id));
    if (exam.calendarEventId) await deleteEvent(req.auth!.sub, exam.calendarEventId).catch(() => undefined);
    for (const eventId of Object.values(exam.sessionEvents ?? {})) {
      await deleteEvent(req.auth!.sub, eventId).catch(() => undefined);
    }
    const states = await readStates(req.auth!.sub);
    delete states[exam.id];
    await writeStates(req.auth!.sub, states);
    res.json({ exams: await examViews(req.auth!.sub, await listExams(req.auth!.sub)) });
  }),
);

/** Terminer / reporter / ignorer / réactiver une séance. */
planningRouter.post(
  '/exams/:id/sessions/:sessionId',
  asyncHandler(async (req, res) => {
    const exams = await listExams(req.auth!.sub);
    const exam = exams.find((entry) => entry.id === req.params.id);
    if (!exam) throw notFound('Ce contrôle n’existe pas (ou plus).');
    const body = (req.body ?? {}) as Record<string, unknown>;
    const status = SESSION_STATUSES.includes(body.status as SessionStatus) ? (body.status as SessionStatus) : null;
    if (!status) throw badRequest('Statut de séance inconnu.');
    const sessionId = req.params.sessionId;
    if (sessionId.length > 220) throw badRequest('Séance inconnue.');

    const states = await readStates(req.auth!.sub);
    const forExam = states[exam.id] ?? {};
    const previous = forExam[sessionId];
    const next: SessionState = {
      status,
      postponedTimes: status === 'postponed' ? (previous?.postponedTimes ?? 0) + 1 : 0,
      updatedAt: new Date().toISOString(),
      score: typeof body.score === 'number' ? body.score : previous?.score,
      total: typeof body.total === 'number' ? body.total : previous?.total,
    };
    if (status === 'prevue') delete forExam[sessionId];
    else forExam[sessionId] = next;
    states[exam.id] = forExam;
    await writeStates(req.auth!.sub, states);

    /* Journal : chaque action manuelle est tracée et expliquée. */
    const sessionLabel = sessionId.split('|')[2] ?? 'une séance';
    const journalMessages: Record<SessionStatus, string> = {
      done: `Séance « ${sessionLabel} » terminée : ta progression est recalculée et les priorités suivantes s'adaptent.`,
      postponed: `Séance « ${sessionLabel} » reportée à demain : les autres séances sont réorganisées automatiquement, rien n'est supprimé.`,
      skipped: `Séance « ${sessionLabel} » ignorée : son temps est redistribué sur tes autres notions.`,
      prevue: `Séance « ${sessionLabel} » remise au programme.`,
    };
    const journaled = pushJournal(exam, 'session', journalMessages[status]);
    Object.assign(exam, journaled);
    await saveExams(req.auth!.sub, exams);

    const attempts = await listAttempts(req.auth!.sub);
    const lessonResults = await listLessonCompletions(req.auth!.sub);
    const plan = buildExamPlan(exam, attempts, states[exam.id] ?? {}, { lessonResults });
    // Report / validation / ignore : l'agenda suit le planning en temps réel.
    const synced = await syncSessionEvents(req.auth!.sub, exam, plan);
    Object.assign(exam, synced);
    await saveExams(req.auth!.sub, exams);
    res.json({ plan: { ...plan, exam: synced }, state: next });
  }),
);
