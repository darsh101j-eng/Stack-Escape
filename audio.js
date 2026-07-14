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
    if (this.ctx && this.ctx.state !== 'running') {
      const p = this.ctx.resume();
      if (p && p.catch) p.catch(() => {});
    }
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
  // plus a soft plucked melody stepped on a simple lookahead scheduler.
  // Everything here routes through musicGain and is gated only by the
  // music toggle (musicPlaying) — earlier notes were routed through the
  // SFX bus by mistake, so turning sound effects off silently killed the
  // melody even with music left on.
  //
  // The whole rich graph is wrapped in a try/catch: if any single node
  // type isn't supported somewhere, we fall back to a minimal two-oscillator
  // pad that is about as basic as WebAudio gets, rather than silently
  // producing no music at all.
  startMusic() {
    if (!this._ready || !this.enabled.music || this.musicPlaying) return;
    this.musicPlaying = true;
    try {
      this._startRichMusic();
    } catch (e) {
      console.warn('Rich music graph failed, falling back to basic pad.', e);
      try { this._startBasicMusic(); } catch (e2) { console.warn('Basic music also failed.', e2); this.musicPlaying = false; }
    }
  },

  _startRichMusic() {
    const ctx = this.ctx;
    this.musicGain.gain.cancelScheduledValues(ctx.currentTime);
    this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, ctx.currentTime);
    this.musicGain.gain.linearRampToValueAtTime(0.34, ctx.currentTime + 1.6);

    // --- Warm pad: three gently-detuned sines through a slowly swept
    // lowpass filter, plus a slow "breathing" tremolo so it feels alive
    // rather than a static drone. ---
    const padOsc1 = ctx.createOscillator();
    const padOsc2 = ctx.createOscillator();
    const padOsc3 = ctx.createOscillator();
    padOsc1.type = 'sine'; padOsc2.type = 'sine'; padOsc3.type = 'sine';
    padOsc1.frequency.value = 110;        // root
    padOsc2.frequency.value = 110 * 1.5;  // fifth
    padOsc2.detune.value = 6;             // gentle chorus/warmth
    padOsc3.frequency.value = 55;         // sub octave for body
    padOsc3.detune.value = -5;

    const padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = 750;
    padFilter.Q.value = 0.3;

    const padGain = ctx.createGain();
    padGain.gain.value = 0.6;
    padOsc1.connect(padFilter); padOsc2.connect(padFilter); padOsc3.connect(padFilter);
    padFilter.connect(padGain).connect(this.musicGain);

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 300;
    lfo.connect(lfoGain).connect(padFilter.frequency);

    const breathe = ctx.createOscillator();
    breathe.frequency.value = 0.09;
    const breatheGain = ctx.createGain();
    breatheGain.gain.value = 0.08;
    breathe.connect(breatheGain).connect(padGain.gain);

    padOsc1.start(); padOsc2.start(); padOsc3.start(); lfo.start(); breathe.start();

    // --- Soft feedback-delay bus the melody notes bloom into, for an
    // airy, spacious feel without needing any audio files/reverb IR. ---
    const echoDelay = ctx.createDelay(1.0);
    echoDelay.delayTime.value = 0.44;
    const echoFeedback = ctx.createGain();
    echoFeedback.gain.value = 0.3;
    const echoFilter = ctx.createBiquadFilter();
    echoFilter.type = 'lowpass';
    echoFilter.frequency.value = 2100;
    echoDelay.connect(echoFeedback).connect(echoFilter).connect(echoDelay);
    const echoOut = ctx.createGain();
    echoOut.gain.value = 0.6;
    echoDelay.connect(echoOut).connect(this.musicGain);
    this._musicEchoIn = echoDelay;

    this._musicNodes = { padOsc1, padOsc2, padOsc3, padFilter, padGain, lfo, breathe, echoDelay, echoFeedback, echoFilter, echoOut };
    this._musicMode = 'rich';

    // Gentle wandering melody over a two-chord vamp (Am9 <-> Fmaj7-ish)
    // instead of a rigid scale run up and down, so it stays soothing and
    // unobtrusive rather than sounding like a loop.
    const chordA = [220, 261.6, 329.6, 392, 440];      // A minor 9-ish
    const chordB = [174.6, 220, 261.6, 349.2, 415.3];  // F major 7-ish
    this.musicStep = 0;
    const scheduleStep = () => {
      if (!this.musicPlaying) return;
      const bar = Math.floor(this.musicStep / 4) % 2;
      const chord = bar === 0 ? chordA : chordB;
      if (this.musicStep % 2 === 0) this._musicPluck(Utils.pick(chord));
      this.musicStep++;
      this.musicTimerId = setTimeout(scheduleStep, 940 + Math.random() * 140);
    };
    scheduleStep();
  },

  // Minimal fallback: two plain oscillators + one gain node. About as
  // simple as WebAudio gets, used only if the richer graph above throws.
  _startBasicMusic() {
    const ctx = this.ctx;
    this.musicGain.gain.cancelScheduledValues(ctx.currentTime);
    this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, ctx.currentTime);
    this.musicGain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 1.2);
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc1.type = 'sine'; osc2.type = 'sine';
    osc1.frequency.value = 220; osc2.frequency.value = 330;
    const g = ctx.createGain();
    g.gain.value = 0.5;
    osc1.connect(g); osc2.connect(g); g.connect(this.musicGain);
    osc1.start(); osc2.start();
    this._musicNodes = { padOsc1: osc1, padOsc2: osc2, padGain: g };
    this._musicMode = 'basic';
  },

  // A single soft plucked melody note, fed into the echo bus.
  _musicPluck(freq) {
    if (!this._ready) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t0);
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(0.09, t0 + 0.04);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.15);
    osc.connect(amp);
    amp.connect(this.musicGain);
    if (this._musicEchoIn) amp.connect(this._musicEchoIn);
    osc.start(t0);
    osc.stop(t0 + 1.2);
  },

  stopMusic() {
    if (!this.musicPlaying) return;
    this.musicPlaying = false;
    clearTimeout(this.musicTimerId);
    if (this._musicNodes) {
      const ctx = this.ctx;
      const nodes = this._musicNodes;
      try { nodes.padGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.8); } catch (e) {}
      setTimeout(() => {
        for (const key of ['padOsc1', 'padOsc2', 'padOsc3', 'lfo', 'breathe']) {
          if (nodes[key]) { try { nodes[key].stop(); } catch (e) {} }
        }
      }, 900);
      this._musicNodes = null;
      this._musicEchoIn = null;
    }
  }
};

if (typeof window !== 'undefined') window.SoundManager = SoundManager;
