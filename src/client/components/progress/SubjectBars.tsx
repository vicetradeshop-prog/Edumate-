import { useCallback } from 'react';
import { motion } from 'framer-motion';
import { sfx } from '../../lib/sfx.js';
import { useCountUp, usePrefersReducedMotion } from '../../lib/hooks.js';
import type { SubjectSlice } from './SubjectDonut.js';

interface SubjectBarsProps {
  data: SubjectSlice[];
  /** Nombre maximal de lignes affichées. */
  limit?: number;
}

/** Une ligne de barre : valeur animée indépendamment des autres. */
function SubjectRow({ item, index, reduced, onHover }: { item: SubjectSlice; index: number; reduced: boolean; onHover: (rate: number) => void }) {
  const animated = useCountUp(item.rate, reduced ? 0 : 900);
  const width = Math.max(0, Math.min(1, animated)) * 100;
  const percent = Math.round(item.rate * 100);

  return (
    <motion.li
      className="sbar"
      initial={reduced ? false : { opacity: 0, x: -14 }}
      animate={{ opacity: 1, x: 0 }}
      transition={reduced ? { duration: 0 } : { duration: 0.4, delay: Math.min(index * 0.055, 0.55), ease: [0.22, 1, 0.36, 1] }}
      onMouseEnter={() => onHover(item.rate)}
      onFocus={() => onHover(item.rate)}
      tabIndex={0}
    >
      <span className="sbar__head">
        <span className="sbar__name">
          <i aria-hidden="true">{item.emoji}</i>
          {item.name}
        </span>
        <span className="sbar__figures">
          <strong style={{ color: item.color }}>{percent} %</strong>
          <em>{item.volume} q.</em>
        </span>
      </span>
      <span className="sbar__track">
        <span
          className="sbar__fill"
          style={{ width: `${width}%`, background: `linear-gradient(90deg, ${item.color}, color-mix(in srgb, ${item.color} 55%, #22d3ee))` }}
        >
          {/* Reflet qui balaie la barre : pur CSS, désactivé en mouvement réduit. */}
          {reduced ? null : <span className="sbar__shine" aria-hidden="true" />}
        </span>
        {/* Repères à 40 % et 70 % : seuils « à retravailler » et « maîtrisé ». */}
        <i className="sbar__mark" style={{ left: '40%' }} aria-hidden="true" />
        <i className="sbar__mark" style={{ left: '70%' }} aria-hidden="true" />
      </span>
    </motion.li>
  );
}

/**
 * Réussite par matière, en barres horizontales animées.
 *
 * Complément de l'anneau : l'anneau montre la RÉPARTITION du travail, les barres
 * montrent le NIVEAU atteint. Les deux partagent le même retour sonore (hauteur
 * proportionnelle au taux de réussite), donc survoler l'un ou l'autre produit la
 * même « note » pour une même matière — le lien entre les deux vues devient
 * sensible, pas seulement visuel.
 */
export function SubjectBars({ data, limit = 10 }: SubjectBarsProps) {
  const reduced = usePrefersReducedMotion();
  const onHover = useCallback((rate: number) => sfx.hover(rate), []);

  const items = [...data].sort((a, b) => b.volume - a.volume).slice(0, limit);
  if (items.length === 0) {
    return <p className="ed-small ed-mute">Pas encore de matière travaillée.</p>;
  }

  return (
    <ul className="sbar-list">
      {items.map((item, index) => (
        <SubjectRow key={item.id} item={item} index={index} reduced={reduced} onHover={onHover} />
      ))}
    </ul>
  );
}
