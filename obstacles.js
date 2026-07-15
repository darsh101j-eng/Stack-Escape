// ============================================================================
// obstacles.js — Stack Escape
// Hazards that end the run on contact (unless the player has a shield).
// Like Platform, one class + a `type` switch keeps the collision/update/draw
// contract identical for every variant.
// ============================================================================

class Obstacle {
  constructor(type, x, y, opts = {}) {
    this.type = type;
    this.x = x; this.y = y;
    this.dead = false;
    this.t = Math.random() * 10;

    // Bat — patrols back and forth like a drone but with an organic
    // sine-wave vertical bob and flapping wings, instead of rock's abrupt
    // full-width wall-to-wall bounce.
    this.xMin = opts.xMin ?? 20; this.xMax = opts.xMax ?? CONFIG.WORLD_WIDTH - 20;
    this.batSpeed = opts.batSpeed ?? Utils.randRange(55, 95);
    this.batDir = Utils.chance(0.5) ? 1 : -1;
    this.bobAmp = opts.bobAmp ?? Utils.randRange(9, 16);

    // Hammer
    this.anchorX = x; this.anchorY = y - (opts.ropeLen ?? 60);
    this.ropeLen = opts.ropeLen ?? 60;
    this.swingSpeed = opts.swingSpeed ?? Utils.randRange(1.6, 2.3);
    this.swingMax = opts.swingMax ?? Utils.randRange(0.9, 1.25);
    this.swingPhase = Math.random() * Math.PI * 2;

    // Drone
    this.droneSpeed = opts.droneSpeed ?? Utils.randRange(55, 95);
    this.droneDir = Utils.chance(0.5) ? 1 : -1;

    // Debris
    this.vy = opts.vy ?? Utils.randRange(160, 240);
    this.rot = 0; this.vrot = Utils.randRange(-4, 4);

    // Laser
    this.laserW = opts.laserW ?? CONFIG.WORLD_WIDTH - 40;
    this.laserState = 'idle'; this.laserTimer = Utils.randRange(0, 1);
    this.laserCycle = { idle: 1.1, telegraph: 0.55, active: 0.5 };

    // Geyser — a localized, telegraphed eruption anchored to a platform
    // edge (replaces the old always-dangerous static icicle). Same
    // idle/telegraph/active fairness pattern as laser, just a vertical,
    // localized burst instead of a full-width beam.
    this.geyserState = 'idle'; this.geyserTimer = Utils.randRange(0, 1);
    this.geyserCycle = { idle: 1.3, telegraph: 0.5, active: 0.45 };
    this.geyserHeight = opts.height ?? 85;

    // Fire static
    this.w = opts.w ?? 30; this.h = opts.h ?? 34;
    this.flameAccum = 0;
  }

  update(dt, dangerY) {
    this.t += dt;
    switch (this.type) {
      case 'bat':
        this.x += this.batDir * this.batSpeed * dt;
        if (this.x < this.xMin) { this.x = this.xMin; this.batDir = 1; }
        if (this.x > this.xMax) { this.x = this.xMax; this.batDir = -1; }
        break;
      case 'hammer':
        this.swingPhase += this.swingSpeed * dt;
        break;
      case 'drone':
        this.x += this.droneDir * this.droneSpeed * dt;
        if (this.x < this.xMin) { this.x = this.xMin; this.droneDir = 1; }
        if (this.x > this.xMax) { this.x = this.xMax; this.droneDir = -1; }
        break;
      case 'debris':
        this.y += this.vy * dt;
        this.vy += 260 * dt;
        this.rot += this.vrot * dt;
        break;
      case 'laser':
        this.laserTimer -= dt;
        if (this.laserTimer <= 0) {
          if (this.laserState === 'idle') { this.laserState = 'telegraph'; this.laserTimer = this.laserCycle.telegraph; }
          else if (this.laserState === 'telegraph') { this.laserState = 'active'; this.laserTimer = this.laserCycle.active; SoundManager.playError(); }
          else { this.laserState = 'idle'; this.laserTimer = this.laserCycle.idle; }
        }
        break;
      case 'geyser':
        this.geyserTimer -= dt;
        if (this.geyserTimer <= 0) {
          if (this.geyserState === 'idle') { this.geyserState = 'telegraph'; this.geyserTimer = this.geyserCycle.telegraph; }
          else if (this.geyserState === 'telegraph') { this.geyserState = 'active'; this.geyserTimer = this.geyserCycle.active; SoundManager.playSpring(); }
          else { this.geyserState = 'idle'; this.geyserTimer = this.geyserCycle.idle; }
        }
        if (this.geyserState === 'telegraph') {
          this.flameAccum += dt;
          if (this.flameAccum > 0.11) {
            this.flameAccum = 0;
            Effects.burst(this.x, this.y - 4, { count: 1, color: '#8fe8ff', speed: 24, size: 3, life: 0.3, gravity: -50, spread: 0.5, angle: -Math.PI / 2 });
          }
        }
        break;
      case 'fire':
        this.flameAccum += dt;
        if (this.flameAccum > 0.09) {
          this.flameAccum = 0;
          Effects.burst(this.x + this.w / 2, this.y + 4, { count: 2, color: ['#ff9a3d', '#ffd23f'], speed: 30, size: 4, life: 0.4, gravity: -140, spread: 0.8, angle: -Math.PI / 2 });
        }
        break;
    }

    const cullY = this.type === 'hammer' ? this.anchorY : this.y;
    if (cullY > dangerY + 280 || this.y > dangerY + 400) this.dead = true;
  }

  // Axis-aligned hazard box used for collision (inset from the visual art
  // slightly so hits feel fair).
  hitbox() {
    switch (this.type) {
      case 'bat': return { x: this.x - 11, y: this.y - 9 + Math.sin(this.t * 2.4) * this.bobAmp, w: 22, h: 16 };
      case 'hammer': {
        const hx = this.anchorX + Math.sin(this.swingPhase) * this.swingMax * this.ropeLen;
        const hy = this.anchorY + Math.cos(this.swingPhase) * this.swingMax * this.ropeLen;
        return { x: hx - 12, y: hy - 12, w: 24, h: 24 };
      }
      case 'drone': return { x: this.x - 14, y: this.y - 9 + Math.sin(this.t * 3) * 3, w: 28, h: 18 };
      case 'debris': return { x: this.x - 10, y: this.y - 10, w: 20, h: 20 };
      case 'laser': return this.laserState === 'active'
        ? { x: this.x, y: this.y - 4, w: this.laserW, h: 8 }
        : { x: -9999, y: -9999, w: 0, h: 0 };
      case 'geyser': return this.geyserState === 'active'
        ? { x: this.x - 9, y: this.y - this.geyserHeight, w: 18, h: this.geyserHeight + 4 }
        : { x: -9999, y: -9999, w: 0, h: 0 };
      case 'fire': return { x: this.x + 6, y: this.y + 6, w: this.w - 12, h: this.h - 6 };
      default: return { x: this.x, y: this.y, w: this.w, h: this.h };
    }
  }

  hits(playerBox) { return Utils.aabbOverlap(this.hitbox(), playerBox); }

  draw(ctx) {
    ctx.save();
    switch (this.type) {
      case 'geyser': this._drawGeyser(ctx); break;
      case 'fire': this._drawFire(ctx); break;
      case 'laser': this._drawLaser(ctx); break;
      case 'bat': this._drawBat(ctx); break;
      case 'hammer': this._drawHammer(ctx); break;
      case 'drone': this._drawDrone(ctx); break;
      case 'debris': this._drawDebris(ctx); break;
    }
    ctx.restore();
  }

  _drawGeyser(ctx) {
    const state = this.geyserState;
    // Nozzle base sitting on the platform edge — stays put through every
    // state so the "safe to stand near, dangerous only when it fires"
    // read is clear even before the player has seen a full cycle.
    ctx.fillStyle = '#3a3a52';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(this.x - 9, this.y - 7, 18, 10, 3) : ctx.rect(this.x - 9, this.y - 7, 18, 10);
    ctx.fill();

    const capColor = state === 'active' ? '#4fd8ff' : (state === 'telegraph' ? '#8fe8ff' : '#2a5a66');
    ctx.fillStyle = capColor;
    ctx.beginPath(); ctx.arc(this.x, this.y - 7, 5, 0, Math.PI * 2); ctx.fill();

    if (state === 'telegraph') {
      // Pulsing warning ring while it charges up.
      ctx.globalAlpha = 0.45 + Math.sin(this.t * 22) * 0.3;
      ctx.strokeStyle = '#8fe8ff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(this.x, this.y - 7, 9, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (state === 'active') {
      const h = this.geyserHeight;
      const wob = Math.sin(this.t * 18) * 3;
      ctx.save();
      ctx.shadowColor = '#4fd8ff'; ctx.shadowBlur = 12;
      const grad = ctx.createLinearGradient(0, this.y, 0, this.y - h);
      grad.addColorStop(0, 'rgba(143,232,255,0.95)');
      grad.addColorStop(1, 'rgba(79,216,255,0.05)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(this.x - 8, this.y - 4);
      ctx.quadraticCurveTo(this.x - 8 + wob, this.y - h * 0.5, this.x - 4, this.y - h);
      ctx.lineTo(this.x + 4, this.y - h);
      ctx.quadraticCurveTo(this.x + 8 + wob, this.y - h * 0.5, this.x + 8, this.y - 4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  _drawFire(ctx) {
    const wob = Math.sin(this.t * 9) * 2;
    const grad = ctx.createLinearGradient(0, this.y + this.h, 0, this.y - 6);
    grad.addColorStop(0, '#ff3d1a'); grad.addColorStop(0.5, '#ff9a3d'); grad.addColorStop(1, '#ffe98a');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y + this.h);
    ctx.quadraticCurveTo(this.x + this.w * 0.2 + wob, this.y + this.h * 0.4, this.x + this.w * 0.5, this.y - 6);
    ctx.quadraticCurveTo(this.x + this.w * 0.8 - wob, this.y + this.h * 0.4, this.x + this.w, this.y + this.h);
    ctx.closePath();
    ctx.fill();
  }

  _drawLaser(ctx) {
    const emitterColor = this.laserState === 'idle' ? '#555' : '#ff3d81';
    ctx.fillStyle = emitterColor;
    ctx.fillRect(this.x - 8, this.y - 10, 8, 20);
    ctx.fillRect(this.x + this.laserW, this.y - 10, 8, 20);
    if (this.laserState === 'telegraph') {
      ctx.globalAlpha = 0.5 + Math.sin(this.t * 30) * 0.3;
      ctx.strokeStyle = '#ff3d81'; ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.x + this.laserW, this.y); ctx.stroke();
      ctx.setLineDash([]);
    } else if (this.laserState === 'active') {
      ctx.shadowColor = '#ff3d81'; ctx.shadowBlur = 14;
      ctx.fillStyle = '#fff';
      ctx.fillRect(this.x, this.y - 4, this.laserW, 8);
      ctx.fillStyle = '#ff3d81';
      ctx.fillRect(this.x, this.y - 2, this.laserW, 4);
    }
  }

  _drawBat(ctx) {
    const bob = Math.sin(this.t * 2.4) * this.bobAmp;
    const flap = Math.sin(this.t * 14);
    ctx.translate(this.x, this.y + bob);
    // Wings behind the body, flapping
    const wingSpread = 10 + flap * 5;
    ctx.fillStyle = '#3a1f4d';
    ctx.beginPath();
    ctx.moveTo(0, -2);
    ctx.lineTo(-wingSpread, -8 - flap * 3);
    ctx.lineTo(-wingSpread * 0.6, 2);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, -2);
    ctx.lineTo(wingSpread, -8 - flap * 3);
    ctx.lineTo(wingSpread * 0.6, 2);
    ctx.closePath(); ctx.fill();
    // Body
    ctx.fillStyle = '#241332';
    ctx.beginPath(); ctx.ellipse(0, 0, 7, 6, 0, 0, Math.PI * 2); ctx.fill();
    // Little ears
    ctx.beginPath();
    ctx.moveTo(-4, -5); ctx.lineTo(-6, -10); ctx.lineTo(-2, -6); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(4, -5); ctx.lineTo(6, -10); ctx.lineTo(2, -6); ctx.closePath(); ctx.fill();
    // Eyes
    ctx.fillStyle = '#ff3d81';
    ctx.beginPath(); ctx.arc(-2.5, -1, 1.3, 0, Math.PI * 2); ctx.arc(2.5, -1, 1.3, 0, Math.PI * 2); ctx.fill();
  }

  _drawHammer(ctx) {
    const hx = this.anchorX + Math.sin(this.swingPhase) * this.swingMax * this.ropeLen;
    const hy = this.anchorY + Math.cos(this.swingPhase) * this.swingMax * this.ropeLen;
    ctx.strokeStyle = '#8a7a5c'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(this.anchorX, this.anchorY); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.fillStyle = '#5b5b6b';
    ctx.beginPath(); ctx.arc(hx, hy, 15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8a8a9a';
    ctx.fillRect(hx - 15, hy - 6, 30, 12);
  }

  _drawDrone(ctx) {
    const bob = Math.sin(this.t * 3) * 3;
    ctx.translate(this.x, this.y + bob);
    ctx.fillStyle = '#3a3a52';
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-13, -8, 26, 16, 4) : ctx.rect(-13, -8, 26, 16); ctx.fill();
    ctx.fillStyle = '#ff3d81';
    ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
    const spin = this.t * 25;
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2;
    [[-14, -8], [14, -8]].forEach(([px, py]) => {
      ctx.save(); ctx.translate(px, py); ctx.rotate(spin);
      ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(7, 0); ctx.stroke();
      ctx.restore();
    });
  }

  _drawDebris(ctx) {
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    ctx.fillStyle = '#7a6a56';
    ctx.beginPath();
    ctx.moveTo(-9, -9); ctx.lineTo(9, -6); ctx.lineTo(7, 9); ctx.lineTo(-8, 8);
    ctx.closePath(); ctx.fill();
  }
}

const ObstacleFactory = {
  pickType(floor) { return Utils.weightedPick(CONFIG.OBSTACLE_TABLE, floor); },
  create(type, x, y, opts) { return new Obstacle(type, x, y, opts); }
};

if (typeof window !== 'undefined') {
  window.Obstacle = Obstacle;
  window.ObstacleFactory = ObstacleFactory;
}
