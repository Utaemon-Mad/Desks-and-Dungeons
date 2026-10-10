'use strict';
// Mensajes del personaje: puntos, talentos, clase y aspecto, equipo y títulos.
// Cada mensaje recibe cx = { ws, user, room, err, allow, allowGame, isOwner, inst, nearShopNpc, roll, command } (la conexión) y el mensaje.
module.exports = function (ctx) {
  const { MAP, PROG, RULES, broadcast, changeChar, levelOf, profileChanged, saveUser, sendMe, statsWithout, system } = ctx;

  return {
    'char:points'(cx, msg) {
      const { ws, user, room, err, allow, allowGame, isOwner, inst, nearShopNpc, roll, command } = cx;
    // { alloc: { fue: 2, vit: 3 } } suma puntos libres
    const lvl = levelOf(user);
    const add = msg.alloc || {};
    let want = 0;
    for (const k of RULES.STAT_IDS) want += Math.max(0, Math.floor(Number(add[k]) || 0));
    if (!want) return;
    if (want > RULES.pointsFree(user.profile.char, lvl)) return err('No tienes tantos puntos.');
    for (const k of RULES.STAT_IDS) {
      const n = Math.max(0, Math.floor(Number(add[k]) || 0));
      if (n > RULES.statRoom(user.profile.char, k)) return err(`${RULES.statName(k)} no puede pasar de ${RULES.STAT_MAX} de forma natural.`);
    }
    for (const k of RULES.STAT_IDS) user.profile.char.alloc[k] += Math.max(0, Math.floor(Number(add[k]) || 0));
    profileChanged(room, user);
    return;
    },
    'talent:add'(cx, msg) {
      const { ws, user, room, err, allow, allowGame, isOwner, inst, nearShopNpc, roll, command } = cx;
    const c = user.profile.char;
    const why = RULES.canTalent(c, levelOf(user), String(msg.id || ''));
    if (why) return err(why);
    c.talents = c.talents || {};
    c.talents[msg.id] = (c.talents[msg.id] || 0) + 1;
    profileChanged(room, user);
    return;
    },
    'talent:reset'(cx, msg) {
      const { ws, user, room, err, allow, allowGame, isOwner, inst, nearShopNpc, roll, command } = cx;
    if (user.where) return err('Vuelve a la taberna para reiniciar tus talentos.');
    const cost = 15 * levelOf(user);
    if (!RULES.talentSpent(user.profile.char.talents)) return;
    if (user.profile.gold < cost) return err(`Reiniciar los talentos cuesta ${cost} de oro.`);
    user.profile.gold -= cost;
    user.profile.char.talents = {};
    profileChanged(room, user);
    broadcast(room, { t: 'profile', id: user.id, xp: user.profile.xp, gold: user.profile.gold, level: levelOf(user) });
    return;
    },
    'char:respec'(cx, msg) {
      const { ws, user, room, err, allow, allowGame, isOwner, inst, nearShopNpc, roll, command } = cx;
    if (user.where) return err('Vuelve a la taberna para reiniciar tus puntos.');
    const cost = 10 * levelOf(user);
    if (user.profile.gold < cost) return err(`Reiniciar los puntos cuesta ${cost} de oro.`);
    user.profile.gold -= cost;
    user.profile.char.alloc = Object.fromEntries(RULES.STAT_IDS.map((k) => [k, 0]));
    profileChanged(room, user);
    broadcast(room, { t: 'profile', id: user.id, xp: user.profile.xp, gold: user.profile.gold, level: levelOf(user) });
    return;
    },
    'char:save'(cx, msg) {
      const { ws, user, room, err, allow, allowGame, isOwner, inst, nearShopNpc, roll, command } = cx;
    if (!allow(1)) return;
    if (user.where) return err('Vuelve a la taberna para cambiar de clase o de aspecto.');
    const look = MAP.cleanLook({ ...msg.look });
    const changed = changeChar(user.profile, look);
    if (changed.cls) user.profile.char.talents = {}; // los talentos son de cada clase
    profileChanged(room, user, { look: true });
    if (changed.cls || changed.race) {
      const c = user.profile.char;
      system(room, `📜 ${user.name} es ahora ${RULES.RACES[RULES.raceId(c.look.species)].name.toLowerCase()} ${RULES.CLASSES[c.cls].name.toLowerCase()}. Sus puntos vuelven para repartirlos de nuevo.`);
    }
    return;
    },
    'inv:equip'(cx, msg) {
      const { ws, user, room, err, allow, allowGame, isOwner, inst, nearShopNpc, roll, command } = cx;
    if (user.trade) return err('Termina el comercio primero.');
    const p = user.profile;
    const i = p.bag.findIndex((it) => it.id === msg.id);
    if (i < 0) return;
    const it = p.bag[i];
    const ok = RULES.canEquip(it, p.char, levelOf(user), statsWithout(p, it.slot));
    if (!ok.ok) return err(ok.reason);
    p.bag.splice(i, 1);
    const out = [];
    if (p.equip[it.slot]) out.push(p.equip[it.slot]);
    // a dos manos no deja llevar nada en la izquierda (y al revés)
    if (it.slot === 'arma' && RULES.WEAPONS[it.base].hands === 2 && p.equip.mano) { out.push(p.equip.mano); delete p.equip.mano; }
    if (it.slot === 'mano' && p.equip.arma && RULES.WEAPONS[p.equip.arma.base].hands === 2) { out.push(p.equip.arma); delete p.equip.arma; }
    if (p.bag.length + out.length > RULES.BAG_SIZE) { p.bag.splice(i, 0, it); return err('No cabe en la mochila lo que te quitas.'); }
    p.equip[it.slot] = it;
    p.bag.push(...out);
    profileChanged(room, user, { look: true });
    return;
    },
    'inv:unequip'(cx, msg) {
      const { ws, user, room, err, allow, allowGame, isOwner, inst, nearShopNpc, roll, command } = cx;
    const p = user.profile;
    if (!RULES.SLOTS[msg.slot] || !p.equip[msg.slot]) return;
    if (p.bag.length >= RULES.BAG_SIZE) return err('Tu mochila está llena.');
    p.bag.push(p.equip[msg.slot]);
    delete p.equip[msg.slot];
    profileChanged(room, user, { look: true });
    return;
    },
    'inv:drop'(cx, msg) {
      const { ws, user, room, err, allow, allowGame, isOwner, inst, nearShopNpc, roll, command } = cx;
    if (user.trade) return err('Termina el comercio primero.');
    const p = user.profile;
    const i = p.bag.findIndex((it) => it.id === msg.id);
    if (i < 0) return;
    p.bag.splice(i, 1);
    profileChanged(room, user);
    return;
    },
    'title:set'(cx, msg) {
      const { ws, user, room, err, allow, allowGame, isOwner, inst, nearShopNpc, roll, command } = cx;
    const p = user.profile;
    const title = msg.title ? String(msg.title) : null;
    if (title && !PROG.ACHIEVEMENTS.some((a) => a.title === title && p.achievements.includes(a.id)) && !(p.extraTitles || []).includes(title)) return;
    p.title = title;
    saveUser(user); sendMe(user);
    broadcast(room, { t: 'title', id: user.id, title });
    return;
    },
  };
};
