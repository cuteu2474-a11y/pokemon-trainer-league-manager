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
    return '<section class="match-feedback"><h2>'+(confirmed?'경기 결과·성장 반영 완료':'경기 종료 · 결과 확인 전 임시 요약')+'</h2><p>'+esc(p.result.aScore)+' : '+esc(p.result.bScore)+' · 출전 순서 '+p.result.teams[side].map(t=>esc(t.name)).join(' → ')+'</p>'+
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
  const style=document.createElement('style');style.textContent='#match-feedback-overlay{position:fixed;inset:0;z-index:1500;overflow:auto;background:#102336;padding:24px max(16px,calc((100vw - 950px)/2));color:#e8f1f7}.match-feedback{display:block;max-width:950px;line-height:1.7}.match-feedback h2{font-size:20px}.match-feedback h3{font-size:16px}.match-feedback article{border:1px solid #476c80;padding:12px;margin:10px 0;background:#193449;border-radius:8px}.match-feedback p{font-size:12px}.match-feedback button{margin:4px}';document.head.append(style);
})();
