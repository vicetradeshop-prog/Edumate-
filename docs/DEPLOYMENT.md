# 🚀 Déploiement d'EduMate — GitHub → Render

Guide pas à pas, de la mise en ligne du code jusqu'à l'URL publique.
Compte requis : [GitHub](https://github.com) (gratuit) et [Render](https://render.com) (plan gratuit suffisant).

---

## 0. Vérifications avant de pousser le code

```bash
cd edumate

# Aucun secret ne doit être versionné
git status                       # .env ne doit PAS apparaître
git check-ignore -v .env         # doit confirmer que .env est bien ignoré

# Le projet doit compiler et passer ses tests
npm install
npm run build
npm test
```

Attendu : `81 contrôles réussis, 0 échec(s)` (ou équivalent) et un build sans erreur.

---

## 1. Publier sur GitHub

### Méthode recommandée (Windows) : `publier.bat`
Double-clique sur **`publier.bat`** à la racine du projet. Le script vérifie Node et Git,
contrôle qu'aucun secret ne peut être publié, lance les tests et le build, crée ou répare le
dépôt Git, renseigne le remote et pousse — avec récupération automatique des cas classiques
(branche `master`, historiques divergents, dépôt recréé).

### Méthode manuelle
```bash
git init
git add .
git commit -m "feat: EduMate — plateforme éducative tout-en-un"
git branch -M main
git remote add origin https://github.com/TON_COMPTE/edumate.git
git push -u main origin   # ou : git push -u origin main
```

> Le `.gitignore` fourni exclut déjà : `node_modules/`, `dist/`, `dist-test/`, `.env*` (sauf `.env.example`), `data/local/`, `data/generated/`, journaux et archives.

**Vérification rapide sur GitHub** : ouvre le dépôt et confirme la présence de `src/`, `data/quiz/`, `public/`, `scripts/`, `tests/`, `render.yaml`, `.env.example`, `README.md`, `LICENSE`. Vérifie l'**absence** de `.env`, `node_modules/`, `dist/`.

---

## 2. Préparer la base de données (Upstash)

1. [console.upstash.com](https://console.upstash.com) → **Sign up** (plan gratuit).
2. **Create Database** :
   - Nom : `edumate`
   - Région : **la même que ton futur service Render** (ex. `eu-central-1` / Francfort) — sinon chaque requête traverse l'Atlantique.
   - Type : Redis (par défaut).
3. Ouvre la base → onglet **REST API** (ou **.env**) et copie :
   - `UPSTASH_REDIS_REST_URL` = `https://xxxxxxxx.upstash.io`
   - `UPSTASH_REDIS_REST_TOKEN` = `AXxxxxxxxxxxxxxxxxxxxxxxxx`

> **Pourquoi Upstash ?** Le disque d'un service Render (plan gratuit comme payant) n'est **pas persistant** : un redémarrage efface les fichiers. Une base externe est donc obligatoire pour conserver comptes et progression. Upstash Redis est serverless, gratuit jusqu'à 10 000 commandes/jour, et EduMate l'interroge en HTTP — aucune dépendance npm supplémentaire.

---

## 3. Créer le service Render

### Option A — Blueprint (recommandée, tout est automatisé)

1. Render → **New +** → **Blueprint**.
2. Autorise Render à accéder à ton dépôt GitHub.
3. Render détecte `render.yaml` et propose le service **edumate**.
4. Renseigne les variables demandées (`sync: false`) : `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `AI_PROVIDER`, `AI_API_KEY`, `APP_URL`.
5. **Apply** → Render construit et déploie.

`SESSION_SECRET` est généré automatiquement par Render (`generateValue: true`).

### Option B — Web Service manuel

1. Render → **New +** → **Web Service** → sélectionne ton dépôt.
2. Configure :

| Champ | Valeur |
|---|---|
| **Name** | `edumate` |
| **Region** | Frankfurt (EU) — identique à Upstash |
| **Branch** | `main` |
| **Runtime** | Node |
| **Build Command** | `npm ci --include=dev && npm run build` |
| **Start Command** | `npm start` |
| **Instance Type** | Free |
| **Health Check Path** | `/api/health` |
| **Auto-Deploy** | Yes |

> `npm ci` impose l'usage du `package-lock.json` (fourni) : build reproductible, plus rapide et plus fiable que `npm install`.

---

## 4. Variables d'environnement Render

Onglet **Environment** → *Add Environment Variable* :

| Clé | Valeur | Notes |
|---|---|---|
| `NODE_ENV` | `production` | active les cookies `Secure` |
| `SESSION_SECRET` | *(Generate value)* | **obligatoire** en production |
| `UPSTASH_REDIS_REST_URL` | `https://xxxx.upstash.io` (URL de base, **sans** `/pipeline`, sans espace) | étape 2 |
| `UPSTASH_REDIS_REST_TOKEN` | `AXxxxx...` | étape 2 |
| `UPSTASH_KEY_PREFIX` | `edumate` | ou `edumate-prod` si base partagée |
| `AI_PROVIDER` | `groq` / `openai` / `mistral` / `xai` / `none` | facultatif (vide = déduit du format de la clé) |
| `AI_API_KEY` | ta clé — **uniquement ici, jamais dans le code** | facultatif (sans elle, tuteur intégré hors-ligne) |
| `AI_MODEL` | *(vide)* | facultatif, valeur par défaut par fournisseur |
| `APP_URL` | `https://edumate.onrender.com` | ton URL publique |
| `ALLOW_DEMO_ACCOUNT` | `true` | compte de démonstration |
| `FALLBACK_STORAGE` | `memory` | comportement si Upstash est injoignable |
| `ADMIN_EMAIL` | `toi@mail.fr,autre@mail.fr` | *(optionnel)* adresses promues administrateur ; le **premier compte créé** l'est de toute façon |
| `ADMIN_PASSWORD` | mot de passe robuste | *(optionnel)* avec `ADMIN_EMAIL` |

`PORT` est fournie automatiquement par Render : **ne pas la fixer** (l'application lit `process.env.PORT`).

---

## 5. Premier déploiement et vérifications

Logs attendus :

```
🦉 EduMate est prêt
   Environnement   : production
   Port            : 10000
   Base de données : upstash (Upstash Redis)
   IA              : groq
   Catalogue       : 1316 sujets / 1316 jouables
```

Contrôles à effectuer :

| Test | Attendu |
|---|---|
| `https://ton-app.onrender.com/api/health` | `"ok": true`, `"database": "upstash"`, `"databaseReady": true` |
| Page d'accueil | Landing page EduMate |
| « Créer mon espace » | Parcours guidé de 8-9 étapes |
| Inscription complète | Redirection vers le tableau de bord |
| Lancer un quiz | Questions, correction, score enregistré |
| Recharger la page | **Session conservée** (cookie persistant 7 jours) |
| Console Upstash → Data Browser | Clés `edumate:user:…`, `edumate:progress:…` présentes |

---

## 6. Mises à jour automatiques

Chaque `git push` sur `main` déclenche : `npm ci` → `npm run build:data` → `tsc --noEmit` → build client → build serveur → redémarrage.

```bash
git add .
git commit -m "feat(quiz): 40 nouveaux sujets de probabilités"
git push
```

Render affiche le statut du déploiement ; le *health check* `/api/health` valide la mise en ligne.

---

## 7. Particularités du plan gratuit Render

| Contrainte | Conséquence | Réponse d'EduMate |
|---|---|---|
| Mise en veille après 15 min d'inactivité | Premier accès lent (~30 s) | Message de chargement soigné ; réveil automatique |
| Disque éphémère | Fichiers perdus au redémarrage | Toutes les données sont dans Upstash ; le stockage fichier n'est qu'un repli local |
| 750 h/mois par service | Un seul service suffit | API + frontend dans **le même process** |
| Pas de HTTPS forcé côté app | Cookies `Secure` requis | Activé automatiquement quand `NODE_ENV=production` |

---

## 8. Déploiements alternatifs

Le projet est un **simple serveur Node** : il fonctionne partout.

**Railway / Fly.io / Koyeb**
```bash
Build : npm ci --include=dev && npm run build
Start : npm start
Santé : /api/health
```

**VPS (Debian/Ubuntu)**
```bash
git clone … && cd edumate
npm ci --include=dev && npm run build
cp .env.example .env && nano .env     # renseigner les variables
NODE_ENV=production PORT=8080 npm start
# puis exposer via nginx + certbot (HTTPS obligatoire pour les cookies Secure)
```

**Docker** (si besoin)
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --include=dev
COPY . .
RUN npm run build
ENV NODE_ENV=production
EXPOSE 8787
CMD ["npm", "start"]
```

---

## 9. Dépannage

| Symptôme | Diagnostic | Solution |
|---|---|---|
| Build en échec : `tsx: not found` | `NODE_ENV=production` pendant le build → devDependencies ignorées | Build Command = `npm ci --include=dev && npm run build` |
| Build en échec `npm ci` | `package-lock.json` absent ou désynchronisé | `npm install` en local puis commit du lock |
| `Catalogue indisponible` | `data/generated/catalog.json` absent | Normal : il est régénéré par `npm run build:data` (appelé par `build`) |
| Page « 🦉 EduMate — API active » | `dist/client` manquant | Le build client a échoué : consulte les logs de build |
| `database: memory` alors qu'Upstash est configuré | URL/token invalides ou région inaccessible | `/api/health` renvoie `databaseNotice` avec la raison exacte |
| Connexion impossible après déploiement | `SESSION_SECRET` changé (regénération) | Fixe une valeur stable dans les variables Render |
| 502 au démarrage | Health check trop précoce | Le chemin `/api/health` est déjà configuré ; augmente le *Health Check* timeout si besoin |
| Erreur 429 fréquente | Établissement derrière un NAT (une seule IP) | Augmente `RATE_LIMIT_MAX` et `AUTH_RATE_LIMIT_MAX` |

**Où regarder** : Render → ton service → **Logs** (recherche `[EduMate]`), puis **Events** pour l'historique des déploiements.
