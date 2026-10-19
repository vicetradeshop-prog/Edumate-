import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeftRight, Check, Copy, Languages, Sparkles, Volume2 } from 'lucide-react';
import { Button, IconButton } from '../../components/ui/Button.js';
import { Card, CardSubtitle, CardTitle } from '../../components/ui/Card.js';
import { Badge } from '../../components/ui/Badge.js';
import { Notice } from '../../components/ui/Feedback.js';
import { Select, TextArea } from '../../components/ui/Field.js';
import { ToolShell } from '../../components/tools/ToolShell.js';
import { endpoints } from '../../lib/api.js';
import { useApi } from '../../lib/data.js';
import { useDebounced, useDocumentTitle } from '../../lib/hooks.js';
import { toast } from '../../lib/store.js';

const MAX_CHARS = 1200;

export default function TranslatorToolPage() {
  useDocumentTitle('Traducteur');
  const languages = useApi(() => endpoints.languages(), { immediate: true });
  const [source, setSource] = useState('auto');
  const [target, setTarget] = useState('en');
  const [text, setText] = useState('');
  const [translation, setTranslation] = useState<string | null>(null);
  const [detected, setDetected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const debounced = useDebounced(text, 650);

  const list = languages.data?.languages ?? [];
  const nameOf = (code: string): string => list.find((item) => item.code === code)?.name ?? code;
  const flagOf = (code: string): string => list.find((item) => item.code === code)?.flag ?? '🌐';

  /* ------------------------------ Traduction ------------------------------ */
  useEffect(() => {
    if (debounced.trim().length < 2) {
      setTranslation(null);
      setDetected(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setBusy(true);
    setError(null);
    endpoints
      .translate({ q: debounced.slice(0, MAX_CHARS), source: source === 'auto' ? undefined : source, target })
      .then((result) => {
        if (cancelled) return;
        setTranslation(result.translatedText);
        setDetected(result.detected ?? null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setTranslation(null);
        setError(err instanceof Error ? err.message : 'Traduction indisponible pour le moment.');
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, source, target]);

  const swap = (): void => {
    if (source === 'auto') {
      if (!detected) {
        toast.info('Saisis un texte pour détecter la langue avant d’inverser.');
        return;
      }
      setSource(detected);
      setTarget(detected === 'fr' ? 'en' : 'fr');
      return;
    }
    setSource(target);
    setTarget(source);
    if (translation) {
      setText(translation);
      setTranslation(text);
    }
  };

  const copy = async (): Promise<void> => {
    if (!translation) return;
    try {
      await navigator.clipboard.writeText(translation);
      setCopied(true);
      toast.success('Traduction copiée dans le presse-papiers.');
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error('Le navigateur a refusé l’accès au presse-papiers. Sélectionne le texte manuellement.');
    }
  };

  const speak = (value: string, lang: string): void => {
    if (!('speechSynthesis' in window)) {
      toast.warning('La synthèse vocale n’est pas disponible sur ce navigateur.');
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(value);
      utterance.lang = lang;
      utterance.rate = 0.95;
      window.speechSynthesis.speak(utterance);
    } catch {
      toast.error('Lecture audio impossible.');
    }
  };

  return (
    <ToolShell
      title="Traducteur"
      description="Traduction instantanée dans 15 langues, avec détection automatique et lecture audio."
      icon={<Languages size={24} />}
      aside={
        <>
          <Card>
            <CardTitle icon={<Sparkles size={16} />}>Traduction intelligente</CardTitle>
            <CardSubtitle>
              Des traductions instantanées et naturelles dans 15 langues, avec détection automatique de la langue
              d’origine. Ton texte n’est pas enregistré.
            </CardSubtitle>
          </Card>
          <Card flat>
            <CardTitle>🌐 Langues disponibles</CardTitle>
            <div className="pill-grid" style={{ marginTop: 10 }}>
              {(list.length ? list : [{ code: 'fr', name: 'Français', flag: '🇫🇷' }]).map((item) => (
                <span key={item.code} className="badge badge--outline">
                  {item.flag} {item.name}
                </span>
              ))}
            </div>
          </Card>
          <Card flat>
            <CardTitle>🎓 Pour les langues vivantes</CardTitle>
            <CardSubtitle>
              Le traducteur dépanne, mais ne remplace pas l’apprentissage : entraîne-toi ensuite avec les quiz
              d’anglais et d’espagnol (vocabulaire, verbes irréguliers, faux amis).
            </CardSubtitle>
          </Card>
        </>
      }
    >
      <div className="ed-row" style={{ gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <label className="field ed-grow" htmlFor="translate-source">
          <span className="field__label">Langue source</span>
          <Select id="translate-source" value={source} onChange={(event) => setSource(event.target.value)}>
            <option value="auto">🔎 Détection automatique</option>
            {list.map((item) => (
              <option key={item.code} value={item.code}>
                {item.flag} {item.name}
              </option>
            ))}
          </Select>
        </label>

        <span style={{ alignSelf: 'flex-end', marginBottom: 4 }}>
          <IconButton label="Inverser les langues" variant="soft" onClick={swap}>
            <ArrowLeftRight size={18} />
          </IconButton>
        </span>

        <label className="field ed-grow" htmlFor="translate-target">
          <span className="field__label">Langue cible</span>
          <Select id="translate-target" value={target} onChange={(event) => setTarget(event.target.value)}>
            {list.map((item) => (
              <option key={item.code} value={item.code}>
                {item.flag} {item.name}
              </option>
            ))}
          </Select>
        </label>
      </div>

      <div
        style={{
          display: 'grid',
          gap: 14,
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        }}
      >
        <div className="ed-stack" style={{ gap: 8 }}>
          <div className="ed-row" style={{ justifyContent: 'space-between' }}>
            <Badge tone="outline">
              {flagOf(source === 'auto' ? (detected ?? 'fr') : source)}{' '}
              {source === 'auto' ? (detected ? `${nameOf(detected)} (détecté)` : 'Texte original') : nameOf(source)}
            </Badge>
            <span className="ed-small ed-mute">
              {text.length}/{MAX_CHARS}
            </span>
          </div>
          <TextArea
            value={text}
            rows={8}
            maxLength={MAX_CHARS}
            placeholder="Écris ou colle ton texte ici…"
            aria-label="Texte à traduire"
            onChange={(event) => setText(event.target.value)}
          />
          <div className="ed-row" style={{ gap: 8 }}>
            <Button size="sm" variant="ghost" icon={<Volume2 size={15} />} onClick={() => speak(text, source === 'auto' ? (detected ?? 'fr') : source)} disabled={!text}>
              Écouter
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setText('');
                setTranslation(null);
              }}
              disabled={!text}
            >
              Effacer
            </Button>
          </div>
        </div>

        <div className="ed-stack" style={{ gap: 8 }}>
          <div className="ed-row" style={{ justifyContent: 'space-between' }}>
            <Badge tone="primary">
              {flagOf(target)} {nameOf(target)}
            </Badge>
            <span className="ed-row" style={{ gap: 4 }}>
              {busy ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : null}
              <IconButton label="Copier la traduction" size="sm" variant="ghost" onClick={() => void copy()} disabled={!translation}>
                {copied ? <Check size={16} style={{ color: 'var(--ed-success)' }} /> : <Copy size={16} />}
              </IconButton>
            </span>
          </div>

          <motion.div
            className="textarea"
            style={{
              minHeight: 178,
              background: 'var(--ed-surface-2)',
              whiteSpace: 'pre-wrap',
              overflowY: 'auto',
            }}
            aria-live="polite"
            initial={false}
            animate={{ opacity: busy ? 0.65 : 1 }}
            transition={{ duration: 0.2 }}
          >
            {error ? (
              <span style={{ color: 'var(--ed-danger)' }}>{error}</span>
            ) : translation ? (
              translation
            ) : (
              <span className="ed-mute">La traduction apparaîtra ici…</span>
            )}
          </motion.div>

          <div className="ed-row" style={{ gap: 8 }}>
            <Button size="sm" variant="ghost" icon={<Volume2 size={15} />} onClick={() => translation && speak(translation, target)} disabled={!translation}>
              Écouter la traduction
            </Button>
          </div>
        </div>
      </div>

      {error ? (
        <div style={{ marginTop: 14 }}>
          <Notice tone="warning">
            {error} Réessaie dans quelques instants.
          </Notice>
        </div>
      ) : null}

      {languages.error ? (
        <div style={{ marginTop: 14 }}>
          <Notice tone="warning">
            La liste des langues n’a pas pu être chargée, mais la traduction reste disponible.
          </Notice>
        </div>
      ) : null}
    </ToolShell>
  );
}
