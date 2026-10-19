/**
 * EduMate — API du fil d'actualités, des sondages et des notifications.
 *
 * Toutes les routes exigent une session : le fil est personnalisé (état de
 * lecture, votes), et un anonyme n'a pas d'identifiant auquel rattacher ces
 * données.
 *
 * La publication, elle, est réservée aux administrateurs et vit dans
 * `routes/admin.ts`.
 */
import { Router } from 'express';
import type { FeedItem, FeedResponse, Poll } from '../../shared/types.js';
import {
  countUnread,
  getMyVotesFor,
  getPolls,
  getReadState,
  listFeed,
  markAllRead,
  markRead,
  votePoll,
} from '../lib/feed.js';
import { asyncHandler, badRequest, notFound, requireAuth, requireCsrf } from '../lib/middleware.js';
import { cleanText, LIMITS, optionalStringArray } from '../lib/validation.js';

export const feedRouter = Router();
feedRouter.use(requireAuth());
feedRouter.use(requireCsrf());

/**
 * Fil complet : éléments, sondages associés, votes de l'élève et non-lus.
 *
 * Tout est renvoyé en UNE requête pour limiter les allers-retours : le badge de
 * la barre supérieure est interrogé périodiquement, il doit rester bon marché.
 * Trois lectures groupées suffisent (index du fil, sondages, votes), plus l'état
 * de lecture.
 */
feedRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const limit = Math.min(60, Math.max(1, Number(req.query.limit) || 30));
    const items = await listFeed(limit);

    const pollIds = items.map((item) => item.pollId).filter((id): id is string => Boolean(id));
    // Deux lectures groupées en parallèle : sondages et votes de l'élève.
    const [polls, myVotes, read] = await Promise.all([
      getPolls(pollIds),
      getMyVotesFor(pollIds, req.auth!.sub),
      getReadState(req.auth!.sub),
    ]);

    const payload: FeedResponse = {
      items,
      polls,
      myVotes,
      unreadCount: countUnread(items, read),
      readIds: read.readIds,
      readAllAt: read.readAllAt,
    };
    res.json(payload);
  }),
);

/** Marque un élément comme lu. Idempotent. */
feedRouter.post(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const id = cleanText(req.params.id, 64);
    if (!id) throw badRequest('Identifiant d’élément manquant.');
    const items = await listFeed(60);
    if (!items.some((item) => item.id === id)) throw notFound('Cet élément du fil n’existe pas.');

    const read = await markRead(req.auth!.sub, id);
    res.json({ ok: true, unreadCount: countUnread(items, read), readIds: read.readIds });
  }),
);

/** Marque tout le fil comme lu. */
feedRouter.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    const items = await listFeed(60);
    const read = await markAllRead(req.auth!.sub, items);
    res.json({ ok: true, unreadCount: countUnread(items, read), readAllAt: read.readAllAt });
  }),
);

/** Détail d'un sondage (résultats à jour + vote de l'élève). */
feedRouter.get(
  '/polls/:id',
  asyncHandler(async (req, res) => {
    const id = cleanText(req.params.id, 64);
    const polls = await getPolls(id ? [id] : []);
    const poll: Poll | undefined = polls[id];
    if (!poll) throw notFound('Ce sondage n’existe pas.');
    const myVotes = await getMyVotesFor([id], req.auth!.sub);
    res.json({ poll, myVotes: myVotes[id] ?? [] });
  }),
);

/**
 * Vote (ou modifie son vote).
 *
 * `optionIds` est un tableau même en choix unique : cela évite deux formats de
 * requête selon le sondage. Le serveur tranche en fonction de `singleChoice`.
 */
feedRouter.post(
  '/polls/:id/vote',
  asyncHandler(async (req, res) => {
    const id = cleanText(req.params.id, 64);
    if (!id) throw badRequest('Identifiant de sondage manquant.');
    const body = (req.body ?? {}) as Record<string, unknown>;
    const optionIds = optionalStringArray(body.optionIds ?? body.options, 8, 32);
    if (!optionIds.length) throw badRequest('Choisis au moins une réponse.');

    const result = await votePoll(id, req.auth!.sub, optionIds);
    if ('error' in result) throw badRequest(result.error);

    res.json({
      poll: result.poll,
      myVotes: result.myVotes,
      changed: result.changed,
      totalVotes: result.poll.options.reduce((sum, option) => sum + option.count, 0),
    });
  }),
);

/**
 * Compte de non-lus seul.
 *
 * Route légère dédiée au badge de la barre supérieure : elle ne renvoie ni le
 * corps des éléments ni les sondages, seulement ce qu'il faut pour afficher un
 * chiffre. C'est elle qui est interrogée périodiquement.
 */
feedRouter.get(
  '/unread',
  asyncHandler(async (req, res) => {
    const items: FeedItem[] = await listFeed(60);
    const read = await getReadState(req.auth!.sub);
    res.json({ unreadCount: countUnread(items, read), total: items.length });
  }),
);

export { LIMITS };
