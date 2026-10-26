import {analyzeOpponent} from '../src/scouting/opponent-report.js';

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  if(req.method!=='POST'){
    res.setHeader('Allow','POST');
    res.statusCode=405;
    res.end(JSON.stringify({error:'POST 요청이 필요합니다.'}));
    return;
  }
  try{
    const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
    const result=analyzeOpponent(body);
    res.statusCode=200;
    res.end(JSON.stringify(result));
  }catch(error){
    res.statusCode=400;
    res.end(JSON.stringify({error:error.message}));
  }
}
