# PERFORMANCE OPTIMIZATION CHECKLIST & PROFILING GUIDE

## Current Performance Baseline

```
Target: 60 FPS maintained
- Frame budget: 16.67ms per frame
- CPU time: ~14ms (accounting for browser overhead)
- Memory: < 50MB stable
```

## Performance Issues & Solutions

### 1. **Collision Detection (O(n²) Complexity)**

**Issue**: Checking every entity against every other entity
```javascript
// ✗ BAD: O(n²) collision checks
for (let i = 0; i < enemies.length; i++) {
  for (let j = i + 1; j < enemies.length; j++) {
    if (checkCollision(enemies[i], enemies[j])) {
      // ...
    }
  }
}
```

**Solution**: Spatial Hashing Grid
```javascript
// ✓ GOOD: O(n) with spatial partition
class CollisionGrid {
  constructor(cellSize = 64) {
    this.cellSize = cellSize;
    this.grid = new Map();
  }

  add(entity) {
    const cell = this._getCell(entity.x, entity.y);
    if (!this.grid.has(cell)) this.grid.set(cell, []);
    this.grid.get(cell).push(entity);
  }

  getNearby(x, y) {
    const nearby = [];
    const cellX = Math.floor(x / this.cellSize);
    const cellY = Math.floor(y / this.cellSize);
    
    // Check only nearby cells (9-cell neighborhood)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const cell = `${cellX + dx},${cellY + dy}`;
        if (this.grid.has(cell)) {
          nearby.push(...this.grid.get(cell));
        }
      }
    }
    return nearby;
  }

  clear() {
    this.grid.clear();
  }

  _getCell(x, y) {
    return `${Math.floor(x / this.cellSize)},${Math.floor(y / this.cellSize)}`;
  }
}

// Usage in physics update
const grid = new CollisionGrid(64);
for (const entity of allEntities) {
  grid.add(entity);
}

for (const entity of allEntities) {
  const nearby = grid.getNearby(entity.x, entity.y);
  for (const other of nearby) {
    if (entity !== other) {
      checkCollision(entity, other);
    }
  }
}
```

**Expected Improvement**: 30-50% frame time reduction

---

### 2. **Audio Node Accumulation (FIXED)**

**Issue** (Was): Audio nodes never cleaned up
```javascript
// ✗ BAD: Nodes pile up, audio system gets slow
startAmbient(biome) {
  // Creates 4+ new oscillators each time
  for (let i = 0; i < 4; i++) {
    const osc = ac.createOscillator();
    osc.start(); // Never stops!
  }
}
```

**Solution** (NOW IMPLEMENTED):
```javascript
// ✓ GOOD: Proper cleanup and LFO scheduling optimization
stopMusic() {
  if (this.musicNodes) {
    for (const { osc } of this.musicNodes) {
      try { osc.stop(); } catch (e) {}
    }
    this.musicNodes = [];
  }
}

_scheduleLFO(param, base, rate) {
  const timeStep = Math.max(0.05, 1 / Math.max(rate * 100, 10));
  let iterations = 0;
  for (let t = 0; t < 60 && iterations < 1200; t += timeStep, iterations++) {
    // Limited iterations prevent freeze
    const v = base + Math.sin(t * rate * Math.PI * 2) * base * 0.5;
    param.setValueAtTime(Math.max(0.001, v), this.ac.currentTime + t);
  }
}
```

**Expected Improvement**: Stage 2 transition < 100ms (was freezing)

---

### 3. **Rendering Bottlenecks**

**Issue**: Drawing all entities regardless of visibility
```javascript
// ✗ BAD: Renders everything, even off-screen
for (const entity of allEntities) {
  drawEntity(entity);
}
```

**Solution**: Frustum Culling
```javascript
// ✓ GOOD: Only draw entities in viewport
_drawEnemies(ctx, entities, ox, oy, frame) {
  const viewport = {
    x1: ox,
    y1: oy,
    x2: ox + W,
    y2: oy + H,
  };

  for (const e of entities) {
    // Skip off-screen entities
    if (e.x + e.w < viewport.x1 || e.x > viewport.x2 ||
        e.y + e.h < viewport.y1 || e.y > viewport.y2) {
      continue; // Cull!
    }
    
    // Draw visible entity
    this._drawEntity(ctx, e, ox, oy);
  }
}
```

**Expected Improvement**: 10-20% frame time reduction (more with many enemies)

---

### 4. **Garbage Collection Pressure**

**Issue**: Creating new objects every frame
```javascript
// ✗ BAD: New objects every frame = GC pressure
for (const enemy of enemies) {
  const pos = { x: enemy.x, y: enemy.y }; // New object every frame!
  updateAI(enemy, pos);
}
```

**Solution**: Object Pooling & Reuse
```javascript
// ✓ GOOD: Reuse objects
const tempPos = {};

for (const enemy of enemies) {
  tempPos.x = enemy.x;
  tempPos.y = enemy.y;
  updateAI(enemy, tempPos);
}

// Or use Float32Arrays for physics vectors
const positions = new Float32Array(enemies.length * 2);
enemies.forEach((e, i) => {
  positions[i * 2] = e.x;
  positions[i * 2 + 1] = e.y;
});
```

**Expected Improvement**: 20-40% reduction in GC pauses

---

### 5. **Enemy AI Update Loop**

**Issue**: Complex AI checks run every frame
```javascript
// ✗ BAD: All enemies do pathfinding every frame
for (const enemy of enemies) {
  const path = calculatePath(enemy, player); // Expensive!
  followPath(enemy, path);
}
```

**Solution**: Throttled AI Updates
```javascript
// ✓ GOOD: Update AI less frequently
const AI_UPDATE_INTERVAL = 6; // Every 6 frames

for (const enemy of enemies) {
  if (enemy.aiTimer % AI_UPDATE_INTERVAL === 0) {
    enemy.nextPath = calculatePath(enemy, player);
  }
  followPath(enemy, enemy.nextPath || enemy.currentPath);
  enemy.aiTimer++;
}
```

**Expected Improvement**: 15-30% AI update time reduction

---

## Profiling Guide

### Method 1: Using Logger (Recommended)

```javascript
// In game loop
_update(dt) {
  this.logger.mark('update_player');
  this._updatePlayer(dt);
  this.logger.measure('update_player');

  this.logger.mark('update_enemies');
  this._updateEnemies();
  this.logger.measure('update_enemies');

  this.logger.mark('update_physics');
  this.physics.update();
  this.logger.measure('update_physics');
}

// Get bottleneck report
const bottlenecks = this.profiler.getBottlenecks();
console.table(bottlenecks);
```

### Method 2: Chrome DevTools Performance Tab

1. Open DevTools (F12)
2. Go to Performance tab
3. Click Record
4. Play game for 10-30 seconds
5. Click Stop
6. Look for:
   - 60fps line (should be flat)
   - Yellow/red bars (dropped frames)
   - Long JavaScript execution blocks
   - Garbage collection pauses

### Method 3: Memory Profiler

```javascript
// Before and after memory usage
if (performance.memory) {
  console.log('Memory:', {
    usedHeap: (performance.memory.usedJSHeapSize / 1048576).toFixed(1) + ' MB',
    limit: (performance.memory.jsHeapSizeLimit / 1048576).toFixed(1) + ' MB',
    percentage: (performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit * 100).toFixed(1) + '%',
  });
}
```

---

## Optimization Checklist

### Critical (Must Have)
- [x] Audio freeze fixed (LFO optimization)
- [ ] Spatial hashing for collisions
- [ ] Frustum culling for rendering
- [ ] Object pooling for particles/projectiles
- [ ] Audio node cleanup on stage unload

### High Priority
- [ ] Enemy AI throttling
- [ ] Dirty flag system for static content
- [ ] Image smoothing disabled (pixel perfect)
- [ ] Offscreen canvas caching
- [ ] Animation frame capping (max 60fps)

### Medium Priority
- [ ] Lazy loading for large stages
- [ ] Dynamic difficulty adjustment
- [ ] Sprite batching
- [ ] Tile compression
- [ ] WebWorker for collision detection

### Low Priority
- [ ] Shader effects
- [ ] Advanced particle physics
- [ ] AI pathfinding optimization
- [ ] Procedural level generation
- [ ] Cloud saving infrastructure

---

## Performance Targets

| Metric | Current | Target | Priority |
|--------|---------|--------|----------|
| FPS (avg) | 55-60 | 60 | Critical |
| FPS (min) | 45 | 50 | High |
| Frame jank | ~2-3% | <1% | High |
| Memory | 40-60MB | <50MB | Medium |
| Stage 1→2 transition | 50-100ms | <50ms | Critical |
| Collision time | 8-12ms | <5ms | High |
| Render time | 6-10ms | <5ms | Medium |

---

## Implementation Priority

1. **Week 1**: Spatial hashing, frustum culling, object pooling
2. **Week 2**: AI throttling, animation optimization
3. **Week 3**: Audio system refactor, memory profiling
4. **Week 4**: Polish, profiling, optimization tweaks

---

## Debugging Commands

```javascript
// In browser console
game.profiler.getFrameStats()        // Get FPS stats
game.profiler.getBottlenecks()        // Top 5 slow systems
game.logger.exportLogs()              // Export all logs
game.logger.getMetricStats('update')  // Stats for 'update' metric
game.stageManager.getMemoryUsage()   // Memory breakdown
```
