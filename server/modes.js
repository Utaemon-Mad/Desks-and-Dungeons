'use strict';
// Descenso infinito, duelos en la arena y habitación con trofeos.
// Lo usa server.js: recibe lo que necesita del servidor y devuelve sus funciones.
module.exports = function (ctx) {
  const { GEN, PROG, RULES, broadcast, crypto, detach, getInstance, give, joinInstance, levelOf, profileChanged, rnd, saveUser, send, system, toTavern } = ctx;
  const giveMats = (...a) => ctx.giveMats(...a); // de server/progress.js
  const track = (...a) => ctx.track(...a); // de server/progress.js

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
      const it = RULES.makeItem(rnd, { ilvl: PROG.descentLevel(desc.start, desc.floor), rarity: desc.floor % 10 === 0 ? 'unico' : 'raro', classes: [user.profile.char.cls] });
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

  return { duelEnd, nextFloor, roomInfo, startDescent, startDuel };
};
