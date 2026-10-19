import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, KeyRound, LogIn, Mail, Lock, Sparkles } from 'lucide-react';
import { Button } from '../components/ui/Button.js';
import { Field, TextInput } from '../components/ui/Field.js';
import { Notice } from '../components/ui/Feedback.js';
import { Toasts } from '../components/ui/Toasts.js';
import { AuthAside } from '../components/layout/AuthAside.js';
import { ApiError } from '../lib/api.js';
import { toast, useAuth, useUi } from '../lib/store.js';

interface AuthPageProps {
  mode?: 'login' | 'signup';
}

/**
 * Page de connexion.
 * La création de compte passe par le parcours guidé « /inscription »
 * (8 étapes animées) : ici, on propose donc surtout la connexion rapide.
 *
 * Le mot de passe oublié mène à « /mot-de-passe-oublie » (demande de lien par
 * e-mail) puis « /reinitialiser?token=… » (nouveau mot de passe).
 */
export default function AuthPage({ mode = 'login' }: AuthPageProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, loginDemo, status, demoAvailable } = useAuth();
  const notify = useUi((state) => state.notify);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = mode === 'signup' ? 'Créer un compte · EduMate' : 'Connexion · EduMate';
  }, [mode]);

  /*
   * ⚠️ Ne JAMAIS rediriger ici vers la route qui monte ce composant :
   * /inscription affiche directement le parcours guidé (OnboardingPage).
   * Une redirection vers sa propre route crée une boucle infinie que
   * React Router interrompt en rendant une page blanche, sans erreur.
   */
  if (status === 'authenticated') {
    return <Navigate to={(location.state as { from?: string } | null)?.from ?? '/tableau-de-bord'} replace />;
  }

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError('Renseigne ton adresse e-mail et ton mot de passe.');
      return;
    }
    setBusy(true);
    try {
      const user = await login(email.trim(), password);
      notify(`Content de te revoir, ${user.firstName} !`, 'success');
      navigate(user.onboarded ? '/tableau-de-bord' : '/bienvenue', { replace: true });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Connexion impossible pour le moment. Réessaie.';
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  const useDemo = async (): Promise<void> => {
    setBusy(true);
    try {
      await loginDemo();
      toast.info('Tu explores un compte de démonstration partagé.');
      navigate('/tableau-de-bord', { replace: true });
    } catch (err) {
      toast.fromError(err, 'Le compte de démonstration est momentanément indisponible.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-shell">
      <Toasts />
      <AuthAside
        emoji="🦉"
        title="Reprends tes révisions exactement là où tu les as laissées."
        description="Ta progression, tes favoris, ton calendrier et tes conversations avec l’assistant t’attendent."
        bullets={[
          'Progression sauvegardée à chaque quiz',
          'Assistant de devoirs disponible 24 h/24',
          'Aucune publicité, aucune donnée revendue',
        ]}
      />

      <section className="auth-panel">
        <motion.div
          className="auth-card"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
        >
          <div style={{ textAlign: 'center', marginBottom: 22 }}>
            <span style={{ fontSize: 44, display: 'inline-block' }} className="anim-float" aria-hidden="true">
              🦉
            </span>
            <h1 style={{ fontSize: '1.7rem', marginTop: 6 }}>Bon retour !</h1>
            <p className="ed-soft">Connecte-toi pour retrouver ton espace EduMate.</p>
          </div>

          <AnimatePresence mode="wait">
            {error ? (
              <motion.div
                key={error}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                style={{ marginBottom: 14 }}
              >
                <Notice tone="danger">{error}</Notice>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <form onSubmit={submit} className="ed-stack" noValidate>
            <Field label="Adresse e-mail">
              {({ id, describedBy, invalid }) => (
                <TextInput
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="prenom.nom@exemple.fr"
                  value={email}
                  icon={<Mail size={17} />}
                  onChange={(event) => setEmail(event.target.value)}
                />
              )}
            </Field>

            <Field label="Mot de passe" hint="8 caractères minimum, avec au moins une lettre et un chiffre.">
              {({ id, describedBy }) => (
                <TextInput
                  id={id}
                  aria-describedby={describedBy}
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  icon={<Lock size={17} />}
                  onChange={(event) => setPassword(event.target.value)}
                />
              )}
            </Field>

            {/*
              Placé APRÈS le champ et hors du <label> : un lien imbriqué dans une
              étiquette capterait le clic au profit du champ et serait annoncé
              deux fois par les lecteurs d'écran.
            */}
            <motion.div
              className="auth-forgot-row"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.25, duration: 0.4 }}
            >
              <Link to="/mot-de-passe-oublie" state={{ email }} className="auth-forgot-link">
                <KeyRound size={14} aria-hidden="true" />
                Mot de passe oublié ?
              </Link>
            </motion.div>

            <Button type="submit" size="lg" block loading={busy} iconRight={<ArrowRight size={18} />}>
              Se connecter
            </Button>
          </form>

          <hr className="divider" />

          <div className="ed-stack" style={{ gap: 10 }}>
            <Link to="/inscription">
              <Button variant="soft" block icon={<Sparkles size={17} />}>
                Créer mon espace (parcours guidé)
              </Button>
            </Link>
            {demoAvailable ? (
              <Button variant="ghost" block onClick={useDemo} disabled={busy}>
                Explorer avec le compte de démonstration
              </Button>
            ) : null}
          </div>

          <p className="ed-small ed-mute" style={{ marginTop: 20, textAlign: 'center' }}>
            <Link to="/accueil" style={{ fontWeight: 700, color: 'var(--ed-primary)' }}>
              ← Retour à la présentation d’EduMate
            </Link>
          </p>
        </motion.div>

        <div style={{ position: 'absolute', top: 18, right: 18 }}>
          <Link to="/">
            <Button variant="ghost" size="sm" icon={<LogIn size={15} />}>
              Accueil
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
