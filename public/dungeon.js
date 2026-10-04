/* global DD, DUNGEON, SPRITES, MAP */
// Mazmorras: lista, partida en tiempo real (vista cenital en pixel art) y editor.
(() => {
  'use strict';

  const T = 16; // píxeles por casilla
  const { W, H } = DUNGEON;
  const $ = (s) => document.querySelector(s);

  // ======================================================================
  //  Dibujo común de mazmorras (sirve para jugar y para el editor)
  // ======================================================================
  function drawTiles(g, tiles, now, seen) {
    const frame = Math.floor(now / 500) % 2;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const ch = tiles[y * W + x];
        const px = x * T, py = y * T;
        if (ch === '#') {
          const below = y + 1 < H ? tiles[(y + 1) * W + x] : '#';
          g.drawImage(SPRITES.wallTile(below !== '#'), px, py);
          continue;
        }
        if (ch === '~') { g.drawImage(SPRITES.overlayTile('water', frame), px, py); continue; }
        g.drawImage(SPRITES.floorTile(x, y), px, py);
        if (ch === '+') g.drawImage(SPRITES.overlayTile('door'), px, py);
        if (ch === '^') g.drawImage(SPRITES.overlayTile('spikes', frame), px, py);
      }
    }
    if (seen) {
      g.fillStyle = '#050308';
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!seen[y * W + x]) g.fillRect(x * T, y * T, T, T);
    }
  }

  // Sprite con los pies en el centro inferior de la casilla
  function drawOnTile(g, spr, x, y, flip, scale = 1) {
    const w = spr.width * scale, h = spr.height * scale;
    const cx = Math.round(x * T + T / 2), base = Math.round(y * T + T + 1);
    g.save();
    g.translate(cx, base);
    if (flip) g.scale(-1, 1);
    g.drawImage(spr, -Math.round(w / 2), -h, w, h);
    g.restore();
  }

  function enemySprite(k, frame, hit) { return SPRITES.enemy(k, { frame, hit }); }

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
    active: false, dungeon: null, ents: new Map(), chests: [], potions: [], coins: [], exit: null, start: null,
    seen: null, floaters: [], puffs: [], bubbles: new Map(), path: [], held: null, lastSend: 0,
    view: { s: 2, ox: 0, oy: 0, dpr: 1 },
  };

  function resizeGame() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(innerWidth * dpr); cv.height = Math.round(innerHeight * dpr);
    const mobile = innerWidth <= 820;
    const top = mobile ? 150 : 20, bottom = mobile ? 150 : 96;
    const left = mobile ? 0 : 230;
    const availW = innerWidth - left - (mobile ? 8 : 300), availH = innerHeight - top - bottom;
    const s = fitScale(availW, availH, W * T, H * T);
    // en móvil, justo debajo del panel de vida para que la crónica no la tape
    const hud = document.getElementById('dhud').getBoundingClientRect();
    const oy = mobile ? Math.max(top, hud.bottom + 8) : top + (availH - H * T * s) / 2;
    game.view = { s, dpr, ox: left + (availW - W * T * s) / 2, oy };
  }
  window.addEventListener('resize', () => { if (game.active) resizeGame(); });

  // Entidad visible (héroe o enemigo) con posición suavizada
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
    for (const [id, e] of game.ents) if (!e.alive) game.ents.delete(id);
    game.chests = m.chests; game.potions = m.potions; game.coins = m.coins;
    game.exit = m.exit; game.start = m.start;
    for (const ev of m.events || []) onEvent(ev);
    reveal();
    updateHud();
  }

  function reveal() {
    for (const e of game.ents.values()) {
      if (e.kind !== 'hero') continue;
      for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
        const x = e.x + dx, y = e.y + dy;
        if (x >= 0 && y >= 0 && x < W && y < H && dx * dx + dy * dy <= 26) game.seen[y * W + x] = 1;
      }
    }
  }

  function float(x, y, text, color, big) {
    game.floaters.push({ x, y, text, color, big, start: performance.now() });
  }

  function onEvent(ev) {
    const now = performance.now();
    const me = DD.myId;
    switch (ev.e) {
      case 'hit': {
        const t = game.ents.get(ev.target);
        if (t) {
          t.hitUntil = now + 160;
          float(t.x, t.y, '-' + ev.dmg, t.kind === 'hero' ? '#ff6b6b' : '#ffffff', ev.target === me);
        }
        const by = game.ents.get(ev.by);
        if (by && t) { by.lunge = now; by.lungeDx = Math.sign(t.x - by.x); by.lungeDy = Math.sign(t.y - by.y); }
        DD.blip(ev.target === me ? 160 : 260, 0.06);
        break;
      }
      case 'die': {
        game.puffs.push({ x: ev.x, y: ev.y, start: now, color: '#d8d0c0' });
        if (ev.by === me) float(ev.x, ev.y, `+${ev.xp} XP`, '#9fe0ff', true);
        DD.blip(120, 0.15);
        break;
      }
      case 'loot':
        if (ev.gold) float(ev.x, ev.y, `+${ev.gold} 🪙`, '#ffd23f', ev.id === me);
        if (ev.xp && ev.id === me) setTimeout(() => float(ev.x, ev.y, `+${ev.xp} XP`, '#9fe0ff', true), 350);
        if (ev.id === me) DD.blip(1046, 0.08);
        break;
      case 'heal': {
        const t = game.ents.get(ev.id);
        if (t) float(t.x, t.y, '+' + ev.amount + ' ❤', '#7dff8a', ev.id === me);
        break;
      }
      case 'summon':
        game.puffs.push({ x: ev.x, y: ev.y, start: now, color: '#7cff6a' });
        break;
    }
  }

  DD.on('dstart', (m) => {
    game.active = true;
    game.dungeon = m.dungeon;
    game.ents.clear(); game.floaters = []; game.puffs = []; game.path = []; game.held = null;
    game.seen = new Uint8Array(W * H);
    $('#dname').textContent = m.dungeon.name;
    viewEl.classList.remove('hidden');
    $('#deditor').classList.add('hidden');
    DD.setScene('dungeon');
    resizeGame();
    applySnap(m);
    DD.toast(`Entras en «${m.dungeon.name}». Muévete con WASD, flechas o clic.`);
  });
  DD.on('dsnap', (m) => { if (game.active) applySnap(m); });
  DD.on('dexit', (m) => {
    game.active = false;
    viewEl.classList.add('hidden');
    DD.setScene('tavern');
    if (m.reason === 'win') DD.toast('🏆 ¡Mazmorra completada!');
    else if (m.reason === 'down') DD.toast(`💀 Has caído${m.lost ? ` y pierdes ${m.lost} de oro` : ''}. Vuelves a la taberna.`);
  });
  DD.on('profile', () => { if (game.active) updateHud(); });
  DD.on('log', (m) => {
    if (!game.active || m.t !== 'chat') return;
    if (game.ents.has(m.id)) game.bubbles.set(m.id, { text: m.text, until: performance.now() + 4000 + m.text.length * 50 });
  });
  $('#dexit').onclick = () => DD.net.send({ t: 'dleave' });

  function updateHud() {
    const me = game.ents.get(DD.myId);
    const u = DD.users.get(DD.myId);
    if (me) {
      $('#dhp').textContent = `${Math.max(0, me.hp)}/${me.maxHp}`;
      $('#dhp-bar').style.width = Math.max(0, 100 * me.hp / me.maxHp) + '%';
    }
    if (u) {
      const st = MAP.heroStats(u.look.cls, u.xp);
      $('#dlvl').textContent = `Nv ${st.level}`;
      $('#dxp-bar').style.width = Math.round(100 * (u.xp - st.base) / (st.next - st.base)) + '%';
      $('#dgold').textContent = u.gold;
    }
    const left = [...game.ents.values()].filter((e) => e.kind === 'enemy').length;
    $('#dleft').textContent = left ? `👹 ${left} enemigos` : '✨ Mazmorra limpia';
  }

  // ---------- Controles ----------
  const KEYS = { ArrowUp: [0, -1], w: [0, -1], W: [0, -1], ArrowDown: [0, 1], s: [0, 1], S: [0, 1], ArrowLeft: [-1, 0], a: [-1, 0], A: [-1, 0], ArrowRight: [1, 0], d: [1, 0], D: [1, 0] };
  window.addEventListener('keydown', (e) => {
    if (!game.active || (document.activeElement && document.activeElement.tagName === 'INPUT')) return;
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
    if (!force && now - game.lastSend < 165) return;
    game.lastSend = now;
    DD.net.send({ t: 'dmove', dx: d[0], dy: d[1] });
  }

  function blockedForPath(x, y) {
    const ch = game.dungeon.tiles[y * W + x];
    if (!DUNGEON.walkable(ch)) return true;
    return game.chests.some((c) => c.x === x && c.y === y);
  }

  // Camino por casillas (los enemigos y cofres valen como destino para atacar o abrir)
  function bfs(sx, sy, tx, ty) {
    const prev = new Int32Array(W * H).fill(-1);
    const q = [sy * W + sx];
    prev[sy * W + sx] = sy * W + sx;
    while (q.length) {
      const cur = q.shift();
      const cx = cur % W, cy = (cur / W) | 0;
      if (cx === tx && cy === ty) break;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = ny * W + nx;
        if (prev[ni] !== -1) continue;
        const target = nx === tx && ny === ty;
        if (!target && blockedForPath(nx, ny)) continue;
        if (target && !DUNGEON.walkable(game.dungeon.tiles[ni])) continue;
        prev[ni] = cur; q.push(ni);
      }
    }
    if (prev[ty * W + tx] === -1) return [];
    const path = [];
    for (let i = ty * W + tx; i !== sy * W + sx; i = prev[i]) path.unshift({ x: i % W, y: (i / W) | 0 });
    return path;
  }

  cv.addEventListener('click', (e) => {
    if (!game.active) return;
    const v = game.view;
    const x = Math.floor((e.clientX - v.ox) / (T * v.s)), y = Math.floor((e.clientY - v.oy) / (T * v.s));
    const me = game.ents.get(DD.myId);
    if (!me || x < 0 || y < 0 || x >= W || y >= H) return;
    game.held = null;
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
    if (Math.abs(dx) + Math.abs(dy) !== 1) { game.path = bfs(me.x, me.y, game.pathTarget.x, game.pathTarget.y); return; }
    // si el cofre ya está abierto, no insistir
    const chest = game.chests.find((c) => c.x === n.x && c.y === n.y);
    if (chest && chest.open) { game.path = []; return; }
    step([dx, dy]);
    if (chest) game.path = [];
  }

  // ---------- Dibujo de la partida ----------
  const light = document.createElement('canvas');
  light.width = W * T; light.height = H * T;
  const lg = light.getContext('2d');
  const world = document.createElement('canvas');
  world.width = W * T; world.height = H * T;
  const wg = world.getContext('2d');
  wg.imageSmoothingEnabled = false;

  function renderGame(now, dt) {
    followPath();
    // suavizado de posiciones
    for (const e of game.ents.values()) {
      const k = Math.min(1, dt * 14);
      e.moving = Math.abs(e.rx - e.x) + Math.abs(e.ry - e.y) > 0.05;
      e.rx += (e.x - e.rx) * k; e.ry += (e.y - e.ry) * k;
      if (e.moving) e.phase = (e.phase || 0) + dt * 6;
      if (e.x !== e.lastX) { if (e.x < (e.lastX ?? e.x)) e.face = -1; else if (e.x > (e.lastX ?? e.x)) e.face = 1; e.lastX = e.x; }
    }

    wg.clearRect(0, 0, world.width, world.height);
    drawTiles(wg, game.dungeon.tiles, now, null);
    if (game.start) wg.drawImage(SPRITES.overlayTile('start'), game.start.x * T, game.start.y * T);
    if (game.exit) wg.drawImage(SPRITES.overlayTile('exit'), game.exit.x * T, game.exit.y * T);
    for (const c of game.coins) wg.drawImage(SPRITES.overlayTile('coins'), c.x * T, c.y * T + Math.round(Math.sin(now / 300 + c.x) * 1));
    for (const p of game.potions) wg.drawImage(SPRITES.overlayTile('potion'), p.x * T, p.y * T - Math.round(Math.abs(Math.sin(now / 400 + p.y)) * 2));
    for (const c of game.chests) wg.drawImage(SPRITES.overlayTile(c.open ? 'chestopen' : 'chest'), c.x * T, c.y * T);

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
        const back = e.dir === 'N';
        let spr = SPRITES.hero(e.look, { back, frame });
        if (hit) spr = tint(spr);
        drawOnTile(wg, spr, e.rx, e.ry, (e.face || 1) < 0);
      } else {
        const st = DUNGEON.ENEMIES[e.k];
        drawOnTile(wg, enemySprite(e.k, frame, hit), e.rx, e.ry, (e.face || -1) < 0, st.boss ? 1.15 : 1);
      }
      wg.restore();
    }

    // humo de muertes e invocaciones
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

    // luz alrededor de los héroes y niebla de lo no explorado
    lg.globalCompositeOperation = 'source-over';
    lg.clearRect(0, 0, light.width, light.height);
    lg.fillStyle = 'rgba(6,3,12,0.8)';
    lg.fillRect(0, 0, light.width, light.height);
    lg.globalCompositeOperation = 'destination-out';
    const flick = 1 + Math.sin(now / 90) * 0.03;
    const lights = [...game.ents.values()].filter((e) => e.kind === 'hero').map((e) => [e.rx, e.ry, 5.5]);
    if (game.exit) lights.push([game.exit.x, game.exit.y, 1.6]);
    for (const [x, y, r] of lights) {
      const cx = x * T + 8, cy = y * T + 6, rad = r * T * flick;
      const gr = lg.createRadialGradient(cx, cy, 0, cx, cy, rad);
      gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.55, 'rgba(0,0,0,.85)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      lg.fillStyle = gr; lg.beginPath(); lg.arc(cx, cy, rad, 0, Math.PI * 2); lg.fill();
    }
    lg.globalCompositeOperation = 'source-over';
    lg.fillStyle = '#050308';
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!game.seen[y * W + x]) lg.fillRect(x * T, y * T, T, T);
    wg.drawImage(light, 0, 0);
    // tono cálido de antorcha
    wg.globalCompositeOperation = 'overlay';
    for (const [x, y, r] of lights) {
      const cx = x * T + 8, cy = y * T + 6;
      const gr = wg.createRadialGradient(cx, cy, 0, cx, cy, r * T * 0.7);
      gr.addColorStop(0, 'rgba(255,160,60,.35)'); gr.addColorStop(1, 'rgba(255,160,60,0)');
      wg.fillStyle = gr; wg.beginPath(); wg.arc(cx, cy, r * T, 0, Math.PI * 2); wg.fill();
    }
    wg.globalCompositeOperation = 'source-over';

    // a pantalla
    const v = game.view;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#0a0508'; g.fillRect(0, 0, cv.width, cv.height);
    g.imageSmoothingEnabled = false;
    g.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    g.drawImage(world, Math.round(v.ox), Math.round(v.oy), W * T * v.s, H * T * v.s);
    g.strokeStyle = '#2a1a10'; g.lineWidth = 3; g.strokeRect(Math.round(v.ox) - 2, Math.round(v.oy) - 2, W * T * v.s + 4, H * T * v.s + 4);

    // capa de texto (en píxeles de pantalla)
    const sx = (x) => v.ox + (x * T + T / 2) * v.s, sy = (y) => v.oy + (y * T) * v.s;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const e of ents) {
      if (!game.seen[e.y * W + e.x]) continue;
      const x = sx(e.rx), y = sy(e.ry) - 22 * v.s;
      if (e.kind === 'enemy' && e.hp < e.maxHp) {
        const w = 14 * v.s;
        g.fillStyle = '#1b120c'; g.fillRect(x - w / 2 - 1, y + 2 * v.s - 1, w + 2, 2 * v.s + 2);
        g.fillStyle = '#d8433b'; g.fillRect(x - w / 2, y + 2 * v.s, w * Math.max(0, e.hp / e.maxHp), 2 * v.s);
      }
      if (e.kind === 'hero') {
        g.font = `600 ${Math.max(10, 4 * v.s)}px "Pixelify Sans", sans-serif`;
        const isMe = e.id === DD.myId;
        g.lineWidth = 3; g.strokeStyle = '#000'; g.strokeText(e.name, x, y - 2);
        g.fillStyle = isMe ? '#ffe9a8' : '#f4ead2'; g.fillText(e.name, x, y - 2);
        const w = 14 * v.s;
        g.fillStyle = '#1b120c'; g.fillRect(x - w / 2 - 1, y + 4 * v.s - 1, w + 2, 2 * v.s + 2);
        g.fillStyle = '#5cd85c'; g.fillRect(x - w / 2, y + 4 * v.s, w * Math.max(0, e.hp / e.maxHp), 2 * v.s);
        const b = game.bubbles.get(e.id);
        if (b && b.until > now) drawBubble(g, x, y - 10 * v.s, b.text);
      }
    }
    for (let i = game.floaters.length - 1; i >= 0; i--) {
      const f = game.floaters[i];
      const life = (now - f.start) / 1100;
      if (life >= 1) { game.floaters.splice(i, 1); continue; }
      g.font = `700 ${f.big ? Math.max(16, 6 * v.s) : Math.max(13, 5 * v.s)}px "Pixelify Sans", sans-serif`;
      g.globalAlpha = 1 - Math.max(0, life - 0.6) / 0.4;
      const x = sx(f.x), y = sy(f.y) - (14 + life * 12) * v.s;
      g.lineWidth = 4; g.strokeStyle = '#1a0a04'; g.strokeText(f.text, x, y);
      g.fillStyle = f.color; g.fillText(f.text, x, y);
      g.globalAlpha = 1;
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

  // ======================================================================
  //  Editor de mazmorras
  // ======================================================================
  const edEl = $('#deditor'), ecv = $('#decanvas'), eg = ecv.getContext('2d');
  const ed = { id: null, tiles: [], objects: new Map(), tool: '#', painting: false, erase: false, view: { s: 2, ox: 0, oy: 0 } };

  const PALETTE = [
    { group: 'Suelo', items: [['.', 'Suelo'], ['#', 'Muro'], ['+', 'Puerta'], ['^', 'Pinchos'], ['~', 'Agua']] },
    { group: 'Objetos', items: [['start', 'Entrada'], ['exit', 'Salida'], ['chest', 'Cofre'], ['potion', 'Poción']] },
    { group: 'Goblins', items: [['goblin', 'Goblin'], ['shaman', 'Chamán']] },
    { group: 'Orcos', items: [['orc', 'Orco'], ['warchief', 'Jefe orco']] },
    { group: 'No muertos', items: [['skeleton', 'Esqueleto'], ['zombie', 'Zombi'], ['necromancer', 'Nigromante']] },
    { group: 'Herramientas', items: [['erase', 'Quitar objeto']] },
  ];
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
      const s = Math.min(32 / spr.width, 36 / spr.height);
      x.drawImage(spr, (32 - spr.width * s) / 2, 36 - spr.height * s, spr.width * s, spr.height * s);
    } else {
      x.drawImage(SPRITES.floorTile(1, 1), 0, 4, 32, 32);
      x.drawImage(SPRITES.overlayTile(k), 0, 4, 32, 32);
    }
    return c;
  }

  function buildPalette() {
    const pal = $('#de-palette');
    pal.innerHTML = '';
    for (const grp of PALETTE) {
      const h = document.createElement('div'); h.className = 'de-group'; h.textContent = grp.group;
      pal.appendChild(h);
      const box = document.createElement('div'); box.className = 'de-items';
      for (const [k, name] of grp.items) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'tool-btn' + (ed.tool === k ? ' on' : '');
        b.title = DUNGEON.ENEMIES[k] ? `${name}: ${DUNGEON.ENEMIES[k].hp} HP, ${DUNGEON.ENEMIES[k].att} ATT, ${DUNGEON.ENEMIES[k].xp} XP` : name;
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
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) tiles.push(x === 0 || y === 0 || x === W - 1 || y === H - 1 ? '#' : '.');
    return { id: null, name: '', tiles: tiles.join(''), objects: [{ k: 'start', x: 2, y: 2 }, { k: 'exit', x: W - 3, y: H - 3 }] };
  }

  function openEditor(d) {
    d = d || blankDungeon();
    ed.id = d.mine === false ? null : d.id;
    ed.tiles = d.tiles.split('');
    ed.objects = new Map(d.objects.map((o) => [o.x + ',' + o.y, o.k]));
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
    const s = fitScale(r.width - 8, r.height - 8, W * T, H * T);
    ed.view = { s, dpr, ox: (r.width - W * T * s) / 2, oy: (r.height - H * T * s) / 2 };
  }
  window.addEventListener('resize', () => { if (DD.scene === 'editor') resizeEditor(); });

  function closeEditor() {
    edEl.classList.add('hidden');
    DD.setScene('tavern');
  }

  function edTile(e) {
    const r = ecv.getBoundingClientRect(), v = ed.view;
    return { x: Math.floor((e.clientX - r.left - v.ox) / (T * v.s)), y: Math.floor((e.clientY - r.top - v.oy) / (T * v.s)) };
  }

  function paint(x, y, erase) {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const k = x + ',' + y;
    if (erase || ed.tool === 'erase') {
      if (ed.objects.has(k)) ed.objects.delete(k);
      else if (erase) ed.tiles[y * W + x] = '.';
      return;
    }
    if (isTile(ed.tool)) {
      ed.tiles[y * W + x] = ed.tool;
      if (!DUNGEON.walkable(ed.tool)) ed.objects.delete(k);
      return;
    }
    if (!DUNGEON.walkable(ed.tiles[y * W + x])) ed.tiles[y * W + x] = '.';
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
    // los objetos únicos (entrada, salida, enemigos) se ponen de uno en uno
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
    wg.clearRect(0, 0, world.width, world.height);
    drawTiles(wg, ed.tiles, now, null);
    const objs = [...ed.objects].map(([k, v2]) => { const [x, y] = k.split(',').map(Number); return { k: v2, x, y }; }).sort((a, b) => a.y - b.y);
    for (const o of objs) {
      if (DUNGEON.ENEMIES[o.k]) drawOnTile(wg, enemySprite(o.k, 0, false), o.x, o.y, false, DUNGEON.ENEMIES[o.k].boss ? 1.15 : 1);
      else wg.drawImage(SPRITES.overlayTile(o.k), o.x * T, o.y * T);
    }
    // rejilla
    wg.fillStyle = 'rgba(255,255,255,.06)';
    for (let x = 1; x < W; x++) wg.fillRect(x * T, 0, 1, H * T);
    for (let y = 1; y < H; y++) wg.fillRect(0, y * T, W * T, 1);
    if (ed.hover && ed.hover.x >= 0 && ed.hover.y >= 0 && ed.hover.x < W && ed.hover.y < H) {
      wg.strokeStyle = ed.tool === 'erase' ? '#ff6b6b' : '#ffe9a8'; wg.lineWidth = 1;
      wg.strokeRect(ed.hover.x * T + 0.5, ed.hover.y * T + 0.5, T - 1, T - 1);
    }
    eg.setTransform(1, 0, 0, 1, 0, 0);
    eg.fillStyle = '#0a0508'; eg.fillRect(0, 0, ecv.width, ecv.height);
    eg.imageSmoothingEnabled = false;
    eg.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    eg.drawImage(world, Math.round(v.ox), Math.round(v.oy), W * T * v.s, H * T * v.s);
    const enemies = objs.filter((o) => DUNGEON.ENEMIES[o.k]).length;
    $('#de-help').textContent = `${enemies}/${DUNGEON.MAX_ENEMIES} enemigos · Clic o arrastra para pintar · Clic derecho para borrar · Necesitas una entrada y una salida`;
  }

  // ======================================================================
  //  Bucle
  // ======================================================================
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (DD.scene === 'dungeon' && game.active) renderGame(now, dt);
    else if (DD.scene === 'editor') renderEditor(now);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // Pruebas automáticas: casilla de la mazmorra a coordenadas de ventana
  window.__dTileToScreen = (x, y) => ({ x: game.view.ox + (x + 0.5) * T * game.view.s, y: game.view.oy + (y + 0.5) * T * game.view.s });
})();
