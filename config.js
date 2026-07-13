// ============================================================================
// config.js — Stack Escape
// All tunable numbers and static data live here so balance can be adjusted
// without touching game logic. Attached to window as a single global CONFIG.
// ============================================================================

const CONFIG = {

  // --- World / canvas -------------------------------------------------
  WORLD_WIDTH: 400,          // logical (unscaled) width of the play field
  VIEW_HEIGHT: 700,          // logical (unscaled) height of the viewport
  FLOOR_HEIGHT: 92,          // vertical distance between floor "bands"
  GROUND_Y: 0,               // world y of the starting platform

  // --- Physics ----------------------------------------------------------
  PHYSICS: {
    GRAVITY: 1600,
    MAX_FALL_SPEED: 920,
    JUMP_VELOCITY: -650,
    SUPER_JUMP_VELOCITY: -920,
    SPRING_VELOCITY: -1000,
    MOVE_SPEED: 230,
    MOVE_SPEED_BOOST: 340,
    AIR_CONTROL: 0.85,
    GROUND_DECEL: 0.80,       // velocity retained per frame-normalized tick when no input
    ICE_DECEL: 0.985,
    CONVEYOR_SPEED: 95,
    COYOTE_TIME: 0.09,        // grace period to still jump after leaving a platform
    JUMP_BUFFER: 0.12         // grace period a jump press is remembered before landing
  },

  PLAYER: { WIDTH: 32, HEIGHT: 40 },

  // --- The rising crusher below -----------------------------------------
  DANGER: {
    START_DELAY: 1.8,          // seconds of grace before it begins rising
    BASE_RISE_SPEED: 58,       // world units / second
    RISE_PER_FLOOR: 1.35,      // added speed per floor climbed
    MAX_RISE_SPEED: 430,
    CATCHUP_BONUS: 1.9         // speed multiplier applied when player is idle/stalling
  },

  // --- Combo --------------------------------------------------------------
  COMBO: {
    WINDOW: 2.2,             // seconds allowed between landings before combo resets
    PER_TIER: 4,             // landings needed to raise multiplier by one step
    MAX_MULTIPLIER: 5,
    STEP: 0.5,
    BASE_MULTIPLIER: 1
  },

  // --- Collectible values --------------------------------------------------
  COLLECTIBLE: {
    COIN_VALUE: 1,
    GEM_VALUE: 5,
    STAR_COMBO_BOOST: 3      // instantly adds this many "landings" worth of combo
  },

  // --- Powerup durations (seconds) & effect params -------------------------
  POWERUP: {
    DURATION: {
      shield: 0,              // consumed on hit, not time based
      doubleCoins: 10,
      magnet: 8,
      slowMotion: 6,
      superJump: 9,
      speedBoost: 8
    },
    MAGNET_RADIUS: 110,
    SLOW_FACTOR: 0.55,
    SPAWN_CHANCE: 0.10        // per platform, gated further by difficulty table
  },

  // --- Difficulty curve -----------------------------------------------
  // Returns tuned parameters for a given floor number.
  difficultyForFloor(floor) {
    const f = floor;
    const clampedRise = Math.min(
      CONFIG.DANGER.BASE_RISE_SPEED + f * CONFIG.DANGER.RISE_PER_FLOOR,
      CONFIG.DANGER.MAX_RISE_SPEED
    );

    // Gap grows slowly with floor but stays within a jumpable range.
    const gapMin = 60 + Math.min(f * 0.35, 34);
    const gapMax = 92 + Math.min(f * 0.55, 58);

    // Horizontal offset range between consecutive platforms.
    const xJitter = Math.min(70 + f * 0.6, 170);

    const obstacleChance = Math.min(0.06 + f * 0.011, 0.42);
    const powerupChance = Math.max(0.09 - f * 0.0008, 0.045);
    const hazardOnPlatformChance = Math.min(0.03 + f * 0.006, 0.28);

    return { riseSpeed: clampedRise, gapMin, gapMax, xJitter, obstacleChance, powerupChance, hazardOnPlatformChance };
  },

  // Weighted platform type table unlocked progressively by floor.
  // Each entry: [type, weight, minFloor]
  PLATFORM_TABLE: [
    ['normal',    40, 0],
    ['tiny',      10, 2],
    ['moving',    14, 3],
    ['cracked',   12, 4],
    ['ice',       10, 6],
    ['spring',    10, 5],
    ['conveyor',  10, 8],
    ['falling',   12, 9],
    ['breakable', 10, 11],
    ['rotating',   8, 15]
  ],

  // Weighted obstacle table, [type, weight, minFloor]
  OBSTACLE_TABLE: [
    ['spikes',   30, 0],
    ['fire',     22, 2],
    ['rock',     18, 5],
    ['hammer',   16, 8],
    ['laser',    14, 11],
    ['drone',    14, 14],
    ['debris',   12, 10]
  ],

  // Weighted powerup table, [type, weight]
  POWERUP_TABLE: [
    ['shield', 18],
    ['doubleCoins', 18],
    ['magnet', 16],
    ['slowMotion', 16],
    ['superJump', 16],
    ['speedBoost', 16]
  ],

  // --- Progression / Shop -------------------------------------------------
  SKINS: [
    { id: 'cyan',   name: 'Sky Cadet',   price: 0,    body: '#4fd8ff', accent: '#1b8fc0', face: '#0b2b3a' },
    { id: 'coral',  name: 'Sunset Runner', price: 250, body: '#ff6b6b', accent: '#c23f52', face: '#3a0b12' },
    { id: 'mint',   name: 'Mint Ghost',  price: 250,  body: '#3ddc97', accent: '#1f9a67', face: '#08321f' },
    { id: 'gold',   name: 'Golden Ace',  price: 600,  body: '#ffd23f', accent: '#c99312', face: '#3a2a03' },
    { id: 'violet', name: 'Void Jumper', price: 900,  body: '#b083ff', accent: '#6c3fc2', face: '#1c0d38' },
    { id: 'ember',  name: 'Ember Knight', price: 1400, body: '#ff3d81', accent: '#8f1e4c', face: '#2c0715' }
  ],

  TRAILS: [
    { id: 'none',   name: 'No Trail',    price: 0,   color: null },
    { id: 'spark',  name: 'Spark Dust',  price: 150, color: '#ffd23f' },
    { id: 'bubble', name: 'Sky Bubbles', price: 300, color: '#4fd8ff' },
    { id: 'flame',  name: 'Ember Trail', price: 500, color: '#ff5e3d' },
    { id: 'petal',  name: 'Nebula Petals', price: 800, color: '#b083ff' }
  ],

  JUMP_FX: [
    { id: 'basic',  name: 'Basic Puff',  price: 0,   color: '#ffffff' },
    { id: 'star',   name: 'Star Burst',  price: 200, color: '#ffd23f' },
    { id: 'ring',   name: 'Sonic Ring',  price: 350, color: '#4fd8ff' },
    { id: 'confetti', name: 'Confetti Pop', price: 650, color: '#ff6b6b' }
  ],

  THEMES: [
    { id: 'dusk',   name: 'Dusk Sherbet', price: 0,    sky: ['#2b1b4e', '#5a3a8c', '#ff9a76'] },
    { id: 'aurora', name: 'Aurora',       price: 300,  sky: ['#0d1b3e', '#1e5c6b', '#3ddc97'] },
    { id: 'candy',  name: 'Candy Pop',    price: 500,  sky: ['#3a0d3e', '#a13d78', '#ff9ac2'] },
    { id: 'nebula', name: 'Deep Nebula',  price: 900,  sky: ['#090418', '#241456', '#6c3fc2'] }
  ],

  // --- Missions ------------------------------------------------------
  MISSION_TEMPLATES: [
    { id: 'collectCoins',  label: n => `Collect ${n} coins`,        values: [60, 100, 160], stat: 'coinsThisRun', reward: n => Math.round(n * 1.5) },
    { id: 'reachFloor',    label: n => `Reach floor ${n}`,          values: [20, 40, 70],   stat: 'floorThisRun',  reward: n => Math.round(n * 4) },
    { id: 'surviveTime',   label: n => `Survive ${n} seconds`,      values: [45, 90, 150],  stat: 'timeThisRun',   reward: n => Math.round(n * 2.5) },
    { id: 'usePowerups',   label: n => `Use ${n} powerups`,         values: [2, 3, 5],      stat: 'powerupsThisRun', reward: n => n * 40 },
    { id: 'collectGems',   label: n => `Collect ${n} gems`,         values: [5, 10, 16],    stat: 'gemsThisRun',   reward: n => n * 30 },
    { id: 'buildCombo',    label: n => `Reach a x${n / 2 + 1} combo`, values: [2, 4, 6],    stat: 'bestComboThisRun', reward: n => n * 45 }
  ],

  DAILY_REWARDS: [50, 80, 120, 160, 220, 300, 500], // coins for streak day 1..7 (cycles)

  STORAGE_KEY: 'stackEscapeSave_v1'
};

if (typeof window !== 'undefined') window.CONFIG = CONFIG;
