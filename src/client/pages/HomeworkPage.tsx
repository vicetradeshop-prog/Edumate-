import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CalendarDays, CalendarPlus, Check, ClipboardList, Plus, Trash2, Timer } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button, IconButton } from '../components/ui/Button.js';
import { Card, CardSubtitle, CardTitle } from '../components/ui/Card.js';
import { Badge, Progress } from '../components/ui/Badge.js';
import { Empty, Loader, Notice } from '../components/ui/Feedback.js';
import { Field, Select, TextInput } from '../components/ui/Field.js';
import { Modal } from '../components/ui/Modal.js';
import { endpoints } from '../lib/api.js';
import { useApi } from '../lib/data.js';
import { toast, useAuth, useCatalog } from '../lib/store.js';
import { formatDayLabel, isoDate } from '../lib/format.js';
import { useDocumentTitle } from '../lib/hooks.js';
import type { Task } from '../../shared/types.js';

export default function HomeworkPage() {
  useDocumentTitle('Mes devoirs');
  const user = useAuth((state) => state.user);
  const subjects = useCatalog((state) => state.subjects);
  const tasks = useApi(() => endpoints.tasks(), { deps: [user?.id] });
  const events = useApi(() => endpoints.events(), { deps: [user?.id] });

  const [title, setTitle] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Task | null>(null);

  useEffect(() => {
    void useCatalog.getState().load();
  }, []);

  const list = tasks.data?.tasks ?? [];
  const open = list.filter((task) => !task.done);
  const done = list.filter((task) => task.done);
  const completion = list.length ? done.length / list.length : 0;

  const homeworkEvents = (events.data?.events ?? []).filter((event) => event.kind === 'devoir' && !event.done);

  const add = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    const value = title.trim();
    if (!value) {
      toast.warning('Écris d’abord l’intitulé du devoir.');
      return;
    }
    setBusy(true);
    try {
      await endpoints.createTask({ title: value, subjectId: subjectId || undefined, dueDate: dueDate || undefined });
      setTitle('');
      setDueDate('');
      toast.success('Devoir ajouté à ta liste.');
      void tasks.reload();
    } catch (error) {
      toast.fromError(error, 'Impossible d’ajouter ce devoir.');
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (task: Task): Promise<void> => {
    try {
      await endpoints.updateTask(task.id, { done: !task.done });
      void tasks.reload();
    } catch (error) {
      toast.fromError(error);
    }
  };

  const remove = async (task: Task): Promise<void> => {
    try {
      await endpoints.deleteTask(task.id);
      setConfirmDelete(null);
      toast.success('Devoir supprimé.');
      void tasks.reload();
    } catch (error) {
      toast.fromError(error);
    }
  };

  if (tasks.loading && !tasks.data) return <Loader label="Chargement de tes devoirs…" large />;

  return (
    <div className="ed-stack" style={{ gap: 22 }}>
      <header className="page-head">
        <div className="page-head__title">
          <span className="page-head__eyebrow">
            <ClipboardList size={13} style={{ verticalAlign: '-2px' }} /> Organisation
          </span>
          <h1>Mes devoirs</h1>
          <p>Une liste simple pour ne rien oublier : ajoute, coche, supprime. Les échéances importantes vivent aussi dans le calendrier.</p>
        </div>
        <div className="ed-row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <Link to="/planning?new=1">
            <Button variant="primary" icon={<CalendarPlus size={16} />}>
              Ajouter un contrôle
            </Button>
          </Link>
          <Link to="/outils/minuteur">
            <Button variant="soft" icon={<Timer size={16} />}>
              Lancer une session
            </Button>
          </Link>
        </div>
      </header>

      {tasks.error ? <Notice tone="danger">{tasks.error}</Notice> : null}

      <div className="split">
        <div className="ed-stack" style={{ gap: 20 }}>
          <Card>
            <CardTitle icon={<Plus size={17} />}>Ajouter un devoir</CardTitle>
            <CardSubtitle>Titre, matière et date de rendu (facultative).</CardSubtitle>
            <form onSubmit={add} className="ed-stack" style={{ gap: 12, marginTop: 14 }}>
              <Field label="Quoi ?" required>
                {({ id }) => (
                  <TextInput
                    id={id}
                    value={title}
                    maxLength={140}
                    placeholder="Ex. : Exercices 12 à 18 p. 74"
                    onChange={(event) => setTitle(event.target.value)}
                  />
                )}
              </Field>
              <div className="ed-row" style={{ gap: 12, flexWrap: 'wrap' }}>
                <label className="field ed-grow">
                  <span className="field__label">Matière</span>
                  <Select value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>
                    <option value="">Non précisée</option>
                    {subjects.map((subject) => (
                      <option key={subject.id} value={subject.id}>
                        {subject.emoji} {subject.name}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="field ed-grow">
                  <span className="field__label">Pour le</span>
                  <TextInput type="date" value={dueDate} min={isoDate(new Date())} onChange={(event) => setDueDate(event.target.value)} />
                </label>
              </div>
              <Button type="submit" variant="primary" loading={busy} icon={<Plus size={16} />}>
                Ajouter à ma liste
              </Button>
            </form>
          </Card>

          <Card>
            <div className="ed-row" style={{ justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
              <CardTitle icon={<ClipboardList size={17} />}>À faire ({open.length})</CardTitle>
              <span className="ed-small ed-mute">{Math.round(completion * 100)} % terminé</span>
            </div>
            <Progress value={completion} thin color="#16a34a" />

            {open.length === 0 ? (
              <Empty emoji="🎉" title="Rien à faire !" description="Ta liste est vide : profite-en, ou ajoute un devoir à préparer." />
            ) : (
              <div className="ed-stack" style={{ gap: 4, marginTop: 14 }}>
                {open.map((task) => {
                  const subject = subjects.find((item) => item.id === task.subjectId);
                  return (
                    <motion.div
                      key={task.id}
                      className="list-item"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      style={{ background: 'var(--ed-surface-2)', borderRadius: 12 }}
                    >
                      <IconButton label="Marquer comme fait" size="sm" variant="ghost" onClick={() => void toggle(task)}>
                        <Check size={18} />
                      </IconButton>
                      <span className="list-item__body">
                        <span className="list-item__title">{task.title}</span>
                        <span className="list-item__meta">
                          {subject ? `${subject.emoji} ${subject.name}` : 'Matière non précisée'}
                          {task.dueDate ? ` · ${formatDayLabel(task.dueDate)}` : ''}
                        </span>
                      </span>
                      {task.dueDate && task.dueDate <= isoDate(new Date()) ? <Badge tone="danger">Urgent</Badge> : null}
                      <IconButton label="Supprimer" size="sm" variant="ghost" onClick={() => setConfirmDelete(task)}>
                        <Trash2 size={16} />
                      </IconButton>
                    </motion.div>
                  );
                })}
              </div>
            )}

            {done.length > 0 ? (
              <>
                <hr className="divider" />
                <CardTitle icon={<Check size={16} />}>Terminés ({done.length})</CardTitle>
                <div className="ed-stack" style={{ gap: 2, marginTop: 10 }}>
                  {done.slice(0, 10).map((task) => (
                    <div key={task.id} className="list-item" style={{ opacity: 0.65 }}>
                      <IconButton label="Remettre à faire" size="sm" variant="ghost" onClick={() => void toggle(task)}>
                        <Check size={17} style={{ color: 'var(--ed-success)' }} />
                      </IconButton>
                      <span className="list-item__body">
                        <span className="list-item__title" style={{ textDecoration: 'line-through' }}>
                          {task.title}
                        </span>
                      </span>
                      <IconButton label="Supprimer" size="sm" variant="ghost" onClick={() => setConfirmDelete(task)}>
                        <Trash2 size={15} />
                      </IconButton>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </Card>
        </div>

        <div className="ed-stack" style={{ gap: 18 }}>
          <Card>
            <CardTitle icon={<CalendarDays size={17} />}>Devoirs au calendrier</CardTitle>
            <CardSubtitle>Les échéances marquées « devoir » dans ton calendrier.</CardSubtitle>
            {homeworkEvents.length === 0 ? (
              <p className="ed-small ed-mute" style={{ marginTop: 10 }}>
                Aucun devoir planifié. Ajoute-les depuis le calendrier pour les visualiser par mois.
              </p>
            ) : (
              <div className="ed-stack" style={{ gap: 4, marginTop: 12 }}>
                {homeworkEvents.slice(0, 6).map((event) => (
                  <div key={event.id} className="list-item">
                    <span className="list-item__icon" aria-hidden="true">
                      ✏️
                    </span>
                    <span className="list-item__body">
                      <span className="list-item__title">{event.title}</span>
                      <span className="list-item__meta">{formatDayLabel(event.date)}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
            <Link to="/outils/calendrier" className="section__link" style={{ marginTop: 12, display: 'inline-flex' }}>
              Ouvrir le calendrier →
            </Link>
          </Card>

          <Card flat>
            <CardTitle>🧠 Méthode express</CardTitle>
            <ol style={{ marginTop: 10, paddingLeft: '1.1em', color: 'var(--ed-text-soft)', fontSize: '0.9rem', display: 'grid', gap: 6 }}>
              <li>Note tous les devoirs dès qu’ils sont donnés.</li>
              <li>Commence par le plus difficile (ton cerveau est frais).</li>
              <li>25 min de travail, 5 min de pause.</li>
              <li>Termine par 5 questions de quiz pour vérifier.</li>
            </ol>
            <Link to="/quiz" style={{ marginTop: 12, display: 'inline-block' }}>
              <Button size="sm" variant="soft">
                S’entraîner maintenant
              </Button>
            </Link>
          </Card>
        </div>
      </div>

      <Modal
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        title="Supprimer ce devoir ?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              Annuler
            </Button>
            <Button variant="danger" icon={<Trash2 size={16} />} onClick={() => confirmDelete && void remove(confirmDelete)}>
              Supprimer
            </Button>
          </>
        }
      >
        <p className="ed-soft">« {confirmDelete?.title} » sera définitivement retiré de ta liste.</p>
      </Modal>
    </div>
  );
}
