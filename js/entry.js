/* Art of Sushi — üzletválasztó: nyitás, egér-parallaxis, átmenet */
(() => {
  'use strict';
  const root = document.documentElement;
  const entry = document.querySelector('.entry');
  const shops = [...document.querySelectorAll('.shop')];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover:hover) and (pointer:fine)').matches;

  // nyitó animáció: a fontok és az első kép után indul
  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      root.classList.add('ready');
      setTimeout(() => root.classList.add('settled'), reduce ? 0 : 3200);
    }));
  };
  const firstImg = document.querySelector('.shop--new img');
  Promise.all([
    document.fonts ? document.fonts.ready : Promise.resolve(),
    firstImg.complete ? Promise.resolve() : new Promise(r => { firstImg.onload = firstImg.onerror = r; })
  ]).then(start);
  setTimeout(start, 2500);

  // finom egér-parallaxis a képeken
  if (fine && !reduce) {
    let ty = 0, cy = 0;
    addEventListener('pointermove', e => { ty = (e.clientY / innerHeight - .5) * -18; }, { passive: true });
    const loop = () => {
      cy += (ty - cy) * .06;
      shops.forEach((s, i) => s.style.setProperty('--py', `${(i ? -cy : cy).toFixed(2)}px`));
      requestAnimationFrame(loop);
    };
    loop();
  }

  // a Bazilika oldal előtöltése, ha az egér odaér
  let prefetched = false;
  shops[0].addEventListener('pointerenter', () => {
    if (prefetched) return;
    prefetched = true;
    const l = document.createElement('link');
    l.rel = 'prefetch'; l.href = 'bazilika.html';
    document.head.appendChild(l);
  });

  // kattintás: a választott üzlet kitölti a képernyőt, majd továbblép
  shops.forEach(shop => shop.addEventListener('click', e => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    if (root.classList.contains('leaving')) return;
    const href = shop.getAttribute('href');
    if (reduce) { location.href = href; return; }
    shop.classList.add('is-chosen');
    root.classList.add('leaving');
    setTimeout(() => { location.href = href; }, 1350);
  }));

  // vissza gombnál (bfcache) álljon vissza a kezdőállapot
  addEventListener('pageshow', e => {
    if (!e.persisted) return;
    root.classList.remove('leaving');
    shops.forEach(s => s.classList.remove('is-chosen'));
  });
})();
