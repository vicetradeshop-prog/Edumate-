/**
 * EduMate — Écran de réveil du serveur.
 *
 * Sur le plan gratuit Render, le service s'endort après 15 min d'inactivité :
 * le premier accès prend quelques secondes. Plutôt qu'un écran vide ou un
 * message technique, EduMate affiche sa propre animation de réveil : hibou
 * qui se réveille, anneau orbital, messages qui tournent et compteur de
 * secondes — puis l'application apparaît normalement.
 *
 * Composant purement visuel : aucune logique réseau ici (les retries vivent
 * dans le magasin d'authentification).
 */
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

const MESSAGES = [
  'On réveille le serveur…',
  'Ouverture de ton espace…',
  'Chauffage des quiz…',
  'Éclairage de la salle des leçons…',
  'Café de l’assistant…',
];

export function WakeScreen({ compact = false }: { compact?: boolean }) {
  const [messageIndex, setMessageIndex] = useState(0);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const messages = window.setInterval(() => setMessageIndex((index) => (index + 1) % MESSAGES.length), 2600);
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => {
      window.clearInterval(messages);
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div className={`wake${compact ? ' wake--compact' : ''}`} role="status" aria-live="polite">
      <div className="wake__stage" aria-hidden="true">
        <span className="wake__ring" />
        <motion.span
          className="wake__owl"
          animate={{ y: [0, -10, 0], rotate: [0, -4, 0, 4, 0] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
        >
          🦉
        </motion.span>
        <span className="wake__orbit">
          <span className="wake__dot" />
          <span className="wake__dot wake__dot--2" />
          <span className="wake__dot wake__dot--3" />
        </span>
      </div>
      <strong className="wake__brand">EduMate</strong>
      <p className="wake__message" key={messageIndex}>
        {MESSAGES[messageIndex]}
      </p>
      <div className="wake__bar" aria-hidden="true">
        <span />
      </div>
      <p className="wake__seconds">{seconds} s</p>
      {seconds >= 8 ? (
        <p className="wake__hint">
          Plan gratuit : le serveur s’endort après 15 min d’inactivité, le réveil prend quelques secondes.
          <br />
          Astuce : laisse un onglet EduMate ouvert, il maintient le serveur éveillé.
        </p>
      ) : null}
    </div>
  );
}
