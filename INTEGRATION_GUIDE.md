# INTEGRATION GUIDE - Professional Architecture Migration

## Overview

This guide explains how to integrate the new professional architecture into the existing game.js while maintaining backward compatibility.

## Quick Start

### Import Core Systems

```javascript
import { EventBus, GameEvents } from './core/EventBus.js';
import { StageManager } from './core/StageManager.js';
import { AssetManager } from './core/AssetManager.js';
import { Logger, PerformanceProfiler, DebugDisplay } from './core/Logger.js';
```

### Initialize in Game Constructor

```javascript
class Game {
  constructor() {
    // Initialize logger first (for debugging initialization)
    this.logger = new Logger({ enabled: true });
    this.profiler = new PerformanceProfiler(this.logger);
    this.debugDisplay = new DebugDisplay(document.getElementById('c'), this.logger, this.profiler);

    // Existing systems (keep for now)
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

    // New professional systems
    this.assets = new AssetManager({
      basePath: '/assets/',
      audioContext: this.audio.ac,
    });

    this.stageManager = new StageManager({
      physics: this.physics,
      audio: this.audio,
      renderer: this.renderer,
      particles: this.parts,
      camera: this.camera,
      input: this.input,
    });

    // Event system ready
    this._bindGameEvents();
    this.logger.info('game', 'Game initialized');
  }

  _bindGameEvents() {
    EventBus.on(GameEvents.STAGE_LOADED, (data) => {
      this.logger.info('stage', `Loaded: ${data.stageId}`);
    });

    EventBus.on(GameEvents.ENEMY_KILLED, (data) => {
      this.logger.debug('combat', `Enemy killed: ${data.enemyId}`);
    });

    EventBus.on(GameEvents.GAME_OVER, (data) => {
      this.logger.info('game', `Game over: ${data.reason}`);
    });
  }
}
```

## Event-Driven Communication

### Old Way (Tightly Coupled)
```javascript
// In game.js
function killEnemy(enemy) {
  enemy.alive = false;
  this.player.xp += enemy.xp;
  this.ui.pushNotif('Enemy killed!');
  // ... more direct calls
}
```

### New Way (Event-Driven)
```javascript
function killEnemy(enemy) {
  enemy.alive = false;
  
  // Emit event, let listeners handle consequences
  EventBus.emit(GameEvents.ENEMY_KILLED, {
    enemyId: enemy.id,
    xp: enemy.xp,
    loot: enemy.loot,
    position: { x: enemy.x, y: enemy.y },
  });
}

// Player system listens
EventBus.on(GameEvents.ENEMY_KILLED, (data) => {
  player.xp += data.xp;
});

// UI system listens
EventBus.on(GameEvents.ENEMY_KILLED, (data) => {
  ui.pushNotif(`${data.xp} XP!`);
});

// Particles system listens
EventBus.on(GameEvents.ENEMY_KILLED, (data) => {
  particles.spawnBurst(data.position.x, data.position.y);
});
```

## Stage Transitions (NEW - Fixes Freeze)

### Old Way (Game Freeze Happens Here)
```javascript
// In game.js - mixed concerns
loadRoom(roomId, spawnOverride) {
  const room = ROOM_MAP[roomId];
  this.physics.loadRoom(room.tiles);  // ✗ Physics might be dirty
  
  this.roomEntities = [];  // ✗ Not cleaned up properly
  (room.enemies || []).forEach(e => {
    this.roomEntities.push(makeEnemy(e.type, e.tx * TILE, e.ty * TILE));
  });
  
  this.audio.startAmbient(room.biome);  // ✗ Audio nodes pile up, freeze!
}
```

### New Way (Professional)
```javascript
// In game.js - using StageManager
async _handleStageTransition(stageId) {
  try {
    this.logger.mark('stage_load');
    
    const success = await this.stageManager.loadStage(stageId);
    
    if (success) {
      const duration = this.logger.measure('stage_load');
      this.logger.info('stage', `Stage loaded in ${duration.toFixed(1)}ms`);
      this.state = 'playing';
    }
  } catch (error) {
    this.logger.error('stage', 'Stage load failed', error);
    this.state = 'gameover';
  }
}
```

## Performance Monitoring

### Automatic Frame Profiling

```javascript
_loop(timestamp) {
  const dt = Math.min((timestamp - this._lastTime) / 16.67, 3);
  this._lastTime = timestamp;

  // Mark start
  this.logger.mark('frame');

  // Update
  this.logger.mark('update');
  this._update(dt);
  this.profiler.recordSystem('update', this.logger.measure('update'));

  // Draw
  this.logger.mark('draw');
  this._draw();
  this.profiler.recordSystem('draw', this.logger.measure('draw'));

  // Record frame metrics
  this.profiler.recordFrame(dt, this.fps);
  this.logger.measure('frame'); // Total frame time

  // Debug display
  this.debugDisplay.draw();

  this._raf = requestAnimationFrame(t => this._loop(t));
}
```

### Access Performance Data

```javascript
// Get FPS stats
const frameStats = this.profiler.getFrameStats();
console.log(`Average FPS: ${frameStats.avgFps}`);

// Get bottlenecks
const bottlenecks = this.profiler.getBottlenecks();
bottlenecks.forEach(([system, stats]) => {
  console.log(`${system}: ${stats.avg}ms average`);
});

// Export logs for analysis
const logsJson = this.logger.exportLogs();
localStorage.setItem('game_logs', logsJson);
```

## Debug Display (Press 'D' to Toggle)

```javascript
// In _bindPointer or input handler
if (this.input.K['d'] && !this._dHeld) {
  this._dHeld = true;
  if (this.debugDisplay.toggle()) {
    this.logger.info('debug', 'Debug display enabled');
  }
}
if (!this.input.K['d']) this._dHeld = false;

// Cycle pages with arrow keys
if (this.input.K['ArrowRight']) {
  this.debugDisplay.nextPage();
}
```

## Memory Management Best Practices

### 1. Cleanup Tracking

```javascript
_update(dt) {
  // ... game logic ...

  // Register cleanup on stage transition
  if (entity.needsCleanup) {
    this.stageManager.registerCleanupTask(() => {
      entity.destroy();
      return Promise.resolve();
    });
  }
}
```

### 2. Object Pooling Pattern

```javascript
class ProjectilePool {
  constructor(size = 100) {
    this.pool = [];
    this.active = new Set();
    
    // Pre-allocate
    for (let i = 0; i < size; i++) {
      this.pool.push(this._createProjectile());
    }
  }

  get() {
    const proj = this.pool.length > 0 
      ? this.pool.pop() 
      : this._createProjectile();
    this.active.add(proj);
    return proj;
  }

  release(proj) {
    this.active.delete(proj);
    this.pool.push(proj);
  }

  _createProjectile() {
    return {
      x: 0, y: 0, vx: 0, vy: 0,
      alive: true, w: 4, h: 4,
      type: 'proj',
    };
  }

  clear() {
    this.active.clear();
    this.pool = [];
  }
}
```

### 3. Proper Cleanup

```javascript
async _unloadCurrentStage() {
  // 1. Stop all sounds
  this.audio.stopMusic();
  this.audio.stopAllSfx();

  // 2. Clear particles
  this.parts.clear();

  // 3. Clear entities (properly)
  for (const entity of this.roomEntities) {
    if (entity.onDestroy) await entity.onDestroy();
  }
  this.roomEntities = [];

  // 4. Reset physics
  this.physics.reset();

  // 5. Clear references
  this.currentRoom = null;
}
```

## Testing Event Flow

```javascript
// Create a test listener
EventBus.on(GameEvents.ENEMY_KILLED, (data) => {
  console.log('Enemy killed event:', data);
  console.assert(data.enemyId, 'Missing enemyId');
  console.assert(data.xp > 0, 'Invalid XP');
});

// Test emit
EventBus.emit(GameEvents.ENEMY_KILLED, {
  enemyId: 'test_enemy_1',
  xp: 50,
});
```

## Migration Checklist

- [ ] EventBus fully integrated
- [ ] All major state changes emit events
- [ ] StageManager used for all transitions
- [ ] No audio nodes leak
- [ ] Stage 1→2 transition < 100ms
- [ ] Logger captures all errors
- [ ] Debug display working (press D)
- [ ] Memory stable over long sessions
- [ ] Performance profiler shows bottlenecks
- [ ] All old logging removed
- [ ] Code reviewed for tight coupling
- [ ] Tests pass in all stages

## Next Steps

1. **Phase 2**: Refactor entities into ECS components
2. **Phase 3**: Implement spatial hashing for collision optimization
3. **Phase 4**: Add advanced particle effects
4. **Phase 5**: Mobile support with touch events
