// Una partida en marcha (mazmorra o mundo abierto) con las reglas del SRD 5.2 en tiempo real:
// tiradas d20 contra CA, salvaciones contra CD, daño con dados, conjuros con espacios y monstruos con sus bloques oficiales.
const crypto = require('crypto');
const DUNGEON = require('../public/dungeon-data.js');
const RULES = require('../public/rules/engine.js');

const SRD_MONSTERS = require('../public/rules/monsters.json');
const MONSTERS = Object.fromEntries([...SRD_MONSTERS, ...DUNGEON.HOMEBREW].map((m) => [m.id, m]));

const FAST = process.env.DD_TEST_FAST ? 0.1 : 1; // las pruebas automáticas aceleran el tiempo
const MOVE_COOLDOWN = 160 * FAST;      // ms entre pasos
const ACTION_COOLDOWN = 1300 * FAST;   // ms entre acciones (un "turno")
const MONSTER_TURN = 1600 / FAST;      // ms entre ataques de un monstruo (en pruebas, casi nunca)
const SUMMON_EVERY = 7000;
const MAX_SUMMONS = 3;
const RAGE_MS = 60000;
const RESPAWN_MS = 3 * 60 * 1000;

const rng = (n) => crypto.randomInt(1, n + 1);
const randInt = (a, b) => crypto.randomInt(a, b + 1);
const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const OPAQUE = new Set(['#', 'T', 'P', 'M', 'R', 'k']);
const dirName = (dx, dy) => (Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'E' : 'W') : dy > 0 ? 'S' : 'N');
const d20 = (lucky) => { let r = rng(20); if (lucky && r === 1) r = rng(20); return r; };

// Velocidad en pies → milisegundos por casilla
function stepMs(speed) {
  const ft = Math.max(...Object.entries(speed || {}).filter(([k]) => k !== 'hover').map(([, v]) => parseInt(v, 10) || 0), 20);
  return Math.round(650 * 30 / ft);
}

// Ajuste de daño por resistencias, inmunidades y vulnerabilidades del monstruo
function adjustDamage(mon, type, amount) {
  const has = (list) => (list || []).some((s) => String(s).toLowerCase().includes(type));
  if (has(mon.immune)) return 0;
  if (has(mon.resist)) amount = Math.floor(amount / 2);
  if (has(mon.vulnerable)) amount *= 2;
  return amount;
}

class Instance {
  // def: { id, name, tiles, w, h, kind: 'dungeon'|'world', objects, groups? }
  // hooks: { send(user, msg), reward(user, xp, gold), exit(user, reason, info), portal(user, dungeonId) }
  constructor(def, hooks) {
    this.def = def;
    this.w = def.w || DUNGEON.W;
    this.h = def.h || DUNGEON.H;
    this.kind = def.kind || 'dungeon';
    this.hooks = hooks;
    this.players = new Map();
    this.enemies = new Map();
    this.chests = new Map();
    this.potions = new Map();
    this.coins = new Map();
    this.events = [];
    this.dirty = false;
    this.seq = 0;
    this.start = { x: 1, y: 1 };
    this.exit = null;
    this.groups = [];
    const now = Date.now();
    for (const o of def.objects || []) {
      const id = 'o' + ++this.seq;
      if (o.k === 'start') this.start = { x: o.x, y: o.y };
      else if (o.k === 'exit') this.exit = { x: o.x, y: o.y };
      else if (o.k === 'chest') this.chests.set(id, { id, x: o.x, y: o.y, open: false });
      else if (o.k === 'potion') this.potions.set(id, { id, x: o.x, y: o.y });
      else if (DUNGEON.enemyKey(o.k)) this.addEnemy(DUNGEON.enemyKey(o.k), o.x, o.y, now);
    }
    for (const g of def.groups || []) {
      const group = { spawn: g.spawn, alive: new Set(), respawnAt: 0 };
      this.groups.push(group);
      this.spawnGroup(group, now);
    }
  }

  get size() { return this.players.size; }

  spawnGroup(group, now) {
    for (const s of group.spawn) {
      const pos = this.freeNear(s.x, s.y);
      const id = this.addEnemy(s.k, pos.x, pos.y, now);
      if (id) { this.enemies.get(id).group = group; group.alive.add(id); }
    }
  }

  addEnemy(k, x, y, now, summoned = false) {
    const mon = MONSTERS[k];
    if (!mon) return null;
    const id = 'e' + ++this.seq;
    const combat = RULES.monsterCombat(mon);
    this.enemies.set(id, {
      id, k, x, y, hp: mon.hp, maxHp: mon.hp, dir: 'S', mon, combat, summoned,
      step: stepMs(mon.speed), nextStep: now + 500 + Math.random() * 700, nextAttack: now + 800 + Math.random() * 600, nextSummon: now + SUMMON_EVERY,
      home: { x, y },
    });
    return id;
  }

  tile(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return '#';
    return this.def.tiles[y * this.w + x];
  }

  enemyAt(x, y) { for (const e of this.enemies.values()) if (e.x === x && e.y === y) return e; return null; }
  playerAt(x, y) { for (const p of this.players.values()) if (p.x === x && p.y === y) return p; return null; }
  chestAt(x, y) { for (const c of this.chests.values()) if (c.x === x && c.y === y) return c; return null; }
  free(x, y) { return DUNGEON.walkable(this.tile(x, y)) && !this.enemyAt(x, y) && !this.playerAt(x, y) && !this.chestAt(x, y); }

  freeNear(x, y) {
    for (let r = 0; r < 8; r++) {
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (this.free(x + dx, y + dy)) return { x: x + dx, y: y + dy };
      }
    }
    return { x, y };
  }

  // Línea de visión (Bresenham): muros, árboles, montañas y ruinas tapan
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

  // ---------- Héroes ----------
  join(user, profile, at) {
    const d = RULES.derive(profile.sheet, profile.xp);
    const c = user.combat || (user.combat = freshCombat(d));
    const pos = at ? this.freeNear(at.x, at.y) : this.freeNear(this.start.x, this.start.y);
    const p = { user, x: pos.x, y: pos.y, d, dir: 'S', nextMove: 0, nextAction: 0, sneakAt: 0 };
    this.players.set(user.id, p);
    this.hooks.send(user, { t: 'dstart', dungeon: { id: this.def.id, name: this.def.name, tiles: this.def.tiles, w: this.w, h: this.h, kind: this.kind, labels: this.def.labels || [] }, ...this.snapshot(), you: this.privateState(p) });
    this.event({ e: 'join', id: user.id });
    void c;
  }

  leave(userId) {
    if (!this.players.delete(userId)) return;
    this.event({ e: 'leave', id: userId });
  }

  // La ficha cambió (subida de nivel): se recalcula manteniendo el daño recibido
  refreshStats(user, profile) {
    const p = this.players.get(user.id);
    if (!p) return;
    const d = RULES.derive(profile.sheet, profile.xp);
    const c = user.combat;
    const gained = d.hp - c.maxHp;
    c.maxHp = d.hp;
    if (gained > 0) c.hp = Math.min(c.maxHp, c.hp + gained);
    c.slots = d.casting ? d.casting.slots.map((n, i) => Math.max(0, n - ((p.d.casting ? p.d.casting.slots[i] : 0) - (c.slots[i] || 0)))) : [];
    p.d = d;
    this.dirty = true;
    this.sendPrivate(p);
  }

  event(ev) { this.events.push(ev); this.dirty = true; }

  move(userId, dx, dy) {
    const p = this.players.get(userId);
    if (!p || !Number.isInteger(dx) || !Number.isInteger(dy) || Math.max(Math.abs(dx), Math.abs(dy)) !== 1) return;
    const now = Date.now();
    p.dir = dirName(dx, dy);
    const tx = p.x + dx, ty = p.y + dy;
    const enemy = this.enemyAt(tx, ty);
    if (enemy) {
      // chocar con un enemigo = atacar con el arma cuerpo a cuerpo elegida
      const wi = p.d.attacks.findIndex((a, i) => i === (p.weaponIndex ?? -1) && a.kind === 'melee');
      const melee = wi >= 0 ? wi : p.d.attacks.findIndex((a) => a.kind === 'melee');
      return this.action(userId, { act: 'attack', weapon: melee, target: enemy.id });
    }
    const chest = this.chestAt(tx, ty);
    if (chest) {
      if (!chest.open && now >= p.nextMove) {
        p.nextMove = now + MOVE_COOLDOWN;
        chest.open = true;
        const gold = randInt(...DUNGEON.REWARDS.chest.gold);
        this.hooks.reward(p.user, DUNGEON.REWARDS.chest.xp, gold);
        this.event({ e: 'loot', id: p.user.id, gold, xp: DUNGEON.REWARDS.chest.xp, x: tx, y: ty });
      }
      return;
    }
    if (now < p.nextMove) return;
    if (!DUNGEON.walkable(this.tile(tx, ty)) || this.playerAt(tx, ty)) return;
    if (dx && dy && !(DUNGEON.walkable(this.tile(p.x + dx, p.y)) && DUNGEON.walkable(this.tile(p.x, p.y + dy)))) return; // no cortar esquinas
    p.nextMove = now + MOVE_COOLDOWN * (dx && dy ? 1.4 : 1);
    p.x = tx; p.y = ty;
    this.dirty = true;
    this.onEnter(p);
  }

  onEnter(p) {
    const ch = this.tile(p.x, p.y);
    const t = DUNGEON.TILES[ch];
    if (t && t.damage) this.hurtPlayer(p, RULES.roll(t.damage, { rng }).total, null, 'pinchos', 'piercing');
    if (!this.players.has(p.user.id)) return;
    if (t && t.portal === 'tavern') return this.leaveTo(p, 'town');
    if (t && t.portal === 'dungeon') {
      const cave = (this.def.caves || []).find((c) => c.x === p.x && c.y === p.y);
      if (cave) { this.players.delete(p.user.id); this.event({ e: 'leave', id: p.user.id }); return this.hooks.portal(p.user, cave.dungeon, { x: p.x, y: p.y }); }
    }
    for (const pot of this.potions.values()) {
      if (pot.x === p.x && pot.y === p.y) {
        this.potions.delete(pot.id);
        this.heal(p, RULES.roll(DUNGEON.REWARDS.potion, { rng }).total, 'Poción de curación');
      }
    }
    for (const c of this.coins.values()) {
      if (c.x === p.x && c.y === p.y) {
        this.coins.delete(c.id);
        this.hooks.reward(p.user, 0, c.amount);
        this.event({ e: 'loot', id: p.user.id, gold: c.amount, xp: 0, x: p.x, y: p.y });
      }
    }
    if (this.exit && p.x === this.exit.x && p.y === this.exit.y) {
      const r = { gold: DUNGEON.REWARDS.exit.gold, xp: DUNGEON.REWARDS.exit.xpPerLevel * p.d.level };
      this.hooks.reward(p.user, r.xp, r.gold);
      this.event({ e: 'loot', id: p.user.id, gold: r.gold, xp: r.xp, x: p.x, y: p.y });
      this.leaveTo(p, 'win', r);
    }
  }

  leaveTo(p, reason, info) {
    this.players.delete(p.user.id);
    this.event({ e: 'leave', id: p.user.id });
    this.hooks.exit(p.user, reason, info);
  }

  heal(p, amount, source) {
    const c = p.user.combat;
    const before = c.hp;
    c.hp = Math.min(c.maxHp, c.hp + amount);
    this.event({ e: 'heal', id: p.user.id, amount: c.hp - before, source });
  }

  // ---------- Acciones de los héroes ----------
  action(userId, a) {
    const p = this.players.get(userId);
    if (!p || !a) return;
    const now = Date.now();
    if (now < p.nextAction) return;
    const c = p.user.combat;
    if (a.act === 'weapon') { p.weaponIndex = Number.isInteger(a.weapon) ? a.weapon : 0; return; }
    let done = false;
    if (a.act === 'attack') done = this.weaponAttack(p, a);
    else if (a.act === 'spell') done = this.castSpell(p, a);
    else if (a.act === 'feature') done = this.useFeature(p, a);
    if (done) { p.nextAction = now + ACTION_COOLDOWN; this.sendPrivate(p); }
    void c;
  }

  targetEnemy(p, id, rangeFt, longFt) {
    const e = this.enemies.get(id);
    if (!e) return null;
    const dist = cheb(p, e);
    const max = RULES.tiles(longFt || rangeFt);
    if (dist > max) { this.whisper(p, 'Está demasiado lejos.'); return null; }
    if (!this.los(p, e)) { this.whisper(p, 'No tienes línea de visión.'); return null; }
    return { e, far: longFt && dist > RULES.tiles(rangeFt) };
  }

  weaponAttack(p, a) {
    const w = p.d.attacks[a.weapon] || p.d.attacks[0];
    const t = this.enemies.get(a.target);
    if (!t) return false;
    const dist = cheb(p, t);
    let range = w.range, long = null;
    if (w.kind === 'ranged') { const W = RULES.data.byId.weapons[w.id]; long = W && W.range[1] ? W.range[1] : null; }
    else if (w.thrown && dist > 1) { range = w.thrown; const W = RULES.data.byId.weapons[w.id]; long = W.thrown[1]; }
    const tg = this.targetEnemy(p, a.target, range, long);
    if (!tg) return false;
    p.dir = dirName(t.x - p.x, t.y - p.y);
    // a distancia con un enemigo al lado o más allá del alcance normal: desventaja
    const adjacentFoe = w.kind === 'ranged' && [...this.enemies.values()].some((e) => cheb(e, p) <= 1);
    const disadv = tg.far || adjacentFoe;
    const lucky = p.d.halfling;
    let roll = d20(lucky);
    if (disadv) roll = Math.min(roll, d20(lucky));
    const total = roll + w.hit;
    const crit = roll === 20;
    const hit = crit || (roll !== 1 && total >= t.mon.ac);
    const ev = { e: 'attack', by: p.user.id, target: t.id, name: w.name, roll, bonus: w.hit, total, ac: t.mon.ac, hit, crit, disadv };
    if (hit) {
      let dmg = RULES.roll(w.dice, { rng, crit }).total + w.mod;
      const c = p.user.combat;
      if (c.ragingUntil > Date.now() && w.ability === 'str' && w.kind === 'melee') dmg += p.d.actions.find((x) => x.id === 'rage').bonus;
      // Ataque furtivo: arma sutil o a distancia, una vez por turno, si otro héroe está junto al objetivo
      const W = RULES.data.byId.weapons[w.id];
      if (p.d.sneak && Date.now() >= p.sneakAt && W && (W.properties.includes('finesse') || W.kind === 'ranged')
        && [...this.players.values()].some((o) => o !== p && cheb(o, t) <= 1)) {
        dmg += RULES.roll(p.d.sneak, { rng, crit }).total;
        ev.sneak = true;
        p.sneakAt = Date.now() + 5000;
      }
      ev.dmg = adjustDamage(t.mon, w.type, Math.max(1, dmg));
      ev.type = w.type;
    }
    this.event(ev);
    if (hit) this.damageEnemy(p, t, ev.dmg);
    return true;
  }

  castSpell(p, a) {
    const known = p.d.spells.find((s) => s.id === a.id);
    const fx = RULES.COMBAT_SPELLS[a.id];
    if (!known || !fx) return false;
    const c = p.user.combat;
    const spell = RULES.spells[a.id];
    // espacio de conjuro (los trucos no gastan; el de Iniciado en la magia es gratis una vez)
    let slotUsed = 0;
    if (spell.level > 0) {
      if (known.freeCast && !c.freeCast[a.id]) { c.freeCast[a.id] = true; slotUsed = -1; }
      else {
        const idx = c.slots.findIndex((n, i) => i + 1 >= spell.level && n > 0);
        if (idx < 0) { this.whisper(p, `No te quedan espacios de nivel ${spell.level} o superior.`); return false; }
        c.slots[idx]--; slotUsed = idx + 1;
      }
    }
    const tier = spell.level === 0 ? RULES.cantripTier(p.d.level) : 1;
    const dice = fx.beams ? fx.dice : RULES.scaleDice(fx.dice, tier);
    const base = { by: p.user.id, name: spell.name, spell: spell.id, slot: slotUsed };

    if (fx.kind === 'heal') {
      const amount = () => RULES.roll(dice, { rng }).total + (fx.addMod ? known.mod : 0);
      const allies = [...this.players.values()].filter((o) => cheb(o, p) <= RULES.tiles(fx.range));
      let targets;
      if (fx.multi) targets = allies.sort((x, y) => (x.user.combat.hp / x.user.combat.maxHp) - (y.user.combat.hp / y.user.combat.maxHp)).slice(0, fx.multi);
      else { const t = this.players.get(a.target) || p; if (cheb(t, p) > RULES.tiles(fx.range)) { this.whisper(p, 'Está demasiado lejos.'); refund(); return false; } targets = [t]; }
      this.event({ e: 'cast', ...base });
      for (const t of targets) this.heal(t, Math.max(1, amount()), spell.name);
      return true;
    }

    // punto objetivo (enemigo o casilla) para áreas y para hechizos de cono/línea que salen del lanzador
    let tx, ty;
    const target = a.target ? this.enemies.get(a.target) : null;
    if (target) { tx = target.x; ty = target.y; } else if (Number.isInteger(a.x) && Number.isInteger(a.y)) { tx = a.x; ty = a.y; } else { refund(); return false; }
    const selfArea = fx.area && (fx.area.shape === 'cone' || fx.area.shape === 'line');
    if (!selfArea && cheb(p, { x: tx, y: ty }) > RULES.tiles(fx.range)) { this.whisper(p, 'Está demasiado lejos.'); refund(); return false; }
    if (!selfArea && !this.los(p, { x: tx, y: ty })) { this.whisper(p, 'No tienes línea de visión.'); refund(); return false; }
    p.dir = dirName(tx - p.x, ty - p.y);
    this.event({ e: 'cast', ...base, x: tx, y: ty, area: fx.area || null, from: { x: p.x, y: p.y } });

    if (fx.kind === 'attack' || fx.kind === 'auto') {
      if (!target) { refund(); return false; }
      const count = fx.beams ? tier : fx.count || 1;
      let drained = 0;
      for (let i = 0; i < count && this.enemies.has(target.id); i++) {
        if (fx.kind === 'auto') {
          const dmg = adjustDamage(target.mon, fx.type, RULES.roll(dice, { rng }).total);
          this.event({ e: 'attack', ...base, target: target.id, auto: true, hit: true, dmg, type: fx.type });
          this.damageEnemy(p, target, dmg);
          continue;
        }
        const roll = d20(p.d.halfling);
        const total = roll + known.attack;
        const crit = roll === 20;
        const hit = crit || (roll !== 1 && total >= target.mon.ac);
        const ev = { e: 'attack', ...base, target: target.id, roll, bonus: known.attack, total, ac: target.mon.ac, hit, crit };
        if (hit) { ev.dmg = adjustDamage(target.mon, fx.type, RULES.roll(dice, { rng, crit }).total + (fx.addMod ? known.mod : 0)); ev.type = fx.type; drained += ev.dmg; }
        else if (fx.missHalf) { ev.dmg = adjustDamage(target.mon, fx.type, Math.floor(RULES.roll(dice, { rng }).total / 2)); ev.type = fx.type; }
        this.event(ev);
        if (ev.dmg) this.damageEnemy(p, target, ev.dmg);
      }
      if (fx.drain && drained) this.heal(p, Math.floor(drained / 2), spell.name);
      if (fx.then) this.areaSave(p, known, fx.then, tx, ty, base);
      return true;
    }
    if (fx.kind === 'save') {
      this.areaSave(p, known, fx, tx, ty, base, dice);
      return true;
    }
    return true;

    function refund() { if (slotUsed > 0) c.slots[slotUsed - 1]++; if (slotUsed === -1) c.freeCast[a.id] = false; }
  }

  // Salvación de todos los enemigos del área (o del objetivo) contra la CD
  areaSave(p, known, fx, tx, ty, base, diceOverride) {
    const targets = fx.area ? this.inArea(p, fx.area, tx, ty) : [this.enemyAt(tx, ty)].filter(Boolean);
    const dc = known.dc !== undefined ? known.dc : fx.dc;
    for (const t of targets) {
      const roll = rng(20);
      const bonus = t.combat.saves[fx.save] || 0;
      const total = roll + bonus;
      const success = total >= dc;
      const full = RULES.roll(diceOverride || fx.dice, { rng }).total;
      let dmg = success ? (fx.half ? Math.floor(full / 2) : 0) : full;
      dmg = adjustDamage(t.mon, fx.type, dmg);
      this.event({ e: 'save', ...base, target: t.id, ability: fx.save, roll, bonus, total, dc, success, dmg, type: fx.type });
      if (dmg) this.damageEnemy(p, t, dmg);
    }
  }

  inArea(p, area, tx, ty) {
    const r = RULES.tiles(area.size);
    const list = [];
    for (const e of this.enemies.values()) {
      if (area.shape === 'sphere' || area.shape === 'emanation') {
        const cx = area.shape === 'emanation' ? p.x : tx, cy = area.shape === 'emanation' ? p.y : ty;
        if (Math.max(Math.abs(e.x - cx), Math.abs(e.y - cy)) <= r && this.los({ x: cx, y: cy }, e)) list.push(e);
      } else if (area.shape === 'cone') {
        const dx = tx - p.x, dy = ty - p.y, ex = e.x - p.x, ey = e.y - p.y;
        const dist = Math.max(Math.abs(ex), Math.abs(ey));
        if (dist < 1 || dist > r) continue;
        const cos = (dx * ex + dy * ey) / (Math.hypot(dx, dy) * Math.hypot(ex, ey) || 1);
        if (cos >= 0.7 && this.los(p, e)) list.push(e);
      } else if (area.shape === 'line') {
        const len = Math.hypot(tx - p.x, ty - p.y) || 1;
        for (let i = 1; i <= r; i++) {
          const x = Math.round(p.x + (tx - p.x) / len * i), y = Math.round(p.y + (ty - p.y) / len * i);
          if (OPAQUE.has(this.tile(x, y))) break;
          if (e.x === x && e.y === y) { list.push(e); break; }
        }
      }
    }
    return list;
  }

  useFeature(p, a) {
    const f = p.d.actions.find((x) => x.id === a.id);
    if (!f) return false;
    const c = p.user.combat;
    if (f.uses !== undefined && (c.uses[f.id] ?? f.uses) <= 0) { this.whisper(p, `Ya no te quedan usos de ${f.name}.`); return false; }
    const spend = () => { c.uses[f.id] = (c.uses[f.id] ?? f.uses) - 1; };
    if (f.id === 'second-wind') { spend(); this.event({ e: 'feature', by: p.user.id, name: f.name }); this.heal(p, RULES.roll(f.dice, { rng }).total, f.name); return true; }
    if (f.id === 'rage') { spend(); c.ragingUntil = Date.now() + RAGE_MS; this.event({ e: 'feature', by: p.user.id, name: f.name, rage: true }); return true; }
    if (f.id === 'lay-on-hands') {
      const t = this.players.get(a.target) || p;
      if (cheb(t, p) > 1) { this.whisper(p, 'Tienes que tocarle (casilla de al lado).'); return false; }
      const pool = c.uses[f.id] ?? f.pool;
      const need = t.user.combat.maxHp - t.user.combat.hp;
      const amt = Math.min(pool, need);
      if (amt <= 0) { this.whisper(p, pool <= 0 ? 'Tu reserva está vacía.' : 'No le hace falta.'); return false; }
      c.uses[f.id] = pool - amt;
      this.event({ e: 'feature', by: p.user.id, name: f.name });
      this.heal(t, amt, f.name);
      return true;
    }
    if (f.id === 'breath-weapon') {
      let tx, ty;
      const target = a.target ? this.enemies.get(a.target) : null;
      if (target) { tx = target.x; ty = target.y; } else if (Number.isInteger(a.x)) { tx = a.x; ty = a.y; } else return false;
      spend();
      const base = { by: p.user.id, name: f.name };
      this.event({ e: 'cast', ...base, x: tx, y: ty, area: f.area, from: { x: p.x, y: p.y } });
      this.areaSave(p, { dc: f.dc }, { save: 'dex', half: true, dice: f.dice, type: f.type, area: f.area }, tx, ty, base);
      return true;
    }
    return false;
  }

  whisper(p, text) { this.hooks.send(p.user, { t: 'dwhisper', text }); }

  damageEnemy(p, enemy, dmg) {
    enemy.hp -= dmg;
    if (enemy.hp > 0) return;
    this.enemies.delete(enemy.id);
    if (enemy.group) { enemy.group.alive.delete(enemy.id); if (!enemy.group.alive.size) enemy.group.respawnAt = Date.now() + RESPAWN_MS; }
    const xpTotal = enemy.summoned ? Math.ceil(enemy.mon.xp / 3) : enemy.mon.xp;
    // la experiencia se reparte entre los héroes presentes
    const party = [...this.players.values()];
    const share = Math.max(1, Math.floor(xpTotal / Math.max(1, party.length)));
    this.event({ e: 'die', id: enemy.id, k: enemy.k, x: enemy.x, y: enemy.y, by: p.user.id, xp: share });
    for (const o of party) this.hooks.reward(o.user, share, 0);
    if (!enemy.summoned) {
      const id = 'c' + ++this.seq;
      const amount = randInt(Math.max(1, Math.ceil(enemy.mon.xp / 25)), Math.max(2, Math.ceil(enemy.mon.xp / 10)));
      this.coins.set(id, { id, x: enemy.x, y: enemy.y, amount });
    }
  }

  hurtPlayer(p, dmg, by, name, type) {
    const c = p.user.combat;
    if (c.ragingUntil > Date.now() && ['bludgeoning', 'piercing', 'slashing'].includes(type)) dmg = Math.floor(dmg / 2);
    c.hp -= dmg;
    if (c.hp <= 0 && p.d.relentless && !c.relentlessUsed) { c.hp = 1; c.relentlessUsed = true; this.event({ e: 'feature', by: p.user.id, name: 'Aguante incansable' }); }
    if (c.hp > 0) return;
    c.hp = 0;
    this.event({ e: 'down', id: p.user.id });
    this.leaveTo(p, 'down');
  }

  // ---------- Turno de los monstruos ----------
  tick(now) {
    for (const g of this.groups) {
      if (!g.alive.size && g.respawnAt && now >= g.respawnAt) {
        const near = [...this.players.values()].some((p) => g.spawn.some((s) => cheb(p, s) < 14));
        if (!near) { g.respawnAt = 0; this.spawnGroup(g, now); this.dirty = true; } else g.respawnAt = now + 20000;
      }
    }
    const range = this.kind === 'world' ? 9 : 8;
    for (const e of [...this.enemies.values()]) {
      if (!this.enemies.has(e.id)) continue;
      let target = null, best = Infinity;
      for (const p of this.players.values()) {
        const d = cheb(e, p);
        if (d < best && d <= range && this.los(e, p)) { best = d; target = p; }
      }
      if (!target) {
        // vuelve despacio a su sitio
        if (this.kind === 'world' && now >= e.nextStep && cheb(e, e.home) > 3) { e.nextStep = now + e.step * 2; this.stepToward(e, e.home); }
        continue;
      }
      const melee = e.combat.attacks.filter((a) => a.melee);
      const ranged = e.combat.attacks.filter((a) => a.range > 0);
      const reach = melee.length ? Math.max(...melee.map((a) => RULES.tiles(a.reach))) : 0;
      if (now >= e.nextAttack) {
        let atk = null;
        if (best <= reach && melee.length) atk = melee[0];
        else if (ranged.length && best <= RULES.tiles(ranged[0].range) && best > 1) atk = ranged[0];
        if (atk) {
          e.nextAttack = now + MONSTER_TURN + Math.random() * 400;
          e.dir = dirName(target.x - e.x, target.y - e.y);
          const n = atk.melee ? e.combat.multi : 1;
          for (let i = 0; i < n && this.players.has(target.user.id); i++) {
            const a = atk.melee && melee.length > 1 && i > 0 ? melee[i % melee.length] : atk;
            const roll = rng(20);
            const total = roll + a.hit;
            const ac = target.d.ac;
            const crit = roll === 20;
            const hit = crit || (roll !== 1 && total >= ac);
            const ev = { e: 'attack', by: e.id, target: target.user.id, name: a.name, roll, bonus: a.hit, total, ac, hit, crit };
            if (hit) { ev.dmg = Math.max(1, RULES.roll(a.dice, { rng, crit }).total); ev.type = a.type; }
            this.event(ev);
            if (hit) this.hurtPlayer(target, ev.dmg, e.id, a.name, a.type);
          }
          continue;
        }
      }
      const sum = DUNGEON.ENEMIES[e.k] && DUNGEON.ENEMIES[e.k].summons;
      if (sum && now >= e.nextSummon) {
        e.nextSummon = now + SUMMON_EVERY;
        const alive = [...this.enemies.values()].filter((o) => o.summoned).length;
        if (alive < MAX_SUMMONS) {
          const spot = DIRS.map(([dx, dy]) => ({ x: e.x + dx, y: e.y + dy })).find((s) => this.free(s.x, s.y));
          if (spot) { const id = this.addEnemy(sum, spot.x, spot.y, now, true); this.event({ e: 'summon', id, x: spot.x, y: spot.y }); }
        }
      }
      // acercarse (los que atacan a distancia se quedan a su alcance)
      const wantsDistance = !melee.length || (ranged.length && best > 1 && best <= RULES.tiles(ranged[0].range) && e.combat.attacks[0] === ranged[0]);
      if (!wantsDistance && best > reach && now >= e.nextStep) { e.nextStep = now + e.step; this.stepToward(e, target); }
    }
    for (const p of this.players.values()) {
      const c = p.user.combat;
      if (c.ragingUntil && now > c.ragingUntil) { c.ragingUntil = 0; this.sendPrivate(p); }
    }
    if (this.dirty) this.flush();
  }

  stepToward(e, target) {
    let move = null, moveD = cheb(e, target);
    for (const [dx, dy] of DIRS) {
      const nx = e.x + dx, ny = e.y + dy;
      if (!this.free(nx, ny)) continue;
      if (dx && dy && !(DUNGEON.walkable(this.tile(e.x + dx, e.y)) && DUNGEON.walkable(this.tile(e.x, e.y + dy)))) continue;
      const d = Math.max(Math.abs(nx - target.x), Math.abs(ny - target.y)) + (dx && dy ? 0.01 : 0);
      if (d < moveD) { moveD = d; move = [dx, dy]; }
    }
    if (move) { e.x += move[0]; e.y += move[1]; e.dir = dirName(move[0], move[1]); this.dirty = true; }
  }

  privateState(p) {
    const c = p.user.combat;
    return { hp: c.hp, maxHp: c.maxHp, slots: c.slots, uses: c.uses, freeCast: c.freeCast, raging: c.ragingUntil > Date.now(), ready: p.nextAction };
  }

  sendPrivate(p) { this.hooks.send(p.user, { t: 'dme', ...this.privateState(p) }); }

  snapshot() {
    return {
      players: [...this.players.values()].map((p) => ({ id: p.user.id, name: p.user.name, look: p.user.look, x: p.x, y: p.y, hp: p.user.combat.hp, maxHp: p.user.combat.maxHp, ac: p.d.ac, dir: p.dir, raging: p.user.combat.ragingUntil > Date.now() })),
      enemies: [...this.enemies.values()].map((e) => ({ id: e.id, k: e.k, x: e.x, y: e.y, hp: e.hp, maxHp: e.maxHp, dir: e.dir, summoned: e.summoned || undefined })),
      chests: [...this.chests.values()],
      potions: [...this.potions.values()],
      coins: [...this.coins.values()].map(({ id, x, y }) => ({ id, x, y })),
      exit: this.exit,
      start: this.start,
    };
  }

  // Envía el estado a todos los que están dentro (y a quien acaba de salir, para que vea su último evento)
  flush(extraUsers = []) {
    const msg = { t: 'dsnap', ...this.snapshot(), events: this.events };
    this.events = [];
    this.dirty = false;
    for (const p of this.players.values()) { this.hooks.send(p.user, msg); }
    for (const u of extraUsers) this.hooks.send(u, msg);
    for (const p of this.players.values()) this.hooks.send(p.user, { t: 'dme', ...this.privateState(p) });
  }
}

// Estado de combate que dura hasta volver a la taberna (descanso largo)
function freshCombat(d) {
  return { hp: d.hp, maxHp: d.hp, slots: d.casting ? d.casting.slots.slice() : [], uses: {}, freeCast: {}, ragingUntil: 0, relentlessUsed: false };
}

module.exports = { Instance, MONSTERS, freshCombat };
