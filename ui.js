// ============================================================================
// ui.js — Stack Escape
// Every DOM screen and the gameplay HUD. Canvas only ever draws the game
// world; menus, shop, missions and popups are real DOM so they can use CSS
// transitions, focus states and text layout for free.
// Talks to gameplay through the global `Game` object (game.js), and reads/
// writes progression through `Storage` + `CONFIG` directly.
// ============================================================================

const UI = {
  el: {},
  activeShopTab: 'skins',

  init() {
    const $ = id => document.getElementById(id);
    this.el = {
      hud: $('hud'),
      hudFloor: $('hud-floor'),
      hudCoins: $('hud-coins'),
      hudCombo: $('hud-combo'),
      hudComboBar: $('hud-combo-bar'),
      hudTimer: $('hud-timer'),
      hudPowerups: $('hud-powerups'),
      missionToast: $('mission-toast'),

      screens: {
        menu: $('screen-menu'),
        pause: $('screen-pause'),
        gameover: $('screen-gameover'),
        shop: $('screen-shop'),
        missions: $('screen-missions')
      },
      modalSettings: $('modal-settings'),
      popupDaily: $('popup-daily'),

      menuBestScore: $('menu-best-score'),
      menuBestFloor: $('menu-best-floor'),
      menuCoins: $('menu-coins'),
      dailyBadge: $('daily-badge'),

      goScore: $('go-score'),
      goFloor: $('go-floor'),
      goCoins: $('go-coins'),
      goCombo: $('go-combo'),
      goNewBest: $('go-newbest'),
      goMissionNote: $('go-mission-note'),

      shopCoins: $('shop-coins'),
      shopGrid: $('shop-grid'),
      shopTabs: document.querySelectorAll('.shop-tab'),

      missionsList: $('missions-list'),

      toggleSfx: $('toggle-sfx'),
      toggleMusic: $('toggle-music'),

      dailyStreakText: $('daily-streak-text'),
      dailyRewardAmount: $('daily-reward-amount')
    };

    this._bindStatic();
    this.refreshSettingsToggles();
  },

  _bindStatic() {
    const on = (id, fn) => { const e = document.getElementById(id); if (e) e.addEventListener('click', fn); };

    on('btn-play', () => Game.startGame());
    on('btn-open-shop', () => this.openShop());
    on('btn-close-shop', () => this.showScreen('menu'));
    on('btn-open-missions', () => this.openMissions());
    on('btn-close-missions', () => this.showScreen('menu'));
    on('btn-open-settings', () => this.toggleSettings(true));
    on('btn-close-settings', () => this.toggleSettings(false));
    on('btn-daily', () => this.openDaily());
    on('btn-claim-daily', () => this.claimDaily());

    on('btn-pause', () => Game.pauseGame());
    on('btn-resume', () => Game.resumeGame());
    on('btn-restart-from-pause', () => Game.restartGame());
    on('btn-home-from-pause', () => Game.goToMenu());

    on('btn-retry', () => Game.restartGame());
    on('btn-home-from-gameover', () => Game.goToMenu());
    on('btn-gameover-shop', () => this.openShop());

    on('toggle-sfx', () => {
      const v = Storage.toggleSetting('sfx');
      SoundManager.setSfxEnabled(v);
      this.refreshSettingsToggles();
      SoundManager.playClick();
    });
    on('toggle-music', () => {
      const v = Storage.toggleSetting('music');
      SoundManager.setMusicEnabled(v);
      this.refreshSettingsToggles();
      SoundManager.playClick();
    });
    on('btn-reset-progress', () => {
      if (confirm('Reset all progress? Coins, unlocks and best scores will be lost.')) {
        Storage.resetAll();
        this.renderMenuStats();
        this.refreshSettingsToggles();
      }
    });

    this.el.shopTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        this.activeShopTab = tab.dataset.tab;
        this.el.shopTabs.forEach(t => t.classList.toggle('active', t === tab));
        this.renderShopGrid();
        SoundManager.playClick();
      });
    });

    // Any button press gives a tiny satisfying click sound + unlocks audio.
    document.querySelectorAll('button').forEach(b => {
      b.addEventListener('pointerdown', () => { SoundManager.init(); SoundManager.resume(); });
    });
  },

  showScreen(name) {
    Object.entries(this.el.screens).forEach(([key, node]) => {
      if (!node) return;
      node.classList.toggle('hidden', key !== name);
    });
  },

  hideAllScreens() {
    Object.values(this.el.screens).forEach(node => node && node.classList.add('hidden'));
  },

  // --- Main menu -----------------------------------------------------
  renderMenuStats() {
    const d = Storage.get();
    this.el.menuBestScore.textContent = Utils.formatNumber(d.bestScore);
    this.el.menuBestFloor.textContent = d.bestFloor;
    this.el.menuCoins.textContent = Utils.formatNumber(d.coins);
    this.el.dailyBadge.classList.toggle('hidden', !Storage.isDailyAvailable());
  },

  // --- HUD (gameplay) --------------------------------------------------
  _hudPrev: { floor: null, coins: null, comboText: null, timeText: null },
  _hudChipEls: [], // cached child refs, avoids querySelector per chip per frame

  updateHUD({ floor, coins, comboMultiplier, comboFrac, seconds, powerups }) {
    const prev = this._hudPrev;

    if (prev.floor !== floor) { this.el.hudFloor.textContent = floor; prev.floor = floor; }
    if (prev.coins !== coins) { this.el.hudCoins.textContent = Utils.formatNumber(coins); prev.coins = coins; }

    const comboText = comboMultiplier > 1 ? `x${comboMultiplier.toFixed(1)}` : '';
    if (prev.comboText !== comboText) { this.el.hudCombo.textContent = comboText; prev.comboText = comboText; }
    this.el.hudComboBar.style.transform = `scaleX(${Utils.clamp(comboFrac, 0, 1)})`;

    // Hidden by CSS today, but formatTime()+textContent is still real work —
    // only pay for it when the displayed second actually ticks over.
    const timeText = Utils.formatTime(seconds);
    if (prev.timeText !== timeText) { this.el.hudTimer.textContent = timeText; prev.timeText = timeText; }

    const container = this.el.hudPowerups;
    const cache = this._hudChipEls;
    const needed = powerups.length;
    while (cache.length < needed) {
      const chip = document.createElement('div');
      chip.className = 'powerup-chip';
      const fill = document.createElement('div'); fill.className = 'powerup-chip-fill';
      const icon = document.createElement('span'); icon.className = 'powerup-chip-icon';
      chip.appendChild(fill); chip.appendChild(icon);
      container.appendChild(chip);
      cache.push({ chip, fill, icon, kind: null });
    }
    while (cache.length > needed) {
      const entry = cache.pop();
      container.removeChild(entry.chip);
    }
    for (let i = 0; i < needed; i++) {
      const p = powerups[i];
      const entry = cache[i];
      if (entry.kind !== p.kind) {
        entry.kind = p.kind;
        entry.chip.dataset.kind = p.kind;
        entry.icon.textContent = POWERUP_EMOJI[p.kind] || '★';
      }
      entry.fill.style.transform = `scaleY(${p.frac})`;
    }
  },

  flashMissionToast(text) {
    const t = this.el.missionToast;
    t.textContent = text;
    t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
  },

  // --- Game over ------------------------------------------------------
  populateGameOver(stats, best) {
    this.el.goScore.textContent = Utils.formatNumber(stats.score);
    this.el.goFloor.textContent = stats.floorThisRun;
    this.el.goCoins.textContent = Utils.formatNumber(stats.coinsThisRun);
    this.el.goCombo.textContent = `x${stats.bestComboThisRun.toFixed(1)}`;
    this.el.goNewBest.classList.toggle('hidden', !(best.newBestScore || best.newBestFloor));
    const completed = Storage.get().missions.list.filter(m => m.completed && !m.claimed).length;
    this.el.goMissionNote.classList.toggle('hidden', completed === 0);
    if (completed) this.el.goMissionNote.textContent = `${completed} mission${completed > 1 ? 's' : ''} ready to claim!`;
    this.renderMenuStats();
  },

  // --- Shop -------------------------------------------------------------
  openShop() { this.renderShopGrid(); this.showScreen('shop'); },

  renderShopGrid() {
    const map = { skins: ['skins', CONFIG.SKINS], trails: ['trails', CONFIG.TRAILS], fx: ['jumpFx', CONFIG.JUMP_FX], themes: ['themes', CONFIG.THEMES] };
    const [storeKey, items] = map[this.activeShopTab];
    const d = Storage.get();
    this.el.shopCoins.textContent = Utils.formatNumber(d.coins);
    this.el.shopGrid.innerHTML = '';

    items.forEach(item => {
      const unlocked = Storage.isUnlocked(storeKey, item.id);
      const selected = d.selected[storeKey === 'jumpFx' ? 'jumpFx' : storeKey.slice(0, -1)] === item.id;
      const card = document.createElement('button');
      card.className = 'shop-card' + (selected ? ' selected' : '') + (unlocked ? '' : ' locked');
      const swatch = item.body || item.color || (item.sky ? item.sky[1] : '#4fd8ff');
      card.innerHTML = `
        <div class="shop-swatch" style="background:${swatch}"></div>
        <div class="shop-name">${item.name}</div>
        <div class="shop-price">${unlocked ? (selected ? 'Equipped' : 'Select') : item.price + ' coins'}</div>
      `;
      card.addEventListener('click', () => this.handleShopClick(storeKey, item, unlocked, selected));
      this.el.shopGrid.appendChild(card);
    });
  },

  handleShopClick(storeKey, item, unlocked, selected) {
    const selKey = storeKey === 'jumpFx' ? 'jumpFx' : storeKey.slice(0, -1);
    if (selected) return;
    if (unlocked) {
      Storage.select(selKey, item.id);
      SoundManager.playClick();
    } else if (Storage.spendCoins(item.price)) {
      Storage.unlock(storeKey, item.id);
      Storage.select(selKey, item.id);
      SoundManager.playUnlock();
      Effects.confetti(CONFIG.WORLD_WIDTH / 2, 200);
    } else {
      SoundManager.playError();
    }
    this.renderShopGrid();
  },

  // --- Missions -----------------------------------------------------
  openMissions() { this.renderMissionsList(); this.showScreen('missions'); },

  renderMissionsList() {
    const list = Storage.ensureDailyMissions();
    this.el.missionsList.innerHTML = '';
    list.forEach(m => {
      const row = document.createElement('div');
      row.className = 'mission-row' + (m.claimed ? ' claimed' : '');
      const pct = Utils.clamp((m.progress / m.target) * 100, 0, 100);
      row.innerHTML = `
        <div class="mission-info">
          <div class="mission-label">${m.label}</div>
          <div class="mission-bar"><div class="mission-bar-fill" style="width:${pct}%"></div></div>
        </div>
        <button class="mission-claim" ${m.completed && !m.claimed ? '' : 'disabled'}>${m.claimed ? '✓' : `+${m.reward}`}</button>
      `;
      row.querySelector('.mission-claim').addEventListener('click', () => {
        if (Storage.claimMission(m.id)) {
          SoundManager.playUnlock();
          this.renderMissionsList();
          this.renderMenuStats();
        }
      });
      this.el.missionsList.appendChild(row);
    });
  },

  // --- Settings -----------------------------------------------------
  toggleSettings(show) { this.el.modalSettings.classList.toggle('hidden', !show); },

  refreshSettingsToggles() {
    const s = Storage.get().settings;
    this.el.toggleSfx.classList.toggle('on', s.sfx);
    this.el.toggleMusic.classList.toggle('on', s.music);
  },

  // --- Daily reward -----------------------------------------------------
  openDaily() {
    const d = Storage.get();
    const nextStreak = (d.daily.streak % CONFIG.DAILY_REWARDS.length) + (Storage.isDailyAvailable() ? 1 : 0) || 1;
    const previewStreak = Storage.isDailyAvailable() ? (d.daily.lastClaim ? d.daily.streak + 1 : 1) : d.daily.streak;
    const reward = CONFIG.DAILY_REWARDS[(Math.max(previewStreak, 1) - 1) % CONFIG.DAILY_REWARDS.length];
    this.el.dailyStreakText.textContent = Storage.isDailyAvailable() ? `Day ${Math.max(previewStreak, 1)} streak` : 'Come back tomorrow!';
    this.el.dailyRewardAmount.textContent = reward;
    document.getElementById('btn-claim-daily').disabled = !Storage.isDailyAvailable();
    this.el.popupDaily.classList.remove('hidden');
  },

  claimDaily() {
    if (!Storage.isDailyAvailable()) return;
    const { reward } = Storage.claimDaily();
    SoundManager.playUnlock();
    Effects.confetti(CONFIG.WORLD_WIDTH / 2, 200);
    this.el.dailyRewardAmount.textContent = reward;
    document.getElementById('btn-claim-daily').disabled = true;
    this.renderMenuStats();
    setTimeout(() => this.el.popupDaily.classList.add('hidden'), 900);
  }
};

const POWERUP_EMOJI = {
  shield: '🛡', doubleCoins: '×2', magnet: '🧲', slowMotion: '⏱', superJump: '⬆', speedBoost: '⚡'
};

if (typeof window !== 'undefined') window.UI = UI;
