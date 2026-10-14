/* global THREE, VIEW3D, MAP */
// Ambiente de la taberna: haces de luna por las ventanas, halos en cada llama, charcos de luz en el suelo,
// motas de polvo, ascuas de la chimenea, boca del hogar encendida y sombra en la base de las paredes.
(() => {
  'use strict';
  const C = DD.core;

  // texturas compartidas (no se liberan al rehacer el ambiente)
  function tex(w, h, paint) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    paint(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.userData.keep = true;
    return t;
  }
  let GLOW = null, EDGE = null, PANE = null;
  function textures() {
    if (GLOW) return;
    GLOW = tex(128, 128, (c, w) => {
      const g = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,.55)'); g.addColorStop(0.6, 'rgba(255,255,255,.14)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, w, w);
    });
    // sombra de contacto: negro en un borde que se desvanece hacia el otro
    EDGE = tex(4, 64, (c, w, h) => {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.35, 'rgba(0,0,0,.45)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
    });
    // mancha de luna en el suelo con la cruz del marco de la ventana
    PANE = tex(128, 128, (c, w, h) => {
      c.filter = 'blur(5px)';
      c.fillStyle = '#fff'; c.fillRect(10, 10, w - 20, h - 20);
      c.fillStyle = '#000'; c.fillRect(w / 2 - 4, 0, 8, h); c.fillRect(0, h / 2 - 4, w, 8);
    });
  }

  // haz de luz de luna: una caja abierta entre la ventana y su mancha en el suelo; brilla más arriba y se mueve el polvo
  const BeamShader = {
    vertexShader: 'attribute float along; attribute float across; varying float vT; varying float vX; varying vec3 vW; void main(){ vT = along; vX = across; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: [
      'uniform float time, strength; uniform vec3 color; varying float vT; varying float vX; varying vec3 vW;',
      'float h(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }',
      'float n(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);',
      '  return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y),',
      '             mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z); }',
      'void main(){',
      '  float fade = smoothstep(0.0, 0.12, vT) * (1.0 - smoothstep(0.45, 1.0, vT)) * pow(max(sin(3.14159 * vX), 0.0), 1.5);', // max: en el borde sin() da -0,0000001 y pow() de un negativo es NaN (pantalla negra en iPhone)
      '  float dust = 0.65 + 0.55 * n(vW * 2.2 + vec3(0.0, time * 0.12, time * 0.05));',
      '  gl_FragColor = vec4(clamp(color * fade * dust * strength, 0.0, 4.0), 1.0);',
      '}'].join('\n'),
  };

  const A = { group: null, halos: [], pools: [], beams: [], hearths: [], embers: null, motes: null, fires: [], time: { value: 0 }, lastT: 0 };

  function own(m) { m.userData.own = true; return m; }
  function release(obj) {
    obj.traverse((c) => {
      if (c.geometry) c.geometry.dispose();
      for (const m of [].concat(c.material || [])) m.dispose();
    });
  }

  function addHalo(x, y, z, color, size, seed) {
    const s = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: GLOW, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6 })));
    s.position.set(x, y, z); s.scale.setScalar(size); s.renderOrder = 6;
    VIEW3D.fxLayer(s);
    A.group.add(s);
    A.halos.push({ s, size, seed, base: 0.6, high: y > 1.6 });
  }
  function addPool(x, z, color, r, strength, seed) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), own(new THREE.MeshBasicMaterial({ map: GLOW, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: strength })));
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.04, z); m.renderOrder = 2;
    A.group.add(m);
    A.pools.push({ m, seed, base: strength });
  }

  // ventanas: el haz y la mancha caen hacia dentro y hacia abajo
  function addBeam(w) {
    const z0 = w.z0 / 50, z1 = w.z1 / 50, down = 1.15, side = 0.3;
    // esquinas de la ventana en el mundo y su dirección de luz
    let corners, dir;
    if (w.wall === 'L') { corners = [[0.02, z0, w.a], [0.02, z0, w.b], [0.02, z1, w.b], [0.02, z1, w.a]]; dir = [1, -down, side]; }
    else { corners = [[w.a, z0, 0.02], [w.b, z0, 0.02], [w.b, z1, 0.02], [w.a, z1, 0.02]]; dir = [side, -down, 1]; }
    const floorPt = ([x, y, z]) => { const k = y / down; return [x + dir[0] * k, 0.05, z + dir[2] * k]; };
    const top = corners, bot = corners.map(floorPt);
    const pos = [], along = [], across = [];
    for (let i = 0; i < 4; i++) {
      const a = top[i], b = top[(i + 1) % 4], c = bot[(i + 1) % 4], d = bot[i];
      pos.push(...a, ...b, ...c, ...a, ...c, ...d); along.push(0, 0, 1, 0, 1, 1); across.push(0, 1, 1, 0, 1, 0);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('along', new THREE.Float32BufferAttribute(along, 1));
    geo.setAttribute('across', new THREE.Float32BufferAttribute(across, 1));
    const mat = own(new THREE.ShaderMaterial({ ...BeamShader, uniforms: { time: A.time, strength: { value: 0.2 }, color: { value: new THREE.Color('#8aa8ff') } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    const beam = new THREE.Mesh(geo, mat); beam.renderOrder = 5;
    VIEW3D.fxLayer(beam);
    A.group.add(beam);
    // la mancha del suelo: un cuadrilátero con la forma de la ventana proyectada
    const pg = new THREE.BufferGeometry();
    const P = bot;
    pg.setAttribute('position', new THREE.Float32BufferAttribute([...P[0], ...P[1], ...P[2], ...P[0], ...P[2], ...P[3]], 3));
    pg.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2));
    const pm = own(new THREE.MeshBasicMaterial({ map: PANE, color: '#7f9cff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.32, side: THREE.DoubleSide }));
    const patch = new THREE.Mesh(pg, pm); patch.renderOrder = 3;
    A.group.add(patch);
    A.beams.push({ mat, pm });
  }

  // sombra donde la pared toca el suelo (oclusión ambiental falsa)
  function addWallShade() {
    const W = MAP.W, H = MAP.H, d = 0.9;
    const mk = (w, h, x, z, ry) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), own(new THREE.MeshBasicMaterial({ map: EDGE, transparent: true, depthWrite: false, opacity: 0.55 })));
      m.rotation.set(-Math.PI / 2, 0, ry); m.position.set(x, 0.035, z); m.renderOrder = 1;
      A.group.add(m);
    };
    mk(W, d, W / 2, d / 2, 0);              // pared del fondo (z = 0)
    mk(H, d, d / 2, H / 2, Math.PI / 2);    // pared izquierda (x = 0)
  }

  // sources: [{ x, y, z, color, kind: 'torch'|'fireplace'|'chandelier'|'candelabra'|'table'|..., seed, dist }]
  function build(scene, sources, windows) {
    textures();
    if (A.group) { scene.remove(A.group); release(A.group); }
    A.group = new THREE.Group(); A.group.name = 'ambience';
    A.halos = []; A.pools = []; A.beams = []; A.hearths = []; A.fires = [];
    for (const s of sources) {
      const k = s.kind;
      if (k === 'torch') { addHalo(s.fx, s.fy, s.fz, '#ffae5a', 0.9, s.seed); addPool(s.x, s.z, '#ff8a30', 1.7, 0.22, s.seed); }
      else if (k === 'fireplace') {
        const bx = s.bx, bz = s.bz;
        addHalo(bx, 0.4, bz + 0.3, '#ff8a3a', 1.8, s.seed); addPool(bx, bz + 1.0, '#ff7a20', 2.6, 0.34, s.seed);
        // boca del hogar: brasas que laten
        const hm = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.56), own(new THREE.MeshBasicMaterial({ color: '#ff6a1a', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })));
        hm.position.set(bx, 0.3, bz + 0.33); A.group.add(hm);
        A.hearths.push({ m: hm, seed: s.seed });
        A.fires.push({ x: bx, y: 0.15, z: bz + 0.25, w: 0.4 });
      } else if (k === 'chandelier') { addHalo(s.x, s.y + 0.1, s.z, '#ffc98a', 1.6, s.seed); addPool(s.x, s.z, '#ffb060', 2.2, 0.2, s.seed); }
      else if (k === 'candelabra') { addHalo(s.x, s.y - 0.15, s.z, '#ffcf8a', 0.8, s.seed); addPool(s.x, s.z, '#ffb060', 1.3, 0.18, s.seed); }
      else if (k === 'cauldron') { addHalo(s.x, s.y - 0.2, s.z, '#6aff9a', 1.1, s.seed); addPool(s.x, s.z, '#3aff7a', 1.3, 0.2, s.seed); }
      else if (k === 'barcandle') addHalo(s.x, s.y - 0.1, s.z, '#ffc070', 0.45, s.seed);
      else if (k === 'roundtable' || k === 'table') { addHalo(s.x - 0.12, 0.66, s.z + 0.05, '#ffc070', 0.45, s.seed); addPool(s.x, s.z, '#ffa040', 1.1, 0.1, s.seed); }
      else addPool(s.x, s.z, s.color, 1.2, 0.14, s.seed);
    }
    for (const w of windows) addBeam(w);
    addWallShade();
    scene.add(A.group);
    // partículas: motas de polvo flotando y ascuas que suben del hogar
    if (!A.motes) { A.motes = VIEW3D.particles(scene, 260, true); A.embers = VIEW3D.particles(scene, 160, true); }
    else { scene.add(A.motes.obj); scene.add(A.embers.obj); }
  }

  // fl: nivel del relámpago (0..1)
  // top: 0..1, cuánto se ve la sala desde arriba (sentado a la mesa de partida)
  function update(now, fl, top = 0) {
    if (!A.group) return;
    const dt = Math.min(0.1, (now - (A.lastT || now)) / 1000); A.lastT = now;
    A.time.value = now / 1000;
    const flick = (s) => 0.85 + Math.sin(now / 130 + s * 3) * 0.08 + Math.sin(now / 47 + s) * 0.05 + Math.sin(now / 311 + s * 7) * 0.04;
    for (const h of A.halos) { const f = flick(h.seed); h.s.material.opacity = h.base * f * (h.high ? 1 - top : 1); h.s.scale.setScalar(h.size * (0.92 + f * 0.1)); }
    for (const p of A.pools) p.m.material.opacity = p.base * flick(p.seed);
    for (const h of A.hearths) h.m.material.opacity = 0.55 + 0.35 * flick(h.seed);
    for (const b of A.beams) { b.mat.uniforms.strength.value = (0.2 + fl * 0.3) * (1 - top); b.pm.opacity = 0.32 + fl * 0.3; }
    // motas: siempre unas cuantas a la deriva por la sala
    if (A.motes.count < 200 * (VIEW3D.qualityInfo().particles || 1)) for (let i = 0; i < 3; i++) {
      A.motes.emit({ x: 0.3 + Math.random() * (MAP.W - 0.6), y: 0.3 + Math.random() * 2.1, z: 0.3 + Math.random() * (MAP.H - 0.6), vx: (Math.random() - 0.5) * 0.08, vy: (Math.random() - 0.4) * 0.05, vz: (Math.random() - 0.5) * 0.08, color: Math.random() < 0.25 ? '#b8c8ff' : '#ffd9a0', size: 0.025 + Math.random() * 0.03, life: 6 + Math.random() * 6, alpha: 0.55 });
    }
    for (const f of A.fires) if (Math.random() < dt * 14) {
      A.embers.emit({ x: f.x + (Math.random() - 0.5) * f.w, y: f.y, z: f.z + (Math.random() - 0.5) * 0.1, vx: (Math.random() - 0.5) * 0.25, vy: 0.5 + Math.random() * 0.7, vz: 0.15 + Math.random() * 0.3, drag: 0.6, color: Math.random() < 0.5 ? '#ffb040' : '#ff6a1a', size: 0.035 + Math.random() * 0.03, life: 1 + Math.random() * 1.2, alpha: 1 });
    }
    A.motes.update(dt); A.embers.update(dt);
  }

  // la chimenea crepita: ráfaga de chispas y un momento de más luz (la llama C.life de vez en cuando)
  function crackle() {
    if (!A.embers) return;
    A.burstUntil = performance.now() + 700;
    for (const f of A.fires) for (let i = 0; i < 26; i++) A.embers.emit({ x: f.x + (Math.random() - 0.5) * f.w, y: f.y, z: f.z + (Math.random() - 0.5) * 0.1, vx: (Math.random() - 0.5) * 0.9, vy: 0.9 + Math.random() * 1.4, vz: 0.3 + Math.random() * 0.7, drag: 0.5, color: Math.random() < 0.5 ? '#ffd060' : '#ff6a1a', size: 0.04 + Math.random() * 0.04, life: 0.8 + Math.random(), alpha: 1 });
  }
  const burst = (now) => (A.burstUntil && now < A.burstUntil ? 1 + 0.6 * (A.burstUntil - now) / 700 : 1);

  C.tavernFx = { build, update, crackle, burst };
})();
