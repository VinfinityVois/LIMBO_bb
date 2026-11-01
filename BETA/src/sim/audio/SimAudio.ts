type Osc = OscillatorType;

/**
 * LIMBO procedural audio engine.
 * All sounds are synthesized locally with Web Audio: no remote assets and no
 * dependency on autoplaying HTMLAudio elements. Ambient audio is resumed on the
 * first real user gesture, which is required by browser autoplay policies.
 */
export const simAudio = {
  ctx: null as AudioContext | null,
  ambientId: 0 as ReturnType<typeof setInterval> | number,
  ambientSource: null as AudioBufferSourceNode | null,
  ambientFilter: null as BiquadFilterNode | null,
  ambientGain: null as GainNode | null,
  roomTone: null as OscillatorNode | null,
  roomToneGain: null as GainNode | null,
  analyser: null as AnalyserNode | null,
  meterFrame: 0,
  pendingAmbient: '',
  ambientMuted: false,
  lastApproachAt: 0,

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 64;
    this.analyser.smoothingTimeConstant = 0.78;
    this.analyser.connect(this.ctx.destination);
  },

  unlock() {
    this.init();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().then(() => {
        if (this.pendingAmbient && !this.ambientMuted) this.startAmbient(false, this.pendingAmbient);
      }).catch(() => undefined);
    } else if (this.pendingAmbient && !this.ambientMuted && !this.ambientSource) {
      this.startAmbient(false, this.pendingAmbient);
    }
  },

  tone(muted: boolean, freq: number, dur: number, type: Osc = 'sine', vol = 0.03, slide?: number) {
    if (muted || !this.ctx) return;
    if (this.ctx.state !== 'running') {
      const context = this.ctx;
      void context.resume().then(() => { if (this.ctx === context) this.tone(muted, freq, dur, type, vol, slide); }).catch(() => undefined);
      return;
    }
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
    g.connect(this.analyser || this.ctx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.04);
  },

  noiseBurst(muted: boolean, dur = 0.12, vol = 0.04, filterType: BiquadFilterType = 'bandpass', frequency = 1200) {
    if (muted || !this.ctx) return;
    if (this.ctx.state !== 'running') {
      const context = this.ctx;
      void context.resume().then(() => { if (this.ctx === context) this.noiseBurst(muted, dur, vol, filterType, frequency); }).catch(() => undefined);
      return;
    }
    const sr = this.ctx.sampleRate;
    const n = Math.max(1, Math.floor(sr * dur));
    const buf = this.ctx.createBuffer(1, n, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) {
      const fade = Math.min(1, i / (sr * 0.012), (n - i) / (sr * 0.045));
      d[i] = (Math.random() * 2 - 1) * Math.max(0, fade);
    }
    const src = this.ctx.createBufferSource();
    const filter = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();
    src.buffer = buf;
    filter.type = filterType;
    filter.frequency.value = frequency;
    filter.Q.value = filterType === 'bandpass' ? 0.8 : 0.3;
    g.gain.value = vol;
    src.connect(filter);
    filter.connect(g);
    g.connect(this.analyser || this.ctx.destination);
    src.start();
  },

  click(m: boolean) { this.tone(m, 480, 0.055, 'triangle', 0.042, 180); },
  hover(m: boolean) { this.tone(m, 920, 0.035, 'sine', 0.014); },
  take(m: boolean) {
    this.noiseBurst(m, 0.08, 0.026, 'highpass', 1700);
    this.tone(m, 340, 0.07, 'triangle', 0.046, 520);
    setTimeout(() => this.tone(m, 600, 0.05, 'sine', 0.03), 70);
  },
  combine(m: boolean) {
    this.tone(m, 220, 0.1, 'sine', 0.05, 440);
    setTimeout(() => this.tone(m, 550, 0.1, 'sine', 0.042), 90);
    setTimeout(() => this.tone(m, 780, 0.08, 'triangle', 0.035), 180);
  },
  deny(m: boolean) { this.tone(m, 110, 0.12, 'sawtooth', 0.042, 55); },
  door(m: boolean) {
    this.noiseBurst(m, 0.16, 0.038, 'lowpass', 420);
    this.tone(m, 90, 0.14, 'square', 0.052);
    setTimeout(() => this.tone(m, 160, 0.1, 'triangle', 0.02), 110);
  },
  steps(m: boolean) {
    this.noiseBurst(m, 0.085, 0.036, 'lowpass', 480);
    this.tone(m, 72, 0.075, 'sine', 0.044, 48);
    setTimeout(() => {
      this.noiseBurst(m, 0.07, 0.018, 'lowpass', 620);
      this.tone(m, 61, 0.06, 'sine', 0.018, 42);
    }, 210);
  },
  creak(m: boolean) { this.tone(m, 145, 0.42, 'sawtooth', 0.02, 42); this.noiseBurst(m, 0.3, 0.014, 'bandpass', 700); },
  whisper(m: boolean) {
    this.noiseBurst(m, 0.72, 0.016, 'bandpass', 1450);
    this.tone(m, 420, 0.58, 'sine', 0.008, 155);
    setTimeout(() => this.noiseBurst(m, 0.38, 0.009, 'bandpass', 2100), 240);
  },
  monster(m: boolean) {
    this.noiseBurst(m, 0.9, 0.05, 'lowpass', 620);
    this.tone(m, 58, 0.95, 'sawtooth', 0.04, 24);
    setTimeout(() => this.tone(m, 92, 0.48, 'triangle', 0.024, 38), 180);
  },
  monsterBlind(m: boolean) {
    this.noiseBurst(m, 0.72, 0.036, 'bandpass', 1450);
    this.tone(m, 118, 0.72, 'sawtooth', 0.032, 34);
    setTimeout(() => this.tone(m, 42, 0.55, 'sine', 0.04, 26), 120);
  },
  monsterListener(m: boolean) {
    this.noiseBurst(m, 0.85, 0.044, 'bandpass', 820);
    this.tone(m, 74, 0.82, 'triangle', 0.036, 18);
    setTimeout(() => this.noiseBurst(m, 0.42, 0.028, 'highpass', 2400), 260);
  },
  monsterDweller(m: boolean) {
    this.noiseBurst(m, 1.1, 0.05, 'lowpass', 380);
    this.tone(m, 38, 1.05, 'sawtooth', 0.05, 16);
    setTimeout(() => this.tone(m, 165, 0.66, 'sawtooth', 0.022, 28), 210);
  },
  monsterApproach(m: boolean, kind: 'light' | 'sound' | 'dweller', intensity: number) {
    const heat = Math.max(0, Math.min(1, intensity));
    const now = Date.now();
    if (now - this.lastApproachAt < 520) return;
    this.lastApproachAt = now;
    const low = kind === 'dweller' ? 34 : kind === 'light' ? 46 : 58;
    this.noiseBurst(m, 0.22 + heat * 0.22, 0.012 + heat * 0.022, 'lowpass', 180 + heat * 360);
    this.tone(m, low + heat * 18, 0.34 + heat * 0.22, 'sine', 0.012 + heat * 0.03, Math.max(18, low - 18));
    if (kind === 'sound') {
      setTimeout(() => this.noiseBurst(m, 0.2, 0.008 + heat * 0.014, 'bandpass', 900 + heat * 800), 120);
    } else if (kind === 'light') {
      setTimeout(() => this.tone(m, 130 + heat * 80, 0.18, 'sawtooth', 0.008 + heat * 0.012, 42), 110);
    } else {
      setTimeout(() => this.tone(m, 28 + heat * 12, 0.42, 'triangle', 0.018 + heat * 0.018, 16), 140);
    }
  },
  call(m: boolean) {
    this.noiseBurst(m, 0.38, 0.028, 'bandpass', 780);
    this.tone(m, 185, 0.34, 'triangle', 0.018, 125);
    setTimeout(() => this.tone(m, 235, 0.24, 'sine', 0.012, 165), 170);
  },
  innerVoice(m: boolean, intensity = 1) {
    // Abstract breath/formant-like response: deliberately not intelligible speech.
    this.noiseBurst(m, 0.48, 0.009 * intensity, 'bandpass', 1150);
    this.tone(m, 280, 0.42, 'sine', 0.007 * intensity, 205);
    setTimeout(() => this.tone(m, 365, 0.3, 'triangle', 0.006 * intensity, 150), 150);
  },
  attack(m: boolean) {
    this.noiseBurst(m, 0.16, 0.045, 'highpass', 1500);
    this.tone(m, 150, 0.22, 'sawtooth', 0.035, 42);
  },
  impact(m: boolean) {
    this.noiseBurst(m, 0.11, 0.06, 'lowpass', 800);
    this.tone(m, 68, 0.18, 'square', 0.05, 28);
  },
  evade(m: boolean) {
    this.noiseBurst(m, 0.2, 0.025, 'highpass', 1800);
    this.tone(m, 260, 0.16, 'triangle', 0.025, 720);
  },
  maskWhisper(m: boolean, intensity = 1) {
    this.noiseBurst(m, 0.72, 0.016 * intensity, 'bandpass', 1250);
    this.tone(m, 510, 0.52, 'sine', 0.009 * intensity, 115);
    setTimeout(() => this.tone(m, 190, 0.36, 'triangle', 0.008 * intensity, 80), 180);
    setTimeout(() => this.noiseBurst(m, 0.48, 0.011 * intensity, 'bandpass', 2200), 280);
  },
  heartbeat(m: boolean) {
    this.tone(m, 54, 0.12, 'sine', 0.025, 42);
    setTimeout(() => this.tone(m, 48, 0.16, 'sine', 0.018, 38), 170);
  },
  complete(m: boolean) {
    this.tone(m, 392, 0.1, 'sine', 0.035);
    setTimeout(() => this.tone(m, 523, 0.12, 'sine', 0.03), 100);
    setTimeout(() => this.tone(m, 659, 0.16, 'triangle', 0.028), 210);
  },
  ok(m: boolean) { this.tone(m, 520, 0.06, 'sine', 0.02, 700); },
  whoosh(m: boolean) {
    this.noiseBurst(m, 0.36, 0.028, 'lowpass', 1100);
    this.tone(m, 200, 0.25, 'sawtooth', 0.02, 40);
  },
  dive(m: boolean) {
    this.noiseBurst(m, 0.45, 0.045, 'lowpass', 900);
    this.tone(m, 80, 0.4, 'sine', 0.04, 400);
    setTimeout(() => this.tone(m, 400, 0.2, 'sine', 0.025, 800), 200);
    setTimeout(() => this.tone(m, 600, 0.15, 'triangle', 0.02), 400);
  },
  open(m: boolean) { this.tone(m, 180, 0.08, 'triangle', 0.025, 360); },

  startAmbient(m: boolean, kind: string) {
    this.pendingAmbient = kind;
    this.ambientMuted = m;
    this.stopAmbient();
    if (m) return;
    this.init();
    if (!this.ctx) return;
    if (this.ctx.state !== 'running') {
      this.unlock();
      return; // unlock() will restart the pending ambience after the user gesture.
    }

    const sr = this.ctx.sampleRate;
    const length = sr * 3;
    const buffer = this.ctx.createBuffer(1, length, sr);
    const data = buffer.getChannelData(0);
    // Soft pink-ish rain noise: smoothed random samples avoid harsh white-noise hiss.
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      last = last * 0.94 + white * 0.06;
      data[i] = last * 1.35;
    }
    const source = this.ctx.createBufferSource();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    source.buffer = buffer;
    source.loop = true;
    filter.type = kind.toLowerCase().includes('rain') ? 'bandpass' : 'lowpass';
    filter.frequency.value = kind.toLowerCase().includes('rain') ? 2450 : 720;
    filter.Q.value = kind.toLowerCase().includes('rain') ? 0.32 : 0.45;
    gain.gain.value = kind.toLowerCase().includes('rain') ? 0.0048 : 0.0065;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.analyser || this.ctx.destination);
    source.start();
    document.body.classList.add('audio-ready');
    this.ambientSource = source;
    this.ambientFilter = filter;
    this.ambientGain = gain;

    const room = this.ctx.createOscillator();
    const roomGain = this.ctx.createGain();
    room.type = 'sine';
    room.frequency.value = kind.toLowerCase().includes('wood') ? 57 : 43;
    roomGain.gain.value = 0.00012;
    room.connect(roomGain);
    roomGain.connect(this.analyser || this.ctx.destination);
    room.start();
    this.roomTone = room;
    this.roomToneGain = roomGain;

    // Sparse droplets / wooden ticks give the ambience a sense of space.
    const rain = kind.toLowerCase().includes('rain');
    const drip = () => {
      if (m || !this.ctx || this.ctx.state !== 'running') return;
      if (rain && Math.random() < 0.78) {
        this.noiseBurst(false, 0.055 + Math.random() * 0.045, 0.012 + Math.random() * 0.009, 'bandpass', 1650 + Math.random() * 2100);
        this.tone(false, 1150 + Math.random() * 900, 0.035 + Math.random() * 0.035, 'sine', 0.012);
      } else if (!rain && Math.random() < 0.38) {
        this.noiseBurst(false, 0.11, 0.006, 'bandpass', 500 + Math.random() * 1100);
      }
    };
    drip();
    this.ambientId = window.setInterval(drip, rain ? 980 : 1650);
  },

  startMeter() {
    if (this.meterFrame) cancelAnimationFrame(this.meterFrame);
    const bars = Array.from(document.querySelectorAll<HTMLElement>('.sound-meter i'));
    if (!bars.length || !this.analyser) return;
    const bins = new Uint8Array(this.analyser.frequencyBinCount);
    const draw = () => {
      if (!this.analyser || !this.ctx || this.ctx.state !== 'running') {
        this.meterFrame = 0;
        return;
      }
      this.analyser.getByteFrequencyData(bins);
      bars.forEach((bar, index) => {
        const value = bins[Math.min(bins.length - 1, Math.floor(index * bins.length / bars.length))] / 255;
        const floor = 8;
        const height = floor + value * 88;
        bar.style.height = height + '%';
        bar.style.opacity = String(0.28 + value * 0.72);
        bar.style.backgroundColor = value > 0.72 ? '#ef596b' : value > 0.38 ? '#e4b65b' : '#52c7dc';
      });
      this.meterFrame = requestAnimationFrame(draw);
    };
    this.meterFrame = requestAnimationFrame(draw);
  },

  stopAmbient() {
    if (this.ambientId) clearInterval(this.ambientId as number);
    this.ambientId = 0;
    if (this.meterFrame) cancelAnimationFrame(this.meterFrame);
    this.meterFrame = 0;
    try { this.ambientSource?.stop(); } catch { /* already stopped */ }
    try { this.roomTone?.stop(); } catch { /* already stopped */ }
    this.ambientSource = null;
    this.ambientFilter = null;
    this.ambientGain = null;
    this.roomTone = null;
    this.roomToneGain = null;
    document.querySelectorAll<HTMLElement>('.sound-meter i').forEach((bar, i) => {
      bar.style.height = (i % 3 === 0 ? 18 : 10) + '%';
      bar.style.opacity = '0.38';
    });
  },
};
