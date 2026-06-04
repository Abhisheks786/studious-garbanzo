// ═══════════════════════════════════════════════════════════════
//  EVENT BUS SYSTEM — Decoupled message passing
// ═══════════════════════════════════════════════════════════════
// Pattern: Pub/Sub for all game events
// Benefits: Loose coupling, testable, scalable

class EventBus {
  constructor() {
    this._listeners = new Map();
    this._once = new Map();
  }

  /**
   * Subscribe to an event
   * @param {string} event - Event name (e.g., 'enemy:killed', 'stage:loaded')
   * @param {Function} handler - Callback function
   * @returns {Function} Unsubscribe function
   */
  on(event, handler) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, []);
    }
    this._listeners.get(event).push(handler);
    
    // Return unsubscribe function
    return () => this.off(event, handler);
  }

  /**
   * Subscribe once, then auto-unsubscribe
   */
  once(event, handler) {
    const wrappedHandler = (...args) => {
      handler(...args);
      this.off(event, wrappedHandler);
    };
    this.on(event, wrappedHandler);
    return () => this.off(event, wrappedHandler);
  }

  /**
   * Unsubscribe from an event
   */
  off(event, handler) {
    if (!this._listeners.has(event)) return;
    const handlers = this._listeners.get(event);
    const idx = handlers.indexOf(handler);
    if (idx !== -1) handlers.splice(idx, 1);
  }

  /**
   * Emit an event to all listeners
   */
  emit(event, data = null) {
    if (!this._listeners.has(event)) return;
    const handlers = [...this._listeners.get(event)]; // copy to avoid mutation issues
    for (const handler of handlers) {
      try {
        handler(data);
      } catch (e) {
        console.error(`EventBus error on '${event}':`, e);
      }
    }
  }

  /**
   * Emit async (allows handlers to be async)
   */
  async emitAsync(event, data = null) {
    if (!this._listeners.has(event)) return;
    const handlers = [...this._listeners.get(event)];
    for (const handler of handlers) {
      try {
        await Promise.resolve(handler(data));
      } catch (e) {
        console.error(`EventBus error on '${event}':`, e);
      }
    }
  }

  /**
   * Clear all listeners for an event
   */
  clear(event = null) {
    if (event) {
      this._listeners.delete(event);
    } else {
      this._listeners.clear();
    }
  }

  /**
   * Get listener count for debugging
   */
  listenerCount(event) {
    return this._listeners.has(event) ? this._listeners.get(event).length : 0;
  }
}

// Global singleton
export const EventBus = new EventBus();

// ═══════════════════════════════════════════════════════════════
// EVENT TYPES — Catalog of all game events
// ═══════════════════════════════════════════════════════════════

export const GameEvents = {
  // Stage/Scene lifecycle
  STAGE_LOADING: 'stage:loading',      // { stageId }
  STAGE_LOADED: 'stage:loaded',        // { stageId }
  STAGE_UNLOADING: 'stage:unloading',  // { stageId }
  STAGE_UNLOADED: 'stage:unloaded',    // { stageId }

  // Room transitions
  ROOM_ENTER: 'room:enter',            // { roomId, fromDir }
  ROOM_EXIT: 'room:exit',              // { roomId, toDir, targetRoom }
  ROOM_LOADED: 'room:loaded',          // { room }

  // Player events
  PLAYER_SPAWN: 'player:spawn',        // { x, y }
  PLAYER_DAMAGE: 'player:damage',      // { amount, source }
  PLAYER_HEAL: 'player:heal',          // { amount }
  PLAYER_LEVELUP: 'player:levelup',    // { level, xp }
  PLAYER_DEATH: 'player:death',        // { reason }
  PLAYER_SAVE: 'player:save',          // { data }

  // Enemy events
  ENEMY_SPAWN: 'enemy:spawn',          // { enemyId, type, x, y }
  ENEMY_DAMAGE: 'enemy:damage',        // { enemyId, amount }
  ENEMY_KILLED: 'enemy:killed',        // { enemyId, xp, loot }
  ENEMY_ALERT: 'enemy:alert',          // { enemyId }

  // Combat events
  ATTACK_HIT: 'attack:hit',            // { attacker, target, damage }
  ATTACK_MISS: 'attack:miss',          // { attacker, target }
  ABILITY_USED: 'ability:used',        // { abilityId, player }
  SKILL_UNLOCKED: 'skill:unlocked',    // { skillId, skillName }

  // Quest events
  QUEST_STARTED: 'quest:started',      // { questId }
  QUEST_UPDATED: 'quest:updated',      // { questId, progress }
  QUEST_COMPLETED: 'quest:completed',  // { questId, reward }

  // UI events
  MENU_OPEN: 'menu:open',              // { menuId }
  MENU_CLOSE: 'menu:close',            // { menuId }
  DIALOG_START: 'dialog:start',        // { npcId, lines }
  DIALOG_END: 'dialog:end',            // { npcId }

  // Audio events
  MUSIC_CHANGE: 'audio:music:change',  // { biome }
  SFX_PLAY: 'audio:sfx:play',          // { soundId }

  // Game state
  GAME_PAUSED: 'game:paused',          // {}
  GAME_RESUMED: 'game:resumed',        // {}
  GAME_OVER: 'game:over',              // { reason }
  GAME_WON: 'game:won',                // {}

  // Debug events
  DEBUG_TOGGLE: 'debug:toggle',        // {}
  DEBUG_LOG: 'debug:log',              // { message, level }
};
