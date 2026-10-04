/* global DD, DUNGEON, SPRITES, MAP, RULES */
// Mazmorras y mundo abierto: lista, partida en tiempo real con reglas del SRD 5.2 (vista cenital en pixel art) y editor.
(() => {
  'use strict';

  const T = 16; // píxeles por casilla
  const $ = (s) => document.querySelector(s);
  const DW = DUNGEON.W, DH = DUNGEON.H; // tamaño de las mazmorras del editor
  const DUNGEON_CHARS = new Set(['#', '.', '+', '^', '~']);

  // Datos de monstruos (nombres, CA…) para el registro y el editor
  let MON = null;
  async function monsters() {
    if (!MON) {
      const list = await fetch('rules/monsters.json').then((r) => r.json());
      MON = Object.fromEntries([...list, ...DUNGEON.HOMEBREW].map((m) => [m.id, m]));
    }
    return MON;
  }
  const monName = (k) => (MON && MON[k] ? MON[k].name : k);

  // ======================================================================
  //  Dibujo común
  // ======================================================================
  function drawTile(g, tiles, w, h, x, y, px, py, now) {
    const ch = tiles[y * w + x];
    const frame = Math.floor(now / 500) % 2;
    if (!DUNGEON_CHARS.has(ch)) { g.drawImage(SPRITES.worldTile(ch, x, y, frame), px, py); return; }
    if (ch === '#') {
      const below = y + 1 < h ? tiles[(y + 1) * w + x] : '#';
      g.drawImage(SPRITES.wallTile(below !== '#'), px, py);
      return;
    }
    if (ch === '~') { g.drawImage(SPRITES.overlayTile('water', frame), px, py); return; }
    g.drawImage(SPRITES.floorTile(x, y), px, py);
    if (ch === '+') g.drawImage(SPRITES.overlayTile('door'), px, py);
    if (ch === '^') g.drawImage(SPRITES.overlayTile('spikes', frame), px, py);
  }

  // Sprite con los pies en el centro inferior de la casilla
  function drawOnTile(g, spr, x, y, flip, scale = 1) {
    const w = spr.width * scale, hh = spr.height * scale;
    const cx = Math.round(x * T + T / 2), base = Math.round(y * T + T + 1);
    g.save();
    g.translate(cx, base);
    if (flip) g.scale(-1, 1);
    g.drawImage(spr, -Math.round(w / 2), -hh, w, hh);
    g.restore();
  }

  function enemyInfo(k) { return DUNGEON.ENEMIES[DUNGEON.enemyKey(k) || k] || { sprite: 'goblin' }; }
  function enemySprite(k, frame, hit) {
    const info = enemyInfo(k);
    if (info.sprite.startsWith('hero:')) {
      const spr = SPRITES.hero({ cls: info.sprite.slice(5), species: 'human', skin: 2, hair: 0 }, { frame });
      return hit ? tint(spr) : spr;
    }
    return SPRITES.enemy(info.sprite, { frame, hit, tint: info.tint });
  }

  const tintCache = new WeakMap();
  function tint(spr) {
    let t = tintCache.get(spr);
    if (!t) {
      t = document.createElement('canvas'); t.width = spr.width; t.height = spr.height;
      const tg = t.getContext('2d');
      tg.drawImage(spr, 0, 0);
      tg.globalCompositeOperation = 'source-atop'; tg.fillStyle = 'rgba(255,80,80,.7)'; tg.fillRect(0, 0, t.width, t.height);
      tintCache.set(spr, t);
    }
    return t;
  }

  function fitScale(cw, ch, ww, wh) {
    const s = Math.min(cw / ww, ch / wh);
    return s >= 2 ? Math.floor(s) : Math.max(0.5, s);
  }

  // ======================================================================
  //  Lista de mazmorras
  // ======================================================================
  const menuEl = $('#dmenu'), listEl = $('#dlist');

  DD.on('open-dungeons', () => {
    menuEl.classList.remove('hidden');
    listEl.innerHTML = '<p class="muted">Cargando mazmorras…</p>';
    DD.net.send({ t: 'dlist' });
  });
  $('#dclose').onclick = () => menuEl.classList.add('hidden');
  $('#dnew').onclick = () => { menuEl.classList.add('hidden'); openEditor(null); };

  DD.on('dlist', (m) => {
    listEl.innerHTML = '';
    if (!m.list.length) { listEl.innerHTML = '<p class="muted">Todavía no hay mazmorras. ¡Crea la primera!</p>'; return; }
    for (const d of m.list) {
      const row = document.createElement('div');
      row.className = 'drow';
      const info = document.createElement('div');
      info.className = 'dinfo';
      const nm = document.createElement('b'); nm.textContent = d.name;
      const meta = document.createElement('small'); meta.textContent = `de ${d.author} · ${d.enemies} enemigos`;
      info.append(nm, meta);
      const acts = document.createElement('div'); acts.className = 'dacts';
      const play = document.createElement('button'); play.className = 'btn'; play.textContent = '⚔️ ENTRAR';
      play.onclick = () => { menuEl.classList.add('hidden'); DD.net.send({ t: 'denter', id: d.id }); };
      const edit = document.createElement('button'); edit.className = 'btn alt'; edit.textContent = d.mine ? 'EDITAR' : 'COPIAR';
      edit.title = d.mine ? 'Editar tu mazmorra' : 'Abrir una copia en el editor';
      edit.onclick = () => { menuEl.classList.add('hidden'); DD.net.send({ t: 'dget', id: d.id }); };
      acts.append(play, edit);
      if (d.mine) {
        const del = document.createElement('button'); del.className = 'btn danger'; del.textContent = '🗑';
        del.title = 'Borrar';
        del.onclick = () => { if (confirm(`¿Borrar «${d.name}»?`)) DD.net.send({ t: 'ddelete', id: d.id }); };
        acts.appendChild(del);
      }
      row.append(info, acts);
      listEl.appendChild(row);
    }
  });

  // ======================================================================
  //  Partida
  // ======================================================================
  const viewEl = $('#dview'), cv = $('#dcanvas'), g = cv.getContext('2d');
  const game = {
    active: false, map: null, ents: new Map(), chests: [], potions: [], coins: [], exit: null, start: null,
    seen: null, floaters: [], puffs: [], fx: [], bubbles: new Map(), path: [], held: null, lastSend: 0,
    view: { s: 2, dpr: 1, cw: 0, ch: 0 }, cam: { x: 0, y: 0 }, me: null, you: null, selected: null, readyAt: 0, log: [], hover: null, showMap: true,
  };

  function myDerived() {
    const u = DD.users.get(DD.myId);
    return u && u.sheet ? RULES.derive(u.sheet, u.xp || 0) : null;
  }

  function resizeGame() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(innerWidth * dpr); cv.height = Math.round(innerHeight * dpr);
    const mobile = innerWidth <= 820;
    const map = game.map;
    if (!map) return;
    const top = mobile ? 150 : 16, bottom = mobile ? 230 : 160;
    const availW = innerWidth - (mobile ? 0 : 0), availH = innerHeight - top - bottom;
    let s;
    if (map.kind === 'world') s = mobile ? 2 : 3;
    else s = fitScale(availW - (mobile ? 8 : 480), availH, map.w * T, map.h * T);
    game.view = { s, dpr, top, availH, mobile };
  }
  window.addEventListener('resize', () => { if (game.active) { resizeGame(); buildActions(); } });

  function upsert(id, data, kind) {
    let e = game.ents.get(id);
    if (!e) { e = { id, kind, rx: data.x, ry: data.y, hitUntil: 0, lunge: 0 }; game.ents.set(id, e); }
    Object.assign(e, data, { alive: true });
    return e;
  }

  function applySnap(m) {
    for (const e of game.ents.values()) e.alive = false;
    for (const p of m.players) upsert(p.id, p, 'hero');
    for (const en of m.enemies) upsert(en.id, en, 'enemy');
    // los eventos se leen antes de quitar a los caídos, para poder nombrarlos en el registro
    for (const ev of m.events || []) onEvent(ev);
    for (const [id, e] of game.ents) if (!e.alive) game.ents.delete(id);
    game.chests = m.chests; game.potions = m.potions; game.coins = m.coins;
    game.exit = m.exit; game.start = m.start;
    reveal();
    updateHud();
  }

  function reveal() {
    const r = game.map.kind === 'world' ? 8 : 5;
    const { w, h } = game.map;
    for (const e of game.ents.values()) {
      if (e.kind !== 'hero') continue;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const x = e.x + dx, y = e.y + dy;
        if (x >= 0 && y >= 0 && x < w && y < h && dx * dx + dy * dy <= r * r + 1) game.seen[y * w + x] = 1;
      }
    }
  }

  function float(x, y, text, color, big) { game.floaters.push({ x, y, text, color, big, start: performance.now() }); }
  const who = (id) => { if (id === DD.myId) return 'Tú'; const e = game.ents.get(id); if (!e) return '?'; return e.kind === 'hero' ? e.name : monName(e.k); };
  const dmgName = (t) => (RULES.data && RULES.data.damageTypes.find((d) => d.id === t) || {}).name || t || '';
  const abbr = (a) => (RULES.data ? RULES.data.abilities.find((x) => x.id === a).abbr : a);

  function log(text, cls) {
    game.log.push({ text, cls });
    if (game.log.length > 6) game.log.shift();
    const el = $('#dlog');
    el.innerHTML = '';
    for (const l of game.log) { const d = document.createElement('div'); d.className = 'dlog-line ' + (l.cls || ''); d.textContent = l.text; el.appendChild(d); }
  }

  function onEvent(ev) {
    const now = performance.now();
    const me = DD.myId;
    switch (ev.e) {
      case 'attack': {
        const t = game.ents.get(ev.target);
        const by = game.ents.get(ev.by);
        if (t && ev.hit) { t.hitUntil = now + 160; float(t.x, t.y, (ev.crit ? '¡' : '') + '-' + ev.dmg + (ev.crit ? '!' : ''), t.kind === 'hero' ? '#ff6b6b' : ev.crit ? '#ffd23f' : '#ffffff', ev.target === me || ev.crit); }
        else if (t) float(t.x, t.y, ev.auto ? '' : 'Falla', '#9aa0aa', false);
        if (by && t) { by.lunge = now; by.lungeDx = Math.sign(t.x - by.x); by.lungeDy = Math.sign(t.y - by.y); }
        if (ev.spell && by && t && (by.x !== t.x || by.y !== t.y)) game.fx.push({ kind: 'bolt', from: { x: by.x, y: by.y }, to: { x: t.x, y: t.y }, start: now, color: spellColor(ev.type) });
        const roll = ev.auto ? 'impacto automático' : `${ev.total} (d20 ${ev.roll}${RULES.fmt(ev.bonus)}${ev.disadv ? ', desventaja' : ''}) vs CA ${ev.ac}`;
        const res = ev.hit ? `${ev.crit ? '¡CRÍTICO! ' : ''}${ev.dmg} ${dmgName(ev.type)}${ev.sneak ? ' (furtivo)' : ''}` : ev.dmg ? `falla, ${ev.dmg} ${dmgName(ev.type)}` : 'falla';
        log(`${who(ev.by)} → ${who(ev.target)}: ${ev.name}, ${roll} → ${res}`, ev.target === me ? 'hurt' : ev.by === me ? 'mine' : '');
        DD.blip(ev.target === me ? 160 : ev.hit ? 260 : 520, 0.05);
        break;
      }
      case 'save': {
        const t = game.ents.get(ev.target);
        if (t && ev.dmg) { t.hitUntil = now + 160; float(t.x, t.y, '-' + ev.dmg, '#ffffff', false); } else if (t) float(t.x, t.y, 'Salva', '#9aa0aa', false);
        log(`${who(ev.target)} salva ${abbr(ev.ability)}: ${ev.total} (d20 ${ev.roll}${RULES.fmt(ev.bonus)}) vs CD ${ev.dc} → ${ev.success ? 'éxito' : 'fallo'}${ev.dmg ? `, ${ev.dmg} ${dmgName(ev.type)}` : ''}`, ev.by === me ? 'mine' : '');
        break;
      }
      case 'cast': {
        log(`${who(ev.by)} lanza ${ev.name}${ev.slot > 0 ? ` (espacio de nivel ${ev.slot})` : ''}`, ev.by === me ? 'mine' : '');
        if (ev.area) game.fx.push({ kind: 'area', area: ev.area, from: ev.from, x: ev.x, y: ev.y, start: now, color: spellColor(RULES.COMBAT_SPELLS[ev.spell] ? RULES.COMBAT_SPELLS[ev.spell].type : 'fire') });
        DD.blip(700, 0.08);
        break;
      }
      case 'feature': log(`${who(ev.by)} usa ${ev.name}`, ev.by === me ? 'mine' : ''); break;
      case 'die': {
        game.puffs.push({ x: ev.x, y: ev.y, start: now, color: '#d8d0c0' });
        float(ev.x, ev.y, `+${ev.xp} PX`, '#9fe0ff', true);
        log(`${monName(ev.k)} cae. +${ev.xp} PX para cada héroe.`, 'good');
        DD.blip(120, 0.15);
        break;
      }
      case 'loot':
        if (ev.gold) float(ev.x, ev.y, `+${ev.gold} 🪙`, '#ffd23f', ev.id === me);
        if (ev.xp && ev.id === me) setTimeout(() => float(ev.x, ev.y, `+${ev.xp} PX`, '#9fe0ff', true), 350);
        if (ev.id === me) DD.blip(1046, 0.08);
        break;
      case 'heal': {
        const t = game.ents.get(ev.id);
        if (t) float(t.x, t.y, '+' + ev.amount + ' ❤', '#7dff8a', ev.id === me);
        log(`${who(ev.id)} recupera ${ev.amount} PG (${ev.source})`, 'good');
        break;
      }
      case 'summon': game.puffs.push({ x: ev.x, y: ev.y, start: now, color: '#7cff6a' }); log('¡Se alza un esqueleto!', 'hurt'); break;
      case 'down': log(`${who(ev.id)} cae inconsciente.`, 'hurt'); break;
    }
  }

  function spellColor(type) {
    return { fire: '#ff7a2a', cold: '#9ad8ff', lightning: '#fff27a', acid: '#9aff5a', poison: '#7acf5a', necrotic: '#8a5aaf', radiant: '#fff6c0', force: '#c8a0ff', thunder: '#a0c0ff', psychic: '#ff8ad8', piercing: '#e0e0e0' }[type] || '#ffffff';
  }

  DD.on('dstart', async (m) => {
    await monsters();
    game.active = true;
    game.map = m.dungeon;
    game.ents.clear(); game.floaters = []; game.puffs = []; game.fx = []; game.path = []; game.held = null; game.selected = null; game.log = [];
    game.seen = new Uint8Array(m.dungeon.w * m.dungeon.h);
    game.you = m.you;
    game.me = myDerived();
    game.miniImg = null;
    $('#dname').textContent = m.dungeon.name;
    $('#dlog').innerHTML = '';
    viewEl.classList.remove('hidden');
    viewEl.classList.toggle('world', m.dungeon.kind === 'world');
    $('#deditor').classList.add('hidden');
    DD.setScene('dungeon');
    resizeGame();
    applySnap(m);
    buildActions();
    DD.toast(m.dungeon.kind === 'world'
      ? `${m.dungeon.name}: explora, entra en las cuevas (mazmorras) y vuelve al pueblo para descansar.`
      : `Entras en «${m.dungeon.name}». Clic para moverte y atacar; 1-9 para elegir acción.`);
  });
  DD.on('dsnap', (m) => { if (game.active) applySnap(m); });
  DD.on('dme', (m) => { game.you = m; updateHud(); updateActions(); });
  DD.on('dwhisper', (m) => DD.toast(m.text));
  DD.on('dexit', (m) => {
    game.active = false;
    if (m.silent) return; // pasa de una mazmorra al mundo: llega otro dstart
    viewEl.classList.add('hidden');
    DD.setScene('tavern');
    if (m.reason === 'win') DD.toast('🏆 ¡Mazmorra completada!');
    else if (m.reason === 'down') DD.toast(`💀 Has caído${m.lost ? ` y pierdes ${m.lost} de oro` : ''}. Vuelves a la taberna.`);
    else DD.toast('Vuelves a la taberna. Descanso largo: vida, espacios de conjuro y rasgos recuperados.');
  });
  DD.on('profile', () => { if (game.active) updateHud(); });
  DD.on('sheet', (m) => { if (game.active && m.id === DD.myId) { game.me = myDerived(); buildActions(); } });
  DD.on('log', (m) => {
    if (!game.active || m.t !== 'chat') return;
    log(`${m.name}: ${m.text}`, 'chat');
    if (game.ents.has(m.id)) game.bubbles.set(m.id, { text: m.text, until: performance.now() + 4000 + m.text.length * 50 });
  });
  $('#dexit').onclick = () => DD.net.send({ t: 'dleave' });

  function updateHud() {
    const y = game.you;
    const u = DD.users.get(DD.myId);
    const d = game.me;
    if (y) {
      $('#dhp').textContent = `${Math.max(0, y.hp)}/${y.maxHp}`;
      $('#dhp-bar').style.width = Math.max(0, 100 * y.hp / y.maxHp) + '%';
    }
    if (d) $('#dac').textContent = `CA ${d.ac}${y && y.raging ? ' · 🔥 Furia' : ''}`;
    if (u && RULES.data) {
      const lv = RULES.levelFromXp(u.xp);
      const base = RULES.data.xpTable[lv - 1], next = RULES.data.xpTable[lv] || base;
      $('#dlvl').textContent = `Nv ${lv}`;
      $('#dxp-bar').style.width = Math.min(100, Math.round(100 * (u.xp - base) / Math.max(1, next - base))) + '%';
      $('#dgold').textContent = u.gold;
    }
    const slots = y && y.slots ? y.slots.map((n, i) => (d && d.casting && d.casting.slots[i] ? `${i + 1}º ${'◆'.repeat(n)}${'◇'.repeat(Math.max(0, d.casting.slots[i] - n))}` : '')).filter(Boolean) : [];
    $('#dslots').textContent = slots.length ? `Espacios: ${slots.join('  ')}` : '';
    const left = [...game.ents.values()].filter((e) => e.kind === 'enemy').length;
    $('#dleft').textContent = game.map && game.map.kind === 'world' ? 'M: mapa' : left ? `👹 ${left}` : '✨ Limpia';
  }

  // ---------- Barra de acciones ----------
  function actionList() {
    const d = game.me;
    if (!d) return [];
    const list = [];
    d.attacks.forEach((a, i) => list.push({ type: 'attack', i, label: a.name, sub: `${RULES.fmt(a.hit)} · ${a.dice}${a.mod ? RULES.fmt(a.mod) : ''}`, range: a.kind === 'ranged' ? a.range : a.thrown || a.range, icon: a.kind === 'ranged' ? '🏹' : a.id === 'unarmed' ? '👊' : '⚔️' }));
    for (const s of d.spells.filter((x) => x.combat)) {
      const fx = RULES.COMBAT_SPELLS[s.id];
      list.push({ type: 'spell', id: s.id, level: s.level, label: s.name, sub: `${s.level ? s.level + 'º' : 'truco'} · ${fx.kind === 'heal' ? 'cura' : fx.kind === 'save' ? `CD ${s.dc}` : fx.kind === 'auto' ? 'auto' : RULES.fmt(s.attack)}`, range: fx.range, fx, icon: fx.kind === 'heal' ? '✚' : '✦', freeCast: s.freeCast });
    }
    for (const f of d.actions) list.push({ type: 'feature', id: f.id, label: f.name, sub: f.pool ? 'reserva' : `${f.uses} usos`, icon: f.id === 'rage' ? '🔥' : f.id === 'breath-weapon' ? '🐉' : '✚', feature: f });
    return list;
  }

  function buildActions() {
    const bar = $('#dactions');
    bar.innerHTML = '';
    const list = actionList();
    list.forEach((a, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'act-btn ' + a.type;
      b.title = `${a.label} (${i + 1})`;
      b.innerHTML = '<span class="k"></span><span class="ic"></span><span class="lb"></span><small></small><span class="cnt"></span>';
      b.querySelector('.k').textContent = i < 9 ? i + 1 : '';
      b.querySelector('.ic').textContent = a.icon;
      b.querySelector('.lb').textContent = a.label;
      b.querySelector('small').textContent = a.sub;
      b.onclick = () => select(i);
      bar.appendChild(b);
    });
    if (game.selected == null) game.selected = 0;
    updateActions();
  }

  function updateActions() {
    const list = actionList();
    const y = game.you || {};
    [...$('#dactions').children].forEach((b, i) => {
      const a = list[i];
      if (!a) return;
      b.classList.toggle('on', game.selected === i);
      let cnt = '';
      let off = false;
      if (a.type === 'spell' && a.level > 0) {
        const n = (y.slots || []).reduce((t, v, j) => t + (j + 1 >= a.level ? v : 0), 0);
        cnt = a.freeCast && !(y.freeCast || {})[a.id] ? `${n}+1` : String(n);
        off = n <= 0 && !(a.freeCast && !(y.freeCast || {})[a.id]);
      }
      if (a.type === 'feature') {
        const f = a.feature;
        const left = f.pool ? (y.uses && y.uses[f.id] !== undefined ? y.uses[f.id] : f.pool) : (y.uses && y.uses[f.id] !== undefined ? y.uses[f.id] : f.uses);
        cnt = String(left); off = left <= 0;
      }
      b.querySelector('.cnt').textContent = cnt;
      b.classList.toggle('off', off);
    });
  }

  function select(i) {
    const list = actionList();
    const a = list[i];
    if (!a) return;
    // rasgos que no necesitan objetivo: se usan al momento
    if (a.type === 'feature' && (a.id === 'second-wind' || a.id === 'rage')) { sendAction({ act: 'feature', id: a.id }); return; }
    if (a.type === 'attack') DD.net.send({ t: 'dact', act: 'weapon', weapon: a.i });
    if (game.selected === i && a.type === 'spell' && a.fx.kind === 'heal') { sendAction({ act: 'spell', id: a.id, target: DD.myId }); return; } // segunda pulsación: curarse a uno mismo
    if (game.selected === i && a.type === 'feature' && a.id === 'lay-on-hands') { sendAction({ act: 'feature', id: a.id, target: DD.myId }); return; }
    game.selected = i;
    updateActions();
  }

  function sendAction(a) {
    const now = performance.now();
    if (now < game.readyAt) return;
    game.readyAt = now + 1300;
    DD.net.send({ t: 'dact', ...a });
    const bar = $('#dactions');
    bar.classList.remove('cooldown'); void bar.offsetWidth; bar.classList.add('cooldown');
  }

  // ---------- Controles ----------
  const KEYS = { ArrowUp: [0, -1], w: [0, -1], W: [0, -1], ArrowDown: [0, 1], s: [0, 1], S: [0, 1], ArrowLeft: [-1, 0], a: [-1, 0], A: [-1, 0], ArrowRight: [1, 0], d: [1, 0], D: [1, 0] };
  window.addEventListener('keydown', (e) => {
    if (!game.active || DD.scene !== 'dungeon' || (document.activeElement && document.activeElement.tagName === 'INPUT')) return;
    if (/^[1-9]$/.test(e.key)) { select(Number(e.key) - 1); return; }
    if (e.key === 'm' || e.key === 'M') { game.showMap = !game.showMap; return; }
    if (e.key === 'Escape') { game.selected = 0; updateActions(); return; }
    const d = KEYS[e.key];
    if (!d) { if (e.key === 'Enter') { e.preventDefault(); $('#chat-input').focus(); } return; }
    e.preventDefault();
    game.path = [];
    if (!game.held || game.held[0] !== d[0] || game.held[1] !== d[1]) { game.held = d; step(d, true); }
  });
  window.addEventListener('keyup', (e) => { const d = KEYS[e.key]; if (d && game.held && game.held[0] === d[0] && game.held[1] === d[1]) game.held = null; });
  window.addEventListener('blur', () => { game.held = null; });

  function step(d, force) {
    const now = performance.now();
    if (!force && now - game.lastSend < 170) return;
    game.lastSend = now;
    DD.net.send({ t: 'dmove', dx: d[0], dy: d[1] });
  }

  function walkable(x, y) {
    const { w, h, tiles } = game.map;
    if (x < 0 || y < 0 || x >= w || y >= h) return false;
    if (!DUNGEON.walkable(tiles[y * w + x])) return false;
    return !game.chests.some((c) => c.x === x && c.y === y);
  }

  // Camino en 8 direcciones (los enemigos y cofres valen como destino)
  function bfs(sx, sy, tx, ty) {
    const { w, h } = game.map;
    if (tx < 0 || ty < 0 || tx >= w || ty >= h || sx < 0 || sy < 0 || sx >= w || sy >= h) return [];
    const prev = new Int32Array(w * h).fill(-1);
    const q = [sy * w + sx];
    prev[sy * w + sx] = sy * w + sx;
    let head = 0;
    while (head < q.length) {
      const cur = q[head++];
      const cx = cur % w, cy = (cur / w) | 0;
      if (cx === tx && cy === ty) break;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (prev[ni] !== -1) continue;
        const target = nx === tx && ny === ty;
        if (!target && !walkable(nx, ny)) continue;
        if (target && !DUNGEON.walkable(game.map.tiles[ni])) continue;
        if (dx && dy && !(walkable(cx + dx, cy) && walkable(cx, cy + dy))) continue;
        prev[ni] = cur; q.push(ni);
      }
    }
    if (prev[ty * w + tx] === -1) return [];
    const path = [];
    for (let i = ty * w + tx, guard = 0; i !== sy * w + sx && guard < w * h; i = prev[i], guard++) path.unshift({ x: i % w, y: (i / w) | 0 });
    return path;
  }

  function screenToTile(e) {
    const v = game.view;
    return { x: Math.floor((e.clientX - v.ox) / (T * v.s)) + Math.floor(game.cam.x0), y: Math.floor((e.clientY - v.oy) / (T * v.s)) + Math.floor(game.cam.y0) };
  }

  cv.addEventListener('contextmenu', (e) => { e.preventDefault(); game.selected = 0; updateActions(); });
  cv.addEventListener('pointermove', (e) => { if (game.active) game.hover = screenToTile(e); });
  cv.addEventListener('click', (e) => {
    if (!game.active) return;
    const { x, y } = screenToTile(e);
    const me = game.ents.get(DD.myId);
    if (!me || x < 0 || y < 0 || x >= game.map.w || y >= game.map.h) return;
    game.held = null;
    const list = actionList();
    const a = list[game.selected] || list[0];
    const enemy = [...game.ents.values()].find((en) => en.kind === 'enemy' && en.x === x && en.y === y);
    const hero = [...game.ents.values()].find((en) => en.kind === 'hero' && en.x === x && en.y === y);
    const dist = Math.max(Math.abs(me.x - x), Math.abs(me.y - y));
    if (a && a.type === 'spell') {
      const fx = a.fx;
      if (fx.kind === 'heal') { if (hero) { sendAction({ act: 'spell', id: a.id, target: hero.id }); return; } }
      else if (enemy) { sendAction({ act: 'spell', id: a.id, target: enemy.id }); return; }
      else if (fx.area) { sendAction({ act: 'spell', id: a.id, x, y }); return; }
    }
    if (a && a.type === 'feature') {
      if (a.id === 'breath-weapon' && (enemy || dist > 0)) { sendAction({ act: 'feature', id: a.id, target: enemy ? enemy.id : undefined, x, y }); return; }
      if (a.id === 'lay-on-hands' && hero) { sendAction({ act: 'feature', id: a.id, target: hero.id }); return; }
    }
    if (enemy) {
      const atk = a && a.type === 'attack' ? a : list.find((l) => l.type === 'attack');
      const W = game.me.attacks[atk.i];
      const reach = W.kind === 'ranged' ? Math.round(W.range / 5) * 4 : W.thrown && dist > 1 ? Math.round(W.thrown / 5) * 3 : Math.max(1, Math.round(W.range / 5));
      if (dist <= reach) { sendAction({ act: 'attack', weapon: atk.i, target: enemy.id }); return; }
    }
    game.path = bfs(me.x, me.y, x, y);
    game.pathTarget = { x, y };
  });

  function followPath() {
    const me = game.ents.get(DD.myId);
    if (!me) return;
    if (game.held) { step(game.held); return; }
    while (game.path.length && game.path[0].x === me.x && game.path[0].y === me.y) game.path.shift();
    if (!game.path.length) return;
    const n = game.path[0];
    const dx = n.x - me.x, dy = n.y - me.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== 1) { game.path = bfs(me.x, me.y, game.pathTarget.x, game.pathTarget.y); return; }
    const chest = game.chests.find((c) => c.x === n.x && c.y === n.y);
    if (chest && chest.open) { game.path = []; return; }
    const enemy = [...game.ents.values()].find((en) => en.kind === 'enemy' && en.x === n.x && en.y === n.y);
    if (enemy) {
      // al llegar junto a un enemigo se ataca con el arma cuerpo a cuerpo elegida (o la primera)
      game.path = [];
      const list = actionList();
      const sel = list[game.selected];
      const atk = sel && sel.type === 'attack' && game.me.attacks[sel.i].kind === 'melee' ? sel : list.find((l) => l.type === 'attack' && game.me.attacks[l.i].kind === 'melee');
      if (atk) sendAction({ act: 'attack', weapon: atk.i, target: enemy.id });
      return;
    }
    step([dx, dy]);
    if (chest) game.path = [];
  }

  // ---------- Dibujo de la partida ----------
  const world = document.createElement('canvas');
  const wg = world.getContext('2d');
  const light = document.createElement('canvas');
  const lg = light.getContext('2d');

  function renderGame(now, dt) {
    followPath();
    for (const e of game.ents.values()) {
      const k = Math.min(1, dt * 14);
      e.moving = Math.abs(e.rx - e.x) + Math.abs(e.ry - e.y) > 0.05;
      e.rx += (e.x - e.rx) * k; e.ry += (e.y - e.ry) * k;
      if (e.moving) e.phase = (e.phase || 0) + dt * 6;
      if (e.x !== e.lastX) { if (e.lastX !== undefined) e.face = e.x < e.lastX ? -1 : 1; e.lastX = e.x; }
    }
    const map = game.map;
    const v = game.view;
    const s = v.s;
    const me = game.ents.get(DD.myId);
    // cámara: tamaño de la vista en casillas y origen
    const vw = Math.min(map.w, Math.ceil(innerWidth / (T * s)) + 1), vh = Math.min(map.h, Math.ceil(v.availH / (T * s)) + 1);
    let cx = me ? me.rx + 0.5 : map.w / 2, cy = me ? me.ry + 0.5 : map.h / 2;
    let x0 = Math.max(0, Math.min(map.w - vw, cx - vw / 2)), y0 = Math.max(0, Math.min(map.h - vh, cy - vh / 2));
    if (map.w <= vw) x0 = 0;
    if (map.h <= vh) y0 = 0;
    game.cam = { x0, y0 };
    const tx0 = Math.floor(x0), ty0 = Math.floor(y0);
    const W = (vw + 1) * T, H = (vh + 1) * T;
    if (world.width !== W || world.height !== H) { world.width = W; world.height = H; light.width = W; light.height = H; }
    wg.imageSmoothingEnabled = false;
    wg.clearRect(0, 0, W, H);
    wg.save();
    wg.translate(-tx0 * T, -ty0 * T);
    for (let y = ty0; y < Math.min(map.h, ty0 + vh + 1); y++) for (let x = tx0; x < Math.min(map.w, tx0 + vw + 1); x++) drawTile(wg, map.tiles, map.w, map.h, x, y, x * T, y * T, now);
    if (game.start && map.kind !== 'world') wg.drawImage(SPRITES.overlayTile('start'), game.start.x * T, game.start.y * T);
    if (game.exit) wg.drawImage(SPRITES.overlayTile('exit'), game.exit.x * T, game.exit.y * T);
    for (const c of game.coins) wg.drawImage(SPRITES.overlayTile('coins'), c.x * T, c.y * T + Math.round(Math.sin(now / 300 + c.x)));
    for (const p of game.potions) wg.drawImage(SPRITES.overlayTile('potion'), p.x * T, p.y * T - Math.round(Math.abs(Math.sin(now / 400 + p.y)) * 2));
    for (const c of game.chests) wg.drawImage(SPRITES.overlayTile(c.open ? 'chestopen' : 'chest'), c.x * T, c.y * T);

    // vista previa del área del conjuro elegido
    const sel = actionList()[game.selected];
    if (sel && game.hover && me && ((sel.type === 'spell' && sel.fx.area) || (sel.type === 'feature' && sel.feature.area))) {
      const area = sel.type === 'spell' ? sel.fx.area : sel.feature.area;
      wg.fillStyle = 'rgba(255,200,80,.18)';
      for (const t of areaTiles(area, me, game.hover)) wg.fillRect(t.x * T, t.y * T, T, T);
    }

    const ents = [...game.ents.values()].sort((a, b) => a.ry - b.ry);
    for (const e of ents) {
      const frame = e.moving ? 1 + (Math.floor(e.phase) % 2) : 0;
      const hit = e.hitUntil > now;
      let lx = 0, ly = 0;
      if (now - e.lunge < 140) { const f = Math.sin((now - e.lunge) / 140 * Math.PI) * 4; lx = e.lungeDx * f; ly = e.lungeDy * f; }
      wg.save(); wg.translate(lx, ly);
      wg.fillStyle = 'rgba(0,0,0,.35)';
      wg.beginPath(); wg.ellipse(e.rx * T + T / 2, e.ry * T + T, 6, 2.5, 0, 0, Math.PI * 2); wg.fill();
      if (e.kind === 'hero') {
        let spr = SPRITES.hero(e.look, { back: e.dir === 'N', frame });
        if (hit) spr = tint(spr);
        if (e.raging) { wg.fillStyle = 'rgba(255,60,30,.25)'; wg.beginPath(); wg.arc(e.rx * T + 8, e.ry * T + 4, 12, 0, Math.PI * 2); wg.fill(); }
        drawOnTile(wg, spr, e.rx, e.ry, (e.face || 1) < 0, (MAP.SPECIES[e.look.species] || {}).scale || 1);
      } else {
        const info = enemyInfo(e.k);
        drawOnTile(wg, enemySprite(e.k, frame, hit), e.rx, e.ry, (e.face || -1) < 0, (info.scale || 1) * (info.boss ? 1.1 : 1));
      }
      wg.restore();
    }

    // efectos: rayos y explosiones de conjuros, humo
    for (let i = game.fx.length - 1; i >= 0; i--) {
      const f = game.fx[i];
      const life = (now - f.start) / 450;
      if (life >= 1) { game.fx.splice(i, 1); continue; }
      wg.globalAlpha = 1 - life;
      if (f.kind === 'bolt') {
        wg.strokeStyle = f.color; wg.lineWidth = 2;
        wg.beginPath(); wg.moveTo(f.from.x * T + 8, f.from.y * T + 4); wg.lineTo(f.to.x * T + 8, f.to.y * T + 4); wg.stroke();
      } else {
        wg.fillStyle = f.color;
        for (const t of areaTiles(f.area, f.from, { x: f.x, y: f.y })) wg.fillRect(t.x * T + 2, t.y * T + 2, T - 4, T - 4);
      }
      wg.globalAlpha = 1;
    }
    for (let i = game.puffs.length - 1; i >= 0; i--) {
      const p = game.puffs[i];
      const life = (now - p.start) / 500;
      if (life >= 1) { game.puffs.splice(i, 1); continue; }
      wg.fillStyle = p.color; wg.globalAlpha = 1 - life;
      for (let k = 0; k < 6; k++) {
        const a = k / 6 * Math.PI * 2, r = 3 + life * 9;
        wg.fillRect(Math.round(p.x * T + 8 + Math.cos(a) * r), Math.round(p.y * T + 8 + Math.sin(a) * r - life * 6), 2, 2);
      }
      wg.globalAlpha = 1;
    }
    wg.restore();

    // luz alrededor de los héroes y niebla de lo no explorado
    const isWorld = map.kind === 'world';
    lg.globalCompositeOperation = 'source-over';
    lg.clearRect(0, 0, W, H);
    lg.fillStyle = isWorld ? 'rgba(6,8,22,0.6)' : 'rgba(6,3,12,0.82)';
    lg.fillRect(0, 0, W, H);
    lg.globalCompositeOperation = 'destination-out';
    const flick = 1 + Math.sin(now / 90) * 0.03;
    const lights = [...game.ents.values()].filter((e) => e.kind === 'hero').map((e) => [e.rx, e.ry, isWorld ? 7.5 : 5.2]);
    if (game.exit) lights.push([game.exit.x, game.exit.y, 1.6]);
    if (isWorld) for (let y = ty0; y < Math.min(map.h, ty0 + vh + 1); y++) for (let x = tx0; x < Math.min(map.w, tx0 + vw + 1); x++) { const ch = map.tiles[y * map.w + x]; if (ch === 'F' || ch === 'H') lights.push([x, y, 3]); }
    for (const [x, y, r] of lights) {
      const lx = (x - tx0) * T + 8, ly = (y - ty0) * T + 6, rad = r * T * flick;
      const gr = lg.createRadialGradient(lx, ly, 0, lx, ly, rad);
      gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.55, 'rgba(0,0,0,.85)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      lg.fillStyle = gr; lg.beginPath(); lg.arc(lx, ly, rad, 0, Math.PI * 2); lg.fill();
    }
    lg.globalCompositeOperation = 'source-over';
    lg.fillStyle = '#050308';
    for (let y = ty0; y < Math.min(map.h, ty0 + vh + 1); y++) for (let x = tx0; x < Math.min(map.w, tx0 + vw + 1); x++) if (!game.seen[y * map.w + x]) lg.fillRect((x - tx0) * T, (y - ty0) * T, T, T);
    wg.drawImage(light, 0, 0);

    // a pantalla
    const viewW = vw * T * s, viewH = vh * T * s;
    const ox = Math.round((innerWidth - Math.min(viewW, map.w * T * s)) / 2), oy = Math.round(v.top + Math.max(0, (v.availH - Math.min(viewH, map.h * T * s)) / 2));
    v.ox = ox - (x0 - tx0) * T * s; v.oy = oy - (y0 - ty0) * T * s;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#07050a'; g.fillRect(0, 0, cv.width, cv.height);
    g.imageSmoothingEnabled = false;
    g.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    g.save();
    g.beginPath(); g.rect(ox, oy, Math.min(viewW, map.w * T * s), Math.min(viewH, map.h * T * s)); g.clip();
    g.drawImage(world, Math.round(v.ox), Math.round(v.oy), W * s, H * s);
    g.restore();
    if (!isWorld) { g.strokeStyle = '#2a1a10'; g.lineWidth = 3; g.strokeRect(ox - 2, oy - 2, Math.min(viewW, map.w * T * s) + 4, Math.min(viewH, map.h * T * s) + 4); }

    // textos en píxeles de pantalla
    const sx = (x) => v.ox + ((x - tx0) * T + T / 2) * s, sy = (y) => v.oy + ((y - ty0) * T) * s;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (isWorld) {
      g.font = '600 13px "Pixelify Sans", sans-serif';
      for (const l of map.labels || []) {
        if (!game.seen[Math.max(0, Math.min(map.h - 1, l.y + 2)) * map.w + l.x] && !game.seen[l.y * map.w + l.x]) continue;
        g.lineWidth = 3; g.strokeStyle = '#000'; g.strokeText(l.text, sx(l.x), sy(l.y)); g.fillStyle = '#f2d36b'; g.fillText(l.text, sx(l.x), sy(l.y));
      }
    }
    for (const e of ents) {
      if (!game.seen[e.y * map.w + e.x]) continue;
      const x = sx(e.rx), y = sy(e.ry) - 22 * s;
      const bw = 14 * s;
      if (e.kind === 'enemy' && (e.hp < e.maxHp || game.hover && game.hover.x === e.x && game.hover.y === e.y)) {
        g.fillStyle = '#1b120c'; g.fillRect(x - bw / 2 - 1, y + 2 * s - 1, bw + 2, 2 * s + 2);
        g.fillStyle = '#d8433b'; g.fillRect(x - bw / 2, y + 2 * s, bw * Math.max(0, e.hp / e.maxHp), 2 * s);
      }
      if (e.kind === 'enemy' && game.hover && game.hover.x === e.x && game.hover.y === e.y && MON && MON[e.k]) {
        g.font = '600 12px "Pixelify Sans", sans-serif';
        const label = `${MON[e.k].name} · CA ${MON[e.k].ac} · ${e.hp}/${e.maxHp} PG`;
        g.lineWidth = 3; g.strokeStyle = '#000'; g.strokeText(label, x, y - 6); g.fillStyle = '#ffd0b0'; g.fillText(label, x, y - 6);
      }
      if (e.kind === 'hero') {
        g.font = `600 ${Math.max(10, 4 * s)}px "Pixelify Sans", sans-serif`;
        const isMe = e.id === DD.myId;
        g.lineWidth = 3; g.strokeStyle = '#000'; g.strokeText(e.name, x, y - 2);
        g.fillStyle = isMe ? '#ffe9a8' : '#f4ead2'; g.fillText(e.name, x, y - 2);
        g.fillStyle = '#1b120c'; g.fillRect(x - bw / 2 - 1, y + 4 * s - 1, bw + 2, 2 * s + 2);
        g.fillStyle = '#5cd85c'; g.fillRect(x - bw / 2, y + 4 * s, bw * Math.max(0, e.hp / e.maxHp), 2 * s);
        const b = game.bubbles.get(e.id);
        if (b && b.until > now) drawBubble(g, x, y - 10 * s, b.text);
      }
    }
    for (let i = game.floaters.length - 1; i >= 0; i--) {
      const f = game.floaters[i];
      const life = (now - f.start) / 1100;
      if (life >= 1 || !f.text) { game.floaters.splice(i, 1); continue; }
      g.font = `700 ${f.big ? Math.max(16, 6 * s) : Math.max(13, 5 * s)}px "Pixelify Sans", sans-serif`;
      g.globalAlpha = 1 - Math.max(0, life - 0.6) / 0.4;
      const x = sx(f.x), y = sy(f.y) - (14 + life * 12) * s;
      g.lineWidth = 4; g.strokeStyle = '#1a0a04'; g.strokeText(f.text, x, y);
      g.fillStyle = f.color; g.fillText(f.text, x, y);
      g.globalAlpha = 1;
    }
    if (isWorld && game.showMap) drawMinimap(now);
  }

  // Casillas de un área (igual que el servidor) para la vista previa y el efecto
  function areaTiles(area, from, at) {
    const r = Math.max(1, Math.round(area.size / 5));
    const out = [];
    if (area.shape === 'sphere' || area.shape === 'emanation') {
      const c = area.shape === 'emanation' ? from : at;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) out.push({ x: c.x + dx, y: c.y + dy });
    } else if (area.shape === 'cone') {
      const dx = at.x - from.x, dy = at.y - from.y;
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
        if (!x && !y) continue;
        const cos = (dx * x + dy * y) / (Math.hypot(dx, dy) * Math.hypot(x, y) || 1);
        if (cos >= 0.7) out.push({ x: from.x + x, y: from.y + y });
      }
    } else if (area.shape === 'line') {
      const len = Math.hypot(at.x - from.x, at.y - from.y) || 1;
      for (let i = 1; i <= r; i++) out.push({ x: Math.round(from.x + (at.x - from.x) / len * i), y: Math.round(from.y + (at.y - from.y) / len * i) });
    }
    return out;
  }

  // Minimapa del mundo (sólo lo explorado)
  const MINI_COLORS = { ',': '#2f4a2a', ';': '#3a5a32', T: '#1a3018', P: '#16281e', w: '#14284a', v: '#24426a', s: '#7a6a4a', h: '#4a6a3a', M: '#5a5a62', '=': '#8a6a3a', b: '#8a6a3a', g: '#3a3430', t: '#6a6a72', R: '#7a7a7e', F: '#ff7a2a', C: '#000000', H: '#ffcf6a', k: '#8a5a3a', D: '#b83a2a' };
  function drawMinimap() {
    const map = game.map;
    const k = game.view.mobile ? 1.5 : 2.2;
    const mw = map.w * k, mh = map.h * k;
    const x0 = innerWidth - mw - 14, y0 = game.view.mobile ? 150 : 14;
    if (!game.miniImg || game.miniSeen !== game.seen.reduce((a, b) => a + b, 0)) {
      const c = game.miniImg || document.createElement('canvas');
      c.width = map.w; c.height = map.h;
      const mg = c.getContext('2d');
      mg.fillStyle = '#050308'; mg.fillRect(0, 0, map.w, map.h);
      for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) if (game.seen[y * map.w + x]) { mg.fillStyle = MINI_COLORS[map.tiles[y * map.w + x]] || '#333'; mg.fillRect(x, y, 1, 1); }
      game.miniImg = c; game.miniSeen = game.seen.reduce((a, b) => a + b, 0);
    }
    g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(x0 - 4, y0 - 4, mw + 8, mh + 8);
    g.imageSmoothingEnabled = false;
    g.drawImage(game.miniImg, x0, y0, mw, mh);
    g.strokeStyle = '#8c6038'; g.lineWidth = 2; g.strokeRect(x0 - 3, y0 - 3, mw + 6, mh + 6);
    for (const e of game.ents.values()) {
      if (e.kind !== 'hero') continue;
      g.fillStyle = e.id === DD.myId ? '#ffe9a8' : '#7ad0ff';
      g.fillRect(x0 + e.x * k - 2, y0 + e.y * k - 2, 4, 4);
    }
  }

  function drawBubble(c, x, y, text) {
    c.font = '16px "VT323", monospace';
    const t = text.length > 40 ? text.slice(0, 39) + '…' : text;
    const w = c.measureText(t).width + 14;
    c.fillStyle = '#fbf3dc'; c.strokeStyle = '#24140a'; c.lineWidth = 2;
    c.beginPath(); c.roundRect(x - w / 2, y - 22, w, 20, 5); c.fill(); c.stroke();
    c.fillStyle = '#2a1a10'; c.fillText(t, x, y - 12);
  }

  // ======================================================================
  //  Editor de mazmorras
  // ======================================================================
  const edEl = $('#deditor'), ecv = $('#decanvas'), eg = ecv.getContext('2d');
  const ed = { id: null, tiles: [], objects: new Map(), tool: '#', painting: false, erase: false, view: { s: 2, ox: 0, oy: 0 } };
  const ew = document.createElement('canvas'); ew.width = DW * T; ew.height = DH * T;
  const ewg = ew.getContext('2d');

  function palette() {
    const groups = [
      { group: 'Suelo', items: [['.', 'Suelo'], ['#', 'Muro'], ['+', 'Puerta'], ['^', 'Pinchos'], ['~', 'Agua']] },
      { group: 'Objetos', items: [['start', 'Entrada'], ['exit', 'Salida'], ['chest', 'Cofre'], ['potion', 'Poción']] },
    ];
    const fam = {};
    for (const [k, info] of Object.entries(DUNGEON.ENEMIES)) (fam[info.family] = fam[info.family] || []).push([k, MON && MON[k] ? MON[k].name : k]);
    for (const [name, items] of Object.entries(fam)) groups.push({ group: name, items });
    groups.push({ group: 'Herramientas', items: [['erase', 'Quitar objeto']] });
    return groups;
  }
  const isTile = (k) => k.length === 1;

  function iconFor(k) {
    const c = document.createElement('canvas');
    c.width = 32; c.height = 36;
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    if (isTile(k)) {
      if (k === '#') x.drawImage(SPRITES.wallTile(true), 0, 4, 32, 32);
      else if (k === '~') x.drawImage(SPRITES.overlayTile('water', 0), 0, 4, 32, 32);
      else {
        x.drawImage(SPRITES.floorTile(1, 1), 0, 4, 32, 32);
        if (k === '+') x.drawImage(SPRITES.overlayTile('door'), 0, 4, 32, 32);
        if (k === '^') x.drawImage(SPRITES.overlayTile('spikes', 1), 0, 4, 32, 32);
      }
    } else if (k === 'erase') {
      x.font = '24px serif'; x.textAlign = 'center'; x.fillText('🧹', 16, 26);
    } else if (DUNGEON.ENEMIES[k]) {
      const spr = enemySprite(k, 0, false);
      const sc = Math.min(32 / spr.width, 36 / spr.height);
      x.drawImage(spr, (32 - spr.width * sc) / 2, 36 - spr.height * sc, spr.width * sc, spr.height * sc);
    } else {
      x.drawImage(SPRITES.floorTile(1, 1), 0, 4, 32, 32);
      x.drawImage(SPRITES.overlayTile(k), 0, 4, 32, 32);
    }
    return c;
  }

  function buildPalette() {
    const pal = $('#de-palette');
    pal.innerHTML = '';
    for (const grp of palette()) {
      const h = document.createElement('div'); h.className = 'de-group'; h.textContent = grp.group;
      pal.appendChild(h);
      const box = document.createElement('div'); box.className = 'de-items';
      for (const [k, name] of grp.items) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'tool-btn' + (ed.tool === k ? ' on' : '');
        const m = MON && MON[k];
        b.title = m ? `${m.name}${DUNGEON.ENEMIES[k].homebrew ? ' (propio del juego)' : ''}: CA ${m.ac}, ${m.hp} PG, VD ${m.cr} (${m.xp} PX)` : name;
        b.appendChild(iconFor(k));
        const l = document.createElement('span'); l.textContent = name; b.appendChild(l);
        b.onclick = () => { ed.tool = k; buildPalette(); };
        box.appendChild(b);
      }
      pal.appendChild(box);
    }
  }

  function blankDungeon() {
    const tiles = [];
    for (let y = 0; y < DH; y++) for (let x = 0; x < DW; x++) tiles.push(x === 0 || y === 0 || x === DW - 1 || y === DH - 1 ? '#' : '.');
    return { id: null, name: '', tiles: tiles.join(''), objects: [{ k: 'start', x: 2, y: 2 }, { k: 'exit', x: DW - 3, y: DH - 3 }] };
  }

  async function openEditor(d) {
    await monsters();
    d = d || blankDungeon();
    ed.id = d.mine === false ? null : d.id;
    ed.tiles = d.tiles.split('');
    ed.objects = new Map(d.objects.map((o) => [o.x + ',' + o.y, DUNGEON.enemyKey(o.k) || o.k]));
    $('#de-name').value = d.mine === false ? `${d.name} (copia)`.slice(0, 32) : d.name;
    edEl.classList.remove('hidden');
    DD.setScene('editor');
    buildPalette();
    resizeEditor();
  }

  DD.on('dget', (m) => openEditor(m.dungeon));

  function resizeEditor() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = ecv.parentElement.getBoundingClientRect();
    ecv.width = Math.round(r.width * dpr); ecv.height = Math.round(r.height * dpr);
    ecv.style.width = r.width + 'px'; ecv.style.height = r.height + 'px';
    const s = fitScale(r.width - 8, r.height - 8, DW * T, DH * T);
    ed.view = { s, dpr, ox: (r.width - DW * T * s) / 2, oy: (r.height - DH * T * s) / 2 };
  }
  window.addEventListener('resize', () => { if (DD.scene === 'editor') resizeEditor(); });

  function closeEditor() { edEl.classList.add('hidden'); DD.setScene('tavern'); }

  function edTile(e) {
    const r = ecv.getBoundingClientRect(), v = ed.view;
    return { x: Math.floor((e.clientX - r.left - v.ox) / (T * v.s)), y: Math.floor((e.clientY - r.top - v.oy) / (T * v.s)) };
  }

  function paint(x, y, erase) {
    if (x < 0 || y < 0 || x >= DW || y >= DH) return;
    const k = x + ',' + y;
    if (erase || ed.tool === 'erase') {
      if (ed.objects.has(k)) ed.objects.delete(k);
      else if (erase) ed.tiles[y * DW + x] = '.';
      return;
    }
    if (isTile(ed.tool)) {
      ed.tiles[y * DW + x] = ed.tool;
      if (!DUNGEON.walkable(ed.tool)) ed.objects.delete(k);
      return;
    }
    if (!DUNGEON.walkable(ed.tiles[y * DW + x])) ed.tiles[y * DW + x] = '.';
    if (ed.tool === 'start' || ed.tool === 'exit') for (const [kk, v] of ed.objects) if (v === ed.tool) ed.objects.delete(kk);
    ed.objects.set(k, ed.tool);
  }

  ecv.addEventListener('contextmenu', (e) => e.preventDefault());
  ecv.addEventListener('pointerdown', (e) => {
    ecv.setPointerCapture(e.pointerId);
    ed.painting = true; ed.erase = e.button === 2;
    const t = edTile(e); ed.last = t.x + ',' + t.y;
    paint(t.x, t.y, ed.erase);
  });
  ecv.addEventListener('pointermove', (e) => {
    const t = edTile(e); ed.hover = t;
    if (!ed.painting) return;
    if (!isTile(ed.tool) && ed.tool !== 'erase' && !ed.erase) return;
    const k = t.x + ',' + t.y;
    if (k !== ed.last) { ed.last = k; paint(t.x, t.y, ed.erase); }
  });
  ecv.addEventListener('pointerup', () => { ed.painting = false; });
  ecv.addEventListener('pointerleave', () => { ed.hover = null; });

  function collect() {
    return {
      id: ed.id, name: $('#de-name').value.trim(), tiles: ed.tiles.join(''),
      objects: [...ed.objects].map(([k, v]) => { const [x, y] = k.split(',').map(Number); return { k: v, x, y }; }),
    };
  }

  let playAfterSave = false;
  function saveDungeon(play) {
    const d = collect();
    const v = DUNGEON.validate(d);
    if (!v.ok) { DD.toast(v.error); return; }
    playAfterSave = play;
    DD.net.send({ t: 'dsave', dungeon: d });
  }
  $('#de-save').onclick = () => saveDungeon(false);
  $('#de-play').onclick = () => saveDungeon(true);
  $('#de-close').onclick = closeEditor;
  DD.on('dsaved', (m) => {
    if (!m.ok) { DD.toast(m.error); return; }
    ed.id = m.id;
    DD.toast('Mazmorra guardada.');
    if (playAfterSave) DD.net.send({ t: 'denter', id: m.id });
  });

  function renderEditor(now) {
    const v = ed.view;
    ewg.imageSmoothingEnabled = false;
    ewg.clearRect(0, 0, ew.width, ew.height);
    const tiles = ed.tiles.join('');
    for (let y = 0; y < DH; y++) for (let x = 0; x < DW; x++) drawTile(ewg, tiles, DW, DH, x, y, x * T, y * T, now);
    const objs = [...ed.objects].map(([k, v2]) => { const [x, y] = k.split(',').map(Number); return { k: v2, x, y }; }).sort((a, b) => a.y - b.y);
    for (const o of objs) {
      if (DUNGEON.ENEMIES[o.k]) { const info = enemyInfo(o.k); drawOnTile(ewg, enemySprite(o.k, 0, false), o.x, o.y, false, (info.scale || 1) * (info.boss ? 1.1 : 1)); }
      else ewg.drawImage(SPRITES.overlayTile(o.k), o.x * T, o.y * T);
    }
    ewg.fillStyle = 'rgba(255,255,255,.06)';
    for (let x = 1; x < DW; x++) ewg.fillRect(x * T, 0, 1, DH * T);
    for (let y = 1; y < DH; y++) ewg.fillRect(0, y * T, DW * T, 1);
    if (ed.hover && ed.hover.x >= 0 && ed.hover.y >= 0 && ed.hover.x < DW && ed.hover.y < DH) {
      ewg.strokeStyle = ed.tool === 'erase' ? '#ff6b6b' : '#ffe9a8'; ewg.lineWidth = 1;
      ewg.strokeRect(ed.hover.x * T + 0.5, ed.hover.y * T + 0.5, T - 1, T - 1);
    }
    eg.setTransform(1, 0, 0, 1, 0, 0);
    eg.fillStyle = '#0a0508'; eg.fillRect(0, 0, ecv.width, ecv.height);
    eg.imageSmoothingEnabled = false;
    eg.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    eg.drawImage(ew, Math.round(v.ox), Math.round(v.oy), DW * T * v.s, DH * T * v.s);
    const enemies = objs.filter((o) => DUNGEON.ENEMIES[o.k]);
    const xp = enemies.reduce((t, o) => t + (MON && MON[o.k] ? MON[o.k].xp : 0), 0);
    $('#de-help').textContent = `${enemies.length}/${DUNGEON.MAX_ENEMIES} enemigos · ${xp} PX en total · Clic o arrastra para pintar · Clic derecho para borrar · Necesitas una entrada y una salida`;
  }

  // ======================================================================
  //  Bucle
  // ======================================================================
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (DD.scene === 'dungeon' && game.active && game.map) renderGame(now, dt);
    else if (DD.scene === 'editor') renderEditor(now);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // Pruebas automáticas: casilla del mapa a coordenadas de ventana
  window.__dTileToScreen = (x, y) => ({ x: game.view.ox + (x - Math.floor(game.cam.x0) + 0.5) * T * game.view.s, y: game.view.oy + (y - Math.floor(game.cam.y0) + 0.5) * T * game.view.s });
  window.__dGame = game;
  window.__bfs = bfs;
})();
