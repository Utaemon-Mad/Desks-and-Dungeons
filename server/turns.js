'use strict';
// Combate por turnos al estilo D&D 5e. Fuera de combate se anda en tiempo real; cuando un monstruo ve a un héroe
// (o empieza un duelo) se para el tiempo: cada uno tira iniciativa (d20 + Destreza) y juega su turno entero por orden,
// uno detrás de otro. En su turno cada personaje tiene movimiento (unas 6 casillas), 1 acción (atacar, habilidad,
// esquivar, reanimar), 1 acción adicional (pociones y bufos) y 1 reacción por ronda (ataque de oportunidad cuando un
// enemigo sale de su alcance). Hay 30 s para decidir. Los efectos y enfriamientos corren con un reloj de juego que sólo
// avanza mientras pasa algo (alguien anda o actúa) y un poco más al acabar cada turno: pensar no gasta tiempo de juego.
const TURN_MS = Number(process.env.DD_TURN_MS) || 30000; // tiempo real para decidir el turno
const ENEMY_TURN_MS = 9000;  // por si un monstruo se atasca
const TURN_GAME_MS = 1500;   // tiempo de juego que pasa al acabar cada turno
const ENEMY_STEP_MS = 230;   // paso de los monstruos en su turno
const JOIN_R = 20;           // casillas: quién entra en el combate
const IDLE_END_MS = 1200;    // sin nada más que hacer, el turno acaba solo al rato
const GAP_MS = 250;          // pausa entre turnos

module.exports = function installTurns(Instance, U) {
  const { rnd, cheb, roll, dirName, AGGRO, LEASH } = U;
  const d20 = () => 1 + Math.floor(rnd() * 20);
  const mod = (v) => Math.floor(((v || 10) - 10) / 2);
  const realNow = () => Date.now();

  Object.assign(Instance.prototype, {
    // ---------- Reloj de juego ----------
    clock() { return this.enc ? this.enc.t : Date.now() - (this.lag || 0); },
    // al principio de cada tick: en combate el reloj sólo corre si pasa algo
    advanceClock(real) {
      const dt = Math.min(200, Math.max(0, real - (this.lastReal || real)));
      this.lastReal = real;
      if (this.enc && this.encRunning()) this.enc.t += dt;
      return this.clock();
    },

    // ---------- Quién y cuánto ----------
    squaresFor(p) { return Math.max(4, Math.min(9, Math.round(6 * 200 / (p.d.moveMs || 200)))) + (p.mounted && p.mount ? 2 : 0); },
    enemySquares(e) { return Math.max(3, Math.min(8, Math.round(6 * 340 / (e.m.ms || 340)))); },
    isActive(p) { const a = this.enc && this.enc.active; return !!(a && a.k === 'p' && a.id === p.user.id); },
    inEnc(k, id) { return !!(this.enc && this.enc.who.has(k + ':' + id)); },
    encEnt(c) { return c.k === 'p' ? this.players.get(c.id) : this.enemies.get(c.id); },
    // sólo en tu turno; si no, se avisa
    myTurn(p, what) {
      if (!this.enc) return true;
      if (this.isActive(p)) return true;
      if (what !== false) this.whisper(p, this.inEnc('p', p.user.id) ? '⏳ Espera tu turno.' : '⏸️ Hay un combate en marcha: espera a que termine.');
      return false;
    },
    // gasta una acción, acción adicional o movimiento del turno
    spend(p, kind, what) {
      if (!this.enc) return true;
      if (!this.myTurn(p)) return false;
      if (!p.tb || p.tb[kind] <= 0) { if (what) this.whisper(p, kind === 'bonus' ? '✚ Ya has usado tu acción adicional este turno.' : '⚔️ Ya has usado tu acción este turno.'); return false; }
      return true;
    },

    // ---------- Empezar y acabar ----------
    encStart() {
      if (!this.turns || this.enc) return;
      const enemies = [...this.enemies.values()].filter((e) => !e.pvp && e.aggro && this.players.has(e.aggro) && !this.players.get(e.aggro).downed);
      if (this.kind !== 'arena' && !enemies.length) return;
      const players = [...this.players.values()].filter((p) => !p.downed && (this.kind === 'arena' || enemies.some((e) => cheb(p, e) <= JOIN_R)));
      if (!players.length) return;
      this.enc = { t: this.clock(), round: 0, order: [], join: [], idx: -1, who: new Set(), active: null, deadline: 0, gapUntil: 0, endAt: 0, idleAt: 0 };
      for (const p of players) {
        p.path = []; p.goal = null; p.target = null; p.pending = null; p.kdir = null; p.fishing = null; p.gatherTo = null; p.talkTo = null;
        this.encAdd('p', p);
      }
      for (const e of enemies) this.encAdd('e', e);
      this.event({ e: 'encstart' });
      this.encRound();
    },
    encAdd(k, ent) {
      const id = k === 'p' ? ent.user.id : ent.id;
      if (this.enc.who.has(k + ':' + id)) return;
      this.enc.who.add(k + ':' + id);
      const init = k === 'p'
        ? d20() + mod(ent.d.stats && ent.d.stats.des)
        : d20() + Math.floor((ent.m.level || 1) / 4) + (ent.m.ms < 300 ? 2 : 0) + (ent.m.boss ? 1 : 0);
      ent.react = 1; ent.lastTurnAt = this.clock();
      this.enc.join.push({ k, id, init });
    },
    encRound() {
      const E = this.enc;
      E.round++;
      E.order = E.order.concat(E.join).filter((c) => this.encEnt(c));
      E.join = [];
      // de mayor a menor iniciativa (a igualdad, los héroes primero)
      E.order.sort((a, b) => b.init - a.init || (a.k === 'p' ? -1 : 1) - (b.k === 'p' ? -1 : 1));
      E.idx = -1;
      this.event({ e: 'round', n: E.round });
      this.encNext();
    },
    encNext() {
      const E = this.enc;
      for (let guard = 0; guard < 200 && this.enc === E; guard++) {
        if (this.encCheckEnd()) return;
        E.idx++;
        if (E.idx >= E.order.length) return this.encRound();
        const c = E.order[E.idx];
        const ent = this.encEnt(c);
        if (!ent) { E.order.splice(E.idx, 1); E.idx--; continue; } // muerto o se fue
        if (c.k === 'p' && ent.downed) continue;                   // tumbado: pierde el turno
        return this.encBegin(c, ent);
      }
    },
    encBegin(c, ent) {
      const E = this.enc, now = this.clock();
      E.active = c; E.idleAt = 0; E.endAt = 0;
      E.deadline = realNow() + (c.k === 'p' ? TURN_MS : ENEMY_TURN_MS);
      // aturdido o congelado desde su último turno: pierde éste; ralentizado: la mitad de movimiento
      const stunned = ent.stunUntil > (ent.lastTurnAt || 0);
      const slowed = ent.slowUntil > (ent.lastTurnAt || 0);
      ent.react = 1;
      if (c.k === 'p') {
        const sq = this.squaresFor(ent), mv = slowed ? Math.ceil(sq / 2) : sq;
        ent.tb = { move: mv, moveMax: mv, action: 1, bonus: 1 };
        ent.dodging = false;
        const cb = ent.user.combat;
        cb.en = Math.min(ent.d.en, cb.en + ent.d.enRegen * 3);
        this.privDirty(ent);
      } else {
        const sq = this.enemySquares(ent);
        ent.tb = { move: slowed ? Math.ceil(sq / 2) : sq, acted: false, waitUntil: now + 300 };
        // lo que avisó en el suelo cae al empezar su siguiente turno (ha dado tiempo a apartarse)
        for (const t of this.teles) if (t.turnOf === ent.id) t.at = now;
      }
      this.event({ e: 'turn', k: c.k, id: c.id, round: E.round, skip: stunned || undefined });
      if (stunned) { ent.stunUntil = 0; ent.tb = null; E.endAt = realNow() + 700; }
      this.dirty = true;
    },
    encEndTurn() {
      const E = this.enc;
      if (!E || !E.active) return;
      const ent = this.encEnt(E.active);
      if (ent) {
        ent.tb = null;
        if (E.active.k === 'p') { ent.path = []; ent.goal = null; ent.target = null; ent.pending = null; ent.kdir = null; this.privDirty(ent); }
      }
      E.t += TURN_GAME_MS;
      if (ent) ent.lastTurnAt = E.t;
      E.active = null; E.endAt = 0; E.idleAt = 0;
      E.gapUntil = realNow() + GAP_MS;
      this.dirty = true;
    },
    encCheckEnd() {
      const E = this.enc;
      if (this.kind === 'arena') { if (this.duelOver || this.players.size < 2) { this.encEnd(); return true; } return false; }
      const live = E.order.concat(E.join).filter((c) => c.k === 'e' && this.enemies.has(c.id));
      const heroes = E.order.concat(E.join).filter((c) => c.k === 'p' && this.players.has(c.id) && !this.players.get(c.id).downed);
      if (!live.length || !heroes.length) { this.encEnd(); return true; }
      return false;
    },
    encEnd() {
      const E = this.enc;
      if (!E) return;
      this.lag = Date.now() - E.t; // el reloj de juego sigue desde donde se quedó
      this.enc = null;
      for (const p of this.players.values()) { p.tb = null; p.dodging = false; this.privDirty(p); }
      for (const e of this.enemies.values()) e.tb = null;
      for (const t of this.teles) if (t.turnOf) t.at = this.clock(); // lo que quedaba avisado cae ya
      this.event({ e: 'encend' });
    },

    // ---------- Cada tick, en combate ----------
    encRunning() {
      const E = this.enc;
      if (!E.active || E.endAt) return true;
      if (this.projectiles.length || this.teles.some((t) => Number.isFinite(t.at))) return true;
      if (E.active.k === 'e') return true;
      const p = this.players.get(E.active.id);
      return !p || !!(p.path.length || p.pending || p.target || p.kdir);
    },
    encTick() {
      const E = this.enc, real = realNow();
      // se suman los que llegan o despiertan (entran en la siguiente ronda)
      for (const e of this.enemies.values()) {
        if (e.pvp || !e.aggro || this.inEnc('e', e.id)) continue;
        if ([...this.players.values()].some((p) => this.inEnc('p', p.user.id) && cheb(p, e) <= JOIN_R)) { this.encAdd('e', e); this.event({ e: 'encjoin', k: 'e', id: e.id }); }
      }
      for (const p of this.players.values()) {
        if (p.downed || this.inEnc('p', p.user.id)) continue;
        if (this.kind === 'arena' || [...this.enemies.values()].some((e) => this.inEnc('e', e.id) && cheb(p, e) <= JOIN_R)) { p.path = []; p.goal = null; p.kdir = null; this.encAdd('p', p); this.event({ e: 'encjoin', k: 'p', id: p.user.id }); }
      }
      if (E.endAt && real >= E.endAt) this.encEndTurn();
      if (!this.enc) return;
      if (!E.active) { if (real >= E.gapUntil) this.encNext(); return; }
      const ent = this.encEnt(E.active);
      if (!ent) { this.encEndTurn(); return; }
      if (real >= E.deadline) {
        if (E.active.k === 'p') this.whisper(ent, '⌛ Se acabó el tiempo de tu turno.');
        this.encEndTurn(); return;
      }
      if (E.active.k === 'p') {
        if (ent.downed) { this.encEndTurn(); return; }
        const t = ent.tb;
        const idle = !ent.path.length && !ent.pending && !ent.target && !ent.kdir;
        // sin acción ni movimiento (o sin nada útil cerca), el turno pasa solo
        if (t && idle && t.action <= 0 && t.move <= 0 && t.bonus <= 0) { if (!E.idleAt) E.idleAt = real + 300; }
        else if (t && idle && t.action <= 0 && t.move <= 0) { if (!E.idleAt) E.idleAt = real + IDLE_END_MS * 2; }
        else E.idleAt = 0;
        if (E.idleAt && real >= E.idleAt) this.encEndTurn();
      }
    },

    // ---------- Turno de un monstruo ----------
    encEnemy(e, now) {
      const E = this.enc, T = e.tb;
      if (!T || E.endAt) return;
      if (!this.tickDots(e, now)) return;
      if (now < T.waitUntil) return;
      const m = e.m;
      let target = e.aggro && this.players.get(e.aggro);
      if (target && (target.downed || cheb(e, target) > LEASH || this.inSafe(target))) target = null;
      if (!target) {
        let best = Infinity;
        for (const p of this.players.values()) {
          const d = cheb(e, p);
          if (!p.downed && d < best && d <= LEASH && (d <= AGGRO || this.los(e, p)) && !this.inSafe(p)) { best = d; target = p; }
        }
        if (target) e.aggro = target.user.id;
      }
      const done = () => { if (!this.projectiles.some((pr) => pr.by === e.id)) E.endAt = realNow() + 250; };
      if (!target) return done();
      const dist = cheb(e, target);
      const sees = dist <= 1 || this.los(e, target);
      if (!T.acted) {
        if (m.boss && now >= e.nextSpecial) {
          this.bossSpecial(e, target, now);
          // en combate por turnos sólo hay un especial por turno y dura hasta su siguiente turno
          e.nextSpecial = now + 3 * TURN_GAME_MS * (e.hp < e.maxHp * 0.35 ? 1 : 2);
          T.acted = true; T.waitUntil = now + 900; return;
        }
        if (m.summons && m.ai === 'summoner' && now >= e.nextSummon) {
          e.nextSummon = now + 4 * TURN_GAME_MS; this.summon(e, m.summons, 1, now);
          T.acted = true; T.waitUntil = now + 600; return;
        }
        if (m.ai === 'healer' && now >= e.nextHeal) {
          const hurt = [...this.enemies.values()].find((o) => o !== e && !o.pvp && o.hp < o.maxHp * 0.6 && cheb(o, e) <= 5);
          if (hurt) {
            e.nextHeal = now + 3 * TURN_GAME_MS;
            const amt = Math.round(hurt.maxHp * 0.25);
            hurt.hp = Math.min(hurt.maxHp, hurt.hp + amt);
            this.event({ e: 'eheal', id: hurt.id, by: e.id, amount: amt });
            T.acted = true; T.waitUntil = now + 600; return;
          }
        }
        if (m.range > 1 && dist <= m.range && sees) { this.enemyShoot(e, target, now); T.acted = true; T.waitUntil = now + 300; return; }
        if (m.range <= 1 && dist <= 1 && this.noCorner(e.x, e.y, Math.sign(target.x - e.x), Math.sign(target.y - e.y))) {
          e.dir = dirName(target.x - e.x, target.y - e.y);
          this.event({ e: 'swing', id: e.id, t: target.user.id });
          this.hurtPlayer(target, roll(m.dmg), { by: e.id, level: m.level, canDodge: true, magic: m.magic, kind: 'melee' });
          T.acted = true; T.waitUntil = now + 450; return;
        }
      }
      if (T.acted) return done();
      // acercarse (los de cuerpo a cuerpo hasta tocarle; los de distancia hasta tenerle a tiro)
      if (T.move > 0) {
        if (now < e.nextStep) return;
        const from = { x: e.x, y: e.y };
        if (this.enemyStep(e, target, now)) {
          T.move--;
          e.sm = Math.round(ENEMY_STEP_MS * (e.x !== from.x && e.y !== from.y ? 1.41 : 1));
          e.nextStep = now + e.sm;
          this.encLeaveReachOfHeroes(e, from, now);
          return;
        }
        T.move = 0;
      }
      done();
    },

    // ---------- Ataques de oportunidad (la reacción) ----------
    // un héroe sale del alcance de un monstruo que le tocaba
    encLeaveReachOfEnemies(p, from) {
      for (const e of [...this.enemies.values()]) {
        if (e.pvp || !this.inEnc('e', e.id) || e.m.range > 1 || !(e.react > 0) || e.stunUntil > this.clock()) continue;
        if (cheb(e, from) <= 1 && cheb(e, p) > 1) {
          e.react = 0;
          this.event({ e: 'oa', by: e.id, t: p.user.id, name: 'Ataque de oportunidad' });
          this.hurtPlayer(p, roll(e.m.dmg), { by: e.id, level: e.m.level, canDodge: true, magic: e.m.magic, kind: 'melee', name: 'Ataque de oportunidad' });
          if (!this.players.has(p.user.id) || p.downed) return;
        }
      }
      // en la arena: el rival que tocaba al que se va
      if (this.kind === 'arena') {
        for (const q of this.players.values()) {
          if (q === p || !(q.react > 0) || q.d.weapon.range > 1) continue;
          if (cheb(q, from) <= 1 && cheb(q, p) > 1) {
            const proxy = this.enemies.get('pv:' + p.user.id);
            if (!proxy) continue;
            q.react = 0;
            this.event({ e: 'oa', by: q.user.id, t: p.user.id, name: 'Ataque de oportunidad' });
            this.weaponAttack(q, proxy, this.clock());
          }
        }
      }
    },
    // un monstruo sale del alcance de un héroe con arma cuerpo a cuerpo
    encLeaveReachOfHeroes(e, from, now) {
      for (const q of [...this.players.values()]) {
        if (q.downed || !(q.react > 0) || q.d.weapon.range > 1 || !this.inEnc('p', q.user.id)) continue;
        if (cheb(q, from) <= 1 && cheb(q, e) > 1) {
          q.react = 0;
          this.event({ e: 'oa', by: q.user.id, t: e.id, name: 'Ataque de oportunidad' });
          this.weaponAttack(q, e, now);
          if (!this.enemies.has(e.id)) return;
        }
      }
    },

    // ---------- Órdenes que sólo existen por turnos ----------
    endTurn(userId) {
      const p = this.players.get(userId);
      if (!p || !this.enc || !this.isActive(p)) return;
      this.encEndTurn();
    },
    // reanimar a un compañero tumbado que está al lado (gasta la acción)
    revive(userId, id) {
      const p = this.players.get(userId);
      if (!p || p.downed) return;
      const t = id ? this.players.get(id) : [...this.players.values()].find((o) => o !== p && o.downed && cheb(o, p) <= 1);
      if (!t || !t.downed || cheb(t, p) > 1) return this.whisper(p, 'Ponte al lado de un compañero caído para reanimarlo.');
      if (this.enc && !this.spend(p, 'action', true)) return;
      if (this.enc) p.tb.action--;
      t.downed = null;
      const c = t.user.combat;
      c.hp = Math.round(t.d.hp * 0.5); c.en = Math.max(c.en, Math.round(t.d.en * 0.3));
      this.event({ e: 'revive', id: t.user.id, by: p.user.id });
      this.stat(p, 'revives', 1);
      this.privDirty(t); this.privDirty(p);
    },

    encView() {
      const E = this.enc;
      if (!E) return undefined;
      const list = E.order.map((c) => {
        const ent = this.encEnt(c);
        if (!ent) return null;
        return { k: c.k, id: c.id, init: c.init, name: c.k === 'p' ? ent.user.name : ent.m.name, down: c.k === 'p' && ent.downed ? 1 : undefined };
      }).filter(Boolean);
      const a = E.active;
      let tb;
      if (a) {
        const ent = this.encEnt(a);
        if (ent && ent.tb) tb = a.k === 'p' ? { move: ent.tb.move, moveMax: ent.tb.moveMax, action: ent.tb.action, bonus: ent.tb.bonus } : { move: ent.tb.move };
      }
      return {
        round: E.round, order: list, active: a ? { k: a.k, id: a.id } : null, tb,
        left: a && a.k === 'p' ? Math.max(0, E.deadline - realNow()) : undefined,
        turnMs: TURN_MS, joining: E.join.length || undefined,
      };
    },
  });

  return { TURN_MS, TURN_GAME_MS };
};
