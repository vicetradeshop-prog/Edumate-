import { motion } from 'framer-motion';
import { motionAllowed } from '../../lib/fx.js';

export type AuthBadgeVariant = 'mail' | 'check' | 'lock' | 'alert';

interface AnimatedBadgeProps {
  variant: AuthBadgeVariant;
  tone?: 'success' | 'info' | 'warning' | 'danger';
  size?: number;
}

const TONES: Record<NonNullable<AnimatedBadgeProps['tone']>, { stroke: string; glow: string }> = {
  success: { stroke: 'var(--ed-success, #16a34a)', glow: 'rgba(22,163,74,.28)' },
  info: { stroke: 'var(--ed-primary, #6c5ce7)', glow: 'rgba(108,92,231,.30)' },
  warning: { stroke: 'var(--ed-warning, #f59e0b)', glow: 'rgba(245,158,11,.26)' },
  danger: { stroke: 'var(--ed-danger, #e11d48)', glow: 'rgba(225,29,72,.26)' },
};

/**
 * Tracés SVG de chaque pictogramme, dessinés dans un repère 48×48.
 *
 * Chaque chemin est animé via `pathLength` (de 0 à 1) : l'icône se DESSINE sous
 * les yeux de l'élève au lieu d'apparaître d'un coup. C'est le même principe que
 * les coches de validation des formulaires bancaires, et cela ne coûte rien en
 * dépendance puisque framer-motion est déjà utilisé partout dans EduMate.
 */
const PATHS: Record<AuthBadgeVariant, string[]> = {
  // Enveloppe : rectangle + rabat.
  mail: ['M9 14h30v21H9z', 'M9 15l15 11 15-11'],
  // Coche de validation.
  check: ['M14 25l7 7 14-15'],
  // Cadenas : corps + anse.
  lock: ['M13 22h22v15H13z', 'M18 22v-5a6 6 0 0112 0v5'],
  // Point d'exclamation dans un cercle.
  alert: ['M24 9a15 15 0 110 30 15 15 0 010-30z', 'M24 17v9', 'M24 31v1'],
};

/**
 * Pastille animée des écrans « mot de passe oublié » et « réinitialisation ».
 *
 * Trois couches de mouvement, toutes désactivées si les animations sont coupées
 * (préférence système `prefers-reduced-motion` ou réglage EduMate) :
 *   1. halo qui respire derrière la pastille,
 *   2. cercle tracé dans le sens horaire,
 *   3. pictogramme dessiné trait par trait, avec un léger rebond à la fin.
 *
 * En mode « animations réduites », tout est rendu dans son état final : aucune
 * information n'est perdue, seul le mouvement disparaît.
 */
export function AnimatedBadge({ variant, tone = 'info', size = 92 }: AnimatedBadgeProps) {
  const animated = motionAllowed();
  const colors = TONES[tone];
  const paths = PATHS[variant];
  const radius = 21;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="auth-badge" style={{ width: size, height: size }}>
      {animated ? (
        <motion.span
          className="auth-badge__glow"
          style={{ background: colors.glow }}
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: [0.75, 1.15, 0.95], opacity: [0, 0.9, 0.55] }}
          transition={{ duration: 2.4, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' }}
          aria-hidden="true"
        />
      ) : null}

      <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <motion.circle
          cx="24"
          cy="24"
          r={radius}
          fill="none"
          stroke={colors.stroke}
          strokeOpacity="0.22"
          strokeWidth="2"
        />
        <motion.circle
          cx="24"
          cy="24"
          r={radius}
          fill="none"
          stroke={colors.stroke}
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          transform="rotate(-90 24 24)"
          initial={animated ? { strokeDashoffset: circumference } : { strokeDashoffset: 0 }}
          animate={{ strokeDashoffset: 0 }}
          transition={animated ? { duration: 0.85, ease: [0.22, 1, 0.36, 1] } : { duration: 0 }}
        />
        {paths.map((d, index) => (
          <motion.path
            key={d}
            d={d}
            fill="none"
            stroke={colors.stroke}
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={animated ? { pathLength: 0, opacity: 0 } : { pathLength: 1, opacity: 1 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={
              animated
                ? { duration: 0.5, delay: 0.45 + index * 0.18, ease: [0.22, 1, 0.36, 1] }
                : { duration: 0 }
            }
          />
        ))}
      </svg>
    </div>
  );
}

/**
 * Anneau de compte à rebours (renvoi du lien).
 *
 * Le cercle se vide progressivement pendant `seconds` : l'élève voit combien de
 * temps il reste avant de pouvoir redemander un lien, sans avoir à lire un
 * chiffre qui change toutes les secondes.
 */
export function CountdownRing({ progress, seconds, size = 34 }: { progress: number; seconds: number; size?: number }) {
  const radius = (size - 4) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(1, Math.max(0, progress));
  return (
    <span className="countdown-ring" style={{ width: size, height: size }} aria-hidden="true">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeOpacity="0.18" strokeWidth="2.5" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset .95s linear' }}
        />
      </svg>
      <span className="countdown-ring__value">{seconds}</span>
    </span>
  );
}
