import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Suspense, lazy, useEffect } from 'react';
import { AppShell } from './components/layout/AppShell.js';
import { GuestOnly, RequireAdmin, RequireAuth } from './routes/guards.js';
import { Empty, Loader } from './components/ui/Feedback.js';
import { WakeScreen } from './components/ui/WakeScreen.js';
import { RouteErrorBoundary } from './components/ui/ErrorBoundary.js';
import { Button } from './components/ui/Button.js';
import { Toasts } from './components/ui/Toasts.js';
import { PwaBanner } from './components/PwaBanner.js';
import { LiquidGlassBackground } from './components/background/LiquidGlassBackground.js';
import { getFxTier, startPointerFx } from './lib/fx.js';
import { useAuth } from './lib/store.js';

/* Pages publiques (chargées immédiatement : premier écran rapide) */
import LandingPage from './pages/LandingPage.js';
import AuthPage from './pages/AuthPage.js';
import OnboardingPage from './pages/OnboardingPage.js';

/* Pages de l'application : chargées à la demande pour alléger le démarrage */
const DashboardPage = lazy(() => import('./pages/DashboardPage.js'));
const TutorPage = lazy(() => import('./pages/TutorPage.js'));
const QuizHubPage = lazy(() => import('./pages/QuizHubPage.js'));
const QuizDetailPage = lazy(() => import('./pages/QuizDetailPage.js'));
const QuizPlayPage = lazy(() => import('./pages/QuizPlayPage.js'));
const QuizResultPage = lazy(() => import('./pages/QuizResultPage.js'));
const QuizReviewPage = lazy(() => import('./pages/QuizReviewPage.js'));
const LessonHubPage = lazy(() => import('./pages/LessonHubPage.js'));
const FicheHubPage = lazy(() => import('./pages/FicheHubPage.js'));
const FicheDetailPage = lazy(() => import('./pages/FicheDetailPage.js'));
const PlanningPage = lazy(() => import('./pages/PlanningPage.js'));
const PlanningDetailPage = lazy(() => import('./pages/PlanningDetailPage.js'));
const LessonPage = lazy(() => import('./pages/LessonPage.js'));
const ProgressPage = lazy(() => import('./pages/ProgressPage.js'));
const ToolsPage = lazy(() => import('./pages/ToolsPage.js'));
const ClockToolPage = lazy(() => import('./pages/tools/ClockToolPage.js'));
const TimerToolPage = lazy(() => import('./pages/tools/TimerToolPage.js'));
const StopwatchToolPage = lazy(() => import('./pages/tools/StopwatchToolPage.js'));
const WhiteboardToolPage = lazy(() => import('./pages/tools/WhiteboardToolPage.js'));
const CalendarToolPage = lazy(() => import('./pages/tools/CalendarToolPage.js'));
const TranslatorToolPage = lazy(() => import('./pages/tools/TranslatorToolPage.js'));
const MusicToolPage = lazy(() => import('./pages/tools/MusicToolPage.js'));
const HomeworkPage = lazy(() => import('./pages/HomeworkPage.js'));
const FeedPage = lazy(() => import('./pages/FeedPage.js'));
const ProfilePage = lazy(() => import('./pages/ProfilePage.js'));
const SettingsPage = lazy(() => import('./pages/SettingsPage.js'));
const AdminPage = lazy(() => import('./pages/AdminPage.js'));

/** Page inconnue : message clair et retour rapide à l'accueil. */
function NotFoundPage() {
  const location = useLocation();
  return (
    <Empty
      emoji="🧭"
      title="Cette page n’existe pas"
      description={
        <>
          L’adresse <code>{location.pathname}</code> ne correspond à aucune page d’EduMate.
        </>
      }
      action={
        <Link to="/">
          <Button variant="primary">Retour à l’accueil</Button>
        </Link>
      }
    />
  );
}

/** Aiguillage initial selon l'état de la session. */
function HomeRedirect() {
  const status = useAuth((state) => state.status);
  const user = useAuth((state) => state.user);
  if (status === 'loading') return <WakeScreen />;
  if (status === 'anonymous') return <LandingPage />;
  if (user && !user.onboarded) return <Navigate to="/bienvenue" replace />;
  return <Navigate to="/tableau-de-bord" replace />;
}

/*
 * La session est chargée UNE fois au démarrage (voir main.tsx), avant le montage.
 * App ne fait donc que rendre les routes : cela supprime tout aller-retour
 * inutile et rend le premier rendu déterministe (pas de flash de redirection).
 */
export default function App() {
  /*
   * Effets « Liquid Glass » globaux :
   *  - palier de qualité de l'appareil (posé sur <html data-fx> : le CSS
   *    allège les verres sur les petites machines) ;
   *  - lumière curseur + micro-inclinaison : UN seul écouteur délégué pour
   *    toute l'application (aucun rerender React), nettoyé au démontage.
   */
  useEffect(() => {
    getFxTier();
    const stopPointerFx = startPointerFx();
    return stopPointerFx;
  }, []);

  return (
    <BrowserRouter>
      {/*
        Fond « Liquid Glass » : canvas WebGL (chargé paresseusement) posé
        DERRIÈRE toute l'application (z-index: -1 dans #root), jamais
        interactif (pointer-events: none), avec repli dégradé CSS automatique
        et respect de prefers-reduced-motion / du réglage « Animations ».
        Monté hors de la barrière d'erreur : un échec du fond 3D ne doit
        jamais emporter l'interface.
      */}
      <LiquidGlassBackground />
      {/*
        Barrière d'erreur : sans elle, la moindre exception pendant le rendu
        démontait tout l'arbre et laissait un écran entièrement blanc.
        `Toasts` et `PwaBanner` restent volontairement HORS de la barrière :
        les notifications doivent continuer à fonctionner même sur une page en
        échec.
      */}
      <RouteErrorBoundary>
      <Suspense fallback={<Loader label="Chargement de la page…" large />}>
        <Routes>
          {/* ------------------------------------------------ Public ---- */}
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/accueil" element={<LandingPage />} />
          <Route
            path="/connexion"
            element={
              <GuestOnly>
                <AuthPage mode="login" />
              </GuestOnly>
            }
          />
          {/*
            /inscription ET /bienvenue montent le même parcours guidé :
            anonyme → création de compte en 8-9 étapes ;
            déjà connecté → mise à jour du profil (l'appel API s'adapte).
          */}
          <Route path="/inscription" element={<OnboardingPage />} />
          <Route path="/bienvenue" element={<OnboardingPage />} />

          {/* ------------------------------------------- Application ---- */}
          <Route
            element={
              <RequireAuth>
                <AppShell />
              </RequireAuth>
            }
          >
            <Route path="/tableau-de-bord" element={<DashboardPage />} />
            <Route path="/assistant" element={<TutorPage />} />
            <Route path="/quiz" element={<QuizHubPage />} />
            <Route path="/quiz/resultat" element={<QuizResultPage />} />
            <Route path="/quiz/:topicId" element={<QuizDetailPage />} />
            <Route path="/quiz/:topicId/jouer" element={<QuizPlayPage />} />
            {/* Révision interactive : corrigé pas à pas du dernier quiz du sujet. */}
            <Route path="/quiz/:topicId/revision" element={<QuizReviewPage />} />
            {/* Leçons interactives : hub + lecteur d'étapes par sujet. */}
            <Route path="/lecons" element={<LessonHubPage />} />
            <Route path="/lecons/:topicId" element={<LessonPage />} />
            {/* Fiches de révision : hub + détail (géré aussi en verrouillé). */}
            <Route path="/fiches" element={<FicheHubPage />} />
            <Route path="/fiches/:topicId" element={<FicheDetailPage />} />
            {/* Planning de révision automatique : hub + détail d'un contrôle. */}
            <Route path="/planning" element={<PlanningPage />} />
            <Route path="/planning/:examId" element={<PlanningDetailPage />} />
            <Route path="/progression" element={<ProgressPage />} />
            <Route path="/devoirs" element={<HomeworkPage />} />
            {/* Fil d'actualités et sondages publiés par les administrateurs. */}
            <Route path="/fil" element={<FeedPage />} />
            <Route path="/outils" element={<ToolsPage />} />
            <Route path="/outils/horloge" element={<ClockToolPage />} />
            <Route path="/outils/minuteur" element={<TimerToolPage />} />
            <Route path="/outils/chronometre" element={<StopwatchToolPage />} />
            <Route path="/outils/tableau" element={<WhiteboardToolPage />} />
            <Route path="/outils/calendrier" element={<CalendarToolPage />} />
            <Route path="/outils/traducteur" element={<TranslatorToolPage />} />
            <Route path="/outils/musique" element={<MusicToolPage />} />
            <Route path="/profil" element={<ProfilePage />} />
            <Route path="/parametres" element={<SettingsPage />} />
            <Route
              path="/admin"
              element={
                <RequireAdmin>
                  <AdminPage />
                </RequireAdmin>
              }
            />
            <Route path="*" element={<NotFoundPage />} />
          </Route>

          {/* Route inconnue sans session : on repasse par l'aiguillage. */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      </RouteErrorBoundary>
      <Toasts />
      {/* Monté hors des routes : visible y compris sur les pages publiques. */}
      <PwaBanner />
    </BrowserRouter>
  );
}
