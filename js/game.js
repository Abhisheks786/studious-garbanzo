// ═══════════════════════════════════════════════════
//  SILKBOUND PRO — Main Game Orchestrator
// ═══════════════════════════════════════════════════
import { W, H, TILE, PL_SPEED, PL_JUMP, PL_GRAV, PL_MAXFALL, DASH_SPEED, DASH_DUR,
         biomeColors, XP_TABLE, RELICS, SKILLS, SHOP_ITEMS, QUESTS } from './constants.js';import { SaveSystem }    from './systems/save.js';
import { AudioSystem }   from './systems/audio.js';
import { InputSystem }   from './systems/input.js';
import { ParticleSystem} from './systems/particles.js';
import { Physics }       from './world/physics.js';
import { ROOMS, ROOM_MAP } from './world/rooms.js';
import { Renderer }      from './world/renderer.js';
import { Player }        from './entities/player.js';
import { makeEnemy, updateEnemyAI, hurtEnemy, killEnemy, _makeProj } from './entities/enemies.js';
import { Boss }          from './entities/boss.js';
import { UI }            from './ui/ui.js';
import { QuestSystem }   from './systems/quests.js';

// ── Camera ────────────────────────────────────────
class Camera {
  constructor() { this.x = 0; this.y = 0; }
  follow(player, room) {
    const tx = player.x + player.w/2 - W/2;
    const ty = player.y + player.h/2 - H * 0.45;
    // Smoother easing: faster follow when far, slower when close
    const easeX = Math.abs(tx - this.x) > 50 ? 0.14 : 0.08;
    const easeY = Math.abs(ty - this.y) > 50 ? 0.14 : 0.08;
    this.x += (tx - this.x) * easeX;
    this.y += (ty - this.y) * easeY;
    this.x = Math.max(0, Math.min(this.x, room.pixelW - W));
    this.y = Math.max(0, Math.min(this.y, room.pixelH - H));
  }
}

// ── Game ─────────────────────────────────────────
class Game {
  constructor() {
    // Systems
    this.save     = new SaveSystem();
    this.audio    = new AudioSystem();
    this.input    = new InputSystem();
    this.parts    = new ParticleSystem();
    this.physics  = new Physics();
    this.camera   = new Camera();
    this.renderer = new Renderer(document.getElementById('c'));
    this.player   = new Player();
    this.ui       = new UI(this.save, this.audio);
    this.quests   = new QuestSystem(this.save, this.ui, this.audio);

    // State
    this.state = 'menu'; // 'menu'|'playing'|'paused'|'dialogue'|'shop'|'skills'|'quests'|'settings'|'gameover'|'victory'|'interact_menu'
    this.currentRoom = null;
    this.roomEntities = [];
    this.roomNpcs     = [];
    this.roomExits    = [];
    this.boss         = null;

    // Transition
    this.transAlpha     = 0;
    this.transitioning  = false;
    this.transTarget    = null;
    this.transFromDir   = null;
    this.transPhase     = 'idle'; // 'idle' | 'fade-in' | 'load' | 'fade-out'
    this._isLoadingRoom = false; // mutex: prevent re-entrant loadRoom
    this._accumulator   = 0;

    this._wHeld      = false;
    this._sHeld      = false;
    this._escHeld    = false;
    this._prevState  = 'menu';
    this._fpsFrames  = 0;
    this._fpsT0      = 0;
    this.fps         = 60;
    this.frame       = 0;
    this._lastTime   = 0;
    this._raf        = null;
    this._menuHits   = {};
    this._debugMode  = false; // F3 toggle

    // Click/tap handler
    this._bindPointer();
    // Mobile
    this.input.bindMobile();
    this._showMobileControls();

    // Init quests
    this.quests.initQuests();
  }

  // ── Startup ───────────────────────────────────────
  start() {
    this._raf = requestAnimationFrame(t => this._loop(t));
  }

  _loop(timestamp) {
    if (!this._lastTime) {
      this._lastTime = timestamp;
      this._fpsT0 = timestamp;
    }
    let elapsed = timestamp - this._lastTime;
    this._lastTime = timestamp;

    // Cap elapsed time to prevent spiral of death
    if (elapsed > 250) elapsed = 250;

    // FPS counter
    this._fpsFrames++;
    if (this._fpsFrames >= 30) {
      const elapsedFps = timestamp - this._fpsT0;
      this.fps = elapsedFps > 0 ? Math.round(30000 / elapsedFps) : 60;
      this._fpsFrames = 0; this._fpsT0 = timestamp;
    }

    // Pause RAF when hidden to save CPU
    if (document.hidden) {
      this._raf = requestAnimationFrame(t => this._loop(t));
      return;
    }

    this._accumulator += elapsed;
    const fixedDelta = 16.67; // 60 FPS fixed step

    this.input.buildSnapshot();

    // Run updates in fixed steps (max 10 updates to prevent freeze)
    let updatesCount = 0;
    while (this._accumulator >= fixedDelta && updatesCount < 10) {
      this._update(1.0);
      this._accumulator -= fixedDelta;
      this.frame++;
      updatesCount++;
    }

    this._draw();
    this._raf = requestAnimationFrame(t => this._loop(t));
  }

  // ── Update ────────────────────────────────────────
  _update(dt) {
    this.ui.updateNotif();

    if (this.state === 'menu' || this.state === 'gameover' || this.state === 'victory') return;

    if (this.state === 'dialogue') {
      this.ui.advanceDialogue(this.input.JP);
      if (!this.ui.dialogueActive) {
        this.state = this.ui.activePanel === 'shop' ? 'shop' : 'playing';
        this.ui.activePanel = null;
      }
      return;
    }

    if (this.state === 'interact_menu') {
      const jp = this.input.JP;
      const opts = this.ui.interactOptions || [];
      if (opts.length > 0) {
        if (jp.up || (this.input.K['KeyW'] && !this._wHeld)) {
          this._wHeld = true;
          this.ui.interactIdx = (this.ui.interactIdx - 1 + opts.length) % opts.length;
          this.audio.uiClick();
        }
        if (!this.input.K['KeyW']) this._wHeld = false;

        if (jp.down || (this.input.K['KeyS'] && !this._sHeld)) {
          this._sHeld = true;
          this.ui.interactIdx = (this.ui.interactIdx + 1) % opts.length;
          this.audio.uiClick();
        }
        if (!this.input.K['KeyS']) this._sHeld = false;

        if (jp.attack || jp.jump || this.input.K['Enter']) {
          this._handleInteractSelect(opts[this.ui.interactIdx]);
        }
      }

      if (this.input.K['Escape'] || jp.dash) {
        this.state = 'playing';
        this.audio.uiBack();
      }
      return;
    }

    if (this.state === 'paused' || this.state === 'shop' || this.state === 'skills'
        || this.state === 'quests' || this.state === 'settings') return;

    if (this.transitioning) { this._updateTransition(); return; }

    // Playing
    this._updatePlayer(dt);
    this._updateEnemies();
    this._updateBoss();
    this.parts.update();

    // Biome weather particles (called per frame, capped internally)
    if (this.currentRoom) {
      this.parts.spawnWeather(this.currentRoom.biome, this.camera.x, this.camera.y, W, H);
    }

    // Pause
    if (this.input.K['Escape'] && !this._escHeld) {
      this._escHeld = true;
      this.state = 'paused';
      this.audio.resume();
    }
    if (!this.input.K['Escape']) this._escHeld = false;

    // Debug overlay toggle (F3)
    if (this.input.K['F3'] && !this._f3Held) {
      this._f3Held  = true;
      this._debugMode = !this._debugMode;
    }
    if (!this.input.K['F3']) this._f3Held = false;
  }

  // ── Player Update ─────────────────────────────────
  _updatePlayer(dt) {
    const pl    = this.player;
    const inp   = this.input;
    const save  = this.save;
    const S     = save.state;
    const phys  = this.physics;
    const parts = this.parts;
    const pal   = biomeColors(this.currentRoom.biome);

    if (pl.dead) {
      pl.vy += PL_GRAV; pl.y += pl.vy;
      if (pl.y - this.camera.y > H + 100) this._die();
      return;
    }
    if (pl.stunTimer > 0) { pl.stunTimer--; pl.vy += PL_GRAV; pl.vx *= 0.85; phys.moveActor(pl, pl.vx, pl.vy); return; }

    const hasWS  = save.hasAbility('wallslide');
    const hasDJ  = save.hasAbility('doublejump');
    const hasDash= save.hasAbility('dash');
    const left   = inp.get('left'), right = inp.get('right');
    const jp     = inp.JP;

    // ── Charge attack ───────────────────────────────
    if (inp.get('attack') && pl.attackCD === 0 && pl.stats.charged && !pl.isCharging && !jp.attack) {
      pl.isCharging  = true;
      pl.chargeTimer = 0;
    }
    if (pl.isCharging) {
      pl.chargeTimer++;
      if (!inp.get('attack') || pl.chargeTimer > 60) {
        // Release
        pl.startAttack(!pl.onGround);
        pl.isCharging = false;
        if (pl.chargeReady) {
          parts.spawnBurst(pl.x+pl.w/2, pl.y+pl.h/2, pal.particle, 16);
          this.audio.attackCharged();
          parts.shake(5, 12);
        }
      }
    }

    // ── Normal attack / combo ───────────────────────
    if (jp.attack && pl.attackCD === 0 && !pl.isCharging) {
      if (!pl.onGround && !pl.stats.airAtk && pl.airAtkDone) {
        // Air attack locked — skip
      } else {
        pl.startAttack(!pl.onGround);
        this.audio.attack();
        // Combo chain
        if (pl.comboWindow > 0) {
          pl.advanceCombo();
          if (pl.comboStep === 2) { this.audio.attackHeavy(); parts.shake(3, 6); }
        } else {
          pl.comboStep   = 0;
          pl.comboWindow = 40;
        }
      }
    }
    if (pl.attackTimer  > 0) pl.attackTimer--;
    if (pl.attackCD     > 0) pl.attackCD--;
    if (pl.comboWindow  > 0) { pl.comboWindow--; if (pl.comboWindow===0) pl.resetCombo(); }

    // ── Dash ────────────────────────────────────────
    const dashBaseCd = Math.round(50 * pl.stats.dashCDMult);
    if (hasDash && jp.dash && pl.dashCD === 0 && !pl.isCharging) {
      pl.dashDir   = left ? -1 : right ? 1 : pl.facing;
      pl.dashTimer = DASH_DUR;
      pl.dashCD    = dashBaseCd;
      parts.spawn(pl.x+pl.w/2, pl.y+pl.h/2, pal.particle, 10, 3);
      this.audio.dash();
    }
    if (pl.dashTimer > 0) {
      pl.dashTimer--;
      pl.vx = pl.dashDir * DASH_SPEED;
      pl.vy = 0;
      parts.spawn(pl.x+pl.w/2, pl.y+pl.h/2, pal.particle, 2, 1.5, 0.3);
      if (pl.dashTimer === 0) pl.vx = pl.dashDir * 2;
    }
    if (pl.dashCD > 0) pl.dashCD--;

    // ── Gravity ─────────────────────────────────────
    if (pl.dashTimer === 0) {
      const ws = hasWS && pl.wallSlide;
      pl.vy += ws ? 0.1 : PL_GRAV;
      if (pl.vy > (ws ? 1.5 : PL_MAXFALL)) pl.vy = ws ? 1.5 : PL_MAXFALL;
    }

    // ── Horizontal ──────────────────────────────────
    if (pl.dashTimer === 0) {
      if (left)        { pl.vx = -PL_SPEED; pl.facing = -1; }
      else if (right)  { pl.vx =  PL_SPEED; pl.facing =  1; }
      else               pl.vx *= 0.72;
    }

    // ── Jump ────────────────────────────────────────
    if (pl.onGround) { pl.jumps = 0; pl.coyoteTime = 7; pl.airAtkDone = false; }
    if (pl.coyoteTime > 0) pl.coyoteTime--;
    if (pl.jumpBuffer > 0) pl.jumpBuffer--;
    if (jp.jump) pl.jumpBuffer = 10;

    if (pl.jumpBuffer > 0) {
      if (hasWS && pl.wallSlide) {
        pl.vy = PL_JUMP; pl.vx = pl.hitWall * -5; pl.jumpBuffer = 0; pl.jumps = 1; pl.wallSlide = false;
        parts.spawn(pl.x+pl.w/2, pl.y+pl.h/2, '#ffffff', 8, 3); this.audio.jump();
      } else if (pl.coyoteTime > 0 || pl.onGround) {
        pl.vy = PL_JUMP; pl.jumpBuffer = 0; pl.jumps = 1; pl.coyoteTime = 0;
        parts.spawnDust(pl.x+pl.w/2, pl.y+pl.h, pal.particle); this.audio.jump();
      } else if (hasDJ && pl.jumps < 2) {
        pl.vy = PL_JUMP * 0.9; pl.jumpBuffer = 0; pl.jumps = 2;
        parts.spawnBurst(pl.x+pl.w/2, pl.y+pl.h/2, '#aabbff', 10); this.audio.jump();
      }
    }
    // Variable height
    if (!inp.get('jump') && pl.vy < -2) pl.vy *= 0.88;

    // Drop through
    if (inp.get('down') && jp.jump && pl.onGround) pl.dropTimer = 12;
    if (pl.dropTimer > 0) pl.dropTimer--;

    // ── Physics move ─────────────────────────────────
    pl.hitWall = 0;
    const wasGround = pl.onGround;
    const prevVy    = pl.vy;
    phys.moveActor(pl, pl.vx, pl.vy, pl.dropTimer > 0);
    if (pl.onGround && !wasGround) {
      parts.spawnDust(pl.x+pl.w/2, pl.y+pl.h, pal.particle);
      this.audio.land();
      // Landing squash effect based on fall speed
      pl.triggerLandSquash(prevVy);
    }

    // Wall detection
    if (!pl.onGround && hasWS) {
      const wr = phys.probeWall(pl);
      pl.hitWall  = (wr > 0 && right) ? 1 : (wr < 0 && left) ? -1 : 0;
      pl.wallSlide = pl.hitWall !== 0;
    } else { pl.wallSlide = false; }

    if (pl.invTimer > 0) pl.invTimer--;

    // ── Animation ────────────────────────────────────
    pl.animTimer++;
    if (pl.animTimer > 6) { pl.animTimer = 0; pl.animFrame = (pl.animFrame+1)%4; }

    // ── Death by falling ─────────────────────────────
    if (pl.y > this.currentRoom.pixelH + 60) { pl.dead = true; }

    // ── Attack hitboxes vs enemies ───────────────────
    const hitbox = pl.getAttackHitbox();
    if (hitbox) {
      let hitAnything = false;
      // vs enemies
      for (const e of this.roomEntities) {
        if (!e.alive || !e.hittable) continue;
        if (e.type === 'collectible' || e.type === 'loot') continue;
        if (phys.overlap(hitbox.ax, hitbox.ay, hitbox.aw, hitbox.ah, e.x, e.y, e.w, e.h)) {
          const killed = hurtEnemy(e, hitbox.dmg, pl.facing, save.hasAbility('nail2'), save, parts, pal.particle, this.audio);
          hitAnything = true;
          parts.floatText(hitbox.isCrit ? '★'+hitbox.dmg : ''+hitbox.dmg,
            e.x+e.w/2, e.y-4, hitbox.isCrit?'#ffcc00':'#ffffff', hitbox.isCrit?14:11);
          if (hitbox.isCrit) { this.audio.critHit(); parts.shake(3, 8); }
          if (killed) {
            const result = killEnemy(e, save, parts, pal.particle, this.audio, this.roomEntities);
            this.quests.onKill(e.type);
            this.quests.onGeoCollected(save.state.geo);
            if (result.leveled) { this.ui.pushNotif('✦ LEVEL UP! LV '+save.state.level, '#aa88ff'); this.audio.levelUp(); }
            this.ui.pushNotif('◈ +'+result.geo, '#ffd700');
          }
          // Soul on hit (relic)
          if (save.hasRelic('soul_siphon')) save.state.soul = Math.min(save.state.soul+5, save.state.maxSoul);
        }
      }
      // vs boss
      if (this.boss && this.boss.alive) {
        if (phys.overlap(hitbox.ax, hitbox.ay, hitbox.aw, hitbox.ah, this.boss.x, this.boss.y, this.boss.w, this.boss.h)) {
          const result = this.boss.hurt(hitbox.dmg, pl.facing, parts, this.audio, pal.particle, this.audio);
          hitAnything = true;
          parts.floatText(hitbox.isCrit?'★'+hitbox.dmg:''+hitbox.dmg, this.boss.x+this.boss.w/2, this.boss.y-8,
            hitbox.isCrit?'#ffcc00':'#ffffff', hitbox.isCrit?14:11);
          if (result === 'dead') this._bossKilled();
          else if (result === 'phase') {
            this.ui.pushNotif('⚠ '+this.boss.bossType.toUpperCase()+' — PHASE '+ this.boss.phase, '#ff6644');
            parts.shake(8, 25);
          }
        }
      }
      // Nail bounce: if hit something and airborne, bounce upward
      if (hitAnything && !pl.onGround && inp.get('jump')) {
        pl.vy = PL_JUMP * 0.7; pl.jumps = 1;
      }
    }

    // ── Exits ────────────────────────────────────────
    if (!this.transitioning) {
      for (const exit of this.roomExits) {
        let hit = false;
        if (exit.dir==='right' && pl.x+pl.w >= exit.wx - 4 && Math.abs(pl.y+pl.h/2-(exit.wy+TILE/2)) < TILE*2.5) hit=true;
        if (exit.dir==='left'  && pl.x <= exit.wx+TILE+4 && pl.x <= exit.wx+4 && Math.abs(pl.y+pl.h/2-(exit.wy+TILE/2)) < TILE*2.5) hit=true;
        if (exit.dir==='up'    && pl.y <= exit.wy+TILE && pl.y >= exit.wy-10 && Math.abs(pl.x+pl.w/2-(exit.wx+TILE/2)) < TILE*3) hit=true;
        if (exit.dir==='down'  && pl.y+pl.h >= exit.wy && Math.abs(pl.x+pl.w/2-(exit.wx+TILE/2)) < TILE*3) hit=true;
        if (hit) {
          if (this.boss && this.boss.alive && this.boss.arenaLocked) {
            this.ui.pushNotif('⚠ EXIT SEALED BY THE FOG', '#ff4444');
            this.parts.spawn(pl.x+pl.w/2, pl.y+pl.h/2, '#ff4444', 6, 2);
            if (exit.dir === 'right') { pl.x -= 8; pl.vx = -4; }
            if (exit.dir === 'left') { pl.x += 8; pl.vx = 4; }
            if (exit.dir === 'up') { pl.y += 8; pl.vy = 4; }
            if (exit.dir === 'down') { pl.y -= 8; pl.vy = -4; }
            break;
          }
          this._startTransition(exit.to, exit.dir);
          break;
        }
      }
    }

    // ── NPC proximity ────────────────────────────────
    for (const npc of this.roomNpcs) {
      const near = Math.abs(pl.x+pl.w/2 - npc.wx) < 36 && Math.abs(pl.y+pl.h/2 - npc.wy) < 40;
      if (near && inp.JP.up) {
        this._openInteractMenu('npc', npc);
      }
    }

    // ── Collectibles ─────────────────────────────────
    for (const e of this.roomEntities) {
      if (e.collected) continue;
      if (e.type === 'collectible') {
        if (!phys.overlap(pl.x, pl.y, pl.w, pl.h, e.x, e.y, e.w, e.h)) continue;
        e.collected = true;
        if (!save.state.collected.includes(e.cid)) save.state.collected.push(e.cid);
        if (e.colType === 'geo') {
          save.state.geo += e.val; this.audio.coin();
          this.ui.pushNotif('◈ +'+e.val, '#ffd700');
          this.quests.onGeoCollected(save.state.geo);
          parts.spawnBurst(e.x, e.y, '#ffd700', 8);
        } else if (e.colType === 'health') {
          save.state.hp = Math.min(save.state.hp + 2, save.state.maxHp);
          this.audio.ability(); this.ui.pushNotif('♥ +2 HEALTH', '#cc3344');
        } else if (e.colType === 'shard') {
          save.state.shards++;
          this.audio.secret(); this.ui.pushNotif('✦ SHARD ('+ save.state.shards+'/3)', '#e8d5a0');
          this.quests.onShardCollected(save.state.shards);
          parts.spawnBurst(e.x, e.y, '#e8d5a0', 14);
          if (save.state.shards >= 3 && save.state.completedQuests.includes('main_3'))
            this.ui.pushNotif('✦ THREE SHARDS — Ascend to the Temple!', '#e8d5a0');
        }
        save.write();
      } else if (e.type === 'loot') {
        const near = Math.abs(pl.x+pl.w/2 - (e.x+e.w/2)) < 30 && Math.abs(pl.y+pl.h/2 - (e.y+e.h/2)) < 30;
        if (near && inp.JP.up) {
          this._openInteractMenu('loot', e);
        }
      }
    }

    // Hurt by enemies / projectiles
    this._checkPlayerHurt();
    // Thorn relic
    if (save.hasRelic('thorn_cloak') && pl.invTimer === 0) {
      // handled in _checkPlayerHurt
    }
    // Squash/stretch tick
    pl.tickSquash();
    // Stamina regeneration
    pl.tickStamina();
    // State machine update
    pl.updateState();

    this.camera.follow(pl, this.currentRoom);
    // NOTE: save.write() removed from here — was called 60x/sec.
    // Writing is now triggered by meaningful events only.
  }

  _checkPlayerHurt() {
    const pl   = this.player;
    const save = this.save;
    const S    = save.state;
    const phys = this.physics;
    if (pl.invTimer > 0 || pl.dead) return;

    for (const e of this.roomEntities) {
      if (!e.alive || e.type === 'collectible' || e.type === 'loot') continue;
      let overlap = false;
      const dmg = e.dmg || 1;
      if (e.type === 'proj') {
        if (!e.alive) continue;
        overlap = phys.overlap(pl.x, pl.y, pl.w, pl.h, e.x, e.y, e.w, e.h);
        if (overlap) e.alive = false;
      } else if (e.alive && e.hittable) {
        overlap = phys.overlap(pl.x+2, pl.y+2, pl.w-4, pl.h-4, e.x, e.y, e.w, e.h);
      }
      if (overlap) {
        this._hurtPlayer(dmg);
        if (this.save.hasRelic('thorn_cloak')) {
          const killed = hurtEnemy(e, 1, -pl.facing, false, save, this.parts, biomeColors(this.currentRoom.biome).particle, this.audio);
          if (killed) {
            const result = killEnemy(e, save, this.parts, biomeColors(this.currentRoom.biome).particle, this.audio, this.roomEntities);
            this.quests.onKill(e.type);
            this.quests.onGeoCollected(save.state.geo);
            if (result.leveled) { this.ui.pushNotif('✦ LEVEL UP! LV '+save.state.level, '#aa88ff'); this.audio.levelUp(); }
            this.ui.pushNotif('◈ +'+result.geo, '#ffd700');
          }
        }
        break;
      }
    }
    if (this.boss && this.boss.alive) {
      const b = this.boss;
      if (phys.overlap(pl.x+2, pl.y+2, pl.w-4, pl.h-4, b.x, b.y, b.w, b.h)) this._hurtPlayer(2);
    }
  }

  _hurtPlayer(dmg) {
    const pl = this.player; const S = this.save.state;
    // Berserker relic: more damage below 25% HP (enemy gets more from player, player gets same)
    S.hp = Math.max(0, S.hp - dmg);
    pl.invTimer = 60; pl.stunTimer = 8;
    pl.vx = pl.facing * -3; pl.vy = -4;
    this.parts.spawnHitSpark(pl.x+pl.w/2, pl.y+pl.h/2, '#cc3344', -pl.facing);
    this.parts.shake(5, 14);
    this.audio.takeDmg(); this.save.write();
    if (S.hp <= 0) { pl.dead = true; this.audio.die(); }
  }

  _openInteractMenu(type, target) {
    this.state = 'interact_menu';
    this.ui.interactIdx = 0;
    this.ui.interactTarget = target;
    this.ui.interactType = type;

    if (type === 'npc') {
      this.ui.interactTitle = target.name;
      if (target.isMerchant) {
        this.ui.interactOptions = [
          { label: 'Talk', action: 'talk' },
          { label: 'Trade', action: 'trade' },
          { label: 'Cancel', action: 'cancel' }
        ];
      } else {
        this.ui.interactOptions = [
          { label: 'Talk', action: 'talk' },
          { label: 'Cancel', action: 'cancel' }
        ];
      }
    } else if (type === 'loot') {
      this.ui.interactTitle = target.name;
      this.ui.interactOptions = [
        { label: 'Take ' + target.name, action: 'take' },
        { label: 'Cancel', action: 'cancel' }
      ];
    }
  }

  _handleInteractSelect(opt) {
    const target = this.ui.interactTarget;
    const type = this.ui.interactType;

    this.audio.uiClick();

    if (opt.action === 'cancel') {
      this.state = 'playing';
    } else if (opt.action === 'talk') {
      target.interacted = true;
      if (!this.save.state.seenNpcs.includes(target.id)) this.save.state.seenNpcs.push(target.id);
      this.quests.onNPCTalked(target.id);
      this.ui.showDialogue(target.name, target.lines, false, target.id);
      this.state = 'dialogue';
      this.save.write();
    } else if (opt.action === 'trade') {
      this.state = 'shop';
      this.ui.activePanel = 'shop';
      this.ui.isMerchant = false;
      this.ui.merchantNpcId = target.id;
    } else if (opt.action === 'take') {
      if (!this.save.state.abilities.includes(target.ability)) {
        target.collected = true;
        this.save.state.abilities.push(target.ability);
        this.audio.ability();
        this.parts.spawnBurst(target.x+10, target.y+10, '#ffd700', 20);
        this.ui.showDialogue('ABILITY GAINED', [target.name, target.desc]);
        this.state = 'dialogue';
        this.save.write();
      }
    }
  }

  // ── Enemy Update ──────────────────────────────────
  _updateEnemies() {
    const pal   = biomeColors(this.currentRoom.biome);
    const moveA = (a,dx,dy) => this.physics.moveActor(a, dx, dy);
    const rSolid = (x,y,w,h) => this.physics.rectSolid(x,y,w,h);

    for (let i = this.roomEntities.length-1; i >= 0; i--) {
      const e = this.roomEntities[i];
      if (!e.alive && e.type !== 'collectible' && e.type !== 'loot') {
        this.roomEntities.splice(i, 1); continue;
      }
      if (e.type === 'proj') {
        e.x += e.vx; e.y += e.vy; e.life--;
        if (e.life <= 0 || this.physics.rectSolid(e.x, e.y, e.w, e.h)) {
          e.alive = false;
          this.parts.spawn(e.x, e.y, e.color, 4, 2, 0.3);
        }
        continue;
      }
      if (!e.type || e.type === 'collectible' || e.type === 'loot') continue;
      // Pass physics for LOS check
      updateEnemyAI(e, this.player, this.roomEntities, moveA, rSolid, pal.particle, this.parts, this.frame, this.physics);
    }
  }

  // ── Boss Update ───────────────────────────────────
  _updateBoss() {
    if (!this.boss || !this.boss.alive) return;
    const moveA = (actor, dx, dy) => this.physics.moveActor(actor, dx, dy);
    this.boss.update(this.player, this.roomEntities, moveA, this.parts, this.audio);
  }

  _bossKilled() {
    const b = this.boss;
    const S = this.save.state;
    S.defeated.push(this.currentRoom.id + '_boss');
    S.geo += b.geo; S.maxHp = Math.min(S.maxHp + 2, 14); S.hp = S.maxHp;
    const leveled = this.save.addXP(b.xp);
    this.parts.spawnExplosion(b.x+b.w/2, b.y+b.h/2, biomeColors(this.currentRoom.biome).particle);
    this.audio.boss();
    this.ui.showStageClearedCard(b.bossType);
    this.quests.onBossKilled(b.bossType);
    if (leveled) { this.ui.pushNotif('✦ LEVEL UP! LV '+S.level, '#aa88ff'); this.audio.levelUp(); }
    this.boss = null;
    this.save.forceWrite(); // Critical save: use forceWrite() to bypass throttle
    if (this.currentRoom.isFinal) { setTimeout(() => { this.state = 'victory'; }, 2500); }
  }

  _die() {
    this.state = 'gameover';
    this.save.state.hp = this.save.state.maxHp;
    this.save.forceWrite(); // Critical: ensure save on death
  }

  // ── Room loading ──────────────────────────────────
  loadRoom(roomId, spawnOverride) {
    const room = ROOM_MAP[roomId];
    if (!room) return;
    this.currentRoom = room;
    this.save.state.currentRoom = roomId;

    this.physics.loadRoom(room.tiles);
    this.renderer.markTilesDirty();

    // Build entity list
    this.roomEntities = [];
    this.boss = null;

    (room.enemies || []).forEach(e => {
      const eid = roomId + '_' + e.tx + '_' + e.ty;
      if (this.save.state.defeated.includes(eid)) return;
      this.roomEntities.push(makeEnemy(e.type, e.tx * TILE, e.ty * TILE));
    });

    (room.collectibles || []).forEach(c => {
      const cid = roomId + '_col_' + c.tx + '_' + c.ty;
      if (this.save.state.collected.includes(cid)) return;
      const ent = { type:'collectible', colType:c.type, x:c.tx*TILE, y:c.ty*TILE, w:10, h:10,
        alive:true, hittable:false, collected:false, val:c.val||1, cid, phase:Math.random()*Math.PI*2 };
      this.roomEntities.push(ent);
    });

    if (room.loot && !this.save.state.abilities.includes(room.loot.ability)) {
      const l = room.loot;
      this.roomEntities.push({ type:'loot', x:l.tx*TILE, y:l.ty*TILE, w:20, h:20,
        alive:true, hittable:false, collected:false, ability:l.ability, name:l.name, desc:l.desc });
    }

    if (room.boss && !this.save.state.defeated.includes(roomId + '_boss')) {
      const b    = room.boss;
      this.boss  = new Boss(b.type, b.tx * TILE, b.ty * TILE, roomId);
      // Give boss its room bounds so VoidKing can clamp teleport
      this.boss.setRoomBounds(room.pixelW, room.pixelH);
      this.audio.startBossMusic(b.type);
    } else {
      this.audio.startAmbient(room.biome);
    }

    this.roomNpcs  = (room.npcs  || []).map(n => ({ ...n, wx:n.tx*TILE, wy:n.ty*TILE, interacted:false }));
    this.roomExits = (room.exits || []).map(e => ({ ...e, wx:e.tx*TILE, wy:e.ty*TILE }));

    // Clear ghost particles from previous room
    this.parts.reset();

    // Spawn
    const sx = spawnOverride ? spawnOverride.x : room.spawnTx * TILE;
    const sy = spawnOverride ? spawnOverride.y : room.spawnTy * TILE;
    this.player.reset(sx, sy);
    this.player.refreshStats(this.save);

    this.camera.x = Math.max(0, this.player.x - W/2);
    this.camera.y = Math.max(0, this.player.y - H/2);

    this.ui.drawMinimap(roomId, ROOMS, 0);
  }

  // ── Room transition ───────────────────────────────
  _startTransition(toRoom, fromDir) {
    if (this.transitioning) return;
    this.transitioning  = true;
    this.transTarget    = toRoom;
    this.transFromDir   = fromDir;
    this.transAlpha     = 0;
    this.transPhase     = 'fade-in';
    this.save.state.spawnRoom = toRoom;
    this.save.write();
  }

  _updateTransition() {
    if (this.transPhase === 'fade-in') {
      this.transAlpha += 0.08;
      if (this.transAlpha >= 1.0) {
        this.transAlpha = 1.0;
        this.transPhase = 'load';
      }
    } else if (this.transPhase === 'load') {
      if (this._isLoadingRoom) return;
      this._isLoadingRoom = true;
      try {
        const spawnDir = { right:'left', left:'right', up:'down', down:'up' }[this.transFromDir];
        const destRoom = ROOM_MAP[this.transTarget];
        if (!destRoom) throw new Error(`Unknown room: ${this.transTarget}`);
        let spawnOverride = null;
        const matchExit = (destRoom.exits||[]).find(e => e.dir === spawnDir);
        if (matchExit) {
          const rows = destRoom.tiles.length, cols = destRoom.tiles[0].length;
          if (spawnDir==='left')  spawnOverride = { x:2*TILE,         y:matchExit.ty*TILE };
          if (spawnDir==='right') spawnOverride = { x:(cols-3)*TILE,  y:matchExit.ty*TILE };
          if (spawnDir==='down')  spawnOverride = { x:matchExit.tx*TILE, y:(rows-4)*TILE };
          if (spawnDir==='up')    spawnOverride = { x:matchExit.tx*TILE, y:2*TILE };
        }
        this.loadRoom(this.transTarget, spawnOverride);
        if (destRoom.area) this.ui.showTransitionCard(destRoom.area);
        this.transPhase = 'fade-out';
      } catch(err) {
        console.error('[Game] Room transition failed:', err);
        this.transitioning = false;
        this.transAlpha = 0;
        this.transPhase = 'idle';
      } finally {
        this._isLoadingRoom = false;
      }
    } else if (this.transPhase === 'fade-out') {
      this.transAlpha -= 0.08;
      if (this.transAlpha <= 0) {
        this.transAlpha = 0;
        this.transitioning = false;
        this.transPhase = 'idle';
      }
    }
  }

  // ── Draw ─────────────────────────────────────────
  _draw() {
    const ctx = this.renderer.ctx;

    if (this.state === 'menu') {
      ctx.fillStyle = '#06050e'; ctx.fillRect(0,0,W,H);
      this._menuHits = this.ui.drawMainMenu(this.frame);
      this.ui.drawNotif();
      if (this.save.state.settings.showFPS) this.ui.drawFPS(this.fps);
      return;
    }
    if (this.state === 'gameover') {
      ctx.fillStyle = '#06050e'; ctx.fillRect(0,0,W,H);
      this._menuHits = this.ui.drawGameOver({ geo: this.save.state.geo });
      return;
    }
    if (this.state === 'victory') {
      ctx.fillStyle = '#06050e'; ctx.fillRect(0,0,W,H);
      this._menuHits = this.ui.drawVictory(this.save);
      return;
    }

    if (!this.currentRoom) return;

    // World render
    this.renderer.render(
      this.currentRoom, this.camera, this.player,
      this.roomEntities, this.boss, this.roomNpcs, this.roomExits,
      this.parts, this.frame, this.save.state.settings
    );

    // Overlays
    if (this.state === 'paused')   { this._menuHits = this.ui.drawPauseMenu(); }
    if (this.state === 'shop')     { this._menuHits = this.ui.drawShop(); }
    if (this.state === 'skills')   { this._menuHits = this.ui.drawSkillTree(); }
    if (this.state === 'quests')   { this._menuHits = this.ui.drawQuestLog(); }
    if (this.state === 'settings') { this._menuHits = this.ui.drawSettingsMenu(this.save.state.settings); }
    if (this.state === 'interact_menu') { this._menuHits = this.ui.drawInteractMenu(); }

    // HUD always on top (except full-screen panels)
    if (this.state === 'playing' || this.state === 'dialogue' || this.state === 'interact_menu') {
      this.ui.drawHUD(this.player, this.save, this.currentRoom, this.boss);
      this.ui.drawMinimap(this.currentRoom.id, ROOMS, this.frame);
    }
    this.ui.drawTransitionCard();
    this.ui.drawStageClearedCard();
    this.ui.drawDialogue();
    this.ui.drawNotif();
    this.renderer.drawTransition(this.transAlpha);
    if (this.save.state.settings.showFPS) this.ui.drawFPS(this.fps);
    if (this._debugMode) {
      this.ui.drawDebug(this.state, this.roomEntities.length, this.currentRoom, this.fps);
    }
  }

  // ── Pointer input for menus ───────────────────────
  _bindPointer() {
    const handler = (cx2, cy2) => {
      this.audio.resume();
      const hits = this._menuHits || {};

      if (this.state === 'menu') {
        if (hits.playBtn && this.ui.isHit(hits.playBtn, cx2, cy2)) this._beginGame();
        if (hits.settingsBtn && this.ui.isHit(hits.settingsBtn, cx2, cy2)) { this._prevState='menu'; this.state = 'settings'; this.audio.uiClick(); }
        return;
      }
      if (this.state === 'gameover') {
        if (hits.retry && this.ui.isHit(hits.retry, cx2, cy2)) this._respawn();
        if (hits.menu  && this.ui.isHit(hits.menu, cx2, cy2))  this.state = 'menu';
        return;
      }
      if (this.state === 'victory') {
        if (hits.newGame && this.ui.isHit(hits.newGame, cx2, cy2)) { this.save.reset(); location.reload(); }
        return;
      }
      if (this.state === 'paused') {
        if (hits.resume   && this.ui.isHit(hits.resume,   cx2, cy2)) { this.state = 'playing'; this.audio.uiClick(); }
        if (hits.skills   && this.ui.isHit(hits.skills,   cx2, cy2)) { this.state = 'skills';  this.audio.uiClick(); }
        if (hits.quests   && this.ui.isHit(hits.quests,   cx2, cy2)) { this.state = 'quests';  this.audio.uiClick(); }
        if (hits.settings && this.ui.isHit(hits.settings, cx2, cy2)) { this._prevState='paused'; this.state='settings'; this.audio.uiClick(); }
        if (hits.menu     && this.ui.isHit(hits.menu,     cx2, cy2)) { this.state = 'menu'; this.audio.uiBack(); }
        return;
      }
      if (this.state === 'settings') {
        if (hits._back && this.ui.isHit(hits._back, cx2, cy2)) {
          this.audio.uiBack();
          this.state = this._prevState || 'menu';
          this._prevState = null; return;
        }
        // Toggles / sliders
        for (const [key, btn] of Object.entries(hits)) {
          if (key === '_back') continue;
          if (this.ui.isHit(btn, cx2, cy2)) {
            const S = this.save.state.settings;
            if (btn.isSlider) {
              S[key] = Math.max(btn.min, Math.min(btn.max, (cx2-btn.x)/btn.w));
              if (key === 'musicVol') this.audio.setMusicVol(S.musicVol);
              if (key === 'sfxVol')   this.audio.setSfxVol(S.sfxVol);
            } else if (typeof S[key] === 'boolean') {
              S[key] = !S[key];
            } else if (typeof S[key] === 'string') {
              const opts = ['auto','on','off'];
              S[key] = opts[(opts.indexOf(S[key])+1)%opts.length];
              this._showMobileControls();
            }
            this.save.write(); this.audio.uiClick();
          }
        }
        return;
      }
      if (this.state === 'shop') {
        if (hits._close && this.ui.isHit(hits._close, cx2, cy2)) { this.state='playing'; this.audio.uiBack(); return; }
        for (const [id, btn] of Object.entries(hits)) {
          if (id==='_close') continue;
          if (this.ui.isHit(btn, cx2, cy2)) this._buyItem(btn.item);
        }
        return;
      }
      if (this.state === 'skills') {
        if (hits._back && this.ui.isHit(hits._back, cx2, cy2)) { this.state='paused'; this.audio.uiBack(); return; }
        for (const [id, btn] of Object.entries(hits)) {
          if (id==='_back') continue;
          if (this.ui.isHit(btn, cx2, cy2)) {
            if (this.save.unlockSkill(id, btn.skill)) {
              this.audio.ability(); this.ui.pushNotif('✦ '+btn.skill.name+' unlocked!', '#aa88ff');
              this.player.refreshStats(this.save);
            }
          }
        }
        return;
      }
      if (this.state === 'quests') {
        if (hits._back && this.ui.isHit(hits._back, cx2, cy2)) { this.state='paused'; this.audio.uiBack(); }
        return;
      }
      if (this.state === 'interact_menu') {
        for (const [key, btn] of Object.entries(hits)) {
          if (this.ui.isHit(btn, cx2, cy2)) {
            this._handleInteractSelect(btn.option);
            break;
          }
        }
        return;
      }
    };

    const cvs = document.getElementById('c');
    const getCoords = (e, touch=false) => {
      const r = cvs.getBoundingClientRect();
      const scaleX = W / r.width, scaleY = H / r.height;
      if (touch) {
        const t = e.changedTouches[0];
        return [(t.clientX-r.left)*scaleX, (t.clientY-r.top)*scaleY];
      }
      return [(e.clientX-r.left)*scaleX, (e.clientY-r.top)*scaleY];
    };
    cvs.addEventListener('click', e => { const [x,y]=getCoords(e); handler(x,y); });
    cvs.addEventListener('touchend', e => {
      e.preventDefault();
      const [x,y]=getCoords(e,true); handler(x,y);
    }, { passive:false });
  }

  _beginGame() {
    this.state = 'playing';
    this.player.refreshStats(this.save);
    this.loadRoom(this.save.state.currentRoom);
    this.audio.startAmbient(this.currentRoom.biome);
    this.audio.resume();
  }

  _respawn() {
    this.state = 'playing';
    this.save.state.hp = this.save.state.maxHp;
    this.player.dead = false;
    this.loadRoom(this.save.state.spawnRoom);
  }

  _buyItem(item) {
    const S = this.save.state;
    if (S.geo < item.cost) { this.ui.pushNotif('Not enough geo!','#cc4444'); return; }
    if (item.type === 'relic' && S.ownedRelics.includes(item.relicId)) { this.ui.pushNotif('Already owned','#ffffff55'); return; }
    S.geo -= item.cost;
    if (item.type === 'consumable') { if(item.effect.hp) S.hp = Math.min(S.hp+item.effect.hp, S.maxHp); }
    if (item.type === 'upgrade')    { if(item.effect.maxHp){S.maxHp+=item.effect.maxHp;S.stats.maxHp+=item.effect.maxHp;} if(item.effect.damage) S.stats.damage+=item.effect.damage; }
    if (item.type === 'relic')      { S.ownedRelics.push(item.relicId); this.save.equipRelic(item.relicId); }
    this.save.write(); this.player.refreshStats(this.save);
    this.audio.purchase(); this.ui.pushNotif('Purchased: '+item.name,'#ffd700');
  }

  _showMobileControls() {
    const mc = document.getElementById('mctl');
    if (!mc) return;
    const setting = this.save.state.settings.mobileControls;
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    mc.classList.toggle('on', setting==='on' || (setting==='auto' && isTouch));
  }
}

// ── Bootstrap ─────────────────────────────────────
const game = new Game();
game.start();
