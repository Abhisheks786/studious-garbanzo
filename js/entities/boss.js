// ═══════════════════════════════════════════════════
//  SILKBOUND PRO — Boss System
// ═══════════════════════════════════════════════════
import { _makeProj } from './enemies.js';
import { TILE } from '../constants.js';

export class Boss {
  constructor(type, wx, wy, roomId) {
    this.bossType = type;
    this.x  = wx; this.y  = wy - 40;
    this.w  = 36; this.h  = 40;
    this.vx = 0;  this.vy = 0;
    this.onGround = false; this.hitWall = 0;
    this.facing   = -1;
    this.alive    = true;  this.hittable = true;

    this.phase = 1;           // 1, 2, 3
    this.phaseTransition = false;
    this.phaseFlashTimer = 0;
    this.hp    = 1; this.maxHp = 1; // set by type

    this.hitFlash  = 0;
    this.stunTimer = 0;
    this.invFrames = 0;

    this.stateTimer  = 0;
    this.aiState     = 'idle';
    this.aiTimer     = 60; // intro pause
    this.shootCD     = 0;
    this.chargeCD    = 0;
    this.attackTimer = 0;

    this.knockbackVx = 0; this.knockbackVy = 0;

    this.roomId   = roomId;
    this.animFrame = 0; this.animTimer = 0;

    this._applyType(type);
  }

  _applyType(type) {
    switch (type) {
      case 'Warden':
        this.hp = 28; this.maxHp = 28;
        this.speed = 1.8; this.color = '#553322';
        this.geo = 60; this.xp = 350;
        break;
      case 'CrystalGuardian':
        this.hp = 40; this.maxHp = 40;
        this.speed = 1.4; this.color = '#225588';
        this.geo = 90; this.xp = 500;
        break;
      case 'VoidKing':
        this.hp = 60; this.maxHp = 60;
        this.speed = 2.2; this.color = '#330033';
        this.geo = 140; this.xp = 800;
        break;
    }
  }

  get hpPct() { return this.hp / this.maxHp; }

  checkPhase() {
    const newPhase = this.hpPct > 0.66 ? 1 : this.hpPct > 0.33 ? 2 : 3;
    if (newPhase > this.phase) {
      this.phase = newPhase;
      this.phaseTransition = true;
      this.phaseFlashTimer = 80;
      this.invFrames = 60;    // brief invincibility during transition
      this.aiState   = 'transition';
      this.aiTimer   = 80;
      return true; // phase changed
    }
    return false;
  }

  // ── Main AI update ────────────────────────────────
  update(pl, roomEntities, moveActor, parts, sfx) {
    if (!this.alive) return;
    this.animTimer++; if (this.animTimer > 6) { this.animTimer = 0; this.animFrame = (this.animFrame+1)%4; }
    if (this.hitFlash > 0) this.hitFlash--;
    if (this.stunTimer > 0) { this.stunTimer--; return; }
    if (this.invFrames > 0) { this.invFrames--; return; }
    if (this.aiTimer > 0) { this.aiTimer--; return; }
    if (this.phaseFlashTimer > 0) this.phaseFlashTimer--;
    if (this.shootCD > 0) this.shootCD--;
    if (this.chargeCD > 0) this.chargeCD--;
    this.stateTimer++;

    // Knockback decay
    if (Math.abs(this.knockbackVx) > 0.1) { this.vx = this.knockbackVx; this.knockbackVx *= 0.7; }
    if (Math.abs(this.knockbackVy) > 0.1) { this.knockbackVy *= 0.7; }

    const dx  = (pl.x + pl.w/2) - (this.x + this.w/2);
    const dy  = (pl.y + pl.h/2) - (this.y + this.h/2);
    const dist = Math.sqrt(dx*dx + dy*dy);

    if (this.aiState === 'transition') { this.vx = 0; this.vy += 0.4; moveActor(this, this.vx, this.vy); return; }

    this.vy += 0.42; if (this.vy > 14) this.vy = 14;
    this.facing = dx > 0 ? 1 : -1;
    this.hitWall = 0;

    switch (this.bossType) {
      case 'Warden':         this._wardenAI(pl, dx, dy, dist, roomEntities, parts, sfx); break;
      case 'CrystalGuardian':this._crystalAI(pl, dx, dy, dist, roomEntities, parts, sfx); break;
      case 'VoidKing':       this._voidAI(pl, dx, dy, dist, roomEntities, parts, sfx); break;
    }

    moveActor(this, this.vx, this.vy);
    if (this.hitWall) this.vx *= -1;
  }

  // ── WARDEN — Armored brute, charges & stomps ─────
  _wardenAI(pl, dx, dy, dist, roomEntities, parts, sfx) {
    const spd = this.speed * (this.phase >= 2 ? 1.4 : 1) * (this.phase >= 3 ? 1.7 : 1);
    const period = this.phase === 1 ? 150 : this.phase === 2 ? 110 : 80;
    const t = this.stateTimer % period;

    if (t < period * 0.4) {
      // Chase
      this.vx = this.facing * spd;
    } else if (t < period * 0.55) {
      // Wind up (pause)
      this.vx = 0;
    } else if (t < period * 0.7) {
      // CHARGE
      this.vx = this.facing * spd * 3.5;
    } else {
      this.vx *= 0.85;
    }

    // Phase 2: Ground stomp shockwave
    if (this.phase >= 2 && this.onGround && this.stateTimer % 90 === 0) {
      parts.shake(6, 18);
      for (let i = 0; i < 8; i++) parts.spawn(this.x+this.w/2, this.y+this.h, '#cc7722', 3, 3, 0.5, 0.04);
      sfx.bossHit();
    }

    // Phase 3: Aerial leap + slam
    if (this.phase === 3 && this.onGround && this.stateTimer % 70 === 35) {
      this.vy = -11; // leap
      parts.spawnBurst(this.x+this.w/2, this.y+this.h, '#cc7722', 12);
    }
  }

  // ── CRYSTAL GUARDIAN — Ranged crystal shards ─────
  _crystalAI(pl, dx, dy, dist, roomEntities, parts, sfx) {
    const spd = this.speed * (this.phase >= 2 ? 1.3 : 1);
    this.vx = this.facing * spd * 0.6;

    // Phase 1: 3-shot fan
    if (this.phase === 1 && this.shootCD === 0) {
      this.shootCD = 70;
      this._shootFan(roomEntities, dx, dy, dist, 3, 3.5, '#88ccff');
      sfx.bossHit();
    }
    // Phase 2: 5-shot fan + tracking shot
    if (this.phase >= 2 && this.shootCD === 0) {
      this.shootCD = 50;
      this._shootFan(roomEntities, dx, dy, dist, 5, 4.0, '#88ccff');
      // Homing-ish tracking shot
      const speed = 3;
      const ndx = dx/dist, ndy = dy/dist;
      roomEntities.push(_makeProj(this.x+this.w/2, this.y+this.h/2, ndx*speed, ndy*speed, '#ffffff', 150, 2));
    }
    // Phase 3: Spiral
    if (this.phase === 3 && this.stateTimer % 40 === 0) {
      const ang = this.stateTimer * 0.3;
      for (let i = 0; i < 4; i++) {
        const a = ang + (i/4)*Math.PI*2;
        roomEntities.push(_makeProj(this.x+this.w/2, this.y+this.h/2, Math.cos(a)*3.5, Math.sin(a)*3.5, '#44aaff', 120));
      }
    }
    // Jump occasionally
    if (this.onGround && this.stateTimer % 100 === 50) { this.vy = -9; }
  }

  _shootFan(roomEntities, dx, dy, dist, count, speed, color) {
    const baseAngle = Math.atan2(dy, dx);
    const spread = 0.35;
    for (let i = 0; i < count; i++) {
      const a = baseAngle + (i - (count-1)/2) * spread;
      roomEntities.push(_makeProj(this.x+this.w/2, this.y+this.h/2, Math.cos(a)*speed, Math.sin(a)*speed, color, 120));
    }
  }

  // ── VOID KING — Teleporting, bullet hell ─────────
  _voidAI(pl, dx, dy, dist, roomEntities, parts, sfx) {
    const spd = this.speed * (this.phase >= 2 ? 1.5 : 1);
    this.vx = this.facing * spd;

    // Phase 1: orbit + 4-shot
    if (this.phase === 1 && this.shootCD === 0) {
      this.shootCD = 55;
      for (let i = 0; i < 4; i++) {
        const a = (i/4)*Math.PI*2 + this.stateTimer*0.02;
        roomEntities.push(_makeProj(this.x+this.w/2, this.y+this.h/2, Math.cos(a)*3, Math.sin(a)*3, '#cc44ff', 140));
      }
    }
    // Phase 2: teleport + 8-shot
    if (this.phase >= 2 && this.stateTimer % 90 === 45) {
      this.x = pl.x + (Math.random() < 0.5 ? -100 : 100);
      this.y = pl.y - 80;
      parts.spawnBurst(this.x+this.w/2, this.y+this.h/2, '#cc44ff', 20);
      sfx.bossPhase();
      if (this.shootCD === 0) {
        this.shootCD = 30;
        for (let i = 0; i < 8; i++) {
          const a = (i/8)*Math.PI*2;
          roomEntities.push(_makeProj(this.x+this.w/2, this.y+this.h/2, Math.cos(a)*4, Math.sin(a)*4, '#cc44ff', 140));
        }
      }
    }
    // Phase 3: dark void convergence — walls of projectiles
    if (this.phase === 3 && this.stateTimer % 60 === 0) {
      // Horizontal sweep
      for (let i = 0; i < 5; i++) {
        roomEntities.push(_makeProj(0, this.y + i*30 - 60, 4.5, 0, '#ff00ff', 200));
        roomEntities.push(_makeProj(640, this.y + i*30 - 60, -4.5, 0, '#ff00ff', 200));
      }
      parts.shake(5, 15);
    }
  }

  // ── Taking damage ─────────────────────────────────
  hurt(dmg, fromDir, parts, sfx, biomeColor) {
    if (!this.alive || this.invFrames > 0) return false;
    this.hp -= dmg;
    this.hitFlash = 12;
    this.stunTimer = 4;
    this.knockbackVx = fromDir * 2; this.knockbackVy = -1;
    parts.spawnHitSpark(this.x + this.w/2, this.y + this.h/2, biomeColor, fromDir);
    sfx.bossHit();
    const phaseChanged = this.checkPhase();
    if (phaseChanged) sfx.bossPhase();
    if (this.hp <= 0) { this.hp = 0; this.alive = false; return 'dead'; }
    return phaseChanged ? 'phase' : true;
  }
}
