import { useMemo } from 'react';

/**
 * Pluie de confettis (CSS pur, sans bibliothèque).
 *
 * Partagée entre la page de résultat de quiz et le lecteur de leçons :
 * mêmes couleurs, même physique, même classe `.confetti` (layout.css).
 * `show = false` ne rend rien — le contrôle « animations réduites » est de la
 * responsabilité de l'appelant.
 */
export function Confetti({ show }: { show: boolean }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: 70 }, (_unused, index) => ({
        id: index,
        left: Math.random() * 100,
        delay: Math.random() * 1.4,
        duration: 2.2 + Math.random() * 2,
        color: ['#6c5ce7', '#22d3ee', '#f59e0b', '#16a34a', '#e11d48', '#7c3aed', '#f472b6'][index % 7],
        rotate: Math.random() * 360,
      })),
    [],
  );
  if (!show) return null;
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((piece) => (
        <span
          key={piece.id}
          style={{
            left: `${piece.left}%`,
            background: piece.color,
            animationDelay: `${piece.delay}s`,
            animationDuration: `${piece.duration}s`,
            transform: `rotate(${piece.rotate}deg)`,
          }}
        />
      ))}
    </div>
  );
}
