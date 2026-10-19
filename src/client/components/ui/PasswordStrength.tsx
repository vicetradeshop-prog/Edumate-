import { AnimatePresence, motion } from 'framer-motion';
import { Check, Circle } from 'lucide-react';
import { useMemo } from 'react';
import { passwordStrength } from '../../../shared/password.js';
import { motionAllowed } from '../../lib/fx.js';

interface PasswordStrengthProps {
  value: string;
  /** Affiche la liste détaillée des critères sous la jauge. */
  showChecks?: boolean;
  /** N'affiche que les critères encore non satisfaits (plus compact). */
  onlyMissing?: boolean;
  /** Identifiant pour relier la jauge au champ via `aria-describedby`. */
  id?: string;
}

const SEGMENTS = 4;

/**
 * Jauge de robustesse du mot de passe.
 *
 * - 4 segments qui s'allument un à un, couleur pilotée par la note,
 * - largeur et couleur ANIMÉES (transition de ressort douce),
 * - critères cochés au fur et à mesure de la frappe,
 * - `aria-live="polite"` : la note est annoncée aux lecteurs d'écran sans
 *   interrompre la saisie,
 * - repli statique si les animations sont coupées (préférence système ou
 *   réglage « Animations » d'EduMate) : la jauge reste lisible, seul le
 *   mouvement disparaît.
 */
export function PasswordStrength({ value, showChecks = true, onlyMissing = true, id }: PasswordStrengthProps) {
  const strength = useMemo(() => passwordStrength(value), [value]);
  const animated = motionAllowed();
  const hasInput = value.length > 0;

  const checks = onlyMissing ? strength.checks.filter((check) => !check.ok) : strength.checks;

  return (
    <div className="pwd-strength" id={id}>
      <div className="pwd-strength__bar" role="img" aria-label={`Robustesse du mot de passe : ${strength.label}`}>
        {Array.from({ length: SEGMENTS }, (_unused, index) => {
          const filled = hasInput && index < strength.score;
          return (
            <span className="pwd-strength__track" key={index}>
              <motion.span
                className="pwd-strength__fill"
                style={{ background: filled ? strength.color : 'transparent' }}
                initial={false}
                animate={{
                  scaleX: filled ? 1 : 0,
                  opacity: filled ? 1 : 0,
                }}
                transition={
                  animated
                    ? { type: 'spring', stiffness: 320, damping: 28, delay: index * 0.045 }
                    : { duration: 0 }
                }
              />
            </span>
          );
        })}
      </div>

      <div className="pwd-strength__meta">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={strength.label}
            className="pwd-strength__label"
            style={{ color: strength.color }}
            initial={animated ? { opacity: 0, y: 4 } : false}
            animate={{ opacity: 1, y: 0 }}
            exit={animated ? { opacity: 0, y: -4 } : undefined}
            transition={{ duration: 0.18 }}
            aria-live="polite"
          >
            {hasInput ? strength.label : 'Robustesse du mot de passe'}
          </motion.span>
        </AnimatePresence>

        {strength.acceptable ? (
          <motion.span
            className="pwd-strength__ok"
            initial={animated ? { opacity: 0, scale: 0.85 } : false}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 420, damping: 20 }}
          >
            <Check size={14} aria-hidden="true" /> Accepté
          </motion.span>
        ) : null}
      </div>

      {showChecks && checks.length ? (
        <ul className="pwd-strength__checks">
          <AnimatePresence initial={false}>
            {checks.map((check) => (
              <motion.li
                key={check.id}
                className={check.ok ? 'is-ok' : 'is-todo'}
                initial={animated ? { opacity: 0, x: -8, height: 0 } : false}
                animate={{ opacity: 1, x: 0, height: 'auto' }}
                exit={animated ? { opacity: 0, x: 8, height: 0 } : undefined}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              >
                {check.ok ? <Check size={13} aria-hidden="true" /> : <Circle size={13} aria-hidden="true" />}
                <span>
                  {check.label}
                  {check.required ? null : <em className="pwd-strength__bonus">bonus</em>}
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      ) : null}
    </div>
  );
}
