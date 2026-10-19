/**
 * EduMate — API Assistant IA (aide aux devoirs).
 *
 * La clé d'API ne quitte jamais le serveur. Le client envoie sa demande,
 * le serveur construit le contexte pédagogique, interroge le fournisseur
 * configuré et renvoie la réponse (ou l'aide du tuteur intégré hors-ligne).
 *
 * Deux modes de réponse :
 *   - POST /ask        → JSON d'un bloc (simple, utilisé par les tests et
 *                        comme repli du client) ;
 *   - POST /ask/stream → SSE (Server-Sent Events) : le texte arrive mot à mot,
 *                        la conversation s'affiche progressivement.
 */
import { Router, type Response } from 'express';
import type { ChatMessage, Conversation, TutorMode, TutorRequest } from '../../shared/types.js';
import { getTutorProvider, providerInfo } from '../lib/ai.js';
import { findUserById, deleteConversation, listConversations, saveConversation } from '../lib/store.js';
import { newId } from '../lib/auth.js';
import { asyncHandler, badRequest, notFound, requireAuth, requireCsrf } from '../lib/middleware.js';
import { LIMITS, cleanText, optionalEnum, optionalString } from '../lib/validation.js';
import { LEVELS, SUBJECTS } from '../content/meta.js';
import { SUBJECT_LABELS } from '../lib/ai.js';

export const tutorRouter = Router();
tutorRouter.use(requireAuth());
tutorRouter.use(requireCsrf());

const MODES: TutorMode[] = ['expliquer', 'reformuler', 'methode', 'exercices', 'questions', 'corriger'];

tutorRouter.get('/status', (_req, res) => {
  res.json({ ...providerInfo(), modes: MODES, offlineFallback: true });
});

/* ------------------------------------------------------------------ */
/*  Validation commune aux deux routes de question                      */
/* ------------------------------------------------------------------ */

interface ParsedAsk {
  request: TutorRequest;
  message: string;
  conversationId: string | undefined;
  subjectId: string | undefined;
  levelLabel: string | undefined;
  student: { name?: string; level?: string; subject?: string };
}

async function parseAsk(body: Record<string, unknown>, userId: string): Promise<ParsedAsk> {
  const message = cleanText(body.message, LIMITS.message);
  if (message.length < 3) throw badRequest('Écris ta question (au moins 3 caractères).');

  const mode = optionalEnum(body.mode, MODES) ?? 'expliquer';
  const subjectId = optionalString(body.subjectId, 40);
  const level = optionalString(body.level, 40);
  const conversationId = optionalString(body.conversationId, 64);

  const user = await findUserById(userId);
  const subjectLabel = subjectId ? (SUBJECT_LABELS[subjectId] ?? SUBJECTS.find((s) => s.id === subjectId)?.name) : undefined;
  const levelLabel = level
    ? LEVELS.find((entry) => entry.id === level)?.name ?? level
    : user?.level
      ? (LEVELS.find((entry) => entry.id === user.level)?.name ?? String(user.level))
      : undefined;

  const history = Array.isArray(body.history)
    ? (body.history as ChatMessage[])
        .filter((entry) => entry && typeof entry.content === 'string' && (entry.role === 'user' || entry.role === 'assistant'))
        .slice(-8)
        .map((entry) => ({
          id: String(entry.id ?? newId()),
          role: entry.role,
          content: entry.content.slice(0, LIMITS.message),
          createdAt: entry.createdAt ?? new Date().toISOString(),
        }))
    : [];

  return {
    request: { subjectId, level: levelLabel, mode, message, history },
    message,
    conversationId,
    subjectId,
    levelLabel,
    student: { name: user?.firstName, level: levelLabel, subject: subjectLabel },
  };
}

/** Enregistre l'échange (question + réponse) dans l'historique du compte. */
async function persistConversation(
  userId: string,
  parsed: ParsedAsk,
  content: string,
): Promise<{ id: string; conversation: Omit<Conversation, 'userId'> }> {
  const id = parsed.conversationId ?? newId();
  const now = new Date().toISOString();
  const messages: ChatMessage[] = [
    ...(parsed.request.history ?? []),
    { id: newId(), role: 'user', content: parsed.message, createdAt: now },
    { id: newId(), role: 'assistant', content, createdAt: new Date().toISOString() },
  ];
  const title = parsed.message.split(/\n/)[0].slice(0, 60) || 'Discussion';
  const conversation: Omit<Conversation, 'userId'> = {
    id,
    title,
    subjectId: parsed.subjectId,
    level: parsed.levelLabel,
    messages: messages.slice(-40),
    updatedAt: new Date().toISOString(),
  };
  await saveConversation(userId, conversation);
  return { id, conversation };
}

/* ------------------------------------------------------------------ */
/*  POST /ask — réponse JSON d'un bloc                                  */
/* ------------------------------------------------------------------ */

tutorRouter.post(
  '/ask',
  asyncHandler(async (req, res) => {
    const parsed = await parseAsk((req.body ?? {}) as Record<string, unknown>, req.auth!.sub);

    const started = Date.now();
    const provider = getTutorProvider();
    const result = await provider.complete(parsed.request, parsed.student);

    const { id } = await persistConversation(req.auth!.sub, parsed, result.content);

    res.json({
      conversationId: id,
      content: result.content,
      provider: result.provider,
      offline: result.offline,
      mode: parsed.request.mode,
      durationMs: Date.now() - started,
    });
  }),
);

/* ------------------------------------------------------------------ */
/*  POST /ask/stream — réponse progressive (SSE)                        */
/* ------------------------------------------------------------------ */

/** Écrit un événement SSE et force le flush (middleware de compression). */
function writeEvent(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  // `compression()` expose res.flush() : sans lui, les fragments resteraient
  // en mémoire tampon et l'élève ne verrait rien arriver.
  const flushable = res as unknown as { flush?: () => void };
  if (typeof flushable.flush === 'function') flushable.flush();
}

tutorRouter.post(
  '/ask/stream',
  asyncHandler(async (req, res) => {
    const parsed = await parseAsk((req.body ?? {}) as Record<string, unknown>, req.auth!.sub);

    // En-têtes SSE : `no-transform` empêche les proxys de recompresser/mettre
    // en tampon ; `X-Accel-Buffering: no` couvre nginx et équivalents.
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const abortController = new AbortController();
    let clientGone = false;
    req.on('close', () => {
      clientGone = true;
      abortController.abort();
    });

    const started = Date.now();
    const provider = getTutorProvider();
    let fullText = '';

    try {
      const onDelta = (piece: string): void => {
        if (clientGone) return;
        writeEvent(res, 'delta', { text: piece });
      };

      const result = provider.completeStream
        ? await provider.completeStream(parsed.request, parsed.student, onDelta, abortController.signal)
        : await provider.complete(parsed.request, parsed.student);

      // Sans streaming natif (repli), le contenu complet n'a pas encore été
      // envoyé : on le transmet en un seul fragment.
      if (!provider.completeStream && !clientGone) {
        writeEvent(res, 'delta', { text: result.content });
      }
      fullText = result.content;

      if (!clientGone) {
        const { id } = await persistConversation(req.auth!.sub, parsed, fullText);
        writeEvent(res, 'done', {
          conversationId: id,
          content: fullText,
          provider: result.provider,
          offline: result.offline,
          mode: parsed.request.mode,
          durationMs: Date.now() - started,
        });
      } else if (fullText) {
        // L'élève est parti en cours de route : on conserve quand même ce qui
        // a été produit, sa conversation reste cohérente.
        await persistConversation(req.auth!.sub, parsed, fullText).catch(() => undefined);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn('[EduMate] Échec du flux assistant :', message);
      if (!clientGone) {
        writeEvent(res, 'error', {
          message: "Je n'ai pas pu terminer cette réponse. Vérifie ta connexion puis réessaie : ta question n'est pas perdue.",
        });
      }
    } finally {
      if (!clientGone) res.end();
    }
  }),
);

/* ------------------------------------------------------------------ */
/*  Historique des conversations                                        */
/* ------------------------------------------------------------------ */

tutorRouter.get(
  '/conversations',
  asyncHandler(async (req, res) => {
    const conversations = await listConversations(req.auth!.sub);
    res.json({
      conversations: conversations.map((conversation) => ({
        id: conversation.id,
        title: conversation.title,
        subjectId: conversation.subjectId,
        level: conversation.level,
        updatedAt: conversation.updatedAt,
        messageCount: conversation.messages.length,
        preview: conversation.messages[conversation.messages.length - 1]?.content.slice(0, 140) ?? '',
      })),
    });
  }),
);

tutorRouter.get(
  '/conversations/:id',
  asyncHandler(async (req, res) => {
    const conversations = await listConversations(req.auth!.sub);
    const conversation = conversations.find((item) => item.id === req.params.id);
    if (!conversation) throw notFound('Conversation introuvable.');
    res.json({ conversation });
  }),
);

tutorRouter.delete(
  '/conversations/:id',
  asyncHandler(async (req, res) => {
    const conversations = await deleteConversation(req.auth!.sub, req.params.id);
    res.json({ conversations });
  }),
);
