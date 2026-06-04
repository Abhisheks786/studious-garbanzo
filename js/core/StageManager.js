// ═══════════════════════════════════════════════════════════════
//  STAGE MANAGER — Professional stage/scene lifecycle management
// ═══════════════════════════════════════════════════════════════
// Fixes: Stage 2 freeze, memory leaks, proper cleanup
// Pattern: State machine with event-driven lifecycle

import { EventBus, GameEvents } from './EventBus.js';

export class StageManager {
  constructor(systems) {
    this.systems = systems; // { physics, audio, renderer, particles, etc }
    this.currentStage = null;
    this.currentRoom = null;
    this.nextStage = null;
    this.isTransitioning = false;
    
    // Stage state machine
    this.state = 'unloaded'; // 'unloaded' | 'loading' | 'loaded' | 'playing' | 'unloading'
    
    // Cleanup tracking
    this._cleanupTasks = [];
    this._activeEntities = new Set();
    this._activeEmitters = new Set();
    
    // Performance tracking
    this._loadStartTime = 0;
    this._loadDuration = 0;

    this._bindEvents();
  }

  _bindEvents() {
    EventBus.on(GameEvents.ROOM_EXIT, (data) => this._handleRoomExit(data));
    EventBus.on(GameEvents.ENEMY_KILLED, (data) => this._trackEntityCleanup(data.enemyId));
  }

  /**
   * Load a stage asynchronously
   * Ensures proper cleanup of previous stage before loading new one
   */
  async loadStage(stageId, options = {}) {
    if (this.isTransitioning) {
      console.warn('Stage load already in progress');
      return;
    }

    this.isTransitioning = true;
    this._loadStartTime = performance.now();
    
    try {
      // PHASE 1: Emit pre-load event
      EventBus.emit(GameEvents.STAGE_LOADING, { stageId });

      // PHASE 2: Unload current stage safely
      if (this.currentStage) {
        await this._unloadCurrentStage();
      }

      // PHASE 3: Preload stage assets
      const stageData = await this._preloadStageAssets(stageId);
      if (!stageData) throw new Error(`Stage not found: ${stageId}`);

      // PHASE 4: Initialize new stage
      this.currentStage = {
        id: stageId,
        data: stageData,
        entities: [],
        npcs: [],
        bosses: [],
        projectiles: [],
      };

      // PHASE 5: Reset core systems
      this._resetSystems();

      // PHASE 6: Spawn initial room
      await this._initializeRoom(stageData.initialRoom, options.spawnOverride);

      // PHASE 7: Preload next assets in background
      if (stageData.nextStageId) {
        this._prefetchNextStage(stageData.nextStageId);
      }

      this._loadDuration = performance.now() - this._loadStartTime;
      console.log(`✓ Stage '${stageId}' loaded in ${this._loadDuration.toFixed(1)}ms`);

      // PHASE 8: Emit loaded event
      EventBus.emit(GameEvents.STAGE_LOADED, { stageId, duration: this._loadDuration });

      this.state = 'loaded';
      return true;

    } catch (error) {
      console.error('STAGE LOAD ERROR:', error);
      EventBus.emit(GameEvents.DEBUG_LOG, { 
        message: `Stage load failed: ${error.message}`, 
        level: 'error' 
      });
      this.state = 'error';
      return false;

    } finally {
      this.isTransitioning = false;
    }
  }

  /**
   * CRITICAL: Unload current stage and clean up all resources
   */
  async _unloadCurrentStage() {
    if (!this.currentStage) return;

    console.log(`→ Unloading stage: ${this.currentStage.id}`);
    EventBus.emit(GameEvents.STAGE_UNLOADING, { stageId: this.currentStage.id });

    // 1. Stop audio (prevents audio nodes accumulating)
    if (this.systems.audio) {
      this.systems.audio.stopMusic();
      this.systems.audio.stopAllSfx();
    }

    // 2. Clear all particles
    if (this.systems.particles) {
      this.systems.particles.clear();
    }

    // 3. Cleanup all entities
    await this._cleanupEntities();

    // 4. Reset physics engine
    if (this.systems.physics) {
      this.systems.physics.reset();
    }

    // 5. Clear collision grid
    if (this.systems.physics?.collisionGrid) {
      this.systems.physics.collisionGrid.clear();
    }

    // 6. Execute queued cleanup tasks
    for (const task of this._cleanupTasks) {
      try {
        await task();
      } catch (e) {
        console.error('Cleanup task error:', e);
      }
    }
    this._cleanupTasks = [];

    // 7. Clear active tracking
    this._activeEntities.clear();
    this._activeEmitters.clear();

    // 8. Force garbage collection hint (if available)
    if (performance.memory) {
      console.log(`Memory before cleanup: ${(performance.memory.usedJSHeapSize / 1048576).toFixed(1)}MB`);
    }

    EventBus.emit(GameEvents.STAGE_UNLOADED, { stageId: this.currentStage.id });
    this.currentStage = null;
  }

  /**
   * Preload and validate stage assets
   */
  async _preloadStageAssets(stageId) {
    // TODO: Integrate with AssetManager
    // For now, stages are in-memory (ROOM_MAP)
    // In production: load from server, parse JSON, validate schema
    
    return {
      id: stageId,
      initialRoom: 'fungal_entry',
      nextStageId: null,
      assets: {
        audio: ['biome_ambient.ogg'],
        sprites: [], // Would be loaded in production
      },
    };
  }

  /**
   * Reset all systems to clean slate
   */
  _resetSystems() {
    // Physics
    if (this.systems.physics) {
      this.systems.physics.reset();
      this.systems.physics.currentTiles = [];
    }

    // Renderer
    if (this.systems.renderer) {
      this.systems.renderer.markTilesDirty();
    }

    // Camera
    if (this.systems.camera) {
      this.systems.camera.x = 0;
      this.systems.camera.y = 0;
    }

    // Input
    if (this.systems.input) {
      this.systems.input.clearState();
    }
  }

  /**
   * Initialize room and spawn entities
   */
  async _initializeRoom(roomId, spawnOverride = null) {
    console.log(`→ Initializing room: ${roomId}`);

    // In current codebase, this is done in game.loadRoom()
    // In refactored version: Room class encapsulates this logic
    
    // For now, return true (actual logic in game.js)
    return true;
  }

  /**
   * Cleanup all entities properly
   */
  async _cleanupEntities() {
    if (!this.currentStage) return;

    const { entities, bosses, projectiles } = this.currentStage;

    // Cleanup entities
    for (const entity of entities) {
      if (entity.onDestroy) await entity.onDestroy();
    }
    entities.length = 0;

    // Cleanup bosses
    for (const boss of bosses) {
      if (boss.onDestroy) await boss.onDestroy();
    }
    bosses.length = 0;

    // Cleanup projectiles (already pooled, just clear references)
    projectiles.length = 0;

    this._activeEntities.clear();
  }

  /**
   * Track entity for cleanup
   */
  _trackEntityCleanup(entityId) {
    this._activeEntities.delete(entityId);
  }

  /**
   * Handle room transition within stage
   */
  _handleRoomExit(data) {
    // Cleanup current room entities
    if (this.currentRoom) {
      console.log(`→ Exiting room: ${this.currentRoom}`);
      this.currentRoom = data.targetRoom;
    }
  }

  /**
   * Prefetch next stage in background
   */
  _prefetchNextStage(nextStageId) {
    // TODO: Implement background loading
    // Use RequestIdleCallback or setTimeout(..., 0)
    console.log(`⬇ Prefetching stage: ${nextStageId}`);
  }

  /**
   * Register a cleanup task
   */
  registerCleanupTask(task) {
    if (typeof task === 'function') {
      this._cleanupTasks.push(task);
    }
  }

  /**
   * Get stage loading time (for profiling)
   */
  getLoadDuration() {
    return this._loadDuration;
  }

  /**
   * Get memory usage estimate
   */
  getMemoryUsage() {
    if (!performance.memory) return null;
    return {
      used: performance.memory.usedJSHeapSize,
      limit: performance.memory.jsHeapSizeLimit,
      percentage: (performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit * 100).toFixed(1),
    };
  }

  /**
   * Debug: Get stage state
   */
  getDebugInfo() {
    return {
      currentStage: this.currentStage?.id || null,
      currentRoom: this.currentRoom,
      state: this.state,
      isTransitioning: this.isTransitioning,
      loadDuration: this._loadDuration,
      activeEntities: this._activeEntities.size,
      memory: this.getMemoryUsage(),
    };
  }
}
