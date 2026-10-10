// Armas y escudos que se ven en la mano: cada tipo (espada, daga, hacha, maza, mandoble, martillo, lanza,
// arco, ballesta, bastón, varita, escudo, orbe) tiene un modelo distinto para cada nivel (normal, excepcional,
// élite). La rareza cambia los adornos: mágico azul, raro dorado, único todo dorado y brillante, conjunto en
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

  // ======================================================================
  function build(base, tier = 0, rarity, o = {}) {
    const THREE = T();
    const g = new THREE.Group();
    const t = Math.max(0, Math.min(2, tier || 0));
    const accent = o.setColor && rarity === 'conjunto' ? o.setColor : null;
    const steel = mat('metal', t === 2 && base !== 'espada' ? COL.dark : COL.steel, rarity);
    const steelL = mat('metal', COL.steel, rarity);
    const trim = mat('trim', accent || (t ? COL.gold : COL.bronze), rarity);
    const wood = mat('wood', t === 2 ? COL.woodD : COL.wood), leather = mat('leather', COL.leather), bone = mat('bone', COL.bone);
    const glowC = RAR[rarity] || (t === 2 ? '#7ad0ff' : null);
    const glow = glowC ? mat('glow', glowC) : null;
    const gem = mat('glow', RAR[rarity] || (t === 2 ? '#d8102a' : '#4a7aff'));
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
        add(g, box(0.05, 0.05, 0.44), t === 2 ? mat('metal', COL.dark) : wood, 0, 0.1, 0.12);
        add(g, box(0.04, 0.12, 0.05), wood, 0, 0.04, -0.06);
        const prod = (z, w) => { add(g, torus(w, 0.014, Math.PI * 0.7, 16), t === 2 ? steel : steelL, 0, 0.1, z + w * 0.4, Math.PI / 2, 0, Math.PI * 0.15 + Math.PI); add(g, cyl(0.002, 0.002, w * 1.6, 3), mat('leather', '#e0d8c8'), 0, 0.1, z - 0.02, 0, 0, Math.PI / 2); };
        prod(0.3, t ? 0.26 : 0.21);
        if (t === 2) prod(0.22, 0.22);
        if (t >= 1) { add(g, cyl(0.02, 0.02, 0.08), trim, 0.04, 0.1, -0.02, 0, 0, Math.PI / 2); add(g, torus(0.03, 0.006), trim, 0.08, 0.1, -0.02, 0, Math.PI / 2); }
        add(g, cyl(0.005, 0.005, 0.3, 4), mat('wood', COL.woodD), 0, 0.13, 0.18, Math.PI / 2);
        add(g, cone(0.012, 0.03, 4), glow || steelL, 0, 0.13, 0.34, Math.PI / 2);
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
        const face = mat('wood', o.set === 'paladin' || o.set === 'sacerdote' ? '#e8e0c8' : t === 0 ? COL.wood : t === 1 ? '#7a2222' : '#24357a');
        if (t === 0) { add(g, cyl(0.2, 0.2, 0.035, 20), face, 0, 0, 0, Math.PI / 2); for (let i = -2; i <= 2; i++) add(g, box(0.004, 0.36, 0.038), mat('wood', COL.woodD), i * 0.075, 0, 0); add(g, torus(0.2, 0.016, Math.PI * 2, 28), steelL); add(g, sph(0.05, 14, 10), steelL, 0, 0, 0.02, 0, 0, 0, 1, 1, 0.6); }
        if (t === 1) { const sh = [[0, 0.22], [0.17, 0.2], [0.18, 0.02], [0.12, -0.14], [0, -0.24], [-0.12, -0.14], [-0.18, 0.02], [-0.17, 0.2]]; add(g, extrude('heater', sh, 0.03, 0.01), face); add(g, extrude('heaterRim', sh.map(([x, y]) => [x * 1.08, y * 1.06 - 0.003]), 0.02, 0.006), steelL, 0, 0, -0.012); add(g, box(0.04, 0.36, 0.008), trim, 0, 0, 0.022); add(g, box(0.26, 0.04, 0.008), trim, 0, 0.06, 0.022); add(g, oct(0.025), gem, 0, 0.06, 0.03); }
        if (t === 2) { const sh = [[0, 0.32], [0.16, 0.3], [0.17, -0.2], [0, -0.32], [-0.17, -0.2], [-0.16, 0.3]]; add(g, extrude('tower', sh, 0.035, 0.012), face); add(g, extrude('towerRim', sh.map(([x, y]) => [x * 1.07, y * 1.05]), 0.022, 0.006), trim, 0, 0, -0.014); for (const y of [-0.15, 0.0, 0.15]) add(g, box(0.3, 0.012, 0.01), trim, 0, y, 0.024); add(g, extrude('crest', [[0, 0.09], [0.07, 0.03], [0.05, -0.08], [0, -0.1], [-0.05, -0.08], [-0.07, 0.03]], 0.012), trim, 0, 0.12, 0.03); add(g, oct(0.022), gem, 0, 0.12, 0.045); }
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
