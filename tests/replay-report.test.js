import test from 'node:test';
import assert from 'node:assert/strict';
import {buildBattleReport} from '../src/battle/replay-report.js';
const mon=name=>({name,displayName:name.split('·')[0],species:'Pikachu'});
test('duplicate species stay distinct and residual damage is not credited as direct damage',()=>{
 const home=[{name:'홈 주자',team:[mon('피카츄·1'),mon('피카츄·2')]}],away=[{name:'원정 주자',team:[mon('상대·1'),mon('상대·2')]}];
 const round={trainerA:0,trainerB:0,pokemonOrder:{p1:['피카츄·1','피카츄·2'],p2:['상대·1','상대·2']},result:{initialStats:{p1:[{hp:100},{hp:100}],p2:[{hp:100},{hp:100}]},log:[
 '|switch|p1a: 피카츄·1|Pikachu|100/100','|switch|p2a: 상대·1|Pikachu|100/100','|turn|1',
 '|move|p1a: 피카츄·1|Thunderbolt|p2a: 상대·1','|-damage|p2a: 상대·1|40/100',
 '|turn|2','|switch|p1a: 피카츄·2|Pikachu|100/100','|move|p1a: 피카츄·2|Thunderbolt|p2a: 상대·1',
 '|-damage|p2a: 상대·1|0 fnt','|faint|p2a: 상대·1','|switch|p2a: 상대·2|Pikachu|100/100',
 '|turn|3','|-damage|p2a: 상대·2|0 fnt|[from] psn','|faint|p2a: 상대·2'].join('\n')}};
 const report=buildBattleReport([round],home,away);
 assert.equal(report.home.find(m=>m.name==='피카츄·1').damage,60);
 assert.equal(report.home.find(m=>m.name==='피카츄·1').knockouts,0);
 assert.equal(report.home.find(m=>m.name==='피카츄·2').damage,40);
 assert.equal(report.home.find(m=>m.name==='피카츄·2').knockouts,1);
 assert.equal(report.home.reduce((n,m)=>n+m.knockouts,0),1);
});
