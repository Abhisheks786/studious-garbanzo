// ═══════════════════════════════════════════════════
//  SILKBOUND PRO — Player Entity  (Production Upgrade)
//
//  UPGRADES:
//   • Stamina system (dash/charged attack cost stamina)
//   • State machine: idle|run|jump|fall|attack|dash|stunned|dead
//   • Separate hurtbox (smaller than collision box)
//   • Landing squash/stretch effect data
//   • Roll/iframe dodge (double-tap direction)
//   • Better stat caching and refresh logic
// ═══════════════════════════════════════════════════
import { PL_SPEED, PL_JUMP, DASH_SPEED, DASH_DUR, TILE } from '../constants.js';

// Player state enum
export const PlayerState = Object.freeze({
  IDLE:    'idle',
  RUN:     'run',
  JUMP:    'jump',
  FALL:    'fall',
  ATTACK:  'attack',
  DASH:    'dash',
  ROLL:    'roll',    // dodge roll (iframe)
  STUNNED: 'stunned',
  DEAD:    'dead',
});

export class Player {
  constructor() {
    // ── Collision box ────────────────────────────────
    this.x = 40; this.y = 200;
    this.w = 14;  this.h = 22;
    this.vx = 0;  this.vy = 0;
    this.facing = 1;

    // ── Hurtbox (smaller, centered) ──────────────────
    // offset from collision box top-left
    this.hurtOffX = 2;  this.hurtOffY = 3;
    this.hurtW    = 10; this.hurtH    = 16;

    // ── Ground / wall state ───────────────────────────
    this.onGround    = false;
    this.wallSlide   = false;
    this.hitWall     = 0;
    this.jumps       = 0;
    this.coyoteTime  = 0;
    this.jumpBuffer  = 0;
    this.dropTimer   = 0;

    // ── State machine ─────────────────────────────────
    this.state       = PlayerState.IDLE;
    this._prevState  = PlayerState.IDLE;

    // ── Dash ──────────────────────────────────────────
    this.dashTimer   = 0;
    this.dashCD      = 0;
    this.dashDir     = 1;
    this.dashCharges = 1;

    // ── Roll / dodge ──────────────────────────────────
    this.rollTimer   = 0;   // iframe roll frames remaining
    this.rollDir     = 1;
    this.rollCD      = 0;
    this._tapDir     = 0;   // last tap direction for double-tap roll
    this._tapTimer   = 0;

    // ── Stamina ───────────────────────────────────────
    // Actions: dash costs 1, charged attack costs 1
    // Regenerates 1 per 90 frames while on ground (not dashing)
    this.stamina     = 3;
    this.maxStamina  = 3;
    this.staminaRegen= 0;   // regen counter

    // ── Combat ────────────────────────────────────────
    this.attackTimer  = 0;
    this.attackCD     = 0;
    this.comboStep    = 0;
    this.comboWindow  = 0;
    this.chargeTimer  = 0;
    this.isCharging   = false;
    this.chargeReady  = false;
    this.airAtkDone   = false;

    // ── Status ────────────────────────────────────────
    this.invTimer    = 0;
    this.stunTimer   = 0;
    this.dead        = false;

    // ── Animation ─────────────────────────────────────
    this.animFrame   = 0;
    this.animTimer   = 0;
    this.soulAnim    = 0;

    // Visual effects
    this.squashY     = 1.0;   // 1.0 = normal, <1 = squash, >1 = stretch
    this.squashTimer = 0;

    // ── Stats (refreshed from save each room) ─────────
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

  // ── Hurtbox helper ────────────────────────────────────
  getHurtbox() {
    return {
      x: this.x + this.hurtOffX,
      y: this.y + this.hurtOffY,
      w: this.hurtW,
      h: this.hurtH,
    };
  }

  // ── Refresh stats from save ───────────────────────────
  refreshStats(save) {
    const s = save.state;
    this.stats = { ...s.stats };
    // Apply relic effects
    if (save.hasRelic('iron_heart'))  this.stats.maxHp      += 2;
    if (save.hasRelic('swift_sole'))  this.stats.dashCDMult *= 0.6;
    if (save.hasRelic('crit_edge'))   this.stats.critChance += 0.15;
    if (save.hasRelic('void_step'))   this.dashCharges       = 2;
    else                              this.dashCharges       = 1;
    // Sync stamina from save
    this.maxStamina = s.maxStamina ?? 3;
    this.stamina    = Math.min(this.stamina, this.maxStamina);
  }

  // ── Stamina helpers ───────────────────────────────────
  hasStamina(cost = 1) { return this.stamina >= cost; }
  useStamina(cost = 1) {
    this.stamina = Math.max(0, this.stamina - cost);
    this.staminaRegen = 0; // reset regen counter
  }
  tickStamina() {
    if (this.stamina < this.maxStamina && this.onGround && this.dashTimer === 0) {
      this.staminaRegen++;
      if (this.staminaRegen >= 90) {
        this.stamina = Math.min(this.maxStamina, this.stamina + 1);
        this.staminaRegen = 0;
      }
    }
  }

  // ── State update ──────────────────────────────────────
  updateState() {
    this._prevState = this.state;
    if (this.dead)               { this.state = PlayerState.DEAD;    return; }
    if (this.stunTimer > 0)      { this.state = PlayerState.STUNNED; return; }
    if (this.dashTimer > 0)      { this.state = PlayerState.DASH;    return; }
    if (this.rollTimer > 0)      { this.state = PlayerState.ROLL;    return; }
    if (this.attackTimer > 0)    { this.state = PlayerState.ATTACK;  return; }
    if (!this.onGround && this.vy < 0) { this.state = PlayerState.JUMP; return; }
    if (!this.onGround && this.vy >= 0){ this.state = PlayerState.FALL; return; }
    if (Math.abs(this.vx) > 0.5) { this.state = PlayerState.RUN;    return; }
    this.state = PlayerState.IDLE;
  }

  // Landing squash — call when transitioning to onGround
  triggerLandSquash(fallSpeed) {
    const intensity = Math.min(1, Math.abs(fallSpeed) / 15);
    this.squashY    = 1 - intensity * 0.35; // squash
    this.squashTimer = 10;
  }

  // Squash/stretch tick
  tickSquash() {
    if (this.squashTimer > 0) {
      this.squashTimer--;
      // Spring back to 1.0
      const t = 1 - this.squashTimer / 10;
      // Squash → overshoot stretch → settle
      if (t < 0.4)      this.squashY = this.squashY + (1.2 - this.squashY) * 0.3;
      else if (t < 0.7) this.squashY = this.squashY + (0.95 - this.squashY) * 0.35;
      else              this.squashY = this.squashY + (1.0  - this.squashY) * 0.4;
    }
  }

  // ── Attack logic ──────────────────────────────────────
  getAttackHitbox() {
    if (this.attackTimer <= 0) return null;

    // Dynamically calculate the active trigger frame relative to the scaled attack duration.
    // This guarantees that even with upgraded attack speed, a hitbox is triggered exactly once.
    const atkDur = Math.round(12 * this.stats.atkSpeed);
    const triggerFrame = Math.max(1, atkDur - 2); 
    if (this.attackTimer !== triggerFrame) return null;

    const aw  = this.chargeReady ? 28 : (this.comboStep === 2 ? 24 : 20);
    const ah  = this.chargeReady ? 18 : 14;
    const ax  = this.facing > 0 ? this.x + this.w : this.x - aw;
    const ay  = this.y + 4 + (this.comboStep === 1 ? -3 : 0);
    const baseDmg = this.stats.damage + this.comboStep;
    const isCrit  = Math.random() < this.stats.critChance;
    const dmg     = Math.round(baseDmg * (this.chargeReady ? 2.5 : 1) * (isCrit ? 2 : 1));
    return { active:true, aw, ah, ax, ay, dmg, isCrit,
             chargeRelease:this.chargeReady, comboStep:this.comboStep };
  }

  startAttack(inAir) {
    const atkDur = Math.round(12 * this.stats.atkSpeed);
    const atkCD  = Math.round(18 * this.stats.atkSpeed);
    this.attackTimer = atkDur;
    this.attackCD    = atkCD;
    this.chargeReady = this.chargeTimer >= 30 && this.stats.charged;
    this.chargeTimer = 0;
    this.isCharging  = false;
    if (inAir) this.airAtkDone = true;
  }

  advanceCombo() {
    if (this.stats.combo && this.comboWindow > 0) {
      this.comboStep  = (this.comboStep + 1) % 3;
      this.comboWindow = 40;
    }
  }

  resetCombo() {
    this.comboStep   = 0;
    this.comboWindow = 0;
  }

  // ── Room reset ────────────────────────────────────────
  reset(sx, sy) {
    this.x = sx; this.y = sy - this.h;
    this.vx = 0; this.vy = 0;
    this.onGround = false; this.wallSlide = false;
    this.dead = false; this.invTimer = 0; this.stunTimer = 0;
    this.dashTimer = 0; this.dashCD = 0;
    this.rollTimer = 0; this.rollCD = 0;
    this.attackTimer = 0; this.attackCD = 0;
    this.comboStep = 0; this.comboWindow = 0;
    this.chargeTimer = 0; this.isCharging = false; this.chargeReady = false;
    this.airAtkDone = false; this.jumps = 0;
    this.squashY = 1.0; this.squashTimer = 0;
    this.state = PlayerState.IDLE;
    // Don't reset stamina — preserved between rooms
  }
}
