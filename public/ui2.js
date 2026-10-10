/* global DD, RULES, PROG, VIEW3D */
// Ventanas del pueblo: forja de Brunilda, cocina de Alfonso, tablón de misiones, fama (logros, títulos y
// clasificación semanal), habitación con trofeos, duelos en la arena, Descenso infinito y ajustes de gráficos.
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const { el, openOverlay, closeOverlay, itemCell } = DD.ui;
  const me = () => DD.me;
  const lvl = () => (DD.me ? RULES.levelFromXp(DD.me.xp) : 1);
  const isOpen = (id) => !$('#' + id).classList.contains('hidden');
  const matTag = (k, n, have) => {
    const M = PROG.MATS[k];
    const t = el('span', 'mat' + (have !== undefined && have < n ? ' short' : ''), `${M.icon} ${have !== undefined ? have + '/' : ''}${n}`);
    t.title = M.name;
    return t;
  };
  const fmtTime = (ms) => { const m = Math.max(0, Math.round(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`; };

  // ======================================================================
  //  Menú del pueblo
  // ======================================================================
  const pop = $('#svc-pop');
  DD.on('toggle-services', (btn) => {
    pop.classList.toggle('hidden');
    if (!pop.classList.contains('hidden') && btn) {
      const r = btn.getBoundingClientRect();
      pop.style.left = Math.max(6, Math.min(innerWidth - 260, r.left - 60)) + 'px';
      pop.style.bottom = (innerHeight - r.top + 8) + 'px';
    }
  });
  document.addEventListener('pointerdown', (e) => { if (!e.target.closest('#svc-pop, [data-act="svc"]')) pop.classList.add('hidden'); });
  pop.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    pop.classList.add('hidden');
    const s = b.dataset.s;
    if (s === 'forge') openForge();
    else if (s === 'cook') { openOverlay('cookwin'); renderCook(); }
    else if (s === 'board') { openOverlay('boardwin'); renderBoard(); }
    else if (s === 'fame') { openOverlay('famewin'); renderFame(); }
    else if (s === 'room') DD.net.send({ t: 'room:get' });
    else if (s === 'descent') askDescent();
  });
  DD.on('me', () => {
    if (isOpen('forgewin')) renderForge();
    if (isOpen('cookwin')) renderCook();
    if (isOpen('boardwin')) renderBoard();
    if (isOpen('famewin') && fameTab !== 'ranks') renderFame();
  });

  // ======================================================================
  //  Forja de Brunilda
  // ======================================================================
  let forgeTab = 'up', sel = null, multi = new Set(), lastMsg = '';
  function openForge() { if (DD.scene !== 'tavern') return DD.toast('La forja está en la taberna.'); sel = null; multi = new Set(); lastMsg = ''; openOverlay('forgewin'); renderForge(); }
  document.querySelectorAll('#forge-tabs button').forEach((b) => { b.onclick = () => { forgeTab = b.dataset.tab; sel = null; multi = new Set(); lastMsg = ''; renderForge(); }; });
  DD.on('forge:result', (m) => { lastMsg = m.text; if (m.item) sel = m.item.id; DD.sfx('forge', { ok: !!m.ok }); if (isOpen('forgewin')) renderForge(); });

  function allItems(p) {
    const eq = RULES.SLOT_IDS.map((s) => p.equip[s]).filter(Boolean).map((it) => ({ it, worn: true }));
    return eq.concat(p.bag.map((it) => ({ it, worn: false })));
  }
  function renderForge() {
    const p = me(); if (!p) return;
    document.querySelectorAll('#forge-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === forgeTab));
    const mats = $('#forge-mats'); mats.innerHTML = '';
    for (const k of ['hierro', 'esencia', 'polvo']) mats.appendChild(matTag(k, (p.mats || {})[k] || 0));
    mats.appendChild(el('span', 'mat', `🪙 ${p.gold}`));
    const body = $('#forge-body'); body.innerHTML = '';
    const intro = {
      up: 'Elige un objeto (puesto o en la mochila). Cada mejora sube su daño o su armadura; en +5 y +10 su mejor propiedad crece. A partir de +4 puede fallar: el objeto nunca se rompe, pero pierdes los materiales.',
      enchant: 'Elige un objeto y la propiedad que quieres cambiar: Brunilda la sustituye por otra al azar.',
      combine: 'Elige tres objetos de la mochila de la misma rareza: se funden en uno de la rareza siguiente (para tus clases).',
      salvage: 'Elige objetos de la mochila que no quieras: se convierten en materiales de forja.',
    }[forgeTab];
    body.appendChild(el('p', 'muted small', intro));
    if (lastMsg) body.appendChild(el('div', 'forge-msg', lastMsg));
    const grid = el('div', 'inv-grid');
    const list = forgeTab === 'up' || forgeTab === 'enchant' ? allItems(p) : p.bag.map((it) => ({ it, worn: false }));
    for (const { it, worn } of list) {
      if (forgeTab === 'enchant' && !Object.keys(it.stats || {}).length) continue;
      const on = forgeTab === 'up' || forgeTab === 'enchant' ? sel === it.id : multi.has(it.id);
      const c = itemCell(it, { onClick: () => pickForge(it) });
      if (on) c.classList.add('picked');
      if (worn) c.classList.add('worn');
      if (it.up) c.appendChild(el('span', 'upbadge', '+' + it.up));
      grid.appendChild(c);
    }
    if (!grid.children.length) grid.appendChild(el('p', 'muted', 'No tienes objetos para esto.'));
    body.appendChild(grid);
    const panel = el('div', 'forge-panel');
    body.appendChild(panel);
    const it = sel && list.map((x) => x.it).find((x) => x.id === sel);
    if (forgeTab === 'up' && it) {
      panel.appendChild(el('b', '', it.name));
      if ((it.up || 0) >= PROG.MAX_UP) { panel.appendChild(el('p', '', 'Está al máximo (+10). ¡Una obra maestra!')); return; }
      const c = PROG.upgradeCost(it);
      const row = el('div', 'cost-row');
      row.append(el('span', '', `+${(it.up || 0) + 1}:`), matTag('hierro', c.hierro, (p.mats || {}).hierro || 0));
      if (c.esencia) row.appendChild(matTag('esencia', c.esencia, (p.mats || {}).esencia || 0));
      if (c.polvo) row.appendChild(matTag('polvo', c.polvo, (p.mats || {}).polvo || 0));
      row.append(el('span', 'mat' + (p.gold < c.gold ? ' short' : ''), `🪙 ${c.gold}`), el('span', 'chance', `Éxito ${Math.round(c.chance * 100)}%`));
      panel.appendChild(row);
      const preview = PROG.applyUpgrade(JSON.parse(JSON.stringify(it)));
      panel.appendChild(el('p', 'small', `${it.dmg ? `Daño ${it.dmg[0]}–${it.dmg[1]} → ${preview.dmg[0]}–${preview.dmg[1]}` : ''}${it.armor ? ` Armadura ${it.armor} → ${preview.armor}` : ''}`));
      const b = el('button', 'btn big', '⚒️ MEJORAR');
      b.onclick = () => DD.net.send({ t: 'forge:up', id: it.id });
      panel.appendChild(b);
    } else if (forgeTab === 'enchant' && it) {
      panel.appendChild(el('b', '', it.name));
      const c = PROG.enchantCost(it);
      const row = el('div', 'cost-row');
      row.append(el('span', '', 'Cada encantamiento:'), matTag('esencia', c.esencia, (p.mats || {}).esencia || 0));
      if (c.polvo) row.appendChild(matTag('polvo', c.polvo, (p.mats || {}).polvo || 0));
      row.appendChild(el('span', 'mat' + (p.gold < c.gold ? ' short' : ''), `🪙 ${c.gold}`));
      panel.appendChild(row);
      for (const [k, v] of Object.entries(it.stats || {})) {
        const r = el('div', 'buy-row');
        r.appendChild(el('div', 'buy-t', RULES.fmtStat(k, v)));
        const b = el('button', 'btn alt', '✨ CAMBIAR');
        b.onclick = () => DD.net.send({ t: 'forge:enchant', id: it.id, key: k });
        r.appendChild(b);
        panel.appendChild(r);
      }
    } else if (forgeTab === 'combine') {
      const items = [...multi].map((id) => p.bag.find((x) => x.id === id)).filter(Boolean);
      panel.appendChild(el('p', '', `Elegidos: ${items.length}/3`));
      if (items.length === 3) {
        const same = items.every((x) => x.rarity === items[0].rarity) && PROG.COMBINE_TO[items[0].rarity];
        if (!same) panel.appendChild(el('p', 'bad', 'Tienen que ser los tres de la misma calidad (inferior, normal, superior, mágico o raro).'));
        else {
          const ilvl = Math.round(items.reduce((t, x) => t + x.ilvl, 0) / 3);
          const c = PROG.combineCost(items[0].rarity, ilvl);
          const to = RULES.RARITIES[PROG.COMBINE_TO[items[0].rarity]];
          const row = el('div', 'cost-row');
          const res = el('span', '', `→ un objeto ${to.name.toLowerCase()} de nivel ${ilvl}`); res.style.color = to.color;
          row.appendChild(res);
          if (c.esencia) row.appendChild(matTag('esencia', c.esencia, (p.mats || {}).esencia || 0));
          if (c.polvo) row.appendChild(matTag('polvo', c.polvo, (p.mats || {}).polvo || 0));
          row.appendChild(el('span', 'mat' + (p.gold < c.gold ? ' short' : ''), `🪙 ${c.gold}`));
          panel.appendChild(row);
          const b = el('button', 'btn big', '🔥 COMBINAR');
          b.onclick = () => { DD.net.send({ t: 'forge:combine', ids: [...multi] }); multi = new Set(); };
          panel.appendChild(b);
        }
      }
    } else if (forgeTab === 'salvage') {
      const items = [...multi].map((id) => p.bag.find((x) => x.id === id)).filter(Boolean);
      const got = {};
      for (const x of items) for (const [k, n] of Object.entries(PROG.salvage(x))) got[k] = (got[k] || 0) + n;
      const row = el('div', 'cost-row');
      row.appendChild(el('span', '', `${items.length} objetos →`));
      for (const [k, n] of Object.entries(got)) row.appendChild(matTag(k, n));
      panel.appendChild(row);
      if (items.length) {
        const b = el('button', 'btn big', '🔨 DESGUAZAR');
        b.onclick = () => {
          if (items.some((x) => ['raro', 'unico', 'conjunto'].includes(x.rarity)) && !confirm('Hay objetos raros o mejores. ¿Seguro que quieres desguazarlos?')) return;
          DD.net.send({ t: 'forge:salvage', ids: [...multi] }); multi = new Set();
        };
        panel.appendChild(b);
      }
    }
  }
  function pickForge(it) {
    if (forgeTab === 'up' || forgeTab === 'enchant') sel = sel === it.id ? null : it.id;
    else if (multi.has(it.id)) multi.delete(it.id);
    else if (forgeTab !== 'combine' || multi.size < 3) multi.add(it.id);
    lastMsg = '';
    renderForge();
  }

  // ======================================================================
  //  Cocina de Alfonso
  // ======================================================================
  function renderCook() {
    const p = me(); if (!p) return;
    const body = $('#cook-body'); body.innerHTML = '';
    const price = PROG.COOK_PRICE * Math.max(1, Math.ceil(lvl() / 5));
    body.appendChild(el('p', 'muted small', `«Tráeme lo que pesques en los ríos y las hierbas del camino y te preparo algo que te dure ${PROG.FOOD_MIN} minutos. Sólo un plato a la vez, que luego no hay quien se mueva.» — Alfonso (cobra ${price} 🪙 por plato). Pesca junto al agua del mundo abierto (🎣 o G) y recoge hierbas con un clic.`));
    const food = Object.entries(p.buffs || {}).find(([k, until]) => k.startsWith('comida:') && until > Date.now());
    if (food) body.appendChild(el('div', 'forge-msg', `Ahora mismo: ${RULES.BUFFS[food[0]].icon} ${RULES.BUFFS[food[0]].name} (${fmtTime(food[1] - Date.now())})`));
    const inv = el('div', 'mats-row');
    for (const [k, n] of Object.entries(p.mats || {})) if (PROG.MATS[k] && PROG.MATS[k].kind !== 'forja') inv.appendChild(matTag(k, n));
    if (!inv.children.length) inv.appendChild(el('span', 'muted small', 'No llevas peces ni hierbas.'));
    body.appendChild(inv);
    for (const [id, R] of Object.entries(PROG.RECIPES)) {
      const r = el('div', 'buy-row');
      r.appendChild(el('span', 'buy-ic', R.icon));
      const tt = el('div', 'buy-t');
      tt.append(el('b', '', R.name), el('small', '', R.desc));
      const need = el('div', 'cost-row');
      let ok = true;
      for (const [k, n] of Object.entries(R.need)) { const have = (p.mats || {})[k] || 0; if (have < n) ok = false; need.appendChild(matTag(k, n, have)); }
      tt.appendChild(need);
      r.appendChild(tt);
      const b = el('button', 'btn', 'COCINAR');
      b.disabled = !ok || p.gold < price;
      b.onclick = () => DD.net.send({ t: 'cook', id });
      r.appendChild(b);
      body.appendChild(r);
    }
  }

  // ======================================================================
  //  Tablón de misiones
  // ======================================================================
  function renderBoard() {
    const p = me(); if (!p || !p.board) return;
    const b = p.board;
    const body = $('#board-body'); body.innerHTML = '';
    const now = Date.now();
    const nextDay = (PROG.dayKey(now) + 1) * 86400000, nextWeek = ((PROG.weekKey(now) + 1) * 7 + 4) * 86400000;
    const section = (title, ids, ends) => {
      body.appendChild(el('div', 'panel-title small', `${title} · se renuevan en ${fmtTime(ends - now)}`));
      for (const id of ids) {
        const T = PROG.taskDef(id); if (!T) continue;
        const n = Math.min(T.n, b.prog[id] || 0), done = n >= T.n, claimed = b.claimed.includes(id);
        const r = el('div', 'buy-row task' + (claimed ? ' claimed' : done ? ' done' : ''));
        r.appendChild(el('span', 'buy-ic', T.icon));
        const tt = el('div', 'buy-t');
        tt.appendChild(el('b', '', PROG.taskText(id)));
        const bar = el('div', 'meter xp'); const fill = el('i'); fill.style.width = (100 * n / T.n) + '%'; bar.appendChild(fill); bar.appendChild(el('span', '', `${n}/${T.n}`));
        tt.appendChild(bar);
        const rw = PROG.taskReward(id, lvl());
        tt.appendChild(el('small', '', `Recompensa: ${rw.xp} PX, ${rw.gold} 🪙, ${Object.entries(rw.mats).map(([k, v]) => `${v} ${PROG.MATS[k].icon}`).join(' ')}${rw.item ? ', un objeto raro' : ''}`));
        r.appendChild(tt);
        const btn = el('button', 'btn', claimed ? '✔' : 'RECOGER');
        btn.disabled = !done || claimed;
        btn.onclick = () => DD.net.send({ t: 'board:claim', id });
        r.appendChild(btn);
        body.appendChild(r);
      }
    };
    section('📅 DE HOY', b.daily, nextDay);
    section('🗓️ DE LA SEMANA', b.weekly, nextWeek);
    const M = PROG.WEEKLY_MODS[PROG.weekMod()];
    body.appendChild(el('p', 'muted small', `🌀 Desafío del Descenso infinito esta semana: ${M.icon} ${M.name} — ${M.desc}`));
  }

  // ======================================================================
  //  Fama: logros, títulos, clasificación y estadísticas
  // ======================================================================
  let fameTab = 'logros', ranks = null;
  document.querySelectorAll('#fame-tabs button').forEach((b) => { b.onclick = () => { fameTab = b.dataset.tab; if (fameTab === 'ranks') DD.net.send({ t: 'ranks:get' }); renderFame(); }; });
  DD.on('ranks', (m) => { ranks = m; if (isOpen('famewin')) renderFame(); });
  DD.on('achievement', (m) => {
    DD.toast(`🏅 ¡Logro: ${m.name}!${m.title ? ` Nuevo título: «${m.title}» (Pueblo → Fama).` : ''} +${m.gold} 🪙`);
    DD.sfx('quest');
  });
  function renderFame() {
    const p = me(); if (!p) return;
    document.querySelectorAll('#fame-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === fameTab));
    const body = $('#fame-body'); body.innerHTML = '';
    if (fameTab === 'logros') {
      const titles = PROG.ACHIEVEMENTS.filter((a) => a.title && p.achievements.includes(a.id)).map((a) => a.title);
      body.appendChild(el('h3', '', `Título (${titles.length} conseguidos)`));
      const trow = el('div', 'title-row');
      for (const t of [null, ...titles]) {
        const b = el('button', 'btn' + ((p.title || null) === t ? '' : ' alt'), t ? `«${t}»` : 'Sin título');
        b.onclick = () => DD.net.send({ t: 'title:set', title: t });
        trow.appendChild(b);
      }
      body.appendChild(trow);
      body.appendChild(el('h3', '', `Logros ${p.achievements.length}/${PROG.ACHIEVEMENTS.length}`));
      const grid = el('div', 'ach-grid');
      for (const a of PROG.ACHIEVEMENTS) {
        const got = p.achievements.includes(a.id);
        const have = Math.min(a.n, (p.stats || {})[a.stat] || 0);
        const c = el('div', 'ach' + (got ? ' got' : ''));
        c.append(el('b', '', (got ? '🏅 ' : '🔒 ') + a.name), el('small', '', `${PROG.STAT_NAMES[a.stat]}: ${have}/${a.n}`), el('small', '', `+${a.gold} 🪙${a.title ? ` · título «${a.title}»` : ''}`));
        grid.appendChild(c);
      }
      body.appendChild(grid);
    } else if (fameTab === 'ranks') {
      if (!ranks) { body.appendChild(el('p', 'muted', 'Cargando…')); return; }
      const M = PROG.WEEKLY_MODS[ranks.mod];
      body.appendChild(el('p', 'muted small', `Semana en curso · termina en ${fmtTime(ranks.ends - Date.now())} · desafío del Descenso: ${M.icon} ${M.name}`));
      const grid = el('div', 'rank-grid');
      for (const [cat, B] of Object.entries(PROG.BOARDS)) {
        const box = el('div', 'rank-box');
        box.appendChild(el('b', '', `${B.icon} ${B.name}`));
        const rows = ranks.boards[cat] || [];
        if (!rows.length) box.appendChild(el('small', 'muted', 'Nadie todavía. ¡Sé el primero!'));
        rows.forEach((r, i) => box.appendChild(el('div', 'rank-row' + (r.me ? ' me' : ''), `${r.pos || i + 1}. ${r.name} — ${r.v}`)));
        grid.appendChild(box);
      }
      body.appendChild(grid);
    } else {
      const st = p.stats || {};
      for (const [k, name] of Object.entries(PROG.STAT_NAMES)) body.appendChild(el('div', 'stat-row', `${name}: ${st[k] || 0}`));
    }
  }

  // ======================================================================
  //  Habitación con trofeos (en 3D)
  // ======================================================================
  let roomView = null;
  DD.on('roominfo', (m) => {
    openOverlay('roomwin');
    $('#room-title').textContent = `🏠 HABITACIÓN DE ${m.name.toUpperCase()}${m.title ? ` «${m.title}»` : ''}`;
    const info = $('#room-info'); info.innerHTML = '';
    const names = m.trophies.map((k) => (RULES.MONSTERS[k] || {}).name || k);
    info.appendChild(el('p', '', `Nivel ${m.level} · ${m.achievements.length} logros · ${names.length} trofeos${m.pet ? ` · ${m.pet.name} (${RULES.petTitle(m.pet.type, m.pet.plvl)}, nv ${m.pet.plvl})` : ''}${m.stats.bigfish ? ` · pez más grande: ${m.stats.bigfish} kg` : ''}${m.stats.floor ? ` · Descenso: piso ${m.stats.floor}` : ''}`));
    info.appendChild(el('p', 'muted small', names.length ? 'Trofeos: ' + names.join(', ') : 'Todavía no hay trofeos: derrota jefes de mazmorra, de región o de mundo para llenar las paredes.'));
    try {
      if (roomView) roomView.stop();
      roomView = VIEW3D.roomView($('#room-cv'), m);
    } catch (e) { info.appendChild(el('p', 'bad', 'Tu navegador no puede mostrar la habitación en 3D.')); }
  });
  const stopRoom = () => { if (roomView) { roomView.stop(); roomView = null; } };
  new MutationObserver(() => { if (!isOpen('roomwin')) stopRoom(); }).observe($('#roomwin'), { attributes: true, attributeFilter: ['class'] });

  // ======================================================================
  //  Duelos en el sótano de Alfonso
  // ======================================================================
  DD.on('duel-ask', (u) => {
    if (DD.scene !== 'tavern') return DD.toast('Los duelos se acuerdan en la taberna.');
    const s = prompt(`¿Cuánto oro apuestas en el duelo contra ${u.name}? (0 = por honor; máx. ${PROG.ARENA.maxBet})`, '0');
    if (s === null) return;
    DD.net.send({ t: 'duel:req', to: u.id, bet: Math.max(0, Math.floor(Number(s) || 0)) });
  });
  DD.on('duel:invite', (m) => {
    const box = el('div', 'invite panel');
    box.append(el('div', '', `🤺 ${m.name} te reta a un duelo en el sótano${m.bet ? ` (${m.bet} 🪙 cada uno; el ganador se lo lleva todo)` : ' (por honor)'}.`));
    const ok = el('button', 'btn', 'ACEPTAR'), no = el('button', 'btn alt', 'NO');
    ok.onclick = () => { DD.net.send({ t: 'duel:accept', from: m.from }); box.remove(); };
    no.onclick = () => { DD.net.send({ t: 'duel:decline', from: m.from }); box.remove(); };
    box.append(ok, no);
    document.body.appendChild(box);
    DD.blip(440, 0.2);
    setTimeout(() => box.remove(), 30000);
  });

  // ======================================================================
  //  Descenso infinito
  // ======================================================================
  function askDescent() {
    if (DD.scene !== 'tavern') return;
    const M = PROG.WEEKLY_MODS[PROG.weekMod()];
    const best = (me() && me().stats && me().stats.floor) || 0;
    if (confirm(`🌀 DESCENSO INFINITO\n\nPiso tras piso, cada uno un nivel más difícil (empiezas a tu nivel). Al derrotar al jefe, su portal te baja al siguiente piso. Cada 5 pisos, un objeto raro; cada 10, uno único. Si caes, vuelves a la taberna.\n\nDesafío de esta semana: ${M.icon} ${M.name} — ${M.desc}\nTu mejor piso: ${best}\n\n¿Bajas?`)) DD.net.send({ t: 'descent:start' });
  }
  DD.on('open-descent', askDescent);

  // ======================================================================
  //  Ajustes de gráficos y rendimiento
  // ======================================================================
  const GFX_KEY = 'dd-gfx';
  const defaults = () => ({ quality: 'auto', weather: true, shake: true, fps: false });
  let gfx = defaults();
  try { gfx = { ...gfx, ...JSON.parse(localStorage.getItem(GFX_KEY) || '{}') }; } catch { /* sin almacenamiento */ }
  DD.gfx = gfx;
  const applyGfx = () => { try { localStorage.setItem(GFX_KEY, JSON.stringify(gfx)); } catch { /* nada */ } VIEW3D.setQuality(gfx.quality); DD.emit('gfx', gfx); };
  setTimeout(() => VIEW3D.setQuality(gfx.quality), 0);
  DD.on('open-options', () => { openOverlay('optwin'); renderOptions(); });
  function renderOptions() {
    const body = $('#opt-body'); body.innerHTML = '';
    body.appendChild(el('div', 'field-title', 'Calidad'));
    const q = el('div', 'title-row');
    for (const [id, name] of [['auto', 'Automática'], ['baja', 'Baja'], ['media', 'Media'], ['alta', 'Alta']]) {
      const b = el('button', 'btn' + (gfx.quality === id ? '' : ' alt'), name);
      b.onclick = () => { gfx.quality = id; applyGfx(); renderOptions(); };
      q.appendChild(b);
    }
    body.appendChild(q);
    body.appendChild(el('p', 'muted small', 'Baja: sin sombras, menos luces y partículas, menos resolución (para móviles antiguos). Alta: sombras suaves, todas las luces y más partículas.'));
    const toggle = (key, label) => {
      const r = el('label', 'opt-row');
      const c = el('input'); c.type = 'checkbox'; c.checked = !!gfx[key];
      c.onchange = () => { gfx[key] = c.checked; applyGfx(); };
      r.append(c, el('span', '', label));
      body.appendChild(r);
    };
    toggle('weather', 'Clima y partículas de ambiente (lluvia, nieve, ceniza…)');
    toggle('shake', 'Temblor de cámara en los golpes fuertes');
    toggle('fps', 'Mostrar imágenes por segundo');
    const cur = VIEW3D.qualityInfo ? VIEW3D.qualityInfo() : null;
    if (cur) body.appendChild(el('p', 'muted small', `Ahora: calidad ${cur.name}, resolución ×${cur.pr}, ${cur.shadows ? 'con' : 'sin'} sombras, ${cur.lights} luces.`));
  }
})();
