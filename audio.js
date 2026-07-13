// ============================================================================
// audio.js — Stack Escape
// Every sound is synthesized live with the WebAudio API — no external audio
// files are required to play the game. The API surface (playJump, playCoin,
// startMusic, ...) is stable, so real recorded assets could be swapped in
// later by changing only the internals of this file.
// ============================================================================

const SoundManager = {
  ctx: null,
  masterGain: null,
  sfxGain: null,
  musicGain: null,
  noiseBuffer: null,
  musicPlaying: false,
  musicStep: 0,
  musicTimerId: null,
  enabled: { sfx: true, music: true },
  _ready: false,

  init() {
    if (this._ready) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return; // gracefully degrade on unsupported browsers
    this.ctx = new AC();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 1;
    this.masterGain.connect(this.ctx.destination);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.85;
    this.sfxGain.connect(this.masterGain);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.0;
    this.musicGain.connect(this.masterGain);

    this.noiseBuffer = this._buildNoiseBuffer();

    const s = Storage.get().settings;
    this.enabled.sfx = s.sfx;
    this.enabled.music = s.music;
    this._ready = true;
  },

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },

  setSfxEnabled(v) { this.enabled.sfx = v; },
  setMusicEnabled(v) {
    this.enabled.music = v;
    if (!this._ready) return;
    if (v) this.startMusic(); else this.stopMusic();
  },

  _buildNoiseBuffer() {
    const len = this.ctx.sampleRate * 0.6;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  },

  // Generic short tone with a pitch sweep and simple attack/release envelope.
  _tone({ freq = 440, sweepTo = null, type = 'sine', duration = 0.15, gain = 0.3, attack = 0.005, delay = 0 } = {}) {
    if (!this._ready || !this.enabled.sfx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (sweepTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, sweepTo), t0 + duration);
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(Math.max(gain, 0.0002), t0 + attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(amp).connect(this.sfxGain);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  },

  _noiseBurst({ duration = 0.2, filterFreq = 1200, gain = 0.4, delay = 0 } = {}) {
    if (!this._ready || !this.enabled.sfx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterFreq, t0);
    filter.frequency.exponentialRampToValueAtTime(Math.max(80, filterFreq * 0.2), t0 + duration);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, t0);
    amp.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    src.connect(filter).connect(amp).connect(this.sfxGain);
    src.start(t0);
    src.stop(t0 + duration + 0.02);
  },

  _arp(freqs, { type = 'triangle', step = 0.055, duration = 0.12, gain = 0.28 } = {}) {
    freqs.forEach((f, i) => this._tone({ freq: f, type, duration, gain, delay: i * step }));
  },

  // --- Public sound effects -------------------------------------------
  playJump() { this._tone({ freq: 340, sweepTo: 680, type: 'sine', duration: 0.14, gain: 0.32 }); },
  playSuperJump() { this._tone({ freq: 300, sweepTo: 900, type: 'sawtooth', duration: 0.22, gain: 0.3 }); },
  playLand() {
    this._tone({ freq: 160, sweepTo: 70, type: 'sine', duration: 0.1, gain: 0.28 });
    this._noiseBurst({ duration: 0.06, filterFreq: 500, gain: 0.15 });
  },
  playSpring() { this._tone({ freq: 260, sweepTo: 1100, type: 'square', duration: 0.2, gain: 0.25 }); },
  playCoin() { this._arp([880, 1318.5], { type: 'triangle', duration: 0.1, gain: 0.25 }); },
  playGem() { this._arp([740, 988, 1480], { type: 'triangle', duration: 0.12, gain: 0.28 }); },
  playStar() { this._arp([660, 880, 1100, 1480], { type: 'sine', duration: 0.1, gain: 0.26 }); },
  playCombo() { this._tone({ freq: 500, sweepTo: 760, type: 'square', duration: 0.09, gain: 0.18 }); },

  playPowerup(kind) {
    const bases = {
      shield: 420, doubleCoins: 520, magnet: 300, slowMotion: 220, superJump: 600, speedBoost: 700
    };
    const b = bases[kind] || 440;
    this._arp([b, b * 1.25, b * 1.5, b * 2], { type: 'triangle', step: 0.06, duration: 0.14, gain: 0.24 });
  },

  playShieldHit() {
    this._tone({ freq: 500, sweepTo: 200, type: 'square', duration: 0.18, gain: 0.3 });
    this._noiseBurst({ duration: 0.15, filterFreq: 2000, gain: 0.2 });
  },

  playCrack() { this._noiseBurst({ duration: 0.08, filterFreq: 2500, gain: 0.18 }); },
  playBreak() { this._noiseBurst({ duration: 0.2, filterFreq: 1800, gain: 0.3 }); },

  playExplosion() {
    this._noiseBurst({ duration: 0.35, filterFreq: 2200, gain: 0.4 });
    this._tone({ freq: 160, sweepTo: 40, type: 'sawtooth', duration: 0.3, gain: 0.3 });
  },

  playGameOver() {
    this._arp([440, 370, 294, 220], { type: 'sawtooth', step: 0.14, duration: 0.32, gain: 0.28 });
  },

  playClick() { this._tone({ freq: 1000, type: 'square', duration: 0.045, gain: 0.18 }); },
  playError() { this._tone({ freq: 220, sweepTo: 150, type: 'square', duration: 0.12, gain: 0.2 }); },
  playUnlock() { this._arp([523, 659, 784, 1046], { type: 'triangle', step: 0.07, duration: 0.16, gain: 0.28 }); },

  // --- Ambient background music -------------------------------------
  // A slow evolving pad (two detuned oscillators through a swept filter)
  // plus a soft plucked arpeggio stepped on a simple lookahead scheduler.
  startMusic() {
    if (!this._ready || !this.enabled.music || this.musicPlaying) return;
    const ctx = this.ctx;
    this.musicPlaying = true;
    this.musicGain.gain.cancelScheduledValues(ctx.currentTime);
    this.musicGain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 1.2);

    const padOsc1 = ctx.createOscillator();
    const padOsc2 = ctx.createOscillator();
    padOsc1.type = 'sine'; padOsc2.type = 'sine';
    padOsc1.frequency.value = 110; padOsc2.frequency.value = 110 * 1.5;
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = 800;
    const padGain = ctx.createGain();
    padGain.gain.value = 0.5;
    padOsc1.connect(padFilter); padOsc2.connect(padFilter);
    padFilter.connect(padGain).connect(this.musicGain);

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 350;
    lfo.connect(lfoGain).connect(padFilter.frequency);

    padOsc1.start(); padOsc2.start(); lfo.start();
    this._musicNodes = { padOsc1, padOsc2, padFilter, padGain, lfo };

    const scale = [220, 261.6, 293.7, 329.6, 392, 440]; // A minor-ish pentatonic-ish
    this.musicStep = 0;
    const scheduleStep = () => {
      if (!this.musicPlaying) return;
      const note = scale[this.musicStep % scale.length];
      if (this.musicStep % 3 !== 2) this._tone({ freq: note * 2, type: 'sine', duration: 0.8, gain: 0.06 });
      this.musicStep++;
      this.musicTimerId = setTimeout(scheduleStep, 900);
    };
    scheduleStep();
  },

  stopMusic() {
    if (!this.musicPlaying) return;
    this.musicPlaying = false;
    clearTimeout(this.musicTimerId);
    if (this._musicNodes) {
      const ctx = this.ctx;
      const { padOsc1, padOsc2, lfo, padGain } = this._musicNodes;
      padGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.6);
      setTimeout(() => { try { padOsc1.stop(); padOsc2.stop(); lfo.stop(); } catch (e) {} }, 700);
      this._musicNodes = null;
    }
  }
};

if (typeof window !== 'undefined') window.SoundManager = SoundManager;
