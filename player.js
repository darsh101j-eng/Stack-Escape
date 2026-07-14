// ============================================================================
// player.js — Stack Escape
// The climber: physics, input response, platform interaction hooks, death,
// and rendering (skin colors + trail + jump FX come from progression data).
// ============================================================================

class Player {
  constructor() {
    this.w = CONFIG.PLAYER.WIDTH;
    this.h = CONFIG.PLAYER.HEIGHT;
    this.reset();
  }

  reset() {
    this.x = CONFIG.WORLD_WIDTH / 2 - this.w / 2;
    this.y = CONFIG.GROUND_Y - this.h;
    this.vx = 0;
    this.vy = 0;
    this.onGround = true;
    this.groundPlatform = null;
    this.facing = 1;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.alive = true;
    this.minY = this.y;
    this.squashX = new SpringValue(1, 260, 15);
    this.squashY = new SpringValue(1, 260, 15);
    this.tilt = new SpringValue(0, 220, 14);
    this.trailAccum = 0;
    this.stepAccum = 0;
    this.deathTimer = 0;
    this.justLanded = false;
    this.justJumped = false;
    this.invulnTimer = 0;
    // True for the fall right after a breaking (cracked/breakable) platform
    // collapses under the player — while set, landing detection is skipped
    // so they fall straight through any platform below instead of quietly
    // touching down on it. Cleared the moment they jump under their own
    // power again.
    this.hazardFalling = false;
  }

  requestJump() { this.jumpBufferTimer = CONFIG.PHYSICS.JUMP_BUFFER; }

  die(reason) {
    if (!this.alive) return;
    this.alive = false;
    this.deathReason = reason;
    this.deathTimer = 0;
    this.vy = Math.min(this.vy, -200);
  }

  _updateDeath(dt) {
    this.deathTimer += dt;
    this.vy += CONFIG.PHYSICS.GRAVITY * dt;
    this.y += this.vy * dt;
    this.x += this.vx * dt;
    this.tilt.set(this.facing * 1.4);
    this.tilt.update(dt);
  }

  // world = { platforms }  mods = { speedBoost, superJump, shield }
  // Returns an object describing notable events this frame for game.js to react to.
  update(dt, input, mods, world) {
    const events = { landed: null, jumped: false, hitWall: false };
    if (!this.alive) { this._updateDeath(dt); return events; }

    const P = CONFIG.PHYSICS;
    const moveSpeed = mods.speedBoost ? P.MOVE_SPEED_BOOST : P.MOVE_SPEED;

    let inputX = 0;
    if (input.left) inputX -= 1;
    if (input.right) inputX += 1;
    if (inputX !== 0) this.facing = inputX;

    const onIce = this.onGround && this.groundPlatform && this.groundPlatform.type === 'ice';
    const lerpRate = onIce ? 0.045 : (this.onGround ? 0.4 : P.AIR_CONTROL * 0.32);
    this.vx = Utils.lerp(this.vx, inputX * moveSpeed, lerpRate);

    let conveyorPush = 0;
    if (this.onGround && this.groundPlatform && this.groundPlatform.type === 'conveyor') {
      conveyorPush = this.groundPlatform.direction * P.CONVEYOR_SPEED;
    }

    const prevX = this.x;
    this.x += (this.vx + conveyorPush) * dt;
    const minX = 6, maxX = CONFIG.WORLD_WIDTH - this.w - 6;
    if (this.x < minX) { this.x = minX; this.vx = 0; events.hitWall = true; }
    if (this.x > maxX) { this.x = maxX; this.vx = 0; events.hitWall = true; }

    // Gravity
    this.vy += P.GRAVITY * dt;
    if (this.vy > P.MAX_FALL_SPEED) this.vy = P.MAX_FALL_SPEED;

    const prevFeetY = this.y + this.h;
    this.y += this.vy * dt;

    if (this.onGround) this.coyoteTimer = 0; else this.coyoteTimer += dt;
    if (this.jumpBufferTimer > 0) this.jumpBufferTimer -= dt;

    // --- Landing detection (only while falling) ---------------------------
    this.onGround = false;
    const wasGroundedPlatform = this.groundPlatform;
    this.groundPlatform = null;

    if (this.vy >= 0 && !this.hazardFalling) {
      for (const plat of world.platforms) {
        if (!plat.solid()) continue;
        const feetY = this.y + this.h;
        if (this.x + this.w <= plat.x || this.x >= plat.x + plat.w) continue;
        if (prevFeetY <= plat.y + 8 && feetY >= plat.y) {
          this.y = plat.y - this.h;
          this.vy = 0;
          this.onGround = true;
          this.groundPlatform = plat;
          break;
        }
      }
    }

    if (this.groundPlatform && this.groundPlatform !== wasGroundedPlatform) {
      const forcedVy = plat_onLand(this.groundPlatform, this);
      events.landed = this.groundPlatform;
      if (forcedVy !== null) {
        this.vy = forcedVy;
        this.onGround = false;
        this.groundPlatform = null;
      } else {
        this.squashY.snap(0.62); this.squashX.snap(1.3);
        this.stepAccum = 0;
      }
    }

    // --- Jump execution -----------------------------------------------
    const canCoyoteJump = this.coyoteTimer <= P.COYOTE_TIME;
    if (this.jumpBufferTimer > 0 && (this.onGround || canCoyoteJump) && this.vy >= -50) {
      this.jumpBufferTimer = 0;
      this.coyoteTimer = P.COYOTE_TIME + 1;
      this.vy = mods.superJump ? P.SUPER_JUMP_VELOCITY : P.JUMP_VELOCITY;
      this.hazardFalling = false;
      this.onGround = false;
      this.groundPlatform = null;
      this.squashY.snap(1.45); this.squashX.snap(0.7);
      events.jumped = true;
    }

    this.minY = Math.min(this.minY, this.y);

    // --- Animation springs --------------------------------------------
    this.squashX.set(1); this.squashY.set(1);
    this.squashX.update(dt); this.squashY.update(dt);
    const targetTilt = Utils.clamp(this.vx / 260, -0.5, 0.5) + (inputX !== 0 ? 0 : 0);
    this.tilt.set(targetTilt);
    this.tilt.update(dt);

    if (this.onGround && Math.abs(this.vx + conveyorPush) > 15) {
      this.stepAccum += dt * (2.4 + Math.abs(this.vx) / 120);
    }

    return events;
  }

  getCenter() { return { x: this.x + this.w / 2, y: this.y + this.h / 2 }; }

  // --- Rendering ----------------------------------------------------------
  draw(ctx, skin, trailColor) {
    const cx = this.x + this.w / 2;
    const cy = this.y + this.h / 2;
    const sx = this.squashX.value, sy = this.squashY.value;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.tilt.value * 0.35);
    ctx.scale(sx, sy);

    // shadow-cast body
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 6;
    this._drawBody(ctx, skin);
    ctx.restore();

    this._drawFace(ctx, skin);
    ctx.restore();
  }

  _drawBody(ctx, skin) {
    const w = this.w, h = this.h;
    const r = w * 0.5;
    ctx.fillStyle = skin.body;
    ctx.beginPath();
    ctx.moveTo(-w / 2, h / 2 - r * 0.3);
    ctx.arcTo(-w / 2, -h / 2, 0, -h / 2, r);
    ctx.arcTo(w / 2, -h / 2, w / 2, h / 2 - r * 0.3, r);
    ctx.lineTo(w / 2, h / 2 - r * 0.3);
    ctx.quadraticCurveTo(w / 2, h / 2, w / 2 - r * 0.3, h / 2);
    ctx.lineTo(-w / 2 + r * 0.3, h / 2);
    ctx.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r * 0.3);
    ctx.closePath();
    ctx.fill();

    // belly accent stripe
    ctx.fillStyle = skin.accent;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.ellipse(0, h * 0.14, w * 0.32, h * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  _drawFace(ctx, skin) {
    const w = this.w, h = this.h;
    const lookX = this.facing * w * 0.06;
    ctx.fillStyle = skin.face;
    // eyes
    ctx.beginPath();
    ctx.ellipse(-w * 0.17 + lookX, -h * 0.06, w * 0.11, h * 0.13, 0, 0, Math.PI * 2);
    ctx.ellipse(w * 0.17 + lookX, -h * 0.06, w * 0.11, h * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.ellipse(-w * 0.14 + lookX, -h * 0.09, w * 0.035, h * 0.045, 0, 0, Math.PI * 2);
    ctx.ellipse(w * 0.2 + lookX, -h * 0.09, w * 0.035, h * 0.045, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Trail particles — call every frame from game.js (handles its own timing).
  emitTrail(trailColor, dt) {
    if (!trailColor) return;
    this.trailAccum += dt;
    const interval = this.onGround ? 0.09 : 0.045;
    if (this.trailAccum < interval) return;
    this.trailAccum = 0;
    Effects.burst(this.x + this.w / 2, this.y + this.h * 0.8, {
      count: 1, color: trailColor, speed: 20, size: 3.5, life: 0.5, gravity: -30, glow: true, spread: Math.PI * 0.6, angle: Math.PI / 2
    });
  }
}

// Applies a platform's landing behavior and returns a forced vertical
// velocity (e.g. spring launch) or null for a normal landing.
function plat_onLand(platform, player) {
  return platform.onPlayerLand(player);
}

if (typeof window !== 'undefined') window.Player = Player;
