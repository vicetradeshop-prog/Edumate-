import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, BookOpen, BookOpenText, Pause } from 'lucide-react';
import { Card, CardTitle } from '../ui/Card.js';
import { Badge } from '../ui/Badge.js';
import { Button } from '../ui/Button.js';
import { softColor } from '../../lib/format.js';

/** Sujet à réviser, tel que renvoyé par `/api/progress/stats` (`toReview`). */
export interface RevisionSuggestion {
  topicId: string;
  name: string;
  subjectName: string;
  themeName: string;
  emoji: string;
  color: string;
}

/** Vitesse du défilement automatique : secondes par leçon. */
const SECONDS_PER_ITEM = 3.4;
/** Espace entre deux leçons (doit correspondre au `gap` CSS de la piste). */
const TRACK_GAP_PX = 6;

/**
 * Carte « À réviser » du tableau de bord — version « carrousel doux ».
 *
 * Objectifs (retours utilisateur) :
 *   1. Plus rien ne SORT du cadre : la liste vit dans une fenêtre à hauteur
 *      bornée et `min-width: 0` est posé à chaque niveau (grille + flex), les
 *      titres longs sont tronqués proprement avec des points de suspension.
 *   2. Le bas de la carte s'aligne avec celui de « Derniers quiz » : la carte
 *      est étirée par la colonne (`.dash-split`) et la fenêtre de défilement
 *      absorbe la hauteur restante (`flex: 1`).
 *   3. Les leçons DÉFILENT doucement de haut en bas (boucle continue et sans
 *      couture, pause au survol ou au focus) : toutes les leçons à réviser
 *      sont visibles sans occuper toute la page. S'il y a peu de leçons (tout
 *      tient dans la fenêtre), aucune animation : la liste est affichée telle
 *      quelle.
 *   4. Accessibilité : `prefers-reduced-motion` et le réglage compte
 *      « animations désactivées » coupent le défilement automatique — la liste
 *      redevient scrollable manuellement. La copie de la liste (nécessaire à
 *      la boucle) est masquée aux lecteurs d'écran et hors de la Tabulation.
 *
 * Les données viennent de `ProgressStats.toReview` déjà chargé par la page :
 * aucun appel réseau supplémentaire.
 */
export function RevisionCard({ items, loading }: { items: RevisionSuggestion[]; loading: boolean }) {
  const visible = items.slice(0, 10);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const groupRef = useRef<HTMLDivElement | null>(null);
  const [loopPx, setLoopPx] = useState(0);
  const [needsScroll, setNeedsScroll] = useState(false);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  /* Animations réduites : préférence système OU réglage du compte. */
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = (): void => {
      setReducedMotion(query.matches || document.documentElement.dataset.animations === 'off');
    };
    update();
    query.addEventListener?.('change', update);
    const observer = typeof MutationObserver !== 'undefined' ? new MutationObserver(update) : null;
    observer?.observe(document.documentElement, { attributes: true, attributeFilter: ['data-animations'] });
    return () => {
      query.removeEventListener?.('change', update);
      observer?.disconnect();
    };
  }, []);

  /*
   * Mesure : le défilement n'a de sens que si la liste dépasse la fenêtre.
   * `loopPx` est la distance exacte d'un tour (hauteur du groupe + l'espace
   * qui le suit) : la boucle est ainsi parfaitement sans couture, au pixel.
   */
  useEffect(() => {
    const viewport = viewportRef.current;
    const group = groupRef.current;
    if (!viewport || !group) return;
    const measure = (): void => {
      const overflow = group.scrollHeight > viewport.clientHeight + 4;
      setNeedsScroll(overflow);
      setLoopPx(overflow ? group.scrollHeight + TRACK_GAP_PX : 0);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(group);
    return () => observer.disconnect();
  }, [visible.length, loading]);

  const animate = needsScroll && !reducedMotion && loopPx > 0;
  const duration = Math.max(12, visible.length * SECONDS_PER_ITEM);

  const rows = (duplicate: boolean): React.ReactNode =>
    visible.map((item, index) => (
      <motion.div
        key={`${item.topicId}${duplicate ? '-copy' : ''}`}
        initial={duplicate ? false : { opacity: 0, x: -6 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.22, delay: duplicate ? 0 : Math.min(index * 0.04, 0.24) }}
      >
        <Link
          to={`/quiz/${encodeURIComponent(item.topicId)}/revision`}
          className="list-item revision-row"
          tabIndex={duplicate ? -1 : undefined}
          aria-hidden={duplicate ? true : undefined}
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
          <Badge tone="warning">Réviser</Badge>
        </Link>
      </motion.div>
    ));

  return (
    <Card className="revision-card">
      <div className="section__head" style={{ marginBottom: 10 }}>
        <CardTitle icon={<BookOpenText size={17} />}>À réviser</CardTitle>
        <Link to="/lecons" className="section__link">
          Leçons <ArrowRight size={14} />
        </Link>
      </div>

      {loading ? (
        <div className="ed-stack" style={{ gap: 6 }} aria-hidden="true">
          <div className="skeleton" style={{ height: 46 }} />
          <div className="skeleton" style={{ height: 46 }} />
          <div className="skeleton" style={{ height: 46 }} />
        </div>
      ) : visible.length === 0 ? (
        <div className="revision-card__fill">
          <div className="revision-card__empty">
            <p className="ed-small ed-mute" style={{ marginBottom: 12 }}>
              Rien à rattraper pour l’instant : tes derniers quiz sont solides 👌 Joue un quiz et les sujets fragiles
              apparaîtront ici.
            </p>
            <Link to="/lecons">
              <Button variant="soft" size="sm" icon={<BookOpen size={15} />}>
                Ouvrir une leçon
              </Button>
            </Link>
          </div>
        </div>
      ) : (
        <div className="revision-card__fill">
          <div
            className={`revision-viewport${animate ? ' revision-viewport--fade' : ''}${
              !animate && needsScroll ? ' revision-viewport--manual' : ''
            }`}
            ref={viewportRef}
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onFocusCapture={() => setPaused(true)}
            onBlurCapture={() => setPaused(false)}
          >
            <div
              className={`revision-track${animate ? ' revision-track--rolling' : ''}`}
              style={
                animate
                  ? ({
                      '--revision-loop': `${loopPx}px`,
                      animationDuration: `${duration}s`,
                      animationPlayState: paused ? 'paused' : 'running',
                    } as React.CSSProperties)
                  : undefined
              }
            >
              <div className="revision-group" ref={groupRef}>
                {rows(false)}
              </div>
              {/* Copie pour la boucle sans couture (hors accessibilité). */}
              {animate ? <div className="revision-group">{rows(true)}</div> : null}
            </div>
          </div>

          <div className="revision-card__foot">
            {animate ? (
              <span className="ed-small ed-mute revision-card__note">
                <Pause size={11} style={{ verticalAlign: '-1px', marginRight: 4 }} />
                Survol = pause
              </span>
            ) : (
              <span />
            )}
            {items.length > visible.length ? (
              <span className="ed-small ed-mute">
                + {items.length - visible.length} autres —{' '}
                <Link to="/progression" className="section__link">
                  tout voir
                </Link>
              </span>
            ) : null}
          </div>
        </div>
      )}
    </Card>
  );
}
