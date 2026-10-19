/**
 * EduMate — Corpus de FRANÇAIS : grammaire, orthographe, vocabulaire,
 * littérature. Chaque entrée est une donnée exacte du programme scolaire ;
 * le générateur en tire plusieurs types de questions (QCM, vrai/faux).
 */

/* ---------------- Homophones grammaticaux ---------------- */
export interface HomophoneItem {
  sentence: string;
  correct: string;
  wrong: string;
  rule: string;
}

export const HOMOPHONES: HomophoneItem[] = [
  { sentence: 'Il faut ___ tu viennes demain.', correct: 'que', wrong: 'qu’', rule: '« que » est une conjonction de subordination devant consonne.' },
  { sentence: '___ beau aujourd’hui.', correct: 'Il fait', wrong: 'Ils font', rule: 'Expression impersonnelle : « il fait + adjectif ».' },
  { sentence: 'Je ne sais pas ___ il est parti.', correct: 'pourquoi', wrong: 'pour quoi', rule: '« pourquoi » en un mot = pour quelle raison.' },
  { sentence: 'Ces fleurs, je les ai ___ pour toi.', correct: 'cueillies', wrong: 'cueilli', rule: 'Le participe passé conjugué avec avoir s’accorde avec le COD placé avant : « les » = ces fleurs (fém. pl.).' },
  { sentence: 'Elle est ___ à la maison.', correct: 'restée', wrong: 'resté', rule: 'Avec l’auxiliaire être, le participe passé s’accorde avec le sujet (elle, fém. sing.).' },
  { sentence: '___ tu viens, préviens-moi.', correct: 'Si', wrong: 'S’y', rule: '« Si » introduit une condition ; « s’y » = pronom + adverbe.' },
  { sentence: 'Il ___ son travail sérieusement.', correct: 'fait', wrong: 'fais', rule: '3ᵉ personne du singulier du présent : il fait (terminaison -t).' },
  { sentence: 'Nous avons ___ nos devoirs.', correct: 'fini', wrong: 'finis', rule: 'Le COD « nos devoirs » est placé après le verbe : pas d’accord avec avoir.' },
  { sentence: 'Les enfants ___ joué dans le jardin.', correct: 'ont', wrong: 'on', rule: '« ont » est le verbe avoir à la 3ᵉ personne du pluriel.' },
  { sentence: '___ veux-tu comme dessert ?', correct: 'Que', wrong: 'Qu’elle', rule: 'Pronom interrogatif « que » devant consonne.' },
  { sentence: 'Elle ___ est rendu compte de son erreur.', correct: 's’en', wrong: 'sans', rule: '« s’en rendre compte » : pronom réfléchi + en. « sans » est une préposition.' },
  { sentence: 'Je viendrai ___ tu m’appelles.', correct: 'dès que', wrong: 'des que', rule: '« dès que » prend un accent grave sur le e.' },
  { sentence: 'Il a ___ de chance.', correct: 'beaucoup', wrong: 'beau coup', rule: 'Adverbe invariable « beaucoup » en un seul mot.' },
  { sentence: '___ livres sont intéressants.', correct: 'Ces', wrong: 'Ses/Ces', rule: '« Ces » est démonstratif (ceux-là) ; « ses » est possessif.' },
  { sentence: 'Elle a ___ sa journée à réviser.', correct: 'passé', wrong: 'passée', rule: 'Le COD « sa journée » est placé après : le participe passé avec avoir ne s’accorde pas.' },
  { sentence: 'Ils se ___ au téléphone.', correct: 'sont parlé', wrong: 'sont parlés', rule: 'Le pronom « se » est COI (parler à quelqu’un) : pas d’accord du participe.' },
  { sentence: 'La robe ___ elle a achetée est bleue.', correct: 'qu’', wrong: 'que', rule: 'Élision obligatoire devant une voyelle : « qu’elle ».' },
  { sentence: '___ soit, il faut continuer.', correct: 'Quoi qu’il en', wrong: 'Quoiqu’il en', rule: '« Quoi qu’il en soit » s’écrit en trois mots (quoi que = quelle que soit la chose).' },
  { sentence: 'Il travaille ___ ses camarades.', correct: 'comme', wrong: 'comment', rule: '« comme » = de la même manière que ; « comment » est interrogatif.' },
  { sentence: '___ tu as fini, tu peux sortir.', correct: 'Quand', wrong: 'Quant', rule: '« Quand » = lorsque (conjonction de temps) ; « quant à » = en ce qui concerne.' },
];

/* ---------------- Accords et orthographe grammaticale ---------------- */
export interface AgreementItem {
  question: string;
  correct: string;
  wrong: string[];
  rule: string;
}

export const AGREEMENTS: AgreementItem[] = [
  { question: 'Accordez : « Des fleurs (frais) ___ »', correct: 'fraîches', wrong: ['frais', 'fraiches', 'fraîche'], rule: 'L’adjectif s’accorde en genre et en nombre avec le nom féminin pluriel « fleurs ».' },
  { question: 'Accordez : « Une histoire (intéressant) ___ »', correct: 'intéressante', wrong: ['intéressant', 'intéressants', 'interessante'], rule: 'Adjectif au féminin singulier avec le nom « histoire ».' },
  { question: 'Accordez : « Les robes qu’elle a (faire) ___ »', correct: 'faites', wrong: ['fait', 'faits', 'faite'], rule: 'Le COD « qu’ » (= les robes) est placé avant l’auxiliaire avoir : accord au féminin pluriel.' },
  { question: 'Accordez : « Elles sont (aller) ___ au marché »', correct: 'allées', wrong: ['allé', 'allés', 'allée'], rule: 'Avec l’auxiliaire être, accord avec le sujet féminin pluriel.' },
  { question: 'Accordez : « Mille (cent) ___ euros »', correct: 'cent', wrong: ['cents', 'centes', 'centés'], rule: '« cent » et « vingt » prennent un s seulement quand ils sont multipliés et en fin de numéral : deux cents, mais cent vingt.' },
  { question: 'Accordez : « Quatre-___ (vingt) personnes »', correct: 'vingts', wrong: ['vingt', 'vint', 'vins'], rule: '« quatre-vingts » prend un s quand il n’est pas suivi d’un autre adjectif numéral.' },
  { question: 'Choisissez : « Je les ai (voir) ___ partir »', correct: 'vus', wrong: ['vu', 'vues', 'voir'], rule: 'Le COD « les » est placé avant ; ici masculin pluriel → vus.' },
  { question: 'Accordez : « Des yeux (bleu clair) ___ »', correct: 'bleu clair', wrong: ['bleus clairs', 'bleu clairs', 'bleus clair'], rule: 'Les adjectifs de couleur composés sont invariables.' },
  { question: 'Accordez : « Des jupes (orange) ___ »', correct: 'orange', wrong: ['oranges', 'orangées', 'orangs'], rule: 'Les adjectifs de couleur issus de noms (orange, marron, cerise) sont invariables.' },
  { question: 'Accordez : « Elles se sont (laver) ___ les mains »', correct: 'lavé', wrong: ['lavées', 'lavés', 'lavée'], rule: 'Le COD « les mains » est placé après le verbe : pas d’accord.' },
  { question: 'Choisissez : « La plupart des élèves (être) ___ venus »', correct: 'sont', wrong: ['est', 'étaient', 'a été'], rule: 'Avec « la plupart de + pluriel », le verbe se met au pluriel.' },
  { question: 'Choisissez : « C’est eux qui (avoir) ___ raison »', correct: 'ont', wrong: ['a', 'avons', 'avais'], rule: 'Le relatif « qui » reprend « eux » (3ᵉ pers. du pluriel).' },
  { question: 'Accordez : « Des (demi) ___ heures »', correct: 'demi', wrong: ['demis', 'demies', 'demie'], rule: '« demi » placé avant un nom est invariable et joint par un trait d’union.' },
  { question: 'Choisissez : « Je viendrai (malgré) ___ »', correct: 'malgré tout', wrong: ['malgrés tout', 'malgré tous', 'malgrer tout'], rule: '« malgré » est une préposition invariable.' },
  { question: 'Accordez : « Des (grand-mère) ___ gentilles »', correct: 'grands-mères', wrong: ['grand-mères', 'grande-mères', 'grands-mère'], rule: 'Dans les noms composés, les deux éléments peuvent prendre la marque du pluriel : des grands-mères.' },
];

/* ---------------- Natures et fonctions ---------------- */
export const GRAMMAR_CONCEPTS: { term: string; definition: string; example: string }[] = [
  { term: 'nom commun', definition: 'mot qui désigne une personne, un animal, une chose ou une idée', example: 'le livre, la liberté' },
  { term: 'adjectif qualificatif', definition: 'mot qui précise une caractéristique du nom', example: 'une maison ancienne' },
  { term: 'déterminant', definition: 'mot placé devant le nom qui indique son genre, son nombre et son statut', example: 'le, une, mon, ces' },
  { term: 'pronom relatif', definition: 'mot qui relie deux propositions en remplaçant un nom', example: 'qui, que, dont, où, lequel' },
  { term: 'proposition subordonnée relative', definition: 'proposition introduite par un pronom relatif, complément de l’antécédent', example: 'Le film que j’ai vu' },
  { term: 'proposition subordonnée conjonctive', definition: 'proposition introduite par une conjonction de subordination', example: 'Je pense qu’il viendra' },
  { term: 'complément d’objet direct (COD)', definition: 'complément essentiel du verbe, introduit sans préposition', example: 'Elle lit un roman' },
  { term: 'complément d’objet indirect (COI)', definition: 'complément essentiel du verbe introduit par une préposition', example: 'Il parle à son frère' },
  { term: 'complément circonstanciel', definition: 'complément facultatif qui précise les circonstances (temps, lieu, manière…)', example: 'Demain, nous partirons tôt' },
  { term: 'attribut du sujet', definition: 'élément qui caractérise le sujet, placé après un verbe d’état', example: 'Il semble fatigué' },
  { term: 'adverbe', definition: 'mot invariable qui modifie un verbe, un adjectif ou un autre adverbe', example: 'très, hier, rapidement' },
  { term: 'conjonction de coordination', definition: 'mot reliant deux éléments de même statut', example: 'mais, ou, et, donc, or, ni, car' },
  { term: 'préposition', definition: 'mot invariable introduisant un complément', example: 'à, de, pour, sans, chez' },
  { term: 'voix passive', definition: 'construction où le sujet subit l’action, formée avec l’auxiliaire être', example: 'La souris est mangée par le chat' },
  { term: 'discours direct', definition: 'reproduction exacte des paroles, marquée par des guillemets ou des tirets', example: 'Il dit : « Je pars. »' },
  { term: 'discours indirect', definition: 'paroles rapportées dans une proposition subordonnée, avec changements de temps et de pronoms', example: 'Il dit qu’il part' },
  { term: 'temps composé', definition: 'temps formé d’un auxiliaire conjugué et d’un participe passé', example: 'j’ai mangé, j’étais parti' },
  { term: 'mode subjonctif', definition: 'mode exprimant le souhait, le doute, la nécessité ou le sentiment', example: 'Il faut que tu viennes' },
  { term: 'conditionnel', definition: 'mode exprimant un fait soumis à une condition, un souhait ou une information non confirmée', example: 'Je voudrais partir' },
  { term: 'impératif', definition: 'mode de l’ordre ou du conseil, sans pronom sujet exprimé', example: 'Viens ici !' },
  { term: 'champ lexical', definition: 'ensemble des mots se rapportant à une même idée ou un même thème', example: 'pour la mer : vague, océan, marée' },
  { term: 'registre de langue', definition: 'niveau de langue choisi selon la situation : familier, courant, soutenu', example: 'bagnole / voiture / automobile' },
  { term: 'ellipse', definition: 'suppression d’un élément grammaticalement nécessaire mais compréhensible', example: 'Lui, toujours en retard !' },
  { term: 'anaphore', definition: 'reprise d’un élément déjà mentionné, souvent par un pronom', example: 'Marie arrive. Elle est en retard.' },
  { term: 'connecteur logique', definition: 'mot ou groupe de mots qui marque une relation entre deux idées', example: 'cependant, ainsi, parce que' },
];

/* ---------------- Figures de style ---------------- */
export const FIGURES_OF_SPEECH: { name: string; definition: string; example: string }[] = [
  { name: 'comparaison', definition: 'rapprochement de deux éléments à l’aide d’un outil de comparaison (comme, tel, pareil à…)', example: '« La Terre est bleue comme une orange. » (Éluard)' },
  { name: 'métaphore', definition: 'comparaison implicite, sans outil de comparaison', example: '« Cet homme est un lion. »' },
  { name: 'personnification', definition: 'attribution de traits humains à un objet, un animal ou une idée', example: '« Le vent hurlait dans les arbres. »' },
  { name: 'hyperbole', definition: 'exagération destinée à frapper l’esprit', example: '« Je meurs de faim. »' },
  { name: 'litote', definition: 'dire moins pour suggérer plus', example: '« Va, je ne te hais point. » (Corneille)' },
  { name: 'euphémisme', definition: 'adoucissement d’une réalité brutale', example: '« Il nous a quittés » pour « il est mort »' },
  { name: 'antithèse', definition: 'opposition de deux idées dans un même énoncé', example: '« Je vis, je meurs. » (Labé)' },
  { name: 'oxymore', definition: 'réunion de deux termes opposés dans un même groupe de mots', example: '« Cette obscure clarté » (Corneille)' },
  { name: 'anaphore (rhétorique)', definition: 'répétition d’un même mot en début de phrases ou de vers', example: '« Moi président… Moi président… »' },
  { name: 'gradation', definition: 'succession de termes d’intensité croissante ou décroissante', example: '« Je me meurs, je suis mort. »' },
  { name: 'allitération', definition: 'répétition de consonnes', example: '« Pour qui sont ces serpents qui sifflent sur vos têtes ? » (Racine)' },
  { name: 'assonance', definition: 'répétition de voyelles', example: '« Il pleure dans mon cœur comme il pleut sur la ville. » (Verlaine)' },
  { name: 'chiasme', definition: 'disposition croisée d’éléments parallèles (AB / BA)', example: '« Il faut manger pour vivre et non vivre pour manger. »' },
  { name: 'ironie', definition: 'dire le contraire de ce que l’on pense pour se moquer', example: '« C’est du joli ! » devant une bêtise' },
  { name: 'périphrase', definition: 'remplacement d’un mot par une expression équivalente', example: '« la ville lumière » pour Paris' },
  { name: 'accumulation', definition: 'succession de termes de même statut pour créer un effet de masse', example: '« Adieu, veau, vache, cochon, couvée. » (La Fontaine)' },
  { name: 'enjambement', definition: 'débordement d’un vers sur le vers suivant sans pause syntaxique', example: 'typique chez Hugo et les romantiques' },
  { name: 'parallélisme', definition: 'reprise d’une même structure syntaxique', example: '« Ceux qui pieusement sont morts pour la patrie… »' },
];

/* ---------------- Versification ---------------- */
export const VERSIFICATION: { term: string; definition: string }[] = [
  { term: 'alexandrin', definition: 'vers de douze syllabes, avec césure à l’hémistiche' },
  { term: 'décasyllabe', definition: 'vers de dix syllabes' },
  { term: 'octosyllabe', definition: 'vers de huit syllabes' },
  { term: 'hémistiche', definition: 'moitié de l’alexandrin, séparée par la césure' },
  { term: 'rimes plates', definition: 'rimes qui se suivent deux à deux (AABB)' },
  { term: 'rimes croisées', definition: 'alternance ABAB' },
  { term: 'rimes embrassées', definition: 'disposition ABBA' },
  { term: 'sonnet', definition: 'poème de quatorze vers : deux quatrains et deux tercets' },
  { term: 'ballade', definition: 'poème médiéval à refrain, trois strophes et un envoi' },
  { term: 'calligramme', definition: 'poème dont la disposition dessine un objet (Apollinaire)' },
  { term: 'vers libre', definition: 'vers sans mètre ni rime réguliers, apparu à la fin du XIXᵉ siècle' },
  { term: 'diérèse', definition: 'prononciation en deux syllabes d’un groupe de voyelles (li-on au lieu de lion)' },
  { term: 'synérèse', definition: 'prononciation en une seule syllabe de deux voyelles voisines' },
  { term: 'e muet', definition: 'le e final se compte devant consonne, s’élide devant voyelle' },
];

/* ---------------- Mouvements littéraires ---------------- */
export const LITERARY_MOVEMENTS: { name: string; period: string; features: string; authors: string[] }[] = [
  { name: 'Humanisme', period: 'XVIᵉ siècle', features: 'confiance en l’homme et au savoir, retour aux textes antiques, diffusion par l’imprimerie', authors: ['Rabelais', 'Érasme', 'Montaigne'] },
  { name: 'Pléiade', period: 'XVIᵉ siècle', features: 'groupe de poètes qui veulent enrichir la langue française et imiter les Anciens', authors: ['Ronsard', 'Du Bellay'] },
  { name: 'Baroque', period: 'fin XVIᵉ – XVIIᵉ siècle', features: 'instabilité, illusion, métamorphose, exubérance des formes', authors: ['Viau', "Saint-Amant", 'Corneille (L’Illusion comique)'] },
  { name: 'Classicisme', period: 'XVIIᵉ siècle', features: 'règles des trois unités, vraisemblance, bienséance, plaisir d’instruire', authors: ['Racine', 'Molière', 'La Fontaine', 'Boileau'] },
  { name: 'Lumières', period: 'XVIIIᵉ siècle', features: 'raison, tolérance, critique de l’absolutisme et des préjugés, encyclopédisme', authors: ['Voltaire', 'Rousseau', 'Diderot', 'Montesquieu'] },
  { name: 'Romantisme', period: 'début XIXᵉ siècle', features: 'expression du moi, lyrisme, nature, mélancolie, refus des règles classiques', authors: ['Hugo', 'Lamartine', 'Musset', 'Chateaubriand'] },
  { name: 'Réalisme', period: 'milieu XIXᵉ siècle', features: 'peindre le réel sans l’idéaliser, documentation, personnages ordinaires', authors: ['Balzac', 'Flaubert', 'Maupassant', 'Stendhal'] },
  { name: 'Naturalisme', period: 'fin XIXᵉ siècle', features: 'influence des sciences, déterminisme, hérédité et milieu social', authors: ['Zola', 'Goncourt', 'Maupassant'] },
  { name: 'Parnasse', period: 'seconde moitié du XIXᵉ siècle', features: 'l’art pour l’art, travail de la forme, impassibilité', authors: ['Leconte de Lisle', 'Heredia', 'Gautier'] },
  { name: 'Symbolisme', period: 'fin XIXᵉ siècle', features: 'suggestion, musicalité, correspondances, refus de la description directe', authors: ['Baudelaire', 'Verlaine', 'Rimbaud', 'Mallarmé'] },
  { name: 'Surréalisme', period: 'XXᵉ siècle', features: 'écriture automatique, rêve, libération de l’inconscient, refus de la logique', authors: ['Breton', 'Éluard', 'Aragon', 'Desnos'] },
  { name: 'Dadaïsme', period: 'XXᵉ siècle', features: 'provocation, refus radical de l’art et de la raison', authors: ['Tzara', 'Duchamp'] },
  { name: 'Existentialisme', period: 'milieu XXᵉ siècle', features: 'liberté, responsabilité, absurdité de la condition humaine, engagement', authors: ['Sartre', 'Camus', 'Beauvoir'] },
  { name: 'Absurde (théâtre)', period: 'XXᵉ siècle', features: 'décomposition du langage, situations illogiques, absence de sens', authors: ['Ionesco', 'Beckett', 'Genet'] },
  { name: 'Nouveau Roman', period: 'années 1950-1960', features: 'refus du personnage et de l’intrigue traditionnels, expérimentation narrative', authors: ['Robbe-Grillet', 'Sarraute', 'Claude Simon'] },
  { name: 'Négritude', period: 'XXᵉ siècle', features: 'affirmation de l’identité noire, combat contre le colonialisme', authors: ['Césaire', 'Senghor', 'Damas'] },
  { name: 'Oulipo', period: 'depuis 1960', features: 'littérature à contraintes formelles volontaires', authors: ['Queneau', 'Perec', 'Calvino'] },
];

/* ---------------- Œuvres et auteurs ---------------- */
export const LITERARY_WORKS: { author: string; work: string; century: string; genre: string; movement: string; note: string }[] = [
  { author: 'Molière', work: 'Le Tartuffe', century: 'XVIIᵉ', genre: 'comédie', movement: 'Classicisme', note: 'dénonce l’hypocrisie religieuse' },
  { author: 'Molière', work: 'Le Malade imaginaire', century: 'XVIIᵉ', genre: 'comédie-ballet', movement: 'Classicisme', note: 'dernière pièce de Molière, satire des médecins' },
  { author: 'Molière', work: 'Dom Juan', century: 'XVIIᵉ', genre: 'comédie', movement: 'Classicisme', note: 'libertinage et châtiment divin' },
  { author: 'Racine', work: 'Phèdre', century: 'XVIIᵉ', genre: 'tragédie', movement: 'Classicisme', note: 'passion fatale et fatalité' },
  { author: 'Racine', work: 'Andromaque', century: 'XVIIᵉ', genre: 'tragédie', movement: 'Classicisme', note: 'chaîne amoureuse à quatre personnages' },
  { author: 'Corneille', work: 'Le Cid', century: 'XVIIᵉ', genre: 'tragi-comédie', movement: 'Classicisme', note: 'dilemme entre honneur et amour' },
  { author: 'La Fontaine', work: 'Fables', century: 'XVIIᵉ', genre: 'fable', movement: 'Classicisme', note: '« plaire et instruire » par l’apologue' },
  { author: 'Voltaire', work: 'Candide', century: 'XVIIIᵉ', genre: 'conte philosophique', movement: 'Lumières', note: 'critique de l’optimisme de Leibniz' },
  { author: 'Montesquieu', work: 'Lettres persanes', century: 'XVIIIᵉ', genre: 'roman épistolaire', movement: 'Lumières', note: 'regard étranger sur la société française' },
  { author: 'Rousseau', work: 'Les Confessions', century: 'XVIIIᵉ', genre: 'autobiographie', movement: 'Lumières', note: 'entreprise inédite de sincérité totale' },
  { author: 'Diderot', work: 'L’Encyclopédie', century: 'XVIIIᵉ', genre: 'dictionnaire raisonné', movement: 'Lumières', note: 'diffusion des savoirs et esprit critique' },
  { author: 'Hugo', work: 'Les Misérables', century: 'XIXᵉ', genre: 'roman', movement: 'Romantisme', note: 'misère sociale et rédemption' },
  { author: 'Hugo', work: 'Les Contemplations', century: 'XIXᵉ', genre: 'recueil poétique', movement: 'Romantisme', note: 'deuil de sa fille Léopoldine' },
  { author: 'Hugo', work: 'Hernani', century: 'XIXᵉ', genre: 'drame romantique', movement: 'Romantisme', note: 'la bataille d’Hernani (1830)' },
  { author: 'Flaubert', work: 'Madame Bovary', century: 'XIXᵉ', genre: 'roman', movement: 'Réalisme', note: 'bovarysme et procès pour outrage aux mœurs' },
  { author: 'Balzac', work: 'Le Père Goriot', century: 'XIXᵉ', genre: 'roman', movement: 'Réalisme', note: 'La Comédie humaine, retour des personnages' },
  { author: 'Stendhal', work: 'Le Rouge et le Noir', century: 'XIXᵉ', genre: 'roman', movement: 'Réalisme', note: 'ambition de Julien Sorel' },
  { author: 'Zola', work: 'Germinal', century: 'XIXᵉ', genre: 'roman', movement: 'Naturalisme', note: 'grève des mineurs du Nord' },
  { author: 'Zola', work: 'L’Assommoir', century: 'XIXᵉ', genre: 'roman', movement: 'Naturalisme', note: 'misère ouvrière et alcoolisme' },
  { author: 'Maupassant', work: 'Bel-Ami', century: 'XIXᵉ', genre: 'roman', movement: 'Réalisme/Naturalisme', note: 'ascension par le journalisme' },
  { author: 'Baudelaire', work: 'Les Fleurs du mal', century: 'XIXᵉ', genre: 'recueil poétique', movement: 'Symbolisme/Modernité', note: 'spleen et idéal, procès de 1857' },
  { author: 'Rimbaud', work: 'Une saison en enfer', century: 'XIXᵉ', genre: 'prose poétique', movement: 'Symbolisme', note: '« Je est un autre »' },
  { author: 'Verlaine', work: 'Romances sans paroles', century: 'XIXᵉ', genre: 'recueil poétique', movement: 'Symbolisme', note: 'musicalité du vers impair' },
  { author: 'Proust', work: 'Du côté de chez Swann', century: 'XXᵉ', genre: 'roman', movement: 'Modernité', note: 'premier tome d’À la recherche du temps perdu, mémoire involontaire' },
  { author: 'Camus', work: 'L’Étranger', century: 'XXᵉ', genre: 'roman', movement: 'Absurde', note: 'Meursault et l’étrangeté au monde' },
  { author: 'Camus', work: 'La Peste', century: 'XXᵉ', genre: 'roman', movement: 'Existentialisme', note: 'allégorie de l’occupation et de la résistance' },
  { author: 'Sartre', work: 'La Nausée', century: 'XXᵉ', genre: 'roman philosophique', movement: 'Existentialisme', note: 'contingence de l’existence' },
  { author: 'Beauvoir', work: 'Le Deuxième Sexe', century: 'XXᵉ', genre: 'essai', movement: 'Existentialisme', note: '« On ne naît pas femme, on le devient »' },
  { author: 'Beckett', work: 'En attendant Godot', century: 'XXᵉ', genre: 'théâtre', movement: 'Absurde', note: 'attente vide et langage désarticulé' },
  { author: 'Ionesco', work: 'Rhinocéros', century: 'XXᵉ', genre: 'théâtre', movement: 'Absurde', note: 'conformisme et totalitarisme' },
  { author: 'Céline', work: 'Voyage au bout de la nuit', century: 'XXᵉ', genre: 'roman', movement: 'Modernité', note: 'langue orale et pessimisme' },
  { author: 'Giono', work: 'Regain', century: 'XXᵉ', genre: 'roman', movement: 'Régionalisme', note: 'renaissance d’un village provençal' },
  { author: 'Césaire', work: 'Cahier d’un retour au pays natal', century: 'XXᵉ', genre: 'poésie', movement: 'Négritude', note: 'affirmation de l’identité noire' },
  { author: 'Queneau', work: 'Zazie dans le métro', century: 'XXᵉ', genre: 'roman', movement: 'Oulipo/Humoristique', note: 'jeu avec la langue orale' },
  { author: 'Perec', work: 'La Disparition', century: 'XXᵉ', genre: 'roman lipogrammatique', movement: 'Oulipo', note: 'écrit sans la lettre e' },
  { author: 'Marivaux', work: 'Le Jeu de l’amour et du hasard', century: 'XVIIIᵉ', genre: 'comédie', movement: 'Lumières', note: 'déguisement et marivaudage' },
  { author: 'Beaumarchais', work: 'Le Mariage de Figaro', century: 'XVIIIᵉ', genre: 'comédie', movement: 'Lumières', note: 'critique sociale avant la Révolution' },
  { author: 'Laclos', work: 'Les Liaisons dangereuses', century: 'XVIIIᵉ', genre: 'roman épistolaire', movement: 'Lumières', note: 'manipulation et libertinage' },
  { author: 'Prévost', work: 'Manon Lescaut', century: 'XVIIIᵉ', genre: 'roman-mémoires', movement: 'Lumières', note: 'passion et marginalité' },
  { author: 'Apollinaire', work: 'Alcools', century: 'XXᵉ', genre: 'recueil poétique', movement: 'Modernité', note: '« Zone », modernité et mélancolie' },
  { author: 'Éluard', work: 'Liberté', century: 'XXᵉ', genre: 'poème', movement: 'Surréalisme/Résistance', note: 'poème de la Résistance, 1942' },
  { author: 'Saint-Exupéry', work: 'Le Petit Prince', century: 'XXᵉ', genre: 'conte philosophique', movement: 'Humanisme', note: 'regard de l’enfance sur le monde adulte' },
  { author: 'Gary', work: 'La Vie devant soi', century: 'XXᵉ', genre: 'roman', movement: 'Modernité', note: 'prix Goncourt 1975 sous le pseudonyme Émile Ajar' },
  { author: 'Vian', work: 'L’Écume des jours', century: 'XXᵉ', genre: 'roman', movement: 'Modernité', note: 'poésie et absurdité tragique' },
  { author: 'Le Clézio', work: 'Désert', century: 'XXᵉ', genre: 'roman', movement: 'Nouveau Roman/Modernité', note: 'prix Nobel 2008' },
];

/* ---------------- Genres et registres ---------------- */
export const GENRES: { name: string; definition: string; examples: string }[] = [
  { name: 'apologue', definition: 'récit bref porteur d’un enseignement moral', examples: 'fable, conte philosophique, utopie' },
  { name: 'tragédie', definition: 'pièce mettant en scène des héros confrontés à un destin inévitable, ton élevé', examples: 'Phèdre, Le Cid' },
  { name: 'comédie', definition: 'pièce qui fait rire pour corriger les mœurs', examples: 'Le Tartuffe, L’Avare' },
  { name: 'drame romantique', definition: 'genre mêlant tragique et comique, refus des règles classiques', examples: 'Hernani, Ruy Blas' },
  { name: 'roman épistolaire', definition: 'roman composé de lettres échangées entre personnages', examples: 'Les Liaisons dangereuses' },
  { name: 'autobiographie', definition: 'récit rétrospectif qu’une personne réelle fait de sa propre vie', examples: 'Les Confessions' },
  { name: 'autoportrait', definition: 'description de soi privilégiant l’image physique et morale', examples: 'autoportraits de Montaigne' },
  { name: 'essai', definition: 'œuvre de réflexion personnelle sur un sujet', examples: 'Le Deuxième Sexe' },
  { name: 'pamphlet', definition: 'écrit court et violent qui attaque une personne ou une institution', examples: 'pamphlets de Voltaire' },
  { name: 'conte philosophique', definition: 'récit imaginaire servant une critique des idées', examples: 'Candide, Micromégas' },
  { name: 'poésie lyrique', definition: 'expression des sentiments personnels du poète', examples: '« Le Lac » de Lamartine' },
  { name: 'poésie engagée', definition: 'poésie au service d’une cause politique ou morale', examples: '« Liberté » d’Éluard' },
  { name: 'théâtre de l’absurde', definition: 'dramaturgie du XXᵉ siècle contestant le sens et le langage', examples: 'En attendant Godot' },
  { name: 'roman d’apprentissage', definition: 'récit de la formation et de l’évolution d’un jeune personnage', examples: 'Le Rouge et le Noir' },
];

export const REGISTERS: { name: string; definition: string; effect: string }[] = [
  { name: 'comique', definition: 'provoque le rire', effect: 'amuser, critiquer par la dérision' },
  { name: 'tragique', definition: 'met en scène un destin inéluctable', effect: 'susciter terreur et pitié' },
  { name: 'pathétique', definition: 'insiste sur la souffrance', effect: 'émouvoir, provoquer la compassion' },
  { name: 'lyrique', definition: 'exprime les sentiments personnels', effect: 'faire partager une émotion' },
  { name: 'épique', definition: 'amplifie les exploits et les combats', effect: 'faire admirer, exalter' },
  { name: 'ironique', definition: 'dit le contraire de ce qu’il faut comprendre', effect: 'se moquer, dénoncer' },
  { name: 'satirique', definition: 'critique les travers d’une personne ou d’une société', effect: 'dénoncer en faisant rire' },
  { name: 'didactique', definition: 'vise à transmettre un savoir', effect: 'instruire le lecteur' },
  { name: 'fantastique', definition: 'introduit un événement inexplicable', effect: 'créer le doute et l’angoisse' },
  { name: 'merveilleux', definition: 'le surnaturel est accepté sans surprise', effect: 'faire rêver' },
];

/* ---------------- Vocabulaire ---------------- */
export const SYNONYMS: [string, string[]][] = [
  ['heureux', ['joyeux', 'content', 'épanoui', 'ravi']],
  ['triste', ['mélancolique', 'affligé', 'chagrin', 'morose']],
  ['beau', ['magnifique', 'superbe', 'splendide', 'ravissant']],
  ['peur', ['crainte', 'effroi', 'angoisse', 'terreur']],
  ['colère', ['courroux', 'fureur', 'ire', 'emportement']],
  ['rapide', ['vif', 'prompt', 'véloce', 'fulgurant']],
  ['lent', ['tardif', 'pesant', 'nonchalant', 'traînant']],
  ['grand', ['immense', 'vaste', 'gigantesque', 'élevé']],
  ['petit', ['minuscule', 'exigu', 'modeste', 'menu']],
  ['intelligent', ['perspicace', 'sagace', 'vif', 'brillant']],
  ['courageux', ['vaillant', 'brave', 'intrépide', 'audacieux']],
  ['avare', ['pingre', 'mesquin', 'ladre', 'économe']],
  ['parler', ['s’exprimer', 'discourir', 'converser', 'déclarer']],
  ['regarder', ['observer', 'contempler', 'examiner', 'scruter']],
  ['marcher', ['avancer', 'cheminer', 'déambuler', 'arpenter']],
  ['maison', ['demeure', 'logis', 'habitation', 'foyer']],
  ['travail', ['labeur', 'besogne', 'tâche', 'ouvrage']],
  ['enfant', ['gamin', 'bambin', 'marmot', 'môme']],
  ['vieillard', ['aïeul', 'ancien', 'vieil homme', 'senior']],
  ['nuit', ['ténèbres', 'obscurité', 'ombre', 'noirceur']],
];

export const ANTONYMS: [string, string][] = [
  ['jour', 'nuit'], ['chaud', 'froid'], ['vite', 'lentement'], ['riche', 'pauvre'],
  ['fort', 'faible'], ['joyeux', 'triste'], ['ancien', 'récent'], ['ouvert', 'fermé'],
  ['entrée', 'sortie'], ['guerre', 'paix'], ['vérité', 'mensonge'], ['lumières', 'ténèbres'],
  ['courage', 'lâcheté'], ['générosité', 'égoïsme'], ['espoir', 'désespoir'], ['ordre', 'désordre'],
  ['progrès', 'régression'], ['liberté', 'servitude'], ['jeunesse', 'vieillesse'], ['haut', 'bas'],
];

export const WORD_FAMILIES: { root: string; family: string[] }[] = [
  { root: 'terre', family: ['terrestre', 'territoire', 'terrain', 'atterrir', 'terrasse'] },
  { root: 'mer', family: ['marin', 'maritime', 'marée', 'marinier', 'sous-marin'] },
  { root: 'chant', family: ['chanter', 'chanteur', 'chanson', 'enchanter', 'chantre'] },
  { root: 'dent', family: ['dentaire', 'dentiste', 'dentition', 'dentelé'] },
  { root: 'fleur', family: ['fleuri', 'fleurir', 'floraison', 'fleuriste', 'floral'] },
  { root: 'nuit', family: ['nocturne', 'nuitamment', 'noctambule'] },
  { root: 'homme', family: ['humain', 'humanité', 'humanisme', 'hominidé'] },
  { root: 'livre', family: ['livret', 'librairie', 'livreur', 'livresque'] },
  { root: 'rouge', family: ['rougeâtre', 'rougeoyer', 'rougir', 'rougeur'] },
  { root: 'vent', family: ['venteux', 'ventilation', 'éventail', 'ventouse'] },
];

/* ---------------- Conjugaison : temps composés et règles ---------------- */
export const CONJUGATION_RULES: { question: string; correct: string; wrong: string[]; rule: string }[] = [
  { question: 'Quel est le participe passé du verbe « prendre » ?', correct: 'pris', wrong: ['prendu', 'prisé', 'prenu'], rule: 'Verbe du 3ᵉ groupe : prendre → pris, prise, pris.' },
  { question: 'Quel est le participe passé du verbe « écrire » ?', correct: 'écrit', wrong: ['écrité', 'écris', 'écrive'], rule: 'écrire → écrit (participe passé en -it).' },
  { question: 'Quel est le participe passé du verbe « voir » ?', correct: 'vu', wrong: ['voyé', 'vueil', 'voir'], rule: 'voir → vu (auxiliaire avoir : j’ai vu).' },
  { question: 'Quel auxiliaire utilise le verbe « aller » au passé composé ?', correct: 'être', wrong: ['avoir', 'les deux indifféremment', 'aucun'], rule: 'Les verbes de mouvement du 3ᵉ groupe comme aller se conjuguent avec être : je suis allé.' },
  { question: 'Quel est le passé simple de « nous fîmes » à la 1ʳᵉ personne du singulier ?', correct: 'je fis', wrong: ['je ferais', 'j’ai fait', 'je fus'], rule: 'Passé simple de faire : je fis, tu fis, il fit, nous fîmes.' },
  { question: 'Conjuguez « savoir » à la 1ʳᵉ personne du présent : je ___', correct: 'sais', wrong: ['sait', 'savent', 'saisi'], rule: 'savoir : je sais, tu sais, il sait, nous savons.' },
  { question: 'Quel est le futur simple de « pouvoir » à la 1ʳᵉ personne ?', correct: 'je pourrai', wrong: ['je pouvrai', 'je pourais', 'je pouvais'], rule: 'Futur de pouvoir : je pourrai (radical pourr-).' },
  { question: 'Quel est le conditionnel présent de « devoir » à la 1ʳᵉ personne ?', correct: 'je devrais', wrong: ['je doivrais', 'je devrai', 'je dusse'], rule: 'Conditionnel : je devrais (avec s) ; « je devrai » est le futur.' },
  { question: 'Conjuguez « plaire » au subjonctif présent, 1ʳᵉ personne : que je ___', correct: 'plaise', wrong: ['plait', 'plais', 'plaira'], rule: 'Subjonctif de plaire : que je plaise.' },
  { question: 'Quel est l’imparfait du verbe « voir » à la 1ʳᵉ personne du pluriel ?', correct: 'nous voyions', wrong: ['nous voyons', 'nous voiyons', 'nous vîmes'], rule: 'Imparfait de voir : nous voyions (deux i).' },
  { question: 'Quel est le subjonctif présent de « être » à la 3ᵉ personne du singulier ?', correct: 'qu’il soit', wrong: ['qu’il est', 'qu’il serait', 'qu’il soit-être'], rule: 'Subjonctif de être : que je sois, qu’il soit.' },
  { question: 'Quel est le passé composé de « naître » à la 1ʳᵉ personne (femme) ?', correct: 'je suis née', wrong: ['j’ai né', 'j’ai née', 'je suis né (accord impossible)'], rule: 'Naître se conjugue avec être : accord du participe avec le sujet → je suis née.' },
  { question: 'Conjuguez « résoudre » au présent, 3ᵉ personne du singulier : il ___', correct: 'résout', wrong: ['résous', 'résoudre', 'résouds'], rule: 'résoudre : je résous, il résout, nous résolvons.' },
  { question: 'Conjuguez « vaincre » au présent, 3ᵉ personne du singulier : il ___', correct: 'vainc', wrong: ['vaincs', 'vaint', 'vainque'], rule: 'vaincre : il vainc (sans -t), nous vainquons.' },
  { question: 'Quel est le participe passé de « mourir » ?', correct: 'mort', wrong: ['mouru', 'meurt', 'mouré'], rule: 'mourir → mort (elle est morte).' },
];

/* ================================================================== */
/*  Tables de conjugaison française                                    */
/* ================================================================== */

export type Person = 0 | 1 | 2 | 3 | 4 | 5; // je, tu, il/elle/on, nous, vous, ils/elles

export const FRENCH_TENSES = {
  present: "présent de l'indicatif",
  imparfait: "imparfait de l'indicatif",
  futur: 'futur simple',
  conditionnel: 'conditionnel présent',
  subjonctif: 'présent du subjonctif',
} as const;

export type FrenchTense = keyof typeof FRENCH_TENSES;

export interface FrenchVerb {
  infinitive: string;
  group: 1 | 2 | 3;
  stem: string;
  stems?: Partial<Record<FrenchTense, string>>;
  pastParticiple: string;
  auxiliary: 'avoir' | 'etre';
  note?: string;
}

/** Terminaisons des verbes réguliers du 1er groupe (-er). */
export const ER_ENDINGS: Record<FrenchTense, string[]> = {
  present: ['e', 'es', 'e', 'ons', 'ez', 'ent'],
  imparfait: ['ais', 'ais', 'ait', 'ions', 'iez', 'aient'],
  futur: ['ai', 'as', 'a', 'ons', 'ez', 'ont'],
  conditionnel: ['ais', 'ais', 'ait', 'ions', 'iez', 'aient'],
  subjonctif: ['e', 'es', 'e', 'ions', 'iez', 'ent'],
};

/** Terminaisons du 2e groupe (-ir type finir). */
export const IR_ENDINGS: Record<FrenchTense, string[]> = {
  present: ['is', 'is', 'it', 'issons', 'issez', 'issent'],
  imparfait: ['issais', 'issais', 'issait', 'issions', 'issiez', 'issaient'],
  futur: ['ai', 'as', 'a', 'ons', 'ez', 'ont'],
  conditionnel: ['ais', 'ais', 'ait', 'ions', 'iez', 'aient'],
  subjonctif: ['isse', 'isses', 'isse', 'issions', 'issiez', 'issent'],
};

/** Terminaisons du 3e groupe en -dre / -re (type vendre, attendre). */
export const RE_ENDINGS: Record<FrenchTense, string[]> = {
  present: ['s', 's', '', 'ons', 'ez', 'ent'],
  imparfait: ['ais', 'ais', 'ait', 'ions', 'iez', 'aient'],
  futur: ['ai', 'as', 'a', 'ons', 'ez', 'ont'],
  conditionnel: ['ais', 'ais', 'ait', 'ions', 'iez', 'aient'],
  subjonctif: ['e', 'es', 'e', 'ions', 'iez', 'ent'],
};

/** Formes entièrement irrégulières (présent de l'indicatif / subjonctif). */
export const IRREGULAR_FORMS: Record<string, string[]> = {
  etre: ['suis', 'es', 'est', 'sommes', 'êtes', 'sont'],
  'etre-sub': ['sois', 'sois', 'soit', 'soyons', 'soyez', 'soient'],
  avoir: ['ai', 'as', 'a', 'avons', 'avez', 'ont'],
  'avoir-sub': ['aie', 'aies', 'ait', 'ayons', 'ayez', 'aient'],
  aller: ['vais', 'vas', 'va', 'allons', 'allez', 'vont'],
  'aller-sub': ['aille', 'ailles', 'aille', 'allions', 'alliez', 'aillent'],
  faire: ['fais', 'fais', 'fait', 'faisons', 'faites', 'font'],
  dire: ['dis', 'dis', 'dit', 'disons', 'dites', 'disent'],
  pouvoir: ['peux', 'peux', 'peut', 'pouvons', 'pouvez', 'peuvent'],
  vouloir: ['veux', 'veux', 'veut', 'voulons', 'voulez', 'veulent'],
  venir: ['viens', 'viens', 'vient', 'venons', 'venez', 'viennent'],
  prendre: ['prends', 'prends', 'prend', 'prenons', 'prenez', 'prennent'],
  voir: ['vois', 'vois', 'voit', 'voyons', 'voyez', 'voient'],
  savoir: ['sais', 'sais', 'sait', 'savons', 'savez', 'savent'],
  devoir: ['dois', 'dois', 'doit', 'devons', 'devez', 'doivent'],
  partir: ['pars', 'pars', 'part', 'partons', 'partez', 'partent'],
  sortir: ['sors', 'sors', 'sort', 'sortons', 'sortez', 'sortent'],
  dormir: ['dors', 'dors', 'dort', 'dormons', 'dormez', 'dorment'],
  lire: ['lis', 'lis', 'lit', 'lisons', 'lisez', 'lisent'],
  ecrire: ['écris', 'écris', 'écrit', 'écrivons', 'écrivez', 'écrivent'],
  mettre: ['mets', 'mets', 'met', 'mettons', 'mettez', 'mettent'],
  attendre: ['attends', 'attends', 'attend', 'attendons', 'attendez', 'attendent'],
  vendre: ['vends', 'vends', 'vend', 'vendons', 'vendez', 'vendent'],
  repondre: ['réponds', 'réponds', 'répond', 'répondons', 'répondez', 'répondent'],
  connaitre: ['connais', 'connais', 'connaît', 'connaissons', 'connaissez', 'connaissent'],
  croire: ['crois', 'crois', 'croit', 'croyons', 'croyez', 'croient'],
  ouvrir: ['ouvre', 'ouvres', 'ouvre', 'ouvrons', 'ouvrez', 'ouvrent'],
  courir: ['cours', 'cours', 'court', 'courons', 'courez', 'courent'],
  mourir: ['meurs', 'meurs', 'meurt', 'mourons', 'mourez', 'meurent'],
  naitre: ['nais', 'nais', 'naît', 'naissons', 'naissez', 'naissent'],
  plaire: ['plais', 'plais', 'plaît', 'plaisons', 'plaisez', 'plaisent'],
  rire: ['ris', 'ris', 'rit', 'rions', 'riez', 'rient'],
  suivre: ['suis', 'suis', 'suit', 'suivons', 'suivez', 'suivent'],
  vivre: ['vis', 'vis', 'vit', 'vivons', 'vivez', 'vivent'],
  boire: ['bois', 'bois', 'boit', 'buvons', 'buvez', 'boivent'],
  recevoir: ['reçois', 'reçois', 'reçoit', 'recevons', 'recevez', 'reçoivent'],
  apercevoir: ['aperçois', 'aperçois', 'aperçoit', 'apercevons', 'apercevez', 'aperçoivent'],
  tenir: ['tiens', 'tiens', 'tient', 'tenons', 'tenez', 'tiennent'],
  sentir: ['sens', 'sens', 'sent', 'sentons', 'sentez', 'sentent'],
  servir: ['sers', 'sers', 'sert', 'servons', 'servez', 'servent'],
  peindre: ['peins', 'peins', 'peint', 'peignons', 'peignez', 'peignent'],
  joindre: ['joins', 'joins', 'joint', 'joignons', 'joignez', 'joignent'],
  produire: ['produis', 'produis', 'produit', 'produisons', 'produisez', 'produisent'],
  conduire: ['conduis', 'conduis', 'conduit', 'conduisons', 'conduisez', 'conduisent'],
  construire: ['construis', 'construis', 'construit', 'construisons', 'construisez', 'construisent'],
  traduire: ['traduis', 'traduis', 'traduit', 'traduisons', 'traduisez', 'traduisent'],
  falloir: ['faut', 'faut', 'faut', 'faut', 'faut', 'faut'],
  pleuvoir: ['pleut', 'pleut', 'pleut', 'pleut', 'pleut', 'pleut'],
  suffire: ['suffis', 'suffis', 'suffit', 'suffisons', 'suffisez', 'suffisent'],
  vaincre: ['vaincs', 'vaincs', 'vainc', 'vainquons', 'vainquez', 'vainquent'],
  resoudre: ['résous', 'résous', 'résout', 'résolvons', 'résolvez', 'résolvent'],
  asseoir: ['assieds', 'assieds', 'assied', 'asseyons', 'asseyez', 'asseyent'],
};

export const FRENCH_VERBS: FrenchVerb[] = [
  // --- 1er groupe (-er) ---
  { infinitive: 'parler', group: 1, stem: 'parl', pastParticiple: 'parlé', auxiliary: 'avoir' },
  { infinitive: 'manger', group: 1, stem: 'mang', pastParticiple: 'mangé', auxiliary: 'avoir', note: 'Nous mangeons (e de liaison devant a/o).' },
  { infinitive: 'chanter', group: 1, stem: 'chant', pastParticiple: 'chanté', auxiliary: 'avoir' },
  { infinitive: 'danser', group: 1, stem: 'dans', pastParticiple: 'dansé', auxiliary: 'avoir' },
  { infinitive: 'regarder', group: 1, stem: 'regard', pastParticiple: 'regardé', auxiliary: 'avoir' },
  { infinitive: 'écouter', group: 1, stem: 'écout', pastParticiple: 'écouté', auxiliary: 'avoir' },
  { infinitive: 'travailler', group: 1, stem: 'travaill', pastParticiple: 'travaillé', auxiliary: 'avoir' },
  { infinitive: 'étudier', group: 1, stem: 'étudi', pastParticiple: 'étudié', auxiliary: 'avoir' },
  { infinitive: 'aimer', group: 1, stem: 'aim', pastParticiple: 'aimé', auxiliary: 'avoir' },
  { infinitive: 'penser', group: 1, stem: 'pens', pastParticiple: 'pensé', auxiliary: 'avoir' },
  { infinitive: 'chercher', group: 1, stem: 'cherch', pastParticiple: 'cherché', auxiliary: 'avoir' },
  { infinitive: 'trouver', group: 1, stem: 'trouv', pastParticiple: 'trouvé', auxiliary: 'avoir' },
  { infinitive: 'donner', group: 1, stem: 'donn', pastParticiple: 'donné', auxiliary: 'avoir' },
  { infinitive: 'porter', group: 1, stem: 'port', pastParticiple: 'porté', auxiliary: 'avoir' },
  { infinitive: 'jouer', group: 1, stem: 'jou', pastParticiple: 'joué', auxiliary: 'avoir' },
  { infinitive: 'commencer', group: 1, stem: 'commenc', pastParticiple: 'commencé', auxiliary: 'avoir', note: 'Nous commençons (c cédille devant a/o).' },
  { infinitive: 'lancer', group: 1, stem: 'lanc', pastParticiple: 'lancé', auxiliary: 'avoir', note: 'Nous lançons (c cédille).' },
  { infinitive: 'marcher', group: 1, stem: 'march', pastParticiple: 'marché', auxiliary: 'avoir' },
  { infinitive: 'expliquer', group: 1, stem: 'expliqu', pastParticiple: 'expliqué', auxiliary: 'avoir' },
  { infinitive: 'raconter', group: 1, stem: 'racont', pastParticiple: 'raconté', auxiliary: 'avoir' },
  { infinitive: 'oublier', group: 1, stem: 'oubli', pastParticiple: 'oublié', auxiliary: 'avoir' },
  { infinitive: 'utiliser', group: 1, stem: 'utilis', pastParticiple: 'utilisé', auxiliary: 'avoir' },
  { infinitive: 'montrer', group: 1, stem: 'montr', pastParticiple: 'montré', auxiliary: 'avoir' },
  { infinitive: 'passer', group: 1, stem: 'pass', pastParticiple: 'passé', auxiliary: 'avoir' },
  { infinitive: 'arriver', group: 1, stem: 'arriv', pastParticiple: 'arrivé', auxiliary: 'etre' },
  { infinitive: 'entrer', group: 1, stem: 'entr', pastParticiple: 'entré', auxiliary: 'etre' },
  { infinitive: 'tomber', group: 1, stem: 'tomb', pastParticiple: 'tombé', auxiliary: 'etre' },
  { infinitive: 'rester', group: 1, stem: 'rest', pastParticiple: 'resté', auxiliary: 'etre' },
  { infinitive: 'monter', group: 1, stem: 'mont', pastParticiple: 'monté', auxiliary: 'etre' },
  { infinitive: 'descendre', group: 3, stem: 'descend', pastParticiple: 'descendu', auxiliary: 'etre', stems: { present: 'special:attendre', imparfait: 'descend', futur: 'descendr', conditionnel: 'descendr', subjonctif: 'descend' } },

  // --- 2e groupe (-ir, participe présent en -issant) ---
  { infinitive: 'finir', group: 2, stem: 'fin', pastParticiple: 'fini', auxiliary: 'avoir' },
  { infinitive: 'choisir', group: 2, stem: 'chois', pastParticiple: 'choisi', auxiliary: 'avoir' },
  { infinitive: 'réfléchir', group: 2, stem: 'réfléch', pastParticiple: 'réfléchi', auxiliary: 'avoir' },
  { infinitive: 'réussir', group: 2, stem: 'réuss', pastParticiple: 'réussi', auxiliary: 'avoir' },
  { infinitive: 'grandir', group: 2, stem: 'grand', pastParticiple: 'grandi', auxiliary: 'avoir' },
  { infinitive: 'obéir', group: 2, stem: 'obé', pastParticiple: 'obéi', auxiliary: 'avoir' },
  { infinitive: 'remplir', group: 2, stem: 'rempl', pastParticiple: 'rempli', auxiliary: 'avoir' },
  { infinitive: 'punir', group: 2, stem: 'pun', pastParticiple: 'puni', auxiliary: 'avoir' },
  { infinitive: 'établir', group: 2, stem: 'établ', pastParticiple: 'établi', auxiliary: 'avoir' },
  { infinitive: 'nourrir', group: 2, stem: 'nourr', pastParticiple: 'nourri', auxiliary: 'avoir' },
  { infinitive: 'ralentir', group: 2, stem: 'ralent', pastParticiple: 'ralenti', auxiliary: 'avoir' },
  { infinitive: 'grossir', group: 2, stem: 'gross', pastParticiple: 'grossi', auxiliary: 'avoir' },

  // --- 3e groupe ---
  { infinitive: 'être', group: 3, stem: 'êt', pastParticiple: 'été', auxiliary: 'avoir', stems: { present: 'special:etre', imparfait: 'ét', futur: 'ser', conditionnel: 'ser', subjonctif: 'special:etre-sub' } },
  { infinitive: 'avoir', group: 3, stem: 'av', pastParticiple: 'eu', auxiliary: 'avoir', stems: { present: 'special:avoir', imparfait: 'av', futur: 'aur', conditionnel: 'aur', subjonctif: 'special:avoir-sub' } },
  { infinitive: 'aller', group: 3, stem: 'all', pastParticiple: 'allé', auxiliary: 'etre', stems: { present: 'special:aller', imparfait: 'all', futur: 'ir', conditionnel: 'ir', subjonctif: 'special:aller-sub' } },
  { infinitive: 'faire', group: 3, stem: 'fais', pastParticiple: 'fait', auxiliary: 'avoir', stems: { present: 'special:faire', imparfait: 'fais', futur: 'fer', conditionnel: 'fer', subjonctif: 'fass' } },
  { infinitive: 'dire', group: 3, stem: 'dis', pastParticiple: 'dit', auxiliary: 'avoir', stems: { present: 'special:dire', imparfait: 'dis', futur: 'dir', conditionnel: 'dir', subjonctif: 'dis' } },
  { infinitive: 'pouvoir', group: 3, stem: 'peuv', pastParticiple: 'pu', auxiliary: 'avoir', stems: { present: 'special:pouvoir', imparfait: 'pouv', futur: 'pourr', conditionnel: 'pourr', subjonctif: 'puiss' } },
  { infinitive: 'vouloir', group: 3, stem: 'voul', pastParticiple: 'voulu', auxiliary: 'avoir', stems: { present: 'special:vouloir', imparfait: 'voul', futur: 'voudr', conditionnel: 'voudr', subjonctif: 'veuill' } },
  { infinitive: 'venir', group: 3, stem: 'vien', pastParticiple: 'venu', auxiliary: 'etre', stems: { present: 'special:venir', imparfait: 'ven', futur: 'viendr', conditionnel: 'viendr', subjonctif: 'vienn' } },
  { infinitive: 'prendre', group: 3, stem: 'prend', pastParticiple: 'pris', auxiliary: 'avoir', stems: { present: 'special:prendre', imparfait: 'pren', futur: 'prendr', conditionnel: 'prendr', subjonctif: 'prenn' } },
  { infinitive: 'voir', group: 3, stem: 'voi', pastParticiple: 'vu', auxiliary: 'avoir', stems: { present: 'special:voir', imparfait: 'voy', futur: 'verr', conditionnel: 'verr', subjonctif: 'voi' } },
  { infinitive: 'savoir', group: 3, stem: 'sai', pastParticiple: 'su', auxiliary: 'avoir', stems: { present: 'special:savoir', imparfait: 'sav', futur: 'saur', conditionnel: 'saur', subjonctif: 'sach' } },
  { infinitive: 'devoir', group: 3, stem: 'doi', pastParticiple: 'dû', auxiliary: 'avoir', stems: { present: 'special:devoir', imparfait: 'dev', futur: 'devr', conditionnel: 'devr', subjonctif: 'dev' } },
  { infinitive: 'partir', group: 3, stem: 'pars', pastParticiple: 'parti', auxiliary: 'etre', stems: { present: 'special:partir', imparfait: 'part', futur: 'partir', conditionnel: 'partir', subjonctif: 'part' } },
  { infinitive: 'sortir', group: 3, stem: 'sors', pastParticiple: 'sorti', auxiliary: 'etre', stems: { present: 'special:sortir', imparfait: 'sort', futur: 'sortir', conditionnel: 'sortir', subjonctif: 'sort' } },
  { infinitive: 'dormir', group: 3, stem: 'dors', pastParticiple: 'dormi', auxiliary: 'avoir', stems: { present: 'special:dormir', imparfait: 'dorm', futur: 'dormir', conditionnel: 'dormir', subjonctif: 'dorm' } },
  { infinitive: 'lire', group: 3, stem: 'li', pastParticiple: 'lu', auxiliary: 'avoir', stems: { present: 'special:lire', imparfait: 'lis', futur: 'lir', conditionnel: 'lir', subjonctif: 'lis' } },
  { infinitive: 'écrire', group: 3, stem: 'écri', pastParticiple: 'écrit', auxiliary: 'avoir', stems: { present: 'special:ecrire', imparfait: 'écriv', futur: 'écrir', conditionnel: 'écrir', subjonctif: 'écriv' } },
  { infinitive: 'mettre', group: 3, stem: 'met', pastParticiple: 'mis', auxiliary: 'avoir', stems: { present: 'special:mettre', imparfait: 'mett', futur: 'mettr', conditionnel: 'mettr', subjonctif: 'mett' } },
  { infinitive: 'attendre', group: 3, stem: 'attend', pastParticiple: 'attendu', auxiliary: 'avoir', stems: { present: 'special:attendre', imparfait: 'attend', futur: 'attendr', conditionnel: 'attendr', subjonctif: 'attend' } },
  { infinitive: 'vendre', group: 3, stem: 'vend', pastParticiple: 'vendu', auxiliary: 'avoir', stems: { present: 'special:vendre', imparfait: 'vend', futur: 'vendr', conditionnel: 'vendr', subjonctif: 'vend' } },
  { infinitive: 'répondre', group: 3, stem: 'répond', pastParticiple: 'répondu', auxiliary: 'avoir', stems: { present: 'special:repondre', imparfait: 'répond', futur: 'répondr', conditionnel: 'répondr', subjonctif: 'répond' } },
  { infinitive: 'connaître', group: 3, stem: 'connaî', pastParticiple: 'connu', auxiliary: 'avoir', stems: { present: 'special:connaitre', imparfait: 'connaiss', futur: 'connaîtr', conditionnel: 'connaîtr', subjonctif: 'connaiss' } },
  { infinitive: 'croire', group: 3, stem: 'croi', pastParticiple: 'cru', auxiliary: 'avoir', stems: { present: 'special:croire', imparfait: 'croy', futur: 'croir', conditionnel: 'croir', subjonctif: 'croi' } },
  { infinitive: 'ouvrir', group: 3, stem: 'ouvr', pastParticiple: 'ouvert', auxiliary: 'avoir', stems: { present: 'special:ouvrir', imparfait: 'ouvr', futur: 'ouvrir', conditionnel: 'ouvrir', subjonctif: 'ouvr' } },
  { infinitive: 'courir', group: 3, stem: 'cour', pastParticiple: 'couru', auxiliary: 'avoir', stems: { present: 'special:courir', imparfait: 'cour', futur: 'courr', conditionnel: 'courr', subjonctif: 'cour' } },
  { infinitive: 'mourir', group: 3, stem: 'meur', pastParticiple: 'mort', auxiliary: 'etre', stems: { present: 'special:mourir', imparfait: 'mour', futur: 'mourr', conditionnel: 'mourr', subjonctif: 'meur' } },
  { infinitive: 'naître', group: 3, stem: 'naî', pastParticiple: 'né', auxiliary: 'etre', stems: { present: 'special:naitre', imparfait: 'naiss', futur: 'naîtr', conditionnel: 'naîtr', subjonctif: 'naiss' } },
  { infinitive: 'plaire', group: 3, stem: 'plai', pastParticiple: 'plu', auxiliary: 'avoir', stems: { present: 'special:plaire', imparfait: 'plais', futur: 'plair', conditionnel: 'plair', subjonctif: 'plais' } },
  { infinitive: 'rire', group: 3, stem: 'ri', pastParticiple: 'ri', auxiliary: 'avoir', stems: { present: 'special:rire', imparfait: 'ri', futur: 'rir', conditionnel: 'rir', subjonctif: 'ri' } },
  { infinitive: 'suivre', group: 3, stem: 'sui', pastParticiple: 'suivi', auxiliary: 'avoir', stems: { present: 'special:suivre', imparfait: 'suiv', futur: 'suivr', conditionnel: 'suivr', subjonctif: 'suiv' } },
  { infinitive: 'vivre', group: 3, stem: 'vi', pastParticiple: 'vécu', auxiliary: 'avoir', stems: { present: 'special:vivre', imparfait: 'viv', futur: 'vivr', conditionnel: 'vivr', subjonctif: 'viv' } },
  { infinitive: 'boire', group: 3, stem: 'boi', pastParticiple: 'bu', auxiliary: 'avoir', stems: { present: 'special:boire', imparfait: 'buv', futur: 'boir', conditionnel: 'boir', subjonctif: 'buv' } },
  { infinitive: 'recevoir', group: 3, stem: 'reçoi', pastParticiple: 'reçu', auxiliary: 'avoir', stems: { present: 'special:recevoir', imparfait: 'recev', futur: 'recevr', conditionnel: 'recevr', subjonctif: 'reçoiv' } },
  { infinitive: 'apercevoir', group: 3, stem: 'aperçoi', pastParticiple: 'aperçu', auxiliary: 'avoir', stems: { present: 'special:apercevoir', imparfait: 'apercev', futur: 'apercevr', conditionnel: 'apercevr', subjonctif: 'aperçoiv' } },
  { infinitive: 'tenir', group: 3, stem: 'tien', pastParticiple: 'tenu', auxiliary: 'avoir', stems: { present: 'special:tenir', imparfait: 'ten', futur: 'tiendr', conditionnel: 'tiendr', subjonctif: 'tienn' } },
  { infinitive: 'sentir', group: 3, stem: 'sen', pastParticiple: 'senti', auxiliary: 'avoir', stems: { present: 'special:sentir', imparfait: 'sent', futur: 'sentir', conditionnel: 'sentir', subjonctif: 'sent' } },
  { infinitive: 'servir', group: 3, stem: 'ser', pastParticiple: 'servi', auxiliary: 'avoir', stems: { present: 'special:servir', imparfait: 'serv', futur: 'servir', conditionnel: 'servir', subjonctif: 'serv' } },
  { infinitive: 'peindre', group: 3, stem: 'pein', pastParticiple: 'peint', auxiliary: 'avoir', stems: { present: 'special:peindre', imparfait: 'peign', futur: 'peindr', conditionnel: 'peindr', subjonctif: 'peign' } },
  { infinitive: 'joindre', group: 3, stem: 'join', pastParticiple: 'joint', auxiliary: 'avoir', stems: { present: 'special:joindre', imparfait: 'joign', futur: 'joindr', conditionnel: 'joindr', subjonctif: 'joign' } },
  { infinitive: 'produire', group: 3, stem: 'produi', pastParticiple: 'produit', auxiliary: 'avoir', stems: { present: 'special:produire', imparfait: 'produis', futur: 'produir', conditionnel: 'produir', subjonctif: 'produis' } },
  { infinitive: 'conduire', group: 3, stem: 'condui', pastParticiple: 'conduit', auxiliary: 'avoir', stems: { present: 'special:conduire', imparfait: 'conduis', futur: 'conduir', conditionnel: 'conduir', subjonctif: 'conduis' } },
  { infinitive: 'construire', group: 3, stem: 'construi', pastParticiple: 'construit', auxiliary: 'avoir', stems: { present: 'special:construire', imparfait: 'construis', futur: 'construir', conditionnel: 'construir', subjonctif: 'construis' } },
  { infinitive: 'traduire', group: 3, stem: 'tradui', pastParticiple: 'traduit', auxiliary: 'avoir', stems: { present: 'special:traduire', imparfait: 'traduis', futur: 'traduir', conditionnel: 'traduir', subjonctif: 'traduis' } },
  { infinitive: 'falloir', group: 3, stem: 'fau', pastParticiple: 'fallu', auxiliary: 'avoir', stems: { present: 'special:falloir', imparfait: 'fall', futur: 'faudr', conditionnel: 'faudr', subjonctif: 'faill' } },
  { infinitive: 'suffire', group: 3, stem: 'suffi', pastParticiple: 'suffi', auxiliary: 'avoir', stems: { present: 'special:suffire', imparfait: 'suffis', futur: 'suffir', conditionnel: 'suffir', subjonctif: 'suffis' } },
  { infinitive: 'vaincre', group: 3, stem: 'vainc', pastParticiple: 'vaincu', auxiliary: 'avoir', stems: { present: 'special:vaincre', imparfait: 'vainqu', futur: 'vaincr', conditionnel: 'vaincr', subjonctif: 'vainqu' } },
  { infinitive: 'résoudre', group: 3, stem: 'résou', pastParticiple: 'résolu', auxiliary: 'avoir', stems: { present: 'special:resoudre', imparfait: 'résolv', futur: 'résoudr', conditionnel: 'résoudr', subjonctif: 'résolv' } },
  { infinitive: 'asseoir', group: 3, stem: 'assois', pastParticiple: 'assis', auxiliary: 'avoir', stems: { present: 'special:asseoir', imparfait: 'assey', futur: 'assoir', conditionnel: 'assoir', subjonctif: 'assey' } },
];

/**
 * Conjugue un verbe français à un temps simple.
 * Retourne null si la forme n'est pas couverte par les tables.
 */
export function conjugateFrench(
  verb: FrenchVerb,
  tense: FrenchTense,
  person: Person,
): string | null {
  const stemSpec = verb.stems?.[tense];

  // 1) Verbes dotés d'une table explicite (irréguliers du 3e groupe).
  if (stemSpec) {
    if (stemSpec.startsWith('special:')) {
      const forms = IRREGULAR_FORMS[stemSpec.slice('special:'.length)];
      return forms ? forms[person] : null;
    }
    if (tense === 'futur' || tense === 'conditionnel') {
      return stemSpec + ER_ENDINGS[tense][person];
    }
    const endings = verb.group === 2 ? IR_ENDINGS[tense] : ER_ENDINGS[tense];
    return stemSpec + endings[person];
  }

  // 2) Futur simple et conditionnel : radical = infinitif (sauf verbes en -re).
  if (tense === 'futur' || tense === 'conditionnel') {
    const infinitive = verb.infinitive;
    const stem = infinitive.endsWith('re') ? infinitive.slice(0, -1) : infinitive;
    return stem + ER_ENDINGS[tense][person];
  }

  // 3) Premier groupe (-er) : radicaux réguliers.
  if (verb.group === 1) {
    let stem = verb.stem;
    const needsCedilla = verb.infinitive.endsWith('cer');
    const needsE = verb.infinitive.endsWith('ger');
    if (person === 3 && (tense === 'present' || tense === 'imparfait' || tense === 'subjonctif')) {
      if (needsCedilla) stem = `${verb.infinitive.slice(0, -3)}ç`;
      if (needsE) stem = `${verb.infinitive.slice(0, -3)}ge`;
    }
    return stem + ER_ENDINGS[tense][person];
  }

  // 4) Deuxième groupe (-ir en -issant).
  if (verb.group === 2) {
    return verb.stem + IR_ENDINGS[tense][person];
  }

  // 5) Troisième groupe sans table : forme non garantie.
  return null;
}
