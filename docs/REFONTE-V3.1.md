# EduMate v3.1 — « Fumée & verre vivant » (correctifs visuels post-refonte)

> Suite de la refonte v3.0 « Liquid Glass » (voir `docs/REFONTE-V3.md`).
> Cette version répond aux retours élèves : **trop de lumière flash**, formes 3D
> à améliorer et à faire réagir au survol, bugs de boutons et de couleur sur le
> tableau de bord. Aucune fonctionnalité touchée : **zéro régression**.

## 1. Fond : la lumière flash remplacée par de la fumée sombre

Règle d'or appliquée dans tous les shaders : **la couleur fumée est mélangée
(`mix`), jamais additionnée**. Ajouter de la couleur = ajouter de la lumière ;
mélanger borne la luminance aux teintes de la palette → le fond reste sombre
en toutes circonstances (repos, survol, clic).

- **Composite** (`shaders.ts` → `COMPOSITE_FRAG`) :
  - les nappes « aurora » deviennent des **voiles de fumée** (fbm à domaine
    déformé, dérive lente) mélangés au fond, plus de bandes additives ;
  - le dye du fluide n'est plus une lumière : c'est une **densité de fumée**
    qui teinte légèrement puis **occlut** (`col *= 1 - 0.30 * densité`) ;
  - le halo du curseur devient un **souffle** : intensité active 0.50 → 0.10,
    idle 0.16 → 0.035, rayon réduit ; l'impulsion de clic 0.85 → 0.22
    (plus aucun flash au clic) ;
  - vignette renforcée (0.32 → 0.38) : le contenu reste le point focal.
- **Fluide** (`glassScene.ts`) : splats curseur 0.85 → 0.34 (rayon 2.4 → 3.0,
  force 5200 → 3200), splats ambiants 0.5 → 0.2 toutes les 3.4–5.8 s,
  couleurs de dye assombries (violet/indigo profonds).
- **Palette sombre** : bases `#05030f` / `#140b2e`, fumées `#5b21b6`,
  `#86198f`, `#1e40af` ; poussières opacité 0.5 → 0.2 et scintillement
  0.45 → 0.18 (presque imperceptible).

## 2. Formes 3D améliorées + interaction « goutte d'eau » au survol

- **Géométries lisses** : icosaèdres detail 2→4, sphères 20→40/44,
  tore 14×40→22×76, octaèdre 1→3 : plus aucune facette visible.
- **Matériau lentille** (`GLASS_FRAG`) : le verre **réfracte le fond**
  (échantillonnage de la cible composite décalé par la normale) → effet de
  matière réel ; Fresnel doux, iridescence tamisée 0.32 → 0.16, reflet
  spéculaire blanc remplacé par un **reflet large tamisé** (exposant 22→7,
  intensité ×0.2) ; verre passé en mélange **normal** (alpha) avec tri de
  peinture arrière→avant, plus d'additif éblouissant.
- **Survol = goutte d'eau** (`GLASS_VERT` + raycast CPU) :
  - raycast économique par **sphère englobante** (pas de raycast de maillage),
    une seule forme survolée, point de contact converti en **espace local**
    (la déformation reste collée à la surface pendant la rotation) ;
  - renflement gaussien autour du point touché + **ondulations concentriques**
    + jitter haute fréquence ; normale perturbée analytiquement (le Fresnel
    épouse le relief, aucun recalcul CPU) ;
  - **dissolution en gouttes** : un bruit 3D (fbm3) érode la surface en îlots
    arrondis ourlés d'un liseré violet (`edge`), seuil piloté par `uHover`
    amorti (damp 5.5) ; au repos, aucun trou (bande quasi nulle).
- Coût maîtrisé : 7 sphères testées/frame, fbm3 uniquement sur les fragments
  des formes, aucune allocation dans la boucle.

## 3. Boutons : bug d'animation corrigé + animations embellies

- **Bug du rectangle rose** (« Demander de l'aide ») : `Button` enveloppait ses
  `children` dans un `<span>` ; l'anneau `border-radius: inherit` héritait du
  rayon **nul** de ce span → anneau conique **rectangulaire** au survol.
  Correction : nouvelle prop `decoration` sur `Button` (nœud rendu hors du
  span de contenu) ; `LiquidGlassButton` y place son anneau → rayon pill
  hérité correctement partout.
- **Héro du tableau de bord** : `<Link><Button></Link>` (HTML invalide, deux
  éléments interactifs imbriqués, focus doublé) remplacé par des boutons
  `useNavigate()` ; le badge de salutation perd ses styles inline blancs
  (nouvelle prop `className` de `GlassBadge` + classe `.hero__badge`).
- **Animations embellies** (tous boutons) :
  - le dégradé de marque **glisse** au survol (`background-size 175%` +
    `background-position`, aucune lumière ajoutée) ;
  - anneau liquide : halo `drop-shadow` discret + micro-scale au survol ;
  - garde-fous : `prefers-reduced-motion`, `[data-animations='off']` et
    `[data-fx='low']` coupent glissement, halo et flottement du héro.

## 4. Bug de couleur « Bonjour Lucas » corrigé

Le héro était une **dalle dégradée saturée** (violet→magenta→rose) héritée de
la v2, étrangère au thème sombre et source du contraste erroné autour de la
salutation. Nouveau héro = **panneau de verre sombre** (halos radiaux doux,
bordure verre, texte `var(--ed-text)`) avec variante claire dédiée
(`[data-theme='clair'] .hero`). Boutons du héro : primaire de marque +
secondaire verre translucide (fini le pill blanc flash).

## 5. Gouverneur FPS : chauffe doublée

Deux fenêtres de 3 s sont désormais ignorées avant évaluation : la
compilation des shaders produisait des frames irrégulières qui déclenchaient
le repli CSS sur des sursauts de démarrage, pas sur des machines réellement
lentes. Le repli progressif (résolution puis CSS) reste inchangé.

## 6. Vérifications (matrice complète, tout vert)

| Contrôle | Résultat |
| --- | --- |
| `typecheck` | ✅ |
| `build` (client + serveur) | ✅ (glassScene 551 kB raw / 141 kB gzip, paresseux) |
| `test:unit` | ✅ 89/89 |
| `test:content` | ✅ |
| `test:api` / `test:api:built` | ✅ 155/155 · 172/172 |
| `test:bundle` | ✅ 10/10 (initial 220 Kio gzip < limite) |
| `test:render` | ✅ 63/63 |
| `test:ui` | ✅ 48/48 |
| `test:routes` | ✅ 5/5 |
| `test:hooks` / `test:scripts` | ✅ |
| `visual-check` | ✅ 139/139 (captures `shots/v3-*.png`, non versionnées) |

Vérifications visuelles spécifiques v3.1 (captures `debug-shots/` non livrées) :
fumée sombre au repos, dissolution goutte d'eau au survol d'une forme,
anneau pill sur « Demander de l'aide », héro sombre/clair, connexion, landing.

## 7. Divers

- `public/sw.js` : `VERSION` v7 → **v8** (nouveaux assets).
- Aucun changement serveur/API/auth/CSRF/Upstash ; `publier.bat` inchangé.
