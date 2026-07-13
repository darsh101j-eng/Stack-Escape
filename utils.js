// ============================================================================
// utils.js — Stack Escape
// Small, dependency-free helpers shared across modules.
// ============================================================================

const Utils = {
  clamp(v, min, max) { return v < min ? min : (v > max ? max : v); },

  lerp(a, b, t) { return a + (b - a) * t; },

  // Frame-rate independent damping lerp (Freya Holmer style).
  damp(a, b, lambda, dt) { return Utils.lerp(a, b, 1 - Math.exp(-lambda * dt)); },

  randRange(min, max) { return min + Math.random() * (max - min); },

  randInt(min, max) { return Math.floor(Utils.randRange(min, max + 1)); },

  chance(p) { return Math.random() < p; },

  pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; },

  // table: array of [value, weight, minFloorOrOmitted]
  weightedPick(table, floor = Infinity) {
    const rows = table.filter(r => (r[2] === undefined || floor >= r[2]));
    const total = rows.reduce((s, r) => s + r[1], 0);
    let roll = Math.random() * total;
    for (const row of rows) {
      roll -= row[1];
      if (roll <= 0) return row[0];
    }
    return rows.length ? rows[rows.length - 1][0] : null;
  },

  aabbOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x &&
           a.y < b.y + b.h && a.y + a.h > b.y;
  },

  dist(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); },

  // --- Easing (t in [0,1]) -----------------------------------------------
  easeOutBack(t) {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); },
  easeOutElastic(t) {
    const c4 = (2 * Math.PI) / 3;
    return t === 0 ? 0 : t === 1 ? 1
      : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
  easeInOutSine(t) { return -(Math.cos(Math.PI * t) - 1) / 2; },

  formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  },

  formatNumber(n) {
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  },

  uid() { return Math.random().toString(36).slice(2, 10); }
};

// ---------------------------------------------------------------------------
// Tiny event emitter used to decouple gameplay events (coin collected, floor
// reached, powerup used...) from whoever is listening (missions, UI, audio).
// ---------------------------------------------------------------------------
class EventBus {
  constructor() { this.listeners = new Map(); }
  on(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(fn);
    return fn;
  }
  off(event, fn) {
    const arr = this.listeners.get(event);
    if (!arr) return;
    const i = arr.indexOf(fn);
    if (i >= 0) arr.splice(i, 1);
  }
  emit(event, payload) {
    const arr = this.listeners.get(event);
    if (!arr) return;
    for (let i = 0; i < arr.length; i++) arr[i](payload);
  }
  clear() { this.listeners.clear(); }
}

// ---------------------------------------------------------------------------
// Generic object pool to avoid per-frame allocations for particles etc.
// ---------------------------------------------------------------------------
class ObjectPool {
  constructor(factory, reset, initialSize = 32) {
    this.factory = factory;
    this.reset = reset;
    this.free = [];
    this.active = [];
    for (let i = 0; i < initialSize; i++) this.free.push(factory());
  }
  obtain() {
    const obj = this.free.pop() || this.factory();
    this.active.push(obj);
    return obj;
  }
  releaseAll() {
    // Move everything back to the free list, resetting state.
    while (this.active.length) {
      const obj = this.active.pop();
      this.reset(obj);
      this.free.push(obj);
    }
  }
  // Call once per frame with a predicate; objects for which it returns false
  // (dead) are recycled, the rest are kept active.
  sweep(isAliveFn) {
    const stillActive = [];
    for (const obj of this.active) {
      if (isAliveFn(obj)) stillActive.push(obj);
      else { this.reset(obj); this.free.push(obj); }
    }
    this.active = stillActive;
  }
}

if (typeof window !== 'undefined') {
  window.Utils = Utils;
  window.EventBus = EventBus;
  window.ObjectPool = ObjectPool;
}
