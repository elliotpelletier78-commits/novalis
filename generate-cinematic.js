'use strict';

// ── Helpers ────────────────────────────────────────────────────────────────
function slugify(str = '') {
  return str.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}
function esc(s = '') {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function fillChap(text, name, city) {
  return text
    .replace(/\{\{city\}\}/g, city || 'notre région')
    .replace(/\{\{name\}\}/g, name || 'notre équipe');
}
// Nom du hero — coupe au tiret (« Chez Boulay — Bistro Boréal » → « Chez Boulay »),
// puis empile jusqu'à 3 mots ; les noms courts restent entiers.
function heroNameLines(name) {
  const main = name.split(/\s+[—–|]\s+/)[0].trim();
  const words = main.split(/\s+/).filter(w => !/^[—–|·-]+$/.test(w));
  return words.slice(0, 3);
}
// Tagline du hero — tronque sur une limite de mot autour de 48 caractères,
// jamais en plein milieu d'une expression.
function heroTagline(tagline) {
  if (tagline.length <= 52) return tagline;
  const cut = tagline.slice(0, 49);
  return cut.slice(0, cut.lastIndexOf(' ')) + '…';
}

// ── Industry configurations ────────────────────────────────────────────────
const CONFIGS = {
  restaurant: {
    label: 'Restaurant / Café / Bar',
    animation: 'swing',
    palette: { bg:'#0B0906', dark:'#131009', primary:'#C4953A', light:'#E8B86D', text:'#F0E6CF', muted:'#7A7060', panel:'#1a1512' },
    google: 'Playfair+Display+SC:wght@400;700&family=Playfair+Display:ital,wght@0,400;1,400&family=Karla:wght@300;400;500;600',
    fontH: "'Playfair Display SC', serif",
    fontB: "'Karla', sans-serif",
    fontHW: '400',
    taglineDefault: 'Une expérience culinaire mémorable.',
    insideText: 'Bonsoir,\nbienvenue',
    svcText: "Une cuisine\nd'auteur.",
    ctaLabel: 'Réserver ma table',
    defaultServices: [
      { title: 'Menu dégustation', desc: 'Un voyage en plusieurs services, orchestré par notre chef selon les saisons et les arrivages.' },
      { title: "Table d'hôte", desc: 'Entrée, plat, dessert — fraîcheur locale, inspiration quotidienne.' },
      { title: 'Brunch & midi', desc: 'Formules généreuses pour les matins de week-end et les pauses du midi.' },
      { title: 'Privatisation', desc: 'Anniversaire, lancement, fête de bureau — votre événement, notre salle.' },
    ],
    defaultTestimonials: [
      { text: 'Un repas dont on se souvient longtemps. Produits frais, service attentionné, ambiance chaleureuse. On y retourne sans hésiter.', author: '— Marie-Ève T.' },
      { text: 'Enfin un endroit où les portions sont généreuses et les saveurs au rendez-vous. Notre table préférée depuis deux ans.', author: '— François B.' },
      { text: 'Parfait pour l\'anniversaire de ma femme. L\'équipe a été aux petits soins toute la soirée. Merci !', author: '— Jean-Pierre L.' },
    ],
    defaultStats: [
      { num: '15+', label: "ans d'expérience" },
      { num: '2 400+', label: 'couverts par an' },
      { num: '4.8★', label: 'note Google' },
      { num: '100%', label: 'produits locaux' },
    ],
    defaultHours: { weekdays: '11 h 00 — 22 h 00', saturday: '10 h 00 — 23 h 00', sunday: '10 h 00 — 15 h 00' },
    marquee: ['Cuisine du marché', 'Produits locaux', 'Carte des vins', "Table d'hôte", 'Brunch week-end'],
    galleryCaptions: ['La façade', "L'ambiance", 'En cuisine', "L'assiette"],
    chapters: [
      { img: 'interior', title: "On pousse la porte,<br>la journée reste dehors.", body: "Une lumière chaude, des nappes blanches — {{city}} peut attendre. Votre soirée commence ici." },
      { img: 'service', title: "Votre table<br>vous attendait.", body: "Le couvert est mis, le verre est droit, la chandelle est allumée. Il ne manquait que vous." },
    ],
    philosophy: {
      title: 'Une adresse qui<br>ralentit le temps.',
      intro: "Plus qu'une table : une parenthèse. Une lumière basse, des assiettes précises, un service discret — et une atmosphère qui reste.",
      cards: [
        { title: 'Cuisine de saison', body: "La carte suit le marché, pas l'inverse. Fraîcheur d'abord." },
        { title: 'Service attentif', body: 'Présent quand il faut, invisible le reste du temps.' },
        { title: 'Ambiance feutrée', body: 'La bonne lumière, le bon volume, la bonne distance entre les tables.' },
        { title: "Produits d'ici", body: 'Producteurs locaux, arrivages courts, traçabilité réelle.' },
      ],
    },
    lightTheme: { bg: '#F4EDE0', text: '#1D1812', muted: '#6B6052' },
    unsplash: {
      exterior: 'photo-1414235077428-338989a2e8c0?q=95&w=2800&auto=format&fit=crop&crop=focalpoint',
      interior: 'photo-1517248135467-4c7edcad34c4?q=95&w=2800&auto=format&fit=crop',
      service:  'photo-1544025162-811114cd354c?q=95&w=2800&auto=format&fit=crop',
      about:    'photo-1555396273-367ea4eb4db5?q=95&w=2200&auto=format&fit=crop',
    },
  },
  garage: {
    label: 'Garage / Mécanique automobile',
    animation: 'garage',
    palette: { bg:'#060606', dark:'#0f0f0f', primary:'#CC2B2B', light:'#E04545', text:'#F2F2F2', muted:'#909090', panel:'#161616' },
    google: 'Barlow+Condensed:wght@400;600;700;800;900&family=Inter:wght@300;400;500',
    fontH: "'Barlow Condensed', sans-serif",
    fontB: "'Inter', sans-serif",
    fontHW: '900',
    taglineDefault: "L'excellence mécanique à votre service.",
    insideText: 'Bienvenue\ndans notre atelier',
    svcText: 'La précision\nfait tout.',
    ctaLabel: 'Réserver ma place',
    defaultServices: [
      { title: 'Mécanique générale', desc: 'Vidanges, filtres, courroies, suspension — tout pour rouler en toute confiance au quotidien.' },
      { title: 'Performance & Tuning', desc: 'Reprogrammation ECU, échappement sport, suspension performance.' },
      { title: 'Freins & Pneumatiques', desc: "Plaquettes, disques, pneus 4 saisons ou été — on ne transige pas sur la sécurité." },
      { title: 'Diagnostic électronique', desc: "Lecture OBD avancée, capteurs, systèmes électriques — on trouve le problème avant qu'il vous trouve." },
    ],
    defaultTestimonials: [
      { text: "Mon pick-up avait un problème que trois garages n'avaient pas trouvé. Ici, réglé en deux heures. Je n'irai jamais ailleurs.", author: '— Marc-Antoine P.' },
      { text: "Honnêtes, rapides, et ils t'expliquent vraiment ce qui se passe. C'est rare dans ce métier-là.", author: '— Julie L.' },
      { text: 'Setup de suspension et reprogrammation ECU pour ma WRX — résultat bluffant. Ces gars connaissent la performance.', author: '— Kevin T.' },
    ],
    defaultStats: [
      { num: '25+', label: "ans d'expérience" },
      { num: '3 000+', label: 'clients fidèles' },
      { num: '12', label: 'techniciens certifiés' },
      { num: '4.8★', label: 'note Google' },
    ],
    defaultHours: { weekdays: '7 h 30 — 17 h 30', saturday: '8 h 00 — 14 h 00', sunday: 'Fermé' },
    marquee: ['Mécanique générale', 'Performance', 'Freins', 'Suspension', 'Diagnostic', 'Pneus'],
    galleryCaptions: ["L'atelier", 'Les baies', 'La précision', "L'équipe"],
    chapters: [
      { img: 'interior', title: "La porte se lève,<br>le diagnostic commence.", body: "Un atelier propre, des outils à leur place. {{city}} peut compter sur une équipe qui fait les choses comme il faut." },
      { img: 'service', title: "Chaque boulon<br>a son couple.", body: "La précision n'est pas un luxe — c'est la base. On serre, on mesure, on vérifie. Deux fois." },
    ],
    philosophy: {
      title: 'Un garage qui dit<br>les vraies affaires.',
      intro: "Pas de jargon, pas de surprise sur la facture. On explique, on montre, on répare — et on garantit.",
      cards: [
        { title: "Prix annoncés d'avance", body: 'La soumission avant les travaux. Toujours.' },
        { title: 'Pièces de qualité', body: 'Des pièces qui durent, pas celles qui reviennent.' },
        { title: 'Techniciens certifiés', body: 'Formation continue, équipement à jour.' },
        { title: 'Garantie écrite', body: "Sur pièces et main-d'œuvre. Noir sur blanc." },
      ],
    },
    lightTheme: { bg: '#F0EFED', text: '#141414', muted: '#5E5C58' },
    unsplash: {
      exterior: 'photo-1558618666-fcd25c85cd64?q=95&w=2800&auto=format&fit=crop&crop=focalpoint',
      interior: 'photo-1607860108855-64acf2078ed9?q=95&w=2800&auto=format&fit=crop',
      service:  'photo-1619642751034-765dfdf7c58e?q=95&w=2800&auto=format&fit=crop',
      about:    'photo-1504222490345-c075b7b68888?q=95&w=2200&auto=format&fit=crop',
    },
  },
  salon: {
    label: 'Salon / Spa / Esthétique',
    animation: 'curtain',
    palette: { bg:'#0A0808', dark:'#120F0F', primary:'#C9956A', light:'#E5B898', text:'#F5EDE4', muted:'#8A7A72', panel:'#1a1412' },
    google: 'Cormorant+Garamond:ital,wght@0,400;0,600;1,400&family=Jost:wght@300;400;500;600',
    fontH: "'Cormorant Garamond', serif",
    fontB: "'Jost', sans-serif",
    fontHW: '600',
    taglineDefault: 'Parce que vous méritez le meilleur.',
    insideText: 'Votre moment,\nvotre beauté',
    svcText: "L'art de\nvous sublimer.",
    ctaLabel: 'Prendre rendez-vous',
    defaultServices: [
      { title: 'Coupe & Coiffure', desc: 'Coupes femmes, hommes et enfants — tendance ou classique, toujours impeccable.' },
      { title: 'Coloration', desc: 'Balayage, ombré, couleur pleine — avec des produits respectueux de vos cheveux.' },
      { title: 'Soins capillaires', desc: 'Kératine, soins réparateurs, masques — retrouvez des cheveux sains et brillants.' },
      { title: 'Esthétique & Spa', desc: 'Manucure, pédicure, épilation, soins du visage — votre pause bien-être méritée.' },
    ],
    defaultTestimonials: [
      { text: "Enfin un salon où on prend vraiment le temps. Ma coloriste a tout compris dès la première visite. Je ne vais nulle part ailleurs.", author: '— Stéphanie R.' },
      { text: 'Service impeccable, atmosphère relaxante, résultat magnifique. Je recommande sans hésiter à toutes mes amies.', author: '— Isabelle M.' },
      { text: 'Le soin du visage était extraordinaire. Je suis ressortie rayonnante et détendue. Merci pour ce moment de pur bonheur.', author: '— Caroline D.' },
    ],
    defaultStats: [
      { num: '10+', label: "ans d'expertise" },
      { num: '1 800+', label: 'clients réguliers' },
      { num: '6', label: 'professionnelles certifiées' },
      { num: '4.9★', label: 'note Google' },
    ],
    defaultHours: { weekdays: '9 h 00 — 19 h 00', saturday: '9 h 00 — 17 h 00', sunday: 'Fermé' },
    marquee: ['Coupe', 'Coloration', 'Balayage', 'Soins capillaires', 'Esthétique', 'Spa'],
    galleryCaptions: ['Le salon', "L'espace détente", 'Le savoir-faire', 'Le résultat'],
    chapters: [
      { img: 'interior', title: "La porte se referme<br>sur le bruit du monde.", body: "Une lumière douce, une musique discrète — {{city}} attend dehors. Votre heure commence ici." },
      { img: 'service', title: "Des mains qui savent<br>ce qu'elles font.", body: "On écoute d'abord, on conseille ensuite. Le résultat se voit — et se sent." },
    ],
    philosophy: {
      title: 'Un salon pensé<br>pour vous.',
      intro: "Chaque visite commence par une conversation et finit devant le miroir, avec un sourire. Entre les deux : du savoir-faire.",
      cards: [
        { title: "Écoute d'abord", body: 'Votre style, votre rythme, vos envies. On part de vous.' },
        { title: 'Produits haut de gamme', body: 'Des marques choisies pour leurs résultats, pas leur pub.' },
        { title: 'Ambiance détente', body: 'Un café, un fauteuil confortable, du temps pour vous.' },
        { title: 'Résultats durables', body: "Des conseils pour que ça dure jusqu'à la prochaine visite." },
      ],
    },
    lightTheme: { bg: '#F6EEE7', text: '#1C1512', muted: '#6E6058' },
    unsplash: {
      exterior: 'photo-1560472354-b33ff0c44a43?q=95&w=2800&auto=format&fit=crop&crop=focalpoint',
      interior: 'photo-1560869713-da86a9ec0744?q=95&w=2800&auto=format&fit=crop',
      service:  'photo-1522337360788-8b13dee7a37e?q=95&w=2800&auto=format&fit=crop',
      about:    'photo-1580618432051-7e04f8a82b5a?q=95&w=2200&auto=format&fit=crop',
    },
  },
  clinique: {
    label: 'Clinique / Médecine / Santé',
    animation: 'glass',
    palette: { bg:'#040C14', dark:'#071420', primary:'#0E8EA8', light:'#16B8D6', text:'#EFF5F8', muted:'#7090A0', panel:'#0A1A26' },
    google: 'DM+Sans:ital,wght@0,300;0,400;0,500;1,400&family=DM+Serif+Display:ital@0;1',
    fontH: "'DM Serif Display', serif",
    fontB: "'DM Sans', sans-serif",
    fontHW: '400',
    taglineDefault: 'Votre santé, entre des mains de confiance.',
    insideText: 'Votre santé,\nnotre priorité',
    svcText: 'Des soins\nde précision.',
    ctaLabel: 'Prendre rendez-vous',
    defaultServices: [
      { title: 'Médecine générale', desc: 'Consultations, bilans de santé, suivis — toujours disponibles pour vous accompagner.' },
      { title: 'Physiothérapie', desc: 'Réhabilitation, douleurs chroniques, sports — on vous remet sur pied rapidement.' },
      { title: 'Soins spécialisés', desc: 'Dermatologie, cardiologie, pédiatrie — nos spécialistes à votre service.' },
      { title: 'Prévention & Bien-être', desc: 'Bilans annuels, vaccins, nutrition — la santé avant la maladie.' },
    ],
    defaultTestimonials: [
      { text: "Clinique sérieuse et à l'écoute. Le médecin a pris le temps de bien m'expliquer. Je me suis senti vraiment accompagné.", author: '— Robert G.' },
      { text: 'La physiothérapie ici est remarquable. En 6 semaines j\'ai récupéré de ma blessure de sport. Professionnels et chaleureux.', author: '— Andréa K.' },
      { text: 'Enfin une clinique où on peut avoir un rendez-vous rapidement. Personnel attentionné, locaux propres et modernes.', author: '— Sylvie B.' },
    ],
    defaultStats: [
      { num: '20+', label: 'ans de pratique' },
      { num: '8', label: 'médecins spécialistes' },
      { num: '5 000+', label: 'patients suivis' },
      { num: '4.7★', label: 'note Google' },
    ],
    defaultHours: { weekdays: '8 h 00 — 18 h 00', saturday: '9 h 00 — 13 h 00', sunday: 'Fermé' },
    marquee: ['Médecine générale', 'Physiothérapie', 'Prévention', 'Soins spécialisés', 'Bilans de santé'],
    galleryCaptions: ["L'accueil", 'Les salles', 'Les équipements', "L'équipe soignante"],
    chapters: [
      { img: 'interior', title: "Ici, on vous<br>écoute d'abord.", body: "Pas de file anonyme. À {{city}}, une équipe qui connaît votre nom et votre histoire." },
      { img: 'service', title: "La précision<br>au service du soin.", body: "Équipements modernes, protocoles rigoureux, gestes sûrs. Votre santé mérite cette exigence." },
    ],
    philosophy: {
      title: 'Une clinique à<br>échelle humaine.',
      intro: "Des soins de haut niveau, sans la froideur. On prend le temps qu'il faut, avec les bonnes personnes et les bons outils.",
      cards: [
        { title: 'Rendez-vous rapides', body: 'Des plages réservées chaque jour pour les urgences.' },
        { title: 'Équipe stable', body: 'Les mêmes visages, visite après visite.' },
        { title: 'Approche globale', body: 'On traite la cause, pas seulement le symptôme.' },
        { title: 'Suivi personnalisé', body: 'Un plan clair, des étapes mesurables, des résultats.' },
      ],
    },
    lightTheme: { bg: '#EEF4F6', text: '#0E1A20', muted: '#54707C' },
    unsplash: {
      exterior: 'photo-1519494026892-80bbd2d6fd0d?q=95&w=2800&auto=format&fit=crop&crop=focalpoint',
      interior: 'photo-1587351021759-3e566b3db4f0?q=95&w=2800&auto=format&fit=crop',
      service:  'photo-1582750433449-648ed127bb54?q=95&w=2800&auto=format&fit=crop',
      about:    'photo-1559839734-2b71ea197ec2?q=95&w=2200&auto=format&fit=crop',
    },
  },
  construction: {
    label: 'Construction / Rénovation',
    animation: 'gate',
    palette: { bg:'#050505', dark:'#0D0D0D', primary:'#E8891A', light:'#F5A535', text:'#F0EEEC', muted:'#8A8580', panel:'#141414' },
    google: 'Bebas+Neue&family=Barlow:wght@300;400;500;600',
    fontH: "'Bebas Neue', cursive",
    fontB: "'Barlow', sans-serif",
    fontHW: '400',
    taglineDefault: 'Du rêve au concret — on bâtit avec vous.',
    insideText: 'Votre projet,\nentre bonnes mains',
    svcText: 'On bâtit\navec fierté.',
    ctaLabel: 'Obtenir une soumission',
    defaultServices: [
      { title: 'Rénovation résidentielle', desc: 'Cuisine, salle de bain, sous-sol — transformez votre maison selon vos envies.' },
      { title: 'Construction neuve', desc: "Chalets, maisons, garages — du plan jusqu'aux clés en main." },
      { title: 'Toiture & Revêtement', desc: "Bardeaux, métal, bardage — protection durable et esthétique qui dure." },
      { title: 'Excavation & Fondations', desc: 'Préparation de terrain, fondations, drainage — les bases solides de tout projet.' },
    ],
    defaultTestimonials: [
      { text: 'Rénovation complète de notre cuisine en 3 semaines. Travail impeccable, équipe propre et respectueuse. Exactement ce qu\'on avait demandé.', author: '— Lucie & Denis M.' },
      { text: 'Notre chalet construit dans les délais et le budget prévus. Une rareté ! On recommande chaudement à tous nos amis.', author: '— Martin G.' },
      { text: 'Toiture refaite en deux jours malgré novembre. Rapides, professionnels, prix honnête. Aucune mauvaise surprise.', author: '— Nathalie V.' },
    ],
    defaultStats: [
      { num: '18+', label: "ans d'expérience" },
      { num: '650+', label: 'projets livrés' },
      { num: '15', label: 'employés qualifiés' },
      { num: '100%', label: 'travail garanti' },
    ],
    defaultHours: { weekdays: '7 h 00 — 17 h 00', saturday: '8 h 00 — 12 h 00', sunday: 'Fermé' },
    marquee: ['Rénovation', 'Construction neuve', 'Toiture', 'Excavation', 'Clé en main', 'Garanti'],
    galleryCaptions: ['Le chantier', 'La structure', 'Les finitions', 'Le résultat'],
    chapters: [
      { img: 'interior', title: "Tout commence par<br>une poignée de main.", body: "On visite, on écoute, on mesure. À {{city}}, la soumission arrive vite — et elle tient." },
      { img: 'service', title: "Un chantier propre est<br>un chantier sérieux.", body: "Échéancier respecté, site rangé chaque soir. Vos voisins n'auront rien à redire." },
    ],
    philosophy: {
      title: 'Une équipe qui<br>tient parole.',
      intro: "Dans la construction, la confiance se gagne un chantier à la fois. Voici comment on la mérite depuis le premier jour.",
      cards: [
        { title: 'Soumission claire', body: 'Détaillée, chiffrée, sans astérisque caché.' },
        { title: 'Échéancier respecté', body: 'On dit une date, on livre à cette date.' },
        { title: 'Chantier propre', body: 'Rangé chaque soir, sécuritaire chaque jour.' },
        { title: 'Travail garanti', body: 'Licence RBQ, assurances, garantie écrite.' },
      ],
    },
    lightTheme: { bg: '#F2EFE9', text: '#161310', muted: '#67615A' },
    unsplash: {
      exterior: 'photo-1504307651254-35680f356dfd?q=95&w=2800&auto=format&fit=crop&crop=focalpoint',
      interior: 'photo-1541888946425-d81bb19240f5?q=95&w=2800&auto=format&fit=crop',
      service:  'photo-1503387762-592deb58ef4e?q=95&w=2800&auto=format&fit=crop',
      about:    'photo-1558618047-3c8c76ca7d13?q=95&w=2200&auto=format&fit=crop',
    },
  },
};

const INDUSTRY_LABELS = Object.fromEntries(Object.entries(CONFIGS).map(([k,v]) => [k, v.label]));

// ── Industry-specific about text ───────────────────────────────────────────
const ABOUT_TEXTS = {
  restaurant: (name, city, founded) =>
    `${esc(name)} est une table qui compte ${city ? `à ${esc(city)}` : 'ici'}. ${founded ? `Depuis ${founded}, la cuisine` : 'La cuisine'} suit les saisons, les producteurs locaux et les idées fraîches de l'équipe — mais jamais au détriment du simple plaisir de bien manger. Une salle chaleureuse, un service attentif, des assiettes qui racontent quelque chose.`,
  garage: (name, city, founded) =>
    `${esc(name)} est l'atelier de confiance ${city ? `de ${esc(city)}` : 'du quartier'}. ${founded ? `Depuis ${founded}, des` : 'Des'} techniciens certifiés y travaillent avec la même règle : expliquer avant de réparer, et garantir après. Résultat — des clients qui reviennent, et qui envoient leurs proches.`,
  salon: (name, city, founded) =>
    `${esc(name)} est un espace pensé pour prendre le temps. ${founded ? `Depuis ${founded}, l'équipe` : "L'équipe"} reçoit chaque client${city ? ` de ${esc(city)}` : ''} avec la même attention : écoute, conseils honnêtes, produits haut de gamme. Le résultat se voit — et se ressent bien après la visite.`,
  clinique: (name, city, founded) =>
    `${esc(name)} a été fondée pour offrir ${city ? `aux résidents de ${esc(city)}` : 'à nos patients'} un accès rapide à des soins de qualité, sans sacrifier l'écoute ni la chaleur humaine. ${founded ? `Depuis ${founded}, l'équipe` : "L'équipe"} s'agrandit — mais l'essentiel reste : on prend le temps qu'il faut, pour chaque personne.`,
  construction: (name, city, founded) =>
    `${esc(name)} construit et rénove ${city ? `dans la région de ${esc(city)}` : 'dans votre région'}${founded ? ` depuis ${founded}` : ''}. Chaque projet commence par une visite sur le terrain et se termine par une remise des clés sans surprise. Ce qui se passe entre les deux : de l'artisanat sérieux, fait par des gens qui habitent le même coin que vous.`,
};

// ── Animation CSS per type ─────────────────────────────────────────────────
function animationCSS(anim) {
  if (anim === 'swing') return `
        #s-int { clip-path: inset(18% 38% 0% 38%); opacity: 0; will-change: clip-path, opacity; }
        .door-frame {
            position: absolute; z-index: 3;
            top: 18%; left: 38%; right: 38%; bottom: 0;
            border: 1.5px solid rgba(255,255,255,0.35);
            border-bottom: none; border-radius: 3px 3px 0 0;
            opacity: 0; pointer-events: none; will-change: transform, opacity;
        }
        .door-frame::after {
            content: ''; position: absolute;
            right: 14%; top: 52%; width: 4px; height: 14px;
            border-radius: 2px; background: rgba(255,255,255,0.5);
        }`;
  if (anim === 'garage') return `
        #s-int { opacity: 0; z-index: 2; }
        #garageDoor {
            position: absolute; inset: 0; z-index: 8; opacity: 0;
            pointer-events: none; will-change: transform, opacity;
            background:
                repeating-linear-gradient(90deg, transparent 0%, transparent calc(25% - 1px), rgba(0,0,0,0.55) calc(25% - 1px), rgba(0,0,0,0.55) 25%),
                repeating-linear-gradient(180deg, #1e1e1e 0px, #1e1e1e 40px, #161616 40px, #161616 43px, #0e0e0e 43px, #0e0e0e 46px);
            box-shadow: inset 0 -16px 0 #080808;
        }
        #garageDoor::before {
            content: ''; position: absolute; inset: 0; pointer-events: none;
            background: linear-gradient(110deg, transparent 0%, rgba(255,255,255,0.02) 20%, rgba(255,255,255,0.06) 42%, rgba(255,255,255,0.02) 64%, transparent 100%);
        }`;
  if (anim === 'gate') return `
        #s-int { opacity: 0; z-index: 2; }
        #garageDoor {
            position: absolute; inset: 0; z-index: 8; opacity: 0;
            pointer-events: none; will-change: transform, opacity;
            background:
                repeating-linear-gradient(90deg, transparent 0%, transparent calc(25% - 1px), rgba(0,0,0,0.5) calc(25% - 1px), rgba(0,0,0,0.5) 25%),
                repeating-linear-gradient(180deg, #1c1a17 0px, #1c1a17 40px, #151310 40px, #151310 43px, #0e0c0a 43px, #0e0c0a 46px);
            box-shadow: inset 0 -16px 0 #090706;
        }
        #garageDoor::before {
            content: ''; position: absolute; inset: 0; pointer-events: none;
            background: linear-gradient(110deg, transparent 0%, rgba(255,255,255,0.02) 20%, rgba(255,255,255,0.05) 42%, rgba(255,255,255,0.02) 64%, transparent 100%);
        }`;
  if (anim === 'curtain') return `
        #s-int { opacity: 0; z-index: 2; }
        #curtain { position: absolute; inset: 0; z-index: 8; opacity: 0; pointer-events: none; display: flex; }
        .curtain-left, .curtain-right {
            flex: 1; will-change: transform;
            background: repeating-linear-gradient(90deg, #1a1016 0px, #1a1016 58px, #140c12 58px, #140c12 60px);
        }
        .curtain-left { border-right: 1px solid rgba(255,255,255,0.1); }
        .curtain-right { border-left: 1px solid rgba(255,255,255,0.1); }`;
  if (anim === 'glass') return `
        #s-int { opacity: 0; z-index: 2; }
        #glassDoor { position: absolute; inset: 0; z-index: 8; opacity: 0; pointer-events: none; display: flex; }
        .glass-left, .glass-right {
            flex: 1; will-change: transform;
            background: linear-gradient(135deg, rgba(180,220,240,0.1), rgba(200,230,250,0.05));
            backdrop-filter: blur(8px) brightness(0.75);
            border: 1px solid rgba(200,230,255,0.1);
        }
        .glass-left { border-right: 2px solid rgba(200,230,255,0.2); }
        .glass-right { border-left: 2px solid rgba(200,230,255,0.2); }`;
  return '';
}

// ── Animation HTML element per type ───────────────────────────────────────
function animationElement(anim) {
  if (anim === 'swing') return `<div class="door-frame" id="doorFrame"></div>`;
  if (anim === 'garage' || anim === 'gate') return `<div id="garageDoor"></div>`;
  if (anim === 'curtain') return `<div id="curtain"><div class="curtain-left"></div><div class="curtain-right"></div></div>`;
  if (anim === 'glass') return `<div id="glassDoor"><div class="glass-left"></div><div class="glass-right"></div></div>`;
  return '';
}

// ── GSAP script per animation type ────────────────────────────────────────
function gsapScript(anim) {
  if (anim === 'swing') return `
        tl
            .to('#s-ext .scene-bg', { scale: 1.55, ease: 'none', duration: 4 }, 0)
            .fromTo('#jt-addr',  { opacity: 1 }, { opacity: 0, duration: 0.4 }, 0.6)
            .fromTo('#jt-title', { opacity: 1 }, { opacity: 0, duration: 0.6 }, 0.7)
            .to('#s-int',      { opacity: 1, duration: 0.5 }, 1.2)
            .to('#doorFrame',  { opacity: 1, duration: 0.5 }, 1.2)
            .fromTo('#s-int', { clipPath: 'inset(18% 38% 0% 38%)' }, { clipPath: 'inset(0% 0% 0% 0%)', ease: 'power2.inOut', duration: 2 }, 1.8)
            .fromTo('#s-int .scene-bg', { scale: 1.35 }, { scale: 1.0, ease: 'power1.out', duration: 2 }, 1.8)
            .to('#doorFrame', { opacity: 0, scaleX: 4, scaleY: 1.5, transformOrigin: 'center bottom', ease: 'power1.in', duration: 0.8 }, 1.8)
            .to('#s-ext', { opacity: 0, duration: 0.7 }, 2.5)
            .to('#s-int .scene-bg', { scale: 1.18, ease: 'none', duration: 2 }, 3.5)
            .to('#jt-inside', { opacity: 1, duration: 0.6 }, 3.6)
            .to('#jt-inside', { opacity: 0, duration: 0.5 }, 4.6)
            .to('#s-int',  { opacity: 0, duration: 0.7 }, 5.2)
            .to('#s-svc',  { opacity: 1, duration: 0.7 }, 5.2)
            .fromTo('#s-svc .scene-bg', { scale: 1.15 }, { scale: 1.0, duration: 1.5 }, 5.2)
            .to('#jt-svc', { opacity: 1, duration: 0.6 }, 5.5)
            .to('#jt-svc', { opacity: 0, duration: 0.5 }, 6.4)
            .to('#s-svc',  { opacity: 0, duration: 0.7 }, 6.8)
            .to('#s-site', { opacity: 1, duration: 0.9 }, 6.8)
            .to('.splash-logo-img', { y: 0, opacity: 1, duration: 0.6 }, 6.85)
            .to('.splash-logo',    { y: 0, opacity: 1, duration: 0.7 }, 7.0)
            .to('.splash-tagline', { y: 0, opacity: 1, duration: 0.6 }, 7.2)
            .to('.splash-scroll',  { opacity: 1, duration: 0.6 }, 7.5);`;

  if (anim === 'garage' || anim === 'gate') return `
        tl
            .to('#s-ext .scene-bg', { scale: 1.7, ease: 'none', duration: 4 }, 0)
            .fromTo('#jt-addr',  { opacity: 1 }, { opacity: 0, duration: 0.4 }, 0.6)
            .fromTo('#jt-title', { opacity: 1 }, { opacity: 0, duration: 0.6 }, 0.7)
            .to('#s-int',      { opacity: 1, duration: 0.01 }, 1.45)
            .to('#garageDoor', { opacity: 1, duration: 0.18 }, 1.5)
            .fromTo('#s-int .scene-bg', { scale: 1.28 }, { scale: 1.0, ease: 'power1.out', duration: 2 }, 1.8)
            .to('#garageDoor', { y: '-115%', ease: 'power2.inOut', duration: 1.7 }, 1.8)
            .to('#s-ext', { opacity: 0, duration: 0.5 }, 2.8)
            .to('#s-int .scene-bg', { scale: 1.16, ease: 'none', duration: 1.6 }, 3.4)
            .to('#jt-inside', { opacity: 1, duration: 0.5 }, 3.5)
            .to('#jt-inside', { opacity: 0, duration: 0.4 }, 4.4)
            .to('#s-int',  { opacity: 0, duration: 0.6 }, 5.0)
            .to('#s-svc',  { opacity: 1, duration: 0.6 }, 5.0)
            .fromTo('#s-svc .scene-bg', { scale: 1.22 }, { scale: 1.0, duration: 1.4 }, 5.0)
            .to('#jt-svc', { opacity: 1, duration: 0.5 }, 5.3)
            .to('#jt-svc', { opacity: 0, duration: 0.4 }, 6.2)
            .to('#s-svc',  { opacity: 0, duration: 0.6 }, 6.5)
            .to('#s-site', { opacity: 1, duration: 0.8 }, 6.5)
            .to('.splash-badge',   { y: 0, opacity: 1, duration: 0.5 }, 6.7)
            .to('.splash-logo-img', { y: 0, opacity: 1, duration: 0.5 }, 6.75)
            .to('.splash-logo',    { y: 0, opacity: 1, duration: 0.6 }, 6.9)
            .to('.splash-tagline', { y: 0, opacity: 1, duration: 0.5 }, 7.1)
            .to('.splash-scroll',  { opacity: 1, duration: 0.5 }, 7.4);`;

  if (anim === 'curtain') return `
        tl
            .to('#s-ext .scene-bg', { scale: 1.55, ease: 'none', duration: 4 }, 0)
            .fromTo('#jt-addr',  { opacity: 1 }, { opacity: 0, duration: 0.4 }, 0.6)
            .fromTo('#jt-title', { opacity: 1 }, { opacity: 0, duration: 0.6 }, 0.7)
            .to('#s-int',   { opacity: 1, duration: 0.01 }, 1.45)
            .to('#curtain', { opacity: 1, duration: 0.25 }, 1.5)
            .to('.curtain-left',  { x: '-100%', ease: 'power2.inOut', duration: 1.8 }, 1.8)
            .to('.curtain-right', { x: '100%',  ease: 'power2.inOut', duration: 1.8 }, 1.8)
            .fromTo('#s-int .scene-bg', { scale: 1.2 }, { scale: 1.0, ease: 'power1.out', duration: 2 }, 1.8)
            .to('#s-ext', { opacity: 0, duration: 0.6 }, 2.8)
            .to('#s-int .scene-bg', { scale: 1.14, ease: 'none', duration: 1.6 }, 3.5)
            .to('#jt-inside', { opacity: 1, duration: 0.5 }, 3.6)
            .to('#jt-inside', { opacity: 0, duration: 0.4 }, 4.5)
            .to('#s-int',  { opacity: 0, duration: 0.6 }, 5.2)
            .to('#s-svc',  { opacity: 1, duration: 0.6 }, 5.2)
            .fromTo('#s-svc .scene-bg', { scale: 1.18 }, { scale: 1.0, duration: 1.4 }, 5.2)
            .to('#jt-svc', { opacity: 1, duration: 0.5 }, 5.5)
            .to('#jt-svc', { opacity: 0, duration: 0.4 }, 6.3)
            .to('#s-svc',  { opacity: 0, duration: 0.6 }, 6.7)
            .to('#s-site', { opacity: 1, duration: 0.8 }, 6.7)
            .to('.splash-logo-img', { y: 0, opacity: 1, duration: 0.6 }, 6.75)
            .to('.splash-logo',    { y: 0, opacity: 1, duration: 0.7 }, 6.9)
            .to('.splash-tagline', { y: 0, opacity: 1, duration: 0.6 }, 7.1)
            .to('.splash-scroll',  { opacity: 1, duration: 0.6 }, 7.4);`;

  if (anim === 'glass') return `
        tl
            .to('#s-ext .scene-bg', { scale: 1.55, ease: 'none', duration: 4 }, 0)
            .fromTo('#jt-addr',  { opacity: 1 }, { opacity: 0, duration: 0.4 }, 0.6)
            .fromTo('#jt-title', { opacity: 1 }, { opacity: 0, duration: 0.6 }, 0.7)
            .to('#s-int',     { opacity: 1, duration: 0.01 }, 1.45)
            .to('#glassDoor', { opacity: 1, duration: 0.35 }, 1.5)
            .to('.glass-left',  { x: '-100%', ease: 'power1.inOut', duration: 1.4 }, 1.9)
            .to('.glass-right', { x: '100%',  ease: 'power1.inOut', duration: 1.4 }, 1.9)
            .fromTo('#s-int .scene-bg', { scale: 1.18 }, { scale: 1.0, ease: 'power1.out', duration: 2 }, 1.9)
            .to('#s-ext', { opacity: 0, duration: 0.6 }, 2.8)
            .to('#s-int .scene-bg', { scale: 1.12, ease: 'none', duration: 1.6 }, 3.5)
            .to('#jt-inside', { opacity: 1, duration: 0.5 }, 3.6)
            .to('#jt-inside', { opacity: 0, duration: 0.4 }, 4.5)
            .to('#s-int',  { opacity: 0, duration: 0.6 }, 5.2)
            .to('#s-svc',  { opacity: 1, duration: 0.6 }, 5.2)
            .fromTo('#s-svc .scene-bg', { scale: 1.18 }, { scale: 1.0, duration: 1.4 }, 5.2)
            .to('#jt-svc', { opacity: 1, duration: 0.5 }, 5.5)
            .to('#jt-svc', { opacity: 0, duration: 0.4 }, 6.3)
            .to('#s-svc',  { opacity: 0, duration: 0.6 }, 6.7)
            .to('#s-site', { opacity: 1, duration: 0.8 }, 6.7)
            .to('.splash-logo-img', { y: 0, opacity: 1, duration: 0.6 }, 6.75)
            .to('.splash-logo',    { y: 0, opacity: 1, duration: 0.7 }, 6.9)
            .to('.splash-tagline', { y: 0, opacity: 1, duration: 0.6 }, 7.1)
            .to('.splash-scroll',  { opacity: 1, duration: 0.6 }, 7.4);`;
  return '';
}

// ── Full HTML generator ────────────────────────────────────────────────────
function generateCinematic(rawData) {
  const industry = rawData.industry || 'restaurant';
  const cfg = CONFIGS[industry] || CONFIGS.restaurant;

  const name      = rawData.name || 'Mon Entreprise';
  const slug      = rawData.slug || slugify(name);
  const tagline   = rawData.tagline || cfg.taglineDefault;
  const phone     = rawData.phone || '';
  const phoneClean = phone.replace(/\D/g, '');
  const address   = rawData.address || '';
  const city      = rawData.city || address.split(',').slice(-2)[0]?.trim() || '';
  const founded   = rawData.founded || '';
  const color     = rawData.color || cfg.palette.primary;
  const p         = { ...cfg.palette, primary: color, light: color };
  const services  = rawData.services && rawData.services.length ? rawData.services : cfg.defaultServices;
  const testi     = rawData.testimonials && rawData.testimonials.length ? rawData.testimonials : cfg.defaultTestimonials;
  const stats     = rawData.stats && rawData.stats.length ? rawData.stats : cfg.defaultStats;
  const hours     = { ...cfg.defaultHours, ...(rawData.hours || {}) };
  const photos    = rawData.photos || {};

  function bgImg(key, fallback) {
    const real = photos[key] || '';
    const uns  = `https://images.unsplash.com/${cfg.unsplash[fallback]}`;
    return real ? `url('${real}'), url('${uns}')` : `url('/demo/images/${slug}-${key}.jpg'), url('${uns}')`;
  }

  const anim = cfg.animation;
  const isLight = (anim === 'swing' || anim === 'curtain' || anim === 'glass');
  const contactBg = isLight ? p.primary : p.dark;
  const contactText = isLight ? '#0a0a0a' : p.text;
  const aboutText = rawData.aboutText || (ABOUT_TEXTS[industry]
    ? ABOUT_TEXTS[industry](name, city, founded)
    : `${esc(name)} est né d'une passion simple : bien faire, honnêtement, avec des gens de ${city ? esc(city) : 'notre région'}. ${founded ? `Fondé en ${founded}, l'équipe` : 'Notre équipe'} continue de grandir grâce à la confiance de clients fidèles et de nouveaux visages chaque année.`);
  const mapsQuery = encodeURIComponent(`${address}${city ? ', ' + city : ''}, Québec`);
  const mapBrightness = isLight ? '1.05' : '0.45';

  const insideParts = cfg.insideText.split('\n');
  const svcParts    = cfg.svcText.split('\n');

  // OG meta — carte de prévisualisation quand le lien est partagé (SMS, email, Messenger)
  const baseUrl = (rawData.baseUrl || '').replace(/\/$/, '');
  const ogImage = photos.exterior
    ? (photos.exterior.startsWith('http') ? photos.exterior : baseUrl + photos.exterior)
    : `https://images.unsplash.com/${cfg.unsplash.exterior}`;
  const ogDesc = tagline.length > 20 ? tagline : `${name} — ${cfg.label}. ${tagline}`;

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${esc(name)}</title>
    <meta name="description" content="${esc(ogDesc)}">
    <meta property="og:type" content="website">
    <meta property="og:title" content="${esc(name)}">
    <meta property="og:description" content="${esc(ogDesc)}">
    <meta property="og:image" content="${esc(ogImage)}">
    <meta property="og:locale" content="fr_CA">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${esc(name)}">
    <meta name="twitter:image" content="${esc(ogImage)}">
    <meta name="theme-color" content="${p.bg}">
    <link href="https://fonts.googleapis.com/css2?family=${cfg.google}&display=swap" rel="stylesheet">
    <style>
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
            --bg:    ${p.bg};
            --dark:  ${p.dark};
            --panel: ${p.panel};
            --primary: ${p.primary};
            --light: ${p.light};
            --text:  ${p.text};
            --muted: ${p.muted};
        }
        html { scroll-behavior: smooth; }
        html.lenis, html.lenis body { height: auto; }
        .lenis.lenis-smooth { scroll-behavior: auto !important; }
        body { background: var(--bg); color: var(--text); font-family: ${cfg.fontB}; overflow-x: hidden; -webkit-font-smoothing: antialiased; -webkit-tap-highlight-color: transparent; }
        ::-webkit-scrollbar { display: none; }

        /* ══ PRÉCHARGEUR ══ */
        #loader { position: fixed; inset: 0; z-index: 999; background: var(--bg); display: flex; align-items: center; justify-content: center; transition: transform .9s cubic-bezier(.76,0,.24,1); }
        #loader.done { transform: translateY(-100%); pointer-events: none; }
        .loader-name { font-family: ${cfg.fontH}; font-weight: ${cfg.fontHW}; font-size: clamp(28px, 5vw, 64px); text-transform: uppercase; letter-spacing: 0.04em; overflow: hidden; }
        .loader-name span { display: inline-block; transform: translateY(110%); }
        .loader-count { position: absolute; bottom: 32px; right: 40px; font-family: ${cfg.fontH}; font-size: clamp(40px, 6vw, 80px); font-weight: ${cfg.fontHW}; color: var(--primary); line-height: 1; }

        /* Masques de lignes — titres révélés ligne par ligne */
        .line-mask { display: block; overflow: hidden; }
        .line-mask > span { display: block; transform: translateY(115%); will-change: transform; }

        /* Accent italique éditorial */
        .sec-title em, .chap-title em, .splash-logo em { font-style: italic; color: var(--primary); }

        /* ══ JOURNEY ══ */
        .journey { height: 900vh; position: relative; }
        .journey-sticky { position: sticky; top: 0; height: 100vh; height: 100svh; overflow: hidden; background: #000; }
        .scene { position: absolute; inset: 0; }
        .scene-bg {
            position: absolute; inset: -10%; background-size: cover; background-position: center;
            will-change: transform, opacity;
            filter: saturate(1.10) contrast(1.05) brightness(0.88);
        }

        /* Scènes */
        #s-ext .scene-bg { background-image: ${bgImg('exterior', 'exterior')}; background-position: center 35%; filter: saturate(1.12) contrast(1.06) brightness(0.82); animation: heroKenBurns 14s ease-in-out forwards; }
        #s-ext .scene-bg.has-video { background-image: none; animation: none; }
        #s-ext .scene-bg.has-video video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; filter: saturate(1.12) contrast(1.06) brightness(0.82); }
        #s-svc { opacity: 0; z-index: 3; }
        #s-svc .scene-bg { background-image: ${bgImg('service', 'service')}; }
        #s-site { opacity: 0; z-index: 4; background: var(--bg); display: flex; align-items: flex-end; justify-content: flex-start; }
        #s-int .scene-bg { background-image: ${bgImg('interior', 'interior')}; }
        ${animationCSS(anim)}

        /* Overlays — cinématiques, moins agressifs qu'un radial pur */
        .vignette {
            position: absolute; inset: 0; z-index: 9; pointer-events: none;
            background:
                linear-gradient(to bottom, rgba(0,0,0,0.52) 0%, rgba(0,0,0,0.08) 18%, transparent 40%),
                linear-gradient(to top,    rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.18) 42%, transparent 65%),
                linear-gradient(to right,  rgba(0,0,0,0.28) 0%, transparent 28%);
        }
        .grad-bottom { display: none; }
        .grain { position: absolute; inset: 0; z-index: 10; pointer-events: none; opacity: 0.045; background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"); background-size: 160px 160px; }

        /* Journey texts */
        .jt { position: absolute; z-index: 20; pointer-events: none; }
        #jt-addr { top: 7vh; left: 7vw; font-family: ${cfg.fontH}; font-size: clamp(10px, 1.1vw, 13px); letter-spacing: 0.36em; text-transform: uppercase; color: rgba(255,255,255,0.38); opacity: 0; }
        #jt-title { bottom: 10vh; left: 7vw; opacity: 0; }
        .jt-name { font-family: ${cfg.fontH}; font-weight: ${cfg.fontHW}; font-size: clamp(42px, 7vw, 96px); line-height: 0.88; color: var(--text); text-transform: uppercase; letter-spacing: -0.02em; }
        .jt-name em { color: var(--primary); font-style: normal; }
        .jt-sub { font-family: ${cfg.fontH}; font-weight: 600; font-size: clamp(10px, 1.2vw, 15px); letter-spacing: 0.32em; text-transform: uppercase; color: var(--muted); margin-top: 16px; }
        #jt-inside { top: 40%; left: 50%; transform: translate(-50%,-50%); text-align: center; opacity: 0; }
        .jt-inside-text { font-family: ${cfg.fontH}; font-weight: ${cfg.fontHW}; font-size: clamp(26px, 4vw, 58px); text-transform: uppercase; letter-spacing: 0.12em; line-height: 1.1; }
        .jt-inside-text span { color: var(--primary); }
        #jt-svc { bottom: 14vh; right: 8vw; text-align: right; opacity: 0; }
        .jt-svc-text { font-family: ${cfg.fontH}; font-weight: ${cfg.fontHW}; font-size: clamp(28px, 4.5vw, 64px); text-transform: uppercase; line-height: 0.92; letter-spacing: 0.03em; }
        .jt-svc-text strong { display: block; color: var(--primary); }

        /* Splash screen */
        .site-splash { display: flex; flex-direction: column; align-items: flex-start; justify-content: flex-end; height: 100%; padding: 0 8vw 11vh; }
        .splash-badge { font-family: ${cfg.fontH}; font-size: clamp(10px, 1vw, 13px); letter-spacing: 0.36em; text-transform: uppercase; color: var(--primary); margin-bottom: 14px; opacity: 0; transform: translateY(16px); }
        .splash-logo-img { display: block; max-height: 54px; width: auto; max-width: 200px; object-fit: contain; filter: brightness(0) invert(1); margin-bottom: 16px; opacity: 0; transform: translateY(16px); }
        .splash-logo { font-family: ${cfg.fontH}; font-weight: ${cfg.fontHW}; font-size: clamp(44px, 7.5vw, 110px); text-transform: uppercase; line-height: 0.88; letter-spacing: -0.01em; opacity: 0; transform: translateY(24px); }
        .splash-logo span { color: var(--primary); }
        .splash-tagline { font-family: ${cfg.fontB}; font-weight: 300; font-size: clamp(14px, 1.5vw, 20px); color: var(--muted); margin-top: 20px; letter-spacing: 0.04em; opacity: 0; transform: translateY(16px); }
        .splash-scroll { margin-top: 50px; display: flex; flex-direction: column; align-items: flex-start; gap: 10px; opacity: 0; }
        .splash-scroll span { font-family: ${cfg.fontH}; font-size: 10px; letter-spacing: 0.36em; text-transform: uppercase; color: var(--primary); }
        .splash-line { width: 1px; height: 54px; background: linear-gradient(to bottom, var(--primary), transparent); animation: lineDown 1.8s ease-in-out infinite; }
        @keyframes lineDown { 0%{transform:scaleY(0);transform-origin:top} 49%{transform:scaleY(1);transform-origin:top} 50%{transform:scaleY(1);transform-origin:bottom} 100%{transform:scaleY(0);transform-origin:bottom} }
        @keyframes heroKenBurns { 0% { transform: scale(1.0); } 100% { transform: scale(1.10); } }

        /* Hero scroll hint */
        #hero-hint { position: absolute; bottom: 9vh; left: 50%; transform: translateX(-50%); z-index: 20; display: flex; flex-direction: column; align-items: center; gap: 8px; opacity: 0; pointer-events: none; transition: opacity 0.4s; }
        #hero-hint span { font-family: ${cfg.fontH}; font-size: 10px; letter-spacing: 0.36em; text-transform: uppercase; color: rgba(255,255,255,0.45); }
        .hero-hint-line { width: 1px; height: 56px; background: linear-gradient(to bottom, rgba(255,255,255,0.55), transparent); animation: lineDown 1.8s ease-in-out infinite; }

        /* Scroll-reveal */
        .reveal { opacity: 0; transform: translateY(30px); transition: opacity 0.65s cubic-bezier(.22,1,.36,1), transform 0.65s cubic-bezier(.22,1,.36,1); }
        .reveal.visible { opacity: 1; transform: none; }
        .reveal-d1 { transition-delay: 0.08s; }
        .reveal-d2 { transition-delay: 0.16s; }
        .reveal-d3 { transition-delay: 0.24s; }
        .reveal-d4 { transition-delay: 0.32s; }

        /* Navbar */
        .navbar { position: fixed; top: 0; left: 0; right: 0; z-index: 100; display: flex; align-items: center; justify-content: space-between; padding: 22px 6vw; opacity: 0; pointer-events: none; transition: background .4s, padding .3s, transform .45s cubic-bezier(.22,1,.36,1), opacity .5s; }
        .navbar.journey-past { opacity: 1; pointer-events: auto; }
        .navbar.scrolled { background: rgba(${hexToRgbStr(p.bg)}, 0.96); backdrop-filter: blur(16px); padding: 14px 6vw; }
        .navbar.hidden { transform: translateY(-100%); }
        .nav-logo { font-family: ${cfg.fontH}; font-weight: ${cfg.fontHW}; font-size: 16px; letter-spacing: 0.07em; text-transform: uppercase; color: var(--text); text-decoration: none; }
        .nav-logo span { color: var(--primary); }
        .nav-links { display: flex; gap: 36px; list-style: none; }
        .nav-links a { font-family: ${cfg.fontH}; font-size: 12px; letter-spacing: 0.2em; text-transform: uppercase; color: rgba(255,255,255,.6); text-decoration: none; transition: color .2s; }
        .nav-links a:hover { color: var(--text); }
        .nav-cta { font-family: ${cfg.fontH}; font-size: 11px; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; color: var(--text); border: 1.5px solid var(--primary); padding: 9px 22px; text-decoration: none; transition: background .2s; }
        .nav-cta:hover { background: var(--primary); }

        /* Sections */
        section { padding: 96px 7vw; }
        .sec-label { font-family: ${cfg.fontH}; font-size: 10px; letter-spacing: 0.42em; text-transform: uppercase; color: var(--primary); margin-bottom: 20px; }
        .sec-title { font-family: ${cfg.fontH}; font-weight: ${cfg.fontHW}; font-size: clamp(36px, 5.5vw, 74px); text-transform: uppercase; line-height: 0.92; margin-bottom: 32px; }

        /* Marquee */
        .marquee { background: var(--bg); border-top: 1px solid rgba(255,255,255,.05); border-bottom: 1px solid rgba(255,255,255,.05); padding: 26px 0; overflow: hidden; white-space: nowrap; }
        .marquee-track { display: inline-flex; animation: marqueeSlide 28s linear infinite; will-change: transform; }
        .marquee-item { font-family: ${cfg.fontH}; font-weight: ${cfg.fontHW}; font-size: clamp(16px, 1.8vw, 24px); text-transform: uppercase; letter-spacing: 0.18em; color: var(--muted); padding: 0 30px; }
        .marquee-item::after { content: '·'; color: var(--primary); margin-left: 60px; }
        @keyframes marqueeSlide { from { transform: translateX(0); } to { transform: translateX(-50%); } }

        /* Services */
        #services { background: var(--dark); }
        .svc-intro { max-width: 500px; font-size: 16px; line-height: 1.8; color: var(--muted); margin-bottom: 0; }
        .svc-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 2px; margin-top: 56px; }
        .svc-card { background: var(--panel); padding: 42px 34px; border-top: 2px solid var(--primary); transition: background .25s, transform .25s; cursor: default; }
        .svc-card:hover { background: var(--dark); transform: translateY(-4px); }
        .svc-num { font-family: ${cfg.fontH}; font-size: 10px; letter-spacing: 0.32em; color: var(--muted); margin-bottom: 22px; text-transform: uppercase; transition: color .25s; }
        .svc-card:hover .svc-num { color: var(--primary); }
        .svc-title { font-family: ${cfg.fontH}; font-weight: ${cfg.fontHW}; font-size: clamp(18px, 2vw, 24px); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 12px; }
        .svc-desc { font-size: 14px; line-height: 1.75; color: var(--muted); }

        /* About */
        #about { display: grid; grid-template-columns: 1fr 1fr; gap: 80px; align-items: center; }
        .about-img { aspect-ratio: 4/3; background: var(--panel); background-image: ${bgImg('about', 'about')}; background-size: cover; background-position: center; position: relative; filter: saturate(1.06) contrast(1.04); }
        .about-img::after { content: '${founded ? `Fondé ${founded}` : ''}'; position: absolute; bottom: 18px; right: 18px; font-family: ${cfg.fontH}; font-size: 10px; letter-spacing: 0.28em; text-transform: uppercase; color: rgba(255,255,255,.5); background: rgba(0,0,0,.6); padding: 5px 12px; backdrop-filter: blur(6px); }
        .about-body { font-size: 15px; line-height: 1.85; color: var(--muted); margin-bottom: 44px; }
        .stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
        .stat-num { font-family: ${cfg.fontH}; font-weight: ${cfg.fontHW}; font-size: clamp(38px, 4vw, 60px); color: var(--primary); line-height: 1; }
        .stat-label { font-size: 12px; letter-spacing: 0.05em; color: var(--muted); margin-top: 5px; }

        /* Gallery — défilement horizontal cinématique */
        .gal { height: 280vh; position: relative; background: var(--bg); }
        .gal-sticky { position: sticky; top: 0; height: 100vh; display: flex; align-items: center; overflow: hidden; }
        .gal-track { display: flex; align-items: center; gap: 4vw; padding: 0 7vw; will-change: transform; }
        .gal-head { flex-shrink: 0; width: 32vw; min-width: 300px; }
        .gal-item { flex-shrink: 0; position: relative; }
        .gal-img { width: 52vw; max-width: 760px; aspect-ratio: 3/2; background-size: cover; background-position: center; filter: saturate(1.08) contrast(1.04) brightness(0.9); transition: filter .6s; }
        .gal-item:hover .gal-img { filter: saturate(1.15) contrast(1.06) brightness(0.98); }
        .gal-cap { position: absolute; bottom: -34px; left: 0; font-family: ${cfg.fontH}; font-size: 11px; letter-spacing: 0.3em; text-transform: uppercase; color: var(--muted); }
        .gal-cap strong { color: var(--primary); font-weight: ${cfg.fontHW}; margin-right: 14px; }
        @media (max-width: 768px) {
            .gal { height: auto; }
            .gal-sticky { position: static; height: auto; padding: 72px 0; }
            .gal-track { overflow-x: auto; scroll-snap-type: x mandatory; -webkit-overflow-scrolling: touch; padding-bottom: 50px; }
            .gal-head { width: 78vw; scroll-snap-align: start; }
            .gal-img { width: 78vw; scroll-snap-align: center; }
        }

        /* Chapitres narratifs — plein écran, style éditorial */
        .chapter { position: relative; height: 100vh; height: 100svh; min-height: 560px; overflow: hidden; display: flex; align-items: flex-end; }
        .chap-bg { position: absolute; inset: -6%; background-size: cover; background-position: center; will-change: transform; filter: saturate(1.06) contrast(1.04) brightness(0.88); }
        .chapter::after { content: ''; position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,.78) 0%, rgba(0,0,0,.12) 50%, rgba(0,0,0,.15) 100%); pointer-events: none; }
        .chap-content { position: relative; z-index: 2; padding: 0 7vw 13vh; max-width: 760px; }
        .chap-num { font-family: ${cfg.fontH}; font-size: 11px; letter-spacing: 0.4em; text-transform: uppercase; color: var(--primary); margin-bottom: 18px; }
        .chap-title { font-family: ${cfg.fontH}; font-weight: ${cfg.fontHW}; font-size: clamp(34px, 4.8vw, 68px); line-height: 1.02; color: #fff; margin-bottom: 18px; text-transform: uppercase; }
        .chap-body { font-size: clamp(14px, 1.3vw, 17px); line-height: 1.8; color: rgba(255,255,255,.78); max-width: 460px; }

        /* Philosophie — section claire */
        #philosophy { background: ${cfg.lightTheme.bg}; color: ${cfg.lightTheme.text}; padding: 120px 7vw; }
        #philosophy .sec-label { color: var(--primary); }
        #philosophy .sec-title { color: ${cfg.lightTheme.text}; }
        .philo-intro { max-width: 540px; font-size: 16px; line-height: 1.85; color: ${cfg.lightTheme.muted}; }
        .philo-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 18px; margin-top: 64px; }
        .philo-card { background: rgba(255,255,255,.55); border: 1px solid rgba(0,0,0,.07); padding: 32px 26px; transition: transform .25s, box-shadow .25s; }
        .philo-card:hover { transform: translateY(-4px); box-shadow: 0 18px 40px rgba(0,0,0,.08); }
        .philo-num { font-family: ${cfg.fontH}; font-size: 10px; letter-spacing: 0.32em; color: var(--primary); margin-bottom: 16px; }
        .philo-title { font-family: ${cfg.fontH}; font-weight: ${cfg.fontHW}; font-size: 19px; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 10px; color: ${cfg.lightTheme.text}; }
        .philo-body { font-size: 13.5px; line-height: 1.7; color: ${cfg.lightTheme.muted}; }

        /* Barre persistante — adresse / CTA pilule / téléphone */
        .bottom-bar { position: fixed; bottom: 0; left: 0; right: 0; z-index: 190; display: flex; justify-content: space-between; align-items: flex-end; padding: 0 28px 20px; pointer-events: none; opacity: 0; transition: opacity .4s; }
        .bottom-bar.on { opacity: 1; }
        .bb-side { font-family: ${cfg.fontB}; font-size: 11px; letter-spacing: 0.08em; color: rgba(255,255,255,.85); text-shadow: 0 1px 10px rgba(0,0,0,.6); text-decoration: none; }
        a.bb-side { pointer-events: auto; }
        .bb-cta { pointer-events: auto; font-family: ${cfg.fontH}; font-size: 12px; font-weight: 700; letter-spacing: 0.22em; text-transform: uppercase; background: var(--primary); color: #fff; padding: 14px 38px; border-radius: 100px; text-decoration: none; box-shadow: 0 10px 36px rgba(0,0,0,.45); transition: transform .2s, box-shadow .2s; }
        .bb-cta:hover { transform: translateY(-2px); box-shadow: 0 14px 44px rgba(0,0,0,.55); }
        @media (max-width: 768px) { .bb-side { display: none; } .bottom-bar { justify-content: center; } }

        /* Testimonials */
        #testimonials { background: var(--dark); }
        .testi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 2px; margin-top: 52px; }
        .testi-card { background: var(--panel); padding: 36px 32px; border-left: 2px solid var(--primary); position: relative; overflow: hidden; }
        .testi-card::before { content: '«'; position: absolute; top: -14px; right: 14px; font-family: ${cfg.fontH}; font-size: 110px; line-height: 1; color: var(--primary); opacity: 0.1; pointer-events: none; }
        .testi-stars { color: var(--primary); font-size: 13px; letter-spacing: 2px; margin-bottom: 14px; }
        .testi-text { font-size: 15px; line-height: 1.8; color: rgba(255,255,255,.75); font-style: italic; }
        .testi-author { font-family: ${cfg.fontH}; font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--muted); margin-top: 20px; }

        /* Contact */
        #contact { background: ${contactBg}; text-align: center; }
        #contact .sec-label { color: ${isLight ? 'rgba(0,0,0,0.45)' : 'var(--primary)'}; }
        #contact .sec-title { color: ${contactText}; margin-bottom: 6px; }
        .contact-phone { display: block; font-family: ${cfg.fontH}; font-weight: ${cfg.fontHW}; font-size: clamp(38px, 6vw, 90px); letter-spacing: -0.02em; color: ${contactText}; text-decoration: none; margin: 24px 0 14px; transition: opacity .2s; }
        .contact-phone:hover { opacity: .75; }
        .contact-addr { font-size: 16px; color: ${isLight ? 'rgba(0,0,0,.55)' : 'var(--muted)'}; line-height: 1.7; margin-bottom: 48px; }
        .btn-cta { display: inline-block; font-family: ${cfg.fontH}; font-size: 12px; font-weight: 700; letter-spacing: 0.28em; text-transform: uppercase; background: ${isLight ? p.bg : p.primary}; color: ${isLight ? p.text : p.bg}; padding: 18px 54px; text-decoration: none; transition: opacity .2s; }
        .btn-cta:hover { opacity: .82; }
        .hours-grid { display: flex; gap: 44px; justify-content: center; flex-wrap: wrap; margin-top: 56px; padding-top: 44px; border-top: 1px solid ${isLight ? 'rgba(0,0,0,.15)' : 'rgba(255,255,255,.08)'}; }
        .hour-item { text-align: center; }
        .hour-day { font-family: ${cfg.fontH}; font-size: 10px; letter-spacing: 0.25em; text-transform: uppercase; color: ${isLight ? 'rgba(0,0,0,.45)' : 'var(--muted)'}; }
        .hour-time { font-family: ${cfg.fontH}; font-weight: 700; font-size: 20px; color: ${contactText}; margin-top: 5px; }
        .contact-map { margin: 44px auto 0; max-width: 620px; overflow: hidden; border: 1px solid ${isLight ? 'rgba(0,0,0,.12)' : 'rgba(255,255,255,.06)'}; }
        .contact-map iframe { display: block; width: 100%; height: 240px; border: none; filter: grayscale(100%) contrast(80%) brightness(${mapBrightness}); }

        /* Footer */
        footer { background: ${p.bg}; padding: 72px 7vw 0; border-top: 1px solid rgba(255,255,255,.05); }
        .foot-grid { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 56px; padding-bottom: 56px; }
        .foot-logo { font-family: ${cfg.fontH}; font-weight: ${cfg.fontHW}; font-size: clamp(22px, 2.4vw, 32px); text-transform: uppercase; line-height: 1; }
        .foot-logo span { color: var(--primary); }
        .foot-tag { font-size: 13px; color: var(--muted); margin-top: 14px; max-width: 320px; line-height: 1.7; }
        .foot-head { font-family: ${cfg.fontH}; font-size: 10px; letter-spacing: 0.32em; text-transform: uppercase; color: var(--primary); margin-bottom: 18px; }
        .foot-col a { display: block; font-size: 13px; color: var(--muted); text-decoration: none; margin-bottom: 10px; transition: color .2s; }
        .foot-col a:hover { color: var(--text); }
        .foot-col p { font-size: 13px; color: var(--muted); line-height: 1.7; }
        .foot-bar { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; padding: 22px 0; border-top: 1px solid rgba(255,255,255,.05); }
        .foot-bar p { font-size: 11px; color: var(--muted); letter-spacing: 0.06em; }
        .foot-bar a { color: var(--muted); text-decoration: none; border-bottom: 1px solid rgba(255,255,255,.15); transition: color .2s; }
        .foot-bar a:hover { color: var(--text); }

        ::selection { background: var(--primary); color: #000; }

        /* ══ CUSTOM CURSOR ══ */
        .cur-ring { position: fixed; top: 0; left: 0; width: 38px; height: 38px; border: 1.5px solid var(--primary); border-radius: 50%; pointer-events: none; z-index: 9999; opacity: 0; transform: translate(-50%,-50%) scale(0); transition: width .32s cubic-bezier(.22,1,.36,1), height .32s cubic-bezier(.22,1,.36,1), opacity .25s, border-color .3s; will-change: left, top; }
        .cur-dot { position: fixed; top: 0; left: 0; width: 5px; height: 5px; background: var(--primary); border-radius: 50%; pointer-events: none; z-index: 9999; transform: translate(-50%,-50%); transition: width .2s, height .2s; }
        body.cur-on .cur-ring { opacity: 1; transform: translate(-50%,-50%) scale(1); }
        body.cur-link .cur-ring { width: 58px; height: 58px; border-color: rgba(255,255,255,.38); background: rgba(255,255,255,.04); }
        body.cur-link .cur-dot { width: 3px; height: 3px; }
        @media (hover: none) { .cur-ring, .cur-dot { display: none; } }

        /* ══ SECTION DECO LINE ══ */
        .sec-deco { display: block; width: 0; height: 1px; background: var(--primary); margin-bottom: 14px; }

        @media (max-width: 768px) {
            /* Journey raccourci au pouce — ~6 swipes au lieu de 12 */
            .journey { height: 560vh; }
            #about { grid-template-columns: 1fr; gap: 40px; }
            .nav-links { display: none; }
            .about-img { aspect-ratio: 16/9; }
            .hours-grid { gap: 24px; }
            .foot-grid { grid-template-columns: 1fr; gap: 36px; }
            section { padding: 72px 6vw; }
            .chap-content { padding: 0 6vw 11vh; }
            #jt-title { bottom: 13vh; }
        }

        @media (prefers-reduced-motion: reduce) {
            .reveal { opacity: 1; transform: none; transition: none; }
            .marquee-track { animation: none; }
            .splash-line { animation: none; }
            .hero-hint-line { animation: none; }
            #s-ext .scene-bg { animation: none; }
            html { scroll-behavior: auto; }
        }
    </style>
</head>
<body>

<div class="cur-ring" id="curRing" aria-hidden="true"></div>
<div class="cur-dot"  id="curDot"  aria-hidden="true"></div>

<div id="loader" aria-hidden="true">
    <div class="loader-name" id="loaderName">${name.split('').map(c => c === ' ' ? '<span>&nbsp;</span>' : `<span>${esc(c)}</span>`).join('')}</div>
    <div class="loader-count" id="loaderCount">0</div>
</div>

<nav class="navbar" id="navbar">
    <a href="#" class="nav-logo">${esc(name)}</a>
    <ul class="nav-links">
        <li><a href="#services">Services</a></li>
        <li><a href="#about">À propos</a></li>
        <li><a href="#galerie">Galerie</a></li>
        <li><a href="#contact">Contact</a></li>
    </ul>
    <a href="tel:${phoneClean}" class="nav-cta">Appeler</a>
</nav>
<div class="bottom-bar" id="bottomBar">
    <span class="bb-side">${esc(address.split(',').slice(0,2).join(',').trim())}</span>
    ${phoneClean ? `<a href="tel:${phoneClean}" class="bb-cta">${esc(cfg.ctaLabel)}</a>` : `<span></span>`}
    ${phoneClean ? `<a href="tel:${phoneClean}" class="bb-side">${esc(phone)}</a>` : `<span class="bb-side"></span>`}
</div>

<div class="journey">
    <div class="journey-sticky">
        <div class="scene" id="s-ext"><div class="scene-bg${photos.heroVideo ? ' has-video' : ''}">${photos.heroVideo ? `<video autoplay loop muted playsinline><source src="${esc(photos.heroVideo)}" type="video/mp4"></video>` : ''}</div></div>
        <div class="scene" id="s-int"><div class="scene-bg"></div></div>
        <div class="scene" id="s-svc"><div class="scene-bg"></div></div>
        <div class="scene" id="s-site">
            <div class="site-splash">
                ${(anim === 'garage' || anim === 'gate') ? `<div class="splash-badge">${esc(city || address.split(',').pop().trim())}${founded ? ` · depuis ${founded}` : ''}</div>` : ''}
                <img class="splash-logo-img" src="/demo/images/${slug}-logo.png" data-logo="${rawData.logoUrl ? esc(rawData.logoUrl) : ''}" onerror="const f=this.dataset.logo;if(f&&!this._t){this._t=1;this.src=f}else{this.style.display='none'}" alt="${esc(name)}">
                <div class="splash-logo">${esc(name)}</div>
                <div class="splash-tagline">${esc(tagline)}</div>
                <div class="splash-scroll"><span>Explorer</span><div class="splash-line"></div></div>
            </div>
        </div>
        ${animationElement(anim)}
        <div class="vignette"></div>
        <div class="grad-bottom"></div>
        <div class="grain"></div>
        <div class="jt" id="jt-addr">${esc(address.split(',').slice(0,2).join(',').trim())}</div>
        <div class="jt" id="jt-title">
            <div class="jt-name">${heroNameLines(name).map(esc).join('<br>')}</div>
            <div class="jt-sub">${founded ? `Fondé en ${founded} · ` : ''}${esc(heroTagline(tagline))}</div>
        </div>
        <div class="jt" id="jt-inside">
            <div class="jt-inside-text">${insideParts.map((l,i) => i===1 ? `<span>${esc(l)}</span>` : esc(l)).join('<br>')}</div>
        </div>
        <div class="jt" id="jt-svc">
            <div class="jt-svc-text">${svcParts[0] ? esc(svcParts[0]) : ''}<br>${svcParts[1] ? `<strong>${esc(svcParts[1])}</strong>` : ''}</div>
        </div>
        <div id="hero-hint"><span>Défiler</span><div class="hero-hint-line"></div></div>
    </div>
</div>

<div class="marquee" aria-hidden="true">
    <div class="marquee-track">
        ${[0,1].map(() => cfg.marquee.map(w => `<span class="marquee-item">${esc(w)}</span>`).join('')).join('')}
    </div>
</div>

<section id="services">
    <div class="sec-label reveal">Nos expertises</div>
    <h2 class="sec-title reveal reveal-d1">Ce qu'on<br>fait le mieux</h2>
    <p class="svc-intro reveal reveal-d2">${esc(tagline)} Notre équipe est là pour vous servir avec rigueur et passion.</p>
    <div class="svc-grid">
        ${services.map((s,i) => `<div class="svc-card">
            <div class="svc-num">0${i+1}</div>
            <div class="svc-title">${esc(s.title)}</div>
            <div class="svc-desc">${esc(s.desc)}</div>
        </div>`).join('\n        ')}
    </div>
</section>

<div class="chapter">
    <div class="chap-bg" style="background-image: ${bgImg(cfg.chapters[0].img, cfg.chapters[0].img)}"></div>
    <div class="chap-content">
        <div class="chap-num reveal">01 — ${esc(cfg.galleryCaptions[1])}</div>
        <h2 class="chap-title reveal reveal-d1">${cfg.chapters[0].title}</h2>
        <p class="chap-body reveal reveal-d2">${esc(fillChap(cfg.chapters[0].body, name, city))}</p>
    </div>
</div>

<section id="about">
    <div class="about-img"></div>
    <div>
        <div class="sec-label reveal">Notre histoire</div>
        <h2 class="sec-title reveal reveal-d1">${founded ? `Depuis ${founded},<br>` : ''}on est là pour vous</h2>
        <p class="about-body reveal reveal-d2">${aboutText}</p>
        <div class="stats-grid reveal reveal-d3">
            ${stats.map(s => `<div>
                <div class="stat-num" data-target="${esc(s.num)}">${esc(s.num)}</div>
                <div class="stat-label">${esc(s.label)}</div>
            </div>`).join('\n            ')}
        </div>
    </div>
</section>

<div class="chapter">
    <div class="chap-bg" style="background-image: ${bgImg(cfg.chapters[1].img, cfg.chapters[1].img)}"></div>
    <div class="chap-content">
        <div class="chap-num reveal">02 — ${esc(cfg.galleryCaptions[2])}</div>
        <h2 class="chap-title reveal reveal-d1">${cfg.chapters[1].title}</h2>
        <p class="chap-body reveal reveal-d2">${esc(fillChap(cfg.chapters[1].body, name, city))}</p>
    </div>
</div>

<div class="gal" id="galerie">
    <div class="gal-sticky">
        <div class="gal-track" id="galTrack">
            <div class="gal-head">
                <div class="sec-label">La visite continue</div>
                <h2 class="sec-title">Voyez par<br>vous-même</h2>
            </div>
            ${['exterior','interior','service','about'].map((key, i) => `<div class="gal-item">
                <div class="gal-img" style="background-image: ${bgImg(key, key)}"></div>
                <div class="gal-cap"><strong>0${i+1}</strong>${esc(cfg.galleryCaptions[i])}</div>
            </div>`).join('\n            ')}
        </div>
    </div>
</div>

<section id="philosophy">
    <div class="sec-label reveal">Notre philosophie</div>
    <h2 class="sec-title reveal reveal-d1">${cfg.philosophy.title}</h2>
    <p class="philo-intro reveal reveal-d2">${esc(cfg.philosophy.intro)}</p>
    <div class="philo-grid">
        ${cfg.philosophy.cards.map((c,i) => `<div class="philo-card">
            <div class="philo-num">0${i+1}</div>
            <div class="philo-title">${esc(c.title)}</div>
            <div class="philo-body">${esc(c.body)}</div>
        </div>`).join('\n        ')}
    </div>
</section>

<section id="testimonials">
    <div class="sec-label reveal">Ce qu'ils en disent</div>
    <h2 class="sec-title reveal reveal-d1">La confiance,<br>ça se mérite</h2>
    <div class="testi-grid">
        ${testi.map((t,i) => `<div class="testi-card">
            <div class="testi-stars">★★★★★</div>
            <div class="testi-text">${esc(t.text)}</div>
            <div class="testi-author">${esc(t.author)}</div>
        </div>`).join('\n        ')}
    </div>
</section>

<section id="contact">
    <div class="sec-label reveal">Prenez contact</div>
    <h2 class="sec-title reveal reveal-d1">On est là<br>pour vous</h2>
    <a href="tel:${phoneClean}" class="contact-phone reveal reveal-d2">${esc(phone)}</a>
    <div class="contact-addr reveal reveal-d3">${esc(address)}</div>
    <a href="tel:${phoneClean}" class="btn-cta reveal reveal-d3">${esc(cfg.ctaLabel)}</a>
    <div class="hours-grid reveal">
        <div class="hour-item"><div class="hour-day">Lun — Ven</div><div class="hour-time">${esc(hours.weekdays)}</div></div>
        <div class="hour-item"><div class="hour-day">Samedi</div><div class="hour-time">${esc(hours.saturday)}</div></div>
        <div class="hour-item"><div class="hour-day">Dimanche</div><div class="hour-time">${esc(hours.sunday)}</div></div>
    </div>
    ${address ? `<div class="contact-map reveal"><iframe src="https://maps.google.com/maps?q=${mapsQuery}&output=embed&hl=fr" loading="lazy" title="Localisation ${esc(name)}"></iframe></div>` : ''}
</section>

<footer>
    <div class="foot-grid">
        <div>
            <div class="foot-logo">${esc(name)}</div>
            <p class="foot-tag">${esc(tagline)}</p>
        </div>
        <div class="foot-col">
            <div class="foot-head">Navigation</div>
            <a href="#services">Services</a>
            <a href="#about">À propos</a>
            <a href="#galerie">Galerie</a>
            <a href="#contact">Contact</a>
        </div>
        <div class="foot-col">
            <div class="foot-head">Contact</div>
            ${phoneClean ? `<a href="tel:${phoneClean}">${esc(phone)}</a>` : ''}
            <p>${esc(address)}</p>
            <p style="margin-top:10px">Lun — Ven · ${esc(hours.weekdays)}</p>
        </div>
    </div>
    <div class="foot-bar">
        <p>© ${new Date().getFullYear()} ${esc(name)} — Tous droits réservés</p>
        <p>Site conçu par <a href="https://novalisia.ca" target="_blank" rel="noopener">Novalis Studio</a></p>
    </div>
</footer>

<img src="/t/${slug}" width="1" height="1" style="position:fixed;top:0;left:0;opacity:0.001;pointer-events:none" alt="">

<script src="https://unpkg.com/lenis@1.1.14/dist/lenis.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js"></script>
<script>
    // ── Mode dégradé — si GSAP ne charge pas (CDN bloqué, réseau lent),
    //    le site reste entièrement lisible : hero simple + sections visibles.
    if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') {
        document.body.style.overflow = '';
        const s = document.createElement('style');
        s.textContent = [
            '#loader{display:none}',
            '.journey{height:auto}',
            '.journey-sticky{position:relative;height:100svh}',
            '#s-int,#s-svc,#s-site,#jt-inside,#jt-svc,#hero-hint,#jt-addr{display:none}',
            '#jt-title{opacity:1}',
            '.navbar{opacity:1;pointer-events:auto;background:var(--dark)}',
            '.reveal{opacity:1;transform:none}',
            '.line-mask>span{transform:none!important}',
            '.gal{height:auto}',
            '.gal-sticky{position:static;height:auto;padding:72px 0}',
            '.gal-track{overflow-x:auto;padding-bottom:50px}',
        ].join('\\n');
        document.head.appendChild(s);
        throw new Error('GSAP indisponible — mode dégradé activé');
    }
    gsap.registerPlugin(ScrollTrigger);
    const reduceMotionGlobal = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Défilement fluide inertiel (Lenis)
    let lenis = null;
    if (typeof Lenis !== 'undefined' && !reduceMotionGlobal) {
        lenis = new Lenis({ duration: 1.15, smoothWheel: true });
        lenis.on('scroll', ScrollTrigger.update);
        gsap.ticker.add((t) => lenis.raf(t * 1000));
        gsap.ticker.lagSmoothing(0);
    }

    // Préchargeur — compteur + lettres, puis rideau qui se lève
    (function() {
        const loader = document.getElementById('loader');
        const count = document.getElementById('loaderCount');
        const letters = document.querySelectorAll('#loaderName span');
        if (lenis) lenis.stop();
        document.body.style.overflow = 'hidden';
        function finish() {
            loader.classList.add('done');
            document.body.style.overflow = '';
            if (lenis) lenis.start();
            gsap.set('#s-ext .scene-bg', { scale: 1.0 });
            gsap.to('#jt-addr', { opacity: 1, duration: 1.4, delay: 0.5, ease: 'power2.out' });
            gsap.fromTo('#jt-title',
                { opacity: 0, y: 22 },
                { opacity: 1, y: 0, duration: 1.6, delay: 0.9, ease: 'power3.out' }
            );
            gsap.to('#hero-hint', { opacity: 1, duration: 1.2, delay: 1.8, ease: 'power2.out' });
        }
        if (reduceMotionGlobal) {
            loader.style.display = 'none'; document.body.style.overflow = '';
            gsap.set(['#jt-addr', '#jt-title'], { opacity: 1 });
            return;
        }
        gsap.to(letters, { y: 0, duration: 0.8, stagger: 0.035, ease: 'power3.out', delay: 0.15 });
        const cnt = { v: 0 };
        gsap.to(cnt, {
            v: 100, duration: 1.6, ease: 'power2.inOut', delay: 0.1,
            onUpdate: () => { count.textContent = Math.round(cnt.v); },
            onComplete: () => setTimeout(finish, 220),
        });
        setTimeout(finish, 3200); // garde-fou
    })();

    // Navbar — invisible pendant le journey cinématique, apparaît après
    let lastY = 0;
    const navEl = document.getElementById('navbar');
    const journeySection = document.querySelector('.journey');
    window.addEventListener('scroll', () => {
        const y = window.scrollY;
        const journeyBottom = journeySection ? journeySection.offsetTop + journeySection.offsetHeight : 0;
        const pastJourney = y > journeyBottom - window.innerHeight * 0.5;
        if (!pastJourney) {
            navEl.classList.remove('journey-past', 'scrolled', 'hidden');
            lastY = y;
            return;
        }
        navEl.classList.add('journey-past', 'scrolled');
        navEl.classList.toggle('hidden', y > lastY + 10 && y > 100);
        lastY = y;
    }, { passive: true });

    // Titres révélés ligne par ligne (segments séparés par <br>)
    document.querySelectorAll('.sec-title, .chap-title').forEach(h => {
        h.classList.remove('reveal', 'reveal-d1', 'reveal-d2', 'reveal-d3');
        const parts = h.innerHTML.split(/<br\\s*\\/?>/i);
        h.innerHTML = parts.map(s => '<span class="line-mask"><span>' + s + '</span></span>').join('');
        gsap.to(h.querySelectorAll('.line-mask > span'), {
            y: 0, duration: 1, stagger: 0.09, ease: 'power3.out',
            scrollTrigger: { trigger: h, start: 'top 86%', once: true },
        });
    });

    // Liens d'ancrage fluides avec Lenis
    document.querySelectorAll('a[href^="#"]').forEach(a => {
        a.addEventListener('click', (e) => {
            const id = a.getAttribute('href');
            if (id.length > 1 && lenis && document.querySelector(id)) {
                e.preventDefault();
                lenis.scrollTo(id, { offset: -20 });
            }
        });
    });

    // About-img — wipe cinématique de gauche à droite
    gsap.fromTo('.about-img',
        { clipPath: 'inset(0 100% 0 0)' },
        { clipPath: 'inset(0 0% 0 0)', duration: 1.3, ease: 'power3.inOut',
          scrollTrigger: { trigger: '.about-img', start: 'top 82%', once: true } }
    );
    // Gallery + map — clip + zoom
    document.querySelectorAll('.gal-img, .contact-map').forEach(el => {
        gsap.fromTo(el,
            { clipPath: 'inset(8% 4% 8% 4%)', scale: 1.08 },
            { clipPath: 'inset(0% 0% 0% 0%)', scale: 1, duration: 1.2, ease: 'power3.out',
              scrollTrigger: { trigger: el, start: 'top 84%', once: true } }
        );
    });

    // GSAP cinematic journey
    const tl = gsap.timeline({
        scrollTrigger: {
            trigger: '.journey',
            start: 'top top',
            end: 'bottom bottom',
            scrub: 2.0,
        }
    });
    ${gsapScript(anim)}
    tl.to('#hero-hint', { opacity: 0, duration: 0.25 }, 0.2);

    // Galerie horizontale — pilotée par le scroll (desktop seulement)
    const galTrack = document.getElementById('galTrack');
    if (galTrack && window.matchMedia('(min-width: 769px)').matches) {
        gsap.to(galTrack, {
            x: () => -(galTrack.scrollWidth - window.innerWidth + window.innerWidth * 0.07),
            ease: 'none',
            scrollTrigger: {
                trigger: '.gal',
                start: 'top top',
                end: 'bottom bottom',
                scrub: 1,
                invalidateOnRefresh: true,
            }
        });
    }

    // Scroll-reveal via IntersectionObserver
    const io = new IntersectionObserver((entries) => {
        entries.forEach(e => {
            if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); }
        });
    }, { threshold: 0.12 });
    document.querySelectorAll('.reveal').forEach(el => io.observe(el));

    // Compteurs animés — les stats comptent jusqu'à leur valeur
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function animateStat(el) {
        const raw = el.dataset.target || '';
        const m = raw.match(/^([^0-9]*)([0-9][0-9\\s.,\\u00A0\\u202F]*)(.*)$/);
        if (!m) return;
        const target = parseFloat(m[2].replace(/[\\s\\u00A0\\u202F]/g, '').replace(',', '.'));
        if (isNaN(target)) return;
        const decimals = /[.,]\\d/.test(m[2].trim()) ? 1 : 0;
        const dur = 1400, t0 = performance.now();
        function fmt(v) {
            return m[1] + v.toLocaleString('fr-CA', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + m[3];
        }
        function tick(now) {
            const k = Math.min((now - t0) / dur, 1);
            const eased = 1 - Math.pow(1 - k, 3);
            el.textContent = fmt(target * eased);
            if (k < 1) requestAnimationFrame(tick);
            else el.textContent = raw;
        }
        requestAnimationFrame(tick);
    }
    if (!reduceMotion) {
        const ioStats = new IntersectionObserver((entries) => {
            entries.forEach(e => {
                if (e.isIntersecting) { animateStat(e.target); ioStats.unobserve(e.target); }
            });
        }, { threshold: 0.5 });
        document.querySelectorAll('.stat-num').forEach(el => ioStats.observe(el));
    }

    // Parallax des chapitres narratifs
    document.querySelectorAll('.chapter').forEach(ch => {
        gsap.fromTo(ch.querySelector('.chap-bg'), { yPercent: -7 }, {
            yPercent: 7, ease: 'none',
            scrollTrigger: { trigger: ch, start: 'top bottom', end: 'bottom top', scrub: true }
        });
    });

    // Barre persistante — apparaît après le journey, disparaît au footer
    const bottomBar = document.getElementById('bottomBar');
    if (bottomBar) {
        const journeyEl = document.querySelector('.journey');
        const footerEl = document.querySelector('footer');
        function updateBar() {
            const pastJourney = window.scrollY > journeyEl.offsetTop + journeyEl.offsetHeight - window.innerHeight * 0.5;
            const atFooter = footerEl.getBoundingClientRect().top < window.innerHeight - 80;
            bottomBar.classList.toggle('on', pastJourney && !atFooter);
        }
        window.addEventListener('scroll', updateBar, { passive: true });
    }

    // ══ ANIMATIONS PREMIUM ══

    // Curseur custom — inertia ring, signal premium immédiat
    (function() {
        const ring = document.getElementById('curRing');
        const dot  = document.getElementById('curDot');
        if (!ring || 'ontouchstart' in window || window.matchMedia('(hover:none)').matches) return;
        let cx = -200, cy = -200, tx = -200, ty = -200;
        window.addEventListener('mousemove', e => {
            tx = e.clientX; ty = e.clientY;
            dot.style.left = tx + 'px'; dot.style.top = ty + 'px';
            document.body.classList.add('cur-on');
        }, { passive: true });
        gsap.ticker.add(() => {
            cx += (tx - cx) * 0.13; cy += (ty - cy) * 0.13;
            ring.style.left = cx + 'px'; ring.style.top = cy + 'px';
        });
        document.querySelectorAll('a, button, .svc-card, .philo-card, .testi-card, .gal-item, .nav-cta, .bb-cta').forEach(el => {
            el.addEventListener('mouseenter', () => document.body.classList.add('cur-link'));
            el.addEventListener('mouseleave', () => document.body.classList.remove('cur-link'));
        });
        window.addEventListener('mouseleave', () => document.body.classList.remove('cur-on'));
    })();

    // Section labels — slide from left + ligne déco qui se déploie
    if (!reduceMotionGlobal) {
        document.querySelectorAll('.sec-label').forEach(label => {
            const deco = document.createElement('div');
            deco.className = 'sec-deco';
            label.before(deco);
            gsap.to(deco, { width: 44, duration: 0.9, ease: 'power3.out',
                scrollTrigger: { trigger: deco, start: 'top 92%', once: true } });
            gsap.fromTo(label, { opacity: 0, x: -18 },
                { opacity: 1, x: 0, duration: 0.65, ease: 'power2.out', delay: 0.18,
                  scrollTrigger: { trigger: label, start: 'top 92%', once: true } });
        });

        // Service cards — stagger interne (num → title → desc)
        document.querySelectorAll('.svc-card').forEach(card => {
            gsap.fromTo(card, { opacity: 0, y: 40 },
                { opacity: 1, y: 0, duration: 0.75, ease: 'power3.out',
                  scrollTrigger: { trigger: card, start: 'top 88%', once: true } });
            gsap.fromTo(card.querySelectorAll('.svc-num, .svc-title, .svc-desc'),
                { opacity: 0, y: 14 },
                { opacity: 1, y: 0, duration: 0.5, stagger: 0.08, ease: 'power2.out',
                  scrollTrigger: { trigger: card, start: 'top 88%', once: true } });
        });

        // Philosophy cards — scale + stagger interne
        document.querySelectorAll('.philo-card').forEach((card, i) => {
            gsap.fromTo(card, { opacity: 0, y: 28, scale: 0.97 },
                { opacity: 1, y: 0, scale: 1, duration: 0.7, delay: i * 0.06, ease: 'power3.out',
                  scrollTrigger: { trigger: '.philo-grid', start: 'top 85%', once: true } });
            gsap.fromTo(card.querySelectorAll('.philo-num, .philo-title, .philo-body'),
                { opacity: 0, y: 10 },
                { opacity: 1, y: 0, duration: 0.45, stagger: 0.07, delay: i * 0.06, ease: 'power2.out',
                  scrollTrigger: { trigger: '.philo-grid', start: 'top 85%', once: true } });
        });

        // Testimonials — stagger en éventail
        document.querySelectorAll('.testi-card').forEach((card, i) => {
            gsap.fromTo(card, { opacity: 0, y: 32 },
                { opacity: 1, y: 0, duration: 0.7, delay: i * 0.1, ease: 'power3.out',
                  scrollTrigger: { trigger: '.testi-grid', start: 'top 85%', once: true } });
        });

        // Chapter num — slide from left
        document.querySelectorAll('.chap-num').forEach(el => {
            el.classList.remove('reveal');
            gsap.fromTo(el, { opacity: 0, x: -14 },
                { opacity: 1, x: 0, duration: 0.6, ease: 'power2.out',
                  scrollTrigger: { trigger: el, start: 'top 90%', once: true } });
        });
    }
</script>
</body>
</html>`;

  return { html, slug };
}

// ── Hex → RGB string helper for CSS rgba ──────────────────────────────────
function hexToRgbStr(hex) {
  const h = (hex || '#000').replace('#', '');
  const r = parseInt(h.slice(0,2),16);
  const g = parseInt(h.slice(2,4),16);
  const b = parseInt(h.slice(4,6),16);
  return `${r},${g},${b}`;
}

module.exports = { generateCinematic, CONFIGS, INDUSTRY_LABELS };
