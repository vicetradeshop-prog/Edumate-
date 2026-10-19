/**
 * EduMate — Planning détaillé d'un contrôle.
 *
 * Hero animé (jours restants, anneau de préparation), priorités des notions,
 * résumé « Préparer ce contrôle », timeline jour par jour avec séances
 * animées (commencer / terminer / reporter / ignorer) et clôture du contrôle
 * (ressenti + note) pour améliorer les futures recommandations.
 */
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  CalendarDays,
  Check,
  Clock3,
  BookOpenText,
  FileText,
  Flag,
  GraduationCap,
  History,
  Layers,
  ListChecks,
  PenLine,
  Play,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react';
import { Button, IconButton } from '../components/ui/Button.js';
import { Card, CardTitle } from '../components/ui/Card.js';
import { Badge } from '../components/ui/Badge.js';
import { Empty, Loader, Notice } from '../components/ui/Feedback.js';
import { Modal } from '../components/ui/Modal.js';
import { Field, TextInput } from '../components/ui/Field.js';
import { SessionCard } from '../components/planning/SessionCard.js';
import { PrepRing } from './PlanningPage.js';
import { endpoints, type ExamFeedback, type ExamPlan } from '../lib/api.js';
import { useApi } from '../lib/data.js';
import { useCountUp, useDocumentTitle } from '../lib/hooks.js';
import { formatDayLabel } from '../lib/format.js';
import { ACTIVITY_META, PRIORITY_UI, daysLeftLabel, formatMinutes } from '../lib/planningUi.js';
import { formatRelative } from '../lib/format.js';
import { toast } from '../lib/store.js';

/** Compteur qui monte en animant (résumé « Préparer ce contrôle »). */
function AnimatedNumber({ value }: { value: number }) {
  const animated = useCountUp(value, 800);
  return <>{Math.round(animated)}</>;
}

const FEEDBACK_CHOICES: { id: ExamFeedback; label: string; emoji: string }[] = [
  { id: 'difficile', label: 'Difficile', emoji: '😖' },
  { id: 'moyen', label: 'Moyen', emoji: '😐' },
  { id: 'bien', label: 'Bien', emoji: '🙂' },
  { id: 'tresbien', label: 'Très bien', emoji: '🤩' },
];

export default function PlanningDetailPage() {
  const { examId = '' } = useParams();
  const plan = useApi(() => endpoints.planningExam(examId), { deps: [examId] });
  const [generating, setGenerating] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [feedback, setFeedback] = useState<ExamFeedback | null>(null);
  const [grade, setGrade] = useState('');
  const [busyClose, setBusyClose] = useState(false);
  const [unseenJournal, setUnseenJournal] = useState(0);

  const data: ExamPlan | null = plan.data?.plan ?? null;
  useDocumentTitle(data ? `Planning : ${data.exam.title}` : 'Planning');

  /* Entrées du journal non vues depuis la dernière visite (localStorage). */
  useEffect(() => {
    if (!data) return;
    const key = `edumate:plan-journal-seen:${data.exam.id}`;
    const seenId = window.localStorage.getItem(key) ?? '';
    const entries = data.exam.journal ?? [];
    setUnseenJournal(seenId ? entries.findIndex((entry) => entry.id === seenId) : entries.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.exam.id, data?.exam.journal?.length]);

  const markJournalSeen = (): void => {
    if (!data) return;
    const first = data.exam.journal?.[0];
    if (first) window.localStorage.setItem(`edumate:plan-journal-seen:${data.exam.id}`, first.id);
    setUnseenJournal(0);
    document.getElementById('plan-journal')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  /* « Que dois-je faire ensuite ? » : toujours une réponse claire. */
  const nextAction = (() => {
    if (!data) return null;
    const today = data.days.find((day) => day.isToday);
    const todaySession = today?.sessions.find((session) => session.status === 'prevue' || session.status === 'postponed');
    if (todaySession) {
      return {
        text: `Aujourd'hui : ${todaySession.topicName || ACTIVITY_META[todaySession.activity].label} — ${todaySession.durationMin} min.`,
        cta: { label: 'Commencer ma séance', path: todaySession.startPath },
      };
    }
    const future = data.days.find((day) => day.sessions.some((session) => session.status === 'prevue' || session.status === 'postponed'));
    if (future) {
      const session = future.sessions.find((entry) => entry.status === 'prevue' || entry.status === 'postponed');
      return {
        text: `Prochaine séance ${future.label.toLowerCase()} : ${session?.topicName || 'révision'} — ${session?.durationMin ?? 0} min. Rien à faire aujourd'hui.`,
        cta: { label: `Voir ${future.label.toLowerCase()}`, anchor: `plan-day-${future.date}` },
      };
    }
    if (data.past) return { text: 'Contrôle passé : clôture-le pour libérer ton agenda.', cta: null };
    return { text: 'Toutes les séances sont faites : tu es prêt·e. Repose-toi, le cerveau consolide ! 🧠', cta: null };
  })();

  const generate = async (): Promise<void> => {
    setGenerating(true);
    try {
      const response = await endpoints.planningGenerate(examId);
      plan.reload();
      toast.success('Planning généré : bonne révision ! 💪');
      void response;
    } catch (error) {
      toast.fromError(error, 'Génération impossible.');
    } finally {
      setGenerating(false);
    }
  };

  const closeExam = async (): Promise<void> => {
    setBusyClose(true);
    try {
      const payload: Record<string, unknown> = { status: 'termine' };
      if (feedback) payload.feedback = feedback;
      const gradeValue = Number(grade.replace(',', '.'));
      if (grade && Number.isFinite(gradeValue)) {
        payload.grade = gradeValue;
        payload.gradeMax = 20;
      }
      await endpoints.planningUpdateExam(examId, payload);
      setCloseOpen(false);
      toast.success('Contrôle marqué comme terminé. Merci pour ton retour ! 🌟');
      void plan.reload();
    } catch (error) {
      toast.fromError(error, 'Impossible de clôturer ce contrôle.');
    } finally {
      setBusyClose(false);
    }
  };

  const removeExam = async (): Promise<void> => {
    try {
      await endpoints.planningDeleteExam(examId);
      setDeleteOpen(false);
      toast.success('Contrôle supprimé.');
      window.location.assign('/planning');
    } catch (error) {
      toast.fromError(error, 'Suppression impossible.');
    }
  };

  if (plan.loading && !plan.data) return <Loader label="Chargement du planning…" large />;

  if (plan.error || !data) {
    return (
      <div className="ed-stack" style={{ gap: 14, maxWidth: 720, margin: '0 auto' }}>
        <Notice tone="danger">{plan.error ?? 'Planning introuvable.'}</Notice>
        <Link to="/planning">
          <Button variant="soft" icon={<ArrowLeft size={15} />}>
            Retour au planning
          </Button>
        </Link>
      </div>
    );
  }

  const { exam } = data;
  const terminated = exam.status === 'termine';

  return (
    <div className="ed-stack" style={{ gap: 18 }}>
      <div className="ed-row" style={{ justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <Link to="/planning" className="section__link" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <ArrowLeft size={14} /> Mon planning
        </Link>
        <div className="ed-row" style={{ gap: 8 }}>
          {!terminated ? (
            <Button variant="soft" size="sm" icon={<Flag size={15} />} onClick={() => setCloseOpen(true)}>
              Contrôle passé ?
            </Button>
          ) : (
            <Button
              variant="soft"
              size="sm"
              icon={<Check size={15} />}
              onClick={() => {
                void endpoints.planningUpdateExam(examId, { status: 'actif' }).then(() => plan.reload());
              }}
            >
              Rouvrir le contrôle
            </Button>
          )}
          <IconButton label="Supprimer ce contrôle" variant="ghost" size="sm" onClick={() => setDeleteOpen(true)}>
            <Trash2 size={16} />
          </IconButton>
        </div>
      </div>

      {/* --------------------------------- Hero ----------------------------- */}
      <motion.header
        className="plan-hero"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="plan-hero__main">
          <span className="page-head__eyebrow">
            <CalendarDays size={13} style={{ verticalAlign: '-2px' }} /> Contrôle à venir
          </span>
          <h1>{exam.title}</h1>
          <div className="ed-row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            {exam.themeName ? <Badge tone="outline">🎯 {exam.themeName}</Badge> : null}
            <Badge tone="primary">{formatDayLabel(exam.date)}</Badge>
            {exam.time ? <Badge tone="outline">{exam.time}</Badge> : null}
            <Badge tone={terminated ? 'success' : data.daysLeft <= 2 ? 'danger' : 'warning'}>
              {terminated ? 'Terminé' : daysLeftLabel(data.daysLeft)}
            </Badge>
            <Badge tone="outline">
              <Clock3 size={12} style={{ verticalAlign: '-2px' }} /> {exam.dailyMinutes} min/jour
            </Badge>
          </div>
        </div>
        <div className="plan-hero__ring">
          <PrepRing percent={data.prepPercent} size={92} color={terminated ? 'var(--ed-success)' : 'var(--ed-primary)'} />
          <span className="ed-small ed-mute">préparé</span>
        </div>
      </motion.header>

      <motion.div
        className="plan-howto"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1 }}
      >
        <span className="plan-howto__step">
          <span className="plan-howto__num" aria-hidden="true">1</span>
          Fais la <strong>leçon</strong> : ≥ 80 % = case cochée.
        </span>
        <span className="plan-howto__arrow" aria-hidden="true">→</span>
        <span className="plan-howto__step">
          <span className="plan-howto__num" aria-hidden="true">2</span>
          Fais le <strong>quiz</strong> : ≥ 80 % = case cochée.
        </span>
        <span className="plan-howto__arrow" aria-hidden="true">→</span>
        <span className="plan-howto__step">
          <span className="plan-howto__num" aria-hidden="true">3</span>
          Les deux cases = <strong>notion validée</strong> ✔ et le planning s'allège.
        </span>
      </motion.div>

      {unseenJournal > 0 ? (
        <motion.button
          type="button"
          className="plan-adjust-banner"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          onClick={markJournalSeen}
        >
          <Sparkles size={16} aria-hidden="true" />
          <span>
            <strong>Ton planning a été ajusté</strong> ({unseenJournal} événement{unseenJournal > 1 ? 's' : ''} depuis ta
            dernière visite) — après ton dernier quiz ou ta dernière action. Voir pourquoi.
          </span>
        </motion.button>
      ) : null}

      {nextAction ? (
        <motion.div
          className="plan-nextaction"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.05 }}
        >
          <span className="plan-nextaction__icon" aria-hidden="true">
            <Play size={15} />
          </span>
          <span className="plan-nextaction__text">{nextAction.text}</span>
          {nextAction.cta && 'path' in nextAction.cta && nextAction.cta.path ? (
            <Link to={nextAction.cta.path}>
              <Button size="sm" variant="primary" icon={<Play size={14} />}>
                {nextAction.cta.label}
              </Button>
            </Link>
          ) : null}
          {nextAction.cta && 'anchor' in nextAction.cta && nextAction.cta.anchor ? (
            <Button
              size="sm"
              variant="soft"
              icon={<ArrowLeft size={14} style={{ transform: 'rotate(90deg)' }} />}
              onClick={() => document.getElementById(nextAction.cta?.anchor ?? '')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            >
              {nextAction.cta.label}
            </Button>
          ) : null}
        </motion.div>
      ) : null}

      {data.past && !terminated ? (
        <Notice tone="warning">
          La date de ce contrôle est passée. Marque-le comme terminé (bouton « Contrôle passé ? ») pour clôturer
          proprement le planning et libérer ton agenda.
        </Notice>
      ) : null}

      {terminated ? (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="plan-terminated">
          <Check size={16} /> Contrôle terminé
          {exam.feedback ? ` · ressenti : ${FEEDBACK_CHOICES.find((entry) => entry.id === exam.feedback)?.label.toLowerCase()}` : ''}
          {exam.grade !== undefined ? ` · note : ${exam.grade}${exam.gradeMax ? `/${exam.gradeMax}` : ''}` : ''}. Ces
          données affineront tes prochains plannings.
        </motion.div>
      ) : null}

      {/* --------------------- Résumé « Préparer ce contrôle » -------------- */}
      <Card className="plan-summary">
        <CardTitle icon={<Wand2 size={17} />}>Préparer ce contrôle</CardTitle>
        <div className="plan-summary__grid">
          {[
            { icon: <Layers size={16} />, value: String(data.notions.length), label: 'notions', num: data.notions.length, suffix: '' },
            { icon: <ListChecks size={16} />, value: String(data.totalQuestions), label: 'questions prévues', num: data.totalQuestions, suffix: '' },
            { icon: <PenLine size={16} />, value: String(data.totalExercises), label: 'exercices', num: data.totalExercises, suffix: '' },
            { icon: <FileText size={16} />, value: String(data.quizBlancCount), label: 'quiz blanc', num: data.quizBlancCount, suffix: '' },
            { icon: <Clock3 size={16} />, value: formatMinutes(data.totalMinutes), label: `sur ${data.days.length} jour${data.days.length > 1 ? 's' : ''}`, num: -1, suffix: '' },
          ].map((item, index) => (
            <motion.div
              key={item.label}
              className="plan-summary__cell"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + index * 0.07, duration: 0.3 }}
            >
              <span className="plan-summary__icon" aria-hidden="true">
                {item.icon}
              </span>
              <strong>{item.num >= 0 ? <AnimatedNumber value={item.num} /> : item.value}</strong>
              <small>{item.label}</small>
            </motion.div>
          ))}
        </div>
        <p className="ed-small ed-mute plan-summary__note">
          🔗 Chaque séance est branchée sur les quiz et leçons du thème : dès que tu joues le quiz lié, la séance se
          grise toute seule en « terminée ». Les séances futures restent verrouillées jusqu'à leur jour.
        </p>
        {!exam.planReady && !terminated ? (
          <div className="plan-summary__cta">
            <Button variant="primary" size="lg" icon={<Wand2 size={18} />} loading={generating} onClick={() => void generate()}>
              Générer mon planning
            </Button>
            <p className="ed-small ed-mute">Une seule fois : ensuite, il vit et s'adapte tout seul.</p>
          </div>
        ) : null}
      </Card>

      {/* ------------------- Suivi des notions (2 cases) ------------------- */}
      {data.notions.length ? (
        <section>
          <div className="section__head" style={{ marginBottom: 10 }}>
            <h2 style={{ fontFamily: 'var(--ed-font-display)', fontSize: '1.15rem' }}>
              <Layers size={17} style={{ verticalAlign: '-3px', marginRight: 7 }} />
              Tes notions, une case à la fois
            </h2>
          </div>
          <div className="plan-notion-grid">
            {data.notions.map((notion, index) => {
              const ui = PRIORITY_UI[notion.level];
              return (
                <motion.div
                  key={notion.topicId}
                  className={`plan-notion-card${notion.validated ? ' plan-notion-card--done' : ''}`}
                  style={{ ['--notion-color' as string]: notion.color }}
                  initial={{ opacity: 0, y: 16, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.32, delay: 0.08 + index * 0.07, ease: [0.22, 1, 0.36, 1] }}
                  whileHover={{ y: -4 }}
                >
                  <div className="plan-notion-card__head">
                    <span className="plan-notion-card__emoji" aria-hidden="true">
                      {notion.emoji}
                    </span>
                    <strong>{notion.name}</strong>
                    <motion.span
                      className="plan-priority"
                      style={{ background: ui.soft, color: ui.color, marginLeft: 'auto' }}
                      initial={{ scale: 0.7, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.25 + index * 0.07, type: 'spring', stiffness: 320, damping: 16 }}
                    >
                      {ui.dot} <span className="plan-priority__label">{ui.label}</span>
                    </motion.span>
                  </div>

                  <div className="plan-checks" role="list" aria-label="Validations de la notion">
                    <motion.span
                      className={`plan-check${notion.quizOk ? ' plan-check--on' : ''}`}
                      role="listitem"
                      initial={false}
                      animate={notion.quizOk ? { scale: [1, 1.12, 1] } : { scale: 1 }}
                      transition={{ duration: 0.4 }}
                    >
                      <span className="plan-check__box" aria-hidden="true">
                        {notion.quizOk ? <Check size={12} /> : null}
                      </span>
                      Quiz ≥ 80 %
                      <em>{notion.bestScore === null ? 'jamais joué' : `${Math.round(notion.bestScore * 100)} %`}</em>
                    </motion.span>
                    <motion.span
                      className={`plan-check${notion.lessonOk ? ' plan-check--on' : ''}`}
                      role="listitem"
                      initial={false}
                      animate={notion.lessonOk ? { scale: [1, 1.12, 1] } : { scale: 1 }}
                      transition={{ duration: 0.4 }}
                    >
                      <span className="plan-check__box" aria-hidden="true">
                        {notion.lessonOk ? <Check size={12} /> : null}
                      </span>
                      Leçon validée
                      <em>{notion.lessonOk ? 'terminée ✔' : 'à faire'}</em>
                    </motion.span>
                  </div>

                  <span className="plan-bar" aria-hidden="true">
                    <motion.span
                      className="plan-bar__fill"
                      style={{ background: notion.validated ? 'var(--ed-success)' : notion.color }}
                      initial={{ width: 0 }}
                      animate={{ width: `${notion.validated ? 100 : Math.round((notion.rate ?? 0) * 100)}%` }}
                      transition={{ duration: 0.8, delay: 0.3 + index * 0.07, ease: [0.22, 1, 0.36, 1] }}
                    />
                  </span>
                  <p className="plan-notion-card__why">{notion.reasons.join(' · ')}</p>
                </motion.div>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* ------------------------------ Timeline ---------------------------- */}
      {exam.planReady || terminated ? (
        <div className="ed-stack" style={{ gap: 14 }}>
          {data.days.map((day, dayIndex) => (
            <motion.section
              key={day.date}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.32, delay: Math.min(dayIndex * 0.06, 0.4) }}
            >
              <Card id={`plan-day-${day.date}`} className={`plan-day${day.isExamDay ? ' plan-day--exam' : ''}${day.isToday ? ' plan-day--today' : ''}`}>
                <div className="plan-day__head">
                  <strong>
                    {day.label}
                    {day.isToday ? <span className="plan-day__today-dot" aria-hidden="true" /> : null}
                  </strong>
                  <span className="ed-row" style={{ gap: 8 }}>
                    {day.sessions.length ? (
                      <span className="plan-day__progress">
                        {day.sessions.filter((session) => session.status === 'done').length}/{day.sessions.length} séances
                      </span>
                    ) : null}
                    {day.isExamDay ? <Badge tone="danger">Jour du contrôle</Badge> : null}
                    {!day.isExamDay && day.sessions.some((session) => session.activity === 'quizblanc') ? (
                      <Badge tone="warning">Quiz blanc</Badge>
                    ) : null}
                    <span className="ed-small ed-mute">{day.minutes} min</span>
                  </span>
                </div>
                {day.sessions.length ? (
                  <div className="ed-stack" style={{ gap: 10 }}>
                    {day.sessions.map((session, sessionIndex) => (
                      <SessionCard
                        key={session.id}
                        session={session}
                        examId={exam.id}
                        index={sessionIndex}
                        checks={(() => {
                          const notion = data.notions.find((entry) => entry.topicId === session.topicId);
                          if (!notion) return undefined;
                          return {
                            quizOk: notion.quizOk,
                            lessonOk: notion.lessonOk,
                            quizRetake: !notion.quizOk && notion.attempts > 0,
                          };
                        })()}
                        onPlan={(next) => {
                          // Remplacement optimiste du plan : recalcul serveur.
                          plan.reload();
                          void next;
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="ed-small ed-mute">Journée libre — repose ton cerveau, il consolide tout seul 🧠</p>
                )}
              </Card>
            </motion.section>
          ))}
        </div>
      ) : (
        <Card>
          <Empty
            emoji="✨"
            title="Planning pas encore généré"
            description="Clique sur « Générer mon planning » ci-dessus : EduMate répartit tes révisions jusqu'au jour J."
          />
        </Card>
      )}

      {/* --------------------- Journal des ajustements --------------------- */}
      {(data.exam.journal ?? []).length ? (
        <Card id="plan-journal" className="plan-journal">
          <CardTitle icon={<History size={17} />}>Pourquoi mon planning a changé</CardTitle>
          <p className="ed-small ed-mute" style={{ marginTop: 2 }}>
            Chaque quiz, leçon ou action qui modifie ton programme est expliqué ici, du plus récent au plus ancien.
            Tes séances terminées ne sont jamais supprimées ni déplacées.
          </p>
          <ul className="plan-journal__list">
            {(data.exam.journal ?? []).slice(0, 12).map((entry, index) => (
              <motion.li
                key={entry.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.28, delay: index * 0.05 }}
              >
                <span className={`plan-journal__icon plan-journal__icon--${entry.kind}`} aria-hidden="true">
                  {entry.kind === 'quiz' ? <GraduationCap size={13} /> : entry.kind === 'lesson' ? <BookOpenText size={13} /> : entry.kind === 'session' ? <Check size={13} /> : entry.kind === 'generate' ? <Wand2 size={13} /> : <CalendarDays size={13} />}
                </span>
                <span className="plan-journal__msg">{entry.message}</span>
                <span className="plan-journal__when">{formatRelative(entry.at)}</span>
              </motion.li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* ------------------------- Modale de clôture ------------------------ */}
      <Modal
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
        title="Comment ça s'est passé ?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCloseOpen(false)}>
              Plus tard
            </Button>
            <Button variant="primary" loading={busyClose} icon={<Flag size={15} />} onClick={() => void closeExam()}>
              Clôturer le contrôle
            </Button>
          </>
        }
      >
        <div className="plan-feedback" role="group" aria-label="Ton ressenti">
          {FEEDBACK_CHOICES.map((choice, index) => (
            <motion.button
              key={choice.id}
              type="button"
              className={`plan-feedback__choice${feedback === choice.id ? ' plan-feedback__choice--on' : ''}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.06 }}
              whileTap={{ scale: 0.94 }}
              onClick={() => setFeedback(choice.id)}
            >
              <span aria-hidden="true">{choice.emoji}</span>
              {choice.label}
            </motion.button>
          ))}
        </div>
        <Field label="Ta note (sur 20, quand tu la reçois)" hint="Facultatif : elle affine tes prochains plannings.">
          {({ id }) => (
            <TextInput id={id} inputMode="decimal" placeholder="Ex. : 15,5" value={grade} maxLength={5} onChange={(event) => setGrade(event.target.value)} />
          )}
        </Field>
      </Modal>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Supprimer ce contrôle ?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Annuler
            </Button>
            <Button variant="danger" icon={<Trash2 size={15} />} onClick={() => void removeExam()}>
              Supprimer
            </Button>
          </>
        }
      >
        <p className="ed-soft">
          « {exam.title} » et toutes ses séances seront retirés du planning. L'événement du calendrier sera aussi
          supprimé.
        </p>
      </Modal>

      <AnimatePresence>
        {data.daysLeft <= 2 && !terminated ? (
          <motion.p
            className="ed-small ed-center ed-mute"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            ⚡ Dernière ligne droite : les séances passent en mode express et quiz blanc.
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
