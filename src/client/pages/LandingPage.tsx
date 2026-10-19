import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  GraduationCap,
  Headphones,
  Languages,
  PenTool,
  ShieldCheck,
  Sparkles,
  Timer,
  Zap,
} from 'lucide-react';
import { Button } from '../components/ui/Button.js';
import { LiquidGlassButton } from '../components/ui/LiquidGlassButton.js';
import { Logo } from '../components/ui/Feedback.js';
import { Toasts } from '../components/ui/Toasts.js';
import { endpoints } from '../lib/api.js';
import { useAuth, useCatalog, useUi } from '../lib/store.js';
import { formatNumber } from '../lib/format.js';

/* ------------------------------------------------------------------ */
/*  Apparition au défilement                                           */
/* ------------------------------------------------------------------ */

/** Enveloppe un bloc et le révèle lorsqu'il entre dans le viewport. */
function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={`reveal${visible ? ' is-visible' : ''} ${className}`.trim()} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

/** Nombre qui s'incrémente quand il devient visible. */
function CountUp({ value, duration = 1400 }: { value: number; duration?: number }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [display, setDisplay] = useState(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (reduced || value === 0) {
      setDisplay(value);
      return;
    }
    let frame = 0;
    let started = false;
    const startCounting = (): void => {
      if (started) return;
      started = true;
      const start = performance.now();
      const tick = (now: number): void => {
        const progress = Math.min(1, (now - start) / duration);
        const eased = 1 - (1 - progress) ** 3;
        setDisplay(Math.round(value * eased));
        if (progress < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        observer.disconnect();
        startCounting();
      },
      { threshold: 0.4 },
    );
    observer.observe(node);

    // Filet de sécurité : si l'observateur ne se déclenche jamais (navigateur
    // ancien, element deja visible, environnement sans IntersectionObserver),
    // la valeur finale est affichee plutôt que de rester à zéro.
    const fallback = window.setTimeout(startCounting, 1200);

    return () => {
      observer.disconnect();
      window.clearTimeout(fallback);
      cancelAnimationFrame(frame);
    };
  }, [value, duration, reduced]);

  return <span ref={ref}>{formatNumber(display)}</span>;
}

/* ------------------------------------------------------------------ */
/*  Données de présentation                                            */
/* ------------------------------------------------------------------ */

const FEATURES = [
  { icon: Sparkles, title: 'Aide aux devoirs', text: 'Un tuteur qui explique, reformule, propose une méthode pas à pas et génère des exercices adaptés à ton niveau.', color: '#6c5ce7' },
  { icon: GraduationCap, title: 'Quiz par milliers', text: 'Matière → niveau → thème → sujet : un catalogue organisé, des questions renouvelées à chaque partie.', color: '#0ea5e9' },
  { icon: BarChart3, title: 'Progression visible', text: 'Score, taux de réussite, sujets maîtrisés et à revoir, séries de jours : tu sais où tu en es.', color: '#16a34a' },
  { icon: Calendar, title: 'Organisation scolaire', text: 'Calendrier des devoirs, listes de tâches et vue « aujourd’hui » pour ne plus rien oublier.', color: '#f59e0b' },
  { icon: Timer, title: 'Minuteur & chrono', text: 'Sessions chronométrées, méthode pomodoro enchaînée automatiquement, pause et reprise en un clic.', color: '#e11d48' },
  { icon: PenTool, title: 'Tableau interactif', text: 'Dessine, écris, trace des formes, annule, exporte en PNG : explique tes raisonnements comme au tableau.', color: '#7c3aed' },
  { icon: Languages, title: 'Traducteur intégré', text: '15 langues, détection automatique, lecture audio, sans jamais quitter ta session de travail.', color: '#0891b2' },
  { icon: Headphones, title: 'Musique de concentration', text: 'Six ambiances générées en temps réel par ton navigateur : libres de droit, sans publicité.', color: '#db2777' },
] as const;

const FLOATERS = [
  { emoji: '📐', top: '14%', left: '6%', delay: '0s' },
  { emoji: '📚', top: '26%', left: '88%', delay: '1.4s' },
  { emoji: '⚗️', top: '58%', left: '4%', delay: '2.6s' },
  { emoji: '🧬', top: '72%', left: '92%', delay: '0.8s' },
  { emoji: '🌍', top: '40%', left: '94%', delay: '3.2s' },
  { emoji: '🦉', top: '84%', left: '12%', delay: '1.9s' },
  { emoji: '💻', top: '8%', left: '70%', delay: '2.2s' },
  { emoji: '📊', top: '92%', left: '70%', delay: '0.4s' },
];

const STEPS = [
  { title: 'Choisis ta matière et ton niveau', text: 'Le catalogue se filtre tout seul : maths, français, physique-chimie, SVT, histoire-géo, philo, langues, NSI, SES.' },
  { title: 'Lance un quiz de 5 à 30 questions', text: 'Les questions sont générées à chaque partie : tu ne récites jamais la même correction.' },
  { title: 'Comprends tes erreurs immédiatement', text: 'Chaque réponse est accompagnée d’une explication rédigée, pas seulement d’un bon ou d’un mauvais.' },
  { title: 'Suis ta progression et rejoue', text: 'Sujets maîtrisés, à revoir, séries de jours : ton tableau de bord te dit quoi travailler ensuite.' },
];

const MARQUEE_ITEMS = [
  '📐 Mathématiques', '📚 Français', '⚗️ Physique-Chimie', '🧬 SVT', '🌍 Histoire-Géographie',
  '🦉 Philosophie', '🇬🇧 Anglais', '🇪🇸 Espagnol', '💻 NSI', '📊 SES',
  '🎯 Dérivation', '✍️ Conjugaison', '🧪 Stœchiométrie', '🗓️ Guerre froide', '🐍 Python',
];

/* ------------------------------------------------------------------ */
/*  Aperçu d'interface animé (dans le héros)                           */
/* ------------------------------------------------------------------ */

function HeroPreview() {
  return (
    <div className="hero-preview" aria-hidden="true">
      <div className="hero-preview__bar">
        <span className="hero-preview__dot" style={{ background: '#ff5f57' }} />
        <span className="hero-preview__dot" style={{ background: '#febc2e' }} />
        <span className="hero-preview__dot" style={{ background: '#28c840' }} />
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <span className="badge badge--primary">Mathématiques</span>
        <span className="badge badge--outline">Première</span>
      </div>
      <div className="hero-preview__question">Quelle est la dérivée de f(x) = 3x² + 2x ?</div>
      <div className="hero-preview__option">
        <span className="hero-preview__key">A</span> f&apos;(x) = 3x + 2
      </div>
      <div className="hero-preview__option hero-preview__option--good">
        <span className="hero-preview__key">B</span> f&apos;(x) = 6x + 2
      </div>
      <div className="hero-preview__option">
        <span className="hero-preview__key">C</span> f&apos;(x) = 6x² + 2
      </div>
      <div
        style={{
          marginTop: 12,
          padding: '10px 12px',
          borderRadius: 13,
          background: 'var(--ed-success-soft)',
          borderLeft: '4px solid var(--ed-success)',
          fontSize: '0.8rem',
          color: 'var(--ed-text-soft)',
        }}
      >
        ✅ Bonne réponse ! On applique (xⁿ)&apos; = n·xⁿ⁻¹ terme à terme.
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function LandingPage() {
  const stats = useCatalog((state) => state.stats);
  const load = useCatalog((state) => state.load);
  const notify = useUi((state) => state.notify);
  // Sélecteur atomique : jamais d'objet littéral (boucle de rendu infinie).
  const demoAvailable = useAuth((state) => state.demoAvailable);
  const reduced = useReducedMotion();

  useEffect(() => {
    void load();
    document.title = 'EduMate — Réussir ensemble';
    // Contrôle de disponibilité discret (aucun détail technique affiché).
    endpoints
      .health()
      .then(() => undefined)
      .catch(() => notify('EduMate ne répond pas pour le moment. Réessaie dans quelques instants.', 'error', 7000));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fade = reduced ? { opacity: 1 } : undefined;

  return (
    <div className="landing">
      {/* Décor animé */}
      <div className="landing__backdrop" aria-hidden="true">
        <span className="landing__blob landing__blob--1" />
        <span className="landing__blob landing__blob--2" />
        <span className="landing__blob landing__blob--3" />
      </div>
      <div className="landing__floaters" aria-hidden="true">
        {FLOATERS.map((item) => (
          <span key={item.emoji + item.top} className="landing__floater" style={{ top: item.top, left: item.left, animationDelay: item.delay }}>
            {item.emoji}
          </span>
        ))}
      </div>

      <Toasts />

      {/* ------------------------------- En-tête ---------------------------- */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 30,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 14,
          flexWrap: 'wrap',
          padding: '14px clamp(16px, 4vw, 48px)',
          background: 'color-mix(in srgb, var(--ed-bg) 78%, transparent)',
          backdropFilter: 'blur(14px)',
          borderBottom: '1px solid var(--ed-border)',
        }}
      >
        <div className="ed-row" style={{ gap: 11 }}>
          <Logo size={42} />
          <span style={{ fontFamily: 'var(--ed-font-display)', fontSize: '1.4rem', fontWeight: 800 }}>EduMate</span>
        </div>
        <nav className="ed-row" style={{ gap: 8 }}>
          <Link to="/connexion">
            <Button variant="ghost">Se connecter</Button>
          </Link>
          <Link to="/inscription">
            <Button variant="primary" iconRight={<ArrowRight size={17} className="cta-arrow" />}>
              Créer mon espace
            </Button>
          </Link>
        </nav>
      </header>

      <main style={{ padding: '0 clamp(16px, 4vw, 48px) 70px', maxWidth: 1280, margin: '0 auto' }}>
        {/* -------------------------------- Héros ----------------------------- */}
        <section style={{ paddingTop: 'clamp(34px, 7vw, 84px)' }}>
          <div
            style={{
              display: 'grid',
              gap: 'clamp(28px, 4vw, 54px)',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))',
              alignItems: 'center',
            }}
          >
            <motion.div
              initial={reduced ? false : { opacity: 0, y: 26 }}
              animate={fade ?? { opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            >
              <motion.span
                className="badge badge--primary"
                style={{ marginBottom: 18, padding: '7px 14px', fontSize: '0.8rem' }}
                initial={reduced ? false : { opacity: 0, scale: 0.9 }}
                animate={fade ?? { opacity: 1, scale: 1 }}
                transition={{ delay: 0.08, duration: 0.4 }}
              >
                <Zap size={13} /> Plateforme éducative tout-en-un · gratuite et sans publicité
              </motion.span>

              <h1 className="landing__title" style={{ marginLeft: 0 }}>
                Ton espace scolaire pour <span className="landing__gradient">comprendre</span>, t’entraîner et{' '}
                <span className="landing__gradient">progresser</span>
              </h1>

              <p style={{ color: 'var(--ed-text-soft)', fontSize: '1.08rem', maxWidth: '54ch', lineHeight: 1.65 }}>
                Aide aux devoirs, quiz corrigés automatiquement, calendrier, minuteur, tableau interactif, traducteur et
                musique de concentration. Tout ce qu’il faut pour travailler sereinement — dans une seule application.
              </p>

              <div className="ed-row" style={{ gap: 12, marginTop: 28, flexWrap: 'wrap' }}>
                <Link to="/inscription">
                  <LiquidGlassButton size="lg" variant="primary" iconRight={<ArrowRight size={18} className="cta-arrow" />}>
                    Commencer gratuitement
                  </LiquidGlassButton>
                </Link>
                <Link to="/connexion">
                  <Button size="lg" variant="soft">
                    J’ai déjà un compte
                  </Button>
                </Link>
              </div>

              <div className="ed-row" style={{ gap: 18, marginTop: 22, flexWrap: 'wrap', color: 'var(--ed-text-mute)', fontSize: '0.86rem' }}>
                <span className="ed-row" style={{ gap: 6 }}>
                  <CheckCircle2 size={15} style={{ color: 'var(--ed-success)' }} /> Aucune carte bancaire
                </span>
                <span className="ed-row" style={{ gap: 6 }}>
                  <ShieldCheck size={15} style={{ color: 'var(--ed-info)' }} /> Mot de passe haché, jamais en clair
                </span>
                <span className="ed-row" style={{ gap: 6 }}>
                  <Zap size={15} style={{ color: 'var(--ed-warning)' }} /> Compte prêt en 2 minutes
                </span>
              </div>
            </motion.div>

            <motion.div
              initial={reduced ? false : { opacity: 0, y: 34, rotate: -1.5 }}
              animate={fade ?? { opacity: 1, y: 0, rotate: 0 }}
              transition={{ duration: 0.7, delay: 0.14, ease: [0.22, 1, 0.36, 1] }}
              style={{ maxWidth: 460, marginInline: 'auto', width: '100%' }}
            >
              <HeroPreview />
            </motion.div>
          </div>
        </section>

        {/* ------------------------------- Chiffres --------------------------- */}
        <section style={{ marginTop: 'clamp(40px, 6vw, 72px)' }}>
          <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            {[
              { emoji: '🎯', value: stats?.topics ?? 1316, label: 'sujets de quiz jouables', suffix: '' },
              { emoji: '📚', value: stats?.subjects ?? 10, label: 'matières, de la 3ᵉ à la Terminale', suffix: '' },
              { emoji: '🗂️', value: stats?.themes ?? 229, label: 'thèmes du programme', suffix: '' },
              { emoji: '♾️', value: stats?.questionPool ?? 4379774, label: 'questions possibles (générées)', suffix: '' },
            ].map((item, index) => (
              <Reveal key={item.label} delay={index * 70}>
                <div className="card landing-stat">
                  <span className="landing-stat__emoji" aria-hidden="true">
                    {item.emoji}
                  </span>
                  <div className="landing-stat__value">
                    <CountUp value={item.value} />
                    {item.suffix}
                  </div>
                  <div className="landing-stat__label">{item.label}</div>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ------------------------------- Bandeau ---------------------------- */}
        <Reveal>
          <section style={{ marginTop: 'clamp(36px, 5vw, 60px)' }}>
            <div className="marquee" aria-hidden="true">
              <div className="marquee__track">
                {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((item, index) => (
                  <span key={`${item}-${index}`} className="marquee__item">
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </section>
        </Reveal>

        {/* --------------------------- Fonctionnalités ------------------------ */}
        <section style={{ marginTop: 'clamp(44px, 7vw, 88px)' }}>
          <Reveal>
            <div style={{ textAlign: 'center', marginBottom: 34 }}>
              <h2>Tout ton travail scolaire, au même endroit</h2>
              <p className="ed-soft" style={{ maxWidth: '60ch', margin: '10px auto 0' }}>
                Pas de formulaire interminable : une interface claire, des cartes interactives et des animations légères
                qui restent fluides même sur un téléphone d’entrée de gamme.
              </p>
            </div>
          </Reveal>

          <div className="card-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(268px, 1fr))' }}>
            {FEATURES.map((feature, index) => (
              <Reveal key={feature.title} delay={(index % 4) * 70}>
                <div className="card feature-card" style={{ ['--feature-color' as string]: feature.color, height: '100%' }}>
                  <span className="feature-card__icon" aria-hidden="true">
                    <feature.icon size={24} />
                  </span>
                  <h3 style={{ marginTop: 14, marginBottom: 6 }}>{feature.title}</h3>
                  <p className="ed-soft" style={{ fontSize: '0.93rem', lineHeight: 1.6 }}>
                    {feature.text}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ------------------------------ Méthode ----------------------------- */}
        <section style={{ marginTop: 'clamp(48px, 8vw, 96px)' }}>
          <div
            style={{
              display: 'grid',
              gap: 'clamp(22px, 3vw, 40px)',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))',
              alignItems: 'stretch',
            }}
          >
            <Reveal>
              <div
                className="card"
                style={{
                  height: '100%',
                  border: 'none',
                  background: 'linear-gradient(140deg, #6c5ce7 0%, #7c5cd6 52%, #22d3ee 140%)',
                  color: '#fff',
                  padding: 'clamp(22px, 3vw, 34px)',
                }}
              >
                <h2 style={{ color: '#fff', marginBottom: 12 }}>Comment ça marche ?</h2>
                <div className="steps-flow">
                  {STEPS.map((step) => (
                    <div
                      key={step.title}
                      className="step-item"
                      style={{ background: 'rgba(255,255,255,.14)', border: 'none', backdropFilter: 'blur(4px)' }}
                    >
                      <span className="step-item__index" style={{ background: 'rgba(255,255,255,.92)', color: '#5a49d6' }} />
                      <span>
                        <strong style={{ display: 'block', color: '#fff', marginBottom: 2 }}>{step.title}</strong>
                        <span style={{ color: 'rgba(255,255,255,.88)', fontSize: '0.9rem' }}>{step.text}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>

            <Reveal delay={90}>
              <div className="card" style={{ height: '100%', padding: 'clamp(22px, 3vw, 34px)' }}>
                <h2 style={{ marginBottom: 14 }}>Pourquoi les élèves l’adoptent</h2>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 14 }}>
                  {[
                    'Inscription en 8 étapes guidées, une seule question à la fois',
                    'Compte sécurisé : connexion protégée et données confidentielles',
                    'Quiz corrigés automatiquement, avec une explication pour chaque réponse',
                    'Chaque erreur est expliquée, jamais juste sanctionnée',
                    'Fonctionne sur ordinateur, tablette et téléphone',
                    'Mode sombre, animations désactivables, navigation au clavier',
                    'Tu peux supprimer ton compte et toutes tes données en un clic',
                  ].map((item) => (
                    <li key={item} className="ed-row" style={{ gap: 11, alignItems: 'flex-start' }}>
                      <CheckCircle2 size={19} style={{ color: 'var(--ed-success)', flex: 'none', marginTop: 2 }} />
                      <span style={{ color: 'var(--ed-text-soft)', lineHeight: 1.55 }}>{item}</span>
                    </li>
                  ))}
                </ul>

                <div style={{ marginTop: 26 }}>
                  <Link to="/inscription">
                    <LiquidGlassButton variant="primary" block size="lg" iconRight={<ArrowRight size={18} className="cta-arrow" />}>
                      Créer mon espace gratuitement
                    </LiquidGlassButton>
                  </Link>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* --------------------------- Appel final ---------------------------- */}
        <Reveal>
          <section
            className="card"
            style={{
              marginTop: 'clamp(48px, 8vw, 96px)',
              textAlign: 'center',
              padding: 'clamp(30px, 5vw, 56px)',
              background: 'linear-gradient(135deg, color-mix(in srgb, var(--ed-primary) 12%, var(--ed-surface)), color-mix(in srgb, var(--ed-accent) 12%, var(--ed-surface)))',
            }}
          >
            <span style={{ fontSize: 46, display: 'inline-block' }} className="anim-float" aria-hidden="true">
              🦉
            </span>
            <h2 style={{ marginTop: 8 }}>Prêt à transformer tes révisions ?</h2>
            <p className="ed-soft" style={{ maxWidth: '52ch', margin: '10px auto 24px' }}>
              Crée ton espace en deux minutes, choisis ta matière et lance ton premier quiz. Ta progression est
              enregistrée automatiquement.
            </p>
            <div className="ed-row" style={{ justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
              <Link to="/inscription">
                <Button size="lg" variant="primary" iconRight={<ArrowRight size={18} className="cta-arrow" />}>
                  Commencer maintenant
                </Button>
              </Link>
              {/*
                Le compte de démonstration partagé est désactivé par défaut
                (ALLOW_DEMO_ACCOUNT=false). Le libellé s'adapte : promettre
                « Explorer le compte de démonstration » puis afficher une page de
                connexion dépourvue de ce bouton serait trompeur.
              */}
              <Link to="/connexion">
                <Button size="lg" variant="soft">
                  {demoAvailable ? 'Explorer le compte de démonstration' : 'J’ai déjà un compte'}
                </Button>
              </Link>
            </div>
          </section>
        </Reveal>

        {/* ------------------------------ Pied ------------------------------- */}
        <footer
          style={{
            marginTop: 'clamp(44px, 7vw, 84px)',
            paddingTop: 26,
            borderTop: '1px solid var(--ed-border)',
            display: 'flex',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
            color: 'var(--ed-text-mute)',
            fontSize: '0.85rem',
          }}
        >
          <span>🦉 EduMate — projet éducatif libre, sans publicité ni traceur.</span>
          <span>Musique libre de droit · Quiz générés par une bibliothèque pédagogique · Sans publicité ni traceur</span>
        </footer>
      </main>
    </div>
  );
}
