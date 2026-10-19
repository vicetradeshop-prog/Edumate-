# 🦉 EduMate — Refonte v2 : Assistant IA & Tableau de bord

> Document de livraison — récapitulatif complet des modifications, de leurs
> causes et de leur vérification. Aucune clé, aucun secret dans ce document.

---

## 1. Aide aux devoirs (assistant IA) — refonte complète

### 1.1 Ce qui n'allait pas (diagnostic)

| Symptôme constaté | Cause racine trouvée dans le code |
| --- | --- |
| « L'IA me répond `<br>` » | Le rendu Markdown échappait **tout** le HTML : les balises de mise en forme produites par les modèles (`<br>`, `<details>`, `<summary>`, `<strong>`…) s'affichaient **brutes**. Le tuteur intégré générait lui-même du `<details>`. |
| « Des trucs en rouge comme si ça avait buggé » | 1) KaTeX était appelé avec `throwOnError: false` : toute formule invalide (faux positifs : prix en `$`, LaTeX approximatif) était rendue **en rouge vif**.<br>2) Le texte était échappé **avant** l'extraction des formules : les `'` et `>` du LaTeX devenaient `&#39;` / `&gt;` → erreur KaTeX.<br>3) Le HTML multi-lignes produit par KaTeX (SVG des racines carrées) était **déchiqueté** par le découpage Markdown (attribut `d` des `<path>` tronqué → erreurs console + artefacts). |
| « Le chat n'est pas gros, l'historique et les idées prennent trop de place » | Colonne latérale fixe de 290 px contenant historique + 6 suggestions + carte d'entraînement, en permanence. |
| Réponses peu adaptées | Prompt système générique, sans structure imposée par mode ni consigne d'adaptation au niveau. |

### 1.2 Ce qui a été fait

**Interface (`src/client/pages/TutorPage.tsx`, réécrite)**
- La conversation occupe **toute la page** : panneau de chat pleine largeur,
  hauteur calculée pour que le composer reste visible sans défilement.
- **Historique** déplacé dans un **tiroir latéral animé** (slide + scrim,
  fermeture par Échap/clic extérieur) : titre, matière, nombre de messages,
  aperçu, suppression.
- **Idées de demandes** : cartes-suggestions dans l'état vide (grille animée en
  cascade) + rangée de puces **dépliable** au-dessus du composer (bouton 💡).
- **Streaming SSE** : la réponse arrive mot à mot avec curseur clignotant ;
  bouton **stop** pendant la génération ; repli automatique et silencieux sur
  la requête JSON classique si le flux échoue.
- **Actions par message** : Copier (presse-papiers), Régénérer (relance la
  dernière question), Réessayer (après une erreur, sans perdre la question).
- Erreurs transformées en **carte d'erreur propre** (icône, message humain,
  bouton Réessayer) au lieu d'un texte inquiétant.
- Composer moderne : champ auto-grandissant, **Entrée** pour envoyer,
  **Maj + Entrée** pour un saut de ligne, compteur 0/4000, focus rendu après
  chaque envoi, bouton « revenir en bas » quand on relit la conversation.
- En-tête : pastille de statut animée (« IA en ligne » / « Tuteur intégré »),
  boutons Nouvelle discussion / Historique.
- Animations : apparition des bulles (spring doux), avatar « pop », fondu du
  tiroir, cartes-suggestions en cascade — tout respecte `prefers-reduced-motion`
  et le réglage compte « animations désactivées ».

**Qualité des réponses (`src/server/lib/ai.ts`)**
- Prompt système durci : **interdiction du HTML**, structure de réponse
  imposée **par mode** (`MODE_FORMATS` : sections `## …` attendues), adaptation
  explicite au niveau (Troisième/Seconde ≠ Première/Terminale), gestion des
  questions imprécises (répondre sur l'interprétation probable + confirmer).
- Nouveau flux `chatCompletionStream` (SSE fournisseur compatible OpenAI) avec
  annulation si l'élève quitte/stoppe, et repli intelligent : rien reçu →
  tuteur intégré (émis par fragments pour l'effet machine à écrire) ; réponse
  coupée en cours → conservation du déjà-reçu + note transparente.
- Contenu des modèles **nettoyé côté serveur** avant persistance
  (`sanitizeModelContent`) : l'historique stocké est propre.

**Rendu du texte (`src/shared/markdownSanitize.ts` nouveau + `src/client/lib/richtext.ts`)**
- Convertisseur HTML→Markdown liste blanche : `<br>` → vrai saut de ligne,
  `<details>/<summary>` → gras/paragraphe, `<strong>`, `<em>`, titres, listes,
  citations, tableaux, liens http(s)… Le HTML **non reconnu** (`<img>`,
  `<script>`…) reste échappé : **la protection XSS est inchangée** (tests).
- Formules extraites **avant** échappement, rendues par KaTeX avec
  `throwOnError: true` + repli texte brut : **plus jamais de rouge**.
- Rendus KaTeX isolés sous forme de jetons avant le découpage Markdown :
  plus de SVG déchiqueté.
- Garde-fou anti faux positifs : `5 $ et 10 $` n'est plus pris pour du LaTeX.
- Sauts de ligne forcés Markdown (deux espaces / `\`) désormais supportés.

**API (`src/server/routes/tutor.ts`)**
- Nouvelle route `POST /api/tutor/ask/stream` (SSE : `delta`, `done`, `error`),
  flush compatible compression, `X-Accel-Buffering: no`, persistance de la
  conversation même si l'élève se déconnecte en cours de génération.
- `POST /api/tutor/ask` conservé à l'identique (tests, coach, repli client).

---

## 2. Tableau de bord — section « À réviser »

### 2.1 Ce qui n'allait pas
- Les lignes **sortaient du cadre** de la carte : enfants de grille CSS sans
  `min-width: 0` → la colonne s'élargissait au min-content du titre (long,
  non cassable) et débordait de la carte.
- Le bas de la carte n'était aligné sur rien.
- Liste statique de 10 leçons : haute, et on ne voyait pas la suite sans
  deviner.

### 2.2 Ce qui a été fait
- **Carrousel doux** (`RevisionCard.tsx` réécrit) : fenêtre à hauteur bornée,
  les leçons défilent **lentement de haut en bas** en boucle **sans couture**
  (distance de boucle mesurée au pixel via ResizeObserver), **pause au survol
  ou au focus**, fondu haut/bas. Peu de leçons → aucune animation.
  `prefers-reduced-motion` / « animations off » → défilement manuel classique.
  La copie nécessaire à la boucle est masquée aux lecteurs d'écran et hors
  Tabulation.
- **Anti-débordement** : chaîne complète de `min-width: 0` (carte → fenêtre →
  piste → groupe → enfants de grille → ligne) ; titres tronqués avec points de
  suspension **à l'intérieur** du cadre.
- **Alignement parfait** : nouvelle variante de grille `.dash-split`
  (colonnes étirées, dernière carte de chaque colonne en `flex: 1`) → le bas de
  « À réviser » est aligné **au pixel** sur le bas de « Derniers quiz »
  (vérifié automatiquement : 1577,23 px = 1577,23 px).

---

## 3. Vérifications effectuées

| Suite | Résultat |
| --- | --- |
| `npm run typecheck` | ✅ 0 erreur |
| `npm run build` (data + client + serveur) | ✅ |
| `npm run test:unit` | ✅ **79/79** (dont 9 nouveaux tests : `<br>`, `<details>`, racine carrée, apostrophes LaTeX, prix en dollars, artefacts de pensée, XSS…) |
| `npm test` (unit + content + smoke API) | ✅ **114/114** |
| `npm run test:render` (toutes les pages, jsdom) | ✅ **58/58**, aucun incident React |
| `npm run test:ui` (régressions UI) | ✅ **48/48** |
| `node scripts/check-page.mjs --all` | ✅ 5/5 |
| E2E SSE local (script jetable, depuis retiré) | ✅ 18/18 : 49 fragments, 1er fragment < 50 ms, contenu == concaténation, conversation persistée |
| Vérification navigateur headless (Puppeteer) | ✅ alignement des bas de cartes au pixel, 0 débordement, 0 erreur console, captures desktop + mobile |

Comportement de transition garanti : un ancien serveur sans la route SSE
répond 404 → le client bascule automatiquement sur `/api/tutor/ask`
(fonctionnel, sans streaming).

---

## 4. Fichiers touchés

```
M  src/client/pages/TutorPage.tsx                      (réécrite)
M  src/client/components/progress/RevisionCard.tsx    (réécrite)
M  src/client/pages/DashboardPage.tsx                  (classe .dash-split)
M  src/client/lib/richtext.ts                          (ordre rendu + jetons + sauts)
M  src/client/lib/api.ts                               (endpoints.askStream)
M  src/client/styles/layout.css                        (chat v2, tiroir, dash-split)
M  src/client/styles/lessons.css                       (carrousel « À réviser »)
M  src/server/lib/ai.ts                                (prompt, streaming, repli)
M  src/server/routes/tutor.ts                          (route SSE /ask/stream)
M  scripts/unit-test.ts                                (9 tests ajoutés)
A  src/shared/markdownSanitize.ts                      (HTML→Markdown sûr)
```

---

## 5. Mise en ligne

1. `git push` vers `github.com/vicecodingnn/edumate` (branche `main`).
2. Render redéploie automatiquement (`autoDeploy: true`, blueprint `render.yaml`).
3. Rien d'autre à configurer : pas de nouvelle variable d'environnement.
   (La clé Groq déjà en place continue de servir ; le streaming s'active
   tout seul avec le nouveau client.)

---

# 🆕 Version 2.1 — Sidebar dépliable & Fiches de révision automatiques

## A. Barre latérale allégée (sections dépliables)

- Les trois sections (**Apprendre**, **Outils**, **Mon espace**) sont désormais
  **repliables** : un clic sur le titre ouvre/ferme le groupe.
- Animation : hauteur animée (0 ↔ auto) + entrées qui glissent en cascade +
  chevron rotatif + icône de section qui « pop » au survol.
- L'état ouvert/fermé est **mémorisé** (localStorage) et le groupe contenant la
  page courante s'ouvre automatiquement à chaque navigation.
- Une **pastille** signale une entrée active située dans un groupe replié.
- Par défaut : « Apprendre » ouvert, « Outils » et « Mon espace » repliés →
  barre beaucoup plus courte et lisible.
- Accessibilité : `aria-expanded`, `aria-controls`, vrais boutons.
- Nouvelle entrée **« Fiches de révision »** dans Apprendre.

## B. Fiches de révision automatiques (leçon → fiche)

Parcours complet : **quiz → leçon → fiche créée automatiquement**.

- `POST /api/lessons/:topicId/complete` : appelé à la fin de chaque leçon ;
  si ≥ 70 % des exercices sont justes, la fiche du sujet est **débloquée**
  (enregistrement persisté par compte : date, score). Sinon réponse `success:
  false` avec message d'encouragement.
- `GET /api/lessons/fiches` : hub de toutes les fiches débloquées.
- `GET /api/lessons/fiches/:topicId` : fiche complète ; si non débloquée →
  404 `fiche_verrouillee` + écran « verrou » pédagogique côté client.
- Contenu **dérivé automatiquement** de la leçon (jamais stocké, toujours
  à jour) : sections « L'essentiel », « Notions clés », « Méthode en action »,
  « Pièges à éviter », « À retenir », « Astuce », encadré **formules KaTeX**,
  et **cartes mémo recto/verso** (exercices, pièges, récap).
- Page fiche : onglet « La fiche » (sections en cascade animée) et onglet
  « Cartes mémo » (retournement **3D**, navigation ←/→, espace pour
  retourner, mélange, points de progression).
- Écran final de leçon : **bannière animée** de déblocage (« Fiche créée ! »
  avec lien direct) ou bannière « verrou » avec bouton Rejouer.
- Page de résultat de quiz : boutons « Voir la leçon » et « Ma fiche de
  révision » + astuce expliquant le déblocage.
- Données personnelles : clé `fiches:{userId}` incluse dans l'export RGPD et
  la suppression de compte.

## C. Vérifications 2.1

- `test:unit` 81/81 (seuil 70 %, génération sections/cartes/formules) ;
- `test:api` 123/123 dont 9 contrôles fiches (verrou, échec, succès,
  already, hub, détail, 400) ;
- `test:render` 60/60 (hub + détail verrouillés rendus sans incident) ;
- Vérification navigateur : sidebar repliée/dépliée, hub, fiche, flip 3D,
  parcours de leçon complet jusqu'à la bannière de déblocage — 0 erreur
  console (hors 404 volontaire « fiche verrouillée »).

---

# 🔎 Version 2.2 — Recherche rapide fiabilisée & sublimée

## Le bug corrigé
Le panneau de résultats **restait bloqué à l'écran** après avoir cliqué sur un
résultat (ou selon les parcours : perte de focus, défilement…). Deux causes :
1. aucune fermeture sur perte de focus / défilement / Échap / navigation ;
2. l'`AnimatePresence` de framer-motion (qui maintient le nœud pendant
   l'animation de sortie) entrait en conflit avec le `Suspense` des routes
   paresseuses : un **panneau fantôme** survivait à la navigation.

## Le correctif
- Fermeture garantie dans TOUS les cas : clic/tap extérieur, perte de focus
  (différée 150 ms pour laisser les clics aboutir), Échap, Tab, navigation,
  défilement de la page, sélection d'un résultat, validation.
- **Suppression d'AnimatePresence** sur ce panneau : montage/démontage
  synchrone + animation d'entrée seule → fermeture instantanée, plus aucun
  nœud fantôme possible (vérifié au navigateur : 9 scénarios de fermeture).
- Navigation clavier complète : ↓ ↑ pour choisir, Entrée pour ouvrir,
  Échap pour fermer, `role=combobox/listbox/option` + `aria-activedescendant`.

## Le nouveau design
- Champ pillulaire avec anneau lumineux au focus, icône qui devient spinner
  pendant la recherche, bouton ✕ animé (rotation) pour effacer.
- Panneau : en-tête « N sujets trouvés » + aide clavier, résultats en cascade
  animée, tuile emoji teintée par matière, **texte correspondant surligné**
  (mark dégradé), flèche qui glisse au survol, pied « Voir tous les résultats ».
- États soignés : squelettes de chargement, « aucun résultat » illustré.

---

# 🗓️ Version 2.3 — Planning de révision automatique

## Principe
L'élève ajoute ses contrôles ; EduMate génère un programme jour par jour à
partir de sa **maîtrise réelle** (essais de quiz), puis le **recalcule en
continu** : le planning n'est jamais stocké figé, il est dérivé à chaque
lecture des données de progression + des états de séances persistés
(terminée / reportée / ignorée). Aucune donnée fictive, aucun système
parallèle : tout réutilise quiz, leçons, révisions, fiches, calendrier et
progression existants.

## API (`/api/planning`)
- `GET /exams` · `POST /exams` (validation complète, notions auto-proposées
  si vide, événement calendrier « examen » créé automatiquement) ;
- `GET /exams/:id` (planning calculé) · `POST /exams/:id/generate` ;
- `PATCH /exams/:id` (temps/jour, date, clôture, ressenti, note) ;
- `DELETE /exams/:id` (supprime aussi états de séances + événement agenda) ;
- `POST /exams/:id/sessions/:sessionId` → `done | postponed | skipped | prevue`
  (le report décale la séance d'un jour, le planning se réorganise autour) ;
- `GET /today` → vue agrégée du jour, temps réparti entre plusieurs contrôles
  selon urgence × faiblesses.

## Moteur (`server/lib/planning.ts`)
- Priorités 🔴🟠🟡🟢 : taux de réussite réel, erreurs, ancienneté de la
  dernière révision, niveau auto-déclaré et urgence (jours restants).
- Journées types : découverte/cours → notions faibles + exercices →
  entraînement → **quiz blanc la veille** (difficulté adaptée) → **révision
  express le jour J** (5-10 min, rappels + erreurs fréquentes, jamais une
  grosse session).
- Budget quotidien respecté (10 min → 1 h, ou personnalisé) ; plusieurs
  contrôles → répartition proportionnelle à l'urgence.
- Cas limites gérés : contrôle aujourd'hui (express seul), aucune notion
  saisie (sujets fragiles proposés), aucun historique (niveau déclaré),
  contrôle passé, reports en cascade bornés au jour J.

## Interface
- Sidebar : entrée « Planning » ; boutons « + Ajouter un contrôle » dans
  Devoirs, Calendrier et le hub.
- Modale de création animée → écran de succès → bouton « Générer mon
  planning ».
- Hub `/planning` : onglets Aujourd'hui (barre de répartition animée du
  temps) / Cette semaine / Contrôles (cartes avec anneau de préparation).
- Détail `/planning/:id` : hero (J-x, anneau), résumé « Préparer ce contrôle »
  (notions, questions, exercices, quiz blanc, durée totale), priorités
  animées, timeline jour par jour, séances détaillées (durée, objectif,
  décompte des temps, boutons Commencer/Terminer/Reporter/Ignorer), clôture
  « Comment ça s'est passé ? » + note.
- Dashboard : carte « 🎯 Ta prochaine révision » (contrôle, date, % préparé,
  séance du jour, bouton Commencer).
- « Commencer la séance » route vers l'outil existant adapté (leçon, quiz,
  révision interactive) : zéro duplication.

## Vérifications
unit 85/85 (moteur : budget, quiz blanc, express, report, multi-contrôles) ·
api 134/134 (12 contrôles planning) · render 62/62 · navigateur : création
via modale, génération, report, dashboard, persistance après reconnexion,
mobile — 0 erreur console.

---

# 🎯 Version 2.4 — Planning ciblé par thème, rattaché aux quiz & au calendrier

## Ce que l'élève choisit : le THÈME
- La modale demande maintenant : matière → **thème** (ex. « Suites »,
  « Algèbre ») → notions facultatives (chips = sujets du thème).
- Le planning ne travaille QUE sur les quiz/leçons du thème : chaque séance
  pointe vers un sujet réel du catalogue (`/lecons/:id`, `/quiz/:id/jouer`,
  `/quiz/:id/revision`).

## Rattachement réel aux quiz (détection de complétion)
- Règle **anti-conflit** : seuls les essais de quiz **postérieurs à la création
  du contrôle** valident une séance. Un quiz fait AVANT la saisie du planning
  ne grisera jamais une séance rétroactivement (testé).
- Chaque essai valide **une** séance, dans l'ordre chronologique du plan ;
  la séance passe en « Terminée automatiquement · quiz lié » avec le score,
  se grise, et la progression (anneau, %) suit immédiatement.
- Les séances « cours » se valident via la réussite de leçon (fiche).
- Conséquence : le planning est un **outil** connecté à la progression, pas un
  système parallèle — aucun doublon de données de quiz.

## Séances verrouillées hors de leur jour
- Impossible de commencer une séance future : bouton remplacé par
  « 🔒 Disponible demain / lundi 6 octobre… ». Le jour venu, elle s'ouvre.

## Planning dans la section OUTILS
- Entrée sidebar déplacée dans « Outils » (« Planning de révision »).

## Synchronisation calendrier
- À la génération, chaque séance crée un événement agenda (« Révision ·
  notion (X min) », kind travail) ; un report **déplace** l'événement ;
  une séance terminée le coche ; ignorer/clôturer/supprimer le retire.
- La correspondance séance↔événement est stockée sur le contrôle
  (`sessionEvents`) : aucune duplication, aucun orphelin.

## Confort de lecture & animations
- Carte séance simplifiée : pastille durée, une ligne activité/notion,
  priorité, objectif court, déroulé dépliable.
- Compteurs animés du résumé, progression « x/y séances » par jour, badge
  thème, ressorts sur les badges, cascades conservées.
- Durées toujours entières (bug « 2 h 26,800000000000001 » corrigé).
- Contrôle passé : plus aucune séance fantôme, notice de clôture.

## Vérifications
unit 87/87 (auto-complétion anti-conflit, contrôle passé) · api 142/142
(thème, calendrier sync, report sync, quiz lié, nettoyages) · render 62/62 ·
navigateur : création par thème, verrous (11 futures / 3 jouables),
auto-grisement après quiz lié, calendrier rempli, dashboard, mobile — 0 erreur.

---

# 🔁 Version 2.5 — Cohérence leçons ↔ quiz ↔ planning ↔ progression

## Leçons : validation à 80 % et historique réel
- Une leçon n'est **validée qu'à ≥ 80 %** d'exercices justes (seuil partagé
  `LESSON_VALIDATE_RATIO`) ; en dessous, l'écran final propose clairement
  « Rejouer la leçon » (même leçon, rien n'est perdu) et aucune fiche n'est
  créée.
- **Chaque terminé de leçon est enregistré** (`lessons:{userId}:results`) :
  score, durée réelle mesurée par le lecteur d'étapes, horodatage.
- Page **Progression** : nouvelle carte « Leçons terminées » (visible même
  sans aucun quiz) : meilleur score, nombre de terminés, temps cumulé,
  badge « ✔ validée » ou « à rejouer ».
- **Objectif du jour** du tableau de bord : les minutes de leçon s'ajoutent
  aux minutes de quiz (`lessonSecondsToday`).
- Hub des leçons : badge « ✔ Leçon validée » / « x % · à rejouer » sur chaque
  ligne.

## Planning : notions à deux cases + priorités expliquées
- Chaque notion du contrôle affiche **deux cases** : « Quiz ≥ 80 % » et
  « Leçon validée » ; les deux cochées → **notion validée** (carte verte,
  priorité abaissée, séances allégées).
- Priorités recalculées avec une formule lisible : maîtrise réelle, meilleur
  score, erreurs accumulées, ancienneté de révision, pression du contrôle,
  cases manquantes — et **raisons affichées** sous chaque notion
  (« 42 % · 3 erreurs · non revue depuis 5 j · J-2 · leçon à valider »).
- Séances « cours » auto-grisées quand la leçon est validée après la création
  du contrôle ; séances quiz auto-grisées quand le quiz lié est joué après
  (règle anti-rétroactivité conservée).
- Encart pédagogique « 1 leçon → 2 quiz → 3 notion validée » pour ne jamais
  se perdre ; mini-badges Q/L sur chaque séance.

## Bugs corrigés
- Bouton « Générer mon planning » collé au texte (écart de 18 px vérifié).
- Durées décimales (« 2 h 26,800000000000001 ») → arrondi garanti au moteur.
- Contrôle passé : plus aucune séance fantôme + notice de clôture.
- Carte « Leçons terminées » visible même sans historique de quiz.

## Vérifications
unit 88/88 · api 146/146 (case leçon cochée, seuil 80 %, temps compté) ·
render 62/62 · ui 48/48 · navigateur : leçon < 80 % → bannière « pas encore
validée + Rejouer », leçon ≥ 80 % → « Fiche créée ! », progression remplie,
cases des notions, bouton décollé — 0 erreur console.

---

#  Version 2.5.1 — Bug du « rejouer » corrigé + cohérence de l'écran final

## Le bug signalé
Après un premier essai de leçon raté (67 %), rejouer la leçon et réussir
(100 %) affichait encore l'ancien résultat : la bannière restait sur
« pas encore validée : 67 % » et aucune fiche n'était créée.

**Cause** : le bouton « Rejouer ce parcours » de l'écran final réinitialise la
partie SANS changer l'identifiant de playthrough. Le garde-fou « notifier la
fin une seule fois » du lecteur d'étapes croyait avoir déjà notifié et le
serveur n'était jamais rappelé → bannière figée sur l'essai précédent.

**Correctif** : dès que `finished` repasse à false (rejouer), le garde-fou ET
le chrono sont réinitialisés : chaque fin de parcours appelle le serveur avec
son vrai score. Vérifié au navigateur : essai raté → bannière 0 % + seuil
rappelé ; rejouer → 100 % → « 🎉 Fiche de révision créée ! ».

## Un seul bouton Rejouer, aucun conflit
- La bannière « leçon non validée » ne porte PLUS son propre bouton : elle
  informe (score, meilleur score, seuil 80 %) et renvoie vers l'unique bouton
  de l'écran final.
- Ce bouton devient **principal** (« Rejouer la leçon », variant primary)
  tant que la leçon n'est pas validée, puis redevient secondaire
  (« Rejouer ce parcours ») une fois validée : même action, même effet,
  quel que soit le chemin choisi.

## Cohérence de l'écran final
- Confettis et « Mission accomplie ! » réservés à la vraie validation
  (≥ 80 %) ; entre 50 et 79 % : « Bien joué ! » + rappel visible
  « 🔒 Validation à partir de 80 % — ton meilleur score est conservé ».
- Objectif du jour : plancher à 1 min dès qu'une seconde de quiz ou de leçon
  a été travaillée (plus de « 0 min » décourageant).

## Vérifications
Navigateur : scénario exact de l'utilisateur (raté → rejouer → réussi) OK,
0 erreur console · unit 88/88 · api 146/146 · render 62/62 · ui 48/48.

---

# 🛡️ Version 2.5.2 — Un échec ne valide plus rien

## Le bug signalé
Un quiz lié joué **sous 80 %** grisait quand même la séance du jour dans le
planning (« comme si c'était fait »), alors que l'élève n'avait pas réussi.

## La règle corrigée (cohérente partout)
Une séance quiz ne s'auto-complète que si l'essai du quiz lié est
**POSTÉRIEUR à la création du contrôle ET ≥ 80 %**. Un échec :
- laisse la séance « à faire » (grise rien, ne gonfle pas la progression) ;
- affiche un badge orange « quiz à repasser » sur la séance ;
- alimente les raisons de la notion : « quiz à repasser ≥ 80 % »,
  « leçon à valider + quiz à repasser ≥ 80 % »…
Les séances **reportées** peuvent désormais être validées automatiquement
elles aussi (le report déplace le jour, il n'annule pas un travail réussi).

## Vérifications
Navigateur : quiz lié à 20 % → séance `prevue`, auto=false, progression 0 %,
badge retake, 0 erreur console · unit 89/89 (nouveau test « échec ne valide
rien ») · api 146/146 (assertion conditionnelle réussite/échec) ·
render 62/62 · ui 48/48 · routes 5/5.

---

# 💅 Version 2.6 — Audit planning, refontes Contrôles & Fiches, recommandation musicale

## Audit complet du planning (bugs & incohérences trouvés puis corrigés)
1. **Vue « Cette semaine » périmée** : après un report/une validation depuis
   cette vue, les plans n'étaient pas rechargés → rechargement systématique.
2. **Jour de référence en UTC** : un élève français travaillant tard voyait
   « aujourd'hui » basculer un jour trop tôt (verrous, séances du jour).
   Le jour de référence est désormais **Europe/Paris** côté serveur ET client
   (`appToday()`), cohérent avec les labels Aujourd'hui/Demain.
3. **Libellés de disponibilité** calculés en UTC → passés en jour applicatif.
4. **Erreur console CSP** : favicons de webradios en `http://` bloqués →
   les favicons externes ne s'affichent qu'en `https:` (sinon repli emoji).
5. Troncatures abusives (titres de contrôles coupés à 2 mots, « 1 fiches »,
   stats de fiches sur deux lignes) → typographies corrigées.

## Refonte de l'interface « Contrôles » du planning
Cartes façon couverture : bandeau dégradé à la couleur de la matière avec
emoji et titre complet (2 lignes), compte à rebours **J-x pulsant** si ≤ 2 j,
tampon « TERMINÉ » incliné, anneau de préparation, faits alignés
(date · séances · notions · min/j), aperçu de la prochaine séance avec l'icône
de son activité, bouton d'action plein. Entrée en cascade, survol lumineux.

## Refonte de l'onglet « Fiches de révision »
- Hub : héro dégradé plein large avec filigrane et **compteurs animés**
  (fiches, cartes mémo, quiz ≥ 80 %), cartes-couvertures (emoji géant,
  pastille « N cartes », stats en chips, pied « Ouvrir → »), cascade + survol.
- Détail : héro dégradé à la couleur du sujet (filigrane, badges, anneau 100),
  sections en **ligne de temps** avec nœuds iconisés et items en cascade,
  formules en tuiles KaTeX qui « pop », scène de cartes agrandie avec barre
  de progression du paquet, index sur la carte, flip 3D conservé.

## Musique : recommandation « Nodey — No Title »
- **Aucun téléchargement spotdl / rip** : ce serait une contrefaçon. EduMate
  ne récupère jamais de musique protégée.
- À la place : carte « Recommandation » (outil Musique + lecteur du topbar)
  avec disque vinyle animé ; si un fichier **dont l'élève détient les droits**
  est déposé dans `public/music/nodey-no-title.mp3`, il est détecté
  automatiquement (sonde HEAD) et devient jouable dans le site (boucle,
  volume, visualiseur via AnalyserNode) ; sinon la carte propose les liens
  d'écoute officiels (Spotify, YouTube, Deezer) + explication claire.
- Moteur : nouvelle source « fichier » exclusive des ambiances (jouer l'une
  coupe l'autre), `public/music/README.md` documente l'ajout légal.

## Vérifications
unit 89/89 · api 146/146 · render 62/62 · ui 48/48 · navigateur : hub
planning (2 contrôles), fiches hub + détail + cartes, musique + topbar,
mobile — **0 erreur console** (CSP favicon corrigée).

---

# ✨ Version 2.7 — Cartes contrôles alignées, fiches relisées, jeu de cartes, musique

## Cartes « Contrôles » du planning : alignement parfait
Structure à hauteurs fixes (couverture 68 px, trois rangées de faits 20 px,
aperçu de séance 46 px, pied) : quelle que soit la longueur des textes, toutes
les cartes d'une rangée sont alignées au pixel (vérifié : 280/280 px).
Animations ajoutées : balayage lumineux périodique du bandeau, compte à rebours
pulsant, entrée en cascade, survol qui soulève et fait briller.

## Fiche de révision : relecture totale
- Héro apaisé (dégradé léger, badges, actions Leçon/Quiz).
- Sections aérées : en-tête iconisé + compteur de points, items en rangées
  larges (interligne 1.65), puces colorées, encart distinct pour l'astuce.
- Formules en grandes tuiles centrées (KaTeX display).

## Nouveau jeu de cartes mémo : « le paquet »
- Pile de cartes visibles sous la carte du dessus ; HUD (carte x/y, barre de
  progression, compteur de réussites, mélange).
- On retourne (clic / espace), puis auto-évaluation « Je savais » / « À revoir »
  (← / →) : la carte **s'envole** à droite ou à gauche, la suivante surgit.
- Bilan de manche animé : score en anneau, confettis si ≥ 80 %, liste « À revoir
  bientôt », boutons « Refaire les cartes ratées » / « Mélanger tout rejouer ».

## Musique : recommandation « Nodey — No Title » enfin fonctionnelle
Trois bugs réels trouvés et corrigés :
1. **Repli SPA** : un fichier audio absent répondait `index.html` 200 → la
   sonde croyait le fichier présent. Le serveur renvoie désormais un vrai 404
   pour tout chemin avec extension inexistant.
2. **Compression gzip** : le middleware compressait l'audio ; un élément
   `<audio>` ne décompresse pas → `NotSupportedError`. Médias exclus de
   `compression()`.
3. **Premier `play()` refusé** par certains navigateurs : `load()` + un seul
   retry, et toast explicite si échec.
Le service worker n'intercepte ni ne met en cache les médias (purge des
entrées polluées au passage, VERSION v3).
Interface : héro recommandé en tête de page (disque vinyle animé, égaliseur
quand ça joue, badge EN LECTURE), présent aussi dans le lecteur du topbar.
Sans fichier détecté : aucun bouton mort — étapes d'activation en 30 s et
liens d'écoute officiels.

## Rappel important (droits d'auteur)
Le titre recommandé n'est PAS fourni et ne sera jamais téléchargé via spotdl
ou similaire (contrefaçon). Dépose légalement le fichier dans
`public/music/` (`.mp3`, `.wav`, `.ogg`, `.m4a`) : il est détecté et jouable
instantanément. Voir `public/music/README.md`.

## Vérifications
Lecture réelle testée au navigateur (fichier témoin déposé puis retiré) :
EN LECTURE ✔ pause ✔ état absent propre ✔ · cartes contrôles alignées au
pixel ✔ · jeu de cartes complet (3 cartes notées, HUD) ✔ · unit 89/89 ·
api 146/146 · render 62/62 · ui 48/48 · 0 erreur console.

---

# 🎧 Version 2.7.1 — Popover musique fiable, recommandation compacte, source audio au choix

## Popover « Musique » du topbar : bug de fermeture corrigé
Le panneau ne se fermait que par son X ou en recliquant sur Musique (effet
toggle) : il restait collé à l'écran. Désormais il se ferme au **clic/tap
extérieur**, à la touche **Échap** et au **changement de page** (testé sur les
trois scénarios).

## Recommandation compacte et décollée
Le héro « Nodey — No Title » passe de ~340 px à **~185 px** et gagne une
marge de 20 px avec le lecteur : plus de sensation de « toute la page » ni de
collage avec « Lo-fi studieux ». Disque vinyle, égaliseur et badge EN LECTURE
conservés.

## Deux façons légales d'activer le titre recommandé
EduMate ne télécharge et n'embarque jamais un enregistrement protégé
(Mediafire/spotdl/rips = contrefaçon, et Mediafire bloque le streaming
direct). Deux mécanismes propres, au choix :
1. **Fichier local** : déposer LE fichier que tu possèdes (celui de ton
   Mediafire, si tu as le droit de l'héberger) dans `public/music/` sous
   `nodey-no-title.mp3` / `.wav` / `.ogg` / `.m4a` → détection automatique,
   lecture intégrée (boucle, volume, visualiseur).
2. **URL hébergée** : variable d'environnement Render
   `RECOMMENDED_MUSIC_URL=https://…` (serveur : `GET
   /api/services/music/recommended`) → streaming direct depuis ton hébergeur
   (lecture sans routage WebAudio pour respecter le CORS).
Sans source : carte informative avec les étapes et les liens officiels —
jamais de bouton mort.

## Corrections audio complémentaires (rappels v2.7)
404 réel sur extension manquante (fini l'index.html servi pour un audio
absent), médias exclus de la compression gzip (décodage cassé), retry de
`play()`, service worker hors médias.

## Vérifications
Popover : extérieur ✔ Échap ✔ navigation ✔ · reco 185 px + gap 20 px ✔ ·
lecture réelle fichier témoin ✔ puis retiré ✔ · endpoint recommended 200 ✔ ·
unit 89/89 · api 146/146 · render 62/62 · ui 48/48 · 0 erreur console.

---

# 🎧 Version 2.7.2 — Popover fiable partout, reco rejouable, badge retiré

## Popover Musique : fermeture fiable à 100 %
Certains composants coupent la propagation du clic (cartes de quiz,
calendrier, boutons du topbar…) : le clic extérieur n'arrivait parfois pas
au gestionnaire de fermeture. `useDismiss` écoute désormais en **phase
capture** (+ `touchstart` pour mobile) : document reçoit l'événement AVANT
ces coupures. Vérifié : clic extérieur ✔ Échap ✔ navigation ✔ clic sur une
carte à stopPropagation ✔.

## « Impossible de relire la recommandation » : DEUX causes racines
1. **Ramp de gain résiduel** : `stopLocal()` programme un fondu du volume
   vers ~0 sur 0,25 s ; au redémarrage de la reco, ce fondu continuait et
   remettait le silence. → `cancelScheduledValues()` + gain net.
2. **Routine asynchrone périmée** : le `await radio.play()` d'une ambiance
   abandonnée entre-temps se terminait plus tard et **écrasait `playing`**
   avec l'état radio, coupant la reco relancée. → **époque de lecture**
   (`playEpoch`) : toute intention utilisateur incrémente l'époque ; une
   routine qui se termine après un changement d'avis n'écrit plus rien.
   + gardes : `fallbackToLocal` et `onExhausted` inoffensifs si une reco
   joue ; radio qui repart seule pendant une reco → coupée ; auto-guérison
   si un acteur tiers met l'élément en pause.
Scénario testé au navigateur : reco → ambiance → reco = **relecture OK**.

## Recommandation : badge technique retiré
« Fichier local détecté ✔ » (info interne inutile) supprimé de la carte.

## Vérifications
Popover 4 scénarios ✔ · reco → ambiance → reco ✔ · badge absent ✔ ·
unit 89/89 · api 146/146 · render 62/62 · ui 48/48 · 0 erreur console.

---

# 📣 Version 2.8 — Planning explicatif & rôles planning/calendrier clarifiés

## « Pourquoi mon planning a changé ? » — journal des ajustements
- Chaque événement qui modifie le programme écrit une entrée de journal
  persistée sur le contrôle (30 max) : génération, quiz (réussi : « la séance
  liée se grise et la priorité baisse » / raté : « rien n'est validé, la séance
  reste au programme »), leçon validée ou non, séance terminée/reportée/
  ignorée/remise, contrôle modifié (date, temps, notions, clôture).
- Quand un quiz fait évoluer la maîtrise, le journal l'explique chiffres en
  main : « Ta maîtrise passe de 42 % à 85 % (🔴 urgent → 🟢 maîtrisé) ».
- Bannière animée « Ton planning a été ajusté (N événements) — voir
  pourquoi » dès qu'il existe des entrées non vues (vu mémorisé en
  localStorage) ; clic = défilement vers le journal + marquage vu.
- Carte « Prochaine action » : toujours une consigne claire (séance du jour
  avec bouton Commencer, prochaine séance datée, ou clôture si contrôle
  passé).
- Garantie affichée et réelle : les séances terminées ne sont jamais
  supprimées ni déplacées par un recalcul (testé : changement de date après
  séance terminée).

## Planning ≠ Calendrier : deux rôles, une seule vérité
- Planning = QUOI faire (séances, priorités, actions Terminer/Reporter).
- Calendrier = QUAND (vue mensuelle/semaine/agenda des mêmes séances).
- Les séances synchronisées portent un marqueur technique dans `notes` :
  - calendrier : pastille 📚 + badge « Planning » + mention « même séance que
    dans ton planning — gère-la là-bas » + bouton « Planning » qui ouvre le
    contrôle ; édition/suppression/cochage masqués pour ces événements (fini
    les désynchronisations et l'impression de doublon) ;
  - planning : chip « 📅 Aussi dans ton calendrier » sur chaque séance ;
  - contrôle : événement agenda resynchronisé si nom/date/heure changent,
    marqué « planning-exam » avec le même renvoi.
- Les puces de la grille mois affichent 📚 pour les séances du planning.

## Vérifications
api 155/155 (journal génération+quiz+report, marqueurs calendrier,
resynchronisation de date, séances terminées conservées) · unit 89/89 ·
render 62/62 · ui 48/48 · navigateur : bannière → journal → vu, prochaine
action avec CTA, chip calendrier, badges + CTA côté agenda (21 badges,
16 liens), 0 erreur console.

## v2.9 — Serveur qui s'endort : réveil masqué et maintien éveillé

**Problème signalé** : après ~15 min sans visite, le site « s'endort » (plan gratuit
Render : le conteneur est gelé sans trafic) et le chargement suivant est long,
avec un écran vide ou technique pendant le démarrage.

**Rappel** : ce sommeil est une limite de la plateforme Render, pas un bug
d'EduMate ; aucun réglage applicatif ne peut le supprimer. Trois couches de
parade ont donc été mises en place :

1. **Maintien éveillé pendant l'usage** — déjà présent (`startKeepAlive`, ping
   `/api/health` toutes les 9 min, activé par défaut, réglable dans Paramètres)
   mais le réveil au retour d'onglet (`wakeUpNow`) n'était plus branché : le
   gestionnaire `visibilitychange` a été restauré et un écouteur `focus` ajouté.
   Un onglet ouvert = serveur éveillé.
2. **Démarrage instantané entre deux visites** — le service worker servait le
   HTML de la coquille mais PAS les chunks JS (imports statiques non listés dans
   index.html) : l'app restait bloquée sur l'écran de boot. Le SW (v6) pré-cache
   désormais, à l'installation, tous les assets par parcours en largeur des
   imports JS (plafond 120 fichiers), plus manifeste/favicone/icônes dans le
   cache assets. Résultat : serveur endormi, l'interface se charge quand même
   instantanément depuis l'appareil.
3. **Écran de réveil EduMate** — pendant que les retries de session réveillent
   le conteneur (~10-30 s), l'élève voit une animation EduMate (hibou, anneau
   orbital, messages qui tournent, compteur, conseil) au lieu d'un écran vide :
   `WakeScreen` (components/ui/WakeScreen.tsx), affiché par les garde-routes et
   le redirect initial. Le bootstrap monte React **avant** de charger la session
   (chargée en parallèle) pour que cet écran apparaisse immédiatement ; l'écran
   de boot HTML a aussi reçu une animation CSS (anneau + pulsation).

**Vérifié en conditions réelles** (script puppeteer dédié) : serveur tué puis
rechargement → écran de réveil affiché ✅ ; serveur relancé → récupération
automatique sans action ✅ ; retour d'onglet → ping de réveil immédiat ✅ ;
zéro erreur console ✅. Suites : unit 89, API 155, render 63 (dont un contrôle
WakeScreen), régression UI 48, check-page 5.

**Pour un service jamais endormi** : instance Render payante, ou ping externe
type UptimeRobot toutes les 10 min (attention au quota d'heures gratuites
~750 h/mois si le service tourne 24 h/24). Commentaire ajouté dans render.yaml.
