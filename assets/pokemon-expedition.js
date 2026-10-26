/* Trainer-led Pokémon expeditions. Persistent, deterministic, one-week research and capture. */
(function(){
  if(window.PokemonExpedition)return;
  if(typeof document==='undefined'||typeof renderOffice!=='function')return;

  const REGIONS={
    관동:['피카츄','가디','이브이','고오스','모래두지','콘팡','구구','니드런♀','코일','쏘드라','크랩','꼬부기','파이리','이상해씨','미뇽','스라크'],
    성도:['치코리타','리아코','브케인','메리프','우파','통통코','깜지곰','무우마','마릴','애버라스','헤라크로스','델빌','글라이거','에이팜'],
    호연:['랄토스','포챠나','테일로','버섯꼬','물짱이','아차모','나무지기','가보리','메탕','꼴깍몬','캐스퐁','파비코','플러시','마이농','톱치','갈모매','고래왕자','대굴레오','사랑동이'],
    신오:['꼬링크','찌르꼬','비버니','이어롤','꼬지지','딥상어동','리오르','브이젤','흔들풍손','스콜피','모부기','불꽃숭이','팽도리','눈쓰개'],
    하나:['주리비얀','뚜꾸리','수댕이','콩둘기','줄뮤마','깜눈크','곤율랭','마디네','치라미','모노두','터검니','코고미','불켜미','두더류','프로토가','탱그릴','맘복치'],
    칼로스:['도치마론','푸호꼬','개구마르','목도리키텔','파르빗','화살꼬빈','분이벌레','판짱','미끄메라','음뱃','냐스퍼','호바귀','티고라스','완철포','수레기','거북손손'],
    알로라:['나몰빼미','냐오불','누리공','콕코구리','영구스','턱지충이','오기지게','암멍이','시마사리','머드나기','자마슈','짜랑꼬','하랑우탄','달콤아','모래꿍','약어리'],
    가라르:['흥나숭','염버니','울머기','파라꼬','탐리스','두루지벌레','멍파치','태우지네','마빌크','두랄루돈','드라꼰','돌헨진','어치르돈','찌로꼬치','윽우지'],
    팔데아:['나오하','뜨아거','꾸왁스','맛보돈','타랜툴라','콩알뚜기','빠모','카르본','바다그다','떨구새','맨돌핀','터벅고래','드니차','모토마']
  };
  const RARE=new Set(['미뇽','스라크','애버라스','헤라크로스','메탕','딥상어동','리오르','모노두','터검니','미끄메라','티고라스','짜랑꼬','두랄루돈','드라꼰','드니차']);
  const UNCOMMON=new Set(['이브이','가디','고오스','코일','쏘드라','마릴','깜지곰','델빌','랄토스','물짱이','아차모','나무지기','파비코','톱치','꼬링크','모부기','팽도리','불꽃숭이','곤율랭','코고미','불켜미','푸호꼬','개구마르','판짱','음뱃','나몰빼미','냐오불','누리공','암멍이','마빌크','카르본','나오하','뜨아거','꾸왁스']);
  const FOCUSES={
    balanced:{label:'균형 탐색',description:'전반적인 발견·포획 확률을 유지합니다.'},
    growth:{label:'성장 잠재력',description:'즉시 전력보다 성장 가능성이 높은 개체를 노립니다.'},
    power:{label:'즉시 전력',description:'현재 능력이 높은 개체를 중점적으로 찾습니다.'},
    rare:{label:'희귀 종 집중',description:'희귀 종 탐색 비중을 높이지만 발견·포획 난도가 상승합니다.'}
  };
  // Curated GAME encounter ecology; not Pokémon's official encounter tables.
  // Species can live in several habitats, but each encounter pool has unique species.
  const HABITATS={
    grass:'풀숲',forest:'숲',sea:'바다',cave:'동굴',mountain:'산지'
  };
  const TIMES={
    morning:'아침 (06:00~11:00)',day:'낮 (11:00~18:00)',
    evening:'저녁 (18:00~22:00)',night:'밤 (22:00~06:00)'
  };
  const BIOMES={
    관동:{
      grass:['피카츄','가디','이브이','구구','니드런♀','파이리'],
      forest:['콘팡','피카츄','이상해씨','스라크','이브이'],
      sea:['쏘드라','크랩','꼬부기','미뇽'],
      cave:['고오스','코일','모래두지','미뇽'],
      mountain:['모래두지','가디','니드런♀','스라크']
    },
    성도:{
      grass:['메리프','통통코','에이팜','치코리타','브케인'],
      forest:['깜지곰','헤라크로스','치코리타','에이팜','통통코'],
      sea:['리아코','우파','마릴'],
      cave:['무우마','글라이거','애버라스'],
      mountain:['애버라스','델빌','글라이거','깜지곰']
    },
    호연:{
      grass:['포챠나','테일로','플러시','마이농','아차모'],
      forest:['버섯꼬','랄토스','나무지기','파비코','캐스퐁'],
      sea:['물짱이','갈모매','고래왕자','대굴레오','사랑동이'],
      cave:['가보리','메탕','톱치','꼴깍몬'],
      mountain:['가보리','톱치','파비코','메탕']
    },
    신오:{
      grass:['꼬링크','찌르꼬','비버니','이어롤','모부기'],
      forest:['이어롤','모부기','리오르','흔들풍손','찌르꼬'],
      sea:['팽도리','브이젤','비버니'],
      cave:['딥상어동','스콜피','흔들풍손','리오르'],
      mountain:['딥상어동','눈쓰개','스콜피','리오르']
    },
    하나:{
      grass:['주리비얀','뚜꾸리','콩둘기','줄뮤마','치라미'],
      forest:['마디네','곤율랭','코고미','주리비얀','콩둘기'],
      sea:['수댕이','프로토가','탱그릴','맘복치'],
      cave:['두더류','모노두','터검니','불켜미'],
      mountain:['두더류','터검니','코고미','모노두']
    },
    칼로스:{
      grass:['도치마론','파르빗','화살꼬빈','분이벌레','푸호꼬'],
      forest:['판짱','냐스퍼','호바귀','도치마론','분이벌레'],
      sea:['개구마르','완철포','수레기','거북손손'],
      cave:['음뱃','미끄메라','티고라스','냐스퍼'],
      mountain:['티고라스','음뱃','미끄메라','목도리키텔']
    },
    알로라:{
      grass:['나몰빼미','냐오불','콕코구리','영구스','달콤아'],
      forest:['나몰빼미','자마슈','하랑우탄','짜랑꼬','달콤아'],
      sea:['누리공','시마사리','모래꿍','약어리'],
      cave:['오기지게','턱지충이','짜랑꼬','머드나기'],
      mountain:['암멍이','짜랑꼬','머드나기','오기지게']
    },
    가라르:{
      grass:['흥나숭','염버니','파라꼬','탐리스','멍파치'],
      forest:['흥나숭','두루지벌레','태우지네','마빌크','파라꼬'],
      sea:['울머기','찌로꼬치','윽우지','어치르돈'],
      cave:['드라꼰','돌헨진','두랄루돈','어치르돈'],
      mountain:['두랄루돈','돌헨진','드라꼰','태우지네']
    },
    팔데아:{
      grass:['나오하','뜨아거','맛보돈','타랜툴라','콩알뚜기'],
      forest:['나오하','빠모','카르본','콩알뚜기','떨구새'],
      sea:['꾸왁스','바다그다','맨돌핀','떨구새'],
      cave:['카르본','드니차','모토마','터벅고래'],
      mountain:['드니차','터벅고래','모토마','빠모']
    }
  };
  const NIGHT_ACTIVE=new Set([
    '고오스','무우마','델빌','포챠나','꼴깍몬','흔들풍손','스콜피',
    '불켜미','모노두','음뱃','호바귀','자마슈','모래꿍','드라꼰',
    '카르본','고래왕자'
  ]);
  const MORNING_ACTIVE=new Set([
    '구구','테일로','파비코','찌르꼬','콩둘기','화살꼬빈','콕코구리',
    '파라꼬','윽우지','떨구새'
  ]);
  const EVENING_ACTIVE=new Set([
    '가디','깜지곰','헤라크로스','랄토스','버섯꼬','리오르','냐스퍼',
    '짜랑꼬','암멍이','두랄루돈','맨돌핀'
  ]);
  const MAX_WEEKLY=2,BASE_COST=15000,REMOTE_COST=25000;
  const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
  const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  function hash(input){
    let h=2166136261;
    for(const ch of String(input))h=Math.imul(h^ch.charCodeAt(0),16777619)>>>0;
    return h>>>0;
  }
  function localRng(seed){
    let state=seed>>>0;
    return ()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  }
  const tier=name=>RARE.has(name)?'희귀':UNCOMMON.has(name)?'드묾':'보통';
  function talent(t){
    const scout=t.pokemonScouting ||= {};
    if(!Number.isInteger(scout.skill))
      scout.skill=clamp(Math.round(4+Number(t.tactics||10)*.36+
        Number(t.switching||10)*.27+(hash(t.uid??t.name)%5)-2),1,20);
    if(!Number.isInteger(scout.experience))scout.experience=0;
    if(!Array.isArray(scout.history))scout.history=[];
    return scout;
  }
  function teamMembers(c){
    return c.trainers.map((trainer,slot)=>({trainer,slot,kind:'active'}))
      .concat((c.reserveTrainers||[]).map((trainer,slot)=>({trainer,slot,kind:'reserve'})))
      .filter(x=>x.trainer&&Array.isArray(x.trainer.pokemon)&&x.trainer.pokemon.length===6);
  }
  const keyOf=t=>String(t?.uid??('legacy:'+t?.id+':'+t?.name));
  const findTrainer=key=>teamMembers(myClub()).find(entry=>keyOf(entry.trainer)===String(key));
  function data(){const g=game;g.pokemonScout ||= {season:g.season,week:g.week,missions:0,history:[],selectedTrainer:'',region:'',focus:'balanced'};return g.pokemonScout;}
  function cost(region){return BASE_COST+(region===worldClubRegion(myClub())?0:REMOTE_COST);}
  function weekCount(){
    return teamMembers(myClub()).filter(({trainer})=>{
      const task=trainer.pokemonScouting?.mission;
      return task?.season===game.season&&task?.week===game.week;
    }).length;
  }
  function optionStats(region,focus,skill=10){
    const rare=focus==='rare',discovery=clamp(.89+skill*.004-(rare?.12:0),.3,.98);
    const capture=clamp(.66+skill*.012-(rare?.09:0),.3,.94);
    return {discovery,capture};
  }
  function pickEncounter(region,focus,rand){
    const names=REGIONS[region],weights=names.map(name=>{
      const type=tier(name);
      return type==='희귀'?(focus==='rare'?14:3):
        type==='드묾'?(focus==='rare'?7:15):(focus==='rare'?3:26);
    });
    const max=weights.reduce((sum,v)=>sum+v,0);
    let roll=rand()*max;
    for(let i=0;i<names.length;i++){roll-=weights[i];if(roll<0)return names[i];}
    return names.at(-1);
  }
  function candidatePokemon(name,focus,skill,rand,season){
    const rarity=tier(name);
    let ca=(rarity==='희귀'?59:rarity==='드묾'?51:43)+Math.floor(rand()*21)+Math.round(skill*.35);
    const potential=19+Math.floor(rand()*36)+(focus==='growth'?18:0)+(rarity==='희귀'?8:0);
    ca=clamp(ca+(focus==='power'?8:0),1,110);
    const pa=clamp(ca+potential,ca,200);
    return {name,level:clamp(24+Math.floor(rand()*17)+(focus==='power'?5:0),1,100),
      power:ca,ca,pa,careerSeasons:1,debutSeason:season,
      source:'wild-scout',scoutRarity:rarity};
  }
  function outcome(mission,skill,season){
    const rand=localRng(mission.seed);
    const odds=optionStats(mission.region,mission.focus,skill);
    if(rand()>=odds.discovery)
      return {status:'not-found',reason:'탐색했지만 포켓몬을 발견하지 못했습니다.'};
    const name=pickEncounter(mission.region,mission.focus,rand);
    const rarity=tier(name);
    const catchChance=clamp(odds.capture-(rarity==='희귀'?.19:rarity==='드묾'?.08:0),.25,.94);
    if(rand()>=catchChance)return {status:'escaped',name,rarity,
      reason:name+' 발견에 성공했지만 포획에는 실패했습니다.'};
    return {status:'captured',name,rarity,candidate:candidatePokemon(name,mission.focus,skill,rand,season),
      reason:name+' 포획 성공 · 트레이너가 교체 후보로 보관 중입니다.'};
  }
  function suggestedSlot(trainer,mon){
    const preferences=trainer.autonomyAI?.preferredPlay||'balanced';
    const futureBias=preferences==='endurance'?.32:.22;
    const rating=p=>Number(p.power??p.ca??50)+futureBias*Math.max(0,
      Number(p.pa??p.power??50)-Number(p.power??p.ca??50))-
      Math.max(0,Number(p.careerSeasons||1)-5)*1.5;
    let worst=0;
    for(let i=1;i<trainer.pokemon.length;i++)
      if(rating(trainer.pokemon[i])<rating(trainer.pokemon[worst]))worst=i;
    return {slot:worst,gain:Math.round(rating(mon)-rating(trainer.pokemon[worst]))};
  }
  function dispatch(trainerKey,region,focus){
    if(!game)return {ok:false,error:'진행 중인 게임이 없습니다.'};
    if(!Object.hasOwn(REGIONS,region)||!Object.hasOwn(FOCUSES,focus))
      return {ok:false,error:'지역 또는 탐색 목적을 확인하세요.'};
    const record=findTrainer(trainerKey);
    if(!record)return {ok:false,error:'해당 트레이너가 현재 구단에 없습니다.'};
    const t=record.trainer,s=talent(t),due=cost(region);
    if(s.candidate)return {ok:false,error:'이미 포획한 후보가 있습니다. 먼저 등록하거나 보내 주세요.'};
    if(s.mission?.status==='travel')return {ok:false,error:'이미 해당 트레이너가 탐색 중입니다.'};
    if(s.mission?.season===game.season&&s.mission.week===game.week)
      return {ok:false,error:'이 트레이너는 이번 주에 이미 탐색했습니다.'};
    if(weekCount()>=MAX_WEEKLY)return {ok:false,error:'이번 주 탐색은 2명까지 파견할 수 있습니다.'};
    if(game.coins<due)return {ok:false,error:'파견 운영비가 부족합니다.'};
    // Record the expedition and deduct costs atomically. No instant rerolls.
    s.mission={status:'travel',season:game.season,week:game.week,region,focus,
      cost:due,seed:hash([game.seed,game.season,game.week,keyOf(t),region,focus].join(':'))};
    game.coins-=due;
    data().missions++;
    game.log.unshift(t.name+' '+region+' 포켓몬 탐색 출발 · '+FOCUSES[focus].label);
    persist();renderOffice();
    return {ok:true,mission:s.mission};
  }
  function resolveOne(t){
    const s=talent(t),m=s.mission;
    if(!m||m.status!=='travel')return null;
    if(game.season<m.season||(game.season===m.season&&game.week<=m.week))return null;
    const result=outcome(m,s.skill,game.season);
    m.status=result.status;m.result=result.reason;
    if(result.candidate){
      s.candidate=result.candidate;
      const chosen=suggestedSlot(t,s.candidate);
      m.recommendation=chosen;
    }
    s.experience++;
    if(s.experience>=4&&s.skill<20){s.experience=0;s.skill++;}
    const item={season:game.season,week:game.week,trainer:t.name,region:m.region,
      focus:m.focus,status:result.status,description:result.reason,
      name:result.name||null};
    s.history.unshift(item);s.history.length=Math.min(s.history.length,12);
    const state=data();state.history.unshift(item);state.history.length=Math.min(state.history.length,60);
    game.log.unshift(t.name+' 탐색 결과 · '+result.reason);
    return item;
  }
  function resolvePlayer(){
    if(!game)return [];
    const results=[];
    for(const {trainer} of teamMembers(myClub())){
      const item=resolveOne(trainer);
      if(item)results.push(item);
    }
    return results;
  }
  function recruit(key,slot){
    const record=findTrainer(key);
    if(!record)return {ok:false,error:'트레이너가 소속 구단에 없습니다.'};
    const t=record.trainer,s=talent(t),candidate=s.candidate;
    if(!candidate)return {ok:false,error:'대기 중인 포획 후보가 없습니다.'};
    if(!Number.isInteger(slot)||slot<0||slot>=6||t.pokemon.length!==6)
      return {ok:false,error:'교체할 기존 포켓몬을 선택하세요.'};
    if(!confirm(t.name+'의 '+t.pokemon[slot].name+'을(를) 팀에서 내보내고 '+candidate.name+
      '을(를) 등록할까요?\n기존 포켓몬은 되돌릴 수 없습니다.'))return {ok:false,error:'등록 취소'};
    const old=t.pokemon[slot];t.pokemon[slot]=candidate;delete s.candidate;
    game.releasedPokemon ||= [];
    game.releasedPokemon.unshift({season:game.season,week:game.week,
      club:myClub().name,trainer:t.name,name:old.name,
      power:old.power,careerSeasons:old.careerSeasons,reason:'탐색 포켓몬 등록'});
    game.releasedPokemon.length=Math.min(game.releasedPokemon.length,80);
    game.scout=(Number(game.scout)||0)+1;
    game.log.unshift(t.name+' 포켓몬 등록: '+old.name+' → '+candidate.name+' · 6마리 유지');
    persist();renderOffice();
    return {ok:true,replaced:old,registered:candidate};
  }
  function dismiss(key){
    const record=findTrainer(key);
    if(!record)return {ok:false,error:'트레이너를 찾을 수 없습니다.'};
    const s=talent(record.trainer);
    if(!s.candidate)return {ok:false,error:'후보 포켓몬이 없습니다.'};
    if(!confirm(s.candidate.name+' 포켓몬을 포획 후보에서 제외할까요?'))return {ok:false,error:'취소'};
    const removed=s.candidate;delete s.candidate;
    game.log.unshift(record.trainer.name+' · '+removed.name+' 포획 후보 제외');
    persist();renderOffice();
    return {ok:true};
  }
  function missionDone(m){return m&&m.status!=='travel';}
  function display(trainer){
    const scout=talent(trainer),m=scout.mission,cand=scout.candidate;
    const key=keyOf(trainer);
    const state=m?.status==='travel'?'탐색 중 · 다음 주 결과':
      cand?'포획 성공 · 등록 대기':missionDone(m)&&m.season===game.season&&m.week===game.week?
        '이번 주 탐색 완료': '파견 가능';
    const suggestion=cand?suggestedSlot(trainer,cand):null;
    const rows=cand?'<section class="ps-candidate"><strong>포획 보고: '+esc(cand.name)+'</strong>'+
      '<p>Lv.'+cand.level+' · 현재 능력 '+cand.ca+' / 성장 잠재력 '+cand.pa+
      ' · '+esc(cand.scoutRarity)+' · '+FOCUSES[m?.focus||'balanced'].label+'</p>'+
      '<p>트레이너의 추천: '+(suggestion.gain>0?'교체를 긍정적으로 검토':
        '현재 선수단을 유지하는 편이 유리할 수 있음')+
      ' · 추천 교체 대상 '+esc(trainer.pokemon[suggestion.slot].name)+
      ' (평가차 '+(suggestion.gain>=0?'+':'')+suggestion.gain+')</p>'+
      '<label>등록 시 팀에서 제외할 포켓몬<select id="ps-slot-'+esc(key)+'">'+
      trainer.pokemon.map((p,i)=>'<option value="'+i+'" '+(i===suggestion.slot?'selected':'')+'>'+
        esc(p.name)+' · 전력 '+esc(p.power)+' · 활동 '+esc(p.careerSeasons||1)+'/8시즌</option>').join('')+
      '</select></label><div class="ps-actions"><button data-ps-recruit="'+esc(key)+'" type="button">확인 후 팀 등록</button>'+
      '<button data-ps-dismiss="'+esc(key)+'" type="button">후보 보내기</button></div></section>':'';
    return '<div class="ps-trainer"><div><b>'+esc(trainer.name)+'</b>'+
      '<small>탐색 능력 '+scout.skill+'/20 · 경험 '+scout.experience+'/4 · 포켓몬 6마리</small>'+
      '</div><span>'+state+'</span></div>'+
      (m?'<p class="ps-mission">최근 탐색: '+esc(m.region)+' · '+esc(FOCUSES[m.focus]?.label||'균형 탐색')+
      ' · '+(m.status==='travel'?'다음 주 완료 예정':esc(m.result||'결과 없음'))+'</p>':'')+rows;
  }
  function render(){
    if(!game)return '';
    const members=teamMembers(myClub());
    const cfg=data();
    if(!findTrainer(cfg.selectedTrainer))cfg.selectedTrainer=keyOf(members[0]?.trainer);
    if(!Object.hasOwn(REGIONS,cfg.region))cfg.region=worldClubRegion(myClub());
    if(!Object.hasOwn(FOCUSES,cfg.focus))cfg.focus='balanced';
    const current=findTrainer(cfg.selectedTrainer);
    const scouting=members.map(({trainer},index)=>
      '<div class="ps-person">'+display(trainer)+'</div>').join('');
    const opts=(items,selected)=>Object.entries(items).map(([value,label])=>
      '<option value="'+esc(value)+'" '+(value===selected?'selected':'')+'>'+esc(label)+'</option>').join('');
    const history=(cfg.history||[]).slice(0,8).map(item=>
      '<div class="ps-history"><span>'+esc(item.season)+'시즌 '+esc(item.week)+
      '주 · '+esc(item.trainer)+' · '+esc(item.region)+'</span><p>'+esc(item.description)+'</p></div>').join('');
    return '<div class="eyebrow">TRAINER / POKÉMON EXPLORATION</div>'+
      '<h2>트레이너 포켓몬 탐색</h2>'+
      '<p class="g-muted">단장이 파견 방향을 정하면 트레이너가 직접 탐색·포획을 시도합니다. 결과는 다음 주에 도착하며, 트레이너 고유의 탐색 능력과 경험이 성공률에 영향을 줍니다. 단순한 포켓몬 뽑기나 개별 구매 기능이 아닙니다.</p>'+
      '<div class="g-grid"><div class="g-stat"><small>이번 주 파견</small><b>'+weekCount()+'/'+MAX_WEEKLY+'명</b></div>'+
      '<div class="g-stat"><small>탐색 누적 기록</small><b>'+cfg.missions+'건</b></div>'+
      '<div class="g-stat"><small>확정 등록</small><b>'+(game.scout||0)+'마리</b></div>'+
      '<div class="g-stat"><small>구단 예산</small><b>'+wonReadable(game.coins)+'</b></div></div>'+
      '<section class="ps-selection"><h3>포켓몬 탐색 파견</h3>'+
      '<div class="ps-form"><label>파견 트레이너<select id="ps-trainer">'+
      opts(Object.fromEntries(members.map(({trainer})=>[keyOf(trainer),trainer.name+
        ' · 탐색 '+talent(trainer).skill+'/20'])),cfg.selectedTrainer)+'</select></label>'+
      '<label>탐색 지역<select id="ps-region">'+opts(
        Object.fromEntries(Object.keys(REGIONS).map(k=>[k,k+'지방'])),cfg.region)+'</select></label>'+
      '<label>탐색 방향<select id="ps-focus">'+opts(
        Object.fromEntries(Object.entries(FOCUSES).map(([k,v])=>[k,v.label])),cfg.focus)+'</select></label></div>'+
      '<p class="ps-info">'+esc(FOCUSES[cfg.focus]?.description)+' · 방문 지역에 따라 발견 가능한 포켓몬이 달라집니다.</p>'+
      '<p class="ps-info">파견 비용: <b>'+wonReadable(cost(cfg.region))+'</b> · 트레이너당 주 1회 · 구단당 주 2명 · 다음 주 결과 확정</p>'+
      '<button type="button" class="g-btn" id="ps-send" '+(weekCount()>=MAX_WEEKLY||
        !current||game.coins<cost(cfg.region)||current.trainer.pokemonScouting?.candidate||
        (current.trainer.pokemonScouting?.mission?.status==='travel')||
        (current.trainer.pokemonScouting?.mission?.season===game.season&&
         current.trainer.pokemonScouting?.mission?.week===game.week)?'disabled':'')+
      '>트레이너 탐색 파견</button></section>'+
      '<section class="ps-team"><h3>트레이너별 탐색 진행 상황</h3>'+
      (scouting||'<p>소속 트레이너가 없습니다.</p>')+'</section>'+
      '<section class="ps-timeline"><h3>최근 탐색 결과</h3>'+
      (history||'<p class="g-muted">첫 탐색을 파견하면 여기에서 결과를 확인할 수 있습니다.</p>')+
      '</section>';
  }
  function attach(){
    if(!game)return;
    const nav=document.querySelectorAll('#dashboard .dashnav button');
    for(const el of nav)if(el.textContent.trim()==='스카우트')el.textContent='포켓몬 탐색';
    if(tab!=='scout')return;
    const panel=document.getElementById('dashpanel');if(!panel)return;
    panel.innerHTML=render();
    const cfg=data();
    const bind=(id,field)=>panel.querySelector(id)?.addEventListener('change',e=>{
      cfg[field]=e.target.value;
      persist();renderOffice();
    });
    bind('#ps-trainer','selectedTrainer');bind('#ps-region','region');bind('#ps-focus','focus');
    panel.querySelector('#ps-send')?.addEventListener('click',()=>{
      const result=dispatch(cfg.selectedTrainer,cfg.region,cfg.focus);
      if(!result.ok)alert(result.error);
    });
    panel.querySelectorAll('[data-ps-recruit]').forEach(button=>{
      button.addEventListener('click',()=>{
        const key=button.getAttribute('data-ps-recruit');
        const slot=Number(panel.querySelector('#ps-slot-'+CSS.escape(key))?.value);
        const result=recruit(key,slot);
        if(!result.ok&&result.error!=='등록 취소')alert(result.error);
      });
    });
    panel.querySelectorAll('[data-ps-dismiss]').forEach(button=>{
      button.addEventListener('click',()=>{
        const result=dismiss(button.getAttribute('data-ps-dismiss'));
        if(!result.ok&&result.error!=='취소')alert(result.error);
      });
    });
  }
  const previousRender=renderOffice;
  renderOffice=function(){
    previousRender();
    attach();
  };
  const previousNextWeek=nextWeek;
  nextWeek=function(){
    const season=game?.season,week=game?.week;
    previousNextWeek();
    if(!game||(game.season===season&&game.week===week))return;
    const results=resolvePlayer();
    if(results.length){persist();renderOffice();}
  };
  const style=document.createElement('style');
  style.textContent=[
    '#dashpanel .ps-selection,#dashpanel .ps-team,#dashpanel .ps-timeline{background:#182e43;border:1px solid #365268;border-radius:9px;padding:15px;margin:16px 0}',
    '#dashpanel .ps-form{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:10px 0}',
    '#dashpanel .ps-form label,#dashpanel .ps-candidate label{display:grid;gap:6px;color:#b7d2df;font-size:12px}',
    '#dashpanel .ps-form select,#dashpanel .ps-candidate select{padding:9px;min-width:0;width:100%;color:#f4fafc;background:#234257;border:1px solid #5d7c91;border-radius:6px}',
    '#dashpanel .ps-selection h3,#dashpanel .ps-team h3,#dashpanel .ps-timeline h3{margin:0 0 12px;font-size:17px}',
    '#dashpanel .ps-info,#dashpanel .ps-mission{color:#bbccd9;font-size:12px;line-height:1.7}',
    '#dashpanel .ps-person{border-top:1px solid #3a5668;padding:13px 0}',
    '#dashpanel .ps-person:first-of-type{border-top:0}',
    '#dashpanel .ps-trainer{display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap}',
    '#dashpanel .ps-trainer small{display:block;color:#a2c8d4;font-size:11px;margin-top:4px}',
    '#dashpanel .ps-trainer>span{color:#9ce3c4;font-size:12px}',
    '#dashpanel .ps-candidate{background:#203d4b;border:1px solid #427b7c;border-radius:7px;padding:12px;margin-top:8px}',
    '#dashpanel .ps-candidate p{font-size:12px;line-height:1.7;color:#c3d7dd}',
    '#dashpanel .ps-actions{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 0}',
    '#dashpanel .ps-actions button{padding:9px 13px;border-radius:5px;background:#23516e;color:white;border:1px solid #5b8ba1;cursor:pointer}',
    '#dashpanel .ps-history{border-top:1px solid #3b5269;padding:9px 0;font-size:12px}',
    '#dashpanel .ps-history span{color:#a9dcca}#dashpanel .ps-history p{margin:5px 0;color:#c1d0da;line-height:1.6}',
    '@media(max-width:700px){#dashpanel .ps-form{grid-template-columns:1fr}#dashpanel .ps-selection,#dashpanel .ps-team,#dashpanel .ps-timeline{padding:11px}}'
  ].join('');
  document.head.append(style);
  window.PokemonExpedition={
    REGIONS,FOCUSES,MAX_WEEKLY,tier,talent,outcome,optionStats,suggestedSlot,
    keyOf,findTrainer,dispatch,recruit,dismiss,resolvePlayer,render,data,weekCount,cost,
  };
  if(game)renderOffice();
})();
