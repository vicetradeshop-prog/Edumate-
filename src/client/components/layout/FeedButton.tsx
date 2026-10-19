import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Bell } from 'lucide-react';
import { startFeedPolling, useFeed } from '../../lib/feedStore.js';
import { useAuth } from '../../lib/store.js';

/**
 * Cloche du fil d'actualités, avec badge chiffré.
 *
 * Le badge est l'indicateur principal demandé : un chiffre rouge qui apparaît
 * dès qu'une nouveauté ou un sondage n'a pas été vu, **même si l'élève n'est pas
 * sur la page du fil**. Trois détails de robustesse :
 *
 *   - le compteur est rafraîchi périodiquement (`startFeedPolling`, 3 min) et à
 *     chaque retour sur l'onglet, sans rechargement de page ;
 *   - la pastille est en `pointer-events: none` (CSS) : cliquer sur le chiffre
 *     active bien le lien, et non la pastille ;
 *   - au-delà de 99, on affiche « 99+ » pour ne pas déformer le bouton.
 *
 * L'animation `layout` + le `key` porté sur la valeur font rebondir la pastille
 * à chaque changement de nombre, ce qui attire l'œil sans être agressif.
 */
export function FeedButton() {
  const user = useAuth((state) => state.user);
  const unreadCount = useFeed((state) => state.unreadCount);
  const refreshUnread = useFeed((state) => state.refreshUnread);
  const location = useLocation();

  /*
   * Démarrage du polling et première lecture.
   *
   * Déclenché ici plutôt que dans `main.tsx` : ce composant n'existe que dans
   * `AppShell`, donc uniquement pour un élève connecté. Un visiteur anonyme ne
   * lance ainsi aucune requête inutile.
   */
  useEffect(() => {
    if (!user) return;
    startFeedPolling();
    void refreshUnread();
  }, [user?.id, refreshUnread]);

  // Rafraîchir au retour sur l'onglet et après chaque navigation.
  useEffect(() => {
    if (!user) return;
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') void refreshUnread();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [user?.id, refreshUnread]);

  useEffect(() => {
    if (!user) return;
    void refreshUnread();
    // `location.pathname` : un retour depuis une autre page doit refléter les
    // lectures effectuées ailleurs (le fil marque les éléments comme lus).
  }, [user?.id, location.pathname, refreshUnread]);

  if (!user) return null;

  const count = Math.max(0, Math.floor(unreadCount) || 0);
  const label = count > 0 ? `Fil et sondages : ${count} nouveauté${count > 1 ? 's' : ''} à voir` : 'Fil et sondages';

  return (
    <Link
      to="/fil"
      className="btn btn--soft btn--sm"
      aria-label={label}
      title={label}
      style={{ gap: 8, position: 'relative' }}
    >
      <Bell size={16} />
      <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>Fil</span>
      {/*
        Pas d'`AnimatePresence` ici, volontairement.
        Il maintient l'élément dans le DOM le temps de l'animation de sortie :
        pour une pastille de compteur, cela ferait rester visible un chiffre
        devenu faux (le « 2 » subsisterait après lecture). Le `key` porté sur la
        valeur suffit à obtenir le rebond à chaque changement, et la disparition
        est alors immédiate — ce qui est le comportement attendu d'un badge.
      */}
      {count > 0 ? (
        <motion.span
          key={count}
          className="notif-badge notif-badge--pulse"
          initial={{ scale: 0.3, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 520, damping: 20 }}
          aria-hidden="true"
        >
          {count > 99 ? '99+' : count}
        </motion.span>
      ) : null}
      {/* Compteur lisible par les lecteurs d'écran, sans doublon visuel. */}
      <span className="sr-only">{count} nouveauté{count > 1 ? 's' : ''} non lue{count > 1 ? 's' : ''}</span>
    </Link>
  );
}
