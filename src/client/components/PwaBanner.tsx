import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CloudOff, RefreshCw, WifiOff } from 'lucide-react';
import { Button } from './ui/Button.js';
import { applyUpdateAndReload, getPwaState, onPwaStateChange, type PwaState } from '../lib/pwa.js';

/**
 * Bandeau PWA, affiché en surimpression en bas de l'écran.
 *
 * Deux situations seulement — toutes deux transitoires, et toutes deux
 * susceptibles de tromper l'élève si elles restent silencieuses :
 *
 *   1. **Nouvelle version en attente.** Après un redéploiement Render, le
 *      nouveau service worker est installé mais n'agit pas sur l'onglet ouvert.
 *      Sans proposition explicite, l'élève continuerait d'utiliser l'ancienne
 *      version indéfiniment (les navigateurs n'activent un worker en attente
 *      qu'à la fermeture de tous les onglets).
 *
 *   2. **Hors ligne.** Le contenu vient du cache. Le dire évite de faire croire
 *      à un bug quand un enregistrement échoue.
 *
 * Monté une seule fois dans `App.tsx`, donc présent sur toutes les pages —
 * y compris publiques, où l'onglet peut rester ouvert longtemps.
 */
export function PwaBanner() {
  const [state, setPwa] = useState<PwaState>(getPwaState);

  useEffect(() => onPwaStateChange(setPwa), []);

  const showUpdate = state.updateReady;
  // Un onglet ouvert sans réseau : on signale, mais on ne harcèle pas si une
  // mise à jour est déjà proposée (le rechargement réglera les deux).
  const showOffline = !showUpdate && state.offline;

  return (
    <AnimatePresence>
      {showUpdate || showOffline ? (
        <motion.div
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 18,
            transform: 'translateX(-50%)',
            zIndex: 200,
            maxWidth: 'min(560px, calc(100vw - 28px))',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
            padding: '12px 16px',
            borderRadius: 14,
            background: 'var(--ed-surface)',
            border: `1px solid ${showOffline ? 'var(--ed-warning)' : 'var(--ed-border)'}`,
            boxShadow: 'var(--ed-shadow-lg)',
          }}
        >
          <span aria-hidden="true" style={{ color: showOffline ? 'var(--ed-warning)' : 'var(--ed-primary)', display: 'flex' }}>
            {showOffline ? <WifiOff size={19} /> : <CloudOff size={19} />}
          </span>

          <span className="ed-grow" style={{ minWidth: 180 }}>
            {showOffline ? (
              <>
                <strong style={{ display: 'block', fontSize: '0.92rem' }}>Connexion interrompue</strong>
                <span className="ed-small ed-mute">
                  L’interface vient du cache. Tes données sont intactes, mais les enregistrements attendront le retour
                  du réseau.
                </span>
              </>
            ) : (
              <>
                <strong style={{ display: 'block', fontSize: '0.92rem' }}>Nouvelle version disponible</strong>
                <span className="ed-small ed-mute">Recharge pour en profiter — tes données sont conservées.</span>
              </>
            )}
          </span>

          {showUpdate ? (
            <Button size="sm" variant="primary" icon={<RefreshCw size={15} />} onClick={() => applyUpdateAndReload()}>
              Recharger
            </Button>
          ) : null}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
