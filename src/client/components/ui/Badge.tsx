import type { ReactNode } from 'react';
import { Star } from 'lucide-react';
import { formatPercent } from '../../lib/format.js';

type Tone = 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'outline';

const TONES: Record<Tone, string> = {
  default: 'badge',
  primary: 'badge badge--primary',
  success: 'badge badge--success',
  warning: 'badge badge--warning',
  danger: 'badge badge--danger',
  outline: 'badge badge--outline',
};

export function Badge({ children, tone = 'default', style }: { children: ReactNode; tone?: Tone; style?: React.CSSProperties }) {
  return (
    <span className={TONES[tone]} style={style}>
      {children}
    </span>
  );
}

export function DifficultyBadge({ difficulty }: { difficulty: string }) {
  const map: Record<string, { label: string; tone: Tone }> = {
    facile: { label: 'Facile', tone: 'success' },
    moyen: { label: 'Moyen', tone: 'warning' },
    difficile: { label: 'Difficile', tone: 'danger' },
  };
  const entry = map[difficulty] ?? { label: difficulty, tone: 'default' as Tone };
  return <Badge tone={entry.tone}>{entry.label}</Badge>;
}

/** Barre de progression animée (0 → 1). */
export function Progress({ value, thin = false, label, color }: { value: number; thin?: boolean; label?: string; color?: string }) {
  const percent = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div>
      {label ? (
        <div className="ed-row" style={{ justifyContent: 'space-between', marginBottom: 5, fontSize: '0.8rem', color: 'var(--ed-text-mute)', fontWeight: 600 }}>
          <span>{label}</span>
          <span>{formatPercent(value / 100, 0)}</span>
        </div>
      ) : null}
      <div
        className={`progress${thin ? ' progress--thin' : ''}`}
        role="progressbar"
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? 'Progression'}
      >
        <div className="progress__bar" style={{ width: `${percent}%`, background: color ? `linear-gradient(90deg, ${color}, var(--ed-accent))` : undefined }} />
      </div>
    </div>
  );
}

/**
 * Note en étoiles, avec remplissage partiel (demi-étoiles et au-delà).
 *
 * Défauts corrigés par rapport à la première version :
 *  1. **Débordement non borné** : `score` supérieur à `total` produisait
 *     `aria-label="Note : 7.0 sur 5"`. Tout est désormais pincé dans [0, 5].
 *  2. **Artefacts flottants** : `width: 64.99999999999999%`. Les pourcentages
 *     sont arrondis au dixième.
 *  3. **Désalignement vertical** : le `<svg>` de remplissage est un élément
 *     `inline`, donc il repose sur la ligne de base et laisse la place du
 *     jambage. Dans un conteneur de 15 px à `overflow: hidden`, l'étoile
 *     pleine apparaissait décalée vers le bas par rapport à l'étoile vide.
 *     Corrigé avec `display: block` + `lineHeight: 0`.
 *  4. **Épaisseur de trait** : à 13 px, le `stroke-width` de 2 (pensé pour un
 *     viewBox de 24) rendait les étoiles pâteuses. Il est mis à l'échelle.
 *  5. `NaN` / `total <= 0` / valeurs négatives sont neutralisés.
 *  6. Une infobulle (`title`) et un libellé accessible précis indiquent le
 *     pourcentage, pas seulement « x sur 5 ».
 */
export interface StarsProps {
  /** Score obtenu, dans la même unité que `total`. */
  score: number;
  /** Total de référence. Par défaut 5 : `score` est alors déjà une note /5. */
  total?: number;
  size?: number;
  /** Affiche la valeur numérique à côté des étoiles. */
  showValue?: boolean;
  /** Libellé accessible personnalisé (préfixe du pourcentage). */
  label?: string;
}

/** Pince une valeur dans un intervalle, en neutralisant NaN. */
function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function Stars({ score, total = 5, size = 15, showValue = false, label }: StarsProps) {
  const safeTotal = Number.isFinite(total) && total > 0 ? total : 0;
  const ratio = safeTotal > 0 ? clampNumber(Number(score) / safeTotal, 0, 1) : 0;
  const stars = ratio * 5;
  const percent = Math.round(ratio * 100);

  // Épaisseur de trait mise à l'échelle : lucide dessine dans un viewBox de 24
  // avec un trait de 2. En dessous de ~18 px, on l'affine pour rester lisible.
  const strokeWidth = size >= 18 ? 2 : size >= 14 ? 1.75 : 1.5;

  const accessible = `${label ? `${label} : ` : ''}Note : ${stars.toFixed(1).replace('.', ',')} sur 5 (${percent} %)`;

  return (
    <span className="stars" role="img" aria-label={accessible} title={accessible}>
      {[0, 1, 2, 3, 4].map((index) => {
        // Arrondi au dixième de pourcent : évite les largeurs à 14 décimales.
        const fillPercent = Math.round(clampNumber(stars - index, 0, 1) * 1000) / 10;
        return (
          <span
            key={index}
            style={{ position: 'relative', display: 'inline-block', width: size, height: size, lineHeight: 0, flex: '0 0 auto' }}
          >
            <Star
              size={size}
              strokeWidth={strokeWidth}
              style={{ position: 'absolute', inset: 0, display: 'block', color: 'var(--ed-border-strong)' }}
              aria-hidden="true"
            />
            {fillPercent > 0 ? (
              <span
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  bottom: 0,
                  width: `${fillPercent}%`,
                  overflow: 'hidden',
                  display: 'block',
                  lineHeight: 0,
                }}
              >
                <Star
                  size={size}
                  strokeWidth={strokeWidth}
                  fill="currentColor"
                  style={{ display: 'block', color: 'var(--ed-warning)' }}
                  aria-hidden="true"
                />
              </span>
            ) : null}
          </span>
        );
      })}
      {showValue ? (
        <span className="ed-small ed-mute" style={{ marginLeft: 6, lineHeight: 1.4, fontVariantNumeric: 'tabular-nums' }}>
          {stars.toFixed(1).replace('.', ',')}/5
        </span>
      ) : null}
    </span>
  );
}
