'use strict';
// ── Novalis Réception — rendu HTML (cockpit + rapport client) ─────────
// Rendu côté serveur, sans étape de build (comme core/admin-page.js). Deux
// vues partagent la même identité visuelle : le cockpit d'exploitation (interne)
// et le rapport mensuel (envoyé au commerçant via une URL signée).

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function dollars(cents) {
  return (Math.round((cents || 0) / 100)).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });
}
function ilYA(iso) {
  const t = Date.parse(String(iso).replace(' ', 'T') + 'Z');
  if (Number.isNaN(t)) return '';
  const min = Math.floor((Date.now() - t) / 60000);
  if (min < 1) return 'à l\'instant';
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.floor(h / 24)} j`;
}

const CSS = `
:root{
  --paper:#FAF9F4; --card:#FFFFFF; --panel:#F3F1E9; --ink:#181B14; --ink-2:#3C4034;
  --muted:#6A6F60; --faint:rgba(24,27,20,.5);
  --jade:#2B5B42; --jade-soft:rgba(43,91,66,.10); --steel:#3E5F7D;
  --ok:#2E6B45; --ok-soft:rgba(46,107,69,.12);
  --warn:#8A5E22; --warn-soft:rgba(138,94,34,.13);
  --risk:#9C4632; --risk-soft:rgba(156,70,50,.11);
  --hair:rgba(24,27,20,.12); --hair-2:rgba(24,27,20,.07);
  --shadow:0 1px 2px rgba(24,27,20,.04), 0 10px 34px rgba(24,27,20,.06);
  --serif:'Iowan Old Style',Palatino,Georgia,serif;
  --sans:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
}
@media(prefers-color-scheme:dark){:root{
  --paper:#14160F; --card:#1E2118; --panel:#1B1E15; --ink:#ECEBE0; --ink-2:#C7C9BB;
  --muted:#9AA08D; --faint:rgba(236,235,224,.5);
  --jade:#7FB894; --jade-soft:rgba(127,184,148,.12); --steel:#8FB3D4;
  --ok:#7FB894; --ok-soft:rgba(127,184,148,.14);
  --warn:#D8B071; --warn-soft:rgba(216,176,113,.14);
  --risk:#E0967F; --risk-soft:rgba(224,150,127,.14);
  --hair:rgba(236,235,224,.15); --hair-2:rgba(236,235,224,.08);
  --shadow:0 1px 2px rgba(0,0,0,.3), 0 12px 36px rgba(0,0,0,.4);
}}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--paper);color:var(--ink);font-family:var(--sans);line-height:1.5;-webkit-font-smoothing:antialiased}
.wrap{max-width:1080px;margin:0 auto;padding:clamp(20px,4vw,40px)}
a{color:var(--jade)}
.topbar{display:flex;align-items:baseline;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:6px}
.brand{font-family:var(--serif);font-weight:700;font-size:clamp(24px,3.4vw,32px);letter-spacing:-.01em}
.brand em{font-style:normal;color:var(--jade)}
.sub{color:var(--muted);font-size:14px;margin-bottom:28px}
.sel{font-family:var(--sans);font-size:14px;padding:8px 12px;border:1px solid var(--hair);border-radius:10px;background:var(--card);color:var(--ink)}
.hero{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:16px}
.tile{background:var(--card);border:1px solid var(--hair);border-radius:16px;padding:22px 24px;box-shadow:var(--shadow)}
.tile .k{font-size:12px;font-weight:650;letter-spacing:.07em;text-transform:uppercase;color:var(--muted)}
.tile .v{font-family:var(--serif);font-size:clamp(34px,5vw,48px);font-weight:700;line-height:1;margin-top:12px;
  font-variant-numeric:tabular-nums;letter-spacing:-.02em}
.tile .d{font-size:13px;color:var(--muted);margin-top:10px}
.tile.value .v{color:var(--jade)}
.tile.hh .v{color:var(--warn)}
.row2{display:grid;grid-template-columns:1.1fr 1.4fr;gap:16px;margin-bottom:16px}
.panel{background:var(--card);border:1px solid var(--hair);border-radius:16px;padding:22px 24px;box-shadow:var(--shadow)}
.panel h3{font-family:var(--serif);font-size:17px;font-weight:700;margin-bottom:2px}
.panel .hint{font-size:12.5px;color:var(--muted);margin-bottom:16px}
.gauge{display:flex;align-items:center;gap:14px;margin-top:6px}
.light{width:14px;height:14px;border-radius:50%;flex:none}
.light.ok{background:var(--ok)} .light.warn{background:var(--warn)} .light.risk{background:var(--risk)}
.gauge .big{font-family:var(--serif);font-size:30px;font-weight:700;font-variant-numeric:tabular-nums}
.gauge .lbl{font-size:13px;color:var(--muted)}
.attente{margin-top:18px;padding:12px 16px;border-radius:11px;font-size:14px;font-weight:600}
.attente.some{background:var(--warn-soft);color:var(--warn)}
.attente.none{background:var(--ok-soft);color:var(--ok)}
.spark{width:100%;height:96px;display:block;margin-top:8px}
.spark .area{fill:var(--jade-soft)} .spark .line{fill:none;stroke:var(--jade);stroke-width:2}
.spark .dot{fill:var(--jade)}
table{width:100%;border-collapse:collapse}
.leads-wrap{overflow-x:auto}
th{text-align:left;font-size:11.5px;font-weight:650;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);
  padding:0 12px 10px;border-bottom:1px solid var(--hair)}
td{padding:14px 12px;border-bottom:1px solid var(--hair-2);font-size:14px;vertical-align:top}
tr:last-child td{border-bottom:none}
.who{font-weight:620} .who .mail{display:block;font-size:12.5px;color:var(--muted);font-weight:400}
.msg{color:var(--ink-2);max-width:38ch}
.pill{display:inline-block;font-size:11.5px;font-weight:700;letter-spacing:.03em;padding:4px 10px;border-radius:999px;white-space:nowrap}
.pill.nouveau{background:var(--warn-soft);color:var(--warn)}
.pill.contacte{background:var(--jade-soft);color:var(--jade)}
.pill.gagne{background:var(--ok-soft);color:var(--ok)}
.pill.perdu{background:var(--risk-soft);color:var(--risk)}
.acts{display:flex;gap:6px;flex-wrap:wrap}
.acts button{font-family:var(--sans);font-size:12px;font-weight:600;padding:6px 10px;border-radius:8px;border:1px solid var(--hair);
  background:var(--panel);color:var(--ink-2);cursor:pointer;transition:background .15s,border-color .15s}
.acts button:hover{border-color:var(--jade);color:var(--jade)}
.acts button:focus-visible{outline:2px solid var(--jade);outline-offset:2px}
.empty{padding:40px;text-align:center;color:var(--muted)}
.share{margin-top:20px;font-size:13px;color:var(--muted)}
.share code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;background:var(--panel);padding:3px 7px;border-radius:6px}
.foot{margin-top:30px;color:var(--faint);font-size:12.5px;text-align:center}
.cfg{background:var(--card);border:1px solid var(--hair);border-radius:16px;box-shadow:var(--shadow);margin-bottom:16px;overflow:hidden}
.cfg summary{cursor:pointer;padding:16px 24px;font-weight:600;font-size:14.5px;color:var(--ink-2);list-style:none}
.cfg summary::-webkit-details-marker{display:none}
.cfg summary:hover{color:var(--jade)}
.cfg-body{padding:0 24px 22px}
.cfg-grid{display:grid;grid-template-columns:2fr 1fr 1fr;gap:14px;margin:14px 0}
.cfg-grid label{display:flex;flex-direction:column;gap:6px;font-size:12.5px;font-weight:600;color:var(--muted)}
.cfg-grid input,.cfg-grid select{font-family:var(--sans);font-size:14px;color:var(--ink);background:var(--paper);
  border:1px solid var(--hair);border-radius:9px;padding:10px 12px}
.cfg-grid input:focus,.cfg-grid select:focus{outline:2px solid var(--jade);outline-offset:1px}
.cfg-btn{font-family:var(--sans);font-size:14px;font-weight:650;color:#fff;background:var(--jade);border:none;border-radius:10px;padding:11px 20px;cursor:pointer}
.cfg-btn:hover{filter:brightness(1.08)}
.cfg-msg{margin-left:12px;font-size:13px;color:var(--ok)}
@media(max-width:760px){.hero,.row2,.cfg-grid{grid-template-columns:1fr}}
/* Novalis Pulse — entonnoir + diagnostic */
.pulse-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap}
.pulse-conv{font-family:var(--serif);font-size:26px;font-weight:700;color:var(--jade);font-variant-numeric:tabular-nums}
.funnel{margin-top:16px;display:flex;flex-direction:column;gap:9px}
.fstep{display:grid;grid-template-columns:1fr;gap:4px}
.fstep .flabel{display:flex;justify-content:space-between;font-size:13px;color:var(--ink-2)}
.fstep .flabel b{font-variant-numeric:tabular-nums;color:var(--ink)}
.fbar{height:26px;border-radius:8px;background:var(--panel);overflow:hidden;position:relative}
.fbar>span{display:block;height:100%;background:linear-gradient(90deg,var(--jade),var(--steel));border-radius:8px;min-width:2px;transition:width .4s}
.fdrop{align-self:flex-end;font-size:11.5px;color:var(--risk);font-weight:650;margin-top:-2px}
.diag{margin-top:18px;padding:16px 18px;border-radius:12px;background:var(--warn-soft);border:1px solid var(--hair)}
.diag .dt{font-family:var(--serif);font-size:16px;font-weight:700;color:var(--ink);margin-bottom:6px}
.diag .dt .tag{font-family:var(--sans);font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--warn);margin-right:8px}
.diag .dd{font-size:14px;color:var(--ink-2);margin-bottom:10px}
.diag .dl{font-size:14px;color:var(--ink)}
.diag .dl b{color:var(--jade)}
.pulse-thin{margin-top:14px;padding:14px 16px;border-radius:11px;background:var(--panel);font-size:13.5px;color:var(--muted)}
`;

function sparkline(tendance) {
  const n = tendance.length;
  if (!n) return '';
  const w = 600, h = 96, pad = 4;
  const max = Math.max(1, ...tendance.map(t => t.n));
  const x = (i) => pad + (i * (w - 2 * pad)) / (n - 1 || 1);
  const y = (v) => h - pad - (v * (h - 2 * pad)) / max;
  const pts = tendance.map((t, i) => `${x(i).toFixed(1)},${y(t.n).toFixed(1)}`);
  const line = 'M' + pts.join(' L');
  const area = `M${x(0).toFixed(1)},${h - pad} L` + pts.join(' L') + ` L${x(n - 1).toFixed(1)},${h - pad} Z`;
  const last = tendance[n - 1];
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Contacts par jour sur ${n} jours">
    <path class="area" d="${area}"/><path class="line" d="${line}"/>
    <circle class="dot" cx="${x(n - 1).toFixed(1)}" cy="${y(last.n).toFixed(1)}" r="3.5"/></svg>`;
}

/**
 * Panneau Novalis Pulse — entonnoir de conversion + diagnostic n°1.
 * @param p sortie de pulse.apercu() : {visiteurs, fiable, entonnoir, conversion_pct, fuite}
 */
function pulsePanel(p) {
  if (!p) return '';
  const head = `<div class="pulse-head"><div><h3>Parcours des visiteurs</h3>
    <div class="hint">Où vos visiteurs avancent — et où ils décrochent.</div></div>
    ${p.fiable ? `<div class="pulse-conv" title="Visiteurs qui vous ont contacté">${p.conversion_pct}%</div>` : ''}</div>`;

  if (!p.visiteurs) {
    return `<div class="panel">${head}
      <div class="pulse-thin">La mesure démarre dès les premières visites. Aucun témoin, aucune donnée personnelle — conforme à la Loi 25.</div></div>`;
  }

  const base = p.entonnoir[0] ? p.entonnoir[0].sessions : 0;
  const barres = p.entonnoir.map((e, i) => {
    const w = base ? Math.max(2, Math.round(100 * e.sessions / base)) : 2;
    const chute = i > 0 && p.entonnoir[i - 1].sessions > 0
      ? Math.round(100 * (p.entonnoir[i - 1].sessions - e.sessions) / p.entonnoir[i - 1].sessions) : 0;
    const marque = p.fuite && p.fuite.entre === `${p.entonnoir[i - 1] ? p.entonnoir[i - 1].etape : ''} → ${e.etape}`;
    return `<div class="fstep">
      <div class="flabel"><span>${esc(e.etape)}</span><b>${e.sessions} · ${e.pct}%</b></div>
      <div class="fbar"><span style="width:${w}%"></span></div>
      ${chute >= 25 && i > 0 ? `<div class="fdrop">${marque ? '➜ ' : ''}−${chute}% ici</div>` : ''}
    </div>`;
  }).join('');

  let diag;
  if (!p.fiable) {
    diag = `<div class="pulse-thin">Encore trop peu de visiteurs (${p.visiteurs}) pour un diagnostic fiable — on ne devine pas. Il s'affichera dès ~25 visiteurs mesurés.</div>`;
  } else if (p.fuite) {
    diag = `<div class="diag">
      <div class="dt"><span class="tag">Fuite n°1</span>${esc(p.fuite.titre)}</div>
      <div class="dd">${esc(p.fuite.diagnostic)} <span style="color:var(--muted)">(${esc(p.fuite.entre)}, −${p.fuite.perte_pct}%)</span></div>
      <div class="dl"><b>À changer&nbsp;:</b> ${esc(p.fuite.levier)}</div></div>`;
  } else {
    diag = `<div class="pulse-thin">Aucune fuite marquée — le parcours se tient bien. On continue de mesurer.</div>`;
  }

  return `<div class="panel">${head}<div class="funnel">${barres}</div>${diag}</div>`;
}

function ligneLead(l) {
  const st = ['nouveau', 'contacte', 'gagne', 'perdu'].includes(l.statut) ? l.statut : 'nouveau';
  const label = { nouveau: 'À répondre', contacte: 'Contacté', gagne: 'Gagné', perdu: 'Perdu' }[st];
  return `<tr data-id="${l.id}">
    <td><div class="who">${esc(l.nom)}${l.entreprise ? ' · ' + esc(l.entreprise) : ''}<span class="mail">${esc(l.courriel)}</span></div></td>
    <td class="msg">${esc(String(l.message || '').slice(0, 140))}${l.hors_heures ? ' <span class="pill warn" style="font-size:10px">hors heures</span>' : ''}</td>
    <td style="white-space:nowrap;color:var(--muted)">${esc(ilYA(l.created_at))}</td>
    <td><span class="pill ${st}">${label}</span></td>
    <td><div class="acts">
      <button data-a="contacte">Répondu</button>
      <button data-a="gagne">Gagné</button>
      <button data-a="perdu">Perdu</button>
    </div></td>
  </tr>`;
}

/**
 * Cockpit d'exploitation. @param data sortie de reception.apercu()
 * @param {{sources?:string[], rapportUrl?:string}} [opts]
 */
function renderReception(data, opts = {}) {
  const c = data.compteurs, r = data.reponse;
  const nom = data.config.nomCommerce || data.source;
  const sources = opts.sources || [];
  const selecteur = sources.length > 1
    ? `<select class="sel" onchange="location.search='?source='+encodeURIComponent(this.value)">${sources.map(s =>
        `<option value="${esc(s)}"${s === data.source ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select>`
    : '';

  // Feu de circulation du délai de réponse.
  let feu = 'ok', feuTxt = 'Excellent';
  if (r.pct_sous_1h === null) { feu = 'warn'; feuTxt = 'Aucune réponse mesurée'; }
  else if (r.pct_sous_1h < 50) { feu = 'risk'; feuTxt = 'Trop lent'; }
  else if (r.pct_sous_1h < 80) { feu = 'warn'; feuTxt = 'À améliorer'; }
  const mediane = r.mediane_minutes === null ? '—'
    : r.mediane_minutes < 60 ? `${Math.round(r.mediane_minutes)} min` : `${(r.mediane_minutes / 60).toFixed(1)} h`;

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Réception — ${esc(nom)}</title><style>${CSS}</style></head><body><div class="wrap">
  <div class="topbar">
    <div class="brand">Novalis <em>Réception</em></div>
    ${selecteur}
  </div>
  <div class="sub">${esc(nom)} · ${data.fenetre_jours} derniers jours</div>

  <div class="hero">
    <div class="tile"><div class="k">Contacts reçus</div><div class="v">${c.contacts}</div>
      <div class="d">${c.leads} message${c.leads !== 1 ? 's' : ''} · ${c.taps} clic${c.taps !== 1 ? 's' : ''} au téléphone</div></div>
    <div class="tile hh"><div class="k">Hors des heures</div><div class="v">${c.hors_heures}</div>
      <div class="d">reçus quand personne ne répondait au commerce</div></div>
    <div class="tile value"><div class="k">Valeur captée</div><div class="v">${dollars(c.valeur_captee_cents)}</div>
      <div class="d">demande estimée arrivée par le site</div></div>
  </div>

  <div class="row2">
    <div class="panel">
      <h3>Vitesse de réponse</h3>
      <div class="hint">Répondre en moins d'une heure multiplie les chances de vente.</div>
      <div class="gauge"><span class="light ${feu}"></span>
        <div><div class="big">${r.pct_sous_1h === null ? '—' : r.pct_sous_1h + '%'}</div>
        <div class="lbl">des réponses sous 1 h · ${feuTxt}</div></div></div>
      <div style="margin-top:14px;font-size:13.5px;color:var(--muted)">Délai médian&nbsp;: <b style="color:var(--ink)">${mediane}</b> · ${r.repondus} répondu${r.repondus !== 1 ? 's' : ''}</div>
      <div class="attente ${c.en_attente ? 'some' : 'none'}">${c.en_attente
        ? `⏱ ${c.en_attente} contact${c.en_attente !== 1 ? 's' : ''} en attente de réponse`
        : '✓ Tous les contacts ont eu une réponse'}</div>
      ${r.accuses ? `<div class="attente none" style="margin-top:10px">⚡ Réponse instantanée&nbsp;: ${r.accuses} client${r.accuses !== 1 ? 's ont' : ' a'} reçu une réponse en secondes${r.accuses_hors_heures ? ` (dont ${r.accuses_hors_heures} hors de vos heures)` : ''}</div>` : ''}
    </div>
    <div class="panel">
      <h3>Tendance — ${data.fenetre_jours} jours</h3>
      <div class="hint">Contacts par jour (messages + clics).</div>
      ${sparkline(data.tendance)}
    </div>
  </div>

  ${pulsePanel(opts.pulse)}

  <details class="cfg">
    <summary>⚙︎ Configurer ce client — nom, secteur, valeur d'un client</summary>
    <div class="cfg-body">
      <div class="hint">Ce que le client voit dans son rapport, et comment la valeur captée est calculée.</div>
      <div class="cfg-grid">
        <label>Nom du commerce<input id="cfg-nom" type="text" value="${esc(data.config.nomCommerce || '')}" placeholder="Ex. Garage Beauchemin"></label>
        <label>Secteur<select id="cfg-secteur">
          ${['', 'garage', 'plombier', 'electricien', 'restaurant', 'salon', 'health', 'construction', 'fitness'].map(s =>
            `<option value="${s}"${s === (data.config.secteur || '') ? ' selected' : ''}>${s ? { garage: 'Garage', plombier: 'Plombier', electricien: 'Électricien', restaurant: 'Restaurant', salon: 'Salon', health: 'Clinique', construction: 'Construction', fitness: 'Gym' }[s] : '—'}</option>`).join('')}
        </select></label>
        <label>Valeur d'un client ($)<input id="cfg-valeur" type="number" min="1" value="${Math.round((data.config.valeurLeadCents || 30000) / 100)}"></label>
      </div>
      <button id="cfg-save" class="cfg-btn">Enregistrer</button>
      <span id="cfg-msg" class="cfg-msg"></span>
    </div>
  </details>

  <div class="panel">
    <h3>Contacts récents</h3>
    <div class="hint">Marquez chaque contact — le délai de réponse se calcule tout seul.</div>
    <div class="leads-wrap">
    ${data.leads_recents.length ? `<table><thead><tr>
      <th>Client</th><th>Message</th><th>Reçu</th><th>Statut</th><th>Action</th></tr></thead>
      <tbody>${data.leads_recents.map(ligneLead).join('')}</tbody></table>`
      : '<div class="empty">Aucun contact sur la période. Dès qu\'un client écrit ou clique pour appeler, il apparaît ici.</div>'}
    </div>
    ${opts.rapportUrl ? `<div class="share">Rapport mensuel à envoyer au client (URL privée)&nbsp;: <code>${esc(opts.rapportUrl)}</code></div>` : ''}
  </div>

  <div class="foot">Novalis Réception · les chiffres sont comptés, jamais estimés au doigt mouillé.</div>
</div>
<script>
document.querySelectorAll('.acts button').forEach(function(btn){
  btn.addEventListener('click', async function(){
    var tr = btn.closest('tr'); var id = tr.getAttribute('data-id'); var a = btn.getAttribute('data-a');
    btn.disabled = true;
    try{
      var res = await fetch('/core/reception/lead/'+id, {method:'POST',headers:{'Content-Type':'application/json',
        'x-admin-pass': localStorage.getItem('novalis_admin')||''},
        body: JSON.stringify({statut:a})});
      if(res.ok){ location.reload(); } else { btn.disabled=false; alert('Non enregistré ('+res.status+')'); }
    }catch(e){ btn.disabled=false; alert('Erreur réseau'); }
  });
});
// Mémorise le mot de passe admin passé en ?pass= pour les actions ultérieures.
(function(){var p=new URLSearchParams(location.search).get('pass'); if(p) localStorage.setItem('novalis_admin',p);})();
// Enregistrement de la configuration du client (sans SQL).
(function(){
  var btn=document.getElementById('cfg-save'); if(!btn) return;
  btn.addEventListener('click', async function(){
    var msg=document.getElementById('cfg-msg'); btn.disabled=true; msg.textContent='';
    var body={source:${JSON.stringify(data.source)},
      nom_commerce:document.getElementById('cfg-nom').value.trim(),
      secteur:document.getElementById('cfg-secteur').value,
      valeur_dollars:document.getElementById('cfg-valeur').value};
    try{
      var res=await fetch('/core/reception/config',{method:'POST',headers:{'Content-Type':'application/json',
        'x-admin-pass':localStorage.getItem('novalis_admin')||''},body:JSON.stringify(body)});
      if(res.ok){msg.textContent='✓ Enregistré';setTimeout(function(){location.reload();},600);}
      else{msg.style.color='#9c4632';msg.textContent='Non enregistré ('+res.status+')';btn.disabled=false;}
    }catch(e){msg.style.color='#9c4632';msg.textContent='Erreur réseau';btn.disabled=false;}
  });
})();
</script>
</body></html>`;
}

/** Rapport mensuel envoyé au commerçant (URL signée, sans compte). */
function renderRapport(rap, opts = {}) {
  const nom = rap.nom_commerce || rap.source;
  const moisAff = new Date(rap.mois + '-01T12:00:00Z').toLocaleDateString('fr-CA', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Votre mois — ${esc(nom)}</title><style>${CSS}
.rapport{max-width:640px}.rapport .tile .v{font-size:clamp(40px,7vw,60px)}
.rlead{font-family:var(--serif);font-size:clamp(20px,3vw,26px);font-weight:700;margin:8px 0 4px}
.rsig{margin-top:28px;font-size:14px;color:var(--muted)}
</style></head><body><div class="wrap rapport">
  <div class="brand" style="font-family:var(--serif)">Novalis <em>Réception</em></div>
  <div class="rlead">${esc(nom)} — ${esc(moisAff)}</div>
  <div class="sub">Voici ce que votre présence en ligne vous a rapporté ce mois-ci. Trois chiffres, comptés.</div>
  <div class="hero" style="grid-template-columns:repeat(3,1fr)">
    <div class="tile"><div class="k">Contacts</div><div class="v">${rap.contacts}</div>
      <div class="d">${rap.formulaires} message${rap.formulaires !== 1 ? 's' : ''} · ${rap.clics} appel${rap.clics !== 1 ? 's' : ''}</div></div>
    <div class="tile hh"><div class="k">Hors heures</div><div class="v">${rap.hors_heures}</div>
      <div class="d">reçus le soir ou la fin de semaine</div></div>
    <div class="tile value"><div class="k">Valeur estimée</div><div class="v">${dollars(rap.valeur_captee_cents)}</div>
      <div class="d">de demande arrivée par votre site</div></div>
  </div>
  ${(() => {
    const p = opts.pulse;
    if (!p || !p.fiable || !p.fuite) return '';
    return `<div class="diag" style="margin-top:22px">
      <div class="dt"><span class="tag">Le mois prochain</span>${esc(p.fuite.titre)}</div>
      <div class="dd">${esc(p.fuite.diagnostic)}</div>
      <div class="dl"><b>Ce qu'on ajuste&nbsp;:</b> ${esc(p.fuite.levier)}</div></div>`;
  })()}
  <div class="rsig">Sans Réception, ${rap.hors_heures > 0 ? `ces ${rap.hors_heures} contacts hors heures seraient probablement passés inaperçus.` : 'ces contacts se seraient dispersés entre courriels, appels manqués et notes perdues.'} Ils sont maintenant tous captés, au même endroit.<br><br>— Novalis</div>
  <div class="foot">Chiffres comptés au ${new Date().toISOString().slice(0, 10)}. Rapport privé${opts.public ? '' : ' (interne)'}.</div>
</div></body></html>`;
}

module.exports = { renderReception, renderRapport, esc };
