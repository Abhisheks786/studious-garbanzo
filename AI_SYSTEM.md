# ADVANCED ENEMY AI SYSTEM GUIDE

## Architecture: Finite State Machine (FSM) + Behavior Trees

Current system uses simple state machines. Here's how to upgrade to professional AAA-level AI.

## Enemy AI States

```
┌─────────────┐
│   PATROL    │ ← Default state
└──────┬──────┘
       │ (detect player)
       ↓
┌─────────────┐
│   ALERT     │ ← Slight aggression
└──────┬──────┘
       │ (confirm target)
       ↓
┌─────────────┐
│   CHASE     │ ← Pursue player
└──────┬──────┘
       │ (in range)
       ↓
┌─────────────┐
│   ATTACK    │ ← Melee/ranged combat
└──────┬──────┘
       │ (target lost or defeated)
       ↓
┌─────────────┐
│   PATROL    │ ← Return to patrol
└─────────────┘
```

## Implementation

### 1. Base AI State Machine

```javascript
class EnemyAI {
  constructor(enemy) {
    this.enemy = enemy;
    this.state = 'patrol';
    this.stateTimer = 0;
    this.targetPlayer = null;
    
    // FSM state handlers
    this.states = {
      patrol: new PatrolState(this),
      alert: new AlertState(this),
      chase: new ChaseState(this),
      attack: new AttackState(this),
      flee: new FleeState(this),
      die: new DieState(this),
    };
  }

  update(dt, player, world) {
    const currentState = this.states[this.state];
    if (currentState) {
      const nextState = currentState.update(dt, player, world);
      if (nextState && nextState !== this.state) {
        this._transitionTo(nextState, player);
      }
    }
  }

  _transitionTo(newState, player) {
    const oldState = this.states[this.state];
    if (oldState?.onExit) oldState.onExit();
    
    this.state = newState;
    this.stateTimer = 0;
    
    const newStateHandler = this.states[newState];
    if (newStateHandler?.onEnter) newStateHandler.onEnter(player);
  }

  getDebugInfo() {
    return {
      state: this.state,
      stateTimer: this.stateTimer,
      target: this.targetPlayer,
    };
  }
}
```

### 2. Patrol State

```javascript
class PatrolState {
  constructor(ai) {
    this.ai = ai;
  }

  onEnter(player) {
    this.ai.enemy.speed = this.ai.enemy.baseSpeed * 0.5;
  }

  update(dt, player, world) {
    const enemy = this.ai.enemy;
    
    // Check if player in aggro range
    const dist = this._distanceTo(player);
    if (dist < enemy.aggroRange) {
      this.ai.targetPlayer = player;
      return 'alert';
    }

    // Patrol movement
    if (Math.abs(enemy.x - this.patrolTarget?.x || 0) < 10) {
      this.patrolTarget = this._getNewPatrolPoint(enemy);
    }

    this._moveToward(enemy, this.patrolTarget);
    return null; // Stay in patrol
  }

  _getNewPatrolPoint(enemy) {
    const minX = enemy.patrolMin ?? enemy.x - 100;
    const maxX = enemy.patrolMax ?? enemy.x + 100;
    return {
      x: minX + Math.random() * (maxX - minX),
      y: enemy.y,
    };
  }

  _moveToward(enemy, target) {
    if (!target) return;
    const dx = target.x - enemy.x;
    enemy.vx = Math.sign(dx) * enemy.speed;
    enemy.facing = Math.sign(dx) || enemy.facing;
  }

  _distanceTo(player) {
    const dx = player.x - this.ai.enemy.x;
    const dy = player.y - this.ai.enemy.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
}
```

### 3. Chase State

```javascript
class ChaseState {
  constructor(ai) {
    this.ai = ai;
    this.loseTargetTimer = 0;
  }

  onEnter(player) {
    this.ai.enemy.speed = this.ai.enemy.baseSpeed;
    console.log(`[${this.ai.enemy.type}] Chasing player`);
    EventBus.emit(GameEvents.ENEMY_ALERT, { enemyId: this.ai.enemy.id });
  }

  update(dt, player, world) {
    const enemy = this.ai.enemy;
    const dist = this._distanceTo(player);

    // Transition: Too close → attack
    if (dist < enemy.attackRange) {
      return 'attack';
    }

    // Transition: Lost player → patrol
    if (dist > enemy.aggroRange * 1.5) {
      this.loseTargetTimer += dt;
      if (this.loseTargetTimer > 3000) { // 3 seconds
        return 'patrol';
      }
    } else {
      this.loseTargetTimer = 0;
    }

    // Chase movement
    const dx = player.x - enemy.x;
    enemy.vx = Math.sign(dx) * enemy.speed * 1.2;
    enemy.facing = Math.sign(dx) || enemy.facing;

    return null; // Stay in chase
  }

  _distanceTo(player) {
    const dx = player.x - this.ai.enemy.x;
    const dy = player.y - this.ai.enemy.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
}
```

### 4. Attack State (Melee)

```javascript
class AttackState {
  constructor(ai) {
    this.ai = ai;
    this.attackCooldown = 0;
  }

  onEnter(player) {
    this.attackCooldown = this.ai.enemy.attackCooldown || 60;
    console.log(`[${this.ai.enemy.type}] Attacking`);
  }

  update(dt, player, world) {
    const enemy = this.ai.enemy;
    const dist = this._distanceTo(player);

    // Transition: Player fled → chase
    if (dist > enemy.attackRange * 2) {
      return 'chase';
    }

    // Attack logic
    this.attackCooldown -= dt;
    if (this.attackCooldown <= 0) {
      this._performAttack(enemy, player);
      this.attackCooldown = enemy.attackCooldown || 60;
    }

    // Face player
    const dx = player.x - enemy.x;
    enemy.facing = Math.sign(dx) || enemy.facing;

    // Stay in attack range
    if (dist > enemy.attackRange * 0.8) {
      enemy.vx = Math.sign(dx) * enemy.speed * 0.5;
    } else {
      enemy.vx = 0;
    }

    return null; // Stay in attack
  }

  _performAttack(enemy, player) {
    const attackRange = 20;
    const dx = player.x - enemy.x;
    
    if (Math.abs(dx) < attackRange) {
      // Hit!
      EventBus.emit(GameEvents.ATTACK_HIT, {
        attacker: enemy.id,
        target: player.id,
        damage: enemy.damage || 1,
      });
      
      // Knockback
      player.knockbackVx = Math.sign(dx) * 8;
      
      // Particle effect
      EventBus.emit(GameEvents.SFX_PLAY, { soundId: 'hit_melee' });
    }
  }

  _distanceTo(player) {
    const dx = player.x - this.ai.enemy.x;
    const dy = player.y - this.ai.enemy.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
}
```

### 5. Ranged Attack State

```javascript
class RangedAttackState {
  constructor(ai) {
    this.ai = ai;
    this.shootCooldown = 0;
    this.minDistance = 120; // Preferred attack distance
    this.maxDistance = 180;
  }

  update(dt, player, world) {
    const enemy = this.ai.enemy;
    const dist = this._distanceTo(player);

    // Transition: Too close → melee
    if (dist < this.minDistance * 0.8) {
      return 'attack';
    }

    // Transition: Too far or lost target → chase
    if (dist > this.maxDistance * 1.5) {
      return 'chase';
    }

    // Maintain distance
    const dx = player.x - enemy.x;
    if (dist < this.minDistance) {
      enemy.vx = Math.sign(dx) * -enemy.speed; // Back away
    } else if (dist > this.maxDistance) {
      enemy.vx = Math.sign(dx) * enemy.speed; // Move closer
    } else {
      enemy.vx = 0; // Maintain distance
    }

    // Shoot
    this.shootCooldown -= dt;
    if (this.shootCooldown <= 0) {
      this._shoot(enemy, player, world);
      this.shootCooldown = 60; // Fire every 60 frames
    }

    return null;
  }

  _shoot(enemy, player, world) {
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist === 0) return;

    // Create projectile
    const projectile = {
      type: 'proj',
      x: enemy.x + enemy.w / 2,
      y: enemy.y + enemy.h / 2,
      vx: (dx / dist) * 6,
      vy: (dy / dist) * 6,
      damage: enemy.damage || 1,
      lifeTime: 300,
    };

    world.projectiles.push(projectile);
    EventBus.emit(GameEvents.SFX_PLAY, { soundId: 'shoot' });
  }

  _distanceTo(player) {
    const dx = player.x - this.ai.enemy.x;
    const dy = player.y - this.ai.enemy.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
}
```

## Enemy Type Examples with AI

### Crawler (Fast Melee)
```javascript
{
  type: 'crawler',
  hp: 2, speed: 1.4, damage: 1,
  aggroRange: 110, attackRange: 15,
  AI: [PatrolState, AlertState, ChaseState, AttackState],
  behavior: 'aggressive_melee',
}
```

### Ranged (Keeps Distance)
```javascript
{
  type: 'ranged',
  hp: 3, speed: 0.7, damage: 2,
  aggroRange: 180, attackRange: 150,
  AI: [PatrolState, AlertState, ChaseState, RangedAttackState],
  behavior: 'tactical_ranged',
}
```

### Tank (Slow but Tough)
```javascript
{
  type: 'tank',
  hp: 8, speed: 0.5, damage: 3,
  aggroRange: 100, attackRange: 20,
  AI: [PatrolState, AlertState, ChaseState, AttackState],
  behavior: 'aggressive_melee',
  charge: true,
}
```

### Boss (Multi-phase)
```javascript
class BossAI extends EnemyAI {
  update(dt, player, world) {
    const enemy = this.enemy;
    
    // Phase transitions based on HP
    const phase = Math.ceil(enemy.hp / (enemy.maxHp / 3));
    
    if (phase !== this.currentPhase) {
      this._enterPhase(phase);
    }

    super.update(dt, player, world);
  }

  _enterPhase(phase) {
    console.log(`Boss entering phase ${phase}`);
    
    switch (phase) {
      case 1: // 100%-66% HP
        this.states.attack.attackSpeed = 1.0;
        break;
      case 2: // 66%-33% HP
        this.states.attack.attackSpeed = 1.5;
        this._summonMinions();
        break;
      case 3: // 33%-0% HP
        this.states.attack.attackSpeed = 2.0;
        this._castSpecialAbility();
        break;
    }
  }
}
```

## Integration into Current System

```javascript
// In enemies.js updateEnemyAI()
export function updateEnemyAI(e, pl, roomEntities, moveActor, rectSolid, color, parts, frame) {
  if (!e.alive || !e.aiController) return;

  // NEW: Use AI system if initialized
  if (e.aiController instanceof EnemyAI) {
    e.aiController.update(16.67, pl, { entities: roomEntities, particles: parts });
  } else {
    // Fall back to old system
    // ... old code ...
  }
}

// Initialization
function makeEnemy(type, wx, wy) {
  const base = { /* ... */ };
  applyTypeStats(base, type);
  
  // NEW: Initialize AI controller
  base.aiController = new EnemyAI(base);
  
  return base;
}
```

## Testing AI Behavior

```javascript
// Create test enemy
const testEnemy = makeEnemy('crawler', 100, 100);
const testPlayer = { x: 150, y: 100, id: 'player' };
const world = { entities: [], projectiles: [] };

// Simulate AI behavior
for (let i = 0; i < 300; i++) {
  testEnemy.aiController.update(16.67, testPlayer, world);
  
  // Log state transitions
  if (i % 60 === 0) {
    console.log(`Frame ${i}: State = ${testEnemy.aiController.state}`);
  }
}
```

---

## Next: Boss AI with Phases

See BOSS_SYSTEM.md for implementing multi-phase boss battles with attack patterns.
