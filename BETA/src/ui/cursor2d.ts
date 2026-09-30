// cursor2d.ts
export function bindCursor2d(): void {
    const cur = document.getElementById('cursor');
    const dot = document.getElementById('cursorDot');
    if (!cur && !dot) return;
    window.addEventListener(
      'pointermove',
      (e) => {
        if (cur) cur.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
        if (dot) dot.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      },
      { passive: true }
    );
  }