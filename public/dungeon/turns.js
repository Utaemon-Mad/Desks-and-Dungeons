/* global DD, DUNGEON */
// Combate por turnos en el navegador: barra de iniciativa arriba, panel de tu turno (movimiento, acción, acción
// adicional, reacción y tiempo), casillas a las que llegas pintadas en el suelo y avisos de ronda y turno.
// El servidor manda (server/turns.js); aquí sólo se enseña y se piden las órdenes de siempre (andar, atacar, habilidades).
(() => {
  'use strict';
  const D = DD.dg;
  const { $, game } = D;

  // ---------- Elementos ----------
  const view = D.viewEl;
  const strip = document.createElement('div'); strip.id = 'dinit'; strip.className = 'hidden';
  const panel = document.createElement('div'); panel.id = 'dturn'; panel.className = 'hidden';
  panel.innerHTML = '<div class="dt-head"><b id="dt-who"></b><span id="dt-round"></span></div>' +
    '<div class="dt-time"><i id="dt-bar"></i></div>' +
    '<div class="dt-res" id="dt-res"></div>' +
    '<div class="dt-btns"><button class="btn" type="button" id="dt-end" title="Terminar el turno (F)">⏭ TERMINAR TURNO</button>' +
    '<button class="btn alt" type="button" id="dt-dodge" title="Acción: hasta tu próximo turno es más fácil esquivar (Espacio)">🛡️ Defenderse</button>' +
    '<button class="btn alt hidden" type="button" id="dt-revive" title="Acción: reanima al compañero caído que tienes al lado">💚 Reanimar</button></div>' +
    '<p class="dt-hint" id="dt-hint"></p>' +
    '<div class="dt-cam"><button class="btn alt" type="button" id="dt-camL" title="Girar la cámara a la izquierda (,)">⟲</button>' +
    '<button class="btn alt" type="button" id="dt-camC" title="Volver a tu héroe (H); otra vez, quita el giro">🎯</button>' +
    '<button class="btn alt" type="button" id="dt-camR" title="Girar la cámara a la derecha (.)">⟳</button>' +
    '<small>Arrastra la vista para mirar alrededor</small></div>';
  const tban = document.createElement('div'); tban.id = 'dtbanner'; tban.className = 'hidden';
  view.appendChild(strip); view.appendChild(panel); view.appendChild(tban);
  $('#dt-end').onclick = () => DD.net.send({ t: 'dend' });
  $('#dt-dodge').onclick = () => DD.net.send({ t: 'droll', dx: 0, dy: 0 });
  $('#dt-revive').onclick = () => { const a = downedNear(); if (a) DD.net.send({ t: 'drevive', id: a.id }); };
  // cámara libre: girar de 90 en 90 y volver al héroe (arrastrar la vista va en dungeon.js)
  $('#dt-camL').onclick = () => D.camRotate(-1);
  $('#dt-camR').onclick = () => D.camRotate(1);
  $('#dt-camC').onclick = () => D.camCenter();
  window.addEventListener('keydown', (e) => {
    if (!game.active || !game.enc || DD.scene !== 'dungeon' || (document.activeElement && document.activeElement.tagName === 'INPUT')) return;
    if (document.querySelector('.overlay:not(.hidden)')) return;
    const k = e.key.toLowerCase();
    if (k === 'f' && myTurn()) { e.preventDefault(); DD.net.send({ t: 'dend' }); }
    else if (k === ',') D.camRotate(-1);
    else if (k === '.') D.camRotate(1);
    else if (k === 'h') D.camCenter();
  });

  const myTurn = () => !!(game.enc && game.enc.active && game.enc.active.k === 'p' && game.enc.active.id === DD.myId);
  function downedNear() {
    const me = game.ents.get(DD.myId);
    if (!me) return null;
    return [...game.ents.values()].find((e) => e.kind === 'hero' && e.id !== DD.myId && e.down && Math.max(Math.abs(e.x - me.x), Math.abs(e.y - me.y)) <= 1) || null;
  }
  const nameOf = (c) => (c.k === 'p' && c.id === DD.myId ? 'Tú' : c.name);

  // ---------- Cada instantánea ----------
  let lastKey = '';
  function update() {
    const E = game.enc;
    document.body.classList.toggle('in-turns', !!E);
    strip.classList.toggle('hidden', !E);
    panel.classList.toggle('hidden', !E);
    if (!E) { game.reach = null; lastKey = ''; return; }
    // barra de iniciativa (sólo se rehace si cambia el orden o el turno)
    const key = E.order.map((c) => c.id + (c.down ? 'd' : '')).join(',') + '|' + (E.active ? E.active.id : '') + '|' + E.round;
    if (key !== lastKey) {
      lastKey = key;
      strip.innerHTML = '';
      const lab = document.createElement('span'); lab.className = 'di-round'; lab.textContent = `Ronda ${E.round}`;
      strip.appendChild(lab);
      for (const c of E.order) {
        const ent = game.ents.get(c.id);
        const el = document.createElement('div');
        el.className = 'di-chip ' + (c.k === 'p' ? 'hero' : 'foe') + (c.id === DD.myId ? ' me' : '') + (E.active && E.active.id === c.id ? ' on' : '') + (c.down ? ' down' : '');
        const hp = ent && ent.maxHp ? Math.max(0, ent.hp / ent.maxHp) : 1;
        el.innerHTML = '<span class="di-init"></span><span class="di-name"></span><i class="di-hp"><b></b></i>';
        el.querySelector('.di-init').textContent = c.init;
        el.querySelector('.di-name').textContent = (c.down ? '💀 ' : '') + nameOf(c);
        el.querySelector('.di-hp b').style.width = Math.round(hp * 100) + '%';
        el.title = `Iniciativa ${c.init}`;
        strip.appendChild(el);
      }
      if (E.joining) { const j = document.createElement('span'); j.className = 'di-round'; j.textContent = `+${E.joining} se unen`; strip.appendChild(j); }
    }
    // panel del turno
    const mine = myTurn();
    const act = E.active && E.order.find((c) => c.id === E.active.id);
    panel.classList.toggle('mine', mine);
    $('#dt-who').textContent = mine ? '🎲 ¡TU TURNO!' : act ? `Turno de ${nameOf(act)}` : 'Siguiente turno…';
    $('#dt-round').textContent = `Ronda ${E.round}`;
    const res = $('#dt-res');
    res.innerHTML = '';
    const tb = mine && E.tb;
    if (tb) {
      const chip = (icon, label, ok, extra) => { const c = document.createElement('span'); c.className = 'dt-chip' + (ok ? '' : ' used'); c.textContent = `${icon} ${label}${extra ? ' ' + extra : ''}`; res.appendChild(c); };
      chip('👣', 'Movimiento', tb.move > 0, `${tb.move}/${tb.moveMax}`);
      chip('⚔️', 'Acción', tb.action > 0);
      chip('✚', 'Adicional', tb.bonus > 0);
      chip('↺', 'Reacción', !game.you || game.you.react !== 0);
    }
    $('#dt-end').classList.toggle('hidden', !mine);
    $('#dt-dodge').classList.toggle('hidden', !mine || !tb || tb.action <= 0);
    $('#dt-revive').classList.toggle('hidden', !mine || !tb || tb.action <= 0 || !downedNear());
    $('#dt-hint').textContent = mine
      ? 'Clic en el suelo para andar (casillas iluminadas), clic en un enemigo para atacar, 1-8 habilidades (acción), Q/E pociones (adicional). F termina el turno. Arrastra para mover la cámara; «,» y «.» la giran.'
      : act && act.k === 'p' ? 'Espera tu turno: puedes mirar el mapa y hablar por el chat.' : 'Los monstruos mueven ficha…';
    game.turnEnd = E.left !== undefined ? performance.now() + E.left : 0;
    game.turnMs = E.turnMs || 30000;
    game.reach = mine && tb && tb.move > 0 ? computeReach(tb.move) : null;
  }

  // Casillas a las que se llega con el movimiento que queda (8 direcciones, sin cortar esquinas ni atravesar a nadie)
  function computeReach(move) {
    const me = game.ents.get(DD.myId), map = game.map;
    if (!me || !map) return null;
    const w = map.w, h = map.h, T = DUNGEON.TILES;
    const walk = (x, y) => x >= 0 && y >= 0 && x < w && y < h && (T[map.tiles[y * w + x]] || {}).walk && !T[map.tiles[y * w + x]].portal;
    const busy = new Set();
    for (const e of game.ents.values()) if (e.id !== DD.myId && (e.kind === 'enemy' || e.kind === 'npc')) busy.add(e.y * w + e.x);
    for (const c of game.chests || []) if (!c.open) busy.add(c.y * w + c.x);
    const dist = new Map([[me.y * w + me.x, 0]]);
    let frontier = [[me.x, me.y]];
    for (let step = 1; step <= move; step++) {
      const next = [];
      for (const [x, y] of frontier) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          const nx = x + dx, ny = y + dy, k = ny * w + nx;
          if (dist.has(k) || !walk(nx, ny) || busy.has(k)) continue;
          if (dx && dy && !(walk(x + dx, y) && walk(x, y + dy))) continue;
          dist.set(k, step); next.push([nx, ny]);
        }
      }
      frontier = next;
    }
    dist.delete(me.y * w + me.x);
    return dist;
  }

  // ---------- Dibujo (debajo de nombres y barras) ----------
  function drawTurns(now) {
    const E = game.enc, g = D.g, map = game.map;
    if (!E || !map || !D.stage) return;
    // tiempo del turno
    if (game.turnEnd) {
      const left = Math.max(0, game.turnEnd - now);
      const bar = $('#dt-bar');
      bar.style.width = Math.round(100 * left / game.turnMs) + '%';
      bar.classList.toggle('low', left < 8000);
    } else $('#dt-bar').style.width = '100%';
    // casillas alcanzables
    if (game.reach && game.reach.size) {
      const P = (x, z) => D.stage.project(x, 0.03, z);
      g.save();
      for (const [k, d] of game.reach) {
        const x = k % map.w, y = Math.floor(k / map.w);
        if (!game.seen[k]) continue;
        const a = P(x + 0.06, y + 0.06), b = P(x + 0.94, y + 0.06), c = P(x + 0.94, y + 0.94), e = P(x + 0.06, y + 0.94);
        const hov = game.hover && game.hover.x === x && game.hover.y === y;
        g.fillStyle = hov ? 'rgba(255,226,120,.42)' : d <= 1 ? 'rgba(120,200,255,.26)' : 'rgba(120,200,255,.16)';
        g.strokeStyle = hov ? 'rgba(255,226,120,.9)' : 'rgba(150,215,255,.45)';
        g.lineWidth = 1;
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(c.x, c.y); g.lineTo(e.x, e.y); g.closePath(); g.fill(); g.stroke();
      }
      g.restore();
    }
    // quién tiene el turno: un aro dorado bajo sus pies
    if (E.active) {
      const ent = game.ents.get(E.active.id);
      if (ent && ent._top) {
        const c = D.stage.project(ent._top.x, 0.04, ent._top.z), r = D.stage.project(ent._top.x + 0.5, 0.04, ent._top.z);
        const rad = Math.max(10, Math.abs(r.x - c.x));
        g.save();
        g.strokeStyle = E.active.k === 'p' ? 'rgba(255,214,90,.95)' : 'rgba(255,90,70,.95)';
        g.lineWidth = 3;
        g.beginPath(); g.ellipse(c.x, c.y, rad, rad * 0.5, 0, 0, Math.PI * 2); g.stroke();
        g.restore();
      }
    }
  }

  // ---------- Avisos ----------
  function banner(text, cls) {
    tban.textContent = text; tban.className = cls || '';
    clearTimeout(banner.t); banner.t = setTimeout(() => tban.classList.add('hidden'), 1700);
  }
  function turnEvent(ev) {
    switch (ev.e) {
      case 'encstart': banner('⚔️ ¡COMBATE! Se para el tiempo', 'big'); DD.sfx('tele'); return true;
      case 'encend': banner('✔ Fin del combate', 'calm'); game.reach = null; return true;
      case 'round': return true;
      case 'turn':
        if (ev.skip) banner(`💫 ${ev.id === DD.myId ? 'Estás aturdido: pierdes el turno' : 'Aturdido: pierde el turno'}`);
        else if (ev.k === 'p' && ev.id === DD.myId) { banner('🎲 ¡Tu turno!', 'mine'); DD.sfx('ping'); }
        return true;
      case 'oa': {
        const t = game.ents.get(ev.t);
        if (t) game.floaters.push({ x: t.x, y: t.y, text: '¡Oportunidad!', color: '#ffd66a', start: performance.now() });
        return false;
      }
      case 'encjoin': return true;
    }
    return false;
  }

  Object.assign(D, { updateTurns: update, drawTurns, turnEvent, myTurn });
})();
