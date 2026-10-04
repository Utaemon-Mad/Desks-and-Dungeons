// Prueba rápida: dos amigos entran en la misma sala, charlan, compran, comercian, reparten puntos,
// se equipan y bajan a una mazmorra; y una partida de prueba comprueba el combate, el botín y los jefes.
process.env.PORT = process.env.PORT || '3999';
const fs = require('fs');
const os = require('os');
const path = require('path');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dd-test-'));
process.env.DD_TEST_FAST = '1';
const assert = require('assert');
const WebSocket = require('ws');
const { server } = require('../server.js');
const RULES = require('../public/rules/engine.js');
const GEN = require('../server/gen.js');
const { Instance } = require('../server/dungeon.js');

const url = `ws://localhost:${process.env.PORT}/ws`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function client(name) {
  const ws = new WebSocket(url);
  const inbox = [];
  const waiters = [];
  ws.on('message', (d) => {
    const m = JSON.parse(d);
    const w = waiters.find((x) => x.pred(m));
    if (w) { waiters.splice(waiters.indexOf(w), 1); w.resolve(m); } else { inbox.push(m); if (inbox.length > 400) inbox.shift(); }
  });
  const next = (pred, ms = 3000) => {
    const found = inbox.find(pred);
    if (found) { inbox.splice(inbox.indexOf(found), 1); return Promise.resolve(found); }
    return new Promise((resolve, reject) => {
      const w = { pred, resolve };
      waiters.push(w);
      setTimeout(() => { if (waiters.includes(w)) { waiters.splice(waiters.indexOf(w), 1); reject(new Error(`${name}: timeout ${pred.toString().slice(0,120)}`)); } }, ms);
    });
  };
  const last = (pred) => [...inbox].reverse().find(pred);
  const send = (m) => ws.send(JSON.stringify(m));
  return new Promise((res) => ws.on('open', () => res({ ws, next, send, last, inbox })));
}

// ---------- Reglas ----------
function rulesTests() {
  const rng = RULES.seeded('pruebas');
  // probabilidades de las cuatro rarezas: 50%, 20%, 5% y 1%
  const count = {};
  for (let i = 0; i < 40000; i++) { const r = RULES.rollRarity(rng, 0); count[r] = (count[r] || 0) + 1; }
  const pct = (k) => count[k] / 400;
  assert.ok(Math.abs(pct('comun') - 50) < 1.5 && Math.abs(pct('raro') - 20) < 1.2 && Math.abs(pct('epico') - 5) < 0.6 && Math.abs(pct('legendario') - 1) < 0.3, 'rarezas 50/20/5/1');
  // cuanto más rara, mejor: el mismo arma a nivel 5
  const dmg = (r) => RULES.makeItem(rng, { ilvl: 5, rarity: r, slot: 'arma', base: 'espada' }).dmg[1];
  assert.ok(dmg('comun') < dmg('raro') && dmg('raro') < dmg('epico') && dmg('epico') < dmg('legendario'));
  // conjunto de clase con su característica principal
  const set = RULES.makeItem(rng, { ilvl: 8, rarity: 'conjunto', set: 'mago' });
  assert.ok(set.set === 'mago' && set.stats.car > 0 && set.name.includes('Archimago'));
  // multiclase: habilidades de las dos clases, las de la segunda más tarde
  const ch = RULES.newChar('guerrero', 'clerigo');
  const d = RULES.derive({ xp: 0, char: ch, equip: {}, buffs: {} });
  assert.ok(d.abilities.some((a) => a.id === 'golpe' && a.ready) && d.abilities.some((a) => a.id === 'curar' && !a.ready && a.unlock === 3));
  assert.strictEqual(d.points, RULES.POINTS_START);
  assert.deepStrictEqual(Object.keys(d.stats), ['fue', 'des', 'con', 'vit', 'res', 'car', 'sue']);
  // no se puede llevar placas siendo mago
  const plate = RULES.makeItem(rng, { ilvl: 1, slot: 'pecho', base: 'placas' });
  assert.strictEqual(RULES.canEquip(plate, RULES.newChar('mago'), 1).ok, false);
  assert.strictEqual(RULES.canEquip(plate, RULES.newChar('mago', 'paladin'), 1).ok, true, 'la multiclase suma armaduras');
  // la mazmorra escala con el nivel
  assert.ok(RULES.monsterAt('orc', 10).hp > RULES.monsterAt('orc', 1).hp * 4);
  // mazmorras aleatorias: siempre jugables
  for (const theme of Object.keys(RULES.THEMES)) {
    const g = GEN.generate({ theme, level: 4, seed: theme });
    assert.ok(g.spawns.some((s) => s.boss && s.k === RULES.THEMES[theme].boss), 'tiene su jefe');
    assert.strictEqual(g.tiles.length, g.w * g.h);
  }
}

// ---------- Partida de prueba (sin red) ----------
async function instanceTests() {
  const W = 14, H = 5;
  const rows = ['#'.repeat(W), '#' + '.'.repeat(W - 2) + '#', '#' + '.'.repeat(W - 2) + '#', '#' + '.'.repeat(W - 2) + '#', '#'.repeat(W)];
  const sent = [];
  const rewards = { xp: 0, gold: 0 };
  const bag = [];
  const profile = { xp: 0, gold: 0, char: RULES.newChar('guerrero'), equip: {}, buffs: {} };
  for (const it of RULES.starterItems('guerrero', Math.random)) profile.equip[it.slot] = it;
  const user = { id: 'u1', name: 'Tester', look: { cls: 'guerrero' }, profile };
  const hooks = {
    send: (u, m) => sent.push(typeof m === 'string' ? JSON.parse(m) : m),
    derive: (u) => RULES.derive(u.profile),
    reward: (u, xp, gold) => { rewards.xp += xp; rewards.gold += gold; },
    give: (u, it) => { bag.push(it); return true; },
    giveCons: () => true,
    exit: () => {}, portal: () => {},
  };
  const def = { id: 'test', kind: 'dungeon', level: 1, name: 'Pasillo', w: W, h: H, tiles: rows.join(''), start: { x: 1, y: 2 }, props: [], chests: [{ x: 12, y: 1 }], spawns: [{ k: 'goblin-minion', x: 4, y: 2, pack: 'a' }] };
  const inst = new Instance(def, hooks);
  inst.join(user);
  assert.strictEqual(sent[0].t, 'dstart');
  const goblin = [...inst.enemies.values()][0];
  inst.attack('u1', goblin.id);
  const run = async (ms, until) => { const end = Date.now() + ms; while (Date.now() < end) { inst.tick(Date.now()); if (until && until()) return true; await sleep(25); } return false; };
  // el héroe va solo hasta el goblin y le pega hasta matarlo
  assert.ok(await run(8000, () => !inst.enemies.size), 'el goblin muere');
  await run(200);
  const snaps = sent.filter((m) => m.t === 'dsnap');
  const events = snaps.flatMap((s) => s.events);
  assert.ok(events.some((e) => e.e === 'hit' && e.by === 'u1' && e.dmg > 0), 'golpes del héroe');
  const die = events.find((e) => e.e === 'die');
  assert.ok(die && die.xp > 0 && rewards.xp > 0, 'experiencia');
  // el botín cae al suelo y se recoge al pisarlo
  await run(300);
  const loot = [...inst.loot.values()];
  if (loot.length) {
    inst.go('u1', loot[0].x, loot[0].y);
    assert.ok(await run(4000, () => !inst.loot.has(loot[0].id)), 'recoge el botín');
  }
  // el cofre se abre al llegar a él
  inst.go('u1', 12, 1);
  assert.ok(await run(5000, () => inst.chests.values().next().value.open), 'abre el cofre');

  // Arquero: el proyectil va a la casilla donde estabas; si te mueves, lo esquivas
  inst.addEnemy('skeleton-archer', 12, 3, 1, Date.now());
  const archer = [...inst.enemies.values()].find((e) => e.k === 'skeleton-archer');
  const p = inst.players.get('u1');
  p.x = 6; p.y = 3; p.target = null; p.path = []; p.goal = null;
  archer.aggro = 'u1'; archer.nextAttack = 0;
  sent.length = 0;
  await run(200);
  const proj = sent.filter((m) => m.t === 'dsnap').flatMap((s) => s.events).find((e) => e.e === 'proj');
  assert.ok(proj, 'el arquero dispara');
  assert.deepStrictEqual(proj.to, { x: 6, y: 3 });
  p.x = 6; p.y = 1; // se aparta antes de que llegue
  await run(proj.dur + 150);
  assert.ok(!sent.filter((m) => m.t === 'dsnap').flatMap((s) => s.events).some((e) => e.e === 'hit' && e.t === 'u1' && e.kind === 'proj'), 'el proyectil esquivado no hace daño');
  inst.enemies.delete(archer.id);

  // Jefe: avisa en el suelo antes del golpe
  inst.addEnemy('rey-goblin', 8, 2, 1, Date.now());
  const boss = [...inst.enemies.values()].find((e) => e.k === 'rey-goblin');
  boss.aggro = 'u1'; boss.nextSpecial = 0; boss.m.specials = ['slam'];
  p.x = 9; p.y = 2;
  sent.length = 0;
  await run(150);
  const tele = sent.filter((m) => m.t === 'dsnap').flatMap((s) => s.events).find((e) => e.e === 'tele');
  assert.ok(tele && tele.cells.length > 5, 'aviso del golpe del jefe');
  // matar al jefe abre el portal de salida y suelta botín de conjunto con suerte
  inst.damageEnemy(p, boss, 99999, { noCrit: true });
  assert.ok(inst.portal && inst.bossDead, 'portal tras el jefe');
}

(async () => {
  rulesTests();
  await instanceTests();

  await new Promise((r) => server.listen(process.env.PORT, r));
  const tokA = 'a'.repeat(32), tokB = 'b'.repeat(32);
  const a = await client('Ana');
  a.send({ t: 'join', room: 'Prueba Sala', name: 'Ana', look: { cls: 'mago', skin: 1, hair: 2 }, token: tokA });
  const wa = await a.next((m) => m.t === 'welcome');
  assert.strictEqual(wa.room, 'prueba-sala');
  assert.strictEqual(wa.users.length, 1);
  assert.strictEqual(wa.owner, true, 'quien abre la sala es su dueño');
  assert.ok(wa.items.length > 10, 'llegan los muebles');
  const meA = await a.next((m) => m.t === 'me');
  assert.strictEqual(meA.char.cls, 'mago');
  assert.strictEqual(meA.equip.arma.base, 'baston', 'equipo inicial del mago');
  assert.strictEqual(meA.cons['pocion-vida-p'], 3);

  const b = await client('Beto');
  b.send({ t: 'join', room: 'prueba-sala', name: 'Beto', look: { cls: 'hacker', cls2: 'clerigo', skin: 99 }, token: tokB });
  const wb = await b.next((m) => m.t === 'welcome');
  assert.strictEqual(wb.users.length, 2);
  assert.strictEqual(wb.owner, false);
  const beto = wb.users.find((u) => u.id === wb.id);
  assert.strictEqual(beto.look.cls, 'guerrero', 'clase inválida → guerrero');
  assert.strictEqual(beto.look.cls2, 'clerigo', 'multiclase');
  assert.strictEqual(beto.look.gear.w, 'espada', 'el equipo se ve');
  let meB = await b.next((m) => m.t === 'me');

  // Movimiento en la taberna
  a.send({ t: 'move', x: 4, y: 5 });
  const mv = await b.next((m) => m.t === 'move');
  assert.deepStrictEqual([mv.x, mv.y], [4, 5]);
  b.send({ t: 'move', x: 4, y: 6 }); // mesa
  b.send({ t: 'move', x: 0, y: 3 }); // comerciante
  b.send({ t: 'move', x: 2, y: 2 });
  const mv2 = await a.next((m) => m.t === 'move' && m.id === wb.id);
  assert.deepStrictEqual([mv2.x, mv2.y], [2, 2], 'sólo pasa el movimiento válido');

  // Chat y dados
  b.send({ t: 'chat', text: '  ¡Hola   Ana!\u0007 ' });
  const ch = await a.next((m) => m.t === 'chat');
  assert.strictEqual(ch.text, '¡Hola Ana!');
  a.send({ t: 'chat', text: '/d6' });
  const r = await b.next((m) => m.t === 'roll');
  assert.ok(r.value >= 1 && r.value <= 6 && r.sides === 6);

  // Puntos de características: 5 al empezar
  b.send({ t: 'char:points', alloc: { fue: 3, vit: 2 } });
  meB = await b.next((m) => m.t === 'me');
  assert.strictEqual(meB.char.alloc.fue, 3);
  b.send({ t: 'char:points', alloc: { fue: 1 } });
  assert.match((await b.next((m) => m.t === 'error')).text, /puntos/);

  // Tiendas: la bruja vende pociones, Takeshi armas y armaduras, el de la túnica pergaminos y bufos
  b.send({ t: 'shop:open', npc: 'bruja' });
  const shop = await b.next((m) => m.t === 'shop');
  const pot = shop.list.find((x) => x.id === 'pocion-vida-p');
  b.send({ t: 'shop:buy', npc: 'bruja', id: 'pocion-vida-p', n: 2 });
  meB = await b.next((m) => m.t === 'me' && m.cons['pocion-vida-p'] === 5);
  assert.strictEqual(meB.gold, 50 - pot.price * 2);
  b.send({ t: 'shop:open', npc: 'armero' });
  const arm = await b.next((m) => m.t === 'shop' && m.npc === 'armero');
  assert.strictEqual(arm.items.length, 8);
  a.send({ t: 'shop:open', npc: 'mago' });
  const mago = await a.next((m) => m.t === 'shop' && m.npc === 'mago');
  assert.ok(mago.buffs.length >= 4 && mago.list.some((c) => c.id === 'perg-retorno'));
  a.send({ t: 'shop:buy', npc: 'mago', buff: 'vigor' });
  assert.match((await a.next((m) => m.t === 'error')).text, /oro/, 'los bufos cuestan 60 de oro');
  a.send({ t: 'shop:buy', npc: 'mago', id: 'perg-retorno' });
  await a.next((m) => m.t === 'me' && m.cons['perg-retorno'] === 1);

  // Comercio: Ana da oro, Beto da su escudo
  b.send({ t: 'inv:unequip', slot: 'mano' });
  meB = await b.next((m) => m.t === 'me' && m.bag.length === 1);
  const shield = meB.bag[0];
  a.send({ t: 'trade:req', to: wb.id });
  await b.next((m) => m.t === 'trade:invite');
  b.send({ t: 'trade:accept', from: wa.id });
  await a.next((m) => m.t === 'trade:state');
  b.send({ t: 'trade:offer', items: [shield.id], gold: 0 });
  a.send({ t: 'trade:offer', items: [], gold: 10 });
  await a.next((m) => m.t === 'trade:state' && m.a.gold === 10 && m.b.items.length === 1);
  a.send({ t: 'trade:ok' }); b.send({ t: 'trade:ok' });
  await a.next((m) => m.t === 'trade:end' && /Trato/.test(m.text));
  const meA3 = await a.next((m) => m.t === 'me' && m.bag.some((it) => it.id === shield.id));
  assert.ok(meA3, 'Ana recibe el escudo');
  // Ana no puede ponerse un escudo (mago); Beto se pone otro objeto
  a.send({ t: 'inv:equip', id: shield.id });
  assert.match((await a.next((m) => m.t === 'error')).text, /no sabe usar/);
  a.send({ t: 'shop:sell', id: shield.id });
  const sold = await a.next((m) => m.t === 'sold');
  assert.ok(sold.gold > 0);

  // Editor de la taberna: sólo el dueño; nadie pone muebles sobre los comerciantes
  b.send({ t: 'tedit', op: 'place', type: 'plant', x: 8, y: 6 });
  assert.match((await b.next((m) => m.t === 'error')).text, /dueño/);
  a.send({ t: 'tedit', op: 'place', type: 'fireplace', x: 8, y: 6 });
  const ti = await b.next((m) => m.t === 'titems');
  assert.ok(ti.items.some((it) => it.type === 'fireplace' && it.x === 8 && it.y === 6));
  a.send({ t: 'tedit', op: 'place', type: 'plant', x: 0, y: 6 });
  a.send({ t: 'tedit', op: 'remove', x: 8, y: 6 });
  const ti2 = await b.next((m) => m.t === 'titems' && !m.items.some((it) => it.x === 8 && it.y === 6));
  assert.ok(!ti2.items.some((it) => it.x === 0 && it.y === 6), 'el puesto de la bruja está protegido');

  // Mazmorras aleatorias con nivel: Beto crea una y Ana se une desde la lista
  b.send({ t: 'dnew', theme: 'cripta', level: 2 });
  const ds = await b.next((m) => m.t === 'dstart');
  assert.strictEqual(ds.dungeon.theme, 'cripta');
  assert.strictEqual(ds.dungeon.level, 2);
  assert.ok(ds.enemies.some((e) => e.boss), 'hay jefe');
  assert.ok(ds.dungeon.props.length > 10, 'hay decorado');
  b.send({ t: 'dnew', level: 99 }); // ya está dentro: se ignora
  a.send({ t: 'dmenu' });
  const menu = await a.next((m) => m.t === 'dmenu');
  const open = menu.list.find((x) => x.id === ds.dungeon.id);
  assert.ok(open && open.players.includes('Beto'), 'partida abierta en la lista');
  a.send({ t: 'djoin', id: ds.dungeon.id });
  const dsA = await a.next((m) => m.t === 'dstart');
  assert.strictEqual(dsA.players.length, 2);
  // moverse con clic: el servidor mueve al héroe
  const start = dsA.players.find((p) => p.id === wa.id);
  a.send({ t: 'ddir', dx: 1, dy: 0 });
  await sleep(500);
  a.send({ t: 'ddir', dx: 0, dy: 0 });
  const snap = await a.next((m) => m.t === 'dsnap' && m.players.some((p) => p.id === wa.id && (p.x !== start.x || p.y !== start.y)), 3000).catch(() => null);
  assert.ok(snap, 'el héroe se mueve');
  a.send({ t: 'duse', cid: 'pocion-vida-p' });
  await a.next((m) => m.t === 'me' && m.cons['pocion-vida-p'] === 2);
  a.send({ t: 'dleave' });
  assert.strictEqual((await a.next((m) => m.t === 'dexit')).reason, 'leave');
  b.send({ t: 'dleave' });
  await b.next((m) => m.t === 'dexit');

  // Mundo abierto: cuevas a mazmorras de cada tema
  b.send({ t: 'wenter' });
  const wd = await b.next((m) => m.t === 'dstart');
  assert.strictEqual(wd.dungeon.kind, 'world');
  assert.ok(wd.enemies.length >= 10, 'hay enemigos por el mundo');
  assert.ok(wd.dungeon.labels.some((l) => /Cripta \(nv 4\)/.test(l.text)), 'cuevas con nivel');
  b.send({ t: 'dleave' });
  assert.strictEqual((await b.next((m) => m.t === 'dexit')).reason, 'leave');

  // El perfil se guarda con el token
  b.ws.close();
  await a.next((m) => m.t === 'leave' && m.id === wb.id);
  const b2 = await client('Beto2');
  b2.send({ t: 'join', room: 'prueba-sala', name: 'Beto', look: { cls: 'guerrero', cls2: 'clerigo' }, token: tokB });
  await b2.next((m) => m.t === 'welcome');
  const me2 = await b2.next((m) => m.t === 'me');
  assert.strictEqual(me2.char.alloc.fue, 3, 'conserva sus puntos');
  assert.strictEqual(me2.cons['pocion-vida-p'], 5);
  b2.ws.close();

  // Ficheros estáticos y protección de rutas
  const http = require('http');
  const get = (p) => new Promise((res) => http.get(`http://localhost:${process.env.PORT}${p}`, (rs) => { rs.resume(); res(rs.statusCode); }));
  assert.strictEqual(await get('/'), 200);
  assert.strictEqual(await get('/rules/engine.js'), 200);
  assert.notStrictEqual(await get('/../server.js'), 200);
  assert.notStrictEqual(await get('/%2e%2e/server.js'), 200);

  console.log('✔ Todas las pruebas pasan');
  a.ws.close();
  server.close();
  process.exit(0);
})().catch((e) => { console.error('✘', e); process.exit(1); });
