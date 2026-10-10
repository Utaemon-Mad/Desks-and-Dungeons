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
  // Puente interno entre game.js y public/tavern/*.js: cada archivo publica aquí lo que usan los demás
  const C = DD.core = {};

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
  window.__tileToScreen = (x, y) => (C.T3.stage ? C.T3.stage.project(x + 0.5, 0, y + 0.5) : { x: 0, y: 0 });

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
  //  Ventanas de la taberna: relámpagos y ojos en la noche
  // ======================================================================

  // Permite reutilizar las funciones de dibujo con otro contexto
  function withCtx(c, fn) {
    const prev = ctx; ctx = c;
    try { fn(); } finally { ctx = prev; }
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

  // ======================================================================
  //  Muebles dibujados en 2D (iconos de la paleta del editor de la taberna)
  // ======================================================================

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
      id: u.id, name: u.name, title: u.title || null, look: u.look, gold: u.gold, xp: u.xp || 0, level: u.level || 1, where: u.where || null,
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


  // ======================================================================
  //  Red
  // ======================================================================
  const net = {
    ws: null, retry: 0, profile: null,
    // profile: { slot, server }
    connect(profile) {
      this.profile = profile;
      this.retry = 0;
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${location.host}/ws`);
      this.ws = ws;
      ws.onopen = () => {
        this.retry = 0;
        connEl.classList.add('hidden');
        ws.send(JSON.stringify({ t: 'join', room: profile.server, slot: profile.slot, token: playerToken() }));
      };
      ws.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch { return; } handle(m); };
      ws.onclose = () => {
        if (this.ws !== ws) return;
        connEl.classList.remove('hidden');
        const delay = Math.min(10000, 800 * 2 ** this.retry++);
        const retry = this.retry;
        setTimeout(() => { if (this.ws === ws) { this.connect(this.profile); this.retry = retry; } }, delay);
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
        roomNameEl.textContent = m.serverName || m.room;
        history.replaceState(null, '', `?sala=${encodeURIComponent(m.room)}`);
        for (const u of m.users) users.set(u.id, makeUser(u));
        MAP.setItems(m.items);
        isOwner = !!m.owner;
        document.querySelector('#bar [data-act="edit"]').classList.toggle('hidden', !isOwner);
        if (!isOwner) C.setEditing(false);
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
        if (m.id === myId) { const { gear, ...l } = m.look; void gear; C.profile.look = l; save('dd-profile', JSON.stringify(C.profile)); }
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
      case 'server-name': if (m.id === roomName) roomNameEl.textContent = m.name; break;
      case 'kicked': net.close(); connEl.classList.add('hidden'); C.toTitle(); toast(m.text); break;
      case 'title': { const u = users.get(m.id); if (u) { u.title = m.title; renderHeroes(); } break; }
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

  // Retrato: el modelo 3D del héroe, de pecho para arriba
  function portrait(look, size = 58) {
    const c = document.createElement('canvas');
    c.width = size * 2; c.height = size * 2;
    try { c.getContext('2d').drawImage(VIEW3D.snapshot(look, size * 2, size * 2, 'bust'), 0, 0); } catch { /* sin WebGL */ }
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
      if (u.title) { const tt = document.createElement('small'); tt.className = 'htitle'; tt.textContent = ` «${u.title}»`; name.appendChild(tt); }
      const row = document.createElement('div'); row.className = 'row';
      row.appendChild(portrait(u.look));
      const stats = document.createElement('div'); stats.className = 'stats';
      stats.innerHTML = '<div class="cls"></div><div class="xp" title="Experiencia"><i></i><span></span></div><div class="gold">🪙 <span></span></div>';
      const c1 = RULES.CLASSES[u.look.cls];
      stats.querySelector('.cls').textContent = `${c1 ? c1.icon + ' ' + c1.name : ''} · nv ${lvl}`;
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
        const room = document.createElement('button'); room.className = 'btn alt'; room.textContent = '🏠 MI HABITACIÓN';
        room.onclick = () => net.send({ t: 'room:get' });
        acts.append(sheetBtn, eq, room);
      } else {
        const greet = document.createElement('button'); greet.className = 'btn'; greet.textContent = 'SALUDAR';
        greet.onclick = () => net.send({ t: 'greet', to: u.id });
        const round = document.createElement('button'); round.className = 'btn alt'; round.textContent = 'INVITAR 🍺5';
        round.onclick = () => net.send({ t: 'round', to: u.id });
        const trade = document.createElement('button'); trade.className = 'btn alt'; trade.textContent = '🤝 COMERCIAR';
        trade.onclick = () => net.send({ t: 'trade:req', to: u.id });
        const duel = document.createElement('button'); duel.className = 'btn alt'; duel.textContent = '🤺 DUELO';
        duel.onclick = () => DD.emit('duel-ask', u);
        const room = document.createElement('button'); room.className = 'btn alt'; room.textContent = '🏠 HABITACIÓN';
        room.onclick = () => net.send({ t: 'room:get', id: u.id });
        acts.append(greet, round, trade, duel, room);
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
    else if (act === 'edit') { closePops(); C.setEditing(!editing); }
    else if (act === 'dungeons') { closePops(); DD.emit('open-dungeons'); }
    else if (act === 'char') { closePops(); DD.emit('open-char', 'ficha'); }
    else if (act === 'bag') { closePops(); DD.emit('open-char', 'equipo'); }
    else if (act === 'guide') { closePops(); DD.emit('open-guide'); }
    else if (act === 'world') { closePops(); DD.emit('open-world'); }
    else if (act === 'stable') { closePops(); DD.emit('open-stable'); }
    else if (act === 'svc') { closePops(); DD.emit('toggle-services', b); }
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
    } else if (m === 'hero') { C.toTitle(); }
    else if (m === 'help') showHelp();
    else if (m === 'gfx') DD.emit('open-options');
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
    heroImage: (look, w, h, mode) => VIEW3D.snapshot(look, w, h, mode),
    // modelos de verdad (KayKit): se cargan al empezar; mientras, se ven los low poly propios
    modelsReady: MODELS.loadAssets().then((ok) => { if (!ok) return; renderHeroes(); if (!C.loginEl.classList.contains('hidden')) C.buildPickers(); if (C.screen === 'slots') C.renderSlots(); DD.emit('models-ready'); if (DD.me) DD.emit('look', { id: myId, look: (users.get(myId) || {}).look }); }),
    setScene(sc) { DD.scene = sc; document.body.classList.toggle('in-dungeon', sc !== 'tavern'); canvas.classList.toggle('hidden', sc !== 'tavern'); C.hover = null; if (sc !== 'tavern') C.setEditing(false); },
  });



  // ---- lo que usan los demás archivos de la taberna ----
  Object.assign(C, { $, EMOJI, OUT, WINDOWS, barkeep, bartenderLook, blip, canvas, chatInput, closePops, drawHero, drawStaffZone, flashLevel, floaters, heroesEl, iso, itemDrawables, load, mug, net, playerToken, poly, rand, resize, rrect, save, setTarget, toast, up, updateBarkeep, updateNight, updateUsers, users, withCtx, wrapText });
  Object.defineProperty(C, 'ctx', { get: () => ctx, set: (v) => { ctx = v; } });
  Object.defineProperty(C, 'editDir', { get: () => editDir, set: (v) => { editDir = v; } });
  Object.defineProperty(C, 'editTool', { get: () => editTool, set: (v) => { editTool = v; } });
  Object.defineProperty(C, 'editing', { get: () => editing, set: (v) => { editing = v; } });
  Object.defineProperty(C, 'isOwner', { get: () => isOwner, set: (v) => { isOwner = v; } });
  Object.defineProperty(C, 'myId', { get: () => myId, set: (v) => { myId = v; } });
  Object.defineProperty(C, 'view', { get: () => view, set: (v) => { view = v; } });
})();
