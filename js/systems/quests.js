// ═══════════════════════════════════════════════════
//  SOULCALL — Quest System
// ═══════════════════════════════════════════════════
import { QUESTS } from '../constants.js';

export class QuestSystem {
  constructor(save, ui, sfx) {
    this.save = save;
    this.ui   = ui;
    this.sfx  = sfx;
  }

  // Auto-start quests linked to visited NPCs
  checkAutoStart(npcId) {
    QUESTS.forEach(def => {
      if (def.steps[0]?.npcId === npcId) this.save.startQuest(def);
    });
  }

  // Called on kill
  onKill(enemyType) {
    const S = this.save.state;
    S.quests.forEach(q => {
      const def = QUESTS.find(d => d.id === q.id);
      if (!def) return;
      q.steps.forEach((step, i) => {
        if (step.done || !def.steps[i]) return;
        if (def.steps[i].killTarget) {
          step.progress = (step.progress || 0) + 1;
          if (step.progress >= def.steps[i].killTarget) { step.done = true; this._checkComplete(q, def); }
        }
      });
    });
    this.save.write();
  }

  // Called on geo change
  onGeoCollected(total) {
    const S = this.save.state;
    S.quests.forEach(q => {
      const def = QUESTS.find(d => d.id === q.id);
      if (!def) return;
      q.steps.forEach((step, i) => {
        if (step.done || !def.steps[i]) return;
        if (def.steps[i].geoTarget && total >= def.steps[i].geoTarget) {
          step.done = true; this._checkComplete(q, def);
        }
      });
    });
    this.save.write();
  }

  // Called on shard collected
  onShardCollected(count) {
    const S = this.save.state;
    S.quests.forEach(q => {
      const def = QUESTS.find(d => d.id === q.id);
      if (!def) return;
      q.steps.forEach((step, i) => {
        if (step.done || !def.steps[i]) return;
        if (def.steps[i].shardTarget && count >= def.steps[i].shardTarget) {
          step.done = true; this._checkComplete(q, def);
        }
      });
    });
    this.save.write();
  }

  // Called on boss defeated
  onBossKilled(bossType) {
    const S = this.save.state;
    S.quests.forEach(q => {
      const def = QUESTS.find(d => d.id === q.id);
      if (!def) return;
      q.steps.forEach((step, i) => {
        if (step.done || !def.steps[i]) return;
        if (def.steps[i].bossId === bossType) { step.done = true; this._checkComplete(q, def); }
      });
    });
    this.save.write();
  }

  // Called on NPC talked to
  onNPCTalked(npcId) {
    this.checkAutoStart(npcId);
    const S = this.save.state;
    S.quests.forEach(q => {
      const def = QUESTS.find(d => d.id === q.id);
      if (!def) return;
      q.steps.forEach((step, i) => {
        if (step.done || !def.steps[i]) return;
        if (def.steps[i].npcId === npcId) { step.done = true; this._checkComplete(q, def); }
      });
    });
    this.save.write();
  }

  _checkComplete(q, def) {
    const allDone = q.steps.every(s => s.done);
    if (!allDone) return;
    // Grant reward
    const S = this.save.state;
    const r = def.reward || {};
    if (r.geo)     S.geo     += r.geo;
    if (r.xp)      this.save.addXP(r.xp);
    if (r.ability && !S.abilities.includes(r.ability)) S.abilities.push(r.ability);
    if (r.relic)   { if(!S.ownedRelics.includes(r.relic)) S.ownedRelics.push(r.relic); }
    this.save.completeQuest(q.id);
    this.ui.pushNotif('✦ QUEST COMPLETE: ' + def.title, '#e8d5a0');
    this.sfx.questComplete();
  }

  // Start all main quests automatically at game start
  initQuests() {
    QUESTS.filter(q => q.type === 'main').forEach(def => this.save.startQuest(def));
    QUESTS.filter(q => q.type === 'side').forEach(def => this.save.startQuest(def));
    this.save.write();
  }
}
