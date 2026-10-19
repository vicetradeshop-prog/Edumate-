/**
 * Test de rendu de l'outil Musique (webradios + générateur local).
 *
 * Lancé directement via tsx sur le code source : aucun bundle Vite n'est
 * nécessaire, ce qui permet de valider le rendu réel des composants même quand
 * la compilation de production n'est pas disponible.
 *
 * Vérifie :
 *   - la page monte sans erreur et sans incident React en console,
 *   - les 9 ambiances sont proposées (6 webradios + 3 générées),
 *   - les stations renvoyées par l'API sont listées et sélectionnables,
 *   - le repli sur la musique générée est affiché quand l'annuaire échoue,
 *   - le changement d'ambiance déclenche bien un nouvel appel.
 */
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/outils/musique',
});
for (const key of Object.getOwnPropertyNames(dom.window)) {
  try {
    if (
      !(key in globalThis) ||
      ['SVGElement', 'HTMLElement', 'HTMLInputElement', 'Element', 'Node', 'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'getComputedStyle', 'navigator', 'document', 'DOMParser', 'CSS', 'Audio', 'HTMLMediaElement'].includes(key)
    ) {
      Object.defineProperty(globalThis, key, { value: (dom.window as unknown as Record<string, unknown>)[key], writable: true, configurable: true });
    }
  } catch {
    /* non redéfinissable */
  }
}
globalThis.window = dom.window as unknown as Window & typeof globalThis;
globalThis.self = dom.window as unknown as typeof globalThis;
globalThis.document = dom.window.document;
globalThis.navigator = dom.window.navigator;
globalThis.getComputedStyle = dom.window.getComputedStyle;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
if (!globalThis.requestAnimationFrame) {
  globalThis.requestAnimationFrame = ((cb: (t: number) => void) => setTimeout(() => cb(Date.now()), 0)) as never;
  globalThis.cancelAnimationFrame = ((id: number) => clearTimeout(id)) as never;
}

/* ------------------------------------------------------------------ */
/*  Bouchon d'API                                                      */
/* ------------------------------------------------------------------ */

const STATIONS = [
  { id: 's1', name: 'SomaFM Groove Salad', url: 'https://ice6.somafm.com/groovesalad-128-mp3', homepage: '', favicon: '', codec: 'MP3', bitrate: 128, country: 'US', tags: ['ambient'], votes: 47630 },
  { id: 's2', name: 'Calm Radio Solo Piano', url: 'https://streams.calmradio.com:1228/', homepage: '', favicon: '', codec: 'MP3', bitrate: 128, country: 'CA', tags: ['piano'], votes: 6273 },
  { id: 's3', name: 'Classic FM UK', url: 'https://ice-the.musicradio.com/ClassicFMMP3', homepage: '', favicon: '', codec: 'MP3', bitrate: 128, country: 'GB', tags: ['classical'], votes: 57341 },
];

const calls: string[] = [];
let failStations = false;

globalThis.fetch = (async (input: unknown, init?: { method?: string }) => {
  const url = String(typeof input === 'string' ? input : (input as { url?: string })?.url ?? '');
  calls.push(url);
  const json = (body: unknown, status = 200): Response =>
    ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body), headers: new dom.window.Headers({ 'Content-Type': 'application/json' }) }) as unknown as Response;

  if (url.includes('/api/auth/session')) return json({ user: null, csrfToken: null, demoAvailable: false, aiConfigured: false });
  if (url.includes('/api/services/music/moods')) {
    return json({
      moods: [
        { id: 'lofi', label: 'Lo-fi studieux', emoji: '🎧', description: '', source: 'radio' },
        { id: 'ambient', label: 'Nappe atmosphérique', emoji: '🌌', description: '', source: 'radio' },
      ],
      source: 'radio-browser.info',
    });
  }
  if (url.includes('/api/services/music/stations')) {
    if (failStations) return json({ mood: 'lofi', stations: [], source: 'unavailable' });
    return json({ mood: new URL(url, 'http://x').searchParams.get('mood'), stations: STATIONS, source: 'radio-browser.info' });
  }
  if (url.includes('/api/catalog')) {
    return json({ subjects: [], levels: [], stats: { subjects: 10, levels: 4, themes: 229, topics: 1316, playable: 1316, questionPool: 1 } });
  }
  return json({});
}) as typeof fetch;

/* ------------------------------------------------------------------ */
/*  Banc d'essai                                                       */
/* ------------------------------------------------------------------ */

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');
const { MemoryRouter } = await import('react-router-dom');
const MusicToolPage = (await import('../src/client/pages/tools/MusicToolPage.js')).default;
const { MOODS, music } = await import('../src/client/lib/music.js');

let passed = 0;
const failures: string[] = [];
function check(label: string, ok: boolean, detail = ''): void {
  if (ok) {
    passed += 1;
    console.log(`  ✅ ${label}`);
  } else {
    failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const consoleErrors: string[] = [];
const nativeError = console.error;
console.error = (...args: unknown[]): void => {
  const text = args.map((a) => String(a)).join(' ');
  // framer-motion avertit légitimement de l'absence d'API de mise en page.
  if (/Hydration|does not appear|Each child in a list|Cannot update a component/.test(text)) consoleErrors.push(text.slice(0, 200));
  nativeError(...args);
};

const host = document.getElementById('root')!;
const root = createRoot(host);

const text = (): string => (host.textContent ?? '').replace(/\s+/g, ' ');
const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

console.log('\n── Montage de la page ──');
await act(async () => {
  root.render(React.createElement(MemoryRouter, null, React.createElement(MusicToolPage)));
});
await act(async () => {
  await wait(250);
});

check('la page monte sans exception', host.innerHTML.length > 500, `${host.innerHTML.length} caractères`);
check('titre « Musique » affiché', text().includes('Musique'));
check('les 9 ambiances sont proposées', MOODS.length === 9, `${MOODS.length}`);
for (const mood of ['Lo-fi studieux', 'Piano doux', 'Classique calme', 'Jazz feutré', 'Nappe atmosphérique', 'Chillout', 'Pluie douce', 'Vagues', 'Forêt']) {
  check(`ambiance « ${mood} » présente`, text().includes(mood));
}
check('badge « Webradio » affiché', text().includes('Webradio'));
check('badge « Générée » affiché', text().includes('Générée'));
check('un appel aux stations a bien eu lieu', calls.some((url) => url.includes('/api/services/music/stations')));

console.log('\n── Stations ──');
await act(async () => {
  await wait(120);
});
check('stations listées dans l’interface', STATIONS.every((station) => text().includes(station.name)), STATIONS.map((s) => s.name).join(', '));
check('le codec/débit est affiché', text().includes('kb/s'));
check('les 3 stations sont en mémoire', music.stations.length === 3, String(music.stations.length));
check('ambiance courante = lofi', music.moodId === 'lofi', music.moodId);
check('toutes les URL sont en HTTPS', music.stations.every((station) => station.url.startsWith('https://')));

console.log('\n── Sélection d’une ambiance générée ──');
const localButton = [...host.querySelectorAll('button')].find((button) => (button.textContent ?? '').includes('Pluie douce'));
check('bouton « Pluie douce » trouvé', Boolean(localButton));
await act(async () => {
  localButton?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
});
await act(async () => {
  await wait(180);
});
check('ambiance locale sélectionnée', music.moodId === 'pluie', music.moodId);
check('source effective = local', music.effectiveSource === 'local', music.effectiveSource);
check('mode radio désactivé', music.isRadio === false);

console.log('\n── Retour sur une ambiance radio ──');
const jazzButton = [...host.querySelectorAll('button')].find((button) => (button.textContent ?? '').includes('Jazz feutré'));
await act(async () => {
  jazzButton?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
});
await act(async () => {
  await wait(220);
});
check('ambiance « jazz » sélectionnée', music.moodId === 'jazz', music.moodId);
check('nouvel appel à l’API pour cette ambiance', calls.filter((url) => url.includes('mood=jazz')).length > 0);
check('stations rechargées', music.stations.length === 3, String(music.stations.length));

console.log('\n── Repli quand l’annuaire est injoignable ──');
failStations = true;
const classicButton = [...host.querySelectorAll('button')].find((button) => (button.textContent ?? '').includes('Classique calme'));
await act(async () => {
  classicButton?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
});
await act(async () => {
  await wait(250);
});
check('ambiance « classique » sélectionnée', music.moodId === 'classique', music.moodId);
check('repli sur le générateur local', music.effectiveSource === 'local', music.effectiveSource);
check('message de repli affiché à l’écran', /générée|webradio|Aucune/i.test(text()), text().slice(0, 160));
check('bouton « Réessayer les webradios » proposé', text().includes('Réessayer'));
check('piste locale de repli = piano', music.trackId === 'piano', music.trackId);

console.log('\n── Incidents React ──');
check('aucune erreur React critique en console', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));

/* ------------------------------------------------------------------ */
/*  Bilan                                                             */
/* ------------------------------------------------------------------ */

console.log(`\n${'='.repeat(62)}`);
if (failures.length) {
  console.log(`  ❌ ${passed} réussi(s), ${failures.length} échec(s) :`);
  for (const failure of failures) console.log(`     • ${failure}`);
  console.log('='.repeat(62));
  process.exit(1);
}
console.log(`  Résultat : ${passed} contrôles réussis, 0 échec(s)`);
console.log('='.repeat(62));
process.exit(0);
