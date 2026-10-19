import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Award, GraduationCap, KeyRound, Mail, Save, School, User as UserIcon } from 'lucide-react';
import { Button } from '../components/ui/Button.js';
import { Card, CardSubtitle, CardTitle } from '../components/ui/Card.js';
import { Badge, Stars } from '../components/ui/Badge.js';
import { Empty, Notice } from '../components/ui/Feedback.js';
import { Field, Pill, Select, TextInput } from '../components/ui/Field.js';
import { Modal } from '../components/ui/Modal.js';
import { endpoints, type ProgressStats } from '../lib/api.js';
import { useApi } from '../lib/data.js';
import { toast, useAuth, useCatalog } from '../lib/store.js';
import { formatDate, formatDuration, formatPercent } from '../lib/format.js';
import { useDocumentTitle } from '../lib/hooks.js';

export default function ProfilePage() {
  useDocumentTitle('Mon profil');
  const { user, updateUser } = useAuth();
  const subjects = useCatalog((state) => state.subjects);
  const levels = useCatalog((state) => state.levels);
  const stats = useApi<ProgressStats>(() => endpoints.stats(), { deps: [user?.id] });
  const [options, setOptions] = useState<{ avatars: string[]; accents: string[]; subjectsByLevel: Record<string, string[]> } | null>(null);

  const [form, setForm] = useState({
    firstName: user?.firstName ?? '',
    lastName: user?.lastName ?? '',
    age: user?.age ? String(user.age) : '',
    email: user?.email ?? '',
    school: user?.school ?? '',
    level: typeof user?.level === 'string' ? user.level : '',
    subjects: (user?.subjects ?? []) as string[],
    avatar: user?.avatar ?? '🦉',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' });

  useEffect(() => {
    void useCatalog.getState().load();
    endpoints
      .options()
      .then((response) => setOptions({ avatars: response.avatars, accents: response.accents, subjectsByLevel: response.subjectsByLevel }))
      .catch(() => setOptions(null));
  }, []);

  useEffect(() => {
    if (!user) return;
    setForm({
      firstName: user.firstName ?? '',
      lastName: user.lastName ?? '',
      age: user.age ? String(user.age) : '',
      email: user.email ?? '',
      school: user.school ?? '',
      level: typeof user.level === 'string' ? user.level : '',
      subjects: (user.subjects ?? []) as string[],
      avatar: user.avatar ?? '🦉',
    });
  }, [user]);

  if (!user) return <Empty emoji="🔒" title="Session indisponible" description="Reconnecte-toi pour accéder à ton profil." />;

  const levelSubjects = form.level && options?.subjectsByLevel?.[form.level] ? options.subjectsByLevel[form.level] : null;
  const visibleSubjects = subjects.filter((subject) => !levelSubjects || levelSubjects.includes(subject.id));

  const save = async (): Promise<void> => {
    setError(null);
    if (form.firstName.trim().length < 2) {
      setError('Ton prénom doit contenir au moins 2 caractères.');
      return;
    }
    setSaving(true);
    try {
      await updateUser({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim() || undefined,
        age: form.age ? Number(form.age) : undefined,
        email: form.email.trim(),
        school: form.school.trim() || undefined,
        level: form.level || undefined,
        subjects: form.subjects,
        avatar: form.avatar,
      });
      toast.success('Profil mis à jour.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Mise à jour impossible.';
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (): Promise<void> => {
    if (passwords.next.length < 8) {
      toast.warning('Le nouveau mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    if (passwords.next !== passwords.confirm) {
      toast.warning('La confirmation ne correspond pas au nouveau mot de passe.');
      return;
    }
    try {
      await endpoints.changePassword({ currentPassword: passwords.current, newPassword: passwords.next });
      toast.success('Mot de passe modifié.');
      setPasswordOpen(false);
      setPasswords({ current: '', next: '', confirm: '' });
    } catch (err) {
      toast.fromError(err, 'Changement de mot de passe impossible.');
    }
  };

  const data = stats.data;

  return (
    <div className="ed-stack" style={{ gap: 22 }}>
      <header className="page-head">
        <div className="page-head__title">
          <span className="page-head__eyebrow">Mon espace</span>
          <h1>Mon profil</h1>
          <p>Tes informations, tes matières et ta progression en un coup d’œil.</p>
        </div>
      </header>

      <div className="split">
        <div className="ed-stack" style={{ gap: 20 }}>
          <Card>
            <div className="ed-row" style={{ gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              <span
                style={{
                  width: 74,
                  height: 74,
                  borderRadius: 24,
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 38,
                  background: `color-mix(in srgb, ${user.preferences?.accent ?? '#6c5ce7'} 16%, var(--ed-surface-3))`,
                }}
                aria-hidden="true"
              >
                {form.avatar}
              </span>
              <div className="ed-grow">
                <h2 style={{ marginBottom: 2 }}>
                  {form.firstName} {form.lastName}
                </h2>
                <p className="ed-soft ed-small">
                  <Mail size={13} style={{ verticalAlign: '-2px' }} /> {user.email}
                </p>
                <div className="ed-row" style={{ gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  <Badge tone="primary">
                    <GraduationCap size={12} /> {levels.find((level) => level.id === form.level)?.name ?? 'Niveau non précisé'}
                  </Badge>
                  {user.role === 'admin' ? <Badge tone="warning">Administrateur</Badge> : <Badge tone="outline">Élève</Badge>}
                  {user.demo ? <Badge tone="outline">Compte de démonstration</Badge> : null}
                  <Badge tone="outline">Membre depuis {formatDate(user.createdAt)}</Badge>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 18 }}>
              <p className="field__label" style={{ marginBottom: 8 }}>
                Compagnon
              </p>
              <div className="pill-grid">
                {(options?.avatars ?? ['🦉']).map((avatar) => (
                  <Pill key={avatar} active={form.avatar === avatar} onClick={() => setForm({ ...form, avatar })}>
                    <span style={{ fontSize: 20 }} aria-hidden="true">
                      {avatar}
                    </span>
                  </Pill>
                ))}
              </div>
            </div>
          </Card>

          <Card>
            <CardTitle icon={<UserIcon size={17} />}>Informations personnelles</CardTitle>
            <CardSubtitle>Ces informations restent privées et servent uniquement à personnaliser ton EduMate.</CardSubtitle>

            {error ? (
              <div style={{ marginTop: 14 }}>
                <Notice tone="danger">{error}</Notice>
              </div>
            ) : null}

            <div className="ed-stack" style={{ gap: 14, marginTop: 16 }}>
              <div className="ed-row" style={{ gap: 12, flexWrap: 'wrap' }}>
                <label className="field ed-grow">
                  <span className="field__label">Prénom *</span>
                  <TextInput value={form.firstName} maxLength={40} autoComplete="given-name" onChange={(event) => setForm({ ...form, firstName: event.target.value })} />
                </label>
                <label className="field ed-grow">
                  <span className="field__label">Nom</span>
                  <TextInput value={form.lastName} maxLength={40} autoComplete="family-name" onChange={(event) => setForm({ ...form, lastName: event.target.value })} />
                </label>
                <label className="field" style={{ maxWidth: 120 }}>
                  <span className="field__label">Âge</span>
                  <TextInput type="number" min={8} max={99} value={form.age} onChange={(event) => setForm({ ...form, age: event.target.value })} />
                </label>
              </div>

              <Field label="Adresse e-mail" hint="Sert uniquement à la connexion.">
                {({ id }) => (
                  <TextInput
                    id={id}
                    type="email"
                    value={form.email}
                    readOnly={Boolean(user.demo)}
                    autoComplete="email"
                    onChange={(event) => setForm({ ...form, email: event.target.value })}
                  />
                )}
              </Field>

              <Field label="Établissement">
                {({ id }) => (
                  <TextInput id={id} value={form.school} maxLength={120} placeholder="Lycée…" onChange={(event) => setForm({ ...form, school: event.target.value })} />
                )}
              </Field>

              <label className="field">
                <span className="field__label">Niveau / classe</span>
                <Select value={form.level} onChange={(event) => setForm({ ...form, level: event.target.value })}>
                  <option value="">Non précisé</option>
                  {levels.map((level) => (
                    <option key={level.id} value={level.id}>
                      {level.name}
                    </option>
                  ))}
                </Select>
              </label>

              <div>
                <p className="field__label" style={{ marginBottom: 8 }}>
                  Matières étudiées ({form.subjects.length})
                </p>
                <div className="pill-grid">
                  {visibleSubjects.map((subject) => (
                    <Pill
                      key={subject.id}
                      active={form.subjects.includes(subject.id)}
                      color={subject.color}
                      onClick={() =>
                        setForm({
                          ...form,
                          subjects: form.subjects.includes(subject.id)
                            ? form.subjects.filter((id) => id !== subject.id)
                            : [...form.subjects, subject.id],
                        })
                      }
                    >
                      <span aria-hidden="true">{subject.emoji}</span> {subject.name}
                    </Pill>
                  ))}
                </div>
              </div>

              <div className="ed-row" style={{ gap: 10, flexWrap: 'wrap' }}>
                <Button variant="primary" onClick={() => void save()} loading={saving} icon={<Save size={16} />}>
                  Enregistrer
                </Button>
                {!user.demo ? (
                  <Button variant="soft" icon={<KeyRound size={16} />} onClick={() => setPasswordOpen(true)}>
                    Changer le mot de passe
                  </Button>
                ) : null}
              </div>
            </div>
          </Card>
        </div>

        <div className="ed-stack" style={{ gap: 18 }}>
          <Card>
            <CardTitle icon={<Award size={17} />}>Ma progression</CardTitle>
            {/* `loading && !data` : pas de squelette par-dessus des données déjà
                chargées lors d'un éventuel rechargement. */}
            {stats.loading && !data ? (
              <div className="skeleton" style={{ height: 90, marginTop: 12 }} />
            ) : data ? (
              <div className="ed-stack" style={{ gap: 12, marginTop: 12 }}>
                <div className="ed-row" style={{ justifyContent: 'space-between' }}>
                  <span className="ed-small ed-mute">Quiz terminés</span>
                  <strong>{data.attempts}</strong>
                </div>
                <div className="ed-row" style={{ justifyContent: 'space-between' }}>
                  <span className="ed-small ed-mute">Réussite globale</span>
                  <strong>{formatPercent(data.successRate)}</strong>
                </div>
                <div className="ed-row" style={{ justifyContent: 'space-between' }}>
                  <span className="ed-small ed-mute">Meilleur score</span>
                  <Stars score={data.bestScore * 5} />
                </div>
                <div className="ed-row" style={{ justifyContent: 'space-between' }}>
                  <span className="ed-small ed-mute">Temps de travail</span>
                  <strong>{formatDuration(data.totalDurationSec)}</strong>
                </div>
                <div className="ed-row" style={{ justifyContent: 'space-between' }}>
                  <span className="ed-small ed-mute">Sujets maîtrisés</span>
                  <strong>{data.mastered.length}</strong>
                </div>
              </div>
            ) : (
              <p className="ed-small ed-mute" style={{ marginTop: 10 }}>
                Statistiques indisponibles pour le moment.
              </p>
            )}
          </Card>

          <Card flat>
            <CardTitle icon={<School size={17} />}>Gérer mes données</CardTitle>
            <CardSubtitle>
              Télécharge une copie de tes données ou supprime ton compte à tout moment, en quelques clics.
            </CardSubtitle>
            <Link to="/parametres" style={{ marginTop: 14, display: 'inline-block' }}>
              <Button variant="soft" size="sm" icon={<Save size={15} />}>
                Ouvrir les paramètres
              </Button>
            </Link>
          </Card>
        </div>
      </div>

      <Modal
        open={passwordOpen}
        onClose={() => setPasswordOpen(false)}
        title="Changer mon mot de passe"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPasswordOpen(false)}>
              Annuler
            </Button>
            <Button variant="primary" onClick={() => void changePassword()}>
              Modifier
            </Button>
          </>
        }
      >
        <div className="ed-stack" style={{ gap: 12 }}>
          <Field label="Mot de passe actuel">
            {({ id }) => (
              <TextInput id={id} type="password" autoComplete="current-password" value={passwords.current} onChange={(event) => setPasswords({ ...passwords, current: event.target.value })} />
            )}
          </Field>
          <Field label="Nouveau mot de passe" hint="8 caractères minimum, avec une lettre et un chiffre.">
            {({ id }) => (
              <TextInput id={id} type="password" autoComplete="new-password" value={passwords.next} onChange={(event) => setPasswords({ ...passwords, next: event.target.value })} />
            )}
          </Field>
          <Field label="Confirmation">
            {({ id }) => (
              <TextInput id={id} type="password" autoComplete="new-password" value={passwords.confirm} onChange={(event) => setPasswords({ ...passwords, confirm: event.target.value })} />
            )}
          </Field>
        </div>
      </Modal>
    </div>
  );
}
