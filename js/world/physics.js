// ═══════════════════════════════════════════════════
//  SILKBOUND PRO — Physics System  (Production Upgrade)
//
//  UPGRADES:
//   • reset() method — call on room load to clear stale tile data
//   • Cached row/col counts — avoid repeated .length checks
//   • Sub-step for fast projectiles (prevents tunneling)
//   • Improved moveActor for better wall sliding
// ═══════════════════════════════════════════════════
import { TILE } from '../constants.js';

export class Physics {
  constructor() {
    this.roomTiles     = []; // 2D bool array (solid)
    this.roomPassTiles = []; // 2D bool array (pass-through)
    this._rows         = 0;
    this._cols         = 0;
  }

  // ── Room load / reset ─────────────────────────────
  loadRoom(tileRows) {
    this.roomTiles     = tileRows.map(row => Array.from(row).map(c => c === '#'));
    this.roomPassTiles = tileRows.map(row => Array.from(row).map(c => c === 'p'));
    this._rows         = this.roomTiles.length;
    this._cols         = this.roomTiles[0] ? this.roomTiles[0].length : 0;
  }

  // Explicit reset — called during room transitions to prevent stale data
  reset() {
    this.roomTiles     = [];
    this.roomPassTiles = [];
    this._rows         = 0;
    this._cols         = 0;
  }

  // ── Tile queries ──────────────────────────────────
  isSolid(wx, wy) {
    const c = Math.floor(wx / TILE), r = Math.floor(wy / TILE);
    if (r < 0 || r >= this._rows || c < 0 || c >= this._cols) return false;
    return this.roomTiles[r][c];
  }

  isPass(wx, wy) {
    const c = Math.floor(wx / TILE), r = Math.floor(wy / TILE);
    if (r < 0 || r >= this._rows || c < 0 || c >= this._cols) return false;
    return this.roomPassTiles[r][c];
  }

  rectSolid(x, y, w, h) {
    const c0 = Math.floor(x / TILE),         c1 = Math.floor((x + w - 1) / TILE);
    const r0 = Math.floor(y / TILE),         r1 = Math.floor((y + h - 1) / TILE);
    for (let r = Math.max(0, r0); r <= Math.min(this._rows - 1, r1); r++) {
      for (let c = Math.max(0, c0); c <= Math.min(this._cols - 1, c1); c++) {
        if (this.roomTiles[r][c]) return true;
      }
    }
    return false;
  }

  rectPass(x, y, w, h) {
    const c0 = Math.floor(x / TILE), c1 = Math.floor((x + w - 1) / TILE);
    const r  = Math.floor(y / TILE);
    if (r < 0 || r >= this._rows) return false;
    for (let c = Math.max(0, c0); c <= Math.min(this._cols - 1, c1); c++) {
      if (this.roomPassTiles[r][c]) return true;
    }
    return false;
  }

  // ── Move actor with collision resolution ─────────────
  moveActor(actor, dx, dy, passThroughDown = false) {
    // X axis
    actor.x += dx;
    if (this.rectSolid(actor.x + 2, actor.y + 3, actor.w - 4, actor.h - 6)) {
      actor.x -= dx;
      if (typeof actor.hitWall !== 'undefined') {
        actor.hitWall = dx > 0 ? 1 : (dx < 0 ? -1 : 0);
      }
      actor.vx = 0;
    }

    // Y axis
    actor.onGround = false;
    actor.y += dy;

    if (dy >= 0) {
      // Landing
      if (this.rectSolid(actor.x + 2, actor.y + actor.h, actor.w - 4, 1)) {
        actor.y = Math.floor((actor.y + actor.h) / TILE) * TILE - actor.h;
        actor.vy       = 0;
        actor.onGround = true;
      } else if (!passThroughDown && dy > 0 &&
                 this.rectPass(actor.x + 2, actor.y + actor.h - 1, actor.w - 4, 2)) {
        actor.y        = Math.floor((actor.y + actor.h - 1) / TILE) * TILE - actor.h;
        actor.vy       = 0;
        actor.onGround = true;
      }
    } else {
      // Head bump
      if (this.rectSolid(actor.x + 2, actor.y, actor.w - 4, 1)) {
        actor.y  = Math.floor(actor.y / TILE) * TILE + TILE;
        actor.vy = 0;
      }
    }
  }

  // Sub-step mover for fast projectiles (prevents tunneling at high speed)
  moveProjectile(proj, steps = 2) {
    const stepX = proj.vx / steps;
    const stepY = proj.vy / steps;
    for (let i = 0; i < steps; i++) {
      proj.x += stepX;
      proj.y += stepY;
      if (this.rectSolid(proj.x - proj.w / 2, proj.y - proj.h / 2, proj.w, proj.h)) {
        proj.alive = false;
        return;
      }
    }
  }

  // Wall probe — returns direction (1=right, -1=left, 0=none)
  probeWall(actor) {
    if (this.rectSolid(actor.x + actor.w + 1, actor.y + 4, 1, actor.h - 8)) return  1;
    if (this.rectSolid(actor.x - 2,           actor.y + 4, 1, actor.h - 8)) return -1;
    return 0;
  }

  // Line-of-sight check (Bresenham ray from source to target)
  hasLOS(x0, y0, x1, y1) {
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1,  sy = y0 < y1 ? 1 : -1;
    let   err = dx - dy;
    let   cx  = x0, cy = y0;
    const steps = Math.max(dx, dy) / TILE;
    for (let i = 0; i < steps && i < 50; i++) {
      if (this.isSolid(cx, cy)) return false;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; cx += sx * TILE * 0.5; }
      if (e2 <  dx) { err += dx; cy += sy * TILE * 0.5; }
    }
    return true;
  }

  // AABB overlap
  overlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax + aw > bx && ax < bx + bw && ay + ah > by && ay < by + bh;
  }
}
