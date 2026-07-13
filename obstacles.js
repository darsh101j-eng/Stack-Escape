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

    // Rock
    this.vx = opts.vx ?? (Utils.chance(0.5) ? 1 : -1) * Utils.randRange(70, 130);
    this.radius = opts.radius ?? 13;

    // Hammer
    this.anchorX = x; this.anchorY = y - (opts.ropeLen ?? 60);
    this.ropeLen = opts.ropeLen ?? 60;
    this.swingSpeed = opts.swingSpeed ?? Utils.randRange(1.6, 2.3);
    this.swingMax = opts.swingMax ?? Utils.randRange(0.9, 1.25);
    this.swingPhase = Math.random() * Math.PI * 2;

    // Drone
    this.xMin = opts.xMin ?? 20; this.xMax = opts.xMax ?? CONFIG.WORLD_WIDTH - 20;
    this.droneSpeed = opts.droneSpeed ?? Utils.randRange(55, 95);
    this.droneDir = Utils.chance(0.5) ? 1 : -1;

    // Debris
    this.vy = opts.vy ?? Utils.randRange(160, 240);
    this.rot = 0; this.vrot = Utils.randRange(-4, 4);

    // Laser
    this.laserW = opts.laserW ?? CONFIG.WORLD_WIDTH - 40;
    this.laserState = 'idle'; this.laserTimer = Utils.randRange(0, 1);
    this.laserCycle = { idle: 1.1, telegraph: 0.55, active: 0.5 };

    // Spikes / fire static
    this.w = opts.w ?? 30; this.h = opts.h ?? (type === 'fire' ? 34 : 16);
    this.flameAccum = 0;
  }

  update(dt, dangerY) {
    this.t += dt;
    switch (this.type) {
      case 'rock':
        this.x += this.vx * dt;
        if (this.x < this.radius) { this.x = this.radius; this.vx *= -1; }
        if (this.x > CONFIG.WORLD_WIDTH - this.radius) { this.x = CONFIG.WORLD_WIDTH - this.radius; this.vx *= -1; }
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
      case 'rock': return { x: this.x - this.radius + 3, y: this.y - this.radius + 3, w: this.radius * 2 - 6, h: this.radius * 2 - 6 };
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
      case 'spikes': return { x: this.x + 4, y: this.y, w: this.w - 8, h: this.h };
      case 'fire': return { x: this.x + 6, y: this.y + 6, w: this.w - 12, h: this.h - 6 };
      default: return { x: this.x, y: this.y, w: this.w, h: this.h };
    }
  }

  hits(playerBox) { return Utils.aabbOverlap(this.hitbox(), playerBox); }

  draw(ctx) {
    ctx.save();
    switch (this.type) {
      case 'spikes': this._drawSpikes(ctx); break;
      case 'fire': this._drawFire(ctx); break;
      case 'laser': this._drawLaser(ctx); break;
      case 'rock': this._drawRock(ctx); break;
      case 'hammer': this._drawHammer(ctx); break;
      case 'drone': this._drawDrone(ctx); break;
      case 'debris': this._drawDebris(ctx); break;
    }
    ctx.restore();
  }

  _drawSpikes(ctx) {
    const n = Math.max(2, Math.round(this.w / 12));
    ctx.fillStyle = '#e2e8f0';
    for (let i = 0; i < n; i++) {
      const sx = this.x + i * (this.w / n);
      ctx.beginPath();
      ctx.moveTo(sx, this.y + this.h);
      ctx.lineTo(sx + this.w / n / 2, this.y);
      ctx.lineTo(sx + this.w / n, this.y + this.h);
      ctx.closePath();
      ctx.fill();
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

  _drawRock(ctx) {
    ctx.translate(this.x, this.y);
    ctx.rotate(this.x * 0.05);
    ctx.fillStyle = '#8a8a9a';
    ctx.beginPath(); ctx.arc(0, 0, this.radius, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6c6c7c';
    ctx.beginPath(); ctx.arc(-3, -3, this.radius * 0.4, 0, Math.PI * 2); ctx.fill();
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
