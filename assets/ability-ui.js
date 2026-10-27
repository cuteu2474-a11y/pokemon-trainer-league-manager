/**
 * Level-free six-stat CA/PA player UI.
 * Loaded after the legacy office and matchday scripts; preserves existing saves.
 */
import {
  ABILITY_STATS, ABILITY_NAMES, normalizeStatPairs, meanStatCA, meanStatPA,
  growStat
} from '../src/core/stat-potential.js';

const escape=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;')
  .replaceAll('>','&gt;').replaceAll('"','&quot;');
let migrationCount=0;
const growthEvents=[];

function allPokemon(){
  if(typeof game==='undefined'||!game?.clubs)return [];
  const trainers=game.clubs.flatMap(club=>
    [...(club.trainers||[]),...(club.reserveTrainers||[]),...(club.trainerAcademy||[])]
      .filter(Boolean));
  const free=Array.isArray(game.freeAgents)?
    game.freeAgents.map(x=>x.trainer).filter(Boolean):[];
  return [...trainers,...free].flatMap(t=>t.pokemon||[]);
}
function increaseOne(mon){
  const {statCA,statPA}=normalizeStatPairs(mon);
  const stat=[...ABILITY_STATS].sort((a,b)=>
    (statPA[b]-statCA[b])-(statPA[a]-statCA[a]))[0];
  if(statPA[stat]<=statCA[stat])return null;
  const upgraded=growStat(mon,stat);
  mon.statCA=upgraded.statCA;
  mon.statPA=upgraded.statPA;
  mon.power=meanStatCA(mon);mon._abilityMirror=mon.power;
  if(upgraded.delta){
    growthEvents.push({name:mon.name||mon.species,stat,
      statName:ABILITY_NAMES[stat],before:upgraded.oldValue,after:upgraded.newValue});
    if(growthEvents.length>150)growthEvents.splice(0,growthEvents.length-150);
  }
  return {stat,delta:upgraded.delta,statName:ABILITY_NAMES[stat]};
}
/** Upgrade each owned or academy Pokémon only once; later growth is per-stat. */
function ensureAll(){
  const pokemon=allPokemon();
  for(const p of pokemon){
    if(!p.statCA||!p.statPA){
      const pairs=normalizeStatPairs(p);
      p.statCA=pairs.statCA;p.statPA=pairs.statPA;
      migrationCount++;
      p._abilityMirror=meanStatCA(p);
      // Legacy fast league-score consumers read an aggregate cache only.
      p.power=p._abilityMirror;
    }else if(Number.isFinite(p.power)&&Number.isFinite(p._abilityMirror)&&
      p.power>p._abilityMirror){
      // Older academy or AI-training code added to Power; translate to real CA.
      const increments=Math.min(20,Math.round(p.power-p._abilityMirror));
      for(let i=0;i<increments;i++)increaseOne(p);
      p.power=meanStatCA(p);
      p._abilityMirror=p.power;
    }else if(!Number.isFinite(p._abilityMirror)){
      p._abilityMirror=meanStatCA(p);
      p.power=p._abilityMirror;
    }
    // A historical level field is not part of the new saved Pokémon schema.
    delete p.level;
    delete p.gp;delete p.ca;delete p.pa;
  }
}
const abilityRows=p=>{
  const {statCA,statPA}=normalizeStatPairs(p);
  return '<div class="ca-pa-header"><span>능력치</span><span>CA · 현재</span><span>PA · 잠재</span></div>'+
    ABILITY_STATS.map(stat=>'<div class="ca-pa-row"><span>'+ABILITY_NAMES[stat]+
      '</span><b>'+statCA[stat]+'</b><b>'+statPA[stat]+'</b></div>').join('');
};
function cardMarkup(p){
  return '<div class="ca-pa-card"><strong>'+escape(p.name||p.species)+'</strong>'+
    '<div class="ca-pa-values">'+abilityRows(p)+'</div>'+
    '<small>활동 '+(p.careerSeasons||1)+'/8시즌</small></div>';
}
function updateOffice(){
  if(!game)return;
  ensureAll();
  if(typeof TRAINER_COLS!=='undefined'){
    const avg=TRAINER_COLS.find(entry=>entry[0]==='avg');
    const potential=TRAINER_COLS.find(entry=>entry[0]==='level');
    if(avg)avg[1]='평균 CA';
    if(potential)potential[1]='평균 PA';
  }
  if(typeof TLM_WEEKLY_PROGRAMS!=='undefined'){
    const program=TLM_WEEKLY_PROGRAMS.find(x=>x.id==='power');
    if(program)program.desc='훈련 2회마다 포켓몬의 능력치 하나 CA +1 · 각 PA 상한 준수';
  }
}

function enhanceRenderedCards(){
  if(!game)return;
  const c=myClub(),panel=document.getElementById('dashpanel');
  if(!c||!panel)return;
  if(tab==='pokemon'){
    const trainerList=[...(c.trainers||[]),...(c.reserveTrainers||[])].filter(Boolean);
    panel.querySelectorAll('.g-pokemon').forEach((grid,idx)=>{
      const trainer=trainerList[idx];if(!trainer)return;
      grid.innerHTML=trainer.pokemon.map(cardMarkup).join('');
    });
  }else if(tab==='profile'){
    const trainer=selectedTrainerId<5?c.trainers[selectedTrainerId]:
      (c.reserveTrainers||[])[selectedTrainerId-5];
    if(trainer){
      const cards=panel.querySelectorAll('.profile-mon');
      cards.forEach((card,i)=>{if(trainer.pokemon[i])card.innerHTML=cardMarkup(trainer.pokemon[i]);});
    }
  }else if(tab==='retirement'){
    // Legacy retired records may contain levels; don't display that progression.
    panel.querySelectorAll('.g-table').forEach(table=>{
      const heads=[...table.querySelectorAll('thead th')];
      const levelColumn=heads.findIndex(x=>x.textContent.includes('최종 레벨'));
      if(levelColumn>=0)for(const row of table.querySelectorAll('tr')){
        row.cells?.[levelColumn]?.remove();
      }
      const powerColumn=[...table.querySelectorAll('thead th')].find(x=>x.textContent.includes('전투력'));
      if(powerColumn)powerColumn.textContent='당시 평균 CA';
    });
  }
  // Other sections sometimes include legacy "Lv." labels in historical sources.
  panel.querySelectorAll('.orig-mon em').forEach(el=>el.remove());
}

const previousTrainerStat=typeof trainerStat==='function'?trainerStat:null;
if(previousTrainerStat){
  window.trainerStat=function(trainer,key){
    if(key==='avg')return Math.round(trainer.pokemon.reduce((a,p)=>a+meanStatCA(p),0)/trainer.pokemon.length);
    if(key==='level')return Math.round(trainer.pokemon.reduce((a,p)=>a+meanStatPA(p),0)/trainer.pokemon.length);
    return previousTrainerStat(trainer,key);
  };
}

const previousRenderOffice=renderOffice;
window.renderOffice=function(){
  updateOffice();
  previousRenderOffice();
  enhanceRenderedCards();
};

const previousWeekly=typeof applyWeeklyProgram==='function'?applyWeeklyProgram:null;
if(previousWeekly){
  window.applyWeeklyProgram=function(){
    const training=typeof weeklyDraft!=='undefined'&&weeklyDraft==='power';
    const growthStart=growthEvents.length;
    const done=previousWeekly();
    // The wrapped renderOffice migrates all +Power changes to real CA before
    // the old weekly program returns. The public coaching record is corrected.
    if(done&&training){
      const newGrowth=growthEvents.slice(growthStart);
      const record=game.weeklyPrograms?.at(-1);
      if(record){
        const detail=newGrowth.length?newGrowth.map(x=>
          x.name+' '+x.statName+' CA '+x.before+'→'+x.after).join(', '):
          '훈련 경험 축적';
        record.detail=record.detail.replace(/전투력 \+1/g,'개별 CA 성장')+
          ' · '+detail;
        game.log[0]=game.log[0].replace(/전투력 \+1/g,'개별 CA 성장');
        persist();
      }
      renderOffice();
    }
    return done;
  };
}

window.PokemonAbilities={
  ABILITY_STATS,ABILITY_NAMES,normalizeStatPairs,meanStatCA,meanStatPA,growStat,
  ensureAll,abilityRows,increaseOne,get migrated(){return migrationCount;}
};
if(typeof game!=='undefined'&&game)renderOffice();

const styles=document.createElement('style');
styles.textContent=[
  '#dashpanel .ca-pa-card{background:#1c3449;padding:12px;border-radius:8px;border:1px solid #3d5b70;min-width:0}',
  '#dashpanel .ca-pa-card>strong{display:block;font-size:15px;margin-bottom:9px}',
  '#dashpanel .ca-pa-card>small{display:block;color:#9dbdc9;margin-top:9px;font-size:11px}',
  '#dashpanel .ca-pa-values{display:grid;gap:3px}',
  '#dashpanel .ca-pa-header,#dashpanel .ca-pa-row{display:grid;grid-template-columns:minmax(65px,1.2fr) 1fr 1fr;gap:8px;align-items:center;font-size:12px}',
  '#dashpanel .ca-pa-header{font-size:10px;color:#a8c4d4;border-bottom:1px solid #567183;padding-bottom:5px}',
  '#dashpanel .ca-pa-row{padding:4px 0}',
  '#dashpanel .ca-pa-row b{text-align:center;font-size:13px;font-variant-numeric:tabular-nums}',
  '#dashpanel .ca-pa-row b:last-child{color:#9ce2c2}',
  '#dashpanel .g-pokemon{display:grid;grid-template-columns:repeat(auto-fit,minmax(205px,1fr));gap:10px}',
  '#dashpanel .profile-pokemon .ca-pa-card{margin:0;padding:7px;border:0}',
  '@media(max-width:650px){#dashpanel .g-pokemon{grid-template-columns:repeat(2,minmax(0,1fr))}#dashpanel .ca-pa-row{font-size:11px;gap:4px}}'
].join('');
document.head.append(styles);

// Install calendar and navigation after the ability migration wrapper.
import('./match-feedback.js').then(()=>import('./management-ui.js'));
