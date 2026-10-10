/* global DD, DUNGEON, DSPRITES, RULES, PROG, THREE, MODELS, VIEW3D */
// Mazmorras y mundo abierto: menú (crear con nivel y tema o unirse a una partida), partida en tiempo real
// con movimiento suave, habilidades, pociones, proyectiles esquivables, avisos de los jefes, luces y botín.
(() => {
  'use strict';

  const T = 16; // píxeles por casilla
  const $ = (s) => document.querySelector(s);
  const monName = (e) => (e.kind === 'hero' ? e.name : (e.elite ? 'Élite: ' : '') + ((RULES.MONSTERS[e.k] || {}).name || e.k));
  const WATER_T = new Set(['w', 'v', 'q', '~']);

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
    game.mates = [...game.ents.values()].filter((e) => e.kind === 'hero' && e.id !== DD.myId).length;
    D.updateParty();
    // música: la del jefe mientras se le vea (y unos segundos después)
    if (boss) game.bossSeen = now;
    const k = game.map && game.map.kind;
    SFX.music(k === 'world' ? (game.bossSeen && now - game.bossSeen < 8000 ? 'boss' : 'world') : k === 'arena' || (game.bossSeen && now - game.bossSeen < 8000) ? 'boss' : 'dungeon');
    D.updateHud();
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
          const tt = tiles[ty * w + tx];
          // las puertas cerradas tapan lo que hay detrás
          if ((OPAQUE.has(tt) || (tt === '+' && !game.openDoors.has(ty * w + tx))) && (tx !== cx || ty !== cy)) break;
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

  const PROJ_COL = { arrow: '#e8dcc0', javelin: '#c8a070', bolt: '#7aff9a', necro: '#9a5aff', fire: '#ff7a2a' };

  // tipo de sonido de cada habilidad, por su nombre
  const CAST_KIND = {};
  for (const list of Object.values(RULES.ABILITIES)) for (const a of list) {
    CAST_KIND[a.name] = a.fx === 'fire' ? 'fire' : a.fx === 'cold' ? 'ice' : a.fx === 'holy' ? 'holy' : a.fx === 'nature' ? 'nature' : a.fx === 'lightning' ? 'storm'
      : /heal/i.test(a.type) ? 'heal' : a.type === 'blink' ? 'shadow' : a.type === 'buff' ? 'shout' : ['strike', 'nova', 'dash', 'cone', 'line'].includes(a.type) ? 'phys' : 'arcane';
  }
  const castKind = (name) => CAST_KIND[name] || 'arcane';

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
            t.flashAt = now;
            if (by) {
              const dx = Math.sign(t.x - by.x), dz = Math.sign(t.y - by.y);
              if (t.kind !== 'hero') { t.kbAt = now; t.kbDx = dx; t.kbDy = dz; t.kbBig = !!ev.crit; }
              const G = gore(t);
              hitBurst((t.rx ?? t.x) + 0.5, (t.ry ?? t.y) + 0.5, dx, dz, G, ev.crit ? 18 : 8);
              if ((ev.crit || ev.dmg > 12) && Math.random() < 0.6) splat((t.rx ?? t.x) + 0.5 + dx * 0.3, (t.ry ?? t.y) + 0.5 + dz * 0.3, G.splat, ev.crit ? 0.45 : 0.3);
            }
            const col = t.kind === 'hero' && t.id === me ? '#ff5a5a' : ev.crit ? '#ffd23f' : ev.kind === 'dot' ? '#b08aff' : ev.kind === 'pet' ? '#ffd8a0' : '#ffffff';
            game.floaters.push({ x: t.x, y: t.y, text: String(ev.dmg) + (ev.block ? ' 🛡' : ''), color: col, big: ev.t === me || ev.crit, crit: !!ev.crit, start: now });
            for (let i = 0; i < (ev.crit ? 14 : 5); i++) spark(t.x + 0.5, t.y + 0.3, t.kind === 'hero' ? '#c83a3a' : (RULES.MONSTERS[t.k] || {}).undead ? '#d8d0b8' : '#9a1a1a');
            if (ev.crit) { ring(t.rx ?? t.x, t.ry ?? t.y, '#ffd23f'); if (ev.by === me) { game.hitstop = now + 75; if (!DD.gfx || DD.gfx.shake) game.shake = now + 200; } }
            if (ev.t === me) { game.lastHurt = now; DD.sfx(ev.block ? 'block' : 'hurt'); if (ev.dmg > (game.you ? game.you.maxHp * 0.15 : 99) && (!DD.gfx || DD.gfx.shake)) game.shake = now + 220; }
          }
        }
        if (by && t && !ev.dodge) {
          by.lunge = now; by.lungeDx = Math.sign(t.x - by.x); by.lungeDy = Math.sign(t.y - by.y);
          if (!ev.kind || ev.kind === 'melee') slash(by, t, by.kind === 'hero' ? (ev.crit ? '#ffd23f' : '#fff0d0') : '#ff6a5a', now, ev.crit);
          if (ev.kind === 'ranged') game.fx.push({ kind: 'arrow', from: { x: by.x, y: by.y }, to: { x: t.x, y: t.y }, start: now, dur: 160 });
          if (ev.kind === 'magic') game.fx.push({ kind: 'bolt', from: { x: by.x, y: by.y }, to: { x: t.x, y: t.y }, start: now, dur: 220, color: '#9ad8ff' });
        }
        if (ev.by === me && ev.dmg && !ev.miss) DD.sfx('hit', { crit: ev.crit });
        else if (ev.by === me && (ev.miss || ev.dodge)) DD.sfx('miss');
        else if (t && t.kind === 'hero' && ev.t !== me && ev.dmg && !ev.miss && !ev.dodge) DD.sfx('hit', { vol: 0.35 });
        break;
      }
      case 'swing': { const e = game.ents.get(ev.id), t = game.ents.get(ev.t); if (e && t) { e.lunge = now; e.lungeDx = Math.sign(t.x - e.x); e.lungeDy = Math.sign(t.y - e.y); } break; }
      case 'cast': {
        const by = game.ents.get(ev.by);
        if (by) { by.castAt = now; for (let i = 0; i < 8; i++) spark(by.x + 0.5, by.y + 0.2, '#fff2a0', true); }
        log(`${who(ev.by)} usa ${ev.name}`, ev.by === me ? 'mine' : '');
        if (ev.by === me || (by && by.kind === 'hero')) { const k = castKind(ev.name), v = ev.by === me ? 1 : 0.45; if (k === 'heal') DD.sfx('heal', { vol: v }); else if (k === 'phys') DD.sfx('swing', { vol: v }); else DD.sfx('cast', { kind: k, vol: v }); }
        break;
      }
      case 'fx': if (ev.kind === 'splash') { splash(ev.x, ev.y, 14); break; } game.fx.push({ ...ev, start: now + (ev.delay || 0), dur: ev.kind === 'aura' ? ev.until : ev.kind === 'blast' || ev.kind === 'nova' ? 420 : 260 }); if (ev.kind === 'aura') game.auras.push({ id: ev.id, until: now + ev.until, radius: ev.radius }); break;
      case 'die': {
        game.dying.set(ev.id, now);
        const G = gore({ k: ev.k, kind: 'enemy' });
        for (let i = 0; i < (ev.boss ? 60 : 14); i++) spark(ev.x + 0.5, ev.y + 0.4, G.bone ? '#d8d0b8' : ev.boss ? (i % 2 ? '#ffd23f' : '#ff6a2a') : G.col, ev.boss);
        // estalla en huesos, ascuas o sangre según lo que sea, y deja su mancha en el suelo
        for (let a = 0; a < 6; a++) hitBurst(ev.x + 0.5, ev.y + 0.5, Math.cos(a), Math.sin(a), G, ev.boss ? 10 : 5);
        splat(ev.x + 0.5, ev.y + 0.5, G.splat, ev.boss ? 1.1 : 0.6);
        if (G.ember) for (let i = 0; i < 20; i++) fxp.emit({ x: ev.x + 0.5 + (Math.random() - 0.5) * 0.6, y: 0.2 + Math.random() * 0.6, z: ev.y + 0.5 + (Math.random() - 0.5) * 0.6, vy: 1 + Math.random() * 1.5, vx: (Math.random() - 0.5) * 0.5, color: Math.random() < 0.5 ? '#ff7a2a' : '#ffd040', size: 0.07, life: 1.2 });
        puff(ev.x + 0.5, ev.y + 0.5, '#6a5a4a', ev.boss ? 20 : 6, 0.5);
        if (ev.boss && (!DD.gfx || DD.gfx.shake)) game.shake = now + 500;
        if (ev.xp) float(ev.x, ev.y, `+${ev.xp} PX`, '#9fe0ff', true);
        if (ev.xp !== 0) log(`${(RULES.MONSTERS[ev.k] || {}).name || ev.k} cae.${ev.xp ? ` +${ev.xp} PX` : ''}`, ev.boss ? 'good big' : 'good');
        DD.sfx('die', { boss: ev.boss });
        break;
      }
      case 'loot': {
        if (ev.gold) float(ev.x, ev.y, `+${ev.gold} 🪙`, '#ffd23f', ev.id === me);
        if (ev.xp && ev.id === me) setTimeout(() => float(ev.x, ev.y, `+${ev.xp} PX`, '#9fe0ff', true), 300);
        if (ev.item && ev.id === me && (ev.item.leg || ev.item.rarity === 'unico' || ev.item.rarity === 'conjunto')) DD.emit('bigloot', ev.item);
        if (ev.item) { float(ev.x, ev.y, ev.item.name, ev.item.leg ? RULES.LEGENDARY_COLOR : DSPRITES.RARITY[ev.item.rarity], true); log(`${who(ev.id)} recoge «${ev.item.name}» (${RULES.RARITIES[ev.item.rarity].name.toLowerCase()})`, 'loot-' + ev.item.rarity); }
        if (ev.cons) float(ev.x, ev.y, RULES.CONSUMABLES[ev.cons].name, '#ff8a8a');
        if (ev.mat) { const M = PROG.MATS[ev.mat]; float(ev.x, ev.y, `+${ev.n} ${M.icon}`, ev.mat === 'polvo' ? '#ffe27a' : ev.mat === 'esencia' ? '#7ad0ff' : '#c8c8d0', ev.id === me); }
        if (ev.id === me) { if (ev.item) DD.sfx('item', { rarity: ev.item.rarity }); else if (ev.cons) DD.sfx('potion'); else DD.sfx('coin'); }
        break;
      }
      case 'chest': for (let i = 0; i < 16; i++) spark(ev.x + 0.5, ev.y + 0.4, '#ffd23f', true); DD.sfx('chest'); break;
      case 'heal': { const t = game.ents.get(ev.id); if (t) float(t.x, t.y, '+' + ev.amount, '#7dff8a', ev.id === me); break; }
      case 'eheal': { const t = game.ents.get(ev.id); if (t) { float(t.x, t.y, '+' + ev.amount, '#7dff8a'); game.fx.push({ kind: 'heal', x: t.x, y: t.y, start: now, dur: 400 }); } break; }
      case 'proj': game.projs.push({ ...ev, start: now }); break;
      case 'tele': game.teles.push({ ...ev, start: now }); DD.sfx('tele'); break;
      case 'boom': {
        const t = game.teles.find((x) => x.id === ev.id);
        if (t) { for (const [x, y] of t.cells) if (Math.random() < 0.35) spark(x + 0.5, y + 0.5, t.kind === 'breath' ? '#ff7a2a' : '#c8b8a8'); game.teles.splice(game.teles.indexOf(t), 1); }
        game.shake = now + 260;
        DD.sfx('boom');
        break;
      }
      case 'special': log(`${ev.name}: ${{ slam: '¡golpe sísmico!', nova: '¡nova de muerte!', breath: '¡aliento de fuego!', volley: '¡andanada!', summon: 'llama a sus esbirros', charge: '¡embiste!' }[ev.s] || ''}`, 'hurt'); break;
      case 'summon': for (let i = 0; i < 10; i++) spark(ev.x + 0.5, ev.y + 0.5, '#7cff6a', true); break;
      case 'portal': log(`¡${ev.name} ha caído! Se abre un portal de salida.`, 'good big'); DD.toast('🏆 ¡Jefe derrotado! Recoge el botín y cruza el portal.'); DD.sfx('portal'); for (let i = 0; i < 30; i++) spark(ev.x + 0.5, ev.y + 0.5, '#7ad0ff', true); break;
      case 'down': log(`${who(ev.id)} cae.`, 'hurt'); DD.sfx('down', { vol: ev.id === me ? 1 : 0.6 }); if (ev.id !== me) DD.toast(`💀 ${who(ev.id)} ha caído y vuelve a la taberna.`); break;
      case 'ping':
        (game.pings = game.pings || []).push({ x: ev.x, y: ev.y, k: ev.k, id: ev.id, start: now });
        DD.sfx('ping', { vol: ev.id === me ? 0.6 : 1 });
        if (ev.id !== me) log(`${who(ev.id)} ${ev.k === 'danger' ? '⚠️ avisa de peligro' : '📍 marca un sitio'}.`, 'mine');
        break;
      case 'petdown': log(`${ev.name} huye malherido; volverá en 30 s.`, 'hurt'); break;
      case 'petskill': { const pt = game.ents.get(ev.id); if (pt) { float(pt.x, pt.y, ev.name + '!', '#ffb040', ev.owner === me); for (let i = 0; i < 10; i++) spark(pt.x + 0.5, pt.y + 0.4, '#ffb040', true); } break; }
      case 'roll': { const e = game.ents.get(ev.id); if (e) { e.rollAt = now; puff(ev.from.x + 0.5, ev.from.y + 0.5, dustColor(ev.from.x, ev.from.y), 6, 0.6); } if (ev.id === me) DD.sfx('roll'); break; }
      case 'fish': { const e = game.ents.get(ev.id); if (e) e.fishAt = { x: ev.x, y: ev.y }; splash(ev.x, ev.y, 4); break; }
      case 'bite': { const e = game.ents.get(ev.id); if (e && e.fishAt) splash(e.fishAt.x, e.fishAt.y, 10); break; }
      case 'fishend': { const e = game.ents.get(ev.id); if (e) e.fishAt = null; if (ev.id === me) $('#dbite').classList.add('hidden'); break; }
      case 'worldboss': {
        log(`🌋 ¡${ev.name} ha aparecido!`, 'hurt big');
        banner(`🌋 ${ev.name}`, '¡Un jefe de mundo ha aparecido! Únete a la batalla.');
        DD.sfx('worldboss');
        break;
      }
      case 'join': if (ev.id !== me) log(`${who(ev.id)} entra.`); break;
      case 'leg': { const h = game.ents.get(ev.id); if (h) float(h.x, h.y, ev.name + '!', RULES.LEGENDARY_COLOR, ev.id === me); if (ev.id === me) DD.sfx('cast', { kind: 'holy', vol: 0.6 }); break; }
      case 'door': DD.sfx('door', { vol: 0.8 }); game.openDoors.add(ev.y * game.map.w + ev.x); updateVision(); fogDirty = true; break;
    }
  }

  DD.on('dstart', (m) => {
    game.active = true;
    D.rejoinBtn.classList.add('hidden');
    game.pings = [];
    game.map = m.dungeon;
    game.props = m.dungeon.props || [];
    game.ents.clear(); game.floaters = []; game.fx = []; game.projs = []; game.teles = []; game.particles = []; game.auras = [];
    game.log = []; game.statics = null; game.boss = null; game.bossSeen = 0; game.heardLoot = new Set(); game.camInit = false; game.keys.clear(); game.sentDir = '0,0';
    game.seen = new Uint8Array(m.dungeon.w * m.dungeon.h);
    game.vis = new Uint8Array(m.dungeon.w * m.dungeon.h);
    game.openDoors = new Set(m.dungeon.doors || []);
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
    D.buildBar();
    $('#dmount').classList.toggle('hidden', !(m.dungeon.kind === 'world' && DD.me && DD.me.mount));
    DD.toast(m.dungeon.kind === 'world'
      ? `${m.dungeon.name}: explora, pesca junto al agua (🎣/G), recoge hierbas y vuelve al pueblo (casa iluminada) para descansar.`
      : m.dungeon.kind === 'arena' ? 'Duelo: clic en tu rival para atacarle, habilidades con 1-8, Espacio para esquivar. ¡Gana quien quede en pie!'
      : 'Clic para andar, clic en un enemigo para atacarlo. 1-8 habilidades, Q/E pociones, Espacio esquiva, Alt+clic o P marca un sitio para el grupo. Derrota al jefe para abrir el portal.');
  });
  DD.on('dsnap', (m) => { if (game.active) { applySnap(m); updateVision(); } });
  DD.on('dme', (m) => { game.you = m; game.youAt = performance.now(); D.updateHud(); });
  DD.on('dwhisper', (m) => DD.toast(m.text));
  DD.on('dbite', () => { $('#dbite').classList.remove('hidden'); DD.sfx('bite'); });
  DD.on('me', () => { if (game.active) D.buildBar(); });
  DD.on('dexit', (m) => {
    game.active = false;
    if (m.silent) return; // pasa de una mazmorra al mundo: llega otro dstart
    viewEl.classList.add('hidden');
    VIEW3D.show(false);
    DD.setScene('tavern');
    if (m.reason === 'win') DD.toast('🏆 ¡Mazmorra completada!');
    else if (m.reason === 'down') {
      DD.toast(`💀 Has caído${m.lost ? ` y pierdes ${m.lost} de oro` : ''}. Vuelves a la taberna.`);
      // si quedaban amigos dentro, se puede volver con ellos
      if (game.map && game.map.kind === 'dungeon' && game.mates > 0) D.offerRejoin(game.map.id);
    }
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
    const K = DD.keys || {};
    if (/^[1-8]$/.test(k)) { const a = D.abilities()[Number(k) - 1]; if (a) D.castSkill(a); return; }
    if (k === (K.map || 'm')) { game.showMap = !game.showMap; return; }
    if (k === (K.ping || 'p') && game.mouse0) { const t = screenToTile(game.mouse0.x, game.mouse0.y); if (t.x >= 0) DD.net.send({ t: 'dping', x: t.x, y: t.y, k: e.shiftKey ? 'danger' : 'here' }); return; }
    if (k === (K.roll || ' ')) { e.preventDefault(); doRoll(); return; }
    if (k === 'g') { DD.net.send({ t: 'dfish' }); return; }
    if (k === (K.inv || 'i') || k === 'b') { DD.emit('open-char', 'equipo'); return; }
    if (k === (K.sheet || 'c')) { /* C: pergamino de sanación si lo hay, si no la ficha */ if (!(DD.me && DD.me.cons['perg-sanacion']) || K.sheet !== 'c') { DD.emit('open-char', 'ficha'); return; } }
    // pociones: sus teclas se pueden cambiar en Ajustes
    const consKey = k === (K.potion || 'q') ? 'Q' : k === (K.energy || 'e') ? 'E' : k === 'q' || k === 'e' ? '' : k.toUpperCase();
    const cons = D.consList().filter((c) => c.key === consKey);
    if (cons.length) { const pick = consKey === 'Q' && e.shiftKey ? cons[cons.length - 1] : cons[0]; D.useCons(pick.id); return; }
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
    // cursor según lo que hay debajo: atacar, hablar, abrir o recoger
    let cur = en ? 'attack' : '';
    if (!cur && stage && entUnder(e.clientX, e.clientY, ['npc'])) cur = 'talk';
    const h = game.hover;
    if (!cur && h && game.map) {
      const t = game.map.tiles[h.y * game.map.w + h.x];
      if (t === '+' && !game.openDoors.has(h.y * game.map.w + h.x)) cur = 'use';
      else if ((game.chests || []).some((c) => c.x === h.x && c.y === h.y && !c.open) || (game.loot || []).some((l) => l.x === h.x && l.y === h.y)) cur = 'use';
    }
    if (cv.dataset.cur !== cur) cv.dataset.cur = cur;
  });
  cv.addEventListener('pointerleave', () => { game.mouseOnMap = false; });
  cv.addEventListener('pointerdown', (e) => {
    if (!game.active || e.button === 2) return;
    if (e.button === 1 || e.altKey) {
      e.preventDefault();
      const t = screenToTile(e.clientX, e.clientY);
      if (t.x >= 0) DD.net.send({ t: 'dping', x: t.x, y: t.y, k: e.shiftKey ? 'danger' : 'here' });
      return;
    }
    game.hover = screenToTile(e.clientX, e.clientY);
    const r = clickAt(e.clientX, e.clientY, false);
    // mantener pulsado sobre el suelo: el héroe sigue al ratón
    if (r === 'go') {
      clearInterval(holding);
      holding = setInterval(() => { if (game.mouse) clickAt(game.mouse.x, game.mouse.y, true); }, 220);
    }
  });
  window.addEventListener('pointerup', () => { clearInterval(holding); holding = null; });
  cv.addEventListener('pointermove', (e) => { game.mouse0 = { x: e.clientX, y: e.clientY }; if (holding) game.mouse = game.mouse0; });
  cv.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });


  // ======================================================================
  //  Dibujo en 3D (Three.js) + capa 2D con nombres, barras y números
  // ======================================================================
  let stage = null, built = null, fog = null;
  const doorObjs = []; // puertas de la mazmorra: { obj, i, leaf }
  const models = new Map();   // id -> { obj, key, hitScale }
  const lootObjs = new Map(), chestObjs = new Map(), teleObjs = new Map(), projObjs = new Map();
  let portalObj = null, fogDirty = true, seenCount = -1, mist = null;
  const fx3d = [];
  let fxp = null, dustp = null, wx = null, hoverRing = null;     // chispas (aditivas), polvo/humo y clima
  const herbObjs = new Map(), corpses = [];

  function ensureStage() {
    if (stage) return;
    stage = VIEW3D.makeStage({ offset: [0, 9.5, 7.2], ambient: 0.3, sky: '#5a6aa0', ground: '#140c0a', lights: 10, sun: 0.0001 });
    stage.sun.castShadow = false;
    fxp = VIEW3D.particles(stage.scene, 1400, true);
    dustp = VIEW3D.particles(stage.scene, 800, false);
    wx = VIEW3D.weather(stage.scene);
    // anillo bajo lo que hay debajo del ratón: rojo para enemigos, dorado para cofres y botín
    hoverRing = new THREE.Mesh(new THREE.RingGeometry(0.36, 0.46, 32), new THREE.MeshBasicMaterial({ color: '#ff3a2a', transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
    hoverRing.rotation.x = -Math.PI / 2; hoverRing.renderOrder = 6; hoverRing.layers.set(1); hoverRing.visible = false;
    stage.scene.add(hoverRing);
    window.__stage = stage;
  }

  function clearScene() {
    if (built) { stage.scene.remove(built.group); built = null; }
    for (const d of doorObjs) stage.scene.remove(d.obj);
    doorObjs.length = 0;
    if (fog) { stage.scene.remove(fog.mesh); fog = null; }
    if (mist) { stage.scene.remove(mist.mesh); mist = null; }
    for (const m of [...models.values(), ...lootObjs.values(), ...chestObjs.values(), ...teleObjs.values(), ...projObjs.values()]) stage.scene.remove(m.obj || m);
    models.clear(); lootObjs.clear(); chestObjs.clear(); teleObjs.clear(); projObjs.clear();
    for (const f of fx3d) stage.scene.remove(f.obj);
    for (const d of decals) stage.scene.remove(d.m);
    decals.length = 0;
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
    // mazmorras oscuras: poca luz ambiente (con el color del tema) y que manden las antorchas y el farol
    stage.hemi.intensity = world ? 0.62 : game.map.kind === 'arena' ? 0.3 : T.amb || 0.16;
    stage.grade = world ? null : GRADES[game.map.kind === 'arena' ? 'arena' : game.map.theme] || null;
    stage.hemi.color.set(world ? '#7a8ac0' : T.sky);
    stage.hemi.groundColor.set(world ? '#2a2a1a' : T.ground || '#140c0a');
    // neblina baja que se arrastra por el suelo
    if (!world && T.mist && (!DD.gfx || DD.gfx.weather !== false)) {
      mist = VIEW3D.mistLayer(game.map, T.mist, T.mistA, 0.1);
      stage.scene.add(mist.mesh);
      fog.mesh.position.y = Math.max(fog.mesh.position.y, 0.16); // lo no explorado tapa también la neblina
    }
    // los personajes del mundo
    for (const n of game.map.npcs || []) game.ents.set('npc:' + n.id, { id: 'npc:' + n.id, npc: n.id, kind: 'npc', name: n.name, look: n.look, x: n.x, y: n.y, rx: n.x, ry: n.y, fx: n.x, fy: n.y, t0: 0, dur: 1, dir: 'S', alive: true, static: true });
    // puertas de madera en los umbrales: cerradas hasta que llega un héroe
    doorObjs.length = 0;
    const tl = game.map.tiles, W = game.map.w;
    for (let i = 0; i < tl.length; i++) {
      if (tl[i] !== '+') continue;
      const x = i % W, y = (i / W) | 0;
      const solid = (c) => c === '#' || c === undefined;
      const alongX = solid(tl[i - 1]) && solid(tl[i + 1]); // paredes a izquierda y derecha: la puerta cruza en x
      const d = doorModel(game.map.theme);
      d.position.set(x + 0.5, 0, y + 0.5);
      if (!alongX) d.rotation.y = Math.PI / 2;
      stage.scene.add(d);
      doorObjs.push({ obj: d, i, leaf: d.userData.leaf, open: game.openDoors.has(i) });
      if (game.openDoors.has(i)) d.userData.leaf.rotation.y = -1.75;
    }
    fogDirty = true; seenCount = -1;
    VIEW3D.show(true);
  }

  // Puerta con marco: hoja de tablones con herrajes que gira sobre la bisagra
  function doorModel(theme) {
    const g = new THREE.Group();
    const lin = (h) => '#' + new THREE.Color(h).convertSRGBToLinear().getHexString();
    const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: lin(c), roughness: o.r ?? 0.8, metalness: o.m || 0 });
    const wood = M(theme === 'cripta' ? '#4a3a2e' : theme === 'volcan' || theme === 'abismo' ? '#3a2620' : '#6a4426'), dark = M('#3a2414'), iron = M('#3a3a40', { r: 0.45, m: 0.8 });
    const stone = M(theme === 'cuevas' ? '#5e4c3a' : theme === 'nido' ? '#44523a' : '#6a6870');
    const box = (w, h, d, m, x, y, z, par = g) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; par.add(o); return o; };
    // marco de piedra
    box(0.14, 1.32, 0.3, stone, -0.5, 0.66, 0); box(0.14, 1.32, 0.3, stone, 0.5, 0.66, 0); box(1.14, 0.16, 0.32, stone, 0, 1.3, 0);
    // hoja: gira sobre la bisagra de la izquierda
    const leaf = new THREE.Group(); leaf.position.set(-0.43, 0, 0); g.add(leaf);
    for (let k = 0; k < 4; k++) box(0.215, 1.2, 0.07, k % 2 ? wood : dark, 0.11 + k * 0.215, 0.62, 0, leaf);
    for (const y of [0.25, 1.0]) box(0.88, 0.07, 0.09, iron, 0.44, y, 0, leaf);
    for (const y of [0.25, 1.0]) for (const x of [0.08, 0.8]) { const r = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), iron); r.position.set(x, y, 0.05); leaf.add(r); }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 14), iron); ring.position.set(0.72, 0.6, 0.06); leaf.add(ring);
    g.userData.leaf = leaf;
    return g;
  }

  // Gradación de color por tema: frío en la cripta, cálido en la guarida del dragón…
  const GRADES = {
    cripta: { gain: [0.92, 0.98, 1.1], lift: [0, 0.005, 0.02], saturation: 0.95, vignette: 0.5, bloom: 0.6 },
    cuevas: { gain: [1.06, 1.0, 0.9], lift: [0.01, 0.006, 0], saturation: 1.08, vignette: 0.45 },
    fortaleza: { gain: [1.05, 0.97, 0.9], lift: [0.012, 0.004, 0], saturation: 1.0, vignette: 0.45 },
    nido: { gain: [0.95, 1.06, 0.9], lift: [0, 0.01, 0], saturation: 1.05, vignette: 0.5 },
    volcan: { gain: [1.12, 0.96, 0.82], lift: [0.02, 0.004, 0], saturation: 1.15, vignette: 0.5, bloom: 0.75 },
    abismo: { gain: [1.18, 0.9, 0.8], lift: [0.03, 0, 0], saturation: 1.2, vignette: 0.58, bloom: 0.85 },
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
      const it = l.it || {};
      const col = it.leg ? RULES.LEGENDARY_COLOR : MODELS.RARITY[l.r] || '#d8d4c8';
      let o = null;
      // armas y escudos con su modelo de verdad (tipo, nivel y variante); el resto, una caja del color del material
      if ((it.slot === 'arma' || it.slot === 'mano') && window.WEAPON3D) o = WEAPON3D.build(it.base, it.tier || 0, l.r, { sk: it.sk });
      if (!o && it.slot === 'arma') o = MODELS.weapon(it.base, l.r);
      if (o) { o.rotation.z = Math.PI / 2; o.position.y = 0.12; o.scale.setScalar(0.8); g.add(o); }
      else MODELS.mesh(MODELS.box(0.22, 0.16, 0.22), MODELS.mat(it.slot === 'mano' ? '#7a2222' : it.type === 'placas' ? '#a8aeb8' : it.type === 'malla' ? '#7e8692' : it.type === 'cuero' ? '#6a4226' : it.slot === 'amuleto' || it.slot === 'anillo' ? '#c8a040' : '#6a4aa0', { metal: it.type === 'placas' ? 0.6 : 0 }), 0, 0.1, 0, g);
      // haz de luz: más alto y ancho cuanto mejor es el objeto (los legendarios, un pilar naranja que se ve de lejos)
      const plain = ['inferior', 'normal', 'superior'].includes(l.r);
      const great = it.leg || l.r === 'unico' || l.r === 'conjunto';
      const H = plain ? 0.6 : it.leg ? 6 : great ? 4 : l.r === 'raro' ? 2.8 : 1.8;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(great ? 0.09 : 0.05, great ? 0.2 : 0.12, H, 8, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: plain ? 0.25 : great ? 0.6 : 0.45, depthWrite: false, side: THREE.DoubleSide, blending: great ? THREE.AdditiveBlending : THREE.NormalBlending }));
      beam.position.y = H / 2;
      beam.layers.set(1);
      g.add(beam);
      if (great) {
        // anillo en el suelo que late
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.32, 24), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
        ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; ring.layers.set(1);
        g.add(ring); g.userData.ring = ring; g.userData.beam = beam;
      }
      g.userData.light = plain ? null : col;
      g.userData.great = great;
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
  // ---------- Golpes con peso ----------
  // Qué suelta cada familia al recibir un golpe: sangre, huesos y polvo, o ascuas
  function gore(e) {
    const M = (e && RULES.MONSTERS[e.k]) || {};
    if (!e || e.kind === 'hero') return { col: '#b02a2a', alt: '#6a0a0a', splat: '#4a0606' };
    if (M.undead || M.fam === 'muerto') return { col: '#e8e0c8', alt: '#9a9080', bone: true, splat: '#2a2620' };
    if (M.fam === 'demonio') return { col: '#ff8a2a', alt: '#ffd040', ember: true, splat: '#140604' };
    if (/spider|arana|araña|slime|ooze/.test(e.k || '')) return { col: '#8aff4a', alt: '#3a8a1a', splat: '#1e3a0a' };
    return { col: '#a01818', alt: '#5a0808', splat: '#3a0404' };
  }
  // Chorro de partículas que sale en la dirección del golpe (dx, dz)
  function hitBurst(x, z, dx, dz, G, n) {
    if (!dustp || !fxp) return;
    for (let i = 0; i < n; i++) {
      const sp = 1 + Math.random() * 2.2;
      const o = { x: x + (Math.random() - 0.5) * 0.2, y: 0.45 + Math.random() * 0.4, z: z + (Math.random() - 0.5) * 0.2, vx: dx * sp + (Math.random() - 0.5) * 1.6, vy: 1 + Math.random() * 2.2, vz: dz * sp + (Math.random() - 0.5) * 1.6, color: Math.random() < 0.6 ? G.col : G.alt, size: G.bone ? 0.06 + Math.random() * 0.06 : 0.05 + Math.random() * 0.05, life: 0.5 + Math.random() * 0.5, grav: G.ember ? -1 : 9 };
      (G.ember ? fxp : dustp).emit(o);
    }
  }
  // Manchas en el suelo (sangre, huesos, quemaduras) que se borran poco a poco
  const decals = [];
  const decalGeo = new THREE.PlaneGeometry(1, 1);
  // textura de salpicadura (blanca, se tiñe con el color de cada mancha)
  let splatTex = null;
  function splatTexture() {
    if (splatTex) return splatTex;
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = '#fff';
    const blob = (cx, cy, r) => { x.beginPath(); for (let a = 0; a <= 6.3; a += 0.35) { const rr = r * (0.75 + Math.random() * 0.4); x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } x.fill(); };
    blob(64, 64, 30);
    for (let i = 0; i < 9; i++) { const a = Math.random() * 6.3, d = 30 + Math.random() * 26; blob(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 3 + Math.random() * 7); }
    splatTex = new THREE.CanvasTexture(c);
    return splatTex;
  }
  function splat(x, z, color, size = 0.5) {
    if (!stage || (DD.gfx && DD.gfx.weather === false)) return;
    const m = new THREE.Mesh(decalGeo, new THREE.MeshBasicMaterial({ color, map: splatTexture(), transparent: true, opacity: 0.75, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.rotation.z = Math.random() * 6;
    m.scale.set(size * (0.8 + Math.random() * 0.5), size * (0.6 + Math.random() * 0.5), 1);
    m.position.set(x, built && built.gl ? 0.135 : 0.025, z);
    m.renderOrder = 3; m.layers.set(1);
    stage.scene.add(m);
    decals.push({ m, start: performance.now() });
    if (decals.length > 40) stage.scene.remove(decals.shift().m);
  }
  // Estela del arma: un arco de luz que barre delante del que golpea
  const slashGeo = new THREE.RingGeometry(0.55, 0.8, 24, 1, -1.15, 2.3);
  function slash(by, t, color, now, big) {
    if (!stage) return;
    const dx = t.x - by.x, dz = t.y - by.y, len = Math.hypot(dx, dz) || 1;
    const grp = new THREE.Group();
    const m = new THREE.Mesh(slashGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.rotation.x = -Math.PI / 2 + 0.35;
    grp.add(m);
    grp.position.set((by.rx ?? by.x) + 0.5, 0.62, (by.ry ?? by.y) + 0.5);
    const base = Math.atan2(-dz / len, dx / len);
    const side = Math.random() < 0.5 ? 1 : -1;
    VIEW3D.fxLayer(grp);
    stage.scene.add(grp);
    fx3d.push({ f: { kind: 'slash' }, obj: grp, start: now, dur: big ? 260 : 200, upd(k) {
      grp.rotation.y = base + side * (0.9 - k * 1.8) * 0.6;
      grp.scale.setScalar((big ? 1.25 : 1) * (0.85 + k * 0.3));
      m.material.opacity = 0.9 * (1 - k) * (1 - k);
    } });
  }
  // Destello blanco del modelo al recibir un golpe (los materiales se copian la primera vez)
  const WHITE = new THREE.Color('#ffffff');
  const HOVER = new THREE.Color('#ff3a2a');
  function setFlash(o, k, col = WHITE) {
    if (!o.userData.flashMats) {
      if (k <= 0) return;
      const list = [];
      o.traverse((c) => {
        if (!c.isMesh || !c.material) return;
        // clone() no copia los retoques del shader (teñido de pelo y ropa): se pasan a mano
        const cl = (x) => { const y = x.clone(); y.onBeforeCompile = x.onBeforeCompile; if (x.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey) y.customProgramCacheKey = x.customProgramCacheKey; return y; };
        c.material = Array.isArray(c.material) ? c.material.map(cl) : cl(c.material);
        for (const mm of [].concat(c.material)) if (mm.emissive) list.push({ m: mm, e0: mm.emissive.clone(), i0: mm.emissiveIntensity });
      });
      o.userData.flashMats = list;
    }
    if (!k && !o.userData.flashing) return;
    for (const f of o.userData.flashMats) { f.m.emissive.copy(f.e0).lerp(col, k); f.m.emissiveIntensity = f.i0 + (1.4 - f.i0) * k; }
    o.userData.flashing = k > 0;
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
    const dark = map.kind === 'dungeon';
    // cámara que sigue al héroe
    const tx = me ? me.rx + 0.5 : map.w / 2, tz = me ? me.ry + 0.5 : map.h / 2;
    if (!game.camInit) { game.cam = { x: tx, y: tz }; game.camInit = !!me; }
    game.cam.x += (tx - game.cam.x) * Math.min(1, dt * 6); game.cam.y += (tz - game.cam.y) * Math.min(1, dt * 6);
    const zoom = (innerWidth <= 820 ? 1.18 : 1) * (game.zoom || 1) * (DD.camZoom || 1);
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
      // retroceso al recibir un golpe
      if (now - (e.kbAt || 0) < 180) { const f = Math.sin((now - e.kbAt) / 180 * Math.PI) * (e.kbBig ? 0.22 : 0.12); lx += e.kbDx * f; lz += e.kbDy * f; }
      o.position.set(e.rx + 0.5 + lx, 0, e.ry + 0.5 + lz);
      // destello blanco al recibir un golpe; brillo rojo si el ratón está encima
      const fk = e.flashAt ? Math.max(0, 1 - (now - e.flashAt) / 130) : 0;
      if (fk > 0) setFlash(o, fk);
      else if (e.id === game.hoverEnemy && game.mouseOnMap) setFlash(o, 0.22 + 0.06 * Math.sin(now / 120), HOVER);
      else setFlash(o, 0);
      o.userData.k = e.k;
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
      if (game.dying.has(id) && m.obj.visible) corpses.push({ obj: m.obj, start: game.dying.get(id), y0: m.obj.rotation.y, side: Math.random() < 0.5 ? -1 : 1, G: gore({ k: m.obj.userData.k, kind: 'enemy' }) });
      else stage.scene.remove(m.obj);
      game.dying.delete(id);
      models.delete(id);
    }
    for (let i = corpses.length - 1; i >= 0; i--) {
      const c = corpses[i];
      setFlash(c.obj, Math.max(0, 1 - (now - c.start) / 160));
      // los demonios se deshacen en ascuas
      if (c.G && c.G.ember && Math.random() < 0.6) fxp.emit({ x: c.obj.position.x + (Math.random() - 0.5) * 0.5, y: 0.2 + Math.random() * 0.8, z: c.obj.position.z + (Math.random() - 0.5) * 0.5, vy: 1.2, color: Math.random() < 0.5 ? '#ff7a2a' : '#ffb040', size: 0.06, life: 0.9 });
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

    // anillo bajo el ratón
    {
      let hx = null, hz = null, col = '#ff3a2a';
      const he = game.mouseOnMap && game.hoverEnemy && game.ents.get(game.hoverEnemy);
      if (he) { hx = he.rx + 0.5; hz = he.ry + 0.5; }
      else if (game.mouseOnMap && game.hover && ((game.chests || []).some((c) => c.x === game.hover.x && c.y === game.hover.y && !c.open) || (game.loot || []).some((l) => l.x === game.hover.x && l.y === game.hover.y))) { hx = game.hover.x + 0.5; hz = game.hover.y + 0.5; col = '#ffd23f'; }
      hoverRing.visible = hx !== null;
      if (hoverRing.visible) {
        hoverRing.position.set(hx, built.gl ? 0.15 : 0.05, hz);
        hoverRing.material.color.set(col);
        const k = 1 + 0.08 * Math.sin(now / 140); hoverRing.scale.set(k * (he && he.boss ? 1.6 : 1), k * (he && he.boss ? 1.6 : 1), 1);
        hoverRing.rotation.z = now / 900;
      }
    }
    // botín
    const lootIds = new Set();
    for (const l of game.loot) {
      if (!game.seen[l.y * map.w + l.x]) continue;
      lootIds.add(l.id);
      let o = lootObjs.get(l.id);
      if (!o) {
        o = lootModel(l); stage.scene.add(o); lootObjs.set(l.id, o);
        // al caer algo bueno suena a botín (una vez por objeto)
        if (l.r && !game.heardLoot.has(l.id)) {
          game.heardLoot.add(l.id);
          if (l.it && l.it.leg) { DD.sfx('item', { rarity: 'unico' }); setTimeout(() => DD.sfx('levelup', { vol: 0.6 }), 250); }
          else if (['raro', 'unico', 'conjunto'].includes(l.r)) DD.sfx('item', { rarity: l.r, vol: 0.8 });
        }
      }
      o.position.set(l.x + 0.5, Math.sin(now / 300 + l.x) * 0.03, l.y + 0.5);
      if (o.userData.ring) { const k = 1 + 0.25 * Math.sin(now / 220); o.userData.ring.scale.set(k, k, k); o.userData.beam.material.opacity = 0.45 + 0.2 * Math.sin(now / 300); }
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
    // puertas: se ven si la casilla se ha visto; al abrirse, la hoja gira
    for (const d of doorObjs) {
      d.obj.visible = !!game.seen[d.i];
      const target = game.openDoors.has(d.i) ? -1.75 : 0;
      d.leaf.rotation.y += (target - d.leaf.rotation.y) * Math.min(1, dt * 5);
    }
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
      if (F.upd) { F.upd(k); continue; }
      if (f.kind === 'blast' || f.kind === 'nova') { F.obj.position.set(f.x + 0.5, 0.3, f.y + 0.5); F.obj.scale.setScalar(((f.radius || 1) + 0.5) * (0.3 + k * 0.7)); F.obj.material.opacity = 0.5 * (1 - k); }
      else if (f.kind === 'bolt' || f.kind === 'arrow') { const q = Math.min(1, k * 1.5); F.obj.position.set(f.from.x + 0.5 + (f.to.x - f.from.x) * q, 0.7, f.from.y + 0.5 + (f.to.y - f.from.y) * q); F.obj.lookAt(f.to.x + 0.5, 0.7, f.to.y + 0.5); }
      else if (f.kind === 'dash' || f.kind === 'blink') { const dx = f.to.x - f.from.x, dz = f.to.y - f.from.y; F.obj.position.set((f.from.x + f.to.x) / 2 + 0.5, 0.5, (f.from.y + f.to.y) / 2 + 0.5); F.obj.scale.z = Math.hypot(dx, dz); F.obj.lookAt(f.to.x + 0.5, 0.5, f.to.y + 0.5); F.obj.material.opacity = 0.7 * (1 - k); }
      else { const e = f.id && game.ents.get(f.id); const px = e ? e.rx : f.x, pz = e ? e.ry : f.y; F.obj.position.set(px + 0.5, 0.1 + k * (f.kind === 'heal' ? 1.2 : 0.3), pz + 0.5); F.obj.scale.setScalar(0.5 + k); F.obj.material.opacity = 0.9 * (1 - k); }
    }
    for (let i = decals.length - 1; i >= 0; i--) {
      const d = decals[i], k = (now - d.start) / 9000;
      if (k >= 1) { stage.scene.remove(d.m); decals.splice(i, 1); continue; }
      d.m.material.opacity = 0.75 * Math.min(1, (1 - k) * 2.5);
    }
    // partículas y clima
    if (mist) mist.update(now / 1000, me ? me.rx + 0.5 : undefined, me ? me.ry + 0.5 : undefined);
    // motas de polvo que flotan en la luz del farol
    if (dark && me && (!DD.gfx || DD.gfx.weather !== false) && Math.random() < 0.35) fxp.emit({ x: me.rx + 0.5 + (Math.random() - 0.5) * 3.5, y: 0.3 + Math.random() * 1.4, z: me.ry + 0.5 + (Math.random() - 0.5) * 3.5, vx: (Math.random() - 0.5) * 0.08, vy: (Math.random() - 0.3) * 0.06, color: '#ffe0b0', size: 0.03, life: 3.5, alpha: 0.45 });
    fxp.update(dt); dustp.update(dt);
    const zoneId = map.zones && me ? Number(map.zones[me.y * map.w + me.x]) || 0 : 0;
    const wantWx = !DD.gfx || DD.gfx.weather ? D.weatherFor(map, zoneId, now) : 'none';
    wx.set(wantWx, game.cam.x, game.cam.y);
    wx.update(dt, game.cam.x, game.cam.y);
    // ascuas de antorchas y braseros
    if (Math.random() < 0.25 && built.props) {
      const lit = built.props.filter((p) => p.light && p.o.visible);
      const p = lit[Math.floor(Math.random() * lit.length)];
      if (p) spark(p.light.x + (Math.random() - 0.5) * 0.2, p.light.z - 0.2, Math.random() < 0.5 ? '#ffb03a' : '#ff6a1a', true);
    }
    // luces: las del mapa, el farol del héroe y la magia
    // parpadeo de llama: dos ondas y un temblor rápido; la llama también se mueve un poco (la sombra baila)
    const flick = (seed) => 0.84 + Math.sin(now / 110 + seed) * 0.08 + Math.sin(now / 37 + seed * 2) * 0.05 + Math.sin(now / 13 + seed * 5) * 0.03;
    const isFire = (c) => /^#ff[5-b]/i.test(c || '');
    const L = [];
    for (const l of built.lights) L.push({ ...l, intensity: l.intensity * flick(l.x), fire: isFire(l.color) });
    for (const p of built.props || []) {
      if (!p.light || !p.o.visible) continue;
      const fire = isFire(p.light.color), sd = p.light.x * 3 + p.light.z;
      L.push({ ...p.light, x: p.light.x + (fire ? Math.sin(now / 90 + sd) * 0.03 : 0), z: p.light.z + (fire ? Math.cos(now / 70 + sd) * 0.03 : 0), intensity: p.light.intensity * flick(sd), dist: p.light.dist * (dark ? 0.85 : 1), fire });
    }
    if (me) { L.push({ x: me.rx + 0.5, y: 1.9, z: me.ry + 0.5, color: '#ffd8a8', intensity: map.kind === 'world' ? 1.3 : dark ? 1.5 : 1.6, dist: map.kind === 'world' ? 9 : 7.5, shadow: true, angle: dark ? 0.62 : 0.95, penumbra: dark ? 0.85 : 0.65 }); L.push({ x: me.rx + 0.5, y: 1.4, z: me.ry + 0.9, color: '#ffc890', intensity: dark ? 0.8 : 0.9, dist: dark ? 4 : 6 }); }
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
    D.drawOverlay(now);
    D.drawPings(now);
    if (game.showMap) D.drawMinimap();
    D.updateBar();
  }

  $('#dmount').onclick = () => DD.net.send({ t: 'dmount' });
  window.addEventListener('keydown', (e) => {
    if (!game.active || DD.scene !== 'dungeon' || (document.activeElement && document.activeElement.tagName === 'INPUT')) return;
    if (e.key === 'f' || e.key === 'F') DD.net.send({ t: 'dmount' });
    if (e.key.toLowerCase() === ((DD.keys && DD.keys.map) || 'm') && game.map.kind === 'world') { game.bigMap = !game.bigMap; game.showMap = true; e.stopImmediatePropagation(); }
  }, true);

  // Lo que comparten los archivos de public/dungeon/ (se cargan después de este);
  // las variables que cambian de valor se leen como D.nombre
  const D = DD.dg = { $, WATER_T, entAt, g, game, herbUnder, models, monName, onEvent, serverNow, viewEl, who,
    get stage() { return stage; }, get seenCount() { return seenCount; } };

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
