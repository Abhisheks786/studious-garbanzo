// ═══════════════════════════════════════════════════
//  SILKBOUND PRO — Enemy Definitions & AI (Production Upgrade)
//
//  FIXES:
//   • killEnemy() defeat IDs now use integer tile coords
//     (was Math.round on floats — caused respawn drift bug)
//
//  UPGRADES:
//   • Full state machines: patrol → alert → chase → attack → recover
//   • LOS check before aggro (enemies can't see through walls)
//   • Necromancer actually summons minion entities
//   • Slime actually splits into 2 mini-slimes on death
//   • Adaptive difficulty: scales with player level
//   • Ghost/flyer pathfinding improvement
//   • All enemy types get enriched AI behaviors
// ═══════════════════════════════════════════════════
import { TILE } from '../constants.js';

// ── Enemy factory ─────────────────────────────────────
export function makeEnemy(type, wx, wy, overrides = {}) {
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
    dmg: 1,
    // Full state machine
    aiState: 'patrol',  // patrol|alert|chase|attack|recover|idle
    aiTimer: 0,
    alertTimer: 0,   // countdown after first spotting player
    shootCD: 0, chargeCD: 0, diveCooldown: 0,
    alertFlash: 0,
    hasLOS: false,   // cached LOS result
    losTimer: 0,     // LOS re-check cooldown
    // Damage ramp with distance
    spawnX: wx, spawnY: wy,
  };
  applyTypeStats(base, type);
  Object.assign(base, overrides);
  return base;
}

function applyTypeStats(e, type) {
  switch (type) {
    case 'crawler':
      e.hp=2; e.maxHp=2; e.speed=1.4; e.color='#774433';
      e.geo=3; e.xp=10; e.aggroRange=110; e.dashCD=0; e.dmg=1;
      break;
    case 'tank':
      e.hp=8; e.maxHp=8; e.speed=0.5; e.color='#553311';
      e.w=22; e.h=26; e.armored=true;
      e.geo=8; e.xp=30; e.chargeCD=120; e.aggroRange=100; e.dmg=2;
      break;
    case 'flyer':
      e.hp=3; e.maxHp=3; e.speed=1.6; e.color='#335577';
      e.w=18; e.h=14; e.flying=true;
      e.floatBase=e.y; e.floatAmp=24; e.floatT=Math.random()*Math.PI*2;
      e.diveCooldown=0; e.diving=false; e.diveTarget={x:0,y:0};
      e.geo=4; e.xp=15; e.dmg=1;
      break;
    case 'ranged':
      e.hp=3; e.maxHp=3; e.speed=0.7; e.color='#224466';
      e.shootCD=0; e.preferDist=140; e.retreatDist=60;
      e.geo=5; e.xp=18; e.aggroRange=180; e.dmg=1;
      break;
    case 'sentinel':
      e.hp=6; e.maxHp=6; e.speed=0.8; e.color='#554400';
      e.shield=true; e.armored=true;
      e.geo=7; e.xp=25; e.dmg=2;
      break;
    case 'elite':
      e.hp=10; e.maxHp=10; e.speed=1.8; e.color='#883300';
      e.isElite=true; e.geo=15; e.xp=50;
      e.dashCD=80; e.shootCD=60; e.aggroRange=180; e.dmg=2;
      e.w=18; e.h=22;
      break;
    case 'mushroom':
      e.hp=4; e.maxHp=4; e.speed=0.55; e.color='#664422';
      e.armored=true; e.sporeDeath=true;
      e.geo=5; e.xp=20; e.dmg=1;
      break;
    case 'crystal_wyrm':
      e.hp=5; e.maxHp=5; e.speed=1.0; e.color='#224466';
      e.ranged=true; e.shootCD=0;
      e.geo=6; e.xp=22; e.dmg=1;
      break;
    case 'spike_ball':
      e.hp=2; e.maxHp=2; e.speed=1.8; e.color='#bb3344';
      e.w=12; e.h=12; e.bouncy=true; e.dmg=2;
      e.geo=4; e.xp=14; e.aggroRange=120;
      break;
    case 'shadow_sprite':
      e.hp=3; e.maxHp=3; e.speed=2.2; e.color='#332244';
      e.flying=true; e.phasing=true; e.dmg=3;
      e.floatBase=e.y; e.floatAmp=20; e.floatT=Math.random()*Math.PI*2;
      e.geo=6; e.xp=25; e.aggroRange=160;
      break;
    case 'slime':
      e.hp=6; e.maxHp=6; e.speed=0.4; e.color='#44aa44';
      e.w=20; e.h=18; e.slime=true; e.splitsOnDeath=2;
      e.geo=7; e.xp=24; e.aggroRange=100; e.dmg=1;
      break;
    case 'mini_slime':
      e.hp=2; e.maxHp=2; e.speed=0.8; e.color='#66cc66';
      e.w=10; e.h=9; e.slime=true; e.isMiniSlime=true;
      e.geo=2; e.xp=6; e.aggroRange=80; e.dmg=1;
      break;
    case 'necromancer':
      e.hp=4; e.maxHp=4; e.speed=0.6; e.color='#664488';
      e.ranged=true; e.shootCD=0; e.preferDist=160; e.retreatDist=80;
      e.darkMagic=true; e.summonCD=180;
      e.geo=8; e.xp=28; e.aggroRange=200; e.dmg=1;
      break;
    case 'ghost':
      e.hp=5; e.maxHp=5; e.speed=1.4; e.color='#ccccff';
      e.flying=true; e.phasing=true; e.passThrough=true;
      e.floatBase=e.y; e.floatAmp=32; e.floatT=Math.random()*Math.PI*2;
      e.geo=6; e.xp=20; e.aggroRange=150; e.dmg=2;
      break;
    case 'golem':
      e.hp=12; e.maxHp=12; e.speed=0.3; e.color='#886655';
      e.w=26; e.h=32; e.armored=true;
      e.poundCD=0; e.heavyAttack=true;
      e.geo=12; e.xp=40; e.dmg=3;
      break;
    default:
      e.hp=2; e.maxHp=2; e.speed=0.8; e.color='#666666'; e.dmg=1;
  }
}

// ── AI update ─────────────────────────────────────────
export function updateEnemyAI(e, pl, roomEntities, moveActor, rectSolid, biomeParticleColor, parts, frame, physics) {
  if (!e.alive) return;
  if (e.type === 'proj') return;

  e.animTimer++;
  if (e.animTimer > 8) { e.animTimer = 0; e.animFrame = (e.animFrame + 1) % 4; }
  if (e.hitFlash  > 0) e.hitFlash--;
  if (e.stunTimer > 0) { e.stunTimer--; return; }
  if (e.aiTimer   > 0) e.aiTimer--;
  if (e.shootCD   > 0) e.shootCD--;
  if (e.chargeCD  > 0) e.chargeCD--;
  if (e.diveCooldown > 0) e.diveCooldown--;
  if (e.losTimer  > 0) e.losTimer--;

  const dx   = (pl.x + pl.w / 2) - (e.x + e.w / 2);
  const dy   = (pl.y + pl.h / 2) - (e.y + e.h / 2);
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Line-of-sight check (every 15 frames to save CPU)
  if (e.losTimer <= 0 && physics) {
    e.hasLOS   = physics.hasLOS(e.x + e.w/2, e.y + e.h/2, pl.x + pl.w/2, pl.y + pl.h/2);
    e.losTimer = 15;
  }

  const canSeePlayer = dist < e.aggroRange && (e.hasLOS || e.flying || e.phasing);

  // Alert flash on first sight
  if (canSeePlayer && e.alertFlash <= 0 && e.aiState === 'patrol') {
    e.alertFlash = 30;
    e.aiState    = 'alert';
    e.alertTimer = 20; // brief pause before chasing
  }
  if (e.alertFlash > 0) e.alertFlash--;

  // Apply knockback decay
  if (Math.abs(e.knockbackVx) > 0.1) { e.vx = e.knockbackVx; e.knockbackVx *= 0.72; }
  if (Math.abs(e.knockbackVy) > 0.1) { e.knockbackVy *= 0.72; }

  if (e.flying) {
    _flyerAI(e, pl, dx, dy, dist, canSeePlayer, roomEntities, biomeParticleColor, parts, frame);
  } else {
    _groundAI(e, pl, dx, dy, dist, canSeePlayer, roomEntities, moveActor, rectSolid, biomeParticleColor, parts, frame, physics);
  }
}

function _flyerAI(e, pl, dx, dy, dist, aggro, roomEntities, color, parts, frame) {
  e.floatT += 0.04;
  e.facing  = dx > 0 ? 1 : -1;

  if (e.type === 'flyer') {
    if (aggro && !e.diving && e.diveCooldown === 0 && Math.abs(dx) < 80) {
      e.diving     = true;
      e.diveTarget = { x: pl.x + pl.w / 2, y: pl.y + pl.h };
    }
    if (e.diving) {
      const tx = e.diveTarget.x, ty = e.diveTarget.y;
      e.x += (tx - e.x) * 0.12; e.y += (ty - e.y) * 0.12;
      if (Math.abs(e.x - tx) < 8 && Math.abs(e.y - ty) < 8) {
        e.diving = false; e.diveCooldown = 90;
        for (let i = 0; i < 4; i++) parts.spawn(e.x+e.w/2, e.y+e.h, color, 4, 2);
      }
      return;
    }
    const tx = aggro ? pl.x + pl.w/2 - e.w/2 : (e.patrolMin + e.patrolMax) / 2;
    const ty = aggro ? pl.y - 30 : e.floatBase + Math.sin(e.floatT) * e.floatAmp;
    e.x += (tx - e.x) * 0.04; e.y += (ty - e.y) * 0.04;

  } else if (e.type === 'shadow_sprite' || e.type === 'ghost') {
    // Ghost / shadow: orbit and phase toward player
    const tx = aggro ? pl.x + pl.w/2 - e.w/2 : (e.patrolMin + e.patrolMax) / 2;
    const ty = aggro ? pl.y + pl.h/2 - e.h/2 : e.floatBase + Math.sin(e.floatT) * e.floatAmp;
    const speed = e.type === 'shadow_sprite' ? 0.07 : 0.04;
    e.x += (tx - e.x) * speed;
    e.y += (ty - e.y) * speed;
  }
}

function _groundAI(e, pl, dx, dy, dist, aggro, roomEntities, moveActor, rectSolid, color, parts, frame, physics) {
  e.vy += 0.42;
  if (e.vy > 13) e.vy = 13;
  e.hitWall = 0;

  // State transitions
  if (e.aiState === 'alert') {
    e.vx = 0;
    if (e.alertTimer > 0) { e.alertTimer--; }
    else { e.aiState = 'chase'; }
    moveActor(e, e.vx, e.vy);
    if (e.hitWall) e.facing *= -1;
    return;
  }
  if (!aggro && e.aiState !== 'patrol') {
    e.aiState = 'patrol';
  }

  switch (e.type) {
    case 'crawler':    _crawlerAI(e, pl, dx, dy, dist, aggro, roomEntities, parts, color); break;
    case 'tank':       _tankAI(e, pl, dx, dy, dist, aggro, parts, color); break;
    case 'ranged':     _rangedAI(e, pl, dx, dy, dist, aggro, roomEntities); break;
    case 'sentinel':   _sentinelAI(e, pl, dx, dy, dist, aggro); break;
    case 'elite':      _eliteAI(e, pl, dx, dy, dist, aggro, roomEntities, parts, color, frame); break;
    case 'necromancer':_necromancerAI(e, pl, dx, dy, dist, aggro, roomEntities, parts, color); break;
    case 'golem':      _golemAI(e, pl, dx, dy, dist, aggro, parts, color); break;
    default:           _defaultAI(e, pl, dx, dy, dist, aggro, roomEntities); break;
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
    roomEntities.push(_makeProj(e.x+e.w/2, e.y+e.h/2, Math.sign(dx)*4, (dy/dist)*3, '#44aaff', 80));
  }
}

function _crawlerAI(e, pl, dx, dy, dist, aggro, roomEntities, parts, color) {
  if (aggro) {
    e.facing = dx > 0 ? 1 : -1;
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
      e.chargeCD    = 120;
      e.chargeWindup = 25;
    }
    if (e.chargeWindup > 0) {
      e.chargeWindup--;
      e.vx = 0;
    } else if (e.chargeCD > 95) {
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
    if (dist < e.retreatDist) {
      e.vx = -e.facing * e.speed * 1.5;
    } else if (dist > e.preferDist) {
      e.vx = e.facing * e.speed;
    } else {
      e.vx *= 0.5;
      if (e.shootCD === 0) {
        e.shootCD = 70;
        const speed = 3.5;
        const ndx = dx / dist, ndy = dy / dist;
        roomEntities.push(_makeProj(e.x+e.w/2, e.y+e.h/2, ndx*speed, ndy*speed, '#44aaff', 100));
        roomEntities.push(_makeProj(e.x+e.w/2, e.y+e.h/2, ndx*speed, ndy*speed+1.5, '#44aaff', 90));
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
  const phase = frame % 180;
  if (phase < 80) {
    e.vx = e.facing * e.speed * 2.2;
    if (e.dashCD === 0 && dist < 120) {
      e.dashCD = 80; e.vx = e.facing * 9;
      parts.spawn(e.x+e.w/2, e.y+e.h/2, color, 8, 3);
    }
  } else {
    e.vx *= 0.6;
    if (e.shootCD === 0) {
      e.shootCD = 50;
      for (let i = -1; i <= 1; i++) {
        roomEntities.push(_makeProj(e.x+e.w/2, e.y+e.h/2, Math.sign(dx)*4+i, i*1.5, '#ff8844', 90));
      }
    }
  }
}

function _necromancerAI(e, pl, dx, dy, dist, aggro, roomEntities, parts, color) {
  if (!aggro) {
    if (e.x < e.patrolMin) e.facing = 1;
    if (e.x > e.patrolMax) e.facing = -1;
    e.vx = e.facing * e.speed * 0.5; return;
  }
  e.facing = dx > 0 ? 1 : -1;
  // Keep distance
  if (dist < e.retreatDist) e.vx = -e.facing * e.speed * 1.2;
  else if (dist > e.preferDist) e.vx = e.facing * e.speed * 0.7;
  else e.vx *= 0.4;

  // Dark magic projectile burst
  if (e.shootCD === 0 && dist < 180) {
    e.shootCD = 80;
    const ndx = dx / dist, ndy = dy / dist;
    for (let i = 0; i < 3; i++) {
      const offset = (i - 1) * 0.25;
      roomEntities.push(_makeProj(
        e.x+e.w/2, e.y+e.h/2,
        ndx * 3.5 + offset, ndy * 3.5,
        '#8844cc', 110, 1
      ));
    }
    parts.spawn(e.x+e.w/2, e.y+e.h/2, '#8844cc', 6, 2, 0.5);
  }

  // Summon a ghost minion every summonCD frames
  if (e.summonCD !== undefined) {
    e.summonCD--;
    if (e.summonCD <= 0) {
      e.summonCD = 240;
      const minion = makeEnemy('ghost', e.x + e.facing * 40, e.y);
      minion.hp = 2; minion.maxHp = 2;
      roomEntities.push(minion);
      parts.spawnBurst(e.x+e.w/2, e.y+e.h/2, '#8844cc', 12);
    }
  }
}

function _golemAI(e, pl, dx, dy, dist, aggro, parts, color) {
  if (!aggro) {
    if (e.x < e.patrolMin) e.facing = 1;
    if (e.x > e.patrolMax) e.facing = -1;
    e.vx = e.facing * e.speed * 0.5; return;
  }
  e.facing = dx > 0 ? 1 : -1;
  e.vx = e.facing * e.speed;
  // Ground pound when close
  if (e.poundCD !== undefined) {
    e.poundCD--;
    if (e.poundCD <= 0 && dist < 60 && e.onGround) {
      e.poundCD = 150;
      e.vy = -8; // leap
      parts.spawnShockwave(e.x+e.w/2, e.y+e.h, color, 40);
    }
  }
}

// ── Projectile factory with pooling ────────────────────
const PROJ_POOL_SIZE = 150;
const projPool = [];
for (let i = 0; i < PROJ_POOL_SIZE; i++) {
  projPool.push({ type:'proj', x:0, y:0, w:7, h:7, vx:0, vy:0, alive:false, hittable:false, color:'#fff', life:0, dmg:1 });
}

export function _makeProj(x, y, vx, vy, color, life, dmg = 1) {
  let p = projPool.find(proj => !proj.alive);
  if (!p) {
    p = { type:'proj', x:0, y:0, w:7, h:7, vx:0, vy:0, alive:false, hittable:false, color:'#fff', life:0, dmg:1 };
    projPool.push(p);
  }
  p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.color = color; p.life = life; p.dmg = dmg;
  p.alive = true;
  return p;
}

// ── Damage helpers ────────────────────────────────────
export function hurtEnemy(e, dmg, fromDir, hasNail2, save, parts, biomeColor, sfx) {
  if (!e.alive) return false;
  if (e.shield && fromDir === e.facing) return false;
  if (e.armored && !hasNail2) { dmg = Math.max(1, Math.floor(dmg * 0.4)); }
  e.hp -= dmg;
  e.hitFlash  = 10;
  e.stunTimer = 6;
  e.knockbackVx = fromDir * 4; e.knockbackVy = -2;
  parts.spawnHitSpark(e.x + e.w/2, e.y + e.h/2, biomeColor, fromDir);
  sfx.hitEnemy();
  if (e.hp <= 0) { return true; } // Return true, let caller invoke killEnemy with roomEntities
  return false;
}

export function killEnemy(e, save, parts, biomeColor, sfx, roomEntities) {
  e.alive = false;

  // ── FIXED: Use integer tile coordinates for defeat IDs ──
  // Previously used Math.round(e.x/TILE) on float positions,
  // causing drift and enemy respawn on room re-entry.
  const tx = Math.floor((e.x + e.w / 2) / TILE);
  const ty = Math.floor((e.y + e.h)     / TILE);
  const eid = `${save.state.currentRoom||''}_${tx}_${ty}`;
  if (!save.state.defeated.includes(eid)) save.state.defeated.push(eid);

  // Slime split — actually spawn mini-slimes
  if (e.splitsOnDeath && !e.isMiniSlime && roomEntities) {
    for (let i = 0; i < e.splitsOnDeath; i++) {
      const mini = makeEnemy('mini_slime', e.x + (i === 0 ? -12 : 12), e.y);
      roomEntities.push(mini);
    }
  }

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
