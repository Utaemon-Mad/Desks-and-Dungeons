'use strict';
// Mensajes de tiendas, comercio, establo, forja y cocina.
// Cada mensaje recibe cx = { ws, user, room, err, allow, allowGame, isOwner, inst, nearShopNpc, roll, command } (la conexión) y el mensaje.
module.exports = function (ctx) {
  const { PROG, RULES, broadcast, cleanText, crypto, levelOf, profileChanged, rnd, send, system } = ctx;
  const endTrade = (...a) => ctx.endTrade(...a); // de server/trade.js
  const giveMats = (...a) => ctx.giveMats(...a); // de server/progress.js
  const matsText = (...a) => ctx.matsText(...a); // de server/progress.js
  const sendTrade = (...a) => ctx.sendTrade(...a); // de server/trade.js
  const shopFor = (...a) => ctx.shopFor(...a); // de server/trade.js
  const takeMats = (...a) => ctx.takeMats(...a); // de server/progress.js
  const track = (...a) => ctx.track(...a); // de server/progress.js
  const trades = ctx.trades; // de server/trade.js (Map)

  return {
    'shop:open'(cx, msg) {
      const { ws, user, room, err, allow, allowGame, isOwner, inst, nearShopNpc, roll, command } = cx;
    if (user.where && !nearShopNpc()) return;
    const s = shopFor(user, msg.npc);
    if (s) send(ws, { t: 'shop', ...s });
    return;
    },
    'shop:buy'(cx, msg) {
      const { ws, user, room, err, allow, allowGame, isOwner, inst, nearShopNpc, roll, command } = cx;
    if ((user.where && !(msg.npc === 'bruja' && nearShopNpc())) || !allow(0.5)) return;
    const s = shopFor(user, msg.npc);
    if (!s) return;
    const p = user.profile;
    if (msg.npc === 'armero') {
      const it = s.items[msg.i];
      if (!it || it.sold) return err('Ya no está a la venta.');
      if (p.gold < it.price) return err('No tienes oro suficiente.');
      if (p.bag.length >= RULES.BAG_SIZE) return err('Tu mochila está llena.');
      p.gold -= it.price;
      const { price, sold, ...item } = it; void price; void sold;
      item.id = crypto.randomBytes(5).toString('hex');
      p.bag.push(item);
      if (!user.shopBought || user.shopBought.bucket !== s.bucket) user.shopBought = { bucket: s.bucket, set: new Set() };
      user.shopBought.set.add(msg.i);
    } else if (msg.buff) {
      const b = s.buffs && s.buffs.find((x) => x.id === msg.buff);
      if (!b) return;
      if (p.gold < b.price) return err('No tienes oro suficiente.');
      p.gold -= b.price;
      p.buffs[b.id] = Math.max(Date.now(), p.buffs[b.id] || 0) + RULES.BUFFS[b.id].min * 60000;
      system(room, `✨ El Hombre de la Túnica murmura algo… ${user.name} recibe ${RULES.BUFFS[b.id].name}.`);
    } else {
      const c = s.list.find((x) => x.id === msg.id);
      const n = Math.max(1, Math.min(20, Math.floor(Number(msg.n) || 1)));
      if (!c) return;
      if (p.gold < c.price * n) return err('No tienes oro suficiente.');
      p.gold -= c.price * n;
      p.cons[c.id] = (p.cons[c.id] || 0) + n;
    }
    profileChanged(room, user);
    broadcast(room, { t: 'profile', id: user.id, xp: p.xp, gold: p.gold, level: levelOf(user) });
    send(ws, { t: 'shop', ...shopFor(user, msg.npc) });
    return;
    },
    'shop:sell'(cx, msg) {
      const { ws, user, room, err, allow, allowGame, isOwner, inst, nearShopNpc, roll, command } = cx;
    if (user.where || user.trade) return;
    const p = user.profile;
    const ids = Array.isArray(msg.ids) ? msg.ids : [msg.id];
    let total = 0;
    for (const id of ids.slice(0, RULES.BAG_SIZE)) {
      const i = p.bag.findIndex((it) => it.id === id);
      if (i < 0) continue;
      total += p.bag[i].value;
      p.bag.splice(i, 1);
    }
    if (!total) return;
    p.gold += total;
    profileChanged(room, user);
    broadcast(room, { t: 'profile', id: user.id, xp: p.xp, gold: p.gold, level: levelOf(user) });
    send(ws, { t: 'sold', gold: total });
    return;
    },
    'trade:req'(cx, msg) {
      const { ws, user, room, err, allow, allowGame, isOwner, inst, nearShopNpc, roll, command } = cx;
    const other = room.users.get(msg.to);
    if (!other || other === user || !allow()) return;
    if (user.where || other.where) return err('Los dos tenéis que estar en la taberna.');
    if (user.trade || other.trade) return err('Alguien ya está comerciando.');
    other.tradeInvite = user.id;
    send(other.ws, { t: 'trade:invite', from: user.id, name: user.name });
    send(ws, { t: 'system', text: `Has propuesto comerciar a ${other.name}.`, ts: Date.now() });
    return;
    },
    'trade:accept'(cx, msg) {
      const { ws, user, room, err, allow, allowGame, isOwner, inst, nearShopNpc, roll, command } = cx;
    const other = room.users.get(msg.from);
    if (!other || user.tradeInvite !== other.id || other.trade || user.trade || other.where || user.where) return err('La propuesta ya no vale.');
    user.tradeInvite = null;
    const t = { id: crypto.randomBytes(4).toString('hex'), a: other, b: user, offer: { [other.id]: { items: [], gold: 0 }, [user.id]: { items: [], gold: 0 } }, ok: {} };
    trades.set(t.id, t);
    other.trade = t; user.trade = t;
    sendTrade(t);
    return;
    },
    'trade:offer'(cx, msg) {
      const { ws, user, room, err, allow, allowGame, isOwner, inst, nearShopNpc, roll, command } = cx;
    const t = user.trade;
    if (!t) return;
    const items = (Array.isArray(msg.items) ? msg.items : []).filter((id) => user.profile.bag.some((it) => it.id === id)).slice(0, 12);
    const gold = Math.max(0, Math.min(user.profile.gold, Math.floor(Number(msg.gold) || 0)));
    t.offer[user.id] = { items: [...new Set(items)], gold };
    t.ok = {};
    sendTrade(t);
    return;
    },
    'trade:ok'(cx, msg) {
      const { ws, user, room, err, allow, allowGame, isOwner, inst, nearShopNpc, roll, command } = cx;
    const t = user.trade;
    if (!t) return;
    t.ok[user.id] = true;
    if (!(t.ok[t.a.id] && t.ok[t.b.id])) return sendTrade(t);
    // los dos aceptan: se comprueba todo y se intercambia
    const A = t.a, B = t.b, oa = t.offer[A.id], ob = t.offer[B.id];
    const has = (u, o) => o.items.every((id) => u.profile.bag.some((it) => it.id === id)) && u.profile.gold >= o.gold;
    if (!has(A, oa) || !has(B, ob)) return endTrade(t, 'El comercio se ha cancelado: algo cambió.');
    if (A.profile.bag.length - oa.items.length + ob.items.length > RULES.BAG_SIZE || B.profile.bag.length - ob.items.length + oa.items.length > RULES.BAG_SIZE) return endTrade(t, 'No cabe todo en las mochilas.');
    const take = (u, ids) => { const out = u.profile.bag.filter((it) => ids.includes(it.id)); u.profile.bag = u.profile.bag.filter((it) => !ids.includes(it.id)); return out; };
    const fromA = take(A, oa.items), fromB = take(B, ob.items);
    A.profile.bag.push(...fromB); B.profile.bag.push(...fromA);
    A.profile.gold += ob.gold - oa.gold; B.profile.gold += oa.gold - ob.gold;
    for (const u of [A, B]) { profileChanged(room, u); broadcast(room, { t: 'profile', id: u.id, xp: u.profile.xp, gold: u.profile.gold, level: levelOf(u) }); }
    endTrade(t, '¡Trato hecho!');
    system(room, `🤝 ${A.name} y ${B.name} cierran un trato.`);
    return;
    },
    'trade:cancel'(cx, msg) {
      const { ws, user, room, err, allow, allowGame, isOwner, inst, nearShopNpc, roll, command } = cx;
    if (user.trade) endTrade(user.trade, `${user.name} cancela el comercio.`);
    else if (msg.from) { const o = room.users.get(msg.from); user.tradeInvite = null; if (o) send(o.ws, { t: 'system', text: `${user.name} no quiere comerciar ahora.`, ts: Date.now() }); }
    return;
    },
    'stable:buy'(cx, msg) {
      const { ws, user, room, err, allow, allowGame, isOwner, inst, nearShopNpc, roll, command } = cx;
    if (user.where || !allow(1)) return;
    const p = user.profile, lvl = levelOf(user);
    if (msg.kind === 'pet') {
      const P = RULES.PETS[msg.id];
      if (!P) return;
      if (lvl < RULES.PET_LEVEL) return err(`Las mascotas se adoptan a partir del nivel ${RULES.PET_LEVEL}.`);
      if (p.pet && p.pet.bag.length) return err('Vacía la mochila de tu mascota antes de cambiarla.');
      if (p.gold < P.price) return err('No tienes oro suficiente.');
      p.gold -= P.price;
      p.pet = { type: msg.id, name: cleanText(msg.name, 16) || P.name, bag: [] };
      system(room, `🐾 ${user.name} adopta: ${p.pet.name}.`);
    } else if (msg.kind === 'mount') {
      const M = RULES.MOUNTS[msg.id];
      if (!M) return;
      if (lvl < M.minLevel) return err(`Esta montura pide nivel ${M.minLevel}.`);
      if (p.gold < M.price) return err('No tienes oro suficiente.');
      p.gold -= M.price;
      p.mount = msg.id;
      system(room, `🐎 ${user.name} compra: ${M.name}.`);
    } else return;
    profileChanged(room, user);
    broadcast(room, { t: 'profile', id: user.id, xp: p.xp, gold: p.gold, level: lvl });
    return;
    },
    'pet:put'(cx, msg) {
      const { ws, user, room, err, allow, allowGame, isOwner, inst, nearShopNpc, roll, command } = cx;
    const p = user.profile;
    if (!p.pet || user.trade) return;
    const from = msg.t === 'pet:put' ? p.bag : p.pet.bag, to = msg.t === 'pet:put' ? p.pet.bag : p.bag;
    const i = from.findIndex((it) => it.id === msg.id);
    if (i < 0) return;
    const it = from[i];
    if (msg.t === 'pet:put') {
      const cap = RULES.petStats(p.pet.type, levelOf(user), RULES.petLevelFromXp(p.pet.xp)).cap;
      if (RULES.petBagWeight(p.pet) + RULES.itemWeight(it) > cap) return err(`${p.pet.name} no puede con tanto peso (${cap} kg).`);
    } else if (p.bag.length >= RULES.BAG_SIZE) return err('Tu mochila está llena.');
    from.splice(i, 1); to.push(it);
    profileChanged(room, user);
    return;
    },
    'pet:take'(cx, msg) { return this['pet:put'](cx, msg); },
    'forge:up'(cx, msg) {
      const { ws, user, room, err, allow, allowGame, isOwner, inst, nearShopNpc, roll, command } = cx;
    if (user.where || user.trade || !allow(0.5)) return;
    const p = user.profile;
    const it = p.bag.find((x) => x.id === msg.id) || Object.values(p.equip).find((x) => x && x.id === msg.id);
    if (!it) return;
    if (msg.t === 'forge:up') {
      if ((it.up || 0) >= PROG.MAX_UP) return err('Ese objeto ya está al máximo (+10).');
      const c = PROG.upgradeCost(it);
      if (p.gold < c.gold) return err(`Necesitas ${c.gold} 🪙.`);
      if (!takeMats(p, { hierro: c.hierro, esencia: c.esencia, polvo: c.polvo })) return err(`Te faltan materiales: ${matsText({ hierro: c.hierro, esencia: c.esencia, polvo: c.polvo })}.`);
      p.gold -= c.gold;
      const ok = rnd() < c.chance;
      if (ok) PROG.applyUpgrade(it);
      track(room, user, 'forge', { value: it.up || 0 });
      profileChanged(room, user, { look: Object.values(p.equip).includes(it) });
      send(ws, { t: 'forge:result', ok, item: it, text: ok ? `⚒️ ¡Clang! «${it.name}» queda más fuerte.` : '⚒️ El metal se resiste… La mejora ha fallado (el objeto no se rompe, pero los materiales se pierden).' });
      if (ok && it.up >= 7) system(room, `⚒️ Brunilda la herrera mejora «${it.name}» para ${user.name}.`);
    } else {
      const c = PROG.enchantCost(it);
      if (!it.stats || it.stats[msg.key] === undefined) return;
      if (p.gold < c.gold) return err(`Necesitas ${c.gold} 🪙.`);
      if (!takeMats(p, { esencia: c.esencia, polvo: c.polvo })) return err(`Te faltan materiales: ${matsText({ esencia: c.esencia, polvo: c.polvo })}.`);
      p.gold -= c.gold;
      const r = PROG.enchant(rnd, it, msg.key);
      if (!r) return err('No se puede encantar esa propiedad.');
      track(room, user, 'forge', { value: it.up || 0 });
      profileChanged(room, user);
      send(ws, { t: 'forge:result', ok: true, item: it, text: `✨ ${RULES.statName(r.from) || r.from} se convierte en ${RULES.fmtStat(r.to, r.v)}.` });
    }
    broadcast(room, { t: 'profile', id: user.id, xp: p.xp, gold: p.gold, level: levelOf(user) });
    return;
    },
    'forge:enchant'(cx, msg) { return this['forge:up'](cx, msg); },
    'forge:combine'(cx, msg) {
      const { ws, user, room, err, allow, allowGame, isOwner, inst, nearShopNpc, roll, command } = cx;
    if (user.where || user.trade || !allow(0.5)) return;
    const p = user.profile;
    const ids = [...new Set(Array.isArray(msg.ids) ? msg.ids : [])].slice(0, 3);
    const items = ids.map((id) => p.bag.find((x) => x.id === id)).filter(Boolean);
    if (items.length !== 3) return err('Elige tres objetos de la mochila.');
    if (!PROG.COMBINE_TO[items[0].rarity] || items.some((x) => x.rarity !== items[0].rarity)) return err('Los tres tienen que ser de la misma calidad (normal, superior, inferior, mágico o raro).');
    const ilvl = Math.round(items.reduce((t, x) => t + x.ilvl, 0) / 3);
    const c = PROG.combineCost(items[0].rarity, ilvl);
    if (p.gold < c.gold) return err(`Necesitas ${c.gold} 🪙.`);
    if (!takeMats(p, { esencia: c.esencia, polvo: c.polvo })) return err(`Te faltan materiales: ${matsText({ esencia: c.esencia, polvo: c.polvo })}.`);
    p.gold -= c.gold;
    p.bag = p.bag.filter((x) => !ids.includes(x.id));
    const out = PROG.combine(rnd, items, [p.char.cls]);
    p.bag.push(out);
    track(room, user, 'forge', { value: 0 });
    if (out.rarity === 'unico') track(room, user, 'legend', {});
    profileChanged(room, user);
    broadcast(room, { t: 'profile', id: user.id, xp: p.xp, gold: p.gold, level: levelOf(user) });
    send(ws, { t: 'forge:result', ok: true, item: out, text: `🔥 Los tres objetos se funden en «${out.name}».` });
    send(ws, { t: 'dgot', item: out });
    return;
    },
    'forge:salvage'(cx, msg) {
      const { ws, user, room, err, allow, allowGame, isOwner, inst, nearShopNpc, roll, command } = cx;
    if (user.where || user.trade || !allow(0.5)) return;
    const p = user.profile;
    const ids = new Set((Array.isArray(msg.ids) ? msg.ids : [msg.id]).slice(0, RULES.BAG_SIZE));
    const got = {};
    for (const it of p.bag.filter((x) => ids.has(x.id))) for (const [k, n] of Object.entries(PROG.salvage(it))) got[k] = (got[k] || 0) + n;
    if (!Object.keys(got).length) return;
    p.bag = p.bag.filter((x) => !ids.has(x.id));
    giveMats(room, user, got, true);
    profileChanged(room, user);
    send(ws, { t: 'forge:result', ok: true, text: `🔨 Desguazado: ${matsText(got)}.` });
    return;
    },
    'cook'(cx, msg) {
      const { ws, user, room, err, allow, allowGame, isOwner, inst, nearShopNpc, roll, command } = cx;
    if (user.where || !allow(0.5)) return;
    const R = PROG.RECIPES[msg.id];
    if (!R) return;
    const p = user.profile;
    const price = PROG.COOK_PRICE * Math.max(1, Math.ceil(levelOf(user) / 5));
    if (p.gold < price) return err(`Alfonso cobra ${price} 🪙 por cocinar.`);
    if (!takeMats(p, R.need)) return err(`Te faltan ingredientes: ${matsText(R.need)}.`);
    p.gold -= price;
    for (const k of Object.keys(p.buffs)) if (k.startsWith('comida:')) delete p.buffs[k];
    p.buffs['comida:' + msg.id] = Date.now() + PROG.FOOD_MIN * 60000;
    track(room, user, 'cook', {});
    profileChanged(room, user);
    broadcast(room, { t: 'profile', id: user.id, xp: p.xp, gold: p.gold, level: levelOf(user) });
    broadcast(room, { t: 'emote', id: user.id, e: 'cheers' });
    system(room, `🍲 Alfonso el Tabernero sirve ${R.icon} ${R.name} a ${user.name}. (${R.desc})`);
    return;
    },
  };
};
