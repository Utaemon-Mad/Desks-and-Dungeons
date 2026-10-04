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
  return { id: u.id, name: u.name, look: u.look, gold: u.profile.gold, xp: u.profile.xp, level: levelOf(u), x: u.x, y: u.y, where: u.where ? u.where.name : null };
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
  send(user.ws, { t: 'me', char: p.char, equip: p.equip, bag: p.bag, cons: p.cons, buffs: p.buffs, xp: p.xp, gold: p.gold });
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
    system(room, `⭐ ${user.name} sube a nivel ${after}. ¡Tiene puntos para repartir!`);
    send(user.ws, { t: 'levelup', level: after, points: RULES.pointsFree(prof.char, after) });
    profileChanged(room, user);
  } else if (gold) sendMe(user);
}

function give(room, user, item) {
  if (user.profile.bag.length >= RULES.BAG_SIZE) return false;
  user.profile.bag.push(item);
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
  } else if (reason !== 'win') {
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
      buffs: Object.entries(RULES.BUFFS).map(([id, b]) => ({ id, price: RULES.buyPrice(b.price * scale, d.discount) })),
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
        system(room, `El tabernero sirve una jarra a ${user.name}. 🍺`);
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
        if (user.where) return;
        const s = shopFor(user, msg.npc);
        if (s) send(ws, { t: 'shop', ...s });
        break;
      }
      case 'shop:buy': {
        if (user.where || !allow(0.5)) return;
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
        enterWorld(room, user);
        system(room, `🗺️ ${user.name} sale de la taberna a «${room.world.name}».`);
        break;
      }
      case 'dgo': { const i = inst(); if (i && allowGame()) i.go(user.id, msg.x, msg.y); break; }
      case 'dattack': { const i = inst(); if (i && allowGame()) i.attack(user.id, String(msg.id)); break; }
      case 'ddir': { const i = inst(); if (i && allowGame()) i.dir(user.id, msg.dx, msg.dy); break; }
      case 'dskill': { const i = inst(); if (i && allowGame()) i.skill(user.id, msg); break; }
      case 'duse': { const i = inst(); if (i && allowGame()) i.use(user.id, String(msg.cid), msg); break; }
      case 'dleave': {
        if (!user.where) return;
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
      if (i) { i.leave(user.id); if (!i.size) { if (i.kind === 'world') room.instances.delete(i.id); else i.emptySince = Date.now(); } }
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
