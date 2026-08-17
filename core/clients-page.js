'use strict';
// ── Novalis — Clients (le répertoire + la fiche 360) ────────────────
// Registre « document » : une ligne par personne, triée par activité récente,
// chiffres alignés. Un clic ouvre la fiche : résumé + toute la chronologie
// (messages, rendez-vous, devis) au même endroit. Rien d'inventé.

const { esc, icon, page } = require('./ui');

function dollars(cents) {
  return (Math.round((cents || 0) / 100)).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });
}
function jour(d) {
  if (!d) return '—';
  const s = String(d).slice(0, 10).split('-');
  return s.length === 3 ? `${s[2]}/${s[1]}/${s[0].slice(2)}` : String(d);
}
const pl = (n, s, p) => (n === 1 ? s : p);
const ETIQ_STATUT = { gagne: ['Gagné', 'ok'], contacte: ['Contacté', 'br'], nouveau: ['Nouveau', 'muted'], perdu: ['Perdu', 'warn'] };

const EXTRA = `
.rost{width:100%;border-collapse:collapse;font-size:14px}
.rost thead th{text-align:left;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:700;padding:0 14px 9px;border-bottom:2px solid var(--ink);white-space:nowrap}
.rost thead th.r{text-align:right}
.rost tbody td{padding:13px 14px;border-bottom:1px solid var(--line);vertical-align:middle}
.rost tbody tr{cursor:pointer}
.rost tbody tr:hover{background:var(--card)}
.rost .nm{font-family:var(--disp);font-size:16px;font-weight:600;letter-spacing:-.005em}
.rost .sl{font-size:12px;color:var(--faint);margin-top:1px}
.rost .n{text-align:right;font-variant-numeric:tabular-nums;font-size:15px;color:var(--ink);white-space:nowrap}
.rost .n.z{color:var(--faint)} .rost .n.acc{color:var(--brand-600);font-weight:600}
.rost .go{text-align:right;color:var(--brand-600);font-weight:600;white-space:nowrap}
.rost tbody tr:hover .go{text-decoration:underline}
.rost-empty{padding:22px 14px;border-bottom:1px solid var(--line);color:var(--muted);font-size:14px}
.tag{display:inline-block;font-size:11px;font-weight:700;padding:2px 8px;border-radius:var(--r-pill);border:1px solid var(--line-strong);color:var(--ink-2);white-space:nowrap}
.tag.ok{color:var(--ok);border-color:var(--ok-soft);background:var(--ok-soft)}
.tag.br{color:var(--brand-600);border-color:var(--brand-soft);background:var(--brand-soft)}
.tag.warn{color:var(--warn);border-color:var(--warn-soft);background:var(--warn-soft)}
.tag.muted{color:var(--muted)}
.srch{display:flex;gap:8px;align-items:center;margin:2px 0 14px}
.srch input{flex:1;font-family:var(--sans);font-size:14px;padding:9px 12px;border:1px solid var(--line-strong);border-radius:var(--r-sm);background:var(--card);color:var(--ink)}
.srch input:focus{outline:none;border-color:var(--brand)}
.srch .cnt{font-size:12.5px;color:var(--muted);white-space:nowrap}
/* Fiche */
.fiche-h{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;margin:6px 0 4px}
.fiche-id .nm{font-family:var(--disp);font-size:26px;font-weight:600;letter-spacing:-.01em}
.fiche-id .courriel{font-size:13.5px;color:var(--muted);margin-top:3px}
.fiche-id .courriel a{color:var(--brand-600);text-decoration:none} .fiche-id .courriel a:hover{text-decoration:underline}
.back{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--brand-600);text-decoration:none;font-weight:600;margin-bottom:6px}
.back:hover{text-decoration:underline}
.tl{list-style:none;margin:6px 0 0;padding:0;position:relative}
.tl:before{content:"";position:absolute;left:7px;top:6px;bottom:6px;width:2px;background:var(--line)}
.tl li{position:relative;padding:0 0 20px 30px}
.tl .mk{position:absolute;left:0;top:3px;width:16px;height:16px;border-radius:50%;background:var(--card);border:2px solid var(--line-strong)}
.tl li.message .mk{border-color:var(--brand)} .tl li.rdv .mk{border-color:var(--ok)} .tl li.devis .mk{border-color:var(--warn)}
.tl .tt{font-weight:640;font-size:14.5px}
.tl .dd{font-size:12px;color:var(--faint);font-variant-numeric:tabular-nums}
.tl .ap{font-size:13.5px;color:var(--ink-2);margin-top:3px;white-space:pre-wrap}
.tl .mt{font-size:12px;color:var(--muted);margin-top:3px}
.tl-empty{color:var(--muted);font-size:14px;padding:14px 0}
`;

// ── Répertoire (roster) ─────────────────────────────────────────────
function renderRepertoire(d) {
  const rows = (d.clients || []).map((c) => {
    const href = `/core/clients?source=${encodeURIComponent(d.source)}&client=${encodeURIComponent(c.cle)}${d.pass ? '&pass=' + encodeURIComponent(d.pass) : ''}`;
    const [lab, ton] = ETIQ_STATUT[c.statut] || ETIQ_STATUT.nouveau;
    return `<tr onclick="location.href='${href}'">
      <td><div class="nm">${esc(c.nom)}</div>${c.courriel ? `<div class="sl">${esc(c.courriel)}</div>` : ''}</td>
      <td><span class="tag ${ton}">${lab}</span></td>
      <td class="n ${c.messages ? '' : 'z'}">${c.messages}</td>
      <td class="n ${c.rdv ? '' : 'z'}">${c.rdv}</td>
      <td class="n ${c.devis ? 'acc' : 'z'}">${c.devis}</td>
      <td class="n ${c.valeur_cents ? 'acc' : 'z'}">${c.valeur_cents ? dollars(c.valeur_cents) : '—'}</td>
      <td class="n ${c.dernier ? '' : 'z'}">${jour(c.dernier)}</td>
      <td class="go">Ouvrir →</td>
    </tr>`;
  }).join('');

  const content = `
    <div class="section-label">Répertoire</div>
    <div class="led">
      <div class="it"><div class="k">Personnes connues</div><div class="v">${d.total}</div><div class="sub">tout contact enregistré</div></div>
      <div class="it"><div class="k">Clients gagnés</div><div class="v">${d.gagnes}</div><div class="sub">marqués « gagné »</div></div>
      <div class="it"><div class="k">Valeur gagnée</div><div class="v">${dollars(d.valeur_cents)}</div><div class="sub">somme des clients gagnés</div></div>
    </div>
    <form class="srch" method="get" action="/core/clients">
      <input type="hidden" name="source" value="${esc(d.source)}">
      ${d.pass ? `<input type="hidden" name="pass" value="${esc(d.pass)}">` : ''}
      <input name="q" value="${esc(d.q || '')}" placeholder="Rechercher un nom ou un courriel…" autocomplete="off" aria-label="Rechercher un client">
      <span class="cnt">${d.affiches} ${pl(d.affiches, 'personne', 'personnes')}${d.q ? ` sur ${d.total}` : ''}</span>
    </form>
    <table class="rost">
      <thead><tr>
        <th>Client</th><th>Statut</th>
        <th class="r">Messages</th><th class="r">RDV</th><th class="r">Devis</th>
        <th class="r">Valeur</th><th class="r">Dernière activité</th><th></th>
      </tr></thead>
      <tbody>${rows || `<tr><td colspan="8" class="rost-empty">${d.q ? 'Aucun client ne correspond à cette recherche.' : 'Aucun client encore. Ils apparaissent dès le premier message, rendez-vous ou devis.'}</td></tr>`}</tbody>
    </table>
    <div class="pagefoot">Une personne = tous ses échanges au même endroit. Regroupé par courriel, sinon par nom.</div>`;

  return page({
    title: 'Clients',
    subtitle: 'Chaque personne et tout son historique — messages, rendez-vous, devis',
    active: 'clients', source: d.source, pass: d.pass, sources: d.sources, alertes: d.alertes,
    extraCss: EXTRA, contentHtml: content,
  });
}

// ── Fiche (détail d'une personne) ───────────────────────────────────
function renderFiche(d) {
  const f = d.fiche;
  const back = `/core/clients?source=${encodeURIComponent(d.source)}${d.pass ? '&pass=' + encodeURIComponent(d.pass) : ''}`;
  const [lab, ton] = ETIQ_STATUT[f.statut] || ETIQ_STATUT.nouveau;
  const cc = f.compteurs;

  const strip = [
    ['Messages', cc.messages, 'reçus'],
    ['Rendez-vous', cc.rdv, 'au carnet'],
    ['Devis préparés', cc.devis, ''],
    ['Valeur gagnée', f.gagne ? dollars(f.valeur_cents) : '—', f.gagne ? 'client gagné' : 'pas encore gagné'],
  ].map(([k, v, s]) => `<div class="it"><div class="k">${k}</div><div class="v">${v}</div><div class="sub">${esc(s)}</div></div>`).join('');

  const tl = (f.evenements || []).map((e) => `<li class="${esc(e.genre)}">
      <span class="mk"></span>
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:baseline;flex-wrap:wrap">
        <span class="tt">${esc(e.titre)}</span><span class="dd">${jour(e.date)}</span>
      </div>
      ${e.apercu ? `<div class="ap">${esc(e.apercu)}</div>` : ''}
      ${e.meta ? `<div class="mt">${esc(e.meta)}</div>` : ''}
    </li>`).join('');

  const content = `
    <a class="back" href="${back}">← Répertoire</a>
    <div class="fiche-h">
      <div class="fiche-id">
        <div class="nm">${esc(f.nom)}</div>
        ${f.courriel ? `<div class="courriel"><a href="mailto:${esc(f.courriel)}">${esc(f.courriel)}</a></div>` : '<div class="courriel">Aucun courriel enregistré</div>'}
      </div>
      <span class="tag ${ton}" style="font-size:12.5px;padding:5px 12px">${lab}</span>
    </div>
    <div class="led" style="margin-top:14px">${strip}</div>
    <div class="section-label">Premier contact&nbsp;: ${jour(f.premier)} · Dernière activité&nbsp;: ${jour(f.dernier)}</div>
    <div class="section-label">Chronologie</div>
    ${tl ? `<ul class="tl">${tl}</ul>` : '<div class="tl-empty">Aucun événement enregistré.</div>'}
    <div class="pagefoot">Chaque ligne est un échange réel enregistré par Novalis. Rien n’est ajouté.</div>`;

  return page({
    title: f.nom,
    subtitle: 'Fiche client',
    active: 'clients', source: d.source, pass: d.pass, sources: d.sources, alertes: d.alertes,
    actionsHtml: `<a class="btn btn-ghost" href="${back}">${icon('grid')} Répertoire</a>`,
    extraCss: EXTRA, contentHtml: content,
  });
}

function renderClients(d) {
  return d && d.fiche ? renderFiche(d) : renderRepertoire(d);
}

module.exports = { renderClients };
