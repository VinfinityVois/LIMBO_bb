type Osc = OscillatorType;

/** Procedural SFX — no external files required */
export const simAudio = {
  ctx: null as AudioContext | null,
  ambientId: 0 as ReturnType<typeof setInterval> | number,

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
  tone(muted: boolean, freq: number, dur: number, type: Osc = 'sine', vol = 0.03, slide?: number) {
    if (muted || !this.ctx) return;
    const t0 = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(freq, 1), t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(slide, 1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(this.ctx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.04);
  },
  noiseBurst(muted: boolean, dur = 0.12, vol = 0.04) {
    if (muted || !this.ctx) return;
    const sr = this.ctx.sampleRate;
    const n = Math.floor(sr * dur);
    const buf = this.ctx.createBuffer(1, n, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource();
    const g = this.ctx.createGain();
    src.buffer = buf;
    g.gain.value = vol;
    src.connect(g);
    g.connect(this.ctx.destination);
    src.start();
  },
  click(m: boolean) { this.tone(m, 480, 0.04, 'square', 0.022, 180); },
  hover(m: boolean) { this.tone(m, 920, 0.025, 'sine', 0.01); },
  take(m: boolean) {
    this.tone(m, 340, 0.07, 'triangle', 0.032, 520);
    setTimeout(() => this.tone(m, 600, 0.05, 'sine', 0.018), 70);
  },
  combine(m: boolean) {
    this.tone(m, 220, 0.1, 'sine', 0.03, 440);
    setTimeout(() => this.tone(m, 550, 0.1, 'sine', 0.025), 90);
    setTimeout(() => this.tone(m, 780, 0.08, 'triangle', 0.02), 180);
  },
  deny(m: boolean) { this.tone(m, 110, 0.12, 'sawtooth', 0.028, 55); },
  door(m: boolean) {
    this.tone(m, 90, 0.14, 'square', 0.035);
    setTimeout(() => this.tone(m, 160, 0.1, 'triangle', 0.02), 110);
  },
  steps(m: boolean) {
    this.tone(m, 75, 0.06, 'sine', 0.016);
    setTimeout(() => this.tone(m, 65, 0.05, 'sine', 0.012), 160);
  },
  creak(m: boolean) { this.tone(m,145,.32,'sawtooth',.018,48); this.noiseBurst(m,.22,.012); },
  whisper(m: boolean) { this.noiseBurst(m,.42,.018); this.tone(m,430,.35,'sine',.009,170); },
  monster(m: boolean) { this.noiseBurst(m,.75,.055); this.tone(m,58,.9,'sawtooth',.045,24); setTimeout(() => this.tone(m,92,.45,'triangle',.026,38),180); },
  attack(m: boolean) {
    this.noiseBurst(m, .16, .045);
    this.tone(m, 150, .22, 'sawtooth', .035, 42);
  },
  impact(m: boolean) {
    this.noiseBurst(m, .11, .06);
    this.tone(m, 68, .18, 'square', .05, 28);
  },
  evade(m: boolean) {
    this.noiseBurst(m, .2, .025);
    this.tone(m, 260, .16, 'triangle', .025, 720);
  },
  maskWhisper(m: boolean, intensity = 1) {
    this.noiseBurst(m, .5, .012 * intensity);
    this.tone(m, 510, .42, 'sine', .009 * intensity, 115);
    setTimeout(() => this.tone(m, 190, .3, 'triangle', .008 * intensity, 80), 180);
  },
  heartbeat(m: boolean) {
    this.tone(m, 54, .12, 'sine', .025, 42);
    setTimeout(() => this.tone(m, 48, .16, 'sine', .018, 38), 170);
  },
  complete(m: boolean) {
    this.tone(m, 392, 0.1, 'sine', 0.035);
    setTimeout(() => this.tone(m, 523, 0.12, 'sine', 0.03), 100);
    setTimeout(() => this.tone(m, 659, 0.16, 'sine', 0.028), 210);
  },
  ok(m: boolean) { this.tone(m, 520, 0.06, 'sine', 0.02, 700); },
  whoosh(m: boolean) {
    this.tone(m, 200, 0.25, 'sawtooth', 0.02, 40);
    this.noiseBurst(m, 0.2, 0.03);
  },
  dive(m: boolean) {
    this.noiseBurst(m, 0.35, 0.05);
    this.tone(m, 80, 0.4, 'sine', 0.04, 400);
    setTimeout(() => this.tone(m, 400, 0.2, 'sine', 0.025, 800), 200);
    setTimeout(() => this.tone(m, 600, 0.15, 'triangle', 0.02), 400);
  },
  open(m: boolean) {
    this.tone(m, 180, 0.08, 'triangle', 0.025, 360);
  },
  startAmbient(m: boolean, kind: string) {
    this.stopAmbient();
    if (m) return;
    this.unlock();
    const pulse = () => {
      if (m || !this.ctx) return;
      if (kind.includes('rain')) {
        this.tone(false, 160 + Math.random() * 50, 0.12, 'sawtooth', 0.006);
        this.tone(false, 380 + Math.random() * 180, 0.04, 'sine', 0.005);
      } else if (kind.includes('wood')) {
        if (Math.random() > 0.65) this.tone(false, 85 + Math.random() * 25, 0.07, 'triangle', 0.01);
      } else {
        this.tone(false, 55 + Math.random() * 20, 0.18, 'sine', 0.005);
      }
    };
    pulse();
    this.ambientId = setInterval(pulse, kind.includes('rain') ? 320 : 1000);
  },
  stopAmbient() {
    if (this.ambientId) clearInterval(this.ambientId as number);
    this.ambientId = 0;
  },
};
