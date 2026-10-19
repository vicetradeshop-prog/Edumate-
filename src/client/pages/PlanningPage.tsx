/**
 * EduMate — Page « Mon planning de révision ».
 *
 * Trois vues animées :
 *   - Aujourd'hui  : répartition du temps entre les contrôles actifs + séances du jour ;
 *   - Cette semaine : timeline des 7 prochains jours, tous contrôles confondus ;
 *   - Contrôles    : cartes de chaque contrôle (préparation, jours restants…).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, CalendarPlus, CalendarDays, CheckCircle2, Clock3, Layers, Plus, Sparkles } from 'lucide-react';
import { Button } from '../components/ui/Button.js';
import { Card, CardTitle } from '../components/ui/Card.js';
import { Badge } from '../components/ui/Badge.js';
import { Empty, Loader, Notice } from '../components/ui/Feedback.js';
import { ExamFormModal } from '../components/planning/ExamFormModal.js';
import { SessionCard } from '../components/planning/SessionCard.js';
import { endpoints, type ExamPlan, type ExamView } from '../lib/api.js';
import { useApi } from '../lib/data.js';
import { useCatalog } from '../lib/store.js';
import { useDocumentTitle } from '../lib/hooks.js';
import { formatDayLabel } from '../lib/format.js';
import { ACTIVITY_META, PRIORITY_UI, appToday, daysLeftLabel, formatMinutes } from '../lib/planningUi.js';

type Tab = 'today' | 'week' | 'exams';

/** Anneau de préparation animé. */
export function PrepRing({ percent, color = 'var(--ed-primary)', size = 54 }: { percent: number; color?: string; size?: number }) {
  const radius = size / 2 - 5;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <span className="prep-ring" style={{ width: size, height: size }} role="img" aria-label={`Préparation : ${clamped} %`}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--ed-surface-3)" strokeWidth={5} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - clamped / 100) }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="prep-ring__value">{clamped}</span>
    </span>
  );
}

export default function PlanningPage() {
  useDocumentTitle('Planning de révision');
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>('today');
  const exams = useApi(() => endpoints.planningExams(), { deps: [] });
  const today = useApi(() => endpoints.planningToday(), { deps: [] });
  const [weekPlans, setWeekPlans] = useState<ExamPlan[]>([]);
  const modalOpen = params.get('new') === '1';

  const activeViews = useMemo(() => (exams.data?.exams ?? []).filter((view) => view.exam.status === 'actif'), [exams.data]);

  /* Plans complets des contrôles actifs pour la vue « semaine ».
     `loadWeekPlans` est aussi rappelé après chaque action sur une séance
     (report, validation…) : sans cela la vue semaine restait périmée. */
  const loadWeekPlans = useCallback((views: ExamView[]) => {
    const actives = views.filter((view) => view.exam.status === 'actif');
    if (!actives.length) {
      setWeekPlans([]);
      return;
    }
    void Promise.all(actives.slice(0, 8).map((view) => endpoints.planningExam(view.exam.id).then((response) => response.plan).catch(() => null))).then(
      (plans) => setWeekPlans(plans.filter((plan): plan is ExamPlan => plan !== null)),
    );
  }, []);

  useEffect(() => {
    loadWeekPlans(exams.data?.exams ?? []);
  }, [exams.data, loadWeekPlans]);

  const openModal = (): void => setParams({ new: '1' });
  const closeModal = (): void => setParams({});

  const weekDays = useMemo(() => {
    const map = new Map<string, { date: string; label: string; sessions: ExamPlan['days'][number]['sessions'] & { examTitle?: string }[] }>();
    const todayIso = appToday();
    for (const plan of weekPlans) {
      for (const day of plan.days) {
        if (day.date < todayIso) continue;
        if (map.size >= 10 && !map.has(day.date)) continue;
        const entry = map.get(day.date) ?? { date: day.date, label: day.label, sessions: [] };
        for (const session of day.sessions) {
          if (session.status === 'skipped' || session.status === 'done') continue;
          entry.sessions.push({ ...session, examTitle: plan.exam.title });
        }
        map.set(day.date, entry);
      }
    }
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 7);
  }, [weekPlans]);

  const refreshAll = (): void => {
    void exams.reload().then(() => loadWeekPlans(exams.data?.exams ?? []));
    void today.reload();
    loadWeekPlans(activeViews);
  };

  return (
    <div className="ed-stack" style={{ gap: 20 }}>
      <header className="page-head">
        <div className="page-head__title">
          <span className="page-head__eyebrow">
            <CalendarDays size={13} style={{ verticalAlign: '-2px' }} /> Organisation
          </span>
          <h1>Planning de révision</h1>
          <p>
            Ajoute tes contrôles : EduMate construit ton programme de révision jour par jour, selon ta maîtrise
            réelle, et le recalcule après chaque séance.
          </p>
        </div>
        <Button variant="primary" icon={<Plus size={16} />} onClick={openModal}>
          Ajouter un contrôle
        </Button>
      </header>

      {exams.error ? <Notice tone="danger">{exams.error}</Notice> : null}

      {/* ------------------------------ Onglets ---------------------------- */}
      <div className="fiche-tabs" role="tablist" aria-label="Vues du planning">
        {(
          [
            { id: 'today' as Tab, label: 'Aujourd’hui', icon: <Sparkles size={15} /> },
            { id: 'week' as Tab, label: 'Cette semaine', icon: <CalendarDays size={15} /> },
            { id: 'exams' as Tab, label: `Contrôles · ${(exams.data?.exams ?? []).length}`, icon: <Layers size={15} /> },
          ] as const
        ).map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={`fiche-tab${tab === item.id ? ' fiche-tab--active' : ''}`} onClick={() => setTab(item.id)}>
            {tab === item.id ? <motion.span className="fiche-tab__pill" layoutId="plan-tab-pill" transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }} /> : null}
            <span className="fiche-tab__label">
              {item.icon}
              {item.label}
            </span>
          </button>
        ))}
      </div>

      {exams.loading && !exams.data ? (
        <Loader label="Calcul de ton planning…" large />
      ) : (
        <>
          {/* --------------------------- Aujourd'hui ------------------------ */}
          {tab === 'today' ? (
            <motion.div key="today" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="ed-stack" style={{ gap: 16 }}>
              {!activeViews.length ? (
                <Card>
                  <Empty
                    emoji="🗓️"
                    title="Aucun contrôle actif"
                    description="Ajoute ton prochain contrôle : EduMate répartit automatiquement tes révisions jour par jour, en insistant sur tes notions fragiles."
                    action={
                      <Button variant="primary" icon={<CalendarPlus size={16} />} onClick={openModal}>
                        Ajouter un contrôle
                      </Button>
                    }
                  />
                </Card>
              ) : (
                <>
                  <Card className="plan-alloc-card">
                    <div className="ed-row" style={{ justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                      <CardTitle icon={<Clock3 size={17} />}>Ton temps aujourd’hui</CardTitle>
                      <Badge tone="primary">{formatMinutes((today.data?.today?.capacityMinutes ?? 0))} disponibles</Badge>
                    </div>
                    {today.data?.today && today.data.today.allocation.length ? (
                      <>
                        <div className="plan-alloc" role="img" aria-label="Répartition du temps entre les contrôles">
                          {today.data.today.allocation.map((entry, index) => (
                            <motion.span
                              key={entry.examId}
                              className="plan-alloc__seg"
                              style={{ background: entry.color }}
                              initial={{ width: 0 }}
                              animate={{ width: `${(entry.minutes / Math.max(1, today.data?.today?.capacityMinutes ?? 1)) * 100}%` }}
                              transition={{ duration: 0.7, delay: 0.1 + index * 0.12, ease: [0.22, 1, 0.36, 1] }}
                              title={`${entry.title} — ${entry.minutes} min`}
                            />
                          ))}
                        </div>
                        <div className="plan-alloc__legend">
                          {today.data.today.allocation.map((entry) => (
                            <span key={entry.examId} className="plan-alloc__key">
                              <span className="plan-alloc__dot" style={{ background: entry.color }} aria-hidden="true" />
                              {entry.emoji} {entry.title} · <strong>{entry.minutes} min</strong>
                            </span>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="ed-small ed-mute">
                        Rien de prévu aujourd'hui : toutes les séances sont faites ou reportées. Profite-en pour relire
                        une fiche ✨
                      </p>
                    )}
                  </Card>

                  {today.data?.today?.sessions.length ? (
                    <div className="ed-stack" style={{ gap: 10 }}>
                      {today.data.today.sessions.map((session, index) => (
                        <SessionCard
                          key={session.id}
                          session={session}
                          examId={session.examId}
                          index={index}
                          onPlan={() => refreshAll()}
                        />
                      ))}
                    </div>
                  ) : null}

                  {today.data?.today?.nextExam ? (
                    <Link to={`/planning/${encodeURIComponent(today.data.today.nextExam.exam.id)}`} className="section__link" style={{ display: 'inline-flex', gap: 6 }}>
                      Voir le planning de « {today.data.today.nextExam.exam.title} » <ArrowRight size={14} />
                    </Link>
                  ) : null}
                </>
              )}
            </motion.div>
          ) : null}

          {/* -------------------------- Cette semaine ----------------------- */}
          {tab === 'week' ? (
            <motion.div key="week" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="ed-stack" style={{ gap: 14 }}>
              {!weekDays.length ? (
                <Card>
                  <Empty emoji="🌤️" title="Semaine légère" description="Aucune séance prévue sur les 7 prochains jours. Ajoute un contrôle ou profite de ce temps libre !" />
                </Card>
              ) : (
                weekDays.map((day, dayIndex) => (
                  <motion.section
                    key={day.date}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: dayIndex * 0.06 }}
                  >
                    <Card className="plan-day">
                      <div className="plan-day__head">
                        <strong>{day.label}</strong>
                        <span className="ed-small ed-mute">{day.sessions.reduce((sum, session) => sum + session.durationMin, 0)} min</span>
                      </div>
                      <div className="ed-stack" style={{ gap: 8 }}>
                        {day.sessions.map((session, index) => (
                          <SessionCard
                            key={session.id}
                            session={session}
                            examId={session.examId}
                            index={index}
                            compact
                            onPlan={() => {
                              refreshAll();
                            }}
                          />
                        ))}
                      </div>
                    </Card>
                  </motion.section>
                ))
              )}
            </motion.div>
          ) : null}

          {/* ---------------------------- Contrôles ------------------------- */}
          {tab === 'exams' ? (
            <motion.div key="exams" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
              {!exams.data?.exams.length ? (
                <Card>
                  <Empty
                    emoji="🎯"
                    title="Aucun contrôle enregistré"
                    description="Le planning automatique naît ici : un contrôle, ses notions, ton temps par jour — et EduMate s'occupe du programme."
                    action={
                      <Button variant="primary" icon={<CalendarPlus size={16} />} onClick={openModal}>
                        Ajouter un contrôle
                      </Button>
                    }
                  />
                </Card>
              ) : (
                <div className="plan-exam2-grid">
                  {exams.data.exams.map((view, index) => (
                    <ExamCard key={view.exam.id} view={view} index={index} />
                  ))}
                </div>
              )}
            </motion.div>
          ) : null}
        </>
      )}

      <ExamFormModal open={modalOpen} onClose={closeModal} />
    </div>
  );
}

/**
 * Carte d'un contrôle — version « couverture » v2.7.
 *
 * Alignement garanti : chaque zone a une hauteur fixe (couverture 2 lignes,
 * trois rangées de faits, aperçu de séance, actions) quelle que soit la
 * quantité de texte — les cartes d'une même rangée sont donc parfaitement
 * rangées. Animations : entrée en cascade, balayage lumineux du bandeau,
 * compte à rebours pulsant, survol qui soulève et fait briller.
 */
export function ExamCard({ view, index }: { view: ExamView; index: number }) {
  const { exam } = view;
  const done = exam.status === 'termine';
  const subject = useCatalog((state) => state.subjects.find((entry) => entry.id === exam.subjectId));
  const color = subject?.color ?? '#6c5ce7';
  const urgent = !done && view.daysLeft <= 2;
  const next = view.nextSession;
  const NextIcon = next ? ACTIVITY_META[next.activity].icon : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.09, 0.45), ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -7 }}
      className={`plan-exam3${done ? ' plan-exam3--done' : ''}`}
      style={{ ['--exam-color' as string]: color }}
    >
      {/* Bandeau couverture (hauteur fixe : 2 lignes de titre max) */}
      <div className="plan-exam3__cover">
        <span className="plan-exam3__shine" aria-hidden="true" />
        <span className="plan-exam3__emoji" aria-hidden="true">
          {subject?.emoji ?? '📘'}
        </span>
        <span className="plan-exam3__cover-text">
          <strong>{exam.title}</strong>
          <span>
            {subject?.name ?? exam.subjectId}
            {exam.themeName ? ` · ${exam.themeName}` : ''}
          </span>
        </span>
        {done ? (
          <span className="plan-exam3__stamp" aria-label="Contrôle terminé">
            TERMINÉ
          </span>
        ) : (
          <motion.span
            className={`plan-exam3__countdown${urgent ? ' plan-exam3__countdown--urgent' : ''}`}
            animate={urgent ? { scale: [1, 1.09, 1] } : { scale: 1 }}
            transition={urgent ? { duration: 1.3, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.3 }}
          >
            J-{Math.max(0, view.daysLeft)}
          </motion.span>
        )}
      </div>

      {/* Faits : 3 rangées de hauteur fixe → cartes toujours alignées */}
      <div className="plan-exam3__facts">
        <span className="plan-exam3__fact">
          <CalendarDays size={13} aria-hidden="true" />
          <em>{formatDayLabel(exam.date)}</em>
          {exam.time ? <i>{exam.time}</i> : null}
        </span>
        <span className="plan-exam3__fact">
          <CheckCircle2 size={13} aria-hidden="true" />
          <em>
            {view.sessionCount - view.remainingSessions}/{view.sessionCount}
          </em>
          séances
          <i>·</i>
          <em>{view.notionCount}</em>
          notions
        </span>
        <span className="plan-exam3__fact">
          <Clock3 size={13} aria-hidden="true" />
          <em>{exam.dailyMinutes} min/j</em>
          {exam.feedback ? (
            <>
              <i>·</i> ressenti {exam.feedback}
              {exam.grade !== undefined ? <em> {exam.grade}{exam.gradeMax ? `/${exam.gradeMax}` : ''}</em> : null}
            </>
          ) : (
            <i className="plan-exam3__placeholder">· en cours</i>
          )}
        </span>
      </div>

      {/* Aperçu de la prochaine séance (hauteur fixe) */}
      <div className="plan-exam3__next">
        {next && !done && NextIcon ? (
          <>
            <span className="plan-exam3__next-icon" style={{ background: `${ACTIVITY_META[next.activity].color}1f`, color: ACTIVITY_META[next.activity].color }} aria-hidden="true">
              <NextIcon size={14} />
            </span>
            <span className="plan-exam3__next-text">
              {next.topicName || ACTIVITY_META[next.activity].label}
              <em>{next.durationMin} min</em>
            </span>
          </>
        ) : (
          <span className="plan-exam3__next-text plan-exam3__next-text--void">
            {done ? 'Contrôle clôturé — bon travail !' : 'Aucune séance en attente'}
          </span>
        )}
      </div>

      {/* Preparation + action */}
      <div className="plan-exam3__foot">
        <PrepRing percent={view.prepPercent} color={done ? 'var(--ed-success)' : color} size={44} />
        <span className="plan-exam3__prep-label">{view.prepPercent} % préparé</span>
        <Link to={`/planning/${encodeURIComponent(exam.id)}`} className="plan-exam3__cta">
          {done ? 'Revoir' : 'Voir le planning'} <ArrowRight size={14} />
        </Link>
      </div>
    </motion.div>
  );
}
