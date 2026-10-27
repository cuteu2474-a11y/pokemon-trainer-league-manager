/* Season record book: immutable match snapshots, actual trainer appearances and saved standings. */
(() => {
  const esc=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const id=value=>String(value);
  const currentClub=g=>(g.clubs||[]).find(c=>c.name===g.club);
  const matchId=(season,round,home,away)=>[season,round,home,away].map(id).join(':');
  const getBook=g=>g.seasonRecords||(g.seasonRecords={version:1,seasons:{}});
  function season(g,number=g.season){
    const book=getBook(g),key=id(number);
    return book.seasons[key]||(book.seasons[key]={season:Number(number),clubId:null,clubName:'',matches:[],complete:false});
  }
  function sync(g){
    if(!g?.clubs||!Number.isInteger(g.season))return false;
    const own=currentClub(g);if(!own)return false;
    const s=season(g);s.clubId??=id(own.id);s.clubName ||= own.name;
    let changed=false;
    for(let index=0;index<(g.results||[]).length;index++){
      const group=g.results[index];if(!Array.isArray(group))continue;
      for(const m of group){
        if(!m||!(id(m.home)===s.clubId||id(m.away)===s.clubId))continue;
        if(!Number.isFinite(m.aScore)||!Number.isFinite(m.bScore))continue;
        const round=index+1,key=matchId(g.season,round,m.home,m.away);
        if(s.matches.some(item=>item.id===key))continue;
        const home=g.clubs.find(c=>id(c.id)===id(m.home));
        const away=g.clubs.find(c=>id(c.id)===id(m.away));
        s.matches.push({id:key,round,homeId:id(m.home),awayId:id(m.away),
          homeName:home?.name||'기록 없음',awayName:away?.name||'기록 없음',
          homeDivision:home?.division??null,awayDivision:away?.division??null,
          homeScore:m.aScore,awayScore:m.bScore,engine:m.engine||'fast',trainers:[],pokemon:[]});
        changed=true;
      }
    }
    s.matches.sort((a,b)=>a.round-b.round);
    for(const report of g.trainerAI?.careerReports||[]){
      if(Number(report.season)!==Number(g.season))continue;
      const match=s.matches.find(item=>item.id===report.key);
      if(match&&saveParticipants(match,report))changed=true;
    }
    const latest=g.lastMatch;
    if(latest?.replay&&s.matches.length){
      const match=s.matches.find(item=>item.round===g.round&&id(item.homeId)===id(latest.home)&&id(item.awayId)===id(latest.away));
      if(match){
        if(match.engine!=='showdown'){match.engine='showdown';changed=true;}
        if(savePokemon(match,latest.replay))changed=true;
      }
    }
    return changed;
  }
  function saveParticipants(match,report){
    if(!report||match.id!==report.key||!Array.isArray(report.participants))return false;
    if(match.trainers.length)return false; // A completed match must never grant duplicate appearances.
    const entries=report.participants.map(p=>({
      id:String(p.id??p.trainerId??''),name:String(p.name||'기록 없음'),
      clubId:id(p.clubId),slot:Number(p.slot)||0,
      duels:Math.max(0,Number(p.duels)||0),wins:Math.max(0,Number(p.wins)||0),
      losses:Math.max(0,Number(p.losses)||0)
    })).filter(p=>p.id&&p.duels>0);
    if(!entries.length)return false;
    match.trainers=entries;
    match.engine='showdown';
    return true;
  }
  function savePokemon(match,result){
    if(!result?.report||!result?.teams||
      id(result.home)!==match.homeId||id(result.away)!==match.awayId)return false;
    if(!Array.isArray(result.report.home)||!Array.isArray(result.report.away)||
      !Array.isArray(result.teams.home)||!Array.isArray(result.teams.away))return false;
    match.pokemon ||= [];
    if(match.pokemon.length)return false;
    const found=new Map(),ambiguous=new Set();
    for(const side of ['home','away']){
      const clubId=side==='home'?match.homeId:match.awayId;
      const used=new Set();
      for(const record of result.report[side]){
        if(record?.pokemonId==null||!Number.isInteger(record.trainerSlot)||
          !Number.isInteger(record.entries)||record.entries<=0||
          !Number.isFinite(record.damage)||record.damage<0||
          !Number.isInteger(record.knockouts)||record.knockouts<0)continue;
        const pokemonId=id(record.pokemonId),trainer=result.teams[side][record.trainerSlot];
        const roster=trainer?.team;
        if(!pokemonId||!Array.isArray(roster))continue;
        const matches=roster.filter(mon=>id(mon.pokemonId)===pokemonId&&mon.name===record.name);
        // Never assign achievements to the wrong duplicate Pokémon or trainer.
        if(matches.length!==1||used.has(pokemonId)){ambiguous.add(pokemonId);continue;}
        used.add(pokemonId);
        if(found.has(pokemonId)){ambiguous.add(pokemonId);continue;}
        const mon=matches[0];
        found.set(pokemonId,{id:pokemonId,name:mon.displayName||record.displayName||mon.name,
          battleName:mon.name,clubId,trainerId:trainer.uid==null?null:id(trainer.uid),
          trainerName:trainer.name||record.trainer||'기록 없음',
          entries:record.entries,damage:record.damage,knockouts:record.knockouts});
      }
    }
    for(const value of ambiguous)found.delete(value);
    if(!found.size)return false;
    match.pokemon=[...found.values()];
    match.engine='showdown';
    return true;
  }
  function capture(g,p,report){
    if(!g||!report)return false;
    sync(g);
    const s=season(g,p.season),item=s.matches.find(m=>m.id===report.key);
    if(!item)return false;
    const trainers=saveParticipants(item,report),pokemon=savePokemon(item,p.result);
    return trainers||pokemon;
  }
  function finalize(g,number){
    const s=getBook(g).seasons[id(number)];
    if(!s)return false;
    s.complete=true;
    return true;
  }
  function trainerStats(g,number){
    const s=getBook(g).seasons[id(number)];if(!s)return [];
    const stats=new Map();
    for(const match of s.matches)for(const t of match.trainers){
      if(id(t.clubId)!==s.clubId)continue;
      const key=t.id,prev=stats.get(key)||{id:key,name:t.name,matches:0,duels:0,wins:0,losses:0,allKills:0};
      prev.matches++;prev.duels+=t.duels;prev.wins+=t.wins;prev.losses+=t.losses;
      if(t.wins===5)prev.allKills++;
      stats.set(key,prev);
    }
    return [...stats.values()].sort((a,b)=>b.wins-a.wins||b.duels-a.duels||a.name.localeCompare(b.name,'ko'));
  }
  function pokemonStats(g,number){
    const s=getBook(g).seasons[id(number)];if(!s)return [];
    const stats=new Map();
    for(const match of s.matches)for(const p of match.pokemon||[]){
      if(id(p.clubId)!==s.clubId)continue;
      const previous=stats.get(p.id)||{id:p.id,name:p.name,trainerName:p.trainerName,
        trainerId:p.trainerId,trainerNames:[],matches:0,entries:0,damage:0,knockouts:0};
      previous.matches++;previous.entries+=p.entries;previous.damage+=p.damage;
      previous.knockouts+=p.knockouts;
      if(p.trainerName&&!previous.trainerNames.includes(p.trainerName))previous.trainerNames.push(p.trainerName);
      stats.set(p.id,previous);
    }
    return [...stats.values()].sort((a,b)=>b.knockouts-a.knockouts||b.damage-a.damage||a.name.localeCompare(b.name,'ko'));
  }
  function career(g,kind,uid){
    if(!['trainer','pokemon'].includes(kind)||uid==null||!id(uid).trim())return null;
    const key=id(uid),fields=kind==='trainer'?
      ['matches','duels','wins','losses','allKills']:['matches','entries','damage','knockouts'];
    const rows=Object.values(getBook(g).seasons).map(s=>{
      const record=(kind==='trainer'?trainerStats(g,s.season):pokemonStats(g,s.season))
        .find(row=>row.id===key);
      return record?{...record,season:s.season,clubName:s.clubName}:null;
    }).filter(Boolean).sort((a,b)=>b.season-a.season);
    const totals=Object.fromEntries(fields.map(field=>[field,rows.reduce((sum,row)=>sum+row[field],0)]));
    return {id:key,kind,rows,totals,recordedSeasons:rows.length};
  }
  const trainerCareer=(g,uid)=>career(g,'trainer',uid);
  const pokemonCareer=(g,uid)=>career(g,'pokemon',uid);
  function careerButton(kind,uid,label='통산 경력'){
    if(uid==null||!id(uid).trim())return '';
    return '<button type="button" class="tlm-career-link" data-tlm-career-kind="'+kind+
      '" data-tlm-career-id="'+esc(uid)+'">'+esc(label)+'</button>';
  }
  function careerHTML(g,kind,uid,name){
    const record=career(g,kind,uid);
    if(!record)return '<p class="g-muted">이 대상의 고유 ID가 없어 실전 경력을 연결할 수 없습니다.</p>';
    const trainer=kind==='trainer',totals=record.totals;
    const blocks=trainer?
      [['단체전 출전',totals.matches],['주자 대결',totals.duels],['주자 승리',totals.wins],['올킬',totals.allKills]]:
      [['단체전 출전',totals.matches],['교체·등장',totals.entries],['직접 피해',Math.round(totals.damage)],['직접 격파',totals.knockouts]];
    const header=trainer?'<tr><th>시즌</th><th>당시 소속</th><th>단체전</th><th>주자 대결</th><th>승-패</th><th>올킬</th></tr>':
      '<tr><th>시즌</th><th>당시 소속</th><th>담당 트레이너</th><th>단체전</th><th>교체·등장</th><th>직접 피해</th><th>직접 격파</th></tr>';
    const rows=record.rows.map(row=>trainer?
      '<tr><td>'+row.season+'</td><td>'+esc(row.clubName)+'</td><td>'+row.matches+'</td><td>'+row.duels+'</td><td>'+row.wins+'-'+row.losses+'</td><td>'+row.allKills+'</td></tr>':
      '<tr><td>'+row.season+'</td><td>'+esc(row.clubName)+'</td><td>'+esc(row.trainerNames.join(' · '))+'</td><td>'+row.matches+'</td><td>'+row.entries+'</td><td>'+Math.round(row.damage)+'</td><td>'+row.knockouts+'</td></tr>').join('');
    const empty=trainer?'실제 출전 기록 없음':'개체 ID가 확인된 전투 기록 없음';
    return '<section class="tlm-career"><h3>'+esc(name||record.rows[0]?.name||'개인')+' · 통산 실전 경력</h3>'+
      '<div class="tlm-career-stats">'+blocks.map(([title,value])=>'<div><small>'+title+'</small><strong>'+value+'</strong></div>').join('')+'</div>'+
      '<div class="league-table-scroll"><table class="g-table"><thead>'+header+'</thead><tbody>'+
      (rows||'<tr><td colspan="'+(trainer?6:7)+'">'+empty+'</td></tr>')+'</tbody></table></div>'+
      '<p class="g-muted">우리 구단의 저장된 Showdown 실전 기록만 합산합니다. 이적 전 다른 구단에서 치른 경기와 식별값 없는 과거 경기는 포함하지 않습니다.'+
      (trainer?' 올킬은 한 단체전에서 상대 트레이너 5명을 모두 이긴 경우입니다.':' 직접 피해·격파에는 상태이상·날씨 등 간접 피해를 합산하지 않습니다.')+'</p></section>';
  }
  function historicalTables(g,number){
    const previous=g.leagueSeasons?.[number];
    if(previous?.tables?.length===4)return previous;
    if(Number(number)===Number(g.season)&&window.LeagueStandings?.table)
      return {season:g.season,tables:[0,1,2,3].map(d=>window.LeagueStandings.table(g,d)),movement:[]};
    return null;
  }
  function html(g,number,division){
    // Older saves may have results but no record-book field yet.
    sync(g);
    const book=getBook(g),available=new Set(Object.keys(book.seasons).map(Number));
    for(const k of Object.keys(g.leagueSeasons||{}))available.add(Number(k));
    available.add(g.season);
    const years=[...available].filter(Number.isInteger).sort((a,b)=>b-a);
    const selected=years.includes(Number(number))?Number(number):years[0];
    const s=book.seasons[id(selected)],archive=historicalTables(g,selected);
    const clubs=g.clubs||[],chosen=Number.isInteger(Number(division))&&Number(division)>=0&&Number(division)<4?Number(division):currentClub(g)?.division||0;
    const rows=archive?.tables?.[chosen]||[];
    const movement=archive?.movement||[];
    const actual=trainerStats(g,selected),pokemon=pokemonStats(g,selected);
    const fixtures=s?.matches||[];
    const games=fixtures.map(m=>{
      const mineHome=m.homeId===s.clubId;
      const own=mineHome?m.homeScore:m.awayScore,foe=mineHome?m.awayScore:m.homeScore;
      const outcome=own===foe?'무':own>foe?'승':'패';
      return '<tr><td>'+m.round+'R</td><td>'+esc(mineHome?m.awayName:m.homeName)+'</td><td>'+m.homeScore+' : '+m.awayScore+'</td><td>'+outcome+'</td><td>'+(m.engine==='showdown'?'실전 연승전':'간이 경기')+'</td></tr>';
    }).join('');
    const tableRows=rows.map(r=>{
      const move=movement.find(m=>id(m.id)===id(r.id));
      const completed=Number(selected)!==Number(g.season)||g.round===18;
      const note=move?(move.to<move.from?'승격':'강등'):r.rank===1?(completed?'우승':'선두'):'—';
      return '<tr><td>'+r.rank+'</td><td>'+esc(r.name)+'</td><td>'+r.played+'</td><td>'+r.won+'-'+r.drawn+'-'+r.lost+'</td><td>'+r.points+'</td><td>'+note+'</td></tr>';
    }).join('');
    const trainerRows=actual.map(t=>'<tr><td>'+esc(t.name)+' '+careerButton('trainer',t.id)+'</td><td>'+t.matches+'</td><td>'+t.duels+'</td><td>'+t.wins+'-'+t.losses+'</td><td>'+t.allKills+'</td></tr>').join('');
    const pokemonRows=pokemon.map(p=>'<tr><td>'+esc(p.name)+' <small class="g-muted" title="'+esc(p.id)+'">#'+esc(p.id.slice(-8))+'</small> '+careerButton('pokemon',p.id)+'</td><td>'+esc(p.trainerNames.join(' · '))+'</td><td>'+p.matches+'</td><td>'+p.entries+'</td><td>'+Math.round(p.damage)+'</td><td>'+p.knockouts+'</td></tr>').join('');
    const caveat=fixtures.length&&!actual.length?'기존 기록에는 실제 출전 자료가 없어 임의로 선수 기록을 만들지 않았습니다.':'등록만 하고 출전하지 않은 트레이너는 집계하지 않습니다.';
    return '<div class="eyebrow">LEAGUE ARCHIVE / SEASON RECORDS</div><h2>시즌 기록실</h2>'+ 
      '<p class="g-muted">지난 시즌의 결과는 이적·은퇴 뒤에도 당시 이름과 소속으로 보존합니다.</p>'+ 
      '<div class="tlm-record-filters"><label>시즌 <select id="tlm-record-season">'+years.map(y=>'<option value="'+y+'"'+(selected===y?' selected':'')+'>'+y+'시즌'+(y===g.season?' · 진행 중':'')+'</option>').join('')+'</select></label>'+ 
      '<label>부 <select id="tlm-record-division">'+[0,1,2,3].map(d=>'<option value="'+d+'"'+(chosen===d?' selected':'')+'>'+(d+1)+'부</option>').join('')+'</select></label></div>'+ 
      '<h3>'+selected+'시즌 · '+(chosen+1)+'부 순위'+(archive?.movement?.length?' / 승강 확정':'')+'</h3>'+ 
      '<div class="league-table-scroll"><table class="g-table"><thead><tr><th>순위</th><th>구단</th><th>경기</th><th>승-무-패</th><th>승점</th><th>결과</th></tr></thead><tbody>'+(tableRows||'<tr><td colspan="6">순위 기록 없음</td></tr>')+'</tbody></table></div>'+ 
      '<h3>우리 구단 경기 ('+fixtures.length+'/18)</h3><div class="league-table-scroll"><table class="g-table"><thead><tr><th>R</th><th>상대</th><th>홈 : 원정</th><th>결과</th><th>계산</th></tr></thead><tbody>'+(games||'<tr><td colspan="5">경기 기록 없음</td></tr>')+'</tbody></table></div>'+ 
      '<h3>실제 출전 트레이너</h3><div class="league-table-scroll"><table class="g-table"><thead><tr><th>이름</th><th>단체전 출전</th><th>주자 대결</th><th>승-패</th><th>올킬</th></tr></thead><tbody>'+(trainerRows||'<tr><td colspan="5">실제 출전 기록 없음</td></tr>')+'</tbody></table></div>'+ 
      '<h3>실제 출전 포켓몬</h3><div class="league-table-scroll"><table class="g-table"><thead><tr><th>개체</th><th>당시 트레이너</th><th>단체전 출전</th><th>교체·등장</th><th>직접 피해</th><th>직접 격파</th></tr></thead><tbody>'+(pokemonRows||'<tr><td colspan="6">개체 ID가 확인된 전투 기록 없음</td></tr>')+'</tbody></table></div>'+ 
      '<p class="g-muted">'+caveat+' 포켓몬별 수치는 실제 전투 보고서의 개체 ID와 원래 출전 명단이 일치할 때만 기록합니다. 독·날씨 등 간접 피해에 의한 기절은 직접 격파로 계산하지 않습니다. 지난 전투의 대용량 재생 로그는 보존하지 않습니다.</p>';
  }
  const api={season,sync,capture,finalize,trainerStats,pokemonStats,trainerCareer,pokemonCareer,careerHTML,savePokemon,historicalTables,html};
  window.SeasonRecords=api;
  if(typeof persist==='function'){
    const previous=persist;
    persist=function(...args){if(typeof game!=='undefined'&&game)sync(game);return previous(...args);};
  }
  if(typeof startNewSeason==='function'){
    const previous=startNewSeason;
    startNewSeason=function(...args){
      const g=typeof game!=='undefined'?game:null,year=g?.season;
      if(g)sync(g);
      const result=previous(...args);
      if(g&&game?.season!==year){finalize(game,year);persist();}
      return result;
    };
  }
  if(window.TrainerCareer?.applyMatch){
    const previous=window.TrainerCareer.applyMatch;
    window.TrainerCareer.applyMatch=function(g,p,...args){
      const report=previous(g,p,...args);
      if(report)capture(g,p,report);
      return report;
    };
  }
  if(typeof renderOffice==='function'&&typeof document!=='undefined'){
    const previous=renderOffice;
    let selectedSeason=null,selectedDivision=null;
    let selectedCareer=null;
    function showCareer(kind,uid){
      if(!game||!['trainer','pokemon'].includes(kind)||uid==null||!id(uid).trim())return;
      selectedCareer={kind,uid:id(uid),from:tab==='career'?(selectedCareer?.from||'records'):tab};
      tab='career';renderOffice();
    }
    api.showCareer=showCareer;
    if(typeof document.addEventListener==='function')document.addEventListener('click',event=>{
      const careerLink=event.target?.closest?.('[data-tlm-career-kind][data-tlm-career-id]');
      if(careerLink){event.preventDefault();showCareer(careerLink.dataset.tlmCareerKind,careerLink.dataset.tlmCareerId);return;}
      if(event.target?.closest?.('[data-tlm-career-back]')){
        event.preventDefault();tab=selectedCareer?.from||'records';selectedCareer=null;renderOffice();
      }
    });
    if(document.head?.appendChild&&document.createElement){
      const style=document.createElement('style');
      style.textContent='.tlm-career{margin:18px 0;padding:14px;background:#102338;border:1px solid #446078;border-radius:8px}'+
        '.tlm-career h3{margin:0 0 12px;color:#c5ebf8}.tlm-career-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:16px}'+
        '.tlm-career-stats>div{background:#091b2d;border:1px solid #38546a;padding:10px;border-radius:6px}'+
        '.tlm-career-stats small{display:block;color:#a9c7d4;font-size:11px}.tlm-career-stats strong{display:block;font-size:20px;margin-top:5px}'+
        '.tlm-career-link{margin:4px 0;padding:5px 8px;background:#153951;color:#a6f0e8;border:1px solid #4c908e;border-radius:5px;cursor:pointer;font-size:11px}'+
        '.tlm-career-link:hover,.tlm-career-link:focus-visible{background:#245b6b}.tlm-career .league-table-scroll{overflow-x:auto}'+
        '@media(max-width:560px){.tlm-career-stats{grid-template-columns:repeat(2,minmax(0,1fr))}}';
      document.head.appendChild(style);
    }
    renderOffice=function(...args){
      const result=previous(...args);
      if(!game)return result;
      const nav=document.querySelector('#dashboard .dashnav');
      if(nav&&!nav.querySelector('#tlm-record-tab'))
        nav.insertAdjacentHTML('beforeend','<button id="tlm-record-tab" onclick="setTab(\'records\')">기록실</button>');
      if(tab==='records'){
        const panel=document.getElementById('dashpanel');
        if(panel){
          const year=selectedSeason??game.season,division=selectedDivision??currentClub(game)?.division??0;
          panel.innerHTML=html(game,year,division);
          const s=panel.querySelector('#tlm-record-season'),d=panel.querySelector('#tlm-record-division');
          s.onchange=e=>{selectedSeason=Number(e.target.value);renderOffice();};
          d.onchange=e=>{selectedDivision=Number(e.target.value);renderOffice();};
        }
      }
      if(tab==='profile'){
        const entries=typeof allTrainers==='function'?allTrainers(currentClub(game)||{}):[];
        const entry=entries.find(e=>e.id===selectedTrainerId)||entries[0];
        const profile=document.querySelector('#dashpanel .trainer-profile');
        if(profile&&entry?.trainer){
          const t=entry.trainer;
          const actions=profile.querySelector('.profile-actions');
          const section=careerHTML(game,'trainer',t.uid,t.name);
          if(actions)actions.insertAdjacentHTML('beforebegin',section);
          else profile.insertAdjacentHTML('beforeend',section);
          profile.querySelectorAll('.pkm-profile-card').forEach((node,index)=>{
            const p=t.pokemon?.[index];if(p?.uid!=null)node.insertAdjacentHTML('beforeend',careerButton('pokemon',p.uid));
          });
        }
      }
      if(tab==='pokemon'){
        const club=currentClub(game),roster=[...(club?.trainers||[]),...(club?.reserveTrainers||[])]
          .filter(Boolean).flatMap(t=>t.pokemon||[]);
        document.querySelectorAll('#dashpanel .pkm-owned-card').forEach((node,index)=>{
          const p=roster[index];if(p?.uid!=null)node.insertAdjacentHTML('beforeend',careerButton('pokemon',p.uid));
        });
      }
      if(tab==='career'&&selectedCareer){
        const panel=document.getElementById('dashpanel');
        if(panel){
          const {kind,uid,from}=selectedCareer;
          panel.innerHTML='<div class="profile-navigation"><button type="button" class="g-btn alt" data-tlm-career-back>← '+
            (from==='profile'?'트레이너 프로필':from==='pokemon'?'포켓몬 명단':from==='pokemonDetail'?'포켓몬 상세':'시즌 기록실')+'</button><span>PLAYER / CAREER</span></div>'+ 
            careerHTML(game,kind,uid);
        }
      }
      return result;
    };
  }
})();
