// ============================================================================
// audio.js — Stack Escape (Complete File)
// Supports preloaded .mp3 files for looping background music and synthesized SFX.
// ============================================================================

const SoundManager = {
  ctx: null,
  masterGain: null,
  sfxGain: null,
  musicGain: null,
  noiseBuffer: null,
  enabled: { sfx: true, music: true },
  _ready: false,

  // --- HTML5 Audio Elements for custom BGMs ---
  menuBGM: null,
  gameplayBGM: null,
  activeBGM: null,

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
    this.musicGain.gain.value = 1.0; 
    this.musicGain.connect(this.masterGain);

    this.noiseBuffer = this._buildNoiseBuffer();

    // --- Preload and configure custom MP3 tracks to loop ---
    this.menuBGM = new Audio('main menu.mp3');
    this.menuBGM.loop = true; // Loops the main menu theme continuously
    
    this.gameplayBGM = new Audio('gameplay music.mp3');
    this.gameplayBGM.loop = true; // Loops the gameplay theme continuously

    // Connect HTML5 elements into Web Audio graph to respect master/music gain sliders
    try {
      const menuSource = this.ctx.createMediaElementSource(this.menuBGM);
      const gameplaySource = this.ctx.createMediaElementSource(this.gameplayBGM);
      menuSource.connect(this.musicGain);
      gameplaySource.connect(this.musicGain);
    } catch (e) {
      console.warn("MediaElementSource connection failed. Playing fallback direct audio.");
    }

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
    if (v) {
      if (this.activeBGM) this.activeBGM.play().catch(e => console.log("BGM play deferred", e));
    } else {
      this.pauseBGM();
    }
  },

  _buildNoiseBuffer() {
    const len = this.ctx.sampleRate * 0.6;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  },

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

  // --- Public sound effects ---
  playJump() { 
    this._tone({ freq: 280, sweepTo: 720, type: 'triangle', duration: 0.16, gain: 0.24 }); 
    this._noiseBurst({ duration: 0.04, filterFreq: 600, gain: 0.1 });
  },
  
  playSuperJump() { 
    this._tone({ freq: 240, sweepTo: 1100, type: 'sawtooth', duration: 0.24, gain: 0.18 }); 
    this._noiseBurst({ duration: 0.08, filterFreq: 1200, gain: 0.15 });
  },

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

  // --- BGM Controls ---
  playMenuBGM() {
    if (!this._ready) return;
    this.stopBGM();
    this.activeBGM = this.menuBGM;
    if (this.activeBGM) {
      this.activeBGM.volume = 1.0; 
      if (this.enabled.music) {
        this.activeBGM.play().catch(e => console.log("Audio interaction deferred:", e));
      }
    }
  },

  playGameplayBGM() {
    if (!this._ready) return;
    
    // If swapping tracks entirely, clean up the old one
    if (this.activeBGM !== this.gameplayBGM) {
      this.stopBGM();
      this.activeBGM = this.gameplayBGM;
    }
    
    if (this.activeBGM) {
      this.activeBGM.volume = 0.35; 
      if (this.enabled.music) {
        this.activeBGM.play().catch(e => console.log("Audio interaction deferred:", e));
      }
    }
  },

  pauseBGM() {
    if (this.activeBGM) this.activeBGM.pause();
  },

  stopBGM() {
    if (this.menuBGM) { this.menuBGM.pause(); this.menuBGM.currentTime = 0; }
    if (this.gameplayBGM) { this.gameplayBGM.pause(); this.gameplayBGM.currentTime = 0; }
    this.activeBGM = null;
  }
};

if (typeof window !== 'undefined') window.SoundManager = SoundManager;
