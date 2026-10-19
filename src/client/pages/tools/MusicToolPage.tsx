import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Headphones,
  Info,
  Pause,
  Play,
  Radio,
  RotateCcw,
  SkipBack,
  SkipForward,
  Volume2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { Button } from '../../components/ui/Button.js';
import { Card, CardSubtitle, CardTitle } from '../../components/ui/Card.js';
import { Badge } from '../../components/ui/Badge.js';
import { ToolShell } from '../../components/tools/ToolShell.js';
import { toast } from '../../lib/store.js';
import { RECOMMENDED_TRACKS } from '../../lib/music.js';
import { MOODS, music, resolveMood } from '../../lib/music.js';
import { useDocumentTitle } from '../../lib/hooks.js';
import { useAuth } from '../../lib/store.js';
import { endpoints } from '../../lib/api.js';

/**
 * Visualiseur.
 *
 * Deux régimes : analyse spectrale réelle pour la musique générée (Web Audio),
 * animation douce déterministe pour les webradios (voir `music.levels()` : un
 * flux tiers ne peut pas être branché sur un AnalyserNode sans CORS).
 */
function Visualizer({ synthetic }: { synthetic: boolean }) {
  const [, force] = useState(0);
  useEffect(() => {
    let frame = 0;
    const loop = (): void => {
      force((value) => (value + 1) % 100000);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);
  const levels = music.levels();
  const colors = music.mood.colors;
  return (
    <div
      className="visualizer"
      style={{ height: 64, gap: 5, justifyContent: 'center' }}
      aria-hidden="true"
      title={synthetic ? 'Animation décorative (flux externe : analyse spectrale indisponible)' : 'Analyse spectrale en temps réel'}
    >
      {levels.map((level, index) => (
        <span
          key={index}
          style={{
            width: 7,
            height: `${Math.max(6, level * 100)}%`,
            borderRadius: 4,
            background: `linear-gradient(180deg, ${colors[0]}, ${colors[1]})`,
            transition: 'height 90ms linear',
          }}
        />
      ))}
    </div>
  );
}

export default function MusicToolPage() {
  useDocumentTitle('Musique de concentration');
  const user = useAuth((state) => state.user);
  const [, force] = useState(0);

  // Toute évolution du moteur (état radio, stations, volume) déclenche un rendu.
  useEffect(() => music.subscribe(() => force((value) => value + 1)), []);

  const mood = resolveMood(music.moodId);
  const isRadio = music.isRadio;
  const station = music.station;
  const radioState = music.radioSnapshot.state;
  const buffering = music.radioSnapshot.buffering || radioState === 'loading';

  /* Chargement des stations de l'ambiance initiale. */
  useEffect(() => {
    if (mood.source === 'radio' && !music.stations.length && !music.loadingStations) {
      void music.loadStations(mood.id);
    }
    // Volontairement lancé une seule fois au montage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Restaure l'ambiance mémorisée dans les préférences du compte. */
  useEffect(() => {
    const saved = user?.preferences?.focusMusic;
    if (saved && saved !== music.moodId) void music.selectMood(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.preferences?.focusMusic]);

  const selectMood = (id: string): void => {
    void music.selectMood(id);
    if (user) void endpoints.updatePreferences({ focusMusic: id }).catch(() => undefined);
  };

  const moodIndex = useMemo(() => MOODS.findIndex((item) => item.id === music.moodId), [music.moodId]);
  const nextMood = (): void => selectMood(MOODS[(moodIndex + 1) % MOODS.length].id);
  const previousMood = (): void => selectMood(MOODS[(moodIndex - 1 + MOODS.length) % MOODS.length].id);

  /*
   * Navigation « précédent / suivant » :
   *   - en mode radio → change de STATION dans la même ambiance,
   *   - en mode local  → change d'AMBIANCE.
   * C'est le comportement attendu d'un lecteur de webradio.
   */
  const onSkipForward = (): void => (isRadio ? music.nextStation() : nextMood());
  const onSkipBack = (): void => (isRadio ? music.previousStation() : previousMood());

  const playing = music.playing || radioState === 'playing';

  /* Sonde la présence des fichiers recommandés (public/music/). */
  useEffect(() => {
    void music.probeRecommended();
  }, []);

  return (
    <ToolShell
      title="Musique"
      description="De la musique douce pour travailler : de vraies webradios (lo-fi, piano, classique, jazz, ambient) et des ambiances générées par ton navigateur pour les bruits de nature."
      icon={<Headphones size={24} />}
      aside={
        <>
          <Card>
            <CardTitle icon={<Info size={16} />}>D’où vient la musique ?</CardTitle>
            <CardSubtitle>
              Les ambiances marquées <strong>Webradio</strong> diffusent de vraies stations libres, sélectionnées via
              l’annuaire ouvert Radio Browser — aucune clé d’API, aucun compte, aucun fichier hébergé. Les ambiances
              marquées <strong>Générée</strong> sont composées en temps réel par ton navigateur (pluie, vagues, forêt) :
              les webradios fiables sont rares pour ces sons.
            </CardSubtitle>
            <CardSubtitle>
              Si une webradio devient injoignable, l’ambiance suivante est essayée automatiquement, puis EduMate replie
              sur la musique générée : tu n’es jamais bloqué.
            </CardSubtitle>
          </Card>
          <Card flat>
            <CardTitle>🎯 Choisir son ambiance</CardTitle>
            <ul style={{ marginTop: 10, paddingLeft: '1.1em', color: 'var(--ed-text-soft)', fontSize: '0.9rem', display: 'grid', gap: 6 }}>
              <li>
                <strong>Lo-fi / Chillout</strong> : exercices de maths, tâches répétitives.
              </li>
              <li>
                <strong>Piano / Classique</strong> : lecture, rédaction, langues.
              </li>
              <li>
                <strong>Jazz feutré</strong> : travaux de groupe, projets longs.
              </li>
              <li>
                <strong>Nappe atmosphérique</strong> : mémorisation intense.
              </li>
              <li>
                <strong>Pluie / vagues / forêt</strong> : masquer les bruits parasites.
              </li>
            </ul>
          </Card>
        </>
      }
    >
      {/* -------------------- Recommandation du moment (héro) -------------------- */}
      {RECOMMENDED_TRACKS.map((rec) => {
        const available = music.isRecAvailable(rec.id);
        const playingRec = music.recId === rec.id && music.playing;
        return (
          <motion.section
            key={rec.id}
            className={`rec-hero${playingRec ? ' rec-hero--live' : ''}`}
            style={{ ['--rec-a' as string]: rec.colors[0], ['--rec-b' as string]: rec.colors[1] }}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="rec-hero__glow" aria-hidden="true" />
            <div className="rec-hero__art" aria-hidden="true">
              <motion.span
                className="rec-hero__disc"
                animate={playingRec ? { rotate: 360 } : { rotate: 0 }}
                transition={playingRec ? { duration: 5, repeat: Infinity, ease: 'linear' } : { duration: 0.5 }}
              >
                <span>{rec.emoji}</span>
              </motion.span>
              {playingRec ? (
                <span className="rec-hero__eq">
                  {[0, 1, 2, 3, 4].map((bar) => (
                    <motion.span
                      key={bar}
                      animate={{ scaleY: [0.35, 1, 0.55, 0.9, 0.4] }}
                      transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut', delay: bar * 0.13 }}
                    />
                  ))}
                </span>
              ) : null}
            </div>

            <div className="rec-hero__main">
              <span className="rec-hero__kicker">Recommandation EduMate</span>
              <h2>
                {rec.title} <span className="rec-hero__artist">· {rec.artist}</span>
              </h2>
              <p className="rec-hero__desc">{rec.description}</p>

              {available ? (
                <div className="ed-row" style={{ gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                  <Button
                    variant="primary"
                    icon={playingRec ? <Pause size={16} /> : <Play size={16} />}
                    onClick={() => {
                      void music.toggleRecommended(rec.id).then((ok) => {
                        if (!ok) toast.warning('Lecture impossible : le fichier audio est absent ou illisible.');
                      });
                    }}
                  >
                    {playingRec ? 'Mettre en pause' : 'Écouter maintenant'}
                  </Button>
                </div>
              ) : (
                <div className="rec-hero__setup">
                  <p>
                    <strong>Active-la en 30 s :</strong> télécharge ton fichier (depuis ton Mediafire ou un achat
                    légal), dépose-le sous le nom <code>public/music/nodey-no-title.mp3</code> (ou <code>.wav</code>,{' '}
                    <code>.ogg</code>, <code>.m4a</code>) puis recharge — ou règle <code>RECOMMENDED_MUSIC_URL</code> sur
                    Render vers une URL https que tu héberges.
                  </p>
                  <div className="ed-row" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    {rec.legal.map((link) => (
                      <a key={link.label} className="btn btn--soft btn--sm" href={link.url} target="_blank" rel="noopener noreferrer nofollow">
                        Écouter sur {link.label}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {playingRec ? <span className="rec-hero__live">EN LECTURE</span> : null}
          </motion.section>
        );
      })}

      <motion.div
        className="card"
        style={{
          background: `linear-gradient(135deg, ${mood.colors[0]}, ${mood.colors[1]})`,
          color: '#fff',
          border: 'none',
          padding: 'clamp(20px, 3vw, 30px)',
          textAlign: 'center',
        }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
      >
        <span style={{ fontSize: 54, display: 'inline-block' }} className={playing ? 'anim-float' : undefined} aria-hidden="true">
          {mood.emoji}
        </span>
        <h2 style={{ color: '#fff', marginTop: 6 }}>{mood.name}</h2>
        <p style={{ opacity: 0.94, maxWidth: '52ch', margin: '4px auto 0' }}>
          {isRadio && station ? station.name : mood.description}
        </p>

        <div style={{ margin: '18px auto 0', maxWidth: 420, background: 'rgba(255,255,255,.16)', borderRadius: 18, padding: '12px 14px' }}>
          <Visualizer synthetic={isRadio} />
        </div>

        <div className="ed-row" style={{ justifyContent: 'center', gap: 12, marginTop: 20 }}>
          <Button
            variant="soft"
            onClick={onSkipBack}
            aria-label={isRadio ? 'Station précédente' : 'Ambiance précédente'}
            title={isRadio ? 'Station précédente' : 'Ambiance précédente'}
            style={{ ['--btn-bg' as string]: 'rgba(255,255,255,.2)', ['--btn-fg' as string]: '#fff' }}
          >
            <SkipBack size={18} />
          </Button>
          <Button
            size="lg"
            variant="primary"
            onClick={() => music.toggle()}
            disabled={music.loadingStations}
            style={{ ['--btn-bg' as string]: '#fff', ['--btn-fg' as string]: mood.colors[0], minWidth: 148 }}
          >
            {buffering ? <Radio size={20} /> : playing ? <Pause size={20} /> : <Play size={20} />}
            {music.loadingStations ? 'Chargement…' : buffering ? 'Connexion…' : playing ? 'Pause' : 'Lecture'}
          </Button>
          <Button
            variant="soft"
            onClick={onSkipForward}
            aria-label={isRadio ? 'Station suivante' : 'Ambiance suivante'}
            title={isRadio ? 'Station suivante' : 'Ambiance suivante'}
            style={{ ['--btn-bg' as string]: 'rgba(255,255,255,.2)', ['--btn-fg' as string]: '#fff' }}
          >
            <SkipForward size={18} />
          </Button>
        </div>

        <div className="ed-row" style={{ gap: 12, marginTop: 20, maxWidth: 320, marginInline: 'auto' }}>
          <Volume2 size={18} aria-hidden="true" />
          <input
            className="range"
            type="range"
            min={0}
            max={100}
            value={Math.round(music.volume * 100)}
            aria-label="Volume"
            onChange={(event) => music.setVolume(Number(event.target.value) / 100)}
          />
          <span style={{ fontVariantNumeric: 'tabular-nums', minWidth: 40, textAlign: 'right', fontWeight: 700 }}>
            {Math.round(music.volume * 100)} %
          </span>
        </div>

        <div className="ed-row" style={{ justifyContent: 'center', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          <Badge tone="outline" style={{ background: 'rgba(255,255,255,.2)', color: '#fff', borderColor: 'transparent' }}>
            {isRadio ? (
              <>
                <Wifi size={12} /> Webradio
              </>
            ) : (
              <>
                <WifiOff size={12} /> Générée
              </>
            )}
          </Badge>
          {isRadio && music.stations.length > 1 ? (
            <Badge tone="outline" style={{ background: 'rgba(255,255,255,.2)', color: '#fff', borderColor: 'transparent' }}>
              Station {music.radioSnapshot.index + 1}/{music.stations.length}
            </Badge>
          ) : null}
          {isRadio && station?.bitrate ? (
            <Badge tone="outline" style={{ background: 'rgba(255,255,255,.2)', color: '#fff', borderColor: 'transparent' }}>
              🎼 {station.bitrate} kb/s {station.codec}
            </Badge>
          ) : null}
          {!isRadio && mood.bpm ? (
            <Badge tone="outline" style={{ background: 'rgba(255,255,255,.2)', color: '#fff', borderColor: 'transparent' }}>
              🎼 {mood.bpm} BPM
            </Badge>
          ) : null}
          <Badge tone="outline" style={{ background: 'rgba(255,255,255,.2)', color: '#fff', borderColor: 'transparent' }}>
            ♾️ Écoute en continu
          </Badge>
        </div>
      </motion.div>

      {/* Message de repli : toujours explicite, jamais silencieux. */}
      {music.stationsError ? (
        <Card flat style={{ marginTop: 16, borderColor: 'var(--ed-warning)' }}>
          <div className="ed-row" style={{ justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <CardSubtitle>⚠️ {music.stationsError}</CardSubtitle>
            {mood.source === 'radio' ? (
              <Button size="sm" variant="ghost" icon={<RotateCcw size={15} />} onClick={() => void music.retryRadio()}>
                Réessayer les webradios
              </Button>
            ) : null}
          </div>
        </Card>
      ) : null}

      {music.radioSnapshot.notice && !music.stationsError ? (
        <Card flat style={{ marginTop: 16 }}>
          <CardSubtitle>ℹ️ {music.radioSnapshot.notice}</CardSubtitle>
        </Card>
      ) : null}

      <div className="ed-stack" style={{ gap: 12, marginTop: 20 }}>
        <CardTitle icon={<Headphones size={17} />}>Toutes les ambiances</CardTitle>
        <div className="track-list">
          {MOODS.map((item) => {
            const active = music.moodId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className="track"
                aria-pressed={active}
                onClick={() => selectMood(item.id)}
                style={{ ['--track-a' as string]: item.colors[0], ['--track-b' as string]: item.colors[1] }}
              >
                <span className="track__cover" aria-hidden="true">
                  {item.emoji}
                </span>
                <span className="ed-grow">
                  <span style={{ fontWeight: 700, display: 'block' }}>{item.name}</span>
                  <span className="ed-small ed-mute">{item.description}</span>
                </span>
                <span className="ed-row" style={{ gap: 6 }}>
                  <Badge tone="outline" style={{ fontSize: '0.68rem' }}>
                    {item.source === 'radio' ? (
                      <>
                        <Wifi size={10} /> Webradio
                      </>
                    ) : (
                      <>
                        <WifiOff size={10} /> Générée
                      </>
                    )}
                  </Badge>
                  {active ? (
                    <span className="ed-row" style={{ color: 'var(--ed-primary)' }} aria-hidden="true">
                      {playing ? <Pause size={16} /> : <Play size={16} />}
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Liste des stations de l'ambiance radio courante. */}
      {isRadio && music.stations.length ? (
        <div className="ed-stack" style={{ gap: 12, marginTop: 20 }}>
          <CardTitle icon={<Radio size={17} />}>Stations de cette ambiance</CardTitle>
          <div className="track-list">
            {music.stations.map((item, index) => {
              const active = music.radioSnapshot.index === index;
              return (
                <button
                  key={item.id}
                  type="button"
                  className="track"
                  aria-pressed={active}
                  onClick={() => {
                    // Un clic sur la station active bascule lecture/pause ;
                    // un clic sur une autre station saute directement dessus.
                    if (active) music.toggle();
                    else music.selectStation(index);
                  }}
                  style={{ ['--track-a' as string]: mood.colors[0], ['--track-b' as string]: mood.colors[1] }}
                >
                  <span className="track__cover" aria-hidden="true">
                    {/* Favicons http:// uniquement : la CSP bloque le mixte, et
                        un favicon cassé ne doit jamais produire d'erreur console. */}
                    {item.favicon && item.favicon.startsWith('https:') ? (
                      <img src={item.favicon} alt="" width={34} height={34} style={{ borderRadius: 8, objectFit: 'cover' }} loading="lazy" />
                    ) : (
                      '📻'
                    )}
                  </span>
                  <span className="ed-grow">
                    <span style={{ fontWeight: 700, display: 'block' }}>{item.name}</span>
                    <span className="ed-small ed-mute">
                      {item.codec}
                      {item.bitrate ? ` · ${item.bitrate} kb/s` : ''}
                      {item.country ? ` · ${item.country}` : ''}
                    </span>
                  </span>
                  {active ? (
                    <span className="ed-row" style={{ color: 'var(--ed-primary)' }} aria-hidden="true">
                      {playing ? <Pause size={16} /> : <Play size={16} />}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <Card flat style={{ marginTop: 18 }}>
        <CardTitle>🎧 Conseil d’utilisation</CardTitle>
        <CardSubtitle>
          Lance l’ambiance avant de commencer ta session, règle le volume à environ 30 % (la musique doit rester un
          fond, pas un premier plan) et combine-la avec le minuteur pour des blocs de 25 minutes. Les webradios
          diffusent en continu : pense à mettre en pause quand tu as terminé.
        </CardSubtitle>
      </Card>
    </ToolShell>
  );
}
