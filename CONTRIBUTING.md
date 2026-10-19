# 🤝 Contribuer à EduMate

Merci de ton intérêt ! EduMate est conçu pour être **facile à étendre** : la plupart des contributions utiles ne demandent qu'une ligne de données ou un fichier JSON.

---

## 🚀 Démarrage rapide

```bash
git clone https://github.com/TON_COMPTE/edumate.git
cd edumate
npm install
cp .env.example .env      # facultatif : tout fonctionne sans configuration
npm run build:data        # génère le catalogue pédagogique
npm run dev               # http://localhost:5173
```

Aucune base de données ni clé d'API n'est nécessaire pour développer : EduMate bascule automatiquement sur un stockage en mémoire et sur le tuteur intégré.

---

## ✅ Avant de proposer une modification

```bash
npm run typecheck    # TypeScript strict
npm test             # unitaires + contenu + API
npm run test:render  # rendu réel de toutes les pages
npm run build        # build client + serveur
```

Une contribution doit laisser ces quatre commandes **au vert**.

---

## 📚 Contribuer du contenu pédagogique (le plus utile)

### Ajouter des questions rédigées
Édite ou crée `data/quiz/<matiere>.json` :

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
          "explanation": "Le commentaire analyse des procédés : il ne résume jamais.",
          "skill": "Méthode",
          "difficulty": "moyen"
        }
      ]
    }
  ]
}
```

Règles de qualité :
- **4 propositions** dont une seule correcte (`answer` = index dans le JSON ; elles sont mélangées à l'affichage) ;
- des **distracteurs plausibles** (erreurs d'élèves réelles, pas des absurdités) ;
- une **explication** qui enseigne quelque chose, pas seulement la réponse ;
- un `skill` court (affiché dans le bilan) et une `difficulty` (`facile` / `moyen` / `difficile`).

Puis déclare le sujet dans `src/server/content/topics.ts` :
```ts
T('francais', 'seconde', 'Méthode', 'Commentaire littéraire', 'bank:francais-seconde-methode-commentaire', 'moyen')
```

### Ajouter un sujet généré automatiquement
Si une famille existe déjà, une ligne suffit :
```ts
T('mathematiques', 'premiere', 'Suites', 'Suites géométriques de raison négative',
  'math.sequences', 'difficile', { kind: 'geometrique' })
```

### Créer une famille de générateurs
Voir `docs/ARCHITECTURE.md` §3. Points clés :
- utiliser **uniquement `ctx.rng`** (jamais `Math.random()`) pour rester déterministe ;
- renvoyer `null` plutôt qu'une question douteuse (le moteur retente) ;
- calculer la bonne réponse, ne jamais la saisir à la main ;
- déclarer `pool` (taille du vivier) pour que le catalogue soit honnête.

### Enrichir un corpus
`src/server/content/data/knowledge.ts` contient les faits d'histoire, géographie, philosophie, SVT, SES et NSI. Chaque entrée produit automatiquement plusieurs types de questions : ajoute simplement une ligne, puis vérifie avec `npm run test:content`.

> **Exigence absolue** : les données doivent être exactes (programme officiel, tables de référence). Une information fausse dans un outil scolaire est pire qu'une information manquante.

---

## 🎨 Contribuer au code

### Style
- TypeScript **strict**, ESM, imports avec extension `.js`.
- Français pour les textes destinés à l'élève ; anglais pour les identifiants.
- Un fichier = une responsabilité.
- Les données ne vivent jamais dans les composants React.
- Sélecteurs Zustand atomiques (jamais d'objet littéral renvoyé).

### Interface
- Réutilise les composants existants (`components/ui`) avant d'en créer.
- Cibles tactiles ≥ 44 px, `aria-label` sur les boutons icônes, `aria-pressed` sur les toggles.
- Animations courtes, en `transform`/`opacity`, et respectant `prefers-reduced-motion`.
- Teste en thème **clair et sombre**, et en largeur **360 px**.

### Backend
- Toute route mutative : `requireAuth()` + `requireCsrf()`.
- Toute entrée : validation (`lib/validation.ts`), jamais de confiance au client.
- Messages d'erreur simples et en français ; détails techniques dans les logs uniquement.
- Ajoute un contrôle correspondant dans `scripts/smoke-test.mjs`.

---

## 🧪 Tests attendus selon la contribution

| Contribution | Commandes |
|---|---|
| Contenu pédagogique | `npm run build:data && npm run test:content` |
| Backend / API | `npm run test:api` |
| Interface | `npm run test:render` |
| Logique partagée | `npm run test:unit` |
| Tout le reste | `npm run test:all` |

---

## 📮 Propositions

1. Ouvre une *issue* décrivant le besoin (ou la fonctionnalité annoncée dans le README).
2. Crée une branche : `feat/quiz-probabilites-terminale`, `fix/minuteur-pause`.
3. Commits explicites et atomiques, messages en français ou anglais cohérents :
   - `feat:` nouvelle fonctionnalité
   - `fix:` correction
   - `content:` ajout de contenu pédagogique
   - `docs:` documentation
   - `refactor:` / `test:` / `chore:`
4. *Pull request* avec : ce que ça change, comment tester, captures d'écran si l'interface est touchée.

---

## 🚫 À éviter

- Ajouter une dépendance lourde pour un besoin couvrable en quelques lignes.
- Ajouter un service externe : EduMate limite volontairement les dépendances à trois services gratuits (traduction, annuaire des établissements, IA facultative).
- Coder des réponses « en dur » dans un composant React.
- Commiter `.env`, `node_modules/`, `dist/` ou des données personnelles d'élèves.
- Livrer sans avoir lancé `npm run test:all`.

---

## 📄 Licence

En contribuant, tu acceptes que ta contribution soit publiée sous licence MIT (voir `LICENSE`).
