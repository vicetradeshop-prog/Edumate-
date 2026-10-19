import { useId } from 'react';
import { motion } from 'framer-motion';
import { useCountUp, usePrefersReducedMotion } from '../../lib/hooks.js';

interface RadialGaugeProps {
  /** Valeur affichée, 0 → 1. */
  value: number;
  /** Libellé sous la valeur. */
  label: string;
  /** Couleur dominante du dégradé. */
  color?: string;
  /** Couleur de fin du dégradé (défaut : cyan de l'identité EduMate). */
  colorTo?: string;
  size?: number;
  /** Formatage de la valeur centrale (défaut : pourcentage). */
  format?: (value: number) => string;
  /** Emoji décoratif au-dessus de la valeur. */
  emoji?: string;
  /** Sous-texte explicatif. */
  hint?: string;
}

/**
 * Jauge annulaire du bandeau « héros » de la page Progression.
 *
 * Trois mouvements simultanés, tous coupés si les animations sont désactivées :
 *   1. l'arc se trace (la longueur du trait suit la valeur animée),
 *   2. le nombre monte de 0 jusqu'à la valeur réelle (`useCountUp`),
 *   3. un halo respire derrière l'anneau.
 *
 * Le dégradé et le flou sont définis par instance (`useId`) : plusieurs jauges
 * sur la même page ne peuvent pas entrer en collision d'identifiants SVG.
 */
export function RadialGauge({
  value,
  label,
  color = '#6c5ce7',
  colorTo = '#22d3ee',
  size = 148,
  format,
  emoji,
  hint,
}: RadialGaugeProps) {
  const reduced = usePrefersReducedMotion();
  const uid = useId().replace(/:/g, '');
  const clamped = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  const animated = useCountUp(clamped, reduced ? 0 : 1250);

  const stroke = 12;
  const radius = (size - stroke * 2 - 10) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;
  const drawn = Math.max(0, Math.min(circumference, animated * circumference));
  const percent = Math.round(animated * 100);
  const display = format ? format(animated) : `${percent} %`;

  return (
    <div className="gauge" style={{ width: size }}>
      <div className="gauge__figure" style={{ width: size, height: size }}>
        {!reduced ? (
          <motion.span
            className="gauge__halo"
            style={{ background: color }}
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: [0.16, 0.34, 0.16], scale: [0.86, 1.06, 0.86] }}
            transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
            aria-hidden="true"
          />
        ) : null}

        <svg width={size} height={size} role="img" aria-label={`${label} : ${display}`}>
          <defs>
            <linearGradient id={`gauge-${uid}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={color} />
              <stop offset="100%" stopColor={colorTo} />
            </linearGradient>
            <filter id={`gauge-glow-${uid}`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="var(--ed-surface-3, rgba(238,234,255,.72))"
            strokeWidth={stroke}
          />
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={`url(#gauge-${uid})`}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${drawn} ${circumference - drawn}`}
            transform={`rotate(-90 ${center} ${center})`}
            filter={drawn > 0 ? `url(#gauge-glow-${uid})` : undefined}
          />
        </svg>

        <div className="gauge__center">
          {emoji ? (
            <span className="gauge__emoji" aria-hidden="true">
              {emoji}
            </span>
          ) : null}
          <strong className="gauge__value">{display}</strong>
        </div>
      </div>

      <span className="gauge__label">{label}</span>
      {hint ? <span className="gauge__hint">{hint}</span> : null}
    </div>
  );
}
