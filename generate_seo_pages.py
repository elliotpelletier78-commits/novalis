import os

DIST = "/home/user/novalis/frontend/dist"

def page(slug, title, meta_desc, h1, intro, sections, faq):
    faq_schema = ",\n".join([
        f'{{"@type":"Question","name":{repr(q)},"acceptedAnswer":{{"@type":"Answer","text":{repr(a)}}}}}' 
        for q,a in faq
    ])
    faq_html = "\n".join([
        f'<div class="faq-item"><h3>{q}</h3><p>{a}</p></div>' for q,a in faq
    ])
    sections_html = "\n".join([
        f'<div class="feature"><h2>{s[0]}</h2><p>{s[1]}</p></div>' for s in sections
    ])
    return f'''<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>{title}</title>
<meta name="description" content="{meta_desc}">
<meta name="robots" content="index,follow">
<link rel="canonical" href="https://novalisia.ca/{slug}">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{meta_desc}">
<meta property="og:url" content="https://novalisia.ca/{slug}">
<meta property="og:type" content="website">
<script type="application/ld+json">
[{{"@context":"https://schema.org","@type":"Service","provider":{{"@type":"Organization","name":"Novalis IA","url":"https://novalisia.ca"}},"name":"{h1}","areaServed":{{"@type":"AdministrativeArea","name":"Québec"}},"serviceType":"Intelligence artificielle"}},
{{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{faq_schema}]}}]
</script>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet">
<style>
*{{box-sizing:border-box;margin:0;padding:0}}
body{{font-family:'DM Sans',sans-serif;background:#090c0f;color:#e0dbd4;line-height:1.7}}
a{{color:#c9a96e;text-decoration:none}}
.nav{{display:flex;justify-content:space-between;align-items:center;padding:20px 40px;border-bottom:1px solid #1a1f24}}
.nav-logo{{font-family:'Cormorant Garamond',serif;font-size:1.3rem;color:#c9a96e}}
.nav-cta{{background:#c9a96e;color:#090c0f;padding:9px 22px;border-radius:6px;font-size:.85rem;font-weight:500}}
.hero{{max-width:860px;margin:0 auto;padding:80px 40px 60px;text-align:center}}
.hero-tag{{font-size:.75rem;letter-spacing:.2em;text-transform:uppercase;color:#c9a96e;margin-bottom:16px}}
.hero h1{{font-family:'Cormorant Garamond',serif;font-size:3rem;font-weight:400;line-height:1.2;margin-bottom:20px}}
.hero p{{font-size:1.1rem;color:#9a9488;max-width:600px;margin:0 auto 36px}}
.btn{{display:inline-block;background:#c9a96e;color:#090c0f;padding:14px 36px;border-radius:8px;font-weight:500;font-size:.95rem;margin-right:12px}}
.btn-outline{{display:inline-block;border:1px solid #333;color:#c9a96e;padding:14px 36px;border-radius:8px;font-size:.95rem}}
.features{{max-width:1000px;margin:0 auto;padding:60px 40px;display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:28px}}
.feature{{background:#0e1318;border:1px solid #1a2028;border-radius:10px;padding:28px}}
.feature h2{{font-family:'Cormorant Garamond',serif;font-size:1.3rem;color:#c9a96e;margin-bottom:10px}}
.feature p{{font-size:.9rem;color:#7a8492;line-height:1.7}}
.faq{{max-width:760px;margin:0 auto;padding:60px 40px}}
.faq>h2{{font-family:'Cormorant Garamond',serif;font-size:2rem;font-weight:400;margin-bottom:32px;text-align:center}}
.faq-item{{border-bottom:1px solid #1a2028;padding:22px 0}}
.faq-item h3{{font-size:1rem;font-weight:500;color:#e0dbd4;margin-bottom:8px}}
.faq-item p{{font-size:.9rem;color:#7a8492;line-height:1.7}}
.cta-band{{background:#0e1318;border-top:1px solid #1a2028;border-bottom:1px solid #1a2028;text-align:center;padding:60px 40px}}
.cta-band h2{{font-family:'Cormorant Garamond',serif;font-size:2.2rem;font-weight:400;margin-bottom:12px}}
.cta-band p{{color:#9a9488;margin-bottom:28px}}
.footer{{text-align:center;padding:30px;color:#3a4048;font-size:.8rem}}
@media(max-width:600px){{.hero h1{{font-size:2rem}}.nav{{padding:16px 20px}}.hero{{padding:60px 20px 40px}}}}
</style>
</head>
<body>
<nav class="nav">
  <a href="/" class="nav-logo">Novalis IA</a>
  <a href="/#contact" class="nav-cta">Essai gratuit 7 jours</a>
</nav>
<div class="hero">
  <div class="hero-tag">Novalis IA — Québec</div>
  <h1>{h1}</h1>
  <p>{intro}</p>
  <a href="/#contact" class="btn">Essai gratuit 7 jours</a>
  <a href="/" class="btn-outline">Voir nos forfaits</a>
</div>
<div class="features">{sections_html}</div>
<div class="cta-band">
  <h2>Prêt à automatiser votre entreprise ?</h2>
  <p>Résultats mesurables en 30 jours ou votre argent remis.</p>
  <a href="/#contact" class="btn">Commencer maintenant — gratuit 7 jours</a>
</div>
<div class="faq">
  <h2>Questions fréquentes</h2>
  {faq_html}
</div>
<div class="footer">
  © 2025 Novalis IA — <a href="/">novalisia.ca</a> — Automatisation IA pour PME québécoises
</div>
</body>
</html>'''

pages = [
  ("chatbot-ia-quebec",
   "Chatbot IA en français québécois pour PME | Novalis IA",
   "Novalis IA déploie un chatbot IA en français québécois pour votre PME. Répondez à vos clients 24h/24 sur SMS, Messenger et votre site. Essai gratuit 7 jours.",
   "Chatbot IA en français québécois — pour votre PME",
   "Novalis IA déploie un agent conversationnel entraîné sur votre entreprise. Il répond à vos clients 24h/24, gère les objections et transfère les cas complexes à votre équipe.",
   [
     ("Répond en français québécois naturel", "Notre IA détecte automatiquement la langue du client — français québécois ou anglais canadien — et répond dans son registre sans configuration."),
     ("Entraîné sur votre entreprise", "Importez vos FAQ, fiches de services, politiques et tarifs. L'agent répond avec précision sans jamais inventer d'information."),
     ("Actif sur tous vos canaux", "Un seul agent gère simultanément vos SMS, Messenger, WhatsApp et widget de site web. Zéro message sans réponse."),
     ("Transfert intelligent vers vos employés", "Quand un client est frustré ou demande un humain, l'agent transfère l'appel ou le chat en quelques secondes avec un résumé complet."),
     ("Analyses et rapports hebdomadaires", "Chaque semaine, recevez un rapport : volume de conversations, taux de résolution, sentiments clients, sujets les plus demandés."),
     ("Installation en 48 heures", "Pas de développement, pas d'intégration complexe. Votre chatbot est opérationnel en 48 heures après votre inscription."),
   ],
   [
     ("Combien coûte un chatbot IA pour PME au Québec ?", "Novalis IA propose des forfaits à partir de 39 $/mois pour un agent SMS et voix. Aucun frais d'installation. Essai gratuit 7 jours sans carte de crédit."),
     ("Mon chatbot comprend-il vraiment le français québécois ?", "Oui. Nos agents sont optimisés pour le français québécois — expressions locales, tutoiement, registre informel — pas seulement le français standard."),
     ("Combien de temps pour installer le chatbot ?", "48 heures. Vous importez votre contenu (FAQ, services, prix), on configure l'agent, et il est en ligne. Aucune compétence technique requise."),
     ("Est-ce que le chatbot peut prendre des rendez-vous ?", "Oui. L'agent peut consulter votre calendrier, proposer des créneaux disponibles et confirmer des rendez-vous par SMS ou courriel automatiquement."),
   ]
  ),
  ("automatisation-ia-pme-quebec",
   "Automatisation IA pour PME Québec — Économisez 10h/semaine | Novalis IA",
   "Automatisez votre service client, vos ventes et vos rendez-vous avec l'IA. Novalis IA aide les PME québécoises à économiser du temps et augmenter leurs revenus. Essai 7 jours gratuit.",
   "Automatisation IA pour PME québécoises — résultats en 30 jours",
   "Novalis IA automatise les tâches répétitives de votre PME : répondre aux questions, prendre des rendez-vous, qualifier des prospects, envoyer des suivis. Vos employés se concentrent sur ce qui compte.",
   [
     ("Service client automatisé 24h/24", "Votre agent IA répond aux questions courantes à toute heure, même le soir et la fin de semaine. Zéro heure supplémentaire pour votre équipe."),
     ("Prise de rendez-vous automatique", "Les clients réservent directement via SMS ou votre site. L'IA vérifie vos disponibilités, confirme et envoie des rappels. Réduction des no-shows de 40 %."),
     ("Qualification automatique des prospects", "L'agent pose les bonnes questions, identifie les prospects chauds et les transmet à votre équipe de vente avec un résumé complet."),
     ("Suivi automatique après chaque interaction", "Envoi automatique d'un courriel ou SMS de suivi après chaque appel, rendez-vous ou achat. Augmentez votre taux de rétention sans effort."),
     ("Intégration avec vos outils existants", "Novalis IA s'intègre avec Google Calendar, votre CRM, Airtable, Shopify et la plupart des outils que vous utilisez déjà."),
     ("ROI mesurable dès le premier mois", "Nos clients économisent en moyenne 8 à 15 heures par semaine et augmentent leur taux de conversion de 15 à 30 % dans les 30 premiers jours."),
   ],
   [
     ("Qu'est-ce que l'automatisation IA peut faire pour ma PME ?", "Elle prend en charge les réponses aux clients, la prise de rendez-vous, la qualification de prospects, les suivis automatiques et les rappels — tout ce qui est répétitif et chronophage pour votre équipe."),
     ("Mon entreprise est-elle trop petite pour l'IA ?", "Non. Nos forfaits débutent à 39 $/mois et sont conçus pour les PME de 1 à 50 employés. Plus votre entreprise est petite, plus l'impact est visible rapidement."),
     ("Combien de temps avant de voir des résultats ?", "La majorité de nos clients voient une réduction significative du volume d'appels entrants et une augmentation des réservations dès les 2 premières semaines."),
     ("Mes données clients sont-elles en sécurité ?", "Toutes les données sont hébergées au Canada. Novalis IA est conforme à la Loi 25 (Québec) avec chiffrement AES-256 et zéro revente de données."),
   ]
  ),
  ("agent-vocal-ia-quebec",
   "Agent vocal IA pour entreprises québécoises — 24h/24 | Novalis IA",
   "Un agent vocal IA répond à vos appels en français québécois 24h/24. Transfert vers humain, prise de rendez-vous, résumé automatique. Novalis IA — essai gratuit 7 jours.",
   "Agent vocal IA — ne manquez plus jamais un appel client",
   "Votre agent vocal Novalis IA décroche chaque appel, répond en français québécois naturel, prend des rendez-vous et transfère les cas urgents à votre équipe. Disponible 24h/24, 7j/7.",
   [
     ("Voix humaine en français québécois", "Propulsé par ElevenLabs, votre agent vocal parle avec une voix naturelle et chaleureuse. Les clients ne savent pas qu'ils parlent à une IA — sauf s'ils le demandent."),
     ("Répond à chaque appel en moins de 2 secondes", "Fini les appels manqués, les messageries pleines et les clients qui appellent la concurrence. Votre agent décroche immédiatement, même à 23h."),
     ("Transfert intelligent vers votre équipe", "Quand le client est frustré, demande un humain ou pose une question urgente, l'agent transfère l'appel en quelques secondes avec un résumé vocal automatique."),
     ("Résumé de chaque appel dans votre CRM", "Après chaque appel, un résumé structuré est envoyé : qui a appelé, pourquoi, ce qui a été dit, et si un suivi est nécessaire. Rien ne se perd."),
     ("Prise de rendez-vous vocale", "Le client dit quand il veut un rendez-vous. L'agent vérifie votre calendrier en temps réel et confirme directement pendant l'appel."),
     ("Fonctionne avec votre numéro existant", "Pas besoin de changer de numéro. On transfère simplement vos appels vers l'agent Novalis IA via votre téléphonie existante."),
   ],
   [
     ("Comment fonctionne un agent vocal IA ?", "L'agent répond à vos appels, comprend ce que dit le client grâce à la reconnaissance vocale, génère une réponse intelligente et la prononce avec une voix naturelle. Le tout en moins d'une seconde."),
     ("L'agent peut-il transférer les appels à mes employés ?", "Oui. Vous définissez les conditions de transfert : si le client demande un humain, est frustré, ou si la demande dépasse les capacités de l'agent. Le transfert se fait en 2 secondes."),
     ("Est-ce que l'agent parle vraiment comme un Québécois ?", "Oui. Nous utilisons des voix ElevenLabs optimisées pour le français québécois, avec les bonnes intonations et expressions locales."),
     ("Quel est le prix d'un agent vocal IA pour mon entreprise ?", "L'agent vocal est inclus dans notre forfait Pro à 149 $/mois. Cela inclut les minutes d'appels, le résumé automatique et l'intégration CRM. Essai gratuit 7 jours."),
   ]
  ),
]

for slug, *args in pages:
    html = page(slug, *args)
    path = os.path.join(DIST, f"{slug}.html")
    with open(path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"✓ {path}")

print("Done")
