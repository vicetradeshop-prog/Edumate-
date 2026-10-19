import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { IconButton } from './Button.js';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  /**
   * Sélecteur CSS du champ à focaliser à l'ouverture. Par défaut : le premier
   * champ de saisie du formulaire, sinon la modale elle-même.
   */
  initialFocus?: string;
}

/**
 * Sélecteurs des éléments focalisables.
 *
 * ⚠️ Ils sont volontairement SANS préfixe `.modal` : les requêtes sont menées
 * depuis le panneau (`panelRef`), qui porte lui-même la classe `.modal`. Or
 * `panneau.querySelectorAll('.modal input')` ne renvoie RIEN — le `.modal` de
 * tête devrait être un ancêtre du champ situé à l'intérieur du panneau, ce qui
 * est impossible. Vérifié expérimentalement :
 *     panel.querySelectorAll('.modal input') → 0
 *     panel.querySelectorAll('input')        → 1
 *
 * Cibler le panneau plutôt que `document` corrige au passage un second défaut :
 * avec `document.querySelectorAll('.modal …')`, deux modales ouvertes ensemble
 * (c'est le cas dans AdminPage) mélangeaient leurs éléments dans le piège à
 * focus. Chaque modale ne voit désormais que les siens.
 */
const FIELD_SELECTOR =
  'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled])';
const FOCUSABLE_SELECTOR =
  'a[href], button:not(:disabled), input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Remet les éléments dans l'ORDRE DU DOCUMENT.
 *
 * Le spécification impose à `querySelectorAll` de retourner les correspondances
 * dans l'ordre du document, mais avec une liste de sélecteurs séparés par des
 * virgules certains moteurs (nwsapi/jsdom) les regroupent par sélecteur : on
 * obtenait « Fermer → Enregistrer → Valider → Titre → Date » au lieu de l'ordre
 * visuel. Comme le piège à focus désigne `nodes[0]` et `nodes[n-1]`, cet ordre
 * est critique. Le tri explicite rend le comportement identique partout.
 */
function inDocumentOrder<T extends HTMLElement>(nodes: T[]): T[] {
  return [...nodes].sort((a, b) => {
    if (a === b) return 0;
    // eslint-disable-next-line no-bitwise
    return a.compareDocumentPosition(b) & 4 ? -1 : 1; // 4 = DOCUMENT_POSITION_FOLLOWING
  });
}

/**
 * Modale accessible : focus piégé, fermeture par Échap ou clic sur le fond,
 * rendu dans un portail pour échapper aux contraintes d'empilement.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEUX BUGS CORRIGÉS (ils provoquaient un vol de focus à chaque frappe) :
 *
 * 1. L'effet dépendait de `onClose`. Or tous les appels passent une fonction
 *    fléchée en ligne (`onClose={() => setDraft(null)}`), dont l'identité change
 *    à CHAQUE rendu. L'effet se ré-exécutait donc en permanence et réarmait le
 *    `setTimeout` de focus initial : dès qu'un champ mettait l'état à jour
 *    (une lettre saisie dans le titre du calendrier), le focus était arraché au
 *    champ 60 ms plus tard.
 *    → `onClose` est stocké dans une `ref` : l'effet ne dépend plus que de
 *      `open`, et le focus initial n'est donné qu'à l'ouverture réelle.
 *
 * 2. Le focus initial visait `.modal input, .modal button, …`. `querySelector`
 *    renvoie le premier élément en ORDRE DU DOCUMENT qui satisfait l'un des
 *    sélecteurs : c'était le bouton « Fermer » (la croix de l'en-tête), placé
 *    avant les champs. D'où le focus qui revenait systématiquement sur la croix.
 *    → On cible d'abord un vrai champ de saisie, et la croix est marquée
 *      `data-modal-close` puis exclue du focus initial.
 * ─────────────────────────────────────────────────────────────────────────
 */
export function Modal({ open, onClose, title, children, footer, wide = false, initialFocus }: ModalProps) {
  // `onClose` est lu via une ref : son identité changeante ne relance plus l'effet.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const panelRef = useRef<HTMLDivElement>(null);
  // Mémorise l'élément qui avait le focus avant l'ouverture, pour le restituer.
  const restoreRef = useRef<HTMLElement | null>(null);

  /* -------------------- Focus initial + verrou de scroll ------------------ */
  useEffect(() => {
    if (!open) return;

    restoreRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Délai court : laisse l'animation d'entrée commencer et le DOM se placer.
    const timer = window.setTimeout(() => {
      const scope = panelRef.current;
      if (!scope) return;
      const target =
        (initialFocus ? scope.querySelector<HTMLElement>(initialFocus) : null) ??
        inDocumentOrder([...scope.querySelectorAll<HTMLElement>(FIELD_SELECTOR)])[0] ??
        scope;
      // `preventScroll` évite un saut de page quand la modale est longue.
      target.focus({ preventScroll: true });
    }, 60);

    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = previousOverflow;
      restoreRef.current?.focus?.({ preventScroll: true });
      restoreRef.current = null;
    };
    // Dépendance volontairement limitée à `open` : voir l'en-tête du composant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialFocus]);

  /* --------------------- Clavier : Échap + focus piégé -------------------- */
  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const scope = panelRef.current;
      if (!scope) return;
      // ⚠️ Ne pas utiliser `offsetParent` : `.modal-backdrop` est en
      // `position: fixed`, or un descendant d'un ancêtre fixe a un
      // `offsetParent` nul même s'il est parfaitement visible — tous les
      // éléments auraient été écartés et le piège à focus serait resté inerte.
      // `getClientRects()` reste fiable dans ce cas.
      const all = [...scope.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)];
      const visible = all.filter((node) => node.getClientRects().length > 0);
      // Repli : dans un environnement sans mise en page (jsdom, tests de rendu),
      // `getClientRects()` est toujours vide. On préfère alors la liste complète
      // plutôt qu'un piège à focus inerte.
      const nodes = inDocumentOrder(visible.length ? visible : all);
      if (!nodes.length) return;

      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;

      // Focus hors de la modale : on le ramène à l'intérieur.
      if (!scope.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus({ preventScroll: true });
        return;
      }
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="modal-backdrop" onClick={() => closeRef.current()} role="presentation">
          <motion.div
            ref={panelRef}
            className={`modal${wide ? ' modal--wide' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-label={typeof title === 'string' ? title : 'Fenêtre de dialogue'}
            // La modale elle-même est focalisable : dernier recours si aucun
            // champ n'existe (modales de confirmation), sans jamais viser la croix.
            tabIndex={-1}
            onClick={(event) => event.stopPropagation()}
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="modal__header">
              <h2 style={{ fontSize: '1.25rem' }}>{title}</h2>
              <span data-modal-close="">
                <IconButton label="Fermer" onClick={() => closeRef.current()} variant="ghost" size="sm">
                  <X size={18} />
                </IconButton>
              </span>
            </div>
            {children}
            {footer ? <div className="modal__footer">{footer}</div> : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
