'use strict';
// Régénère les 6 démos PME réelles avec le moteur cinématique à jour.
const fs = require('fs');
const path = require('path');
const { generateCinematic } = require('./generate-cinematic.js');

const PMES = [
  { industry: 'garage', name: 'PMC Mécanique', phone: '819 791-0717',
    address: '2850 Rue King Est, Sherbrooke, QC J1G 5H3', city: 'Sherbrooke',
    tagline: 'Spécialiste VÉ et mécanique générale à Sherbrooke.',
    website: 'https://pmcmecanique.com' },
  { industry: 'restaurant', name: 'Chez Boulay — Bistro Boréal', phone: '418 380-8166',
    address: '1110 Rue Saint-Jean, Québec, QC G1R 1S4', city: 'Québec', founded: '2012',
    tagline: 'Une cuisine boréale au cœur du Vieux-Québec.',
    website: 'https://chezboulay.com' },
  { industry: 'salon', name: 'Oasis Coiffure', phone: '450 628-8686',
    address: '655 Boul. Curé-Labelle, Sainte-Rose, Laval, QC H7L 5R7', city: 'Laval',
    tagline: 'Votre oasis de beauté à Sainte-Rose, Laval.',
    website: 'https://oasiscoiffure.ca' },
  { industry: 'clinique', name: 'Clinique CMI', phone: '450 442-1018',
    address: '1215 Chemin du Tremblay Suite 260, Longueuil, QC J4N 1R4', city: 'Longueuil', founded: '1994',
    tagline: 'Physiothérapie, ergothérapie et soins intégrés à Longueuil.',
    website: 'https://cliniquecmi.com' },
  { industry: 'construction', name: 'Construction CMA', phone: '819 840-3349',
    address: '4540 Rue Charles-Malhiot, Trois-Rivières, QC G9B 0V4', city: 'Trois-Rivières', founded: '2008',
    tagline: 'Construction et rénovation résidentielle en Mauricie depuis 2008.',
    website: 'https://constructioncma.com' },
  { industry: 'restaurant', name: 'Pub Le Vieux', phone: '450 655-9117',
    address: '650 Boul. du Fort-Saint-Louis, Boucherville, QC J4B 1S9', city: 'Boucherville',
    tagline: "L'institution de Boucherville depuis 20 ans.",
    website: 'https://publevieux.com' },
];

for (const pme of PMES) {
  const { html, slug } = generateCinematic(pme);
  for (const dir of ['output', 'demos']) {
    fs.writeFileSync(path.join(__dirname, dir, `${slug}.html`), html, 'utf8');
  }
  console.log(`✓ ${pme.name} → ${slug}.html (${(html.length/1024).toFixed(1)} ko)`);
}
