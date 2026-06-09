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
    unsplash: {
      exterior: 'photo-1555396273-367ea4eb4db5?q=90&w=2400&auto=format&fit=crop',
      interior: 'photo-1517248135467-4c7edcad34c4?q=90&w=2400&auto=format&fit=crop',
      service:  'photo-1544025162-811114cd354c?q=90&w=2400&auto=format&fit=crop',
      about:    'photo-1414235077428-338989a2e8c0?q=90&w=1400&auto=format&fit=crop',
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
      { num: '98%', label: 'satisfaction client' },
    ],
    defaultHours: { weekdays: '7 h 30 — 17 h 30', saturday: '8 h 00 — 14 h 00', sunday: 'Fermé' },
    unsplash: {
      exterior: 'photo-1558618666-fcd25c85cd64?q=90&w=2400&auto=format&fit=crop',
      interior: 'photo-1607860108855-64acf2078ed9?q=90&w=2400&auto=format&fit=crop',
      service:  'photo-1619642751034-765dfdf7c58e?q=90&w=2400&auto=format&fit=crop',
      about:    'photo-1504222490345-c075b7b68888?q=90&w=1400&auto=format&fit=crop',
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
    unsplash: {
      exterior: 'photo-1560472354-b33ff0c44a43?q=90&w=2400&auto=format&fit=crop',
      interior: 'photo-1560869713-da86a9ec0744?q=90&w=2400&auto=format&fit=crop',
      service:  'photo-1522337360788-8b13dee7a37e?q=90&w=2400&auto=format&fit=crop',
      about:    'photo-1580618432051-7e04f8a82b5a?q=90&w=1400&auto=format&fit=crop',
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
      { num: '97%', label: 'satisfaction patient' },
    ],
    defaultHours: { weekdays: '8 h 00 — 18 h 00', saturday: '9 h 00 — 13 h 00', sunday: 'Fermé' },
    unsplash: {
      exterior: 'photo-1519494026892-80bbd2d6fd0d?q=90&w=2400&auto=format&fit=crop',
      interior: 'photo-1587351021759-3e566b3db4f0?q=90&w=2400&auto=format&fit=crop',
      service:  'photo-1582750433449-648ed127bb54?q=90&w=2400&auto=format&fit=crop',
      about:    'photo-1559839734-2b71ea197ec2?q=90&w=1400&auto=format&fit=crop',
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
    unsplash: {
      exterior: 'photo-1504307651254-35680f356dfd?q=90&w=2400&auto=format&fit=crop',
      interior: 'photo-1541888946425-d81bb19240f5?q=90&w=2400&auto=format&fit=crop',
      service:  'photo-1503387762-592deb58ef4e?q=90&w=2400&auto=format&fit=crop',
      about:    'photo-1558618047-3c8c76ca7d13?q=90&w=1400&auto=format&fit=crop',
    },
  },
};

const INDUSTRY_LABELS = Object.fromEntries(Object.entries(CONFIGS).map(([k,v]) => [k, v.label]));

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
            .to('#s-ext .scene-bg', { scale: 2.0, ease: 'none', duration: 4 }, 0)
            .to('#jt-addr',  { opacity: 0, duration: 0.4 }, 0.4)
            .to('#jt-title', { opacity: 0, duration: 0.6 }, 0.5)
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
            .to('#s-ext .scene-bg', { scale: 2.2, ease: 'none', duration: 4 }, 0)
            .to('#jt-addr',  { opacity: 0, duration: 0.4 }, 0.4)
            .to('#jt-title', { opacity: 0, duration: 0.6 }, 0.5)
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
            .to('#s-ext .scene-bg', { scale: 2.0, ease: 'none', duration: 4 }, 0)
            .to('#jt-addr',  { opacity: 0, duration: 0.4 }, 0.4)
            .to('#jt-title', { opacity: 0, duration: 0.6 }, 0.5)
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
            .to('#s-ext .scene-bg', { scale: 2.0, ease: 'none', duration: 4 }, 0)
            .to('#jt-addr',  { opacity: 0, duration: 0.4 }, 0.4)
            .to('#jt-title', { opacity: 0, duration: 0.6 }, 0.5)
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
  const aboutText = rawData.aboutText || `${esc(name)} est né d'une passion simple : bien faire, honnêtement, avec des gens de ${city || 'notre région'}. ${founded ? `Fondé en ${founded}, l'équipe` : 'Notre équipe'} continue de grandir grâce à la confiance de clients fidèles et de nouveaux visages chaque année.`;
  const mapsQuery = encodeURIComponent(`${address}${city ? ', ' + city : ''}, Québec`);
  const mapBrightness = isLight ? '1.05' : '0.45';

  const insideParts = cfg.insideText.split('\n');
  const svcParts    = cfg.svcText.split('\n');

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${esc(name)}</title>
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
        body { background: var(--bg); color: var(--text); font-family: ${cfg.fontB}; overflow-x: hidden; -webkit-font-smoothing: antialiased; }
        ::-webkit-scrollbar { display: none; }

        /* ══ JOURNEY ══ */
        .journey { height: 700vh; position: relative; }
        .journey-sticky { position: sticky; top: 0; height: 100vh; overflow: hidden; background: #000; }
        .scene { position: absolute; inset: 0; }
        .scene-bg { position: absolute; inset: -8%; background-size: cover; background-position: center; will-change: transform, opacity; }

        /* Scènes */
        #s-ext .scene-bg { background-image: ${bgImg('exterior', 'exterior')}; }
        #s-svc { opacity: 0; z-index: 3; }
        #s-svc .scene-bg { background-image: ${bgImg('service', 'service')}; }
        #s-site { opacity: 0; z-index: 4; background: var(--bg); display: flex; align-items: flex-end; justify-content: flex-start; }
        #s-int .scene-bg { background-image: ${bgImg('interior', 'interior')}; }
        ${animationCSS(anim)}

        /* Overlays */
        .vignette { position: absolute; inset: 0; z-index: 9; pointer-events: none; background: radial-gradient(ellipse at center, transparent 28%, rgba(0,0,0,0.72) 100%); }
        .grad-bottom { position: absolute; bottom: 0; left: 0; right: 0; z-index: 9; height: 33%; pointer-events: none; background: linear-gradient(to top, #000, transparent); }
        .grain { position: absolute; inset: 0; z-index: 10; pointer-events: none; opacity: 0.04; background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"); background-size: 180px 180px; }

        /* Journey texts */
        .jt { position: absolute; z-index: 20; pointer-events: none; }
        #jt-addr { top: 7vh; left: 7vw; font-family: ${cfg.fontH}; font-size: clamp(10px, 1.1vw, 14px); letter-spacing: 0.32em; text-transform: uppercase; color: rgba(255,255,255,0.4); }
        #jt-title { bottom: 10vh; left: 7vw; }
        .jt-name { font-family: ${cfg.fontH}; font-weight: ${cfg.fontHW}; font-size: clamp(58px, 10vw, 140px); line-height: 0.88; color: var(--text); text-transform: uppercase; letter-spacing: -0.01em; }
        .jt-name em { color: var(--primary); font-style: normal; }
        .jt-sub { font-family: ${cfg.fontH}; font-weight: 600; font-size: clamp(11px, 1.4vw, 18px); letter-spacing: 0.26em; text-transform: uppercase; color: var(--muted); margin-top: 14px; }
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

        /* Floating CTA mobile */
        .float-cta { display: none; position: fixed; bottom: 26px; left: 50%; transform: translateX(-50%); z-index: 200; background: var(--primary); color: #fff; font-family: ${cfg.fontH}; font-size: 13px; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; padding: 15px 36px; text-decoration: none; box-shadow: 0 8px 40px rgba(0,0,0,0.55); white-space: nowrap; border-radius: 1px; opacity: 0; pointer-events: none; transition: opacity .3s; }
        @media (max-width: 768px) { .float-cta { display: block; } }

        /* Scroll-reveal */
        .reveal { opacity: 0; transform: translateY(30px); transition: opacity 0.65s cubic-bezier(.22,1,.36,1), transform 0.65s cubic-bezier(.22,1,.36,1); }
        .reveal.visible { opacity: 1; transform: none; }
        .reveal-d1 { transition-delay: 0.08s; }
        .reveal-d2 { transition-delay: 0.16s; }
        .reveal-d3 { transition-delay: 0.24s; }
        .reveal-d4 { transition-delay: 0.32s; }

        /* Navbar */
        .navbar { position: fixed; top: 0; left: 0; right: 0; z-index: 100; display: flex; align-items: center; justify-content: space-between; padding: 22px 6vw; transition: background .4s, padding .3s; }
        .navbar.scrolled { background: rgba(${hexToRgbStr(p.bg)}, 0.96); backdrop-filter: blur(16px); padding: 14px 6vw; }
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

        /* Services */
        #services { background: var(--dark); }
        .svc-intro { max-width: 500px; font-size: 16px; line-height: 1.8; color: var(--muted); margin-bottom: 0; }
        .svc-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 2px; margin-top: 56px; }
        .svc-card { background: var(--panel); padding: 42px 34px; border-top: 2px solid var(--primary); transition: background .2s; cursor: default; }
        .svc-card:hover { background: var(--dark); }
        .svc-num { font-family: ${cfg.fontH}; font-size: 10px; letter-spacing: 0.32em; color: var(--primary); margin-bottom: 22px; text-transform: uppercase; }
        .svc-title { font-family: ${cfg.fontH}; font-weight: ${cfg.fontHW}; font-size: clamp(18px, 2vw, 24px); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 12px; }
        .svc-desc { font-size: 14px; line-height: 1.75; color: var(--muted); }

        /* About */
        #about { display: grid; grid-template-columns: 1fr 1fr; gap: 80px; align-items: center; }
        .about-img { aspect-ratio: 4/3; background: var(--panel); background-image: ${bgImg('about', 'about')}; background-size: cover; background-position: center; position: relative; }
        .about-img::after { content: '${founded ? `Fondé ${founded}` : ''}'; position: absolute; bottom: 18px; right: 18px; font-family: ${cfg.fontH}; font-size: 10px; letter-spacing: 0.28em; text-transform: uppercase; color: rgba(255,255,255,.5); background: rgba(0,0,0,.6); padding: 5px 12px; backdrop-filter: blur(6px); }
        .about-body { font-size: 15px; line-height: 1.85; color: var(--muted); margin-bottom: 44px; }
        .stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
        .stat-num { font-family: ${cfg.fontH}; font-weight: ${cfg.fontHW}; font-size: clamp(38px, 4vw, 60px); color: var(--primary); line-height: 1; }
        .stat-label { font-size: 12px; letter-spacing: 0.05em; color: var(--muted); margin-top: 5px; }

        /* Testimonials */
        #testimonials { background: var(--dark); }
        .testi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 2px; margin-top: 52px; }
        .testi-card { background: var(--panel); padding: 36px 32px; border-left: 2px solid var(--primary); }
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
        footer { background: ${p.bg}; padding: 34px 7vw; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px; border-top: 1px solid rgba(255,255,255,.05); }
        .foot-logo { font-family: ${cfg.fontH}; font-weight: ${cfg.fontHW}; font-size: 17px; text-transform: uppercase; }
        .foot-logo span { color: var(--primary); }
        footer p { font-size: 12px; color: var(--muted); letter-spacing: 0.07em; }

        @media (max-width: 768px) {
            #about { grid-template-columns: 1fr; gap: 40px; }
            .nav-links { display: none; }
            .about-img { aspect-ratio: 16/9; }
            .hours-grid { gap: 24px; }
        }
    </style>
</head>
<body>

<nav class="navbar" id="navbar">
    <a href="#" class="nav-logo">${esc(name)}</a>
    <ul class="nav-links">
        <li><a href="#services">Services</a></li>
        <li><a href="#about">À propos</a></li>
        <li><a href="#contact">Contact</a></li>
    </ul>
    <a href="tel:${phoneClean}" class="nav-cta">Appeler</a>
</nav>
${phoneClean ? `<a href="tel:${phoneClean}" class="float-cta" id="floatCta">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="margin-right:7px;vertical-align:-1px;flex-shrink:0"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>${esc(phone)}
</a>` : ''}

<div class="journey">
    <div class="journey-sticky">
        <div class="scene" id="s-ext"><div class="scene-bg"></div></div>
        <div class="scene" id="s-int"><div class="scene-bg"></div></div>
        <div class="scene" id="s-svc"><div class="scene-bg"></div></div>
        <div class="scene" id="s-site">
            <div class="site-splash">
                ${(anim === 'garage' || anim === 'gate') ? `<div class="splash-badge">${esc(city || address.split(',').pop().trim())}${founded ? ` · depuis ${founded}` : ''}</div>` : ''}
                <img class="splash-logo-img" src="/demo/images/${slug}-logo.png" onerror="this.style.display='none'" alt="${esc(name)}">
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
            <div class="jt-name">${esc(name.split(' ').slice(0,3).join('<br>'))}</div>
            <div class="jt-sub">${founded ? `Fondé en ${founded} · ` : ''}${esc(tagline.split(' ').slice(0,5).join(' '))}</div>
        </div>
        <div class="jt" id="jt-inside">
            <div class="jt-inside-text">${insideParts.map((l,i) => i===1 ? `<span>${esc(l)}</span>` : esc(l)).join('<br>')}</div>
        </div>
        <div class="jt" id="jt-svc">
            <div class="jt-svc-text">${svcParts[0] ? esc(svcParts[0]) : ''}<br>${svcParts[1] ? `<strong>${esc(svcParts[1])}</strong>` : ''}</div>
        </div>
    </div>
</div>

<section id="services">
    <div class="sec-label reveal">Nos expertises</div>
    <h2 class="sec-title reveal reveal-d1">Ce qu'on<br>fait le mieux</h2>
    <p class="svc-intro reveal reveal-d2">${esc(tagline)} Notre équipe est là pour vous servir avec rigueur et passion.</p>
    <div class="svc-grid">
        ${services.map((s,i) => `<div class="svc-card reveal reveal-d${Math.min(i+1,4)}">
            <div class="svc-num">0${i+1}</div>
            <div class="svc-title">${esc(s.title)}</div>
            <div class="svc-desc">${esc(s.desc)}</div>
        </div>`).join('\n        ')}
    </div>
</section>

<section id="about">
    <div class="about-img reveal"></div>
    <div>
        <div class="sec-label reveal">Notre histoire</div>
        <h2 class="sec-title reveal reveal-d1">${founded ? `Depuis ${founded},<br>` : ''}on est là pour vous</h2>
        <p class="about-body reveal reveal-d2">${aboutText}</p>
        <div class="stats-grid reveal reveal-d3">
            ${stats.map(s => `<div>
                <div class="stat-num">${esc(s.num)}</div>
                <div class="stat-label">${esc(s.label)}</div>
            </div>`).join('\n            ')}
        </div>
    </div>
</section>

<section id="testimonials">
    <div class="sec-label reveal">Ce qu'ils en disent</div>
    <h2 class="sec-title reveal reveal-d1">La confiance,<br>ça se mérite</h2>
    <div class="testi-grid">
        ${testi.map((t,i) => `<div class="testi-card reveal reveal-d${Math.min(i+1,4)}">
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
    <div class="foot-logo">${esc(name)}</div>
    <p>${esc(address)} · ${esc(phone)}</p>
    <p>© ${new Date().getFullYear()} ${esc(name)}</p>
</footer>

<img src="/t/${slug}" width="1" height="1" style="position:fixed;top:0;left:0;opacity:0.001;pointer-events:none" alt="">

<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js"></script>
<script>
    gsap.registerPlugin(ScrollTrigger);

    // Navbar scroll
    window.addEventListener('scroll', () => {
        document.getElementById('navbar').classList.toggle('scrolled', window.scrollY > 60);
    }, { passive: true });

    // GSAP cinematic journey
    const tl = gsap.timeline({
        scrollTrigger: {
            trigger: '.journey',
            start: 'top top',
            end: 'bottom bottom',
            scrub: 1.6,
        }
    });
    ${gsapScript(anim)}

    // Scroll-reveal via IntersectionObserver
    const io = new IntersectionObserver((entries) => {
        entries.forEach(e => {
            if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); }
        });
    }, { threshold: 0.12 });
    document.querySelectorAll('.reveal').forEach(el => io.observe(el));

    ${phoneClean ? `// Floating CTA — appears after journey section
    const floatCta = document.getElementById('floatCta');
    if (floatCta) {
        const journeyEl = document.querySelector('.journey');
        function updateFloat() {
            const pastJourney = window.scrollY > journeyEl.offsetTop + journeyEl.offsetHeight - window.innerHeight * 0.5;
            floatCta.style.opacity = pastJourney ? '1' : '0';
            floatCta.style.pointerEvents = pastJourney ? 'auto' : 'none';
        }
        window.addEventListener('scroll', updateFloat, { passive: true });
    }` : ''}
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
