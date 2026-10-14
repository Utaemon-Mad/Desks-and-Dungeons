/* global THREE, MODELS, VIEW3D, RULES */
// Temas de mazmorra nuevos: catedral, tumba del faraón, cavernas, camino del bosque, calles de la ciudad de noche,
// campo de batalla, ciudad en llamas e infierno. Aquí van sus colores, el suelo pintado, lo que rodea los claros en los
// de exterior (casas, empalizadas, rocas…), su decorado y sus murales. Se carga después de view3d.js.
(function () {
  'use strict';
  const { mat, mesh, box, cyl, sph, cone, piece, GL } = MODELS;
  const { geo, halfSph } = MODELS._;
  const { rand, camMask, seenNear, decalTexture, grassTuft, buildForestGL, forestTile, forestBlobs } = VIEW3D._;
  const PLACES = VIEW3D.PLACES;

  // ---------- Colores y luz de cada tema ----------
  Object.assign(VIEW3D.THEME, {
    catedral: { floor: ['#6a6460', '#5e5854'], seam: '#3a3632', wall: '#8a8478', top: '#1a1816', fog: '#08070a', liquid: '#1a3a4a', sky: '#8a7ac8', amb: 0.2, ground: '#1a1420', mist: '#c8b8e8', mistA: 0.18 },
    tumba: { floor: ['#a8885a', '#9a7c50'], seam: '#5a4228', wall: '#b8986a', top: '#2a1e10', fog: '#0a0804', liquid: '#2a4a3a', sky: '#d8a860', amb: 0.17, ground: '#3a2810', mist: '#e8c890', mistA: 0.18 },
    caverna: { floor: ['#3e3a36', '#36322e'], seam: '#1e1c1a', wall: '#4a4440', top: '#0c0b0a', fog: '#05060a', liquid: '#1a3a5a', sky: '#8a9ac8', amb: 0.24, ground: '#0a0c14', mist: '#8aa0c8', mistA: 0.3 },
    sendero: { floor: ['#3e5a2a', '#466432'], seam: '#2a3a1a', wall: '#3a4a2a', top: '#16220e', fog: '#060c06', liquid: '#2a4a46', sky: '#7a9ac8', amb: 0.32, ground: '#1a2a10', mist: '#a8d0b0', mistA: 0.14 },
    ciudad: { floor: ['#3a3c44', '#34363e'], seam: '#1a1a20', wall: '#4a4a52', top: '#0e0e14', fog: '#04050a', liquid: '#1a2a3a', sky: '#5a6aa8', amb: 0.24, ground: '#0a0c1a', mist: '#8a9ac8', mistA: 0.26 },
    batalla: { floor: ['#4a4030', '#40382a'], seam: '#2a2418', wall: '#4a4030', top: '#141008', fog: '#0a0806', liquid: '#3a2a20', sky: '#8a7a6a', amb: 0.3, ground: '#2a1a10', mist: '#b0a090', mistA: 0.3 },
    incendio: { floor: ['#3a3430', '#342e2a'], seam: '#1a1410', wall: '#4a3a30', top: '#100a08', fog: '#120604', liquid: '#c8400a', sky: '#8a4a30', amb: 0.16, ground: '#4a1a08', mist: '#ff9a5a', mistA: 0.22 },
    infierno: { floor: ['#1e1416', '#24161a'], seam: '#0a0404', wall: '#3a1a18', top: '#080202', fog: '#140202', liquid: '#ff4a0a', sky: '#7a2018', amb: 0.12, ground: '#4a0a04', mist: '#ff5a2a', mistA: 0.3 },
  });

  // ---------- Suelos pintados (32 px por casilla) ----------
  const wallAt = (map, x, y) => x < 0 || y < 0 || x >= map.w || y >= map.h || map.tiles[y * map.w + x] === '#';
  // adoquines: piedras redondeadas con juntas oscuras; wet = charcos que brillan con la luz
  function cobbles(g, X, Y, px, seed, base, wet) {
    g.fillStyle = '#16161a'; g.fillRect(X, Y, px, px);
    const n = 4;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const off = j % 2 ? px / n / 2 : 0, w = px / n;
      const cx = X + i * w + off + w / 2, cy = Y + j * w + w / 2, r = rand(seed + i * 7 + j * 13);
      const c = new THREE.Color(base).offsetHSL(0, 0, (r - 0.5) * 0.08);
      g.fillStyle = '#' + c.getHexString();
      g.beginPath(); g.ellipse(cx, cy, w * 0.44, w * 0.4, r, 0, 7); g.fill();
      g.fillStyle = 'rgba(255,255,255,.06)'; g.beginPath(); g.ellipse(cx - 1, cy - 1.5, w * 0.25, w * 0.15, 0, 0, 7); g.fill();
    }
    if (wet && rand(seed + 3) < 0.18) { g.fillStyle = 'rgba(120,150,200,.22)'; g.beginPath(); g.ellipse(X + px * rand(seed + 4), Y + px * rand(seed + 5), px * 0.4, px * 0.25, 0, 0, 7); g.fill(); }
  }
  // tierra pisada de los caminos, con roderas y huellas
  function dirtRoad(g, X, Y, px, seed) {
    g.fillStyle = '#5a4630'; g.fillRect(X, Y, px, px);
    for (let i = 0; i < 10; i++) { g.fillStyle = rand(seed + i) > 0.5 ? 'rgba(90,70,44,.7)' : 'rgba(40,30,18,.4)'; g.fillRect(X + rand(seed + 20 + i) * px, Y + rand(seed + 40 + i) * px, 2 + rand(seed + i * 3) * 3, 2); }
    g.fillStyle = 'rgba(30,22,12,.35)'; g.fillRect(X + px * 0.28, Y, 2, px); g.fillRect(X + px * 0.7, Y, 2, px);
  }
  PLACES.catedral = {
    floors: ['floor_tile_large'], tint: ['#b8b0a4', '#c8c0b4'], fancy: 'windows', webby: true,
    grade: { gain: [1.0, 0.98, 1.06], lift: [0.01, 0.005, 0.02], saturation: 1.05, vignette: 0.5, bloom: 0.8 },
  };
  PLACES.tumba = {
    floors: ['floor_tile_large', 'floor_tile_large', 'floor_tile_large', 'floor_tile_large_rocks'], tint: ['#d8b078', '#e0c08a'], webby: true,
    grade: { gain: [1.12, 1.0, 0.82], lift: [0.02, 0.01, 0], saturation: 1.1, vignette: 0.52, bloom: 0.7 },
  };
  PLACES.sendero = {
    tile(g, map, x, y, X, Y, px) { if (map.tiles[y * map.w + x] === '=') dirtRoad(g, X, Y, px, x * 12.9 + y * 78.2); else forestTile(g, map, x, y, X, Y, px); },
    after: forestBlobs,
    build: (map, out) => buildForestGL(map, out),
    grade: { gain: [0.96, 1.04, 0.96], lift: [0.005, 0.012, 0.01], saturation: 1.12, vignette: 0.5, bloom: 0.7 },
  };
  PLACES.caverna = {
    mossy: true,
    tile(g, map, x, y, X, Y, px) {
      const seed = x * 12.9 + y * 78.2, ch = map.tiles[y * map.w + x];
      if (ch === '#') { g.fillStyle = '#0c0b0a'; g.fillRect(X, Y, px, px); return; }
      if (ch === '~') { g.fillStyle = '#0a141e'; g.fillRect(X, Y, px, px); return; }
      g.fillStyle = rand(seed) > 0.5 ? '#3e3a36' : '#38342f'; g.fillRect(X, Y, px, px);
      for (let i = 0; i < 12; i++) { g.fillStyle = rand(seed + i) > 0.5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.18)'; g.beginPath(); g.arc(X + rand(seed + 20 + i) * px, Y + rand(seed + 40 + i) * px, 1 + rand(seed + 60 + i) * 3, 0, 7); g.fill(); }
      if (rand(seed + 5) < 0.12) { g.strokeStyle = 'rgba(120,200,255,.25)'; g.lineWidth = 1; g.beginPath(); g.moveTo(X + 4, Y + px * rand(seed + 6)); g.lineTo(X + px - 4, Y + px * rand(seed + 7)); g.stroke(); }
    },
    build: (map, out) => outdoor(map, out, CAVE),
    grade: { gain: [0.98, 1.0, 1.1], lift: [0.008, 0.01, 0.025], saturation: 1.05, vignette: 0.55, bloom: 0.85 },
  };
  PLACES.ciudad = {
    tile(g, map, x, y, X, Y, px) {
      const seed = x * 12.9 + y * 78.2, ch = map.tiles[y * map.w + x];
      if (ch === '#') { g.fillStyle = '#121216'; g.fillRect(X, Y, px, px); return; }
      cobbles(g, X, Y, px, seed, ch === '=' ? '#4a4a52' : '#55524c', true);
    },
    build: (map, out) => outdoor(map, out, CITY),
    grade: { gain: [0.88, 0.96, 1.14], lift: [0, 0.006, 0.03], saturation: 0.95, vignette: 0.6, bloom: 0.85 },
  };
  PLACES.incendio = {
    tile(g, map, x, y, X, Y, px) {
      const seed = x * 12.9 + y * 78.2, ch = map.tiles[y * map.w + x];
      if (ch === '#') { g.fillStyle = '#140c08'; g.fillRect(X, Y, px, px); return; }
      cobbles(g, X, Y, px, seed, ch === '=' ? '#4a423c' : '#524840', false);
      if (rand(seed + 9) < 0.35) { g.fillStyle = 'rgba(10,6,4,.45)'; g.beginPath(); g.ellipse(X + px * rand(seed + 1), Y + px * rand(seed + 2), px * 0.5, px * 0.35, rand(seed) * 3, 0, 7); g.fill(); }
      if (rand(seed + 11) < 0.08) { g.fillStyle = 'rgba(255,110,30,.5)'; g.fillRect(X + px * rand(seed + 12), Y + px * rand(seed + 13), 3, 2); }
    },
    build: (map, out) => outdoor(map, out, BURNING),
    grade: { gain: [1.06, 0.94, 0.84], lift: [0.01, 0.004, 0], saturation: 1.1, vignette: 0.55, bloom: 0.7 },
  };
  PLACES.batalla = {
    tile(g, map, x, y, X, Y, px) {
      const seed = x * 12.9 + y * 78.2, ch = map.tiles[y * map.w + x];
      if (ch === '#') { g.fillStyle = rand(seed) > 0.5 ? '#2a2618' : '#24200f'; g.fillRect(X, Y, px, px); return; }
      // barro pisoteado con hierba seca y charcos de sangre
      g.fillStyle = rand(seed) > 0.5 ? '#4a4030' : '#433a2a'; g.fillRect(X, Y, px, px);
      for (let i = 0; i < 14; i++) { g.strokeStyle = rand(seed + 60 + i) > 0.5 ? 'rgba(140,130,70,.5)' : 'rgba(40,32,20,.45)'; g.lineWidth = 1; const bx = X + rand(seed + 20 + i) * px, by = Y + rand(seed + 40 + i) * px; g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + (rand(seed + i) - 0.5) * 3, by - 2 - rand(seed + 80 + i) * 3); g.stroke(); }
      for (let i = 0; i < 3; i++) if (rand(seed + 100 + i) < 0.3) { g.fillStyle = 'rgba(30,22,14,.5)'; g.beginPath(); g.ellipse(X + rand(seed + 110 + i) * px, Y + rand(seed + 120 + i) * px, 3, 2, rand(seed + i), 0, 7); g.fill(); }
      if (rand(seed + 7) < 0.1) { g.fillStyle = 'rgba(80,10,8,.6)'; g.beginPath(); g.ellipse(X + px / 2, Y + px / 2, px * 0.3, px * 0.2, rand(seed) * 3, 0, 7); g.fill(); }
    },
    build: (map, out) => outdoor(map, out, FIELD),
    grade: { gain: [1.02, 0.98, 0.92], lift: [0.012, 0.008, 0.004], saturation: 0.78, vignette: 0.58, bloom: 0.6 },
  };
  PLACES.infierno = {
    tile(g, map, x, y, X, Y, px) {
      const seed = x * 12.9 + y * 78.2, ch = map.tiles[y * map.w + x];
      if (ch === '#') { g.fillStyle = '#0c0404'; g.fillRect(X, Y, px, px); return; }
      if (ch === '%') { g.fillStyle = '#3a1004'; g.fillRect(X, Y, px, px); return; }
      // obsidiana con grietas al rojo
      g.fillStyle = rand(seed) > 0.5 ? '#1e1416' : '#22161a'; g.fillRect(X, Y, px, px);
      for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(255,255,255,.04)'; g.fillRect(X + rand(seed + i) * px, Y + rand(seed + i * 3) * px, 4, 2); }
      if (rand(seed + 1) < 0.45) {
        g.strokeStyle = rand(seed + 2) < 0.5 ? 'rgba(255,90,20,.75)' : 'rgba(255,150,40,.6)'; g.lineWidth = 1.4;
        g.beginPath(); let cx = X + rand(seed + 3) * px, cy = Y + rand(seed + 4) * px; g.moveTo(cx, cy);
        for (let i = 0; i < 4; i++) { cx += (rand(seed + 5 + i) - 0.5) * px * 0.6; cy += (rand(seed + 9 + i) - 0.5) * px * 0.6; g.lineTo(cx, cy); }
        g.stroke();
      }
    },
    build: (map, out) => outdoor(map, out, HELL),
    grade: { gain: [1.04, 0.9, 0.84], lift: [0.012, 0, 0], saturation: 1.12, vignette: 0.62, bloom: 0.65 },
  };

  // ---------- Exteriores: qué hay en las casillas de muro que rodean los claros ----------
  // pick(c) devuelve [pieza, { s, sy, tint, y, rx }] o null. c = { x, y, r, r2, near1, near2, low }; low = entre el claro y la cámara
  const HOUSES = ['m:building_home_A_blue', 'm:building_home_B_red', 'm:building_home_A_red', 'm:building_home_B_red', 'm:building_blacksmith_blue', 'm:building_market_red', 'm:building_tower_A_blue', 'm:building_church_blue'];
  const ROCKS = ['m:rock_single_A', 'm:rock_single_B', 'm:rock_single_C', 'm:rock_single_D', 'm:rock_single_E'];
  const CITY = {
    deep: 2,
    pick(c) {
      if (c.low) return c.near1 && c.r < 0.6 ? [c.r2 < 0.5 ? 'crate' : 'barrelk', { s: 1, r: c.r * 6 }] : c.near1 ? ['m:fence_stone_straight', { s: 0.9, r: c.r < 0.5 ? 0 : Math.PI / 2 }] : null;
      if (!c.near2) return null;
      return [HOUSES[Math.floor(c.r2 * HOUSES.length)], { s: 1.18 + c.r * 0.12, r: Math.floor(c.r * 6) * Math.PI / 3, tint: c.r < 0.3 ? '#8a8aa0' : '' }];
    },
    // en las ventanas, alguna luz encendida
    light(c) { return !c.low && c.near1 && c.r2 > 0.82 ? { y: 0.9, color: '#ffc070', intensity: 1.1, dist: 3.6 } : null; },
  };
  const BURNING = {
    deep: 2,
    pick(c) {
      if (c.low) return c.near1 && c.r < 0.6 ? ['rubblek', { s: 0.9, r: c.r * 6, tint: '#3a302a' }] : null;
      if (!c.near2) return null;
      if (c.r2 < 0.22) return ['m:building_destroyed', { s: 1.1, r: Math.floor(c.r * 6) * Math.PI / 3, tint: '#4a3a32' }];
      return [HOUSES[Math.floor(c.r2 * HOUSES.length)], { s: 1.15 + c.r * 0.1, r: Math.floor(c.r * 6) * Math.PI / 3, tint: c.r < 0.5 ? '#6a5a4e' : '#8a6a5a' }];
    },
    // las casas arden: llamas en el tejado y su luz
    flames(c) { return !c.low && c.near2 && c.r > 0.45; },
    light(c) { return !c.low && c.near1 && c.r > 0.84 ? { y: 1.6, color: '#ff7a2a', intensity: 1.6, dist: 6 } : null; },
  };
  const FIELD = {
    deep: 3, tufts: true,
    pick(c) {
      if (c.low) return c.near1 && c.r < 0.55 ? (c.r2 < 0.5 ? [ROCKS[Math.floor(c.r * 5)], { s: 1.2 + c.r, r: c.r2 * 6, tint: '#6a6050' }] : ['deadbush', { s: 0.8 + c.r * 0.4, r: c.r * 6 }]) : null;
      if (c.near1) return c.r2 < 0.12 ? ['m:tent', { s: 0.75, r: c.r * 6, tint: '#8a7a5a' }] : ['stakes', { s: 1, r: c.horiz ? 0 : Math.PI / 2 }];
      if (c.r < 0.25) return [c.r2 < 0.5 ? 'h:tree_dead_large' : 'h:tree_dead_medium', { s: 0.3 + c.r2 * 0.06, r: c.r2 * 6, tint: '#4a3e34' }];
      if (c.r < 0.4) return [ROCKS[Math.floor(c.r2 * 5)], { s: 2 + c.r * 1.5, r: c.r2 * 6, tint: '#5a5448' }];
      return c.near2 && c.r < 0.6 ? ['m:tent', { s: 0.8, r: c.r2 * 6, tint: c.r2 < 0.5 ? '#6a5a40' : '#7a3a2a' }] : null;
    },
  };
  const CAVE = {
    deep: 3,
    pick(c) {
      if (c.low) return c.near1 || c.r < 0.4 ? [ROCKS[Math.floor(c.r * 5)], { s: 1.1 + c.r * 0.8, sy: 0.6, r: c.r2 * 6, tint: '#6a625a' }] : null;
      if (c.r < 0.08 && c.near1) return ['spire', { s: 1.2 + c.r2, r: c.r * 6, tint: '#6a625a' }];
      return [ROCKS[Math.floor(c.r2 * 5)], { s: 2.6 + c.r * 1.6, sy: 1.6 + c.r2 * 1.4, r: c.r * 6, tint: c.r2 < 0.3 ? '#6a625a' : '#7a7068' }];
    },
    light(c) { return !c.low && c.near1 && c.r2 > 0.9 ? { y: 0.6, color: '#7ac8ff', intensity: 1.0, dist: 3.5, crystal: true } : null; },
  };
  const HELL = {
    deep: 3,
    pick(c) {
      if (c.low) return c.near1 || c.r < 0.4 ? [ROCKS[Math.floor(c.r * 5)], { s: 1.1 + c.r * 0.8, sy: 0.55, r: c.r2 * 6, tint: '#2a1210' }] : null;
      if (c.r < 0.35) return ['spire', { s: 1.4 + c.r2 * 1.4, r: c.r * 6, tint: '#2a0e0c' }];
      return [ROCKS[Math.floor(c.r2 * 5)], { s: 2.4 + c.r * 1.6, sy: 1.4 + c.r2 * 1.2, r: c.r * 6, tint: '#3a1614' }];
    },
  };

  // geometrías propias para lo que no tiene pieza KayKit
  function merged(parts) {
    const U = THREE.BufferGeometryUtils;
    const list = parts.map((g) => (g.index ? g.toNonIndexed() : g));
    const m = U && U.mergeGeometries ? U.mergeGeometries(list, false) : list[0];
    m.computeVertexNormals();
    return m;
  }
  const CUSTOM = {
    // empalizada: troncos afilados, alguno torcido
    stakes: () => [merged([0, 1, 2, 3, 4].flatMap((i) => {
      const x = -0.4 + i * 0.2, h = 0.9 + ((i * 37) % 5) * 0.08, lean = ((i * 13) % 3 - 1) * 0.06;
      const body = new THREE.CylinderGeometry(0.075, 0.085, h, 6).translate(x, h / 2, 0); body.rotateZ(lean);
      const tip = new THREE.ConeGeometry(0.075, 0.22, 6).translate(x, h + 0.11, 0); tip.rotateZ(lean);
      return [body, tip];
    }).concat([new THREE.BoxGeometry(1, 0.06, 0.05).translate(0, 0.45, 0.08), new THREE.BoxGeometry(1, 0.06, 0.05).translate(0, 0.75, 0.08)])), new THREE.MeshStandardMaterial({ color: '#5a4026', roughness: 0.9, flatShading: true })],
    // aguja de roca (cavernas e infierno)
    spire: () => [merged([new THREE.ConeGeometry(0.3, 1.8, 6).translate(0, 0.9, 0), new THREE.ConeGeometry(0.16, 1.0, 5).translate(0.22, 0.5, 0.1), new THREE.ConeGeometry(0.13, 0.7, 5).translate(-0.2, 0.35, -0.1)]), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, flatShading: true })],
    deadbush: () => [merged([0, 1, 2, 3, 4, 5].map((i) => { const b = new THREE.CylinderGeometry(0.01, 0.025, 0.45, 3).translate(0, 0.22, 0); b.rotateZ(0.5); b.rotateY(i * 1.05); return b; })), new THREE.MeshStandardMaterial({ color: '#4a3a28', roughness: 0.95, flatShading: true })],
    crate: () => [new THREE.BoxGeometry(0.5, 0.45, 0.5).translate(0, 0.225, 0), new THREE.MeshStandardMaterial({ color: '#6a4a2a', roughness: 0.9, flatShading: true })],
    barrelk: () => [new THREE.CylinderGeometry(0.22, 0.24, 0.6, 9).translate(0, 0.3, 0), new THREE.MeshStandardMaterial({ color: '#5a3a20', roughness: 0.85, flatShading: true })],
    rubblek: () => [merged([0, 1, 2, 3, 4].map((i) => new THREE.DodecahedronGeometry(0.12 + (i % 3) * 0.06).translate(Math.cos(i * 1.3) * 0.25, 0.06, Math.sin(i * 1.3) * 0.25))), new THREE.MeshStandardMaterial({ color: '#4a3e36', roughness: 0.95, flatShading: true })],
    flame: () => [merged([new THREE.ConeGeometry(0.22, 0.8, 6).translate(0, 0.4, 0), new THREE.ConeGeometry(0.14, 0.55, 5).translate(0.2, 0.27, 0.05), new THREE.ConeGeometry(0.12, 0.5, 5).translate(-0.18, 0.25, -0.06)]), new THREE.MeshStandardMaterial({ color: '#ff8a30', emissive: '#ff4a08', emissiveIntensity: 1.1, roughness: 0.6, transparent: true, opacity: 0.85 })],
  };
  const customCache = {};
  const custom = (k) => customCache[k] || (customCache[k] = CUSTOM[k] ? CUSTOM[k]() : null);

  function outdoor(map, out, S) {
    const mm = MODELS;
    const { group } = out;
    const isWall = (x, y) => wallAt(map, x, y);
    const floorNear = (x, y, r) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (!isWall(x + dx, y + dy)) return true; return false; };
    const lists = {};
    const add = (name, it, tint = '') => (lists[name + '|' + tint] = lists[name + '|' + tint] || []).push(it);
    const flames = [];
    for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
      if (!isWall(x, y)) continue;
      const near1 = floorNear(x, y, 1), near2 = near1 || floorNear(x, y, 2), nearD = near2 || floorNear(x, y, S.deep || 3);
      if (!nearD) continue;
      const tile = y * map.w + x, r = rand(x * 7.3 + y * 3.1), r2 = rand(x * 3.7 + y * 9.1);
      const lm = camMask((a, b) => !isWall(a, b), x, y, near1 ? 2 : 4);
      const c = { x, y, r, r2, near1, near2, low: !!(lm & 1), horiz: !isWall(x, y + 1) || !isWall(x, y - 1) };
      const p = S.pick(c);
      if (p) {
        const [name, o] = p;
        const jx = name.startsWith('m:building') || name === 'stakes' ? 0 : (r2 - 0.5) * 0.3, jz = name.startsWith('m:building') || name === 'stakes' ? 0 : (r - 0.5) * 0.3;
        add(name, { x: x + 0.5 + jx, z: y + 0.5 + jz, s: o.s || 1, sy: o.sy, r: o.r || 0, tile, lm: c.low ? 0 : lm }, o.tint || '');
      }
      if (S.flames && S.flames(c)) flames.push({ x: x + 0.5 + (r2 - 0.5) * 0.3, z: y + 0.5 + (r - 0.5) * 0.3, y: 0.9 + r * 0.5, s: 0.8 + r2 * 0.6, r: r * 6, tile, lm });
      const L = S.light && S.light(c);
      if (L) out.lights.push({ x: x + 0.5, y: L.y, z: y + 0.5 + 0.6, color: L.color, intensity: L.intensity, dist: L.dist, tile });
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const meshes = [];
    for (const [key, list] of Object.entries(lists)) {
      const [name, tint] = key.split('|');
      let geometry, material;
      const C = custom(name);
      if (C) { [geometry, material] = C; if (tint) { material = material.clone(); material.color = new THREE.Color(tint); } } else {
        const P = mm.pieceGeo(name, true);
        if (!P) continue;
        geometry = P.geometry; material = P.material;
        if (tint) material = [].concat(material).map((m) => { const cl = m.clone(); cl.color = new THREE.Color(tint); return cl; });
        if (Array.isArray(material) && material.length === 1) material = material[0];
      }
      const im = new THREE.InstancedMesh(geometry, material, list.length);
      im.castShadow = true; im.receiveShadow = true; im.count = 0;
      group.add(im);
      meshes.push({ im, list });
    }
    if (flames.length) {
      const [fg, fm] = custom('flame');
      const im = new THREE.InstancedMesh(fg, fm, flames.length);
      im.castShadow = false; im.count = 0; im.userData.flames = true;
      group.add(im);
      meshes.push({ im, list: flames, flame: true });
    }
    out.updateWalls = (seen) => {
      const bit = 1 << (out.rot || 0);
      for (const W of meshes) {
        let n = 0;
        for (const w of W.list) {
          if (!seen[w.tile] && !seenNear(seen, map, w.tile)) continue;
          if (w.lm & bit) continue;
          q.setFromAxisAngle(up, w.r); sc.set(w.s, w.sy ? w.s * w.sy : w.s, w.s); ps.set(w.x, w.y || 0, w.z);
          m4.compose(ps, q, sc); W.im.setMatrixAt(n++, m4);
        }
        W.im.count = n; W.im.instanceMatrix.needsUpdate = true;
      }
    };
    // las llamas de los tejados tiemblan
    if (flames.length) {
      const fm = meshes.find((W) => W.flame);
      fm.im.onBeforeRender = () => { const t = performance.now() / 1000; fm.im.material.emissiveIntensity = 1.05 + Math.sin(t * 9) * 0.2 + Math.sin(t * 23) * 0.1; };
    }
    // matas de hierba seca en el campo de batalla
    if (S.tufts) {
      const tufts = [], col = new THREE.Color();
      for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
        if (map.tiles[y * map.w + x] !== '.') continue;
        const n = Math.floor(rand(x * 5.1 + y * 2.3) * 2.4);
        for (let i = 0; i < n; i++) tufts.push({ x: x + rand(x + y * 9 + i), z: y + rand(y + x * 7 + i * 3), s: 0.7 + rand(x * y + i) * 0.6, r: rand(i + x * 3 + y) * 6 });
      }
      if (tufts.length) {
        const im = VIEW3D._.instanced(grassTuft(), new THREE.MeshStandardMaterial({ color: '#8a8050', roughness: 0.95, side: THREE.DoubleSide }), tufts, { shadow: false });
        tufts.forEach((t, i) => { col.setHSL(0.12 + rand(t.x * 3.3) * 0.06, 0.35, 0.28 + rand(t.z * 5.1) * 0.1); im.setColorAt(i, col); });
        group.add(im);
      }
    }
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(map.w, map.h), new THREE.MeshStandardMaterial({ map: decalTexture(map, map.theme), transparent: true, roughness: 0.95, depthWrite: false }));
    decal.rotation.x = -Math.PI / 2; decal.position.set(map.w / 2, 0.02, map.h / 2); decal.receiveShadow = true;
    group.add(decal);
    // las luces de las ventanas y de las casas en llamas sólo se encienden al descubrir su casilla
    const lightTiles = out.lights.filter((l) => l.tile !== undefined);
    if (lightTiles.length) {
      const all = out.lights.slice();
      const prev = out.updateWalls;
      out.updateWalls = (seen) => {
        prev(seen);
        out.lights.length = 0;
        for (const l of all) if (l.tile === undefined || seen[l.tile] || seenNear(seen, map, l.tile)) out.lights.push(l);
      };
    }
    out.props = [];
    for (const p of map.props || []) {
      const pr = mm.prop(p.k, map.theme);
      if (!pr || pr.wall) continue;
      const o = pr.obj;
      o.position.set(p.x + 0.5, 0, p.y + 0.5); o.rotation.y = rand(p.x * 3 + p.y) * Math.PI * 2;
      o.visible = false;
      group.add(o);
      out.props.push({ o, tile: p.y * map.w + p.x, light: pr.light ? { x: p.x + 0.5, y: pr.light.y, z: p.y + 0.5 + (pr.light.z || 0), color: pr.light.color, intensity: pr.light.intensity, dist: pr.light.dist } : null });
    }
    out.gl = true;
    return out;
  }

  // ---------- Decorado nuevo ----------
  const tex = {};
  function canvasTex(key, w, h, draw, emissive) {
    if (tex[key]) return tex[key];
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    tex[key] = new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, emissive: emissive ? '#ffffff' : '#000000', emissiveMap: emissive ? t : null, emissiveIntensity: emissive ? 0.9 : 0 });
    return tex[key];
  }
  // vidriera: arco con cristales de colores entre plomos
  const VITRAL = ['#7a3ad8', '#2a6aff', '#e83a3a', '#f0b030'];
  function vitralMat(i) {
    return canvasTex('vitral' + i, 64, 128, (g, w, h) => {
      const cols = VITRAL.slice(i).concat(VITRAL.slice(0, i)).concat(['#3ac86a', '#f0f0f0']);
      for (let y = 0; y < h; y += 16) for (let x = 0; x < w; x += 16) { g.fillStyle = cols[(x / 16 + y / 16 * 3 + i) % cols.length]; g.fillRect(x, y, 16, 16); }
      g.fillStyle = cols[2]; g.beginPath(); g.arc(32, 46, 18, 0, 7); g.fill();
      g.fillStyle = cols[3]; g.beginPath(); g.arc(32, 46, 9, 0, 7); g.fill();
      g.strokeStyle = '#141018'; g.lineWidth = 3;
      for (let y = 0; y <= h; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      for (let x = 0; x <= w; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
      g.beginPath(); g.arc(32, 46, 18, 0, 7); g.stroke();
    }, true);
  }
  // jeroglíficos: ojos, pájaros, escarabajos y ondas en columnas
  function hieroMat() {
    return canvasTex('hiero', 96, 128, (g, w, h) => {
      g.fillStyle = '#c8a46a'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '90,60,30' : '255,240,200'},0.1)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
      g.strokeStyle = '#6a4220'; g.lineWidth = 2; for (const x of [32, 64]) { g.beginPath(); g.moveTo(x, 4); g.lineTo(x, h - 4); g.stroke(); }
      const ink = ['#2a3a8a', '#8a2a1a', '#1a1a1a', '#2a6a5a'];
      for (let col = 0; col < 3; col++) for (let row = 0; row < 5; row++) {
        const cx = 16 + col * 32, cy = 14 + row * 24, k = (col * 5 + row * 3) % 5;
        g.fillStyle = ink[(col + row) % 4]; g.strokeStyle = g.fillStyle; g.lineWidth = 2;
        if (k === 0) { g.beginPath(); g.ellipse(cx, cy, 9, 5, 0, 0, 7); g.stroke(); g.beginPath(); g.arc(cx, cy, 2.5, 0, 7); g.fill(); g.beginPath(); g.moveTo(cx - 3, cy + 5); g.lineTo(cx - 6, cy + 10); g.stroke(); }
        else if (k === 1) { g.beginPath(); g.ellipse(cx, cy + 2, 6, 4, 0, 0, 7); g.fill(); g.beginPath(); g.arc(cx + 5, cy - 3, 3, 0, 7); g.fill(); g.fillRect(cx - 4, cy + 5, 2, 5); g.fillRect(cx + 1, cy + 5, 2, 5); }
        else if (k === 2) { g.beginPath(); g.ellipse(cx, cy, 6, 7, 0, 0, 7); g.fill(); g.fillRect(cx - 10, cy - 1, 20, 2); }
        else if (k === 3) { g.beginPath(); for (let i = 0; i < 4; i++) { g.moveTo(cx - 9 + i * 5, cy); g.quadraticCurveTo(cx - 6.5 + i * 5, cy - 4, cx - 4 + i * 5, cy); } g.stroke(); }
        else { g.beginPath(); g.moveTo(cx, cy - 8); g.lineTo(cx + 7, cy + 7); g.lineTo(cx - 7, cy + 7); g.closePath(); g.stroke(); }
      }
    });
  }
  // sarcófago dorado: oro con franjas azules y la cara del faraón
  function goldSarcMat() {
    return canvasTex('goldsarc', 64, 128, (g, w, h) => {
      g.fillStyle = '#d8a830'; g.fillRect(0, 0, w, h);
      for (let y = 34; y < h; y += 10) { g.fillStyle = y % 20 ? '#2a4aa8' : '#d8a830'; g.fillRect(4, y, w - 8, 5); }
      g.fillStyle = '#e8c070'; g.beginPath(); g.ellipse(32, 20, 14, 16, 0, 0, 7); g.fill();
      g.fillStyle = '#1a1a1a'; g.fillRect(24, 16, 5, 2); g.fillRect(35, 16, 5, 2); g.fillRect(31, 30, 2, 8);
      g.fillStyle = '#2a4aa8'; g.fillRect(14, 4, 6, 30); g.fillRect(44, 4, 6, 30);
    });
  }
  const glP = (name, s, o) => (GL.ready ? piece(name, s, o) : null);
  function newProp(k, theme) {
    const g = new THREE.Group();
    let light = null, wall = false, block = true;
    const wood = mat('#5a3a20'), woodD = mat('#3a2414'), iron = mat('#2a2a2e', { metal: 0.6, rough: 0.4 }), gold = mat('#d8a830', { metal: 0.8, rough: 0.3 });
    const stone = mat(theme === 'tumba' ? '#b8986a' : '#8a8478'), stoneD = mat(theme === 'tumba' ? '#8a6e48' : '#5a5650');
    switch (k) {
      // columnas de piedra clara en la catedral y de arenisca en la tumba
      case 'pillar': {
        if (theme !== 'catedral' && theme !== 'tumba') return null;
        const p = glP('pillar_decorated', 0.36, { tint: theme === 'tumba' ? '#d8b880' : '#c8c0b4' });
        if (!p) return null;
        g.add(p);
        break;
      }
      // ---- catedral ----
      case 'pew': {
        mesh(box(0.9, 0.06, 0.32), wood, 0, 0.42, 0, g); mesh(box(0.9, 0.5, 0.05), wood, 0, 0.62, -0.15, g);
        for (const x of [-0.42, 0.42]) { mesh(box(0.05, 0.42, 0.34), woodD, x, 0.21, 0, g); mesh(box(0.06, 0.12, 0.06), woodD, x, 0.9, -0.15, g); }
        g.userData.fixedRot = 0;
        break;
      }
      case 'candelabra': {
        mesh(cyl(0.16, 0.2, 0.06, 8), iron, 0, 0.03, 0, g); mesh(cyl(0.025, 0.035, 1.25, 6), iron, 0, 0.65, 0, g);
        mesh(box(0.56, 0.03, 0.03), iron, 0, 1.18, 0, g); mesh(box(0.03, 0.03, 0.56), iron, 0, 1.18, 0, g);
        for (const [x, z] of [[0, 0], [0.26, 0], [-0.26, 0], [0, 0.26], [0, -0.26]]) MODELS.candle(g, x, 1.2, z);
        light = { color: '#ffd08a', intensity: 1.4, dist: 4.5, y: 1.35 };
        break;
      }
      case 'organ': {
        mesh(box(1.0, 0.6, 0.4), wood, 0, 0.3, -0.1, g);
        for (let i = 0; i < 9; i++) { const h = 0.7 + Math.sin(i / 8 * Math.PI) * 0.7; mesh(cyl(0.045, 0.045, h, 7), gold, -0.44 + i * 0.11, 0.6 + h / 2, -0.2, g); }
        mesh(box(0.8, 0.04, 0.18), mat('#efe6d0'), 0, 0.62, 0.08, g);
        break;
      }
      case 'font': mesh(cyl(0.1, 0.16, 0.5, 8), stone, 0, 0.25, 0, g); mesh(cyl(0.34, 0.24, 0.2, 10), stone, 0, 0.6, 0, g); mesh(cyl(0.29, 0.29, 0.02, 10), mat('#3a6a8a', { rough: 0.1, metal: 0.3 }), 0, 0.69, 0, g); break;
      case 'carpet': return null; // se pinta en el suelo
      case 'vitral': {
        wall = true; block = false;
        const i = Math.floor(Math.random() * 4);
        const glass = mesh(box(0.42, 0.78, 0.02), vitralMat(i), 0, 1.05, 0.04, g); glass.castShadow = false;
        mesh(box(0.5, 0.05, 0.05), stoneD, 0, 0.64, 0.05, g); mesh(halfSph(0.25), stoneD, 0, 1.44, 0.035, g).scale.set(1, 0.6, 0.15);
        for (const x of [-0.235, 0.235]) mesh(box(0.05, 0.82, 0.05), stoneD, x, 1.05, 0.05, g);
        light = { color: ['#b08aff', '#7aa0ff', '#ff8a8a', '#ffd27a'][i], intensity: 1.2, dist: 4.5, y: 1.0, z: 0.9 };
        break;
      }
      // ---- tumba ----
      case 'urn': {
        const clay = mat(['#b86a3a', '#d8c8a0', '#3a6a5a'][Math.floor(Math.random() * 3)]);
        const prof = [[0, 0], [0.1, 0.02], [0.15, 0.15], [0.14, 0.3], [0.08, 0.4], [0.09, 0.44]].map(([x, y]) => new THREE.Vector2(x, y));
        mesh(geo('urn', () => new THREE.LatheGeometry(prof, 10)), clay, 0, 0, 0, g);
        mesh(sph(0.08, 8, 6), mat('#c8a050'), 0, 0.5, 0, g).scale.set(1, 1.1, 1.3);
        mesh(cone(0.03, 0.08, 4), mat('#c8a050'), 0.04, 0.58, 0, g); mesh(cone(0.03, 0.08, 4), mat('#c8a050'), -0.04, 0.58, 0, g);
        break;
      }
      case 'obelisk': mesh(box(0.42, 0.14, 0.42), stoneD, 0, 0.07, 0, g); mesh(geo('obel', () => new THREE.CylinderGeometry(0.13, 0.19, 1.6, 4)), stone, 0, 0.94, 0, g).rotation.y = Math.PI / 4; mesh(cone(0.13 * 1.41, 0.22, 4), gold, 0, 1.85, 0, g); break;
      case 'jackal': {
        const black = mat('#1a1a1e', { rough: 0.4 });
        mesh(box(0.5, 0.2, 0.5), stoneD, 0, 0.1, 0, g);
        mesh(cyl(0.13, 0.17, 0.75, 8), black, 0, 0.58, 0, g); mesh(box(0.42, 0.12, 0.2), black, 0, 0.92, 0, g);
        mesh(cyl(0.16, 0.16, 0.05, 10), gold, 0, 0.98, 0, g);
        mesh(box(0.14, 0.16, 0.18), black, 0, 1.1, 0.02, g); mesh(box(0.08, 0.08, 0.2), black, 0, 1.07, 0.16, g);
        for (const x of [-0.05, 0.05]) mesh(cone(0.035, 0.2, 4), black, x, 1.27, -0.02, g);
        for (const x of [-0.04, 0.04]) mesh(sph(0.012, 5, 4), mat('#ffd23f', { emissive: '#ffaa20', ei: 1.5 }), x, 1.13, 0.11, g);
        mesh(cyl(0.012, 0.012, 0.9, 5), gold, 0.22, 0.75, 0.05, g);
        break;
      }
      case 'goldsarc': mesh(box(0.56, 0.4, 0.95), goldSarcMat(), 0, 0.2, 0, g); mesh(box(0.6, 0.06, 1.0), gold, 0, 0.43, 0, g); mesh(box(0.32, 0.08, 0.3), goldSarcMat(), 0, 0.5, -0.25, g); break;
      case 'sand': mesh(halfSph(0.3), mat('#c8a46a'), 0, 0, 0, g).scale.set(1.2, 0.3, 1); block = false; break;
      case 'scarab': for (const [x, z] of [[0, 0], [0.12, 0.08], [-0.1, 0.12]]) { mesh(halfSph(0.045), mat('#2a8a7a', { metal: 0.6, rough: 0.3 }), x, 0, z, g).scale.set(1, 0.7, 1.3); } block = false; break;
      case 'hiero': wall = true; block = false; mesh(box(0.8, 1.05, 0.02), hieroMat(), 0, 0.7, 0.04, g); break;
      // ---- ciudad y caminos ----
      case 'streetlamp': {
        const p = glP('h:post_lantern', 0.42);
        if (p) g.add(p); else { mesh(cyl(0.04, 0.05, 1.5, 6), iron, 0, 0.75, 0, g); mesh(box(0.14, 0.18, 0.14), mat('#ffd27a', { emissive: '#ffb84a', ei: 2 }), 0, 1.55, 0, g); }
        light = { color: '#ffcf7a', intensity: 1.8, dist: 6, y: 1.5 };
        break;
      }
      case 'well': {
        mesh(cyl(0.38, 0.4, 0.45, 12), mat('#6a6660'), 0, 0.22, 0, g); mesh(cyl(0.3, 0.3, 0.02, 12), mat('#0a1218'), 0, 0.44, 0, g);
        for (const x of [-0.33, 0.33]) mesh(box(0.06, 0.9, 0.06), wood, x, 0.8, 0, g);
        mesh(cone(0.55, 0.35, 4), mat('#6a2a1a'), 0, 1.35, 0, g).rotation.y = Math.PI / 4; mesh(cyl(0.03, 0.03, 0.7, 6), woodD, 0, 1.05, 0, g).rotation.z = Math.PI / 2;
        break;
      }
      case 'cart': {
        mesh(box(0.85, 0.08, 0.5), wood, 0, 0.42, 0, g);
        for (const z of [-0.25, 0.25]) mesh(box(0.85, 0.18, 0.04), woodD, 0, 0.55, z, g);
        for (const x of [-0.42, 0.42]) mesh(box(0.04, 0.18, 0.5), woodD, x, 0.55, 0, g);
        for (const z of [-0.29, 0.29]) { const w = mesh(geo('wheel', () => new THREE.TorusGeometry(0.22, 0.035, 5, 12)), woodD, -0.05, 0.25, z, g); void w; mesh(cyl(0.03, 0.03, 0.06, 6), iron, -0.05, 0.25, z, g).rotation.x = Math.PI / 2; }
        mesh(box(0.7, 0.04, 0.04), wood, 0.72, 0.3, 0.12, g).rotation.z = 0.35; mesh(box(0.7, 0.04, 0.04), wood, 0.72, 0.3, -0.12, g).rotation.z = 0.35;
        if (theme === 'incendio' || theme === 'batalla') g.rotation.z = 0.15; else { mesh(box(0.3, 0.25, 0.3), mat('#8a6a3a'), -0.15, 0.58, 0, g); mesh(sph(0.12, 6, 5), mat('#a8843a'), 0.18, 0.55, 0.05, g); }
        break;
      }
      case 'stall': {
        mesh(box(0.9, 0.06, 0.5), wood, 0, 0.6, 0, g);
        for (const [x, z] of [[-0.42, -0.22], [0.42, -0.22], [-0.42, 0.22], [0.42, 0.22]]) mesh(box(0.05, 1.2, 0.05), woodD, x, 0.6, z, g);
        for (let i = 0; i < 5; i++) mesh(box(0.2, 0.03, 0.62), mat(i % 2 ? '#e8e0d0' : '#a82a2a'), -0.4 + i * 0.2, 1.22, 0, g).rotation.x = -0.18;
        for (let i = 0; i < 4; i++) mesh(sph(0.06, 6, 5), mat(['#d84a2a', '#e8c040', '#6aa83a', '#a83a8a'][i]), -0.3 + i * 0.2, 0.68, 0, g);
        break;
      }
      case 'signpost': {
        mesh(cyl(0.04, 0.05, 1.3, 6), wood, 0, 0.65, 0, g);
        for (const [y, ry] of [[1.1, 0.4], [0.88, -0.8]]) { const b = mesh(box(0.5, 0.12, 0.03), mat('#8a6a42'), 0.18, y, 0, g); b.rotation.y = ry; }
        block = true;
        break;
      }
      // ---- campo de batalla ----
      case 'corpse': {
        block = false;
        const cloth = mat(['#6a2a2a', '#2a3a6a', '#4a4a3a', '#5a4a2a'][Math.floor(Math.random() * 4)]), skin = mat('#8a8a78'), steel = mat('#7a7a82', { metal: 0.6, rough: 0.4 });
        const body = new THREE.Group(); g.add(body);
        mesh(box(0.26, 0.12, 0.42), cloth, 0, 0.07, 0, body); mesh(box(0.28, 0.06, 0.3), steel, 0, 0.14, -0.04, body);
        mesh(sph(0.09, 7, 6), skin, 0, 0.08, -0.3, body); mesh(halfSph(0.1), steel, 0, 0.1, -0.31, body).rotation.x = -1.2;
        for (const x of [-0.07, 0.07]) mesh(box(0.08, 0.08, 0.36), mat('#3a3020'), x, 0.05, 0.36, body);
        mesh(box(0.07, 0.07, 0.3), cloth, 0.2, 0.05, -0.08, body).rotation.y = 0.7; mesh(box(0.07, 0.07, 0.3), cloth, -0.19, 0.05, 0.02, body).rotation.y = -0.4;
        if (Math.random() < 0.6) { const s = mesh(box(0.03, 0.01, 0.55), steel, 0.32, 0.02, 0.1, g); s.rotation.y = 0.5; }
        if (Math.random() < 0.4) { const sh = mesh(cyl(0.18, 0.18, 0.03, 10), mat('#6a4a2a'), -0.34, 0.02, 0.22, g); sh.rotation.z = 0.08; }
        if (Math.random() < 0.35) { const ar = mesh(cyl(0.006, 0.006, 0.4, 3), mat('#5a4a32'), 0.02, 0.24, 0, g); ar.rotation.set(0.6, 0, 0.3); }
        break;
      }
      case 'swords': {
        block = false;
        const steel = mat('#8a8a92', { metal: 0.7, rough: 0.35 });
        for (let i = 0; i < 3; i++) {
          const s = new THREE.Group(); s.position.set(Math.cos(i * 2.1) * 0.18, 0, Math.sin(i * 2.1) * 0.18); s.rotation.set((Math.random() - 0.5) * 0.4, Math.random() * 3, (Math.random() - 0.5) * 0.4); g.add(s);
          mesh(box(0.04, 0.5, 0.01), steel, 0, 0.2, 0, s); mesh(box(0.16, 0.025, 0.03), mat('#5a4a32'), 0, 0.46, 0, s); mesh(cyl(0.015, 0.015, 0.1, 5), mat('#3a2414'), 0, 0.53, 0, s);
        }
        break;
      }
      case 'flagpole': {
        const p = glP(Math.random() < 0.5 ? 'm:flag_red' : 'm:flag_blue', 1.0, { tint: '#a8988a' });
        if (p) { p.rotation.z = 0.12; g.add(p); } else { mesh(cyl(0.03, 0.03, 1.8, 5), wood, 0, 0.9, 0, g); const f = mesh(box(0.5, 0.35, 0.01), mat('#7a1a1a'), 0.26, 1.55, 0, g); f.rotation.y = 0.2; }
        break;
      }
      case 'stakes': { const [sg, sm] = custom('stakes'); const m = new THREE.Mesh(sg, sm); m.castShadow = true; m.receiveShadow = true; m.scale.setScalar(0.8); g.add(m); break; }
      case 'crow': {
        block = false;
        const black = mat('#141418');
        mesh(sph(0.06, 7, 5), black, 0, 0.08, 0, g).scale.set(1, 0.9, 1.5); mesh(sph(0.04, 6, 5), black, 0, 0.14, 0.07, g);
        mesh(cone(0.015, 0.06, 4), mat('#3a3a30'), 0, 0.14, 0.12, g).rotation.x = Math.PI / 2; mesh(box(0.06, 0.01, 0.08), black, 0, 0.08, -0.09, g);
        break;
      }
      // ---- ciudad en llamas e infierno ----
      case 'fire': {
        for (let i = 0; i < 4; i++) mesh(box(0.55, 0.08, 0.08), mat('#2a1a10'), 0, 0.05 + (i % 2) * 0.06, 0, g).rotation.y = i * 0.8;
        for (let i = 0; i < 5; i++) MODELS.flame(g, Math.cos(i * 1.3) * 0.14, 0.1, Math.sin(i * 1.3) * 0.14, 1.8 + (i % 2) * 0.6);
        light = { color: '#ff7a2a', intensity: 2.6, dist: 6.5, y: 0.8 };
        break;
      }
      case 'ash': return null; // se pinta en el suelo
      case 'firepit': {
        const blk = mat('#1a1010');
        for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; mesh(geo('pitrock', () => new THREE.DodecahedronGeometry(0.1)), blk, Math.cos(a) * 0.3, 0.07, Math.sin(a) * 0.3, g); }
        mesh(cyl(0.26, 0.26, 0.03, 10), mat('#ff5a1a', { emissive: '#ff3a00', ei: 2 }), 0, 0.03, 0, g);
        for (let i = 0; i < 5; i++) MODELS.flame(g, Math.cos(i * 1.3) * 0.12, 0.05, Math.sin(i * 1.3) * 0.12, 2 + (i % 2) * 0.6);
        light = { color: '#ff5a1a', intensity: 2.6, dist: 6.5, y: 0.8 };
        break;
      }
      case 'spikes': {
        const blk = mat('#2a1414', { rough: 0.5 }), bone = mat('#d8ccb0');
        for (let i = 0; i < 6; i++) { const a = i * 1.05, r = 0.1 + (i % 3) * 0.08; const s = mesh(cone(0.06, 0.6 + (i % 3) * 0.25, 5), i % 2 ? blk : bone, Math.cos(a) * r, 0.3, Math.sin(a) * r, g); s.rotation.set(Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25); }
        mesh(sph(0.07, 6, 5), bone, 0.02, 0.85, 0, g);
        break;
      }
      case 'skullpile': for (let i = 0; i < 7; i++) { const a = i * 0.9, r = i ? 0.12 : 0; mesh(sph(0.065, 6, 5), mat('#d8ccb0'), Math.cos(a) * r, 0.06 + (i ? 0 : 0.08), Math.sin(a) * r, g); } block = false; break;
      default: return null;
    }
    return { obj: g, light, wall, block };
  }
  const baseProp = MODELS.prop;
  MODELS.prop = (k, theme) => newProp(k, theme) || baseProp(k, theme);

  // ---------- Lo que se pinta en el suelo: alfombra de la nave y ceniza ----------
  PLACES.paint = (g, p, X, Y, px, map) => {
    if (p.k === 'carpet') {
      const up = map.props.some((q) => q.k === 'carpet' && q.x === p.x && q.y === p.y - 1), dn = map.props.some((q) => q.k === 'carpet' && q.x === p.x && q.y === p.y + 1);
      g.fillStyle = '#7a1414'; g.fillRect(X + 4, Y + (up ? 0 : 3), px - 8, px - (up ? 0 : 3) - (dn ? 0 : 3));
      g.fillStyle = '#c8a040'; g.fillRect(X + 6, Y + (up ? 0 : 5), 2, px - (up ? 0 : 5) - (dn ? 0 : 5)); g.fillRect(X + px - 8, Y + (up ? 0 : 5), 2, px - (up ? 0 : 5) - (dn ? 0 : 5));
      if (!up) g.fillRect(X + 6, Y + 5, px - 12, 2); if (!dn) g.fillRect(X + 6, Y + px - 7, px - 12, 2);
      g.fillStyle = 'rgba(200,160,64,.35)'; g.beginPath(); g.moveTo(X + px / 2, Y + 8); g.lineTo(X + px - 12, Y + px / 2); g.lineTo(X + px / 2, Y + px - 8); g.lineTo(X + 12, Y + px / 2); g.fill();
    }
    if (p.k === 'ash') { g.fillStyle = 'rgba(30,26,24,.6)'; g.beginPath(); g.ellipse(X + px / 2, Y + px / 2, px * 0.45, px * 0.3, rand(p.x * 3 + p.y) * 3, 0, 7); g.fill(); g.fillStyle = 'rgba(160,150,140,.25)'; for (let i = 0; i < 5; i++) g.fillRect(X + rand(p.x + i) * px, Y + rand(p.y + i * 2) * px, 3, 2); }
  };

  // ---------- Murales de la catedral y la tumba ----------
  MODELS.MURALS.catedral = (g, ink) => { // obispo con mitra bendiciendo a fieles con cara de calavera
    ink('#e8d8a0'); g.beginPath(); g.moveTo(128, 20); g.lineTo(112, 52); g.lineTo(144, 52); g.fill();
    ink('#6a2a6a'); g.beginPath(); g.moveTo(128, 52); g.lineTo(100, 150); g.lineTo(156, 150); g.fill();
    ink('#e8c8a0'); g.beginPath(); g.arc(128, 62, 10, 0, 7); g.fill();
    ink('#c8a040'); g.fillRect(150, 30, 4, 110); g.beginPath(); g.arc(152, 28, 8, Math.PI, 0); g.stroke();
    for (const x of [40, 70, 186, 216]) { ink('#4a4a5a'); g.fillRect(x - 10, 120, 20, 40); ink('#e8e0d0'); g.beginPath(); g.arc(x, 112, 9, 0, 7); g.fill(); ink('#1a1a1a'); g.fillRect(x - 5, 110, 3, 3); g.fillRect(x + 2, 110, 3, 3); }
  };
  MODELS.MURALS.tumba = (g, ink) => { // faraón con cabeza de chacal y un sol negro, esclavos de rodillas
    ink('#1a1a1a'); g.beginPath(); g.arc(128, 36, 22, 0, 7); g.fill(); ink('#c8a040'); g.lineWidth = 3; g.beginPath(); g.arc(128, 36, 25, 0, 7); g.stroke();
    ink('#2a2a3a'); g.fillRect(118, 70, 20, 60); g.beginPath(); g.moveTo(128, 60); g.lineTo(146, 70); g.lineTo(122, 74); g.fill();
    g.beginPath(); g.moveTo(122, 62); g.lineTo(118, 46); g.lineTo(126, 60); g.fill(); g.beginPath(); g.moveTo(130, 60); g.lineTo(132, 44); g.lineTo(136, 60); g.fill();
    ink('#c8a040'); g.fillRect(114, 84, 28, 6);
    for (const x of [40, 70, 186, 216]) { ink('#8a4a2a'); g.beginPath(); g.ellipse(x, 150, 14, 9, 0, 0, 7); g.fill(); g.beginPath(); g.arc(x + 12, 142, 6, 0, 7); g.fill(); }
  };
})();
