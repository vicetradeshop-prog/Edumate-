/**
 * EduMate — Carte d'une séance de révision (v2.4).
 *
 * Lisible en un coup d'œil : une ligne principale (durée · activité · notion),
 * la priorité, l'objectif en une phrase, le détail des temps dépliable.
 *
 * Règles métier affichées :
 *   - séance FUTURE → bouton Commencer VERROUILLÉ (« Disponible demain / lundi… ») ;
 *   - séance terminée manuellement → grisée + coche ;
 *   - séance terminée AUTOMATIQUEMENT (quiz lié joué après la création du
 *     contrôle) → grisée + badge « via quiz lié » avec le score ;
 *   - report / ignore / réactiver toujours possibles sur une séance jouable.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CalendarPlus, Check, ChevronDown, ChevronUp, EyeOff, Lock, Play, RotateCw, Zap } from 'lucide-react';
import { Button, IconButton } from '../ui/Button.js';
import { endpoints, type ExamPlan, type PlanSession } from '../../lib/api.js';
import { toast } from '../../lib/store.js';
import { ACTIVITY_META, PRIORITY_UI, appToday } from '../../lib/planningUi.js';

interface Props {
  session: PlanSession;
  examId: string;
  onPlan: (plan: ExamPlan) => void;
  compact?: boolean;
  index?: number;
  /** Cases de validation de la notion visée (affichées en mini-badges). */
  checks?: { quizOk: boolean; lessonOk: boolean; quizRetake?: boolean };
}

function availabilityLabel(date: string): string {
  const today = appToday();
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  if (date === today) return 'aujourd’hui';
  if (date === tomorrow) return 'demain';
  const label = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${date}T12:00:00Z`));
  return label;
}

export function SessionCard({ session, examId, onPlan, compact = false, index = 0, checks }: Props) {
  const [openSteps, setOpenSteps] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const meta = ACTIVITY_META[session.activity];
  const priority = PRIORITY_UI[session.priority];

  const today = appToday();
  const done = session.status === 'done';
  const skipped = session.status === 'skipped';
  const postponed = session.status === 'postponed';
  const locked = !done && !skipped && session.date > today;

  const setStatus = async (status: 'done' | 'postponed' | 'skipped' | 'prevue'): Promise<void> => {
    setBusy(status);
    try {
      const response = await endpoints.planningSessionStatus(examId, session.id, { status });
      onPlan(response.plan);
      if (status === 'done') toast.success('Séance terminée, bravo ! Le planning s’est adapté ✨');
      if (status === 'postponed') toast.info('Séance reportée à demain — le planning s’est réorganisé.');
      if (status === 'skipped') toast.info('Séance ignorée pour cette fois.');
      if (status === 'prevue') toast.info('Séance remise au programme.');
    } catch (error) {
      toast.fromError(error, 'Action impossible pour le moment.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: skipped ? 0.5 : 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.24), ease: [0.22, 1, 0.36, 1] }}
      className={`plan-session${done ? ' plan-session--done' : ''}${skipped ? ' plan-session--skipped' : ''}${locked ? ' plan-session--locked' : ''}`}
      style={{ ['--session-color' as string]: meta.color }}
    >
      <span className="plan-session__rail" aria-hidden="true" />

      {/* Ligne principale : durée · activité · notion · priorité */}
      <div className="plan-session__head">
        <span className="plan-session__duration" title={`${session.durationMin} minutes`}>
          {session.durationMin}
          <small>min</small>
        </span>
        <span className="plan-session__emoji" style={{ background: `${session.color}1f` }} aria-hidden="true">
          {session.emoji}
        </span>
        <div className="plan-session__titles">
          <strong className={done ? 'plan-strike' : undefined}>{session.topicName || 'Séance'}</strong>
          <span className="plan-session__meta">
            <span className="plan-session__activity" style={{ color: meta.color }}>
              <meta.icon size={12} /> {meta.label}
            </span>
            {session.questionCount ? ` · ${session.questionCount} questions` : ''}
            {session.exerciseCount ? ` · ${session.exerciseCount} exercices` : ''}
            {postponed ? ` · reportée ×${session.postponedTimes}` : ''}
            {checks ? (
              <span className="plan-mini-checks" title="Validation de la notion : quiz ≥ 80 % et leçon terminée">
                <span className={checks.quizOk ? 'is-on' : ''} aria-label={checks.quizOk ? 'quiz validé' : 'quiz à valider'}>
                  Q{checks.quizOk ? '✓' : '○'}
                </span>
                <span className={checks.lessonOk ? 'is-on' : ''} aria-label={checks.lessonOk ? 'leçon validée' : 'leçon à faire'}>
                  L{checks.lessonOk ? '✓' : '○'}
                </span>
                {checks.quizRetake && !done ? <span className="is-retake">quiz à repasser</span> : null}
              </span>
            ) : null}
          </span>
        </div>
        <span className="plan-priority" style={{ background: priority.soft, color: priority.color }} title={`Priorité : ${priority.label}`}>
          {priority.dot} <span className="plan-priority__label">{priority.label}</span>
        </span>
      </div>

      <p className="plan-session__objective">{session.objective}</p>

      <span className="plan-cal-chip" title="Cette séance apparaît aussi dans ton calendrier, à la même date : c'est la même séance, pas une tâche en plus.">
        📅 Aussi dans ton calendrier
      </span>

      {session.reminders?.length ? (
        <div className="plan-reminders">
          {session.reminders.slice(0, 3).map((reminder, reminderIndex) => (
            <motion.span
              key={reminderIndex}
              className="plan-reminder"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.15 + reminderIndex * 0.08 }}
            >
              {reminder}
            </motion.span>
          ))}
        </div>
      ) : null}

      {!compact && session.steps.length ? (
        <>
          <button type="button" className="plan-session__steps-toggle" onClick={() => setOpenSteps((value) => !value)} aria-expanded={openSteps}>
            {openSteps ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            Le déroulé ({session.steps.length} étapes)
          </button>
          {openSteps ? (
            <motion.ul className="plan-steps" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} transition={{ duration: 0.25 }}>
              {session.steps.map((step, stepIndex) => (
                <motion.li key={stepIndex} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: stepIndex * 0.06 }}>
                  <span className="plan-steps__min">{step.min} min</span>
                  {step.label}
                </motion.li>
              ))}
            </motion.ul>
          ) : null}
        </>
      ) : null}

      {/* Statut / actions */}
      <div className="plan-session__actions">
        {done ? (
          <motion.span className="plan-done-tag" initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 16 }}>
            <Check size={14} />
            {session.autoDone ? (
              <>
                Terminée automatiquement{typeof session.autoScore === 'number' ? ` · ${session.autoScore} %` : ''}
                <span className="plan-done-tag__via">
                  <Zap size={11} /> quiz lié
                </span>
              </>
            ) : (
              'Séance terminée'
            )}
          </motion.span>
        ) : locked ? (
          <span className="plan-locked-tag" title={`Disponible ${availabilityLabel(session.date)}`}>
            <Lock size={13} /> Disponible {availabilityLabel(session.date)}
          </span>
        ) : (
          <Link to={session.startPath} className="plan-session__start">
            <Button size="sm" variant="primary" icon={<Play size={14} />}>
              Commencer la séance
            </Button>
          </Link>
        )}

        <div className="ed-row" style={{ gap: 4, marginLeft: 'auto' }}>
          {!done && !locked ? (
            <IconButton label="Marquer comme terminée" size="sm" variant="ghost" disabled={busy !== null} onClick={() => void setStatus('done')}>
              <Check size={16} style={{ color: 'var(--ed-success)' }} />
            </IconButton>
          ) : null}
          {!done && !locked && session.status !== 'postponed' ? (
            <IconButton label="Reporter à demain" size="sm" variant="ghost" disabled={busy !== null} onClick={() => void setStatus('postponed')}>
              <CalendarPlus size={16} />
            </IconButton>
          ) : null}
          {session.status === 'postponed' && !done ? (
            <IconButton label="Annuler le report" size="sm" variant="ghost" disabled={busy !== null} onClick={() => void setStatus('prevue')}>
              <RotateCw size={16} />
            </IconButton>
          ) : null}
          {!skipped ? (
            <IconButton label="Ignorer cette séance" size="sm" variant="ghost" disabled={busy !== null} onClick={() => void setStatus('skipped')}>
              <EyeOff size={16} />
            </IconButton>
          ) : (
            <IconButton label="Réactiver cette séance" size="sm" variant="ghost" disabled={busy !== null} onClick={() => void setStatus('prevue')}>
              <RotateCw size={16} />
            </IconButton>
          )}
        </div>
      </div>
    </motion.div>
  );
}
