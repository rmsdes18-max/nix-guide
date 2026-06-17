// NIX guide — active nav highlight + back-to-top.
(function () {
  const links = Array.from(document.querySelectorAll('.nav__link'));
  const byId = new Map(
    links.map((l) => [l.getAttribute('href').slice(1), l])
  );
  const sections = links
    .map((l) => document.getElementById(l.getAttribute('href').slice(1)))
    .filter(Boolean);

  // Highlight the section currently in view.
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          links.forEach((l) => l.classList.remove('is-active'));
          const active = byId.get(e.target.id);
          if (active) {
            active.classList.add('is-active');
            // keep the active link visible in the nav — scroll the nav bar
            // HORIZONTALLY only, never the page (that caused scroll-jacking).
            const bar = active.parentElement;
            const l = active.offsetLeft;
            const r = l + active.offsetWidth;
            if (r > bar.scrollLeft + bar.clientWidth) {
              bar.scrollLeft = r - bar.clientWidth + 16;
            } else if (l < bar.scrollLeft) {
              bar.scrollLeft = l - 16;
            }
          }
        }
      });
    },
    { rootMargin: '-55px 0px -70% 0px', threshold: 0 }
  );
  sections.forEach((s) => observer.observe(s));

  // Back-to-top.
  const toTop = document.getElementById('totop');
  const onScroll = () => {
    if (window.scrollY > 600) toTop.classList.add('is-visible');
    else toTop.classList.remove('is-visible');
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  toTop.addEventListener('click', () =>
    window.scrollTo({ top: 0, behavior: 'smooth' })
  );
  onScroll();
})();
