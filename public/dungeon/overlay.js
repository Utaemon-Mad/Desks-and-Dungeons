/* global DD, RULES, PROG, DSPRITES, ICONS */
// Lo que se dibuja encima de la escena: marcas, nombres, vida, bocadillos, minimapa; y el joystick táctil.
// Comparte estado con public/dungeon.js a través de DD.dg (const D).
(() => {
  'use strict';
  const D = DD.dg;
  const { $, WATER_T, g, game, herbUnder, models, monName, who } = D;

  // Marcas del grupo: anillos que laten durante 4 s
  function drawPings(now) {
    if (!game.pings || !game.pings.length) return;
    game.pings = game.pings.filter((p) => now - p.start < 4000);
    for (const p of game.pings) {
      const s = D.stage.project(p.x + 0.5, 0, p.y + 0.5), t = (now - p.start) / 1000;
      const col = p.k === 'danger' ? '255,80,60' : '255,215,90';
      for (let r = 0; r < 2; r++) {
        const ph = (t * 1.4 + r * 0.5) % 1;
        g.strokeStyle = `rgba(${col},${(1 - ph) * Math.min(1, (4 - t))})`; g.lineWidth = 3;
        g.beginPath(); g.ellipse(s.x, s.y, 12 + ph * 34, (12 + ph * 34) * 0.55, 0, 0, Math.PI * 2); g.stroke();
      }
      const bob = Math.sin(t * 6) * 4;
      g.font = '26px sans-serif'; g.textAlign = 'center';
      g.fillText(p.k === 'danger' ? '⚠️' : '📍', s.x, s.y - 30 + bob);
      g.font = '600 12px "Pixelify Sans", sans-serif'; g.fillStyle = `rgb(${col})`;
      g.fillText(who(p.id), s.x, s.y - 54 + bob);
    }
  }

  // Clima según la zona (y la hora): el tiempo cambia cada pocos minutos, igual para todos
  function weatherFor(map, zone, now) {
    if (map.kind !== 'world') return map.theme === 'volcan' || map.theme === 'abismo' ? 'embers' : 'motes';
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
    const P = (x, h, z) => D.stage.project(x, h, z);
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
    const seenC = D.seenCount;
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
    for (const p of game.pings || []) {
      const ph = ((performance.now() - p.start) / 600) % 1;
      g.strokeStyle = p.k === 'danger' ? '#ff5a3c' : '#ffd75a'; g.lineWidth = 2;
      g.beginPath(); g.arc(x0 + (p.x + 0.5) * k, y0 + (p.y + 0.5) * k, 3 + ph * 7, 0, Math.PI * 2); g.stroke();
    }
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


  Object.assign(D, { drawMinimap, drawOverlay, drawPings, weatherFor });
})();
