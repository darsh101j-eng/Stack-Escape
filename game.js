// ============================================================================
// game.js — Stack Escape
// Orchestrates everything: canvas + input setup, the state machine (menu /
// playing / paused / gameover), procedural band spawning, the per-frame
// update (physics, collisions, combo, missions, danger floor, camera) and
// rendering. Talks to UI for all DOM screens/HUD.
// ============================================================================

const POWERUP_LABEL = {
  shield: 'Shield!', doubleCoins: '2x Coins!', magnet: 'Magnet!',
  slowMotion: 'Slow-Mo!', superJump: 'Super Jump!', speedBoost: 'Speed Boost!'
};

const Game = {
  state: 'menu', // 'menu' | 'playing' | 'paused' | 'gameover'

  // --- Boot -----------------------------------------------------------
  boot() {
    Storage.load();
    UI.init();
    this.setupCanvas();
    this.resizeStage();
    window.addEventListener('resize', () => this.resizeStage());
    window.addEventListener('orientationchange', () => this.resizeStage());

    this.player = new Player();
    this.platforms = []; this.obstacles = []; this.collectibles = []; this.powerupPickups = [];
    this.camera = { y: 0 };
    this.input = { left: false, right: false };
    this.bgTime = 0;
    this.clouds = null;

    this.setupInput();
    UI.renderMenuStats();
    UI.showScreen('menu');

    this._loopBound = this.loop.bind(this);
    requestAnimationFrame(this._loopBound);

    if (Storage.isDailyAvailable()) setTimeout(() => UI.openDaily(), 600);
  },

  setupCanvas() {
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.pixelScale = dpr;
    this.canvas.width = Math.round(CONFIG.WORLD_WIDTH * dpr);
    this.canvas.height = Math.round(CONFIG.VIEW_HEIGHT * dpr);
  },

  resizeStage() {
    const wrap = document.getElementById('canvas-wrap');
    const vw = window.innerWidth, vh = window.innerHeight;
    const ratio = CONFIG.WORLD_WIDTH / CONFIG.VIEW_HEIGHT;
    let w = vw, h = vw / ratio;
    if (h > vh) { h = vh; w = vh * ratio; }
    wrap.style.width = `${Math.round(w)}px`;
    wrap.style.height = `${Math.round(h)}px`;
  },

  // --- Input ------------------------------------------------------------
  setupInput() {
    window.addEventListener('keydown', e => {
      if (e.repeat) return;
      if (['ArrowLeft', 'KeyA'].includes(e.code)) this.input.left = true;
      if (['ArrowRight', 'KeyD'].includes(e.code)) this.input.right = true;
      if (['Space', 'ArrowUp', 'KeyW'].includes(e.code)) { e.preventDefault(); this.player.requestJump(); }
      if (e.code === 'Escape') {
        if (this.state === 'playing') this.pauseGame();
        else if (this.state === 'paused') this.resumeGame();
      }
    });
    window.addEventListener('keyup', e => {
      if (['ArrowLeft', 'KeyA'].includes(e.code)) this.input.left = false;
      if (['ArrowRight', 'KeyD'].includes(e.code)) this.input.right = false;
    });

    const wrap = document.getElementById('canvas-wrap');

let activeSide = null;

const updateInput = (x, y, pressed) => {
    const rect = wrap.getBoundingClientRect();

    const relX = (x - rect.left) / rect.width;
    const relY = (y - rect.top) / rect.height;

    // Only use the bottom 30% for mobile controls
    if (relY < 0.70) {
        this.input.left = false;
        this.input.right = false;
        activeSide = null;
        return;
    }

    // Left 30%
    if (relX < 0.30) {
        this.input.left = pressed;
        this.input.right = false;
        activeSide = "left";
    }

    // Right 30%
    else if (relX > 0.70) {
        this.input.right = pressed;
        this.input.left = false;
        activeSide = "right";
    }

    // Middle 40%
    else {
        this.input.left = false;
        this.input.right = false;

        if (pressed) {
            this.player.requestJump();
        }

        activeSide = null;
    }
};

// Mobile
wrap.addEventListener("touchstart", e => {
    e.preventDefault();
    const t = e.changedTouches[0];
    updateInput(t.clientX, t.clientY, true);
}, { passive:false });

wrap.addEventListener("touchmove", e => {
    e.preventDefault();
    const t = e.changedTouches[0];
    updateInput(t.clientX, t.clientY, true);
}, { passive:false });

wrap.addEventListener("touchend", e => {
    e.preventDefault();
    this.input.left = false;
    this.input.right = false;
    activeSide = null;
}, { passive:false });

wrap.addEventListener("touchcancel", e => {
    e.preventDefault();
    this.input.left = false;
    this.input.right = false;
    activeSide = null;
}, { passive:false });

// Desktop mouse (unchanged behaviour)
wrap.addEventListener("mousedown", e => {
    updateInput(e.clientX, e.clientY, true);
});

window.addEventListener("mousemove", e => {
    if (e.buttons) {
        updateInput(e.clientX, e.clientY, true);
    }
});

window.addEventListener("mouseup", () => {
    this.input.left = false;
    this.input.right = false;
    activeSide = null;
});
  },    
  // --- State transitions ------------------------------------------------
  startGame() {
    SoundManager.init(); SoundManager.resume();
    this.resetRunState();
    this.state = 'playing';
    document.body.classList.add('in-game');
    UI.hideAllScreens();
    if (Storage.get().settings.music) SoundManager.startMusic();
  },

  pauseGame() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    UI.showScreen('pause');
  },

  resumeGame() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    UI.hideAllScreens();
  },

  restartGame() {
    SoundManager.init(); SoundManager.resume();
    this.resetRunState();
    this.state = 'playing';
    document.body.classList.add('in-game');
    UI.hideAllScreens();
    if (Storage.get().settings.music) SoundManager.startMusic();
  },

  goToMenu() {
    this.state = 'menu';
    document.body.classList.remove('in-game');
    SoundManager.stopMusic();
    UI.renderMenuStats();
    UI.showScreen('menu');
  },

  resetRunState() {
    this.player.reset();
    this.platforms = [new Platform('normal', CONFIG.WORLD_WIDTH / 2 - 55, CONFIG.GROUND_Y, 110)];
    this.obstacles = [];
    this.collectibles = [];
    this.powerupPickups = [];
    this.lastPlatformX = CONFIG.WORLD_WIDTH / 2;
    this.highestGeneratedY = CONFIG.GROUND_Y;
    this.camera.y = -(CONFIG.VIEW_HEIGHT - 140);
    this.dangerY = 220;
    this.runTime = 0;
    this.lastMinY = this.player.minY;
    this.noProgressTimer = 0;
    this.comboCount = 0; this.comboMultiplier = 1; this.comboTimer = 0;
    this.runStats = { coinsThisRun: 0, floorThisRun: 0, timeThisRun: 0, powerupsThisRun: 0, gemsThisRun: 0, bestComboThisRun: 1, score: 0 };
    this.missionCheckTimer = 0;
    this.deathAnimTimer = 0;
    PowerupManager.reset();
    Effects.reset();
    Storage.ensureDailyMissions();
    this.ensureGeneration();
  },

  // --- Procedural generation --------------------------------------------
  currentFloor() {
    return Math.max(0, Math.floor((CONFIG.GROUND_Y - this.player.minY) / CONFIG.FLOOR_HEIGHT));
  },

  ensureGeneration() {
    const targetTop = this.camera.y - 260;
    let guard = 0;
    while (this.highestGeneratedY > targetTop && guard++ < 200) this.spawnBand();
  },

  spawnBand() {
    const floor = Math.max(0, Math.floor((CONFIG.GROUND_Y - this.highestGeneratedY) / CONFIG.FLOOR_HEIGHT));
    const diff = CONFIG.difficultyForFloor(floor);
    const gap = Utils.randRange(diff.gapMin, diff.gapMax);
    this.highestGeneratedY -= gap;

    const type = PlatformFactory.pickType(floor);
    const x = Utils.clamp(this.lastPlatformX + Utils.randRange(-diff.xJitter, diff.xJitter), 10, CONFIG.WORLD_WIDTH - 90);
    const plat = PlatformFactory.create(type, x, this.highestGeneratedY);
    this.lastPlatformX = plat.x + plat.w / 2;
    this.platforms.push(plat);

    if (floor > 0 && Utils.chance(diff.obstacleChance)) {
      const oType = ObstacleFactory.pickType(floor);
      this.spawnObstacleNear(plat, oType);
    }

    if (Utils.chance(0.55)) {
      let kind = 'coin';
      if (Utils.chance(0.08)) kind = 'gem';
      else if (Utils.chance(0.06)) kind = 'star';
      this.collectibles.push(PickupFactory.createCollectible(kind, plat.x + plat.w / 2, plat.y - 24));
    }

    if (Utils.chance(diff.powerupChance)) {
      const kind = PickupFactory.pickPowerupKind();
      this.powerupPickups.push(PickupFactory.createPowerup(kind, plat.x + plat.w / 2, plat.y - 42));
    }
  },

  spawnObstacleNear(plat, type) {
    const W = CONFIG.WORLD_WIDTH;
    switch (type) {
      case 'spikes':
      case 'fire': {
        const w = type === 'fire' ? 28 : 34;
        const margin = 8;
        const leftSpace = plat.x - margin;
        const rightSpace = W - (plat.x + plat.w) - margin;
        let x;
        if (leftSpace > w && (rightSpace <= w || Utils.chance(0.5))) x = Utils.randRange(margin, Math.max(margin, plat.x - w - margin));
        else x = Utils.randRange(plat.x + plat.w + margin, Math.max(plat.x + plat.w + margin, W - w - margin));
        x = Utils.clamp(x, 4, W - w - 4);
        const y = plat.y - (type === 'fire' ? 34 : 14);
        this.obstacles.push(ObstacleFactory.create(type, x, y, { w }));
        break;
      }
      case 'rock': {
        const y = plat.y - Utils.randRange(34, 56);
        const x = Utils.randRange(20, W - 20);
        this.obstacles.push(ObstacleFactory.create('rock', x, y));
        break;
      }
      case 'hammer': {
        const x = Utils.clamp(plat.x + plat.w / 2 + Utils.randRange(-50, 50), 45, W - 45);
        const y = plat.y - Utils.randRange(55, 85);
        this.obstacles.push(ObstacleFactory.create('hammer', x, y, { ropeLen: Utils.randRange(45, 70) }));
        break;
      }
      case 'drone': {
        const y = plat.y - Utils.randRange(48, 75);
        const x = Utils.randRange(30, W - 30);
        this.obstacles.push(ObstacleFactory.create('drone', x, y, { xMin: 20, xMax: W - 20 }));
        break;
      }
      case 'laser': {
        const y = plat.y - Utils.randRange(36, 58);
        this.obstacles.push(ObstacleFactory.create('laser', 20, y, { laserW: W - 40 }));
        break;
      }
      case 'debris': {
        const x = Utils.randRange(20, W - 20);
        const y = plat.y - 260;
        this.obstacles.push(ObstacleFactory.create('debris', x, y));
        break;
      }
    }
  },

  // --- Per-frame update ---------------------------------------------------
  updateGameplay(dt, rawDt) {
    const mods = PowerupManager.getMods();
    const worldDt = dt * (mods.slowMotion ? CONFIG.POWERUP.SLOW_FACTOR : 1);

    if (this.player.invulnTimer > 0) this.player.invulnTimer -= dt;

    const events = this.player.update(dt, this.input, mods, { platforms: this.platforms });

    if (events.jumped) {
      SoundManager[mods.superJump ? 'playSuperJump' : 'playJump']();
      Effects.burst(this.player.x + this.player.w / 2, this.player.y + this.player.h, {
        count: 9, color: this.getSelectedJumpColor(), speed: 90, size: 4, life: 0.35, gravity: 220, spread: Math.PI * 0.9, angle: Math.PI / 2
      });
    }
    if (events.landed) this.registerLanding();

    this.player.emitTrail(this.getSelectedTrailColor(), dt);

    for (const p of this.platforms) p.update(worldDt, this.dangerY);
    for (const o of this.obstacles) o.update(worldDt, this.dangerY);
    for (const c of this.collectibles) c.update(worldDt, this.dangerY);
    for (const pu of this.powerupPickups) pu.update(worldDt, this.dangerY);

    PowerupManager.applyMagnet(this.player, this.collectibles, dt);
    PowerupManager.update(dt);

    this.runTime += dt;
    if (this.runTime > CONFIG.DANGER.START_DELAY) {
      const diff = CONFIG.difficultyForFloor(this.currentFloor());
      let rise = diff.riseSpeed;
      this.noProgressTimer = (this.player.minY < this.lastMinY - 1) ? 0 : this.noProgressTimer + dt;
      if (this.noProgressTimer > 3) rise *= CONFIG.DANGER.CATCHUP_BONUS;
      this.dangerY -= rise * worldDt;
    }
    this.lastMinY = this.player.minY;

    if (this.player.alive && !(this.player.invulnTimer > 0)) {
      const box = { x: this.player.x + 4, y: this.player.y + 4, w: this.player.w - 8, h: this.player.h - 8 };
      for (const o of this.obstacles) {
        if (o.dead) continue;
        if (o.hits(box)) { this.handleHazardHit(o); break; }
      }
    }

    if (this.player.alive) {
      const box = { x: this.player.x, y: this.player.y, w: this.player.w, h: this.player.h };
      for (const c of this.collectibles) {
        if (c.dead || c.collected) continue;
        if (Utils.aabbOverlap(box, c.hitbox())) this.collect(c);
      }
      for (const pu of this.powerupPickups) {
        if (pu.dead || pu.collected) continue;
        if (Utils.aabbOverlap(box, pu.hitbox())) this.collectPowerup(pu);
      }
    }

    if (this.comboCount > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) { this.comboCount = 0; this.updateComboMultiplier(); }
    }

    if (this.player.alive) {
      if (this.player.y + this.player.h >= this.dangerY) this.handleDeath('crushed');
      else if (this.player.y > this.camera.y + CONFIG.VIEW_HEIGHT + 60) this.handleDeath('fell');
    } else {
      this.deathAnimTimer += dt;
      if (this.deathAnimTimer > 0.9 && this.state === 'playing') this.finalizeRun();
    }

    this.updateCamera(dt);
    this.ensureGeneration();
    this.cleanup();
    Effects.update(dt);

    this.missionCheckTimer += dt;
    if (this.missionCheckTimer > 0.5) {
      this.missionCheckTimer = 0;
      this.runStats.timeThisRun = this.runTime;
      this.runStats.floorThisRun = this.currentFloor();
      if (Storage.updateMissionProgress(this.runStats)) {
        UI.flashMissionToast('Mission complete!');
        SoundManager.playUnlock();
      }
    }

    UI.updateHUD({
      floor: this.currentFloor(),
      coins: this.runStats.coinsThisRun,
      comboMultiplier: this.comboMultiplier,
      comboFrac: this.comboCount > 0 ? Utils.clamp(this.comboTimer / CONFIG.COMBO.WINDOW, 0, 1) : 0,
      seconds: this.runTime,
      powerups: PowerupManager.getHudList()
    });
  },

  updateCamera(dt) {
    const targetY = this.player.y - CONFIG.VIEW_HEIGHT * 0.62;
    const damped = Utils.damp(this.camera.y, targetY, 6, dt);
    this.camera.y = Math.min(this.camera.y, damped);
  },

  cleanup() {
    this.platforms = this.platforms.filter(p => !p.dead);
    this.obstacles = this.obstacles.filter(o => !o.dead);
    this.collectibles = this.collectibles.filter(c => !c.dead);
    this.powerupPickups = this.powerupPickups.filter(p => !p.dead);
  },

  registerLanding() {
    this.comboCount++;
    this.comboTimer = CONFIG.COMBO.WINDOW;
    const prevMult = this.comboMultiplier;
    this.updateComboMultiplier();
    if (this.comboMultiplier > prevMult) {
      Effects.floatText(this.player.x + this.player.w / 2, this.player.y - 10, `x${this.comboMultiplier.toFixed(1)} combo!`, { color: '#ffd23f', size: 15 });
      SoundManager.playCombo();
    }
    this.runStats.bestComboThisRun = Math.max(this.runStats.bestComboThisRun, this.comboMultiplier);
  },

  updateComboMultiplier() {
    const tier = Math.floor(this.comboCount / CONFIG.COMBO.PER_TIER);
    this.comboMultiplier = Math.min(CONFIG.COMBO.BASE_MULTIPLIER + tier * CONFIG.COMBO.STEP, CONFIG.COMBO.MAX_MULTIPLIER);
  },

  collect(c) {
    c.collected = true; c.dead = true;
    const mods = PowerupManager.getMods();
    const mult = mods.doubleCoins ? 2 : 1;
    if (c.kind === 'coin') {
      const amount = Math.max(1, Math.round(CONFIG.COLLECTIBLE.COIN_VALUE * this.comboMultiplier * mult));
      this.runStats.coinsThisRun += amount;
      Effects.floatText(c.x, c.y, `+${amount}`, { color: '#ffd23f' });
      Effects.sparkle(c.x, c.y, '#ffd23f');
      SoundManager.playCoin();
    } else if (c.kind === 'gem') {
      const amount = Math.max(1, Math.round(CONFIG.COLLECTIBLE.GEM_VALUE * this.comboMultiplier * mult));
      this.runStats.coinsThisRun += amount;
      this.runStats.gemsThisRun++;
      Effects.floatText(c.x, c.y, `+${amount}`, { color: '#4fd8ff' });
      Effects.sparkle(c.x, c.y, '#4fd8ff');
      SoundManager.playGem();
    } else {
      this.comboCount += CONFIG.COLLECTIBLE.STAR_COMBO_BOOST;
      this.comboTimer = CONFIG.COMBO.WINDOW;
      this.updateComboMultiplier();
      Effects.floatText(c.x, c.y, 'Combo!', { color: '#ffe98a' });
      Effects.sparkle(c.x, c.y, '#ffe98a');
      SoundManager.playStar();
    }
  },

  collectPowerup(pu) {
    pu.collected = true; pu.dead = true;
    PowerupManager.activate(pu.kind);
    this.runStats.powerupsThisRun++;
    const color = POWERUP_ICON_COLOR[pu.kind] || '#fff';
    Effects.floatText(pu.x, pu.y, POWERUP_LABEL[pu.kind] || 'Power up!', { color });
    Effects.burst(pu.x, pu.y, { count: 14, color, speed: 160, size: 4, life: 0.4, glow: true });
  },

  handleHazardHit(obstacle) {
    if (PowerupManager.consumeShield()) {
      Effects.burst(this.player.x + this.player.w / 2, this.player.y + this.player.h / 2, { count: 14, color: '#4fd8ff', speed: 180, size: 4, life: 0.4, glow: true });
      Effects.addShake(0.35);
      SoundManager.playShieldHit();
      if (obstacle.type === 'rock' || obstacle.type === 'debris') obstacle.dead = true;
      this.player.invulnTimer = 0.6;
    } else {
      this.handleDeath('obstacle');
    }
  },

  handleDeath(reason) {
    if (!this.player.alive) return;
    this.player.die(reason);
    this.deathAnimTimer = 0;
    Effects.addShake(0.9);
    Effects.triggerHitStop(0.07);
    Effects.flash(reason === 'crushed' ? '#ff3d81' : '#1b1330', 0.55);
    Effects.explosionBurst(this.player.x + this.player.w / 2, this.player.y + this.player.h / 2);
    SoundManager.playExplosion();
    SoundManager.stopMusic();
  },

  finalizeRun() {
    this.state = 'gameover';
    document.body.classList.remove('in-game');
    this.runStats.floorThisRun = this.currentFloor();
    this.runStats.timeThisRun = this.runTime;
    this.runStats.score = this.runStats.floorThisRun * 12 + this.runStats.coinsThisRun;
    Storage.updateMissionProgress(this.runStats);
    const best = Storage.submitRunResult({
      score: this.runStats.score, floor: this.runStats.floorThisRun,
      combo: this.runStats.bestComboThisRun, coinsCollected: this.runStats.coinsThisRun, seconds: this.runTime
    });
    Storage.addCoins(this.runStats.coinsThisRun);
    SoundManager.playGameOver();
    UI.populateGameOver(this.runStats, best);
    UI.showScreen('gameover');
  },

  // --- Selected progression lookups --------------------------------------
  getSelectedSkin() {
    const id = Storage.get().selected.skin;
    return CONFIG.SKINS.find(s => s.id === id) || CONFIG.SKINS[0];
  },
  getSelectedTrailColor() {
    const id = Storage.get().selected.trail;
    const t = CONFIG.TRAILS.find(t => t.id === id);
    return t ? t.color : null;
  },
  getSelectedJumpColor() {
    const id = Storage.get().selected.jumpFx;
    const j = CONFIG.JUMP_FX.find(j => j.id === id);
    return j ? j.color : '#ffffff';
  },
  getSelectedTheme() {
    const id = Storage.get().selected.theme;
    return CONFIG.THEMES.find(t => t.id === id) || CONFIG.THEMES[0];
  },

  // --- Main loop --------------------------------------------------------
  loop(now) {
    requestAnimationFrame(this._loopBound);
    if (!this.lastTime) this.lastTime = now;
    let rawDt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    rawDt = Math.min(rawDt, 0.05);
    this.bgTime += rawDt;

    if (this.state === 'playing') {
      const timeScale = Effects.consumeHitStop(rawDt);
      const dt = rawDt * timeScale;
      this.updateGameplay(dt, rawDt);
    }
    this.render();
  },

  // --- Rendering ----------------------------------------------------------
  render() {
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(this.pixelScale, 0, 0, this.pixelScale, 0, 0);
    ctx.clearRect(0, 0, CONFIG.WORLD_WIDTH, CONFIG.VIEW_HEIGHT);

    const active = this.state === 'playing' || this.state === 'paused' || this.state === 'gameover';
    const shake = active ? Effects.getShakeOffset() : { x: 0, y: 0, rot: 0 };

    ctx.save();
    ctx.translate(shake.x, shake.y);
    ctx.rotate(shake.rot);

    this.drawBackground();

    if (active) {
      ctx.save();
      ctx.translate(0, -this.camera.y);
      this.drawTowerWalls();
      this.drawDangerFloor();
      for (const p of this.platforms) p.draw(ctx);
      for (const o of this.obstacles) o.draw(ctx);
      for (const c of this.collectibles) c.draw(ctx);
      for (const pu of this.powerupPickups) pu.draw(ctx);
      Effects.drawParticles(ctx);
      if (this.player.alive || this.player.deathTimer < 1.2) {
        this.player.draw(ctx, this.getSelectedSkin());
      }
      Effects.drawFloatingTexts(ctx);
      ctx.restore();
    }

    ctx.restore(); // pop shake

    Effects.drawFlash(ctx, CONFIG.WORLD_WIDTH, CONFIG.VIEW_HEIGHT);
    ctx.restore(); // pop pixelScale
  },

  drawBackground() {
    const ctx = this.ctx;
    const theme = this.getSelectedTheme();
    const g = ctx.createLinearGradient(0, 0, 0, CONFIG.VIEW_HEIGHT);
    g.addColorStop(0, theme.sky[0]); g.addColorStop(0.55, theme.sky[1]); g.addColorStop(1, theme.sky[2]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CONFIG.WORLD_WIDTH, CONFIG.VIEW_HEIGHT);

    if (!this.clouds) {
      this.clouds = Array.from({ length: 8 }, (_, i) => ({
        x: Math.random() * CONFIG.WORLD_WIDTH,
        y: 40 + Math.random() * (CONFIG.VIEW_HEIGHT - 80),
        r: Utils.randRange(24, 48),
        speed: Utils.randRange(6, 16) * (i % 2 === 0 ? 1 : -1),
        alpha: Utils.randRange(0.16, 0.36)
      }));
    }
    for (const c of this.clouds) {
      let x = (c.x + this.bgTime * c.speed) % (CONFIG.WORLD_WIDTH + 140);
      if (x < 0) x += CONFIG.WORLD_WIDTH + 140;
      x -= 70;
      ctx.globalAlpha = c.alpha;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(x, c.y, c.r, c.r * 0.45, 0, 0, Math.PI * 2);
      ctx.ellipse(x + c.r * 0.5, c.y + 4, c.r * 0.6, c.r * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  },

  drawTowerWalls() {
    const ctx = this.ctx;
    const topY = this.camera.y - 40, botY = this.camera.y + CONFIG.VIEW_HEIGHT + 320;
    const wallW = 14;
    ctx.fillStyle = 'rgba(10,6,26,0.55)';
    ctx.fillRect(-wallW, topY, wallW, botY - topY);
    ctx.fillRect(CONFIG.WORLD_WIDTH, topY, wallW, botY - topY);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    const step = 40;
    const start = Math.floor(topY / step) * step;
    for (let y = start; y < botY; y += step) {
      ctx.beginPath(); ctx.moveTo(-wallW, y); ctx.lineTo(0, y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(CONFIG.WORLD_WIDTH, y); ctx.lineTo(CONFIG.WORLD_WIDTH + wallW, y); ctx.stroke();
    }
  },

  drawDangerFloor() {
    const ctx = this.ctx;
    const y = this.dangerY;
    const bottom = y + 420;
    const grad = ctx.createLinearGradient(0, y - 30, 0, y + 40);
    grad.addColorStop(0, 'rgba(255,61,129,0)');
    grad.addColorStop(0.5, 'rgba(255,61,129,0.85)');
    grad.addColorStop(1, '#ff3d81');
    ctx.fillStyle = grad;
    ctx.fillRect(0, y - 30, CONFIG.WORLD_WIDTH, bottom - (y - 30));

    ctx.save();
    ctx.shadowColor = '#ff3d81'; ctx.shadowBlur = 20;
    ctx.fillStyle = '#ffdce8';
    ctx.fillRect(0, y - 4, CONFIG.WORLD_WIDTH, 4);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#ffffff';
    const stripeW = 26, offset = (this.bgTime * 40) % (stripeW * 2);
    for (let x = -stripeW * 2 + offset; x < CONFIG.WORLD_WIDTH + stripeW; x += stripeW * 2) {
      ctx.beginPath();
      ctx.moveTo(x, y + 6); ctx.lineTo(x + stripeW, y + 6); ctx.lineTo(x + stripeW * 0.5, y + 18);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();

    if (this.state === 'playing' && Utils.chance(0.3)) {
      Effects.burst(Utils.randRange(0, CONFIG.WORLD_WIDTH), y, {
        count: 1, color: ['#ffd23f', '#ffffff'], speed: 60, size: 2, life: 0.4, gravity: -40, spread: Math.PI, angle: -Math.PI / 2, glow: true
      });
    }
  }
};

if (typeof window !== 'undefined') {
  window.Game = Game;
  window.addEventListener('DOMContentLoaded', () => Game.boot());
}
