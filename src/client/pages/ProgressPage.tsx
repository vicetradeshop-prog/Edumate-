import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Award,
  BarChart3,
  BookOpen,
  BookOpenText,
  Clock,
  Flame,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Target,
  TrendingUp,
} from 'lucide-react';
import { Button } from '../components/ui/Button.js';
import { Card, CardSubtitle, CardTitle } from '../components/ui/Card.js';
import { Badge, Progress, Stars } from '../components/ui/Badge.js';
import { Empty, Loader, Notice } from '../components/ui/Feedback.js';
import { Segmented } from '../components/ui/Field.js';
import { ActivityChart, type ActivityPoint } from '../components/progress/ActivityChart.js';
import { SubjectDonut, type SubjectSlice } from '../components/progress/SubjectDonut.js';
import { SubjectBars } from '../components/progress/SubjectBars.js';
import { RadialGauge } from '../components/progress/RadialGauge.js';
import { endpoints, type ProgressStats } from '../lib/api.js';
import { useApi } from '../lib/data.js';
import { useAuth } from '../lib/store.js';
import { formatDuration, formatPercent, formatRelative, softColor } from '../lib/format.js';
import { useDocumentTitle, usePrefersReducedMotion } from '../lib/hooks.js';
import { sfx } from '../lib/sfx.js';
import { computeXp, formatXp, levelInfoFromXp } from '../lib/xp.js';

/** Couleurs de repli quand le catalogue n'en fournit pas pour une matière. */
const FALLBACK_COLORS = ['#6c5ce7', '#22d3ee', '#16a34a', '#f59e0b', '#e11d48', '#7c3aed', '#0ea5e9', '#db2777', '#0891b2', '#84cc16'];

/** Entrée en cascade des sections, respectée même en mouvement réduit. */
const sectionMotion = (reduced: boolean, index: number) => ({
  initial: reduced ? false : { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  transition: reduced ? { duration: 0 } : { duration: 0.5, delay: Math.min(index * 0.07, 0.5), ease: [0.22, 1, 0.36, 1] as const },
});

/**
 * Ma progression — refonte v3.3.
 *
 * Trois changements de fond par rapport à la version Recharts :
 *
 *   1. **Graphiques maison en SVG** (`components/progress/`). Recharts pesait
 *      413 ko dans ce seul chunk et imposait son rendu : info-bulles génériques,
 *      aucune animation pilotable, pas d'accès aux événements par colonne. Les
 *      composants maison sont plus légers, animés, sonorisés et accessibles
 *      (navigation clavier + tableau équivalent pour les lecteurs d'écran).
 *
 *   2. **Sonification.** Survoler le graphique ou l'anneau joue une note dont la
 *      hauteur suit le taux de réussite, sur une échelle PENTATONIQUE : aucune
 *      succession de notes ne peut dissoner, donc balayer les données produit une
 *      mélodie au lieu d'un crépitement. Coupé par la préférence « Sons » du
 *      compte, jamais bloquant si le navigateur refuse le contexte audio.
 *
 *   3. **Bandeau héros gamifié** : jauges animées, série en cours et niveau/XP
 *      calculés à partir des statistiques existantes (voir `lib/xp.ts`) — aucune
 *      donnée nouvelle en base, et la même valeur sur tous les appareils.
 */
export default function ProgressPage() {
  const user = useAuth((state) => state.user);
  const reduced = usePrefersReducedMotion();
  useDocumentTitle('Ma progression');
  const stats = useApi<ProgressStats>(() => endpoints.stats(), { deps: [user?.id] });
  const history = useApi(() => endpoints.history(50), { deps: [user?.id] });
  const mastery = useApi(() => endpoints.mastery(), { deps: [user?.id] });
  const [range, setRange] = useState<'7' | '14' | '30'>('30');

  /*
   * Les sons suivent la préférence du compte. Synchronisé ici en plus du store
   * global : la page doit rester cohérente même si l'utilisateur change le
   * réglage dans un autre onglet puis revient.
   */
  useEffect(() => {
    sfx.setEnabled(user?.preferences?.sounds !== false);
  }, [user?.preferences?.sounds]);

  const daily: ActivityPoint[] = useMemo(() => {
    const source = stats.data?.last30Days ?? [];
    return source.slice(-Number(range)).map((day) => ({
      date: day.date,
      label: day.date.slice(5).replace('-', '/'),
      rate: day.total ? day.score / day.total : 0,
      volume: day.total,
    }));
  }, [range, stats.data]);

  const subjects: SubjectSlice[] = useMemo(() => {
    const source = stats.data?.bySubject ?? [];
    return source.map((subject, index) => ({
      id: subject.subjectId,
      name: subject.subjectName,
      emoji: subject.emoji,
      color: subject.color || FALLBACK_COLORS[index % FALLBACK_COLORS.length],
      volume: subject.total,
      rate: subject.successRate,
    }));
  }, [stats.data]);

  const lessonsValidated = useMemo(
    () => (stats.data?.lessons ?? []).filter((lesson) => lesson.validated).length,
    [stats.data],
  );

  const level = useMemo(
    () =>
      levelInfoFromXp(
        computeXp({
          correct: stats.data?.correct ?? 0,
          attempts: stats.data?.attempts ?? 0,
          streakDays: stats.data?.streakDays ?? 0,
          totalDurationSec: stats.data?.totalDurationSec ?? 0,
          lessonsValidated,
        }),
      ),
    [lessonsValidated, stats.data],
  );

  if (stats.loading && !stats.data) return <Loader label="Calcul de ta progression…" large />;
  if (stats.error) {
    return (
      <div className="ed-stack">
        <Notice tone={stats.offline ? 'warning' : 'danger'}>{stats.error}</Notice>
        <Button variant="soft" icon={<RefreshCw size={16} />} onClick={() => void stats.reload()}>
          Réessayer
        </Button>
      </div>
    );
  }

  const data = stats.data;
  if (!data) return null;

  const masteryItems = (mastery.data?.items ?? []) as {
    topicId: string;
    name: string;
    subjectName: string;
    themeName: string;
    emoji: string;
    color: string;
    attempts: number;
    rate: number;
    bestScore: number;
    lastScore: number;
    mastered: boolean;
    lastPlayedAt: string;
  }[];

  const historyItems = (history.data?.items ?? []) as {
    id: string;
    topicId: string;
    topicName: string;
    themeName: string;
    subjectId: string;
    score: number;
    total: number;
    durationSec: number;
    createdAt: string;
  }[];

  const totalMinutes = Math.round(data.totalDurationSec / 60);
  const hasData = data.attempts > 0;
  const dailyGoalSec = Math.max(1, (user?.preferences?.dailyGoal ?? 20) * 60);
  const goalRatio = Math.min(1, data.lessonSecondsToday / dailyGoalSec);
  const activeDays = data.last30Days.filter((day) => day.total > 0).length;

  const indicators = [
    { icon: <BarChart3 size={22} />, value: String(data.attempts), label: 'quiz terminés', color: '#6c5ce7' },
    { icon: <Target size={22} />, value: formatPercent(data.successRate), label: 'réussite globale', color: '#16a34a' },
    { icon: <TrendingUp size={22} />, value: formatPercent(data.bestScore), label: 'meilleur score', color: '#0ea5e9' },
    { icon: <Flame size={22} />, value: `${data.streakDays} j`, label: 'série en cours', color: '#e11d48' },
    { icon: <Clock size={22} />, value: formatDuration(data.totalDurationSec), label: 'temps de travail', color: '#f59e0b' },
    { icon: <Award size={22} />, value: String(data.mastered.length), label: 'sujets maîtrisés', color: '#7c3aed' },
  ];

  return (
    <div className="ed-stack progress-page" style={{ gap: 24 }}>
      <header className="page-head">
        <div className="page-head__title">
          <span className="page-head__eyebrow">Suivi</span>
          <h1>Ma progression</h1>
          <p>
            {hasData
              ? `${data.attempts} quiz terminés, ${data.total} questions traitées, ${totalMinutes} minutes de travail cumulées.`
              : 'Dès ton premier quiz, tu verras ici tes courbes de réussite, tes points forts et les notions à retravailler.'}
          </p>
        </div>
        <Button
          variant="soft"
          icon={<RefreshCw size={16} />}
          onClick={() => {
            sfx.select();
            void stats.reload();
            void history.reload();
            void mastery.reload();
          }}
        >
          Actualiser
        </Button>
      </header>

      {/* ============================ Héros ============================ */}
      <motion.section className="phero" {...sectionMotion(reduced, 0)}>
        <div className="phero__gauges">
          <RadialGauge
            value={data.successRate}
            label="Réussite globale"
            color="#16a34a"
            colorTo="#4ade80"
            emoji="🎯"
            hint={`${data.correct} bonnes réponses sur ${data.total}`}
          />
          <RadialGauge
            value={goalRatio}
            label="Objectif du jour"
            color="#f59e0b"
            colorTo="#fbbf24"
            emoji="⏱️"
            format={(value) => `${Math.round(value * dailyGoalSec / 60)} min`}
            hint={`Objectif : ${user?.preferences?.dailyGoal ?? 20} min de leçons`}
          />
          <RadialGauge
            value={data.bestScore}
            label="Meilleur score"
            color="#0ea5e9"
            colorTo="#22d3ee"
            emoji="🏆"
            hint="Ton record sur un seul quiz"
          />
        </div>

        {/* Niveau / XP : calculé à partir des statistiques réelles (lib/xp.ts). */}
        <div className="phero__level">
          <div className="phero__level-head">
            <span className="phero__level-badge" aria-hidden="true">
              {level.level}
            </span>
            <span>
              <strong className="phero__level-title">
                {level.title} <Sparkles size={14} aria-hidden="true" />
              </strong>
              <span className="phero__level-xp">
                {formatXp(level.xp)} XP · encore {formatXp(level.remaining)} pour le niveau {level.level + 1}
              </span>
            </span>
          </div>

          <div
            className="phero__xp"
            role="progressbar"
            aria-valuenow={Math.round(level.progress * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Progression vers le niveau ${level.level + 1}`}
          >
            <motion.span
              className="phero__xp-fill"
              initial={reduced ? false : { scaleX: 0 }}
              animate={{ scaleX: level.progress }}
              transition={reduced ? { duration: 0 } : { duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.25 }}
            >
              {reduced ? null : <i className="phero__xp-shine" aria-hidden="true" />}
            </motion.span>
          </div>

          <div className="phero__streak">
            <span className={`phero__flame${data.streakDays > 0 && !reduced ? ' is-alive' : ''}`} aria-hidden="true">
              🔥
            </span>
            <span>
              <strong>{data.streakDays} jour{data.streakDays > 1 ? 's' : ''}</strong> de suite
              <em>{activeDays} jour{activeDays > 1 ? 's' : ''} actif{activeDays > 1 ? 's' : ''} sur 30</em>
            </span>
            <span className="phero__lessons">
              <BookOpenText size={15} aria-hidden="true" />
              {lessonsValidated} leçon{lessonsValidated > 1 ? 's' : ''} validée{lessonsValidated > 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </motion.section>

      {/* ========================= Indicateurs ========================= */}
      <motion.section className="stat-grid stagger" {...sectionMotion(reduced, 1)}>
        {indicators.map((item) => (
          <Card key={item.label}>
            <div
              className="stat stat--interactive"
              onMouseEnter={() => sfx.tick()}
              onFocus={() => sfx.tick()}
              tabIndex={0}
            >
              <span
                className="stat__icon"
                style={{ ['--stat-color' as string]: item.color, ['--stat-soft' as string]: softColor(item.color, 0.15) }}
                aria-hidden="true"
              >
                {item.icon}
              </span>
              <span>
                <span className="stat__value">{item.value}</span>
                <span className="stat__label">{item.label}</span>
              </span>
            </div>
          </Card>
        ))}
      </motion.section>

      {/* ====================== Leçons terminées ======================= */}
      <motion.div {...sectionMotion(reduced, 2)}>
        <Card>
          <CardTitle icon={<BookOpenText size={17} />}>Leçons terminées</CardTitle>
          <CardSubtitle>Chaque leçon finie à ≥ 80 % est validée ✔ et compte dans ton temps de travail.</CardSubtitle>
          {!data.lessons?.length ? (
            <p className="ed-small ed-mute" style={{ marginTop: 10 }}>
              Aucune leçon terminée pour l’instant : ouvre une leçon et finis ses exercices pour la voir ici.
            </p>
          ) : (
            <div className="ed-stack" style={{ gap: 4, marginTop: 12 }}>
              {data.lessons.slice(0, 10).map((lesson, index) => (
                <motion.div
                  key={lesson.topicId}
                  initial={reduced ? false : { opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={reduced ? { duration: 0 } : { duration: 0.28, delay: Math.min(index * 0.04, 0.4) }}
                >
                  <Link
                    to={`/lecons/${encodeURIComponent(lesson.topicId)}`}
                    className="list-item list-item--interactive"
                    onMouseEnter={() => sfx.hover(lesson.bestRate)}
                    onFocus={() => sfx.hover(lesson.bestRate)}
                  >
                    <span className="list-item__icon" style={{ background: softColor(lesson.color, 0.16) }} aria-hidden="true">
                      {lesson.emoji}
                    </span>
                    <span className="list-item__body">
                      <span className="list-item__title">{lesson.name}</span>
                      <span className="list-item__meta">
                        {formatRelative(lesson.lastAt)} · {formatDuration(lesson.totalDurationSec)} de travail ·{' '}
                        {lesson.completions} terminé{lesson.completions > 1 ? 's' : ''}
                      </span>
                    </span>
                    {lesson.validated ? (
                      <Badge tone="success">✔ {Math.round(lesson.bestRate * 100)} %</Badge>
                    ) : (
                      <Badge tone="warning">{Math.round(lesson.bestRate * 100)} % · à rejouer</Badge>
                    )}
                  </Link>
                </motion.div>
              ))}
            </div>
          )}
        </Card>
      </motion.div>

      {!hasData ? (
        <Empty
          emoji="🚀"
          title="Aucune donnée pour l’instant"
          description="Lance un premier quiz : tes statistiques apparaîtront immédiatement ici."
          action={
            <Link to="/quiz">
              <Button variant="primary">Choisir un quiz</Button>
            </Link>
          }
        />
      ) : (
        <>
          {/* ==================== Activité quotidienne ==================== */}
          <motion.div {...sectionMotion(reduced, 3)}>
            <Card className="pchart-card">
              <div className="section__head" style={{ marginBottom: 6 }}>
                <div>
                  <CardTitle icon={<TrendingUp size={17} />}>Activité quotidienne</CardTitle>
                  <CardSubtitle>
                    Courbe du taux de réussite et volume de questions. Survole pour entendre la réussite monter.
                  </CardSubtitle>
                </div>
                <Segmented
                  ariaLabel="Période affichée"
                  value={range}
                  onChange={(next) => {
                    sfx.whoosh();
                    setRange(next);
                  }}
                  options={[
                    { value: '7', label: '7 j' },
                    { value: '14', label: '14 j' },
                    { value: '30', label: '30 j' },
                  ]}
                />
              </div>
              <ActivityChart data={daily} height={272} />
            </Card>
          </motion.div>

          {/* ================= Répartition + par matière ================== */}
          <motion.div className="split" {...sectionMotion(reduced, 4)}>
            <Card>
              <CardTitle icon={<Target size={17} />}>Répartition du travail</CardTitle>
              <CardSubtitle>Où passent tes questions, matière par matière.</CardSubtitle>
              <div style={{ marginTop: 12 }}>
                <SubjectDonut data={subjects} />
              </div>
            </Card>

            <Card>
              <CardTitle icon={<BarChart3 size={17} />}>Réussite par matière</CardTitle>
              <CardSubtitle>Taux de bonnes réponses et volume traité. Repères à 40 % et 70 %.</CardSubtitle>
              <div style={{ marginTop: 14 }}>
                <SubjectBars data={subjects} limit={8} />
              </div>
            </Card>
          </motion.div>

          {/* ==================== Maîtrise & à revoir ==================== */}
          <motion.div className="split" {...sectionMotion(reduced, 5)}>
            <Card>
              <CardTitle icon={<Award size={17} />}>Sujets maîtrisés</CardTitle>
              <CardSubtitle>Au moins 2 tentatives et 80 % de réussite.</CardSubtitle>
              {data.mastered.length === 0 ? (
                <p className="ed-small ed-mute" style={{ marginTop: 10 }}>
                  Aucun sujet maîtrisé pour l’instant : rejoue tes meilleurs quiz pour valider la maîtrise.
                </p>
              ) : (
                <div className="ed-stack" style={{ gap: 4, marginTop: 12 }}>
                  {data.mastered.slice(0, 8).map((item, index) => (
                    <motion.div
                      key={item.topicId}
                      initial={reduced ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={reduced ? { duration: 0 } : { duration: 0.3, delay: Math.min(index * 0.045, 0.4) }}
                    >
                      <Link
                        to={`/quiz/${item.topicId}`}
                        className="list-item list-item--interactive"
                        onMouseEnter={() => sfx.hover(0.9)}
                        onFocus={() => sfx.hover(0.9)}
                      >
                        <span className="list-item__icon" style={{ background: softColor(item.color, 0.16) }} aria-hidden="true">
                          {item.emoji}
                        </span>
                        <span className="list-item__body">
                          <span className="list-item__title">{item.name}</span>
                          <span className="list-item__meta">
                            {item.subjectName} · {item.themeName}
                          </span>
                        </span>
                        <Badge tone="success">Maîtrisé</Badge>
                      </Link>
                    </motion.div>
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <CardTitle icon={<RotateCcw size={17} />}>À retravailler</CardTitle>
              <CardSubtitle>Dernier score inférieur à 60 %.</CardSubtitle>
              {data.toReview.length === 0 ? (
                <p className="ed-small ed-mute" style={{ marginTop: 10 }}>
                  Rien à signaler : tes derniers scores sont solides 👌
                </p>
              ) : (
                <div className="ed-stack" style={{ gap: 4, marginTop: 12 }}>
                  {data.toReview.slice(0, 8).map((item, index) => (
                    <motion.div
                      key={item.topicId}
                      initial={reduced ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={reduced ? { duration: 0 } : { duration: 0.3, delay: Math.min(index * 0.045, 0.4) }}
                    >
                      <Link
                        to={`/quiz/${item.topicId}/revision`}
                        className="list-item list-item--interactive"
                        onMouseEnter={() => sfx.hover(0.25)}
                        onFocus={() => sfx.hover(0.25)}
                      >
                        <span className="list-item__icon" style={{ background: softColor(item.color, 0.16) }} aria-hidden="true">
                          {item.emoji}
                        </span>
                        <span className="list-item__body">
                          <span className="list-item__title">{item.name}</span>
                          <span className="list-item__meta">{item.subjectName}</span>
                        </span>
                        <Badge tone="warning">Réviser</Badge>
                      </Link>
                    </motion.div>
                  ))}
                </div>
              )}
            </Card>
          </motion.div>

          {/* =================== Leçons & révisions =================== */}
          <motion.div {...sectionMotion(reduced, 6)}>
            <Card>
              <CardTitle icon={<BookOpenText size={17} />}>Leçons &amp; révisions interactives</CardTitle>
              <CardSubtitle>
                Chaque sujet du catalogue possède une leçon jouable : explications pas à pas, exemples guidés, exercices
                corrigés sur le coup. Et après chaque quiz, la révision interactive reprend tes erreurs une par une.
              </CardSubtitle>
              <div className="ed-row" style={{ gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                <Link to="/lecons">
                  <Button variant="primary" icon={<BookOpen size={16} />}>
                    Ouvrir le hub de leçons
                  </Button>
                </Link>
                {data.toReview[0] ? (
                  <Link to={`/quiz/${data.toReview[0].topicId}/revision`}>
                    <Button variant="soft" icon={<RotateCcw size={16} />}>
                      Réviser « {data.toReview[0].name} »
                    </Button>
                  </Link>
                ) : null}
              </div>
            </Card>
          </motion.div>

          {/* ==================== Détail par sujet ==================== */}
          <motion.div {...sectionMotion(reduced, 7)}>
            <Card>
              <CardTitle icon={<Target size={17} />}>Détail par sujet</CardTitle>
              <CardSubtitle>Tous les sujets que tu as déjà travaillés, avec ton meilleur score.</CardSubtitle>
              <div className="ed-stack" style={{ gap: 6, marginTop: 14 }}>
                {masteryItems.length === 0 ? (
                  <p className="ed-small ed-mute">Chargement…</p>
                ) : (
                  masteryItems.slice(0, 18).map((item, index) => (
                    <motion.div
                      key={item.topicId}
                      className="list-item list-item--interactive"
                      initial={reduced ? false : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={reduced ? { duration: 0 } : { duration: 0.24, delay: Math.min(index * 0.03, 0.45) }}
                      onMouseEnter={() => sfx.hover(item.rate)}
                      onFocus={() => sfx.hover(item.rate)}
                      tabIndex={0}
                    >
                      <span className="list-item__icon" style={{ background: softColor(item.color, 0.16) }} aria-hidden="true">
                        {item.emoji}
                      </span>
                      <span className="list-item__body">
                        <span className="list-item__title">{item.name}</span>
                        <span className="list-item__meta">
                          {item.subjectName} · {item.themeName} · {item.attempts} tentative{item.attempts > 1 ? 's' : ''} ·{' '}
                          {formatRelative(item.lastPlayedAt)}
                        </span>
                        <span style={{ display: 'block', marginTop: 5, maxWidth: 260 }}>
                          <Progress value={item.rate} thin color={item.color} />
                        </span>
                      </span>
                      <span className="ed-stack" style={{ gap: 5, alignItems: 'flex-end' }}>
                        <Stars score={item.bestScore * 5} size={13} />
                        <Badge tone={item.mastered ? 'success' : item.rate >= 0.6 ? 'warning' : 'danger'}>
                          {Math.round(item.rate * 100)} %
                        </Badge>
                      </span>
                    </motion.div>
                  ))
                )}
              </div>
            </Card>
          </motion.div>

          {/* ======================= Historique ======================= */}
          <motion.div {...sectionMotion(reduced, 8)}>
            <Card>
              <CardTitle icon={<Clock size={17} />}>Historique des quiz</CardTitle>
              <CardSubtitle>Les 50 dernières tentatives, de la plus récente à la plus ancienne.</CardSubtitle>
              <div className="ptable-scroll" style={{ marginTop: 12 }}>
                <table className="ptable">
                  <caption className="pchart__sr">Historique des 50 derniers quiz</caption>
                  <thead>
                    <tr>
                      <th scope="col">Sujet</th>
                      <th scope="col">Thème</th>
                      <th scope="col">Score</th>
                      <th scope="col">Durée</th>
                      <th scope="col">Date</th>
                      {/*
                        En-tête VISIBLE, et non un span masqué en
                        `position: absolute` : absolument positionné, son bloc
                        contenant devenait la CARTE (seul ancêtre `relative`) et
                        non la cellule. Placé à l'extrémité droite d'un tableau
                        de 548 px, il s'échappait du conteneur défilant et
                        élargissait la page entière — 513 px de scrollWidth pour
                        un viewport de 390. Un vrai titre de colonne est à la
                        fois plus simple, plus accessible et sans effet de bord.
                      */}
                      <th scope="col" className="ptable__action">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyItems.map((item) => {
                      const ratio = item.score / Math.max(1, item.total);
                      return (
                        <tr key={item.id} onMouseEnter={() => sfx.hover(ratio)}>
                          <th scope="row">{item.topicName}</th>
                          <td className="ptable__mute">{item.themeName}</td>
                          <td>
                            <Badge tone={ratio >= 0.7 ? 'success' : ratio >= 0.4 ? 'warning' : 'danger'}>
                              {item.score}/{item.total}
                            </Badge>
                          </td>
                          <td className="ptable__mute">{formatDuration(item.durationSec)}</td>
                          <td className="ptable__mute">{formatRelative(item.createdAt)}</td>
                          <td className="ptable__action">
                            <Link to={`/quiz/${item.topicId}/jouer`} className="section__link">
                              Rejouer
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                    {historyItems.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="ed-small ed-mute" style={{ padding: 14 }}>
                          Aucun quiz enregistré pour le moment.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </Card>
          </motion.div>
        </>
      )}
    </div>
  );
}
