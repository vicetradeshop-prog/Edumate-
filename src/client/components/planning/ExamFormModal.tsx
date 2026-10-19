/**
 * EduMate — Modale « Ajouter un contrôle ».
 *
 * Deux temps :
 *   1. le formulaire (matière, nom, date, heure, notions, temps/jour, niveau) ;
 *   2. l'écran de succès avec le grand bouton animé « Générer mon planning »
 *      qui calcule le programme et ouvre la page du planning.
 *
 * Les notions sont proposées en fonction des fragilités réelles de l'élève
 * (cases à cocher) ; si rien n'est coché, le serveur proposera lui-même les
 * notions les plus pertinentes : jamais de planning vide.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CalendarDays, Clock3, Sparkles, Target, Wand2 } from 'lucide-react';
import { Modal } from '../ui/Modal.js';
import { Button } from '../ui/Button.js';
import { Field, Select, TextInput } from '../ui/Field.js';
import { endpoints, type Exam, type ExamView } from '../../lib/api.js';
import { useApi } from '../../lib/data.js';
import { toast, useCatalog } from '../../lib/store.js';
import { isoDate } from '../../lib/format.js';
import { DAILY_MINUTES_CHOICES, SELF_LEVELS } from '../../lib/planningUi.js';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Sujet pré-sélectionné (depuis le calendrier par ex.). */
  defaultSubjectId?: string;
}

export function ExamFormModal({ open, onClose, defaultSubjectId }: Props) {
  const navigate = useNavigate();
  const subjects = useCatalog((state) => state.subjects);
  const [subjectId, setSubjectId] = useState(defaultSubjectId ?? '');
  const [themeId, setThemeId] = useState('');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [topics, setTopics] = useState<string[]>([]);
  const [dailyMinutes, setDailyMinutes] = useState(30);
  const [customMinutes, setCustomMinutes] = useState('');
  const [selfLevel, setSelfLevel] = useState<'maitrise' | 'moyen' | 'difficultes' | 'zero'>('moyen');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<Exam | null>(null);
  const [generating, setGenerating] = useState(false);

  const browse = useApi(() => endpoints.browse(subjectId ? { subject: subjectId } : {}), { immediate: open, deps: [open, subjectId] });
  const themeTopics = useApi(
    () =>
      themeId
        ? endpoints.search({ theme: themeId, limit: 12 })
        : Promise.resolve({ items: [], total: 0, facets: { subjects: [], levels: [], difficulties: [], themes: [] } }),
    { immediate: open, deps: [open, themeId] },
  );

  useEffect(() => {
    if (open) {
      setSubjectId(defaultSubjectId ?? '');
      setThemeId('');
      setTitle('');
      setDate('');
      setTime('');
      setTopics([]);
      setDailyMinutes(30);
      setCustomMinutes('');
      setSelfLevel('moyen');
      setCreated(null);
      setGenerating(false);
      setBusy(false);
    }
  }, [open, defaultSubjectId]);

  useEffect(() => {
    void useCatalog.getState().load();
  }, []);

  /* Notions proposées : les sujets du THÈME choisi (ciblage fin). */
  const notionOptions = useMemo(() => (themeTopics.data?.items ?? []).slice(0, 12), [themeTopics.data]);
  const themes = browse.data?.themes ?? [];

  const minutes = customMinutes ? Number(customMinutes) : dailyMinutes;

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (!subjectId) {
      toast.warning('Choisis d’abord une matière.');
      return;
    }
    if (!themeId) {
      toast.warning('Choisis le thème du contrôle : le planning sera ciblé dessus.');
      return;
    }
    if (title.trim().length < 3) {
      toast.warning('Donne un nom à ton contrôle (ex. : Contrôle de dérivation).');
      return;
    }
    if (!date) {
      toast.warning('Indique la date du contrôle.');
      return;
    }
    if (!Number.isFinite(minutes) || minutes < 5 || minutes > 240) {
      toast.warning('Temps par jour : entre 5 et 240 minutes.');
      return;
    }
    setBusy(true);
    try {
      const response = await endpoints.planningCreateExam({
        subjectId,
        themeId: themeId || undefined,
        title: title.trim(),
        date,
        time: time || undefined,
        topics,
        dailyMinutes: Math.round(minutes),
        selfLevel,
      });
      setCreated(response.exam);
    } catch (error) {
      toast.fromError(error, 'Impossible de créer ce contrôle.');
    } finally {
      setBusy(false);
    }
  };

  const generate = async (): Promise<void> => {
    if (!created) return;
    setGenerating(true);
    try {
      await endpoints.planningGenerate(created.id);
      onClose();
      navigate(`/planning/${encodeURIComponent(created.id)}`);
    } catch (error) {
      toast.fromError(error, 'Génération impossible pour le moment.');
      setGenerating(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={created ? 'Contrôle enregistré 🎉' : 'Ajouter un contrôle'}
      wide
      footer={
        created ? null : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" form="exam-form" variant="primary" loading={busy} icon={<CalendarDays size={16} />}>
              Enregistrer le contrôle
            </Button>
          </>
        )
      }
    >
      {created ? (
        <motion.div
          className="exam-created"
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20 }}
        >
          <motion.span
            className="exam-created__emoji"
            aria-hidden="true"
            initial={{ rotate: -14, scale: 0.5 }}
            animate={{ rotate: 0, scale: 1 }}
            transition={{ delay: 0.15, type: 'spring', stiffness: 300, damping: 12 }}
          >
            🎯
          </motion.span>
          <h3 style={{ fontFamily: 'var(--ed-font-display)' }}>« {created.title} » est prêt !</h3>
          <p className="ed-soft" style={{ maxWidth: '46ch', margin: '6px auto 0' }}>
            EduMate connaît la date, la matière{created.topics.length ? ` et ${created.topics.length} notion${created.topics.length > 1 ? 's' : ''}` : ''}.
            Il ne reste qu'à construire ton programme de révision personnalisé.
          </p>
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
            <Button variant="primary" size="lg" loading={generating} icon={<Wand2 size={18} />} onClick={() => void generate()}>
              Générer mon planning
            </Button>
          </motion.div>
          <p className="ed-small ed-mute" style={{ marginTop: 10 }}>
            Le planning s'adaptera tout seul à tes résultats, séance après séance.
          </p>
        </motion.div>
      ) : (
        <form id="exam-form" onSubmit={submit} className="ed-stack" style={{ gap: 14 }}>
          <div className="ed-row" style={{ gap: 12, flexWrap: 'wrap' }}>
            <label className="field ed-grow" style={{ minWidth: 180 }}>
              <span className="field__label">Matière *</span>
              <Select
                value={subjectId}
                onChange={(event) => {
                  setSubjectId(event.target.value);
                  setTopics([]);
                }}
              >
                <option value="">Choisir…</option>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.emoji} {subject.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="field ed-grow" style={{ minWidth: 220 }}>
              <span className="field__label">Nom du contrôle *</span>
              <TextInput
                value={title}
                maxLength={80}
                placeholder="Ex. : Contrôle de dérivation n°2"
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
          </div>

          <div className="field">
            <span className="field__label">Thème concerné *</span>
            {subjectId ? (
              browse.loading && !browse.data ? (
                <div className="skeleton" style={{ height: 42 }} />
              ) : (
                <Select
                  value={themeId}
                  onChange={(event) => {
                    setThemeId(event.target.value);
                    setTopics([]);
                  }}
                >
                  <option value="">Choisir un thème…</option>
                  {themes.map((theme) => (
                    <option key={theme.id} value={theme.id}>
                      {theme.name} ({theme.count} sujets)
                    </option>
                  ))}
                </Select>
              )
            ) : (
              <p className="ed-small ed-mute">Choisis d'abord une matière.</p>
            )}
          </div>

          <div className="ed-row" style={{ gap: 12, flexWrap: 'wrap' }}>
            <label className="field" style={{ minWidth: 150 }}>
              <span className="field__label">Date *</span>
              <TextInput type="date" min={isoDate(new Date())} value={date} onChange={(event) => setDate(event.target.value)} />
            </label>
            <label className="field" style={{ minWidth: 120 }}>
              <span className="field__label">
                <Clock3 size={12} style={{ verticalAlign: '-1px' }} /> Heure (facultatif)
              </span>
              <TextInput type="time" value={time} onChange={(event) => setTime(event.target.value)} />
            </label>
            <div className="field ed-grow" style={{ minWidth: 200 }}>
              <span className="field__label">Temps disponible par jour</span>
              <div className="plan-chips" role="group" aria-label="Temps par jour">
                {DAILY_MINUTES_CHOICES.map((choice) => (
                  <button
                    key={choice.value}
                    type="button"
                    className={`plan-chip${!customMinutes && dailyMinutes === choice.value ? ' plan-chip--active' : ''}`}
                    onClick={() => {
                      setDailyMinutes(choice.value);
                      setCustomMinutes('');
                    }}
                  >
                    {choice.label}
                  </button>
                ))}
                <span className="plan-chip-custom">
                  <input
                    type="number"
                    min={5}
                    max={240}
                    inputMode="numeric"
                    placeholder="Perso."
                    aria-label="Temps personnalisé en minutes"
                    value={customMinutes}
                    onChange={(event) => setCustomMinutes(event.target.value)}
                  />
                  min
                </span>
              </div>
            </div>
          </div>

          <div className="field">
            <span className="field__label">
              <Target size={12} style={{ verticalAlign: '-1px' }} /> Notions du thème (facultatif : tout le thème sinon)
            </span>
            {themeId ? (
              themeTopics.loading && !themeTopics.data ? (
                <div className="ed-stack" style={{ gap: 6 }}>
                  <div className="skeleton" style={{ height: 34 }} />
                  <div className="skeleton" style={{ height: 34 }} />
                </div>
              ) : notionOptions.length ? (
                <div className="plan-notions" role="group" aria-label="Notions concernées">
                  {notionOptions.map((option) => {
                    const checked = topics.includes(option.id);
                    return (
                      <motion.button
                        key={option.id}
                        type="button"
                        aria-pressed={checked}
                        className={`plan-notion${checked ? ' plan-notion--on' : ''}`}
                        style={{ ['--notion-color' as string]: option.color }}
                        whileTap={{ scale: 0.96 }}
                        onClick={() => setTopics((prev) => (checked ? prev.filter((id) => id !== option.id) : [...prev, option.id]))}
                      >
                        <span aria-hidden="true">{option.emoji}</span>
                        {option.name}
                      </motion.button>
                    );
                  })}
                </div>
              ) : (
                <p className="ed-small ed-mute">Ce thème n'a pas de sujets jouables : choisis un autre thème.</p>
              )
            ) : (
              <p className="ed-small ed-mute">Choisis d'abord un thème : le planning ciblera exactement ses quiz et leçons.</p>
            )}
          </div>

          <div className="field">
            <span className="field__label">Ton niveau estimé sur ce contrôle</span>
            <div className="plan-chips" role="group" aria-label="Niveau estimé">
              {SELF_LEVELS.map((level) => (
                <button
                  key={level.id}
                  type="button"
                  className={`plan-chip${selfLevel === level.id ? ' plan-chip--active' : ''}`}
                  aria-pressed={selfLevel === level.id}
                  onClick={() => setSelfLevel(level.id)}
                >
                  <span aria-hidden="true">{level.emoji}</span> {level.label}
                </button>
              ))}
            </div>
          </div>

          <p className="ed-small ed-mute" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <Sparkles size={13} style={{ color: 'var(--ed-primary)', flex: 'none' }} />
            Le contrôle apparaîtra aussi dans ton calendrier, et le planning se recalculera après chaque séance.
          </p>
        </form>
      )}
    </Modal>
  );
}

export type { ExamView };
