import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, ExternalLink, Mail, RefreshCw, ShieldAlert } from 'lucide-react';
import { Button } from '../components/ui/Button.js';
import { Field, TextInput } from '../components/ui/Field.js';
import { Notice } from '../components/ui/Feedback.js';
import { Toasts } from '../components/ui/Toasts.js';
import { AnimatedBadge, CountdownRing } from '../components/ui/AnimatedBadge.js';
import { AuthAside } from '../components/layout/AuthAside.js';
import { ApiError, endpoints } from '../lib/api.js';
import { motionAllowed } from '../lib/fx.js';
import { toast } from '../lib/store.js';
import { isValidEmailValue } from '../../shared/email.js';

/** Écran en cours : formulaire, envoi, ou confirmation. */
type Stage = 'form' | 'sending' | 'sent';

/** Transition commune aux changements d'écran (glissement + fondu). */
const STAGE_VARIANTS = {
  initial: { opacity: 0, x: 26, filter: 'blur(4px)' },
  animate: { opacity: 1, x: 0, filter: 'blur(0px)' },
  exit: { opacity: 0, x: -26, filter: 'blur(4px)' },
} as const;

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Page « Mot de passe oublié » — demande d'un lien de réinitialisation.
 *
 * Trois points de conception importants :
 *
 * 1. **Le message de confirmation est le même que l'adresse existe ou non.**
 *    L'API ne révèle volontairement rien (`/api/auth/forgot` renvoie une
 *    réponse identique dans les deux cas) : afficher « aucun compte trouvé »
 *    ici transformerait la page en annuaire des élèves inscrits.
 *
 * 2. **Le renvoi est temporisé côté client ET côté serveur.** Le compte à
 *    rebours n'est qu'un confort visuel ; la vraie limite est appliquée par
 *    l'API (HTTP 429 + `Retry-After`), que cette page sait lire et rejouer.
 *
 * 3. **Si aucun prestataire d'e-mails n'est configuré, on le dit clairement.**
 *    C'est une information sur le SERVEUR (identique pour tout le monde), pas
 *    sur le compte : aucune fuite, et l'élève sait qu'il doit prévenir un
 *    administrateur au lieu d'attendre un message qui n'arrivera jamais.
 */
export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const animated = motionAllowed();

  // Adresse pré-remplie quand l'élève arrive depuis la page de connexion.
  const initialEmail = useMemo(() => {
    const state = location.state as { email?: unknown } | null;
    return typeof state?.email === 'string' ? state.email : '';
  }, [location.state]);

  const [stage, setStage] = useState<Stage>('form');
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mailConfigured, setMailConfigured] = useState(true);
  const [expiresMinutes, setExpiresMinutes] = useState(30);
  const [devLink, setDevLink] = useState<string | null>(null);
  /** Secondes restantes avant de pouvoir redemander un lien. */
  const [cooldown, setCooldown] = useState(0);
  const cooldownTotal = useRef(60);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    document.title = 'Mot de passe oublié · EduMate';
  }, []);

  /* Compte à rebours : une seule intervalle, arrêtée proprement au démontage. */
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => {
      setCooldown((value) => (value <= 1 ? 0 : value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  /* Focus automatique sur le champ : l'élève n'a rien d'autre à faire ici. */
  useEffect(() => {
    if (stage !== 'form') return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), animated ? 380 : 0);
    return () => window.clearTimeout(timer);
  }, [stage, animated]);

  const startCooldown = useCallback((seconds: number) => {
    const value = Math.max(1, Math.ceil(seconds));
    cooldownTotal.current = value;
    setCooldown(value);
  }, []);

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const value = email.trim();
    if (!isValidEmailValue(value)) {
      setError('Renseigne une adresse e-mail valide, celle de ton compte EduMate.');
      return;
    }

    setStage('sending');
    try {
      const result = await endpoints.forgotPassword({ email: value });
      setMailConfigured(result.mailConfigured !== false);
      setExpiresMinutes(Number(result.expiresMinutes) > 0 ? Number(result.expiresMinutes) : 30);
      setDevLink(typeof result.devLink === 'string' && result.devLink ? result.devLink : null);
      setStage('sent');
      startCooldown(60);
      if (result.mailConfigured === false) {
        setNotice(
          "Ce serveur n'a pas encore de fournisseur d'e-mails : le lien a été écrit dans ses journaux. " +
            'Préviens un administrateur, il pourra te le transmettre.',
        );
      }
    } catch (err) {
      setStage('form');
      if (err instanceof ApiError) {
        // 429 : le serveur indique exactement combien de temps attendre.
        const retryAfter = Number((err.details as { retryAfterSec?: number } | undefined)?.retryAfterSec ?? 0);
        if (err.status === 429) {
          startCooldown(retryAfter > 0 ? retryAfter : 60);
          setError(err.message);
        } else {
          setError(err.message);
        }
      } else {
        setError("La demande n'a pas pu aboutir. Vérifie ta connexion puis réessaie.");
      }
    }
  };

  /** Renvoie un lien (bouton visible une fois le compte à rebours terminé). */
  const resend = async (): Promise<void> => {
    setStage('form');
    setError(null);
    // Un aller-retour immédiat serait refusé par le serveur : on laisse le
    // formulaire reprendre la main, l'élève relance lui-même l'envoi.
    window.setTimeout(() => inputRef.current?.focus(), 60);
  };

  const progress = cooldownTotal.current > 0 ? cooldown / cooldownTotal.current : 0;

  return (
    <div className="auth-shell">
      <Toasts />
      <AuthAside
        emoji="🔑"
        title="Un oubli, ça arrive à tout le monde."
        description="Indique l'adresse e-mail de ton compte : nous t'envoyons un lien sécurisé pour choisir un nouveau mot de passe."
        bullets={[
          'Lien valable 30 minutes, utilisable une seule fois',
          'Toutes tes autres sessions sont fermées par sécurité',
          'Personne ne peut voir ni récupérer ton ancien mot de passe',
        ]}
        footnote="EduMate ne te demandera jamais ton mot de passe par e-mail."
      />

      <section className="auth-panel">
        <motion.div
          className="auth-card"
          initial={animated ? { opacity: 0, y: 16 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.42, ease: EASE }}
        >
          <AnimatePresence mode="wait" initial={false}>
            {/* -------------------------------------------------- Formulaire */}
            {stage !== 'sent' ? (
              <motion.div
                key="form"
                variants={STAGE_VARIANTS}
                initial={animated ? 'initial' : false}
                animate="animate"
                exit={animated ? 'exit' : undefined}
                transition={{ duration: 0.34, ease: EASE }}
              >
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                  <span style={{ fontSize: 44, display: 'inline-block' }} className="anim-float" aria-hidden="true">
                    🔑
                  </span>
                  <h1 style={{ fontSize: '1.6rem', marginTop: 6 }}>Mot de passe oublié</h1>
                  <p className="ed-soft">
                    Saisis l’adresse e-mail de ton compte. Nous t’enverrons un lien pour en choisir un nouveau.
                  </p>
                </div>

                <AnimatePresence mode="wait">
                  {error ? (
                    <motion.div
                      key={error}
                      initial={animated ? { opacity: 0, y: -6 } : false}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      style={{ marginBottom: 14 }}
                    >
                      <Notice tone="danger">{error}</Notice>
                    </motion.div>
                  ) : null}
                </AnimatePresence>

                <form onSubmit={submit} className="ed-stack" noValidate>
                  <Field
                    label="Adresse e-mail du compte"
                    error={undefined}
                    hint="Celle utilisée lors de ton inscription."
                  >
                    {({ id, describedBy }) => (
                      <TextInput
                        ref={inputRef}
                        id={id}
                        aria-describedby={describedBy}
                        type="email"
                        autoComplete="email"
                        inputMode="email"
                        large
                        placeholder="prenom.nom@exemple.fr"
                        value={email}
                        icon={<Mail size={18} />}
                        disabled={stage === 'sending'}
                        onChange={(event) => setEmail(event.target.value)}
                      />
                    )}
                  </Field>

                  <Button
                    type="submit"
                    size="lg"
                    block
                    loading={stage === 'sending'}
                    iconRight={stage === 'sending' ? undefined : <ArrowRight size={18} />}
                  >
                    {stage === 'sending' ? 'Envoi du lien…' : 'Envoyer le lien de réinitialisation'}
                  </Button>
                </form>

                <p className="ed-small ed-mute" style={{ marginTop: 18, textAlign: 'center', lineHeight: 1.6 }}>
                  Tu te souviens de ton mot de passe ?{' '}
                  <Link to="/connexion" className="auth-inline-link">
                    Revenir à la connexion
                  </Link>
                </p>
              </motion.div>
            ) : (
              /* ------------------------------------------------ Confirmation */
              <motion.div
                key="sent"
                variants={STAGE_VARIANTS}
                initial={animated ? 'initial' : false}
                animate="animate"
                exit={animated ? 'exit' : undefined}
                transition={{ duration: 0.34, ease: EASE }}
                style={{ textAlign: 'center' }}
              >
                <div style={{ display: 'grid', justifyItems: 'center', gap: 6 }}>
                  <AnimatedBadge variant="mail" tone={mailConfigured ? 'success' : 'warning'} size={96} />
                  <h1 style={{ fontSize: '1.55rem', marginTop: 10 }}>
                    {mailConfigured ? 'Vérifie ta boîte mail' : 'Lien enregistré sur le serveur'}
                  </h1>
                  <p className="ed-soft" style={{ maxWidth: 400, margin: '0 auto' }}>
                    Si un compte EduMate est rattaché à{' '}
                    <strong style={{ color: 'var(--ed-text)' }}>{email.trim()}</strong>, un lien de
                    réinitialisation vient de lui être envoyé.
                  </p>
                </div>

                <AnimatePresence>
                  {notice ? (
                    <motion.div
                      initial={animated ? { opacity: 0, height: 0 } : false}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.3 }}
                      style={{ marginTop: 16, overflow: 'hidden' }}
                    >
                      <Notice tone="warning">
                        <span className="ed-row" style={{ gap: 8, alignItems: 'flex-start' }}>
                          <ShieldAlert size={16} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
                          <span>{notice}</span>
                        </span>
                      </Notice>
                    </motion.div>
                  ) : null}
                </AnimatePresence>

                <motion.ul
                  className="auth-tips"
                  initial={animated ? 'hidden' : false}
                  animate="show"
                  variants={{ hidden: {}, show: { transition: { staggerChildren: 0.09, delayChildren: 0.25 } } }}
                >
                  {[
                    `Le lien reste valable ${expiresMinutes} minutes et ne fonctionne qu'une seule fois.`,
                    'Regarde dans tes indésirables si le message n’arrive pas.',
                    'Après validation, toutes tes autres sessions seront fermées.',
                  ].map((tip) => (
                    <motion.li
                      key={tip}
                      variants={animated ? { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } } : undefined}
                      transition={{ duration: 0.32, ease: EASE }}
                    >
                      {tip}
                    </motion.li>
                  ))}
                </motion.ul>

                {/*
                  Lien de secours affiché UNIQUEMENT hors production : le serveur
                  ne le renvoie jamais quand NODE_ENV=production, donc ce bloc
                  reste invisible sur une vraie instance.
                */}
                {devLink ? (
                  <motion.div
                    initial={animated ? { opacity: 0, y: 8 } : false}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4, duration: 0.3 }}
                    style={{ marginTop: 16 }}
                  >
                    <Notice tone="info">
                      <strong>Mode développement</strong> — aucun e-mail n’est parti, le lien est affiché ici :
                      <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
                        <code className="auth-devlink">{devLink}</code>
                        <Link to={devLink.replace(/^https?:\/\/[^/]+/, '') || '/connexion'}>
                          <Button size="sm" variant="soft" block icon={<ExternalLink size={15} />}>
                            Ouvrir la page de réinitialisation
                          </Button>
                        </Link>
                      </div>
                    </Notice>
                  </motion.div>
                ) : null}

                <div className="ed-stack" style={{ gap: 10, marginTop: 20 }}>
                  <Button variant="soft" block disabled={cooldown > 0} onClick={resend} icon={<RefreshCw size={16} />}>
                    {cooldown > 0 ? (
                      <span className="ed-row" style={{ gap: 9, justifyContent: 'center' }}>
                        <CountdownRing progress={progress} seconds={cooldown} />
                        Renvoyer le lien
                      </span>
                    ) : (
                      'Renvoyer un lien'
                    )}
                  </Button>
                  <Link to="/connexion">
                    <Button variant="ghost" block icon={<ArrowLeft size={16} />}>
                      Retour à la connexion
                    </Button>
                  </Link>
                </div>

                <p className="ed-small ed-mute" style={{ marginTop: 18, textAlign: 'center' }}>
                  Une adresse n’est plus accessible ?{' '}
                  <button
                    type="button"
                    className="auth-inline-link"
                    onClick={() =>
                      toast.info('Préviens un administrateur : il peut réinitialiser ton compte depuis le serveur.')
                    }
                  >
                    Que faire ?
                  </button>
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <div style={{ position: 'absolute', top: 18, right: 18 }}>
          <Button variant="ghost" size="sm" icon={<ArrowLeft size={15} />} onClick={() => navigate('/connexion')}>
            Connexion
          </Button>
        </div>
      </section>
    </div>
  );
}
