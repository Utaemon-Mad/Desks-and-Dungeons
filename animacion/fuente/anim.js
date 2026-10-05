// "La historia detrás del juego" — animación procedural en canvas.
// render(t) dibuja el fotograma en el segundo t (determinista).
const W = 1920, H = 1080, TR = 770, FG = 930;
const INK = '#2b2220', PAPER = '#fffdf8', GOLD = '#d4a94e';
const T_END = 17.2;
const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
let LS = 1; // escala de línea según zoom

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (t, a, b) => clamp((t - a) / (b - a));
const eio = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const eo = t => 1 - Math.pow(1 - t, 3);
const back = t => { const c1 = 1.9, c3 = c1 + 1; return t <= 0 ? 0 : 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const rnd = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const pulse = (t, a, d) => { const x = (t - a) / d; return x < 0 || x > 1 ? 0 : Math.sin(x * Math.PI); };

function ln(w = 7, col = INK) { ctx.lineWidth = w * LS; ctx.strokeStyle = col; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; }
function fs(fill, w = 7, col = INK) { if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (w) { ln(w, col); ctx.stroke(); } }
function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function ell(x, y, rx, ry, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(rx, .01), Math.max(ry, .01), rot, 0, Math.PI * 2); }
function line(x1, y1, x2, y2, w = 7, col = INK) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ln(w, col); ctx.stroke(); }
function roundedPoly(pts, rad) {
  const n = pts.length, m = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  ctx.beginPath(); const s = m(pts[n - 1], pts[0]); ctx.moveTo(s[0], s[1]);
  for (let i = 0; i < n; i++) { const p = pts[i], q = m(p, pts[(i + 1) % n]); ctx.arcTo(p[0], p[1], q[0], q[1], rad); }
  ctx.closePath();
}
function star(x, y, R, r, rot = 0) {
  const pts = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + rot + i * Math.PI / 5, d = i % 2 ? r : R; pts.push([x + Math.cos(a) * d, y + Math.sin(a) * d]); }
  roundedPoly(pts, R * 0.12);
}

// ---------------------------------------------------------------- tren
const STOP = 635, DEPART = 7.95, TRAIN_LEN = 2540;
function trainX(t) {
  if (t < 5.0) { const p = seg(t, 1.8, 5.0); return STOP + (2300 - STOP) * Math.pow(1 - p, 2.2); }
  if (t < DEPART) return STOP;
  const d = t - DEPART; return STOP - 0.5 * 1100 * d * d;
}
function trainV(t) { const e = 1 / 120; return (trainX(t + e) - trainX(t - e)) / (2 * e); }

function wheel(x, y, r, ang) {
  ell(x, y, r, r); fs('#3b3535', 6);
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  for (let k = 0; k < 8; k++) { line(0, 0, 0, r - 9, 4, '#a88a52'); ctx.rotate(Math.PI / 4); }
  ctx.restore();
  ell(x, y, r - 7, r - 7); ln(3, '#a88a52'); ctx.stroke();
  ell(x, y, r * 0.2, r * 0.2); fs(GOLD, 4);
}

function drawTrain(t) {
  const fx = trainX(t);
  if (fx > W + 80 || fx + TRAIN_LEN < -80) return;
  // carruajes
  for (let i = 0; i < 3; i++) {
    const cx = fx + 545 + i * 665;
    if (cx > W + 50 || cx + 660 < -50) continue;
    rr(cx - 30, TR - 128, 40, 16, 4); fs('#2d2828', 5);
    rr(cx + 20, TR - 140, 600, 38, 8); fs('#2d2828', 6);
    for (const wx of [80, 160, 480, 560]) wheel(cx + wx, TR - 34, 34, fx / 34);
    rr(cx, TR - 372, 640, 238, 16); fs('#7d2532', 7);
    rr(cx + 14, TR - 356, 612, 206, 10); ln(4, GOLD); ctx.stroke();
    line(cx + 14, TR - 215, cx + 626, TR - 215, 4, GOLD);
    rr(cx - 12, TR - 402, 664, 44, 22); fs('#3b3535', 7);
    const wins = i === 0 ? [160, 290, 420, 540] : [40, 165, 290, 415, 540];
    for (const wx of wins) {
      rr(cx + wx, TR - 340, 88, 92, 10); fs('#f3e7d6', 6);
      line(cx + wx + 18, TR - 262, cx + wx + 46, TR - 330, 5, '#ffffff');
      rr(cx + wx + 8, TR - 196, 72, 30, 6); ln(4, '#5e1a24'); ctx.stroke();
    }
    if (i === 0) drawDoor(cx + 30, t);
  }
  // locomotora
  rr(fx - 10, TR - 165, 545, 44, 8); fs('#2d2828', 6);
  ctx.beginPath(); ctx.moveTo(fx - 8, TR - 125); ctx.lineTo(fx - 50, TR - 8); ctx.lineTo(fx + 40, TR - 8); ctx.lineTo(fx + 40, TR - 125); ctx.closePath(); fs('#3b3535', 6);
  for (let k = 0; k < 4; k++) line(fx - 4 - k * 9, TR - 112 + k * 28, fx + 38, TR - 112 + k * 28, 3, '#a88a52');
  rr(fx + 20, TR - 325, 345, 168, 52); fs('#2f2a2a', 7);
  for (const bx of [140, 255]) { rr(fx + bx, TR - 322, 14, 162, 3); fs(GOLD, 3); }
  ell(fx + 26, TR - 241, 24, 80); fs('#252020', 6);
  ell(fx + 22, TR - 241, 9, 9); fs(GOLD, 3);
  rr(fx + 70, TR - 405, 58, 88, 6); fs('#2f2a2a', 7);
  rr(fx + 58, TR - 428, 82, 28, 9); fs('#2f2a2a', 7);
  line(fx + 66, TR - 398, fx + 132, TR - 398, 4, GOLD);
  ctx.beginPath(); ctx.arc(fx + 205, TR - 322, 40, Math.PI, 0); ctx.closePath(); fs('#2f2a2a', 7);
  rr(fx + 160, TR - 330, 90, 10, 4); fs(GOLD, 3);
  ctx.beginPath(); ctx.arc(fx + 300, TR - 322, 28, Math.PI, 0); ctx.closePath(); fs('#2f2a2a', 7);
  rr(fx + 365, TR - 392, 168, 238, 10); fs('#2f2a2a', 7);
  rr(fx + 348, TR - 414, 200, 32, 12); fs('#1f1b1b', 7);
  rr(fx + 400, TR - 362, 92, 82, 10); fs('#f2e3c9', 6);
  rr(fx + 380, TR - 262, 136, 92, 8); ln(4, GOLD); ctx.stroke();
  const big = [[175, 66], [300, 66]], small = [[72, 42], [455, 48]];
  for (const [wx, r] of small) wheel(fx + wx, TR - r, r, fx / r);
  for (const [wx, r] of big) wheel(fx + wx, TR - r, r, fx / r);
  const a = fx / 66, c1 = [fx + 175 + Math.cos(a) * 34, TR - 66 + Math.sin(a) * 34], c2 = [fx + 300 + Math.cos(a) * 34, TR - 66 + Math.sin(a) * 34];
  line(c1[0], c1[1], c2[0], c2[1], 16); line(c1[0], c1[1], c2[0], c2[1], 8, '#b9aea2');
  // líneas de velocidad sobre el tren
  const v = Math.abs(trainV(t));
  if (v > 120) {
    const al = clamp((v - 120) / 700) * 0.6;
    for (let i = 0; i < 14; i++) {
      const y = TR - 360 + rnd(i) * 300, len = 90 + rnd(i + 5) * 160;
      const span = W + 600; let x = (rnd(i + 9) * span + t * v * (0.5 + rnd(i + 3))) % span - 300;
      if (x < fx || x > fx + TRAIN_LEN) continue;
      line(x, y, x + len, y, 5, `rgba(255,255,255,${al})`);
    }
  }
}

function doorState(t) { return eio(seg(t, 5.15, 5.5)) - eio(seg(t, 7.6, 7.85)); }
function ladderState(t) { return eio(seg(t, 5.4, 5.75)) - eio(seg(t, 7.35, 7.6)); }

function drawDoor(dx, t) {
  const open = doorState(t);
  rr(dx, TR - 356, 92, 206, 6); fs('#33211f', 6);
  if (open > 0) {
    const g = ctx.createRadialGradient(dx + 46, TR - 260, 10, dx + 46, TR - 260, 140);
    g.addColorStop(0, `rgba(255,220,130,${0.85 * open})`); g.addColorStop(1, 'rgba(255,220,130,0)');
    ctx.fillStyle = g; ctx.fillRect(dx, TR - 356, 92, 206);
  }
  const w = 92 * (1 - open * 0.86);
  rr(dx, TR - 356, w, 206, 6); fs('#6d1d29', 6);
  if (w > 30) { rr(dx + w * 0.18, TR - 340, w * 0.64, 70, 8); fs('#f3e7d6', 5); }
}

function drawLadder(t) {
  const L = ladderState(t); if (L <= 0) return;
  const dx = trainX(t) + 575;
  const top = [dx + 16, TR - 152], bot = [dx + 40, TR + 52];
  const b = [lerp(top[0], bot[0], L), lerp(top[1], bot[1], L)];
  for (const off of [0, 58]) { line(top[0] + off, top[1], b[0] + off, b[1], 15); line(top[0] + off, top[1], b[0] + off, b[1], 7, '#b8b0a8'); }
  for (let k = 1; k <= 4; k++) { const f = k / 4.6; if (f > L) break; const y = lerp(top[1], bot[1], f), x = lerp(top[0], bot[0], f); line(x, y, x + 58, y, 7); }
}

// ---------------------------------------------------------------- vapor
function puffs(t) {
  const hi = [], lo = [];
  for (let i = 0; ; i++) {
    const ts = 1.8 + i * 0.075; if (ts > t || ts > 10.8) break;
    const a = t - ts; const stopped = ts > 5.05 && ts < DEPART - 0.3;
    const whistle = ts > 7.65 && ts < 8.2;
    if (stopped && !whistle && i % 4) continue;
    const life = whistle ? 2.2 : 1.7; if (a > life) continue;
    const fx = trainX(ts), k = a / life;
    const big = whistle ? 1.5 : 1;
    hi.push({ x: fx + 99 + (rnd(i) - .5) * 30 + 70 * a, y: TR - 440 - 170 * a - 40 * a * a, r: (26 + 80 * a + rnd(i + 1) * 14) * big * (1 - Math.pow(k, 4)) });
  }
  const bursts = [[3.9, 5.3], [7.6, 9.0]];
  for (const [b0, b1] of bursts) for (let i = 0; ; i++) {
    const ts = b0 + i * 0.05; if (ts > t || ts > b1) break;
    const a = t - ts, life = 1.3; if (a > life) continue;
    const fx = trainX(ts), k = a / life;
    const ox = 40 + rnd(i * 3 + 7) * 470;
    lo.push({ x: fx + ox + (rnd(i * 5) - .5) * 260 * a, y: TR - 28 - 70 * a, r: (18 + 70 * a) * (1 - Math.pow(k, 3)) });
  }
  return { hi, lo };
}
function drawPuffs(list, edge = '#c4bcb5') {
  if (!list.length) return;
  for (const p of list) { if (p.r <= 1) continue; ell(p.x, p.y, p.r, p.r * 0.92); ln(9, edge); ctx.stroke(); }
  for (const p of list) { if (p.r <= 1) continue; ell(p.x, p.y, p.r, p.r * 0.92); ctx.fillStyle = '#ffffff'; ctx.fill(); }
}

// ---------------------------------------------------------------- niña
function hairBlob(cx, cy, rx, ry, n, amp, ph) {
  const pts = [];
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 - Math.PI / 2; const w = 1 + 0.035 * Math.sin(ph + i * 1.7); pts.push([cx + Math.cos(a) * rx * w, cy + Math.sin(a) * ry * w]); }
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n]; const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
    const dx = mx - cx, dy = my - cy, d = Math.hypot(dx, dy);
    ctx.quadraticCurveTo(mx + dx / d * amp, my + dy / d * amp, q[0], q[1]);
  }
  ctx.closePath();
}
function mouth(k, x, y) {
  if (k <= 0.05) { ctx.beginPath(); ctx.arc(x, y - 8, 12, 0.18 * Math.PI, 0.82 * Math.PI); ln(5); ctx.stroke(); return; }
  if (k < 0.3) { line(x - 7, y, x + 7, y, 5); return; }
  const rx = 8 * k, ry = 11 * k;
  ell(x, y, rx, ry); ctx.fillStyle = '#4a2423'; ctx.fill();
  ctx.save(); ell(x, y, rx, ry); ctx.clip(); ell(x, y + ry * 0.8, rx * 0.85, ry * 0.55); ctx.fillStyle = '#d98b8b'; ctx.fill(); ctx.restore();
  ell(x, y, rx, ry); ln(5); ctx.stroke();
}
function arm(sh, el, ha) {
  ctx.beginPath(); ctx.moveTo(sh[0], sh[1]); ctx.lineTo(el[0], el[1]); ctx.lineTo(ha[0], ha[1]);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.lineWidth = 46 + 14 * LS; ctx.strokeStyle = INK; ctx.stroke();
  ctx.lineWidth = 46; ctx.strokeStyle = '#ffffff'; ctx.stroke();
  ell(ha[0], ha[1], 17, 17); fs('#ffffff', 6);
}

function drawGirl(g) {
  ctx.save(); ctx.translate(g.x, g.y);
  ell(0, 6, 120, 16); ctx.fillStyle = 'rgba(60,40,30,0.08)'; ctx.fill();
  ctx.rotate(g.lean); ctx.scale(g.s, g.s);
  const bob = -Math.abs(Math.sin(g.phase)) * 10 * g.walk;
  // pelo trasero
  ctx.save(); ctx.translate(0, bob);
  hairBlob(0, -284, 140, 150, 18, 27, g.phase * 0.8 + g.t * 1.5); fs('#ffffff', 7);
  for (const [x, y, r, a0] of [[-118, -200, 22, 0.6], [112, -210, 20, 2.0], [-122, -300, 18, 0.2], [120, -320, 18, 2.6]]) { ctx.beginPath(); ctx.arc(x, y, r, a0, a0 + 2.2); ln(5); ctx.stroke(); }
  ctx.restore();
  // piernas
  const hipY = -118 + bob;
  for (const side of [-1, 1]) {
    const ang = side * 0.4 * Math.sin(g.phase) * g.walk;
    ctx.save(); ctx.translate(side * 25, hipY); ctx.rotate(ang);
    rr(-24, -8, 48, 96, 18); fs('#ffffff', 7);
    ell(7, 98, 35, 19); fs('#ffffff', 7);
    line(-12, 92, 26, 92, 5);
    ctx.restore();
  }
  ctx.save(); ctx.translate(0, bob);
  // torso
  rr(-64, -230, 128, 128, 36); fs('#ffffff', 7);
  rr(-60, -142, 120, 42, 14); fs('#ffffff', 7);
  rr(-42, -196, 84, 66, 10); fs('#ffffff', 7);
  rr(-20, -180, 40, 26, 6); ln(5); ctx.stroke();
  line(-34, -194, -46, -226, 6); line(34, -194, 46, -226, 6);
  ell(-34, -190, 5, 5); fs(INK, 0); ell(34, -190, 5, 5); fs(INK, 0);
  // cabeza
  for (const side of [-1, 1]) { ell(side * 80, -288, 17, 19); fs('#ffffff', 6); ctx.beginPath(); ctx.arc(side * 82, -288, 8, side < 0 ? 0.6 * Math.PI : -0.4 * Math.PI, side < 0 ? 1.4 * Math.PI : 0.4 * Math.PI); ln(4); ctx.stroke(); }
  ell(0, -298, 80, 74); fs('#ffffff', 7);
  ctx.beginPath(); ctx.arc(0, -300, 86, Math.PI, 0); ctx.lineTo(86, -300); ctx.lineTo(70, -313);
  for (let x = 70; x > -70; x -= 35) ctx.quadraticCurveTo(x - 17.5, -303, x - 35, -315);
  ctx.lineTo(-86, -300); ctx.closePath(); fs('#ffffff', 7);
  for (const x of [35, 0, -35]) line(x, -315, x + 5, -342, 4);
  // cara
  const lx = g.look * 9, sur = g.surprised;
  ell(-48 + lx * 0.5, -262, 13, 7); ctx.fillStyle = 'rgba(240,140,150,0.35)'; ctx.fill();
  ell(48 + lx * 0.5, -262, 13, 7); ctx.fillStyle = 'rgba(240,140,150,0.35)'; ctx.fill();
  if (g.blink) { line(-34 + lx, -281, -20 + lx, -281, 5); line(20 + lx, -281, 34 + lx, -281, 5); }
  else for (const ex of [-27, 27]) { const r = 7.5 + sur * 2; ell(ex + lx, -281, r, r * 1.08); fs(INK, 0); ell(ex + lx + 2.5, -284, r * 0.3, r * 0.3); ctx.fillStyle = '#ffffff'; ctx.fill(); }
  mouth(g.mouth, lx * 0.6, -250);
  // brazos
  const ch = eio(g.cheeks);
  for (const side of [-1, 1]) {
    const sh = [side * 56, -210];
    const th = side * 0.22 - side * 0.42 * Math.sin(g.phase) * g.walk + side * g.reach;
    const elW = [sh[0] + Math.sin(th) * 50, sh[1] + Math.cos(th) * 50];
    const th2 = th + side * 0.12 - side * 0.25 * Math.sin(g.phase) * g.walk;
    const haW = [elW[0] + Math.sin(th2) * 46, elW[1] + Math.cos(th2) * 46];
    const elC = [side * 102, -176], haC = [side * 66, -266];
    arm(sh, [lerp(elW[0], elC[0], ch), lerp(elW[1], elC[1], ch)], [lerp(haW[0], haC[0], ch), lerp(haW[1], haC[1], ch)]);
  }
  // líneas de sorpresa
  if (g.lines > 0) {
    for (const side of [-1, 1]) for (const [k, a] of [[0, 0.55], [1, 0.85], [2, 1.15]]) {
      const an = side * a, r0 = 182 + 6 * Math.sin(g.t * 30 + k), L = 34 * g.lines;
      line(Math.sin(an) * r0, -300 - Math.cos(an) * r0, Math.sin(an) * (r0 + L), -300 - Math.cos(an) * (r0 + L), 6);
    }
  }
  ctx.restore(); ctx.restore();
}

function girlState(t) {
  const p = seg(t, 0, 3.3);
  const x = lerp(-260, 600, 1 - (1 - p) * (1 - p));
  const look = eio(seg(t, 2.3, 2.9)) - eio(seg(t, 8.6, 8.9));
  let m = 0;
  m = lerp(m, 0.2, seg(t, 4.0, 4.05));
  m = lerp(m, 0.75, back(seg(t, 4.85, 5.05)));
  m = lerp(m, 1.05, back(seg(t, 5.9, 6.1)));
  m = lerp(m, 1.5, back(seg(t, 8.8, 9.05)));
  m = lerp(m, 2.25, eio(seg(t, 9.8, 12.2)));
  const blink = [1.3, 3.7, 7.45].some(b => t > b && t < b + 0.13);
  const lines = Math.max(back(seg(t, 4.85, 5.1)) * (1 - seg(t, 5.6, 5.8)), back(seg(t, 5.9, 6.1)) * (1 - seg(t, 6.7, 6.9)), back(seg(t, 8.85, 9.1)) * (1 - seg(t, 10.6, 10.9)));
  const lean = 0.07 * eio(seg(t, 6.3, 6.9)) * (1 - eio(seg(t, 8.4, 8.8)));
  return {
    t, x, y: FG, s: 1.15, phase: (x + 260) / 58, walk: clamp((1 - p) * 2.6), look,
    mouth: m, blink, lines, lean, cheeks: seg(t, 8.7, 9.05),
    surprised: clamp(seg(t, 4.85, 5.0) + seg(t, 8.8, 9.0)) * 0.6 + seg(t, 8.8, 9.0) * 0.4,
    reach: 0.25 * pulse(t, 6.3, 2.3),
  };
}

function drawNotes(t, gx) {
  for (const [t0, dx] of [[0.2, 60], [1.2, 110], [2.1, 80]]) {
    const a = t - t0; if (a < 0 || a > 1.6) continue;
    const x = gx + 150 + dx * 0.4 + Math.sin(a * 4) * 14, y = FG - 470 - a * 90;
    ctx.save(); ctx.globalAlpha = Math.min(1, a * 4) * (1 - seg(a, 1.1, 1.6));
    ell(x, y, 13, 10, -0.4); fs(INK, 0);
    line(x + 11, y - 3, x + 11, y - 52, 5);
    ctx.beginPath(); ctx.moveTo(x + 11, y - 52); ctx.quadraticCurveTo(x + 30, y - 40, x + 28, y - 24); ln(5); ctx.stroke();
    ctx.restore();
  }
}

// ---------------------------------------------------------------- meeple + sacos
function drawSack(x, y, s, rot) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
  ctx.beginPath(); ctx.moveTo(-16, -92);
  ctx.bezierCurveTo(-30, -75, -64, -55, -62, -28); ctx.bezierCurveTo(-60, -4, -40, 0, 0, 0);
  ctx.bezierCurveTo(40, 0, 60, -4, 62, -28); ctx.bezierCurveTo(64, -55, 30, -75, 16, -92); ctx.closePath(); fs('#dbb27b', 7);
  ctx.beginPath(); ctx.moveTo(-16, -92); ctx.quadraticCurveTo(-36, -116, -24, -126); ctx.quadraticCurveTo(-10, -112, 0, -128);
  ctx.quadraticCurveTo(10, -112, 24, -126); ctx.quadraticCurveTo(36, -116, 16, -92); ctx.closePath(); fs('#dbb27b', 7);
  rr(-21, -100, 42, 13, 6); fs('#b88a52', 5);
  ctx.fillStyle = '#6b4a2b'; ctx.font = '700 58px Fredoka'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('£', 0, -38);
  ctx.restore();
}
function drawMeeple(x, y, s, sq, t, glow) {
  if (glow > 0) {
    const g = ctx.createRadialGradient(x, y - 90 * s, 10, x, y - 90 * s, 230 * s);
    g.addColorStop(0, `rgba(255,224,120,${0.45 * glow})`); g.addColorStop(1, 'rgba(255,224,120,0)');
    ctx.fillStyle = g; ctx.fillRect(x - 260 * s, y - 330 * s, 520 * s, 520 * s);
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI * 0.95 + i * Math.PI * 0.9 / 6 + 0.05 * Math.sin(t * 3 + i);
      const r0 = 170 * s + 10 * Math.sin(t * 9 + i * 2), r1 = r0 + 40 * s * glow;
      line(x + Math.cos(a) * r0, y - 95 * s + Math.sin(a) * r0, x + Math.cos(a) * r1, y - 95 * s + Math.sin(a) * r1, 7, GOLD);
    }
  }
  ctx.save(); ctx.translate(x, y);
  ell(0, 4, 150 * s, 14 * s); ctx.fillStyle = 'rgba(60,40,30,0.08)'; ctx.fill();
  ctx.scale(s * (1 + sq * 0.14), s * (1 - sq * 0.14));
  drawSack(-92, 0, 0.82, -0.08 + 0.05 * Math.sin(t * 6));
  drawSack(92, 0, 0.82, 0.08 - 0.05 * Math.sin(t * 6 + 1));
  star(0, -88, 98, 52); fs('#f7d56e', 7);
  ell(-18, -98, 6.5, 7.5); fs(INK, 0); ell(18, -98, 6.5, 7.5); fs(INK, 0);
  ctx.beginPath(); ctx.arc(0, -86, 11, 0.15 * Math.PI, 0.85 * Math.PI); ln(5); ctx.stroke();
  ell(-34, -82, 9, 5); ctx.fillStyle = 'rgba(240,130,120,0.45)'; ctx.fill();
  ell(34, -82, 9, 5); ctx.fillStyle = 'rgba(240,130,120,0.45)'; ctx.fill();
  rr(-38, -214, 76, 40, 16); fs('#2f3550', 7);
  ell(0, -174, 50, 11); fs('#232840', 6);
  ell(0, -195, 7, 7); fs(GOLD, 3);
  ctx.restore();
}
function meepleState(t) {
  if (t < 5.75) return null;
  const door = [STOP + 621, TR - 150], mid = [1305, TR + 48], land = [1390, FG - 4];
  let x = door[0], y = door[1], s = 0.78 * back(seg(t, 5.75, 6.15)), sq = 0;
  const h1 = seg(t, 6.4, 6.8), h2 = seg(t, 6.95, 7.4);
  sq += -0.6 * pulse(t, 6.22, 0.18) - 0.6 * pulse(t, 6.8, 0.15);
  if (h1 > 0) { x = lerp(door[0], mid[0], h1); y = lerp(door[1], mid[1], h1) - Math.sin(h1 * Math.PI) * 90; s = lerp(0.78, 0.9, h1); sq += 0.5 * Math.sin(h1 * Math.PI); }
  if (h2 > 0) { x = lerp(mid[0], land[0], h2); y = lerp(mid[1], land[1], h2) - Math.sin(h2 * Math.PI) * 110; s = lerp(0.9, 1.05, h2); sq += 0.5 * Math.sin(h2 * Math.PI); }
  if (t > 7.4) { const a = t - 7.4; sq = -0.9 * pulse(t, 7.4, 0.18) + 0.25 * Math.sin(a * 7) * Math.exp(-a * 0.4); y -= Math.max(0, Math.sin(a * 7)) * 16 * Math.exp(-a * 0.5); }
  const glow = seg(t, 5.8, 6.1) * (1 - 0.5 * seg(t, 6.4, 6.8)) + 0.5 * seg(t, 7.4, 7.8) + 0.4 * seg(t, 8.6, 9.0);
  return { x, y, s, sq, glow: clamp(glow) };
}

// ---------------------------------------------------------------- escenario
function drawBackdrop(t) {
  ctx.fillStyle = PAPER; ctx.fillRect(-4000, -4000, 12000, 12000);
  const clouds = [[260, 170, 1], [880, 120, 0.8], [1500, 200, 1.1], [2100, 140, 0.9]];
  const list = [];
  for (const [cx, cy, s] of clouds) {
    const x = ((cx - t * 14) % 2400 + 2400) % 2400 - 250;
    for (const [dx, dy, r] of [[0, 0, 50], [55, -22, 60], [115, 0, 48], [60, 18, 45]]) list.push({ x: x + dx * s, y: cy + dy * s, r: r * s });
  }
  drawPuffs(list, '#ebe4dc');
  ctx.beginPath(); ctx.moveTo(-200, TR - 60);
  ctx.bezierCurveTo(300, TR - 170, 600, TR - 90, 900, TR - 120); ctx.bezierCurveTo(1200, TR - 150, 1500, TR - 60, 2200, TR - 130);
  ctx.lineTo(2200, TR); ctx.lineTo(-200, TR); ctx.closePath(); ctx.fillStyle = '#f6f0e7'; ctx.fill();
  ctx.fillStyle = '#fbf7f0'; ctx.fillRect(-200, TR, 2400, 600);
  for (let x = -40; x < W + 60; x += 70) { rr(x, TR + 2, 48, 13, 4); fs('#8c837c', 0); }
  line(-200, TR, W + 200, TR, 8);
  for (const [a, b] of [[-200, 380], [420, 1150], [1190, 1700], [1740, 2200]]) line(a, FG + 8, b, FG + 8, 6);
}

function camera(t) {
  const z0 = 1.32, zEnd = 52, e = eio(seg(t, 9.4, 12.35));
  const c0 = [lerp(720, 1000, eio(seg(t, 0.3, 4.6))) + 6 * Math.sin(t * 40) * pulse(t, 4.6, 0.5), 548];
  const z = z0 * Math.exp(Math.log(zEnd / z0) * e);
  const tgt = [600, FG - 250 * 1.15], w = (1 / z0 - 1 / z) / (1 / z0 - 1 / zEnd);
  return { z, cx: lerp(c0[0], tgt[0], w), cy: lerp(c0[1], tgt[1], w) };
}

// ---------------------------------------------------------------- título
const TITLE = [
  { s: 'LA', y: 255, size: 120, col: '#f7efe4' },
  { s: 'HISTORIA', y: 430, size: 205, col: '#f7efe4' },
  { s: 'DETRÁS DEL', y: 615, size: 172, col: '#f7efe4' },
  { s: 'JUEGO', y: 845, size: 255, col: '#ef7d89' },
];
function drawTitle(t) {
  ctx.setTransform(1, 0, 0, 1, 0, 0); LS = 1;
  ctx.fillStyle = '#1c1716'; ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(W / 2, H / 2, 100, W / 2, H / 2, 1000);
  g.addColorStop(0, 'rgba(90,55,45,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // arcos laterales
  const sw = back(seg(t, 12.45, 12.9));
  for (const side of [-1, 1]) for (const [r, k] of [[600, 0], [650, 1]]) {
    ctx.beginPath(); ctx.arc(W / 2, H / 2, r * 1.0 + k * 0, side < 0 ? Math.PI * (1 - 0.12 * sw) : -0.12 * Math.PI * sw, side < 0 ? Math.PI * (1 + 0.12 * sw) : 0.12 * Math.PI * sw);
    ctx.save(); ctx.translate(0, 0); ctx.restore();
    ln(9, 'rgba(247,239,228,0.85)'); if (sw > 0.01) ctx.stroke();
  }
  // rayos
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2 + 0.2, p = back(seg(t, 13.3 + i * 0.03, 13.7 + i * 0.03));
    if (p <= 0) continue;
    const pr = 1 + 0.04 * Math.sin(t * 5 + i);
    const r0 = 560 * pr, r1 = r0 + (36 + rnd(i) * 40) * p;
    const ex = Math.cos(a), ey = Math.sin(a) * 0.62;
    if (Math.abs(ex) < 0.25) continue;
    line(W / 2 + ex * r0, H / 2 + ey * r0, W / 2 + ex * r1, H / 2 + ey * r1, 8, i % 2 ? GOLD : '#f7efe4');
  }
  // letras
  let idx = 0;
  for (const L of TITLE) {
    ctx.font = `700 ${L.size}px Fredoka`;
    const chars = [...L.s], ws = chars.map(c => ctx.measureText(c).width), tot = ws.reduce((a, b) => a + b, 0);
    let x = W / 2 - tot / 2;
    chars.forEach((c, i) => {
      const t0 = 12.6 + idx * 0.05; idx++;
      const p = seg(t, t0, t0 + 0.38), sc = back(p);
      if (c !== ' ' && sc > 0) {
        const cx = x + ws[i] / 2, wob = Math.sin(t * 3 + idx * 0.6) * 5 * seg(t, 14.2, 14.8);
        ctx.save(); ctx.translate(cx, L.y + wob); ctx.scale(sc, sc); ctx.rotate((1 - p) * 0.4 * (idx % 2 ? 1 : -1));
        ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillText(c, 4, 10);
        ctx.fillStyle = L.col; ctx.fillText(c, 0, 0);
        ctx.restore();
      }
      x += ws[i];
    });
  }
  // estrellas
  const stars = [[470, 300, 26], [1450, 270, 22], [400, 640, 18], [1520, 600, 28], [560, 900, 20], [1390, 950, 18], [1640, 420, 14], [300, 470, 13]];
  stars.forEach(([x, y, r], i) => {
    const p = back(seg(t, 13.0 + i * 0.09, 13.4 + i * 0.09)); if (p <= 0) return;
    const tw = 0.75 + 0.25 * Math.sin(t * 6 + i * 1.3);
    star(x, y, r * p * tw, r * 0.45 * p * tw, t * 0.6 + i); fs('#ecc76e', 0);
  });
  // destellos
  for (let i = 0; i < 18; i++) {
    const a = rnd(i * 7) * Math.PI * 2, r = 300 + rnd(i * 3) * 600, ph = (t * 0.7 + rnd(i)) % 1;
    const x = W / 2 + Math.cos(a) * r, y = H / 2 + Math.sin(a) * r * 0.55;
    ctx.globalAlpha = Math.sin(ph * Math.PI) * seg(t, 13.6, 14.2) * 0.8;
    ell(x, y, 3, 3); ctx.fillStyle = '#ffe9a8'; ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- render
function drawScene(t) {
  const cam = camera(t);
  LS = Math.pow(cam.z / 1.32, -0.62);
  ctx.setTransform(cam.z, 0, 0, cam.z, W / 2 - cam.cx * cam.z, H / 2 - cam.cy * cam.z);
  drawBackdrop(t);
  drawTrain(t);
  const pf = puffs(t);
  drawPuffs(pf.lo);
  drawLadder(t);
  const g = girlState(t), m = meepleState(t);
  if (m) drawMeeple(m.x, m.y, m.s, m.sq, t, m.glow);
  drawGirl(g);
  drawPuffs(pf.hi);
  drawNotes(t, g.x);
}

function render(t) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (t < 12.6) drawScene(t);
  const a = seg(t, 12.3, 12.6);
  if (a > 0) { ctx.save(); ctx.globalAlpha = a; drawTitle(t); ctx.restore(); }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const fin = seg(t, 16.7, T_END), ini = 1 - seg(t, 0, 0.35);
  const k = Math.max(fin, ini);
  if (k > 0) { ctx.fillStyle = `rgba(${fin > 0 ? '0,0,0' : '255,253,248'},${k})`; ctx.fillRect(0, 0, W, H); }
}
window.render = render; window.T_END = T_END;
