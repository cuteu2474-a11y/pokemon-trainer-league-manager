import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const detail=html.split('function clubSelectDetailsHTML(){')[1]?.split('function renderClubSelect(){')[0];

test('club selection shows crest and name without descriptive tags',()=>{
  assert.ok(detail,'club selection details should exist');
  assert.match(detail,/clubSelectBadge\(c\.id,'large'\)/);
  assert.match(detail,/cs-club-name/);
  assert.doesNotMatch(detail,/cs-club-location|cs-badges|cs-chip|지방 연고/);
});

test('club selection displays trainer count but no tactics average',()=>{
  assert.match(detail,/team\.length\+'명/);
  assert.doesNotMatch(detail,/평균 전술|coaching/);
  assert.match(detail,/onclick="clubTrainerOpen\(\)"/);
});

test('club trainer preview shows only league and removes role and lineup badges',()=>{
  const preview=html.split('function clubTrainerDetailHTML(t){')[1]?.split('function clubSelectUpdateStart(){')[0];
  assert.ok(preview);
  assert.match(preview,/ctSortedPokemon\(t\)/);
  assert.match(preview,/ctTrainerPortrait\(t,true\)/);
  assert.match(preview,/ct-mini-mons/);
  assert.match(preview,/\(c\.division\+1\)\+'부 리그<\/div>/);
  assert.doesNotMatch(preview,/worldClubRegion\(c\)|ct-pill-list|대표 트레이너|출전 '\+\(clubTrainerIndex/);
});

test('club budget, league, facilities and reputation remain visible',()=>{
  for(const label of ['소속 리그','시작 이적 예산','유소년 시설','훈련 시설','지역 인지도']){
    assert.ok(detail.includes(label),label+' must remain');
  }
});

test('ready to take office does not show redundant season-start guidance',()=>{
  const update=html.split('function clubSelectUpdateStart(){')[1]?.split('function clubSelectCommit(){')[0];
  assert.ok(update,'club selection validation should exist');
  assert.doesNotMatch(update,/취임하면 감독실로 이동하고 시즌 1이 시작됩니다/);
  assert.ok(update.includes("'기존 저장 데이터 교체 여부를 확인해 주세요.':''"));
  assert.ok(update.includes('f.hidden=!f.textContent'));
  assert.ok(update.includes('감독 이름을 입력해 주세요.'));
});
