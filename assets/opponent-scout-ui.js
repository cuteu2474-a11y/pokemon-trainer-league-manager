/* Opponent scouting and matchday recommendations; no changes to Showdown outcomes. */
(function(){
  if(window.OpponentScoutUI)return;
  const behaviorLabels={
    kill:'처치 기회를 확실히 노려라',switch:'불리할 때 적극 교체해라',
    matchup:'유리한 교체 대상을 선택해라',preserve:'에이스를 보존해라',
    pp:'강한 기술의 PP를 관리해라',status:'유효한 상태이상으로 견제해라',
    analysis:'전황을 분석하고 유리한 수를 선택해라'
  };
  const planLabels={balanced:'균형',offense:'공세',control:'견제',endurance:'유지력',tempo:'속공'};
  const typeNames={Normal:'노말',Fire:'불꽃',Water:'물',Electric:'전기',Grass:'풀',
    Ice:'얼음',Fighting:'격투',Poison:'독',Ground:'땅',Flying:'비행',Psychic:'에스퍼',
    Bug:'벌레',Rock:'바위',Ghost:'고스트',Dragon:'드래곤',Dark:'악',Steel:'강철',Fairy:'페어리'};
  const safe=text=>String(text??'').replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const clone=value=>JSON.parse(JSON.stringify(value));
  let busy=false;
  const state=()=>window.MatchdayPreparation?.pending?.();
  const repaint=()=>window.MatchdayPreparation?.render?.();
  function valid(p,opponent){
    const r=p?.scoutReport;
    return r?.engine==='showdown-scout'&&r.specialtySchema===1&&r.opponentId===opponent.id&&
      r.round===p.round&&r.season===p.season&&
      Array.isArray(r.matches)&&r.matches.length===5&&
      Array.isArray(r.selectedOrder)&&r.selectedOrder.length===5&&
      r.selectedOrder.every((trainer,i)=>trainer===p.order[i]);
  }
  function teamTable(report){
    const rows=report.matches.map((rec,i)=>{
      const foe=report.opponents?.[i];
      return '<tr><td><b>'+safe(foe?.name||rec.opponentName)+'</b>'+
        '<small>'+safe(planLabels[foe?.play]||foe?.play||'균형')+
        ' · 전술 '+safe(foe?.skills?.tactics??'?')+
        ' / 교체 '+safe(foe?.skills?.switching??'?')+'</small></td>'+
        '<td><b>'+safe(rec.trainerName)+'</b>'+
        '<small>비교 점수 '+(rec.advantage>=0?'+':'')+
        safe(rec.advantage)+'</small></td>'+
        '<td><strong>'+safe(behaviorLabels[rec.behavior]||rec.behavior)+'</strong>'+
        '<small>'+safe(rec.reason)+'</small></td>'+
        '<td><button type="button" data-scout-one="'+rec.trainerIndex+'">해당 지시 적용</button></td></tr>';
    }).join('');
    return '<div class="md-scout-table"><table><thead><tr>'+
      '<th>상대 예상 순서</th><th>감독이 정한 출전 트레이너</th><th>전술 권고</th><th>개별 적용</th>'+
      '</tr></thead><tbody>'+rows+'</tbody></table></div>';
  }
  function specialtyText(value){return value?.active?'전문 편성 '+value.types.map(type=>typeNames[type]||type).join('/')+' · 공격·방어·특공·특방 +5% (1회)':'혼합 편성 · 전문 보너스 없음';}
  function detailHTML(report){
    return report.opponents.map(t=>'<div class="md-scout-trainer">'+
      '<strong>'+safe((t.index+1)+'. '+t.name)+'</strong>'+
      '<p>'+safe(specialtyText(t.specialty))+'</p>'+
      '<p>성향 '+safe(planLabels[t.play]||t.play)+
      ' · 평균 전력 '+safe(t.averagePower)+
      ' · 선플 '+(t.traits?.length?t.traits.map(safe).join(', '):'현재 확인된 선플 없음')+'</p>'+
      '<p>포켓몬 '+t.pokemon.map(mon=>safe(mon.name)+' ('+
        mon.types.map(type=>safe(typeNames[type]||type)).join('/')+')').join(' · ')+
      '</p></div>').join('');
  }
  function panelHTML(p,opponent){
    const report=valid(p,opponent)?p.scoutReport:null;
    const disabled=busy||p.phase!=='prepare'?' disabled':'';
    if(!report){
      return '<div class="md-scout-top"><div><h2>상대 팀 스카우팅</h2>'+
        '<p>상대의 선플·포켓몬·타입 상성을 조사하고, 감독이 정한 출전 순서에 맞춰 전술을 분석합니다.</p>'+
        '</div><button type="button" id="md-scout-request"'+disabled+'>'+
        (busy?'상대 분석 중…':'상대 팀 분석하기')+'</button></div>'+
        '<p class="md-scout-notice" role="status">'+safe(p.scoutMessage||'실제 승률이 아닌 전술 비교 결과를 제공합니다.')+'</p>';
    }
    const types=(report.typeDistribution||[]).map(t=>
      safe(typeNames[t.name]||t.name)+' '+safe(t.count)).join(' · ');
    const t=report.tendency||{};
    return '<div class="md-scout-top"><div><h2>'+safe(opponent.name)+' · 상대 팀 분석 완료</h2>'+
      '<p>주요 타입 '+types+'</p><p>공격 지향 '+(t.offense??0)+
      '명 · 견제 성향 '+(t.status??0)+'명 · 교체 성향 '+(t.switch??0)+'명</p>'+
      '</div><button type="button" id="md-scout-request"'+disabled+'>다시 분석</button></div>'+
      '<details class="md-scout-info"><summary>우리 팀 전문 편성 확인</summary>'+report.ownTrainers.map(t=>'<p>'+safe(t.name)+' · '+safe(specialtyText(t.specialty))+'</p>').join('')+'<p>현재 분석 시점의 편성입니다. 선수단이 바뀌면 다시 분석해 주세요. 출전 확정 명단을 기준으로 실제 보너스를 계산합니다.</p></details>'+
      '<details class="md-scout-info" open><summary>현재 출전 순서별 전술 분석</summary>'+
      '<div class="md-scout-actions"><button type="button" id="md-scout-all"'+disabled+
      '>모든 전술 지시 적용</button></div>'+
      teamTable(report)+'<p class="md-scout-disclaimer">'+safe(report.note)+'</p></details>'+
      '<details class="md-scout-info"><summary>상대 트레이너 5명 자세히 보기</summary>'+
      detailHTML(report)+'</details>'+
      '<p class="md-scout-notice" role="status">'+safe(p.scoutMessage||
        '권고는 트레이너의 자율 판단에 따라 수용·절충·거부될 수 있습니다.')+'</p>';
  }
  function applyAdvice(mode,index=null){
    const p=state(),report=p?.scoutReport;
    const rival=game?.clubs?.[p?.home===myClub()?.id?p?.away:p?.home];
    if(!p||p.phase!=='prepare'||!rival||!valid(p,rival)||
      !['all','one'].includes(mode))return false;
    p.plans ||= Array.from({length:5},()=>null);
    p.behaviors ||= Array.from({length:5},()=>null);
    for(const rec of report.matches){
      if(mode==='one'&&rec.trainerIndex!==index)continue;
      if(!Number.isInteger(rec.trainerIndex)||rec.trainerIndex<0||
        rec.trainerIndex>4||!Object.hasOwn(planLabels,rec.plan)||
        !Object.hasOwn(behaviorLabels,rec.behavior))continue;
      p.plans[rec.trainerIndex]=rec.plan;
      p.behaviors[rec.trainerIndex]=rec.behavior;
    }
    p.scoutMessage=mode==='all'?'감독이 정한 출전 순서는 유지하고 모든 전술 지시를 적용했습니다. 각 트레이너의 권고는 수정할 수 있습니다.':
      '선택한 트레이너에게만 전술을 권고했습니다.';
    if(typeof persist==='function')persist();
    repaint();
    return true;
  }
  async function request(){
    const p=state();if(!p||p.phase!=='prepare'||busy)return false;
    busy=true;delete p.scoutMessage;repaint();
    try{
      const me=myClub().id;
      const response=await fetch('/api/opponent-scout',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({home:clone(game.clubs[p.home]),away:clone(game.clubs[p.away]),
          playerClubId:me,season:p.season,round:p.round,selectedOrder:p.order.slice()})
      });
      const report=await response.json();
      if(!response.ok)throw new Error(report.error||'스카우팅 서버 오류');
      if(report.engine!=='showdown-scout'||report.opponentId!==(p.home===me?p.away:p.home)||
        report.season!==p.season||report.round!==p.round||
        !Array.isArray(report.matches)||report.matches.length!==5)throw new Error('상대 분석 형식 오류');
      if(state()!==p||p.phase!=='prepare')return false;
      p.scoutReport=report;
      p.scoutMessage='현재 출전 순서에 맞춰 상대 분석을 완료했습니다. 전술 권고 적용 여부는 감독이 선택합니다.';
      if(typeof persist==='function')persist();
      return true;
    }catch(error){
      if(state()===p)p.scoutMessage='분석에 실패했습니다: '+error.message;
      return false;
    }finally{
      busy=false;
      if(state()===p)repaint();
    }
  }
  function attach(root,p,c,opponent){
    if(!root||!p||!opponent||p.phase==='watch')return;
    const panel=document.createElement('section');
    panel.className='md-scout-panel';
    panel.setAttribute('aria-label','상대 팀 스카우팅 및 추천 지시');
    panel.innerHTML=panelHTML(p,opponent);
    const anchor=root.querySelector('.md-top');
    if(!anchor)return;
    anchor.insertAdjacentElement('afterend',panel);
    panel.querySelector('#md-scout-request')?.addEventListener('click',request);
    panel.querySelector('#md-scout-all')?.addEventListener('click',()=>applyAdvice('all'));
    panel.querySelectorAll('[data-scout-one]').forEach(button=>{
      button.addEventListener('click',()=>applyAdvice('one',Number(button.dataset.scoutOne)));
    });
  }
  if(typeof document!=='undefined'){
    const style=document.createElement('style');
    style.textContent=[
      '#matchday .md-scout-panel{margin:12px 0 18px;padding:17px;background:#142d40;border:1px solid #426176;border-radius:8px}',
      '#matchday .md-scout-top{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap}',
      '#matchday .md-scout-top h2{margin:0 0 8px;font-size:17px}',
      '#matchday .md-scout-top p{margin:4px 0;color:#bed0da;font-size:12px;line-height:1.7}',
      '#matchday .md-scout-info{border-top:1px solid #3b576c;padding:9px 0;margin-top:10px}',
      '#matchday .md-scout-info summary{cursor:pointer;font-weight:700;padding:7px 0}',
      '#matchday .md-scout-actions{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}',
      '#matchday .md-scout-table{overflow-x:auto}',
      '#matchday .md-scout-table table{width:100%;min-width:670px;border-collapse:collapse}',
      '#matchday .md-scout-table th,#matchday .md-scout-table td{text-align:left;vertical-align:top;padding:10px 8px;border-bottom:1px solid #375166;font-size:12px}',
      '#matchday .md-scout-table th{color:#92daca}',
      '#matchday .md-scout-table td small{display:block;font-size:11px;margin-top:5px;line-height:1.5;color:#bbcbd8}',
      '#matchday .md-scout-table td button{padding:7px 9px}',
      '#matchday .md-scout-trainer{background:#203a4d;margin:8px 0;padding:10px;border-radius:5px}',
      '#matchday .md-scout-trainer p{font-size:11px;color:#b8d0d7;line-height:1.6}',
      '#matchday .md-scout-disclaimer{font-size:11px;line-height:1.7;color:#b5c5d7}',
      '#matchday .md-scout-notice{font-size:12px;color:#96dfbd;margin:10px 0 0;line-height:1.6}',
      '@media(max-width:650px){#matchday .md-scout-panel{padding:11px}#matchday .md-scout-table td button{min-width:94px}}'
    ].join('');
    document.head.append(style);
  }
  window.OpponentScoutUI={attach,applyAdvice,request,valid};
  if(state()?.phase==='prepare')repaint();
})();
