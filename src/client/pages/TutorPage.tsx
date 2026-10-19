/**
 * EduMate — Aide aux devoirs (assistant IA), version 2.
 *
 * Refonte complète de l'interface :
 *   - la conversation occupe TOUTE la page (l'historique et les idées de
 *     demandes ne monopolisent plus une colonne entière : l'historique vit
 *     dans un tiroir latéral animé, les suggestions dans l'état vide et dans
 *     une rangée de puces dépliable) ;
 *   - réponses en CONTINU (streaming SSE) avec curseur clignotant, bouton
 *     « stop », repli automatique sur la requête JSON classique ;
 *   - actions par message : copier, régénérer, réessayer après une erreur ;
 *   - rendu Markdown + LaTeX nettoyé (plus jamais de balises brutes ni de
 *     formules rouges) ;
 *   - Entrée pour envoyer, Maj+Entrée pour un saut de ligne.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowDown,
  BookOpen,
  Brain,
  Check,
  CheckCheck,
  Copy,
  Eraser,
  HelpCircle,
  History,
  Lightbulb,
  ListChecks,
  MessageSquarePlus,
  PenLine,
  RotateCcw,
  Send,
  Sparkles,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { Button, IconButton } from '../components/ui/Button.js';
import { Badge } from '../components/ui/Badge.js';
import { Markdown } from '../components/ui/Feedback.js';
import { Select } from '../components/ui/Field.js';
import { endpoints } from '../lib/api.js';
import { useApi } from '../lib/data.js';
import { toast, useAuth, useCatalog } from '../lib/store.js';
import { formatRelative } from '../lib/format.js';
import { useDocumentTitle } from '../lib/hooks.js';
import type { ChatMessage, TutorMode } from '../../shared/types.js';

/* ------------------------------------------------------------------ */
/*  Modes d'aide et suggestions                                        */
/* ------------------------------------------------------------------ */

const MODES: { id: TutorMode; label: string; icon: typeof Lightbulb; hint: string; placeholder: string }[] = [
  {
    id: 'expliquer',
    label: 'Expliquer',
    icon: Lightbulb,
    hint: 'Comprendre une notion pas à pas',
    placeholder: 'Ex. : Explique-moi comment dériver f(x) = 3x² + 2x',
  },
  {
    id: 'reformuler',
    label: 'Reformuler',
    icon: Brain,
    hint: 'Rendre un texte ou une consigne plus claire',
    placeholder: 'Colle ici le texte ou la consigne à simplifier…',
  },
  {
    id: 'methode',
    label: 'Méthode',
    icon: ListChecks,
    hint: 'Obtenir une démarche étape par étape',
    placeholder: 'Ex. : Quelle méthode pour un commentaire de texte ?',
  },
  {
    id: 'exercices',
    label: 'Exercices',
    icon: PenLine,
    hint: 'Générer des exercices progressifs corrigés',
    placeholder: 'Ex. : Donne-moi 3 exercices sur les probabilités',
  },
  {
    id: 'questions',
    label: 'Questions',
    icon: HelpCircle,
    hint: 'Créer un quiz maison sur une notion',
    placeholder: 'Ex. : Pose-moi 5 questions sur la guerre froide',
  },
  {
    id: 'corriger',
    label: 'Corriger',
    icon: CheckCheck,
    hint: 'Faire relire une production personnelle',
    placeholder: 'Colle ton texte, ton calcul ou ta réponse à corriger…',
  },
];

const SUGGESTIONS = [
  { label: 'Expliquer la dérivation', emoji: '📈', mode: 'expliquer' as TutorMode, text: 'Explique-moi la dérivation d’un polynôme, avec un exemple.' },
  { label: 'Méthode du commentaire', emoji: '📝', mode: 'methode' as TutorMode, text: 'Donne-moi la méthode complète pour un commentaire littéraire.' },
  { label: 'Réviser la conjugaison', emoji: '✍️', mode: 'exercices' as TutorMode, text: 'Propose-moi des exercices sur le passé simple et l’imparfait.' },
  { label: 'Comprendre une équation', emoji: '🧮', mode: 'expliquer' as TutorMode, text: 'Comment résoudre une équation du second degré avec le discriminant ?' },
  { label: 'Plan de dissertation', emoji: '🦉', mode: 'methode' as TutorMode, text: 'Aide-moi à construire un plan de dissertation en philosophie.' },
  { label: 'Vérifier mon calcul', emoji: '✅', mode: 'corriger' as TutorMode, text: 'Vérifie mon calcul : 2x + 5 = 13 donc x = 9.' },
];

const LEVEL_LABELS: Record<string, string> = {
  troisieme: 'Troisième',
  seconde: 'Seconde',
  premiere: 'Première',
  terminale: 'Terminale',
};

interface LocalMessage extends ChatMessage {
  /** Réponse en cours d'écriture (streaming). */
  streaming?: boolean;
  /** Message d'échec : affiche un bouton « Réessayer ». */
  error?: boolean;
  /** Question d'origine conservée pour « Réessayer » / « Régénérer ». */
  retryText?: string;
  offline?: boolean;
  provider?: string;
}

let idCounter = 0;
const nextId = (prefix: string): string => `${prefix}-${Date.now()}-${(idCounter += 1)}`;

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function TutorPage() {
  const user = useAuth((state) => state.user);
  const subjects = useCatalog((state) => state.subjects);
  const aiConfigured = useAuth((state) => state.aiConfigured);
  useDocumentTitle('Aide aux devoirs');

  const [mode, setMode] = useState<TutorMode>('expliquer');
  const [subjectId, setSubjectId] = useState<string>('');
  const [level, setLevel] = useState<string>(typeof user?.level === 'string' ? user.level : '');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [ideasOpen, setIdeasOpen] = useState(false);
  const [atBottom, setAtBottom] = useState(true);

  const conversations = useApi(() => endpoints.conversations(), { deps: [user?.id] });
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  /** Texte reçu pendant le streaming, hors cycle React (flush via rAF). */
  const streamBufferRef = useRef('');
  const streamFrameRef = useRef(0);
  const streamIdRef = useRef<string | null>(null);

  useEffect(() => {
    void useCatalog.getState().load();
  }, []);

  useEffect(() => {
    if (user?.level && typeof user.level === 'string') setLevel(user.level);
  }, [user?.level]);

  const conversationCount = conversations.data?.conversations.length ?? 0;
  const activeMode = MODES.find((item) => item.id === mode) ?? MODES[0];
  const subject = subjects.find((item) => item.id === subjectId);

  /* ------------------------------ Défilement ------------------------------ */

  const scrollToBottom = useCallback((smooth = true): void => {
    const node = listRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  // Suit le flux pendant la génération, uniquement si l'élève est déjà en bas
  // (sinon il est en train de relire : on ne lui vole pas la position).
  useEffect(() => {
    if (!atBottom) return;
    const node = listRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, busy, atBottom]);

  const onMessagesScroll = (): void => {
    const node = listRef.current;
    if (!node) return;
    const distance = node.scrollHeight - node.scrollTop - node.clientHeight;
    setAtBottom(distance < 90);
  };

  /* --------------------------- Zone de saisie ----------------------------- */

  // Auto-grandissement du champ (jusqu'à ~7 lignes).
  useEffect(() => {
    const node = inputRef.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = `${Math.min(node.scrollHeight, 176)}px`;
  }, [input]);

  /* ------------------------------- Envoi ---------------------------------- */

  const flushStream = useCallback((): void => {
    streamFrameRef.current = 0;
    const id = streamIdRef.current;
    if (!id) return;
    const text = streamBufferRef.current;
    setMessages((prev) => prev.map((message) => (message.id === id ? { ...message, content: text } : message)));
  }, []);

  const onStreamDelta = useCallback(
    (piece: string): void => {
      streamBufferRef.current += piece;
      if (!streamFrameRef.current && typeof requestAnimationFrame === 'function') {
        streamFrameRef.current = requestAnimationFrame(flushStream);
      }
    },
    [flushStream],
  );

  const finalizeStream = useCallback((id: string, content: string): void => {
    if (streamFrameRef.current && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(streamFrameRef.current);
    streamFrameRef.current = 0;
    streamBufferRef.current = '';
    streamIdRef.current = null;
    setMessages((prev) =>
      prev.map((message) => (message.id === id ? { ...message, content, streaming: false } : message)),
    );
  }, []);

  const send = useCallback(
    async (text?: string, regenerate = false): Promise<void> => {
      const message = (text ?? input).trim();
      if (!message || busy) return;
      if (message.length < 3) {
        toast.warning('Écris une question un peu plus détaillée 🙂');
        return;
      }

      // Historique envoyé au serveur : les 8 derniers messages utiles
      // (les messages d'erreur locaux en sont exclus). En régénération, on
      // écarte aussi la réponse à remplacer : le modèle ne doit pas revoir
      // sa propre copie.
      const usable = messages.filter((item) => !item.error && !item.streaming && item.content.trim().length > 0);
      if (regenerate) {
        while (usable.length && usable[usable.length - 1].role === 'assistant') usable.pop();
      }
      const history: ChatMessage[] = usable
        .slice(-8)
        .map((item) => ({ id: item.id, role: item.role, content: item.content, createdAt: item.createdAt }));

      const userMessage: LocalMessage | null = regenerate
        ? // Régénération : la question existe déjà dans la conversation, on ne
          // la réaffiche pas — on remplace uniquement la réponse.
          null
        : {
            id: nextId('user'),
            role: 'user',
            content: message,
            createdAt: new Date().toISOString(),
          };

      const assistantId = nextId('assistant');
      setMessages((prev) => {
        let next = prev;
        if (regenerate) {
          // Retire la dernière réponse de l'assistant (celle qu'on remplace).
          for (let index = next.length - 1; index >= 0; index -= 1) {
            if (next[index].role === 'assistant') {
              next = [...next.slice(0, index), ...next.slice(index + 1)];
              break;
            }
          }
        } else if (userMessage) {
          next = [...next, userMessage];
        }
        return [
          ...next,
          {
            id: assistantId,
            role: 'assistant',
            content: '',
            createdAt: new Date().toISOString(),
            streaming: true,
            retryText: message,
          },
        ];
      });
      setInput('');
      setBusy(true);
      setAtBottom(true);
      streamBufferRef.current = '';
      streamIdRef.current = assistantId;

      const controller = new AbortController();
      abortRef.current = controller;
      const payload = {
        message,
        mode,
        subjectId: subjectId || undefined,
        level: level || undefined,
        conversationId,
        history,
      };

      const markError = (reason: string): void => {
        finalizeStream(assistantId, '');
        setMessages((prev) =>
          prev.map((item) =>
            item.id === assistantId
              ? { ...item, content: reason, error: true, streaming: false, retryText: message }
              : item,
          ),
        );
      };

      try {
        const response = await endpoints.askStream(payload, onStreamDelta, controller.signal);
        finalizeStream(assistantId, response.content);
        setMessages((prev) =>
          prev.map((item) =>
            item.id === assistantId ? { ...item, offline: response.offline, provider: response.provider } : item,
          ),
        );
        setConversationId(response.conversationId);
        void conversations.reload();
      } catch (error) {
        // Arrêt volontaire (bouton « stop ») : on garde ce qui a été écrit.
        if (controller.signal.aborted) {
          const partial = streamBufferRef.current.trim();
          if (partial) {
            finalizeStream(assistantId, partial);
            toast.info('Génération arrêtée.');
          } else {
            setMessages((prev) => prev.filter((item) => item.id !== assistantId));
            toast.info('Génération arrêtée.');
          }
          void conversations.reload();
        } else {
          // Le flux n'a pas abouti (serveur froid, route absente, réseau…) :
          // repli silencieux sur la requête JSON classique.
          try {
            const response = await endpoints.ask(payload);
            finalizeStream(assistantId, response.content);
            setMessages((prev) =>
              prev.map((item) =>
                item.id === assistantId ? { ...item, offline: response.offline, provider: response.provider } : item,
              ),
            );
            setConversationId(response.conversationId);
            void conversations.reload();
          } catch (secondError) {
            markError(
              "Je n'ai pas pu traiter ta demande pour le moment. Vérifie ta connexion, puis réessaie : ta question n'est pas perdue.",
            );
            toast.fromError(secondError ?? error, 'L’assistant n’a pas pu répondre.');
          }
        }
      } finally {
        abortRef.current = null;
        setBusy(false);
        inputRef.current?.focus();
      }
    },
    [busy, conversationId, conversations, finalizeStream, input, level, messages, mode, onStreamDelta, subjectId],
  );

  const stop = (): void => {
    abortRef.current?.abort();
  };

  /* ----------------------------- Conversations ---------------------------- */

  const newConversation = (): void => {
    setMessages([]);
    setConversationId(undefined);
    setInput('');
    setHistoryOpen(false);
    setAtBottom(true);
    inputRef.current?.focus();
  };

  const openConversation = async (id: string): Promise<void> => {
    try {
      const { conversation } = await endpoints.conversation(id);
      setConversationId(conversation.id);
      setMessages(conversation.messages.map((message) => ({ ...message })));
      if (conversation.subjectId) setSubjectId(conversation.subjectId);
      setHistoryOpen(false);
      setAtBottom(true);
      window.setTimeout(() => scrollToBottom(false), 60);
    } catch (error) {
      toast.fromError(error, 'Impossible d’ouvrir cette conversation.');
    }
  };

  const removeConversation = async (id: string): Promise<void> => {
    try {
      await endpoints.deleteConversation(id);
      await conversations.reload();
      if (conversationId === id) newConversation();
      toast.success('Conversation supprimée.');
    } catch (error) {
      toast.fromError(error);
    }
  };

  /* --------------------------------- Actions ------------------------------ */

  const copyMessage = async (content: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(content);
      toast.success('Réponse copiée dans le presse-papiers.');
    } catch {
      toast.warning('La copie automatique est refusée par le navigateur.');
    }
  };

  const regenerate = (): void => {
    const lastUser = [...messages].reverse().find((item) => item.role === 'user' && !item.error);
    if (!lastUser || busy) return;
    void send(lastUser.content, true);
  };

  /* --------------------------------- Rendu -------------------------------- */

  const statusLabel = aiConfigured ? 'IA en ligne' : 'Tuteur intégré';
  const emptyState = messages.length === 0 && !busy;
  const lastAssistantId = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index].role === 'assistant' && !messages[index].error) return messages[index].id;
    }
    return null;
  }, [messages]);

  return (
    <div className="tutor-v2">
      {/* --------------------------- En-tête compact -------------------------- */}
      <header className="page-head tutor-v2__head">
        <div className="page-head__title">
          <span className="page-head__eyebrow">
            <Sparkles size={13} style={{ verticalAlign: '-2px' }} /> Assistant pédagogique
          </span>
          <h1>Aide aux devoirs</h1>
        </div>
        <div className="ed-row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <Badge tone={aiConfigured ? 'success' : 'primary'}>
            <span className={`status-dot${aiConfigured ? ' status-dot--live' : ''}`} aria-hidden="true" />
            {statusLabel}
          </Badge>
          <Button variant="soft" size="sm" icon={<MessageSquarePlus size={15} />} onClick={newConversation}>
            Nouvelle discussion
          </Button>
          <Button variant="soft" size="sm" icon={<History size={15} />} onClick={() => setHistoryOpen(true)}>
            Historique{conversationCount > 0 ? ` · ${conversationCount}` : ''}
          </Button>
        </div>
      </header>

      {/* ------------------------------ Conversation ------------------------- */}
      <section className="chat-panel" aria-label="Conversation avec l'assistant">
        {/* Barre d'outils : modes + contexte */}
        <div className="chat-panel__tools">
          <div className="mode-chips" role="group" aria-label="Type d’aide">
            {MODES.map((item) => (
              <button
                key={item.id}
                type="button"
                className="mode-chip"
                aria-pressed={mode === item.id}
                title={item.hint}
                onClick={() => setMode(item.id)}
              >
                <item.icon size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} />
                {item.label}
              </button>
            ))}
          </div>
          <div className="chat-panel__context">
            <Select
              aria-label="Matière"
              value={subjectId}
              onChange={(event) => setSubjectId(event.target.value)}
              className="chat-select"
            >
              <option value="">🎯 Matière : auto</option>
              {subjects.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.emoji} {item.name}
                </option>
              ))}
            </Select>
            <Select aria-label="Niveau" value={level} onChange={(event) => setLevel(event.target.value)} className="chat-select">
              <option value="">🎓 Niveau</option>
              {Object.entries(LEVEL_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {/* Fil de discussion */}
        <div className="chat-messages" ref={listRef} onScroll={onMessagesScroll} aria-live="polite">
          {emptyState ? (
            <motion.div
              className="chat-empty"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              <span className="chat-empty__owl anim-float" aria-hidden="true">
                🦉
              </span>
              <h2>Bonjour {user?.firstName || ''} !</h2>
              <p>
                Dis-moi ce qui te bloque : un exercice, une notion, une méthode. Je m’adapte à ton
                niveau{level ? ` (${LEVEL_LABELS[level] ?? level})` : ''}
                {subject ? ` et à la matière ${subject.name}` : ''}.
              </p>
              <div className="chat-empty__grid">
                {SUGGESTIONS.map((suggestion, index) => (
                  <motion.button
                    key={suggestion.label}
                    type="button"
                    className="chat-suggest-card"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.12 + index * 0.05, ease: [0.22, 1, 0.36, 1] }}
                    whileHover={{ y: -3 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => {
                      setMode(suggestion.mode);
                      void send(suggestion.text);
                    }}
                  >
                    <span aria-hidden="true">{suggestion.emoji}</span>
                    <strong>{suggestion.label}</strong>
                    <small>{MODES.find((item) => item.id === suggestion.mode)?.hint}</small>
                  </motion.button>
                ))}
              </div>
              <p className="chat-empty__hint">
                💡 Tu peux aussi coller un énoncé complet, une photo recopiée ou ta propre réponse à corriger.
              </p>
            </motion.div>
          ) : null}

          <AnimatePresence initial={false}>
            {messages.map((message) => {
              const isError = Boolean(message.error);
              const isUser = message.role === 'user';
              const time = new Date(message.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
              return (
                <motion.div
                  key={message.id}
                  className={`chat-msg chat-msg--${isError ? 'error' : message.role}`}
                  initial={{ opacity: 0, y: 14, scale: 0.985 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, transition: { duration: 0.16 } }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                >
                  {!isUser ? (
                    <span className={`chat-avatar${isError ? ' chat-avatar--error' : ''}`} aria-hidden="true">
                      {isError ? '⚠️' : '🦉'}
                    </span>
                  ) : null}
                  <div className="chat-msg__main">
                    <div className="chat-msg__meta">
                      <strong>{isUser ? `${user?.avatar ?? '🧑‍🎓'} Toi` : isError ? 'Oups' : 'EduMate'}</strong>
                      <span>{time}</span>
                      {!isUser && !isError && message.offline ? <em>Tuteur intégré</em> : null}
                      {!isUser && !isError && !message.offline && message.provider ? <em>IA</em> : null}
                    </div>

                    {isError ? (
                      <div className="chat-msg__error">
                        <p>{message.content}</p>
                        <div className="ed-row" style={{ gap: 8, marginTop: 10 }}>
                          <Button
                            size="sm"
                            variant="soft"
                            icon={<RotateCcw size={14} />}
                            disabled={busy}
                            onClick={() => message.retryText && void send(message.retryText, true)}
                          >
                            Réessayer
                          </Button>
                        </div>
                      </div>
                    ) : isUser ? (
                      <p className="chat-msg__text" style={{ whiteSpace: 'pre-wrap' }}>
                        {message.content}
                      </p>
                    ) : (
                      <div className="chat-msg__rich">
                        {message.content ? <Markdown>{message.content}</Markdown> : null}
                        {message.streaming ? (
                          <span className="chat-stream" aria-label="Réponse en cours">
                            {message.content ? <span className="chat-cursor" aria-hidden="true" /> : null}
                            {!message.content ? (
                              <span className="typing" aria-hidden="true">
                                <span />
                                <span />
                                <span />
                              </span>
                            ) : null}
                          </span>
                        ) : null}
                      </div>
                    )}

                    {/* Actions : discrètes, visibles au survol (et toujours au clavier) */}
                    {!isError && !message.streaming && message.content ? (
                      <div className="chat-msg__actions">
                        <button type="button" className="chat-action" onClick={() => void copyMessage(message.content)}>
                          <Copy size={13} /> Copier
                        </button>
                        {!isUser && message.id === lastAssistantId ? (
                          <button type="button" className="chat-action" disabled={busy} onClick={regenerate}>
                            <RotateCcw size={13} /> Régénérer
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {/* Bouton « revenir en bas » */}
        <AnimatePresence>
          {!atBottom && !emptyState ? (
            <motion.button
              type="button"
              className="chat-scroll-bottom"
              initial={{ opacity: 0, y: 8, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.9 }}
              onClick={() => {
                setAtBottom(true);
                scrollToBottom();
              }}
              aria-label="Revenir en bas de la conversation"
            >
              <ArrowDown size={16} />
            </motion.button>
          ) : null}
        </AnimatePresence>

        {/* ------------------------------- Composer ------------------------- */}
        <div className="tutor-composer chat-composer">
          <AnimatePresence initial={false}>
            {ideasOpen ? (
              <motion.div
                className="chat-ideas"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="chat-ideas__row">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion.label}
                      type="button"
                      className="chat-idea"
                      disabled={busy}
                      onClick={() => {
                        setMode(suggestion.mode);
                        void send(suggestion.text);
                      }}
                    >
                      <span aria-hidden="true">{suggestion.emoji}</span> {suggestion.label}
                    </button>
                  ))}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <div className="chat-composer__box">
            <label className="sr-only" htmlFor="tutor-input">
              Ta question
            </label>
            <textarea
              id="tutor-input"
              ref={inputRef}
              className="textarea chat-composer__input"
              rows={1}
              maxLength={4000}
              placeholder={`${activeMode.placeholder}  ·  ${activeMode.hint}`}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
            />
            <div className="chat-composer__side">
              <IconButton
                label="Idées de demandes"
                size="sm"
                variant={ideasOpen ? 'primary' : 'ghost'}
                onClick={() => setIdeasOpen((value) => !value)}
                aria-expanded={ideasOpen}
              >
                <Lightbulb size={17} />
              </IconButton>
              {busy ? (
                <motion.button
                  type="button"
                  className="chat-send chat-send--stop"
                  onClick={stop}
                  aria-label="Arrêter la génération"
                  initial={{ scale: 0.85 }}
                  animate={{ scale: 1 }}
                >
                  <Square size={15} fill="currentColor" />
                </motion.button>
              ) : (
                <motion.button
                  type="button"
                  className="chat-send"
                  onClick={() => void send()}
                  disabled={!input.trim()}
                  aria-label="Envoyer la question"
                  whileTap={{ scale: 0.92 }}
                >
                  <Send size={17} />
                </motion.button>
              )}
            </div>
          </div>
          <div className="chat-composer__foot">
            <span className="ed-small ed-mute">
              <kbd>Entrée</kbd> pour envoyer · <kbd>Maj + Entrée</kbd> pour un saut de ligne
            </span>
            <span className={`ed-small chat-counter${input.length > 3600 ? ' chat-counter--warn' : ''}`}>
              {input.length}/4000
            </span>
          </div>
        </div>
      </section>

      {/* ------------------------ Tiroir « Historique » ---------------------- */}
      <AnimatePresence>
        {historyOpen ? (
          <>
            <motion.div
              className="chat-drawer__scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setHistoryOpen(false)}
            />
            <motion.aside
              className="chat-drawer"
              role="dialog"
              aria-label="Historique des conversations"
              initial={{ x: '-105%' }}
              animate={{ x: 0 }}
              exit={{ x: '-105%' }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="chat-drawer__head">
                <h2>
                  <History size={17} style={{ verticalAlign: '-3px', marginRight: 7 }} />
                  Historique
                </h2>
                <IconButton label="Fermer l’historique" size="sm" variant="ghost" onClick={() => setHistoryOpen(false)}>
                  <X size={17} />
                </IconButton>
              </div>
              <Button block variant="soft" icon={<MessageSquarePlus size={16} />} onClick={newConversation} style={{ marginBottom: 12 }}>
                Nouvelle conversation
              </Button>

              {conversations.loading && !conversations.data ? (
                <div className="ed-stack" style={{ gap: 8 }}>
                  <div className="skeleton" style={{ height: 56 }} />
                  <div className="skeleton" style={{ height: 56 }} />
                  <div className="skeleton" style={{ height: 56 }} />
                </div>
              ) : !conversations.data?.conversations.length ? (
                <p className="ed-small ed-mute" style={{ textAlign: 'center', marginTop: 24 }}>
                  Aucune conversation enregistrée pour l’instant.
                </p>
              ) : (
                <div className="chat-drawer__list">
                  {conversations.data.conversations.map((item) => {
                    const itemSubject = subjects.find((entry) => entry.id === item.subjectId);
                    return (
                      <div key={item.id} className={`chat-history-item${item.id === conversationId ? ' chat-history-item--active' : ''}`}>
                        <button type="button" className="chat-history-item__open" onClick={() => void openConversation(item.id)}>
                          <span className="chat-history-item__title">{item.title}</span>
                          <span className="chat-history-item__meta">
                            {itemSubject ? `${itemSubject.emoji} ` : '💬 '}
                            {item.messageCount} messages · {formatRelative(item.updatedAt)}
                          </span>
                          {item.preview ? <span className="chat-history-item__preview">{item.preview}</span> : null}
                        </button>
                        <IconButton
                          label={`Supprimer « ${item.title} »`}
                          size="sm"
                          variant="ghost"
                          onClick={() => void removeConversation(item.id)}
                        >
                          <Trash2 size={15} />
                        </IconButton>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="chat-drawer__foot">
                <p className="ed-small ed-mute">
                  <Eraser size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} />
                  Besoin d’entraînement ? Les quiz corrigés automatiquement complètent parfaitement l’assistant.
                </p>
                <Link to="/quiz" onClick={() => setHistoryOpen(false)}>
                  <Button size="sm" variant="soft" icon={<BookOpen size={14} />}>
                    Ouvrir le catalogue
                  </Button>
                </Link>
              </div>
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>

      {/* Fermeture du tiroir à la touche Échap */}
      <EscapeListener active={historyOpen} onEscape={() => setHistoryOpen(false)} />
    </div>
  );
}

/** Ferme un panneau à la touche Échap (monté uniquement quand nécessaire). */
function EscapeListener({ active, onEscape }: { active: boolean; onEscape: () => void }) {
  useEffect(() => {
    if (!active) return;
    const handler = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onEscape();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [active, onEscape]);
  return null;
}
