// Test de régression : le tableau de bord après validation d’un événement.
import { JSDOM } from 'jsdom';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import { createElement } from 'react';

function mount(html) {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, { url: 'https://x.test/', pretendToBeVisual: true });
  const g = globalThis;
  g.window = dom.window; g.document = dom.window.document;
  g.navigator = dom.window.navigator; g.location = dom.window.location; g.history = dom.window.history;
  g.HTMLElement = dom.window.HTMLElement; g.Element = dom.window.Element; g.Node = dom.window.Node;
  g.Event = dom.window.Event; g.CustomEvent = dom.window.CustomEvent; g.getComputedStyle = dom.window.getComputedStyle;
  g.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0); g.cancelAnimationFrame = clearTimeout;
  g.matchMedia = () => ({ matches: false, addEventListener(){}, removeEventListener(){} });
  g.ResizeObserver = class { observe(){} unobserve(){} disconnect(){} };
  g.IntersectionObserver = class { observe(){} unobserve(){} disconnect(){} };
  dom.window.ResizeObserver = g.ResizeObserver; dom.window.IntersectionObserver = g.IntersectionObserver;
  g.IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(dom.window.document.createElement('div'));
  dom.window.document.body.append(root._internalRoot ? dom.window.document.body.firstChild ?? dom.window.document.createElement('i') : dom.window.document.createElement('i'));
  return { dom, root };
}

async function load() {
  const React = await import('react');
  const { MemoryRouter } = await import('react-router-dom');
  const { ThemeProvider } = await import('../src/client/components/ThemeProvider.tsx');
  const { ToastProvider } = await import('../src/client/components/Toast.tsx');
  const { CatalogProvider } = await import('../src/client/components/CatalogProvider.tsx');
  const { AppRoutes } = await import('../src/client/routes.tsx');
  return { React, MemoryRouter, ThemeProvider, ToastProvider, CatalogProvider, AppRoutes };
}

const now = new Date();
const iso = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 16, 0).toISOString();
const todayIso = iso.slice(0, 10);
const CAT = { subjects: [{ id:'maths', name:'Mathématiques', slug:'mathematiques', emoji:'📐', color:'#6366f1', description:'' }], levels:[], questionCount:1000, subjectCount:1, levelCount:1, updatedAt: new Date().toISOString() };

// UN SEUL événement (le scénario réel de l'utilisateur)
const feed = [
  { path:'/api/me/calendar/today', body:{ tasks:[], overdue:[], upcoming:[{ id:'evt1', title:'Devoir de maths', kind:'devoir', date: todayIso, time:'16:00', allDay:false, done:false, subjectId:'maths' }], todayLabel:'Aujourd’hui' } },
  { path:'/api/me/calendar/export.ics', body:'' },
  { path:'/api/me/calendar/events', method:'POST', body:{ id:'evt1', title:'Devoir de maths', kind:'devoir', date: todayIso, time:'16:00', allDay:false, done:false } },
  { path:/^\/api\/me\/calendar\/events\/.+$/, method:'PATCH', body:{ id:'evt1', title:'Devoir de maths', kind:'devoir', date: todayIso, time:'16:00', allDay:false, done:true } },
  { path:/^\/api\/me\/calendar\/events\/.+$/, method:'DELETE', body:{ ok:true } },
  { path:'/api/catalog', body: CAT },
  { path:'/api/me/progress', body:{ xp:{total:120, level:2}, streak:{current:3, longest:5, byDate:{}}, recent:[], badges:[], accuracy:{overall:0.8, bySubject:{}}, minutesBySubject:{}, totalMinutes:20, lastActivityAt:new Date().toISOString() } },
  { path:'/api/me/feed', body:{ posts:[], sondages:[], notifications:[], hasUnread:false, unreadCount:0 } },
  { path:'/api/me/sessions', body:{ sessions:[], totalSeconds:0 } },
  { path:'/api/me/homework', body:[] },
  { path:'/api/me/review/due', body:{ due:[], counts:{ due:0, learning:0, mature:0 } } },
  { path:'/api/me/review/cards', body:[] },
];

console.log('\n═══════ REPRODUCTION : tableau de bord, 1 seul événement ═══════');
const { React, MemoryRouter, ThemeProvider, ToastProvider, CatalogProvider, AppRoutes } = await load();
let failures = 0;
const check = (label, cond) => { console.log(`   ${cond ? '✅' : '⛔'} ${label}`); if (!cond) failures++; };

for (const [scenario, patchHandler] of [['réponse normale', null], ['PATCH renvoie 404', () => ({ status: 404, body: { error: 'Introuvable' } })]]) {
  console.log(`\n--- scénario : ${scenario} ---`);
  const calls = [];
  let errors = [];
  global.fetch = async (url, init = {}) => {
    const u = String(url); const method = (init.method || 'GET').toUpperCase();
    if (u.includes('/api/')) calls.push({ url: u.replace('https://edumate-w87j.onrender.com',''), method });
    if (patchHandler && method === 'PATCH' && u.includes('/events/')) {
      const r = patchHandler(); return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'Content-Type': 'application/json' } });
    }
    const route = feed.find((e) => (e.method || 'GET') === method && (e.path instanceof RegExp ? e.path.test(u) : u.includes(e.path)));
    return new Response(JSON.stringify(route ? route.body : {}), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const { dom, root } = mount('<div id="root"></div>');
  const OrigError = console.error;
  console.error = (...a) => { errors.push(a.map(String).join(' ')); OrigError(...a); };
  await act(async () => {
    root.render(React.createElement(ThemeProvider, null,
      React.createElement(MemoryRouter, { initialEntries: ['/tableau-de-bord'] },
        React.createElement(ToastProvider, null,
          React.createElement(CatalogProvider, null,
            React.createElement(AppRoutes))))));
  });
  await act(async () => { for (let i=0;i<14;i++){ await new Promise(r=>setTimeout(r,18)); } });

  const body = () => dom.window.document.body;
  check('le tableau de bord s’affiche', body().textContent.includes('Bon retour'));
  check('l’événement apparaît', body().textContent.includes('Devoir de maths'));

  // clic sur « terminer »
  const btn = body().querySelector('button[aria-label^="Marquer «"]');
  check('le bouton « terminer » existe', !!btn);
  if (btn) {
    await act(async () => { btn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })); });
    await act(async () => { for (let i=0;i<14;i++){ await new Promise(r=>setTimeout(r,18)); } });
    // ⚠️ LE POINT CRITIQUE : est-ce que l'interface est encore là ?
    check('🔴 l’interface est ENCORE visible après validation', body().textContent.includes('Bon retour'));
    check('🔴 le héro est encore là', !!body().querySelector('.hero'));
    check('🔴 la barre latérale est encore là', body().innerHTML.length > 2000);
    check('l’état vide « Rien de prévu » s’affiche', body().textContent.includes('Rien de prévu'));
    check('la section « Ma liste du moment » est encore là', body().textContent.includes('Ma liste du moment'));
    check('la carte de révision est encore là', body().textContent.includes('Mémorisation espacée'));
    const patchCall = calls.find((c) => c.method === 'PATCH');
    check('le PATCH a bien été envoyé', !!patchCall);
  }
  console.error = OrigError;
  const realErrors = errors.filter((e) => !e.includes('not wrapped in act') && !e.includes('ReactDOMTestUtils') && !e.includes('defaultProps') && !e.includes('Warning: An update to'));
  if (realErrors.length) { console.log('   ⚠️ Erreurs console capturées :'); realErrors.slice(0,4).forEach((e) => console.log('      ' + e.slice(0, 400))); }
  check('aucune erreur console critique', realErrors.length === 0);
  await act(async () => { root.unmount(); });
}

console.log(failures === 0 ? '\n✅ BUG NON REPRODUIT (tout fonctionne en jsdom)' : `\n⛔ ${failures} ÉCHEC(S) — bug reproduit`);
process.exit(0);
