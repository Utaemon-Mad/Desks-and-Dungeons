// Servidor de la taberna: sirve los ficheros del cliente y reparte los mensajes por WebSocket.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const MAP = require('./public/map.js');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_USERS_PER_ROOM = 30;
const HISTORY_SIZE = 60;
const MAX_TEXT = 200;
const START_GOLD = 50;
const ROUND_PRICE = 5;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
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
const rooms = new Map(); // nombre -> { users: Map<id, user>, history: [] }

function getRoom(name) {
  if (!rooms.has(name)) rooms.set(name, { users: new Map(), history: [] });
  return rooms.get(name);
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
  return { id: u.id, name: u.name, look: u.look, gold: u.gold, x: u.x, y: u.y };
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

function cleanLook(look) {
  look = look || {};
  const cls = Object.prototype.hasOwnProperty.call(MAP.CLASSES, look.cls) ? look.cls : 'guerrero';
  const idx = (v, n) => (Number.isInteger(v) && v >= 0 && v < n ? v : 0);
  return { cls, skin: idx(look.skin, MAP.SKINS.length), hair: idx(look.hair, MAP.HAIRS.length) };
}

function freeSpawn(room) {
  const taken = new Set([...room.users.values()].map((u) => u.x + ',' + u.y));
  const candidates = [];
  for (let r = 0; r < 4; r++) {
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
      const x = MAP.spawn.x + dx, y = MAP.spawn.y + dy;
      if (MAP.isPassable(x, y) && !taken.has(x + ',' + y)) candidates.push({ x, y });
    }
    if (candidates.length) return candidates[Math.floor(Math.random() * candidates.length)];
  }
  return { ...MAP.spawn };
}

const EMOTES = new Set(['wave', 'dance', 'cheers', 'laugh', 'heart', 'fight', 'think', 'sleep']);

// ---------- Conexiones ----------
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });

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
      const pos = freeSpawn(room);
      user = {
        id: crypto.randomBytes(6).toString('hex'),
        name: cleanText(msg.name, 16) || 'Aventurero',
        look: cleanLook(msg.look),
        gold: START_GOLD,
        x: pos.x, y: pos.y,
        ws,
      };
      room.users.set(user.id, user);
      send(ws, {
        t: 'welcome', id: user.id, room: roomName,
        users: [...room.users.values()].map(publicUser),
        history: room.history,
      });
      broadcast(room, { t: 'join', user: publicUser(user) }, user.id);
      system(room, `${user.name} entra en la taberna.`);
      return;
    }

    switch (msg.t) {
      case 'move': {
        const { x, y } = msg;
        if (!MAP.isStandable(x, y)) return;
        if (MAP.isSeat(x, y)) {
          for (const o of room.users.values()) if (o !== user && o.x === x && o.y === y) return; // asiento ocupado
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
        user.gold += 1;
        say(room, { t: 'chat', id: user.id, name: user.name, cls: user.look.cls, text });
        broadcast(room, { t: 'gold', id: user.id, gold: user.gold });
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
        if (!allow()) return;
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
        if (user.gold < ROUND_PRICE) return send(ws, { t: 'system', text: `Necesitas ${ROUND_PRICE} monedas de oro para invitar.`, ts: Date.now() });
        user.gold -= ROUND_PRICE;
        broadcast(room, { t: 'gold', id: user.id, gold: user.gold });
        broadcast(room, { t: 'drink', id: target.id });
        system(room, `${user.name} invita a una ronda a ${target.name}. 🍻`);
        break;
      }
    }
  });

  function roll(sides) {
    const allowed = [4, 6, 8, 10, 12, 20, 100];
    if (!allowed.includes(sides)) sides = 20;
    const value = crypto.randomInt(1, sides + 1);
    let bonus = '';
    if (sides === 20 && value === 20) { user.gold += 20; bonus = ' ¡CRÍTICO! +20 de oro'; broadcast(room, { t: 'gold', id: user.id, gold: user.gold }); }
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
    if (c === 'muro' && arg) {
      say(room, { t: 'wall', id: user.id, name: user.name, text: arg.slice(0, 40) });
      return;
    }
    if (c === 'me' && arg) return say(room, { t: 'action', id: user.id, name: user.name, text: `${user.name} ${arg}` });
    if (c === 'nombre' && arg) {
      const old = user.name;
      user.name = cleanText(arg, 16) || old;
      broadcast(room, { t: 'rename', id: user.id, name: user.name });
      return system(room, `${old} ahora se llama ${user.name}.`);
    }
    send(ws, { t: 'system', text: 'Comandos: /dado [6|20…], /d20, /muro TEXTO, /me acción, /nombre NUEVO', ts: Date.now() });
  }

  ws.on('close', () => {
    clearTimeout(joinTimer);
    if (!user) return;
    room.users.delete(user.id);
    broadcast(room, { t: 'leave', id: user.id });
    system(room, `${user.name} sale de la taberna.`);
    if (room.users.size === 0) {
      // Conservamos el historial un rato por si alguien vuelve enseguida
      const r = room;
      setTimeout(() => { if (r.users.size === 0) for (const [k, v] of rooms) if (v === r) rooms.delete(k); }, 10 * 60 * 1000);
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

server.listen(PORT, () => console.log(`🍺 La taberna está abierta en http://localhost:${PORT}`));

module.exports = server;
