import type { CSSProperties, ReactNode } from 'react';

/**
 * Badge « verre liquide » : pastille translucide au liseré iridescent
 * (variante `.badge--glass` de styles/glass.css).
 *
 * Même contrat que `Badge` (une simple pastille inline), dans la finition
 * « verre » : à utiliser pour les mises en avant (séries, nouveautés,
 * statistiques hero).
 */
export function GlassBadge({ children, style, className = '' }: { children: ReactNode; style?: CSSProperties; className?: string }) {
  return (
    <span className={`badge badge--glass ${className}`.trim()} style={style}>
      {children}
    </span>
  );
}
