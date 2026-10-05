// Servidor de la taberna: sirve los ficheros del cliente y reparte los mensajes por WebSocket.
// Lleva los perfiles (personaje, puntos, equipo, inventario, consumibles, bufos), las tiendas, el comercio
// entre jugadores, el editor de la taberna y las partidas (mazmorras aleatorias y mundo abierto).
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const MAP = require('./public/map.js');
const DUNGEON = require('./public/dungeon-data.js');
const RULES = require('./public/rules/engine.js');
const PROG = require('./public/rules/progress.js');
const { createStore } = require('./server/store.js');
const { Instance } = require('./server/dungeon.js');
const GEN = require('./server/gen.js');
const WORLD = require('./server/world.js');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_USERS_PER_ROOM = 30;
const HISTORY_SIZE = 60;
const MAX_TEXT = 200;
const START_GOLD = 50;
const ROUND_PRICE = 5;
const EMPTY_INSTANCE_MS = 3 * 60 * 1000; // una mazmorra vacía se guarda un rato por si vuelves
const SHOP_REFRESH_MS = 10 * 60 * 1000;

const store = createStore();
const rnd = () => crypto.randomInt(0, 1e9) / 1e9;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    res.writeHead(400); return res.end();
  }
  if (urlPath === '/healthz') { res.writeHead(200); return res.end('ok'); }
  if (urlPath === '/') urlPath = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, urlPath));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('No encontrado'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

// ---------- Salas ----------
const rooms = new Map(); // nombre -> { name, users: Map<id, user>, history: [], map, instances: Map }

function getRoom(name) {
  if (!rooms.has(name)) {
    const saved = store.room(name);
    rooms.set(name, {
      name,
      users: new Map(),
      history: [],
      map: MAP.createMap(saved ? saved.items : undefined),
      ownerId: saved ? saved.ownerId : null,
      instances: new Map(),
    });
  }
  return rooms.get(name);
}

function saveRoom(room) {
  store.setRoom(room.name, { ownerId: room.ownerId, items: room.map.items.map(({ type, x, y, dir }) => (dir ? { type, x, y, dir } : { type, x, y })) });
}

function cleanRoomName(s) {
  const n = String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
  return n || 'taberna';
}

function cleanText(s, max) {
  return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

const levelOf = (u) => RULES.levelFromXp(u.profile.xp);

function publicUser(u) {
  return { id: u.id, name: u.name, title: u.profile.title || null, look: u.look, gold: u.profile.gold, xp: u.profile.xp, level: levelOf(u), x: u.x, y: u.y, where: u.where ? u.where.name : null };
}

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
}

function broadcast(room, msg, exceptId) {
  const data = JSON.stringify(msg);
  for (const u of room.users.values()) {
    if (u.id !== exceptId && u.ws.readyState === u.ws.OPEN) u.ws.send(data);
  }
}

function remember(room, msg) {
  room.history.push(msg);
  if (room.history.length > HISTORY_SIZE) room.history.shift();
}

function say(room, msg) {
  msg.ts = Date.now();
  remember(room, msg);
  broadcast(room, msg);
}

function system(room, text) {
  say(room, { t: 'system', text });
}

// ---------- Perfiles ----------
// { name, xp, gold, char: { cls, cls2, alloc, look }, equip: { slot: item }, bag: [item], cons: { id: n }, buffs: { id: hasta } }
function lookFrom(profile) {
  const l = profile.char.look || {};
  return { ...MAP.cleanLook({ cls: profile.char.cls, cls2: profile.char.cls2, species: l.species, skin: l.skin, hair: l.hair }), gear: RULES.gearLook(profile.equip) };
}

function derive(profile) { return RULES.derive(profile); }

// Prepara un perfil (nuevo, de una versión anterior o con otra clase elegida al entrar)
function setupProfile(profile, look) {
  const level = RULES.levelFromXp(profile.xp || 0);
  if (!profile.char || !RULES.CLASSES[profile.char.cls]) {
    profile.char = RULES.newChar(look.cls, look.cls2, {});
    profile.equip = {}; profile.bag = []; profile.cons = { 'pocion-vida-p': 3 }; profile.buffs = {};
    for (const it of RULES.starterItems(profile.char.cls, rnd)) profile.equip[it.slot] = it;
    delete profile.sheet;
  }
  profile.char = RULES.cleanChar(profile.char, level);
  profile.char.look = { species: look.species, skin: look.skin, hair: look.hair };
  profile.equip = profile.equip || {}; profile.bag = Array.isArray(profile.bag) ? profile.bag : [];
  profile.cons = profile.cons || {}; profile.buffs = profile.buffs || {};
  profile.quests = profile.quests || {}; profile.questsDone = profile.questsDone || [];
  profile.waystones = profile.waystones || ['brumaverde'];
  profile.mats = profile.mats || {}; profile.stats = profile.stats || {}; profile.achievements = profile.achievements || [];
  profile.trophies = profile.trophies || [];
  if (profile.title && !PROG.ACHIEVEMENTS.some((a) => a.title === profile.title && profile.achievements.includes(a.id))) profile.title = null;
  if (profile.pet && !RULES.PETS[profile.pet.type]) profile.pet = null;
  if (profile.pet) { profile.pet.bag = Array.isArray(profile.pet.bag) ? profile.pet.bag : []; profile.pet.xp = profile.pet.xp || 0; }
  if (profile.mount && !RULES.MOUNTS[profile.mount]) profile.mount = null;
  changeClasses(profile, look.cls, look.cls2);
  for (const [id, until] of Object.entries(profile.buffs)) if (until <= Date.now()) delete profile.buffs[id];
}

// Cambio de clase: los puntos se devuelven, lo que ya no se puede llevar va a la mochila y se da el equipo inicial que falte
function changeClasses(profile, cls, cls2) {
  cls = RULES.classId(cls) || profile.char.cls;
  cls2 = RULES.classId(cls2);
  if (cls2 === cls) cls2 = null;
  if (cls === profile.char.cls && (cls2 || null) === (profile.char.cls2 || null)) return false;
  const level = RULES.levelFromXp(profile.xp || 0);
  profile.char.cls = cls; profile.char.cls2 = cls2 || null;
  profile.char.alloc = Object.fromEntries(RULES.STAT_IDS.map((k) => [k, 0]));
  for (const slot of RULES.SLOT_IDS) {
    const it = profile.equip[slot];
    if (it && !RULES.canEquip(it, profile.char, level).ok) { profile.bag.push(it); delete profile.equip[slot]; }
  }
  for (const it of RULES.starterItems(cls, rnd)) if (!profile.equip[it.slot]) profile.equip[it.slot] = it;
  return true;
}

function freeSpawn(room, except) {
  const taken = new Set([...room.users.values()].filter((u) => u !== except && !u.where).map((u) => u.x + ',' + u.y));
  for (let r = 0; r < 8; r++) {
    const candidates = [];
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
      const x = room.map.spawn.x + dx, y = room.map.spawn.y + dy;
      if (room.map.isPassable(x, y) && !taken.has(x + ',' + y)) candidates.push({ x, y });
    }
    if (candidates.length) return candidates[Math.floor(Math.random() * candidates.length)];
  }
  for (let x = 0; x < MAP.W; x++) for (let y = 0; y < MAP.H; y++) if (room.map.isPassable(x, y)) return { x, y };
  return { ...room.map.spawn };
}

function saveUser(user) { store.setPlayer(user.pid, user.profile); }

// El jugador recibe su perfil completo; los demás, lo que se ve
function sendMe(user) {
  const p = user.profile;
  ensureBoard(p);
  send(user.ws, { t: 'me', char: p.char, equip: p.equip, bag: p.bag, cons: p.cons, buffs: p.buffs, xp: p.xp, gold: p.gold, quests: p.quests, questsDone: p.questsDone, waystones: p.waystones, pet: p.pet || null, mount: p.mount || null, mats: p.mats, stats: p.stats, achievements: p.achievements, title: p.title || null, board: p.board, trophies: p.trophies });
}

function profileChanged(room, user, opts = {}) {
  saveUser(user);
  sendMe(user);
  if (opts.look) {
    user.look = lookFrom(user.profile);
    broadcast(room, { t: 'look', id: user.id, look: user.look });
  }
  if (user.where) { const inst = room.instances.get(user.where.id); if (inst) inst.refresh(user); }
}

// ---------- Experiencia y oro ----------
function reward(room, user, xp, gold) {
  const prof = user.profile;
  const before = RULES.levelFromXp(prof.xp);
  prof.xp = Math.max(0, prof.xp + xp);
  prof.gold = Math.max(0, prof.gold + gold);
  const after = RULES.levelFromXp(prof.xp);
  saveUser(user);
  broadcast(room, { t: 'profile', id: user.id, xp: prof.xp, gold: prof.gold, level: after });
  if (after > before) {
    track(room, user, 'level', { value: after });
    system(room, `⭐ ${user.name} sube a nivel ${after}. ¡Tiene puntos para repartir!`);
    send(user.ws, { t: 'levelup', level: after, points: RULES.pointsFree(prof.char, after) });
    profileChanged(room, user);
  } else if (gold) sendMe(user);
}

function give(room, user, item) {
  if (user.profile.bag.length >= RULES.BAG_SIZE) return false;
  user.profile.bag.push(item);
  if (item.rarity === 'legendario') track(room, user, 'legend', {});
  saveUser(user); sendMe(user);
  if (item.rarity === 'legendario' || item.rarity === 'conjunto') system(room, `${item.rarity === 'conjunto' ? '🟢' : '🟠'} ${user.name} encuentra «${item.name}».`);
  return true;
}

function giveCons(user, cid, n) {
  const c = user.profile.cons;
  if ((c[cid] || 0) + n < 0) return false;
  c[cid] = (c[cid] || 0) + n;
  if (c[cid] <= 0) delete c[cid];
  saveUser(user); sendMe(user);
  return true;
}

// ---------- Partidas ----------
function worldDef(room) {
  if (!room.world) room.world = WORLD.generate(room.name);
  return room.world;
}

function getInstance(room, def) {
  let inst = room.instances.get(def.id);
  if (!inst) {
    inst = new Instance(def, {
      send: (u, msg) => send(u.ws, msg),
      derive: (u) => derive(u.profile),
      reward: (u, xp, gold) => reward(room, u, xp, gold),
      give: (u, item) => give(room, u, item),
      giveCons: (u, cid, n) => giveCons(u, cid, n),
      exit: (u, reason, r) => leaveInstance(room, u, reason, r),
      portal: (u, cave, back) => enterCave(room, u, cave, back),
      petFor: (u) => petFor(u),
      mountFor: (u) => (u.profile.mount && levelOf(u) >= RULES.MOUNTS[u.profile.mount].minLevel ? { type: u.profile.mount, speed: RULES.MOUNTS[u.profile.mount].speed } : null),
      waystone: (u, ws) => discoverWaystone(room, u, ws),
      talk: (u, npc) => talkTo(u, npc),
      kill: (u, k, info) => { questKill(u, k); onKill(room, u, k, info || {}); },
      track: (u, ev, d) => track(room, u, ev, d),
      giveMat: (u, mat, n) => giveMats(room, u, { [mat]: n }, true),
      petXp: (u, xp) => petXp(room, u, xp),
      fish: (u, zone) => caughtFish(room, u, zone),
      herb: (u, zone) => gotHerb(room, u, zone),
      announce: (text) => system(room, text),
      worldBoss: (users, m, killer) => worldBossDown(room, users, m, killer),
      nextFloor: (u, desc, r) => nextFloor(room, u, desc, r),
      duelEnd: (loser, inst) => duelEnd(room, loser, inst),
    });
    room.instances.set(def.id, inst);
  }
  inst.emptySince = 0;
  return inst;
}

function detach(room, user) {
  const inst = user.where && room.instances.get(user.where.id);
  if (inst) {
    inst.leave(user.id);
    inst.flush([user]);
    if (!inst.size) {
      if (inst.kind === 'world') room.instances.delete(inst.id);
      else inst.emptySince = Date.now();
    }
  }
}

function newDungeon(room, theme, level, idHint) {
  const d = GEN.generate({ theme, level, seed: crypto.randomBytes(6).toString('hex') });
  d.id = idHint || 'd' + crypto.randomBytes(4).toString('hex');
  return getInstance(room, d);
}

function joinInstance(room, user, inst, via = {}) {
  if (user.where && user.where.id !== inst.id) detach(room, user);
  user.where = { id: inst.id, name: inst.def.name, from: via.from || null, back: via.back || null };
  inst.join(user, via.at);
  broadcast(room, { t: 'where', id: user.id, where: inst.def.name });
}

function enterCave(room, user, cave, back) {
  const id = `cave-${cave.x}-${cave.y}`;
  let inst = room.instances.get(id);
  if (!inst || inst.bossDead) { if (inst) room.instances.delete(id); inst = newDungeon(room, cave.theme, cave.level, id); }
  joinInstance(room, user, inst, { from: 'world', back });
  system(room, `⚔️ ${user.name} entra en «${inst.def.name}» (nivel ${inst.level}).`);
}

function enterWorld(room, user, at) {
  const def = worldDef(room);
  const inst = getInstance(room, def);
  if (user.where && user.where.id !== 'world') detach(room, user);
  user.where = { id: 'world', name: def.name };
  inst.join(user, at || def.start);
  broadcast(room, { t: 'where', id: user.id, where: def.name });
}

// Sale de una partida: desde una cueva del mundo se vuelve al mundo (salvo si cae o usa el pergamino de retorno)
function leaveInstance(room, user, reason, r) {
  if (!user.where) return;
  const where = user.where;
  detach(room, user);
  if (reason === 'win') system(room, `🏆 ${user.name} completa «${where.name}»: +${r.xp} de experiencia y +${r.gold} de oro.`);
  if (reason !== 'down' && reason !== 'town' && reason !== 'return' && where.from === 'world') {
    user.where = null;
    send(user.ws, { t: 'dexit', reason, silent: true });
    return enterWorld(room, user, where.back);
  }
  toTavern(room, user, reason, where.name);
}

function toTavern(room, user, reason, name) {
  if (user.where) detach(room, user);
  name = name || (user.where && user.where.name) || '';
  user.where = null;
  user.combat = null; // en la taberna se descansa: vida y energía al máximo
  const pos = freeSpawn(room, user);
  user.x = pos.x; user.y = pos.y;
  let lost = 0;
  if (reason === 'down') {
    lost = Math.floor(user.profile.gold * DUNGEON.deathGoldLoss);
    if (lost) reward(room, user, 0, -lost);
    system(room, `💀 ${user.name} cae en «${name}» y vuelve a la taberna${lost ? ` (pierde ${lost} de oro)` : ''}.`);
  } else if (reason !== 'win' && reason !== 'arena') {
    system(room, `${user.name} vuelve a la taberna.`);
  }
  send(user.ws, { t: 'dexit', reason, lost });
  broadcast(room, { t: 'where', id: user.id, where: null, x: user.x, y: user.y });
}

setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    for (const [id, inst] of room.instances) {
      if (inst.size) inst.tick(now);
      else if (inst.emptySince && now - inst.emptySince > EMPTY_INSTANCE_MS) room.instances.delete(id);
    }
  }
}, 50);

// ---------- Mascotas, piedras de viaje y misiones ----------
function petFor(user) {
  const pet = user.profile.pet;
  if (!pet || levelOf(user) < RULES.PET_LEVEL) return null;
  return { type: pet.type, name: pet.name || RULES.PETS[pet.type].name, st: RULES.petStats(pet.type, levelOf(user)) };
}

function discoverWaystone(room, user, ws) {
  const p = user.profile;
  if (!p.waystones.includes(ws.id)) {
    p.waystones.push(ws.id);
    saveUser(user); sendMe(user);
    send(user.ws, { t: 'dwhisper', text: `✨ Piedra de viaje descubierta: ${ws.name}.` });
  }
  send(user.ws, { t: 'waystones', open: true, here: ws.id });
}

// Estado de una misión para un jugador: 'done', 'active', 'ready' (lista para entregar), 'available', 'locked' o null
function questState(profile, id) {
  const Q = RULES.QUESTS[id];
  if (!Q) return null;
  if (profile.questsDone.includes(id)) return 'done';
  const a = profile.quests[id];
  if (a) return a.n >= (Q.goal.n || 1) ? 'ready' : 'active';
  if (Q.after && !profile.questsDone.includes(Q.after)) return null;
  return RULES.levelFromXp(profile.xp) >= (Q.minLevel || 1) ? 'available' : 'locked';
}

function talkTo(user, npc) {
  const p = user.profile;
  // las misiones de "habla con…" se completan al llegar
  for (const [id, a] of Object.entries(p.quests)) {
    const Q = RULES.QUESTS[id];
    if (Q && Q.goal.kind === 'talk' && Q.goal.npc === npc.id && a.n < 1) { a.n = 1; }
  }
  const quests = Object.entries(RULES.QUESTS).filter(([id, Q]) => Q.npc === npc.id || (Q.goal.kind === 'talk' && Q.goal.npc === npc.id && p.quests[id]))
    .map(([id]) => ({ id, state: questState(p, id) })).filter((q) => q.state && q.state !== 'done');
  saveUser(user); sendMe(user);
  send(user.ws, { t: 'npc', id: npc.id, name: npc.name, look: npc.look, lines: npc.lines, shop: npc.shop || null, quests });
}

function questKill(user, k) {
  const p = user.profile;
  let changed = false;
  for (const [id, a] of Object.entries(p.quests)) {
    const Q = RULES.QUESTS[id];
    if (!Q) continue;
    const g = Q.goal;
    const hit = (g.kind === 'kill' && g.mobs.includes(k)) || (g.kind === 'boss' && g.mob === k);
    if (!hit || a.n >= (g.n || 1)) continue;
    a.n++;
    changed = true;
    send(user.ws, { t: 'dwhisper', text: a.n >= (g.n || 1) ? `📜 «${Q.name}» completada. Vuelve a hablar con quien te la encargó.` : `📜 ${Q.name}: ${a.n}/${g.n}` });
  }
  if (changed) { saveUser(user); sendMe(user); }
}

// ---------- Tablón, logros, títulos y clasificaciones ----------
function ensureBoard(p) {
  const day = PROG.dayKey(), week = PROG.weekKey();
  const b = p.board;
  if (b && b.day === day && b.week === week) return;
  const nb = PROG.boardFor(day, week);
  const sameWeek = b && b.week === week;
  const prog = {}, claimed = [];
  if (sameWeek) for (const id of nb.weekly) { if (b.prog && b.prog[id]) prog[id] = b.prog[id]; if (b.claimed && b.claimed.includes(id)) claimed.push(id); }
  p.board = { day, week, daily: nb.daily, weekly: nb.weekly, prog, claimed };
}

const STAT_OF = { kill: 'kills', dungeon: 'dungeons', floor: 'floor', duel: 'duels', fish: 'fish', herb: 'herbs', cook: 'cook', forge: 'upmax', legend: 'legend', level: 'level', quest: 'quests', task: 'tasks', petlvl: 'petlvl', worldboss: 'worldboss', chest: 'chests', mat: 'mats' };
const RANK_OF = { kill: 'kills', worldboss: 'worldboss', duel: 'duels', floor: 'floor' };

// Un suceso del juego: cuenta para las estadísticas, el tablón, los logros y las clasificaciones
function track(room, user, ev, d = {}) {
  const p = user.profile;
  const n = d.n || 1;
  const st = STAT_OF[ev];
  if (st) {
    if (PROG.MAX_STATS.has(st)) { if (d.value !== undefined) p.stats[st] = Math.max(p.stats[st] || 0, d.value); }
    else p.stats[st] = (p.stats[st] || 0) + n;
  }
  if (ev === 'kill' && d.boss) { p.stats.bosses = (p.stats.bosses || 0) + 1; rankAdd(user, 'bosses', 1); }
  if (RANK_OF[ev]) rankAdd(user, RANK_OF[ev], PROG.BOARDS[RANK_OF[ev]].max ? d.value : n);
  // tablón
  ensureBoard(p);
  let visible = false;
  for (const id of [...p.board.daily, ...p.board.weekly]) {
    if (p.board.claimed.includes(id)) continue;
    const T = PROG.taskDef(id);
    if (!T || !PROG.taskMatch(T, ev, d)) continue;
    const before = p.board.prog[id] || 0;
    if (before >= T.n) continue;
    p.board.prog[id] = T.max ? Math.max(before, d.value || 0) : before + n;
    if (p.board.prog[id] >= T.n) { visible = true; send(user.ws, { t: 'dwhisper', text: `📋 Tarea completada: «${PROG.taskText(id)}». Recoge la recompensa en el Tablón de la taberna.` }); }
  }
  if (checkAchievements(room, user)) visible = true;
  user.meDirty = true;
  if (visible) { saveUser(user); sendMe(user); }
}

function checkAchievements(room, user) {
  const p = user.profile;
  let got = false;
  for (const a of PROG.ACHIEVEMENTS) {
    if (p.achievements.includes(a.id) || (p.stats[a.stat] || 0) < a.n) continue;
    p.achievements.push(a.id);
    got = true;
    p.gold += a.gold;
    send(user.ws, { t: 'achievement', id: a.id, name: a.name, title: a.title || null, gold: a.gold });
    system(room, `🏅 ${user.name} consigue el logro «${a.name}»${a.title ? ` y el título «${a.title}»` : ''}.`);
  }
  if (got) broadcast(room, { t: 'profile', id: user.id, xp: p.xp, gold: p.gold, level: levelOf(user) });
  return got;
}

function rankAdd(user, cat, v) {
  if (!v) return;
  const key = 'ranks:' + PROG.weekKey();
  const all = store.meta(key) || {};
  const tab = all[cat] || (all[cat] = {});
  const cur = tab[user.pid] || { name: user.name, v: 0 };
  cur.name = user.name;
  cur.v = PROG.BOARDS[cat].max ? Math.max(cur.v, v) : cur.v + v;
  tab[user.pid] = cur;
  store.setMeta(key, all);
}

function ranksView(user) {
  const week = PROG.weekKey();
  const all = store.meta('ranks:' + week) || {};
  const boards = {};
  for (const cat of Object.keys(PROG.BOARDS)) {
    const tab = all[cat] || {};
    boards[cat] = Object.entries(tab).map(([pid, r]) => ({ name: r.name, v: Math.round(r.v * 10) / 10, me: pid === user.pid })).sort((a, b) => b.v - a.v).slice(0, 10);
    const mine = tab[user.pid];
    if (mine && !boards[cat].some((r) => r.me)) boards[cat].push({ name: mine.name, v: mine.v, me: true, pos: Object.values(tab).filter((r) => r.v > mine.v).length + 1 });
  }
  return { t: 'ranks', week, mod: PROG.weekMod(week), boards, ends: (week + 1) * 7 * 86400000 + 4 * 86400000 };
}

// ---------- Materiales, oficios y mascotas ----------
function giveMats(room, user, mats, silent) {
  const p = user.profile;
  let forge = 0;
  for (const [k, n] of Object.entries(mats)) {
    if (!PROG.MATS[k] || !n) continue;
    p.mats[k] = (p.mats[k] || 0) + n;
    if (PROG.MATS[k].kind === 'forja') forge += n;
  }
  if (forge) track(room, user, 'mat', { n: forge });
  else user.meDirty = true;
  if (!silent) { saveUser(user); sendMe(user); }
}
function takeMats(p, need) {
  for (const [k, n] of Object.entries(need)) if (n && (p.mats[k] || 0) < n) return false;
  for (const [k, n] of Object.entries(need)) if (n) { p.mats[k] -= n; if (p.mats[k] <= 0) delete p.mats[k]; }
  return true;
}
const matsText = (need) => Object.entries(need).filter(([k, n]) => n && PROG.MATS[k]).map(([k, n]) => `${n} ${PROG.MATS[k].icon} ${PROG.MATS[k].name}`).join(', ');

function onKill(room, user, k, info) {
  track(room, user, 'kill', info);
  if (info.boss && !user.profile.trophies.includes(k)) {
    user.profile.trophies.push(k);
    send(user.ws, { t: 'dwhisper', text: `🏆 Nuevo trofeo para tu habitación: ${(RULES.MONSTERS[k] || {}).name || k}.` });
  }
}

function petXp(room, user, xp) {
  const pet = user.profile.pet;
  if (!pet) return;
  const before = RULES.petLevelFromXp(pet.xp);
  pet.xp += xp;
  const after = RULES.petLevelFromXp(pet.xp);
  if (after <= before) { user.meDirty = true; return; }
  const evo = RULES.petEvo(after) > RULES.petEvo(before);
  send(user.ws, { t: 'dwhisper', text: `🐾 ${pet.name} sube a nivel ${after}${after === RULES.PET_SKILL_LEVEL ? ` y aprende «${RULES.PET_SKILLS[pet.type].name}»` : ''}.` });
  if (evo) system(room, `✨ ¡${pet.name}, la mascota de ${user.name}, evoluciona en ${RULES.petTitle(pet.type, after)}!`);
  track(room, user, 'petlvl', { value: after });
  profileChanged(room, user);
}

function caughtFish(room, user, zone) {
  const f = PROG.catchFish(rnd, zone);
  const F = PROG.MATS[f.id];
  const p = user.profile;
  const record = f.w > (p.stats.bigfish || 0);
  if (record) { p.stats.bigfish = f.w; rankAdd(user, 'bigfish', f.w); }
  giveMats(room, user, { [f.id]: 1 }, true);
  track(room, user, 'fish', { w: f.w });
  if (f.id === 'dorado') { p.stats.goldfish = (p.stats.goldfish || 0) + 1; checkAchievements(room, user); system(room, `🌟 ¡${user.name} ha pescado un ${F.name} de ${f.w} kg!`); }
  send(user.ws, { t: 'dwhisper', text: `🎣 ¡Has pescado ${F.icon} ${F.name} (${f.w} kg)!${record ? ' ¡Tu récord!' : ''}` });
  saveUser(user); sendMe(user);
}

function gotHerb(room, user, zone) {
  const id = PROG.HERB_BY_ZONE[Math.max(0, Math.min(5, zone))];
  const n = rnd() < 0.3 ? 2 : 1;
  giveMats(room, user, { [id]: n }, true);
  track(room, user, 'herb', { n });
  send(user.ws, { t: 'dwhisper', text: `🌿 Recoges ${n} ${PROG.MATS[id].icon} ${PROG.MATS[id].name}.` });
  saveUser(user); sendMe(user);
}

function worldBossDown(room, users, m, killer) {
  system(room, `🏆 ¡${m.name} ha caído a manos de ${killer.name}! ${users.length > 1 ? users.map((u) => u.name).join(', ') + ' se reparten' : 'Se lleva'} un botín legendario.`);
  for (const u of users) {
    const rarity = rnd() < 0.2 ? 'legendario' : 'epico';
    const it = RULES.makeItem(rnd, { ilvl: m.level, rarity, classes: [u.profile.char.cls, u.profile.char.cls2].filter(Boolean) });
    if (give(room, u, it)) send(u.ws, { t: 'dgot', item: it });
    else send(u.ws, { t: 'dwhisper', text: 'Tu mochila estaba llena: te quedas sin el objeto del jefe.' });
    giveMats(room, u, { esencia: 3, polvo: 1 }, true);
    if (!u.profile.trophies.includes(m.k)) u.profile.trophies.push(m.k);
    track(room, u, 'worldboss', { n: 1 });
    reward(room, u, Math.round(m.xp * 0.5), Math.round(m.gold[1]));
    profileChanged(room, u);
  }
}

// ---------- Descenso infinito ----------
function startDescent(room, user) {
  const level = levelOf(user);
  const run = 'desc' + crypto.randomBytes(3).toString('hex');
  const inst = descentFloor(room, { run, floor: 1, start: level, mod: PROG.weekMod() });
  joinInstance(room, user, inst);
  const M = PROG.WEEKLY_MODS[inst.def.descent.mod];
  system(room, `🌀 ${user.name} empieza el Descenso infinito (desafío de la semana: ${M.icon} ${M.name}). Podéis uniros desde 🗝️ Mazmorras.`);
}
function descentFloor(room, desc) {
  const id = `${desc.run}-f${desc.floor}`;
  let inst = room.instances.get(id);
  if (inst) return inst;
  const d = GEN.generate({ theme: PROG.descentTheme(desc.floor), level: PROG.descentLevel(desc.start, desc.floor), seed: crypto.randomBytes(6).toString('hex') });
  d.id = id;
  d.name = `Descenso · piso ${desc.floor}`;
  d.descent = { ...desc };
  inst = getInstance(room, d);
  return inst;
}
function nextFloor(room, user, desc, r) {
  const floor = desc.floor + 1;
  track(room, user, 'floor', { value: floor });
  send(user.ws, { t: 'dwhisper', text: `🌀 Piso ${desc.floor} superado (+${r.xp} PX, +${r.gold} 🪙). Bajas al piso ${floor}…` });
  if (desc.floor % 5 === 0) {
    const it = RULES.makeItem(rnd, { ilvl: PROG.descentLevel(desc.start, desc.floor), rarity: desc.floor % 10 === 0 ? 'legendario' : 'epico', classes: [user.profile.char.cls, user.profile.char.cls2].filter(Boolean) });
    if (give(room, user, it)) send(user.ws, { t: 'dgot', item: it });
    giveMats(room, user, { esencia: 2, polvo: 1 }, true);
    system(room, `🌀 ${user.name} supera el piso ${desc.floor} del Descenso y encuentra «${it.name}».`);
  }
  const inst = descentFloor(room, { ...desc, floor });
  detach(room, user);
  user.where = null;
  joinInstance(room, user, inst);
}

// ---------- Arena: duelos con apuesta en el sótano de Alfonso ----------
function startDuel(room, A, B, bet) {
  const { w, h } = PROG.ARENA;
  const def = {
    id: 'arena' + crypto.randomBytes(3).toString('hex'), kind: 'arena', name: 'Arena del sótano de Alfonso', w, h, tiles: PROG.arenaTiles(), theme: 'fortaleza',
    level: Math.max(levelOf(A), levelOf(B)), start: { x: 2, y: 5 },
    props: [{ k: 'brazier', x: 1, y: 1 }, { k: 'brazier', x: w - 2, y: 1 }, { k: 'brazier', x: 1, y: h - 2 }, { k: 'brazier', x: w - 2, y: h - 2 }, { k: 'torch', x: 4, y: 0 }, { k: 'torch', x: 10, y: 0 }, { k: 'banner', x: 7, y: 0 }, { k: 'rug', x: 7, y: 5 }, { k: 'blood', x: 6, y: 4 }],
    duel: { a: A.id, b: B.id, bet, startAt: Date.now() + 3500 },
  };
  for (const u of [A, B]) { u.profile.gold -= bet; broadcast(room, { t: 'profile', id: u.id, xp: u.profile.xp, gold: u.profile.gold, level: levelOf(u) }); saveUser(u); }
  const inst = getInstance(room, def);
  joinInstance(room, A, inst, { at: { x: 2, y: 5 } });
  joinInstance(room, B, inst, { at: { x: w - 3, y: 5 } });
  system(room, `🤺 ¡Duelo en el sótano! ${A.name} contra ${B.name}${bet ? ` por ${bet * 2} 🪙` : ''}. ¡Hagan sus apuestas!`);
}
function duelEnd(room, loser, inst) {
  if (!inst || inst.duelDone) return;
  inst.duelDone = true;
  const winner = [...inst.players.values()].map((p) => p.user).find((u) => u.id !== loser.id);
  const bet = inst.duel ? inst.duel.bet : 0;
  if (winner) {
    winner.profile.gold += bet * 2;
    track(room, winner, 'duel', { n: 1 });
    system(room, `🏆 ${winner.name} gana el duelo contra ${loser.name}${bet ? ` y se lleva ${bet * 2} 🪙` : ''}.`);
  } else if (bet) loser.profile.gold += bet; // el rival se fue: se le devuelve lo suyo
  for (const p of [...inst.players.values()]) {
    const u = p.user;
    inst.leave(u.id);
    toTavern(room, u, 'arena');
    broadcast(room, { t: 'profile', id: u.id, xp: u.profile.xp, gold: u.profile.gold, level: levelOf(u) });
    profileChanged(room, u);
  }
  room.instances.delete(inst.id);
}

// ---------- Habitación con trofeos ----------
function roomInfo(u) {
  const p = u.profile;
  return {
    t: 'roominfo', id: u.id, name: u.name, title: p.title || null, look: u.look, level: levelOf(u), trophies: p.trophies, achievements: p.achievements, stats: p.stats,
    pet: p.pet ? { type: p.pet.type, name: p.pet.name, plvl: RULES.petLevelFromXp(p.pet.xp) } : null, mount: p.mount || null, weapon: p.equip.arma || null,
  };
}

setInterval(() => {
  for (const room of rooms.values()) for (const u of room.users.values()) if (u.meDirty) { u.meDirty = false; saveUser(u); sendMe(u); }
}, 2500);

// ---------- Tiendas ----------
function shopFor(user, npc) {
  const level = levelOf(user);
  const d = derive(user.profile);
  const scale = RULES.priceScale(level);
  if (npc === 'armero') {
    const bucket = Math.floor(Date.now() / SHOP_REFRESH_MS);
    const seed = RULES.seeded(`shop:${user.pid}:${bucket}:${level}:${user.profile.char.cls}:${user.profile.char.cls2}`);
    const stock = RULES.armeroStock(seed, level, [user.profile.char.cls, user.profile.char.cls2].filter(Boolean));
    const bought = (user.shopBought && user.shopBought.bucket === bucket) ? user.shopBought.set : new Set();
    return { npc, kind: 'items', items: stock.map((it, i) => ({ ...it, price: RULES.itemBuyPrice(it, d.discount), sold: bought.has(i) })), bucket, refresh: (bucket + 1) * SHOP_REFRESH_MS };
  }
  if (npc === 'bruja') {
    return { npc, kind: 'cons', list: Object.entries(RULES.CONSUMABLES).filter(([, c]) => c.shop === 'bruja').map(([id, c]) => ({ id, price: RULES.buyPrice(c.price * scale, d.discount) })) };
  }
  if (npc === 'mago') {
    return {
      npc, kind: 'magic',
      list: Object.entries(RULES.CONSUMABLES).filter(([, c]) => c.shop === 'mago').map(([id, c]) => ({ id, price: RULES.buyPrice(c.price * scale, d.discount) })),
      buffs: Object.entries(RULES.BUFFS).filter(([, b]) => !b.food).map(([id, b]) => ({ id, price: RULES.buyPrice(b.price * scale, d.discount) })),
    };
  }
  return null;
}

// ---------- Comercio entre jugadores ----------
const trades = new Map();

function tradeState(t) {
  const side = (u) => ({ id: u.id, name: u.name, gold: t.offer[u.id].gold, items: t.offer[u.id].items.map((id) => u.profile.bag.find((it) => it.id === id)).filter(Boolean), ok: !!t.ok[u.id] });
  return { t: 'trade:state', id: t.id, a: side(t.a), b: side(t.b) };
}
function sendTrade(t) { const m = tradeState(t); send(t.a.ws, m); send(t.b.ws, m); }
function endTrade(t, text) {
  trades.delete(t.id);
  for (const u of [t.a, t.b]) { if (u.trade === t) u.trade = null; send(u.ws, { t: 'trade:end', text }); }
}

// ---------- Conexiones ----------
const EMOTES = new Set(['wave', 'dance', 'cheers', 'laugh', 'heart', 'fight', 'think', 'sleep']);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16384 });

wss.on('connection', (ws) => {
  let user = null;
  let room = null;
  let tokens = 8; // limitador de mensajes (cubo de fichas)
  let lastRefill = Date.now();
  let gameTokens = 40; // órdenes de partida (más frecuentes)
  let gameRefill = Date.now();
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  const joinTimer = setTimeout(() => { if (!user) ws.close(4000, 'join timeout'); }, 15000);

  function allow(cost = 1) {
    const now = Date.now();
    tokens = Math.min(8, tokens + (now - lastRefill) / 900);
    lastRefill = now;
    if (tokens < cost) return false;
    tokens -= cost;
    return true;
  }
  function allowGame() {
    const now = Date.now();
    gameTokens = Math.min(40, gameTokens + (now - gameRefill) / 50);
    gameRefill = now;
    if (gameTokens < 1) return false;
    gameTokens -= 1;
    return true;
  }

  const isOwner = () => room.ownerId === user.pid;
  const inst = () => (user.where ? room.instances.get(user.where.id) : null);
  const err = (text) => send(ws, { t: 'error', text });
  const nearShopNpc = () => {
    const i = inst();
    const p = i && i.players.get(user.id);
    return !!(p && i.npcs.some((n) => n.shop && Math.max(Math.abs(n.x - p.x), Math.abs(n.y - p.y)) <= 3));
  };

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg.t !== 'string') return;

    if (!user) {
      if (msg.t !== 'join') return;
      const roomName = cleanRoomName(msg.room);
      room = getRoom(roomName);
      if (room.users.size >= MAX_USERS_PER_ROOM) {
        send(ws, { t: 'error', text: 'La taberna está llena. Prueba otra sala.' });
        return ws.close();
      }
      clearTimeout(joinTimer);
      const token = typeof msg.token === 'string' && /^[a-zA-Z0-9_-]{16,64}$/.test(msg.token) ? msg.token : crypto.randomBytes(16).toString('hex');
      const pid = store.hash(token);
      const name = cleanText(msg.name, 16) || 'Aventurero';
      const profile = store.player(pid) || { xp: 0, gold: START_GOLD };
      profile.name = name;
      const look = MAP.cleanLook(msg.look);
      setupProfile(profile, look);
      store.setPlayer(pid, profile);
      // Quien entra primero en una sala nueva es su dueño y puede editar los muebles
      if (!room.ownerId) { room.ownerId = pid; saveRoom(room); }
      const pos = freeSpawn(room);
      user = { id: crypto.randomBytes(6).toString('hex'), pid, name, look: lookFrom(profile), profile, x: pos.x, y: pos.y, where: null, ws, trade: null };
      room.users.set(user.id, user);
      send(ws, {
        t: 'welcome', id: user.id, room: roomName, owner: isOwner(),
        items: room.map.items,
        users: [...room.users.values()].map(publicUser),
        history: room.history,
      });
      sendMe(user);
      broadcast(room, { t: 'join', user: publicUser(user) }, user.id);
      system(room, `${user.name} entra en la taberna.`);
      return;
    }

    switch (msg.t) {
      case 'move': {
        if (user.where) return;
        const { x, y } = msg;
        if (!room.map.isStandable(x, y)) return;
        if (room.map.isSeat(x, y)) {
          for (const o of room.users.values()) if (o !== user && !o.where && o.x === x && o.y === y) return; // asiento ocupado
        }
        user.x = x; user.y = y;
        broadcast(room, { t: 'move', id: user.id, x, y });
        break;
      }
      case 'chat': {
        if (!allow()) return send(ws, { t: 'system', text: 'Más despacio, bardo. Espera un momento.', ts: Date.now() });
        const text = cleanText(msg.text, MAX_TEXT);
        if (!text) return;
        if (text[0] === '/') return command(text);
        say(room, { t: 'chat', id: user.id, name: user.name, cls: user.look.cls, text });
        break;
      }
      case 'emote': {
        if (!EMOTES.has(msg.e) || !allow(0.5)) return;
        broadcast(room, { t: 'emote', id: user.id, e: msg.e });
        break;
      }
      case 'roll': {
        if (!allow()) return;
        roll(Number(msg.sides) || 20);
        break;
      }
      case 'drink': {
        if (!allow() || user.where) return;
        broadcast(room, { t: 'drink', id: user.id });
        system(room, `Alfonso el Tabernero sirve una jarra a ${user.name}. 🍺`);
        break;
      }
      case 'greet': {
        const target = room.users.get(msg.to);
        if (!target || target === user || !allow()) return;
        broadcast(room, { t: 'emote', id: user.id, e: 'wave' });
        system(room, `${user.name} saluda a ${target.name}. 👋`);
        break;
      }
      case 'round': {
        const target = room.users.get(msg.to);
        if (!target || target === user || !allow()) return;
        if (user.profile.gold < ROUND_PRICE) return send(ws, { t: 'system', text: `Necesitas ${ROUND_PRICE} monedas de oro para invitar.`, ts: Date.now() });
        reward(room, user, 0, -ROUND_PRICE);
        broadcast(room, { t: 'drink', id: target.id });
        system(room, `${user.name} invita a una ronda a ${target.name}. 🍻`);
        break;
      }

      // ----- Personaje -----
      case 'char:points': {
        // { alloc: { fue: 2, vit: 3 } } suma puntos libres
        const lvl = levelOf(user);
        const add = msg.alloc || {};
        let want = 0;
        for (const k of RULES.STAT_IDS) want += Math.max(0, Math.floor(Number(add[k]) || 0));
        if (!want) return;
        if (want > RULES.pointsFree(user.profile.char, lvl)) return err('No tienes tantos puntos.');
        for (const k of RULES.STAT_IDS) user.profile.char.alloc[k] += Math.max(0, Math.floor(Number(add[k]) || 0));
        profileChanged(room, user);
        break;
      }
      case 'char:respec': {
        if (user.where) return err('Vuelve a la taberna para reiniciar tus puntos.');
        const cost = 10 * levelOf(user);
        if (user.profile.gold < cost) return err(`Reiniciar los puntos cuesta ${cost} de oro.`);
        user.profile.gold -= cost;
        user.profile.char.alloc = Object.fromEntries(RULES.STAT_IDS.map((k) => [k, 0]));
        profileChanged(room, user);
        broadcast(room, { t: 'profile', id: user.id, xp: user.profile.xp, gold: user.profile.gold, level: levelOf(user) });
        break;
      }
      case 'char:save': {
        if (!allow(1)) return;
        if (user.where) return err('Vuelve a la taberna para cambiar de clase o de aspecto.');
        const look = MAP.cleanLook({ ...msg.look });
        const changed = changeClasses(user.profile, look.cls, look.cls2);
        user.profile.char.look = { species: look.species, skin: look.skin, hair: look.hair };
        profileChanged(room, user, { look: true });
        if (changed) {
          const c = user.profile.char;
          system(room, `📜 ${user.name} es ahora ${RULES.CLASSES[c.cls].name.toLowerCase()}${c.cls2 ? ' y ' + RULES.CLASSES[c.cls2].name.toLowerCase() : ''}.`);
        }
        break;
      }

      // ----- Inventario y equipo -----
      case 'inv:equip': {
        if (user.trade) return err('Termina el comercio primero.');
        const p = user.profile;
        const i = p.bag.findIndex((it) => it.id === msg.id);
        if (i < 0) return;
        const it = p.bag[i];
        const ok = RULES.canEquip(it, p.char, levelOf(user));
        if (!ok.ok) return err(ok.reason);
        p.bag.splice(i, 1);
        const out = [];
        if (p.equip[it.slot]) out.push(p.equip[it.slot]);
        // a dos manos no deja llevar nada en la izquierda (y al revés)
        if (it.slot === 'arma' && RULES.WEAPONS[it.base].hands === 2 && p.equip.mano) { out.push(p.equip.mano); delete p.equip.mano; }
        if (it.slot === 'mano' && p.equip.arma && RULES.WEAPONS[p.equip.arma.base].hands === 2) { out.push(p.equip.arma); delete p.equip.arma; }
        if (p.bag.length + out.length > RULES.BAG_SIZE) { p.bag.splice(i, 0, it); return err('No cabe en la mochila lo que te quitas.'); }
        p.equip[it.slot] = it;
        p.bag.push(...out);
        profileChanged(room, user, { look: true });
        break;
      }
      case 'inv:unequip': {
        const p = user.profile;
        if (!RULES.SLOTS[msg.slot] || !p.equip[msg.slot]) return;
        if (p.bag.length >= RULES.BAG_SIZE) return err('Tu mochila está llena.');
        p.bag.push(p.equip[msg.slot]);
        delete p.equip[msg.slot];
        profileChanged(room, user, { look: true });
        break;
      }
      case 'inv:drop': {
        if (user.trade) return err('Termina el comercio primero.');
        const p = user.profile;
        const i = p.bag.findIndex((it) => it.id === msg.id);
        if (i < 0) return;
        p.bag.splice(i, 1);
        profileChanged(room, user);
        break;
      }

      // ----- Tiendas (en la taberna) -----
      case 'shop:open': {
        if (user.where && !nearShopNpc()) return;
        const s = shopFor(user, msg.npc);
        if (s) send(ws, { t: 'shop', ...s });
        break;
      }
      case 'shop:buy': {
        if ((user.where && !(msg.npc === 'bruja' && nearShopNpc())) || !allow(0.5)) return;
        const s = shopFor(user, msg.npc);
        if (!s) return;
        const p = user.profile;
        if (msg.npc === 'armero') {
          const it = s.items[msg.i];
          if (!it || it.sold) return err('Ya no está a la venta.');
          if (p.gold < it.price) return err('No tienes oro suficiente.');
          if (p.bag.length >= RULES.BAG_SIZE) return err('Tu mochila está llena.');
          p.gold -= it.price;
          const { price, sold, ...item } = it; void price; void sold;
          item.id = crypto.randomBytes(5).toString('hex');
          p.bag.push(item);
          if (!user.shopBought || user.shopBought.bucket !== s.bucket) user.shopBought = { bucket: s.bucket, set: new Set() };
          user.shopBought.set.add(msg.i);
        } else if (msg.buff) {
          const b = s.buffs && s.buffs.find((x) => x.id === msg.buff);
          if (!b) return;
          if (p.gold < b.price) return err('No tienes oro suficiente.');
          p.gold -= b.price;
          p.buffs[b.id] = Math.max(Date.now(), p.buffs[b.id] || 0) + RULES.BUFFS[b.id].min * 60000;
          system(room, `✨ El Hombre de la Túnica murmura algo… ${user.name} recibe ${RULES.BUFFS[b.id].name}.`);
        } else {
          const c = s.list.find((x) => x.id === msg.id);
          const n = Math.max(1, Math.min(20, Math.floor(Number(msg.n) || 1)));
          if (!c) return;
          if (p.gold < c.price * n) return err('No tienes oro suficiente.');
          p.gold -= c.price * n;
          p.cons[c.id] = (p.cons[c.id] || 0) + n;
        }
        profileChanged(room, user);
        broadcast(room, { t: 'profile', id: user.id, xp: p.xp, gold: p.gold, level: levelOf(user) });
        send(ws, { t: 'shop', ...shopFor(user, msg.npc) });
        break;
      }
      case 'shop:sell': {
        if (user.where || user.trade) return;
        const p = user.profile;
        const ids = Array.isArray(msg.ids) ? msg.ids : [msg.id];
        let total = 0;
        for (const id of ids.slice(0, RULES.BAG_SIZE)) {
          const i = p.bag.findIndex((it) => it.id === id);
          if (i < 0) continue;
          total += p.bag[i].value;
          p.bag.splice(i, 1);
        }
        if (!total) return;
        p.gold += total;
        profileChanged(room, user);
        broadcast(room, { t: 'profile', id: user.id, xp: p.xp, gold: p.gold, level: levelOf(user) });
        send(ws, { t: 'sold', gold: total });
        break;
      }

      // ----- Comercio entre jugadores (en la taberna) -----
      case 'trade:req': {
        const other = room.users.get(msg.to);
        if (!other || other === user || !allow()) return;
        if (user.where || other.where) return err('Los dos tenéis que estar en la taberna.');
        if (user.trade || other.trade) return err('Alguien ya está comerciando.');
        other.tradeInvite = user.id;
        send(other.ws, { t: 'trade:invite', from: user.id, name: user.name });
        send(ws, { t: 'system', text: `Has propuesto comerciar a ${other.name}.`, ts: Date.now() });
        break;
      }
      case 'trade:accept': {
        const other = room.users.get(msg.from);
        if (!other || user.tradeInvite !== other.id || other.trade || user.trade || other.where || user.where) return err('La propuesta ya no vale.');
        user.tradeInvite = null;
        const t = { id: crypto.randomBytes(4).toString('hex'), a: other, b: user, offer: { [other.id]: { items: [], gold: 0 }, [user.id]: { items: [], gold: 0 } }, ok: {} };
        trades.set(t.id, t);
        other.trade = t; user.trade = t;
        sendTrade(t);
        break;
      }
      case 'trade:offer': {
        const t = user.trade;
        if (!t) return;
        const items = (Array.isArray(msg.items) ? msg.items : []).filter((id) => user.profile.bag.some((it) => it.id === id)).slice(0, 12);
        const gold = Math.max(0, Math.min(user.profile.gold, Math.floor(Number(msg.gold) || 0)));
        t.offer[user.id] = { items: [...new Set(items)], gold };
        t.ok = {};
        sendTrade(t);
        break;
      }
      case 'trade:ok': {
        const t = user.trade;
        if (!t) return;
        t.ok[user.id] = true;
        if (!(t.ok[t.a.id] && t.ok[t.b.id])) return sendTrade(t);
        // los dos aceptan: se comprueba todo y se intercambia
        const A = t.a, B = t.b, oa = t.offer[A.id], ob = t.offer[B.id];
        const has = (u, o) => o.items.every((id) => u.profile.bag.some((it) => it.id === id)) && u.profile.gold >= o.gold;
        if (!has(A, oa) || !has(B, ob)) return endTrade(t, 'El comercio se ha cancelado: algo cambió.');
        if (A.profile.bag.length - oa.items.length + ob.items.length > RULES.BAG_SIZE || B.profile.bag.length - ob.items.length + oa.items.length > RULES.BAG_SIZE) return endTrade(t, 'No cabe todo en las mochilas.');
        const take = (u, ids) => { const out = u.profile.bag.filter((it) => ids.includes(it.id)); u.profile.bag = u.profile.bag.filter((it) => !ids.includes(it.id)); return out; };
        const fromA = take(A, oa.items), fromB = take(B, ob.items);
        A.profile.bag.push(...fromB); B.profile.bag.push(...fromA);
        A.profile.gold += ob.gold - oa.gold; B.profile.gold += oa.gold - ob.gold;
        for (const u of [A, B]) { profileChanged(room, u); broadcast(room, { t: 'profile', id: u.id, xp: u.profile.xp, gold: u.profile.gold, level: levelOf(u) }); }
        endTrade(t, '¡Trato hecho!');
        system(room, `🤝 ${A.name} y ${B.name} cierran un trato.`);
        break;
      }
      case 'trade:cancel': {
        if (user.trade) endTrade(user.trade, `${user.name} cancela el comercio.`);
        else if (msg.from) { const o = room.users.get(msg.from); user.tradeInvite = null; if (o) send(o.ws, { t: 'system', text: `${user.name} no quiere comerciar ahora.`, ts: Date.now() }); }
        break;
      }

      // ----- Editor de la taberna (sólo el dueño de la sala) -----
      case 'tedit': {
        if (!isOwner()) return err('Sólo el dueño de la taberna puede mover los muebles.');
        if (!allow(0.25)) return;
        const items = room.map.items.map((it) => ({ ...it }));
        const at = (x, y) => items.findIndex((it) => it.x === x && it.y === y);
        if (msg.op === 'place') {
          const f = MAP.FURNITURE[msg.type];
          if (!f || f.hidden || !MAP.inBounds(msg.x, msg.y) || room.map.isFixed(msg.x, msg.y)) return;
          const i = at(msg.x, msg.y);
          if (i >= 0) items.splice(i, 1);
          items.push({ type: msg.type, x: msg.x, y: msg.y, dir: f.rotates ? msg.dir : undefined });
        } else if (msg.op === 'remove') {
          const i = at(msg.x, msg.y);
          if (i < 0) return;
          items.splice(i, 1);
        } else if (msg.op === 'rotate') {
          const i = at(msg.x, msg.y);
          if (i < 0 || !MAP.FURNITURE[items[i].type].rotates) return;
          items[i].dir = MAP.DIRS[(MAP.DIRS.indexOf(items[i].dir) + 1) % 4];
        } else if (msg.op === 'reset') {
          items.length = 0;
          items.push(...MAP.defaultItems());
        } else if (msg.op === 'clear') {
          items.length = 0;
        } else return;
        room.map.setItems(items);
        saveRoom(room);
        broadcast(room, { t: 'titems', items: room.map.items });
        for (const u of room.users.values()) {
          if (!u.where && !room.map.isStandable(u.x, u.y)) {
            const pos = freeSpawn(room, u);
            u.x = pos.x; u.y = pos.y;
            broadcast(room, { t: 'move', id: u.id, x: u.x, y: u.y, snap: true });
          }
        }
        break;
      }

      // ----- Mazmorras y mundo -----
      case 'dmenu': {
        const list = [...room.instances.values()].filter((i) => i.kind === 'dungeon' && !i.bossDead).map((i) => i.summary());
        send(ws, { t: 'dmenu', list, maxLevel: levelOf(user) + 3 });
        break;
      }
      case 'dnew': {
        if (user.where || !allow(2)) return;
        const level = Math.max(1, Math.min(levelOf(user) + 3, Math.floor(Number(msg.level) || 1)));
        const themes = Object.keys(RULES.THEMES);
        const theme = RULES.THEMES[msg.theme] ? msg.theme : themes[crypto.randomInt(0, themes.length)];
        const i = newDungeon(room, theme, level);
        joinInstance(room, user, i);
        system(room, `⚔️ ${user.name} baja a «${i.def.name}» (nivel ${level}). Podéis uniros desde 🗝️ Mazmorras.`);
        break;
      }
      case 'djoin': {
        if (user.where) return;
        const i = room.instances.get(String(msg.id));
        if (!i || i.kind !== 'dungeon' || i.bossDead) return err('Esa partida ya ha terminado.');
        joinInstance(room, user, i);
        system(room, `⚔️ ${user.name} se une a la partida en «${i.def.name}».`);
        break;
      }
      case 'wenter': {
        if (user.where) return;
        const def = worldDef(room);
        const ws = def.waystones.find((w) => w.id === msg.ws && user.profile.waystones.includes(w.id));
        enterWorld(room, user, ws ? { x: ws.x, y: ws.y + 1 } : null);
        system(room, `🗺️ ${user.name} sale de la taberna a «${room.world.name}».`);
        break;
      }
      case 'dgo': { const i = inst(); if (i && allowGame()) i.go(user.id, msg.x, msg.y); break; }
      case 'dattack': { const i = inst(); if (i && allowGame()) i.attack(user.id, String(msg.id)); break; }
      case 'ddir': { const i = inst(); if (i && allowGame()) i.dir(user.id, msg.dx, msg.dy); break; }
      case 'dskill': { const i = inst(); if (i && allowGame()) i.skill(user.id, msg); break; }
      case 'duse': { const i = inst(); if (i && allowGame()) i.use(user.id, String(msg.cid), msg); break; }
      case 'dtalk': { const i = inst(); if (i && allowGame()) i.talk(user.id, String(msg.id)); break; }
      case 'dmount': { const i = inst(); if (i && allowGame()) i.toggleMount(user.id); break; }
      case 'dtravel': {
        const i = inst();
        if (!i || i.kind !== 'world') return;
        const ws = i.waystones.find((w) => w.id === msg.id && user.profile.waystones.includes(w.id));
        if (ws) i.teleport(user.id, ws.x, ws.y);
        break;
      }
      case 'quest:accept': {
        const id = String(msg.id);
        const st = questState(user.profile, id);
        if (st === 'locked') return err(`Necesitas nivel ${RULES.QUESTS[id].minLevel} para esta misión.`);
        if (st !== 'available') return;
        user.profile.quests[id] = { n: 0 };
        profileChanged(room, user);
        send(ws, { t: 'dwhisper', text: `📜 Nueva misión: ${RULES.QUESTS[id].name}` });
        break;
      }
      case 'quest:turnin': {
        const id = String(msg.id);
        const Q = RULES.QUESTS[id];
        if (questState(user.profile, id) !== 'ready') return;
        let item = null;
        if (Q.item) {
          const ilvl = Math.max(levelOf(user), RULES.ZONES[Q.zone].lv[1]);
          item = RULES.makeItem(rnd, { ilvl, rarity: Q.item, classes: [user.profile.char.cls, user.profile.char.cls2].filter(Boolean) });
          if (user.profile.bag.length >= RULES.BAG_SIZE) return err('Haz sitio en la mochila para recoger la recompensa.');
          user.profile.bag.push(item);
        }
        delete user.profile.quests[id];
        user.profile.questsDone.push(id);
        track(room, user, 'quest', { value: user.profile.questsDone.length });
        reward(room, user, Q.xp, Q.gold);
        profileChanged(room, user);
        system(room, `📜 ${user.name} completa «${Q.name}»${item ? ` y recibe «${item.name}»` : ''}.`);
        if (item) send(ws, { t: 'dgot', item });
        break;
      }
      case 'quest:abandon': { if (user.profile.quests[msg.id]) { delete user.profile.quests[msg.id]; profileChanged(room, user); } break; }

      // ----- Establo: mascotas (nivel 5) y monturas (nivel 12) -----
      case 'stable:buy': {
        if (user.where || !allow(1)) return;
        const p = user.profile, lvl = levelOf(user);
        if (msg.kind === 'pet') {
          const P = RULES.PETS[msg.id];
          if (!P) return;
          if (lvl < RULES.PET_LEVEL) return err(`Las mascotas se adoptan a partir del nivel ${RULES.PET_LEVEL}.`);
          if (p.pet && p.pet.bag.length) return err('Vacía la mochila de tu mascota antes de cambiarla.');
          if (p.gold < P.price) return err('No tienes oro suficiente.');
          p.gold -= P.price;
          p.pet = { type: msg.id, name: cleanText(msg.name, 16) || P.name, bag: [] };
          system(room, `🐾 ${user.name} adopta: ${p.pet.name}.`);
        } else if (msg.kind === 'mount') {
          const M = RULES.MOUNTS[msg.id];
          if (!M) return;
          if (lvl < M.minLevel) return err(`Esta montura pide nivel ${M.minLevel}.`);
          if (p.gold < M.price) return err('No tienes oro suficiente.');
          p.gold -= M.price;
          p.mount = msg.id;
          system(room, `🐎 ${user.name} compra: ${M.name}.`);
        } else return;
        profileChanged(room, user);
        broadcast(room, { t: 'profile', id: user.id, xp: p.xp, gold: p.gold, level: lvl });
        break;
      }
      case 'pet:put': case 'pet:take': {
        const p = user.profile;
        if (!p.pet || user.trade) return;
        const from = msg.t === 'pet:put' ? p.bag : p.pet.bag, to = msg.t === 'pet:put' ? p.pet.bag : p.bag;
        const i = from.findIndex((it) => it.id === msg.id);
        if (i < 0) return;
        const it = from[i];
        if (msg.t === 'pet:put') {
          const cap = RULES.petStats(p.pet.type, levelOf(user)).cap;
          if (RULES.petBagWeight(p.pet) + RULES.itemWeight(it) > cap) return err(`${p.pet.name} no puede con tanto peso (${cap} kg).`);
        } else if (p.bag.length >= RULES.BAG_SIZE) return err('Tu mochila está llena.');
        from.splice(i, 1); to.push(it);
        profileChanged(room, user);
        break;
      }

      // ----- Oficios del mundo, esquiva -----
      case 'dfish': { const i = inst(); if (i && allowGame()) i.hook(user.id); break; }
      case 'dgather': { const i = inst(); if (i && allowGame()) i.gather(user.id, String(msg.id)); break; }
      case 'droll': { const i = inst(); if (i && allowGame()) i.roll(user.id, msg.dx, msg.dy); break; }

      // ----- Forja de Brunilda (en la taberna) -----
      case 'forge:up': case 'forge:enchant': {
        if (user.where || user.trade || !allow(0.5)) return;
        const p = user.profile;
        const it = p.bag.find((x) => x.id === msg.id) || Object.values(p.equip).find((x) => x && x.id === msg.id);
        if (!it) return;
        if (msg.t === 'forge:up') {
          if ((it.up || 0) >= PROG.MAX_UP) return err('Ese objeto ya está al máximo (+10).');
          const c = PROG.upgradeCost(it);
          if (p.gold < c.gold) return err(`Necesitas ${c.gold} 🪙.`);
          if (!takeMats(p, { hierro: c.hierro, esencia: c.esencia, polvo: c.polvo })) return err(`Te faltan materiales: ${matsText({ hierro: c.hierro, esencia: c.esencia, polvo: c.polvo })}.`);
          p.gold -= c.gold;
          const ok = rnd() < c.chance;
          if (ok) PROG.applyUpgrade(it);
          track(room, user, 'forge', { value: it.up || 0 });
          profileChanged(room, user, { look: Object.values(p.equip).includes(it) });
          send(ws, { t: 'forge:result', ok, item: it, text: ok ? `⚒️ ¡Clang! «${it.name}» queda más fuerte.` : '⚒️ El metal se resiste… La mejora ha fallado (el objeto no se rompe, pero los materiales se pierden).' });
          if (ok && it.up >= 7) system(room, `⚒️ Brunilda la herrera mejora «${it.name}» para ${user.name}.`);
        } else {
          const c = PROG.enchantCost(it);
          if (!it.stats || it.stats[msg.key] === undefined) return;
          if (p.gold < c.gold) return err(`Necesitas ${c.gold} 🪙.`);
          if (!takeMats(p, { esencia: c.esencia, polvo: c.polvo })) return err(`Te faltan materiales: ${matsText({ esencia: c.esencia, polvo: c.polvo })}.`);
          p.gold -= c.gold;
          const r = PROG.enchant(rnd, it, msg.key);
          if (!r) return err('No se puede encantar esa propiedad.');
          track(room, user, 'forge', { value: it.up || 0 });
          profileChanged(room, user);
          send(ws, { t: 'forge:result', ok: true, item: it, text: `✨ ${RULES.statName(r.from) || r.from} se convierte en ${RULES.fmtStat(r.to, r.v)}.` });
        }
        broadcast(room, { t: 'profile', id: user.id, xp: p.xp, gold: p.gold, level: levelOf(user) });
        break;
      }
      case 'forge:combine': {
        if (user.where || user.trade || !allow(0.5)) return;
        const p = user.profile;
        const ids = [...new Set(Array.isArray(msg.ids) ? msg.ids : [])].slice(0, 3);
        const items = ids.map((id) => p.bag.find((x) => x.id === id)).filter(Boolean);
        if (items.length !== 3) return err('Elige tres objetos de la mochila.');
        if (!PROG.COMBINE_TO[items[0].rarity] || items.some((x) => x.rarity !== items[0].rarity)) return err('Los tres tienen que ser de la misma rareza (común, raro o épico).');
        const ilvl = Math.round(items.reduce((t, x) => t + x.ilvl, 0) / 3);
        const c = PROG.combineCost(items[0].rarity, ilvl);
        if (p.gold < c.gold) return err(`Necesitas ${c.gold} 🪙.`);
        if (!takeMats(p, { esencia: c.esencia, polvo: c.polvo })) return err(`Te faltan materiales: ${matsText({ esencia: c.esencia, polvo: c.polvo })}.`);
        p.gold -= c.gold;
        p.bag = p.bag.filter((x) => !ids.includes(x.id));
        const out = PROG.combine(rnd, items, [p.char.cls, p.char.cls2].filter(Boolean));
        p.bag.push(out);
        track(room, user, 'forge', { value: 0 });
        if (out.rarity === 'legendario') track(room, user, 'legend', {});
        profileChanged(room, user);
        broadcast(room, { t: 'profile', id: user.id, xp: p.xp, gold: p.gold, level: levelOf(user) });
        send(ws, { t: 'forge:result', ok: true, item: out, text: `🔥 Los tres objetos se funden en «${out.name}».` });
        send(ws, { t: 'dgot', item: out });
        break;
      }
      case 'forge:salvage': {
        if (user.where || user.trade || !allow(0.5)) return;
        const p = user.profile;
        const ids = new Set((Array.isArray(msg.ids) ? msg.ids : [msg.id]).slice(0, RULES.BAG_SIZE));
        const got = {};
        for (const it of p.bag.filter((x) => ids.has(x.id))) for (const [k, n] of Object.entries(PROG.salvage(it))) got[k] = (got[k] || 0) + n;
        if (!Object.keys(got).length) return;
        p.bag = p.bag.filter((x) => !ids.has(x.id));
        giveMats(room, user, got, true);
        profileChanged(room, user);
        send(ws, { t: 'forge:result', ok: true, text: `🔨 Desguazado: ${matsText(got)}.` });
        break;
      }

      // ----- Cocina de Alfonso -----
      case 'cook': {
        if (user.where || !allow(0.5)) return;
        const R = PROG.RECIPES[msg.id];
        if (!R) return;
        const p = user.profile;
        const price = PROG.COOK_PRICE * Math.max(1, Math.ceil(levelOf(user) / 5));
        if (p.gold < price) return err(`Alfonso cobra ${price} 🪙 por cocinar.`);
        if (!takeMats(p, R.need)) return err(`Te faltan ingredientes: ${matsText(R.need)}.`);
        p.gold -= price;
        for (const k of Object.keys(p.buffs)) if (k.startsWith('comida:')) delete p.buffs[k];
        p.buffs['comida:' + msg.id] = Date.now() + PROG.FOOD_MIN * 60000;
        track(room, user, 'cook', {});
        profileChanged(room, user);
        broadcast(room, { t: 'profile', id: user.id, xp: p.xp, gold: p.gold, level: levelOf(user) });
        broadcast(room, { t: 'emote', id: user.id, e: 'cheers' });
        system(room, `🍲 Alfonso el Tabernero sirve ${R.icon} ${R.name} a ${user.name}. (${R.desc})`);
        break;
      }

      // ----- Tablón, logros, títulos, clasificaciones y habitación -----
      case 'board:claim': {
        const p = user.profile;
        ensureBoard(p);
        const id = String(msg.id);
        const T = PROG.taskDef(id);
        if (!T || ![...p.board.daily, ...p.board.weekly].includes(id) || p.board.claimed.includes(id) || (p.board.prog[id] || 0) < T.n) return;
        const r = PROG.taskReward(id, levelOf(user));
        let item = null;
        if (r.item) {
          if (p.bag.length >= RULES.BAG_SIZE) return err('Haz sitio en la mochila para la recompensa.');
          item = RULES.makeItem(rnd, { ilvl: levelOf(user), rarity: r.item, classes: [p.char.cls, p.char.cls2].filter(Boolean) });
          p.bag.push(item);
        }
        p.board.claimed.push(id);
        giveMats(room, user, r.mats, true);
        track(room, user, 'task', {});
        reward(room, user, r.xp, r.gold);
        profileChanged(room, user);
        send(ws, { t: 'dwhisper', text: `📋 Recompensa: +${r.xp} PX, +${r.gold} 🪙, ${matsText(r.mats)}${item ? ` y «${item.name}»` : ''}.` });
        if (item) send(ws, { t: 'dgot', item });
        break;
      }
      case 'title:set': {
        const p = user.profile;
        const title = msg.title ? String(msg.title) : null;
        if (title && !PROG.ACHIEVEMENTS.some((a) => a.title === title && p.achievements.includes(a.id))) return;
        p.title = title;
        saveUser(user); sendMe(user);
        broadcast(room, { t: 'title', id: user.id, title });
        break;
      }
      case 'ranks:get': { if (allow(0.3)) send(ws, ranksView(user)); break; }
      case 'room:get': {
        const u = msg.id ? room.users.get(msg.id) : user;
        if (u && allow(0.3)) send(ws, roomInfo(u));
        break;
      }

      // ----- Descenso infinito y duelos -----
      case 'descent:start': { if (!user.where && allow(2)) startDescent(room, user); break; }
      case 'duel:req': {
        const other = room.users.get(msg.to);
        if (!other || other === user || !allow()) return;
        if (user.where || other.where) return err('Los dos tenéis que estar en la taberna.');
        const bet = Math.max(0, Math.min(PROG.ARENA.maxBet, Math.floor(Number(msg.bet) || 0)));
        if (user.profile.gold < bet) return err('No tienes tanto oro para apostar.');
        other.duelInvite = { from: user.id, bet };
        send(other.ws, { t: 'duel:invite', from: user.id, name: user.name, bet });
        send(ws, { t: 'system', text: `Has retado a ${other.name} a un duelo${bet ? ` (${bet} 🪙 cada uno)` : ''}.`, ts: Date.now() });
        break;
      }
      case 'duel:accept': {
        const other = room.users.get(msg.from);
        const inv = user.duelInvite;
        if (!other || !inv || inv.from !== other.id || user.where || other.where) return err('El reto ya no vale.');
        user.duelInvite = null;
        if (user.profile.gold < inv.bet || other.profile.gold < inv.bet) return err('Alguien no tiene oro para la apuesta.');
        startDuel(room, other, user, inv.bet);
        break;
      }
      case 'duel:decline': {
        const other = room.users.get(msg.from);
        user.duelInvite = null;
        if (other) send(other.ws, { t: 'system', text: `${user.name} rechaza el duelo.`, ts: Date.now() });
        break;
      }

      case 'dleave': {
        if (!user.where) return;
        const ci = inst();
        if (ci && ci.kind === 'arena') return duelEnd(room, user, ci);
        if (user.where.id === 'world') toTavern(room, user, 'leave');
        else leaveInstance(room, user, 'leave');
        break;
      }
    }
  });

  function roll(sides) {
    const allowed = [4, 6, 8, 10, 12, 20, 100];
    if (!allowed.includes(sides)) sides = 20;
    const value = crypto.randomInt(1, sides + 1);
    let bonus = '';
    if (sides === 20 && value === 20) bonus = ' ¡CRÍTICO!';
    if (sides === 20 && value === 1) bonus = ' ¡Pifia!';
    say(room, { t: 'roll', id: user.id, name: user.name, sides, value, text: `🎲 ${user.name} tira un d${sides}: ${value}.${bonus}` });
  }

  function command(text) {
    const [cmd, ...rest] = text.slice(1).split(' ');
    const arg = rest.join(' ').trim();
    const c = cmd.toLowerCase();
    const dice = /^d(\d+)$/.exec(c);
    if (c === 'dado' || c === 'dados') return roll(Number(arg.replace(/^d/i, '')) || 20);
    if (dice) return roll(Number(dice[1]));
    if (c === 'me' && arg) return say(room, { t: 'action', id: user.id, name: user.name, text: `${user.name} ${arg}` });
    if (c === 'nombre' && arg) {
      const old = user.name;
      user.name = cleanText(arg, 16) || old;
      user.profile.name = user.name;
      saveUser(user);
      broadcast(room, { t: 'rename', id: user.id, name: user.name });
      return system(room, `${old} ahora se llama ${user.name}.`);
    }
    send(ws, { t: 'system', text: 'Comandos: /dado [6|20…], /d20, /me acción, /nombre NUEVO', ts: Date.now() });
  }

  ws.on('close', () => {
    clearTimeout(joinTimer);
    if (!user) return;
    if (user.trade) endTrade(user.trade, `${user.name} se ha ido.`);
    if (user.where) {
      const i = room.instances.get(user.where.id);
      if (i && i.kind === 'arena') duelEnd(room, user, i);
      else if (i) { i.leave(user.id); if (!i.size) { if (i.kind === 'world') room.instances.delete(i.id); else i.emptySince = Date.now(); } }
    }
    room.users.delete(user.id);
    broadcast(room, { t: 'leave', id: user.id });
    system(room, `${user.name} sale de la taberna.`);
    if (room.users.size === 0) {
      // Conservamos el historial un rato por si alguien vuelve enseguida
      const r = room;
      setTimeout(() => { if (r.users.size === 0 && rooms.get(r.name) === r) rooms.delete(r.name); }, 10 * 60 * 1000);
    }
  });
});

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);
wss.on('close', () => clearInterval(heartbeat));

function shutdown() { try { store.flushAll(); } catch { /* nada */ } process.exit(0); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

if (require.main === module) {
  server.listen(PORT, () => console.log(`🍺 La taberna está abierta en http://localhost:${PORT}`));
}

module.exports = { server, store };
