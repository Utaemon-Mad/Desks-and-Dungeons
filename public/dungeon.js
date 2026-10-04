/* global DD, DUNGEON, SPRITES, DSPRITES, MAP, RULES */
// Mazmorras y mundo abierto: menú (crear con nivel y tema o unirse a una partida), partida en tiempo real
// con movimiento suave, habilidades, pociones, proyectiles esquivables, avisos de los jefes, luces y botín.
(() => {
  'use strict';

  const T = 16; // píxeles por casilla
  const $ = (s) => document.querySelector(s);
  const DCH = new Set(DUNGEON.DUNGEON_CHARS.split(''));
  const monName = (e) => (e.elite ? 'Élite: ' : '') + ((RULES.MONSTERS[e.k] || {}).name || e.k);

  // ======================================================================
  //  Menú de mazmorras
  // ======================================================================
  const menuEl = $('#dmenu'), listEl = $('#dlist');
  const menu = { theme: 'random', level: 1, max: 4 };

  DD.on('open-dungeons', () => {
    menuEl.classList.remove('hidden');
    listEl.innerHTML = '<p class="muted">Buscando partidas…</p>';
    DD.net.send({ t: 'dmenu' });
    buildThemes();
  });
  $('#dclose').onclick = () => menuEl.classList.add('hidden');

  function buildThemes() {
    const box = $('#dthemes');
    box.innerHTML = '';
    for (const [id, th] of [['random', { name: 'Al azar', icon: '🎲' }], ...Object.entries(RULES.THEMES)]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'theme-btn' + (menu.theme === id ? ' on' : '');
      b.innerHTML = '<span class="ic"></span><span></span>';
      b.firstChild.textContent = th.icon;
      b.lastChild.textContent = th.name;
      if (id !== 'random') b.title = `Jefe: ${RULES.MONSTERS[th.boss].name}`;
      b.onclick = () => { menu.theme = id; buildThemes(); };
      box.appendChild(b);
    }
    const lv = $('#dlevel');
    lv.max = menu.max;
    lv.value = Math.min(menu.level, menu.max);
    $('#dlevel-val').textContent = lv.value;
    const me = DD.me ? RULES.levelFromXp(DD.me.xp) : 1;
    $('#dlevel-hint').textContent = Number(lv.value) > me ? '⚠️ Por encima de tu nivel: más peligro y mejor botín.' : Number(lv.value) < me - 3 ? 'Muy fácil: darán poca experiencia.' : 'Adecuada para tu nivel.';
  }
  $('#dlevel').addEventListener('input', (e) => { menu.level = Number(e.target.value); buildThemes(); });
  $('#dgo').onclick = () => { menuEl.classList.add('hidden'); DD.net.send({ t: 'dnew', theme: menu.theme === 'random' ? null : menu.theme, level: menu.level }); };

  DD.on('dmenu', (m) => {
    menu.max = m.maxLevel;
    if (!menu.touched && DD.me) { menu.level = RULES.levelFromXp(DD.me.xp); menu.touched = true; }
    buildThemes();
    listEl.innerHTML = '';
    if (!m.list.length) { listEl.innerHTML = '<p class="muted">No hay partidas abiertas. ¡Crea una y que se unan tus amigos!</p>'; return; }
    for (const d of m.list) {
      const row = document.createElement('div');
      row.className = 'drow';
      const info = document.createElement('div');
      info.className = 'dinfo';
      const nm = document.createElement('b'); nm.textContent = `${(RULES.THEMES[d.theme] || {}).icon || ''} ${d.name}`;
      const meta = document.createElement('small'); meta.textContent = `Nivel ${d.level} · ${d.players.length ? 'dentro: ' + d.players.join(', ') : 'vacía'}`;
      info.append(nm, meta);
      const play = document.createElement('button'); play.className = 'btn'; play.textContent = '⚔️ UNIRSE';
      play.onclick = () => { menuEl.classList.add('hidden'); DD.net.send({ t: 'djoin', id: d.id }); };
      row.append(info, play);
      listEl.appendChild(row);
    }
  });

  // ======================================================================
  //  Estado de la partida
  // ======================================================================
  const viewEl = $('#dview'), cv = $('#dcanvas'), g = cv.getContext('2d');
  const game = {
    active: false, map: null, ents: new Map(), chests: [], loot: [], portal: null, start: null, props: [],
    seen: null, vis: null, floaters: [], fx: [], projs: [], teles: [], particles: [], bubbles: new Map(),
    view: { s: 3, dpr: 1 }, cam: { x: 0, y: 0 }, you: null, youAt: 0, hover: null, mouse: null, showMap: true, log: [],
    keys: new Set(), sentDir: '0,0', boss: null, statics: null, auras: [], lastHurt: 0,
  };
  window.__dGame = game;

  function resizeGame() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(innerWidth * dpr); cv.height = Math.round(innerHeight * dpr);
    const mobile = innerWidth <= 820;
    game.view = { s: mobile ? 2 : innerWidth > 1700 ? 4 : 3, dpr, mobile };
  }
  window.addEventListener('resize', () => { if (game.active) resizeGame(); });

  function upsert(id, data, kind, now) {
    let e = game.ents.get(id);
    if (!e) { e = { id, kind, rx: data.x, ry: data.y, fx: data.x, fy: data.y, t0: 0, dur: 1, hitUntil: 0, lunge: 0, face: 1 }; game.ents.set(id, e); }
    if (e.x !== undefined && (e.x !== data.x || e.y !== data.y)) {
      e.fx = e.rx; e.fy = e.ry; e.t0 = now; e.dur = Math.max(80, Math.min(900, data.sm || 200));
      if (data.x !== e.x) e.face = data.x < e.x ? -1 : 1;
      if (Math.abs(data.x - e.rx) > 3 || Math.abs(data.y - e.ry) > 3) { e.fx = data.x; e.fy = data.y; } // teletransporte
    }
    Object.assign(e, data, { alive: true });
    return e;
  }

  function applySnap(m) {
    const now = performance.now();
    for (const e of game.ents.values()) e.alive = false;
    for (const p of m.players) upsert(p.id, p, 'hero', now);
    for (const en of m.enemies) upsert(en.id, en, 'enemy', now);
    for (const ev of m.events || []) onEvent(ev, now);
    for (const [id, e] of game.ents) if (!e.alive) game.ents.delete(id);
    game.chests = m.chests; game.loot = m.loot; game.portal = m.portal; game.start = m.start;
    // jefe a la vista
    const boss = [...game.ents.values()].find((e) => e.kind === 'enemy' && e.boss && game.vis && game.vis[e.y * game.map.w + e.x]);
    game.boss = boss || null;
    updateHud();
  }

  // Visión: lo que ven los héroes (línea de visión) se ilumina; lo explorado queda en penumbra
  const OPAQUE = new Set(['#', 'T', 'P', 'M', 'R', 'k']);
  function updateVision() {
    const { w, h, tiles } = game.map;
    const vis = game.vis;
    vis.fill(0);
    const R = game.map.kind === 'world' ? 9 : 7;
    for (const e of game.ents.values()) {
      if (e.kind !== 'hero') continue;
      const cx = e.x, cy = e.y;
      for (let a = 0; a < 360; a += 2) {
        const dx = Math.cos(a * Math.PI / 180), dy = Math.sin(a * Math.PI / 180);
        let x = cx + 0.5, y = cy + 0.5;
        for (let i = 0; i < R; i++) {
          const tx = Math.floor(x), ty = Math.floor(y);
          if (tx < 0 || ty < 0 || tx >= w || ty >= h) break;
          vis[ty * w + tx] = 1; game.seen[ty * w + tx] = 1;
          if (OPAQUE.has(tiles[ty * w + tx]) && (tx !== cx || ty !== cy)) break;
          x += dx; y += dy;
        }
      }
    }
  }

  function float(x, y, text, color, big) { game.floaters.push({ x, y, text, color, big, start: performance.now() }); }
  const who = (id) => { if (id === DD.myId) return 'Tú'; const e = game.ents.get(id); if (!e) return '?'; return e.kind === 'hero' ? e.name : monName(e); };

  function log(text, cls) {
    game.log.push({ text, cls });
    if (game.log.length > 6) game.log.shift();
    const el = $('#dlog');
    el.innerHTML = '';
    for (const l of game.log) { const d = document.createElement('div'); d.className = 'dlog-line ' + (l.cls || ''); d.textContent = l.text; el.appendChild(d); }
  }

  const FX_COL = { fire: '#ff7a2a', cold: '#9ad8ff', holy: '#fff2a0', void: '#a05aff', blood: '#ff3a4a', lightning: '#fff27a' };
  const PROJ_COL = { arrow: '#e8dcc0', javelin: '#c8a070', bolt: '#7aff9a', necro: '#9a5aff', fire: '#ff7a2a' };

  function onEvent(ev, now) {
    const me = DD.myId;
    switch (ev.e) {
      case 'hit': {
        const t = game.ents.get(ev.t);
        const by = game.ents.get(ev.by);
        if (t) {
          if (ev.miss) float(t.x, t.y, 'Fallo', '#9aa0aa');
          else if (ev.dodge) float(t.x, t.y, 'Esquiva', '#9ad8ff');
          else {
            t.hitUntil = now + 140;
            const col = t.kind === 'hero' ? '#ff5a5a' : ev.crit ? '#ffd23f' : ev.kind === 'dot' ? '#b08aff' : '#ffffff';
            float(t.x, t.y, (ev.crit ? '¡' : '') + ev.dmg + (ev.crit ? '!' : '') + (ev.block ? ' 🛡' : ''), col, ev.t === me || ev.crit);
            for (let i = 0; i < (ev.crit ? 10 : 5); i++) spark(t.x + 0.5, t.y + 0.3, t.kind === 'hero' ? '#c83a3a' : (RULES.MONSTERS[t.k] || {}).undead ? '#d8d0b8' : '#9a1a1a');
            if (ev.t === me) { game.lastHurt = now; DD.blip(150, 0.06); }
          }
        }
        if (by && t && !ev.dodge) {
          by.lunge = now; by.lungeDx = Math.sign(t.x - by.x); by.lungeDy = Math.sign(t.y - by.y);
          if (ev.kind === 'ranged') game.fx.push({ kind: 'arrow', from: { x: by.x, y: by.y }, to: { x: t.x, y: t.y }, start: now, dur: 160 });
          if (ev.kind === 'magic') game.fx.push({ kind: 'bolt', from: { x: by.x, y: by.y }, to: { x: t.x, y: t.y }, start: now, dur: 220, color: '#9ad8ff' });
        }
        if (ev.by === me && ev.dmg && !ev.miss) DD.blip(ev.crit ? 330 : 240, 0.04);
        break;
      }
      case 'swing': { const e = game.ents.get(ev.id), t = game.ents.get(ev.t); if (e && t) { e.lunge = now; e.lungeDx = Math.sign(t.x - e.x); e.lungeDy = Math.sign(t.y - e.y); } break; }
      case 'cast': {
        const by = game.ents.get(ev.by);
        if (by) for (let i = 0; i < 8; i++) spark(by.x + 0.5, by.y + 0.2, '#fff2a0', true);
        log(`${who(ev.by)} usa ${ev.name}`, ev.by === me ? 'mine' : '');
        DD.blip(700, 0.06);
        break;
      }
      case 'fx': game.fx.push({ ...ev, start: now + (ev.delay || 0), dur: ev.kind === 'aura' ? ev.until : ev.kind === 'blast' || ev.kind === 'nova' ? 420 : 260 }); if (ev.kind === 'aura') game.auras.push({ id: ev.id, until: now + ev.until, radius: ev.radius }); break;
      case 'die': {
        for (let i = 0; i < 14; i++) spark(ev.x + 0.5, ev.y + 0.4, (RULES.MONSTERS[ev.k] || {}).undead ? '#d8d0b8' : '#8a1a1a');
        if (ev.xp) float(ev.x, ev.y, `+${ev.xp} PX`, '#9fe0ff', true);
        if (ev.xp !== 0) log(`${(RULES.MONSTERS[ev.k] || {}).name || ev.k} cae.${ev.xp ? ` +${ev.xp} PX` : ''}`, ev.boss ? 'good big' : 'good');
        DD.blip(ev.boss ? 90 : 120, ev.boss ? 0.4 : 0.12);
        break;
      }
      case 'loot': {
        if (ev.gold) float(ev.x, ev.y, `+${ev.gold} 🪙`, '#ffd23f', ev.id === me);
        if (ev.xp && ev.id === me) setTimeout(() => float(ev.x, ev.y, `+${ev.xp} PX`, '#9fe0ff', true), 300);
        if (ev.item) { float(ev.x, ev.y, ev.item.name, DSPRITES.RARITY[ev.item.rarity], true); log(`${who(ev.id)} recoge «${ev.item.name}» (${RULES.RARITIES[ev.item.rarity].name.toLowerCase()})`, 'loot-' + ev.item.rarity); }
        if (ev.cons) float(ev.x, ev.y, RULES.CONSUMABLES[ev.cons].name, '#ff8a8a');
        if (ev.id === me) DD.blip(ev.item ? 1320 : 1046, 0.08);
        break;
      }
      case 'chest': for (let i = 0; i < 16; i++) spark(ev.x + 0.5, ev.y + 0.4, '#ffd23f', true); DD.blip(880, 0.12); break;
      case 'heal': { const t = game.ents.get(ev.id); if (t) float(t.x, t.y, '+' + ev.amount, '#7dff8a', ev.id === me); break; }
      case 'eheal': { const t = game.ents.get(ev.id); if (t) { float(t.x, t.y, '+' + ev.amount, '#7dff8a'); game.fx.push({ kind: 'heal', x: t.x, y: t.y, start: now, dur: 400 }); } break; }
      case 'proj': game.projs.push({ ...ev, start: now }); break;
      case 'tele': game.teles.push({ ...ev, start: now }); DD.blip(200, 0.15); break;
      case 'boom': {
        const t = game.teles.find((x) => x.id === ev.id);
        if (t) { for (const [x, y] of t.cells) if (Math.random() < 0.35) spark(x + 0.5, y + 0.5, t.kind === 'breath' ? '#ff7a2a' : '#c8b8a8'); game.teles.splice(game.teles.indexOf(t), 1); }
        game.shake = now + 260;
        DD.blip(70, 0.25);
        break;
      }
      case 'special': log(`${ev.name}: ${{ slam: '¡golpe sísmico!', nova: '¡nova de muerte!', breath: '¡aliento de fuego!', volley: '¡andanada!', summon: 'llama a sus esbirros', charge: '¡embiste!' }[ev.s] || ''}`, 'hurt'); break;
      case 'summon': for (let i = 0; i < 10; i++) spark(ev.x + 0.5, ev.y + 0.5, '#7cff6a', true); break;
      case 'portal': log(`¡${ev.name} ha caído! Se abre un portal de salida.`, 'good big'); DD.toast('🏆 ¡Jefe derrotado! Recoge el botín y cruza el portal.'); for (let i = 0; i < 30; i++) spark(ev.x + 0.5, ev.y + 0.5, '#7ad0ff', true); break;
      case 'down': log(`${who(ev.id)} cae.`, 'hurt'); break;
      case 'join': if (ev.id !== me) log(`${who(ev.id)} entra.`); break;
    }
  }

  function spark(x, y, color, up) {
    game.particles.push({ x, y, vx: (Math.random() - 0.5) * 3, vy: up ? -1.5 - Math.random() * 2 : (Math.random() - 0.8) * 3, life: 0, max: 0.4 + Math.random() * 0.4, color });
  }

  DD.on('dstart', (m) => {
    game.active = true;
    game.map = m.dungeon;
    game.props = m.dungeon.props || [];
    game.ents.clear(); game.floaters = []; game.fx = []; game.projs = []; game.teles = []; game.particles = []; game.auras = [];
    game.log = []; game.statics = null; game.boss = null; game.camInit = false; game.keys.clear(); game.sentDir = '0,0';
    game.seen = new Uint8Array(m.dungeon.w * m.dungeon.h);
    game.vis = new Uint8Array(m.dungeon.w * m.dungeon.h);
    game.you = m.you; game.youAt = performance.now();
    game.miniImg = null;
    const th = RULES.THEMES[m.dungeon.theme];
    $('#dname').textContent = m.dungeon.kind === 'world' ? m.dungeon.name : `${th ? th.icon + ' ' : ''}${m.dungeon.name} · nivel ${m.dungeon.level}`;
    $('#dlog').innerHTML = '';
    viewEl.classList.remove('hidden');
    viewEl.classList.toggle('world', m.dungeon.kind === 'world');
    DD.setScene('dungeon');
    resizeGame();
    applySnap(m);
    updateVision();
    buildBar();
    DD.toast(m.dungeon.kind === 'world'
      ? `${m.dungeon.name}: explora, entra en las cuevas y vuelve al pueblo (casa iluminada) para descansar.`
      : 'Clic para andar, clic en un enemigo para atacarlo. 1-8 habilidades, Q/E pociones. Derrota al jefe para abrir el portal.');
  });
  DD.on('dsnap', (m) => { if (game.active) { applySnap(m); updateVision(); } });
  DD.on('dme', (m) => { game.you = m; game.youAt = performance.now(); updateHud(); });
  DD.on('dwhisper', (m) => DD.toast(m.text));
  DD.on('me', () => { if (game.active) buildBar(); });
  DD.on('dexit', (m) => {
    game.active = false;
    if (m.silent) return; // pasa de una mazmorra al mundo: llega otro dstart
    viewEl.classList.add('hidden');
    DD.setScene('tavern');
    if (m.reason === 'win') DD.toast('🏆 ¡Mazmorra completada!');
    else if (m.reason === 'down') DD.toast(`💀 Has caído${m.lost ? ` y pierdes ${m.lost} de oro` : ''}. Vuelves a la taberna.`);
    else if (m.reason === 'return') DD.toast('🌀 El pergamino te devuelve a la taberna.');
    else DD.toast('Vuelves a la taberna: vida y energía recuperadas.');
  });
  DD.on('log', (m) => {
    if (!game.active || m.t !== 'chat') return;
    log(`${m.name}: ${m.text}`, 'chat');
    if (game.ents.has(m.id)) game.bubbles.set(m.id, { text: m.text, until: performance.now() + 4000 + m.text.length * 50 });
  });
  $('#dexit').onclick = () => DD.net.send({ t: 'dleave' });

  // Tiempo del servidor (para las esperas de habilidades)
  const serverNow = () => (game.you ? game.you.now + (performance.now() - game.youAt) : Date.now());

  function updateHud() {
    const y = game.you;
    DD.emit('combat', y);
    const left = [...game.ents.values()].filter((e) => e.kind === 'enemy').length;
    $('#dleft').textContent = game.map && game.map.kind === 'world' ? 'M: mapa' : game.portal ? '🌀 Portal abierto' : `👹 ${left}`;
    const b = game.boss;
    const bb = $('#dboss');
    if (b) { bb.classList.remove('hidden'); $('#dboss-name').textContent = monName(b); $('#dboss-bar').style.width = Math.max(0, 100 * b.hp / b.maxHp) + '%'; }
    else bb.classList.add('hidden');
  }

  // ---------- Barra de habilidades y consumibles ----------
  const CONS_KEYS = { 'pocion-vida-p': 'Q', 'pocion-vida-g': 'Q', 'pocion-energia': 'E', 'brebaje-trol': 'R', elixir: 'T', 'perg-fuego': 'Z', 'perg-rayo': 'X', 'perg-sanacion': 'C', 'perg-retorno': 'V' };
  function abilities() { return DD.me ? RULES.derive(DD.me).abilities.filter((a) => a.ready) : []; }
  function consList() {
    if (!DD.me) return [];
    const c = DD.me.cons || {};
    const out = [];
    // la poción de vida: primero la pequeña, la grande con Mayús+Q
    for (const id of Object.keys(RULES.CONSUMABLES)) if (c[id]) out.push({ id, n: c[id], key: CONS_KEYS[id] });
    return out;
  }

  function buildBar() {
    const bar = $('#dactions');
    bar.innerHTML = '';
    const d = DD.me ? RULES.derive(DD.me) : null;
    if (d) {
      const atk = document.createElement('div');
      atk.className = 'act-btn attack';
      atk.title = `Ataque básico: ${d.weapon.name} (${d.dmg[0]}–${d.dmg[1]}). Clic en un enemigo.`;
      atk.innerHTML = '<span class="ic">⚔️</span><span class="lb"></span><span class="cd"></span>';
      atk.querySelector('.lb').textContent = d.weapon.name;
      bar.appendChild(atk);
    }
    abilities().forEach((a, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'act-btn skill';
      b.dataset.id = a.id;
      b.title = `${a.name} (${i + 1}) · ${a.cost} energía · ${a.cd / 1000}s\n${a.desc}`;
      b.innerHTML = '<span class="k"></span><span class="ic"></span><span class="lb"></span><span class="cd"></span>';
      b.querySelector('.k').textContent = i + 1;
      b.querySelector('.ic').textContent = a.icon;
      b.querySelector('.lb').textContent = a.name;
      b.onclick = () => castSkill(a);
      bar.appendChild(b);
    });
    const sep = document.createElement('span'); sep.className = 'act-sep'; bar.appendChild(sep);
    for (const c of consList()) {
      const C = RULES.CONSUMABLES[c.id];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'act-btn cons';
      b.dataset.cons = c.id;
      b.title = `${C.name} (${c.key || ''})\n${C.desc}`;
      b.innerHTML = '<span class="k"></span><span class="ic"></span><span class="cnt"></span><span class="cd"></span>';
      b.querySelector('.k').textContent = c.key || '';
      b.querySelector('.ic').appendChild(consIcon(c.id));
      b.querySelector('.cnt').textContent = c.n;
      b.onclick = () => useCons(c.id);
      bar.appendChild(b);
    }
  }

  function consIcon(id) {
    const C = RULES.CONSUMABLES[id];
    const src = C.spell ? DSPRITES.scroll(C.color) : DSPRITES.potion(C.color);
    const c = document.createElement('canvas'); c.width = 32; c.height = 32;
    const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(src, 0, 0, 32, 32);
    return c;
  }

  function updateBar() {
    const y = game.you;
    if (!y) return;
    const now = serverNow();
    for (const b of document.querySelectorAll('#dactions .skill')) {
      const a = RULES.ABILITY_BY_ID[b.dataset.id];
      const left = (y.cds[b.dataset.id] || 0) - now;
      const cd = b.querySelector('.cd');
      cd.style.height = left > 0 ? Math.min(100, 100 * left / a.cd) + '%' : '0';
      b.classList.toggle('off', y.en < a.cost);
    }
    for (const b of document.querySelectorAll('#dactions .cons')) {
      const left = (y.cds['cons:' + b.dataset.cons] || 0) - now;
      b.querySelector('.cd').style.height = left > 0 ? Math.min(100, left / 15) + '%' : '0';
    }
    const atk = document.querySelector('#dactions .attack .cd');
    if (atk) { const left = y.nextAttack - now; atk.style.height = left > 0 ? Math.min(100, 100 * left / y.atkMs) + '%' : '0'; }
  }

  function hoverTarget() {
    const h = game.hover;
    if (!h) return {};
    const enemy = entAt(h.x, h.y, 'enemy');
    const hero = entAt(h.x, h.y, 'hero');
    return { enemy, hero, x: h.x, y: h.y };
  }

  function castSkill(a) {
    const h = hoverTarget();
    const msg = { t: 'dskill', id: a.id };
    if (a.kind === 'heal') { if (h.hero) msg.target = h.hero.id; }
    else if (h.enemy) msg.target = h.enemy.id;
    else if ((a.kind === 'blast' || a.kind === 'cone' || a.kind === 'line') && h.x !== undefined && game.mouseOnMap) { msg.x = h.x; msg.y = h.y; }
    DD.net.send(msg);
  }

  function useCons(id) {
    const h = hoverTarget();
    DD.net.send({ t: 'duse', cid: id, target: h.enemy ? h.enemy.id : undefined });
  }

  // ---------- Controles ----------
  const KEYDIR = { ArrowUp: [0, -1], w: [0, -1], ArrowDown: [0, 1], s: [0, 1], ArrowLeft: [-1, 0], a: [-1, 0], ArrowRight: [1, 0], d: [1, 0] };
  function sendDir() {
    let dx = 0, dy = 0;
    for (const k of game.keys) { const d = KEYDIR[k]; if (d) { dx += d[0]; dy += d[1]; } }
    dx = Math.sign(dx); dy = Math.sign(dy);
    const key = dx + ',' + dy;
    if (key === game.sentDir) return;
    game.sentDir = key;
    DD.net.send({ t: 'ddir', dx, dy });
  }
  window.addEventListener('keydown', (e) => {
    if (!game.active || DD.scene !== 'dungeon' || (document.activeElement && document.activeElement.tagName === 'INPUT')) return;
    if (document.querySelector('.overlay:not(.hidden)')) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (/^[1-8]$/.test(k)) { const a = abilities()[Number(k) - 1]; if (a) castSkill(a); return; }
    if (k === 'm') { game.showMap = !game.showMap; return; }
    if (k === 'i' || k === 'b') { DD.emit('open-char', 'equipo'); return; }
    if (k === 'c') { /* C: pergamino de sanación si lo hay, si no la ficha */ if (!(DD.me && DD.me.cons['perg-sanacion'])) { DD.emit('open-char', 'ficha'); return; } }
    const consKey = k.toUpperCase();
    const cons = consList().filter((c) => c.key === consKey);
    if (cons.length) { const pick = consKey === 'Q' && e.shiftKey ? cons[cons.length - 1] : cons[0]; useCons(pick.id); return; }
    if (k === 'Enter') { e.preventDefault(); $('#chat-input').focus(); return; }
    if (KEYDIR[k]) { e.preventDefault(); game.keys.add(k); sendDir(); }
  });
  window.addEventListener('keyup', (e) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (game.keys.delete(k) && game.active) sendDir();
  });
  window.addEventListener('blur', () => { game.keys.clear(); if (game.active) sendDir(); });

  function screenToTile(cx, cy) {
    const v = game.view;
    return { x: Math.floor((cx - v.ox) / (T * v.s)), y: Math.floor((cy - v.oy) / (T * v.s)) };
  }
  const entAt = (x, y, kind) => [...game.ents.values()].find((e) => e.kind === kind && e.x === x && e.y === y && (kind === 'hero' || game.vis[y * game.map.w + x]));

  let holding = null;
  function clickAt(cx, cy, repeat) {
    const { x, y } = screenToTile(cx, cy);
    const { w, h } = game.map;
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const enemy = entAt(x, y, 'enemy') || entAt(x, y + 1, 'enemy'); // los sprites altos sobresalen hacia arriba
    if (enemy && !repeat) { DD.net.send({ t: 'dattack', id: enemy.id }); game.marker = { x: enemy.x, y: enemy.y, at: performance.now(), enemy: true }; return 'attack'; }
    if (enemy && repeat) return;
    if (!game.seen[y * w + x]) return;
    DD.net.send({ t: 'dgo', x, y });
    if (!repeat) game.marker = { x, y, at: performance.now() };
    return 'go';
  }
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  cv.addEventListener('pointermove', (e) => { if (!game.active) return; game.hover = screenToTile(e.clientX, e.clientY); game.mouse = { x: e.clientX, y: e.clientY }; game.mouseOnMap = true; });
  cv.addEventListener('pointerleave', () => { game.mouseOnMap = false; });
  cv.addEventListener('pointerdown', (e) => {
    if (!game.active || e.button === 2) return;
    game.hover = screenToTile(e.clientX, e.clientY);
    const r = clickAt(e.clientX, e.clientY, false);
    // mantener pulsado sobre el suelo: el héroe sigue al ratón
    if (r === 'go') {
      clearInterval(holding);
      holding = setInterval(() => { if (game.mouse) clickAt(game.mouse.x, game.mouse.y, true); }, 220);
    }
  });
  window.addEventListener('pointerup', () => { clearInterval(holding); holding = null; });
  cv.addEventListener('pointermove', (e) => { if (holding) game.mouse = { x: e.clientX, y: e.clientY }; });

  // ======================================================================
  //  Dibujo
  // ======================================================================
  const world = document.createElement('canvas');
  const wg = world.getContext('2d');
  const dark = document.createElement('canvas');
  const dg = dark.getContext('2d');

  const theme = () => game.map.theme || 'cripta';
  const tileAt = (x, y) => { const m = game.map; return x < 0 || y < 0 || x >= m.w || y >= m.h ? '#' : m.tiles[y * m.w + x]; };
  const isWallCh = (ch) => ch === '#';

  // Capa estática: suelo, muros, sombras de ambiente y decorado plano (dos versiones para animar el agua)
  function buildStatics() {
    const m = game.map;
    const out = [];
    for (let frame = 0; frame < 2; frame++) {
      const c = document.createElement('canvas');
      c.width = m.w * T; c.height = m.h * T;
      const x = c.getContext('2d');
      x.imageSmoothingEnabled = false;
      for (let ty = 0; ty < m.h; ty++) for (let tx = 0; tx < m.w; tx++) {
        const ch = tileAt(tx, ty);
        const px = tx * T, py = ty * T;
        if (!DCH.has(ch)) { x.drawImage(SPRITES.worldTile(ch, tx, ty, frame), px, py); continue; }
        if (isWallCh(ch)) { x.drawImage(DSPRITES.wall(theme(), tx, ty, !isWallCh(tileAt(tx, ty + 1))), px, py); continue; }
        if (ch === '~' || ch === '%') { x.drawImage(DSPRITES.liquid(theme(), ch === '%' ? frame : frame), px, py); continue; }
        x.drawImage(DSPRITES.floor(theme(), tx, ty), px, py);
        if (ch === '+') x.drawImage(DSPRITES.door(theme()), px, py);
        if (ch === '^') x.drawImage(DSPRITES.spikes(0), px, py);
        // sombras junto a los muros (oclusión ambiental)
        x.fillStyle = 'rgba(0,0,0,.38)';
        if (isWallCh(tileAt(tx, ty - 1))) { x.fillRect(px, py, T, 4); x.fillStyle = 'rgba(0,0,0,.18)'; x.fillRect(px, py + 4, T, 3); x.fillStyle = 'rgba(0,0,0,.38)'; }
        if (isWallCh(tileAt(tx - 1, ty))) x.fillRect(px, py, 3, T);
        if (isWallCh(tileAt(tx + 1, ty))) x.fillRect(px + T - 3, py, 3, T);
      }
      // decorado plano y de pared que no se anima
      for (const pr of game.props) {
        if (DSPRITES.ANIMATED.has(pr.k)) continue;
        const sz = DSPRITES.PROP_SIZE[pr.k];
        if (sz && sz > 16) continue;
        if (['barrel', 'crate', 'table', 'altar', 'sarcophagus', 'coffin', 'eggs', 'campfire'].includes(pr.k)) continue;
        x.drawImage(DSPRITES.prop(pr.k, theme()), pr.x * T, pr.y * T);
      }
      out.push(c);
    }
    game.statics = out;
  }

  // Luces fijas del decorado
  const PROP_LIGHT = { torch: ['255,150,60', 3.6], brazier: ['255,140,50', 4.2], campfire: ['255,130,40', 4.4], candles: ['255,200,110', 2.2], altar: ['255,190,100', 2.2], mushrooms: ['90,255,200', 2.0], crystal: ['190,110,255', 3.2], lavarock: ['255,90,30', 1.6] };

  function renderGame(now, dt) {
    const map = game.map;
    if (!game.statics) buildStatics();
    // posiciones suaves (interpolación lineal a velocidad constante)
    for (const e of game.ents.values()) {
      const k = Math.min(1, (now - e.t0) / e.dur);
      e.rx = e.fx + (e.x - e.fx) * k; e.ry = e.fy + (e.y - e.fy) * k;
      e.moving = k < 1;
      if (e.moving) e.phase = (e.phase || 0) + dt * 8;
    }
    const v = game.view, s = v.s;
    const me = game.ents.get(DD.myId);
    const vwT = innerWidth / (T * s), vhT = innerHeight / (T * s);
    // cámara que sigue al héroe con suavidad
    const tx = me ? me.rx + 0.5 : map.w / 2, ty = me ? me.ry + 0.5 : map.h / 2;
    if (!game.camInit) { game.cam = { x: tx, y: ty }; game.camInit = !!me; }
    game.cam.x += (tx - game.cam.x) * Math.min(1, dt * 8); game.cam.y += (ty - game.cam.y) * Math.min(1, dt * 8);
    // el héroe queda en el centro de la zona libre (encima de la barra de acciones)
    const bottomUi = v.mobile ? 250 : 100;
    const centerY = (innerHeight - bottomUi) / 2 / (T * s);
    let vx0 = map.w <= vwT ? (map.w - vwT) / 2 : Math.max(0, Math.min(map.w - vwT, game.cam.x - vwT / 2));
    let vy0 = map.h <= vhT ? (map.h - vhT) / 2 : Math.max(-1, Math.min(map.h - vhT + bottomUi / (T * s), game.cam.y - centerY));
    let shake = 0;
    if (game.shake && game.shake > now) shake = (game.shake - now) / 260 * 2;
    const x0 = vx0 + (Math.random() - 0.5) * shake * 0.2, y0 = vy0 + (Math.random() - 0.5) * shake * 0.2;
    const tx0 = Math.max(0, Math.floor(x0)), ty0 = Math.max(0, Math.floor(y0));
    const tx1 = Math.min(map.w, Math.ceil(x0 + vwT) + 1), ty1 = Math.min(map.h, Math.ceil(y0 + vhT) + 2);
    const W = (tx1 - tx0) * T, H = (ty1 - ty0) * T;
    if (world.width !== W || world.height !== H) { world.width = W; world.height = H; }
    v.ox = (tx0 - x0) * T * s; v.oy = (ty0 - y0) * T * s;
    // ox/oy: posición en pantalla de la esquina de la casilla (0,0)
    v.ox -= tx0 * T * s; v.oy -= ty0 * T * s;

    wg.imageSmoothingEnabled = false;
    wg.setTransform(1, 0, 0, 1, -tx0 * T, -ty0 * T);
    wg.fillStyle = '#050307'; wg.fillRect(tx0 * T, ty0 * T, W, H);
    const frame = Math.floor(now / 450) % 2;
    wg.drawImage(game.statics[frame], tx0 * T, ty0 * T, W, H, tx0 * T, ty0 * T, W, H);
    const fr = Math.floor(now / 160) % 2;
    // trampas animadas
    for (let y = ty0; y < ty1; y++) for (let x = tx0; x < tx1; x++) if (tileAt(x, y) === '^' && game.vis[y * map.w + x]) wg.drawImage(DSPRITES.spikes(Math.floor(now / 700 + x) % 2), x * T, y * T);

    // avisos de los jefes: casillas que se llenan de rojo
    for (const t of game.teles) {
      const k = Math.min(1, (now - t.start) / t.dur);
      wg.fillStyle = t.kind === 'breath' ? `rgba(255,110,20,${0.15 + k * 0.35})` : t.kind === 'nova' ? `rgba(150,60,255,${0.15 + k * 0.35})` : `rgba(220,30,30,${0.15 + k * 0.35})`;
      for (const [x, y] of t.cells) wg.fillRect(x * T + 1, y * T + 1, T - 2, T - 2);
      wg.strokeStyle = 'rgba(255,220,180,.5)';
      for (const [x, y] of t.cells) wg.strokeRect(x * T + 1.5, y * T + 1.5, (T - 3) * k, (T - 3) * k);
    }

    // portal de salida
    if (game.portal) {
      const p = game.portal, a = now / 300;
      for (let i = 0; i < 3; i++) {
        wg.strokeStyle = ['#7ad0ff', '#c8f0ff', '#3a6aff'][i]; wg.lineWidth = 2;
        wg.beginPath(); wg.ellipse(p.x * T + 8, p.y * T + 8, 7 - i * 2 + Math.sin(a + i) , 4 - i, 0, 0, Math.PI * 2); wg.stroke();
      }
    }
    // marcador de destino
    if (game.marker && now - game.marker.at < 500) {
      const k = (now - game.marker.at) / 500;
      wg.strokeStyle = game.marker.enemy ? `rgba(255,80,60,${1 - k})` : `rgba(255,230,150,${1 - k})`; wg.lineWidth = 1;
      wg.beginPath(); wg.ellipse(game.marker.x * T + 8, game.marker.y * T + 12, 6 + k * 3, 3 + k * 1.5, 0, 0, Math.PI * 2); wg.stroke();
    }
    // botín en el suelo, con su brillo de rareza
    for (const l of game.loot) {
      if (!game.seen[l.y * map.w + l.x]) continue;
      const bob = Math.round(Math.sin(now / 300 + l.x * 3) * 1.5);
      if (l.r) {
        const col = DSPRITES.RARITY[l.r];
        const gr = wg.createLinearGradient(0, l.y * T - 18, 0, l.y * T + 12);
        gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, col + (l.r === 'comun' ? '44' : '99'));
        wg.fillStyle = gr; wg.fillRect(l.x * T + 5, l.y * T - 18, 6, 30);
        wg.drawImage(DSPRITES.itemIcon({ slot: l.slot, base: guessBase(l), rarity: l.r }), l.x * T, l.y * T + bob - 2);
      } else if (l.gold) wg.drawImage(DSPRITES.goldPile(), l.x * T, l.y * T + bob);
      else if (l.cons) wg.drawImage(DSPRITES.potion(RULES.CONSUMABLES[l.cons].color), l.x * T, l.y * T + bob);
    }

    // decorado alto, cofres y personajes, ordenados por profundidad
    const drawables = [];
    for (const pr of game.props) {
      if (pr.x < tx0 - 1 || pr.x > tx1 || pr.y < ty0 - 1 || pr.y > ty1 + 2 || !game.seen[pr.y * map.w + pr.x]) continue;
      const sz = DSPRITES.PROP_SIZE[pr.k] || 16;
      const wallProp = isWallCh(tileAt(pr.x, pr.y));
      if (wallProp && !DSPRITES.ANIMATED.has(pr.k)) continue;
      const flat = !wallProp && sz <= 16 && !DSPRITES.ANIMATED.has(pr.k) && !['barrel', 'crate', 'table', 'altar', 'sarcophagus', 'coffin', 'eggs', 'campfire'].includes(pr.k);
      if (flat) continue;
      drawables.push({ y: pr.y + (wallProp ? -0.5 : 0.3), draw: () => wg.drawImage(DSPRITES.prop(pr.k, theme(), DSPRITES.ANIMATED.has(pr.k) ? fr : 0), pr.x * T, pr.y * T + T - sz) });
    }
    for (const c of game.chests) {
      if (!game.seen[c.y * map.w + c.x]) continue;
      drawables.push({ y: c.y + 0.3, draw: () => wg.drawImage(SPRITES.overlayTile(c.open ? 'chestopen' : 'chest'), c.x * T, c.y * T) });
    }
    for (const e of game.ents.values()) {
      if (e.kind === 'enemy' && !game.vis[e.y * map.w + e.x]) continue;
      drawables.push({ y: e.ry + 0.5, draw: () => drawEntity(e, now) });
    }
    drawables.sort((a, b) => a.y - b.y);
    for (const d of drawables) d.draw();

    // proyectiles de los enemigos (se ven venir y se pueden esquivar)
    for (let i = game.projs.length - 1; i >= 0; i--) {
      const pr = game.projs[i];
      const k = (now - pr.start) / pr.dur;
      if (k >= 1) { game.projs.splice(i, 1); continue; }
      const x = (pr.from.x + (pr.to.x - pr.from.x) * k) * T + 8, y = (pr.from.y + (pr.to.y - pr.from.y) * k) * T + 6 - Math.sin(k * Math.PI) * (pr.kind === 'arrow' || pr.kind === 'javelin' ? 5 : 0);
      const ang = Math.atan2(pr.to.y - pr.from.y, pr.to.x - pr.from.x);
      const col = PROJ_COL[pr.kind] || '#fff';
      if (pr.kind === 'arrow' || pr.kind === 'javelin') {
        wg.strokeStyle = col; wg.lineWidth = pr.kind === 'javelin' ? 2 : 1;
        wg.beginPath(); wg.moveTo(x - Math.cos(ang) * 5, y - Math.sin(ang) * 5); wg.lineTo(x + Math.cos(ang) * 3, y + Math.sin(ang) * 3); wg.stroke();
      } else {
        wg.fillStyle = col; wg.beginPath(); wg.arc(x, y, 2.5, 0, Math.PI * 2); wg.fill();
        if (Math.random() < 0.5) spark(x / T, y / T, col, true);
      }
      // dónde va a caer
      wg.strokeStyle = 'rgba(255,60,60,.5)'; wg.lineWidth = 1; wg.strokeRect(pr.to.x * T + 3, pr.to.y * T + 3, T - 6, T - 6);
    }

    // efectos de habilidades
    for (let i = game.fx.length - 1; i >= 0; i--) {
      const f = game.fx[i];
      if (now < f.start) continue;
      const k = (now - f.start) / f.dur;
      if (k >= 1) { game.fx.splice(i, 1); continue; }
      wg.globalAlpha = 1 - k;
      const col = f.color || '#ffffff';
      if (f.kind === 'bolt' || f.kind === 'arrow') {
        const px = f.from.x + (f.to.x - f.from.x) * Math.min(1, k * 1.6), py = f.from.y + (f.to.y - f.from.y) * Math.min(1, k * 1.6);
        wg.strokeStyle = f.kind === 'arrow' ? '#e8dcc0' : col; wg.lineWidth = f.kind === 'arrow' ? 1 : 2;
        wg.beginPath(); wg.moveTo(f.from.x * T + 8 + (px - f.from.x) * T * 0.6, f.from.y * T + 6 + (py - f.from.y) * T * 0.6); wg.lineTo(px * T + 8, py * T + 6); wg.stroke();
        if (f.kind === 'bolt') { wg.fillStyle = col; wg.beginPath(); wg.arc(px * T + 8, py * T + 6, 2.5, 0, Math.PI * 2); wg.fill(); }
      } else if (f.kind === 'blast' || f.kind === 'nova') {
        const r = ((f.radius || 1) + 0.5) * T * (0.4 + k * 0.6);
        const gr = wg.createRadialGradient(f.x * T + 8, f.y * T + 8, 0, f.x * T + 8, f.y * T + 8, r);
        gr.addColorStop(0, col); gr.addColorStop(0.6, col + '88'); gr.addColorStop(1, col + '00');
        wg.fillStyle = gr; wg.beginPath(); wg.arc(f.x * T + 8, f.y * T + 8, r, 0, Math.PI * 2); wg.fill();
        if (k < 0.1) for (let j = 0; j < 6; j++) spark(f.x + 0.5 + (Math.random() - 0.5) * f.radius * 2, f.y + 0.5 + (Math.random() - 0.5) * f.radius * 2, col, true);
      } else if (f.kind === 'heal') {
        for (let j = 0; j < 3; j++) { wg.fillStyle = '#7dff8a'; wg.fillRect(f.x * T + 3 + j * 4, f.y * T + 10 - k * 14 - j * 2, 2, 2); }
      } else if (f.kind === 'mark') {
        wg.strokeStyle = col; wg.lineWidth = 1; wg.beginPath(); wg.arc(f.x * T + 8, f.y * T + 4, 6 * (1 - k * 0.3), 0, Math.PI * 2); wg.stroke();
      } else if (f.kind === 'dash' || f.kind === 'blink') {
        wg.strokeStyle = f.kind === 'blink' ? '#a05aff' : '#ffffff'; wg.lineWidth = 3;
        wg.beginPath(); wg.moveTo(f.from.x * T + 8, f.from.y * T + 8); wg.lineTo(f.to.x * T + 8, f.to.y * T + 8); wg.stroke();
      } else if (f.kind === 'buff' || f.kind === 'portal') {
        wg.strokeStyle = col; wg.lineWidth = 1; wg.beginPath(); wg.ellipse(f.x * T + 8, f.y * T + 12, 8 * k + 2, 4 * k + 1, 0, 0, Math.PI * 2); wg.stroke();
      }
      wg.globalAlpha = 1;
    }
    // auras (espíritus guardianes)
    for (let i = game.auras.length - 1; i >= 0; i--) {
      const a = game.auras[i];
      if (now > a.until) { game.auras.splice(i, 1); continue; }
      const e = game.ents.get(a.id);
      if (!e) continue;
      for (let j = 0; j < 3; j++) {
        const ang = now / 400 + j * 2.1, r = (a.radius + 0.3) * T;
        wg.fillStyle = 'rgba(255,240,170,.8)'; wg.fillRect(e.rx * T + 8 + Math.cos(ang) * r, e.ry * T + 6 + Math.sin(ang) * r * 0.6, 3, 3);
      }
    }
    // partículas
    for (let i = game.particles.length - 1; i >= 0; i--) {
      const p = game.particles[i];
      p.life += dt;
      if (p.life >= p.max) { game.particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 4 * dt;
      wg.globalAlpha = 1 - p.life / p.max;
      wg.fillStyle = p.color; wg.fillRect(Math.round(p.x * T), Math.round(p.y * T), 1, 1);
      wg.globalAlpha = 1;
    }
    // ascuas que suben de las antorchas y braseros
    if (Math.random() < 0.3) {
      const lit = game.props.filter((pr) => (pr.k === 'torch' || pr.k === 'brazier' || pr.k === 'campfire') && game.vis[pr.y * map.w + pr.x] !== undefined && pr.x >= tx0 && pr.x < tx1 && pr.y >= ty0 && pr.y < ty1);
      const pr = lit[Math.floor(Math.random() * lit.length)];
      if (pr) game.particles.push({ x: pr.x + 0.4 + Math.random() * 0.2, y: pr.y + 0.2, vx: (Math.random() - 0.5) * 0.4, vy: -1 - Math.random(), life: 0, max: 1 + Math.random(), color: Math.random() < 0.5 ? '#ffb03a' : '#ff6a1a' });
    }

    drawLighting(now, tx0, ty0, tx1, ty1, W, H);

    // a pantalla
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#030204'; g.fillRect(0, 0, cv.width, cv.height);
    g.imageSmoothingEnabled = false;
    g.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    g.drawImage(world, Math.round(v.ox + tx0 * T * s), Math.round(v.oy + ty0 * T * s), W * s, H * s);
    // viñeta y destello rojo al recibir daño
    const vg = g.createRadialGradient(innerWidth / 2, innerHeight / 2, Math.min(innerWidth, innerHeight) * 0.35, innerWidth / 2, innerHeight / 2, Math.max(innerWidth, innerHeight) * 0.75);
    const hurt = Math.max(0, 1 - (now - game.lastHurt) / 400);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, hurt ? `rgba(120,0,0,${0.35 + hurt * 0.3})` : 'rgba(0,0,0,.55)');
    g.fillStyle = vg; g.fillRect(0, 0, innerWidth, innerHeight);
    if (game.you && game.you.hp / game.you.maxHp < 0.3) { g.fillStyle = `rgba(150,0,0,${0.08 + Math.sin(now / 200) * 0.05})`; g.fillRect(0, 0, innerWidth, innerHeight); }

    drawOverlay(now);
    if (game.showMap) drawMinimap();
    updateBar();
  }

  // Tipo de objeto aproximado para el icono del suelo (el servidor sólo manda pieza y rareza)
  function guessBase(l) {
    const n = (l.name || '').toLowerCase();
    if (l.slot === 'arma') { for (const [b, W] of Object.entries(RULES.WEAPONS)) if (n.startsWith(W.name.toLowerCase())) return b; return 'espada'; }
    if (l.slot === 'mano') return n.startsWith('orbe') || n.startsWith('esfera') ? 'orbe' : 'escudo';
    if (l.slot === 'amuleto' || l.slot === 'anillo') return l.slot;
    return null;
  }

  function drawEntity(e, now) {
    const frame = e.moving ? 1 + (Math.floor(e.phase) % 2) : 0;
    const hit = e.hitUntil > now;
    let lx = 0, ly = 0;
    if (now - e.lunge < 150) { const f = Math.sin((now - e.lunge) / 150 * Math.PI) * 3; lx = e.lungeDx * f; ly = e.lungeDy * f; }
    const px = e.rx * T + T / 2 + lx, base = e.ry * T + T + 1 + ly;
    const M = e.kind === 'enemy' ? RULES.MONSTERS[e.k] || {} : {};
    const scale = e.kind === 'hero' ? ((MAP.SPECIES[e.look.species] || {}).scale || 1) : (M.scale || 1);
    // sombra
    wg.fillStyle = 'rgba(0,0,0,.45)';
    wg.beginPath(); wg.ellipse(px, base - 1, 6 * scale, 2.5 * scale, 0, 0, Math.PI * 2); wg.fill();
    // anillo bajo élites y jefes
    if (e.elite || e.boss) { wg.strokeStyle = e.boss ? 'rgba(255,60,40,.8)' : 'rgba(255,200,60,.8)'; wg.lineWidth = 1; wg.beginPath(); wg.ellipse(px, base - 1, 8 * scale, 3.5 * scale, 0, 0, Math.PI * 2); wg.stroke(); }
    if (e.id === game.selectedId) { wg.strokeStyle = 'rgba(255,90,60,.9)'; wg.beginPath(); wg.ellipse(px, base - 1, 7 * scale, 3 * scale, 0, 0, Math.PI * 2); wg.stroke(); }
    let spr;
    if (e.kind === 'hero') {
      spr = SPRITES.hero(e.look, { back: e.dir === 'N', frame });
      if (e.buffs && e.buffs.length) { wg.fillStyle = 'rgba(255,200,80,.18)'; wg.beginPath(); wg.arc(px, base - 12, 11, 0, Math.PI * 2); wg.fill(); }
    } else if ((M.sprite || '').startsWith('hero:')) {
      spr = SPRITES.hero({ cls: M.sprite.slice(5), species: 'human', skin: 2, hair: 0 }, { frame, back: e.dir === 'N' });
    } else {
      spr = SPRITES.enemy(M.sprite || 'goblin', { frame, hit, tint: M.tint, weapon: M.weapon });
    }
    if (hit && e.kind === 'hero') spr = tint(spr, 'rgba(255,60,60,.6)');
    if (hit && (M.sprite || '').startsWith('hero:')) spr = tint(spr, 'rgba(255,255,255,.7)');
    const w = spr.width * scale, h = spr.height * scale;
    wg.save();
    wg.translate(Math.round(px), Math.round(base));
    if ((e.face || 1) < 0) wg.scale(-1, 1);
    if (e.stun) wg.globalAlpha = 0.85;
    wg.drawImage(spr, -Math.round(w / 2), -h, w, h);
    wg.restore();
    if (e.stun) { wg.fillStyle = '#ffe680'; for (let i = 0; i < 3; i++) { const a = now / 200 + i * 2.1; wg.fillRect(px + Math.cos(a) * 5, base - h - 2 + Math.sin(a) * 2, 1, 1); } }
    e._top = base - h;
  }

  const tintCache = new WeakMap();
  function tint(spr, color) {
    let t = tintCache.get(spr);
    if (!t) {
      t = document.createElement('canvas'); t.width = spr.width; t.height = spr.height;
      const tg = t.getContext('2d');
      tg.drawImage(spr, 0, 0);
      tg.globalCompositeOperation = 'source-atop'; tg.fillStyle = color; tg.fillRect(0, 0, t.width, t.height);
      tintCache.set(spr, t);
    }
    return t;
  }

  // Iluminación: oscuridad con huecos de luz (héroes, antorchas, braseros, conjuros) y brillo de color encima
  function drawLighting(now, tx0, ty0, tx1, ty1, W, H) {
    const map = game.map;
    const isWorld = map.kind === 'world';
    if (dark.width !== W || dark.height !== H) { dark.width = W; dark.height = H; }
    dg.setTransform(1, 0, 0, 1, -tx0 * T, -ty0 * T);
    dg.globalCompositeOperation = 'source-over';
    dg.clearRect(tx0 * T, ty0 * T, W, H);
    dg.fillStyle = isWorld ? 'rgba(4,6,18,.55)' : 'rgba(3,2,6,.84)';
    dg.fillRect(tx0 * T, ty0 * T, W, H);
    dg.globalCompositeOperation = 'destination-out';
    const lights = [];
    const flick = (seed) => 0.92 + Math.sin(now / 110 + seed) * 0.05 + Math.sin(now / 37 + seed * 2) * 0.03;
    for (const e of game.ents.values()) if (e.kind === 'hero') lights.push({ x: e.rx + 0.5, y: e.ry + 0.4, r: (isWorld ? 8 : 6.5) * flick(1), c: '255,190,120', a: 0.22 });
    for (const pr of game.props) {
      const L = PROP_LIGHT[pr.k];
      if (!L || pr.x < tx0 - 5 || pr.x > tx1 + 5 || pr.y < ty0 - 5 || pr.y > ty1 + 5 || !game.seen[Math.max(0, pr.y) * map.w + pr.x]) continue;
      const wallProp = isWallCh(tileAt(pr.x, pr.y));
      lights.push({ x: pr.x + 0.5, y: pr.y + (wallProp ? 1.1 : 0.5), r: L[1] * flick(pr.x * 3 + pr.y), c: L[0], a: 0.3 });
    }
    if (isWorld) for (let y = ty0; y < ty1; y++) for (let x = tx0; x < tx1; x++) { const ch = map.tiles[y * map.w + x]; if (ch === 'F' || ch === 'H') lights.push({ x: x + 0.5, y: y + 0.5, r: 3.5 * flick(x + y), c: '255,150,60', a: 0.3 }); }
    for (let y = ty0; y < ty1; y++) for (let x = tx0; x < tx1; x++) if (map.tiles[y * map.w + x] === '%' && game.seen[y * map.w + x]) lights.push({ x: x + 0.5, y: y + 0.5, r: 1.8, c: '255,90,20', a: 0.25 });
    if (game.portal) lights.push({ x: game.portal.x + 0.5, y: game.portal.y + 0.5, r: 3.2, c: '120,200,255', a: 0.35 });
    for (const pr of game.projs) { const k = (now - pr.start) / pr.dur; lights.push({ x: pr.from.x + (pr.to.x - pr.from.x) * k + 0.5, y: pr.from.y + (pr.to.y - pr.from.y) * k + 0.5, r: 1.5, c: '255,220,180', a: 0.2 }); }
    for (const f of game.fx) if ((f.kind === 'blast' || f.kind === 'nova') && now >= f.start) lights.push({ x: f.x + 0.5, y: f.y + 0.5, r: (f.radius + 2) * (1 - (now - f.start) / f.dur), c: hexRgb(f.color || '#ffffff'), a: 0.45 });
    for (const t of game.teles) for (const [x, y] of t.cells.slice(0, 40)) lights.push({ x: x + 0.5, y: y + 0.5, r: 0.9, c: t.kind === 'breath' ? '255,110,20' : '255,40,40', a: 0.15 });
    for (const L of lights) {
      const x = L.x * T, y = L.y * T, r = L.r * T;
      const gr = dg.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.5, 'rgba(0,0,0,.75)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      dg.fillStyle = gr; dg.beginPath(); dg.arc(x, y, r, 0, Math.PI * 2); dg.fill();
    }
    // niebla: lo nunca visto, negro; lo visto pero fuera de la vista, en penumbra
    dg.globalCompositeOperation = 'source-over';
    for (let y = ty0; y < ty1; y++) for (let x = tx0; x < tx1; x++) {
      const i = y * map.w + x;
      if (!game.seen[i]) { dg.fillStyle = '#030204'; dg.fillRect(x * T, y * T, T, T); }
      else if (!game.vis[i]) { dg.fillStyle = 'rgba(3,2,6,.55)'; dg.fillRect(x * T, y * T, T, T); }
    }
    wg.setTransform(1, 0, 0, 1, 0, 0);
    wg.drawImage(dark, 0, 0);
    // brillo cálido o de color sobre todo
    wg.setTransform(1, 0, 0, 1, -tx0 * T, -ty0 * T);
    wg.globalCompositeOperation = 'lighter';
    for (const L of lights) {
      if (!L.c) continue;
      const x = L.x * T, y = L.y * T, r = L.r * T * 0.8;
      const gr = wg.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(${L.c},${L.a})`); gr.addColorStop(1, `rgba(${L.c},0)`);
      wg.fillStyle = gr; wg.beginPath(); wg.arc(x, y, r, 0, Math.PI * 2); wg.fill();
    }
    wg.globalCompositeOperation = 'source-over';
  }
  const hexRgb = (h) => { const n = parseInt(h.slice(1, 7), 16); return `${n >> 16},${(n >> 8) & 255},${n & 255}`; };

  // Nombres, barras de vida, números flotantes y bocadillos (en píxeles de pantalla)
  function drawOverlay(now) {
    const v = game.view, s = v.s, map = game.map;
    const sx = (x) => v.ox + (x * T + T / 2) * s, sy = (y) => v.oy + (y * T) * s;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (map.kind === 'world') {
      g.font = '600 13px "Pixelify Sans", sans-serif';
      for (const l of map.labels || []) {
        if (!game.seen[Math.max(0, Math.min(map.h - 1, l.y + 2)) * map.w + l.x] && !game.seen[l.y * map.w + l.x]) continue;
        g.lineWidth = 3; g.strokeStyle = '#000'; g.strokeText(l.text, sx(l.x), sy(l.y)); g.fillStyle = '#f2d36b'; g.fillText(l.text, sx(l.x), sy(l.y));
      }
    }
    const hov = game.hover;
    for (const e of game.ents.values()) {
      if (e.kind === 'enemy' && !game.vis[e.y * map.w + e.x]) continue;
      const x = sx(e.rx), top = v.oy + (e._top || e.ry * T - 16) * s - 6;
      const bw = (e.boss ? 22 : 14) * s;
      const hovered = hov && hov.x === e.x && (hov.y === e.y || hov.y === e.y - 1);
      if (e.kind === 'enemy') {
        if (e.hp < e.maxHp || hovered || e.elite) {
          g.fillStyle = '#120a08'; g.fillRect(x - bw / 2 - 1, top - 1, bw + 2, 2 * s + 2);
          g.fillStyle = e.elite ? '#e8a030' : '#c8302a'; g.fillRect(x - bw / 2, top, bw * Math.max(0, e.hp / e.maxHp), 2 * s);
        }
        if (hovered) {
          g.font = '600 12px "Pixelify Sans", sans-serif';
          const label = `${monName(e)} · nv ${e.lvl}`;
          g.lineWidth = 3; g.strokeStyle = '#000'; g.strokeText(label, x, top - 10); g.fillStyle = e.elite ? '#ffd080' : '#ffc8b0'; g.fillText(label, x, top - 10);
        }
        if (e.mark) { g.fillStyle = '#ff4a4a'; g.font = '12px serif'; g.fillText('🎯', x + bw / 2 + 8, top); }
      } else {
        g.font = `600 ${Math.max(10, 4 * s)}px "Pixelify Sans", sans-serif`;
        const isMe = e.id === DD.myId;
        g.lineWidth = 3; g.strokeStyle = '#000'; g.strokeText(e.name, x, top - 8);
        g.fillStyle = isMe ? '#ffe9a8' : '#f4ead2'; g.fillText(e.name, x, top - 8);
        if (!isMe) {
          g.fillStyle = '#120a08'; g.fillRect(x - bw / 2 - 1, top - 1, bw + 2, 2 * s + 2);
          g.fillStyle = '#4cc85c'; g.fillRect(x - bw / 2, top, bw * Math.max(0, e.hp / e.maxHp), 2 * s);
        }
        const b = game.bubbles.get(e.id);
        if (b && b.until > now) drawBubble(x, top - 20, b.text);
      }
    }
    // nombre del objeto del suelo bajo el ratón
    if (hov) {
      const l = game.loot.find((q) => q.x === hov.x && q.y === hov.y && q.name);
      if (l) {
        g.font = '600 13px "Pixelify Sans", sans-serif';
        const x = sx(l.x), y = sy(l.y) - 6;
        const w = g.measureText(l.name).width + 12;
        g.fillStyle = 'rgba(10,6,8,.85)'; g.fillRect(x - w / 2, y - 10, w, 18);
        g.strokeStyle = DSPRITES.RARITY[l.r]; g.lineWidth = 1; g.strokeRect(x - w / 2 + 0.5, y - 9.5, w - 1, 17);
        g.fillStyle = DSPRITES.RARITY[l.r]; g.fillText(l.name, x, y);
      }
    }
    for (let i = game.floaters.length - 1; i >= 0; i--) {
      const f = game.floaters[i];
      const life = (now - f.start) / 1100;
      if (life >= 1 || !f.text) { game.floaters.splice(i, 1); continue; }
      g.font = `700 ${f.big ? Math.max(16, 6 * s) : Math.max(13, 5 * s)}px "Pixelify Sans", sans-serif`;
      g.globalAlpha = 1 - Math.max(0, life - 0.6) / 0.4;
      const x = sx(f.x) + (f.text.length % 3 - 1) * 6, y = sy(f.y) - (18 + life * 14) * s / 2 - 10;
      g.lineWidth = 4; g.strokeStyle = '#120604'; g.strokeText(f.text, x, y);
      g.fillStyle = f.color; g.fillText(f.text, x, y);
      g.globalAlpha = 1;
    }
  }

  function drawBubble(x, y, text) {
    g.font = '16px "VT323", monospace';
    const t = text.length > 40 ? text.slice(0, 39) + '…' : text;
    const w = g.measureText(t).width + 14;
    g.fillStyle = '#fbf3dc'; g.strokeStyle = '#24140a'; g.lineWidth = 2;
    g.beginPath(); g.roundRect(x - w / 2, y - 22, w, 20, 5); g.fill(); g.stroke();
    g.fillStyle = '#2a1a10'; g.fillText(t, x, y - 12);
  }

  // Minimapa (sólo lo explorado)
  const MINI = { ',': '#2f4a2a', ';': '#3a5a32', T: '#1a3018', P: '#16281e', w: '#14284a', v: '#24426a', s: '#7a6a4a', h: '#4a6a3a', M: '#5a5a62', '=': '#8a6a3a', b: '#8a6a3a', g: '#3a3430', t: '#6a6a72', R: '#7a7a7e', F: '#ff7a2a', C: '#000000', H: '#ffcf6a', k: '#8a5a3a', D: '#b83a2a', '#': '#1a1618', '.': '#6a6058', '+': '#8a5a2a', '^': '#a04040', '~': '#24427a', '%': '#c8400a' };
  function drawMinimap() {
    const map = game.map;
    const k = game.view.mobile ? 1.6 : map.kind === 'world' ? 2.4 : 3.2;
    const mw = map.w * k, mh = map.h * k;
    const x0 = innerWidth - mw - 14, y0 = game.view.mobile ? 110 : 14;
    const seenCount = game.seen.reduce((a, b) => a + b, 0);
    if (!game.miniImg || game.miniSeen !== seenCount) {
      const c = game.miniImg || document.createElement('canvas');
      c.width = map.w; c.height = map.h;
      const mg = c.getContext('2d');
      mg.clearRect(0, 0, map.w, map.h);
      for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) if (game.seen[y * map.w + x]) { mg.fillStyle = MINI[map.tiles[y * map.w + x]] || '#333'; mg.fillRect(x, y, 1, 1); }
      game.miniImg = c; game.miniSeen = seenCount;
    }
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(x0 - 4, y0 - 4, mw + 8, mh + 8);
    g.imageSmoothingEnabled = false;
    g.drawImage(game.miniImg, x0, y0, mw, mh);
    g.strokeStyle = '#6a4a2a'; g.lineWidth = 2; g.strokeRect(x0 - 3, y0 - 3, mw + 6, mh + 6);
    for (const e of game.ents.values()) {
      if (e.kind === 'enemy' && !game.vis[e.y * map.w + e.x]) continue;
      g.fillStyle = e.kind === 'hero' ? (e.id === DD.myId ? '#ffe9a8' : '#7ad0ff') : e.boss ? '#ff3a2a' : '#c84a3a';
      const sz = e.kind === 'hero' || e.boss ? 4 : 2;
      g.fillRect(x0 + e.x * k - sz / 2, y0 + e.y * k - sz / 2, sz, sz);
    }
    if (game.portal) { g.fillStyle = '#7ad0ff'; g.fillRect(x0 + game.portal.x * k - 2, y0 + game.portal.y * k - 2, 5, 5); }
  }

  // ======================================================================
  //  Bucle
  // ======================================================================
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (DD.scene === 'dungeon' && game.active && game.map) renderGame(now, dt);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // Pruebas automáticas: casilla del mapa a coordenadas de ventana
  window.__dTileToScreen = (x, y) => ({ x: game.view.ox + (x + 0.5) * T * game.view.s, y: game.view.oy + (y + 0.5) * T * game.view.s });
})();
