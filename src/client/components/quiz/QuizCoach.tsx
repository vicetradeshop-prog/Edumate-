/**
 * EduMate — Coach de quiz : discussion pédagogique affichée après les
 * résultats. L'élève peut demander comment trouver la bonne réponse à une
 * question, obtenir une méthode, un moyen mnémotechnique ou des conseils
 * pour progresser. Le coach connaît le détail du quiz (questions, réponses,
 * score) et s'appuie dessus pour expliquer.
 */
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { GraduationCap, MessageCircleQuestion, RotateCcw, Send, Sparkles } from 'lucide-react';
import { Button, IconButton } from '../ui/Button.js';
import { Markdown } from '../ui/Feedback.js';
import { endpoints } from '../../lib/api.js';
import { toast, useAuth } from '../../lib/store.js';

export interface QuizCoachHandle {
  /** Envoie une demande d'explication ciblée sur une question (1-based). */
  explainQuestion: (position: number) => void;
  /** Amène le clavier du coach à l'écran et donne le focus. */
  focusInput: () => void;
}

interface CoachResult {
  topicName: string;
  score: number;
  total: number;
  results: {
    prompt: string;
    correct: boolean;
    given: string | number | null;
    answer: number | null;
    options: string[];
    accept: string[] | null;
    explanation: string;
    skill: string | null;
  }[];
}

interface CoachMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** Message produit localement (accueil, erreur) : non renvoyé comme historique. */
  local?: boolean;
}

let messageCounter = 0;
const nextId = (): string => `coach-${Date.now()}-${(messageCounter += 1)}`;

export const QuizCoach = forwardRef<QuizCoachHandle, { result: CoachResult }>(function QuizCoach({ result }, ref) {
  const user = useAuth((state) => state.user);
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  /* Contexte du quiz envoyé au coach (questions + réponses + corrections). */
  const questions = useMemo(
    () =>
      result.results.map((item) => ({
        prompt: item.prompt,
        options: item.options ?? [],
        answer: item.answer,
        given: item.given,
        accept: item.accept,
        explanation: item.explanation,
        correct: item.correct,
        skill: item.skill,
      })),
    [result],
  );

  /* Message d'accueil personnalisé selon le score. */
  const greeting = useMemo<string>(() => {
    const mistakes = result.results.filter((item) => !item.correct).length;
    if (mistakes === 0) {
      return `Bravo, **${result.score}/${result.total}** sur « ${result.topicName} » : sans faute ! 🎉\n\nJe suis ton coach : demande-moi un approfondissement, un moyen mnémotechnique, ou clique sur une suggestion ci-dessous.`;
    }
    return `Tu as obtenu **${result.score}/${result.total}** sur « ${result.topicName} », avec ${mistakes} question${mistakes > 1 ? 's' : ''} à revoir.\n\nJe suis ton coach : je peux t'expliquer **comment trouver la bonne réponse** à n'importe quelle question, te donner une méthode ou un moyen mnémotechnique. Clique sur une suggestion ou pose ta question 👇`;
  }, [result]);

  useEffect(() => {
    setMessages([{ id: nextId(), role: 'assistant', content: greeting, local: true }]);
    setInput('');
    setBusy(false);
  }, [greeting]);

  /* Suggestions : questions ratées en priorité, puis conseils généraux. */
  const suggestions = useMemo(() => {
    const chips: { label: string; message: string }[] = [];
    result.results.forEach((item, index) => {
      if (!item.correct && chips.length < 3) {
        chips.push({
          label: `Question ${index + 1} : comment la réussir ?`,
          message: `Explique-moi étape par étape comment trouver la bonne réponse à la question ${index + 1}.`,
        });
      }
    });
    chips.push({
      label: 'Comment progresser sur ce sujet ?',
      message: `Quels conseils concrets pour progresser sur « ${result.topicName} » ? Donne-moi un plan simple en 3 étapes.`,
    });
    chips.push({
      label: 'Un moyen mnémotechnique',
      message: 'Donne-moi un moyen mnémotechnique pour retenir l’essentiel de ce quiz.',
    });
    return chips;
  }, [result]);

  /* Défilement automatique vers le dernier message (scrollTop : universel). */
  useEffect(() => {
    const node = listRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, busy]);

  const send = async (text?: string): Promise<void> => {
    const message = (text ?? input).trim();
    if (!message || busy) return;
    if (message.length < 2) {
      toast.warning('Écris une question un peu plus longue 🙂');
      return;
    }
    if (!user) return;

    const history = messages
      .filter((item) => !item.local)
      .slice(-8)
      .map((item) => ({ role: item.role, content: item.content }));

    setMessages((prev) => [...prev, { id: nextId(), role: 'user', content: message }]);
    setInput('');
    setBusy(true);

    try {
      const response = await endpoints.quizCoach({
        topicName: result.topicName,
        score: result.score,
        total: result.total,
        message,
        history,
        questions,
      });
      setMessages((prev) => [...prev, { id: nextId(), role: 'assistant', content: response.content }]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: 'assistant',
          local: true,
          content:
            "Je n'arrive pas à te répondre pour le moment. Vérifie ta connexion puis réessaie : ta question n'est pas perdue. Tu peux aussi relire les corrections détaillées juste au-dessus, elles contiennent le raisonnement complet. 🙂",
        },
      ]);
      toast.fromError(error, 'Le coach n’a pas pu répondre.');
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  const scrollIntoViewSafely = (): void => {
    const node = wrapRef.current;
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  useImperativeHandle(ref, () => ({
    explainQuestion: (position: number) => {
      scrollIntoViewSafely();
      void send(`Explique-moi en détail comment trouver la bonne réponse à la question ${position}, avec la méthode et les pièges à éviter.`);
    },
    focusInput: () => {
      scrollIntoViewSafely();
      window.setTimeout(() => inputRef.current?.focus(), 350);
    },
  }));

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  };

  const reset = (): void => {
    if (busy) return;
    setMessages([{ id: nextId(), role: 'assistant', content: greeting, local: true }]);
    setInput('');
  };

  return (
    <motion.div
      ref={wrapRef}
      className="card card--nopad coach"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      aria-label="Coach de quiz"
    >
      <div className="coach__head">
        <span className="coach__avatar" aria-hidden="true">
          <MessageCircleQuestion size={22} />
        </span>
        <div className="ed-grow" style={{ minWidth: 0 }}>
          <h2 style={{ fontSize: '1.12rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            Coach IA
            <Sparkles size={15} style={{ color: 'var(--ed-primary)' }} aria-hidden="true" />
          </h2>
          <p className="ed-small ed-mute" style={{ marginTop: 1 }}>
            Comprends tes réponses : méthodes, explications et astuces pour progresser.
          </p>
        </div>
        <IconButton label="Réinitialiser la discussion" variant="ghost" size="sm" onClick={reset} disabled={busy}>
          <RotateCcw size={16} />
        </IconButton>
      </div>

      {!user ? (
        <div className="coach__body ed-center" style={{ padding: 26 }}>
          <GraduationCap size={30} style={{ color: 'var(--ed-primary)', margin: '0 auto 8px' }} />
          <p className="ed-soft" style={{ maxWidth: '46ch', margin: '0 auto 14px' }}>
            Connecte-toi pour discuter avec le coach et obtenir des explications personnalisées sur ce quiz.
          </p>
          <Link to="/connexion">
            <Button variant="primary" size="sm">
              Se connecter
            </Button>
          </Link>
        </div>
      ) : (
        <>
          <div className="coach__messages" ref={listRef} aria-live="polite">
            <AnimatePresence initial={false}>
              {messages.map((message) => (
                <motion.div
                  key={message.id}
                  className={`bubble bubble--${message.role}`}
                  initial={{ opacity: 0, y: 12, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div className="bubble__meta">{message.role === 'user' ? `${user.avatar ?? '🧑‍🎓'} Toi` : '🎓 Coach'}</div>
                  {message.role === 'assistant' ? <Markdown>{message.content}</Markdown> : <p style={{ whiteSpace: 'pre-wrap' }}>{message.content}</p>}
                </motion.div>
              ))}
            </AnimatePresence>

            {busy ? (
              <div className="bubble bubble--assistant" role="status" aria-live="polite">
                <div className="bubble__meta">🎓 Coach réfléchit…</div>
                <span className="typing" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
              </div>
            ) : null}
          </div>

          <div className="coach__chips">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion.label}
                type="button"
                className="mode-chip"
                disabled={busy}
                onClick={() => void send(suggestion.message)}
              >
                💡 {suggestion.label}
              </button>
            ))}
          </div>

          <div className="coach__composer">
            <textarea
              ref={inputRef}
              className="textarea"
              rows={2}
              maxLength={2000}
              placeholder="Pose ta question au coach… (Entrée pour envoyer)"
              aria-label="Message au coach de quiz"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={onKeyDown}
            />
            <Button variant="primary" onClick={() => void send()} loading={busy} disabled={!input.trim()} icon={<Send size={16} />}>
              Envoyer
            </Button>
          </div>
        </>
      )}
    </motion.div>
  );
});
