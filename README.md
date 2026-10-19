<div align="center">

# 🦉 EduMate

**L'espace scolaire tout-en-un des collégiens et lycéens.**

Aide aux devoirs assistée · **1 316 sujets de quiz** · progression détaillée · calendrier · minuteur · chronomètre · horloge · tableau interactif · traducteur · musique de concentration · personnalisation complète.

[![Node](https://img.shields.io/badge/Node.js-20%2B-3c873a)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-18-149eca)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178c6)](https://www.typescriptlang.org)
[![Express](https://img.shields.io/badge/Express-4-000000)](https://expressjs.com)
[![Licence](https://img.shields.io/badge/licence-MIT-blue)](#-licence)

**Un seul dépôt · un seul service · un seul process** : l'API Express et l'application React sont construites et servies ensemble, prêtes pour GitHub → Render.

</div>

---

## Sommaire

1. [Ce que fait EduMate](#-ce-que-fait-edumate)
2. [Choix techniques](#-choix-techniques)
3. [Architecture et structure du projet](#-architecture-et-structure-du-projet)
4. [Installation et lancement local](#-installation-et-lancement-local)
5. [Variables d'environnement](#-variables-denvironnement)
6. [Configurer Upstash (base de données)](#-configurer-upstash-base-de-données)
7. [Configurer l'intelligence artificielle](#-configurer-lintelligence-artificielle)
8. [Build et production](#-build-et-production)
9. [Déploiement GitHub → Render](#-déploiement-github--render) — guide pas à pas complet dans **[`docs/PUBLIER.md`](docs/PUBLIER.md)**
10. [Le catalogue de quiz : comment il fonctionne](#-le-catalogue-de-quiz--comment-il-fonctionne)
11. [Ajouter des quiz, des matières, des questions](#-ajouter-des-quiz-des-matières-des-questions)
12. [Comptes, rôles et administration](#-comptes-rôles-et-administration)
13. [Sécurité](#-sécurité)
14. [Tests](#-tests)
15. [Performance et accessibilité](#-performance-et-accessibilité)
16. [Commandes disponibles](#-commandes-disponibles)
17. [Dépannage](#-dépannage)
18. [Feuille de route](#-feuille-de-route)
19. [Licence](#-licence)

> 🧊 **Refonte visuelle « Liquid Glass » (v3.0)** : verre translucide, fond 3D
> vivant, thème sombre par défaut — documentation complète de livraison dans
> **[`docs/REFONTE-V3.md`](docs/REFONTE-V3.md)** (et captures `shots/v3-*.png`),
> complétée par **[`docs/REFONTE-V3.1.md`](docs/REFONTE-V3.1.md)** (fond fumée
> sombre, formes interactives au survol, correctifs boutons & héro).
> Historique : [`docs/REFONTE-V2.md`](docs/REFONTE-V2.md).

---

## ✨ Ce que fait EduMate

### 🤖 Aide aux devoirs (assistant pédagogique)
Six modes d'aide : **expliquer**, **reformuler**, **méthode**, **exercices**, **questions**, **corriger**. L'élève choisit sa matière et son niveau, pose sa question, reçoit une réponse structurée en Markdown avec formules LaTeX rendues (KaTeX). L'historique des conversations est conservé par compte.

L'assistant s'active avec **une seule variable d'environnement** :
- `AI_API_KEY` (Groq est gratuit : [console.groq.com](https://console.groq.com)) → réponses générées par le modèle. La clé reste **côté serveur**, jamais exposée au navigateur, et **jamais écrite dans le code** ;
- en cas d'indisponibilité momentanée du modèle, le **tuteur intégré** prend le relais : méthode pas à pas, rappels de cours exacts par matière, pièges à éviter et exercices générés par le moteur de quiz ;
- sans clé du tout, ce tuteur intégré assure à lui seul un fonctionnement complet ;
- `AI_PROVIDER` accepte `openai`, `groq`, `mistral`, `xai` (Grok) ou tout proxy compatible via `AI_BASE_URL`. S'il est vide, le fournisseur est **déduit du format de la clé** (`gsk_…` → groq, `xai-…` → xai, `sk-…` → openai).

> 🔐 **Pourquoi aucune clé n'est embarquée dans le dépôt ?** Une clé écrite dans le code est refusée au push par GitHub (*Push Protection*, erreur `GH013`), reste lisible dans l'historique git même après suppression, et doit être considérée comme définitivement compromise. Contrôle local avant publication : `npm run scan`.

### 🎯 Quiz (fonctionnalité majeure)
- **1 316 sujets jouables**, organisés en `MATIÈRE → NIVEAU → THÈME → SUJET → QUIZ`.
- **10 matières** : Mathématiques, Français, Physique-Chimie, SVT, Histoire-Géographie, Philosophie, Anglais, Espagnol, NSI, SES.
- **4 niveaux** : Troisième, Seconde, Première, Terminale.
- **229 thèmes** et **134 familles de générateurs**.
- **Coach IA post-quiz** : après chaque quiz, un chat explique comment trouver la bonne réponse à chaque question (méthodes, pièges, moyens mnémotechniques).
- Recherche plein texte, filtres (matière, niveau, thème, difficulté, favoris), tri, pagination, facette de résultats.
- Session de 5 à 30 questions, transitions animées, compteur, navigation par pastilles, sauvegarde locale (reprise après rafraîchissement), raccourcis clavier (`1`–`6`, `Entrée`, `Échap`).
- **Correction calculée par le serveur** : les bonnes réponses ne transitent jamais dans le navigateur avant la fin. Bilan animé (anneau de score, confettis), correction détaillée question par question avec explication.

### 📖 Leçons interactives & révisions
Chaque sujet du catalogue possède une **leçon jouable** (`/lecons`) : un parcours animé, étape par étape, pensé comme un jeu —

1. **Mission** : accroche ludique + objectifs ;
2. **Méthode pas à pas** : les gestes qui marchent, numérotés (option : réécriture **sur mesure par l'IA**, mise en cache) ;
3. **Exemples guidés** : un énoncé réel, puis la solution qui se déroule ligne par ligne ;
4. **Exercices intégrés** : correction immédiate (vert/rouge, secousse, confettis), score ⭐ et série 🔥 ;
5. **Piège classique** : l'erreur à ne plus faire ;
6. **Récapitulatif** : les points clés à retenir + l'astuce du coach.

Après chaque quiz, le bouton **« 📖 Réviser ce quiz »** ouvre la **révision interactive** : tes réussites sont célébrées, puis chaque erreur est corrigée pas à pas (ta réponse, la bonne, l'explication découpée en étapes) et suivie d'un **exercice de rattrapage** sur la même notion. Le tableau de bord affiche une carte **« À réviser »** dont la liste est **intégralement visible, sans défilement interne** (10 sujets fragiles au plus, au-delà un lien renvoie vers « Progression »).

Les leçons couvrent **les 1 316 sujets** : 134 fiches pédagogiques (une par famille de questions) + exemples et exercices issus des générateurs du catalogue, déterministes par graine. Sans compte ou sans historique, la révision bascule en **session d'entraînement** : la page n'est jamais vide.

### 📈 Progression
Score, taux de réussite, séries de jours, temps de travail, réussite par matière (barres + camembert), activité quotidienne sur 7/14/30 jours, sujets **maîtrisés** (≥ 2 tentatives et ≥ 80 %) et sujets **à revoir**, historique des 50 dernières tentatives, maîtrise détaillée par sujet.

### 🧰 Outils
| Outil | Fonctionnalités |
|---|---|
| **Horloge** | Analogique (SVG) + numérique, date en français, jour de l'année, numéro de semaine, fuseau, heure UTC |
| **Minuteur** | Durée personnalisée, 6 préréglages, démarrage/pause/reprise/réinitialisation, +1 min, **mode pomodoro enchaîné** (25/5, grande pause toutes les 4 sessions), carillon de fin synthétisé, titre d'onglet dynamique |
| **Chronomètre** | Précision au centième, tours intermédiaires, meilleur/plus lent tour, raccourcis `Espace`/`L`/`R` |
| **Tableau interactif** | Crayon, surligneur, gomme, trait, flèche, rectangle, cercle, texte, 8 couleurs + sélecteur, 5 épaisseurs, fond uni/quadrillé/ligné, **annuler/rétablir**, export PNG, tactile et souris. Dimensionnement stable : le canvas est en `position: absolute` dans un cadre à hauteur fixe, donc aucune boucle de croissance |
| **Calendrier** | **Trois vues** (Mois, Semaine, Agenda groupé par jour) · **compte à rebours** sur chaque échéance (« dans 36 min », « Demain », « Retard de 4 j ») · panneau du jour · 4 types avec sélecteur visuel · matière, heure, notes, état « fait » · **filtres multi-types** + masquage des terminés · **recherche** insensible aux accents · **dupliquer** un événement · **export `.ics`** (sans dépendance) · numéros de semaine ISO · **raccourcis clavier** (`←`/`→`, `T`, `N`, `/`, `1`/`2`/`3`, `Échap`) · mises à jour optimistes avec retour arrière · responsive jusqu'au mobile |
| **Traducteur** | 15 langues, détection automatique, traduction à la volée, inversion des langues, copie, synthèse vocale |
| **Devoirs (barre supérieure)** | Pastille compacte à côté de Musique : liste des devoirs à faire triée par échéance, **case à cocher** avec mise à jour optimiste, ajout en un champ, suppression, badge chiffré, lien « Tout gérer » |
| **Musique** | **9 ambiances** : 6 en **vraies webradios** (lo-fi, piano, classique, jazz, nappe atmosphérique, chillout — annuaire libre Radio Browser, sans clé d'API) et 3 **générées** par le navigateur (pluie, vagues, forêt). Lecture/pause, volume, station ou ambiance suivante/précédente, choix direct d'une station, visualiseur, bascule automatique si un flux tombe puis repli sur la musique générée, préférence mémorisée |

### 📣 Fil d'actualités, sondages et notifications
Un onglet **« Fil & sondages »** (`/fil`), alimenté depuis le panneau d'administration :

- **Actualités** : titre, contenu en Markdown léger (le HTML est **échappé** par `renderRichText`, un administrateur ne peut donc pas injecter de script chez les élèves), importance (`Information` / `Nouveauté` / `Important`), lien interne facultatif.
- **Sondages** : question, 2 à 8 réponses, choix unique ou multiple, clôture manuelle. Résultats en **barres animées** avec pourcentages, et possibilité de **changer de vote** tant que le sondage est ouvert (le serveur décrémente l'ancien choix et n'augmente le nombre de participants qu'une fois).
- **Badge rouge chiffré** sur l'onglet, dans la barre supérieure et la barre latérale : il indique le nombre d'éléments non lus et **rebondit à chaque changement**. Il se met à jour tout seul (interrogation légère toutes les 3 min + au retour sur l'onglet), sans recharger la page.
- **Notifications de bureau** via l'API `Notification` : elles se déclenchent quand l'onglet est en arrière-plan, sur permission explicite demandée depuis la page du fil.

⚠️ **Limite honnête** : une notification quand le navigateur est **complètement fermé** exigerait le Push Web (clés VAPID + service de push). Ce n'est pas implémenté, pour ne pas réintroduire un secret à gérer. Le badge et le polling couvrent le cas réel — pendant une session de travail, l'onglet est ouvert.

**Coût mesuré** : l'interrogation du badge (`/api/feed/unread`) ne renvoie que deux nombres, soit ~2 commandes Upstash par passage → ~960/jour à 3 min d'intervalle, très loin du quota gratuit de 10 000.

### 📲 Application installable & démarrage instantané
EduMate est une **PWA** : installable sur téléphone, tablette ou ordinateur, et l'interface est conservée sur l'appareil.

Concrètement, sur l'hébergement gratuit le conteneur s'endort après ~15 min d'inactivité et le premier accès peut prendre ~30 s. Deux réponses complémentaires :

1. **Le service worker** met l'interface en cache. Elle s'affiche **immédiatement** (mesuré : 1 ms contre 800 ms de réseau simulé), pendant que le serveur se réveille en tâche de fond. Un écran « Le serveur se réveille… » remplace l'ancien faux message de déconnexion.
2. **Le maintien éveillé** (réglable dans *Paramètres*) envoie une requête discrète toutes les 9 minutes **tant que l'onglet est ouvert** : pendant une session de travail, plus aucune attente.

⚠️ **Honnêteté sur les limites** : un service worker s'exécute dans le navigateur, il ne peut **pas** empêcher Render de s'endormir. Le maintien éveillé ne fonctionne qu'onglet ouvert — une visite le lendemain subira toujours le réveil (mais l'interface, elle, s'affichera instantanément).

🔁 **Fraîcheur après un redéploiement** : le HTML est servi en **réseau d'abord** (délai de 2,5 s avant de retomber sur le cache), la coquille est stockée sous une **clé unique**, et le service worker **détecte tout changement de version** pour afficher « Nouvelle version disponible — Recharger ». Concrètement : après un push sur GitHub, tu obtiens la nouvelle version au chargement suivant, sans jamais avoir à vider le cache manuellement.

**L'API n'est jamais mise en cache** : scores, session et progression passent systématiquement par le réseau. Une règle vérifiée par test automatisé.

### 🎨 Expérience
Onboarding animé en **8 à 9 étapes** (une seule question à la fois, progression visuelle, retour arrière, validation immédiate, autocomplétion des établissements via l'open data de l'Éducation nationale), thème clair/sombre/système, 10 couleurs d'accent, densité confort/compacte, animations désactivables, transitions de pages, micro-interactions, notifications toast, responsive desktop/tablette/mobile.

---

## 🧱 Choix techniques

| Besoin | Solution retenue | Pourquoi |
|---|---|---|
| Application | **React 18 + TypeScript + Vite** | Build rapide, typage fiable, écosystème stable |
| API | **Express 4** (TypeScript) | Minimal, robuste, sert aussi le frontend : **un seul process** |
| Base de données | **Upstash Redis** (API REST) | Gratuit, sans serveur, persistant, compatible Render. Appel via `fetch` : **zéro dépendance** |
| Repli sans base | Fichier JSON local ou mémoire | Le projet démarre et se teste **sans aucune configuration** |
| Authentification | Cookie httpOnly + **JWT HS256 signé maison** (`node:crypto`) | Session persistante, aucune dépendance `jsonwebtoken` |
| Mots de passe | **scrypt** (`node:crypto`) + sel aléatoire + comparaison temps constant | Robuste, natif, jamais de clair |
| Animations | **Framer Motion** + CSS | Fluides, interrompibles, `prefers-reduced-motion` respecté |
| Mathématiques | **KaTeX** | Rendu LaTeX rapide et hors-ligne |
| Icônes | **lucide-react** | Tree-shakable, cohérent |
| Graphiques | **Recharts** | Déclaratif, responsive |
| État | **Zustand** | 1 ko, sans provider ni boilerplate |
| Musique | **Web Audio API** (génération) | 100 % libre de droit, aucun fichier, aucune licence |
| Traduction | **Assistant IA intégré** (repli MyMemory) via proxy serveur | Qualité supérieure, sans quota quotidien |
| Musique | **Radio Browser** (annuaire libre, ~40 000 stations) via proxy serveur | Webradios réelles, **sans clé d'API** ; le flux audio est lu directement par le navigateur |
| Lycées | **data.education.gouv.fr** (open data) via proxy serveur | Annuaire officiel gratuit, sans clé |
| IA | **Groq** — OpenAI / Mistral / xAI / proxy en option | Une seule variable (`AI_API_KEY`), aucune clé dans le dépôt ; repli automatique sur le tuteur intégré |

### Services externes : pourquoi seulement quatre ?
EduMate évite au maximum les dépendances externes. Quatre services gratuits **sans clé** sont utilisés, toujours via un proxy serveur (pas de CORS, cache mémoire, dégradation propre) :
1. **L'assistant IA (Groq par défaut)** — aide aux devoirs, coach de quiz et traduction de haute qualité. La clé se configure par variable d'environnement. Repli automatique sur le tuteur intégré / MyMemory en cas d'indisponibilité.
2. **MyMemory** — traduction de secours : embarquer un dictionnaire multilingue est irréaliste.
3. **data.education.gouv.fr** — annuaire des ~60 000 établissements français : données publiques volumineuses.
4. **Radio Browser** — annuaire libre de ~40 000 webradios : impossible d'embarquer des flux audio dans le dépôt. Seule la *recherche* passe par le serveur ; la lecture du flux se fait directement du navigateur vers la station (sinon chaque heure d'écoute transiterait par l'instance Render).

Tous les trois sont **optionnels** : s'ils sont injoignables, l'application affiche un message clair et continue de fonctionner (saisie libre pour le lycée, tuteur hors-ligne, etc.).

---

## 🗂️ Architecture et structure du projet

```
EDUMATE (1 dépôt, 1 service Render)
│
├── src/
│   ├── client/                  FRONTEND (React + Vite)
│   │   ├── index.html           point d'entrée HTML
│   │   ├── main.tsx             bootstrap React + styles
│   │   ├── App.tsx              routes et garde-fous
│   │   ├── components/
│   │   │   ├── layout/          Sidebar, AppShell, Topbar, recherche globale
│   │   │   ├── ui/              Button, Card, Field, Modal, Toasts, Badge, Feedback
│   │   │   ├── quiz/            TopicCard
│   │   │   └── tools/           ToolShell (mise en page des outils)
│   │   ├── pages/               1 page = 1 écran (dashboard, quiz, assistant…)
│   │   │   └── tools/           horloge, minuteur, chrono, tableau, calendrier…
│   │   ├── lib/                 api.ts, store.ts, richtext.ts, music.ts,
│   │   │                        format.ts, hooks.ts, data.ts
│   │   ├── routes/guards.tsx    RequireAuth / GuestOnly / RequireAdmin
│   │   └── styles/              base.css, components.css, layout.css
│   │
│   ├── server/                  BACKEND (Express + API)
│   │   ├── index.ts             création de l'app, démarrage, SPA fallback
│   │   ├── routes/              auth, quiz, progress, organize, tutor,
│   │   │                        services, admin
│   │   ├── lib/                 config, storage (Upstash/fichier/mémoire),
│   │   │                        store (données), auth (scrypt + JWT),
│   │   │                        middleware (erreurs, CSRF, rate limit),
│   │   │                        validation, validate, ai, catalog, languages
│   │   └── content/             MOTEUR PÉDAGOGIQUE
│   │       ├── index.ts         registre des familles + fabrique de questions
│   │       ├── types.ts         contrat QuestionFamily
│   │       ├── lib.ts           RNG déterministe, QCM, formatage FR
│   │       ├── symbolic.ts      AST math : évaluation, dérivation, LaTeX
│   │       ├── banks.ts         chargeur des banques JSON
│   │       ├── meta.ts          matières, niveaux, thèmes
│   │       ├── topics.ts        CATALOGUE (1 ligne = 1 sujet de quiz)
│   │       ├── expansions/      déclinaisons systématiques (maths, langues,
│   │       │                    connaissances)
│   │       ├── families/        math.ts, physics.ts, languages.ts, knowledge.ts
│   │       └── data/            french.ts, chemistry.ts, knowledge.ts, languages.ts
│   │
│   └── shared/types.ts          types partagés frontend ↔ backend
│
├── data/
│   ├── quiz/*.json              banques de questions rédigées (18 banques)
│   └── generated/catalog.json   catalogue compilé (généré, non commité)
│
├── public/                      favicon, icônes PNG, manifest PWA
├── scripts/
│   ├── build-catalog.ts         génère data/generated/catalog.json
│   ├── check-content.ts         contrôle qualité de TOUS les sujets
│   ├── unit-test.ts             tests unitaires des modules critiques
│   ├── smoke-test.mjs           test de bout en bout de l'API (81 contrôles, Node)
│   ├── render-test.mjs          test de rendu de toutes les pages (40 contrôles)
│   ├── dev.mjs                  lanceur API + Vite (sans dépendance externe)
│   ├── make-zip.mjs             archive de livraison (ZIP, Node)
│   ├── make-icons.mjs           génère les icônes PNG (Node)
│
├── tests/
│   ├── render-entry.tsx         expose les pages au test de rendu
│   └── vite.render.config.ts    build du bundle de test
│
├── render.yaml                  configuration Render « as code »
├── vite.config.ts               build frontend + proxy /api
├── vite.server.config.ts        build du serveur (bundle ESM)
├── tsconfig.json
├── .env.example                 toutes les variables, sans aucun secret
└── package.json
```

### Flux de données

```
Navigateur (React SPA)
    │  fetch /api/*  (cookie httpOnly + en-tête X-CSRF-Token)
    ▼
Express (1 process) ──────────────► dist/client/*  (fichiers statiques)
    │
    ├── Moteur pédagogique (quiz, correction)      → en mémoire, aucun I/O
    ├── Fournisseur IA (facultatif)                → HTTPS
    ├── MyMemory / open data (facultatifs)         → HTTPS + cache
    └── Couche Storage (contrat unique)
            ├── Upstash Redis  (production)        → HTTPS REST
            ├── Fichier JSON   (développement)
            └── Mémoire        (tests, démo)
```

---

## 📤 Publier sur GitHub en un clic (Windows)

Le dépôt contient **`publier.bat`** : un script autonome qui vérifie tout, construit, teste et pousse sur GitHub.

```bat
cd C:\chemin\vers\edumate
publier.bat
```

Ce qu'il fait, dans l'ordre :
1. vérifie la présence de **Node.js** et **Git** (message clair s'ils manquent),
2. vérifie qu'il est bien à la racine du projet (`package.json`),
3. **sécurité** : refuse de publier si un `.env` n'est pas ignoré ou est déjà suivi par Git,
4. installe les dépendances si besoin,
5. lance les **tests** (unitaires + contenu) et le **build complet**,
6. crée ou **répare** le dépôt Git (init, identité, branche `main`, `core.longpaths`),
7. crée ou vérifie le **remote `origin`** (il te demande l'URL si absente),
8. commite et pousse, avec **récupération automatique** des cas classiques :
   branche distante `master`, historiques divergents (dépôt recréé, ZIP ré-extrait),
   absence de branche amont.

> Toute étape en échec **arrête la publication** : on ne pousse jamais du code qui ne compile pas.
> Pour publier sans relancer les tests : `publier.bat --rapide`.

Sur macOS/Linux, l'équivalent manuel :
```bash
npm install && npm run build && npm test
git add . && git commit -m "mise à jour" && git push
```

---

## 🚀 Installation et lancement local

**Prérequis** : [Node.js 20+](https://nodejs.org) (npm inclus). Aucun autre outil n'est nécessaire : les scripts de test, d'archivage et d'icônes sont en Node (Windows/macOS/Linux).

```bash
# 1. Récupérer le projet
git clone https://github.com/TON_COMPTE/edumate.git
cd edumate

# 2. Installer les dépendances
npm install

# 3. (Recommandé) préparer l'environnement
cp .env.example .env          # puis éditer .env si besoin — aucune clé n'est obligatoire

# 4. Générer le catalogue pédagogique
npm run build:data

# 5. Lancer en développement
npm run dev
```

Ouvre ensuite **http://localhost:5173** (l'API tourne sur http://localhost:8787 et Vite proxifie `/api`).

> **Aucune configuration n'est obligatoire pour démarrer.** Sans `AI_API_KEY`, le tuteur intégré hors-ligne et MyMemory assurent l'assistant, le coach de quiz et le traducteur. Sans `UPSTASH_*`, EduMate utilise un stockage en mémoire : les comptes sont alors temporaires.
>
> Pour activer l'IA générative : `cp .env.example .env` puis renseigne `AI_API_KEY`. Le fichier `.env` est ignoré par git — **n'écrit jamais une clé dans un fichier du dépôt** (`npm run scan` le vérifie).

### Premier compte
1. Clique sur **« Créer mon espace »** : le parcours guidé de 8 à 9 étapes se lance.
2. Le compte de démonstration partagé est **désactivé par défaut** (`ALLOW_DEMO_ACCOUNT=false`) : sur une instance réelle, ce compte anonyme mélange la progression de tous les visiteurs. Pour une démonstration ponctuelle, passe la variable à `true` — le bouton « Explorer avec le compte de démonstration » réapparaît alors de lui-même.
3. Le **premier compte créé sur une base vide devient administrateur** et débloque la page `/admin`. Tu peux aussi nommer des administrateurs avec `ADMIN_EMAIL=ton@email.fr` (plusieurs adresses séparées par des virgules) : la promotion prend effet à la connexion, sans redémarrage ni manipulation de la base.

---

## 🔐 Variables d'environnement

Copie `.env.example` en `.env` pour le développement ; sur Render, renseigne-les dans l'onglet **Environment**. **Aucun secret n'est présent dans le code ni dans le dépôt.**

| Variable | Obligatoire | Défaut | Rôle |
|---|---|---|---|
| `PORT` | non (Render la fournit) | `8787` | Port HTTP |
| `NODE_ENV` | non | `development` | `production` active les cookies `Secure` et masque les traces |
| `APP_URL` | non | — | URL publique (cookies cross-domaine éventuels) |
| `SESSION_SECRET` | **oui en production** | valeur de dev | Secret de signature des jetons de session |
| `SESSION_MAX_AGE` | non | `7d` | Durée de session (`7d`, `12h`, `30m`…) |
| `UPSTASH_REDIS_REST_URL` | recommandé | — | URL REST de la base Upstash |
| `UPSTASH_REDIS_REST_TOKEN` | recommandé | — | Token REST Upstash |
| `UPSTASH_KEY_PREFIX` | non | `edumate` | Préfixe de clés (partage de base entre environnements) |
| `FALLBACK_STORAGE` | non | `memory` | Repli sans Upstash : `memory` ou `file` |
| `STORAGE_FILE_DIR` | non | `./data/local` | Répertoire du stockage fichier |
| `AI_PROVIDER` | non | déduit de la clé | `openai`, `groq`, `mistral`, `xai` ou `none` |
| `AI_API_KEY` | non | *(vide)* | Clé de l'assistant. **Uniquement en variable d'environnement** : `.env` en local, Render en production |
| `AI_MODEL` | non | Groq `openai/gpt-oss-120b` · OpenAI `gpt-4o-mini` · xAI `grok-4-fast` | Modèle utilisé |
| `AI_BASE_URL` | non | selon fournisseur | Proxy/serveur compatible OpenAI |
| `AI_MAX_TOKENS` | non | `900` | Longueur maximale de réponse |
| `TRANSLATE_PROVIDER` | non | `mymemory` | Fournisseur de repli de la traduction (après l'IA) |
| `SCHOOLS_PROVIDER` | non | `dataeducation` | Mettre autre chose désactive l'annuaire des lycées |
| `EXTERNAL_TIMEOUT_MS` | non | `9000` | Timeout des appels externes |
| `RATE_LIMIT_MAX` | non | `900` | Requêtes/minute par IP |
| `AUTH_RATE_LIMIT_MAX` | non | `90` | Requêtes d'authentification/minute par IP |
| `ALLOW_DEMO_ACCOUNT` | non | `false` | Compte de démonstration partagé. **Désactivé par défaut** : sur une instance réelle, ce compte anonyme mélange la progression de tous les visiteurs. À `false`, un compte démo déjà présent en base est supprimé au démarrage |
| `ADMIN_EMAIL` | non | — | Adresses administrateurs, séparées par des **virgules** : chacune est promue (créée si `ADMIN_PASSWORD` est fourni) |
| `ADMIN_PASSWORD` | non | — | Mot de passe du compte administrateur créé au démarrage (avec `ADMIN_EMAIL`) |
| `ADMIN_FIRST_NAME` | non | `Admin` | Prénom du compte administrateur créé au démarrage |

**Générer un `SESSION_SECRET` robuste :**
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

---

## 🗄️ Configurer Upstash (base de données)

Upstash Redis est gratuit jusqu'à 10 000 commandes/jour et fonctionne parfaitement avec Render (le disque de Render n'étant **pas persistant**, SQLite ou le stockage fichier y sont inutilisables en production).

1. Crée un compte sur [console.upstash.com](https://console.upstash.com) (plan gratuit).
2. **Create Database** → région proche de ton service Render (ex. `eu-central-1` si Render est à Francfort).
3. Ouvre la base, section **REST API** (ou `.env` Upstash) et copie :
   - `UPSTASH_REDIS_REST_URL` → `https://xxxx.upstash.io`
   - `UPSTASH_REDIS_REST_TOKEN` → `AXxxxxxxxx...`
4. Renseigne ces deux variables dans Render (ou dans ton `.env` local).
5. Redémarre : la console affiche `[EduMate] Base de données : Upstash Redis ✔`.

**Fiabilité de la couche Upstash** (implémentée dans `src/server/lib/storage.ts`) :
- **nouvelles tentatives** avec recul exponentiel sur les erreurs transitoires (réseau, 429, 5xx) ;
- **disjoncteur** : après 4 échecs, les requêtes sont suspendues 15 s pour ne pas marteler la base ni épuiser le quota, puis tentative de rétablissement automatique ;
- **requêtes groupées** (pipeline REST) : la liste des comptes se lit en **un seul** aller-retour HTTP au lieu de N ;
- **erreurs traduites** : une base injoignable renvoie un `503` avec un message simple (« Tes données sont momentanément inaccessibles… »), jamais une trace technique ;
- **diagnostic** : `/api/health` expose `databaseReady`, `databaseLatencyMs`, `databaseError`, `databaseNotice` et le compteur d'opérations.

**Vérification** : `GET /api/health` renvoie `"database": "upstash"` et `"databaseReady": true`.
**Exploration** : dans la console Upstash → *Data Browser*, tu verras les clés préfixées `edumate:` (`user:<id>`, `progress:<id>:attempts`, `calendar:<id>`, `favorites:<id>`, `tutor:<id>`, `users:index`…).

**Modèle de données** (JSON documenté, sans schéma rigide, pensé pour évoluer) :

| Clé | Contenu |
|---|---|
| `edumate:user:<uuid>` | profil, préférences, `passwordHash`, rôle |
| `edumate:email:<e-mail>` | index e-mail → identifiant |
| `edumate:users:index` | liste des identifiants (administration) |
| `edumate:progress:<uuid>:attempts` | 500 dernières tentatives de quiz |
| `edumate:favorites:<uuid>` | sujets favoris |
| `edumate:calendar:<uuid>` | événements (500 max) |
| `edumate:tasks:<uuid>` | tâches (300 max) |
| `edumate:tutor:<uuid>` | 40 dernières conversations |

> Les listes sont bornées : aucune clé ne peut croître indéfiniment.

---

## 🧠 Configurer l'intelligence artificielle

L'appel IA passe **exclusivement par le backend** : la clé n'atteint jamais le navigateur.

### Option A — Groq (recommandé : gratuit et rapide)
```env
AI_PROVIDER=groq
AI_API_KEY=gsk_xxxxxxxxxxxxxxxx
AI_MODEL=llama-3.3-70b-versatile      # facultatif
```
Clé gratuite sur [console.groq.com](https://console.groq.com).

### Option B — OpenAI
```env
AI_PROVIDER=openai
AI_API_KEY=sk-xxxxxxxxxxxxxxxx
AI_MODEL=gpt-4o-mini                  # facultatif
```

### Option C — Mistral AI
```env
AI_PROVIDER=mistral
AI_API_KEY=xxxxxxxxxxxxxxxx
AI_MODEL=mistral-large-latest
```

### Option D — Serveur compatible OpenAI (proxy, Ollama, Azure…)
```env
AI_PROVIDER=openai
AI_BASE_URL=https://mon-proxy.exemple.com/v1
AI_API_KEY=ma-cle
AI_MODEL=mon-modele
```

### Option E — Aucune clé (`AI_PROVIDER=none`)
EduMate utilise le **tuteur intégré** : il détecte la matière, fournit les rappels de cours exacts, une méthode pas à pas, les pièges classiques et des exercices générés par le moteur de quiz. La réponse indique clairement le mode hors-ligne.

**Changer de fournisseur ne demande aucune modification de code** : une seule variable. Le point d'entrée unique est `src/server/lib/ai.ts` (`TutorProvider`), et un **repli automatique** sur le tuteur intégré se déclenche si l'API échoue (quota, réseau, modèle indisponible).

---

## 📦 Build et production

```bash
npm run build      # catalogue + vérification des types + build client + build serveur
npm start          # node dist/server/index.js
```

Le serveur produit sert **à la fois** l'API (`/api/*`) et le frontend (`dist/client`) : un seul port, un seul process, aucun CORS. Les assets sont mis en cache 7 jours, `index.html` jamais (déploiements immédiats). La compression gzip est active.

Vérification rapide :
```bash
curl http://localhost:8787/api/health
```

---

## ☁️ Déploiement GitHub → Render

### 1. Mettre le projet sur GitHub
```bash
cd edumate
git init
git add .
git commit -m "feat: EduMate — plateforme éducative tout-en-un"
git branch -M main
git remote add origin https://github.com/TON_COMPTE/edumate.git
git push -u origin main
```
Le `.gitignore` fourni exclut déjà `node_modules/`, `dist/`, `.env`, `data/local/`, `data/generated/` et les archives. **Vérifie qu'aucun `.env` n'est commité** : `git status`.

### 2. Créer le service Render
**Méthode automatique (recommandée)** — le dépôt contient un `render.yaml` :
1. Render → **New +** → **Blueprint** → sélectionne ton dépôt.
2. Render lit `render.yaml` et crée le service `edumate` avec build, start command, health check et variables.
3. Renseigne les variables marquées `sync: false` (Upstash, IA) puis **Apply**.

**Méthode manuelle** — **New +** → **Web Service** :

| Champ | Valeur |
|---|---|
| Repository | ton dépôt GitHub |
| Runtime | **Node** |
| Region | Francfort (`eu-central-1`) — à aligner avec Upstash |
| Branch | `main` |
| **Build Command** | `npm ci --include=dev && npm run build` |
| **Start Command** | `npm start` |
| Instance Type | Free |
| **Health Check Path** | `/api/health` |
| Auto-Deploy | Yes |

### 3. Variables d'environnement Render
Onglet **Environment** → *Add Environment Variable* :

```
NODE_ENV=production
PORT=10000                       # Render injecte sa propre PORT ; valeur indicative
SESSION_SECRET=<générée>         # Render peut la générer : « Generate value »
UPSTASH_REDIS_REST_URL=<url>
UPSTASH_REDIS_REST_TOKEN=<token>
AI_PROVIDER=groq                 # ou none
AI_API_KEY=<clé>
APP_URL=https://edumate.onrender.com
ALLOW_DEMO_ACCOUNT=true
FALLBACK_STORAGE=memory
```

### 4. Premier déploiement
Chaque `git push` sur `main` déclenche un build puis un déploiement. Les logs affichent :
```
🦉 EduMate est prêt
   Base de données : upstash
   IA              : groq
   Catalogue       : 1316 sujets / 1316 jouables
```

> **Plan gratuit Render** : le service s'endort après 15 min d'inactivité (réveil en ~30 s) et le disque est éphémère — c'est précisément pourquoi Upstash est utilisé pour les données.

---

## 🎯 Le catalogue de quiz : comment il fonctionne

Le catalogue est **séparé de l'interface** : rien n'est codé en dur dans les composants React.

```
src/server/content/
├── meta.ts          matières (10) + niveaux (4) + palette visuelle par matière
├── topics.ts        sujets écrits à la main  → 1 ligne = 1 sujet
├── expansions/      sujets générés par tables (maths, langues, connaissances)
├── families/        134 familles de générateurs (math, physics, languages, knowledge)
├── data/            corpus de connaissances vérifiés (conjugaison, histoire, chimie…)
└── banks.ts         charge data/quiz/*.json (questions rédigées)
        │
        ▼   npm run build:data
data/generated/catalog.json   ← lu par l'API au démarrage (aucun calcul)
```

### Deux types de sources de questions

**1. Familles algorithmiques** (variation infinie, réponses calculées)
Exemples : calcul numérique, fractions, pourcentages, équations, **dérivation via un moteur symbolique maison** (AST : évaluation, dérivation, simplification, rendu LaTeX), vecteurs, probabilités, suites, intégrales, nombres complexes, lois de Newton, loi d'Ohm, stœchiométrie, pH, **conjugaison française/espagnole par tables exactes**, verbes irréguliers anglais, bases binaires/hexadécimales, tables de vérité, complexité algorithmique, traces de code Python…

**2. Banques rédigées** (`data/quiz/*.json`)
Pour les contenus qui ne s'inventent pas : méthodologie du commentaire, de la dissertation, de la contraction de texte, de l'oral du bac, EMC, analyse de document, croquis de géographie, oxydoréduction, chimie organique, méthode de la dissertation en SES et en philosophie. **18 banques, 130 questions**, toutes avec explication.

### Contrôle qualité intégré
`npm run test:content` vérifie **les 1 316 sujets** : existence de la famille, génération d'au moins 5 questions valides, énoncé non vide, propositions sans doublon, index de réponse dans les bornes, explication présente, absence de valeurs corrompues (`undefined`, `NaN`…). Toute erreur fait échouer la commande.

### Anti-triche
Les questions sont générées à partir d'une **graine** ; la même graine reproduit exactement la même session. Le client envoie ses réponses, le serveur **régénère** les questions et **recalcule** le score : impossible de s'auto-attribuer un résultat. Les bonnes réponses et explications ne sont jamais envoyées avant la correction.

---

## ➕ Ajouter des quiz, des matières, des questions

### Ajouter un sujet de quiz (le cas le plus fréquent)
Une ligne dans `src/server/content/topics.ts` :
```ts
T('mathematiques', 'seconde', 'Fonctions', 'Image et antécédent', 'math.function.value', 'facile')
//  matière          niveau    thème          nom affiché            famille                difficulté
```
Avec paramètres pour cibler un comportement :
```ts
T('francais', 'seconde', 'Conjugaison', 'Subjonctif présent (3e groupe)',
  'fr.conjugaison', 'difficile', { tense: 'subjonctif', group: 3 })
```
Puis :
```bash
npm run build:data && npm run test:content
```

### Ajouter une famille de générateurs
1. Crée la famille dans `src/server/content/families/<matiere>.ts` :
```ts
export const maFamille: QuestionFamily = {
  id: 'math.mafamille',
  label: 'Ma famille',
  pool: Infinity,                       // ou un nombre / une fonction(params)
  make(ctx) {
    const { rng, topicId } = ctx;
    const a = rng.int(2, 9);
    return qcm({
      topicId,
      prompt: `Calculer $${a} + 1$`,
      correct: String(a + 1),
      distractors: [String(a), String(a + 2), String(a + 3)],
      explanation: `${a} + 1 = ${a + 1}.`,
      difficulty: 'facile',
      skill: 'Addition',
      rng,
    });
  },
};
```
2. Ajoute-la au tableau exporté du fichier (ex. `MATH_FAMILIES`).
3. Référence-la dans `topics.ts`. **C'est tout** : le registre l'agrège automatiquement.

### Ajouter une banque de questions rédigées
Crée/édite un fichier `data/quiz/<matiere>.json` :
```json
{
  "banks": [
    {
      "topic": "francais-seconde-methode-commentaire",
      "questions": [
        {
          "prompt": "Quelle est la démarche d'un commentaire ?",
          "options": ["Décrire, expliquer, interpréter en citant", "Raconter l'histoire", "Donner son avis", "Résumer"],
          "answer": 0,
          "explanation": "Le commentaire analyse des procédés, il ne résume pas.",
          "skill": "Méthode",
          "difficulty": "moyen"
        }
      ]
    }
  ]
}
```
`answer` est l'index de la bonne réponse ; les propositions sont **mélangées automatiquement** à chaque partie. Trois formats sont acceptés : `options`+`answer` (QCM), `truth` (vrai/faux), `accept` (réponse libre).

### Ajouter une matière
1. `src/server/content/meta.ts` → tableau `SUBJECTS` (nom, emoji, couleurs, motif) et `SUBJECTS_BY_LEVEL`.
2. `src/server/content/topics.ts` → tes sujets.
3. `npm run build:data`.
L'interface (navigation, filtres, cartes, thèmes visuels, statistiques) **s'adapte automatiquement** : rien à modifier côté React.

### Ajouter un niveau
`src/server/content/meta.ts` → tableau `LEVELS`, puis `npm run build:data`.

---

## 👥 Comptes, rôles et administration

- **Inscription** : parcours guidé animé (8 à 9 étapes, une question à la fois, retour arrière possible, validation immédiate, autocomplétion des établissements).
- **Connexion** : e-mail + mot de passe ; message identique en cas d'e-mail inconnu ou de mot de passe erroné (aucune fuite d'information).
- **Session persistante** : cookie httpOnly `SameSite=Lax`, JWT HS256 signé, 7 jours par défaut.
- **Compte de démonstration** partagé (`POST /api/auth/demo`), **désactivé par défaut** : la route renvoie alors 400 et tout compte démo existant est supprimé au démarrage.
- **Export de tes données** (`GET /api/auth/me/export`) : un fichier JSON contenant profil, progression, favoris, calendrier, tâches et conversations — jamais le mot de passe haché.
- **Suppression du compte** avec effacement en cascade vérifié : profil, index e-mail, progression, favoris, calendrier, tâches et conversations sont supprimés de la base, puis la session est fermée. Disponible dans *Paramètres → Tes données* et dans *Mon profil*.
- **Rôles** : `eleve` et `admin`. Le premier compte créé devient admin (ou `ADMIN_EMAIL`).
- **Page `/admin`** (protégée) : statistiques globales, liste/recherche des comptes, promotion/rétrogradation, suppression, état du catalogue, **aperçu de 5 questions pour n'importe quel sujet** (contrôle qualité avant publication).
- **API admin** complète et sécurisée : `GET /api/admin/stats`, `GET /api/admin/users`, `PATCH /api/admin/users/:id`, `DELETE /api/admin/users/:id`, `GET /api/admin/catalog`, `GET /api/admin/catalog/topics/:id/preview`.

L'ajout/modification/suppression de quiz par l'interface d'administration est **préparé** : le catalogue est entièrement piloté par données (`topics.ts` + `data/quiz/*.json`), donc un futur panneau CRUD n'aura qu'à écrire dans ces structures. En attendant, le cycle `git push → build Render` publie le contenu.

---

## 🔒 Sécurité

| Risque | Protection mise en place |
|---|---|
| Mots de passe | **scrypt** + sel 16 octets, comparaison `timingSafeEqual`, jamais renvoyés par l'API |
| Vol de session | Cookie **httpOnly**, `SameSite=Lax`, `Secure` en production, JWT signé HS256 avec expiration |
| **CSRF** | Double soumission de cookie : jeton `edumate_csrf` + en-tête `X-CSRF-Token` exigé sur toute requête mutative authentifiée par cookie |
| **XSS** | Tout contenu (IA, énoncés, saisies) est **échappé** avant rendu ; le Markdown est transformé maison, les liens `javascript:` sont refusés ; en-tête CSP strict |
| Injection de données | Validation systématique côté serveur (type, longueur, format, énumérations) — jamais confiance au client |
| En-têtes | `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, `Content-Security-Policy` |
| Brute force | Limitation de débit par IP (900 req/min global, 90 req/min sur l'authentification), réglable |
| Fuite de secrets | Secrets uniquement en variables d'environnement ; `.env` dans `.gitignore` ; `.env.example` sans valeur réelle |
| Fuite de réponses | Les quiz sont corrigés **côté serveur** ; aucune bonne réponse n'est envoyée avant la correction |
| Déni de service | Taille de corps de requête limitée (256 ko), timeout sur tous les appels externes, listes de données bornées |
| Erreurs techniques | Jamais exposées : messages simples en français, traces détaillées uniquement dans les logs serveur |
| Route protégée | `RequireAuth`/`RequireAdmin` côté client **et** `requireAuth()`/`requireAdmin()` côté serveur |

---

## ✅ Tests

```bash
npm test               # unitaires + contenu + API (suite principale)
npm run test:unit      # 32 tests unitaires (rendu riche, formatage, sécurité, moteur, conjugaison, dérivation…)
npm run test:content   # contrôle des 1 316 sujets et de leurs 6 580 questions générées
npm run test:api       # 98 contrôles de bout en bout sur l'API (démarre un serveur réel)
npm run test:api:built # les mêmes 98 contrôles sur le build de production
npm run test:db       # ⭐ base de données : 21 + 3 contrôles Upstash, puis 45 × 3 parcours en bout en bout
npm run test:storage  # couche Upstash contre un faux serveur fidèle au contrat REST réel
npm run test:e2e-db   # API réelle démarrée sur une vraie base Upstash (simulée)
npm run test:bundle    # 10 contrôles du bundle de production (ordre d'évaluation des modules, poids)
npm run test:render    # 50 contrôles de rendu : chaque page montée dans un DOM simulé (jsdom)
npm run test:all       # TOUT : unitaires + contenu + API + API build + base + bundle + rendu
npm run typecheck      # vérification TypeScript stricte de tout le projet
```

### Ce que couvre le test de rendu (`test:render`)
Il démarre l'API réelle, simule une session (compte de démonstration), puis monte **chaque page** de l'application dans un DOM simulé et vérifie son contenu : accueil, connexion, parcours d'accueil, tableau de bord, catalogue de quiz, détail d'un sujet, résultat animé (avec rendu KaTeX), assistant IA, progression, index des outils, devoirs, profil, paramètres, et les 7 outils. Il échoue au moindre incident React non maîtrisé — c'est lui qui a permis de détecter une boucle de rendu infinie (sélecteur Zustand non mémorisé) et une imbrication HTML invalide avant livraison.

> `test:render` nécessite `jsdom` (déjà en `devDependencies`).

### Ce que couvre le test de base de données (`test:db`)
`scripts/mock-upstash.mjs` est un **faux serveur Upstash** qui respecte le contrat REST réel, y compris ses erreurs : il attend `["CMD", ...args]` sur `/` et `[["CMD", ...], ...]` sur `/pipeline`, exige un jeton `Bearer`, et renvoie `HTTP 400 {"error":"ERR unsupported arg type: \"[\""}` si un tableau est envoyé sur le mauvais endpoint.

- `test:storage` (21 contrôles) : GET/SET/DEL/KEYS/PING, préfixe de clés, donnée corrompue ignorée, **lectures groupées réellement envoyées sur `/pipeline`**, normalisation de l'URL Upstash, création/listing/suppression/export de comptes, coût en requêtes HTTP (quota gratuit), absence de divulgation du hash.
- `test:storage` mode « injoignable » (3 contrôles) : base hors ligne → `health()` signale l'indisponibilité, les lectures échouent proprement, le serveur ne plante pas.
- `test:e2e-db` (45 contrôles) : le **vrai serveur Express** démarre avec `UPSTASH_REDIS_REST_URL` pointé vers le faux Upstash, puis on rejoue un parcours complet — inscription, rôle administrateur, panneau admin, recherche, génération de quiz, correction, progression, tâches, calendrier, assistant, export RGPD, second compte et suppression sans clé orpheline. Il est rejoué trois fois : sur le code source, sur le **build de production** (ce que Render exécute), puis avec une URL Upstash volontairement mal collée (`--badurl`).

> C'est cette suite qui aurait attrapé l'erreur de déploiement `ERR unsupported arg type: "["` : les requêtes groupées partaient sur l'endpoint mono-commande.

Le test de bout en bout couvre : santé, catalogue, recherche et facettes, filtres, génération aléatoire de 12+ quiz, déterminisme de la graine, absence de fuite de réponses, protection des routes (401/403/404/400), inscription, doublon d'e-mail, mots de passe faibles, session, CSRF, profil, préférences, génération/correction, anti-triche, progression, favoris, recommandations, calendrier, tâches, assistant IA, conversations, traduction, détection de langue, annuaire des lycées, déconnexion, compte de démonstration, changement de mot de passe, rôle admin, service du frontend.

---

## ⚡ Performance et accessibilité

**Performance**
- Découpage automatique des paquets (React, routeur, Framer Motion, KaTeX, Recharts, icônes, vendor) + **chargement paresseux de chaque page**.
- Assets mis en cache 7 jours, `index.html` jamais ; compression gzip.
- Catalogue lu une seule fois en mémoire ; recherche filtrée sans base externe.
- Animations CSS/Framer Motion courtes, `prefers-reduced-motion` respecté, aucune animation bloquante.
- Musique synthétisée (aucun téléchargement audio), pré-planification audio à 150 ms pour un rendu stable sur mobile.

**Accessibilité**
- Contrastes conformes en thème clair **et** sombre, cibles tactiles ≥ 44 px.
- Navigation clavier complète (quiz : `1`–`6`, `Entrée`, `Échap` ; chrono : `Espace`, `L`, `R` ; tableau : `Z`, `Y`).
- `label`/`aria-label` sur tous les champs, `role` et `aria-pressed` sur les sélections, `aria-live` sur les statuts, focus visible, piège à focus dans les modales.
- Animations désactivables (préférence système **et** réglage utilisateur).

**Gestion des erreurs**
Chaque fonctionnalité gère : réseau coupé, serveur indisponible, session expirée, donnée invalide, API externe saturée, base injoignable. Les messages sont simples et actionnables (« Le serveur met trop de temps à répondre. Réessaie dans un instant. »), jamais techniques.

---

## 🎛️ Commandes disponibles

| Commande | Description |
|---|---|
| `npm install` | Installe les dépendances |
| `npm run dev` | Démarre API + Vite (http://localhost:5173) |
| `npm run dev:api` | API seule en mode *watch* |
| `npm run dev:web` | Frontend seul (nécessite l'API) |
| `npm run build:data` | Régénère `data/generated/catalog.json` |
| `npm run typecheck` | Vérification TypeScript |
| `npm run build` | Catalogue + types + build client + build serveur |
| `npm start` | Démarre le serveur de production |
| `npm run preview` | Build complet puis démarrage |
| `npm test` | Suite principale : unitaires + contenu + API |
| `npm run test:unit` | Tests unitaires des modules critiques |
| `npm run test:content` | Contrôle qualité des 1 316 sujets |
| `npm run test:api` | Test de bout en bout de l'API (source) |
| `npm run test:api:built` | Test de bout en bout sur le build de production |
| `npm run test:storage` | Couche Upstash contre un faux serveur REST fidèle (21 + 3 contrôles) |
| `npm run test:e2e-db` | API réelle sur une base Upstash simulée (45 contrôles) |
| `npm run test:e2e-db:built` | Les mêmes 45 contrôles sur le **build de production** (identique à Render) |
| `npm run test:e2e-db:badurl` | Idem avec une URL Upstash mal collée (vérifie la normalisation) |
| `npm run test:db` | Les deux précédents à la suite |
| `npm run build:tests` | Compile le bundle de test de rendu |
| `npm run test:bundle` | Contrôle du build client (intégrité, graphe ESM, poids) |
| `npm run test:render` | Monte chaque page dans un DOM simulé (jsdom) — 50 contrôles |
| `npm run test:routes` | Monte l'app complète sur chaque route publique (détecte les pages blanches) |
| `npm run scan` | 🔐 Détecte les clés d'API dans l'arbre **et** l'historique git (bloque le push GH013) |
| `npm run scan:all` | Idem, en incluant les fichiers ignorés par git (`.env`, catalogues) |
| `npm run test:all` | Intégralité des tests |
| `npm run icons` | Régénère les icônes PNG  |
| `npm run test:scripts` | Audite les scripts Windows (ASCII, CRLF, syntaxe) |
| `npm run zip` | Crée l'archive de livraison du projet |
| `publier.bat` | (Windows) vérifie, teste, build et pousse sur GitHub en un double-clic |

---

## 🩺 Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| `Cannot find module 'dist/client'` / page « API active » | Frontend non compilé | `npm run build` (production) ou utiliser http://localhost:5173 (dev) |
| `Catalogue indisponible` dans les logs | Catalogue non généré | `npm run build:data` |
| Comptes perdus au redémarrage | Stockage mémoire | Renseigne `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` |
| `Upstash Redis configuré mais injoignable` | URL/token invalides ou région différente | Vérifie la console Upstash ; aligne les régions Render/Upstash |
| L'assistant répond en mode hors-ligne | `AI_PROVIDER=none` ou clé absente/invalide | Renseigne `AI_PROVIDER` et `AI_API_KEY`, redémarre |
| Traduction indisponible | Quota quotidien MyMemory atteint | Réessaie le lendemain ou désactive via `TRANSLATE_PROVIDER=` |
| Erreur 429 | Limitation de débit | Attends une minute ; ajuste `RATE_LIMIT_MAX` derrière un NAT d'établissement |
| `EADDRINUSE` | Port occupé | Change `PORT` (ou `CLIENT_PORT` pour Vite) |
| Build Render en échec : `tsx: not found` | Render positionne `NODE_ENV=production` pendant le build → npm ignore les `devDependencies` | Build Command : `npm ci --include=dev && npm run build` |
| Build Render en échec | Cache npm corrompu | Render → *Manual Deploy* → **Clear build cache & deploy** |
| `git push` refusé : `remote: error: GH013: Repository rule violations found` ou `push declined due to repository rule violations` | **GitHub Push Protection** : une clé d'API est présente dans le code ou dans un commit. GitHub analyse **tous** les commits du push, pas seulement le dernier | `npm run scan` pour la localiser → **la révoquer** dans la console du fournisseur → la retirer du code (utiliser `AI_API_KEY`) → purger l'historique (procédure ci-dessous) |
| Push toujours refusé alors que la clé a été supprimée du fichier | Elle reste présente dans un **commit antérieur** : nettoyer le code ne nettoie pas l'historique | Procédure ci-dessous (branche orpheline ou `git-filter-repo`) |
| `publier.bat` : « Des tests ont échoué » avec `ENOENT … data/generated/catalog.json` | `data/generated/` est ignoré par git : absent d'un clone frais, alors que `test:content` le lisait avant `build:data` | Corrigé : `check-content.ts` régénère le catalogue s'il manque, et `publier.bat` lance `build:data` **avant** les tests |
| `publier.bat` : « Le fichier .env existe mais N'EST PAS ignoré par Git » alors que `.gitignore` est correct | `git check-ignore` renvoie 128 (« not a git repository ») tant que le dépôt n'est pas initialisé — or il ne l'était qu'à l'étape suivante | Corrigé : le contrôle se rabat sur une lecture directe de `.gitignore`, avec ou sans dépôt |
| `apply-fix.bat` : « package.json introuvable » | Le script faisait `cd ..` en se croyant dans `scripts\`, alors qu'il est à la racine | Corrigé : le `cd ..` est supprimé |
| `publier.bat` affiche des erreurs en boucle (`'clic' n'est pas reconnu…`) | Le `.bat` était en UTF-8 accentué : cmd.exe lit le fichier **avant** tout `chcp`, et les octets des accents deviennent des séparateurs de commandes | Corrigé : tous les `.bat`/`.ps1` sont en **ASCII pur + CRLF**. Contrôle permanent : `npm run test:scripts` |
| Windows : `spawn EINVAL` dans un script | Correctif Node CVE-2024-27980 : les wrappers `.cmd` npm ne peuvent plus être lancés par `spawn()` | Déjà traité : les scripts exécutent `node` + le point d'entrée JS des outils (`scripts/lib/tools.mjs`) |
| Windows : `'tsx' n'est pas reconnu` | Dépendances non installées | `npm install` puis relance |
| Écran blanc / « EduMate se prépare… » en boucle | Ancien `index.html` en cache, ou chunk évalué avant React | Ctrl+Maj+R ; puis `npm run test:bundle` (le découpage des paquets est laissé à Rollup, jamais de `manualChunks`) |
| Erreur console `Cannot read properties of undefined (reading 'PureComponent')` | Découpage manuel des paquets séparant React de ses consommateurs | Corrigé : `vite.config.ts` n'utilise plus `manualChunks` |
| `StorageUnavailableError: Upstash HTTP 400 {"error":"ERR unsupported arg type: \"[\""}` | Requêtes groupées envoyées sur l'endpoint mono-commande : Upstash attend `[[cmd,...]]` **uniquement** sur `/pipeline` | Corrigé dans `storage.ts`. Contrôle permanent : `npm run test:db` |
| `Upstash HTTP 404` ou `invalid JSON body` | `UPSTASH_REDIS_REST_URL` copiée avec un suffixe (`/pipeline`) ou des espaces | Corrigé automatiquement : l'URL est normalisée au démarrage (un avertissement l'indique dans les journaux). Format attendu : `https://xxxxxxxx.upstash.io` |
| Page `/admin` : « Cette section est réservée aux administrateurs » | Aucun compte administrateur en base | Le **premier compte créé** est administrateur ; ou ajoute ton adresse dans `ADMIN_EMAIL` puis reconnecte-toi |
| Quota Upstash épuisé (10 000 commandes/jour) | Trop d'allers-retours HTTP | Déjà groupé (`getMany` en pipeline, `DEL` multi-clés, suppression et export en requêtes groupées) ; vérifie avec `npm run test:e2e-db` qui affiche le ratio requêtes/commandes |

### 🔐 Procédure complète : une clé d'API est partie dans le dépôt

1. **Révoque la clé immédiatement** — console [Groq](https://console.groq.com), [xAI](https://console.x.ai) ou [OpenAI](https://platform.openai.com). Dès qu'elle a été écrite dans Git, elle doit être considérée comme publique.
2. **Localise toutes ses occurrences** : `npm run scan` (arbre de travail **et** historique git, chaque commit analysé).
3. **Retire-la du code.** Le projet lit déjà `process.env.AI_API_KEY` : il n'y a rien d'autre à modifier. Mets la nouvelle clé dans `.env` (local) et dans Render → *Environment* (production).
4. **Purge l'historique.** GitHub analyse tous les commits du push : sans cette étape, l'envoi reste refusé.

   **Cas simple** — peu de commits, rien de partagé (ton dépôt n'a qu'un seul commit, c'est le cas idéal) :
   ```bash
   git checkout --orphan propre      # historique vierge, fichiers conservés
   git add -A
   git commit -m "feat: EduMate — plateforme éducative tout-en-un"
   git branch -M main
   git push --force -u origin main   # remplace le dépôt distant
   ```

   **Cas général** — conserver l'historique :
   ```bash
   pip install git-filter-repo
   printf '%s\n' 'gsk_TA_CLE==>REDACTED' > expressions.txt
   git filter-repo --replace-text expressions.txt --force
   git remote add origin https://github.com/TON-PSEUDO/edumate.git
   git push --force -u origin main
   ```

5. **Vérifie** : `npm run scan` doit afficher « ✅ RIEN À SIGNALER » (arbre **et** historique), puis relance `publier.bat`.

> 💡 `publier.bat` exécute ce contrôle automatiquement à l'étape [5/9] et refuse de pousser tant qu'une clé est détectée. Il reste actif même en mode `--rapide` : il dure moins d'une seconde.

---

**Journal de santé** : `GET /api/health` renvoie l'état de la base, du catalogue, de l'IA, l'uptime et d'éventuels avertissements — c'est aussi le *health check* de Render.

---

## 🗺️ Feuille de route

Déjà préparé dans le code (points d'extension identifiés) :
- **Panneau d'administration complet** (CRUD des sujets et banques) : l'API admin et le format de données existent.
- **Classements et défis entre amis** : la couche `store.ts` et l'index des comptes sont prêts.
- **Export PDF des fiches de révision** : les données de progression sont déjà structurées.
- **Ajout de matières** (latin, allemand, HGGSP, LLCE…) : une entrée dans `meta.ts` + des sujets.
- ~~**PWA installable hors-ligne**~~ : ✅ **fait** — `public/sw.js` (coquille en cache, démarrage instantané) + maintien du serveur éveillé + application installable.
- **Synchronisation multi-appareils du tableau interactif** et sauvegarde des dessins.

---

## 📄 Licence

Projet fourni sous **licence MIT** : tu peux l'utiliser, le modifier et le déployer librement, y compris commercialement, en conservant la mention de licence.

Les contenus pédagogiques (corpus de connaissances, banques de questions) sont rédigés pour un usage scolaire libre. Les musiques sont **générées algorithmiquement** par l'application : aucune œuvre protégée n'est embarquée ni diffusée.

---

<div align="center">

**Fait avec 🦉 pour les élèves qui veulent comprendre, pas seulement réussir.**

`npm install && npm run dev` → http://localhost:5173

</div>
