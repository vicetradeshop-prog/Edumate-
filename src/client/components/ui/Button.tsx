import { useCallback, useEffect, useRef, useState, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from 'react';

type Variant = 'primary' | 'accent' | 'success' | 'danger' | 'ghost' | 'soft' | 'outline';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
  loading?: boolean;
  /** Onde de propagation au clic (désactivée si les animations sont coupées). */
  ripple?: boolean;
  /**
   * Nœud décoratif (aria-hidden) rendu EN DEHORS du <span> de contenu :
   * indispensable pour les calques absolus qui doivent hériter du rayon du
   * bouton (`border-radius: inherit`) — l'anneau de LiquidGlassButton héritait
   * sinon du rayon nul du span de contenu (rectangle visible au survol).
   */
  decoration?: ReactNode;
}

interface Ripple {
  id: number;
  x: number;
  y: number;
  size: number;
}

const VARIANT_CLASS: Record<Variant, string> = {
  primary: 'btn--primary',
  accent: 'btn--accent',
  success: 'btn--success',
  danger: 'btn--danger',
  ghost: 'btn--ghost',
  soft: 'btn--soft',
  outline: '',
};

let rippleId = 0;

/** Les animations sont-elles autorisées (préférence système ou réglage utilisateur) ? */
function animationsEnabled(): boolean {
  if (typeof document !== 'undefined' && document.documentElement.dataset.animations === 'off') return false;
  if (typeof window !== 'undefined' && window.matchMedia) {
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  return true;
}

/*
 * Dimension de repli quand `getBoundingClientRect()` renvoie un rectangle vide
 * (élément masqué, rendu hors navigateur, tests jsdom). Sans ce garde-fou l'onde
 * naîtrait avec une taille nulle et serait invisible — le retour visuel au clic
 * disparaîtrait silencieusement.
 */
const FALLBACK_WIDTH = 132;
const FALLBACK_HEIGHT = 44;

/**
 * Onde de propagation au clic, partagée par `Button` et `IconButton`.
 *
 * Elle est volontairement extraite dans un hook : `IconButton` n'avait aucun
 * retour visuel au clic (les petites icônes d'action, dont « marquer comme
 * terminé » du tableau de bord, semblaient inertes).
 *
 * Le nettoyage des minuteurs au démontage évite tout `setState` après
 * démontage (avertissement React) quand un bouton est cliqué puis retiré du DOM
 * dans la foulée — cas typique d'une action qui vide une liste.
 */
function useRipple(enabled: boolean) {
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const timers = useRef<number[]>([]);

  useEffect(
    () => () => {
      for (const timer of timers.current) window.clearTimeout(timer);
      timers.current = [];
    },
    [],
  );

  const spawn = useCallback(
    (event: MouseEvent<HTMLElement>): void => {
      if (!enabled || !animationsEnabled()) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const width = rect.width > 0 ? rect.width : FALLBACK_WIDTH;
      const height = rect.height > 0 ? rect.height : FALLBACK_HEIGHT;
      // Diamètre suffisant pour couvrir tout le bouton depuis le point cliqué.
      const size = Math.max(width, height) * 2.4;
      const next: Ripple = {
        id: ++rippleId,
        // `clientX` vaut 0 pour un clic déclenché par le clavier ou par un test :
        // on recentre alors l'onde au milieu du bouton, ce qui reste naturel.
        x: event.clientX || width / 2,
        y: event.clientY || height / 2,
        size,
      };
      setRipples((prev) => [...prev.slice(-2), next]);
      const timer = window.setTimeout(() => {
        setRipples((prev) => prev.filter((item) => item.id !== next.id));
      }, 660);
      timers.current.push(timer);
    },
    [enabled],
  );

  /*
   * Les ondes vivent dans leur propre calque rogné (`.btn__ripple-layer`).
   * Le rognage n'est PAS porté par le bouton lui-même : `.notif-badge` dépasse
   * volontairement de 6 px en haut à droite des boutons « Fil » et « Devoirs »,
   * et un `overflow: hidden` sur `.btn` les couperait.
   * Le calque n'est monté que s'il a quelque chose à afficher, pour ne pas
   * ajouter de nœud inutile au DOM de chaque bouton.
   */
  const nodes = ripples.length ? (
    <span className="btn__ripple-layer" aria-hidden="true">
      {ripples.map((item) => (
        <span
          key={item.id}
          className="btn__ripple"
          style={{ left: item.x, top: item.y, width: item.size, height: item.size }}
        />
      ))}
    </span>
  ) : null;

  return { spawn, nodes };
}

/**
 * Bouton EduMate : variantes colorées, soulèvement élastique au survol,
 * onde de propagation au clic, état de chargement intégré et surface tactile
 * minimale de 44 px.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  icon,
  iconRight,
  loading = false,
  ripple = true,
  decoration,
  className = '',
  children,
  disabled,
  type = 'button',
  onClick,
  ...rest
}: ButtonProps) {
  const { spawn, nodes } = useRipple(ripple && !disabled && !loading);

  const handleClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      spawn(event);
      onClick?.(event);
    },
    [onClick, spawn],
  );

  const classes = ['btn', VARIANT_CLASS[variant], size !== 'md' ? `btn--${size}` : '', block ? 'btn--block' : '', className]
    .filter(Boolean)
    .join(' ');

  return (
    <button type={type} className={classes} disabled={disabled || loading} onClick={handleClick} {...rest}>
      {decoration}
      {nodes}
      {loading ? <span className="spinner" aria-hidden="true" /> : icon}
      {children ? <span>{children}</span> : null}
      {iconRight}
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: 'sm' | 'md';
  variant?: Variant;
  /** Onde de propagation au clic (défaut : activée). */
  ripple?: boolean;
}

export function IconButton({
  label,
  size = 'md',
  variant = 'soft',
  ripple = true,
  className = '',
  children,
  disabled,
  onClick,
  ...rest
}: IconButtonProps) {
  const { spawn, nodes } = useRipple(ripple && !disabled);

  const handleClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      spawn(event);
      onClick?.(event);
    },
    [onClick, spawn],
  );

  const classes = ['btn', VARIANT_CLASS[variant], 'btn--icon', size === 'sm' ? 'btn--sm' : '', className].filter(Boolean).join(' ');
  return (
    <button type="button" className={classes} aria-label={label} title={label} disabled={disabled} onClick={handleClick} {...rest}>
      {nodes}
      {children}
    </button>
  );
}
