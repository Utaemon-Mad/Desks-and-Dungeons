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
const { server, store, rooms } = require('../server.js');
const RULES = require('../public/rules/engine.js');
const MAP = require('../public/map.js');
const PROG = require('../public/rules/progress.js');
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
  const cl = { ws, next, send, last, inbox }; (global.__clients = global.__clients || []).push(cl);
  return new Promise((res) => ws.on('open', () => res(cl)));
}

// ---------- Reglas ----------
function rulesTests() {
  const rng = RULES.seeded('pruebas');
  // calidades de Diablo 2: inferior 8%, normal 30%, superior 10%, mágico 20%, raro 5%, único 1%
  const count = {};
  for (let i = 0; i < 40000; i++) { const r = RULES.rollRarity(rng, 0); count[r] = (count[r] || 0) + 1; }
  const pct = (k) => count[k] / 400;
  assert.ok(Math.abs(pct('normal') - 30) < 1.5 && Math.abs(pct('magico') - 20) < 1.2 && Math.abs(pct('raro') - 5) < 0.6 && Math.abs(pct('unico') - 1) < 0.3 && Math.abs(pct('inferior') - 8) < 0.8, 'calidades');
  // el hallazgo mágico cuenta menos para únicos que para mágicos (rendimientos decrecientes)
  const c2 = {};
  for (let i = 0; i < 40000; i++) { const r = RULES.rollRarity(rng, 300); c2[r] = (c2[r] || 0) + 1; }
  assert.ok(c2.magico / count.magico > c2.unico / count.unico, 'hallazgo mágico con rendimientos decrecientes');
  // botín: los enemigos normales sueltan poco y básico; élites y jefes, mejor
  const lootStats = (o, n = 6000) => { let items = 0, good = 0; for (let i = 0; i < n; i++) for (const it of RULES.rollLoot(rng, o)) { items++; if (['raro', 'unico', 'conjunto'].includes(it.rarity)) good++; } return { per: items / n, good: good / n }; };
  const ln = lootStats({ ilvl: 3 }), le = lootStats({ ilvl: 3, elite: true }), lb = lootStats({ ilvl: 3, boss: true }, 2000);
  assert.ok(ln.per < 0.15 && ln.good < 0.005, `un enemigo normal suelta poco (${ln.per.toFixed(3)} objetos, ${ln.good.toFixed(4)} raros)`);
  assert.ok(le.per > ln.per * 4 && lb.good > le.good, 'los élites y los jefes sueltan más y mejor');
  // legendarios: únicos con un poder que se nota en la ficha
  const legIt = RULES.makeItem(rng, { ilvl: 20, rarity: 'unico', slot: 'arma', base: 'espada', leg: 'trueno' });
  assert.ok(legIt.leg === 'trueno' && RULES.describe(legIt).some((t) => /Legendario/.test(t)), 'legendario con su poder');
  assert.ok(RULES.derive({ char: RULES.newChar('guerrero', {}), xp: RULES.XP_TABLE[20], equip: { arma: legIt }, buffs: {} }).leg.trueno, 'el poder se activa al llevarlo');
  let legs = 0; for (let i = 0; i < 4000; i++) for (const it of RULES.rollLoot(rng, { ilvl: 5 })) if (it.leg) legs++;
  assert.ok(legs <= 6, `los enemigos normales casi nunca sueltan legendarios (${legs} en 4000)`);
  // armas: tres niveles (normal, excepcional, élite) que pegan más y piden más
  const t = [0, 1, 2].map((tier) => RULES.makeItem(rng, { ilvl: 40, rarity: 'normal', slot: 'arma', base: 'espada', tier, sk: 0 }));
  assert.ok(t[0].dmg[1] < t[1].dmg[1] && t[1].dmg[1] < t[2].dmg[1], 'el élite pega más');
  assert.ok(t[0].reqStats.fue < t[2].reqStats.fue && t[2].req >= RULES.TIERS[2].lvl, 'y pide más Fuerza y nivel');
  assert.ok(/Hoja fásica/.test(t[2].name) && /élite/i.test(RULES.typeLine(t[2])), 'nombre del tipo élite');
  // variantes: 4 por nivel en armas y armaduras, con nombre propio; las estadísticas son las del nivel
  const v3 = RULES.makeItem(RULES.seeded('var'), { ilvl: 40, rarity: 'normal', slot: 'arma', base: 'espada', tier: 2, sk: 3 });
  assert.ok(v3.sk === 3 && v3.name === 'Hoja del vacío' && v3.reqStats.fue === t[2].reqStats.fue, 'variante de arma');
  assert.strictEqual(RULES.makeItem(rng, { ilvl: 40, rarity: 'normal', slot: 'pecho', base: 'placas', tier: 2, sk: 2 }).name, 'Placa del dragón dorado', 'variante de armadura');
  assert.strictEqual(RULES.makeItem(rng, { ilvl: 40, rarity: 'normal', slot: 'casco', base: 'malla', tier: 0, sk: 9 }).sk, 3, 'variante fuera de rango: la última');
  for (const s of ['pecho', 'casco', 'guantes', 'botas']) for (const ty of Object.keys(RULES.ARMOR_SKINS[s])) for (const tier of RULES.ARMOR_SKINS[s][ty]) assert.strictEqual(tier.length, 4, 'cuatro variantes de armadura');
  for (const b of Object.keys(RULES.WEAPON_SKINS)) for (const tier of RULES.WEAPON_SKINS[b]) assert.strictEqual(tier.length, 4, 'cuatro variantes de arma');
  // objetos guardados sin variante (o con la 0/1 de antes) siguen teniendo nombre
  // mágico: prefijo y/o sufijo; raro: de 3 a 6 propiedades; el daño mejorado sube el daño del arma
  for (let i = 0; i < 50; i++) {
    const m = RULES.makeItem(rng, { ilvl: 30, rarity: 'magico', slot: 'anillo' });
    assert.ok(Object.keys(m.stats).length >= 1 && Object.keys(m.stats).length <= 2, 'mágico: 1 o 2 propiedades');
    const rr = RULES.makeItem(rng, { ilvl: 45, rarity: 'raro', slot: 'amuleto' });
    assert.ok(Object.keys(rr.stats).length >= 3 && Object.keys(rr.stats).length <= 6, 'raro: de 3 a 6');
  }
  const plain = RULES.makeItem(RULES.seeded('ed'), { ilvl: 30, rarity: 'normal', slot: 'arma', base: 'hacha', tier: 1 });
  let ed = null;
  for (let i = 0; i < 200 && !ed; i++) { const it = RULES.makeItem(rng, { ilvl: 30, rarity: 'magico', slot: 'arma', base: 'hacha', tier: 1 }); if (it.ed && !it.addMin && !it.addMax) ed = it; }
  assert.ok(ed && ed.dmg[1] > plain.dmg[1] * 0.95 * (1 + ed.ed / 100) * 0.9, 'el daño mejorado se aplica al daño base');
  // anillos y amuletos: nunca normales
  assert.strictEqual(RULES.makeItem(rng, { ilvl: 5, rarity: 'normal', slot: 'anillo' }).rarity, 'magico');
  // conjunto de clase con su característica principal
  const set = RULES.makeItem(rng, { ilvl: 8, rarity: 'conjunto', set: 'mago' });
  assert.ok(set.set === 'mago' && set.stats.int > 0 && set.name.includes('Archimago'));
  // los únicos con el mismo nombre tienen las mismas propiedades
  const u1 = RULES.makeItem(RULES.seeded('u'), { ilvl: 40, rarity: 'unico', slot: 'arma', base: 'espada' });
  const u2 = RULES.makeItem(RULES.seeded('u'), { ilvl: 40, rarity: 'unico', slot: 'arma', base: 'espada' });
  assert.deepStrictEqual(Object.keys(u1.stats).sort(), Object.keys(u2.stats).sort(), 'único: siempre las mismas propiedades');
  // personaje: 6 características, raza + clase, tope natural de 20 y puntos hasta el nivel 50
  const ch = RULES.newChar('guerrero', { species: 'orc' });
  const d = RULES.derive({ xp: 0, char: ch, equip: {}, buffs: {} });
  assert.deepStrictEqual(Object.keys(d.stats), ['fue', 'des', 'vig', 'int', 'car', 'sue']);
  assert.strictEqual(d.base.fue, 5 + 4 + 4, 'Fuerza = 5 + orco 4 + guerrero 4');
  assert.ok(d.abilities.length === 4 && d.abilities.some((a) => a.id === 'golpe' && a.ready));
  assert.strictEqual(d.points, RULES.POINTS_START);
  assert.strictEqual(RULES.pointsTotal(50), 5 + 49 + 10, 'puntos a nivel 50');
  assert.strictEqual(RULES.statRoom(ch, 'fue'), 7, 'la Fuerza sólo puede subir 7 puntos más (hasta 20)');
  assert.strictEqual(RULES.cleanChar({ cls: 'guerrero', look: { species: 'orc' }, alloc: { fue: 30 } }, 50).alloc.fue, 7, 'tope natural de 20');
  const big = RULES.derive({ xp: 0, char: { ...ch, alloc: { ...ch.alloc, fue: 7 } }, equip: { anillo: { slot: 'anillo', stats: { fue: 6 } } }, buffs: {} });
  assert.ok(big.natural.fue === 20 && big.stats.fue === 26, 'el equipo sí pasa de 20');
  assert.ok(RULES.MAX_LEVEL === 50 && RULES.levelFromXp(1e12) === 50, 'nivel máximo 50');
  for (const r of RULES.RACE_IDS) assert.strictEqual(Object.values(RULES.RACES[r].mods).reduce((a, b) => a + b, 0), 6, 'todas las razas suman +6');
  for (const c of RULES.CLASS_IDS) assert.strictEqual(Object.values(RULES.CLASSES[c].base).reduce((a, b) => a + b, 0), 8, 'todas las clases suman +8');
  assert.ok(RULES.ABILITIES.druida.length === 4 && RULES.ABILITIES.sacerdote.length === 4 && !RULES.ABILITIES.brujo && !RULES.ABILITIES.clerigo);
  // la Fuerza sube el daño un 5% por punto (como en Diablo 2)
  const sw = RULES.makeItem(rng, { ilvl: 1, rarity: 'normal', slot: 'arma', base: 'espada', tier: 0 });
  const dA = RULES.derive({ xp: 0, char: RULES.newChar('guerrero', { species: 'goblin' }), equip: { arma: sw }, buffs: {} });
  const dB = RULES.derive({ xp: 0, char: RULES.newChar('guerrero', { species: 'orc' }), equip: { arma: sw }, buffs: {} });
  assert.ok(dB.statPct - dA.statPct === (dB.stats.fue - dA.stats.fue) * 5, '+5% de daño por punto de Fuerza');
  // requisitos: un mago enclenque no puede con unas placas de élite
  const plate = RULES.makeItem(rng, { ilvl: 40, rarity: 'normal', slot: 'pecho', base: 'placas', tier: 2 });
  const mage = RULES.newChar('mago', { species: 'elf' });
  assert.strictEqual(RULES.canEquip(plate, mage, 40, RULES.derive({ xp: RULES.XP_TABLE[40], char: mage, equip: {}, buffs: {} }).stats).ok, false, 'requisito de Fuerza');
  // perfiles antiguos: clases, razas, rarezas y características viejas se convierten
  const old = { xp: 0, char: { cls: 'brujo', alloc: { fue: 9 }, look: { species: 'dragonborn' } }, equip: { anillo: { slot: 'anillo', rarity: 'epico', ilvl: 10, req: 10, stats: { car: 12, vit: 8, hp: 30 } } }, bag: [{ slot: 'arma', base: 'maza', rarity: 'raro', ilvl: 3, dmg: [5, 9], stats: {} }] };
  RULES.migrateProfile(old);
  assert.ok(old.char.cls === 'mago' && old.char.look.species === 'human' && old.char.alloc.fue === 0 && old.statsReset, 'perfil antiguo');
  assert.ok(old.equip.anillo.rarity === 'raro' && old.equip.anillo.stats.int === 3 && old.equip.anillo.stats.vig === 2 && old.equip.anillo.stats.hp === 30, 'objeto antiguo');
  assert.ok(old.bag[0].rarity === 'magico' && old.bag[0].tier === 0 && old.bag[0].reqStats.fue === 4);
  // la mazmorra escala con el nivel
  assert.ok(RULES.monsterAt('orc', 10).hp > RULES.monsterAt('orc', 1).hp * 4);
  // mazmorras aleatorias: siempre jugables
  for (const theme of Object.keys(RULES.THEMES)) {
    const g = GEN.generate({ theme, level: 4, seed: theme });
    assert.ok(g.spawns.some((s) => s.boss && s.k === RULES.THEMES[theme].boss), 'tiene su jefe');
    assert.strictEqual(g.tiles.length, g.w * g.h);
  }
}

// ---------- Progresión: forja, tablón, mascotas, pesca ----------
function progressTests() {
  const rng = RULES.seeded('forja');
  const sword = RULES.makeItem(rng, { ilvl: 12, rarity: 'raro', slot: 'arma', base: 'espada' });
  const before = sword.dmg[1];
  PROG.applyUpgrade(sword);
  assert.ok(sword.up === 1 && sword.dmg[1] > before && /\+1$/.test(sword.name), 'mejora +1');
  for (let i = 0; i < 4; i++) PROG.applyUpgrade(sword);
  assert.ok(/\+5$/.test(sword.name) && !/\+1 \+/.test(sword.name), 'el nombre lleva sólo el último +N');
  assert.ok(PROG.upgradeCost(sword).chance < 1 && PROG.upgradeCost(sword).esencia > 0, 'mejoras altas: piden esencia y pueden fallar');
  const key = Object.keys(sword.stats)[0];
  const r = PROG.enchant(rng, sword, key);
  assert.ok(r && sword.stats[key] === undefined && sword.stats[r.to] > 0, 'encantar cambia una propiedad');
  const commons = [1, 2, 3].map(() => RULES.makeItem(rng, { ilvl: 4, rarity: 'normal', slot: 'pecho' }));
  assert.strictEqual(PROG.combine(rng, commons, ['guerrero']).rarity, 'magico', 'tres normales → un mágico');
  assert.ok(PROG.salvage(RULES.makeItem(rng, { ilvl: 4, rarity: 'raro' })).esencia >= 2, 'desguazar da materiales');
  const b1 = PROG.boardFor(100, 14), b2 = PROG.boardFor(100, 14);
  assert.deepStrictEqual(b1, b2, 'el tablón es igual para todos el mismo día');
  assert.ok(b1.daily.length === 3 && b1.weekly.length === 2);
  assert.ok(RULES.petStats('lobo', 10, 10).fue > RULES.petStats('lobo', 10, 9).fue * 1.15, 'la mascota evoluciona en el nivel 10');
  assert.strictEqual(RULES.petLevelFromXp(0), 1);
  assert.ok(RULES.petLevelFromXp(RULES.petXpFor(10)) === 10);
  const f = PROG.catchFish(rng, 2);
  assert.ok(PROG.MATS[f.id] && f.w > 0, 'pesca');
  assert.ok(PROG.WEEKLY_MODS[PROG.weekMod()], 'desafío de la semana');
  assert.ok(RULES.BUFFS['comida:estofado-trucha'] && RULES.BUFFS['comida:estofado-trucha'].food, 'los platos son bufos');
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

  // Esquiva: voltereta de dos casillas e invulnerable un instante
  p.x = 3; p.y = 2; p.rollAt = 0; user.combat.en = 50;
  inst.roll('u1', 1, 0);
  assert.strictEqual(p.x, 5, 'la voltereta avanza dos casillas');
  const hp0 = user.combat.hp;
  inst.hurtPlayer(p, 10, { level: 1 });
  assert.strictEqual(user.combat.hp, hp0, 'invulnerable durante la voltereta');

  // Desafío «cadáveres explosivos» del Descenso
  const dsent = [];
  const dinst = new Instance({ ...def, id: 'desc', descent: { floor: 1, mod: 'explosivos' }, spawns: [{ k: 'goblin-minion', x: 6, y: 2 }], chests: [] }, { ...hooks, send: (u, m) => dsent.push(m), kill: () => {} });
  const du = { id: 'u2', name: 'D', look: {}, profile: { ...profile } };
  dinst.join(du);
  dinst.damageEnemy(dinst.players.get('u2'), [...dinst.enemies.values()][0], 9999, { noCrit: true });
  assert.ok(dinst.teles.some((t) => t.orphan), 'el cadáver va a estallar');

  // Poderes legendarios en combate
  const lsent = [];
  const linst = new Instance({ ...def, id: 'leg', spawns: [{ k: 'goblin-minion', x: 5, y: 2 }, { k: 'goblin-minion', x: 6, y: 2 }, { k: 'goblin-minion', x: 6, y: 3 }], chests: [] }, { ...hooks, send: (u, m) => lsent.push(m), kill: () => {} });
  const lrng = RULES.seeded('leg');
  const lprof = { ...profile, equip: { ...profile.equip, arma: RULES.makeItem(lrng, { ilvl: 5, rarity: 'unico', slot: 'arma', base: 'arco', leg: 'rebote' }), anillo: RULES.makeItem(lrng, { ilvl: 5, rarity: 'unico', slot: 'anillo', leg: 'estallido' }), amuleto: RULES.makeItem(lrng, { ilvl: 5, rarity: 'unico', slot: 'amuleto', leg: 'egida' }) } };
  const lu = { id: 'u3', name: 'L', look: {}, profile: lprof };
  linst.join(lu);
  const lp = linst.players.get('u3');
  assert.ok(lp.d.leg.rebote && lp.d.leg.estallido && lp.d.leg.egida, 'los tres poderes activos');
  const [g1, g2, g3] = [...linst.enemies.values()];
  const hp2 = g2.hp;
  linst.damageEnemy(lp, g1, 3, { noCrit: true, kind: 'ranged' });
  assert.ok(g2.hp < hp2 || g3.hp < g3.maxHp, 'el disparo rebota a otro enemigo');
  linst.damageEnemy(lp, g2, 99999, { noCrit: true, kind: 'melee' });
  assert.ok(linst.events.some((e) => e.e === 'fx' && e.color === '#ff8a1a') || lsent.some((m) => (m.events || []).some((e) => e.color === '#ff8a1a')), 'el enemigo estalla al morir');
  lu.combat.hp = Math.round(lp.d.hp * 0.32);
  linst.hurtPlayer(lp, 5, { raw: true });
  assert.ok(lp.shield > 0, 'la égida se levanta al bajar del 30%');

  // Arena: los golpes al rival le quitan vida de verdad, y al caer termina el duelo
  let ended = null;
  const ahooks = { ...hooks, send: () => {}, duelEnd: (loser) => { ended = loser.id; } };
  const adef = { id: 'arena1', kind: 'arena', name: 'Arena', w: PROG.ARENA.w, h: PROG.ARENA.h, tiles: PROG.arenaTiles(), start: { x: 2, y: 5 }, props: [], duel: { a: 'x1', b: 'x2', bet: 0, startAt: 0 } };
  const ai = new Instance(adef, ahooks);
  const mk = (id) => { const pr = { xp: 0, gold: 0, char: RULES.newChar('guerrero'), equip: {}, buffs: {} }; for (const it of RULES.starterItems('guerrero', Math.random)) pr.equip[it.slot] = it; return { id, name: id, look: { cls: 'guerrero' }, profile: pr }; };
  const x1 = mk('x1'), x2 = mk('x2');
  ai.join(x1, { x: 4, y: 5 }); ai.join(x2, { x: 5, y: 5 });
  assert.ok(ai.enemies.has('pv:x2') && !ai.nearestEnemy(ai.players.get('x1'), 1).id.endsWith('x1'), 'el rival es atacable, uno mismo no');
  const hpB = x2.combat.hp;
  ai.damageEnemy(ai.players.get('x1'), ai.enemies.get('pv:x2'), 20, { noCrit: true, kind: 'ability' });
  assert.ok(x2.combat.hp < hpB, 'el golpe duele al rival');
  ai.damageEnemy(ai.players.get('x1'), ai.enemies.get('pv:x2'), 99999, { noCrit: true, kind: 'ability' });
  await sleep(1000);
  assert.strictEqual(ended, 'x2', 'termina el duelo');

  // Jefe de mundo: aparece cerca de los héroes y reparte botín a quien le hizo daño
  const WW = 30;
  const wdef = { id: 'world', kind: 'world', name: 'Mundo', w: WW, h: WW, tiles: '.'.repeat(WW * WW).split('').map((c, i) => (i % WW === 0 || i < WW || i % WW === WW - 1 || i >= WW * (WW - 1) ? '#' : c)).join(''), start: { x: 15, y: 15 }, groups: [] };
  let wbUsers = null;
  const wi = new Instance(wdef, { ...hooks, send: () => {}, announce: () => {}, worldBoss: (users) => { wbUsers = users; }, kill: () => {} });
  const wu = mk('w1');
  wi.join(wu);
  wi.nextEventAt = Date.now() - 1;
  wi.tick(Date.now());
  assert.ok(wi.worldBoss, 'aparece el jefe de mundo');
  const wbE = wi.enemies.get(wi.worldBoss.id);
  assert.ok(PROG.WORLD_BOSSES.includes(wbE.k));
  wi.damageEnemy(wi.players.get('w1'), wbE, 999999, { noCrit: true });
  assert.ok(wbUsers && wbUsers[0].id === 'w1' && !wi.worldBoss, 'botín para quien luchó');

  // Pesca junto al agua y hierbas
  let fished = null, herbed = null;
  const fsent = [];
  const fdef = { ...wdef, id: 'world2', tiles: wdef.tiles.slice(0, 15 * WW + 16) + 'w' + wdef.tiles.slice(15 * WW + 17), herbs: [{ id: 'h0', x: 12, y: 15, zone: 1 }] };
  const fi = new Instance(fdef, { ...hooks, send: (u, m) => fsent.push(m), fish: (u, z) => { fished = z; }, herb: (u, z) => { herbed = z; }, kill: () => {} });
  const fu = mk('f1');
  fi.join(fu, { x: 15, y: 15 });
  fi.nextEventAt = 0;
  fi.hook('f1');
  const fp = fi.players.get('f1');
  assert.ok(fp.fishing, 'lanza el sedal junto al agua');
  fp.fishing.biteAt = Date.now() - 1;
  fi.tick(Date.now());
  assert.ok(fsent.some((m) => m.t === 'dbite'), '¡pica!');
  fi.hook('f1');
  assert.strictEqual(fished, 0, 'pesca un pez');
  fi.gather('f1', 'h0');
  for (let i = 0; i < 80 && herbed === null; i++) { fi.tick(Date.now()); await sleep(25); }
  assert.strictEqual(herbed, 1, 'recoge la hierba');
  assert.ok(fi.herbs.get('h0').readyAt > Date.now(), 'la hierba vuelve a crecer más tarde');
}

(async () => {
  rulesTests();
  progressTests();
  await instanceTests();

  await new Promise((r) => server.listen(process.env.PORT, r));
  const tokA = 'a'.repeat(32), tokB = 'b'.repeat(32);
  const a = await client('Ana');
  const SRV = MAP.SERVERS[2].id;
  a.send({ t: 'join', room: SRV, name: 'Ana', look: { cls: 'mago', skin: 1, hair: 2 }, token: tokA });
  const wa = await a.next((m) => m.t === 'welcome');
  assert.strictEqual(wa.room, SRV);
  assert.strictEqual(wa.users.length, 1);
  assert.strictEqual(wa.owner, true, 'quien abre la sala es su dueño');
  assert.ok(wa.items.length > 10, 'llegan los muebles');
  const meA = await a.next((m) => m.t === 'me');
  assert.strictEqual(meA.char.cls, 'mago');
  assert.strictEqual(meA.equip.arma.base, 'baston', 'equipo inicial del mago');
  assert.strictEqual(meA.cons['pocion-vida-p'], 3);

  const b = await client('Beto');
  b.send({ t: 'join', room: SRV, name: 'Beto', look: { cls: 'hacker', cls2: 'clerigo', skin: 99 }, token: tokB });
  const wb = await b.next((m) => m.t === 'welcome');
  assert.strictEqual(wb.users.length, 2);
  assert.strictEqual(wb.owner, false);
  const beto = wb.users.find((u) => u.id === wb.id);
  assert.strictEqual(beto.look.cls, 'guerrero', 'clase inválida → guerrero');
  assert.strictEqual(beto.look.cls2, undefined, 'sin segunda clase');
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
  b.send({ t: 'char:points', alloc: { fue: 3, vig: 2 } });
  meB = await b.next((m) => m.t === 'me');
  assert.strictEqual(meB.char.alloc.fue, 3);
  b.send({ t: 'char:points', alloc: { fue: 1 } });
  assert.match((await b.next((m) => m.t === 'error')).text, /puntos/);
  // tope natural de 20: un enano guerrero con 18 de Vigor no puede subirlo a 21 aunque tuviera puntos
  const vigRoom = RULES.statRoom({ cls: 'guerrero', look: { species: 'dwarf' }, alloc: { vig: 2 } }, 'vig');
  assert.strictEqual(vigRoom, 20 - (5 + 4 + 3) - 2, 'hueco hasta 20');

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
  // Requisitos al estilo Diablo 2: Ana (maga, poca Fuerza) no puede con unas placas de élite
  const elitePlate = RULES.makeItem(RULES.seeded('placas'), { ilvl: 1, rarity: 'normal', slot: 'pecho', base: 'placas', tier: 2 });
  elitePlate.req = 1; // sólo cuenta la Fuerza
  store.player(store.hash(tokA)).slots[0].bag.push(elitePlate);
  a.send({ t: 'inv:equip', id: elitePlate.id });
  assert.match((await a.next((m) => m.t === 'error')).text, /Fuerza/, 'requisito de Fuerza');
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
  assert.ok(wd.enemies.length >= 3, 'hay enemigos cerca');
  assert.ok(wd.enemies.every((e) => Math.max(Math.abs(e.x - wd.players[0].x), Math.abs(e.y - wd.players[0].y)) <= 26), 'sólo llega lo cercano');
  assert.strictEqual(wd.dungeon.w, 160);
  assert.strictEqual(wd.dungeon.zones.length, wd.dungeon.w * wd.dungeon.h, 'mapa de zonas');
  assert.strictEqual(wd.dungeon.waystones.length, 6, 'una piedra de viaje por zona');
  assert.ok(wd.dungeon.labels.some((l) => /\(nv 23\)/.test(l.text)), 'cuevas con nivel');
  // hablar con el alcalde: ofrece una misión
  const alcalde = wd.dungeon.npcs.find((n) => n.id === 'alcalde');
  b.send({ t: 'dtalk', id: 'alcalde' });
  const npc = await b.next((m) => m.t === 'npc', 6000);
  assert.strictEqual(npc.name, alcalde.name);
  assert.ok(npc.quests.some((q) => q.id === 'carta-lenador' && q.state === 'available'));
  b.send({ t: 'quest:accept', id: 'carta-lenador' });
  const mq = await b.next((m) => m.t === 'me' && m.quests['carta-lenador']);
  assert.strictEqual(mq.quests['carta-lenador'].n, 0);
  b.send({ t: 'dmount' });
  assert.match((await b.next((m) => m.t === 'dwhisper' && /montura/.test(m.text))).text, /Establo/);
  b.send({ t: 'dleave' });
  assert.strictEqual((await b.next((m) => m.t === 'dexit')).reason, 'leave');

  // Forja, cocina, tablón, fama, habitación, Descenso y duelos (Cris trae materiales de casa)
  const tokC = 'c'.repeat(32);
  const crng = RULES.seeded('cris');
  store.setPlayer(store.hash(tokC), { xp: RULES.XP_TABLE[6], gold: 5000, char: RULES.newChar('guerrero'), equip: Object.fromEntries(RULES.starterItems('guerrero', crng).map((it) => [it.slot, it])), cons: {}, buffs: {}, mats: { hierro: 30, esencia: 10, polvo: 3, trucha: 2, menta: 1 }, bag: [1, 2, 3, 4].map(() => RULES.makeItem(crng, { ilvl: 3, rarity: 'normal', slot: 'pecho', classes: ['guerrero'] })) });
  // su espada es mágica (las normales no tienen propiedades que encantar)
  const cp = store.player(store.hash(tokC));
  cp.equip.arma = RULES.makeItem(crng, { ilvl: 5, rarity: 'magico', slot: 'arma', base: 'espada', tier: 0 });
  cp.equip.arma.stats.fue = cp.equip.arma.stats.fue || 1;
  const c = await client('Cris');
  c.send({ t: 'join', room: SRV, name: 'Cris', look: { cls: 'guerrero' }, token: tokC });
  const wc = await c.next((m) => m.t === 'welcome');
  let meC = await c.next((m) => m.t === 'me');
  assert.ok(meC.mats.hierro === 30 && meC.board.daily.length === 3 && meC.board.weekly.length === 2, 'materiales y tablón');
  const sw = meC.equip.arma;
  c.send({ t: 'forge:up', id: sw.id });
  const fr = await c.next((m) => m.t === 'forge:result');
  assert.ok(fr.ok && fr.item.up === 1 && /\+1$/.test(fr.item.name), 'la forja mejora el arma');
  meC = await c.next((m) => m.t === 'me' && m.equip.arma.up === 1);
  assert.ok(meC.mats.hierro < 30, 'gasta hierro');
  const ek = Object.keys(meC.equip.arma.stats)[0];
  c.send({ t: 'forge:enchant', id: sw.id, key: ek });
  assert.ok((await c.next((m) => m.t === 'forge:result')).ok, 'encantar');
  const ids = meC.bag.slice(0, 3).map((it) => it.id);
  c.send({ t: 'forge:combine', ids });
  const cr = await c.next((m) => m.t === 'forge:result');
  assert.strictEqual(cr.item.rarity, 'magico', 'combinar 3 normales');
  meC = await c.next((m) => m.t === 'me' && m.bag.length === 2);
  c.send({ t: 'forge:salvage', ids: [meC.bag[0].id] });
  assert.match((await c.next((m) => m.t === 'forge:result')).text, /Desguazado/);
  c.send({ t: 'cook', id: 'estofado-trucha' });
  meC = await c.next((m) => m.t === 'me' && m.buffs['comida:estofado-trucha']);
  assert.ok(!meC.mats.trucha, 'gasta los ingredientes');
  assert.ok(RULES.derive(meC).hp > RULES.derive({ ...meC, buffs: {} }).hp, 'el plato da vida');
  c.send({ t: 'title:set', title: 'Leyenda de la Taberna' });
  c.send({ t: 'ranks:get' });
  const rk = await c.next((m) => m.t === 'ranks');
  assert.ok(rk.boards.floor && rk.boards.kills && PROG.WEEKLY_MODS[rk.mod], 'clasificación semanal');
  c.send({ t: 'room:get' });
  const ri = await c.next((m) => m.t === 'roominfo');
  assert.ok(ri.name === 'Cris' && Array.isArray(ri.trophies) && !ri.title, 'habitación (sin títulos que no tiene)');
  // Descenso infinito
  c.send({ t: 'descent:start' });
  const dsc = await c.next((m) => m.t === 'dstart');
  assert.ok(dsc.dungeon.descent && dsc.dungeon.descent.floor === 1 && /piso 1/.test(dsc.dungeon.name), 'Descenso: piso 1');
  c.send({ t: 'dleave' });
  await c.next((m) => m.t === 'dexit');
  // Duelo con apuesta: Ana se rinde y Cris se lleva el bote
  await sleep(300);
  const goldC = c.last((m) => m.t === 'me').gold;
  const g0 = store.player(store.hash(tokC)).slots[0].gold;
  c.send({ t: 'duel:req', to: wa.id, bet: 10 });
  const inv = await a.next((m) => m.t === 'duel:invite');
  assert.strictEqual(inv.bet, 10);
  a.send({ t: 'duel:accept', from: inv.from });
  const ad = await a.next((m) => m.t === 'dstart');
  assert.strictEqual(ad.dungeon.kind, 'arena', 'duelo en la arena');
  await c.next((m) => m.t === 'dstart' && m.dungeon.kind === 'arena');
  a.send({ t: 'dleave' });
  assert.strictEqual((await c.next((m) => m.t === 'dexit')).reason, 'arena');
  await a.next((m) => m.t === 'dexit');
  const won = await c.next((m) => m.t === 'system' && /Cris gana el duelo contra Ana y se lleva 20/.test(m.text), 4000);
  assert.ok(won, 'el ganador se lleva el bote');
  assert.ok(await c.next((m) => m.t === 'achievement' && m.id === 'duelista'), 'logro del primer duelo');
  assert.ok(goldC > 0);
  await sleep(200);
  assert.strictEqual(store.player(store.hash(tokC)).slots[0].gold, g0 + 10 + 30, 'bote del duelo (+10 netos) y oro del logro (+30)');
  void wc;
  c.ws.close();

  // El perfil se guarda con el token
  b.ws.close();
  await a.next((m) => m.t === 'leave' && m.id === wb.id);
  const b2 = await client('Beto2');
  b2.send({ t: 'join', room: SRV, name: 'Beto', look: { cls: 'guerrero', cls2: 'clerigo' }, token: tokB });
  await b2.next((m) => m.t === 'welcome');
  const me2 = await b2.next((m) => m.t === 'me');
  assert.strictEqual(me2.char.alloc.fue, 3, 'conserva sus puntos');
  assert.strictEqual(me2.cons['pocion-vida-p'], 5);
  b2.ws.close();

  // ----- Pantalla de inicio: cuenta con tres casillas, servidores y «continuar» -----
  const tokD = 'd'.repeat(32);
  // perfil de la versión anterior con multiclase: pasa a la casilla 1, sin segunda clase y con las reglas nuevas
  const drng = RULES.seeded('dani');
  const plateD = RULES.makeItem(drng, { ilvl: 1, slot: 'pecho', base: 'placas' });
  store.setPlayer(store.hash(tokD), { name: 'Dani', xp: 0, gold: 77, char: { cls: 'mago', cls2: 'paladin', alloc: {}, look: {} }, equip: { pecho: plateD }, bag: [], cons: {}, buffs: {} });
  const lob = await client('Lobby');
  lob.send({ t: 'hello', token: tokD });
  let ac = await lob.next((m) => m.t === 'account');
  assert.strictEqual(ac.slots.length, 3, 'tres casillas');
  assert.ok(ac.slots[0] && ac.slots[0].name === 'Dani' && !ac.slots[1] && !ac.slots[2], 'el perfil antiguo va a la casilla 1');
  assert.deepStrictEqual(ac.servers.map((x) => x.id), MAP.SERVERS.map((x) => x.id), 'tres servidores');
  // el editor manda raza, sexo, peinado y el reparto de los 5 primeros puntos (el servidor recorta lo que pase de 20)
  lob.send({ t: 'char:new', token: tokD, slot: 1, name: 'Eva', look: { cls: 'picaro', cls2: 'mago', species: 'goblin', sex: 'f', hs: 'capucha', skin: 12, gob: { ears: 2, hair: 4, marks: 3, nose: 99, rings: 'x' } }, alloc: { des: 9, sue: 3 } });
  ac = await lob.next((m) => m.t === 'account');
  assert.strictEqual(ac.created, 1);
  assert.ok(ac.slots[1].name === 'Eva' && ac.slots[1].cls === 'picaro' && ac.slots[1].level === 1, 'personaje nuevo en la casilla 2');
  assert.ok(ac.slots[1].look.species === 'goblin' && ac.slots[1].look.sex === 'f' && ac.slots[1].look.hs === 'capucha', 'raza, sexo y peinado');
  const eva = store.player(store.hash(tokD)).slots[1];
  // rasgos de goblin: se guardan los válidos y los raros vuelven a su valor de partida
  const gl = ac.slots[1].look.gob;
  assert.ok(gl && gl.ears === 2 && gl.hair === 4 && gl.marks === 3 && gl.nose === 0 && gl.rings === 0 && gl.build === 1, 'rasgos de goblin guardados y limpios');
  assert.strictEqual(eva.char.look.gob.ears, 2);
  assert.strictEqual(MAP.cleanLook({ species: 'human', gob: { ears: 1 } }).gob, undefined, 'solo los goblins llevan rasgos de goblin');
  // copia de seguridad firmada: si el servidor pierde la cuenta, el navegador la devuelve y se restaura
  assert.ok(ac.backup && ac.backup.d && ac.backup.sig, 'la cuenta llega con su copia de seguridad');
  const bk = ac.backup, saved = store.player(store.hash(tokD));
  store.setPlayer(store.hash(tokD), null);
  lob.send({ t: 'hello', token: tokD, backup: { ...bk, d: bk.d.slice(0, -4) + 'AAAA' } });
  let ac2 = await lob.next((m) => m.t === 'account');
  assert.ok(!ac2.slots[1], 'una copia retocada no se acepta');
  lob.send({ t: 'hello', token: tokD, backup: bk });
  ac2 = await lob.next((m) => m.t === 'account');
  assert.ok(ac2.slots[1] && ac2.slots[1].name === 'Eva', 'la copia buena restaura la cuenta');
  assert.strictEqual(store.player(store.hash(tokD)).slots[1].char.look.gob.ears, saved.slots[1].char.look.gob.ears);
  await sleep(2500); // el servidor limita los mensajes de la pantalla de inicio
  assert.deepStrictEqual([eva.char.alloc.des, eva.char.alloc.sue], [5, 0], 'puntos iniciales: como mucho 5 y nunca más de 20 natural');
  assert.ok(RULES.derive(eva).natural.des <= RULES.STAT_MAX);
  lob.send({ t: 'char:new', token: tokD, slot: 1, name: 'Otra', look: {} });
  assert.match((await lob.next((m) => m.t === 'error')).text, /ya tiene/, 'no se pisa una casilla ocupada');
  lob.send({ t: 'char:new', token: tokD, slot: 3, name: 'Cuarta', look: {} });
  assert.ok(await lob.next((m) => m.t === 'error'), 'sólo hay tres casillas');
  lob.send({ t: 'char:new', token: tokD, slot: 2, name: 'Borrable', look: {} });
  await lob.next((m) => m.t === 'account' && m.slots[2]);
  lob.send({ t: 'char:del', token: tokD, slot: 2 });
  ac = await lob.next((m) => m.t === 'account');
  assert.strictEqual(ac.slots[2], null, 'borrar un personaje');
  // Nombres de los servidores: Lejano, Humbrio y Sangriento de serie; sólo el dueño los cambia
  assert.deepStrictEqual(ac.servers.map((x) => x.name), ['Lejano', 'Humbrio', 'Sangriento']);
  const svB = ac.servers.find((x) => x.id === SRV);
  assert.ok(!svB.canEdit && !svB.mine, 'el servidor de Ana no es de Dani');
  lob.send({ t: 'server:rename', token: tokD, id: SRV, name: 'Mío' });
  assert.match((await lob.next((m) => m.t === 'error')).text, /dueño/);
  const la = await client('AnaLobby');
  la.send({ t: 'hello', token: tokA });
  assert.ok((await la.next((m) => m.t === 'account')).servers.find((x) => x.id === SRV).mine, 'Ana es la dueña de su servidor');
  la.send({ t: 'server:rename', token: tokA, id: SRV, name: '  Sangriento   del Norte ' });
  const ren = await a.next((m) => m.t === 'server-name');
  assert.strictEqual(ren.name, 'Sangriento del Norte', 'los que están dentro ven el nombre nuevo');
  assert.strictEqual((await la.next((m) => m.t === 'account')).servers.find((x) => x.id === SRV).name, 'Sangriento del Norte');
  la.ws.close();
  // un servidor sin dueño: quien le cambia el nombre pasa a ser su dueño
  lob.send({ t: 'server:rename', token: tokD, id: MAP.SERVERS[0].id, name: 'Lejanía' });
  ac = await lob.next((m) => m.t === 'account');
  assert.ok(ac.servers[0].name === 'Lejanía' && ac.servers[0].mine, 'renombrar un servidor sin dueño');
  lob.ws.close();

  // Jugar con la casilla 1 (Dani) en el segundo servidor: la segunda clase ya no está
  const SRV2 = MAP.SERVERS[1].id;
  const d1 = await client('Dani');
  d1.send({ t: 'join', room: SRV2, slot: 0, token: tokD });
  const wdani = await d1.next((m) => m.t === 'welcome');
  assert.ok(wdani.room === SRV2 && wdani.slot === 0);
  const meD = await d1.next((m) => m.t === 'me');
  assert.ok(!meD.char.cls2 && meD.char.cls === 'mago' && meD.equip.pecho.id === plateD.id && meD.equip.pecho.v === RULES.RULES_VERSION, 'sin segunda clase; el equipo se convierte a las reglas nuevas');
  assert.ok(Object.values(meD.char.alloc).every((v) => v === 0), 'los puntos vuelven para repartirlos');
  assert.ok(await d1.next((m) => m.t === 'system' && /características han cambiado/.test(m.text)), 'se avisa del cambio de características');
  assert.strictEqual(meD.gold, 77, 'conserva su oro');
  // se mueve en la taberna y sale al mundo; al salir, se recuerda dónde estaba
  d1.send({ t: 'wenter' });
  await d1.next((m) => m.t === 'dstart' && m.dungeon.kind === 'world');
  d1.send({ t: 'ddir', dx: 1, dy: 0 });
  await sleep(700);
  d1.send({ t: 'ddir', dx: 0, dy: 0 });
  await sleep(300);
  d1.ws.close();
  await sleep(200);
  const rs = store.player(store.hash(tokD)).slots[0].resume;
  const wx = rs.x, wy = rs.y;
  ac = await (async () => { const l = await client('Lobby2'); l.send({ t: 'hello', token: tokD }); const r = await l.next((m) => m.t === 'account'); l.ws.close(); return r; })();
  assert.deepStrictEqual(ac.last, { slot: 0, server: SRV2 }, 'último personaje y servidor');
  assert.ok(ac.slots[0].at === 'world' && ac.slots[0].server === SRV2, 'se recuerda que estaba en el mundo');
  // Continuar: vuelve al mundo, en el mismo sitio
  const d2 = await client('Dani2');
  d2.send({ t: 'join', room: SRV2, slot: 0, token: tokD });
  await d2.next((m) => m.t === 'welcome');
  const back = await d2.next((m) => m.t === 'dstart');
  assert.strictEqual(back.dungeon.kind, 'world', 'continúa en el mundo');
  const bp = back.players.find((pl) => pl.name === 'Dani');
  assert.ok(Math.abs(bp.x - wx) <= 1 && Math.abs(bp.y - wy) <= 1 && back.start && (bp.x !== back.start.x || bp.y !== back.start.y), 'en el mismo sitio, no en la entrada');
  // El mismo personaje desde otro sitio: la sesión anterior se cierra
  const d3 = await client('Dani3');
  d3.send({ t: 'join', room: SRV2, slot: 0, token: tokD });
  assert.match((await d2.next((m) => m.t === 'kicked')).text, /otro sitio/);
  await d3.next((m) => m.t === 'welcome');
  // Otra casilla del mismo navegador puede jugar a la vez; una casilla vacía no
  const e1 = await client('Eva');
  e1.send({ t: 'join', room: 'servidor-inventado', slot: 1, token: tokD });
  const we = await e1.next((m) => m.t === 'welcome');
  assert.strictEqual(we.room, MAP.SERVERS[0].id, 'un servidor desconocido lleva al primero');
  const e2 = await client('Vacia');
  e2.send({ t: 'join', room: SRV2, slot: 2, token: tokD });
  assert.match((await e2.next((m) => m.t === 'error')).text, /vacía/);
  // En la taberna: se vuelve a la misma casilla
  d3.send({ t: 'dleave' });
  await d3.next((m) => m.t === 'dexit');
  d3.send({ t: 'move', x: 6, y: 9 });
  await sleep(150);
  d3.ws.close(); e1.ws.close(); e2.ws.close();
  await sleep(200);
  const d4 = await client('Dani4');
  d4.send({ t: 'join', room: SRV2, slot: 0, token: tokD });
  const w4 = await d4.next((m) => m.t === 'welcome');
  const meIn = w4.users.find((u) => u.id === w4.id);
  assert.ok(!meIn.where && meIn.x === 6 && meIn.y === 9, 'continúa en la taberna, donde estaba');
  d4.ws.close();

  const mkAccU = (tok, name) => store.setPlayer(store.hash(tok), { slots: [{ name, xp: 0, gold: 10, rv: RULES.RULES_VERSION, char: RULES.newChar('mago', { species: 'elf', sex: 'f' }), equip: {}, bag: [], cons: {}, buffs: {} }, null, null], last: null });
  // Usuario y contraseña: se guarda la cuenta y otro dispositivo entra en ella
  const tokU = 'ab'.repeat(16), tokOther = 'cd'.repeat(16);
  mkAccU(tokU, 'Viajera');
  const lu = await client('Login1');
  lu.send({ t: 'acct:register', token: tokU, user: 'x', pass: '123456' });
  assert.match((await lu.next((m) => m.t === 'error')).text, /usuario/, 'usuario demasiado corto');
  await sleep(1000);
  lu.send({ t: 'acct:register', token: tokU, user: 'Viajera87', pass: 'secreta1' });
  const reg = await lu.next((m) => m.t === 'account');
  assert.ok(reg.registered === 'viajera87' && reg.login === 'viajera87', 'cuenta guardada (usuario en minúsculas)');
  assert.ok(!JSON.stringify(reg).includes('secreta1'), 'la contraseña no viaja de vuelta');
  const lu2 = await client('Login2');
  lu2.send({ t: 'acct:login', token: tokOther, user: 'viajera87', pass: 'mala' });
  assert.match((await lu2.next((m) => m.t === 'error')).text, /incorrectos/, 'contraseña mala');
  await sleep(1000);
  lu2.send({ t: 'acct:register', token: tokOther, user: 'viajera87', pass: 'otra123' });
  assert.match((await lu2.next((m) => m.t === 'error')).text, /ya existe/, 'no se puede quitar el usuario a otro');
  await sleep(1000);
  lu2.send({ t: 'acct:login', token: tokOther, user: 'VIAJERA87', pass: 'secreta1' });
  const lg = await lu2.next((m) => m.t === 'account');
  assert.strictEqual(lg.token, tokU, 'el otro dispositivo recibe la llave de la cuenta');
  assert.strictEqual(lg.slots[0].name, 'Viajera', 'y ve sus personajes');
  lu.ws.close(); lu2.ws.close();

  // Recompensa diaria: el día 1 da oro y pociones; no se puede recoger dos veces
  const tokL = 'ef'.repeat(16);
  mkAccU(tokL, 'Diaria');
  const dl = await client('Diaria');
  dl.send({ t: 'join', room: MAP.SERVERS[0].id, slot: 0, token: tokL });
  await dl.next((m) => m.t === 'welcome');
  const off = await dl.next((m) => m.t === 'login:offer', 5000);
  assert.ok(!off.claimed && off.streak === 1 && off.rewards.length === 7, 'oferta del día 1');
  dl.send({ t: 'login:claim' });
  const cl = await dl.next((m) => m.t === 'login:claimed');
  assert.ok(cl.got.some((g) => /50/.test(g)), 'recibe el oro del día 1');
  const accL = store.player(store.hash(tokL));
  assert.ok(accL.daily && accL.daily.streak === 1 && accL.slots[0].cons['pocion-vida-p'] >= 2, 'racha guardada y pociones en la mochila');
  assert.deepStrictEqual(PROG.loginState({ last: PROG.dayKey() - 1, streak: 3 }).streak, 4, 'la racha sigue si entras al día siguiente');
  assert.deepStrictEqual(PROG.loginState({ last: PROG.dayKey() - 2, streak: 5 }).streak, 1, 'y se reinicia si fallas un día');
  assert.deepStrictEqual(PROG.loginState({ last: PROG.dayKey() - 1, streak: 7 }).streak, 1, 'tras el día 7 vuelve a empezar');
  dl.ws.close();

  // Asalto semanal: mismo mapa para todos, enemigos más duros, cofre y clasificación
  const tokR = 'a1b2'.repeat(8);
  mkAccU(tokR, 'Asaltante');
  const rcl = await client('Asaltante');
  rcl.send({ t: 'join', room: MAP.SERVERS[0].id, slot: 0, token: tokR });
  await rcl.next((m) => m.t === 'welcome');
  rcl.send({ t: 'raid:info' });
  const rinfo = await rcl.next((m) => m.t === 'raid:info');
  assert.ok(RULES.THEMES[rinfo.theme] && PROG.WEEKLY_MODS[rinfo.mod] && !rinfo.done, 'información del asalto de la semana');
  await sleep(1000);
  rcl.send({ t: 'raid:start' });
  const rstart = await rcl.next((m) => m.t === 'dstart');
  assert.ok(/Asalto semanal/.test(rstart.dungeon.name), 'entra en el asalto');
  const rinst = rooms.get(MAP.SERVERS[0].id).instances.get(rstart.dungeon.id);
  const sameMap = GEN.generate({ theme: rinfo.theme, level: rinst.level, seed: 'asalto-' + rinfo.week });
  assert.strictEqual(sameMap.tiles, rinst.def.tiles, 'el mapa es el de la semana (igual para todos)');
  const rbossE = [...rinst.enemies.values()].find((e) => e.m.boss);
  assert.ok(rbossE.maxHp > RULES.monsterAt(rbossE.k, rinst.level).hp * 1.5, 'el jefe tiene más vida que en una mazmorra normal');
  rinst.damageEnemy(rinst.players.get([...rinst.players.keys()][0]), rbossE, 1e9, { noCrit: true });
  await sleep(100);
  const rrank = (store.meta('raids') || {})[rinfo.week] || [];
  assert.ok(rrank.some((r) => r.names.includes('Asaltante')), 'entra en la clasificación');
  assert.strictEqual(store.player(store.hash(tokR)).slots[0].raidWeek, rinfo.week, 'cofre semanal entregado');
  rcl.ws.close();

  // Talentos: se suben con las reglas de la rama, cuentan en la ficha y se guardan
  const tokT = 'c3d4'.repeat(8);
  store.setPlayer(store.hash(tokT), { slots: [{ name: 'Talentosa', xp: RULES.XP_TABLE[12], gold: 500, rv: RULES.RULES_VERSION, char: RULES.newChar('mago', { species: 'elf', sex: 'f' }), equip: {}, bag: [], cons: {}, buffs: {} }, null, null], last: null });
  const tc = await client('Talentosa');
  tc.send({ t: 'join', room: MAP.SERVERS[1].id, slot: 0, token: tokT });
  await tc.next((m) => m.t === 'welcome');
  tc.send({ t: 'talent:add', id: 'm-meteoro' });
  assert.match((await tc.next((m) => m.t === 'error')).text, /Pon 9 puntos/, 'el último talento de la rama pide 9 puntos en ella');
  tc.send({ t: 'talent:add', id: 'g-filo' });
  assert.match((await tc.next((m) => m.t === 'error')).text, /no es de tu clase/, 'no se pueden coger talentos de otra clase');
  for (let i = 0; i < 3; i++) tc.send({ t: 'talent:add', id: 'm-llama' });
  tc.send({ t: 'talent:add', id: 'm-bola' });
  await sleep(300);
  const tcp = store.player(store.hash(tokT)).slots[0];
  assert.deepStrictEqual(tcp.char.talents, { 'm-llama': 3, 'm-bola': 1 }, 'talentos guardados');
  const tdv = RULES.derive(tcp);
  assert.ok(tdv.abBoost.bola === 15 && tdv.talentPoints === RULES.talentPoints(12) - 4, 'cuentan en la ficha');
  assert.deepStrictEqual(RULES.cleanChar(tcp.char, 12).talents, { 'm-llama': 3, 'm-bola': 1 }, 'cleanChar conserva los talentos válidos');
  tc.send({ t: 'talent:reset' });
  await sleep(300);
  assert.ok(!RULES.talentSpent(store.player(store.hash(tokT)).slots[0].char.talents), 'se pueden reiniciar');
  tc.ws.close();

  // Dueño de la taberna: mensaje del día, silenciar y expulsar (el primero en entrar en un servidor nuevo es el dueño)
  const SRV3 = MAP.SERVERS[2].id;
  const mkAcc = (tok, name) => store.setPlayer(store.hash(tok), { slots: [{ name, xp: 0, gold: 10, rv: RULES.RULES_VERSION, char: RULES.newChar('guerrero', { species: 'human', sex: 'm' }), equip: {}, bag: [], cons: {}, buffs: {} }, null, null], last: null });
  const tokO = 'e1'.repeat(16), tokG = 'f2'.repeat(16);
  mkAcc(tokO, 'Dueña'); mkAcc(tokG, 'Gamberro');
  const own = await client('Dueña'), gam = await client('Gamberro');
  if (rooms.has(SRV3)) rooms.get(SRV3).ownerId = null;
  store.setRoom(SRV3, { ownerId: null, items: (store.room(SRV3) || {}).items });
  own.send({ t: 'join', room: SRV3, slot: 0, token: tokO });
  assert.ok((await own.next((m) => m.t === 'welcome')).owner, 'la primera en entrar en un servidor sin dueño es la dueña');
  gam.send({ t: 'join', room: SRV3, slot: 0, token: tokG });
  await gam.next((m) => m.t === 'welcome');
  gam.send({ t: 'chat', text: '/aviso me lo invento' });
  assert.match((await gam.next((m) => m.t === 'system' && /dueño/.test(m.text))).text, /Solo el dueño/, 'solo el dueño cambia el aviso');
  own.send({ t: 'chat', text: '/aviso Esta noche jugamos a las 22:00' });
  assert.strictEqual((await gam.next((m) => m.t === 'motd')).text, 'Esta noche jugamos a las 22:00', 'el mensaje del día llega a todos');
  assert.strictEqual(store.room(SRV3).motd, 'Esta noche jugamos a las 22:00', 'y se guarda');
  await sleep(1100);
  own.send({ t: 'chat', text: '/silenciar gamberro 5' });
  await gam.next((m) => m.t === 'system' && /silenciado 5 min/.test(m.text));
  await sleep(1100);
  gam.send({ t: 'chat', text: 'hola' });
  assert.match((await gam.next((m) => m.t === 'system' && /Estás silenciado/.test(m.text))).text, /silenciado/, 'silenciado no puede hablar');
  await sleep(1100);
  own.send({ t: 'chat', text: '/expulsar Gamberro 3' });
  assert.match((await gam.next((m) => m.t === 'kicked')).text, /3 min/, 'expulsado');
  await sleep(300);
  const gam2 = await client('Gamberro2');
  gam2.send({ t: 'join', room: SRV3, slot: 0, token: tokG });
  assert.match((await gam2.next((m) => m.t === 'error')).text, /te ha echado/, 'no puede volver hasta que pase el tiempo');
  // errores del navegador
  gam2.send({ t: 'clienterr', msg: 'TypeError: algo raro', src: 'ui.js', line: 42 });
  await sleep(100);
  assert.ok((store.meta('clientErrors') || []).some((e) => e.msg === 'TypeError: algo raro' && e.line === 42), 'los errores del navegador se guardan');
  own.ws.close(); gam2.ws.close();

  // Ficheros estáticos y protección de rutas
  const http = require('http');
  const get = (p) => new Promise((res) => http.get(`http://localhost:${process.env.PORT}${p}`, (rs) => { rs.resume(); res(rs.statusCode); }));
  assert.strictEqual(await get('/'), 200);
  assert.strictEqual(await get('/rules/engine.js'), 200);
  assert.notStrictEqual(await get('/../server.js'), 200);
  assert.notStrictEqual(await get('/%2e%2e/server.js'), 200);
  assert.strictEqual(await get('/admin'), 404, 'sin ADMIN_KEY no hay panel');
  assert.strictEqual(await get('/portada'), 200, 'portada');
  assert.strictEqual(await get('/guia.pdf'), 200, 'guía en PDF');
  assert.strictEqual(await get('/sw.js'), 200, 'service worker');

  console.log('✔ Todas las pruebas pasan');
  a.ws.close();
  server.close();
  process.exit(0);
})().catch((e) => { console.error('✘', e); for (const cl of global.__clients || []) console.error(cl.inbox.filter((m) => m.t === 'error' || m.t === 'forge:result').slice(-5)); process.exit(1); });
