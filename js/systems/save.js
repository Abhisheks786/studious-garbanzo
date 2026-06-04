// ═══════════════════════════════════════════════════
//  SILKBOUND PRO — Save System
// ═══════════════════════════════════════════════════
const SAVE_KEY = 'silkbound_pro_v1';

const DEFAULTS = {
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
  quests:     [],       // [{id, steps:[{done}]}]
  completedQuests: [],
  // Settings
  settings: {
    musicVol:   0.6,
    sfxVol:     0.8,
    screenShake: true,
    showFPS:    false,
    mobileControls: 'auto',
  },
  // Achievements
  achievements: [],
  // New Game Plus
  ngPlus: 0,
  totalRuns: 0,
};

export class SaveSystem {
  constructor() {
    this.state = this._load();
  }

  _load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return this._fresh();
      const parsed = JSON.parse(raw);
      // Deep merge with defaults to handle new fields across versions
      return this._merge(this._fresh(), parsed);
    } catch(e) {
      return this._fresh();
    }
  }

  _fresh() {
    return JSON.parse(JSON.stringify(DEFAULTS));
  }

  _merge(base, override) {
    const out = {...base};
    for (const k in override) {
      if (k in base && typeof base[k] === 'object' && !Array.isArray(base[k]) && base[k] !== null) {
        out[k] = this._merge(base[k], override[k]);
      } else {
        out[k] = override[k];
      }
    }
    return out;
  }

  write() {
    try {
      // Always save at full HP to the spawn room
      const toSave = {...this.state};
      localStorage.setItem(SAVE_KEY, JSON.stringify(toSave));
    } catch(e) {}
  }

  reset() {
    this.state = this._fresh();
    this.write();
  }

  // Stat helpers (accounting for skills + relics)
  getEffectiveStat(stat) {
    const s = this.state;
    let val = s.stats[stat] ?? 0;
    // Relics can modify stats further at runtime — handled in combat
    return val;
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

  hasRelic(id) { return this.state.relics.includes(id); }
  hasAbility(id) { return this.state.abilities.includes(id); }
  hasSkill(id) { return this.state.unlockedSkills.includes(id); }

  unlockSkill(skillId, skillDef) {
    const s = this.state;
    if (s.skillPoints < skillDef.cost) return false;
    if (s.unlockedSkills.includes(skillId)) return false;
    if (skillDef.requires && !s.unlockedSkills.includes(skillDef.requires)) return false;
    s.skillPoints -= skillDef.cost;
    s.unlockedSkills.push(skillId);
    // Apply stat
    if (skillDef.stat === 'maxHp')     { s.stats.maxHp += skillDef.val; s.maxHp += skillDef.val; }
    if (skillDef.stat === 'damage')     s.stats.damage += skillDef.val;
    if (skillDef.stat === 'dashCD')     s.stats.dashCDMult = Math.min(s.stats.dashCDMult, skillDef.val);
    if (skillDef.stat === 'critChance') s.stats.critChance += skillDef.val;
    if (skillDef.stat === 'atkSpeed')   s.stats.atkSpeed   = Math.min(s.stats.atkSpeed, skillDef.val);
    if (skillDef.stat === 'combo')      s.stats.combo    = true;
    if (skillDef.stat === 'charged')    s.stats.charged  = true;
    if (skillDef.stat === 'airAtk')     s.stats.airAtk   = true;
    this.write();
    return true;
  }

  equipRelic(relicId) {
    const s = this.state;
    if (!s.ownedRelics.includes(relicId)) return false;
    if (s.relics.includes(relicId)) return false;
    if (s.relics.length >= 3) s.relics.shift(); // drop oldest if full
    s.relics.push(relicId);
    this.write();
    return true;
  }

  grantAchievement(id, label) {
    if (this.state.achievements.includes(id)) return false;
    this.state.achievements.push(id);
    this.write();
    return true; // caller should show notif
  }

  // Quest helpers
  getQuest(id) {
    return this.state.quests.find(q => q.id === id);
  }
  startQuest(questDef) {
    if (this.getQuest(questDef.id)) return;
    if (this.state.completedQuests.includes(questDef.id)) return;
    this.state.quests.push({
      id: questDef.id,
      steps: questDef.steps.map(s => ({...s, progress: 0, done: false}))
    });
    this.write();
  }
  completeQuest(id) {
    this.state.quests = this.state.quests.filter(q => q.id !== id);
    if (!this.state.completedQuests.includes(id)) this.state.completedQuests.push(id);
    this.write();
  }
}
