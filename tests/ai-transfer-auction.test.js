import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const begin=html.indexOf('function aiTransferWindow(attemptLimit=6){');
const end=html.indexOf('function aiExpireOffers(){',begin);
if(begin<0||end<0)throw Error('AI competitive bidding window not found');
const source=html.slice(begin,end);

test('failed leading AI bid leaves the same player-owned candidate available to a rival',()=>{
  const our={id:0,name:'우리 구단',trainers:[]};
  const buyer1={id:1,name:'첫째 AI',trainers:[null],reserveTrainers:[],identity:{budget:300000000}};
  const buyer2={id:2,name:'둘째 AI',trainers:[null],reserveTrainers:[],identity:{budget:300000000}};
  const seller={id:3,name:'판매 구단',trainers:[{uid:99,pokemon:Array(6).fill({power:90})}],
    reserveTrainers:[{uid:98,pokemon:Array(6).fill({power:80})}],identity:{budget:300000000}};
  const game={season:1,week:2,club:our.name,clubs:[our,buyer1,buyer2,seller],
    freeAgents:[],transferHistory:[],log:[]};
  const attempts=[];
  const target={seller,e:{t:seller.reserveTrainers[0],kind:'reserve',slot:0},fee:50000000,score:100};
  const sandbox={game,transferOpen:()=>true,aiInit:()=>{},myClub:()=>our,
    aiMaintainSquad:()=>{},aiManager:()=>({risk:50,negotiation:12}),
    clubIdentity:c=>c.identity,rng:()=>.1,rnd:()=>0,
    aiTransferCandidates:c=>(c.id===1||c.id===2)?[target]:[],
    aiSignFreeAgent:()=>false,aiRecord:()=>{},aiBidFits:()=>true,
    aiExecuteBid:c=>{attempts.push(c.id);return c.id===2;}};
  runInNewContext(source,sandbox);
  const count=sandbox.aiTransferWindow(6);
  assert.equal(count,1);
  assert.deepEqual(attempts,[1,2]);
});
