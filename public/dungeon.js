/* global DD, DUNGEON, DSPRITES, RULES, PROG, THREE, MODELS, VIEW3D */
// Mazmorras y mundo abierto: menú (crear con nivel y tema o unirse a una partida), partida en tiempo real
// con movimiento suave, habilidades, pociones, proyectiles esquivables, avisos de los jefes, luces y botín.
(() => {
  'use strict';

  const T = 16; // píxeles por casilla
  const $ = (s) => document.querySelector(s);
  const DCH = new Set(DUNGEON.DUNGEON_CHARS.split(''));
  const monName = (e) => (e.kind === 'hero' ? e.name : (e.elite ? 'Élite: ' : '') + ((RULES.MONSTERS[e.k] || {}).name || e.k));
  const WATER_T = new Set(['w', 'v', 'q', '~']);

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
  { const b = document.createElement('button'); b.className = 'btn alt big'; b.type = 'button'; b.id = 'ddescent'; b.textContent = '🌀 DESCENSO INFINITO'; b.onclick = () => { menuEl.classList.add('hidden'); DD.emit('open-descent'); }; $('#dgo').after(b); }

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
    dying: new Map(), herbs: [], hitstop: 0, joyDir: null, fps: { n: 0, t: 0, v: 0 },
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
    for (const pt of m.pets || []) upsert(pt.id, pt, 'pet', now);
    for (const e of game.ents.values()) if (e.static) e.alive = true;
    for (const ev of m.events || []) onEvent(ev, now);
    for (const [id, e] of game.ents) if (!e.alive) game.ents.delete(id);
    game.chests = m.chests; game.loot = m.loot; game.portal = m.portal; game.start = m.start; game.herbs = m.herbs || [];
    // jefe a la vista (en la arena, el rival)
    const boss = game.map && game.map.kind === 'arena'
      ? [...game.ents.values()].find((e) => e.kind === 'hero' && e.id !== DD.myId)
      : [...game.ents.values()].find((e) => e.kind === 'enemy' && e.boss && game.vis && game.vis[e.y * game.map.w + e.x]);
    game.boss = boss || null;
    updateHud();
  }

  // Visión: lo que ven los héroes (línea de visión) se ilumina; lo explorado queda en penumbra
  const OPAQUE = new Set(['#', 'T', 'P', 'M', 'R', 'k', 'y', 'p']);
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
            const col = t.kind === 'hero' && t.id === me ? '#ff5a5a' : ev.crit ? '#ffd23f' : ev.kind === 'dot' ? '#b08aff' : ev.kind === 'pet' ? '#ffd8a0' : '#ffffff';
            game.floaters.push({ x: t.x, y: t.y, text: String(ev.dmg) + (ev.block ? ' 🛡' : ''), color: col, big: ev.t === me || ev.crit, crit: !!ev.crit, start: now });
            for (let i = 0; i < (ev.crit ? 14 : 5); i++) spark(t.x + 0.5, t.y + 0.3, t.kind === 'hero' ? '#c83a3a' : (RULES.MONSTERS[t.k] || {}).undead ? '#d8d0b8' : '#9a1a1a');
            if (ev.crit) { ring(t.rx ?? t.x, t.ry ?? t.y, '#ffd23f'); if (ev.by === me) { game.hitstop = now + 75; if (!DD.gfx || DD.gfx.shake) game.shake = now + 200; } }
            if (ev.t === me) { game.lastHurt = now; DD.blip(150, 0.06); if (ev.dmg > (game.you ? game.you.maxHp * 0.15 : 99) && (!DD.gfx || DD.gfx.shake)) game.shake = now + 220; }
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
        if (by) { by.castAt = now; for (let i = 0; i < 8; i++) spark(by.x + 0.5, by.y + 0.2, '#fff2a0', true); }
        log(`${who(ev.by)} usa ${ev.name}`, ev.by === me ? 'mine' : '');
        DD.blip(700, 0.06);
        break;
      }
      case 'fx': if (ev.kind === 'splash') { splash(ev.x, ev.y, 14); break; } game.fx.push({ ...ev, start: now + (ev.delay || 0), dur: ev.kind === 'aura' ? ev.until : ev.kind === 'blast' || ev.kind === 'nova' ? 420 : 260 }); if (ev.kind === 'aura') game.auras.push({ id: ev.id, until: now + ev.until, radius: ev.radius }); break;
      case 'die': {
        game.dying.set(ev.id, now);
        for (let i = 0; i < (ev.boss ? 60 : 14); i++) spark(ev.x + 0.5, ev.y + 0.4, (RULES.MONSTERS[ev.k] || {}).undead ? '#d8d0b8' : ev.boss ? (i % 2 ? '#ffd23f' : '#ff6a2a') : '#8a1a1a', ev.boss);
        puff(ev.x + 0.5, ev.y + 0.5, '#6a5a4a', ev.boss ? 20 : 6, 0.5);
        if (ev.boss && (!DD.gfx || DD.gfx.shake)) game.shake = now + 500;
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
        if (ev.mat) { const M = PROG.MATS[ev.mat]; float(ev.x, ev.y, `+${ev.n} ${M.icon}`, ev.mat === 'polvo' ? '#ffe27a' : ev.mat === 'esencia' ? '#7ad0ff' : '#c8c8d0', ev.id === me); }
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
      case 'petdown': log(`${ev.name} huye malherido; volverá en 30 s.`, 'hurt'); break;
      case 'petskill': { const pt = game.ents.get(ev.id); if (pt) { float(pt.x, pt.y, ev.name + '!', '#ffb040', ev.owner === me); for (let i = 0; i < 10; i++) spark(pt.x + 0.5, pt.y + 0.4, '#ffb040', true); } break; }
      case 'roll': { const e = game.ents.get(ev.id); if (e) { e.rollAt = now; puff(ev.from.x + 0.5, ev.from.y + 0.5, dustColor(ev.from.x, ev.from.y), 6, 0.6); } if (ev.id === me) DD.blip(300, 0.04); break; }
      case 'fish': { const e = game.ents.get(ev.id); if (e) e.fishAt = { x: ev.x, y: ev.y }; splash(ev.x, ev.y, 4); break; }
      case 'bite': { const e = game.ents.get(ev.id); if (e && e.fishAt) splash(e.fishAt.x, e.fishAt.y, 10); break; }
      case 'fishend': { const e = game.ents.get(ev.id); if (e) e.fishAt = null; if (ev.id === me) $('#dbite').classList.add('hidden'); break; }
      case 'worldboss': {
        log(`🌋 ¡${ev.name} ha aparecido!`, 'hurt big');
        banner(`🌋 ${ev.name}`, '¡Un jefe de mundo ha aparecido! Únete a la batalla.');
        DD.blip(80, 0.5); setTimeout(() => DD.blip(60, 0.5), 300);
        break;
      }
      case 'join': if (ev.id !== me) log(`${who(ev.id)} entra.`); break;
    }
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
    const dsc = m.dungeon.descent;
    const MOD = dsc && PROG.WEEKLY_MODS[dsc.mod];
    $('#dname').textContent = m.dungeon.kind === 'world' ? m.dungeon.name : m.dungeon.kind === 'arena' ? `🤺 ${m.dungeon.name}${m.dungeon.duel && m.dungeon.duel.bet ? ` · ${m.dungeon.duel.bet * 2} 🪙 en juego` : ''}` : dsc ? `🌀 Descenso · piso ${dsc.floor} · nivel ${m.dungeon.level} · ${MOD.icon} ${MOD.name}` : `${th ? th.icon + ' ' : ''}${m.dungeon.name} · nivel ${m.dungeon.level}`;
    game.dying.clear(); game.herbs = [];
    game.duelAt = m.dungeon.duel ? performance.now() + (m.dungeon.duel.startAt - (m.you ? m.you.now : Date.now())) : 0;
    $('#dbite').classList.add('hidden');
    if (dsc) banner(`🌀 Piso ${dsc.floor}`, `${MOD.icon} ${MOD.name}: ${MOD.desc}`);
    $('#dlog').innerHTML = '';
    viewEl.classList.remove('hidden');
    viewEl.classList.toggle('world', m.dungeon.kind === 'world');
    DD.setScene('dungeon');
    resizeGame();
    applySnap(m);
    updateVision();
    buildBar();
    $('#dmount').classList.toggle('hidden', !(m.dungeon.kind === 'world' && DD.me && DD.me.mount));
    DD.toast(m.dungeon.kind === 'world'
      ? `${m.dungeon.name}: explora, pesca junto al agua (🎣/G), recoge hierbas y vuelve al pueblo (casa iluminada) para descansar.`
      : m.dungeon.kind === 'arena' ? 'Duelo: clic en tu rival para atacarle, habilidades con 1-8, Espacio para esquivar. ¡Gana quien quede en pie!'
      : 'Clic para andar, clic en un enemigo para atacarlo. 1-8 habilidades, Q/E pociones, Espacio esquiva. Derrota al jefe para abrir el portal.');
  });
  DD.on('dsnap', (m) => { if (game.active) { applySnap(m); updateVision(); } });
  DD.on('dme', (m) => { game.you = m; game.youAt = performance.now(); updateHud(); });
  DD.on('dwhisper', (m) => DD.toast(m.text));
  DD.on('dbite', () => { $('#dbite').classList.remove('hidden'); DD.blip(1500, 0.2); setTimeout(() => DD.blip(1800, 0.2), 120); });
  DD.on('me', () => { if (game.active) buildBar(); });
  DD.on('dexit', (m) => {
    game.active = false;
    if (m.silent) return; // pasa de una mazmorra al mundo: llega otro dstart
    viewEl.classList.add('hidden');
    VIEW3D.show(false);
    DD.setScene('tavern');
    if (m.reason === 'win') DD.toast('🏆 ¡Mazmorra completada!');
    else if (m.reason === 'down') DD.toast(`💀 Has caído${m.lost ? ` y pierdes ${m.lost} de oro` : ''}. Vuelves a la taberna.`);
    else if (m.reason === 'return') DD.toast('🌀 El pergamino te devuelve a la taberna.');
    else if (m.reason === 'arena') DD.toast('🤺 Fin del duelo. Alfonso os sirve algo para las heridas.');
    else DD.toast('Vuelves a la taberna: vida y energía recuperadas.');
  });
  // Vuelta a la pantalla de inicio: se cierra la partida sin más
  DD.on('to-title', () => {
    game.active = false;
    viewEl.classList.add('hidden');
    VIEW3D.show(false);
    DD.setScene('tavern');
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
    $('#dleft').textContent = game.map && game.map.kind === 'world' ? `M: mapa · ${game.daycycle ? game.daycycle.label : ''}` : game.map && game.map.kind === 'arena' ? '🤺 Duelo' : game.portal ? (game.map.descent ? '🌀 Portal al siguiente piso' : '🌀 Portal abierto') : `👹 ${left}`;
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
    let enemy = entAt(h.x, h.y, 'enemy');
    const hero = entAt(h.x, h.y, 'hero');
    if (!enemy && game.map.kind === 'arena' && hero && hero.id !== DD.myId) enemy = { id: 'pv:' + hero.id };
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
    if (k === ' ') { e.preventDefault(); doRoll(); return; }
    if (k === 'g') { DD.net.send({ t: 'dfish' }); return; }
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
    const p = stage && stage.pick(cx, cy);
    return p ? { x: Math.floor(p.x), y: Math.floor(p.z) } : { x: -1, y: -1 };
  }
  const entAt = (x, y, kind) => [...game.ents.values()].find((e) => e.kind === kind && e.x === x && e.y === y && (kind === 'hero' || game.vis[y * game.map.w + x]));
  // Personaje bajo el puntero (por su silueta en pantalla, no sólo por la casilla)
  function entUnder(cx, cy, kinds) {
    let best = null, bd = 34;
    for (const e of game.ents.values()) {
      if (!kinds.includes(e.kind) || !e._top) continue;
      if (e.kind === 'enemy' && !game.vis[e.y * game.map.w + e.x]) continue;
      const s = stage.project(e._top.x, e._top.h * 0.5, e._top.z);
      const d = Math.hypot(s.x - cx, s.y - cy);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  let holding = null;
  function clickAt(cx, cy, repeat) {
    const { x, y } = screenToTile(cx, cy);
    const { w, h } = game.map;
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const npc = !repeat && entUnder(cx, cy, ['npc']);
    if (npc) { DD.net.send({ t: 'dtalk', id: npc.npc }); game.marker = { x: npc.x, y: npc.y, at: performance.now() }; return 'talk'; }
    if (!repeat && game.map.kind === 'arena') {
      const foe = entUnder(cx, cy, ['hero']);
      if (foe && foe.id !== DD.myId) { DD.net.send({ t: 'dattack', id: 'pv:' + foe.id }); game.marker = { x: foe.x, y: foe.y, at: performance.now(), enemy: true }; return 'attack'; }
    }
    const enemy = entUnder(cx, cy, ['enemy']) || entAt(x, y, 'enemy');
    if (enemy && !repeat) { DD.net.send({ t: 'dattack', id: enemy.id }); game.marker = { x: enemy.x, y: enemy.y, at: performance.now(), enemy: true }; return 'attack'; }
    const herb = !repeat && herbUnder(cx, cy);
    if (herb) { DD.net.send({ t: 'dgather', id: herb.id }); game.marker = { x: herb.x, y: herb.y, at: performance.now() }; return 'gather'; }
    if (enemy && repeat) return;
    if (!game.seen[y * w + x]) return;
    DD.net.send({ t: 'dgo', x, y });
    if (!repeat) game.marker = { x, y, at: performance.now() };
    return 'go';
  }
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  cv.addEventListener('pointermove', (e) => {
    if (!game.active) return;
    game.hover = screenToTile(e.clientX, e.clientY); game.mouse = { x: e.clientX, y: e.clientY }; game.mouseOnMap = true;
    const en = stage && entUnder(e.clientX, e.clientY, ['enemy']);
    game.hoverEnemy = en ? en.id : null;
    if (en) game.hover = { x: en.x, y: en.y };
  });
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
  //  Dibujo en 3D (Three.js) + capa 2D con nombres, barras y números
  // ======================================================================
  let stage = null, built = null, fog = null;
  const models = new Map();   // id -> { obj, key, hitScale }
  const lootObjs = new Map(), chestObjs = new Map(), teleObjs = new Map(), projObjs = new Map();
  let portalObj = null, fogDirty = true, seenCount = -1;
  const fx3d = [];
  let fxp = null, dustp = null, wx = null;     // chispas (aditivas), polvo/humo y clima
  const herbObjs = new Map(), corpses = [];

  function ensureStage() {
    if (stage) return;
    stage = VIEW3D.makeStage({ offset: [0, 9.5, 7.2], ambient: 0.3, sky: '#5a6aa0', ground: '#140c0a', lights: 10, sun: 0.0001 });
    stage.sun.castShadow = false;
    fxp = VIEW3D.particles(stage.scene, 1400, true);
    dustp = VIEW3D.particles(stage.scene, 800, false);
    wx = VIEW3D.weather(stage.scene);
    window.__stage = stage;
  }

  function clearScene() {
    if (built) { stage.scene.remove(built.group); built = null; }
    if (fog) { stage.scene.remove(fog.mesh); fog = null; }
    for (const m of [...models.values(), ...lootObjs.values(), ...chestObjs.values(), ...teleObjs.values(), ...projObjs.values()]) stage.scene.remove(m.obj || m);
    models.clear(); lootObjs.clear(); chestObjs.clear(); teleObjs.clear(); projObjs.clear();
    for (const f of fx3d) stage.scene.remove(f.obj);
    fx3d.length = 0;
    fxp.clear(); dustp.clear(); wx.set('none');
    for (const o of herbObjs.values()) stage.scene.remove(o);
    herbObjs.clear();
    for (const c of corpses) stage.scene.remove(c.obj);
    corpses.length = 0;
    if (portalObj) { stage.scene.remove(portalObj); portalObj = null; }
  }

  function buildScene() {
    ensureStage();
    clearScene();
    const world = game.map.kind === 'world';
    built = VIEW3D.buildMap(game.map);
    stage.scene.add(built.group);
    fog = VIEW3D.fogLayer(game.map);
    if (built.gl) fog.mesh.position.y = 0.18; // por encima de las losas con piedras
    stage.scene.add(fog.mesh);
    const T = VIEW3D.THEME[game.map.theme] || VIEW3D.THEME.cripta;
    const bg = world ? '#0a1020' : T.fog;
    stage.scene.background = new THREE.Color(bg);
    stage.scene.fog = new THREE.Fog(bg, world ? 16 : 13, world ? 34 : 26);
    stage.hemi.intensity = world ? 0.62 : 0.3;
    stage.grade = world ? null : GRADES[game.map.kind === 'arena' ? 'arena' : game.map.theme] || null;
    stage.hemi.color.set(world ? '#7a8ac0' : T.sky);
    stage.hemi.groundColor.set(world ? '#2a2a1a' : '#140c0a');
    // los personajes del mundo
    for (const n of game.map.npcs || []) game.ents.set('npc:' + n.id, { id: 'npc:' + n.id, npc: n.id, kind: 'npc', name: n.name, look: n.look, x: n.x, y: n.y, rx: n.x, ry: n.y, fx: n.x, fy: n.y, t0: 0, dur: 1, dir: 'S', alive: true, static: true });
    fogDirty = true; seenCount = -1;
    VIEW3D.show(true);
  }

  // Gradación de color por tema: frío en la cripta, cálido en la guarida del dragón…
  const GRADES = {
    cripta: { gain: [0.92, 0.98, 1.1], lift: [0, 0.005, 0.02], saturation: 0.95, vignette: 0.5, bloom: 0.6 },
    cuevas: { gain: [1.06, 1.0, 0.9], lift: [0.01, 0.006, 0], saturation: 1.08, vignette: 0.45 },
    fortaleza: { gain: [1.05, 0.97, 0.9], lift: [0.012, 0.004, 0], saturation: 1.0, vignette: 0.45 },
    nido: { gain: [0.95, 1.06, 0.9], lift: [0, 0.01, 0], saturation: 1.05, vignette: 0.5 },
    volcan: { gain: [1.12, 0.96, 0.82], lift: [0.02, 0.004, 0], saturation: 1.15, vignette: 0.5, bloom: 0.75 },
    arena: { gain: [1.08, 0.98, 0.88], lift: [0.012, 0.005, 0], saturation: 1.1, vignette: 0.55, bloom: 0.65 },
  };
  const DIR_ANG = { S: 0, N: Math.PI, E: Math.PI / 2, W: -Math.PI / 2 };
  function modelFor(e) {
    let key;
    if (e.kind === 'hero') key = 'h' + JSON.stringify(e.look) + (e.mount || '');
    else if (e.kind === 'npc') key = 'n' + e.npc;
    else if (e.kind === 'pet') key = 'p' + e.k + (e.evo || 0);
    else key = 'e' + e.k;
    key += MODELS.GL.version;
    let m = models.get(e.id);
    if (m && m.key === key) return m;
    if (m) stage.scene.remove(m.obj);
    let obj;
    if (e.kind === 'hero') {
      const hero = MODELS.buildHero(e.look);
      if (e.mount) {
        obj = new THREE.Group();
        const mount = MODELS.buildMount(e.mount);
        obj.add(mount);
        hero.position.y = mount.userData.saddleY - 0.35;
        obj.add(hero);
        obj.userData.parts = hero.userData.parts;
        obj.userData.mount = mount;
      } else obj = hero;
    } else if (e.kind === 'npc') obj = MODELS.buildHero(e.look);
    else if (e.kind === 'pet') obj = MODELS.buildPet(e.k, e.evo || 0);
    else obj = MODELS.buildEnemy(e.k);
    if (e.big) obj.scale.multiplyScalar(1.3);
    if (e.elite || e.boss) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 20), new THREE.MeshBasicMaterial({ color: e.wb ? '#a05aff' : e.boss ? '#ff3a2a' : '#ffc040', transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; ring.scale.setScalar(1 / obj.scale.x);
      obj.add(ring);
    }
    obj.userData.face = DIR_ANG[e.dir] || 0;
    obj.rotation.order = 'YXZ'; // la voltereta gira sobre el eje del propio personaje
    if (e.kind === 'hero' && obj.userData.parts && obj.userData.parts.armR && !obj.userData.parts.gl) {
      const r = MODELS.rod(); r.position.set(0, -0.32, 0.04); r.rotation.x = Math.PI / 2 + 0.3; r.visible = false;
      obj.userData.parts.armR.add(r); obj.userData.rod = r;
    }
    stage.scene.add(obj);
    m = { obj, key };
    models.set(e.id, m);
    return m;
  }

  // Objetos del suelo: el arma o pieza en pequeño, con un haz del color de su rareza
  function lootModel(l) {
    const g = new THREE.Group();
    if (l.r) {
      const col = MODELS.RARITY[l.r] || '#d8d4c8';
      const it = l.it || {};
      let o = null;
      if (it.slot === 'arma') o = MODELS.weapon(it.base, l.r);
      if (o) { o.rotation.z = Math.PI / 2; o.position.y = 0.12; o.scale.setScalar(0.8); g.add(o); }
      else MODELS.mesh(MODELS.box(0.22, 0.16, 0.22), MODELS.mat(it.slot === 'mano' ? '#7a2222' : it.type === 'placas' ? '#a8aeb8' : it.type === 'malla' ? '#7e8692' : it.type === 'cuero' ? '#6a4226' : it.slot === 'amuleto' || it.slot === 'anillo' ? '#c8a040' : '#6a4aa0', { metal: it.type === 'placas' ? 0.6 : 0 }), 0, 0.1, 0, g);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.12, l.r === 'comun' ? 0.6 : 1.8, 6, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: l.r === 'comun' ? 0.25 : 0.45, depthWrite: false, side: THREE.DoubleSide }));
      beam.position.y = l.r === 'comun' ? 0.3 : 0.9;
      beam.layers.set(1);
      g.add(beam);
      g.userData.light = l.r === 'comun' ? null : col;
    } else if (l.gold && MODELS.GL.ready && MODELS.pieceGeo('coin_stack_small')) {
      g.add(MODELS.piece('coin_stack_small', 0.28));
      g.userData.light = '#ffd23f';
    } else if (l.gold) {
      for (let i = 0; i < 5; i++) MODELS.mesh(MODELS.cyl(0.06, 0.06, 0.02, 8), MODELS.mat('#ffd23f', { metal: 0.8, rough: 0.3, emissive: '#6a4a00', ei: 0.4 }), (i % 3 - 1) * 0.07, 0.02 + Math.floor(i / 3) * 0.02, (i % 2) * 0.06, g);
    } else if (l.mat) {
      const col = l.mat === 'polvo' ? '#ffe27a' : l.mat === 'esencia' ? '#5ab8ff' : '#a8acb8';
      const o = MODELS.mesh(l.mat === 'hierro' ? MODELS.box(0.16, 0.07, 0.1) : new THREE.OctahedronGeometry(0.09), MODELS.mat(col, { metal: l.mat === 'hierro' ? 0.8 : 0.2, rough: 0.3, emissive: l.mat === 'hierro' ? null : col, ei: 0.9 }), 0, 0.12, 0, g);
      void o;
      if (l.mat !== 'hierro') g.userData.light = col;
    } else if (l.cons) {
      const C = RULES.CONSUMABLES[l.cons];
      MODELS.mesh(MODELS.sph(0.08, 7, 6), MODELS.mat(C.color, { emissive: C.color, ei: 0.6, opacity: 0.9 }), 0, 0.09, 0, g);
      MODELS.mesh(MODELS.cyl(0.025, 0.025, 0.06, 6), MODELS.mat('#c8a070'), 0, 0.19, 0, g);
    }
    return g;
  }

  function chestModel() {
    if (MODELS.GL.ready && MODELS.pieceGeo('chest')) {
      // cofre KayKit: cerrado, y al abrirlo el mismo cofre lleno de oro
      const g = new THREE.Group();
      const closed = MODELS.piece('chest', 0.3), open = MODELS.piece('chest_gold', 0.3);
      open.visible = false;
      g.add(closed, open);
      g.userData.kk = { closed, open };
      return g;
    }
    const g = new THREE.Group();
    MODELS.mesh(MODELS.box(0.62, 0.36, 0.44), MODELS.mat('#6a3e1e'), 0, 0.18, 0, g);
    MODELS.mesh(MODELS.box(0.64, 0.05, 0.46), MODELS.mat('#c8a040', { metal: 0.7 }), 0, 0.22, 0, g);
    const lid = new THREE.Group(); lid.position.set(0, 0.36, -0.22); g.add(lid);
    MODELS.mesh(MODELS.box(0.62, 0.14, 0.44), MODELS.mat('#8a5428'), 0, 0.07, 0.22, lid);
    MODELS.mesh(MODELS.box(0.08, 0.1, 0.03), MODELS.mat('#e8c050', { metal: 0.7 }), 0, 0.02, 0.45, lid);
    g.userData.lid = lid;
    return g;
  }

  // Chispas brillantes (sangre, magia, oro…)
  function spark(x, y, color, up) {
    if (!fxp) return;
    fxp.emit({ x, y: 0.5, z: y, vx: (Math.random() - 0.5) * 2.4, vy: up ? 1.5 + Math.random() * 2 : 0.5 + Math.random() * 2, vz: (Math.random() - 0.5) * 2.4, color, size: 0.08 + Math.random() * 0.06, life: 0.45 + Math.random() * 0.4, grav: 6 });
  }
  // Polvo o humo que se levanta del suelo
  function puff(x, z, color, n = 3, spread = 0.3) {
    if (!dustp) return;
    for (let i = 0; i < n; i++) dustp.emit({ x: x + (Math.random() - 0.5) * spread, y: 0.08, z: z + (Math.random() - 0.5) * spread, vx: (Math.random() - 0.5) * 0.6, vy: 0.3 + Math.random() * 0.4, vz: (Math.random() - 0.5) * 0.6, color, size: 0.22 + Math.random() * 0.15, life: 0.6 + Math.random() * 0.4, drag: 2, grow: 1.5, alpha: 0.45 });
  }
  // Salpicadura de agua
  function splash(x, y, n) {
    if (!fxp) return;
    for (let i = 0; i < n; i++) fxp.emit({ x: x + 0.5, y: 0.1, z: y + 0.5, vx: (Math.random() - 0.5) * 1.2, vy: 1.5 + Math.random() * 1.5, vz: (Math.random() - 0.5) * 1.2, color: '#bfe0ff', size: 0.07, life: 0.5, grav: 7 });
  }
  // Anillo de luz (críticos)
  function ring(x, y, color) {
    if (!fxp) return;
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; fxp.emit({ x: x + 0.5, y: 0.6, z: y + 0.5, vx: Math.cos(a) * 3, vy: 0.3, vz: Math.sin(a) * 3, color, size: 0.12, life: 0.3, drag: 5 }); }
  }
  // Color del polvo según el suelo
  const DUST = { s: '#c8b088', d: '#c8885a', z: '#a8784a', n: '#f4f8ff', i: '#e0f0ff', a: '#7a6a68', m: '#5a5a3a', '=': '#a88a5a', u: '#8a8a80', '.': '#8a8070' };
  function dustColor(x, y) { const ch = game.map ? game.map.tiles[y * game.map.w + x] : '.'; return DUST[ch] || (game.map && game.map.kind === 'world' ? '#7a8a5a' : '#7a7068'); }
  // Planta bajo el puntero
  function herbUnder(cx, cy) {
    let best = null, bd = 30;
    for (const h of game.herbs) {
      const s = stage.project(h.x + 0.5, 0.25, h.y + 0.5);
      const d = Math.hypot(s.x - cx, s.y - cy);
      if (d < bd) { bd = d; best = h; }
    }
    return best;
  }
  // Rótulo grande en el centro (jefe de mundo, piso del Descenso)
  let bannerT = 0;
  function banner(title, sub) {
    const b = $('#dbanner');
    b.innerHTML = '';
    const t = document.createElement('b'); t.textContent = title;
    const s2 = document.createElement('small'); s2.textContent = sub || '';
    b.append(t, s2);
    b.classList.remove('hidden');
    clearTimeout(bannerT); bannerT = setTimeout(() => b.classList.add('hidden'), 4200);
  }
  // Esquiva hacia donde se mueve (o hacia donde mira)
  function doRoll() {
    let dx = 0, dy = 0;
    for (const k of game.keys) { const d = KEYDIR[k]; if (d) { dx += d[0]; dy += d[1]; } }
    if (!dx && !dy && game.joyDir) [dx, dy] = game.joyDir;
    DD.net.send({ t: 'droll', dx: Math.sign(dx), dy: Math.sign(dy) });
  }
  $('#droll').onclick = () => doRoll();
  $('#dfish').onclick = () => DD.net.send({ t: 'dfish' });
  game.particles = { push() {} }; // compatibilidad: las chispas viven en 3D

  function fxColor(f) { return f.color || '#ffffff'; }
  function addFx(f, now) {
    let obj;
    const col = fxColor(f);
    const glow = (c, op = 0.6) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: op, depthWrite: false });
    if (f.kind === 'blast' || f.kind === 'nova') obj = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), glow(col, 0.45));
    else if (f.kind === 'bolt' || f.kind === 'arrow') obj = new THREE.Mesh(f.kind === 'arrow' ? MODELS.box(0.04, 0.04, 0.35) : new THREE.SphereGeometry(0.1, 8, 6), glow(f.kind === 'arrow' ? '#e8dcc0' : col, 1));
    else if (f.kind === 'heal' || f.kind === 'buff' || f.kind === 'portal' || f.kind === 'mark') { obj = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.04, 6, 20), glow(f.kind === 'heal' ? '#7dff8a' : col, 0.9)); obj.rotation.x = Math.PI / 2; }
    else if (f.kind === 'dash' || f.kind === 'blink') obj = new THREE.Mesh(MODELS.box(0.08, 0.08, 1), glow(f.kind === 'blink' ? '#a05aff' : '#ffffff', 0.7));
    else return;
    obj.renderOrder = 6;
    VIEW3D.fxLayer(obj);
    stage.scene.add(obj);
    fx3d.push({ f, obj, start: f.start || now, dur: f.dur || 400 });
  }

  function renderGame(now, dt) {
    if (!stage || !built || built.map !== game.map || built.glv !== MODELS.GL.version) { buildScene(); built.map = game.map; built.glv = MODELS.GL.version; }
    const map = game.map;
    // golpe crítico: el mundo se congela un instante (hit-stop)
    const frozen = now < game.hitstop;
    if (frozen) dt = 0;
    // posiciones suaves (interpolación lineal a velocidad constante)
    if (!frozen) for (const e of game.ents.values()) {
      const k = Math.min(1, (now - e.t0) / e.dur);
      e.rx = e.fx + (e.x - e.fx) * k; e.ry = e.fy + (e.y - e.fy) * k;
      const was = e.moving;
      e.moving = k < 1;
      if (e.moving) {
        e.phase = (e.phase || 0) + dt * 11;
        // polvo al andar (más al correr montado)
        if ((e.kind === 'hero' || e.big || e.boss) && Math.random() < (e.mount ? 0.5 : 0.18)) puff(e.rx + 0.5, e.ry + 0.55, dustColor(e.x, e.y), 1, 0.2);
      } else if (was && e.kind === 'hero') puff(e.rx + 0.5, e.ry + 0.5, dustColor(e.x, e.y), 2, 0.3);
    }
    const me = game.ents.get(DD.myId);
    // cámara que sigue al héroe
    const tx = me ? me.rx + 0.5 : map.w / 2, tz = me ? me.ry + 0.5 : map.h / 2;
    if (!game.camInit) { game.cam = { x: tx, y: tz }; game.camInit = !!me; }
    game.cam.x += (tx - game.cam.x) * Math.min(1, dt * 6); game.cam.y += (tz - game.cam.y) * Math.min(1, dt * 6);
    const zoom = (innerWidth <= 820 ? 1.18 : 1) * (game.zoom || 1);
    stage.offset.set(0, 9.5 * zoom, 7.2 * zoom);
    let shake = 0;
    if (game.shake && game.shake > now) shake = Math.min(1, (game.shake - now) / 260) * 0.16;
    stage.lookAt(game.cam.x + (Math.random() - 0.5) * shake, game.cam.y + 0.6 + (Math.random() - 0.5) * shake);

    // lo explorado: muros, decorado y niebla
    const sc = game.seen.reduce((a, b) => a + b, 0);
    const heroKey = me ? me.x + ',' + me.y : '';
    if (sc !== seenCount || heroKey !== game.wallKey) {
      seenCount = sc; game.wallKey = heroKey;
      if (built.updateWalls) built.updateWalls(game.seen, me ? me.x + 0.5 : undefined, me ? me.y + 0.5 : undefined);
      for (const p of built.props || []) p.o.visible = !!game.seen[p.tile];
      fogDirty = true;
    }
    if (fogDirty) { fog.update(game.seen, game.vis); fogDirty = false; }

    // personajes
    const live = new Set();
    for (const e of game.ents.values()) {
      const visible = e.kind === 'hero' || (e.kind === 'npc' ? game.seen[e.y * map.w + e.x] : game.vis[e.y * map.w + e.x]);
      if (!visible) { const m = models.get(e.id); if (m) m.obj.visible = false; continue; }
      live.add(e.id);
      const m = modelFor(e);
      const o = m.obj;
      o.visible = true;
      let lx = 0, lz = 0, atk = 0;
      if (now - e.lunge < 260) { atk = (now - e.lunge) / 260; const f = Math.sin(atk * Math.PI) * 0.18; lx = (e.lungeDx || 0) * f; lz = (e.lungeDy || 0) * f; }
      o.position.set(e.rx + 0.5 + lx, 0, e.ry + 0.5 + lz);
      // hacia dónde mira: hacia donde anda, o hacia su objetivo al atacar
      let ang = o.userData.face;
      if (e.moving) ang = Math.atan2(e.x - e.fx, e.y - e.fy);
      else if (atk && (e.lungeDx || e.lungeDy)) ang = Math.atan2(e.lungeDx, e.lungeDy);
      else if (e.kind !== 'npc' && DIR_ANG[e.dir] !== undefined && !e.moving && now - (e.t0 || 0) > 600) ang = o.userData.face;
      if (!Number.isNaN(ang)) {
        let d = ang - o.rotation.y;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        o.rotation.y += d * Math.min(1, dt * 12);
        o.userData.face = ang;
      }
      const hit = e.hitUntil > now;
      const base = o.userData.baseScale || (o.userData.baseScale = o.scale.x);
      o.scale.setScalar(base * (hit ? 1.08 : 1));
      // voltereta: una vuelta completa hacia delante, agachado
      const rk = e.rollAt ? (now - e.rollAt) / 360 : 1;
      const gl = !!(o.userData.gl || (o.userData.mount && o.children[1] && o.children[1].userData.gl));
      if (!gl) { o.rotation.x = rk < 1 ? rk * Math.PI * 2 : 0; if (rk < 1) o.position.y = 0.25 * Math.sin(rk * Math.PI); }
      if (e.stun) o.rotation.z = Math.sin(now / 90) * 0.06; else o.rotation.z = 0;
      const castK = e.castAt ? (now - e.castAt) / 450 : 1;
      if (o.userData.rod) o.userData.rod.visible = !!e.fishing;
      MODELS.animate(o.userData.mount ? o.children[1] : o, { moving: e.moving, run: (e.dur || 200) < 330, phase: e.phase || 0, t: now, attack: atk, sit: !!o.userData.mount, cast: castK < 1 ? castK : 0, fish: !!e.fishing, attackAt: e.lunge, castAt: e.castAt, hitAt: e.hitUntil, rollAt: e.rollAt });
      if (e.wb && Math.random() < 0.5) fxp.emit({ x: e.rx + 0.5 + (Math.random() - 0.5), y: 0.1, z: e.ry + 0.5 + (Math.random() - 0.5), vy: 1 + Math.random(), color: '#a05aff', size: 0.12, life: 0.9 });
      if (e.kind === 'pet' && e.evo === 2 && Math.random() < 0.15) fxp.emit({ x: e.rx + 0.5, y: 0.4, z: e.ry + 0.5, vy: 0.6, vx: (Math.random() - 0.5) * 0.4, color: '#7affff', size: 0.06, life: 0.6 });
      if (o.userData.mount) {
        const mt = o.userData.mount;
        MODELS.animate(mt, { moving: e.moving, phase: (e.phase || 0) * 0.8, t: now });
        if (mt.userData.ride) o.children[1].position.y = mt.userData.ride() - 0.33; // el jinete sube y baja con el lomo
      }
      e._top = { x: e.rx + 0.5, z: e.ry + 0.5, h: (e.kind === 'hero' && o.userData.mount ? 1.6 : 1.15) * (e.boss ? 1.5 : 1) * (e.kind === 'enemy' ? Math.max(0.8, base) : 1) };
    }
    for (const [id, m] of models) {
      if (game.ents.has(id)) continue;
      // al morir no desaparece: cae al suelo y se desvanece
      if (game.dying.has(id) && m.obj.visible) corpses.push({ obj: m.obj, start: game.dying.get(id), y0: m.obj.rotation.y, side: Math.random() < 0.5 ? -1 : 1 });
      else stage.scene.remove(m.obj);
      game.dying.delete(id);
      models.delete(id);
    }
    for (let i = corpses.length - 1; i >= 0; i--) {
      const c = corpses[i];
      if (c.obj.userData.gl) {
        // modelo animado: su animación de muerte, y luego se hunde en el suelo
        const k = (now - c.start) / 2600;
        if (k >= 1) { stage.scene.remove(c.obj); corpses.splice(i, 1); continue; }
        MODELS.animate(c.obj, { t: now, deadAt: c.start });
        c.obj.position.y = k > 0.7 ? -(k - 0.7) * 1.2 : 0;
        continue;
      }
      const k = (now - c.start) / 1100;
      if (k >= 1) { stage.scene.remove(c.obj); corpses.splice(i, 1); continue; }
      const fall = Math.min(1, k * 2.6);
      c.obj.rotation.z = c.side * fall * Math.PI / 2 * (1 - 0.15 * Math.sin(fall * Math.PI));
      c.obj.position.y = k > 0.55 ? -(k - 0.55) * 0.6 : 0.08 * Math.sin(fall * Math.PI);
    }
    if (game.dying.size > 60) game.dying.clear();

    // botín
    const lootIds = new Set();
    for (const l of game.loot) {
      if (!game.seen[l.y * map.w + l.x]) continue;
      lootIds.add(l.id);
      let o = lootObjs.get(l.id);
      if (!o) { o = lootModel(l); stage.scene.add(o); lootObjs.set(l.id, o); }
      o.position.set(l.x + 0.5, Math.sin(now / 300 + l.x) * 0.03, l.y + 0.5);
      if (o.children[0]) o.children[0].rotation.y = now / 900;
    }
    for (const [id, o] of lootObjs) if (!lootIds.has(id)) { stage.scene.remove(o); lootObjs.delete(id); }
    // plantas del herbolario
    const herbIds = new Set();
    for (const h of game.herbs) {
      if (!game.seen[h.y * map.w + h.x]) continue;
      herbIds.add(h.id);
      let o = herbObjs.get(h.id);
      if (!o) { o = MODELS.herb(h.zone); o.position.set(h.x + 0.5, 0, h.y + 0.5); o.rotation.y = h.x; stage.scene.add(o); herbObjs.set(h.id, o); }
      o.children[o.children.length - 1].position.y = 0.3 + Math.sin(now / 400 + h.x) * 0.03;
      if (Math.random() < 0.03) fxp.emit({ x: h.x + 0.5, y: 0.35, z: h.y + 0.5, vy: 0.4, color: o.userData.glow, size: 0.07, life: 0.9 });
    }
    for (const [id, o] of herbObjs) if (!herbIds.has(id)) { stage.scene.remove(o); herbObjs.delete(id); }
    // cofres
    for (const c of game.chests) {
      let o = chestObjs.get(c.id);
      if (!o) { o = chestModel(); o.position.set(c.x + 0.5, 0, c.y + 0.5); stage.scene.add(o); chestObjs.set(c.id, o); }
      o.visible = !!game.seen[c.y * map.w + c.x];
      if (o.userData.kk) { o.userData.kk.closed.visible = !c.open; o.userData.kk.open.visible = !!c.open; continue; }
      const lid = o.userData.lid;
      lid.rotation.x += ((c.open ? -1.9 : 0) - lid.rotation.x) * Math.min(1, dt * 6);
    }
    // portal de salida
    if (game.portal && !portalObj) {
      portalObj = new THREE.Group();
      const ringM = new THREE.MeshBasicMaterial({ color: '#7ad0ff', transparent: true, opacity: 0.85 });
      for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.42 - i * 0.1, 0.035, 6, 24), ringM); r.position.y = 0.6; portalObj.add(r); }
      const core = new THREE.Mesh(new THREE.CircleGeometry(0.38, 20), new THREE.MeshBasicMaterial({ color: '#3a6aff', transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
      core.position.y = 0.6; portalObj.add(core);
      portalObj.position.set(game.portal.x + 0.5, 0, game.portal.y + 0.5);
      stage.scene.add(portalObj);
    }
    if (portalObj) portalObj.children.forEach((r, i) => { r.rotation.y = now / (500 + i * 200) * (i % 2 ? -1 : 1); r.rotation.x = Math.sin(now / 700 + i) * 0.3; });
    // avisos de los jefes en el suelo
    const teleIds = new Set();
    for (const t of game.teles) {
      teleIds.add(t.id);
      let o = teleObjs.get(t.id);
      if (!o) {
        o = new THREE.Group();
        const col = t.kind === 'breath' ? '#ff6a10' : t.kind === 'nova' ? '#9a3aff' : '#e01e1e';
        const matT = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.2, depthWrite: false });
        const q = new THREE.PlaneGeometry(0.92, 0.92); q.rotateX(-Math.PI / 2);
        for (const [x, y] of t.cells) { const pl = new THREE.Mesh(q, matT); pl.position.set(x + 0.5, 0.05, y + 0.5); o.add(pl); }
        o.userData.mat = matT;
        VIEW3D.fxLayer(o);
        stage.scene.add(o); teleObjs.set(t.id, o);
      }
      const k = Math.min(1, (now - t.start) / t.dur);
      o.userData.mat.opacity = 0.18 + k * 0.5 + Math.sin(now / 60) * 0.05;
    }
    for (const [id, o] of teleObjs) if (!teleIds.has(id)) { stage.scene.remove(o); teleObjs.delete(id); }
    // proyectiles enemigos
    const projIds = new Set();
    for (let i = game.projs.length - 1; i >= 0; i--) {
      const pr = game.projs[i];
      const k = (now - pr.start) / pr.dur;
      if (k >= 1) { game.projs.splice(i, 1); continue; }
      projIds.add(pr.id);
      let o = projObjs.get(pr.id);
      if (!o) {
        const col = PROJ_COL[pr.kind] || '#fff';
        o = pr.kind === 'arrow' || pr.kind === 'javelin'
          ? new THREE.Mesh(MODELS.box(0.03, 0.03, pr.kind === 'javelin' ? 0.6 : 0.4), MODELS.mat(col))
          : new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), new THREE.MeshBasicMaterial({ color: col }));
        const mark = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.32, 16), new THREE.MeshBasicMaterial({ color: '#ff3a3a', transparent: true, opacity: 0.6, depthWrite: false }));
        mark.rotation.x = -Math.PI / 2;
        mark.layers.set(1);
        o.userData.mark = mark;
        stage.scene.add(o); stage.scene.add(mark); projObjs.set(pr.id, o);
      }
      const x = pr.from.x + (pr.to.x - pr.from.x) * k + 0.5, z = pr.from.y + (pr.to.y - pr.from.y) * k + 0.5;
      o.position.set(x, 0.65 + Math.sin(k * Math.PI) * (pr.kind === 'arrow' || pr.kind === 'javelin' ? 0.5 : 0.15), z);
      o.lookAt(pr.to.x + 0.5, 0.6, pr.to.y + 0.5);
      o.userData.mark.position.set(pr.to.x + 0.5, 0.05, pr.to.y + 0.5);
      if (pr.kind !== 'arrow' && pr.kind !== 'javelin' && Math.random() < 0.4) spark(x, z, PROJ_COL[pr.kind] || '#fff', true);
    }
    for (const [id, o] of projObjs) if (!projIds.has(id)) { stage.scene.remove(o); stage.scene.remove(o.userData.mark); projObjs.delete(id); }
    // efectos
    for (const f of game.fx.splice(0)) addFx(f, now);
    for (let i = fx3d.length - 1; i >= 0; i--) {
      const F = fx3d[i], f = F.f;
      if (now < F.start) { F.obj.visible = false; continue; }
      F.obj.visible = true;
      const k = (now - F.start) / F.dur;
      if (k >= 1) { stage.scene.remove(F.obj); fx3d.splice(i, 1); continue; }
      if (f.kind === 'blast' || f.kind === 'nova') { F.obj.position.set(f.x + 0.5, 0.3, f.y + 0.5); F.obj.scale.setScalar(((f.radius || 1) + 0.5) * (0.3 + k * 0.7)); F.obj.material.opacity = 0.5 * (1 - k); }
      else if (f.kind === 'bolt' || f.kind === 'arrow') { const q = Math.min(1, k * 1.5); F.obj.position.set(f.from.x + 0.5 + (f.to.x - f.from.x) * q, 0.7, f.from.y + 0.5 + (f.to.y - f.from.y) * q); F.obj.lookAt(f.to.x + 0.5, 0.7, f.to.y + 0.5); }
      else if (f.kind === 'dash' || f.kind === 'blink') { const dx = f.to.x - f.from.x, dz = f.to.y - f.from.y; F.obj.position.set((f.from.x + f.to.x) / 2 + 0.5, 0.5, (f.from.y + f.to.y) / 2 + 0.5); F.obj.scale.z = Math.hypot(dx, dz); F.obj.lookAt(f.to.x + 0.5, 0.5, f.to.y + 0.5); F.obj.material.opacity = 0.7 * (1 - k); }
      else { const e = f.id && game.ents.get(f.id); const px = e ? e.rx : f.x, pz = e ? e.ry : f.y; F.obj.position.set(px + 0.5, 0.1 + k * (f.kind === 'heal' ? 1.2 : 0.3), pz + 0.5); F.obj.scale.setScalar(0.5 + k); F.obj.material.opacity = 0.9 * (1 - k); }
    }
    // partículas y clima
    fxp.update(dt); dustp.update(dt);
    const zoneId = map.zones && me ? Number(map.zones[me.y * map.w + me.x]) || 0 : 0;
    const wantWx = !DD.gfx || DD.gfx.weather ? weatherFor(map, zoneId, now) : 'none';
    wx.set(wantWx, game.cam.x, game.cam.y);
    wx.update(dt, game.cam.x, game.cam.y);
    // ascuas de antorchas y braseros
    if (Math.random() < 0.25 && built.props) {
      const lit = built.props.filter((p) => p.light && p.o.visible);
      const p = lit[Math.floor(Math.random() * lit.length)];
      if (p) spark(p.light.x + (Math.random() - 0.5) * 0.2, p.light.z - 0.2, Math.random() < 0.5 ? '#ffb03a' : '#ff6a1a', true);
    }
    // luces: las del mapa, el farol del héroe y la magia
    const flick = (seed) => 0.88 + Math.sin(now / 110 + seed) * 0.08 + Math.sin(now / 37 + seed * 2) * 0.04;
    const L = [];
    for (const l of built.lights) L.push({ ...l, intensity: l.intensity * flick(l.x) });
    for (const p of built.props || []) if (p.light && p.o.visible) L.push({ ...p.light, intensity: p.light.intensity * flick(p.light.x * 3 + p.light.z) });
    if (me) { L.push({ x: me.rx + 0.5, y: 1.9, z: me.ry + 0.5, color: '#ffd8a8', intensity: map.kind === 'world' ? 1.3 : 1.6, dist: map.kind === 'world' ? 9 : 7.5, shadow: true }); L.push({ x: me.rx + 0.5, y: 1.4, z: me.ry + 0.9, color: '#ffc890', intensity: 0.9, dist: 6 }); }
    for (const e of game.ents.values()) if (e.kind === 'hero' && e.id !== DD.myId) L.push({ x: e.rx + 0.5, y: 1.6, z: e.ry + 0.5, color: '#ffd0a0', intensity: 1, dist: 5 });
    for (const [, o] of lootObjs) if (o.userData.light) L.push({ x: o.position.x, y: 0.6, z: o.position.z, color: o.userData.light, intensity: 0.7, dist: 2.2 });
    for (const F of fx3d) if ((F.f.kind === 'blast' || F.f.kind === 'nova') && now >= F.start) L.push({ x: F.f.x + 0.5, y: 0.8, z: F.f.y + 0.5, color: fxColor(F.f), intensity: 3 * (1 - (now - F.start) / F.dur), dist: 6 });
    if (portalObj) L.push({ x: portalObj.position.x, y: 0.9, z: portalObj.position.z, color: '#7ad0ff', intensity: 1.8, dist: 5 });
    // día y noche en el mundo abierto
    if (map.kind === 'world') {
      const dc = VIEW3D.dayCycle(serverNow());
      game.daycycle = dc;
      const sky = new THREE.Color('#0a1020').lerp(new THREE.Color('#6a8ac8'), dc.light).lerp(new THREE.Color('#c87a4a'), dc.dusk * 0.5);
      const storm = wantWx === 'storm' || wantWx === 'sand' ? 0.55 : wantWx === 'rain' || wantWx === 'mist' ? 0.78 : 1;
      if (wantWx === 'sand') sky.lerp(new THREE.Color('#a8784a'), 0.5);
      stage.scene.background.copy(sky).multiplyScalar(storm);
      stage.scene.fog.color.copy(stage.scene.background);
      stage.scene.fog.near = wantWx === 'sand' ? 8 : wantWx === 'mist' ? 10 : 16; stage.scene.fog.far = wantWx === 'sand' ? 22 : 34;
      stage.hemi.intensity = (0.1 + dc.light * 0.62) * storm;
      stage.hemi.color.set('#3a4a80').lerp(new THREE.Color('#c8d8ff'), dc.light).lerp(new THREE.Color('#ffb070'), dc.dusk * 0.6);
      stage.sun.intensity = dc.sun * 1.1 * storm;
      stage.sun.color.set('#fff0d8').lerp(new THREE.Color('#ff9a50'), dc.dusk);
      stage.sun.position.set(game.cam.x - 8 + dc.t * 16, 14, game.cam.y + 4); stage.sun.target.position.set(game.cam.x, 0, game.cam.y);
      // de noche el farol del héroe y las hogueras se notan más
      const nightBoost = 1 + (1 - dc.light) * 0.2;
      for (const l of L) if (l.dist) l.intensity *= nightBoost;
      const zg = [[1.02, 1.02, 0.95], [0.96, 1.04, 0.92], [0.94, 1.02, 0.9], [1.12, 1.0, 0.84], [0.94, 0.99, 1.08], [1.12, 0.94, 0.86]][zoneId] || [1, 1, 1];
      const nightK = 1 - dc.light;
      stage.grade = {
        gain: [zg[0] * (1 - nightK * 0.12) + dc.dusk * 0.08, zg[1] * (1 - nightK * 0.06), zg[2] * (1 + nightK * 0.12) - dc.dusk * 0.05],
        lift: [0.004 + dc.dusk * 0.01, 0.004, 0.006 + nightK * 0.012],
        saturation: 1.1 - nightK * 0.2, vignette: 0.32 + nightK * 0.2, bloom: 0.5 + nightK * 0.3, tilt: 0.35, focus: 0.5,
      };
      if (wantWx === 'storm' && Math.random() < 0.004) game.flash = now;
      if (game.flash && now - game.flash < 140) stage.hemi.intensity += 2.5;
    } else stage.sun.intensity = 0;
    stage.setLights(L);
    stage.render();

    // ---------- capa 2D ----------
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (cv.width !== Math.round(innerWidth * dpr)) { cv.width = Math.round(innerWidth * dpr); cv.height = Math.round(innerHeight * dpr); }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // viñeta y destello rojo al recibir daño
    const vg = g.createRadialGradient(innerWidth / 2, innerHeight / 2, Math.min(innerWidth, innerHeight) * 0.38, innerWidth / 2, innerHeight / 2, Math.max(innerWidth, innerHeight) * 0.75);
    const hurt = Math.max(0, 1 - (now - game.lastHurt) / 400);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, hurt ? `rgba(120,0,0,${0.3 + hurt * 0.3})` : 'rgba(0,0,0,.45)');
    g.fillStyle = vg; g.fillRect(0, 0, innerWidth, innerHeight);
    if (game.you && game.you.hp / game.you.maxHp < 0.3) { g.fillStyle = `rgba(150,0,0,${0.08 + Math.sin(now / 200) * 0.05})`; g.fillRect(0, 0, innerWidth, innerHeight); }
    drawOverlay(now);
    if (game.showMap) drawMinimap();
    updateBar();
  }

  // Clima según la zona (y la hora): el tiempo cambia cada pocos minutos, igual para todos
  function weatherFor(map, zone, now) {
    if (map.kind !== 'world') return map.theme === 'volcan' ? 'embers' : 'motes';
    const slot = Math.floor(now / 240000);
    const r = (Math.sin(slot * 91.7 + zone * 13.3) * 43758.5453) % 1;
    const roll = Math.abs(r);
    if (zone <= 1) return roll < 0.12 ? 'storm' : roll < 0.4 ? 'rain' : 'none';
    if (zone === 2) return roll < 0.35 ? 'rain' : 'mist';
    if (zone === 3) return roll < 0.4 ? 'sand' : 'none';
    if (zone === 4) return 'snow';
    return 'ash';
  }

  // Nombres, barras de vida, números flotantes y bocadillos, sobre la escena 3D
  function drawOverlay(now) {
    const map = game.map;
    const P = (x, h, z) => stage.project(x, h, z);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (map.kind === 'world') {
      g.font = '600 13px "Pixelify Sans", sans-serif';
      for (const l of map.labels || []) {
        if (Math.abs(l.x - game.cam.x) > 22 || Math.abs(l.y - game.cam.y) > 16) continue;
        if (!game.seen[Math.max(0, Math.min(map.h - 1, l.y + 2)) * map.w + l.x] && !game.seen[l.y * map.w + l.x]) continue;
        const s = P(l.x + 0.5, 1.4, l.y + 2.5);
        g.lineWidth = 3; g.strokeStyle = '#000'; g.strokeText(l.text, s.x, s.y); g.fillStyle = '#f2d36b'; g.fillText(l.text, s.x, s.y);
      }
    }
    const hov = game.hover;
    for (const e of game.ents.values()) {
      const m = models.get(e.id);
      if (!m || !m.obj.visible || !e._top) continue;
      const s = P(e._top.x, e._top.h + 0.15, e._top.z);
      const bw = e.boss ? 70 : 42;
      const hovered = hov && hov.x === e.x && hov.y === e.y;
      if (e.kind === 'enemy') {
        if (e.hp < e.maxHp || hovered || e.elite) {
          g.fillStyle = '#120a08'; g.fillRect(s.x - bw / 2 - 1, s.y - 1, bw + 2, 7);
          g.fillStyle = e.elite ? '#e8a030' : '#c8302a'; g.fillRect(s.x - bw / 2, s.y, bw * Math.max(0, e.hp / e.maxHp), 5);
        }
        if (hovered || game.hoverEnemy === e.id) {
          g.font = '600 12px "Pixelify Sans", sans-serif';
          const label = `${monName(e)} · nv ${e.lvl}`;
          g.lineWidth = 3; g.strokeStyle = '#000'; g.strokeText(label, s.x, s.y - 10); g.fillStyle = e.elite ? '#ffd080' : '#ffc8b0'; g.fillText(label, s.x, s.y - 10);
        }
        if (e.mark) { g.font = '13px serif'; g.fillText('🎯', s.x + bw / 2 + 9, s.y + 2); }
      } else if (e.kind === 'npc') {
        g.font = '600 12px "Pixelify Sans", sans-serif';
        g.lineWidth = 3; g.strokeStyle = '#000'; g.strokeText(e.name, s.x, s.y); g.fillStyle = '#9fe0ff'; g.fillText(e.name, s.x, s.y);
        const mark = npcMark(e.npc);
        if (mark) { g.font = '700 22px "Pixelify Sans", sans-serif'; g.lineWidth = 4; g.strokeText(mark, s.x, s.y - 18); g.fillStyle = mark === '?' ? '#7dff8a' : '#ffd23f'; g.fillText(mark, s.x, s.y - 18); }
      } else if (e.kind === 'pet') {
        g.font = '600 10px "Pixelify Sans", sans-serif';
        g.lineWidth = 3; g.strokeStyle = '#000'; g.strokeText(e.name, s.x, s.y); g.fillStyle = '#ffe0b0'; g.fillText(e.name, s.x, s.y);
        g.fillStyle = '#120a08'; g.fillRect(s.x - 15, s.y + 6, 30, 4); g.fillStyle = '#e8c050'; g.fillRect(s.x - 15, s.y + 6, 30 * Math.max(0, e.hp / e.maxHp), 4);
      } else {
        g.font = '600 12px "Pixelify Sans", sans-serif';
        const isMe = e.id === DD.myId;
        g.lineWidth = 3; g.strokeStyle = '#000'; g.strokeText(e.name, s.x, s.y - 8);
        g.fillStyle = isMe ? '#ffe9a8' : '#f4ead2'; g.fillText(e.name, s.x, s.y - 8);
        if (e.title) { g.font = 'italic 600 10px "Pixelify Sans", sans-serif'; g.strokeText('«' + e.title + '»', s.x, s.y - 21); g.fillStyle = '#e8b84a'; g.fillText('«' + e.title + '»', s.x, s.y - 21); }
        if (!isMe) { g.fillStyle = '#120a08'; g.fillRect(s.x - bw / 2 - 1, s.y - 1, bw + 2, 6); g.fillStyle = '#4cc85c'; g.fillRect(s.x - bw / 2, s.y, bw * Math.max(0, e.hp / e.maxHp), 4); }
        const b = game.bubbles.get(e.id);
        if (b && b.until > now) drawBubble(s.x, s.y - 22, b.text);
      }
    }
    // ficha del objeto del suelo bajo el ratón
    const lh = hov && game.mouseOnMap && game.loot.find((q) => q.x === hov.x && q.y === hov.y && q.it);
    if (lh && game.mouse) { if (game.tipFor !== lh.id) { game.tipFor = lh.id; DD.showItemTip(lh.it, { clientX: game.mouse.x, clientY: game.mouse.y }, 'Pásale por encima para recogerlo'); } }
    else if (game.tipFor) { game.tipFor = null; DD.hideItemTip(); }
    // plantas: nombre al pasar por encima
    if (game.mouse && game.mouseOnMap && game.herbs.length) {
      const h = herbUnder(game.mouse.x, game.mouse.y);
      if (h) {
        const s = P(h.x + 0.5, 0.6, h.y + 0.5);
        const M = PROG.MATS[PROG.HERB_BY_ZONE[h.zone]];
        g.font = '600 12px "Pixelify Sans", sans-serif';
        g.lineWidth = 3; g.strokeStyle = '#000'; g.strokeText(`${M.icon} ${M.name} (clic)`, s.x, s.y); g.fillStyle = '#b8ff9a'; g.fillText(`${M.icon} ${M.name} (clic)`, s.x, s.y);
      }
    }
    for (let i = game.floaters.length - 1; i >= 0; i--) {
      const f = game.floaters[i];
      const life = (now - f.start) / (f.crit ? 1300 : 1100);
      if (life >= 1 || !f.text) { game.floaters.splice(i, 1); continue; }
      const s = P(f.x + 0.5, 1.3 + life * (f.crit ? 1.1 : 0.8), f.y + 0.5);
      // aparecen con un pequeño "golpe" de tamaño; los críticos, enormes
      const pop = life < 0.12 ? 1 + (1 - life / 0.12) * (f.crit ? 0.9 : 0.4) : 1;
      const size = (f.crit ? 28 : f.big ? 19 : 15) * pop;
      g.font = `700 ${Math.round(size)}px "Pixelify Sans", sans-serif`;
      g.globalAlpha = 1 - Math.max(0, life - 0.6) / 0.4;
      const x = s.x + (f.text.length % 3 - 1) * 6;
      g.lineWidth = f.crit ? 6 : 4; g.strokeStyle = f.crit ? '#3a1200' : '#120604'; g.strokeText(f.text, x, s.y);
      if (f.crit) { const gr = g.createLinearGradient(0, s.y - size / 2, 0, s.y + size / 2); gr.addColorStop(0, '#fff6a0'); gr.addColorStop(0.5, '#ffc030'); gr.addColorStop(1, '#ff6a10'); g.fillStyle = gr; }
      else g.fillStyle = f.color;
      g.fillText(f.text, x, s.y);
      if (f.crit) { g.font = '700 11px "Pixelify Sans", sans-serif'; g.lineWidth = 3; g.strokeText('¡CRÍTICO!', x, s.y - size * 0.7); g.fillStyle = '#ffe27a'; g.fillText('¡CRÍTICO!', x, s.y - size * 0.7); }
      g.globalAlpha = 1;
    }
    // cuenta atrás del duelo
    if (game.duelAt) {
      const left = game.duelAt - now;
      if (left > -900) {
        const txt = left > 0 ? String(Math.ceil(left / 1000)) : '¡LUCHA!';
        const k = left > 0 ? 1 - (left % 1000) / 1000 : 1 + (-left) / 900;
        g.globalAlpha = left > 0 ? 1 : Math.max(0, 1 + left / 900);
        g.font = `${Math.round(70 + k * 30)}px "Jacquard 12", serif`;
        g.lineWidth = 6; g.strokeStyle = '#000'; g.strokeText(txt, innerWidth / 2, innerHeight * 0.4);
        g.fillStyle = left > 0 ? '#f2d36b' : '#ff6a4a'; g.fillText(txt, innerWidth / 2, innerHeight * 0.4);
        g.globalAlpha = 1;
      } else game.duelAt = 0;
    }
    // imágenes por segundo
    game.fps.n++;
    if (now - game.fps.t > 1000) { game.fps.v = game.fps.n; game.fps.n = 0; game.fps.t = now; }
    if (DD.gfx && DD.gfx.fps) { g.textAlign = 'left'; g.font = '600 12px monospace'; g.fillStyle = '#7dff8a'; g.fillText(`${game.fps.v} fps`, 10, innerHeight - 12); g.textAlign = 'center'; }
    // botón de pescar junto al agua
    const meE = game.ents.get(DD.myId);
    const nearWater = map.kind === 'world' && meE && [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]].some(([dx, dy]) => WATER_T.has(map.tiles[(meE.y + dy) * map.w + meE.x + dx]));
    const fb = $('#dfish');
    if (fb.classList.contains('hidden') === !!nearWater) fb.classList.toggle('hidden', !nearWater);
    // aviso de zona del mundo
    if (map.zones && game.ents.get(DD.myId)) {
      const me = game.ents.get(DD.myId);
      const z = Number(map.zones[me.y * map.w + me.x]) || 0;
      if (z !== game.zone) { game.zone = z; game.zoneAt = now; }
      const k = (now - (game.zoneAt || 0)) / 3500;
      if (k < 1) {
        const Z = RULES.ZONES[z];
        const lvl = DD.me ? RULES.levelFromXp(DD.me.xp) : 1;
        g.globalAlpha = k < 0.15 ? k / 0.15 : k > 0.75 ? (1 - k) / 0.25 : 1;
        g.font = '44px "Jacquard 12", serif';
        g.lineWidth = 5; g.strokeStyle = '#000'; g.strokeText(Z.name, innerWidth / 2, innerHeight * 0.28);
        g.fillStyle = '#f2d36b'; g.fillText(Z.name, innerWidth / 2, innerHeight * 0.28);
        g.font = '600 16px "Pixelify Sans", sans-serif';
        const danger = lvl < Z.lv[0] - 2;
        const sub = `Nivel ${Z.lv[0]}-${Z.lv[1]}${danger ? ' · ☠️ demasiado peligroso para ti' : ''}`;
        g.lineWidth = 4; g.strokeText(sub, innerWidth / 2, innerHeight * 0.28 + 34); g.fillStyle = danger ? '#ff7a6a' : '#e8dcc4'; g.fillText(sub, innerWidth / 2, innerHeight * 0.28 + 34);
        g.globalAlpha = 1;
      }
    }
  }

  // ¿Tiene una misión para mí? (! nueva, ? para entregar)
  function npcMark(id) {
    const p = DD.me;
    if (!p) return '';
    let mark = '';
    for (const [qid, Q] of Object.entries(RULES.QUESTS)) {
      const a = (p.quests || {})[qid];
      if (a && ((Q.npc === id && a.n >= (Q.goal.n || 1)) || (Q.goal.kind === 'talk' && Q.goal.npc === id))) return '?';
      if (Q.npc === id && !a && !(p.questsDone || []).includes(qid) && (!Q.after || (p.questsDone || []).includes(Q.after)) && RULES.levelFromXp(p.xp) >= (Q.minLevel || 1)) mark = '!';
    }
    return mark;
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
  const MINI = { ',': '#2f4a2a', ';': '#3a5a32', T: '#1a3018', P: '#16281e', w: '#14284a', v: '#24426a', s: '#7a6a4a', h: '#4a6a3a', M: '#5a5a62', '=': '#8a6a3a', b: '#8a6a3a', g: '#3a3430', t: '#6a6a72', R: '#7a7a7e', F: '#ff7a2a', C: '#000000', H: '#ffcf6a', k: '#8a5a3a', D: '#b83a2a', '#': '#1a1618', '.': '#6a6058', '+': '#8a5a2a', '^': '#a04040', '~': '#24427a', '%': '#c8400a', f: '#7a6a2a', x: '#5a4a2a', u: '#6a6258', m: '#4a4a2e', q: '#24301e', y: '#2a2a1a', r: '#4e5a2e', d: '#a8643a', z: '#8a5a3a', o: '#6a4a3a', c: '#3a7a3a', n: '#d8e0e8', i: '#a8c8e0', p: '#8a9aa8', a: '#4a3e3c', e: '#2a2222', l: '#c8400a', W: '#7ad0ff' };
  function drawMinimap() {
    const map = game.map;
    const big = map.kind === 'world' && game.bigMap;
    const k = big ? Math.min((innerWidth - 80) / map.w, (innerHeight - 200) / map.h) : innerWidth <= 820 ? 1 : map.kind === 'world' ? 1.4 : 3.2;
    const mw = map.w * k, mh = map.h * k;
    const x0 = big ? (innerWidth - mw) / 2 : innerWidth - mw - 14, y0 = big ? 90 : innerWidth <= 820 ? 110 : 14;
    const seenC = seenCount;
    if (!game.miniImg || game.miniSeen !== seenC) {
      const c = game.miniImg || document.createElement('canvas');
      c.width = map.w; c.height = map.h;
      const mg = c.getContext('2d');
      mg.clearRect(0, 0, map.w, map.h);
      const img = mg.createImageData(map.w, map.h);
      for (let i = 0; i < map.w * map.h; i++) {
        if (!game.seen[i]) continue;
        const col = parseInt((MINI[map.tiles[i]] || '#333333').slice(1), 16);
        img.data[i * 4] = col >> 16; img.data[i * 4 + 1] = (col >> 8) & 255; img.data[i * 4 + 2] = col & 255; img.data[i * 4 + 3] = 255;
      }
      mg.putImageData(img, 0, 0);
      game.miniImg = c; game.miniSeen = seenC;
    }
    g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(x0 - 4, y0 - 4, mw + 8, mh + 8);
    g.imageSmoothingEnabled = false;
    g.drawImage(game.miniImg, x0, y0, mw, mh);
    g.strokeStyle = '#6a4a2a'; g.lineWidth = 2; g.strokeRect(x0 - 3, y0 - 3, mw + 6, mh + 6);
    if (big) {
      g.font = '600 12px "Pixelify Sans", sans-serif'; g.textAlign = 'center';
      for (const w of map.waystones || []) { if (!DD.me || !DD.me.waystones.includes(w.id)) continue; g.fillStyle = '#7ad0ff'; g.fillRect(x0 + w.x * k - 3, y0 + w.y * k - 3, 6, 6); g.fillStyle = '#fff'; g.fillText(w.name, x0 + w.x * k, y0 + w.y * k - 10); }
    }
    for (const e of game.ents.values()) {
      if (e.kind === 'enemy' && !game.vis[e.y * map.w + e.x]) continue;
      if (e.kind === 'npc') { g.fillStyle = '#9fe0ff'; g.fillRect(x0 + e.x * k - 1.5, y0 + e.y * k - 1.5, 3, 3); continue; }
      g.fillStyle = e.kind === 'hero' ? (e.id === DD.myId ? '#ffe9a8' : '#7ad0ff') : e.kind === 'pet' ? '#e8c050' : e.boss ? '#ff3a2a' : '#c84a3a';
      const sz = e.kind === 'hero' || e.boss ? 4 : 2;
      g.fillRect(x0 + e.x * k - sz / 2, y0 + e.y * k - sz / 2, sz, sz);
    }
    if (game.portal) { g.fillStyle = '#7ad0ff'; g.fillRect(x0 + game.portal.x * k - 2, y0 + game.portal.y * k - 2, 5, 5); }
  }

  // ======================================================================
  //  Joystick táctil (móvil)
  // ======================================================================
  const joy = $('#joy'), knob = $('#joy i');
  let joyId = null, joyC = null;
  joy.addEventListener('pointerdown', (e) => { joyId = e.pointerId; joy.setPointerCapture(e.pointerId); const r = joy.getBoundingClientRect(); joyC = { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 }; moveJoy(e); });
  joy.addEventListener('pointermove', (e) => { if (e.pointerId === joyId) moveJoy(e); });
  const endJoy = () => { joyId = null; knob.style.transform = ''; game.joyDir = null; game.sentDir = 'x'; sendDirJoy(0, 0); };
  joy.addEventListener('pointerup', endJoy); joy.addEventListener('pointercancel', endJoy);
  function moveJoy(e) {
    let dx = e.clientX - joyC.x, dy = e.clientY - joyC.y;
    const d = Math.hypot(dx, dy), max = joyC.r * 0.7;
    if (d > max) { dx = dx / d * max; dy = dy / d * max; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    if (d < 12) return sendDirJoy(0, 0);
    // 8 direcciones (la cámara mira al norte, así que arriba es norte)
    const a = Math.atan2(dy, dx);
    const oct = Math.round(a / (Math.PI / 4));
    const DIRS8 = { 0: [1, 0], 1: [1, 1], 2: [0, 1], 3: [-1, 1], 4: [-1, 0], '-4': [-1, 0], '-3': [-1, -1], '-2': [0, -1], '-1': [1, -1] };
    const [sx, sy] = DIRS8[oct];
    sendDirJoy(sx, sy);
  }
  function sendDirJoy(dx, dy) {
    if (dx || dy) game.joyDir = [dx, dy];
    const key = dx + ',' + dy;
    if (key === game.sentDir) return;
    game.sentDir = key;
    DD.net.send({ t: 'ddir', dx, dy });
  }

  $('#dmount').onclick = () => DD.net.send({ t: 'dmount' });
  window.addEventListener('keydown', (e) => {
    if (!game.active || DD.scene !== 'dungeon' || (document.activeElement && document.activeElement.tagName === 'INPUT')) return;
    if (e.key === 'f' || e.key === 'F') DD.net.send({ t: 'dmount' });
    if ((e.key === 'm' || e.key === 'M') && game.map.kind === 'world') { game.bigMap = !game.bigMap; game.showMap = true; e.stopImmediatePropagation(); }
  }, true);

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
  window.__dTileToScreen = (x, y) => (stage ? stage.project(x + 0.5, 0, y + 0.5) : { x: 0, y: 0 });
})();
