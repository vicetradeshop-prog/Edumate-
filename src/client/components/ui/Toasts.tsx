import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useUi, type ToastKind } from '../../lib/store.js';

const ICONS: Record<ToastKind, typeof Info> = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

/** Notifications empilées en bas à droite (bas de page sur mobile). */
export function Toasts() {
  const toasts = useUi((state) => state.toasts);
  const dismiss = useUi((state) => state.dismiss);

  return createPortal(
    <div className="toast-stack" aria-live="polite" aria-atomic="false">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const Icon = ICONS[toast.kind];
          return (
            <motion.div
              key={toast.id}
              className={`toast toast--${toast.kind}`}
              initial={{ opacity: 0, y: 18, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, scale: 0.97 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              role={toast.kind === 'error' ? 'alert' : 'status'}
            >
              <Icon size={18} style={{ flex: 'none', marginTop: 1 }} aria-hidden="true" />
              <span className="ed-grow">{toast.message}</span>
              <button type="button" onClick={() => dismiss(toast.id)} aria-label="Fermer la notification" style={{ color: 'var(--ed-text-mute)' }}>
                <X size={15} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
