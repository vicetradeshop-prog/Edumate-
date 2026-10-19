import type { ElementType, HTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  as?: ElementType;
  to?: string;
  hover?: boolean;
  flat?: boolean;
  padded?: boolean;
  children: ReactNode;
  /** Couleur d'accent (bande latérale / pastille) */
  accent?: string;
}

/** Carte conteneur : ombre douce, coins arrondis, effet de survol optionnel. */
export function Card({ as, to, hover = false, flat = false, padded = true, className = '', style, children, accent, ...rest }: CardProps) {
  const classes = ['card', hover ? 'card--hover' : '', flat ? 'card--flat' : '', !padded ? 'card--nopad' : '', className]
    .filter(Boolean)
    .join(' ');
  const merged: React.CSSProperties = {
    ...(accent ? ({ ['--tile-color' as string]: accent } as React.CSSProperties) : null),
    ...style,
  };

  if (to) {
    return (
      <Link to={to} className={classes} style={merged} {...(rest as object)}>
        {children}
      </Link>
    );
  }
  const Tag = (as ?? 'div') as ElementType;
  return (
    <Tag className={classes} style={merged} {...rest}>
      {children}
    </Tag>
  );
}

export function CardTitle({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <h3 className="card__title">
      {icon}
      {children}
    </h3>
  );
}

export function CardSubtitle({ children }: { children: ReactNode }) {
  return <p className="card__subtitle">{children}</p>;
}

interface TileProps {
  to?: string;
  onClick?: () => void;
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  color?: string;
  soft?: string;
  footer?: ReactNode;
  className?: string;
}

/** Tuile cliquable du tableau de bord et des outils. */
export function Tile({ to, onClick, icon, title, description, color = 'var(--ed-primary)', soft, footer, className = '' }: TileProps) {
  const style = {
    ['--tile-color' as string]: color,
    ['--tile-soft' as string]: soft ?? `color-mix(in srgb, ${color} 15%, transparent)`,
  } as React.CSSProperties;

  const content = (
    <>
      <span className="tile__icon" aria-hidden="true">
        {icon}
      </span>
      <span>
        <span className="card__title" style={{ display: 'block' }}>
          {title}
        </span>
        {description ? <span className="card__subtitle" style={{ display: 'block', marginTop: 2 }}>{description}</span> : null}
      </span>
      {footer ? <span style={{ marginTop: 'auto', paddingTop: 6 }}>{footer}</span> : null}
    </>
  );

  if (to) {
    return (
      <Link to={to} className={`card card--hover tile ${className}`} style={style}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={`card card--hover tile ${className}`} style={style}>
      {content}
    </button>
  );
}
