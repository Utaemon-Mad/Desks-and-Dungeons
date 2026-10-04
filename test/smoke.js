// Prueba rápida: dos amigos entran en la misma sala, se mueven y charlan.
process.env.PORT = process.env.PORT || '3999';
const fs = require('fs');
const os = require('os');
const path = require('path');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dd-test-'));
process.env.DD_TEST_FAST = '1';
const assert = require('assert');
const WebSocket = require('ws');
const { server } = require('../server.js');
const DUNGEON = require('../public/dungeon-data.js');
const RULES = require('../public/rules/engine.js');
const MONSTERS = require('../public/rules/monsters.json');

const url = `ws://localhost:${process.env.PORT}/ws`;

function client(name) {
  const ws = new WebSocket(url);
  const inbox = [];
  const waiters = [];
  ws.on('message', (d) => {
    const m = JSON.parse(d);
    const w = waiters.find((x) => x.pred(m));
    if (w) { waiters.splice(waiters.indexOf(w), 1); w.resolve(m); } else inbox.push(m);
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
  await new Promise((r) => server.listen(process.env.PORT, r));
  const tokA = 'a'.repeat(32), tokB = 'b'.repeat(32);
  const a = await client('Ana');
  a.send({ t: 'join', room: 'Prueba Sala', name: 'Ana', look: { cls: 'maga', skin: 1, hair: 2 }, token: tokA });
  const wa = await a.next((m) => m.t === 'welcome');
  assert.strictEqual(wa.room, 'prueba-sala');
  assert.strictEqual(wa.users.length, 1);
  assert.strictEqual(wa.owner, true, 'quien abre la sala es su dueño');
  assert.ok(wa.items.length > 10, 'llegan los muebles');

  const b = await client('Beto');
  b.send({ t: 'join', room: 'prueba-sala', name: 'Beto', look: { cls: 'hacker', skin: 99 }, token: tokB });
  const wb = await b.next((m) => m.t === 'welcome');
  assert.strictEqual(wb.users.length, 2);
  assert.strictEqual(wb.owner, false);
  const beto = wb.users.find((u) => u.id === wb.id);
  assert.deepStrictEqual(beto.look, { cls: 'fighter', species: 'human', skin: 0, hair: 0 }, 'aspecto inválido saneado');
  assert.ok(RULES.validate(beto.sheet, 0).ok, 'recibe una ficha pregenerada válida');
  assert.strictEqual(beto.sheet.class, 'fighter');

  // Ficha: una inválida se rechaza y una válida se guarda y cambia el aspecto
  const wiz = RULES.pregen('wizard', 'elf', { name: 'Beto', look: { skin: 1, hair: 2 } });
  b.send({ t: 'sheet:save', sheet: { ...wiz, base: { str: 15, dex: 15, con: 15, int: 15, wis: 15, cha: 15 } } });
  const badSheet = await b.next((m) => m.t === 'sheet:saved');
  assert.strictEqual(badSheet.ok, false);
  assert.match(badSheet.errors.join(' '), /serie estándar/);
  b.send({ t: 'sheet:save', sheet: wiz });
  assert.ok((await b.next((m) => m.t === 'sheet:saved')).ok);
  const shMsg = await a.next((m) => m.t === 'sheet' && m.id === wb.id);
  assert.strictEqual(shMsg.look.cls, 'wizard');
  assert.strictEqual(shMsg.look.species, 'elf');
  // vuelve a guerrero para el combate de más abajo
  b.send({ t: 'sheet:save', sheet: RULES.pregen('fighter', 'human', { name: 'Beto' }) });
  assert.ok((await b.next((m) => m.t === 'sheet:saved')).ok);
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

  // Dados
  a.send({ t: 'chat', text: '/d6' });
  const r = await b.next((m) => m.t === 'roll');
  assert.ok(r.value >= 1 && r.value <= 6 && r.sides === 6);
  a.send({ t: 'chat', text: '/muro ya no existe' });
  const help = await a.next((m) => m.t === 'system' && /Comandos/.test(m.text));
  assert.ok(!/muro/.test(help.text), 'el muro de letras ya no está');

  // Invitar a una ronda cuesta oro
  a.send({ t: 'round', to: wb.id });
  await b.next((m) => m.t === 'drink' && m.id === wb.id);
  const g = await b.next((m) => m.t === 'profile' && m.id === wa.id);
  assert.strictEqual(g.gold, 45);

  // Editor de la taberna: sólo el dueño
  b.send({ t: 'tedit', op: 'place', type: 'plant', x: 8, y: 6 });
  const denied = await b.next((m) => m.t === 'error');
  assert.match(denied.text, /dueño/);
  a.send({ t: 'tedit', op: 'place', type: 'plant', x: 8, y: 6 });
  const ti = await b.next((m) => m.t === 'titems');
  assert.ok(ti.items.some((it) => it.type === 'plant' && it.x === 8 && it.y === 6));
  a.send({ t: 'tedit', op: 'place', type: 'chair', x: 12, y: 4, dir: 'N' }); // casilla del tabernero
  a.send({ t: 'tedit', op: 'remove', x: 8, y: 6 });
  const ti2 = await b.next((m) => m.t === 'titems' && !m.items.some((it) => it.x === 8 && it.y === 6));
  assert.ok(!ti2.items.some((it) => it.x === 12 && it.y === 4), 'nadie pone muebles sobre el tabernero');
  assert.ok(!ti2.items.some((it) => it.x === 8 && it.y === 6));

  // Mazmorras: lista, guardar, validar y jugar
  b.send({ t: 'dlist' });
  const dl = await b.next((m) => m.t === 'dlist');
  assert.ok(dl.list.some((d) => d.id === 'cripta'), 'hay una mazmorra de ejemplo');
  b.send({ t: 'dsave', dungeon: { name: 'Sin salida', tiles: '.'.repeat(DUNGEON.W * DUNGEON.H), objects: [{ k: 'start', x: 1, y: 1 }] } });
  const bad = await b.next((m) => m.t === 'dsaved');
  assert.strictEqual(bad.ok, false);
  // Pasillo: entrada, un goblin, un cofre y la salida
  const tiles = ('#'.repeat(DUNGEON.W)) + ('#' + '.'.repeat(DUNGEON.W - 2) + '#') + ('#'.repeat(DUNGEON.W)).repeat(DUNGEON.H - 2);
  const corridor = { name: 'Pasillo', tiles, objects: [{ k: 'start', x: 1, y: 1 }, { k: 'goblin-minion', x: 2, y: 1 }, { k: 'potion', x: 3, y: 1 }, { k: 'chest', x: 10, y: 1 }, { k: 'exit', x: 5, y: 1 }] };
  b.send({ t: 'dsave', dungeon: corridor });
  const ok = await b.next((m) => m.t === 'dsaved');
  assert.ok(ok.ok, ok.error);
  b.send({ t: 'denter', id: ok.id });
  const ds = await b.next((m) => m.t === 'dstart');
  assert.strictEqual(ds.players.length, 1);
  assert.strictEqual(ds.enemies[0].k, 'goblin-minion');
  assert.strictEqual(ds.you.maxHp, RULES.derive(RULES.pregen('fighter', 'human', {}), 0).hp);
  await a.next((m) => m.t === 'where' && m.id === wb.id && m.where === 'Pasillo');
  // Atacar al esbirro goblin (CA 12, 7 PG) con la espada larga (+5, 1d8+3) hasta derribarlo: tiradas d20 de verdad
  let died = null;
  const attacks = [];
  for (let i = 0; i < 25 && !died; i++) {
    b.send({ t: 'dact', act: 'attack', weapon: 0, target: ds.enemies[0].id });
    const snap = await b.next((m) => m.t === 'dsnap' && m.events.some((e) => e.e === 'attack' && e.by === wb.id));
    for (const ev of snap.events.filter((e) => e.e === 'attack' && e.by === wb.id)) attacks.push(ev);
    died = snap.events.find((e) => e.e === 'die');
    await new Promise((r) => setTimeout(r, 160));
  }
  assert.ok(died, 'el goblin muere');
  for (const ev of attacks) {
    assert.ok(ev.roll >= 1 && ev.roll <= 20 && ev.bonus === 5 && ev.total === ev.roll + 5 && ev.ac === 12, 'tirada de ataque d20 + 5 contra CA 12');
    assert.strictEqual(ev.hit, ev.roll === 20 || (ev.roll !== 1 && ev.total >= 12));
    if (ev.hit) assert.ok(ev.dmg >= 4 && ev.dmg <= (ev.crit ? 19 : 11), 'daño 1d8+3 (crítico 2d8+3)');
  }
  const minionXp = MONSTERS.find((m) => m.id === 'goblin-minion').xp;
  const xpMsg = await a.next((m) => m.t === 'profile' && m.id === wb.id && m.xp > 0);
  assert.strictEqual(xpMsg.xp, minionXp, 'experiencia oficial del monstruo');
  // Recoger las monedas, la poción y llegar a la salida
  for (let i = 0; i < 4; i++) { b.send({ t: 'dmove', dx: 1, dy: 0 }); await new Promise((r) => setTimeout(r, 200)); }
  const exit = await b.next((m) => m.t === 'dexit');
  assert.strictEqual(exit.reason, 'win');
  const final = await a.next((m) => m.t === 'profile' && m.id === wb.id && m.xp >= minionXp + DUNGEON.REWARDS.exit.xpPerLevel);
  assert.ok(final.gold > 50, 'gana oro');

  // Mundo abierto: se entra desde la taberna y se vuelve con un descanso largo
  b.send({ t: 'wenter' });
  const wd = await b.next((m) => m.t === 'dstart');
  assert.strictEqual(wd.dungeon.kind, 'world');
  assert.strictEqual(wd.dungeon.tiles.length, wd.dungeon.w * wd.dungeon.h);
  assert.ok(wd.enemies.length >= 10, 'hay enemigos por el mundo');
  assert.ok(wd.dungeon.labels.some((l) => /Cueva: La Cripta/.test(l.text)), 'hay una cueva hacia la mazmorra de ejemplo');
  b.send({ t: 'dleave' });
  assert.strictEqual((await b.next((m) => m.t === 'dexit')).reason, 'leave');

  // El perfil (experiencia y oro) se guarda con el token
  b.ws.close();
  await a.next((m) => m.t === 'leave' && m.id === wb.id);
  const b2 = await client('Beto2');
  b2.send({ t: 'join', room: 'prueba-sala', name: 'Beto', token: tokB });
  const wb2 = await b2.next((m) => m.t === 'welcome');
  const me2 = wb2.users.find((u) => u.id === wb2.id);
  assert.strictEqual(me2.xp, final.xp);
  assert.strictEqual(me2.gold, final.gold);
  b2.ws.close();

  // El historial llega a quien entra después
  const c = await client('Cris');
  c.send({ t: 'join', room: 'prueba-sala', name: 'Cris' });
  const wc = await c.next((m) => m.t === 'welcome');
  assert.ok(wc.history.some((m) => m.t === 'chat' && m.text === '¡Hola Ana!'));


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
