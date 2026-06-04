// ═══════════════════════════════════════════════════
//  SILKBOUND PRO — Save System  (Production Upgrade)
//
//  FIXES:
//   • write() is now debounced — max 1 write per 2 seconds
//     (was called every frame = 60x/sec localStorage hammering)
//   • isDirty flag — only serializes/writes if state changed
//
//  UPGRADES:
//   • Version field in save data for future migration
//   • markDirty() — explicit dirty marking for atomic operations
//   • forceWrite() — bypass debounce for critical saves (die, exit)
// ═══════════════════════════════════════════════════
const SAVE_KEY     = 'silkbound_pro_v2';
const SAVE_VERSION = 2;
const WRITE_THROTTLE_MS = 2000; // minimum ms between localStorage writes

const DEFAULTS = {
  _version:    SAVE_VERSION,
  // World
  currentRoom: 'depths_start',
  spawnRoom:   'depths_start',
  // Economy
  geo:     0,
  shards:  0,
  soul:    0,
  maxSoul: 100,
  // Health
  maxHp:   5,
  hp:      5,
  // Stamina (new)
  stamina:    3,
  maxStamina: 3,
  // Progression
  xp:      0,
  level:   1,
  skillPoints: 0,
  unlockedSkills: [],
  // Abilities
  abilities: [],
  // Relics
  relics: [],           // equipped relic ids (max 3)
  ownedRelics: [],      // all owned relic ids
  // Stats (base, modified by skills/relics)
  stats: {
    damage:     1,
    maxHp:      5,
    dashCDMult: 1.0,
    critChance: 0.05,
    atkSpeed:   1.0,
    combo:      false,
    charged:    false,
    airAtk:     false,
  },
  // Tracking
  defeated:   [],
  collected:  [],
  seenNpcs:   [],
  killCount:  0,
  // Quests
  quests:          [],
  completedQuests: [],
  // Settings
  settings: {
    musicVol:       0.6,
    sfxVol:         0.8,
    screenShake:    true,
    showFPS:        false,
    mobileControls: 'auto',
    particleQuality:'high',
  },
  // Achievements & meta
  achievements: [],
  ngPlus:       0,
  totalRuns:    0,
  totalPlayTime: 0,
  _lastSaved:   0,
};

export class SaveSystem {
  constructor() {
    this.state    = this._load();
    this._dirty   = false;
    this._writeT  = null;  // debounce timer
    this._lastWriteTime = 0;
  }

  _load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      // Also try old key for migration
      const rawOld = !raw ? localStorage.getItem('silkbound_pro_v1') : null;
      if (!raw && !rawOld) return this._fresh();
      const parsed = JSON.parse(raw || rawOld);
      const merged = this._merge(this._fresh(), parsed);
      // Migrate version
      merged._version = SAVE_VERSION;
      return merged;
    } catch(e) {
      console.warn('[Save] Load failed, starting fresh:', e.message);
      return this._fresh();
    }
  }

  _fresh() {
    return JSON.parse(JSON.stringify(DEFAULTS));
  }

  _merge(base, override) {
    const out = { ...base };
    for (const k in override) {
      if (k in base && typeof base[k] === 'object'
          && !Array.isArray(base[k]) && base[k] !== null) {
        out[k] = this._merge(base[k], override[k]);
      } else {
        out[k] = override[k];
      }
    }
    return out;
  }

  // ── Write (throttled) ─────────────────────────────────
  // Safe to call every frame — will only serialize/write max
  // once every WRITE_THROTTLE_MS milliseconds.
  write() {
    this._dirty = true;
    if (this._writeT) return; // already queued
    const now = Date.now();
    const remaining = WRITE_THROTTLE_MS - (now - this._lastWriteTime);
    if (remaining <= 0) {
      this._doWrite();
    } else {
      this._writeT = setTimeout(() => {
        this._writeT = null;
        this._doWrite();
      }, remaining);
    }
  }

  // Force immediate write — use for critical events (death, boss kill, quit)
  forceWrite() {
    if (this._writeT) { clearTimeout(this._writeT); this._writeT = null; }
    this._doWrite();
  }

  _doWrite() {
    if (!this._dirty) return;
    try {
      this.state._lastSaved = Date.now();
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.state));
      this._dirty         = false;
      this._lastWriteTime = Date.now();
    } catch(e) {
      console.warn('[Save] Write failed:', e.message);
    }
  }

  markDirty() { this._dirty = true; }

  reset() {
    if (this._writeT) { clearTimeout(this._writeT); this._writeT = null; }
    this.state = this._fresh();
    this._doWrite();
  }

  // ── Stat helpers ──────────────────────────────────────
  getEffectiveStat(stat) {
    return this.state.stats[stat] ?? 0;
  }

  addXP(amount) {
    const s = this.state;
    s.xp += amount;
    const table = [0,100,250,450,700,1000,1400,1900,2500,3200,4100];
    let leveled = false;
    while (s.level < table.length - 1 && s.xp >= table[s.level]) {
      s.xp -= table[s.level];
      s.level++;
      s.skillPoints++;
      leveled = true;
    }
    return leveled;
  }

  hasRelic(id)   { return this.state.relics.includes(id); }
  hasAbility(id) { return this.state.abilities.includes(id); }
  hasSkill(id)   { return this.state.unlockedSkills.includes(id); }

  unlockSkill(skillId, skillDef) {
    const s = this.state;
    if (s.skillPoints < skillDef.cost)                          return false;
    if (s.unlockedSkills.includes(skillId))                     return false;
    if (skillDef.requires && !s.unlockedSkills.includes(skillDef.requires)) return false;
    s.skillPoints -= skillDef.cost;
    s.unlockedSkills.push(skillId);
    if (skillDef.stat === 'maxHp')      { s.stats.maxHp += skillDef.val; s.maxHp += skillDef.val; }
    if (skillDef.stat === 'damage')      s.stats.damage    += skillDef.val;
    if (skillDef.stat === 'dashCD')      s.stats.dashCDMult = Math.min(s.stats.dashCDMult, skillDef.val);
    if (skillDef.stat === 'critChance')  s.stats.critChance += skillDef.val;
    if (skillDef.stat === 'atkSpeed')    s.stats.atkSpeed   = Math.min(s.stats.atkSpeed, skillDef.val);
    if (skillDef.stat === 'combo')       s.stats.combo     = true;
    if (skillDef.stat === 'charged')     s.stats.charged   = true;
    if (skillDef.stat === 'airAtk')      s.stats.airAtk    = true;
    this.write();
    return true;
  }

  equipRelic(relicId) {
    const s = this.state;
    if (!s.ownedRelics.includes(relicId)) return false;
    if (s.relics.includes(relicId))       return false;
    if (s.relics.length >= 3) s.relics.shift();
    s.relics.push(relicId);
    this.write();
    return true;
  }

  grantAchievement(id) {
    if (this.state.achievements.includes(id)) return false;
    this.state.achievements.push(id);
    this.write();
    return true;
  }

  // Quest helpers
  getQuest(id) { return this.state.quests.find(q => q.id === id); }

  startQuest(questDef) {
    if (this.getQuest(questDef.id)) return;
    if (this.state.completedQuests.includes(questDef.id)) return;
    this.state.quests.push({
      id:    questDef.id,
      steps: questDef.steps.map(s => ({ ...s, progress:0, done:false })),
    });
    this.write();
  }

  completeQuest(id) {
    this.state.quests = this.state.quests.filter(q => q.id !== id);
    if (!this.state.completedQuests.includes(id)) this.state.completedQuests.push(id);
    this.write();
  }
}
