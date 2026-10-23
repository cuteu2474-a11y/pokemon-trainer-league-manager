import {RandomPlayerAI, Dex} from '@pkmn/sim';
import {selectTacticalMove, searchBudget} from './tactical-search.js';
import {rolloutActions} from './showdown-rollout.js';

const clamp = x => Math.max(1, Math.min(20, Number.isFinite(x) ? x : 10));
export function trainerSkill(trainer = {}) {
  return {
    tactics: clamp(trainer.tactics ?? 10),
    switching: clamp(trainer.switching ?? 10),
  };
}
export function typeMultiplier(moveType, defenderTypes = []) {
  return defenderTypes.reduce((m, type) => {
    const effectiveness = Dex.getEffectiveness(moveType, [type]);
    return m * Math.pow(2, effectiveness);
  }, 1);
}
export function scoreMove(move, opponentTypes = []) {
  const data = Dex.moves.get(move.id || move.move?.id || move.move || move.choice?.replace(/^move /,''));
  if (!data.exists) return 0;
  const power = data.basePower || (data.category === 'Status' ? 25 : 1);
  const accuracy = typeof data.accuracy === 'number' ? data.accuracy / 100 : 1;
  const effect = data.category === 'Status' ? 1 : typeMultiplier(data.type, opponentTypes);
  return power * accuracy * effect * (data.priority > 0 ? 1.15 : 1);
}

/** Skill-based decision making; Showdown remains authoritative for all battle mechanics. */
export class TrainerAI extends RandomPlayerAI {
  constructor(stream, trainer = {}, options = {}) {
    const skill = trainerSkill(trainer);
    super(stream, {move: Math.min(1, 0.70 + skill.tactics * 0.015), seed:options.seed});
    this.skill = skill;
    this.foeSpecies = null;
    this.team = options.team || [];
    this.ownActive = null;
    this.battleProvider = options.battleProvider;
    this.decisions = {moves:0, switches:0, rollouts:0, rolloutFallbacks:0};

  }
  receiveLine(line) {
    if (line.startsWith('|switch|') || line.startsWith('|drag|')) {
      const parts = line.split('|');
      const actor = parts[2] || '';
      if (actor.startsWith(this.side === 'p1' ? 'p2' : 'p1')) {
        this.foeSpecies = (parts[3] || '').split(',')[0];
      }
    }
    return super.receiveLine(line);
  }
  receiveRequest(request) {
    const slot = request.side?.pokemon?.findIndex(mon => mon.active);
    if (slot >= 0) this.ownActive = this.team[slot] || null;
    return super.receiveRequest(request);
  }
  chooseMove(active, moves) {
    this.decisions.moves++;
    if (this.prng.random() > this.skill.tactics / 20) return super.chooseMove(active, moves);
    const types = Dex.species.get(this.foeSpecies || '').types || [];
    const ownSpecies = Dex.species.get(this.ownActive?.species || '');
    const battle = this.battleProvider?.();
    if (battle?.requestState === 'move' && battle[this.side]?.active?.[0]?.hp) {
      try {
        const choices = moves.map(m => m.choice).filter(choice => /^move [1-4](?:$|\\s)/.test(choice));
        const {depth,samples} = searchBudget(this.skill.tactics);
        const ranked = rolloutActions(battle, {
          sideId:this.side, choices, depth, samples:Math.min(samples,4),
        });
        if (ranked[0]?.runs > 0 && Number.isFinite(ranked[0].score)) {
          this.decisions.rollouts++;
          return ranked[0].choice;
        }
        this.decisions.rolloutFallbacks++;
      } catch {
        this.decisions.rolloutFallbacks++;
      }
    }
    return selectTacticalMove(moves, {
      foeTypes: types,
      ownTypes: ownSpecies.exists ? ownSpecies.types : [],
      ownAbility: this.ownActive?.ability,
      ownItem: this.ownActive?.item,
    }, this.skill.tactics, () => this.prng.random());
  }
  chooseSwitch(active, switches) {
    this.decisions.switches++;
    if (this.prng.random() > this.skill.switching / 20) return super.chooseSwitch(active, switches);
    const types = Dex.species.get(this.foeSpecies || '').types || [];
    const ranked = switches.map((entry,i)=>{
      const species = Dex.species.get(entry.pokemon.details?.split(',')[0] || entry.pokemon.ident?.split(': ')[1] || '');
      const score = species.exists ? species.types.reduce((sum,t)=>sum + types.reduce((v,foe)=>v - Dex.getEffectiveness(foe,[t]),0),0) : 0;
      const health = Number.parseInt(entry.pokemon.condition,10);
      return {entry,i,score:score + (Number.isFinite(health) ? health/1000 : 0)};
    });
    ranked.sort((a,b)=>b.score-a.score || a.i-b.i);
    return ranked[0].entry.slot;
  }
}
