/**
 * EduMate — API Organisation : calendrier (événements) et tâches.
 */
import { Router } from 'express';
import type { CalendarEvent, EventKind, Task } from '../../shared/types.js';
import { deleteEvent, deleteTask, listEvents, listTasks, saveEvent, saveTask } from '../lib/store.js';
import { newId } from '../lib/auth.js';
import { asyncHandler, notFound, requireAuth, requireCsrf } from '../lib/middleware.js';
import { LIMITS, optionalEnum, optionalString, optionalTime, requireDate, requireString } from '../lib/validation.js';
import { SUBJECTS } from '../content/meta.js';

export const organizeRouter = Router();
organizeRouter.use(requireAuth());
organizeRouter.use(requireCsrf());

const KINDS: EventKind[] = ['devoir', 'travail', 'examen', 'autre'];
const SUBJECT_IDS = SUBJECTS.map((subject) => subject.id) as string[];

/* ------------------------------------------------------------------ */
/*  Calendrier                                                         */
/* ------------------------------------------------------------------ */

organizeRouter.get(
  '/events',
  asyncHandler(async (req, res) => {
    const events = await listEvents(req.auth!.sub);
    const month = typeof req.query.month === 'string' ? req.query.month : '';
    const filtered = /^\d{4}-\d{2}$/.test(month) ? events.filter((event) => event.date.startsWith(month)) : events;
    res.json({ events: filtered });
  }),
);

organizeRouter.post(
  '/events',
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const title = requireString(body.title, 'titre', { min: 1, max: LIMITS.title });
    const date = requireDate(body.date);
    const event: Omit<CalendarEvent, 'userId'> = {
      id: typeof body.id === 'string' && body.id ? body.id.slice(0, 64) : newId(),
      title,
      kind: optionalEnum(body.kind, KINDS) ?? 'devoir',
      subjectId: optionalEnum(body.subjectId, SUBJECT_IDS),
      date,
      time: optionalTime(body.time),
      notes: optionalString(body.notes, LIMITS.notes),
      done: Boolean(body.done),
      createdAt: new Date().toISOString(),
    };
    const events = await saveEvent(req.auth!.sub, event);
    res.status(201).json({ events, event });
  }),
);

organizeRouter.put(
  '/events/:id',
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const events = await listEvents(req.auth!.sub);
    const existing = events.find((event) => event.id === req.params.id);
    if (!existing) throw notFound('Événement introuvable.');
    const updated: Omit<CalendarEvent, 'userId'> = {
      ...existing,
      title: body.title !== undefined ? requireString(body.title, 'titre', { min: 1, max: LIMITS.title }) : existing.title,
      kind: optionalEnum(body.kind, KINDS) ?? existing.kind,
      subjectId: body.subjectId === null ? undefined : optionalEnum(body.subjectId, SUBJECT_IDS) ?? existing.subjectId,
      date: body.date !== undefined ? requireDate(body.date) : existing.date,
      time: body.time === undefined ? existing.time : optionalTime(body.time),
      notes: body.notes === undefined ? existing.notes : optionalString(body.notes, LIMITS.notes),
      done: body.done !== undefined ? Boolean(body.done) : existing.done,
    };
    const list = await saveEvent(req.auth!.sub, updated);
    res.json({ events: list, event: updated });
  }),
);

organizeRouter.delete(
  '/events/:id',
  asyncHandler(async (req, res) => {
    const events = await deleteEvent(req.auth!.sub, req.params.id);
    res.json({ events });
  }),
);

/* ------------------------------------------------------------------ */
/*  Tâches / devoirs rapides                                           */
/* ------------------------------------------------------------------ */

organizeRouter.get(
  '/tasks',
  asyncHandler(async (req, res) => {
    res.json({ tasks: await listTasks(req.auth!.sub) });
  }),
);

organizeRouter.post(
  '/tasks',
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const title = requireString(body.title, 'titre', { min: 1, max: LIMITS.title });
    const task: Omit<Task, 'userId'> = {
      id: typeof body.id === 'string' && body.id ? body.id.slice(0, 64) : newId(),
      title,
      subjectId: optionalEnum(body.subjectId, SUBJECT_IDS) ?? optionalString(body.subjectId, 40),
      dueDate: typeof body.dueDate === 'string' && body.dueDate ? requireDate(body.dueDate) : undefined,
      done: Boolean(body.done),
      createdAt: new Date().toISOString(),
    };
    const tasks = await saveTask(req.auth!.sub, task);
    res.status(201).json({ tasks, task });
  }),
);

organizeRouter.put(
  '/tasks/:id',
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const tasks = await listTasks(req.auth!.sub);
    const existing = tasks.find((task) => task.id === req.params.id);
    if (!existing) throw notFound('Tâche introuvable.');
    const updated: Omit<Task, 'userId'> = {
      ...existing,
      title: body.title !== undefined ? requireString(body.title, 'titre', { min: 1, max: LIMITS.title }) : existing.title,
      done: body.done !== undefined ? Boolean(body.done) : existing.done,
      dueDate: body.dueDate === undefined ? existing.dueDate : body.dueDate === null ? undefined : requireDate(body.dueDate),
      subjectId: body.subjectId === undefined ? existing.subjectId : optionalString(body.subjectId, 40),
    };
    const list = await saveTask(req.auth!.sub, updated);
    res.json({ tasks: list, task: updated });
  }),
);

organizeRouter.delete(
  '/tasks/:id',
  asyncHandler(async (req, res) => {
    const tasks = await deleteTask(req.auth!.sub, req.params.id);
    res.json({ tasks });
  }),
);

/* ------------------------------------------------------------------ */
/*  Vue « aujourd'hui » pour le tableau de bord                        */
/* ------------------------------------------------------------------ */

organizeRouter.get(
  '/today',
  asyncHandler(async (req, res) => {
    const today = new Date().toISOString().slice(0, 10);
    const [events, tasks] = await Promise.all([listEvents(req.auth!.sub), listTasks(req.auth!.sub)]);
    const upcoming = events
      .filter((event) => !event.done && event.date >= today)
      .sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')))
      .slice(0, 6);
    const overdue = events.filter((event) => !event.done && event.date < today).slice(0, 4);
    const openTasks = tasks.filter((task) => !task.done).slice(0, 8);
    res.json({ today, upcoming, overdue, tasks: openTasks });
  }),
);
