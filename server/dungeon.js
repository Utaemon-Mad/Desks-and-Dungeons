// Una partida en marcha dentro de una mazmorra: héroes, enemigos con su IA, cofres, pociones y monedas.
const crypto = require('crypto');
const DUNGEON = require('../public/dungeon-data.js');
const MAP = require('../public/map.js');

const MOVE_COOLDOWN = 150;
const ATTACK_COOLDOWN = 420;
const ENEMY_ATTACK_COOLDOWN = 950;
const SUMMON_EVERY = 7000;
const MAX_SUMMONS = 3;

const randInt = (a, b) => crypto.randomInt(a, b + 1);
const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

class Instance {
  // hooks: { send(user, msg), reward(user, xp, gold, reason) -> profile, exit(user, reason) }
  constructor(def, hooks) {
    this.def = def;
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
    const now = Date.now();
    for (const o of def.objects) {
      const id = 'o' + ++this.seq;
      if (o.k === 'start') this.start = { x: o.x, y: o.y };
      else if (o.k === 'exit') this.exit = { x: o.x, y: o.y };
      else if (o.k === 'chest') this.chests.set(id, { id, x: o.x, y: o.y, open: false });
      else if (o.k === 'potion') this.potions.set(id, { id, x: o.x, y: o.y });
      else if (DUNGEON.ENEMIES[o.k]) this.addEnemy(o.k, o.x, o.y, now);
    }
  }

  get size() { return this.players.size; }

  addEnemy(k, x, y, now, summoned = false) {
    const st = DUNGEON.ENEMIES[k];
    const id = 'e' + ++this.seq;
    this.enemies.set(id, { id, k, x, y, hp: st.hp, maxHp: st.hp, dir: 'S', nextStep: now + 600 + Math.random() * 600, nextAttack: 0, nextSummon: now + SUMMON_EVERY, summoned });
    return id;
  }

  tile(x, y) {
    if (x < 0 || y < 0 || x >= DUNGEON.W || y >= DUNGEON.H) return '#';
    return this.def.tiles[y * DUNGEON.W + x];
  }

  enemyAt(x, y) { for (const e of this.enemies.values()) if (e.x === x && e.y === y) return e; return null; }
  playerAt(x, y) { for (const p of this.players.values()) if (p.x === x && p.y === y) return p; return null; }
  chestAt(x, y) { for (const c of this.chests.values()) if (c.x === x && c.y === y) return c; return null; }

  free(x, y) {
    return DUNGEON.walkable(this.tile(x, y)) && !this.enemyAt(x, y) && !this.playerAt(x, y) && !this.chestAt(x, y);
  }

  freeNear(x, y) {
    for (let r = 0; r < 6; r++) {
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (this.free(x + dx, y + dy)) return { x: x + dx, y: y + dy };
      }
    }
    return { x, y };
  }

  join(user, profile) {
    const st = MAP.heroStats(user.look.cls, profile.xp);
    const pos = this.freeNear(this.start.x, this.start.y);
    this.players.set(user.id, { user, x: pos.x, y: pos.y, hp: st.hp, maxHp: st.hp, att: st.att, dir: 'S', nextMove: 0, nextAttack: 0 });
    this.hooks.send(user, { t: 'dstart', dungeon: { id: this.def.id, name: this.def.name, tiles: this.def.tiles }, ...this.snapshot() });
    this.event({ e: 'join', id: user.id });
  }

  leave(userId) {
    if (!this.players.delete(userId)) return;
    this.event({ e: 'leave', id: userId });
  }

  // El jugador ha subido de nivel mientras está dentro
  refreshStats(user, profile) {
    const p = this.players.get(user.id);
    if (!p) return;
    const st = MAP.heroStats(user.look.cls, profile.xp);
    const gained = st.hp - p.maxHp;
    p.maxHp = st.hp; p.att = st.att;
    if (gained > 0) p.hp = Math.min(p.maxHp, p.hp + gained);
    this.dirty = true;
  }

  event(ev) { this.events.push(ev); this.dirty = true; }

  move(userId, dx, dy) {
    const p = this.players.get(userId);
    if (!p || !Number.isInteger(dx) || !Number.isInteger(dy) || Math.abs(dx) + Math.abs(dy) !== 1) return;
    const now = Date.now();
    p.dir = dx > 0 ? 'E' : dx < 0 ? 'W' : dy > 0 ? 'S' : 'N';
    const tx = p.x + dx, ty = p.y + dy;
    const enemy = this.enemyAt(tx, ty);
    if (enemy) {
      if (now < p.nextAttack) return;
      p.nextAttack = now + ATTACK_COOLDOWN;
      p.nextMove = now + MOVE_COOLDOWN;
      return this.hitEnemy(p, enemy);
    }
    const chest = this.chestAt(tx, ty);
    if (chest) {
      if (!chest.open && now >= p.nextMove) {
        p.nextMove = now + MOVE_COOLDOWN;
        chest.open = true;
        const gold = randInt(...DUNGEON.REWARDS.chest.gold);
        this.hooks.reward(p.user, DUNGEON.REWARDS.chest.xp, gold, 'cofre');
        this.event({ e: 'loot', id: p.user.id, gold, xp: DUNGEON.REWARDS.chest.xp, x: tx, y: ty });
      }
      return;
    }
    if (now < p.nextMove) return;
    if (!DUNGEON.walkable(this.tile(tx, ty)) || this.playerAt(tx, ty)) { this.dirty = true; return; }
    p.nextMove = now + MOVE_COOLDOWN;
    p.x = tx; p.y = ty;
    this.dirty = true;
    this.onEnter(p);
  }

  onEnter(p) {
    const t = DUNGEON.TILES[this.tile(p.x, p.y)];
    if (t && t.damage) this.hurtPlayer(p, t.damage, null);
    if (!this.players.has(p.user.id)) return;
    for (const pot of this.potions.values()) {
      if (pot.x === p.x && pot.y === p.y) {
        this.potions.delete(pot.id);
        const heal = Math.ceil(p.maxHp * DUNGEON.REWARDS.potionHeal);
        p.hp = Math.min(p.maxHp, p.hp + heal);
        this.event({ e: 'heal', id: p.user.id, amount: heal });
      }
    }
    for (const c of this.coins.values()) {
      if (c.x === p.x && c.y === p.y) {
        this.coins.delete(c.id);
        this.hooks.reward(p.user, 0, c.amount, 'monedas');
        this.event({ e: 'loot', id: p.user.id, gold: c.amount, xp: 0, x: p.x, y: p.y });
      }
    }
    if (this.exit && p.x === this.exit.x && p.y === this.exit.y) {
      const r = DUNGEON.REWARDS.exit;
      this.hooks.reward(p.user, r.xp, r.gold, 'salida');
      this.event({ e: 'loot', id: p.user.id, gold: r.gold, xp: r.xp, x: p.x, y: p.y });
      this.players.delete(p.user.id);
      this.event({ e: 'leave', id: p.user.id });
      this.hooks.exit(p.user, 'win', r);
    }
  }

  hitEnemy(p, enemy) {
    const dmg = p.att + randInt(0, 2);
    enemy.hp -= dmg;
    this.event({ e: 'hit', target: enemy.id, dmg, by: p.user.id });
    if (enemy.hp > 0) return;
    this.enemies.delete(enemy.id);
    const st = DUNGEON.ENEMIES[enemy.k];
    const xp = enemy.summoned ? Math.ceil(st.xp / 3) : st.xp;
    this.event({ e: 'die', id: enemy.id, k: enemy.k, x: enemy.x, y: enemy.y, by: p.user.id, xp });
    this.hooks.reward(p.user, xp, 0, st.name);
    if (!enemy.summoned) {
      const id = 'c' + ++this.seq;
      this.coins.set(id, { id, x: enemy.x, y: enemy.y, amount: randInt(...st.gold) });
    }
  }

  hurtPlayer(p, dmg, by) {
    p.hp -= dmg;
    this.event({ e: 'hit', target: p.user.id, dmg, by });
    if (p.hp > 0) return;
    this.players.delete(p.user.id);
    this.event({ e: 'down', id: p.user.id });
    this.hooks.exit(p.user, 'down');
  }

  tick(now) {
    for (const e of [...this.enemies.values()]) {
      if (!this.enemies.has(e.id)) continue;
      const st = DUNGEON.ENEMIES[e.k];
      let target = null, best = Infinity;
      for (const p of this.players.values()) {
        const d = dist(e, p);
        if (d < best) { best = d; target = p; }
      }
      if (!target || best > st.range) continue;
      if (best === 1) {
        if (now >= e.nextAttack) {
          e.nextAttack = now + ENEMY_ATTACK_COOLDOWN;
          e.dir = target.x > e.x ? 'E' : target.x < e.x ? 'W' : target.y > e.y ? 'S' : 'N';
          this.event({ e: 'swing', id: e.id });
          this.hurtPlayer(target, Math.max(1, st.att + randInt(-1, 1)), e.id);
        }
        continue;
      }
      if (st.summons && now >= e.nextSummon) {
        e.nextSummon = now + SUMMON_EVERY;
        const alive = [...this.enemies.values()].filter((o) => o.summoned).length;
        if (alive < MAX_SUMMONS) {
          const spot = DIRS.map(([dx, dy]) => ({ x: e.x + dx, y: e.y + dy })).find((s) => this.free(s.x, s.y));
          if (spot) {
            const id = this.addEnemy(st.summons, spot.x, spot.y, now, true);
            this.event({ e: 'summon', id, x: spot.x, y: spot.y });
          }
        }
      }
      if (now < e.nextStep) continue;
      e.nextStep = now + st.step;
      let move = null, moveD = best;
      for (const [dx, dy] of DIRS) {
        const nx = e.x + dx, ny = e.y + dy;
        if (!this.free(nx, ny)) continue;
        const d = Math.abs(nx - target.x) + Math.abs(ny - target.y);
        if (d < moveD) { moveD = d; move = [dx, dy]; }
      }
      if (move) {
        e.x += move[0]; e.y += move[1];
        e.dir = move[0] > 0 ? 'E' : move[0] < 0 ? 'W' : move[1] > 0 ? 'S' : 'N';
        this.dirty = true;
      }
    }
    if (this.dirty) this.flush();
  }

  snapshot() {
    return {
      players: [...this.players.values()].map((p) => ({ id: p.user.id, name: p.user.name, look: p.user.look, x: p.x, y: p.y, hp: p.hp, maxHp: p.maxHp, dir: p.dir })),
      enemies: [...this.enemies.values()].map((e) => ({ id: e.id, k: e.k, x: e.x, y: e.y, hp: e.hp, maxHp: e.maxHp, dir: e.dir })),
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
    for (const p of this.players.values()) this.hooks.send(p.user, msg);
    for (const u of extraUsers) this.hooks.send(u, msg);
  }
}

module.exports = { Instance };
