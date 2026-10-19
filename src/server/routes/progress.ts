/**
 * EduMate — API Progression : statistiques, historique, maîtrise par sujet.
 */
import { Router } from 'express';
import { aggregateLessons, computeProgress, lessonSecondsOn, listAttempts, listLessonCompletions } from '../lib/store.js';
import { findTopic } from '../lib/catalog.js';
import { asyncHandler, requireAuth, requireCsrf } from '../lib/middleware.js';
import { getCatalog } from '../lib/catalog.js';

export const progressRouter = Router();

progressRouter.use(requireAuth());
progressRouter.use(requireCsrf());

progressRouter.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const attempts = await listAttempts(req.auth!.sub);
    const summary = computeProgress(attempts);
    const lessonCompletions = await listLessonCompletions(req.auth!.sub);
    const lessonStats = aggregateLessons(lessonCompletions);
    const todayKey = new Date().toISOString().slice(0, 10);
    const catalog = getCatalog();

    const subjectLabels = new Map(catalog.subjects.map((subject) => [subject.id, subject]));
    const bySubject = summary.bySubject.map((entry) => ({
      ...entry,
      subjectName: subjectLabels.get(entry.subjectId)?.name ?? entry.subjectId,
      emoji: subjectLabels.get(entry.subjectId)?.emoji ?? '📘',
      color: subjectLabels.get(entry.subjectId)?.color ?? '#4f6df5',
      successRate: entry.total ? entry.correct / entry.total : 0,
    }));

    const enrich = (topicId: string) => {
      const topic = findTopic(topicId);
      return topic
        ? {
            topicId,
            name: topic.name,
            subjectId: topic.subjectId,
            subjectName: topic.subjectName,
            themeName: topic.themeName,
            emoji: topic.emoji,
            color: topic.color,
          }
        : null;
    };

    res.json({
      /* Leçons terminées : historique + temps de travail, pour que les
         leçons comptent autant que les quiz dans la progression. */
      lessons: lessonStats,
      lessonSecondsToday: lessonSecondsOn(lessonCompletions, todayKey),
      attempts: summary.attempts,
      correct: summary.correct,
      total: summary.total,
      successRate: summary.successRate,
      bestScore: summary.bestScore,
      totalDurationSec: summary.totalDurationSec,
      streakDays: summary.streakDays,
      bySubject,
      mastered: summary.mastered.map(enrich).filter(Boolean),
      toReview: summary.toReview.map(enrich).filter(Boolean),
      last30Days: summary.last30Days,
      recent: summary.recent.map((attempt) => ({
        id: attempt.id,
        topicId: attempt.topicId,
        topicName: attempt.topicName,
        themeName: attempt.themeName,
        subjectId: attempt.subjectId,
        emoji: subjectLabels.get(attempt.subjectId)?.emoji ?? '📘',
        score: attempt.score,
        total: attempt.total,
        percent: attempt.total ? Math.round((attempt.score / attempt.total) * 100) : 0,
        durationSec: attempt.durationSec,
        createdAt: attempt.createdAt,
      })),
    });
  }),
);

progressRouter.get(
  '/history',
  asyncHandler(async (req, res) => {
    const attempts = await listAttempts(req.auth!.sub);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 30));
    res.json({
      items: attempts.slice(0, limit).map((attempt) => ({
        id: attempt.id,
        topicId: attempt.topicId,
        topicName: attempt.topicName,
        themeName: attempt.themeName,
        subjectId: attempt.subjectId,
        score: attempt.score,
        total: attempt.total,
        durationSec: attempt.durationSec,
        createdAt: attempt.createdAt,
        answers: attempt.answers,
      })),
      total: attempts.length,
    });
  }),
);

progressRouter.get(
  '/topics',
  asyncHandler(async (req, res) => {
    const attempts = await listAttempts(req.auth!.sub);
    const summary = computeProgress(attempts);
    const items = summary.byTopic
      .map((entry) => {
        const topic = findTopic(entry.topicId);
        return {
          ...entry,
          rate: entry.total ? entry.correct / entry.total : 0,
          name: topic?.name ?? entry.topicId,
          subjectId: topic?.subjectId,
          subjectName: topic?.subjectName ?? '—',
          themeName: topic?.themeName ?? '—',
          emoji: topic?.emoji ?? '📘',
          color: topic?.color ?? '#4f6df5',
        };
      })
      .sort((a, b) => b.lastPlayedAt.localeCompare(a.lastPlayedAt));
    res.json({ items });
  }),
);
