// ============================================================================
// powerups.js — Stack Escape
// Everything the player can pick up: currency (coins/gems), combo boosters
// (stars), and the six powerup capsules — plus the manager that tracks which
// effects are currently active and exposes simple modifier flags to the rest
// of the game (player.js reads these as `mods`).
// ============================================================================

class Collectible {
  constructor(kind, x, y) {
    this.kind = kind; // 'coin' | 'gem' | 'star'
    this.x = x; this.y = y;
    this.r = kind === 'coin' ? 8 : (kind === 'gem' ? 9 : 10);
    this.bob = Math.random() * 10;
    this.dead = false;
    this.collected = false;
  }
  update(dt, dangerY) {
    this.bob += dt;
    if (this.y > dangerY + 280) this.dead = true;
  }
  hitbox() {
    const oy = Math.sin(this.bob * 3) * 3;
    return { x: this.x - this.r, y: this.y - this.r + oy, w: this.r * 2, h: this.r * 2 };
  }
  draw(ctx) {
    const oy = Math.sin(this.bob * 3) * 3;
    const spin = Math.sin(this.bob * 2.2);
    ctx.save();
    ctx.translate(this.x, this.y + oy);
    ctx.shadowBlur = 8;
    if (this.kind === 'coin') {
      ctx.shadowColor = '#ffd23f';
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath(); ctx.ellipse(0, 0, this.r * Math.abs(spin) * 0.6 + this.r * 0.4, this.r, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff6cf'; ctx.globalAlpha = 0.8;
      ctx.beginPath(); ctx.ellipse(-this.r * 0.15, -this.r * 0.2, this.r * 0.25, this.r * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    } else if (this.kind === 'gem') {
      ctx.shadowColor = '#4fd8ff';
      ctx.fillStyle = '#4fd8ff';
      ctx.beginPath();
      ctx.moveTo(0, -this.r); ctx.lineTo(this.r * 0.8, 0); ctx.lineTo(0, this.r); ctx.lineTo(-this.r * 0.8, 0);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath(); ctx.moveTo(0, -this.r * 0.6); ctx.lineTo(this.r * 0.35, 0); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill();
    } else {
      ctx.shadowColor = '#ffd23f';
      ctx.fillStyle = '#ffe98a';
      ctx.rotate(this.bob * 0.4);
      this._star(ctx, this.r);
    }
    ctx.restore();
  }
  _star(ctx, r) {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a1 = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
      const a2 = a1 + Math.PI / 5;
      ctx.lineTo(Math.cos(a1) * r, Math.sin(a1) * r);
      ctx.lineTo(Math.cos(a2) * r * 0.45, Math.sin(a2) * r * 0.45);
    }
    ctx.closePath(); ctx.fill();
  }
}

const POWERUP_ICON_COLOR = {
  shield: '#4fd8ff', doubleCoins: '#ffd23f', magnet: '#ff6b6b',
  slowMotion: '#b083ff', superJump: '#3ddc97', speedBoost: '#ff9a3d'
};

class PowerupPickup {
  constructor(kind, x, y) {
    this.kind = kind; this.x = x; this.y = y; this.r = 14;
    this.bob = Math.random() * 10; this.dead = false; this.collected = false;
  }
  update(dt, dangerY) {
    this.bob += dt;
    if (this.y > dangerY + 280) this.dead = true;
  }
  hitbox() {
    const oy = Math.sin(this.bob * 2.4) * 4;
    return { x: this.x - this.r, y: this.y - this.r + oy, w: this.r * 2, h: this.r * 2 };
  }
  draw(ctx) {
    const oy = Math.sin(this.bob * 2.4) * 4;
    const color = POWERUP_ICON_COLOR[this.kind] || '#fff';
    ctx.save();
    ctx.translate(this.x, this.y + oy);
    ctx.shadowColor = color; ctx.shadowBlur = 12;
    ctx.fillStyle = 'rgba(20,16,40,0.85)';
    ctx.beginPath(); ctx.arc(0, 0, this.r, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = color;
    ctx.beginPath(); ctx.arc(0, 0, this.r, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = color;
    PowerupIcons.draw(ctx, this.kind, this.r * 0.9);
    ctx.restore();
  }
}

// Small library of vector icons so powerups read clearly at a glance,
// reused by both the world pickup and the in-game HUD chips.
const PowerupIcons = {
  draw(ctx, kind, s) {
    ctx.save();
    switch (kind) {
      case 'shield':
        ctx.beginPath();
        ctx.moveTo(0, -s); ctx.lineTo(s * 0.8, -s * 0.4); ctx.lineTo(s * 0.8, s * 0.3);
        ctx.quadraticCurveTo(0, s, 0, s);
        ctx.quadraticCurveTo(0, s, -s * 0.8, s * 0.3);
        ctx.lineTo(-s * 0.8, -s * 0.4); ctx.closePath(); ctx.fill();
        break;
      case 'doubleCoins':
        ctx.beginPath(); ctx.arc(-s * 0.25, 0, s * 0.55, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.75;
        ctx.beginPath(); ctx.arc(s * 0.25, 0, s * 0.55, 0, Math.PI * 2); ctx.fill();
        break;
      case 'magnet':
        ctx.lineWidth = s * 0.35; ctx.strokeStyle = ctx.fillStyle; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(0, s * 0.1, s * 0.55, Math.PI, Math.PI * 2, false); ctx.stroke();
        ctx.fillRect(-s * 0.55 - 1, s * 0.1, s * 0.32, s * 0.5);
        ctx.fillRect(s * 0.55 - s * 0.32 + 1, s * 0.1, s * 0.32, s * 0.5);
        break;
      case 'slowMotion':
        ctx.beginPath(); ctx.arc(0, 0, s * 0.6, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(20,16,40,0.85)'; ctx.lineWidth = s * 0.14;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -s * 0.4); ctx.moveTo(0, 0); ctx.lineTo(s * 0.3, s * 0.15); ctx.stroke();
        break;
      case 'superJump':
        ctx.beginPath();
        ctx.moveTo(0, -s); ctx.lineTo(s * 0.7, s * 0.3); ctx.lineTo(s * 0.25, s * 0.3);
        ctx.lineTo(s * 0.25, s); ctx.lineTo(-s * 0.25, s); ctx.lineTo(-s * 0.25, s * 0.3);
        ctx.lineTo(-s * 0.7, s * 0.3); ctx.closePath(); ctx.fill();
        break;
      case 'speedBoost':
        ctx.beginPath();
        ctx.moveTo(-s * 0.7, -s * 0.5); ctx.lineTo(s * 0.5, -s * 0.5); ctx.lineTo(-s * 0.1, 0);
        ctx.lineTo(s * 0.5, 0); ctx.lineTo(-s * 0.7, s * 0.6); ctx.lineTo(-s * 0.1, s * 0.05); ctx.lineTo(-s * 0.7, s * 0.05);
        ctx.closePath(); ctx.fill();
        break;
    }
    ctx.restore();
  }
};

const PickupFactory = {
  createCollectible(kind, x, y) { return new Collectible(kind, x, y); },
  createPowerup(kind, x, y) { return new PowerupPickup(kind, x, y); },
  pickPowerupKind() { return Utils.weightedPick(CONFIG.POWERUP_TABLE); }
};

// ---------------------------------------------------------------------------
// PowerupManager — tracks active timed effects and exposes flat modifiers.
// ---------------------------------------------------------------------------
const PowerupManager = {
  active: {},
  hasShield: false,

  reset() { this.active = {}; this.hasShield = false; },

  activate(kind) {
    if (kind === 'shield') {
      this.hasShield = true;
    } else {
      this.active[kind] = CONFIG.POWERUP.DURATION[kind];
    }
    SoundManager.playPowerup(kind);
  },

  consumeShield() {
    if (!this.hasShield) return false;
    this.hasShield = false;
    return true;
  },

  update(dt) {
    for (const k of Object.keys(this.active)) {
      this.active[k] -= dt;
      if (this.active[k] <= 0) delete this.active[k];
    }
  },

  isActive(kind) { return !!this.active[kind]; },

  getMods() {
    return {
      speedBoost: this.isActive('speedBoost'),
      superJump: this.isActive('superJump'),
      shield: this.hasShield,
      doubleCoins: this.isActive('doubleCoins'),
      magnet: this.isActive('magnet'),
      slowMotion: this.isActive('slowMotion')
    };
  },

  // For HUD chips: array of { kind, frac } where frac is remaining life (0..1).
  getHudList() {
    const list = Object.keys(this.active).map(k => ({
      kind: k, frac: Utils.clamp(this.active[k] / CONFIG.POWERUP.DURATION[k], 0, 1)
    }));
    if (this.hasShield) list.unshift({ kind: 'shield', frac: 1 });
    return list;
  },

  // Pulls nearby collectibles toward the player when magnet is active.
  applyMagnet(player, collectibles, dt) {
    if (!this.isActive('magnet')) return;
    const center = player.getCenter();
    const radius = CONFIG.POWERUP.MAGNET_RADIUS;
    for (const c of collectibles) {
      if (c.collected || c.dead || c.kind === undefined) continue;
      const d = Utils.dist(c.x, c.y, center.x, center.y);
      if (d < radius && d > 1) {
        const pull = (1 - d / radius) * 620;
        c.x += ((center.x - c.x) / d) * pull * dt;
        c.y += ((center.y - c.y) / d) * pull * dt;
      }
    }
  }
};

if (typeof window !== 'undefined') {
  window.Collectible = Collectible;
  window.PowerupPickup = PowerupPickup;
  window.PowerupIcons = PowerupIcons;
  window.PickupFactory = PickupFactory;
  window.PowerupManager = PowerupManager;
}
