/* global MAP, RULES */
// Mesa de partida: quien se sienta a la mesa grande ve desde arriba a los demás y abre el plano de la próxima
// mazmorra (la que se generará de verdad). En el plano se ponen marcas, se elige tema y nivel, se juega a los
// dados y se comercia con los de la mesa; cuando todos dicen «listo», bajan juntos.
(() => {
  'use strict';
  const C = DD.core;
  const { net, users } = C;
  const COLORS = ['#e8443a', '#3a8ee8', '#3ac46a', '#e8b83a', '#b05ae8', '#e87ad0', '#3ad0d0', '#ffffff'];

  const M = { state: null, plan: null, version: 0, open: false, seated: false };

  // ---------- el plano: pergamino con muros, puertas, entrada, jefe, cofres, enemigos y las marcas de cada uno ----------
  // devuelve la transformación casilla → píxel para poder traducir los toques
  function drawPlan(c, w, h, opts = {}) {
    const p = M.plan, st = M.state;
    // pergamino
    const g = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.7);
    g.addColorStop(0, '#f1e2bb'); g.addColorStop(0.75, '#dcc390'); g.addColorStop(1, '#a8834e');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 220; i++) { const r = C.rand(i * 7.3); c.fillStyle = `rgba(110,70,30,${0.03 + C.rand(i) * 0.05})`; c.fillRect(C.rand(i * 3.1) * w, C.rand(i * 5.7) * h, 2 + r * 8, 1 + r * 3); }
    if (!p) { c.fillStyle = '#5a3a1a'; c.font = `${Math.round(h / 12)}px Georgia`; c.textAlign = 'center'; c.fillText('Desplegando el plano…', w / 2, h / 2); return null; }
    // recorte: sólo lo que tiene suelo, con un borde
    let x0 = p.w, y0 = p.h, x1 = 0, y1 = 0;
    const T = (x, y) => (x < 0 || y < 0 || x >= p.w || y >= p.h ? '#' : p.tiles[y * p.w + x]);
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (T(x, y) !== '#') { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    x0 -= 1; y0 -= 1; x1 += 1; y1 += 1;
    const pad = opts.pad !== undefined ? opts.pad : 10, top = opts.title ? h * 0.12 : 0;
    const cs = Math.min((w - pad * 2) / (x1 - x0 + 1), (h - pad * 2 - top) / (y1 - y0 + 1));
    const ox = (w - cs * (x1 - x0 + 1)) / 2 - x0 * cs, oy = top + (h - top - cs * (y1 - y0 + 1)) / 2 - y0 * cs;
    const X = (x) => ox + x * cs, Y = (y) => oy + y * cs;
    // sombra de los muros alrededor del suelo y el suelo
    c.fillStyle = 'rgba(70,40,15,.28)';
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (T(x, y) === '#' && [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].some(([dx, dy]) => T(x + dx, y + dy) !== '#')) c.fillRect(X(x), Y(y), cs + 0.5, cs + 0.5);
    c.fillStyle = '#f7eccd';
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (T(x, y) !== '#') c.fillRect(X(x), Y(y), cs + 0.5, cs + 0.5);
    // cuadrícula suave
    c.strokeStyle = 'rgba(120,80,40,.12)'; c.lineWidth = 1; c.beginPath();
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (T(x, y) !== '#') { c.rect(X(x), Y(y), cs, cs); }
    c.stroke();
    // trazo de tinta entre suelo y muro
    c.strokeStyle = '#3a2210'; c.lineWidth = Math.max(1.5, cs * 0.16); c.lineCap = 'round'; c.beginPath();
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (T(x, y) === '#') continue;
      if (T(x, y - 1) === '#') { c.moveTo(X(x), Y(y)); c.lineTo(X(x + 1), Y(y)); }
      if (T(x, y + 1) === '#') { c.moveTo(X(x), Y(y + 1)); c.lineTo(X(x + 1), Y(y + 1)); }
      if (T(x - 1, y) === '#') { c.moveTo(X(x), Y(y)); c.lineTo(X(x), Y(y + 1)); }
      if (T(x + 1, y) === '#') { c.moveTo(X(x + 1), Y(y)); c.lineTo(X(x + 1), Y(y + 1)); }
    }
    c.stroke();
    // puertas
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (T(x, y) === '+') {
      c.fillStyle = '#8a5a2a'; const vert = T(x - 1, y) === '#';
      if (vert) c.fillRect(X(x) + cs * 0.3, Y(y) + cs * 0.05, cs * 0.4, cs * 0.9); else c.fillRect(X(x) + cs * 0.05, Y(y) + cs * 0.3, cs * 0.9, cs * 0.4);
      c.strokeStyle = '#3a2210'; c.lineWidth = 1; c.strokeRect(X(x) + (vert ? cs * 0.3 : cs * 0.05), Y(y) + (vert ? cs * 0.05 : cs * 0.3), vert ? cs * 0.4 : cs * 0.9, vert ? cs * 0.9 : cs * 0.4);
    }
    const icon = (txt, x, y, s = 1.6) => { c.font = `${Math.round(cs * s)}px serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, X(x + 0.5), Y(y + 0.5)); };
    // enemigos: manchas rojas (más grandes si son muchos o hay élite)
    for (const [x, y, n, elite] of p.packs) {
      c.fillStyle = elite ? 'rgba(160,20,90,.55)' : 'rgba(190,30,20,.45)';
      c.beginPath(); c.arc(X(x + 0.5), Y(y + 0.5), cs * (0.45 + Math.min(n, 6) * 0.12), 0, 7); c.fill();
    }
    for (const [x, y] of p.chests) icon('💰', x, y, 1.3);
    icon('💀', p.boss[0], p.boss[1], 2.2);
    // entrada
    c.fillStyle = '#2a8a3a'; c.beginPath(); c.arc(X(p.start[0] + 0.5), Y(p.start[1] + 0.5), cs * 0.85, 0, 7); c.fill();
    c.fillStyle = '#fff'; c.font = `bold ${Math.round(cs * 1.1)}px Georgia`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('E', X(p.start[0] + 0.5), Y(p.start[1] + 0.55));
    // marcas de los jugadores sentados
    const seated = st ? st.seated : [];
    for (const [id, list] of Object.entries(st ? st.marks : {})) {
      const i = seated.indexOf(id), u = users.get(id), col = COLORS[(i < 0 ? 7 : i) % COLORS.length];
      for (const [x, y] of list) {
        const px = X(x + 0.5), py = Y(y + 0.5), r = Math.max(5, cs * 0.75);
        c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(px + 2, py + r * 0.9, r * 0.6, r * 0.25, 0, 0, 7); c.fill();
        c.fillStyle = col; c.beginPath(); c.moveTo(px, py + r); c.arc(px, py - r * 0.4, r * 0.8, Math.PI * 0.8, Math.PI * 0.2); c.closePath(); c.fill();
        c.strokeStyle = '#1a0c04'; c.lineWidth = 1.5; c.stroke();
        c.fillStyle = '#fff'; c.font = `bold ${Math.round(r * 0.9)}px sans-serif`; c.fillText(((u && u.name) || '?')[0].toUpperCase(), px, py - r * 0.4);
      }
    }
    // título y rosa de los vientos
    if (opts.title) {
      c.fillStyle = '#3a2210'; c.font = `bold ${Math.round(top * 0.55)}px Georgia`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(p.name, w / 2, top * 0.6);
    }
    if (opts.compass !== false) {
      const r = Math.min(w, h) * 0.06, cx = w - r * 1.6, cy = h - r * 1.6;
      c.strokeStyle = '#5a3a1a'; c.fillStyle = '#5a3a1a'; c.lineWidth = 1.2;
      c.beginPath(); c.arc(cx, cy, r, 0, 7); c.stroke();
      c.beginPath(); c.moveTo(cx, cy - r * 1.3); c.lineTo(cx + r * 0.25, cy); c.lineTo(cx, cy + r * 1.3); c.lineTo(cx - r * 0.25, cy); c.closePath(); c.fill();
      c.font = `bold ${Math.round(r * 0.7)}px Georgia`; c.fillText('N', cx, cy - r * 1.7);
    }
    // bordes quemados
    const v = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.45, w / 2, h / 2, Math.max(w, h) * 0.72);
    v.addColorStop(0, 'rgba(60,30,10,0)'); v.addColorStop(1, 'rgba(60,30,10,.55)');
    c.fillStyle = v; c.fillRect(0, 0, w, h);
    return { toTile: (px, py) => ({ x: Math.floor((px - ox) / cs), y: Math.floor((py - oy) / cs) }) };
  }

  // ---------- el panel ----------
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const panel = el('div', 'mesa-panel hidden'); panel.id = 'mesawin';
  panel.innerHTML = '<div class="panel card"><div class="mesa-head"><div class="panel-title">🗺️ MESA DE PARTIDA</div><button class="mini" type="button" id="mesa-min" title="Plegar">▾</button></div>' +
    '<div class="mesa-name" id="mesa-name"></div><canvas id="mesa-cv" width="720" height="500"></canvas>' +
    '<p class="muted small mesa-hint">Toca el plano para poner tus marcas (hasta 3) y organizaros: quién va primero, dónde está el jefe… La mazmorra será justo esta.</p>' +
    '<div id="mesa-body"></div></div>';
  document.body.appendChild(panel);
  const cv = $('#mesa-cv');
  let xf = null;
  cv.addEventListener('click', (e) => {
    if (!xf) return;
    const r = cv.getBoundingClientRect();
    const t = xf.toTile((e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height);
    net.send({ t: 'mesa:mark', x: t.x, y: t.y });
    DD.sfx('click');
  });
  $('#mesa-min').onclick = () => { panel.classList.toggle('mini-mesa'); $('#mesa-min').textContent = panel.classList.contains('mini-mesa') ? '▴' : '▾'; };

  function render() {
    if (!M.open) return;
    const st = M.state;
    xf = drawPlan(cv.getContext('2d'), cv.width, cv.height);
    const th = st && RULES.THEMES[st.theme];
    $('#mesa-name').textContent = st ? `${th ? th.icon + ' ' : ''}«${st.name}» · nivel ${st.level}` : '';
    const body = $('#mesa-body'); body.innerHTML = '';
    if (!st) return;
    // tema y nivel
    const row = el('div', 'mesa-themes');
    for (const [id, t] of Object.entries(RULES.THEMES)) {
      const b = el('button', 'theme-btn mini-theme' + (st.theme === id ? ' on' : ''), t.icon); b.type = 'button'; b.title = t.name;
      b.onclick = () => net.send({ t: 'mesa:set', theme: id });
      row.appendChild(b);
    }
    body.appendChild(row);
    const lv = el('div', 'mesa-level');
    const minus = el('button', 'btn', '−'), plus = el('button', 'btn', '+'), reroll = el('button', 'btn alt', '🔄 Otro plano');
    minus.disabled = st.level <= 1; plus.disabled = st.level >= st.maxLevel;
    minus.onclick = () => net.send({ t: 'mesa:set', level: st.level - 1 });
    plus.onclick = () => net.send({ t: 'mesa:set', level: st.level + 1 });
    reroll.onclick = () => net.send({ t: 'mesa:set', reroll: true });
    lv.append(minus, el('b', '', `Nivel ${st.level}`), plus, reroll);
    body.appendChild(lv);
    // los de la mesa
    body.appendChild(el('div', 'field-title', `🪑 En la mesa (${st.seated.length})`));
    st.seated.forEach((id, i) => {
      const u = users.get(id); if (!u) return;
      const r = el('div', 'mesa-row' + (st.ready.includes(id) ? ' ready' : ''));
      const dot = el('span', 'mesa-dot'); dot.style.background = COLORS[i % COLORS.length];
      const cls = RULES.CLASSES[u.look && u.look.cls] || {};
      r.append(dot, el('b', '', u.name), el('small', 'muted', `${cls.icon || ''} nv ${u.level}`), el('span', 'mesa-st', st.ready.includes(id) ? '✔ listo' : '… esperando'));
      if (id !== C.myId) {
        const tr = el('button', 'mini', '🤝'); tr.title = `Comerciar con ${u.name}`; tr.onclick = () => net.send({ t: 'trade:req', to: id });
        const dr = el('button', 'mini', '🍺'); dr.title = `Invitar a una ronda a ${u.name}`; dr.onclick = () => net.send({ t: 'round', to: id });
        r.append(tr, dr);
      }
      body.appendChild(r);
    });
    // minijuegos
    const games = el('div', 'mesa-games');
    const dice = el('button', 'btn', '🎲 Ronda de dados'); dice.onclick = () => DD.emit('open-dice');
    const d20 = el('button', 'btn', '🎲 Tirar d20'); d20.onclick = () => net.send({ t: 'roll', sides: 20 });
    games.append(dice, d20);
    body.appendChild(games);
    const meReady = st.ready.includes(C.myId);
    const go = el('button', 'btn big' + (meReady ? ' alt' : ''), meReady ? '✔ ¡Listo! (toca para esperar)' : '⚔️ ¡ESTOY LISTO!');
    go.onclick = () => net.send({ t: 'mesa:ready' });
    body.appendChild(go);
    body.appendChild(el('p', 'muted small', st.seated.length > 1 ? `Cuando los ${st.seated.length} estéis listos, bajáis juntos.` : 'Si estás solo, bajas en cuanto digas que estás listo. Espera a tus amigos si quieres ir en grupo.'));
    const stand = el('button', 'btn alt', '🚶 Levantarse');
    stand.onclick = standUp;
    body.appendChild(stand);
  }

  // levantarse: a la casilla libre más cercana que no sea asiento
  function standUp() {
    const me = users.get(C.myId); if (!me) return;
    let best = null;
    for (let r = 1; r < 4 && !best; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = me.tx + dx, y = me.ty + dy;
      if (MAP.isPassable(x, y) && (!best || Math.abs(dx) + Math.abs(dy) < best.d)) best = { x, y, d: Math.abs(dx) + Math.abs(dy) };
    }
    if (best) { C.setTarget(me, best.x, best.y); net.send({ t: 'move', x: best.x, y: best.y }); }
  }

  function show(on) {
    M.open = on;
    panel.classList.toggle('hidden', !on);
    document.body.classList.toggle('at-mesa', on);
    // la crónica se pliega mientras estás a la mesa (para ver a todos) y vuelve como estaba al levantarte
    const log = document.getElementById('log'), tg = document.getElementById('log-toggle');
    if (log && tg) {
      if (on && !log.classList.contains('collapsed')) { tg.click(); M.foldedLog = true; }
      else if (!on && M.foldedLog) { if (log.classList.contains('collapsed')) tg.click(); M.foldedLog = false; }
    }
    if (on) { if (!M.plan) net.send({ t: 'mesa:get' }); render(); DD.sfx('open'); }
  }

  DD.on('mesa', (m) => {
    if (m.plan) M.plan = m.plan;
    else if (M.plan && M.plan.key !== m.key) net.send({ t: 'mesa:get' }); // el plano ha cambiado: pedirlo entero
    M.state = m; M.version++;
    render();
  });
  DD.on('welcome', () => { M.plan = null; M.state = null; net.send({ t: 'mesa:get' }); });

  // cada fotograma (desde tavern3d.js): ¿estoy sentado a la mesa de partida y quieto?
  function tick() {
    const me = users.get(C.myId);
    const on = !!(me && !me.where && DD.scene === 'tavern' && !me.path.length && MAP.atMapTable(me.tx, me.ty));
    if (on !== M.seated) { M.seated = on; show(on); }
    return on;
  }

  // al bajar a una partida (o salir de la taberna) el panel se cierra aunque no se dibuje la sala
  setInterval(() => { if (M.seated && DD.scene !== 'tavern') { M.seated = false; show(false); } }, 400);

  C.mesa = { M, drawPlan, tick, COLORS };
})();
