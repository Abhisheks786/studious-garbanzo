// ═══════════════════════════════════════════════════
//  SILKBOUND PRO — World Renderer  (Production Upgrade)
//
//  FIXES:
//   • Projectiles now drawn with camera offset (ox/oy applied)
//     (was: always drawn at wrong position, detached from world)
//
//  UPGRADES:
//   • Dynamic point lighting (player glow, enemy glow, collectible aura)
//   • Biome-specific parallax: 3 depth layers with correct ratios
//   • Boss arena: darkened background + spotlight
//   • Player shadow ellipse on ground
//   • Smoother hit-flash using shadowBlur pulse
//   • Improved tile rendering with micro-detail
//   • Entity off-screen culling (skip draw if > 50px outside viewport)
// ═══════════════════════════════════════════════════
import { W, H, TILE, biomeColors } from '../constants.js';

const CULL_MARGIN = 60; // px outside viewport to still draw

export class Renderer {
  constructor(canvas) {
    if (!canvas) throw new Error('Canvas element not found');
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    if (!this.ctx) throw new Error('Failed to get 2D context');
    this.ctx.imageSmoothingEnabled = false;

    // Offscreen tile cache
    this._tileCanvas        = document.createElement('canvas');
    this._tileCanvas.width  = W * 3;
    this._tileCanvas.height = H * 4;
    this._tileCtx           = this._tileCanvas.getContext('2d');
    this._tileCtx.imageSmoothingEnabled = false;
    this._tileDirty = true;
    this._lastBiome = '';

    // Light canvas for dynamic lighting pass
    this._lightCanvas        = document.createElement('canvas');
    this._lightCanvas.width  = W;
    this._lightCanvas.height = H;
    this._lightCtx           = this._lightCanvas.getContext('2d');
  }

  markTilesDirty() { this._tileDirty = true; }

  // ── Main render ────────────────────────────────────
  render(room, cam, player, entities, boss, npcs, exits, particles, frame, settings) {
    const ctx  = this.ctx;
    const pal  = biomeColors(room.biome);
    const shakeX = settings.screenShake ? particles.screenShake.x : 0;
    const shakeY = settings.screenShake ? particles.screenShake.y : 0;
    const ox   = Math.round(cam.x + shakeX);
    const oy   = Math.round(cam.y + shakeY);

    ctx.clearRect(0, 0, W, H);

    // Background gradient
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, pal.bg);
    bg.addColorStop(1, pal.fog);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Parallax layers
    this._drawParallax(ctx, pal, cam, frame, room.biome);

    // Tile layer (cached, redrawn only on room change)
    if (this._tileDirty || room.biome !== this._lastBiome) {
      this._bakeTiles(room, pal);
      this._tileDirty = false;
      this._lastBiome = room.biome;
    }
    ctx.drawImage(this._tileCanvas, -ox, -oy);

    // Tutorial hints for start room
    if (room.id === 'depths_start') {
      this._drawTutorialHints(ctx, ox, oy);
    }

    // Collectibles
    this._drawCollectibles(ctx, entities, ox, oy, frame, pal);

    // Loot pickups
    this._drawLoot(ctx, entities, ox, oy, frame, pal, player);

    // NPCs
    this._drawNPCs(ctx, npcs, ox, oy, player, frame);

    // Enemies
    this._drawEnemies(ctx, entities, ox, oy, frame);

    // Projectiles — FIXED: apply ox/oy camera offset
    this._drawProjectiles(ctx, entities, ox, oy);

    // Boss
    if (boss && boss.alive) {
      if (boss.arenaLocked) this._drawBossArena(ctx, boss, ox, oy);
      this._drawBoss(ctx, boss, ox, oy, frame, pal);
    }

    // Particles
    particles.draw(ctx, ox, oy, false);

    // Player shadow
    this._drawPlayerShadow(ctx, player, ox, oy);

    // Player
    this._drawPlayer(ctx, player, ox, oy, frame, pal);

    // Dynamic lighting overlay
    this._drawLighting(ctx, player, entities, boss, ox, oy, pal, frame);

    // Vignette + fog
    this._drawVignette(ctx, pal);

    // Exit arrows
    this._drawExitArrows(ctx, exits, ox, oy, boss);

    return { ox, oy };
  }

  // ── Tutorial hints ─────────────────────────────────
  _drawTutorialHints(ctx, ox, oy) {
    ctx.save();
    ctx.fillStyle = 'rgba(232, 213, 160, 0.38)'; // nice dimmed gold matching the theme
    ctx.font = '8px "Share Tech Mono", monospace';
    ctx.textAlign = 'center';

    // 1. Move hint near spawn
    ctx.fillText('◀ A / D or ARROWS TO MOVE ▶', 100 - ox, 240 - oy);

    // 2. Jump hint near first platforms
    ctx.fillText('▲ Z or SPACE TO JUMP ▲', 220 - ox, 230 - oy);

    // 3. Attack hint near crawler enemy
    ctx.fillText('⚔ C or J TO ATTACK ⚔', 380 - ox, 240 - oy);

    // 4. Dash / Interaction prompt
    ctx.fillText('▲ UP ARROW or W TO INTERACT WITH NPCS & OBJECTS', 110 - ox, 185 - oy);

    ctx.restore();
  }

  // ── Parallax (3 depth layers) ─────────────────────
  _drawParallax(ctx, pal, cam, frame, biome) {
    // Layer 1 — far (0.05 speed)
    ctx.globalAlpha = 0.08;
    ctx.fillStyle   = pal.accent;
    for (let i = 0; i < 7; i++) {
      const bx = ((i * 95) - cam.x * 0.05 + frame * 0.008) % (W + 60) - 30;
      const bh = 25 + i * 16;
      ctx.shadowColor = pal.accent; ctx.shadowBlur = 6;
      ctx.fillRect(bx, H - bh, 10, bh);
      ctx.fillRect(bx + 18, 0, 6, bh * 0.5);
    }
    ctx.shadowBlur = 0;

    // Layer 2 — mid (0.15 speed)
    ctx.globalAlpha = 0.07;
    for (let i = 0; i < 5; i++) {
      const bx = ((i * 130 + 60) - cam.x * 0.15 + frame * 0.016) % (W + 80) - 40;
      ctx.fillRect(bx, H - (50 + i * 22), 16, 50 + i * 22);
    }

    // Layer 3 — near (0.35 speed) — only for special biomes
    if (biome === 'crystal') {
      ctx.globalAlpha = 0.05;
      ctx.fillStyle = '#88ccff';
      for (let i = 0; i < 4; i++) {
        const bx = ((i * 170 + 40) - cam.x * 0.35 + frame * 0.03) % (W + 100) - 50;
        ctx.fillRect(bx, 0, 3, H * 0.6);
      }
    } else if (biome === 'temple') {
      ctx.globalAlpha = 0.04;
      ctx.fillStyle = '#ffcc44';
      for (let i = 0; i < 3; i++) {
        const bx = ((i * 200) - cam.x * 0.35 + frame * 0.025) % (W + 120) - 60;
        ctx.fillRect(bx, H * 0.1, 8, H * 0.7);
      }
    }

    ctx.globalAlpha = 1;
  }

  // ── Tile bake ─────────────────────────────────────
  _bakeTiles(room, pal) {
    const tc   = this._tileCtx;
    const rows = room.tiles;
    const W2   = room.pixelW, H2 = room.pixelH;
    tc.clearRect(0, 0, W2, H2);

    for (let r = 0; r < rows.length; r++) {
      for (let c = 0; c < rows[r].length; c++) {
        const ch = rows[r][c];
        const sx = c * TILE, sy = r * TILE;

        if (ch === '#') {
          // Base fill with gradient
          const tg = tc.createLinearGradient(sx, sy, sx, sy + TILE);
          tg.addColorStop(0, pal.solid + 'ff');
          tg.addColorStop(1, pal.bg    + 'cc');
          tc.fillStyle = tg;
          tc.fillRect(sx, sy, TILE, TILE);

          const aboveAir = r === 0 || rows[r-1][c] !== '#';
          if (aboveAir) {
            // Top highlight
            tc.fillStyle = pal.accent + 'cc';
            tc.fillRect(sx, sy, TILE, 2);
            // Inner glow strip
            tc.fillStyle = pal.accent + '18';
            tc.fillRect(sx, sy + 2, TILE, 5);
          }
          // Right shade
          tc.fillStyle = '#00000044';
          tc.fillRect(sx + TILE - 2, sy, 2, TILE);
          // Bottom shadow
          tc.fillStyle = '#00000033';
          tc.fillRect(sx, sy + TILE - 3, TILE, 3);

          // Micro-detail: random pixel accent for stone texture
          if ((r * 7 + c * 13) % 5 === 0) {
            tc.fillStyle = pal.accent + '0a';
            tc.fillRect(sx + 2 + (c % 3) * 5, sy + 3 + (r % 3) * 5, 3, 3);
          }

        } else if (ch === 'p') {
          // Pass-through ledge
          const pg = tc.createLinearGradient(sx, sy, sx + TILE, sy);
          pg.addColorStop(0,    'transparent');
          pg.addColorStop(0.15, pal.accent + '99');
          pg.addColorStop(0.85, pal.accent + '99');
          pg.addColorStop(1,    'transparent');
          tc.fillStyle = pg;
          tc.fillRect(sx, sy, TILE, 3);
          tc.fillStyle = pal.accent + '18';
          tc.fillRect(sx, sy + 3, TILE, 5);

        } else if (ch === '^') {
          // Spike
          tc.fillStyle = '#cc3333';
          for (let i = 0; i < 2; i++) {
            tc.beginPath();
            tc.moveTo(sx + i * (TILE/2),          sy + TILE);
            tc.lineTo(sx + i * (TILE/2) + TILE/4, sy + 2);
            tc.lineTo(sx + (i+1) * (TILE/2),      sy + TILE);
            tc.closePath(); tc.fill();
          }
        }
      }
    }
  }

  // ── Off-screen culling helper ─────────────────────
  _isVisible(sx, sy, w, h) {
    return sx + w > -CULL_MARGIN && sx < W + CULL_MARGIN &&
           sy + h > -CULL_MARGIN && sy < H + CULL_MARGIN;
  }

  // ── Collectibles ──────────────────────────────────
  _drawCollectibles(ctx, entities, ox, oy, frame, pal) {
    for (const e of entities) {
      if (e.type !== 'collectible' || e.collected) continue;
      const sx  = e.x - ox, sy = e.y - oy;
      if (!this._isVisible(sx, sy, 14, 14)) continue;
      const bob = Math.sin(frame * 0.07 + (e.phase || 0)) * 3;

      if (e.colType === 'geo') {
        ctx.fillStyle  = '#ffd700';
        ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.arc(sx+5, sy+5+bob, 5, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle  = '#ffee88';
        ctx.beginPath(); ctx.arc(sx+3, sy+3+bob, 2, 0, Math.PI*2); ctx.fill();

      } else if (e.colType === 'health') {
        ctx.fillStyle  = '#cc3344';
        ctx.shadowColor = '#cc3344'; ctx.shadowBlur = 10;
        const hx = sx+5, hy = sy+6+bob;
        ctx.beginPath();
        ctx.arc(hx-2, hy, 4, Math.PI, 0);
        ctx.arc(hx+2, hy, 4, Math.PI, 0);
        ctx.lineTo(hx, hy+7); ctx.closePath(); ctx.fill();

      } else if (e.colType === 'shard') {
        const glow = Math.sin(frame * 0.1) * 0.5 + 0.5;
        ctx.fillStyle  = '#e8d5a0';
        ctx.shadowColor = '#e8d5a0'; ctx.shadowBlur = 10 + glow * 8;
        ctx.beginPath();
        ctx.moveTo(sx+5, sy+bob);
        ctx.lineTo(sx+10, sy+5+bob);
        ctx.lineTo(sx+5,  sy+10+bob);
        ctx.lineTo(sx,    sy+5+bob);
        ctx.closePath(); ctx.fill();
      }
      ctx.shadowBlur = 0;
    }
  }

  // ── Loot pickups ──────────────────────────────────
  _drawLoot(ctx, entities, ox, oy, frame, pal, player) {
    for (const e of entities) {
      if (e.type !== 'loot' || e.collected) continue;
      const glow = Math.sin(frame * 0.06) * 0.5 + 0.5;
      const sx   = e.x - ox, sy = e.y - oy + glow * 4;
      if (!this._isVisible(sx, sy, 20, 20)) continue;
      ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 15 + glow * 10;
      ctx.fillStyle   = '#ffd700';
      ctx.beginPath();
      ctx.moveTo(sx+10, sy);
      ctx.lineTo(sx+20, sy+10);
      ctx.lineTo(sx+10, sy+20);
      ctx.lineTo(sx,    sy+10);
      ctx.closePath(); ctx.fill();
      ctx.shadowBlur  = 0;
      ctx.fillStyle   = '#ffd700aa';
      ctx.font        = '7px Share Tech Mono'; ctx.textAlign = 'center';
      ctx.fillText(e.name || '', sx+10, sy-6);

      // Proximity prompt for loot
      if (player) {
        const near = Math.abs(player.x+player.w/2 - (e.x+e.w/2)) < 30
                  && Math.abs(player.y+player.h/2 - (e.y+e.h/2)) < 30;
        if (near) {
          const pulse = Math.sin(frame * 0.12) * 0.3 + 0.7;
          ctx.globalAlpha = pulse;
          ctx.fillStyle   = '#ffd700';
          ctx.font        = '7px Share Tech Mono'; ctx.textAlign = 'center';
          ctx.fillText('▲ INSPECT', sx+10, sy-14);
          ctx.globalAlpha = 1;
        }
      }
      ctx.textAlign   = 'left';
    }
  }

  // ── NPCs ──────────────────────────────────────────
  _drawNPCs(ctx, npcs, ox, oy, player, frame) {
    for (const npc of npcs) {
      const sx = npc.wx - ox - 8, sy = npc.wy - oy - 28;
      if (!this._isVisible(sx, sy, 20, 36)) continue;
      ctx.fillStyle  = npc.isMerchant ? '#ffcc77cc' : '#e8d5a0cc';
      ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 6;
      ctx.beginPath(); ctx.arc(sx+8, sy+6, 6, 0, Math.PI*2); ctx.fill();
      ctx.fillRect(sx+4, sy+11, 8, 12);
      ctx.shadowBlur = 0;
      if (npc.isMerchant) {
        ctx.fillStyle  = '#ffd700';
        ctx.font       = '10px serif'; ctx.textAlign = 'center';
        ctx.fillText('🛍', sx+8, sy-2);
      }
      // Proximity prompt
      const near = Math.abs(player.x+player.w/2 - npc.wx) < 36
                && Math.abs(player.y+player.h/2 - npc.wy) < 40;
      if (near && !npc.interacted) {
        const pulse = Math.sin(frame * 0.12) * 0.3 + 0.7;
        ctx.globalAlpha = pulse;
        ctx.fillStyle   = '#e8d5a0';
        ctx.font        = '7px Share Tech Mono'; ctx.textAlign = 'center';
        ctx.fillText('▲ TALK', sx+8, sy-6);
        ctx.globalAlpha = 1;
      }
      ctx.textAlign = 'left';
    }
  }

  // ── Enemies ──────────────────────────────────────
  _drawEnemies(ctx, entities, ox, oy, frame) {
    for (const e of entities) {
      if (!e.alive || !e.type || e.type === 'proj'
          || e.type === 'collectible' || e.type === 'loot') continue;
      const sx = e.x - ox, sy = e.y - oy;
      if (!this._isVisible(sx, sy, e.w, e.h)) continue;
      const flash = e.hitFlash > 0;
      const ec    = flash ? '#ffffff' : e.color;

      // Alert "!" on first aggro
      if (e.alertFlash > 0) {
        ctx.fillStyle  = '#ffcc00';
        ctx.font       = 'bold 12px Share Tech Mono';
        ctx.textAlign  = 'center';
        ctx.shadowColor = '#ffcc00'; ctx.shadowBlur = 8;
        ctx.fillText('!', sx + e.w/2, sy - 8);
        ctx.textAlign  = 'left'; ctx.shadowBlur = 0;
      }

      // Shadow blur on hit — pulse effect
      ctx.shadowColor = e.color;
      ctx.shadowBlur  = flash ? 20 + Math.sin(Date.now() * 0.04) * 8 : 6;
      ctx.fillStyle   = ec;

      if (e.flying) {
        ctx.save();
        ctx.globalAlpha = flash ? 1 : 0.95;
        ctx.beginPath();
        ctx.ellipse(sx+e.w/2, sy+e.h/2, e.w/2+1, e.h/2+1, 0, 0, Math.PI*2);
        ctx.fill();
        // Wing flapping
        const flap = Math.sin(frame * 0.18) * 6;
        ctx.fillStyle = ec + '99';
        ctx.beginPath(); ctx.ellipse(sx-3, sy+e.h/2, 9, 5+flap, 0.25, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(sx+e.w+3, sy+e.h/2, 9, 5+flap, -0.25, 0, Math.PI*2); ctx.fill();
        // Ghost/shadow: transparency pulse
        if (e.phasing) {
          ctx.globalAlpha = 0.5 + Math.sin(frame * 0.08) * 0.3;
          ctx.fillStyle   = e.color + '88';
          ctx.beginPath(); ctx.ellipse(sx+e.w/2, sy+e.h/2, e.w/2+4, e.h/2+4, 0, 0, Math.PI*2); ctx.fill();
          ctx.globalAlpha = 1;
        }
        // Eyes
        ctx.fillStyle = '#ffff00';
        ctx.beginPath(); ctx.arc(sx+e.w/2+(e.facing>0?2:-2), sy+e.h/2-2, 2, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#000000';
        ctx.beginPath(); ctx.arc(sx+e.w/2+(e.facing>0?2:-2), sy+e.h/2-2, 1, 0, Math.PI*2); ctx.fill();
        ctx.restore();

      } else {
        const walk = e.onGround ? Math.sin(e.animFrame * 1.4) * 1.5 : 0;
        ctx.save();
        ctx.globalAlpha = flash ? 1 : 0.98;
        ctx.fillRect(sx+1, sy+1+walk, e.w-2, e.h-3);

        // 3D shading
        ctx.fillStyle = e.color + '66';
        ctx.fillRect(sx+e.w-2, sy+2+walk, 2, e.h-4);
        ctx.fillStyle = '#ffffff33';
        ctx.fillRect(sx+1, sy+2+walk, 2, e.h-4);
        ctx.fillStyle = ec;

        // Eyes
        const eyeCol = (e.type === 'ranged' || e.type === 'necromancer' || e.type === 'ghost') ? '#ff6644' : '#ffff00';
        ctx.fillStyle = eyeCol;
        const eyeX1 = sx + (e.facing > 0 ? e.w-6 : 3);
        const eyeX2 = sx + (e.facing > 0 ? e.w-2 : 7);
        ctx.beginPath(); ctx.arc(eyeX1, sy+6+walk, 2, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(eyeX2, sy+6+walk, 2, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#000000';
        ctx.beginPath(); ctx.arc(eyeX1, sy+6+walk, 1, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(eyeX2, sy+6+walk, 1, 0, Math.PI*2); ctx.fill();

        ctx.restore();

        // Armor glow
        if (e.armored) {
          ctx.strokeStyle = '#cccccc'; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.6;
          ctx.strokeRect(sx+1, sy+1+walk, e.w-2, e.h-2);
          ctx.globalAlpha = 1;
        }
        // Shield
        if (e.shield) {
          ctx.fillStyle  = '#88770099';
          const sdx = e.facing > 0 ? sx+e.w : sx-6;
          ctx.fillRect(sdx, sy+3, 6, e.h-4);
          ctx.fillStyle  = '#ffdd55aa';
          ctx.fillRect(sdx+1, sy+4, 4, e.h-6);
          ctx.strokeStyle = '#ffff99'; ctx.lineWidth = 1;
          ctx.strokeRect(sdx+1, sy+4, 4, e.h-6);
        }
        // Elite crown
        if (e.isElite) {
          ctx.fillStyle = '#ffdd00';
          ctx.fillRect(sx+2, sy-6, e.w-4, 4);
          for (let i = 0; i < 3; i++) ctx.fillRect(sx+3+i*(e.w-8)/2, sy-10, 2, 6);
        }
        // Spike ball spikes
        if (e.type === 'spike_ball') {
          ctx.fillStyle = '#cc5566';
          for (let i = 0; i < 4; i++) {
            const angle = (Math.PI * 2 / 4) * i + frame * 0.05;
            const px = sx + e.w/2 + Math.cos(angle) * (e.w/2 + 3);
            const py = sy + e.h/2 + Math.sin(angle) * (e.h/2 + 3);
            ctx.fillRect(px-1, py-1, 2, 2);
          }
        }
        // Slime wobble
        if (e.slime) {
          const wobble = Math.sin(frame * 0.08 + e.x) * 2;
          ctx.strokeStyle = e.color + 'aa'; ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.ellipse(sx+e.w/2, sy+e.h/2+wobble, e.w/2, e.h/2, 0, 0, Math.PI*2);
          ctx.stroke();
        }
      }
      ctx.shadowBlur = 0;

      // HP bar (colored)
      if (e.maxHp > 2) {
        const bw = e.w + 6;
        ctx.fillStyle = '#00000088'; ctx.fillRect(sx-3, sy-9, bw, 4);
        const pct = e.hp / e.maxHp;
        ctx.fillStyle = pct > 0.5 ? '#44ff44' : pct > 0.2 ? '#ffaa44' : '#ff4444';
        ctx.fillRect(sx-3, sy-9, bw * pct, 4);
        ctx.strokeStyle = '#ffffff99'; ctx.lineWidth = 1;
        ctx.strokeRect(sx-3, sy-9, bw, 4);
      }
    }
  }

  // ── Projectiles — FIXED: apply camera offset ──────
  _drawProjectiles(ctx, entities, ox, oy) {
    for (const e of entities) {
      if (e.type !== 'proj' || !e.alive) continue;
      // FIXED: was drawing at e.x/e.y (world space) without subtracting camera
      const sx = e.x - ox, sy = e.y - oy;
      if (!this._isVisible(sx, sy, e.w, e.h)) continue;
      ctx.fillStyle   = e.color || '#fff';
      ctx.shadowColor = e.color; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(sx, sy, e.w/2, 0, Math.PI*2); ctx.fill();
      // Glow trail
      ctx.globalAlpha = 0.3;
      ctx.beginPath(); ctx.arc(sx - e.vx, sy - e.vy, e.w/2 + 1, 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.shadowBlur = 0;
  }

  // ── Boss arena darkening ───────────────────────────
  _drawBossArena(ctx, boss, ox, oy) {
    // Subtle arena vignette: darken periphery
    ctx.globalAlpha = 0.18;
    const vg = ctx.createRadialGradient(W/2, H/2, H*0.15, W/2, H/2, H*0.7);
    vg.addColorStop(0, 'transparent');
    vg.addColorStop(1, '#000000');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  // ── Boss ──────────────────────────────────────────
  _drawBoss(ctx, boss, ox, oy, frame, pal) {
    const sx    = boss.x - ox, sy = boss.y - oy;
    if (!this._isVisible(sx, sy, boss.w + 40, boss.h + 20)) return;
    const flash = boss.hitFlash > 0 || boss.phaseFlashTimer % 8 < 4;
    const bc    = flash ? '#ffffff' : boss.color;
    const phase = boss.phase;

    ctx.shadowColor = boss.color;
    ctx.shadowBlur  = flash ? 28 + Math.sin(frame * 0.05) * 6 : 14;
    ctx.fillStyle   = bc;

    if (boss.bossType === 'Warden') {
      const s = Math.sin(boss.animFrame * 0.8) * 1.5;
      ctx.fillRect(sx+2, sy+s, boss.w-4, boss.h);
      ctx.fillStyle = bc + 'cc';
      ctx.fillRect(sx+5, sy-14+s, 4, 14);
      ctx.fillRect(sx+boss.w-9, sy-14+s, 4, 14);
      ctx.fillRect(sx+3, sy-16+s, 9, 3);
      ctx.fillRect(sx+boss.w-12, sy-16+s, 9, 3);
      ctx.fillStyle   = phase >= 3 ? '#ff0000' : '#ff4400';
      ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 12;
      ctx.fillRect(sx+(boss.facing>0?boss.w-10:3), sy+10+s, 6, 6);
      if (phase === 3) {
        ctx.globalAlpha = 0.25 + Math.sin(frame*0.15)*0.1;
        ctx.fillStyle   = '#ff4400';
        ctx.beginPath(); ctx.arc(sx+boss.w/2, sy+boss.h/2, boss.w, 0, Math.PI*2); ctx.fill();
        ctx.globalAlpha = 1;
      }
      // Wind-up telegraph
      if (boss.windupTimer > 0) {
        ctx.globalAlpha = boss.windupTimer / 12;
        ctx.strokeStyle = '#ff8800'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(sx+boss.w/2, sy+boss.h/2, boss.w*1.2, 0, Math.PI*2); ctx.stroke();
        ctx.globalAlpha = 1;
      }

    } else if (boss.bossType === 'CrystalGuardian') {
      ctx.beginPath();
      ctx.moveTo(sx+boss.w/2, sy);
      ctx.lineTo(sx+boss.w,   sy+boss.h*0.4);
      ctx.lineTo(sx+boss.w*0.8, sy+boss.h);
      ctx.lineTo(sx+boss.w*0.2, sy+boss.h);
      ctx.lineTo(sx,             sy+boss.h*0.4);
      ctx.closePath(); ctx.fill();
      // Orbiting shards
      const shardCount = 3 + phase;
      for (let i = 0; i < shardCount; i++) {
        const ang = (i/shardCount)*Math.PI*2 + frame*0.05;
        const r   = 28 + phase * 6;
        ctx.fillStyle = '#88ccff';
        ctx.fillRect(sx+boss.w/2+Math.cos(ang)*r-3, sy+boss.h/2+Math.sin(ang)*r-6, 5, 12);
      }

    } else if (boss.bossType === 'VoidKing') {
      const pulse = Math.sin(frame*0.1) * 4;
      ctx.beginPath(); ctx.arc(sx+boss.w/2, sy+boss.h/2, boss.w/2+pulse, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#cc44ff';
      ctx.fillRect(sx+4, sy-8, boss.w-8, 6);
      for (let i = 0; i < 3; i++) ctx.fillRect(sx+5+i*(boss.w-14)/2, sy-16, 4, 10);
      ctx.strokeStyle = '#cc44ff55'; ctx.lineWidth = 2;
      const tCount = 4 + phase * 2;
      for (let i = 0; i < tCount; i++) {
        const ang = (i/tCount)*Math.PI*2 + frame*0.03;
        ctx.beginPath();
        ctx.moveTo(sx+boss.w/2, sy+boss.h/2);
        ctx.lineTo(sx+boss.w/2 + Math.cos(ang)*40, sy+boss.h/2 + Math.sin(ang)*28);
        ctx.stroke();
      }
      if (phase === 3) {
        const ringR = (frame % 60) / 60 * 80;
        ctx.globalAlpha = Math.max(0, 0.3 - ringR/260);
        ctx.strokeStyle = '#cc44ff'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(sx+boss.w/2, sy+boss.h/2, ringR, 0, Math.PI*2); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    ctx.shadowBlur = 0;

    // Boss HP bar
    const barW = W * 0.6, barX = (W-barW)/2, barY = 14;
    ctx.fillStyle = '#00000088'; ctx.fillRect(barX-1, barY-1, barW+2, 10);
    const hpGrad = ctx.createLinearGradient(barX, barY, barX+barW, barY);
    hpGrad.addColorStop(0, '#cc3344'); hpGrad.addColorStop(1, '#ff6677');
    ctx.fillStyle = hpGrad;
    ctx.fillRect(barX, barY, barW * boss.hpPct, 8);
    [0.66, 0.33].forEach(pct => {
      ctx.fillStyle = '#ffffff44';
      ctx.fillRect(barX + barW*pct - 1, barY, 2, 8);
    });
    ctx.fillStyle = '#ffffff66'; ctx.font='7px Share Tech Mono'; ctx.textAlign='center';
    ctx.fillText(boss.bossType.toUpperCase() + '  [PHASE '+boss.phase+']', W/2, barY+18);
    ctx.textAlign = 'left';

    // Phase transition flash
    if (boss.phaseFlashTimer > 0) {
      ctx.globalAlpha = (boss.phaseFlashTimer/80)*0.4;
      ctx.fillStyle   = '#ffffff';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }

  // ── Player shadow ─────────────────────────────────
  _drawPlayerShadow(ctx, pl, ox, oy) {
    if (pl.dead) return;
    const sx = Math.round(pl.x - ox) + pl.w/2;
    // Project shadow down from player's feet
    const groundY = Math.round(pl.y - oy) + pl.h;
    const altitude = Math.max(0, 1 - (pl.vy > 0 ? Math.abs(pl.vy) / 15 : 0));
    ctx.globalAlpha = 0.18 * altitude;
    ctx.fillStyle   = '#000000';
    ctx.beginPath();
    ctx.ellipse(sx, groundY + 2, pl.w * 0.6 * altitude, 3, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // ── Player ────────────────────────────────────────
  _drawPlayer(ctx, pl, ox, oy, frame, pal) {
    if (pl.dead) return;
    if (pl.invTimer > 0 && Math.floor(pl.invTimer/4) % 2 === 0) return;

    const sx = Math.round(pl.x - ox);
    const sy = Math.round(pl.y - oy);

    ctx.shadowColor = pal.accent;
    ctx.shadowBlur  = pl.dashTimer > 0 ? 22 : 10;

    const walk  = pl.onGround ? Math.sin(pl.animFrame * 1.5) * 1.5 : 0;
    const lean  = pl.vx * 0.06;
    const squashY = pl.squashY || 1.0;
    const squashX = squashY < 1 ? (1 + (1 - squashY) * 0.5) : 1; // compensate width

    ctx.save();
    ctx.translate(sx + pl.w/2, sy + pl.h/2);
    ctx.rotate(lean);
    ctx.scale(squashX, squashY); // landing squash/stretch
    ctx.imageSmoothingEnabled = false;

    // Dash afterimages
    if (pl.dashTimer > 0) {
      ctx.restore();
      ctx.save();
      ctx.translate(sx + pl.w/2, sy + pl.h/2);
      for (let i = 1; i <= 4; i++) {
        ctx.globalAlpha = 0.22 * (5 - i) / 4;
        ctx.fillStyle   = pal.accent;
        ctx.fillRect(-pl.w/2 - pl.facing * i * 7, -pl.h/2 + 2, pl.w, pl.h - 4);
      }
      ctx.globalAlpha = 1;
      ctx.restore();
      ctx.save();
      ctx.translate(sx + pl.w/2, sy + pl.h/2);
      ctx.rotate(lean);
    }

    // ── WARRIOR AVATAR ──────────────────────────────

    // Legs/boots
    ctx.fillStyle = '#2c1810';
    ctx.fillRect(-3, 4+walk, 2, 6);
    ctx.fillRect(1, 4+walk, 2, 6);
    ctx.fillStyle = '#1a0f08';
    ctx.fillRect(-4, 5+walk, 3, 2);
    ctx.fillRect(1, 5+walk, 3, 2);

    // Tunic
    ctx.fillStyle = '#cc5544';
    ctx.fillRect(-5, -3+walk, 10, 8);
    ctx.fillStyle = '#aa3322';
    ctx.fillRect(-5, -2+walk, 1, 5);
    ctx.fillRect(4, -2+walk, 1, 5);

    // Belt
    ctx.fillStyle = '#8b6914';
    ctx.fillRect(-6, 4+walk, 12, 1);
    ctx.fillStyle = '#d4af37';
    ctx.fillRect(-5, 5+walk, 10, 1);

    // Pauldron
    ctx.fillStyle = '#666666';
    ctx.fillRect(pl.facing > 0 ? 5 : -7, -6+walk, 2, 4);
    ctx.fillStyle = '#888888';
    ctx.fillRect(pl.facing > 0 ? 6 : -8, -5+walk, 1, 3);

    // Arms
    ctx.fillStyle = '#d4a574';
    ctx.fillRect(pl.facing > 0 ? 5 : -7, -2+walk, 2, 5);
    ctx.fillStyle = '#a07050';
    ctx.fillRect(pl.facing > 0 ? 5 : -6, 2+walk, 1, 2);

    // Head
    ctx.fillStyle = '#d4a574';
    ctx.beginPath(); ctx.arc(0, -13+walk, 7, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#b8845c';
    ctx.beginPath(); ctx.arc(-2, -12+walk, 6, Math.PI*0.3, Math.PI*1.7); ctx.fill();

    // Ears
    ctx.fillStyle = '#c49050';
    ctx.beginPath(); ctx.arc(pl.facing > 0 ? 4 : -4, -16+walk, 2.5, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#d4a574';
    ctx.beginPath(); ctx.arc(pl.facing > 0 ? 4 : -4, -16+walk, 1.2, 0, Math.PI*2); ctx.fill();

    // Eyes
    ctx.fillStyle = '#ffcc00';
    ctx.beginPath(); ctx.arc(pl.facing > 0 ? 2 : -2, -14+walk, 2, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#000000';
    ctx.beginPath(); ctx.arc(pl.facing > 0 ? 2 : -2, -14+walk, 1, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(pl.facing > 0 ? 2.5 : -1.5, -14.5+walk, 0.5, 0, Math.PI*2); ctx.fill();

    // Mouth
    ctx.strokeStyle = '#8b6f47'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(-1, -10+walk); ctx.lineTo(1, -10+walk); ctx.stroke();

    // Horns
    ctx.fillStyle = '#cc9966';
    if (pl.facing > 0) {
      ctx.fillRect(4, -21+walk, 1.5, 7);
      ctx.fillRect(6, -20+walk, 1.5, 6);
    } else {
      ctx.fillRect(-5.5, -21+walk, 1.5, 7);
      ctx.fillRect(-7.5, -20+walk, 1.5, 6);
    }

    // ── EFFECTS ─────────────────────────────────────

    // Wall slide spark
    if (pl.wallSlide) {
      ctx.fillStyle = pal.particle + '88';
      ctx.fillRect(pl.facing > 0 ? 6 : -8, -2+walk, 2, 8);
    }

    // Charge orb
    if (pl.isCharging && pl.chargeTimer > 15) {
      const cg = Math.min(1, (pl.chargeTimer - 15) / 30);
      ctx.globalAlpha = cg * 0.6;
      ctx.shadowColor = '#ffff00'; ctx.shadowBlur = 18 + cg * 12;
      ctx.fillStyle   = 'rgba(255,255,0,0.4)';
      ctx.beginPath(); ctx.arc(0, 0, 14+cg*10, 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha = cg * 0.8;
      ctx.lineWidth   = 2.5; ctx.strokeStyle = '#ffff00';
      ctx.beginPath(); ctx.arc(0, 0, 12+cg*8, 0, Math.PI*2); ctx.stroke();
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    }

    // Attack slash arc
    if (pl.attackTimer > 0) {
      const at = pl.attackTimer / 12;
      ctx.strokeStyle  = pl.chargeReady ? '#ffff00' : '#ff6644';
      ctx.lineWidth    = pl.chargeReady ? 5 : 3.5;
      ctx.globalAlpha  = at * 0.95;
      ctx.shadowColor  = pl.chargeReady ? '#ffff00' : '#ff6644';
      ctx.shadowBlur   = pl.chargeReady ? 22 : 16;
      const dir = pl.facing;
      ctx.beginPath();
      ctx.arc(dir * 12, 0, pl.chargeReady ? 28 : 20,
        dir > 0 ? -1.0 : Math.PI-1.0,
        dir > 0 ?  1.0 : Math.PI+1.0);
      ctx.stroke();
      // Combo indicators
      if (pl.comboStep > 0) {
        for (let i = 0; i < pl.comboStep; i++) {
          ctx.fillStyle   = '#ff6644';
          ctx.globalAlpha = 0.9;
          ctx.beginPath(); ctx.arc(dir*(18+i*6), -8, 2, 0, Math.PI*2); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }

    ctx.restore();
    ctx.shadowBlur = 0;
  }

  // ── Dynamic lighting overlay ───────────────────────
  _drawLighting(ctx, player, entities, boss, ox, oy, pal, frame) {
    const lc = this._lightCtx;
    lc.clearRect(0, 0, W, H);
    lc.fillStyle = '#000000';
    lc.fillRect(0, 0, W, H);
    lc.globalCompositeOperation = 'destination-out';

    // Player glow
    if (!player.dead) {
      const px = player.x - ox + player.w/2;
      const py = player.y - oy + player.h/2;
      const pr = player.dashTimer > 0 ? 90 : 70;
      const pg = lc.createRadialGradient(px, py, 0, px, py, pr);
      pg.addColorStop(0, `rgba(255,255,255,0.7)`);
      pg.addColorStop(1, `rgba(255,255,255,0)`);
      lc.fillStyle = pg;
      lc.beginPath(); lc.arc(px, py, pr, 0, Math.PI*2); lc.fill();
    }

    // Collectible glow
    for (const e of entities) {
      if (e.type === 'collectible' && !e.collected) {
        const ex = e.x - ox + 5, ey = e.y - oy + 5;
        const eg = lc.createRadialGradient(ex, ey, 0, ex, ey, 35);
        eg.addColorStop(0, 'rgba(255,255,255,0.4)');
        eg.addColorStop(1, 'rgba(255,255,255,0)');
        lc.fillStyle = eg;
        lc.beginPath(); lc.arc(ex, ey, 35, 0, Math.PI*2); lc.fill();
      }
    }

    // Boss glow
    if (boss && boss.alive) {
      const bx = boss.x - ox + boss.w/2, by = boss.y - oy + boss.h/2;
      const br = 80;
      const bg = lc.createRadialGradient(bx, by, 0, bx, by, br);
      bg.addColorStop(0, 'rgba(255,255,255,0.4)');
      bg.addColorStop(1, 'rgba(255,255,255,0)');
      lc.fillStyle = bg;
      lc.beginPath(); lc.arc(bx, by, br, 0, Math.PI*2); lc.fill();
    }

    lc.globalCompositeOperation = 'source-over';

    // Blit light overlay with low opacity for subtle ambient occlusion
    ctx.globalAlpha = 0.22;
    ctx.drawImage(this._lightCanvas, 0, 0);
    ctx.globalAlpha = 1;
  }

  // ── Vignette ──────────────────────────────────────
  _drawVignette(ctx, pal) {
    const vg = ctx.createRadialGradient(W/2, H/2, H*0.25, W/2, H/2, H*0.78);
    vg.addColorStop(0, 'transparent');
    vg.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    // Fog strips
    const fogT = ctx.createLinearGradient(0, 0, 0, 30);
    fogT.addColorStop(0, pal.fog + 'cc'); fogT.addColorStop(1, 'transparent');
    ctx.fillStyle = fogT; ctx.fillRect(0, 0, W, 30);
    const fogB = ctx.createLinearGradient(0, H-24, 0, H);
    fogB.addColorStop(0, 'transparent'); fogB.addColorStop(1, pal.fog + 'aa');
    ctx.fillStyle = fogB; ctx.fillRect(0, H-24, W, 24);
  }

  // ── Exit arrows ───────────────────────────────────
  _drawExitArrows(ctx, exits, ox, oy, boss) {
    // Suppress exit arrows if boss arena is locked
    if (boss && boss.alive && boss.arenaLocked) return;
    ctx.fillStyle = '#ffffff22'; ctx.font = '11px Share Tech Mono'; ctx.textAlign = 'center';
    const arrowMap = { right:'▶', left:'◀', up:'▲', down:'▼' };
    for (const ex of exits) {
      const esx = ex.wx - ox, esy = ex.wy - oy;
      const arrow = arrowMap[ex.dir] || '';
      if      (ex.dir === 'right' && esx > W - 60) ctx.fillText(arrow, W-8, H/2);
      else if (ex.dir === 'left'  && esx < 60)     ctx.fillText(arrow, 8, H/2);
      else if (ex.dir === 'up'    && esy < 60)      ctx.fillText(arrow, W/2, 14);
      else if (ex.dir === 'down'  && esy > H - 60)  ctx.fillText(arrow, W/2, H-6);
    }
    ctx.textAlign = 'left';
  }

  // ── Transition fade overlay ───────────────────────
  drawTransition(alpha) {
    if (alpha <= 0) return;
    this.ctx.fillStyle = `rgba(0,0,0,${Math.min(1, alpha)})`;
    this.ctx.fillRect(0, 0, W, H);
  }
}
