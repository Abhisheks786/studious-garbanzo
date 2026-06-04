// ═══════════════════════════════════════════════════
//  SILKBOUND PRO — Particle System (Pooled)
// ═══════════════════════════════════════════════════
const POOL_SIZE = 300;

export class ParticleSystem {
  constructor() {
    // Pre-allocate pool
    this._pool = Array.from({ length: POOL_SIZE }, () => ({
      x:0, y:0, vx:0, vy:0, life:0, maxLife:1, decay:0.04,
      color:'#fff', gravity:0.08, size:2, active:false,
      type:'circle', // 'circle' | 'square' | 'line'
      rot:0, rotV:0,
    }));
    this._active = [];
    this.screenShake = { x:0, y:0, intensity:0, duration:0 };
    this._floatTexts = []; // floating damage numbers
  }

  _acquire() {
    const p = this._pool.find(p => !p.active);
    return p || null; // drop if pool exhausted
  }

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
      p.decay = life / (20 + Math.random() * 20);
      p.color = color; p.gravity = gravity;
      p.size = 1.5 + Math.random() * 2.5;
      p.type = type;
      p.rot = Math.random() * Math.PI * 2;
      p.rotV = (Math.random() - 0.5) * 0.3;
      p.active = true;
      this._active.push(p);
    }
  }

  spawnBurst(x, y, color, n = 20) {
    for (let i = 0; i < n; i++) {
      const p = this._acquire();
      if (!p) break;
      const a = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
      const s = 3.5 + Math.random() * 5.5;
      p.x = x; p.y = y;
      p.vx = Math.cos(a) * s;
      p.vy = Math.sin(a) * s;
      p.life = 0.7 + Math.random() * 0.5; p.maxLife = p.life;
      p.decay = p.life / 35;
      p.color = color; p.gravity = 0.04;
      p.size = 2.5 + Math.random() * 4;
      p.type = 'circle'; p.rot = Math.random() * Math.PI * 2; p.rotV = (Math.random() - 0.5) * 0.2;
      p.active = true;
      this._active.push(p);
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
      p.decay = p.life / 18;
      p.color = color; p.gravity = 0.14;
      p.size = 1.5 + Math.random() * 2.5;
      p.type = 'square'; p.rot = Math.random() * Math.PI; p.rotV = (Math.random() - 0.5) * 0.5;
      p.active = true;
      this._active.push(p);
    }
  }

  spawnDust(x, y, color) {
    for (let i = 0; i < 6; i++) {
      const p = this._acquire();
      if (!p) break;
      p.x = x + (Math.random() - 0.5) * 12;
      p.y = y;
      p.vx = (Math.random() - 0.5) * 2.2; p.vy = -Math.random() * 2;
      p.life = 0.5; p.maxLife = 0.5;
      p.decay = 0.02;
      p.color = color; p.gravity = 0.015;
      p.size = 2.5 + Math.random() * 3.5;
      p.type = 'circle'; p.rot = 0; p.rotV = 0;
      p.active = true;
      this._active.push(p);
    }
  }

  floatText(text, x, y, color = '#ffffff', size = 12) {
    this._floatTexts.push({ text, x, y, vy: -1.5, life: 1.0, color, size });
  }

  shake(intensity, duration) {
    if (intensity > this.screenShake.intensity) {
      this.screenShake.intensity = Math.min(intensity, 8); // cap intensity
      this.screenShake.duration  = Math.max(duration, this.screenShake.duration); // extend if stronger
    }
  }

  update() {
    // Particles
    for (let i = this._active.length - 1; i >= 0; i--) {
      const p = this._active[i];
      p.x += p.vx; p.y += p.vy;
      p.vy += p.gravity;
      p.vx *= 0.96; // air resistance (slightly higher for smoother decay)
      p.life -= p.decay;
      p.rot += p.rotV;
      if (p.life <= 0) {
        p.active = false;
        this._active.splice(i, 1);
      }
    }
    // Float texts
    for (let i = this._floatTexts.length - 1; i >= 0; i--) {
      const t = this._floatTexts[i];
      t.y += t.vy; t.vy *= 0.90; t.life -= 0.04;
      if (t.life <= 0) this._floatTexts.splice(i, 1);
    }
    // Screen shake decay with better easing
    if (this.screenShake.duration > 0) {
      this.screenShake.duration--;
      const progress = this.screenShake.duration / 20;
      const easeOut = Math.sqrt(progress); // ease out for smooth decay
      const s = this.screenShake.intensity * easeOut;
      this.screenShake.x = (Math.random() - 0.5) * s * 1.2;
      this.screenShake.y = (Math.random() - 0.5) * s * 1.2;
      if (this.screenShake.duration <= 0) {
        this.screenShake.x = 0; this.screenShake.y = 0; this.screenShake.intensity = 0;
      }
    }
  }

  draw(ctx, camX, camY, shakeEnabled = true) {
    const ox = Math.round(camX + (shakeEnabled ? this.screenShake.x : 0));
    const oy = Math.round(camY + (shakeEnabled ? this.screenShake.y : 0));

    for (const p of this._active) {
      const a = Math.max(0, p.life / p.maxLife) * 0.85;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      const sx = p.x - ox, sy = p.y - oy;
      const sz = p.size * Math.max(0.1, p.life / p.maxLife);

      if (p.type === 'square') {
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(p.rot);
        ctx.fillRect(-sz/2, -sz/2, sz, sz);
        ctx.restore();
      } else {
        ctx.beginPath(); ctx.arc(sx, sy, sz, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // Float texts
    for (const t of this._floatTexts) {
      ctx.globalAlpha = Math.min(1, t.life * 1.5);
      ctx.shadowColor = t.color; ctx.shadowBlur = 4;
      ctx.fillStyle = t.color;
      ctx.font = `bold ${t.size}px 'Share Tech Mono', monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(t.text, t.x - ox, t.y - oy);
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur  = 0;
    ctx.textAlign   = 'left';
  }
}
