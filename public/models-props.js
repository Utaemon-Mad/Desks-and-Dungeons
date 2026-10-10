/* global THREE, MODELS */
// Muebles de la taberna, decorado de las mazmorras, plantas, caña y jarra.
// Se carga después de models-creatures.js (el decorado usa humanoid para las estatuas).
(function () {
  'use strict';
  const { mat, mesh, box, cyl, sph, cone, weapon, GL, piece } = MODELS;
  const { geo, psph, halfSph, shade, offhand, humanoid } = MODELS._;

  const HERB_LOOK = [['#4a9a3a', '#b8ff7a'], ['#7a5a3a', '#d8b8ff'], ['#5a6a2a', '#ffb05a'], ['#5a8a3a', '#ff7aa0'], ['#8aa0b0', '#bff0ff'], ['#3a2a2a', '#ff6a2a']];
  function herb(zone) {
    const [leaf, glow] = HERB_LOOK[zone] || HERB_LOOK[0];
    const g = new THREE.Group();
    for (let i = 0; i < 5; i++) { const l = mesh(cone(0.05, 0.28, 4), mat(leaf), Math.cos(i * 1.3) * 0.07, 0.12, Math.sin(i * 1.3) * 0.07, g); l.rotation.set(Math.sin(i) * 0.5, 0, Math.cos(i) * 0.5); }
    mesh(sph(0.045, 6, 5), mat(glow, { emissive: glow, ei: 1.6 }), 0, 0.3, 0, g);
    g.userData.glow = glow;
    return g;
  }
  // Caña de pescar (en la mano derecha)
  function rod() {
    const g = new THREE.Group();
    const c = mesh(cyl(0.008, 0.014, 0.9, 5), mat('#6a4426'), 0, 0.45, 0, g); c.castShadow = false;
    return g;
  }

  // Jarra en la mano (taberna)
  function mug() {
    const g = new THREE.Group();
    mesh(cyl(0.05, 0.045, 0.11, 7), mat('#b8b8c0', { metal: 0.6, rough: 0.4 }), 0, 0, 0, g);
    mesh(cyl(0.045, 0.045, 0.02, 7), mat('#fff6dc'), 0, 0.06, 0, g);
    return g;
  }

  // ======================================================================
  //  Muebles de la taberna y decorado de las mazmorras
  // ======================================================================
  function flame(parent, x, y, z, s = 1) {
    const f = mesh(cone(0.04 * s, 0.12 * s, 5), mat('#ffb040', { emissive: '#ff8a20', ei: 2.2 }), x, y + 0.06 * s, z, parent);
    f.castShadow = false;
    const f2 = mesh(cone(0.022 * s, 0.07 * s, 5), mat('#fff0a0', { emissive: '#ffe080', ei: 2.5 }), x, y + 0.04 * s, z, parent);
    f2.castShadow = false;
    f.userData.flame = true;
    return f;
  }
  function candle(parent, x, y, z) { mesh(cyl(0.02, 0.02, 0.1, 6), mat('#efe6cf'), x, y + 0.05, z, parent); flame(parent, x, y + 0.1, z, 0.5); }

  // Devuelve { obj, light?: { color, intensity, dist, y } }
  function furniture(type, dir) {
    if (GL.ready) { const f = furnitureGL(type, dir); if (f) return f; }
    const g = new THREE.Group();
    const wood = mat('#6a4226'), woodD = mat('#4a2c18'), woodL = mat('#8a5a32');
    let light = null;
    const rotY = { E: Math.PI / 2, S: 0, W: -Math.PI / 2, N: Math.PI }[dir || 'S'] || 0;
    switch (type) {
      case 'barrel': mesh(cyl(0.26, 0.26, 0.55, 10), wood, 0, 0.28, 0, g); for (const y of [0.1, 0.46]) mesh(cyl(0.27, 0.27, 0.04, 10), mat('#2a2a2e', { metal: 0.5 }), 0, y, 0, g); mesh(cyl(0.24, 0.24, 0.02, 10), woodD, 0, 0.56, 0, g); break;
      case 'crate': mesh(box(0.7, 0.55, 0.7), woodL, 0, 0.28, 0, g); for (const sx of [-1, 1]) mesh(box(0.06, 0.56, 0.72), woodD, sx * 0.32, 0.28, 0, g); break;
      case 'smallcrate': mesh(box(0.45, 0.38, 0.45), woodL, 0, 0.19, 0, g); mesh(box(0.47, 0.06, 0.47), woodD, 0, 0.36, 0, g); break;
      case 'table': case 'maptable':
        mesh(box(1.0, 0.07, 1.0), wood, 0, 0.5, 0, g);
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) mesh(box(0.07, 0.5, 0.07), woodD, sx * 0.4, 0.25, sz * 0.4, g);
        if (type === 'maptable') { const p = mesh(box(0.86, 0.01, 0.86), mat('#e0cc98'), 0, 0.54, 0, g); p.receiveShadow = true; mesh(box(0.3, 0.012, 0.04), mat('#4a7ab0'), 0.1, 0.55, 0.1, g); mesh(box(0.04, 0.012, 0.35), mat('#6b8a4a'), -0.15, 0.55, -0.05, g); mesh(cyl(0.03, 0.03, 0.06, 6), mat('#d8433b'), 0.2, 0.58, -0.2, g); }
        break;
      case 'roundtable': mesh(cyl(0.42, 0.42, 0.06, 12), wood, 0, 0.5, 0, g); mesh(cyl(0.06, 0.08, 0.48, 6), woodD, 0, 0.24, 0, g); mesh(cyl(0.22, 0.22, 0.04, 8), woodD, 0, 0.02, 0, g); candle(g, -0.12, 0.53, 0.05); { const m = mug(); m.position.set(0.15, 0.58, -0.05); g.add(m); } light = { color: '#ffb060', intensity: 0.8, dist: 3, y: 0.75 }; break;
      case 'bar': mesh(box(1.0, 0.85, 1.0), woodD, 0, 0.42, 0, g); mesh(box(1.04, 0.07, 1.04), woodL, 0, 0.88, 0, g); mesh(box(1.0, 0.06, 0.02), mat('#c8a040', { metal: 0.6 }), 0, 0.2, 0.51, g); break;
      case 'bookshelf': {
        const s = new THREE.Group(); g.add(s);
        mesh(box(0.95, 1.7, 0.38), woodD, 0, 0.85, -0.28, s);
        const cols = ['#8a2a2a', '#2a5a8a', '#3a7a3a', '#c09030', '#6a3a8a'];
        for (let r = 0; r < 4; r++) for (let i = 0; i < 6; i++) mesh(box(0.11, 0.3, 0.26), mat(cols[(i + r) % 5]), -0.33 + i * 0.13, 0.25 + r * 0.4, -0.22, s);
        s.rotation.y = rotY;
        break;
      }
      case 'plant': mesh(cyl(0.2, 0.15, 0.35, 8), mat('#a0522d'), 0, 0.18, 0, g); for (const [x, y, z, r] of [[0, 0.6, 0, 0.22], [-0.15, 0.48, 0.05, 0.16], [0.15, 0.5, -0.05, 0.17], [0, 0.78, 0.05, 0.14]]) mesh(sph(r, 6, 5), mat('#3f8a3a'), x, y, z, g); break;
      case 'stool': mesh(cyl(0.18, 0.18, 0.05, 8), woodL, 0, 0.42, 0, g); for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; const l = mesh(cyl(0.025, 0.025, 0.42, 4), woodD, Math.cos(a) * 0.12, 0.2, Math.sin(a) * 0.12, g); l.rotation.set(Math.sin(a) * 0.15, 0, -Math.cos(a) * 0.15); } break;
      case 'chair': {
        const c = new THREE.Group(); g.add(c);
        mesh(box(0.45, 0.06, 0.45), woodL, 0, 0.42, 0, c);
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) mesh(box(0.05, 0.42, 0.05), woodD, sx * 0.19, 0.21, sz * 0.19, c);
        mesh(box(0.45, 0.5, 0.06), wood, 0, 0.7, -0.2, c);
        c.rotation.y = rotY;
        break;
      }
      case 'sofa': { const c = new THREE.Group(); g.add(c); mesh(box(0.95, 0.35, 0.8), mat('#23407a'), 0, 0.25, 0.05, c); mesh(box(0.95, 0.5, 0.2), mat('#1c3466'), 0, 0.55, -0.32, c); c.rotation.y = rotY; break; }
      case 'fireplace': {
        mesh(box(1.0, 1.4, 0.7), mat('#5a5258'), 0, 0.7, -0.1, g);
        mesh(box(0.6, 0.6, 0.4), mat('#140a08'), 0, 0.3, 0.12, g);
        mesh(box(1.1, 0.1, 0.8), mat('#7a6a5a'), 0, 1.0, -0.05, g);
        for (let i = -1; i <= 1; i++) flame(g, i * 0.13, 0.08, 0.15, 1.6);
        mesh(box(0.5, 0.06, 0.15), mat('#3a1a0a'), 0, 0.05, 0.15, g);
        light = { color: '#ff8a3a', intensity: 2.2, dist: 6, y: 0.5, z: 0.5 };
        break;
      }
      case 'candelabra': mesh(cyl(0.14, 0.18, 0.06, 8), mat('#3a3036', { metal: 0.6 }), 0, 0.03, 0, g); mesh(cyl(0.025, 0.025, 1.1, 5), mat('#5a4e40', { metal: 0.6 }), 0, 0.58, 0, g); mesh(box(0.42, 0.03, 0.03), mat('#5a4e40', { metal: 0.6 }), 0, 1.1, 0, g); for (const x of [-0.19, 0, 0.19]) candle(g, x, x ? 1.12 : 1.16, 0); light = { color: '#ffc070', intensity: 1.2, dist: 4.5, y: 1.3 }; break;
      case 'chandelier': {
        const y = 2.2;
        mesh(cyl(0.008, 0.008, 1.2, 3), mat('#1a1414'), 0, y + 0.6, 0, g);
        mesh(geo('ring', () => new THREE.TorusGeometry(0.4, 0.03, 4, 12)), mat('#3a2e24', { metal: 0.5 }), 0, y, 0, g).rotation.x = Math.PI / 2;
        for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; candle(g, Math.cos(a) * 0.4, y, Math.sin(a) * 0.4); }
        g.userData.noShadow = true;
        light = { color: '#ffc070', intensity: 1.6, dist: 6.5, y: y - 0.1 };
        break;
      }
      case 'chest': mesh(box(0.7, 0.4, 0.5), mat('#6a3e1e'), 0, 0.2, 0, g); mesh(cyl(0.25, 0.25, 0.7, 8, 1), mat('#8a5428'), 0, 0.4, 0, g).rotation.z = Math.PI / 2; mesh(box(0.72, 0.05, 0.52), mat('#c8a040', { metal: 0.7 }), 0, 0.25, 0, g); mesh(box(0.08, 0.1, 0.03), mat('#e8c050', { metal: 0.7 }), 0, 0.3, 0.26, g); break;
      case 'rack':
        mesh(box(0.85, 0.08, 0.25), woodD, 0, 0.04, 0, g); for (const sx of [-1, 1]) mesh(box(0.06, 1.2, 0.06), woodD, sx * 0.4, 0.6, 0, g); mesh(box(0.86, 0.05, 0.06), woodD, 0, 1.0, 0, g);
        for (const [x, b] of [[-0.22, 'espada'], [0, 'lanza'], [0.22, 'espadon']]) { const w = weapon(b, null, g); w.position.set(x, 0.1, 0.05); }
        break;
      case 'cauldron': {
        for (let i = -1; i <= 1; i++) flame(g, i * 0.12, 0.02, 0, 1.2);
        mesh(psph(0.34, Math.PI * 0.3, Math.PI * 0.7), mat('#24242a', { metal: 0.5, rough: 0.5 }), 0, 0.48, 0, g);
        const brew = mesh(cyl(0.29, 0.29, 0.03, 12), mat('#3adf6a', { emissive: '#2aaf4a', ei: 1.6 }), 0, 0.68, 0, g); brew.userData.bubble = true;
        light = { color: '#5aff8a', intensity: 1.5, dist: 4, y: 0.9 };
        break;
      }
      case 'crystal': {
        mesh(box(0.6, 0.6, 0.6), mat('#2a1a3a'), 0, 0.3, 0, g);
        mesh(cyl(0.12, 0.12, 0.05, 8), mat('#8a6a3a', { metal: 0.5 }), 0, 0.63, 0, g);
        const ball = mesh(sph(0.16, 12, 10), mat('#b070ff', { emissive: '#8a40ff', ei: 1.4, opacity: 0.85 }), 0, 0.82, 0, g); ball.userData.pulse = true;
        candle(g, -0.22, 0.6, 0.18);
        light = { color: '#b070ff', intensity: 1.5, dist: 4, y: 1 };
        break;
      }
      default: return null;
    }
    g.traverse((c) => { if (c.isMesh && g.userData.noShadow) c.castShadow = false; });
    return { obj: g, light };
  }

  function prop(k, theme) {
    if (GL.ready) { const p = propGL(k, theme); if (p) return p; }
    const g = new THREE.Group();
    const stoneC = { cripta: '#6a6c76', cuevas: '#6e5c48', fortaleza: '#6a605a', nido: '#4a5a40', volcan: '#4a3a3a', abismo: '#4a2c2c' }[theme] || '#6a6c76';
    const stone = mat(stoneC), stoneD = mat(shade(stoneC, -0.3));
    let light = null, wall = false, block = true;
    switch (k) {
      case 'pillar': mesh(cyl(0.22, 0.25, 1.8, 8), stone, 0, 0.9, 0, g); mesh(box(0.6, 0.15, 0.6), stoneD, 0, 0.07, 0, g); mesh(box(0.6, 0.15, 0.6), stoneD, 0, 1.8, 0, g); break;
      case 'statue': mesh(box(0.6, 0.3, 0.6), stoneD, 0, 0.15, 0, g); { const h = humanoid({ skin: stoneC, cloth: stoneC, armor: stoneC, weapon: null, scale: 1.1 }); h.position.y = 0.3; h.traverse((c) => { if (c.isMesh) c.material = stone; }); g.add(h); } break;
      case 'sarcophagus': mesh(box(0.7, 0.5, 0.95), stone, 0, 0.25, 0, g); mesh(box(0.74, 0.08, 1.0), stoneD, 0, 0.52, 0, g); mesh(box(0.25, 0.04, 0.5), stone, 0, 0.57, 0, g); break;
      case 'coffin': mesh(box(0.5, 0.3, 0.9), mat('#4a3020'), 0, 0.15, 0, g); mesh(box(0.52, 0.05, 0.92), mat('#2e1c12'), 0, 0.32, 0, g); break;
      case 'tomb': mesh(box(0.5, 0.7, 0.15), stone, 0, 0.35, 0, g); mesh(cyl(0.25, 0.25, 0.15, 8, 1), stone, 0, 0.7, 0, g).rotation.x = Math.PI / 2; break;
      case 'altar': mesh(box(0.9, 0.55, 0.6), stone, 0, 0.27, 0, g); mesh(box(0.4, 0.02, 0.4), mat('#6a1a1a'), 0, 0.56, 0, g); candle(g, -0.3, 0.55, 0.1); candle(g, 0.3, 0.55, 0.1); light = { color: '#ffc070', intensity: 0.9, dist: 3.5, y: 0.9 }; break;
      case 'barrel': return furniture('barrel');
      case 'crate': return furniture('crate');
      case 'table': return furniture('table');
      case 'brazier': mesh(cyl(0.05, 0.08, 0.6, 5), mat('#2a2a2e', { metal: 0.6 }), 0, 0.3, 0, g); mesh(cyl(0.28, 0.16, 0.18, 8), mat('#3a3a40', { metal: 0.6 }), 0, 0.68, 0, g); for (let i = 0; i < 4; i++) flame(g, Math.cos(i * 1.6) * 0.1, 0.76, Math.sin(i * 1.6) * 0.1, 2); light = { color: '#ff8a3a', intensity: 2.2, dist: 6, y: 1.1 }; break;
      case 'rack': return furniture('rack');
      case 'cage': mesh(cyl(0.35, 0.35, 0.05, 8), mat('#3a3a40', { metal: 0.6 }), 0, 0.03, 0, g); mesh(cyl(0.35, 0.35, 0.05, 8), mat('#3a3a40', { metal: 0.6 }), 0, 1.0, 0, g); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; mesh(cyl(0.015, 0.015, 1.0, 3), mat('#5a5a62', { metal: 0.6 }), Math.cos(a) * 0.34, 0.5, Math.sin(a) * 0.34, g); } mesh(sph(0.08, 6, 5), mat('#d8d0b8'), 0, 0.12, 0, g); break;
      case 'throne': mesh(box(0.8, 0.5, 0.7), mat('#4a3020'), 0, 0.25, 0, g); mesh(box(0.8, 1.4, 0.15), mat('#5a1a1a'), 0, 0.9, -0.3, g); mesh(box(0.84, 0.08, 0.2), mat('#c8a040', { metal: 0.7 }), 0, 1.6, -0.3, g); break;
      case 'eggs': for (const [x, z] of [[-0.15, 0], [0.15, 0.05], [0, -0.18], [0.05, 0.2]]) mesh(sph(0.13, 7, 6), mat('#c8c8a8'), x, 0.15, z, g).scale.y = 1.3; block = true; break;
      case 'stalagmite': mesh(cone(0.25, 1.1, 6), stone, 0, 0.55, 0, g); mesh(cone(0.12, 0.6, 5), stoneD, 0.2, 0.3, 0.1, g); break;
      case 'mushrooms': for (const [x, z, s] of [[-0.15, 0.1, 1], [0.15, -0.1, 0.8], [0.05, 0.2, 0.6]]) { mesh(cyl(0.02, 0.025, 0.15 * s, 4), mat('#c8c0a8'), x, 0.07 * s, z, g); mesh(halfSph(0.08 * s), mat('#5affc8', { emissive: '#2adfa8', ei: 1.4 }), x, 0.15 * s, z, g); } light = { color: '#5affc8', intensity: 0.8, dist: 2.5, y: 0.4 }; block = false; break;
      case 'tent': mesh(cone(0.6, 1.0, 6), mat('#8a6a3a'), 0, 0.5, 0, g); break;
      case 'campfire': for (let i = 0; i < 5; i++) mesh(box(0.4, 0.06, 0.06), mat('#4a2e1a'), 0, 0.04, 0, g).rotation.y = i * 0.6; for (let i = 0; i < 3; i++) flame(g, Math.cos(i * 2) * 0.06, 0.06, Math.sin(i * 2) * 0.06, 2.2); light = { color: '#ff8a2a', intensity: 2, dist: 6, y: 0.6 }; break;
      case 'crystal': for (const [x, z, s] of [[0, 0, 1], [-0.2, 0.1, 0.6], [0.18, -0.08, 0.7]]) mesh(geo('oct2', () => new THREE.OctahedronGeometry(0.2)), mat('#9a5af0', { emissive: '#7a3ad8', ei: 1.3 }), x, 0.3 * s, z, g).scale.set(s, s * 2, s); light = { color: '#b070ff', intensity: 1.2, dist: 3.5, y: 0.6 }; break;
      case 'bones': for (let i = 0; i < 3; i++) mesh(cyl(0.02, 0.02, 0.3, 4), mat('#d8d0b8'), (i - 1) * 0.1, 0.02, i * 0.05, g).rotation.set(Math.PI / 2, i * 0.8, 0); block = false; break;
      case 'skull': mesh(sph(0.08, 6, 5), mat('#d8d0b8'), 0, 0.07, 0, g); block = false; break;
      case 'rubble': for (let i = 0; i < 4; i++) mesh(geo('rock', () => new THREE.DodecahedronGeometry(0.08)), stoneD, (i - 1.5) * 0.12, 0.05, (i % 2) * 0.12, g); block = false; break;
      case 'candles': for (const [x, z] of [[-0.1, 0], [0.1, 0.08], [0, -0.1]]) candle(g, x, 0, z); light = { color: '#ffc070', intensity: 0.7, dist: 2.5, y: 0.3 }; block = false; break;
      case 'lavarock': mesh(geo('rock', () => new THREE.DodecahedronGeometry(0.08)), mat('#2a1a1a'), 0, 0.05, 0, g); mesh(sph(0.04, 5, 4), mat('#ff5a1a', { emissive: '#ff5a1a', ei: 2 }), 0.06, 0.05, 0, g); light = { color: '#ff5a1a', intensity: 0.5, dist: 1.6, y: 0.2 }; block = false; break;
      case 'blood': case 'web': case 'rug': case 'puddle': case 'crack': return null; // se pintan en la textura del suelo
      case 'torch': wall = true; mesh(cyl(0.025, 0.02, 0.28, 5), mat('#4a2e1a'), 0, 0.95, 0.12, g).rotation.x = -0.4; flame(g, 0, 1.08, 0.18, 1.4); light = { color: '#ff9a40', intensity: 1.8, dist: 5.5, y: 1.15, z: 0.35 }; block = false; break;
      case 'banner': wall = true; { const col = theme === 'cripta' ? '#2a2a4a' : theme === 'nido' ? '#2a4a2a' : '#6a1414'; mesh(box(0.4, 0.8, 0.02), mat(col), 0, 1.0, 0.06, g); mesh(box(0.44, 0.04, 0.04), mat('#c8a040', { metal: 0.6 }), 0, 1.4, 0.06, g); mesh(box(0.08, 0.08, 0.025), mat('#c8a040', { metal: 0.6 }), 0, 1.05, 0.075, g); } block = false; break;
      case 'chains': wall = true; for (const x of [-0.12, 0.12]) for (let i = 0; i < 5; i++) mesh(geo('link', () => new THREE.TorusGeometry(0.03, 0.008, 3, 6)), mat('#5a5a62', { metal: 0.7 }), x, 1.3 - i * 0.07, 0.05, g).rotation.y = i % 2 ? Math.PI / 2 : 0; block = false; break;
      case 'shield': wall = true; { const s = offhand('escudo', null, null, g); s.position.set(0, 1.0, 0.05); } block = false; break;
      default: return null;
    }
    return { obj: g, light, wall, block };
  }

  // Decorado de las mazmorras con piezas KayKit (lo que no tiene equivalente sigue siendo low poly propio)
  const BANNER_BY_THEME = { cripta: 'banner_patternB_white', cuevas: 'banner_patternA_brown', fortaleza: 'banner_patternA_red', nido: 'banner_patternA_green', volcan: 'banner_patternA_red', abismo: 'banner_patternA_red' };
  function propGL(k, theme) {
    const g = new THREE.Group();
    let light = null, wall = false, block = true;
    const put = (name, s, x = 0, y = 0, z = 0, ry = 0) => { const m = piece(name, s); if (!m) return null; m.position.set(x, y, z); m.rotation.y = ry; g.add(m); return m; };
    switch (k) {
      case 'pillar': if (!put('pillar_decorated', 0.36)) return null; break;
      case 'sarcophagus': if (!put('h:coffin_decorated', 0.32)) return null; break;
      case 'coffin': if (!put('h:coffin', 0.28)) return null; break;
      case 'tomb': if (!put('h:gravestone', 0.42)) return null; break;
      case 'altar': if (!put('h:shrine_candles', 0.5)) return null; light = { color: '#ffc070', intensity: 1.0, dist: 3.5, y: 0.9 }; break;
      case 'barrel': if (!put('barrel_large', 0.32)) return null; break;
      case 'crate': if (!put('crates_stacked', 0.3)) return null; break;
      case 'table': if (!put('table_medium_decorated_A', 0.34)) return null; break;
      case 'bones': put('h:bone_A', 0.4, -0.08, 0.03, 0.05, 0.6); put('h:bone_B', 0.4, 0.1, 0.02, -0.06, 2); block = false; break;
      case 'skull': if (!put('h:skull', 0.18, 0, 0, 0, 0.4)) return null; block = false; break;
      case 'rubble': if (!put('rubble_half', 0.12, -0.2, 0, 0)) return null; block = false; break;
      case 'candles': if (!put('candle_triple', 0.42)) return null; light = { color: '#ffc070', intensity: 0.8, dist: 2.6, y: 0.4 }; block = false; break;
      case 'torch': wall = true; if (!put('torch_mounted', 0.42, 0, 0.82, 0.02)) return null; flame(g, 0, 1.1, 0.16, 1.4); light = { color: '#ff9a40', intensity: 1.8, dist: 5.5, y: 1.15, z: 0.35 }; block = false; break;
      case 'banner': wall = true; if (!put(BANNER_BY_THEME[theme] || 'banner_patternA_red', 0.3, 0, 0.12, -0.12)) return null; block = false; break;
      case 'shield': wall = true; if (!put('banner_shield_red', 0.3, 0, 0.12, -0.12)) return null; block = false; break;
      default: return null;
    }
    return { obj: g, light, wall, block };
  }

  // Muebles de la taberna con piezas KayKit (barra, chimenea, estanterías… siguen siendo propios)
  function furnitureGL(type, dir) {
    const rotY = { E: Math.PI / 2, S: 0, W: -Math.PI / 2, N: Math.PI }[dir || 'S'] || 0;
    const g = new THREE.Group();
    let light = null;
    const put = (name, s, x = 0, y = 0, z = 0, ry = 0) => { const m = piece(name, s); if (!m) return null; m.position.set(x, y, z); m.rotation.y = ry; g.add(m); return m; };
    switch (type) {
      case 'barrel': if (!put('barrel_large', 0.3, 0, 0, 0, rotY)) return null; break;
      case 'crate': if (!put('box_large', 0.42, 0, 0, 0, 0.2)) return null; break;
      case 'smallcrate': if (!put('box_large', 0.3, 0, 0, 0, -0.3)) return null; break;
      case 'table': if (!put('table_medium_decorated_A', 0.42)) return null; light = { color: '#ffb060', intensity: 0.5, dist: 2.5, y: 0.8 }; break;
      case 'maptable': if (!put('table_medium', 0.42)) return null; { const m = put('plate_food_A', 0.2, 0.1, 0.42, 0.05); void m; } break;
      case 'roundtable': if (!put('table_small_decorated_A', 0.6)) return null; light = { color: '#ffb060', intensity: 0.8, dist: 3, y: 0.85 }; break;
      case 'chair': if (!put('chair', 0.52, 0, 0, 0, rotY + Math.PI)) return null; break;
      case 'stool': if (!put('stool', 0.62)) return null; break;
      case 'chest': if (!put('chest', 0.34, 0, 0, 0, rotY)) return null; break;
      default: return null;
    }
    return { obj: g, light };
  }

  Object.assign(MODELS, { furniture, prop, flame, mug, herb, rod });
})();
