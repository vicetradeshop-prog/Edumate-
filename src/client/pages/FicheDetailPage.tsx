/**
 * EduMate — Fiche de révision d'un sujet (refonte v2.7).
 *
 * Lisibilité d'abord : héro dégradé calme, sections aérées avec en-têtes
 * iconisés et compteurs, items en rangées larges, formules en grandes tuiles,
 * astuce en encart distinct.
 *
 * Jeu de cartes mémo entièrement nouveau : un PAQUET empilé, une carte au
 * sommet ; on la retourne (clic / espace), puis on s'auto-évalue
 * (« Je savais » / « À revoir ») : la carte s'envoie voler à droite ou à
 * gauche, la suivante surgit du paquet. À la fin : bilan animé (score,
 * listes, confettis si ≥ 80 %) avec « Refaire les cartes ratées ».
 * Clavier : espace = retourner, ← = à revoir, → = je savais.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  BookOpenText,
  Check,
  PartyPopper as ConfettiIcon,
  Gamepad2,
  Layers,
  Lock,
  NotebookText,
  RotateCw,
  Shuffle,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react';
import { Button, IconButton } from '../components/ui/Button.js';
import { Card } from '../components/ui/Card.js';
import { Badge } from '../components/ui/Badge.js';
import { Confetti } from '../components/ui/Confetti.js';
import { Loader, Markdown, Notice } from '../components/ui/Feedback.js';
import { ApiError, endpoints, type Fiche } from '../lib/api.js';
import { useDocumentTitle, useHotkeys, usePrefersReducedMotion } from '../lib/hooks.js';
import { PrepRing } from './PlanningPage.js';

type Tab = 'fiche' | 'cartes';
type Grade = 'knew' | 'review';

interface DeckState {
  /** File des index de cartes restantes. */
  queue: number[];
  /** Cartes évaluées. */
  graded: { index: number; grade: Grade }[];
  flipped: boolean;
  /** Animation de sortie en cours ('knew' → droite, 'review' → gauche). */
  flying: Grade | null;
  finished: boolean;
}

export default function FicheDetailPage() {
  const { topicId = '' } = useParams();
  const reduced = usePrefersReducedMotion();
  const [fiche, setFiche] = useState<Fiche | null>(null);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('fiche');

  const [deck, setDeck] = useState<DeckState>({ queue: [], graded: [], flipped: false, flying: null, finished: false });

  useDocumentTitle(fiche ? `Fiche : ${fiche.topicName}` : 'Fiche de révision');

  const resetDeck = useCallback((indices: number[]) => {
    setDeck({ queue: indices, graded: [], flipped: false, flying: null, finished: indices.length === 0 });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await endpoints.fiche(topicId);
      setFiche(response.fiche);
      setLocked(false);
      resetDeck(response.fiche.flashcards.map((_card, index) => index));
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'fiche_verrouillee') setLocked(true);
      else setError(cause instanceof Error ? cause.message : 'Impossible de charger cette fiche.');
    } finally {
      setLoading(false);
    }
  }, [topicId, resetDeck]);

  useEffect(() => {
    void load();
  }, [load]);

  const cards = fiche?.flashcards ?? [];
  const current = deck.queue[0];
  const card = current !== undefined ? cards[current] ?? null : null;

  const knewCount = useMemo(() => deck.graded.filter((entry) => entry.grade === 'knew').length, [deck.graded]);

  const flip = useCallback(() => {
    setDeck((state) => (state.flying || state.finished ? state : { ...state, flipped: !state.flipped }));
  }, []);

  const grade = useCallback((value: Grade) => {
    setDeck((state) => {
      if (state.flying || !state.flipped || state.queue.length === 0) return state;
      return { ...state, flying: value };
    });
    // Laisse l'animation d'envol se dessiner avant de passer à la suite.
    window.setTimeout(() => {
      setDeck((state) => {
        if (!state.flying) return state;
        const [head, ...rest] = state.queue;
        const graded = [...state.graded, { index: head, grade: state.flying }];
        return { queue: rest, graded, flipped: false, flying: null, finished: rest.length === 0 };
      });
    }, reduced ? 0 : 320);
  }, [reduced]);

  useHotkeys(
    tab === 'cartes' && !deck.finished
      ? {
          ' ': () => flip(),
          arrowright: () => deck.flipped && grade('knew'),
          arrowleft: () => deck.flipped && grade('review'),
        }
      : {},
    tab === 'cartes' && cards.length > 0,
  );

  /* ------------------------------- États ------------------------------- */

  if (loading && !fiche) return <Loader label="Ouverture de ta fiche…" large />;

  if (error && !fiche) {
    return (
      <div className="ed-stack" style={{ gap: 14, maxWidth: 720, margin: '0 auto' }}>
        <Notice tone="danger">{error}</Notice>
        <div className="ed-row" style={{ gap: 10 }}>
          <Button variant="soft" onClick={() => void load()}>
            Réessayer
          </Button>
          <Link to="/fiches">
            <Button variant="ghost" icon={<ArrowLeft size={15} />}>
              Toutes mes fiches
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  if (locked || !fiche) {
    return (
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        <motion.div initial={{ opacity: 0, y: 18, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
          <Card style={{ textAlign: 'center', padding: '40px 26px' }}>
            <motion.span
              className="fiche-locked__icon"
              aria-hidden="true"
              initial={{ rotate: -8, scale: 0.7 }}
              animate={{ rotate: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 220, damping: 13, delay: 0.15 }}
            >
              <Lock size={26} />
            </motion.span>
            <h1 style={{ fontFamily: 'var(--ed-font-display)', marginTop: 14 }}>Fiche non débloquée</h1>
            <p className="ed-soft" style={{ maxWidth: '46ch', margin: '8px auto 0' }}>
              Cette fiche naît automatiquement dès que tu réussis la leçon du sujet avec au moins 80 % d’exercices
              justes. C’est parti ?
            </p>
            <div className="ed-row" style={{ justifyContent: 'center', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
              <Link to={`/lecons/${encodeURIComponent(topicId)}`}>
                <Button variant="primary" icon={<BookOpenText size={16} />}>
                  Ouvrir la leçon
                </Button>
              </Link>
              <Link to={`/quiz/${encodeURIComponent(topicId)}/jouer`}>
                <Button variant="soft" icon={<Gamepad2 size={16} />}>
                  Faire le quiz
                </Button>
              </Link>
              <Link to="/fiches">
                <Button variant="ghost" icon={<ArrowLeft size={15} />}>
                  Toutes mes fiches
                </Button>
              </Link>
            </div>
          </Card>
        </motion.div>
      </div>
    );
  }

  const reviewList = deck.graded.filter((entry) => entry.grade === 'review').map((entry) => cards[entry.index]).filter(Boolean);
  const deckScore = deck.graded.length ? Math.round((knewCount / deck.graded.length) * 100) : 0;

  /* ------------------------------ Contenu ------------------------------ */

  return (
    <div className="ed-stack" style={{ gap: 16 }}>
      <Link to="/fiches" className="section__link" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <ArrowLeft size={14} /> Toutes mes fiches
      </Link>

      {/* -------------------------------- Héro ----------------------------- */}
      <motion.header
        className="fiche3-hero"
        style={{ ['--fiche-color' as string]: fiche.color }}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        <span className="fiche3-hero__emoji" aria-hidden="true">
          {fiche.emoji}
        </span>
        <div className="fiche3-hero__main">
          <h1>{fiche.topicName}</h1>
          <div className="fiche3-hero__badges">
            <Badge tone="primary">{fiche.subjectName}</Badge>
            <Badge tone="outline">{fiche.themeName}</Badge>
            <Badge tone="outline">{fiche.levelName}</Badge>
            <Badge tone="success">🎓 {fiche.lessonScore}/{fiche.lessonTotal}</Badge>
            {fiche.quizBest !== null ? <Badge tone={fiche.quizBest >= 80 ? 'success' : 'warning'}>🏆 {fiche.quizBest} %</Badge> : null}
          </div>
        </div>
        <div className="fiche3-hero__actions">
          <Link to={`/lecons/${encodeURIComponent(fiche.topicId)}`}>
            <Button variant="soft" size="sm" icon={<BookOpenText size={15} />}>
              Leçon
            </Button>
          </Link>
          <Link to={`/quiz/${encodeURIComponent(fiche.topicId)}/jouer`}>
            <Button variant="soft" size="sm" icon={<Gamepad2 size={15} />}>
              Quiz
            </Button>
          </Link>
        </div>
      </motion.header>

      {/* ------------------------------- Onglets --------------------------- */}
      <div className="fiche-tabs" role="tablist" aria-label="Mode de révision">
        {(
          [
            { id: 'fiche' as Tab, label: 'Lire la fiche', icon: <Layers size={15} /> },
            { id: 'cartes' as Tab, label: `Jouer les cartes · ${cards.length}`, icon: <NotebookText size={15} /> },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`fiche-tab${tab === item.id ? ' fiche-tab--active' : ''}`}
            onClick={() => setTab(item.id)}
          >
            {tab === item.id ? <motion.span className="fiche-tab__pill" layoutId="fiche-tab-pill" transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }} /> : null}
            <span className="fiche-tab__label">
              {item.icon}
              {item.label}
            </span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {tab === 'fiche' ? (
          <motion.div key="fiche" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.24 }} className="ed-stack" style={{ gap: 12 }}>
            {fiche.sections.map((section, sectionIndex) => {
              const isTip = section.id === 'astuce';
              return (
                <motion.section
                  key={section.id}
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.36, delay: 0.05 + sectionIndex * 0.08, ease: [0.22, 1, 0.36, 1] }}
                >
                  <Card className={`fiche3-section${isTip ? ' fiche3-section--tip' : ''}`} style={{ ['--fiche-color' as string]: fiche.color }}>
                    <div className="fiche3-section__head">
                      <span className="fiche3-section__icon" aria-hidden="true">
                        {section.icon}
                      </span>
                      <h2>{section.title}</h2>
                      <span className="fiche3-section__count">
                        {section.items.length} point{section.items.length > 1 ? 's' : ''}
                      </span>
                    </div>
                    <ul className="fiche3-list">
                      {section.items.map((item, itemIndex) => (
                        <motion.li
                          key={itemIndex}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.3, delay: 0.14 + sectionIndex * 0.08 + itemIndex * 0.05 }}
                        >
                          <Markdown>{item}</Markdown>
                        </motion.li>
                      ))}
                    </ul>
                  </Card>
                </motion.section>
              );
            })}

            {fiche.formulas.length ? (
              <motion.section initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.36, delay: 0.2 }}>
                <Card className="fiche3-section" style={{ ['--fiche-color' as string]: fiche.color }}>
                  <div className="fiche3-section__head">
                    <span className="fiche3-section__icon" aria-hidden="true">
                      🧮
                    </span>
                    <h2>Formules à connaître</h2>
                    <span className="fiche3-section__count">{fiche.formulas.length}</span>
                  </div>
                  <div className="fiche3-formulas">
                    {fiche.formulas.map((formula, index) => (
                      <motion.span
                        key={formula}
                        className="fiche3-formula"
                        initial={{ opacity: 0, scale: 0.86 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.28 + index * 0.07, type: 'spring', stiffness: 300, damping: 18 }}
                        whileHover={{ scale: 1.05, y: -3 }}
                      >
                        <Markdown>{`$$${formula}$$`}</Markdown>
                      </motion.span>
                    ))}
                  </div>
                </Card>
              </motion.section>
            ) : null}
          </motion.div>
        ) : (
          <motion.div key="cartes" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.24 }}>
            {cards.length === 0 ? (
              <Card>
                <p className="ed-mute ed-center" style={{ padding: '20px 0' }}>
                  Cette fiche ne contient pas encore de cartes mémo.
                </p>
              </Card>
            ) : deck.finished ? (
              /* ---------------------------- Bilan de manche ---------------------------- */
              <motion.div className="deck-end" initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
                <Confetti show={deckScore >= 80 && !reduced} />
                <Card className="deck-end__card">
                  <motion.span className="deck-end__emoji" aria-hidden="true" initial={{ scale: 0.5, rotate: -12 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.1 }}>
                    {deckScore >= 80 ? '🏆' : deckScore >= 50 ? '💪' : '🌱'}
                  </motion.span>
                  <h2 style={{ fontFamily: 'var(--ed-font-display)' }}>
                    {deckScore >= 80 ? 'Impressionnant !' : deckScore >= 50 ? 'Bien joué !' : 'C’est en forgeant…'}
                  </h2>
                  <div className="deck-end__score">
                    <PrepRing percent={deckScore} color={deckScore >= 80 ? 'var(--ed-success)' : 'var(--ed-primary)'} size={84} />
                    <span className="ed-soft">
                      {knewCount} carte{knewCount > 1 ? 's' : ''} sue{knewCount > 1 ? 's' : ''} sur {deck.graded.length}
                    </span>
                  </div>
                  {reviewList.length ? (
                    <div className="deck-end__review">
                      <h3>
                        <ConfettiIcon size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} />
                        À revoir bientôt
                      </h3>
                      <ul>
                        {reviewList.slice(0, 6).map((item, index) => (
                          <motion.li key={item.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + index * 0.06 }}>
                            {item.icon} {item.front}
                          </motion.li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="ed-soft">Toutes les cartes sont sues : cette fiche est dans ta tête 🎉</p>
                  )}
                  <div className="ed-row" style={{ justifyContent: 'center', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
                    {reviewList.length ? (
                      <Button variant="primary" icon={<RotateCw size={16} />} onClick={() => resetDeck(reviewList.map((item) => cards.indexOf(item)))}>
                        Refaire les cartes ratées
                      </Button>
                    ) : null}
                    <Button variant="soft" icon={<Shuffle size={16} />} onClick={() => resetDeck(cards.map((_item, index) => index).sort(() => Math.random() - 0.5))}>
                        Mélanger tout rejouer
                    </Button>
                    <Button variant="ghost" onClick={() => resetDeck(cards.map((_item, index) => index))}>
                      Rejouer dans l’ordre
                    </Button>
                  </div>
                </Card>
              </motion.div>
            ) : (
              /* ------------------------------- Le paquet ------------------------------- */
              <div className="deck">
                <div className="deck__hud">
                  <span className="deck__hud-item">
                    Carte <strong>{deck.graded.length + 1}</strong>/{cards.length}
                  </span>
                  <span className="deck__progress" role="progressbar" aria-valuenow={deck.graded.length} aria-valuemin={0} aria-valuemax={cards.length}>
                    <motion.span
                      className="deck__progress-bar"
                      style={{ background: fiche.color }}
                      animate={{ width: `${(deck.graded.length / cards.length) * 100}%` }}
                      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                    />
                  </span>
                  <span className="deck__hud-item">
                    <Check size={13} style={{ color: 'var(--ed-success)', verticalAlign: '-2px' }} /> <strong>{knewCount}</strong>
                  </span>
                  <IconButton label="Mélanger le paquet restant" size="sm" variant="ghost" onClick={() => setDeck((state) => ({ ...state, queue: [...state.queue].sort(() => Math.random() - 0.5), flipped: false }))}>
                    <Shuffle size={15} />
                  </IconButton>
                </div>

                <div className="deck__stage">
                  {/* Cartes du dessous : effet paquet */}
                  <span className="deck__under deck__under--2" aria-hidden="true" />
                  <span className="deck__under deck__under--1" aria-hidden="true" />
                  <AnimatePresence mode="wait">
                    <motion.button
                      key={`${current}-${deck.graded.length}`}
                      type="button"
                      className="flipcard flipcard--game"
                      style={{ ['--fiche-color' as string]: fiche.color }}
                      initial={reduced ? false : { opacity: 0, y: 26, scale: 0.92 }}
                      animate={{
                        opacity: 1,
                        y: 0,
                        scale: 1,
                        rotateY: deck.flipped ? 180 : 0,
                        x: deck.flying === 'knew' ? 340 : deck.flying === 'review' ? -340 : 0,
                        rotate: deck.flying === 'knew' ? 14 : deck.flying === 'review' ? -14 : 0,
                        transition: { duration: reduced ? 0 : 0.32, ease: [0.22, 1, 0.36, 1] },
                      }}
                      exit={{ opacity: 0, transition: { duration: 0.05 } }}
                      onClick={flip}
                      aria-label={deck.flipped ? 'Carte retournée : évalue-toi' : 'Voir la réponse'}
                    >
                      <span className="flipcard__face flipcard__face--front">
                        <span className="flipcard__tag">Question</span>
                        <span className="flipcard__icon" aria-hidden="true">
                          {card?.icon ?? '🃏'}
                        </span>
                        <span className="flipcard__text">{card?.front}</span>
                        <span className="flipcard__hint">clic ou espace pour retourner</span>
                      </span>
                      <span className="flipcard__face flipcard__face--back">
                        <span className="flipcard__tag flipcard__tag--back">Réponse</span>
                        <span className="flipcard__back-content">
                          <Markdown>{card?.back ?? ''}</Markdown>
                        </span>
                      </span>
                    </motion.button>
                  </AnimatePresence>
                </div>

                <div className="deck__grade" aria-hidden={!deck.flipped}>
                  <motion.div initial={false} animate={{ opacity: deck.flipped ? 1 : 0.35, y: deck.flipped ? 0 : 6 }}>
                    <Button variant="danger" icon={<ThumbsDown size={16} />} disabled={!deck.flipped || deck.flying !== null} onClick={() => grade('review')}>
                      À revoir
                    </Button>
                    <Button variant="success" icon={<ThumbsUp size={16} />} disabled={!deck.flipped || deck.flying !== null} onClick={() => grade('knew')}>
                      Je savais
                    </Button>
                  </motion.div>
                  <p className="ed-small ed-mute">
                    <kbd>espace</kbd> retourner · <kbd>←</kbd> à revoir · <kbd>→</kbd> je savais
                  </p>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ------------------------------- Actions --------------------------- */}
      <div className="ed-row" style={{ justifyContent: 'center', gap: 10, flexWrap: 'wrap', paddingBottom: 8 }}>
        <Link to={`/quiz/${encodeURIComponent(fiche.topicId)}/jouer`}>
          <Button variant="primary" icon={<Gamepad2 size={16} />}>
            Vérifier en quiz
          </Button>
        </Link>
        <Link to={`/lecons/${encodeURIComponent(fiche.topicId)}`}>
          <Button variant="soft" icon={<BookOpenText size={16} />}>
            Refaire la leçon
          </Button>
        </Link>
        <Link to="/fiches">
          <Button variant="ghost" icon={<ArrowLeft size={15} />}>
            Toutes mes fiches
          </Button>
        </Link>
      </div>
    </div>
  );
}
