// ═══════════════════════════════════════════════════
//  SOULCALL — Boss System  (Production Upgrade)
//
//  FIXES:
//   • VoidKing teleport now clamped to room bounds
//     (was: could teleport completely off-screen)
//   • hurt() return values consistent: 'dead'|'phase'|true
//
//  UPGRADES:
//   • Arena lock flag (exits sealed while boss alive)
//   • Telegraphed attacks: wind-up animations
//   • Phase intro: camera pause + roar SFX
//   • Warden: charge respects wall bounds
//   • CrystalGuardian: tracking shot aims correctly
//   • VoidKing: bounds-clamped teleport
//   • All bosses: proper phase-2/3 music escalation
// ═══════════════════════════════════════════════════
import { _makeProj } from './enemies.js';
import { TILE, W, H } from '../constants.js';

export class Boss {
  constructor(type, wx, wy, roomId) {
    this.bossType = type;
    this.x  = wx; this.y  = wy - 40;
    this.w  = 36; this.h  = 40;
    this.vx = 0;  this.vy = 0;
    this.onGround = false; this.hitWall = 0;
    this.facing   = -1;
    this.alive    = true;  this.hittable = true;

    this.phase = 1;
    this.phaseTransition  = false;
    this.phaseFlashTimer  = 0;
    this.hp    = 1; this.maxHp = 1;

    this.hitFlash  = 0;
    this.stunTimer = 0;
    this.invFrames = 0;

    this.stateTimer  = 0;
    this.aiState     = 'intro'; // intro → idle → active → transition
    this.aiTimer     = 90;     // intro pause before boss becomes active
    this.shootCD     = 0;
    this.chargeCD    = 0;
    this.attackTimer = 0;

    // Wind-up telegraph
    this.windupTimer  = 0;
    this.windupType   = null; // 'charge'|'shoot'|'slam'

    this.knockbackVx = 0; this.knockbackVy = 0;

    this.roomId    = roomId;
    this.animFrame = 0; this.animTimer = 0;

    // Arena lock: true while boss alive
    this.arenaLocked = true;

    // Room bounds (set by game after room load)
    this.roomW = W * 3; // default; game sets real value
    this.roomH = H * 4;

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

  setRoomBounds(pixelW, pixelH) {
    this.roomW = pixelW;
    this.roomH = pixelH;
  }

  checkPhase(audio) {
    const newPhase = this.hpPct > 0.66 ? 1 : this.hpPct > 0.33 ? 2 : 3;
    if (newPhase > this.phase) {
      this.phase            = newPhase;
      this.phaseTransition  = true;
      this.phaseFlashTimer  = 80;
      this.invFrames        = 60;
      this.aiState          = 'transition';
      this.aiTimer          = 80;
      // Escalate boss music
      if (audio && audio.setBossPhase) audio.setBossPhase(this.phase);
      return true;
    }
    return false;
  }

  // ── Main AI update ─────────────────────────────────
  update(pl, roomEntities, moveActor, parts, sfx) {
    if (!this.alive) return;
    this.animTimer++;
    if (this.animTimer > 6) { this.animTimer = 0; this.animFrame = (this.animFrame+1)%4; }
    if (this.hitFlash  > 0) this.hitFlash--;
    if (this.stunTimer > 0) { this.stunTimer--; return; }
    if (this.invFrames > 0) { this.invFrames--; return; }
    if (this.aiTimer   > 0) {
      // Intro roar
      if (this.aiState === 'intro' && this.aiTimer === 89) {
        sfx.bossRoar && sfx.bossRoar();
        parts.shake(6, 20);
      }
      this.aiTimer--;
      if (this.aiTimer === 0 && this.aiState === 'intro') this.aiState = 'active';
      return;
    }
    if (this.phaseFlashTimer > 0) this.phaseFlashTimer--;
    if (this.shootCD > 0) this.shootCD--;
    if (this.chargeCD > 0) this.chargeCD--;
    this.stateTimer++;

    // Knockback decay
    if (Math.abs(this.knockbackVx) > 0.1) { this.vx = this.knockbackVx; this.knockbackVx *= 0.7; }
    if (Math.abs(this.knockbackVy) > 0.1) { this.knockbackVy *= 0.7; }

    const dx   = (pl.x + pl.w/2) - (this.x + this.w/2);
    const dy   = (pl.y + pl.h/2) - (this.y + this.h/2);
    const dist = Math.sqrt(dx*dx + dy*dy);

    if (this.aiState === 'transition') {
      this.vx = 0;
      this.vy += 0.4;
      moveActor(this, this.vx, this.vy);
      return;
    }

    this.vy += 0.42;
    if (this.vy > 14) this.vy = 14;
    this.facing  = dx > 0 ? 1 : -1;
    this.hitWall = 0;

    switch (this.bossType) {
      case 'Warden':          this._wardenAI(pl, dx, dy, dist, roomEntities, parts, sfx); break;
      case 'CrystalGuardian': this._crystalAI(pl, dx, dy, dist, roomEntities, parts, sfx); break;
      case 'VoidKing':        this._voidAI(pl, dx, dy, dist, roomEntities, parts, sfx); break;
    }

    moveActor(this, this.vx, this.vy);
    if (this.hitWall) this.vx *= -1;
  }

  // ── WARDEN — Armored brute, charges & stomps ────────
  _wardenAI(pl, dx, dy, dist, roomEntities, parts, sfx) {
    const spd    = this.speed * (this.phase >= 2 ? 1.4 : 1) * (this.phase >= 3 ? 1.7 : 1);
    const period = this.phase === 1 ? 150 : this.phase === 2 ? 110 : 80;
    const t      = this.stateTimer % period;

    if (t < period * 0.4) {
      // Chase
      this.vx = this.facing * spd;
    } else if (t < period * 0.55) {
      // Wind-up telegraph
      this.vx = 0;
      this.windupTimer = 10; this.windupType = 'charge';
    } else if (t < period * 0.7) {
      // CHARGE — clamp to room bounds
      this.windupTimer = 0;
      this.vx = this.facing * spd * 3.5;
      // Clamp so charge doesn't go off-screen
      this.x = Math.max(this.w, Math.min(this.roomW - this.w * 2, this.x));
    } else {
      this.vx *= 0.85;
    }

    // Phase 2: Ground stomp shockwave
    if (this.phase >= 2 && this.onGround && this.stateTimer % 90 === 0) {
      parts.shake(6, 18);
      parts.spawnShockwave(this.x+this.w/2, this.y+this.h, '#cc7722', 50);
      sfx.bossHit();
    }
    // Phase 3: Aerial leap + slam
    if (this.phase === 3 && this.onGround && this.stateTimer % 70 === 35) {
      this.vy = -11;
      parts.spawnBurst(this.x+this.w/2, this.y+this.h, '#cc7722', 12);
    }
  }

  // ── CRYSTAL GUARDIAN — Ranged crystal shards ────────
  _crystalAI(pl, dx, dy, dist, roomEntities, parts, sfx) {
    const spd = this.speed * (this.phase >= 2 ? 1.3 : 1);
    this.vx   = this.facing * spd * 0.6;

    // Phase 1: 3-shot fan
    if (this.phase === 1 && this.shootCD === 0) {
      this.shootCD = 70;
      this._shootFan(roomEntities, dx, dy, dist, 3, 3.5, '#88ccff');
      sfx.bossHit();
    }
    // Phase 2: 5-shot fan + accurate tracking shot
    if (this.phase >= 2 && this.shootCD === 0) {
      this.shootCD = 50;
      this._shootFan(roomEntities, dx, dy, dist, 5, 4.0, '#88ccff');
      // Homing tracking shot — properly aimed at player position
      if (dist > 0) {
        const speed = 3;
        const ndx = dx/dist, ndy = dy/dist;
        roomEntities.push(_makeProj(this.x+this.w/2, this.y+this.h/2, ndx*speed, ndy*speed, '#ffffff', 150, 2));
      }
    }
    // Phase 3: Spiral
    if (this.phase === 3 && this.stateTimer % 40 === 0) {
      const ang = this.stateTimer * 0.3;
      for (let i = 0; i < 4; i++) {
        const a = ang + (i/4)*Math.PI*2;
        roomEntities.push(_makeProj(this.x+this.w/2, this.y+this.h/2, Math.cos(a)*3.5, Math.sin(a)*3.5, '#44aaff', 120));
      }
    }
    // Occasional jump
    if (this.onGround && this.stateTimer % 100 === 50) { this.vy = -9; }
  }

  _shootFan(roomEntities, dx, dy, dist, count, speed, color) {
    if (dist <= 0) return;
    const baseAngle = Math.atan2(dy, dx);
    const spread    = 0.35;
    for (let i = 0; i < count; i++) {
      const a = baseAngle + (i - (count-1)/2) * spread;
      roomEntities.push(_makeProj(this.x+this.w/2, this.y+this.h/2, Math.cos(a)*speed, Math.sin(a)*speed, color, 120));
    }
  }

  // ── VOID KING — Teleporting, bullet hell ─────────────
  _voidAI(pl, dx, dy, dist, roomEntities, parts, sfx) {
    const spd = this.speed * (this.phase >= 2 ? 1.5 : 1);
    this.vx   = this.facing * spd;

    // Phase 1: orbit + 4-shot
    if (this.phase === 1 && this.shootCD === 0) {
      this.shootCD = 55;
      for (let i = 0; i < 4; i++) {
        const a = (i/4)*Math.PI*2 + this.stateTimer*0.02;
        roomEntities.push(_makeProj(this.x+this.w/2, this.y+this.h/2, Math.cos(a)*3, Math.sin(a)*3, '#cc44ff', 140));
      }
    }

    // Phase 2: teleport + 8-shot
    // FIXED: clamp teleport to room bounds (was: could go off-screen)
    if (this.phase >= 2 && this.stateTimer % 90 === 45) {
      const offsetX = (Math.random() < 0.5 ? -1 : 1) * (80 + Math.random() * 60);
      const newX = pl.x + offsetX;
      const newY = pl.y - 80;
      // Clamp strictly within room
      this.x = Math.max(this.w + 4, Math.min(this.roomW - this.w * 2 - 4, newX));
      this.y = Math.max(this.h + 4, Math.min(this.roomH - this.h * 2 - 4, newY));
      parts.spawnBurst(this.x+this.w/2, this.y+this.h/2, '#cc44ff', 20);
      sfx.bossPhase && sfx.bossPhase();
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
      for (let i = 0; i < 5; i++) {
        roomEntities.push(_makeProj(0,           this.y + i*30 - 60, 4.5, 0, '#ff00ff', 200));
        roomEntities.push(_makeProj(this.roomW,  this.y + i*30 - 60, -4.5, 0, '#ff00ff', 200));
      }
      parts.shake(5, 15);
    }
  }

  // ── Taking damage ──────────────────────────────────
  hurt(dmg, fromDir, parts, sfx, biomeColor, audio) {
    if (!this.alive || this.invFrames > 0) return false;
    this.hp -= dmg;
    this.hitFlash  = 12;
    this.stunTimer = 4;
    this.knockbackVx = fromDir * 2; this.knockbackVy = -1;
    parts.spawnHitSpark(this.x + this.w/2, this.y + this.h/2, biomeColor, fromDir);
    sfx.bossHit();
    const phaseChanged = this.checkPhase(audio);
    if (phaseChanged) sfx.bossPhase();
    if (this.hp <= 0) {
      this.hp    = 0;
      this.alive = false;
      this.arenaLocked = false; // unlock exits on death
      return 'dead';
    }
    return phaseChanged ? 'phase' : true;
  }
}
