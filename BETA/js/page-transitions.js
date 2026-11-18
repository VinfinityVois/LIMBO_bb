/* P.R.I.N.C. luminous cross-page dissolve */
(() => {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const reveal = () => {
    if (reduce) return;
    document.documentElement.classList.add('page-transition-ready');
    window.setTimeout(() => document.documentElement.classList.remove('page-transition-ready'), 950);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', reveal, {once:true});
  else reveal();

  document.addEventListener('click', event => {
    const link = event.target.closest('a[href]');
    if (!link || reduce || event.defaultPrevented || event.button !== 0 ||
        event.metaKey || event.ctrlKey || event.shiftKey || event.altKey ||
        (link.target && link.target !== '_self') || link.hasAttribute('download')) return;
    let destination;
    try { destination = new URL(link.href, location.href); } catch (_) { return; }
    if (destination.origin !== location.origin ||
        !/\.html?$/i.test(destination.pathname) ||
        (destination.pathname === location.pathname && destination.search === location.search)) return;
    event.preventDefault();
    let overlay = document.getElementById('page-transition');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'page-transition';
      overlay.setAttribute('aria-hidden', 'true');
      document.body.appendChild(overlay);
    }
    document.documentElement.classList.add('page-transition-leave');
    overlay.classList.add('is-active');
    window.setTimeout(() => { location.href = destination.href; }, 520);
  });
})();
