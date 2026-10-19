import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/store.js';
import { Loader } from '../components/ui/Feedback.js';
import { WakeScreen } from '../components/ui/WakeScreen.js';

/**
 * Étiquette de chargement adaptée à l'état du serveur.
 *
 * Pendant un réveil de conteneur (plan gratuit Render, ~30 s), afficher un
 * simple « Vérification de ta session… » laisse croire à un blocage. On indique
 * la vraie cause et le fait que des tentatives sont en cours.
 */
function sessionLabel(waking: boolean, attempts: number): string {
  if (!waking) return 'Vérification de ta session…';
  return attempts > 1
    ? `Le serveur se réveille… nouvelle tentative ${attempts} en cours`
    : 'Le serveur se réveille, quelques secondes…';
}

/**
 * Garde de route : exige une session valide.
 * Sans connexion, l'élève est renvoyé vers la page de connexion en
 * conservant l'URL demandée (il y reviendra après authentification).
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const status = useAuth((state) => state.status);
  const waking = useAuth((state) => state.waking);
  const attempts = useAuth((state) => state.sessionAttempts);
  const location = useLocation();

  if (status === 'loading') {
    return <WakeScreen />;
  }
  if (status !== 'authenticated') {
    return <Navigate to="/connexion" state={{ from: location.pathname + location.search }} replace />;
  }
  return <>{children}</>;
}

/** Réservé aux visiteurs non connectés (connexion, inscription, accueil). */
export function GuestOnly({ children }: { children: ReactNode }) {
  const status = useAuth((state) => state.status);
  const waking = useAuth((state) => state.waking);
  const attempts = useAuth((state) => state.sessionAttempts);
  if (status === 'loading') return <WakeScreen />;
  if (status === 'authenticated') return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** Réservé aux administrateurs. */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const user = useAuth((state) => state.user);
  const status = useAuth((state) => state.status);
  if (status === 'loading') return <Loader label="Chargement…" />;
  if (!user || user.role !== 'admin') return <Navigate to="/" replace />;
  return <>{children}</>;
}
