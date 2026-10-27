import {teamSpecialty} from '../battle/team-specialty.js';
import {enhancementPlan,automaticEnhancement} from '../battle/enhancement.js';
import {LEAGUE_RULES} from '../core/league-rules.js';
import {validateRequest} from '../core/match-registration.js';
import {readFileSync} from 'node:fs';
import {battlePlan, planMoves} from '../battle/battle-plans.js';
import {resolveBattleAutonomy} from '../battle/battle-autonomy.js';
import {buildBattleReport} from '../battle/replay-report.js';
import {Dex} from '@pkmn/sim';
import {simulateClubMatch} from '../battle/club-match.js';
import {normalizeStatPairs} from '../core/stat-potential.js';
const koreanMoves=JSON.parse(readFileSync(new URL('./moves-ko.json',import.meta.url),'utf8'));
const korean = JSON.parse(readFileSync(new URL('./species-ko.json', import.meta.url), 'utf8'));
const spriteNumbers = JSON.parse(readFileSync(new URL('./species-sprites.json', import.meta.url), 'utf8'));
const byNumber = new Map(Dex.species.all().filter(s => !s.forme).map(s => [s.num, s.name]));
const int = (v, min, max, label) => {
  if (!Number.isInteger(v) || v < min || v > max) throw new RangeError(label);
  return v;
};
export function battlePokemon(p, plan='balanced') {
  if (!p || typeof p.name !== 'string') throw new TypeError('포켓몬 이름이 필요합니다.');
  const species = Dex.species.get(p.species || byNumber.get(korean[p.name] ?? ({뉴라:215})[p.name]) || p.name);
  if (!species.exists) throw new RangeError('전투 데이터가 없는 포켓몬: ' + p.name);
  // Six separate CA/PA pairs; legacy saves are upgraded deterministically.
  // A Pokémon's legacy "level" and aggregate "power" are not combat inputs.
  const {statCA,statPA}=normalizeStatPairs(p);
  const moves = p.moves ?? planMoves(species,plan);
  if (!Array.isArray(moves) || moves.length < 1 || moves.length > 4 || moves.some(m => !Dex.moves.get(m).exists)) throw new RangeError('기술 데이터 오류: ' + p.name);
  const ability = p.ability ?? species.abilities['0'];
  if (!Dex.abilities.get(ability).exists) throw new RangeError('특성 데이터 오류');
  if (p.item && !Dex.items.get(p.item).exists) throw new RangeError('도구 데이터 오류');
  return {name:p.name,pokemonId:p.uid??p.id,ownerTrainerId:p.ownerTrainerId,species:species.name,statCA,statPA,
    teraType:p.teraType,nature:p.nature||'Hardy',ability,item:p.item||'',moves};
}
export function prepareClub(club, order) {
  if (!club || !Array.isArray(club.trainers) || club.trainers.length !== 5 || club.trainers.some(t => !t || !Array.isArray(t.pokemon) || t.pokemon.length !== 6)) throw new RangeError('트레이너 5명과 각 포켓몬 6마리가 필요합니다.');
  if (!Array.isArray(order) || order.length !== 5 || new Set(order).size !== 5 || order.some(i => !Number.isInteger(i) || i < 0 || i > 4)) throw new RangeError('출전 순서 오류');
  return order.map(i => {
    const trainer=club.trainers[i];
    const aiProfile=resolveBattleAutonomy(trainer,trainer.directorTrust??50);
    const plan=aiProfile.plan;
    const team=trainer.pokemon.map(p=>battlePokemon(p,plan));
    const counts=team.reduce((map,mon)=>(map[mon.name]=(map[mon.name]||0)+1,map),{});
    team.forEach((mon,slot)=>{mon.pokemonId ??= String(club.id)+':'+String(trainer.uid??i)+':'+slot;mon.displayName=mon.name;if(counts[mon.name]>1)mon.name=mon.name+'·'+(slot+1);});
    const enhancement=trainer.enhancement===undefined?automaticEnhancement(team):enhancementPlan(team,trainer.enhancement);
    return {specialty:teamSpecialty(team),enhancement,name:trainer.name,tactics:trainer.tactics,switching:trainer.switching,
      battleAnalysis:trainer.battleAnalysis??trainer.analysis,
      resourceManagement:trainer.resourceManagement??trainer.management,
      moveJudgment:trainer.moveJudgment,switchJudgment:trainer.switchJudgment,
      battlePlan:plan,aiProfile,team};
  });
}
export async function runMatch(body) {
  const registration=body?.registration?await validateRequest(body):null;
  if (!body || body.home?.id === body.away?.id) throw new RangeError('경기 상대 오류');
  const seed = body.seed;
  if (!Array.isArray(seed) || seed.length !== 4 || seed.some(n => !Number.isInteger(n) || n < 0 || n > 0xffffffff)) throw new RangeError('경기 시드 오류');
  const home = prepareClub(body.home, body.homeOrder), away = prepareClub(body.away, body.awayOrder);
  const result = await simulateClubMatch(home, away, {seed});
  const visuals = {}, moveVisuals = {};
  const moveInfo=move=>({id:move.id,type:move.type,category:move.category,power:move.basePower,accuracy:move.accuracy,label:koreanMoves[move.id]||move.name});
  for(const trainer of [...home,...away])for(const mon of trainer.team)for(const id of mon.moves){const move=Dex.moves.get(id);moveVisuals[move.name]=moveInfo(move);moveVisuals[move.id]=moveInfo(move);}
  const types=Dex.types.all().map(t=>t.name);
  const typeChart=Object.fromEntries(types.map(attack=>[attack,Object.fromEntries(types.map(defense=>[defense,Dex.getImmunity(attack,[defense])?2**Dex.getEffectiveness(attack,[defense]):0]))]));
  for(const trainer of [...home,...away])for(const mon of trainer.team){const species=Dex.species.get(mon.species);visuals[species.name]={id:species.spriteid,num:spriteNumbers[species.id]||species.num,types:species.types};}
  for (const round of result.rounds) for (const line of round.result.log.split('\n')) {
    const part = line.split('|');
    const name = ['switch','drag','detailschange'].includes(part[1]) ? part[3]?.split(',')[0] : part[1] === '-formechange' ? part[3] : null;
    if (name) {
      const species = Dex.species.get(name);
      if (species.exists) visuals[name] = {id:species.spriteid, num:spriteNumbers[species.id] || species.num, types:species.types};
    }
    if (part[1] === 'move') {
      const move = Dex.moves.get(part[3]);
      if (move.exists) moveVisuals[part[3]] = moveInfo(move);
    }
  }
  return {engine:'showdown',rules:LEAGUE_RULES, ...(registration?{registration}:{}),visuals, moveVisuals, report:buildBattleReport(result.rounds,home,away), typeChart,
    coaching:Object.fromEntries([['home',home],['away',away]].map(([side,group])=>[side,group.map(t=>({name:t.name,
      ...t.aiProfile,plan:t.battlePlan}))])), home:body.home.id, away:body.away.id, aScore:result.trainersDefeated.B, bScore:result.trainersDefeated.A,
    teams:{home,away}, rounds:result.rounds.map(r => ({trainerA:r.trainerA, trainerB:r.trainerB, winner:r.winner,exhausted:r.exhausted||null,endReason:r.result.endReason,turns:r.result.turns,turnLimit:r.result.turnLimit,rulesVersion:r.result.rulesVersion,aiDecisions:r.result.aiDecisions,
      specialties:r.result.specialties,enhancements:r.result.enhancements,initialEnhancements:r.result.initialEnhancements,final:r.result.finalState, initial:Object.fromEntries(['p1','p2'].map(side=>[side,r.result.initialStats[side].map((state,i)=>({name:r.pokemonOrder[side][i],hp:state.hp,maxhp:state.maxhp,status:state.status,statusData:state.statusData,item:state.item,lastItem:state.lastItem,form:state.form,protectionBusted:state.protectionBusted,pokemonId:state.pokemonId,pp:state.pp,maxpp:state.maxpp}))])), log:r.result.log}))};
}
