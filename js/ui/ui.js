// ═══════════════════════════════════════════════════
//  SILKBOUND PRO — UI System  (Production Upgrade)
//
//  UPGRADES:
//   • Animated health bar (smooth lerp to target HP)
//   • Stamina bar below HP
//   • Smooth notification slide-in/slide-out
//   • Quest tracker widget (top-right, active quest progress)
//   • Stage transition card (biome name slides in)
//   • Minimap: player dot pulses, rooms color-coded
//   • Combo counter display in HUD
//   • Settings: particleQuality option
//   • Premium menu polish (animated shimmer, better layout)
// ═══════════════════════════════════════════════════
import { W, H, RELICS, SKILLS, SHOP_ITEMS, QUESTS, XP_TABLE } from '../constants.js';

export class UI {
  constructor(save, sfx) {
    this.save = save;
    this.sfx  = sfx;

    this.activePanel    = null;
    this.dialogueLines  = [];
    this.dialogueName   = '';
    this.dialogueIdx    = 0;
    this.dialogueTimer  = 0;
    this.dialogueActive = false;
    this.isMerchant     = false;
    this.merchantNpcId  = null;

    // Notifications — smooth queue
    this.notifQueue   = [];
    this.notifTimer   = 0;
    this.notifCurrent = null;
    this._notifOffY   = -18; // slide-in offset (negative = above frame)
    this._notifTargY  = 0;

    this.questLogPage  = 0;
    this.shopScroll    = 0;
    this.skillSelected = null;

    // Animated HP bar
    this._displayHp    = 5;    // lerped value
    this._displayMaxHp = 5;

    // Stamina bar
    this._displaySta   = 3;

    // Stage transition card
    this._transCardTimer = 0;
    this._transCardText  = '';
    this._transCardAlpha = 0;

    // Stage cleared card
    this._stageClearedTimer = 0;
    this._stageClearedText  = '';
    this._stageClearedSub   = '';
    this._stageClearedAlpha = 0;

    // Interaction popup menu state
    this.interactIdx     = 0;
    this.interactTitle   = '';
    this.interactOptions = [];
    this.interactType    = '';
    this.interactTarget  = null;

    this._canvas = document.getElementById('c');
    this._ctx    = this._canvas.getContext('2d');
    this._font   = "'Share Tech Mono', monospace";
    this._serif  = "'IM Fell English', serif";

    // Minimap canvas
    this._mm    = document.getElementById('minimap');
    this._mmCtx = this._mm ? this._mm.getContext('2d') : null;

    // Debug info
    this._debugMode = false;
  }

  // ── Helpers ─────────────────────────────────────────
  _rect(x, y, w, h, fill='#00000088', stroke=null, r=2) {
    const ctx = this._ctx;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(x+r, y); ctx.lineTo(x+w-r, y); ctx.arcTo(x+w, y, x+w, y+r, r);
    ctx.lineTo(x+w, y+h-r); ctx.arcTo(x+w, y+h, x+w-r, y+h, r);
    ctx.lineTo(x+r, y+h); ctx.arcTo(x, y+h, x, y+h-r, r);
    ctx.lineTo(x, y+r); ctx.arcTo(x, y, x+r, y, r);
    ctx.closePath(); ctx.fill();
    if (stroke) { ctx.strokeStyle=stroke; ctx.lineWidth=1; ctx.stroke(); }
  }

  _text(txt, x, y, color='#fff', size=10, align='left', font=null) {
    const ctx = this._ctx;
    ctx.fillStyle = color;
    ctx.font      = `${size}px ${font || this._font}`;
    ctx.textAlign = align;
    ctx.fillText(txt, x, y);
    ctx.textAlign = 'left';
  }

  _btn(label, x, y, w, h, hovered=false) {
    const ctx = this._ctx;
    const bg  = hovered ? '#e8d5a022' : '#00000044';
    const bd  = hovered ? '#e8d5a0aa' : '#e8d5a033';
    this._rect(x, y, w, h, bg, bd, 2);
    this._text(label, x+w/2, y+h/2+4, hovered?'#e8d5a0':'#e8d5a077', 12, 'center', this._serif);
    return { x, y, w, h };
  }

  isHit(btn, cx2, cy2) {
    return cx2>=btn.x && cx2<=btn.x+btn.w && cy2>=btn.y && cy2<=btn.y+btn.h;
  }

  // ── Notifications ───────────────────────────────────
  pushNotif(msg, color='#e8d5a0') {
    this.notifQueue.push({ msg, color });
  }

  updateNotif() {
    if (this.notifTimer > 0) { this.notifTimer--; return; }
    if (this.notifQueue.length) {
      this.notifCurrent = this.notifQueue.shift();
      this.notifTimer   = 100;
      this._notifOffY   = -18; // reset slide-in
    } else {
      this.notifCurrent = null;
    }
  }

  drawNotif() {
    if (!this.notifCurrent || this.notifTimer <= 0) return;
    const ctx = this._ctx;
    const msg = this.notifCurrent.msg;

    // Slide in
    const targetOffY = 0;
    this._notifOffY += (targetOffY - this._notifOffY) * 0.2;

    // Fade out in last 20 frames
    const alpha = Math.min(1, this.notifTimer / 20);
    ctx.globalAlpha = alpha;
    ctx.font        = `10px ${this._font}`; ctx.textAlign = 'center';
    const tw = ctx.measureText(msg).width;
    const nx = W/2 - tw/2 - 10;
    const ny = 55 + this._notifOffY;
    this._rect(nx, ny, tw + 20, 18, '#00000099', this.notifCurrent.color+'66');
    ctx.shadowColor = this.notifCurrent.color; ctx.shadowBlur = 4;
    this._text(msg, W/2, ny + 12, this.notifCurrent.color, 10, 'center');
    ctx.shadowBlur  = 0;
    ctx.globalAlpha = 1; ctx.textAlign = 'left';
  }

  // ── Stage transition card ────────────────────────────
  showTransitionCard(areaName) {
    this._transCardText  = areaName;
    this._transCardTimer = 150;
    this._transCardAlpha = 0;
  }

  drawTransitionCard() {
    if (this._transCardTimer <= 0) return;
    this._transCardTimer--;
    const t     = this._transCardTimer;
    // Fade in for first 20 frames, hold, fade out in last 30
    if (t > 130)      this._transCardAlpha = Math.min(1, (150-t) / 20);
    else if (t < 30)  this._transCardAlpha = t / 30;
    else              this._transCardAlpha = 1;

    const ctx = this._ctx;
    ctx.globalAlpha = this._transCardAlpha * 0.95;
    const tw  = this._text.bind(this);

    // Card background
    const cw = 280, ch = 36;
    const cx = (W - cw) / 2, cy = H * 0.38;
    this._rect(cx, cy, cw, ch, '#000000cc', '#e8d5a033', 4);

    ctx.shadowColor = '#e8d5a0'; ctx.shadowBlur = 10;
    this._text(this._transCardText, W/2, cy + 22, '#e8d5a0', 14, 'center', this._serif);
    ctx.shadowBlur  = 0;
    ctx.globalAlpha = 1;
  }

  showStageClearedCard(bossName) {
    this._stageClearedText  = bossName.toUpperCase() + ' DEFEATED';
    this._stageClearedSub   = 'STAGE CLEARED';
    this._stageClearedTimer = 180;
    this._stageClearedAlpha = 0;
  }

  drawStageClearedCard() {
    if (this._stageClearedTimer <= 0) return;
    this._stageClearedTimer--;
    const t = this._stageClearedTimer;
    if (t > 150)     this._stageClearedAlpha = Math.min(1, (180 - t) / 30);
    else if (t < 30) this._stageClearedAlpha = t / 30;
    else             this._stageClearedAlpha = 1;

    const ctx = this._ctx;
    ctx.globalAlpha = this._stageClearedAlpha * 0.95;

    const cw = 300, ch = 50;
    const cx = (W - cw) / 2, cy = H * 0.35;
    
    // Draw card with nice golden glowing border
    ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 15;
    this._rect(cx, cy, cw, ch, '#000000dd', '#ffd700cc', 4);
    ctx.shadowBlur = 0;

    this._text(this._stageClearedText, W/2, cy + 22, '#ffd700', 14, 'center', this._serif);
    this._text(this._stageClearedSub, W/2, cy + 38, '#ffffff66', 8, 'center');
    ctx.globalAlpha = 1;
  }

  drawInteractMenu() {
    const ctx = this._ctx;
    const opts = this.interactOptions || [];
    const title = this.interactTitle || 'INTERACT';

    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, W, H);

    const btnH = 20;
    const cardW = 150;
    const cardH = 36 + opts.length * 25;
    const cx = (W - cardW)/2;
    const cy = (H - cardH)/2;

    // Draw main card
    ctx.shadowColor = '#e8d5a0';
    ctx.shadowBlur = 12;
    this._rect(cx, cy, cardW, cardH, 'rgba(8,6,14,0.96)', '#e8d5a066', 4);
    ctx.shadowBlur = 0;

    // Title
    this._text(title, W/2, cy + 18, '#e8d5a0', 10, 'center', this._serif);

    const hits = {};
    opts.forEach((opt, idx) => {
      const by = cy + 28 + idx * 25;
      const hovered = idx === this.interactIdx;
      
      const bg  = hovered ? '#e8d5a022' : '#00000044';
      const bd  = hovered ? '#e8d5a0bb' : '#ffffff0d';
      this._rect(cx + 10, by, cardW - 20, btnH, bg, bd, 2);
      
      const textCol = hovered ? '#e8d5a0' : '#ffffff88';
      this._text(opt.label, W/2, by + 13, textCol, 9, 'center', this._serif);
      
      hits[idx] = { x: cx + 10, y: by, w: cardW - 20, h: btnH, option: opt };
    });

    return hits;
  }

  // ── HUD ─────────────────────────────────────────────
  drawHUD(player, save, room, boss) {
    const ctx    = this._ctx;
    const S      = save.state;
    const maxHp  = S.maxHp + (save.hasRelic('iron_heart') ? 2 : 0);

    // Lerp display HP (animated bar)
    this._displayHp    += (S.hp    - this._displayHp)    * 0.12;
    this._displayMaxHp += (maxHp   - this._displayMaxHp) * 0.12;
    this._displaySta   += (player.stamina - this._displaySta) * 0.15;

    // HP pip circles
    for (let i = 0; i < maxHp; i++) {
      const hx   = 12 + i * 13, hy = 10;
      const fill = i < this._displayHp;
      const pct  = Math.max(0, Math.min(1, this._displayHp - i));
      ctx.shadowColor = fill ? '#cc3344' : 'transparent';
      ctx.shadowBlur  = fill ? 7 : 0;
      ctx.fillStyle   = fill ? '#cc3344' : '#ffffff12';
      ctx.strokeStyle = fill ? '#ff667788' : '#ffffff18';
      ctx.lineWidth   = 1;
      // Partial fill for smooth animation
      if (pct > 0 && pct < 1) {
        ctx.fillStyle = '#cc334466';
      }
      ctx.beginPath(); ctx.arc(hx+5, hy+5, 4.5, 0, Math.PI*2);
      ctx.fill(); ctx.stroke();
    }
    ctx.shadowBlur = 0;

    // Stamina pips
    const maxSta = player.maxStamina || 3;
    for (let i = 0; i < maxSta; i++) {
      const sx    = 12 + i * 11, sy = 24;
      const fill  = i < this._displaySta;
      const rdy   = player.dashCD === 0;
      ctx.fillStyle   = fill ? (rdy ? '#88aaff' : '#4466aa') : '#ffffff14';
      ctx.shadowColor = '#88aaff'; ctx.shadowBlur = fill ? 4 : 0;
      ctx.fillRect(sx, sy, 8, 3);
    }
    ctx.shadowBlur = 0;

    // Geo
    ctx.fillStyle  = '#ffd700'; ctx.shadowColor = '#ffd70055'; ctx.shadowBlur = 5;
    ctx.font       = `11px ${this._font}`; ctx.fillText('◈ '+S.geo, 12, 35);
    ctx.shadowBlur = 0;

    // Shard pips
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle   = i < S.shards ? '#e8d5a0' : '#ffffff1a';
      ctx.shadowColor = '#e8d5a0'; ctx.shadowBlur = i < S.shards ? 5 : 0;
      ctx.beginPath(); ctx.arc(13+i*10, 44, 3, 0, Math.PI*2); ctx.fill();
    }
    ctx.shadowBlur = 0;

    // XP bar
    const xpNeed = XP_TABLE[Math.min(S.level, XP_TABLE.length-1)] || 999;
    const xpPct  = Math.min(1, S.xp / xpNeed);
    ctx.fillStyle = '#ffffff0d'; ctx.fillRect(12, 51, 80, 2);
    const xg = ctx.createLinearGradient(12, 0, 92, 0);
    xg.addColorStop(0, '#6644aa'); xg.addColorStop(1, '#aa88ff');
    ctx.fillStyle = xg; ctx.fillRect(12, 51, 80*xpPct, 2);
    ctx.fillStyle = '#aa88ff55'; ctx.font = `7px ${this._font}`;
    ctx.fillText('LV '+S.level, 96, 54);

    // Combo counter
    if (player.comboWindow > 0 && player.comboStep > 0) {
      const stars = '★'.repeat(player.comboStep);
      ctx.shadowColor = '#ff6644'; ctx.shadowBlur = 6;
      ctx.fillStyle   = '#ff6644';
      ctx.font        = `9px ${this._font}`;
      ctx.fillText('COMBO ' + stars, 12, 62);
      ctx.shadowBlur  = 0;
    }

    // Area name (top-right)
    ctx.fillStyle = '#ffffff2a'; ctx.font = `8px ${this._font}`; ctx.textAlign = 'right';
    ctx.fillText((room && room.area) || '', W-10, 15);
    ctx.textAlign = 'left';

    // Active quest tracker (top-right)
    this._drawQuestTracker(save);

    // Equipped relics (bottom-right)
    S.relics.forEach((rid, i) => {
      const rel = RELICS.find(r => r.id === rid);
      if (rel) {
        ctx.font = '11px serif'; ctx.textAlign = 'right';
        ctx.fillText(rel.icon, W-8-i*16, H-8);
      }
    });
    ctx.textAlign = 'left';
  }

  // ── Quest tracker widget ─────────────────────────────
  _drawQuestTracker(save) {
    const S   = save.state;
    if (!S.quests.length) return;
    const q   = S.quests[0];
    const def = QUESTS.find(d => d.id === q.id);
    if (!def) return;
    const step = q.steps && q.steps[0];
    if (!step || step.done) return;

    const ctx = this._ctx;
    ctx.globalAlpha = 0.7;
    ctx.font        = `7px ${this._font}`;
    ctx.textAlign   = 'right';
    ctx.fillStyle   = '#e8d5a077';
    ctx.fillText('▸ ' + def.title.slice(0, 22), W-10, 28);
    ctx.fillStyle   = '#e8d5a044';
    const progressText = step.progress !== undefined
      ? `${step.desc} (${step.progress}/${def.steps[0].killTarget || def.steps[0].geoTarget || def.steps[0].shardTarget || 1})`
      : step.desc;
    ctx.fillText(progressText.slice(0, 30), W-10, 38);
    ctx.textAlign   = 'left';
    ctx.globalAlpha = 1;
  }

  // ── Minimap ──────────────────────────────────────────
  drawMinimap(currentRoomId, rooms, frame) {
    if (!this._mmCtx) return;
    const mc  = this._mmCtx;
    const mmW = 80, mmH = 50;
    mc.clearRect(0, 0, mmW, mmH);
    mc.fillStyle = '#00000088'; mc.fillRect(0, 0, mmW, mmH);

    const biomeCol = {
      depths:'#6644aa', fungal:'#44bb66', crystal:'#44aaff',
      temple:'#ffcc44', secret:'#ff44cc',
    };
    const visited = new Set([currentRoomId, 'depths_start']);
    rooms.forEach(r => {
      if (r.id === currentRoomId) visited.add(r.id);
    });

    rooms.forEach(r => {
      if (!visited.has(r.id) && r.id !== currentRoomId) return;
      const rx = 10 + r.rx * 18, ry = 28 + r.ry * 18;
      if (rx < 0 || rx > mmW || ry < 0 || ry > mmH) return;
      mc.fillStyle = r.id === currentRoomId ? (biomeCol[r.biome] || '#fff') : '#ffffff22';
      mc.fillRect(rx, ry, 13, 7);
      // Secret rooms hidden
      if (r.isSecret && r.id !== currentRoomId) return;
      // Boss room indicator
      if (r.boss && r.id !== currentRoomId) {
        mc.fillStyle = '#ff444444';
        mc.fillRect(rx, ry, 13, 7);
      }
      if (r.id === currentRoomId) {
        // Pulsing player dot
        const pulse = frame ? (Math.sin(frame * 0.12) * 0.5 + 0.5) : 1;
        mc.globalAlpha = 0.6 + pulse * 0.4;
        mc.fillStyle   = '#ffffff';
        mc.fillRect(rx+4, ry+2, 5, 3);
        mc.globalAlpha = 1;
      }
    });
  }

  // ── Dialogue ─────────────────────────────────────────
  showDialogue(name, lines, isMerchant = false, npcId = null) {
    this.dialogueName   = name;
    this.dialogueLines  = lines;
    this.dialogueIdx    = 0;
    this.dialogueActive = true;
    this.dialogueTimer  = 150;
    this.isMerchant     = isMerchant;
    this.merchantNpcId  = npcId;
  }

  dismissDialogue() {
    this.dialogueActive = false;
    this.dialogueLines  = [];
    if (this.isMerchant) { this.activePanel = 'shop'; this.isMerchant = false; }
  }

  advanceDialogue(jp) {
    if (!this.dialogueActive) return;
    this.dialogueTimer--;
    if (this.dialogueTimer < 0 && (jp.attack || jp.jump || jp.up)) {
      this.dialogueIdx++;
      if (this.dialogueIdx >= this.dialogueLines.length) {
        this.dismissDialogue();
      }
      this.dialogueTimer = 80;
    }
  }

  drawDialogue() {
    if (!this.dialogueActive) return;
    const ctx = this._ctx;
    const dw = W - 20, dh = 56, dx = 10, dy = H - dh - 8;
    this._rect(dx, dy, dw, dh, 'rgba(8,6,14,0.94)', '#ffffff18', 3);
    this._text(this.dialogueName, dx+10, dy+14, '#e8d5a0', 8);
    const line = this.dialogueLines[this.dialogueIdx] || '';
    this._text(line, dx+10, dy+30, '#ffffffcc', 11, 'left', this._serif);
    if (this.dialogueTimer < 0) {
      const blink = Math.floor(Date.now()/400) % 2 === 0;
      if (blink) this._text('▼', dx+dw-18, dy+dh-8, '#e8d5a066', 9);
    }
  }

  // ── Main Menu ─────────────────────────────────────────
  drawMainMenu(frame = 0) {
    const ctx = this._ctx;
    const bg  = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#06040e'); bg.addColorStop(1, '#0a0618');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    // Animated shimmer lines
    for (let i = 0; i < 3; i++) {
      const ly = ((frame * 0.4 + i * 140) % (H + 60)) - 20;
      const lg = ctx.createLinearGradient(0, ly, W, ly);
      lg.addColorStop(0, 'transparent'); lg.addColorStop(0.5, '#ffffff06'); lg.addColorStop(1, 'transparent');
      ctx.fillStyle = lg; ctx.fillRect(0, ly, W, 1);
    }

    // Animated particles in background
    for (let i = 0; i < 8; i++) {
      const px = ((i * 83 + frame * 0.3) % W);
      const py = ((i * 47 + frame * 0.2 + Math.sin(frame * 0.02 + i) * 20) % H);
      ctx.globalAlpha = 0.12;
      ctx.fillStyle   = '#6644aa';
      ctx.beginPath(); ctx.arc(px, py, 1.5, 0, Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Title glow
    ctx.shadowColor = '#6644aa'; ctx.shadowBlur = 60;
    ctx.fillStyle   = '#6644aa18';
    ctx.beginPath(); ctx.ellipse(W/2, 85, 160, 35, 0, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur  = 0;

    // Title
    ctx.shadowColor = '#e8d5a0'; ctx.shadowBlur = 20 + Math.sin(frame*0.04)*6;
    this._text('SILKBOUND', W/2, 82, '#e8d5a0', 52, 'center', this._serif);
    ctx.shadowBlur  = 0;
    this._text('A  H O L L O W  T A L E', W/2, 100, '#ffffff28', 8, 'center');

    // Divider
    const dg = ctx.createLinearGradient(W/2-100, 0, W/2+100, 0);
    dg.addColorStop(0, 'transparent'); dg.addColorStop(0.5, '#e8d5a033'); dg.addColorStop(1, 'transparent');
    ctx.fillStyle = dg; ctx.fillRect(W/2-100, 110, 200, 1);

    // Lore quote
    this._text('"The kingdom weeps. A nameless vessel stirs."', W/2, 128, '#ffffff33', 9, 'center', this._serif);

    // Controls guide
    const ctrls = [
      ['Move','WASD / Arrows'], ['Jump','Z / Space'], ['Dash','X / Shift'],
      ['Attack','C / J'],       ['Talk','↑ near NPC'],
    ];
    let cy = 150;
    ctrls.forEach(([act, key]) => {
      ctx.fillStyle = '#ffffff28'; ctx.font = `8px ${this._font}`; ctx.textAlign = 'left';
      ctx.fillText(act, W/2-75, cy);
      ctx.fillStyle = '#e8d5a055'; ctx.textAlign = 'right';
      ctx.fillText(key, W/2+75, cy);
      cy += 13;
    });
    ctx.textAlign = 'left';

    // Buttons
    const pb = { x:W/2-55, y:228, w:110, h:28 };
    const sb = { x:W/2-35, y:264, w:70,  h:22 };
    const pulse = Math.sin(frame * 0.06) * 0.5 + 0.5;
    ctx.shadowColor = '#e8d5a0'; ctx.shadowBlur = pulse * 8;
    this._rect(pb.x, pb.y, pb.w, pb.h, '#e8d5a012', '#e8d5a055', 3);
    this._text('Begin Journey', W/2, pb.y+18, '#e8d5a0', 13, 'center', this._serif);
    ctx.shadowBlur  = 0;
    this._rect(sb.x, sb.y, sb.w, sb.h, '#00000033', '#ffffff18', 2);
    this._text('Settings', W/2, sb.y+14, '#ffffff44', 10, 'center');
    this._text('v2.1 PRO', W-34, H-6, '#ffffff18', 7);

    return { playBtn: pb, settingsBtn: sb };
  }

  // ── Pause Menu ────────────────────────────────────────
  drawPauseMenu() {
    const ctx = this._ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.78)'; ctx.fillRect(0, 0, W, H);
    this._text('PAUSED', W/2, H/2-60, '#e8d5a0', 28, 'center', this._serif);
    const btns = [
      { label:'Resume',     id:'resume'  },
      { label:'Skill Tree', id:'skills'  },
      { label:'Quests',     id:'quests'  },
      { label:'Settings',   id:'settings'},
      { label:'Main Menu',  id:'menu'    },
    ];
    const rendered = {};
    btns.forEach((b, i) => {
      const bx = W/2-50, by = H/2-30+i*28;
      rendered[b.id] = this._btn(b.label, bx, by, 100, 22, i===0);
    });
    return rendered;
  }

  // ── Settings Menu ─────────────────────────────────────
  drawSettingsMenu(settings) {
    const ctx = this._ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.9)'; ctx.fillRect(0, 0, W, H);
    this._text('SETTINGS', W/2, 50, '#e8d5a0', 22, 'center', this._serif);
    const rows = [
      { label:'Music Volume',    key:'musicVol',        type:'slider', min:0, max:1 },
      { label:'SFX Volume',      key:'sfxVol',          type:'slider', min:0, max:1 },
      { label:'Screen Shake',    key:'screenShake',     type:'toggle' },
      { label:'Show FPS',        key:'showFPS',         type:'toggle' },
      { label:'Mobile Controls', key:'mobileControls',  type:'cycle',  options:['auto','on','off'] },
      { label:'Particle Quality',key:'particleQuality', type:'cycle',  options:['high','medium','low'] },
    ];
    const hits = {};
    rows.forEach((row, i) => {
      const ry = 80 + i * 34;
      this._text(row.label, 60, ry+12, '#e8d5a099', 10);
      if (row.type === 'toggle') {
        const on  = settings[row.key];
        hits[row.key] = this._btn(on?'ON':'OFF', W-110, ry, 50, 20);
        const col = on ? '#44cc44' : '#cc4444';
        ctx.fillStyle = col; ctx.font = `10px ${this._font}`; ctx.textAlign = 'center';
        ctx.fillText(on?'ON':'OFF', W-85, ry+13); ctx.textAlign = 'left';
      } else if (row.type === 'slider') {
        const val = settings[row.key] ?? 0.5;
        const sw  = 120, sx2 = W-140;
        ctx.fillStyle = '#ffffff22'; ctx.fillRect(sx2, ry+8, sw, 4);
        ctx.fillStyle = '#e8d5a0';   ctx.fillRect(sx2, ry+8, sw*val, 4);
        ctx.beginPath(); ctx.arc(sx2+sw*val, ry+10, 5, 0, Math.PI*2); ctx.fill();
        hits[row.key] = { x:sx2, y:ry+4, w:sw, h:12, isSlider:true, min:row.min, max:row.max };
      } else if (row.type === 'cycle') {
        const val = settings[row.key] || row.options[0];
        hits[row.key] = this._btn(val.toUpperCase(), W-110, ry, 80, 20);
      }
    });
    this._btn('Back', W/2-25, H-44, 50, 22);
    hits._back = { x:W/2-25, y:H-44, w:50, h:22 };
    return hits;
  }

  // ── Shop ──────────────────────────────────────────────
  drawShop() {
    const ctx = this._ctx;
    const S   = this.save.state;
    ctx.fillStyle = 'rgba(0,0,0,0.9)'; ctx.fillRect(0, 0, W, H);
    ctx.shadowColor = '#ffcc77'; ctx.shadowBlur = 14;
    this._text('MERCHANT', W/2, 30, '#ffcc77', 20, 'center', this._serif);
    ctx.shadowBlur  = 0;
    this._text('◈ ' + S.geo, W/2, 46, '#ffd700', 11, 'center');

    const hits = {};
    SHOP_ITEMS.forEach((item, i) => {
      const col = i % 2, row2 = Math.floor(i / 2);
      const ix = 30 + col * 290, iy = 62 + row2 * 68;
      const canAfford   = S.geo >= item.cost;
      const alreadyOwned = item.type === 'relic' && S.ownedRelics.includes(item.relicId);
      const bg = alreadyOwned ? '#44aa4415' : canAfford ? '#e8d5a010' : '#00000033';
      const bd = alreadyOwned ? '#44aa44aa' : canAfford ? '#e8d5a044' : '#ffffff11';
      this._rect(ix, iy, 260, 58, bg, bd, 3);
      this._text(item.name, ix+10, iy+16, canAfford?'#e8d5a0':'#e8d5a044', 11, 'left', this._serif);
      this._text(item.desc, ix+10, iy+30, '#ffffff66', 9);
      this._text(alreadyOwned ? 'OWNED' : '◈ '+item.cost, ix+10, iy+46, alreadyOwned?'#44aa44':'#ffd700', 9);
      if (!alreadyOwned) hits[item.id] = { x:ix, y:iy, w:260, h:58, item };
    });
    this._btn('Close', W/2-25, H-34, 50, 22);
    hits._close = { x:W/2-25, y:H-34, w:50, h:22 };
    return hits;
  }

  // ── Skill Tree ────────────────────────────────────────
  drawSkillTree() {
    const ctx = this._ctx;
    const S   = this.save.state;
    ctx.fillStyle = 'rgba(0,0,0,0.93)'; ctx.fillRect(0, 0, W, H);
    this._text('SKILL TREE', W/2, 28, '#aa88ff', 18, 'center', this._serif);
    this._text('Points: '+S.skillPoints, W/2, 44, '#aa88ff88', 10, 'center');

    const hits = {};
    const cols  = { dmg1:0,dmg2:0,dmg3:0, hp1:1,hp2:1, dash1:2,dash2:2, crit1:0,crit2:0, atkspd1:2, combo:2, charged:0, airtkl:2 };
    const rows2 = { dmg1:0,dmg2:1,dmg3:2, hp1:0,hp2:1, dash1:0,dash2:1, crit1:3,crit2:4, atkspd1:2, combo:3, charged:3, airtkl:4 };
    const cw = 160, ch = 44, padX = 30, padY = 58;

    SKILLS.forEach(skill => {
      const c  = cols[skill.id]  ?? 0;
      const r  = rows2[skill.id] ?? 0;
      const sx = padX + c * (cw + 12);
      const sy = padY + r * (ch + 8);
      const unlocked  = S.unlockedSkills.includes(skill.id);
      const available = (!skill.requires || S.unlockedSkills.includes(skill.requires))
                     && S.skillPoints >= skill.cost && !unlocked;
      const bg = unlocked ? '#aa88ff22' : available ? '#44448822' : '#00000033';
      const bd = unlocked ? '#aa88ffcc' : available ? '#4444aa77' : '#ffffff11';
      this._rect(sx, sy, cw, ch, bg, bd, 3);
      this._text(skill.name, sx+8, sy+14, unlocked?'#aa88ff':'#ffffff99', 9, 'left', this._serif);
      this._text(skill.desc, sx+8, sy+26, '#ffffff55', 8);
      this._text(unlocked ? '✓' : S.skillPoints >= skill.cost ? `${skill.cost}pt` : `Need ${skill.cost}pt`,
        sx+8, sy+38, unlocked?'#aa88ff':'#e8d5a066', 8);
      if (available) hits[skill.id] = { x:sx, y:sy, w:cw, h:ch, skill };
    });
    this._btn('Back', W-70, H-32, 55, 22);
    hits._back = { x:W-70, y:H-32, w:55, h:22 };
    return hits;
  }

  // ── Quest Log ─────────────────────────────────────────
  drawQuestLog() {
    const ctx = this._ctx;
    const S   = this.save.state;
    ctx.fillStyle = 'rgba(0,0,0,0.93)'; ctx.fillRect(0, 0, W, H);
    this._text('JOURNAL', W/2, 28, '#e8d5a0', 18, 'center', this._serif);

    const active    = S.quests.map(q => {
      const def = QUESTS.find(d => d.id === q.id);
      return def ? { ...def, ...q } : null;
    }).filter(Boolean);
    const completed = S.completedQuests.map(id => QUESTS.find(d => d.id === id)).filter(Boolean);

    let qy = 50;
    this._text('ACTIVE', 20, qy, '#e8d5a088', 9); qy += 14;
    if (!active.length) { this._text('No active quests.', 20, qy, '#ffffff33', 9); qy += 14; }
    active.forEach(q => {
      this._rect(15, qy, W-30, 44, '#e8d5a008', '#e8d5a022', 2);
      this._text(q.title, 22, qy+13, '#e8d5a0', 11, 'left', this._serif);
      this._text(q.desc,  22, qy+26, '#ffffff66', 8);
      const step = q.steps && q.steps[0];
      if (step) {
        const txt = step.done ? '✓ COMPLETE' : step.desc +
          (step.progress !== undefined ? ` (${step.progress})` : '');
        this._text(txt, 22, qy+38, step.done?'#44cc44':'#e8d5a055', 8);
      }
      if (q.reward) {
        const rw = `Reward: ◈${q.reward.geo||0} XP:${q.reward.xp||0}${q.reward.relic?' + Relic':''}`;
        this._text(rw, W-18, qy+13, '#ffd70077', 8, 'right');
      }
      qy += 50;
    });

    qy += 6;
    this._text('COMPLETED', 20, qy, '#44cc4488', 9); qy += 14;
    completed.slice(-3).forEach(q => {
      this._text('✓ '+q.title, 22, qy, '#44cc4466', 9, 'left', this._serif);
      qy += 14;
    });

    this._btn('Back', W-70, H-32, 55, 22);
    return { _back:{ x:W-70, y:H-32, w:55, h:22 } };
  }

  // ── Game Over ─────────────────────────────────────────
  drawGameOver(score) {
    const ctx = this._ctx;
    ctx.fillStyle = 'rgba(20,0,0,0.92)'; ctx.fillRect(0, 0, W, H);
    ctx.shadowColor = '#cc3344'; ctx.shadowBlur = 30;
    this._text('YOU HAVE FALLEN', W/2, H/2-50, '#cc3344', 26, 'center', this._serif);
    ctx.shadowBlur  = 0;
    this._text('SHADE LOST', W/2, H/2-28, '#ffffff33', 9, 'center');
    this._text('Geo lost: '+(score.geo||0), W/2, H/2, '#ffd70077', 10, 'center');
    const rb = this._btn('Rise Again', W/2-50, H/2+20, 100, 26, true);
    const mb = this._btn('Main Menu',  W/2-40, H/2+54, 80, 22);
    return { retry:rb, menu:mb };
  }

  // ── Victory ───────────────────────────────────────────
  drawVictory(save) {
    const ctx = this._ctx;
    const S   = save.state;
    ctx.fillStyle = 'rgba(0,0,0,0.96)'; ctx.fillRect(0, 0, W, H);
    ctx.shadowColor = '#e8d5a0'; ctx.shadowBlur = 24;
    this._text('THE KINGDOM MENDS', W/2, 70, '#e8d5a0', 26, 'center', this._serif);
    ctx.shadowBlur  = 0;
    this._text('A HOLLOW TALE — COMPLETE', W/2, 92, '#ffffff33', 9, 'center');
    [
      `Geo collected: ${S.geo}`,
      `Shards found:  ${S.shards}`,
      `Enemies slain: ${S.killCount}`,
      `Player level:  ${S.level}`,
    ].forEach((line, i) => this._text(line, W/2, 130+i*18, '#e8d5a088', 11, 'center'));
    const nb = this._btn('New Journey', W/2-55, H-70, 110, 26, true);
    return { newGame: nb };
  }

  // ── FPS ───────────────────────────────────────────────
  drawFPS(fps) {
    this._text('FPS: '+fps, W-42, H-6, fps < 40 ? '#ff4444' : '#ffffff33', 8);
  }

  // ── Debug overlay ─────────────────────────────────────
  drawDebug(state, entityCount, room, fps) {
    const ctx  = this._ctx;
    const lines = [
      `STATE: ${state}`,
      `ROOM: ${room ? room.id : 'none'}`,
      `ENTITIES: ${entityCount}`,
      `FPS: ${fps}`,
    ];
    this._rect(4, H-56, 130, 52, '#000000bb', '#ffffff22', 2);
    lines.forEach((l, i) => {
      this._text(l, 8, H-50+i*12, '#88ff88', 7);
    });
  }
}
