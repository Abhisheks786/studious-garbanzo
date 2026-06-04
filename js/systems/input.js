// ═══════════════════════════════════════════════════
//  SILKBOUND PRO — Input System
// ═══════════════════════════════════════════════════
export class InputSystem {
  constructor() {
    this.K  = {};   // held keys
    this.T  = { left:false, right:false, jump:false, dash:false, attack:false, up:false, down:false };
    this.JP = {};   // just-pressed snapshot (rebuilt each frame)
    this._prev = {};
    this._joystick = { active:false, startX:0, startY:0, dx:0, dy:0 };
    this._gamepad = { left:false, right:false, jump:false, dash:false, attack:false, up:false };
    this._bindKeyboard();
    this._pollGamepad();
  }

  _bindKeyboard() {
    document.addEventListener('keydown', e => {
      this.K[e.code] = true;
      if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
    });
    document.addEventListener('keyup',   e => { this.K[e.code] = false; });
  }

  _pollGamepad() {
    setInterval(() => {
      const gamepads = navigator.getGamepads();
      for (let i = 0; i < gamepads.length; i++) {
        const gp = gamepads[i];
        if (!gp) continue;
        const deadzone = 0.3;
        this._gamepad.left  = gp.axes[0] < -deadzone;
        this._gamepad.right = gp.axes[0] > deadzone;
        this._gamepad.up    = gp.axes[1] < -deadzone;
        this._gamepad.jump  = gp.buttons[0]?.pressed || false; // A button
        this._gamepad.dash  = gp.buttons[1]?.pressed || false; // B button
        this._gamepad.attack = gp.buttons[2]?.pressed || false; // X button
      }
    }, 16);
  }

  bindMobile() {
    const map = {
      'mb-l': 'left', 'mb-r': 'right',
      'mb-j': 'jump', 'mb-d': 'dash',
      'mb-a': 'attack', 'mb-u': 'up',
    };
    Object.entries(map).forEach(([id, key]) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('touchstart', e => {
        e.preventDefault(); e.stopPropagation();
        this.T[key] = true; el.classList.add('lit');
      }, { passive: false });
      el.addEventListener('touchend',   e => {
        e.preventDefault();
        this.T[key] = false; el.classList.remove('lit');
      }, { passive: false });
      el.addEventListener('touchcancel', () => { this.T[key] = false; el.classList.remove('lit'); });
    });

    // Dynamic joystick on left half of screen
    const canvas = document.getElementById('c');
    const canvasRect = () => canvas.getBoundingClientRect();
    canvas.addEventListener('touchstart', e => {
      for (const t of e.changedTouches) {
        const r = canvasRect();
        const rx = (t.clientX - r.left) / r.width;
        if (rx < 0.45) {
          this._joystick = { active:true, id:t.identifier, startX:t.clientX, startY:t.clientY, dx:0, dy:0 };
        } else {
          // Right side tap = attack
          this.T.attack = true;
          setTimeout(() => { this.T.attack = false; }, 80);
        }
      }
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchmove', e => {
      for (const t of e.changedTouches) {
        if (t.identifier === this._joystick.id) {
          this._joystick.dx = t.clientX - this._joystick.startX;
          this._joystick.dy = t.clientY - this._joystick.startY;
          const dead = 10;
          this.T.left  = this._joystick.dx < -dead;
          this.T.right = this._joystick.dx >  dead;
          this.T.up    = this._joystick.dy < -dead;
          this.T.down  = this._joystick.dy >  dead;
        }
      }
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchend', e => {
      for (const t of e.changedTouches) {
        if (t.identifier === this._joystick.id) {
          this._joystick.active = false;
          this.T.left = this.T.right = this.T.up = this.T.down = false;
        }
      }
    }, { passive: false });
  }

  get(action) {
    switch (action) {
      case 'left':   return !!(this.K['ArrowLeft']  || this.K['KeyA'] || this.T.left || this._gamepad.left);
      case 'right':  return !!(this.K['ArrowRight'] || this.K['KeyD'] || this.T.right || this._gamepad.right);
      case 'down':   return !!(this.K['ArrowDown']  || this.K['KeyS'] || this.T.down);
      case 'up':     return !!(this.K['ArrowUp']    || this.K['KeyW'] || this.T.up || this._gamepad.up);
      case 'jump':   return !!(this.K['Space'] || this.K['KeyZ'] || this.K['ArrowUp'] || this.T.jump || this._gamepad.jump);
      case 'dash':   return !!(this.K['ShiftLeft'] || this.K['ShiftRight'] || this.K['KeyX'] || this.T.dash || this._gamepad.dash);
      case 'attack': return !!(this.K['KeyC'] || this.K['KeyJ'] || this.T.attack || this._gamepad.attack);
      default:       return false;
    }
  }

  // Build just-pressed snapshot — call ONCE per frame at the top of gameLoop
  buildSnapshot() {
    const actions = ['left','right','up','down','jump','dash','attack'];
    for (const a of actions) {
      const cur = this.get(a);
      this.JP[a] = cur && !this._prev[a];
      this._prev[a] = cur;
    }
  }

  jp(action) { return !!this.JP[action]; }

  getJoystick() { return this._joystick; }
}
