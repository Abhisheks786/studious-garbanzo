// ═══════════════════════════════════════════════════
//  SILKBOUND PRO — Constants
// ═══════════════════════════════════════════════════
export const W = 640, H = 400;
export const TILE = 20;

export const PL_SPEED   = 3.4;
export const PL_JUMP    = -9.0;
export const PL_GRAV    = 0.40;
export const PL_MAXFALL = 15;
export const DASH_SPEED = 12;
export const DASH_DUR   = 10;

export const PAL = {
  depths:  { bg:'#06050e', ground:'#1a1428', accent:'#6644aa', fog:'#0a0818', particle:'#8866cc', light:'#aa88ee33' },
  fungal:  { bg:'#05100a', ground:'#0d2215', accent:'#44bb66', fog:'#051009', particle:'#66dd88', light:'#44bb6622' },
  crystal: { bg:'#050e1a', ground:'#0a1e30', accent:'#44aaff', fog:'#040c18', particle:'#88ccff', light:'#44aaff22' },
  temple:  { bg:'#140e04', ground:'#2a1e08', accent:'#ffcc44', fog:'#100c02', particle:'#ffee88', light:'#ffcc4422' },
  secret:  { bg:'#0a000a', ground:'#1e001e', accent:'#ff44cc', fog:'#080008', particle:'#ff88ee', light:'#ff44cc22' },
};

export function biomeColors(biome) {
  const b = PAL[biome] || PAL.depths;
  return { solid: b.ground, top: b.accent + 'aa', bg: b.bg, fog: b.fog, light: b.light, particle: b.particle, accent: b.accent };
}

// XP thresholds per level (index = current level)
export const XP_TABLE = [0,100,250,450,700,1000,1400,1900,2500,3200,4100];

// Relic definitions
export const RELICS = [
  { id:'iron_heart',   name:'Iron Heart',    icon:'♥', desc:'+2 max HP',           effect:{maxHpBonus:2},                       cost:80  },
  { id:'swift_sole',   name:'Swift Sole',    icon:'👟', desc:'Faster dash cooldown',effect:{dashCDMult:0.6},                     cost:60  },
  { id:'crit_edge',    name:'Crit Edge',     icon:'⚔', desc:'+15% crit chance',    effect:{critBonus:0.15},                     cost:100 },
  { id:'soul_siphon',  name:'Soul Siphon',   icon:'🌀', desc:'Gain soul on hit',    effect:{soulOnHit:true},                     cost:90  },
  { id:'thorn_cloak',  name:'Thorn Cloak',   icon:'🌿', desc:'Reflect 1 dmg on hit',effect:{thornReflect:true},                 cost:120 },
  { id:'void_step',    name:'Void Step',     icon:'💨', desc:'Double dash charges', effect:{doubleDash:true},                   cost:150 },
  { id:'lucky_charm',  name:'Lucky Charm',   icon:'🍀', desc:'+20% geo drops',      effect:{geoBonus:0.2},                      cost:70  },
  { id:'berserker',    name:'Berserker',     icon:'🔥', desc:'+30% dmg below 25% HP',effect:{berserker:true},                   cost:130 },
];

// Skill tree nodes
export const SKILLS = [
  { id:'dmg1',      name:'Nail Hone I',     desc:'+1 nail damage',         cost:1, requires:null,      stat:'damage',    val:1   },
  { id:'dmg2',      name:'Nail Hone II',    desc:'+2 nail damage',         cost:2, requires:'dmg1',     stat:'damage',    val:2   },
  { id:'dmg3',      name:'Nail Master',     desc:'+3 nail damage',         cost:3, requires:'dmg2',     stat:'damage',    val:3   },
  { id:'hp1',       name:'Vessel Mend I',   desc:'+2 max health',          cost:1, requires:null,       stat:'maxHp',     val:2   },
  { id:'hp2',       name:'Vessel Mend II',  desc:'+4 max health',          cost:2, requires:'hp1',      stat:'maxHp',     val:4   },
  { id:'dash1',     name:'Fleet Step',      desc:'Dash CD -20%',           cost:1, requires:null,       stat:'dashCD',    val:0.8 },
  { id:'dash2',     name:'Phantom Step',    desc:'Dash CD -40%',           cost:2, requires:'dash1',    stat:'dashCD',    val:0.6 },
  { id:'crit1',     name:'Sharp Edge',      desc:'+10% crit chance',       cost:2, requires:'dmg1',     stat:'critChance',val:0.1 },
  { id:'crit2',     name:'Death Edge',      desc:'+20% crit chance',       cost:3, requires:'crit1',    stat:'critChance',val:0.2 },
  { id:'atkspd1',   name:'Swiftstrike',     desc:'Attack speed +25%',      cost:2, requires:'dmg1',     stat:'atkSpeed',  val:0.75},
  { id:'combo',     name:'Combo Mastery',   desc:'Unlock 3-hit combo',     cost:2, requires:'atkspd1',  stat:'combo',     val:true},
  { id:'charged',   name:'Charged Strike',  desc:'Unlock charged attack',  cost:2, requires:'dmg2',     stat:'charged',   val:true},
  { id:'airtkl',    name:'Aerial Arts',     desc:'Unlock air attacks',     cost:2, requires:'combo',    stat:'airAtk',    val:true},
];

// Shop items (merchant sells these)
export const SHOP_ITEMS = [
  { id:'hp_up',    name:'Vessel Mend',  desc:'Restore 3 HP',       cost:30,  type:'consumable', effect:{hp:3}  },
  { id:'hp_max',   name:'Pale Ore',     desc:'+2 permanent HP',    cost:120, type:'upgrade',    effect:{maxHp:2}},
  { id:'dmg_up',   name:'Nail Art I',   desc:'+1 nail damage',     cost:100, type:'upgrade',    effect:{damage:1}},
  { id:'soul_up',  name:'Soul Vessel',  desc:'+20 max soul',       cost:80,  type:'upgrade',    effect:{maxSoul:20}},
  { id:'relic_0',  name:'Iron Heart',   desc:'+2 max HP (relic)',  cost:80,  type:'relic',      relicId:'iron_heart'},
  { id:'relic_1',  name:'Swift Sole',   desc:'Fast dash (relic)',  cost:60,  type:'relic',      relicId:'swift_sole'},
  { id:'relic_2',  name:'Crit Edge',    desc:'+15% crit (relic)',  cost:100, type:'relic',      relicId:'crit_edge'},
  { id:'relic_3',  name:'Berserker',    desc:'Low HP dmg (relic)', cost:130, type:'relic',      relicId:'berserker'},
];

// Quests
export const QUESTS = [
  {
    id:'main_1', type:'main', title:'The Awakening',
    desc:'Speak with the Elder Moth in the Forgotten Depths.',
    steps:[{ desc:'Find Elder Moth', npcId:'elder', done:false }],
    reward:{ geo:50, xp:100 },
  },
  {
    id:'main_2', type:'main', title:'Seal Broken',
    desc:'Defeat the Warden guarding the depths.',
    steps:[{ desc:'Defeat the Warden', bossId:'Warden', done:false }],
    reward:{ geo:150, xp:300 },
  },
  {
    id:'main_3', type:'main', title:'Three Shards',
    desc:'Collect all three ancient Shards.',
    steps:[{ desc:'Collect Shards (0/3)', shardTarget:3, done:false }],
    reward:{ geo:200, xp:500, ability:'nail2' },
  },
  {
    id:'side_1', type:'side', title:'The Sage\'s Request',
    desc:'Bring 5 geo crystals to the Fungal Sage.',
    steps:[{ desc:'Collect 10 geo', geoTarget:10, done:false }],
    reward:{ geo:40, xp:80, relic:'lucky_charm' },
  },
  {
    id:'side_2', type:'side', title:'Enemy of Enemies',
    desc:'Slay 10 enemies to prove your strength.',
    steps:[{ desc:'Defeat enemies (0/10)', killTarget:10, done:false }],
    reward:{ geo:60, xp:120 },
  },
];
