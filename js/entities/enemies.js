// ═══════════════════════════════════════════════════
//  SILKBOUND PRO — Enemy Definitions & AI
// ═══════════════════════════════════════════════════
import { TILE } from '../constants.js';

// ── Enemy factory ─────────────────────────────────
export function makeEnemy(type, wx, wy) {
  const base = {
    x: wx, y: wy - 20,
    w: 16, h: 20,
    vx: 0, vy: 0,
    onGround: false, hitWall: 0,
    facing: 1,
    alive: true, hittable: true,
    hp: 2, maxHp: 2,
    hitFlash: 0, stunTimer: 0,
    knockbackVx: 0, knockbackVy: 0,
    patrolMin: wx - 70, patrolMax: wx + 70,
    type, animFrame: 0, animTimer: 0,
    aggroRange: 130,
    geo: 3, xp: 10,
    isElite: false,
    // AI state
    aiState: 'patrol', aiTimer: 0,
    shootCD: 0, chargeCD: 0,
    alertFlash: 0,
  };
  applyTypeStats(base, type);
  return base;
}

function applyTypeStats(e, type) {
  switch (type) {
    case 'crawler': // Fast, low HP, rushes player
      e.hp = 2; e.maxHp = 2; e.speed = 1.4; e.color = '#774433';
      e.geo = 3; e.xp = 10; e.aggroRange = 110; e.dashCD = 0;
      break;
    case 'tank': // Slow, high HP, armored, charges
      e.hp = 8; e.maxHp = 8; e.speed = 0.5; e.color = '#553311';
      e.w = 22; e.h = 26; e.armored = true;
      e.geo = 8; e.xp = 30; e.chargeCD = 120; e.aggroRange = 100;
      break;
    case 'flyer': // Flying, dive-bombs
      e.hp = 3; e.maxHp = 3; e.speed = 1.6; e.color = '#335577';
      e.w = 18; e.h = 14; e.flying = true;
      e.floatBase = e.y; e.floatAmp = 24; e.floatT = Math.random() * Math.PI * 2;
      e.diveCooldown = 0; e.diving = false; e.diveTarget = {x:0,y:0};
      e.geo = 4; e.xp = 15;
      break;
    case 'ranged': // Shoots projectiles, keeps distance
      e.hp = 3; e.maxHp = 3; e.speed = 0.7; e.color = '#224466';
      e.shootCD = 0; e.preferDist = 140; e.retreatDist = 60;
      e.geo = 5; e.xp = 18; e.aggroRange = 180;
      break;
    case 'sentinel': // Shield + heavy hit, requires flanking
      e.hp = 6; e.maxHp = 6; e.speed = 0.8; e.color = '#554400';
      e.shield = true; e.armored = true; // frontal immunity
      e.geo = 7; e.xp = 25;
      break;
    case 'elite': // Enhanced crawler with all abilities
      e.hp = 10; e.maxHp = 10; e.speed = 1.8; e.color = '#883300';
      e.isElite = true; e.geo = 15; e.xp = 50;
      e.dashCD = 80; e.shootCD = 60; e.aggroRange = 180;
      e.w = 18; e.h = 22;
      break;
    case 'mushroom': // Armored, spore cloud on death
      e.hp = 4; e.maxHp = 4; e.speed = 0.55; e.color = '#664422';
      e.armored = true; e.sporeDeath = true;
      e.geo = 5; e.xp = 20;
      break;
    case 'crystal_wyrm':
      e.hp = 5; e.maxHp = 5; e.speed = 1.0; e.color = '#224466';
      e.ranged = true; e.shootCD = 0;
      e.geo = 6; e.xp = 22;
      break;
    case 'spike_ball': // Bouncy, small, fast, reflects projectiles
      e.hp = 2; e.maxHp = 2; e.speed = 1.8; e.color = '#bb3344';
      e.w = 12; e.h = 12; e.bouncy = true; e.damage = 2;
      e.geo = 4; e.xp = 14; e.aggroRange = 120;
      break;
    case 'shadow_sprite': // Fast, stealthy, phases, hits hard
      e.hp = 3; e.maxHp = 3; e.speed = 2.2; e.color = '#332244';
      e.flying = true; e.phasing = true; e.damage = 3;
      e.floatBase = e.y; e.floatAmp = 20; e.floatT = Math.random() * Math.PI * 2;
      e.geo = 6; e.xp = 25; e.aggroRange = 160;
      break;
    case 'slime': // Slow, tanky, splits into mini-slimes on death
      e.hp = 6; e.maxHp = 6; e.speed = 0.4; e.color = '#44aa44';
      e.w = 20; e.h = 18; e.slime = true; e.splitsOnDeath = 2;
      e.geo = 7; e.xp = 24; e.aggroRange = 100;
      break;
    case 'necromancer': // Ranged caster, summons dark projectiles
      e.hp = 4; e.maxHp = 4; e.speed = 0.6; e.color = '#664488';
      e.ranged = true; e.shootCD = 0; e.preferDist = 160; e.retreatDist = 80;
      e.darkMagic = true; e.summonCD = 180;
      e.geo = 8; e.xp = 28; e.aggroRange = 200;
      break;
    case 'ghost': // Flying spirit, passes through walls, haunts
      e.hp = 5; e.maxHp = 5; e.speed = 1.4; e.color = '#ccccff';
      e.flying = true; e.phasing = true; e.passThrough = true;
      e.floatBase = e.y; e.floatAmp = 32; e.floatT = Math.random() * Math.PI * 2;
      e.geo = 6; e.xp = 20; e.aggroRange = 150;
      break;
    case 'golem': // Very tanky, very slow, ground pound attack
      e.hp = 12; e.maxHp = 12; e.speed = 0.3; e.color = '#886655';
      e.w = 26; e.h = 32; e.armored = true; e.tankInvuln = 0.8;
      e.poundCD = 0; e.heavyAttack = true;
      e.geo = 12; e.xp = 40;
      break;
    default:
      e.hp = 2; e.maxHp = 2; e.speed = 0.8; e.color = '#666666';
  }
}

// ── AI update — returns list of spawned projectiles ──
export function updateEnemyAI(e, pl, roomEntities, moveActor, rectSolid, biomeParticleColor, parts, frame) {
  if (!e.alive) return;
  if (e.type === 'proj') return; // handled separately

  e.animTimer++;
  if (e.animTimer > 8) { e.animTimer = 0; e.animFrame = (e.animFrame + 1) % 4; }
  if (e.hitFlash > 0) e.hitFlash--;
  if (e.stunTimer > 0) { e.stunTimer--; return; } // stunned — skip AI
  if (e.aiTimer > 0) e.aiTimer--;
  if (e.shootCD > 0) e.shootCD--;
  if (e.chargeCD > 0) e.chargeCD--;
  if (e.diveCooldown > 0) e.diveCooldown--;

  const dx  = (pl.x + pl.w / 2) - (e.x + e.w / 2);
  const dy  = (pl.y + pl.h / 2) - (e.y + e.h / 2);
  const dist = Math.sqrt(dx * dx + dy * dy);
  const aggro = dist < e.aggroRange;
  if (aggro && e.alertFlash <= 0) e.alertFlash = 30; // show "!" on first aggro
  if (e.alertFlash > 0) e.alertFlash--;

  // Apply knockback with decay
  if (Math.abs(e.knockbackVx) > 0.1) { e.vx = e.knockbackVx; e.knockbackVx *= 0.72; }
  if (Math.abs(e.knockbackVy) > 0.1) { e.knockbackVy *= 0.72; }

  if (e.flying) {
    _flyerAI(e, pl, dx, dy, dist, aggro, roomEntities, biomeParticleColor, parts, frame);
  } else {
    _groundAI(e, pl, dx, dy, dist, aggro, roomEntities, moveActor, rectSolid, biomeParticleColor, parts, frame);
  }
}

function _flyerAI(e, pl, dx, dy, dist, aggro, roomEntities, color, parts, frame) {
  e.floatT += 0.04;
  e.facing = dx > 0 ? 1 : -1;

  if (e.type === 'flyer') {
    if (aggro && !e.diving && e.diveCooldown === 0 && Math.abs(dx) < 80) {
      // Start dive bomb
      e.diving = true;
      e.diveTarget = { x: pl.x + pl.w / 2, y: pl.y + pl.h };
      e.diveCooldown = 0;
    }
    if (e.diving) {
      const tx = e.diveTarget.x, ty = e.diveTarget.y;
      e.x += (tx - e.x) * 0.12; e.y += (ty - e.y) * 0.12;
      if (Math.abs(e.x - tx) < 8 && Math.abs(e.y - ty) < 8) {
        e.diving = false; e.diveCooldown = 90;
        // Spawn dust on impact
        for (let i = 0; i < 4; i++) parts.spawn(e.x + e.w/2, e.y + e.h, color, 4, 2);
      }
      return;
    }
    // Patrol float
    const tx = aggro ? pl.x + pl.w/2 - e.w/2 : (e.patrolMin + e.patrolMax) / 2;
    const ty = aggro ? pl.y - 30 : e.floatBase + Math.sin(e.floatT) * e.floatAmp;
    e.x += (tx - e.x) * 0.04; e.y += (ty - e.y) * 0.04;
  }
}

function _groundAI(e, pl, dx, dy, dist, aggro, roomEntities, moveActor, rectSolid, color, parts, frame) {
  e.vy += 0.42; if (e.vy > 13) e.vy = 13;
  e.hitWall = 0;

  switch (e.type) {
    case 'crawler':
      _crawlerAI(e, pl, dx, dy, dist, aggro, roomEntities, parts, color);
      break;
    case 'tank':
      _tankAI(e, pl, dx, dy, dist, aggro, parts, color);
      break;
    case 'ranged':
      _rangedAI(e, pl, dx, dy, dist, aggro, roomEntities);
      break;
    case 'sentinel':
      _sentinelAI(e, pl, dx, dy, dist, aggro);
      break;
    case 'elite':
      _eliteAI(e, pl, dx, dy, dist, aggro, roomEntities, parts, color, frame);
      break;
    case 'mushroom':
    case 'crystal_wyrm':
    case 'spike_ball':
    case 'shadow_sprite':
    case 'slime':
    case 'necromancer':
    case 'ghost':
    case 'golem':
      _defaultAI(e, pl, dx, dy, dist, aggro, roomEntities);
      break;
    default:
      _defaultAI(e, pl, dx, dy, dist, aggro, roomEntities);
  }

  moveActor(e, e.vx, e.vy);
  if (e.hitWall) e.facing *= -1;
}

function _defaultAI(e, pl, dx, dy, dist, aggro, roomEntities) {
  if (aggro) e.facing = dx > 0 ? 1 : -1;
  else { if (e.x < e.patrolMin) e.facing = 1; if (e.x > e.patrolMax) e.facing = -1; }
  const spd = aggro ? e.speed * 1.5 : e.speed;
  e.vx = e.facing * spd;
  if (e.ranged && aggro && e.shootCD === 0 && dist < 120) {
    e.shootCD = 80;
    roomEntities.push(_makeProj(e.x+e.w/2, e.y+e.h/2, Math.sign(dx)*4, dy/dist*3, '#44aaff', 80));
  }
}

function _crawlerAI(e, pl, dx, dy, dist, aggro, roomEntities, parts, color) {
  if (aggro) {
    e.facing = dx > 0 ? 1 : -1;
    // Dash lunge every 90 frames
    if (e.dashCD === 0 && dist < 100) {
      e.dashCD = 90; e.vx = e.facing * 7;
      parts.spawn(e.x+e.w/2, e.y+e.h, color, 4, 2);
    } else {
      e.vx = e.facing * e.speed * 2;
    }
  } else {
    if (e.x < e.patrolMin) e.facing = 1;
    if (e.x > e.patrolMax) e.facing = -1;
    e.vx = e.facing * e.speed;
  }
}

function _tankAI(e, pl, dx, dy, dist, aggro, parts, color) {
  if (aggro) {
    e.facing = dx > 0 ? 1 : -1;
    if (e.chargeCD === 0 && dist < 150) {
      e.chargeCD = 120;
      e.chargeWindup = 25; // wind-up frames before charging
    }
    if (e.chargeWindup > 0) {
      e.chargeWindup--;
      e.vx = 0;
    } else if (e.chargeCD > 95) {
      // Active charge phase (chargeCD counts down 120→95 = 25 frames of actual charge)
      e.vx = e.facing * 6;
    } else {
      e.vx = e.facing * e.speed * 1.2;
    }
  } else {
    if (e.x < e.patrolMin) e.facing = 1;
    if (e.x > e.patrolMax) e.facing = -1;
    e.vx = e.facing * e.speed;
  }
}

function _rangedAI(e, pl, dx, dy, dist, aggro, roomEntities) {
  if (aggro) {
    e.facing = dx > 0 ? 1 : -1;
    // Keep preferred distance
    if (dist < e.retreatDist) {
      e.vx = -e.facing * e.speed * 1.5; // back away
    } else if (dist > e.preferDist) {
      e.vx = e.facing * e.speed; // approach
    } else {
      e.vx *= 0.5; // hold position
      // Shoot!
      if (e.shootCD === 0) {
        e.shootCD = 70;
        const speed = 3.5;
        const ndx = dx / dist, ndy = dy / dist;
        roomEntities.push(_makeProj(e.x+e.w/2, e.y+e.h/2, ndx*speed, ndy*speed, '#44aaff', 100));
        // Phase 2 dual shot
        roomEntities.push(_makeProj(e.x+e.w/2, e.y+e.h/2, ndx*speed, ndy*speed + 1.5, '#44aaff', 90));
      }
    }
  } else {
    if (e.x < e.patrolMin) e.facing = 1;
    if (e.x > e.patrolMax) e.facing = -1;
    e.vx = e.facing * e.speed * 0.5;
  }
}

function _sentinelAI(e, pl, dx, dy, dist, aggro) {
  if (aggro) {
    e.facing = dx > 0 ? 1 : -1;
    e.vx = e.facing * e.speed * (dist < 60 ? 0 : 1);
  } else {
    if (e.x < e.patrolMin) e.facing = 1;
    if (e.x > e.patrolMax) e.facing = -1;
    e.vx = e.facing * e.speed;
  }
}

function _eliteAI(e, pl, dx, dy, dist, aggro, roomEntities, parts, color, frame) {
  if (!aggro) {
    if (e.x < e.patrolMin) e.facing = 1;
    if (e.x > e.patrolMax) e.facing = -1;
    e.vx = e.facing * e.speed * 0.5; return;
  }
  e.facing = dx > 0 ? 1 : -1;
  // Phase: alternate between dash rush and ranged
  const phase = frame % 180;
  if (phase < 80) {
    // Rush
    e.vx = e.facing * e.speed * 2.2;
    if (e.dashCD === 0 && dist < 120) {
      e.dashCD = 80; e.vx = e.facing * 9;
      parts.spawn(e.x+e.w/2, e.y+e.h/2, color, 8, 3);
    }
  } else {
    // Ranged burst
    e.vx *= 0.6;
    if (e.shootCD === 0) {
      e.shootCD = 50;
      for (let i = -1; i <= 1; i++) {
        roomEntities.push(_makeProj(e.x+e.w/2, e.y+e.h/2, Math.sign(dx)*4+i, i*1.5, '#ff8844', 90));
      }
    }
  }
}

export function _makeProj(x, y, vx, vy, color, life, dmg = 1) {
  return { type:'proj', x, y, w:7, h:7, vx, vy, alive:true, hittable:false, color, life, dmg };
}

// ── Damage / kill helpers ─────────────────────────
export function hurtEnemy(e, dmg, fromDir, hasNail2, save, parts, biomeColor, sfx) {
  if (!e.alive) return false;
  // Shield check (sentinel)
  if (e.shield && fromDir === e.facing) return false;
  // Armor check
  if (e.armored && !hasNail2) { dmg = Math.max(1, Math.floor(dmg * 0.4)); }
  e.hp -= dmg;
  e.hitFlash = 10;
  e.stunTimer = 6;
  // Knockback
  e.knockbackVx = fromDir * 4; e.knockbackVy = -2;
  parts.spawnHitSpark(e.x + e.w/2, e.y + e.h/2, biomeColor, fromDir);
  sfx.hitEnemy();
  if (e.hp <= 0) {
    killEnemy(e, save, parts, biomeColor, sfx);
    return true; // killed
  }
  return false;
}

export function killEnemy(e, save, parts, biomeColor, sfx) {
  e.alive = false;
  // Persist defeat so enemy doesn't respawn on room re-entry
  const eid = (save.state.currentRoom||'') + '_' + Math.round(e.x/TILE) + '_' + Math.round((e.y+20)/TILE);
  if (!save.state.defeated.includes(eid)) save.state.defeated.push(eid);
  if (e.sporeDeath) parts.spawnBurst(e.x + e.w/2, e.y + e.h/2, '#66dd88', 20);
  else              parts.spawnBurst(e.x + e.w/2, e.y + e.h/2, biomeColor, 14);
  const geoBonus = save.hasRelic('lucky_charm') ? 1.2 : 1;
  const geo = Math.round((e.geo + Math.floor(Math.random() * 3)) * geoBonus);
  save.state.geo += geo;
  save.state.killCount++;
  const leveled = save.addXP(e.xp);
  save.write();
  sfx.coin();
  return { geo, xp: e.xp, leveled };
}
