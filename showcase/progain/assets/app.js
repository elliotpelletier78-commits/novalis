/* ════════════════════════════════════════════════════════════════
   ProGain.ai — couche applicative partagée
   Chargée par les 9 pages. Tout est défensif : si GSAP ou Lenis
   manquent, le contenu reste lisible et les fonctions essentielles
   (langue, menu, formulaires, FAQ) continuent de fonctionner.
   ════════════════════════════════════════════════════════════════ */
'use strict';

const PG = (() => {
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasGsap = typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined';
  if (hasGsap) gsap.registerPlugin(ScrollTrigger);

  /* ── Lenis : défilement inertiel ─────────────────────────────── */
  let lenis = null;
  if (typeof Lenis !== 'undefined' && !RM) {
    lenis = new Lenis({ duration: 1.5, smoothWheel: true });
    if (hasGsap) {
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add(t => lenis.raf(t * 1000));
      gsap.ticker.lagSmoothing(0);
    } else {
      const raf = t => { lenis.raf(t); requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
    }
  }

  /* ── Bilingue EN/FR ──────────────────────────────────────────
     « Bilingual by design » est tenu, pas affiché : chaque élément
     porte sa version française en data-fr ; l'anglais est mémorisé
     au chargement. La langue persiste entre les pages (localStorage)
     — c'est ce qui la rend crédible sur un site multi-pages.        */
  let LANG = 'en';
  const langNodes = [];
  function initLang() {
    document.querySelectorAll('[data-fr]').forEach(n => {
      n.dataset.en = n.innerHTML;
      langNodes.push(n);
    });
    document.querySelectorAll('.lang button').forEach(b => {
      b.onclick = () => applyLang(b.dataset.lang);
    });
    let saved = null;
    try { saved = localStorage.getItem('pg_lang'); } catch (e) { /* stockage bloqué */ }
    applyLang(saved === 'fr' ? 'fr' : 'en', true);
  }
  function applyLang(lang, silent) {
    LANG = lang;
    document.documentElement.lang = lang;
    langNodes.forEach(n => { n.innerHTML = lang === 'fr' ? n.dataset.fr : n.dataset.en; });
    document.querySelectorAll('.lang button').forEach(b => b.classList.toggle('on', b.dataset.lang === lang));
    document.querySelectorAll('[data-fr-href]').forEach(a => {
      a.setAttribute('href', lang === 'fr' ? a.dataset.frHref : a.dataset.enHref || a.getAttribute('href'));
    });
    try { localStorage.setItem('pg_lang', lang); } catch (e) { /* stockage bloqué */ }
    if (!silent) document.dispatchEvent(new CustomEvent('pg:lang', { detail: lang }));
    else document.dispatchEvent(new CustomEvent('pg:lang:init', { detail: lang }));
  }

  /* ── Chargeur ────────────────────────────────────────────────── */
  function initLoader() {
    const loader = document.getElementById('loader');
    if (!loader) { document.body.classList.add('ready'); return; }
    const bar = document.getElementById('loadBar'), sub = document.getElementById('loadSub');
    const finish = () => {
      loader.classList.add('done');
      document.body.style.overflow = '';
      if (lenis) lenis.start();
      document.body.classList.add('ready');
      document.dispatchEvent(new CustomEvent('pg:ready'));
    };
    if (RM || !hasGsap) { loader.style.display = 'none'; finish(); return; }
    if (lenis) lenis.stop();
    document.body.style.overflow = 'hidden';
    if (sub) gsap.to(sub, { opacity: 1, duration: .7, delay: .2 });
    if (bar) gsap.to(bar, { width: '100%', duration: 1.3, ease: 'power2.inOut', delay: .1, onComplete: () => setTimeout(finish, 170) });
    setTimeout(finish, 2500); // filet de sécurité
  }

  /* ── Navigation : état défilé, menu mobile, page courante ────── */
  function initNav() {
    const nav = document.querySelector('.nav');
    if (nav) {
      const onScroll = () => nav.classList.toggle('scrolled', scrollY > 60);
      addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }
    const burger = document.querySelector('.burger');
    if (burger) {
      burger.onclick = () => {
        const open = document.body.classList.toggle('menu');
        burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      };
      document.querySelectorAll('.nav-links a').forEach(a => a.addEventListener('click', () => {
        document.body.classList.remove('menu');
        burger.setAttribute('aria-expanded', 'false');
      }));
    }
    // Marque la page courante. Les pages produits (coach/markets/
    // sentinel) allument « Products » : le visiteur doit toujours voir
    // dans quelle section du site il se trouve.
    const here = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    const SECTION = { 'coach.html': 'products.html', 'markets.html': 'products.html', 'sentinel.html': 'products.html' };
    const active = SECTION[here] || here;
    document.querySelectorAll('.nav-links a[href]').forEach(a => {
      const t = a.getAttribute('href').split('/').pop().split('#')[0].toLowerCase();
      if (t && t === active) a.setAttribute('aria-current', 'page');
    });
  }

  /* ── Ancres internes via Lenis ───────────────────────────────── */
  function initAnchors() {
    document.querySelectorAll('a[href^="#"]').forEach(a => {
      a.addEventListener('click', e => {
        const id = a.getAttribute('href');
        if (id.length > 1 && document.querySelector(id)) {
          e.preventDefault();
          if (lenis) lenis.scrollTo(id, { offset: -70 });
          else document.querySelector(id).scrollIntoView({ behavior: 'smooth' });
        }
      });
    });
  }

  /* ── Transitions entre pages ─────────────────────────────────
     Rideau qui monte avant la navigation, redescend à l'arrivée.
     Pur CSS + un délai court : aucune dépendance, et si le JS
     échoue les liens restent de simples liens.                     */
  function initTransitions() {
    if (RM) return;
    const curtain = document.querySelector('.curtain');
    if (!curtain) return;
    // Entrée : le rideau part de la position haute et se retire
    curtain.classList.add('out');
    requestAnimationFrame(() => {
      curtain.style.transform = '';
      curtain.classList.remove('out');
    });
    document.querySelectorAll('a[href]').forEach(a => {
      const href = a.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')
          || a.target === '_blank' || /^https?:\/\//.test(href)) return;
      a.addEventListener('click', e => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        curtain.classList.add('in');
        setTimeout(() => { location.href = href; }, 430);
      });
    });
  }

  /* ── Barre de progression de lecture ─────────────────────────── */
  function initProgress() {
    const el = document.querySelector('.prog');
    if (!el) return;
    const upd = () => {
      const h = document.documentElement.scrollHeight - innerHeight;
      el.style.width = (h > 0 ? (scrollY / h) * 100 : 0) + '%';
    };
    addEventListener('scroll', upd, { passive: true });
    addEventListener('resize', upd, { passive: true });
    upd();
  }

  /* ── Curseur sur mesure ──────────────────────────────────────── */
  function initCursor() {
    if (matchMedia('(hover: none)').matches || RM) return;
    const ring = document.querySelector('.cur-ring'), dot = document.querySelector('.cur-dot');
    if (!ring || !dot) return;
    let rx = 0, ry = 0, tx = 0, ty = 0;
    addEventListener('mousemove', e => {
      tx = e.clientX; ty = e.clientY;
      dot.style.left = tx + 'px'; dot.style.top = ty + 'px';
      ring.style.opacity = 1; ring.style.transform = 'translate(-50%,-50%) scale(1)';
    }, { passive: true });
    const loop = () => {
      rx += (tx - rx) * .14; ry += (ty - ry) * .14;
      ring.style.left = rx + 'px'; ring.style.top = ry + 'px';
      if (!hasGsap) requestAnimationFrame(loop);
    };
    if (hasGsap) gsap.ticker.add(loop); else requestAnimationFrame(loop);
    const bind = () => document.querySelectorAll('a,button,.card,.prod,.svc,.cred,.chip').forEach(el => {
      if (el._cur) return; el._cur = 1;
      el.addEventListener('mouseenter', () => document.body.classList.add('cur-link'));
      el.addEventListener('mouseleave', () => document.body.classList.remove('cur-link'));
    });
    bind(); PG_bindCursor = bind;
  }
  let PG_bindCursor = () => {};

  /* ── Réseau neuronal en profondeur ───────────────────────────
     Chaque nœud porte un z, projeté en perspective ; la souris
     déplace la caméra, ce qui crée une parallaxe entre les plans.
     Des impulsions voyagent le long des liens : le réseau « pense ».
     DPR plafonné à 2 et rendu suspendu hors écran.                 */
  function hex2rgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [47, 208, 140];
  }
  function neuralNet(canvasId, opt) {
    const o = Object.assign({ count: 88, drift: .13, linkDist: 155, mouse: true, pulses: true, color: '#2FD08C' }, opt || {});
    const cv = document.getElementById(canvasId);
    if (!cv || RM) return;
    const [cr, cg, cb] = hex2rgb(o.color);
    const lit = [Math.min(255, cr + 113), Math.min(255, cg + 47), Math.min(255, cb + 65)];
    const ctx = cv.getContext('2d', { alpha: true });
    let w = 0, h = 0, dpr = 1, nodes = [], links = [], sig = [],
        camX = 0, camY = 0, tCamX = 0, tCamY = 0, mx = -9999, my = -9999,
        raf = null, visible = false, frame = 0;
    const FOCAL = 620;
    const resize = () => {
      const r = cv.getBoundingClientRect();
      dpr = Math.min(devicePixelRatio || 1, 2);
      w = Math.max(1, Math.round(r.width)); h = Math.max(1, Math.round(r.height));
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const init = () => {
      resize();
      nodes = Array.from({ length: o.count }, () => ({
        x: (Math.random() - .5) * w * 1.5, y: (Math.random() - .5) * h * 1.5, z: Math.random() * 700 + 120,
        vx: (Math.random() - .5) * o.drift, vy: (Math.random() - .5) * o.drift, vz: (Math.random() - .5) * o.drift * .6,
        r: Math.random() * 1.5 + .7,
      }));
    };
    const tick = () => {
      if (!visible) { raf = null; return; }
      frame++;
      camX += (tCamX - camX) * .045; camY += (tCamY - camY) * .045;
      ctx.clearRect(0, 0, w, h);
      for (const n of nodes) {
        n.x += n.vx; n.y += n.vy; n.z += n.vz;
        if (n.x < -w || n.x > w) n.vx *= -1;
        if (n.y < -h || n.y > h) n.vy *= -1;
        if (n.z < 100 || n.z > 830) n.vz *= -1;
        const s = FOCAL / (FOCAL + n.z);
        n._x = w / 2 + (n.x - camX * .5) * s; n._y = h / 2 + (n.y - camY * .5) * s; n._s = s;
      }
      links.length = 0;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const d = Math.hypot(a._x - b._x, a._y - b._y);
          if (d < o.linkDist && Math.abs(a.z - b.z) < 260) {
            const alpha = (1 - d / o.linkDist) * .2 * ((a._s + b._s) / 2);
            ctx.strokeStyle = 'rgba(' + cr + ',' + cg + ',' + cb + ',' + alpha.toFixed(3) + ')';
            ctx.lineWidth = Math.max(.4, (a._s + b._s) / 2);
            ctx.beginPath(); ctx.moveTo(a._x, a._y); ctx.lineTo(b._x, b._y); ctx.stroke();
            if (links.length < 420) links.push([a, b]);
          }
        }
      }
      if (o.pulses) {
        if (frame % 9 === 0 && links.length && sig.length < 16) {
          const l = links[(Math.random() * links.length) | 0];
          sig.push({ a: l[0], b: l[1], t: 0, sp: .014 + Math.random() * .018 });
        }
        for (let k = sig.length - 1; k >= 0; k--) {
          const s = sig[k]; s.t += s.sp;
          if (s.t >= 1) { sig.splice(k, 1); continue; }
          const x = s.a._x + (s.b._x - s.a._x) * s.t, y = s.a._y + (s.b._y - s.a._y) * s.t;
          const fade = Math.sin(s.t * Math.PI);
          ctx.beginPath(); ctx.fillStyle = 'rgba(' + lit[0] + ',' + lit[1] + ',' + lit[2] + ',' + (fade * .85).toFixed(3) + ')';
          ctx.arc(x, y, 1.9 * fade + .5, 0, Math.PI * 2); ctx.fill();
        }
      }
      for (const n of nodes) {
        const near = Math.hypot(n._x - mx, n._y - my) < 150;
        const r = Math.max(.5, n.r * n._s * (near ? 2.1 : 1));
        ctx.beginPath();
        ctx.fillStyle = near ? 'rgba(' + lit[0] + ',' + lit[1] + ',' + lit[2] + ',.95)' : 'rgba(' + cr + ',' + cg + ',' + cb + ',' + (.22 + n._s * .5).toFixed(3) + ')';
        ctx.arc(n._x, n._y, r, 0, Math.PI * 2); ctx.fill();
        if (near) { ctx.beginPath(); ctx.fillStyle = 'rgba(' + cr + ',' + cg + ',' + cb + ',.1)'; ctx.arc(n._x, n._y, r * 3.4, 0, Math.PI * 2); ctx.fill(); }
      }
      raf = requestAnimationFrame(tick);
    };
    if (o.mouse) {
      addEventListener('mousemove', e => {
        const r = cv.getBoundingClientRect();
        mx = e.clientX - r.left; my = e.clientY - r.top;
        tCamX = (mx / w - .5) * 150; tCamY = (my / h - .5) * 110;
      }, { passive: true });
      addEventListener('mouseleave', () => { mx = my = -9999; tCamX = tCamY = 0; }, { passive: true });
    }
    let rt = null;
    addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(resize, 150); }, { passive: true });
    new IntersectionObserver(es => es.forEach(e => {
      visible = e.isIntersecting;
      if (visible && !raf) raf = requestAnimationFrame(tick);
    }), { rootMargin: '10%' }).observe(cv);
    init();
  }

  /* ── Révélations au défilement ───────────────────────────────── */
  function initReveals() {
    if (!hasGsap) {
      // Sans GSAP, tout est visible immédiatement
      document.querySelectorAll('.mask>span').forEach(s => s.style.transform = 'none');
      document.querySelectorAll('[data-rise],.kin-eyebrow,.kin-sub').forEach(e => { e.style.opacity = 1; e.style.transform = 'none'; });
      return;
    }
    document.querySelectorAll('.mask>span').forEach((s, i) => {
      gsap.to(s, {
        y: 0, duration: 1.1, delay: (i % 2) * .12, ease: 'power3.out',
        scrollTrigger: { trigger: s.closest('section,header,div'), start: 'top 82%', once: true },
      });
    });
    document.querySelectorAll('[data-rise]').forEach(el => {
      const sel = el.dataset.rise;
      const targets = sel ? el.querySelectorAll(sel) : [el];
      gsap.fromTo(targets, { opacity: 0, y: 30 }, {
        opacity: 1, y: 0, duration: .9, stagger: .11, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 84%', once: true },
      });
    });
    // Recul cinématique des sections en sortie de cadre (GPU uniquement)
    document.querySelectorAll('[data-push]').forEach(el => {
      gsap.fromTo(el, { scale: 1, opacity: 1 }, {
        scale: .965, opacity: .5, ease: 'none', transformOrigin: '50% 12%',
        scrollTrigger: { trigger: el, start: 'bottom 88%', end: 'bottom 22%', scrub: true },
      });
    });
  }

  /* ── Compteurs animés ────────────────────────────────────────── */
  function countTo(el, to, dur, dec) {
    if (RM) { el.textContent = dec ? to.toFixed(dec) : Math.round(to).toLocaleString(LANG === 'fr' ? 'fr-CA' : 'en-CA'); return; }
    const t0 = performance.now();
    const step = now => {
      const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = dec ? (to * e).toFixed(dec) : Math.round(to * e).toLocaleString(LANG === 'fr' ? 'fr-CA' : 'en-CA');
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  function initStats() {
    document.querySelectorAll('[data-count]').forEach(el => {
      const to = parseFloat(el.dataset.count), dec = parseInt(el.dataset.dec || '0', 10);
      const run = () => countTo(el, to, 1400, dec);
      if (!hasGsap) { run(); return; }
      ScrollTrigger.create({ trigger: el, start: 'top 88%', once: true, onEnter: run });
    });
  }

  /* ── Brouillage de texte (le mot signature) ──────────────────── */
  function scramble(el, glyphs) {
    if (!el || RM) return;
    const target = el.textContent;
    let frame = 0; const total = 26;
    const fixed = target.split('');
    const iv = setInterval(() => {
      frame++;
      const p = frame / total;
      el.textContent = fixed.map((ch, i) => {
        if (ch === ' ' || ch === '.') return ch;
        if (i < p * fixed.length) return ch;
        return glyphs[(i * 7 + frame * 13) % glyphs.length];
      }).join('');
      if (frame >= total) { clearInterval(iv); el.textContent = target; }
    }, 42);
  }
  function initKinetic() {
    const el = document.getElementById('kinWord');
    if (!el) return;
    if (hasGsap) {
      gsap.fromTo(el, { letterSpacing: '.4em', scale: 1.04 }, {
        letterSpacing: '-0.03em', scale: 1, ease: 'none',
        scrollTrigger: { trigger: el.closest('.kin'), start: 'top bottom', end: 'center 55%', scrub: true },
      });
      gsap.to('.kin-eyebrow', { opacity: 1, duration: .8, scrollTrigger: { trigger: '.kin', start: 'top 60%', once: true } });
      gsap.to('.kin-sub', { opacity: 1, duration: .8, delay: .3, scrollTrigger: { trigger: '.kin', start: 'top 60%', once: true } });
      ScrollTrigger.create({ trigger: '.kin', start: 'top 55%', once: true, onEnter: () => scramble(el, '01<>/{}[]#&$%@') });
    }
  }

  /* ── FAQ (accordéon accessible) ──────────────────────────────── */
  function initFaq() {
    document.querySelectorAll('.faq-q').forEach(q => {
      const a = q.nextElementSibling;
      q.setAttribute('aria-expanded', 'false');
      q.onclick = () => {
        const open = q.getAttribute('aria-expanded') === 'true';
        q.setAttribute('aria-expanded', open ? 'false' : 'true');
        a.style.maxHeight = open ? '0px' : a.scrollHeight + 'px';
      };
    });
    // Recalcule la hauteur après un changement de langue
    document.addEventListener('pg:lang', () => {
      document.querySelectorAll('.faq-q[aria-expanded=true]').forEach(q => {
        const a = q.nextElementSibling;
        a.style.maxHeight = 'none';
        requestAnimationFrame(() => { a.style.maxHeight = a.scrollHeight + 'px'; });
      });
    });
  }

  /* ── Copie dans le presse-papiers ────────────────────────────── */
  function initCopy() {
    document.querySelectorAll('[data-copy]').forEach(b => {
      b.onclick = async () => {
        const v = b.dataset.copy;
        try {
          await navigator.clipboard.writeText(v);
          const old = b.querySelector('span').textContent;
          b.querySelector('span').textContent = LANG === 'fr' ? 'Copié !' : 'Copied!';
          setTimeout(() => { b.querySelector('span').textContent = old; }, 1600);
        } catch (e) { location.href = 'mailto:' + v; }
      };
    });
  }

  /* ── Moment signature : le nom comme fenêtre sur le réseau ────
     Un <text> SVG utilisé comme masque : le canvas du réseau neuronal
     n'est visible qu'à travers les lettres. La marque devient
     littéralement ce qu'elle fabrique.                              */
  function initNetmask() {
    const box = document.querySelector('.netmask');
    if (!box) return;
    const svg = box.querySelector('svg');
    const label = box.dataset.word || 'ProGain';
    const id = 'nm' + Math.random().toString(36).slice(2, 8);
    // Le rectangle opaque (couleur de fond) cache le canvas partout
    // SAUF où le masque est noir : le texte, en noir, y perce une
    // fenêtre. Le réseau derrière ne devient visible qu'à travers
    // les lettres — la marque littéralement faite de son produit.
    svg.innerHTML = `
      <defs>
        <mask id="${id}">
          <rect width="100%" height="100%" fill="white"/>
          <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle"
            font-family="Fraunces, serif" font-weight="600" font-size="${box.dataset.size || '15vw'}"
            fill="black">${label}</text>
        </mask>
      </defs>
      <rect width="100%" height="100%" fill="var(--void)" mask="url(#${id})"/>`;
  }

  /* ── Piste horizontale de produits, pilotée par le scroll ─────
     La section reste épinglée en plein écran pendant que la rangée
     de cartes défile horizontalement au rythme du scroll vertical —
     le tour de force qui manque le plus aux sites « une colonne ».  */
  function initTrack() {
    const pin = document.querySelector('.track-pin');
    const track = document.querySelector('.track');
    if (!pin || !track || !hasGsap || RM) return;
    // --gut est un clamp() : getComputedStyle sur la custom property
    // renvoie la chaîne NON résolue ("clamp(20px,5vw,64px)"), pas un
    // pixel. On lit plutôt le padding-left réellement calculé du
    // conteneur, qui lui est toujours une valeur en pixels correcte.
    const gutPx = () => {
      const w = document.querySelector('.wrap') || document.body;
      return parseFloat(getComputedStyle(w).paddingLeft) || 24;
    };
    const distance = () => Math.max(0, track.scrollWidth - innerWidth + 2 * gutPx());
    gsap.to(track, {
      x: () => -distance(),
      ease: 'none',
      scrollTrigger: {
        trigger: pin.closest('.track-sec'), start: 'top top', end: () => '+=' + distance(),
        scrub: true, pin: true, anticipatePin: 1, invalidateOnRefresh: true,
      },
    });
  }

  /* ── Chiffres fantômes : parallaxe très lente ────────────────── */
  function initGhosts() {
    if (!hasGsap) return;
    document.querySelectorAll('.ghost').forEach(g => {
      gsap.fromTo(g, { yPercent: -6 }, { yPercent: 6, ease: 'none',
        scrollTrigger: { trigger: g.closest('section'), start: 'top bottom', end: 'bottom top', scrub: true } });
    });
  }

  /* ── Manifeste : chaque mot s'éclaire au rythme du défilement ──
     Un texte qu'on lit habituellement d'un coup devient une lecture
     que le scroll rythme lui-même — le lecteur « active » la phrase
     en descendant la page, comme chez Stripe ou Apple.               */
  function initManifesto() {
    const el = document.getElementById('mani');
    if (!el) return;
    let st = null;
    const setup = () => {
      if (st) { st.kill(); st = null; }
      const walk = node => {
        Array.from(node.childNodes).forEach(child => {
          if (child.nodeType === 3) {
            const frag = document.createDocumentFragment();
            child.textContent.split(/(\s+)/).forEach(w => {
              if (!w.trim()) { frag.appendChild(document.createTextNode(w)); return; }
              const s = document.createElement('span');
              s.className = 'w'; s.textContent = w;
              frag.appendChild(s);
            });
            node.replaceChild(frag, child);
          } else if (child.nodeType === 1) walk(child);
        });
      };
      walk(el);
      if (!hasGsap || RM) return;
      const words = el.querySelectorAll('.w');
      st = ScrollTrigger.create({
        trigger: el, start: 'top 78%', end: 'bottom 52%', scrub: .4,
        onUpdate: self => {
          const n = words.length;
          words.forEach((w, i) => { w.style.opacity = self.progress > i / n ? 1 : .24; });
        },
      });
    };
    setup();
    document.addEventListener('pg:lang', setup);
  }

  /* ── Boutons magnétiques : le CTA se penche vers le curseur ──── */
  function initMagnetic() {
    if (RM || matchMedia('(hover: none)').matches) return;
    document.querySelectorAll('.btn-solid, .nav-cta').forEach(b => {
      if (b._mag) return; b._mag = 1;
      let qx, qy;
      if (hasGsap) { qx = gsap.quickTo(b, 'x', { duration: .35, ease: 'power3.out' }); qy = gsap.quickTo(b, 'y', { duration: .35, ease: 'power3.out' }); }
      b.addEventListener('mousemove', e => {
        const r = b.getBoundingClientRect();
        const x = (e.clientX - r.left - r.width / 2) * .32, y = (e.clientY - r.top - r.height / 2) * .32;
        if (hasGsap) { qx(x); qy(y); } else b.style.transform = 'translate(' + x + 'px,' + y + 'px)';
      });
      b.addEventListener('mouseleave', () => { if (hasGsap) { qx(0); qy(0); } else b.style.transform = ''; });
    });
  }

  /* ── Bascule 3D : les cartes suivent le curseur en perspective ── */
  function initTilt() {
    if (RM || matchMedia('(hover: none)').matches || !hasGsap) return;
    document.querySelectorAll('.prod, .card').forEach(el => {
      if (el._tilt) return; el._tilt = 1;
      el.style.transition = 'border-color .35s, box-shadow .35s';
      gsap.set(el, { transformPerspective: 800 });
      const qrx = gsap.quickTo(el, 'rotationX', { duration: .5, ease: 'power3.out' });
      const qry = gsap.quickTo(el, 'rotationY', { duration: .5, ease: 'power3.out' });
      const qy = gsap.quickTo(el, 'y', { duration: .5, ease: 'power3.out' });
      el.addEventListener('mousemove', e => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        qry((px - .5) * 9); qrx(-(py - .5) * 9);
      });
      el.addEventListener('mouseenter', () => qy(-6));
      el.addEventListener('mouseleave', () => { qrx(0); qry(0); qy(0); });
    });
  }

  /* ── Globe mondial : le siège à Montréal, des chantiers ailleurs ──
     Un globe filaire en canvas 2D (même technique de projection en
     perspective que le réseau neuronal), qui tourne, qu'on peut faire
     pivoter à la souris, et sur lequel un arc lumineux voyage vers une
     ville qui change — avec l'heure locale réelle, en direct.          */
  function initGlobe() {
    const box = document.getElementById('globeBox');
    const cv = document.getElementById('globeCv');
    if (!box || !cv) return;
    const ctx = cv.getContext('2d', { alpha: true });
    const CITIES = [
      { key: 'mtl', en: 'Montréal', fr: 'Montréal', lat: 45.5017, lon: -73.5673, tz: 'America/Toronto', hub: true },
      { key: 'nyc', en: 'New York', fr: 'New York', lat: 40.7128, lon: -74.0060, tz: 'America/New_York' },
      { key: 'par', en: 'Paris', fr: 'Paris', lat: 48.8566, lon: 2.3522, tz: 'Europe/Paris' },
      { key: 'lon', en: 'London', fr: 'Londres', lat: 51.5074, lon: -0.1278, tz: 'Europe/London' },
      { key: 'dxb', en: 'Dubai', fr: 'Dubaï', lat: 25.2048, lon: 55.2708, tz: 'Asia/Dubai' },
      { key: 'tok', en: 'Tokyo', fr: 'Tokyo', lat: 35.6762, lon: 139.6503, tz: 'Asia/Tokyo' },
      { key: 'sao', en: 'São Paulo', fr: 'São Paulo', lat: -23.5505, lon: -46.6333, tz: 'America/Sao_Paulo' },
    ];
    const toVec = (lat, lon) => {
      const phi = (90 - lat) * Math.PI / 180, theta = (lon + 180) * Math.PI / 180;
      return [Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta)];
    };
    CITIES.forEach(c => { c.v = toVec(c.lat, c.lon); });
    const hub = CITIES.find(c => c.hub), dest = CITIES.filter(c => !c.hub);

    // Grille de latitude / longitude, calculée une fois.
    const gridLat = [];
    for (let lat = -60; lat <= 60; lat += 30) {
      const ring = []; for (let i = 0; i <= 48; i++) ring.push(toVec(lat, (i / 48) * 360 - 180));
      gridLat.push(ring);
    }
    const gridLon = [];
    for (let lon = -180; lon < 180; lon += 30) {
      const ring = []; for (let i = 0; i <= 24; i++) ring.push(toVec((i / 24) * 180 - 90, lon));
      gridLon.push(ring);
    }
    const slerp = (a, b, t) => {
      const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
      const omega = Math.acos(dot);
      if (omega < 1e-4) return a;
      const sA = Math.sin((1 - t) * omega) / Math.sin(omega), sB = Math.sin(t * omega) / Math.sin(omega);
      return [a[0] * sA + b[0] * sB, a[1] * sA + b[1] * sB, a[2] * sA + b[2] * sB];
    };

    let w = 0, h = 0, dpr = 1, R = 0, cx = 0, cy = 0;
    const TILT = 16 * Math.PI / 180;
    const cosT = Math.cos(TILT), sinT = Math.sin(TILT);
    let rot = .5, targetRot = .5, activeIdx = 0, cycleFrame = 0, visible = false, raf = null, dragging = false, lastX = 0;

    const resize = () => {
      const r = box.getBoundingClientRect();
      dpr = Math.min(devicePixelRatio || 1, 2);
      w = Math.max(1, Math.round(r.width)); h = Math.max(1, Math.round(r.height));
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      R = Math.min(w, h) * .36; cx = w / 2; cy = h / 2;
    };

    const tilted = v => [v[0], v[1] * cosT - v[2] * sinT, v[1] * sinT + v[2] * cosT];
    const spin = (v, a) => {
      const ca = Math.cos(a), sa = Math.sin(a);
      return { x: v[0] * ca + v[2] * sa, y: v[1], z: -v[0] * sa + v[2] * ca };
    };
    const FOCAL = () => R * 3.2;
    const project = p => {
      const s = FOCAL() / (FOCAL() + p.z * R);
      return { x: cx + p.x * R * s, y: cy - p.y * R * s, z: p.z, s };
    };
    const faceRot = v => {
      const t = tilted(v);
      return Math.atan2(-t[0], t[2]);
    };

    const setActive = (idx, immediate) => {
      activeIdx = idx; cycleFrame = 0;
      targetRot = faceRot(dest[idx].v);
      if (immediate) rot = targetRot;
      updateHud();
    };

    const hudName = document.getElementById('globeActiveName');
    const hudTime = document.getElementById('globeTime');
    const listEl = document.getElementById('globeList');
    if (listEl && !listEl.childElementCount) {
      dest.forEach((c, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.innerHTML = '<span class="globe-dot" aria-hidden="true"></span><span class="globe-list-n"></span>';
        b.addEventListener('click', () => { setActive(i, false); if (RM) draw(); scheduleCycle(); });
        b._city = c;
        listEl.appendChild(b);
      });
    }
    const updateHud = () => {
      const c = dest[activeIdx];
      if (hudName) hudName.textContent = LANG === 'fr' ? c.fr : c.en;
      if (listEl) listEl.querySelectorAll('button').forEach((b, i) => {
        b.classList.toggle('on', i === activeIdx);
        b.querySelector('.globe-dot').classList.toggle('on', i === activeIdx);
        b.querySelector('.globe-list-n').textContent = LANG === 'fr' ? b._city.fr : b._city.en;
      });
    };
    const tickTime = () => {
      if (!hudTime) return;
      const c = dest[activeIdx];
      try {
        hudTime.textContent = new Intl.DateTimeFormat(LANG === 'fr' ? 'fr-CA' : 'en-CA',
          { timeZone: c.tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
      } catch (e) { hudTime.textContent = '—:—'; }
    };
    setActive(0, true);
    tickTime();
    document.addEventListener('pg:lang', () => { updateHud(); tickTime(); });
    setInterval(tickTime, 15000);
    // Minuterie auto-relançable plutôt qu'un setInterval fixe : un clic
    // sur une ville doit garder sa sélection un plein cycle avant que
    // le globe reprenne la main, sinon le clic semble ignoré.
    let cycleTimer = null;
    const scheduleCycle = () => {
      clearTimeout(cycleTimer);
      cycleTimer = setTimeout(() => {
        if (!dragging) { setActive((activeIdx + 1) % dest.length, false); if (RM) draw(); }
        scheduleCycle();
      }, 4800);
    };
    scheduleCycle();

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(47,208,140,.16)'; ctx.lineWidth = 1; ctx.stroke();
      const drawRing = ring => {
        for (let i = 0; i < ring.length - 1; i++) {
          const a = project(spin(tilted(ring[i]), rot)), b = project(spin(tilted(ring[i + 1]), rot));
          const az = (a.z + b.z) / 2;
          const alpha = Math.max(.02, Math.min(.5, .12 + az * .32));
          ctx.beginPath(); ctx.strokeStyle = 'rgba(47,208,140,' + alpha.toFixed(3) + ')'; ctx.lineWidth = .8;
          ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      };
      gridLat.forEach(drawRing); gridLon.forEach(drawRing);
      // Arc lumineux du siège vers la ville active, légèrement soulevé
      // au-dessus de la sphère — comme une trajectoire de vol.
      const active = dest[activeIdx];
      const N = 40, pts = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const p = slerp(hub.v, active.v, t);
        const lift = 1 + .22 * Math.sin(t * Math.PI);
        pts.push(project(spin(tilted([p[0] * lift, p[1] * lift, p[2] * lift]), rot)));
      }
      ctx.beginPath();
      pts.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
      ctx.strokeStyle = 'rgba(140,255,205,.55)'; ctx.lineWidth = 1.3; ctx.stroke();
      if (!RM) {
        const pt = (cycleFrame % 260) / 260;
        const idx = Math.min(N, Math.floor(pt * N));
        const p = pts[idx];
        if (p && p.z > -.3) {
          ctx.beginPath(); ctx.fillStyle = 'rgba(160,255,212,.95)'; ctx.arc(p.x, p.y, 2.6, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.fillStyle = 'rgba(47,208,140,.14)'; ctx.arc(p.x, p.y, 9, 0, Math.PI * 2); ctx.fill();
        }
      }
      // Points-villes
      CITIES.forEach(c => {
        const p = project(spin(tilted(c.v), rot));
        const front = p.z > -.15;
        const isHub = c.hub, isActive = !isHub && c === active;
        const r = isHub ? 4 : (isActive ? 3.4 : 2.1);
        const al = front ? (isHub ? .95 : (isActive ? .9 : .35)) : .08;
        ctx.beginPath(); ctx.fillStyle = isHub || isActive ? 'rgba(140,255,205,' + al.toFixed(2) + ')' : 'rgba(47,208,140,' + al.toFixed(2) + ')';
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
        if ((isHub || isActive) && front) { ctx.beginPath(); ctx.fillStyle = 'rgba(47,208,140,.12)'; ctx.arc(p.x, p.y, r * 3.2, 0, Math.PI * 2); ctx.fill(); }
      });
    };
    const tick = () => {
      if (!visible) { raf = null; return; }
      cycleFrame++;
      if (!dragging) {
        let d = targetRot - rot; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
        rot += d * .04 + (RM ? 0 : .0009);
      }
      draw();
      raf = requestAnimationFrame(tick);
    };

    box.addEventListener('mousedown', e => { dragging = true; lastX = e.clientX; box.style.cursor = 'grabbing'; });
    addEventListener('mousemove', e => {
      if (!dragging) return;
      const dx = e.clientX - lastX; lastX = e.clientX;
      rot += dx * .006; targetRot = rot;
      if (RM) draw();
    }, { passive: true });
    addEventListener('mouseup', () => { dragging = false; box.style.cursor = 'grab'; });
    box.addEventListener('touchstart', e => { dragging = true; lastX = e.touches[0].clientX; }, { passive: true });
    box.addEventListener('touchmove', e => {
      const dx = e.touches[0].clientX - lastX; lastX = e.touches[0].clientX;
      rot += dx * .006; targetRot = rot; draw();
    }, { passive: true });
    addEventListener('touchend', () => { dragging = false; }, { passive: true });

    let rt = null;
    addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { resize(); draw(); }, 150); }, { passive: true });
    new IntersectionObserver(es => es.forEach(e => {
      visible = e.isIntersecting;
      if (visible && !raf && !RM) raf = requestAnimationFrame(tick);
      if (visible && RM) draw();
    }), { rootMargin: '10%' }).observe(cv);
    resize(); draw();
  }

  /* ── Démarrage ───────────────────────────────────────────────── */
  function boot() {
    initLang(); initNav(); initAnchors(); initTransitions(); initProgress();
    initCursor(); initLoader(); initReveals(); initStats(); initKinetic();
    initFaq(); initCopy(); initNetmask(); initTrack(); initGhosts();
    initManifesto(); initMagnetic(); initTilt(); initGlobe();
    if (document.getElementById('net')) neuralNet('net');
    if (document.getElementById('net2')) neuralNet('net2', { count: 52, linkDist: 140, drift: .1, mouse: false });
    if (document.getElementById('net3')) neuralNet('net3', { count: 40, linkDist: 130, drift: .09, mouse: false, pulses: true });
    // Plus dense que les autres réseaux : les nœuds doivent remplir
    // les lettres, pas seulement flotter dans la boîte qui les entoure.
    if (document.getElementById('netmaskCv')) neuralNet('netmaskCv', { count: 220, linkDist: 90, drift: .14, mouse: true, pulses: true });
    // Chaque page produit reçoit le réseau teinté de sa propre couleur —
    // la même signature que l'accueil, déclinée par produit.
    const phnet = document.getElementById('phnet');
    if (phnet) neuralNet('phnet', { count: 64, linkDist: 130, drift: .09, mouse: true, pulses: true, color: phnet.dataset.acc });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  return {
    get lang() { return LANG; },
    get reduced() { return RM; },
    get hasGsap() { return hasGsap; },
    countTo, scramble, neuralNet,
    bindCursor: () => PG_bindCursor(),
  };
})();
