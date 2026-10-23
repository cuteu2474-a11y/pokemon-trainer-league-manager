import {simulateClubMatch} from '../battle/club-match.js';

export const DIVISIONS = 4;
export const CLUBS_PER_DIVISION = 10;
export const ROUNDS_PER_SEASON = 18;
const assert = (condition, message) => {if (!condition) throw new RangeError(message);};
const clone = value => structuredClone(value);

export function createLeague(divisions) {
  assert(Array.isArray(divisions) && divisions.length === DIVISIONS, 'Four divisions required');
  const ids = new Set();
  const clubs = divisions.map((members, division) => {
    assert(Array.isArray(members) && members.length === CLUBS_PER_DIVISION, 'Ten clubs required per division');
    return members.map(club => {
      assert(club && typeof club.id === 'string' && club.id && !ids.has(club.id), 'Unique club IDs required');
      ids.add(club.id);
      return {...clone(club), division:division+1};
    });
  });
  return {season:1, divisions:clubs, history:[], current:null};
}

/** Berger circle method: 9 pairings repeated with reversed venues. */
export function generateSchedule(ids) {
  assert(Array.isArray(ids) && ids.length === CLUBS_PER_DIVISION && new Set(ids).size === CLUBS_PER_DIVISION, 'Ten unique club IDs required');
  const rotation=[...ids], first=[];
  for(let round=0;round<9;round++) {
    const fixtures=[];
    for(let i=0;i<5;i++) {
      const left=rotation[i],right=rotation[9-i];
      fixtures.push({home:round%2===0 ? left:right,away:round%2===0 ? right:left});
    }
    first.push(fixtures);
    rotation.splice(1,0,rotation.pop());
  }
  return [...first,...first.map(round=>round.map(({home,away})=>({home:away,away:home})))];
}
const blankRow = club => ({id:club.id,name:club.name || club.id,played:0,won:0,drawn:0,lost:0,for:0,against:0,points:0});
export function standings(current, division) {
  assert(current && division>=1 && division<=4, 'Invalid division');
  return Object.values(current.tables[division-1]).sort((a,b)=>
    b.points-a.points || (b.for-b.against)-(a.for-a.against) || b.for-a.for ||
    b.won-a.won || a.id.localeCompare(b.id)).map((row,index)=>({...row,rank:index+1}));
}
export function startSeason(league) {
  assert(!league.current || league.current.round===18, 'Previous season unfinished');
  const fixtures=league.divisions.map(clubs=>generateSchedule(clubs.map(c=>c.id)));
  league.current={round:0,fixtures,tables:league.divisions.map(clubs=>
    Object.fromEntries(clubs.map(club=>[club.id,blankRow(club)]))),results:[]};
  return league.current;
}
function applyResult(table, home, away, homeScore, awayScore) {
  assert(Number.isInteger(homeScore) && homeScore>=0 && Number.isInteger(awayScore) && awayScore>=0,'Nonnegative integer scores required');
  const h=table[home],a=table[away];
  assert(h && a && h!==a,'Unknown fixture clubs');
  for(const [row,scored,conceded] of [[h,homeScore,awayScore],[a,awayScore,homeScore]]) {
    row.played++;row.for+=scored;row.against+=conceded;
    if(scored>conceded){row.won++;row.points+=3;}
    else if(scored===conceded){row.drawn++;row.points++;}
    else row.lost++;
  }
}
export async function playRound(league, playMatch) {
  assert(league.current && league.current.round<18,'Start a season or advance to the next season');
  assert(typeof playMatch==='function','Match engine required');
  const current=league.current, index=current.round, pending=[];
  // Resolve all matches before applying results: a failed match never partially advances a round.
  for(let division=0;division<4;division++) {
    const lookup=new Map(league.divisions[division].map(c=>[c.id,c]));
    for(const fixture of current.fixtures[division][index]) {
      const outcome=await playMatch(lookup.get(fixture.home),lookup.get(fixture.away),{
        season:league.season,division:division+1,round:index+1
      });
      assert(outcome && Number.isInteger(outcome.homeScore) && outcome.homeScore>=0 &&
        Number.isInteger(outcome.awayScore) && outcome.awayScore>=0,'Match must return nonnegative integer scores');
      pending.push({division:division+1,round:index+1,...fixture,homeScore:outcome.homeScore,
        awayScore:outcome.awayScore,details:outcome.details ?? null});
    }
  }
  for(const result of pending) applyResult(current.tables[result.division-1],result.home,result.away,result.homeScore,result.awayScore);
  current.results.push(...pending);
  current.round++;
  return pending;
}
export async function playSeason(league, playMatch) {
  if(!league.current) startSeason(league);
  while(league.current.round<18) await playRound(league,playMatch);
  return league.current;
}
export function advanceSeason(league) {
  assert(league.current?.round===18,'Finish all 18 rounds before promotion and relegation');
  const ranked=league.divisions.map((_,i)=>standings(league.current,i+1));
  const movement=[];
  const newDivisions=league.divisions.map((clubs,i)=>{
    const byId=new Map(clubs.map(c=>[c.id,c]));
    const stay=ranked[i].slice(i===0?0:2,i===3?10:8).map(r=>byId.get(r.id));
    if(i>0) stay.push(...ranked[i-1].slice(8).map(r=>league.divisions[i-1].find(c=>c.id===r.id)));
    if(i<3) stay.push(...ranked[i+1].slice(0,2).map(r=>league.divisions[i+1].find(c=>c.id===r.id)));
    assert(stay.length===10,'Invalid promotion/relegation count');
    return stay.map(c=>({...c,division:i+1}));
  });
  for(let i=0;i<4;i++)for(const club of league.divisions[i]){
    const target=newDivisions.findIndex(list=>list.some(c=>c.id===club.id))+1;
    if(target!==i+1) movement.push({id:club.id,from:i+1,to:target});
  }
  league.history.push({season:league.season,standings:ranked,results:league.current.results,movement});
  league.divisions=newDivisions;league.season++;league.current=null;
  startSeason(league);
  return movement;
}

/** Authoritative 5-trainer relay adapter; 5 defeats to 0 produces a 5:0 league score. */
export async function showdownLeagueMatch(home,away,options={}) {
  const result=await simulateClubMatch(home.trainers,away.trainers,options);
  return {homeScore:result.trainersDefeated.B,awayScore:result.trainersDefeated.A,details:result};
}

/** Explicit fast-mode adapter for non-player fixtures; deterministic given injected RNG. */
export function createFastMatchEngine(random=Math.random) {
  return async (home,away)=>{
    const strength=club=>Number.isFinite(club.rating)?Math.max(1,club.rating):100;
    const chance=strength(home)/(strength(home)+strength(away));
    const roll=random();
    assert(Number.isFinite(roll)&&roll>=0&&roll<1,'RNG must return [0,1)');
    const draw=0.12;
    if(roll<draw)return {homeScore:4,awayScore:4};
    return roll<draw+(1-draw)*chance?{homeScore:5,awayScore:Math.floor(random()*5)}:
      {homeScore:Math.floor(random()*5),awayScore:5};
  };
}
