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
      if (it.type !== 'roundtable') continue;
      const c = iso(it.x + 0.5, it.y + 0.5);
      list.push({ p: { x: c.x - 5, y: c.y - 40 }, r: 55, warm: true, seed: it.x * 3 + it.y });
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
    g.fillStyle = `rgba(3,3,12,${fl ? 0.25 : 0.86})`;
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
      g.save(); g.globalAlpha = fl ? 0.6 : 0.18; g.beginPath(); a.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); g.filter = 'blur(6px)'; g.fill(); g.restore();
    }
    g.globalCompositeOperation = 'source-over';
    ctx.drawImage(lightCv, 0, 0, lightCv.width, lightCv.height);

    // brillo cálido de las llamas
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const L of lights) {
      const rg = ctx.createRadialGradient(L.p.x, L.p.y, 0, L.p.x, L.p.y, L.r * 0.8);
      rg.addColorStop(0, 'rgba(255,150,60,.16)'); rg.addColorStop(1, 'rgba(255,110,30,0)');
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
    }
    return [];
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

  const bartenderLook = { cls: 'bardo', skin: 1, hair: 1, npc: true, color: '#7a4a2a', beard: '#6b4226', bald: true, apron: true };

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
    c.drawImage(spr, -12 * PX, -32 * PX, spr.width * PX, spr.height * PX);
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
      id: u.id, name: u.name, look: u.look, gold: u.gold, xp: u.xp || 0, where: u.where || null,
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
    if (DD.scene !== 'tavern') { requestAnimationFrame(frame); return; }
    updateNight(now);
    updateBarkeep(now);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // fondo de noche (se ilumina con los relámpagos)
    const flash = flashLevel(now);
    const g = ctx.createRadialGradient(canvas.width / 2, canvas.height * 0.4, 50, canvas.width / 2, canvas.height / 2, Math.max(canvas.width, canvas.height) * 0.75);
    g.addColorStop(0, flash ? '#3a3a5a' : '#1c0a14'); g.addColorStop(0.6, flash ? '#1a1a2e' : '#0e050c'); g.addColorStop(1, '#040205');
    ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height);

    const k = view.dpr * view.scale;
    ctx.setTransform(k, 0, 0, k, view.ox * view.dpr, view.oy * view.dpr);
    if (!staticLayer) buildStatic();
    ctx.drawImage(staticLayer, 0, 0, WORLD_W, WORLD_H);

    drawWindows(now);
    drawTorches(now);

    // casilla bajo el ratón
    if (hover && editing) {
      const it = MAP.itemAt(hover.x, hover.y);
      const col = editTool === 'erase' ? '#ff6b6b' : editTool === 'rotate' ? '#7ad0ff' : '#ffe9a8';
      poly([iso(hover.x, hover.y), iso(hover.x + 1, hover.y), iso(hover.x + 1, hover.y + 1), iso(hover.x, hover.y + 1)],
        it && editTool === 'erase' ? 'rgba(216,67,59,.35)' : 'rgba(255,230,150,.15)', col, 2);
    } else if (hover && MAP.isStandable(hover.x, hover.y)) {
      const occupied = MAP.isSeat(hover.x, hover.y) && [...users.values()].some((u) => u.id !== myId && !u.where && u.tx === hover.x && u.ty === hover.y);
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
    for (const u of users.values()) if (!u.where) drawables.push(userDrawable(u, now)); else u._screen = null;
    if (editing && hover && MAP.inBounds(hover.x, hover.y) && editTool !== 'erase' && editTool !== 'rotate') {
      drawables.push(...itemDrawables({ type: editTool, x: hover.x, y: hover.y, dir: editDir }, true));
    }
    drawables.sort((a, b) => a.depth - b.depth);
    for (const d of drawables) d.draw();

    // oscuridad, antorchas y luna
    drawDarkness(now);

    // polvo flotando
    ctx.fillStyle = 'rgba(190,180,210,.18)';
    for (const m of motes) {
      m.y -= m.v * dt; m.x += Math.sin(now / 2000 + m.s * 10) * 0.2;
      if (m.y < -10) { m.y = WORLD_H + 10; m.x = Math.random() * WORLD_W; }
      ctx.fillRect(m.x, m.y, m.s, m.s);
    }

    drawOverlays(now);
    requestAnimationFrame(frame);
  }

  // Antorchas de pared (pequeñas: alumbran sólo su rincón)
  const TORCHES = [
    { x: 4, y: 0, z: 82, r: 95 }, { x: 9.5, y: 0, z: 82, r: 90 }, { x: 0, y: 8, z: 82, r: 90 },
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
    const t = screenToTile(e.clientX, e.clientY);
    hover = MAP.inBounds(t.x, t.y) ? t : null;
  });
  canvas.addEventListener('pointerleave', () => { hover = null; });
  canvas.addEventListener('click', (e) => {
    closePops();
    const t = screenToTile(e.clientX, e.clientY);
    if (editing) { editClick(t.x, t.y); return; }
    if (!MAP.isStandable(t.x, t.y)) return;
    const me = users.get(myId);
    if (!me) return;
    if (MAP.isSeat(t.x, t.y) && [...users.values()].some((u) => u.id !== myId && !u.where && u.tx === t.x && u.ty === t.y)) {
      toast('Ese asiento está ocupado.'); return;
    }
    setTarget(me, t.x, t.y);
    net.send({ t: 'move', x: t.x, y: t.y });
  });

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
        const before = MAP.levelFromXp(u.xp);
        const gained = m.gold - u.gold;
        u.xp = m.xp; u.gold = m.gold;
        if (MAP.levelFromXp(u.xp) > before && m.id === myId) { toast(`⭐ ¡Subes a nivel ${MAP.levelFromXp(u.xp)}!`); blip(990, 0.2); }
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
        barkeep.text = '¡Marchando una jarra!'; barkeep.until = now + 2500;
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
      const k = MAP.CLASSES[u.look.cls];
      const st = MAP.heroStats(u.look.cls, u.xp);
      const card = document.createElement('div');
      card.className = 'hero' + (u.id === myId ? ' me' : '');
      card.dataset.id = u.id;
      const name = document.createElement('div'); name.className = 'hname'; name.textContent = u.name + (u.id === myId ? ' (tú)' : '');
      const row = document.createElement('div'); row.className = 'row';
      row.appendChild(portrait(u.look));
      const stats = document.createElement('div'); stats.className = 'stats';
      stats.innerHTML = `<div class="cls"></div><div>❤️ HP ${st.hp} · 🗡️ ATT ${st.att}</div><div class="xp" title="Experiencia"><i></i><span></span></div><div class="gold">🪙 <span></span></div>`;
      stats.querySelector('.cls').textContent = `${k.name} · Nivel ${st.level}`;
      stats.querySelector('.xp i').style.width = Math.round(100 * (u.xp - st.base) / (st.next - st.base)) + '%';
      stats.querySelector('.xp span').textContent = `${u.xp}/${st.next} XP`;
      stats.querySelector('.gold span').textContent = u.gold;
      row.appendChild(stats);
      card.append(name, row);
      if (u.where) {
        const w = document.createElement('div'); w.className = 'where'; w.textContent = `⚔️ En «${u.where}»`;
        card.appendChild(w);
      }
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
    logLine({ t: 'system', ts: Date.now(), text: 'Haz clic en el suelo para caminar y en una silla, taburete o el sofá para sentarte. Comandos: /dado 6, /d20, /me baila, /nombre Nuevo. Enter para escribir, WASD para moverte.' });
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
  const EDIT_ORDER = ['barrel', 'crate', 'smallcrate', 'table', 'maptable', 'roundtable', 'bar', 'bookshelf', 'plant', 'chair', 'stool', 'sofa', 'staff'];

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
    net, users, toast, logLine, blip, makeUser,
    setScene(sc) { DD.scene = sc; document.body.classList.toggle('in-dungeon', sc !== 'tavern'); hover = null; if (sc !== 'tavern') setEditing(false); },
  });

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
      b.innerHTML = `<span></span><small>❤️${k.hp * 2} 🗡️${k.att}</small>`;
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
