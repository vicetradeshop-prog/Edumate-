import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Button } from './Button.js';

interface LiquidGlassButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children?: ReactNode;
  /** Variante de couleur (héritée de Button ; défaut : primary). */
  variant?: 'primary' | 'accent' | 'success' | 'danger' | 'ghost' | 'soft' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  block?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
  loading?: boolean;
  className?: string;
  type?: 'button' | 'submit' | 'reset';
}

/**
 * Bouton « Liquid Glass » : bouton EduMate standard + anneau conique
 * iridescent qui s'illumine et tourne au survol/focus (`.btn--liquid` et
 * `.btn__liquid-ring` dans styles/glass.css, angle animé via @property).
 *
 * L'anneau est un <span> décoratif (aria-hidden) rendu dans le flux du
 * bouton : en position absolue + z-index -1, il n'a aucun impact sur la
 * mise en page ni sur la lecture par les lecteurs d'écran.
 *
 * Tout le reste (ripple, états, accessibilité) est délégué à `Button`.
 */
export function LiquidGlassButton({ children, className = '', ...rest }: LiquidGlassButtonProps) {
  return (
    <Button className={`btn--liquid ${className}`.trim()} decoration={<span className="btn__liquid-ring" aria-hidden="true" />} {...rest}>
      {children}
    </Button>
  );
}
