import matchHandler from '../api/match.js';
import scoutHandler from '../api/opponent-scout.js';
import movesHandler from '../api/trainer-moves.js';
const handlers={'/api/match':matchHandler,'/api/opponent-scout':scoutHandler,'/api/trainer-moves':movesHandler};
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve, sep, extname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const types = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8'};
createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (handlers[pathname]) {
      res.setHeader('Content-Type','application/json; charset=utf-8');
      let chunks = [], size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > (pathname==='/api/trainer-moves'?900000:262144)) {res.writeHead(413).end(); return;}
        chunks.push(chunk);
      }
      try {req.body = JSON.parse(Buffer.concat(chunks).toString() || '{}');}
      catch {res.writeHead(400).end(JSON.stringify({error:'요청 형식 오류'})); return;}
      await handlers[pathname](req, res); return;
    }
    const path = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    const relative = path.slice(root.length);
    if (!path.startsWith(root) || relative.split(sep).some(part => part.startsWith('.') || part === 'node_modules')) {
      res.writeHead(403).end(); return;
    }
    const body = await readFile(path);
    res.writeHead(200, {'Content-Type': types[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-cache'});
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(8000, '127.0.0.1', () => console.log('http://127.0.0.1:8000'));
