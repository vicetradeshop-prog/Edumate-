# 🦉 EduMate — Refonte v3.0 : « Liquid Glass »

> Document de livraison — expérience visuelle premium « verre liquide /
> glassmorphism futuriste », appliquée **par-dessus** l'application existante
> sans casser aucune fonctionnalité ni aucune logique serveur.
> Aucune clé, aucun secret dans ce document.

---

## 1. Objectif & principes directeurs

Cahier des charges en 27 sections : verre translucide réaliste (boutons,
cartes, panneaux, badges, sidebar, topbar, modales, toasts), fond 3D vivant
réactif au curseur (fluide GPU, Fresnel, iridescence, particules), animations
d'entrée des pages et du tableau de bord, thème sombre par défaut, responsive,
`prefers-reduced-motion`, performance critique.

**Ordre de priorité absolu, respecté à chaque arbitrage :**

1. **Fonctionnalités** — rien de ce qui existait ne régresse ;
2. **Stabilité** — aucun crash, aucun canvas orphelin, aucune fuite ;
3. **Performance** — chunk 3D paresseux, gouverneur FPS, paliers de qualité ;
4. **Accessibilité** — mouvement réduit, réglage « Animations », contrastes ;
5. **Visuel** — la couche premium vient en dernier, jamais au prix du reste.

Contraintes techniques tenues : pas de Tailwind (CSS/TS/React uniquement),
`three.js` seule nouvelle dépendance majeure, départ du code existant.

---

## 2. Système de design (« tokens »)

### 2.1 Palette « Aurora » (`src/client/styles/base.css`)

- Thème **sombre** par défaut (stock client + serveur + `index.html` boot) :
  fond quasi-noir violacé, accents violet → magenta → rose.
- Thème **clair** complet : lavande très pâle, verres blancs translucides.
- Tokens partagés : `--glass-*` (teinte, bordure, reflet), `--accent-*`,
  `--ed-surface-solid`, `color-scheme` par thème.

### 2.2 Feuille « Liquid Glass » (`src/client/styles/glass.css`)

Chargée **en dernier** (après base/components/layout/lessons) : elle habille
les composants existants sans les réécrire.

- Cartes `.card`, panneaux `.glass-panel`, badges, sidebar, topbar, inputs,
  modales, toasts, hero, landing, écrans d'auth.
- Animations : `page-in` (entrée de page), `glass-rise`, `.reveal-stagger`
  (cascade du tableau de bord), reflets glissants ancrés au curseur.
- Garde-fous : `prefers-reduced-motion`, réglage compte « animations »,
  palier matériel `data-fx="low"`, impression (`@media print`).

### 2.3 Règle d'or du `backdrop-filter` (bug Windows contourné)

Jamais de `backdrop-filter` :

- sur un élément **contenant du texte** (le texte devient flou sur Windows) ;
- sur un élément **transformé** ou dont un ancêtre est transformé (cela crée
  un « backdrop root » qui coupe le flou).

→ Le flou est porté par le pseudo-élément `::before` de la surface, en
`z-index: -1` derrière le contenu, avec `isolation: isolate` sur l'hôte.
Les surfaces animées (modales, toasts, panneaux coulissants) utilisent une
teinte franche **sans flou** (un ancêtre en mouvement casserait le flou).
Vérifié automatiquement par `scripts/visual-check.mjs` :
« le texte n'est PAS dans un élément flouté ».

Empilement : `#root { position: relative; z-index: 1 }` et
`.liquid-bg { position: fixed; z-index: -1; pointer-events: none }`.

---

## 3. Composants verre (UI)

| Composant | Rôle |
| --- | --- |
| `GlassCard.tsx` | carte translucide (variante hover, padding, `as`) |
| `GlassPanel.tsx` | grand panneau de section |
| `GlassBadge.tsx` | pastille/badge verre |
| `LiquidGlassButton.tsx` | bouton liquide (reflet curseur, press, focus visible) |

Tous dégradent proprement sans JS et sans WebGL (CSS seul suffit).

---

## 4. Fond vivant `LiquidGlassBackground`

### 4.1 Architecture

- `components/background/LiquidGlassBackground.tsx` — enveloppe React :
  crée/détruit le canvas, garde-fous d'environnement, repli CSS, nettoyage.
- `components/background/glassScene.ts` — moteur three.js (~1 100 lignes) :
  fluide GPU type solveur de Navier-Stokes (FBO ping-pong, advection,
  pression), formes de verre (Fresnel + iridescence), particules, halo
  curseur, composite basse résolution → écran.
- `components/background/shaders.ts` — GLSL (attention : pas de backtick
  dans les commentaires GLSL, ils casseraient le template literal TS).
- `lib/fx.ts` — paliers matériels (`getFxTier`), préférences de mouvement
  (`motionAllowed`, `onMotionPreferenceChange`), lumière curseur déléguée
  (UN seul écouteur pour toute l'app), inclinaison 3D, `FpsGovernor`.

### 4.2 Chargement & repli

- Import **dynamique** du moteur : chunk `glassScene-*.js` (~139 Kio gzip)
  chargé seulement si WebGL2 existe ET le mouvement est autorisé.
- Repli automatique : pas de WebGL2 / jsdom / three.js indisponible /
  contexte perdu / **gouverneur FPS** (machine trop lente) → dégradé CSS
  « aurora » statique, zéro canvas laissé derrière.
- `prefers-reduced-motion` OU réglage compte « Animations » coupent le 3D
  (vérifié : `data-mode="css"`, aucun canvas).
- `pointer-events: none` partout : le fond ne peut jamais intercepter un clic.

### 4.3 Gouverneur FPS & paliers

- Palier matériel (`high` / `medium` / `low`) : résolutions, nombre de
  formes/particules, itérations de pression adaptés.
- `FpsGovernor` : fenêtre 3 s, warmup ignoré ; < 42 fps → baisse de
  résolution ; < 26 fps → repli CSS définitif. Une machine faible obtient
  donc toujours une interface fluide, simplement sans 3D.

### 4.4 Bugs subtils corrigés dans cette passe

1. **`document.hidden` au démarrage** — certains navigateurs headless (et
   quelques cas de démarrage réel) signalent `hidden === true` à tort : le
   garde bloquait `startLoop()` pour toujours. Retiré du démarrage initial ;
   la pause reste gérée par `visibilitychange` → `stopLoop()` (et rAF ne
   tourne de toute façon pas dans un onglet masqué).
2. **Double montage du moteur** — l'hydratation des réglages pose
   `data-animations` sur `<html>` pendant l'import paresseux du moteur ;
   `onMotionPreferenceChange` relançait alors `start()` (encore `scene=null`)
   → **deux scènes WebGL simultanées**, puis un canvas orphelin au repli (le
   closure `canvas` ayant été écrasé). Corrigé par une garde « en vol »
   (`starting`) dans `start()` + nettoyage filet de tout canvas orphelin
   dans `fallbackToCss()`.
3. **Trace diagnostique** `data-fx-webgl-started` posée sur `<html>` à la
   première frame WebGL : distingue « WebGL jamais démarré » d'un repli
   gouverneur ultérieur (utile au contrôle visuel et au support terrain).

---

## 5. Intégrations application

- `main.tsx` : import de `glass.css` en dernier.
- `App.tsx` : fond monté hors barrière d'erreur ; `getFxTier()` +
  `startPointerFx()` au montage.
- `AppShell.tsx` : `<main key className="page page-enter">` — l'entrée de
  page est un keyframe CSS finissant sur `transform: none` (jamais de
  `backdrop-filter` sous un ancêtre transformé).
- `DashboardPage.tsx` : cascade `.reveal-stagger`, badges/boutons/cartes
  verre sur les tuiles statistiques et le hero.
- `LandingPage.tsx` : CTA `LiquidGlassButton`, hero dégradé, cartes verre.
- Thème **sombre par défaut** partout : store client, création de compte
  serveur, onboarding, auth démo, boot `index.html`.
- PWA : `sw.js` v7 (nouveau cache), manifest, favicon.

---

## 6. Correctifs de mise en page (débordements)

Détectés par le contrôle visuel automatisé, corrigés et revérifiés :

1. **QuizHub (desktop)** : `.topic-card__foot` (flex `space-between` sans
   wrap) débordait de 15 px sur grille 4 colonnes → `flex-wrap: wrap` +
   `min-width: 0` sur les rangées (`layout.css`).
2. **Topbar (mobile 390 px)** : les 4 boutons d'actions (~312 px + gaps)
   dépassaient de 4 px → resserrement gaps/padding sous `@media (max-width: 640px)`.

---

## 7. Performance

- Chunk 3D **paresseux** : initial ~215 Kio gzip sans three.js ; le moteur
  (139 Kio gzip) ne se charge que si utile.
- Composite basse résolution + `bgScale` adaptatif ; FBO half-float quand
  disponible ; aucune allocation par frame (uniforms mutés).
- Lumière curseur : 1 écouteur délégué, écritures CSS throttées par rAF,
  zéro rerender React.
- `test:bundle` : 10/10 garde-fous (tailles initiales, chunk 3D séparé,
  absence de three.js dans l'entrée…).

---

## 8. Accessibilité

- `prefers-reduced-motion: reduce` → fond 3D coupé, animations neutralisées
  (vérifié par test automatisé + capture).
- Réglage compte « Animations et transitions » → même effet, réactif à chaud
  (MutationObserver sur `data-animations`).
- Focus visibles sur verre, contrastes AA conservés sur les deux thèmes,
  texte jamais dans un calque flouté.

---

## 9. Vérification (tout est rejouable)

| Commande | Résultat |
| --- | --- |
| `npm run typecheck` | ✅ |
| `npm run build` | ✅ (chunk glassScene lazy 139 Kio gzip) |
| `npm run test:unit` | ✅ 89/89 |
| `npm run test:content` | ✅ |
| `npm run test:api` / `test:api:built` | ✅ 155 / 172 |
| `npm run test:bundle` | ✅ 10/10 |
| `npm run test:render` | ✅ 63/63 |
| `npm run test:ui` | ✅ 48/48 |
| `npm run test:routes` | ✅ 5/5 |
| `npm run test:hooks` / `test:scripts` | ✅ (publier.bat ASCII/CRLF valide) |
| `node scripts/visual-check.mjs` | ✅ **139 contrôles, 0 échec** |

### Contrôle visuel automatisé (`scripts/visual-check.mjs`)

Puppeteer headless (WebGL logiciel SwiftShader) : toutes les pages de
l'application auditées — contenu rendu, fond vivant présent, fond non
interactif, **zéro débordement horizontal**, zéro erreur console, zéro
requête en échec, verre sur `::before` et texte hors flou, moteur WebGL
démarré, thème clair, `prefers-reduced-motion`, mobile 390×844, connexion
admin en contexte isolé. Les captures `shots/v3-*.png` ne sont pas versionnées
(dossier ignoré par git pour alléger le dépôt) : elles sont régénérées à la
demande par `node scripts/visual-check.mjs` et livrées dans l'archive de
release. Pages capturées : landing, connexion, inscription, tableau de bord
sombre/clair/mobile/reduced-motion, quiz hub/détail/jeu, leçons, fiches,
planning, progression, devoirs, fil, assistant, outils, minuteur, tableau,
profil, paramètres, admin.

Prérequis du contrôle : `npm run build` puis serveur sur le port 8123 avec
`ALLOW_DEMO_ACCOUNT=true` (le bouton « compte de démonstration » est
désactivé par défaut en production).

---

## 10. Ce qui n'a PAS changé

- Toute la logique serveur : auth, CSRF, sessions, Upstash, routes API,
  rate-limit, catalogue généré, tuteur intégré, SSE.
- `publier.bat` et la chaîne de publication (`build:data`, `test:unit`,
  `test:content`, `build`, `test:bundle`) — vérifiée par `test:scripts`.
- Aucune dépendance ajoutée hors `three.js` (dev : puppeteer, non requis).

---

## 11. Fichiers clés de la refonte

```
src/client/styles/base.css            tokens, palettes sombre/claire
src/client/styles/glass.css           couche « Liquid Glass » (chargée en dernier)
src/client/lib/fx.ts                  paliers, mouvement, lumière curseur, gouverneur
src/client/components/background/*    LiquidGlassBackground, glassScene, shaders
src/client/components/ui/Glass*.tsx   GlassCard / GlassPanel / GlassBadge
src/client/components/ui/LiquidGlassButton.tsx
scripts/visual-check.mjs              audit Puppeteer + captures shots/v3-*.png (non versionnées)
tests/glass-scene-stub.ts             stub du moteur pour les tests de rendu (jsdom)
```
