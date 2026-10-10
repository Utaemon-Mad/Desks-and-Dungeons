'use strict';
// Mensajes de misiones, tablón, fama, taberna, mercado, Descenso, Asalto, duelos y recompensas.
// Cada mensaje recibe cx = { ws, user, room, err, allow, allowGame, isOwner, inst, nearShopNpc, roll, command } (la conexión) y el mensaje.
module.exports = function (ctx) {
  const { PROG, RULES, broadcast, crypto, levelOf, profileChanged, questState, reward, rnd, saveUser, send, sendMe, store, system } = ctx;
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
  };
};
