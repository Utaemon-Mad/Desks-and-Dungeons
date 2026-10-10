// Servidor de la taberna: sirve los ficheros del cliente y reparte los mensajes por WebSocket.
// Lleva los perfiles (personaje, puntos, equipo, inventario, consumibles, bufos), las tiendas, el comercio
// entre jugadores, el editor de la taberna y las partidas (mazmorras aleatorias y mundo abierto).
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
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


const server = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    res.writeHead(400); return res.end();
  }
  if (urlPath === '/healthz') { res.writeHead(200); return res.end('ok'); }
  if (urlPath === '/admin') return adminPage(req, res);
  if (urlPath === '/') urlPath = '/index.html';
  if (urlPath === '/portada') urlPath = '/portada.html';
  if (urlPath === '/guia') urlPath = '/guia.pdf';
  const file = path.normalize(path.join(PUBLIC_DIR, urlPath));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403); return res.end(); }
  sendStatic(req, res, file);
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
      motd: (saved && saved.motd) || '',
      fund: (saved && saved.fund) || { gold: 0, donors: {} },
      banned: new Map(), // pid -> hasta cuándo no puede entrar
      muted: new Map(),  // pid -> hasta cuándo no puede hablar
      instances: new Map(),
    });
  }
  return rooms.get(name);
}

function saveRoom(room) {
  store.setRoom(room.name, { ownerId: room.ownerId, motd: room.motd || undefined, fund: room.fund && room.fund.gold ? room.fund : undefined, items: room.map.items.map(({ type, x, y, dir }) => (dir ? { type, x, y, dir } : { type, x, y })) });
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

// ---------- Cuentas y perfiles ----------
// Una cuenta por navegador (su token): hasta 3 personajes y cuál se usó la última vez y en qué servidor.
// { slots: [perfil | null ×3], last: { slot, server } }
// Perfil (un personaje): { name, xp, gold, char: { cls, alloc, look }, equip: { slot: item }, bag: [item], cons: { id: n },
//   buffs: { id: hasta }, …, resume: dónde estaba al salir { server, at: 'tavern'|'world'|'dungeon', x, y, inst, from, back, place } }
const SLOT_COUNT = 3;
const tokenPid = (t) => (typeof t === 'string' && /^[a-zA-Z0-9_-]{16,64}$/.test(t) ? store.hash(t) : null);
const slotOf = (v) => (Number.isInteger(v) && v >= 0 && v < SLOT_COUNT ? v : null);
const charId = (pid, slot) => (slot ? `${pid}:${slot}` : pid);
const serverId = (s) => { const id = cleanRoomName(s); return MAP.SERVERS.some((x) => x.id === id) ? id : MAP.SERVERS[0].id; };

function account(pid) {
  let a = store.player(pid);
  if (a && !Array.isArray(a.slots)) {
    // perfil de la versión anterior (un solo personaje por navegador): pasa a la primera casilla
    a = { slots: [a.char ? a : null], last: a.char ? { slot: 0, server: null } : null };
    store.setPlayer(pid, a);
  }
  if (!a) a = { slots: [], last: null };
  while (a.slots.length < SLOT_COUNT) a.slots.push(null);
  return a;
}

function slotInfo(p) {
  if (!p || !p.char || !RULES.CLASSES[p.char.cls]) return null;
  const r = p.resume || {};
  return { name: p.name || 'Aventurero', cls: p.char.cls, level: RULES.levelFromXp(p.xp || 0), title: p.title || null, look: lookFrom(p), server: r.server || null, at: r.at || 'tavern', place: r.place || null };
}

// Servidores con su nombre actual (el dueño puede cambiarlo; se guarda en meta 'servers'), su gente y su dueño
const serverName = (id) => (store.meta('servers') || {})[id] || (MAP.SERVERS.find((x) => x.id === id) || {}).name || id;
function serverOwner(id) {
  if (rooms.has(id)) return rooms.get(id).ownerId;
  const saved = store.room(id);
  return saved ? saved.ownerId : null;
}
function serversView(pid) {
  return MAP.SERVERS.map((sv) => {
    const owner = serverOwner(sv.id);
    return { id: sv.id, name: serverName(sv.id), online: rooms.has(sv.id) ? rooms.get(sv.id).users.size : 0, mine: !!pid && owner === pid, canEdit: !!pid && (!owner || owner === pid) };
  });
}

function accountInfo(a, pid, extra) {
  return { t: 'account', login: a.login ? a.login.user : null, slots: a.slots.map(slotInfo), last: a.last && a.slots[a.last.slot] ? a.last : null, servers: serversView(pid), backup: makeBackup(pid), ...extra };
}

// Copia de seguridad firmada de la cuenta, que guarda el navegador del jugador. Si el servidor se reinicia y pierde
// los datos (Render gratis no guarda el disco), el navegador la devuelve al entrar y se restaura. La firma (HMAC)
// impide editarla. Para más seguridad, define SAVE_SECRET en el servidor.

// Cambia el nombre de un servidor: sólo su dueño (si aún no tiene, quien lo renombra pasa a serlo)
function renameServer(pid, id, name) {
  if (!MAP.SERVERS.some((x) => x.id === id)) return 'Ese servidor no existe.';
  name = cleanText(name, MAP.SERVER_NAME_MAX);
  if (!name) return 'Escribe un nombre.';
  const owner = serverOwner(id);
  if (owner && owner !== pid) return 'Sólo el dueño del servidor puede cambiarle el nombre.';
  const existed = rooms.has(id);
  const room = getRoom(id);
  if (!room.ownerId) { room.ownerId = pid; saveRoom(room); }
  const names = { ...(store.meta('servers') || {}), [id]: name };
  store.setMeta('servers', names);
  broadcast(room, { t: 'server-name', id, name });
  if (!existed) rooms.delete(id); // sólo se abrió para guardar el dueño
  return null;
}

function onlineChar(cid) {
  for (const r of rooms.values()) for (const u of r.users.values()) if (u.cid === cid) return { u, r };
  return null;
}

function lookFrom(profile) {
  const l = profile.char.look || {};
  return { ...MAP.cleanLook({ cls: profile.char.cls, species: l.species, sex: l.sex, hs: l.hs, skin: l.skin, hair: l.hair, gob: l.gob }), gear: RULES.gearLook(profile.equip), aura: PROG.AURAS[profile.aura] ? profile.aura : undefined };
}
const charLook = (look) => { const c = { species: look.species, sex: look.sex, hs: look.hs, skin: look.skin, hair: look.hair }; if (look.gob) c.gob = { ...look.gob }; return c; };

function derive(profile) { return RULES.derive(profile); }

// Prepara un perfil (nuevo, de una versión anterior o con otra clase elegida al entrar; sin look se queda como está)
function setupProfile(profile, look) {
  const level = RULES.levelFromXp(profile.xp || 0);
  RULES.migrateProfile(profile); // perfiles de reglas anteriores: clase, raza, puntos y objetos
  if (!profile.char || !RULES.CLASSES[profile.char.cls]) {
    look = look || MAP.cleanLook({});
    profile.char = RULES.newChar(look.cls, charLook(look));
    profile.rv = RULES.RULES_VERSION;
    profile.equip = {}; profile.bag = []; profile.cons = { 'pocion-vida-p': 3 }; profile.buffs = {};
    for (const it of RULES.starterItems(profile.char.cls, rnd)) profile.equip[it.slot] = it;
    delete profile.sheet;
  }
  profile.equip = profile.equip || {}; profile.bag = Array.isArray(profile.bag) ? profile.bag : [];
  if (look) changeChar(profile, look);
  profile.char = RULES.cleanChar(profile.char, level);
  profile.char.look = charLook(MAP.cleanLook({ ...profile.char.look, cls: profile.char.cls }));
  profile.cons = profile.cons || {}; profile.buffs = profile.buffs || {};
  profile.quests = profile.quests || {}; profile.questsDone = profile.questsDone || [];
  profile.waystones = profile.waystones || ['brumaverde'];
  profile.mats = profile.mats || {}; profile.stats = profile.stats || {}; profile.achievements = profile.achievements || [];
  profile.trophies = profile.trophies || [];
  if (profile.title && !PROG.ACHIEVEMENTS.some((a) => a.title === profile.title && profile.achievements.includes(a.id)) && !(profile.extraTitles || []).includes(profile.title)) profile.title = null;
  if (profile.pet && !RULES.PETS[profile.pet.type]) profile.pet = null;
  if (profile.pet) { profile.pet.bag = Array.isArray(profile.pet.bag) ? profile.pet.bag : []; profile.pet.xp = profile.pet.xp || 0; }
  if (profile.mount && !RULES.MOUNTS[profile.mount]) profile.mount = null;
  for (const [id, until] of Object.entries(profile.buffs)) if (until <= Date.now()) delete profile.buffs[id];
}

// Cambio de clase o de raza: los puntos se devuelven (las características base cambian) y se da el equipo inicial
// que falte de la clase nueva. El sexo, el peinado y los colores se cambian sin más.
function changeChar(profile, look) {
  const c = profile.char;
  const cls = RULES.classId(look.cls) || c.cls;
  const race = RULES.raceId(look.species);
  const changed = { cls: cls !== c.cls, race: race !== RULES.raceId(c.look && c.look.species) };
  c.look = charLook({ ...look, species: race });
  if (changed.cls || changed.race) c.alloc = Object.fromEntries(RULES.STAT_IDS.map((k) => [k, 0]));
  if (changed.cls) {
    c.cls = cls;
    for (const it of RULES.starterItems(cls, rnd)) if (!profile.equip[it.slot]) profile.equip[it.slot] = it;
  }
  return changed;
}

// Características que tendría sin lo que lleva en un hueco (para comprobar requisitos al cambiar un objeto)
function statsWithout(profile, slot) {
  return RULES.derive({ ...profile, equip: { ...profile.equip, [slot]: undefined } }).stats;
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

function saveUser(user) { store.setPlayer(user.pid, user.account); }

// Dónde está el jugador al salir, para continuar ahí la próxima vez (la arena no cuenta: se vuelve a la taberna)
function rememberPlace(room, user) {
  const i = user.where && room.instances.get(user.where.id);
  const pl = i && i.players.get(user.id);
  let r = { server: room.name, at: 'tavern', x: user.x, y: user.y };
  if (pl && i.kind === 'world') r = { server: room.name, at: 'world', x: pl.x, y: pl.y, place: i.def.name };
  else if (pl && i.kind === 'dungeon') r = { server: room.name, at: 'dungeon', inst: i.id, x: pl.x, y: pl.y, from: user.where.from || null, back: user.where.back || null, place: i.def.name };
  user.profile.resume = r;
  saveUser(user);
}

// Al entrar, vuelve a dejar al jugador donde estaba (si fue en este servidor y el sitio sigue existiendo)
function resumePlace(room, user) {
  const r = user.profile.resume;
  if (!r || r.server !== room.name) return;
  if (r.at === 'world') return enterWorld(room, user, { x: r.x, y: r.y });
  if (r.at !== 'dungeon') return;
  const i = room.instances.get(r.inst);
  if (i && i.kind === 'dungeon' && !i.bossDead) {
    joinInstance(room, user, i, { from: r.from, back: r.back, at: { x: r.x, y: r.y } });
    system(room, `⚔️ ${user.name} vuelve a «${i.def.name}».`);
  } else if (r.from === 'world') {
    enterWorld(room, user, r.back); // la cueva ya se cerró: a su entrada en el mundo
  }
}

// El jugador recibe su perfil completo; los demás, lo que se ve
function sendMe(user) {
  const p = user.profile;
  ensureBoard(p);
  send(user.ws, { t: 'me', char: p.char, equip: p.equip, bag: p.bag, cons: p.cons, buffs: p.buffs, xp: p.xp, gold: p.gold, quests: p.quests, questsDone: p.questsDone, waystones: p.waystones, pet: p.pet || null, mount: p.mount || null, mats: p.mats, stats: p.stats, achievements: p.achievements, title: p.title || null, extraTitles: p.extraTitles || [], aura: p.aura || null, board: p.board, trophies: p.trophies, tutDone: !!p.tutDone });
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
  // mejoras de la taberna: más experiencia y oro para todos los del servidor
  const TB = PROG.tavernBonus(room.fund);
  if (xp > 0 && TB.xp) xp = Math.round(xp * (1 + TB.xp / 100));
  if (gold > 0 && TB.gold) gold = Math.round(gold * (1 + TB.gold / 100));
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
  if (item.rarity === 'unico') track(room, user, 'legend', {});
  saveUser(user); sendMe(user);
  if (item.leg) { system(room, `🟠★ ¡${user.name} encuentra un LEGENDARIO: «${item.name}» (${RULES.LEGENDARY[item.leg].icon} ${RULES.LEGENDARY[item.leg].name})!`); feat(room, `🟠 ${user.name} encontró el legendario «${item.name}».`); }
  else if (item.rarity === 'unico' || item.rarity === 'conjunto') system(room, `${item.rarity === 'conjunto' ? '🟢' : '🟡'} ${user.name} encuentra «${item.name}».`);
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
      derive: (u) => { const d = derive(u.profile); d.mf += PROG.tavernBonus(room.fund).mf; return d; },
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
      raidDone: (inst) => raidDone(room, inst),
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
  const st = RULES.petStats(pet.type, levelOf(user), RULES.petLevelFromXp(pet.xp));
  const pw = derive(user.profile).petPow; // el Carisma hace más fuerte a la mascota
  st.dmg = st.dmg.map((v) => Math.max(1, Math.round(v * pw)));
  st.hp = Math.round(st.hp * (1 + (pw - 1) / 2));
  return { type: pet.type, name: pet.name || RULES.PETS[pet.type].name, st };
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




setInterval(() => {
  for (const room of rooms.values()) for (const u of room.users.values()) if (u.meDirty) { u.meDirty = false; saveUser(u); sendMe(u); }
}, 2500);


// ---------- Conexiones ----------
const EMOTES = new Set(['wave', 'dance', 'cheers', 'laugh', 'heart', 'fight', 'think', 'sleep']);
// Módulos de la segunda división: progreso, modos de juego, tiendas y comercio, y los mensajes por temas
const CTX2 = {};
for (const [k, get] of Object.entries({ GEN: () => GEN, MAP: () => MAP, PROG: () => PROG, RULES: () => RULES, SHOP_REFRESH_MS: () => SHOP_REFRESH_MS, adminPage: () => adminPage, broadcast: () => broadcast, caughtFish: () => caughtFish, changeChar: () => changeChar, claimLogin: () => claimLogin, cleanText: () => cleanText, crypto: () => crypto, derive: () => derive, detach: () => detach, donate: () => donate, duelEnd: () => duelEnd, endTrade: () => endTrade, ensureBoard: () => ensureBoard, feat: () => feat, getInstance: () => getInstance, give: () => give, giveMats: () => giveMats, gotHerb: () => gotHerb, indexLogin: () => indexLogin, joinInstance: () => joinInstance, levelOf: () => levelOf, logClientError: () => logClientError, makeBackup: () => makeBackup, marketList: () => marketList, marketView: () => marketView, matsText: () => matsText, nextFloor: () => nextFloor, offerLogin: () => offerLogin, onKill: () => onKill, openToken: () => openToken, payOffline: () => payOffline, petXp: () => petXp, profileChanged: () => profileChanged, questState: () => questState, raidDone: () => raidDone, raidInfo: () => raidInfo, ranksView: () => ranksView, restoreBackup: () => restoreBackup, reward: () => reward, rnd: () => rnd, roomInfo: () => roomInfo, saveUser: () => saveUser, sealToken: () => sealToken, seasonAdd: () => seasonAdd, seasonPrize: () => seasonPrize, seasonView: () => seasonView, send: () => send, sendMe: () => sendMe, sendStatic: () => sendStatic, sendTrade: () => sendTrade, shopFor: () => shopFor, startDescent: () => startDescent, startDuel: () => startDuel, startRaid: () => startRaid, statsWithout: () => statsWithout, store: () => store, system: () => system, takeMats: () => takeMats, tavernView: () => tavernView, toTavern: () => toTavern, track: () => track, trades: () => trades, worldBossDown: () => worldBossDown })) Object.defineProperty(CTX2, k, { get, enumerable: true });
const { caughtFish, ensureBoard, giveMats, gotHerb, matsText, onKill, petXp, ranksView, takeMats, track, worldBossDown } = require('./server/progress.js')(CTX2);
const { duelEnd, nextFloor, roomInfo, startDescent, startDuel } = require('./server/modes.js')(CTX2);
const { endTrade, sendTrade, shopFor, trades } = require('./server/trade.js')(CTX2);

// ---------- Módulos del servidor (server/*.js): reciben lo que necesitan y devuelven sus funciones ----------
const CTX = {
  GEN, PROG, RULES, broadcast, cleanText, crypto, fs, getInstance, give, giveMats, http, joinInstance, levelOf,
  lookFrom, path, reward, rnd, rooms, saveRoom, saveUser, send, sendMe, serverName, store, system, zlib
};
const { adminPage, logClientError, sendStatic } = require('./server/web.js')(CTX);
const { USER_RE, cleanUser, indexLogin, loginFails, makeBackup, openToken, passHash, restoreBackup, sealToken } = require('./server/accounts.js')(CTX);
const {
  claimLogin, donate, feat, marketList, marketView, offerLogin, payOffline,
  raidDone, raidInfo, seasonAdd, seasonPrize, seasonView, startRaid, tavernView,
} = require('./server/social.js')(CTX);

const HANDLERS = Object.assign({}, require('./server/handlers/char.js')(CTX2), require('./server/handlers/craft.js')(CTX2), require('./server/handlers/play.js')(CTX2));

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 262144 }); // cabe la copia de seguridad de la cuenta

wss.on('connection', (ws) => {
  let user = null;
  let room = null;
  let tokens = 8; // limitador de mensajes (cubo de fichas)
  let lastRefill = Date.now();
  let gameTokens = 40; // órdenes de partida (más frecuentes)
  let gameRefill = Date.now();
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  // en partida, cada medio minuto se manda la copia de seguridad de la cuenta si ha cambiado
  let lastBackup = '';
  const backupTimer = setInterval(() => {
    if (!user || ws.readyState !== 1) return;
    const b = makeBackup(user.pid);
    if (b && b.d !== lastBackup) { lastBackup = b.d; send(ws, { t: 'backup', backup: b }); }
  }, 30000);

  // Sin entrar se cierra la conexión; en la pantalla de inicio (hello) hay más margen
  let joinTimer = setTimeout(() => { if (!user) ws.close(4000, 'join timeout'); }, 15000);

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
  let errCount = 0;
  const nearShopNpc = () => {
    const i = inst();
    const p = i && i.players.get(user.id);
    return !!(p && i.npcs.some((n) => n.shop && Math.max(Math.abs(n.x - p.x), Math.abs(n.y - p.y)) <= 3));
  };
  // lo que necesitan los manejadores de server/handlers (user y room cambian al entrar en la sala)
  const CONN = { ws, err, allow, allowGame, isOwner, inst, nearShopNpc, roll: (s) => roll(s), command: (t) => command(t), get user() { return user; }, get room() { return room; } };

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg.t !== 'string') return;
    if (msg.t === 'clienterr') { errCount = (errCount || 0) + 1; if (errCount <= 10) logClientError(user, msg); return; }

    if (!user) {
      // Pantalla de inicio: ver, crear y borrar personajes de la cuenta antes de entrar
      if (msg.t === 'hello' || msg.t === 'char:new' || msg.t === 'char:del' || msg.t === 'server:rename' || msg.t === 'acct:register' || msg.t === 'acct:login') {
        if (!allow(1)) return;
        clearTimeout(joinTimer);
        joinTimer = setTimeout(() => { if (!user) ws.close(4000, 'join timeout'); }, 10 * 60 * 1000);
        const pid = tokenPid(msg.token);
        if (!pid) return;
        if (msg.t === 'hello') restoreBackup(pid, msg.backup);
        if (msg.t === 'acct:login') {
          const u = cleanUser(msg.user), pass = String(msg.pass || '').slice(0, 100);
          const f = loginFails.get(u);
          if (f && f.until > Date.now()) return err('Demasiados intentos fallidos. Espera unos minutos.');
          const lp = (store.meta('logins') || {})[u], la = lp && store.player(lp);
          const ok = la && la.login && la.login.user === u && crypto.timingSafeEqual(Buffer.from(passHash(pass, la.login.salt), 'hex'), Buffer.from(la.login.hash, 'hex'));
          if (!ok) {
            const n = ((f && f.n) || 0) + 1;
            loginFails.set(u, { n, until: n >= 5 ? Date.now() + 5 * 60000 : 0 });
            return err('Usuario o contraseña incorrectos.');
          }
          loginFails.delete(u);
          const tok = openToken(la.login.tok);
          if (!tok) return err('No se pudo abrir la cuenta. Avisa al dueño del juego.');
          return send(ws, accountInfo(la, lp, { token: tok }));
        }
        const a = account(pid);
        const slot = slotOf(msg.slot);
        if (msg.t === 'acct:register') {
          const u = cleanUser(msg.user), pass = String(msg.pass || '');
          if (!USER_RE.test(u)) return err('El usuario debe tener de 3 a 20 letras o números, sin espacios.');
          if (pass.length < 6 || pass.length > 100) return err('La contraseña debe tener al menos 6 caracteres.');
          const ix = store.meta('logins') || {};
          if (ix[u] && ix[u] !== pid) return err('Ese usuario ya existe. Elige otro.');
          if (a.login && a.login.user !== u && ix[a.login.user] === pid) { delete ix[a.login.user]; store.setMeta('logins', ix); }
          const salt = crypto.randomBytes(16).toString('hex');
          a.login = { user: u, salt, hash: passHash(pass, salt), tok: sealToken(msg.token) };
          store.setPlayer(pid, a);
          indexLogin(u, pid);
          return send(ws, accountInfo(a, pid, { registered: u }));
        }
        if (msg.t === 'char:new') {
          if (slot === null || a.slots[slot]) return err('Esa casilla ya tiene un personaje.');
          const name = cleanText(msg.name, 16);
          if (!name) return err('Ponle un nombre a tu héroe.');
          const p = { xp: 0, gold: START_GOLD, name };
          setupProfile(p, MAP.cleanLook(msg.look));
          // el editor ya reparte los puntos iniciales (con el tope natural de 20)
          if (msg.alloc && typeof msg.alloc === 'object') p.char.alloc = RULES.cleanChar({ ...p.char, alloc: msg.alloc }, 1).alloc;
          a.slots[slot] = p;
          store.setPlayer(pid, a);
          return send(ws, accountInfo(a, pid, { created: slot }));
        }
        if (msg.t === 'server:rename') {
          const why = renameServer(pid, String(msg.id || ''), msg.name);
          if (why) return err(why);
        }
        if (msg.t === 'char:del' && slot !== null && a.slots[slot]) {
          if (onlineChar(charId(pid, slot))) return err('Ese personaje está jugando ahora mismo.');
          a.slots[slot] = null;
          if (a.last && a.last.slot === slot) a.last = null;
          store.setPlayer(pid, a);
        }
        return send(ws, accountInfo(a, pid));
      }
      if (msg.t !== 'join') return;
      const roomName = serverId(msg.room);
      room = getRoom(roomName);
      if (room.users.size >= MAX_USERS_PER_ROOM) {
        send(ws, { t: 'error', text: 'Este servidor está lleno. Prueba otro.' });
        return ws.close();
      }
      const token = typeof msg.token === 'string' && /^[a-zA-Z0-9_-]{16,64}$/.test(msg.token) ? msg.token : crypto.randomBytes(16).toString('hex');
      const pid = store.hash(token);
      restoreBackup(pid, msg.backup);
      const acc = account(pid);
      let slot = slotOf(msg.slot);
      // Sin casilla (clientes antiguos): el último personaje usado, o uno nuevo en la primera casilla
      const legacy = slot === null;
      if (legacy) slot = acc.last && acc.slots[acc.last.slot] ? acc.last.slot : 0;
      let profile = acc.slots[slot];
      if (!profile) {
        if (!legacy) return err('Esa casilla está vacía.');
        profile = acc.slots[slot] = { xp: 0, gold: START_GOLD };
      }
      clearTimeout(joinTimer);
      if (legacy && msg.name) profile.name = cleanText(msg.name, 16) || profile.name;
      profile.name = profile.name || 'Aventurero';
      setupProfile(profile, legacy && msg.look ? MAP.cleanLook(msg.look) : null);
      acc.last = { slot, server: roomName };
      store.setPlayer(pid, acc);
      // El mismo personaje no puede estar dos veces: la sesión anterior se cierra
      const cid = charId(pid, slot);
      const dup = onlineChar(cid);
      if (dup) {
        rememberPlace(dup.r, dup.u); // se continúa justo donde estaba la otra sesión
        dup.u.kicked = true;
        send(dup.u.ws, { t: 'kicked', text: 'Has entrado con este personaje desde otro sitio.' });
        dup.u.ws.close(4001, 'otra sesión');
      }
      const banUntil = room.banned.get(pid);
      if (banUntil && banUntil > Date.now()) return send(ws, { t: 'error', text: `El dueño de esta taberna te ha echado. Podrás volver en ${Math.ceil((banUntil - Date.now()) / 60000)} min.` });
      const name = profile.name;
      // Quien entra primero en una sala nueva es su dueño y puede editar los muebles
      if (!room.ownerId) { room.ownerId = pid; saveRoom(room); }
      const r = profile.resume;
      const back = r && r.server === roomName && r.at === 'tavern' && room.map.isStandable(r.x, r.y) && ![...room.users.values()].some((u) => !u.where && u.x === r.x && u.y === r.y);
      const pos = back ? { x: r.x, y: r.y } : freeSpawn(room);
      user = { id: crypto.randomBytes(6).toString('hex'), pid, cid, slot, account: acc, name, look: lookFrom(profile), profile, x: pos.x, y: pos.y, where: null, ws, trade: null };
      room.users.set(user.id, user);
      send(ws, {
        t: 'welcome', id: user.id, room: roomName, serverName: serverName(roomName), owner: isOwner(), slot, motd: room.motd || '',
        items: room.map.items,
        users: [...room.users.values()].map(publicUser),
        history: room.history,
      });
      sendMe(user);
      setTimeout(() => {
        if (user.ws.readyState !== 1) return;
        offerLogin(user); seasonPrize(room, user);
        if (user.profile.marketNews) { send(user.ws, { t: 'toast', text: `🏪 Mientras no estabas vendiste cosas en el mercado: +${user.profile.marketNews} 🪙` }); delete user.profile.marketNews; saveUser(user); }
      }, 2500);
      if (profile.statsReset) {
        delete profile.statsReset;
        store.setPlayer(pid, acc);
        send(ws, { t: 'system', ts: Date.now(), text: `📜 Las características han cambiado (Fuerza, Destreza, Vigor, Inteligencia, Carisma y Suerte, hasta ${RULES.STAT_MAX} de forma natural). Tus puntos han vuelto: pulsa el icono rojo bajo tu retrato para repartirlos.` });
      }
      broadcast(room, { t: 'join', user: publicUser(user) }, user.id);
      system(room, `${user.name} entra en la taberna.`);
      resumePlace(room, user);
      return;
    }

    // los mensajes de personaje, tiendas y juego van a server/handlers/*.js
    if (HANDLERS[msg.t]) return HANDLERS[msg.t](CONN, msg);
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
        const mutedUntil = room.muted.get(user.pid);
        if (mutedUntil && mutedUntil > Date.now()) return send(ws, { t: 'system', text: `🔇 Estás silenciado ${Math.ceil((mutedUntil - Date.now()) / 60000)} min más.`, ts: Date.now() });
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

      // ----- Inventario y equipo -----

      // ----- Tiendas (en la taberna) -----

      // ----- Comercio entre jugadores (en la taberna) -----

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
      case 'dping': {
        // marca en el suelo para el grupo (como mucho una cada 0,7 s)
        const i = inst(), now = Date.now();
        if (!i || now - (user.lastPing || 0) < 700) break;
        const x = Math.floor(Number(msg.x)), y = Math.floor(Number(msg.y));
        if (!(x >= 0 && y >= 0 && x < i.w && y < i.h)) break;
        user.lastPing = now;
        i.event({ e: 'ping', id: user.id, x, y, k: msg.k === 'danger' ? 'danger' : 'here' });
        break;
      }
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

      // ----- Establo: mascotas (nivel 5) y monturas (nivel 12) -----

      // ----- Oficios del mundo, esquiva -----
      case 'dfish': { const i = inst(); if (i && allowGame()) i.hook(user.id); break; }
      case 'dgather': { const i = inst(); if (i && allowGame()) i.gather(user.id, String(msg.id)); break; }
      case 'droll': { const i = inst(); if (i && allowGame()) i.roll(user.id, msg.dx, msg.dy); break; }

      // ----- Forja de Brunilda (en la taberna) -----

      // ----- Cocina de Alfonso -----

      // ----- Tablón, logros, títulos, clasificaciones y habitación -----

      // ----- Descenso infinito y duelos -----

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
    // Herramientas del dueño de la taberna
    if (['expulsar', 'silenciar', 'hablar', 'aviso'].includes(c)) {
      if (!isOwner()) return send(ws, { t: 'system', text: 'Solo el dueño de la taberna puede hacer eso.', ts: Date.now() });
      if (c === 'aviso') {
        room.motd = cleanText(arg, 160);
        saveRoom(room);
        broadcast(room, { t: 'motd', text: room.motd });
        return system(room, room.motd ? `📌 Nuevo mensaje del día: ${room.motd}` : '📌 Mensaje del día borrado.');
      }
      const [who, mins] = (() => { const m = /^(.*?)(?:\s+(\d+))?$/.exec(arg); return [m[1].trim().toLowerCase(), Math.max(1, Math.min(1440, Number(m[2]) || 10))]; })();
      const target = [...room.users.values()].find((u) => u.name.toLowerCase() === who);
      if (!target) return send(ws, { t: 'system', text: `No hay nadie llamado «${arg}» en la taberna.`, ts: Date.now() });
      if (target.pid === user.pid) return send(ws, { t: 'system', text: 'No puedes hacerte eso a ti mismo.', ts: Date.now() });
      if (c === 'hablar') { room.muted.delete(target.pid); return system(room, `🔊 ${target.name} puede volver a hablar.`); }
      if (c === 'silenciar') { room.muted.set(target.pid, Date.now() + mins * 60000); return system(room, `🔇 ${target.name} queda silenciado ${mins} min.`); }
      room.banned.set(target.pid, Date.now() + mins * 60000);
      system(room, `🚪 ${user.name} echa a ${target.name} de la taberna (${mins} min).`);
      send(target.ws, { t: 'kicked', text: `El dueño de la taberna te ha echado durante ${mins} min.` });
      return target.ws.close(4002, 'expulsado');
    }
    send(ws, { t: 'system', text: 'Comandos: /dado [6|20…], /d20, /me acción, /nombre NUEVO, /tutorial' + (isOwner() ? '. Dueño: /aviso TEXTO (mensaje del día), /silenciar NOMBRE [min], /hablar NOMBRE, /expulsar NOMBRE [min]' : ''), ts: Date.now() });
  }

  ws.on('close', () => {
    clearInterval(backupTimer);
    clearTimeout(joinTimer);
    if (!user) return;
    if (!user.kicked) rememberPlace(room, user);
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

function shutdown() {
  try {
    for (const r of rooms.values()) for (const u of r.users.values()) rememberPlace(r, u);
    store.flushAll();
  } catch { /* nada */ }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

if (require.main === module) {
  server.listen(PORT, () => console.log(`🍺 La taberna está abierta en http://localhost:${PORT}`));
}

module.exports = { server, store, rooms };
