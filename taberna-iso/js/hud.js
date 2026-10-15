// Interfaz: barras, ranuras de habilidades con enfriamiento, rueda de acciones, minimapa, globos de diálogo y avisos.
(() => {
  const TI = (window.TI = window.TI || {});
  const $ = (id) => document.getElementById(id);

  // Iconos propios (SVG, trazo dorado)
  const G = '#e9cf8e', R = '#ff7a4a';
  const svg = (body, stroke = G, fill = 'none', w = 2.2) => `<svg viewBox="0 0 32 32" fill="${fill}" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  const ICON = {
    tajo: svg('<path d="M7 25 L23 7"/><path d="M21 5 l6 6"/><path d="M5 27 l4-1 -3-3z" fill="#e9cf8e"/><path d="M10 22 l-3 3"/>'),
    llamarada: svg('<path d="M16 4 C20 10 25 12 24 19 C23 25 19 28 16 28 C12 28 8 25 8 20 C8 16 11 14 12 10 C14 12 14 14 15 14 C15 10 15 7 16 4z" fill="#ff7a2a22"/><path d="M16 17 C18 20 19 21 18 24 C17 26 15 26 14 24 C13 22 15 20 16 17z" fill="#ffd27a"/>', R),
    esquiva: svg('<path d="M6 9 l7 7 -7 7"/><path d="M15 9 l7 7 -7 7"/><path d="M24 12 h4 M24 20 h4"/>'),
    guardia: svg('<path d="M7 7 L25 25"/><path d="M25 7 L7 25"/><path d="M5 5 l5 1 -1 5z M27 5 l-5 1 1 5z" fill="#e9cf8e"/><path d="M8 24 l-3 3 M24 24 l3 3"/>'),
    signo: svg('<path d="M16 5 L28 26 H4z" fill="#ff5a2a22"/><circle cx="16" cy="19" r="3.6" fill="#ffb070" stroke="none"/><path d="M16 9 v4"/>', '#ffb27a'),
    reloj: svg('<path d="M9 5 h14 M9 27 h14 M10 5 c0 8 12 8 12 16 v6 M22 5 c0 8 -12 8 -12 16 v6"/>', '#d9c9a0', 'none', 2),
    espadas: svg('<path d="M6 6 L24 24 M26 6 L8 24"/><path d="M4 8 l4-4 M28 8 l-4-4"/>', '#e8e0d0', 'none', 2),
    daga: svg('<path d="M24 5 L12 19"/><path d="M12 19 l-3 5 5-3z" fill="#d9c9a0"/><path d="M7 25 l4-4"/><path d="M21 14 l3 3"/>', '#d9c9a0', 'none', 2),
    equis: svg('<path d="M9 9 L23 23 M23 9 L9 23"/>', '#cdbf99', 'none', 2),
    tuerca: svg('<circle cx="16" cy="16" r="4"/><path d="M16 4 v4 M16 24 v4 M4 16 h4 M24 16 h4 M7.5 7.5 l3 3 M21.5 21.5 l3 3 M24.5 7.5 l-3 3 M10.5 21.5 l-3 3"/>', '#d9c9a0', 'none', 2),
    candado: svg('<rect x="9" y="14" width="14" height="11" rx="2" fill="#2a2016"/><path d="M12 14 v-3 a4 4 0 0 1 8 0 v3"/>', '#7a6a4a', 'none', 2),
  };
  TI.icons = ICON;

  const H = (TI.hud = {});
  const slotsEl = $('slots');
  H.slots = [];
  H.init = (skills, onUse) => {
    for (let i = 0; i < 8; i++) {
      const s = skills[i];
      const el = document.createElement('div');
      el.className = 'slot' + (s ? ' has' : '');
      if (s) {
        el.innerHTML = `${ICON[s.icon]}<span class="k">${i + 1}</span><div class="cd"></div><div class="cdt"></div>`;
        el.title = `${s.name} (${i + 1})`;
        el.addEventListener('pointerdown', (e) => { e.stopPropagation(); onUse(i); });
      } else if (i === 7) el.innerHTML = ICON.candado;
      slotsEl.appendChild(el);
      H.slots.push(el);
    }
    $('w-sign').innerHTML = ICON.signo; $('w-rest').innerHTML = ICON.reloj; $('w-draw').innerHTML = ICON.espadas; $('w-potion').innerHTML = ICON.daga;
    $('ic-x').innerHTML = ICON.equis; $('ic-sign').innerHTML = ICON.signo; document.querySelector('#minimap .gear').innerHTML = ICON.tuerca;
    for (const id of ['w-sign']) { const d = document.createElement('div'); d.className = 'cd'; $(id).appendChild(d); }
    setTimeout(() => { $('help').style.opacity = 0; }, 14000);
  };
  H.bind = (id, fn) => $(id).addEventListener('pointerdown', (e) => { e.stopPropagation(); fn(); });

  H.cooldown = (i, frac, secs) => {
    const el = H.slots[i]; if (!el) return;
    el.querySelector('.cd').style.setProperty('--p', (frac * 100).toFixed(1) + '%');
    const t = el.querySelector('.cdt'); t.style.opacity = frac > 0 ? 1 : 0; t.textContent = frac > 0 ? secs.toFixed(secs < 10 ? 1 : 0) : '';
    if (i === 1) $('w-sign').querySelector('.cd').style.setProperty('--p', (frac * 100).toFixed(1) + '%');
  };
  H.flash = (i) => { const el = H.slots[i]; if (!el) return; el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); };
  H.hp = (v, max) => { $('b-hp').style.width = (100 * v / max).toFixed(1) + '%'; $('hp-t').textContent = `${Math.round(v)} / ${max}`; };
  H.sta = (f) => { $('b-sta').style.width = (100 * f).toFixed(1) + '%'; };
  H.fury = (f) => { $('b-fury').style.width = (100 * f).toFixed(1) + '%'; };
  H.xp = (f) => { $('b-xp').style.width = (100 * f).toFixed(1) + '%'; };
  H.level = (n) => { $('lvl').textContent = n; };
  H.toast = (text) => { const d = document.createElement('div'); d.className = 'toast'; d.textContent = text; $('toasts').appendChild(d); setTimeout(() => d.remove(), 3300); };

  // Globo de diálogo sobre un punto de pantalla
  const bub = $('bubble'); let bubT = 0;
  H.say = (name, text, x, y, ms = 5200) => {
    bub.querySelector('b').textContent = name; bub.querySelector('span').textContent = text;
    bub.style.left = Math.max(150, Math.min(innerWidth - 150, x)) + 'px'; bub.style.top = Math.max(110, y) + 'px';
    bub.classList.add('on'); clearTimeout(bubT); bubT = setTimeout(H.hush, ms);
  };
  H.moveSay = (x, y) => { if (bub.classList.contains('on')) { bub.style.left = Math.max(150, Math.min(innerWidth - 150, x)) + 'px'; bub.style.top = Math.max(110, y) + 'px'; } };
  H.hush = () => bub.classList.remove('on');
  const tip = $('tip');
  H.tip = (text, x, y) => { if (!text) { tip.style.opacity = 0; return; } tip.textContent = text; tip.style.left = x + 'px'; tip.style.top = y + 'px'; tip.style.opacity = 1; };

  // ----- Minimapa: la sala vista desde arriba, girada como la cámara (diamante) -----
  const mm = $('mm'), mg = mm.getContext('2d');
  let base = null;
  const proj = (x, z, room) => { const S = 7.2; return [160 + (x - room.W / 2 - (z - room.D / 2)) * S * 0.72, 160 + (x - room.W / 2 + (z - room.D / 2)) * S * 0.42]; };
  H.buildMini = (room) => {
    const c = document.createElement('canvas'); c.width = c.height = 320; const g = c.getContext('2d');
    const quad = (x0, z0, x1, z1, fill, stroke) => {
      g.beginPath(); [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].forEach(([x, z], i) => { const [px, py] = proj(x, z, room); i ? g.lineTo(px, py) : g.moveTo(px, py); }); g.closePath();
      if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1.5; g.stroke(); }
    };
    g.fillStyle = '#100b08'; g.fillRect(0, 0, 320, 320);
    quad(0, 0, room.W, room.D, '#3a2818', '#8a6a3a');
    for (const r of room.rects) {
      const col = { barra: '#6a4524', chimenea: '#8a8078', mesa: '#7a5430', silla: '#4a3220', taburete: '#4a3220', barril: '#5a4020', cajas: '#5a4020', cesta: '#7a4a20' }[r.kind] || '#5a4020';
      quad(r.x0, r.z0, r.x1, r.z1, col, '#1a0f08');
    }
    // paredes
    g.lineWidth = 4; g.strokeStyle = '#c9a15a'; g.beginPath(); let p = proj(0, room.D, room); g.moveTo(...p); p = proj(0, 0, room); g.lineTo(...p); p = proj(room.W, 0, room); g.lineTo(...p); g.stroke();
    base = c;
  };
  H.mini = (room, hero, yaw) => {
    if (!base) return;
    mg.clearRect(0, 0, 320, 320);
    mg.drawImage(base, 0, 0);
    for (const n of room.npcs) { const [x, y] = proj(n.ctl.root.position.x, n.ctl.root.position.z, room); mg.fillStyle = '#f0b040'; mg.beginPath(); mg.arc(x, y, 4, 0, 6.28); mg.fill(); mg.strokeStyle = '#000'; mg.lineWidth = 1; mg.stroke(); }
    const [hx, hy] = proj(hero.x, hero.z, room);
    // flecha del héroe (apunta según su giro)
    const dx = Math.sin(yaw), dz = Math.cos(yaw);
    const [tx, ty] = proj(hero.x + dx * 1.6, hero.z + dz * 1.6, room);
    const a = Math.atan2(ty - hy, tx - hx);
    mg.save(); mg.translate(hx, hy); mg.rotate(a); mg.fillStyle = '#fff'; mg.strokeStyle = '#000'; mg.lineWidth = 2;
    mg.beginPath(); mg.moveTo(11, 0); mg.lineTo(-6, 7); mg.lineTo(-3, 0); mg.lineTo(-6, -7); mg.closePath(); mg.stroke(); mg.fill(); mg.restore();
  };
})();
