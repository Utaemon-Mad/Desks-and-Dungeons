// Servidor estático mínimo para probar La Taberna del Cuervo en local (sin dependencias).
// Uso: node taberna-iso/serve.js [puerto]   →   http://localhost:8080
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = __dirname;
const PORT = Number(process.argv[2] || process.env.PORT || 8080);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.glb': 'model/gltf-binary', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json' };

http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  const file = path.normalize(path.join(ROOT, rel === '/' ? 'index.html' : rel));
  if (!file.startsWith(ROOT + path.sep) && file !== ROOT) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('No encontrado'); }
    const ext = path.extname(file);
    const headers = { 'content-type': TYPES[ext] || 'application/octet-stream', 'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=3600' };
    if (/\b(js|css|html|txt)\b/.test(ext) && /gzip/.test(req.headers['accept-encoding'] || '')) {
      headers['content-encoding'] = 'gzip';
      res.writeHead(200, headers); return res.end(zlib.gzipSync(data));
    }
    res.writeHead(200, headers); res.end(data);
  });
}).listen(PORT, () => console.log(`La Taberna del Cuervo en http://localhost:${PORT}`));
