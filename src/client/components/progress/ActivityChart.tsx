import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { sfx } from '../../lib/sfx.js';
import { usePrefersReducedMotion } from '../../lib/hooks.js';

/** Un jour du graphique d'activité. */
export interface ActivityPoint {
  /** Étiquette courte affichée sous l'axe (ex. « 12/05 »). */
  label: string;
  /** Date ISO complète, pour l'info-bulle et les lecteurs d'écran. */
  date: string;
  /** Taux de réussite, 0 → 1. */
  rate: number;
  /** Nombre de questions traitées ce jour-là. */
  volume: number;
}

interface ActivityChartProps {
  data: ActivityPoint[];
  /** Hauteur du tracé, en pixels. */
  height?: number;
  /** Notifie le parent quand le jour survolé change (info-bulle externe, tests). */
  onActiveChange?: (index: number | null) => void;
}

interface Point {
  x: number;
  y: number;
}

/*
 * Marges du tracé. Assez larges pour que le halo du point actif (rayon 12
 * animé jusqu'à ×1.5) et le flou du filtre « glow » (stdDeviation 4.5, donc
 * ~14 px de diffusion) tiennent DANS le cadre du SVG : celui-ci est cadré
 * (`overflow: hidden`) pour ne pas créer de débordement horizontal de page.
 */
const PADDING = { top: 26, right: 26, bottom: 30, left: 42 };
/** Largeur utilisée tant que la mesure réelle n'est pas disponible (SSR, jsdom). */
const FALLBACK_WIDTH = 720;
const GRAD_STEPS = [0, 25, 50, 75, 100];

/**
 * Mesure la largeur réelle d'un élément, en suivant les redimensionnements.
 *
 * Indispensable ici : un SVG en `viewBox` fixe serait mis à l'échelle, et le
 * texte des axes deviendrait illisible sur grand écran (ou énorme sur mobile).
 * On dessine donc en VRAIS pixels. Repli sur une largeur par défaut quand
 * `ResizeObserver` n'existe pas (jsdom ancien, tests) pour ne jamais planter.
 */
export function useElementWidth<T extends HTMLElement>(fallback = FALLBACK_WIDTH) {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = (): void => {
      const next = node.getBoundingClientRect().width;
      if (next > 0) setWidth(Math.round(next));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}

/**
 * Chemin cubique MONOTONE (Fritsch–Carlson) passant par tous les points.
 *
 * Pourquoi pas un simple lissage de Catmull-Rom ? Parce qu'il dépasse les
 * extrema : sur un taux de réussite, la courbe pourrait descendre sous 0 % ou
 * monter au-dessus de 100 % entre deux jours, ce qui est faux ET visible. Le
 * cubique monotone garantit que la courbe reste entre les valeurs réelles —
 * aucune overshoot, donc aucune lecture erronée.
 */
export function monotonePath(points: Point[]): string {
  const n = points.length;
  if (n === 0) return '';
  if (n === 1) return `M ${points[0].x} ${points[0].y}`;
  if (n === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;

  const dx: number[] = [];
  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    const h = points[i + 1].x - points[i].x;
    dx.push(h || 1e-6);
    slopes.push((points[i + 1].y - points[i].y) / (h || 1e-6));
  }

  const tangents: number[] = [slopes[0]];
  for (let i = 1; i < n - 1; i += 1) {
    const before = slopes[i - 1];
    const after = slopes[i];
    if (before * after <= 0) {
      tangents.push(0); // extremum local : tangente horizontale, pas de dépassement
    } else {
      const w1 = 2 * dx[i] + dx[i - 1];
      const w2 = dx[i] + 2 * dx[i - 1];
      tangents.push((w1 + w2) / (w1 / before + w2 / after));
    }
  }
  tangents.push(slopes[n - 2]);

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < n - 1; i += 1) {
    const step = dx[i] / 3;
    path +=
      ` C ${points[i].x + step} ${points[i].y + tangents[i] * step},` +
      ` ${points[i + 1].x - step} ${points[i + 1].y - tangents[i + 1] * step},` +
      ` ${points[i + 1].x} ${points[i + 1].y}`;
  }
  return path;
}

/** Couleur du jour selon le taux de réussite (vert / ambre / rouge). */
export function rateColor(rate: number, hasVolume: boolean): string {
  if (!hasVolume) return 'var(--ed-border-strong, rgba(124,92,246,.3))';
  if (rate >= 0.7) return '#16a34a';
  if (rate >= 0.4) return '#f59e0b';
  return '#e11d48';
}

/** Formate une date ISO en « lundi 12 mai » (info-bulle + accessibilité). */
export function longDateLabel(isoDate: string): string {
  const parsed = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  try {
    return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(parsed);
  } catch {
    return isoDate;
  }
}

/**
 * Graphique d'activité : barres de volume + courbe de réussite.
 *
 * Entièrement en SVG maison, **sans bibliothèque** : Recharts pesait 413 ko dans
 * ce seul chunk et imposait son style (info-bulles génériques, aucune animation
 * contrôlable, pas d'accès aux événements par colonne).
 *
 * Ce que le surclassement apporte :
 *   - **sonification** : chaque colonne survolée joue une note dont la hauteur
 *     suit le taux de réussite (échelle pentatonique, donc toujours consonante).
 *     Balayer le graphique de gauche à droite produit une montée mélodique ;
 *   - **navigation clavier** : flèches, Début/Fin, et annonce `aria-live` — le
 *     graphique n'est plus réservé à la souris ;
 *   - **tableau équivalent** pour les lecteurs d'écran (masqué visuellement) ;
 *   - animation d'entrée : barres qui poussent en cascade, courbe qui se trace ;
 *   - repli complet si les animations sont coupées (tout s'affiche à l'état final).
 */
export function ActivityChart({ data, height = 268, onActiveChange }: ActivityChartProps) {
  const reduced = usePrefersReducedMotion();
  const [containerRef, width] = useElementWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const uid = useId().replace(/:/g, '');
  const announceRef = useRef<HTMLParagraphElement | null>(null);

  const points = data.length;
  const innerWidth = Math.max(120, width - PADDING.left - PADDING.right);
  const innerHeight = Math.max(80, height - PADDING.top - PADDING.bottom);
  const baseY = PADDING.top + innerHeight;
  const stepX = points > 1 ? innerWidth / (points - 1) : innerWidth;
  const barWidth = Math.max(4, Math.min(30, stepX * 0.52));
  const maxVolume = Math.max(1, ...data.map((item) => item.volume));

  const xAt = useCallback(
    (index: number): number => (points > 1 ? PADDING.left + index * stepX : PADDING.left + innerWidth / 2),
    [innerWidth, points, stepX],
  );
  const yAt = useCallback((rate: number): number => PADDING.top + innerHeight * (1 - Math.min(1, Math.max(0, rate))), [innerHeight]);

  /*
   * 🔴 Honnêteté des données : la courbe ne passe QUE par les jours où des
   * questions ont été traitées.
   *
   * Tracer un point à 0 % un jour sans activité racontait une fausse histoire :
   * « ce jour-là tu as tout raté », alors qu'aucun quiz n'a été joué. Le creux
   * artificiel déformait en plus la lecture de la tendance (deux vallées par
   * semaine de repos). Ici la ligne « saute » les jours vides — les barres,
   * elles, restent à zéro et signalent visuellement l'absence.
   */
  const activeDays = useMemo(
    () => data.map((item, index) => ({ item, index })).filter(({ item }) => item.volume > 0),
    [data],
  );
  const linePoints = useMemo<Point[]>(
    () => activeDays.map(({ item, index }) => ({ x: xAt(index), y: yAt(item.rate) })),
    [activeDays, xAt, yAt],
  );
  const linePath = useMemo(() => monotonePath(linePoints), [linePoints]);
  const areaPath = useMemo(() => {
    if (!linePath || points === 0) return '';
    const firstX = xAt(0);
    const lastX = xAt(points - 1);
    return `${linePath} L ${lastX} ${baseY} L ${firstX} ${baseY} Z`;
  }, [baseY, linePath, points, xAt]);

  /**
   * Étiquettes d'axe espacées pour ne jamais se chevaucher, SANS en coller deux
   * à droite : la dernière n'est ajoutée que si elle est assez loin de la
   * précédente (sinon « 10/18 10/19 » se touchaient).
   */
  const shownLabels = useMemo(() => {
    const every = Math.max(1, Math.ceil(points / Math.max(3, Math.floor(innerWidth / 58))));
    const list: number[] = [];
    for (let i = 0; i < points; i += every) list.push(i);
    const lastShown = list[list.length - 1] ?? -1;
    if (points - 1 - lastShown >= Math.max(2, Math.ceil(every * 0.75))) list.push(points - 1);
    return list;
  }, [innerWidth, points]);

  const select = useCallback(
    (index: number | null, announceIt: boolean): void => {
      setActive(index);
      onActiveChange?.(index);
      if (index === null || !data[index]) return;
      const item = data[index];
      // 🔊 La hauteur suit le taux de réussite : c'est ce qui transforme un
      // simple survol en mélodie, et ce qui rend le graphique « jouable ».
      sfx.hover(item.volume > 0 ? item.rate : 0.02);
      if (announceIt && announceRef.current) {
        announceRef.current.textContent =
          item.volume > 0
            ? `${longDateLabel(item.date)} : ${item.volume} question${item.volume > 1 ? 's' : ''}, ${Math.round(item.rate * 100)} % de réussite.`
            : `${longDateLabel(item.date)} : aucune activité.`;
      }
    },
    [data, onActiveChange],
  );

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (points === 0) return;
    const current = active ?? -1;
    let next: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = Math.min(points - 1, current + 1);
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = Math.max(0, current - 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = points - 1;
    else if (event.key === 'Escape') next = null;
    else return;
    event.preventDefault();
    select(next, true);
  };

  const activeItem = active !== null ? data[active] : null;
  const tooltipX = active !== null ? Math.min(Math.max(xAt(active), 74), width - 74) : 0;
  const tooltipY = active !== null ? Math.max(yAt(data[active].rate), PADDING.top + 52) : 0;

  if (points === 0) {
    return (
      <p className="ed-small ed-mute" style={{ padding: '32px 0', textAlign: 'center' }}>
        Aucune activité sur la période choisie.
      </p>
    );
  }

  return (
    <div className="pchart" ref={containerRef}>
      {/* Annonce pour les lecteurs d'écran (navigation clavier). */}
      <p ref={announceRef} className="pchart__announce" aria-live="polite" />

      <div
        className="pchart__surface"
        tabIndex={0}
        role="img"
        aria-label={`Graphique d'activité sur ${points} jours : barres de volume et courbe du taux de réussite. Utilise les flèches du clavier pour parcourir les jours.`}
        onKeyDown={onKeyDown}
        onMouseLeave={() => select(null, false)}
        onBlur={() => select(null, false)}
      >
        <svg className="pchart__svg" width={width} height={height} aria-hidden="true" focusable="false">
          <defs>
            <linearGradient id={`pchart-area-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--ed-primary, #6c5ce7)" stopOpacity="0.42" />
              <stop offset="55%" stopColor="var(--ed-primary, #6c5ce7)" stopOpacity="0.12" />
              <stop offset="100%" stopColor="var(--ed-primary, #6c5ce7)" stopOpacity="0" />
            </linearGradient>
            <linearGradient id={`pchart-line-${uid}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#8b5cf6" />
              <stop offset="50%" stopColor="#6c5ce7" />
              <stop offset="100%" stopColor="#22d3ee" />
            </linearGradient>
            <filter id={`pchart-glow-${uid}`} x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="4.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Grille + axe des ordonnées */}
          {GRAD_STEPS.map((percent) => {
            const y = yAt(percent / 100);
            return (
              <g key={percent}>
                <line
                  x1={PADDING.left}
                  x2={width - PADDING.right}
                  y1={y}
                  y2={y}
                  stroke="var(--ed-border, rgba(124,92,246,.16))"
                  strokeWidth={percent === 0 ? 1.4 : 1}
                  strokeDasharray={percent === 0 ? undefined : '3 5'}
                />
                <text className="pchart__tick" x={PADDING.left - 9} y={y + 3.5} textAnchor="end">
                  {percent}
                </text>
              </g>
            );
          })}

          {/* Barres de volume */}
          {data.map((item, index) => {
            const barHeight = (item.volume / maxVolume) * innerHeight * 0.62;
            const x = xAt(index) - barWidth / 2;
            const y = baseY - barHeight;
            const isActive = active === index;
            const color = rateColor(item.rate, item.volume > 0);
            return (
              <motion.rect
                key={item.date}
                x={x}
                y={y}
                width={barWidth}
                height={Math.max(item.volume > 0 ? 2 : 0, barHeight)}
                rx={Math.min(6, barWidth / 2)}
                fill={color}
                className="pchart__bar"
                style={{ transformBox: 'fill-box', transformOrigin: 'bottom' }}
                initial={reduced ? false : { scaleY: 0, opacity: 0 }}
                animate={{ scaleY: 1, opacity: isActive ? 0.95 : item.volume > 0 ? 0.42 : 0.16 }}
                transition={
                  reduced
                    ? { duration: 0 }
                    : { type: 'spring', stiffness: 210, damping: 22, delay: Math.min(index * 0.022, 0.5) }
                }
              />
            );
          })}

          {/* Aire sous la courbe */}
          {areaPath ? (
            <motion.path
              d={areaPath}
              fill={`url(#pchart-area-${uid})`}
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: reduced ? 0 : 0.7, delay: reduced ? 0 : 0.25 }}
            />
          ) : null}

          {/* Courbe de réussite */}
          <motion.path
            d={linePath}
            fill="none"
            stroke={`url(#pchart-line-${uid})`}
            strokeWidth={2.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            filter={`url(#pchart-glow-${uid})`}
            initial={reduced ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={reduced ? { duration: 0 } : { duration: 1.15, ease: [0.22, 1, 0.36, 1] }}
          />

          {/* Repère vertical + points */}
          <AnimatePresence>
            {active !== null ? (
              <motion.line
                key="crosshair"
                x1={xAt(active)}
                x2={xAt(active)}
                y1={PADDING.top - 6}
                y2={baseY}
                stroke="var(--ed-primary, #6c5ce7)"
                strokeWidth={1.2}
                strokeDasharray="4 4"
                initial={reduced ? false : { opacity: 0 }}
                animate={{ opacity: 0.55 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              />
            ) : null}
          </AnimatePresence>

          {activeDays.map(({ item, index }, pointIndex) => {
            const point = linePoints[pointIndex];
            if (!point) return null;
            const isActive = active === index;
            return (
              <g key={item.date}>
                <motion.circle
                  cx={point.x}
                  cy={point.y}
                  r={isActive ? 6.5 : 3.2}
                  fill={isActive ? '#fff' : 'var(--ed-surface-solid, #fff)'}
                  stroke={rateColor(item.rate, item.volume > 0)}
                  strokeWidth={isActive ? 3.4 : 2.2}
                  initial={reduced ? false : { scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: item.volume > 0 ? 1 : 0.35 }}
                  transition={
                    reduced
                      ? { duration: 0 }
                      : { type: 'spring', stiffness: 340, damping: 20, delay: 0.35 + Math.min(index * 0.02, 0.45) }
                  }
                  style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
                />
                {isActive && !reduced ? (
                  <motion.circle
                    cx={point.x}
                    cy={point.y}
                    r={12}
                    fill="none"
                    stroke={rateColor(item.rate, item.volume > 0)}
                    strokeWidth={2}
                    initial={{ scale: 0.4, opacity: 0.7 }}
                    animate={{ scale: 1.5, opacity: 0 }}
                    transition={{ duration: 1.1, repeat: Infinity, ease: 'easeOut' }}
                    style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
                  />
                ) : null}
              </g>
            );
          })}

          {/* Axe des abscisses */}
          {data.map((item, index) =>
            shownLabels.includes(index) ? (
              <text
                key={item.date}
                className={`pchart__tick${active === index ? ' pchart__tick--active' : ''}`}
                x={xAt(index)}
                y={height - 9}
                textAnchor="middle"
              >
                {item.label}
              </text>
            ) : null,
          )}

          {/* Zones de survol : une par jour, invisibles, couvrant toute la hauteur.
              Placées EN DERNIER pour capter la souris au-dessus du tracé. */}
          {data.map((item, index) => (
            <rect
              key={`hit-${item.date}`}
              x={xAt(index) - stepX / 2}
              y={0}
              width={stepX}
              height={height}
              fill="transparent"
              onMouseEnter={() => select(index, false)}
              onFocus={() => select(index, true)}
              tabIndex={-1}
              aria-hidden="true"
            />
          ))}
        </svg>

        {/* Info-bulle « verre » qui suit le point actif */}
        <AnimatePresence>
          {activeItem && active !== null ? (
            <motion.div
              key="tooltip"
              className="pchart__tooltip"
              style={{ left: tooltipX, top: tooltipY }}
              initial={reduced ? false : { opacity: 0, y: 8, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduced ? undefined : { opacity: 0, y: 6, scale: 0.96 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            >
              <span className="pchart__tooltip-date">{longDateLabel(activeItem.date)}</span>
              {activeItem.volume > 0 ? (
                <span className="pchart__tooltip-row">
                  <em style={{ background: rateColor(activeItem.rate, true) }} aria-hidden="true" />
                  Réussite
                  <strong>{Math.round(activeItem.rate * 100)} %</strong>
                </span>
              ) : (
                <span className="pchart__tooltip-row">
                  <em style={{ background: 'var(--ed-border-strong)' }} aria-hidden="true" />
                  Pas d’activité ce jour-là
                  <strong />
                </span>
              )}
              <span className="pchart__tooltip-row">
                <em className="pchart__tooltip-dot" aria-hidden="true" />
                Questions
                <strong>{activeItem.volume}</strong>
              </span>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="pchart__legend">
        <span>
          <i className="pchart__swatch pchart__swatch--line" aria-hidden="true" /> Taux de réussite
        </span>
        <span>
          <i className="pchart__swatch pchart__swatch--bar" aria-hidden="true" /> Volume de questions
        </span>
        <span className="pchart__hint">
          Survole (ou flèches ◀ ▶ au clavier) — le son monte avec la réussite
        </span>
      </div>

      {/*
        Équivalent textuel pour les lecteurs d'écran : le SVG est aria-hidden.

        🔴 Le masquage est porté par une <div> ENVELOPPE, pas par le <table>.
        La technique classique (`position:absolute; width:1px; overflow:hidden`)
        échoue sur un tableau : en CSS, `width` n'est pour une table qu'une
        largeur PRÉFÉRÉE, jamais inférieure au min-content. Le tableau mesurait
        donc 364 px de large au lieu de 1 px, et comme il est absolument
        positionné, il élargissait la zone de scroll de toute la page — 8 px de
        débordement horizontal sur mobile. Une <div> bloc à 1 px, elle, ne
        grossit pas : le tableau déborde à l'intérieur, `overflow: hidden` le
        rogne, et les lecteurs d'écran continuent de le lire normalement.
      */}
      <div className="pchart__sr">
      <table>
        <caption>Activité quotidienne</caption>
        <thead>
          <tr>
            <th scope="col">Jour</th>
            <th scope="col">Questions</th>
            <th scope="col">Réussite</th>
          </tr>
        </thead>
        <tbody>
          {data.map((item) => (
            <tr key={item.date}>
              <th scope="row">{longDateLabel(item.date)}</th>
              <td>{item.volume}</td>
              <td>{Math.round(item.rate * 100)} %</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
