// ═══════════════════════════════════════════════════
//  SILKBOUND PRO — Physics System
// ═══════════════════════════════════════════════════
import { TILE } from '../constants.js';

export class Physics {
  constructor() {
    this.roomTiles     = []; // 2D bool array (solid)
    this.roomPassTiles = []; // 2D bool array (pass-through)
  }

  loadRoom(tileRows) {
    this.roomTiles     = tileRows.map(row => Array.from(row).map(c => c === '#'));
    this.roomPassTiles = tileRows.map(row => Array.from(row).map(c => c === 'p'));
  }

  isSolid(wx, wy) {
    const c = Math.floor(wx / TILE), r = Math.floor(wy / TILE);
    return !!(this.roomTiles[r] && this.roomTiles[r][c]);
  }

  isPass(wx, wy) {
    const c = Math.floor(wx / TILE), r = Math.floor(wy / TILE);
    return !!(this.roomPassTiles[r] && this.roomPassTiles[r][c]);
  }

  rectSolid(x, y, w, h) {
    const c0 = Math.floor(x / TILE),       c1 = Math.floor((x + w - 1) / TILE);
    const r0 = Math.floor(y / TILE),       r1 = Math.floor((y + h - 1) / TILE);
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++)
        if (this.roomTiles[r] && this.roomTiles[r][c]) return true;
    return false;
  }

  rectPass(x, y, w, h) {
    const c0 = Math.floor(x / TILE), c1 = Math.floor((x + w - 1) / TILE);
    const r  = Math.floor(y / TILE);
    for (let c = c0; c <= c1; c++)
      if (this.roomPassTiles[r] && this.roomPassTiles[r][c]) return true;
    return false;
  }

  // Move an actor, resolving tile collisions. Mutates actor's position and velocity.
  moveActor(actor, dx, dy, passThroughDown = false) {
    // X axis
    actor.x += dx;
    if (this.rectSolid(actor.x + 2, actor.y + 3, actor.w - 4, actor.h - 6)) {
      actor.x -= dx;
      actor.hitWall = dx > 0 ? 1 : (dx < 0 ? -1 : 0);
      actor.vx = 0;
    }

    // Y axis
    actor.onGround = false;
    actor.y += dy;

    if (dy >= 0) {
      // Landing — test bottom strip
      if (this.rectSolid(actor.x + 2, actor.y + actor.h, actor.w - 4, 1)) {
        actor.y = Math.floor((actor.y + actor.h) / TILE) * TILE - actor.h;
        actor.vy = 0;
        actor.onGround = true;
      } else if (!passThroughDown && dy > 0 && this.rectPass(actor.x + 2, actor.y + actor.h - 1, actor.w - 4, 2)) {
        actor.y = Math.floor((actor.y + actor.h - 1) / TILE) * TILE - actor.h;
        actor.vy = 0;
        actor.onGround = true;
      }
    } else {
      // Head bump
      if (this.rectSolid(actor.x + 2, actor.y, actor.w - 4, 1)) {
        actor.y = Math.floor(actor.y / TILE) * TILE + TILE;
        actor.vy = 0;
      }
    }
  }

  // Wall probe — returns wall direction (1=right wall, -1=left wall, 0=none)
  probeWall(actor) {
    if (this.rectSolid(actor.x + actor.w + 1, actor.y + 4, 1, actor.h - 8)) return 1;
    if (this.rectSolid(actor.x - 2,           actor.y + 4, 1, actor.h - 8)) return -1;
    return 0;
  }

  // AABB overlap test between two rects
  overlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax + aw > bx && ax < bx + bw && ay + ah > by && ay < by + bh;
  }
}
