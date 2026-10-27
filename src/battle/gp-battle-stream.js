import {initialEnhancement,installEnhancementRules} from './enhancement.js';
import {installLeagueRules} from '../core/league-rules.js';
import {captureRelayState,restoreRelayState} from './relay-state.js';
import {BattleStreams, Teams} from '@pkmn/sim';
import {convertPokemon, injectBattleTeams, applyFormChange} from './gp-adapter.js';
import {normalizeStatPairs} from '../core/stat-potential.js';
import {installLevelFreeDamage} from './level-free-damage.js';

const IDS = ['hp','atk','def','spa','spd','spe'];
const zeroEVs = Object.fromEntries(IDS.map(s => [s,0]));
const neutralIVs = Object.fromEntries(IDS.map(s => [s,31]));

/** Showdown protocol adapter: strip league CA/PA; no public Level field. */
export function packGPTeam(team) {
  if (!Array.isArray(team) || team.length !== 6) throw new RangeError('Six Pokemon are required on each team');
  const plain = team.map((entry, i) => {
    if (!entry?.species || !Array.isArray(entry.moves) || !entry.moves.length || entry.moves.length > 4) {
      throw new TypeError(`Invalid species or moves at slot ${i}`);
    }
    normalizeStatPairs(entry);
    const {statCA,statPA,ca,pa,gp,level,power,natureModifiers,...showdownSet}=entry;
    // The upstream simulator may internally default a protocol level, but our
    // battle damage, confusion, and fixed-damage moves never use that field.
    return {...showdownSet,ivs:{...neutralIVs},evs:{...zeroEVs}};
  });
  return Teams.pack(plain);
}

function natureModifiers(dex, name) {
  const nature = dex.natures.get(name || 'Hardy');
  if (!nature.exists) throw new RangeError(`Unknown nature: ${name}`);
  const mods = {};
  if (nature.plus) mods[nature.plus] = 1.1;
  if (nature.minus) mods[nature.minus] = 0.9;
  return mods;
}

export function currentStats(battle) {
  const [p1, p2] = [battle.p1, battle.p2].map(side => side.pokemon.map(mon => ({
    ...captureRelayState(mon,mon.leagueMeta),species: mon.species.name,
    hp: mon.hp, maxhp: mon.maxhp, status: mon.status,
    pp: mon.baseMoveSlots.map(slot => slot.pp), maxpp:mon.baseMoveSlots.map(slot=>slot.maxpp),
    atk: mon.storedStats.atk, def: mon.storedStats.def, spa: mon.storedStats.spa,
    spd: mon.storedStats.spd, spe: mon.storedStats.spe,
  })));
  return {p1, p2};
}

/** Per-instance hook: avoids modifying the Showdown Pokemon prototype globally. */
export function installFormHooks(battle, teams=null, formEvents = []) {
  for (let sideIndex = 0; sideIndex < 2; sideIndex++) {
    const side = sideIndex ? battle.p2 : battle.p1;
    for (let i = 0; i < side.pokemon.length; i++) {
      const mon = side.pokemon[i];
      if(mon.__leagueFormHook)continue;
      const input=teams?.[sideIndex]?.[i]||mon.leagueMeta;if(!input)continue;
      const meta={...input,natureModifiers:natureModifiers(battle.dex,input.nature)};mon.leagueMeta=meta;
      Object.defineProperty(mon,'__leagueFormHook',{value:true});
      const originalSetSpecies = mon.setSpecies;
      mon.updateMaxHp=function(){return applyFormChange(this,meta,this.species);};
      mon.setSpecies = function (...args) {
        const prior = {hp: this.hp, maxhp: this.maxhp, speciesId: this.species.id};
        const result = originalSetSpecies.apply(this, args);
        // Showdown Transform copies the target's actual storedStats after setSpecies.
        if (result && args[2] !== true) {
          const converted = applyFormChange(this, meta, this.species, prior);
          if (prior.speciesId !== this.species.id) {
            formEvents.push({side: side.id, slot: i, from: prior.speciesId, to: this.species.id, stats: converted.stats});
          }
        }
        return result;
      };
    }
  }
}

/** Provides Battle access before the simulator's very first turn. */
export class GPBattleStream extends BattleStreams.BattleStream {
  constructor(teamA, teamB, carry = {}, options = {}) {
    super({noCatch: true});
    this.gpTeams = [teamA, teamB];
    this.carry = carry;this.options=options;
    this.initialStats = null;
    this.formEvents = [];
  }
  _writeLine(type, message) {
    super._writeLine(type, message);
    if (type !== 'start') return;
    const battle = this.battle;
    if (!battle) throw new Error('Showdown did not create a Battle');
    installLevelFreeDamage(battle);installLeagueRules(battle,this.options);
    const originalAction=battle.runAction;
    battle.runAction=function(action){const result=originalAction.call(this,action);if(action.choice==='start')for(const side of this.sides)side.pokemonLeft=side.pokemon.filter(mon=>mon.hp>0).length;return result;};
    const originalSend=battle.send, sentStates=new Map();
    battle.send=function(type,data){
      if(type==='update'&&Array.isArray(data)&&battle.started){
        const extra=[];
        for(const side of [battle.p1,battle.p2])for(const mon of side.pokemon){
          const state=JSON.stringify({types:mon.getTypes(),basePP:mon.baseMoveSlots.map(slot=>slot.pp),moves:mon.moveSlots.map(slot=>({id:slot.id,name:slot.move,pp:slot.pp,maxpp:slot.maxpp}))});
          const key=side.id+': '+mon.name;
          if(sentStates.get(key)!==state){sentStates.set(key,state);extra.push('|league-state|'+key+'|'+state);}
        }
        data=[...data,...extra];
      }
      return originalSend.call(this,type,data);
    };
    const originalStart = battle.start;
    const self = this;
    battle.start = function (...args) {
      const sides = [battle.p1, battle.p2];
      if (sides.some(side => !side?.pokemon || side.pokemon.length !== 6)) {
        throw new Error('GP injection requires two complete six-Pokemon teams');
      }
      const converted = sides.map((side, sideIndex) => side.pokemon.map((mon, i) => {
        const meta = self.gpTeams[sideIndex][i];
        return convertPokemon({...meta, natureModifiers: natureModifiers(battle.dex, meta.nature)}, mon.species);
      }));
      injectBattleTeams(battle, converted[0], converted[1]);
      installFormHooks(battle, self.gpTeams, self.formEvents);
      for (const [sideIndex, key] of ['p1','p2'].entries()) {
        const prior = self.carry[key];
        if (!prior) continue;
        for (let i = 0; i < 6; i++) {
          const mon = sides[sideIndex].pokemon[i];
          const saved = prior[i];
          if (!saved) throw new Error(`Missing carry state for ${key} slot ${i}`);
          restoreRelayState(battle,mon,mon.leagueMeta,saved);
        }
      }
      installEnhancementRules(battle,Object.fromEntries(['p1','p2'].map((key,i)=>[key,initialEnhancement(self.gpTeams[i],self.options.enhancements?.[key]||{kind:'none'},self.carry.enhancements?.[key])])));
      self.initialEnhancements=structuredClone(battle.leagueEnhancements);
      for (const side of sides) side.pokemonLeft = side.pokemon.filter(mon => mon.hp > 0).length;
      for(const side of sides)if(!side.pokemonLeft)throw Error('기절한 트레이너의 선수단은 다시 출전할 수 없습니다.');
      // Side.pokemon is reordered on every switch; retain original object identities.
      self.originalPokemon=Object.fromEntries(['p1','p2'].map((key,i)=>[key,[...sides[i].pokemon]]));
      self.initialStats = currentStats(battle);
      return originalStart.apply(this, args);
    };
  }
}
