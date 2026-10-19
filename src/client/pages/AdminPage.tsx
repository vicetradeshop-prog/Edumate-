import { useState } from 'react';
import { motion } from 'framer-motion';
import { Database, Eye, RefreshCw, ShieldCheck, Trash2, Users } from 'lucide-react';
import { Button, IconButton } from '../components/ui/Button.js';
import { Card, CardSubtitle, CardTitle } from '../components/ui/Card.js';
import { Badge } from '../components/ui/Badge.js';
import { Empty, Loader, Notice } from '../components/ui/Feedback.js';
import { Modal } from '../components/ui/Modal.js';
import { TextInput } from '../components/ui/Field.js';
import { api } from '../lib/api.js';
import { useApi } from '../lib/data.js';
import { toast, useAuth } from '../lib/store.js';
import { formatDate, formatRelative } from '../lib/format.js';
import { useDocumentTitle } from '../lib/hooks.js';
import { FeedAdminCard } from '../components/admin/FeedAdminCard.js';

interface AdminUser {
  id: string;
  email: string;
  firstName: string;
  level?: string;
  role: 'eleve' | 'admin';
  createdAt: string;
  onboarded: boolean;
  demo?: boolean;
}

interface AdminStats {
  users: number;
  activeUsers: number;
  admins: number;
  catalog: { subjects: number; levels: number; themes: number; topics: number; playable: number; questionPool: number };
  families: number;
}

interface CatalogDetail {
  subjects: { id: string; name: string; emoji: string; topics: number; families: string[] }[];
  levels: { id: string; name: string; short: string }[];
  themes: number;
  families: { id: string; label: string; pool: number }[];
  stats: AdminStats['catalog'];
}

export default function AdminPage() {
  useDocumentTitle('Administration');
  const user = useAuth((state) => state.user);
  const stats = useApi<AdminStats>(() => api.get<AdminStats>('/api/admin/stats'), { deps: [] });
  const users = useApi<{ users: AdminUser[]; total: number }>(() => api.get('/api/admin/users'), { deps: [] });
  const catalog = useApi<CatalogDetail>(() => api.get('/api/admin/catalog'), { deps: [] });

  const [query, setQuery] = useState('');
  const [preview, setPreview] = useState<{ topicId: string; questions: { prompt: string; explanation: string }[] } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AdminUser | null>(null);

  const search = async (): Promise<void> => {
    const result = await api
      .get<{ users: AdminUser[] }>('/api/admin/users', { query: { q: query } })
      .catch(() => null);
    if (result) {
      toast.info(`${result.users.length} compte(s) trouvé(s).`);
      void users.reload();
    }
  };

  const setRole = async (target: AdminUser, role: 'eleve' | 'admin'): Promise<void> => {
    try {
      await api.patch(`/api/admin/users/${target.id}`, { role });
      toast.success(`Rôle de ${target.firstName} : ${role === 'admin' ? 'administrateur' : 'élève'}.`);
      void users.reload();
    } catch (error) {
      toast.fromError(error, 'Modification impossible.');
    }
  };

  const remove = async (target: AdminUser): Promise<void> => {
    try {
      await api.delete(`/api/admin/users/${target.id}`);
      toast.success('Compte supprimé, avec toutes ses données.');
      setConfirmDelete(null);
      void users.reload();
      void stats.reload();
    } catch (error) {
      toast.fromError(error, 'Suppression impossible.');
    }
  };

  const previewTopic = async (topicId: string): Promise<void> => {
    try {
      const result = await api.get<{ topic: { id: string }; questions: { prompt: string; explanation: string }[] }>(
        `/api/admin/catalog/topics/${encodeURIComponent(topicId)}/preview`,
      );
      setPreview({ topicId: result.topic.id, questions: result.questions });
    } catch (error) {
      toast.fromError(error, 'Aperçu indisponible.');
    }
  };

  if (user?.role !== 'admin') {
    return <Empty emoji="🔒" title="Accès réservé" description="Cette section est réservée aux administrateurs d’EduMate." />;
  }

  return (
    <div className="ed-stack" style={{ gap: 22 }}>
      <header className="page-head">
        <div className="page-head__title">
          <span className="page-head__eyebrow">
            <ShieldCheck size={13} style={{ verticalAlign: '-2px' }} /> Espace administrateur
          </span>
          <h1>Administration</h1>
          <p>Vue d’ensemble de la plateforme : comptes, catalogue pédagogique et familles de questions.</p>
        </div>
        <Button
          variant="soft"
          icon={<RefreshCw size={16} />}
          onClick={() => {
            void stats.reload();
            void users.reload();
            void catalog.reload();
          }}
        >
          Actualiser
        </Button>
      </header>

      {stats.loading && !stats.data ? <Loader label="Chargement des statistiques…" /> : null}

      {stats.data ? (
        <section className="stat-grid stagger">
          {[
            { icon: <Users size={22} />, value: String(stats.data.users), label: 'comptes créés', color: '#6c5ce7' },
            { icon: <ShieldCheck size={22} />, value: String(stats.data.admins), label: 'administrateurs', color: '#e11d48' },
            { icon: <Database size={22} />, value: stats.data.catalog.topics.toLocaleString('fr-FR'), label: 'sujets au catalogue', color: '#0ea5e9' },
            { icon: <RefreshCw size={22} />, value: String(stats.data.families), label: 'familles de questions', color: '#16a34a' },
          ].map((item) => (
            <Card key={item.label}>
              <div className="stat">
                <span className="stat__icon" style={{ ['--stat-color' as string]: item.color }} aria-hidden="true">
                  {item.icon}
                </span>
                <span>
                  <span className="stat__value">{item.value}</span>
                  <span className="stat__label">{item.label}</span>
                </span>
              </div>
            </Card>
          ))}
        </section>
      ) : null}

      <div className="split">
        <Card>
          <div className="ed-row" style={{ justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            <CardTitle icon={<Users size={17} />}>Comptes utilisateurs</CardTitle>
            <div className="ed-row" style={{ gap: 8 }}>
              <TextInput
                value={query}
                placeholder="Rechercher un e-mail ou un prénom…"
                aria-label="Rechercher un utilisateur"
                style={{ minHeight: 40, width: 240 }}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void search();
                }}
              />
              <Button size="sm" variant="soft" onClick={() => void search()}>
                Chercher
              </Button>
            </div>
          </div>

          {users.loading && !users.data ? (
            <div className="skeleton" style={{ height: 160 }} />
          ) : (users.data?.users.length ?? 0) === 0 ? (
            <p className="ed-small ed-mute">Aucun compte pour ce filtre.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.87rem' }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--ed-text-mute)', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    <th style={{ padding: '8px 8px' }}>Utilisateur</th>
                    <th style={{ padding: '8px' }}>Niveau</th>
                    <th style={{ padding: '8px' }}>Rôle</th>
                    <th style={{ padding: '8px' }}>Créé le</th>
                    <th style={{ padding: '8px' }} />
                  </tr>
                </thead>
                <tbody>
                  {users.data?.users.map((item) => (
                    <motion.tr key={item.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ borderTop: '1px solid var(--ed-border)' }}>
                      <td style={{ padding: '9px 8px' }}>
                        <strong>{item.firstName}</strong>
                        {item.demo ? <Badge tone="outline"> démo</Badge> : null}
                        <span className="ed-small ed-mute" style={{ display: 'block' }}>
                          {item.email}
                        </span>
                      </td>
                      <td style={{ padding: '9px 8px', color: 'var(--ed-text-mute)' }}>{item.level ?? '—'}</td>
                      <td style={{ padding: '9px 8px' }}>
                        <Badge tone={item.role === 'admin' ? 'warning' : 'outline'}>{item.role === 'admin' ? 'Admin' : 'Élève'}</Badge>
                      </td>
                      <td style={{ padding: '9px 8px', color: 'var(--ed-text-mute)' }} title={formatDate(item.createdAt)}>
                        {formatRelative(item.createdAt)}
                      </td>
                      <td style={{ padding: '9px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <IconButton
                          label={item.role === 'admin' ? 'Rétrograder en élève' : 'Promouvoir administrateur'}
                          size="sm"
                          variant="ghost"
                          onClick={() => void setRole(item, item.role === 'admin' ? 'eleve' : 'admin')}
                        >
                          <ShieldCheck size={16} />
                        </IconButton>
                        <IconButton label="Supprimer le compte" size="sm" variant="ghost" onClick={() => setConfirmDelete(item)} disabled={item.demo}>
                          <Trash2 size={16} />
                        </IconButton>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="ed-stack" style={{ gap: 18 }}>
          {/* Publication dans le fil : actualités et sondages. */}
          <FeedAdminCard />

          <Card>
            <CardTitle icon={<Database size={17} />}>Catalogue pédagogique</CardTitle>
            {catalog.data ? (
              <>
                <CardSubtitle>
                  {catalog.data.stats.subjects} matières · {catalog.data.stats.levels} niveaux ·{' '}
                  {catalog.data.themes} thèmes · {catalog.data.stats.playable.toLocaleString('fr-FR')} sujets jouables ·{' '}
                  {catalog.data.families.length} familles de générateurs
                </CardSubtitle>
                <div className="ed-stack" style={{ gap: 6, marginTop: 14 }}>
                  {catalog.data.subjects.map((subject) => (
                    <div key={subject.id} className="list-item">
                      <span className="list-item__icon" aria-hidden="true">
                        {subject.emoji}
                      </span>
                      <span className="list-item__body">
                        <span className="list-item__title">{subject.name}</span>
                        <span className="list-item__meta">{subject.families.length} familles de questions</span>
                      </span>
                      <Badge tone="primary">{subject.topics} sujets</Badge>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="ed-small ed-mute" style={{ marginTop: 10 }}>
                {catalog.error ?? 'Chargement…'}
              </p>
            )}
          </Card>

          <Card flat>
            <CardTitle>🧪 Contrôle qualité</CardTitle>
            <CardSubtitle>
              Génère un aperçu de 5 questions pour n’importe quel sujet afin de vérifier le contenu avant publication.
            </CardSubtitle>
            <div className="ed-row" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <TextInput
                placeholder="identifiant-du-sujet (ex. mathematiques-seconde-…)"
                aria-label="Identifiant du sujet à prévisualiser"
                style={{ minHeight: 40 }}
                id="preview-topic"
              />
              <Button
                size="sm"
                variant="soft"
                icon={<Eye size={15} />}
                onClick={() => {
                  const value = (document.getElementById('preview-topic') as HTMLInputElement | null)?.value?.trim();
                  if (!value) {
                    toast.warning('Saisis l’identifiant d’un sujet.');
                    return;
                  }
                  void previewTopic(value);
                }}
              >
                Aperçu
              </Button>
            </div>
            <p className="ed-small ed-mute" style={{ marginTop: 8 }}>
              Les identifiants figurent dans <code>data/generated/catalog.json</code>. Tu peux aussi utiliser la commande{' '}
              <code>npm run test:content</code> pour contrôler l’ensemble du catalogue.
            </p>
          </Card>
        </div>
      </div>

      <Notice tone="info">
        <strong>Ajouter du contenu</strong> : une ligne dans <code>src/server/content/topics.ts</code> (ou dans un module
        d’extension) suffit pour créer un sujet ; <code>npm run build:data</code> régénère le catalogue. Les banques de
        questions rédigées se trouvent dans <code>data/quiz/*.json</code>.
      </Notice>

      <Modal
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
        title={`Aperçu du sujet : ${preview?.topicId ?? ''}`}
        wide
        footer={
          <Button variant="ghost" onClick={() => setPreview(null)}>
            Fermer
          </Button>
        }
      >
        <div className="ed-stack" style={{ gap: 12 }}>
          {preview?.questions.map((question, index) => (
            <div key={index} className="card card--flat" style={{ padding: 14 }}>
              <strong>
                Question {index + 1}. </strong>
              <span>{question.prompt.replace(/\$/g, '')}</span>
              <p className="ed-small ed-mute" style={{ marginTop: 6 }}>
                💡 {question.explanation.replace(/\$/g, '')}
              </p>
            </div>
          ))}
        </div>
      </Modal>

      <Modal
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        title="Supprimer ce compte ?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              Annuler
            </Button>
            <Button variant="danger" icon={<Trash2 size={16} />} onClick={() => confirmDelete && void remove(confirmDelete)}>
              Supprimer définitivement
            </Button>
          </>
        }
      >
        <Notice tone="danger">
          Le compte <strong>{confirmDelete?.email}</strong> et toutes ses données (progression, favoris, calendrier,
          tâches, conversations) seront effacés. Action irréversible.
        </Notice>
      </Modal>
    </div>
  );
}
