// Una partida en marcha (mazmorra aleatoria o mundo abierto) en tiempo real.
// El servidor mueve a los héroes (clic para ir, clic en un enemigo para atacarlo sin parar, o teclas),
// lleva la IA de los monstruos, los proyectiles que se pueden esquivar, los ataques especiales de los jefes
// (avisados en el suelo antes de golpear), las habilidades de clase y el botín.
const crypto = require('crypto');
const DUNGEON = require('../public/dungeon-data.js');
const RULES = require('../public/rules/engine.js');
const PROG = require('../public/rules/progress.js');
const { PROPS } = require('./gen.js');

const FAST = process.env.DD_TEST_FAST ? 0.25 : 1; // las pruebas automáticas aceleran los tiempos de espera
const RESPAWN_MS = 3 * 60 * 1000;
const PROJ_SPEED = 9;          // casillas por segundo
const AGGRO = 7, LEASH = 14;
const MAX_SUMMONS = 6;
const FLUSH_MS = 100;
const WATER = new Set(['w', 'v', 'q', '~']);
const EVENT_MS = Number(process.env.DD_EVENT_MS) || 0; // las pruebas adelantan los jefes de mundo
const PVP_MULT = 0.55; // en la arena los golpes duelen menos: los duelos duran más

const rnd = () => crypto.randomInt(0, 1e9) / 1e9;
const randInt = (a, b) => crypto.randomInt(Math.min(a, b), Math.max(a, b) + 1);
const roll = (r) => r[0] + rnd() * (r[1] - r[0]);
const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const OPAQUE = new Set(['#', 'T', 'P', 'M', 'R', 'k', 'y', 'p']);
const dirName = (dx, dy) => (Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'E' : 'W') : dy > 0 ? 'S' : 'N');

class Instance {
  // def: mazmorra de server/gen.js ({ kind:'dungeon', theme, level, tiles, start, props, spawns, chests, potions })
  //   o el mundo ({ kind:'world', tiles, start, groups:[{ spawn, lvl }], caves })
  // hooks: { send(user,msg), derive(user), reward(user,xp,gold), give(user,item)->bool, giveCons(user,cid,n)->bool,
  //          exit(user, reason, info), portal(user, cave) }
  constructor(def, hooks) {
    this.def = def;
    this.id = def.id;
    this.w = def.w; this.h = def.h;
    this.kind = def.kind || 'dungeon';
    this.level = def.level || 1;
    this.hooks = hooks;
    this.players = new Map();
    this.enemies = new Map();
    this.chests = new Map();
    this.loot = new Map();
    this.projectiles = [];
    this.teles = [];
    this.auras = [];
    this.events = [];
    this.dirty = false;
    this.lastFlush = 0;
    this.openDoors = new Set(); // puertas abiertas (índices de casilla): cerradas tapan la vista
    this.seq = 0;
    this.start = def.start || { x: 1, y: 1 };
    this.portal = null;
    this.bossDead = false;
    this.groups = [];
    this.blocked = new Set();
    this.created = Date.now();
    this.npcs = def.npcs || [];
    this.waystones = def.waystones || [];
    this.pets = new Map(); // dueño -> mascota
    this.mod = def.descent ? def.descent.mod : null; // desafío semanal del Descenso
    this.duel = def.duel || null;                     // arena: { a, b, bet, startAt }
    this.herbs = new Map((def.herbs || []).map((h) => [h.id, { ...h, readyAt: 0 }]));
    this.worldBoss = null;
    this.nextEventAt = this.kind === 'world' ? Date.now() + (EVENT_MS || PROG.WORLD_EVENT.firstMs) : 0;
    for (const n of this.npcs) this.blocked.add(n.y * this.w + n.x);
    const now = Date.now();
    for (const p of def.props || []) if (PROPS[p.k] && PROPS[p.k].b) this.blocked.add(p.y * this.w + p.x);
    for (const c of def.chests || []) { const id = 'c' + ++this.seq; this.chests.set(id, { id, x: c.x, y: c.y, open: false }); }
    for (const p of def.potions || []) this.dropAt(p.x, p.y, { cons: 'pocion-vida-p' });
    if (def.spawns) {
      const packs = new Map();
      for (const s of def.spawns) {
        const elite = s.elite || (this.mod === 'elites' && !s.boss && rnd() < 0.28);
        const id = this.addEnemy(s.k, s.x, s.y, this.level, now, { elite });
        if (id && s.pack) { if (!packs.has(s.pack)) packs.set(s.pack, []); packs.get(s.pack).push(id); this.enemies.get(id).pack = s.pack; }
      }
    }
    for (const g of def.groups || []) {
      const group = { spawn: g.spawn, lvl: g.lvl || 1, alive: new Set(), respawnAt: 0, id: 'g' + this.groups.length };
      this.groups.push(group);
      this.spawnGroup(group, now);
    }
  }

  get size() { return this.players.size; }

  // ---------- Mapa ----------
  tile(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return '#';
    return this.def.tiles[y * this.w + x];
  }
  walkTile(x, y) { return DUNGEON.walkable(this.tile(x, y)) && !this.blocked.has(y * this.w + x); }
  enemyAt(x, y) { for (const e of this.enemies.values()) if (e.x === x && e.y === y) return e; return null; }
  playerAt(x, y) { for (const p of this.players.values()) if (p.x === x && p.y === y) return p; return null; }
  chestAt(x, y) { for (const c of this.chests.values()) if (c.x === x && c.y === y) return c; return null; }
  // Un héroe puede pisar casillas con otros héroes (así no hay atascos en los pasillos); los enemigos no
  freeForPlayer(x, y) { return this.walkTile(x, y) && !this.enemyAt(x, y) && !this.chestAt(x, y); }
  freeForEnemy(x, y) { return this.walkTile(x, y) && this.tile(x, y) !== '^' && !this.enemyAt(x, y) && !this.playerAt(x, y) && !this.chestAt(x, y); }
  noCorner(x, y, dx, dy) { return !(dx && dy) || (this.walkTile(x + dx, y) && this.walkTile(x, y + dy)); }

  freeNear(x, y, test = (a, b) => this.freeForEnemy(a, b)) {
    for (let r = 0; r < 10; r++) {
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (test(x + dx, y + dy)) return { x: x + dx, y: y + dy };
      }
    }
    return { x, y };
  }

  // Línea de visión (Bresenham): muros, árboles y montañas tapan
  los(a, b) {
    let x0 = a.x, y0 = a.y;
    const dx = Math.abs(b.x - x0), dy = -Math.abs(b.y - y0), sx = x0 < b.x ? 1 : -1, sy = y0 < b.y ? 1 : -1;
    let err = dx + dy;
    while (!(x0 === b.x && y0 === b.y)) {
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
      if (x0 === b.x && y0 === b.y) break;
      if (OPAQUE.has(this.tile(x0, y0))) return false;
    }
    return true;
  }

  // A* en 8 direcciones sin cortar esquinas. passable(x,y) decide; el destino siempre vale.
  path(from, to, passable, maxNodes = 3000) {
    const W = this.w;
    if (from.x === to.x && from.y === to.y) return [];
    const start = from.y * W + from.x, goal = to.y * W + to.x;
    const g = new Map([[start, 0]]), prev = new Map();
    const open = [[Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y)), start]];
    let nodes = 0, best = start, bestH = Infinity;
    while (open.length && nodes++ < maxNodes) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
      const [, cur] = open.splice(bi, 1)[0];
      if (cur === goal) { best = goal; break; }
      const cx = cur % W, cy = (cur / W) | 0;
      const h = Math.max(Math.abs(to.x - cx), Math.abs(to.y - cy));
      if (h < bestH) { bestH = h; best = cur; }
      for (const [dx, dy] of DIRS) {
        const nx = cx + dx, ny = cy + dy;
        const ni = ny * W + nx;
        if (ni !== goal && !passable(nx, ny)) continue;
        if (ni === goal && !this.walkTile(nx, ny) && !this.chestAt(nx, ny)) continue;
        if (!this.noCorner(cx, cy, dx, dy)) continue;
        const ng = g.get(cur) + (dx && dy ? 1.41 : 1);
        if (!g.has(ni) || ng < g.get(ni)) {
          g.set(ni, ng); prev.set(ni, cur);
          open.push([ng + Math.max(Math.abs(to.x - nx), Math.abs(to.y - ny)), ni]);
        }
      }
    }
    // si no se llega, el camino lleva lo más cerca posible
    const out = [];
    for (let i = best; i !== start && prev.has(i); i = prev.get(i)) out.unshift({ x: i % W, y: (i / W) | 0 });
    return out;
  }

  // ---------- Enemigos ----------
  spawnGroup(group, now) {
    for (const s of group.spawn) {
      const pos = this.freeNear(s.x, s.y);
      const id = this.addEnemy(s.k, pos.x, pos.y, group.lvl, now, { elite: s.elite });
      if (id) { const e = this.enemies.get(id); e.group = group; e.pack = group.id; group.alive.add(id); }
    }
  }

  addEnemy(k, x, y, level, now, o = {}) {
    const m = RULES.monsterAt(k, level, o.elite);
    if (!m) return null;
    if (this.mod === 'frenesi') { m.ms = Math.round(m.ms * 0.75); m.atk = Math.round(m.atk * 0.8); }
    if (this.mod === 'gigantes') { m.hp = Math.round(m.hp * 1.5); m.xp = Math.round(m.xp * 1.5); m.big = true; }
    if (o.hpMult) m.hp = Math.round(m.hp * o.hpMult);
    const id = 'e' + ++this.seq;
    this.enemies.set(id, {
      id, k: m.k, m, x, y, hp: m.hp, maxHp: m.hp, dir: 'S', sm: m.ms, summoned: !!o.summoned,
      nextStep: now + 300 + rnd() * 600, nextAttack: now + 700 + rnd() * 700, nextSpecial: now + 4000, nextHeal: now + 3000, nextSummon: now + 5000,
      home: { x, y }, aggro: null, stunUntil: 0, slowUntil: 0, vulnUntil: 0, vuln: 0, dots: [], hitters: new Set(),
    });
    return id;
  }

  // ---------- Héroes ----------
  join(user, at) {
    const d = this.hooks.derive(user);
    const c = user.combat || (user.combat = { hp: d.hp, en: d.en, cds: {} });
    c.hp = Math.min(c.hp, d.hp); c.en = Math.min(c.en, d.en);
    const pos = this.freeNear((at || this.start).x, (at || this.start).y, (x, y) => this.freeForPlayer(x, y));
    const p = {
      user, x: pos.x, y: pos.y, d, dir: 'S', sm: d.moveMs, nextStep: 0, nextAttack: 0, path: [], goal: null, kdir: null,
      target: null, pending: null, tbuffs: {}, critNext: false, regenUntil: 0, lastHurt: 0, mounted: false, talkTo: null, zone: -1,
      stunUntil: 0, slowUntil: 0, iframeUntil: 0, rollAt: 0, fishing: null, gatherTo: null,
    };
    this.players.set(user.id, p);
    if (this.kind === 'arena') { c.hp = d.hp; c.en = d.en; this.addProxy(p); }
    else this.spawnPet(user);
    const def = this.def;
    this.hooks.send(user, {
      t: 'dstart',
      dungeon: { id: this.id, name: def.name, tiles: def.tiles, w: this.w, h: this.h, kind: this.kind, theme: def.theme || null, level: this.level, labels: def.labels || [], props: def.props || [], zones: def.zones || null, waystones: this.waystones, npcs: this.npcs.map(({ id, name, x, y, look, shop }) => ({ id, name, x, y, look, shop })), descent: def.descent || null, doors: [...this.openDoors], duel: this.duel ? { startAt: this.duel.startAt, bet: this.duel.bet } : null },
      ...this.snapshot(p), you: this.privateState(p),
    });
    this.event({ e: 'join', id: user.id });
  }

  leave(userId) {
    this.pets.delete(userId);
    this.enemies.delete('pv:' + userId);
    if (!this.players.delete(userId)) return;
    for (const e of this.enemies.values()) if (e.aggro === userId) e.aggro = null;
    this.event({ e: 'leave', id: userId });
  }

  // La ficha cambió (nivel, puntos, equipo o bufos): se recalcula manteniendo la vida perdida
  refresh(user) {
    const p = this.players.get(user.id);
    if (!p) return;
    const d = this.hooks.derive(user);
    const c = user.combat;
    if (d.hp > p.d.hp) c.hp += d.hp - p.d.hp;
    c.hp = Math.min(c.hp, d.hp); c.en = Math.min(c.en, d.en);
    p.d = d;
    const pet = this.pets.get(user.id);
    const want = this.hooks.petFor ? this.hooks.petFor(user) : null;
    if (!want) this.pets.delete(user.id);
    else if (!pet || pet.type !== want.type) this.spawnPet(user);
    else { pet.st = want.st; pet.maxHp = want.st.hp; pet.name = want.name; pet.plvl = want.st.plvl; pet.evo = want.st.evo; }
    this.dirty = true;
    this.sendPrivate(p);
  }

  // ---------- Mascotas ----------
  spawnPet(user) {
    const want = this.hooks.petFor ? this.hooks.petFor(user) : null;
    if (!want) { this.pets.delete(user.id); return; }
    const p = this.players.get(user.id);
    const pos = this.freeNear(p.x + 1, p.y, (x, y) => this.freeForPet(x, y));
    this.pets.set(user.id, { id: 'pet:' + user.id, owner: user.id, type: want.type, name: want.name, st: want.st, plvl: want.st.plvl, evo: want.st.evo, x: pos.x, y: pos.y, sm: 200, dir: 'S', hp: want.st.hp, maxHp: want.st.hp, nextStep: 0, nextAttack: 0, nextSkill: 0, downUntil: 0 });
    this.dirty = true;
  }
  // pueblos y campamentos: los monstruos no entran a por nadie
  inSafe(p) { return !!(this.def.safe && this.def.safe.some((z) => Math.max(Math.abs(p.x - z.x), Math.abs(p.y - z.y)) <= z.r)); }
  freeForPet(x, y) { return this.walkTile(x, y) && !this.enemyAt(x, y) && !this.chestAt(x, y); }
  petAt(x, y) { for (const pt of this.pets.values()) if (pt.downUntil <= Date.now() && pt.x === x && pt.y === y) return pt; return null; }

  tickPets(now) {
    for (const pet of this.pets.values()) {
      const o = this.players.get(pet.owner);
      if (!o) continue;
      if (pet.downUntil > now) continue;
      if (pet.downUntil && pet.downUntil <= now) { pet.downUntil = 0; pet.hp = pet.maxHp; const q = this.freeNear(o.x, o.y, (x, y) => this.freeForPet(x, y)); pet.x = q.x; pet.y = q.y; this.event({ e: 'fx', kind: 'buff', x: q.x, y: q.y, color: '#ffd23f' }); }
      if (pet.hp < pet.maxHp) pet.hp = Math.min(pet.maxHp, pet.hp + pet.maxHp * 0.01 * 0.05 * 20 * 0.05);
      // objetivo: lo que ataca su dueño, o quien le ataca a él
      let t = o.target && this.enemies.get(o.target);
      if (!t || cheb(t, pet) > 9) { t = null; for (const e of this.enemies.values()) if (e.aggro === o.user.id && cheb(e, o) <= 5 && (!t || cheb(e, pet) < cheb(t, pet))) t = e; }
      if (cheb(pet, o) > 12) { const q = this.freeNear(o.x, o.y, (x, y) => this.freeForPet(x, y)); pet.x = q.x; pet.y = q.y; pet.sm = 100; this.dirty = true; continue; }
      if (t) {
        if (cheb(t, pet) <= 1 && this.noCorner(pet.x, pet.y, Math.sign(t.x - pet.x), Math.sign(t.y - pet.y))) {
          if (now >= pet.nextAttack) {
            pet.nextAttack = now + pet.st.atk;
            pet.dir = dirName(t.x - pet.x, t.y - pet.y);
            this.event({ e: 'swing', id: pet.id, t: t.id });
            if (rnd() < 0.5) t.petAggro = pet.id;
            if (pet.plvl >= RULES.PET_SKILL_LEVEL && now >= pet.nextSkill) this.petSkill(pet, o, t, now);
            else this.damageEnemy(o, t, roll(pet.st.dmg), { noCrit: true, kind: 'pet', name: pet.name });
          }
          continue;
        }
        if (now >= pet.nextStep) this.petStep(pet, t, now);
        continue;
      }
      if (cheb(pet, o) > 2 && now >= pet.nextStep) this.petStep(pet, o, now);
    }
  }

  // Habilidad de la mascota (más fuerte si ha evolucionado)
  petSkill(pet, o, t, now) {
    const S = RULES.PET_SKILLS[pet.type];
    const k = 1 + (pet.evo || 0) * 0.5;
    pet.nextSkill = now + S.cd;
    this.event({ e: 'petskill', id: pet.id, name: S.name, owner: o.user.id, x: t.x, y: t.y });
    if (S.kind === 'buff') {
      o.tbuffs['pet:' + pet.type] = { dmgPct: S.dmgPct * k, until: now + S.dur };
      this.event({ e: 'fx', kind: 'nova', x: pet.x, y: pet.y, radius: 1, color: '#ffb040' });
      this.damageEnemy(o, t, roll(pet.st.dmg), { noCrit: true, kind: 'pet', name: pet.name });
    } else if (S.kind === 'bleed') {
      this.damageEnemy(o, t, roll(pet.st.dmg), { noCrit: true, kind: 'pet', name: S.name });
      if (this.enemies.has(t.id)) this.addDot(o, t, roll(pet.st.dmg) * S.mult * k, S.dur);
    } else if (S.kind === 'stun') {
      this.damageEnemy(o, t, roll(pet.st.dmg) * S.mult * k, { noCrit: true, kind: 'pet', name: S.name });
      if (this.enemies.has(t.id)) t.stunUntil = now + S.stun * k;
    } else if (S.kind === 'aoe') {
      this.event({ e: 'fx', kind: 'nova', x: pet.x, y: pet.y, radius: S.radius, color: '#c88a4a' });
      for (const e of this.enemiesNear(pet, S.radius, o)) this.damageEnemy(o, e, roll(pet.st.dmg) * S.mult * k, { noCrit: true, kind: 'pet', name: S.name });
    }
  }

  petStep(pet, target, now) {
    let move = null, best = cheb(pet, target);
    for (const [dx, dy] of DIRS) {
      const nx = pet.x + dx, ny = pet.y + dy;
      if (!this.freeForPet(nx, ny) || !this.noCorner(pet.x, pet.y, dx, dy)) continue;
      const d = Math.max(Math.abs(nx - target.x), Math.abs(ny - target.y)) + (dx && dy ? 0.01 : 0);
      if (d < best) { best = d; move = [dx, dy]; }
    }
    if (!move) {
      const path = this.path(pet, target, (x, y) => this.freeForPet(x, y), 400);
      if (path[0] && Math.max(Math.abs(path[0].x - pet.x), Math.abs(path[0].y - pet.y)) === 1) move = [path[0].x - pet.x, path[0].y - pet.y];
    }
    if (!move) { pet.nextStep = now + 250; return; }
    pet.sm = Math.round(pet.st.ms * (move[0] && move[1] ? 1.41 : 1));
    pet.nextStep = now + pet.sm;
    pet.x += move[0]; pet.y += move[1]; pet.dir = dirName(move[0], move[1]);
    this.dirty = true;
  }

  hurtPet(pet, dmg, o = {}) {
    if (pet.downUntil > Date.now()) return;
    dmg = Math.max(1, Math.round(dmg * (o.magic ? 0.9 : 0.75)));
    pet.hp -= dmg;
    this.event({ e: 'hit', by: o.by || null, t: pet.id, dmg, kind: o.kind || 'melee' });
    if (pet.hp <= 0) { pet.downUntil = Date.now() + 30000; this.event({ e: 'petdown', id: pet.id, owner: pet.owner, name: pet.name }); }
  }

  // ---------- Mundo: montura, charlas y viajes ----------
  toggleMount(userId) {
    const p = this.players.get(userId);
    if (!p) return;
    if (this.kind !== 'world') return this.whisper(p, 'Sólo puedes montar en el mundo abierto.');
    const m = this.hooks.mountFor ? this.hooks.mountFor(p.user) : null;
    if (!m) return this.whisper(p, `Necesitas una montura (nivel ${RULES.MOUNT_LEVEL}, en el Establo de la taberna).`);
    p.mounted = !p.mounted;
    p.mount = m;
    this.event({ e: 'fx', kind: 'buff', x: p.x, y: p.y, color: '#c8a060' });
    this.dirty = true;
  }

  talk(userId, npcId) {
    const p = this.players.get(userId);
    const n = this.npcs.find((x) => x.id === npcId);
    if (!p || !n) return;
    p.kdir = null; p.target = null; p.pending = null;
    if (cheb(p, n) <= 2) { this.hooks.talk(p.user, n); return; }
    p.talkTo = npcId; p.goal = { x: n.x, y: n.y }; p.path = [];
  }

  teleport(userId, x, y) {
    const p = this.players.get(userId);
    if (!p) return;
    const pos = this.freeNear(x, y + 1, (a, b) => this.freeForPlayer(a, b));
    p.x = pos.x; p.y = pos.y; p.path = []; p.goal = null; p.target = null; p.sm = 80;
    for (const e of this.enemies.values()) if (e.aggro === userId) e.aggro = null;
    const pet = this.pets.get(userId);
    if (pet) { const q = this.freeNear(pos.x + 1, pos.y, (a, b) => this.freeForPet(a, b)); pet.x = q.x; pet.y = q.y; }
    this.event({ e: 'fx', kind: 'portal', x: p.x, y: p.y });
    this.dirty = true;
  }

  // ---------- Oficios del mundo: pesca y hierbas ----------
  waterNear(p) {
    for (const [dx, dy] of DIRS) if (WATER.has(this.tile(p.x + dx, p.y + dy))) return { x: p.x + dx, y: p.y + dy };
    return null;
  }
  fish(userId) {
    const p = this.players.get(userId);
    if (!p) return;
    if (this.kind !== 'world') return this.whisper(p, 'Aquí no hay dónde pescar.');
    const w = this.waterNear(p);
    if (!w) return this.whisper(p, '🎣 Acércate a la orilla (agua, vado o ciénaga) para pescar.');
    if (p.fishing) return;
    p.mounted = false; p.path = []; p.goal = null; p.target = null; p.kdir = null;
    const zone = this.def.zones ? Number(this.def.zones[p.y * this.w + p.x]) || 0 : 0;
    p.fishing = { biteAt: Date.now() + (2000 + rnd() * 3500) * FAST, bit: 0, zone, at: w };
    p.dir = dirName(w.x - p.x, w.y - p.y);
    this.event({ e: 'fish', id: userId, x: w.x, y: w.y });
    this.whisper(p, '🎣 Lanzas el sedal… cuando pique, ¡tira! (pulsa otra vez)');
  }
  hook(userId) {
    const p = this.players.get(userId);
    if (!p || !p.fishing) return this.fish(userId);
    const f = p.fishing;
    p.fishing = null;
    this.event({ e: 'fishend', id: userId });
    if (!f.bit) return this.whisper(p, 'Demasiado pronto: el pez se asusta.');
    if (Date.now() - f.bit > 1400) return this.whisper(p, 'Demasiado tarde: se ha escapado.');
    if (this.hooks.fish) this.hooks.fish(p.user, f.zone);
    this.event({ e: 'fx', kind: 'splash', x: f.at.x, y: f.at.y });
  }
  gather(userId, id) {
    const p = this.players.get(userId);
    const h = this.herbs.get(id);
    if (!p || !h) return;
    if (h.readyAt > Date.now()) return this.whisper(p, 'Ya la han recogido. Volverá a crecer.');
    p.kdir = null; p.target = null; p.pending = null; p.fishing = null;
    if (cheb(p, h) <= 1) return this.takeHerb(p, h);
    p.gatherTo = id; p.goal = { x: h.x, y: h.y }; p.path = [];
  }
  takeHerb(p, h) {
    p.gatherTo = null; p.goal = null; p.path = [];
    h.readyAt = Date.now() + 120000;
    this.event({ e: 'fx', kind: 'buff', x: h.x, y: h.y, color: '#7dff8a' });
    if (this.hooks.herb) this.hooks.herb(p.user, h.zone);
  }

  // ---------- Esquiva: una voltereta de dos casillas, invulnerable un instante ----------
  roll(userId, dx, dy) {
    const p = this.players.get(userId);
    if (!p) return;
    const now = Date.now();
    if (now < p.rollAt || now < p.stunUntil || (this.duel && now < this.duel.startAt)) return;
    const c = p.user.combat;
    if (c.en < 8) return this.whisper(p, 'No te queda energía para esquivar.');
    dx = Math.sign(Number(dx) || 0); dy = Math.sign(Number(dy) || 0);
    if (!dx && !dy) { const f = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[p.dir] || [0, 1]; [dx, dy] = f; }
    const from = { x: p.x, y: p.y };
    for (let i = 0; i < 2; i++) {
      const nx = p.x + dx, ny = p.y + dy;
      if (!this.freeForPlayer(nx, ny) || !this.noCorner(p.x, p.y, dx, dy) || (DUNGEON.TILES[this.tile(nx, ny)] || {}).portal) break;
      p.x = nx; p.y = ny;
    }
    c.en -= 8;
    p.rollAt = now + 2500 * FAST;
    p.iframeUntil = now + 450;
    p.mounted = false; p.fishing = null;
    p.path = []; p.goal = null; p.pending = null;
    p.sm = 170; p.nextStep = now + 200;
    p.dir = dirName(dx, dy);
    this.event({ e: 'roll', id: userId, from, to: { x: p.x, y: p.y } });
    this.privDirty(p);
    if (p.x !== from.x || p.y !== from.y) this.onEnter(p);
  }

  // ---------- Jefes de mundo ----------
  tickWorldEvent(now) {
    if (this.kind !== 'world') return;
    const wb = this.worldBoss;
    if (wb) {
      if (!this.enemies.has(wb.id)) { this.worldBoss = null; return; }
      if (now >= wb.until) {
        const e = this.enemies.get(wb.id);
        this.enemies.delete(wb.id);
        this.event({ e: 'die', id: wb.id, k: e.k, x: e.x, y: e.y, xp: 0 });
        for (const o of [...this.enemies.values()]) if (o.fromWb) this.enemies.delete(o.id);
        this.worldBoss = null;
        if (this.hooks.announce) this.hooks.announce(`🌫️ ${e.m.name} se retira a las sombras. Nadie pudo con él esta vez.`);
        this.nextEventAt = now + (EVENT_MS || PROG.WORLD_EVENT.everyMs);
      }
      return;
    }
    if (!this.nextEventAt || now < this.nextEventAt || !this.players.size) return;
    // aparece cerca de un héroe al azar, en su zona, lejos de pueblos y campamentos
    const list = [...this.players.values()];
    const host = list[Math.floor(rnd() * list.length)];
    let spot = null;
    for (let i = 0; i < 60 && !spot; i++) {
      const a = rnd() * Math.PI * 2, r = 6 + rnd() * 6;
      const x = Math.round(host.x + Math.cos(a) * r), y = Math.round(host.y + Math.sin(a) * r);
      if (this.freeForEnemy(x, y) && !this.inSafe({ x, y }) && !(DUNGEON.TILES[this.tile(x, y)] || {}).portal) spot = { x, y };
    }
    if (!spot) { this.nextEventAt = now + 30000; return; }
    const lvl = Math.max(...list.map((p) => p.d.level));
    const k = PROG.WORLD_BOSSES[Math.floor(rnd() * PROG.WORLD_BOSSES.length)];
    const id = this.addEnemy(k, spot.x, spot.y, lvl + 1, now, { hpMult: 0.6 + 0.4 * list.length });
    const e = this.enemies.get(id);
    e.home = spot; e.wb = true;
    this.worldBoss = { id, until: now + (EVENT_MS ? EVENT_MS * 4 : PROG.WORLD_EVENT.lastsMs) };
    this.event({ e: 'worldboss', id, k, x: spot.x, y: spot.y, name: e.m.name });
    const Z = this.def.zones ? RULES.ZONES[Number(this.def.zones[spot.y * this.w + spot.x]) || 0] : null;
    if (this.hooks.announce) this.hooks.announce(`🌋 ¡${e.m.name} (nivel ${e.m.level}) ha aparecido${Z ? ' en ' + Z.name : ''}! Todos los héroes del mundo pueden luchar contra él durante 10 minutos.`);
  }

  // ---------- Arena: cada rival es un "enemigo" fantasma que refleja al otro héroe ----------
  addProxy(p) {
    const id = 'pv:' + p.user.id;
    const m = { k: 'pvp', name: p.user.name, level: p.d.level, armor: p.d.armor, ms: 300, atk: 1000, range: 1, dmg: [0, 0], xp: 0, gold: [0, 0], specials: [], sets: [] };
    this.enemies.set(id, { id, k: 'pvp', m, x: p.x, y: p.y, hp: p.user.combat.hp, maxHp: p.d.hp, dir: p.dir, sm: 200, pvp: true, owner: p.user.id, stunUntil: 0, slowUntil: 0, vulnUntil: 0, vuln: 0, dots: [], hitters: new Set(), home: { x: p.x, y: p.y } });
  }
  syncProxies(now) {
    for (const e of this.enemies.values()) {
      if (!e.pvp) continue;
      const p = this.players.get(e.owner);
      if (!p) { this.enemies.delete(e.id); continue; }
      e.x = p.x; e.y = p.y; e.hp = p.user.combat.hp; e.maxHp = p.d.hp; e.m.armor = p.d.armor; e.m.level = p.d.level;
      if (e.stunUntil > p.stunUntil) p.stunUntil = e.stunUntil;
      if (e.slowUntil > p.slowUntil) p.slowUntil = e.slowUntil;
      this.tickDots(e, now);
    }
  }

  event(ev) { this.events.push(ev); this.dirty = true; }
  // Las puertas se abren solas cuando un héroe llega a su lado (y quedan abiertas para todos)
  tickDoors() {
    for (const p of this.players.values()) {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = p.x + dx, y = p.y + dy;
        if (x < 0 || y < 0 || x >= this.w || y >= this.h || this.tile(x, y) !== '+') continue;
        const i = y * this.w + x;
        if (this.openDoors.has(i)) continue;
        this.openDoors.add(i);
        this.event({ e: 'door', x, y });
      }
    }
  }
  whisper(p, text) { this.hooks.send(p.user, { t: 'dwhisper', text }); }

  // ---------- Órdenes del jugador ----------
  // Teclas: dirección mantenida (0,0 = parar)
  dir(userId, dx, dy) {
    const p = this.players.get(userId);
    if (!p) return;
    dx = Math.sign(Number(dx) || 0); dy = Math.sign(Number(dy) || 0);
    p.kdir = dx || dy ? [dx, dy] : null;
    if (p.kdir) { p.path = []; p.goal = null; p.target = null; p.pending = null; p.fishing = null; p.gatherTo = null; }
  }

  go(userId, x, y) {
    const p = this.players.get(userId);
    if (!p || !Number.isInteger(x) || !Number.isInteger(y)) return;
    p.kdir = null; p.target = null; p.pending = null; p.talkTo = null; p.fishing = null; p.gatherTo = null;
    p.goal = { x, y };
    p.path = this.path(p, p.goal, (a, b) => this.freeForPlayer(a, b));
  }

  attack(userId, id) {
    const p = this.players.get(userId);
    if (!p || !this.enemies.has(id) || id === 'pv:' + userId) return;
    if (p.mounted) { p.mounted = false; this.dirty = true; }
    p.talkTo = null; p.fishing = null; p.gatherTo = null;
    p.kdir = null; p.path = []; p.goal = null; p.pending = null;
    p.target = id;
  }

  skill(userId, a) {
    const p = this.players.get(userId);
    if (!p || !a) return;
    const ab = p.d.abilities.find((x) => x.id === a.id);
    if (!ab) return;
    if (!ab.ready) return this.whisper(p, `${ab.name} se aprende a nivel ${ab.unlock}.`);
    const now = Date.now();
    const c = p.user.combat;
    if ((c.cds[ab.id] || 0) > now) return;
    if (c.en < ab.cost) return this.whisper(p, 'No te queda energía.');
    if (p.mounted) { p.mounted = false; this.dirty = true; }
    p.kdir = null;
    p.pending = { ab, target: typeof a.target === 'string' ? a.target : null, x: Number.isInteger(a.x) ? a.x : null, y: Number.isInteger(a.y) ? a.y : null };
    this.tryPending(p, now);
  }

  use(userId, cid, a = {}) {
    const p = this.players.get(userId);
    const C = RULES.CONSUMABLES[cid];
    if (!p || !C) return;
    const now = Date.now();
    const c = p.user.combat;
    if ((c.cds['cons:' + cid] || 0) > now) return;
    if (this.mod === 'sobrios' && !C.spell) return this.whisper(p, '🚫 Desafío «Abstemios»: esta semana no hay pociones en el Descenso.');
    if (this.kind === 'arena' && C.spell && C.spell.kind === 'return') return this.whisper(p, 'En la arena no hay huida posible.');
    if (C.spell && C.spell.kind !== 'return' && C.spell.kind !== 'healAll' && !this.nearestEnemy(p, C.spell.range)) return this.whisper(p, 'No hay enemigos a tiro.');
    if (!this.hooks.giveCons(p.user, cid, -1)) return this.whisper(p, `No te quedan: ${C.name}.`);
    c.cds['cons:' + cid] = now + (C.spell ? 1500 : 1000);
    if (C.heal) this.heal(p, Math.round(p.d.hp * C.heal), C.name);
    if (C.energy) c.en = Math.min(p.d.en, c.en + Math.round(p.d.en * C.energy));
    if (C.regen) { p.regenUntil = now + C.regen; this.event({ e: 'fx', kind: 'buff', x: p.x, y: p.y, color: '#5aa03a' }); }
    if (C.spell) {
      const s = C.spell;
      if (s.kind === 'return') { this.event({ e: 'fx', kind: 'portal', x: p.x, y: p.y }); return this.leaveTo(p, 'return'); }
      if (s.kind === 'healAll') { for (const o of this.players.values()) if (cheb(o, p) <= s.radius) this.heal(o, Math.round(o.d.hp * s.pct), C.name); this.event({ e: 'fx', kind: 'nova', x: p.x, y: p.y, radius: s.radius, color: '#7dff8a' }); }
      if (s.kind === 'blast') {
        const t = (a.target && this.enemies.get(a.target)) || this.nearestEnemy(p, s.range);
        this.event({ e: 'fx', kind: 'blast', x: t.x, y: t.y, radius: s.radius, from: { x: p.x, y: p.y }, color: '#ff7a2a' });
        for (const e of this.enemiesNear(t, s.radius, p)) this.damageEnemy(p, e, this.spellRoll(p) * s.mult, { magic: true, name: C.name });
      }
      if (s.kind === 'chain') {
        const list = [...this.enemies.values()].filter((e) => e.owner !== p.user.id && cheb(e, p) <= s.range && this.los(p, e)).sort((x, y) => cheb(x, p) - cheb(y, p)).slice(0, s.targets);
        let from = { x: p.x, y: p.y };
        for (const e of list) { this.event({ e: 'fx', kind: 'bolt', from, to: { x: e.x, y: e.y }, color: '#fff27a' }); from = { x: e.x, y: e.y }; this.damageEnemy(p, e, this.spellRoll(p) * s.mult, { magic: true, name: C.name }); }
      }
    }
    this.sendPrivate(p);
  }

  nearestEnemy(p, range) {
    let best = null, bd = Infinity;
    for (const e of this.enemies.values()) { if (e.owner === p.user.id) continue; const d = cheb(e, p); if (d <= range && d < bd && this.los(p, e)) { bd = d; best = e; } }
    return best;
  }
  // los enemigos alrededor de un punto (sin contar el fantasma de quien ataca, en la arena)
  enemiesNear(c, r, by) { return [...this.enemies.values()].filter((e) => (!by || e.owner !== by.user.id) && cheb(e, c) <= r && this.los(c, e)); }

  // ---------- Tiempo ----------
  tick(now) {
    const dt = 0.05;
    for (const g of this.groups) {
      if (!g.alive.size && g.respawnAt && now >= g.respawnAt) {
        const near = [...this.players.values()].some((p) => g.spawn.some((s) => cheb(p, s) < 14));
        if (!near) { g.respawnAt = 0; this.spawnGroup(g, now); this.dirty = true; } else g.respawnAt = now + 20000;
      }
    }
    if (this.kind === 'arena') this.syncProxies(now);
    for (const p of [...this.players.values()]) this.tickPlayer(p, now, dt);
    this.tickDoors();
    const pl = [...this.players.values()];
    this.tickWorldEvent(now);
    for (const e of [...this.enemies.values()]) {
      if (!this.enemies.has(e.id) || e.pvp) continue;
      // en el mundo sólo se mueven los enemigos cerca de algún héroe
      if (this.kind === 'world' && !pl.some((p) => cheb(p, e) <= 28)) continue;
      this.tickEnemy(e, now, dt);
    }
    this.tickPets(now);
    this.tickProjectiles(now);
    this.tickTeles(now);
    this.tickAuras(now);
    if (this.dirty && now - this.lastFlush >= FLUSH_MS) this.flush();
  }

  tickPlayer(p, now, dt) {
    const c = p.user.combat;
    // regeneración (más rápida fuera de combate)
    const calm = now - p.lastHurt > 5000 ? 2.5 : 1;
    const regen = p.d.hpRegen * calm * (p.regenUntil > now ? 5 : 1);
    if (c.hp < p.d.hp) { c.hp = Math.min(p.d.hp, c.hp + regen * dt); this.privDirty(p); }
    if (c.en < p.d.en) { c.en = Math.min(p.d.en, c.en + p.d.enRegen * dt); this.privDirty(p); }
    for (const [k, b] of Object.entries(p.tbuffs)) if (b.until <= now) { delete p.tbuffs[k]; this.dirty = true; }
    // zonas del mundo: la corrupción castiga a quien no tiene nivel para estar ahí
    if (this.def.zones) {
      const z = Number(this.def.zones[p.y * this.w + p.x]) || 0;
      const Z = RULES.ZONES[z];
      if (z !== p.zone) {
        p.zone = z;
        if (p.d.level < Z.lv[0] - 2) this.whisper(p, `☠️ La corrupción de ${Z.name} (nivel ${Z.lv[0]}-${Z.lv[1]}) es demasiado fuerte para ti. ¡Vuelve atrás!`);
      }
      if (p.d.level < Z.lv[0] - 2 && (!p.corruptAt || now >= p.corruptAt)) {
        p.corruptAt = now + 1000;
        this.hurtPlayer(p, p.d.hp * 0.05 * (Z.lv[0] - 2 - p.d.level > 4 ? 2 : 1), { name: 'Corrupción', magic: true, kind: 'corrupt' });
        if (!this.players.has(p.user.id)) return;
      }
    }
    if (p.stunUntil > now) return;
    if (this.duel && now < this.duel.startAt) return; // cuenta atrás del duelo
    if (p.fishing) {
      const f = p.fishing;
      if (!f.bit && now >= f.biteAt) { f.bit = now; this.hooks.send(p.user, { t: 'dbite' }); this.event({ e: 'bite', id: p.user.id }); }
      else if (f.bit && now - f.bit > 1400) { p.fishing = null; this.event({ e: 'fishend', id: p.user.id }); this.whisper(p, 'El pez se ha escapado…'); }
      return;
    }
    if (p.gatherTo) {
      const h = this.herbs.get(p.gatherTo);
      if (!h) p.gatherTo = null;
      else if (cheb(p, h) <= 1) this.takeHerb(p, h);
    }
    if (p.talkTo) {
      const n = this.npcs.find((x) => x.id === p.talkTo);
      if (!n) p.talkTo = null;
      else if (cheb(p, n) <= 2) { p.talkTo = null; p.goal = null; p.path = []; this.hooks.talk(p.user, n); }
    }

    if (p.pending) this.tryPending(p, now);
    // atacar al objetivo si está a tiro
    if (p.target) {
      const t = this.enemies.get(p.target);
      if (!t) p.target = null;
      else if (this.inReach(p, t, p.d.weapon.range)) {
        if (now >= p.nextAttack) this.weaponAttack(p, t, now);
        if (p.d.weapon.kind === 'melee' || cheb(p, t) <= p.d.weapon.range) return; // quieto mientras pega
      }
    }
    if (now < p.nextStep) return;
    let step = null;
    if (p.kdir) {
      const [dx, dy] = p.kdir;
      const tries = dx && dy ? [[dx, dy], [dx, 0], [0, dy]] : [[dx, dy], ...(dx ? [[dx, 1], [dx, -1]] : [[1, dy], [-1, dy]])];
      for (const [sx, sy] of tries) {
        const nx = p.x + sx, ny = p.y + sy;
        if (this.freeForPlayer(nx, ny) && this.noCorner(p.x, p.y, sx, sy)) { step = [sx, sy]; break; }
        const ch = this.chestAt(nx, ny);
        if (ch && sx === dx && sy === dy) { this.openChest(p, ch); p.nextStep = now + 250; return; }
      }
    } else {
      const goal = p.pending ? this.pendingPoint(p) : p.target ? this.enemies.get(p.target) : p.goal;
      if (goal) {
        // el camino no pisa portales (pueblo, cuevas, piedras) salvo que sean el destino
        const passable = (x, y) => this.freeForPlayer(x, y) && !(DUNGEON.TILES[this.tile(x, y)] || {}).portal;
        if (!p.path.length || p.pathGoal !== goal.x + ',' + goal.y) { p.path = this.path(p, goal, passable); p.pathGoal = goal.x + ',' + goal.y; }
        while (p.path.length && p.path[0].x === p.x && p.path[0].y === p.y) p.path.shift();
        const n = p.path[0];
        if (n) {
          const dx = n.x - p.x, dy = n.y - p.y;
          const ch = this.chestAt(n.x, n.y);
          if (ch && !ch.open && Math.max(Math.abs(dx), Math.abs(dy)) === 1) { this.openChest(p, ch); p.path = []; p.goal = null; p.nextStep = now + 250; return; }
          if (Math.max(Math.abs(dx), Math.abs(dy)) === 1 && this.freeForPlayer(n.x, n.y) && this.noCorner(p.x, p.y, dx, dy)) step = [dx, dy];
          else p.path = this.path(p, goal, passable); // algo se cruzó: se busca otro camino
        } else if (p.goal && !p.target && !p.pending) p.goal = null;
      }
    }
    if (!step) return;
    const [dx, dy] = step;
    const speed = (p.mounted && p.mount ? 1 / (1 + p.mount.speed / 100) : 1) * (p.slowUntil > now ? 1.8 : 1) / (1 + this.buffSum(p, 'haste') / 100);
    p.sm = Math.round(p.d.moveMs * (dx && dy ? 1.41 : 1) * speed);
    p.nextStep = now + p.sm;
    p.x += dx; p.y += dy;
    p.dir = dirName(dx, dy);
    this.dirty = true;
    this.onEnter(p);
  }

  pendingPoint(p) {
    const pd = p.pending;
    if (pd.target) return this.enemies.get(pd.target) || this.players.get(pd.target) || null;
    if (pd.x !== null) return { x: pd.x, y: pd.y };
    return null;
  }

  inReach(p, t, range) { const d = cheb(p, t); return d <= range && (d <= 1 || this.los(p, t)); }

  onEnter(p) {
    const ch = this.tile(p.x, p.y);
    const T = DUNGEON.TILES[ch];
    if (T && T.trap) {
      const dmg = Math.round((3 + this.level * 2.5) * (0.8 + rnd() * 0.4));
      this.hurtPlayer(p, dmg, { name: 'Pinchos' });
      if (!this.players.has(p.user.id)) return;
    }
    if (T && T.portal === 'tavern') return this.leaveTo(p, 'town');
    if (T && T.portal === 'waystone') {
      const ws = this.waystones.find((w) => w.x === p.x && w.y === p.y);
      if (ws && this.hooks.waystone) this.hooks.waystone(p.user, ws);
    }
    if (T && T.portal === 'dungeon') {
      const cave = (this.def.caves || []).find((c) => c.x === p.x && c.y === p.y);
      if (cave) { this.players.delete(p.user.id); this.event({ e: 'leave', id: p.user.id }); return this.hooks.portal(p.user, cave, { x: p.x, y: p.y + 1 }); }
    }
    for (const l of [...this.loot.values()]) if (l.x === p.x && l.y === p.y) this.pickUp(p, l);
    for (const h of this.herbs.values()) if (h.x === p.x && h.y === p.y && h.readyAt <= Date.now()) this.takeHerb(p, h);
    if (this.portal && p.x === this.portal.x && p.y === this.portal.y) {
      const r = { xp: Math.round(40 * this.level * (1 + 0.1 * this.level)), gold: Math.round(30 + 12 * this.level) };
      this.hooks.reward(p.user, r.xp, r.gold);
      this.event({ e: 'loot', id: p.user.id, gold: r.gold, xp: r.xp, x: p.x, y: p.y });
      if (this.def.descent && this.hooks.nextFloor) {
        this.players.delete(p.user.id); this.pets.delete(p.user.id);
        this.event({ e: 'leave', id: p.user.id });
        return this.hooks.nextFloor(p.user, this.def.descent, r);
      }
      if (this.hooks.track) this.hooks.track(p.user, 'dungeon', {});
      this.leaveTo(p, 'win', r);
    }
  }

  pickUp(p, l) {
    if (l.gold) { this.hooks.reward(p.user, 0, l.gold); this.event({ e: 'loot', id: p.user.id, gold: l.gold, x: l.x, y: l.y }); this.loot.delete(l.id); return; }
    if (l.mat) {
      if (this.hooks.giveMat) this.hooks.giveMat(p.user, l.mat, l.n || 1);
      this.event({ e: 'loot', id: p.user.id, mat: l.mat, n: l.n || 1, x: l.x, y: l.y }); this.loot.delete(l.id); return;
    }
    if (l.cons) {
      if (!this.hooks.giveCons(p.user, l.cons, l.n || 1)) return;
      this.event({ e: 'loot', id: p.user.id, cons: l.cons, x: l.x, y: l.y }); this.loot.delete(l.id); return;
    }
    if (l.item) {
      if (!this.hooks.give(p.user, l.item)) { if (!l.warned) { l.warned = true; this.whisper(p, 'Tu inventario está lleno. Vende o tira algo.'); } return; }
      this.event({ e: 'loot', id: p.user.id, item: { name: l.item.name, rarity: l.item.rarity }, x: l.x, y: l.y });
      this.hooks.send(p.user, { t: 'dgot', item: l.item });
      this.loot.delete(l.id);
    }
  }

  dropAt(x, y, what) {
    // cada cosa en su casilla libre más cercana
    const taken = (a, b) => [...this.loot.values()].some((l) => l.x === a && l.y === b);
    const pos = this.freeNear(x, y, (a, b) => this.walkTile(a, b) && !taken(a, b) && !this.chestAt(a, b) && this.tile(a, b) !== '^');
    const id = 'l' + ++this.seq;
    this.loot.set(id, { id, x: pos.x, y: pos.y, ...what });
    this.dirty = true;
  }

  openChest(p, ch) {
    if (ch.open) return;
    ch.open = true;
    const gold = Math.round(randInt(12, 25) * (1 + 0.4 * (this.level - 1)));
    this.dropAt(ch.x, ch.y, { gold });
    for (const it of RULES.rollLoot(rnd, { ilvl: this.level, mf: p.d.mf, classes: this.partyClasses(), chest: true })) this.dropAt(ch.x, ch.y, { item: it });
    if (rnd() < 0.5) this.dropAt(ch.x, ch.y, { cons: rnd() < 0.7 ? 'pocion-vida-p' : 'pocion-energia' });
    this.event({ e: 'chest', id: ch.id, by: p.user.id, x: ch.x, y: ch.y });
    if (this.hooks.track) this.hooks.track(p.user, 'chest', {});
  }

  leaveTo(p, reason, info) {
    this.players.delete(p.user.id);
    for (const e of this.enemies.values()) if (e.aggro === p.user.id) e.aggro = null;
    this.event({ e: 'leave', id: p.user.id });
    this.hooks.exit(p.user, reason, info);
  }

  heal(p, amount, source) {
    const c = p.user.combat;
    const before = c.hp;
    c.hp = Math.min(p.d.hp, c.hp + amount);
    const got = Math.round(c.hp - before);
    if (got > 0) this.event({ e: 'heal', id: p.user.id, amount: got, source });
    this.privDirty(p);
  }

  privDirty(p) { p.privDirty = true; this.dirty = true; }

  // ---------- Ataques de los héroes ----------
  buffSum(p, k) { let v = 0; for (const b of Object.values(p.tbuffs)) v += (b[k] || 0); return v; }

  // Tirada de daño con el arma o con hechizos (con bufos de grupo y Bendición de fuerza ya en la ficha)
  weaponRoll(p) { return roll(p.d.dmg) * (1 + this.buffSum(p, 'dmgPct') / 100); }
  spellRoll(p) { return roll(p.d.spell) * (1 + this.buffSum(p, 'dmgPct') / 100); }

  weaponAttack(p, t, now) {
    const d = p.d;
    p.dir = dirName(t.x - p.x, t.y - p.y);
    p.nextAttack = now + d.atkMs / (1 + this.buffSum(p, 'haste') / 100);
    const chance = Math.max(55, Math.min(99, 90 + d.hit - 4 * Math.max(0, t.m.level - d.level)));
    const kind = d.weapon.kind;
    if (rnd() * 100 >= chance) { this.event({ e: 'hit', by: p.user.id, t: t.id, miss: true, kind }); return; }
    this.damageEnemy(p, t, this.weaponRoll(p), { kind, magic: kind === 'magic', undead: (d.undead || 0) / 100, elem: this.elemRoll(p) });
    // legendario «Trueno»: cada cuarto golpe cae un rayo que salta a dos enemigos más
    if (d.leg && d.leg.trueno && (p.legHits = (p.legHits || 0) + 1) % 4 === 0) {
      const dmg = this.weaponRoll(p) * 1.5;
      const hit = [t, ...this.enemiesNear(t, 3, p).filter((o) => o !== t).sort((a, b) => cheb(a, t) - cheb(b, t)).slice(0, 2)];
      let from = { x: t.x, y: t.y - 4 };
      for (const o of hit) {
        if (!this.enemies.has(o.id)) continue;
        this.event({ e: 'fx', kind: 'bolt', from, to: { x: o.x, y: o.y }, color: '#fff27a' });
        this.damageEnemy(p, o, o === t ? dmg : dmg * 0.6, { magic: true, name: 'Trueno', fx: 'lightning', chain: true });
        from = { x: o.x, y: o.y };
      }
      this.event({ e: 'leg', id: p.user.id, name: '🌩️ Trueno' });
    }
  }

  // Daño elemental del arma (como en Diablo 2): fuego, frío (ralentiza), rayo y veneno (en 3 s); no lo para la armadura
  elemRoll(p) {
    const el = p.d.elem || {};
    const keys = Object.keys(el);
    if (!keys.length) return null;
    const out = { dmg: 0, slow: false, poison: 0 };
    for (const k of keys) {
      const v = roll(el[k]);
      if (k === 'veneno') out.poison += v;
      else out.dmg += v;
      if (k === 'frio') out.slow = true;
    }
    return out;
  }

  // Aplica el daño a un enemigo: crítico, debilidad (marca), armadura, robo de vida
  damageEnemy(p, e, base, o = {}) {
    if (!this.enemies.has(e.id)) return 0;
    let dmg = base;
    let crit = false;
    if (!o.noCrit && (p.critNext || rnd() * 100 < p.d.crit)) { crit = true; dmg *= p.d.critMult; p.critNext = false; }
    if (e.vulnUntil > Date.now()) dmg *= 1 + e.vuln / 100;
    if (o.undead && e.m.undead) dmg *= 1 + o.undead;
    dmg *= 1 - RULES.reduction(o.magic ? e.m.armor * 0.5 : e.m.armor, p.d.level);
    if (o.elem) {
      dmg += o.elem.dmg;
      if (o.elem.slow && !e.pvp) e.slowUntil = Math.max(e.slowUntil, Date.now() + RULES.ELEMENTS.frio.slow);
      if (o.elem.poison > 0 && !e.pvp) e.dots.push({ by: p.user.id, per: o.elem.poison / 3, left: 3, next: Date.now() + 1000 });
    }
    if (e.pvp) {
      // duelo: el golpe va al héroe rival (ya reducido por su armadura)
      const t = this.players.get(e.owner);
      if (!t || this.duelOver) return 0;
      const before = t.user.combat.hp;
      this.hurtPlayer(t, dmg * PVP_MULT * (o.magic ? 1 - t.d.magicRes / 100 : 1), { by: p.user.id, raw: true, canDodge: o.kind === 'melee' || o.kind === 'ranged', kind: o.kind || 'ability', crit, name: o.name || null });
      const dealt = Math.max(0, before - t.user.combat.hp);
      const ls = p.d.lifesteal / 100 + (o.leech || 0);
      if (ls > 0 && dealt > 0) this.heal(p, Math.max(1, Math.round(dealt * ls)), o.leech ? o.name : 'Robo de vida');
      return dealt;
    }
    dmg = Math.max(1, Math.round(dmg));
    e.hp -= dmg;
    e.hitters.add(p.user.id);
    e.aggro = e.aggro || p.user.id;
    this.wakePack(e, p.user.id);
    this.event({ e: 'hit', by: p.user.id, t: e.id, dmg, crit, kind: o.kind || 'ability', fx: o.fx || null, name: o.name || null });
    const ls = p.d.lifesteal / 100 + (o.leech || 0);
    if (ls > 0) this.heal(p, Math.max(1, Math.round(dmg * ls)), o.leech ? o.name : 'Robo de vida');
    // legendario «Rebote»: lo que va a distancia salta a otro enemigo cercano
    if (!o.chain && p.d.leg && p.d.leg.rebote && (o.kind === 'ranged' || o.kind === 'magic' || o.magic)) {
      const next = this.enemiesNear(e, 3, p).filter((x) => x !== e && this.los(e, x)).sort((a, b) => cheb(a, e) - cheb(b, e))[0];
      if (next) { this.event({ e: 'fx', kind: 'bolt', from: { x: e.x, y: e.y }, to: { x: next.x, y: next.y }, color: '#9ad8ff' }); this.damageEnemy(p, next, base * 0.6, { ...o, chain: true, noCrit: true, name: 'Rebote' }); }
    }
    if (e.hp <= 0) this.killEnemy(p, e);
    return dmg;
  }

  // ---------- Habilidades ----------
  tryPending(p, now) {
    const pd = p.pending;
    const ab = pd.ab;
    const c = p.user.combat;
    const target = pd.target ? (this.enemies.get(pd.target) || this.players.get(pd.target)) : null;
    if (pd.target && !target) { p.pending = null; return; }
    const range = ab.kind === 'strike' ? p.d.weapon.range : ab.range || 0;
    const self = ['nova', 'buff', 'healAll', 'aura'].includes(ab.kind);
    const needsEnemy = ['strike', 'bolt', 'mark', 'dash', 'blink'].includes(ab.kind);
    let enemy = target && this.enemies.has(target.id) ? target : null;
    if (needsEnemy && !enemy) {
      enemy = p.target && this.enemies.get(p.target) || this.nearestEnemy(p, Math.max(range, 1));
      if (!enemy) { p.pending = null; return this.whisper(p, 'Elige un enemigo.'); }
      pd.target = enemy.id;
    }
    let point = null;
    if (!self) {
      if (ab.kind === 'heal') point = target && !this.enemies.has(target.id) ? target : p;
      else point = enemy || (pd.x !== null ? { x: pd.x, y: pd.y } : null);
      if (!point) { const e = this.nearestEnemy(p, range); if (!e) { p.pending = null; return this.whisper(p, 'No hay enemigos a tiro.'); } point = e; pd.target = e.id; enemy = e; }
      const dist = cheb(p, point);
      const reach = ab.kind === 'dash' || ab.kind === 'blink' ? range : range;
      if (dist > reach || (dist > 1 && !this.los(p, point))) return; // hay que acercarse (tickPlayer anda hacia el punto)
    }
    // ¡se lanza!
    p.pending = null;
    c.en -= ab.cost;
    c.cds[ab.id] = now + ab.cd * FAST * (1 - p.d.cdr / 100);
    // legendario «Eco»: a veces la habilidad sale gratis
    if (p.d.leg && p.d.leg.eco && rnd() < 0.25) { c.en += ab.cost; c.cds[ab.id] = now + 300; this.event({ e: 'leg', id: p.user.id, name: '🔁 Eco' }); }
    p.nextAttack = Math.max(p.nextAttack, now + 350);
    if (point) p.dir = dirName(point.x - p.x, point.y - p.y) || p.dir;
    this.event({ e: 'cast', by: p.user.id, name: ab.name, id: ab.id });
    const dmgFor = () => (ab.weapon || ab.kind === 'strike' ? this.weaponRoll(p) : this.spellRoll(p)) * (ab.mult || 1);
    const magic = !(ab.weapon || ab.kind === 'strike');
    const color = { fire: '#ff7a2a', cold: '#9ad8ff', holy: '#fff2a0', void: '#a05aff', blood: '#ff3a4a', lightning: '#fff27a' }[ab.fx] || '#ffffff';
    switch (ab.kind) {
      case 'strike': {
        let mult = 1;
        if (ab.flank && [...this.players.values()].some((o) => o !== p && cheb(o, enemy) <= 1)) mult += ab.flank;
        const dealt = this.damageEnemy(p, enemy, dmgFor() * mult, { name: ab.name, leech: ab.leech, kind: 'ability' });
        if (ab.dot && this.enemies.has(enemy.id)) this.addDot(p, enemy, this.weaponRoll(p) * ab.dot, ab.dur);
        if (ab.stun && this.enemies.has(enemy.id)) enemy.stunUntil = now + ab.stun;
        void dealt;
        break;
      }
      case 'bolt': {
        for (let i = 0; i < (ab.count || 1) && this.enemies.has(enemy.id); i++) {
          this.event({ e: 'fx', kind: 'bolt', from: { x: p.x, y: p.y }, to: { x: enemy.x, y: enemy.y }, color, delay: i * 90 });
          this.damageEnemy(p, enemy, dmgFor(), { magic: true, name: ab.name, leech: ab.leech, undead: ab.undead, fx: ab.fx });
        }
        break;
      }
      case 'mark': {
        enemy.vuln = ab.vuln; enemy.vulnUntil = now + ab.dur;
        if (ab.dot) this.addDot(p, enemy, this.spellRoll(p) * ab.dot, ab.dur);
        this.event({ e: 'fx', kind: 'mark', x: enemy.x, y: enemy.y, id: enemy.id, color: ab.dot ? '#a05aff' : '#ff4a4a' });
        enemy.aggro = enemy.aggro || p.user.id;
        break;
      }
      case 'blast': case 'nova': {
        const c0 = ab.kind === 'nova' ? { x: p.x, y: p.y } : point;
        this.event({ e: 'fx', kind: ab.kind === 'nova' ? 'nova' : 'blast', x: c0.x, y: c0.y, radius: ab.radius, from: { x: p.x, y: p.y }, color });
        for (const e of this.enemiesNear(c0, ab.radius, p)) {
          if (ab.mult) this.damageEnemy(p, e, dmgFor(), { magic, name: ab.name, fx: ab.fx });
          if (!this.enemies.has(e.id)) continue;
          if (ab.stun) e.stunUntil = now + ab.stun;
          if (ab.slow) e.slowUntil = now + ab.slow;
          if (ab.dot) this.addDot(p, e, this.spellRoll(p) * ab.dot, ab.dur);
        }
        break;
      }
      case 'cone': {
        const dx = point.x - p.x, dy = point.y - p.y;
        const hits = [...this.enemies.values()].filter((e) => {
          if (e.owner === p.user.id) return false;
          const ex = e.x - p.x, ey = e.y - p.y, dist = Math.max(Math.abs(ex), Math.abs(ey));
          if (dist < 1 || dist > ab.range) return false;
          return (dx * ex + dy * ey) / (Math.hypot(dx, dy) * Math.hypot(ex, ey) || 1) >= 0.75 && this.los(p, e);
        }).slice(0, 6);
        for (const e of hits) { this.event({ e: 'fx', kind: 'arrow', from: { x: p.x, y: p.y }, to: { x: e.x, y: e.y } }); this.damageEnemy(p, e, dmgFor(), { name: ab.name, kind: 'ranged' }); }
        break;
      }
      case 'line': {
        const len = Math.hypot(point.x - p.x, point.y - p.y) || 1;
        const hit = new Set();
        let end = { x: p.x, y: p.y };
        for (let i = 1; i <= ab.range; i++) {
          const x = Math.round(p.x + (point.x - p.x) / len * i), y = Math.round(p.y + (point.y - p.y) / len * i);
          if (OPAQUE.has(this.tile(x, y))) break;
          end = { x, y };
          const e = this.enemyAt(x, y);
          if (e && !hit.has(e.id)) hit.add(e.id);
        }
        this.event({ e: 'fx', kind: 'arrow', from: { x: p.x, y: p.y }, to: end, pierce: true });
        for (const id of hit) { const e = this.enemies.get(id); if (e) this.damageEnemy(p, e, dmgFor(), { name: ab.name, kind: 'ranged' }); }
        break;
      }
      case 'heal': {
        const t = point && this.players.get(point.user ? point.user.id : '') || p;
        this.heal(t, Math.round((t.d.hp * ab.pct + roll(p.d.spell) * 0.5) * p.d.healPow), ab.name);
        this.event({ e: 'fx', kind: 'heal', x: t.x, y: t.y });
        break;
      }
      case 'healAll': {
        for (const o of this.players.values()) if (cheb(o, p) <= ab.radius) { this.heal(o, Math.round(o.d.hp * ab.pct * p.d.healPow), ab.name); this.event({ e: 'fx', kind: 'heal', x: o.x, y: o.y }); }
        this.event({ e: 'fx', kind: 'nova', x: p.x, y: p.y, radius: ab.radius, color: '#7dff8a' });
        break;
      }
      case 'buff': {
        for (const o of this.players.values()) if (cheb(o, p) <= ab.radius) o.tbuffs[ab.id] = { ...ab.buff, until: now + ab.dur };
        this.event({ e: 'fx', kind: 'nova', x: p.x, y: p.y, radius: ab.radius, color: ab.buff.dr ? '#7ad0ff' : '#ff6a3a' });
        break;
      }
      case 'aura': {
        this.auras.push({ owner: p.user.id, radius: ab.radius, mult: ab.mult, until: now + ab.dur, next: now + 1000, name: ab.name });
        this.event({ e: 'fx', kind: 'aura', id: p.user.id, until: ab.dur, radius: ab.radius });
        break;
      }
      case 'dash': case 'blink': {
        // casilla libre junto al objetivo (para el paso sombrío, por detrás)
        const options = DIRS.map(([dx, dy]) => ({ x: enemy.x + dx, y: enemy.y + dy })).filter((s) => this.freeForPlayer(s.x, s.y));
        if (!options.length) break;
        options.sort((a, b) => (ab.kind === 'blink' ? cheb(b, p) - cheb(a, p) : cheb(a, p) - cheb(b, p)));
        const from = { x: p.x, y: p.y };
        p.x = options[0].x; p.y = options[0].y; p.sm = 120; p.path = [];
        this.event({ e: 'fx', kind: ab.kind, from, to: { x: p.x, y: p.y }, id: p.user.id });
        if (ab.kind === 'blink') p.critNext = true;
        else { this.damageEnemy(p, enemy, dmgFor(), { name: ab.name }); if (this.enemies.has(enemy.id)) enemy.stunUntil = now + ab.stun; }
        p.target = enemy.id;
        this.onEnter(p);
        break;
      }
    }
    this.sendPrivate(p);
  }

  addDot(p, e, total, dur) {
    const ticks = Math.max(1, Math.round(dur / 1000));
    e.dots.push({ by: p.user.id, per: total / ticks, left: ticks, next: Date.now() + 1000 });
  }

  tickAuras(now) {
    for (let i = this.auras.length - 1; i >= 0; i--) {
      const a = this.auras[i];
      const p = this.players.get(a.owner);
      if (!p || now > a.until) { this.auras.splice(i, 1); continue; }
      if (now < a.next) continue;
      a.next = now + 1000;
      for (const e of this.enemiesNear(p, a.radius, p)) this.damageEnemy(p, e, this.spellRoll(p) * a.mult, { magic: true, name: a.name, noCrit: true, fx: 'holy' });
    }
  }

  // ---------- Muerte de un enemigo: experiencia, oro y botín ----------
  partyClasses() {
    const list = [...this.players.values()];
    if (!list.length) return [];
    const p = list[Math.floor(rnd() * list.length)];
    return [p.d.cls];
  }

  killEnemy(p, e) {
    this.enemies.delete(e.id);
    if (e.group) { e.group.alive.delete(e.id); if (!e.group.alive.size) e.group.respawnAt = Date.now() + RESPAWN_MS; }
    const party = [...this.players.values()];
    const total = e.summoned ? e.m.xp / 3 : e.m.xp;
    const share = total * (1 + 0.2 * (party.length - 1)) / Math.max(1, party.length);
    let shown = 0;
    for (const o of party) {
      const xp = Math.max(1, Math.round(share * RULES.xpPenalty(o.d.level, e.m.level)));
      if (o === p) shown = xp;
      this.hooks.reward(o.user, xp, 0);
      const pet = this.pets.get(o.user.id);
      if (pet && pet.downUntil <= Date.now() && this.hooks.petXp && (this.kind !== 'world' || cheb(o, e) <= 20)) this.hooks.petXp(o.user, Math.max(1, Math.round(xp * 0.6)));
    }
    this.event({ e: 'die', id: e.id, k: e.k, x: e.x, y: e.y, by: p.user.id, xp: shown || Math.round(share), boss: e.m.boss || undefined, elite: e.m.elite || undefined });
    // poderes legendarios al matar
    const L = p.d.leg || {};
    if (L.sed) this.heal(p, Math.max(1, Math.round(p.d.hp * 0.06)), 'Sed de sangre');
    if (L.frenesi) { p.tbuffs.frenesi = { haste: 30, until: Date.now() + 4000 }; this.sendPrivate(p); }
    if (L.estallido && !this.blasting) {
      this.blasting = true; // los que mueren por el estallido no vuelven a estallar
      this.event({ e: 'fx', kind: 'nova', x: e.x, y: e.y, radius: 1, color: '#ff8a1a' });
      for (const o of this.enemiesNear(e, 1, p)) if (o !== e) this.damageEnemy(p, o, e.maxHp * 0.3, { magic: true, noCrit: true, name: 'Estallido', chain: true });
      this.blasting = false;
    }
    const info = { elite: e.m.elite, boss: e.m.boss, world: !!e.wb, fam: (RULES.MONSTERS[e.k] || {}).fam };
    if (this.hooks.kill) for (const o of party) if (this.kind !== 'world' || cheb(o, e) <= 20) this.hooks.kill(o.user, e.k, info);
    // desafío «cadáveres explosivos» (o zombis hinchados): estallan al rato
    if ((this.mod === 'explosivos' || e.m.explode) && !e.m.boss) {
      const cells = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (this.walkTile(e.x + dx, e.y + dy)) cells.push([e.x + dx, e.y + dy]);
      const id = 't' + ++this.seq;
      this.teles.push({ id, by: e.id, orphan: true, cells, at: Date.now() + 900, dmg: roll(e.m.dmg) * 1.6, magic: true, level: e.m.level, kind: 'nova' });
      this.event({ e: 'tele', id, kind: 'nova', cells, dur: 900 });
    }
    // jefe de mundo: recompensa para todos los que le hicieron daño
    if (e.wb) {
      this.worldBoss = null;
      this.nextEventAt = Date.now() + (EVENT_MS || PROG.WORLD_EVENT.everyMs);
      for (const o of [...this.enemies.values()]) if (o.summoned) { this.enemies.delete(o.id); this.event({ e: 'die', id: o.id, k: o.k, x: o.x, y: o.y, xp: 0 }); }
      const heroes = [...e.hitters].map((id) => this.players.get(id)).filter(Boolean);
      if (this.hooks.worldBoss) this.hooks.worldBoss(heroes.map((h) => h.user), e.m, p.user);
    }
    if (e.summoned) return;
    for (const md of PROG.matDrops(rnd, e.m)) this.dropAt(e.x, e.y, md);
    let gold = randInt(e.m.gold[0], e.m.gold[1]);
    if (this.mod === 'sobrios') gold = Math.round(gold * 1.5);
    if (gold > 0) this.dropAt(e.x, e.y, { gold });
    const items = RULES.rollLoot(rnd, { ilvl: e.m.level, mf: p.d.mf, classes: this.partyClasses(), elite: e.m.elite, boss: e.m.boss, sets: e.m.sets });
    for (const it of items) this.dropAt(e.x, e.y, { item: it });
    if (rnd() < (e.m.boss ? 1 : 0.08)) this.dropAt(e.x, e.y, { cons: e.m.boss ? 'pocion-vida-g' : 'pocion-vida-p', n: 1 });
    if (e.m.boss && this.kind === 'dungeon') {
      this.bossDead = true;
      const spot = this.freeNear(e.x, e.y, (a, b) => this.walkTile(a, b) && ![...this.loot.values()].some((l) => l.x === a && l.y === b));
      this.portal = spot;
      this.event({ e: 'portal', x: spot.x, y: spot.y, name: e.m.name });
      // el resto de la sala huye: no queda nadie que pelee por su señor
      for (const o of [...this.enemies.values()]) if (o.summoned) { this.enemies.delete(o.id); this.event({ e: 'die', id: o.id, k: o.k, x: o.x, y: o.y, xp: 0 }); }
    }
  }

  // ---------- Daño a los héroes ----------
  hurtPlayer(p, dmg, o = {}) {
    const c = p.user.combat;
    const now = Date.now();
    p.lastHurt = now;
    if (p.iframeUntil > now && o.kind !== 'corrupt') { this.event({ e: 'hit', by: o.by || null, t: p.user.id, dodge: true }); return; }
    if (o.canDodge && rnd() * 100 < p.d.dodge) { this.event({ e: 'hit', by: o.by || null, t: p.user.id, dodge: true }); return; }
    if (o.raw) { /* ya viene reducido (duelos) */ } else if (o.magic) dmg *= 1 - p.d.magicRes / 100;
    else if (o.level) dmg *= 1 - RULES.reduction(p.d.armor, o.level);
    let blocked = false;
    if (!o.magic && p.d.block && rnd() * 100 < p.d.block) { dmg *= 0.35; blocked = true; }
    dmg *= 1 - Math.min(60, this.buffSum(p, 'dr')) / 100;
    dmg = Math.max(1, Math.round(dmg));
    // legendario «Égida»: el escudo absorbe primero
    if (p.shield > 0) { const a = Math.min(p.shield, dmg); p.shield -= a; dmg -= a; if (p.shield <= 0) p.shield = 0; }
    c.hp -= dmg;
    if (p.d.leg && p.d.leg.egida && c.hp > 0 && c.hp < p.d.hp * 0.3 && Date.now() >= (p.egidaReady || 0)) {
      p.shield = Math.round(p.d.hp * 0.35); p.egidaReady = Date.now() + 45000;
      this.event({ e: 'fx', kind: 'aura', id: p.user.id, until: 2500, radius: 1 });
      this.event({ e: 'leg', id: p.user.id, name: '🛡️ Égida' });
    }
    p.fishing = null;
    this.event({ e: 'hit', by: o.by || null, t: p.user.id, dmg, crit: o.crit || undefined, block: blocked || undefined, name: o.name || null, kind: o.kind || 'melee' });
    // desafío «sed de sangre»: el enemigo se cura con lo que hiere
    if (this.mod === 'vampiros' && o.by) { const e = this.enemies.get(o.by); if (e) { const h = Math.round(dmg * 0.3); e.hp = Math.min(e.maxHp, e.hp + h); this.event({ e: 'eheal', id: e.id, by: e.id, amount: h }); } }
    this.privDirty(p);
    if (c.hp > 0) return;
    c.hp = 0;
    this.event({ e: 'down', id: p.user.id });
    if (this.kind === 'arena') {
      // el duelo acaba: nadie muere de verdad en el sótano de Alfonso
      if (this.duelOver) return;
      this.duelOver = true;
      c.hp = 1;
      if (this.hooks.duelEnd) setTimeout(() => this.hooks.duelEnd(p.user, this), 900);
      return;
    }
    this.leaveTo(p, 'down');
  }

  // ---------- Monstruos ----------
  wakePack(e, userId) {
    if (!e.pack) return;
    for (const o of this.enemies.values()) if (o.pack === e.pack && !o.aggro && cheb(o, e) <= 8) o.aggro = userId;
  }

  // venenos y quemaduras
  tickDots(e, now) {
    for (let i = e.dots.length - 1; i >= 0; i--) {
      const d = e.dots[i];
      if (now < d.next) continue;
      d.next += 1000; d.left--;
      const p = this.players.get(d.by);
      if (p) this.damageEnemy(p, e, d.per, { noCrit: true, magic: true, kind: 'dot' });
      else { e.hp -= Math.round(d.per); this.dirty = true; }
      if (d.left <= 0) e.dots.splice(i, 1);
      if (!this.enemies.has(e.id)) return false;
    }
    return true;
  }

  tickEnemy(e, now, dt) {
    const m = e.m;
    if (!this.tickDots(e, now)) return;
    if (m.regen && e.hp < e.maxHp) { e.hp = Math.min(e.maxHp, e.hp + m.regen * dt); }
    if (e.stunUntil > now) return;

    // objetivo
    let target = e.aggro && this.players.get(e.aggro);
    if (target && (cheb(e, target) > LEASH || this.inSafe(target))) { target = null; e.aggro = null; }
    if (!target) {
      let best = Infinity;
      for (const p of this.players.values()) {
        const d = cheb(e, p);
        if (d < best && d <= AGGRO && this.los(e, p) && !this.inSafe(p)) { best = d; target = p; }
      }
      if (target) { e.aggro = target.user.id; this.wakePack(e, target.user.id); }
    }
    if (!target) {
      if (now >= e.nextStep && cheb(e, e.home) > 2) { this.enemyStep(e, e.home, now, 2); }
      return;
    }
    const dist = cheb(e, target);
    const sees = dist <= 1 || this.los(e, target);

    // especiales de los jefes
    if (m.boss && now >= e.nextSpecial) { this.bossSpecial(e, target, now); return; }
    if (m.summons && (m.ai === 'summoner') && now >= e.nextSummon) {
      e.nextSummon = now + 8000;
      this.summon(e, m.summons, 1, now);
    }
    // curanderos
    if (m.ai === 'healer' && now >= e.nextHeal) {
      const hurt = [...this.enemies.values()].find((o) => o !== e && o.hp < o.maxHp * 0.6 && cheb(o, e) <= 5);
      if (hurt) {
        e.nextHeal = now + 6000;
        const amt = Math.round(hurt.maxHp * 0.25);
        hurt.hp = Math.min(hurt.maxHp, hurt.hp + amt);
        this.event({ e: 'eheal', id: hurt.id, by: e.id, amount: amt });
        return;
      }
    }

    if (m.range > 1) {
      // a distancia: mantener entre 3 y su alcance, con línea de visión
      if (dist <= 2 && now >= e.nextStep && this.enemyFlee(e, target, now)) return;
      if ((dist > m.range || !sees) && now >= e.nextStep) { this.enemyStep(e, target, now); return; }
      if (dist <= m.range && sees && now >= e.nextAttack) this.enemyShoot(e, target, now);
      return;
    }
    // cuerpo a cuerpo (si una mascota le molesta y su objetivo no está al lado, la muerde a ella)
    const pest = e.petAggro && [...this.pets.values()].find((pt) => pt.id === e.petAggro && pt.downUntil <= now && cheb(pt, e) <= 1);
    if (pest && dist > 1 && m.range <= 1) {
      if (now >= e.nextAttack) {
        e.nextAttack = now + m.atk * (0.9 + rnd() * 0.2);
        e.dir = dirName(pest.x - e.x, pest.y - e.y);
        this.event({ e: 'swing', id: e.id, t: pest.id });
        this.hurtPet(pest, roll(m.dmg), { by: e.id, magic: m.magic });
      }
      return;
    }
    if (dist <= 1 && this.noCorner(e.x, e.y, Math.sign(target.x - e.x), Math.sign(target.y - e.y))) {
      if (now >= e.nextAttack) {
        e.nextAttack = now + m.atk * (0.9 + rnd() * 0.2);
        e.dir = dirName(target.x - e.x, target.y - e.y);
        this.event({ e: 'swing', id: e.id, t: target.user.id });
        this.hurtPlayer(target, roll(m.dmg), { by: e.id, level: m.level, canDodge: true, magic: m.magic, kind: 'melee' });
      }
      return;
    }
    if (now >= e.nextStep) this.enemyStep(e, target, now);
  }

  stepMs(e, now) { return Math.round(e.m.ms * (e.slowUntil > now ? 2 : 1)); }

  enemyStep(e, target, now, stopAt = 1) {
    if (cheb(e, target) <= stopAt - 1) return false;
    let move = null, moveD = cheb(e, target) - (stopAt > 1 ? 0 : 0);
    for (const [dx, dy] of DIRS) {
      const nx = e.x + dx, ny = e.y + dy;
      if (!this.freeForEnemy(nx, ny) || !this.noCorner(e.x, e.y, dx, dy)) continue;
      const d = Math.max(Math.abs(nx - target.x), Math.abs(ny - target.y)) + (dx && dy ? 0.01 : 0);
      if (d < moveD) { moveD = d; move = [dx, dy]; }
    }
    if (!move) {
      // atasco: camino de verdad (rodeando a los demás)
      const path = this.path(e, target, (x, y) => this.freeForEnemy(x, y), 600);
      const n = path[0];
      if (n && this.freeForEnemy(n.x, n.y) && Math.max(Math.abs(n.x - e.x), Math.abs(n.y - e.y)) === 1) move = [n.x - e.x, n.y - e.y];
    }
    if (!move) { e.nextStep = now + 250; return false; }
    e.sm = Math.round(this.stepMs(e, now) * (move[0] && move[1] ? 1.41 : 1));
    e.nextStep = now + e.sm;
    e.x += move[0]; e.y += move[1]; e.dir = dirName(move[0], move[1]);
    this.dirty = true;
    return true;
  }

  enemyFlee(e, target, now) {
    let best = null, bestD = cheb(e, target);
    for (const [dx, dy] of DIRS) {
      const nx = e.x + dx, ny = e.y + dy;
      if (!this.freeForEnemy(nx, ny) || !this.noCorner(e.x, e.y, dx, dy)) continue;
      const d = Math.max(Math.abs(nx - target.x), Math.abs(ny - target.y));
      if (d > bestD && this.los({ x: nx, y: ny }, target)) { bestD = d; best = [dx, dy]; }
    }
    if (!best) return false;
    e.sm = Math.round(this.stepMs(e, now) * 1.2);
    e.nextStep = now + e.sm;
    e.x += best[0]; e.y += best[1];
    e.dir = dirName(target.x - e.x, target.y - e.y);
    this.dirty = true;
    return true;
  }

  // Proyectil hacia la casilla donde estaba el héroe: si se mueve a tiempo, lo esquiva
  enemyShoot(e, target, now, o = {}) {
    e.nextAttack = now + e.m.atk * (0.9 + rnd() * 0.2);
    e.dir = dirName(target.x - e.x, target.y - e.y);
    const to = o.to || { x: target.x, y: target.y };
    const dist = Math.max(1, Math.hypot(to.x - e.x, to.y - e.y));
    const dur = Math.round(dist * 1000 / PROJ_SPEED);
    const id = 'p' + ++this.seq;
    this.projectiles.push({ id, from: { x: e.x, y: e.y }, to, at: now + dur, by: e.id, dmg: roll(e.m.dmg) * (o.mult || 1), magic: e.m.magic, level: e.m.level, name: e.m.name, kind: e.m.proj || 'arrow' });
    this.event({ e: 'proj', id, from: { x: e.x, y: e.y }, to, dur, kind: e.m.proj || 'arrow' });
  }

  tickProjectiles(now) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      if (now < pr.at) continue;
      this.projectiles.splice(i, 1);
      const p = this.playerAt(pr.to.x, pr.to.y);
      if (p) this.hurtPlayer(p, pr.dmg, { by: pr.by, level: pr.level, magic: pr.magic, canDodge: true, kind: 'proj' });
      else { const pt = this.petAt(pr.to.x, pr.to.y); if (pt) this.hurtPet(pt, pr.dmg, { by: pr.by, magic: pr.magic, kind: 'proj' }); }
    }
  }

  // Ataques especiales de los jefes: avisan en el suelo y golpean al rato
  bossSpecial(e, target, now) {
    const m = e.m;
    const enraged = e.hp < e.maxHp * 0.35;
    e.nextSpecial = now + (enraged ? 4500 : 7000) * (0.85 + rnd() * 0.3);
    e.nextAttack = Math.max(e.nextAttack, now + 1200);
    const opts = m.specials.filter((s) => s !== 'summon' || [...this.enemies.values()].filter((o) => o.summoned).length < MAX_SUMMONS);
    const s = opts[Math.floor(rnd() * opts.length)];
    const cells = [];
    if (s === 'slam' || s === 'nova') {
      const r = s === 'slam' ? 2 : 3;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if ((dx || dy) && this.walkTile(e.x + dx, e.y + dy)) cells.push([e.x + dx, e.y + dy]);
      this.tele(e, s, cells, s === 'slam' ? 1100 : 1300, roll(m.dmg) * (s === 'slam' ? 2.2 : 1.8), s === 'nova' || m.magic, now);
    } else if (s === 'breath') {
      const dx = target.x - e.x, dy = target.y - e.y;
      for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) {
        const dist = Math.max(Math.abs(x), Math.abs(y));
        if (dist < 1 || dist > 5 || !this.walkTile(e.x + x, e.y + y)) continue;
        if ((dx * x + dy * y) / (Math.hypot(dx, dy) * Math.hypot(x, y) || 1) >= 0.6) cells.push([e.x + x, e.y + y]);
      }
      this.tele(e, s, cells, 1100, roll(m.dmg) * 2.5, true, now);
    } else if (s === 'volley') {
      for (const p of this.players.values()) {
        if (cheb(p, e) > 9 || !this.los(e, p)) continue;
        for (const [ox, oy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].slice(0, 3)) this.enemyShoot(e, p, now, { to: { x: p.x + ox, y: p.y + oy } });
      }
      e.nextAttack = now + 900;
    } else if (s === 'summon') {
      this.summon(e, m.summons, 2 + Math.floor(this.players.size / 2), now);
    } else if (s === 'charge') {
      let far = target;
      for (const p of this.players.values()) if (cheb(p, e) > cheb(far, e) && this.los(e, p)) far = p;
      const spot = DIRS.map(([dx, dy]) => ({ x: far.x + dx, y: far.y + dy })).filter((q) => this.freeForEnemy(q.x, q.y)).sort((a, b) => cheb(a, e) - cheb(b, e))[0];
      if (spot) {
        const from = { x: e.x, y: e.y };
        e.x = spot.x; e.y = spot.y; e.sm = 150;
        this.event({ e: 'fx', kind: 'dash', from, to: spot, id: e.id });
        this.hurtPlayer(far, roll(m.dmg) * 1.5, { by: e.id, level: m.level, name: 'Embestida' });
      }
    }
    this.event({ e: 'special', id: e.id, s, name: m.name });
  }

  tele(e, kind, cells, ms, dmg, magic, now) {
    const id = 't' + ++this.seq;
    this.teles.push({ id, by: e.id, cells, at: now + ms, dmg, magic, level: e.m.level, kind });
    this.event({ e: 'tele', id, kind, cells, dur: ms });
  }

  tickTeles(now) {
    for (let i = this.teles.length - 1; i >= 0; i--) {
      const t = this.teles[i];
      if (now < t.at) continue;
      this.teles.splice(i, 1);
      if (!t.orphan && !this.enemies.has(t.by)) continue;
      const set = new Set(t.cells.map(([x, y]) => x + ',' + y));
      this.event({ e: 'boom', id: t.id, kind: t.kind });
      for (const p of [...this.players.values()]) if (set.has(p.x + ',' + p.y)) this.hurtPlayer(p, t.dmg, { by: t.by, level: t.level, magic: t.magic, kind: t.kind });
      for (const pt of this.pets.values()) if (pt.downUntil <= now && set.has(pt.x + ',' + pt.y)) this.hurtPet(pt, t.dmg, { by: t.by, magic: t.magic, kind: t.kind });
    }
  }

  summon(e, k, n, now) {
    for (let i = 0; i < n; i++) {
      const spot = DIRS.map(([dx, dy]) => ({ x: e.x + dx * 2, y: e.y + dy * 2 })).concat(DIRS.map(([dx, dy]) => ({ x: e.x + dx, y: e.y + dy }))).filter((s) => this.freeForEnemy(s.x, s.y) && this.los(e, s));
      if (!spot.length) return;
      const s = spot[Math.floor(rnd() * spot.length)];
      const id = this.addEnemy(k, s.x, s.y, e.m.level, now, { summoned: true });
      const ne = this.enemies.get(id);
      ne.aggro = e.aggro; ne.nextAttack = now + 1000; ne.fromWb = !!e.wb;
      this.event({ e: 'summon', id, x: s.x, y: s.y });
    }
  }

  // ---------- Estado para los clientes ----------
  privateState(p) {
    const c = p.user.combat;
    return { hp: Math.round(c.hp), maxHp: p.d.hp, en: Math.floor(c.en), maxEn: p.d.en, cds: c.cds, now: Date.now(), nextAttack: p.nextAttack, atkMs: p.d.atkMs, tbuffs: Object.keys(p.tbuffs), crit: p.critNext };
  }

  sendPrivate(p) { p.privDirty = false; this.hooks.send(p.user, { t: 'dme', ...this.privateState(p) }); }

  snapshot(viewer) {
    const now = Date.now();
    // en el mundo cada jugador recibe sólo lo que tiene cerca
    const near = viewer && this.kind === 'world' ? (o) => cheb(o, viewer) <= 26 : () => true;
    return {
      players: [...this.players.values()].map((p) => ({ id: p.user.id, name: p.user.name, title: p.user.profile && p.user.profile.title || undefined, look: p.user.look, x: p.x, y: p.y, sm: p.sm, hp: Math.round(p.user.combat.hp), maxHp: p.d.hp, dir: p.dir, lvl: p.d.level, buffs: Object.keys(p.tbuffs), mount: p.mounted && p.mount ? p.mount.type : undefined, fishing: p.fishing ? 1 : undefined, stun: p.stunUntil > now || undefined })),
      pets: [...this.pets.values()].filter((pt) => pt.downUntil <= now).map((pt) => ({ id: pt.id, owner: pt.owner, k: pt.type, name: pt.name, x: pt.x, y: pt.y, sm: pt.sm, hp: Math.round(pt.hp), maxHp: pt.maxHp, dir: pt.dir, evo: pt.evo || undefined, plvl: pt.plvl })),
      enemies: [...this.enemies.values()].filter((e) => !e.pvp && near(e)).map((e) => ({ id: e.id, k: e.k, x: e.x, y: e.y, sm: e.sm, hp: Math.max(0, Math.round(e.hp)), maxHp: e.maxHp, dir: e.dir, lvl: e.m.level, elite: e.m.elite || undefined, boss: e.m.boss || undefined, wb: e.wb || undefined, big: e.m.big || undefined, stun: e.stunUntil > now || undefined, mark: e.vulnUntil > now || undefined, summoned: e.summoned || undefined })),
      herbs: [...this.herbs.values()].filter((h) => h.readyAt <= now && near(h)).map((h) => ({ id: h.id, x: h.x, y: h.y, zone: h.zone })),
      chests: [...this.chests.values()],
      loot: [...this.loot.values()].filter(near).map((l) => ({ id: l.id, x: l.x, y: l.y, gold: l.gold ? 1 : undefined, cons: l.cons, mat: l.mat, r: l.item ? l.item.rarity : undefined, slot: l.item ? l.item.slot : undefined, name: l.item ? l.item.name : undefined, it: l.item || undefined })),
      portal: this.portal,
      start: this.start,
    };
  }

  flush(extraUsers = []) {
    const events = this.events;
    this.events = [];
    this.dirty = false;
    this.lastFlush = Date.now();
    const data = JSON.stringify({ t: 'dsnap', ...this.snapshot(), events });
    if (this.kind === 'world') for (const p of this.players.values()) this.hooks.send(p.user, JSON.stringify({ t: 'dsnap', ...this.snapshot(p), events }));
    else for (const p of this.players.values()) this.hooks.send(p.user, data);
    for (const u of extraUsers) this.hooks.send(u, data);
    for (const p of this.players.values()) if (p.privDirty) this.sendPrivate(p);
  }

  // Resumen para la lista de partidas abiertas
  summary() {
    return { id: this.id, name: this.def.name, theme: this.def.theme, level: this.level, players: [...this.players.values()].map((p) => p.user.name), bossDead: this.bossDead };
  }
}

module.exports = { Instance };
