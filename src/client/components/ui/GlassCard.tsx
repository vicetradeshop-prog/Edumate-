import type { ReactNode } from 'react';
import { Card } from './Card.js';

interface GlassCardProps {
  /** Rendu sous forme de lien interne (comme `Card to=…`). */
  to?: string;
  as?: 'div' | 'section' | 'article';
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  /** Effet de survol (défaut : activé). */
  hover?: boolean;
  /** Inclinaison 3D légère au curseur (pointeur fin uniquement). */
  tilt?: boolean;
  /** Couleur d'accent (liseré des tuiles). */
  accent?: string;
  onClick?: () => void;
}

/**
 * Carte « verre liquide » : plaque de verre dépoli (teint translucide +
 * flou de l'arrière-plan posé sur un pseudo-calque, reflet diagonal et
 * lumière qui suit le curseur — voir styles/glass.css).
 *
 * C'est un habillage de `Card` : mêmes props de base, même DOM, aucune
 * logique supplémentaire. Utilisé quand on veut le verre « premium »
 * (statistiques, panneaux clés) ; `Card` reste parfait ailleurs.
 */
export function GlassCard({ to, as, children, className = '', style, hover = true, tilt = false, accent, onClick }: GlassCardProps) {
  return (
    <Card
      to={to}
      as={as}
      hover={hover}
      className={`card--glass ${className}`.trim()}
      style={style}
      accent={accent}
      onClick={onClick}
      {...(tilt ? { 'data-tilt': '' } : {})}
    >
      {children}
    </Card>
  );
}
