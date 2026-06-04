// ═══════════════════════════════════════════════════
//  SILKBOUND PRO — World Renderer
// ═══════════════════════════════════════════════════
import { W, H, TILE, biomeColors } from '../constants.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    // Offscreen canvas for room tiles (cached, redrawn only on room change)
    this._tileCanvas  = document.createElement('canvas');
    this._tileCanvas.width  = W * 3;  // wide enough for any room
    this._tileCanvas.height = H * 4;
    this._tileCtx = this._tileCanvas.getContext('2d');
    this._tileDirty = true;
    this._lastBiome = '';
  }

  markTilesDirty() { this._tileDirty = true; }

  // ── Draw everything ───────────────────────────────
  render(room, cam, player, entities, boss, npcs, exits, particles, frame, settings) {
    const ctx  = this.ctx;
    const pal  = biomeColors(room.biome);
    const shakeX = settings.screenShake ? particles.screenShake.x : 0;
    const shakeY = settings.screenShake ? particles.screenShake.y : 0;
    const ox   = Math.round(cam.x + shakeX);
    const oy   = Math.round(cam.y + shakeY);

    ctx.clearRect(0, 0, W, H);

    // ── Background gradient ───────────────────────
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, pal.bg);
    bg.addColorStop(1, pal.fog);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // ── Parallax layers ───────────────────────────
    this._drawParallax(ctx, pal, cam, frame);

    // ── Tile layer (offscreen cached) ─────────────
    if (this._tileDirty || room.biome !== this._lastBiome) {
      this._bakeTiles(room, pal);
      this._tileDirty = false;
      this._lastBiome = room.biome;
    }
    ctx.drawImage(this._tileCanvas, -ox, -oy);

    // ── Collectibles ──────────────────────────────
    this._drawCollectibles(ctx, entities, ox, oy, frame, pal);

    // ── Loot pickups ──────────────────────────────
    this._drawLoot(ctx, entities, ox, oy, frame, pal);

    // ── NPCs ──────────────────────────────────────
    this._drawNPCs(ctx, npcs, ox, oy, player, frame);

    // ── Enemies ───────────────────────────────────
    this._drawEnemies(ctx, entities, ox, oy, frame);

    // ── Projectiles ───────────────────────────────
    this._drawProjectiles(ctx, entities, ox, oy);

    // ── Boss ──────────────────────────────────────
    if (boss && boss.alive) this._drawBoss(ctx, boss, ox, oy, frame, pal);

    // ── Particles (use same ox/oy as world so shake is consistent) ─
    particles.draw(ctx, ox, oy, false);

    // ── Player ────────────────────────────────────
    this._drawPlayer(ctx, player, ox, oy, frame, pal);

    // ── Vignette + fog ────────────────────────────
    this._drawVignette(ctx, pal);

    // ── Exit arrows ───────────────────────────────
    this._drawExitArrows(ctx, exits, ox, oy);

    // ── Transition fade ───────────────────────────
    return { ox, oy };
  }

  // ── Parallax ─────────────────────────────────────
  _drawParallax(ctx, pal, cam, frame) {
    // Layer 1 - far background shapes (pillars/stalactites)
    ctx.globalAlpha = 0.1;
    ctx.fillStyle   = pal.accent;
    for (let i=0;i<7;i++) {
      const bx = ((i*95) - cam.x*0.08 + frame*0.01) % (W+60) - 30;
      const bh = 30+i*18;
      ctx.fillRect(bx, H-bh, 12, bh);
      // Glow effect
      ctx.shadowColor = pal.accent; ctx.shadowBlur = 8;
      ctx.fillRect(bx, H-bh, 12, bh);
      ctx.shadowBlur = 0;
      // Stalactite from top
      ctx.fillRect(bx+20, 0, 8, bh*0.6);
    }
    // Layer 2 - mid shapes
    ctx.globalAlpha = 0.08;
    ctx.fillStyle   = pal.accent;
    for (let i=0;i<5;i++) {
      const bx = ((i*130+60) - cam.x*0.18 + frame*0.02) % (W+80) - 40;
      ctx.fillRect(bx, H-(50+i*22), 18, 50+i*22);
      // Glow
      ctx.shadowColor = pal.accent; ctx.shadowBlur = 6;
      ctx.fillRect(bx, H-(50+i*22), 18, 50+i*22);
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
  }

  // ── Bake tiles to offscreen canvas ───────────────
  _bakeTiles(room, pal) {
    const tc  = this._tileCtx;
    const rows = room.tiles;
    const W2   = room.pixelW, H2 = room.pixelH;
    tc.clearRect(0, 0, W2, H2);

    for (let r = 0; r < rows.length; r++) {
      for (let c = 0; c < rows[r].length; c++) {
        const ch = rows[r][c];
        const sx = c * TILE, sy = r * TILE;

        if (ch === '#') {
          const tg = tc.createLinearGradient(sx, sy, sx, sy + TILE);
          tg.addColorStop(0, pal.solid + 'ff');
          tg.addColorStop(1, pal.bg + 'cc');
          tc.fillStyle = tg;
          tc.fillRect(sx, sy, TILE, TILE);

          const aboveAir = r === 0 || rows[r-1][c] !== '#';
          if (aboveAir) {
            // Top highlight strip
            tc.fillStyle = pal.accent + 'cc';
            tc.fillRect(sx, sy, TILE, 2);
            // Secondary inner glow
            tc.fillStyle = pal.accent + '18';
            tc.fillRect(sx, sy+2, TILE, 5);
          }
          // Right-edge shade
          tc.fillStyle = '#00000044';
          tc.fillRect(sx + TILE - 2, sy, 2, TILE);
          // Bottom inner shadow
          tc.fillStyle = '#00000033';
          tc.fillRect(sx, sy + TILE - 3, TILE, 3);
        } else if (ch === 'p') {
          // Pass-through: glowing ledge
          const pg = tc.createLinearGradient(sx, sy, sx+TILE, sy);
          pg.addColorStop(0, 'transparent');
          pg.addColorStop(0.15, pal.accent+'99');
          pg.addColorStop(0.85, pal.accent+'99');
          pg.addColorStop(1, 'transparent');
          tc.fillStyle = pg;
          tc.fillRect(sx, sy, TILE, 3);
          tc.fillStyle = pal.accent + '18';
          tc.fillRect(sx, sy+3, TILE, 5);
        } else if (ch === '^') {
          // Spike
          tc.fillStyle = '#cc3333';
          for (let i = 0; i < 2; i++) {
            tc.beginPath();
            tc.moveTo(sx + i * (TILE/2),       sy + TILE);
            tc.lineTo(sx + i * (TILE/2) + TILE/4, sy + 2);
            tc.lineTo(sx + (i+1) * (TILE/2),   sy + TILE);
            tc.closePath(); tc.fill();
          }
        }
      }
    }
  }

  // ── Collectibles ──────────────────────────────────
  _drawCollectibles(ctx, entities, ox, oy, frame, pal) {
    for (const e of entities) {
      if (e.type !== 'collectible' || e.collected) continue;
      const sx = e.x - ox, sy = e.y - oy;
      const bob = Math.sin(frame * 0.07 + e.phase) * 3;

      if (e.colType === 'geo') {
        ctx.fillStyle = '#ffd700';
        ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.arc(sx + 5, sy + 5 + bob, 5, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#ffee88';
        ctx.beginPath(); ctx.arc(sx + 3, sy + 3 + bob, 2, 0, Math.PI*2); ctx.fill();
      } else if (e.colType === 'health') {
        ctx.fillStyle = '#cc3344';
        ctx.shadowColor = '#cc3344'; ctx.shadowBlur = 10;
        const hx = sx + 5, hy = sy + 6 + bob;
        ctx.beginPath();
        ctx.arc(hx - 2, hy, 4, Math.PI, 0);
        ctx.arc(hx + 2, hy, 4, Math.PI, 0);
        ctx.lineTo(hx, hy + 7); ctx.closePath(); ctx.fill();
      } else if (e.colType === 'shard') {
        const glow = Math.sin(frame * 0.1) * 0.5 + 0.5;
        ctx.fillStyle = '#e8d5a0';
        ctx.shadowColor = '#e8d5a0'; ctx.shadowBlur = 10 + glow * 8;
        ctx.beginPath();
        ctx.moveTo(sx + 5, sy + bob);
        ctx.lineTo(sx + 10, sy + 5 + bob);
        ctx.lineTo(sx + 5,  sy + 10 + bob);
        ctx.lineTo(sx,      sy + 5 + bob);
        ctx.closePath(); ctx.fill();
      }
      ctx.shadowBlur = 0;
    }
  }

  // ── Loot pickups ──────────────────────────────────
  _drawLoot(ctx, entities, ox, oy, frame, pal) {
    for (const e of entities) {
      if (e.type !== 'loot' || e.collected) continue;
      const glow = Math.sin(frame * 0.06) * 0.5 + 0.5;
      const sx = e.x - ox, sy = e.y - oy + glow * 4;
      ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 15 + glow * 10;
      ctx.fillStyle = '#ffd700';
      ctx.beginPath();
      ctx.moveTo(sx + 10, sy);
      ctx.lineTo(sx + 20, sy + 10);
      ctx.lineTo(sx + 10, sy + 20);
      ctx.lineTo(sx,      sy + 10);
      ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffd700aa';
      ctx.font = '7px Share Tech Mono'; ctx.textAlign = 'center';
      ctx.fillText(e.name || '', sx + 10, sy - 6);
      ctx.textAlign = 'left';
    }
  }

  // ── NPCs ─────────────────────────────────────────
  _drawNPCs(ctx, npcs, ox, oy, player, frame) {
    for (const npc of npcs) {
      const sx = npc.wx - ox - 8, sy = npc.wy - oy - 28;
      // Silhouette
      ctx.fillStyle = npc.isMerchant ? '#ffcc77cc' : '#e8d5a0cc';
      ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 6;
      ctx.beginPath(); ctx.arc(sx + 8, sy + 6, 6, 0, Math.PI*2); ctx.fill();
      ctx.fillRect(sx + 4, sy + 11, 8, 12);
      ctx.shadowBlur = 0;
      // Shop bag icon for merchant
      if (npc.isMerchant) {
        ctx.fillStyle = '#ffd700';
        ctx.font = '10px serif'; ctx.textAlign = 'center';
        ctx.fillText('🛍', sx + 8, sy - 2);
      }
      // Proximity prompt
      const near = Math.abs(player.x + player.w/2 - npc.wx) < 36 && Math.abs(player.y + player.h/2 - npc.wy) < 40;
      if (near && !npc.interacted) {
        ctx.fillStyle = '#e8d5a0';
        ctx.font = '7px Share Tech Mono'; ctx.textAlign = 'center';
        ctx.fillText('▲ TALK', sx + 8, sy - 6);
      }
      ctx.textAlign = 'left';
    }
  }

  // ── Enemies ──────────────────────────────────────
  _drawEnemies(ctx, entities, ox, oy, frame) {
    for (const e of entities) {
      if (!e.alive || !e.type || e.type === 'proj' || e.type === 'collectible' || e.type === 'loot') continue;
      const sx = e.x - ox, sy = e.y - oy;
      const flash = e.hitFlash > 0;
      const ec = flash ? '#ffffff' : e.color;

      ctx.fillStyle = ec;
      ctx.shadowColor = e.color; ctx.shadowBlur = flash ? 14 : 5;

      // Alert "!" when first aggroed
      if (e.alertFlash > 0) {
        ctx.fillStyle = '#ffcc00';
        ctx.font = 'bold 10px Share Tech Mono'; ctx.textAlign = 'center';
        ctx.fillText('!', sx + e.w/2, sy - 6);
        ctx.textAlign = 'left'; ctx.fillStyle = ec;
      }

      if (e.flying) {
        ctx.beginPath();
        ctx.ellipse(sx+e.w/2, sy+e.h/2, e.w/2, e.h/2, 0, 0, Math.PI*2); ctx.fill();
        const flap = Math.sin(frame * 0.18) * 5;
        ctx.fillStyle = ec + '88';
        ctx.beginPath(); ctx.ellipse(sx-4, sy+e.h/2, 8, 4+flap,  0.2, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(sx+e.w+4, sy+e.h/2, 8, 4+flap, -0.2, 0, Math.PI*2); ctx.fill();
      } else {
        const walk = e.onGround ? Math.sin(e.animFrame * 1.4) * 1.5 : 0;
        ctx.fillRect(sx+2, sy+walk, e.w-4, e.h-2);
        // Eyes
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(sx + (e.facing > 0 ? e.w-7 : 2), sy+5+walk, 3, 3);
        // Armor glow
        if (e.armored) {
          ctx.strokeStyle = e.color; ctx.lineWidth = 2; ctx.globalAlpha = 0.4;
          ctx.strokeRect(sx+1, sy+1, e.w-2, e.h-2);
          ctx.globalAlpha = 1;
        }
        // Shield
        if (e.shield) {
          ctx.fillStyle = '#88770088';
          const sdx = e.facing > 0 ? sx + e.w : sx - 5;
          ctx.fillRect(sdx, sy+4, 5, e.h-6);
          ctx.fillStyle = '#ccaa00';
          ctx.fillRect(sdx+1, sy+5, 3, e.h-8);
        }
        // Elite crown
        if (e.isElite) {
          ctx.fillStyle = '#ffcc00';
          ctx.fillRect(sx+3, sy-5, e.w-6, 4);
          for (let i = 0; i < 3; i++) ctx.fillRect(sx+4+i*(e.w-10)/2, sy-9, 3, 6);
        }
      }
      ctx.shadowBlur = 0;

      // HP bar (only for enemies with >2 maxHp)
      if (e.maxHp > 2) {
        const bw = e.w + 4;
        ctx.fillStyle = '#00000066'; ctx.fillRect(sx-2, sy-8, bw, 3);
        ctx.fillStyle = e.hp/e.maxHp > 0.5 ? '#44cc44' : '#cc4444';
        ctx.fillRect(sx-2, sy-8, bw*(e.hp/e.maxHp), 3);
      }
    }
  }

  // ── Projectiles ───────────────────────────────────
  _drawProjectiles(ctx, entities) {
    for (const e of entities) {
      if (e.type !== 'proj' || !e.alive) continue;
      ctx.fillStyle = e.color || '#fff';
      ctx.shadowColor = e.color; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.w/2, 0, Math.PI*2); ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  // ── Boss ─────────────────────────────────────────
  _drawBoss(ctx, boss, ox, oy, frame, pal) {
    const sx = boss.x - ox, sy = boss.y - oy;
    const flash = boss.hitFlash > 0 || boss.phaseFlashTimer % 8 < 4;
    const bc = flash ? '#ffffff' : boss.color;
    const phase = boss.phase;

    ctx.shadowColor = boss.color; ctx.shadowBlur = flash ? 24 : 12;
    ctx.fillStyle = bc;

    if (boss.bossType === 'Warden') {
      const s = Math.sin(boss.animFrame * 0.8) * 1.5;
      ctx.fillRect(sx+2, sy+s, boss.w-4, boss.h);
      // Antlers
      ctx.fillStyle = bc + 'cc';
      ctx.fillRect(sx+5,      sy-14+s, 4, 14);
      ctx.fillRect(sx+boss.w-9, sy-14+s, 4, 14);
      ctx.fillRect(sx+3,      sy-16+s, 9, 3);
      ctx.fillRect(sx+boss.w-12, sy-16+s, 9, 3);
      // Eyes — red in phase 3
      ctx.fillStyle = phase >= 3 ? '#ff0000' : '#ff4400';
      ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 10;
      ctx.fillRect(sx+(boss.facing>0?boss.w-10:3), sy+10+s, 6, 6);
      // Phase 3 rage aura
      if (phase === 3) {
        ctx.globalAlpha = 0.25 + Math.sin(frame*0.15)*0.1;
        ctx.fillStyle = '#ff4400';
        ctx.beginPath(); ctx.arc(sx+boss.w/2, sy+boss.h/2, boss.w, 0, Math.PI*2); ctx.fill();
        ctx.globalAlpha = 1;
      }
    } else if (boss.bossType === 'CrystalGuardian') {
      ctx.beginPath();
      ctx.moveTo(sx+boss.w/2, sy);
      ctx.lineTo(sx+boss.w,   sy+boss.h*0.4);
      ctx.lineTo(sx+boss.w*0.8, sy+boss.h);
      ctx.lineTo(sx+boss.w*0.2, sy+boss.h);
      ctx.lineTo(sx,            sy+boss.h*0.4);
      ctx.closePath(); ctx.fill();
      // Orbiting shards
      const shardCount = 3 + phase;
      for (let i = 0; i < shardCount; i++) {
        const ang = (i/shardCount)*Math.PI*2 + frame*0.05;
        const r = 28 + phase*6;
        ctx.fillStyle = '#88ccff';
        ctx.fillRect(sx+boss.w/2+Math.cos(ang)*r-3, sy+boss.h/2+Math.sin(ang)*r-6, 5, 12);
      }
    } else if (boss.bossType === 'VoidKing') {
      const pulse = Math.sin(frame*0.1) * 4;
      ctx.beginPath(); ctx.arc(sx+boss.w/2, sy+boss.h/2, boss.w/2+pulse, 0, Math.PI*2); ctx.fill();
      // Crown
      ctx.fillStyle = '#cc44ff';
      ctx.fillRect(sx+4, sy-8, boss.w-8, 6);
      for (let i=0;i<3;i++) ctx.fillRect(sx+5+i*(boss.w-14)/2, sy-16, 4, 10);
      // Void tendrils
      ctx.strokeStyle = '#cc44ff55'; ctx.lineWidth = 2;
      const tCount = 4 + phase * 2;
      for (let i=0;i<tCount;i++) {
        const ang = (i/tCount)*Math.PI*2 + frame*0.03;
        ctx.beginPath();
        ctx.moveTo(sx+boss.w/2, sy+boss.h/2);
        ctx.lineTo(sx+boss.w/2 + Math.cos(ang)*40, sy+boss.h/2 + Math.sin(ang)*28);
        ctx.stroke();
      }
      // Phase 3 screen darkness effect (drawn as expanding rings)
      if (phase === 3) {
        const ringR = (frame % 60) / 60 * 80;
        ctx.globalAlpha = Math.max(0, 0.3 - ringR/260);
        ctx.strokeStyle = '#cc44ff'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(sx+boss.w/2, sy+boss.h/2, ringR, 0, Math.PI*2); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    ctx.shadowBlur = 0;

    // Boss HP bar at top of screen
    const barW = W * 0.6, barX = (W-barW)/2, barY = 14;
    ctx.fillStyle = '#00000088'; ctx.fillRect(barX-1, barY-1, barW+2, 10);
    const hpGrad = ctx.createLinearGradient(barX, barY, barX+barW, barY);
    hpGrad.addColorStop(0, '#cc3344'); hpGrad.addColorStop(1, '#ff6677');
    ctx.fillStyle = hpGrad; ctx.fillRect(barX, barY, barW * boss.hpPct, 8);
    // Phase markers
    [0.66, 0.33].forEach(pct => {
      ctx.fillStyle = '#ffffff44';
      ctx.fillRect(barX + barW*pct - 1, barY, 2, 8);
    });
    ctx.fillStyle = '#ffffff66'; ctx.font='7px Share Tech Mono'; ctx.textAlign='center';
    ctx.fillText(boss.bossType.toUpperCase() + '  [PHASE '+boss.phase+']', W/2, barY+18);
    ctx.textAlign = 'left';

    // Phase transition flash
    if (boss.phaseFlashTimer > 0) {
      ctx.globalAlpha = (boss.phaseFlashTimer/80)*0.45;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }

  // ── Player ────────────────────────────────────────
  _drawPlayer(ctx, pl, ox, oy, frame, pal) {
    if (pl.dead) return;
    // Invincibility blink
    if (pl.invTimer > 0 && Math.floor(pl.invTimer/4) % 2 === 0) return;

    const sx = Math.round(pl.x - ox);
    const sy = Math.round(pl.y - oy);

    ctx.shadowColor = pal.accent; ctx.shadowBlur = pl.dashTimer > 0 ? 20 : 10;

    const walk = pl.onGround ? Math.sin(pl.animFrame * 1.5) * 1.5 : 0;
    const lean  = pl.vx * 0.06;

    ctx.save();
    ctx.translate(sx + pl.w/2, sy + pl.h/2);
    ctx.rotate(lean);

    // Body / cloak
    ctx.fillStyle = '#e8d5a0';
    ctx.fillRect(-5, -11+walk, 10, 18);

    // Head
    ctx.fillStyle = '#c8b580';
    ctx.beginPath(); ctx.arc(0, -12+walk, 6, 0, Math.PI*2); ctx.fill();

    // Eyes
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(pl.facing > 0 ? 1 : -4, -14+walk, 3, 3);

    // Horns
    ctx.fillStyle = '#c8b58066';
    if (pl.facing > 0) {
      ctx.fillRect(2, -19+walk, 2, 6); ctx.fillRect(5, -18+walk, 2, 5);
    } else {
      ctx.fillRect(-4, -19+walk, 2, 6); ctx.fillRect(-7, -18+walk, 2, 5);
    }

    // Cloak bottom
    ctx.fillStyle = '#a09060cc';
    ctx.fillRect(-7, 4+walk, 14, 6);

    // Wall slide spark
    if (pl.wallSlide) {
      ctx.fillStyle = pal.particle + '88';
      ctx.fillRect(pl.facing > 0 ? 4 : -6, -4+walk, 3, 10);
    }

    // Charge effect
    if (pl.isCharging && pl.chargeTimer > 15) {
      const cg = Math.min(1, (pl.chargeTimer - 15) / 30);
      ctx.globalAlpha = cg * 0.7;
      ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 16 + cg * 8;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(0, 0, 10+cg*8, 0, Math.PI*2); ctx.fill();
      // Inner glow ring
      ctx.globalAlpha = cg * 0.5;
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(0, 0, 8+cg*6, 0, Math.PI*2); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    }

    // Attack slash arc
    if (pl.attackTimer > 0) {
      const at = pl.attackTimer / 12;
      ctx.strokeStyle = pl.chargeReady ? '#ffffff' : pal.accent;
      ctx.lineWidth   = pl.chargeReady ? 4 : 2.5;
      ctx.globalAlpha = at * 0.9;
      ctx.shadowColor = pl.chargeReady ? '#ffffff' : pal.accent; 
      ctx.shadowBlur = pl.chargeReady ? 18 : 14;
      const dir = pl.facing;
      ctx.beginPath();
      ctx.arc(dir * 10, -2, pl.chargeReady ? 24 : 18,
        dir > 0 ? -0.9 : Math.PI-0.9,
        dir > 0 ?  0.9 : Math.PI+0.9);
      ctx.stroke();
      // Combo step indicator with glow
      if (pl.comboStep > 0) {
        ctx.shadowColor = pal.accent; ctx.shadowBlur = 8;
        for (let i = 0; i < pl.comboStep; i++) {
          ctx.fillStyle = pal.accent;
          ctx.globalAlpha = 0.8;
          ctx.fillRect(dir*(16+i*5), -6, 3, 3);
        }
        ctx.shadowBlur = 0;
      }
      ctx.globalAlpha = 1;
    }

    ctx.restore();
    ctx.shadowBlur = 0;

    // Dash afterimages
    if (pl.dashTimer > 0) {
      for (let i = 1; i <= 3; i++) {
        ctx.globalAlpha = 0.15 * (4 - i) / 3;
        ctx.fillStyle = pal.accent;
        ctx.fillRect(sx - pl.facing * i * 7, sy + 2, pl.w, pl.h - 4);
      }
      ctx.globalAlpha = 1;
    }
  }

  // ── Vignette ─────────────────────────────────────
  _drawVignette(ctx, pal) {
    const vg = ctx.createRadialGradient(W/2, H/2, H*0.25, W/2, H/2, H*0.78);
    vg.addColorStop(0, 'transparent');
    vg.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    // Top / bottom fog strips
    const fogT = ctx.createLinearGradient(0, 0, 0, 30);
    fogT.addColorStop(0, pal.fog + 'cc'); fogT.addColorStop(1, 'transparent');
    ctx.fillStyle = fogT; ctx.fillRect(0, 0, W, 30);
    const fogB = ctx.createLinearGradient(0, H-24, 0, H);
    fogB.addColorStop(0, 'transparent'); fogB.addColorStop(1, pal.fog + 'aa');
    ctx.fillStyle = fogB; ctx.fillRect(0, H-24, W, 24);
  }

  // ── Exit arrows ───────────────────────────────────
  _drawExitArrows(ctx, exits, ox, oy) {
    ctx.fillStyle = '#ffffff22'; ctx.font = '11px Share Tech Mono'; ctx.textAlign = 'center';
    const arrowMap = { right:'▶', left:'◀', up:'▲', down:'▼' };
    for (const ex of exits) {
      const esx = ex.wx - ox, esy = ex.wy - oy;
      const arrow = arrowMap[ex.dir] || '';
      if      (ex.dir === 'right' && esx > W - 60) ctx.fillText(arrow, W - 8, H/2);
      else if (ex.dir === 'left'  && esx < 60)     ctx.fillText(arrow, 8, H/2);
      else if (ex.dir === 'up'    && esy < 60)      ctx.fillText(arrow, W/2, 14);
      else if (ex.dir === 'down'  && esy > H - 60)  ctx.fillText(arrow, W/2, H - 6);
    }
    ctx.textAlign = 'left';
  }

  // ── Transition overlay ────────────────────────────
  drawTransition(alpha) {
    if (alpha <= 0) return;
    this.ctx.fillStyle = `rgba(0,0,0,${Math.min(1, alpha)})`;
    this.ctx.fillRect(0, 0, W, H);
  }
}
