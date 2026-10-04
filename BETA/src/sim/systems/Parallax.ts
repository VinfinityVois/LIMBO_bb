/** Mouse-follow parallax for location layers */

export class ParallaxController {
    private root: HTMLElement;
    private layers: { el: HTMLElement; depth: number }[] = [];
    private nx = 0;
    private ny = 0;
    private tx = 0;
    private ty = 0;
    private raf = 0;
    private onMove: (e: MouseEvent) => void;
  
    constructor(root: HTMLElement) {
      this.root = root;
      this.onMove = (e: MouseEvent) => {
        const r = this.root.getBoundingClientRect();
        this.tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
        this.ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
      };
      window.addEventListener('mousemove', this.onMove);
      const loop = () => {
        this.nx += (this.tx - this.nx) * 0.06;
        this.ny += (this.ty - this.ny) * 0.06;
        const t = performance.now() * 0.00035;
        const breathX = Math.sin(t) * 0.15;
        const breathY = Math.cos(t * 0.8) * 0.1;
        for (const L of this.layers) {
          const x = (this.nx + breathX) * L.depth * 28;
          const y = (this.ny + breathY) * L.depth * 18;
          L.el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        }
        this.raf = requestAnimationFrame(loop);
      };
      this.raf = requestAnimationFrame(loop);
    }
  
    setLayers(nodes: { el: HTMLElement; depth: number }[]) {
      this.layers = nodes;
    }
  
    destroy() {
      cancelAnimationFrame(this.raf);
      window.removeEventListener('mousemove', this.onMove);
    }
  }
  