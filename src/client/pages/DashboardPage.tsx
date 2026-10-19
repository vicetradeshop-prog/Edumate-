import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock3,
  Flame,
  GraduationCap,
  Headphones,
  Languages,
  ListChecks,
  PenTool,
  Plus,
  RefreshCw,
  Sparkles,
  Target,
  Timer,
  Trophy,
} from 'lucide-react';
import { Button, IconButton } from '../components/ui/Button.js';
import { Card, CardSubtitle, CardTitle, Tile } from '../components/ui/Card.js';
import { GlassCard } from '../components/ui/GlassCard.js';
import { GlassBadge } from '../components/ui/GlassBadge.js';
import { GlassPanel } from '../components/ui/GlassPanel.js';
import { LiquidGlassButton } from '../components/ui/LiquidGlassButton.js';
import { Badge, Progress, Stars } from '../components/ui/Badge.js';
import { Empty, Loader, Notice } from '../components/ui/Feedback.js';
import { endpoints, type ProgressStats, type TodayResponse } from '../lib/api.js';
import { RevisionCard } from '../components/progress/RevisionCard.js';
import { NextRevisionCard } from '../components/planning/NextRevisionCard.js';
import { useApi } from '../lib/data.js';
import { useAuth, useCatalog, toast } from '../lib/store.js';
import type { CalendarEvent } from '../../shared/types.js';
import { formatDayLabel, formatDuration, formatPercent, formatRelative, greeting, isoDate } from '../lib/format.js';
import { URGENCY_META, countdownLabel, overdueEvents, urgencyOf, upcomingEvents } from '../lib/calendar.js';
import { useDocumentTitle } from '../lib/hooks.js';

const QUICK_TOOLS = [
  { to: '/outils/minuteur', label: 'Minuteur', icon: Timer, color: '#e11d48', hint: 'Sessions de travail' },
  { to: '/outils/chronometre', label: 'Chronomètre', icon: Clock3, color: '#0ea5e9', hint: 'Mesurer un exercice' },
  { to: '/outils/calendrier', label: 'Calendrier', icon: Calendar, color: '#f59e0b', hint: 'Devoirs et échéances' },
  { to: '/outils/tableau', label: 'Tableau', icon: PenTool, color: '#7c3aed', hint: 'Expliquer un raisonnement' },
  { to: '/outils/traducteur', label: 'Traducteur', icon: Languages, color: '#0891b2', hint: '15 langues' },
  { to: '/outils/musique', label: 'Musique', icon: Headphones, color: '#db2777', hint: 'Ambiances de focus' },
];

export default function DashboardPage() {
  const user = useAuth((state) => state.user);
  const navigate = useNavigate();
  const stats = useCatalog((state) => state.stats);
  /*
   * Sélecteurs Zustand atomiques (jamais d'objet littéral : cela recréerait une
   * référence à chaque rendu et provoquerait une boucle infinie).
   * `subjects` sert à afficher le NOM de la matière dans les échéances, au lieu
   * de l'identifiant technique (« mathematiques ») qui n'a aucun sens pour un élève.
   */
  const subjects = useCatalog((state) => state.subjects);
  useDocumentTitle('Tableau de bord');

  const progress = useApi<ProgressStats>(() => endpoints.stats(), { deps: [user?.id] });
  const today = useApi<TodayResponse>(() => endpoints.today(), { deps: [user?.id] });

  const [taskTitle, setTaskTitle] = useState('');
  const [addingTask, setAddingTask] = useState(false);

  useEffect(() => {
    // Précharge les données du catalogue pour la navigation.
    void useCatalog.getState().load();
  }, []);

  const addTask = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    const title = taskTitle.trim();
    if (!title) return;
    setAddingTask(true);
    const result = await endpoints.createTask({ title }).catch((error: unknown) => {
      toast.fromError(error, 'Impossible d’ajouter la tâche.');
      return null;
    });
    setAddingTask(false);
    if (result) {
      setTaskTitle('');
      toast.success('Tâche ajoutée à ta liste.');
      void today.reload();
    }
  };

  const toggleTask = async (id: string, done: boolean): Promise<void> => {
    const result = await endpoints.updateTask(id, { done }).catch((error: unknown) => {
      toast.fromError(error);
      return null;
    });
    if (result) void today.reload();
  };

  const data = progress.data;
  const goal = user?.preferences?.dailyGoal ?? 20;
  const todayKey = isoDate(new Date());
  /* Temps travaillé aujourd'hui : quiz ET leçons (les leçons comptent !).
     Plancher à 1 min dès qu'une seconde a été travaillée : éviter le
     « 0 min » décourageant après une séance courte. */
  const secondsToday = data
    ? data.recent.filter((attempt) => attempt.createdAt.slice(0, 10) === todayKey).reduce((sum, attempt) => sum + attempt.durationSec, 0) +
      (data.lessonSecondsToday ?? 0)
    : 0;
  const minutesToday = secondsToday > 0 ? Math.max(1, Math.round(secondsToday / 60)) : 0;

  /*
   * Échéances à venir, calculées localement plutôt que reprises telles quelles
   * de l'API : `computeCalendarStats` et `urgencyOf` ont besoin d'une même date
   * de référence, et les événements en retard doivent apparaître EN PREMIER —
   * l'ancien affichage les ignorait complètement.
   */
  const [dashboardNow, setDashboardNow] = useState(() => new Date());
  /*
   * Échéances déjà validées localement, en attente de confirmation du serveur.
   *
   * 🔴 Sans ce retrait optimiste, cliquer sur « terminer » faisait disparaître
   * TOUTE la carte : `useApi.reload()` repasse `loading` à `true` et le bloc
   * était rendu par `today.loading ? <squelettes> : …`. Sur un serveur lent
   * (palier gratuit en veille : plusieurs secondes, voire dizaines de secondes),
   * l'élève voyait sa liste se vider au profit de deux rectangles gris — d'où
   * l'impression que « l'interface bugue et on ne voit plus rien ».
   */
  const [completedIds, setCompletedIds] = useState<string[]>([]);
  useEffect(() => {
    // Une minute suffit : le compte à rebours affiche des heures ou des jours.
    const timer = window.setInterval(() => setDashboardNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const allEvents = today.data ? [...(today.data.overdue ?? []), ...(today.data.upcoming ?? [])] : [];
  const upcoming = useMemo(
    () =>
      [...overdueEvents(allEvents, dashboardNow), ...upcomingEvents(allEvents, dashboardNow)]
        .filter((event) => !completedIds.includes(event.id))
        .slice(0, 5),
    // `allEvents` est recalculé à chaque rendu : on dépend des données brutes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [today.data, dashboardNow, completedIds],
  );

  /*
   * ⚠️ TOUS les hooks ci-dessus doivent précéder les retours anticipés qui
   * suivent. Placés après, ils ne s'exécuteraient pas au premier rendu (état en
   * chargement) puis apparaîtraient au second : React détecterait un changement
   * d'ordre des hooks, ce qui corrompt l'état du composant.
   */

  if (progress.loading && !progress.data) {
    return <Loader label="Préparation de ton tableau de bord…" large />;
  }

  if (progress.error && !progress.data) {
    return (
      <div className="ed-stack">
        <Notice tone={progress.offline ? 'warning' : 'danger'}>
          {progress.offline
            ? 'Impossible de charger tes statistiques pour le moment. Vérifie ta connexion puis réessaie.'
            : progress.error}
        </Notice>
        <Button variant="soft" onClick={() => void progress.reload()} icon={<RefreshCw size={16} />}>
          Réessayer
        </Button>
      </div>
    );
  }

  const firstName = user?.firstName ?? '';
  const subjectRows = (data?.bySubject ?? []).slice(0, 5);
  /** Marque une échéance comme terminée, avec retour arrière en cas d'échec. */
  const completeEvent = async (event: CalendarEvent): Promise<void> => {
    const forget = (id: string): void => setCompletedIds((prev) => prev.filter((entry) => entry !== id));
    // 1) Retrait immédiat : la ligne quitte la liste dès le clic, avec son
    //    animation de sortie. L'élève voit l'effet de son geste sans attendre.
    setCompletedIds((prev) => (prev.includes(event.id) ? prev : [...prev, event.id]));
    try {
      // 2) Enregistrement serveur.
      await endpoints.updateEvent(event.id, { done: true });
      toast.success(`« ${event.title} » marqué comme terminé.`);
      // 3) Rechargement : la réponse ne contient déjà plus l'événement terminé,
      //    le filtre local devient inutile et peut être levé sans clignotement.
      await today.reload();
      forget(event.id);
    } catch (error) {
      // Échec : la ligne revient exactement comme avant, rien n'est perdu.
      forget(event.id);
      toast.fromError(error, 'Mise à jour impossible.');
    }
  };
  const openTasks = today.data?.tasks ?? [];

  return (
    <div className="ed-stack reveal-stagger" style={{ gap: 26 }}>
      {/* ------------------------------- Héro ------------------------------- */}
      <section className="hero">
        <div className="hero__content">
          <GlassBadge className="hero__badge">
            {greeting()} · {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </GlassBadge>
          <h1 style={{ marginTop: 12 }}>
            {greeting()}, {firstName} {user?.avatar ?? '🦉'}
          </h1>
          <p>
            {data && data.attempts > 0
              ? `Tu as terminé ${data.attempts} quiz avec ${formatPercent(data.successRate)} de réussite. ${
                  data.streakDays > 1 ? `Série en cours : ${data.streakDays} jours 🔥` : 'Continue sur ta lancée !'
                }`
              : 'Commence par un quiz rapide ou pose ta question à l’assistant : on avance étape par étape.'}
          </p>
          <div className="hero__actions">
            {/*
              Boutons de navigation (et non <Link><button></Link>) : imbriquer
              deux éléments interactifs est invalide en HTML et cassait les
              animations de survol (focus/hover doubles). `useNavigate` garde
              la navigation SPA, le bouton reste seul maître de ses états.
            */}
            <LiquidGlassButton variant="primary" size="lg" icon={<Sparkles size={18} />} onClick={() => navigate('/assistant')}>
              Demander de l’aide
            </LiquidGlassButton>
            <Button variant="soft" className="btn--outline" size="lg" icon={<GraduationCap size={18} />} onClick={() => navigate('/quiz')}>
              Lancer un quiz
            </Button>
          </div>
        </div>
      </section>

      {/* ---------------------------- Indicateurs --------------------------- */}
      <section className="stat-grid stagger">
        {[
          {
            icon: <Trophy size={22} />,
            value: data ? String(data.attempts) : '0',
            label: 'quiz terminés',
            color: '#f59e0b',
          },
          {
            icon: <Target size={22} />,
            value: data ? formatPercent(data.successRate) : '—',
            label: 'de réussite globale',
            color: '#16a34a',
          },
          {
            icon: <Flame size={22} />,
            value: data ? `${data.streakDays} j` : '0 j',
            label: 'de série quotidienne',
            color: '#e11d48',
          },
          {
            icon: <BookOpen size={22} />,
            value: data ? String(data.mastered.length) : '0',
            label: 'sujets maîtrisés',
            color: '#6c5ce7',
          },
        ].map((item) => (
          <GlassCard key={item.label} tilt>
            <div className="stat">
              <span
                className="stat__icon"
                style={{ ['--stat-color' as string]: item.color, ['--stat-soft' as string]: `${item.color}1f` }}
                aria-hidden="true"
              >
                {item.icon}
              </span>
              <span>
                <span className="stat__value">{item.value}</span>
                <span className="stat__label">{item.label}</span>
              </span>
            </div>
          </GlassCard>
        ))}
      </section>

      {/* --------------------- Prochaine révision (planning) ------------------ */}
      <NextRevisionCard />

      {/* ------------------------- Objectif quotidien ----------------------- */}
      <GlassCard hover={false}>
        <div className="ed-row" style={{ justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
          <div>
            <CardTitle icon={<Timer size={17} />}>Objectif du jour</CardTitle>
            <CardSubtitle>
              {minutesToday} min travaillées aujourd’hui (quiz + leçons) sur un objectif de {goal} min
            </CardSubtitle>
          </div>
          <Badge tone={minutesToday >= goal ? 'success' : 'primary'}>
            {minutesToday >= goal ? 'Objectif atteint 🎉' : `${Math.max(0, goal - minutesToday)} min restantes`}
          </Badge>
        </div>
        <div style={{ marginTop: 14 }}>
          <Progress value={goal ? minutesToday / goal : 0} color="#16a34a" />
        </div>
      </GlassCard>

      {/* ------------------------------- Grille ----------------------------- */}
      <div className="split dash-split">
        <div className="ed-stack" style={{ gap: 22 }}>
          {/* Prochains devoirs */}
          <Card>
            <div className="section__head" style={{ marginBottom: 10 }}>
              <CardTitle icon={<Calendar size={17} />}>À venir</CardTitle>
              <Link to="/outils/calendrier" className="section__link">
                Calendrier <ArrowRight size={14} />
              </Link>
            </div>
            {/*
              🔴 `today.loading && !today.data` : les squelettes ne s'affichent
              qu'au TOUT premier chargement. Un simple rechargement (après une
              validation ou un ajout de tâche) conserve la liste déjà affichée —
              plus d'écran qui se vide pendant l'aller-retour serveur.
            */}
            {today.loading && !today.data ? (
              <div className="ed-stack" style={{ gap: 8 }}>
                <div className="skeleton" style={{ height: 46 }} />
                <div className="skeleton" style={{ height: 46 }} />
              </div>
            ) : (
              <div className="ed-stack" style={{ gap: 6 }}>
                <AnimatePresence initial={false}>
                {upcoming.map((event, index) => {
                  const urgency = urgencyOf(event, dashboardNow);
                  const meta = URGENCY_META[urgency];
                  const subject = subjects.find((entry) => entry.id === event.subjectId);
                  return (
                    <motion.div
                      key={event.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 26, scale: 0.97, transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] } }}
                      transition={{ duration: 0.26, delay: Math.min(index * 0.05, 0.25), ease: [0.22, 1, 0.36, 1] }}
                      className="dash-event"
                      style={{ borderLeftColor: meta.color }}
                    >
                      <span className="dash-event__icon" style={{ background: `${meta.color}1f` }} aria-hidden="true">
                        {event.kind === 'examen' ? '📝' : event.kind === 'travail' ? '📖' : event.kind === 'devoir' ? '✏️' : '📌'}
                      </span>
                      <span className="dash-event__body">
                        <span className="dash-event__title">{event.title}</span>
                        <span className="dash-event__meta">
                          {event.time ?? 'Journée entière'}
                          {subject ? ` · ${subject.emoji} ${subject.name}` : ''}
                        </span>
                      </span>
                      <span className="dash-event__when" style={{ color: meta.color }}>
                        {countdownLabel(event, dashboardNow)}
                      </span>
                      <IconButton
                        label={`Marquer « ${event.title} » comme terminé`}
                        size="sm"
                        variant="ghost"
                        onClick={() => void completeEvent(event)}
                      >
                        <CheckCircle2 size={16} />
                      </IconButton>
                    </motion.div>
                  );
                })}
                </AnimatePresence>
                {upcoming.length === 0 ? (
                  <Empty
                    emoji="🌤️"
                    title="Rien de prévu"
                    description="Ajoute tes devoirs et tes sessions de travail pour les voir apparaître ici."
                    action={
                      <Link to="/outils/calendrier">
                        <Button variant="soft" size="sm" icon={<Plus size={15} />}>
                          Ajouter un événement
                        </Button>
                      </Link>
                    }
                  />
                ) : null}
              </div>
            )}
          </Card>

          {/* Tâches rapides */}
          <Card>
            <div className="section__head" style={{ marginBottom: 10 }}>
              <CardTitle icon={<ListChecks size={17} />}>Ma liste du moment</CardTitle>
              <Link to="/devoirs" className="section__link">
                Tout voir <ArrowRight size={14} />
              </Link>
            </div>
            <form onSubmit={addTask} className="ed-row" style={{ gap: 8, marginBottom: 10 }}>
              <input
                className="input"
                style={{ minHeight: 44 }}
                placeholder="Ajouter une tâche rapide (ex. relire le chapitre 4)…"
                value={taskTitle}
                aria-label="Nouvelle tâche"
                maxLength={140}
                onChange={(event) => setTaskTitle(event.target.value)}
              />
              <Button type="submit" loading={addingTask} icon={<Plus size={17} />} aria-label="Ajouter la tâche" />
            </form>
            {openTasks.length === 0 ? (
              <p className="ed-small ed-mute">Aucune tâche en cours. Profites-en… ou ajoutes-en une 😉</p>
            ) : (
              <div className="ed-stack" style={{ gap: 2 }}>
                {openTasks.slice(0, 5).map((task) => (
                  <div key={task.id} className="list-item">
                    <IconButton label="Marquer comme terminée" size="sm" variant="ghost" onClick={() => void toggleTask(task.id, true)}>
                      <CheckCircle2 size={19} style={{ color: 'var(--ed-success)' }} />
                    </IconButton>
                    <span className="list-item__body">
                      <span className="list-item__title">{task.title}</span>
                      {task.dueDate ? <span className="list-item__meta">Pour {formatDayLabel(task.dueDate)}</span> : null}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Derniers quiz */}
          <Card>
            <div className="section__head" style={{ marginBottom: 10 }}>
              <CardTitle icon={<Trophy size={17} />}>Derniers quiz</CardTitle>
              <Link to="/progression" className="section__link">
                Progression <ArrowRight size={14} />
              </Link>
            </div>
            {!data || data.recent.length === 0 ? (
              <Empty
                emoji="🎯"
                title="Aucun quiz pour l’instant"
                description={stats ? `${stats.topics.toLocaleString('fr-FR')} sujets t’attendent dans le catalogue.` : 'Le catalogue se charge…'}
                action={
                  <Link to="/quiz">
                    <Button variant="primary" size="sm">
                      Choisir un quiz
                    </Button>
                  </Link>
                }
              />
            ) : (
              <div className="ed-stack" style={{ gap: 2 }}>
                {data.recent.slice(0, 5).map((attempt) => (
                  <Link key={attempt.id} to={`/quiz/${attempt.topicId}`} className="list-item">
                    <span className="list-item__icon" aria-hidden="true">
                      {attempt.emoji}
                    </span>
                    <span className="list-item__body">
                      <span className="list-item__title">{attempt.topicName}</span>
                      <span className="list-item__meta">
                        {attempt.themeName} · {formatRelative(attempt.createdAt)} · {formatDuration(attempt.durationSec)}
                      </span>
                    </span>
                    <span className="ed-row" style={{ gap: 10 }}>
                      <Stars score={attempt.score} total={attempt.total} />
                      <Badge tone={attempt.percent >= 70 ? 'success' : attempt.percent >= 40 ? 'warning' : 'danger'}>
                        {attempt.score}/{attempt.total}
                      </Badge>
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* ------------------------------ Colonne --------------------------- */}
        <div className="ed-stack" style={{ gap: 22 }}>
          <Card>
            <div className="section__head" style={{ marginBottom: 10 }}>
              <CardTitle icon={<Sparkles size={17} />}>Assistant IA</CardTitle>
            </div>
            <p className="ed-small ed-soft" style={{ marginBottom: 14 }}>
              Bloqué sur un exercice ? L’assistant explique, reformule, propose une méthode et des exercices adaptés à
              ton niveau.
            </p>
            <Link to="/assistant">
              <Button block variant="primary" iconRight={<ArrowRight size={17} />}>
                Poser ma question
              </Button>
            </Link>
          </Card>

          <Card>
            <div className="section__head" style={{ marginBottom: 10 }}>
              <CardTitle icon={<BookOpen size={17} />}>Mes matières</CardTitle>
              <Link to="/progression" className="section__link">
                Détail <ArrowRight size={14} />
              </Link>
            </div>
            {subjectRows.length === 0 ? (
              <p className="ed-small ed-mute">
                Tes matières apparaîtront dès ton premier quiz terminé.
              </p>
            ) : (
              <div className="ed-stack" style={{ gap: 12 }}>
                {subjectRows.map((subject) => (
                  <div key={subject.subjectId}>
                    <div className="ed-row" style={{ justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>
                        {subject.emoji} {subject.subjectName}
                      </span>
                      <span className="ed-small ed-mute">{subject.attempts} quiz</span>
                    </div>
                    <Progress value={subject.successRate} thin color={subject.color} />
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/*
            À réviser — carrousel doux.
            Les leçons défilent lentement de haut en bas dans une fenêtre à
            hauteur bornée (pause au survol, boucle sans couture) : tout est
            visible sans étirer la page, rien ne sort du cadre, et le bas de
            la carte s'aligne avec celui de « Derniers quiz » grâce à la
            grille étirable `.dash-split`. Les données proviennent de
            `progress` (déjà chargé) : aucun appel réseau supplémentaire.
          */}
          <RevisionCard items={data?.toReview ?? []} loading={progress.loading && !data} />

        </div>
      </div>

      {/* ------------------------------- Outils ----------------------------- */}
      <GlassPanel
        title="Outils rapides"
        aside={
          <Link to="/outils" className="section__link">
            Tous les outils <ArrowRight size={14} />
          </Link>
        }
      >
        <div className="card-grid stagger">
          {QUICK_TOOLS.map((tool) => (
            <Tile
              key={tool.to}
              to={tool.to}
              icon={<tool.icon size={21} />}
              title={tool.label}
              description={tool.hint}
              color={tool.color}
            />
          ))}
        </div>
      </GlassPanel>

      {/* --------------------------- Bandeau d'état ------------------------- */}
      {progress.offline || today.error ? (
        <Notice tone="warning">
          Certaines données n’ont pas pu être actualisées. Tout le reste de l’application fonctionne
          normalement.
        </Notice>
      ) : null}

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
        <p className="ed-small ed-mute ed-center">
          Astuce : utilise la barre de recherche en haut de l’écran pour trouver n’importe quel sujet de quiz.
        </p>
      </motion.div>
    </div>
  );
}
