import test from 'node:test';
import assert from 'node:assert/strict';
import {createCareerBackup,parseCareerBackup,validCareer} from '../src/core/career-backup.js';

function career(){
 return {manager:'모바일 감독',club:'구단 0',season:2,week:16,round:10,saveId:'source',saveRevision:81,
  clubs:Array.from({length:40},(_,id)=>({id,name:'구단 '+id,trainers:Array.from({length:5},()=>({name:'선수',pokemon:[]}))})),
  fixtures:[[],[],[],[]],results:[],pendingMatch:{phase:'prepare',round:11},appliedMatches:{'old-match':{season:1,round:1}}};
}
test('career backups preserve the entire save including pending match and applied receipts',()=>{
 const original=career(),text=JSON.stringify(createCareerBackup(original,'2026-10-29T00:00:00.000Z'));
 const parsed=parseCareerBackup(text);
 assert.deepEqual(parsed,original);
 assert.equal(JSON.parse(text).exportedAt,'2026-10-29T00:00:00.000Z');
});
test('backup import rejects unrelated JSON, unsupported versions and malformed careers',()=>{
 assert.equal(validCareer(career()),true);
 assert.throws(()=>parseCareerBackup('not a json file'),/JSON/);
 assert.throws(()=>parseCareerBackup('{}'),/지원되는/);
 const unsupported=createCareerBackup(career());unsupported.version=3;
 assert.throws(()=>parseCareerBackup(JSON.stringify(unsupported)),/지원되는/);
 const invalid=createCareerBackup(career());invalid.game.clubs=[];
 assert.throws(()=>parseCareerBackup(JSON.stringify(invalid)),/지원되는/);
 const noClub=career();noClub.club='가짜 구단';
 assert.throws(()=>createCareerBackup(noClub),/올바르지/);
});
