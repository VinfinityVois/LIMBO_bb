/**
 * Single stock plate + mouse parallax (scale > 1, shift layers)
 * Optional near fog layer for depth feel — not multi-cutout art.
 */

export class ParallaxRenderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  img: HTMLImageElement | null = null;
  fog = 0.15;
  w = 0;
  h = 0;
  mx = 0;
  my = 0;
  tx = 0;
  ty = 0;
  running = false;
  filter = '';
  private raf = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  setMouse(nx: number, ny: number) {
    this.tx = Math.max(-1, Math.min(1, nx));
    this.ty = Math.max(-1, Math.min(1, ny));
  }

  resize(w: number, h: number) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = w;
    this.h = h;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  async loadImage(src: string, filter = ''): Promise<boolean> {
    this.filter = filter;
    return new Promise((resolve) => {
      const im = new Image();
      im.onload = () => {
        this.img = im;
        resolve(true);
      };
      im.onerror = () => {
        this.img = null;
        resolve(false);
      };
      im.src = src;
    });
  }

  start() {
    if (this.running) return;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      this.mx += (this.tx - this.mx) * 0.045;
      this.my += (this.ty - this.my) * 0.045;
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private draw() {
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#05070e';
    ctx.fillRect(0, 0, w, h);

    if (!this.img) {
      ctx.fillStyle = 'rgba(0,212,232,0.15)';
      ctx.font = '14px monospace';
      ctx.fillText('НЕТ КАДРА · /sim/img/ryokan/', 24, h / 2);
      return;
    }

    // Scale plate larger than viewport so parallax has room
    const scale = 1.08;
    const iw = this.img.naturalWidth;
    const ih = this.img.naturalHeight;
    const cover = Math.max(w / iw, h / ih) * scale;
    const dw = iw * cover;
    const dh = ih * cover;
    const maxShiftX = (dw - w) / 2;
    const maxShiftY = (dh - h) / 2;
    const ox = (w - dw) / 2 - this.mx * maxShiftX * 0.65;
    const oy = (h - dh) / 2 - this.my * maxShiftY * 0.65;

    ctx.save();
    if (this.filter) ctx.filter = this.filter;
    ctx.drawImage(this.img, ox, oy, dw, dh);
    ctx.restore();

    // subtle near fog / grain for depth (not a second art layer)
    const t = performance.now() * 0.0004;
    const g = ctx.createRadialGradient(
      w * 0.5 + this.mx * 20,
      h * 0.45 + this.my * 12,
      h * 0.1,
      w * 0.5,
      h * 0.5,
      h * 0.85
    );
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(2,4,10,${0.35 + Math.sin(t) * 0.05})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // soft rain streaks when ambient-like
    ctx.strokeStyle = 'rgba(180,210,230,0.04)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 18; i++) {
      const x = ((i * 97 + t * 40) % (w + 40)) - 20;
      const y = ((i * 53 + t * 120) % (h + 40)) - 20;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 4, y + 18);
      ctx.stroke();
    }
  }
}
