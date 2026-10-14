// Objetivos de las mazmorras (se instala en Instance, como turns.js): un portón cierra la sala del jefe y se abre
// al cumplir el objetivo que trae el mapa (def.quest, de server/gen.js):
//   keys   — tres llaves repartidas por las salas: se cogen al pisarlas
//   levers — tres palancas: se accionan a su lado (orden 'dlever'); cada una despierta una pequeña emboscada
//   waves  — en la sala de antes del jefe hay que aguantar varias oleadas mientras el portón se abre
// Con el portón cerrado nadie ve a través de él (los del jefe no despiertan ni disparan) y nadie lo cruza.
const RULES = require('../public/rules/engine.js');

const QUEST_NAMES = { keys: 'llaves', levers: 'palancas', waves: 'oleadas' };

module.exports = function installQuests(Instance, U) {
  const { rnd, cheb } = U;
  Object.assign(Instance.prototype, {
    questInit() {
      const Q = this.def.quest;
      if (!Q || !Q.gate || !Q.gate.length || this.kind !== 'dungeon') return;
      const spots = (Q.spots || []).map((s) => ({ x: s.x, y: s.y, done: false }));
      this.quest = { type: Q.type, gate: Q.gate, spots, room: Q.room || null, waves: Q.waves || 0, wave: 0, need: Q.type === 'waves' ? Q.waves : spots.length, got: 0, open: false, alive: new Set(), nextWaveAt: 0 };
      this.gateSet = new Set(Q.gate.map((g) => g.y * this.w + g.x));
      for (const i of this.gateSet) this.blocked.add(i);
      if (Q.type === 'levers') for (const s of spots) this.blocked.add(s.y * this.w + s.x);
    },
    questView() {
      const q = this.quest;
      if (!q) return undefined;
      return { type: q.type, got: q.got, need: q.need, open: q.open, wave: q.wave, waves: q.waves || undefined, spots: q.spots.length ? q.spots : undefined, gate: q.gate, room: q.room || undefined };
    },
    questSay(text) { for (const p of this.players.values()) this.whisper(p, text); },

    // al pisar una casilla: llaves, la sala de las oleadas y la palanca a la que se iba
    questOnEnter(p) {
      const q = this.quest;
      if (!q || q.open) return;
      if (q.type === 'keys') {
        const s = q.spots.find((k) => !k.done && k.x === p.x && k.y === p.y);
        if (s) {
          s.done = true; q.got++;
          this.event({ e: 'quest', kind: 'key', x: s.x, y: s.y, by: p.user.id, got: q.got, need: q.need });
          this.questSay(q.got < q.need ? `🗝️ ${p.user.name} encuentra una llave (${q.got}/${q.need}).` : `🗝️ ${p.user.name} encuentra la última llave.`);
          if (q.got >= q.need) this.openGate(p);
        }
      }
      if (q.type === 'levers' && p.useTarget) {
        const s = q.spots.find((k) => k.x === p.useTarget.x && k.y === p.useTarget.y);
        if (s && cheb(p, s) <= 1) { p.useTarget = null; this.pullLever(p, s); }
      }
      if (q.type === 'waves' && !q.wave && q.room) {
        const r = q.room;
        if (p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h) {
          this.questSay('⚔️ ¡El suelo tiembla y el portón empieza a abrirse! Aguantad aquí las oleadas.');
          this.spawnWave(p);
        }
      }
    },

    // palancas: a su lado se accionan; si no, se va hasta ella y se acciona al llegar
    useAt(userId, x, y) {
      const p = this.players.get(userId);
      const q = this.quest;
      if (!p || p.downed || !q || q.type !== 'levers' || q.open) return;
      const s = q.spots.find((k) => k.x === x && k.y === y);
      if (!s || s.done) return;
      if (cheb(p, s) <= 1) return this.pullLever(p, s);
      if (this.enc && !this.myTurn(p)) return;
      this.go(userId, x, y);
      p.useTarget = { x, y };
    },
    pullLever(p, s) {
      const q = this.quest;
      if (s.done) return;
      s.done = true; q.got++;
      this.event({ e: 'quest', kind: 'lever', x: s.x, y: s.y, by: p.user.id, got: q.got, need: q.need });
      this.questSay(q.got < q.need ? `🔧 ${p.user.name} acciona una palanca (${q.got}/${q.need}). Algo se mueve en la oscuridad…` : `🔧 ${p.user.name} acciona la última palanca. Se oyen cadenas…`);
      // cada palanca despierta una pequeña emboscada (salvo la última, que abre el portón)
      if (q.got < q.need) this.questAmbush(p, s, 1 + Math.floor(this.level / 10) + (this.players.size > 2 ? 1 : 0));
      else this.openGate(p);
      this.dirty = true;
    },
    questMobs() {
      const T = RULES.THEMES[this.def.theme];
      const list = T ? T.mobs.filter((k) => (RULES.MONSTERS[k].minLevel || 1) <= this.level) : [];
      return list.length ? list : ['skeleton'];
    },
    questAmbush(p, at, n) {
      const now = this.clock(), mobs = this.questMobs();
      for (let i = 0; i < n; i++) {
        let spot = null;
        for (let t = 0; t < 30 && !spot; t++) {
          const a = rnd() * Math.PI * 2, r = 3 + rnd() * 2, x = Math.round(at.x + Math.cos(a) * r), y = Math.round(at.y + Math.sin(a) * r);
          if (this.freeForEnemy(x, y) && this.los(at, { x, y })) spot = { x, y };
        }
        if (!spot) continue;
        const id = this.addEnemy(mobs[Math.floor(rnd() * mobs.length)], spot.x, spot.y, this.level, now, {});
        const e = id && this.enemies.get(id);
        if (!e) continue;
        e.aggro = p.user.id; e.nextAttack = now + 900; e.pack = 'amb' + this.seq;
        this.event({ e: 'summon', id, x: spot.x, y: spot.y });
      }
    },

    // oleadas en la sala de antes del jefe: cuando cae la última de una oleada llega la siguiente
    spawnWave(p) {
      const q = this.quest, r = q.room, now = this.clock(), mobs = this.questMobs();
      q.wave++;
      const n = 3 + Math.floor(this.level / 8) + Math.max(0, this.players.size - 1) + (q.wave === q.waves ? 1 : 0);
      const edge = [];
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
        if (x !== r.x && x !== r.x + r.w - 1 && y !== r.y && y !== r.y + r.h - 1) continue;
        if (this.freeForEnemy(x, y) && ![...this.players.values()].some((o) => cheb(o, { x, y }) < 2)) edge.push({ x, y });
      }
      for (let i = 0; i < n && edge.length; i++) {
        const s = edge.splice(Math.floor(rnd() * edge.length), 1)[0];
        // la última oleada trae un élite
        const id = this.addEnemy(mobs[Math.floor(rnd() * mobs.length)], s.x, s.y, this.level, now, { elite: q.wave === q.waves && i === 0 });
        const e = id && this.enemies.get(id);
        if (!e) continue;
        e.aggro = p.user.id; e.nextAttack = now + 1000; e.pack = 'wave' + q.wave; e.wave = true;
        q.alive.add(id);
        this.event({ e: 'summon', id, x: s.x, y: s.y });
      }
      this.event({ e: 'quest', kind: 'wave', wave: q.wave, waves: q.waves, x: p.x, y: p.y });
      if (!q.alive.size) this.questWaveDone();
      this.dirty = true;
    },
    questWaveDone() {
      const q = this.quest;
      q.got = q.wave;
      if (q.wave >= q.waves) { const p = [...this.players.values()][0]; if (p) this.openGate(p); return; }
      this.questSay(`🛡️ ¡Oleada ${q.wave} de ${q.waves} rechazada! El portón sigue abriéndose…`);
      this.event({ e: 'quest', kind: 'wavedone', wave: q.wave, waves: q.waves, got: q.got, need: q.need });
      q.nextWaveAt = this.clock() + 2500;
    },
    questOnKill(e) {
      const q = this.quest;
      if (!q || q.open || q.type !== 'waves' || !q.alive.has(e.id)) return;
      q.alive.delete(e.id);
      if (!q.alive.size) this.questWaveDone();
    },
    questTick(now) {
      const q = this.quest;
      if (!q || q.open || q.type !== 'waves' || !q.nextWaveAt || now < q.nextWaveAt) return;
      q.nextWaveAt = 0;
      const p = [...this.players.values()].find((o) => !o.downed) || [...this.players.values()][0];
      if (p) this.spawnWave(p);
    },

    openGate(p) {
      const q = this.quest;
      if (!q || q.open) return;
      q.open = true; q.got = q.need;
      for (const i of this.gateSet) this.blocked.delete(i);
      this.gateSet = null;
      // un premio por cumplir el objetivo
      const xp = Math.round(25 * this.level * (1 + 0.05 * this.level));
      for (const o of this.players.values()) this.hooks.reward(o.user, xp, 0);
      this.event({ e: 'quest', kind: 'gate', by: p && p.user.id, xp, x: q.gate[0].x, y: q.gate[0].y });
      this.questSay(`🏰 ¡El portón se abre! Habéis cumplido las ${QUEST_NAMES[q.type]} (+${xp} PX). El jefe os espera.`);
      this.dirty = true;
    },
  });
};
