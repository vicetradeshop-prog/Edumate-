import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar as CalendarIcon,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Layers,
  ListTree,
  Pencil,
  Plus,
  Search,
  Target,
  Trash2,
  X,
} from 'lucide-react';
import { Button, IconButton } from '../../components/ui/Button.js';
import { Card, CardSubtitle, CardTitle } from '../../components/ui/Card.js';
import { Badge } from '../../components/ui/Badge.js';
import { Empty, Loader, Notice } from '../../components/ui/Feedback.js';
import { SelectFromOptions, TextArea, TextInput, Toggle } from '../../components/ui/Field.js';
import { Modal } from '../../components/ui/Modal.js';
import { ToolShell } from '../../components/tools/ToolShell.js';
import { ExternalLink } from 'lucide-react';
import { endpoints } from '../../lib/api.js';
import { useApi } from '../../lib/data.js';
import { toast, useAuth, useCatalog } from '../../lib/store.js';
import { isoDate } from '../../lib/format.js';
import {
  URGENCY_META,
  addDays,
  addMonths,
  buildMonthGrid,
  buildWeekGrid,
  computeCalendarStats,
  countdownLabel,
  buildIcs,
  eventsOfMonth,
  filterEventsByQuery,
  fromIsoDate,
  groupByDate,
  longDayLabel,
  monthTitle,
  overdueEvents,
  startOfWeek,
  toIsoDate,
  upcomingEvents,
  urgencyOf,
  weekNumber,
  type Urgency,
} from '../../lib/calendar.js';
import { useDocumentTitle } from '../../lib/hooks.js';
import type { CalendarEvent, EventKind } from '../../../shared/types.js';

/* ------------------------------------------------------------------ */
/*  Constantes                                                         */
/* ------------------------------------------------------------------ */

const KINDS: { id: EventKind; label: string; emoji: string; color: string }[] = [
  { id: 'devoir', label: 'Devoir', emoji: '✏️', color: '#6c5ce7' },
  { id: 'examen', label: 'Examen', emoji: '📝', color: '#e11d48' },
  { id: 'travail', label: 'Session de travail', emoji: '📖', color: '#0ea5e9' },
  { id: 'autre', label: 'Autre', emoji: '📌', color: '#16a34a' },
];

const kindOf = (id: string): (typeof KINDS)[number] => KINDS.find((kind) => kind.id === id) ?? KINDS[3];

const DOW = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

type ViewMode = 'mois' | 'semaine' | 'agenda';

interface DraftEvent {
  id?: string;
  title: string;
  kind: EventKind;
  subjectId: string;
  date: string;
  time: string;
  notes: string;
  done: boolean;
}

const emptyDraft = (date: string): DraftEvent => ({
  title: '',
  kind: 'devoir',
  subjectId: '',
  date,
  time: '',
  notes: '',
  done: false,
});

/** Courbes d'animation réutilisées pour une sensation cohérente. */
const EASE = [0.22, 1, 0.36, 1] as const;

/* ------------------------------------------------------------------ */
/*  Pastille de compte à rebours                                       */
/* ------------------------------------------------------------------ */

/**
 * Un événement vient-il du planning de révision ?
 * Rôle du calendrier : montrer QUAND ; rôle du planning : gérer QUOI faire.
 * Les séances synchronisées portent un marqueur dans `notes` : on l'affiche
 * clairement (« Planning ») et on renvoie toute gestion vers le planning,
 * pour éviter l'impression de doublon ou les désynchronisations.
 */
function planningInfo(event: CalendarEvent): { examId: string; kind: 'session' | 'exam' } | null {
  const notes = event.notes ?? '';
  if (notes.startsWith('planning:')) {
    return { examId: notes.split(':')[1] ?? '', kind: 'session' };
  }
  if (notes.startsWith('planning-exam:')) {
    return { examId: notes.slice('planning-exam:'.length).split(' ·')[0] ?? '', kind: 'exam' };
  }
  return null;
}

/** Notes lisibles (marqueur technique retiré). */
function cleanNotes(event: CalendarEvent): string {
  return (event.notes ?? '').replace(/^planning(-exam)?:[^·]*·\s*/, '');
}

function CountdownChip({ event, now }: { event: CalendarEvent; now: Date }) {
  const urgency: Urgency = urgencyOf(event, now);
  const meta = URGENCY_META[urgency];
  return (
    <span
      className="cal-chip"
      style={{ borderColor: meta.color, color: meta.color }}
      title={`Échéance : ${longDayLabel(event.date, now)}`}
    >
      {countdownLabel(event, now)}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Ligne d'événement (agenda, panneau de jour, semaine)               */
/* ------------------------------------------------------------------ */

function EventRow({
  event,
  now,
  onToggle,
  onEdit,
  onDelete,
  onDuplicate,
  compact = false,
}: {
  event: CalendarEvent;
  now: Date;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate?: () => void;
  compact?: boolean;
}) {
  const kind = kindOf(event.kind);
  const planning = planningInfo(event);
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 20, height: 0, marginTop: 0, marginBottom: 0 }}
      transition={{ duration: 0.22, ease: EASE }}
      className="list-item"
      style={{ background: 'var(--ed-surface-2)', borderRadius: 12, borderLeft: `3px solid ${kind.color}` }}
    >
      {planning ? (
        <span className="cal-plan-dot" title="Séance du planning de révision" aria-label="Séance du planning de révision">
          📚
        </span>
      ) : (
        <button
          type="button"
          className="check-dot"
          aria-pressed={event.done}
          aria-label={event.done ? `Marquer « ${event.title} » comme à faire` : `Marquer « ${event.title} » comme terminé`}
          onClick={onToggle}
          style={{ marginTop: 0 }}
        >
          {event.done ? <Check size={12} /> : null}
        </button>
      )}
      <span className="list-item__body" style={{ minWidth: 0 }}>
        <span className="list-item__title" style={{ textDecoration: event.done ? 'line-through' : undefined, opacity: event.done ? 0.65 : 1 }}>
          <span aria-hidden="true">{planning ? '📚' : kind.emoji}</span> {event.title}
          {planning ? <span className="cal-plan-badge">Planning</span> : null}
        </span>
        <span className="list-item__meta ed-row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <span>{event.time ?? 'Journée entière'}</span>
          {event.subjectId ? <span>· {event.subjectId}</span> : null}
          {planning ? (
            <span>· même séance que dans ton planning — gère-la là-bas</span>
          ) : event.notes && !compact ? (
            <span>· {cleanNotes(event)}</span>
          ) : null}
        </span>
      </span>
      {!compact ? <CountdownChip event={event} now={now} /> : null}
      <span className="ed-row" style={{ gap: 2, flex: '0 0 auto' }}>
        {planning ? (
          <Link to={`/planning/${encodeURIComponent(planning.examId)}`} title="Ouvrir dans le planning">
            <Button size="sm" variant="soft" icon={<ExternalLink size={14} />}>
              Planning
            </Button>
          </Link>
        ) : (
          <>
            {onDuplicate ? (
              <IconButton label={`Dupliquer « ${event.title} »`} size="sm" variant="ghost" onClick={onDuplicate}>
                <Copy size={15} />
              </IconButton>
            ) : null}
            <IconButton label={`Modifier « ${event.title} »`} size="sm" variant="ghost" onClick={onEdit}>
              <Pencil size={15} />
            </IconButton>
            <IconButton label={`Supprimer « ${event.title} »`} size="sm" variant="ghost" onClick={onDelete}>
              <Trash2 size={15} />
            </IconButton>
          </>
        )}
      </span>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function CalendarToolPage() {
  useDocumentTitle('Calendrier');
  const user = useAuth((state) => state.user);
  const subjects = useCatalog((state) => state.subjects);

  const [now, setNow] = useState(() => new Date());
  const [cursor, setCursor] = useState(() => {
    const today = new Date();
    return { year: today.getFullYear(), month: today.getMonth(), date: toIsoDate(today) };
  });
  const [view, setView] = useState<ViewMode>('mois');
  const [direction, setDirection] = useState(0);
  const [draft, setDraft] = useState<DraftEvent | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CalendarEvent | null>(null);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [hiddenKinds, setHiddenKinds] = useState<EventKind[]>([]);
  const [showDone, setShowDone] = useState(true);
  const [dayPanel, setDayPanel] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const events = useApi(() => endpoints.events(), { deps: [user?.id] });

  useEffect(() => {
    void useCatalog.getState().load();
  }, []);

  /*
   * Horloge interne : le compte à rebours descend à l'heure (« dans 3 h »), il
   * doit donc se rafraîchir. Une minute suffit, et l'intervalle est arrêté au
   * démontage.
   */
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const allEvents = useMemo(() => events.data?.events ?? [], [events.data]);

  /* ------------------------------ Filtrage ------------------------------ */

  const visible = useMemo(() => {
    let list = allEvents;
    if (hiddenKinds.length) list = list.filter((event) => !hiddenKinds.includes(event.kind));
    if (!showDone) list = list.filter((event) => !event.done);
    if (query.trim()) list = filterEventsByQuery(list, query);
    return list;
  }, [allEvents, hiddenKinds, showDone, query]);

  const byDate = useMemo(() => groupByDate(visible), [visible]);
  const stats = useMemo(() => computeCalendarStats(allEvents, now), [allEvents, now]);
  const overdue = useMemo(() => overdueEvents(visible, now), [visible, now]);
  /*
   * Échéances à suivre = retards D'ABORD, puis ce qui arrive.
   *
   * 🔴 Sans cela, un événement en retard tombé le mois précédent devenait
   * invisible : la vue mensuelle n'affiche que le mois courant, et la colonne ne
   * listait que les échéances futures. Un devoir oublié disparaissait donc
   * complètement de l'écran — exactement ce qu'un calendrier ne doit jamais faire.
   */
  const upcoming = useMemo(
    () => [...overdueEvents(visible, now), ...upcomingEvents(visible, now)],
    [visible, now],
  );

  /* ------------------------------- Grilles ------------------------------ */

  const monthGrid = useMemo(() => buildMonthGrid(cursor.year, cursor.month), [cursor.year, cursor.month]);
  const weekGrid = useMemo(() => buildWeekGrid(fromIsoDate(cursor.date) ?? now), [cursor.date, now]);
  const monthEvents = useMemo(() => eventsOfMonth(visible, cursor.year, cursor.month), [visible, cursor.year, cursor.month]);

  /*
   * Jour de référence effectif — celui utilisé par « Nouvel événement », par la
   * surbrillance de la grille et par le panneau du jour.
   *
   * 🔴 Il est TOUJOURS ramené dans la période affichée. C'est le filet de
   * sécurité qui garantit qu'un événement créé est immédiatement visible :
   * quel que soit le chemin emprunté (navigation, recherche, retour arrière),
   * la date proposée appartient à la grille sous les yeux de l'élève.
   */
  const selectedIso = useMemo((): string => {
    const monthKey = `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}`;
    const inView = (iso: string): boolean => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
      if (view === 'mois') return iso.slice(0, 7) === monthKey;
      return iso >= toIsoDate(weekGrid[0]) && iso <= toIsoDate(weekGrid[6]);
    };
    const candidate = dayPanel ?? cursor.date;
    if (inView(candidate)) return candidate;
    const todayIso = toIsoDate(now);
    if (inView(todayIso)) return todayIso;
    return view === 'mois' ? `${monthKey}-01` : toIsoDate(weekGrid[0]);
  }, [dayPanel, cursor.date, cursor.year, cursor.month, view, weekGrid, now]);

  /* ------------------------------ Navigation ---------------------------- */

  const goToday = useCallback((): void => {
    const today = new Date();
    setDirection(0);
    setCursor({ year: today.getFullYear(), month: today.getMonth(), date: toIsoDate(today) });
    setDayPanel(toIsoDate(today));
  }, []);

  const navigate = useCallback(
    (delta: number): void => {
      setDirection(delta);
      if (view === 'mois') {
        const next = addMonths(new Date(cursor.year, cursor.month, 1), delta);
        const year = next.getFullYear();
        const month = next.getMonth();
        /*
         * 🔴 La date de référence DOIT suivre le mois affiché.
         *
         * L'ancien code conservait `date: prev.date` : après avoir feuilleté
         * jusqu'en janvier, « Nouvel événement » proposait encore la date du
         * mois de départ. Le devoir était bien créé… mais trois mois plus tôt,
         * hors de la grille affichée. Résultat vécu par l'élève : « j'ajoute un
         * événement et il disparaît ».
         *
         * Règle retenue : aujourd'hui si le mois affiché est le mois courant
         * (cas de loin le plus fréquent), sinon le 1er du mois affiché.
         */
        const today = new Date();
        const date = toIsoDate(
          today.getFullYear() === year && today.getMonth() === month ? today : new Date(year, month, 1),
        );
        setCursor({ year, month, date });
        // Le panneau du jour décrirait un jour hors grille : on le referme.
        setDayPanel((prev) => (prev && prev.slice(0, 7) === `${year}-${String(month + 1).padStart(2, '0')}` ? prev : null));
        return;
      }
      setCursor((prev) => {
        const base = fromIsoDate(prev.date) ?? new Date();
        const next = addDays(base, delta * 7);
        return { year: next.getFullYear(), month: next.getMonth(), date: toIsoDate(next) };
      });
      setDayPanel(null);
    },
    [view, cursor.year, cursor.month],
  );

  const selectDay = useCallback((iso: string): void => {
    const date = fromIsoDate(iso);
    if (!date) return;
    setDayPanel(iso);
    setCursor((prev) => ({ year: date.getFullYear(), month: date.getMonth(), date: iso }));
  }, []);

  /* ------------------------------- Actions ------------------------------ */

  const openNew = (date: string): void => {
    setError(null);
    setDraft(emptyDraft(date));
  };

  const openEdit = (event: CalendarEvent): void => {
    setError(null);
    setDraft({
      id: event.id,
      title: event.title,
      kind: event.kind,
      subjectId: event.subjectId ?? '',
      date: event.date,
      time: event.time ?? '',
      notes: event.notes ?? '',
      done: event.done,
    });
  };

  const duplicate = (event: CalendarEvent): void => {
    setError(null);
    setDraft({ ...emptyDraft(event.date), title: `${event.title} (copie)`, kind: event.kind, subjectId: event.subjectId ?? '', time: event.time ?? '', notes: event.notes ?? '' });
  };

  const save = async (): Promise<void> => {
    if (!draft) return;
    if (!draft.title.trim()) {
      setError('Donne un titre à cet événement.');
      return;
    }
    if (draft.title.trim().length > 140) {
      setError('Le titre est trop long (140 caractères maximum).');
      return;
    }
    if (!fromIsoDate(draft.date)) {
      setError('La date est invalide (format AAAA-MM-JJ attendu).');
      return;
    }
    if (draft.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.time)) {
      setError('L’heure est invalide (format HH:MM attendu).');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        id: draft.id,
        title: draft.title.trim(),
        kind: draft.kind,
        subjectId: draft.subjectId || undefined,
        date: draft.date,
        time: draft.time || undefined,
        notes: draft.notes.trim() || undefined,
        done: draft.done,
      };
      if (draft.id) await endpoints.updateEvent(draft.id, payload);
      else await endpoints.createEvent(payload);
      toast.success(draft.id ? 'Événement mis à jour.' : 'Événement ajouté à ton calendrier.');
      setDraft(null);
      void events.reload();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Enregistrement impossible.';
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const toggleDone = async (event: CalendarEvent): Promise<void> => {
    /*
     * Bascule de l'état « terminé ».
     *
     * La réponse de l'API contient déjà la liste complète des événements : on
     * l'utilise telle quelle au lieu de relancer une requête. En cas d'échec,
     * `events.reload()` resynchronise l'affichage avec le serveur — sans cela,
     * un échec réseau laisserait à l'écran un état que la base ne connaît pas.
     *
     * (Une version précédente contenait `void previous.length ? … : …` :
     * l'opérateur `void` étant plus prioritaire que `?:`, l'expression valait
     * `(void previous.length) ? …`, donc toujours `undefined`. TypeScript 5.6+
     * le signale en TS2873 « This kind of expression is always falsy », et le
     * build échouait. La branche est désormais explicite.)
     */
    try {
      await endpoints.updateEvent(event.id, { done: !event.done });
      void events.reload();
      toast.success(event.done ? 'Remis dans tes tâches à faire.' : 'Marqué comme terminé.');
    } catch (err) {
      toast.fromError(err, 'Mise à jour impossible.');
      void events.reload();
    }
  };

  const remove = async (event: CalendarEvent): Promise<void> => {
    setConfirmDelete(null);
    try {
      await endpoints.deleteEvent(event.id);
      toast.success('Événement supprimé.');
      void events.reload();
    } catch (err) {
      toast.fromError(err, 'Suppression impossible.');
    }
  };

  const exportIcs = (): void => {
    const list = view === 'mois' ? monthEvents : visible;
    if (!list.length) {
      toast.info('Aucun événement à exporter pour cette vue.');
      return;
    }
    try {
      const blob = new Blob([buildIcs(list, 'EduMate — calendrier')], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = view === 'mois' ? `edumate-${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}.ics` : 'edumate-calendrier.ics';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      // Libéré après le téléchargement : trop tôt et le fichier ne part pas.
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast.success(`${list.length} événement(s) exporté(s) au format .ics.`);
    } catch (err) {
      toast.fromError(err, 'L’export a échoué.');
    }
  };

  /* ---------------------------- Raccourcis clavier ----------------------- */

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      // Ne jamais intercepter pendant la saisie dans un champ.
      const target = event.target as HTMLElement | null;
      const typing = Boolean(target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable));
      if (typing) {
        if (event.key === 'Escape') (target as HTMLInputElement).blur();
        return;
      }
      if (draft || confirmDelete) return; // une modale gère déjà le clavier

      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault();
          navigate(-1);
          break;
        case 'ArrowRight':
          event.preventDefault();
          navigate(1);
          break;
        case 't':
        case 'T':
          goToday();
          break;
        case 'n':
        case 'N':
          event.preventDefault();
          openNew(selectedIso);
          break;
        case '/':
          event.preventDefault();
          setSearchOpen(true);
          window.setTimeout(() => searchRef.current?.focus(), 40);
          break;
        case '1':
          setView('mois');
          break;
        case '2':
          setView('semaine');
          break;
        case '3':
          setView('agenda');
          break;
        case 'Escape':
          if (searchOpen) {
            setSearchOpen(false);
            setQuery('');
          } else if (dayPanel) {
            setDayPanel(null);
          }
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate, goToday, draft, confirmDelete, dayPanel, selectedIso, searchOpen]);

  /* ------------------------------- Rendu -------------------------------- */

  const todayIso = toIsoDate(now);
  const dayEvents = byDate.get(selectedIso) ?? [];
  const title = view === 'mois'
    ? monthTitle(cursor.year, cursor.month, now)
    : `${toIsoDate(weekGrid[0]).slice(8)} – ${toIsoDate(weekGrid[6]).slice(8)} ${monthTitle(weekGrid[6].getFullYear(), weekGrid[6].getMonth(), now)}`;

  return (
    <ToolShell
      title="Calendrier"
      description="Devoirs, examens et sessions de travail : trois vues, un compte à rebours sur chaque échéance, et tout est synchronisé avec ton compte."
      icon={<CalendarIcon size={24} />}
      aside={
        <>
          <Card>
            <CardTitle icon={<Layers size={16} />}>Repères</CardTitle>
            <div className="cal-stats" style={{ marginTop: 12 }}>
              {[
                { label: 'En retard', value: stats.overdue, color: URGENCY_META.overdue.color },
                { label: 'Aujourd’hui', value: stats.today, color: URGENCY_META.today.color },
                { label: '7 prochains j.', value: stats.next7, color: URGENCY_META.week.color },
                { label: 'Terminés', value: stats.done, color: 'var(--ed-success, #16a34a)' },
              ].map((entry) => (
                <motion.div
                  key={entry.label}
                  className="cal-stat"
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.28, ease: EASE }}
                  style={{ borderTopColor: entry.value > 0 ? entry.color : 'var(--ed-border)' }}
                >
                  <strong style={{ color: entry.value > 0 ? entry.color : undefined }}>{entry.value}</strong>
                  <span>{entry.label}</span>
                </motion.div>
              ))}
            </div>
            {overdue.length > 0 ? (
              <p className="ed-small" style={{ marginTop: 12, color: URGENCY_META.overdue.color }}>
                {overdue.length} échéance{overdue.length > 1 ? 's' : ''} dépassée{overdue.length > 1 ? 's' : ''} à traiter.
              </p>
            ) : null}
          </Card>

          <Card flat>
            <CardTitle>Filtres</CardTitle>
            <div className="pill-grid" style={{ marginTop: 10 }}>
              {KINDS.map((kind) => {
                const hidden = hiddenKinds.includes(kind.id);
                return (
                  <button
                    key={kind.id}
                    type="button"
                    className="pill"
                    aria-pressed={!hidden}
                    onClick={() =>
                      setHiddenKinds((current) =>
                        current.includes(kind.id) ? current.filter((entry) => entry !== kind.id) : [...current, kind.id],
                      )
                    }
                    style={{ ['--pill-color' as string]: kind.color, opacity: hidden ? 0.45 : 1 }}
                  >
                    {kind.emoji} {kind.label}
                  </button>
                );
              })}
            </div>
            <div style={{ marginTop: 12 }}>
              <Toggle checked={showDone} onChange={setShowDone} label="Afficher les événements terminés" />
            </div>
            {hiddenKinds.length > 0 || !showDone || query ? (
              <Button size="sm" variant="ghost" style={{ marginTop: 10 }} icon={<X size={14} />} onClick={() => { setHiddenKinds([]); setShowDone(true); setQuery(''); }}>
                Réinitialiser les filtres
              </Button>
            ) : null}
          </Card>

          <Card flat>
            <CardTitle icon={<CalendarDays size={16} />}>Échéances à suivre</CardTitle>
            <CardSubtitle>Les retards d'abord, puis ce qui arrive.</CardSubtitle>
            {upcoming.length === 0 ? (
              <p className="ed-small ed-mute" style={{ marginTop: 10 }}>
                Rien de prévu. Ajoute ton prochain devoir pour le voir ici.
              </p>
            ) : (
              <div className="ed-stack" style={{ gap: 6, marginTop: 12 }}>
                {upcoming.slice(0, 6).map((event) => (
                  <motion.button
                    key={event.id}
                    type="button"
                    className="cal-upcoming"
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.24, ease: EASE }}
                    onClick={() => selectDay(event.date)}
                    style={{ borderLeftColor: kindOf(event.kind).color }}
                  >
                    <span className="ed-grow" style={{ minWidth: 0 }}>
                      <span className="cal-upcoming__title">
                        {event.title}
                        {planningInfo(event) ? <span className="cal-plan-badge">Planning</span> : null}
                      </span>
                      <span className="cal-upcoming__meta">{longDayLabel(event.date, now)}</span>
                    </span>
                    <CountdownChip event={event} now={now} />
                  </motion.button>
                ))}
              </div>
            )}
          </Card>

          <Card flat>
            <CardTitle>⌨️ Raccourcis</CardTitle>
            <CardSubtitle>
              <code>←</code> <code>→</code> naviguer · <code>T</code> aujourd’hui · <code>N</code> nouvel événement ·{' '}
              <code>/</code> rechercher · <code>1</code> <code>2</code> <code>3</code> changer de vue · <code>Échap</code> fermer
            </CardSubtitle>
          </Card>
        </>
      }
    >
      {/* ----------------------------- Barre d'outils ----------------------- */}
      <div className="cal-toolbar">
        <div className="ed-row" style={{ gap: 8 }}>
          <IconButton label={view === 'mois' ? 'Mois précédent' : 'Semaine précédente'} variant="soft" onClick={() => navigate(-1)}>
            <ChevronLeft size={18} />
          </IconButton>
          <motion.h2
            key={title}
            initial={{ opacity: 0, y: direction >= 0 ? 8 : -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, ease: EASE }}
            className="cal-toolbar__title"
            style={{ minWidth: 190, textTransform: 'capitalize', margin: 0, fontSize: '1.2rem' }}
          >
            {title}
            {view === 'semaine' ? <span className="ed-small ed-mute"> · S{weekNumber(weekGrid[0])}</span> : null}
          </motion.h2>
          <IconButton label={view === 'mois' ? 'Mois suivant' : 'Semaine suivante'} variant="soft" onClick={() => navigate(1)}>
            <ChevronRight size={18} />
          </IconButton>
          <Button size="sm" variant="ghost" onClick={goToday}>
            Aujourd’hui
          </Button>
        </div>

        <div className="ed-row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <div className="btn-group" role="group" aria-label="Choisir la vue">
            {([
              { id: 'mois', label: 'Mois', icon: CalendarIcon },
              { id: 'semaine', label: 'Semaine', icon: CalendarDays },
              { id: 'agenda', label: 'Agenda', icon: ListTree },
            ] as const).map((entry) => {
              const Icon = entry.icon;
              return (
                <button
                  key={entry.id}
                  type="button"
                  className={`btn btn--sm${view === entry.id ? ' btn--primary' : ' btn--ghost'}`}
                  aria-pressed={view === entry.id}
                  onClick={() => setView(entry.id)}
                >
                  <Icon size={15} /> {entry.label}
                </button>
              );
            })}
          </div>
          <IconButton label="Rechercher" variant="ghost" onClick={() => { setSearchOpen((value) => !value); window.setTimeout(() => searchRef.current?.focus(), 40); }}>
            <Search size={17} />
          </IconButton>
          <IconButton label="Exporter au format .ics" variant="ghost" onClick={exportIcs}>
            <Download size={17} />
          </IconButton>
          {/* Pont calendrier → planning : un contrôle se crée depuis l'agenda. */}
          <Link to="/planning?new=1">
            <Button size="sm" variant="soft" icon={<Target size={15} />}>
              Contrôle
            </Button>
          </Link>
          <Button size="sm" variant="primary" icon={<Plus size={16} />} onClick={() => openNew(selectedIso)}>
            Nouvel événement
          </Button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {searchOpen ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: EASE }}
            style={{ overflow: 'hidden', marginBottom: 12 }}
          >
            <div className="ed-row" style={{ gap: 8 }}>
              <input
                ref={searchRef}
                className="input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Rechercher dans tes événements (titre, notes, matière)…"
                aria-label="Rechercher un événement"
                maxLength={120}
              />
              {query ? (
                <IconButton label="Effacer la recherche" variant="ghost" onClick={() => setQuery('')}>
                  <X size={16} />
                </IconButton>
              ) : null}
            </div>
            {query ? (
              <p className="ed-small ed-mute" style={{ marginTop: 6 }}>
                {visible.length} résultat{visible.length > 1 ? 's' : ''} pour « {query} »
              </p>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {events.error ? <Notice tone="danger">{events.error}</Notice> : null}
      {events.loading && !events.data ? <Loader label="Chargement de ton calendrier…" /> : null}

      {/* ------------------------------ Les vues --------------------------- */}
      {/*
        Pas d'`AnimatePresence mode="wait"` ici : il bloque le montage de la
        nouvelle vue jusqu'à la fin de l'animation de sortie de l'ancienne. Si
        cette animation est interrompue (changement de vue rapide, onglet mis en
        arrière-plan, `prefers-reduced-motion`), la nouvelle vue peut ne jamais
        apparaître. Un `motion.div` clé par vue donne la même sensation d'entrée
        glissée, sans ce risque.
      */}
      <div style={{ position: 'relative' }}>
        <motion.div
          key={view}
          initial={{ opacity: 0, x: direction === 0 ? 0 : direction > 0 ? 24 : -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.24, ease: EASE }}
        >
          {view === 'mois' ? (
            <MonthView
              grid={monthGrid}
              byDate={byDate}
              cursorMonth={cursor.month}
              todayIso={todayIso}
              selectedIso={selectedIso}
              now={now}
              onSelectDay={selectDay}
              onOpenEvent={openEdit}
            />
          ) : null}

          {view === 'semaine' ? (
            <WeekView
              grid={weekGrid}
              byDate={byDate}
              todayIso={todayIso}
              selectedIso={selectedIso}
              now={now}
              onSelectDay={selectDay}
              onOpenEvent={openEdit}
              onToggle={toggleDone}
            />
          ) : null}

          {view === 'agenda' ? (
            <AgendaView
              events={visible}
              now={now}
              onToggle={toggleDone}
              onEdit={openEdit}
              onDelete={setConfirmDelete}
              onDuplicate={duplicate}
              onSelectDay={selectDay}
            />
          ) : null}
        </motion.div>
      </div>

      {/* --------------------------- Panneau du jour ----------------------- */}
      <AnimatePresence>
        {dayPanel ? (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.26, ease: EASE }}
          >
            <Card style={{ marginTop: 18 }}>
              <div className="ed-row" style={{ justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <CardTitle icon={<CalendarDays size={16} />}>{longDayLabel(selectedIso, now)}</CardTitle>
                  <CardSubtitle>
                    {dayEvents.length === 0
                      ? 'Rien de prévu ce jour-là.'
                      : `${dayEvents.length} événement${dayEvents.length > 1 ? 's' : ''} · semaine ${weekNumber(fromIsoDate(selectedIso) ?? now)}`}
                  </CardSubtitle>
                </div>
                <span className="ed-row" style={{ gap: 6 }}>
                  <Button size="sm" variant="soft" icon={<Plus size={15} />} onClick={() => openNew(selectedIso)}>
                    Ajouter
                  </Button>
                  <IconButton label="Fermer le panneau du jour" variant="ghost" onClick={() => setDayPanel(null)}>
                    <X size={16} />
                  </IconButton>
                </span>
              </div>
              {dayEvents.length > 0 ? (
                <div className="ed-stack" style={{ gap: 8, marginTop: 14 }}>
                  <AnimatePresence initial={false}>
                    {dayEvents.map((event) => (
                      <EventRow
                        key={event.id}
                        event={event}
                        now={now}
                        compact
                        onToggle={() => void toggleDone(event)}
                        onEdit={() => openEdit(event)}
                        onDelete={() => setConfirmDelete(event)}
                        onDuplicate={() => duplicate(event)}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              ) : null}
            </Card>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* ------------------------ Liste du mois (vue mois) ----------------- */}
      {view === 'mois' ? (
        <div className="ed-stack" style={{ gap: 10, marginTop: 20 }}>
          <div className="ed-row" style={{ justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <CardTitle icon={<CalendarIcon size={16} />}>
              Événements de {monthTitle(cursor.year, cursor.month, now).toLowerCase()}
            </CardTitle>
            <Badge tone="outline">{monthEvents.length}</Badge>
          </div>
          {monthEvents.length === 0 ? (
            <Empty
              emoji="🗓️"
              title={query || hiddenKinds.length ? 'Aucun résultat avec ces filtres' : 'Aucun événement ce mois-ci'}
              description={
                query || hiddenKinds.length
                  ? 'Élargis ta recherche ou réinitialise les filtres pour voir davantage d’événements.'
                  : 'Ajoute tes devoirs et tes sessions de révision pour organiser ton mois.'
              }
            />
          ) : (
            <AnimatePresence initial={false}>
              {monthEvents.map((event) => (
                <EventRow
                  key={event.id}
                  event={event}
                  now={now}
                  onToggle={() => void toggleDone(event)}
                  onEdit={() => openEdit(event)}
                  onDelete={() => setConfirmDelete(event)}
                  onDuplicate={() => duplicate(event)}
                />
              ))}
            </AnimatePresence>
          )}
        </div>
      ) : null}

      {/* ------------------------------ Modales ---------------------------- */}
      <Modal
        open={Boolean(draft)}
        onClose={() => setDraft(null)}
        title={draft?.id ? 'Modifier l’événement' : 'Nouvel événement'}
        footer={
          <>
            {draft?.id ? (
              <Button variant="danger" icon={<Trash2 size={16} />} onClick={() => setConfirmDelete({ ...(draft as unknown as CalendarEvent), id: draft.id } as CalendarEvent)}>
                Supprimer
              </Button>
            ) : null}
            <span className="ed-grow" />
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Annuler
            </Button>
            <Button variant="primary" onClick={() => void save()} disabled={saving} loading={saving}>
              {draft?.id ? 'Enregistrer' : 'Ajouter'}
            </Button>
          </>
        }
      >
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <div className="ed-stack" style={{ gap: 14, marginTop: 12 }}>
          <TextInput
            value={draft?.title ?? ''}
            onChange={(event) => setDraft((current) => (current ? { ...current, title: event.target.value } : current))}
            placeholder="Ex. : Contrôle de maths — chapitre 4"
            aria-label="Titre de l’événement"
            maxLength={140}
            large
          />

          <div className="cal-kind-picker" role="group" aria-label="Type d’événement">
            {KINDS.map((kind) => (
              <button
                key={kind.id}
                type="button"
                className={`cal-kind${draft?.kind === kind.id ? ' cal-kind--active' : ''}`}
                aria-pressed={draft?.kind === kind.id}
                onClick={() => setDraft((current) => (current ? { ...current, kind: kind.id } : current))}
                style={{ ['--kind-color' as string]: kind.color }}
              >
                <span aria-hidden="true">{kind.emoji}</span> {kind.label}
              </button>
            ))}
          </div>

          <div className="ed-row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <label className="ed-stack" style={{ gap: 4, flex: '1 1 160px' }}>
              <span className="ed-small ed-mute">Date</span>
              <input
                className="input"
                type="date"
                value={draft?.date ?? ''}
                onChange={(event) => setDraft((current) => (current ? { ...current, date: event.target.value } : current))}
                aria-label="Date de l’événement"
              />
            </label>
            <label className="ed-stack" style={{ gap: 4, flex: '1 1 130px' }}>
              <span className="ed-small ed-mute">Heure (facultatif)</span>
              <input
                className="input"
                type="time"
                value={draft?.time ?? ''}
                onChange={(event) => setDraft((current) => (current ? { ...current, time: event.target.value } : current))}
                aria-label="Heure de l’événement"
              />
            </label>
          </div>

          <label className="ed-stack" style={{ gap: 4 }}>
            <span className="ed-small ed-mute">Matière (facultatif)</span>
            {/*
              `SelectFromOptions`, et non `Select` : ce dernier attend des
              <option> en enfants et un `onChange` natif (événement), alors que
              la variante accepte une liste `options`. Utiliser le mauvais
              composant compilerait mais n'afficherait aucune matière.
            */}
            <SelectFromOptions
              value={draft?.subjectId ?? ''}
              onChange={(event) => setDraft((current) => (current ? { ...current, subjectId: event.target.value } : current))}
              aria-label="Matière"
              options={[{ value: '', label: '— Aucune —' }, ...subjects.map((subject) => ({ value: subject.id, label: `${subject.emoji} ${subject.name}` }))]}
            />
          </label>

          <label className="ed-stack" style={{ gap: 4 }}>
            <span className="ed-small ed-mute">Notes (facultatif)</span>
            <TextArea
              value={draft?.notes ?? ''}
              onChange={(event) => setDraft((current) => (current ? { ...current, notes: event.target.value } : current))}
              placeholder="Chapitres, matériel à apporter, consignes…"
              aria-label="Notes"
              maxLength={1000}
            />
          </label>

          {draft?.id ? (
            <Toggle
              checked={Boolean(draft?.done)}
              onChange={(checked) => setDraft((current) => (current ? { ...current, done: checked } : current))}
              label="Événement terminé"
              description="Un événement terminé n’apparaît plus dans les échéances à venir."
            />
          ) : null}

          {draft?.date && fromIsoDate(draft.date) ? (
            <p className="ed-small ed-mute" style={{ margin: 0 }}>
              <ChevronDown size={13} style={{ verticalAlign: -2 }} /> {longDayLabel(draft.date, now)} · semaine{' '}
              {weekNumber(fromIsoDate(draft.date) as Date)}
            </p>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        title="Supprimer cet événement ?"
        footer={
          <>
            <span className="ed-grow" />
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              Annuler
            </Button>
            <Button variant="danger" icon={<Trash2 size={16} />} onClick={() => confirmDelete && void remove(confirmDelete)}>
              Supprimer
            </Button>
          </>
        }
      >
        <p style={{ margin: 0 }}>
          « <strong>{confirmDelete?.title}</strong> » du {confirmDelete ? longDayLabel(confirmDelete.date, now) : ''} sera
          définitivement retiré de ton calendrier.
        </p>
      </Modal>
    </ToolShell>
  );
}

/* ------------------------------------------------------------------ */
/*  Vue Mois                                                           */
/* ------------------------------------------------------------------ */

function MonthView({
  grid,
  byDate,
  cursorMonth,
  todayIso,
  selectedIso,
  now,
  onSelectDay,
  onOpenEvent,
}: {
  grid: Date[];
  byDate: Map<string, CalendarEvent[]>;
  cursorMonth: number;
  todayIso: string;
  selectedIso: string;
  now: Date;
  onSelectDay: (iso: string) => void;
  onOpenEvent: (event: CalendarEvent) => void;
}) {
  return (
    <div className="calendar calendar--month" role="grid" aria-label="Vue mensuelle">
      {DOW.map((day) => (
        <div key={day} className="calendar__dow" role="columnheader">
          {day}
        </div>
      ))}
      {grid.map((date) => {
        const key = toIsoDate(date);
        const outside = date.getMonth() !== cursorMonth;
        const isToday = key === todayIso;
        const isSelected = key === selectedIso;
        const dayEvents = byDate.get(key) ?? [];
        const pending = dayEvents.filter((event) => !event.done);
        const urgency = pending.length ? urgencyOf({ ...pending[0], date: key }, now) : null;

        return (
          <motion.button
            key={key}
            type="button"
            role="gridcell"
            layout
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.18, ease: EASE }}
            aria-label={`${date.toLocaleDateString('fr-FR')} — ${dayEvents.length} événement(s)`}
            aria-selected={isSelected}
            aria-current={isToday ? 'date' : undefined}
            className={[
              'calendar__cell',
              outside ? 'calendar__cell--outside' : '',
              isToday ? 'calendar__cell--today' : '',
              isSelected ? 'calendar__cell--selected' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => onSelectDay(key)}
          >
            <span className="calendar__day">{date.getDate()}</span>
            {isToday ? <span className="calendar__today-dot" aria-hidden="true" /> : null}

            <span className="calendar__chips" aria-hidden="true">
              {dayEvents.slice(0, 3).map((event) => {
                const kind = kindOf(event.kind);
                return (
                  <span
                    key={event.id}
                    className="calendar__chip"
                    style={{ background: `${kind.color}1f`, borderLeftColor: kind.color, opacity: event.done ? 0.5 : 1 }}
                    onDoubleClick={(clickEvent) => {
                      clickEvent.stopPropagation();
                      onOpenEvent(event);
                    }}
                  >
                    <span className="calendar__chip-emoji">{planningInfo(event) ? '📚' : kind.emoji}</span>
                    <span className="calendar__chip-title" style={{ textDecoration: event.done ? 'line-through' : undefined }}>
                      {event.title}
                    </span>
                  </span>
                );
              })}
              {dayEvents.length > 3 ? <span className="calendar__chip calendar__chip--more">+{dayEvents.length - 3}</span> : null}
            </span>

            {pending.length > 0 && urgency ? (
              <span className="calendar__urgency" style={{ background: URGENCY_META[urgency].color }} aria-hidden="true" />
            ) : null}
          </motion.button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Vue Semaine                                                        */
/* ------------------------------------------------------------------ */

function WeekView({
  grid,
  byDate,
  todayIso,
  selectedIso,
  now,
  onSelectDay,
  onOpenEvent,
  onToggle,
}: {
  grid: Date[];
  byDate: Map<string, CalendarEvent[]>;
  todayIso: string;
  selectedIso: string;
  now: Date;
  onSelectDay: (iso: string) => void;
  onOpenEvent: (event: CalendarEvent) => void;
  onToggle: (event: CalendarEvent) => void;
}) {
  return (
    <div className="cal-week">
      {grid.map((date) => {
        const key = toIsoDate(date);
        const isToday = key === todayIso;
        const dayEvents = byDate.get(key) ?? [];
        return (
          <motion.div
            key={key}
            className={`cal-week__col${isToday ? ' cal-week__col--today' : ''}${key === selectedIso ? ' cal-week__col--selected' : ''}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: EASE }}
          >
            <button type="button" className="cal-week__head" onClick={() => onSelectDay(key)} aria-current={isToday ? 'date' : undefined}>
              <span className="cal-week__dow">{DOW[(date.getDay() + 6) % 7]}</span>
              <span className="cal-week__num">{date.getDate()}</span>
              {dayEvents.length ? <span className="cal-week__count">{dayEvents.length}</span> : null}
            </button>
            <div className="cal-week__body">
              {dayEvents.length === 0 ? (
                <button type="button" className="cal-week__empty" onClick={() => onSelectDay(key)} aria-label={`Ajouter un événement le ${date.toLocaleDateString('fr-FR')}`}>
                  <Plus size={14} />
                </button>
              ) : (
                dayEvents.map((event) => {
                  const kind = kindOf(event.kind);
                  return (
                    <motion.button
                      key={event.id}
                      type="button"
                      className="cal-week__event"
                      layout
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.2, ease: EASE }}
                      style={{ background: `${kind.color}1a`, borderLeftColor: kind.color }}
                      onClick={() => onOpenEvent(event)}
                      aria-label={`${event.title}, ${event.time ?? 'journée entière'}`}
                    >
                      {event.time ? <span className="cal-week__time">{event.time}</span> : null}
                      <span className="cal-week__title" style={{ textDecoration: event.done ? 'line-through' : undefined }}>
                        {event.title}
                      </span>
                      <span
                        className="cal-week__check"
                        role="checkbox"
                        aria-checked={event.done}
                        tabIndex={0}
                        aria-label={event.done ? 'Marquer comme à faire' : 'Marquer comme terminé'}
                        onClick={(clickEvent) => {
                          clickEvent.stopPropagation();
                          onToggle(event);
                        }}
                        onKeyDown={(keyEvent) => {
                          if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
                            keyEvent.preventDefault();
                            keyEvent.stopPropagation();
                            onToggle(event);
                          }
                        }}
                      >
                        {event.done ? <Check size={10} /> : null}
                      </span>
                    </motion.button>
                  );
                })
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Vue Agenda                                                         */
/* ------------------------------------------------------------------ */

function AgendaView({
  events,
  now,
  onToggle,
  onEdit,
  onDelete,
  onDuplicate,
  onSelectDay,
}: {
  events: CalendarEvent[];
  now: Date;
  onToggle: (event: CalendarEvent) => void;
  onEdit: (event: CalendarEvent) => void;
  onDelete: (event: CalendarEvent) => void;
  onDuplicate: (event: CalendarEvent) => void;
  onSelectDay: (iso: string) => void;
}) {
  const grouped = useMemo(() => groupByDate(events), [events]);
  const dates = useMemo(() => [...grouped.keys()].sort(), [grouped]);

  if (!dates.length) {
    return (
      <Empty
        emoji="🗓️"
        title="Aucun événement à afficher"
        description="Ajoute un devoir, un examen ou une session de travail : l’agenda les regroupera par jour, avec un compte à rebours."
      />
    );
  }

  return (
    <div className="ed-stack" style={{ gap: 18 }}>
      {dates.map((date) => {
        const list = grouped.get(date) ?? [];
        const urgency = urgencyOf(list[0], now);
        return (
          <section key={date}>
            <div className="cal-agenda__head" style={{ borderLeftColor: URGENCY_META[urgency].color }}>
              <button type="button" className="cal-agenda__date" onClick={() => onSelectDay(date)}>
                {longDayLabel(date, now)}
              </button>
              <span className="ed-row" style={{ gap: 8 }}>
                <Badge tone={URGENCY_META[urgency].tone}>{URGENCY_META[urgency].label}</Badge>
                <span className="ed-small ed-mute">S{weekNumber(fromIsoDate(date) ?? now)}</span>
              </span>
            </div>
            <div className="ed-stack" style={{ gap: 8, marginTop: 8 }}>
              <AnimatePresence initial={false}>
                {list.map((event) => (
                  <EventRow
                    key={event.id}
                    event={event}
                    now={now}
                    onToggle={() => onToggle(event)}
                    onEdit={() => onEdit(event)}
                    onDelete={() => onDelete(event)}
                    onDuplicate={() => onDuplicate(event)}
                  />
                ))}
              </AnimatePresence>
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** Réexport utile aux tests et à d'autres écrans. */
export { isoDate, startOfWeek };
