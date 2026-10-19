# 🚀 EduMate — Publication express (GitHub → Upstash → Render)

Durée réelle : **15 à 20 minutes**. Suis les étapes dans l'ordre, tout est copier-coller.

> ⚠️ **Règle absolue** : ne jamais committer le fichier `.env`. Le `.gitignore` fourni le bloque déjà, et seul `.env.example` (sans aucune vraie clé) part sur GitHub.

---

## ✅ Étape 0 — Vérification avant de publier (2 min)

**Prérequis unique : [Node.js 20 ou +](https://nodejs.org)** (npm est inclus). Rien d'autre : tous les scripts du projet sont en JavaScript/Node, ils fonctionnent à l'identique sur **Windows, macOS et Linux**.

### Windows — Invite de commandes (cmd)
```bat
cd edumate

npm install
npm run build
npm run test:api

REM 🔐 aucune clé d'API ne doit partir sur GitHub (blocage GH013) :
npm run scan

REM aucun fichier .env ne doit être suivi par git :
if exist .env (echo ⛔ .env présent : ne PAS committer) else (echo ✅ pas de .env)
```
Attendu : `98 contrôles réussis, 0 échec(s)` pour `test:api`, et
`✅ RIEN À SIGNALER` pour `npm run scan`.

> 🔐 **Le point qui bloque le plus souvent** : une clé d'API écrite dans le code.
> GitHub *Push Protection* refuse alors le push avec `remote: error: GH013`,
> **et ce même après suppression de la clé du fichier** — car il analyse tous les
> commits, pas seulement le dernier. La clé se met dans `.env` (local) et dans
> Render → *Environment* (production), jamais dans `src/`. Procédure complète de
> nettoyage : `README.md` → § « Une clé d'API est partie dans le dépôt ».

### Windows — PowerShell
```powershell
cd edumate
npm install ; npm run build ; npm run test:api ; npm run scan
if (Test-Path .env) { "⛔ .env présent : ne pas committer" } else { "✅ pas de .env" }
```

### macOS / Linux
```bash
cd edumate
npm install && npm run build && npm run test:api && npm run scan
ls -a | grep '^\.env$' && echo "⛔ .env présent" || echo "✅ pas de .env"
```

---

## 🐙 Étape 1 — Mettre le projet sur GitHub (5 min)

### 1.1 Créer le dépôt
1. Va sur **https://github.com/new**
2. **Repository name** : `edumate`
3. **Public** ou **Private** (au choix — Render fonctionne avec les deux)
4. ❌ **Ne coche RIEN** : pas de README, pas de `.gitignore`, pas de licence (ils sont déjà dans le projet)
5. **Create repository**

### 1.2 Pousser le code

Les commandes `git` ci-dessous fonctionnent à l'identique dans **cmd**, **PowerShell** et le terminal macOS/Linux (installe Git depuis https://git-scm.com/download/win si besoin).

```bash
cd edumate

git init
git add .
git status                 # 👀 vérifie : pas de node_modules, pas de dist, pas de .env
npm run scan               # 🔐 vérifie : aucune clé d'API (sinon push refusé en GH013)
git commit -m "feat: EduMate — plateforme éducative tout-en-un"
git branch -M main

# remplace TON-PSEUDO par ton identifiant GitHub
git remote add origin https://github.com/TON-PSEUDO/edumate.git
git push -u origin main
```

Si GitHub te demande une authentification : utilise un **Personal Access Token** (GitHub → Settings → Developer settings → *Tokens (classic)* → générer avec le scope `repo`) à la place du mot de passe.

### 1.3 Contrôle visuel sur GitHub
Ouvre ton dépôt et confirme la présence de :
`src/` · `data/quiz/` · `public/` · `scripts/` · `tests/` · `docs/` · `render.yaml` · `.env.example` · `README.md` · `LICENSE` · `package.json` · `package-lock.json`

Et l'**absence** de : `.env` · `node_modules/` · `dist/`

---

## 🗄️ Étape 2 — Créer la base Upstash (4 min)

Le disque de Render n'est **pas persistant** : sans base externe, les comptes et la progression seraient perdus à chaque redémarrage. Upstash Redis est gratuit (10 000 commandes/jour) et EduMate l'interroge en HTTP, sans dépendance supplémentaire.

1. **https://console.upstash.com** → *Sign up* (Google ou GitHub, c'est gratuit)
2. Bouton **Create Database**
   - **Name** : `edumate`
   - **Region** : `eu-central-1` (Francfort) — ⚠️ **la même région que Render**, sinon chaque requête traverse l'Atlantique
   - Laisse le reste par défaut → **Create**
3. Ouvre ta base → onglet **REST API** (ou **`.env`**)
4. Copie les deux valeurs :

```
UPSTASH_REDIS_REST_URL=https://xxxxxxxxxxxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=AXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

> Tu peux tester plus tard dans l'onglet **Data Browser** : tu y verras les clés `edumate:user:…`, `edumate:progress:…`, `edumate:favorites:…` après création d'un compte.

---

## ☁️ Étape 3 — Créer le service Render (6 min)

### Option A — Automatique avec `render.yaml` (recommandée)

1. **https://dashboard.render.com** → connexion avec **GitHub**
2. **New +** → **Blueprint**
3. Autorise Render à accéder au dépôt `edumate`
4. Render détecte `render.yaml` → il te demande les variables marquées `sync: false` :
   - `UPSTASH_REDIS_REST_URL` → colle la valeur de l'étape 2
   - `UPSTASH_REDIS_REST_TOKEN` → colle la valeur de l'étape 2
   - `AI_PROVIDER` → `none` (ou `groq`, voir étape 5)
   - `AI_API_KEY` → vide pour l'instant
   - `AI_MODEL` → vide
   - `APP_URL` → laisse vide, tu le rempliras à l'étape 4 une fois l'URL connue
5. **Apply** → Render lance `npm ci --include=dev && npm run build`, puis démarre.

`SESSION_SECRET` est **généré automatiquement** par Render (`generateValue: true`).

### Option B — Web Service manuel

**New +** → **Web Service** → choisis ton dépôt, puis :

| Champ | Valeur exacte |
|---|---|
| **Name** | `edumate` |
| **Region** | `Frankfurt (EU)` |
| **Branch** | `main` |
| **Runtime** | `Node` |
| **Build Command** | `npm ci --include=dev && npm run build` |
| **Start Command** | `npm start` |
| **Instance Type** | `Free` |
| **Health Check Path** | `/api/health` |
| **Auto-Deploy** | `Yes` |

> `PORT` est injectée automatiquement par Render : **ne la fixe pas** dans les variables (l'application lit `process.env.PORT`).

---

## 🔑 Étape 4 — Variables d'environnement Render

Service → onglet **Environment** → *Add Environment Variable* (une par ligne) :

| Clé | Valeur | Obligatoire ? |
|---|---|---|
| `NODE_ENV` | `production` | ✅ oui |
| `SESSION_SECRET` | longue chaîne aléatoire (voir ci-dessous) | ✅ oui |
| `UPSTASH_REDIS_REST_URL` | `https://xxxxxxxx.upstash.io` | ✅ oui |
| `UPSTASH_REDIS_REST_TOKEN` | `AXxxxxxxxx...` | ✅ oui |
| `UPSTASH_KEY_PREFIX` | `edumate` | conseillé |
| `APP_URL` | `https://edumate.onrender.com` (ton URL réelle) | conseillé |
| `FALLBACK_STORAGE` | `memory` | conseillé |
| `ALLOW_DEMO_ACCOUNT` | `true` | facultatif |
| `AI_PROVIDER` | `groq` / `openai` / `mistral` / `none` | facultatif |
| `AI_API_KEY` | ta clé IA | facultatif |
| `AI_MODEL` | *(vide = valeur par défaut du fournisseur)* | facultatif |
| `ADMIN_EMAIL` | ton e-mail | facultatif (créé un admin) |
| `ADMIN_PASSWORD` | mot de passe robuste (8+ car., lettre + chiffre) | avec `ADMIN_EMAIL` |
| `RATE_LIMIT_MAX` | `1800` | utile si usage en classe derrière un NAT |

**Générer un `SESSION_SECRET` sûr :**
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```
Exemple de valeur valide (⚠️ **n'utilise pas celle-ci**, génère la tienne) :
```
fa54b3c5f2ebcd8212f7579b5103594c2e30f692467679a53cc26823d9d5a6edcbcf5bfa4a85b127ba14a387996c439b
```

> 💡 Sans `ADMIN_EMAIL`, **le premier compte créé sur ton instance devient administrateur** et débloque la page `/admin`.

Chaque modification de variable déclenche un redéploiement : renseigne-les toutes, puis clique **Save Changes** une seule fois.

---

## 🧠 Étape 5 (optionnelle) — Activer l'assistant IA

Sans clé, EduMate utilise son **tuteur intégré hors-ligne** (méthode pas à pas, rappels de cours exacts, exercices générés) — l'application reste 100 % fonctionnelle.

Pour des réponses génératives, la solution gratuite la plus simple est **Groq** :
1. **https://console.groq.com** → *Create API Key* → copie la clé (`gsk_...`)
2. Dans Render :
   ```
   AI_PROVIDER=groq
   AI_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxx
   ```
3. Redémarre le service.

Alternatives :
- `AI_PROVIDER=xai` + clé `xai-...` (**Grok**, https://console.x.ai) — l'alias `grok` est accepté ;
- `AI_PROVIDER=openai` + clé `sk-...` ;
- `AI_PROVIDER=mistral`.

Pour un proxy/serveur compatible OpenAI, ajoute `AI_BASE_URL=https://mon-proxy/v1`.
**Changer de fournisseur ne demande aucune modification de code.** Si `AI_PROVIDER`
est laissé vide, le fournisseur est déduit du format de la clé (`gsk_` → groq,
`xai-` → xai, `sk-` → openai).

> 🔐 La clé se saisit **uniquement** ici (Render) ou dans ton `.env` local.
> Jamais dans un fichier du dépôt : le push serait refusé (`GH013`) et la clé
> serait compromise. Contrôle : `npm run scan`.

---

## 🔍 Étape 6 — Vérifier que tout fonctionne (3 min)

### 6.1 Les logs Render doivent afficher
```
🦉 EduMate est prêt
   Environnement   : production
   Base de données : upstash (Upstash Redis)
   IA              : groq            ← ou « tuteur intégré hors-ligne »
   Catalogue       : 1316 sujets / 1316 jouables
```
> Si tu vois `Base de données : memory` → les variables Upstash sont mal renseignées (voir §7).

### 6.2 Le health check
Ouvre `https://TON-APP.onrender.com/api/health` et vérifie :
```json
{ "ok": true, "env": "production", "database": "upstash", "databaseReady": true,
  "catalog": { "topics": 1316, "playable": 1316 } }
```

### 6.3 Parcours utilisateur complet
1. Page d'accueil → **Créer mon espace** → parcours guidé de 8-9 étapes
2. Lancer un quiz → répondre → voir le score et la correction détaillée
3. **Recharger la page** → tu es toujours connecté (session persistante 7 jours)
4. Console Upstash → *Data Browser* → les clés `edumate:*` sont apparues ✅

---

## 🔄 Étape 7 — Mises à jour automatiques

Désormais, chaque push sur `main` redéploie tout seul :

```bash
git add .
git commit -m "content: 40 nouveaux sujets de probabilités"
git push
```

Render exécute alors : `npm ci` → `build:data` (catalogue) → `typecheck` → build client → build serveur → redémarrage, puis valide via `/api/health`.

---

## 🩺 Dépannage

| Symptôme | Cause | Solution |
|---|---|---|
| `git push` refusé : `GH013: Repository rule violations found` | **Push Protection** : une clé d'API est dans le code ou dans un commit | `npm run scan` → **révoquer la clé** → la retirer du code → purger l'historique (§ README) |
| Push refusé alors que la clé a été supprimée du fichier | Elle reste dans un **commit antérieur** | `git checkout --orphan propre` puis `git push --force`, ou `git filter-repo --replace-text` |
| `publier.bat` : « Des tests ont échoué » avec `ENOENT … data/generated/catalog.json` | `data/generated/` est ignoré par git, donc absent d'un clone frais ; `test:content` tournait avant `build:data` | Corrigé : le catalogue est régénéré automatiquement et `publier.bat` lance `build:data` avant les tests |
| `publier.bat` : « .env N'EST PAS ignoré par Git » à tort | `git check-ignore` renvoie 128 tant que le dépôt n'est pas initialisé | Corrigé : repli sur une lecture directe de `.gitignore` |
| Build en échec : `sh: 1: tsx: not found` | Render force `NODE_ENV=production` **pendant le build** → npm ignore les `devDependencies` (139 paquets au lieu de 256) | Build Command = `npm ci --include=dev && npm run build` |
| Build en échec sur `npm ci` | `package-lock.json` manquant/désynchronisé | Il est inclus ; en local fais `npm install` puis commit du lock |
| Page « 🦉 EduMate — API active » | `dist/client` absent (build client échoué) | Relis les logs de build Render |
| `database: memory` alors qu'Upstash est configuré | URL/token invalides, ou région différente | `/api/health` renvoie `databaseNotice` avec la raison exacte |
| `Catalogue indisponible` | catalogue non généré | Normal : `npm run build:data` tourne pendant `npm run build` |
| Connexion impossible après un redéploiement | `SESSION_SECRET` régénéré | Fixe une valeur **stable** dans les variables Render |
| Erreur **429** en classe | 30 élèves derrière une seule IP (NAT) | `RATE_LIMIT_MAX=1800` et `AUTH_RATE_LIMIT_MAX=180` |
| Premier accès très lent (~30 s) | Plan gratuit Render : mise en veille après 15 min | Normal, le service se réveille seul |
| Erreur 502 au déploiement | health check trop précoce | Le chemin `/api/health` est déjà configuré ; réessaie |
| Windows : `spawn EINVAL` | Correctif Node CVE-2024-27980 sur les `.cmd` npm | **Déjà corrigé** dans le projet (`scripts/lib/tools.mjs`) — mets à jour ton ZIP si tu vois encore l'erreur |
| Windows : `'tsx' n'est pas reconnu` | Dépendances absentes | `npm install` puis relance |

**Où regarder** : Render → ton service → **Logs** (cherche `[EduMate]`), puis **Events** pour l'historique des déploiements.

---

## 📋 Récapitulatif des commandes

**macOS / Linux**
```bash
git init && git add . && git commit -m "feat: EduMate" && git branch -M main
git remote add origin https://github.com/TON-PSEUDO/edumate.git && git push -u origin main
```

**Windows (cmd)** — une commande par ligne :
```bat
git init
git add .
git commit -m "feat: EduMate"
git branch -M main
git remote add origin https://github.com/TON-PSEUDO/edumate.git
git push -u origin main
```

**Générer le secret de session** (partout) :
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```
