// ============================================================================
// platform.js — Stack Escape
// A single Platform class whose `type` drives behaviour, so every variant
// shares the same collision/update contract that player.js and game.js rely
// on: solid(), update(dt), onPlayerLand(player), draw(ctx).
// ============================================================================

const PLATFORM_H = 16;

// How "flat" (close to horizontal) a rotating platform's bar has to be
// before it counts as safe/landable (purple). Widening this from the
// original 0.38 gives a noticeably longer landable window per rotation —
// paired with a slightly slower spin below, the safe window goes from
// roughly a quarter of each cycle to well over a third of it.
const ROTATING_SAFE_SIN = 0.6;

class Platform {
  constructor(type, x, y, w) {
    this.type = type;
    this.x = x; this.y = y; this.w = w; this.h = PLATFORM_H;
    this.dead = false;
    this.hasHazard = false; // set true if an obstacle sits visually on this platform

    // Moving
    this.baseX = x;
    this.moveAmp = Utils.randRange(28, 58);
    this.moveSpeed = Utils.randRange(1.0, 1.8) * (Utils.chance(0.5) ? 1 : -1);
    this.movePhase = Math.random() * Math.PI * 2;

    // Falling
    this.fallTriggered = false;
    this.fallDelay = 0.32;
    this.fallTimer = 0;
    this.fallVy = 0;

    // Cracked
    this.cracked = false;
    this.crackTimer = 0;
    this.crackDelay = 0.55;
    this.broken = false;

    // Breakable
    this.breakDelay = 0.14;
    this.breakTimer = 0;

    // Conveyor
    this.direction = Utils.chance(0.5) ? 1 : -1;

    // Rotating
    this.angle = Math.random() * Math.PI * 2;
    this.angularSpeed = Utils.randRange(0.85, 1.3) * (Utils.chance(0.5) ? 1 : -1);

    // Spring visual squash
    this.springSquash = new SpringValue(1, 300, 12);

    // Ice sheen animation
    this.shine = Math.random() * 10;
  }

  solid() {
    if (this.dead || this.broken) return false;
    if (this.type === 'rotating') return Math.abs(Math.sin(this.angle)) < ROTATING_SAFE_SIN;
    return true;
  }

  update(dt, dangerY) {
    switch (this.type) {
      case 'moving':
        this.movePhase += this.moveSpeed * dt;
        this.x = Utils.clamp(this.baseX + Math.sin(this.movePhase) * this.moveAmp, 4, CONFIG.WORLD_WIDTH - this.w - 4);
        break;
      case 'rotating':
        this.angle += this.angularSpeed * dt;
        break;
      case 'falling':
        if (this.fallTriggered) {
          this.fallTimer += dt;
          if (this.fallTimer >= this.fallDelay) {
            this.fallVy += 1400 * dt;
            this.y += this.fallVy * dt;
          }
        }
        break;
      case 'cracked':
        if (this.cracked && !this.broken) {
          this.crackTimer += dt;
          if (this.crackTimer >= this.crackDelay) {
            this.broken = true;
            Effects.burst(this.x + this.w / 2, this.y, { count: 10, color: '#c9a86a', size: 4, life: 0.4, gravity: 500, shape: 'square' });
            SoundManager.playBreak();
          }
        }
        break;
      case 'breakable':
        if (this.breakTimer > 0 && !this.broken) {
          this.breakTimer += dt;
          if (this.breakTimer >= this.breakDelay) {
            this.broken = true;
            Effects.burst(this.x + this.w / 2, this.y, { count: 12, color: '#ffb199', size: 4, life: 0.4, gravity: 400 });
            SoundManager.playBreak();
          }
        }
        break;
    }

    this.springSquash.set(1);
    this.springSquash.update(dt);

    // Recycle once well below the rising danger line (off-screen for good).
    if (this.y > dangerY + 260) this.dead = true;
  }

  // Called once, the frame the player lands on this platform.
  // Returns a forced vertical velocity (spring launch) or null.
  onPlayerLand(player) {
    switch (this.type) {
      case 'spring':
        this.springSquash.snap(0.35);
        Effects.burst(this.x + this.w / 2, this.y, { count: 10, color: '#3ddc97', size: 4, life: 0.35, gravity: 200, spread: Math.PI, angle: -Math.PI / 2 });
        SoundManager.playSpring();
        return CONFIG.PHYSICS.SPRING_VELOCITY;
      case 'falling':
        if (!this.fallTriggered) { this.fallTriggered = true; this.fallTimer = 0; }
        Effects.dustPuff(this.x + this.w / 2, this.y);
        SoundManager.playLand();
        return null;
      case 'cracked':
        if (!this.cracked) { this.cracked = true; this.crackTimer = 0; SoundManager.playCrack(); }
        Effects.dustPuff(this.x + this.w / 2, this.y);
        return null;
      case 'breakable':
        if (this.breakTimer === 0) this.breakTimer = 0.0001;
        Effects.dustPuff(this.x + this.w / 2, this.y);
        SoundManager.playCrack();
        return null;
      default:
        Effects.dustPuff(this.x + this.w / 2, this.y);
        SoundManager.playLand();
        return null;
    }
  }

  draw(ctx) {
    if (this.dead) return;
    const y = this.y + (1 - this.springSquash.value) * 4;
    const h = this.h * this.springSquash.value;
    ctx.save();

    if (this.type === 'rotating') {
      ctx.translate(this.x + this.w / 2, this.y + this.h / 2);
      ctx.rotate(this.angle);
      const safe = Math.abs(Math.sin(this.angle)) < ROTATING_SAFE_SIN;
      this._drawBar(ctx, -this.w / 2, -this.h / 2, this.w, this.h, safe ? '#b083ff' : '#5c4a80');
      ctx.restore();
      return;
    }

    if (this.broken) { ctx.restore(); return; }

    ctx.translate(this.x, y);

    const colors = {
      normal: ['#4fd8ff', '#1b8fc0'],
      tiny: ['#ffd23f', '#c99312'],
      moving: ['#ff9a3d', '#c26b1b'],
      ice: ['#d9f6ff', '#8fd9ec'],
      spring: ['#3ddc97', '#1f9a67'],
      conveyor: ['#b083ff', '#6c3fc2'],
      falling: ['#ff6b6b', '#a83c3c'],
      cracked: ['#c9a86a', '#8a7040'],
      breakable: ['#ff8fae', '#c2496b']
    };
    const [top, side] = colors[this.type] || colors.normal;

    ctx.fillStyle = side;
    ctx.fillRect(0, h * 0.45, this.w, h * 0.75);
    ctx.fillStyle = top;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(0, 0, this.w, h * 0.7, 5) : ctx.rect(0, 0, this.w, h * 0.7);
    ctx.fill();

    // Cheap glossy top sheen on every platform (a single translucent
    // rect — same cost as the ice-only highlight this replaces/extends)
    // for a more polished, toy-like look without any gradient/shadow cost.
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillRect(this.w * 0.08, 1.5, this.w * 0.84, 2.5);

    if (this.type === 'ice') {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(this.w * 0.1, 1, this.w * 0.3, 3);
    }
    if (this.type === 'conveyor') {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      const arrowW = 8;
      const count = Math.max(1, Math.floor(this.w / 18));
      const scroll = (performance.now() / 200 * this.direction) % 18;
      for (let i = 0; i < count; i++) {
        const ax = ((i * 18 + scroll) % (this.w - 4)) + 2;
        ctx.beginPath();
        if (this.direction > 0) { ctx.moveTo(ax, 2); ctx.lineTo(ax + arrowW, h * 0.35); ctx.lineTo(ax, h * 0.7 - 2); }
        else { ctx.moveTo(ax + arrowW, 2); ctx.lineTo(ax, h * 0.35); ctx.lineTo(ax + arrowW, h * 0.7 - 2); }
        ctx.fill();
      }
    }
    if (this.type === 'cracked' && this.cracked) {
      ctx.strokeStyle = 'rgba(70,40,10,0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(this.w * 0.3, 0); ctx.lineTo(this.w * 0.45, h * 0.6); ctx.lineTo(this.w * 0.35, h * 0.7);
      ctx.moveTo(this.w * 0.6, 0); ctx.lineTo(this.w * 0.55, h * 0.5);
      ctx.stroke();
    }
    if (this.type === 'spring') {
      ctx.strokeStyle = '#1f9a67'; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 3; i++) ctx.rect(this.w / 2 - 10, -2 - i * 3, 20, 2);
      ctx.stroke();
    }
    if (this.type === 'falling' && this.fallTriggered) {
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, h * 0.7, this.w, 2);
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  _drawBar(ctx, x, y, w, h, color) {
    ctx.fillStyle = '#5b4a86';
    ctx.fillRect(x, y + h * 0.4, w, h * 0.7);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h * 0.7);
  }
}

// ---------------------------------------------------------------------------
// Factory: picks a type + reasonable width for the current floor, and builds
// horizontally-jittered platform bands above the current highest point.
// ---------------------------------------------------------------------------
const PlatformFactory = {
  widthFor(type) {
    const ranges = {
      normal: [72, 96], tiny: [38, 48], moving: [66, 86], ice: [72, 96],
      spring: [56, 68], conveyor: [70, 92], falling: [66, 90],
      cracked: [66, 90], breakable: [62, 84], rotating: [78, 100]
    };
    const [a, b] = ranges[type] || ranges.normal;
    return Utils.randRange(a, b);
  },

  create(type, x, y, presetWidth) {
    const w = presetWidth !== undefined ? presetWidth : this.widthFor(type);
    x = Utils.clamp(x, 4, CONFIG.WORLD_WIDTH - w - 4);
    const p = new Platform(type, x, y, w);
    if (type === 'moving') p.baseX = x;
    return p;
  },

  pickType(floor) { return Utils.weightedPick(CONFIG.PLATFORM_TABLE, floor); }
};

if (typeof window !== 'undefined') {
  window.Platform = Platform;
  window.PlatformFactory = PlatformFactory;
}
