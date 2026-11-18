/* P.R.I.N.C. cross-page transition layer */
(() => {
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const makeOverlay = () => {
    let node = document.getElementById('page-transition');
    if (!node) {
      node = document.createElement('div');
      node.id = 'page-transition';
      node.setAttribute('aria-hidden', 'true');
      document.body.appendChild(node);
    }
    return node;
  };
  const enter = () => {
    document.documentElement.classList.add('page-transition-ready');
    if (reduce) return;
    requestAnimationFrame(() => {
      document.documentElement.classList.add('page-transition-enter');
      window.setTimeout(() => document.documentElement.classList.remove('page-transition-enter'), 620);
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enter, {once:true});
  else enter();

  document.addEventListener('click', event => {
    const link = event.target.closest('a[href]');
    if (!link || reduce || event.defaultPrevented || event.button !== 0 ||
        event.metaKey || event.ctrlKey || event.shiftKey || event.altKey ||
        link.target && link.target !== '_self' || link.hasAttribute('download')) return;
    let destination;
    try { destination = new URL(link.href, window.location.href); } catch (_) { return; }
    if (destination.origin !== window.location.origin ||
        !/\.html?$/i.test(destination.pathname) ||
        destination.pathname === window.location.pathname && destination.search === window.location.search) return;
    event.preventDefault();
    const overlay = makeOverlay();
    document.documentElement.classList.add('page-transition-leave');
    overlay.classList.add('is-active');
    window.setTimeout(() => { window.location.href = destination.href; }, 360);
  });
})();
