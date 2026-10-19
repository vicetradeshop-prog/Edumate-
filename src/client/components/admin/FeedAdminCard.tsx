import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Megaphone, Plus, Rocket, Trash2, X } from 'lucide-react';
import { Button, IconButton } from '../ui/Button.js';
import { Card, CardSubtitle, CardTitle } from '../ui/Card.js';
import { Badge } from '../ui/Badge.js';
import { Notice } from '../ui/Feedback.js';
import { Segmented, TextInput, Toggle } from '../ui/Field.js';
import { endpoints } from '../../lib/api.js';
import { useApi } from '../../lib/data.js';
import { toast } from '../../lib/store.js';
import { formatRelative } from '../../lib/format.js';
import { useFeed } from '../../lib/feedStore.js';
import type { FeedImportance, FeedItem, Poll } from '../../../shared/types.js';

/**
 * Panneau de publication du fil : actualités et sondages.
 *
 * Réservé aux administrateurs (monté dans `AdminPage`, déjà protégé par
 * `RequireAdmin` côté route et `requireAdmin()` côté API).
 *
 * Deux formulaires volontairement courts : un titre + un corps pour une
 * annonce, une question + des réponses pour un sondage. Rien de superflu, pour
 * que publier reste un geste de trente secondes.
 */

const IMPORTANCES: { value: FeedImportance; label: string }[] = [
  { value: 'info', label: 'Information' },
  { value: 'update', label: 'Nouveauté' },
  { value: 'urgent', label: 'Important' },
];

/** Nombre maximal d'options de sondage (aligné sur la limite serveur). */
const MAX_OPTIONS = 8;

export function FeedAdminCard() {
  const feed = useApi<{ items: FeedItem[]; polls: Record<string, Poll>; total: number }>(
    () => endpoints.adminFeed(),
    { deps: [] },
  );
  const refreshFeed = useFeed((state) => state.load);

  /* ----------------------------- Actualité ----------------------------- */
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [importance, setImportance] = useState<FeedImportance>('update');
  const [link, setLink] = useState('');
  const [publishing, setPublishing] = useState(false);

  /* ------------------------------ Sondage ------------------------------ */
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [singleChoice, setSingleChoice] = useState(true);
  const [creatingPoll, setCreatingPoll] = useState(false);

  const publishNews = async (): Promise<void> => {
    if (title.trim().length < 3) {
      toast.warning('Le titre doit contenir au moins 3 caractères.');
      return;
    }
    if (!body.trim()) {
      toast.warning('Écris le contenu de l’annonce.');
      return;
    }
    setPublishing(true);
    try {
      await endpoints.adminPublishNews({
        title: title.trim(),
        body: body.trim(),
        importance,
        link: link.trim() || undefined,
      });
      setTitle('');
      setBody('');
      setLink('');
      await feed.reload();
      void refreshFeed();
      toast.success('Actualité publiée. Les élèves verront le badge rouge.');
    } catch (error) {
      toast.fromError(error, 'La publication a échoué.');
    } finally {
      setPublishing(false);
    }
  };

  const createPoll = async (): Promise<void> => {
    const clean = options.map((option) => option.trim()).filter(Boolean);
    if (question.trim().length < 3) {
      toast.warning('La question doit contenir au moins 3 caractères.');
      return;
    }
    if (clean.length < 2) {
      toast.warning('Propose au moins deux réponses.');
      return;
    }
    if (new Set(clean.map((option) => option.toLowerCase())).size !== clean.length) {
      toast.warning('Deux réponses sont identiques.');
      return;
    }
    setCreatingPoll(true);
    try {
      await endpoints.adminCreatePoll({ question: question.trim(), options: clean, singleChoice });
      setQuestion('');
      setOptions(['', '']);
      await feed.reload();
      void refreshFeed();
      toast.success('Sondage publié dans le fil.');
    } catch (error) {
      toast.fromError(error, 'La création du sondage a échoué.');
    } finally {
      setCreatingPoll(false);
    }
  };

  const remove = async (item: FeedItem): Promise<void> => {
    try {
      await endpoints.adminDeleteFeedItem(item.id);
      await feed.reload();
      void refreshFeed();
      toast.success('Élément supprimé du fil.');
    } catch (error) {
      toast.fromError(error, 'La suppression a échoué.');
    }
  };

  const toggleClosed = async (poll: Poll): Promise<void> => {
    try {
      await endpoints.adminClosePoll(poll.id, !poll.closed);
      await feed.reload();
      void refreshFeed();
      toast.success(poll.closed ? 'Sondage rouvert.' : 'Sondage clos.');
    } catch (error) {
      toast.fromError(error, 'La modification a échoué.');
    }
  };

  const setOption = (index: number, value: string): void => {
    setOptions((current) => current.map((entry, i) => (i === index ? value : entry)));
  };

  return (
    <Card>
      <CardTitle icon={<Megaphone size={17} />}>Fil d’actualités & sondages</CardTitle>
      <CardSubtitle>
        Publie une nouveauté ou lance un sondage : les élèves voient immédiatement un badge rouge sur l’onglet « Fil »,
        et reçoivent une notification de bureau si l’onglet est en arrière-plan.
      </CardSubtitle>

      {feed.error ? <Notice tone="danger">{feed.error}</Notice> : null}

      {/* ------------------------- Publier une actualité ------------------------ */}
      <div className="ed-stack" style={{ gap: 10, marginTop: 16 }}>
        <strong style={{ fontSize: '0.95rem' }}>
          <Rocket size={15} style={{ verticalAlign: -2 }} /> Publier une actualité
        </strong>
        <TextInput
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Titre (ex. : Nouvelle version — le coach de quiz est arrivé)"
          aria-label="Titre de l’actualité"
          maxLength={140}
        />
        <textarea
          className="input"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Contenu. Markdown léger accepté : **gras**, listes, liens [texte](/chemin). Le HTML est échappé."
          aria-label="Contenu de l’actualité"
          maxLength={5000}
          rows={4}
          style={{ resize: 'vertical', minHeight: 84, fontFamily: 'inherit' }}
        />
        <div className="ed-row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <Segmented
            ariaLabel="Importance de l’annonce"
            value={importance}
            onChange={(value) => setImportance((value || 'info') as FeedImportance)}
            options={IMPORTANCES.map((entry) => ({ value: entry.value, label: entry.label }))}
          />
          <TextInput
            value={link}
            onChange={(event) => setLink(event.target.value)}
            placeholder="Lien interne facultatif (ex. /assistant)"
            aria-label="Lien interne"
            maxLength={200}
          />
          <Button variant="primary" onClick={() => void publishNews()} disabled={publishing} icon={<Megaphone size={16} />}>
            {publishing ? 'Publication…' : 'Publier'}
          </Button>
        </div>
        {link && !/^\/[a-z0-9/_-]*$/i.test(link.trim()) ? (
          <p className="ed-small" style={{ color: 'var(--ed-danger)', margin: 0 }}>
            Le lien doit être interne et commencer par « / ». Les adresses externes sont refusées par le serveur.
          </p>
        ) : null}
      </div>

      {/* ---------------------------- Créer un sondage --------------------------- */}
      <div className="ed-stack" style={{ gap: 10, marginTop: 22, paddingTop: 18, borderTop: '1px solid var(--ed-border)' }}>
        <strong style={{ fontSize: '0.95rem' }}>
          <Check size={15} style={{ verticalAlign: -2 }} /> Lancer un sondage
        </strong>
        <TextInput
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Question (ex. : Quelle matière veux-tu en plus ?)"
          aria-label="Question du sondage"
          maxLength={140}
        />
        {options.map((option, index) => (
          <div key={index} className="ed-row" style={{ gap: 8 }}>
            <TextInput
              value={option}
              onChange={(event) => setOption(index, event.target.value)}
              placeholder={`Réponse ${index + 1}`}
              aria-label={`Réponse ${index + 1}`}
              maxLength={120}
            />
            {options.length > 2 ? (
              <IconButton
                label={`Supprimer la réponse ${index + 1}`}
                size="sm"
                variant="ghost"
                onClick={() => setOptions((current) => current.filter((_entry, i) => i !== index))}
              >
                <X size={15} />
              </IconButton>
            ) : null}
          </div>
        ))}
        <div className="ed-row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="ed-row" style={{ gap: 10 }}>
            {options.length < MAX_OPTIONS ? (
              <Button
                size="sm"
                variant="ghost"
                icon={<Plus size={15} />}
                onClick={() => setOptions((current) => [...current, ''])}
              >
                Ajouter une réponse
              </Button>
            ) : null}
            <Toggle
              checked={singleChoice}
              onChange={setSingleChoice}
              label="Choix unique"
              description={singleChoice ? 'Une seule réponse par élève.' : 'Plusieurs réponses possibles.'}
            />
          </span>
          <Button variant="primary" onClick={() => void createPoll()} disabled={creatingPoll} icon={<Check size={16} />}>
            {creatingPoll ? 'Création…' : 'Publier le sondage'}
          </Button>
        </div>
      </div>

      {/* ------------------------------ Fil publié ------------------------------ */}
      <div className="ed-stack" style={{ gap: 8, marginTop: 22, paddingTop: 18, borderTop: '1px solid var(--ed-border)' }}>
        <strong style={{ fontSize: '0.95rem' }}>Éléments publiés ({feed.data?.total ?? 0})</strong>
        {feed.loading && !feed.data ? (
          <p className="ed-small ed-mute">Chargement…</p>
        ) : (feed.data?.items ?? []).length === 0 ? (
          <p className="ed-small ed-mute">Rien de publié pour l’instant.</p>
        ) : (
          <AnimatePresence initial={false}>
            {(feed.data?.items ?? []).map((item) => {
              const poll: Poll | undefined = item.pollId ? feed.data?.polls?.[item.pollId] : undefined;
              const totalVotes = poll ? poll.options.reduce((sum, option) => sum + option.count, 0) : 0;
              return (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: 16, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="list-item"
                >
                  <span className="list-item__icon" aria-hidden="true">
                    {item.kind === 'poll' ? '📊' : item.importance === 'urgent' ? '⚠️' : '📣'}
                  </span>
                  <span className="list-item__body">
                    <span className="list-item__title">{item.title}</span>
                    <span className="list-item__meta">
                      {formatRelative(item.createdAt)}
                      {poll ? ` · ${poll.voters} participant${poll.voters > 1 ? 's' : ''} · ${totalVotes} vote${totalVotes > 1 ? 's' : ''}` : ''}
                    </span>
                  </span>
                  <span className="ed-row" style={{ gap: 6, flexWrap: 'wrap' }}>
                    <Badge tone={item.importance === 'urgent' ? 'danger' : item.kind === 'poll' ? 'primary' : 'outline'}>
                      {item.kind === 'poll' ? 'Sondage' : item.importance === 'update' ? 'Nouveauté' : 'Info'}
                    </Badge>
                    {poll ? (
                      <Button size="sm" variant="ghost" onClick={() => void toggleClosed(poll)}>
                        {poll.closed ? 'Rouvrir' : 'Clore'}
                      </Button>
                    ) : null}
                    <IconButton label={`Supprimer « ${item.title} »`} size="sm" variant="ghost" onClick={() => void remove(item)}>
                      <Trash2 size={15} />
                    </IconButton>
                  </span>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </Card>
  );
}
