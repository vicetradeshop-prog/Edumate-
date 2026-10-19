import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Headphones, Loader2, Menu, Moon, Pause, Play, Search, SearchX, Sun, Volume2, VolumeX, X } from 'lucide-react';
import { Sidebar, ScrollProgress } from './Sidebar.js';
import { Toasts } from '../ui/Toasts.js';
import { Button, IconButton } from '../ui/Button.js';
import { HomeworkButton } from './HomeworkButton.js';
import { FeedButton } from './FeedButton.js';
import { music, RECOMMENDED_TRACKS, TRACKS } from '../../lib/music.js';
import { toggleTheme, useAuth, useUi } from '../../lib/store.js';
import { useCatalog } from '../../lib/store.js';
import { endpoints, type SearchResponse } from '../../lib/api.js';
import { useDebounced, useDismiss } from '../../lib/hooks.js';

/** Mini-lecteur de musique flottant, disponible sur toutes les pages. */
function QuickMusic() {
  const [, force] = useState(0);
  const [open, setOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const notify = useUi((state) => state.notify);
  const location = useLocation();

  useEffect(() => music.subscribe(() => force((n) => n + 1)), []);

  const track = music.track;
  const levels = useMemo(() => (music.playing ? music.levels() : []), [music.playing, force]);

  useEffect(() => {
    if (open) void music.probeRecommended();
  }, [open]);

  /*
   * 🔴 BUG CORRIGÉ : le panneau musique ne se fermait QUE par son bouton X ou
   * en recliquant sur Musique (effet toggle) — il restait « collé » sinon.
   * Désormais : clic/tap extérieur + touche Échap (useDismiss) + changement
   * de page ferment le panneau.
   */
  const dismissRef = useDismiss<HTMLDivElement>(open, () => setOpen(false));
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  return (
    <div style={{ position: 'relative' }} ref={dismissRef}>
      <button
        type="button"
        className="btn btn--soft btn--sm"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label="Musique de concentration"
        style={{ gap: 8 }}
      >
        <Headphones size={16} />
        {music.playing ? (
          <span className="visualizer" aria-hidden="true" style={{ height: 16 }}>
            {(levels.length ? levels : Array.from({ length: 6 }, () => 0.3)).slice(0, 6).map((level, index) => (
              <span
                key={index}
                style={{
                  height: `${Math.max(12, level * 100)}%`,
                  animationDelay: `${index * 90}ms`,
                  width: 3,
                }}
              />
            ))}
          </span>
        ) : (
          <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>Musique</span>
        )}
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.18 }}
            className="card"
            style={{
              position: 'absolute',
              right: 0,
              top: 'calc(100% + 10px)',
              width: 'min(330px, calc(100vw - 32px))',
              zIndex: 80,
              padding: 14,
              boxShadow: 'var(--ed-shadow-lg)',
            }}
            role="dialog"
            aria-label="Lecteur de musique"
          >
            <div className="ed-row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
              <strong style={{ fontFamily: 'var(--ed-font-display)' }}>Ambiances de travail</strong>
              <IconButton label="Fermer" size="sm" variant="ghost" onClick={() => setOpen(false)}>
                <X size={16} />
              </IconButton>
            </div>

            <div className="ed-row" style={{ gap: 10, marginBottom: 12 }}>
              <IconButton
                label={music.playing ? 'Pause' : 'Lecture'}
                variant="primary"
                onClick={() => music.toggle()}
              >
                {music.playing ? <Pause size={18} /> : <Play size={18} />}
              </IconButton>
              <div className="ed-grow">
                <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>
                  {track.emoji} {track.name}
                </div>
                <div style={{ fontSize: '0.76rem', color: 'var(--ed-text-mute)' }}>
                  {music.playing ? 'Lecture en cours…' : 'En pause'} · musique générée, libre de droit
                </div>
              </div>
              <IconButton label={muted ? 'Réactiver le son' : 'Couper le son'} size="sm" variant="ghost" onClick={() => {
                const next = !muted;
                setMuted(next);
                music.setVolume(next ? 0 : 0.5);
              }}>
                {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
              </IconButton>
            </div>

            <input
              className="range"
              type="range"
              min={0}
              max={100}
              value={Math.round(music.volume * 100)}
              aria-label="Volume"
              onChange={(event) => {
                const value = Number(event.target.value) / 100;
                setMuted(value === 0);
                music.setVolume(value);
              }}
            />

            <div style={{ display: 'grid', gap: 6, marginTop: 12 }}>
              {TRACKS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="track"
                  aria-pressed={music.trackId === item.id}
                  onClick={() => music.select(item.id)}
                  style={{ ['--track-a' as string]: item.colors[0], ['--track-b' as string]: item.colors[1] }}
                >
                  <span className="track__cover" aria-hidden="true">
                    {item.emoji}
                  </span>
                  <span className="ed-grow">
                    <span style={{ fontWeight: 700, fontSize: '0.88rem', display: 'block' }}>{item.name}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--ed-text-mute)' }}>{item.description}</span>
                  </span>
                </button>
              ))}
            </div>

            <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--ed-border)' }}>
              <span style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.09em', color: 'var(--ed-text-mute)' }}>
                RECOMMANDATION
              </span>
              {RECOMMENDED_TRACKS.map((rec) => {
                const available = music.isRecAvailable(rec.id);
                const playingRec = music.recId === rec.id && music.playing;
                return (
                  <div key={rec.id} className="ed-row" style={{ justifyContent: 'space-between', gap: 8, marginTop: 6 }}>
                    <span style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span aria-hidden="true">{rec.emoji}</span>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', fontWeight: 700, fontSize: '0.84rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {rec.title}
                        </span>
                        <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--ed-text-mute)' }}>{rec.artist}</span>
                      </span>
                    </span>
                    {available ? (
                      <IconButton
                        label={playingRec ? 'Mettre en pause la recommandation' : 'Écouter la recommandation'}
                        size="sm"
                        variant={playingRec ? 'primary' : 'soft'}
                        onClick={() => {
                          void music.toggleRecommended(rec.id).then((ok) => {
                            if (!ok) notify('Lecture impossible : fichier audio absent ou illisible.', 'warning');
                          });
                        }}
                      >
                        {playingRec ? <Pause size={15} /> : <Play size={15} />}
                      </IconButton>
                    ) : (
                      <Link to="/outils/musique" onClick={() => setOpen(false)}>
                        <Button size="sm" variant="soft">
                          Activer
                        </Button>
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>

            <Link to="/outils/musique" className="section__link" style={{ marginTop: 10, display: 'inline-flex' }} onClick={() => setOpen(false)}>
              Ouvrir le lecteur complet →
            </Link>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/**
 * Recherche rapide (barre du haut) : suggestions de sujets de quiz.
 *
 * Version 2.2 — fiabilisée et animée :
 *   - fermeture GARANTIE du panneau : clic/tap extérieur, perte de focus,
 *     touche Échap, navigation, défilement de la page, sélection d'un
 *     résultat, validation (plus aucun cas où l'affichage « reste bloqué ») ;
 *   - navigation clavier complète (↓ ↑ pour choisir, Entrée pour ouvrir,
 *     Échap pour fermer) avec surbrillance de l'entrée active ;
 *   - apparition en cascade des résultats, texte correspondant surligné,
 *     états « chargement » et « aucun résultat » soignés.
 */
function QuickSearch() {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResponse['items']>([]);
  const [active, setActive] = useState(-1);
  const debounced = useDebounced(query, 220);
  const navigate = useNavigate();
  const location = useLocation();
  const boxRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const blurTimer = useRef<number | undefined>(undefined);

  const trimmed = query.trim();
  const canShow = trimmed.length >= 2;

  /* Interrogation du catalogue, annulée proprement à chaque frappe. */
  useEffect(() => {
    if (!canShow) {
      setResults([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    endpoints
      .search({ q: debounced, limit: 7 })
      .then((response) => {
        if (cancelled) return;
        setResults(response.items);
        setLoading(false);
        setActive(-1);
      })
      .catch(() => {
        if (cancelled) return;
        setResults([]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, canShow]);

  const close = useCallback((clear = false): void => {
    setOpen(false);
    setActive(-1);
    if (clear) setQuery('');
  }, []);

  /* 1) Clic OU tap à l'extérieur du panneau. */
  useEffect(() => {
    const onDown = (event: Event): void => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) close();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [close]);

  /* 2) Toute navigation ferme le panneau (et rend la main à la page). */
  useEffect(() => {
    close();
  }, [location.pathname, location.search, close]);

  /* 3) Défiler la page ferme le panneau : il ne doit jamais flotter seul. */
  useEffect(() => {
    if (!open) return;
    const onScroll = (): void => close();
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    return () => window.removeEventListener('scroll', onScroll, true);
  }, [open, close]);

  /* 4) Perte de focus (Tabulation, clic ailleurs…) : fermeture différée de
        150 ms pour laisser le temps au clic sur un résultat d'aboutir. */
  const scheduleClose = useCallback((): void => {
    window.clearTimeout(blurTimer.current);
    blurTimer.current = window.setTimeout(() => close(), 150);
  }, [close]);
  const cancelClose = useCallback((): void => {
    window.clearTimeout(blurTimer.current);
  }, []);
  useEffect(() => () => window.clearTimeout(blurTimer.current), []);

  const openPanel = (): void => {
    cancelClose();
    if (canShow) setOpen(true);
  };

  const goTopic = (topicId: string): void => {
    close(true);
    inputRef.current?.blur();
    navigate(`/quiz/${topicId}`);
  };

  const submitAll = (): void => {
    if (!trimmed) return;
    close(true);
    inputRef.current?.blur();
    navigate(`/quiz?q=${encodeURIComponent(trimmed)}`);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!open || !results.length) {
        if (canShow) setOpen(true);
        return;
      }
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setActive((current) => {
        const next = current + delta;
        if (next < 0) return results.length - 1;
        if (next >= results.length) return 0;
        return next;
      });
      return;
    }
    if (event.key === 'Enter') {
      if (open && active >= 0 && results[active]) {
        event.preventDefault();
        goTopic(results[active].id);
      } else {
        submitAll();
      }
      return;
    }
    if (event.key === 'Escape') {
      // 1er appui : ferme le panneau ; 2e : vide le champ.
      if (open) {
        event.preventDefault();
        close();
      } else if (query) {
        setQuery('');
      }
      return;
    }
    if (event.key === 'Tab') close();
  };

  /** Entoure la partie du titre qui correspond à la recherche. */
  const highlight = (name: string): React.ReactNode => {
    const needle = trimmed.toLowerCase();
    const index = name.toLowerCase().indexOf(needle);
    if (index === -1 || !needle) return name;
    return (
      <>
        {name.slice(0, index)}
        <mark className="qs-mark">{name.slice(index, index + needle.length)}</mark>
        {name.slice(index + needle.length)}
      </>
    );
  };

  return (
    <div className="topbar__search qs-box" ref={boxRef}>
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          submitAll();
        }}
      >
        <label className="sr-only" htmlFor="quick-search">
          Rechercher un sujet de quiz
        </label>
        <span className={`qs-field${open && canShow ? ' qs-field--open' : ''}`}>
          <span className="qs-field__icon" aria-hidden="true">
            {loading && canShow ? <Loader2 size={17} className="qs-spin" /> : <Search size={17} />}
          </span>
          <input
            id="quick-search"
            ref={inputRef}
            className="qs-input"
            type="text"
            role="combobox"
            aria-expanded={open && canShow}
            aria-controls="quick-search-list"
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? `qs-opt-${active}` : undefined}
            placeholder="Rechercher un quiz, une matière, une notion…"
            value={query}
            autoComplete="off"
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(event.target.value.trim().length >= 2);
            }}
            onFocus={openPanel}
            onBlur={scheduleClose}
            onKeyDown={onKeyDown}
          />
          {query ? (
            <button
              type="button"
              className="qs-clear"
              aria-label="Effacer la recherche"
              onClick={() => {
                setQuery('');
                setOpen(false);
                inputRef.current?.focus();
              }}
            >
              <X size={14} />
            </button>
          ) : null}
        </span>
      </form>

      {/*
        ⚠️ Pas d'AnimatePresence ici : son mécanisme de « présence » (qui
        maintient le nœud le temps de l'animation de sortie) laissait un
        panneau fantôme à l'écran après une navigation (conflit avec le
        Suspense des routes paresseuses). Un montage/démontage synchrone +
        animation d'ENTRÉE seule : la fermeture est instantanée et garantie.
      */}
      {open && canShow ? (
        <motion.div
          id="quick-search-list"
          role="listbox"
          aria-label="Résultats de recherche"
          className="qs-panel"
          initial={{ opacity: 0, y: -10, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            /* Le panneau garde le focus au champ : sans cela, le mousedown
               sur un résultat fermerait tout avant le click (blur → close). */
            onMouseDown={(event) => event.preventDefault()}
          >
            <div className="qs-panel__head">
              <span>
                {loading ? 'Recherche en cours…' : `${results.length} sujet${results.length > 1 ? 's' : ''} trouvé${results.length > 1 ? 's' : ''}`}
              </span>
              <span className="qs-panel__hint">
                <kbd>↓↑</kbd> choisir · <kbd>Entrée</kbd> ouvrir · <kbd>Échap</kbd> fermer
              </span>
            </div>

            {loading && results.length === 0 ? (
              <div className="qs-skeletons" aria-hidden="true">
                <div className="skeleton" style={{ height: 44 }} />
                <div className="skeleton" style={{ height: 44 }} />
                <div className="skeleton" style={{ height: 44 }} />
              </div>
            ) : results.length === 0 ? (
              <div className="qs-empty">
                <SearchX size={22} aria-hidden="true" />
                <p>
                  Aucun sujet pour « {trimmed} ».
                  <br />
                  <span className="ed-mute">Appuie sur Entrée pour chercher partout dans le catalogue.</span>
                </p>
              </div>
            ) : (
              <ul className="qs-list">
                {results.map((topic, index) => (
                  <motion.li
                    key={topic.id}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.22, delay: index * 0.035, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <button
                      type="button"
                      role="option"
                      id={`qs-opt-${index}`}
                      aria-selected={index === active}
                      className={`qs-item${index === active ? ' qs-item--active' : ''}`}
                      style={{ ['--qs-color' as string]: topic.color }}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => goTopic(topic.id)}
                    >
                      <span className="qs-item__icon" aria-hidden="true">
                        {topic.emoji}
                      </span>
                      <span className="qs-item__body">
                        <span className="qs-item__title">{highlight(topic.name)}</span>
                        <span className="qs-item__meta">
                          {topic.subjectName} · {topic.levelName} · {topic.themeName}
                        </span>
                      </span>
                      <span className="qs-item__go" aria-hidden="true">
                        <ArrowRight size={15} />
                      </span>
                    </button>
                  </motion.li>
                ))}
              </ul>
            )}

          <button type="button" className="qs-footer" onClick={submitAll}>
            Voir tous les résultats pour « {trimmed} »
            <ArrowRight size={14} aria-hidden="true" />
          </button>
        </motion.div>
      ) : null}
    </div>
  );
}

/** Barre supérieure : menu mobile, recherche, musique, thème. */
function Topbar() {
  const setSidebar = useUi((state) => state.setSidebar);
  const theme = useAuth((state) => state.user?.preferences.theme) ?? 'clair';

  return (
    <header className="topbar">
      <IconButton label="Ouvrir le menu" className="hamburger" onClick={() => setSidebar(true)} variant="ghost">
        <Menu size={21} />
      </IconButton>
      <QuickSearch />
      <div className="topbar__actions">
        {/*
          Ordre voulu : Fil (nouveautés, badge rouge) puis Devoirs puis Musique.
          Le Fil est à gauche car son badge attire l'œil : le placer en premier
          évite qu'il ne soit masqué par les autres boutons sur petit écran.
        */}
        <FeedButton />
        <HomeworkButton />
        <QuickMusic />
        <IconButton label="Changer de thème" onClick={toggleTheme} variant="ghost">
          {theme === 'sombre' ? <Sun size={18} /> : <Moon size={18} />}
        </IconButton>
      </div>
      <ScrollProgress />
    </header>
  );
}

/** Coquille applicative : sidebar + barre haute + page animée. */
export function AppShell() {
  const location = useLocation();
  const loadCatalog = useCatalog((state) => state.load);
  const setSidebar = useUi((state) => state.setSidebar);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  // Remonte en haut de page à chaque navigation et ferme le menu mobile.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
    setSidebar(false);
  }, [location.pathname, setSidebar]);

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main">
        <Topbar />
        {/*
          🔴 Pas d'`AnimatePresence mode="wait"` ici.
          Avec ce mode, framer-motion bloque le montage de la nouvelle page
          jusqu'à la fin de l'animation de sortie de l'ancienne. Si cette
          animation est interrompue — navigation rapide, onglet mis en
          arrière-plan, `prefers-reduced-motion`, ou composant qui se démonte
          pendant la transition — `onExitComplete` ne part jamais et la nouvelle
          page n'est JAMAIS montée : l'élève se retrouve devant un écran vide,
          sans erreur ni moyen de comprendre. Le calendrier a déjà été durci de
          la même façon ; la coquille était le dernier endroit à risque.

          🔴 v3.0 : l'entrée glissée est désormais une animation CSS
          (`.page-enter` dans styles/glass.css) sur un `<main>` clé par route,
          et non un `motion.main`. Raison : framer-motion laisse un
          `transform: translateY(0px)` résiduel en style inline après
          l'animation — or un ancestor transformé crée un « backdrop root »
          qui COUPE le backdrop-filter de toutes les cartes de la page (le
          verre ne flouterait plus le fond vivant). Les keyframes CSS se
          terminent sur `transform: none` : aucun résidu, même rendu visuel.
        */}
        <main key={location.pathname} className="page page-enter">
          <Outlet />
        </main>
      </div>
      <Toasts />
    </div>
  );
}
