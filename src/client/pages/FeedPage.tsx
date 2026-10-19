import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell,
  BellOff,
  CalendarClock,
  CheckCheck,
  ChevronRight,
  Info,
  Megaphone,
  Rocket,
  TriangleAlert,
} from 'lucide-react';
import { Button, IconButton } from '../components/ui/Button.js';
import { Card, CardSubtitle, CardTitle } from '../components/ui/Card.js';
import { Badge } from '../components/ui/Badge.js';
import { Empty, Loader, Markdown, Notice } from '../components/ui/Feedback.js';
import { useFeed, notificationPermission, requestNotificationPermission, startFeedPolling } from '../lib/feedStore.js';
import { useDocumentTitle } from '../lib/hooks.js';
import { toast, useAuth } from '../lib/store.js';
import { formatRelative } from '../lib/format.js';
import type { FeedImportance, FeedItem, Poll } from '../../shared/types.js';
import type { NotificationPermissionState } from '../lib/feedStore.js';

/** Apparence d'une annonce selon son importance. */
const IMPORTANCE_STYLE: Record<FeedImportance, { icon: typeof Info; tone: 'default' | 'primary' | 'warning' | 'danger'; label: string; color: string }> = {
  info: { icon: Info, tone: 'default', label: 'Information', color: 'var(--ed-info, #0ea5e9)' },
  update: { icon: Rocket, tone: 'primary', label: 'Nouveauté', color: 'var(--ed-primary)' },
  urgent: { icon: TriangleAlert, tone: 'danger', label: 'Important', color: 'var(--ed-danger, #e11d48)' },
};

/* ------------------------------------------------------------------ */
/*  Sondage                                                            */
/* ------------------------------------------------------------------ */

/**
 * Carte de sondage.
 *
 * Deux états d'affichage :
 *   - **avant vote** : les options sont des boutons ;
 *   - **après vote** (ou sondage clos) : les résultats en barres animées, avec
 *     le choix de l'élève mis en évidence.
 *
 * L'élève peut changer d'avis tant que le sondage est ouvert : cliquer sur une
 * autre option remplace son vote (comportement garanti côté serveur, qui
 * décrémente l'ancien choix et n'augmente `voters` qu'une fois).
 */
function PollCard({ poll, myVotes, busy, onVote }: { poll: Poll; myVotes: string[]; busy: boolean; onVote: (optionIds: string[]) => void }) {
  const totalVotes = poll.options.reduce((sum, option) => sum + option.count, 0);
  const hasVoted = myVotes.length > 0;
  const closed = poll.closed || (Boolean(poll.closesAt) && new Date(poll.closesAt as string).getTime() < Date.now());
  const showResults = hasVoted || closed;
  const [selected, setSelected] = useState<string[]>(myVotes);

  useEffect(() => {
    setSelected(myVotes);
  }, [myVotes]);

  const toggleOption = (optionId: string): void => {
    if (busy || closed) return;
    if (poll.singleChoice) {
      setSelected([optionId]);
      onVote([optionId]);
      return;
    }
    const next = selected.includes(optionId) ? selected.filter((id) => id !== optionId) : [...selected, optionId];
    setSelected(next);
  };

  return (
    <div className="ed-stack" style={{ gap: 8, marginTop: 12 }}>
      {poll.options.map((option) => {
        const percent = totalVotes > 0 ? Math.round((option.count / totalVotes) * 100) : 0;
        const mine = (showResults ? myVotes : selected).includes(option.id);
        const clickable = !showResults && !closed;

        if (showResults) {
          return (
            <div key={option.id} className="poll-bar" aria-label={`${option.label} : ${percent} %`}>
              <motion.span
                className="poll-bar__fill"
                initial={{ width: 0 }}
                animate={{ width: `${percent}%` }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              />
              <span className="poll-bar__label">
                <span className="ed-row" style={{ gap: 6, minWidth: 0 }}>
                  {mine ? <CheckCheck size={14} style={{ color: 'var(--ed-primary)', flex: '0 0 auto' }} /> : null}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{option.label}</span>
                </span>
                <span style={{ fontVariantNumeric: 'tabular-nums', flex: '0 0 auto' }}>
                  {percent} % · {option.count}
                </span>
              </span>
            </div>
          );
        }

        return (
          <button
            key={option.id}
            type="button"
            className="notif-item"
            aria-pressed={mine}
            disabled={busy || closed}
            onClick={() => toggleOption(option.id)}
            style={{ cursor: busy || closed ? 'progress' : 'pointer' }}
          >
            <span className="check-dot" aria-hidden="true" style={{ marginTop: 0 }}>
              {mine ? <CheckCheck size={12} /> : null}
            </span>
            <span className="ed-grow" style={{ fontSize: '0.9rem', fontWeight: 600 }}>
              {option.label}
            </span>
          </button>
        );
      })}

      <div className="ed-row" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <span className="ed-small ed-mute">
          {closed ? (
            <>
              <CalendarClock size={13} style={{ verticalAlign: -2 }} /> Sondage clos
            </>
          ) : (
            <>
              {totalVotes} vote{totalVotes > 1 ? 's' : ''} · {poll.voters} participant{poll.voters > 1 ? 's' : ''}
            </>
          )}
        </span>
        {!poll.singleChoice && !showResults && !closed ? (
          <Button size="sm" variant="primary" disabled={busy || !selected.length} onClick={() => onVote(selected)}>
            Valider ({selected.length})
          </Button>
        ) : null}
      </div>
      {showResults && !closed ? (
        <p className="ed-small ed-mute" style={{ margin: 0 }}>
          Tu peux encore changer d’avis : clique sur une autre réponse.
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Élément du fil                                                     */
/* ------------------------------------------------------------------ */

function FeedEntry({ item, unread }: { item: FeedItem; unread: boolean }) {
  const polls = useFeed((state) => state.polls);
  const myVotes = useFeed((state) => state.myVotes);
  const votingId = useFeed((state) => state.votingId);
  const vote = useFeed((state) => state.vote);
  const markRead = useFeed((state) => state.markRead);
  const style = IMPORTANCE_STYLE[item.importance] ?? IMPORTANCE_STYLE.info;
  const Icon = item.kind === 'poll' ? Megaphone : style.icon;
  const poll: Poll | undefined = item.pollId ? polls[item.pollId] : undefined;

  const onVote = async (optionIds: string[]): Promise<void> => {
    if (!item.pollId) return;
    const ok = await vote(item.pollId, optionIds);
    if (ok) toast.success('Vote enregistré. Merci !');
    else toast.error('Le vote n’a pas pu être enregistré.');
  };

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
      className={`card${unread ? ' feed-item--unread' : ''}`}
      style={{ padding: '16px 18px', borderLeft: unread ? `3px solid ${style.color}` : undefined }}
      onMouseEnter={() => {
        if (unread) void markRead(item.id);
      }}
    >
      <div className="ed-row" style={{ justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <span className="ed-row" style={{ gap: 8, minWidth: 0 }}>
          <span style={{ color: style.color, display: 'flex', flex: '0 0 auto' }} aria-hidden="true">
            <Icon size={18} />
          </span>
          <strong style={{ fontSize: '1.02rem', overflowWrap: 'anywhere' }}>{item.title}</strong>
        </span>
        <span className="ed-row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <Badge tone={style.tone}>{item.kind === 'poll' ? 'Sondage' : style.label}</Badge>
          {unread ? <Badge tone="warning">Nouveau</Badge> : null}
        </span>
      </div>

      {item.body ? (
        <div style={{ marginTop: 10 }}>
          <Markdown>{item.body}</Markdown>
        </div>
      ) : null}

      {poll ? (
        <PollCard poll={poll} myVotes={myVotes[poll.id] ?? []} busy={votingId === poll.id} onVote={(ids) => void onVote(ids)} />
      ) : null}

      <div className="ed-row" style={{ justifyContent: 'space-between', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
        <span className="ed-small ed-mute">
          {formatRelative(item.createdAt)}
          {item.authorName ? ` · publié par l’équipe` : ''}
        </span>
        {item.link ? (
          <Link to={item.link} className="btn btn--ghost btn--sm">
            Ouvrir <ChevronRight size={14} />
          </Link>
        ) : null}
      </div>
    </motion.article>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function FeedPage() {
  useDocumentTitle('Fil & sondages');
  const user = useAuth((state) => state.user);
  const items = useFeed((state) => state.items);
  const unreadCount = useFeed((state) => state.unreadCount);
  const loaded = useFeed((state) => state.loaded);
  const loading = useFeed((state) => state.loading);
  const error = useFeed((state) => state.error);
  const load = useFeed((state) => state.load);
  const markAllRead = useFeed((state) => state.markAllRead);
  /*
   * Sélecteurs atomiques pour l'état de lecture.
   *
   * ⚠️ Ne PAS utiliser `useFeed.getState()` pendant le rendu : la valeur lue ne
   * déclencherait aucun re-rendu, et un élément marqué comme lu resterait
   * affiché « Nouveau » jusqu'au prochain changement d'autre chose. C'est la
   * convention du projet (voir `docs/ARCHITECTURE.md` §6).
   */
  const readIds = useFeed((state) => state.readIds);
  const readAllAt = useFeed((state) => state.readAllAt);

  const [permission, setPermission] = useState<NotificationPermissionState>(notificationPermission());
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  useEffect(() => {
    void load();
    // Le badge doit continuer de se mettre à jour pendant la lecture du fil.
    startFeedPolling();
  }, [load, user?.id]);

  /** Un élément est-il non lu ? Même règle que `countUnread()` côté serveur. */
  const isUnread = useCallback(
    (item: FeedItem): boolean => {
      if (readIds.includes(item.id)) return false;
      const cutoff = readAllAt ? new Date(readAllAt).getTime() : 0;
      const created = new Date(item.createdAt).getTime();
      return Number.isFinite(created) ? created > cutoff : true;
    },
    [readIds, readAllAt],
  );

  const visible = useMemo(() => (filter === 'unread' ? items.filter(isUnread) : items), [items, filter, isUnread]);

  const askPermission = async (): Promise<void> => {
    const result = await requestNotificationPermission();
    setPermission(result);
    if (result === 'granted') toast.success('Notifications activées.');
    else if (result === 'denied') toast.warning('Notifications refusées par le navigateur.');
    else toast.info('Tu peux activer les notifications plus tard depuis les réglages du site.');
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="ed-row" style={{ gap: 10 }}>
            <Bell size={24} aria-hidden="true" /> Fil & sondages
          </h1>
          <p className="ed-soft" style={{ maxWidth: '62ch', marginTop: 6 }}>
            Les nouveautés d’EduMate et les sondages de l’équipe. Le badge dans la barre supérieure indique le nombre
            d’éléments que tu n’as pas encore vus.
          </p>
        </div>
        <div className="ed-row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <Button
            variant={filter === 'all' ? 'primary' : 'soft'}
            size="sm"
            onClick={() => setFilter('all')}
            aria-pressed={filter === 'all'}
          >
            Tout ({items.length})
          </Button>
          <Button
            variant={filter === 'unread' ? 'primary' : 'soft'}
            size="sm"
            onClick={() => setFilter('unread')}
            aria-pressed={filter === 'unread'}
          >
            Non lus ({unreadCount})
          </Button>
          {unreadCount > 0 ? (
            <Button variant="ghost" size="sm" icon={<CheckCheck size={15} />} onClick={() => void markAllRead()}>
              Tout marquer lu
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" icon={<Bell size={15} />} onClick={() => void load()} disabled={loading}>
            Actualiser
          </Button>
        </div>
      </div>

      {/* Notifications de bureau : permission explicitement demandée. */}
      {permission !== 'granted' && permission !== 'unsupported' ? (
        <Card flat style={{ marginBottom: 16 }}>
          <div className="ed-row" style={{ justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <CardTitle icon={<Bell size={16} />}>Être prévenu sans regarder l’onglet</CardTitle>
              <CardSubtitle>
                Une notification de bureau s’affichera quand une nouveauté ou un sondage apparaît, même si cet onglet est
                en arrière-plan.
              </CardSubtitle>
            </div>
            <Button size="sm" variant="primary" onClick={() => void askPermission()}>
              Activer les notifications
            </Button>
          </div>
        </Card>
      ) : null}

      {permission === 'denied' ? (
        <Notice tone="warning">
          <span className="ed-row" style={{ gap: 8 }}>
            <BellOff size={16} aria-hidden="true" />
            Les notifications de bureau sont bloquées par ton navigateur. Le badge rouge, lui, reste actif.
          </span>
        </Notice>
      ) : null}

      {error ? <Notice tone="danger">{error}</Notice> : null}

      {loading && !loaded ? <Loader label="Chargement du fil…" large /> : null}

      {loaded && !loading && visible.length === 0 ? (
        <Empty
          emoji="🦉"
          title={filter === 'unread' ? 'Aucune nouveauté à lire' : 'Le fil est vide pour l’instant'}
          description={
            filter === 'unread'
              ? 'Tu es à jour : tout a été lu. Reviens plus tard, les annonces apparaîtront ici.'
              : 'Les annonces et les sondages publiés par l’équipe s’afficheront ici.'
          }
          action={
            <Link to="/tableau-de-bord">
              <Button variant="primary">Retour au tableau de bord</Button>
            </Link>
          }
        />
      ) : null}

      <div className="ed-stack" style={{ gap: 14 }}>
        <AnimatePresence initial={false}>
          {visible.map((item) => (
            <FeedEntry key={item.id} item={item} unread={isUnread(item)} />
          ))}
        </AnimatePresence>
      </div>

      {user?.role === 'admin' ? (
        <Card flat style={{ marginTop: 20 }}>
          <div className="ed-row" style={{ justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <CardTitle icon={<Megaphone size={16} />}>Espace de publication</CardTitle>
              <CardSubtitle>
                Tu es administrateur : publie une nouveauté ou crée un sondage depuis le panneau d’administration.
              </CardSubtitle>
            </div>
            <Link to="/admin">
              <Button variant="soft" size="sm" iconRight={<ChevronRight size={15} />}>
                Ouvrir le panneau
              </Button>
            </Link>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

