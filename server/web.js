'use strict';
// Archivos estáticos (gzip + ETag), tipos MIME, panel /admin y registro de errores de los navegadores.
// Lo usa server.js: recibe lo que necesita del servidor y devuelve sus funciones.
module.exports = function (ctx) {
  const { cleanText, crypto, fs, http, path, rooms, serverName, store, system, zlib } = ctx;

  const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.json': 'application/json; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.pdf': 'application/pdf',
    '.ico': 'image/x-icon',
    '.glb': 'model/gltf-binary',
    '.txt': 'text/plain; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
  };

  // Panel de administración (solo con ADMIN_KEY en el entorno): gente conectada y errores de los navegadores
  const ADMIN_KEY = process.env.ADMIN_KEY || '';
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function adminPage(req, res) {
    const key = new URL(req.url, 'http://x').searchParams.get('key') || '';
    const ok = ADMIN_KEY && key.length === ADMIN_KEY.length && crypto.timingSafeEqual(Buffer.from(key), Buffer.from(ADMIN_KEY));
    if (!ok) { res.writeHead(404); return res.end(); }
    const errors = (store.meta('clientErrors') || []).slice().reverse();
    const online = [...rooms.values()].map((r) => `<li><b>${esc(serverName(r.name))}</b>: ${[...r.users.values()].map((u) => esc(u.name) + (u.where ? ` <i>(${esc(u.where.name)})</i>` : '')).join(', ') || 'nadie'}${r.motd ? ` · 📌 ${esc(r.motd)}` : ''}</li>`).join('');
    const rows = errors.map((e) => `<tr><td>${new Date(e.ts).toLocaleString('es-ES')}</td><td>${esc(e.who)}</td><td>${esc(e.msg)}</td><td>${esc(e.src)}:${e.line || ''}</td><td><small>${esc(e.ua)}</small></td></tr>`).join('');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Administración · Desks & Dungeons</title>
  <style>body{font:14px system-ui,sans-serif;background:#1c120c;color:#f3e6c8;margin:20px}h1{color:#e2493a}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #4a3020;padding:4px 6px;text-align:left;vertical-align:top}th{color:#e0a93a}i{color:#b99a72}</style>
  <h1>Desks & Dungeons · administración</h1><p>Arrancado: ${new Date(Date.now() - process.uptime() * 1000).toLocaleString('es-ES')} · memoria ${Math.round(process.memoryUsage().rss / 1048576)} MB</p>
  <h2>Conectados</h2><ul>${online || '<li>Nadie conectado</li>'}</ul>
  <h2>Errores en los navegadores (${errors.length})</h2><table><tr><th>Cuándo</th><th>Quién</th><th>Error</th><th>Dónde</th><th>Navegador</th></tr>${rows || '<tr><td colspan=5>Sin errores 🎉</td></tr>'}</table>`);
  }
  function logClientError(user, msg) {
    const list = store.meta('clientErrors') || [];
    list.push({ ts: Date.now(), who: user ? user.name : '?', msg: cleanText(String(msg.msg || ''), 300), src: cleanText(String(msg.src || ''), 120), line: Number(msg.line) || 0, ua: cleanText(String(msg.ua || ''), 120) });
    while (list.length > 200) list.shift();
    store.setMeta('clientErrors', list);
    console.warn('[navegador]', user ? user.name : '?', msg.msg, msg.src, msg.line);
  }

  // Archivos estáticos comprimidos (gzip) y con ETag: la primera visita baja todo comprimido y las siguientes
  // sólo preguntan si ha cambiado (304). Los modelos 3D y Three.js casi nunca cambian: se guardan un día.
  const staticCache = new Map(); // ruta -> { mtime, etag, raw, gz }
  const COMPRESS = new Set(['.html', '.js', '.css', '.json', '.svg', '.md', '.txt', '.webmanifest', '.glb']);
  function sendStatic(req, res, file) {
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404); return res.end('No encontrado'); }
      const ext = path.extname(file);
      const hit = staticCache.get(file);
      const ready = (c) => {
        const headers = {
          'Content-Type': MIME[ext] || 'application/octet-stream',
          ETag: c.etag,
          'Cache-Control': /[\\/](assets|vendor)[\\/]/.test(file) ? 'public, max-age=86400' : 'no-cache',
          Vary: 'Accept-Encoding',
        };
        if (req.headers['if-none-match'] === c.etag) { res.writeHead(304, headers); return res.end(); }
        const gzipOk = c.gz && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
        if (gzipOk) headers['Content-Encoding'] = 'gzip';
        const body = gzipOk ? c.gz : c.raw;
        headers['Content-Length'] = body.length;
        res.writeHead(200, headers);
        res.end(req.method === 'HEAD' ? undefined : body);
      };
      if (hit && hit.mtime === st.mtimeMs) return ready(hit);
      fs.readFile(file, (err2, raw) => {
        if (err2) { res.writeHead(404); return res.end('No encontrado'); }
        const c = { mtime: st.mtimeMs, etag: '"' + crypto.createHash('sha1').update(raw).digest('base64').slice(0, 16) + '"', raw, gz: null };
        if (COMPRESS.has(ext) && raw.length > 1024) c.gz = zlib.gzipSync(raw, { level: 6 });
        staticCache.set(file, c);
        ready(c);
      });
    });
  }

  return { adminPage, logClientError, sendStatic };
};
