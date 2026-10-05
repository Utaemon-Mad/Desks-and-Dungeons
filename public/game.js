/* global MAP, RULES, SPRITES, THREE, MODELS, VIEW3D */
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

  // Editor de la taberna
  let isOwner = false, editing = false, editTool = 'barrel', editDir = 'S';

  // Puente con otros módulos (mazmorras): escena actual y eventos
  const DD = window.DD = {
    scene: 'tavern',
    handlers: {},
    on(t, fn) { (this.handlers[t] = this.handlers[t] || []).push(fn); },
    emit(t, m) { for (const fn of this.handlers[t] || []) fn(m); },
  };

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
  window.__tileToScreen = (x, y) => (T3.stage ? T3.stage.project(x + 0.5, 0, y + 0.5) : { x: 0, y: 0 });

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
    // Diana
    { const p = iso(0, 10.6); ellipse(p.x, p.y - 72, 13, 15, '#2a1a10', OUT); ellipse(p.x, p.y - 72, 9, 11, '#e8d6a8'); ellipse(p.x, p.y - 72, 5, 6, '#c0392b'); ellipse(p.x, p.y - 72, 1.5, 2, '#2a1a10'); }
  }

  // Rectángulo sobre la pared derecha entre x0..x1 y alturas z0..z1
  function wallRectX(x0, x1, z0, z1, fill, stroke, lw = 1.5) {
    const a = iso(x0, 0), b = iso(x1, 0);
    poly([up(a, z0), up(b, z0), up(b, z1), up(a, z1)], fill, stroke, lw);
  }

  // ---------- Ventanas a la noche ----------
  // Ventanas góticas en las paredes: lluvia, luna, árboles muertos, relámpagos y, a veces, unos ojos que miran.
  const WINDOWS = [
    { wall: 'L', a: 1.7, b: 3.5, z0: 46, z1: 96, moon: true },
    { wall: 'L', a: 4.7, b: 6.5, z0: 46, z1: 96 },
    { wall: 'R', a: 1.5, b: 3.3, z0: 46, z1: 96 },
  ];
  const night = { flashUntil: 0, flash2: 0, nextFlash: performance.now() + 9000 + Math.random() * 12000, eyes: null, nextEyes: performance.now() + 20000 + Math.random() * 25000, thunderAt: 0 };
  window.__ddNight = night; // para pruebas automáticas (forzar relámpagos y ojos)

  // Punto de la ventana: t de 0 a 1 a lo ancho, z en altura
  function winPt(w, t, z) {
    const s = w.a + (w.b - w.a) * t;
    return up(w.wall === 'L' ? iso(0, s) : iso(s, 0), z);
  }

  function winPath(c, w) {
    const a = winPt(w, 0, w.z0), b = winPt(w, 1, w.z0), c1 = winPt(w, 1, w.z1), d = winPt(w, 0, w.z1), top = winPt(w, 0.5, w.z1 + 18);
    c.beginPath();
    c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.lineTo(c1.x, c1.y);
    c.quadraticCurveTo(winPt(w, 0.85, w.z1 + 14).x, winPt(w, 0.85, w.z1 + 14).y, top.x, top.y);
    c.quadraticCurveTo(winPt(w, 0.15, w.z1 + 14).x, winPt(w, 0.15, w.z1 + 14).y, d.x, d.y);
    c.closePath();
  }

  function flashLevel(now) {
    if (now < night.flashUntil) return 1;
    if (now < night.flash2) return 0.6;
    return 0;
  }

  function updateNight(now) {
    if (now > night.nextFlash) {
      night.flashUntil = now + 110;
      night.flash2 = now + 330;
      night.thunderAt = now + 700 + Math.random() * 900;
      night.nextFlash = now + 15000 + Math.random() * 30000;
    }
    if (night.thunderAt && now > night.thunderAt) { night.thunderAt = 0; thunder(); }
    if (now > night.nextEyes) {
      const wi = Math.floor(Math.random() * WINDOWS.length);
      night.eyes = { wi, t: 0.25 + Math.random() * 0.5, z: WINDOWS[wi].z0 + 10 + Math.random() * 16, until: now + 3500 };
      night.nextEyes = now + 30000 + Math.random() * 40000;
    }
    if (night.eyes && now > night.eyes.until) night.eyes = null;
  }

  function drawWindows(now) {
    const fl = flashLevel(now);
    WINDOWS.forEach((w, wi) => {
      const top = winPt(w, 0.5, w.z1 + 18), bottom = winPt(w, 0.5, w.z0);
      const minX = Math.min(winPt(w, 0, 0).x, winPt(w, 1, 0).x), maxX = Math.max(winPt(w, 0, 0).x, winPt(w, 1, 0).x);
      const minY = top.y - 12, maxY = Math.max(winPt(w, 0, w.z0).y, winPt(w, 1, w.z0).y);
      ctx.save();
      winPath(ctx, w);
      ctx.clip();
      // cielo
      const sky = ctx.createLinearGradient(0, minY, 0, maxY);
      sky.addColorStop(0, fl ? '#b8c8ff' : '#070a1c'); sky.addColorStop(1, fl ? '#6a78b0' : '#141026');
      ctx.fillStyle = sky; ctx.fillRect(minX - 4, minY - 4, maxX - minX + 8, maxY - minY + 8);
      // estrellas
      if (!fl) for (let i = 0; i < 9; i++) {
        const sx = minX + rand(wi * 50 + i) * (maxX - minX), sy = minY + 6 + rand(wi * 70 + i) * (maxY - minY) * 0.5;
        ctx.fillStyle = `rgba(220,225,255,${0.3 + 0.4 * Math.abs(Math.sin(now / 900 + i))})`; ctx.fillRect(sx, sy, 1.2, 1.2);
      }
      // luna con nubes
      if (w.moon) {
        const mx = minX + (maxX - minX) * 0.62, my = minY + 20;
        const halo = ctx.createRadialGradient(mx, my, 2, mx, my, 26);
        halo.addColorStop(0, 'rgba(230,230,200,.45)'); halo.addColorStop(1, 'rgba(230,230,200,0)');
        ctx.fillStyle = halo; ctx.fillRect(mx - 30, my - 30, 60, 60);
        ellipse(mx, my, 8, 8, '#efe9c8'); ellipse(mx + 3, my - 2, 2, 2, '#d8d0a8'); ellipse(mx - 3, my + 3, 1.5, 1.5, '#d8d0a8');
        const cx = ((now / 120) % 90) - 30;
        ctx.fillStyle = 'rgba(20,18,40,.8)';
        ellipse(minX + cx, my + 4, 16, 4, 'rgba(20,18,40,.85)'); ellipse(minX + cx + 12, my + 1, 10, 3, 'rgba(20,18,40,.85)');
      }
      // colinas y árboles muertos
      const ground = maxY - 14;
      ctx.fillStyle = fl ? '#1a1830' : '#040409';
      ctx.beginPath(); ctx.moveTo(minX - 4, maxY + 4);
      for (let i = 0; i <= 8; i++) ctx.lineTo(minX + (maxX - minX) * i / 8, ground - Math.sin(i * 1.3 + wi) * 4 - 3);
      ctx.lineTo(maxX + 4, maxY + 4); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
      const tx = minX + (maxX - minX) * (0.25 + rand(wi * 9) * 0.5);
      ctx.beginPath();
      ctx.moveTo(tx, ground); ctx.lineTo(tx + 1, ground - 26);
      ctx.moveTo(tx + 1, ground - 16); ctx.lineTo(tx - 8, ground - 24); ctx.lineTo(tx - 11, ground - 30);
      ctx.moveTo(tx + 1, ground - 20); ctx.lineTo(tx + 9, ground - 27); ctx.lineTo(tx + 10, ground - 33);
      ctx.moveTo(tx - 4, ground - 21); ctx.lineTo(tx - 5, ground - 27);
      ctx.stroke();
      // ojos que miran desde fuera
      const ey = night.eyes;
      if (ey && ey.wi === wi && !fl) {
        const p = winPt(w, ey.t, ey.z);
        const blink = Math.floor(now / 140) % 18 === 0;
        const glow = 0.8 + 0.2 * Math.sin(now / 200);
        if (!blink) {
          const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 16);
          halo.addColorStop(0, `rgba(255,30,20,${0.55 * glow})`); halo.addColorStop(1, 'rgba(255,30,20,0)');
          ctx.fillStyle = halo; ctx.fillRect(p.x - 16, p.y - 16, 32, 32);
          ctx.fillStyle = `rgba(255,60,40,${glow})`;
          ctx.beginPath(); ctx.ellipse(p.x - 5, p.y, 3.4, 2.1, -0.3, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.ellipse(p.x + 5, p.y, 3.4, 2.1, 0.3, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#ffd0a0'; ctx.fillRect(p.x - 5.5, p.y - 0.6, 1.2, 1.2); ctx.fillRect(p.x + 4.5, p.y - 0.6, 1.2, 1.2);
        }
      }
      // niebla
      for (let i = 0; i < 3; i++) {
        const fx = minX - 30 + ((now / (60 + i * 25) + i * 40) % (maxX - minX + 60));
        ctx.fillStyle = 'rgba(120,120,150,.12)';
        ctx.beginPath(); ctx.ellipse(fx, ground + 2 - i * 3, 22, 4, 0, 0, Math.PI * 2); ctx.fill();
      }
      // lluvia
      ctx.strokeStyle = fl ? 'rgba(255,255,255,.5)' : 'rgba(150,170,230,.35)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 16; i++) {
        const rx = minX + ((rand(i + wi * 30) * (maxX - minX) + now / 9) % (maxX - minX + 10)) - 5;
        const ry = minY + ((rand(i * 7 + wi) * (maxY - minY) + now / 3) % (maxY - minY));
        ctx.moveTo(rx, ry); ctx.lineTo(rx - 2, ry + 6);
      }
      ctx.stroke();
      ctx.restore();
      // marco, parteluz y alféizar
      winPath(ctx, w);
      ctx.strokeStyle = '#24140a'; ctx.lineWidth = 6; ctx.stroke();
      ctx.strokeStyle = '#5a3a22'; ctx.lineWidth = 3; ctx.stroke();
      const m0 = winPt(w, 0.5, w.z0), m1 = winPt(w, 0.5, w.z1 + 16);
      const h0 = winPt(w, 0, (w.z0 + w.z1) / 2), h1 = winPt(w, 1, (w.z0 + w.z1) / 2);
      ctx.strokeStyle = '#3b2414'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(m0.x, m0.y); ctx.lineTo(m1.x, m1.y); ctx.moveTo(h0.x, h0.y); ctx.lineTo(h1.x, h1.y); ctx.stroke();
      const s0 = winPt(w, -0.06, w.z0 - 2), s1 = winPt(w, 1.06, w.z0 - 2);
      poly([s0, s1, up(s1, 5), up(s0, 5)], '#4a2e1a', OUT, 1.5);
      void bottom;
    });
  }

  // Trueno: ruido grave que se apaga
  function thunder() {
    if (!sound) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const len = audio.sampleRate * 1.6;
      const buf = audio.createBuffer(1, len, audio.sampleRate);
      const d = buf.getChannelData(0);
      let v = 0;
      for (let i = 0; i < len; i++) { v = (v + (Math.random() * 2 - 1) * 0.08) * 0.985; d[i] = v * Math.pow(1 - i / len, 2); }
      const src = audio.createBufferSource(), f = audio.createBiquadFilter(), g = audio.createGain();
      src.buffer = buf; f.type = 'lowpass'; f.frequency.value = 220; g.gain.value = 0.9;
      src.connect(f).connect(g).connect(audio.destination); src.start();
    } catch { /* sin audio */ }
  }

  // ---------- Oscuridad y luces ----------
  const lightCv = document.createElement('canvas');
  lightCv.width = Math.ceil(WORLD_W); lightCv.height = Math.ceil(WORLD_H);
  const lightG = lightCv.getContext('2d');

  // Antorchas de pared, velas y el farol de la mesa; las velas siguen a las mesas redondas
  function lightSources(now) {
    const list = TORCHES.map((L) => ({ p: up(iso(L.x, L.y), L.z), r: L.r, warm: true, seed: L.x + L.y }));
    const lamp = up(iso(4.5, 7), 110);
    list.push({ p: { x: lamp.x, y: lamp.y + 40 }, r: 115, warm: true, seed: 3 });
    for (const it of MAP.items) {
      const c = iso(it.x + 0.5, it.y + 0.5);
      if (it.type === 'roundtable') list.push({ p: { x: c.x - 5, y: c.y - 40 }, r: 70, warm: true, seed: it.x * 3 + it.y });
      if (it.type === 'fireplace') list.push({ p: { x: c.x, y: c.y - 10 }, r: 190, warm: true, seed: it.x });
      if (it.type === 'candelabra') list.push({ p: { x: c.x, y: c.y - 56 }, r: 110, warm: true, seed: it.y });
      if (it.type === 'chandelier') list.push({ p: { x: c.x, y: c.y - 70 }, r: 170, warm: true, seed: it.x + it.y });
      if (it.type === 'cauldron') list.push({ p: { x: c.x, y: c.y - 24 }, r: 90, color: [70, 255, 120], seed: it.x });
    }
    for (const m of Object.values(MAP.MERCHANTS)) {
      const pr = m.prop, c = iso(pr.x + 0.5, pr.y + 0.5);
      if (pr.type === 'cauldron') list.push({ p: { x: c.x, y: c.y - 24 }, r: 105, color: [70, 255, 120], seed: 5 });
      if (pr.type === 'crystal') list.push({ p: { x: c.x, y: c.y - 38 }, r: 95, color: [170, 90, 255], seed: 7 });
      if (pr.type === 'rack') { const q = iso(m.x + 0.5, m.y + 0.5); list.push({ p: { x: q.x, y: q.y - 50 }, r: 80, warm: true, seed: 9 }); }
    }
    for (const L of list) L.r *= 0.92 + Math.sin(now / 130 + L.seed * 3) * 0.05 + Math.sin(now / 47 + L.seed) * 0.03;
    return list;
  }

  function drawDarkness(now) {
    const fl = flashLevel(now);
    const g = lightG;
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, lightCv.width, lightCv.height);
    // sólo dentro de la sala (paredes y suelo), para que no se note el borde de la capa
    const A = iso(0, 0), B = iso(MAP.W, 0), C = iso(MAP.W, MAP.H), D = iso(0, MAP.H);
    g.beginPath();
    [up(D, WALL_H + 10), up(A, WALL_H + 10), up(B, WALL_H + 10), up(B, -18), up(C, -18), up(D, -18)].forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
    g.closePath();
    // al editar se aclara para ver bien dónde va cada mueble
    g.fillStyle = `rgba(3,3,12,${fl ? 0.2 : editing ? 0.3 : 0.66})`;
    g.fill();
    g.globalCompositeOperation = 'destination-out';
    const hole = (x, y, r, a) => {
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(0.5, `rgba(0,0,0,${a * 0.7})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    };
    const lights = lightSources(now);
    for (const L of lights) hole(L.p.x, L.p.y + 20, L.r, 0.95);
    // cada héroe se ve un poco en la penumbra
    for (const u of users.values()) {
      if (u.where) continue;
      const c = iso(u.px + 0.5, u.py + 0.5);
      hole(c.x, c.y - 26, 42, 0.45);
    }
    // ventanas y la luz de luna que entra al suelo
    for (const w of WINDOWS) {
      g.save(); g.globalAlpha = 0.92; winPath(g, w); g.fill(); g.restore();
      const a = w.wall === 'L' ? [iso(0, w.a + 0.6), iso(0, w.b + 0.6), iso(2.4, w.b + 1.8), iso(2.4, w.a + 1.8)] : [iso(w.a + 0.6, 0), iso(w.b + 0.6, 0), iso(w.b + 1.8, 2.4), iso(w.a + 1.8, 2.4)];
      g.save(); g.globalAlpha = fl ? 0.6 : 0.15; g.beginPath(); a.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); g.fill(); g.restore();
    }
    g.globalCompositeOperation = 'source-over';
    ctx.drawImage(lightCv, 0, 0, lightCv.width, lightCv.height);

    // brillo cálido de las llamas
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const L of lights) {
      const rg = ctx.createRadialGradient(L.p.x, L.p.y, 0, L.p.x, L.p.y, L.r * 0.8);
      const [r, gg, b] = L.color || [255, 150, 60];
      rg.addColorStop(0, `rgba(${r},${gg},${b},.2)`); rg.addColorStop(1, `rgba(${r},${gg},${b},0)`);
      ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(L.p.x, L.p.y, L.r * 0.8, 0, Math.PI * 2); ctx.fill();
    }
    // tinte azul de la luna
    for (const w of WINDOWS) {
      const p = winPt(w, 0.5, (w.z0 + w.z1) / 2);
      const rg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 70);
      rg.addColorStop(0, `rgba(90,120,220,${fl ? 0.35 : 0.08})`); rg.addColorStop(1, 'rgba(90,120,220,0)');
      ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(p.x, p.y, 70, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // ======================================================================
  //  Muebles (objetos con profundidad)
  // ======================================================================
  function furnitureDrawables() {
    const list = [];
    for (const it of MAP.items) list.push(...itemDrawables(it));
    // El tabernero
    list.push({ depth: MAP.BARKEEP.x + MAP.BARKEEP.y + 0.5, draw: drawBartender });
    // Los comerciantes y sus puestos
    for (const [id, m] of Object.entries(MAP.MERCHANTS)) {
      for (const pr of [m.prop, m.prop2].filter(Boolean)) list.push(...itemDrawables({ type: pr.type, x: pr.x, y: pr.y }));
      list.push({ depth: m.x + m.y + 0.5, draw: () => drawMerchant(id, m) });
    }
    return list;
  }

  function itemDrawables(it, ghost) {
    const d = it.x + it.y;
    const wrap = (fn) => (ghost ? () => { ctx.save(); ctx.globalAlpha = 0.55; fn(); ctx.restore(); } : fn);
    switch (it.type) {
      case 'barrel': return [{ depth: d + 0.6, draw: wrap(() => drawBarrel(it)) }];
      case 'crate': case 'smallcrate': return [{ depth: d + 0.6, draw: wrap(() => drawCrate(it)) }];
      case 'table': case 'maptable': return [{ depth: d + 0.6, draw: wrap(() => drawTable(it)) }];
      case 'roundtable': return [{ depth: d + 0.6, draw: wrap(() => drawRoundTable(it)) }];
      case 'bar': return [{ depth: d + 0.6, draw: wrap(() => drawBar(it)) }];
      case 'bookshelf': return [{ depth: d + 0.6, draw: wrap(() => drawBookshelf(it)) }];
      case 'plant': return [{ depth: d + 0.6, draw: wrap(() => drawPlant(it)) }];
      case 'stool': return [{ depth: d + 0.2, draw: wrap(() => drawStool(it)) }];
      case 'chair': {
        const front = it.dir === 'N' || it.dir === 'W';
        return [{ depth: d + 0.2, draw: wrap(() => drawChairSeat(it)) }, { depth: d + (front ? 0.85 : 0.25), draw: wrap(() => drawChairBack(it)) }];
      }
      case 'sofa': {
        const front = it.dir === 'N' || it.dir === 'W';
        return [{ depth: d + 0.2, draw: wrap(() => drawSofa(it, false)) }, { depth: d + (front ? 0.85 : 0.25), draw: wrap(() => drawSofa(it, true)) }];
      }
      case 'staff': return editing || ghost ? [{ depth: d + 0.1, draw: () => drawStaffZone(it) }] : [];
      case 'fireplace': return [{ depth: d + 0.6, draw: wrap(() => drawFireplace(it)) }];
      case 'candelabra': return [{ depth: d + 0.6, draw: wrap(() => drawCandelabra(it)) }];
      case 'chandelier': return [{ depth: d + 2.5, draw: wrap(() => drawChandelier(it)) }];
      case 'chest': return [{ depth: d + 0.6, draw: wrap(() => drawChest(it)) }];
      case 'rack': return [{ depth: d + 0.6, draw: wrap(() => drawRack(it)) }];
      case 'cauldron': return [{ depth: d + 0.6, draw: wrap(() => drawCauldron(it)) }];
      case 'crystal': return [{ depth: d + 0.6, draw: wrap(() => drawCrystal(it)) }];
    }
    return [];
  }

  // ---------- Muebles nuevos: chimenea, candelabro, lámpara, cofre, armero, caldero y bola de cristal ----------
  function flame(x, y, h, seed, w = 5) {
    const t = performance.now() / 90 + seed * 7;
    const hh = h + Math.sin(t) * h * 0.18 + Math.sin(t * 2.3) * h * 0.1;
    const sway = Math.sin(t * 0.7) * w * 0.4;
    ctx.beginPath(); ctx.moveTo(x - w, y); ctx.quadraticCurveTo(x - w, y - hh * 0.6, x + sway, y - hh); ctx.quadraticCurveTo(x + w, y - hh * 0.6, x + w, y); ctx.closePath();
    ctx.fillStyle = '#e8601c'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - w / 2, y); ctx.quadraticCurveTo(x - w / 2, y - hh * 0.45, x + sway * 0.6, y - hh * 0.7); ctx.quadraticCurveTo(x + w / 2, y - hh * 0.45, x + w / 2, y); ctx.closePath();
    ctx.fillStyle = '#ffd25a'; ctx.fill();
  }

  function drawFireplace(it) {
    const t = isoBox(it.x + 0.02, it.y + 0.05, 0.96, 0.9, 64, '#5a5258', 0, { top: '#6a6268' });
    // boca del hogar en la cara +y
    const a = iso(it.x + 0.22, it.y + 0.95), b = iso(it.x + 0.78, it.y + 0.95);
    poly([a, b, up(b, 32), up(a, 32)], '#140a08', OUT, 1.5);
    const m = iso(it.x + 0.5, it.y + 0.95);
    for (let i = -1; i <= 1; i++) flame(m.x + i * 7, m.y - 4, 14 + (i === 0 ? 6 : 0), it.x + i, 5);
    ellipse(m.x, m.y - 3, 16, 3, '#3a1a0a');
    // repisa y piedras
    isoBox(it.x - 0.02, it.y + 0.02, 1.04, 0.98, 5, '#7a6a5a', 46, { top: '#8a7a6a' });
    ctx.strokeStyle = 'rgba(20,10,10,.45)'; ctx.lineWidth = 1;
    for (let z = 10; z < 64; z += 12) { const p = iso(it.x + 0.02, it.y + 0.95), q = iso(it.x + 0.98, it.y + 0.95); ctx.beginPath(); ctx.moveTo(p.x, p.y - z); ctx.lineTo(q.x, q.y - z); ctx.stroke(); }
    void t;
  }

  function drawCandelabra(it) {
    const c = iso(it.x + 0.5, it.y + 0.5);
    ellipse(c.x, c.y, 10, 5, '#3a3036', OUT);
    rrect(c.x - 2, c.y - 46, 4, 46, 1, '#5a4e40', OUT, 1);
    ctx.strokeStyle = '#5a4e40'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(c.x - 12, c.y - 44); ctx.quadraticCurveTo(c.x, c.y - 36, c.x + 12, c.y - 44); ctx.stroke();
    for (const dx of [-12, 0, 12]) {
      rrect(c.x + dx - 2.5, c.y - (dx ? 54 : 58), 5, 10, 1, '#efe6cf', OUT, 1);
      flame(c.x + dx, c.y - (dx ? 54 : 58), 7, it.x + dx, 2.5);
    }
  }

  function drawChandelier(it) {
    const c = up(iso(it.x + 0.5, it.y + 0.5), 112);
    ctx.strokeStyle = '#1a1414'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(c.x, c.y - 60); ctx.lineTo(c.x, c.y - 6); ctx.stroke();
    ellipse(c.x, c.y, 26, 10, null, '#3a2e24', 4);
    ellipse(c.x, c.y, 26, 10, null, '#6a5232', 1.5);
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2;
      const x = c.x + Math.cos(a) * 26, y = c.y + Math.sin(a) * 10;
      rrect(x - 2, y - 9, 4, 8, 1, '#efe6cf', OUT, 0.8);
      flame(x, y - 9, 6, i + it.x, 2.2);
    }
  }

  function drawChest(it) {
    const t = isoBox(it.x + 0.15, it.y + 0.2, 0.7, 0.6, 22, '#6a3e1e', 0, { top: '#8a5428' });
    ctx.strokeStyle = '#c8a040'; ctx.lineWidth = 2.5;
    const a = iso(it.x + 0.15, it.y + 0.8), b = iso(it.x + 0.85, it.y + 0.8);
    ctx.beginPath(); ctx.moveTo(a.x, a.y - 14); ctx.lineTo(b.x, b.y - 14); ctx.stroke();
    const m = iso(it.x + 0.5, it.y + 0.8);
    rrect(m.x - 3, m.y - 17, 6, 7, 1, '#e8c050', OUT, 1);
    poly([t.a, t.b, t.c, t.e], null, '#c8a040', 1.5);
  }

  function drawRack(it) {
    isoBox(it.x + 0.1, it.y + 0.35, 0.8, 0.3, 8, '#4a2e1a');
    const p0 = iso(it.x + 0.15, it.y + 0.5), p1 = iso(it.x + 0.85, it.y + 0.5);
    ctx.strokeStyle = '#4a2e1a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(p0.x, p0.y - 8); ctx.lineTo(p0.x, p0.y - 52); ctx.moveTo(p1.x, p1.y - 8); ctx.lineTo(p1.x, p1.y - 52); ctx.moveTo(p0.x, p0.y - 46); ctx.lineTo(p1.x, p1.y - 46); ctx.stroke();
    // katanas, lanza y espada colgadas
    const blades = [['#dfe4ec', '#8a2a2a', 0.3], ['#c8ccd4', '#2a2a5a', 0.5], ['#e8ecf2', '#6b4228', 0.7]];
    for (const [steel, hilt, f] of blades) {
      const q = iso(it.x + f, it.y + 0.5);
      ctx.strokeStyle = OUT; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(q.x, q.y - 12); ctx.lineTo(q.x + 2, q.y - 58); ctx.stroke();
      ctx.strokeStyle = steel; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(q.x, q.y - 22); ctx.lineTo(q.x + 2, q.y - 58); ctx.stroke();
      ctx.strokeStyle = hilt; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(q.x, q.y - 12); ctx.lineTo(q.x, q.y - 22); ctx.stroke();
      rrect(q.x - 4, q.y - 23, 8, 2, 0, '#c8a040', null);
    }
  }

  function drawCauldron(it) {
    const c = iso(it.x + 0.5, it.y + 0.5);
    // fuego debajo
    for (let i = -1; i <= 1; i++) flame(c.x + i * 8, c.y + 2, 9, it.y + i, 4);
    ctx.beginPath(); ctx.ellipse(c.x, c.y - 14, 22, 18, 0, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(c.x - 6, c.y - 20, 2, c.x, c.y - 14, 24);
    g.addColorStop(0, '#4a4a52'); g.addColorStop(1, '#141418');
    ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.5; ctx.stroke();
    ellipse(c.x, c.y - 28, 20, 8, '#1a1a1e', OUT);
    const t = performance.now() / 400;
    ellipse(c.x, c.y - 28, 17, 6, '#3adf6a');
    for (let i = 0; i < 4; i++) {
      const bx = c.x + Math.sin(t * 1.3 + i * 2) * 10, by = c.y - 30 - ((t * 20 + i * 9) % 26);
      ellipse(bx, by, 2.5, 2.5, 'rgba(120,255,140,.55)');
    }
  }

  function drawCrystal(it) {
    isoBox(it.x + 0.15, it.y + 0.15, 0.7, 0.7, 26, '#2a1a3a', 0, { top: '#3a2650' });
    const c = up(iso(it.x + 0.5, it.y + 0.5), 26);
    ellipse(c.x, c.y - 2, 9, 4, '#8a6a3a', OUT);
    const t = performance.now() / 600;
    const g = ctx.createRadialGradient(c.x - 3, c.y - 16, 1, c.x, c.y - 12, 12);
    g.addColorStop(0, '#f0d0ff'); g.addColorStop(0.5, `rgba(170,90,255,${0.75 + Math.sin(t) * 0.2})`); g.addColorStop(1, '#3a1a6a');
    ctx.beginPath(); ctx.arc(c.x, c.y - 12, 11, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.2; ctx.stroke();
    // velas
    rrect(c.x - 20, c.y - 8, 4, 8, 1, '#efe6cf', OUT, 0.8); flame(c.x - 18, c.y - 8, 6, 3, 2);
  }

  function drawStaffZone(it) {
    poly([iso(it.x, it.y), iso(it.x + 1, it.y), iso(it.x + 1, it.y + 1), iso(it.x, it.y + 1)], 'rgba(216,67,59,.18)', 'rgba(216,67,59,.6)', 1);
  }

  function drawBarrel(it) {
    const c = iso(it.x + 0.5, it.y + 0.5);
    cylinder(c.x, c.y + 2, 20, 10, 40, '#7a4a22', '#5e3818');
    ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 3;
    for (const hh of [9, 31]) { ctx.beginPath(); ctx.ellipse(c.x, c.y + 2 - hh, 20.5, 10, 0, 0, Math.PI); ctx.stroke(); }
    ellipse(c.x, c.y - 38, 13, 6.5, null, 'rgba(0,0,0,.35)', 1);
  }

  function drawCrate(it) {
    const small = it.type === 'smallcrate';
    const s = small ? 0.2 : 0.08;
    const h = small ? 24 : 34;
    const t = isoBox(it.x + s, it.y + s, 1 - 2 * s, 1 - 2 * s, h, '#a0703c');
    const a = iso(it.x + s, it.y + 1 - s), b = iso(it.x + 1 - s, it.y + 1 - s);
    ctx.strokeStyle = '#5a3a1a'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(a.x + 3, a.y - 3); ctx.lineTo(b.x - 3, b.y - h + 3); ctx.moveTo(a.x + 3, a.y - h + 3); ctx.lineTo(b.x - 3, b.y - 3); ctx.stroke();
    poly([t.a, t.b, t.c, t.e], null, '#5a3a1a', 1);
  }

  const sameAt = (x, y, type) => { const o = MAP.itemAt(x, y); return o && o.type === type; };

  function drawTable(it) {
    const legs = '#4a2e1a';
    if (!sameAt(it.x, it.y + 1, it.type)) { const p = iso(it.x + 0.5, it.y + 0.9); rrect(p.x - 2, p.y - 24, 4, 24, 0, legs, OUT, 1); }
    if (!sameAt(it.x + 1, it.y, it.type)) { const p = iso(it.x + 0.9, it.y + 0.5); rrect(p.x - 2, p.y - 24, 4, 24, 0, legs, OUT, 1); }
    isoBox(it.x, it.y, 1, 1, 6, '#8a5a30', 24, { stroke: null, top: '#9c6a3a' });
    // borde exterior de la mesa
    const z = 30, m = (x, y) => up(iso(x, y), z);
    ctx.strokeStyle = OUT; ctx.lineWidth = 1.5; ctx.beginPath();
    if (!sameAt(it.x, it.y - 1, it.type)) { const a = m(it.x, it.y), b = m(it.x + 1, it.y); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
    if (!sameAt(it.x - 1, it.y, it.type)) { const a = m(it.x, it.y), b = m(it.x, it.y + 1); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
    ctx.stroke();
    if (it.type === 'maptable') drawMapPiece(it, m);
  }

  // Trozo de mapa de aventuras sobre una casilla de mesa: las casillas vecinas forman un mapa continuo
  function drawMapPiece(it, m) {
    const e = (side) => (sameAt(it.x + side[0], it.y + side[1], 'maptable') ? 0 : 0.18);
    const x0 = it.x + e([-1, 0]), x1 = it.x + 1 - e([1, 0]), y0 = it.y + e([0, -1]), y1 = it.y + 1 - e([0, 1]);
    poly([m(x0, y0), m(x1, y0), m(x1, y1), m(x0, y1)], '#e8d6a8', null);
    const r = (k) => rand(it.x * 17 + it.y * 31 + k);
    ctx.strokeStyle = r(1) > 0.5 ? '#6b8a4a' : '#4a7ab0'; ctx.lineWidth = 2;
    const a = m(it.x + r(2) * 0.6 + 0.2, it.y + 0.3), b = m(it.x + 0.5, it.y + r(3) * 0.4 + 0.4), c2 = m(it.x + 0.8, it.y + 0.7);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c2.x, c2.y); ctx.stroke();
    if (r(4) > 0.6) { const q = m(it.x + 0.6, it.y + 0.4); ellipse(q.x, q.y, 3, 1.5, '#c0392b'); }
    if (r(5) > 0.55) { const q = m(it.x + 0.3, it.y + 0.6); cylinder(q.x, q.y, 3, 1.6, 4, ['#d8433b', '#4b7ea6', '#f2c94c', '#5cb85c'][Math.floor(r(6) * 4)]); }
    if (r(7) > 0.75) { const q = m(it.x + 0.7, it.y + 0.75); isoBoxAt(q.x, q.y, 5, '#f4f0e6'); }
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
    isoBox(it.x, it.y, 1, 1, 36, '#5a3a22', 0, { top: '#8a5a32' });
    ctx.strokeStyle = 'rgba(20,10,4,.6)'; ctx.lineWidth = 1;
    { const a = iso(it.x + 1, it.y + 0.5); ctx.beginPath(); ctx.moveTo(a.x, a.y - 4); ctx.lineTo(a.x, a.y - 30); ctx.stroke(); }
    { const a = iso(it.x + 0.5, it.y + 1); ctx.beginPath(); ctx.moveTo(a.x, a.y - 4); ctx.lineTo(a.x, a.y - 30); ctx.stroke(); }
    const c = up(iso(it.x + 0.5, it.y + 0.5), 36);
    const deco = (it.x * 7 + it.y * 3) % 3;
    if (deco === 0) mug(c.x - 6, c.y + 2);
    else if (deco === 1) {
      const col = ['#2e7d4f', '#7a2a2a', '#3a5a9a'][(it.x + it.y) % 3];
      rrect(c.x + 2, c.y - 14, 6, 14, 2, col, OUT, 1); rrect(c.x + 3.8, c.y - 19, 2.4, 6, 0, shade(col, -0.3), null);
    }
  }

  function drawBookshelf(it) {
    // Estantería alta pegada al lado contrario a donde mira
    const [ox, oy, w, d] = { S: [0.05, 0.05, 0.9, 0.4], N: [0.05, 0.55, 0.9, 0.4], E: [0.05, 0.05, 0.4, 0.9], W: [0.55, 0.05, 0.4, 0.9] }[it.dir || 'S'];
    isoBox(it.x + ox, it.y + oy, w, d, 70, '#5a3a22', 0, { top: '#6b4528' });
    // libros en la cara visible
    const faceY = it.dir === 'S' || it.dir === 'N';
    for (let shelf = 0; shelf < 3; shelf++) {
      const z = 10 + shelf * 20;
      for (let i = 0; i < 5; i++) {
        const tt = 0.12 + i * 0.16;
        const p = faceY ? iso(it.x + ox + tt * w / 0.9, it.y + oy + d) : iso(it.x + ox + w, it.y + oy + tt * d / 0.9);
        const col = ['#8a2a2a', '#2a5a8a', '#3a7a3a', '#c09030', '#6a3a8a'][(i + shelf + it.x) % 5];
        rrect(p.x - 3, p.y - z - 15, 5, 15, 0.5, col, OUT, 0.8);
      }
    }
  }

  function drawPlant(it) {
    const c = iso(it.x + 0.5, it.y + 0.5);
    poly([{ x: c.x - 12, y: c.y - 16 }, { x: c.x + 12, y: c.y - 16 }, { x: c.x + 9, y: c.y + 2 }, { x: c.x - 9, y: c.y + 2 }], '#a0522d', OUT, 1.5);
    ellipse(c.x, c.y - 16, 12, 5, '#5a2a10', OUT, 1.5);
    const leaf = (dx, dy, r, col) => ellipse(c.x + dx, c.y - 22 + dy, r, r * 0.8, col, OUT, 1.2);
    leaf(-9, -6, 9, '#2f7a3a'); leaf(9, -8, 9, '#2f7a3a'); leaf(0, -18, 10, '#3f9a4a'); leaf(-4, -10, 8, '#4fae5a'); leaf(6, -16, 7, '#4fae5a');
  }

  function drawStool(it) {
    const c = iso(it.x + 0.5, it.y + 0.5);
    ctx.strokeStyle = '#3b2414'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(c.x - 8, c.y + 2); ctx.lineTo(c.x - 5, c.y - 16); ctx.moveTo(c.x + 8, c.y + 2); ctx.lineTo(c.x + 5, c.y - 16); ctx.moveTo(c.x, c.y + 5); ctx.lineTo(c.x, c.y - 16); ctx.stroke();
    cylinder(c.x, c.y - 16, 11, 5.5, 4, '#7a4e2c', '#9c6a3a');
  }

  // Caja del respaldo dentro de la casilla, en el lado contrario a donde se mira
  function backOffsets(dir, thick = 0.14, inset = 0.15) {
    const len = 1 - 2 * inset;
    switch (dir) {
      case 'S': return [inset, 0.1, len, thick];
      case 'N': return [inset, 0.9 - thick, len, thick];
      case 'E': return [0.1, inset, thick, len];
      case 'W': return [0.9 - thick, inset, thick, len];
    }
    return [inset, 0.1, len, thick];
  }

  function drawChairSeat(it) {
    const c = iso(it.x + 0.5, it.y + 0.5);
    ctx.strokeStyle = '#3b2414'; ctx.lineWidth = 2.5;
    for (const [dx, dy] of [[-10, 0], [10, 0], [0, 5], [0, -5]]) { ctx.beginPath(); ctx.moveTo(c.x + dx, c.y + dy); ctx.lineTo(c.x + dx, c.y + dy - 14); ctx.stroke(); }
    isoBox(it.x + 0.15, it.y + 0.15, 0.7, 0.7, 4, '#7a4e2c', 14, { top: '#9c6a3a' });
  }

  function drawChairBack(it) {
    const [ox, oy, w, d] = backOffsets(it.dir);
    isoBox(it.x + ox, it.y + oy, w, d, 22, '#6b4228', 18, { top: '#8a5a32' });
  }

  function drawSofa(it, backPart) {
    const blue = '#2a4a8a';
    const horiz = it.dir === 'E' || it.dir === 'W'; // el sofá se extiende a lo largo de y
    const [nx, ny] = horiz ? [0, 1] : [1, 0];
    const prev = sameAt(it.x - nx, it.y - ny, 'sofa') && MAP.itemAt(it.x - nx, it.y - ny).dir === it.dir;
    const next = sameAt(it.x + nx, it.y + ny, 'sofa') && MAP.itemAt(it.x + nx, it.y + ny).dir === it.dir;
    if (!backPart) {
      isoBox(it.x + 0.02, it.y + 0.02, 0.96, 0.96, 14, blue, 0, { stroke: null });
      isoBox(it.x + 0.12, it.y + 0.12, 0.76, 0.76, 4, '#3a62b0', 14, { stroke: 'rgba(10,20,50,.6)' });
      if (!prev) { const b = horiz ? [0.05, 0.02, 0.9, 0.16] : [0.02, 0.05, 0.16, 0.9]; isoBox(it.x + b[0], it.y + b[1], b[2], b[3], 10, '#23407a', 14); }
      return;
    }
    const [ox, oy, w, d] = backOffsets(it.dir, 0.22, 0.02);
    isoBox(it.x + ox, it.y + oy, w, d, 24, '#23407a', 12, { stroke: null });
    if (!next) { const b = horiz ? [0.05, 0.82, 0.9, 0.16] : [0.82, 0.05, 0.16, 0.9]; isoBox(it.x + b[0], it.y + b[1], b[2], b[3], 10, '#23407a', 14); }
  }

  function drawBartender() {
    const c = iso(MAP.BARKEEP.x + 0.5, MAP.BARKEEP.y + 0.5);
    const t = performance.now();
    drawHero(ctx, c.x, c.y, bartenderLook, { dir: 'W', t, wiping: true });
  }

  function drawMerchant(id, m) {
    const c = iso(m.x + 0.5, m.y + 0.5);
    const t = performance.now();
    drawHero(ctx, c.x, c.y, { cls: 'mago', skin: id === 'bruja' ? 6 : 1, hair: 0, ...m.look }, { dir: id === 'armero' ? 'S' : 'E', t, idle: true });
    m._screen = { x: c.x, y: c.y };
  }

  const bartenderLook = { cls: 'picaro', skin: 1, hair: 1, npc: 'tabernero', color: '#7a4a2a', beard: '#6b4226', bald: true, apron: true };

  // ======================================================================
  //  Personajes (sprites pixel art de sprites.js)
  // ======================================================================
  const PX = 2; // cada píxel del sprite ocupa 2 unidades del mundo

  // dir: E (+x, abajo-derecha), S (+y, abajo-izquierda), W (-x, arriba-izquierda), N (-y, arriba-derecha)
  function drawHero(c, x, y, look, o = {}) {
    const t = o.t || 0;
    const back = o.dir === 'N' || o.dir === 'W';
    const flip = o.dir === 'S' || o.dir === 'W';
    let frame = o.walking ? 1 + (Math.floor(o.phase * 2) % 2) : 0;
    let bob = o.walking ? (frame === 1 ? 1 : 0) : 0;
    if (o.emote === 'dance') { frame = 1 + (Math.floor(t / 180) % 2); bob = Math.floor(t / 180) % 2 ? 2 : 0; }
    if (o.emote === 'laugh') bob = Math.floor(t / 90) % 2;
    const tick = Math.floor(t / 220) % 2;
    const spr = SPRITES.hero(look, { back, frame: o.sitting ? 0 : frame, sit: !!o.sitting, emote: o.emote, mug: o.mug, wiping: o.wiping, tick });
    c.save();
    c.imageSmoothingEnabled = false;
    if (!o.noShadow) { c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(x, y, 13, 5.5, 0, 0, Math.PI * 2); c.fill(); }
    c.translate(Math.round(x), Math.round(y - (o.sitting ? 12 : 0) - bob * PX));
    if (flip) c.scale(-1, 1);
    const sc = PX * ((MAP.SPECIES[look.species] || {}).scale || 1);
    c.drawImage(spr, -12 * sc, -32 * sc, spr.width * sc, spr.height * sc);
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
      id: u.id, name: u.name, look: u.look, gold: u.gold, xp: u.xp || 0, level: u.level || 1, where: u.where || null,
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
    // nombres de los comerciantes
    ctx.font = '600 10px "Pixelify Sans", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const [id, m] of Object.entries(MAP.MERCHANTS)) {
      if (!m._screen) continue;
      const S = RULES.SHOPS[id];
      const hot = hover && (MAP.merchantAt(hover.x, hover.y) === id);
      const label = (id === 'bruja' ? '🧪 ' : id === 'armero' ? '⚔️ ' : '✨ ') + S.name;
      const w = ctx.measureText(label).width + 10;
      const y = m._screen.y - 76;
      rrect(m._screen.x - w / 2, y - 8, w, 15, 4, hot ? 'rgba(90,40,110,.95)' : 'rgba(30,14,40,.8)', hot ? '#d8a8ff' : '#6a4a8a', 1);
      ctx.fillStyle = '#f0e0ff'; ctx.fillText(label, m._screen.x, y);
    }
    // nombre del tabernero
    {
      const c = iso(MAP.BARKEEP.x + 0.5, MAP.BARKEEP.y + 0.5);
      ctx.font = '600 10px "Pixelify Sans", sans-serif';
      const label = '🍺 Alfonso el Tabernero';
      const w = ctx.measureText(label).width + 10;
      rrect(c.x - w / 2, c.y - 84, w, 15, 4, 'rgba(60,30,10,.85)', '#c8963a', 1);
      ctx.fillStyle = '#ffe6b8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, c.x, c.y - 76);
    }
    // bocadillo del tabernero
    if (barkeep.until > now) {
      const c = iso(12.5, 4.5);
      ctx.font = '15px "VT323", monospace';
      const tw = ctx.measureText(barkeep.text).width + 14;
      rrect(c.x - tw / 2, c.y - 112, tw, 20, 5, '#f4e6c0', OUT, 1.5);
      ctx.fillStyle = '#2a1a10'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(barkeep.text, c.x, c.y - 102);
    }
  }

  const barkeep = { text: '', until: 0, next: performance.now() + 15000 };
  const BARKEEP_LINES = [
    'Soy Alfonso, y en mi taberna no se pelea.', '¿Otra ronda, aventureros?', 'Alfonso nunca olvida una deuda.', 'Hoy hay estofado de dragón.', 'Nada de magia dentro del local.',
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
  // ======================================================================
  //  Taberna en 3D (Three.js): sala, ventanas a la noche, muebles, personajes y luces
  // ======================================================================
  const T3 = { stage: null, room: null, furn: null, furnKey: '', lights: [], models: new Map(), npcs: [], windows: [], hoverMesh: null, marker: null };
  const SEAT_Y = { chair: 0.42, stool: 0.42, sofa: 0.36 };
  const FACE = { E: Math.PI / 2, S: 0, W: -Math.PI / 2, N: Math.PI };

  function canvasTex(w, h, paint) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    paint(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
    return t;
  }

  function buildRoom() {
    const g = new THREE.Group();
    const W = MAP.W, H = MAP.H, WH = 2.7;
    // suelo de tablones
    const floorTex = canvasTex(W * 48, H * 48, (c, w, h) => {
      c.fillStyle = '#5a3a22'; c.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 16) {
        const off = (y / 16 % 3) * 40;
        for (let x = -off; x < w; x += 120) {
          const r = rand(x * 0.37 + y * 1.3);
          c.fillStyle = `hsl(25, ${35 + r * 15}%, ${20 + r * 9}%)`;
          c.fillRect(x, y, 118, 15);
          c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(x + 118, y, 2, 16);
          c.fillStyle = 'rgba(255,220,180,.05)'; c.fillRect(x, y, 118, 2);
          for (let k = 0; k < 3; k++) { c.fillStyle = 'rgba(0,0,0,.12)'; c.fillRect(x + rand(x + k + y) * 110, y + 3 + k * 4, 30 + rand(k + x) * 30, 1); }
        }
        c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(0, y + 15, w, 1);
      }
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.85 }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(W / 2, 0, H / 2); floor.receiveShadow = true;
    g.add(floor);
    // alfombra
    const R = MAP.rug || { x0: 1, y0: 4, x1: 7, y1: 9 };
    const rugTex = canvasTex(256, 192, (c, w, h) => {
      c.fillStyle = '#5a1a1e'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#c8963a'; c.lineWidth = 6; c.strokeRect(10, 10, w - 20, h - 20);
      c.strokeStyle = '#2a4a6a'; c.lineWidth = 4; c.strokeRect(22, 22, w - 44, h - 44);
      c.fillStyle = '#7a2a2a'; for (let i = 0; i < 6; i++) { c.beginPath(); c.arc(w / 2, h / 2, 20 + i * 12, 0, 7); c.strokeStyle = i % 2 ? '#c8963a' : '#3a5a7a'; c.lineWidth = 2; c.stroke(); }
    });
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(R.x1 - R.x0, R.y1 - R.y0), new THREE.MeshStandardMaterial({ map: rugTex, roughness: 1 }));
    rug.rotation.x = -Math.PI / 2; rug.position.set((R.x0 + R.x1) / 2, 0.01, (R.y0 + R.y1) / 2); rug.receiveShadow = true;
    g.add(rug);
    // paredes: yeso arriba, zócalo de madera abajo, vigas
    const wallTex = canvasTex(512, 256, (c, w, h) => {
      c.fillStyle = '#c8b898'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 400; i++) { c.fillStyle = `rgba(${rand(i) > 0.5 ? '255,255,255' : '60,40,20'},${0.04 + rand(i * 3) * 0.05})`; c.fillRect(rand(i * 7) * w, rand(i * 11) * h, 6, 4); }
      c.fillStyle = '#4a2e1a'; c.fillRect(0, h * 0.62, w, h * 0.38);
      for (let x = 0; x < w; x += 32) { c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(x, h * 0.62, 2, h * 0.38); }
      c.fillStyle = '#2e1c10'; c.fillRect(0, h * 0.6, w, 8);
    });
    wallTex.wrapS = THREE.RepeatWrapping;
    const wallMatL = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9 });
    const texR = wallTex.clone(); texR.needsUpdate = true; texR.wrapS = THREE.RepeatWrapping; texR.repeat.set(W / 4, 1);
    wallTex.repeat.set(H / 4, 1);
    const wallMatR = new THREE.MeshStandardMaterial({ map: texR, roughness: 0.9 });
    const left = new THREE.Mesh(new THREE.BoxGeometry(0.2, WH, H + 0.2), wallMatL);
    left.position.set(-0.1, WH / 2, H / 2); left.receiveShadow = true; g.add(left);
    const right = new THREE.Mesh(new THREE.BoxGeometry(W + 0.2, WH, 0.2), wallMatR);
    right.position.set(W / 2, WH / 2, -0.1); right.receiveShadow = true; g.add(right);
    const beam = MODELS.mat('#3a2414');
    for (let z = 0; z <= H; z += 3) MODELS.mesh(MODELS.box(0.12, WH, 0.18), beam, 0.02, WH / 2, z, g);
    for (let x = 0; x <= W; x += 3) MODELS.mesh(MODELS.box(0.18, WH, 0.12), beam, x, WH / 2, 0.02, g);
    MODELS.mesh(MODELS.box(0.16, 0.16, H), beam, 0.06, WH - 0.08, H / 2, g);
    MODELS.mesh(MODELS.box(W, 0.16, 0.16), beam, W / 2, WH - 0.08, 0.06, g);
    // estantería de botellas detrás de la barra
    MODELS.mesh(MODELS.box(3, 0.06, 0.3), beam, 12.4, 1.3, 0.2, g);
    MODELS.mesh(MODELS.box(3, 0.06, 0.3), beam, 12.4, 1.75, 0.2, g);
    const cols = ['#2e7d4f', '#7a2a2a', '#3a5a9a', '#c8a040', '#6a3a8a'];
    for (let i = 0; i < 18; i++) { const b = MODELS.mesh(MODELS.cyl(0.04, 0.05, 0.22, 6), MODELS.mat(cols[i % 5], { rough: 0.25, metal: 0.1, opacity: 0.85 }), 11 + (i % 9) * 0.32, 1.45 + Math.floor(i / 9) * 0.45, 0.2, g); b.castShadow = false; }
    // ventanas a la noche (con luna, lluvia y relámpagos)
    T3.windows = [];
    for (const w of WINDOWS) {
      const sky = canvasTex(128, 192, (c, ww, hh) => {
        const gr = c.createLinearGradient(0, 0, 0, hh); gr.addColorStop(0, '#0a1430'); gr.addColorStop(1, '#1a2a4a');
        c.fillStyle = gr; c.fillRect(0, 0, ww, hh);
        if (w.moon) { c.fillStyle = '#f4f0d8'; c.beginPath(); c.arc(ww * 0.62, hh * 0.25, 16, 0, 7); c.fill(); c.fillStyle = '#0a1430'; c.beginPath(); c.arc(ww * 0.55, hh * 0.22, 14, 0, 7); c.fill(); }
        c.fillStyle = '#05080f'; c.beginPath(); c.moveTo(0, hh); c.lineTo(0, hh * 0.75); c.lineTo(ww * 0.3, hh * 0.68); c.lineTo(ww * 0.6, hh * 0.8); c.lineTo(ww, hh * 0.7); c.lineTo(ww, hh); c.fill();
        c.strokeStyle = '#05080f'; c.lineWidth = 3; c.beginPath(); c.moveTo(ww * 0.25, hh); c.lineTo(ww * 0.28, hh * 0.5); c.lineTo(ww * 0.15, hh * 0.38); c.moveTo(ww * 0.28, hh * 0.55); c.lineTo(ww * 0.4, hh * 0.42); c.stroke();
      });
      const len = w.b - w.a, z0 = w.z0 / 50, z1 = w.z1 / 50;
      const mm = new THREE.MeshStandardMaterial({ map: sky, emissive: '#ffffff', emissiveMap: sky, emissiveIntensity: 0.55, roughness: 1 });
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(len, z1 - z0), mm);
      const frameM = MODELS.mat('#2a1a10');
      const fr = new THREE.Group();
      fr.add(pane);
      MODELS.mesh(MODELS.box(len + 0.12, 0.08, 0.06), frameM, 0, (z1 - z0) / 2, 0.02, fr);
      MODELS.mesh(MODELS.box(len + 0.12, 0.1, 0.12), frameM, 0, -(z1 - z0) / 2, 0.04, fr);
      MODELS.mesh(MODELS.box(0.05, z1 - z0, 0.05), frameM, 0, 0, 0.02, fr);
      MODELS.mesh(MODELS.box(len, 0.04, 0.05), frameM, 0, 0, 0.02, fr);
      for (const sx of [-1, 1]) MODELS.mesh(MODELS.box(0.08, z1 - z0 + 0.1, 0.06), frameM, sx * len / 2, 0, 0.02, fr);
      if (w.wall === 'L') { fr.position.set(0.01, (z0 + z1) / 2, (w.a + w.b) / 2); fr.rotation.y = Math.PI / 2; }
      else { fr.position.set((w.a + w.b) / 2, (z0 + z1) / 2, 0.01); }
      g.add(fr);
      T3.windows.push({ w, mat: mm, pos: fr.position.clone() });
    }
    // antorchas de pared
    T3.torches = [];
    for (const L of TORCHES) {
      const t = new THREE.Group();
      MODELS.mesh(MODELS.box(0.08, 0.08, 0.14), MODELS.mat('#2a2a2e', { metal: 0.6 }), 0, 1.5, 0.06, t);
      const h = MODELS.mesh(MODELS.cyl(0.03, 0.025, 0.3, 5), MODELS.mat('#4a2e1a'), 0, 1.62, 0.14, t); h.rotation.x = -0.35;
      MODELS.flame(t, 0, 1.76, 0.2, 1.5);
      if (L.y === 0) t.position.set(L.x, 0, 0.02); else { t.position.set(0.02, 0, L.y); t.rotation.y = Math.PI / 2; }
      g.add(t);
      T3.torches.push({ x: L.y === 0 ? L.x : 0.35, z: L.y === 0 ? 0.35 : L.y, seed: L.x + L.y });
    }
    return g;
  }

  function buildFurniture() {
    const g = new THREE.Group();
    const lights = [];
    const place = (type, x, y, dir) => {
      const f = MODELS.furniture(type, dir);
      if (!f) return;
      f.obj.position.set(x + 0.5, 0, y + 0.5);
      g.add(f.obj);
      if (f.light) lights.push({ x: x + 0.5, y: f.light.y, z: y + 0.5 + (f.light.z || 0), color: f.light.color, intensity: f.light.intensity, dist: f.light.dist, seed: x * 3 + y });
    };
    for (const it of MAP.items) if (it.type !== 'staff') place(it.type, it.x, it.y, it.dir);
    for (const m of Object.values(MAP.MERCHANTS)) for (const pr of [m.prop, m.prop2].filter(Boolean)) place(pr.type, pr.x, pr.y);
    return { g, lights };
  }

  // Modelo de un personaje (se rehace si cambia su aspecto)
  function charModel(id, look) {
    const key = JSON.stringify(look);
    let m = T3.models.get(id);
    if (m && m.key === key) return m;
    if (m) T3.stage.scene.remove(m.obj);
    const obj = MODELS.buildHero(look);
    T3.stage.scene.add(obj);
    m = { obj, key, mug: null };
    T3.models.set(id, m);
    return m;
  }

  function ensureTavern3D() {
    if (T3.stage) return;
    T3.stage = VIEW3D.makeStage({ offset: [8.2, 10.5, 8.2], fov: 36, ambient: 0.55, sky: '#7a6a8a', ground: '#2a1a10', lights: 12 });
    T3.stage.scene.background = new THREE.Color('#0c0608');
    T3.room = buildRoom();
    T3.stage.scene.add(T3.room);
    const hl = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.44, 24), new THREE.MeshBasicMaterial({ color: '#ffe9a8', transparent: true, opacity: 0.7, depthWrite: false }));
    hl.rotation.x = -Math.PI / 2; hl.position.y = 0.02; hl.visible = false;
    T3.stage.scene.add(hl); T3.hoverMesh = hl;
    const mk = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.3, 20), new THREE.MeshBasicMaterial({ color: '#f2c94c', transparent: true, opacity: 0.9, depthWrite: false }));
    mk.rotation.x = -Math.PI / 2; mk.position.y = 0.025; mk.visible = false;
    T3.stage.scene.add(mk); T3.marker = mk;
    window.__tavernStage = T3.stage;
  }

  function renderTavern3D(now) {
    ensureTavern3D();
    const st = T3.stage;
    // muebles (se rehacen al editar)
    const fk = JSON.stringify(MAP.items);
    if (fk !== T3.furnKey) {
      if (T3.furn) st.scene.remove(T3.furn.g);
      T3.furn = buildFurniture();
      st.scene.add(T3.furn.g);
      T3.furnKey = fk;
    }
    // personas: héroes, el tabernero y los comerciantes
    const live = new Set();
    for (const u of users.values()) {
      if (u.where) continue;
      live.add(u.id);
      const m = charModel(u.id, u.look);
      const seat = !u.path.length && u.px === u.tx && u.py === u.ty ? MAP.seatAt(u.tx, u.ty) : null;
      m.obj.position.set(u.px + 0.5, seat ? (SEAT_Y[seat.type] || 0.4) - 0.2 : 0, u.py + 0.5);
      m.obj.rotation.y = FACE[u.dir] || 0;
      const emote = u.emote && u.emote.until > now ? u.emote.e : null;
      const mugOn = u.mugUntil > now;
      if (mugOn && !m.mug) { m.mug = MODELS.mug(); m.mug.position.set(0, -0.02, 0.05); m.obj.userData.parts.handR.add(m.mug); }
      if (!mugOn && m.mug) { m.mug.parent.remove(m.mug); m.mug = null; }
      MODELS.animate(m.obj, { moving: u.path.length > 0, phase: u.phase * 2.6, t: now, sit: !!seat, emote, mug: mugOn });
      const top = st.project(u.px + 0.5, seat ? 1.15 : 1.35, u.py + 0.5);
      u._screen = { x: top.x, y: top.y };
    }
    for (const [id, m] of T3.models) if (!live.has(id) && !id.startsWith('npc:')) { st.scene.remove(m.obj); T3.models.delete(id); }
    const bk = charModel('npc:barkeep', bartenderLook);
    bk.obj.position.set(MAP.BARKEEP.x + 0.5, 0, MAP.BARKEEP.y + 0.5);
    bk.obj.rotation.y = -Math.PI / 2;
    MODELS.animate(bk.obj, { t: now, emote: Math.floor(now / 4000) % 3 === 0 ? 'cheers' : null });
    for (const [id, m] of Object.entries(MAP.MERCHANTS)) {
      const mm = charModel('npc:' + id, { cls: 'mago', skin: id === 'bruja' ? 6 : 1, hair: 0, ...m.look });
      mm.obj.position.set(m.x + 0.5, 0, m.y + 0.5);
      mm.obj.rotation.y = id === 'armero' ? 0 : Math.PI / 2;
      MODELS.animate(mm.obj, { t: now + m.x * 900 });
      const top = st.project(m.x + 0.5, 1.45, m.y + 0.5);
      m._screen = { x: top.x, y: top.y };
    }
    // casilla bajo el ratón y destino
    const hm = T3.hoverMesh;
    if (hover && MAP.inBounds(hover.x, hover.y)) {
      hm.visible = true; hm.position.set(hover.x + 0.5, 0.02, hover.y + 0.5);
      const occupied = MAP.isSeat(hover.x, hover.y) && [...users.values()].some((u) => u.id !== myId && !u.where && u.tx === hover.x && u.ty === hover.y);
      hm.material.color.set(editing ? (editTool === 'erase' ? '#ff6b6b' : editTool === 'rotate' ? '#7ad0ff' : '#ffe9a8') : MAP.isStandable(hover.x, hover.y) && !occupied ? '#ffe9a8' : '#d8433b');
    } else hm.visible = false;
    const me = users.get(myId);
    if (me && me.path.length) { T3.marker.visible = true; T3.marker.position.set(me.tx + 0.5, 0.025, me.ty + 0.5); T3.marker.scale.setScalar(1 + Math.sin(now / 120) * 0.15); } else T3.marker.visible = false;
    // luces: antorchas, muebles, ventanas (relámpagos) y el farol de quien juega
    const fl = flashLevel(now);
    const flick = (s) => 0.85 + Math.sin(now / 130 + s * 3) * 0.08 + Math.sin(now / 47 + s) * 0.05;
    const L = [];
    for (const t of T3.torches) L.push({ x: t.x, y: 1.85, z: t.z, color: '#ff9a40', intensity: 1.7 * flick(t.seed), dist: 6.5 });
    for (const l of T3.furn.lights) L.push({ ...l, intensity: l.intensity * flick(l.seed) });
    for (const w of T3.windows) { w.mat.emissiveIntensity = 0.55 + fl * 2.5; if (fl) L.push({ x: w.w.wall === 'L' ? 1 : w.pos.x, y: 2, z: w.w.wall === 'L' ? w.pos.z : 1, color: '#a8c0ff', intensity: fl * 6, dist: 10 }); }
    if (me && !me.where) L.push({ x: me.px + 0.5, y: 2.6, z: me.py + 0.5, color: '#ffe0b8', intensity: 0.9, dist: 6, shadow: true });
    else L.push({ x: 5, y: 2.6, z: 6, color: '#ffe0b8', intensity: 0.6, dist: 8, shadow: true });
    st.hemi.intensity = editing ? 0.95 : 0.55 + fl * 0.6;
    st.setLights(L);
    // cámara: la sala entera a la vista (en móvil, más cerca y siguiendo al héroe)
    const mobile = innerWidth <= 820;
    const zoom = mobile ? 1.15 : Math.max(1.05, Math.min(1.45, (1280 / innerWidth) * 1.3 * Math.max(1, 780 / innerHeight)));
    st.offset.set(8.2 * zoom, 10.5 * zoom, 8.2 * zoom);
    const fx = mobile && me && !me.where ? me.px + 0.5 : 7.4, fz = mobile && me && !me.where ? me.py + 0.5 : 6.4;
    T3.cam = T3.cam || { x: fx, z: fz };
    T3.cam.x += (fx - T3.cam.x) * 0.08; T3.cam.z += (fz - T3.cam.z) * 0.08;
    const panelShift = !mobile && !heroesEl.classList.contains('closed') ? 0.9 : 0;
    st.lookAt(T3.cam.x + panelShift, T3.cam.z - panelShift);
    st.render();
  }

  // Casilla de la taberna bajo el ratón (en 3D)
  function screenToTile3D(cx, cy) {
    if (!T3.stage) return { x: -1, y: -1 };
    const p = T3.stage.pick(cx, cy);
    return p ? { x: Math.floor(p.x), y: Math.floor(p.z) } : { x: -1, y: -1 };
  }

  // Nombres, bocadillos, gestos y números en pantalla
  function drawOverlays3D(now) {
    const dpr = view.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const list = [...users.values()].filter((u) => u._screen && !u.where).sort((a, b) => (a.px + a.py) - (b.px + b.py));
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const u of list) {
      const s = u._screen;
      const isMe = u.id === myId;
      ctx.font = '600 12px "Pixelify Sans", sans-serif';
      const w = ctx.measureText(u.name).width + 12;
      const ny = s.y - 8;
      rrect(s.x - w / 2, ny - 9, w, 17, 4, isMe ? 'rgba(90,60,10,.85)' : 'rgba(20,10,4,.75)', isMe ? '#f2c94c' : null, 1);
      ctx.fillStyle = isMe ? '#ffe9a8' : '#f4ead2';
      ctx.fillText(u.name, s.x, ny);
      if (u.emote && u.emote.until > now) {
        const left = (u.emote.until - now) / 2600;
        ctx.font = '24px serif'; ctx.globalAlpha = Math.min(1, left * 3);
        ctx.fillText(EMOJI[u.emote.e] || '', s.x + w / 2 + 12, ny - 12 - (1 - left) * 10);
        ctx.globalAlpha = 1;
      }
      if (u.bubble && u.bubble.until > now) {
        ctx.font = '17px "VT323", monospace';
        const lines = wrapText(u.bubble.text, 190);
        const lw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 16;
        const lh = 16, bh = lines.length * lh + 10, by = ny - 16 - bh;
        ctx.globalAlpha = Math.min(1, (u.bubble.until - now) / 400);
        rrect(s.x - lw / 2, by, lw, bh, 6, '#fbf3dc', OUT, 2);
        poly([{ x: s.x - 6, y: by + bh - 1 }, { x: s.x + 6, y: by + bh - 1 }, { x: s.x, y: by + bh + 8 }], '#fbf3dc', null);
        ctx.fillStyle = '#2a1a10'; ctx.textBaseline = 'top';
        lines.forEach((l, i) => ctx.fillText(l, s.x, by + 5 + i * lh));
        ctx.textBaseline = 'middle';
        ctx.globalAlpha = 1;
      }
    }
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      const u = users.get(f.id);
      const life = (now - f.start) / f.dur;
      if (life >= 1 || !u || !u._screen) { floaters.splice(i, 1); continue; }
      ctx.font = '700 22px "Pixelify Sans", sans-serif';
      ctx.globalAlpha = 1 - Math.max(0, life - 0.7) / 0.3;
      const y = u._screen.y - 40 - life * 30;
      ctx.lineWidth = 4; ctx.strokeStyle = '#1a0a04'; ctx.strokeText(f.text, u._screen.x, y);
      ctx.fillStyle = f.color; ctx.fillText(f.text, u._screen.x, y);
      ctx.globalAlpha = 1;
    }
    // comerciantes y tabernero
    ctx.font = '600 11px "Pixelify Sans", sans-serif';
    for (const [id, m] of Object.entries(MAP.MERCHANTS)) {
      if (!m._screen) continue;
      const S = RULES.SHOPS[id];
      const hot = hover && MAP.merchantAt(hover.x, hover.y) === id;
      const label = (id === 'bruja' ? '🧪 ' : id === 'armero' ? '⚔️ ' : '✨ ') + S.name;
      const w = ctx.measureText(label).width + 12;
      rrect(m._screen.x - w / 2, m._screen.y - 9, w, 17, 4, hot ? 'rgba(90,40,110,.95)' : 'rgba(30,14,40,.82)', hot ? '#d8a8ff' : '#6a4a8a', 1);
      ctx.fillStyle = '#f0e0ff'; ctx.fillText(label, m._screen.x, m._screen.y);
    }
    const bkp = T3.stage.project(MAP.BARKEEP.x + 0.5, 1.45, MAP.BARKEEP.y + 0.5);
    const label = '🍺 Alfonso el Tabernero';
    const bw = ctx.measureText(label).width + 12;
    rrect(bkp.x - bw / 2, bkp.y - 9, bw, 17, 4, 'rgba(60,30,10,.85)', '#c8963a', 1);
    ctx.fillStyle = '#ffe6b8'; ctx.fillText(label, bkp.x, bkp.y);
    if (barkeep.until > now) {
      ctx.font = '16px "VT323", monospace';
      const tw = ctx.measureText(barkeep.text).width + 14;
      rrect(bkp.x - tw / 2, bkp.y - 36, tw, 22, 5, '#f4e6c0', OUT, 1.5);
      ctx.fillStyle = '#2a1a10'; ctx.fillText(barkeep.text, bkp.x, bkp.y - 25);
    }
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    updateUsers(dt);
    if (DD.scene !== 'tavern') { requestAnimationFrame(frame); return; }
    updateNight(now);
    updateBarkeep(now);
    VIEW3D.show(true);
    renderTavern3D(now);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // viñeta suave
    const vg = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, Math.min(canvas.width, canvas.height) * 0.4, canvas.width / 2, canvas.height / 2, Math.max(canvas.width, canvas.height) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.5)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawOverlays3D(now);
    requestAnimationFrame(frame);
  }

  // Antorchas de pared (pequeñas: alumbran sólo su rincón)
  const TORCHES = [
    { x: 4, y: 0, z: 82, r: 130 }, { x: 11.5, y: 0, z: 82, r: 125 }, { x: 0, y: 8, z: 82, r: 125 }, { x: 0, y: 4.1, z: 82, r: 115 }, { x: 0, y: 11, z: 82, r: 115 },
  ];

  function drawTorches(now) {
    for (const L of TORCHES) {
      const p = up(iso(L.x, L.y), L.z);
      // soporte de hierro y mango
      rrect(p.x - 4, p.y + 4, 8, 3, 1, '#2a2a2e', OUT, 1);
      poly([{ x: p.x - 3, y: p.y - 2 }, { x: p.x + 3, y: p.y - 2 }, { x: p.x + 1.5, y: p.y + 14 }, { x: p.x - 1.5, y: p.y + 14 }], '#4a2e1a', OUT, 1);
      rrect(p.x - 4, p.y - 4, 8, 4, 1, '#3a2a1a', OUT, 1);
      // llama
      const t = now / 90 + L.x * 7;
      const h = 13 + Math.sin(t) * 2.5 + Math.sin(t * 2.3) * 1.5;
      const sway = Math.sin(t * 0.7) * 2;
      ctx.beginPath(); ctx.moveTo(p.x - 5, p.y - 3); ctx.quadraticCurveTo(p.x - 5, p.y - h * 0.6, p.x + sway, p.y - h); ctx.quadraticCurveTo(p.x + 5, p.y - h * 0.6, p.x + 5, p.y - 3); ctx.closePath();
      ctx.fillStyle = '#e8601c'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(p.x - 2.5, p.y - 3); ctx.quadraticCurveTo(p.x - 2.5, p.y - h * 0.45, p.x + sway * 0.6, p.y - h * 0.7); ctx.quadraticCurveTo(p.x + 2.5, p.y - h * 0.45, p.x + 2.5, p.y - 3); ctx.closePath();
      ctx.fillStyle = '#ffd25a'; ctx.fill();
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
    const t = screenToTile3D(e.clientX, e.clientY);
    hover = MAP.inBounds(t.x, t.y) ? t : null;
  });
  canvas.addEventListener('pointerleave', () => { hover = null; });
  canvas.addEventListener('click', (e) => {
    closePops();
    const t = screenToTile3D(e.clientX, e.clientY);
    if (editing) { editClick(t.x, t.y); return; }
    const me = users.get(myId);
    if (!me) return;
    // un comerciante: abre su tienda (y te acercas)
    const shop = MAP.merchantAt(t.x, t.y) || merchantUnder(e.clientX, e.clientY);
    if (shop) {
      const m = MAP.MERCHANTS[shop];
      const spot = [[1, 0], [0, 1], [1, 1], [-1, 0], [0, -1], [2, 0], [0, 2]].map(([dx, dy]) => ({ x: m.prop.x + dx, y: m.prop.y + dy })).find((q) => MAP.isPassable(q.x, q.y));
      if (spot) { setTarget(me, spot.x, spot.y); net.send({ t: 'move', x: spot.x, y: spot.y }); }
      DD.emit('open-shop', shop);
      return;
    }
    if (!MAP.isStandable(t.x, t.y)) return;
    if (MAP.isSeat(t.x, t.y) && [...users.values()].some((u) => u.id !== myId && !u.where && u.tx === t.x && u.ty === t.y)) {
      toast('Ese asiento está ocupado.'); return;
    }
    setTarget(me, t.x, t.y);
    net.send({ t: 'move', x: t.x, y: t.y });
  });

  // Clic sobre el cuerpo de un comerciante (que sobresale de su casilla)
  function merchantUnder(cx, cy) {
    if (!T3.stage) return null;
    for (const [id, m] of Object.entries(MAP.MERCHANTS)) {
      const p = T3.stage.project(m.x + 0.5, 0.7, m.y + 0.5);
      if (Math.hypot(p.x - cx, p.y - cy) < 34) return id;
    }
    return null;
  }

  // Mover con el teclado (WASD / flechas) cuando no se está escribiendo
  window.addEventListener('keydown', (e) => {
    if (document.activeElement && (document.activeElement.tagName === 'INPUT')) return;
    if (DD.scene !== 'tavern') return;
    if (e.key === 'Enter') { e.preventDefault(); chatInput.focus(); return; }
    const me = users.get(myId);
    if (!me || me.path.length) return;
    const dirs = { ArrowUp: [0, -1], w: [0, -1], ArrowDown: [0, 1], s: [0, 1], ArrowLeft: [-1, 0], a: [-1, 0], ArrowRight: [1, 0], d: [1, 0] };
    const d = dirs[e.key];
    if (!d) return;
    e.preventDefault();
    const x = me.tx + d[0], y = me.ty + d[1];
    if (!MAP.isStandable(x, y)) return;
    if (MAP.isSeat(x, y) && [...users.values()].some((u) => u.id !== myId && !u.where && u.tx === x && u.ty === y)) return;
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
        ws.send(JSON.stringify({ t: 'join', room: profile.room, name: profile.name, look: profile.look, token: playerToken() }));
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
        MAP.setItems(m.items);
        isOwner = !!m.owner;
        document.querySelector('#bar [data-act="edit"]').classList.toggle('hidden', !isOwner);
        if (!isOwner) setEditing(false);
        DD.emit('welcome', m);
        logEl.innerHTML = '';
        for (const h of m.history) logLine(h);
        renderHeroes();
        break;
      }
      case 'join': users.set(m.user.id, makeUser(m.user)); renderHeroes(); blip(660, 0.08); break;
      case 'leave': users.delete(m.id); renderHeroes(); break;
      case 'move': {
        const u = users.get(m.id);
        if (u && m.snap) { u.tx = u.px = m.x; u.ty = u.py = m.y; u.path = []; }
        else if (u && (u.tx !== m.x || u.ty !== m.y)) setTarget(u, m.x, m.y);
        break;
      }
      case 'titems': MAP.setItems(m.items); break;
      case 'look': {
        const u = users.get(m.id);
        if (u) { u.look = m.look; renderHeroes(); }
        if (m.id === myId) { const { gear, ...l } = m.look; void gear; profile.look = l; save('dd-profile', JSON.stringify(profile)); }
        DD.emit('look', m);
        break;
      }
      case 'me': {
        DD.me = m;
        const u = users.get(myId);
        if (u) { u.xp = m.xp; u.gold = m.gold; }
        renderHeroes();
        DD.emit('me', m);
        break;
      }
      case 'levelup': {
        toast(`⭐ ¡Subes a nivel ${m.level}! Pulsa el icono rojo bajo tu retrato para repartir ${m.points} puntos.`);
        blip(990, 0.25); setTimeout(() => blip(1320, 0.2), 180);
        DD.emit('levelup', m);
        break;
      }
      case 'where': {
        const u = users.get(m.id);
        if (!u) break;
        u.where = m.where;
        if (!m.where && m.x !== undefined) { u.tx = u.px = m.x; u.ty = u.py = m.y; u.path = []; }
        renderHeroes();
        break;
      }
      case 'profile': {
        const u = users.get(m.id);
        if (!u) break;
        const gained = m.gold - u.gold;
        u.xp = m.xp; u.gold = m.gold; if (m.level) u.level = m.level;
        if (m.id === myId && DD.me) { DD.me.xp = m.xp; DD.me.gold = m.gold; DD.emit('me-stats'); }
        if (gained > 0 && !u.where) floaters.push({ id: m.id, text: `+${gained} 🪙`, start: now, dur: 1800, color: '#ffd23f' });
        renderHeroes();
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
        barkeep.text = '¡Marchando una jarra, que invita Alfonso!'; barkeep.until = now + 2500;
        break;
      }
      case 'roll': {
        floaters.push({ id: m.id, text: `d${m.sides}: ${m.value}`, start: now, dur: 2600, color: m.sides === 20 && m.value === 20 ? '#ffd23f' : m.sides === 20 && m.value === 1 ? '#ff6b6b' : '#9fe0ff' });
        logLine(m); blip(880, 0.06); break;
      }
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
      default: DD.emit(m.t, m);
    }
    if (m.t === 'chat' || m.t === 'action' || m.t === 'roll' || m.t === 'system') DD.emit('log', m);
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
    g.imageSmoothingEnabled = false;
    const spr = SPRITES.hero(look, {});
    const k = 4; // recorte de cabeza y torso, ampliado
    g.drawImage(spr, 0, 0, 24, 28, (c.width - 24 * k) / 2, c.height - 26 * k, 24 * k, 28 * k);
    return c;
  }

  function renderHeroes() {
    const list = [...users.values()].sort((a, b) => (a.id === myId ? -1 : b.id === myId ? 1 : a.name.localeCompare(b.name)));
    countEl.textContent = list.length;
    heroListEl.innerHTML = '';
    for (const u of list) {
      const lvl = RULES.levelFromXp(u.xp);
      const base = RULES.XP_TABLE[lvl], next = RULES.XP_TABLE[lvl + 1] || base;
      const card = document.createElement('div');
      card.className = 'hero' + (u.id === myId ? ' me' : '');
      card.dataset.id = u.id;
      const name = document.createElement('div'); name.className = 'hname'; name.textContent = u.name + (u.id === myId ? ' (tú)' : '');
      const row = document.createElement('div'); row.className = 'row';
      row.appendChild(portrait(u.look));
      const stats = document.createElement('div'); stats.className = 'stats';
      stats.innerHTML = '<div class="cls"></div><div class="xp" title="Experiencia"><i></i><span></span></div><div class="gold">🪙 <span></span></div>';
      const c1 = RULES.CLASSES[u.look.cls], c2 = u.look.cls2 && RULES.CLASSES[u.look.cls2];
      stats.querySelector('.cls').textContent = `${c1 ? c1.icon + ' ' + c1.name : ''}${c2 ? ' / ' + c2.name : ''} · nv ${lvl}`;
      stats.querySelector('.xp i').style.width = Math.max(0, Math.min(100, Math.round(100 * (u.xp - base) / Math.max(1, next - base)))) + '%';
      stats.querySelector('.xp span').textContent = `${u.xp - base}/${next - base} PX`;
      stats.querySelector('.gold span').textContent = u.gold;
      row.appendChild(stats);
      card.append(name, row);
      if (u.where) {
        const w = document.createElement('div'); w.className = 'where'; w.textContent = `⚔️ En «${u.where}»`;
        card.appendChild(w);
      }
      const acts = document.createElement('div'); acts.className = 'acts';
      if (u.id === myId) {
        const sheetBtn = document.createElement('button'); sheetBtn.className = 'btn'; sheetBtn.textContent = '🧙 PERSONAJE';
        sheetBtn.onclick = () => DD.emit('open-char', 'ficha');
        const eq = document.createElement('button'); eq.className = 'btn alt'; eq.textContent = '🎒 EQUIPO';
        eq.onclick = () => DD.emit('open-char', 'equipo');
        acts.append(sheetBtn, eq);
      } else {
        const greet = document.createElement('button'); greet.className = 'btn'; greet.textContent = 'SALUDAR';
        greet.onclick = () => net.send({ t: 'greet', to: u.id });
        const round = document.createElement('button'); round.className = 'btn alt'; round.textContent = 'INVITAR 🍺5';
        round.onclick = () => net.send({ t: 'round', to: u.id });
        const trade = document.createElement('button'); trade.className = 'btn alt'; trade.textContent = '🤝 COMERCIAR';
        trade.onclick = () => net.send({ t: 'trade:req', to: u.id });
        acts.append(greet, round, trade);
      }
      card.appendChild(acts);
      heroListEl.appendChild(card);
    }
    DD.emit('heroes');
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
    else if (act === 'edit') { closePops(); setEditing(!editing); }
    else if (act === 'dungeons') { closePops(); DD.emit('open-dungeons'); }
    else if (act === 'char') { closePops(); DD.emit('open-char', 'ficha'); }
    else if (act === 'bag') { closePops(); DD.emit('open-char', 'equipo'); }
    else if (act === 'guide') { closePops(); DD.emit('open-guide'); }
    else if (act === 'world') { closePops(); DD.emit('open-world'); }
    else if (act === 'stable') { closePops(); DD.emit('open-stable'); }
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
    logLine({ t: 'system', ts: Date.now(), text: 'Haz clic en el suelo para caminar y en una silla, taburete o el sofá para sentarte. Pulsa sobre los comerciantes para comprar y vender. Comandos: /dado 6, /d20, /me baila, /nombre Nuevo. Enter para escribir, WASD para moverte.' });
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
  //  Editor de la taberna (sólo el dueño de la sala)
  // ======================================================================
  const editorEl = $('#editor');
  const EDIT_ORDER = ['barrel', 'crate', 'smallcrate', 'chest', 'table', 'maptable', 'roundtable', 'bar', 'bookshelf', 'plant', 'chair', 'stool', 'sofa', 'fireplace', 'candelabra', 'chandelier', 'rack', 'cauldron', 'staff'];

  function toolPreview(type) {
    const c = document.createElement('canvas');
    c.width = 112; c.height = 96;
    const g = c.getContext('2d');
    const s = 1.1, center = iso(0.5, 0.5);
    g.setTransform(s, 0, 0, s, 56 - center.x * s, 74 - center.y * s);
    withCtx(g, () => {
      const ds = itemDrawables({ type, x: 0, y: 0, dir: 'S' }, false);
      if (type === 'staff') ds.push({ depth: 0, draw: () => drawStaffZone({ x: 0, y: 0 }) });
      ds.sort((a, b) => a.depth - b.depth).forEach((d) => d.draw());
    });
    return c;
  }

  function buildEditor() {
    const box = $('#edit-tools');
    box.innerHTML = '';
    const tools = [...EDIT_ORDER.map((t) => ({ id: t, name: MAP.FURNITURE[t].name })), { id: 'rotate', name: 'Girar', icon: '↻' }, { id: 'erase', name: 'Quitar', icon: '🧹' }];
    for (const tool of tools) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tool-btn' + (editTool === tool.id ? ' on' : '');
      b.title = tool.name;
      if (tool.icon) { const i = document.createElement('span'); i.className = 'big-ico'; i.textContent = tool.icon; b.appendChild(i); }
      else b.appendChild(toolPreview(tool.id));
      const l = document.createElement('span'); l.textContent = tool.name; b.appendChild(l);
      b.onclick = () => { editTool = tool.id; buildEditor(); };
      box.appendChild(b);
    }
    $('#edit-dir').textContent = { E: '↘', S: '↙', W: '↖', N: '↗' }[editDir];
  }

  function setEditing(on) {
    editing = !!on && isOwner;
    editorEl.classList.toggle('hidden', !editing);
    document.body.classList.toggle('editing', editing);
    if (editing) { buildEditor(); toast('Modo edición: haz clic en el suelo para colocar muebles.'); }
  }

  function editClick(x, y) {
    if (!MAP.inBounds(x, y)) return;
    if (x === MAP.BARKEEP.x && y === MAP.BARKEEP.y) { toast('Ahí trabaja el tabernero.'); return; }
    if (MAP.isFixed(x, y)) { toast('Ese es el puesto de un comerciante.'); return; }
    const it = MAP.itemAt(x, y);
    if (editTool === 'erase') { if (it) net.send({ t: 'tedit', op: 'remove', x, y }); return; }
    if (editTool === 'rotate') { if (it && MAP.FURNITURE[it.type].rotates) net.send({ t: 'tedit', op: 'rotate', x, y }); return; }
    if (it && it.type === editTool && MAP.FURNITURE[it.type].rotates) { net.send({ t: 'tedit', op: 'rotate', x, y }); return; }
    if ([...users.values()].some((u) => !u.where && u.tx === x && u.ty === y) && MAP.FURNITURE[editTool].block) { toast('Hay alguien ahí de pie.'); return; }
    net.send({ t: 'tedit', op: 'place', type: editTool, x, y, dir: editDir });
  }

  function rotateEditDir() {
    editDir = MAP.DIRS[(MAP.DIRS.indexOf(editDir) + 1) % 4];
    $('#edit-dir').textContent = { E: '↘', S: '↙', W: '↖', N: '↗' }[editDir];
  }

  $('#edit-rot').addEventListener('click', rotateEditDir);
  $('#edit-done').addEventListener('click', () => setEditing(false));
  $('#edit-reset').addEventListener('click', () => { if (confirm('¿Volver a la taberna original? Se perderán tus cambios.')) net.send({ t: 'tedit', op: 'reset' }); });
  $('#edit-clear').addEventListener('click', () => { if (confirm('¿Quitar todos los muebles?')) net.send({ t: 'tedit', op: 'clear' }); });
  window.addEventListener('keydown', (e) => {
    if (!editing || (document.activeElement && document.activeElement.tagName === 'INPUT')) return;
    if (e.key === 'r' || e.key === 'R') rotateEditDir();
    if (e.key === 'Escape') setEditing(false);
  });

  function playerToken() {
    let t = load('dd-token');
    if (!t || !/^[a-f0-9]{32}$/.test(t)) {
      const a = new Uint8Array(16);
      crypto.getRandomValues(a);
      t = [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
      save('dd-token', t);
    }
    return t;
  }

  Object.defineProperty(DD, 'myId', { get: () => myId });
  Object.defineProperty(DD, 'roomName', { get: () => roomName });
  Object.assign(DD, {
    net, users, toast, logLine, blip, makeUser, portrait, drawHero: (c, x, y, l, o) => drawHero(c, x, y, l, o), me: null,
    setScene(sc) { DD.scene = sc; document.body.classList.toggle('in-dungeon', sc !== 'tavern'); canvas.classList.toggle('hidden', sc !== 'tavern'); hover = null; if (sc !== 'tavern') setEditing(false); },
  });

  // ======================================================================
  //  Pantalla de entrada
  // ======================================================================
  const loginEl = $('#login');
  const profile = (() => { try { return JSON.parse(load('dd-profile')) || {}; } catch { return {}; } })();
  const look = MAP.cleanLook(Object.assign({ cls: 'guerrero', species: 'human', skin: 0, hair: 0 }, profile.look));

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
    for (const [id, k] of Object.entries(RULES.CLASSES)) {
      const b = document.createElement('button'); b.type = 'button';
      b.className = look.cls === id ? 'on' : '';
      b.title = k.desc;
      b.innerHTML = '<span></span><small></small>';
      b.firstChild.textContent = `${k.icon} ${k.name}`;
      b.lastChild.textContent = RULES.statName(k.main);
      b.onclick = () => { look.cls = id; if (look.cls2 === id) delete look.cls2; buildPickers(); };
      cp.appendChild(b);
    }
    const c2 = $('#class2-pick'); c2.innerHTML = '';
    for (const id of [null, ...Object.keys(RULES.CLASSES)]) {
      if (id === look.cls) continue;
      const b = document.createElement('button'); b.type = 'button';
      b.className = (look.cls2 || null) === id ? 'on' : '';
      b.textContent = id ? `${RULES.CLASSES[id].icon} ${RULES.CLASSES[id].name}` : 'Ninguna';
      b.onclick = () => { if (id) look.cls2 = id; else delete look.cls2; buildPickers(); };
      c2.appendChild(b);
    }
    const spSel = $('#species-pick'); spSel.innerHTML = '';
    for (const [id, k] of Object.entries(MAP.SPECIES)) {
      const b = document.createElement('button'); b.type = 'button';
      b.className = look.species === id ? 'on' : '';
      b.textContent = k.name;
      b.onclick = () => { look.species = id; if (!MAP.skinsFor(id).includes(look.skin)) look.skin = MAP.skinsFor(id)[0]; delete look.sub; buildPickers(); };
      spSel.appendChild(b);
    }
    const skinEl = $('#skin-pick'); skinEl.innerHTML = '';
    MAP.skinsFor(look.species).forEach((i) => {
      const b = document.createElement('button'); b.type = 'button';
      b.style.background = MAP.SKINS[i]; b.className = look.skin === i ? 'on' : '';
      b.onclick = () => { look.skin = i; buildPickers(); };
      skinEl.appendChild(b);
    });
    const hairEl = $('#hair-pick'); hairEl.innerHTML = '';
    MAP.HAIRS.forEach((col, i) => {
      const b = document.createElement('button'); b.type = 'button';
      b.style.background = col; b.className = look.hair === i ? 'on' : '';
      b.onclick = () => { look.hair = i; buildPickers(); };
      hairEl.appendChild(b);
    });
    // vista previa con el equipo inicial de la clase
    const gear = {};
    for (const [slot, base] of RULES.CLASSES[look.cls].start) {
      if (slot === 'arma') gear.w = base; else if (slot === 'mano') gear.o = base; else gear[slot] = base;
    }
    const pv = $('#preview'), g = pv.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, pv.width, pv.height);
    g.translate(60, 112); g.scale(1.3, 1.3);
    drawHero(g, 0, 0, { ...look, gear }, { dir: 'E', t: 0 });
    const k = RULES.CLASSES[look.cls];
    $('#login-sheet-note').textContent = `${k.desc}${look.cls2 ? ` Multiclase con ${RULES.CLASSES[look.cls2].name.toLowerCase()}: sumas sus armas, armaduras y habilidades (las de la segunda clase llegan más tarde).` : ''}`;
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
