# Auto-generated landing page content
LANDING_HTML = """<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Novalis — Agence IA | Automatisation intelligente pour entreprises</title>
    <meta name="description" content="Novalis est une agence d'intelligence artificielle basée au Québec. On automatise vos processus, votre service client, votre marketing et vos opérations avec des solutions IA sur mesure.">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg: #0a0e17;
            --bg2: #0f1419;
            --card: #1a2332;
            --border: #1e3a5f;
            --accent: #38bdf8;
            --green: #34d399;
            --purple: #a855f7;
            --orange: #fb923c;
            --text: #e2e8f0;
            --muted: #94a3b8;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html { scroll-behavior: smooth; }
        body { font-family: 'Inter', -apple-system, sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; }

        nav {
            position: fixed; top: 0; width: 100%; z-index: 100;
            background: rgba(10, 14, 23, 0.85); backdrop-filter: blur(20px);
            border-bottom: 1px solid var(--border); padding: 16px 0;
        }
        .nav-inner {
            max-width: 1200px; margin: 0 auto; padding: 0 24px;
            display: flex; justify-content: space-between; align-items: center;
        }
        .logo {
            font-size: 1.5rem; font-weight: 900;
            background: linear-gradient(135deg, var(--accent), var(--green));
            -webkit-background-clip: text; -webkit-text-fill-color: transparent;
        }
        .nav-links { display: flex; gap: 32px; align-items: center; }
        .nav-links a { color: var(--muted); text-decoration: none; font-size: 0.9rem; font-weight: 500; transition: color 0.2s; }
        .nav-links a:hover { color: var(--accent); }
        .btn-nav {
            background: var(--accent); color: var(--bg); padding: 10px 24px;
            border-radius: 8px; font-weight: 700; font-size: 0.9rem;
            text-decoration: none; transition: all 0.2s;
        }
        .btn-nav:hover { background: var(--green); }

        .hero {
            padding: 160px 24px 100px; text-align: center;
            max-width: 1000px; margin: 0 auto; position: relative;
        }
        .hero::before {
            content: ''; position: absolute; top: 80px; left: 50%; transform: translateX(-50%);
            width: 700px; height: 700px;
            background: radial-gradient(circle, rgba(56,189,248,0.08) 0%, rgba(168,85,247,0.05) 40%, transparent 70%);
            border-radius: 50%; pointer-events: none;
        }
        .badge-hero {
            display: inline-block; padding: 8px 20px; border-radius: 50px;
            background: rgba(56,189,248,0.1); border: 1px solid rgba(56,189,248,0.3);
            font-size: 0.85rem; font-weight: 600; color: var(--accent);
            margin-bottom: 24px; position: relative;
        }
        .hero h1 {
            font-size: 3.5rem; font-weight: 900; line-height: 1.1;
            margin-bottom: 24px; position: relative;
        }
        .hero h1 span { background: linear-gradient(135deg, var(--accent), var(--purple)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .hero p { font-size: 1.2rem; color: var(--muted); max-width: 700px; margin: 0 auto 40px; position: relative; }
        .hero-buttons { display: flex; gap: 16px; justify-content: center; position: relative; flex-wrap: wrap; }
        .btn-primary {
            background: linear-gradient(135deg, var(--accent), #0ea5e9); color: #fff; padding: 16px 36px;
            border-radius: 12px; font-weight: 700; font-size: 1.05rem;
            text-decoration: none; transition: all 0.3s; border: none; cursor: pointer;
        }
        .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 8px 30px rgba(56,189,248,0.3); }
        .btn-secondary {
            background: transparent; color: var(--text); padding: 16px 36px;
            border-radius: 12px; font-weight: 700; font-size: 1.05rem;
            text-decoration: none; border: 1px solid var(--border); transition: all 0.3s;
        }
        .btn-secondary:hover { border-color: var(--accent); background: rgba(56,189,248,0.05); }

        .trust-bar {
            text-align: center; padding: 40px 24px 60px;
            color: var(--muted); font-size: 0.9rem;
        }
        .trust-logos { display: flex; justify-content: center; gap: 48px; margin-top: 16px; flex-wrap: wrap; }
        .trust-logos span { font-weight: 700; font-size: 1.1rem; opacity: 0.5; letter-spacing: 2px; text-transform: uppercase; }

        section { padding: 80px 24px; max-width: 1200px; margin: 0 auto; }
        .section-title { text-align: center; margin-bottom: 60px; }
        .section-title h2 { font-size: 2.4rem; font-weight: 800; margin-bottom: 16px; }
        .section-title p { color: var(--muted); font-size: 1.1rem; max-width: 650px; margin: 0 auto; }

        /* Services Grid */
        .services-grid {
            display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px;
        }
        .service-card {
            background: var(--card); border: 1px solid var(--border); border-radius: 16px;
            padding: 36px 28px; transition: all 0.3s; position: relative; overflow: hidden;
        }
        .service-card:hover { border-color: var(--accent); transform: translateY(-4px); }
        .service-icon {
            width: 52px; height: 52px; border-radius: 12px;
            display: flex; align-items: center; justify-content: center;
            font-size: 1.5rem; margin-bottom: 20px;
        }
        .service-card h3 { font-size: 1.2rem; font-weight: 700; margin-bottom: 12px; }
        .service-card p { color: var(--muted); font-size: 0.95rem; line-height: 1.7; }
        .service-card .tag { display: inline-block; margin-top: 16px; padding: 4px 12px; border-radius: 6px; font-size: 0.75rem; font-weight: 600; }

        .icon-blue { background: rgba(56,189,248,0.15); }
        .icon-green { background: rgba(52,211,153,0.15); }
        .icon-purple { background: rgba(168,85,247,0.15); }
        .icon-orange { background: rgba(251,146,60,0.15); }
        .tag-blue { background: rgba(56,189,248,0.1); color: var(--accent); }
        .tag-green { background: rgba(52,211,153,0.1); color: var(--green); }
        .tag-purple { background: rgba(168,85,247,0.1); color: var(--purple); }

        /* Process */
        .process-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 32px; }
        .process-step { text-align: center; position: relative; }
        .process-num {
            width: 48px; height: 48px; border-radius: 50%;
            background: linear-gradient(135deg, var(--accent), var(--purple));
            color: #fff; font-weight: 800; font-size: 1.2rem;
            display: flex; align-items: center; justify-content: center;
            margin: 0 auto 20px;
        }
        .process-step h3 { font-size: 1.05rem; font-weight: 700; margin-bottom: 8px; }
        .process-step p { color: var(--muted); font-size: 0.9rem; }

        /* Use Cases */
        .cases-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; }
        .case-card {
            background: var(--card); border: 1px solid var(--border); border-radius: 16px;
            padding: 32px; display: flex; gap: 20px; transition: all 0.3s;
        }
        .case-card:hover { border-color: var(--accent); }
        .case-icon { font-size: 2rem; flex-shrink: 0; }
        .case-card h3 { font-size: 1.1rem; font-weight: 700; margin-bottom: 8px; }
        .case-card p { color: var(--muted); font-size: 0.9rem; }
        .case-card .result { color: var(--green); font-weight: 700; font-size: 0.85rem; margin-top: 8px; }

        /* Pricing */
        .pricing-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; align-items: start; }
        .pricing-card {
            background: var(--card); border: 1px solid var(--border); border-radius: 16px;
            padding: 36px; transition: all 0.3s; position: relative;
        }
        .pricing-card.featured { border-color: var(--accent); transform: scale(1.03); }
        .pricing-card.featured::before {
            content: 'POPULAIRE'; position: absolute; top: -12px; left: 50%; transform: translateX(-50%);
            background: linear-gradient(135deg, var(--accent), var(--purple)); color: #fff;
            padding: 4px 16px; border-radius: 20px; font-size: 0.7rem; font-weight: 800; letter-spacing: 1px;
        }
        .pricing-card h3 { font-size: 1.3rem; font-weight: 700; margin-bottom: 8px; }
        .pricing-card .price { font-size: 2.8rem; font-weight: 900; margin: 16px 0; }
        .pricing-card .price span { font-size: 1rem; color: var(--muted); font-weight: 500; }
        .pricing-card .desc { color: var(--muted); font-size: 0.9rem; margin-bottom: 24px; }
        .pricing-card ul { list-style: none; margin-bottom: 32px; }
        .pricing-card li { padding: 8px 0; font-size: 0.9rem; color: var(--muted); border-bottom: 1px solid rgba(255,255,255,0.05); }
        .pricing-card li::before { content: '\2713'; color: var(--green); margin-right: 10px; font-weight: 700; }
        .pricing-btn {
            display: block; text-align: center; padding: 14px;
            border-radius: 10px; font-weight: 700; text-decoration: none;
            transition: all 0.2s; font-size: 0.95rem;
        }
        .pricing-btn-outline { border: 1px solid var(--border); color: var(--text); }
        .pricing-btn-outline:hover { border-color: var(--accent); background: rgba(56,189,248,0.05); }
        .pricing-btn-filled { background: var(--accent); color: var(--bg); }
        .pricing-btn-filled:hover { background: var(--green); }

        /* Tech Stack */
        .tech-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
        .tech-item {
            background: var(--card); border: 1px solid var(--border); border-radius: 12px;
            padding: 20px; text-align: center; font-weight: 600; font-size: 0.9rem;
            transition: all 0.2s;
        }
        .tech-item:hover { border-color: var(--accent); }
        .tech-item .ti { font-size: 1.5rem; margin-bottom: 8px; display: block; }

        /* Subventions banner */
        .subventions {
            background: linear-gradient(135deg, rgba(56,189,248,0.1), rgba(168,85,247,0.1));
            border: 1px solid var(--border); border-radius: 20px;
            padding: 48px; text-align: center; max-width: 900px; margin: 0 auto;
        }
        .subventions h3 { font-size: 1.5rem; font-weight: 800; margin-bottom: 12px; }
        .subventions p { color: var(--muted); max-width: 600px; margin: 0 auto; }
        .sub-badges { display: flex; gap: 16px; justify-content: center; margin-top: 20px; flex-wrap: wrap; }
        .sub-badge { background: rgba(52,211,153,0.1); color: var(--green); padding: 8px 16px; border-radius: 8px; font-size: 0.85rem; font-weight: 600; }

        /* CTA */
        .cta {
            text-align: center; padding: 100px 24px;
            background: linear-gradient(180deg, transparent, rgba(56,189,248,0.05), transparent);
        }
        .cta h2 { font-size: 2.5rem; font-weight: 900; margin-bottom: 16px; }
        .cta p { color: var(--muted); font-size: 1.1rem; margin-bottom: 40px; max-width: 600px; margin-left: auto; margin-right: auto; }

        /* Inquiry Form */
        .inquiry-form {
            max-width: 600px; margin: 40px auto 0; background: var(--card);
            border: 1px solid var(--border); border-radius: 16px; padding: 36px;
        }
        .inquiry-form input, .inquiry-form textarea, .inquiry-form select {
            width: 100%; padding: 14px; border-radius: 10px;
            border: 1px solid var(--border); background: var(--bg);
            color: var(--text); font-family: inherit; font-size: 0.95rem;
            margin-bottom: 16px; outline: none; transition: border 0.2s;
        }
        .inquiry-form input:focus, .inquiry-form textarea:focus, .inquiry-form select:focus { border-color: var(--accent); }
        .inquiry-form textarea { min-height: 120px; resize: vertical; }
        .inquiry-form label { display: block; font-weight: 600; font-size: 0.85rem; color: var(--muted); margin-bottom: 6px; }
        .form-success { display: none; text-align: center; padding: 40px; }
        .form-success h3 { color: var(--green); font-size: 1.3rem; margin-bottom: 8px; }

        /* Footer */
        footer {
            border-top: 1px solid var(--border); padding: 48px 24px;
            max-width: 1200px; margin: 0 auto;
            display: flex; justify-content: space-between; align-items: center;
            color: var(--muted); font-size: 0.85rem; flex-wrap: wrap; gap: 16px;
        }
        footer a { color: var(--muted); text-decoration: none; }
        footer a:hover { color: var(--accent); }

        @media (max-width: 768px) {
            .hero h1 { font-size: 2.2rem; }
            .services-grid, .pricing-grid { grid-template-columns: 1fr; }
            .process-grid { grid-template-columns: repeat(2, 1fr); }
            .cases-grid { grid-template-columns: 1fr; }
            .tech-grid { grid-template-columns: repeat(2, 1fr); }
            .nav-links { display: none; }
            .pricing-card.featured { transform: none; }
        }
    </style>
</head>
<body>

<nav>
    <div class="nav-inner">
        <div class="logo">NOVALIS</div>
        <div class="nav-links">
            <a href="#services">Services</a>
            <a href="#cases">Cas d'usage</a>
            <a href="#pricing">Tarifs</a>
            <a href="#contact" class="btn-nav">Demander une consultation</a>
        </div>
    </div>
</nav>

<div class="hero">
    <div class="badge-hero">Agence IA — Québec, Canada</div>
    <h1>On <span>automatise</span> tout ce qui peut l'être dans <span>votre entreprise</span></h1>
    <p>Novalis est une agence d'intelligence artificielle qui conçoit des solutions d'automatisation sur mesure. Service client, opérations, marketing, ventes — on identifie ce qui vous ralentit et on le remplace par de l'IA qui travaille 24/7.</p>
    <div class="hero-buttons">
        <a href="#contact" class="btn-primary">Consultation gratuite</a>
        <a href="#services" class="btn-secondary">Voir nos services</a>
    </div>
</div>

<div class="trust-bar">
    <p>Technologies de confiance</p>
    <div class="trust-logos">
        <span>OpenAI</span>
        <span>Twilio</span>
        <span>Railway</span>
        <span>Meta</span>
        <span>Python</span>
    </div>
</div>

<!-- SERVICES -->
<section id="services">
    <div class="section-title">
        <h2>Nos services d'automatisation IA</h2>
        <p>On ne vend pas un seul produit — on analyse votre business et on automatise ce qui a le plus d'impact sur vos revenus</p>
    </div>
    <div class="services-grid">
        <div class="service-card">
            <div class="service-icon icon-blue">💬</div>
            <h3>Agent conversationnel IA</h3>
            <p>Un agent IA qui répond a vos clients par SMS, téléphone et Messenger 24/7. Il prend des rendez-vous, répond aux questions et transfere les cas complexes a votre équipe.</p>
            <span class="tag tag-blue">Service client</span>
        </div>
        <div class="service-card">
            <div class="service-icon icon-green">⚡</div>
            <h3>Automatisation des processus</h3>
            <p>On identifie les tâches répétitives dans vos opérations et on les automatise : facturation, suivi de commandes, gestion d'inventaire, rapports automatiques.</p>
            <span class="tag tag-green">Operations</span>
        </div>
        <div class="service-card">
            <div class="service-icon icon-purple">📊</div>
            <h3>Analytics et rapport ROI</h3>
            <p>Tableau de bord en temps réel avec métriques de performance, taux de conversion, satisfaction client et calcul du retour sur investissement de chaque automatisation.</p>
            <span class="tag tag-purple">Intelligence</span>
        </div>
        <div class="service-card">
            <div class="service-icon icon-orange">🎯</div>
            <h3>Marketing automatisé</h3>
            <p>Campagnes SMS et email automatisées, relances intelligentes, segmentation client par IA, et génération de contenu marketing personnalisé.</p>
            <span class="tag tag-blue">Marketing</span>
        </div>
        <div class="service-card">
            <div class="service-icon icon-blue">🔗</div>
            <h3>Intégrations sur mesure</h3>
            <p>On connecte votre IA à vos outils existants : CRM, système de réservation, comptabilité, site web, réseaux sociaux. Tout communique ensemble.</p>
            <span class="tag tag-green">Integration</span>
        </div>
        <div class="service-card">
            <div class="service-icon icon-purple">🧠</div>
            <h3>Consultation stratégique IA</h3>
            <p>Audit complet de vos processus, identification des opportunités d'automatisation, plan d'implementation et accompagnement a chaque étape.</p>
            <span class="tag tag-purple">Strategie</span>
        </div>
    </div>
</section>

<!-- PROCESS -->
<section id="how">
    <div class="section-title">
        <h2>Comment ça fonctionne</h2>
        <p>De l'analyse initiale au déploiement, on s'occupe de tout</p>
    </div>
    <div class="process-grid">
        <div class="process-step">
            <div class="process-num">1</div>
            <h3>Consultation gratuite</h3>
            <p>On analyse votre entreprise, vos processus et vos points de friction pour identifier les meilleures opportunités d'automatisation.</p>
        </div>
        <div class="process-step">
            <div class="process-num">2</div>
            <h3>Proposition sur mesure</h3>
            <p>On vous présente un plan détaillé avec les solutions recommandées, les coûts, le calendrier et le ROI projeté.</p>
        </div>
        <div class="process-step">
            <div class="process-num">3</div>
            <h3>Développement et déploiement</h3>
            <p>Notre équipe développe, teste et déploie vos automatisations. Vous suivez chaque étape via votre portail client.</p>
        </div>
        <div class="process-step">
            <div class="process-num">4</div>
            <h3>Suivi et optimisation</h3>
            <p>On monitore les performances, on optimise en continu et on vous accompagne pour maximiser votre retour sur investissement.</p>
        </div>
    </div>
</section>

<!-- USE CASES -->
<section id="cases">
    <div class="section-title">
        <h2>Ce qu'on automatise</h2>
        <p>Quelques exemples concrets de mandats qu'on réalise pour nos clients</p>
    </div>
    <div class="cases-grid">
        <div class="case-card">
            <div class="case-icon">🏪</div>
            <div>
                <h3>Restaurant — Réservations automatiques</h3>
                <p>Agent IA qui prend les réservations par SMS et Messenger, confirme automatiquement, envoie des rappels et gère les annulations.</p>
                <div class="result">Résultat : 85% moins d'appels a gérer</div>
            </div>
        </div>
        <div class="case-card">
            <div class="case-icon">🔧</div>
            <div>
                <h3>Plombier — Gestion des appels</h3>
                <p>IA vocale qui répond aux appels d'urgence, trie par priorité, donne des estimations et planifie les interventions automatiquement.</p>
                <div class="result">Résultat : 0 appel manque, +40% de mandats</div>
            </div>
        </div>
        <div class="case-card">
            <div class="case-icon">🏥</div>
            <div>
                <h3>Clinique — Rappels et suivi patients</h3>
                <p>Système automatise de rappels de rendez-vous, suivi post-consultation, et réponses aux questions fréquentes des patients.</p>
                <div class="result">Résultat : 60% moins de no-shows</div>
            </div>
        </div>
        <div class="case-card">
            <div class="case-icon">🛒</div>
            <div>
                <h3>E-commerce — Support et relance</h3>
                <p>Agent IA pour le support client, suivi de commandes, relance de paniers abandonnés et recommandations personnalisées.</p>
                <div class="result">Résultat : +25% de taux de conversion</div>
            </div>
        </div>
        <div class="case-card">
            <div class="case-icon">🏗️</div>
            <div>
                <h3>Entrepreneur — Soumissions automatiques</h3>
                <p>IA qui génère des soumissions basées sur les descriptions de projets, calcule les coûts et envoie les propositions aux clients.</p>
                <div class="result">Résultat : Soumissions en minutes au lieu d'heures</div>
            </div>
        </div>
        <div class="case-card">
            <div class="case-icon">🏢</div>
            <div>
                <h3>Agence immobilière — Qualification de leads</h3>
                <p>Agent qui qualifie les prospects automatiquement, répond aux questions sur les proprietes et planifie les visites.</p>
                <div class="result">Résultat : 3x plus de visites qualifiées</div>
            </div>
        </div>
    </div>
</section>

<!-- SUBVENTIONS -->
<section>
    <div class="subventions">
        <h3>Admissible aux subventions gouvernementales</h3>
        <p>Nos projets d'automatisation IA sont admissibles à plusieurs programmes de subventions federales et provinciales pour l'innovation technologique.</p>
        <div class="sub-badges">
            <span class="sub-badge">PARI-CNRC</span>
            <span class="sub-badge">RS&DE</span>
            <span class="sub-badge">CDAE</span>
            <span class="sub-badge">PME en action</span>
            <span class="sub-badge">PACME</span>
        </div>
    </div>
</section>

<!-- PRICING -->
<section id="pricing">
    <div class="section-title">
        <h2>Nos formules</h2>
        <p>Des solutions adaptées a chaque taille d'entreprise et chaque budget</p>
    </div>
    <div class="pricing-grid">
        <div class="pricing-card">
            <h3>Starter</h3>
            <div class="price">497$<span>/mois</span></div>
            <p class="desc">Idéal pour les petites entreprises qui veulent commencer a automatiser</p>
            <ul>
                <li>1 agent conversationnel IA (SMS)</li>
                <li>Jusqu'a 500 conversations/mois</li>
                <li>Gestion de rendez-vous</li>
                <li>Tableau de bord analytics</li>
                <li>Support par email</li>
            </ul>
            <a href="#contact" class="pricing-btn pricing-btn-outline">Commencer</a>
        </div>
        <div class="pricing-card featured">
            <h3>Agence</h3>
            <div class="price">1 497$<span>/mois</span></div>
            <p class="desc">Pour les PME qui veulent une automatisation complete</p>
            <ul>
                <li>Agent IA multi-canal (SMS, voix, Messenger)</li>
                <li>Conversations illimitees</li>
                <li>2 automatisations sur mesure incluses</li>
                <li>Integrations CRM et outils</li>
                <li>Portail client avec suivi en temps réel</li>
                <li>Rapport ROI mensuel</li>
                <li>Support prioritaire</li>
            </ul>
            <a href="#contact" class="pricing-btn pricing-btn-filled">Choisir ce plan</a>
        </div>
        <div class="pricing-card">
            <h3>Enterprise</h3>
            <div class="price">Sur mesure</div>
            <p class="desc">Transformation IA complete pour les entreprises ambitieuses</p>
            <ul>
                <li>Audit complet de vos processus</li>
                <li>Automatisations illimitees</li>
                <li>IA entrainee sur vos donnees</li>
                <li>Développement d'outils proprietaires</li>
                <li>Gestionnaire de compte dedie</li>
                <li>SLA garanti 99.9%</li>
                <li>Accompagnement subventions</li>
            </ul>
            <a href="#contact" class="pricing-btn pricing-btn-outline">Nous contacter</a>
        </div>
    </div>
</section>

<!-- TECH -->
<section id="tech">
    <div class="section-title">
        <h2>Notre stack technologique</h2>
        <p>On utilise les meilleures technologies pour garantir performance, sécurité et fiabilite</p>
    </div>
    <div class="tech-grid">
        <div class="tech-item"><span class="ti">🤖</span>OpenAI GPT-4</div>
        <div class="tech-item"><span class="ti">📱</span>Twilio SMS/Voix</div>
        <div class="tech-item"><span class="ti">💬</span>Meta Messenger</div>
        <div class="tech-item"><span class="ti">🐍</span>Python FastAPI</div>
        <div class="tech-item"><span class="ti">☁️</span>Railway Cloud</div>
        <div class="tech-item"><span class="ti">🔐</span>Chiffrement AES-256</div>
        <div class="tech-item"><span class="ti">📊</span>Analytics temps réel</div>
        <div class="tech-item"><span class="ti">🔗</span>API REST publique</div>
    </div>
</section>

<!-- CTA / CONTACT -->
<div class="cta" id="contact">
    <h2>Prêt à automatiser votre entreprise?</h2>
    <p>Dites-nous ce que vous voulez automatiser. On vous revient en 24h avec une proposition concrete et un estimé du ROI.</p>

    <div class="inquiry-form" id="inquiryForm">
        <label>Votre nom</label>
        <input type="text" id="inqName" placeholder="Jean Tremblay">
        <label>Courriel</label>
        <input type="email" id="inqEmail" placeholder="jean@monentreprise.com">
        <label>Telephone</label>
        <input type="tel" id="inqPhone" placeholder="514-555-1234">
        <label>Nom de votre entreprise</label>
        <input type="text" id="inqBusiness" placeholder="Mon Entreprise Inc.">
        <label>Type de service recherche</label>
        <select id="inqService">
            <option value="">-- Sélectionnez --</option>
            <option value="chatbot">Agent conversationnel IA</option>
            <option value="automation">Automatisation de processus</option>
            <option value="marketing">Marketing automatisé</option>
            <option value="integration">Intégrations sur mesure</option>
            <option value="consulting">Consultation stratégique</option>
            <option value="custom">Projet personnalisé</option>
        </select>
        <label>Décrivez votre besoin</label>
        <textarea id="inqDesc" placeholder="Ex: Je veux automatiser la prise de rendez-vous et le suivi de mes clients par SMS..."></textarea>
        <button class="btn-primary" style="width:100%" onclick="submitInquiry()">Envoyer ma demande</button>
    </div>
    <div class="form-success" id="formSuccess">
        <h3>Demande envoyee!</h3>
        <p style="color:var(--muted)">On vous contacte dans les prochaines 24 heures pour discuter de votre projet.</p>
    </div>
</div>

<footer>
    <div>© 2026 Novalis — Agence IA | Québec, Canada</div>
    <div style="display:flex;gap:24px;">
        <a href="mailto:info@novalis.ai">info@novalis.ai</a>
        <a href="#services">Services</a>
        <a href="#pricing">Tarifs</a>
        <a href="#contact">Contact</a>
    </div>
</footer>

<script>
async function submitInquiry() {
    const data = {
        name: document.getElementById('inqName').value,
        email: document.getElementById('inqEmail').value,
        phone: document.getElementById('inqPhone').value,
        business_name: document.getElementById('inqBusiness').value,
        service_interest: document.getElementById('inqService').value,
        message: document.getElementById('inqDesc').value
    };
    if (!data.name || !data.email || !data.message) {
        alert('Veuillez remplir au minimum votre nom, courriel et description du besoin.');
        return;
    }
    try {
        const resp = await fetch('/api/v1/inquiry', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        });
        if (resp.ok) {
            document.getElementById('inquiryForm').style.display = 'none';
            document.getElementById('formSuccess').style.display = 'block';
        } else {
            alert('Erreur — veuillez réessayer ou nous contacter directement.');
        }
    } catch(e) {
        alert('Erreur de connexion — veuillez réessayer.');
    }
}
</script>

</body>
</html>
"""
