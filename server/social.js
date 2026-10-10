'use strict';
// Hazañas, mejoras de la taberna, mercado, temporadas, recompensa diaria y Asalto semanal.
// Lo usa server.js: recibe lo que necesita del servidor y devuelve sus funciones.
module.exports = function (ctx) {
  const { GEN, PROG, RULES, broadcast, crypto, getInstance, give, giveMats, joinInstance, levelOf, lookFrom, reward, rnd, rooms, saveRoom, saveUser, send, sendMe, store, system } = ctx;

  // ---------- Hazañas de la taberna (lo último que ha pasado) ----------
  function feat(room, text) {
    const key = 'feats:' + room.name;
    const list = store.meta(key) || [];
    list.unshift({ ts: Date.now(), text });
    store.setMeta(key, list.slice(0, 25));
  }
  function tavernView(room, user) {
    const f = room.fund || { gold: 0, donors: {} };
    const donors = Object.values(f.donors || {}).sort((a, b) => b.gold - a.gold).slice(0, 8);
    return { t: 'tavern:info', gold: f.gold, level: PROG.tavernLevel(f), bonus: PROG.tavernBonus(f), donors, feats: store.meta('feats:' + room.name) || [], mine: ((f.donors || {})[user.cid] || {}).gold || 0 };
  }
  function donate(room, user, amount) {
    const n = Math.max(1, Math.min(user.profile.gold, Math.floor(Number(amount) || 0)));
    if (!n || user.profile.gold < n) return false;
    const before = PROG.tavernLevel(room.fund);
    user.profile.gold -= n;
    room.fund = room.fund || { gold: 0, donors: {} };
    room.fund.donors = room.fund.donors || {};
    room.fund.gold += n;
    const d = room.fund.donors[user.cid] || { name: user.name, gold: 0 };
    d.name = user.name; d.gold += n; room.fund.donors[user.cid] = d;
    saveRoom(room); saveUser(user); sendMe(user);
    broadcast(room, { t: 'profile', id: user.id, xp: user.profile.xp, gold: user.profile.gold, level: levelOf(user) });
    const after = PROG.tavernLevel(room.fund);
    if (after > before) {
      const L = PROG.TAVERN_LEVELS[after - 1];
      system(room, `🎉 ¡La taberna mejora! ${L.icon} ${L.name}: ${L.text} para todos los que jueguen aquí.`);
      feat(room, `${L.icon} La taberna consigue «${L.name}» gracias a todos.`);
    }
    return true;
  }

  // ---------- Mercado entre jugadores (común a todos los servidores) ----------
  function marketList() { return store.meta('market') || []; }
  function marketView(user) { return { t: 'market', list: marketList().map((l) => ({ id: l.id, item: l.item, price: l.price, seller: l.sellerName, mine: l.cid === user.cid })), fee: PROG.MARKET.fee }; }
  function payOffline(cid, pid, slot, gold) {
    // si el vendedor está conectado, el oro le llega al momento; si no, se le apunta en su cuenta guardada
    for (const r of rooms.values()) for (const u of r.users.values()) if (u.cid === cid) { u.profile.gold += gold; saveUser(u); sendMe(u); send(u.ws, { t: 'toast', text: `🏪 Has vendido algo en el mercado: +${gold} 🪙` }); return; }
    const acc = store.player(pid);
    if (acc && acc.slots && acc.slots[slot]) { acc.slots[slot].gold = (acc.slots[slot].gold || 0) + gold; acc.slots[slot].marketNews = (acc.slots[slot].marketNews || 0) + gold; store.setPlayer(pid, acc); }
  }

  // ---------- Temporadas ----------
  function seasonAdd(user, pts) {
    if (!pts) return;
    const key = 'season:' + PROG.seasonKey();
    const all = store.meta(key) || {};
    const cur = all[user.cid] || { name: user.name, pts: 0, cls: user.profile.char.cls };
    cur.name = user.name; cur.cls = user.profile.char.cls;
    cur.pts = Math.round((cur.pts + pts) * 10) / 10;
    all[user.cid] = cur;
    store.setMeta(key, all);
  }
  function seasonView(user) {
    const sk = PROG.seasonKey();
    const rows = Object.entries(store.meta('season:' + sk) || {}).map(([cid, r]) => ({ ...r, pts: Math.floor(r.pts), me: cid === user.cid })).sort((a, b) => b.pts - a.pts);
    rows.forEach((r, i) => { r.pos = i + 1; });
    const mine = rows.find((r) => r.me) || null;
    const last = Object.entries(store.meta('season:' + (sk - 1)) || {}).map(([, r]) => ({ name: r.name, pts: Math.floor(r.pts) })).sort((a, b) => b.pts - a.pts).slice(0, 3);
    return { t: 'season', id: sk, ends: PROG.seasonEnds(), top: rows.slice(0, 15), mine, last, aura: user.profile.aura || null };
  }
  // premios de la temporada anterior (se entregan al entrar)
  function seasonPrize(room, user) {
    const p = user.profile, sk = PROG.seasonKey() - 1;
    if (sk < 0 || (p.seasonPaid || -1) >= sk) return;
    p.seasonPaid = sk;
    const rows = Object.entries(store.meta('season:' + sk) || {}).sort((a, b) => b[1].pts - a[1].pts);
    const i = rows.findIndex(([cid]) => cid === user.cid);
    if (i < 0 || rows[i][1].pts < PROG.SEASON.minPts) return saveUser(user);
    const prize = PROG.SEASON_PRIZES.find((z) => i + 1 <= z.rank);
    const title = `${prize.title} ${PROG.seasonNumber(sk)}`;
    p.extraTitles = [...new Set([...(p.extraTitles || []), title])];
    const order = ['temporada', 'bronce', 'plata', 'oro'];
    if (!p.aura || order.indexOf(prize.aura) > order.indexOf(p.aura)) p.aura = prize.aura;
    user.look = lookFrom(p);
    saveUser(user); sendMe(user);
    broadcast(room, { t: 'look', id: user.id, look: user.look });
    system(room, `🏆 ${user.name} recibe «${title}» por la temporada ${PROG.seasonNumber(sk)} (puesto ${i + 1}).`);
    feat(room, `🏆 ${user.name}: «${title}».`);
  }

  // Recompensa diaria (por cuenta, la recoge el personaje que entra)
  function offerLogin(user) {
    const st = PROG.loginState(user.account.daily);
    send(user.ws, { t: 'login:offer', ...st, rewards: PROG.LOGIN_REWARDS });
  }
  function claimLogin(room, user) {
    const acc = user.account, st = PROG.loginState(acc.daily);
    if (st.claimed) return;
    acc.daily = { last: PROG.dayKey(), streak: st.streak };
    const R = st.next, p = user.profile, lvl = levelOf(user);
    const got = [];
    if (R.gold) { reward(room, user, 0, R.gold); got.push(`${R.gold} 🪙`); }
    for (const [cid, n] of Object.entries(R.cons || {})) { p.cons[cid] = (p.cons[cid] || 0) + n; got.push(`${n}× ${RULES.CONSUMABLES[cid].name}`); }
    if (R.mats) { giveMats(room, user, R.mats, true); for (const [k, n] of Object.entries(R.mats)) got.push(`${n} ${PROG.MATS[k].icon}`); }
    if (R.item) {
      const it = R.item === 'cofre'
        ? (rnd() < 0.08 ? RULES.makeItem(rnd, { ilvl: lvl, rarity: 'unico', classes: [p.char.cls], leg: Object.keys(RULES.LEGENDARY)[crypto.randomInt(0, Object.keys(RULES.LEGENDARY).length)] })
          : RULES.makeItem(rnd, { ilvl: lvl, rarity: rnd() < 0.3 ? 'unico' : 'raro', classes: [p.char.cls] }))
        : RULES.makeItem(rnd, { ilvl: lvl, rarity: R.item, classes: [p.char.cls] });
      if (give(room, user, it)) got.push(`«${it.name}»`); else { reward(room, user, 0, it.value); got.push(`${it.value} 🪙 (mochila llena)`); }
    }
    store.setPlayer(user.pid, acc);
    saveUser(user); sendMe(user);
    send(user.ws, { t: 'login:claimed', streak: st.streak, got });
    seasonAdd(user, PROG.SEASON_PTS.daily);
    if (st.streak === 7) { system(room, `🎁 ${user.name} completa una racha de 7 días y abre el gran cofre.`); feat(room, `🎁 ${user.name} completó una racha de 7 días.`); }
  }

  // ---------- Asalto semanal ----------
  function raidInfo(user) {
    const week = PROG.weekKey();
    const rank = ((store.meta('raids') || {})[week] || []).slice(0, 10);
    return { t: 'raid:info', week, theme: PROG.raidTheme(week), mod: PROG.raidMod(week), rank, done: user.profile.raidWeek === week, level: Math.max(levelOf(user), PROG.RAID.minLevel) + PROG.RAID.bonusLevel };
  }
  function startRaid(room, user) {
    const week = PROG.weekKey();
    const level = Math.max(levelOf(user), PROG.RAID.minLevel) + PROG.RAID.bonusLevel;
    // el mapa sale de la semana: el mismo para todos
    const d = GEN.generate({ theme: PROG.raidTheme(week), level, seed: 'asalto-' + week });
    d.id = 'raid' + crypto.randomBytes(3).toString('hex');
    const M = PROG.WEEKLY_MODS[PROG.raidMod(week)];
    d.name = `Asalto semanal · ${d.name}`;
    d.raid = { week, mod: PROG.raidMod(week), start: Date.now() };
    const inst = getInstance(room, d);
    joinInstance(room, user, inst);
    system(room, `⚔️ ${user.name} empieza el Asalto semanal (nivel ${level}, desafío ${M.icon} ${M.name}). ¡Uníos desde 🗝️ Mazmorras: es para jugar en grupo!`);
  }
  function raidDone(room, inst) {
    const R = inst.def.raid, week = R.week;
    const time = Math.round((Date.now() - R.start) / 1000);
    const heroes = [...inst.players.values()].map((p) => p.user);
    const all = store.meta('raids') || {};
    const list = all[week] || [];
    const entry = { names: heroes.map((u) => u.name), time, level: inst.level, at: Date.now() };
    list.push(entry);
    list.sort((a, b) => a.time - b.time);
    const pos = list.indexOf(entry) + 1;
    all[week] = list.slice(0, 20);
    for (const k of Object.keys(all)) if (Number(k) < week - 4) delete all[k]; // sólo las últimas semanas
    store.setMeta('raids', all);
    const mm = Math.floor(time / 60), ss = String(time % 60).padStart(2, '0');
    system(room, `🏆 ${heroes.map((u) => u.name).join(', ')} superan el Asalto semanal en ${mm}:${ss}${pos <= 20 ? ` (puesto ${pos} de la semana)` : ''}.`);
    feat(room, `⚔️ ${heroes.map((u) => u.name).join(', ')} superaron el Asalto semanal en ${mm}:${ss}.`);
    // cofre semanal: una vez por semana y personaje
    for (const u of heroes) seasonAdd(u, PROG.SEASON_PTS.raid);
    for (const u of heroes) {
      if (u.profile.raidWeek === week) { send(u.ws, { t: 'dwhisper', text: 'Ya abriste el cofre del Asalto esta semana: hoy sólo cuenta para la clasificación.' }); continue; }
      u.profile.raidWeek = week;
      const lvl = inst.level, cls = [u.profile.char.cls];
      const items = [RULES.makeItem(rnd, { ilvl: lvl, rarity: rnd() < 0.35 ? 'unico' : 'raro', classes: cls })];
      if (rnd() < 0.1) items.push(RULES.makeItem(rnd, { ilvl: lvl, rarity: 'unico', classes: cls, leg: Object.keys(RULES.LEGENDARY)[crypto.randomInt(0, Object.keys(RULES.LEGENDARY).length)] }));
      const got = [];
      for (const it of items) { if (give(room, u, it)) got.push(`«${it.name}»`); }
      reward(room, u, 0, 40 * lvl); got.push(`${40 * lvl} 🪙`);
      giveMats(room, u, { esencia: 3, polvo: 2 }, true);
      send(u.ws, { t: 'dwhisper', text: `🎁 Cofre del Asalto semanal: ${got.join(', ')}, 3 💠 y 2 ✨.` });
    }
  }

  return { claimLogin, donate, feat, marketList, marketView, offerLogin, payOffline, raidDone, raidInfo, seasonAdd, seasonPrize, seasonView, startRaid, tavernView };
};
