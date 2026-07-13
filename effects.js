// ============================================================================
// effects.js — Stack Escape
// All "juice": particles, floating text, camera shake, screen flash, hit-stop
// and a tiny spring/tween helper for squash-and-stretch style animation.
// Particles and floating text use ObjectPool to avoid per-frame allocation.
// ============================================================================

class Particle {
  constructor() { this.reset(); }
  reset() {
    this.x = 0; this.y = 0; this.vx = 0; this.vy = 0;
    this.life = 0; this.maxLife = 1; this.size = 4; this.color = '#fff';
    this.gravity = 0; this.friction = 1; this.shape = 'circle'; this.rotation = 0;
    this.vrot = 0; this.fadeOut = true; this.glow = false;
  }
}

class FloatingText {
  constructor() { this.reset(); }
  reset() {
    this.x = 0; this.y = 0; this.vy = -40; this.text = ''; this.color = '#fff';
    this.life = 0; this.maxLife = 1; this.size = 16; this.scale = 1;
  }
}

const Effects = {
  particlePool: new ObjectPool(() => new Particle(), p => p.reset(), 120),
  textPool: new ObjectPool(() => new FloatingText(), t => t.reset(), 16),

  shakeTrauma: 0,
  flashColor: null,
  flashAlpha: 0,
  hitStopTimer: 0,

  reset() {
    this.particlePool.releaseAll();
    this.textPool.releaseAll();
    this.shakeTrauma = 0;
    this.flashAlpha = 0;
    this.hitStopTimer = 0;
  },

  // --- Screen shake --------------------------------------------------
  addShake(amount) { this.shakeTrauma = Utils.clamp(this.shakeTrauma + amount, 0, 1); },

  _shakeOffset: { x: 0, y: 0, rot: 0 },
  getShakeOffset() {
    const t = this.shakeTrauma * this.shakeTrauma;
    const o = this._shakeOffset;
    o.x = (Math.random() * 2 - 1) * 10 * t;
    o.y = (Math.random() * 2 - 1) * 10 * t;
    o.rot = (Math.random() * 2 - 1) * 0.06 * t;
    return o;
  },

  // --- Screen flash ----------------------------------------------------
  flash(color, alpha = 0.5) { this.flashColor = color; this.flashAlpha = alpha; },

  // --- Hit stop (brief slow-mo on impactful events) ------------------------
  triggerHitStop(seconds) { this.hitStopTimer = Math.max(this.hitStopTimer, seconds); },

  // Call once per real frame; returns the timeScale to multiply gameplay dt by.
  consumeHitStop(realDt) {
    if (this.hitStopTimer > 0) {
      this.hitStopTimer -= realDt;
      return 0.06;
    }
    return 1;
  },

  update(dt) {
    this.shakeTrauma = Math.max(0, this.shakeTrauma - dt * 1.6);
    if (this.flashAlpha > 0) this.flashAlpha = Math.max(0, this.flashAlpha - dt * 2.2);

    this.particlePool.sweep(p => {
      p.life -= dt;
      if (p.life <= 0) return false;
      p.vy += p.gravity * dt;
      p.vx *= p.friction; p.vy *= p.friction;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rotation += p.vrot * dt;
      return true;
    });

    this.textPool.sweep(t => {
      t.life -= dt;
      if (t.life <= 0) return false;
      t.y += t.vy * dt;
      t.vy *= 0.94;
      return true;
    });
  },

  // --- Spawners ---------------------------------------------------------
  burst(x, y, { count = 12, color = '#fff', speed = 160, size = 4, life = 0.5, gravity = 500, shape = 'circle', spread = Math.PI * 2, angle = 0, glow = false } = {}) {
    for (let i = 0; i < count; i++) {
      const p = this.particlePool.obtain();
      const a = angle - spread / 2 + Math.random() * spread;
      const s = speed * (0.5 + Math.random() * 0.7);
      p.x = x; p.y = y;
      p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s;
      p.life = p.maxLife = life * (0.7 + Math.random() * 0.6);
      p.size = size * (0.6 + Math.random() * 0.8);
      p.color = Array.isArray(color) ? Utils.pick(color) : color;
      p.gravity = gravity; p.friction = 0.94; p.shape = shape;
      p.rotation = Math.random() * Math.PI * 2;
      p.vrot = (Math.random() * 2 - 1) * 6;
      p.glow = glow;
    }
  },

  sparkle(x, y, color = '#ffd23f') {
    this.burst(x, y, { count: 8, color, speed: 90, size: 3, life: 0.4, gravity: 120, shape: 'diamond', glow: true });
  },

  dustPuff(x, y) {
    this.burst(x, y, { count: 6, color: ['#ffffff', '#dbe9ff'], speed: 70, size: 5, life: 0.35, gravity: -20, shape: 'circle', spread: Math.PI, angle: -Math.PI / 2 });
  },

  explosionBurst(x, y) {
    this.burst(x, y, { count: 20, color: ['#ff6b6b', '#ffd23f', '#ff9a3d'], speed: 260, size: 6, life: 0.6, gravity: 300, shape: 'circle', glow: true });
    this.burst(x, y, { count: 10, color: '#888', speed: 120, size: 5, life: 0.8, gravity: 100, shape: 'circle' });
  },

  confetti(x, y) {
    this.burst(x, y, { count: 16, color: ['#ff6b6b', '#4fd8ff', '#ffd23f', '#3ddc97', '#b083ff'], speed: 220, size: 5, life: 0.9, gravity: 420, shape: 'square' });
  },

  floatText(x, y, text, { color = '#fff', size = 16, vy = -55 } = {}) {
    const t = this.textPool.obtain();
    t.x = x; t.y = y; t.text = text; t.color = color; t.size = size; t.vy = vy;
    t.life = t.maxLife = 0.9; t.scale = 0;
  },

  // --- Drawing (world-space particles/text; call within camera transform) -
  drawParticles(ctx) {
    for (const p of this.particlePool.active) {
      const alpha = p.fadeOut ? Utils.clamp(p.life / p.maxLife, 0, 1) : 1;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      if (p.glow) { ctx.shadowColor = p.color; ctx.shadowBlur = 10; }
      ctx.fillStyle = p.color;
      if (p.shape === 'circle') {
        ctx.beginPath(); ctx.arc(0, 0, p.size, 0, Math.PI * 2); ctx.fill();
      } else if (p.shape === 'square') {
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      } else if (p.shape === 'diamond') {
        ctx.beginPath();
        ctx.moveTo(0, -p.size); ctx.lineTo(p.size, 0); ctx.lineTo(0, p.size); ctx.lineTo(-p.size, 0);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
  },

  drawFloatingTexts(ctx) {
    for (const t of this.textPool.active) {
      const p = 1 - t.life / t.maxLife;
      const scale = p < 0.25 ? Utils.easeOutBack(p / 0.25) : 1;
      const alpha = p > 0.6 ? 1 - (p - 0.6) / 0.4 : 1;
      ctx.save();
      ctx.globalAlpha = Utils.clamp(alpha, 0, 1);
      ctx.translate(t.x, t.y);
      ctx.scale(scale, scale);
      ctx.font = `800 ${t.size}px 'Baloo 2', 'Fredoka', sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.strokeText(t.text, 0, 0);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, 0, 0);
      ctx.restore();
    }
  },

  // Screen-space flash overlay — call after restoring the camera transform.
  drawFlash(ctx, w, h) {
    if (this.flashAlpha <= 0 || !this.flashColor) return;
    ctx.save();
    ctx.globalAlpha = this.flashAlpha;
    ctx.fillStyle = this.flashColor;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
};

// ---------------------------------------------------------------------------
// SpringValue — critically-damped spring, handy for squash/stretch, UI pops.
// ---------------------------------------------------------------------------
class SpringValue {
  constructor(value = 1, stiffness = 170, damping = 14) {
    this.value = value; this.target = value; this.vel = 0;
    this.stiffness = stiffness; this.damping = damping;
  }
  set(target) { this.target = target; }
  snap(value) { this.value = value; this.target = value; this.vel = 0; }
  update(dt) {
    const force = (this.target - this.value) * this.stiffness - this.vel * this.damping;
    this.vel += force * dt;
    this.value += this.vel * dt;
    return this.value;
  }
}

if (typeof window !== 'undefined') {
  window.Effects = Effects;
  window.SpringValue = SpringValue;
}
