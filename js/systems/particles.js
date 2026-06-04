// ═══════════════════════════════════════════════════
//  SILKBOUND PRO — Particle System  (Production Upgrade)
//
//  FIXES:
//   • O(1) free-list (head pointer) — was O(n) Array.find()
//   • reset() method clears all particles on room transition
//     (prevents ghost particles from previous room)
//
//  UPGRADES:
//   • spawnTrail()     — motion trail for dash/projectiles
//   • spawnShockwave() — ground shockwave ring
//   • spawnExplosion() — large multi-burst explosion
//   • spawnWeather()   — biome-specific weather (called per frame)
//   • Improved screen shake with trauma/decay model
// ═══════════════════════════════════════════════════
const POOL_SIZE = 400;

export class ParticleSystem {
  constructor() {
    // Pre-allocate pool
    this._pool = [];
    for (let i = 0; i < POOL_SIZE; i++) {
      this._pool.push({
        x:0, y:0, vx:0, vy:0,
        life:0, maxLife:1, decay:0.04,
        color:'#fff', gravity:0.08,
        size:2, active:false,
        type:'circle',   // 'circle' | 'square' | 'ring'
        rot:0, rotV:0,
        _next: i + 1,    // free-list next pointer
      });
    }
    this._pool[POOL_SIZE - 1]._next = -1; // end sentinel
    this._freeHead  = 0;   // index of first free slot
    this._active    = [];  // active particles (refs into pool)

    // Screen shake — trauma model
    this.screenShake = { x:0, y:0, trauma:0 };

    // Floating damage numbers
    this._floatTexts = [];

    // Weather state
    this._weatherT = 0;
  }

  // ── Pool management ──────────────────────────────────
  _acquire() {
    if (this._freeHead === -1) return null; // pool exhausted
    const p       = this._pool[this._freeHead];
    this._freeHead = p._next;
    p.active      = true;
    this._active.push(p);
    return p;
  }

  _release(p) {
    p.active  = false;
    p._next   = this._freeHead;
    this._freeHead = this._pool.indexOf(p);
  }

  // Clear ALL particles (call on room transition)
  reset() {
    for (let i = this._active.length - 1; i >= 0; i--) {
      this._release(this._active[i]);
    }
    this._active     = [];
    this._floatTexts = [];
    // Re-link free list
    for (let i = 0; i < POOL_SIZE - 1; i++) this._pool[i]._next = i + 1;
    this._pool[POOL_SIZE - 1]._next = -1;
    this._freeHead   = 0;
    this.screenShake = { x:0, y:0, trauma:0 };
  }

  // ── Spawn helpers ────────────────────────────────────
  spawn(x, y, color, n = 6, speed = 2, life = 0.8, gravity = 0.08, type = 'circle') {
    for (let i = 0; i < n; i++) {
      const p = this._acquire();
      if (!p) break;
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      p.x = x; p.y = y;
      p.vx = Math.cos(a) * s;
      p.vy = Math.sin(a) * s - speed * 0.3;
      p.life = life; p.maxLife = life;
      p.decay   = life / (20 + Math.random() * 20);
      p.color   = color; p.gravity = gravity;
      p.size    = 1.5 + Math.random() * 2.5;
      p.type    = type;
      p.rot     = Math.random() * Math.PI * 2;
      p.rotV    = (Math.random() - 0.5) * 0.3;
    }
  }

  spawnBurst(x, y, color, n = 20) {
    for (let i = 0; i < n; i++) {
      const p = this._acquire();
      if (!p) break;
      const a = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
      const s = 3.5 + Math.random() * 5.5;
      p.x = x; p.y = y;
      p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s;
      p.life = 0.7 + Math.random() * 0.5; p.maxLife = p.life;
      p.decay   = p.life / 35;
      p.color   = color; p.gravity = 0.04;
      p.size    = 2.5 + Math.random() * 4;
      p.type    = 'circle';
      p.rot     = Math.random() * Math.PI * 2;
      p.rotV    = (Math.random() - 0.5) * 0.2;
    }
  }

  spawnHitSpark(x, y, color, dir = 1) {
    for (let i = 0; i < 12; i++) {
      const p = this._acquire();
      if (!p) break;
      const a = (Math.random() - 0.5) * Math.PI * 0.9 + (dir > 0 ? 0 : Math.PI);
      const s = 4 + Math.random() * 5.5;
      p.x = x; p.y = y;
      p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s - 1.5;
      p.life = 0.35 + Math.random() * 0.25; p.maxLife = p.life;
      p.decay   = p.life / 18;
      p.color   = color; p.gravity = 0.14;
      p.size    = 1.5 + Math.random() * 2.5;
      p.type    = 'square';
      p.rot     = Math.random() * Math.PI;
      p.rotV    = (Math.random() - 0.5) * 0.5;
    }
  }

  spawnDust(x, y, color) {
    for (let i = 0; i < 6; i++) {
      const p = this._acquire();
      if (!p) break;
      p.x  = x + (Math.random() - 0.5) * 12; p.y = y;
      p.vx = (Math.random() - 0.5) * 2.2;    p.vy = -Math.random() * 2;
      p.life = 0.5; p.maxLife = 0.5; p.decay = 0.02;
      p.color   = color; p.gravity = 0.015;
      p.size    = 2.5 + Math.random() * 3.5;
      p.type    = 'circle'; p.rot = 0; p.rotV = 0;
    }
  }

  // Dash/motion trail — called each dash frame
  spawnTrail(x, y, color, count = 3) {
    for (let i = 0; i < count; i++) {
      const p = this._acquire();
      if (!p) break;
      p.x = x + (Math.random() - 0.5) * 6;
      p.y = y + (Math.random() - 0.5) * 6;
      p.vx = (Math.random() - 0.5) * 0.5;
      p.vy = (Math.random() - 0.5) * 0.5;
      p.life = 0.25 + Math.random() * 0.15; p.maxLife = p.life;
      p.decay   = p.life / 12;
      p.color   = color; p.gravity = 0;
      p.size    = 3 + Math.random() * 3;
      p.type    = 'circle'; p.rot = 0; p.rotV = 0;
    }
  }

  // Ground shockwave ring (boss stomp, heavy landing)
  spawnShockwave(x, y, color, radius = 30) {
    for (let i = 0; i < 16; i++) {
      const p = this._acquire();
      if (!p) break;
      const a = (i / 16) * Math.PI * 2;
      p.x = x; p.y = y;
      p.vx = Math.cos(a) * radius * 0.08;
      p.vy = Math.sin(a) * radius * 0.04 - 0.5;
      p.life = 0.4 + Math.random() * 0.2; p.maxLife = p.life;
      p.decay   = p.life / 14;
      p.color   = color; p.gravity = 0.02;
      p.size    = 4 + Math.random() * 4;
      p.type    = 'circle'; p.rot = 0; p.rotV = 0;
    }
  }

  // Large multi-stage explosion (boss death, big events)
  spawnExplosion(x, y, color) {
    this.spawnBurst(x, y, color, 30);
    setTimeout(() => this.spawnBurst(x, y, '#ffffff', 15), 80);
    setTimeout(() => this.spawnBurst(x, y, color, 20),     160);
    this.shake(10, 35);
  }

  // Biome weather — call once per frame with camera offset
  spawnWeather(biome, camX, camY, W, H) {
    this._weatherT++;
    switch (biome) {
      case 'fungal': {
        // Drifting spores
        if (this._weatherT % 3 === 0) {
          const p = this._acquire();
          if (p) {
            p.x = camX + Math.random() * W;
            p.y = camY - 10;
            p.vx = (Math.random() - 0.5) * 0.4;
            p.vy = 0.2 + Math.random() * 0.4;
            p.life = 2.0; p.maxLife = 2.0; p.decay = 0.012;
            p.color = '#66dd8888'; p.gravity = 0;
            p.size  = 1 + Math.random() * 1.5;
            p.type  = 'circle'; p.rot = 0; p.rotV = 0;
          }
        }
        break;
      }
      case 'crystal': {
        // Sparkling light refraction flecks
        if (this._weatherT % 5 === 0) {
          const p = this._acquire();
          if (p) {
            p.x = camX + Math.random() * W;
            p.y = camY + Math.random() * H;
            p.vx = (Math.random() - 0.5) * 0.3;
            p.vy = (Math.random() - 0.5) * 0.3;
            p.life = 0.6 + Math.random() * 0.4; p.maxLife = p.life;
            p.decay = p.life / 20;
            p.color = '#88ccffbb'; p.gravity = 0;
            p.size  = 0.8 + Math.random() * 1.2;
            p.type  = 'square'; p.rot = Math.random() * Math.PI; p.rotV = 0.05;
          }
        }
        break;
      }
      case 'depths': {
        // Dripping stalactite drops
        if (this._weatherT % 8 === 0) {
          const p = this._acquire();
          if (p) {
            p.x = camX + Math.random() * W;
            p.y = camY;
            p.vx = 0; p.vy = 0.8 + Math.random() * 0.8;
            p.life = 1.2; p.maxLife = 1.2; p.decay = 0.02;
            p.color = '#6644aa44'; p.gravity = 0.03;
            p.size  = 1 + Math.random();
            p.type  = 'circle'; p.rot = 0; p.rotV = 0;
          }
        }
        break;
      }
    }
  }

  // Floating text (damage numbers, pickups)
  floatText(text, x, y, color = '#ffffff', size = 12) {
    this._floatTexts.push({ text, x, y, vy: -1.5, life: 1.0, color, size });
  }

  // ── Screen shake — trauma model ────────────────────────
  // trauma 0-1; shake amount = trauma²
  shake(intensity, duration) {
    // Convert legacy (intensity, duration) to trauma value
    const newTrauma = Math.min(1, intensity / 10);
    if (newTrauma > this.screenShake.trauma) {
      this.screenShake.trauma = newTrauma;
    }
  }

  // ── Update ───────────────────────────────────────────
  update() {
    // Particles
    for (let i = this._active.length - 1; i >= 0; i--) {
      const p = this._active[i];
      p.x  += p.vx; p.y += p.vy;
      p.vy += p.gravity;
      p.vx *= 0.96;
      p.life -= p.decay;
      p.rot  += p.rotV;
      if (p.life <= 0) {
        this._active.splice(i, 1);
        this._release(p);
      }
    }

    // Float texts
    for (let i = this._floatTexts.length - 1; i >= 0; i--) {
      const t = this._floatTexts[i];
      t.y  += t.vy; t.vy *= 0.90; t.life -= 0.035;
      if (t.life <= 0) this._floatTexts.splice(i, 1);
    }

    // Screen shake — trauma decay
    const ss = this.screenShake;
    if (ss.trauma > 0) {
      ss.trauma   = Math.max(0, ss.trauma - 0.04);
      const t2    = ss.trauma * ss.trauma; // quadratic shake
      const mag   = t2 * 8;
      ss.x        = (Math.random() - 0.5) * mag * 2;
      ss.y        = (Math.random() - 0.5) * mag * 2;
      if (ss.trauma <= 0) { ss.x = 0; ss.y = 0; }
    }
  }

  // ── Draw ─────────────────────────────────────────────
  draw(ctx, camX, camY, shakeEnabled = true) {
    const ox = Math.round(camX + (shakeEnabled ? this.screenShake.x : 0));
    const oy = Math.round(camY + (shakeEnabled ? this.screenShake.y : 0));

    for (const p of this._active) {
      const a  = Math.max(0, p.life / p.maxLife) * 0.85;
      ctx.globalAlpha = a;
      ctx.fillStyle   = p.color;
      const sx  = p.x - ox, sy = p.y - oy;
      const sz  = p.size * Math.max(0.1, p.life / p.maxLife);

      if (p.type === 'square') {
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(p.rot);
        ctx.fillRect(-sz / 2, -sz / 2, sz, sz);
        ctx.restore();
      } else if (p.type === 'ring') {
        ctx.beginPath();
        ctx.arc(sx, sy, sz, 0, Math.PI * 2);
        ctx.strokeStyle = p.color;
        ctx.lineWidth   = 1.5;
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(sx, sy, sz, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // Float texts
    ctx.save();
    for (const t of this._floatTexts) {
      ctx.globalAlpha  = Math.min(1, t.life * 1.5);
      ctx.shadowColor  = t.color;
      ctx.shadowBlur   = 6;
      ctx.fillStyle    = t.color;
      ctx.font         = `bold ${t.size}px 'Share Tech Mono', monospace`;
      ctx.textAlign    = 'center';
      ctx.fillText(t.text, t.x - ox, t.y - oy);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.shadowBlur  = 0;
    ctx.textAlign   = 'left';
  }
}
