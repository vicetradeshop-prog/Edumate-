import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Check, Eye, EyeOff, Lock, Mail, ShieldCheck, Timer } from 'lucide-react';
import { Button } from '../components/ui/Button.js';
import { Field, TextInput } from '../components/ui/Field.js';
import { Notice } from '../components/ui/Feedback.js';
import { Toasts } from '../components/ui/Toasts.js';
import { Confetti } from '../components/ui/Confetti.js';
import { PasswordStrength } from '../components/ui/PasswordStrength.js';
import { AnimatedBadge } from '../components/ui/AnimatedBadge.js';
import { AuthAside } from '../components/layout/AuthAside.js';
import { ApiError, endpoints } from '../lib/api.js';
import { motionAllowed } from '../lib/fx.js';
import { passwordStrength } from '../../shared/password.js';
import { useAuth, useUi } from '../lib/store.js';

/** Étapes de l'écran de réinitialisation. */
type Stage = 'checking' | 'form' | 'saving' | 'done' | 'invalid';

const EASE = [0.22, 1, 0.36, 1] as const;

const STAGE_VARIANTS = {
  initial: { opacity: 0, y: 22, filter: 'blur(5px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
  exit: { opacity: 0, y: -18, filter: 'blur(5px)' },
} as const;

/** Formate un nombre de secondes en `m min s`. */
function humanDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  if (minutes <= 0) return `${seconds} s`;
  return seconds > 0 ? `${minutes} min ${String(seconds).padStart(2, '0')} s` : `${minutes} min`;
}

/**
 * Page « Nouveau mot de passe » — cible du lien envoyé par e-mail.
 *
 * Déroulé :
 *   1. le jeton de l'URL est VÉRIFIÉ dès l'ouverture (`/api/auth/reset/verify`,
 *      qui ne le consomme pas) : un lien expiré est annoncé tout de suite,
 *      avant que l'élève n'ait saisi deux fois un mot de passe pour rien ;
 *   2. la saisie est guidée par une jauge de robustesse animée, avec les
 *      MÊMES règles que le serveur (module partagé `shared/password.ts`) ;
 *   3. à la validation, le serveur remplace le mot de passe, révoque toutes
 *      les autres sessions et ouvre une session ici : l'élève arrive directement
 *      sur son tableau de bord, sans se reconnecter ;
 *   4. confettis + coche animée, puis redirection après un court délai.
 */
export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const applySession = useAuth((state) => state.applySession);
  const notify = useUi((state) => state.notify);
  const animated = motionAllowed();

  const token = useMemo(() => (searchParams.get('token') ?? '').trim(), [searchParams]);

  const [stage, setStage] = useState<Stage>(token ? 'checking' : 'invalid');
  const [reason, setReason] = useState<'expired' | 'invalid' | 'missing' | 'network'>('invalid');
  const [emailHint, setEmailHint] = useState('');
  const [remaining, setRemaining] = useState(0);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [firstName, setFirstName] = useState('');
  const passwordRef = useRef<HTMLInputElement | null>(null);

  const strength = useMemo(() => passwordStrength(password), [password]);
  const matching = confirm.length > 0 && confirm === password;
  const canSubmit = stage === 'form' && strength.acceptable && matching;

  useEffect(() => {
    document.title = 'Nouveau mot de passe · EduMate';
  }, []);

  /* ---------------------------------------------------- Vérification du jeton */
  useEffect(() => {
    if (!token) {
      setReason('missing');
      setStage('invalid');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const result = await endpoints.verifyResetToken({ token });
        if (cancelled) return;
        if (result.valid) {
          setEmailHint(result.emailHint);
          setRemaining(Math.max(0, Number(result.remainingSeconds) || 0));
          setStage('form');
        } else {
          setReason(result.reason === 'expired' ? 'expired' : 'invalid');
          setStage('invalid');
        }
      } catch (err) {
        if (cancelled) return;
        setReason(err instanceof ApiError && err.status === 0 ? 'network' : 'invalid');
        setStage('invalid');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  /* Compte à rebours de validité du lien (affichage uniquement). */
  useEffect(() => {
    if (stage !== 'form' || remaining <= 0) return;
    const timer = window.setInterval(() => {
      setRemaining((value) => {
        if (value <= 1) {
          window.clearInterval(timer);
          setStage('invalid');
          setReason('expired');
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [stage, remaining]);

  /* Focus sur le premier champ dès que le jeton est accepté. */
  useEffect(() => {
    if (stage !== 'form') return;
    const timer = window.setTimeout(() => passwordRef.current?.focus(), animated ? 420 : 0);
    return () => window.clearTimeout(timer);
  }, [stage, animated]);

  const submit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setError(null);
      if (!strength.acceptable) {
        setError(`Mot de passe trop faible : ${strength.issues.join(', ')}.`);
        return;
      }
      if (password !== confirm) {
        setError('Les deux mots de passe ne correspondent pas.');
        return;
      }
      setStage('saving');
      try {
        const result = await endpoints.resetPassword({ token, password });
        setFirstName(result.user?.firstName ?? '');
        // Le serveur vient d'ouvrir une session : on l'adopte immédiatement,
        // sinon l'élève serait considéré comme anonyme jusqu'au rechargement.
        applySession(result.user, result.csrfToken);
        setStage('done');
        notify('Mot de passe modifié. Tes autres sessions ont été fermées.', 'success');
        window.setTimeout(() => navigate(result.user?.onboarded ? '/tableau-de-bord' : '/bienvenue', { replace: true }), animated ? 2600 : 900);
      } catch (err) {
        setStage('form');
        if (err instanceof ApiError) {
          const details = err.details as { reason?: string } | undefined;
          if (details?.reason === 'expired' || details?.reason === 'invalid') {
            setReason(details.reason);
            setStage('invalid');
            return;
          }
          setError(err.message);
        } else {
          setError('La réinitialisation a échoué. Vérifie ta connexion puis réessaie.');
        }
      }
    },
    [animated, applySession, confirm, navigate, notify, password, strength, token],
  );

  /* ------------------------------------------------------------- Invalid state */
  const invalidCopy = {
    missing: {
      title: 'Aucun lien de réinitialisation',
      body: "Cette page s'ouvre depuis le lien reçu par e-mail. Ouvre-le depuis ton message, ou demande un nouveau lien.",
    },
    expired: {
      title: 'Ce lien a expiré',
      body: 'Par sécurité, un lien de réinitialisation ne reste valable que 30 minutes. Rien de grave : en demander un nouveau prend quelques secondes.',
    },
    network: {
      title: 'Vérification impossible',
      body: "Le serveur ne répond pas encore (il se réveille peut-être). Recharge la page dans quelques secondes, ton lien reste valable.",
    },
    invalid: {
      title: 'Ce lien n’est pas valide',
      body: "Il a peut-être déjà été utilisé, ou l'adresse a été recopiée incomplètement. Demande un nouveau lien pour repartir sur une base propre.",
    },
  }[reason];

  return (
    <div className="auth-shell">
      <Toasts />
      {stage === 'done' ? <Confetti show={animated} /> : null}

      <AuthAside
        emoji={stage === 'done' ? '🎉' : '🔐'}
        title={stage === 'done' ? 'C’est reparti !' : 'Choisis un nouveau mot de passe.'}
        description={
          stage === 'done'
            ? 'Ton mot de passe est modifié et toutes tes autres sessions ont été fermées.'
            : 'Un mot de passe solide, c’est 8 caractères minimum avec une lettre et un chiffre. Il est haché, jamais stocké en clair.'
        }
        bullets={
          stage === 'done'
            ? ['Nouveau mot de passe enregistré', 'Autres appareils déconnectés', 'E-mail de confirmation envoyé']
            : ['Haché avec scrypt, jamais lisible', 'Utilisé une seule fois', 'Aucune donnée transmise à des tiers']
        }
      />

      <section className="auth-panel">
        <motion.div
          className="auth-card"
          initial={animated ? { opacity: 0, y: 16 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.42, ease: EASE }}
        >
          <AnimatePresence mode="wait" initial={false}>
            {/* ------------------------------------------------ Vérification */}
            {stage === 'checking' ? (
              <motion.div
                key="checking"
                className="auth-center"
                variants={STAGE_VARIANTS}
                initial={animated ? 'initial' : false}
                animate="animate"
                exit={animated ? 'exit' : undefined}
                transition={{ duration: 0.3, ease: EASE }}
              >
                <motion.span
                  className="auth-spinner"
                  animate={animated ? { rotate: 360 } : undefined}
                  transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }}
                  aria-hidden="true"
                />
                <h1 style={{ fontSize: '1.35rem' }}>Vérification du lien…</h1>
                <p className="ed-soft">Un instant, on s’assure que ton lien est encore valable.</p>
              </motion.div>
            ) : null}

            {/* ----------------------------------------------------- Formulaire */}
            {stage === 'form' || stage === 'saving' ? (
              <motion.div
                key="form"
                variants={STAGE_VARIANTS}
                initial={animated ? 'initial' : false}
                animate="animate"
                exit={animated ? 'exit' : undefined}
                transition={{ duration: 0.34, ease: EASE }}
              >
                <div className="auth-center" style={{ marginBottom: 18 }}>
                  <AnimatedBadge variant="lock" tone="info" size={72} />
                  <h1 style={{ fontSize: '1.55rem', marginTop: 12 }}>Nouveau mot de passe</h1>
                  <p className="ed-soft">
                    {emailHint ? (
                      <>
                        Compte <strong style={{ color: 'var(--ed-text)' }}>{emailHint}</strong>
                      </>
                    ) : (
                      'Choisis un mot de passe que tu n’utilises nulle part ailleurs.'
                    )}
                  </p>
                  {remaining > 0 ? (
                    <motion.span
                      className={`auth-countdown${remaining < 300 ? ' auth-countdown--soon' : ''}`}
                      initial={animated ? { opacity: 0, scale: 0.9 } : false}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.3, type: 'spring', stiffness: 320, damping: 22 }}
                    >
                      <Timer size={14} aria-hidden="true" />
                      Expire dans {humanDuration(remaining)}
                    </motion.span>
                  ) : null}
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
                  <Field label="Nouveau mot de passe">
                    {({ id, describedBy }) => (
                      /*
                       * Enveloppe relative : le bouton « afficher / masquer » est
                       * posé DANS le champ, à droite. Sans elle, `.field` (flex en
                       * colonne) l'empilerait sous la saisie.
                       */
                      <span className="auth-affix">
                        <TextInput
                          ref={passwordRef}
                          id={id}
                          aria-describedby={describedBy}
                          type={visible ? 'text' : 'password'}
                          autoComplete="new-password"
                          large
                          placeholder="••••••••"
                          value={password}
                          disabled={stage === 'saving'}
                          icon={<Lock size={18} />}
                          onChange={(event) => setPassword(event.target.value)}
                        />
                        <button
                          type="button"
                          className="auth-eye"
                          onClick={() => setVisible((value) => !value)}
                          aria-pressed={visible}
                          aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                          title={visible ? 'Masquer' : 'Afficher'}
                        >
                          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </span>
                    )}
                  </Field>

                  <PasswordStrength value={password} id="pwd-strength" />

                  <Field
                    label="Confirme le mot de passe"
                    hint={confirm.length === 0 ? undefined : matching ? undefined : 'Les deux saisies doivent être identiques.'}
                  >
                    {({ id, describedBy }) => (
                      <span className="auth-affix">
                        <TextInput
                          id={id}
                          aria-describedby={describedBy}
                          type={visible ? 'text' : 'password'}
                          autoComplete="new-password"
                          large
                          placeholder="••••••••"
                          value={confirm}
                          invalid={confirm.length > 0 && !matching}
                          disabled={stage === 'saving'}
                          icon={<Lock size={18} />}
                          onChange={(event) => setConfirm(event.target.value)}
                        />
                        {/* Coche verte animée : les deux saisies correspondent. */}
                        <AnimatePresence>
                          {matching ? (
                            <motion.span
                              className="auth-match"
                              initial={animated ? { opacity: 0, scale: 0.6 } : false}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.6 }}
                              transition={{ type: 'spring', stiffness: 460, damping: 20 }}
                              aria-hidden="true"
                            >
                              <Check size={15} />
                            </motion.span>
                          ) : null}
                        </AnimatePresence>
                      </span>
                    )}
                  </Field>

                  <Button
                    type="submit"
                    size="lg"
                    block
                    disabled={!canSubmit}
                    loading={stage === 'saving'}
                    iconRight={stage === 'saving' ? undefined : <ArrowRight size={18} />}
                  >
                    {stage === 'saving' ? 'Enregistrement…' : 'Enregistrer mon nouveau mot de passe'}
                  </Button>
                </form>

                <p className="ed-small ed-mute" style={{ marginTop: 16, textAlign: 'center' }}>
                  <ShieldCheck size={13} aria-hidden="true" style={{ verticalAlign: '-2px' }} /> En validant, toutes tes
                  autres sessions seront fermées.
                </p>
              </motion.div>
            ) : null}

            {/* -------------------------------------------------------- Succès */}
            {stage === 'done' ? (
              <motion.div
                key="done"
                className="auth-center"
                variants={STAGE_VARIANTS}
                initial={animated ? 'initial' : false}
                animate="animate"
                exit={animated ? 'exit' : undefined}
                transition={{ duration: 0.4, ease: EASE }}
              >
                <AnimatedBadge variant="check" tone="success" size={104} />
                <motion.h1
                  style={{ fontSize: '1.6rem', marginTop: 14 }}
                  initial={animated ? { opacity: 0, y: 10 } : false}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.55, duration: 0.4, ease: EASE }}
                >
                  Mot de passe modifié{firstName ? `, ${firstName}` : ''} !
                </motion.h1>
                <motion.p
                  className="ed-soft"
                  initial={animated ? { opacity: 0 } : false}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.75, duration: 0.4 }}
                >
                  Tu vas arriver sur ton tableau de bord…
                </motion.p>

                <motion.div
                  className="auth-done-bar"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: animated ? 2.4 : 0.4, ease: 'linear' }}
                  aria-hidden="true"
                />

                <Link to="/tableau-de-bord" style={{ marginTop: 18, width: '100%' }}>
                  <Button block variant="soft" icon={<ArrowRight size={16} />}>
                    Continuer tout de suite
                  </Button>
                </Link>
              </motion.div>
            ) : null}

            {/* ------------------------------------------------------- Invalide */}
            {stage === 'invalid' ? (
              <motion.div
                key="invalid"
                className="auth-center"
                variants={STAGE_VARIANTS}
                initial={animated ? 'initial' : false}
                animate="animate"
                exit={animated ? 'exit' : undefined}
                transition={{ duration: 0.34, ease: EASE }}
              >
                <AnimatedBadge variant="alert" tone={reason === 'network' ? 'warning' : 'danger'} size={92} />
                <h1 style={{ fontSize: '1.5rem', marginTop: 12 }}>{invalidCopy.title}</h1>
                <p className="ed-soft" style={{ maxWidth: 400, margin: '0 auto' }}>
                  {invalidCopy.body}
                </p>

                <div className="ed-stack" style={{ gap: 10, marginTop: 22, width: '100%' }}>
                  <Link to="/mot-de-passe-oublie">
                    <Button block size="lg" iconRight={<ArrowRight size={18} />} icon={<Mail size={17} />}>
                      Demander un nouveau lien
                    </Button>
                  </Link>
                  <Link to="/connexion">
                    <Button block variant="ghost">
                      Retour à la connexion
                    </Button>
                  </Link>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </motion.div>
      </section>
    </div>
  );
}
