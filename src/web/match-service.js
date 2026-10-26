import {readFileSync} from 'node:fs';
import {Dex} from '@pkmn/sim';
import {simulateClubMatch} from '../battle/club-match.js';
import {gpBudget, STATS, validateGP} from '../core/stats.js';
const korean = JSON.parse(readFileSync(new URL('./species-ko.json', import.meta.url), 'utf8'));
const spriteNumbers = JSON.parse(readFileSync(new URL('./species-sprites.json', import.meta.url), 'utf8'));
const byNumber = new Map(Dex.species.all().filter(s => !s.forme).map(s => [s.num, s.name]));
const int = (v, min, max, label) => {
  if (!Number.isInteger(v) || v < min || v > max) throw new RangeError(label);
  return v;
};
export function battlePokemon(p) {
  if (!p || typeof p.name !== 'string') throw new TypeError('포켓몬 이름이 필요합니다.');
  const species = Dex.species.get(p.species || byNumber.get(korean[p.name] ?? ({뉴라:215})[p.name]) || p.name);
  if (!species.exists) throw new RangeError('전투 데이터가 없는 포켓몬: ' + p.name);
  const level = int(p.level, 1, 100, '레벨 범위 오류');
  // Legacy UI power becomes CA only when the save has no explicit CA/GP yet.
  const ca = int(p.ca ?? p.power, 1, 200, '현재 능력 범위 오류');
  const pa = int(p.pa ?? ca, ca, 200, '잠재 능력 범위 오류');
  const gp = p.gp ? {...p.gp} : Object.fromEntries(STATS.map((stat, i) =>
    [stat, Math.floor(gpBudget(ca) / 6) + (i < gpBudget(ca) % 6 ? 1 : 0)]));
  validateGP(gp, ca);
  const attacks = ['bodyslam','flamethrower','surf','thunderbolt','icebeam','energyball','closecombat','sludgebomb','earthquake','airslash','psychic','xscissor','rockslide','shadowball','dragonpulse','crunch','ironhead','playrough'];
  const stab = attacks.filter(id => species.types.includes(Dex.moves.get(id).type));
  const pool = [...new Set([...stab, ...(species.baseStats.atk >= species.baseStats.spa ? ['bodyslam','rockslide','crunch','earthquake'] : ['swift','shadowball','psychic','surf'])])];
  const moves = p.moves ?? pool.slice(0, 4);
  if (!Array.isArray(moves) || moves.length < 1 || moves.length > 4 || moves.some(m => !Dex.moves.get(m).exists)) throw new RangeError('기술 데이터 오류: ' + p.name);
  const ability = p.ability ?? species.abilities['0'];
  if (!Dex.abilities.get(ability).exists) throw new RangeError('특성 데이터 오류');
  if (p.item && !Dex.items.get(p.item).exists) throw new RangeError('도구 데이터 오류');
  return {name:p.name, species:species.name, level, ca, pa, gp, nature:p.nature || 'Hardy', ability, item:p.item || '', moves};
}
export function prepareClub(club, order) {
  if (!club || !Array.isArray(club.trainers) || club.trainers.length !== 5 || club.trainers.some(t => !t || !Array.isArray(t.pokemon) || t.pokemon.length !== 6)) throw new RangeError('트레이너 5명과 각 포켓몬 6마리가 필요합니다.');
  if (!Array.isArray(order) || order.length !== 5 || new Set(order).size !== 5 || order.some(i => !Number.isInteger(i) || i < 0 || i > 4)) throw new RangeError('출전 순서 오류');
  return order.map(i => ({name:club.trainers[i].name, tactics:club.trainers[i].tactics, switching:club.trainers[i].switching, team:club.trainers[i].pokemon.map(battlePokemon)}));
}
export async function runMatch(body) {
  if (!body || body.home?.id === body.away?.id) throw new RangeError('경기 상대 오류');
  const seed = body.seed;
  if (!Array.isArray(seed) || seed.length !== 4 || seed.some(n => !Number.isInteger(n) || n < 0 || n > 0xffffffff)) throw new RangeError('경기 시드 오류');
  const home = prepareClub(body.home, body.homeOrder), away = prepareClub(body.away, body.awayOrder);
  const result = await simulateClubMatch(home, away, {seed});
  const visuals = {}, moveVisuals = {};
  for (const round of result.rounds) for (const line of round.result.log.split('\n')) {
    const part = line.split('|');
    const name = ['switch','drag','detailschange'].includes(part[1]) ? part[3]?.split(',')[0] : part[1] === '-formechange' ? part[3] : null;
    if (name) {
      const species = Dex.species.get(name);
      if (species.exists) visuals[name] = {id:species.spriteid, num:spriteNumbers[species.id] || species.num, types:species.types};
    }
    if (part[1] === 'move') {
      const move = Dex.moves.get(part[3]);
      if (move.exists) moveVisuals[part[3]] = {type:move.type, category:move.category};
    }
  }
  return {engine:'showdown', visuals, moveVisuals, home:body.home.id, away:body.away.id, aScore:result.trainersDefeated.B, bScore:result.trainersDefeated.A,
    teams:{home,away}, rounds:result.rounds.map(r => ({trainerA:r.trainerA, trainerB:r.trainerB, winner:r.winner, log:r.result.log}))};
}
