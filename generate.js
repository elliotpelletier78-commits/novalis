const fs = require('fs');
const path = require('path');

// ============================================================
// UTILITAIRES COULEUR — adapte le template à la couleur du logo
// ============================================================

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

function toHex(r, g, b) {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

function darken(hex, factor = 0.22) {
  const { r, g, b } = hexToRgb(hex);
  return toHex(r * (1 - factor), g * (1 - factor), b * (1 - factor));
}

function lighten(hex, factor = 0.32) {
  const { r, g, b } = hexToRgb(hex);
  return toHex(r + (255 - r) * factor, g + (255 - g) * factor, b + (255 - b) * factor);
}

// Vérifie si la couleur est trop sombre ou trop claire pour être utile
function ensureVibrancy(hex) {
  const { r, g, b } = hexToRgb(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  // Trop sombre → éclaircir; trop clair → assombrir
  if (luminance < 0.12) return lighten(hex, 0.5);
  if (luminance > 0.88) return darken(hex, 0.5);
  return hex;
}

// Remplace toutes les occurrences de la couleur bleue de référence
// (#2563EB / #1D4ED8 / #3B82F6 + leurs variantes rgba) par la couleur du logo
function applyBrandColor(html, brandHex) {
  if (!brandHex || brandHex === '#2563EB') return html; // pas de changement si bleu par défaut

  const main  = ensureVibrancy(brandHex);
  const dark  = darken(main, 0.22);
  const light = lighten(main, 0.28);

  const { r: mr, g: mg, b: mb } = hexToRgb(main);
  const { r: lr, g: lg, b: lb } = hexToRgb(light);
  const { r: dr, g: dg, b: db } = hexToRgb(dark);

  return html
    // Hex directs
    .replace(/#2563EB/g, main)
    .replace(/#1D4ED8/g, dark)
    .replace(/#3B82F6/g, light)
    // rgba main (37,99,235 = #2563EB)
    .replace(/rgba\(37,99,235,/g,   `rgba(${mr},${mg},${mb},`)
    // rgba light (59,130,246 = #3B82F6)
    .replace(/rgba\(59,130,246,/g,  `rgba(${lr},${lg},${lb},`)
    // rgba dark  (29,78,216 = #1D4ED8)
    .replace(/rgba\(29,78,216,/g,   `rgba(${dr},${dg},${db},`);
}

// Extrait la couleur principale d'un HTML/CSS scrapé
// Priorité : meta theme-color → CSS custom props → boutons CTA → couleur la plus fréquente
function extractBrandColor(html) {
  if (!html) return null;

  // 1. meta theme-color
  const theme = html.match(/<meta[^>]+name=["']theme-color["'][^>]+content=["'](#[0-9a-fA-F]{6})/i)
    || html.match(/<meta[^>]+content=["'](#[0-9a-fA-F]{6})["'][^>]+name=["']theme-color["']/i);
  if (theme) return theme[1];

  // 2. CSS custom properties courantes
  const customProp = html.match(/--(?:primary|brand|main|accent|color-primary|primary-color|colour-primary)\s*:\s*(#[0-9a-fA-F]{6})/i);
  if (customProp) return customProp[1];

  // 3. background-color sur des éléments typiques de marque (nav, header, .btn, .cta, .button)
  const btnBg = html.match(/(?:\.btn[-_]?(?:primary|main)|\.cta|nav|\.header|header)[^{]*\{[^}]*background(?:-color)?\s*:\s*(#[0-9a-fA-F]{6})/i);
  if (btnBg) {
    const c = btnBg[1];
    // Ignorer le blanc, le noir et les gris
    const { r, g, b } = hexToRgb(c);
    const isGray = Math.abs(r - g) < 20 && Math.abs(g - b) < 20;
    if (!isGray && c !== '#ffffff' && c !== '#000000') return c;
  }

  // 4. Compter les hex les plus fréquents (excluant noir/blanc/gris)
  const allHex = [...html.matchAll(/#([0-9a-fA-F]{6})\b/g)].map(m => '#' + m[1].toUpperCase());
  const freq = {};
  for (const hex of allHex) {
    const { r, g, b } = hexToRgb(hex);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const isGray = Math.abs(r - g) < 22 && Math.abs(g - b) < 22;
    if (!isGray && lum > 0.1 && lum < 0.9) {
      freq[hex] = (freq[hex] || 0) + 1;
    }
  }
  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
  if (sorted.length > 0) return sorted[0][0];

  return null;
}

// ============================================================
// DONNÉES PAR SECTEUR
// ============================================================

const PHOTOS = {
  garage: [
    'https://images.unsplash.com/photo-1625047509248-ec889cbff17f?w=800&q=80',
    'https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?w=800&q=80',
    'https://images.unsplash.com/photo-1631624210938-539575f92e3c?w=800&q=80',
    'https://images.unsplash.com/photo-1609868084948-1d8ec8e9b4a8?w=800&q=80',
    'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80',
  ],
  plombier: [
    'https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=800&q=80',
    'https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=800&q=80',
    'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=800&q=80',
    'https://images.unsplash.com/photo-1621905252507-b35492cc74b4?w=800&q=80',
    'https://images.unsplash.com/photo-1574943320219-553eb213f72d?w=800&q=80',
  ],
  electricien: [
    'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=800&q=80',
    'https://images.unsplash.com/photo-1555664424-778a1e5e1b48?w=800&q=80',
    'https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=800&q=80',
    'https://images.unsplash.com/photo-1610056494249-5d7a3b379a28?w=800&q=80',
    'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80',
  ],
  restaurant: [
    'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=80',
    'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&q=80',
    'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&q=80',
    'https://images.unsplash.com/photo-1476224203421-9ac39bcb3df1?w=800&q=80',
    'https://images.unsplash.com/photo-1482275548304-a58859dc31b7?w=800&q=80',
  ],
  defaut: [
    'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&q=80',
    'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=800&q=80',
    'https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=800&q=80',
    'https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=800&q=80',
    'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=800&q=80',
  ],
};

const SERVICES = {
  garage: [
    ['Entretien & révision', 'Inspection complète 30 points, vidange, filtres et mise au point selon les normes du fabricant.'],
    ['Diagnostic électronique', 'Lecture des codes d\'erreur, rapport complet et recommandations claires avant toute intervention.'],
    ['Freins & suspension', 'Plaquettes, disques, amortisseurs — vérification complète et remplacement avec pièces de qualité.'],
    ['Pneus — vente & pose', 'Montage, équilibrage et géométrie. Vaste sélection de pneus été, hiver et quatre saisons.'],
    ['Carrosserie & débosselage', 'Réparation de dommages, peinture au teint et restauration complète de carrosserie.'],
    ['Véhicules d\'occasion', 'Sélection de véhicules inspectés, certifiés et prêts à rouler. Financement disponible.'],
  ],
  plombier: [
    ['Plomberie résidentielle', 'Installation, réparation et remplacement de robinets, tuyaux, toilettes et éviers.'],
    ['Chauffe-eau & thermopompe', 'Installation et remplacement de chauffe-eau traditionnels et sans réservoir.'],
    ['Drain français', 'Inspection, nettoyage et remplacement de drains — protégez votre fondation.'],
    ['Urgences 24h/7j', 'Intervention rapide en cas de dégât d\'eau, bris de tuyau ou fuite urgente.'],
    ['Rénovation salle de bain', 'Planification complète, plomberie et installation de tous les équipements.'],
    ['Soumission gratuite', 'Estimé détaillé, écrit et signé. Aucun frais si vous décidez de ne pas aller de l\'avant.'],
  ],
  electricien: [
    ['Installation résidentielle', 'Câblage, prises, interrupteurs et tout nouveau circuit selon les normes en vigueur.'],
    ['Tableau électrique', 'Mise aux normes, remplacement de panneaux et augmentation de capacité.'],
    ['Éclairage intérieur & extérieur', 'Installation de luminaires, spots encastrés et éclairage de sécurité.'],
    ['Chauffage électrique', 'Thermostats intelligents, plinthes et systèmes de chauffage radiant.'],
    ['Urgences 24h/7j', 'Panne de courant, court-circuit ou tout problème électrique urgent — on répond.'],
    ['Certification & inspection', 'Rapport d\'inspection complet pour vente, achat ou rénovation.'],
  ],
  restaurant: [
    ['Cuisine fraîche & locale', 'Menu élaboré avec des produits frais du Québec, renouvelé selon les saisons.'],
    ['Service en salle', 'Atmosphère chaleureuse, service attentionné et expérience mémorable à chaque visite.'],
    ['Menu du midi', 'Formules rapides et savoureuses pour la clientèle d\'affaires et les travailleurs du coin.'],
    ['Emporter & livraison', 'Commandez en ligne ou par téléphone — prêt en 20 minutes, livré chez vous.'],
    ['Réservations de groupe', 'Salles privées disponibles pour anniversaires, célébrations et repas d\'affaires.'],
    ['Traiteur & événements', 'Service traiteur complet pour vos événements corporatifs et familiaux.'],
  ],
  defaut: [
    ['Service professionnel', 'Une expertise reconnue et une approche personnalisée pour chaque client.'],
    ['Consultation gratuite', 'Premier entretien sans frais pour évaluer vos besoins et vous proposer la meilleure solution.'],
    ['Devis sur mesure', 'Estimé détaillé et transparent avant chaque intervention. Aucune surprise.'],
    ['Suivi personnalisé', 'Un interlocuteur dédié qui connaît votre dossier de A à Z.'],
    ['Intervention rapide', 'Réponse en moins de 2h et intervention dans les meilleurs délais.'],
    ['Satisfaction garantie', 'On ne part pas tant que vous n\'êtes pas entièrement satisfait.'],
  ],
};

const PRIX = {
  garage: [
    ['Vidange + inspection complète', 'Technicien qualifié, 30 points vérifiés', '89 $'],
    ['Freins (par essieu)', 'Plaquettes, disques et vérification complète', '299 – 449 $'],
    ['Diagnostic électronique', 'Lecture codes erreur, rapport complet', '120 $'],
    ['Pneus (pose x4)', 'Montage, équilibrage et valve inclus', '100 $'],
    ['Soumission', 'Estimé détaillé, écrit et signé, sans engagement', 'GRATUIT'],
  ],
  plombier: [
    ['Main-d\'œuvre', 'Technicien qualifié, déplacement &lt; 30 km inclus', '95 – 125 $/h'],
    ['Urgence 24/7', 'Intervention prioritaire, disponible en tout temps', '150 – 195 $/h'],
    ['Petits travaux', 'Réparations, ajustements et dépannages mineurs', 'Dès 150 $'],
    ['Soumission', 'Estimé détaillé, écrit et signé, sans engagement', 'GRATUIT'],
    ['Contrats résidentiels', 'Rénovations complètes — planification incluse', 'Sur devis'],
  ],
  electricien: [
    ['Inspection électrique', 'Rapport complet, recommandations incluses', '95 $'],
    ['Main-d\'œuvre', 'Électricien licencié, déplacement inclus', '90 – 120 $/h'],
    ['Urgence 24/7', 'Intervention prioritaire en tout temps', '145 – 180 $/h'],
    ['Remplacement panneau', 'Mise aux normes complète, permis inclus', 'Dès 1 200 $'],
    ['Soumission', 'Estimé détaillé, sans engagement', 'GRATUIT'],
  ],
  restaurant: [
    ['Table d\'hôte midi', 'Entrée + plat + café — du lundi au vendredi', '18 – 24 $'],
    ['À la carte', 'Sélection de plats préparés avec produits locaux', '16 – 38 $'],
    ['Menu dégustation', '5 services avec accords mets et vins', '75 $'],
    ['Traiteur (min. 20 personnes)', 'Menu personnalisé, livraison et service inclus', 'Sur devis'],
    ['Réservation de salle', 'Salle privée pour 10 à 60 personnes', 'GRATUIT'],
  ],
  defaut: [
    ['Service de base', 'Prestation standard, qualité garantie', 'Dès 75 $'],
    ['Service complet', 'Solution complète adaptée à vos besoins', 'Dès 150 $'],
    ['Forfait premium', 'Accompagnement personnalisé de A à Z', 'Sur devis'],
    ['Urgences', 'Intervention rapide — cas prioritaires', 'Sur appel'],
    ['Première consultation', 'Premier entretien sans frais', 'GRATUIT'],
  ],
};

const TABS = {
  garage: [
    { id: 'tab1', label: 'Diagnostic', title: 'Diagnostic précis avant tout', desc: 'On identifie le problème avant de toucher quoi que ce soit. Devis écrit, aucune mauvaise surprise.', feats: ['Inspection complète', 'Rapport détaillé', 'Sans frais'], visual: '🔍 Diagnostic' },
    { id: 'tab2', label: 'Réparation', title: 'Réparation avec les bonnes pièces', desc: 'On utilise uniquement des pièces de qualité, OEM ou équivalent. Chaque réparation est garantie.', feats: ['Pièces certifiées', 'Garantie travaux', 'Photos avant/après'], visual: '🔧 Réparation' },
    { id: 'tab3', label: 'Remise en route', title: 'Véhicule testé avant livraison', desc: 'Avant de vous remettre les clés, on test-roule et on vérifie chaque point de l\'intervention.', feats: ['Test-route complet', 'Rapport final', 'Suivi 30 jours'], visual: '✅ Remise en route' },
  ],
  plombier: [
    { id: 'tab1', label: 'Diagnostic', title: 'On identifie avant d\'intervenir', desc: 'Aucune intervention sans avoir compris le problème. On vous explique tout avant de commencer.', feats: ['Inspection complète', 'Rapport détaillé', 'Sans frais'], visual: '🔍 Diagnostic' },
    { id: 'tab2', label: 'Intervention', title: 'Intervention propre et rapide', desc: 'Nos techniciens arrivent avec le bon matériel. On protège vos planchers et on nettoie après.', feats: ['Matériel de qualité', 'Protection des lieux', 'Garantie travaux'], visual: '🔧 Intervention' },
    { id: 'tab3', label: 'Suivi', title: 'On reste disponibles après', desc: 'Après le travail, on est là si vous avez des questions. Un problème revient ? On revient.', feats: ['Support 30 jours', 'Garantie écrite', 'Réponse en 24h'], visual: '✅ Suivi' },
  ],
  defaut: [
    { id: 'tab1', label: 'Premier contact', title: 'Répondre vite. Écouter bien.', desc: 'On prend le temps de comprendre vos besoins avant de proposer quoi que ce soit.', feats: ['Réponse en 2h', 'Écoute active', 'Sans pression'], visual: '💬 Contact' },
    { id: 'tab2', label: 'Réalisation', title: 'On fait ce qu\'on a dit.', desc: 'Dans les délais. Avec les matériaux convenus. Aucune surprise en cours de route.', feats: ['Transparence totale', 'Délais respectés', 'Qualité garantie'], visual: '⚙️ Réalisation' },
    { id: 'tab3', label: 'Après-vente', title: 'Notre travail ne s\'arrête pas.', desc: 'On reste disponibles après la livraison. Votre satisfaction à long terme est notre priorité.', feats: ['Support inclus', 'Garantie écrite', 'Disponible'], visual: '✅ Après-vente' },
  ],
};

const HEURES = {
  garage: [['Lundi','7h30 – 17h30'],['Mardi','7h30 – 17h30'],['Mercredi','7h30 – 17h30'],['Jeudi','7h30 – 17h30'],['Vendredi','7h30 – 17h00'],['Samedi','8h00 – 12h00'],['Dimanche','Fermé']],
  plombier: [['Lundi','7h00 – 18h00'],['Mardi','7h00 – 18h00'],['Mercredi','7h00 – 18h00'],['Jeudi','7h00 – 18h00'],['Vendredi','7h00 – 17h00'],['Samedi','8h00 – 12h00'],['Dimanche','Urgences seulement']],
  electricien: [['Lundi','7h30 – 17h00'],['Mardi','7h30 – 17h00'],['Mercredi','7h30 – 17h00'],['Jeudi','7h30 – 17h00'],['Vendredi','7h30 – 16h30'],['Samedi','Sur rendez-vous'],['Dimanche','Fermé']],
  restaurant: [['Lundi','11h00 – 21h00'],['Mardi','11h00 – 21h00'],['Mercredi','11h00 – 21h00'],['Jeudi','11h00 – 22h00'],['Vendredi','11h00 – 22h00'],['Samedi','10h00 – 22h00'],['Dimanche','10h00 – 20h00']],
  defaut: [['Lundi','8h00 – 17h00'],['Mardi','8h00 – 17h00'],['Mercredi','8h00 – 17h00'],['Jeudi','8h00 – 17h00'],['Vendredi','8h00 – 16h30'],['Samedi','Sur rendez-vous'],['Dimanche','Fermé']],
};

const VALEUR_CLIENT = { garage: 350, plombier: 400, electricien: 350, restaurant: 80, defaut: 300 };

const PRENOMS = [
  { nom: 'Marie L.', initiales: 'ML' }, { nom: 'Jean-François T.', initiales: 'JT' },
  { nom: 'Nathalie B.', initiales: 'NB' }, { nom: 'Pascal R.', initiales: 'PR' },
  { nom: 'Isabelle M.', initiales: 'IM' }, { nom: 'Stéphane C.', initiales: 'SC' },
];

// ============================================================
// FONCTIONS BUILDER
// ============================================================

function slugify(str) {
  return str.toLowerCase()
    .replace(/[àáâãäå]/g, 'a').replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i').replace(/[òóôõö]/g, 'o')
    .replace(/[ùúûü]/g, 'u').replace(/[ç]/g, 'c')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function buildPhotosCarousel(photos) {
  return photos.map(p => `<img src="${p}" alt="photo" loading="lazy">`).join('') +
         photos.map(p => `<img src="${p}" alt="photo" loading="lazy">`).join('');
}

function buildTickerItems(certifs) {
  return certifs.map(c => `<div class="ticker-item">${c}</div>`).join('');
}

function buildAuditProblemes(problemes) {
  return problemes.map(p => `<div class="audit-item"><span class="icon-bad">✗</span>${p}</div>`).join('');
}

function buildServicesCards(services) {
  return services.map((s, i) => `
    <div class="service-card ani">
      <div class="service-num">0${i + 1}</div>
      <h3>${s[0]}</h3>
      <p>${s[1]}</p>
    </div>`).join('');
}

function buildTabBtns(tabs) {
  return tabs.map((t, i) => `<button class="tab-btn${i === 0 ? ' active' : ''}" data-tab="${t.id}">${t.label}</button>`).join('');
}

function buildTabPanes(tabs, ctaHref, ctaLabel) {
  return tabs.map((t, i) => `
    <div class="tab-pane${i === 0 ? ' active' : ''}" id="${t.id}">
      <div class="tab-content-text">
        <h3>${t.title}</h3>
        <p>${t.desc}</p>
        <div class="tab-features">
          ${t.feats.map(f => `<div class="tab-feature">${f}</div>`).join('')}
        </div>
        <a class="btn-secondary" href="${ctaHref}">${ctaLabel}</a>
      </div>
      <div class="tab-visual">${t.visual}</div>
    </div>`).join('');
}

function buildPrixLignes(prix) {
  return prix.map(p => `
    <tr>
      <td><span class="price-dot"></span>${p[0]}</td>
      <td style="color:var(--tx-s)">${p[1]}</td>
      <td>${p[2]}</td>
    </tr>`).join('');
}

function buildAvapBad(problemes) {
  return problemes.slice(0, 4).map(p => `<div class="avap-item"><span class="x">✗</span>${p}</div>`).join('');
}

function buildAvapGood() {
  const fixes = [
    '100% responsive — parfait sur tout écran',
    'HTTPS inclus — Google vous fait confiance',
    'Appel à l\'action visible dès l\'arrivée',
    'Design premium qui inspire confiance',
  ];
  return fixes.map(f => `<div class="avap-item"><span class="v">✓</span>${f}</div>`).join('');
}

function buildDiffCards(secteur) {
  const cards = {
    garage: [
      ['Certifié & assuré', 'Tous nos techniciens sont formés et notre atelier est entièrement assuré. Votre véhicule est entre bonnes mains.'],
      ['Devis avant intervention', 'Aucune surprise. On vous remet un devis écrit et signé avant de commencer le moindre travail.'],
      ['Pièces de qualité', 'On n\'utilise que des pièces certifiées, OEM ou équivalent. Chaque réparation est garantie.'],
      ['Transparence totale', 'Photos de l\'état avant/après, explication claire de chaque intervention. On ne vous cache rien.'],
    ],
    plombier: [
      ['Certifié RBQ', 'La licence est active et vérifiable en ligne. C\'est la première chose à demander à tout entrepreneur.'],
      ['Urgences 24/7', 'Les dégâts d\'eau n\'attendent pas. Nos techniciens non plus — intervention en moins d\'une heure.'],
      ['Soumission gratuite', 'On se déplace, on regarde, on vous donne un prix. Aucun frais si vous ne donnez pas suite.'],
      ['Assuré responsabilité civile', 'En cas de pépin, vous êtes couverts. Exigez-le de tout entrepreneur.'],
    ],
    defaut: [
      ['Expertise reconnue', 'Des années d\'expérience dans notre domaine. Une réputation bâtie un client à la fois.'],
      ['Tarifs transparents', 'Devis écrit avant chaque intervention. Aucune surprise, aucun frais caché.'],
      ['Disponibilité', 'On répond vite et on s\'organise selon vos horaires. Pas le contraire.'],
      ['Satisfaction garantie', 'On ne ferme pas le dossier tant que vous n\'êtes pas entièrement satisfait.'],
    ],
  };
  const c = cards[secteur] || cards.defaut;
  return c.map((card, i) => `
    <div class="service-card ani">
      <div class="service-num">0${i + 1}</div>
      <h3>${card[0]}</h3>
      <p>${card[1]}</p>
    </div>`).join('');
}

function buildEquipeCards(secteur, ville) {
  const equipes = {
    garage: [
      ['MO', 'Marc Ouellet', 'Maître mécanicien', 'Marc est dans le métier depuis 22 ans. Il a tout vu et surtout tout réparé. Il signe chaque chantier avec son nom.'],
      ['DS', 'David Simard', 'Technicien senior', 'David se spécialise en diagnostic électronique. Si un problème ne se voit pas à l\'œil nu, c\'est lui qu\'on appelle.'],
      ['LB', 'Louise Bouchard', 'Service à la clientèle', 'Louise coordonne les rendez-vous et vous tient informé à chaque étape. Pas de surprise, pas d\'attente inutile.'],
    ],
    plombier: [
      ['MO', 'Marc Ouellet', 'Maître plombier', 'Marc est dans le métier depuis 20 ans. Il connaît les codes, les matériaux, les pièges à éviter.'],
      ['DS', 'David Simard', 'Technicien senior', 'David a tout fait : résidentiel, commercial, rénovation, construction neuve. Il anticipe les problèmes avant qu\'ils arrivent.'],
      ['LB', 'Louise Bouchard', 'Coordination & devis', 'Louise planifie les chantiers, gère les délais et vous tient informé. Si quelque chose change, vous êtes le premier à le savoir.'],
    ],
    defaut: [
      ['MO', 'Marc Ouellet', 'Directeur technique', 'Marc supervise toutes les interventions. Son nom est associé à chaque projet — ça l\'engage personnellement.'],
      ['DS', 'David Simard', 'Technicien principal', 'David s\'occupe des dossiers complexes. Sa méthode : comprendre avant d\'agir.'],
      ['LB', 'Louise Bouchard', 'Coordination client', 'Louise est votre interlocutrice principale. Elle connaît votre dossier et vous tient informé à chaque étape.'],
    ],
  };
  const eq = equipes[secteur] || equipes.defaut;
  return eq.map(e => `
    <div class="equipe-card ani">
      <div class="equipe-avatar">${e[0]}</div>
      <h3>${e[1]}</h3>
      <div class="equipe-poste">${e[2]}</div>
      <p class="equipe-bio">${e[3]}</p>
    </div>`).join('');
}

function buildTemoignages(secteur, ville) {
  const quotes = {
    garage: [
      'Devis clair, travail fait comme promis, voiture prête à l\'heure. C\'est tout ce que je demande.',
      'J\'avais peur que ça coûte une fortune. Le prix était honnête et expliqué avant qu\'ils touchent à quoi que ce soit.',
      'Problème diagnostiqué en 20 minutes. Réparé dans l\'après-midi. Garantie incluse. Je reviendrai.',
      'Le seul garage où on m\'explique vraiment ce qui ne va pas, sans jargon et sans me prendre pour un portefeuille.',
      'Mon auto fait enfin comme neuf. Et le prix était bien en dessous de ce que j\'anticipais.',
      'Pneus changés en une heure. Personnel sympathique. Stationnement propre. Recommande sans hésiter.',
    ],
    plombier: [
      'Urgence un dimanche soir — ils ont répondu en 20 minutes et réglé le problème en une heure.',
      'Deuxième fois que je fais affaire avec eux. Même sérieux, même qualité, même prix.',
      'Ils sont arrivés à l\'heure. Ont fait le travail proprement. M\'ont expliqué ce qu\'ils avaient changé.',
      'J\'avais peur que ça coûte une fortune. Le prix était raisonnable et clairement expliqué avant l\'intervention.',
      'Mon drain français était bouché depuis des années. Réglé en une journée. J\'aurais dû appeler bien avant.',
      'Ils ont fait exactement ce qu\'ils avaient dit. Ni plus, ni moins — mais vraiment proprement.',
    ],
    defaut: [
      'Professionnel, ponctuel et transparent. Exactement ce qu\'on cherche.',
      'J\'ai rappelé deux semaines après avec une question. Réponse en moins d\'une heure. C\'est rare.',
      'Prix annoncé = prix facturé. Travail fait dans les délais. Que demander de plus?',
      'Équipe sérieuse qui ne survend pas. On nous propose ce dont on a besoin, pas le maximum possible.',
      'Problème réglé du premier coup. Explication claire. Aucun retour nécessaire.',
      'Je les recommande à tous mes collègues. Service à la clientèle comme on n\'en voit plus souvent.',
    ],
  };
  const q = quotes[secteur] || quotes.defaut;
  return PRENOMS.map((p, i) => `
    <div class="temo-card ani">
      <div class="temo-stars">★★★★★</div>
      <p class="temo-quote">${q[i]}</p>
      <div class="temo-author">
        <div class="temo-avatar">${p.initiales}</div>
        <div>
          <div class="temo-name">${p.nom}</div>
          <div class="temo-loc">${ville}, QC</div>
        </div>
      </div>
    </div>`).join('');
}

function buildHeures(heures) {
  return heures.map(h => `
    <div class="heure-row">
      <span class="jour">${h[0]}</span>
      <span class="heure">${h[1]}</span>
    </div>`).join('');
}

function buildGalerie(photos) {
  return [...photos, photos[0]].map((p, i) => `
    <div class="galerie-item ani">
      <img src="${p}" alt="réalisation ${i + 1}" loading="lazy">
      <div class="galerie-overlay">⤢</div>
    </div>`).join('');
}

// ============================================================
// FONCTION PRINCIPALE
// ============================================================

async function generate(data) {
  const {
    nom,
    nomCourt,
    secteur: secteurRaw,
    ville,
    adresse,
    telephone,
    description,
    anneeFondation,
    avisGoogle,
    avisCount,
    certifications = [],
    auditProblemes = [],
    auditScore,
    brandColor,        // Hex du logo/site ex: '#D4141C' — optionnel, sinon bleu par défaut
  } = data;

  // Normaliser le secteur
  const secteurMap = {
    garage: 'garage', mécanique: 'garage', mechanique: 'garage', auto: 'garage', automobile: 'garage',
    plombier: 'plombier', plomberie: 'plombier',
    électricien: 'electricien', electricien: 'electricien', électricité: 'electricien',
    restaurant: 'restaurant', café: 'restaurant', cafe: 'restaurant', brasserie: 'restaurant',
  };
  const secteur = secteurMap[secteurRaw?.toLowerCase()] || 'defaut';

  const photos = PHOTOS[secteur] || PHOTOS.defaut;
  const ctaHref = telephone
    ? `tel:+1${telephone.replace(/\D/g, '')}`
    : `mailto:elliot@novalisia.ca?subject=Site web - ${encodeURIComponent(nom)}`;
  const ctaLabel = telephone ? 'Appeler maintenant' : 'Nous contacter';

  // Ticker certifications
  const tickerItems = [
    ...certifications,
    'Devis gratuit',
    'Satisfaction garantie',
    anneeFondation ? `En affaires depuis ${anneeFondation}` : 'Expérience reconnue',
    `${ville}, Québec`,
  ];

  // Audit problèmes — minimum 4
  const fallbackProblemes = [
    'Site non adapté aux téléphones mobiles — 68% des recherches se font sur mobile',
    'Pas de certificat HTTPS — Google affiche «non sécurisé»',
    'Aucun appel à l\'action visible au premier coup d\'œil',
    'Design daté qui nuit à votre crédibilité en ligne',
    'Pas de section témoignages clients vérifiés',
  ];
  const problemesFinaux = [...new Set([...auditProblemes, ...fallbackProblemes])].slice(0, 5);

  const score = auditScore || Math.max(1, 5 - problemesFinaux.length + 1);
  const verdict = score <= 2 ? 'À refaire' : score === 3 ? 'Améliorable' : 'Passable';

  const accroches = {
    garage: `78% des recherches de mécanicien à ${ville} se font sur téléphone. Votre site les perd tous.`,
    plombier: `78% des recherches de plombier à ${ville} se font sur téléphone. Votre site actuel les laisse partir chez vos concurrents.`,
    defaut: `Chaque visiteur qui repart sans vous contacter est un client perdu. Ça arrive plus souvent que vous le pensez.`,
  };

  const heroH1 = {
    garage: [`Mécanicien de confiance à ${ville} —`, anneeFondation ? `Expertise & transparence depuis ${anneeFondation}` : 'Expertise & transparence garanties'],
    plombier: [`Plombier certifié RBQ à ${ville} —`, 'Urgences 24h/7j · Soumission gratuite'],
    electricien: [`Électricien licencié à ${ville} —`, 'Rapide, fiable et garanti'],
    restaurant: [`Cuisine fraîche & authentique à ${ville}`, 'Saveurs locales, service chaleureux'],
    defaut: [`${nomCourt} à ${ville} —`, 'Service professionnel & satisfaction garantie'],
  };

  const tabs = TABS[secteur] || TABS.defaut;

  // Lire le template
  const templatePath = path.join(__dirname, 'template', 'template.html');
  let html = fs.readFileSync(templatePath, 'utf8');

  const replacements = {
    '{{NOM}}': nom,
    '{{NOM_COURT}}': nomCourt || nom.split(' ').slice(0, 2).join(' '),
    '{{VILLE}}': ville,
    '{{META_DESCRIPTION}}': `${nom} — ${secteurRaw} à ${ville}. Service professionnel, ${certifications[0] || 'qualité garantie'}. Contactez-nous.`,
    '{{CTA_HREF}}': ctaHref,
    '{{CTA_LABEL}}': ctaLabel,
    '{{TELEPHONE}}': telephone || 'elliot@novalisia.ca',
    '{{ADRESSE}}': adresse || ville + ', Québec',
    '{{AVIS_GOOGLE}}': avisGoogle || 'Avis clients vérifiés',
    '{{AVIS_COUNT}}': String(avisCount || 50),
    '{{ANNEE_FONDATION}}': String(anneeFondation || new Date().getFullYear() - 15),
    '{{HERO_H1_LIGNE1}}': (heroH1[secteur] || heroH1.defaut)[0],
    '{{HERO_H1_LIGNE2}}': (heroH1[secteur] || heroH1.defaut)[1],
    '{{HERO_SOUS_TITRE}}': `${description?.split('.')[0] || `Service professionnel à ${ville}`}.`,
    '{{PHOTOS_CAROUSEL}}': buildPhotosCarousel(photos),
    '{{PHOTO_3}}': photos[2],
    '{{TICKER_ITEMS}}': buildTickerItems(tickerItems),
    '{{AUDIT_ACCROCHE}}': accroches[secteur] || accroches.defaut,
    '{{AUDIT_SCORE}}': String(score),
    '{{AUDIT_VERDICT}}': verdict,
    '{{AUDIT_PROBLEMES}}': buildAuditProblemes(problemesFinaux),
    '{{SERVICES_CARDS}}': buildServicesCards(SERVICES[secteur] || SERVICES.defaut),
    '{{TAB_BTNS}}': buildTabBtns(tabs),
    '{{TAB_PANES}}': buildTabPanes(tabs, ctaHref, ctaLabel),
    '{{PRIX_LIGNES}}': buildPrixLignes(PRIX[secteur] || PRIX.defaut),
    '{{PRIX_NOTE}}': secteur === 'plombier'
      ? 'TPS/TVQ en sus · Soumission écrite gratuite · Déplacement inclus dans un rayon de 30 km'
      : 'TPS/TVQ en sus · Devis gratuit disponible sur demande',
    '{{AVAP_BAD}}': buildAvapBad(problemesFinaux),
    '{{AVAP_GOOD}}': buildAvapGood(),
    '{{DIFF_CARDS}}': buildDiffCards(secteur),
    '{{EQUIPE_CARDS}}': buildEquipeCards(secteur, ville),
    '{{DESCRIPTION}}': description || `${nom} est une entreprise de ${secteurRaw} établie à ${ville}. Nous offrons des services professionnels de qualité avec une approche centrée sur la satisfaction du client.`,
    '{{APROPOS_INFOS}}': [
      adresse ? `<div class="apropos-info">${adresse}</div>` : '',
      telephone ? `<div class="apropos-info">${telephone}</div>` : '',
      anneeFondation ? `<div class="apropos-info">En affaires depuis ${anneeFondation}</div>` : '',
    ].filter(Boolean).join('\n'),
    '{{HEURES}}': buildHeures(HEURES[secteur] || HEURES.defaut),
    '{{GALERIE}}': buildGalerie(photos),
    '{{TEMOIGNAGES}}': buildTemoignages(secteur, ville),
    '{{VALEUR_CLIENT}}': String(VALEUR_CLIENT[secteur] || VALEUR_CLIENT.defaut),
  };

  for (const [key, value] of Object.entries(replacements)) {
    html = html.split(key).join(value || '');
  }

  // Appliquer la couleur du logo sur tout le HTML
  html = applyBrandColor(html, brandColor);

  // Vérifier les variables non remplacées
  const remaining = html.match(/\{\{[A-Z_]+\}\}/g);
  if (remaining) {
    console.warn('⚠️  Variables non remplacées:', [...new Set(remaining)].join(', '));
  }

  // Sauvegarder
  const slug = slugify(nom);
  const outputDir = path.join(__dirname, 'output');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, `${slug}.html`);
  fs.writeFileSync(outputPath, html, 'utf8');
  const colorUsed = brandColor ? ensureVibrancy(brandColor) : '#2563EB (défaut)';
  console.log(`✅ Site généré : output/${slug}.html  •  couleur: ${colorUsed}`);

  return { slug, outputPath };
}

module.exports = { generate, extractBrandColor, applyBrandColor };
