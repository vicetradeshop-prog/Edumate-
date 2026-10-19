import { useCallback, useId, useState } from 'react';
import { motion } from 'framer-motion';
import { sfx } from '../../lib/sfx.js';
import { useCountUp, usePrefersReducedMotion } from '../../lib/hooks.js';

/** Une matière, telle que produite par `/api/progress/stats`. */
export interface SubjectSlice {
  id: string;
  name: string;
  emoji: string;
  /** Couleur de la matière (fournée par le catalogue). */
  color: string;
  /** Questions traitées. */
  volume: number;
  /** Taux de réussite, 0 → 1. */
  rate: number;
}

interface SubjectDonutProps {
  data: SubjectSlice[];
  size?: number;
}

/** Épaisseur de l'anneau au repos, et au survol. */
const RING = 22;
const RING_ACTIVE = 30;
/** Espace angulaire entre deux segments, en unités de circonférence. */
const GAP = 2.5;

/**
 * Anneau de répartition du travail par matière.
 *
 * Remplace le camembert Recharts : ici le centre de l'anneau sert de zone de
 * lecture (matière survolée, volume, réussite), l'anneau se dessine dans le sens
 * horaire au chargement, le segment survolé s'épaissit pendant que les autres
 * s'estompent, et **chaque changement de matière joue une note** dont la hauteur
 * suit le taux de réussite — le même principe que le graphique d'activité, donc
 * les deux vues « sonnent » de façon cohérente.
 *
 * Accessibilité : anneau `aria-hidden` + liste réelle en dessous (chaque ligne
 * est un bouton focusable qui déclenche exactement le même retour que la souris).
 */
export function SubjectDonut({ data, size = 232 }: SubjectDonutProps) {
  const reduced = usePrefersReducedMotion();
  const uid = useId().replace(/:/g, '');
  const [active, setActive] = useState<string | null>(null);

  // Progression 0 → 1 du tracé : `useCountUp` renvoie directement la valeur
  // finale quand les animations sont coupées, donc aucun cas particulier.
  const progress = useCountUp(1, reduced ? 0 : 1150);

  const radius = (size - RING_ACTIVE - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  const total = data.reduce((sum, item) => sum + item.volume, 0);
  const activeItem = data.find((item) => item.id === active) ?? null;

  /* Longueurs et décalages cumulés, calculés une fois. */
  const segments = (() => {
    let offset = 0;
    return data.map((item) => {
      const share = total > 0 ? item.volume / total : 0;
      const raw = share * circumference;
      const length = Math.max(0, raw - (data.length > 1 && raw > GAP * 2 ? GAP : 0));
      const segment = { item, offset, length, share };
      offset += raw;
      return segment;
    });
  })();

  const focus = useCallback(
    (id: string | null): void => {
      setActive(id);
      if (!id) return;
      const item = data.find((entry) => entry.id === id);
      if (item) sfx.hover(item.rate);
    },
    [data],
  );

  if (data.length === 0 || total === 0) {
    return <p className="ed-small ed-mute">Pas encore de matière travaillée.</p>;
  }

  return (
    <div className="donut">
      <div className="donut__figure" style={{ width: size, height: size }}>
        <svg width={size} height={size} aria-hidden="true" focusable="false">
          <defs>
            <filter id={`donut-glow-${uid}`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Piste de fond : donne l'épaisseur même avant le tracé. */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="var(--ed-surface-3, rgba(238,234,255,.72))"
            strokeWidth={RING}
          />

          <g transform={`rotate(-90 ${center} ${center})`}>
            {segments.map(({ item, offset, length }) => {
              if (length <= 0) return null;
              // Révélation progressive : la partie déjà « dessinée » de ce
              // segment, compte tenu de l'avancement global du tracé.
              const drawn = Math.max(0, Math.min(length, progress * circumference - offset));
              if (drawn <= 0) return null;
              const isActive = active === item.id;
              const dimmed = active !== null && !isActive;
              return (
                <circle
                  key={item.id}
                  cx={center}
                  cy={center}
                  r={radius}
                  fill="none"
                  stroke={item.color}
                  strokeWidth={isActive ? RING_ACTIVE : RING}
                  strokeDasharray={`${drawn} ${circumference - drawn}`}
                  strokeDashoffset={-offset}
                  strokeLinecap="butt"
                  filter={isActive ? `url(#donut-glow-${uid})` : undefined}
                  className="donut__segment"
                  style={{ opacity: dimmed ? 0.28 : 1 }}
                  onMouseEnter={() => focus(item.id)}
                />
              );
            })}
          </g>
        </svg>

        {/* Zone centrale : lecture de la matière active. */}
        <div className="donut__center">
          {activeItem ? (
            <motion.div
              key={activeItem.id}
              className="donut__readout"
              initial={reduced ? false : { opacity: 0, y: 6, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            >
              <span className="donut__emoji" aria-hidden="true">
                {activeItem.emoji}
              </span>
              <strong className="donut__name">{activeItem.name}</strong>
              <span className="donut__value" style={{ color: activeItem.color }}>
                {Math.round(activeItem.rate * 100)} %
              </span>
              <span className="donut__meta">
                {activeItem.volume} question{activeItem.volume > 1 ? 's' : ''} ·{' '}
                {Math.round((activeItem.volume / total) * 100)} % du travail
              </span>
            </motion.div>
          ) : (
            <motion.div
              className="donut__readout"
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              <span className="donut__value">{total}</span>
              <span className="donut__meta">questions au total</span>
              <span className="donut__hint">Survole l’anneau</span>
            </motion.div>
          )}
        </div>
      </div>

      {/* Légende interactive : même retour que la souris, mais au clavier. */}
      <ul className="donut__legend">
        {segments.map(({ item, share }) => (
          <li key={item.id}>
            <button
              type="button"
              className={`donut__chip${active === item.id ? ' is-active' : ''}`}
              onMouseEnter={() => focus(item.id)}
              onFocus={() => focus(item.id)}
              onMouseLeave={() => focus(null)}
              onBlur={() => focus(null)}
              onClick={() => {
                sfx.select();
                focus(item.id);
              }}
              aria-pressed={active === item.id}
            >
              <i style={{ background: item.color }} aria-hidden="true" />
              <span className="donut__chip-name">
                {item.emoji} {item.name}
              </span>
              <span className="donut__chip-value">{Math.round(share * 100)} %</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
