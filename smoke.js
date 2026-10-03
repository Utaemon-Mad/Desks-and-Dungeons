// Prueba rápida: dos amigos entran en la misma sala, se mueven y charlan.
process.env.PORT = process.env.PORT || '3999';
const assert = require('assert');
const WebSocket = require('ws');
const server = require('../server.js');

const url = `ws://localhost:${process.env.PORT}/ws`;

function client(name) {
  const ws = new WebSocket(url);
  const inbox = [];
  const waiters = [];
  ws.on('message', (d) => {
    const m = JSON.parse(d);
    inbox.push(m);
    for (const w of [...waiters]) if (w.pred(m)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(m); }
  });
  const next = (pred) => {
    const found = inbox.find(pred);
    if (found) { inbox.splice(inbox.indexOf(found), 1); return Promise.resolve(found); }
    return new Promise((resolve, reject) => {
      waiters.push({ pred, resolve });
      setTimeout(() => reject(new Error(`${name}: timeout`)), 3000);
    });
  };
  const send = (m) => ws.send(JSON.stringify(m));
  return new Promise((res) => ws.on('open', () => res({ ws, next, send })));
}

(async () => {
  const a = await client('Ana');
  a.send({ t: 'join', room: 'Prueba Sala', name: 'Ana', look: { cls: 'maga', skin: 1, hair: 2 } });
  const wa = await a.next((m) => m.t === 'welcome');
  assert.strictEqual(wa.room, 'prueba-sala');
  assert.strictEqual(wa.users.length, 1);

  const b = await client('Beto');
  b.send({ t: 'join', room: 'prueba-sala', name: 'Beto', look: { cls: 'hacker', skin: 99 } });
  const wb = await b.next((m) => m.t === 'welcome');
  assert.strictEqual(wb.users.length, 2);
  const beto = wb.users.find((u) => u.id === wb.id);
  assert.deepStrictEqual(beto.look, { cls: 'guerrero', skin: 0, hair: 0 }, 'aspecto inválido saneado');
  await a.next((m) => m.t === 'join' && m.user.name === 'Beto');

  // Movimiento válido a una silla, y movimiento a una casilla bloqueada (ignorado)
  a.send({ t: 'move', x: 4, y: 5 });
  const mv = await b.next((m) => m.t === 'move');
  assert.deepStrictEqual([mv.x, mv.y], [4, 5]);
  b.send({ t: 'move', x: 4, y: 6 }); // mesa
  b.send({ t: 'move', x: 4, y: 5 }); // silla ocupada
  b.send({ t: 'move', x: 2, y: 2 });
  const mv2 = await a.next((m) => m.t === 'move' && m.id === wb.id);
  assert.deepStrictEqual([mv2.x, mv2.y], [2, 2], 'sólo pasa el movimiento válido');

  // Chat
  b.send({ t: 'chat', text: '  ¡Hola   Ana!\u0007 ' });
  const ch = await a.next((m) => m.t === 'chat');
  assert.strictEqual(ch.text, '¡Hola Ana!');
  assert.strictEqual(ch.name, 'Beto');

  // Dados y muro
  a.send({ t: 'chat', text: '/d6' });
  const r = await b.next((m) => m.t === 'roll');
  assert.ok(r.value >= 1 && r.value <= 6 && r.sides === 6);
  a.send({ t: 'chat', text: '/muro estoy aqui' });
  const w = await b.next((m) => m.t === 'wall');
  assert.strictEqual(w.text, 'estoy aqui');

  // Invitar a una ronda cuesta oro
  a.send({ t: 'round', to: wb.id });
  await b.next((m) => m.t === 'drink' && m.id === wb.id);
  const g = await b.next((m) => m.t === 'gold' && m.id === wa.id);
  assert.strictEqual(g.gold, 45);

  // El historial llega a quien entra después
  const c = await client('Cris');
  c.send({ t: 'join', room: 'prueba-sala', name: 'Cris' });
  const wc = await c.next((m) => m.t === 'welcome');
  assert.ok(wc.history.some((m) => m.t === 'chat' && m.text === '¡Hola Ana!'));

  // Salida
  b.ws.close();
  await a.next((m) => m.t === 'leave' && m.id === wb.id);

  // Ficheros estáticos y protección de rutas
  const http = require('http');
  const get = (p) => new Promise((res) => http.get(`http://localhost:${process.env.PORT}${p}`, (r) => { r.resume(); res(r.statusCode); }));
  assert.strictEqual(await get('/'), 200);
  assert.strictEqual(await get('/map.js'), 200);
  assert.notStrictEqual(await get('/../server.js'), 200);
  assert.notStrictEqual(await get('/%2e%2e/server.js'), 200);

  console.log('✔ Todas las pruebas pasan');
  a.ws.close(); c.ws.close();
  server.close();
  process.exit(0);
})().catch((e) => { console.error('✘', e); process.exit(1); });
