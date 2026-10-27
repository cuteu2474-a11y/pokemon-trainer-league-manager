import {readFileSync, existsSync} from 'node:fs';
import {Script} from 'node:vm';

const root = new URL('../', import.meta.url);
const html = readFileSync(new URL('index.html', root), 'utf8');
if (!html.startsWith('<!doctype html>') || !html.trimEnd().endsWith('</html>')) {
  throw new Error('index.html 문서가 불완전합니다.');
}
let scripts = 0;
for (const [, source] of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)) {
  new Script(source, {filename: `index.html:script-${++scripts}`});
}
for (const [, path] of html.matchAll(/<script\b[^>]*src="([^"]+)"[^>]*>/gi)) {
  new Script(readFileSync(new URL(path, root), 'utf8'), {filename:path});
}
const assets = new Set(html.match(/assets\/ui\/[A-Za-z0-9_.-]+/g));
for (const asset of assets) {
  if (!existsSync(new URL(asset, root))) throw new Error(`이미지 파일 누락: ${asset}`);
}
for (const path of ['src/battle/showdown.js', 'src/battle/club-match.js', 'src/league/season.js',
  'src/scouting/opponent-report.js', 'api/opponent-scout.js',
  'assets/opponent-scout-ui.js', 'assets/pokemon-expedition.js','assets/management-ui.js','assets/match-feedback.js','assets/finance-ui.js','src/finance/club-finance.js','assets/match-registration-ui.js','src/core/match-registration.js','src/core/league-rules.js','src/battle/relay-state.js','src/battle/enhancement.js']) {
  if (!existsSync(new URL(path, root))) throw new Error(`엔진 파일 누락: ${path}`);
  if (path.startsWith('assets/')&&path!=='assets/finance-ui.js'&&path!=='assets/match-registration-ui.js')
    new Script(readFileSync(new URL(path,root),'utf8'),{filename:path});
}
console.log(`웹 기준 버전 검사 통과: 스크립트 ${scripts}개, 이미지 파일 ${assets.size}개, 전투/리그 코드 보존`);
