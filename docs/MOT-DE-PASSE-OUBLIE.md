# 🔑 EduMate — Mot de passe oublié & récupération de compte

Ce document couvre deux situations distinctes :

1. **[Un élève a oublié son mot de passe](#1-parcours-élève-mot-de-passe-oublié)** — parcours normal, par e-mail.
2. **[Tu as perdu ton mot de passe administrateur](#2-urgence-récupérer-un-compte-administrateur)** — récupération depuis Render, **sans e-mail**.

> ⏱️ Si tu es bloqué **maintenant**, va directement à la [section 2](#2-urgence-récupérer-un-compte-administrateur) : cinq minutes suffisent, aucun fournisseur d'e-mails n'est nécessaire.

---

## Sommaire

- [1. Parcours élève : mot de passe oublié](#1-parcours-élève-mot-de-passe-oublié)
- [2. URGENCE : récupérer un compte administrateur](#2-urgence-récupérer-un-compte-administrateur)
- [3. Configurer l'envoi des e-mails](#3-configurer-lenvoi-des-e-mails)
  - [🔴 SMTP : bloqué sur Render (plan gratuit)](#-smtp--bloqué-sur-render-plan-gratuit)
  - [Cas concret : envoyer depuis une adresse @gmail.com](#cas-concret--je-veux-envoyer-depuis-une-adresse-gmailcom)
  - [Brevo (300 e-mails/jour gratuits)](#brevo-300-e-mailsjour-gratuits)
  - [Resend (100 e-mails/jour gratuits)](#resend-100-e-mailsjour-gratuits)
  - [Autres fournisseurs](#autres-fournisseurs)
- [4. Vérifier que les e-mails partent vraiment](#4-vérifier-que-les-e-mails-partent-vraiment)
- [5. Comment ça marche sous le capot](#5-comment-ça-fonctionne-sous-le-capot)
- [6. Réglages disponibles](#6-réglages-disponibles)
- [7. Dépannage](#7-dépannage)
  - [🔴 Le lien mène vers une page « Not Found »](#-le-lien-mène-vers-une-page--not-found)

---

## 1. Parcours élève : mot de passe oublié

### Ce que voit l'élève

```
/connexion
   └─ « Mot de passe oublié ? »  (sous le champ mot de passe)
        ↓
/mot-de-passe-oublie
   └─ saisie de l'adresse e-mail → « Envoyer le lien de réinitialisation »
        ↓  écran de confirmation + compte à rebours avant renvoi
   📧 e-mail reçu (lien valable 30 minutes, usage unique)
        ↓
/reinitialiser?token=…
   └─ vérification du lien → nouveau mot de passe (jauge de robustesse animée)
        ↓
🎉 confirmation + connexion automatique → /tableau-de-bord
```

### Les trois pages

| Route | Fichier | Rôle |
|---|---|---|
| `/connexion` | `src/client/pages/AuthPage.tsx` | lien « Mot de passe oublié ? » |
| `/mot-de-passe-oublie` | `src/client/pages/ForgotPasswordPage.tsx` | demande du lien |
| `/reinitialiser` | `src/client/pages/ResetPasswordPage.tsx` | nouveau mot de passe |

### Ce que l'élève gagne en sécurité

- **Toutes ses autres sessions sont fermées** au moment où le mot de passe change (ordinateur du CDI, téléphone prêté, session volée).
- La session en cours sur l'appareil utilisé reste ouverte : il n'est pas déconnecté pour rien.
- Un e-mail de **confirmation** est envoyé après chaque changement de mot de passe.
- Le lien est **à usage unique** et **invalide après 30 minutes**.
- Demander un nouveau lien **révoque** le précédent.

---

## 2. URGENCE : récupérer un compte administrateur

Le lien par e-mail suppose qu'un fournisseur d'e-mails est configuré. Si ce n'est
pas le cas — ou si la boîte mail du compte n'est plus accessible — il existe une
voie de secours qui ne dépend d'aucun e-mail.

### La procédure (5 minutes)

**Étape 1 — Render → ton service → onglet `Environment`**, ajoute :

| Clé | Valeur |
|---|---|
| `RECOVERY_EMAIL` | l'adresse du compte à dépanner, ex. `admin@monlycee.fr` |
| `RECOVERY_PASSWORD` | un nouveau mot de passe, ex. `NouveauMot2passe` |
| `RECOVERY_MAKE_ADMIN` | `true` *(facultatif : redonne le rôle administrateur)* |

**Étape 2 — `Save Changes`.** Render redéploie automatiquement.

**Étape 3 — Ouvre les `Logs`** pendant le démarrage. Tu dois voir :

```
  🔑 [EduMate] DÉPANNAGE APPLIQUÉ (RECOVERY_EMAIL)
     Compte          : admin@monlycee.fr
     Rôle            : administrateur
     Mot de passe    : remplacé par RECOVERY_PASSWORD
     Sessions        : toutes les sessions précédentes ont été fermées

     🔴 SUPPRIME maintenant RECOVERY_EMAIL et RECOVERY_PASSWORD dans
        Render → Environment, puis redéploie.
```

**Étape 4 — Connecte-toi** sur `/connexion` avec la nouvelle adresse et le nouveau mot de passe.

**Étape 5 — 🔴 SUPPRIME `RECOVERY_EMAIL` et `RECOVERY_PASSWORD`** de Render, puis redéploie.

> **Pourquoi l'étape 5 est obligatoire.** Tant que ces variables existent, le mot de passe est réappliqué **à chaque démarrage** du service. Un redémarrage nocturne de Render écraserait donc silencieusement tout mot de passe changé depuis l'interface.

### Garde-fous

- Le mot de passe doit respecter la politique de l'application (8 caractères minimum, une lettre, un chiffre) — sinon l'opération est refusée et journalisée, rien n'est modifié.
- Si `RECOVERY_EMAIL` ne correspond à **aucun** compte, rien n'est créé : un avertissement est journalisé. Il n'y a donc aucun risque de créer un compte administrateur fantôme par faute de frappe.
- Toutes les sessions du compte sont fermées (y compris celles d'un éventuel intrus).
- L'opération est tracée dans les journaux.

### Et si je ne connais plus l'adresse du compte ?

`RECOVERY_EMAIL` est comparé en minuscules. Pour retrouver les adresses existantes, deux options :

- **Render → Logs**, au démarrage : les promotions et créations de comptes administrateur y sont journalisées.
- Une fois reconnecté en tant qu'administrateur, la page **`/admin`** liste tous les comptes avec leur adresse et leur rôle.

---

## 3. Configurer l'envoi des e-mails

EduMate parle directement aux API des fournisseurs, **sans dépendance** (le `fetch` natif de Node 20). Seul le mode `smtp` charge `nodemailer`.

> ### 🔴 À lire en premier : SMTP est bloqué sur Render
>
> **Depuis septembre 2025, les services web Render du plan gratuit bloquent le trafic sortant vers les ports SMTP 25, 465 et 587.**
>
> Une configuration SMTP par ailleurs parfaite (`smtp.gmail.com`, mot de passe d'application valide) s'y traduit par un **timeout silencieux**, sans message d'erreur explicite. C'est le piège le plus coûteux en temps de toute cette page.
>
> - Source : [changelog Render](https://render.com/changelog/free-web-services-will-no-longer-allow-outbound-traffic-to-smtp-ports)
> - **Sur Render, utilise une API HTTPS** (Brevo, SendGrid, Resend…) : elles passent par le port **443**, jamais bloqué.
> - Le mode `smtp` reste pertinent en **local**, sur un **VPS**, ou sur un plan Render **payant**.
> - EduMate **détecte** cette combinaison (fournisseur `smtp` + hébergement Render + port concerné) et l'affiche au démarrage, dans `/api/admin/mail-status` et en bandeau rouge dans `/admin`.

### Cas concret : je veux envoyer depuis une adresse @gmail.com

Point le plus contre-intuitif de toute la configuration, donc autant l'écrire clairement : **une adresse e-mail ne suffit pas à envoyer des e-mails.** Il faut un prestataire qui relaie les messages, et ce prestataire doit être *autorisé* à parler au nom de ton adresse.

Or **tu ne possèdes pas `gmail.com`** : impossible d'y ajouter les enregistrements SPF/DKIM qui prouvent ton identité. Les messages partent quand même, mais une partie arrive en **indésirables**.

| Solution | Coût | Délivrabilité | Verdict |
|---|---|---|---|
| **SendGrid** + *Single Sender Verification* de l'adresse Gmail | 0 € (100/jour) | 🟠 correcte | **Meilleur compromis sans domaine** : SendGrid envoie un lien de vérification *sur la boîte Gmail*, ce qui légitime l'expéditeur |
| **Brevo** avec `MAIL_FROM` Gmail | 0 € (300/jour) | 🟠 moyenne | Fonctionne, mais expéditeur non authentifié → spam plus fréquent |
| **Domaine à toi** + Brevo/Resend | ~10 €/an | 🟢 excellente | La vraie solution : SPF/DKIM/DMARC alignés |
| SMTP Gmail | 0 € | 🔴 **nulle sur Render** | Ports bloqués |

> 💡 Un domaine coûte **8 à 12 €/an** (OVH, Gandi, Porkbun, Cloudflare). Vérifie d'abord qu'il est libre : un nom non enregistré n'appartient à personne tant qu'il n'est pas acheté. Il sert aussi à donner au site une adresse propre (`edumate.tondomaine.com`) au lieu de `…onrender.com`.

**SendGrid avec une adresse Gmail, pas à pas :**

1. <https://sendgrid.com> → compte gratuit.
2. **Settings → Sender Authentication → Verify a Single Sender**.
3. Renseigne ton adresse Gmail : SendGrid envoie un lien de vérification **sur cette boîte** — clique dessus.
4. **Settings → API Keys → Create API Key** (droit *Mail Send*). La clé commence par `SG.`.
5. Dans Render → **Environment**, ajoute **une seule** variable :
   ```
   MAIL_API_KEY = SG.xxxxxxxxxxxxxxxxxxxx
   ```
   `MAIL_PROVIDER` est déduit du préfixe `SG.`, et `MAIL_FROM` / `MAIL_REPLY_TO` sont déjà posés par `render.yaml`.
6. Vérifie : `/admin` → carte « E-mails » → **Envoyer un e-mail de test**.

### Brevo (300 e-mails/jour gratuits)

Brevo (ex-Sendinblue) est le choix le plus simple depuis la France : interface en français, 300 e-mails/jour gratuits, aucune carte bancaire.

1. Crée un compte sur <https://www.brevo.com> puis valide ton inscription.
2. **Expéditeurs, Domaines & DNS** → ajoute ton adresse expéditeur (ex. `no-reply@ton-domaine.fr`).
3. Si tu utilises ton propre domaine, ajoute les enregistrements DNS proposés (DKIM, DMARC) et attends la validation — **sans cela les messages partent en spam**.
4. ** SMTP & API** → *API v3* → **Generate a new API key**. La clé commence par `xkeysib-`.
5. Dans Render → `Environment` :

```
MAIL_PROVIDER = brevo
MAIL_API_KEY  = xkeysib-xxxxxxxxxxxxxxxxxxxxxxxx
MAIL_FROM     = EduMate <no-reply@ton-domaine.fr>
MAIL_REPLY_TO = ton@email.fr
```

> 💡 `MAIL_PROVIDER` peut rester vide : EduMate reconnaît le préfixe `xkeysib-` et choisit Brevo tout seul. Le renseigner explicitement évite toute ambiguïté.

### Resend (100 e-mails/jour gratuits)

1. <https://resend.com> → **Domains** → *Add Domain* → suis les enregistrements DNS (SPF, DKIM).
2. **API Keys** → *Create API Key*. La clé commence par `re_`.

```
MAIL_PROVIDER = resend
MAIL_API_KEY  = re_xxxxxxxxxxxxxxxxxxxx
MAIL_FROM     = EduMate <no-reply@ton-domaine.fr>
```

### 🔴 SMTP : bloqué sur Render (plan gratuit)

**Ne fonctionne pas sur un service Render gratuit** — ports sortants 25/465/587 fermés, voir l'encadré en tête de cette section. La configuration ci-dessous reste valable **en local**, sur un **VPS**, ou sur un plan Render **payant**.

**Avec Gmail** — le mot de passe du compte **ne fonctionne pas**, il faut un *mot de passe d'application* :

1. Active la **validation en deux étapes** sur <https://myaccount.google.com/security>.
2. Va sur <https://myaccount.google.com/apppasswords> → crée un mot de passe d'application (16 caractères).
3. Dans Render :

```
MAIL_PROVIDER = smtp
SMTP_HOST     = smtp.gmail.com
SMTP_PORT     = 465
SMTP_SECURE   = true
SMTP_USER     = tonadresse@gmail.com
SMTP_PASS     = le mot de passe d'application de 16 caractères
MAIL_FROM     = EduMate <tonadresse@gmail.com>
```

> ⚠️ Avec Gmail, `MAIL_FROM` **doit** être l'adresse du compte `SMTP_USER`, sinon Google rejette le message.

**Avec OVH** : `SMTP_HOST = ssl0.ovh.net`, port `465`, `SMTP_SECURE = true`.
**Avec Outlook** : `SMTP_HOST = smtp.office365.com`, port `587`, `SMTP_SECURE = false` (STARTTLS).

> 🔒 Les e-mails sortants de Render sont limités sur le plan gratuit : SMTP direct vers Gmail fonctionne, mais un fournisseur dédié (Brevo, Resend) reste plus fiable et délivre mieux.

### Autres fournisseurs

| `MAIL_PROVIDER` | Clé attendue (`MAIL_API_KEY`) | Variable supplémentaire |
|---|---|---|
| `sendgrid` | `SG.xxxxx` | — |
| `mailgun` | `key-xxxxx` | `MAILGUN_DOMAIN` (ex. `mg.ton-domaine.fr`) |
| `postmark` | jeton serveur (UUID) | — |
| `log` | *(ignorée)* | écrit les e-mails dans les journaux |
| `none` | *(ignorée)* | désactive complètement l'envoi |

---

## 4. Vérifier que les e-mails partent vraiment

### `/api/health`

Ouvre `https://ton-service.onrender.com/api/health` et regarde le bloc `mail` :

```json
"mail": {
  "provider": "brevo",
  "configured": true,
  "from": "no-reply@ton-domaine.fr",
  "sent": 3,
  "failed": 0,
  "lastSentAt": "2026-10-19T18:12:44.812Z",
  "resetLinkTtlMinutes": 30,
  "resetPath": "/reinitialiser"
}
```

| Champ | Lecture |
|---|---|
| `configured: false` | Aucune clé reconnue → les liens partent dans les **Logs**, pas par e-mail |
| `sent` qui augmente | Les envois aboutissent ✅ |
| `failed` qui augmente | Le fournisseur refuse les messages → lire les Logs |

> 🔒 Ces compteurs sont **agrégés** : aucun destinataire, aucune adresse d'élève n'est exposé. C'est volontaire — la route `/api/auth/forgot` répond pareil que le compte existe ou non, donc sans ces compteurs un échec d'envoi serait totalement invisible.

### Les journaux Render

Un envoi réussi :

```
[EduMate] Lien de réinitialisation envoyé à eleve@lycee.fr (brevo, 30 min).
```

Un envoi refusé :

```
[EduMate] ÉCHEC d'envoi du lien à eleve@lycee.fr : HTTP 403 {"statusCode":403,...}
```

Aucun fournisseur configuré :

```
[EduMate] Aucun fournisseur d'e-mail configuré (MAIL_PROVIDER / MAIL_API_KEY).
           Lien de réinitialisation pour eleve@lycee.fr :
           https://edumateapp.onrender.com/reinitialiser?token=Xy3...
           Valable 30 min, utilisable une seule fois.
```

> 🩹 **Dépannage immédiat sans e-mail** : copie ce lien depuis les Logs et envoie-le toi-même à l'élève (messagerie de l'établissement, ENT…). Il fonctionne exactement comme celui d'un e-mail.

### La ligne de démarrage

```
  🦉 EduMate est prêt
     E-mails         : brevo ✔ (no-reply@ton-domaine.fr)
```

ou, si rien n'est configuré :

```
     E-mails         : non configuré — les liens de réinitialisation partent dans les LOGS
  ⚠️  « Mot de passe oublié » fonctionne, mais aucun e-mail ne part : renseigne
     MAIL_PROVIDER + MAIL_API_KEY (ou SMTP_HOST/USER/PASS) dans Render → Environment.
```

### Test de bout en bout

```bash
# 1. demande un lien
curl -X POST https://ton-service.onrender.com/api/auth/forgot \
     -H 'Content-Type: application/json' \
     -d '{"email":"ton@email.fr"}'

# 2. regarde /api/health : "sent" doit avoir augmenté
curl https://ton-service.onrender.com/api/health
```

La réponse de l'étape 1 est **toujours** `{"ok":true,...}` — c'est voulu, voir [§5](#5-comment-ça-fonctionne-sous-le-capot).

---

## 5. Comment ça fonctionne sous le capot

### Les routes

| Méthode | Route | Rôle |
|---|---|---|
| `POST` | `/api/auth/forgot` | crée un jeton et envoie le lien |
| `POST` | `/api/auth/reset/verify` | teste un jeton **sans** le consommer |
| `POST` | `/api/auth/reset` | applique le nouveau mot de passe |

### Le jeton

```
generateResetToken()  →  32 octets aléatoires, base64url (43 caractères)
        ↓
hashResetToken()      →  empreinte SHA-256  ← SEULE chose écrite en base
        ↓
clé Upstash           →  edumate:pwreset:token:<empreinte>
                         { userId, email, hash, expiresAt, createdAt, ip }
```

**Le jeton brut n'est jamais stocké.** Une fuite de la base ne permet donc pas de se connecter à la place d'un élève.

### Clés utilisées en base

| Clé | Contenu |
|---|---|
| `pwreset:token:<empreinte>` | le jeton et son expiration |
| `pwreset:user:<userId>` | empreinte du jeton actif (pour révoquer le précédent) |
| `pwreset:limit:<email>` | compteur anti-abus (fenêtre d'une heure) |

### Les six règles de sécurité

1. **Empreinte seule** — le jeton brut ne touche jamais la base.
2. **Un seul jeton actif par compte** — une nouvelle demande révoque la précédente.
3. **Usage unique** — effacé dès qu'il a servi, même en cas d'échec ensuite (aucun rejeu).
4. **Durée de vie courte** — 30 minutes par défaut.
5. **Anti-énumération** — réponse identique que le compte existe ou non ; le champ `sent` n'est volontairement **pas** renvoyé, et `devLink` est forcé à `false` en production.
6. **Limitation de débit** — 60 s entre deux demandes et 5 par heure **pour une même adresse**, vérifiées **avant** toute recherche en base (donc elles non plus ne révèlent rien).

### La révocation des sessions

Les jetons de session EduMate sont des JWT **sans état** : le serveur ne peut pas les « débrancher » un par un. La révocation passe donc par un compteur de version :

```
StoredUser.tokenVersion  : 0 → 1  (incrémenté à chaque changement de mot de passe)
JWT.pv                   : la version au moment de l'émission
```

À chaque requête, `attachUser()` compare `pv` à la version courante : toute différence rejette le jeton. La version courante est **mise en cache en mémoire** (une lecture en base par compte et par process, pas par requête) pour ne pas entamer le quota gratuit d'Upstash.

> Un compteur entier plutôt qu'un horodatage : `iat` n'a qu'une résolution d'**une seconde**, ce qui laissait une fenêtre d'environ 1 s pendant laquelle les anciennes sessions survivaient. Avec un entier, la comparaison est exacte.

### En cas de panne de base

`tokenVersionFor()` renvoie `-1` (« version inconnue ») et **rien n'est révoqué**. Un élève ne doit jamais se retrouver enfermé dehors à cause d'un réseau capricieux.

---

## 6. Réglages disponibles

| Variable | Défaut | Rôle |
|---|---|---|
| `MAIL_PROVIDER` | *(vide = auto)* | `resend` `brevo` `sendgrid` `mailgun` `postmark` `smtp` 🔴 *(bloqué sur Render gratuit)* `log` `none` |
| `MAIL_API_KEY` | — | clé du fournisseur |
| `MAIL_FROM` | `EduMate <no-reply@edumate.local>` | expéditeur |
| `MAIL_FROM_NAME` | `EduMate` | nom de l'expéditeur |
| `MAIL_REPLY_TO` | — | adresse de réponse |
| `MAIL_TIMEOUT_MS` | `10000` | délai maximal d'un envoi |
| `MAILGUN_DOMAIN` | — | domaine Mailgun |
| `MAILGUN_BASE_URL` | `https://api.mailgun.net` | région Mailgun (UE : `https://api.eu.mailgun.net`) |
| `SMTP_HOST` `SMTP_PORT` `SMTP_SECURE` `SMTP_USER` `SMTP_PASS` | — / `587` / auto / — / — | serveur SMTP |
| `PASSWORD_RESET_TTL_MINUTES` | `30` | validité du lien (bornée 5–1440) |
| `PASSWORD_RESET_PATH` | `/reinitialiser` | chemin de la page cible |
| `PASSWORD_RESET_COOLDOWN_SECONDS` | `60` | délai minimal entre deux demandes |
| `PASSWORD_RESET_MAX_PER_HOUR` | `5` | plafond horaire par adresse |
| `EXPOSE_RESET_LINK` | `false` (forcé en prod) | renvoie le lien dans la réponse HTTP |
| `APP_URL` | — | base des liens envoyés par e-mail — 🔴 **à mettre à jour à chaque changement de service Render** (auto-corrigé si les deux URL sont en `*.onrender.com`) |
| `RECOVERY_EMAIL` `RECOVERY_PASSWORD` `RECOVERY_MAKE_ADMIN` | — | dépannage d'urgence (voir §2) |

---

## 7. Dépannage

### « Vérifie ta boîte mail » s'affiche mais rien n'arrive

1. `/api/health` → `mail.configured` vaut-il `true` ? Sinon, aucune clé n'est reconnue : les liens sont dans les **Logs**.
2. `mail.failed` augmente ? Lis l'erreur dans les Logs.
3. Regarde dans les **indésirables** — et vérifie que le domaine de `MAIL_FROM` est bien validé (DKIM/SPF) chez le fournisseur.
4. Attends 30 s : la première délivrance d'un domaine neuf peut être lente.

### `HTTP 403` / `401` chez le fournisseur

Clé révoquée, ou domaine expéditeur non vérifié. Chez Brevo et Resend, l'adresse de `MAIL_FROM` **doit** appartenir à un domaine validé.

### `HTTP 422` de Brevo

`MAIL_FROM` n'est pas un expéditeur déclaré. Va dans **Expéditeurs, Domaines & DNS** et ajoute-le.

### SMTP : timeout silencieux, rien dans les logs

🔴 **Tu es sur Render (plan gratuit)** : les ports sortants 25, 465 et 587 y sont fermés depuis septembre 2025. Aucun réglage SMTP ne peut contourner cela. Passe par une API HTTPS (`MAIL_API_KEY` + Brevo/SendGrid/Resend) : port 443, jamais bloqué.

Le diagnostic automatique le signale déjà : `/admin` → carte « E-mails » affiche un bandeau rouge, et le démarrage du serveur écrit `[EduMate] ⚠️ E-mails : Render bloque le port SMTP sortant …`.

### Les e-mails arrivent en indésirables

Expéditeur `@gmail.com` : tu ne peux pas publier de SPF/DKIM pour un domaine qui ne t'appartient pas, donc une partie des messages est filtrée. Deux issues — SendGrid avec *Single Sender Verification* de l'adresse Gmail (correct), ou un domaine à toi avec Brevo/Resend (fiable).

### Erreur SMTP `Invalid login` / `535`

`SMTP_PASS` est le mot de passe du compte au lieu d'un **mot de passe d'application**. Avec Gmail : <https://myaccount.google.com/apppasswords> (validation en deux étapes requise).

### Erreur SMTP `Connection timeout`

Mauvais couple port/`SMTP_SECURE` : `465` exige `true`, `587` exige `false` (STARTTLS).

### 🔴 Le lien mène vers une page « Not Found »

**Cause n°1, de très loin la plus fréquente : `APP_URL` est périmé.**

Quand un service Render est déplacé, renommé ou recréé, son URL change (`edumate-w87j.onrender.com` → `edumateapp.onrender.com`). Mais `APP_URL` est saisie **à la main** dans l'onglet Environment : elle continue donc de pointer vers l'ancien service, qui renvoie désormais un 404.

Le symptôme est particulièrement traître : **rien ne signale l'erreur**. L'e-mail part, le prestataire l'accepte, le lien est parfaitement formé, `/api/health` est au vert — et l'élève clique sur un lien mort.

**Depuis cette version, EduMate s'en occupe tout seul :**

| Situation | Base utilisée |
|---|---|
| `APP_URL` = `https://ancien.onrender.com`, service réel = `https://nouveau.onrender.com` | ✅ **`https://nouveau.onrender.com`** (celle injectée par Render) + avertissement |
| `APP_URL` = `https://edumate.mon-lycee.fr` (domaine personnalisé) | ✅ `APP_URL` — Render ne connaît pas ton domaine, il garde la priorité |
| `APP_URL` absent | ✅ l'URL injectée par Render |
| `APP_URL` absent **et** pas sur Render | ⚠️ avertissement : les liens seraient relatifs |

**Pourquoi ne pas simplement lire l'en-tête `Host` de la requête ?** Ce serait plus automatique, et dangereux : un attaquant peut envoyer `POST /api/auth/forgot` avec un `Host: evil.com` forgé, et le lien reçu par la victime pointerait vers son serveur — il récupérerait le jeton. C'est l'attaque classique par empoisonnement de lien de réinitialisation. `RENDER_EXTERNAL_URL` est posé par la plateforme, jamais par le client : il ne peut pas être forgé.

**Vérifier en un clic** : `/admin` → carte « E-mails » → **« Vérifier maintenant »**. Le serveur appelle réellement `{base}/api/health` et affiche le verdict. La même sonde tourne au démarrage ; une URL morte y déclenche :

```
[EduMate] 🔴 URL des liens INJOIGNABLE : HTTP 404 sur https://ancien-service.onrender.com/api/health
           Les e-mails de réinitialisation contiendraient un lien mort.
           Corrige APP_URL dans Render → Environment
```

**Corrige quand même `APP_URL`** dans Render → Environment : l'auto-réparation est un filet de sécurité, pas une excuse pour laisser une valeur fausse.

### L'e-mail arrive mais le lien ne fonctionne pas

- **« Ce lien a expiré »** → plus de 30 minutes, ou service redémarré avec un stockage en mémoire (`FALLBACK_STORAGE=memory`). Configure Upstash : les jetons doivent survivre aux redémarrages.
- **« Ce lien n'est pas valide »** → déjà utilisé (usage unique), ou adresse recopiée incomplètement.
- Le lien pointe vers `localhost` → `APP_URL` est absent de Render. Ajoute-le, puis redéploie.

### `Trop de demandes pour cette adresse`

C'est la limitation anti-harcèlement : 60 s entre deux demandes, 5 par heure. Le compte à rebours s'affiche à l'écran. Rien d'anormal.

### Je veux tester sans envoyer d'e-mails

```
MAIL_PROVIDER = log
```

Les messages sont écrits dans les journaux, `mail.configured` reste `false`, et le lien apparaît dans les Logs. C'est exactement le comportement par défaut quand rien n'est configuré.

### En local, sans rien configurer

Le serveur affiche le lien dans son terminal **et** le renvoie dans la réponse HTTP (`devLink`), parce que `NODE_ENV` n'est pas `production`. La page de confirmation affiche alors un encart « Mode développement » avec un bouton pour ouvrir directement la page de réinitialisation.

> 🔴 Ce comportement est **impossible en production** : `EXPOSE_RESET_LINK` y est forcé à `false` par le code, quelle que soit la valeur de la variable.

---

## Fichiers concernés

```
src/server/lib/mailer.ts            fournisseurs d'envoi + gabarit HTML des e-mails
src/server/lib/passwordReset.ts     cycle de vie des jetons, anti-abus, purge
src/server/lib/config.ts            lecture des variables MAIL_* / RECOVERY_*
src/server/lib/store.ts             setUserPassword, tokenVersion, cache
src/server/lib/middleware.ts        attachUser : rejet des jetons révoqués
src/server/routes/auth.ts           /forgot, /reset/verify, /reset
src/server/index.ts                 applyAccountRecovery, /api/health
src/shared/password.ts              politique de mot de passe (serveur + client)
src/shared/email.ts                 validation + masquage d'adresse
src/client/pages/ForgotPasswordPage.tsx
src/client/pages/ResetPasswordPage.tsx
src/client/components/ui/PasswordStrength.tsx
src/client/components/ui/AnimatedBadge.tsx
src/client/components/layout/AuthAside.tsx
```

## Tests

```bash
npm run test:unit     # politique de mot de passe, jetons, masquage, gabarit d'e-mail
npm run test:api      # les 3 routes : 34 contrôles (anti-énumération, rejeu, 429…)
npm run test:render   # rendu des 2 pages : 20 contrôles (avec un vrai jeton)
npm run test:routes   # /mot-de-passe-oublie et /reinitialiser rendent sans erreur
```
