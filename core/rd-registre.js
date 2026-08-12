'use strict';
// ── Registre de R&D exportable (RS&DE / IRAP) ────────────────────────
// Assemble, à partir des tables déjà tenues par le système, un dossier de
// R&D défendable devant un conseiller technique. Deux couches :
//
//   1. INTENTION SCIENTIFIQUE — la table rd_journal : par axe d'investigation,
//      les hypothèses testées, la métrique, la valeur avant/après, le temps
//      humain, le résultat. C'est ce qu'un conseiller lit en premier.
//
//   2. PREUVE D'EXÉCUTION — jobs, job_steps, llm_calls : la trace horodatée
//      de chaque exécution du moteur, avec les reprises, les échecs et le
//      coût réel par appel. C'est ce qui rend l'intention crédible.
//
// Le module ne fait que LIRE. Il expose l'objet structuré (pour l'API/JSON)
// et un rendu Markdown prêt à joindre à un dossier.

/** @param {import('better-sqlite3').Database} db */
function genererRegistre(db) {
  const aTable = (nom) => !!db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(nom);

  // ── Couche 1 : intention (rd_journal) ──────────────────────────────
  const axes = [];
  if (aTable('rd_journal')) {
    const lignes = db.prepare(`SELECT axe, hypothese, mesure, valeur_avant, valeur_apres,
        heures, resultat, notes, cree_le
      FROM rd_journal ORDER BY axe, cree_le`).all();
    const parAxe = new Map();
    for (const l of lignes) {
      if (!parAxe.has(l.axe)) parAxe.set(l.axe, []);
      parAxe.get(l.axe).push(l);
    }
    for (const [axe, iterations] of parAxe) {
      axes.push({
        axe,
        iterations: iterations.length,
        heures_totales: round(iterations.reduce((s, i) => s + (i.heures || 0), 0)),
        resultat_courant: iterations[iterations.length - 1].resultat,
        entrees: iterations,
      });
    }
  }

  // ── Couche 2 : preuve d'exécution ─────────────────────────────────
  const executions = { jobs_total: 0, steps_total: 0, reprises: 0, echecs: 0, par_type: [] };
  const cout = { appels_llm: 0, tokens_in: 0, tokens_out: 0, cout_cad: 0, par_axe_step: [] };

  if (aTable('jobs')) {
    const j = db.prepare(`SELECT COUNT(*) n,
        COALESCE(SUM(CASE WHEN attempts > 1 THEN 1 ELSE 0 END),0) reprises,
        COALESCE(SUM(CASE WHEN status IN ('failed','dead') THEN 1 ELSE 0 END),0) echecs
      FROM jobs`).get();
    executions.jobs_total = j.n;
    executions.reprises = j.reprises;
    executions.echecs = j.echecs;
    executions.par_type = db.prepare(`SELECT type, COUNT(*) n,
        COALESCE(SUM(CASE WHEN status='done' THEN 1 ELSE 0 END),0) reussis
      FROM jobs GROUP BY type ORDER BY n DESC`).all();
  }
  if (aTable('job_steps')) {
    executions.steps_total = db.prepare('SELECT COUNT(*) n FROM job_steps').get().n;
  }
  if (aTable('llm_calls')) {
    const c = db.prepare(`SELECT COUNT(*) n,
        COALESCE(SUM(input_tokens),0) ti, COALESCE(SUM(output_tokens),0) to_,
        COALESCE(SUM(cout_cents),0) cents FROM llm_calls`).get();
    cout.appels_llm = c.n;
    cout.tokens_in = c.ti;
    cout.tokens_out = c.to_;
    cout.cout_cad = round(c.cents / 100); // cents USD → on documente le brut ; conversion laissée au dossier
    // Coût par étape du pipeline : montre OÙ va l'effort de calcul de R&D.
    cout.par_axe_step = db.prepare(`SELECT step_name, COUNT(*) appels,
        ROUND(COALESCE(SUM(cout_cents),0),2) cents
      FROM llm_calls WHERE step_name IS NOT NULL
      GROUP BY step_name ORDER BY cents DESC`).all();
  }

  return {
    genere_le: new Date().toISOString(),
    axes,
    executions,
    cout,
  };
}

/** Rendu Markdown prêt à joindre à un dossier RS&DE / IRAP. */
function genererMarkdown(db) {
  const r = genererRegistre(db);
  const L = [];
  L.push('# Registre de R&D — Novalis');
  L.push('');
  L.push(`_Généré le ${r.genere_le}. Document de travail extrait automatiquement des systèmes de production ; à valider avec un conseiller._`);
  L.push('');

  L.push('## 1. Axes d\'investigation (intention scientifique)');
  L.push('');
  if (!r.axes.length) {
    L.push('_Aucune entrée dans le journal de R&D. Ajouter des hypothèses via la table `rd_journal` au fil des expériences._');
  } else {
    for (const a of r.axes) {
      L.push(`### ${a.axe}`);
      L.push('');
      L.push(`- Itérations : **${a.iterations}** · Temps humain cumulé : **${a.heures_totales} h** · État : **${a.resultat_courant}**`);
      L.push('');
      L.push('| Date | Hypothèse | Mesure | Avant | Après | Heures | Résultat |');
      L.push('|---|---|---|---:|---:|---:|---|');
      for (const e of a.entrees) {
        L.push(`| ${(e.cree_le || '').slice(0, 10)} | ${mdCell(e.hypothese)} | ${mdCell(e.mesure)} | ${num(e.valeur_avant)} | ${num(e.valeur_apres)} | ${num(e.heures)} | ${e.resultat} |`);
      }
      L.push('');
    }
  }

  L.push('## 2. Preuve d\'exécution');
  L.push('');
  L.push(`- Exécutions du moteur (jobs) : **${r.executions.jobs_total}** · étapes tracées : **${r.executions.steps_total}**`);
  L.push(`- Reprises (jobs ayant nécessité plus d'une tentative — trace d'itération) : **${r.executions.reprises}** · échecs conservés comme trace : **${r.executions.echecs}**`);
  if (r.executions.par_type.length) {
    L.push('');
    L.push('| Pipeline | Exécutions | Réussies |');
    L.push('|---|---:|---:|');
    for (const t of r.executions.par_type) L.push(`| ${mdCell(t.type)} | ${t.n} | ${t.reussis} |`);
  }
  L.push('');

  L.push('## 3. Effort de calcul (coût de R&D par étape)');
  L.push('');
  L.push(`- Appels au modèle : **${r.cout.appels_llm}** · jetons entrée : **${r.cout.tokens_in.toLocaleString('fr-CA')}** · sortie : **${r.cout.tokens_out.toLocaleString('fr-CA')}**`);
  if (r.cout.par_axe_step.length) {
    L.push('');
    L.push('| Étape du pipeline | Appels | Coût (¢) |');
    L.push('|---|---:|---:|');
    for (const s of r.cout.par_axe_step) L.push(`| ${mdCell(s.step_name)} | ${s.appels} | ${s.cents} |`);
  }
  L.push('');
  L.push('---');
  L.push('_Ce qui relève de la R&D admissible (incertitude technologique, expérimentation systématique) doit être séparé du développement d\'application courant dans les feuilles de temps. Ce registre documente la première couche ; il ne remplace pas cette séparation._');
  return L.join('\n');
}

function round(x) { return Math.round((x || 0) * 100) / 100; }
function num(x) { return (x === null || x === undefined) ? '—' : String(round(x)); }
function mdCell(s) { return String(s || '').replace(/\|/g, '\\|').replace(/\n+/g, ' ').slice(0, 300); }

module.exports = { genererRegistre, genererMarkdown };
