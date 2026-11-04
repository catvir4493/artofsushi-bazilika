/* Art of Sushi Bazilika — interakciók (külső könyvtár nélkül) */
(() => {
  'use strict';

  /* ===== Beállítások =====
     A foglalási űrlap így küld (az első kitöltött opció érvényes):
     1) FORM_ENDPOINT: a Google Apps Script webalkalmazás URL-je (…/exec), lásd apps-script/README.md
     2) BOOKING_EMAIL: e-mail cím → megnyitja a levelezőt kitöltött levéllel
     3) egyik sem: megköszöni és telefonos megerősítést kér
     TURNSTILE_SITEKEY: Cloudflare Turnstile nyilvános kulcs (opcionális, spam ellen) */
  const CONFIG = {
    FORM_ENDPOINT: '',
    TURNSTILE_SITEKEY: '',
    BOOKING_EMAIL: '',
    PHONE: '+36 30 516 1606',
    OPEN_HOUR: 12,
    CLOSE_HOUR: 24,
    TZ: 'Europe/Budapest'
  };

  // nyelvfüggő szövegek (js/i18n.js)
  const T = (k, ...a) => window.AOS_I18N ? AOS_I18N.s(k, ...a) : k;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = t => 1 - Math.pow(1 - t, 4);
  const easeInOut = t => t < .5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;
  const root = document.documentElement;
  const body = document.body;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover:hover) and (pointer:fine)').matches;
  if (reduce) root.classList.add('reduce');
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  let W = document.documentElement.clientWidth, H = innerHeight;

  /* =========================================================
     Sima görgetés (Lenis-szerű, natív görgetősávval)
     ========================================================= */
  const smooth = {
    enabled: finePointer && !reduce,
    target: scrollY, current: scrollY, running: false,
    max() { return document.documentElement.scrollHeight - H; },
    to(y) {
      y = clamp(y, 0, this.max());
      if (!this.enabled) { scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' }); return; }
      this.target = y; this.running = true;
    },
    tick() {
      if (!this.running) return;
      this.current = lerp(this.current, this.target, .085);
      if (Math.abs(this.target - this.current) < .4) { this.current = this.target; this.running = false; }
      scrollTo(0, this.current);
    }
  };
  if (smooth.enabled) {
    addEventListener('wheel', e => {
      if (e.ctrlKey || body.classList.contains('is-locked')) return;
      if (e.target.closest('textarea, select, .lightbox')) return;
      e.preventDefault();
      const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * H : e.deltaY;
      if (!smooth.running) smooth.current = scrollY;
      smooth.target = clamp(smooth.target + d, 0, smooth.max());
      smooth.running = true;
    }, { passive: false });
  } else {
    root.classList.add('native-smooth');
  }
  addEventListener('scroll', () => { if (!smooth.running) smooth.target = smooth.current = scrollY; }, { passive: true });

  const goTo = hash => {
    if (hash === '#top') { smooth.to(0); return; }
    const el = $(hash);
    if (!el) return;
    smooth.to(el.getBoundingClientRect().top + scrollY - (hash === '#foglalas' ? 0 : 20));
  };
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const hash = a.getAttribute('href');
    if (hash.length < 2) return;
    e.preventDefault();
    if (body.classList.contains('menu-open')) { toggleMenu(false); setTimeout(() => goTo(hash), 650); }
    else goTo(hash);
  });

  /* =========================================================
     Betöltő + nyitó animáció
     ========================================================= */
  const loader = $('.loader');
  const countEl = $('.loader__count span');
  const barEl = $('.loader__bar span');
  const heroImg = $('.hero__frame img');
  const intro = { v: reduce ? 1 : 0, done: reduce };
  let loadTarget = 0, loadShown = 0, finished = false;
  const t0 = performance.now();
  body.classList.add('is-locked');

  const critical = [heroImg, ...$$('.about img'), ...$$('.feature__img img')];
  let loadedCount = 0;
  const bump = () => { loadedCount++; loadTarget = loadedCount / critical.length; };
  critical.forEach(img => {
    if (img.complete && img.naturalWidth) bump();
    else {
      img.addEventListener('load', bump, { once: true });
      img.addEventListener('error', () => { img._err = (img._err || 0) + 1; if (img._err >= 2) bump(); });
    }
  });
  setTimeout(() => { loadTarget = 1; }, 4500);

  function tickLoader(now) {
    if (finished) return;
    const minT = clamp((now - t0) / 1900);
    loadShown = lerp(loadShown, Math.min(loadTarget, minT), .08);
    if (Math.min(loadTarget, minT) >= 1 && loadShown > .995) loadShown = 1;
    countEl.textContent = String(Math.round(loadShown * 100)).padStart(3, '0');
    barEl.style.transform = `scaleX(${loadShown})`;
    if (loadShown >= 1) finishLoader();
  }
  function finishLoader() {
    finished = true;
    scrollTo(0, 0); smooth.target = smooth.current = 0;
    root.classList.add('loaded');
    setTimeout(() => {
      root.classList.add('intro-in');
      const s = performance.now();
      const run = t => {
        intro.v = clamp((t - s) / 2000);
        if (intro.v < 1) requestAnimationFrame(run); else intro.done = true;
      };
      requestAnimationFrame(run);
    }, 350);
    setTimeout(() => { body.classList.remove('is-locked'); }, 1300);
    setTimeout(() => loader.classList.add('done'), 1700);
  }
  if (reduce) { loadShown = 1; finishLoader(); }

  /* =========================================================
     Szövegbontás
     ========================================================= */
  const splitEl = el => {
    const txt = el.textContent.trim();
    el.setAttribute('aria-label', txt);
    el.innerHTML = txt.split(/\s+/).map(w =>
      `<span class="w" aria-hidden="true">${[...w].map(c => `<span class="ch">${c}</span>`).join('')}</span>`).join(' ');
    $$('.ch', el).forEach((c, i) => c.style.transitionDelay = `${i * 24}ms`);
  };
  $$('.split').forEach(splitEl);

  // görgetésre kitöltődő mondat
  const fill = $('[data-fill]');
  let fillWords = [];
  const wrap = node => {
      [...node.childNodes].forEach(n => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(part => {
            if (!part) return;
            if (/^\s+$/.test(part)) frag.appendChild(document.createTextNode(part));
            else { const s = document.createElement('span'); s.className = 'sw'; s.textContent = part; frag.appendChild(s); }
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1) wrap(n);
      });
    };
  if (fill) { wrap(fill); fillWords = $$('.sw', fill); }

  /* =========================================================
     Megjelenés görgetésre (IntersectionObserver)
     ========================================================= */
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      e.target.classList.add('in');
      io.unobserve(e.target);
      if (e.target.dataset.count) countUp(e.target);
      $$('[data-count]', e.target).forEach(countUp);
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -60px 0px' });
  $$('.reveal-up, .split, .facts li').forEach(el => io.observe(el));
  // a képek már akkor nyíljanak, amikor a széle beér a képernyőre
  const ioClip = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); ioClip.unobserve(e.target); } });
  }, { threshold: 0, rootMargin: '0px 0px 25% 0px' });
  $$('.clip').forEach(el => ioClip.observe(el));

  function countUp(el) {
    if (el.dataset.done) return;
    el.dataset.done = 1;
    const end = +el.dataset.count;
    const fmt = n => el.dataset.format === 'hu' ? n.toLocaleString('hu-HU').replace(/ /g, ' ') : n;
    if (reduce) { el.textContent = fmt(end); return; }
    const dur = 1800, s = performance.now();
    const step = t => {
      const p = clamp((t - s) / dur);
      el.textContent = fmt(Math.round(end * easeOut(p)));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* =========================================================
     Jelenetek
     ========================================================= */
  const hero = $('.hero');
  const frame = $('.hero__frame');
  const wordL = $('.hero__word--l');
  const wordR = $('.hero__word--r');
  const metas = $$('.hero__meta');
  const veil = $('.hero__veil');
  const after = $('.hero__after');
  const hint = $('.hero__hint');
  const outline = $('.hero__outline');

  function renderHero() {
    const total = hero.offsetHeight - H;
    const p = total > 0 ? clamp(-hero.getBoundingClientRect().top / total) : 0;
    if (p >= 1 && hero.dataset.idle) return;
    hero.dataset.idle = p >= 1 ? '1' : '';
    // a keret méreteit a valódi elemből mérjük (görgetősáv, oldalsáv nem zavar be)
    const FW = frame.clientWidth, FH = frame.clientHeight;
    const mobile = FW < 640;
    const fw = mobile ? FW * .64 : Math.min(FW * .27, FH * .5);
    const fh = mobile ? FH * .46 : FH * .66;
    const t0 = (FH - fh) / 2, l0 = (FW - fw) / 2;
    const iv = easeOut(clamp(intro.v / .55));
    const ih = easeOut(clamp((intro.v - .18) / .82));
    const e = easeInOut(clamp(p / .62));
    const top = lerp(lerp(FH / 2, t0, iv), 0, e);
    const left = lerp(lerp(FW / 2, l0, ih), 0, e);
    frame.style.clipPath = `inset(${top}px ${left}px ${top}px ${left}px)`;
    const g = 14 + e * 30;
    outline.style.width = `${FW - left * 2 + g * 2}px`;
    outline.style.height = `${FH - top * 2 + g * 2}px`;
    outline.style.transform = `translate3d(${left - g}px, ${top - g}px, 0)`;
    outline.style.opacity = clamp((ih - .6) / .4) * (1 - clamp(p / .35));
    heroImg.style.transform = `scale(${1.4 - .22 * easeOut(intro.v) - .18 * e}) translateY(${p * 4}%)`;

    const out = easeInOut(clamp(p / .5));
    const wo = 1 - clamp(p / .42);
    if (mobile) {
      wordL.style.transform = `translate(-50%, ${-out * H * .25}px)`;
      wordR.style.transform = `translate(-50%, ${out * H * .25}px)`;
    } else {
      wordL.style.transform = `translate(${-out * W * .3}px, -58%)`;
      wordR.style.transform = `translate(${out * W * .3}px, -42%)`;
    }
    wordL.style.opacity = wordR.style.opacity = wo;
    metas.forEach(m => m.style.opacity = 1 - clamp(p / .25));
    if (intro.done) hint.style.opacity = 1 - clamp(p / .12);
    veil.style.opacity = clamp((p - .42) / .3);
    const a = clamp((p - .58) / .26);
    after.style.opacity = a;
    after.style.transform = `translate(-50%, calc(-50% + ${(1 - easeOut(a)) * 50}px))`;
    after.classList.toggle('live', a > .6);
  }

  function renderFill() {
    if (!fill || reduce) return;
    const r = fill.getBoundingClientRect();
    if (r.bottom < -100 || r.top > H + 100) return;
    const fp = clamp((H * .82 - r.top) / (r.height + H * .32));
    const n = fillWords.length;
    fillWords.forEach((w, i) => { w.style.opacity = .14 + .86 * clamp(fp * n * 1.05 - i); });
  }

  const speedEls = $$('[data-speed]');
  function renderSpeed() {
    if (reduce) return;
    speedEls.forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.bottom < -200 || r.top > H + 200) return;
      const off = (r.top + r.height / 2 - H / 2) * -(+el.dataset.speed);
      el.style.transform = `translate3d(0, ${off.toFixed(1)}px, 0)`;
    });
  }

  // vízszintes galéria
  const hgal = $('.hgal');
  const track = $('.hgal__track');
  const gItems = $$('.g', track);
  const gImgs = gItems.map(g => $('img', g));
  const gBar = $('.hgal__progress span');
  const gCount = $('.hgal__count b');
  let gDist = 0;
  function sizeGallery() {
    if (reduce) return;
    gDist = Math.max(0, track.scrollWidth - W);
    hgal.style.height = `${gDist + H}px`;
  }
  function renderGallery() {
    if (reduce) return;
    const r = hgal.getBoundingClientRect();
    if (r.bottom < 0 || r.top > H) return;
    const p = clamp(-r.top / (hgal.offsetHeight - H || 1));
    track.style.transform = `translate3d(${-p * gDist}px, 0, 0)`;
    gBar.style.transform = `scaleX(${p})`;
    let best = 0, bestD = 1e9;
    gItems.forEach((g, i) => {
      const gr = g.getBoundingClientRect();
      const c = gr.left + gr.width / 2 - W / 2;
      if (Math.abs(c) < bestD) { bestD = Math.abs(c); best = i; }
      if (gr.right > -100 && gr.left < W + 100) gImgs[i].style.transform = `translateX(${(-c * .07).toFixed(1)}px) scale(1.15)`;
    });
    gCount.textContent = String(best + 1).padStart(2, '0');
  }

  // futó szalag (görgetési sebességtől függ)
  const tTrack = $('.ticker__track');
  let tX = 0, tSkew = 0, tDir = 1;
  function renderTicker(vel) {
    if (reduce) return;
    if (Math.abs(vel) > .5) tDir = vel > 0 ? 1 : -1;
    tX -= (.5 + Math.min(Math.abs(vel), 60) * .22) * tDir;
    const half = tTrack.scrollWidth / 2;
    if (tX <= -half) tX += half;
    if (tX > 0) tX -= half;
    tSkew = lerp(tSkew, clamp(vel * .12, -7, 7), .1);
    tTrack.style.transform = `translate3d(${tX}px,0,0) skewX(${-tSkew}deg)`;
  }

  // függönyös lábléc
  const main = $('.main');
  const footer = $('.footer');
  const giant = $('.footer__giant span');
  function sizeFooter() {
    const fh = footer.offsetHeight;
    if (fh > H * .98) { footer.classList.add('static'); main.style.marginBottom = '0'; }
    else { footer.classList.remove('static'); main.style.marginBottom = `${fh}px`; }
  }
  function renderFooter() {
    if (reduce || footer.classList.contains('static')) return;
    const remain = document.documentElement.scrollHeight - H - scrollY;
    const fh = footer.offsetHeight;
    if (remain > fh) { footer.style.visibility = 'hidden'; return; }
    footer.style.visibility = '';
    const p = 1 - remain / fh;
    giant.style.transform = `translate3d(0, ${(1 - p) * 40}%, 0)`;
  }

  // fejléc
  const nav = $('.nav');
  let lastY = 0;
  function renderNav(y) {
    if (!body.classList.contains('menu-open')) {
      const pastHero = y > hero.offsetHeight - H * .5;
      if (Math.abs(y - lastY) > 2) nav.classList.toggle('is-hidden', y > lastY && pastHero);
      nav.classList.toggle('is-solid', pastHero);
    }
    lastY = y;
  }

  /* =========================================================
     Kurzor
     ========================================================= */
  const cursor = $('.cursor');
  const cDot = $('.cursor__dot'), cRing = $('.cursor__ring'), cLabel = $('.cursor__label');
  const mouse = { x: W / 2, y: H / 2, rx: W / 2, ry: H / 2 };
  if (finePointer && !reduce) {
    root.classList.add('has-cursor');
    addEventListener('pointermove', e => {
      mouse.x = e.clientX; mouse.y = e.clientY;
      cursor.classList.add('on');
    }, { passive: true });
    document.addEventListener('pointerleave', () => cursor.classList.remove('on'));
    document.addEventListener('pointerover', e => {
      const lab = e.target.closest('[data-cursor]');
      const hov = e.target.closest('a, button, input, select, textarea, label, .dish');
      if (lab && !e.target.closest('.carousel__btn')) { cLabel.textContent = lab.dataset.cursor; cursor.classList.add('has-label'); }
      else cursor.classList.remove('has-label');
      cursor.classList.toggle('is-hover', !!hov && !lab);
    });
  }
  function renderCursor() {
    if (!finePointer || reduce) return;
    mouse.rx = lerp(mouse.rx, mouse.x, .16);
    mouse.ry = lerp(mouse.ry, mouse.y, .16);
    cDot.style.transform = `translate3d(${mouse.x}px, ${mouse.y}px, 0)`;
    cRing.style.transform = `translate3d(${mouse.rx}px, ${mouse.ry}px, 0)`;
  }

  /* =========================================================
     Fő ciklus
     ========================================================= */
  let prevY = scrollY;
  function loop(now) {
    tickLoader(now);
    smooth.tick();
    const y = scrollY;
    const vel = y - prevY; prevY = y;
    renderHero();
    renderFill();
    renderSpeed();
    renderGallery();
    renderTicker(vel);
    renderFooter();
    renderNav(y);
    renderCursor();
    requestAnimationFrame(loop);
  }

  function onResize() {
    W = document.documentElement.clientWidth; H = innerHeight;
    hero.dataset.idle = '';
    sizeGallery(); sizeFooter();
  }
  addEventListener('resize', onResize);
  addEventListener('load', onResize);
  if (document.fonts) document.fonts.ready.then(onResize);
  onResize();
  requestAnimationFrame(loop);

  /* =========================================================
     Teljes képernyős menü
     ========================================================= */
  const menuBtn = $('.nav__menu');
  const overlay = $('#overlay');
  const preview = $('.overlay__preview img');
  function toggleMenu(open) {
    body.classList.toggle('menu-open', open);
    body.classList.toggle('is-locked', open);
    menuBtn.setAttribute('aria-expanded', open);
    menuBtn.setAttribute('aria-label', T(open ? 'menuClose' : 'menuOpen'));
    overlay.setAttribute('aria-hidden', !open);
    nav.classList.remove('is-hidden');
  }
  menuBtn.addEventListener('click', () => toggleMenu(!body.classList.contains('menu-open')));
  addEventListener('keydown', e => { if (e.key === 'Escape' && body.classList.contains('menu-open')) toggleMenu(false); });
  $$('.overlay__links a').forEach(a => a.addEventListener('pointerenter', () => {
    const src = a.dataset.img;
    if (preview.getAttribute('src') === src) return;
    preview.classList.add('swap');
    setTimeout(() => { preview.onerror = () => aosImg(preview); preview.src = src; preview.classList.remove('swap'); }, 250);
  }));

  /* =========================================================
     Nyitvatartás (budapesti idő)
     ========================================================= */
  function budapestHour() {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: CONFIG.TZ, hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(new Date());
    return (+parts.find(p => p.type === 'hour').value % 24) + (+parts.find(p => p.type === 'minute').value) / 60;
  }
  function updateStatus() {
    const now = budapestHour();
    const open = now >= CONFIG.OPEN_HOUR && now < CONFIG.CLOSE_HOUR;
    $$('.live-dot').forEach(d => d.classList.toggle('is-open', open));
    $$('.live-text').forEach(t => t.textContent = T(open ? 'open' : 'closed'));
    $$('.status-pill').forEach(p => { p.textContent = T(open ? 'pillOpen' : 'pillClosed'); p.classList.toggle('is-open', open); });
  }
  updateStatus(); setInterval(updateStatus, 60000);

  /* =========================================================
     Étlap körhinta
     ========================================================= */
  const car = $('.carousel');
  if (car) {
    const ui = $('.carousel__ui');
    const stage = $('.carousel__stage', car);
    const cards = $$('.dish', car);
    const dotsBox = $('.carousel__dots', ui);
    const count = $('.carousel__count b', ui);
    const n = cards.length;
    let cur = 0, timer = null;
    const dots = cards.map((c, i) => {
      const d = document.createElement('button');
      d.setAttribute('role', 'tab');
      d.setAttribute('aria-label', c.querySelector('h3').textContent);
      d.addEventListener('click', () => go(i));
      dotsBox.appendChild(d);
      return d;
    });
    function layout() {
      const shift = W < 640 ? 78 : 92;
      cards.forEach((c, i) => {
        let d = i - cur;
        if (d > n / 2) d -= n;
        if (d < -n / 2) d += n;
        const a = Math.abs(d);
        c.style.transform = `translateX(${d * shift}%) scale(${a === 0 ? 1 : a === 1 ? .78 : .6})`;
        c.style.opacity = a === 0 ? 1 : a === 1 ? .36 : 0;
        c.style.filter = a === 0 ? 'none' : 'grayscale(.5) brightness(.55)';
        c.style.zIndex = 10 - a;
        c.style.pointerEvents = a > 1 ? 'none' : '';
        c.classList.toggle('is-active', a === 0);
        c.classList.toggle('is-side', a === 1);
        c.setAttribute('aria-hidden', a !== 0);
      });
      dots.forEach((d, i) => {
        d.setAttribute('aria-selected', i === cur);
        if (i === cur) { d.style.animation = 'none'; void d.offsetWidth; d.style.animation = ''; }
      });
      count.textContent = String(cur + 1).padStart(2, '0');
    }
    const go = i => { cur = (i + n) % n; layout(); restart(); };
    const restart = () => {
      clearInterval(timer);
      if (!reduce && !car.classList.contains('paused')) timer = setInterval(() => { cur = (cur + 1) % n; layout(); }, 5500);
    };
    $('.carousel__prev', ui).addEventListener('click', () => go(cur - 1));
    $('.carousel__next', ui).addEventListener('click', () => go(cur + 1));
    let sx = null, sy = 0, dragged = false;
    cards.forEach((c, i) => c.addEventListener('click', () => { if (dragged) { dragged = false; return; } if (i !== cur) go(i); }));
    car.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft') go(cur - 1);
      if (e.key === 'ArrowRight') go(cur + 1);
    });
    car.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') { car.classList.add('paused'); clearInterval(timer); } });
    car.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { car.classList.remove('paused'); restart(); } });
    stage.addEventListener('pointerdown', e => { sx = e.clientX; sy = e.clientY; });
    addEventListener('pointerup', e => {
      if (sx === null) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      dragged = Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy);
      if (dragged) go(cur + (dx < 0 ? 1 : -1));
      sx = null;
    });
    stage.addEventListener('dragstart', e => e.preventDefault());
    addEventListener('resize', layout);
    layout(); restart();
  }

  /* =========================================================
     Galéria lightbox
     ========================================================= */
  const lb = $('.lightbox');
  const lbImg = $('img', lb);
  const items = $$('.g img');
  let idx = 0, lastFocus = null;
  const show = i => {
    idx = (i + items.length) % items.length;
    lbImg.src = items[idx].currentSrc || items[idx].src;
    lbImg.alt = items[idx].alt;
    $('.lightbox__count', lb).textContent = `${String(idx + 1).padStart(2, '0')} / ${String(items.length).padStart(2, '0')}`;
  };
  const openLb = i => { lastFocus = document.activeElement; show(i); lb.hidden = false; body.classList.add('is-locked'); $('.lightbox__close', lb).focus(); };
  const closeLb = () => { lb.hidden = true; body.classList.remove('is-locked'); lastFocus && lastFocus.focus(); };
  $$('.g').forEach((g, i) => g.addEventListener('click', () => openLb(i)));
  $('.lightbox__close', lb).addEventListener('click', closeLb);
  $('.lightbox__prev', lb).addEventListener('click', () => show(idx - 1));
  $('.lightbox__next', lb).addEventListener('click', () => show(idx + 1));
  lb.addEventListener('click', e => { if (e.target === lb) closeLb(); });
  addEventListener('keydown', e => {
    if (lb.hidden) return;
    if (e.key === 'Escape') closeLb();
    if (e.key === 'ArrowLeft') show(idx - 1);
    if (e.key === 'ArrowRight') show(idx + 1);
  });

  /* =========================================================
     Foglalási űrlap
     ========================================================= */
  const form = $('#bookingForm');
  const date = $('#f-date');
  const time = $('#f-time');
  const guestsOut = $('#f-guests');
  const msg = $('.form-msg', form);
  const pad = n => String(n).padStart(2, '0');
  const today = new Date();
  date.min = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  for (let h = CONFIG.OPEN_HOUR; h <= CONFIG.CLOSE_HOUR - 2; h++) {
    for (const m of [0, 30]) {
      if (h === CONFIG.CLOSE_HOUR - 2 && m) continue;
      const v = `${pad(h)}:${pad(m)}`;
      time.add(new Option(v, v, v === '19:00', v === '19:00'));
    }
  }
  let guests = 2;
  $$('.guests button', form).forEach(b => b.addEventListener('click', () => {
    guests = Math.min(30, Math.max(1, guests + +b.dataset.step));
    guestsOut.textContent = guests;
  }));
  if (CONFIG.TURNSTILE_SITEKEY) {
    const box = document.createElement('div');
    box.className = 'cf-turnstile'; box.dataset.sitekey = CONFIG.TURNSTILE_SITEKEY; box.dataset.theme = 'dark';
    $('.check', form).after(box);
    const sc = document.createElement('script');
    sc.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'; sc.async = true; sc.defer = true;
    document.head.appendChild(sc);
  }
  form.addEventListener('submit', async e => {
    e.preventDefault();
    msg.className = 'form-msg'; msg.textContent = '';
    let ok = true;
    $$('input[required], select[required]', form).forEach(inp => {
      const valid = inp.type === 'checkbox' ? inp.checked : inp.checkValidity() && inp.value.trim() !== '';
      inp.closest('.field')?.classList.toggle('invalid', !valid);
      if (!valid) ok = false;
    });
    if (!ok) { msg.classList.add('err'); msg.textContent = T('formErr'); return; }
    const data = Object.fromEntries(new FormData(form));
    data.guests = guests;
    const summary = `Asztalfoglalás – Art of Sushi Bazilika
Név: ${data.name}
Email: ${data.email}
Telefon: ${data.phone}
Dátum: ${data.date} ${data.time}
Létszám: ${data.guests} fő
Egyéb kérés: ${data.note || '-'}
Nyelv: ${T('langName')}`;
    try {
      if (CONFIG.FORM_ENDPOINT) {
        // text/plain: így a böngésző nem küld előzetes CORS-kérést az Apps Scriptnek
        const res = await fetch(CONFIG.FORM_ENDPOINT, {
          method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            name: data.name, email: data.email, phone: data.phone, date: data.date, time: data.time,
            guests, note: data.note || '', lang: window.AOS_I18N ? AOS_I18N.lang : 'hu',
            website: data.website || '', turnstile: data['cf-turnstile-response'] || ''
          })
        });
        const out = await res.json().catch(() => ({}));
        if (!res.ok || !out.ok) throw new Error(out.error || res.status);
      } else if (CONFIG.BOOKING_EMAIL) {
        location.href = `mailto:${CONFIG.BOOKING_EMAIL}?subject=${encodeURIComponent('Asztalfoglalás – Bazilika')}&body=${encodeURIComponent(summary)}`;
      }
      msg.classList.add('ok');
      msg.textContent = (CONFIG.FORM_ENDPOINT || CONFIG.BOOKING_EMAIL)
        ? T('sent', data.name, data.date, data.time, guests, CONFIG.PHONE)
        : T('call', data.name, data.date, data.time, guests, CONFIG.PHONE);
      form.reset(); guests = 2; guestsOut.textContent = 2; time.value = '19:00';
      if (window.turnstile) try { turnstile.reset(); } catch {}
    } catch (err) {
      msg.classList.add('err');
      msg.textContent = T('fail', CONFIG.PHONE);
    }
  });

  /* ----- Süti értesítő ----- */
  const cookie = $('.cookie');
  const showCookie = () => {
    const check = () => { if (scrollY > H * 1.2) { cookie.hidden = false; removeEventListener('scroll', check); } };
    addEventListener('scroll', check, { passive: true });
  };
  try { if (!localStorage.getItem('aos-cookie')) showCookie(); } catch { showCookie(); }
  $('button', cookie).addEventListener('click', () => {
    cookie.hidden = true;
    try { localStorage.setItem('aos-cookie', '1'); } catch {}
  });

  /* ----- Nyelvváltás: a bontott szövegek újraépítése ----- */
  document.addEventListener('aos:lang', () => {
    $$('.split').forEach(splitEl);
    if (fill) { wrap(fill); fillWords = $$('.sw', fill); }
    updateStatus();
    const heads = $$('.dish h3');
    $$('.carousel__dots button').forEach((d, i) => heads[i] && d.setAttribute('aria-label', heads[i].textContent));
    menuBtn.setAttribute('aria-label', T(body.classList.contains('menu-open') ? 'menuClose' : 'menuOpen'));
  });

  /* ----- Térkép: csak kattintásra (GDPR) ----- */
  const mapBox = $('.map-consent');
  if (mapBox) $('.map-consent__load', mapBox).addEventListener('click', () => {
    const f = document.createElement('iframe');
    f.title = 'Art of Sushi Bazilika'; f.referrerPolicy = 'no-referrer-when-downgrade'; f.src = mapBox.dataset.src;
    mapBox.replaceWith(f);
  });

  $('#year').textContent = new Date().getFullYear();
})();
