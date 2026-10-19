import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BarChart3,
  Bell,
  BookOpen,
  BookOpenText,
  Calendar,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  Compass,
  GraduationCap,
  Languages,
  LayoutDashboard,
  LogOut,
  Music4,
  NotebookText,
  PenTool,
  Settings,
  Sparkles,
  Timer,
  UserRound,
} from 'lucide-react';
import { useAuth, useCatalog, useUi, toggleTheme } from '../../lib/store.js';
import { useLocalStorage } from '../../lib/hooks.js';
import { Logo } from '../ui/Feedback.js';
import { IconButton } from '../ui/Button.js';

interface NavEntry {
  to: string;
  label: string;
  icon: typeof Compass;
  end?: boolean;
}

interface NavGroup {
  id: string;
  title: string;
  icon: typeof Compass;
  entries: NavEntry[];
  /** Ouvert par défaut tant que l'utilisateur n'a rien choisi. */
  defaultOpen?: boolean;
}

const GROUPS: NavGroup[] = [
  {
    id: 'apprendre',
    title: 'Apprendre',
    icon: GraduationCap,
    defaultOpen: true,
    entries: [
      // Cible la vraie route du tableau de bord : `/` n'est qu'une redirection,
      // l'entrée ne serait jamais surlignée sur la page réelle.
      { to: '/tableau-de-bord', label: 'Tableau de bord', icon: LayoutDashboard, end: true },
      { to: '/assistant', label: 'Aide aux devoirs', icon: Sparkles },
      { to: '/quiz', label: 'Quiz', icon: GraduationCap },
      { to: '/lecons', label: 'Leçons', icon: BookOpenText },
      { to: '/fiches', label: 'Fiches de révision', icon: NotebookText },
      { to: '/progression', label: 'Progression', icon: BarChart3 },
    ],
  },
  {
    id: 'outils',
    title: 'Outils',
    icon: Compass,
    entries: [
      { to: '/planning', label: 'Planning de révision', icon: CalendarDays },
      // `end: true` : « Tous les outils » ne reste pas actif sur /outils/horloge,
      // /outils/minuteur, etc. (chaque outil a sa propre entrée active).
      { to: '/outils', label: 'Tous les outils', icon: Compass, end: true },
      { to: '/outils/horloge', label: 'Horloge', icon: Timer },
      { to: '/outils/minuteur', label: 'Minuteur', icon: Timer },
      { to: '/outils/chronometre', label: 'Chronomètre', icon: Timer },
      { to: '/outils/tableau', label: 'Tableau interactif', icon: PenTool },
      { to: '/outils/calendrier', label: 'Calendrier', icon: Calendar },
      { to: '/outils/traducteur', label: 'Traducteur', icon: Languages },
      { to: '/outils/musique', label: 'Musique', icon: Music4 },
    ],
  },
  {
    id: 'espace',
    title: 'Mon espace',
    icon: UserRound,
    entries: [
      { to: '/profil', label: 'Mon profil', icon: BookOpen },
      { to: '/parametres', label: 'Paramètres', icon: Settings },
      { to: '/devoirs', label: 'Mes devoirs', icon: ClipboardList },
      { to: '/fil', label: 'Fil & sondages', icon: Bell },
    ],
  },
];

/** Une entrée est-elle active pour le chemin courant ? */
function entryActive(entry: NavEntry, pathname: string): boolean {
  if (entry.end) return pathname === entry.to;
  return pathname === entry.to || pathname.startsWith(`${entry.to}/`);
}

/**
 * Groupe de navigation dépliable.
 *
 * L'ouverture/fermeture anime la hauteur (0 ↔ auto) pendant que les entrées
 * apparaissent en cascade ; l'état est mémorisé (localStorage) et le groupe
 * contenant la page courante s'ouvre tout seul à chaque navigation.
 */
function NavGroupBlock({
  group,
  open,
  onToggle,
  pathname,
  onNavigate,
}: {
  group: NavGroup;
  open: boolean;
  onToggle: () => void;
  pathname: string;
  onNavigate: () => void;
}) {
  const activeCount = group.entries.filter((entry) => entryActive(entry, pathname)).length;
  return (
    <div className={`nav-group${open ? ' nav-group--open' : ''}`}>
      <button type="button" className="nav-group__head" aria-expanded={open} aria-controls={`navgroup-${group.id}`} onClick={onToggle}>
        <span className="nav-group__icon" aria-hidden="true">
          <group.icon size={15} />
        </span>
        <span className="nav-group__title">{group.title}</span>
        {activeCount > 0 && !open ? <span className="nav-group__dot" aria-hidden="true" /> : null}
        <span className="nav-group__count" aria-hidden="true">
          {group.entries.length}
        </span>
        <motion.span className="nav-group__chevron" animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }} aria-hidden="true">
          <ChevronDown size={15} />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="items"
            id={`navgroup-${group.id}`}
            className="nav-group__items"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="nav-group__inner">
              {group.entries.map((entry, index) => (
                <motion.div
                  key={entry.to}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, transition: { duration: 0.12 } }}
                  transition={{ duration: 0.26, delay: 0.03 + index * 0.035, ease: [0.22, 1, 0.36, 1] }}
                >
                  <NavLink
                    to={entry.to}
                    end={entry.end}
                    onClick={onNavigate}
                    className={({ isActive }) => `nav-item${isActive ? ' nav-item--active' : ''}`}
                  >
                    <span className="nav-item__icon" aria-hidden="true">
                      <entry.icon size={19} />
                    </span>
                    <span>{entry.label}</span>
                  </NavLink>
                </motion.div>
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** Navigation latérale : sections dépliables (état mémorisé), outils, compte. */
export function Sidebar() {
  const { user, logout } = useAuth();
  const { sidebarOpen, setSidebar, notify } = useUi();
  const stats = useCatalog((state) => state.stats);
  const levelName = useCatalog((state) =>
    user?.level && typeof user.level === 'string' ? (state.levels.find((level) => level.id === user.level)?.name ?? null) : null,
  );
  const navigate = useNavigate();
  const location = useLocation();

  /* État mémorisé des groupes : l'élève retrouve sa barre telle quelle. */
  const [stored, setStored] = useLocalStorage<Record<string, boolean>>('edumate:nav-groups', {});
  const isOpen = (group: NavGroup): boolean => stored[group.id] ?? Boolean(group.defaultOpen);
  const toggle = (group: NavGroup): void => setStored((prev) => ({ ...prev, [group.id]: !(prev[group.id] ?? Boolean(group.defaultOpen)) }));

  /* Le groupe de la page courante s'ouvre tout seul (sinon l'entrée active
     serait invisible : déroutant après un changement de page). */
  useEffect(() => {
    const target = GROUPS.find((group) => group.entries.some((entry) => entryActive(entry, location.pathname)));
    if (!target) return;
    setStored((prev) => (prev[target.id] ?? Boolean(target.defaultOpen) ? prev : { ...prev, [target.id]: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const close = (): void => setSidebar(false);

  // Charge le catalogue (idempotent) : badge « sujets disponibles » + niveau.
  useEffect(() => {
    void useCatalog.getState().load();
  }, []);

  const onLogout = async (): Promise<void> => {
    await logout();
    close();
    notify('À bientôt sur EduMate 👋', 'info');
    navigate('/connexion');
  };

  const openCount = useMemo(() => GROUPS.filter((group) => isOpen(group)).length, [stored]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {sidebarOpen ? <div className="scrim" onClick={close} role="presentation" /> : null}
      <aside className={`sidebar${sidebarOpen ? ' is-open' : ''}`} aria-label="Navigation principale">
        <div className="sidebar__brand">
          <Logo size={40} />
          <span>
            EduMate
            <span style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: 'var(--ed-text-mute)', letterSpacing: '0.08em' }}>
              RÉUSSIR ENSEMBLE
            </span>
          </span>
        </div>

        <nav className="sidebar__nav">
          {GROUPS.map((group) => (
            <NavGroupBlock
              key={group.id}
              group={group}
              open={isOpen(group)}
              onToggle={() => toggle(group)}
              pathname={location.pathname}
              onNavigate={close}
            />
          ))}
          {openCount === 0 ? (
            <p className="ed-small ed-mute" style={{ padding: '10px 12px' }}>
              Tout est replié 🙂 Clique sur un titre de section pour l’ouvrir.
            </p>
          ) : null}
        </nav>

        <div className="sidebar__footer">
          {stats ? (
            <p style={{ fontSize: '0.72rem', color: 'var(--ed-text-mute)', padding: '0 10px 10px', fontWeight: 600 }}>
              📚 {stats.topics.toLocaleString('fr-FR')} sujets de quiz disponibles
            </p>
          ) : null}
          <div className="ed-row" style={{ gap: 6 }}>
            <button type="button" className="user-chip ed-grow" onClick={() => { navigate('/profil'); close(); }}>
              <span className="user-chip__avatar" aria-hidden="true">
                {user?.avatar ?? '🦉'}
              </span>
              <span className="user-chip__text ed-grow">
                <span className="user-chip__name">{user?.firstName ?? 'Invité'}</span>
                <span className="user-chip__meta">{levelName ?? 'Mon profil'}</span>
              </span>
            </button>
            <IconButton label="Changer de thème" onClick={toggleTheme} variant="ghost" size="sm">
              <Sparkles size={17} />
            </IconButton>
            <IconButton label="Se déconnecter" onClick={onLogout} variant="ghost" size="sm">
              <LogOut size={17} />
            </IconButton>
          </div>
        </div>
      </aside>
    </>
  );
}

/** Indicateur de progression de lecture (barre fine sous la barre du haut). */
export function ScrollProgress() {
  const [progress, setProgress] = useState(0);
  const location = useLocation();

  useEffect(() => {
    setProgress(0);
  }, [location.pathname]);

  useEffect(() => {
    const onScroll = (): void => {
      const height = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(height > 0 ? Math.min(1, window.scrollY / height) : 0);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [location.pathname]);

  return (
    <motion.div
      aria-hidden="true"
      style={{
        position: 'absolute',
        left: 0,
        bottom: -1,
        height: 3,
        borderRadius: 999,
        background: 'linear-gradient(90deg, var(--ed-primary), var(--ed-accent))',
        width: `${progress * 100}%`,
      }}
    />
  );
}
