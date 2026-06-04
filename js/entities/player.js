// ═══════════════════════════════════════════════════
//  SILKBOUND PRO — Player Entity
// ═══════════════════════════════════════════════════
import { PL_SPEED, PL_JUMP, PL_GRAV, PL_MAXFALL, DASH_SPEED, DASH_DUR, TILE } from '../constants.js';

export class Player {
  constructor() {
    // Position & physics
    this.x = 40; this.y = 200;
    this.w = 14;  this.h = 22;
    this.vx = 0;  this.vy = 0;
    this.facing = 1;

    // Ground / wall state
    this.onGround  = false;
    this.wallSlide = false;
    this.hitWall   = 0;
    this.jumps     = 0;
    this.coyoteTime  = 0;
    this.jumpBuffer  = 0;
    this.dropTimer   = 0;

    // Dash
    this.dashTimer = 0;
    this.dashCD    = 0;
    this.dashDir   = 1;
    this.dashCharges = 1; // increases with void_step relic

    // ── COMBAT ──────────────────────────────────────
    this.attackTimer  = 0;  // frames remaining in swing
    this.attackCD     = 0;  // cooldown between attacks
    this.comboStep    = 0;  // 0,1,2 for 3-hit combo
    this.comboWindow  = 0;  // frames to press next combo hit
    this.chargeTimer  = 0;  // holding attack button
    this.isCharging   = false;
    this.chargeReady  = false;
    this.airAtkDone   = false; // one air attack per jump

    // Damage numbers
    this.lastDmg = 0;

    // Invincibility / status
    this.invTimer  = 0;
    this.stunTimer = 0;
    this.dead      = false;

    // Animation
    this.animFrame = 0;
    this.animTimer = 0;
    this.soulAnim  = 0;

    // Cached stats (refreshed from save each room)
    this.stats = {
      damage:     1,
      maxHp:      5,
      dashCDMult: 1.0,
      critChance: 0.05,
      atkSpeed:   1.0,
      combo:      false,
      charged:    false,
      airAtk:     false,
    };
  }

  // Call at start of each room / stat change
  refreshStats(save) {
    const s = save.state;
    this.stats = { ...s.stats };
    // Apply relic effects
    if (save.hasRelic('iron_heart'))  this.stats.maxHp += 2;
    if (save.hasRelic('swift_sole'))  this.stats.dashCDMult *= 0.6;
    if (save.hasRelic('crit_edge'))   this.stats.critChance += 0.15;
    if (save.hasRelic('void_step'))   this.dashCharges = 2;
    else                              this.dashCharges = 1;
  }

  // ── Attack logic ──────────────────────────────────
  // Returns hit data: { active, aw, ah, ax, ay, dmg, type }
  getAttackHitbox() {
    if (this.attackTimer <= 0) return null;
    // Only active on specific frames of each combo step
    const hitFrames = { 0: 11, 1: 10, 2: 9 }; // combo 3 is fastest
    if (this.attackTimer !== hitFrames[this.comboStep]) return null;

    const aw = this.chargeReady ? 28 : (this.comboStep === 2 ? 24 : 20);
    const ah = this.chargeReady ? 18 : 14;
    const ax = this.facing > 0 ? this.x + this.w : this.x - aw;
    const ay = this.y + 4 + (this.comboStep === 1 ? -3 : 0); // slight upswing on hit 2
    const baseDmg = this.stats.damage + this.comboStep; // each hit in combo deals more
    const isCrit  = Math.random() < this.stats.critChance;
    const dmg     = Math.round(baseDmg * (this.chargeReady ? 2.5 : 1) * (isCrit ? 2 : 1));
    return { active: true, aw, ah, ax, ay, dmg, isCrit, chargeRelease: this.chargeReady, comboStep: this.comboStep };
  }

  // Start attack — called by updatePlayer when JP.attack
  startAttack(inAir) {
    const atkDur  = Math.round(12 * this.stats.atkSpeed);
    const atkCD   = Math.round(18 * this.stats.atkSpeed);
    this.attackTimer  = atkDur;
    this.attackCD     = atkCD;
    this.chargeReady  = this.chargeTimer >= 30 && this.stats.charged;
    this.chargeTimer  = 0;
    this.isCharging   = false;
    if (inAir) this.airAtkDone = true;
  }

  // Advance combo step — call when an attack successfully connects while comboWindow is open
  advanceCombo() {
    if (this.stats.combo && this.comboWindow > 0) {
      this.comboStep = (this.comboStep + 1) % 3;
      this.comboWindow = 40;
    }
  }

  resetCombo() {
    this.comboStep   = 0;
    this.comboWindow = 0;
  }

  reset(sx, sy) {
    this.x = sx; this.y = sy - this.h;
    this.vx = 0; this.vy = 0;
    this.onGround = false; this.wallSlide = false;
    this.dead = false; this.invTimer = 0; this.stunTimer = 0;
    this.dashTimer = 0; this.dashCD = 0;
    this.attackTimer = 0; this.attackCD = 0;
    this.comboStep = 0; this.comboWindow = 0;
    this.chargeTimer = 0; this.isCharging = false; this.chargeReady = false;
    this.airAtkDone = false;
    this.jumps = 0;
  }
}
