'use strict';
// Tablón, logros, clasificaciones semanales, materiales, oficios, mascotas y jefes de mundo.
// Lo usa server.js: recibe lo que necesita del servidor y devuelve sus funciones.
module.exports = function (ctx) {
  const { PROG, RULES, broadcast, give, levelOf, profileChanged, reward, rnd, saveUser, send, sendMe, store, system } = ctx;
  const seasonAdd = (...a) => ctx.seasonAdd(...a); // de server/social.js

  // ---------- Tablón, logros, títulos y clasificaciones ----------
  function ensureBoard(p) {
    const day = PROG.dayKey(), week = PROG.weekKey();
    const b = p.board;
    if (b && b.day === day && b.week === week) return;
    const nb = PROG.boardFor(day, week);
    const sameWeek = b && b.week === week;
    const prog = {}, claimed = [];
    if (sameWeek) for (const id of nb.weekly) { if (b.prog && b.prog[id]) prog[id] = b.prog[id]; if (b.claimed && b.claimed.includes(id)) claimed.push(id); }
    p.board = { day, week, daily: nb.daily, weekly: nb.weekly, prog, claimed };
  }

  const STAT_OF = { kill: 'kills', dungeon: 'dungeons', floor: 'floor', duel: 'duels', fish: 'fish', herb: 'herbs', cook: 'cook', forge: 'upmax', legend: 'legend', level: 'level', quest: 'quests', task: 'tasks', petlvl: 'petlvl', worldboss: 'worldboss', chest: 'chests', mat: 'mats' };
  const RANK_OF = { kill: 'kills', worldboss: 'worldboss', duel: 'duels', floor: 'floor' };

  // Un suceso del juego: cuenta para las estadísticas, el tablón, los logros y las clasificaciones
  function track(room, user, ev, d = {}) {
    const p = user.profile;
    const n = d.n || 1;
    const st = STAT_OF[ev];
    if (st) {
      if (PROG.MAX_STATS.has(st)) { if (d.value !== undefined) p.stats[st] = Math.max(p.stats[st] || 0, d.value); }
      else p.stats[st] = (p.stats[st] || 0) + n;
    }
    if (ev === 'kill' && d.boss) { p.stats.bosses = (p.stats.bosses || 0) + 1; rankAdd(user, 'bosses', 1); }
    // puntos de temporada
    const SP = PROG.SEASON_PTS;
    seasonAdd(user, ev === 'kill' ? (d.boss ? SP.boss : d.elite ? SP.elite : SP.kill) * n : ev === 'floor' ? SP.floor : SP[ev] ? SP[ev] * n : 0);
    if (RANK_OF[ev]) rankAdd(user, RANK_OF[ev], PROG.BOARDS[RANK_OF[ev]].max ? d.value : n);
    // tablón
    ensureBoard(p);
    let visible = false;
    for (const id of [...p.board.daily, ...p.board.weekly]) {
      if (p.board.claimed.includes(id)) continue;
      const T = PROG.taskDef(id);
      if (!T || !PROG.taskMatch(T, ev, d)) continue;
      const before = p.board.prog[id] || 0;
      if (before >= T.n) continue;
      p.board.prog[id] = T.max ? Math.max(before, d.value || 0) : before + n;
      if (p.board.prog[id] >= T.n) { visible = true; send(user.ws, { t: 'dwhisper', text: `📋 Tarea completada: «${PROG.taskText(id)}». Recoge la recompensa en el Tablón de la taberna.` }); }
    }
    if (checkAchievements(room, user)) visible = true;
    user.meDirty = true;
    if (visible) { saveUser(user); sendMe(user); }
  }

  function checkAchievements(room, user) {
    const p = user.profile;
    let got = false;
    for (const a of PROG.ACHIEVEMENTS) {
      if (p.achievements.includes(a.id) || (p.stats[a.stat] || 0) < a.n) continue;
      p.achievements.push(a.id);
      got = true;
      p.gold += a.gold;
      send(user.ws, { t: 'achievement', id: a.id, name: a.name, title: a.title || null, gold: a.gold });
      system(room, `🏅 ${user.name} consigue el logro «${a.name}»${a.title ? ` y el título «${a.title}»` : ''}.`);
    }
    if (got) broadcast(room, { t: 'profile', id: user.id, xp: p.xp, gold: p.gold, level: levelOf(user) });
    return got;
  }


  function rankAdd(user, cat, v) {
    if (!v) return;
    const key = 'ranks:' + PROG.weekKey();
    const all = store.meta(key) || {};
    const tab = all[cat] || (all[cat] = {});
    const cur = tab[user.cid] || { name: user.name, v: 0 };
    cur.name = user.name;
    cur.v = PROG.BOARDS[cat].max ? Math.max(cur.v, v) : cur.v + v;
    tab[user.cid] = cur;
    store.setMeta(key, all);
  }

  function ranksView(user) {
    const week = PROG.weekKey();
    const all = store.meta('ranks:' + week) || {};
    const boards = {};
    for (const cat of Object.keys(PROG.BOARDS)) {
      const tab = all[cat] || {};
      boards[cat] = Object.entries(tab).map(([pid, r]) => ({ name: r.name, v: Math.round(r.v * 10) / 10, me: pid === user.cid })).sort((a, b) => b.v - a.v).slice(0, 10);
      const mine = tab[user.cid];
      if (mine && !boards[cat].some((r) => r.me)) boards[cat].push({ name: mine.name, v: mine.v, me: true, pos: Object.values(tab).filter((r) => r.v > mine.v).length + 1 });
    }
    return { t: 'ranks', week, mod: PROG.weekMod(week), boards, ends: (week + 1) * 7 * 86400000 + 4 * 86400000 };
  }

  // ---------- Materiales, oficios y mascotas ----------

  function giveMats(room, user, mats, silent) {
    const p = user.profile;
    let forge = 0;
    for (const [k, n] of Object.entries(mats)) {
      if (!PROG.MATS[k] || !n) continue;
      p.mats[k] = (p.mats[k] || 0) + n;
      if (PROG.MATS[k].kind === 'forja') forge += n;
    }
    if (forge) track(room, user, 'mat', { n: forge });
    else user.meDirty = true;
    if (!silent) { saveUser(user); sendMe(user); }
  }
  function takeMats(p, need) {
    for (const [k, n] of Object.entries(need)) if (n && (p.mats[k] || 0) < n) return false;
    for (const [k, n] of Object.entries(need)) if (n) { p.mats[k] -= n; if (p.mats[k] <= 0) delete p.mats[k]; }
    return true;
  }
  const matsText = (need) => Object.entries(need).filter(([k, n]) => n && PROG.MATS[k]).map(([k, n]) => `${n} ${PROG.MATS[k].icon} ${PROG.MATS[k].name}`).join(', ');

  function onKill(room, user, k, info) {
    track(room, user, 'kill', info);
    if (info.boss && !user.profile.trophies.includes(k)) {
      user.profile.trophies.push(k);
      send(user.ws, { t: 'dwhisper', text: `🏆 Nuevo trofeo para tu habitación: ${(RULES.MONSTERS[k] || {}).name || k}.` });
    }
  }

  function petXp(room, user, xp) {
    const pet = user.profile.pet;
    if (!pet) return;
    const before = RULES.petLevelFromXp(pet.xp);
    pet.xp += xp;
    const after = RULES.petLevelFromXp(pet.xp);
    if (after <= before) { user.meDirty = true; return; }
    const evo = RULES.petEvo(after) > RULES.petEvo(before);
    send(user.ws, { t: 'dwhisper', text: `🐾 ${pet.name} sube a nivel ${after}${after === RULES.PET_SKILL_LEVEL ? ` y aprende «${RULES.PET_SKILLS[pet.type].name}»` : ''}.` });
    if (evo) system(room, `✨ ¡${pet.name}, la mascota de ${user.name}, evoluciona en ${RULES.petTitle(pet.type, after)}!`);
    track(room, user, 'petlvl', { value: after });
    profileChanged(room, user);
  }

  function caughtFish(room, user, zone) {
    const f = PROG.catchFish(rnd, zone);
    const F = PROG.MATS[f.id];
    const p = user.profile;
    const record = f.w > (p.stats.bigfish || 0);
    if (record) { p.stats.bigfish = f.w; rankAdd(user, 'bigfish', f.w); }
    giveMats(room, user, { [f.id]: 1 }, true);
    track(room, user, 'fish', { w: f.w });
    if (f.id === 'dorado') { p.stats.goldfish = (p.stats.goldfish || 0) + 1; checkAchievements(room, user); system(room, `🌟 ¡${user.name} ha pescado un ${F.name} de ${f.w} kg!`); }
    send(user.ws, { t: 'dwhisper', text: `🎣 ¡Has pescado ${F.icon} ${F.name} (${f.w} kg)!${record ? ' ¡Tu récord!' : ''}` });
    saveUser(user); sendMe(user);
  }

  function gotHerb(room, user, zone) {
    const id = PROG.HERB_BY_ZONE[Math.max(0, Math.min(5, zone))];
    const n = rnd() < 0.3 ? 2 : 1;
    giveMats(room, user, { [id]: n }, true);
    track(room, user, 'herb', { n });
    send(user.ws, { t: 'dwhisper', text: `🌿 Recoges ${n} ${PROG.MATS[id].icon} ${PROG.MATS[id].name}.` });
    saveUser(user); sendMe(user);
  }

  function worldBossDown(room, users, m, killer) {
    system(room, `🏆 ¡${m.name} ha caído a manos de ${killer.name}! ${users.length > 1 ? users.map((u) => u.name).join(', ') + ' se reparten' : 'Se lleva'} un botín raro o único.`);
    for (const u of users) {
      const rarity = rnd() < 0.2 ? 'unico' : 'raro';
      const it = RULES.makeItem(rnd, { ilvl: m.level, rarity, classes: [u.profile.char.cls] });
      if (give(room, u, it)) send(u.ws, { t: 'dgot', item: it });
      else send(u.ws, { t: 'dwhisper', text: 'Tu mochila estaba llena: te quedas sin el objeto del jefe.' });
      giveMats(room, u, { esencia: 3, polvo: 1 }, true);
      if (!u.profile.trophies.includes(m.k)) u.profile.trophies.push(m.k);
      track(room, u, 'worldboss', { n: 1 });
      reward(room, u, Math.round(m.xp * 0.5), Math.round(m.gold[1]));
      profileChanged(room, u);
    }
  }

  return { caughtFish, ensureBoard, giveMats, gotHerb, matsText, onKill, petXp, ranksView, takeMats, track, worldBossDown };
};
