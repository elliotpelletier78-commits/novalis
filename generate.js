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

// Extrait les URLs d'images du HTML scrapé du site client
function extractSitePhotos(html) {
  if (!html) return [];
  const seen = new Set();
  const photos = [];
  const imgSrcs = [...html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map(m => m[1]);
  const bgUrls = [...html.matchAll(/url\(["']?([^"')]+\.(?:jpg|jpeg|png|webp)[^"')?]*)["']?\)/gi)].map(m => m[1]);
  for (const src of [...imgSrcs, ...bgUrls]) {
    if (!src || src.startsWith('data:') || seen.has(src)) continue;
    if (/logo|icon|sprite|thumb|avatar|badge|favicon/i.test(src)) continue;
    if (/\.(gif|svg)$/i.test(src)) continue;
    seen.add(src);
    photos.push(src);
    if (photos.length >= 4) break;
  }
  return photos;
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
    ['Interventions d\'urgence', 'Dégât d\'eau, bris de tuyau, fuite : on intervient rapidement.'],
    ['Rénovation salle de bain', 'Planification complète, plomberie et installation de tous les équipements.'],
    ['Soumission gratuite', 'Estimé détaillé, écrit et signé. Aucun frais si vous décidez de ne pas aller de l\'avant.'],
  ],
  electricien: [
    ['Installation résidentielle', 'Câblage, prises, interrupteurs et tout nouveau circuit selon les normes en vigueur.'],
    ['Tableau électrique', 'Mise aux normes, remplacement de panneaux et augmentation de capacité.'],
    ['Éclairage intérieur & extérieur', 'Installation de luminaires, spots encastrés et éclairage de sécurité.'],
    ['Chauffage électrique', 'Thermostats intelligents, plinthes et systèmes de chauffage radiant.'],
    ['Interventions d\'urgence', 'Panne, court-circuit ou problème électrique urgent : on répond.'],
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
  salon: [
    ['Coupe & style', 'Consultation incluse. On adapte la coupe à votre visage, votre mode de vie et vos préférences.'],
    ['Coloration', 'Techniques modernes et produits haut de gamme. Résultat naturel ou audacieux — c\'est vous qui décidez.'],
    ['Soins capillaires', 'Traitements réparateurs, hydratants ou lissants. Pour des cheveux en santé à long terme.'],
    ['Mèches & balayage', 'Balayage naturel, mèches lumineuses ou ombré. Des nuances qui magnifient votre couleur de base.'],
    ['Coiffure événement', 'Mariage, galas, occasions spéciales. Une coiffure pensée pour durer toute la soirée.'],
    ['Soins esthétiques', 'Manucure, pédicure et soins du visage. Une expérience complète en un seul endroit.'],
  ],
  health: [
    ['Médecine générale', 'Suivi régulier, bilans de santé et prise en charge des maladies courantes.'],
    ['Consultations spécialisées', 'Accès rapide aux spécialistes partenaires selon vos besoins spécifiques.'],
    ['Prévention & dépistage', 'Tests, vaccins et programmes de prévention pour rester en bonne santé.'],
    ['Suivi chronique', 'Accompagnement des maladies chroniques avec des rendez-vous adaptés à votre rythme.'],
    ['Téléconsultation', 'Consultation vidéo en moins de 24h pour les cas non urgents. Ordonnance électronique disponible.'],
    ['Médecine du travail', 'Évaluation et certificats médicaux pour vos démarches professionnelles.'],
  ],
  construction: [
    ['Rénovation résidentielle', 'Cuisine, salle de bain, sous-sol — rénovations complètes clés en main.'],
    ['Construction neuve', 'Planification, fondation, charpente et finitions. On bâtit de A à Z.'],
    ['Toiture & bardage', 'Remplacement, réparation et inspection. Protection durable contre les éléments.'],
    ['Menuiserie & charpente', 'Structures bois, pergolas, decks et escaliers. Travail précis, matériaux de qualité.'],
    ['Rénovation commerciale', 'Aménagement de bureaux, commerces et espaces professionnels.'],
    ['Estimation gratuite', 'Visite sur place, écoute de vos besoins et devis détaillé sans engagement.'],
  ],
  fitness: [
    ['Entraînement personnel', 'Programme sur mesure avec un entraîneur dédié. Objectifs clairs, progression mesurée.'],
    ['Cours collectifs', 'Yoga, HIIT, spinning, Pilates — des cours adaptés à tous les niveaux.'],
    ['Bilan fitness', 'Évaluation complète de votre condition physique et définition d\'objectifs réalistes.'],
    ['Nutrition & performance', 'Conseils nutritionnels intégrés à votre programme d\'entraînement.'],
    ['Accès libre', 'Équipements disponibles 7j/7 pour un entraînement à votre propre rythme.'],
    ['Programme en ligne', 'Plans d\'entraînement personnalisés accessibles depuis votre téléphone, partout.'],
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
    ['Intervention d\'urgence', 'Prioritaire, on se déplace au plus vite', '150 – 195 $/h'],
    ['Petits travaux', 'Réparations, ajustements et dépannages mineurs', 'Dès 150 $'],
    ['Soumission', 'Estimé détaillé, écrit et signé, sans engagement', 'GRATUIT'],
    ['Contrats résidentiels', 'Rénovations complètes — planification incluse', 'Sur devis'],
  ],
  electricien: [
    ['Inspection électrique', 'Rapport complet, recommandations incluses', '95 $'],
    ['Main-d\'œuvre', 'Électricien licencié, déplacement inclus', '90 – 120 $/h'],
    ['Intervention d\'urgence', 'Prioritaire, on se déplace au plus vite', '145 – 180 $/h'],
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
  salon: [
    ['Coupe femme', 'Shampoing, coupe, brushing et style inclus', '65 – 95 $'],
    ['Coupe homme', 'Shampoing, coupe et finition', '35 – 55 $'],
    ['Coloration complète', 'Produits haut de gamme, application et finition', '120 – 185 $'],
    ['Balayage / mèches', 'Technique personnalisée selon votre type de cheveux', '140 – 220 $'],
    ['Traitement soin', 'Masque, kératine ou lissage express', '55 – 95 $'],
  ],
  health: [
    ['Consultation générale', 'Durée 20 min — bilan ou suivi régulier', '115 $'],
    ['Consultation longue', 'Durée 40 min — cas complexes ou bilans complets', '185 $'],
    ['Téléconsultation', 'Vidéo 15 min — renouvellement ou avis rapide', '85 $'],
    ['Bilan complet', 'Examen + analyses + rapport écrit', '225 $'],
    ['Urgence même jour', 'Rendez-vous prioritaire — disponibilité limitée', 'Selon acte'],
  ],
  construction: [
    ['Main-d\'œuvre', 'Équipe qualifiée, selon complexité des travaux', '75 – 95 $/h'],
    ['Rénovation salle de bain', 'Démolition, plomberie, carrelage, finitions', 'Dès 8 500 $'],
    ['Toiture complète', 'Dépose, isolant, couverture neuve, finition', 'Sur devis'],
    ['Sous-sol aménagé', 'Cloisons, électricité, plancher, peinture', 'Dès 22 000 $'],
    ['Estimation', 'Visite sur place et devis détaillé sans engagement', 'GRATUIT'],
  ],
  fitness: [
    ['Abonnement mensuel', 'Accès complet à tous les équipements et cours', '59 $/mois'],
    ['Abonnement annuel', 'Meilleur tarif, sans engagement mensuel', '39 $/mois'],
    ['Entraîneur personnel', 'Programme sur mesure + 4 séances encadrées', '299 $/mois'],
    ['Évaluation fitness', 'Bilan complet + plan d\'action personnalisé', '75 $'],
    ['Cours collectifs', 'Accès illimité inclus avec tout abonnement', 'INCLUS'],
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
  salon: [['Lundi','9h00 – 19h00'],['Mardi','9h00 – 19h00'],['Mercredi','9h00 – 19h00'],['Jeudi','9h00 – 20h00'],['Vendredi','9h00 – 18h00'],['Samedi','8h30 – 17h00'],['Dimanche','Fermé']],
  health: [['Lundi','8h00 – 17h30'],['Mardi','8h00 – 17h30'],['Mercredi','8h00 – 17h30'],['Jeudi','8h00 – 17h30'],['Vendredi','8h00 – 16h30'],['Samedi','9h00 – 12h00'],['Dimanche','Fermé']],
  construction: [['Lundi','7h00 – 17h00'],['Mardi','7h00 – 17h00'],['Mercredi','7h00 – 17h00'],['Jeudi','7h00 – 17h00'],['Vendredi','7h00 – 16h00'],['Samedi','Sur rendez-vous'],['Dimanche','Fermé']],
  fitness: [['Lundi','5h30 – 23h00'],['Mardi','5h30 – 23h00'],['Mercredi','5h30 – 23h00'],['Jeudi','5h30 – 23h00'],['Vendredi','5h30 – 22h00'],['Samedi','7h00 – 21h00'],['Dimanche','8h00 – 20h00']],
  defaut: [['Lundi','8h00 – 17h00'],['Mardi','8h00 – 17h00'],['Mercredi','8h00 – 17h00'],['Jeudi','8h00 – 17h00'],['Vendredi','8h00 – 16h30'],['Samedi','Sur rendez-vous'],['Dimanche','Fermé']],
};

const VALEUR_CLIENT = { garage: 350, plombier: 400, electricien: 350, restaurant: 80, salon: 120, health: 180, construction: 8000, fitness: 60, defaut: 300 };

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
      ['Devis clair, sans surprise', 'Le prix est annoncé et expliqué avant qu\'on touche à quoi que ce soit.'],
      ['Intervention rapide', 'Les dégâts d\'eau n\'attendent pas : on se déplace au plus vite.'],
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

// Échappement HTML minimal — le contenu réel du commerce (avis, auteurs) passe
// par ici avant d'entrer dans le HTML.
function escHtml(x) {
  return String(x == null ? '' : x)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const LABEL_SECTEUR = { garage: 'Garage', plombier: 'Plomberie', electricien: 'Électricité',
  restaurant: 'Restaurant', salon: 'Salon', health: 'Clinique', construction: 'Construction',
  fitness: 'Entraînement', defaut: 'Service local' };

// Badge du héros — HONNÊTE. Étoiles + note UNIQUEMENT si la note est réelle
// (extraite du vrai profil Google). Sinon : secteur + ville, deux faits vrais,
// jamais d'étoiles ni de compte inventés.
function buildHeroBadge(secteur, ville, opts = {}) {
  const note = parseFloat(opts.avisGoogle); const n = parseInt(opts.avisCount, 10);
  const v = escHtml(ville || 'Québec');
  if (Number.isFinite(note) && note > 0 && note <= 5) {
    const full = Math.round(note);
    const stars = '★'.repeat(full) + '☆'.repeat(Math.max(0, 5 - full));
    const cnt = Number.isInteger(n) && n > 0 ? ` · ${n} avis Google` : ' · Google';
    return `<span class="stars">${stars}</span><span>${note.toFixed(1)}${cnt} · ${v}, Québec</span>`;
  }
  return `<span>${escHtml(LABEL_SECTEUR[secteur] || LABEL_SECTEUR.defaut)} · ${v}, Québec</span>`;
}

// Stats du héros — HONNÊTES. Secteur + ville (toujours vrais), plus la note et
// l'année de fondation SEULEMENT si elles sont réelles. Fini le « 50 avis »,
// le « 24/7 » et le « en affaires depuis 2011 » inventés pour tout le monde.
function buildHeroStats(secteur, ville, opts = {}) {
  const cartes = [];
  const v = escHtml(ville || 'Québec');
  cartes.push(`<div class="stat-badge"><span class="stat-num">${escHtml(LABEL_SECTEUR[secteur] || LABEL_SECTEUR.defaut)}</span><span class="stat-lbl">${v}, QC</span></div>`);
  const note = parseFloat(opts.avisGoogle); const n = parseInt(opts.avisCount, 10);
  if (Number.isFinite(note) && note > 0 && note <= 5) {
    cartes.push(`<div class="stat-badge feat"><span class="stat-num">${note.toFixed(1)} ★</span><span class="stat-lbl">${Number.isInteger(n) && n > 0 ? n + ' avis Google' : 'Avis Google'}</span></div>`);
  }
  const an = parseInt(opts.anneeFondation, 10);
  if (Number.isInteger(an) && an > 1900 && an <= new Date().getFullYear()) {
    cartes.push(`<div class="stat-badge"><span class="stat-num">${an}</span><span class="stat-lbl">En affaires</span></div>`);
  }
  return cartes.join('\n    ');
}

// Témoignages — HONNÊTES. Les VRAIS avis du commerce quand on les a (extraits
// de sa présence en ligne) ; sinon, on n'INVENTE RIEN : on montre la vraie note
// Google si elle existe, et un état « vos avis s'afficheront ici ». Jamais de
// faux noms ni de fausses citations sous le nom d'une vraie entreprise.
function buildTemoignages(secteur, ville, opts = {}) {
  const v = escHtml(ville || 'Québec');
  const avis = (Array.isArray(opts.avis) ? opts.avis : [])
    .map(a => (typeof a === 'string' ? { text: a } : a))
    .filter(a => a && (a.text || a.texte) && String(a.text || a.texte).trim().length > 15)
    .slice(0, 6);

  if (avis.length) {
    return avis.map(a => {
      const texte = escHtml(String(a.text || a.texte).replace(/\s+/g, ' ').trim().slice(0, 400));
      const auteurBrut = (a.author || a.auteur || '').toString().trim();
      const auteur = auteurBrut ? escHtml(auteurBrut.slice(0, 60)) : 'Avis Google';
      const init = (auteur.match(/[A-Za-zÀ-ſ]/g) || ['A']).slice(0, 2).join('').toUpperCase();
      return `
    <div class="temo-card ani">
      <div class="temo-stars">★★★★★</div>
      <p class="temo-quote">${texte}</p>
      <div class="temo-author">
        <div class="temo-avatar">${init}</div>
        <div>
          <div class="temo-name">${auteur}</div>
          <div class="temo-loc">${v}, QC</div>
        </div>
      </div>
    </div>`;
    }).join('');
  }

  // Aucun avis réel : état honnête, sans fabrication.
  const note = parseFloat(opts.avisGoogle); const n = parseInt(opts.avisCount, 10);
  const badge = (Number.isFinite(note) && note > 0 && note <= 5)
    ? `<div style="display:inline-flex;align-items:baseline;gap:10px;margin-bottom:14px">
        <span style="font-size:42px;font-weight:800;line-height:1">${note.toFixed(1)}</span>
        <span style="color:#f5a623;font-size:22px;letter-spacing:2px">★★★★★</span>
        <span style="opacity:.7">${Number.isInteger(n) && n > 0 ? n + ' avis Google' : 'sur Google'}</span>
      </div>`
    : '';
  return `<div class="temo-card ani" style="grid-column:1/-1;text-align:center;padding:34px 24px">
    ${badge}
    <p class="temo-quote" style="max-width:52ch;margin:0 auto;opacity:.85">Les avis de vos clients s'afficheront ici, directement depuis votre fiche Google.</p>
  </div>`;
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

// ── Données cinématiques par secteur ───────────────────────

// Photos progression: extérieur → approche → intérieur → action/détail
const CINEMATIC_SCENE_PHOTOS = {
  garage: [
    'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1600&q=85',   // extérieur garage
    'https://images.unsplash.com/photo-1625047509248-ec889cbff17f?w=1600&q=85', // intérieur garage, voitures
    'https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?w=1600&q=85', // mécanicien au travail
    'https://images.unsplash.com/photo-1534093607318-aaff814b9e85?w=1600&q=85', // moteur / détail
  ],
  salon: [
    'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?w=1600&q=85', // extérieur salon / vitrine
    'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=1600&q=85',    // intérieur salon
    'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=1600&q=85', // coiffeuse au travail
    'https://images.unsplash.com/photo-1562322140-8baeececf3df?w=1600&q=85',    // détail coupe / résultat
  ],
  health: [
    'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=1600&q=85', // extérieur clinique
    'https://images.unsplash.com/photo-1631217868264-e5b90bb7e133?w=1600&q=85', // réception / couloir
    'https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=1600&q=85', // salle de consultation
    'https://images.unsplash.com/photo-1584982751601-97dea52dbe35?w=1600&q=85', // médecin avec patient
  ],
  construction: [
    'https://images.unsplash.com/photo-1558618047-3c8c76ca7d13?w=1600&q=85',    // maison / projet fini
    'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=1600&q=85', // chantier actif
    'https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=1600&q=85', // équipe sur le terrain
    'https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=1600&q=85', // finitions / détail
  ],
  fitness: [
    'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1600&q=85', // façade / entrée gym
    'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=1600&q=85', // plancher du gym
    'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=1600&q=85', // entraînement
    'https://images.unsplash.com/photo-1581009137042-c552e485697a?w=1600&q=85', // effort / détermination
  ],
};

// Moments poétiques pour chaque plan de la progression (approche → intérieur → action)
const CINEMATIC_POETICS = {
  garage: [
    { line: 'On lève le rideau.', sub: 'Ici, on ne touche à rien sans vous avoir tout expliqué d\'abord.' },
    { line: 'Les mains parlent,<br>les chiffres confirment.', sub: 'Chaque pièce a son rôle. Chaque geste, sa raison.' },
    { line: 'Votre véhicule<br>repart comme prévu.', sub: 'Devis honnête, travail garanti. Aucune mauvaise surprise.' },
  ],
  salon: [
    { line: 'On entre.', sub: 'Derrière cette porte — votre heure. Rien d\'autre ne compte.' },
    { line: 'L\'espace respire.', sub: 'Pensé pour que vous vous sentiez bien dès le premier regard.' },
    { line: 'Le geste précis,<br>le résultat juste.', sub: 'Des années de métier dans chaque coupe. Une attention sincère.' },
  ],
  health: [
    { line: 'On vous reçoit.', sub: 'Sans précipitation. Parce que votre temps — et votre santé — ont de la valeur.' },
    { line: 'Avant de traiter,<br>on écoute.', sub: 'Un diagnostic clair. Une approche honnête. Un suivi sans ambiguïté.' },
    { line: 'Votre santé<br>mérite une vraie attention.', sub: 'Pas un numéro. Un accompagnement humain et rigoureux.' },
  ],
  construction: [
    { line: 'Le chantier commence.', sub: 'Planifié à la journée. Chaque étape communiquée à l\'avance.' },
    { line: 'Les bonnes mains,<br>les bons matériaux.', sub: 'On bâtit avec le même soin que si c\'était chez nous.' },
    { line: 'Ce qui est promis<br>se retrouve dans les plans.', sub: 'Délais tenus, finitions soignées, garantie écrite.' },
  ],
  fitness: [
    { line: 'On entre.', sub: 'L\'air change. Le rythme aussi. C\'est fait pour ça.' },
    { line: 'L\'espace pour<br>aller plus loin.', sub: 'Équipé pour performer. Pensé pour progresser.' },
    { line: 'Chaque séance<br>a un objectif.', sub: 'Entraînement structuré, suivi personnalisé, résultats mesurables.' },
  ],
};

const CINEMATIC_SECTOR_LABELS = {
  garage: 'Garage automobile',
  salon: 'Salon de coiffure & beauté',
  health: 'Clinique médicale',
  construction: 'Construction & rénovation',
  fitness: 'Centre d\'entraînement',
};

const CINEMATIC_HEADINGS = {
  garage: 'Un atelier qui <em>tient parole.</em>',
  salon: 'Un soin qui <em>vous ressemble.</em>',
  health: 'Une clinique qui <em>vous écoute.</em>',
  construction: 'Un chantier qui <em>respecte votre maison.</em>',
  fitness: 'Un espace fait pour <em>aller plus loin.</em>',
};

const CINEMATIC_DESCRIPTIONS = {
  garage: (nom, ville) => `${nom} est un garage de confiance à ${ville}. Devis honnête, pièces de qualité, techniciens certifiés. Votre véhicule repart dans les meilleures conditions — et vous le savez d'avance.`,
  salon: (nom, ville) => `${nom} est un salon haut de gamme à ${ville}. Un espace pensé pour vous faire sentir bien, avec une équipe qui écoute et un résultat qui vous ressemble.`,
  health: (nom, ville) => `${nom} est une clinique médicale à ${ville}. Une approche humaine et rigoureuse, des rendez-vous rapides et un suivi personnalisé pour chaque patient.`,
  construction: (nom, ville) => `${nom} est une entreprise de construction établie à ${ville}. Des projets livrés dans les temps, des budgets respectés et une qualité d'exécution qui parle d'elle-même.`,
  fitness: (nom, ville) => `${nom} est un centre d'entraînement à ${ville}. Équipements professionnels, entraîneurs certifiés et un environnement conçu pour performer et progresser.`,
};

function buildJourneySlides(secteur, { nom, nomCourt, ville, adresse, telephone, sitePhotos }) {
  const addr = adresse || `${ville}, Québec`;
  const tel  = telephone || '';
  const defaultPhotos = CINEMATIC_SCENE_PHOTOS[secteur] || CINEMATIC_SCENE_PHOTOS.garage;
  // Si le client a ses propres photos, les utiliser en priorité pour les 2 premiers plans
  const photos = (sitePhotos && sitePhotos.length >= 2)
    ? [...sitePhotos.slice(0, 2), ...defaultPhotos.slice(2, 4)]
    : defaultPhotos;

  const poetics = CINEMATIC_POETICS[secteur] || CINEMATIC_POETICS.garage;
  const label   = CINEMATIC_SECTOR_LABELS[secteur] || 'Service professionnel';
  const N       = 1 + poetics.length;

  const heroSlide = `<div class="jslide" data-n="0">
  <img class="jslide-bg" src="${photos[0]}" loading="eager" alt="${nom}">
  <div class="jslide-over"></div>
  <div class="jslide-body">
    <span class="jslide-eyebrow">${addr}</span>
    <h1 class="jslide-head">${nomCourt}<br><em>— ${label}</em></h1>
    <p class="jslide-sub">${label} · ${ville}, Québec</p>
  </div>
  ${tel ? `<span class="jslide-tel">${tel}</span>` : ''}
</div>`;

  const momentSlides = poetics.map((p, i) => `<div class="jslide" data-n="${i + 1}">
  <img class="jslide-bg" src="${photos[i + 1] || photos[0]}" loading="lazy" alt="${nom}">
  <div class="jslide-over"></div>
  <div class="jslide-body">
    <span class="jslide-eyebrow">${addr}</span>
    <h2 class="jslide-head">${p.line}</h2>
    <p class="jslide-sub">${p.sub}</p>
  </div>
  ${tel ? `<span class="jslide-tel">${tel}</span>` : ''}
</div>`).join('\n');

  return `<section class="journey" id="j">
  <div class="j-stick">
    <div class="j-reveal"></div>
    ${heroSlide}
    ${momentSlides}
    <div class="j-dots" id="jdots"></div>
    <div class="j-num"><span id="jcur">01</span><span class="j-sep"> / </span><span id="jtot">${String(N).padStart(2,'0')}</span></div>
    <div class="j-hint"><span class="j-hint-label">Défiler</span><div class="j-hint-line"></div></div>
  </div>
</section>`;
}

const CINEMATIC_FEATURES = {
  garage: [
    ['Devis avant intervention', 'Estimé écrit et signé. Aucun travail commencé sans votre accord.'],
    ['Pièces certifiées', 'OEM ou équivalent approuvé. Chaque réparation est garantie par écrit.'],
    ['Techniciens qualifiés', 'Formation continue, outillage de pointe. Votre véhicule entre de bonnes mains.'],
    ['Délais respectés', 'On confirme un horaire et on le tient. Votre temps a de la valeur.'],
  ],
  salon: [
    ['Consultation gratuite', 'On prend le temps de comprendre vos attentes avant de commencer.'],
    ['Produits professionnels', 'Gammes sélectionnées pour leur efficacité et leur respect de vos cheveux.'],
    ['Atmosphère apaisante', 'Un espace conçu pour que vous vous sentiez bien dès l\'entrée.'],
    ['Expertise certifiée', 'Des années de formation et de perfectionnement derrière chaque geste.'],
  ],
  health: [
    ['Rendez-vous rapide', 'Disponibilités en 48h. Aucune attente inutile pour prendre soin de vous.'],
    ['Dossier confidentiel', 'Votre santé reste privée. Données protégées, approche discrète.'],
    ['Suivi personnalisé', 'Un médecin qui vous connaît et qui suit votre évolution dans le temps.'],
    ['Environnement serein', 'Un cabinet conçu pour réduire l\'anxiété et favoriser la confiance.'],
  ],
  construction: [
    ['Soumission détaillée', 'Chaque poste de coût est expliqué. Aucun frais surprise en cours de chantier.'],
    ['Chantier propre', 'Protection des espaces, nettoyage quotidien. On travaille dans votre maison.'],
    ['Licences & assurances', 'Licence RBQ à jour, assurance responsabilité civile. Tout est vérifiable.'],
    ['Garantie travaux', 'Nos réalisations sont couvertes. Si quelque chose ne va pas, on revient.'],
  ],
  fitness: [
    ['Équipement de qualité', 'Appareils professionnels entretenus régulièrement pour une performance optimale.'],
    ['Entraîneurs certifiés', 'Des professionnels passionnés qui adaptent chaque programme à vos objectifs.'],
    ['Horaires flexibles', 'Ouvert tôt le matin et tard le soir. Votre programme, à votre rythme.'],
    ['Résultats mesurables', 'Suivi régulier et ajustement du plan d\'entraînement pour continuer à progresser.'],
  ],
};

function buildCinematicFeatures(secteur) {
  const feats = CINEMATIC_FEATURES[secteur] || CINEMATIC_FEATURES.garage;
  return feats.map((f, i) => `<div class="feat-card fade fade-d${(i % 3) + 1}">
    <span class="feat-num">0${i + 1}</span>
    <h3 class="feat-title">${f[0]}</h3>
    <p class="feat-text">${f[1]}</p>
  </div>`).join('');
}

function buildCinematicServices(secteur) {
  const services = SERVICES[secteur] || SERVICES.defaut;
  return services.map((s, i) => `<div class="service-item fade">
    <div class="service-num">0${i + 1}</div>
    <h3 class="service-title">${s[0]}</h3>
    <p class="service-text">${s[1]}</p>
  </div>`).join('');
}

function buildCinematicPrix(secteur) {
  const prix = PRIX[secteur] || PRIX.defaut;
  return prix.map(p => `<div class="prix-item">
    <div>
      <div class="prix-nom">${p[0]}</div>
      <div class="prix-desc">${p[1]}</div>
    </div>
    <span class="prix-val">${p[2]}</span>
  </div>`).join('');
}

function buildCinematicHeures(secteur) {
  const heures = HEURES[secteur] || HEURES.defaut;
  return heures.map(h => `<div class="heure-r">
    <span class="heure-j">${h[0]}</span>
    <span class="heure-h">${h[1]}</span>
  </div>`).join('');
}

function buildCinematicTemoignages(secteur, ville, opts = {}) {
  const v = escHtml(ville || 'Québec');
  const avis = (Array.isArray(opts.avis) ? opts.avis : [])
    .map(a => (typeof a === 'string' ? { text: a } : a))
    .filter(a => a && (a.text || a.texte) && String(a.text || a.texte).trim().length > 15)
    .slice(0, 3);
  if (avis.length) {
    return avis.map((a, i) => {
      const texte = escHtml(String(a.text || a.texte).replace(/\s+/g, ' ').trim().slice(0, 400));
      const auteur = (a.author || a.auteur) ? escHtml(String(a.author || a.auteur).slice(0, 60)) : 'Avis Google';
      return `<div class="temo-item fade fade-d${i + 1}">
    <div class="temo-stars">★★★★★</div>
    <p class="temo-quote">${texte}</p>
    <div class="temo-author">${auteur} · ${v}, QC</div>
  </div>`;
    }).join('');
  }
  const note = parseFloat(opts.avisGoogle); const n = parseInt(opts.avisCount, 10);
  const badge = (Number.isFinite(note) && note > 0 && note <= 5)
    ? `<div class="temo-stars" style="font-size:34px">${note.toFixed(1)} ★★★★★</div>
       <div class="temo-author" style="margin-top:6px">${Number.isInteger(n) && n > 0 ? n + ' avis Google' : 'sur Google'}</div>`
    : '';
  return `<div class="temo-item fade" style="grid-column:1/-1;text-align:center">
    ${badge}
    <p class="temo-quote" style="opacity:.85">Les avis de vos clients s'afficheront ici, directement depuis votre fiche Google.</p>
  </div>`;
}

// ── Données restaurant ─────────────────────────────────────

const RESTAURANT_SCENE_PHOTOS = [
  'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1600&q=85',
  'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1600&q=85',
  'https://images.unsplash.com/photo-1544025162-d76694265947?w=1600&q=85',
  'https://images.unsplash.com/photo-1424847651672-bf20a4b0982b?w=1600&q=85',
];

const RESTAURANT_POETICS = [
  { line: 'On pousse la porte,<br>la ville s\'éteint.', sub: 'Un lieu pensé comme une parenthèse, entre feu, matière et lumière.' },
  { line: 'La braise donne<br>le tempo du repas.', sub: 'Chaque assiette est une décision. Chaque détail, une intention.' },
  { line: 'Le dernier verre<br>se choisit lentement.', sub: 'Parce que les bonnes soirées méritent d\'être prolongées.' },
];

function buildRestaurantScenes({ nom, nomCourt, ville, adresse, telephone }) {
  const addr = adresse || `${ville}, Québec`;
  const tel = telephone || '';

  const hero = `<section class="scene">
  <img class="scene-bg" src="${RESTAURANT_SCENE_PHOTOS[0]}" alt="${nom}" loading="eager">
  <div class="scene-overlay"></div>
  <div class="scene-body">
    <span class="scene-addr">${addr}</span>
    <h1 class="scene-name">${nomCourt}<br><em>— Cuisine &amp; saveurs</em></h1>
    <p class="scene-tagline">Restaurant gastronomique · ${ville}, Québec</p>
  </div>
  ${tel ? `<span class="scene-tel">${tel}</span>` : ''}
</section>`;

  const stories = RESTAURANT_POETICS.map((p, i) => `<section class="scene">
  <img class="scene-bg" src="${RESTAURANT_SCENE_PHOTOS[i + 1] || RESTAURANT_SCENE_PHOTOS[0]}" alt="${nom}" loading="lazy">
  <div class="scene-overlay"></div>
  <div class="scene-body">
    <span class="scene-addr">${addr}</span>
    <h2 class="scene-line">${p.line}</h2>
    <p class="scene-sub">${p.sub}</p>
  </div>
  ${tel ? `<span class="scene-tel">${tel}</span>` : ''}
</section>`).join('');

  return hero + stories;
}

function buildRestaurantFeatures() {
  const feats = [
    ['Cuisine de saison', 'Produits frais du Québec, menu renouvelé selon les arrivages et les saisons.'],
    ['Service attentionné', 'Présent sans être intrusif — vous êtes entre de bonnes mains.'],
    ['Cadre soigné', 'Un espace pensé pour que vous oubliiez le temps.'],
    ['Produits locaux', 'Des artisans et producteurs d\'ici, sélectionnés avec soin.'],
  ];
  return feats.map((f, i) => `<div class="feat-card fade fade-d${(i % 3) + 1}">
    <span class="feat-num">0${i + 1}</span>
    <h3 class="feat-title">${f[0]}</h3>
    <p class="feat-text">${f[1]}</p>
  </div>`).join('');
}

function buildRestaurantPrix(prix) {
  return prix.map(p => `<div class="prix-item">
    <div>
      <div class="prix-nom">${p[0]}</div>
      <div class="prix-desc">${p[1]}</div>
    </div>
    <span class="prix-val">${p[2]}</span>
  </div>`).join('');
}

function buildRestaurantHeures(heures) {
  return heures.map(h => `<div class="heure-r">
    <span class="heure-j">${h[0]}</span>
    <span class="heure-h">${h[1]}</span>
  </div>`).join('');
}

function buildContactRows({ telephone, adresse, nom }) {
  const rows = [];
  if (adresse) rows.push(`<div class="contact-row"><span class="c-icon">→</span><span>${adresse}</span></div>`);
  if (telephone) rows.push(`<div class="contact-row"><span class="c-icon">T.</span><a href="tel:+1${telephone.replace(/\D/g, '')}">${telephone}</a></div>`);
  rows.push(`<div class="contact-row"><span class="c-icon">@</span><a href="mailto:elliot@novalisia.ca?subject=Réservation - ${encodeURIComponent(nom)}">Nous écrire</a></div>`);
  return rows.join('\n');
}

// ── Données structurées schema.org (SEO local) ──────────────────────
// Novalis VEND du référencement local ; les sites générés n'émettaient aucune
// donnée structurée, donc Google ne pouvait pas afficher de fiche enrichie —
// l'argument de vente n°1 livré à zéro. Le @type est choisi selon le secteur
// (AutoRepair, Restaurant, HairSalon…) pour que Google comprenne le commerce.
const SCHEMA_TYPE = {
  garage: 'AutoRepair', plombier: 'Plumber', electricien: 'Electrician',
  restaurant: 'Restaurant', salon: 'HairSalon', health: 'MedicalClinic',
  construction: 'GeneralContractor', fitness: 'HealthClub', defaut: 'LocalBusiness',
};

function buildLocalBusinessJsonLd(data, secteur) {
  const { nom, ville, adresse, telephone, avisGoogle, avisCount, description } = data;
  const obj = {
    '@context': 'https://schema.org',
    '@type': SCHEMA_TYPE[secteur] || 'LocalBusiness',
    name: nom,
  };
  if (description) obj.description = String(description).replace(/\s+/g, ' ').trim().slice(0, 300);
  if (telephone) obj.telephone = '+1' + String(telephone).replace(/\D/g, '');
  if (adresse || ville) {
    obj.address = { '@type': 'PostalAddress', addressRegion: 'QC', addressCountry: 'CA' };
    if (adresse) obj.address.streetAddress = String(adresse);
    if (ville) obj.address.addressLocality = String(ville);
  }
  if (ville) obj.areaServed = String(ville);
  // Note agrégée émise UNIQUEMENT si elle est RÉELLE (extraite du vrai profil
  // Google du commerce). Jamais inventée : une fausse note en donnée structurée
  // viole les règles de Google et expose juridiquement l'entreprise nommée.
  const note = parseFloat(avisGoogle);
  const n = parseInt(avisCount, 10);
  if (Number.isFinite(note) && note > 0 && note <= 5 && Number.isInteger(n) && n > 0) {
    obj.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: note.toFixed(1), reviewCount: n, bestRating: '5',
    };
  }
  // JSON.stringify gère l'échappement ; on neutralise seulement </script>.
  return '<script type="application/ld+json">' +
    JSON.stringify(obj).replace(/<\/script/gi, '<\\/script') + '</script>';
}

function injecterJsonLd(html, data, secteur) {
  if (/application\/ld\+json/i.test(html)) return html; // déjà présent
  const ld = buildLocalBusinessJsonLd(data, secteur);
  return html.includes('</head>') ? html.replace('</head>', ld + '\n</head>') : ld + html;
}

// Formulaire de contact — la moitié ÉCRITE des contacts. Sans lui, un client ne
// peut que téléphoner ; il ne peut pas laisser de message le soir. On injecte un
// formulaire professionnel, autonome (styles/classes préfixés « nvr- » pour ne
// pas entrer en conflit avec le CSS du site), câblé à /api/{slug}/contact — le
// même endpoint durci qui alimente Réception et déclenche l'alerte instantanée.
function injecterFormulaireContact(html, slug, brandColor, nom) {
  if (!slug || /id="nvr-ecrire"/.test(html)) return html;
  const s = JSON.stringify(String(slug).replace(/[^a-z0-9-]/gi, ''));
  // Même couleur d'accent que le reste du site (ensureVibrancy), pour que le
  // bouton du formulaire s'harmonise exactement avec la marque, pas un bleu à côté.
  const c = /^#?[0-9a-f]{6}$/i.test(String(brandColor || '')) ? ensureVibrancy(brandColor) : '#2563EB';
  const titre = nom ? `Une question pour ${String(nom).replace(/[<>&"]/g, '')} ?` : 'Une question ? Écrivez-nous.';
  const bloc = `
<section id="nvr-ecrire" aria-label="Nous écrire">
<style>
#nvr-ecrire{all:initial;display:block;box-sizing:border-box;background:#f5f5f2;color:#1a1c17;
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
  padding:clamp(48px,8vw,88px) 20px;border-top:1px solid rgba(0,0,0,.07)}
#nvr-ecrire *{box-sizing:border-box}
#nvr-ecrire .nvr-wrap{max-width:600px;margin:0 auto}
#nvr-ecrire h2{font-size:clamp(24px,4vw,34px);font-weight:700;line-height:1.15;margin:0 0 10px;letter-spacing:-.01em}
#nvr-ecrire p.nvr-sub{font-size:16px;color:#5c5f55;margin:0 0 28px;line-height:1.5}
#nvr-ecrire form{display:flex;flex-direction:column;gap:12px}
#nvr-ecrire .nvr-row{display:flex;gap:12px}
#nvr-ecrire .nvr-row>*{flex:1;min-width:0}
#nvr-ecrire input,#nvr-ecrire textarea{width:100%;font:inherit;font-size:16px;color:#1a1c17;background:#fff;
  border:1px solid rgba(0,0,0,.16);border-radius:11px;padding:14px 16px;outline:none;transition:border-color .15s,box-shadow .15s;resize:vertical}
#nvr-ecrire input:focus,#nvr-ecrire textarea:focus{border-color:${c};box-shadow:0 0 0 3px ${c}22}
#nvr-ecrire button{font:inherit;font-size:16px;font-weight:650;color:#fff;background:${c};border:none;border-radius:11px;
  padding:15px 22px;cursor:pointer;transition:filter .15s;margin-top:4px}
#nvr-ecrire button:hover{filter:brightness(1.07)}
#nvr-ecrire button:disabled{opacity:.6;cursor:default}
#nvr-ecrire .nvr-msg{font-size:14px;color:#9c4632;min-height:1px}
#nvr-ecrire .nvr-ok{font-size:17px;color:#1a1c17;background:#fff;border:1px solid rgba(0,0,0,.1);
  border-radius:14px;padding:26px;text-align:center;line-height:1.5}
#nvr-ecrire .nvr-ok b{color:${c}}
@media(max-width:520px){#nvr-ecrire .nvr-row{flex-direction:column}}
</style>
<div class="nvr-wrap">
  <h2>${titre}</h2>
  <p class="nvr-sub">Laissez-nous un mot, on vous répond rapidement — souvent le jour même.</p>
  <form novalidate>
    <div class="nvr-row">
      <input name="name" placeholder="Votre nom" autocomplete="name" aria-label="Votre nom" required>
      <input name="email" type="email" placeholder="Votre courriel" autocomplete="email" aria-label="Votre courriel" required>
    </div>
    <textarea name="message" rows="4" placeholder="Comment pouvons-nous vous aider ?" aria-label="Votre message" required></textarea>
    <button type="submit">Envoyer le message</button>
    <div class="nvr-msg" role="status" aria-live="polite"></div>
  </form>
  <div class="nvr-ok" hidden><b>Merci !</b> Votre message est bien reçu. On vous revient rapidement.</div>
</div>
<script>(function(){var slug=${s};var sec=document.getElementById('nvr-ecrire');var f=sec.querySelector('form');
f.addEventListener('submit',async function(e){e.preventDefault();
var b=f.querySelector('button'),msg=f.querySelector('.nvr-msg');
var name=f.name.value.trim(),email=f.email.value.trim(),message=f.message.value.trim();
if(!name||!/.+@.+\\..+/.test(email)||message.length<10){msg.textContent='Merci d\\'indiquer votre nom, un courriel valide et un court message.';return;}
b.disabled=true;b.textContent='Envoi…';msg.textContent='';
try{var r=await fetch('/api/'+slug+'/contact',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:name,email:email,message:message,lang:'fr'})});
if(r.ok){f.style.display='none';sec.querySelector('.nvr-ok').hidden=false;}
else{var j={};try{j=await r.json();}catch(_){}msg.textContent=j.error||'Un problème est survenu. Réessayez ou appelez-nous.';b.disabled=false;b.textContent='Envoyer le message';}}
catch(_){msg.textContent='Vérifiez votre connexion et réessayez.';b.disabled=false;b.textContent='Envoyer le message';}});})();</script>
</section>`;
  if (/<footer/i.test(html)) return html.replace(/<footer/i, bloc + '\n<footer');
  return html.includes('</body>') ? html.replace('</body>', bloc + '</body>') : html + bloc;
}

// Beacon Novalis Réception : chaque clic « appeler » depuis le site est une
// intention d'achat. Le beacon la signale à /api/tap (même origine) sans ralentir
// l'appel — c'est la moitié invisible des contacts (ceux qui n'écrivent pas).
function injecterBeaconTap(html, source) {
  if (!source || /\/api\/tap/.test(html)) return html;
  const s = JSON.stringify(String(source).replace(/[^a-z0-9-]/gi, ''));
  const script = `<script>(function(){var s=${s};function beac(c){try{var u='/api/tap?s='+s+'&c='+c;`
    + `navigator.sendBeacon?navigator.sendBeacon(u):fetch(u,{keepalive:true});}catch(e){}}`
    + `document.addEventListener('click',function(e){var t=e.target.closest&&e.target.closest('a[href^="tel:"],a[href^="mailto:"]');`
    + `if(t)beac(t.getAttribute('href').indexOf('mailto:')===0?'courriel':'tel');},true);})();</script>`;
  return html.includes('</body>') ? html.replace('</body>', script + '</body>') : html + script;
}

// ── Balise Novalis Pulse — mesure première-partie, respectueuse ──────
// Émet des événements ANONYMES (vue, section vue, profondeur de défilement,
// début/envoi de formulaire, clic tél/CTA) vers /api/pulse. Aucun témoin,
// aucune donnée personnelle, jeton de session éphémère qui vit le temps de
// la visite et n'est JAMAIS stocké côté visiteur. « Do Not Track » coupe la
// mesure entièrement. C'est ce qui alimente l'entonnoir de conversion et le
// diagnostic du commerçant, sans jamais surveiller qui que ce soit.
function injecterBeaconPulse(html, source) {
  if (!source || /\/api\/pulse/.test(html)) return html;
  const s = JSON.stringify(String(source).replace(/[^a-z0-9-]/gi, ''));
  const script = `<script>(function(){`
    + `try{if(navigator.doNotTrack=='1'||window.doNotTrack=='1'||navigator.msDoNotTrack=='1')return;}catch(e){return;}`
    // Jeton éphémère : vit en mémoire le temps de la visite, jamais stocké.
    + `var tok=Math.random().toString(36).slice(2)+Date.now().toString(36);`
    + `var file=[],minute=0,tmr=null;`
    + `function envoi(){if(!file.length)return;var lot=file.splice(0,file.length);`
    + `try{var u='/api/pulse?s='+${s};var b=JSON.stringify({t:tok,events:lot});`
    + `if(navigator.sendBeacon){navigator.sendBeacon(u,new Blob([b],{type:'application/json'}));}`
    + `else{fetch(u,{method:'POST',body:b,headers:{'Content-Type':'application/json'},keepalive:true});}}catch(e){}}`
    + `function ev(t,et){if(file.length>60)return;file.push({type:t,etiquette:et?String(et).slice(0,60):undefined});`
    + `clearTimeout(tmr);tmr=setTimeout(envoi,900);}`
    + `ev('vue');`
    // Profondeur : paliers 25/50/75/100 franchis une seule fois.
    + `var paliers=[25,50,75,100],vus={};function prof(){try{var h=document.documentElement;`
    + `var p=(h.scrollTop+window.innerHeight)/(h.scrollHeight||1)*100;`
    + `for(var i=0;i<paliers.length;i++){if(p>=paliers[i]&&!vus[paliers[i]]){vus[paliers[i]]=1;ev('profondeur',paliers[i]);}}}catch(e){}}`
    + `window.addEventListener('scroll',prof,{passive:true});prof();`
    // Sections vues : une fois chacune, étiquetée par id ou premier titre.
    + `try{if('IntersectionObserver' in window){var io=new IntersectionObserver(function(es){`
    + `es.forEach(function(en){if(en.isIntersecting){var el=en.target;io.unobserve(el);`
    + `var t=el.id||'';if(!t){var h=el.querySelector('h1,h2,h3');t=h?h.textContent:'';}`
    + `ev('section',(t||'').trim().toLowerCase().slice(0,60));}});},{threshold:0.4});`
    + `document.querySelectorAll('section,footer').forEach(function(el){io.observe(el);});}}catch(e){}`
    // Amorce / envoi de formulaire (le formulaire de contact injecté).
    + `var amorce=0;document.addEventListener('focusin',function(e){if(amorce)return;`
    + `if(e.target.closest&&e.target.closest('form')){amorce=1;ev('form_start');}},true);`
    + `document.addEventListener('submit',function(e){if(e.target&&e.target.tagName==='FORM')ev('form_submit');},true);`
    // Clics tél / CTA. On restreint « cta » à de VRAIES intentions de contact
    // (lien tél, ancre vers contact/réservation, ou [data-cta] explicite) : un
    // bouton générique de menu ou de galerie ne doit pas gonfler l'entonnoir.
    + `document.addEventListener('click',function(e){var t=e.target.closest&&e.target.closest('a[href^="tel:"],[data-cta],a[href*="#contact"],a[href*="rendez"],a[href*="reserv"]');`
    + `if(t){ev(t.matches('a[href^="tel:"]')?'tel':'cta');}},true);`
    // Vidage garanti au départ (sendBeacon survit au unload).
    + `document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden')envoi();});`
    + `window.addEventListener('pagehide',envoi);`
    + `})();</script>`;
  return html.includes('</body>') ? html.replace('</body>', script + '</body>') : html + script;
}

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
    avis,              // avis RÉELS extraits de la présence en ligne du commerce (jamais inventés)
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
    salon: 'salon', coiffure: 'salon', coiffeur: 'salon', spa: 'salon', esthétique: 'salon', esthetique: 'salon', beauté: 'salon', beaute: 'salon',
    santé: 'health', sante: 'health', health: 'health', clinique: 'health', médecin: 'health', medecin: 'health', dentiste: 'health', physiothérapie: 'health', physiotherapie: 'health',
    construction: 'construction', entrepreneur: 'construction', rénovation: 'construction', renovation: 'construction', toiture: 'construction', charpentier: 'construction',
    fitness: 'fitness', gym: 'fitness', entraînement: 'fitness', entrainement: 'fitness', sport: 'fitness',
  };
  const secteur = secteurMap[secteurRaw?.toLowerCase()] || 'defaut';

  // ── Photos RÉELLES du commerce ───────────────────────────────────
  // Uploadées par nous/le client (data.photos) ou extraites de son site
  // existant (data.sitePhotos). Elles priment TOUJOURS ; le stock ne sert qu'à
  // combler les trous. Un vrai garage montre SON garage, pas une image générique
  // de banque — c'est le premier facteur qui fait « c'est vraiment eux ».
  const photosReelles = [
    ...(Array.isArray(data.photos) ? data.photos : []),
    ...(Array.isArray(data.sitePhotos) ? data.sitePhotos : []),
  ].filter(u => typeof u === 'string' && /^(https?:\/\/|\/)/.test(u.trim())).map(u => u.trim());

  /** Photos finales pour n emplacements : les vraies d'abord, complétées par le stock. */
  function melangePhotos(stock, n) {
    const cible = n || (stock ? stock.length : photosReelles.length) || 6;
    const out = photosReelles.slice(0, cible);
    for (const s of (stock || [])) { if (out.length >= cible) break; if (!out.includes(s)) out.push(s); }
    return out;
  }

  // ── Template dédié restaurant ─────────────────────────────
  if (secteur === 'restaurant') {
    const nomCourtR = nomCourt || nom.split(' ').slice(0, 2).join(' ');
    const ctaHrefR = telephone
      ? `tel:+1${telephone.replace(/\D/g, '')}`
      : `mailto:elliot@novalisia.ca?subject=Réservation - ${encodeURIComponent(nom)}`;
    const ctaLabelR = telephone ? 'Réserver par téléphone' : 'Réserver une table';

    const rTemplatePath = path.join(__dirname, 'template', 'template-restaurant.html');
    let rHtml = fs.readFileSync(rTemplatePath, 'utf8');

    const rReplacements = {
      '{{NOM}}':              nom,
      '{{NOM_COURT}}':        nomCourtR,
      '{{VILLE}}':            ville,
      '{{META_DESCRIPTION}}': `${nom} — Restaurant à ${ville}, Québec. ${description?.split('.')[0] || 'Cuisine fraîche et service attentionné'}. Réservations disponibles.`,
      '{{CTA_HREF}}':         ctaHrefR,
      '{{CTA_LABEL}}':        ctaLabelR,
      '{{ANNEE_FONDATION}}':  String(anneeFondation || new Date().getFullYear() - 12),
      '{{ANNEE}}':            String(new Date().getFullYear()),
      '{{SCENES_HTML}}':      buildRestaurantScenes({ nom, nomCourt: nomCourtR, ville, adresse, telephone }),
      '{{FEATURES_HEADING}}': 'Une adresse qui <em>ralentit le temps.</em>',
      '{{FEATURES_HTML}}':    buildRestaurantFeatures(),
      '{{DESCRIPTION}}':      description
        ? description.split('.').slice(0, 2).join('.') + '.'
        : `${nom} est un restaurant établi au cœur de ${ville}. Une cuisine sincère, des produits choisis, une expérience mémorable.`,
      '{{PRIX_LIGNES}}':      buildRestaurantPrix(PRIX.restaurant),
      '{{HEURES}}':           buildRestaurantHeures(HEURES.restaurant || HEURES.defaut),
      '{{CONTACT_ROWS}}':     buildContactRows({ telephone, adresse, nom }),
    };

    for (const [key, value] of Object.entries(rReplacements)) {
      rHtml = rHtml.split(key).join(value || '');
    }

    rHtml = applyBrandColor(rHtml, brandColor);
    rHtml = injecterJsonLd(rHtml, data, secteur);

    const remaining = rHtml.match(/\{\{[A-Z_]+\}\}/g);
    if (remaining) console.warn('⚠️  Variables non remplacées (restaurant):', [...new Set(remaining)].join(', '));

    const slug = slugify(nom) + (data.slugSuffix ? '-' + String(data.slugSuffix).replace(/[^a-z0-9-]/gi, '') : '');
    const outputDir = path.join(__dirname, 'output');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `${slug}.html`);
    rHtml = injecterFormulaireContact(rHtml, slug, brandColor, nom);
    rHtml = injecterBeaconTap(rHtml, slug);
    rHtml = injecterBeaconPulse(rHtml, slug);
    fs.writeFileSync(outputPath, rHtml, 'utf8');
    const colorUsed = brandColor ? ensureVibrancy(brandColor) : '#2563EB (défaut)';
    console.log(`✅ Site généré : output/${slug}.html  •  secteur: restaurant  •  couleur: ${colorUsed}`);
    return { slug, outputPath };
  }

  // Thème visuel par secteur
  const themeMap = { salon: 'light', health: 'light' };

  // ── Template cinématique — garage, salon, health, construction, fitness ──
  const cinematicSectors = ['garage', 'salon', 'health', 'construction', 'fitness'];
  if (cinematicSectors.includes(secteur)) {
    const nomCourtC = nomCourt || nom.split(' ').slice(0, 2).join(' ');
    const ctaHrefC = telephone
      ? `tel:+1${telephone.replace(/\D/g, '')}`
      : `mailto:elliot@novalisia.ca?subject=Contact - ${encodeURIComponent(nom)}`;
    const ctaLabelC = telephone ? 'Appeler maintenant' : 'Nous contacter';
    const ctaNavLabelC = telephone ? 'Appeler' : 'Contact';

    const cTemplatePath = path.join(__dirname, 'template', 'template-cinematic.html');
    let cHtml = fs.readFileSync(cTemplatePath, 'utf8');

    const descFn = CINEMATIC_DESCRIPTIONS[secteur];
    const cDesc = description
      ? description.split('.').slice(0, 2).join('.') + '.'
      : (descFn ? descFn(nom, ville) : `${nom} — service professionnel à ${ville}.`);

    const cReplacements = {
      '{{THEME}}':             themeMap[secteur] || 'dark',
      '{{SECTEUR}}':           secteur,
      '{{NOM}}':               nom,
      '{{NOM_COURT}}':         nomCourtC,
      '{{VILLE}}':             ville,
      '{{META_DESCRIPTION}}':  `${nom} — ${secteurRaw} à ${ville}, Québec. ${certifications[0] || 'Service professionnel'}. Contactez-nous.`,
      '{{CTA_HREF}}':          ctaHrefC,
      '{{CTA_LABEL}}':         ctaLabelC,
      '{{CTA_NAV_LABEL}}':     ctaNavLabelC,
      '{{ABOUT_EYEBROW}}':      (function(){var an=parseInt(anneeFondation,10);var base=(ville||'Québec')+', Québec';return (Number.isInteger(an)&&an>1900&&an<=new Date().getFullYear())?base+' · En affaires depuis '+an:base;})(),
      '{{ANNEE}}':             String(new Date().getFullYear()),
      '{{SCENES_HTML}}':       buildJourneySlides(secteur, { nom, nomCourt: nomCourtC, ville, adresse, telephone, sitePhotos: photosReelles.length ? photosReelles : (data.sitePhotos || []) }),
      '{{FEATURES_HEADING}}':  CINEMATIC_HEADINGS[secteur] || CINEMATIC_HEADINGS.garage,
      '{{FEATURES_HTML}}':     buildCinematicFeatures(secteur),
      '{{DESCRIPTION}}':       cDesc,
      '{{SERVICES_HTML}}':     buildCinematicServices(secteur),
      '{{PRIX_LIGNES}}':       buildCinematicPrix(secteur),
      '{{PRIX_INTRO}}':        'Tous nos tarifs sont confirmés avant chaque intervention. Aucun frais caché, aucune mauvaise surprise.',
      '{{TEMOIGNAGES}}':       buildCinematicTemoignages(secteur, ville, { avis, avisGoogle, avisCount }),
      '{{HEURES}}':            buildCinematicHeures(secteur),
      '{{CONTACT_ROWS}}':      buildContactRows({ telephone, adresse, nom }),
    };

    for (const [key, value] of Object.entries(cReplacements)) {
      cHtml = cHtml.split(key).join(value || '');
    }

    cHtml = applyBrandColor(cHtml, brandColor);

    const remaining = cHtml.match(/\{\{[A-Z_]+\}\}/g);
    if (remaining) console.warn('⚠️  Variables non remplacées (cinematic):', [...new Set(remaining)].join(', '));

    const slug = slugify(nom) + (data.slugSuffix ? '-' + String(data.slugSuffix).replace(/[^a-z0-9-]/gi, '') : '');
    const outputDir = path.join(__dirname, 'output');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `${slug}.html`);
    cHtml = injecterJsonLd(cHtml, data, secteur);
    cHtml = injecterFormulaireContact(cHtml, slug, brandColor, nom);
    cHtml = injecterBeaconTap(cHtml, slug);
    cHtml = injecterBeaconPulse(cHtml, slug);
    fs.writeFileSync(outputPath, cHtml, 'utf8');
    const colorUsed = brandColor ? ensureVibrancy(brandColor) : '#2563EB (défaut)';
    console.log(`✅ Site généré : output/${slug}.html  •  secteur: ${secteur}  •  thème: ${themeMap[secteur] || 'dark'}  •  couleur: ${colorUsed}`);
    return { slug, outputPath };
  }

  const theme = themeMap[secteur] || 'dark';

  const photos = melangePhotos(PHOTOS[secteur] || PHOTOS.defaut);
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
    plombier: [`Plombier à ${ville} —`, 'Réparations, installations et urgences · devis clair avant les travaux'],
    electricien: [`Électricien licencié à ${ville} —`, 'Rapide, fiable et garanti'],
    restaurant: [`Cuisine fraîche & authentique à ${ville}`, 'Saveurs locales, service chaleureux'],
    defaut: [`${nomCourt} à ${ville} —`, 'Service professionnel & satisfaction garantie'],
  };

  const tabs = TABS[secteur] || TABS.defaut;

  // Lire le template
  const templatePath = path.join(__dirname, 'template', 'template.html');
  let html = fs.readFileSync(templatePath, 'utf8');

  const replacements = {
    '{{THEME}}': theme,
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
    '{{TEMOIGNAGES}}': buildTemoignages(secteur, ville, { avis, avisGoogle, avisCount }),
    '{{HERO_BADGE}}': buildHeroBadge(secteur, ville, { avisGoogle, avisCount }),
    '{{HERO_STATS}}': buildHeroStats(secteur, ville, { avisGoogle, avisCount, anneeFondation }),
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
  const slug = slugify(nom) + (data.slugSuffix ? '-' + String(data.slugSuffix).replace(/[^a-z0-9-]/gi, '') : '');
  const outputDir = path.join(__dirname, 'output');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, `${slug}.html`);
  html = injecterJsonLd(html, data, secteur);
  html = injecterFormulaireContact(html, slug, brandColor, nom);
  html = injecterBeaconTap(html, slug);
  html = injecterBeaconPulse(html, slug);
  fs.writeFileSync(outputPath, html, 'utf8');
  const colorUsed = brandColor ? ensureVibrancy(brandColor) : '#2563EB (défaut)';
  console.log(`✅ Site généré : output/${slug}.html  •  couleur: ${colorUsed}`);

  return { slug, outputPath };
}

module.exports = {
  generate, extractBrandColor, applyBrandColor, extractSitePhotos, slugify,
  // Exportés pour les tests d'honnêteté (aucun contenu fabriqué).
  buildTemoignages, buildCinematicTemoignages, buildHeroBadge, buildHeroStats,
};
