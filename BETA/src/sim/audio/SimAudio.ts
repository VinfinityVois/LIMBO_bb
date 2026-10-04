/** Lightweight procedural ambient for sim (no external files required) */

type Osc = OscillatorType;

export const simAudio = {
  ctx: null as AudioContext | null,
  muted: localStorage.getItem('limbo_sim_mute') === '1',
  nodes: [] as AudioNode[],
  ambientTimer: 0 as number | ReturnType<typeof setInterval>,

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
  },

  unlock() {
    this.init();
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
  },

  setMuted(v: boolean) {
    this.muted = v;
    localStorage.setItem('limbo_sim_mute', v ? '1' : '0');
    if (v) this.stopAmbient();
  },

  tone(freq: number, dur: number, type: Osc = 'sine', vol = 0.03, slide?: number) {
    if (this.muted || !this.ctx) return;
    const t0 = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(freq, 1), t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(slide, 1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(this.ctx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  },

  click() {
    this.tone(520, 0.04, 'square', 0.025, 200);
  },
  take() {
    this.tone(340, 0.08, 'triangle', 0.04, 520);
  },
  combine() {
    this.tone(220, 0.1, 'sine', 0.035, 440);
    setTimeout(() => this.tone(550, 0.12, 'sine', 0.03), 100);
  },
  deny() {
    this.tone(120, 0.12, 'sawtooth', 0.03, 60);
  },
  door() {
    this.tone(90, 0.15, 'square', 0.04);
    setTimeout(() => this.tone(180, 0.1, 'triangle', 0.025), 120);
  },
  steps() {
    this.tone(80, 0.06, 'sine', 0.02);
    setTimeout(() => this.tone(70, 0.05, 'sine', 0.015), 180);
  },
  complete() {
    this.tone(392, 0.1, 'sine', 0.04);
    setTimeout(() => this.tone(523, 0.12, 'sine', 0.035), 100);
    setTimeout(() => this.tone(659, 0.18, 'sine', 0.03), 220);
  },

  /** soft noise loop approximation via periodic tones */
  startAmbient(kind: string) {
    this.stopAmbient();
    if (this.muted) return;
    this.unlock();
    const pulse = () => {
      if (this.muted || !this.ctx) return;
      if (kind.includes('rain')) {
        this.tone(180 + Math.random() * 40, 0.15, 'sawtooth', 0.008);
        this.tone(400 + Math.random() * 200, 0.05, 'sine', 0.006);
      } else if (kind.includes('wood')) {
        if (Math.random() > 0.7) this.tone(90 + Math.random() * 30, 0.08, 'triangle', 0.012);
      } else {
        this.tone(60 + Math.random() * 20, 0.2, 'sine', 0.006);
      }
    };
    pulse();
    this.ambientTimer = setInterval(pulse, kind.includes('rain') ? 280 : 900);
  },

  stopAmbient() {
    if (this.ambientTimer) clearInterval(this.ambientTimer as number);
    this.ambientTimer = 0;
  },
};
