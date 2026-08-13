'use strict';
// ── Novalis — graphiques SVG (sans dépendance, thème indigo) ─────────
// Rendus côté serveur. Suit les principes dataviz : marques fines, grille
// discrète, une seule échelle, survol natif (<title>), texte en encre (jamais
// la couleur de série). Les couleurs viennent des jetons du thème.

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Histogramme (une série). data = [{label, labelCourt?, value}].
 * Grille discrète, barres indigo à sommet arrondi, survol natif.
 */
function barChart(data, opts = {}) {
  const arr = Array.isArray(data) ? data : [];
  const w = opts.w || 640, h = opts.h || 170;
  const padL = 30, padR = 8, padT = 10, padB = 22;
  const n = arr.length;
  if (!n) return '<div class="chart-empty">Pas encore de données.</div>';
  const max = Math.max(1, ...arr.map(d => d.value || 0));
  const iw = w - padL - padR, ih = h - padT - padB;
  const slot = iw / n;
  const bw = Math.max(2, Math.min(slot - 3, 26));
  const bx = (i) => padL + i * slot + (slot - bw) / 2;
  const by = (v) => padT + ih - (v / max) * ih;

  const ticks = [...new Set([0, Math.round(max / 2), max])];
  const grid = ticks.map((t) => {
    const yy = padT + ih - (t / max) * ih;
    return `<line x1="${padL}" y1="${yy.toFixed(1)}" x2="${w - padR}" y2="${yy.toFixed(1)}" stroke="var(--line)" stroke-width="1"/>`
      + `<text x="${padL - 6}" y="${(yy + 3).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--muted)">${t}</text>`;
  }).join('');

  const bars = arr.map((d, i) => {
    const y = by(d.value || 0);
    const bh = Math.max(0, padT + ih - y);
    return `<rect x="${bx(i).toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="3" fill="var(--brand)"><title>${esc(d.label)} : ${d.value || 0}</title></rect>`;
  }).join('');

  const idx = [...new Set([0, Math.floor(n / 2), n - 1])];
  const labs = idx.map((i) => `<text x="${(bx(i) + bw / 2).toFixed(1)}" y="${h - 6}" text-anchor="middle" font-size="10" fill="var(--muted)">${esc(arr[i].labelCourt || arr[i].label)}</text>`).join('');

  return `<svg class="chart" viewBox="0 0 ${w} ${h}" width="100%" height="${h}" role="img" aria-label="${esc(opts.aria || 'Histogramme')}">${grid}${bars}${labs}</svg>`;
}

/**
 * Anneau (part-à-tout, 2–4 segments). segments = [{label, value, color}].
 * Centre = total ; légende à part via donutLegende().
 */
function donut(segments, opts = {}) {
  const segs = (Array.isArray(segments) ? segments : []).filter((s) => (s.value || 0) > 0);
  const size = opts.size || 132, r = size / 2, rin = r * 0.62, cx = r, cy = r;
  const total = segs.reduce((s, x) => s + (x.value || 0), 0);
  const center = `<text x="${cx}" y="${cy - 1}" text-anchor="middle" font-size="22" font-weight="800" fill="var(--ink)">${total}</text>`
    + `<text x="${cx}" y="${cy + 14}" text-anchor="middle" font-size="9" letter-spacing=".04em" fill="var(--muted)">${esc(opts.centre || 'total')}</text>`;
  if (!total) return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><circle cx="${cx}" cy="${cy}" r="${(r + rin) / 2}" fill="none" stroke="var(--panel)" stroke-width="${r - rin}"/>${center}</svg>`;
  if (segs.length === 1) {
    return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><circle cx="${cx}" cy="${cy}" r="${(r + rin) / 2}" fill="none" stroke="${segs[0].color}" stroke-width="${r - rin}"><title>${esc(segs[0].label)} : ${segs[0].value}</title></circle>${center}</svg>`;
  }
  let a = -Math.PI / 2;
  const p = (ang, rad) => [cx + rad * Math.cos(ang), cy + rad * Math.sin(ang)];
  const arcs = segs.map((s) => {
    const frac = (s.value || 0) / total;
    const a2 = a + frac * 2 * Math.PI;
    const large = frac > 0.5 ? 1 : 0;
    const [x1, y1] = p(a, r), [x2, y2] = p(a2, r), [x3, y3] = p(a2, rin), [x4, y4] = p(a, rin);
    a = a2;
    return `<path d="M${x1.toFixed(2)} ${y1.toFixed(2)} A${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} L${x3.toFixed(2)} ${y3.toFixed(2)} A${rin} ${rin} 0 ${large} 0 ${x4.toFixed(2)} ${y4.toFixed(2)} Z" fill="${s.color}" stroke="var(--card)" stroke-width="2"><title>${esc(s.label)} : ${s.value}</title></path>`;
  }).join('');
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${esc(opts.aria || 'Répartition')}">${arcs}${center}</svg>`;
}

/** Légende accessible (pastille + libellé + valeur) — identité jamais par la couleur seule. */
function donutLegende(segments) {
  return '<div class="legende">' + (Array.isArray(segments) ? segments : []).map((s) =>
    `<div class="leg"><span class="pt" style="background:${s.color}"></span><span class="lb">${esc(s.label)}</span><b>${s.value || 0}</b></div>`).join('') + '</div>';
}

// CSS partagé des graphiques (à inclure dans extraCss des pages qui en usent).
const CHART_CSS = `
.chart-empty{color:var(--muted);font-size:13px;padding:24px 0;text-align:center}
.legende{display:flex;flex-direction:column;gap:8px}
.legende .leg{display:flex;align-items:center;gap:9px;font-size:13px;color:var(--ink-2)}
.legende .leg .pt{width:11px;height:11px;border-radius:3px;flex:none}
.legende .leg .lb{flex:1}
.legende .leg b{font-variant-numeric:tabular-nums;color:var(--ink)}
`;

module.exports = { barChart, donut, donutLegende, CHART_CSS };
