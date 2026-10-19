import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  Mail,
  Lock,
  Palette,
  PartyPopper,
  Search,
  Sparkles,
  User,
} from 'lucide-react';
import { Button, IconButton } from '../components/ui/Button.js';
import { Field, Pill, TextInput } from '../components/ui/Field.js';
import { Logo, Notice } from '../components/ui/Feedback.js';
import { Toasts } from '../components/ui/Toasts.js';
import { ApiError, endpoints } from '../lib/api.js';
import { toast, useAuth } from '../lib/store.js';
import { useDebounced } from '../lib/hooks.js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type StepId = 'welcome' | 'name' | 'age' | 'school' | 'email' | 'password' | 'level' | 'subjects' | 'prefs' | 'done';

interface OptionsResponse {
  levels: { id: string; name: string; short: string }[];
  subjects: { id: string; name: string; emoji: string; color: string }[];
  subjectsByLevel: Record<string, string[]>;
  avatars: string[];
  accents: string[];
}

interface Draft {
  firstName: string;
  age: string;
  school: string;
  email: string;
  password: string;
  confirm: string;
  level: string;
  subjects: string[];
  avatar: string;
  accent: string;
  theme: 'clair' | 'sombre' | 'auto';
  dailyGoal: number;
}

const EMPTY_DRAFT: Draft = {
  firstName: '',
  age: '',
  school: '',
  email: '',
  password: '',
  confirm: '',
  level: '',
  subjects: [],
  avatar: '🦉',
  accent: '#6c5ce7',
  theme: 'sombre',
  dailyGoal: 20,
};

const MASCOTS = ['🦉', '🦊', '🐼', '🦄', '🚀', '🧠'];

/* ------------------------------------------------------------------ */
/*  Confettis (100 % CSS, aucune image)                                */
/* ------------------------------------------------------------------ */

function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 64 }, (_unused, index) => ({
        id: index,
        left: Math.random() * 100,
        delay: Math.random() * 1.6,
        duration: 2.4 + Math.random() * 2.2,
        color: ['#6c5ce7', '#22d3ee', '#f59e0b', '#16a34a', '#e11d48', '#7c3aed'][index % 6],
        rotate: Math.random() * 360,
      })),
    [],
  );
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((piece) => (
        <span
          key={piece.id}
          style={{
            left: `${piece.left}%`,
            background: piece.color,
            animationDelay: `${piece.delay}s`,
            animationDuration: `${piece.duration}s`,
            transform: `rotate(${piece.rotate}deg)`,
          }}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Étape « lycée » avec autocomplétion open data                      */
/* ------------------------------------------------------------------ */

function SchoolStep({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<{ name: string; city: string; postalCode?: string; nature: string }[]>([]);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'unavailable'>('idle');
  const debounced = useDebounced(query, 380);
  const firstLoad = useRef(true);

  useEffect(() => {
    if (debounced.trim().length < 3) {
      setResults([]);
      setState('idle');
      return;
    }
    let cancelled = false;
    setState('loading');
    endpoints
      .schools(debounced.trim())
      .then((response) => {
        if (cancelled) return;
        setResults(response.schools);
        setState(response.source === 'unavailable' ? 'unavailable' : 'ready');
      })
      .catch(() => {
        if (!cancelled) {
          setResults([]);
          setState('unavailable');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  useEffect(() => {
    if (firstLoad.current && value) {
      setQuery(value);
      firstLoad.current = false;
    }
  }, [value]);

  const select = (name: string, city: string): void => {
    const label = city ? `${name} — ${city}` : name;
    setQuery(label);
    onChange(label);
    setResults([]);
  };

  return (
    <div className="ed-stack" style={{ gap: 12, textAlign: 'left' }}>
      <Field label="Recherche ton établissement" hint="Annuaire officiel de l’Éducation nationale (open data) ; tu peux aussi saisir le nom librement.">
        {({ id, describedBy }) => (
          <TextInput
            id={id}
            aria-describedby={describedBy}
            icon={<Search size={17} />}
            placeholder="Ex. : lycée Marie Curie, ou ta ville"
            value={query}
            autoComplete="off"
            onChange={(event) => {
              setQuery(event.target.value);
              onChange(event.target.value);
            }}
          />
        )}
      </Field>

      {state === 'loading' ? (
        <p className="ed-small ed-mute" role="status">
          Recherche en cours…
        </p>
      ) : null}

      {state === 'unavailable' ? (
        <Notice tone="warning">
          L’annuaire des établissements est momentanément injoignable. Tu peux saisir le nom de ton lycée directement :
          il sera bien enregistré.
        </Notice>
      ) : null}

      {results.length > 0 ? (
        <div className="ed-stack" style={{ gap: 6 }} role="listbox" aria-label="Établissements suggérés">
          {results.map((school) => {
            const label = `${school.name} — ${school.city}`;
            return (
              <button
                key={label}
                type="button"
                role="option"
                aria-selected={value === label}
                className="list-item"
                style={{ width: '100%', textAlign: 'left', background: 'var(--ed-surface)' , border: '1px solid var(--ed-border)' }}
                onClick={() => select(school.name, school.city)}
              >
                <span className="list-item__icon" aria-hidden="true">
                  <Building2 size={17} />
                </span>
                <span className="list-item__body">
                  <span className="list-item__title">{school.name}</span>
                  <span className="list-item__meta">
                    {school.city}
                    {school.postalCode ? ` (${school.postalCode})` : ''} · {school.nature}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Parcours guidé                                                     */
/* ------------------------------------------------------------------ */

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { user, signup, updateUser, updatePreferences, status } = useAuth();
  const isAnonymous = status === 'anonymous';

  const [draft, setDraft] = useState<Draft>(() => ({
    ...EMPTY_DRAFT,
    firstName: user?.firstName ?? '',
    age: user?.age ? String(user.age) : '',
    school: user?.school ?? '',
    email: user?.email ?? '',
    level: typeof user?.level === 'string' ? user.level : '',
    subjects: user?.subjects ?? [],
    avatar: user?.avatar ?? '🦉',
    accent: user?.preferences?.accent ?? '#6c5ce7',
    theme: user?.preferences?.theme ?? 'sombre',
    dailyGoal: user?.preferences?.dailyGoal ?? 20,
  }));

  const [options, setOptions] = useState<OptionsResponse | null>(null);
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const [busy, setBusy] = useState(false);

  const steps: StepId[] = useMemo(() => {
    const base: StepId[] = ['welcome', 'name', 'age', 'school', 'email'];
    if (isAnonymous) base.push('password');
    base.push('level', 'subjects', 'prefs', 'done');
    return base;
  }, [isAnonymous]);

  const current = steps[step] ?? 'welcome';

  useEffect(() => {
    document.title = 'Bienvenue sur EduMate';
    endpoints
      .options()
      .then(setOptions)
      .catch(() => {
        // Repli local : le parcours reste utilisable même sans API.
        setOptions({
          levels: [
            { id: 'troisieme', name: 'Troisième', short: '3ᵉ' },
            { id: 'seconde', name: 'Seconde', short: '2de' },
            { id: 'premiere', name: 'Première', short: '1ʳᵉ' },
            { id: 'terminale', name: 'Terminale', short: 'Tle' },
          ],
          subjects: [],
          subjectsByLevel: {},
          avatars: MASCOTS,
          accents: ['#6c5ce7', '#4f6df5', '#00b894', '#e17055', '#0984e3', '#e84393'],
        });
      });
  }, []);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]): void => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setError(null);
  };

  const fail = (message: string): void => {
    setError(message);
    setShake((value) => value + 1);
  };

  const validate = (id: StepId): string | null => {
    switch (id) {
      case 'name':
        if (draft.firstName.trim().length < 2) return 'Indique ton prénom (2 caractères minimum).';
        if (draft.firstName.trim().length > 40) return 'Ton prénom est trop long (40 caractères maximum).';
        return null;
      case 'age': {
        if (!draft.age) return null; // facultatif
        const age = Number(draft.age);
        if (!Number.isInteger(age) || age < 8 || age > 99) return 'Indique un âge valide (entre 8 et 99 ans).';
        return null;
      }
      case 'email': {
        if (isAnonymous && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(draft.email.trim())) {
          return 'Cette adresse e-mail ne semble pas valide.';
        }
        return null;
      }
      case 'password': {
        if (!isAnonymous) return null;
        const issues: string[] = [];
        if (draft.password.length < 8) issues.push('8 caractères minimum');
        if (!/[a-zA-Z]/.test(draft.password)) issues.push('au moins une lettre');
        if (!/\d/.test(draft.password)) issues.push('au moins un chiffre');
        if (issues.length) return `Mot de passe trop faible : ${issues.join(', ')}.`;
        if (draft.password !== draft.confirm) return 'Les deux mots de passe ne correspondent pas.';
        return null;
      }
      case 'level':
        if (!draft.level) return 'Choisis ton niveau pour adapter les contenus.';
        return null;
      default:
        return null;
    }
  };

  const finish = async (): Promise<void> => {
    setBusy(true);
    try {
      if (isAnonymous) {
        await signup({
          firstName: draft.firstName.trim(),
          age: draft.age ? Number(draft.age) : undefined,
          school: draft.school.trim() || undefined,
          email: draft.email.trim(),
          password: draft.password,
          level: draft.level || undefined,
          subjects: draft.subjects,
          avatar: draft.avatar,
          accent: draft.accent,
          theme: draft.theme,
        });
        if (draft.dailyGoal !== 20) await updatePreferences({ dailyGoal: draft.dailyGoal });
      } else {
        await updateUser({
          firstName: draft.firstName.trim(),
          age: draft.age ? Number(draft.age) : undefined,
          school: draft.school.trim() || undefined,
          level: draft.level || undefined,
          subjects: draft.subjects,
          avatar: draft.avatar,
          onboarded: true,
        });
        await updatePreferences({ accent: draft.accent, theme: draft.theme, dailyGoal: draft.dailyGoal });
      }
      setStep(steps.length - 1);
      setDirection(1);
      window.setTimeout(() => navigate('/tableau-de-bord', { replace: true }), 1900);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Impossible d’enregistrer ton espace. Réessaie.';
      toast.error(message);
      // Revenir à l'étape concernée si l'erreur vient d'un champ précis.
      if (/e-mail/i.test(message)) setStep(steps.indexOf('email'));
      else if (/mot de passe/i.test(message)) setStep(steps.indexOf('password'));
    } finally {
      setBusy(false);
    }
  };

  const next = async (): Promise<void> => {
    const problem = validate(current);
    if (problem) {
      fail(problem);
      return;
    }
    if (current === 'prefs') {
      await finish();
      return;
    }
    if (current === 'done') {
      navigate('/tableau-de-bord', { replace: true });
      return;
    }
    setDirection(1);
    setStep((value) => Math.min(steps.length - 1, value + 1));
  };

  const previous = (): void => {
    setDirection(-1);
    setError(null);
    setStep((value) => Math.max(0, value - 1));
  };

  const progress = Math.round((step / (steps.length - 1)) * 100);
  const subjectsForLevel = options?.subjectsByLevel?.[draft.level] ?? null;
  const visibleSubjects = (options?.subjects ?? []).filter((subject) => !subjectsForLevel || subjectsForLevel.includes(subject.id));

  /* ------------------------------ Rendu ------------------------------ */

  const renderStep = () => {
    switch (current) {
      case 'welcome':
        return (
          <>
            <span className="onboard__mascot" aria-hidden="true">
              🦉
            </span>
            <h1 className="onboard__title">Bienvenue sur EduMate !</h1>
            <p className="onboard__text">
              En quelques questions, je prépare un espace de travail qui te ressemble : tes matières, ton niveau, tes
              outils et ton ambiance visuelle.
            </p>
            <div className="ed-row" style={{ justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
              {['Aide aux devoirs', 'Quiz corrigés', 'Calendrier', 'Minuteur', 'Musique'].map((item) => (
                <span key={item} className="badge badge--primary">
                  <Sparkles size={12} /> {item}
                </span>
              ))}
            </div>
          </>
        );

      case 'name':
        return (
          <>
            <span className="onboard__mascot" aria-hidden="true">
              👋
            </span>
            <h1 className="onboard__title">Comment t’appelles-tu ?</h1>
            <p className="onboard__text">Ton prénom s’affichera dans ton espace et sur tes encouragements.</p>
            <Field label="Prénom">
              {({ id, describedBy, invalid }) => (
                <TextInput
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid || Boolean(error)}
                  large
                  autoFocus
                  autoComplete="given-name"
                  icon={<User size={18} />}
                  placeholder="Ex. : Camille"
                  value={draft.firstName}
                  onChange={(event) => set('firstName', event.target.value)}
                />
              )}
            </Field>
          </>
        );

      case 'age':
        return (
          <>
            <span className="onboard__mascot" aria-hidden="true">
              🎂
            </span>
            <h1 className="onboard__title">Quel âge as-tu ?</h1>
            <p className="onboard__text">Facultatif : cela nous aide à adapter le ton des explications.</p>
            <div className="pill-grid" style={{ justifyContent: 'center' }}>
              {Array.from({ length: 9 }, (_unused, index) => index + 12).map((age) => (
                <Pill key={age} active={draft.age === String(age)} onClick={() => set('age', String(age))} color="var(--ed-primary)">
                  {age} ans
                </Pill>
              ))}
            </div>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => set('age', '')} style={{ margin: '10px auto 0' }}>
              Je préfère ne pas l’indiquer
            </button>
          </>
        );

      case 'school':
        return (
          <>
            <span className="onboard__mascot" aria-hidden="true">
              🏫
            </span>
            <h1 className="onboard__title">Dans quel établissement étudies-tu ?</h1>
            <p className="onboard__text">Recherche ton collège ou ton lycée, ou saisis-le directement. Étape facultative.</p>
            <SchoolStep value={draft.school} onChange={(value) => set('school', value)} />
          </>
        );

      case 'email':
        return (
          <>
            <span className="onboard__mascot" aria-hidden="true">
              ✉️
            </span>
            <h1 className="onboard__title">{isAnonymous ? 'Quelle est ton adresse e-mail ?' : 'Ton adresse e-mail'}</h1>
            <p className="onboard__text">
              {isAnonymous
                ? 'Elle sert uniquement à te reconnecter. Aucune publicité, aucun partage.'
                : 'Tu peux la modifier ici si besoin.'}
            </p>
            <Field label="Adresse e-mail" error={error}>
              {({ id, describedBy, invalid }) => (
                <TextInput
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  large
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  readOnly={!isAnonymous}
                  icon={<Mail size={18} />}
                  placeholder="prenom.nom@exemple.fr"
                  value={draft.email}
                  onChange={(event) => set('email', event.target.value)}
                />
              )}
            </Field>
          </>
        );

      case 'password':
        return (
          <>
            <span className="onboard__mascot" aria-hidden="true">
              🔐
            </span>
            <h1 className="onboard__title">Choisis un mot de passe</h1>
            <p className="onboard__text">8 caractères minimum, avec une lettre et un chiffre. Il est haché, jamais stocké en clair.</p>
            <div className="ed-stack" style={{ textAlign: 'left' }}>
              <Field label="Mot de passe" error={error}>
                {({ id, describedBy, invalid }) => (
                  <TextInput
                    id={id}
                    aria-describedby={describedBy}
                    invalid={invalid}
                    large
                    type="password"
                    autoComplete="new-password"
                    icon={<Lock size={18} />}
                    placeholder="••••••••"
                    value={draft.password}
                    onChange={(event) => set('password', event.target.value)}
                  />
                )}
              </Field>
              <Field label="Confirme ton mot de passe">
                {({ id }) => (
                  <TextInput
                    id={id}
                    large
                    type="password"
                    autoComplete="new-password"
                    icon={<Lock size={18} />}
                    placeholder="••••••••"
                    value={draft.confirm}
                    onChange={(event) => set('confirm', event.target.value)}
                  />
                )}
              </Field>
            </div>
          </>
        );

      case 'level':
        return (
          <>
            <span className="onboard__mascot" aria-hidden="true">
              🎓
            </span>
            <h1 className="onboard__title">Quel est ton niveau ?</h1>
            <p className="onboard__text">Les quiz et les explications s’adapteront automatiquement à ta classe.</p>
            <div className="card-grid card-grid--tight" style={{ textAlign: 'left' }}>
              {(options?.levels ?? []).map((level) => (
                <button
                  key={level.id}
                  type="button"
                  className={`card card--hover${draft.level === level.id ? ' topic-card--selected' : ''}`}
                  onClick={() => set('level', level.id)}
                  aria-pressed={draft.level === level.id}
                  style={
                    draft.level === level.id
                      ? { borderColor: 'var(--ed-primary)', background: 'color-mix(in srgb, var(--ed-primary) 10%, var(--ed-surface))' }
                      : undefined
                  }
                >
                  <span className="badge badge--primary">{level.short}</span>
                  <strong style={{ fontFamily: 'var(--ed-font-display)', fontSize: '1.08rem' }}>{level.name}</strong>
                  {draft.level === level.id ? (
                    <span className="ed-row" style={{ color: 'var(--ed-primary)', fontWeight: 700, fontSize: '0.85rem' }}>
                      <Check size={15} /> Sélectionné
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </>
        );

      case 'subjects':
        return (
          <>
            <span className="onboard__mascot" aria-hidden="true">
              📚
            </span>
            <h1 className="onboard__title">Quelles matières étudies-tu ?</h1>
            <p className="onboard__text">
              Sélectionne autant de matières que tu veux{subjectsForLevel ? ' (celles de ton niveau sont mises en avant)' : ''}. Tu
              pourras les modifier plus tard.
            </p>
            <div className="pill-grid" style={{ justifyContent: 'center' }}>
              {visibleSubjects.map((subject) => (
                <Pill
                  key={subject.id}
                  active={draft.subjects.includes(subject.id)}
                  color={subject.color}
                  onClick={() =>
                    set(
                      'subjects',
                      draft.subjects.includes(subject.id)
                        ? draft.subjects.filter((id) => id !== subject.id)
                        : [...draft.subjects, subject.id],
                    )
                  }
                >
                  <span aria-hidden="true">{subject.emoji}</span> {subject.name}
                </Pill>
              ))}
              {visibleSubjects.length === 0 ? <p className="ed-mute">Chargement des matières…</p> : null}
            </div>
            {draft.subjects.length ? (
              <p className="ed-small" style={{ marginTop: 14, color: 'var(--ed-primary)', fontWeight: 700 }}>
                {draft.subjects.length} matière{draft.subjects.length > 1 ? 's' : ''} sélectionnée{draft.subjects.length > 1 ? 's' : ''}
              </p>
            ) : null}
          </>
        );

      case 'prefs':
        return (
          <>
            <span className="onboard__mascot" aria-hidden="true">
              🎨
            </span>
            <h1 className="onboard__title">Personnalise ton EduMate</h1>
            <p className="onboard__text">Ces réglages restent modifiables à tout moment dans tes paramètres.</p>

            <div className="ed-stack" style={{ textAlign: 'left', gap: 18 }}>
              <div>
                <p className="field__label" style={{ marginBottom: 8 }}>
                  Choisis un compagnon
                </p>
                <div className="pill-grid">
                  {(options?.avatars ?? MASCOTS).map((avatar) => (
                    <Pill key={avatar} active={draft.avatar === avatar} onClick={() => set('avatar', avatar)}>
                      <span style={{ fontSize: 20 }} aria-hidden="true">
                        {avatar}
                      </span>
                    </Pill>
                  ))}
                </div>
              </div>

              <div>
                <p className="field__label" style={{ marginBottom: 8 }}>
                  Couleur principale
                </p>
                <div className="swatches">
                  {(options?.accents ?? []).map((accent) => (
                    <button
                      key={accent}
                      type="button"
                      className="swatch"
                      style={{ background: accent }}
                      aria-pressed={draft.accent === accent}
                      aria-label={`Couleur ${accent}`}
                      onClick={() => {
                        set('accent', accent);
                        document.documentElement.style.setProperty('--ed-primary', accent);
                      }}
                    />
                  ))}
                </div>
              </div>

              <div>
                <p className="field__label" style={{ marginBottom: 8 }}>
                  Ambiance
                </p>
                <div className="pill-grid">
                  {([
                    { value: 'clair', label: '☀️ Clair' },
                    { value: 'sombre', label: '🌙 Sombre' },
                    { value: 'auto', label: '🖥️ Système' },
                  ] as const).map((item) => (
                    <Pill key={item.value} active={draft.theme === item.value} onClick={() => set('theme', item.value)}>
                      {item.label}
                    </Pill>
                  ))}
                </div>
              </div>

              <div>
                <p className="field__label" style={{ marginBottom: 8 }}>
                  Objectif quotidien : <strong>{draft.dailyGoal} minutes</strong>
                </p>
                <input
                  className="range"
                  type="range"
                  min={5}
                  max={180}
                  step={5}
                  value={draft.dailyGoal}
                  aria-label="Objectif quotidien en minutes"
                  onChange={(event) => set('dailyGoal', Number(event.target.value))}
                />
              </div>
            </div>
          </>
        );

      case 'done':
      default:
        return (
          <>
            <Confetti />
            <span className="onboard__mascot" aria-hidden="true">
              <PartyPopper size={64} color="var(--ed-primary)" />
            </span>
            <h1 className="onboard__title">Ton espace EduMate est prêt !</h1>
            <p className="onboard__text">
              {draft.firstName ? `Bonne rentrée ${draft.firstName} ! ` : ''}On t’emmène vers ton tableau de bord…
            </p>
            <div className="ed-row" style={{ justifyContent: 'center' }}>
              <span className="spinner spinner--lg" style={{ color: 'var(--ed-primary)' }} />
            </div>
          </>
        );
    }
  };

  const showNav = current !== 'welcome' && current !== 'done';

  return (
    <div className="onboard">
      <Toasts />
      <span className="onboard__blob" style={{ width: 420, height: 420, background: '#a29bfe', top: '-120px', left: '-120px' }} />
      <span className="onboard__blob" style={{ width: 360, height: 360, background: '#67e8f9', bottom: '-140px', right: '-100px', animationDelay: '2s' }} />

      <div style={{ position: 'absolute', top: 20, left: 24, zIndex: 2 }} className="ed-row">
        <Logo size={38} />
        <strong style={{ fontFamily: 'var(--ed-font-display)', fontSize: '1.15rem' }}>EduMate</strong>
      </div>

      {isAnonymous ? (
        <div style={{ position: 'absolute', top: 20, right: 24, zIndex: 2 }}>
          <Link to="/connexion">
            <Button variant="ghost" size="sm">
              J’ai déjà un compte
            </Button>
          </Link>
        </div>
      ) : null}

      <motion.div className="onboard__card" layout transition={{ layout: { duration: 0.28 } }}>
        {/* Progression visuelle */}
        <div className="onboard__steps" aria-hidden="true">
          {steps.map((id, index) => (
            <span
              key={id}
              className={`onboard__step${index < step ? ' onboard__step--done' : ''}${index === step ? ' onboard__step--active' : ''}`}
            />
          ))}
        </div>
        <p className="sr-only" role="status">
          Étape {step + 1} sur {steps.length}
        </p>

        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={current + String(shake > 0 && error ? shake : '')}
            custom={direction}
            initial={{ opacity: 0, x: direction * 42 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -42 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className={error && shake ? 'anim-shake' : ''}
          >
            {renderStep()}
          </motion.div>
        </AnimatePresence>

        {error ? (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} style={{ marginTop: 16 }} role="alert">
            <Notice tone="danger">{error}</Notice>
          </motion.div>
        ) : null}

        <div className="onboard__actions">
          {current === 'welcome' ? (
            <>
              <Button size="lg" variant="primary" onClick={next} iconRight={<ArrowRight size={18} />}>
                C’est parti !
              </Button>
              {isAnonymous ? (
                <Link to="/connexion">
                  <Button size="lg" variant="ghost">
                    J’ai déjà un compte
                  </Button>
                </Link>
              ) : (
                <Button size="lg" variant="ghost" onClick={() => navigate('/tableau-de-bord')}>
                  Passer
                </Button>
              )}
            </>
          ) : null}

          {showNav ? (
            <>
              <IconButton label="Étape précédente" onClick={previous} variant="soft" disabled={busy}>
                <ArrowLeft size={18} />
              </IconButton>
              <Button
                size="lg"
                variant="primary"
                onClick={next}
                loading={busy}
                iconRight={current === 'prefs' ? <Palette size={18} /> : <ArrowRight size={18} />}
              >
                {current === 'prefs' ? 'Créer mon espace' : 'Continuer'}
              </Button>
            </>
          ) : null}
        </div>

        {current !== 'welcome' && current !== 'done' ? (
          <p className="ed-small ed-mute" style={{ marginTop: 16 }}>
            Étape {step + 1} / {steps.length} · {progress} % complété
          </p>
        ) : null}
      </motion.div>
    </div>
  );
}
