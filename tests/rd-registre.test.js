import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { genererRegistre, genererMarkdown } from '../core/rd-registre.js';

// Base de test avec le schéma minimal que lit le registre.
function db() {
  const d = new Database(':memory:');
  d.exec(`
    CREATE TABLE clients (id INTEGER PRIMARY KEY, nom TEXT);
    CREATE TABLE jobs (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT, status TEXT, attempts INTEGER DEFAULT 1);
    CREATE TABLE job_steps (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER, step_name TEXT, status TEXT);
    CREATE TABLE llm_calls (id INTEGER PRIMARY KEY AUTOINCREMENT, step_name TEXT, model TEXT,
      input_tokens INTEGER, output_tokens INTEGER, cout_cents REAL);
    CREATE TABLE rd_journal (id INTEGER PRIMARY KEY AUTOINCREMENT, axe TEXT, hypothese TEXT, mesure TEXT,
      valeur_avant REAL, valeur_apres REAL, heures REAL DEFAULT 0, resultat TEXT DEFAULT 'en_cours',
      notes TEXT, job_id INTEGER, client_id INTEGER, cree_le TEXT DEFAULT (datetime('now')));
  `);
  return d;
}

describe('registre de R&D', () => {
  it('regroupe les itérations par axe et cumule les heures', () => {
    const d = db();
    const ins = d.prepare(`INSERT INTO rd_journal (axe, hypothese, mesure, valeur_avant, valeur_apres, heures, resultat, cree_le)
      VALUES (?,?,?,?,?,?,?,?)`);
    ins.run('edition-portee-bornee', 'Un correctif ciblé casse moins qu\'une réécriture', 'taux de régression (%)', 40, 28, 6, 'progres', '2026-08-01 10:00:00');
    ins.run('edition-portee-bornee', 'Le diff DOM détecte la portée', 'taux de régression (%)', 28, 15, 8, 'progres', '2026-08-05 10:00:00');
    ins.run('conformite-design', 'Une distance CIELAB corrèle au jugement humain', 'corrélation', null, 0.7, 4, 'concluant', '2026-08-03 10:00:00');

    const r = genererRegistre(d);
    expect(r.axes.length).toBe(2);
    const edition = r.axes.find(a => a.axe === 'edition-portee-bornee');
    expect(edition.iterations).toBe(2);
    expect(edition.heures_totales).toBe(14);
    expect(edition.resultat_courant).toBe('progres');
  });

  it('agrège la preuve d\'exécution et le coût', () => {
    const d = db();
    d.prepare('INSERT INTO jobs (type, status, attempts) VALUES (?,?,?)').run('genere-site-ia', 'done', 1);
    d.prepare('INSERT INTO jobs (type, status, attempts) VALUES (?,?,?)').run('genere-site-ia', 'done', 3); // reprise
    d.prepare('INSERT INTO jobs (type, status, attempts) VALUES (?,?,?)').run('modifie-site-ia', 'dead', 4); // échec
    d.prepare('INSERT INTO job_steps (job_id, step_name, status) VALUES (1,?,?)').run('generation-html', 'done');
    d.prepare('INSERT INTO llm_calls (step_name, model, input_tokens, output_tokens, cout_cents) VALUES (?,?,?,?,?)')
      .run('generation-html', 'claude-sonnet-5', 1200, 40000, 42);

    const r = genererRegistre(d);
    expect(r.executions.jobs_total).toBe(3);
    expect(r.executions.reprises).toBe(2); // les deux jobs à attempts>1 (dont le mort, retenté 4×)
    expect(r.executions.echecs).toBe(1);
    expect(r.executions.steps_total).toBe(1);
    expect(r.cout.appels_llm).toBe(1);
    expect(r.cout.tokens_out).toBe(40000);
    expect(r.cout.par_axe_step[0].step_name).toBe('generation-html');
  });

  it('produit un Markdown avec les trois sections', () => {
    const d = db();
    d.prepare(`INSERT INTO rd_journal (axe, hypothese, mesure, heures, resultat) VALUES (?,?,?,?,?)`)
      .run('auto-correction', 'Réinjecter le diagnostic améliore le 2e essai', 'taux de succès au 2e essai (%)', 3, 'en_cours');
    const md = genererMarkdown(d);
    expect(md).toContain('# Registre de R&D — Novalis');
    expect(md).toContain('Axes d\'investigation');
    expect(md).toContain('Preuve d\'exécution');
    expect(md).toContain('auto-correction');
  });

  it('ne tombe pas si les tables sont absentes', () => {
    const vide = new Database(':memory:');
    const r = genererRegistre(vide);
    expect(r.axes).toEqual([]);
    expect(r.executions.jobs_total).toBe(0);
    expect(() => genererMarkdown(vide)).not.toThrow();
  });
});
