/**
 * EduMate — Point d'entrée du test de rendu.
 *
 * Expose sur `window` tout ce dont le script de test a besoin : React (pour un
 * rendu synchrone via act), les magasins Zustand (pour simuler une session) et
 * un composant `Probe` qui monte une page donnée dans un MemoryRouter.
 */
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import App from '../src/client/App.js';
import { useAuth, useCatalog, useUi, useQuiz } from '../src/client/lib/store.js';
import { endpoints } from '../src/client/lib/api.js';
import { renderRichText } from '../src/client/lib/richtext.js';

import DashboardPage from '../src/client/pages/DashboardPage.js';
import QuizHubPage from '../src/client/pages/QuizHubPage.js';
import QuizDetailPage from '../src/client/pages/QuizDetailPage.js';
import QuizResultPage from '../src/client/pages/QuizResultPage.js';
import TutorPage from '../src/client/pages/TutorPage.js';
import ProgressPage from '../src/client/pages/ProgressPage.js';
import ToolsPage from '../src/client/pages/ToolsPage.js';
import HomeworkPage from '../src/client/pages/HomeworkPage.js';
import ProfilePage from '../src/client/pages/ProfilePage.js';
import SettingsPage from '../src/client/pages/SettingsPage.js';
import LandingPage from '../src/client/pages/LandingPage.js';
import AuthPage from '../src/client/pages/AuthPage.js';
import OnboardingPage from '../src/client/pages/OnboardingPage.js';
import ClockToolPage from '../src/client/pages/tools/ClockToolPage.js';
import TimerToolPage from '../src/client/pages/tools/TimerToolPage.js';
import StopwatchToolPage from '../src/client/pages/tools/StopwatchToolPage.js';
import WhiteboardToolPage from '../src/client/pages/tools/WhiteboardToolPage.js';
import CalendarToolPage from '../src/client/pages/tools/CalendarToolPage.js';
import TranslatorToolPage from '../src/client/pages/tools/TranslatorToolPage.js';
import MusicToolPage from '../src/client/pages/tools/MusicToolPage.js';
import LessonHubPage from '../src/client/pages/LessonHubPage.js';
import FicheHubPage from '../src/client/pages/FicheHubPage.js';
import FicheDetailPage from '../src/client/pages/FicheDetailPage.js';
import PlanningPage from '../src/client/pages/PlanningPage.js';
import PlanningDetailPage from '../src/client/pages/PlanningDetailPage.js';
import LessonPage from '../src/client/pages/LessonPage.js';
import QuizReviewPage from '../src/client/pages/QuizReviewPage.js';
import { WakeScreen } from '../src/client/components/ui/WakeScreen.js';

export const PAGES = {
  landing: LandingPage,
  auth: AuthPage,
  onboarding: OnboardingPage,
  dashboard: DashboardPage,
  quizHub: QuizHubPage,
  quizDetail: QuizDetailPage,
  quizResult: QuizResultPage,
  tutor: TutorPage,
  progress: ProgressPage,
  tools: ToolsPage,
  homework: HomeworkPage,
  profile: ProfilePage,
  settings: SettingsPage,
  clock: ClockToolPage,
  timer: TimerToolPage,
  stopwatch: StopwatchToolPage,
  whiteboard: WhiteboardToolPage,
  calendar: CalendarToolPage,
  translator: TranslatorToolPage,
  music: MusicToolPage,
  lessonHub: LessonHubPage,
  fiches: FicheHubPage,
  fiche: FicheDetailPage,
  planning: PlanningPage,
  planningDetail: PlanningDetailPage,
  lesson: LessonPage,
  quizReview: QuizReviewPage,
  wake: WakeScreen,
} as const;

export type PageKey = keyof typeof PAGES;

/ Chemins associés aux pages qui lisent des paramètres d'URL. */
const ROUTES: Partial<Record<PageKey, string>> = {
  quizDetail: '/quiz/:topicId',
  lesson: '/lecons/:topicId',
  quizReview: '/quiz/:topicId/revision',
  fiche: '/fiches/:topicId',
  planningDetail: '/planning/:examId',
};

/** Monte une page précise dans un routeur mémoire (avec ses paramètres d'URL). */
export function Probe({ page, route = '/' }: { page: PageKey; route?: string }) {
  const Component = PAGES[page] as React.ComponentType;
  const path = ROUTES[page] ?? '/';
  return (
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path={path} element={<Component />} />
        <Route path="*" element={<Component />} />
      </Routes>
    </MemoryRouter>
  );
}

/** Monte l'application complète (routeur réel). */
export function FullApp() {
  return <App />;
}


/** Sonde de diagnostic : capture l'erreur réelle d'une page qui plante. */
class ErrorProbe extends React.Component<
  { children: React.ReactNode; onError: (message: string) => void },
  { failed: boolean }
> {
  constructor(props: { children: React.ReactNode; onError: (message: string) => void }) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    this.props.onError(error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error));
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function SafeProbe({ page, route = '/', mode }: { page: PageKey; route?: string; mode?: 'login' | 'signup' }) {
  const Component = PAGES[page] as React.ComponentType;
  const props = mode ? { mode } : {};
  const path = ROUTES[page] ?? '/';
  const report = (message: string) => {
    const box = document.createElement('pre');
    box.id = 'edumate-probe-error';
    box.textContent = message;
    document.body.appendChild(box);
  };
  return (
    <ErrorProbe onError={report}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path={path} element={<Component {...props} />} />
          <Route path="*" element={<Component {...props} />} />
        </Routes>
      </MemoryRouter>
    </ErrorProbe>
  );
}

export function SafeAppAt({ path }: { path: string }) {
  const report = (message: string) => {
    const box = document.createElement('pre');
    box.id = 'edumate-probe-error';
    box.textContent = message;
    document.body.appendChild(box);
  };
  return (
    <ErrorProbe onError={report}>
      <AppAt path={path} />
    </ErrorProbe>
  );
}

const api = {
  React,
  act,
  createRoot,
  Probe,
  SafeProbe,
  SafeAppAt,
  FullApp,
  AppAt,
  PAGES,
  stores: { useAuth, useCatalog, useUi, useQuiz },
  endpoints,
  renderRichText,
};

// React doit savoir qu'il est piloté par `act` (rendu synchrone en test).
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

(window as unknown as { EduMateTest: typeof api }).EduMateTest = api;
export default api;

/** Monte l'application COMPLÈTE (routeur réel + garde-routes). */
export function AppAt({ path }: { path: string }) {
  // Force l'URL vue par le BrowserRouter.
  window.history.replaceState({}, '', path);
  return <App />;
}
