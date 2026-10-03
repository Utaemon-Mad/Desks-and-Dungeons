/* global MAP */
(() => {
  'use strict';

  // ======================================================================
  //  Geometría isométrica
  // ======================================================================
  const TW = 64, TH = 32;          // tamaño de una casilla en pantalla
  const WALL_H = 120;              // altura de las paredes
  const MARGIN = 30;
  const WORLD_W = (MAP.W + MAP.H) * TW / 2 + MARGIN * 2;
  const WORLD_H = (MAP.W + MAP.H) * TH / 2 + WALL_H + MARGIN * 2 + 20;
  const OX = MAP.H * TW / 2 + MARGIN;
  const OY = WALL_H + MARGIN + 20;

  const iso = (x, y) => ({ x: OX + (x - y) * TW / 2, y: OY + (x + y) * TH / 2 });

  const canvas = document.getElementById('scene');
  const mainCtx = canvas.getContext('2d');
  let ctx = mainCtx; // contexto activo (se cambia al dibujar retratos o la capa estática)
  let view = { scale: 1, ox: 0, oy: 0, dpr: 1 };

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth, h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const mobile = w <= 820;
    const panelW = mobile || heroesEl.classList.contains('closed') ? 0 : 280;
    const availW = w - panelW, top = mobile ? 80 : 10, bottom = mobile ? 150 : 84;
    const availH = h - top - bottom;
    const scale = Math.min(availW / WORLD_W, availH / WORLD_H);
    // En móvil la sala va arriba, dejando sitio a la crónica debajo
    const oy = mobile ? top : top + (availH - WORLD_H * scale) / 2;
    view = { dpr, scale, ox: (availW - WORLD_W * scale) / 2, oy };
  }

  // Centro de una casilla en coordenadas de la ventana (útil para pruebas automáticas)
  window.__tileToScreen = (x, y) => { const p = iso(x + 0.5, y + 0.5); return { x: view.ox + p.x * view.scale, y: view.oy + p.y * view.scale }; };

  function screenToTile(cx, cy) {
    const wx = (cx - view.ox) / view.scale, wy = (cy - view.oy) / view.scale;
    const a = (wx - OX) / (TW / 2), b = (wy - OY) / (TH / 2);
    return { x: Math.floor((a + b) / 2), y: Math.floor((b - a) / 2), wx, wy };
  }

  // ======================================================================
  //  Utilidades de dibujo
  // ======================================================================
  const OUT = '#24140a';

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f; } else { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
    return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  }

  function poly(pts, fill, stroke, lw = 1.5) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
  }

  const up = (p, h) => ({ x: p.x, y: p.y - h });

  // Caja isométrica desde (x,y) con tamaño (w,d) en casillas y altura h en píxeles, elevada z.
  function isoBox(x, y, w, d, h, color, z = 0, opts = {}) {
    const a = up(iso(x, y), z), b = up(iso(x + w, y), z), c = up(iso(x + w, y + d), z), e = up(iso(x, y + d), z);
    const stroke = opts.stroke === undefined ? OUT : opts.stroke;
    poly([e, c, up(c, h), up(e, h)], shade(color, -0.25), stroke);     // cara +y
    poly([c, b, up(b, h), up(c, h)], shade(color, -0.45), stroke);     // cara +x
    poly([up(a, h), up(b, h), up(c, h), up(e, h)], opts.top || shade(color, 0.08), stroke); // tapa
    return { a: up(a, h), b: up(b, h), c: up(c, h), e: up(e, h) };
  }

  function ellipse(cx, cy, rx, ry, fill, stroke, lw = 1.5) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
  }

  function cylinder(cx, cy, rx, ry, h, color, topColor) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI);
    ctx.lineTo(cx - rx, cy - h);
    ctx.ellipse(cx, cy - h, rx, ry, 0, Math.PI, 0, true);
    ctx.closePath();
    const g = ctx.createLinearGradient(cx - rx, 0, cx + rx, 0);
    g.addColorStop(0, shade(color, -0.1)); g.addColorStop(0.35, shade(color, 0.15)); g.addColorStop(1, shade(color, -0.45));
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = OUT; ctx.lineWidth = 1.5; ctx.stroke();
    ellipse(cx, cy - h, rx, ry, topColor || shade(color, 0.1), OUT);
  }

  function rrect(x, y, w, h, r, fill, stroke, lw = 2) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
  }

  // Generador pseudoaleatorio estable para que la decoración no "baile"
  function rand(seed) { const s = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }

  // ======================================================================
  //  Escenario estático (suelo y paredes) pre-renderizado
  // ======================================================================
  let staticLayer = null;

  function buildStatic() {
    staticLayer = document.createElement('canvas');
    const s = 2; // resolución interna
    staticLayer.width = WORLD_W * s; staticLayer.height = WORLD_H * s;
    const c = staticLayer.getContext('2d');
    c.scale(s, s);
    withCtx(c, () => { drawWalls(); drawFloor(); });
  }

  // Permite reutilizar las funciones de dibujo con otro contexto
  function withCtx(c, fn) {
    const prev = ctx; ctx = c;
    try { fn(); } finally { ctx = prev; }
  }

  function drawFloor() {
    // Plataforma con grosor bajo el suelo
    const A = iso(0, 0), B = iso(MAP.W, 0), C = iso(MAP.W, MAP.H), D = iso(0, MAP.H);
    poly([D, C, up(C, -18), up(D, -18)], '#2c1a0e', OUT);
    poly([C, B, up(B, -18), up(C, -18)], '#1f1209', OUT);
    // Tablones
    for (let x = 0; x < MAP.W; x++) {
      for (let y = 0; y < MAP.H; y++) {
        const base = ['#7a4e2c', '#74492a', '#80522f'][(x * 7 + y * 3) % 3];
        poly([iso(x, y), iso(x + 1, y), iso(x + 1, y + 1), iso(x, y + 1)], base, null);
        // vetas en dirección x
        ctx.strokeStyle = 'rgba(40,20,8,.35)'; ctx.lineWidth = 1;
        for (let k = 1; k < 3; k++) {
          const p = iso(x, y + k / 3), q = iso(x + 1, y + k / 3);
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
        }
        if (rand(x * 31 + y) > 0.8) {
          const p = iso(x + 0.3 + rand(x + y * 9) * 0.4, y + 0.5);
          ellipse(p.x, p.y, 1.5, 1, 'rgba(30,15,5,.6)');
        }
      }
    }
    // Juntas entre casillas (líneas a lo largo de y para marcar los tablones)
    ctx.strokeStyle = 'rgba(30,14,5,.55)'; ctx.lineWidth = 1.2;
    for (let x = 0; x <= MAP.W; x++) { const p = iso(x, 0), q = iso(x, MAP.H); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); }
    poly([A, B, C, D], null, OUT, 2);

    // Alfombra
    const r = MAP.rug;
    poly([iso(r.x0, r.y0), iso(r.x1, r.y0), iso(r.x1, r.y1), iso(r.x0, r.y1)], '#1f4a52', OUT, 2);
    poly([iso(r.x0 + .25, r.y0 + .25), iso(r.x1 - .25, r.y0 + .25), iso(r.x1 - .25, r.y1 - .25), iso(r.x0 + .25, r.y1 - .25)], '#2a6670', '#c9a54a', 2);
    poly([iso(r.x0 + .55, r.y0 + .55), iso(r.x1 - .55, r.y0 + .55), iso(r.x1 - .55, r.y1 - .55), iso(r.x0 + .55, r.y1 - .55)], null, 'rgba(201,165,74,.6)', 1);
  }

  function drawWalls() {
    const A = iso(0, 0), B = iso(MAP.W, 0), D = iso(0, MAP.H);
    // Pared izquierda (a lo largo de y): yeso arriba, madera abajo
    poly([A, D, up(D, WALL_H), up(A, WALL_H)], '#e6dcc4', OUT, 2);
    poly([A, D, up(D, 38), up(A, 38)], '#5a3a22', OUT, 2);
    // Pared derecha (a lo largo de x)
    poly([A, B, up(B, WALL_H), up(A, WALL_H)], '#d9cdb2', OUT, 2);
    poly([A, B, up(B, 38), up(A, 38)], '#4e321d', OUT, 2);
    // Tablas del zócalo
    ctx.strokeStyle = 'rgba(20,10,4,.5)'; ctx.lineWidth = 1;
    for (let i = 0; i <= MAP.H; i += 0.5) { const p = iso(0, i); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - 38); ctx.stroke(); }
    for (let i = 0; i <= MAP.W; i += 0.5) { const p = iso(i, 0); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - 38); ctx.stroke(); }
    // Vigas de entramado
    const beam = '#4a2e1a';
    for (const yy of [0.02, 8, 11.95]) { const p = iso(0, yy); rrect(p.x - 4, p.y - WALL_H, 8, WALL_H, 0, beam, OUT, 1.5); }
    for (const xx of [4, 9.5, 13.95]) { const p = iso(xx, 0); rrect(p.x - 4, p.y - WALL_H, 8, WALL_H, 0, beam, OUT, 1.5); }
    // Viga superior
    poly([up(A, WALL_H), up(D, WALL_H), up(D, WALL_H + 10), up(A, WALL_H + 10)], '#3b2414', OUT, 1.5);
    poly([up(A, WALL_H), up(B, WALL_H), up(B, WALL_H + 10), up(A, WALL_H + 10)], '#3b2414', OUT, 1.5);
    poly([up(A, 38), up(D, 38), up(D, 42), up(A, 42)], '#3b2414', null);
    poly([up(A, 38), up(B, 38), up(B, 42), up(A, 42)], '#3b2414', null);

    // --- Decoración de la pared derecha ---
    // Cuadro
    wallRectX(1.6, 3.2, 58, 98, '#5a2a10', OUT);
    wallRectX(1.8, 3.0, 62, 94, '#7a1e1e', null);
    wallRectX(2.0, 2.8, 66, 90, '#c0472e', null);
    // Puerta
    wallRectX(7.4, 8.9, 0, 92, '#3b2414', OUT);
    wallRectX(7.55, 8.75, 0, 86, '#6b4528', OUT);
    for (let k = 0; k < 4; k++) wallRectX(7.6 + k * 0.29, 7.8 + k * 0.29, 4, 82, k % 2 ? '#5f3c22' : '#76502f', null);
    { const p = iso(8.55, 0); ellipse(p.x, p.y - 44, 2.5, 2.5, '#e0b040', OUT, 1); }
    // Tablón de misiones
    wallRectX(5.0, 6.7, 50, 98, '#5a3a22', OUT);
    for (let k = 0; k < 4; k++) {
      const x0 = 5.15 + (k % 2) * 0.75, z0 = 54 + Math.floor(k / 2) * 21;
      wallRectX(x0, x0 + 0.6, z0, z0 + 18, k === 1 ? '#f4e6c0' : '#e8d6a8', OUT, 1);
      const pin = iso(x0 + 0.3, 0); ellipse(pin.x, pin.y - z0 - 16, 1.6, 1.6, '#c0392b');
    }
    // Estanterías con botellas detrás de la barra
    for (const z of [62, 92]) {
      wallRectX(10.2, 13.8, z - 4, z, '#4a2e1a', OUT);
      for (let i = 0; i < 9; i++) {
        const xx = 10.4 + i * 0.37;
        const col = ['#2e7d4f', '#7a2a2a', '#c49a3a', '#3a5a9a', '#6a3a8a'][(i * 3 + z) % 5];
        const p = iso(xx, 0);
        const hb = 12 + (i % 3) * 3;
        rrect(p.x - 3, p.y - z - hb, 6, hb, 1.5, col, OUT, 1);
        rrect(p.x - 1.2, p.y - z - hb - 5, 2.4, 5, 0, shade(col, -0.3), null);
        ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(p.x - 2, p.y - z - hb + 2, 1, hb - 4);
      }
    }
    // Ventana
    wallRectX(11.4, 12.6, WALL_H - 16, WALL_H - 2, '#3b2414', OUT);

    // --- Pared izquierda: muro de letras ---
    drawLetterWallBase();
    // Diana
    { const p = iso(0, 10.6); ellipse(p.x, p.y - 72, 13, 15, '#2a1a10', OUT); ellipse(p.x, p.y - 72, 9, 11, '#e8d6a8'); ellipse(p.x, p.y - 72, 5, 6, '#c0392b'); ellipse(p.x, p.y - 72, 1.5, 2, '#2a1a10'); }
  }

  // Rectángulo sobre la pared derecha entre x0..x1 y alturas z0..z1
  function wallRectX(x0, x1, z0, z1, fill, stroke, lw = 1.5) {
    const a = iso(x0, 0), b = iso(x1, 0);
    poly([up(a, z0), up(b, z0), up(b, z1), up(a, z1)], fill, stroke, lw);
  }

  // ---------- Muro de letras con lucecitas ----------
  const LETTER_ROWS = ['ABCDEFGH', 'IJKLMNOPQ', 'RSTUVWXYZ'];
  const BULB_COLORS = ['#ff4b4b', '#ffd23f', '#4bd1ff', '#5cff7a', '#ff8cf0', '#ff9b3d'];
  const letterPos = {}; // letra -> {x, y} en coordenadas de mundo

  (function computeLetterPositions() {
    LETTER_ROWS.forEach((row, r) => {
      for (let i = 0; i < row.length; i++) {
        const yy = 7.1 - i * 0.62 - (r === 0 ? 0.25 : 0);
        const z = 108 - r * 28;
        const p = iso(0, yy);
        letterPos[row[i]] = { x: p.x, y: p.y - z, r, i };
      }
    });
  })();

  function drawLetterWallBase() {
    ctx.save();
    ctx.fillStyle = '#1b1410';
    ctx.font = '700 19px "Pixelify Sans", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const [ch, p] of Object.entries(letterPos)) {
      ctx.save();
      ctx.translate(p.x, p.y + 11);
      ctx.transform(1, -0.5, 0, 1, 0, 0);
      ctx.rotate((rand(ch.charCodeAt(0)) - 0.5) * 0.25);
      ctx.fillText(ch, 0, 0);
      ctx.restore();
    }
    ctx.restore();
  }

  const wall = { queue: [], current: null, until: 0, author: '' };

  function wallSpell(text, author) {
    const letters = text.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/Ñ/g, 'N');
    const seq = [];
    for (const ch of letters) {
      if (letterPos[ch]) seq.push(ch);
      else if (ch === ' ' && seq[seq.length - 1] !== ' ') seq.push(' ');
    }
    if (!seq.length) return;
    wall.queue.push(...seq.slice(0, 40), '|');
    wall.author = author;
  }

  function updateWall(now) {
    if (wall.current !== null && now < wall.until) return;
    wall.current = null;
    if (!wall.queue.length) return;
    const ch = wall.queue.shift();
    wall.current = ch;
    wall.until = now + (ch === ' ' ? 350 : ch === '|' ? 900 : 600);
    if (ch !== ' ' && ch !== '|') blip(300 + ch.charCodeAt(0) * 6, 0.12);
  }

  function drawWallLights(now) {
    const entries = Object.entries(letterPos);
    // Cable
    ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 1.2;
    for (let r = 0; r < 3; r++) {
      const row = entries.filter(([, p]) => p.r === r);
      ctx.beginPath();
      row.forEach(([, p], i) => {
        const bx = p.x, by = p.y - 6;
        if (i === 0) ctx.moveTo(bx + 14, by - 9);
        ctx.quadraticCurveTo(bx + 7, by - 1, bx, by - 3);
      });
      ctx.stroke();
    }
    const spelling = wall.queue.length > 0 || wall.current !== null;
    for (const [ch, p] of entries) {
      const col = BULB_COLORS[(ch.charCodeAt(0) * 7) % BULB_COLORS.length];
      const lit = wall.current === ch;
      const twinkle = !spelling && Math.sin(now / 700 + ch.charCodeAt(0) * 1.7) > 0.55;
      const bx = p.x, by = p.y - 6;
      if (lit || twinkle) {
        const rad = lit ? 26 : 9;
        const g = ctx.createRadialGradient(bx, by, 0, bx, by, rad);
        g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = lit ? 0.9 : 0.45;
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(bx, by, rad, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
      ellipse(bx, by, 2.6, 3.6, lit || twinkle ? shade(col, 0.4) : shade(col, -0.45), '#111', 1);
    }
  }

  // ======================================================================
  //  Muebles (objetos con profundidad)
  // ======================================================================
  function furnitureDrawables() {
    const list = [];
    for (const it of MAP.items) {
      const d = it.x + it.y;
      switch (it.type) {
        case 'barrel': list.push({ depth: d + 0.6, draw: () => drawBarrel(it) }); break;
        case 'crate': list.push({ depth: d + 0.6, draw: () => drawCrate(it) }); break;
        case 'table': list.push({ depth: d + 0.6, draw: () => drawTable(it) }); break;
        case 'roundtable': list.push({ depth: d + 0.6, draw: () => drawRoundTable(it) }); break;
        case 'bar': list.push({ depth: d + 0.6, draw: () => drawBar(it) }); break;
        case 'stool': list.push({ depth: d + 0.2, draw: () => drawStool(it) }); break;
        case 'chair': {
          list.push({ depth: d + 0.2, draw: () => drawChairSeat(it) });
          const front = it.dir === 'N' || it.dir === 'W';
          list.push({ depth: d + (front ? 0.85 : 0.25), draw: () => drawChairBack(it) });
          break;
        }
        case 'sofa': list.push({ depth: d + 0.2, draw: () => drawSofa(it) }); break;
      }
    }
    // El mapa sobre la mesa de juego, después de todas sus casillas
    list.push({ depth: 5 + 7 + 0.65, draw: drawTableMap });
    // El tabernero
    list.push({ depth: 12 + 4 + 0.5, draw: drawBartender });
    return list;
  }

  function drawBarrel(it) {
    const c = iso(it.x + 0.5, it.y + 0.5);
    cylinder(c.x, c.y + 2, 20, 10, 40, '#7a4a22', '#5e3818');
    ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 3;
    for (const hh of [9, 31]) { ctx.beginPath(); ctx.ellipse(c.x, c.y + 2 - hh, 20.5, 10, 0, 0, Math.PI); ctx.stroke(); }
    ellipse(c.x, c.y - 38, 13, 6.5, null, 'rgba(0,0,0,.35)', 1);
  }

  function drawCrate(it) {
    const s = it.small ? 0.2 : 0.08;
    const h = it.small ? 24 : 34;
    const t = isoBox(it.x + s, it.y + s, 1 - 2 * s, 1 - 2 * s, h, '#a0703c');
    // listones en X
    const a = iso(it.x + s, it.y + 1 - s), b = iso(it.x + 1 - s, it.y + 1 - s);
    ctx.strokeStyle = '#5a3a1a'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(a.x + 3, a.y - 3); ctx.lineTo(b.x - 3, b.y - h + 3); ctx.moveTo(a.x + 3, a.y - h + 3); ctx.lineTo(b.x - 3, b.y - 3); ctx.stroke();
    poly([t.a, t.b, t.c, t.e], null, '#5a3a1a', 1);
  }

  function drawTable(it) {
    const legs = '#4a2e1a';
    // patas sólo en las esquinas de la mesa grande
    if (it.y === 7) { const p = iso(it.x + 0.5, it.y + 0.9); rrect(p.x - 2, p.y - 24, 4, 24, 0, legs, OUT, 1); }
    isoBox(it.x, it.y, 1, 1, 6, '#8a5a30', 24, { stroke: null, top: '#9c6a3a' });
  }

  function drawTableMap() {
    const z = 30;
    const pts = [iso(3.25, 6.2), iso(5.8, 6.2), iso(5.8, 7.8), iso(3.25, 7.8)].map((p) => up(p, z));
    poly([iso(3, 6), iso(6, 6), iso(6, 8), iso(3, 8)].map((p) => up(p, z)), null, OUT, 1.5);
    poly(pts, '#e8d6a8', '#8a6a3a', 1.5);
    // garabatos del mapa
    ctx.strokeStyle = '#6b8a4a'; ctx.lineWidth = 2;
    const m = (x, y) => up(iso(x, y), z);
    ctx.beginPath(); let p = m(3.6, 6.5); ctx.moveTo(p.x, p.y); p = m(4.3, 6.9); ctx.lineTo(p.x, p.y); p = m(4.8, 6.6); ctx.lineTo(p.x, p.y); p = m(5.4, 7.3); ctx.lineTo(p.x, p.y); ctx.stroke();
    ctx.strokeStyle = '#4a7ab0'; ctx.beginPath(); p = m(3.5, 7.5); ctx.moveTo(p.x, p.y); p = m(4.4, 7.2); ctx.lineTo(p.x, p.y); p = m(5.0, 7.6); ctx.lineTo(p.x, p.y); ctx.stroke();
    p = m(5.0, 6.9); ellipse(p.x, p.y, 3, 1.5, '#c0392b');
    // fichas y dados
    const tokens = [[3.4, 6.35, '#d8433b'], [5.6, 7.6, '#4b7ea6'], [3.3, 7.65, '#f2c94c'], [5.65, 6.4, '#5cb85c']];
    for (const [tx, ty, col] of tokens) { const q = m(tx, ty); cylinder(q.x, q.y, 3, 1.6, 4, col); }
    const dd = m(4.6, 7.55); isoBoxAt(dd.x, dd.y, 5, '#f4f0e6');
    // libro de reglas
    const bk = [m(5.9, 6.2), m(6.0, 6.2), m(6.0, 6.9), m(5.9, 6.9)];
    void bk;
  }

  function isoBoxAt(cx, cy, s, color) {
    poly([{ x: cx - s, y: cy }, { x: cx, y: cy + s / 2 }, { x: cx, y: cy + s / 2 - s }, { x: cx - s, y: cy - s }], shade(color, -0.2), OUT, 1);
    poly([{ x: cx, y: cy + s / 2 }, { x: cx + s, y: cy }, { x: cx + s, y: cy - s }, { x: cx, y: cy + s / 2 - s }], shade(color, -0.4), OUT, 1);
    poly([{ x: cx - s, y: cy - s }, { x: cx, y: cy - s * 1.5 }, { x: cx + s, y: cy - s }, { x: cx, y: cy + s / 2 - s }], color, OUT, 1);
  }

  function drawRoundTable(it) {
    const c = iso(it.x + 0.5, it.y + 0.5);
    rrect(c.x - 3, c.y - 22, 6, 22, 1, '#3b2414', OUT, 1);
    ellipse(c.x, c.y, 10, 5, '#3b2414', OUT);
    cylinder(c.x, c.y - 20, 26, 13, 5, '#7a4e2c', '#94643a');
    // vela y jarra
    rrect(c.x - 8, c.y - 38, 5, 12, 1, '#f4ecd0', OUT, 1);
    const fl = 1 + Math.sin(performance.now() / 120 + it.x) * 0.15;
    ellipse(c.x - 5.5, c.y - 42, 2 * fl, 3.5 * fl, '#ffcf4a');
    mug(c.x + 9, c.y - 26, 1);
  }

  function mug(x, y, s = 1) {
    rrect(x - 4 * s, y - 10 * s, 8 * s, 10 * s, 1.5, '#b8b8c0', OUT, 1);
    rrect(x - 4 * s, y - 11 * s, 8 * s, 3 * s, 1.5, '#fff6dc', null);
    ctx.strokeStyle = OUT; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x + 5 * s, y - 5 * s, 3 * s, -Math.PI / 2, Math.PI / 2); ctx.stroke();
    ctx.fillStyle = '#e0a020'; ctx.fillRect(x - 3 * s, y - 8 * s, 6 * s, 7 * s);
  }

  function drawBar(it) {
    const t = isoBox(it.x, it.y, 1, 1, 36, '#5a3a22', 0, { top: '#8a5a32' });
    // panel frontal
    const left = it.y === 8 && it.x > 10; // tramo horizontal
    ctx.strokeStyle = 'rgba(20,10,4,.6)'; ctx.lineWidth = 1;
    if (!left) { const a = iso(it.x + 1, it.y + 0.5); ctx.beginPath(); ctx.moveTo(a.x, a.y - 4); ctx.lineTo(a.x, a.y - 30); ctx.stroke(); }
    else { const a = iso(it.x + 0.5, it.y + 1); ctx.beginPath(); ctx.moveTo(a.x, a.y - 4); ctx.lineTo(a.x, a.y - 30); ctx.stroke(); }
    void t;
    const c = up(iso(it.x + 0.5, it.y + 0.5), 36);
    if (it.deco === 0) { mug(c.x - 6, c.y + 2); }
    else if (it.deco === 1) {
      const col = ['#2e7d4f', '#7a2a2a', '#3a5a9a'][(it.x + it.y) % 3];
      rrect(c.x + 2, c.y - 14, 6, 14, 2, col, OUT, 1); rrect(c.x + 3.8, c.y - 19, 2.4, 6, 0, shade(col, -0.3), null);
    }
  }

  function drawStool(it) {
    const c = iso(it.x + 0.5, it.y + 0.5);
    ctx.strokeStyle = '#3b2414'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(c.x - 8, c.y + 2); ctx.lineTo(c.x - 5, c.y - 16); ctx.moveTo(c.x + 8, c.y + 2); ctx.lineTo(c.x + 5, c.y - 16); ctx.moveTo(c.x, c.y + 5); ctx.lineTo(c.x, c.y - 16); ctx.stroke();
    cylinder(c.x, c.y - 16, 11, 5.5, 4, '#7a4e2c', '#9c6a3a');
  }

  function chairOffsets(dir) {
    // devuelve la caja del respaldo dentro de la casilla
    switch (dir) {
      case 'S': return [0.15, 0.1, 0.7, 0.14];   // respaldo en -y (mira a +y)
      case 'N': return [0.15, 0.76, 0.7, 0.14];  // respaldo en +y
      case 'E': return [0.1, 0.15, 0.14, 0.7];   // respaldo en -x
      case 'W': return [0.76, 0.15, 0.14, 0.7];  // respaldo en +x
    }
  }

  function drawChairSeat(it) {
    const c = iso(it.x + 0.5, it.y + 0.5);
    ctx.strokeStyle = '#3b2414'; ctx.lineWidth = 2.5;
    for (const [dx, dy] of [[-10, 0], [10, 0], [0, 5], [0, -5]]) { ctx.beginPath(); ctx.moveTo(c.x + dx, c.y + dy); ctx.lineTo(c.x + dx, c.y + dy - 14); ctx.stroke(); }
    isoBox(it.x + 0.15, it.y + 0.15, 0.7, 0.7, 4, '#7a4e2c', 14, { top: '#9c6a3a' });
  }

  function drawChairBack(it) {
    const [ox, oy, w, d] = chairOffsets(it.dir);
    isoBox(it.x + ox, it.y + oy, w, d, 22, '#6b4228', 18, { top: '#8a5a32' });
  }

  function drawSofa(it) {
    const blue = '#2a4a8a';
    isoBox(it.x + 0.12, it.y, 0.83, 1, 16, blue, 0, { stroke: null });
    // cojín
    isoBox(it.x + 0.2, it.y + 0.06, 0.7, 0.88, 4, '#3a62b0', 16, { stroke: 'rgba(10,20,50,.6)' });
    // respaldo contra la pared
    isoBox(it.x + 0.02, it.y, 0.22, 1, 26, '#23407a', 12, { stroke: null });
    if (it.end === 'start') isoBox(it.x + 0.12, it.y, 0.83, 0.16, 12, '#23407a', 14);
    if (it.end === 'end') isoBox(it.x + 0.12, it.y + 0.84, 0.83, 0.16, 12, '#23407a', 14);
    // botones capitoné
    const p = up(iso(it.x + 0.13, it.y + 0.5), 28);
    ellipse(p.x, p.y, 1.5, 1.5, '#162a55');
  }

  function drawBartender() {
    const c = iso(12.5, 4.5);
    const t = performance.now();
    drawHero(ctx, c.x, c.y, bartenderLook, { dir: 'W', walking: false, phase: 0, t, wiping: true, apron: true });
  }

  const bartenderLook = { cls: 'bardo', skin: 1, hair: 1, npc: true, color: '#7a4a2a', beard: '#6b4226', bald: true };

  // ======================================================================
  //  Personajes
  // ======================================================================
  // dir: E (+x, abajo-derecha), S (+y, abajo-izquierda), W (-x, arriba-izquierda), N (-y, arriba-derecha)
  function drawHero(c, x, y, look, o = {}) {
    withCtx(c, () => drawHeroImpl(c, x, y, look, o));
  }

  function drawHeroImpl(c, x, y, look, o) {
    const k = MAP.CLASSES[look.cls] || MAP.CLASSES.guerrero;
    const body = look.color || k.color, trim = k.trim;
    const skin = MAP.SKINS[look.skin] || MAP.SKINS[0];
    const hair = MAP.HAIRS[look.hair] || MAP.HAIRS[0];
    const back = o.dir === 'N' || o.dir === 'W';
    const flip = o.dir === 'S' || o.dir === 'N' ? -1 : 1; // S/N miran a la izquierda en pantalla
    const t = o.t || 0;
    const sit = !!o.sitting;
    let bob = o.walking ? Math.abs(Math.sin(o.phase * Math.PI)) * 3 : Math.sin(t / 500 + x) * 0.6;
    if (o.emote === 'dance') bob = Math.abs(Math.sin(t / 130)) * 6;
    if (o.emote === 'laugh') bob = Math.abs(Math.sin(t / 80)) * 2;
    const sway = o.emote === 'dance' ? Math.sin(t / 260) * 0.25 : 0;

    c.save();
    c.translate(x, y);
    // sombra
    if (!o.noShadow) ellipse(0, 0, 13, 5.5, 'rgba(0,0,0,.35)');
    c.translate(0, -(sit ? 14 : 0) - bob);
    c.rotate(sway);
    c.scale(flip, 1);

    // piernas
    if (!sit) {
      const sw = o.walking ? Math.sin(o.phase * Math.PI * 2) * 3 : 0;
      rrect(-6, -10 + Math.max(0, sw), 5, 10 - Math.max(0, sw), 1, '#3a2a20', OUT, 1.2);
      rrect(1, -10 + Math.max(0, -sw), 5, 10 - Math.max(0, -sw), 1, '#3a2a20', OUT, 1.2);
    } else {
      rrect(-6, -6, 12, 6, 2, '#3a2a20', OUT, 1.2);
    }

    // capa (maga, clérigo, pícaro) por detrás
    if (back && (look.cls === 'maga' || look.cls === 'picaro')) rrect(-9, -24, 18, 20, 3, shade(body, -0.3), OUT, 1.2);

    // cuerpo
    const robe = look.cls === 'maga' || look.cls === 'clerigo';
    if (robe && !sit) { poly([{ x: -9, y: -2 }, { x: 9, y: -2 }, { x: 7, y: -24 }, { x: -7, y: -24 }], body, OUT, 1.5); }
    else rrect(-8, -24, 16, 16, 3, body, OUT, 1.5);
    if (o.apron) rrect(-6, -20, 12, 16, 2, '#f4ecd8', OUT, 1);
    // cinturón
    rrect(-8, -13, 16, 3, 0, robe ? trim : '#3b2414', null);
    if (!back) { c.fillStyle = trim; c.fillRect(-1.5, -13, 3, 3); }
    if (look.cls === 'guerrero' && !back) { rrect(-6, -23, 12, 6, 2, '#a8a8b0', OUT, 1); }

    // brazos
    const armY = -22;
    const wave = o.emote === 'wave' || o.emote === 'fight';
    const holding = o.mug || o.emote === 'cheers';
    // brazo trasero
    rrect(-11, armY, 4, 11, 2, shade(body, -0.2), OUT, 1.2);
    // brazo delantero
    if (wave) {
      const ang = Math.sin(t / 110) * 0.5;
      c.save(); c.translate(9, armY + 2); c.rotate(-2.4 + ang);
      rrect(-2, 0, 4, 11, 2, body, OUT, 1.2); ellipse(0, 12, 2.6, 2.6, skin, OUT, 1);
      if (o.emote === 'fight') { rrect(-1, 12, 2, 14, 0, '#d0d0d8', OUT, 1); rrect(-4, 11, 8, 2, 0, '#6b4228', null); }
      c.restore();
    } else if (holding) {
      rrect(7, armY, 4, 8, 2, body, OUT, 1.2);
      c.save(); c.scale(flip, 1); mug(flip * 12, armY + 6, 0.8); c.restore();
    } else if (o.wiping) {
      const wx = Math.sin(t / 300) * 3;
      rrect(6 + wx, armY + 2, 4, 10, 2, body, OUT, 1.2);
      rrect(4 + wx, armY + 10, 8, 4, 1, '#d8d8e0', OUT, 1);
    } else {
      const swing = o.walking ? Math.sin(o.phase * Math.PI * 2) * 2 : 0;
      rrect(7, armY + swing, 4, 11, 2, body, OUT, 1.2);
      ellipse(9, armY + 11 + swing, 2.4, 2.4, skin, OUT, 1);
    }
    // laúd del bardo
    if (look.cls === 'bardo' && !look.npc && !back) { ellipse(-4, -14, 5, 4, '#a0602a', OUT, 1); rrect(-3, -26, 2, 12, 0, '#6b3a1a', null); }

    // cabeza
    const hy = -34;
    // orejas de elfo
    if (look.cls === 'elfo') {
      poly([{ x: -10, y: hy - 1 }, { x: -17, y: hy - 7 }, { x: -9, y: hy + 3 }], skin, OUT, 1.2);
      poly([{ x: 10, y: hy - 1 }, { x: 17, y: hy - 7 }, { x: 9, y: hy + 3 }], skin, OUT, 1.2);
    }
    ellipse(0, hy, 11, 10.5, skin, OUT, 1.6);
    // barba (tabernero)
    if (look.beard && !back) { poly([{ x: -8, y: hy + 2 }, { x: 8, y: hy + 2 }, { x: 5, y: hy + 12 }, { x: -5, y: hy + 12 }], look.beard, OUT, 1.2); }

    // pelo
    if (!look.bald) {
      if (back) {
        ellipse(0, hy - 1, 11.5, 10.5, hair, OUT, 1.6);
      } else {
        c.beginPath(); c.ellipse(0, hy - 2, 11.5, 9.5, 0, Math.PI, 0); c.lineTo(11, hy - 1);
        c.quadraticCurveTo(4, hy - 6, -2, hy - 3); c.quadraticCurveTo(-7, hy - 6, -11, hy); c.closePath();
        c.fillStyle = hair; c.fill(); c.strokeStyle = OUT; c.lineWidth = 1.4; c.stroke();
        if (look.cls === 'maga' || look.cls === 'elfo') { rrect(-12, hy - 3, 4, 14, 2, hair, OUT, 1.2); }
      }
    }

    // ojos
    if (!back) {
      const blink = (Math.floor(t / 100) + Math.floor(x)) % 40 === 0;
      c.fillStyle = '#1b1410';
      if (o.emote === 'laugh' || o.emote === 'sleep' || blink) {
        c.fillRect(1, hy + 1, 4, 1.5); c.fillRect(7, hy + 1, 3, 1.5);
      } else {
        c.fillRect(2, hy - 2, 2.5, 4); c.fillRect(7, hy - 2, 2.5, 4);
        c.fillStyle = '#fff'; c.fillRect(2, hy - 2, 1, 1); c.fillRect(7, hy - 2, 1, 1);
      }
      c.fillStyle = 'rgba(230,110,110,.45)'; c.fillRect(0, hy + 3, 3, 2); c.fillRect(8, hy + 3, 3, 2);
      if (o.emote === 'laugh' || o.emote === 'cheers') { c.fillStyle = '#5a1a1a'; c.fillRect(4, hy + 5, 4, 2.5); }
    }

    // sombreros y accesorios por clase
    switch (look.cls) {
      case 'maga':
        poly([{ x: -14, y: hy - 6 }, { x: 14, y: hy - 6 }, { x: 9, y: hy - 3 }, { x: -9, y: hy - 3 }], shade(body, -0.25), OUT, 1.4);
        poly([{ x: -9, y: hy - 6 }, { x: 9, y: hy - 6 }, { x: -2, y: hy - 30 }], body, OUT, 1.4);
        c.fillStyle = trim; c.fillRect(-1, hy - 16, 3, 3);
        break;
      case 'guerrero':
        c.beginPath(); c.ellipse(0, hy - 3, 12, 10, 0, Math.PI, 0); c.closePath();
        c.fillStyle = '#9aa0aa'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 1.4; c.stroke();
        rrect(-12, hy - 5, 24, 3, 1, '#7a808a', OUT, 1);
        poly([{ x: -11, y: hy - 6 }, { x: -18, y: hy - 18 }, { x: -8, y: hy - 10 }], '#f0e6d0', OUT, 1.2);
        poly([{ x: 11, y: hy - 6 }, { x: 18, y: hy - 18 }, { x: 8, y: hy - 10 }], '#f0e6d0', OUT, 1.2);
        break;
      case 'elfo':
        rrect(-11, hy - 8, 22, 3, 1, trim, OUT, 1);
        poly([{ x: -4, y: hy - 8 }, { x: -1, y: hy - 15 }, { x: 2, y: hy - 8 }], '#4caf50', OUT, 1);
        break;
      case 'picaro':
        c.beginPath(); c.ellipse(0, hy - 1, 13, 12.5, 0, Math.PI * 0.95, Math.PI * 0.05);
        if (!back) { c.lineTo(10, hy + 6); c.quadraticCurveTo(0, hy - 8, -10, hy + 6); }
        c.closePath(); c.fillStyle = body; c.fill(); c.strokeStyle = OUT; c.lineWidth = 1.4; c.stroke();
        if (!back) { c.fillStyle = '#222'; c.fillRect(-2, hy + 4, 12, 4); }
        break;
      case 'bardo':
        if (look.npc) break;
        c.beginPath(); c.ellipse(0, hy - 6, 13, 6, -0.15, Math.PI, 0); c.closePath();
        c.fillStyle = trim; c.fill(); c.strokeStyle = OUT; c.lineWidth = 1.4; c.stroke();
        poly([{ x: -6, y: hy - 9 }, { x: -16, y: hy - 24 }, { x: -3, y: hy - 11 }], '#e04040', OUT, 1.2);
        break;
      case 'clerigo':
        rrect(-11, hy - 9, 22, 3, 1, trim, OUT, 1);
        c.fillStyle = trim; c.fillRect(-1.5, hy - 14, 3, 6); c.fillRect(-3.5, hy - 12.5, 7, 2);
        break;
    }
    c.restore();
  }

  // ======================================================================
  //  Estado del juego
  // ======================================================================
  const users = new Map(); // id -> usuario
  let myId = null;
  let roomName = 'taberna';

  function makeUser(u) {
    return {
      id: u.id, name: u.name, look: u.look, gold: u.gold,
      tx: u.x, ty: u.y,          // casilla destino
      px: u.x, py: u.y,          // posición actual (continua)
      path: [], dir: 'S', phase: 0,
      bubble: null, emote: null, mugUntil: 0,
    };
  }

  function setTarget(u, x, y) {
    u.tx = x; u.ty = y;
    const sx = Math.round(u.px), sy = Math.round(u.py);
    const p = MAP.findPath(sx, sy, x, y);
    if (p) u.path = p;
    else { u.path = [{ x, y }]; }
  }

  const SPEED = 3.4; // casillas por segundo
  function updateUsers(dt) {
    for (const u of users.values()) {
      if (!u.path.length) { u.phase = 0; continue; }
      const next = u.path[0];
      const dx = next.x - u.px, dy = next.y - u.py;
      const dist = Math.hypot(dx, dy);
      const step = SPEED * dt;
      if (Math.abs(dx) > Math.abs(dy)) u.dir = dx > 0 ? 'E' : 'W';
      else if (dy !== 0) u.dir = dy > 0 ? 'S' : 'N';
      if (dist <= step) { u.px = next.x; u.py = next.y; u.path.shift(); }
      else { u.px += dx / dist * step; u.py += dy / dist * step; }
      u.phase += dt * 4;
      if (!u.path.length) {
        const seat = MAP.seatAt(u.tx, u.ty);
        if (seat && u.px === u.tx && u.py === u.ty) u.dir = seat.dir;
      }
    }
  }

  function userDrawable(u, now) {
    const seat = !u.path.length && u.px === u.tx && u.py === u.ty ? MAP.seatAt(u.tx, u.ty) : null;
    const emote = u.emote && u.emote.until > now ? u.emote.e : null;
    return {
      depth: u.px + u.py + 0.5,
      draw: () => {
        const c = iso(u.px + 0.5, u.py + 0.5);
        drawHero(ctx, c.x, c.y + (seat && seat.type === 'sofa' ? -2 : 0), u.look, {
          dir: u.dir, walking: u.path.length > 0, phase: u.phase, t: now, sitting: !!seat,
          emote, mug: u.mugUntil > now,
        });
        u._screen = { x: c.x, y: c.y - (seat ? 14 : 0) };
      },
    };
  }

  // ======================================================================
  //  Bocadillos, nombres y efectos
  // ======================================================================
  const EMOJI = { wave: '👋', dance: '💃', cheers: '🍻', laugh: '😂', heart: '❤️', fight: '⚔️', think: '🤔', sleep: '💤' };
  const floaters = []; // textos flotantes (dados, oro)

  function wrapText(text, maxW) {
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; }
      else line = test;
      while (ctx.measureText(line).width > maxW && line.length > 1) {
        let cut = line.length - 1;
        while (cut > 1 && ctx.measureText(line.slice(0, cut)).width > maxW) cut--;
        lines.push(line.slice(0, cut)); line = line.slice(cut);
      }
    }
    if (line) lines.push(line);
    return lines.slice(0, 5);
  }

  function drawOverlays(now) {
    const list = [...users.values()].filter((u) => u._screen).sort((a, b) => (a.px + a.py) - (b.px + b.py));
    for (const u of list) {
      const s = u._screen;
      const isMe = u.id === myId;
      // nombre
      ctx.font = '600 11px "Pixelify Sans", sans-serif';
      const label = u.name;
      const w = ctx.measureText(label).width + 10;
      const ny = s.y - 74;
      rrect(s.x - w / 2, ny - 8, w, 15, 4, isMe ? 'rgba(90,60,10,.85)' : 'rgba(20,10,4,.75)', isMe ? '#f2c94c' : null, 1);
      ctx.fillStyle = isMe ? '#ffe9a8' : '#f4ead2';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, s.x, ny);

      // emoji del gesto
      if (u.emote && u.emote.until > now) {
        const left = (u.emote.until - now) / 2600;
        ctx.font = '22px serif';
        ctx.globalAlpha = Math.min(1, left * 3);
        ctx.fillText(EMOJI[u.emote.e] || '', s.x + 18, ny - 14 - (1 - left) * 10);
        ctx.globalAlpha = 1;
      }

      // bocadillo
      if (u.bubble && u.bubble.until > now) {
        ctx.font = '16px "VT323", monospace';
        const lines = wrapText(u.bubble.text, 170);
        const lw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 16;
        const lh = 15, bh = lines.length * lh + 10;
        const by = ny - 14 - bh;
        const fade = Math.min(1, (u.bubble.until - now) / 400);
        ctx.globalAlpha = fade;
        rrect(s.x - lw / 2, by, lw, bh, 6, '#fbf3dc', OUT, 2);
        poly([{ x: s.x - 6, y: by + bh - 1 }, { x: s.x + 6, y: by + bh - 1 }, { x: s.x, y: by + bh + 8 }], '#fbf3dc', null);
        ctx.strokeStyle = OUT; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(s.x - 6, by + bh); ctx.lineTo(s.x, by + bh + 8); ctx.lineTo(s.x + 6, by + bh); ctx.stroke();
        ctx.fillStyle = '#2a1a10'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        lines.forEach((l, i) => ctx.fillText(l, s.x, by + 5 + i * lh));
        ctx.globalAlpha = 1;
      }
    }
    // textos flotantes
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      const u = users.get(f.id);
      const life = (now - f.start) / f.dur;
      if (life >= 1 || !u || !u._screen) { floaters.splice(i, 1); continue; }
      ctx.font = '700 22px "Pixelify Sans", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.globalAlpha = 1 - Math.max(0, life - 0.7) / 0.3;
      const y = u._screen.y - 100 - life * 30;
      ctx.lineWidth = 4; ctx.strokeStyle = '#1a0a04'; ctx.strokeText(f.text, u._screen.x, y);
      ctx.fillStyle = f.color; ctx.fillText(f.text, u._screen.x, y);
      ctx.globalAlpha = 1;
    }
    // bocadillo del tabernero
    if (barkeep.until > now) {
      const c = iso(12.5, 4.5);
      ctx.font = '15px "VT323", monospace';
      const tw = ctx.measureText(barkeep.text).width + 14;
      rrect(c.x - tw / 2, c.y - 92, tw, 20, 5, '#f4e6c0', OUT, 1.5);
      ctx.fillStyle = '#2a1a10'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(barkeep.text, c.x, c.y - 82);
    }
  }

  const barkeep = { text: '', until: 0, next: performance.now() + 15000 };
  const BARKEEP_LINES = [
    '¿Otra ronda, aventureros?', 'Hoy hay estofado de dragón.', 'Nada de magia dentro del local.',
    'He oído rumores en el tablón…', '¡Esa mesa se reserva para la partida!', 'Las luces se encienden solas… raro.',
    'Si rompéis algo, lo pagáis.', '¿Quién ha dejado este dado aquí?',
  ];
  function updateBarkeep(now) {
    if (now > barkeep.next) {
      barkeep.text = BARKEEP_LINES[Math.floor(Math.random() * BARKEEP_LINES.length)];
      barkeep.until = now + 4500;
      barkeep.next = now + 25000 + Math.random() * 25000;
    }
  }

  // Polvillo flotando
  const motes = Array.from({ length: 40 }, (_, i) => ({ x: rand(i) * WORLD_W, y: rand(i + 100) * WORLD_H, s: 0.5 + rand(i + 7) * 1.8, v: 4 + rand(i + 3) * 8 }));

  // ======================================================================
  //  Bucle de dibujo
  // ======================================================================
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    updateUsers(dt);
    updateWall(now);
    updateBarkeep(now);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // fondo rojo oscuro
    const g = ctx.createRadialGradient(canvas.width / 2, canvas.height * 0.4, 50, canvas.width / 2, canvas.height / 2, Math.max(canvas.width, canvas.height) * 0.75);
    g.addColorStop(0, '#4a0d0d'); g.addColorStop(0.6, '#250606'); g.addColorStop(1, '#0c0202');
    ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height);

    const k = view.dpr * view.scale;
    ctx.setTransform(k, 0, 0, k, view.ox * view.dpr, view.oy * view.dpr);
    if (!staticLayer) buildStatic();
    ctx.drawImage(staticLayer, 0, 0, WORLD_W, WORLD_H);

    drawWallLights(now);
    drawLanterns(now);

    // casilla bajo el ratón
    if (hover && MAP.isStandable(hover.x, hover.y)) {
      const occupied = MAP.isSeat(hover.x, hover.y) && [...users.values()].some((u) => u.id !== myId && u.tx === hover.x && u.ty === hover.y);
      poly([iso(hover.x, hover.y), iso(hover.x + 1, hover.y), iso(hover.x + 1, hover.y + 1), iso(hover.x, hover.y + 1)],
        occupied ? 'rgba(216,67,59,.3)' : 'rgba(255,230,150,.22)', occupied ? '#d8433b' : '#ffe9a8', 1.5);
    }
    // marcador de destino propio
    const me = users.get(myId);
    if (me && me.path.length) {
      const c = iso(me.tx + 0.5, me.ty + 0.5);
      const pulse = 1 + Math.sin(now / 120) * 0.15;
      ellipse(c.x, c.y, 12 * pulse, 6 * pulse, null, '#f2c94c', 2);
    }

    const drawables = furnitureDrawables();
    for (const u of users.values()) drawables.push(userDrawable(u, now));
    drawables.sort((a, b) => a.depth - b.depth);
    for (const d of drawables) d.draw();

    // luz cálida
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const L of LIGHTS) {
      const p = up(iso(L.x, L.y), L.z);
      const fl = 0.9 + Math.sin(now / 150 + L.x * 3) * 0.05 + Math.sin(now / 53 + L.y) * 0.03;
      const rg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, L.r * fl);
      rg.addColorStop(0, 'rgba(255,170,70,.22)'); rg.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(p.x, p.y, L.r * fl, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // polvillo
    ctx.fillStyle = 'rgba(255,120,100,.35)';
    for (const m of motes) {
      m.y -= m.v * dt; m.x += Math.sin(now / 2000 + m.s * 10) * 0.2;
      if (m.y < -10) { m.y = WORLD_H + 10; m.x = Math.random() * WORLD_W; }
      ctx.fillRect(m.x, m.y, m.s, m.s);
    }

    drawOverlays(now);
    requestAnimationFrame(frame);
  }

  const LIGHTS = [
    { x: 4, y: 0, z: 92, r: 120 }, { x: 9.5, y: 0, z: 92, r: 110 }, { x: 0, y: 8, z: 92, r: 110 },
    { x: 7.5, y: 3.5, z: 42, r: 60 }, { x: 6.5, y: 10.5, z: 42, r: 60 }, { x: 4.5, y: 7, z: 120, r: 150 },
  ];

  function drawLanterns(now) {
    for (const L of LIGHTS.slice(0, 3)) {
      const p = up(iso(L.x, L.y), L.z);
      rrect(p.x - 1, p.y - 14, 2, 8, 0, '#2a2a2a', null);
      rrect(p.x - 6, p.y - 6, 12, 14, 2, '#3a2a1a', OUT, 1.5);
      const fl = 0.85 + Math.sin(now / 90 + L.y) * 0.15;
      rrect(p.x - 4, p.y - 4, 8, 10, 1, `rgba(255,${180 + fl * 40},80,1)`, null);
    }
    // lámpara colgante sobre la mesa de partida
    const p = up(iso(4.5, 7), 120);
    ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(p.x, p.y - 40); ctx.lineTo(p.x, p.y); ctx.stroke();
    poly([{ x: p.x - 16, y: p.y + 8 }, { x: p.x + 16, y: p.y + 8 }, { x: p.x + 6, y: p.y - 2 }, { x: p.x - 6, y: p.y - 2 }], '#2f5a3a', OUT, 1.5);
    ellipse(p.x, p.y + 9, 8, 3, '#ffe08a');
  }

  // ======================================================================
  //  Interacción con el escenario
  // ======================================================================
  let hover = null;
  canvas.addEventListener('pointermove', (e) => {
    const t = screenToTile(e.clientX, e.clientY);
    hover = MAP.inBounds(t.x, t.y) ? t : null;
  });
  canvas.addEventListener('pointerleave', () => { hover = null; });
  canvas.addEventListener('click', (e) => {
    closePops();
    const t = screenToTile(e.clientX, e.clientY);
    // ¿clic en el muro de letras? (pared izquierda: x = 0)
    const wy = (OX - t.wx) / (TW / 2);
    const wz = iso(0, wy).y - t.wy;
    if (wy > 1.6 && wy < 7.3 && wz > 45 && wz < WALL_H) { askWall(); return; }
    if (!MAP.isStandable(t.x, t.y)) return;
    const me = users.get(myId);
    if (!me) return;
    if (MAP.isSeat(t.x, t.y) && [...users.values()].some((u) => u.id !== myId && u.tx === t.x && u.ty === t.y)) {
      toast('Ese asiento está ocupado.'); return;
    }
    setTarget(me, t.x, t.y);
    net.send({ t: 'move', x: t.x, y: t.y });
  });

  // Mover con el teclado (WASD / flechas) cuando no se está escribiendo
  window.addEventListener('keydown', (e) => {
    if (document.activeElement && (document.activeElement.tagName === 'INPUT')) return;
    if (e.key === 'Enter') { e.preventDefault(); chatInput.focus(); return; }
    const me = users.get(myId);
    if (!me || me.path.length) return;
    const dirs = { ArrowUp: [0, -1], w: [0, -1], ArrowDown: [0, 1], s: [0, 1], ArrowLeft: [-1, 0], a: [-1, 0], ArrowRight: [1, 0], d: [1, 0] };
    const d = dirs[e.key];
    if (!d) return;
    e.preventDefault();
    const x = me.tx + d[0], y = me.ty + d[1];
    if (!MAP.isStandable(x, y)) return;
    if (MAP.isSeat(x, y) && [...users.values()].some((u) => u.id !== myId && u.tx === x && u.ty === y)) return;
    setTarget(me, x, y);
    net.send({ t: 'move', x, y });
  });

  // ======================================================================
  //  Red
  // ======================================================================
  const net = {
    ws: null, retry: 0, profile: null,
    connect(profile) {
      this.profile = profile;
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${location.host}/ws`);
      this.ws = ws;
      ws.onopen = () => {
        this.retry = 0;
        connEl.classList.add('hidden');
        ws.send(JSON.stringify({ t: 'join', room: profile.room, name: profile.name, look: profile.look }));
      };
      ws.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch { return; } handle(m); };
      ws.onclose = () => {
        if (this.ws !== ws) return;
        connEl.classList.remove('hidden');
        const delay = Math.min(10000, 800 * 2 ** this.retry++);
        setTimeout(() => { if (this.ws === ws) this.connect(this.profile); }, delay);
      };
    },
    send(m) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); },
    close() { const ws = this.ws; this.ws = null; if (ws) ws.close(); },
  };

  function handle(m) {
    const now = performance.now();
    switch (m.t) {
      case 'welcome': {
        users.clear();
        myId = m.id; roomName = m.room;
        roomNameEl.textContent = m.room;
        history.replaceState(null, '', `?sala=${encodeURIComponent(m.room)}`);
        for (const u of m.users) users.set(u.id, makeUser(u));
        logEl.innerHTML = '';
        for (const h of m.history) logLine(h);
        renderHeroes();
        break;
      }
      case 'join': users.set(m.user.id, makeUser(m.user)); renderHeroes(); blip(660, 0.08); break;
      case 'leave': users.delete(m.id); renderHeroes(); break;
      case 'move': {
        const u = users.get(m.id);
        if (u && (u.tx !== m.x || u.ty !== m.y)) setTarget(u, m.x, m.y);
        break;
      }
      case 'chat': {
        const u = users.get(m.id);
        if (u) u.bubble = { text: m.text, until: now + 4000 + m.text.length * 60 };
        logLine(m);
        if (m.id !== myId) blip(520, 0.05);
        break;
      }
      case 'action': {
        const u = users.get(m.id);
        if (u) u.bubble = { text: '* ' + m.text + ' *', until: now + 5000 };
        logLine(m); break;
      }
      case 'emote': {
        const u = users.get(m.id);
        if (u) u.emote = { e: m.e, until: now + 2600 };
        break;
      }
      case 'drink': {
        const u = users.get(m.id);
        if (u) { u.mugUntil = now + 12000; u.emote = { e: 'cheers', until: now + 2600 }; }
        barkeep.text = '¡Marchando una jarra!'; barkeep.until = now + 2500;
        break;
      }
      case 'roll': {
        floaters.push({ id: m.id, text: `d${m.sides}: ${m.value}`, start: now, dur: 2600, color: m.sides === 20 && m.value === 20 ? '#ffd23f' : m.sides === 20 && m.value === 1 ? '#ff6b6b' : '#9fe0ff' });
        logLine(m); blip(880, 0.06); break;
      }
      case 'wall': wallSpell(m.text, m.name); logLine(m); break;
      case 'gold': {
        const u = users.get(m.id);
        if (u) { u.gold = m.gold; updateHeroGold(u); }
        break;
      }
      case 'rename': {
        const u = users.get(m.id);
        if (u) { u.name = m.name; renderHeroes(); }
        break;
      }
      case 'system': logLine(m); break;
      case 'error': toast(m.text); break;
    }
  }

  // ======================================================================
  //  Interfaz HTML
  // ======================================================================
  const $ = (s) => document.querySelector(s);
  const heroesEl = $('#heroes'), heroListEl = $('#hero-list'), countEl = $('#count');
  const logEl = $('#log-lines'), chatInput = $('#chat-input'), connEl = $('#conn'), roomNameEl = $('#room-name');
  const emotePop = $('#emote-pop'), menuPop = $('#menu-pop');

  function fmtTime(ts) { const d = new Date(ts || Date.now()); return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0'); }

  function logLine(m) {
    const div = document.createElement('div');
    div.className = 'line';
    const time = document.createElement('time'); time.textContent = fmtTime(m.ts); div.appendChild(time);
    if (m.t === 'chat') {
      const who = document.createElement('span');
      who.className = 'who';
      who.style.color = shade((MAP.CLASSES[m.cls] || MAP.CLASSES.guerrero).color, 0.45);
      who.textContent = m.name + ': ';
      div.appendChild(who);
      div.appendChild(document.createTextNode(m.text));
    } else if (m.t === 'wall') {
      div.classList.add('wall');
      div.appendChild(document.createTextNode(`💡 ${m.name} escribe en el muro: ${m.text}`));
    } else {
      div.classList.add(m.t === 'roll' ? 'roll' : m.t === 'action' ? 'action' : 'sys');
      div.appendChild(document.createTextNode(m.text));
    }
    const atBottom = logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 30;
    logEl.appendChild(div);
    while (logEl.children.length > 150) logEl.removeChild(logEl.firstChild);
    if (atBottom) logEl.scrollTop = logEl.scrollHeight;
  }

  function portrait(look, size = 58) {
    const c = document.createElement('canvas');
    c.width = size * 2; c.height = size * 2;
    const g = c.getContext('2d');
    g.scale(2, 2);
    g.translate(size / 2, size * 1.45);
    g.scale(1.55, 1.55);
    drawHero(g, 0, 0, look, { dir: 'E', t: 0, noShadow: true });
    return c;
  }

  function renderHeroes() {
    const list = [...users.values()].sort((a, b) => (a.id === myId ? -1 : b.id === myId ? 1 : a.name.localeCompare(b.name)));
    countEl.textContent = list.length;
    heroListEl.innerHTML = '';
    for (const u of list) {
      const k = MAP.CLASSES[u.look.cls];
      const card = document.createElement('div');
      card.className = 'hero' + (u.id === myId ? ' me' : '');
      card.dataset.id = u.id;
      const name = document.createElement('div'); name.className = 'hname'; name.textContent = u.name + (u.id === myId ? ' (tú)' : '');
      const row = document.createElement('div'); row.className = 'row';
      row.appendChild(portrait(u.look));
      const stats = document.createElement('div'); stats.className = 'stats';
      stats.innerHTML = `<div class="cls"></div><div>❤️ HP ${k.hp}</div><div>🗡️ ATT ${k.att}</div><div class="gold">🪙 <span></span></div>`;
      stats.querySelector('.cls').textContent = k.name;
      stats.querySelector('.gold span').textContent = u.gold;
      row.appendChild(stats);
      card.append(name, row);
      if (u.id !== myId) {
        const acts = document.createElement('div'); acts.className = 'acts';
        const greet = document.createElement('button'); greet.className = 'btn'; greet.textContent = 'SALUDAR';
        greet.onclick = () => net.send({ t: 'greet', to: u.id });
        const round = document.createElement('button'); round.className = 'btn alt'; round.textContent = 'INVITAR 🍺5';
        round.onclick = () => net.send({ t: 'round', to: u.id });
        acts.append(greet, round);
        card.appendChild(acts);
      }
      heroListEl.appendChild(card);
    }
  }

  function updateHeroGold(u) {
    const el = heroListEl.querySelector(`.hero[data-id="${u.id}"] .gold span`);
    if (el) el.textContent = u.gold;
  }

  let toastTimer = 0;
  function toast(text) {
    const t = $('#toast');
    t.textContent = text; t.classList.remove('hidden');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), 2600);
  }

  function closePops() { emotePop.classList.add('hidden'); menuPop.classList.add('hidden'); }

  function askWall() {
    const text = prompt('¿Qué quieres deletrear en el muro de luces? (máx. 40 letras)');
    if (text && text.trim()) net.send({ t: 'chat', text: '/muro ' + text.trim() });
  }

  $('#chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) { chatInput.blur(); return; }
    if (text === '/ayuda' || text === '/help') { showHelp(); chatInput.value = ''; return; }
    net.send({ t: 'chat', text });
    chatInput.value = '';
  });
  chatInput.addEventListener('keydown', (e) => { if (e.key === 'Escape') chatInput.blur(); });

  document.querySelectorAll('#bar .tool').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    const act = b.dataset.act;
    if (act === 'emotes') { menuPop.classList.add('hidden'); emotePop.classList.toggle('hidden'); }
    else if (act === 'menu') { emotePop.classList.add('hidden'); menuPop.classList.toggle('hidden'); }
    else if (act === 'dice') { closePops(); net.send({ t: 'roll', sides: 20 }); }
    else if (act === 'drink') { closePops(); net.send({ t: 'drink' }); }
    else if (act === 'wall') { closePops(); askWall(); }
    else if (act === 'heroes') {
      closePops();
      if (window.innerWidth <= 820) heroesEl.classList.toggle('open');
      else { heroesEl.classList.toggle('closed'); resize(); }
    }
  }));
  emotePop.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    net.send({ t: 'emote', e: b.dataset.e });
    const me = users.get(myId); if (me) me.emote = { e: b.dataset.e, until: performance.now() + 2600 };
    emotePop.classList.add('hidden');
  });
  menuPop.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const m = b.dataset.m;
    if (m === 'invite') {
      const url = `${location.origin}${location.pathname}?sala=${encodeURIComponent(roomName)}`;
      try { await navigator.clipboard.writeText(url); toast('¡Enlace copiado! Pásaselo a tus amigos.'); }
      catch { prompt('Copia este enlace y pásaselo a tus amigos:', url); }
    } else if (m === 'hero') { net.close(); users.clear(); showLogin(); }
    else if (m === 'help') showHelp();
    else if (m === 'sound') { sound = !sound; $('#sound-state').textContent = sound ? 'sí' : 'no'; save('dd-sound', sound ? '1' : '0'); return; }
    menuPop.classList.add('hidden');
  });
  $('#log-toggle').addEventListener('click', () => {
    const log = $('#log'); log.classList.toggle('collapsed');
    $('#log-toggle').textContent = log.classList.contains('collapsed') ? '+' : '–';
  });

  function showHelp() {
    logLine({ t: 'system', ts: Date.now(), text: 'Haz clic en el suelo para caminar y en una silla, taburete o el sofá para sentarte. Comandos: /dado 6, /d20, /muro HOLA, /me baila, /nombre Nuevo. Enter para escribir, WASD para moverte.' });
  }

  // ---------- Sonido ----------
  let sound = load('dd-sound') !== '0';
  let audio = null;
  function blip(freq, dur) {
    if (!sound) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = 'square'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.04, audio.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + dur);
      o.connect(g).connect(audio.destination); o.start(); o.stop(audio.currentTime + dur);
    } catch { /* sin audio */ }
  }

  function load(k) { try { return localStorage.getItem(k); } catch { return null; } }
  function save(k, v) { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } }

  // ======================================================================
  //  Pantalla de entrada
  // ======================================================================
  const loginEl = $('#login');
  const profile = (() => { try { return JSON.parse(load('dd-profile')) || {}; } catch { return {}; } })();
  const look = Object.assign({ cls: 'guerrero', skin: 0, hair: 0 }, profile.look);

  function showLogin() {
    loginEl.classList.remove('hidden');
    $('#login-name').value = profile.name || '';
    const urlRoom = new URLSearchParams(location.search).get('sala');
    $('#login-room').value = urlRoom || profile.room || 'taberna';
    buildPickers();
    setTimeout(() => $('#login-name').focus(), 50);
  }

  function buildPickers() {
    const cp = $('#class-pick'); cp.innerHTML = '';
    for (const [id, k] of Object.entries(MAP.CLASSES)) {
      const b = document.createElement('button'); b.type = 'button';
      b.className = look.cls === id ? 'on' : '';
      b.innerHTML = `<span></span><small>❤️${k.hp} 🗡️${k.att}</small>`;
      b.firstChild.textContent = k.name;
      b.onclick = () => { look.cls = id; buildPickers(); };
      cp.appendChild(b);
    }
    const sw = (el, colors, prop) => {
      el.innerHTML = '';
      colors.forEach((col, i) => {
        const b = document.createElement('button'); b.type = 'button';
        b.style.background = col; b.className = look[prop] === i ? 'on' : '';
        b.onclick = () => { look[prop] = i; buildPickers(); };
        el.appendChild(b);
      });
    };
    sw($('#skin-pick'), MAP.SKINS, 'skin');
    sw($('#hair-pick'), MAP.HAIRS, 'hair');
    const pv = $('#preview'), g = pv.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, pv.width, pv.height);
    g.translate(60, 104); g.scale(1.6, 1.6);
    drawHero(g, 0, 0, look, { dir: 'E', t: 0 });
  }

  $('#login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#login-name').value.trim().slice(0, 16);
    if (!name) return;
    const room = $('#login-room').value.trim() || 'taberna';
    Object.assign(profile, { name, room, look: { ...look } });
    save('dd-profile', JSON.stringify(profile));
    loginEl.classList.add('hidden');
    blip(440, 0.1);
    net.connect({ name, room, look: { ...look } });
  });

  // ======================================================================
  //  Arranque
  // ======================================================================
  window.addEventListener('resize', resize);
  resize();
  if (document.fonts) document.fonts.ready.then(() => { staticLayer = null; if (!loginEl.classList.contains('hidden')) buildPickers(); });
  showLogin();
  requestAnimationFrame(frame);
})();
