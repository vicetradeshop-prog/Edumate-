import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check, Clock, Flag, Keyboard, RotateCcw, X, Zap } from 'lucide-react';
import { Button, IconButton } from '../components/ui/Button.js';
import { Card } from '../components/ui/Card.js';
import { Badge, Progress } from '../components/ui/Badge.js';
import { Modal } from '../components/ui/Modal.js';
import { Loader, Notice, QuestionText } from '../components/ui/Feedback.js';
import { endpoints, type QuizQuestionClient } from '../lib/api.js';
import { useQuiz, toast } from '../lib/store.js';
import { formatClock, softColor } from '../lib/format.js';
import { useDocumentTitle, useHotkeys } from '../lib/hooks.js';

const STORAGE_KEY = 'edumate:quiz-progress';
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const RESUME_WINDOW_MS = 3 * 60 * 60 * 1000;

interface StoredProgress {
  topicId: string;
  seed: number;
  count: number;
  index: number;
  answers: Record<string, string | number>;
  startedAt: number;
  savedAt: string;
}

/**
 * Écran de jeu : une question à la fois, transitions animées, compteur,
 * sauvegarde locale (reprise après rafraîchissement) et correction finale
 * calculée par le serveur.
 */
export default function QuizPlayPage() {
  const { topicId = '' } = useParams();
  const navigate = useNavigate();
  const session = useQuiz((state) => state.session);
  const setSession = useQuiz((state) => state.setSession);
  const setResult = useQuiz((state) => state.setResult);
  useDocumentTitle(session?.topicName ? `Quiz : ${session.topicName}` : 'Quiz en cours');

  const [questions, setQuestions] = useState<QuizQuestionClient[]>(session?.questions ?? []);
  const [seed, setSeed] = useState<number>(session?.seed ?? 0);
  const [textValue, setTextValue] = useState('');
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | number>>({});
  const [selected, setSelected] = useState<string | number | null>(null);
  const [loading, setLoading] = useState(!session);
  const [submitting, setSubmitting] = useState(false);
  const [quitOpen, setQuitOpen] = useState(false);
  const [resumed, setResumed] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const startedAt = useRef<number>(session?.startedAt ?? Date.now());

  /* ------------------------ Chargement / reprise --------------------------- */
  useEffect(() => {
    if (session && session.topicId === topicId && session.questions.length) {
      setQuestions(session.questions);
      setSeed(session.seed);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const restore = async (): Promise<void> => {
      // Reprise d'une partie interrompue (même graine → mêmes questions).
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const stored = JSON.parse(raw) as StoredProgress;
          const fresh = Date.now() - new Date(stored.savedAt).getTime() < RESUME_WINDOW_MS;
          if (stored.topicId === topicId && fresh) {
            const quiz = await endpoints.generate({ topicId, seed: stored.seed, count: stored.count });
            if (cancelled) return;
            setQuestions(quiz.questions);
            setSeed(quiz.seed);
            setAnswers(stored.answers ?? {});
            setIndex(Math.min(stored.index ?? 0, Math.max(0, quiz.questions.length - 1)));
            startedAt.current = stored.startedAt;
            setResumed(true);
            setLoading(false);
            return;
          }
        }
      } catch {
        /* stockage indisponible : on repart d'une session neuve */
      }

      try {
        const quiz = await endpoints.generate({ topicId, count: 10 });
        if (cancelled) return;
        setQuestions(quiz.questions);
        setSeed(quiz.seed);
        startedAt.current = Date.now();
        setSession({
          topicId: quiz.topic.id,
          topicName: quiz.topic.name,
          subjectName: quiz.topic.subjectName,
          themeName: quiz.topic.themeName,
          levelName: quiz.topic.levelName,
          emoji: quiz.topic.emoji,
          color: quiz.topic.color,
          accent: quiz.topic.accent,
          seed: quiz.seed,
          durationSec: quiz.durationSec,
          startedAt: startedAt.current,
          questions: quiz.questions,
        });
        setLoading(false);
      } catch (error) {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : 'Impossible de charger ce quiz.');
        setLoading(false);
      }
    };

    void restore();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicId]);

  /* ------------------------------ Chronomètre ----------------------------- */
  useEffect(() => {
    if (loading || submitting) return;
    const id = window.setInterval(() => setElapsed(Math.round((Date.now() - startedAt.current) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, [loading, submitting]);

  /* ---------------------- Sauvegarde de la progression -------------------- */
  useEffect(() => {
    if (loading || !questions.length) return;
    const payload: StoredProgress = {
      topicId,
      seed,
      count: questions.length,
      index,
      answers,
      startedAt: startedAt.current,
      savedAt: new Date().toISOString(),
    };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* quota atteint : la partie reste jouable */
    }
  }, [topicId, seed, index, answers, questions.length, loading]);

  const question = questions[index];
  const total = questions.length;
  const answeredCount = Object.keys(answers).length;
  const isLast = index + 1 >= total;

  /* ------------------------------- Actions -------------------------------- */
  const finish = useCallback(
    async (partial: Record<string, string | number>) => {
      setSubmitting(true);
      try {
        const payload = Object.entries(partial).map(([questionId, value]) => ({ questionId, value }));
        const graded = await endpoints.grade({
          topicId,
          seed,
          durationSec: Math.round((Date.now() - startedAt.current) / 1000),
          answers: payload,
        });
        try {
          window.localStorage.removeItem(STORAGE_KEY);
        } catch {
          /* sans objet */
        }
        setResult({
          topicId,
          topicName: session?.topicName ?? 'Quiz',
          emoji: session?.emoji ?? '🎯',
          color: session?.color ?? '#6c5ce7',
          score: graded.score,
          total: graded.total,
          percent: graded.percent,
          durationSec: graded.durationSec,
          results: graded.results,
          // Sans compte connecté, le serveur n'enregistre pas d'essai :
          // la révision interactive proposera alors une session d'entraînement.
          attemptId: graded.attemptId ?? null,
        });
        navigate('/quiz/resultat', { replace: true });
      } catch (error) {
        toast.fromError(error, 'Impossible d’enregistrer ton score. Réessaie.');
        setSubmitting(false);
      }
    },
    [navigate, seed, session, setResult, topicId],
  );

  const record = (value: string | number): void => {
    if (!question) return;
    setAnswers((prev) => ({ ...prev, [question.id]: value }));
    setSelected(value);
  };

  const nextQuestion = (): void => {
    if (isLast) {
      void finish(answers);
      return;
    }
    const upcoming = questions[index + 1];
    setSelected(upcoming ? (answers[upcoming.id] ?? null) : null);
    setTextValue(upcoming ? String(answers[upcoming.id] ?? '') : '');
    setIndex((value) => value + 1);
  };

  const previousQuestion = (): void => {
    const previous = questions[Math.max(0, index - 1)];
    setSelected(previous ? (answers[previous.id] ?? null) : null);
    setTextValue(previous ? String(answers[previous.id] ?? '') : '');
    setIndex((value) => Math.max(0, value - 1));
  };

  const restart = (): void => {
    setAnswers({});
    setSelected(null);
    setTextValue('');
    setIndex(0);
    startedAt.current = Date.now();
    setElapsed(0);
    setResumed(false);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* sans objet */
    }
    toast.info('Quiz réinitialisé : les compteurs repartent de zéro.');
  };

  /* --------------------------- Raccourcis clavier -------------------------- */
  const hotkeys = useMemo(() => {
    const map: Record<string, () => void> = {
      enter: () => nextQuestion(),
      arrowright: () => nextQuestion(),
      arrowleft: () => previousQuestion(),
      escape: () => setQuitOpen(true),
    };
    if (question?.options?.length) {
      question.options.forEach((_option, position) => {
        map[String(position + 1)] = () => record(position);
        const letter = LETTERS[position]?.toLowerCase();
        if (letter) map[letter] = () => record(position);
      });
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question, index, answers, questions]);
  useHotkeys(hotkeys, !loading && !quitOpen && !submitting);

  /* -------------------------------- Rendu --------------------------------- */
  if (loading) return <Loader label="Préparation de tes questions…" large />;

  if (loadError || !question) {
    return (
      <Card>
        <Notice tone="danger">{loadError ?? 'Ce quiz n’a pas pu être chargé.'}</Notice>
        <div className="ed-row" style={{ marginTop: 14, flexWrap: 'wrap' }}>
          <Link to={`/quiz/${topicId}`}>
            <Button variant="soft" icon={<ArrowLeft size={16} />}>
              Retour au sujet
            </Button>
          </Link>
          <Link to="/quiz">
            <Button variant="primary">Choisir un autre quiz</Button>
          </Link>
        </div>
      </Card>
    );
  }

  const answered = answers[question.id];
  const isText = question.kind === 'texte';

  return (
    <div className="page--bare">
      <div className="quiz-shell">
        {/* ------------------------------ En-tête ---------------------------- */}
        <div className="quiz-topbar">
          <IconButton label="Quitter le quiz" variant="ghost" onClick={() => setQuitOpen(true)}>
            <X size={19} />
          </IconButton>
          <div className="ed-grow">
            <div className="quiz-meta">
              <span aria-hidden="true">{session?.emoji ?? '🎯'}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {session?.topicName ?? 'Quiz en cours'}
              </span>
            </div>
            <div style={{ marginTop: 6 }}>
              <Progress value={total ? (index + (answered !== undefined ? 1 : 0)) / total : 0} thin />
            </div>
          </div>
          <span className="quiz-chip" aria-hidden="true">
            <Clock size={14} /> {formatClock(elapsed)}
          </span>
          <Badge tone="primary">
            {index + 1} / {total}
          </Badge>
        </div>

        {resumed ? (
          <Notice tone="info">
            Partie reprise : tu avais déjà répondu à {answeredCount} question{answeredCount > 1 ? 's' : ''}.{' '}
            <button type="button" className="section__link" onClick={restart}>
              Recommencer à zéro
            </button>
          </Notice>
        ) : null}

        {/* ------------------------------ Question --------------------------- */}
        <AnimatePresence mode="wait">
          <motion.div
            key={question.id}
            initial={{ opacity: 0, x: 44 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -44 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="question-card"
            style={{ borderColor: softColor(session?.color ?? '#6c5ce7', 0.28) }}
          >
            <div className="ed-row" style={{ justifyContent: 'space-between', marginBottom: 12, gap: 10, flexWrap: 'wrap' }}>
              <span className="ed-row" style={{ gap: 6, flexWrap: 'wrap' }}>
                {session?.subjectName ? <Badge tone="outline">{session.subjectName}</Badge> : null}
                <Badge tone="outline">{question.difficulty}</Badge>
                {question.skill ? <Badge tone="primary">{question.skill}</Badge> : null}
              </span>
              {!isText ? (
                <span className="ed-small ed-mute">
                  <Keyboard size={13} style={{ verticalAlign: '-2px' }} /> touches 1 à {question.options?.length ?? 0} ·
                  Entrée pour continuer
                </span>
              ) : null}
            </div>

            <div className="question-prompt">
              <QuestionText>{question.prompt}</QuestionText>
            </div>

            {isText ? (
              <div className="ed-stack" style={{ gap: 12 }}>
                <label className="sr-only" htmlFor={`answer-${question.id}`}>
                  Ta réponse
                </label>
                <input
                  id={`answer-${question.id}`}
                  className="input input--lg"
                  value={textValue || String(answered ?? '')}
                  placeholder="Écris ta réponse ici…"
                  autoComplete="off"
                  onChange={(event) => {
                    setTextValue(event.target.value);
                    record(event.target.value);
                  }}
                />
                <p className="ed-small ed-mute">
                  Ta réponse sera corrigée automatiquement à la fin du quiz, avec tolérance sur les unités et les
                  arrondis.
                </p>
              </div>
            ) : (
              <div className="answer-list" role="group" aria-label="Choisis une réponse">
                {(question.options ?? []).map((option, position) => {
                  const isSelected = (selected ?? answered) === position;
                  return (
                    <motion.button
                      key={`${question.id}-${position}`}
                      type="button"
                      className={`answer${isSelected ? ' answer--selected' : ''}`}
                      aria-pressed={isSelected}
                      onClick={() => record(position)}
                      whileTap={{ scale: 0.985 }}
                    >
                      <span className="answer__key" aria-hidden="true">
                        {isSelected ? <Check size={16} /> : LETTERS[position]}
                      </span>
                      <span className="ed-grow">
                        <QuestionText>{option}</QuestionText>
                      </span>
                    </motion.button>
                  );
                })}
              </div>
            )}

            <AnimatePresence>
              {answered !== undefined ? (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.22 }}
                  className="feedback"
                  role="status"
                >
                  <div className="feedback__title">
                    <Zap size={17} style={{ color: 'var(--ed-primary)' }} /> Réponse enregistrée
                  </div>
                  <p className="ed-small ed-soft">
                    Tu peux encore la modifier en revenant en arrière. La correction détaillée s’affiche à la fin du
                    quiz.
                  </p>
                  <div className="ed-row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
                    <Button variant="primary" onClick={nextQuestion} loading={submitting} iconRight={<ArrowRight size={17} />}>
                      {isLast ? (submitting ? 'Calcul du score…' : 'Voir mon résultat') : 'Question suivante'}
                    </Button>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </motion.div>
        </AnimatePresence>

        {/* ------------------------------- Pied ------------------------------ */}
        <div className="ed-row" style={{ justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div className="ed-row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <Button variant="ghost" size="sm" onClick={previousQuestion} disabled={index === 0} icon={<ArrowLeft size={15} />}>
              Précédente
            </Button>
            <Button variant="ghost" size="sm" onClick={restart} icon={<RotateCcw size={15} />}>
              Recommencer
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setQuitOpen(true)} icon={<Flag size={15} />}>
              Terminer
            </Button>
          </div>
          <span className="ed-small ed-mute">
            {answeredCount} / {total} répondue{answeredCount > 1 ? 's' : ''}
          </span>
        </div>

        {/* Pastilles de navigation rapide */}
        <div className="ed-row" style={{ gap: 5, flexWrap: 'wrap', justifyContent: 'center' }}>
          {questions.map((item, position) => (
            <button
              key={item.id}
              type="button"
              aria-label={`Aller à la question ${position + 1}${answers[item.id] !== undefined ? ' (répondue)' : ''}`}
              aria-current={position === index}
              onClick={() => {
                setIndex(position);
                setSelected(answers[item.id] ?? null);
                setTextValue(String(answers[item.id] ?? ''));
              }}
              style={{
                width: 26,
                height: 26,
                borderRadius: 8,
                fontSize: '0.72rem',
                fontWeight: 800,
                border: '2px solid var(--ed-border)',
                background:
                  position === index
                    ? 'var(--ed-primary)'
                    : answers[item.id] !== undefined
                      ? softColor(session?.color ?? '#6c5ce7', 0.28)
                      : 'var(--ed-surface)',
                color: position === index ? '#fff' : 'var(--ed-text-soft)',
                transition: 'all var(--ed-t-fast)',
              }}
            >
              {position + 1}
            </button>
          ))}
        </div>
      </div>

      {/* --------------------------- Modale de sortie ------------------------ */}
      <Modal
        open={quitOpen}
        onClose={() => setQuitOpen(false)}
        title="Que veux-tu faire ?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setQuitOpen(false)}>
              Continuer le quiz
            </Button>
            <Button
              variant="soft"
              icon={<Flag size={16} />}
              disabled={answeredCount < 1 || submitting}
              loading={submitting}
              onClick={() => {
                setQuitOpen(false);
                void finish(answers);
              }}
            >
              Terminer et voir mon score
            </Button>
            <Button
              variant="danger"
              icon={<X size={16} />}
              onClick={() => {
                try {
                  window.localStorage.removeItem(STORAGE_KEY);
                } catch {
                  /* sans objet */
                }
                useQuiz.getState().clear();
                navigate(`/quiz/${topicId}`, { replace: true });
              }}
            >
              Abandonner
            </Button>
          </>
        }
      >
        <p className="ed-soft">
          Tu as répondu à <strong>{answeredCount}</strong> question{answeredCount > 1 ? 's' : ''} sur {total}.
        </p>
        <p className="ed-small ed-mute" style={{ marginTop: 10 }}>
          💡 « Terminer » enregistre ton score et affiche la correction. Si tu fermes simplement la page, ta partie est
          conservée et tu pourras la reprendre plus tard.
        </p>
      </Modal>
    </div>
  );
}
