import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, ChevronRight, Filter, GraduationCap, Heart, Search, Shuffle, Sparkles, X } from 'lucide-react';
import { Button, IconButton } from '../components/ui/Button.js';
import { Card, CardSubtitle, CardTitle } from '../components/ui/Card.js';
import { Badge } from '../components/ui/Badge.js';
import { Empty, Notice, SkeletonCards } from '../components/ui/Feedback.js';
import { TextInput, Select, Segmented } from '../components/ui/Field.js';
import { TopicCard } from '../components/quiz/TopicCard.js';
import { endpoints, type SearchResponse } from '../lib/api.js';
import { useApi } from '../lib/data.js';
import { useAuth, useCatalog, toast } from '../lib/store.js';
import { useDebounced, useDocumentTitle } from '../lib/hooks.js';
import type { CatalogTopic } from '../../shared/types.js';
import { softColor } from '../lib/format.js';

const PAGE_SIZE = 24;

export default function QuizHubPage() {
  useDocumentTitle('Quiz');
  const [params, setParams] = useSearchParams();
  const user = useAuth((state) => state.user);
  // Chaque valeur est sélectionnée séparément : un sélecteur renvoyant un objet
  // littéral recréerait une nouvelle référence à chaque rendu (boucle infinie).
  const catalogSubjects = useCatalog((state) => state.subjects);
  const catalogLevels = useCatalog((state) => state.levels);
  const catalogStats = useCatalog((state) => state.stats);
  const catalog = { subjects: catalogSubjects, levels: catalogLevels, stats: catalogStats };

  const query = params.get('q') ?? '';
  const subject = params.get('subject') ?? '';
  const level = params.get('level') ?? '';
  const theme = params.get('theme') ?? '';
  const difficulty = params.get('difficulty') ?? '';
  const favoritesOnly = params.get('favorites') === '1';
  const sort = (params.get('sort') ?? 'pertinence') as 'pertinence' | 'matiere' | 'difficulte' | 'nom';

  const [searchInput, setSearchInput] = useState(query);
  const debounced = useDebounced(searchInput, 300);
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(0);
  const [favoriteMap, setFavoriteMap] = useState<Record<string, boolean>>({});
  const [mastery, setMastery] = useState<Record<string, { bestScore: number; attempts: number }>>({});

  // Synchronise le champ de recherche avec l'URL (débounced).
  useEffect(() => {
    if (debounced !== query) update({ q: debounced || null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  useEffect(() => {
    setSearchInput(query);
  }, [query]);

  useEffect(() => {
    setPage(0);
  }, [query, subject, level, theme, difficulty, favoritesOnly, sort]);

  function update(patch: Record<string, string | null>): void {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === '') next.delete(key);
      else next.set(key, value);
    }
    setParams(next, { replace: true });
  }

  const search = useApi<SearchResponse>(
    () =>
      endpoints.search({
        q: query || undefined,
        subject: subject || undefined,
        level: level || undefined,
        theme: theme || undefined,
        difficulty: difficulty || undefined,
        favorites: favoritesOnly ? 1 : undefined,
        sort,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
    { deps: [query, subject, level, theme, difficulty, favoritesOnly, sort, page, user?.id] },
  );

  useEffect(() => {
    if (search.data) {
      setFavoriteMap(Object.fromEntries(search.data.items.map((item) => [item.id, Boolean(item.favorite)])));
    }
  }, [search.data]);

  useEffect(() => {
    if (!user) return;
    endpoints
      .mastery()
      .then((response) => {
        const map: Record<string, { bestScore: number; attempts: number }> = {};
        for (const item of response.items as { topicId: string; bestScore: number; attempts: number }[]) {
          map[item.topicId] = { bestScore: item.bestScore, attempts: item.attempts };
        }
        setMastery(map);
      })
      .catch(() => undefined);
  }, [user]);

  const browse = useApi(
    () => endpoints.browse(subject ? { subject } : undefined),
    { deps: [subject] },
  );

  interface ActiveFilter {
    key: string;
    label: string;
    clear: Record<string, null>;
  }
  const activeFilters: ActiveFilter[] = [];
  if (subject) {
    activeFilters.push({ key: 'subject', label: catalog.subjects.find((item) => item.id === subject)?.name ?? subject, clear: { subject: null, theme: null } });
  }
  if (level) activeFilters.push({ key: 'level', label: catalog.levels.find((item) => item.id === level)?.name ?? level, clear: { level: null } });
  if (theme) activeFilters.push({ key: 'theme', label: decodeURIComponent(theme), clear: { theme: null } });
  if (difficulty) activeFilters.push({ key: 'difficulty', label: difficulty, clear: { difficulty: null } });
  if (favoritesOnly) activeFilters.push({ key: 'favorites', label: 'Favoris uniquement', clear: { favorites: null } });

  /**
   * Liste des niveaux proposés au filtrage.
   *
   * ⚠️ Ne surtout PAS la déduire de `search.data.facets.levels` : cette facette
   * est calculée sur les résultats DÉJÀ filtrés. Dès qu'un niveau était choisi,
   * elle ne contenait plus qu'une seule entrée, et le sélecteur disparaissait —
   * l'élève n'avait alors plus aucun moyen de changer de niveau.
   *
   * `/api/browse` ignore volontairement le niveau choisi dans le compte des
   * niveaux : la liste reste donc stable quel que soit l'état du filtre. Repli
   * sur le catalogue statique tant que la réponse n'est pas arrivée.
   */
  const levelOptions = useMemo(() => {
    const fromBrowse = (browse.data?.levels ?? []) as { id: string; name: string; count: number }[];
    if (fromBrowse.length) return fromBrowse;
    return catalogLevels.map((entry) => ({ id: entry.id, name: entry.name, count: 0 }));
  }, [browse.data, catalogLevels]);

  const items: (CatalogTopic & { favorite?: boolean })[] = useMemo(
    () => (search.data?.items ?? []).map((item) => ({ ...item, favorite: favoriteMap[item.id] ?? item.favorite })),
    [search.data, favoriteMap],
  );

  const totalPages = search.data ? Math.ceil(search.data.total / PAGE_SIZE) : 0;
  const randomPick = (): void => {
    const list = items.length ? items : (search.data?.items ?? []);
    if (!list.length) {
      toast.info('Aucun sujet disponible pour ce filtre.');
      return;
    }
    const pick = list[Math.floor(Math.random() * list.length)];
    window.location.assign(`/quiz/${pick.id}/jouer`);
  };

  return (
    <div className="ed-stack" style={{ gap: 22 }}>
      <header className="page-head">
        <div className="page-head__title">
          <span className="page-head__eyebrow">Catalogue</span>
          <h1>Quiz & entraînements</h1>
          <p>
            {catalog.stats
              ? `${catalog.stats.topics.toLocaleString('fr-FR')} sujets classés par matière, niveau et thème. Les questions sont régénérées à chaque partie : aucune répétition mécanique.`
              : 'Chargement du catalogue…'}
          </p>
        </div>
        <div className="ed-row">
          <Button variant="soft" icon={<Shuffle size={16} />} onClick={randomPick}>
            Quiz surprise
          </Button>
          {user ? (
            <Button
              variant={favoritesOnly ? 'primary' : 'ghost'}
              icon={<Heart size={16} />}
              onClick={() => update({ favorites: favoritesOnly ? null : '1' })}
            >
              Favoris
            </Button>
          ) : null}
        </div>
      </header>

      {/* ------------------------------ Recherche ----------------------------- */}
      <Card flat>
        <div className="ed-row" style={{ gap: 10, flexWrap: 'wrap' }}>
          <span className="ed-grow" style={{ minWidth: 240 }}>
            <TextInput
              icon={<Search size={17} />}
              type="search"
              placeholder="Rechercher : dérivation, conjugaison, guerre froide, Python…"
              value={searchInput}
              aria-label="Rechercher un sujet de quiz"
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </span>
          <IconButton
            label={showFilters ? 'Masquer les filtres' : 'Afficher les filtres'}
            variant={showFilters ? 'primary' : 'soft'}
            onClick={() => setShowFilters((value) => !value)}
          >
            <Filter size={18} />
          </IconButton>
        </div>

        {showFilters ? (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="ed-stack" style={{ marginTop: 14, gap: 12 }}>
            <div className="ed-row" style={{ gap: 10, flexWrap: 'wrap' }}>
              <Select
                aria-label="Matière"
                value={subject}
                onChange={(event) => update({ subject: event.target.value || null, theme: null })}
              >
                <option value="">Toutes les matières</option>
                {catalog.subjects.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.emoji} {item.name}
                  </option>
                ))}
              </Select>
              <Select aria-label="Niveau" value={level} onChange={(event) => update({ level: event.target.value || null })}>
                <option value="">Tous les niveaux</option>
                {catalog.levels.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
              <Select aria-label="Difficulté" value={difficulty} onChange={(event) => update({ difficulty: event.target.value || null })}>
                <option value="">Toutes difficultés</option>
                <option value="facile">Facile</option>
                <option value="moyen">Moyen</option>
                <option value="difficile">Difficile</option>
              </Select>
              <Select aria-label="Tri" value={sort} onChange={(event) => update({ sort: event.target.value })}>
                <option value="pertinence">Trier : pertinence</option>
                <option value="matiere">Trier : matière</option>
                <option value="difficulte">Trier : difficulté</option>
                <option value="nom">Trier : nom</option>
              </Select>
            </div>

            {browse.data && browse.data.themes.length > 0 ? (
              <div>
                <p className="field__label" style={{ marginBottom: 7 }}>
                  Thèmes {subject ? '' : '(toutes matières)'}
                </p>
                <div className="pill-grid">
                  {browse.data.themes.slice(0, 26).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="pill"
                      aria-pressed={theme === item.id}
                      onClick={() => update({ theme: theme === item.id ? null : item.id })}
                    >
                      {item.name} <span className="ed-mute">({item.count})</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </motion.div>
        ) : null}

        {activeFilters.length ? (
          <div className="ed-row" style={{ gap: 7, marginTop: 12, flexWrap: 'wrap' }}>
            {activeFilters.map((filter) => (
              <button key={filter.key} type="button" className="badge badge--primary" onClick={() => update(filter.clear)}>
                {filter.label} <X size={12} />
              </button>
            ))}
            <button
              type="button"
              className="badge"
              onClick={() => setParams(new URLSearchParams(), { replace: true })}
            >
              Tout réinitialiser
            </button>
          </div>
        ) : null}
      </Card>

      {/* ----------------------- Navigation par matière ---------------------- */}
      {!query && !subject ? (
        <section>
          <div className="section__head">
            <h2>Explorer par matière</h2>
            <span className="ed-small ed-mute">Matière → niveau → thème → sujet</span>
          </div>
          <div className="card-grid stagger">
            {catalog.subjects.map((item) => {
              const count = browse.data?.subjects?.find((s: { id: string; count: number }) => s.id === item.id)?.count;
              return (
                <Link
                  key={item.id}
                  to={`/quiz?subject=${item.id}`}
                  className="card card--hover tile subject-tile"
                  style={{ ['--tile-color' as string]: item.color }}
                >
                  <span className="tile__icon" style={{ background: softColor(item.color, 0.16) }} aria-hidden="true">
                    <span style={{ fontSize: 22 }}>{item.emoji}</span>
                  </span>
                  <span>
                    <span className="card__title" style={{ display: 'block' }}>
                      {item.name}
                    </span>
                    <span className="subject-tile__count" style={{ display: 'block', marginTop: 3 }}>
                      {typeof count === 'number' ? `${count} sujets disponibles` : item.description}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* ------------------------- Fil d'Ariane niveau ---------------------- */}
      {subject ? (
        <nav className="breadcrumb" aria-label="Fil d’Ariane">
          <button type="button" onClick={() => update({ subject: null, level: null, theme: null })}>
            Toutes les matières
          </button>
          <ChevronRight size={14} />
          <span>{catalog.subjects.find((item) => item.id === subject)?.name ?? subject}</span>
          {level ? (
            <>
              <ChevronRight size={14} />
              <span>{catalog.levels.find((item) => item.id === level)?.name ?? level}</span>
            </>
          ) : null}
          {theme ? (
            <>
              <ChevronRight size={14} />
              <span>{decodeURIComponent(theme)}</span>
            </>
          ) : null}
        </nav>
      ) : null}

      {/*
        Sélecteur de niveaux pour la matière choisie.
        ⚠️ La condition ne doit PAS inclure `!level` : c'est exactement ce qui
        faisait disparaître toute la rangée de boutons dès qu'on cliquait sur
        « Troisième », « Première » ou « Terminale ». La rangée reste affichée,
        le niveau actif est marqué `aria-pressed`, et une pastille « Tous les
        niveaux » permet de revenir en arrière sans passer par le fil d'Ariane.
      */}
      {subject && levelOptions.length ? (
        <div className="pill-grid" style={{ marginBottom: 4 }} role="group" aria-label="Filtrer par niveau">
          <button
            type="button"
            className="pill"
            aria-pressed={!level}
            onClick={() => update({ level: null })}
          >
            Tous les niveaux
          </button>
          {levelOptions.map((item) => (
            <button
              key={item.id}
              type="button"
              className="pill"
              aria-pressed={level === item.id}
              // Un second clic sur le niveau actif le désactive : la rangée ne
              // disparaît jamais, mais on peut toujours annuler le filtre.
              onClick={() => update({ level: level === item.id ? null : item.id })}
            >
              {item.name} {item.count ? <span className="ed-mute">({item.count})</span> : null}
            </button>
          ))}
        </div>
      ) : null}

      {/* ------------------------------ Résultats ---------------------------- */}
      <section>
        <div className="section__head">
          <h2 style={{ fontSize: '1.2rem' }}>
            <GraduationCap size={19} />{' '}
            {search.data ? `${search.data.total.toLocaleString('fr-FR')} sujet${search.data.total > 1 ? 's' : ''}` : 'Résultats'}
          </h2>
          {/*
            Aucune matière choisie : le filtrage par niveau passe par ce
            contrôle compact. Dès qu'une matière est sélectionnée, la rangée de
            pastilles ci-dessus prend le relais (elle affiche les comptes par
            niveau) — afficher les deux serait redondant.
            Les options viennent de `levelOptions`, jamais des facettes des
            résultats : le contrôle ne peut donc plus se vider ni disparaître.
          */}
          {!subject && levelOptions.length > 0 ? (
            <Segmented
              ariaLabel="Filtrer par niveau"
              value={level}
              onChange={(value) => update({ level: value || null })}
              options={[
                { value: '', label: 'Tous' },
                ...levelOptions.map((item) => ({ value: item.id, label: item.name })),
              ]}
            />
          ) : null}
        </div>

        {search.error ? <Notice tone="danger">{search.error}</Notice> : null}
        {search.loading && !search.data ? <SkeletonCards count={8} height={150} /> : null}

        {search.data && items.length === 0 ? (
          <Empty
            emoji="🔎"
            title="Aucun sujet ne correspond"
            description="Essaie un autre mot-clé, ou retire un filtre pour élargir la recherche."
            action={
              <Button variant="soft" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
                Réinitialiser la recherche
              </Button>
            }
          />
        ) : null}

        {items.length > 0 ? (
          <div className="card-grid stagger">
            {items.map((topic) => (
              <TopicCard
                key={topic.id}
                topic={topic}
                bestScore={mastery[topic.id]?.bestScore}
                attempts={mastery[topic.id]?.attempts ?? 0}
                onFavoriteChange={(id, value) => setFavoriteMap((prev) => ({ ...prev, [id]: value }))}
              />
            ))}
          </div>
        ) : null}

        {totalPages > 1 ? (
          <div className="ed-row" style={{ justifyContent: 'center', gap: 10, marginTop: 22 }}>
            <Button variant="soft" size="sm" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>
              ← Précédent
            </Button>
            <span className="ed-small ed-mute">
              Page {page + 1} / {totalPages}
            </span>
            <Button variant="soft" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((value) => value + 1)}>
              Suivant →
            </Button>
          </div>
        ) : null}
      </section>

      {search.loading && search.data ? (
        <p className="ed-small ed-mute ed-center" role="status">
          Actualisation des résultats…
        </p>
      ) : null}

      <Card flat>
        <CardTitle icon={<Sparkles size={16} />}>D’où viennent les questions ?</CardTitle>
        <CardSubtitle>
          Elles sont générées par la bibliothèque pédagogique d’EduMate : des contenus vérifiés et des questions
          différentes à chaque partie, corrigées automatiquement avec une explication.
        </CardSubtitle>
        <Link to="/assistant" className="section__link" style={{ marginTop: 10, display: 'inline-flex' }}>
          Besoin d’une explication avant de commencer ? <ArrowRight size={14} />
        </Link>
      </Card>
    </div>
  );
}
