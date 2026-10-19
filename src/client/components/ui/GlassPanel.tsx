import type { ReactNode } from 'react';

interface GlassPanelProps {
  children: ReactNode;
  /** Titre optionnel, rendu dans un en-tête de panneau. */
  title?: ReactNode;
  /** Contenu aligné à droite du titre (lien, bouton…). */
  aside?: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  as?: 'div' | 'section' | 'aside';
}

/**
 * Panneau « verre liquide » : grande surface vitrée (verre dépoli + liseré
 * clair) qui regroupe une section de page. Même principe que `GlassCard`,
 * avec un en-tête intégré — voir `.glass-panel` dans styles/glass.css.
 *
 * Décoratif par nature : `aria-hidden` n'est PAS posé (le contenu compte),
 * l'en-tête utilise un rôle de présentation et le titre reste un vrai `h3`.
 */
export function GlassPanel({ children, title, aside, className = '', style, as = 'section' }: GlassPanelProps) {
  const Tag = as;
  return (
    <Tag className={`glass-panel ${className}`.trim()} style={style}>
      {title ? (
        <div className="glass-panel__head">
          <h3 className="glass-panel__title">{title}</h3>
          {aside}
        </div>
      ) : null}
      <div className="glass-panel__body">{children}</div>
    </Tag>
  );
}
