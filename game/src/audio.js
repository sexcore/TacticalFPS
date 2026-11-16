// All sounds are synthesized with WebAudio — zero audio files, zero fetches.
// Lazy init on the first user gesture. Positional sounds attenuate by distance.
export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.listener = null;
    this.noiseBuf = null;
    this.lastPlay = {};
  }

  init(listener) {
    this.listener = listener;
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    const len = Math.floor(this.ctx.sampleRate * 0.5);
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  get ready() { return !!this.ctx; }

  tone(freq, dur, o) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + (o.delay || 0);
    const osc = this.ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slide), t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(o.vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  nz(dur, o) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + (o.delay || 0);
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = o.ftype || 'lowpass';
    f.frequency.value = o.freq || 1200;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(o.vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  playRaw(name, vol) {
    if (!this.ctx || vol <= 0.02) return;
    const now = this.ctx.currentTime;
    if (this.lastPlay[name] && now - this.lastPlay[name] < 0.03) return;
    this.lastPlay[name] = now;
    switch (name) {
      case 'shot_p9': this.nz(0.09, { vol: 0.5 * vol, freq: 2600, ftype: 'highpass' }); this.tone(180, 0.07, { type: 'square', vol: 0.3 * vol, slide: 60 }); break;
      case 'shot_k7': this.nz(0.07, { vol: 0.45 * vol, freq: 3000, ftype: 'highpass' }); this.tone(220, 0.06, { type: 'square', vol: 0.25 * vol, slide: 70 }); break;
      case 'shot_ar4': this.nz(0.11, { vol: 0.55 * vol, freq: 2400, ftype: 'highpass' }); this.tone(150, 0.09, { type: 'square', vol: 0.32 * vol, slide: 50 }); break;
      case 'shot_lr88': this.nz(0.22, { vol: 0.7 * vol, freq: 2500 }); this.tone(120, 0.18, { vol: 0.4 * vol, slide: 40 }); break;
      case 'dry': this.tone(1200, 0.03, { type: 'square', vol: 0.15 * vol }); break;
      case 'reload': this.tone(600, 0.05, { type: 'square', vol: 0.2 * vol }); this.tone(400, 0.05, { type: 'square', vol: 0.2 * vol, delay: 0.12 }); break;
      case 'switch': this.tone(500, 0.04, { type: 'square', vol: 0.18 * vol }); break;
      case 'throw': this.nz(0.12, { vol: 0.2 * vol, freq: 900 }); break;
      case 'bounce': this.tone(300, 0.05, { vol: 0.25 * vol, slide: 180 }); break;
      case 'explode': this.nz(0.7, { vol: 1 * vol, freq: 400 }); this.tone(70, 0.5, { vol: 0.8 * vol, slide: 30 }); break;
      case 'hitmark': this.tone(1400, 0.04, { vol: 0.3 * vol }); break;
      case 'headshot': this.tone(1800, 0.06, { vol: 0.35 * vol }); this.tone(2400, 0.05, { vol: 0.25 * vol, delay: 0.04 }); break;
      case 'hurt': this.tone(200, 0.12, { type: 'sawtooth', vol: 0.3 * vol, slide: 90 }); break;
      case 'death': this.tone(300, 0.25, { type: 'sawtooth', vol: 0.25 * vol, slide: 80 }); break;
      case 'beep': this.tone(1100, 0.07, { type: 'square', vol: 0.3 * vol }); break;
      case 'planted': this.tone(880, 0.12, { vol: 0.3 * vol }); this.tone(660, 0.12, { vol: 0.3 * vol, delay: 0.14 }); break;
      case 'pickup': this.tone(700, 0.06, { vol: 0.25 * vol }); this.tone(1000, 0.06, { vol: 0.25 * vol, delay: 0.07 }); break;
      case 'buy': this.tone(900, 0.05, { vol: 0.25 * vol }); this.tone(1300, 0.05, { vol: 0.25 * vol, delay: 0.06 }); break;
      case 'round': this.tone(520, 0.1, { vol: 0.3 * vol }); this.tone(780, 0.1, { vol: 0.3 * vol, delay: 0.12 }); break;
      case 'go': this.tone(780, 0.08, { vol: 0.3 * vol }); this.tone(1040, 0.12, { vol: 0.3 * vol, delay: 0.09 }); break;
      case 'win': this.tone(523, 0.1, { vol: 0.3 * vol }); this.tone(659, 0.1, { vol: 0.3 * vol, delay: 0.11 }); this.tone(784, 0.16, { vol: 0.3 * vol, delay: 0.22 }); break;
      case 'lose': this.tone(392, 0.12, { vol: 0.3 * vol }); this.tone(330, 0.12, { vol: 0.3 * vol, delay: 0.13 }); this.tone(262, 0.2, { vol: 0.3 * vol, delay: 0.26 }); break;
      case 'step': this.nz(0.05, { vol: 0.12 * vol, freq: 500 }); break;
      default: break;
    }
  }

  /** UI / own sounds. A bot agent source plays positionally instead. */
  play(name, src) {
    if (src && !src.isPlayer) { this.playAt(name, src.pos, 0.6); return; }
    this.playRaw(name, 1);
  }

  /** Positional: attenuate by distance from the listener (the player). */
  playAt(name, pos, vol) {
    if (!this.listener) { this.playRaw(name, vol); return; }
    const dx = pos.x - this.listener.x, dy = pos.y - this.listener.y, dz = pos.z - this.listener.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    this.playRaw(name, vol / (1 + d * 0.09));
  }
}
