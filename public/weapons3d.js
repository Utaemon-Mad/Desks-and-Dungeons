// Armas y escudos que se ven en la mano: cada tipo (espada, daga, hacha, maza, mandoble, katana, martillo, lanza,
// arco, ballesta, bastón, varita, escudo, orbe) tiene un modelo distinto para cada nivel (normal, excepcional,
// élite) y 4 variantes por nivel (tabla ITEMDATA.WEAPONS). La rareza cambia los adornos: mágico azul, raro dorado, único todo dorado y brillante, conjunto en
// los colores del conjunto. Convención: empuñadura en el origen y la hoja hacia +y (en unidades del personaje).
(function (root) {
  'use strict';
  const T = () => root.THREE;
  const lin = (hex) => '#' + new (T().Color)(hex).convertSRGBToLinear().getHexString();

  const COL = { steel: '#c3c9d3', dark: '#4a4e58', black: '#22222a', gold: '#dcae3c', bronze: '#a8743a', wood: '#7a4e2a', woodD: '#4a2e18', leather: '#5a3a20', bone: '#e6dcc2', chitin: '#2a2230', white: '#eef0f4' };
  const RAR = { magico: '#4a7aff', raro: '#ffd23a', unico: '#ff9a20', conjunto: '#3ac86a' };

  // ---------- materiales y geometrías en caché ----------
  const mats = new Map(), geos = new Map();
  function mat(kind, color, rarity) {
    const key = [kind, color, rarity || ''].join('|');
    if (mats.has(key)) return mats.get(key);
    const THREE = T();
    let c = new THREE.Color(color), rough = 0.6, metal = 0, emissive = '#000000', ei = 0;
    if (kind === 'metal') { rough = 0.28; metal = 0.9; if (rarity === 'unico') c.lerp(new THREE.Color(COL.gold), 0.45); }
    if (kind === 'trim') { rough = 0.25; metal = 0.85; if (rarity === 'raro' || rarity === 'unico') c = new THREE.Color(COL.gold); }
    if (kind === 'glow') { emissive = color; ei = 1.6; rough = 0.3; }
    if (kind === 'wood') rough = 0.75;
    if (kind === 'leather') rough = 0.8;
    if ((kind === 'metal' || kind === 'trim') && RAR[rarity]) { emissive = RAR[rarity]; ei = rarity === 'unico' ? 0.28 : 0.16; }
    const m = new THREE.MeshStandardMaterial({ color: lin('#' + c.getHexString()), roughness: rough, metalness: metal, emissive: lin(emissive), emissiveIntensity: ei });
    // reflejo de ambiente para que el acero y el oro brillen (VIEW3D.metalEnv)
    const env = (kind === 'metal' || kind === 'trim') && root.VIEW3D && root.VIEW3D.metalEnv ? root.VIEW3D.metalEnv() : null;
    if (env) { m.envMap = env; m.envMapIntensity = 0.8; }
    if (kind === 'metal') { const hsl = {}; c.getHSL(hsl); if (hsl.l < 0.3) { m.metalness = 0.5; m.roughness = 0.45; } } // acero pavonado: que no salga negro
    mats.set(key, m);
    return m;
  }
  const G = (key, fn) => { if (!geos.has(key)) geos.set(key, fn()); return geos.get(key); };
  const cyl = (rt, rb, h, s = 12) => G(`c${rt},${rb},${h},${s}`, () => new (T().CylinderGeometry)(rt, rb, h, s));
  const sph = (r, w = 14, h = 10) => G(`s${r},${w},${h}`, () => new (T().SphereGeometry)(r, w, h));
  const box = (x, y, z) => G(`b${x},${y},${z}`, () => new (T().BoxGeometry)(x, y, z));
  const cone = (r, h, s = 10) => G(`k${r},${h},${s}`, () => new (T().ConeGeometry)(r, h, s));
  const torus = (r, t, arc = Math.PI * 2, ts = 24) => G(`t${r},${t},${arc},${ts}`, () => new (T().TorusGeometry)(r, t, 8, ts, arc));
  const oct = (r) => G('o' + r, () => new (T().OctahedronGeometry)(r));
  const ico = (r) => G('i' + r, () => new (T().IcosahedronGeometry)(r, 0));
  // perfil 2D extruido con bisel (hojas, cabezas de hacha, escudos)
  function extrude(key, pts, depth, bevel = 0.006) {
    return G('e' + key, () => {
      const THREE = T(), s = new THREE.Shape();
      pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
      const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 8 });
      g.translate(0, 0, -depth / 2);
      g.computeVertexNormals();
      return g;
    });
  }
  // hoja simétrica: semiperfil [ancho, alto] desde la base a la punta
  const blade = (key, half, depth) => extrude(key, [...half.map(([w, y]) => [w, y]), ...half.slice().reverse().map(([w, y]) => [-w, y])], depth, 0.004);

  function add(g, geo, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
    const o = new (T().Mesh)(geo, m);
    o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.scale.set(sx, sy, sz);
    o.castShadow = true;
    g.add(o);
    return o;
  }
  // empuñadura con vueltas de cuero y pomo
  function grip(g, len, r, leather, pommel) {
    add(g, cyl(r, r, len), leather, 0, -len / 2 + 0.01);
    for (let i = 0; i < 4; i++) add(g, torus(r + 0.002, 0.003), leather, 0, -len * (i + 0.5) / 4 + 0.01, 0, Math.PI / 2, 0, 0.3);
    if (pommel) add(g, sph(r * 1.7), pommel, 0, -len + 0.005);
  }

  // ---------- escudos ----------
  const circle = (r, n = 40, sy = 1) => [...Array(n)].map((_, i) => { const a = i / n * Math.PI * 2; return [Math.sin(a) * r, Math.cos(a) * r * sy]; });
  const heaterPts = (w, h) => { const p = [[-w, h], [-w * 0.35, h * 1.04], [w * 0.35, h * 1.04], [w, h]]; for (let i = 0; i <= 12; i++) { const t = i / 12; p.push([w * Math.pow(Math.cos(t * Math.PI / 2), 0.75), h * 0.2 - h * 1.2 * Math.sin(t * Math.PI / 2)]); } for (let i = 11; i >= 1; i--) { const t = i / 12; p.push([-w * Math.pow(Math.cos(t * Math.PI / 2), 0.75), h * 0.2 - h * 1.2 * Math.sin(t * Math.PI / 2)]); } return p; };
  const kitePts = (w, h) => { const p = []; for (let i = 0; i <= 12; i++) { const a = -Math.PI / 2 + i / 12 * Math.PI; p.push([Math.sin(a) * w, h - w + Math.cos(a) * w]); } for (let i = 1; i <= 10; i++) { const t = i / 10; p.push([w * (1 - t) * (1 + 0.25 * Math.sin(t * Math.PI)), (h - w) - (2 * h - w) * t]); } for (let i = 9; i >= 1; i--) { const t = i / 10; p.push([-w * (1 - t) * (1 + 0.25 * Math.sin(t * Math.PI)), (h - w) - (2 * h - w) * t]); } return p.map(([x, y]) => [-x, y]); };
  const rectPts = (w, h, taper = 1, round = 0.02) => [[-w, h - round], [-w + round, h], [w - round, h], [w, h - round], [w * taper, -h + round], [w * taper - round, -h], [-w * taper + round, -h], [-w * taper, -h + round]];
  const SHIELD_FORMS = [
    ['redondo', 'rodela', 'cuero', 'broquel', 'adarga', 'tarja'],
    ['heater', 'cometa', 'runico', 'cruzado', 'rodelaAcero', 'justa'],
    ['torre', 'egida', 'alba', 'vacio', 'torreon', 'paves'],
  ];
  const boss = (g, k, m, r, x = 0, y = 0) => { k.add(g, k.sph(r, 18, 12), m, x, y, k.front(x, y), 0, 0, 0, 1, 1, 0.55); k.add(g, k.cyl(r * 1.35, r * 1.4, 0.006, 20), m, x, y, k.front(x, y) - 0.001, Math.PI / 2); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; k.add(g, k.sph(0.006, 8, 6), m, x + Math.cos(a) * r * 1.2, y + Math.sin(a) * r * 1.2, k.front(x, y) + 0.004); } };
  const SHIELDS = {
    // ---- normales ----
    redondo: { pts: () => circle(0.2), bx: 0.6, by: 0.6, colors: ['#8a2a1a', '#d8c8a0'], paint: 'pale', wood: true, rivets: 16, inset: 0.9, deco: (g, k) => boss(g, k, k.steel, 0.05) },
    rodela: { pts: () => circle(0.19), bx: 1.2, by: 1.2, metalFace: true, colors: ['#888', '#888'], paint: 'plain', rivets: 20, inset: 0.92, deco: (g, k) => {
      for (const r of [0.13, 0.08]) k.add(g, k.torus(r, 0.006, Math.PI * 2, 40), k.trim, 0, 0, k.front(r * 0.7, r * 0.7) + 0.003);
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; k.add(g, k.box(0.006, 0.05, 0.004), k.trim, Math.cos(a) * 0.105, Math.sin(a) * 0.105, k.front(0.07, 0.07) + 0.004, 0, 0, a + Math.PI / 2); }
      boss(g, k, k.steel, 0.04); k.add(g, k.cone(0.014, 0.06, 10), k.steel, 0, 0, k.front(0, 0) + 0.045, Math.PI / 2);
    } },
    cuero: { pts: () => circle(0.19), bx: 0.7, by: 0.7, colors: ['#6a4426', '#3a2414'], paint: 'hide', ironRim: false, rim: 0.012, deco: (g, k) => {
      for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2; k.add(g, k.box(0.004, 0.018, 0.006), k.mat('leather', '#2a1a0c'), Math.cos(a) * 0.178, Math.sin(a) * 0.178, k.front(0.13, 0.13) + 0.003, 0, 0, a); }
      for (const a of [0, Math.PI / 2]) k.add(g, k.box(0.006, 0.3, 0.004), k.mat('leather', '#2a1a0c'), 0, 0, k.front(0, 0) + 0.002, 0, 0, a);
      boss(g, k, k.trim, 0.035);
    } },
    broquel: { pts: () => circle(0.13), bx: 1.6, by: 1.6, metalFace: true, colors: ['#888', '#888'], paint: 'plain', rim: 0.011, rivets: 10, inset: 0.82, deco: (g, k) => { k.add(g, k.sph(0.055, 20, 14), k.steel, 0, 0, k.front(0, 0), 0, 0, 0, 1, 1, 0.75); k.add(g, k.torus(0.058, 0.006, Math.PI * 2, 32), k.trim, 0, 0, k.front(0, 0) - 0.002); } },
    adarga: { pts: () => [...Array(48)].map((_, i) => { const a = i / 48 * Math.PI * 2, s = Math.sin(a), c = Math.cos(a); return [s * 0.23, c * 0.2 * (1 - 0.32 * Math.exp(-(s * s) / 0.015))]; }), bx: 0.5, by: 0.9, colors: ['#e8dcc0', '#8a1a1a'], paint: 'arabesque', ironRim: false, rim: 0.01, deco: (g, k) => {
      for (const sx of [-1, 1]) { boss(g, k, k.trim, 0.025, sx * 0.1, 0.01); for (let i = 0; i < 3; i++) k.add(g, k.cone(0.012, 0.06, 6), k.mat('cloth', '#8a1a1a'), sx * (0.05 + i * 0.05), -0.17 + Math.abs(i - 1) * 0.02, k.front(0.1, 0.17), Math.PI); }
    } },
    tarja: { pts: () => circle(0.19), bx: 0.5, by: 0.5, colors: ['#4a2e18', '#2a1a0c'], paint: 'hide', rivets: 0, deco: (g, k) => {
      // tarja escocesa: tachuelas de latón en dibujo de nudos y púa en el centro
      for (const r of [0.06, 0.1, 0.15]) for (let i = 0; i < Math.round(r * 90); i++) { const a = i / Math.round(r * 90) * Math.PI * 2; k.add(g, k.sph(0.0055, 6, 4), k.trim, Math.cos(a) * r, Math.sin(a) * r, k.front(r * 0.7, r * 0.7) + 0.002); }
      for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + Math.PI / 4; k.add(g, k.torus(0.022, 0.004, Math.PI * 2, 16), k.trim, Math.cos(a) * 0.125, Math.sin(a) * 0.125, k.front(0.09, 0.09) + 0.003); }
      boss(g, k, k.trim, 0.03); k.add(g, k.cone(0.01, 0.08, 8), k.steel, 0, 0, k.front(0, 0) + 0.05, Math.PI / 2);
    } },
    // ---- excepcionales ----
    heater: { pts: () => heaterPts(0.18, 0.21), bx: 1.1, colors: ['#24357a', '#d9a93a'], paint: 'chevron', wood: true, rivets: 14, deco: (g, k) => { k.add(g, k.extrude('lionish', [[0, 0.04], [0.03, 0.02], [0.02, -0.03], [0, -0.04], [-0.02, -0.03], [-0.03, 0.02]], 0.006), k.trim, 0, 0.05, k.front(0, 0.05) + 0.003); } },
    cometa: { pts: () => kitePts(0.17, 0.32), bx: 1.2, by: 0.15, colors: ['#e8dcc0', '#8a1a1a'], paint: 'bend', wood: true, rivets: 16, deco: (g, k) => boss(g, k, k.steel, 0.035, 0, 0.12) },
    runico: { pts: () => circle(0.2), bx: 0.7, by: 0.7, colors: ['#2a2420', '#1a1410'], paint: 'plain', wood: true, rivets: 12, inset: 0.9, deco: (g, k) => {
      const gm = k.glow || k.mat('glow', '#4a7aff');
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; k.add(g, k.box(0.008, 0.026, 0.004), gm, Math.cos(a) * 0.135, Math.sin(a) * 0.135, k.front(0.1, 0.1) + 0.003, 0, 0, a + (i % 2 ? 0.4 : -0.4)); }
      k.add(g, k.torus(0.1, 0.004, Math.PI * 2, 40), gm, 0, 0, k.front(0.07, 0.07) + 0.003); boss(g, k, k.steel, 0.045);
    } },
    cruzado: { pts: () => heaterPts(0.18, 0.21), bx: 1.1, colors: ['#eceae4', '#b01a1a'], paint: 'cross', wood: true, goldRim: true, rivets: 14, deco: (g, k) => k.add(g, k.oct(0.025), k.gem, 0, 0.06, k.front(0, 0.06) + 0.012) },
    rodelaAcero: { pts: () => circle(0.2), bx: 1.1, by: 1.1, metalFace: true, goldRim: true, colors: ['#888', '#888'], paint: 'plain', rim: 0.012, rivets: 24, inset: 0.93, deco: (g, k) => {
      // rodela de lujo: anillos dorados, rayos grabados, florones y púa
      for (const r of [0.15, 0.1, 0.06]) k.add(g, k.torus(r, 0.005, Math.PI * 2, 48), k.trim, 0, 0, k.front(r * 0.7, r * 0.7) + 0.003);
      for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; k.add(g, k.box(0.004, 0.04, 0.004), k.trim, Math.cos(a) * 0.125, Math.sin(a) * 0.125, k.front(0.09, 0.09) + 0.004, 0, 0, a + Math.PI / 2); if (i % 2 === 0) k.add(g, k.sph(0.008, 8, 6), k.trim, Math.cos(a) * 0.08, Math.sin(a) * 0.08, k.front(0.06, 0.06) + 0.004); }
      boss(g, k, k.trim, 0.035); k.add(g, k.cone(0.012, 0.07, 10), k.steel, 0, 0, k.front(0, 0) + 0.05, Math.PI / 2);
    } },
    justa: { pts: () => [[-0.17, 0.2], [0.04, 0.22], [0.06, 0.16], [0.13, 0.15], [0.15, 0.21], [0.2, 0.18], [0.17, 0.0], [0.12, -0.16], [0, -0.26], [-0.13, -0.15], [-0.18, 0.02]], bx: 1.4, colors: ['#3a5a2a', '#d9a93a'], paint: 'quarter', wood: true, rivets: 12, deco: (g, k) => { for (const y of [0.08, -0.02, -0.12]) k.add(g, k.box(0.28, 0.008, 0.006), k.steel, -0.01, y, k.front(0, y) + 0.004); } },
    // ---- élite ----
    torre: { pts: () => rectPts(0.16, 0.32, 0.95), bx: 1.6, colors: ['#5a3a20', '#3a2414'], paint: 'planks', wood: true, rim: 0.011, rivets: 22, inset: 0.92, deco: (g, k) => {
      for (const y of [0.22, 0, -0.22]) k.add(g, k.box(0.33, 0.016, 0.006), k.steel, 0, y, k.front(0, y) + 0.004);
      k.add(g, k.box(0.02, 0.6, 0.008), k.steel, 0, 0, k.front(0, 0) + 0.005); boss(g, k, k.steel, 0.04);
    } },
    egida: { pts: () => [[0, 0.3], [0.17, 0.18], [0.17, -0.1], [0, -0.3], [-0.17, -0.1], [-0.17, 0.18]], bx: 1.0, metalFace: true, goldRim: true, colors: ['#888', '#888'], paint: 'plain', rim: 0.011, deco: (g, k) => {
      const gm = k.glow || k.mat('glow', '#7ad0ff');
      for (const [x, y, s] of [[0, 0.02, 1.4], [-0.08, 0.12, 0.8], [0.08, 0.12, 0.8], [-0.08, -0.1, 0.8], [0.08, -0.1, 0.8], [0, 0.2, 0.7], [0, -0.2, 0.7]]) k.add(g, k.oct(0.03), gm, x, y, k.front(x, y) + 0.01, 0, 0, Math.PI / 4, s, s * 1.5, s * 0.6);
    } },
    alba: { pts: () => circle(0.22), bx: 0.8, by: 0.8, colors: ['#f4f0dc', '#e8d8a8'], paint: 'rays', goldRim: true, rim: 0.012, rivets: 16, deco: (g, k) => {
      k.add(g, k.extrude('sun', [...Array(24)].map((_, i) => { const a = i / 24 * Math.PI * 2, r = i % 2 ? 0.06 : 0.12; return [Math.sin(a) * r, Math.cos(a) * r]; }), 0.008), k.trim, 0, 0, k.front(0, 0) + 0.006);
      k.add(g, k.sph(0.04, 16, 12), k.glow || k.mat('glow', '#fff2a0'), 0, 0, k.front(0, 0) + 0.012, 0, 0, 0, 1, 1, 0.5);
    } },
    vacio: { pts: () => { const p = heaterPts(0.18, 0.24); return p.map(([x, y], i) => (i % 3 === 1 ? [x * 1.12, y * 1.08] : [x, y])); }, bx: 1.2, metalFace: true, colors: ['#888', '#888'], paint: 'plain', rivets: 12, deco: (g, k) => {
      for (let i = 0; i < 7; i++) { const a = (i / 6 - 0.5) * 2.4; k.add(g, k.cone(0.012, 0.07, 6), k.steel, Math.sin(a) * 0.17, 0.2 + Math.cos(a) * 0.04, k.front(0.15, 0.2), 0, 0, -a); }
      k.add(g, k.oct(0.035), k.gem, 0, 0.04, k.front(0, 0.04) + 0.015, 0, 0, 0, 1, 1.6, 0.6); k.add(g, k.torus(0.06, 0.006, Math.PI * 2, 24), k.trim, 0, 0.04, k.front(0, 0.04) + 0.004);
    } },
    torreon: { pts: () => { const w = 0.17, h = 0.3, m = [[-w, h - 0.06]]; for (let i = 0; i < 5; i++) { const x0 = -w + i * (2 * w / 5), x1 = x0 + 2 * w / 5; m.push([x0, h], [x0 + (x1 - x0) * 0.55, h], [x0 + (x1 - x0) * 0.55, h - 0.045], [x1, h - 0.045]); } m.push([w, h - 0.06], [w * 0.92, -h + 0.03], [w * 0.92 - 0.03, -h], [-w * 0.92 + 0.03, -h], [-w * 0.92, -h + 0.03]); return m; }, bx: 1.3, colors: ['#8a8478', '#5a554c'], paint: 'stone', rim: 0.01, rivets: 0, deco: (g, k) => {
      // torreón: almenas arriba, puerta en arco con su rastrillo, saeteras y bandas de hierro
      k.add(g, k.extrude('gate', [[-0.05, -0.3], [0.05, -0.3], [0.05, -0.12], [0.035, -0.08], [0, -0.065], [-0.035, -0.08], [-0.05, -0.12]], 0.006), k.mat('wood', '#2a1a10'), 0, 0.02, k.front(0, -0.2) + 0.003);
      for (let i = -2; i <= 2; i++) k.add(g, k.box(0.004, 0.2, 0.004), k.steel, i * 0.018, -0.17, k.front(0, -0.2) + 0.008);
      for (const sx of [-1, 1]) k.add(g, k.box(0.012, 0.05, 0.004), k.mat('cloth', '#0a0808'), sx * 0.08, 0.1, k.front(0.08, 0.1) + 0.004);
      for (const y of [0.17, -0.06]) k.add(g, k.box(0.32, 0.012, 0.006), k.steel, 0, y, k.front(0, y) + 0.005);
      k.add(g, k.oct(0.02), k.gem, 0, 0.2, k.front(0, 0.2) + 0.012);
    } },
    paves: { pts: () => [[-0.17, 0.3], [-0.06, 0.34], [0.06, 0.34], [0.17, 0.3], [0.15, -0.3], [0.12, -0.34], [-0.12, -0.34], [-0.15, -0.3]], bx: 2.2, colors: ['#8a1a1a', '#eceae4'], paint: 'quarter', wood: true, rim: 0.011, rivets: 20, inset: 0.92, deco: (g, k) => {
      // pavés: canal central en relieve, escudo de armas pintado y argollas
      k.add(g, k.box(0.05, 0.62, 0.02), k.faceM, 0, 0, k.front(0, 0) + 0.004);
      k.add(g, k.box(0.012, 0.62, 0.012), k.steel, 0, 0, k.front(0, 0) + 0.016);
      k.add(g, k.extrude('pavesArms', [[-0.06, 0.07], [0.06, 0.07], [0.06, 0.0], [0, -0.07], [-0.06, 0.0]], 0.006), k.trim, 0, 0.12, k.front(0, 0.12) + 0.018);
      for (const sx of [-1, 1]) k.add(g, k.torus(0.015, 0.004, Math.PI * 2, 12), k.steel, sx * 0.1, 0.25, k.front(0.1, 0.25) + 0.004);
    } },
  };
  // cara del escudo: perfil extruido, con la cara partida en triángulos pequeños (si no, no se puede curvar), curvado
  // (bx a lo ancho, by a lo alto) y con la textura en proyección plana
  function shieldGeo(key, pts, depth, bx, by) {
    return G('shield' + key, () => {
      const THREE = T(), s = new THREE.Shape();
      pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
      const ex = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2, curveSegments: 8, steps: 1 }).toNonIndexed();
      ex.translate(0, 0, -depth / 2);
      const src = ex.attributes.position.array, out = [];
      const MAX = 0.03 * 0.03;
      const split = (a, b, c) => {
        const d = (p, q) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2;
        const ab = d(a, b), bc = d(b, c), ca = d(c, a), m = Math.max(ab, bc, ca);
        if (m < MAX) { out.push(...a, ...b, ...c); return; }
        const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];
        if (m === ab) { const k = mid(a, b); split(a, k, c); split(k, b, c); } else if (m === bc) { const k = mid(b, c); split(a, b, k); split(a, k, c); } else { const k = mid(c, a); split(a, b, k); split(k, b, c); }
      };
      for (let i = 0; i < src.length; i += 9) {
        const a = [src[i], src[i + 1], src[i + 2]], b = [src[i + 3], src[i + 4], src[i + 5]], c = [src[i + 6], src[i + 7], src[i + 8]];
        const flat = Math.abs(a[2] - b[2]) < 1e-5 && Math.abs(b[2] - c[2]) < 1e-5; // cara de delante o de detrás
        if (flat) split(a, b, c); else out.push(...a, ...b, ...c);
      }
      let g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
      g.computeBoundingBox();
      const bb = g.boundingBox, P = g.attributes.position, uv = [];
      for (let i = 0; i < P.count; i++) {
        const x = P.getX(i), y = P.getY(i);
        P.setZ(i, P.getZ(i) - bx * x * x - by * y * y);
        uv.push((x - bb.min.x) / (bb.max.x - bb.min.x), (y - bb.min.y) / (bb.max.y - bb.min.y));
      }
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      const BU = THREE.BufferGeometryUtils;
      if (BU && BU.toCreasedNormals) g = BU.toCreasedNormals(g, 0.7); else g.computeVertexNormals();
      return g;
    });
  }
  // borde de metal: un tubo por el contorno, pegado a la cara
  function shieldRim(key, pts, r, front) {
    return G('srim' + key + r, () => {
      const THREE = T(), v = pts.map(([x, y]) => new THREE.Vector3(x * 1.01, y * 1.01, front(x, y) - 0.01));
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(v, true, 'catmullrom', 0.1), pts.length * 4, r, 6, true);
    });
  }
  // textura de la cara: tablas, cuero, piedra o metal, con pintura heráldica y desgaste
  const faceCache = new Map();
  function shieldFace(key, paint, c1, c2, woodBase) {
    if (faceCache.has(key)) return faceCache.get(key);
    const THREE = T(), W = 256, c = document.createElement('canvas'); c.width = c.height = W;
    const g = c.getContext('2d');
    const rnd = (() => { let s = 7; for (const ch of key) s = (s * 31 + ch.charCodeAt(0)) % 9973; return () => (s = (s * 9301 + 49297) % 233280) / 233280; })();
    // base
    if (woodBase || paint === 'planks') {
      for (let i = 0; i < 6; i++) { const v = 0.85 + rnd() * 0.25; g.fillStyle = `rgb(${122 * v | 0},${80 * v | 0},${44 * v | 0})`; g.fillRect(i * W / 6, 0, W / 6, W); }
      g.strokeStyle = 'rgba(40,20,8,0.35)'; for (let i = 0; i < 70; i++) { const x = rnd() * W; g.lineWidth = 0.6 + rnd(); g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + rnd() * 8 - 4, W / 3, x + rnd() * 8 - 4, W * 2 / 3, x + rnd() * 6 - 3, W); g.stroke(); }
      g.fillStyle = 'rgba(20,10,4,0.6)'; for (let i = 1; i < 6; i++) g.fillRect(i * W / 6 - 1, 0, 2, W);
    } else if (paint === 'hide') {
      g.fillStyle = c1; g.fillRect(0, 0, W, W);
      for (let i = 0; i < 1400; i++) { const v = rnd(); g.fillStyle = `rgba(${v > 0.5 ? '255,230,200' : '20,10,0'},0.06)`; g.fillRect(rnd() * W, rnd() * W, 2 + rnd() * 4, 1 + rnd() * 3); }
    } else if (paint === 'stone') {
      g.fillStyle = c2; g.fillRect(0, 0, W, W);
      for (let r = 0; r < 8; r++) for (let q = 0; q < 5; q++) { const v = 0.85 + rnd() * 0.3, base = new THREE.Color(c1); g.fillStyle = `rgb(${base.r * 255 * v | 0},${base.g * 255 * v | 0},${base.b * 255 * v | 0})`; g.fillRect(q * W / 5 + (r % 2) * W / 10 + 2, r * W / 8 + 2, W / 5 - 4, W / 8 - 4); }
    } else { g.fillStyle = c1; g.fillRect(0, 0, W, W); }
    // pintura heráldica (sobre la madera queda algo gastada)
    g.globalAlpha = woodBase ? 0.82 : 1;
    if (paint === 'pale') { g.fillStyle = c1; g.fillRect(0, 0, W / 2, W); g.fillStyle = c2; g.fillRect(W / 2, 0, W / 2, W); }
    if (paint === 'chevron') { g.fillStyle = c1; g.fillRect(0, 0, W, W); g.fillStyle = c2; g.beginPath(); g.moveTo(0, W * 0.75); g.lineTo(W / 2, W * 0.35); g.lineTo(W, W * 0.75); g.lineTo(W, W * 0.92); g.lineTo(W / 2, W * 0.52); g.lineTo(0, W * 0.92); g.fill(); }
    if (paint === 'bend') { g.fillStyle = c1; g.fillRect(0, 0, W, W); g.fillStyle = c2; g.beginPath(); g.moveTo(0, W * 0.15); g.lineTo(W * 0.15, 0); g.lineTo(W, W * 0.85); g.lineTo(W * 0.85, W); g.fill(); }
    if (paint === 'cross') { g.fillStyle = c1; g.fillRect(0, 0, W, W); g.fillStyle = c2; g.fillRect(W * 0.42, W * 0.05, W * 0.16, W * 0.9); g.fillRect(W * 0.12, W * 0.55, W * 0.76, W * 0.16); }
    if (paint === 'quarter') { g.fillStyle = c1; g.fillRect(0, 0, W, W); g.fillStyle = c2; g.fillRect(W / 2, 0, W / 2, W / 2); g.fillRect(0, W / 2, W / 2, W / 2); }
    if (paint === 'rays') { g.fillStyle = c1; g.fillRect(0, 0, W, W); g.fillStyle = c2; for (let i = 0; i < 16; i += 2) { const a0 = i / 16 * Math.PI * 2, a1 = (i + 1) / 16 * Math.PI * 2; g.beginPath(); g.moveTo(W / 2, W / 2); g.lineTo(W / 2 + Math.cos(a0) * W, W / 2 + Math.sin(a0) * W); g.lineTo(W / 2 + Math.cos(a1) * W, W / 2 + Math.sin(a1) * W); g.fill(); } }
    if (paint === 'arabesque') { g.fillStyle = c1; g.fillRect(0, 0, W, W); g.strokeStyle = c2; g.lineWidth = 5; for (const [cx, cy, r] of [[W * 0.3, W / 2, 50], [W * 0.7, W / 2, 50], [W / 2, W / 2, 24]]) { g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke(); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; g.beginPath(); g.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 9, 0, Math.PI * 2); g.stroke(); } } }
    g.globalAlpha = 1;
    // desgaste: arañazos y bordes oscurecidos
    g.strokeStyle = 'rgba(255,240,220,0.18)'; for (let i = 0; i < 18; i++) { g.lineWidth = 1; g.beginPath(); const x = rnd() * W, y = rnd() * W; g.moveTo(x, y); g.lineTo(x + rnd() * 30 - 15, y + rnd() * 30 - 15); g.stroke(); }
    const vg = g.createRadialGradient(W / 2, W / 2, W * 0.25, W / 2, W / 2, W * 0.72); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.45)'); g.fillStyle = vg; g.fillRect(0, 0, W, W);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    const m = new THREE.MeshStandardMaterial({ map: t, roughness: paint === 'stone' ? 0.9 : woodBase ? 0.75 : 0.65 });
    m.userData.keep = true; t.userData.keep = true;
    faceCache.set(key, m);
    return m;
  }

  // ======================================================================
  function build(base, tier = 0, rarity, o = {}) {
    const THREE = T();
    const g = new THREE.Group();
    // aspecto de la variante (tabla compartida public/rules/items-data.js): modelo, metal, adornos, gema y brillo
    const tier0 = Math.max(0, Math.min(2, tier || 0));
    const vs = root.ITEMDATA && root.ITEMDATA.WEAPONS[base] ? root.ITEMDATA.WEAPONS[base][tier0] : null;
    const L = o.look || (vs ? vs[Math.min(vs.length - 1, Math.max(0, o.sk | 0))][2] : {}) || {};
    const t = L.m !== undefined ? L.m : tier0;
    const accent = o.setColor && rarity === 'conjunto' ? o.setColor : null;
    const steel = mat('metal', L.metal || (t === 2 && base !== 'espada' ? COL.dark : COL.steel), rarity);
    const steelL = mat('metal', L.metal || COL.steel, rarity);
    const trim = mat('trim', accent || L.trim || (t ? COL.gold : COL.bronze), rarity);
    const wood = mat('wood', t === 2 ? COL.woodD : COL.wood), leather = mat('leather', COL.leather), bone = mat('bone', COL.bone);
    const glowC = RAR[rarity] || L.glow || (t === 2 ? '#7ad0ff' : null);
    const glow = glowC ? mat('glow', glowC) : null;
    const gem = mat('glow', RAR[rarity] || L.gem || (t === 2 ? '#d8102a' : '#4a7aff'));
    switch (base) {
      case 'espada': {
        if (t === 0) { add(g, blade('sw0', [[0.024, 0.06], [0.022, 0.36], [0, 0.44]], 0.008), steelL); add(g, box(0.13, 0.022, 0.035), trim, 0, 0.055); grip(g, 0.09, 0.014, leather, trim); }
        if (t === 1) { add(g, blade('sw1', [[0.03, 0.06], [0.026, 0.44], [0, 0.54]], 0.009), steelL); add(g, box(0.008, 0.38, 0.012), mat('metal', COL.dark), 0, 0.27); add(g, torus(0.075, 0.012, Math.PI), trim, 0, 0.09, 0, 0, 0, Math.PI); add(g, sph(0.018), gem, 0, 0.06, 0); grip(g, 0.11, 0.015, leather, trim); }
        if (t === 2) { add(g, blade('sw2', [[0.034, 0.07], [0.04, 0.3], [0.03, 0.5], [0, 0.62]], 0.008), mat('glow', glowC || '#7ad0ff')); add(g, extrude('swg2', [[0, 0], [0.11, 0.05], [0.13, 0.1], [0.06, 0.06], [0, 0.08], [-0.06, 0.06], [-0.13, 0.1], [-0.11, 0.05]], 0.03), trim, 0, 0.02); add(g, oct(0.025), gem, 0, 0.07, 0.02); grip(g, 0.12, 0.016, mat('leather', COL.black), trim); }
        break;
      }
      case 'daga': {
        if (t === 0) { add(g, blade('dg0', [[0.022, 0.04], [0.016, 0.16], [0, 0.22]], 0.007), steelL); add(g, box(0.08, 0.018, 0.03), trim, 0, 0.035); grip(g, 0.07, 0.012, leather, trim); }
        if (t === 1) { add(g, blade('dg1', [[0.012, 0.04], [0.008, 0.2], [0, 0.27]], 0.009), steelL); add(g, torus(0.03, 0.006), trim, 0, 0.035, 0, Math.PI / 2); grip(g, 0.075, 0.011, mat('leather', COL.black), trim); }
        if (t === 2) { add(g, extrude('dg2', [[0.02, 0.03], [0.026, 0.08], [0.015, 0.1], [0.024, 0.14], [0.01, 0.18], [0.016, 0.2], [0, 0.27], [-0.02, 0.2], [-0.022, 0.08]], 0.012), bone); add(g, box(0.07, 0.02, 0.03), mat('leather', '#3a1a10'), 0, 0.03); grip(g, 0.08, 0.013, leather, bone); for (let i = 0; i < 3; i++) add(g, cone(0.006, 0.025, 5), bone, 0.03, -0.02 - i * 0.02, 0, 0, 0, -Math.PI / 2); }
        break;
      }
      case 'hacha': {
        const haft = t === 2 ? mat('wood', '#8a5a2a') : wood;
        add(g, cyl(0.016, 0.019, 0.5), haft, 0, 0.17);
        if (t === 0) add(g, extrude('ax0', [[0, 0.35], [0.1, 0.31], [0.13, 0.4], [0.1, 0.48], [0, 0.43]], 0.02), steelL);
        if (t === 1) { add(g, extrude('ax1', [[0, 0.33], [0.08, 0.3], [0.16, 0.25], [0.18, 0.4], [0.15, 0.5], [0.06, 0.46], [0, 0.45]], 0.024), steelL); add(g, cone(0.02, 0.09, 6), steelL, -0.05, 0.4, 0, 0, 0, Math.PI / 2); for (const y of [0.1, 0.25]) add(g, torus(0.021, 0.005), trim, 0, y, 0, Math.PI / 2); }
        if (t === 2) { add(g, extrude('ax2', [[0, 0.36], [0.09, 0.33], [0.12, 0.4], [0.09, 0.47], [0, 0.44]], 0.016), steel); add(g, cone(0.016, 0.12, 6), steel, -0.07, 0.4, 0, 0, 0, Math.PI / 2); for (let i = 0; i < 3; i++) add(g, extrude('feather', [[0, 0], [0.02, -0.03], [0.012, -0.09], [0, -0.1], [-0.008, -0.05]], 0.003), mat('leather', i % 2 ? '#c83a2a' : '#f0e8d8'), 0.02, 0.34 - i * 0.02, 0.01 * i, 0, 0, -0.3 - i * 0.2); add(g, sph(0.012), mat('glow', '#2ac8c8'), 0, 0.3, 0.02); }
        add(g, cyl(0.022, 0.022, 0.05), trim, 0, 0.4);
        break;
      }
      case 'maza': {
        add(g, cyl(0.016, 0.019, 0.42), t ? mat('metal', COL.dark) : wood, 0, 0.14);
        grip(g, 0.08, 0.02, leather, null);
        if (t === 0) { add(g, sph(0.06, 16, 12), steelL, 0, 0.38); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; add(g, sph(0.014), trim, Math.cos(a) * 0.06, 0.38, Math.sin(a) * 0.06); } }
        if (t === 1) { add(g, cyl(0.03, 0.03, 0.14), steelL, 0, 0.38); for (let i = 0; i < 6; i++) add(g, extrude('flange', [[0, -0.07], [0.06, -0.04], [0.06, 0.04], [0, 0.07]], 0.008), steelL, 0, 0.38, 0, 0, i / 6 * Math.PI, 0); add(g, cone(0.03, 0.05, 6), trim, 0, 0.47); }
        if (t === 2) { add(g, ico(0.075), steel, 0, 0.39); for (let i = 0; i < 12; i++) { const v = new THREE.Vector3().setFromSphericalCoords(1, Math.acos(1 - 2 * (i + 0.5) / 12), i * 2.4); const c = add(g, cone(0.016, 0.07, 6), steelL, v.x * 0.08, 0.39 + v.y * 0.08, v.z * 0.08); c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v); } add(g, torus(0.03, 0.008), trim, 0, 0.31, 0, Math.PI / 2); if (glow) add(g, sph(0.02), glow, 0, 0.48); }
        break;
      }
      case 'espadon': {
        if (t === 0) { add(g, blade('gs0', [[0.034, 0.08], [0.03, 0.64], [0, 0.76]], 0.01), steelL); add(g, box(0.24, 0.026, 0.045), trim, 0, 0.07); grip(g, 0.2, 0.017, leather, trim); }
        if (t === 1) { const half = []; for (let i = 0; i <= 10; i++) { const y = 0.08 + i * 0.07; half.push([0.032 + 0.008 * Math.sin(i * 1.6), y]); } half.push([0, 0.9]); add(g, blade('gs1', half, 0.01), steelL); add(g, box(0.28, 0.024, 0.04), trim, 0, 0.07); for (const sx of [-1, 1]) add(g, cone(0.012, 0.05, 6), trim, sx * 0.035, 0.15, 0, 0, 0, sx * 1.2); grip(g, 0.22, 0.017, mat('leather', COL.black), trim); }
        if (t === 2) { add(g, blade('gs2', [[0.05, 0.09], [0.055, 0.5], [0.04, 0.78], [0, 0.92]], 0.012), steelL); add(g, box(0.012, 0.6, 0.016), trim, 0, 0.42); add(g, extrude('gsg2', [[0, 0], [0.16, 0.06], [0.2, 0.13], [0.08, 0.08], [0, 0.1], [-0.08, 0.08], [-0.2, 0.13], [-0.16, 0.06]], 0.035), trim, 0, 0.02); add(g, oct(0.03), gem, 0, 0.08, 0.025); grip(g, 0.24, 0.018, mat('leather', COL.black), trim); }
        break;
      }
      case 'katana': {
        // hoja curva de un solo filo (con su línea de temple), tsuba redonda y empuñadura larga con el trenzado en rombos
        const len = t === 2 ? 0.86 : t === 1 ? 0.74 : 0.66, sori = t === 2 ? 0.05 : 0.04, w = 0.026;
        const pts = [], spine = [];
        for (let i = 0; i <= 10; i++) { const y = 0.07 + (len - 0.07) * i / 10, c = sori * (i / 10) ** 2; pts.push([c + w / 2, y]); spine.push([c - w / 2, y]); }
        const tip = pts[10];
        pts[10] = [tip[0] - w * 0.15, tip[1] - 0.01];
        const outline = [...pts, [sori - w * 0.4, len + 0.04], ...spine.reverse()];
        add(g, extrude('kt' + t, outline, 0.006, 0.003), steelL);
        // línea de temple (hamon): brilla en las buenas
        const ham = []; for (let i = 0; i <= 9; i++) { const y = 0.08 + (len - 0.12) * i / 9, c = sori * (i / 10) ** 2; ham.push([c + w * 0.18 + 0.003 * Math.sin(i * 2.1), y]); }
        add(g, extrude('kth' + t, [...ham, ...ham.slice().reverse().map(([x, y]) => [x + 0.004, y])], 0.0075, 0.001), glow || mat('metal', '#f4f6fa'));
        add(g, cyl(0.016, 0.016, 0.03, 8), trim, 0, 0.055);
        add(g, cyl(t === 2 ? 0.05 : 0.042, t === 2 ? 0.05 : 0.042, 0.012, t === 1 ? 6 : 16), t === 2 ? trim : mat('metal', COL.black), 0, 0.035);
        const wrap = mat('leather', L.wrap || (t === 2 ? '#8a1a1a' : COL.black)), ray = mat('bone', '#efe8da');
        const glen = t === 2 ? 0.26 : 0.22;
        add(g, box(0.03, glen, 0.022), ray, 0, 0.02 - glen / 2);
        for (let i = 0; i < 7; i++) { const y = 0.01 - (i + 0.5) * glen / 7; for (const s of [-1, 1]) add(g, box(0.034, 0.012, 0.025), wrap, 0, y, 0, 0, 0, s * 0.6); }
        add(g, box(0.034, 0.02, 0.026), trim, 0, 0.01 - glen);
        if (gem && t === 2) add(g, oct(0.012), gem, 0, 0.035, 0.05);
        break;
      }
      case 'martillo': {
        add(g, cyl(0.018, 0.021, 0.66), t === 2 ? mat('metal', COL.dark) : wood, 0, 0.22);
        grip(g, 0.12, 0.022, leather, null);
        if (t === 0) { add(g, box(0.2, 0.11, 0.11), steelL, 0, 0.52); add(g, box(0.04, 0.12, 0.12), trim, 0, 0.52); }
        if (t === 1) { add(g, box(0.13, 0.11, 0.11), steelL, 0.03, 0.52); add(g, cone(0.04, 0.14, 4), steelL, -0.1, 0.52, 0, 0, Math.PI / 4, Math.PI / 2); add(g, cone(0.025, 0.1, 4), steelL, 0, 0.62); add(g, box(0.135, 0.02, 0.115), trim, 0.03, 0.57); }
        if (t === 2) { add(g, box(0.3, 0.16, 0.16), steel, 0, 0.55); for (const sx of [-1, 1]) add(g, box(0.03, 0.18, 0.18), trim, sx * 0.15, 0.55); if (glow) for (const sx of [-1, 1]) add(g, box(0.004, 0.08, 0.08), glow, sx * 0.168, 0.55); add(g, cone(0.03, 0.08, 6), trim, 0, 0.67); }
        break;
      }
      case 'lanza': {
        add(g, cyl(0.016, 0.018, 1.05), t === 2 ? mat('wood', '#e8dcc0') : wood, 0, 0.33);
        if (t === 0) add(g, blade('sp0', [[0.012, 0.86], [0.035, 0.92], [0, 1.04]], 0.008), steelL);
        if (t === 1) { add(g, blade('sp1', [[0.012, 0.86], [0.04, 0.93], [0.03, 0.98], [0, 1.1]], 0.009), steelL); for (const sx of [-1, 1]) add(g, cone(0.01, 0.06, 5), steelL, sx * 0.035, 0.85, 0, 0, 0, sx * 1.4); add(g, box(0.004, 0.16, 0.08), mat('leather', '#b02a2a'), 0, 0.74, 0.045); }
        if (t === 2) { add(g, blade('sp2', [[0.014, 0.86], [0.05, 0.95], [0.03, 1.02], [0, 1.18]], 0.008), trim); for (const sx of [-1, 1]) add(g, blade('sp2s', [[0.008, 0], [0.012, 0.05], [0, 0.12]], 0.006), trim, sx * 0.06, 0.88, 0, 0, 0, -sx * 0.35); add(g, oct(0.02), gem, 0, 0.9, 0.01); if (glow) add(g, blade('sp2c', [[0.006, 0.9], [0.014, 0.96], [0, 1.08]], 0.004), glow, 0, 0, 0.006); }
        add(g, cyl(0.024, 0.02, 0.04), trim, 0, 0.84);
        break;
      }
      case 'arco': {
        const limb = t === 2 ? mat('wood', COL.chitin) : wood;
        const arc = add(g, torus(0.34, t === 1 ? 0.016 : 0.014, Math.PI * (t ? 0.95 : 0.85), 20), limb, 0, 0.18, 0, 0, Math.PI / 2, Math.PI / 2 - Math.PI * (t ? 0.475 : 0.425));
        void arc;
        add(g, cyl(0.003, 0.003, 0.64, 4), t === 2 ? mat('glow', '#b06aff') : mat('leather', '#e8e0d0'), 0, 0.18, -0.08);
        add(g, cyl(0.02, 0.02, 0.09), leather, 0, 0.18, 0.33, Math.PI / 2);
        if (t >= 1) for (const sy of [-1, 1]) add(g, cone(0.012, 0.07, 5), t === 2 ? mat('bone', COL.bone) : steelL, 0, 0.18 + sy * 0.3, 0.13, sy > 0 ? 0.5 : Math.PI - 0.5);
        if (t === 2) for (let i = -2; i <= 2; i++) if (i) add(g, cone(0.008, 0.04, 4), mat('bone', COL.bone), 0, 0.18 + i * 0.1, 0.36, Math.PI / 2);
        if (glow && t !== 2) add(g, sph(0.018), glow, 0, 0.18, 0.36);
        break;
      }
      case 'ballesta': {
        // culata con empuñadura de pistola (perfil extruido), pala curva delante, cuerda tensa, virote en su canal,
        // estribo y herrajes. Construida hacia +z (la boca) con la mano en el origen.
        const stockM = t === 2 ? mat('wood', '#3a2418') : wood;
        const stock = extrude('xb-stock', [[-0.2, 0.02], [-0.2, 0.092], [-0.06, 0.086], [0.06, 0.08], [0.4, 0.076], [0.4, 0.046], [0.06, 0.046], [0.035, 0.04], [0.022, -0.065], [-0.03, -0.065], [-0.022, 0.035], [-0.09, 0.036]], 0.032, 0.004);
        add(g, stock, stockM, 0, 0, 0, 0, -Math.PI / 2, 0);
        add(g, box(0.008, 0.006, 0.3), mat('wood', COL.woodD), 0, 0.079, 0.22);
        // pala: arco de toro tumbado, con la panza hacia delante
        const seg = (a, b, r, m) => { const d = new THREE.Vector3().subVectors(b, a), o = add(g, cyl(r, r, 1, 5), m, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2); o.scale.y = d.length(); o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); return o; };
        const prodM = t === 0 ? mat('wood', '#6a4424') : steelL, strM = mat('leather', '#e8e0cc');
        const prod = (z, r, arc, y) => {
          add(g, torus(r, t === 0 ? 0.014 : 0.011, arc, 18), prodM, 0, y, z - r, Math.PI / 2, 0, Math.PI / 2 - arc / 2);
          const tx = r * Math.sin(arc / 2), tz = z - r + r * Math.cos(arc / 2);
          for (const sx of [-1, 1]) { add(g, sph(0.012, 8, 6), trim, sx * tx, y, tz); seg(new THREE.Vector3(sx * tx, y, tz), new THREE.Vector3(0, y + 0.004, 0.13), 0.0025, strM); }
        };
        prod(0.37, t === 2 ? 0.26 : 0.3, t === 2 ? 1.25 : 1.35, 0.062);
        if (t === 2) prod(0.31, 0.24, 1.3, 0.062);
        // herrajes y estribo
        for (const z of [0.36, 0.25, -0.15]) add(g, box(0.04, 0.05, 0.016), t ? trim : mat('metal', COL.dark), 0, 0.062, z);
        add(g, torus(0.045, 0.007, Math.PI, 12), mat('metal', COL.dark), 0, 0.06, 0.41, 0, Math.PI / 2, 0);
        add(g, box(0.008, 0.03, 0.012), mat('metal', COL.dark), 0, 0.03, 0.045, 0.4, 0, 0);
        // virote: asta, punta y plumas
        add(g, cyl(0.004, 0.004, 0.27, 5), mat('wood', '#c8a878'), 0, 0.086, 0.27, Math.PI / 2);
        add(g, cone(0.01, 0.035, 4), glow || steelL, 0, 0.086, 0.42, Math.PI / 2);
        for (const sx of [-1, 1]) add(g, box(0.001, 0.014, 0.03), mat('leather', t === 2 ? '#c83a2a' : '#e8e4da'), sx * 0.006, 0.09, 0.15, 0, 0, sx * 0.5);
        // excepcional: cranequín de manivela atrás; élite: gema en la culata
        if (t >= 1) { add(g, cyl(0.016, 0.016, 0.06, 10), trim, 0.035, 0.07, -0.13, 0, 0, Math.PI / 2); add(g, box(0.008, 0.06, 0.008), mat('metal', COL.dark), 0.068, 0.045, -0.13); add(g, cyl(0.007, 0.007, 0.03, 6), leather, 0.08, 0.018, -0.13, 0, 0, Math.PI / 2); }
        if (t === 2) add(g, oct(0.016), gem, 0.018, 0.06, -0.05);
        break;
      }
      case 'baston': {
        if (t === 0) { add(g, cyl(0.02, 0.026, 0.98), wood, 0, 0.3); add(g, sph(0.04, 12, 8), wood, 0, 0.8); add(g, sph(0.028), mat('glow', glowC || '#7ad0ff'), 0, 0.84, 0.02); }
        if (t === 1) { add(g, cyl(0.02, 0.024, 0.98), wood, 0, 0.3); for (const y of [0.0, 0.45, 0.75]) add(g, torus(0.024, 0.006), trim, 0, y, 0, Math.PI / 2); for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; add(g, cone(0.008, 0.12, 5), trim, Math.cos(a) * 0.035, 0.84, Math.sin(a) * 0.035, Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3); } add(g, oct(0.045), mat('glow', glowC || '#7ad0ff'), 0, 0.88); }
        if (t === 2) {
          for (let i = 0; i < 2; i++) { const pts = []; for (let k = 0; k <= 12; k++) { const y = -0.18 + k * 0.08, a = k * 0.9 + i * Math.PI; pts.push(new THREE.Vector3(Math.cos(a) * 0.012, y, Math.sin(a) * 0.012)); } add(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.014, 6), mat('wood', i ? COL.woodD : '#5a3a6a')); }
          add(g, torus(0.075, 0.008, Math.PI * 2, 32), trim, 0, 0.95, 0, 0, 0, 0); add(g, torus(0.075, 0.006, Math.PI * 2, 32), trim, 0, 0.95, 0, 0, Math.PI / 2, 0);
          add(g, sph(0.05, 18, 14), mat('glow', glowC || '#b06aff'), 0, 0.95); for (let i = 0; i < 3; i++) add(g, cone(0.01, 0.1, 5), trim, 0, 0.82 + i * 0.01, 0, 0, i * 2.1, 0.5);
        }
        break;
      }
      case 'varita': {
        if (t === 0) { add(g, cyl(0.01, 0.015, 0.3), mat('wood', '#5a3a24'), 0, 0.12); add(g, sph(0.025), mat('glow', glowC || '#c080ff'), 0, 0.29); }
        if (t === 1) { add(g, cyl(0.011, 0.016, 0.3), mat('wood', '#2a1a14'), 0, 0.12); for (let i = 0; i < 4; i++) add(g, sph(0.006), mat('glow', '#ff6a1a'), 0.012 * Math.cos(i * 2), 0.05 + i * 0.06, 0.012 * Math.sin(i * 2)); add(g, cone(0.02, 0.06, 6), mat('glow', '#ff6a1a'), 0, 0.3); }
        if (t === 2) { add(g, cyl(0.009, 0.014, 0.32), mat('bone', COL.white), 0, 0.13); const pts = []; for (let k = 0; k <= 16; k++) pts.push(new THREE.Vector3(Math.cos(k * 1.2) * 0.015, -0.02 + k * 0.018, Math.sin(k * 1.2) * 0.015)); add(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.003, 4), trim); add(g, extrude('star', [...Array(10)].map((_, i) => { const a = i / 10 * Math.PI * 2, r = i % 2 ? 0.018 : 0.045; return [Math.sin(a) * r, Math.cos(a) * r]; }), 0.01), mat('glow', glowC || '#fff27a'), 0, 0.33); }
        break;
      }
      case 'escudo': {
        // una forma por variante (L.f o, si no, por su posición en la tabla): rodelas, broqueles, adargas, tarjas,
        // escudos de cometa, de torre, de torreón, paveses… La cara se curva, lleva tablas, cuero o pintura heráldica,
        // y el borde y los remaches son de metal.
        const F = L.f || SHIELD_FORMS[tier0][Math.max(0, o.sk | 0)] || SHIELD_FORMS[tier0][0];
        const holy = o.set === 'paladin' || o.set === 'sacerdote';
        const S = SHIELDS[F] || SHIELDS.redondo;
        const [c1, c2] = holy ? ['#e8e0c8', '#c8a83a'] : S.colors;
        const faceM = shieldFace(F + (holy ? '-h' : ''), S.paint, c1, c2, S.wood);
        const geo = shieldGeo(F, S.pts(), S.depth || 0.03, S.bx || 0, S.by || 0);
        const front = (x, y) => (S.depth || 0.03) / 2 - (S.bx || 0) * x * x - (S.by || 0) * y * y;
        const edgeM = S.goldRim ? trim : S.ironRim === false ? leather : steelL;
        add(g, geo, S.metalFace ? steelL : faceM);
        add(g, shieldRim(F, S.pts(), S.rim || 0.009, front), edgeM);
        // remaches por dentro del borde
        if (S.rivets) { const P = S.pts(), n = S.rivets, inset = S.inset || 0.88; for (let k = 0; k < n; k++) { const [x, y] = P[Math.floor(k / n * P.length)]; add(g, sph(0.007, 8, 6), S.goldRim ? trim : steelL, x * inset, y * inset, front(x * inset, y * inset) + 0.002); } }
        S.deco(g, { add, front, steel: steelL, trim, gem, glow, glowC, leather, wood, mat, sph, box, cyl, cone, torus, oct, extrude, faceM });
        add(g, box(0.04, 0.1, 0.04), leather, 0, 0, -0.04);
        break;
      }
      case 'orbe': {
        const c = glowC || ['#4a7aff', '#ffd27a', '#b06aff'][t];
        if (t === 0) { add(g, sph(0.07, 20, 16), mat('glow', c), 0, 0.1); for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; add(g, cone(0.01, 0.1, 5), trim, Math.cos(a) * 0.05, 0.04, Math.sin(a) * 0.05, -Math.sin(a) * 0.5, 0, Math.cos(a) * 0.5); } add(g, cyl(0.02, 0.03, 0.05), trim, 0, 0); }
        if (t === 1) { add(g, sph(0.075, 20, 16), mat('glow', c), 0, 0.12); add(g, torus(0.11, 0.006, Math.PI * 2, 32), trim, 0, 0.12, 0, 1.1, 0, 0.3); add(g, torus(0.11, 0.006, Math.PI * 2, 32), trim, 0, 0.12, 0, -0.4, 0.9, 0); add(g, cyl(0.02, 0.03, 0.05), trim, 0, 0); }
        if (t === 2) { for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; add(g, oct(0.04 + (i % 2) * 0.02), mat('glow', c), Math.cos(a) * 0.05, 0.12 + (i % 3) * 0.03, Math.sin(a) * 0.05, a, 0, 0.4, 0.6, 1.6, 0.6); } add(g, oct(0.05), mat('glow', '#ffffff'), 0, 0.14, 0, 0, 0, 0, 0.7, 1.5, 0.7); }
        break;
      }
      default: return null;
    }
    g.userData.glow = glowC;
    return g;
  }

  root.WEAPON3D = { build };
})(this);
