/* global THREE, MODELS, DUNGEON, RULES */
// Motor 3D (Three.js): un único renderizador WebGL con sombras suaves y luces dinámicas, una cámara cenital
// inclinada que sigue al héroe, y la construcción de las mazmorras y el mundo abierto a partir de las casillas.
(function (root) {
  'use strict';
  const M = () => root.MODELS;

  // ======================================================================
  //  Renderizador compartido
  // ======================================================================
  const canvas = document.getElementById('gl');
  let renderer = null;
  function getRenderer() {
    if (renderer) return renderer;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, innerWidth <= 820 ? 1.5 : 1.75));
    renderer.setSize(innerWidth, innerHeight, false);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    window.addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight, false); for (const s of stages) s.resize(); });
    return renderer;
  }
  const stages = [];

  // Escenario: escena + cámara + reserva de luces (las fuentes más cercanas a la cámara se encienden)
  function makeStage(o = {}) {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(o.fov || 38, innerWidth / innerHeight, 0.1, 200);
    const hemi = new THREE.HemisphereLight(o.sky || '#4a5a8a', o.ground || '#1a1010', o.ambient !== undefined ? o.ambient : 0.35);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(o.sunColor || '#8a9ad8', o.sun || 0);
    sun.castShadow = !!o.sun;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -14; sun.shadow.camera.right = 14; sun.shadow.camera.top = 14; sun.shadow.camera.bottom = -14;
    sun.shadow.bias = -0.0008;
    scene.add(sun); scene.add(sun.target);
    const POOL = o.lights || 10;
    const pool = [];
    for (let i = 0; i < POOL; i++) {
      const L = new THREE.PointLight('#ffaa66', 0, 6, 1.6);
      scene.add(L);
      pool.push(L);
    }
    // el farol del héroe: un foco desde arriba que proyecta las sombras (una sola pasada, barato)
    const spot = new THREE.SpotLight('#ffd8a8', 0, 14, 0.95, 0.65, 1.2);
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    spot.shadow.bias = -0.0015;
    spot.shadow.camera.near = 0.5; spot.shadow.camera.far = 16;
    scene.add(spot); scene.add(spot.target);
    const stage = {
      scene, camera, hemi, sun, pool, spot, target: new THREE.Vector3(), offset: new THREE.Vector3(...(o.offset || [0, 9.5, 7.2])),
      resize() { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); },
      lookAt(x, z, y = 0) {
        stage.target.set(x, y, z);
        camera.position.copy(stage.target).add(stage.offset);
        camera.lookAt(stage.target);
        if (o.sun) { sun.position.set(x - 6, 14, z + 4); sun.target.position.set(x, 0, z); }
      },
      // sources: [{ x, y, z, color, intensity, dist, shadow }]
      setLights(sources) {
        const t = stage.target;
        const sh = sources.find((s) => s.shadow);
        if (sh) {
          spot.position.set(sh.x - 0.6, sh.y + 4.5, sh.z + 1.6);
          spot.target.position.set(sh.x, 0, sh.z);
          spot.color.set(sh.color); spot.intensity = sh.intensity; spot.distance = sh.dist + 6;
        } else spot.intensity = 0;
        sources = sources.filter((s) => s !== sh);
        const sorted = sources.map((s) => ({ s, d: (s.x - t.x) ** 2 + (s.z - t.z) ** 2 - (s.shadow ? 1e6 : 0) })).sort((a, b) => a.d - b.d);
        for (let i = 0; i < pool.length; i++) {
          const L = pool[i], it = sorted[i];
          if (!it) { L.intensity = 0; continue; }
          const s = it.s;
          L.position.set(s.x, s.y, s.z);
          L.color.set(s.color);
          L.intensity = s.intensity;
          L.distance = s.dist;
        }
      },
      render() { getRenderer().render(scene, camera); },
      project(x, y, z) {
        const v = new THREE.Vector3(x, y, z).project(camera);
        return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight, behind: v.z > 1 };
      },
      // punto del suelo (plano y=h) bajo el ratón
      pick(cx, cy, h = 0) {
        const ray = new THREE.Raycaster();
        ray.setFromCamera(new THREE.Vector2(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1), camera);
        const p = new THREE.Vector3();
        return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -h), p) ? p : null;
      },
    };
    stages.push(stage);
    stage.resize();
    return stage;
  }

  function show(on) { canvas.classList.toggle('hidden', !on); }

  // ======================================================================
  //  Mazmorras y mundo abierto
  // ======================================================================
  const WALL_H = 1.3;
  const THEME = {
    cripta: { floor: ['#4a4c56', '#40424c'], seam: '#2a2b32', wall: '#565862', top: '#141418', fog: '#06060a', liquid: '#1a3a4a', sky: '#5a6aa0' },
    cuevas: { floor: ['#5a4a38', '#4e4030'], seam: '#3a2e22', wall: '#5e4c3a', top: '#16110c', fog: '#080604', liquid: '#1e3a5a', sky: '#8a7a5a' },
    fortaleza: { floor: ['#504640', '#5a4a36'], seam: '#2e2622', wall: '#625852', top: '#151212', fog: '#080606', liquid: '#1e3a5a', sky: '#8a6a5a' },
    nido: { floor: ['#36402e', '#3c4632'], seam: '#222a1c', wall: '#44523a', top: '#0e120c', fog: '#040604', liquid: '#2a3a1a', sky: '#5a7a4a' },
    volcan: { floor: ['#2e2628', '#342a2c'], seam: '#1a1214', wall: '#463434', top: '#100a0a', fog: '#0a0404', liquid: '#c8400a', sky: '#a04a2a' },
  };
  // Color de cada casilla del mundo (la textura del suelo se pinta con estos colores y algo de ruido)
  const WORLD_COLORS = {
    ',': '#4a6a32', ';': '#3e5e2a', T: '#2e4a22', P: '#26402a', w: '#1a3050', v: '#2a4a6a', s: '#8a7a52', h: '#4a6a3a', M: '#5a5a62', '=': '#7a6040', b: '#6a4a2a',
    g: '#3a342e', t: '#3a342e', R: '#4a4a4e', F: '#4a3a2a', C: '#3a3a40', H: '#7a6040', k: '#4a6a32', D: '#3a2222', f: '#6a5a2a', x: '#4a6a32', u: '#6a6258',
    m: '#4a4a2e', q: '#24301e', y: '#3a3a26', r: '#4e5a2e', d: '#a8643a', z: '#8a5a3a', o: '#8a5a3a', c: '#a8643a', n: '#d8e0e8', i: '#a8c8e0', p: '#c8d4e0',
    a: '#4a3e3c', e: '#3a3030', l: '#c8400a', W: '#6a6258',
  };
  const WATER = new Set(['w', 'q', '~', 'l', '%', 'v']);
  const rand = (seed) => { const s = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

  function floorTexture(map, theme) {
    const world = map.kind === 'world';
    const px = world ? 8 : 32;
    const c = document.createElement('canvas');
    c.width = map.w * px; c.height = map.h * px;
    const g = c.getContext('2d');
    const T = THEME[theme] || THEME.cripta;
    for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
      const ch = map.tiles[y * map.w + x];
      const X = x * px, Y = y * px;
      if (world) {
        g.fillStyle = WORLD_COLORS[ch] || '#4a6a32';
        g.fillRect(X, Y, px, px);
        const n = rand(x * 13.1 + y * 7.7);
        g.fillStyle = n > 0.5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.08)';
        g.fillRect(X + (n * 4 | 0), Y + ((1 - n) * 4 | 0), px / 2, px / 2);
        continue;
      }
      if (ch === '#') { g.fillStyle = T.top; g.fillRect(X, Y, px, px); continue; }
      if (ch === '~' || ch === '%') { g.fillStyle = ch === '%' ? '#3a1408' : '#0e1a22'; g.fillRect(X, Y, px, px); continue; }
      const v = Math.floor(rand(x * 13 + y * 7) * 2);
      g.fillStyle = T.floor[v];
      g.fillRect(X, Y, px, px);
      // ruido y losas
      for (let i = 0; i < 14; i++) { const r = rand(x * 31 + y * 17 + i); g.fillStyle = r > 0.5 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.07)'; g.fillRect(X + rand(i + x) * px, Y + rand(i * 3 + y) * px, 3 + r * 5, 3 + r * 4); }
      g.fillStyle = T.seam;
      if (theme === 'cuevas' || theme === 'nido') { if (v) g.fillRect(X + 6, Y + 20, 10, 2); }
      else {
        // losas grandes (de dos casillas) desalineadas por filas, con juntas suaves
        g.globalAlpha = 0.55;
        if (y % 2 === 0) g.fillRect(X, Y, px, 1.5);
        if ((x + (y >> 1)) % 2 === 0) g.fillRect(X, Y, 1.5, px);
        if (rand(x * 5 + y * 11) > 0.8) { g.fillRect(X + px * 0.3, Y + px * 0.4, px * 0.4, 1); g.fillRect(X + px * 0.6, Y + px * 0.4, 1, px * 0.3); }
        g.globalAlpha = 1;
      }
      if (ch === '+') { g.fillStyle = '#4a3020'; g.fillRect(X + 4, Y + 2, px - 8, px - 4); g.fillStyle = '#2a1a10'; for (let i = 1; i < 4; i++) g.fillRect(X + 4 + i * (px - 8) / 4, Y + 2, 1.5, px - 4); }
      if (ch === '^') { g.fillStyle = '#1e1a20'; g.fillRect(X + 4, Y + 4, px - 8, px - 8); }
    }
    // decorado plano (sangre, telarañas, alfombras, charcos) pintado en el suelo
    for (const p of map.props || []) {
      const X = p.x * px, Y = p.y * px;
      if (p.k === 'blood') { g.fillStyle = 'rgba(90,10,10,.75)'; g.beginPath(); g.ellipse(X + px / 2, Y + px / 2, px * 0.32, px * 0.22, rand(p.x) * 3, 0, 7); g.fill(); }
      if (p.k === 'rug') { g.fillStyle = '#6a1a1a'; g.fillRect(X + 2, Y + 4, px - 4, px - 8); g.strokeStyle = '#c8a040'; g.lineWidth = 2; g.strokeRect(X + 4, Y + 6, px - 8, px - 12); }
      if (p.k === 'puddle') { g.fillStyle = 'rgba(30,50,70,.7)'; g.beginPath(); g.ellipse(X + px / 2, Y + px / 2, px * 0.35, px * 0.22, 0, 0, 7); g.fill(); }
      if (p.k === 'web') { g.strokeStyle = 'rgba(220,220,230,.45)'; g.lineWidth = 1; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(X + px / 2, Y + px / 2); g.lineTo(X + px / 2 + Math.cos(i) * px / 2, Y + px / 2 + Math.sin(i) * px / 2); g.stroke(); } for (const r of [5, 10, 14]) { g.beginPath(); g.arc(X + px / 2, Y + px / 2, r, 0, 7); g.stroke(); } }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = 4;
    tex.magFilter = THREE.LinearFilter;
    return tex;
  }

  // Instancias: una malla con muchas copias (árboles, rocas, muros…)
  function instanced(geometry, material, list, opts = {}) {
    const im = new THREE.InstancedMesh(geometry, material, Math.max(1, list.length));
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
    list.forEach((it, i) => {
      p.set(it.x, it.y || 0, it.z);
      e.set(0, it.r || 0, 0); q.setFromEuler(e);
      s.set(it.sx || it.s || 1, it.sy || it.s || 1, it.sz || it.s || 1);
      m4.compose(p, q, s);
      im.setMatrixAt(i, m4);
    });
    im.count = list.length;
    im.castShadow = opts.shadow !== false; im.receiveShadow = true;
    return im;
  }

  // Construye todo lo fijo del mapa. Devuelve { group, lights, walls (actualizable con lo explorado) }
  function buildMap(map) {
    const mm = M();
    const group = new THREE.Group();
    const world = map.kind === 'world';
    const theme = map.theme || 'cripta';
    const T = THEME[theme] || THEME.cripta;
    const lights = [];
    // suelo
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(map.w, map.h), new THREE.MeshStandardMaterial({ map: floorTexture(map, theme), roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(map.w / 2, 0, map.h / 2);
    floor.receiveShadow = true;
    group.add(floor);
    // agua, ciénaga y lava
    const liquids = { water: [], lava: [], bog: [] };
    for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
      const ch = map.tiles[y * map.w + x];
      if (!WATER.has(ch)) continue;
      (ch === 'l' || ch === '%' ? liquids.lava : ch === 'q' ? liquids.bog : liquids.water).push({ x: x + 0.5, z: y + 0.5, y: 0.02 });
    }
    const quad = new THREE.PlaneGeometry(1, 1); quad.rotateX(-Math.PI / 2);
    if (liquids.water.length) group.add(instanced(quad, new THREE.MeshStandardMaterial({ color: world ? '#2a5a8a' : T.liquid, transparent: true, opacity: 0.78, roughness: 0.15, metalness: 0.3 }), liquids.water, { shadow: false }));
    if (liquids.bog.length) group.add(instanced(quad, new THREE.MeshStandardMaterial({ color: '#3a4a26', transparent: true, opacity: 0.85, roughness: 0.3 }), liquids.bog, { shadow: false }));
    if (liquids.lava.length) {
      const lava = instanced(quad, new THREE.MeshStandardMaterial({ color: '#ff5a10', emissive: '#ff3a00', emissiveIntensity: 1.3, roughness: 0.6 }), liquids.lava, { shadow: false });
      lava.userData.lava = true;
      group.add(lava);
      liquids.lava.forEach((l, i) => { if (i % 6 === 0) lights.push({ x: l.x, y: 0.6, z: l.z, color: '#ff5a1a', intensity: 1.2, dist: 4 }); });
    }
    const out = { group, lights, floor };
    if (!world) {
      // muros: sólo los que tocan suelo; se enseñan al explorarlos
      const walls = [];
      const walk = (x, y) => x >= 0 && y >= 0 && x < map.w && y < map.h && map.tiles[y * map.w + x] !== '#';
      for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
        if (map.tiles[y * map.w + x] !== '#') continue;
        let near = false;
        for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (walk(x + dx, y + dy)) { near = true; break; }
        if (near) walls.push({ x: x + 0.5, z: y + 0.5, y: WALL_H / 2, sy: WALL_H, tile: y * map.w + x, r: 0 });
      }
      const wallGeo = new THREE.BoxGeometry(1, 1, 1);
      const wallMat = new THREE.MeshStandardMaterial({ color: T.wall, roughness: 0.92, flatShading: true });
      const topMat = new THREE.MeshStandardMaterial({ color: T.top, roughness: 1 });
      // caras con textura de sillares
      const wc = document.createElement('canvas'); wc.width = 64; wc.height = 96;
      const wg2 = wc.getContext('2d');
      wg2.fillStyle = T.wall; wg2.fillRect(0, 0, 64, 96);
      for (let r = 0; r < 6; r++) { wg2.fillStyle = 'rgba(0,0,0,.35)'; wg2.fillRect(0, r * 16, 64, 2); for (let i = (r % 2) * 16; i < 64; i += 32) wg2.fillRect(i, r * 16, 2, 16); wg2.fillStyle = 'rgba(255,255,255,.06)'; wg2.fillRect(0, r * 16 + 2, 64, 2); }
      for (let i = 0; i < 60; i++) { wg2.fillStyle = `rgba(0,0,0,${0.05 + rand(i) * 0.1})`; wg2.fillRect(rand(i * 3) * 64, rand(i * 7) * 96, 3, 3); }
      const faceTex = new THREE.CanvasTexture(wc); faceTex.encoding = THREE.sRGBEncoding;
      const faceMat = new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.9 });
      const mats = [faceMat, faceMat, topMat, topMat, faceMat, faceMat];
      const wallMesh = new THREE.InstancedMesh(wallGeo, mats, walls.length);
      void wallMat;
      wallMesh.castShadow = true; wallMesh.receiveShadow = true;
      group.add(wallMesh);
      out.walls = { mesh: wallMesh, list: walls, shown: -1 };
      // los muros entre la cámara y el héroe se bajan para no taparlo
      out.updateWalls = (seen, hx, hz) => {
        let n = 0;
        const m4 = new THREE.Matrix4();
        for (const w of walls) {
          if (!seen[w.tile] && !seenNear(seen, map, w.tile)) continue;
          const cut = hx !== undefined && w.z > hz && w.z - hz < 7 && Math.abs(w.x - hx) < 7;
          const h = cut ? 0.35 : WALL_H;
          m4.makeScale(1, h, 1); m4.setPosition(w.x, h / 2, w.z);
          wallMesh.setMatrixAt(n++, m4);
        }
        wallMesh.count = n;
        wallMesh.instanceMatrix.needsUpdate = true;
      };
      // decorado con modelos
      out.props = [];
      for (const p of map.props || []) {
        const pr = mm.prop(p.k, theme);
        if (!pr) continue;
        const o = pr.obj;
        if (pr.wall) { o.position.set(p.x + 0.5, 0, p.y + 1); }
        else { o.position.set(p.x + 0.5, 0, p.y + 0.5); o.rotation.y = rand(p.x * 3 + p.y) * Math.PI * 2; }
        o.visible = false;
        group.add(o);
        out.props.push({ o, tile: (pr.wall ? p.y + 1 : p.y) * map.w + p.x, light: pr.light ? { x: p.x + 0.5, y: pr.light.y, z: (pr.wall ? p.y + 1 : p.y + 0.5) + (pr.light.z || 0), color: pr.light.color, intensity: pr.light.intensity, dist: pr.light.dist } : null });
      }
      return out;
    }
    // ---------- mundo: árboles, rocas, montañas, casas… ----------
    const lists = {};
    const add = (k, it) => (lists[k] = lists[k] || []).push(it);
    for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
      const ch = map.tiles[y * map.w + x];
      const r = rand(x * 7.3 + y * 3.1), cx = x + 0.5 + (r - 0.5) * 0.3, cz = y + 0.5 + (rand(y * 5 + x) - 0.5) * 0.3;
      const s = 0.8 + r * 0.5;
      switch (ch) {
        case 'T': add('trunk', { x: cx, z: cz, y: 0.3, s }); add('leaf', { x: cx, z: cz, y: 0.95 * s, s, r: r * 6 }); break;
        case 'P': add('trunk', { x: cx, z: cz, y: 0.3, s }); add('pine', { x: cx, z: cz, y: 1.0 * s, s }); break;
        case 'y': add('deadtree', { x: cx, z: cz, y: 0.55 * s, s, r: r * 6 }); break;
        case 'p': add('trunk', { x: cx, z: cz, y: 0.3, s }); add('snowpine', { x: cx, z: cz, y: 1.0 * s, s }); break;
        case 'M': add('mount', { x: x + 0.5, z: y + 0.5, y: 0.6 + r * 0.6, s: 1.2 + r * 0.8, sy: 1.4 + r * 1.6, r: r * 6 }); break;
        case 'o': case 'e': add(ch === 'e' ? 'basalt' : 'rock', { x: cx, z: cz, y: 0.2, s: 0.7 + r * 0.6, r: r * 6 }); break;
        case 'c': add('cactus', { x: cx, z: cz, y: 0.45, s }); break;
        case 'k': add('house', { x: x + 0.5, z: y + 0.5, y: 0.45, r: Math.round(r * 4) * Math.PI / 2 }); add('roof', { x: x + 0.5, z: y + 0.5, y: 1.15, r: Math.PI / 4 }); break;
        case 'R': add('ruin', { x: x + 0.5, z: y + 0.5, y: 0.5 + r * 0.3, sy: 0.6 + r * 0.8 }); break;
        case 't': add('tomb', { x: cx, z: cz, y: 0.3 }); break;
        case 'x': add('fence', { x: x + 0.5, z: y + 0.5, y: 0.25, r: (map.tiles[y * map.w + x + 1] === 'x' || map.tiles[y * map.w + x - 1] === 'x') ? 0 : Math.PI / 2 }); break;
        case 'f': if ((x + y) % 2 === 0) add('crop', { x: cx, z: cz, y: 0.15, s }); break;
        case ';': if (r > 0.55) add('grass', { x: cx, z: cz, y: 0.08, s, r: r * 6 }); break;
        case 'r': add('reed', { x: cx, z: cz, y: 0.2, s }); break;
        case 'F': lights.push({ x: x + 0.5, y: 0.7, z: y + 0.5, color: '#ff8a2a', intensity: 2, dist: 6 }); add('fire', { x: x + 0.5, z: y + 0.5, y: 0.15 }); break;
        case 'H': add('tavern', { x: x + 0.5, z: y + 0.3, y: 0.8 }); add('troof', { x: x + 0.5, z: y + 0.3, y: 2.0, r: Math.PI / 4 }); lights.push({ x: x + 0.5, y: 1, z: y + 1.3, color: '#ffc070', intensity: 2.2, dist: 7 }); break;
        case 'C': add('cave', { x: x + 0.5, z: y + 0.3, y: 0.55, r: 0 }); break;
        case 'W': add('waystone', { x: x + 0.5, z: y + 0.5, y: 0.55 }); lights.push({ x: x + 0.5, y: 1.2, z: y + 0.5, color: '#7ad0ff', intensity: 1.6, dist: 5 }); break;
        case 'D': add('skull', { x: x + 0.5, z: y + 0.5, y: 0.25, s: 2.2 }); break;
      }
    }
    const G = {
      trunk: [new THREE.CylinderGeometry(0.06, 0.09, 0.6, 5), mm.mat('#4a2e1a')],
      leaf: [new THREE.DodecahedronGeometry(0.48), mm.mat('#2e5a26')],
      pine: [new THREE.ConeGeometry(0.42, 1.3, 6), mm.mat('#1e4026')],
      snowpine: [new THREE.ConeGeometry(0.42, 1.3, 6), mm.mat('#c8d8e0')],
      deadtree: [new THREE.CylinderGeometry(0.04, 0.1, 1.1, 4), mm.mat('#3a3020')],
      mount: [new THREE.ConeGeometry(0.7, 1, 5), mm.mat('#5a5a62')],
      rock: [new THREE.DodecahedronGeometry(0.28), mm.mat('#7a6a5a')],
      basalt: [new THREE.DodecahedronGeometry(0.3), mm.mat('#2a2222')],
      cactus: [new THREE.CylinderGeometry(0.1, 0.12, 0.9, 6), mm.mat('#3a7a3a')],
      house: [new THREE.BoxGeometry(0.9, 0.9, 0.9), mm.mat('#8a7050')],
      roof: [new THREE.ConeGeometry(0.85, 0.6, 4), mm.mat('#6a2a1a')],
      ruin: [new THREE.BoxGeometry(0.45, 1, 0.45), mm.mat('#6a6a6e')],
      tomb: [new THREE.BoxGeometry(0.35, 0.6, 0.12), mm.mat('#7a7a82')],
      fence: [new THREE.BoxGeometry(1, 0.08, 0.06), mm.mat('#6a4a2a')],
      crop: [new THREE.ConeGeometry(0.08, 0.3, 4), mm.mat('#c8a840')],
      grass: [new THREE.ConeGeometry(0.06, 0.16, 3), mm.mat('#4e7a32')],
      reed: [new THREE.CylinderGeometry(0.015, 0.015, 0.4, 3), mm.mat('#7a7a3a')],
      fire: [new THREE.ConeGeometry(0.16, 0.35, 5), mm.mat('#ffb040', { emissive: '#ff7a10', ei: 2 })],
      tavern: [new THREE.BoxGeometry(1.8, 1.6, 1.2), mm.mat('#8a6a48')],
      troof: [new THREE.ConeGeometry(1.5, 0.9, 4), mm.mat('#5a2416')],
      cave: [new THREE.CylinderGeometry(0.6, 0.6, 1.1, 8, 1, false, Math.PI * 0.5, Math.PI), mm.mat('#141016', { side: true })],
      waystone: [new THREE.BoxGeometry(0.35, 1.1, 0.25), mm.mat('#7a8a9a', { emissive: '#2a6aaa', ei: 0.7 })],
      skull: [new THREE.SphereGeometry(0.12, 6, 5), mm.mat('#d8d0b8')],
    };
    out.instances = [];
    for (const [k, list] of Object.entries(lists)) {
      const [gg, mmat] = G[k];
      const im = instanced(gg, mmat, list, { shadow: !['grass', 'reed', 'crop', 'fire'].includes(k) });
      im.userData.list = list;
      group.add(im);
      out.instances.push(im);
    }
    // ventanas encendidas de la taberna del pueblo
    return out;
  }

  // ¿Alguna casilla vecina vista? (para enseñar los muros que rodean lo explorado)
  function seenNear(seen, map, i) {
    const x = i % map.w, y = (i / map.w) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < map.w && ny < map.h && seen[ny * map.w + nx]) return true;
    }
    return false;
  }

  // Niebla de lo no explorado: una textura de 1 píxel por casilla, suavizada, encima del suelo
  function fogLayer(map) {
    const c = document.createElement('canvas');
    c.width = map.w; c.height = map.h;
    const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, map.w, map.h);
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(map.w, map.h), new THREE.MeshBasicMaterial({ color: '#000', alphaMap: tex, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(map.w / 2, 0.04, map.h / 2);
    m.renderOrder = 5;
    const img = g.createImageData(map.w, map.h);
    return {
      mesh: m,
      update(seen, vis) {
        for (let i = 0; i < map.w * map.h; i++) {
          const a = !seen[i] ? 255 : vis[i] ? 0 : 120;
          img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = a; img.data[i * 4 + 3] = 255;
        }
        g.putImageData(img, 0, 0);
        tex.needsUpdate = true;
      },
    };
  }

  root.VIEW3D = { makeStage, show, getRenderer, buildMap, fogLayer, THEME, WALL_H };
})(this);
