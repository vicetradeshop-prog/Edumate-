# 🧭 Architecture & conventions — EduMate

Document destiné à quiconque reprend le projet : où modifier quoi, et pourquoi les choix ont été faits.

---

## 1. Vue d'ensemble

```
┌──────────────────────────────────────────────────────────────────────┐
│  UN PROCESS NODE (Express)                                           │
│                                                                      │
│   /api/auth      → comptes, sessions, profil, préférences            │
│   /api           → catalogue, recherche, génération, correction      │
│   /api/progress  → statistiques, historique, maîtrise                │
│   /api/organize  → calendrier, tâches, vue « aujourd'hui »           │
│   /api/tutor     → assistant pédagogique + historique                │
│   /api/services  → traduction, annuaire des établissements           │
│   /api/admin     → comptes, catalogue, contrôle qualité              │
│                                                                      │
│   /*           → dist/client (SPA React) avec repli index.html       │
└──────────────────────────────────────────────────────────────────────┘
        │                                     │
        ▼                                     ▼
  Couche Storage (contrat unique)      Moteur pédagogique
   ├── Upstash Redis (prod)             ├── familles de générateurs
   ├── fichier JSON (dev)               ├── banques JSON
   └── mémoire (tests)                  └── catalogue compilé
```

**Principe directeur : un seul service.** Le frontend et l'API vivent dans le même dépôt, le même build et le même process. Aucun CORS, aucun second hébergement, une seule variable `PORT`.

---

## 2. Où modifier quoi ?

| Je veux… | Fichier |
|---|---|
| Ajouter un **sujet de quiz** | `src/server/content/topics.ts` (1 ligne) |
| Ajouter des **questions rédigées** | `data/quiz/<matiere>.json` |
| Créer un **générateur de questions** | `src/server/content/families/*.ts` |
| Ajouter une **matière** ou un **niveau** | `src/server/content/meta.ts` |
| Enrichir un **corpus** (histoire, philo, SVT, SES, NSI) | `src/server/content/data/knowledge.ts` |
| Ajouter des **verbes / du vocabulaire** | `src/server/content/data/french.ts`, `data/languages.ts` |
| Ajouter des **molécules / éléments** | `src/server/content/data/chemistry.ts` |
| Créer une **route API** | `src/server/routes/*.ts` + montage dans `src/server/index.ts` |
| Modifier le **modèle de données** | `src/shared/types.ts` + `src/server/lib/store.ts` |
| Changer de **fournisseur d'IA** | `src/server/lib/ai.ts` (ou juste `AI_PROVIDER`) |
| Modifier le **chargement du `.env`** | `src/server/lib/env.ts` |
| Changer de **base de données** | `src/server/lib/storage.ts` (implémenter `Storage`) |
| Ajouter une **page** | `src/client/pages/` + route dans `src/client/App.tsx` |
| Ajouter un **outil** | `src/client/pages/tools/` + entrée dans `ToolsPage.tsx` |
| Modifier le **design** | `src/client/styles/{base,components,layout}.css` |
| Ajouter un **composant réutilisable** | `src/client/components/ui/` |
| Ajouter un **endpoint côté client** | `src/client/lib/api.ts` (objet `endpoints`) |
| Ajouter un **état global** | `src/client/lib/store.ts` (Zustand) |

---

## 3. Le moteur pédagogique en détail

### Contrat d'une famille de questions

```ts
interface QuestionFamily {
  id: string;                                    // ex. 'math.derivative'
  label: string;
  pool: number | ((params) => number);           // taille du vivier (Infinity = illimité)
  make(ctx: GeneratorContext): Question | null;  // null = tentative invalide, on retente
}
```

`make()` reçoit un **générateur pseudo-aléatoire déterministe** (`ctx.rng`) initialisé avec la graine de la session. C'est ce qui permet :
- de régénérer **exactement** la même session côté serveur lors de la correction (anti-triche) ;
- d'obtenir une variété quasi infinie entre deux parties.

### Chaîne de fabrication

```
topics.ts / expansions/*          →  définitions de sujets (données)
        │  npm run build:data
        ▼
data/generated/catalog.json       →  catalogue statique (aucun calcul au démarrage)
        │  GET /api/search, /api/browse
        ▼
client (cartes, filtres)          →  l'élève choisit un sujet
        │  POST /api/generate {topicId, count, seed}
        ▼
buildQuiz() → buildQuestions()    →  questions SANS réponses
        │  POST /api/grade {topicId, seed, answers}
        ▼
re-génération + comparaison       →  score officiel + explications
```

### Moteur symbolique (`content/symbolic.ts`)
Petit AST mathématique maison : `evaluate`, `derivative`, `simplify`, `toLatex`.
Il permet de générer des questions de dérivation **exactes** (polynômes, quotients, `exp`, `ln`, `sin`, `cos`, `sqrt`) sans aucune base de données de réponses. Testé numériquement dans `scripts/unit-test.ts`.

### Banques rédigées (`content/banks.ts` + `data/quiz/*.json`)
Pour tout ce qui ne se calcule pas (méthodologie, EMC, oxydoréduction…). Chaque banque est automatiquement exposée comme une famille `bank:<topicId>`, donc interchangeable avec un générateur. La bonne réponse est stockée en position 0 dans le JSON et **mélangée** à chaque partie.

---

### Variables d'environnement (`lib/env.ts`)

Le fichier `.env` est chargé par un **parseur maison, sans dépendance** (ni
`dotenv`, ni `node --env-file`). Trois raisons :

| Contrainte | Conséquence |
|---|---|
| `lib/config.ts` lit `process.env` **dès son évaluation** | `import './lib/env.js'` doit être le **tout premier** import de `src/server/index.ts` (en ESM, l'ordre de déclaration des imports détermine l'ordre d'évaluation) |
| `node --env-file` **échoue** si le fichier est absent (Node 20) | Casserait Render et toutes les suites de tests |
| Aucune dépendance serveur superflue | `dotenv` n'est pas nécessaire pour 40 lignes |

Règles de comportement :
- **une variable déjà présente dans `process.env` n'est jamais écrasée** → les
  variables Render priment toujours sur le `.env` local ;
- `.env.local` est lu **après** `.env` et permet de surcharger sans le modifier ;
- accepté : commentaires `#`, lignes vides, préfixe `export `, guillemets
  simples/doubles, `#` de fin de ligne hors guillemets, CRLF et LF ;
- absent → aucun effet, aucun message (cas normal en production) ;
- au démarrage, une ligne `[EduMate] .env chargé(s) : N variable(s) (…)` confirme
  la prise en compte — **si elle n'apparaît pas, le `.env` n'a pas été trouvé**.

Les suites de tests (`smoke-test`, `e2e-upstash`, `render-test`) forcent
`AI_PROVIDER=none` : elles restent déterministes et n'appellent jamais une vraie
API d'IA, même si un `.env` local contient une clé.

---

## 4. Données et persistance

Le contrat `Storage` (get / getMany / set / del / keys / health) est implémenté trois fois. Le choix est automatique :

1. `UPSTASH_REDIS_REST_URL` + `TOKEN` présents **et** `PING` réussi → **Upstash**.
2. Sinon, `FALLBACK_STORAGE=file` → **fichier JSON** (`data/local/`, persistant en local).
3. Sinon → **mémoire** (volatile, signalé dans `/api/health` et dans l'UI).

Aucune logique métier ne dépend de l'implémentation : `store.ts` ne parle qu'au contrat.

**Durcissement de l'implémentation Upstash** (`storage.ts`) :

| Mécanisme | Comportement |
|---|---|
| Nouvelles tentatives | 2 essais supplémentaires avec recul exponentiel (180 ms, 360 ms) sur les erreurs transitoires (réseau, timeout, 429, 5xx) |
| Disjoncteur | Après 4 échecs consécutifs : requêtes suspendues 15 s, réponse immédiate, puis tentative de rétablissement automatique |
| Requêtes groupées | `getMany()` envoie un **pipeline** REST sur `POST {url}/pipeline` : la liste des comptes se lit en 1 aller-retour au lieu de N (préserve le quota gratuit). ⚠️ Le corps `[cmd, ...args]` n'est valable **que** sur l'endpoint racine : un tableau de commandes y provoque `HTTP 400 ERR unsupported arg type: "["` |
| Écritures groupées | `delAndSet()` efface plusieurs clés **et** réécrit l'index en une seule requête (suppression de compte) ; `del()` accepte une liste de clés (un seul `DEL` Redis) |
| Testabilité | `scripts/mock-upstash.mjs` reproduit le contrat REST réel (racine vs `/pipeline`, `Bearer`, erreurs 400) : `npm run test:db` fait tourner la vraie API contre cette base simulée |
| Traduction des erreurs | `StorageUnavailableError` → HTTP **503** avec un message simple pour l'élève, trace technique uniquement dans les journaux |
| Diagnostic | `health()` renvoie `ready`, `latencyMs`, `lastError`, `notice`, `operations` → exposés par `/api/health` |

**Suppression de compte en cascade** (`deleteUser`) : profil, index e-mail, progression, favoris, calendrier, tâches et conversations sont effacés, l'index global est mis à jour, puis une **relecture de contrôle** vérifie qu'aucune donnée ne subsiste. Un export JSON complet est disponible (`exportUserData`).

**Clés utilisées** (préfixe `edumate:`) :

| Clé | Type | Borne |
|---|---|---|
| `user:<uuid>` | objet | — |
| `email:<e-mail>` | chaîne (index) | — |
| `users:index` | liste | — |
| `progress:<uuid>:attempts` | liste | 500 dernières |
| `favorites:<uuid>` | liste | 200 |
| `calendar:<uuid>` | liste | 500 |
| `tasks:<uuid>` | liste | 300 |
| `tutor:<uuid>` | liste | 40 conversations |
| `review:<uuid>` | objet | 1 000 sujets |

---

## 5. Authentification et sécurité

```
Inscription ──► scrypt(mdp + sel 16o) ──► user:<uuid>
Connexion   ──► verifyPassword (timingSafeEqual)
            ──► JWT HS256 signé (SESSION_SECRET, expiration 7 j)
            ──► cookie httpOnly SameSite=Lax (+ cookie CSRF lisible JS)
Requête mutative ──► requireAuth() + requireCsrf()
```

Points de vigilance pour toute évolution :
- **ne jamais** écrire une clé d'API dans le code : uniquement `process.env` (`npm run scan`) ;
- la CSP autorise `media-src https:` pour les webradios mais **garde
  `connect-src 'self'`** : aucune requête réseau directe du navigateur vers un
  tiers n'est possible hors média. Tout élargissement de `connect-src` doit être
  justifié et passer par un proxy serveur ;
- **ne jamais** renvoyer `passwordHash` (utiliser `toPublicUser`) ;
- **ne jamais** faire confiance au client pour un score (toujours `POST /api/grade`) ;
- tout contenu affiché passe par `renderRichText` / `renderMathText`, qui **échappent** le HTML ;
- toute nouvelle route mutative doit être montée **après** `requireAuth()` et `requireCsrf()`.

---

## 6. Conventions de code

- **TypeScript strict** partout (`tsc --noEmit` dans le build) ; aucun `any` implicite.
- **ESM** uniquement (`"type": "module"`), imports avec extension `.js` (convention Node ESM).
- **Français** pour tout ce qui est visible par l'élève (messages, contenus, commentaires pédagogiques) ; **anglais** pour les identifiants techniques.
- Un fichier = une responsabilité ; les composants UI dans `components/ui`, les écrans dans `pages`.
- Les données ne vivent **jamais** dans les composants React (séparation stricte données / interface).
- Sélecteurs Zustand **atomiques** : ne jamais renvoyer d'objet littéral depuis un sélecteur (boucle de rendu infinie).
- Gestion d'erreurs : `HttpError` côté serveur, `ApiError` côté client, messages simples pour l'utilisateur.
- Accessibilité : `aria-label` sur les boutons icônes, `aria-pressed` sur les toggles, cibles ≥ 44 px.

---

## 7. Ajouter une fonctionnalité : pas à pas

**Exemple : « ajouter un export PDF de ma progression »**

1. **Type** : `src/shared/types.ts` → `interface ProgressExport { … }`.
2. **Données** : `src/server/lib/store.ts` → fonction de lecture si nécessaire.
3. **Route** : `src/server/routes/progress.ts` → `progressRouter.get('/export', requireAuth(), …)`.
4. **Client API** : `src/client/lib/api.ts` → `endpoints.exportProgress()`.
5. **UI** : bouton dans `src/client/pages/ProgressPage.tsx` + toast de confirmation.
6. **Tests** : ajout d'un contrôle dans `scripts/smoke-test.mjs`.
7. **Docs** : une ligne dans le README si la fonctionnalité est visible.
8. `npm run typecheck && npm test`.

---

## 7bis. Leçons interactives & révisions de quiz

### Trois modules, une règle : du contenu pour TOUS les sujets

```
src/server/content/lessons.ts   moteur PUR : buildLesson(), bibliothèque de
                                134 fiches (une par famille), validation IA
src/shared/lessonText.ts        answerLabel() + splitSolution() — partagés
                                serveur/client (mêmes écrans des deux côtés)
src/client/lib/lessonSteps.ts   buildRevisionSteps(), applyAiToLesson(),
                                checkLessonAnswer() — PUR, testé sans DOM
```

La bibliothèque `LESSON_LIBRARY` couvre chaque famille de questions du
catalogue (accroche, objectifs, méthode, piège, astuce) ; une fiche par
MATIÈRE (`SUBJECT_LESSONS`) sert de repli pour toute future famille. Les
exemples et exercices viennent des générateurs existants (`buildQuestions`,
graine `topicId#lesson#<seed>`) : même contenu que les quiz, déterminisme
complet, aucune base de données de leçons à maintenir.

### Chaîne des leçons

```
GET /api/lessons/:topicId?seed=          (public, comme le catalogue)
   └─ buildLesson() : mission → méthode → exemple 1 → exercice 1 → piège
                      → exemple 2 → exercices 2-3 → récap (9 étapes)
POST /api/lessons/:topicId/enrich        (authentifié)
   └─ chatCompletion(JSON strict) → parseAiLesson() valide TOUT ou rien
        └─ cache 'lesson:ai:<topicId>' (contenu pédagogique partagé, pas une
           donnée personnelle : hors userDataKeys/RGPD)
        └─ client : applyAiToLesson() fusionne SANS réinitialiser la partie
```

### Révision interactive d'un quiz

`POST /api/grade` conserve désormais la **graine** dans l'essai
(`QuizAttempt.seed`). C'est elle qui permet de régénérer EXACTEMENT les
questions jouées :

```
GET /api/lessons/revision/:topicId[?attempt=<id>]   (authentifié)
   ├─ essai trouvé + graine + questions identiques → mode 'quiz'
   │     items[] = question + réponse de l'élève + verdict + explication
   │     chaque ERREUR reçoit un exercice de rattrapage neuf (même famille,
   │     énoncé jamais joué, jamais deux fois le même)
   └─ sinon (essai antérieur à la graine, catalogue régénéré, aucun essai)
         → mode 'entrainement' : 6 questions neuves, correction immédiate
```

Le client transforme la charge en étapes jouables (`buildRevisionSteps`) et
les affiche dans le même lecteur que les leçons (`StepPlayer`) : une seule
machine à étapes, deux constructeurs de contenu.

### Lecteur d'étapes (StepPlayer)

- Union discriminée `LessonStep` (6 natures) : toute étape inconnue est
  **ignorée**, jamais de crash si le contenu évolue.
- Score ⭐ + série 🔥, raccourcis `Entrée` / `1`-`6`, `aria-live` sur les
  feedbacks, écran final (confettis si taux ≥ 60 %).
- `prefers-reduced-motion` : classe `lp--reduced` → confettis, secousses et
  flottements désactivés (vérifié par `scripts/test-lessons-ui.ts`).
- Correction des exercices côté client (mêmes règles que le serveur via
  `src/shared/answers.ts`) : les leçons n'alimentent pas la progression
  officielle, dont les scores restent corrigés par le serveur.

### Tolérance aux incidents

- Générateur en échec → leçon « concept » (mission/méthode/piège/récap) :
  toujours jouable. Charge de révision sans question → parcours minimal.
- IA absente, en panne ou bavarde (JSON invalide) → `parseAiLesson` renvoie
  `null`, la leçon locale reste intacte, le client affiche un message.
- Échec du cache IA → le contenu généré est quand même renvoyé.

---

## 7ter. Musique : webradios + générateur local

Deux sources complémentaires derrière une seule liste d'ambiances (`MOODS`) :

```
MOODS (9 ambiances)
 ├── source: 'radio'  → lofi, piano, classique, jazz, ambient, chillout
 │     GET /api/services/music/stations?mood=X
 │        └── lib/music.ts (serveur) → annuaire Radio Browser, SANS clé d'API
 │              · 4 miroirs essayés en séquence (de1, de2, fi1, all)
 │              · curation : HTTPS obligatoire, codec audio, débit ≥ 64 kb/s,
 │                stations cassées écartées, noms « parlés » exclus (info/talk/sport)
 │              · tri par votes, cache mémoire 6 h
 │        └── lecture : <audio> du navigateur directement vers la station
 │
 └── source: 'local'  → pluie, vagues, forêt
       └── générateur Web Audio (accords, arpèges, nappes, bruit filtré)
```

**Pourquoi le flux n'est-il pas proxifié ?** Une webradio diffuse en continu
(~128 kb/s ≈ 57 Mo par heure d'écoute). Faire transiter cela par l'instance
Render gratuite saturerait sa bande passante et multiplierait les connexions
longues. Seule la *recherche* passe par le serveur : `connect-src` reste
strictement `'self'`, et seul `media-src` est élargi à `https:`.

**Chaîne de dégradation** (jamais de lecteur muet sans explication) :
1. une station échoue → station suivante de la même ambiance ;
2. toutes ont échoué → repli sur la piste locale correspondante
   (`LOCAL_FALLBACK`), message affiché + bouton « Réessayer les webradios » ;
3. l'annuaire est injoignable → idem, dès le chargement.

**Visualiseur** : aucun `AnalyserNode` n'est possible sur un flux tiers (il
faudrait `crossorigin="anonymous"` et des en-têtes CORS que les stations
n'envoient pas ; l'élément passerait en mode opaque et produirait du silence).
En mode radio, le visualiseur affiche donc une animation douce déterministe,
explicitement signalée comme décorative.

---

## 7quater. PWA : service worker et serveur froid

### Le problème réel

Le plan gratuit de Render arrête le conteneur après ~15 min d'inactivité ; le
premier accès prend alors jusqu'à ~30 s. **Un service worker ne peut pas
l'empêcher** — il s'exécute dans le navigateur, pas sur le serveur. Deux
réponses distinctes sont donc nécessaires.

| Problème | Réponse | Où |
|---|---|---|
| L'attente est **visible** (écran blanc, erreur) | Coquille applicative en cache, servie instantanément | `public/sw.js` |
| Le serveur **s'endort** pendant une session | Requête discrète toutes les 9 min, onglet ouvert | `lib/pwa.ts` → `startKeepAlive()` |
| L'échec réseau est pris pour une **déconnexion** | Nouvelles tentatives avec recul progressif | `lib/store.ts` → `loadSessionWithRetry()` |

### Stratégies de cache

| Ressource | Stratégie | Justification |
|---|---|---|
| `/api/*` | **jamais interceptée** | Un score, une session ou une progression servis depuis un cache seraient une faute grave |
| Origines tierces | jamais interceptées | Webradios, MyMemory, open data |
| Méthodes ≠ GET | jamais interceptées | Elles mutent |
| Navigations & HTML | **réseau d'abord avec délai de 2,5 s**, repli cache | Fraîcheur garantie serveur chaud, attente bornée serveur froid |
| `/assets/*` | cache d'abord | Noms hachés par le build → immuables, donc jamais périmés |
| Autres statiques | cache d'abord + revalidation | `favicon`, icônes |

### 🔴 Le piège n°0 : la version périmée (bug réel, corrigé)

**Symptôme remonté** : après un redéploiement, l'application affichait encore
l'ancienne version ; vider le cache du navigateur la faisait réapparaître.

**Deux défauts cumulés :**

1. **Deux clés de cache pour un seul document.** Le pré-cache installait `/`
   **et** `/index.html`, mais la revalidation n'écrivait que `/index.html`. La
   cascade de repli testait d'abord l'URL demandée : une navigation vers `/`
   correspondait donc à l'entrée `/`, **jamais rafraîchie**. La page d'accueil
   restait figée sur la version du jour de l'installation.
   → Corrigé par une **clé unique** `SHELL_KEY = '/index.html'`, en lecture comme
   en écriture. `/` et `/index.html` désignent le même document.

2. **« Cache d'abord » rendait tout redéploiement invisible.** L'ancien HTML
   était servi, la revalidation mettait le nouveau en cache, et il fallait un
   **second** chargement pour le voir. Un élève qui ouvre l'application une fois
   par jour restait donc sur l'ancienne version.
   → Remplacé par **réseau d'abord avec délai de 2,5 s**. Serveur chaud : HTML
   frais en ~200 ms. Serveur froid : cache après 2,5 s au lieu de ~30 s.

3. **Le bandeau de mise à jour clignotait sans être vu.** `skipWaiting()` fait
   passer le worker de `installed` à `activated` en quelques millisecondes, et
   l'activation réinitialisait `updateReady`. L'invite au rechargement
   apparaissait puis disparaissait avant d'être perçue, pendant que la page
   continuait d'exécuter l'ancien JavaScript.
   → `updateReady` est désormais **persistant** jusqu'au rechargement effectif.

**Chaîne de fraîcheur complète**, quatre maillons :

```
serveur  Cache-Control: no-cache sur sw.js, index.html, manifeste
  ↓
SW       réseau d'abord (2,5 s) pour le HTML + clé de coquille unique
  ↓       + détection de changement → postMessage SW_UPDATED
client   updateViaCache: 'none' à l'enregistrement
  ↓       + updateReady persistant → bandeau « Recharger »
purge    VERSION v2 → l'activation supprime edumate-shell-v1 (les coquilles
         périmées déjà installées chez les utilisateurs)
```

Les trois maillons sont verrouillés par test : `test-sw.ts` simule un
redéploiement et vérifie que le nouveau HTML est **servi**, **mis en cache** et
que les onglets sont **prévenus** ; `test-pwa.ts` vérifie que l'activation ne
masque pas l'invite ; `smoke-test.mjs` vérifie les en-têtes et le contenu de
`sw.js` sur le serveur réel.

### Trois autres pièges traités explicitement

**1. Le repli SPA.** Toutes les navigations arrivent sur des routes arbitraires
(`/tableau-de-bord`, `/quiz/…`) que le serveur résout en `index.html`. Ces URL ne
sont donc **jamais** dans le pré-cache, qui ne contient que `/` et
`/index.html`. Une correspondance exacte sur l'URL raterait à chaque fois et
attendrait le réseau — l'inverse du but. D'où la cascade :

```js
(await cache.match(request)) ?? (await cache.match('/index.html')) ?? (await cache.match('/'))
```

Détecté par `test-sw.ts`, pas par la relecture : le test mesure le temps de
réponse avec un réseau simulé à 800 ms et exige < 400 ms.

**2. `Cache-Control` sur `sw.js`.** Les statiques sont servis avec
`maxAge: 7d` en production. Un service worker caché 7 jours ne serait pas mis à
jour avant une semaine. `index.html`, `sw.js` et `manifest.webmanifest` portent
donc des noms **stables** et sont explicitement passés en `no-cache` (revalider
avant de servir, avec `304` quand rien n'a changé).

**3. `res.sendFile()` ignore `setHeaders`.** Le repli SPA n'applique pas
l'option du middleware statique : `/tableau-de-bord` renvoyait `max-age=0` quand
`/index.html` — le même document — renvoyait `no-cache`. Corrigé en posant
l'en-tête explicitement dans le gestionnaire de repli.

### Deux caches, deux durées de vie

```
edumate-shell-v<N>   versionné, purgé à chaque changement de VERSION
edumate-assets       nom STABLE, jamais purgé par le versionnage, borné à 80 entrées
```

Ne pas purger les assets est délibéré : une page ouverte avec un HTML en cache
doit pouvoir charger **ses** chunks après un redéploiement. Sans cela, l'élève
verrait « Impossible de charger un fichier de l'application » en pleine session.
Les noms étant hachés, deux versions ne peuvent pas entrer en collision ; la
croissance est bornée par `pruneAssets()` (éviction des plus anciennes, `keys()`
préservant l'ordre d'insertion).

### Session face à un serveur froid

Avant : `/api/auth/session` échouait → `status: 'anonymous'` → l'élève arrivait
sur la page d'accueil **avec un cookie de session toujours valide**. Le plus
trompeur des comportements possibles.

Après : `loadSessionWithRetry()` distingue l'échec **réseau** (`status === 0`,
`code === 'network' | 'timeout'`, ou `>= 500`) d'un refus d'authentification.
Seul le premier justifie de réessayer — sur 1,5 / 3 / 5 / 7 / 9 / 11 s, soit
~36 s de couverture, au-delà du pire cas de réveil. Un `401` bascule
immédiatement en anonyme sans insister.

Pendant les tentatives, `status` reste `'loading'` et `waking` passe à `true` :
les garde-routes affichent « Le serveur se réveille, nouvelle tentative N en
cours » au lieu d'un spinner muet. **Le cookie n'est jamais supprimé.**

### Réglages exposés

*Paramètres → Disponibilité & application installée* : maintien éveillé (activé
par défaut, mémorisé en `localStorage` car c'est un comportement lié à
l'appareil et non une donnée pédagogique), état du cache avec le détail par
nom, estimation du quota, et « Vider le cache et désactiver » en dépannage.

Un bandeau (`components/PwaBanner.tsx`, monté dans `App.tsx` hors des routes)
signale deux situations transitoires : nouvelle version en attente, et perte de
connexion.

---

## 7quinquies. Fil d'actualités, sondages et notifications

### Modèle de données

```
feed:index                  liste des identifiants, du plus récent au plus ancien
feed:<id>                   élément publié (actualité ou annonce de sondage)
poll:<id>                   sondage (question, options, compteurs, clôture)
pollvote:<pollId>:<userId>  options votées par un élève
feedread:<userId>           identifiants lus + date du « tout marquer lu »
```

Le fil est **global** : un seul exemplaire pour toute l'instance, car ce sont les
administrateurs qui publient. Seul l'état de lecture est personnel — écrire N
fois le même contenu pour N élèves gaspillerait le quota Upstash.

Bornes : 60 éléments au fil, 200 identifiants lus par élève, 8 options par
sondage.

### Comptage des non-lus

Un élément est non lu s'il n'est **pas** dans `readIds` **et** s'il est
postérieur au dernier `readAllAt`. La seconde condition évite de devoir
mémoriser l'intégralité des identifiants lus : après un marquage global,
l'historique ancien n'a plus besoin d'être retenu. La même règle est appliquée
côté serveur (`countUnread`) et côté client (`isUnread`) — d'où le partage de
`src/shared/` pour les constantes.

### Sondages : le point délicat

Voter n'est pas « ajouter 1 ». Un élève peut **changer d'avis**, donc :

```
compteurs = état courant
pour chaque option précédemment votée : −1
pour chaque nouvelle option           : +1
voters    : +1 uniquement si c'était le premier vote
```

Un simple incrémenterait doublement à chaque changement d'avis. Vérifié par test :
vote, changement de vote, second votant, puis clôture.

**Options inconnues → 400.** Un filtrage silencieux était dangereux : voter
`['inexistant']` produisait une liste vide, ce qui **annulait** le vote de
l'élève sans message et décrémentait un compteur. Un identifiant inconnu vient
d'un client désynchronisé ou d'une requête forgée — dans les deux cas il faut
répondre 400, pas modifier l'état.

### Notifications : trois niveaux

| Niveau | Fonctionne quand | Permission | Implémenté |
|---|---|---|---|
| Badge chiffré | toujours | aucune | ✅ |
| Notification de bureau | navigateur ouvert, **y compris onglet en arrière-plan** | explicite (`Notification.requestPermission`) | ✅ |
| Push Web (navigateur fermé) | toujours | VAPID + service de push | ❌ non implémenté |

Le niveau 3 introduirait un nouveau secret à gérer — exactement ce que le projet
cherche à éviter après l'incident de la clé Groq. Le modèle de données et le
polling sont prêts à l'accueillir.

Deux garde-fous sur le niveau 2 : la notification n'est émise **que si l'onglet
n'est pas visible** (sinon l'élève voit déjà le badge s'incrémenter), et un
`tag` unique remplace la bulle précédente au lieu d'en empiler dix.

### Écritures concurrentes

Comme le reste du projet, les écritures sont en « lecture → modification →
écriture » sans transaction. Deux votes simultanés sur la même option peuvent en
perdre un. À l'échelle d'un sondage de classe l'effet est négligeable, et le
documenter vaut mieux que de complexifier toute la couche de stockage.

---

## 7sexies. Calendrier : logique séparée du rendu

Tout le calcul de dates vit dans **`src/client/lib/calendar.ts`**, en fonctions
**pures** avec une date de référence injectable. Trois raisons :

1. **Testable** : 30 tests unitaires déterministes, rejouables n'importe quel
   jour. Un banc d'essai qui fige « aujourd'hui » échoue dès le lendemain —
   piège rencontré et corrigé pendant le développement de cette fonctionnalité.
2. **Cohérent** : le tableau de bord et l'outil Calendrier affichent la même
   urgence et le même compte à rebours. Deux implémentations divergeraient.
3. **Sûr sur les fuseaux** : toutes les conversions passent par
   `new Date(y, m, d)` (local) et jamais par `new Date('AAAA-MM-JJ')` (interprété
   **UTC** par la spécification, puis reconverti — ce qui décale d'un jour dans
   les fuseaux négatifs) ni par `toISOString().slice(0,10)` sur une date locale
   (bascule la veille après 22 h en été pour UTC+2).

Points notables :

- `buildMonthGrid()` renvoie **toujours 42 cases**, même pour un mois qui en
  nécessiterait 5 : la hauteur du calendrier ne change pas d'un mois à l'autre,
  donc aucun saut de mise en page à la navigation.
- `fromIsoDate()` **valide** la date : `2026-02-31` renvoie `null` au lieu de
  devenir silencieusement le 3 mars.
- `addMonths()` préserve le jour en le bornant (31 janvier + 1 mois → 28/29
  février, pas 3 mars).
- `weekNumber()` suit ISO 8601 (le 30/12/2024 appartient bien à la semaine 1 de
  2025).
- `urgencyOf()` ne classe jamais un événement **terminé** comme en retard.
- `buildIcs()` est écrit à la main (RFC 5545) : échappement des virgules,
  points-virgules et sauts de ligne ; `DTEND` exclusif pour les journées
  entières ; `DTEND = DTSTART + 1 h` pour les événements horaires, car certains
  agenda ignorent un événement sans fin.

**Règle d'ergonomie appliquée :** les événements **en retard** sont listés en
premier, et dans la colonne latérale aussi. Auparavant, un devoir en retard
tombé le mois précédent devenait **invisible** : la vue mensuelle n'affiche que
le mois courant et la colonne ne listait que l'avenir. Un calendrier ne doit
jamais faire disparaître ce qui est en attente.

---

## 8. Performances : règles à respecter

- Pages en `React.lazy` (déjà en place) : toute nouvelle page doit suivre le même schéma.
- Pas de nouvelle dépendance lourde sans justification (bundle actuel : ~25 ko gzip pour l'entrée).
- Animations courtes (< 450 ms), `transform`/`opacity` uniquement, `prefers-reduced-motion` respecté.
- Requêtes API : pas de polling ; rechargement explicite (`reload()`) après mutation.
- Images/icônes : SVG inline ou `lucide-react` (tree-shakable).

---

## 9. Tests

| Suite | Fichier | Vérifie |
|---|---|---|
| **Secrets** | `scripts/scan-secrets.mjs` | 🔐 Aucune clé d'API dans l'arbre **ni dans l'historique git** — évite le refus de push GitHub `GH013` |
| Publication | `publier.bat` | Vérifications Node/Git, fichiers `.env`, **scan des secrets**, catalogue, tests, build, réparation du dépôt, push avec récupération |
| Unitaire | `scripts/unit-test.ts` | Rendu riche (XSS, Markdown, LaTeX), formatage, validation, scrypt, JWT, progression, détection de langue, conjugaison, dérivation symbolique, normalisation des délimiteurs mathématiques, intégrité des familles |
| Contenu | `scripts/check-content.ts` | Les 1 316 sujets génèrent ≥ 5 questions valides, sans doublon ni valeur corrompue (le catalogue est régénéré automatiquement s'il est absent) |
| API | `scripts/smoke-test.mjs` | 98 contrôles de bout en bout sur un serveur réel |
| Base | `scripts/e2e-upstash.mjs` | 45 contrôles contre une base Upstash simulée : intégrité du dialogue Redis et coût en requêtes HTTP |
| Bundle | `scripts/check-bundle.mjs` | 10 contrôles : intégrité des assets, ordre d'évaluation des modules, poids initial < 400 Kio gzip |
| Rendu | `scripts/render-test.mjs` | 52 contrôles : chaque page montée dans jsdom, aucun incident React |
| Scripts Windows | `scripts/audit-scripts.py` | Les `.bat`/`.ps1` sont en ASCII pur + CRLF, parenthèses équilibrées, **aucune parenthèse dans un `REM` à l'intérieur d'un bloc**, étiquettes `goto` existantes |
| Modale | `scripts/test-modal-focus.ts` | 18 contrôles : le focus n'est jamais volé pendant la frappe, il ne tombe pas sur la croix, Échap et le piège à focus (Tab / Maj+Tab) fonctionnent |
| Étoiles | `scripts/test-stars.ts` | 40 contrôles : bornage, artefacts flottants, NaN, `total` nul, remplissage partiel, accessibilité |
| Musique | `scripts/test-music.ts` | 33 contrôles : les 9 ambiances, le chargement des stations, le passage local ↔ radio, le repli quand l'annuaire est injoignable |
| Calendrier (UI) | `scripts/test-calendar-ui.ts` | 77 contrôles : les trois vues, la navigation, la sélection d'un jour, les filtres, la recherche, la création validée, les raccourcis clavier, l'export `.ics`, la suppression confirmée, et le bloc « À venir » du tableau de bord (retards en premier, nom de matière résolu, action de complétion) |
| Règles de Hooks | `scripts/audit-hooks.py` | Aucun hook appelé après un retour anticipé — violation qui corrompt l'état du composant et n'est détectée ni par `tsc` ni par le build |
| Tableau interactif | `scripts/test-whiteboard.ts` | 30 contrôles : **absence de dérive** du canvas sur 40 observations successives, suivi d'un agrandissement réel puis stabilisation, changement de fond, sélection d'outil |
| Fil & sondages (API) | `scripts/test-feed.mjs` | 47 contrôles sur serveur réel : permissions, validation, vote et changement de vote, clôture, lecture, suppression en cascade |
| Fil & sondages (UI) | `scripts/test-feed-ui.ts` | 51 contrôles : badge chiffré et sa disparition, page du fil, vote en barres animées, retour arrière sur échec réseau, panneau d'administration |
| Service worker | `scripts/test-sw.ts` | 43 contrôles : `public/sw.js` est **exécuté** dans un environnement simulé (`self`, `caches`, `fetch`, `MessagePort`), puis ses gestionnaires sont déclenchés sur des requêtes synthétiques |
| PWA & session froide | `scripts/test-pwa.ts` | 43 contrôles : `lib/pwa.ts` (enregistrement, maintien éveillé, fusion des pings) et `loadSession` face à un serveur lent |
| IA | `scripts/verify-ai.mjs` | Assistant, coach de quiz et traduction répondent bien en mode IA (`offline: false`) sur le build de production |

Règle du projet : **aucune livraison sans `npm run test:all` au vert.**

### 🔐 Aucune clé d'API dans le dépôt

Les clés (IA, Upstash, session) proviennent **exclusivement** des variables
d'environnement. Trois raisons, toutes vérifiées :

1. **GitHub Push Protection refuse le push** (`GH013`) dès qu'une clé est
   détectée — et il analyse *tous* les commits, pas seulement le dernier.
2. **L'historique conserve la clé** : la supprimer du fichier ne suffit pas,
   il faut réécrire l'historique.
3. **Une clé publiée est compromise à vie** : elle doit être révoquée.

`npm run scan` reproduit ce contrôle en local, avant le push. `publier.bat`
l'exécute automatiquement à l'étape [5/9], y compris en mode `--rapide`.

Sans clé, EduMate n'est pas dégradé : le **tuteur intégré hors-ligne**
(`LocalTutor`), le **coach local** (`localCoachAnswer`) et **MyMemory**
prennent le relais, et l'interface signale honnêtement le mode utilisé.
