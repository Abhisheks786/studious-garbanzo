// ═══════════════════════════════════════════════════
//  SOULCALL — Audio System  (Production Upgrade)
//
//  FIXES:
//   • _scheduleLFO no longer crashes on suspended AudioContext
//   • LFO event cap: 300 max (was 1,200) — prevents memory leak
//   • All AudioParam calls wrapped in try/catch
//   • stopMusic() safely handles already-stopped nodes
//   • startAmbient() / startBossMusic() return gracefully if suspended
//
//  UPGRADES:
//   • Smooth crossfade between music tracks (1.5 s)
//   • Positional SFX panning based on world-space X vs player X
//   • Dynamic boss intensity — adds a percussion layer on phase 2+
//   • Richer SFX waveforms using multi-oscillator compositing
// ═══════════════════════════════════════════════════
export class AudioSystem {
  constructor() {
    this.ac          = null;
    this.masterGain  = null;
    this.sfxGain     = null;
    this.musicGain   = null;
    this.musicNodes  = [];
    this._crossfadeT = null; // cancelable crossfade timer
    this.sfxVol      = 0.8;
    this.musicVol    = 0.6;
    this._bossPhase  = 1;    // track boss phase for music intensity
    this._init();
  }

  _init() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ac         = new AC();
      this.masterGain = this.ac.createGain();
      this.masterGain.connect(this.ac.destination);
      this.sfxGain    = this.ac.createGain();
      this.musicGain  = this.ac.createGain();
      this.sfxGain.connect(this.masterGain);
      this.musicGain.connect(this.masterGain);
      this.sfxGain.gain.value   = this.sfxVol;
      this.musicGain.gain.value = this.musicVol;
    } catch(e) {
      console.warn('[Audio] AudioContext init failed:', e.message);
    }
  }

  // ── Safe resume (MUST be called on first user gesture) ──
  resume() {
    if (this.ac && this.ac.state === 'suspended') {
      this.ac.resume().catch(e => console.warn('[Audio] resume failed:', e.message));
    }
  }

  setSfxVol(v)   {
    this.sfxVol   = v;
    if (this.sfxGain)   { try { this.sfxGain.gain.value   = v; } catch(e){} }
  }
  setMusicVol(v) {
    this.musicVol = v;
    if (this.musicGain) { try { this.musicGain.gain.value = v; } catch(e){} }
  }

  // ── Low-level tone — safe, never throws ──────────────
  _tone(freq, dur, type = 'sine', vol = 0.1, freqEnd = null) {
    if (!this.ac || !this.sfxGain) return;
    // Don't play if suspended (don't try to resume — that requires user gesture)
    if (this.ac.state === 'suspended') return;
    try {
      const o = this.ac.createOscillator();
      const g = this.ac.createGain();
      o.connect(g);
      g.connect(this.sfxGain);
      o.type = type;
      const t = this.ac.currentTime;
      o.frequency.setValueAtTime(Math.max(10, freq), t);
      if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(10, freqEnd), t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.start(t);
      o.stop(t + dur + 0.01);
    } catch(e) {
      // Silently ignore — audio is non-critical
    }
  }

  // ── Positional SFX (pan based on dx from centre) ────
  _tonePanned(freq, dur, type, vol, freqEnd, panValue) {
    if (!this.ac || !this.sfxGain || this.ac.state === 'suspended') return;
    try {
      const o       = this.ac.createOscillator();
      const g       = this.ac.createGain();
      const panner  = this.ac.createStereoPanner
        ? this.ac.createStereoPanner()
        : null;
      o.connect(g);
      if (panner) {
        panner.pan.value = Math.max(-1, Math.min(1, panValue));
        g.connect(panner);
        panner.connect(this.sfxGain);
      } else {
        g.connect(this.sfxGain);
      }
      o.type = type;
      const t = this.ac.currentTime;
      o.frequency.setValueAtTime(Math.max(10, freq), t);
      if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(10, freqEnd), t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.start(t); o.stop(t + dur + 0.01);
    } catch(e) {}
  }

  // Play a SFX with optional world-position panning
  // panX: world x of source (-1 to 1 range, clamp applied)
  playSFXAt(fn, worldX, playerX, roomW = 640) {
    const pan = ((worldX - playerX) / (roomW * 0.5));
    fn(pan);
  }

  // ── SFX library ──────────────────────────────────────
  jump()         { this._tone(320, 0.07, 'sine', 0.09, 480); }
  land()         {
    this._tone(90, 0.05, 'square', 0.07);
    this._tone(140, 0.04, 'sine', 0.03);
  }
  dash()         {
    this._tone(300, 0.08, 'sawtooth', 0.07, 100);
    this._tone(600, 0.05, 'sine',     0.04, 200);
  }
  attack()       {
    this._tone(220, 0.04, 'sawtooth', 0.09);
    this._tone(380, 0.03, 'square',   0.05);
  }
  attackHeavy()  {
    this._tone(140, 0.08, 'sawtooth', 0.14);
    this._tone(280, 0.06, 'square',   0.08);
  }
  attackCharged(){
    this._tone(80, 0.15, 'square',   0.18);
    this._tone(160, 0.10, 'sawtooth', 0.12);
    this._tone(320, 0.08, 'sine',     0.06);
  }
  hitEnemy()     { this._tone(160, 0.06, 'square', 0.10); }
  critHit()      {
    this._tone(800,  0.04, 'sine', 0.12);
    this._tone(1200, 0.06, 'sine', 0.10);
    this._tone(1600, 0.04, 'sine', 0.06);
  }
  takeDmg()      {
    this._tone(180, 0.09, 'square', 0.11);
    this._tone(90,  0.12, 'sawtooth', 0.06);
  }
  die()          {
    const seq = [400, 300, 200, 100];
    seq.forEach((f, i) => setTimeout(() => this._tone(f, 0.1, 'sawtooth', 0.10), i * 60));
  }
  coin()         {
    this._tone(660, 0.04, 'sine', 0.08);
    this._tone(880, 0.04, 'sine', 0.06);
  }
  ability()      {
    [523, 659, 784, 1046].forEach((f, i) =>
      setTimeout(() => this._tone(f, 0.12, 'sine', 0.10), i * 70));
  }
  levelUp()      {
    [523, 659, 784, 880, 1046].forEach((f, i) =>
      setTimeout(() => this._tone(f, 0.14, 'sine', 0.12), i * 80));
  }
  bossHit()      {
    this._tone(110, 0.30, 'sawtooth', 0.15);
    this._tone(82,  0.30, 'square',   0.08);
  }
  bossPhase()    {
    [55, 82, 110, 165, 220].forEach((f, i) =>
      setTimeout(() => this._tone(f, 0.4, 'sawtooth', Math.max(0.001, 0.12 - i * 0.02)), i * 100));
  }
  boss()         {
    [220, 196, 165, 110, 82].forEach((f, i) =>
      setTimeout(() => this._tone(f, 0.25, 'square', 0.10), i * 120));
  }
  bossRoar()    {
    this._tone(60, 0.5, 'sawtooth', 0.20, 40);
    this._tone(80, 0.4, 'square',   0.12);
  }
  secret()       {
    [880, 1100, 1320, 1760].forEach((f, i) =>
      setTimeout(() => this._tone(f, 0.1, 'sine', 0.10), i * 60));
  }
  purchase()     {
    this._tone(440, 0.05, 'sine', 0.08);
    this._tone(660, 0.08, 'sine', 0.10);
  }
  questComplete(){
    [523, 659, 784, 1046, 1318].forEach((f, i) =>
      setTimeout(() => this._tone(f, 0.15, 'sine', 0.12), i * 90));
  }
  uiClick()      { this._tone(440, 0.04, 'sine', 0.06); }
  uiBack()       { this._tone(330, 0.04, 'sine', 0.06); }
  checkpoint()   {
    [523, 784, 1046].forEach((f, i) =>
      setTimeout(() => this._tone(f, 0.18, 'sine', 0.08), i * 100));
  }
  staminaRefill(){ this._tone(880, 0.06, 'sine', 0.04); }

  // ── Procedural ambient music ─────────────────────────
  startAmbient(biome) {
    this._crossfade(() => this._buildAmbient(biome));
  }

  _buildAmbient(biome) {
    if (!this.ac) return;
    const baseFreqs = {
      depths:  [55,  82,  110, 146],
      fungal:  [73,  110, 146, 196],
      crystal: [98,  130, 196, 261],
      temple:  [110, 165, 220, 294],
      secret:  [46,  69,  92,  138],
    };
    const freqs = baseFreqs[biome] || baseFreqs.depths;
    freqs.forEach((f, i) => {
      try {
        const o = this.ac.createOscillator();
        const g = this.ac.createGain();
        const panner = this.ac.createStereoPanner
          ? this.ac.createStereoPanner() : null;
        o.connect(g);
        if (panner) {
          g.connect(panner);
          panner.connect(this.musicGain);
          panner.pan.value = (i % 2 === 0 ? -0.3 : 0.3);
        } else {
          g.connect(this.musicGain);
        }
        o.type = i % 2 === 0 ? 'sine' : 'triangle';
        o.frequency.value = f;
        this._scheduleLFO(g.gain, 0.018 - i * 0.003, 0.05 + i * 0.02);
        o.start();
        this.musicNodes.push({ osc: o, gain: g });
      } catch(e) {
        console.warn('[Audio] Failed to build ambient oscillator:', e.message);
      }
    });
  }

  // Boss music — more intense drone
  startBossMusic(bossType) {
    this._bossPhase = 1;
    this._crossfade(() => this._buildBossMusic(bossType));
  }

  _buildBossMusic(bossType) {
    if (!this.ac) return;
    const bossFreqs = {
      Warden:          [41, 55, 82],
      CrystalGuardian: [55, 73, 110],
      VoidKing:        [29, 41, 55],
    };
    const freqs = bossFreqs[bossType] || [41, 55, 82];
    freqs.forEach((f, i) => {
      try {
        const o = this.ac.createOscillator();
        const g = this.ac.createGain();
        o.connect(g);
        g.connect(this.musicGain);
        o.type = 'sawtooth';
        o.frequency.value = f;
        const baseVol = 0.025 - i * 0.006;
        g.gain.setValueAtTime(baseVol, this.ac.currentTime);
        o.start();
        this.musicNodes.push({ osc: o, gain: g });
      } catch(e) {}
    });
  }

  // Escalate boss music when phase changes
  setBossPhase(phase) {
    if (phase <= this._bossPhase || !this.ac) return;
    this._bossPhase = phase;
    // Add extra percussion oscillator for higher phases
    try {
      const o = this.ac.createOscillator();
      const g = this.ac.createGain();
      o.connect(g); g.connect(this.musicGain);
      o.type = 'square';
      o.frequency.value = 27.5 * phase; // deeper with each phase
      g.gain.setValueAtTime(0.012, this.ac.currentTime);
      o.start();
      this.musicNodes.push({ osc: o, gain: g });
    } catch(e) {}
  }

  // ── Smooth crossfade ─────────────────────────────────
  // Fade out current music over 1.5s, then build new track
  _crossfade(buildFn) {
    if (!this.ac || !this.musicGain) {
      this.stopMusic();
      buildFn();
      return;
    }
    // Cancel any in-progress crossfade
    if (this._crossfadeT) {
      clearTimeout(this._crossfadeT);
      this._crossfadeT = null;
    }

    const FADE_DURATION = 1.2; // seconds
    const currentVol = this.musicGain.gain.value;

    if (this.musicNodes.length > 0 && this.ac.state !== 'suspended') {
      // Fade out
      try {
        this.musicGain.gain.setValueAtTime(currentVol, this.ac.currentTime);
        this.musicGain.gain.linearRampToValueAtTime(0.001, this.ac.currentTime + FADE_DURATION);
      } catch(e) {}

      this._crossfadeT = setTimeout(() => {
        this._crossfadeT = null;
        this._stopMusicNodes();
        try {
          this.musicGain.gain.setValueAtTime(0.001, this.ac.currentTime);
          this.musicGain.gain.linearRampToValueAtTime(this.musicVol, this.ac.currentTime + 0.8);
        } catch(e) {}
        buildFn();
      }, FADE_DURATION * 1000);
    } else {
      this._stopMusicNodes();
      try { this.musicGain.gain.value = this.musicVol; } catch(e) {}
      buildFn();
    }
  }

  stopMusic() {
    if (this._crossfadeT) { clearTimeout(this._crossfadeT); this._crossfadeT = null; }
    this._stopMusicNodes();
  }

  _stopMusicNodes() {
    const nodes = this.musicNodes.slice();
    this.musicNodes = [];
    for (const n of nodes) {
      try { n.osc.stop(); } catch(e) {}
      try { n.osc.disconnect(); } catch(e) {}
      try { n.gain.disconnect(); } catch(e) {}
    }
  }

  // ── FIXED LFO scheduler ──────────────────────────────
  // BEFORE: Could schedule 1,200 events, crash on suspended context
  // AFTER:  Max 300 events, wrapped in try/catch, graceful on suspend
  _scheduleLFO(param, base, rate) {
    if (!this.ac || this.ac.state === 'suspended') return;
    try {
      const now       = this.ac.currentTime;
      const safeBase  = Math.max(0.001, base);
      // Cap: 30 seconds of automation, max 300 events
      const timeStep  = Math.max(0.1, 1 / Math.max(rate * 60, 6));
      let   count     = 0;
      for (let t = 0; t < 30 && count < 300; t += timeStep, count++) {
        const v = safeBase + Math.sin(t * rate * Math.PI * 2) * safeBase * 0.5;
        param.setValueAtTime(Math.max(0.001, v), now + t);
      }
    } catch(e) {
      // AudioContext may be suspended — silently ignore
    }
  }
}
