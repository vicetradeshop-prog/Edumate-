/**
 * EduMate — Lecteur d'étapes interactif (« mode leçon »).
 *
 * Le cœur ludique des révisions : une machine à étapes animée, partagée par
 * les leçons (`/lecons/:topicId`) et les révisions de quiz
 * (`/quiz/:topicId/revision`). Chaque nature d'étape a son propre rendu et
 * ses propres micro-animations :
 *
 *   mission   → accueil de la quête, objectifs qui apparaissent un à un
 *   concept   → méthode pas à pas (+ bouton ✨ IA si disponible)
 *   exemple   → exemple guidé dont la solution se déroule ligne par ligne
 *   exercice  → question interactive, correction immédiate, score et série
 *   piege     → carte d'avertissement (le piège classique)
 *   recap     → points clés qui rebondissent + astuce finale
 *
 * Principes :
 *  - une étape inconnue est ignorée (jamais de crash) ;
 *  - « animations réduites » (préférence système) désactive confettis,
 *    rebonds et défilements ;
 *  - tout le feedback passe par de vraies balises button et des zones
 *    aria-live : jouable au clavier (Entrée, touches 1-6) et lisible à
 *    l'écran.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, CheckCircle2, Eye, Lightbulb, RotateCcw, Sparkles, XCircle } from 'lucide-react';
import { Button } from '../ui/Button.js';
import { Badge, Progress, Stars } from '../ui/Badge.js';
import { QuestionText } from '../ui/Feedback.js';
import { Confetti } from '../ui/Confetti.js';
import { checkLessonAnswer } from '../../lib/lessonSteps.js';
import { useCountUp, useHotkeys, usePrefersReducedMotion } from '../../lib/hooks.js';
import type { LessonExercise, LessonStep } from '../../../shared/types.js';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

export interface StepPlayerMeta {
  topicName: string;
  emoji: string;
  color: string;
  subjectName?: string;
}

export interface StepPlayerProps {
  steps: LessonStep[];
  meta: StepPlayerMeta;
  /** « lesson » ou « revision » : change quelques libellés. */
  mode?: 'lesson' | 'revision';
  /** Lien de sortie (coin haut gauche). */
  exitTo?: string;
  exitLabel?: string;
  /** Boutons supplémentaires de l'écran final. */
  finishActions?: React.ReactNode;
  /**
   * Identifiant de partie : quand il change, la machine repart de zéro.
   * (Le contenu des étapes peut être remplacé SANS réinitialiser — par exemple
   * après un enrichissement IA — tant que cet identifiant ne bouge pas.)
   */
  playthroughId?: string;
  /** Appel du bouton ✨ « améliorer avec l'IA » (étapes concept). */
  onAi?: () => void;
  aiLoading?: boolean;
  /**
   * true : le bouton « Rejouer » de l'écran final devient l'action PRINCIPALE
   * (leçon non validée à rejouer) — un seul bouton de rejou, jamais deux.
   */
  replayEmphasis?: boolean;
  /** Appelé UNE fois par partie quand l'écran final s'affiche. */
  onFinish?: (stats: { score: number; exerciseCount: number; durationSec: number }) => void;
  /** Contenu additionnel de l'écran final (bannière de déblocage de fiche…). */
  finishExtra?: React.ReactNode;
}

interface AnswerState {
  value: string | number;
  correct: boolean;
}

/* ------------------------------------------------------------------ */
/*  Étape : mission                                                    */
/* ------------------------------------------------------------------ */

function MissionStep({ step, onNext, reduced }: { step: Extract<LessonStep, { kind: 'mission' }>; onNext: () => void; reduced: boolean }) {
  return (
    <div className="lp-mission">
      <span className={`lp-mascot${reduced ? '' : ' lp-mascot--float'}`} aria-hidden="true">
        {step.emoji}
      </span>
      <h1 className="lp-mission__title">{step.title}</h1>
      <motion.p
        className="lp-mission__intro"
        initial={reduced ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1 }}
      >
        {step.intro}
      </motion.p>
      <ul className="lp-goals" aria-label="Objectifs de la leçon">
        {step.goals.map((goal, index) => (
          <motion.li
            key={goal}
            className="lp-goals__item"
            initial={reduced ? false : { opacity: 0, x: -14 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: 0.25 + index * 0.14 }}
          >
            <span className="lp-goals__check" aria-hidden="true">
              🎯
            </span>
            {goal}
          </motion.li>
        ))}
      </ul>
      <div className="lp-cta">
        <Button variant="primary" size="lg" iconRight={<ArrowRight size={18} />} onClick={onNext}>
          C’est parti !
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Étape : concept (méthode pas à pas)                                */
/* ------------------------------------------------------------------ */

function ConceptStep({
  step,
  onNext,
  reduced,
  onAi,
  aiLoading,
}: {
  step: Extract<LessonStep, { kind: 'concept' }>;
  onNext: () => void;
  reduced: boolean;
  onAi?: () => void;
  aiLoading?: boolean;
}) {
  return (
    <div className="lp-concept">
      <div className="lp-step-head">
        <span className="lp-step-head__emoji" aria-hidden="true">
          {step.emoji}
        </span>
        <h2>{step.title}</h2>
      </div>
      <ol className="lp-points">
        {step.points.map((point, index) => (
          <motion.li
            key={`${point.slice(0, 24)}-${index}`}
            className="lp-points__item"
            initial={reduced ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, delay: 0.15 + index * 0.22 }}
          >
            <span className="lp-points__index" aria-hidden="true">
              {index + 1}
            </span>
            <span>{point}</span>
          </motion.li>
        ))}
      </ol>
      {step.ai && onAi ? (
        <div className="lp-ai">
          <Button variant="soft" size="sm" icon={<Sparkles size={15} />} loading={aiLoading} onClick={onAi}>
            Version sur mesure avec l’IA
          </Button>
          <span className="ed-small ed-mute">Réécrit cette méthode pour ton sujet précis.</span>
        </div>
      ) : null}
      <div className="lp-cta">
        <Button variant="primary" size="lg" iconRight={<ArrowRight size={18} />} onClick={onNext}>
          J’ai compris
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Étape : exemple guidé (solution pas à pas)                         */
/* ------------------------------------------------------------------ */

function ExempleStep({ step, onNext, reduced }: { step: Extract<LessonStep, { kind: 'exemple' }>; onNext: () => void; reduced: boolean }) {
  const [phase, setPhase] = useState<'cache' | 'progressif' | 'complet'>('cache');
  const lineCount = step.solution.length;
  const lineDelay = (index: number): number => (phase === 'complet' || reduced ? 0 : 0.1 + index * 0.45);

  return (
    <div className="lp-exemple">
      <div className="lp-step-head">
        <span className="lp-step-head__emoji" aria-hidden="true">
          {step.emoji}
        </span>
        <h2>{step.title}</h2>
      </div>

      <div className="lp-card lp-card--prompt">
        <QuestionText>{step.prompt}</QuestionText>
      </div>

      {phase === 'cache' ? (
        <div className="lp-cta lp-cta--inline">
          <Button variant="primary" size="lg" icon={<Eye size={18} />} onClick={() => setPhase('progressif')}>
            Montre-moi la solution
          </Button>
        </div>
      ) : (
        <>
          <ol className="lp-solution" aria-label="Solution pas à pas">
            {step.solution.map((line, index) => (
              <motion.li
                key={`${index}-${line.slice(0, 20)}`}
                className="lp-solution__line"
                initial={reduced ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: lineDelay(index) }}
              >
                <span className="lp-solution__index" aria-hidden="true">
                  {index + 1}
                </span>
                <span className="ed-grow">
                  <QuestionText>{line}</QuestionText>
                </span>
              </motion.li>
            ))}
          </ol>

          <motion.div
            className="lp-answer"
            initial={reduced ? false : { opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.35, delay: lineDelay(lineCount - 1) + 0.35, type: reduced ? undefined : 'spring', stiffness: 260, damping: 18 }}
          >
            <span className="lp-answer__label">Réponse</span>
            <span className="lp-answer__value">
              <QuestionText>{step.answerLabel}</QuestionText>
            </span>
          </motion.div>

          {phase === 'progressif' && !reduced ? (
            <div className="lp-cta lp-cta--inline">
              <Button variant="ghost" size="sm" onClick={() => setPhase('complet')}>
                Tout afficher d’un coup
              </Button>
            </div>
          ) : null}
        </>
      )}

      <div className="lp-cta">
        <Button variant="primary" size="lg" iconRight={<ArrowRight size={18} />} onClick={onNext}>
          Continuer
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Étape : exercice interactif                                        */
/* ------------------------------------------------------------------ */

function ExerciceStep({
  step,
  onNext,
  reduced,
  answer,
  onAnswer,
}: {
  step: Extract<LessonStep, { kind: 'exercice' }>;
  onNext: () => void;
  reduced: boolean;
  answer: AnswerState | null;
  onAnswer: (value: string | number, correct: boolean) => void;
}) {
  const question: LessonExercise = step.question;
  const [textValue, setTextValue] = useState('');
  const answered = answer !== null;
  const isText = question.kind === 'texte';

  const submitText = (): void => {
    if (answered) return;
    const value = textValue.trim();
    if (!value) return;
    onAnswer(value, checkLessonAnswer(question, value));
  };

  const pick = (index: number): void => {
    if (answered) return;
    onAnswer(index, checkLessonAnswer(question, index));
  };

  const optionClass = (index: number): string => {
    if (!answered) return 'lp-option';
    const isGiven = Number(answer?.value) === index;
    const isRight = question.answer === index;
    if (isRight) return 'lp-option is-correct';
    if (isGiven) return 'lp-option is-wrong';
    return 'lp-option is-dim';
  };

  return (
    <div className="lp-exercice">
      <div className="lp-step-head">
        <span className="lp-step-head__emoji" aria-hidden="true">
          {step.emoji}
        </span>
        <h2>{step.title}</h2>
        {question.skill ? <Badge tone="outline">{question.skill}</Badge> : null}
      </div>

      <div className="lp-card lp-card--prompt">
        <QuestionText>{question.prompt}</QuestionText>
      </div>

      {isText ? (
        <div className="lp-text">
          <input
            className="input"
            type="text"
            value={answered ? String(answer?.value ?? '') : textValue}
            disabled={answered}
            placeholder="Écris ta réponse…"
            aria-label="Ta réponse"
            maxLength={200}
            onChange={(event) => setTextValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                submitText();
              }
            }}
          />
          {!answered ? (
            <Button variant="primary" onClick={submitText} disabled={!textValue.trim()}>
              Valider
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="lp-options" role="group" aria-label="Propositions">
          {question.options.map((option, index) => (
            <button key={`${index}-${option.slice(0, 24)}`} type="button" className={optionClass(index)} disabled={answered} onClick={() => pick(index)}>
              <span className="lp-option__letter" aria-hidden="true">
                {LETTERS[index] ?? index + 1}
              </span>
              <span className="ed-grow" style={{ textAlign: 'left' }}>
                <QuestionText>{option}</QuestionText>
              </span>
              {answered && question.answer === index ? (
                <CheckCircle2 size={18} className="lp-option__mark lp-option__mark--ok" aria-hidden="true" />
              ) : null}
              {answered && Number(answer?.value) === index && question.answer !== index ? (
                <XCircle size={18} className="lp-option__mark lp-option__mark--ko" aria-hidden="true" />
              ) : null}
            </button>
          ))}
        </div>
      )}

      <AnimatePresence>
        {answered ? (
          <motion.div
            key="correction"
            initial={reduced ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className={`lp-feedback ${answer?.correct ? 'is-ok' : 'is-ko'}${!reduced && !answer?.correct ? ' lp-feedback--shake' : ''}`} role="status" aria-live="polite">
              {answer?.correct ? (
                <>
                  <CheckCircle2 size={20} aria-hidden="true" /> Bravo, bonne réponse ! <span className="lp-feedback__bonus">+1 ⭐</span>
                </>
              ) : (
                <>
                  <XCircle size={20} aria-hidden="true" /> Pas tout à fait — la correction est juste dessous.
                </>
              )}
            </div>

            <div className="lp-correction">
              <div className="lp-correction__title">
                <Lightbulb size={16} aria-hidden="true" /> Correction
              </div>
              {isText && !answer?.correct ? (
                <p className="ed-small" style={{ marginTop: 0, marginBottom: 8 }}>
                  <strong>Réponse attendue :</strong> {(question.accept ?? []).join(' ou ')}
                </p>
              ) : null}
              <div className="ed-small">
                <QuestionText>{question.explanation || 'Relis l’énoncé : la réponse s’en déduit directement.'}</QuestionText>
              </div>
            </div>

            <div className="lp-cta">
              <Button variant="primary" size="lg" iconRight={<ArrowRight size={18} />} onClick={onNext}>
                Continuer
              </Button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Étape : piège classique                                            */
/* ------------------------------------------------------------------ */

function PiegeStep({ step, onNext, reduced }: { step: Extract<LessonStep, { kind: 'piege' }>; onNext: () => void; reduced: boolean }) {
  return (
    <div className="lp-piege">
      <motion.div
        className="lp-card lp-card--trap"
        initial={reduced ? false : { opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, type: reduced ? undefined : 'spring', stiffness: 220, damping: 16 }}
      >
        <span className="lp-piege__icon" aria-hidden="true">
          {step.emoji}
        </span>
        <h2>{step.title}</h2>
        <p className="lp-piege__text">{step.text}</p>
      </motion.div>
      <div className="lp-cta">
        <Button variant="primary" size="lg" iconRight={<ArrowRight size={18} />} onClick={onNext}>
          Je m’en souviendrai !
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Étape : récapitulatif                                              */
/* ------------------------------------------------------------------ */

function RecapStep({ step, onNext, reduced, finishLabel }: { step: Extract<LessonStep, { kind: 'recap' }>; onNext: () => void; reduced: boolean; finishLabel: string }) {
  return (
    <div className="lp-recap">
      <div className="lp-step-head">
        <span className="lp-step-head__emoji" aria-hidden="true">
          {step.emoji}
        </span>
        <h2>{step.title}</h2>
      </div>
      <div className="lp-chips">
        {step.chips.map((chip, index) => (
          <motion.span
            key={`${chip.slice(0, 20)}-${index}`}
            className="lp-chip"
            initial={reduced ? false : { opacity: 0, scale: 0.6, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.1 + index * 0.14, type: reduced ? undefined : 'spring', stiffness: 320, damping: 15 }}
          >
            {chip}
          </motion.span>
        ))}
      </div>
      {step.tip ? (
        <motion.div
          className="lp-tip"
          initial={reduced ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1 + step.chips.length * 0.14 + 0.2 }}
        >
          <Lightbulb size={17} aria-hidden="true" />
          <span>{step.tip}</span>
        </motion.div>
      ) : null}
      <div className="lp-cta">
        <Button variant="primary" size="lg" iconRight={<ArrowRight size={18} />} onClick={onNext}>
          {finishLabel}
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Écran final                                                        */
/* ------------------------------------------------------------------ */

function FinishScreen({
  meta,
  score,
  exerciseCount,
  bestStreak,
  stepsCount,
  reduced,
  onReplay,
  finishActions,
  finishExtra,
  replayEmphasis = false,
}: {
  meta: StepPlayerMeta;
  score: number;
  exerciseCount: number;
  bestStreak: number;
  stepsCount: number;
  reduced: boolean;
  onReplay: () => void;
  finishActions?: React.ReactNode;
  finishExtra?: React.ReactNode;
  replayEmphasis?: boolean;
}) {
  const rate = exerciseCount > 0 ? score / exerciseCount : 1;
  const animated = useCountUp(Math.round(rate * 100), 900);
  // Confettis réservés à la VRAIE validation (≥ 80 %) : plus cohérent avec
  // la bannière « leçon validée / à rejouer ».
  const celebrate = rate >= 0.8 || exerciseCount === 0;
  const verdict = rate >= 0.8 ? { emoji: '🏆', title: 'Mission accomplie !' } : rate >= 0.5 ? { emoji: '🎉', title: 'Bien joué !' } : { emoji: '💪', title: 'Beau travail !' };

  return (
    <motion.div className="lp-finish" initial={reduced ? false : { opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }}>
      <Confetti show={celebrate && !reduced} />
      <span className={`lp-mascot lp-mascot--lg${reduced ? '' : ' lp-mascot--pop'}`} aria-hidden="true">
        {verdict.emoji}
      </span>
      <h1>{verdict.title}</h1>
      <p className="ed-soft" style={{ maxWidth: '46ch', margin: '4px auto 0' }}>
        {exerciseCount > 0
          ? `Tu as réussi ${score} exercice${score > 1 ? 's' : ''} sur ${exerciseCount} dans « ${meta.topicName} ». Chaque erreur corrigée ici, c’est un point gagné au prochain quiz.`
          : `Tu as terminé le parcours « ${meta.topicName} » en ${stepsCount} étapes.`}
      </p>

      {exerciseCount > 0 ? (
        <div className="lp-finish__score">
          <span className="lp-finish__percent">{animated}%</span>
          <Stars score={score} total={exerciseCount} size={20} />
        </div>
      ) : null}

      {exerciseCount > 0 && rate < 0.8 ? (
        <p className="lp-finish__threshold" role="status">
          🔒 Validation à partir de <strong>80 %</strong> : rejoue le parcours quand tu veux, ton meilleur score est
          conservé.
        </p>
      ) : null}

      {finishExtra}

      <div className="ed-row" style={{ justifyContent: 'center', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
        {exerciseCount > 0 ? (
          <Badge tone="primary">
            ⭐ {score}/{exerciseCount} exercices
          </Badge>
        ) : null}
        {bestStreak >= 2 ? <Badge tone="warning">🔥 Série de {bestStreak}</Badge> : null}
        <Badge tone="outline">{stepsCount} étapes</Badge>
      </div>

      <div className="ed-row" style={{ justifyContent: 'center', gap: 10, marginTop: 22, flexWrap: 'wrap' }}>
        <Button variant={replayEmphasis ? 'primary' : 'soft'} icon={<RotateCcw size={17} />} onClick={onReplay}>
          {replayEmphasis ? 'Rejouer la leçon' : 'Rejouer ce parcours'}
        </Button>
        {finishActions}
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Lecteur principal                                                  */
/* ------------------------------------------------------------------ */

export function StepPlayer({ steps, meta, mode = 'lesson', exitTo, exitLabel, finishActions, playthroughId, onAi, aiLoading, onFinish, finishExtra, replayEmphasis = false }: StepPlayerProps) {
  const reduced = usePrefersReducedMotion();

  // Étapes inconnues (contenu plus récent que le client) : ignorées proprement.
  const playable = useMemo(() => steps.filter((step) => ['mission', 'concept', 'exemple', 'exercice', 'piege', 'recap'].includes(step.kind)), [steps]);
  const exerciseCount = useMemo(() => playable.filter((step) => step.kind === 'exercice').length, [playable]);

  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [finished, setFinished] = useState(false);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);

  // Nouvelle partie (rejouer, nouveau seed, autre leçon) : tout repart à zéro.
  useEffect(() => {
    setIndex(0);
    setDirection(1);
    setFinished(false);
    setAnswers({});
    setStreak(0);
    setBestStreak(0);
  }, [playthroughId]);

  // Filet de sécurité : si les étapes changent et que l'index dépasse, on revient
  // à la dernière étape valide (jamais d'écran vide).
  useEffect(() => {
    if (index > playable.length) setIndex(Math.max(0, playable.length));
  }, [playable.length, index]);

  const current = playable[Math.min(index, Math.max(0, playable.length - 1))];
  const score = useMemo(() => Object.values(answers).filter((entry) => entry.correct).length, [answers]);

  const goNext = useCallback(() => {
    setDirection(1);
    if (index + 1 >= playable.length) {
      setFinished(true);
      return;
    }
    setIndex((value) => value + 1);
  }, [index, playable.length]);

  const replay = useCallback(() => {
    setDirection(-1);
    setIndex(0);
    setFinished(false);
    setAnswers({});
    setStreak(0);
    setBestStreak(0);
  }, []);

  const recordAnswer = useCallback((stepId: string, value: string | number, correct: boolean) => {
    setAnswers((prev) => (prev[stepId] ? prev : { ...prev, [stepId]: { value, correct } }));
    // Updateurs purs : la meilleure série est déduite de `streak` dans un effet.
    setStreak((prev) => (correct ? prev + 1 : 0));
  }, []);

  useEffect(() => {
    setBestStreak((best) => (streak > best ? streak : best));
  }, [streak]);

  /* Signale la fin de partie UNE seule fois par playthrough (validation de
     leçon, fiche, statistiques…) sans se répéter si le composant se re-rend.
     La durée réelle de travail est mesurée ici : elle alimente l'objectif
     quotidien du tableau de bord. */
  const finishNotifiedRef = useRef<string | null>(null);
  const startedAtRef = useRef<number>(Date.now());
  useEffect(() => {
    startedAtRef.current = Date.now();
    finishNotifiedRef.current = null;
  }, [playthroughId]);
  /*
   * 🔴 BUG CORRIGÉ : « Rejouer ce parcours » (bouton interne) garde le même
   * playthroughId. Sans ce reset, le garde-fou ci-dessus croyait avoir déjà
   * notifié la fin et le serveur n'était JAMAIS rappelé : la bannière restait
   * bloquée sur l'essai précédent (ex. 67 % affiché après un 100 %).
   * Dès que `finished` repasse à false (rejouer), on repart pour un tour :
   * prochaine fin = nouvelle notification + nouveau chrono.
   */
  useEffect(() => {
    if (!finished) {
      finishNotifiedRef.current = null;
      startedAtRef.current = Date.now();
    }
  }, [finished]);
  useEffect(() => {
    if (!finished) return;
    const key = playthroughId ?? 'none';
    if (finishNotifiedRef.current === key) return;
    finishNotifiedRef.current = key;
    const durationSec = Math.max(5, Math.round((Date.now() - startedAtRef.current) / 1000));
    onFinish?.({ score, exerciseCount, durationSec });
  }, [finished, playthroughId, score, exerciseCount, onFinish]);

  /* Raccourcis : Entrée = action principale ; 1-6 = choix de réponse. */
  const currentExercise = current?.kind === 'exercice' ? current : null;
  const hotkeys = useMemo(() => {
    const map: Record<string, () => void> = {};
    if (finished) {
      map.enter = () => replay();
      return map;
    }
    if (!current) return map;
    if (currentExercise && !answers[currentExercise.id] && currentExercise.question.kind !== 'texte') {
      currentExercise.question.options.forEach((_option, position) => {
        const pick = (): void => recordAnswer(currentExercise.id, position, checkLessonAnswer(currentExercise.question, position));
        map[String(position + 1)] = pick;
        const letter = LETTERS[position]?.toLowerCase();
        if (letter) map[letter] = pick;
      });
    }
    const canAdvance =
      current.kind !== 'exercice' || Boolean(answers[current.id]);
    if (canAdvance) map.enter = () => goNext();
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, currentExercise, answers, finished, goNext, replay, recordAnswer]);
  useHotkeys(hotkeys, playable.length > 0);

  if (!playable.length) {
    return (
      <div className="lesson-player lp--reduced">
        <div className="lp-card">
          <p className="ed-mute">Aucune étape disponible pour ce parcours.</p>
          {exitTo ? (
            <Link to={exitTo}>
              <Button variant="soft" icon={<ArrowLeft size={16} />}>
                {exitLabel ?? 'Retour'}
              </Button>
            </Link>
          ) : null}
        </div>
      </div>
    );
  }

  const progressValue = finished ? 1 : Math.min(1, (index + (current && answers[current.id] ? 1 : 0)) / playable.length);

  return (
    <div className={`lesson-player${reduced ? ' lp--reduced' : ''}`}>
      {/* ------------------------------- En-tête --------------------------- */}
      <div className="lp-hud">
        <div className="lp-hud__row">
          {exitTo ? (
            <Link to={exitTo} className="lp-exit">
              <ArrowLeft size={16} aria-hidden="true" />
              <span>{exitLabel ?? 'Quitter'}</span>
            </Link>
          ) : (
            <span />
          )}
          <div className="lp-hud__meta">
            <span aria-hidden="true">{meta.emoji}</span>
            <span className="lp-hud__topic">{meta.topicName}</span>
          </div>
          <div className="lp-hud__stats">
            {score > 0 ? (
              <span className="lp-chip-stat" title="Exercices réussis">
                ⭐ {score}
              </span>
            ) : null}
            {streak >= 2 ? (
              <span className="lp-chip-stat lp-chip-stat--fire" title="Réussites d’affilée">
                🔥 {streak}
              </span>
            ) : null}
            {!finished ? (
              <Badge tone="outline">
                {Math.min(index + 1, playable.length)} / {playable.length}
              </Badge>
            ) : null}
          </div>
        </div>
        <Progress value={progressValue} thin color={meta.color} />
      </div>

      {/* -------------------------------- Scène ---------------------------- */}
      <div className="lp-stage">
        <AnimatePresence mode="wait" initial={false} custom={direction}>
          {finished ? (
            <motion.div
              key="finish"
              custom={direction}
              initial={reduced ? false : { opacity: 0, x: direction * 56 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              <FinishScreen
                meta={meta}
                score={score}
                exerciseCount={exerciseCount}
                bestStreak={bestStreak}
                stepsCount={playable.length}
                reduced={reduced}
                onReplay={replay}
                finishActions={finishActions}
                finishExtra={finishExtra}
                replayEmphasis={replayEmphasis}
              />
            </motion.div>
          ) : current ? (
            <motion.div
              key={current.id}
              custom={direction}
              initial={reduced ? false : { opacity: 0, x: direction * 56 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduced ? undefined : { opacity: 0, x: direction * -56 }}
              transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
              className="lp-step"
            >
              {current.kind === 'mission' ? <MissionStep step={current} onNext={goNext} reduced={reduced} /> : null}
              {current.kind === 'concept' ? <ConceptStep step={current} onNext={goNext} reduced={reduced} onAi={onAi} aiLoading={aiLoading} /> : null}
              {current.kind === 'exemple' ? <ExempleStep step={current} onNext={goNext} reduced={reduced} /> : null}
              {current.kind === 'exercice' ? (
                <ExerciceStep
                  step={current}
                  onNext={goNext}
                  reduced={reduced}
                  answer={answers[current.id] ?? null}
                  onAnswer={(value, correct) => recordAnswer(current.id, value, correct)}
                />
              ) : null}
              {current.kind === 'piege' ? <PiegeStep step={current} onNext={goNext} reduced={reduced} /> : null}
              {current.kind === 'recap' ? (
                <RecapStep step={current} onNext={goNext} reduced={reduced} finishLabel={mode === 'revision' ? 'Voir mon bilan' : 'Terminer la leçon'} />
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
