import {createLottery,validateLottery,rankStandings,STANDINGS_RULES} from '../core/standings.js';
export function ensureRanking(g){
 if(g.leagueRanking?.season===g.season){
  for(let d=0;d<4;d++)validateLottery(g.clubs.filter(c=>c.division===d).map(c=>c.id),g.leagueRanking.lotteries[d]);
  return g.leagueRanking;
 }
 const lotteries=[0,1,2,3].map(division=>createLottery(g.clubs.filter(c=>c.division===division).map(c=>c.id),{seed:g.seed,season:g.season,division}));
 g.leagueRanking={version:1,season:g.season,createdAtRound:g.round||0,migrated:(g.round||0)>0,lotteries};return g.leagueRanking;
}
export function webResults(g){
 return (g.results||[]).flatMap((round,i)=>(Array.isArray(round)?round:[round]).map(m=>({season:g.season,round:m.round??(Array.isArray(round)?i+1:Math.floor(i/20)+1),home:m.home,away:m.away,homeScore:m.aScore,awayScore:m.bScore})));
}
export function webStandings(g,division){
 const state=ensureRanking(g),rows=g.clubs.filter(c=>c.division===division).map(c=>({id:c.id,name:c.name,points:c.points,played:c.w+c.d+c.l,won:c.w,drawn:c.d,lost:c.l,for:c.gf,against:c.ga}));
 return rankStandings(rows,{results:webResults(g),lottery:state.lotteries[division]});
}
export function archiveStandings(g){
 if(g.round!==18)return null;
 g.leagueSeasons ||= {};
 if(g.leagueSeasons[g.season])return g.leagueSeasons[g.season];
 const tables=[0,1,2,3].map(d=>webStandings(g,d)),movement=[];
 for(let d=0;d<4;d++)for(const row of tables[d]){
  const to=row.rank<=2&&d>0?d-1:row.rank>=9&&d<3?d+1:d;
  if(to!==d)movement.push({id:row.id,from:d,to});
 }
 return g.leagueSeasons[g.season]=JSON.parse(JSON.stringify({season:g.season,rulesVersion:STANDINGS_RULES.version,tables,lotteries:g.leagueRanking.lotteries,movement}));
}
