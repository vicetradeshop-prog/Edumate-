import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, BookOpen, Gamepad2, Layers, Search } from 'lucide-react';
import { Button } from '../components/ui/Button.js';
import { Card, CardSubtitle, CardTitle } from '../components/ui/Card.js';
import { Badge } from '../components/ui/Badge.js';
import { Empty, Loader } from '../components/ui/Feedback.js';
import { endpoints, type ProgressStats, type SearchResponse } from '../lib/api.js';
import type { CatalogTopic } from '../../shared/types.js';
import { useApi } from '../lib/data.js';
import { useAuth, useCatalog } from '../lib/store.js';
import { useDocumentTitle } from '../lib/hooks.js';
import { softColor } from '../lib/format.js';

interface ThemeEntry {
  id: string;
  name: string;
  count: number;
}

/**
 * Hub « Leçons & révisions » — le point d'entrée du nouveau système de
 * révision interactif (remplace la révision espacée).
 *
 * Trois zones :
 *  1. « À réviser en priorité » : les sujets dont le dernier score est faible,
 *     avec accès direct à la révision du quiz ET à la leçon ;
 *  2. le navigateur matière → thème → sujet (chaque sujet ouvre sa leçon) ;
 *  3. la recherche plein texte pour trouver n'importe quelle leçon.
 */
export default function LessonHubPage() {
  const user = useAuth((state) => state.user);
  const subjects = useCatalog((state) => state.subjects);
  const levels = useCatalog((state) => state.levels);
  useDocumentTitle('Leçons & révisions');

  const stats = useApi<ProgressStats>(() => endpoints.stats(), { deps: [user?.id] });

  const [levelId, setLevelId] = useState<string>('');
  const [subjectId, setSubjectId] = useState<string>('');
  const [themes, setThemes] = useState<ThemeEntry[]>([]);
  const [themesLoading, setThemesLoading] = useState(false);
  const [themeId, setThemeId] = useState<string>('');
  const [topics, setTopics] = useState<CatalogTopic[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CatalogTopic[] | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    void useCatalog.getState().load();
  }, []);

  /* -------- Navigation : matière (+ niveau) → thèmes du catalogue -------- */
  useEffect(() => {
    setThemeId('');
    setTopics([]);
    if (!subjectId) {
      setThemes([]);
      return;
    }
    let cancelled = false;
    setThemesLoading(true);
    endpoints
      .browse({ subject: subjectId, level: levelId || undefined })
      .then((data) => {
        if (cancelled) return;
        setThemes((data.themes ?? []) as ThemeEntry[]);
        setThemesLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setThemes([]);
        setThemesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [subjectId, levelId]);

  /* ------------------- Thème choisi → liste des sujets ------------------- */
  useEffect(() => {
    if (!themeId) {
      setTopics([]);
      return;
    }
    let cancelled = false;
    setTopicsLoading(true);
    endpoints
      .search({ subject: subjectId || undefined, level: levelId || undefined, theme: themeId, limit: 120, sort: 'nom' })
      .then((data: SearchResponse) => {
        if (cancelled) return;
        setTopics(data.items ?? []);
        setTopicsLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setTopics([]);
        setTopicsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [themeId, subjectId, levelId]);

  /* ------------------------ Recherche plein texte ------------------------ */
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults(null);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      endpoints
        .search({ q: term, limit: 24 })
        .then((data) => {
          if (!cancelled) setResults(data.items ?? []);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  const toReview = useMemo(() => (stats.data?.toReview ?? []).slice(0, 6), [stats.data]);
  const hasAttempts = (stats.data?.attempts ?? 0) > 0;

  const lessonStat = (topicId: string) => (stats.data?.lessons ?? []).find((entry) => entry.topicId === topicId);

  const topicRow = (topic: CatalogTopic) => (
    <div key={topic.id} className="lesson-topic-row">
      <span className="list-item__icon" style={{ background: softColor(topic.color, 0.16) }} aria-hidden="true">
        {topic.emoji}
      </span>
      <span className="lesson-topic-row__body">
        <span className="lesson-topic-row__title">{topic.name}</span>
        <span className="lesson-topic-row__meta">
          {topic.subjectName} · {topic.levelName} · {topic.themeName}
        </span>
      </span>
      {lessonStat(topic.id) ? (
        lessonStat(topic.id)!.validated ? (
          <Badge tone="success">✔ Leçon validée</Badge>
        ) : (
          <Badge tone="warning">{Math.round(lessonStat(topic.id)!.bestRate * 100)} % · à rejouer</Badge>
        )
      ) : (
        <Badge tone={topic.difficulty === 'facile' ? 'success' : topic.difficulty === 'difficile' ? 'danger' : 'outline'}>
          {topic.difficulty}
        </Badge>
      )}
      <span className="ed-row" style={{ gap: 6, flexShrink: 0 }}>
        <Link to={`/lecons/${encodeURIComponent(topic.id)}`}>
          <Button variant="primary" size="sm" icon={<BookOpen size={15} />}>
            Leçon
          </Button>
        </Link>
        <Link to={`/quiz/${encodeURIComponent(topic.id)}/jouer`}>
          <Button variant="ghost" size="sm" icon={<Gamepad2 size={15} />} aria-label={`Jouer au quiz ${topic.name}`}>
            Quiz
          </Button>
        </Link>
      </span>
    </div>
  );

  return (
    <div className="ed-stack" style={{ gap: 22 }}>
      {/* -------------------------------- Hero -------------------------------- */}
      <motion.section className="lesson-hero" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
        <span className="lesson-hero__emoji" aria-hidden="true">
          📖
        </span>
        <h1>Leçons &amp; révisions</h1>
        <p className="ed-soft" style={{ maxWidth: '58ch', margin: '0 auto' }}>
          Chaque sujet a sa leçon jouable : des explications pas à pas, des exemples guidés, des exercices corrigés
          immédiatement — et après chaque quiz, une révision interactive de tes erreurs.
        </p>
      </motion.section>

      {/* ------------------------- Recherche rapide -------------------------- */}
      <Card>
        <div className="section__head" style={{ marginBottom: 10 }}>
          <CardTitle icon={<Search size={17} />}>Trouver une leçon</CardTitle>
        </div>
        <input
          className="input"
          type="search"
          value={query}
          placeholder="Ex. : pythagore, conjugaison, probabilités…"
          aria-label="Rechercher une leçon"
          maxLength={80}
          onChange={(event) => setQuery(event.target.value)}
        />
        {searching ? (
          <p className="ed-small ed-mute" style={{ marginTop: 10 }}>
            Recherche en cours…
          </p>
        ) : null}
        {results ? (
          results.length === 0 ? (
            <p className="ed-small ed-mute" style={{ marginTop: 10 }}>
              Aucune leçon ne correspond à « {query.trim()} ».
            </p>
          ) : (
            <div className="ed-stack" style={{ gap: 6, marginTop: 12 }}>
              {results.slice(0, 12).map(topicRow)}
            </div>
          )
        ) : null}
      </Card>

      {/* ---------------------- À réviser en priorité ------------------------ */}
      <section>
        <div className="section__head">
          <h2>À réviser en priorité</h2>
          <Link to="/progression" className="section__link">
            Ma progression <ArrowRight size={14} />
          </Link>
        </div>
        {stats.loading && !stats.data ? (
          <Loader label="Analyse de tes résultats…" />
        ) : toReview.length === 0 ? (
          <Card>
            <Empty
              emoji={hasAttempts ? '🌟' : '🚀'}
              title={hasAttempts ? 'Rien à rattraper !' : 'Tes révisions apparaîtront ici'}
              description={
                hasAttempts
                  ? 'Tes derniers quiz sont solides. Choisis une leçon ci-dessous pour continuer sur ta lancée.'
                  : 'Joue ton premier quiz : les sujets à consolider s’afficheront ici, avec leur révision interactive.'
              }
              action={
                <Link to="/quiz">
                  <Button variant="primary" icon={<Gamepad2 size={16} />}>
                    Explorer les quiz
                  </Button>
                </Link>
              }
            />
          </Card>
        ) : (
          <div className="card-grid stagger">
            {toReview.map((item) => (
              <Card key={item.topicId} className="revision-priority-card">
                <div className="ed-row" style={{ gap: 10, alignItems: 'center' }}>
                  <span className="list-item__icon" style={{ background: softColor(item.color, 0.16) }} aria-hidden="true">
                    {item.emoji}
                  </span>
                  <span className="ed-grow" style={{ minWidth: 0 }}>
                    <strong className="revision-priority-card__name">{item.name}</strong>
                    <span className="revision-priority-card__meta">
                      {item.subjectName} · {item.themeName}
                    </span>
                  </span>
                </div>
                <div className="revision-priority-card__actions">
                  <Link to={`/quiz/${encodeURIComponent(item.topicId)}/revision`} className="ed-grow">
                    <Button variant="primary" size="sm" block icon={<BookOpen size={15} />}>
                      Réviser le quiz
                    </Button>
                  </Link>
                  <Link to={`/lecons/${encodeURIComponent(item.topicId)}`}>
                    <Button variant="soft" size="sm" icon={<BookOpen size={15} />} aria-label={`Ouvrir la leçon ${item.name}`}>
                      Leçon
                    </Button>
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* ----------------------- Explorer les leçons ------------------------- */}
      <section>
        <div className="section__head">
          <h2>Explorer les leçons</h2>
          <CardSubtitle>1 300+ sujets, chacun avec sa leçon interactive.</CardSubtitle>
        </div>

        {/* Filtre de niveau */}
        <div className="pill-grid" style={{ marginBottom: 14 }} role="group" aria-label="Filtrer par niveau">
          <button type="button" className="pill" aria-pressed={levelId === ''} onClick={() => setLevelId('')}>
            Tous les niveaux
          </button>
          {levels.map((level) => (
            <button
              key={level.id}
              type="button"
              className="pill"
              aria-pressed={levelId === level.id}
              onClick={() => setLevelId(levelId === level.id ? '' : level.id)}
            >
              {level.name}
            </button>
          ))}
        </div>

        {/* Matières */}
        <div className="lesson-subject-grid">
          {subjects.map((subject) => (
            <button
              key={subject.id}
              type="button"
              className={`lesson-subject${subjectId === subject.id ? ' is-active' : ''}`}
              style={subjectId === subject.id ? { color: subject.color, background: softColor(subject.color, 0.08) } : undefined}
              onClick={() => {
                setSubjectId(subjectId === subject.id ? '' : subject.id);
              }}
            >
              <span className="lesson-subject__emoji" aria-hidden="true">
                {subject.emoji}
              </span>
              <span className="lesson-subject__name">{subject.name}</span>
            </button>
          ))}
        </div>

        {/* Thèmes de la matière choisie */}
        {subjectId ? (
          <div style={{ marginTop: 16 }}>
            {themesLoading ? (
              <Loader label="Chargement des thèmes…" />
            ) : (
              <div className="ed-row" style={{ gap: 8, flexWrap: 'wrap' }}>
                {themes.map((theme) => (
                  <button
                    key={theme.id}
                    type="button"
                    className="pill"
                    aria-pressed={themeId === theme.id}
                    onClick={() => setThemeId(themeId === theme.id ? '' : theme.id)}
                  >
                    <Layers size={13} aria-hidden="true" /> {theme.name} ({theme.count})
                  </button>
                ))}
                {themes.length === 0 ? <span className="ed-small ed-mute">Aucun thème pour ce filtre.</span> : null}
              </div>
            )}
          </div>
        ) : (
          <p className="ed-small ed-mute" style={{ marginTop: 14 }}>
            Choisis une matière pour dérouler ses thèmes et ses leçons.
          </p>
        )}

        {/* Sujets du thème choisi */}
        {themeId ? (
          <div style={{ marginTop: 16 }}>
            {topicsLoading ? (
              <Loader label="Chargement des leçons…" />
            ) : (
              <div className="ed-stack" style={{ gap: 6 }}>
                {topics.map(topicRow)}
                {topics.length === 0 ? <span className="ed-small ed-mute">Aucun sujet dans ce thème.</span> : null}
              </div>
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}
