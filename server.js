// Servidor de la taberna: sirve los ficheros del cliente y reparte los mensajes por WebSocket.
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
const WORLD = require('./server/world.js');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_USERS_PER_ROOM = 30;
const HISTORY_SIZE = 60;
const MAX_TEXT = 200;
const START_GOLD = 50;
const ROUND_PRICE = 5;
const MAX_DUNGEONS_PER_PLAYER = 20;

const store = createStore();

// Siempre hay al menos una mazmorra para jugar
if (!Object.keys(store.dungeons()).length) {
  const s = DUNGEON.sample();
  store.setDungeon('cripta', { id: 'cripta', ...s, author: 'La taberna', authorId: 'system', updated: Date.now() });
}

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

function publicUser(u) {
  return { id: u.id, name: u.name, look: u.look, gold: u.profile.gold, xp: u.profile.xp, sheet: u.profile.sheet, x: u.x, y: u.y, where: u.where ? u.where.name : null };
}

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
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

// El aspecto del héroe sale de su ficha: clase, especie y linaje, más piel y pelo
function lookFromSheet(sheet) {
  return MAP.cleanLook({ cls: sheet.class, species: sheet.species, sub: sheet.subspecies || undefined, skin: sheet.look.skin, hair: sheet.look.hair });
}

// Si el jugador no tiene ficha (o eligió otra clase/especie al entrar) se le da un personaje pregenerado
function ensureSheet(profile, look, name) {
  const s = profile.sheet;
  if (s && s.class === look.cls && s.species === look.species) {
    const v = RULES.validate({ ...s, name: s.name || name, look: { skin: look.skin, hair: look.hair } }, profile.xp);
    if (v.ok) { profile.sheet = v.sheet; return; }
  }
  profile.sheet = RULES.pregen(look.cls, look.species, { name, look: { skin: look.skin, hair: look.hair }, xp: profile.xp, subspecies: look.sub });
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

// ---------- Experiencia y oro ----------
function reward(room, user, xp, gold) {
  const prof = user.profile;
  const before = RULES.levelFromXp(prof.xp);
  prof.xp = Math.max(0, prof.xp + xp);
  prof.gold = Math.max(0, prof.gold + gold);
  store.setPlayer(user.pid, prof);
  broadcast(room, { t: 'profile', id: user.id, xp: prof.xp, gold: prof.gold });
  const after = RULES.levelFromXp(prof.xp);
  if (after > before) {
    // Al subir de nivel la ficha se vuelve a validar (más trucos y conjuros posibles); lo que falte se rellena
    prof.sheet = RULES.refresh(prof.sheet, prof.xp);
    store.setPlayer(user.pid, prof);
    broadcast(room, { t: 'sheet', id: user.id, sheet: prof.sheet });
    system(room, `⭐ ${user.name} sube a nivel ${after}.`);
    if (user.where) {
      const inst = room.instances.get(user.where.id);
      if (inst) inst.refreshStats(user, prof);
    }
  }
}

// ---------- Mazmorras y mundo abierto ----------
function dungeonSummary(d, pid) {
  const enemies = d.objects.filter((o) => DUNGEON.enemyKey(o.k)).length;
  return { id: d.id, name: d.name, author: d.author, mine: d.authorId === pid, enemies, updated: d.updated };
}

// El mundo de cada sala se genera una vez (con sus cuevas apuntando a las mazmorras que existan)
function worldDef(room) {
  if (!room.world) {
    const list = Object.values(store.dungeons()).sort((a, b) => (a.id === 'cripta' ? -1 : b.id === 'cripta' ? 1 : b.updated - a.updated));
    const def = WORLD.generate(room.name, list.map((d) => d.id));
    for (const c of def.caves) { const d = store.dungeon(c.dungeon); def.labels.push({ x: c.x, y: c.y - 2, text: `Cueva: ${d ? d.name : '?'}` }); }
    room.world = def;
  }
  return room.world;
}

function getInstance(room, def) {
  let inst = room.instances.get(def.id);
  if (!inst) {
    inst = new Instance(def, {
      send: (u, msg) => send(u.ws, msg),
      reward: (u, xp, gold) => reward(room, u, xp, gold),
      exit: (u, reason, r) => leaveInstance(room, u, reason, r),
      portal: (u, dungeonId, back) => enterDungeon(room, u, dungeonId, { from: 'world', back }),
    });
    room.instances.set(def.id, inst);
  }
  return inst;
}

function detach(room, user) {
  const inst = user.where && room.instances.get(user.where.id);
  if (inst) {
    inst.leave(user.id);
    inst.flush([user]);
    if (!inst.size) room.instances.delete(user.where.id);
  }
}

function enterDungeon(room, user, id, via = {}) {
  const d = store.dungeon(String(id));
  if (!d) { send(user.ws, { t: 'error', text: 'Esa mazmorra ya no existe.' }); return backToWorldOrTavern(room, user, via); }
  if (user.where && user.where.id !== d.id) detach(room, user);
  user.where = { id: d.id, name: d.name, from: via.from || null, back: via.back || null };
  getInstance(room, d).join(user, user.profile);
  broadcast(room, { t: 'where', id: user.id, where: d.name });
  system(room, `⚔️ ${user.name} baja a «${d.name}».`);
}

function enterWorld(room, user, at) {
  const def = worldDef(room);
  if (user.where && user.where.id !== 'world') detach(room, user);
  user.where = { id: 'world', name: def.name };
  getInstance(room, def).join(user, user.profile, at || def.start);
  broadcast(room, { t: 'where', id: user.id, where: def.name });
}

function backToWorldOrTavern(room, user, via) {
  if (via && via.from === 'world') return enterWorld(room, user, via.back);
  return toTavern(room, user, 'leave');
}

// Sale de una partida. Desde una mazmorra a la que se llegó por una cueva se vuelve al mundo (salvo si cae).
function leaveInstance(room, user, reason, r) {
  if (!user.where) return;
  const where = user.where;
  detach(room, user);
  if (reason === 'win') system(room, `🏆 ${user.name} completa «${where.name}»: +${r.xp} de experiencia y +${r.gold} de oro.`);
  if (reason !== 'down' && reason !== 'town' && where.from === 'world') {
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
  user.combat = null; // descanso largo: vida, espacios de conjuro y rasgos se recuperan
  const pos = freeSpawn(room, user);
  user.x = pos.x; user.y = pos.y;
  let lost = 0;
  if (reason === 'down') {
    lost = Math.floor(user.profile.gold * DUNGEON.REWARDS.deathGoldLoss);
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
  for (const room of rooms.values()) for (const inst of room.instances.values()) inst.tick(now);
}, 100);

// ---------- Conexiones ----------
const EMOTES = new Set(['wave', 'dance', 'cheers', 'laugh', 'heart', 'fight', 'think', 'sleep']);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16384 });

wss.on('connection', (ws) => {
  let user = null;
  let room = null;
  let tokens = 8; // limitador de mensajes (cubo de fichas)
  let lastRefill = Date.now();
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

  const isOwner = () => room.ownerId === user.pid;

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
      ensureSheet(profile, look, name);
      store.setPlayer(pid, profile);
      // Quien entra primero en una sala nueva es su dueño y puede editar los muebles
      if (!room.ownerId) { room.ownerId = pid; saveRoom(room); }
      const pos = freeSpawn(room);
      user = { id: crypto.randomBytes(6).toString('hex'), pid, name, look: lookFromSheet(profile.sheet), profile, x: pos.x, y: pos.y, where: null, ws };
      room.users.set(user.id, user);
      send(ws, {
        t: 'welcome', id: user.id, room: roomName, owner: isOwner(),
        items: room.map.items,
        users: [...room.users.values()].map(publicUser),
        history: room.history,
      });
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

      // ----- Ficha de personaje -----
      case 'sheet:save': {
        if (!allow(1)) return;
        if (user.where) return send(ws, { t: 'sheet:saved', ok: false, errors: ['Vuelve a la taberna para cambiar tu ficha.'] });
        const v = RULES.validate(msg.sheet, user.profile.xp);
        if (!v.ok) return send(ws, { t: 'sheet:saved', ok: false, errors: v.errors });
        user.profile.sheet = v.sheet;
        store.setPlayer(user.pid, user.profile);
        user.look = lookFromSheet(v.sheet);
        send(ws, { t: 'sheet:saved', ok: true });
        broadcast(room, { t: 'sheet', id: user.id, sheet: v.sheet, look: user.look });
        const d = RULES.derive(v.sheet, user.profile.xp);
        system(room, `📜 ${user.name} es ahora ${d.className.toLowerCase()} ${d.speciesShort.toLowerCase()} de nivel ${d.level}.`);
        break;
      }

      // ----- Editor de la taberna (sólo el dueño de la sala) -----
      case 'tedit': {
        if (!isOwner()) return send(ws, { t: 'error', text: 'Sólo el dueño de la taberna puede mover los muebles.' });
        if (!allow(0.25)) return;
        const items = room.map.items.map((it) => ({ ...it }));
        const at = (x, y) => items.findIndex((it) => it.x === x && it.y === y);
        if (msg.op === 'place') {
          const f = MAP.FURNITURE[msg.type];
          if (!f || !MAP.inBounds(msg.x, msg.y)) return;
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
        // Quien se haya quedado encima de un mueble nuevo se aparta
        for (const u of room.users.values()) {
          if (!u.where && !room.map.isStandable(u.x, u.y)) {
            const pos = freeSpawn(room, u);
            u.x = pos.x; u.y = pos.y;
            broadcast(room, { t: 'move', id: u.id, x: u.x, y: u.y, snap: true });
          }
        }
        break;
      }

      // ----- Mazmorras -----
      case 'dlist': {
        const list = Object.values(store.dungeons()).map((d) => dungeonSummary(d, user.pid)).sort((a, b) => b.updated - a.updated);
        send(ws, { t: 'dlist', list });
        break;
      }
      case 'dget': {
        const d = store.dungeon(String(msg.id));
        if (!d) return send(ws, { t: 'error', text: 'Esa mazmorra ya no existe.' });
        send(ws, { t: 'dget', dungeon: { id: d.id, name: d.name, tiles: d.tiles, objects: d.objects, mine: d.authorId === user.pid } });
        break;
      }
      case 'dsave': {
        if (!allow(2)) return;
        const v = DUNGEON.validate(msg.dungeon);
        if (!v.ok) return send(ws, { t: 'dsaved', ok: false, error: v.error });
        let id = typeof msg.dungeon.id === 'string' ? msg.dungeon.id : null;
        const existing = id && store.dungeon(id);
        if (!existing || existing.authorId !== user.pid) {
          // Mazmorra nueva (o copia de una ajena)
          const mine = Object.values(store.dungeons()).filter((d) => d.authorId === user.pid).length;
          if (mine >= MAX_DUNGEONS_PER_PLAYER) return send(ws, { t: 'dsaved', ok: false, error: `Ya tienes ${MAX_DUNGEONS_PER_PLAYER} mazmorras. Borra alguna antes.` });
          id = crypto.randomBytes(5).toString('hex');
        }
        store.setDungeon(id, { id, ...v.dungeon, author: user.name, authorId: user.pid, updated: Date.now() });
        send(ws, { t: 'dsaved', ok: true, id });
        system(room, `🗺️ ${user.name} ha guardado la mazmorra «${v.dungeon.name}».`);
        break;
      }
      case 'ddelete': {
        const d = store.dungeon(String(msg.id));
        if (!d || d.authorId !== user.pid) return send(ws, { t: 'error', text: 'Sólo puedes borrar tus propias mazmorras.' });
        store.deleteDungeon(d.id);
        send(ws, { t: 'dlist', list: Object.values(store.dungeons()).map((x) => dungeonSummary(x, user.pid)).sort((a, b) => b.updated - a.updated) });
        break;
      }
      case 'denter': {
        if (user.where) return;
        enterDungeon(room, user, msg.id);
        break;
      }
      case 'wenter': {
        if (user.where) return;
        enterWorld(room, user);
        system(room, `🗺️ ${user.name} sale de la taberna a «${room.world.name}».`);
        break;
      }
      case 'dact': {
        if (!user.where) return;
        const inst = room.instances.get(user.where.id);
        if (inst) inst.action(user.id, msg);
        break;
      }
      case 'dmove': {
        if (!user.where) return;
        const inst = room.instances.get(user.where.id);
        if (inst) inst.move(user.id, msg.dx, msg.dy);
        break;
      }
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
      store.setPlayer(user.pid, user.profile);
      broadcast(room, { t: 'rename', id: user.id, name: user.name });
      return system(room, `${old} ahora se llama ${user.name}.`);
    }
    send(ws, { t: 'system', text: 'Comandos: /dado [6|20…], /d20, /me acción, /nombre NUEVO', ts: Date.now() });
  }

  ws.on('close', () => {
    clearTimeout(joinTimer);
    if (!user) return;
    if (user.where) {
      const inst = room.instances.get(user.where.id);
      if (inst) { inst.leave(user.id); if (!inst.size) room.instances.delete(user.where.id); }
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
