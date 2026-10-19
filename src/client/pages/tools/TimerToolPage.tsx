import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Bell, Coffee, Pause, Play, Plus, RotateCcw, Timer, Zap } from 'lucide-react';
import { Button, IconButton } from '../../components/ui/Button.js';
import { Card, CardSubtitle, CardTitle } from '../../components/ui/Card.js';
import { Badge, Progress } from '../../components/ui/Badge.js';
import { TextInput } from '../../components/ui/Field.js';
import { ToolShell } from '../../components/tools/ToolShell.js';
import { formatClock, formatDuration } from '../../lib/format.js';
import { useDocumentTitle, useLocalStorage } from '../../lib/hooks.js';
import { toast } from '../../lib/store.js';

const PRESETS = [
  { label: '5 min', minutes: 5 },
  { label: '10 min', minutes: 10 },
  { label: '15 min', minutes: 15 },
  { label: '25 min', minutes: 25 },
  { label: '45 min', minutes: 45 },
  { label: '60 min', minutes: 60 },
];

const POMODORO = { work: 25 * 60, break: 5 * 60, longBreak: 15 * 60 };

/** Bip de fin synthétisé (aucun fichier audio nécessaire). */
function playChime() {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor();
    const notes = [880, 1174.7, 1568];
    notes.forEach((frequency, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime + index * 0.19;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.28, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.55);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.6);
    });
    window.setTimeout(() => void ctx.close(), 1600);
  } catch {
    /* audio indisponible : l'alerte visuelle suffit */
  }
}

type Mode = 'libre' | 'travail' | 'pause';

export default function TimerToolPage() {
  useDocumentTitle('Minuteur');
  const [savedMinutes, setSavedMinutes] = useLocalStorage('edumate:timer:minutes', 25);
  const [minutes, setMinutes] = useState(String(savedMinutes));
  const [seconds, setSeconds] = useState('0');
  const [total, setTotal] = useState(savedMinutes * 60);
  const [remaining, setRemaining] = useState(savedMinutes * 60);
  const [running, setRunning] = useState(false);
  const [mode, setMode] = useState<Mode>('libre');
  const [cycles, setCycles] = useState(0);
  const [soundOn, setSoundOn] = useLocalStorage('edumate:timer:sound', true);
  const [finished, setFinished] = useState(false);
  const tickRef = useRef<number | null>(null);

  /* ------------------------- Synchronisation durée ------------------------ */
  const applyDuration = (mins: number, secs = 0): void => {
    const next = Math.max(1, Math.min(8 * 3600, mins * 60 + secs));
    setTotal(next);
    setRemaining(next);
    setRunning(false);
    setFinished(false);
  };

  useEffect(() => {
    const mins = Number.parseInt(minutes, 10);
    const secs = Number.parseInt(seconds, 10);
    if (!Number.isFinite(mins) && !Number.isFinite(secs)) return;
    if (!running) applyDuration(Number.isFinite(mins) ? mins : 0, Number.isFinite(secs) ? secs : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minutes, seconds]);

  /* ------------------------------ Compteur -------------------------------- */
  useEffect(() => {
    if (!running) {
      if (tickRef.current !== null) window.clearInterval(tickRef.current);
      tickRef.current = null;
      return;
    }
    tickRef.current = window.setInterval(() => {
      setRemaining((value) => {
        if (value <= 1) {
          window.clearInterval(tickRef.current!);
          tickRef.current = null;
          setRunning(false);
          setFinished(true);
          if (soundOn) playChime();
          // Enchaînement automatique du pomodoro.
          setMode((current) => {
            if (current === 'travail') {
              setCycles((count) => {
                const next = count + 1;
                const longBreak = next % 4 === 0;
                setTotal(longBreak ? POMODORO.longBreak : POMODORO.break);
                setRemaining(longBreak ? POMODORO.longBreak : POMODORO.break);
                toast.info(longBreak ? '4 cycles terminés : grande pause de 15 min ☕' : 'Pause de 5 minutes, respire 🌿');
                window.setTimeout(() => setRunning(true), 800);
                return next;
              });
              return 'pause';
            }
            if (current === 'pause') {
              setTotal(POMODORO.work);
              setRemaining(POMODORO.work);
              toast.info('C’est reparti pour 25 minutes de travail 💪');
              window.setTimeout(() => setRunning(true), 800);
              return 'travail';
            }
            toast.success(`Minuteur terminé (${formatDuration(total)}) !`);
            return current;
          });
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => {
      if (tickRef.current !== null) window.clearInterval(tickRef.current);
      tickRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, soundOn]);

  /* --------------------------- Titre de l'onglet -------------------------- */
  useEffect(() => {
    document.title = running ? `${formatClock(remaining)} · Minuteur EduMate` : 'Minuteur · EduMate';
    return () => {
      document.title = 'Minuteur · EduMate';
    };
  }, [remaining, running]);

  const progress = total > 0 ? 1 - remaining / total : 0;
  const ring = useMemo(() => {
    const radius = 128;
    const circumference = 2 * Math.PI * radius;
    return { radius, circumference, offset: circumference * (1 - (total > 0 ? remaining / total : 0)) };
  }, [remaining, total]);

  const startPomodoro = (): void => {
    setMode('travail');
    setCycles(0);
    setTotal(POMODORO.work);
    setRemaining(POMODORO.work);
    setFinished(false);
    setRunning(true);
    toast.info('Session pomodoro lancée : 25 min de travail, 5 min de pause.');
  };

  const ringColor = finished ? 'var(--ed-success)' : mode === 'pause' ? '#16a34a' : mode === 'travail' ? 'var(--ed-primary)' : 'var(--ed-accent)';

  return (
    <ToolShell
      title="Minuteur"
      description="Compte à rebours pour tes sessions de travail : durée libre ou méthode pomodoro enchaînée automatiquement."
      icon={<Timer size={24} />}
      aside={
        <>
          <Card>
            <CardTitle icon={<Zap size={16} />}>Méthode pomodoro</CardTitle>
            <CardSubtitle>
              25 min de concentration, 5 min de pause. Toutes les 4 sessions, une grande pause de 15 min est lancée
              automatiquement.
            </CardSubtitle>
            <div className="ed-row" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <Badge tone="primary">Cycles terminés : {cycles}</Badge>
              <Badge tone="outline">{mode === 'travail' ? 'Travail en cours' : mode === 'pause' ? 'Pause en cours' : 'Mode libre'}</Badge>
            </div>
            <Button variant="soft" block style={{ marginTop: 12 }} onClick={startPomodoro} icon={<Play size={16} />}>
              Lancer un pomodoro
            </Button>
          </Card>

          <Card flat>
            <CardTitle icon={<Bell size={16} />}>Alerte de fin</CardTitle>
            <CardSubtitle>Un carillon est joué par le navigateur (aucun fichier, aucun droit d’auteur).</CardSubtitle>
            <label className="checkbox" style={{ marginTop: 12 }}>
              <input type="checkbox" checked={soundOn} onChange={(event) => setSoundOn(event.target.checked)} />
              Activer le son
            </label>
            <Button variant="ghost" size="sm" style={{ marginTop: 8 }} onClick={playChime}>
              Tester le carillon
            </Button>
          </Card>

          <Card flat>
            <CardTitle icon={<Coffee size={16} />}>Conseils</CardTitle>
            <ul style={{ marginTop: 10, paddingLeft: '1.1em', color: 'var(--ed-text-soft)', fontSize: '0.9rem', display: 'grid', gap: 6 }}>
              <li>Une seule tâche par minuteur : note les autres idées sur papier.</li>
              <li>Coupe les notifications pendant le décompte.</li>
              <li>Enchaîne avec un quiz de 5 questions pour ancrer ce que tu viens de voir.</li>
            </ul>
          </Card>
        </>
      }
    >
      <div style={{ display: 'grid', placeItems: 'center', gap: 20, padding: '6px 0' }}>
        <div className={`dial${running ? ' dial--running' : ''}`}>
          <svg viewBox="0 0 300 300" aria-hidden="true">
            <circle cx="150" cy="150" r={ring.radius} fill="none" stroke="var(--ed-surface-3)" strokeWidth="18" />
            <motion.circle
              cx="150"
              cy="150"
              r={ring.radius}
              fill="none"
              stroke={ringColor}
              strokeWidth="18"
              strokeLinecap="round"
              strokeDasharray={ring.circumference}
              animate={{ strokeDashoffset: ring.offset }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
              transform="rotate(-90 150 150)"
            />
          </svg>
          <div className="dial__value">
            <span className="dial__time" role="timer" aria-live="off">
              {formatClock(remaining)}
            </span>
            <span className="dial__hint">
              {finished ? 'Terminé 🎉' : running ? (mode === 'pause' ? 'Pause' : 'En cours') : total > 0 ? 'Prêt' : '—'}
            </span>
          </div>
        </div>

        <div style={{ width: '100%', maxWidth: 420 }}>
          <Progress value={progress} thin color={ringColor} />
        </div>

        <div className="ed-row" style={{ gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Button
            size="lg"
            variant={running ? 'soft' : 'primary'}
            onClick={() => {
              if (finished) {
                setRemaining(total);
                setFinished(false);
              }
              setRunning((value) => !value);
            }}
            icon={running ? <Pause size={19} /> : <Play size={19} />}
          >
            {running ? 'Pause' : remaining === total && !finished ? 'Démarrer' : 'Reprendre'}
          </Button>
          <Button
            size="lg"
            variant="ghost"
            icon={<RotateCcw size={18} />}
            onClick={() => {
              setRunning(false);
              setRemaining(total);
              setFinished(false);
              if (mode !== 'libre') {
                setMode('libre');
                applyDuration(Number.parseInt(minutes, 10) || savedMinutes);
              }
            }}
          >
            Réinitialiser
          </Button>
          <IconButton
            label="Ajouter une minute"
            variant="soft"
            onClick={() => {
              setTotal((value) => value + 60);
              setRemaining((value) => value + 60);
              setFinished(false);
            }}
          >
            <Plus size={18} />
          </IconButton>
        </div>

        <div className="ed-stack" style={{ gap: 12, width: '100%', maxWidth: 460, marginTop: 6 }}>
          <div className="ed-row" style={{ gap: 10 }}>
            <label className="field ed-grow" htmlFor="timer-minutes">
              <span className="field__label">Minutes</span>
              <TextInput
                id="timer-minutes"
                type="number"
                min={0}
                max={180}
                value={minutes}
                disabled={running}
                onChange={(event) => {
                  setMinutes(event.target.value);
                  setSavedMinutes(Math.max(1, Math.min(180, Number(event.target.value) || 0)));
                }}
              />
            </label>
            <label className="field ed-grow" htmlFor="timer-seconds">
              <span className="field__label">Secondes</span>
              <TextInput id="timer-seconds" type="number" min={0} max={59} value={seconds} disabled={running} onChange={(event) => setSeconds(event.target.value)} />
            </label>
          </div>

          <div className="pill-grid" style={{ justifyContent: 'center' }}>
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className="pill"
                aria-pressed={total === preset.minutes * 60 && mode === 'libre'}
                disabled={running}
                onClick={() => {
                  setMode('libre');
                  setMinutes(String(preset.minutes));
                  setSeconds('0');
                  setSavedMinutes(preset.minutes);
                  applyDuration(preset.minutes);
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </ToolShell>
  );
}
