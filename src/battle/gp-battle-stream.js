import {BattleStreams, Teams} from '@pkmn/sim';
import {convertPokemon, injectBattleTeams, applyFormChange} from './gp-adapter.js';
import {validateGP} from '../core/stats.js';

const IDS = ['hp','atk','def','spa','spd','spe'];
const zeroEVs = Object.fromEntries(IDS.map(s => [s,0]));
const neutralIVs = Object.fromEntries(IDS.map(s => [s,31]));

/** Pack ordinary Showdown entry fields, stripping CA/PA/GP. IV/EV are inert placeholders. */
export function packGPTeam(team) {
  if (!Array.isArray(team) || team.length !== 6) throw new RangeError('Six Pokemon are required on each team');
  const plain = team.map((entry, i) => {
    if (!entry?.species || !Array.isArray(entry.moves) || !entry.moves.length || entry.moves.length > 4) {
      throw new TypeError(`Invalid species or moves at slot ${i}`);
    }
    validateGP(entry.gp, entry.ca);
    if (!Number.isInteger(entry.pa) || entry.pa < entry.ca || entry.pa > 200) throw new RangeError('Invalid PA');
    if (!Number.isInteger(entry.level) || entry.level < 1 || entry.level > 100) throw new RangeError('Invalid level');
    const {ca, pa, gp, natureModifiers, ...showdownSet} = entry;
    return {...showdownSet, ivs: {...neutralIVs}, evs: {...zeroEVs}};
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

function currentStats(battle) {
  const [p1, p2] = [battle.p1, battle.p2].map(side => side.pokemon.map(mon => ({
    species: mon.species.name,
    hp: mon.hp, maxhp: mon.maxhp, status: mon.status,
    pp: mon.baseMoveSlots.map(slot => slot.pp), maxpp:mon.baseMoveSlots.map(slot=>slot.maxpp),
    atk: mon.storedStats.atk, def: mon.storedStats.def, spa: mon.storedStats.spa,
    spd: mon.storedStats.spd, spe: mon.storedStats.spe,
  })));
  return {p1, p2};
}

/** Per-instance hook: avoids modifying the Showdown Pokemon prototype globally. */
export function installFormHooks(battle, teams, formEvents = []) {
  for (let sideIndex = 0; sideIndex < 2; sideIndex++) {
    const side = sideIndex ? battle.p2 : battle.p1;
    for (let i = 0; i < side.pokemon.length; i++) {
      const mon = side.pokemon[i];
      const meta = {...teams[sideIndex][i], natureModifiers: natureModifiers(battle.dex, teams[sideIndex][i].nature)};
      const originalSetSpecies = mon.setSpecies;
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
  constructor(teamA, teamB, carry = {}) {
    super({noCatch: true});
    this.gpTeams = [teamA, teamB];
    this.carry = carry;
    this.initialStats = null;
    this.formEvents = [];
  }
  _writeLine(type, message) {
    super._writeLine(type, message);
    if (type !== 'start') return;
    const battle = this.battle;
    if (!battle) throw new Error('Showdown did not create a Battle');
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
      for (const [sideIndex, key] of ['p1','p2'].entries()) {
        const prior = self.carry[key];
        if (!prior) continue;
        for (let i = 0; i < 6; i++) {
          const mon = sides[sideIndex].pokemon[i];
          const saved = prior[i];
          if (!saved) throw new Error(`Missing carry state for ${key} slot ${i}`);
          mon.hp = Math.max(0, Math.min(mon.maxhp, saved.hp));
          mon.fainted = mon.hp === 0;
          mon.status = mon.hp > 0 ? (saved.status || '') : '';
          mon.statusState = mon.status ? {id: mon.status, target: mon} : {};
          for (let j = 0; j < mon.baseMoveSlots.length; j++) {
            if (saved.pp?.[j] === undefined) continue;
            const slot = mon.baseMoveSlots[j];
            slot.pp = Math.max(0, Math.min(slot.maxpp, saved.pp[j]));
          }
          mon.moveSlots = mon.baseMoveSlots.slice();
        }
      }
      for (const side of sides) side.pokemonLeft = side.pokemon.filter(mon => mon.hp > 0).length;
      installFormHooks(battle, self.gpTeams, self.formEvents);
      // Side.pokemon is reordered on every switch; retain original object identities.
      self.originalPokemon=Object.fromEntries(['p1','p2'].map((key,i)=>[key,[...sides[i].pokemon]]));
      self.initialStats = currentStats(battle);
      return originalStart.apply(this, args);
    };
  }
}
