import { useEffect, useState } from 'react';
import { Activity, Database, Download, HardDrive, Moon, Palette, RefreshCw, Save, Settings as SettingsIcon, ShieldAlert, Snowflake, Sparkles, Sun, Trash2, Volume2 } from 'lucide-react';
import { Button } from '../components/ui/Button.js';
import { Card, CardSubtitle, CardTitle } from '../components/ui/Card.js';
import { Badge } from '../components/ui/Badge.js';
import { Empty, Notice } from '../components/ui/Feedback.js';
import { Segmented, TextInput, Toggle } from '../components/ui/Field.js';
import { endpoints } from '../lib/api.js';
import { Modal } from '../components/ui/Modal.js';
import { toast, useAuth } from '../lib/store.js';
import { useNavigate } from 'react-router-dom';
import { useDocumentTitle } from '../lib/hooks.js';
import {
  clearPwaCaches,
  formatBytes,
  getCacheState,
  getPwaState,
  onPwaStateChange,
  setKeepAlive,
  type CacheState,
  type PwaState,
} from '../lib/pwa.js';
import { MOODS } from '../lib/music.js';
import type { Preferences } from '../../shared/types.js';

const ACCENTS = ['#6c5ce7', '#4f6df5', '#00b894', '#e17055', '#0984e3', '#e84393', '#fdcb6e', '#00cec9', '#16a34a', '#e11d48'];

/**
 * Carte « Application installée & disponibilité ».
 *
 * Regroupe les réglages liés au service worker : maintien du serveur éveillé,
 * état du cache et réinitialisation. Composant séparé pour ne pas alourdir
 * `SettingsPage` et pour isoler l'état PWA (qui évolue hors du formulaire).
 */
function PwaSettingsCard() {
  const [pwa, setPwa] = useState<PwaState>(getPwaState);
  const [cache, setCache] = useState<CacheState | null>(null);
  const [clearing, setClearing] = useState(false);

  useEffect(() => onPwaStateChange(setPwa), []);
  useEffect(() => {
    let cancelled = false;
    void getCacheState().then((value) => {
      if (!cancelled) setCache(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const entries = Object.entries(cache?.caches ?? {});
  const totalEntries = entries.reduce((sum, [, count]) => sum + count, 0);

  const onClear = async (): Promise<void> => {
    setClearing(true);
    const ok = await clearPwaCaches();
    setClearing(false);
    setCache(null);
    if (ok) toast.success('Cache vidé. Recharge la page pour tout re-télécharger.');
    else toast.error('Le cache n’a pas pu être vidé entièrement.');
  };

  return (
    <Card>
      <CardTitle icon={<Snowflake size={17} />}>Disponibilité & application installée</CardTitle>
      <CardSubtitle>
        EduMate conserve l’interface sur ton appareil : elle s’affiche instantanément, même quand le serveur met du
        temps à se réveiller (hébergement gratuit). Tes réponses et ta progression, elles, ne sont jamais mises en
        cache.
      </CardSubtitle>

      <div className="ed-stack" style={{ gap: 12, marginTop: 14 }}>
        <div className="ed-row" style={{ justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <span>
            <strong style={{ display: 'block', fontSize: '0.92rem' }}>Garder le serveur éveillé</strong>
            <span className="ed-small ed-mute">
              Une requête discrète toutes les 9 minutes, uniquement tant que cet onglet est ouvert. Évite les
              chargements de ~30 s pendant une session de travail.
            </span>
          </span>
          <Toggle
            checked={pwa.keepAlive}
            onChange={(checked) => setKeepAlive(checked)}
            label="Garder le serveur éveillé"
          />
        </div>

        <div className="ed-row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <Badge tone={pwa.supported ? 'success' : 'outline'}>
            {pwa.supported ? 'Service worker pris en charge' : 'Service worker indisponible'}
          </Badge>
          <Badge tone={pwa.active ? 'primary' : 'outline'}>
            {pwa.active ? 'Interface en cache' : 'Cache inactif'}
          </Badge>
          <Badge tone={pwa.offline ? 'warning' : 'outline'}>
            {pwa.offline ? 'Hors ligne' : 'En ligne'}
          </Badge>
          {cache?.version ? <Badge tone="outline">Version {cache.version}</Badge> : null}
        </div>

        {entries.length ? (
          <div className="ed-small ed-mute" style={{ display: 'grid', gap: 4 }}>
            <span className="ed-row" style={{ gap: 6 }}>
              <HardDrive size={14} aria-hidden="true" />
              {totalEntries} élément{totalEntries > 1 ? 's' : ''} en cache
              {cache?.storage ? ` · ${formatBytes(cache.storage.usage)}` : ''}
            </span>
            {entries.map(([name, count]) => (
              <span key={name} style={{ fontFamily: 'var(--ed-font-mono, monospace)', fontSize: '0.76rem' }}>
                {name} : {count}
              </span>
            ))}
          </div>
        ) : (
          <p className="ed-small ed-mute" style={{ margin: 0 }}>
            {pwa.active
              ? 'Aucun élément en cache pour l’instant : navigue quelques instants, puis reviens ici.'
              : 'Le cache n’est pas actif sur ce navigateur.'}
          </p>
        )}

        {pwa.error ? <Notice tone="warning">{pwa.error}</Notice> : null}

        <div className="ed-row" style={{ gap: 10, flexWrap: 'wrap' }}>
          <Button size="sm" variant="ghost" icon={<RefreshCw size={15} />} onClick={() => void onClear()} disabled={clearing}>
            {clearing ? 'Vidage…' : 'Vider le cache et désactiver'}
          </Button>
          <span className="ed-small ed-mute">
            À n’utiliser que si l’interface affiche une ancienne version après une mise à jour.
          </span>
        </div>
      </div>
    </Card>
  );
}

export default function SettingsPage() {
  useDocumentTitle('Paramètres');
  const { user, updatePreferences, logout } = useAuth();
  const [draft, setDraft] = useState<Preferences | null>(user?.preferences ?? null);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (user?.preferences) setDraft(user.preferences);
  }, [user?.preferences]);

  if (!user || !draft) {
    return <Empty emoji="⚙️" title="Paramètres indisponibles" description="Reconnecte-toi pour personnaliser EduMate." />;
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(user.preferences);

  const apply = (patch: Partial<Preferences>): void => {
    const next = { ...draft, ...patch };
    setDraft(next);
    // Aperçu immédiat du thème et de la couleur.
    const root = document.documentElement;
    if (patch.theme !== undefined) {
      const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
      root.dataset.theme = patch.theme === 'auto' ? (prefersDark ? 'sombre' : 'clair') : patch.theme;
    }
    if (patch.accent) root.style.setProperty('--ed-primary', patch.accent);
    if (patch.animations !== undefined) root.dataset.animations = patch.animations ? 'on' : 'off';
    if (patch.density !== undefined) root.dataset.density = patch.density;
  };

  const exportData = async (): Promise<void> => {
    setExporting(true);
    try {
      const blob = await endpoints.exportData();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `edumate-donnees-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success('Tes données ont été téléchargées.');
    } catch (error) {
      toast.fromError(error, 'Export impossible pour le moment.');
    } finally {
      setExporting(false);
    }
  };

  const deleteAccount = async (): Promise<void> => {
    if (deleteText.trim().toUpperCase() !== 'SUPPRIMER') {
      toast.warning('Écris exactement « SUPPRIMER » pour confirmer.');
      return;
    }
    setDeleting(true);
    try {
      await endpoints.deleteAccount();
      toast.success('Ton compte et toutes tes données ont été supprimés.');
      await logout();
      navigate('/', { replace: true });
    } catch (error) {
      toast.fromError(error, 'Suppression impossible.');
      setDeleting(false);
    }
  };

  const save = async (): Promise<void> => {
    setSaving(true);
    try {
      await updatePreferences(draft);
      toast.success('Préférences enregistrées.');
    } catch (error) {
      toast.fromError(error, 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ed-stack" style={{ gap: 22 }}>
      <header className="page-head">
        <div className="page-head__title">
          <span className="page-head__eyebrow">
            <SettingsIcon size={13} style={{ verticalAlign: '-2px' }} /> Personnalisation
          </span>
          <h1>Paramètres</h1>
          <p>Adapte l’apparence, l’accessibilité et tes objectifs. Les réglages sont enregistrés sur ton compte.</p>
        </div>
        <div className="ed-row" style={{ gap: 8 }}>
          {dirty ? <Badge tone="warning">Modifications non enregistrées</Badge> : null}
          <Button variant="primary" icon={<Save size={16} />} onClick={() => void save()} loading={saving} disabled={!dirty}>
            Enregistrer
          </Button>
        </div>
      </header>

      <div className="split">
        <div className="ed-stack" style={{ gap: 20 }}>
          <Card>
            <CardTitle icon={<Palette size={17} />}>Apparence</CardTitle>
            <CardSubtitle>Thème, couleur d’accent et densité de l’interface.</CardSubtitle>

            <div className="ed-stack" style={{ gap: 18, marginTop: 16 }}>
              <div>
                <p className="field__label" style={{ marginBottom: 8 }}>
                  Thème
                </p>
                <Segmented
                  ariaLabel="Thème"
                  value={draft.theme}
                  onChange={(value) => apply({ theme: value })}
                  options={[
                    { value: 'clair', label: <><Sun size={14} style={{ verticalAlign: '-2px' }} /> Clair</> },
                    { value: 'sombre', label: <><Moon size={14} style={{ verticalAlign: '-2px' }} /> Sombre</> },
                    { value: 'auto', label: '🖥️ Système' },
                  ]}
                />
              </div>

              <div>
                <p className="field__label" style={{ marginBottom: 8 }}>
                  Couleur principale
                </p>
                <div className="swatches">
                  {ACCENTS.map((accent) => (
                    <button
                      key={accent}
                      type="button"
                      className="swatch"
                      style={{ background: accent }}
                      aria-pressed={draft.accent === accent}
                      aria-label={`Couleur ${accent}`}
                      onClick={() => apply({ accent })}
                    />
                  ))}
                </div>
              </div>

              <div>
                <p className="field__label" style={{ marginBottom: 8 }}>
                  Densité
                </p>
                <Segmented
                  ariaLabel="Densité"
                  value={draft.density}
                  onChange={(value) => apply({ density: value })}
                  options={[
                    { value: 'confort', label: 'Confort' },
                    { value: 'compact', label: 'Compact' },
                  ]}
                />
              </div>
            </div>
          </Card>

          <Card>
            <CardTitle icon={<Sparkles size={17} />}>Accessibilité & confort</CardTitle>
            <CardSubtitle>EduMate respecte aussi la préférence système « animations réduites ».</CardSubtitle>
            <div className="ed-stack" style={{ gap: 16, marginTop: 16 }}>
              <Toggle
                checked={draft.animations}
                onChange={(value) => apply({ animations: value })}
                label="Animations et transitions"
                description="Désactive-les si tu préfères une interface parfaitement statique."
              />
              <Toggle
                checked={draft.sounds}
                onChange={(value) => apply({ sounds: value })}
                label="Sons d’interface"
                description="Carillon du minuteur et retours sonores légers."
              />
            </div>
          </Card>

          <Card>
            <CardTitle icon={<Activity size={17} />}>Objectif quotidien</CardTitle>
            <CardSubtitle>
              Un objectif réaliste vaut mieux qu’un objectif ambitieux abandonné. Actuellement :{' '}
              <strong>{draft.dailyGoal} minutes</strong> par jour.
            </CardSubtitle>
            <input
              className="range"
              type="range"
              min={5}
              max={180}
              step={5}
              value={draft.dailyGoal}
              aria-label="Objectif quotidien en minutes"
              style={{ marginTop: 14 }}
              onChange={(event) => apply({ dailyGoal: Number(event.target.value) })}
            />
            <div className="ed-row" style={{ justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--ed-text-mute)' }}>
              <span>5 min</span>
              <span>180 min</span>
            </div>
          </Card>

          <Card>
            <CardTitle icon={<Volume2 size={17} />}>Ambiance musicale par défaut</CardTitle>
            <CardSubtitle>L’ambiance sélectionnée au chargement du lecteur.</CardSubtitle>
            <div className="pill-grid" style={{ marginTop: 12 }}>
              {MOODS.map((mood) => (
                <button
                  key={mood.id}
                  type="button"
                  className="pill"
                  aria-pressed={draft.focusMusic === mood.id}
                  onClick={() => apply({ focusMusic: mood.id })}
                  title={mood.source === 'radio' ? 'Webradio (musique réelle)' : 'Ambiance générée par ton navigateur'}
                >
                  <span aria-hidden="true">{mood.emoji}</span> {mood.name}
                </button>
              ))}
            </div>
          </Card>
        </div>

        <div className="ed-stack" style={{ gap: 18 }}>
          <PwaSettingsCard />

          <Card>
            <CardTitle icon={<Database size={17} />}>Tes données</CardTitle>
            <CardSubtitle>
              Ton profil, ta progression, tes favoris, ton calendrier, tes tâches et tes conversations avec
              l’assistant sont enregistrés de façon sécurisée sur ton compte. Rien d’autre.
            </CardSubtitle>
            <div className="ed-row" style={{ gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              <Button variant="soft" size="sm" icon={<Download size={15} />} onClick={() => void exportData()} loading={exporting}>
                Télécharger mes données
              </Button>
            </div>
            <hr className="divider" />
            <div className="ed-row" style={{ justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <span className="ed-row" style={{ gap: 8, alignItems: 'flex-start' }}>
                <ShieldAlert size={17} style={{ color: 'var(--ed-danger)', flex: 'none', marginTop: 2 }} />
                <span>
                  <strong style={{ display: 'block', fontSize: '0.92rem' }}>Supprimer mon compte</strong>
                  <span className="ed-small ed-mute">Efface définitivement toutes tes données.</span>
                </span>
              </span>
              <Button variant="danger" size="sm" icon={<Trash2 size={15} />} onClick={() => setDeleteOpen(true)} disabled={Boolean(user.demo)}>
                Supprimer
              </Button>
            </div>
            {user.demo ? (
              <p className="ed-small ed-mute" style={{ marginTop: 8 }}>
                Le compte de démonstration est partagé : il ne peut pas être supprimé.
              </p>
            ) : null}
          </Card>

          <Card flat>
            <CardTitle>🔒 Confidentialité</CardTitle>
            <CardSubtitle>
              EduMate ne stocke que ce que tu saisis : profil, progression, favoris, calendrier, tâches et conversations
              avec l’assistant. Aucun traceur publicitaire, aucune revente de données. La suppression du compte efface
              l’ensemble de ces informations.
            </CardSubtitle>
          </Card>
        </div>
      </div>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Supprimer définitivement ton compte ?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Annuler
            </Button>
            <Button variant="danger" icon={<Trash2 size={16} />} onClick={() => void deleteAccount()} loading={deleting} disabled={deleteText.trim().toUpperCase() !== 'SUPPRIMER'}>
              Supprimer mon compte et mes données
            </Button>
          </>
        }
      >
        <div className="ed-stack" style={{ gap: 14 }}>
          <Notice tone="danger">
            Cette action est <strong>irréversible</strong>. Elle efface immédiatement :
            ton profil et tes préférences, ta progression et l’historique de tes quiz, tes favoris, ton calendrier,
            tes tâches et tes conversations avec l’assistant.
          </Notice>
          <p className="ed-small ed-soft">
            Tu peux d’abord récupérer une copie de tes données avec le bouton « Télécharger mes données ».
          </p>
          <label className="field">
            <span className="field__label">Écris SUPPRIMER pour confirmer</span>
            <TextInput value={deleteText} onChange={(event) => setDeleteText(event.target.value)} placeholder="SUPPRIMER" autoComplete="off" />
          </label>
        </div>
      </Modal>
    </div>
  );
}
