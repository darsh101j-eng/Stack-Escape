// ============================================================================
// storage.js — Stack Escape
// Wraps localStorage behind a small API with safe defaults. All persistent
// progression (coins, unlocks, settings, best stats, daily reward, missions)
// lives here so the rest of the game never touches localStorage directly.
// ============================================================================

const Storage = {
  data: null,

  defaults() {
    return {
      coins: 0,
      bestScore: 0,
      bestFloor: 0,
      longestCombo: 0,
      totalCoinsCollected: 0,
      totalRuns: 0,
      totalPlaySeconds: 0,
      unlocked: {
        skins: ['cyan'],
        trails: ['none'],
        jumpFx: ['basic'],
        themes: ['dusk']
      },
      selected: { skin: 'cyan', trail: 'none', jumpFx: 'basic', theme: 'dusk' },
      settings: { sfx: true, music: true, tutorial: true },
      daily: { lastClaim: null, streak: 0 },
      missions: { date: null, list: [] }
    };
  },

  load() {
    try {
      const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
      if (!raw) { this.data = this.defaults(); return this.data; }
      const parsed = JSON.parse(raw);
      // Merge onto defaults so newly-added fields never come back undefined.
      this.data = Object.assign(this.defaults(), parsed);
      this.data.unlocked = Object.assign(this.defaults().unlocked, parsed.unlocked);
      this.data.selected = Object.assign(this.defaults().selected, parsed.selected);
      this.data.settings = Object.assign(this.defaults().settings, parsed.settings);
      this.data.daily = Object.assign(this.defaults().daily, parsed.daily);
      this.data.missions = Object.assign(this.defaults().missions, parsed.missions);
    } catch (e) {
      console.warn('Save data unreadable, starting fresh.', e);
      this.data = this.defaults();
    }
    return this.data;
  },

  save() {
    try {
      localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(this.data));
    } catch (e) {
      console.warn('Could not persist save data.', e);
    }
  },

  get() { return this.data || this.load(); },

  // --- Currency -----------------------------------------------------------
  addCoins(n) {
    const d = this.get();
    d.coins += n;
    d.totalCoinsCollected += Math.max(0, n);
    this.save();
    return d.coins;
  },

  spendCoins(n) {
    const d = this.get();
    if (d.coins < n) return false;
    d.coins -= n;
    this.save();
    return true;
  },

  // --- Progression / shop ---------------------------------------------
  isUnlocked(category, id) {
    return this.get().unlocked[category].includes(id);
  },

  unlock(category, id) {
    const d = this.get();
    if (!d.unlocked[category].includes(id)) d.unlocked[category].push(id);
    this.save();
  },

  select(category, id) {
    const d = this.get();
    d.selected[category] = id;
    this.save();
  },

  // --- Run results ----------------------------------------------------
  submitRunResult({ score, floor, combo, coinsCollected, seconds }) {
    const d = this.get();
    d.totalRuns += 1;
    d.totalPlaySeconds += seconds;
    d.bestScore = Math.max(d.bestScore, score);
    d.bestFloor = Math.max(d.bestFloor, floor);
    d.longestCombo = Math.max(d.longestCombo, combo);
    this.save();
    return {
      newBestScore: score >= d.bestScore && score > 0,
      newBestFloor: floor >= d.bestFloor && floor > 0
    };
  },

  // --- Settings ---------------------------------------------------------
  toggleSetting(key) {
    const d = this.get();
    d.settings[key] = !d.settings[key];
    this.save();
    return d.settings[key];
  },

  setSetting(key, value) {
    const d = this.get();
    d.settings[key] = value;
    this.save();
    return d.settings[key];
  },

  // --- Daily reward -------------------------------------------------------
  todayString() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  },

  dateFromKey(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  },

  isDailyAvailable() {
    return this.get().daily.lastClaim !== this.todayString();
  },

  claimDaily() {
    const d = this.get();
    const today = this.todayString();
    const oneDayMs = 24 * 60 * 60 * 1000;
    let streak = d.daily.streak || 0;
    if (d.daily.lastClaim) {
      const diffDays = Math.round((this.dateFromKey(today) - this.dateFromKey(d.daily.lastClaim)) / oneDayMs);
      streak = diffDays === 1 ? streak + 1 : (diffDays === 0 ? streak : 1);
    } else {
      streak = 1;
    }
    const reward = CONFIG.DAILY_REWARDS[(streak - 1) % CONFIG.DAILY_REWARDS.length];
    d.daily.lastClaim = today;
    d.daily.streak = streak;
    this.addCoins(reward);
    this.save();
    return { streak, reward };
  },

  // --- Missions -----------------------------------------------------------
  ensureDailyMissions() {
    const d = this.get();
    const today = this.todayString();
    if (d.missions.date === today && d.missions.list.length) return d.missions.list;
    const templates = [...CONFIG.MISSION_TEMPLATES];
    const chosen = [];
    while (chosen.length < 3 && templates.length) {
      const idx = Utils.randInt(0, templates.length - 1);
      chosen.push(templates.splice(idx, 1)[0]);
    }
    d.missions.date = today;
    d.missions.list = chosen.map(t => {
      const target = Utils.pick(t.values);
      return {
        id: Utils.uid(),
        templateId: t.id,
        target,
        label: t.label(target),
        stat: t.stat,
        reward: t.reward(target),
        progress: 0,
        completed: false,
        claimed: false
      };
    });
    this.save();
    return d.missions.list;
  },

  updateMissionProgress(statBag) {
    const d = this.get();
    let anyNewlyCompleted = false;
    let changed = false;
    for (const m of d.missions.list) {
      if (m.claimed) continue;
      const val = statBag[m.stat] || 0;
      const newProgress = Math.max(m.progress, Math.min(val, m.target));
      if (newProgress !== m.progress) { m.progress = newProgress; changed = true; }
      if (!m.completed && m.progress >= m.target) { m.completed = true; anyNewlyCompleted = true; changed = true; }
    }
    // Skip the synchronous localStorage write (called every ~0.5s during a
    // run) when nothing actually moved — avoids a JSON.stringify + disk
    // write hitch for no reason on lower-end devices.
    if (changed) this.save();
    return anyNewlyCompleted;
  },

  claimMission(missionId) {
    const d = this.get();
    const m = d.missions.list.find(x => x.id === missionId);
    if (!m || !m.completed || m.claimed) return 0;
    m.claimed = true;
    this.addCoins(m.reward);
    this.save();
    return m.reward;
  },

  resetAll() {
    this.data = this.defaults();
    this.save();
  }
};

if (typeof window !== 'undefined') window.Storage = Storage;
