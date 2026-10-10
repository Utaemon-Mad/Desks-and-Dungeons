// Service worker mínimo: permite instalar el juego como aplicación.
// No guarda nada en caché (el servidor ya usa ETag); sólo enseña un aviso si no hay conexión.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).catch(() => new Response(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Sin conexión</title>' +
    '<body style="background:#1a0606;color:#f3e6c8;font:18px system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center">' +
    '<div><h1 style="color:#e2493a">Desks &amp; Dungeons</h1><p>No hay conexión con la taberna.</p><p>Comprueba tu internet y vuelve a intentarlo.</p>' +
    '<button onclick="location.reload()" style="font-size:18px;padding:10px 20px;border-radius:8px;border:0;background:#e0a93a">Reintentar</button></div>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
});
