import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarClock, Check, ClipboardList, Plus, Trash2, X } from 'lucide-react';
import { IconButton } from '../ui/Button.js';
import { endpoints } from '../../lib/api.js';
import { toast, useAuth } from '../../lib/store.js';
import { formatDayLabel, isoDate } from '../../lib/format.js';
import type { Task } from '../../../shared/types.js';

/**
 * Accès rapide aux devoirs, dans la barre supérieure.
 *
 * Volontairement **compact** : une liste de tâches à cocher et un champ d'ajout,
 * pas un écran complet. La gestion fine (calendrier, matières, échéances
 * détaillées) reste dans `/devoirs` et `/outils/calendrier`, accessibles par le
 * lien en pied de panneau.
 *
 * Trois points de robustesse :
 *   - **mise à jour optimiste avec retour arrière** : cocher une tâche est
 *     instantané, mais un échec réseau restaure l'état précédent et le signale ;
 *   - **fermeture au clic extérieur et à Échap**, sans piège à focus ;
 *   - **aucune requête si l'élève n'est pas connecté**.
 */

interface HomeworkSummary {
  tasks: Task[];
  overdueCount: number;
}

export function HomeworkButton() {
  const user = useAuth((state) => state.user);
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [overdueCount, setOverdueCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  /* --------------------------- Chargement --------------------------- */

  const load = useCallback(async (): Promise<void> => {
    if (!user) {
      setTasks([]);
      setOverdueCount(0);
      return;
    }
    setLoading(true);
    try {
      // `today()` renvoie tâches ET événements en une seule requête : c'est ce
      // qui permet d'afficher aussi les devoirs du calendrier en retard.
      const data = await endpoints.today();
      setTasks(Array.isArray(data.tasks) ? data.tasks : []);
      setOverdueCount(Array.isArray(data.overdue) ? data.overdue.length : 0);
    } catch {
      // Silencieux : un bouton de barre supérieure ne doit jamais interrompre
      // l'élève par une erreur de chargement.
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  // Rechargement à l'ouverture : les devoirs ont pu être modifiés ailleurs
  // (page /devoirs, autre onglet) depuis le dernier rafraîchissement.
  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  /* --------------------- Fermeture extérieur / Échap --------------------- */

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent | TouchEvent): void => {
      const box = boxRef.current;
      if (!box) return;
      if (!box.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (open && showForm) {
      // Léger délai : laisse l'animation d'entrée se dérouler avant de capturer
      // le focus, sinon certains navigateurs ignorent l'appel.
      const timer = window.setTimeout(() => inputRef.current?.focus(), 60);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [open, showForm]);

  /* ------------------------------ Actions ------------------------------ */

  /** Tâches à faire, les plus urgentes d'abord. */
  const pending = useMemo(() => {
    const todo = tasks.filter((task) => !task.done);
    const withDate = (task: Task): number => (task.dueDate ? new Date(task.dueDate).getTime() : Number.MAX_SAFE_INTEGER);
    return [...todo].sort((a, b) => withDate(a) - withDate(b) || a.createdAt.localeCompare(b.createdAt));
  }, [tasks]);

  const doneCount = useMemo(() => tasks.filter((task) => task.done).length, [tasks]);

  /** Bascule avec mise à jour optimiste et retour arrière en cas d'échec. */
  const toggle = async (task: Task): Promise<void> => {
    const previous = tasks;
    const nextDone = !task.done;
    setBusyId(task.id);
    setTasks((current) => current.map((item) => (item.id === task.id ? { ...item, done: nextDone } : item)));
    try {
      await endpoints.updateTask(task.id, { done: nextDone });
    } catch (error) {
      setTasks(previous);
      toast.fromError(error, 'Impossible de mettre à jour ce devoir.');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (task: Task): Promise<void> => {
    const previous = tasks;
    setBusyId(task.id);
    setTasks((current) => current.filter((item) => item.id !== task.id));
    try {
      await endpoints.deleteTask(task.id);
    } catch (error) {
      setTasks(previous);
      toast.fromError(error, 'Impossible de supprimer ce devoir.');
    } finally {
      setBusyId(null);
    }
  };

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    const title = draft.trim();
    if (!title) return;
    if (title.length > 140) {
      toast.warning('Le titre est trop long (140 caractères maximum).');
      return;
    }
    setSubmitting(true);
    try {
      const result = await endpoints.createTask({ title, done: false });
      setTasks(Array.isArray(result.tasks) ? result.tasks : [...tasks, result.task]);
      setDraft('');
      setShowForm(false);
      toast.success('Devoir ajouté.');
    } catch (error) {
      toast.fromError(error, 'Impossible d’ajouter ce devoir.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) return null;

  const badgeCount = pending.length;

  return (
    <div style={{ position: 'relative' }} ref={boxRef}>
      <button
        type="button"
        className="btn btn--soft btn--sm"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={badgeCount > 0 ? `Devoirs : ${badgeCount} à faire` : 'Devoirs'}
        title="Mes devoirs"
        style={{ gap: 8, position: 'relative' }}
      >
        <ClipboardList size={16} />
        <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>Devoirs</span>
        {badgeCount > 0 ? (
          <motion.span
            key={badgeCount}
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 520, damping: 22 }}
            className="notif-badge"
            aria-hidden="true"
          >
            {badgeCount > 99 ? '99+' : badgeCount}
          </motion.span>
        ) : null}
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.18 }}
            className="card"
            role="dialog"
            aria-label="Mes devoirs"
            style={{
              position: 'absolute',
              right: 0,
              top: 'calc(100% + 10px)',
              width: 'min(340px, calc(100vw - 32px))',
              zIndex: 80,
              padding: 14,
              boxShadow: 'var(--ed-shadow-lg)',
            }}
          >
            <div className="ed-row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <strong style={{ fontSize: '0.95rem' }}>Devoirs à faire</strong>
              <IconButton label="Fermer" size="sm" variant="ghost" onClick={() => setOpen(false)}>
                <X size={16} />
              </IconButton>
            </div>

            {overdueCount > 0 ? (
              <p className="ed-small" style={{ margin: '8px 0 0', color: 'var(--ed-danger)', display: 'flex', gap: 6, alignItems: 'center' }}>
                <CalendarClock size={14} aria-hidden="true" />
                {overdueCount} événement{overdueCount > 1 ? 's' : ''} du calendrier en retard
              </p>
            ) : null}

            <div className="ed-stack" style={{ gap: 4, marginTop: 10, maxHeight: 300, overflowY: 'auto' }}>
              {loading && !tasks.length ? (
                <p className="ed-small ed-mute">Chargement…</p>
              ) : pending.length === 0 ? (
                <p className="ed-small ed-mute" style={{ textAlign: 'center', padding: '14px 0' }}>
                  {doneCount > 0 ? '🎉 Tout est fait !' : 'Aucun devoir en attente.'}
                </p>
              ) : (
                <AnimatePresence initial={false}>
                  {pending.map((task) => (
                    <motion.div
                      key={task.id}
                      layout
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 12, height: 0, marginBottom: 0 }}
                      transition={{ duration: 0.18 }}
                      className="ed-row"
                      style={{ gap: 8, alignItems: 'flex-start', padding: '6px 4px', borderRadius: 8 }}
                    >
                      <button
                        type="button"
                        className="check-dot"
                        aria-pressed={task.done}
                        aria-label={task.done ? `Marquer « ${task.title} » comme à faire` : `Marquer « ${task.title} » comme terminé`}
                        disabled={busyId === task.id}
                        onClick={() => void toggle(task)}
                        style={{ marginTop: 2 }}
                      >
                        {task.done ? <Check size={12} /> : null}
                      </button>
                      <span className="ed-grow" style={{ minWidth: 0 }}>
                        <span
                          style={{
                            display: 'block',
                            fontSize: '0.88rem',
                            fontWeight: 600,
                            textDecoration: task.done ? 'line-through' : 'none',
                            opacity: task.done ? 0.6 : 1,
                            overflowWrap: 'anywhere',
                          }}
                        >
                          {task.title}
                        </span>
                        {task.dueDate ? (
                          <span className="ed-small ed-mute">{formatDayLabel(task.dueDate)}</span>
                        ) : null}
                      </span>
                      <IconButton
                        label={`Supprimer « ${task.title} »`}
                        size="sm"
                        variant="ghost"
                        disabled={busyId === task.id}
                        onClick={() => void remove(task)}
                      >
                        <Trash2 size={14} />
                      </IconButton>
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </div>

            {doneCount > 0 ? (
              <p className="ed-small ed-mute" style={{ margin: '8px 0 0' }}>
                {doneCount} terminé{doneCount > 1 ? 's' : ''}
              </p>
            ) : null}

            {/* Ajout : un seul champ, pour rester compact. */}
            <AnimatePresence initial={false}>
              {showForm ? (
                <motion.form
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.18 }}
                  onSubmit={(event) => void submit(event)}
                  style={{ overflow: 'hidden', marginTop: 10 }}
                >
                  <div className="ed-row" style={{ gap: 6 }}>
                    <input
                      ref={inputRef}
                      className="input"
                      value={draft}
                      maxLength={140}
                      placeholder="Ex. : Exercices de maths p. 42"
                      aria-label="Titre du devoir"
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                          event.stopPropagation();
                          setShowForm(false);
                          setDraft('');
                        }
                      }}
                    />
                    <IconButton label="Valider l’ajout" type="submit" size="sm" variant="primary" disabled={submitting || !draft.trim()}>
                      <Check size={16} />
                    </IconButton>
                  </div>
                </motion.form>
              ) : null}
            </AnimatePresence>

            <div className="ed-row" style={{ justifyContent: 'space-between', gap: 8, marginTop: 12 }}>
              {showForm ? (
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => { setShowForm(false); setDraft(''); }}>
                  <X size={14} /> Annuler
                </button>
              ) : (
                <button type="button" className="btn btn--soft btn--sm" onClick={() => setShowForm(true)}>
                  <Plus size={14} /> Ajouter
                </button>
              )}
              <Link to="/devoirs" className="btn btn--ghost btn--sm" onClick={() => setOpen(false)}>
                Tout gérer
              </Link>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** Formate la date d'échéance en libellé lisible. */
export function todayIso(): string {
  return isoDate(new Date());
}
