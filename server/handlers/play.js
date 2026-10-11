'use strict';
// Mensajes de misiones, tablón, fama, taberna, mercado, Descenso, Asalto, duelos y recompensas.
// Cada mensaje recibe cx = { ws, user, room, err, allow, allowGame, isOwner, inst, nearShopNpc, roll, command } (la conexión) y el mensaje.
const DICE_BETS = [10, 50, 100, 500];
const DICE_MS = 20000; // tiempo para unirse a la ronda
const MESA_MARKS = 3; // marcas por jugador en el plano

module.exports = function (ctx) {
  const { GEN, PROG, RULES, broadcast, crypto, levelOf, profileChanged, questState, reward, rnd, saveUser, send, sendMe, store, system } = ctx;
  const claimLogin = (...a) => ctx.claimLogin(...a); // de server/social.js
  const donate = (...a) => ctx.donate(...a); // de server/social.js
  const ensureBoard = (...a) => ctx.ensureBoard(...a); // de server/progress.js
  const giveMats = (...a) => ctx.giveMats(...a); // de server/progress.js
  const marketList = (...a) => ctx.marketList(...a); // de server/social.js
  const marketView = (...a) => ctx.marketView(...a); // de server/social.js
  const matsText = (...a) => ctx.matsText(...a); // de server/progress.js
  const payOffline = (...a) => ctx.payOffline(...a); // de server/social.js
  const raidInfo = (...a) => ctx.raidInfo(...a); // de server/social.js
  const ranksView = (...a) => ctx.ranksView(...a); // de server/progress.js
  const roomInfo = (...a) => ctx.roomInfo(...a); // de server/modes.js
  const seasonView = (...a) => ctx.seasonView(...a); // de server/social.js
  const startDescent = (...a) => ctx.startDescent(...a); // de server/modes.js
  const startDuel = (...a) => ctx.startDuel(...a); // de server/modes.js
  const startRaid = (...a) => ctx.startRaid(...a); // de server/social.js
  const tavernView = (...a) => ctx.tavernView(...a); // de server/social.js
  const track = (...a) => ctx.track(...a); // de server/progress.js
  const joinInstance = (...a) => ctx.joinInstance(...a); // de server.js
  const newDungeon = (...a) => ctx.newDungeon(...a); // de server.js

  return {
    'quest:accept'(cx, msg) {
      const { ws, user, room, err, allow, allowGame, isOwner, inst, nearShopNpc, roll, command } = cx;
    const id = String(msg.id);
    const st = questState(user.profile, id);
    if (st === 'locked') return err(`Necesitas nivel ${RULES.QUESTS[id].minLevel} para esta misión.`);
    if (st !== 'available') return;
    user.profile.quests[id] = { n: 0 };
    profileChanged(room, user);
    send(ws, { t: 'dwhisper', text: `📜 Nueva misión: ${RULES.QUESTS[id].name}` });
    return;
    },
    'quest:turnin'(cx, msg) {
      const { ws, user, room, err, allow, allowGame, isOwner, inst, nearShopNpc, roll, command } = cx;
    const id = String(msg.id);
    const Q = RULES.QUESTS[id];
    if (questState(user.profile, id) !== 'ready') return;
    let item = null;
    if (Q.item) {
      const ilvl = Math.max(levelOf(user), RULES.ZONES[Q.zone].lv[1]);
      item = RULES.makeItem(rnd, { ilvl, rarity: Q.item, classes: [user.profile.char.cls] });
      if (user.profile.bag.length >= RULES.BAG_SIZE) return err('Haz sitio en la mochila para recoger la recompensa.');
      user.profile.bag.push(item);
    }
    delete user.profile.quests[id];
    user.profile.questsDone.push(id);
    track(room, user, 'quest', { value: user.profile.questsDone.length });
    reward(room, user, Q.xp, Q.gold);
    profileChanged(room, user);
    system(room, `📜 ${user.name} completa «${Q.name}»${item ? ` y recibe «${item.name}»` : ''}.`);
    if (item) send(ws, { t: 'dgot', item });
    return;
    },
    'quest:abandon'(cx, msg) {
      const { ws, user, room, err, allow, allowGame, isOwner, inst, nearShopNpc, roll, command } = cx;
  if (user.profile.quests[msg.id]) { delete user.profile.quests[msg.id]; profileChanged(room, user); } return;
    },
    'login:claim'(cx, msg) {
      const { ws, user, room, err, allow, allowGame, isOwner, inst, nearShopNpc, roll, command } = cx;
  claimLogin(room, user);
    },
    'tut:done'(cx, msg) {
      const { ws, user, room, err, allow, allowGame, isOwner, inst, nearShopNpc, roll, command } = cx;
    // regalo de Alfonso al acabar el tutorial (una vez por personaje)
    const p = user.profile;
    if (!p || p.tutDone) return;
    p.tutDone = true;
    if (msg.skip) { profileChanged(room, user); return; }
    p.cons['pocion-vida-p'] = (p.cons['pocion-vida-p'] || 0) + 3;
    p.cons['pocion-energia'] = (p.cons['pocion-energia'] || 0) + 2;
    p.gold += 50;
    profileChanged(room, user);
    broadcast(room, { t: 'profile', id: user.id, xp: p.xp, gold: p.gold, level: levelOf(user) });
    send(ws, { t: 'toast', text: '🎁 Alfonso te regala 3 pociones de vida, 2 de energía y 50 de oro.' });
    return;
    },
    'board:claim'(cx, msg) {
      const { ws, user, room, err, allow, allowGame, isOwner, inst, nearShopNpc, roll, command } = cx;
    const p = user.profile;
    ensureBoard(p);
    const id = String(msg.id);
    const T = PROG.taskDef(id);
    if (!T || ![...p.board.daily, ...p.board.weekly].includes(id) || p.board.claimed.includes(id) || (p.board.prog[id] || 0) < T.n) return;
    const r = PROG.taskReward(id, levelOf(user));
    let item = null;
    if (r.item) {
      if (p.bag.length >= RULES.BAG_SIZE) return err('Haz sitio en la mochila para la recompensa.');
      item = RULES.makeItem(rnd, { ilvl: levelOf(user), rarity: r.item, classes: [p.char.cls] });
      p.bag.push(item);
    }
    p.board.claimed.push(id);
    giveMats(room, user, r.mats, true);
    track(room, user, 'task', {});
    reward(room, user, r.xp, r.gold);
    profileChanged(room, user);
    send(ws, { t: 'dwhisper', text: `📋 Recompensa: +${r.xp} PX, +${r.gold} 🪙, ${matsText(r.mats)}${item ? ` y «${item.name}»` : ''}.` });
    if (item) send(ws, { t: 'dgot', item });
    return;
    },
    'ranks:get'(cx, msg) {
      const { ws, user, room, err, allow, allowGame, isOwner, inst, nearShopNpc, roll, command } = cx;
  if (allow(0.3)) send(ws, ranksView(user)); return;
    },
    'season:get'(cx, msg) {
      const { ws, user, room, err, allow, allowGame, isOwner, inst, nearShopNpc, roll, command } = cx;
  if (allow(0.3)) send(ws, seasonView(user)); return;
    },
    'tavern:get'(cx, msg) {
      const { ws, user, room, err, allow, allowGame, isOwner, inst, nearShopNpc, roll, command } = cx;
  if (allow(0.3)) send(ws, tavernView(room, user)); return;
    },
    'tavern:donate'(cx, msg) {
      const { ws, user, room, err, allow, allowGame, isOwner, inst, nearShopNpc, roll, command } = cx;
    if (!allow(1)) return;
    if (!donate(room, user, msg.gold)) return err('No tienes oro suficiente.');
    send(ws, tavernView(room, user));
    return;
    },
    'market:get'(cx, msg) {
      const { ws, user, room, err, allow, allowGame, isOwner, inst, nearShopNpc, roll, command } = cx;
  if (allow(0.3)) send(ws, marketView(user)); return;
    },
    'market:sell'(cx, msg) {
      const { ws, user, room, err, allow, allowGame, isOwner, inst, nearShopNpc, roll, command } = cx;
    if (!allow(1)) return;
    if (user.where || user.trade) return err('Vende desde la taberna.');
    const p = user.profile, i = p.bag.findIndex((x) => x.id === msg.id);
    const price = Math.floor(Number(msg.price) || 0);
    if (i < 0) return;
    if (price < 1 || price > PROG.MARKET.maxPrice) return err('Pon un precio entre 1 y 1.000.000 de oro.');
    const list = marketList();
    if (list.filter((l) => l.cid === user.cid).length >= PROG.MARKET.maxPerChar) return err(`Como mucho ${PROG.MARKET.maxPerChar} objetos a la venta a la vez.`);
    const [item] = p.bag.splice(i, 1);
    list.unshift({ id: 'm' + crypto.randomBytes(5).toString('hex'), item, price, cid: user.cid, pid: user.pid, slot: user.slot, sellerName: user.name, at: Date.now() });
    store.setMeta('market', list.slice(0, 300));
    saveUser(user); sendMe(user);
    send(ws, marketView(user));
    if (['raro', 'unico', 'conjunto'].includes(item.rarity) || item.leg) system(room, `🏪 ${user.name} pone a la venta «${item.name}» por ${price} 🪙.`);
    return;
    },
    'market:buy'(cx, msg) {
      const { ws, user, room, err, allow, allowGame, isOwner, inst, nearShopNpc, roll, command } = cx;
    if (!allow(1)) return;
    if (user.where || user.trade) return err('Compra desde la taberna.');
    const list = marketList(), i = list.findIndex((l) => l.id === msg.id);
    if (i < 0) return err('Ese objeto ya se ha vendido.');
    const L = list[i];
    if (L.cid === user.cid) return err('Es tuyo: si quieres, retíralo.');
    if (user.profile.gold < L.price) return err('No tienes oro suficiente.');
    if (user.profile.bag.length >= RULES.BAG_SIZE) return err('Tienes la mochila llena.');
    list.splice(i, 1); store.setMeta('market', list);
    user.profile.gold -= L.price;
    user.profile.bag.push(L.item);
    saveUser(user); sendMe(user);
    broadcast(room, { t: 'profile', id: user.id, xp: user.profile.xp, gold: user.profile.gold, level: levelOf(user) });
    payOffline(L.cid, L.pid, L.slot, Math.floor(L.price * (1 - PROG.MARKET.fee)));
    send(ws, marketView(user));
    return;
    },
    'market:cancel'(cx, msg) {
      const { ws, user, room, err, allow, allowGame, isOwner, inst, nearShopNpc, roll, command } = cx;
    if (!allow(1)) return;
    const list = marketList(), i = list.findIndex((l) => l.id === msg.id && l.cid === user.cid);
    if (i < 0) return;
    if (user.profile.bag.length >= RULES.BAG_SIZE) return err('Tienes la mochila llena.');
    const [L] = list.splice(i, 1); store.setMeta('market', list);
    user.profile.bag.push(L.item);
    saveUser(user); sendMe(user);
    send(ws, marketView(user));
    return;
    },
    'room:get'(cx, msg) {
      const { ws, user, room, err, allow, allowGame, isOwner, inst, nearShopNpc, roll, command } = cx;
    const u = msg.id ? room.users.get(msg.id) : user;
    if (u && allow(0.3)) send(ws, roomInfo(u));
    return;
    },
    'descent:start'(cx, msg) {
      const { ws, user, room, err, allow, allowGame, isOwner, inst, nearShopNpc, roll, command } = cx;
  if (!user.where && allow(2)) startDescent(room, user); return;
    },
    'raid:info'(cx, msg) {
      const { ws, user, room, err, allow, allowGame, isOwner, inst, nearShopNpc, roll, command } = cx;
  if (allow()) send(ws, raidInfo(user)); return;
    },
    'raid:start'(cx, msg) {
      const { ws, user, room, err, allow, allowGame, isOwner, inst, nearShopNpc, roll, command } = cx;
  if (!user.where && allow(2)) startRaid(room, user); return;
    },
    'duel:req'(cx, msg) {
      const { ws, user, room, err, allow, allowGame, isOwner, inst, nearShopNpc, roll, command } = cx;
    const other = room.users.get(msg.to);
    if (!other || other === user || !allow()) return;
    if (user.where || other.where) return err('Los dos tenéis que estar en la taberna.');
    const bet = Math.max(0, Math.min(PROG.ARENA.maxBet, Math.floor(Number(msg.bet) || 0)));
    if (user.profile.gold < bet) return err('No tienes tanto oro para apostar.');
    other.duelInvite = { from: user.id, bet };
    send(other.ws, { t: 'duel:invite', from: user.id, name: user.name, bet });
    send(ws, { t: 'system', text: `Has retado a ${other.name} a un duelo${bet ? ` (${bet} 🪙 cada uno)` : ''}.`, ts: Date.now() });
    return;
    },
    'duel:accept'(cx, msg) {
      const { ws, user, room, err, allow, allowGame, isOwner, inst, nearShopNpc, roll, command } = cx;
    const other = room.users.get(msg.from);
    const inv = user.duelInvite;
    if (!other || !inv || inv.from !== other.id || user.where || other.where) return err('El reto ya no vale.');
    user.duelInvite = null;
    if (user.profile.gold < inv.bet || other.profile.gold < inv.bet) return err('Alguien no tiene oro para la apuesta.');
    startDuel(room, other, user, inv.bet);
    return;
    },
    'duel:decline'(cx, msg) {
      const { ws, user, room, err, allow, allowGame, isOwner, inst, nearShopNpc, roll, command } = cx;
    const other = room.users.get(msg.from);
    user.duelInvite = null;
    if (other) send(other.ws, { t: 'system', text: `${user.name} rechaza el duelo.`, ts: Date.now() });
    return;
    },

    // ---------- Ronda de dados en la taberna: todos apuestan lo mismo, cada uno tira 2d6 y el más alto se lo lleva ----------
    'dice:open'(cx, msg) {
      const { user, room, err } = cx;
      if (user.where) return err('Las apuestas, en la taberna.');
      if (room.dice) return err('Ya hay una ronda abierta: únete a ella.');
      const bet = DICE_BETS.includes(Number(msg.bet)) ? Number(msg.bet) : 0;
      if (!bet) return;
      if (user.profile.gold < bet) return err('No tienes oro para esa apuesta.');
      payGold(room, user, -bet);
      room.dice = { bet, by: user.name, players: [{ id: user.id, name: user.name }], endAt: Date.now() + DICE_MS };
      room.diceTimer = setTimeout(() => diceEnd(room), DICE_MS);
      system(room, `🎲 ${user.name} abre una ronda de dados: ${bet} 🪙 por cabeza. ¡Tenéis ${DICE_MS / 1000} s para uniros (botón 🎲)!`);
      broadcast(room, { t: 'dice:state', round: diceView(room) });
    },
    'dice:join'(cx) {
      const { user, room, err } = cx;
      const d = room.dice;
      if (!d || user.where) return;
      if (d.players.some((p) => p.id === user.id)) return;
      if (d.players.length >= 8) return err('La mesa está llena.');
      if (user.profile.gold < d.bet) return err('No tienes oro para esa apuesta.');
      payGold(room, user, -d.bet);
      d.players.push({ id: user.id, name: user.name });
      broadcast(room, { t: 'dice:state', round: diceView(room) });
    },
    'dice:get'(cx) { send(cx.ws, { t: 'dice:state', round: diceView(cx.room) }); },

    // ---------- Mesa de partida: los sentados ven el plano de la próxima mazmorra, lo marcan y bajan juntos ----------
    'mesa:get'(cx) { send(cx.ws, { t: 'mesa', ...mesaView(cx.room, true) }); },
    'mesa:refresh'(cx) {
      // alguien se ha movido, ha bajado a una partida o se ha ido: si cambian los sentados, se avisa
      const room = cx.room, m = mesa(room);
      const ids = seated(room).map((u) => u.id), key = ids.join(',');
      if (key === m.seatKey) return;
      m.seatKey = key;
      for (const id of [...m.ready]) if (!ids.includes(id)) m.ready.delete(id);
      for (const id of [...m.marks.keys()]) if (!ids.includes(id)) m.marks.delete(id);
      broadcast(room, { t: 'mesa', ...mesaView(room, false) });
    },
    'mesa:set'(cx, msg) {
      const { user, room, err, allow } = cx;
      if (!isSeated(room, user) || !allow()) return;
      const m = mesa(room);
      const themes = Object.keys(RULES.THEMES);
      if (msg.theme !== undefined) m.theme = RULES.THEMES[msg.theme] ? msg.theme : themes[crypto.randomInt(0, themes.length)];
      if (msg.level !== undefined) m.level = Math.floor(Number(msg.level)) || 1;
      m.level = Math.max(1, Math.min(maxLevel(room), m.level));
      if (msg.reroll || msg.theme !== undefined || msg.level !== undefined) newPlan(m);
      if (msg.reroll) system(room, `🗺️ ${user.name} despliega otro plano en la mesa de partida.`);
      broadcast(room, { t: 'mesa', ...mesaView(room, true) });
      void err;
    },
    'mesa:mark'(cx, msg) {
      const { user, room } = cx;
      if (!isSeated(room, user)) return;
      const m = mesa(room), p = plan(m);
      const x = Math.floor(Number(msg.x)), y = Math.floor(Number(msg.y));
      if (!(x >= 0 && y >= 0 && x < p.w && y < p.h)) return;
      const now = Date.now();
      if (now - (user.lastMark || 0) < 300) return;
      user.lastMark = now;
      const list = (m.marks.get(user.id) || []).filter((k) => k[0] !== x || k[1] !== y);
      if (list.length === (m.marks.get(user.id) || []).length) list.push([x, y]); // otra vez en el mismo sitio la quita
      m.marks.set(user.id, list.slice(-MESA_MARKS));
      broadcast(room, { t: 'mesa', ...mesaView(room, false) });
    },
    'mesa:ready'(cx) {
      const { user, room, err } = cx;
      if (!isSeated(room, user)) return err('Siéntate a la mesa de partida para prepararla.');
      const m = mesa(room);
      if (m.ready.has(user.id)) m.ready.delete(user.id); else m.ready.add(user.id);
      const list = seated(room);
      if (list.length && list.every((u) => m.ready.has(u.id))) return mesaStart(room, list);
      broadcast(room, { t: 'mesa', ...mesaView(room, false) });
    },
  };

  // estado de la mesa de la sala (tema, nivel y semilla del plano: la mazmorra será justo esa)
  function mesa(room) {
    if (!room.mesa) {
      const themes = Object.keys(RULES.THEMES);
      room.mesa = { theme: themes[crypto.randomInt(0, themes.length)], level: 1, seed: '', ready: new Set(), marks: new Map(), seatKey: '' };
      newPlan(room.mesa);
    }
    return room.mesa;
  }
  function newPlan(m) { m.seed = crypto.randomBytes(6).toString('hex'); m.plan = null; m.ready.clear(); m.marks.clear(); }
  function plan(m) {
    if (m.plan && m.plan.key === `${m.theme}|${m.level}|${m.seed}`) return m.plan;
    const d = GEN.generate({ theme: m.theme, level: m.level, seed: m.seed });
    // lo que se ve en el plano: muros y suelo (la sala secreta y las trampas no salen), entrada, jefe, cofres y grupos de enemigos
    const packs = new Map();
    for (const sp of d.spawns) if (!packs.has(sp.pack)) packs.set(sp.pack, [sp.x, sp.y, 0, sp.elite ? 1 : 0]);
    for (const sp of d.spawns) packs.get(sp.pack)[2]++;
    m.plan = {
      key: `${m.theme}|${m.level}|${m.seed}`, name: d.name, w: d.w, h: d.h,
      tiles: d.tiles.replace(/S/g, '#').replace(/\^/g, '.'),
      start: [d.start.x, d.start.y], boss: [d.boss.x, d.boss.y], chests: d.chests.map((c) => [c.x, c.y]), packs: [...packs.values()],
    };
    return m.plan;
  }
  function seated(room) { return [...room.users.values()].filter((u) => !u.where && room.map.atMapTable(u.x, u.y)); }
  function isSeated(room, user) { return !user.where && room.map.atMapTable(user.x, user.y); }
  // el nivel lo marca quien menos tiene (+3, como en el menú de mazmorras)
  function maxLevel(room) { const l = seated(room).map((u) => levelOf(u)); return (l.length ? Math.min(...l) : 1) + 3; }
  function mesaView(room, withPlan) {
    const m = mesa(room), p = plan(m), list = seated(room);
    return {
      theme: m.theme, level: m.level, maxLevel: maxLevel(room), key: p.key, name: p.name,
      seated: list.map((u) => u.id), ready: [...m.ready], marks: Object.fromEntries(m.marks),
      plan: withPlan ? p : undefined,
    };
  }
  function mesaStart(room, list) {
    const m = mesa(room);
    m.level = Math.max(1, Math.min(maxLevel(room), m.level));
    const i = newDungeon(room, m.theme, m.level, null, m.seed);
    system(room, `🗺️ ${list.map((u) => u.name).join(', ')} se levantan de la mesa de partida y bajan juntos a «${i.def.name}» (nivel ${m.level}).`);
    newPlan(m);
    m.seatKey = '';
    for (const u of list) joinInstance(room, u, i);
    broadcast(room, { t: 'mesa', ...mesaView(room, true) });
  }

  // oro directo (sin bonificaciones de la taberna, que sólo cuentan para lo que se gana jugando)
  function payGold(room, user, delta) {
    user.profile.gold = Math.max(0, user.profile.gold + delta);
    saveUser(user); sendMe(user);
    broadcast(room, { t: 'profile', id: user.id, xp: user.profile.xp, gold: user.profile.gold, level: levelOf(user) });
  }
  function diceView(room) {
    const d = room.dice;
    return d ? { bet: d.bet, by: d.by, players: d.players.map((p) => p.name), left: Math.max(0, d.endAt - Date.now()), pot: d.bet * d.players.length } : null;
  }
  function diceEnd(room) {
    const d = room.dice;
    room.dice = null; room.diceTimer = null;
    if (!d) return;
    const here = d.players.map((p) => ({ ...p, user: room.users.get(p.id) })).filter((p) => p.user);
    if (here.length < 2) {
      for (const p of here) payGold(room, p.user, d.bet);
      system(room, '🎲 Nadie se ha sumado a la ronda de dados: se devuelve la apuesta.');
      broadcast(room, { t: 'dice:state', round: null });
      return;
    }
    for (const p of here) { p.a = 1 + Math.floor(rnd() * 6); p.b = 1 + Math.floor(rnd() * 6); p.sum = p.a + p.b; }
    const top = Math.max(...here.map((p) => p.sum));
    const winners = here.filter((p) => p.sum === top);
    const pot = d.bet * d.players.length;
    const share = Math.floor(pot / winners.length);
    for (const w of winners) payGold(room, w.user, share);
    const line = here.map((p) => `${p.name} ${p.a}+${p.b}=${p.sum}`).join(' · ');
    system(room, `🎲 ${line}. ${winners.length > 1 ? `¡Empate! ${winners.map((w) => w.name).join(' y ')} se reparten ${pot} 🪙.` : `¡${winners[0].name} se lleva ${pot} 🪙!`}`);
    broadcast(room, { t: 'dice:result', rolls: here.map((p) => ({ name: p.name, a: p.a, b: p.b, sum: p.sum })), winners: winners.map((w) => w.name), pot });
    broadcast(room, { t: 'dice:state', round: null });
  }
};
