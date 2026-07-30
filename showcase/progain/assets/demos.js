/* ════════════════════════════════════════════════════════════════
   ProGain.ai — les trois démos jouables
   Aucune dépendance à GSAP : CSS transitions + canvas 2D. Chaque
   démo s'initialise seulement si son balisage est présent, ce qui
   permet de la placer sur l'accueil comme sur sa page produit.
   ════════════════════════════════════════════════════════════════ */
'use strict';

(() => {
  const RM = PG.reduced;
  const L = () => PG.lang;
  const wait = ms => new Promise(r => setTimeout(r, ms));

  const TXT = {
    en: {
      scanning: 'Scanning…', detecting: 'Detecting food items…',
      done: c => `Analysis complete · <b>3 items</b> detected<br>Mean confidence <b>${c}%</b> · portions estimated by volume`,
      coachRun: 'Analyze the plate', coachAgain: 'Analyze again',
      snRunning: 'Scanning…', snRun: 'Run the scan', snDone: 'Run the scan again',
      snSum: n => `Diagnostic ready · ${n} findings · 2 fixes suggested`,
      snIdle: 'No scan run yet.<br>6 components awaiting inspection.',
      find: [
        { s: 'CRITICAL', t: 'Personal data (names, emails) forwarded to third-party model without redaction.', p: 'Notion → LLM endpoint' },
        { s: 'HIGH', t: 'API key stored in plaintext environment variable.', p: 'Zapier automation' },
        { s: 'MEDIUM', t: 'Retrieval returns whole documents; no field-level filtering.', p: 'Postgres · vectors' },
      ],
      goal: { under: 'On track — this meal fits your remaining budget.', tight: 'Tight — this meal is most of what you have left today.', over: 'Over — you have room tomorrow, not today.' },
      term: [
        { q: 'How much of our support inbox could actually be automated?', a: "Reading your last 200 tickets... 61% are order status, returns or hours questions. Those get an accurate answer today. The other 39% need a person — and should keep getting one." },
        { q: 'Is our client data safe if we plug in an AI model?', a: "Not by default. Redact personal fields before anything leaves your system, scope every connector to read-only where possible, and keep an audit log. That is the baseline, not the upgrade." },
      ],
    },
    fr: {
      scanning: 'Analyse en cours…', detecting: 'Détection des aliments…',
      done: c => `Analyse terminée · <b>3 aliments</b> détectés<br>Confiance moyenne <b>${c}%</b> · portions estimées par volume`,
      coachRun: "Analyser l'assiette", coachAgain: "Relancer l'analyse",
      snRunning: 'Analyse en cours…', snRun: "Lancer l'analyse", snDone: "Relancer l'analyse",
      snSum: n => `Diagnostic prêt · ${n} constats · 2 correctifs suggérés`,
      snIdle: 'Aucune analyse effectuée.<br>6 composants en attente.',
      find: [
        { s: 'CRITIQUE', t: 'Données personnelles (noms, courriels) transmises au modèle tiers sans masquage.', p: 'Notion → point de terminaison LLM' },
        { s: 'ÉLEVÉ', t: "Clé d'API stockée en clair dans une variable d'environnement.", p: 'Automatisation Zapier' },
        { s: 'MOYEN', t: 'La récupération renvoie les documents complets ; aucun filtrage au niveau des champs.', p: 'Postgres · vecteurs' },
      ],
      goal: { under: "Dans la marge — ce repas tient dans votre budget restant.", tight: "Serré — ce repas représente presque tout ce qu'il vous reste aujourd'hui.", over: "Dépassé — il vous reste de la marge demain, pas aujourd'hui." },
      term: [
        { q: 'Quelle part de notre boîte de support pourrait vraiment être automatisée ?', a: "Lecture de vos 200 derniers tickets... 61 % concernent le statut d'une commande, un retour ou les heures d'ouverture. Ceux-là ont une réponse exacte dès aujourd'hui. Les 39 % restants ont besoin d'une personne — et devraient continuer de l'avoir." },
        { q: "Nos données clients sont-elles en sécurité si on branche un modèle d'IA ?", a: "Pas par défaut. Masquez les champs personnels avant que quoi que ce soit ne quitte votre système, limitez chaque connecteur à la lecture seule quand c'est possible, et gardez un journal d'audit. C'est la base, pas une option." },
      ],
    },
  };
  const T = () => TXT[L()] || TXT.en;

  /* ── Onglets du laboratoire ─────────────────────────────────── */
  const tabs = [...document.querySelectorAll('.lab-tab')];
  tabs.forEach(t => t.onclick = () => {
    tabs.forEach(x => x.classList.remove('on'));
    t.classList.add('on');
    document.querySelectorAll('.lab-panel').forEach(p => p.classList.remove('on'));
    const panel = document.getElementById('p-' + t.dataset.tab);
    if (panel) panel.classList.add('on');
    if (t.dataset.tab === 'markets') drawVol(true); // le canvas doit se dimensionner une fois visible
  });

  /* ════ PG—01 · Coach ═══════════════════════════════════════════
     Détection sur l'assiette, puis macros et calories. Les valeurs
     sont cohérentes entre elles (somme des trois aliments).        */
  const FOODS = [{ kcal: 297, p: 56, c: 0, f: 6.4 }, { kcal: 195, p: 4, c: 42, f: .4 }, { kcal: 31, p: 2.5, c: 6, f: .3 }];
  const TOT = FOODS.reduce((a, x) => ({ kcal: a.kcal + x.kcal, p: a.p + x.p, c: a.c + x.c, f: a.f + x.f }), { kcal: 0, p: 0, c: 0, f: 0 });
  const MAXG = 60;
  const btnC = document.getElementById('coachRun');
  let coachBusy = false, coachRan = false;

  function coachReset() {
    document.querySelectorAll('#plate .det').forEach(d => d.classList.remove('on'));
    ['fP', 'fC', 'fF'].forEach(id => { const e = document.getElementById(id); if (e) e.style.width = '0%'; });
    ['mP', 'mC', 'mF'].forEach(id => { const e = document.getElementById(id); if (e) e.textContent = '0'; });
    const k = document.getElementById('kcal'); if (k) k.textContent = '0';
  }
  async function coachRun() {
    if (coachBusy) return;
    coachBusy = true; btnC.disabled = true; coachReset();
    const scan = document.getElementById('plateScan'), conf = document.getElementById('coachConf');
    if (conf) conf.innerHTML = T().scanning;
    if (!RM && scan) {
      scan.style.transition = 'none'; scan.style.top = '-4px'; scan.style.opacity = '1';
      await new Promise(r => requestAnimationFrame(r));
      scan.style.transition = 'top .95s cubic-bezier(.4,0,.6,1)'; scan.style.top = '100%';
      await wait(700);
      if (conf) conf.innerHTML = T().detecting;
      await wait(320);
      scan.style.opacity = '0';
    }
    const dets = [...document.querySelectorAll('#plate .det')];
    for (const d of dets) { d.classList.add('on'); if (!RM) await wait(190); }
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.style.width = Math.min(100, v / MAXG * 100) + '%'; };
    set('fP', TOT.p); set('fC', TOT.c); set('fF', TOT.f);
    const cnt = (id, v, d) => { const e = document.getElementById(id); if (e) PG.countTo(e, v, 900, d); };
    cnt('mP', TOT.p, 1); cnt('mC', TOT.c, 0); cnt('mF', TOT.f, 1);
    const k = document.getElementById('kcal'); if (k) PG.countTo(k, TOT.kcal, 1150, 0);
    await wait(RM ? 0 : 1200);
    if (conf) conf.innerHTML = T().done(94);
    btnC.disabled = false; btnC.textContent = T().coachAgain;
    coachBusy = false; coachRan = true;
  }
  if (btnC) btnC.onclick = coachRun;

  /* ── Budget restant : le curseur qui pilote un état en direct ──
     Même principe que le choc de scénario chez Markets, appliqué à
     Coach — un seul curseur, plusieurs sorties qui réagissent.       */
  const goalSl = document.getElementById('goalSlider');
  function updateGoal() {
    if (!goalSl) return;
    const goal = parseInt(goalSl.value, 10);
    const pct = Math.min(999, TOT.kcal / goal * 100);
    const fill = document.getElementById('goalFill'), val = document.getElementById('goalVal'), note = document.getElementById('goalNote');
    if (fill) {
      fill.style.width = Math.min(100, pct) + '%';
      fill.style.background = pct > 100 ? 'var(--rust)' : pct > 75 ? 'var(--amber)' : 'var(--jade)';
    }
    if (val) val.textContent = goal.toLocaleString(L() === 'fr' ? 'fr-CA' : 'en-CA') + ' kcal';
    if (note) note.textContent = (pct > 100 ? T().goal.over : pct > 75 ? T().goal.tight : T().goal.under) + '  (' + Math.round(pct) + '%)';
  }
  if (goalSl) { goalSl.addEventListener('input', updateGoal); updateGoal(); }

  /* ════ PG—02 · Markets ═════════════════════════════════════════
     Surface paramétrique honnête : pente positive par échéance, vol
     inversement corrélée au sous-jacent, asymétrie qui s'aplatit
     dans le temps. Le P&L combine delta et véga du livre de démo.  */
  const MAT = [1, 2, 3, 6, 9, 12, 18, 24];
  const MON = [{ m: .90, c: '#3E5F7D' }, { m: 1, c: '#93672E' }, { m: 1.10, c: '#2B5B42' }];
  const DELTA$ = 4200, VEGA$ = 3100;
  const volAt = (t, m, shock) => {
    const base = 21 + 6.5 * (1 - Math.exp(-t / 7));
    const skew = (1 - m) * 26 / Math.sqrt(t / 3 + 1);
    return Math.max(6, base + skew - shock * 0.34);
  };
  const cv = document.getElementById('volCv');
  let cur = MAT.map(() => MON.map(() => 0)), tgt = cur.map(r => r.slice()), anim = null;
  const setTarget = shock => { tgt = MAT.map(t => MON.map(o => volAt(t, o.m, shock))); };

  function drawVol(instant) {
    if (!cv) return;
    const ctx = cv.getContext('2d'), dpr = Math.min(devicePixelRatio || 1, 2);
    const w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (instant) cur = tgt.map(r => r.slice());
    const padL = 44, padR = 12, padT = 14, padB = 28;
    const gx = i => padL + (w - padL - padR) * (i / (MAT.length - 1));
    const lo = 14, hi = 44, gy = v => padT + (h - padT - padB) * (1 - (v - lo) / (hi - lo));
    ctx.clearRect(0, 0, w, h);
    ctx.font = '9px "IBM Plex Mono", monospace';
    ctx.fillStyle = 'rgba(24,27,20,.48)';
    ctx.strokeStyle = 'rgba(24,27,20,.08)'; ctx.lineWidth = 1;
    for (let v = lo; v <= hi; v += 6) {
      const y = gy(v);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
      ctx.textAlign = 'right'; ctx.fillText(v + '%', padL - 7, y + 3);
    }
    ctx.textAlign = 'center';
    MAT.forEach((m, i) => { if (i % 2 === 0 || i === MAT.length - 1) ctx.fillText(m + 'M', gx(i), h - 9); });
    MON.forEach((o, j) => {
      ctx.beginPath(); ctx.strokeStyle = o.c; ctx.lineWidth = 2; ctx.lineJoin = 'round';
      MAT.forEach((_, i) => { const x = gx(i), y = gy(cur[i][j]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke();
      if (j === 1) {
        ctx.lineTo(gx(MAT.length - 1), h - padB); ctx.lineTo(gx(0), h - padB); ctx.closePath();
        const g = ctx.createLinearGradient(0, padT, 0, h - padB);
        g.addColorStop(0, 'rgba(147,103,46,.12)'); g.addColorStop(1, 'rgba(147,103,46,0)');
        ctx.fillStyle = g; ctx.fill();
      }
      MAT.forEach((_, i) => { ctx.beginPath(); ctx.fillStyle = o.c; ctx.arc(gx(i), gy(cur[i][j]), 2.4, 0, Math.PI * 2); ctx.fill(); });
    });
  }
  function lerpDraw() {
    let moving = false;
    for (let i = 0; i < cur.length; i++) for (let j = 0; j < cur[i].length; j++) {
      const d = tgt[i][j] - cur[i][j];
      if (Math.abs(d) > .01) { cur[i][j] += d * .18; moving = true; } else cur[i][j] = tgt[i][j];
    }
    drawVol(false);
    anim = moving ? requestAnimationFrame(lerpDraw) : null;
  }
  function mkUpdate(shock) {
    setTarget(shock);
    if (RM) drawVol(true); else if (!anim) anim = requestAnimationFrame(lerpDraw);
    const atm = volAt(6, 1, shock), skew = volAt(6, .90, shock) - volAt(6, 1.10, shock);
    const pnl = DELTA$ * shock + VEGA$ * (atm - volAt(6, 1, 0));
    const put = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    put('shockVal', (shock > 0 ? '+' : '') + shock.toFixed(1) + '%');
    put('atmVol', atm.toFixed(1) + '%');
    put('skewVal', (skew > 0 ? '+' : '') + skew.toFixed(1) + ' pts');
    const pv = document.getElementById('pnlVal'), pr = document.getElementById('pnlRow');
    if (pv) pv.textContent = (pnl < 0 ? '−' : '+') + '$' + Math.abs(Math.round(pnl)).toLocaleString(L() === 'fr' ? 'fr-CA' : 'en-CA');
    if (pr) { pr.classList.toggle('up', pnl >= 0); pr.classList.toggle('down', pnl < 0); }
  }
  const sl = document.getElementById('shock');
  if (sl && cv) {
    sl.addEventListener('input', () => mkUpdate(parseFloat(sl.value)));
    setTarget(0); mkUpdate(0); drawVol(true);
    addEventListener('resize', () => drawVol(true), { passive: true });
    new IntersectionObserver((es, ob) => es.forEach(e => { if (e.isIntersecting) { drawVol(true); ob.disconnect(); } })).observe(cv);
  }

  /* ════ PG—03 · Sentinel ════════════════════════════════════════ */
  const btnS = document.getElementById('snRun');
  const SEV = { CRITICAL: '#9C4632', CRITIQUE: '#9C4632', HIGH: '#93672E', 'ÉLEVÉ': '#93672E', MEDIUM: '#3E5F7D', MOYEN: '#3E5F7D' };
  let snBusy = false, snRan = false;

  function renderFindings(animate) {
    const out = document.getElementById('snOut');
    if (!out) return;
    out.innerHTML = '';
    const F = T().find;
    F.forEach((f, i) => {
      const d = document.createElement('div');
      d.className = 'find';
      d.style.setProperty('--sev', SEV[f.s] || '#3E5F7D');
      d.innerHTML = `<div class="find-sev">${f.s}</div><div class="find-t">${f.t}</div><div class="find-p">${f.p}</div>`;
      out.appendChild(d);
      if (animate) setTimeout(() => d.classList.add('on'), 120 * i); else d.classList.add('on');
    });
    const s = document.createElement('div');
    s.className = 'sn-sum'; s.textContent = T().snSum(F.length);
    out.appendChild(s);
    if (animate) setTimeout(() => s.classList.add('on'), 120 * F.length + 150); else s.classList.add('on');
  }
  async function snRun() {
    if (snBusy) return;
    snBusy = true; btnS.disabled = true; btnS.textContent = T().snRunning;
    const nodes = [...document.querySelectorAll('.sn-node')];
    const sweep = document.getElementById('snSweep'), out = document.getElementById('snOut');
    nodes.forEach(n => n.className = 'sn-node');
    if (out) out.innerHTML = '<div class="sn-empty">' + T().scanning + '</div>';
    if (!RM && sweep) {
      sweep.style.transition = 'none'; sweep.style.left = '-120px'; sweep.style.opacity = '1';
      await new Promise(r => requestAnimationFrame(r));
      sweep.style.transition = 'left 1.5s linear'; sweep.style.left = '100%';
    }
    for (const n of nodes) { n.classList.add('chk'); if (!RM) await wait(215); }
    if (!RM && sweep) sweep.style.opacity = '0';
    nodes.forEach(n => { n.classList.remove('chk'); n.classList.add(n.dataset.sev); });
    renderFindings(!RM);
    btnS.disabled = false; btnS.textContent = T().snDone;
    snBusy = false; snRan = true;
  }
  if (btnS) btnS.onclick = snRun;

  /* ════ Terminal IA (Services) : une réponse qui s'écrit en direct ═
     Pas d'appel réseau — le texte est pré-écrit, mais il s'affiche
     caractère par caractère comme un vrai flux de génération.        */
  let termStop = null, termLoop = null, termStarted = false, termRun = null;
  function initTerminal() {
    const body = document.getElementById('termBody');
    const box = document.getElementById('aiTerm');
    if (!body || !box) return;
    const typeLine = async (prefix, text, cls, stopFlag) => {
      const line = document.createElement('div');
      line.className = 'term-line ' + cls;
      const promptSpan = document.createElement('span'); promptSpan.className = 'term-prompt'; promptSpan.textContent = prefix;
      const textSpan = document.createElement('span'); textSpan.className = 'term-text';
      line.appendChild(promptSpan); line.appendChild(textSpan);
      let cursor = null;
      if (!RM) { cursor = document.createElement('span'); cursor.className = 'term-cursor'; line.appendChild(cursor); }
      body.appendChild(line);
      body.scrollTop = body.scrollHeight;
      if (RM) { textSpan.textContent = text; return; }
      for (let i = 0; i < text.length; i++) {
        if (stopFlag.v) return;
        textSpan.textContent += text[i];
        if (i % 4 === 0) body.scrollTop = body.scrollHeight;
        await wait(text[i] === ' ' ? 6 : 10 + Math.random() * 22);
      }
      if (cursor) cursor.remove();
    };
    const run = async () => {
      const stopFlag = { v: false };
      termStop = () => { stopFlag.v = true; };
      body.innerHTML = '';
      for (const item of T().term) {
        if (stopFlag.v) return;
        await typeLine('you@progain ~ $ ', item.q, 'term-q', stopFlag);
        if (stopFlag.v) return;
        await wait(RM ? 0 : 500);
        if (stopFlag.v) return;
        await typeLine('ai › ', item.a, 'term-a', stopFlag);
        if (stopFlag.v) return;
        await wait(RM ? 500 : 2400);
      }
      if (!stopFlag.v) termLoop = setTimeout(run, 1600);
    };
    termRun = run;
    new IntersectionObserver((es, ob) => es.forEach(e => {
      if (e.isIntersecting && !termStarted) { termStarted = true; run(); ob.disconnect(); }
    }), { threshold: .25 }).observe(box);
  }
  initTerminal();

  /* ════ Comparateur avant/après (Sentinel) : glisser pour révéler ═ */
  function initCompare() {
    const box = document.getElementById('snCompare'), handle = document.getElementById('cmpHandle');
    if (!box || !handle) return;
    let dragging = false;
    const setPct = clientX => {
      const r = box.getBoundingClientRect();
      const pct = Math.max(4, Math.min(96, (clientX - r.left) / r.width * 100));
      box.style.setProperty('--p', pct + '%');
      handle.setAttribute('aria-valuenow', String(Math.round(pct)));
    };
    const stepPct = delta => {
      const cur = parseFloat(getComputedStyle(box).getPropertyValue('--p')) || 50;
      const pct = Math.max(4, Math.min(96, cur + delta));
      box.style.setProperty('--p', pct + '%');
      handle.setAttribute('aria-valuenow', String(Math.round(pct)));
    };
    handle.addEventListener('mousedown', e => { dragging = true; e.preventDefault(); });
    box.addEventListener('mousedown', e => { if (e.target === handle || handle.contains(e.target)) return; dragging = true; setPct(e.clientX); });
    addEventListener('mousemove', e => { if (dragging) setPct(e.clientX); }, { passive: true });
    addEventListener('mouseup', () => { dragging = false; });
    handle.addEventListener('touchstart', () => { dragging = true; }, { passive: true });
    box.addEventListener('touchmove', e => { if (dragging) setPct(e.touches[0].clientX); }, { passive: true });
    addEventListener('touchend', () => { dragging = false; }, { passive: true });
    handle.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft') { stepPct(-5); e.preventDefault(); }
      if (e.key === 'ArrowRight') { stepPct(5); e.preventDefault(); }
    });
  }
  initCompare();

  /* ── Suivi de la langue pour les textes dynamiques ───────────── */
  const syncLang = () => {
    if (btnC && !coachBusy) btnC.textContent = coachRan ? T().coachAgain : T().coachRun;
    if (btnS && !snBusy) btnS.textContent = snRan ? T().snDone : T().snRun;
    if (!snBusy && snRan) renderFindings(false);
    if (!snRan) { const e = document.getElementById('snEmpty'); if (e) e.innerHTML = T().snIdle; }
    if (sl) mkUpdate(parseFloat(sl.value));
    if (goalSl) updateGoal();
    if (termStarted && termRun) { if (termStop) termStop(); clearTimeout(termLoop); termRun(); }
  };
  document.addEventListener('pg:lang', syncLang);
  document.addEventListener('pg:lang:init', syncLang);
})();
