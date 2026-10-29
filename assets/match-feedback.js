/* Report only recorded actions and committed progression; replay review cannot settle a match. */
(function(){
  const esc=v=>escapeHTML(String(v??''));
  const labels={kill:'킬각 포착',switch:'적극적인 교체',matchup:'상성 교체',preserve:'에이스 보존',pp:'PP 관리',status:'상태이상',analysis:'전황 분석'};
  function moments(p){
    const side=myClub().id===p.home?'p1':'p2',ownHome=side==='p1';
    return p.result.rounds.flatMap((r,duel)=>{
      let turn=1,entry=false;const found=[];
      for(const line of r.log.split('\n')){
        const v=line.split('|');
        if(v[1]==='turn')turn=Number(v[2])||1;
        if(v[1]==='switch'&&v[2]?.startsWith(side)){
          if(entry)found.push({duel,turn,text:(duel+1)+'번째 대결 '+turn+'턴 · 우리 포켓몬 교체'});
          entry=true;
        }
        if(v[1]==='faint'&&!v[2]?.startsWith(side))found.push({duel,turn,text:(duel+1)+'번째 대결 '+turn+'턴 · 상대 포켓몬 기절'});
      }
      const slot=ownHome?r.trainerA:r.trainerB;
      return found.map(x=>({...x,slot}));
    });
  }
  function html(p,confirmed){
    const side=myClub().id===p.home?'home':'away',home=side==='home';
    const learning=confirmed?game.lastMatch?.learning:null;
    const trust=confirmed?(game.trainerAI?.coachMatchReports||[]).find(x=>x.season===p.season&&x.round===p.round):null;
    const scene=moments(p);
    const insights=window.MatchFeedbackInsights?.render(p.result,side,confirmed)||'';
    return '<section class="match-feedback"><h2>'+(confirmed?'경기 결과·성장 반영 완료':'경기 종료 · 결과 확인 전 임시 요약')+'</h2><p>'+esc(p.result.aScore)+' : '+esc(p.result.bScore)+' · 출전 순서 '+p.result.teams[side].map(t=>esc(t.name)).join(' → ')+'</p>'+insights+
      p.result.teams[side].map((t,slot)=>{
        const rounds=p.result.rounds.filter(r=>(home?r.trainerA:r.trainerB)===slot);
        if(!rounds.length)return '<p>'+esc(t.name)+' · 미출전 · 경기 경험 없음</p>';
        const advice=p.result.coaching?.[side]?.[slot]||{},e=learning?.participants?.find(x=>x.player&&x.slot===slot);
        const relation=trust?.entries?.find(x=>x.trainer===t.name);
        const stats=rounds.map(r=>r.aiDecisions?.[home?'p1':'p2']).filter(Boolean);
        const switches=stats.reduce((n,x)=>n+(Number(x.voluntarySwitches)||0),0);
        const selected=advice.behaviorAdvice,progress=selected&&e?.progress?.[selected];
        return '<article><h3>'+esc(t.name)+'</h3><p>전술 권고: '+esc(advice.requested||'없음')+' · '+esc(advice.response||'자율')+
          ' / 플레이 권고: '+esc(labels[selected]||'없음')+' · '+esc(advice.behaviorResponse||'자율')+'</p>'+
          '<p>실제 기록: '+rounds.length+'대결 · 자율 교체 '+switches+'회 · '+rounds.filter(r=>r.winner===(home?'A':'B')).length+'승</p>'+
          (selected?'<p>'+(!confirmed?'권고 관련 성장 변화는 결과 반영 후 확정됩니다.':progress?.positiveActions>0?
            '권고와 관련된 성공 경험 '+progress.positiveActions+'건 · 성향 '+progress.before+'→'+progress.after:
            '관련 성공 경험이 기록되지 않았습니다. 권고 수용만으로 성장하지 않습니다.')+'</p>':'')+
          (relation?'<p>감독 신뢰 '+relation.before+'→'+relation.after+'</p>':'')+
          (e?.experience?'<p>'+e.experience.map(x=>esc(x.label)+' '+x.from+'→'+x.to+' · 경험 '+x.beforeXP+'→'+x.afterXP+' (획득 +'+x.earned+')').join('<br>')+'</p>':'')+
          (e?.learned?.length?'<p>새 선플: '+e.learned.map(esc).join(', ')+'</p>':'')+
          scene.map((x,i)=>x.slot===slot?'<button class="g-btn alt" data-feedback-scene="'+i+'">'+esc(x.text)+' 보기</button>':'').filter(Boolean).slice(0,2).join('')+'</article>';
      }).join('')+'<p>수용 여부, 실제 행동, 경기 결과를 구분합니다. 이 보고서는 권고가 승리의 원인이었다고 판정하지 않습니다.</p></section>';
  }
  function bind(root,p){
    const scene=moments(p);
    const side=myClub().id===p.home?'home':'away';
    const featured=window.MatchFeedbackInsights?.summarize(p.result,side).worst||[];
    root.querySelectorAll('[data-feedback-insight-scene]').forEach(button=>button.onclick=()=>{
      if(game.pendingMatch){alert('경기 결과를 먼저 확인해 주세요.');return;}
      const selected=featured[Number(button.dataset.feedbackInsightScene)];
      if(!selected||!window.MatchdayPreparation?.review)return;
      document.getElementById('match-feedback-overlay')?.remove();
      window.MatchdayPreparation.review(p,selected.duel,selected.turn);
    });
    root.querySelectorAll('[data-feedback-scene]').forEach(b=>b.onclick=()=>{
      if(game.pendingMatch){alert('경기 결과를 먼저 확인해 주세요.');return;}
      const x=scene[Number(b.dataset.feedbackScene)];if(!x)return;
      document.getElementById('match-feedback-overlay')?.remove();window.MatchdayPreparation.review(p,x.duel,x.turn);
    });
  }
  function show(p){
    if(!p)return;
    p={...p,result:p.result||game.lastMatch?.replay};if(!p.result)return;
    document.getElementById('match-feedback-overlay')?.remove();
    const root=document.createElement('section');root.id='match-feedback-overlay';root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label','경기 결과와 성장');
    root.innerHTML='<button class="g-btn" id="feedback-close">구단 화면으로</button>'+html(p,true);
    document.body.append(root);root.querySelector('#feedback-close').onclick=()=>root.remove();bind(root,p);
  }
  window.MatchFeedback={html,show,bind,moments};
  const previous=renderOffice;window.renderOffice=function(){previous();if(!game?.lastMatch?.feedbackMatch||!['home','fixtures'].includes(tab))return;
    const root=document.getElementById('dashpanel');if(!root)return;const b=document.createElement('button');b.className='g-btn alt';b.textContent='지난 경기 결정·성장 요약';b.onclick=()=>show(game.lastMatch.feedbackMatch);root.prepend(b);
  };
  const style=document.createElement('style');style.textContent='#match-feedback-overlay{position:fixed;inset:0;z-index:1500;overflow:auto;background:#102336;padding:24px max(16px,calc((100vw - 950px)/2));color:#e8f1f7}.match-feedback{display:block;max-width:950px;line-height:1.7}.match-feedback h2{font-size:20px}.match-feedback h3{font-size:16px}.match-feedback article{border:1px solid #476c80;padding:12px;margin:10px 0;background:#193449;border-radius:8px}.match-feedback p{font-size:12px}.match-feedback button{margin:4px}';
  style.textContent+=`
    .mfi-report{margin:18px 0 26px;padding:18px;border:1px solid #496981;
      border-radius:12px;background:linear-gradient(145deg,#152f42,#12283b);line-height:1.55}
    .mfi-report h3{font-size:18px;margin:0 0 14px}
    .mfi-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}
    .mfi-metric{min-width:0;display:flex;flex-direction:column;justify-content:center;
      padding:12px;border:1px solid #386078;border-radius:9px;background:#0c2235}
    .mfi-metric span{font-size:12px;color:#c3d6e3}
    .mfi-metric strong{font-size:22px;color:#f7faff;margin:4px 0}
    .mfi-metric small{font-size:11px;color:#aac6d7}
    .mfi-details{margin-top:12px;border:1px solid #38566e;border-radius:9px;padding:10px 12px}
    .mfi-details>summary{cursor:pointer;min-height:42px;font-size:14px;
      font-weight:750;display:list-item;padding:8px 4px;touch-action:manipulation}
    .mfi-scene-list,.mfi-ace-list{display:grid;gap:8px}
    .mfi-scene,.mfi-ace-row{margin:0!important;background:#102d41!important;
      border:1px solid #355c73!important;border-radius:8px!important;
      padding:10px!important;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
    .mfi-scene>div,.mfi-ace-row>div{display:grid;gap:4px;flex:1 1 155px;min-width:0}
    .mfi-scene strong,.mfi-ace-row strong{font-size:13px}
    .mfi-scene span,.mfi-ace-row span,.mfi-ace-row small{font-size:12px;color:#b4cfdb}
    .mfi-scene .mfi-loss{color:#f2c48b;font-size:13px;font-weight:700}
    .mfi-scene button{min-height:44px;white-space:nowrap;margin:0!important;padding:9px 14px}
    .mfi-scene button:disabled{opacity:.55;cursor:not-allowed}
    .mfi-ace-row b{font-size:12px;color:#e5f2fc}
    .mfi-note{font-size:12px!important;color:#bbced9!important;margin:8px 0 12px}
    @media(max-width:780px){.mfi-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}
      #match-feedback-overlay{padding:12px}}
    @media(max-width:480px){.mfi-report{padding:12px;margin:12px 0}
      .mfi-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}
      .mfi-metric{padding:10px}.mfi-metric strong{font-size:19px}
      .mfi-scene>div{flex-basis:100%}.mfi-scene button{width:100%}
      #match-feedback-overlay .g-btn{min-height:44px}}
  `;
  document.head.append(style);
})();
