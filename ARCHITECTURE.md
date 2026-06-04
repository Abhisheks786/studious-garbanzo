# SILKBOUND PRO - Architecture & Upgrade Plan

## Current State Analysis

### CRITICAL ISSUES IDENTIFIED:
1. **Stage 2 Freeze Root Cause**: Audio LFO scheduling creates excessive `setValueAtTime` calls
   - **Status**: FIXED ✅ (audio.js line 107)
   
2. **Monolithic Design**: All logic in game.js (700+ lines)
   - No proper stage isolation
   - State management mixed with rendering
   - Tight coupling between systems

3. **Missing Systems**:
   - No Scene/Stage Manager
   - No Event Bus
   - No Asset Manager
   - No proper DI/IoC container

### PERFORMANCE ISSUES:
- Collision checks O(n²) in update loop
- No object pooling for particles/projectiles
- Audio nodes accumulate (not cleaned up properly)
- No culling for off-screen entities

---

## Professional Architecture (Post-Upgrade)

```
js/
├── core/
│   ├── GameEngine.js          # Main orchestrator
│   ├── EventBus.js            # Global event system
│   ├── SceneManager.js        # Scene/stage lifecycle
│   └── AssetManager.js        # Resource loading/caching
│
├── entities/
│   ├── Entity.js              # Base class
│   ├── Player.js              # Player logic
│   ├── Enemy.js               # Enemy factory + AI
│   ├── Boss.js                # Boss logic
│   └── Projectile.js          # Projectile pooling
│
├── systems/
│   ├── physics/
│   │   ├── Physics.js         # Collision detection
│   │   └── CollisionGrid.js   # Spatial hashing
│   ├── audio/
│   │   ├── AudioSystem.js     # Web Audio API
│   │   └── AudioManager.js    # Music/SFX management
│   ├── input/
│   │   ├── InputSystem.js     # Device input
│   │   └── InputMap.js        # Key binding
│   ├── particles/
│   │   ├── ParticleSystem.js  # Particle pooling
│   │   └── ParticleEmitter.js # Emitter patterns
│   ├── rendering/
│   │   ├── Renderer.js        # Main renderer
│   │   └── CameraSystem.js    # Camera + viewport
│   └── ui/
│       ├── UIManager.js       # UI state/layout
│       ├── HUD.js             # In-game HUD
│       └── Menu.js            # Menu screens
│
├── world/
│   ├── Stage.js               # Stage/room container
│   ├── StageManager.js        # Stage lifecycle
│   ├── Room.js                # Room definition + loader
│   └── WorldData.js           # All stage definitions
│
├── data/
│   ├── constants.js           # Global constants
│   ├── configs.js             # Game configs
│   └── assets.js              # Asset manifest
│
└── utils/
    ├── Vector2.js             # 2D math
    ├── ObjectPool.js          # Pooling utility
    ├── Logger.js              # Debug logging
    └── Helpers.js             # Common functions
```

---

## Key Architectural Improvements

### 1. Scene/Stage Manager
- Proper lifecycle: init → load → unload
- Asset preloading
- Automatic cleanup
- Event-driven transitions

### 2. Event Bus Pattern
```javascript
// Usage:
EventBus.emit('enemy:killed', { enemyId, xp });
EventBus.on('player:levelup', (data) => { ... });
EventBus.off('player:levelup', handler);
```

### 3. Entity Component System (ECS-lite)
- Base Entity class
- Reusable components
- Proper lifecycle (create/update/destroy)

### 4. Object Pooling
- Pre-allocate particles/projectiles
- Reuse objects instead of creating new ones
- Reduces GC pressure

### 5. Collision System Optimization
- Spatial hashing grid
- Broad-phase (grid cells) + narrow-phase (AABB)
- Only check nearby entities

### 6. Audio System Refactor
- Fixed LFO scheduling (DONE)
- Proper audio node cleanup
- Music/SFX separation
- Smooth transitions

### 7. Rendering Optimization
- Frustum culling (skip off-screen entities)
- Dirty flag system for static content
- Offscreen canvas caching
- Sprite batching foundation

---

## Implementation Phases

### PHASE 1: Critical Fixes (IMMEDIATE)
- ✅ Fix Stage 2 freeze (audio LFO)
- ✅ Add 6+ new enemy types
- ✅ Upgrade graphics
- [ ] Create Event Bus
- [ ] Create Stage Manager
- [ ] Fix memory leaks

### PHASE 2: Architecture Refactor
- [ ] Refactor game.js into modular systems
- [ ] Implement DI/IoC for systems
- [ ] Create Scene lifecycle system
- [ ] Add asset preloading

### PHASE 3: Performance Optimization
- [ ] Implement spatial hashing
- [ ] Add object pooling
- [ ] Frustum culling
- [ ] Memory profiling

### PHASE 4: Enhanced Features
- [ ] Advanced particle effects
- [ ] Boss phases
- [ ] Complex enemy AI
- [ ] Achievement system
- [ ] Cloud save preparation

---

## Migration Path

Existing code → New architecture:
1. Create core systems alongside existing code
2. Gradually move functionality
3. Maintain compatibility
4. Test each phase thoroughly
5. Remove old code once validated

---

## Success Criteria

✅ Stage 1→2 transition: < 100ms, no freeze
✅ 60fps maintained consistently
✅ Memory stable (no leaks)
✅ Code modular and testable
✅ Professional AAA-quality indie game feel
✅ Ready for scaling (multiplayer, mobile, etc.)
