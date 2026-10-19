import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { AlertTriangle, Home, RotateCw } from 'lucide-react';
import { Button } from './Button.js';

interface ErrorBoundaryProps {
  children: ReactNode;
  /**
   * Clé de réinitialisation : quand elle change, l'erreur est oubliée et
   * l'interface reprend la main. On y place le chemin de la route, afin qu'une
   * erreur survenue sur une page ne condamne pas toute l'application.
   */
  resetKey?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Barrière d'erreur React.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Pourquoi ce composant existe
 * ─────────────────────────────────────────────────────────────────────────
 * Sans barrière, la moindre exception levée pendant le rendu fait **démonter
 * tout l'arbre** : l'élève se retrouve devant un écran entièrement blanc, sans
 * message, sans bouton, sans comprendre ce qui vient de se passer. Le seul
 * indice est une ligne dans la console — qu'il ne regarde jamais.
 *
 * `main.tsx` affiche bien un bandeau `#boot-error` sur les erreurs globales,
 * mais il est pensé pour le démarrage : il ne propose qu'un diagnostic, pas de
 * reprise. Ici, l'interface reste debout et propose deux sorties concrètes
 * (recharger, revenir à l'accueil).
 *
 * La barrière est volontairement **par route** et non globale : une page cassée
 * ne doit pas empêcher d'accéder aux autres.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Trace complète en console pour le diagnostic ; l'élève, lui, voit un
    // message lisible et actionnable.
    console.error('[EduMate] Erreur d’interface rattrapée :', error, info.componentStack);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div className="card" style={{ maxWidth: 520, width: '100%', padding: 28, textAlign: 'center' }}>
          <span
            aria-hidden="true"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 54,
              height: 54,
              borderRadius: '50%',
              // rgba en dur plutôt que `color-mix()` : supporté partout, y
              // compris sur les navigateurs scolaires non mis à jour.
              background: 'rgba(225, 29, 72, 0.12)',
              color: 'var(--ed-danger)',
              marginBottom: 14,
            }}
          >
            <AlertTriangle size={26} />
          </span>
          <h2 style={{ marginTop: 0, marginBottom: 8 }}>Cette page a rencontré un imprévu</h2>
          <p className="ed-mute" style={{ marginBottom: 20, lineHeight: 1.6 }}>
            Rien n’est perdu : tes données sont enregistrées côté serveur. Recharge la page pour
            reprendre la main, ou repars de l’accueil.
          </p>
          {/*
            Le détail technique reste visible (replié) : utile pour signaler un
            problème précis, sans agresser l'élève qui n'en a pas besoin.
          */}
          <details style={{ textAlign: 'left', marginBottom: 20 }}>
            <summary className="ed-small ed-mute" style={{ cursor: 'pointer' }}>
              Détail technique
            </summary>
            <pre
              className="ed-small"
              style={{
                marginTop: 8,
                padding: 12,
                borderRadius: 10,
                background: 'var(--ed-surface-3)',
                overflowX: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {error.message || String(error)}
            </pre>
          </details>
          <div className="ed-row" style={{ gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button variant="primary" icon={<RotateCw size={16} />} onClick={() => window.location.reload()}>
              Recharger la page
            </Button>
            {/*
              Lien natif et non `<Link>` : la barrière ne doit dépendre d'AUCUN
              contexte (routeur compris). Si c'est le routeur lui-même qui a
              cassé, un `<Link>` lèverait à son tour et l'écran de secours ne
              s'afficherait jamais — exactement ce qu'on veut éviter.
            */}
            <a href="/tableau-de-bord" style={{ textDecoration: 'none' }}>
              <Button variant="soft" icon={<Home size={16} />}>
                Retour à l’accueil
              </Button>
            </a>
          </div>
        </div>
      </div>
    );
  }
}

/**
 * Barrière branchée sur la route courante : naviguer suffit à la réarmer.
 * À utiliser à l'intérieur du `BrowserRouter`.
 */
export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const location = useLocation();
  return <ErrorBoundary resetKey={location.pathname}>{children}</ErrorBoundary>;
}
