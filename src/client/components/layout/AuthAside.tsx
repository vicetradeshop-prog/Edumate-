import { motion } from 'framer-motion';
import { ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { Logo } from '../ui/Feedback.js';

interface AuthAsideProps {
  /** Titre principal (une phrase courte, pensée pour l'écran de connexion). */
  title: ReactNode;
  /** Paragraphe d'accompagnement. */
  description?: ReactNode;
  /** Arguments listés sous le titre (3 au maximum pour rester lisible). */
  bullets?: ReactNode[];
  /** Mention de bas de colonne (confidentialité, RGPD…). */
  footnote?: ReactNode;
  /** Emoji affiché en filigrane, adapté au contexte de la page. */
  emoji?: string;
}

/**
 * Colonne de gauche des pages d'authentification.
 *
 * Factorisée parce que la connexion, le mot de passe oublié et la
 * réinitialisation partagent exactement la même mise en scène « Liquid Glass »
 * (dégradé, halos, entrée animée) : un seul endroit à faire évoluer, et une
 * identité visuelle strictement identique d'un écran à l'autre.
 *
 * Masquée sous 980 px (voir `layout.css`) : sur mobile, seul le formulaire
 * compte, la colonne décorative ferait défiler inutilement.
 */
export function AuthAside({ title, description, bullets = [], footnote, emoji = '🦉' }: AuthAsideProps) {
  return (
    <aside className="auth-aside">
      {/* Halos décoratifs : CSS pur, aucun canvas, aucune interaction possible. */}
      <span className="auth-aside__shape" style={{ width: 320, height: 320, top: -90, right: -80 }} />
      <span className="auth-aside__shape" style={{ width: 210, height: 210, bottom: -60, left: -50 }} />

      <div className="ed-row" style={{ gap: 11, position: 'relative' }}>
        <Logo size={44} />
        <span style={{ fontFamily: 'var(--ed-font-display)', fontSize: '1.5rem', fontWeight: 800 }}>EduMate</span>
      </div>

      <motion.div
        style={{ position: 'relative', maxWidth: 460 }}
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      >
        <span
          className="anim-float"
          aria-hidden="true"
          style={{ fontSize: 54, display: 'inline-block', marginBottom: 8, filter: 'drop-shadow(0 8px 18px rgba(0,0,0,.35))' }}
        >
          {emoji}
        </span>
        <h1 style={{ color: '#fff', marginBottom: 12, fontSize: 'clamp(1.7rem, 1.2rem + 1.6vw, 2.4rem)' }}>{title}</h1>
        {description ? <p style={{ opacity: 0.94, fontSize: '1.03rem' }}>{description}</p> : null}
        {bullets.length ? (
          <ul style={{ listStyle: 'none', padding: 0, marginTop: 26, display: 'grid', gap: 11 }}>
            {bullets.map((item, index) => (
              <motion.li
                key={index}
                className="ed-row"
                style={{ gap: 9, color: '#fff' }}
                initial={{ opacity: 0, x: -14 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.18 + index * 0.09, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              >
                <ShieldCheck size={18} /> {item}
              </motion.li>
            ))}
          </ul>
        ) : null}
      </motion.div>

      <p style={{ position: 'relative', fontSize: '0.85rem', opacity: 0.85 }}>
        {footnote ?? 'Tes données restent privées, protégées, et ne sont jamais revendues.'}
      </p>
    </aside>
  );
}
