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
    growth:{label:'성장 개체 관찰',description:'개체별 성장 잠재력은 포획 후 개체 감별로 결정됩니다. 높은 PA는 보장되지 않습니다.'},
    power:{label:'전력 개체 관찰',description:'실제 전투력은 포획 후 개별 CA와 종족값으로 결정됩니다. 높은 CA는 보장되지 않습니다.'},
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
  // National Pokédex base-stat totals for the curated encounter pools, derived
  // from the pinned @pkmn/sim species data (not an extra per-individual bonus).
  const BASE_STAT_TOTALS={"가디":350,"가보리":330,"갈모매":270,"개구마르":314,"거북손손":306,"고래왕자":400,"고오스":310,"곤율랭":348,"구구":251,"글라이거":430,"깜눈크":292,"깜지곰":330,"꼬링크":263,"꼬부기":314,"꼬지지":290,"꼴깍몬":302,"꾸왁스":310,"나몰빼미":320,"나무지기":310,"나오하":310,"냐스퍼":355,"냐오불":320,"누리공":320,"눈쓰개":334,"니드런♀":275,"달콤아":210,"대굴레오":290,"델빌":330,"도치마론":313,"돌헨진":470,"두더류":328,"두랄루돈":535,"두루지벌레":180,"드니차":320,"드라꼰":270,"딥상어동":300,"떨구새":485,"뚜꾸리":308,"뜨아거":310,"랄토스":198,"리아코":314,"리오르":285,"마디네":260,"마릴":250,"마빌크":270,"마이농":405,"맘복치":470,"맛보돈":254,"맨돌핀":315,"머드나기":385,"멍파치":270,"메리프":280,"메탕":300,"모노두":300,"모래꿍":320,"모래두지":300,"모부기":318,"모토마":501,"목도리키텔":289,"무우마":435,"물짱이":310,"미끄메라":300,"미뇽":300,"바다그다":245,"버섯꼬":295,"분이벌레":200,"불꽃숭이":309,"불켜미":275,"브이젤":330,"브케인":309,"비버니":250,"빠모":240,"사랑동이":330,"수댕이":308,"수레기":320,"스라크":500,"스콜피":330,"시마사리":305,"쏘드라":295,"아차모":310,"암멍이":280,"애버라스":300,"약어리":175,"어치르돈":505,"에이팜":360,"염버니":310,"영구스":253,"오기지게":338,"완철포":330,"우파":210,"울머기":310,"윽우지":475,"음뱃":245,"이브이":325,"이상해씨":318,"이어롤":350,"자마슈":285,"주리비얀":308,"줄뮤마":295,"짜랑꼬":300,"찌로꼬치":280,"찌르꼬":245,"치라미":300,"치코리타":318,"카르본":255,"캐스퐁":420,"코고미":305,"코일":325,"콕코구리":265,"콘팡":305,"콩둘기":264,"콩알뚜기":210,"크랩":325,"타랜툴라":210,"탐리스":275,"태우지네":305,"탱그릴":335,"터검니":320,"터벅고래":334,"턱지충이":300,"테일로":270,"톱치":290,"통통코":250,"티고라스":362,"파라꼬":245,"파르빗":237,"파비코":310,"파이리":309,"판짱":348,"팽도리":314,"포챠나":220,"푸호꼬":307,"프로토가":355,"플러시":405,"피카츄":320,"하랑우탄":490,"헤라크로스":500,"호바귀":335,"화살꼬빈":278,"흔들풍손":348,"흥나숭":310};
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
    // Legacy captureSkill becomes the appraisal talent; discovery and catching
    // both use skill. Migration never rerolls existing talent or candidates.
    if(!Number.isInteger(scout.appraisalSkill))
      scout.appraisalSkill=Number.isInteger(scout.captureSkill)?
        clamp(scout.captureSkill,1,20):clamp(Math.round(3+Number(t.switching||10)*.47+
        Number(t.tactics||10)*.21+(hash(String(t.uid??t.name)+':capture')%5)-2),1,20);
    if(!Number.isInteger(scout.experience))scout.experience=0;
    if(!Number.isInteger(scout.appraisalExperience))
      scout.appraisalExperience=Math.max(0,Number(scout.captureExperience)||0);
    if(scout.talentModelVersion!==2){
      delete scout.captureSkill;delete scout.captureExperience;
      scout.talentModelVersion=2;
    }
    if(!Array.isArray(scout.history))scout.history=[];
    return scout;
  }
  function teamMembers(c){
    return c.trainers.map((trainer,slot)=>({trainer,slot,kind:'active'}))
      .concat((c.reserveTrainers||[]).map((trainer,slot)=>({trainer,slot,kind:'reserve'})))
      .filter(x=>x.trainer&&Array.isArray(x.trainer.pokemon)&&x.trainer.pokemon.length<=6);
  }
  const MAX_HELD=12;
  function collection(t){
    if(!Array.isArray(t.pokemon))t.pokemon=[];
    if(!Array.isArray(t.pokemonReserve))t.pokemonReserve=[];
    if(t.pokemon.length>6)t.pokemonReserve.unshift(...t.pokemon.splice(6));
    return {active:t.pokemon,reserve:t.pokemonReserve,
      count:t.pokemon.length+t.pokemonReserve.length};
  }
  function rosterLocked(){return !!window.MatchRegistration?.locked(myClub().id);}
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
  function skillsOf(skills=10){
    const n=Number(typeof skills==='object'&&skills!==null?skills.skill:skills);
    const a=Number(typeof skills==='object'&&skills!==null?
      (skills.appraisalSkill??skills.captureSkill??skills.skill):skills);
    return {skill:clamp(Number.isFinite(n)?n:10,1,20),
      appraisalSkill:clamp(Number.isFinite(a)?a:10,1,20)};
  }
  function optionStats(region,focus,skills=10,habitat='grass',time='day'){
    const {skill}=skillsOf(skills);
    const rare=focus==='rare';
    const discovery=clamp(.89+skill*.004-(rare?.12:0)-
      (habitat==='sea'?.025:0)-(time==='night'?.02:0),.3,.98);
    const capture=clamp(.66+skill*.012-(rare?.09:0)-
      (habitat==='cave'?.02:0),.3,.94);
    return {discovery,capture};
  }
  function timeWeight(name,time){
    if(NIGHT_ACTIVE.has(name))
      return time==='night'?3.0:time==='evening'?1.8:.3;
    if(MORNING_ACTIVE.has(name))
      return time==='morning'?2.8:time==='day'?1.1:.35;
    if(EVENING_ACTIVE.has(name))
      return time==='evening'?2.5:time==='night'?1.2:.5;
    return time==='morning'?1.0:time==='day'?1.6:time==='evening'?.8:.4;
  }
  function encounterWeights(region,focus,habitat='grass',time='day',skills=10,legacy=false){
    if(!Object.hasOwn(BIOMES,region)||!Object.hasOwn(HABITATS,habitat)||
      !Object.hasOwn(TIMES,time)||!Object.hasOwn(FOCUSES,focus))
      throw new RangeError('지역·생태계·시간·탐색 방향이 올바르지 않습니다.');
    const ability=skillsOf(skills).skill;
    return BIOMES[region][habitat].map(name=>{
      const rarity=tier(name);
      const base=rarity==='희귀'?(focus==='rare'?14:3):
        rarity==='드묾'?(focus==='rare'?7:15):(focus==='rare'?3:26);
      const bst=BASE_STAT_TOTALS[name];
      const boost=legacy?1:1+((ability-1)/19)*clamp((bst-300)/300,0,1);
      return {name,rarity,weight:base*timeWeight(name,time)*boost};
    });
  }
  function captureChance(rarity,stats){
    return clamp(stats.capture-(rarity==='희귀'?.19:rarity==='드묾'?.08:0),.25,.94);
  }
  /** Exact unrounded probabilities used for both UI and the actual RNG draws. */
  function encounterTable(region,habitat='grass',time='day',focus='balanced',skills=10){
    const entries=encounterWeights(region,focus,habitat,time,skills);
    const total=entries.reduce((sum,x)=>sum+x.weight,0);
    const stats=optionStats(region,focus,skills,habitat,time);
    const pokemon=entries.map(x=>{
      const rate=x.weight/total;
      const chance=captureChance(x.rarity,stats);
      return {name:x.name,rarity:x.rarity,
        encounterRate:rate,findRate:stats.discovery*rate,
        captureRate:stats.discovery*rate*chance,captureIfFound:chance};
    });
    return {region,habitat,time,focus,...skillsOf(skills),findChance:stats.discovery,
      noEncounterChance:1-stats.discovery,pokemon,
      totalCaptureChance:pokemon.reduce((sum,x)=>sum+x.captureRate,0)};
  }
  function pickEncounter(region,focus,rand,habitat='grass',time='day',skills=10,legacy=false){
    const weights=encounterWeights(region,focus,habitat,time,skills,legacy);
    const max=weights.reduce((sum,x)=>sum+x.weight,0);
    let roll=rand()*max;
    for(const entry of weights){roll-=entry.weight;if(roll<0)return entry.name;}
    return weights.at(-1).name;
  }
  function legacyCandidatePokemon(name,focus,skill,rand,season){
    const rarity=tier(name);
    let ca=(rarity==='희귀'?59:rarity==='드묾'?51:43)+Math.floor(rand()*21)+Math.round(skill*.35);
    const potential=19+Math.floor(rand()*36)+(focus==='growth'?18:0)+(rarity==='희귀'?8:0);
    ca=clamp(ca+(focus==='power'?8:0),1,110);
    const pa=clamp(ca+potential,ca,200);
    const statCA={},statPA={};
    for(const stat of ['hp','atk','def','spa','spd','spe']){
      const now=clamp(ca+Math.round((rand()-.5)*18),1,200);
      const cap=clamp(pa+Math.round((rand()-.5)*18),now,200);
      statCA[stat]=now;
      statPA[stat]=cap;
    }
    return {name,statCA,statPA,careerSeasons:1,debutSeason:season,
      source:'wild-scout',scoutRarity:rarity};
  }
  function candidatePokemon(name,appraisalSkill,rand,season){
    const a=(clamp(appraisalSkill,1,20)-1)/19;
    const statCA={},statPA={};
    for(const stat of ['hp','atk','def','spa','spd','spe']){
      const tierRoll=rand();
      const [min,max]=tierRoll<.70-.20*a?[50,110]:
        tierRoll<.95-.10*a?[111,160]:[161,200];
      const pa=min+Math.floor(rand()*(max-min+1));
      statPA[stat]=pa;
      statCA[stat]=Math.max(1,Math.min(pa,Math.floor(pa*(.40+.30*rand()+.10*a))));
    }
    return {name,statCA,statPA,careerSeasons:1,debutSeason:season,
      source:'wild-scout',scoutRarity:tier(name)};
  }
  function outcome(mission,skills,season){
    const rand=localRng(mission.seed);
    const habitat=mission.habitat||'grass',time=mission.time||'day';
    // Snapshot dispatched abilities so an in-flight trainer's later growth cannot
    // silently change the probabilities shown when the manager approved this trip.
    const legacy=mission.rulesVersion!=='expedition-v2';
    const used=mission.scoutSkill!=null?
      skillsOf({skill:mission.scoutSkill,
        appraisalSkill:mission.appraisalSkill??mission.captureSkill??mission.scoutSkill}):
      skillsOf(skills);
    const odds=optionStats(mission.region,mission.focus,
      legacy?{skill:mission.scoutSkill??used.skill,
        appraisalSkill:mission.captureSkill??used.appraisalSkill}:used,habitat,time);
    if(legacy){
      odds.capture=clamp(.66+(mission.captureSkill??used.appraisalSkill)*.012-
        (mission.focus==='rare'?.09:0)-(habitat==='cave'?.02:0),.3,.94);
    }
    if(rand()>=odds.discovery)
      return {status:'not-found',reason:'탐색했지만 포켓몬을 발견하지 못했습니다.'};
    const name=pickEncounter(mission.region,mission.focus,rand,habitat,time,used,legacy);
    const rarity=tier(name);
    const catchChance=captureChance(rarity,odds);
    if(rand()>=catchChance)return {status:'escaped',name,rarity,
      reason:name+' 발견에 성공했지만 포획에는 실패했습니다.'};
    return {status:'captured',name,rarity,candidate:legacy?
      legacyCandidatePokemon(name,mission.focus,used.skill,rand,season):
      candidatePokemon(name,used.appraisalSkill,rand,season),
      reason:name+' 포획 성공 · 트레이너가 교체 후보로 보관 중입니다.'};
  }
  function suggestedSlot(trainer,mon){
    const {active}=collection(trainer);
    if(!active.length)return {slot:0,gain:0};
    const preferences=trainer.autonomyAI?.preferredPlay||'balanced';
    const futureBias=preferences==='endurance'?.32:.22;
    const rating=p=>{
      const ca=p.statCA?Object.values(p.statCA).reduce((a,b)=>a+b,0)/6:
        Number(p.power??p.ca??50);
      const pa=p.statPA?Object.values(p.statPA).reduce((a,b)=>a+b,0)/6:
        Number(p.pa??ca);
      return ca+futureBias*Math.max(0,pa-ca)-
        Math.max(0,Number(p.careerSeasons||1)-5)*1.5;
    };
    let worst=0;
    for(let i=1;i<active.length;i++)
      if(rating(active[i])<rating(active[worst]))worst=i;
    return {slot:worst,gain:Math.round(rating(mon)-rating(active[worst]))};
  }
  function dispatch(trainerKey,region,focus,habitat='grass',time='day'){
    if(!game)return {ok:false,error:'진행 중인 게임이 없습니다.'};
    if(!Object.hasOwn(REGIONS,region)||!Object.hasOwn(FOCUSES,focus)||
      !Object.hasOwn(HABITATS,habitat)||!Object.hasOwn(TIMES,time))
      return {ok:false,error:'지역·생태계·시간대·탐색 목적을 확인하세요.'};
    const record=findTrainer(trainerKey);
    if(!record)return {ok:false,error:'해당 트레이너가 현재 구단에 없습니다.'};
    if(window.MatchRegistration?.locked(myClub().id))return {ok:false,error:'경기 결과 확인 후 변경할 수 있습니다.'};
    const allowed=window.SquadCondition?.canDispatch(record.trainer,record.kind);if(allowed&&!allowed.ok)return allowed;
    const t=record.trainer,s=talent(t),due=cost(region);
    if(collection(t).count>=MAX_HELD)return {ok:false,error:'최대 12마리 보유 중입니다. 보관 명단을 정리한 뒤 파견하세요.'};
    if(s.candidate)return {ok:false,error:'이미 포획한 후보가 있습니다. 먼저 등록하거나 보내 주세요.'};
    if(s.mission?.status==='travel')return {ok:false,error:'이미 해당 트레이너가 탐색 중입니다.'};
    if(s.mission?.season===game.season&&s.mission.week===game.week)
      return {ok:false,error:'이 트레이너는 이번 주에 이미 탐색했습니다.'};
    if(weekCount()>=MAX_WEEKLY)return {ok:false,error:'이번 주 탐색은 2명까지 파견할 수 있습니다.'};
    if(window.ClubFinance){const checked=ClubFinance.canSpend(due);if(!checked.ok)return {ok:false,error:checked.reason};}
    if(game.coins<due)return {ok:false,error:'파견 운영비가 부족합니다.'};
    // Record the expedition and deduct costs atomically. No instant rerolls.
    s.mission={status:'travel',rulesVersion:'expedition-v2',
      season:game.season,week:game.week,region,focus,
      habitat,time,cost:due,scoutSkill:s.skill,appraisalSkill:s.appraisalSkill,
      seed:hash([game.seed,game.season,game.week,keyOf(t),region,habitat,time,focus].join(':'))};
    if(window.ClubFinance)ClubFinance.spend(due,'expedition:'+game.season+':'+game.week+':'+keyOf(t),'포켓몬 탐색 파견');else game.coins-=due;
    data().missions++;
    game.log.unshift(t.name+' '+region+' · '+HABITATS[habitat]+' · '+TIMES[time]+' 포켓몬 탐색 출발 · '+FOCUSES[focus].label);
    persist();renderOffice();
    return {ok:true,mission:s.mission};
  }
  function resolveOne(t,reportToPlayer=true){
    const s=talent(t),m=s.mission;
    if(!m||m.status!=='travel')return null;
    if(game.season<m.season||(game.season===m.season&&game.week<=m.week))return null;
    const result=outcome(m,{skill:s.skill,appraisalSkill:s.appraisalSkill},game.season);
    m.status=result.status;m.result=result.reason;
    if(result.candidate){
      if(Number.isInteger(t.uid)){result.candidate.ownerTrainerId=String(t.uid);game.nextPokemonUID=(game.nextPokemonUID||0)+1;result.candidate.uid='pokemon:'+game.nextPokemonUID;}
      s.candidate=result.candidate;
      const chosen=suggestedSlot(t,s.candidate);
      m.recommendation=chosen;
    }
    s.experience++;
    if(s.experience>=4){s.experience=0;if(s.skill<20)s.skill++;}
    if(result.status==='captured'){
      s.appraisalExperience++;
      if(s.appraisalExperience>=4){
        s.appraisalExperience=0;
        if(s.appraisalSkill<20)s.appraisalSkill++;
      }
    }
    const item={season:game.season,week:game.week,trainer:t.name,region:m.region,
      habitat:m.habitat||'grass',time:m.time||'day',
      focus:m.focus,status:result.status,description:result.reason,
      name:result.name||null};
    s.history.unshift(item);s.history.length=Math.min(s.history.length,12);
    if(reportToPlayer){
      const state=data();state.history.unshift(item);state.history.length=Math.min(state.history.length,60);
      game.log.unshift(t.name+' 탐색 결과 · '+result.reason);
    }
    return item;
  }
  /** AI clubs spend their own budgets and use reserve trainers, never match starters. */
  function resolveAI(){
    if(!game)return [];
    const clock=game.season+':'+game.week;
    if(game.aiPokemonScoutWeek===clock)return [];
    const finished=[];
    for(const club of game.clubs){
      if(club.id===myClub().id)continue;
      const staff=teamMembers(club).filter(entry=>entry.kind==='reserve');
      for(const {trainer} of staff){
        const report=resolveOne(trainer,false);
        if(!report)continue;
        finished.push({...report,club:club.name});
        const scout=talent(trainer),held=collection(trainer),candidate=scout.candidate;
        if(!candidate||held.count>=MAX_HELD)continue;
        const proposed=suggestedSlot(trainer,candidate);
        if(held.active.length<6)held.active.push(candidate);
        else if(proposed.gain>5){held.reserve.push(held.active[proposed.slot]);held.active[proposed.slot]=candidate;}
        else held.reserve.push(candidate);
        delete scout.candidate;
      }
      const region=worldClubRegion(club);
      if(!Object.hasOwn(BIOMES,region)||!staff.length)continue;
      const h=hash([game.seed,clock,club.id,'AI-expedition'].join(':'));
      if(h%3!==0)continue;
      const eligible=staff.filter(({trainer})=>{
        const s=talent(trainer),held=collection(trainer);
        return held.count<MAX_HELD&&!s.candidate&&s.mission?.status!=='travel'&&
          !(s.mission?.season===game.season&&s.mission?.week===game.week);
      });
      if(!eligible.length)continue;
      const wallet=typeof clubIdentity==='function'?clubIdentity(club):null;
      if(!wallet||!Number.isFinite(wallet.budget)||wallet.budget<BASE_COST)continue;
      const trainer=eligible[h%eligible.length].trainer,s=talent(trainer);
      const habitat=Object.keys(HABITATS)[(h>>>8)%Object.keys(HABITATS).length];
      const time=Object.keys(TIMES)[(h>>>13)%Object.keys(TIMES).length];
      const focus=s.skill>=16?'rare':'balanced';
      s.mission={status:'travel',rulesVersion:'expedition-v2',season:game.season,
        week:game.week,region,focus,habitat,time,cost:BASE_COST,
        scoutSkill:s.skill,appraisalSkill:s.appraisalSkill,
        seed:hash([game.seed,clock,club.id,keyOf(trainer),habitat,time,focus].join(':'))};
      wallet.budget-=BASE_COST;
      if(typeof aiRecord==='function')aiRecord(club,'포켓몬 탐색',
        trainer.name+' · '+region+' · '+HABITATS[habitat]+' 파견',false);
    }
    game.aiPokemonScoutWeek=clock;
    return finished;
  }
  function resolvePlayer(){
    if(!game)return [];
    const results=[];
    for(const {trainer} of teamMembers(myClub())){
      const item=resolveOne(trainer);
      if(item)results.push(item);
    }
    resolveAI();
    return results;
  }
  function recruit(key,slot){
    const record=findTrainer(key);
    if(!record)return {ok:false,error:'트레이너가 소속 구단에 없습니다.'};
    if(rosterLocked())return {ok:false,error:'경기 결과 확인 후 변경할 수 있습니다.'};
    const t=record.trainer,s=talent(t),candidate=s.candidate;
    if(!candidate)return {ok:false,error:'대기 중인 포획 후보가 없습니다.'};
    const held=collection(t);
    if(held.count>=MAX_HELD)return {ok:false,error:'보유 12마리입니다. 후보를 등록하려면 먼저 보관 포켓몬을 방출하세요.'};
    if(slot!==undefined&&slot!==null&&(!Number.isInteger(slot)||slot<0||slot>=held.active.length))
      return {ok:false,error:'교체할 출전 포켓몬을 확인하세요.'};
    if(candidate.ownerTrainerId!=null&&String(candidate.ownerTrainerId)!==String(t.uid))
      return {ok:false,error:'포획한 트레이너가 일치하지 않습니다.'};
    candidate.ownerTrainerId=String(t.uid);
    let replaced=null;
    if(held.active.length<6)held.active.push(candidate);
    else if(slot!==undefined&&slot!==null){
      replaced=held.active[slot];held.active[slot]=candidate;held.reserve.push(replaced);
    }else held.reserve.push(candidate);
    delete s.candidate;
    game.scout=(Number(game.scout)||0)+1;
    game.log.unshift(t.name+' 포켓몬 등록: '+candidate.name+
      (replaced?' 출전 · '+replaced.name+' 보관':' 보유 명단 등록')+
      ' · 보유 '+collection(t).count+'/'+MAX_HELD+'마리');
    persist();renderOffice();
    return {ok:true,replaced,registered:candidate};
  }
  function swap(key,reserveIndex,slot){
    const record=findTrainer(key);
    if(!record)return {ok:false,error:'트레이너를 찾을 수 없습니다.'};
    if(rosterLocked())return {ok:false,error:'경기 결과 확인 후 편성을 변경할 수 있습니다.'};
    const {active,reserve}=collection(record.trainer);
    if(!Number.isInteger(reserveIndex)||reserveIndex<0||reserveIndex>=reserve.length||
      !Number.isInteger(slot)||slot<0||slot>=6)return {ok:false,error:'교체할 포켓몬을 선택하세요.'};
    const replacement=reserve[reserveIndex];
    if(String(replacement.ownerTrainerId)!==String(record.trainer.uid))
      return {ok:false,error:'다른 트레이너의 포켓몬은 출전시킬 수 없습니다.'};
    if(slot<active.length)[active[slot],reserve[reserveIndex]]=[replacement,active[slot]];
    else if(slot===active.length){active.push(replacement);reserve.splice(reserveIndex,1);}
    else return {ok:false,error:'출전 순서를 건너뛸 수 없습니다.'};
    game.log.unshift(record.trainer.name+' 출전 편성 변경 · '+replacement.name+' 출전');
    persist();renderOffice();return {ok:true};
  }
  function releaseReserve(key,index){
    const record=findTrainer(key);
    if(!record)return {ok:false,error:'트레이너를 찾을 수 없습니다.'};
    if(rosterLocked())return {ok:false,error:'경기 결과 확인 후 변경할 수 있습니다.'};
    const {reserve}=collection(record.trainer),state=data();
    if(!Number.isInteger(index)||index<0||index>=reserve.length)return {ok:false,error:'보관 포켓몬을 선택하세요.'};
    const mon=reserve[index],token=key+':'+String(mon.uid??index);
    if(state.pendingRelease!==token){state.pendingRelease=token;persist();renderOffice();return {ok:true,pending:true};}
    state.pendingRelease=null;
    reserve.splice(index,1);
    game.releasedPokemon ||= [];
    game.releasedPokemon.unshift({season:game.season,week:game.week,
      club:myClub().name,trainer:record.trainer.name,name:mon.name,uid:mon.uid,
      statCA:mon.statCA,statPA:mon.statPA,careerSeasons:mon.careerSeasons,reason:'감독 승인 방출'});
    game.releasedPokemon.length=Math.min(game.releasedPokemon.length,80);
    game.log.unshift(record.trainer.name+' 보관 포켓몬 '+mon.name+' 방출');
    persist();renderOffice();return {ok:true,released:mon};
  }
  function dismiss(key){
    const record=findTrainer(key);
    if(!record)return {ok:false,error:'트레이너를 찾을 수 없습니다.'};
    const s=talent(record.trainer);
    if(!s.candidate)return {ok:false,error:'후보 포켓몬이 없습니다.'};
    if(data().pendingDismiss!==key){data().pendingDismiss=key;persist();renderOffice();return {ok:true,pending:true};}
    data().pendingDismiss=null;
    const removed=s.candidate;delete s.candidate;
    game.log.unshift(record.trainer.name+' · '+removed.name+' 포획 후보 제외');
    persist();renderOffice();
    return {ok:true};
  }
  function missionDone(m){return m&&m.status!=='travel';}
  function display(trainer){
    const scout=talent(trainer),m=scout.mission,cand=scout.candidate;
    const held=collection(trainer);
    const key=keyOf(trainer);
    const state=m?.status==='travel'?'탐색 중 · 다음 주 결과':
      cand?'포획 성공 · 등록 대기':missionDone(m)&&m.season===game.season&&m.week===game.week?
        '이번 주 탐색 완료': '파견 가능';
    const suggestion=cand?suggestedSlot(trainer,cand):null;
    const rows=cand?'<section class="ps-candidate"><strong>포획 보고: '+esc(cand.name)+'</strong>'+
      '<p>능력치별 CA/PA · '+esc(cand.scoutRarity)+' · '+
      FOCUSES[m?.focus||'balanced'].label+'</p>'+
      '<div class="ps-stats">'+Object.entries({hp:'체력',atk:'공격',def:'방어',
        spa:'특수공격',spd:'특수방어',spe:'스피드'}).map(([stat,label])=>
        '<span>'+label+' <b>'+esc(cand.statCA?.[stat]??'?')+'/'+esc(cand.statPA?.[stat]??'?')+'</b></span>').join('')+
      '</div>'+
      (held.active.length===6?'<p>출전 교체 평가: '+(suggestion.gain>0?'전력 상승 가능':
        '현 출전 명단 유지 고려')+' · '+esc(held.active[suggestion.slot].name)+
        ' 대비 '+(suggestion.gain>=0?'+':'')+suggestion.gain+'</p>':'<p>빈 출전 자리에 등록할 수 있습니다.</p>')+
      (held.count>=MAX_HELD?'<p class="ps-warning">보유 12/12마리입니다. 아래 보관 명단에서 직접 방출하거나 후보를 포기해야 합니다.</p>':
      '<label>포획 개체 등록 방식<select class="ps-register-slot">'+
      (held.active.length<6?'<option value="reserve">빈 출전 자리로 등록</option>':
      '<option value="reserve">보관 명단에 추가 · 기존 선수 유지</option>'+
      held.active.map((p,i)=>'<option value="'+i+'">'+esc(p.name)+'과 출전 교체 · 기존 선수는 보관</option>').join(''))+
      '</select></label>')+
      '<div class="ps-actions">'+(held.count<MAX_HELD?'<button data-ps-recruit="'+esc(key)+'" type="button">보유 명단 등록</button>':'')+
      '<button data-ps-dismiss="'+esc(key)+'" type="button">'+
      (data().pendingDismiss===key?'후보 포기 확정':'후보 포기')+'</button></div></section>':'';
    return '<div class="ps-trainer"><div><b>'+esc(trainer.name)+'</b>'+
      '<small>탐색·포획 '+scout.skill+'/20 · 개체 감별 '+scout.appraisalSkill+'/20 · 보유 '+held.count+'/'+MAX_HELD+'마리</small>'+
      '</div><span>'+state+'</span></div>'+
      (m?'<p class="ps-mission">최근 탐색: '+esc(m.region)+' · '+esc(HABITATS[m.habitat||'grass'])+
      ' · '+esc(TIMES[m.time||'day'])+' · '+esc(FOCUSES[m.focus]?.label||'균형 탐색')+
      ' · '+(m.status==='travel'?'다음 주 완료 예정':esc(m.result||'결과 없음'))+'</p>':'')+rows;
  }
  function collectionPanel(entry){
    if(!entry)return '';
    const t=entry.trainer,held=collection(t),key=keyOf(t),locked=rosterLocked();
    const summary=p=>esc(p.name)+' · CA '+esc(p.statCA?
      Math.round(Object.values(p.statCA).reduce((a,b)=>a+b,0)/6):p.power??'?')+
      ' · PA '+esc(p.statPA?Math.round(Object.values(p.statPA).reduce((a,b)=>a+b,0)/6):p.pa??'?');
    const active=held.active.map((p,i)=>'<div class="ps-mon"><b>출전 '+(i+1)+'</b><span>'+summary(p)+'</span></div>').join('');
    const reserves=held.reserve.map((p,i)=>{
      const token=key+':'+String(p.uid??i);
      return '<div class="ps-mon ps-bench"><b>보관 '+(i+1)+'</b><span>'+summary(p)+'</span>'+
        '<select aria-label="'+esc(p.name)+' 출전 교체 대상" class="ps-swap-slot">'+
        Array.from({length:6},(_,slot)=>'<option value="'+slot+'">'+
          (held.active[slot]?'출전 '+(slot+1)+' · '+esc(held.active[slot].name):'빈 출전 '+(slot+1))+'</option>').join('')+
        '</select><button type="button" data-ps-swap="'+esc(key)+'" data-ps-index="'+i+'" '+(locked?'disabled':'')+'>출전 교체</button>'+
        '<button type="button" data-ps-release="'+esc(key)+'" data-ps-index="'+i+'" '+(locked?'disabled':'')+'>'+
        (data().pendingRelease===token?'방출 확정':'방출')+'</button></div>';
    }).join('');
    return '<section class="ps-collection"><h3>보유 포켓몬 · '+esc(t.name)+'</h3>'+
      '<p class="ps-info">출전 '+held.active.length+'/6 · 보관 '+held.reserve.length+'/6 · 총 '+held.count+'/'+MAX_HELD+
      '마리 · 출전 6마리만 공식 경기에 참가합니다. 보관 개체는 원래 포획한 트레이너에게 남습니다.</p>'+
      '<div class="ps-roster">'+active+(reserves||'<div class="ps-info">보관 포켓몬이 없습니다.</div>')+'</div></section>';
  }
  function render(){
    if(!game)return '';
    const members=teamMembers(myClub()),cfg=data();
    if(!findTrainer(cfg.selectedTrainer))cfg.selectedTrainer=keyOf(members[0]?.trainer);
    if(!Object.hasOwn(REGIONS,cfg.region))cfg.region=worldClubRegion(myClub());
    if(!Object.hasOwn(FOCUSES,cfg.focus))cfg.focus='balanced';
    if(!Object.hasOwn(HABITATS,cfg.habitat))cfg.habitat='grass';
    if(!Object.hasOwn(TIMES,cfg.time))cfg.time='day';
    const current=findTrainer(cfg.selectedTrainer);
    const held=current?collection(current.trainer):null;
    const skills=current?talent(current.trainer):{skill:10,appraisalSkill:10};
    const probability=encounterTable(cfg.region,cfg.habitat,cfg.time,cfg.focus,
      skills);
    const percent=n=>(n*100).toFixed(2)+'%';
    const opts=(items,selected)=>Object.entries(items).map(([value,label])=>
      '<option value="'+esc(value)+'" '+(value===selected?'selected':'')+'>'+
      esc(label)+'</option>').join('');
    const encounters=probability.pokemon.slice().sort((a,b)=>b.findRate-a.findRate)
      .map(mon=>'<tr><td><strong>'+esc(mon.name)+'</strong></td><td>'+
        esc(mon.rarity)+'</td><td>'+percent(mon.findRate)+'</td><td>'+
        percent(mon.captureRate)+'</td></tr>').join('');
    const selectedMission=current?.trainer.pokemonScouting?.mission;
    const isWaiting=current?.trainer.pokemonScouting?.candidate;
    const isTraveling=selectedMission?.status==='travel';
    const dispatchedThisWeek=selectedMission?.season===game.season&&
      selectedMission.week===game.week;
    const atLimit=weekCount()>=MAX_WEEKLY;
    const noMoney=game.coins<cost(cfg.region);
    const blocked=!current||atLimit||noMoney||isWaiting||isTraveling||dispatchedThisWeek||
      (held?.count??0)>=MAX_HELD;
    const reason=isWaiting?'먼저 포획한 포켓몬의 등록 여부를 결정하세요.':
      held?.count>=MAX_HELD?'보유 12마리입니다. 보관 포켓몬을 방출한 뒤 탐색할 수 있습니다.':
      isTraveling?'이 트레이너는 탐색 중입니다. 다음 주에 결과가 도착합니다.':
      dispatchedThisWeek?'이 트레이너는 이번 주 탐색을 완료했습니다.':
      atLimit?'이번 주 파견 가능 인원 2명을 모두 사용했습니다.':
      noMoney?'파견 운영비가 부족합니다.':'다음 주에 탐색 결과가 도착합니다.';
    const active=members.filter(({trainer})=>
      trainer.pokemonScouting?.candidate||
      trainer.pokemonScouting?.mission?.status==='travel');
    const history=(cfg.history||[]).slice(0,5).map(item=>
      '<div class="ps-history"><span>'+esc(item.season)+'시즌 '+esc(item.week)+
      '주 · '+esc(item.trainer)+' · '+esc(item.region)+' · '+
      esc(HABITATS[item.habitat||'grass'])+' · '+esc(TIMES[item.time||'day'])+
      '</span><p>'+esc(item.description)+'</p></div>').join('');
    const reports=(active.length||history)?'<details class="ps-results" '+
      (members.some(({trainer})=>trainer.pokemonScouting?.candidate)?'open':'')+
      '><summary>탐색 결과 및 등록 · 대기 '+active.length+'명</summary>'+
      (active.length?active.map(({trainer})=>'<div class="ps-person">'+
        display(trainer)+'</div>').join(''):'')+
      (history?'<div class="ps-recent"><h3>최근 결과</h3>'+history+'</div>':'')+
      '</details>':'';
    return '<div class="eyebrow">POKÉMON EXPLORATION</div>'+
      '<h2>포켓몬 탐색</h2>'+
      '<section class="ps-selection"><div class="ps-form">'+
      '<label class="ps-trainer-picker">파견 트레이너<select id="ps-trainer">'+
      opts(Object.fromEntries(members.map(({trainer})=>[keyOf(trainer),
        trainer.name+' · 탐색·포획 '+talent(trainer).skill+' / 감별 '+talent(trainer).appraisalSkill])),cfg.selectedTrainer)+
      '</select></label>'+
      '<label class="ps-region-picker">지역 및 세대<select id="ps-region">'+opts(
        Object.fromEntries(Object.keys(REGIONS).map((k,i)=>[k,(i+1)+'세대 · '+k])),cfg.region)+'</select></label>'+
      '<label>생태계<select id="ps-habitat">'+opts(HABITATS,cfg.habitat)+'</select></label>'+
      '<label>시간대<select id="ps-time">'+opts(TIMES,cfg.time)+'</select></label>'+
      '<label class="ps-focus-picker">탐색 방향<select id="ps-focus">'+opts(
        Object.fromEntries(Object.entries(FOCUSES).map(([k,v])=>[k,v.label])),cfg.focus)+'</select></label>'+
      '</div>'+
      '<p class="ps-trainer-skills"><strong>'+esc(current?.trainer.name||'트레이너 미선택')+
      '</strong> · 탐색·포획 <b>'+esc(skills.skill)+'/20</b> · 개체 감별 <b>'+
      esc(skills.appraisalSkill)+'/20</b> <span>탐색·포획은 발견과 포획 확률, 개체 감별은 포획한 6개 능력치의 성장 잠재력에 영향을 줍니다.</span></p>'+
      '<p class="ps-info">'+esc(FOCUSES[cfg.focus].description)+'</p></section>'+
      collectionPanel(current)+
      '<section class="ps-chances" aria-label="포켓몬 출현 확률표">'+
      '<div class="ps-chances-heading"><h3>포켓몬 출현 목록</h3><span>'+
      probability.pokemon.length+'종</span></div>'+
      '<div class="ps-odds"><div><small>발견 성공</small><strong>'+
      percent(probability.findChance)+'</strong></div>'+
      '<div><small>포획까지 성공</small><strong>'+
      percent(probability.totalCaptureChance)+'</strong></div></div>'+
      '<div class="ps-prob-scroll"><table><thead><tr>'+
      '<th>포켓몬</th><th>희귀도</th><th>발견</th><th>포획</th>'+
      '</tr></thead><tbody>'+encounters+'</tbody></table></div>'+
      '<p class="ps-disclaimer">발견·포획 확률은 선택한 트레이너가 현재 조건으로 <b>파견 1회</b> 진행할 때의 확률입니다. '+
      '포획은 발견한 뒤 실제 포획까지 성공할 확률이며, 출발 시 표시된 값이 해당 파견에 고정됩니다. '+
      '지역별 출현표는 이 게임 전용 설정으로 원작의 공식 확률과 다릅니다.</p></section>'+
      '<div class="ps-dispatch"><div><small>파견 비용 '+wonReadable(cost(cfg.region))+
      ' · 이번 주 '+weekCount()+'/'+MAX_WEEKLY+'명</small>'+
      '<p role="status" class="ps-info">'+esc(reason)+'</p></div>'+
      '<button type="button" class="g-btn" id="ps-send" '+
      (blocked?'disabled':'')+'>이 조건으로 탐색 파견</button></div>'+
      reports;
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
      persist();attach();
    });
    bind('#ps-trainer','selectedTrainer');bind('#ps-region','region');
    bind('#ps-habitat','habitat');bind('#ps-time','time');bind('#ps-focus','focus');
    panel.querySelector('#ps-send')?.addEventListener('click',()=>{
      const result=dispatch(cfg.selectedTrainer,cfg.region,cfg.focus,cfg.habitat,cfg.time);
      if(!result.ok)alert(result.error);
    });
    panel.querySelectorAll('[data-ps-recruit]').forEach(button=>{
      button.addEventListener('click',()=>{
        const key=button.getAttribute('data-ps-recruit');
        const choice=button.closest('.ps-candidate')?.querySelector('.ps-register-slot')?.value;
        const slot=choice==='reserve'?undefined:Number(choice);
        const result=recruit(key,slot);
        if(!result.ok)alert(result.error);
      });
    });
    panel.querySelectorAll('[data-ps-dismiss]').forEach(button=>{
      button.addEventListener('click',()=>{
        const result=dismiss(button.getAttribute('data-ps-dismiss'));
        if(!result.ok)alert(result.error);
      });
    });
    panel.querySelectorAll('[data-ps-swap]').forEach(button=>button.addEventListener('click',()=>{
      const slot=Number(button.closest('.ps-bench')?.querySelector('.ps-swap-slot')?.value);
      const result=swap(button.dataset.psSwap,Number(button.dataset.psIndex),slot);
      if(!result.ok)alert(result.error);
    }));
    panel.querySelectorAll('[data-ps-release]').forEach(button=>button.addEventListener('click',()=>{
      const result=releaseReserve(button.dataset.psRelease,Number(button.dataset.psIndex));
      if(!result.ok)alert(result.error);
    }));
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
    '#dashpanel .ps-selection,#dashpanel .ps-chances,#dashpanel .ps-results,#dashpanel .ps-collection{background:#182e43;border:1px solid #365268;border-radius:9px;padding:15px;margin:13px 0}',
    '#dashpanel .ps-roster{display:grid;gap:5px}#dashpanel .ps-mon{display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:8px 10px;background:#213a4f;border-radius:6px;font-size:12px}#dashpanel .ps-mon b{min-width:55px;color:#a8e7d1}#dashpanel .ps-mon span{flex:1;min-width:140px}#dashpanel .ps-mon button,#dashpanel .ps-mon select{background:#29495e;color:#f3fafc;border:1px solid #58788e;border-radius:5px;padding:6px}#dashpanel .ps-warning{color:#ffd38a}',
    '#dashpanel .ps-form{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:10px 0}',
    '#dashpanel .ps-form label,#dashpanel .ps-candidate label{display:grid;gap:6px;color:#b7d2df;font-size:12px}',
    '#dashpanel .ps-form select,#dashpanel .ps-candidate select{padding:9px;min-width:0;width:100%;color:#f4fafc;background:#234257;border:1px solid #5d7c91;border-radius:6px}',
    '#dashpanel .ps-selection h3,#dashpanel .ps-chances h3,#dashpanel .ps-results h3{margin:0 0 12px;font-size:17px}',
    '#dashpanel .ps-chances p{color:#cad7df;font-size:12px;line-height:1.7}',
    '#dashpanel .ps-chances strong{color:#a6e7cc}',
    '#dashpanel .ps-prob-scroll{overflow-x:auto}',
    '#dashpanel .ps-prob-scroll table{width:100%;min-width:360px;border-collapse:collapse}',
    '#dashpanel .ps-prob-scroll td,#dashpanel .ps-prob-scroll th{text-align:right;font-size:12px;white-space:nowrap;border-bottom:1px solid #3d566a;padding:9px}',
    '#dashpanel .ps-prob-scroll th{color:#98d7d1}',
    '#dashpanel .ps-prob-scroll td:first-child,#dashpanel .ps-prob-scroll th:first-child{text-align:left}',
    '#dashpanel .ps-disclaimer{font-size:11px!important;color:#9cb5c1!important}',
    '#dashpanel .ps-info,#dashpanel .ps-mission{color:#bbccd9;font-size:12px;line-height:1.7}',
    '#dashpanel .ps-form .ps-trainer-picker{grid-column:span 2}',
    '#dashpanel .ps-form .ps-focus-picker{grid-column:span 2}',
    '#dashpanel .ps-trainer-skills{font-size:13px;line-height:1.7;color:#bbd7e4;margin:12px 0 4px}',
    '#dashpanel .ps-trainer-skills b{color:#a7edcb}',
    '#dashpanel .ps-trainer-skills span{color:#91aab9;font-size:11px}',
    '#dashpanel .ps-chances-heading{display:flex;align-items:center;justify-content:space-between}',
    '#dashpanel .ps-chances-heading span{color:#b1c7d3;font-size:12px}',
    '#dashpanel .ps-odds{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin:11px 0}',
    '#dashpanel .ps-odds>div{background:#254257;border-radius:7px;padding:12px}',
    '#dashpanel .ps-odds small{display:block;color:#b9cddd;margin-bottom:5px;font-size:11px}',
    '#dashpanel .ps-odds strong{font-size:22px;color:#a6e7cc}',
    '#dashpanel .ps-dispatch{display:flex;align-items:center;justify-content:space-between;gap:15px;flex-wrap:wrap;margin:15px 0 22px}',
    '#dashpanel .ps-dispatch small{font-size:12px;color:#9fbbc8}',
    '#dashpanel .ps-dispatch p{margin:4px 0}',
    '#dashpanel .ps-dispatch .g-btn{min-width:205px}',
    '#dashpanel .ps-results summary{cursor:pointer;font-weight:700;padding:7px 0}',
    '#dashpanel .ps-recent{padding-top:10px}',
    '#dashpanel .ps-person{border-top:1px solid #3a5668;padding:13px 0}',
    '#dashpanel .ps-person:first-of-type{border-top:0}',
    '#dashpanel .ps-trainer{display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap}',
    '#dashpanel .ps-trainer small{display:block;color:#a2c8d4;font-size:11px;margin-top:4px}',
    '#dashpanel .ps-trainer>span{color:#9ce3c4;font-size:12px}',
    '#dashpanel .ps-candidate{background:#203d4b;border:1px solid #427b7c;border-radius:7px;padding:12px;margin-top:8px}',
    '#dashpanel .ps-candidate p{font-size:12px;line-height:1.7;color:#c3d7dd}',
    '#dashpanel .ps-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin:12px 0}',
    '#dashpanel .ps-stats span{background:#18384c;padding:8px;border-radius:5px;font-size:11px}',
    '#dashpanel .ps-stats b{display:block;color:#a6e3c5}',

    '#dashpanel .ps-actions{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 0}',
    '#dashpanel .ps-actions button{padding:9px 13px;border-radius:5px;background:#23516e;color:white;border:1px solid #5b8ba1;cursor:pointer}',
    '#dashpanel .ps-history{border-top:1px solid #3b5269;padding:9px 0;font-size:12px}',
    '#dashpanel .ps-history span{color:#a9dcca}#dashpanel .ps-history p{margin:5px 0;color:#c1d0da;line-height:1.6}',
    '@media(max-width:700px){#dashpanel .ps-form{grid-template-columns:repeat(2,minmax(0,1fr))}#dashpanel .ps-selection,#dashpanel .ps-chances,#dashpanel .ps-results{padding:11px}#dashpanel .ps-form .ps-region-picker{grid-column:span 2}#dashpanel .ps-dispatch .g-btn{width:100%}}'
  ].join('');
  document.head.append(style);
  window.PokemonExpedition={
    REGIONS,FOCUSES,HABITATS,TIMES,BIOMES,MAX_WEEKLY,MAX_HELD,tier,talent,outcome,optionStats,
    encounterTable,pickEncounter,candidatePokemon,suggestedSlot,
    keyOf,findTrainer,dispatch,recruit,swap,releaseReserve,dismiss,resolvePlayer,resolveAI,render,data,weekCount,cost,collection,
  };
  if(game)renderOffice();
})();
