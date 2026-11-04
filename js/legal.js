/* Jogi oldalak: HU / EN váltás (ugyanaz a választás, mint a fő oldalon) */
(() => {
  const KEY = 'aos-lang';
  const q = new URLSearchParams(location.search).get('lang');
  let l = q === 'en' || q === 'hu' ? q : null;
  if (!l) try { l = localStorage.getItem(KEY); } catch (e) {}
  if (!l) l = (navigator.language || 'hu').toLowerCase().startsWith('hu') ? 'hu' : 'en';
  const set = v => {
    document.documentElement.lang = v;
    document.querySelectorAll('.lang button').forEach(b => b.setAttribute('aria-pressed', b.dataset.lang === v));
    const t = document.querySelector(`[data-title-${v}]`);
    if (t) document.title = t.getAttribute(`data-title-${v}`);
    try { localStorage.setItem(KEY, v); } catch (e) {}
  };
  set(l);
  document.addEventListener('click', e => { const b = e.target.closest('.lang button'); if (b) set(b.dataset.lang); });
})();
