export const BACKUP_FORMAT='penta-rivals-career';
export const BACKUP_VERSION=1;

export function validCareer(g){
 return !!g&&typeof g==='object'&&typeof g.manager==='string'&&g.manager.trim().length>0&&
  typeof g.club==='string'&&Number.isInteger(g.season)&&g.season>=1&&
  Number.isInteger(g.week)&&g.week>=1&&g.week<=30&&
  Number.isInteger(g.round)&&g.round>=0&&g.round<=18&&
  Array.isArray(g.clubs)&&g.clubs.length===40&&
  g.clubs.some(c=>c?.name===g.club)&&
  g.clubs.every(c=>c&&Number.isInteger(c.id)&&typeof c.name==='string'&&
   Array.isArray(c.trainers)&&c.trainers.length===5)&&
  Array.isArray(g.fixtures)&&g.fixtures.length===4&&Array.isArray(g.results);
}

export function createCareerBackup(career,exportedAt=new Date().toISOString()){
 if(!validCareer(career))throw Error('백업할 커리어 저장이 올바르지 않습니다.');
 return {format:BACKUP_FORMAT,version:BACKUP_VERSION,exportedAt,game:career};
}

export function parseCareerBackup(raw){
 let data;
 try{data=JSON.parse(raw);}catch{throw Error('JSON 백업 파일을 읽을 수 없습니다.');}
 if(data?.format!==BACKUP_FORMAT||data?.version!==BACKUP_VERSION||!validCareer(data.game))
  throw Error('펜타 라이벌즈의 지원되는 커리어 백업 파일이 아닙니다.');
 return data.game;
}
