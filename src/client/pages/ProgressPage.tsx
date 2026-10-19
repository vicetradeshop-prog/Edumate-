import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Award, BarChart3, BookOpen, BookOpenText, Clock, Flame, RefreshCw, RotateCcw, Target, TrendingUp } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '../components/ui/Button.js';
import { Card, CardSubtitle, CardTitle } from '../components/ui/Card.js';
import { Badge, Progress, Stars } from '../components/ui/Badge.js';
import { Empty, Loader, Notice } from '../components/ui/Feedback.js';
import { Segmented } from '../components/ui/Field.js';
import { endpoints, type ProgressStats } from '../lib/api.js';
import { useApi } from '../lib/data.js';
import { useAuth } from '../lib/store.js';
import { formatDuration, formatPercent, formatRelative, softColor } from '../lib/format.js';
import { useDocumentTitle } from '../lib/hooks.js';

const CHART_COLORS = ['#6c5ce7', '#22d3ee', '#16a34a', '#f59e0b', '#e11d48', '#7c3aed', '#0ea5e9', '#db2777', '#0891b2', '#84cc16'];

export default function ProgressPage() {
  const user = useAuth((state) => state.user);
  useDocumentTitle('Ma progression');
  const stats = useApi<ProgressStats>(() => endpoints.stats(), { deps: [user?.id] });
  const history = useApi(() => endpoints.history(50), { deps: [user?.id] });
  const mastery = useApi(() => endpoints.mastery(), { deps: [user?.id] });
  const [range, setRange] = useState<'7' | '14' | '30'>('30');

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

  const daily = data.last30Days.slice(-Number(range)).map((day) => ({
    date: day.date.slice(5).replace('-', '/'),
    Réussite: day.total ? Math.round((day.score / day.total) * 100) : 0,
    Questions: day.total,
  }));

  const subjects = data.bySubject
    .map((subject, index) => ({
      name: subject.subjectName,
      emoji: subject.emoji,
      value: subject.total,
      rate: Math.round(subject.successRate * 100),
      fill: subject.color || CHART_COLORS[index % CHART_COLORS.length],
    }))
    .sort((a, b) => b.value - a.value);

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

  return (
    <div className="ed-stack" style={{ gap: 24 }}>
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
        <Button variant="soft" icon={<RefreshCw size={16} />} onClick={() => { void stats.reload(); void history.reload(); void mastery.reload(); }}>
          Actualiser
        </Button>
      </header>

      {/* ------------------------------ Indicateurs -------------------------- */}
      <section className="stat-grid stagger">
        {[
          { icon: <BarChart3 size={22} />, value: String(data.attempts), label: 'quiz terminés', color: '#6c5ce7' },
          { icon: <Target size={22} />, value: formatPercent(data.successRate), label: 'réussite globale', color: '#16a34a' },
          { icon: <TrendingUp size={22} />, value: formatPercent(data.bestScore), label: 'meilleur score', color: '#0ea5e9' },
          { icon: <Flame size={22} />, value: `${data.streakDays} j`, label: 'série en cours', color: '#e11d48' },
          { icon: <Clock size={22} />, value: formatDuration(data.totalDurationSec), label: 'temps de travail', color: '#f59e0b' },
          { icon: <Award size={22} />, value: String(data.mastered.length), label: 'sujets maîtrisés', color: '#7c3aed' },
        ].map((item) => (
          <Card key={item.label}>
            <div className="stat">
              <span className="stat__icon" style={{ ['--stat-color' as string]: item.color, ['--stat-soft' as string]: softColor(item.color, 0.15) }} aria-hidden="true">
                {item.icon}
              </span>
              <span>
                <span className="stat__value">{item.value}</span>
                <span className="stat__label">{item.label}</span>
              </span>
            </div>
          </Card>
        ))}
      </section>

          {/* ----------------------- Leçons terminées ---------------------- */}
          <Card>
            <CardTitle icon={<BookOpenText size={17} />}>Leçons terminées</CardTitle>
            <CardSubtitle>
              Chaque leçon finie à ≥ 80 % est validée ✔ et compte dans ton temps de travail.
            </CardSubtitle>
            {!data.lessons?.length ? (
              <p className="ed-small ed-mute" style={{ marginTop: 10 }}>
                Aucune leçon terminée pour l’instant : ouvre une leçon et finis ses exercices pour la voir ici.
              </p>
            ) : (
              <div className="ed-stack" style={{ gap: 4, marginTop: 12 }}>
                {data.lessons.slice(0, 10).map((lesson) => (
                  <motion.div
                    key={lesson.topicId}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.24 }}
                  >
                    <Link to={`/lecons/${encodeURIComponent(lesson.topicId)}`} className="list-item">
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
          {/* ------------------------- Activité quotidienne -------------------- */}
          <Card>
            <div className="section__head" style={{ marginBottom: 6 }}>
              <div>
                <CardTitle icon={<TrendingUp size={17} />}>Activité quotidienne</CardTitle>
                <CardSubtitle>Pourcentage de bonnes réponses par jour.</CardSubtitle>
              </div>
              <Segmented
                ariaLabel="Période affichée"
                value={range}
                onChange={setRange}
                options={[
                  { value: '7', label: '7 j' },
                  { value: '14', label: '14 j' },
                  { value: '30', label: '30 j' },
                ]}
              />
            </div>
            <div style={{ width: '100%', height: 260, marginTop: 10 }}>
              <ResponsiveContainer>
                <BarChart data={daily} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--ed-border)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--ed-text-mute)' }} tickLine={false} axisLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'var(--ed-text-mute)' }} tickLine={false} axisLine={false} unit="%" />
                  <Tooltip
                    cursor={{ fill: 'var(--ed-surface-3)' }}
                    contentStyle={{
                      background: 'var(--ed-surface)',
                      border: '1px solid var(--ed-border)',
                      borderRadius: 12,
                      fontSize: '0.85rem',
                    }}
                    formatter={(value: number, name: string) => (name === 'Réussite' ? [`${value} %`, name] : [value, name])}
                  />
                  <Bar dataKey="Réussite" radius={[8, 8, 4, 4]} maxBarSize={34}>
                    {daily.map((entry, index) => (
                      <Cell
                        key={index}
                        fill={entry.Réussite >= 70 ? '#16a34a' : entry.Réussite >= 40 ? '#f59e0b' : entry.Questions ? '#e11d48' : 'var(--ed-border)'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="split">
            {/* ------------------------- Par matière -------------------------- */}
            <Card>
              <CardTitle icon={<BarChart3 size={17} />}>Réussite par matière</CardTitle>
              <CardSubtitle>Taux de bonnes réponses et volume travaillé.</CardSubtitle>
              <div className="ed-stack" style={{ gap: 14, marginTop: 16 }}>
                {subjects.map((subject) => (
                  <div key={subject.name}>
                    <div className="ed-row" style={{ justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                        {subject.emoji} {subject.name}
                      </span>
                      <span className="ed-small ed-mute">
                        {subject.rate} % · {subject.value} questions
                      </span>
                    </div>
                    <Progress value={subject.rate / 100} thin color={subject.fill} />
                  </div>
                ))}
                {subjects.length === 0 ? <p className="ed-small ed-mute">Pas encore de matière travaillée.</p> : null}
              </div>
            </Card>

            {/* ------------------------ Répartition -------------------------- */}
            <Card>
              <CardTitle icon={<Target size={17} />}>Répartition du travail</CardTitle>
              <CardSubtitle>Nombre de questions par matière.</CardSubtitle>
              <div style={{ width: '100%', height: 250, marginTop: 8 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={subjects} dataKey="value" nameKey="name" innerRadius={52} outerRadius={86} paddingAngle={3}>
                      {subjects.map((entry, index) => (
                        <Cell key={index} fill={entry.fill || CHART_COLORS[index % CHART_COLORS.length]} stroke="var(--ed-surface)" />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: 'var(--ed-surface)',
                        border: '1px solid var(--ed-border)',
                        borderRadius: 12,
                        fontSize: '0.85rem',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '0.78rem' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          {/* ---------------------- Maîtrise & à revoir ---------------------- */}
          <div className="split">
            <Card>
              <CardTitle icon={<Award size={17} />}>Sujets maîtrisés</CardTitle>
              <CardSubtitle>Au moins 2 tentatives et 80 % de réussite.</CardSubtitle>
              {data.mastered.length === 0 ? (
                <p className="ed-small ed-mute" style={{ marginTop: 10 }}>
                  Aucun sujet maîtrisé pour l’instant : rejoue tes meilleurs quiz pour valider la maîtrise.
                </p>
              ) : (
                <div className="ed-stack" style={{ gap: 4, marginTop: 12 }}>
                  {data.mastered.slice(0, 8).map((item) => (
                    <Link key={item.topicId} to={`/quiz/${item.topicId}`} className="list-item">
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
                  {data.toReview.slice(0, 8).map((item) => (
                    <Link key={item.topicId} to={`/quiz/${item.topicId}/revision`} className="list-item">
                      <span className="list-item__icon" style={{ background: softColor(item.color, 0.16) }} aria-hidden="true">
                        {item.emoji}
                      </span>
                      <span className="list-item__body">
                        <span className="list-item__title">{item.name}</span>
                        <span className="list-item__meta">{item.subjectName}</span>
                      </span>
                      <Badge tone="warning">Réviser</Badge>
                    </Link>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* ------------------- Leçons & révisions ------------------------ */}
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

          {/* ------------------------- Détail par sujet ---------------------- */}
          <Card>
            <CardTitle icon={<Target size={17} />}>Détail par sujet</CardTitle>
            <CardSubtitle>Tous les sujets que tu as déjà travaillés, avec ton meilleur score.</CardSubtitle>
            <div className="ed-stack" style={{ gap: 6, marginTop: 14 }}>
              {masteryItems.length === 0 ? (
                <p className="ed-small ed-mute">Chargement…</p>
              ) : (
                masteryItems.slice(0, 18).map((item) => (
                  <motion.div
                    key={item.topicId}
                    className="list-item"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
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
                      <Badge tone={item.mastered ? 'success' : item.rate >= 60 ? 'warning' : 'danger'}>
                        {Math.round(item.rate * 100)} %
                      </Badge>
                    </span>
                  </motion.div>
                ))
              )}
            </div>
          </Card>

          {/* ---------------------------- Historique ------------------------- */}
          <Card>
            <CardTitle icon={<Clock size={17} />}>Historique des quiz</CardTitle>
            <CardSubtitle>Les 50 dernières tentatives, de la plus récente à la plus ancienne.</CardSubtitle>
            <div style={{ overflowX: 'auto', marginTop: 12 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--ed-text-mute)', fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    <th style={{ padding: '8px 10px' }}>Sujet</th>
                    <th style={{ padding: '8px 10px' }}>Thème</th>
                    <th style={{ padding: '8px 10px' }}>Score</th>
                    <th style={{ padding: '8px 10px' }}>Durée</th>
                    <th style={{ padding: '8px 10px' }}>Date</th>
                    <th style={{ padding: '8px 10px' }} />
                  </tr>
                </thead>
                <tbody>
                  {historyItems.map((item) => (
                    <tr key={item.id} style={{ borderTop: '1px solid var(--ed-border)' }}>
                      <td style={{ padding: '9px 10px', fontWeight: 600 }}>{item.topicName}</td>
                      <td style={{ padding: '9px 10px', color: 'var(--ed-text-mute)' }}>{item.themeName}</td>
                      <td style={{ padding: '9px 10px' }}>
                        <Badge tone={item.score / Math.max(1, item.total) >= 0.7 ? 'success' : item.score / Math.max(1, item.total) >= 0.4 ? 'warning' : 'danger'}>
                          {item.score}/{item.total}
                        </Badge>
                      </td>
                      <td style={{ padding: '9px 10px', color: 'var(--ed-text-mute)' }}>{formatDuration(item.durationSec)}</td>
                      <td style={{ padding: '9px 10px', color: 'var(--ed-text-mute)' }}>{formatRelative(item.createdAt)}</td>
                      <td style={{ padding: '9px 10px', textAlign: 'right' }}>
                        <Link to={`/quiz/${item.topicId}/jouer`} className="section__link">
                          Rejouer
                        </Link>
                      </td>
                    </tr>
                  ))}
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
        </>
      )}
    </div>
  );
}
