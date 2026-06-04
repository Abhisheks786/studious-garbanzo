// ═══════════════════════════════════════════════════
//  SILKBOUND PRO — Audio System
// ═══════════════════════════════════════════════════
export class AudioSystem {
  constructor() {
    this.ac = null;
    this.masterGain = null;
    this.sfxGain = null;
    this.musicGain = null;
    this.musicNodes = [];
    this.sfxVol = 0.8;
    this.musicVol = 0.6;
    this._init();
  }

  _init() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ac = new AC();
      this.masterGain = this.ac.createGain();
      this.masterGain.connect(this.ac.destination);
      this.sfxGain   = this.ac.createGain();
      this.musicGain = this.ac.createGain();
      this.sfxGain.connect(this.masterGain);
      this.musicGain.connect(this.masterGain);
      this.sfxGain.gain.value   = this.sfxVol;
      this.musicGain.gain.value = this.musicVol;
    } catch(e) {}
  }

  resume() {
    if (this.ac && this.ac.state === 'suspended') this.ac.resume();
  }

  setSfxVol(v)   { this.sfxVol   = v; if (this.sfxGain)   this.sfxGain.gain.value   = v; }
  setMusicVol(v) { this.musicVol = v; if (this.musicGain) this.musicGain.gain.value = v; }

  // Low-level tone
  _tone(freq, dur, type = 'sine', vol = 0.1, freqEnd = null) {
    if (!this.ac || !this.sfxGain) return;
    this.resume();
    const o = this.ac.createOscillator();
    const g = this.ac.createGain();
    o.connect(g); g.connect(this.sfxGain);
    o.type = type;
    o.frequency.setValueAtTime(freq, this.ac.currentTime);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, this.ac.currentTime + dur);
    g.gain.setValueAtTime(vol, this.ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ac.currentTime + dur);
    o.start(); o.stop(this.ac.currentTime + dur);
  }

  // ── SFX library ──────────────────────────────────
  jump()        { this._tone(320, 0.07, 'sine', 0.09, 480); }
  land()        { this._tone(90,  0.05, 'square', 0.07); }
  dash()        { this._tone(300, 0.1,  'sawtooth', 0.07, 120); }
  attack()      { this._tone(220, 0.04, 'sawtooth', 0.09); this._tone(380, 0.03, 'square', 0.05); }
  attackHeavy() { this._tone(140, 0.08, 'sawtooth', 0.14); this._tone(280, 0.06, 'square', 0.08); }
  attackCharged(){ this._tone(80, 0.15, 'square', 0.18); this._tone(160, 0.1, 'sawtooth', 0.12); }
  hitEnemy()    { this._tone(160, 0.06, 'square', 0.1); }
  critHit()     { this._tone(800, 0.04, 'sine', 0.12); this._tone(1200, 0.06, 'sine', 0.1); }
  takeDmg()     { this._tone(180, 0.09, 'square', 0.11); }
  die()         { [400,300,200,100].forEach((f,i) => setTimeout(() => this._tone(f, 0.1, 'sawtooth', 0.1), i * 60)); }
  coin()        { this._tone(660, 0.04, 'sine', 0.08); this._tone(880, 0.04, 'sine', 0.06); }
  ability()     { [523,659,784,1046].forEach((f,i) => setTimeout(() => this._tone(f, 0.12, 'sine', 0.1), i * 70)); }
  levelUp()     { [523,659,784,880,1046].forEach((f,i) => setTimeout(() => this._tone(f, 0.14, 'sine', 0.12), i * 80)); }
  bossHit()     { this._tone(110, 0.3, 'sawtooth', 0.15); this._tone(82, 0.3, 'square', 0.08); }
  bossPhase()   { [55,82,110,165,220].forEach((f,i) => setTimeout(() => this._tone(f, 0.4, 'sawtooth', 0.12 - i*0.02), i * 100)); }
  bossRoar()    { this._tone(60, 0.5, 'sawtooth', 0.2, 40); this._tone(80, 0.4, 'square', 0.12); }
  secret()      { [880,1100,1320,1760].forEach((f,i) => setTimeout(() => this._tone(f, 0.1, 'sine', 0.1), i * 60)); }
  purchase()    { this._tone(440, 0.05, 'sine', 0.08); this._tone(660, 0.08, 'sine', 0.1); }
  questComplete(){ [523,659,784,1046,1318].forEach((f,i) => setTimeout(() => this._tone(f, 0.15, 'sine', 0.12), i * 90)); }
  uiClick()     { this._tone(440, 0.04, 'sine', 0.06); }
  uiBack()      { this._tone(330, 0.04, 'sine', 0.06); }

  // ── Procedural ambient music ─────────────────────
  startAmbient(biome) {
    this.stopMusic();
    if (!this.ac) return;
    this.resume();
    const baseFreqs = {
      depths:  [55,  82,  110, 146],
      fungal:  [73,  110, 146, 196],
      crystal: [98,  130, 196, 261],
      temple:  [110, 165, 220, 294],
      secret:  [46,  69,  92,  138],
    };
    const freqs = baseFreqs[biome] || baseFreqs.depths;
    this.musicNodes = [];
    freqs.forEach((f, i) => {
      const o = this.ac.createOscillator();
      const g = this.ac.createGain();
      const panner = this.ac.createStereoPanner ? this.ac.createStereoPanner() : null;
      o.connect(g);
      if (panner) { g.connect(panner); panner.connect(this.musicGain); }
      else g.connect(this.musicGain);
      o.type = i % 2 === 0 ? 'sine' : 'triangle';
      o.frequency.value = f;
      // Slow LFO on volume
      const lfoFreq = 0.05 + i * 0.02;
      const baseVol = 0.018 - i * 0.003;
      this._scheduleLFO(g.gain, baseVol, lfoFreq);
      if (panner) panner.pan.value = (i % 2 === 0 ? -0.3 : 0.3);
      o.start();
      this.musicNodes.push({ osc: o, gain: g });
    });
  }

  _scheduleLFO(param, base, rate) {
    if (!this.ac) return;
    const now = this.ac.currentTime;
    // Schedule 60 seconds of LFO automation - limit to ~10 updates per second
    const timeStep = Math.max(0.05, 1 / Math.max(rate * 100, 10)); 
    let iterations = 0;
    for (let t = 0; t < 60 && iterations < 1200; t += timeStep, iterations++) {
      const v = base + Math.sin(t * rate * Math.PI * 2) * base * 0.5;
      param.setValueAtTime(Math.max(0.001, v), now + t);
    }
  }

  stopMusic() {
    this.musicNodes.forEach(n => { try { n.osc.stop(); } catch(e){} });
    this.musicNodes = [];
  }

  // Boss music — more intense drone
  startBossMusic(bossType) {
    this.stopMusic();
    if (!this.ac) return;
    this.resume();
    const bossFreqs = {
      Warden:          [41, 55, 82],
      CrystalGuardian: [55, 73, 110],
      VoidKing:        [29, 41, 55],
    };
    const freqs = bossFreqs[bossType] || [41, 55, 82];
    this.musicNodes = [];
    freqs.forEach((f, i) => {
      const o = this.ac.createOscillator();
      const g = this.ac.createGain();
      o.connect(g); g.connect(this.musicGain);
      o.type = 'sawtooth';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.025 - i * 0.006, this.ac.currentTime);
      o.start();
      this.musicNodes.push({ osc: o, gain: g });
    });
  }
}
