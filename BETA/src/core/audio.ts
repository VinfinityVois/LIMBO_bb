const MUTE_KEY = 'poly_sfx_mute';
type Osc = OscillatorType;

export const sfx = {
  ctx: null as AudioContext | null,
  muted: localStorage.getItem(MUTE_KEY) === '1',
  _unlocked: false,

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
  },
  unlock() {
    this.init();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    if (!this._unlocked) {
      this._unlocked = true;
      if (!this.muted) this.boot();
    }
  },
  setMuted(v: boolean) {
    this.muted = v;
    localStorage.setItem(MUTE_KEY, v ? '1' : '0');
  },
  toggleMute() {
    this.setMuted(!this.muted);
    if (!this.muted) { this.init(); this.click(); }
    return this.muted;
  },
  isMuted() { return this.muted; },

  tone(freq: number, dur: number, type: Osc = 'square', vol = 0.04, slide?: number) {
    if (this.muted || !this.ctx) return;
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    const t0 = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(freq, 1), t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(slide, 1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(t0); o.stop(t0 + dur + 0.03);
  },
  hover() { this.tone(880, 0.045, 'sine', 0.022); },
  click() {
    this.tone(420, 0.055, 'square', 0.038, 180);
    setTimeout(() => this.tone(620, 0.035, 'sine', 0.018), 40);
  },
  tick() { this.tone(1200, 0.028, 'triangle', 0.016); },
  fill() { this.tone(220, 0.11, 'sawtooth', 0.018, 440); },
  lock() {
    this.tone(180, 0.09, 'square', 0.032);
    setTimeout(() => this.tone(110, 0.11, 'square', 0.028), 70);
  },
  boot() {
    this.tone(200, 0.07, 'sine', 0.028, 400);
    setTimeout(() => this.tone(400, 0.09, 'sine', 0.022, 800), 90);
  },
  success() {
    this.tone(523, 0.08, 'sine', 0.03);
    setTimeout(() => this.tone(659, 0.08, 'sine', 0.028), 90);
    setTimeout(() => this.tone(784, 0.12, 'sine', 0.025), 180);
  },
  glitch() {
    this.tone(90, 0.04, 'sawtooth', 0.03, 40);
    setTimeout(() => this.tone(200, 0.03, 'square', 0.02, 800), 30);
  },
};

export function bindAudioUnlock() {
  const once = () => sfx.unlock();
  window.addEventListener('pointerdown', once, { once: true });
  window.addEventListener('keydown', once, { once: true });
}

export function bindSfxUi(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('[data-sfx]').forEach((el) => {
    const kind = el.getAttribute('data-sfx');
    if (kind === 'hover' || kind === 'tick') {
      el.addEventListener('mouseenter', () => {
        sfx.init();
        kind === 'hover' ? sfx.hover() : sfx.tick();
      });
    }
    if (kind === 'click') {
      el.addEventListener('click', () => { sfx.init(); sfx.click(); });
    }
  });
}

export function bindMuteToggle(sel = '#sfxToggle, [data-sfx-toggle]') {
  document.querySelectorAll<HTMLElement>(sel).forEach((btn) => {
    const sync = () => {
      btn.textContent = sfx.isMuted() ? 'SFX · OFF' : 'SFX · ON';
      btn.classList.toggle('off', sfx.isMuted());
    };
    sync();
    btn.addEventListener('click', () => { sfx.init(); sfx.toggleMute(); sync(); });
  });
}