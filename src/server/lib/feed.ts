/**
 * EduMate — Fil d'actualités, sondages et état de lecture.
 *
 * Modèle volontairement simple et peu coûteux en requêtes Upstash (quota
 * gratuit : 10 000 commandes/jour) :
 *
 *   feed:index                  liste des identifiants, du plus récent au plus ancien
 *   feed:<id>                   élément publié (actualité ou annonce de sondage)
 *   poll:<id>                   sondage (question, options, compteurs)
 *   pollvote:<pollId>:<userId>  options votées par un élève
 *   feedread:<userId>           identifiants lus + date du « tout marquer lu »
 *
 * Le fil est **global** (un seul pour toute l'instance) : ce sont les
 * administrateurs qui publient. Seul l'état de lecture est personnel, ce qui
 * évite d'écrire N fois le même contenu pour N élèves.
 *
 * ⚠️ Comme le reste du projet, les écritures sont en « lecture → modification →
 * écriture » sans transaction Redis. Deux votes simultanés sur la même option
 * peuvent donc en perdre un. À l'échelle d'un sondage de classe l'effet est
 * négligeable (le total reste cohérent à un vote près) ; le documenter vaut
 * mieux que de complexifier toute la couche de stockage pour ce cas.
 */
import type { FeedImportance, FeedItem, FeedKind, FeedReadState, Poll, PollOption } from '../../shared/types.js';
import { getStorage, readList, writeList } from './storage.js';
import { newId } from './auth.js';

/* ------------------------------------------------------------------ */
/*  Clés et bornes                                                     */
/* ------------------------------------------------------------------ */

export const FK = {
  feedIndex: 'feed:index',
  feedItem: (id: string): string => `feed:${id}`,
  poll: (id: string): string => `poll:${id}`,
  pollVote: (pollId: string, userId: string): string => `pollvote:${pollId}:${userId}`,
  read: (userId: string): string => `feedread:${userId}`,
};

/** Nombre maximal d'éléments conservés dans le fil. */
export const MAX_FEED_ITEMS = 60;

/** Nombre maximal d'identifiants lus mémorisés par élève. */
export const MAX_READ_IDS = 200;

/** Nombre maximal d'options par sondage. */
export const MAX_POLL_OPTIONS = 8;

/* ------------------------------------------------------------------ */
/*  Fil                                                                */
/* ------------------------------------------------------------------ */

/** Liste les éléments du fil, du plus récent au plus ancien. */
export async function listFeed(limit = MAX_FEED_ITEMS): Promise<FeedItem[]> {
  const store = await getStorage();
  const ids = await readList<string>(store, FK.feedIndex);
  if (!ids.length) return [];
  const bounded = ids.slice(0, Math.max(1, limit));
  // Une seule requête groupée pour tout le fil : préserve le quota.
  const items = await store.getMany<FeedItem>(bounded.map((id) => FK.feedItem(id)));
  return items.filter((item): item is FeedItem => Boolean(item));
}

export async function getFeedItem(id: string): Promise<FeedItem | null> {
  const store = await getStorage();
  return store.get<FeedItem>(FK.feedItem(id));
}

export interface CreateFeedInput {
  kind: FeedKind;
  title: string;
  body: string;
  importance: FeedImportance;
  pollId?: string;
  link?: string;
  authorId?: string;
  authorName?: string;
}

/** Publie un élément en tête de fil. */
export async function createFeedItem(input: CreateFeedInput): Promise<FeedItem> {
  const store = await getStorage();
  const id = newId();
  const item: FeedItem = {
    id,
    kind: input.kind,
    title: input.title,
    body: input.body,
    importance: input.importance,
    pollId: input.pollId,
    link: input.link,
    authorId: input.authorId,
    authorName: input.authorName,
    createdAt: new Date().toISOString(),
  };
  await store.set(FK.feedItem(id), item);
  const index = await readList<string>(store, FK.feedIndex);
  await writeList(store, FK.feedIndex, [id, ...index].slice(0, MAX_FEED_ITEMS));
  return item;
}

/**
 * Retire un élément du fil.
 *
 * Le sondage associé est supprimé dans la même opération : laisser un sondage
 * orphelin ferait apparaître des résultats sans contexte.
 */
export async function deleteFeedItem(id: string): Promise<{ deleted: boolean; pollId?: string }> {
  const store = await getStorage();
  const item = await store.get<FeedItem>(FK.feedItem(id));
  const index = await readList<string>(store, FK.feedIndex);
  const next = index.filter((entry) => entry !== id);
  const keys = [FK.feedItem(id)];
  if (item?.pollId) keys.push(FK.poll(item.pollId));
  await store.del(keys);
  await writeList(store, FK.feedIndex, next);
  return { deleted: Boolean(item), pollId: item?.pollId };
}

/* ------------------------------------------------------------------ */
/*  Sondages                                                           */
/* ------------------------------------------------------------------ */

export async function getPoll(id: string): Promise<Poll | null> {
  const store = await getStorage();
  return store.get<Poll>(FK.poll(id));
}

/** Lit plusieurs sondages en une requête groupée. */
export async function getPolls(ids: string[]): Promise<Record<string, Poll>> {
  const store = await getStorage();
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return {};
  const polls = await store.getMany<Poll>(unique.map((id) => FK.poll(id)));
  const out: Record<string, Poll> = {};
  unique.forEach((id, index) => {
    const poll = polls[index];
    if (poll) out[id] = poll;
  });
  return out;
}

export interface CreatePollInput {
  question: string;
  options: string[];
  singleChoice: boolean;
  closesAt?: string | null;
}

/** Crée un sondage (sans le publier dans le fil : voir `createFeedItem`). */
export async function createPoll(input: CreatePollInput): Promise<Poll> {
  const store = await getStorage();
  const id = newId();
  const options: PollOption[] = input.options.slice(0, MAX_POLL_OPTIONS).map((label, index) => ({
    id: `opt-${index + 1}`,
    label,
    count: 0,
  }));
  const poll: Poll = {
    id,
    question: input.question,
    options,
    singleChoice: input.singleChoice,
    createdAt: new Date().toISOString(),
    closesAt: input.closesAt ?? null,
    closed: false,
    voters: 0,
  };
  await store.set(FK.poll(id), poll);
  return poll;
}

export async function setPollClosed(id: string, closed: boolean): Promise<Poll | null> {
  const store = await getStorage();
  const poll = await store.get<Poll>(FK.poll(id));
  if (!poll) return null;
  const updated: Poll = { ...poll, closed };
  await store.set(FK.poll(id), updated);
  return updated;
}

/** Vote d'un élève. */
export async function getMyVotes(pollId: string, userId: string): Promise<string[]> {
  const store = await getStorage();
  const value = await store.get<string[]>(FK.pollVote(pollId, userId));
  return Array.isArray(value) ? value : [];
}

/** Votes d'un élève pour plusieurs sondages (requêtes groupées). */
export async function getMyVotesFor(pollIds: string[], userId: string): Promise<Record<string, string[]>> {
  const store = await getStorage();
  const unique = [...new Set(pollIds.filter(Boolean))];
  if (!unique.length) return {};
  const votes = await store.getMany<string[]>(unique.map((id) => FK.pollVote(id, userId)));
  const out: Record<string, string[]> = {};
  unique.forEach((id, index) => {
    const value = votes[index];
    out[id] = Array.isArray(value) ? value : [];
  });
  return out;
}

export interface VoteResult {
  poll: Poll;
  myVotes: string[];
  changed: boolean;
}

/**
 * Enregistre (ou modifie) un vote.
 *
 * Règles :
 *   - un sondage clos ou absent ne peut plus recevoir de vote ;
 *   - en choix unique, voter remplace le vote précédent et **n'augmente pas**
 *     `voters` une seconde fois ;
 *   - en choix multiple, la liste est remplacée intégralement ;
 *   - les options inconnues sont ignorées.
 */
export async function votePoll(pollId: string, userId: string, optionIds: string[]): Promise<VoteResult | { error: string }> {
  const store = await getStorage();
  const poll = await store.get<Poll>(FK.poll(pollId));
  if (!poll) return { error: 'Ce sondage n’existe pas.' };
  if (poll.closed) return { error: 'Ce sondage est clos.' };
  if (poll.closesAt && new Date(poll.closesAt).getTime() < Date.now()) {
    return { error: 'Ce sondage est clos (date dépassée).' };
  }

  const known = new Set(poll.options.map((option) => option.id));

  /*
   * 🔴 Refuser explicitement les options inconnues.
   *
   * Un simple filtrage silencieux était dangereux : voter `['inexistant']`
   * produisait une liste vide, ce qui **annulait** le vote de l'élève sans le
   * moindre message, et décrémentait un compteur. Un identifiant inconnu
   * provient soit d'un client désynchronisé, soit d'une requête forgée — dans
   * les deux cas il faut répondre 400, pas modifier l'état.
   */
  const unknown = optionIds.filter((id) => !known.has(id));
  if (unknown.length) {
    return { error: `Réponse inconnue pour ce sondage : ${unknown.slice(0, 3).join(', ')}.` };
  }

  const requested = [...new Set(optionIds)];
  const bounded = poll.singleChoice ? requested.slice(0, 1) : requested.slice(0, poll.options.length);
  if (!bounded.length) return { error: 'Choisis au moins une réponse.' };

  const previous = await getMyVotes(pollId, userId);
  const isFirstVote = previous.length === 0;

  /*
   * Décompte : on retire les options précédemment votées puis on ajoute les
   * nouvelles. Passer par un recalcul complet évite les doubles comptages quand
   * l'élève change d'avis.
   */
  const counts = new Map(poll.options.map((option) => [option.id, option.count]));
  for (const id of previous) counts.set(id, Math.max(0, (counts.get(id) ?? 0) - 1));
  for (const id of bounded) counts.set(id, (counts.get(id) ?? 0) + 1);

  const updated: Poll = {
    ...poll,
    options: poll.options.map((option) => ({ ...option, count: counts.get(option.id) ?? 0 })),
    voters: isFirstVote ? poll.voters + 1 : poll.voters,
  };

  await store.set(FK.poll(pollId), updated);
  if (bounded.length) await store.set(FK.pollVote(pollId, userId), bounded);
  else await store.del(FK.pollVote(pollId, userId));

  const changed = bounded.join('|') !== previous.join('|');
  return { poll: updated, myVotes: bounded, changed };
}

/* ------------------------------------------------------------------ */
/*  État de lecture                                                    */
/* ------------------------------------------------------------------ */

export async function getReadState(userId: string): Promise<FeedReadState> {
  const store = await getStorage();
  const value = await store.get<FeedReadState>(FK.read(userId));
  return {
    readIds: Array.isArray(value?.readIds) ? value.readIds : [],
    readAllAt: typeof value?.readAllAt === 'string' ? value.readAllAt : null,
  };
}

export async function markRead(userId: string, itemId: string): Promise<FeedReadState> {
  const store = await getStorage();
  const current = await getReadState(userId);
  if (current.readIds.includes(itemId)) return current;
  const next: FeedReadState = {
    ...current,
    readIds: [...current.readIds, itemId].slice(-MAX_READ_IDS),
  };
  await store.set(FK.read(userId), next);
  return next;
}

export async function markAllRead(userId: string, items: FeedItem[]): Promise<FeedReadState> {
  const store = await getStorage();
  const now = new Date().toISOString();
  const next: FeedReadState = {
    readIds: items.map((item) => item.id).slice(-MAX_READ_IDS),
    readAllAt: now,
  };
  await store.set(FK.read(userId), next);
  return next;
}

/**
 * Compte les éléments non lus.
 *
 * Un élément est non lu s'il n'est pas dans `readIds` **et** s'il est postérieur
 * au dernier « tout marquer lu ». La seconde condition évite d'avoir à stocker
 * l'intégralité des identifiants lus : après un marquage global, l'historique
 * ancien n'a plus besoin d'être retenu.
 */
export function countUnread(items: FeedItem[], state: FeedReadState): number {
  const read = new Set(state.readIds);
  const cutoff = state.readAllAt ? new Date(state.readAllAt).getTime() : 0;
  return items.filter((item) => {
    if (read.has(item.id)) return false;
    const created = new Date(item.createdAt).getTime();
    return Number.isFinite(created) ? created > cutoff : true;
  }).length;
}
