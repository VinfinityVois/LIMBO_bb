// reveal.ts
export function bindReveals(selector = '.reveal'): void {
    const nodes = document.querySelectorAll(selector);
    if (!nodes.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add('in');
            io.unobserve(en.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    nodes.forEach((el) => io.observe(el));
  }