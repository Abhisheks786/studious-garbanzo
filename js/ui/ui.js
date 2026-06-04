// ═══════════════════════════════════════════════════
//  SILKBOUND PRO — UI System
// ═══════════════════════════════════════════════════
import { W, H, RELICS, SKILLS, SHOP_ITEMS, QUESTS, XP_TABLE } from '../constants.js';

export class UI {
  constructor(save, sfx) {
    this.save = save;
    this.sfx  = sfx;
    // Panel state
    this.activePanel = null; // 'menu'|'pause'|'shop'|'skills'|'quests'|'settings'|'gameover'|'victory'
    this.dialogueLines = [];
    this.dialogueName  = '';
    this.dialogueIdx   = 0;
    this.dialogueTimer = 0;
    this.dialogueActive = false;
    this.isMerchant    = false;
    this.merchantNpcId = null;

    this.notifQueue = [];
    this.notifTimer = 0;
    this.notifCurrent = null;

    this.questLogPage = 0;
    this.shopScroll   = 0;
    this.skillSelected = null;

    this._canvas = document.getElementById('c');
    this._ctx    = this._canvas.getContext('2d');
    this._font   = "'Share Tech Mono', monospace";
    this._serif  = "'IM Fell English', serif";

    // Minimap canvas
    this._mm = document.getElementById('minimap');
    this._mmCtx = this._mm ? this._mm.getContext('2d') : null;
  }

  // ── Helpers ──────────────────────────────────────
  _rect(x,y,w,h,fill='#00000088',stroke=null,r=2) {
    const ctx = this._ctx;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.arcTo(x+w,y,x+w,y+r,r);
    ctx.lineTo(x+w,y+h-r); ctx.arcTo(x+w,y+h,x+w-r,y+h,r);
    ctx.lineTo(x+r,y+h); ctx.arcTo(x,y+h,x,y+h-r,r);
    ctx.lineTo(x,y+r); ctx.arcTo(x,y,x+r,y,r);
    ctx.closePath(); ctx.fill();
    if (stroke) { ctx.strokeStyle=stroke; ctx.lineWidth=1; ctx.stroke(); }
  }
  _text(txt, x, y, color='#fff', size=10, align='left', font=null) {
    const ctx = this._ctx;
    ctx.fillStyle = color; ctx.font = `${size}px ${font||this._font}`; ctx.textAlign = align;
    ctx.fillText(txt, x, y); ctx.textAlign = 'left';
  }
  _btn(label, x, y, w, h, hovered=false) {
    const ctx = this._ctx;
    const bg = hovered ? '#e8d5a022' : '#00000044';
    const bd = hovered ? '#e8d5a0aa' : '#e8d5a033';
    this._rect(x,y,w,h, bg, bd, 2);
    this._text(label, x+w/2, y+h/2+4, hovered?'#e8d5a0':'#e8d5a077', 12, 'center', this._serif);
    return { x, y, w, h };
  }

  // Mouse/touch click check
  isHit(btn, cx2, cy2) {
    return cx2>=btn.x && cx2<=btn.x+btn.w && cy2>=btn.y && cy2<=btn.y+btn.h;
  }

  // ── Notifications ─────────────────────────────────
  pushNotif(msg, color='#e8d5a0') {
    this.notifQueue.push({ msg, color });
  }
  updateNotif() {
    if (this.notifTimer > 0) { this.notifTimer--; return; }
    if (this.notifQueue.length) {
      this.notifCurrent = this.notifQueue.shift();
      this.notifTimer   = 100;
    } else {
      this.notifCurrent = null;
    }
  }
  drawNotif() {
    if (!this.notifCurrent || this.notifTimer <= 0) return;
    const alpha = Math.min(1, this.notifTimer / 20) * Math.min(1, (this.notifTimer) / 20);
    const ctx   = this._ctx;
    const msg   = this.notifCurrent.msg;
    ctx.globalAlpha = alpha;
    ctx.font = `10px ${this._font}`; ctx.textAlign = 'center';
    const tw = ctx.measureText(msg).width;
    this._rect(W/2 - tw/2 - 10, 55, tw + 20, 18, '#00000099', this.notifCurrent.color+'66');
    this._text(msg, W/2, 67, this.notifCurrent.color, 10, 'center');
    ctx.globalAlpha = 1; ctx.textAlign = 'left';
  }

  // ── HUD ───────────────────────────────────────────
  drawHUD(player, save, room, boss) {
    const ctx = this._ctx;
    const S   = save.state;
    const maxHp = S.maxHp + (save.hasRelic('iron_heart') ? 2 : 0);

    // HP pips
    for (let i = 0; i < maxHp; i++) {
      const hx = 12 + i * 13, hy = 10;
      const full = i < S.hp;
      ctx.shadowColor = full ? '#cc3344' : 'transparent';
      ctx.shadowBlur  = full ? 7 : 0;
      ctx.fillStyle   = full ? '#cc3344' : '#ffffff12';
      ctx.strokeStyle = full ? '#ff667788' : '#ffffff18';
      ctx.lineWidth   = 1;
      ctx.beginPath(); ctx.arc(hx+5, hy+5, 4.5, 0, Math.PI*2);
      ctx.fill(); ctx.stroke();
    }
    ctx.shadowBlur = 0;

    // Geo
    ctx.fillStyle='#ffd700'; ctx.shadowColor='#ffd70055'; ctx.shadowBlur=5;
    ctx.font=`11px ${this._font}`; ctx.fillText('◈ '+S.geo, 12, 30);
    ctx.shadowBlur=0;

    // Shard pips
    for (let i=0;i<3;i++) {
      ctx.fillStyle = i<S.shards ? '#e8d5a0' : '#ffffff1a';
      ctx.shadowColor='#e8d5a0'; ctx.shadowBlur = i<S.shards ? 5 : 0;
      ctx.beginPath(); ctx.arc(13+i*10, 40, 3, 0, Math.PI*2); ctx.fill();
    }
    ctx.shadowBlur=0;

    // XP bar
    const xpNeed = XP_TABLE[Math.min(S.level, XP_TABLE.length-1)] || 999;
    const xpPct  = Math.min(1, S.xp / xpNeed);
    ctx.fillStyle='#ffffff0d'; ctx.fillRect(12,47,80,2);
    const xg=ctx.createLinearGradient(12,0,92,0);
    xg.addColorStop(0,'#6644aa'); xg.addColorStop(1,'#aa88ff');
    ctx.fillStyle=xg; ctx.fillRect(12,47,80*xpPct,2);
    ctx.fillStyle='#aa88ff55'; ctx.font=`7px ${this._font}`;
    ctx.fillText('LV '+S.level, 96, 50);

    // Dash pips
    const dashMax = save.hasRelic('void_step') ? 2 : 1;
    for (let i=0;i<dashMax;i++) {
      const rdy = player.dashCD===0;
      ctx.fillStyle=rdy?'#88aaff':'#ffffff18';
      ctx.shadowColor='#88aaff'; ctx.shadowBlur=rdy?4:0;
      ctx.fillRect(12+i*11,52,8,2);
    }
    ctx.shadowBlur=0;

    // Area name
    ctx.fillStyle='#ffffff2a'; ctx.font=`8px ${this._font}`; ctx.textAlign='right';
    ctx.fillText((room&&room.area)||'', W-10, 15);
    ctx.textAlign='left';

    // Relics
    S.relics.forEach((rid,i)=>{
      const rel=RELICS.find(r=>r.id===rid);
      if(rel){ ctx.font='11px serif'; ctx.textAlign='right'; ctx.fillText(rel.icon,W-8-i*16,H-8); }
    });
    ctx.textAlign='left';
  }

  // ── Minimap ───────────────────────────────────────
  drawMinimap(currentRoomId, rooms) {
    if (!this._mmCtx) return;
    const mc  = this._mmCtx;
    const mmW = 80, mmH = 50;
    mc.clearRect(0, 0, mmW, mmH);
    mc.fillStyle = '#00000088'; mc.fillRect(0, 0, mmW, mmH);

    const biomeCol = { depths:'#6644aa', fungal:'#44bb66', crystal:'#44aaff', temple:'#ffcc44', secret:'#ff44cc' };
    const visited  = new Set([currentRoomId]);
    // Mark adjacent rooms of visited as seen
    rooms.forEach(r => {
      if (r.id === currentRoomId || r.id === 'depths_start') visited.add(r.id);
    });

    rooms.forEach(r => {
      if (!visited.has(r.id) && r.id !== currentRoomId) return;
      const rx = 10 + r.rx * 18, ry = 28 + r.ry * 18;
      if (rx < 0 || rx > mmW || ry < 0 || ry > mmH) return;
      mc.fillStyle = r.id === currentRoomId ? (biomeCol[r.biome] || '#fff') : '#ffffff22';
      mc.fillRect(rx, ry, 13, 7);
      if (r.id === currentRoomId) {
        mc.fillStyle = '#ffffff';
        mc.fillRect(rx+4, ry+2, 5, 3);
      }
      if (r.isSecret && r.id !== currentRoomId) return; // hide secrets
    });
  }

  // ── Dialogue ─────────────────────────────────────
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
      const blink = Math.floor(Date.now()/400)%2===0;
      if (blink) this._text('▼', dx+dw-18, dy+dh-8, '#e8d5a066', 9);
    }
  }

  // ── MAIN MENU ─────────────────────────────────────
  drawMainMenu(frame = 0) {
    const ctx = this._ctx;
    // Layered dark background
    const bg = ctx.createLinearGradient(0,0,0,H);
    bg.addColorStop(0,'#06040e'); bg.addColorStop(1,'#0a0618');
    ctx.fillStyle = bg; ctx.fillRect(0,0,W,H);

    // Subtle animated shimmer lines
    for (let i=0;i<3;i++) {
      const ly = ((frame*0.4 + i*140) % (H+60)) - 20;
      const lg = ctx.createLinearGradient(0,ly,W,ly);
      lg.addColorStop(0,'transparent'); lg.addColorStop(0.5,'#ffffff06'); lg.addColorStop(1,'transparent');
      ctx.fillStyle=lg; ctx.fillRect(0,ly,W,1);
    }

    // Title glow halo
    ctx.shadowColor='#6644aa'; ctx.shadowBlur=60;
    ctx.fillStyle='#6644aa18';
    ctx.beginPath(); ctx.ellipse(W/2,85,160,35,0,0,Math.PI*2); ctx.fill();
    ctx.shadowBlur=0;

    // Title
    ctx.shadowColor='#e8d5a0'; ctx.shadowBlur=20+Math.sin(frame*0.04)*6;
    this._text('SILKBOUND', W/2, 82, '#e8d5a0', 52, 'center', this._serif);
    ctx.shadowBlur=0;
    this._text('A  H O L L O W  T A L E', W/2, 100, '#ffffff28', 8, 'center');

    // Divider
    const dg = ctx.createLinearGradient(W/2-100,0,W/2+100,0);
    dg.addColorStop(0,'transparent'); dg.addColorStop(0.5,'#e8d5a033'); dg.addColorStop(1,'transparent');
    ctx.fillStyle=dg; ctx.fillRect(W/2-100,110,200,1);

    // Lore quote
    this._text('"The kingdom weeps. A nameless vessel stirs."', W/2, 128, '#ffffff33', 9, 'center', this._serif);

    // Controls
    const ctrls = [['Move','WASD / Arrows'],['Jump','Z / Space'],['Dash','X / Shift'],['Attack','C / J'],['Talk','↑ near NPC']];
    let cy=150;
    ctrls.forEach(([act,key])=>{
      ctx.fillStyle='#ffffff28'; ctx.font=`8px ${this._font}`; ctx.textAlign='left';  ctx.fillText(act,W/2-75,cy);
      ctx.fillStyle='#e8d5a055'; ctx.textAlign='right'; ctx.fillText(key,W/2+75,cy);
      cy+=13;
    });
    ctx.textAlign='left';

    // Buttons
    const pb = { x:W/2-55, y:228, w:110, h:28 };
    const sb = { x:W/2-35, y:264, w:70,  h:22 };
    this._rect(pb.x,pb.y,pb.w,pb.h,'#e8d5a012','#e8d5a055',3);
    this._text('Begin Journey', W/2, pb.y+18, '#e8d5a0', 13, 'center', this._serif);
    this._rect(sb.x,sb.y,sb.w,sb.h,'#00000033','#ffffff18',2);
    this._text('Settings', W/2, sb.y+14, '#ffffff44', 10, 'center');

    this._text('v2.0', W-26, H-6, '#ffffff18', 7);
    return { playBtn: pb, settingsBtn: sb };
  }

  // ── PAUSE MENU ────────────────────────────────────
  drawPauseMenu() {
    const ctx = this._ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.78)'; ctx.fillRect(0,0,W,H);
    this._text('PAUSED', W/2, H/2-60, '#e8d5a0', 28, 'center', this._serif);

    const btns = [
      { label:'Resume',    id:'resume'  },
      { label:'Skill Tree',id:'skills'  },
      { label:'Quests',    id:'quests'  },
      { label:'Settings',  id:'settings'},
      { label:'Main Menu', id:'menu'    },
    ];
    const rendered = {};
    btns.forEach((b, i) => {
      const bx = W/2-50, by = H/2-30+i*28;
      rendered[b.id] = this._btn(b.label, bx, by, 100, 22, i===0);
    });
    return rendered;
  }

  // ── SETTINGS MENU ─────────────────────────────────
  drawSettingsMenu(settings) {
    const ctx = this._ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.9)'; ctx.fillRect(0,0,W,H);
    this._text('SETTINGS', W/2, 50, '#e8d5a0', 22, 'center', this._serif);
    const rows = [
      { label:'Music Volume',    key:'musicVol',      type:'slider', min:0, max:1 },
      { label:'SFX Volume',      key:'sfxVol',        type:'slider', min:0, max:1 },
      { label:'Screen Shake',    key:'screenShake',   type:'toggle' },
      { label:'Show FPS',        key:'showFPS',       type:'toggle' },
      { label:'Mobile Controls', key:'mobileControls',type:'cycle', options:['auto','on','off'] },
    ];
    const hits = {};
    rows.forEach((row, i) => {
      const ry = 80 + i * 36;
      this._text(row.label, 60, ry+12, '#e8d5a099', 10);
      if (row.type === 'toggle') {
        const on = settings[row.key];
        const col = on ? '#44cc44' : '#cc4444';
        hits[row.key] = this._btn(on?'ON':'OFF', W-110, ry, 50, 20, false);
        ctx.fillStyle = col; ctx.font=`10px ${this._font}`; ctx.textAlign='center';
        ctx.fillText(on?'ON':'OFF', W-85, ry+13);
        ctx.textAlign='left';
      } else if (row.type === 'slider') {
        const val = settings[row.key] ?? 0.5;
        const sw = 120, sx2 = W-140;
        ctx.fillStyle = '#ffffff22'; ctx.fillRect(sx2, ry+8, sw, 4);
        ctx.fillStyle = '#e8d5a0';   ctx.fillRect(sx2, ry+8, sw*val, 4);
        ctx.fillStyle = '#e8d5a0';   ctx.beginPath(); ctx.arc(sx2+sw*val, ry+10, 5, 0, Math.PI*2); ctx.fill();
        hits[row.key] = { x:sx2, y:ry+4, w:sw, h:12, isSlider:true, min:row.min, max:row.max };
      } else if (row.type === 'cycle') {
        const val = settings[row.key];
        hits[row.key] = this._btn(val.toUpperCase(), W-110, ry, 60, 20);
      }
    });
    this._btn('Back', W/2-25, H-44, 50, 22, false);
    hits._back = { x:W/2-25, y:H-44, w:50, h:22 };
    return hits;
  }

  // ── SHOP ──────────────────────────────────────────
  drawShop() {
    const ctx = this._ctx;
    const S   = this.save.state;
    ctx.fillStyle = 'rgba(0,0,0,0.9)'; ctx.fillRect(0,0,W,H);
    this._text('MERCHANT', W/2, 30, '#ffcc77', 20, 'center', this._serif);
    this._text('◈ ' + S.geo, W/2, 46, '#ffd700', 11, 'center');

    const hits = {};
    SHOP_ITEMS.forEach((item, i) => {
      const col = i % 2, row2 = Math.floor(i / 2);
      const ix = 30 + col * 290, iy = 62 + row2 * 68;
      const canAfford = S.geo >= item.cost;
      const alreadyOwned = item.type === 'relic' && S.ownedRelics.includes(item.relicId);
      const bg = alreadyOwned ? '#44aa4415' : canAfford ? '#e8d5a010' : '#00000033';
      const bd = alreadyOwned ? '#44aa44aa' : canAfford ? '#e8d5a044' : '#ffffff11';
      this._rect(ix, iy, 260, 58, bg, bd, 3);
      this._text(item.name, ix+10, iy+16, canAfford?'#e8d5a0':'#e8d5a044', 11, 'left', this._serif);
      this._text(item.desc, ix+10, iy+30, '#ffffff66', 9);
      this._text(alreadyOwned ? 'OWNED' : '◈ '+item.cost, ix+10, iy+46,
        alreadyOwned?'#44aa44':'#ffd700', 9);
      if (!alreadyOwned) {
        hits[item.id] = { x:ix, y:iy, w:260, h:58, item };
      }
    });
    this._btn('Close', W/2-25, H-34, 50, 22);
    hits._close = { x:W/2-25, y:H-34, w:50, h:22 };
    return hits;
  }

  // ── SKILL TREE ────────────────────────────────────
  drawSkillTree() {
    const ctx   = this._ctx;
    const S     = this.save.state;
    ctx.fillStyle = 'rgba(0,0,0,0.93)'; ctx.fillRect(0,0,W,H);
    this._text('SKILL TREE', W/2, 28, '#aa88ff', 18, 'center', this._serif);
    this._text('Points: ' + S.skillPoints, W/2, 44, '#aa88ff88', 10, 'center');

    const hits = {};
    const cols = { dmg1:0,dmg2:0,dmg3:0, hp1:1,hp2:1, dash1:2,dash2:2, crit1:0,crit2:0, atkspd1:2, combo:2, charged:0, airtkl:2 };
    const rows2 = { dmg1:0,dmg2:1,dmg3:2, hp1:0,hp2:1, dash1:0,dash2:1, crit1:3,crit2:4, atkspd1:2, combo:3, charged:3, airtkl:4 };
    const COLS = 3, cw = 160, ch = 44, padX = 30, padY = 58;

    SKILLS.forEach(skill => {
      const c = cols[skill.id] ?? 0;
      const r = rows2[skill.id] ?? 0;
      const sx2 = padX + c * (cw+12);
      const sy  = padY + r * (ch+8);
      const unlocked = S.unlockedSkills.includes(skill.id);
      const available = (!skill.requires || S.unlockedSkills.includes(skill.requires)) && S.skillPoints >= skill.cost && !unlocked;
      const bg = unlocked ? '#aa88ff22' : available ? '#44448822' : '#00000033';
      const bd = unlocked ? '#aa88ffcc' : available ? '#4444aa77' : '#ffffff11';
      this._rect(sx2, sy, cw, ch, bg, bd, 3);
      this._text(skill.name, sx2+8, sy+14, unlocked?'#aa88ff':'#ffffff99', 9, 'left', this._serif);
      this._text(skill.desc, sx2+8, sy+26, '#ffffff55', 8);
      this._text(unlocked ? '✓' : (S.skillPoints >= skill.cost ? `${skill.cost}pt` : `Need ${skill.cost}pt`),
        sx2+8, sy+38, unlocked?'#aa88ff':'#e8d5a066', 8);
      if (available) hits[skill.id] = { x:sx2, y:sy, w:cw, h:ch, skill };
    });
    this._btn('Back', W-70, H-32, 55, 22);
    hits._back = { x:W-70, y:H-32, w:55, h:22 };
    return hits;
  }

  // ── QUEST LOG ────────────────────────────────────
  drawQuestLog() {
    const ctx = this._ctx;
    const S   = this.save.state;
    ctx.fillStyle = 'rgba(0,0,0,0.93)'; ctx.fillRect(0,0,W,H);
    this._text('JOURNAL', W/2, 28, '#e8d5a0', 18, 'center', this._serif);

    const active    = S.quests.map(q => { const def=QUESTS.find(d=>d.id===q.id); return def?{...def,...q}:null; }).filter(Boolean);
    const completed = S.completedQuests.map(id => QUESTS.find(d=>d.id===id)).filter(Boolean);

    let qy = 50;
    this._text('ACTIVE', 20, qy, '#e8d5a088', 9); qy += 14;
    if (!active.length) { this._text('No active quests.', 20, qy, '#ffffff33', 9); qy += 14; }
    active.forEach(q => {
      this._rect(15, qy, W-30, 44, '#e8d5a008', '#e8d5a022', 2);
      this._text(q.title, 22, qy+13, '#e8d5a0', 11, 'left', this._serif);
      this._text(q.desc, 22, qy+26, '#ffffff66', 8);
      // Step progress
      const step = q.steps && q.steps[0];
      if (step) this._text(step.done?'✓ COMPLETE':step.desc, 22, qy+38, step.done?'#44cc44':'#e8d5a055', 8);
      // Reward preview
      if (q.reward) {
        const rw = `Reward: ◈${q.reward.geo||0} XP:${q.reward.xp||0}${q.reward.relic?' + Relic':''}`;
        this._text(rw, W-18, qy+13, '#ffd70077', 8, 'right');
      }
      qy += 50;
    });

    qy += 6;
    this._text('COMPLETED', 20, qy, '#44cc4488', 9); qy += 14;
    completed.slice(-3).forEach(q => {
      this._text('✓ ' + q.title, 22, qy, '#44cc4466', 9, 'left', this._serif);
      qy += 14;
    });

    this._btn('Back', W-70, H-32, 55, 22);
    return { _back:{ x:W-70, y:H-32, w:55, h:22 } };
  }

  // ── GAME OVER ─────────────────────────────────────
  drawGameOver(score) {
    const ctx = this._ctx;
    ctx.fillStyle = 'rgba(20,0,0,0.92)'; ctx.fillRect(0,0,W,H);
    ctx.shadowColor = '#cc3344'; ctx.shadowBlur = 30;
    this._text('YOU HAVE FALLEN', W/2, H/2-50, '#cc3344', 26, 'center', this._serif);
    ctx.shadowBlur = 0;
    this._text('SHADE LOST', W/2, H/2-28, '#ffffff33', 9, 'center');
    this._text('Geo lost: ' + (score.geo||0), W/2, H/2, '#ffd70077', 10, 'center');
    const rb = this._btn('Rise Again', W/2-50, H/2+20, 100, 26, true);
    const mb = this._btn('Main Menu',  W/2-40, H/2+54, 80, 22);
    return { retry:rb, menu:mb };
  }

  // ── VICTORY ───────────────────────────────────────
  drawVictory(save) {
    const ctx = this._ctx;
    const S   = save.state;
    ctx.fillStyle = 'rgba(0,0,0,0.96)'; ctx.fillRect(0,0,W,H);
    ctx.shadowColor = '#e8d5a0'; ctx.shadowBlur = 24;
    this._text('THE KINGDOM MENDS', W/2, 70, '#e8d5a0', 26, 'center', this._serif);
    ctx.shadowBlur = 0;
    this._text('A HOLLOW TALE — COMPLETE', W/2, 92, '#ffffff33', 9, 'center');
    [
      `Geo collected: ${S.geo}`,
      `Shards found: ${S.shards}`,
      `Enemies slain: ${S.killCount}`,
      `Player level: ${S.level}`,
    ].forEach((line, i) => this._text(line, W/2, 130+i*18, '#e8d5a088', 11, 'center'));
    const nb = this._btn('New Journey', W/2-55, H-70, 110, 26, true);
    return { newGame: nb };
  }

  // ── FPS ───────────────────────────────────────────
  drawFPS(fps) {
    this._text('FPS: '+fps, W-42, H-6, '#ffffff33', 8);
  }
}
