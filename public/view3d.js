/* global THREE, MODELS, DUNGEON, RULES */
// Motor 3D (Three.js): un único renderizador WebGL con sombras suaves y luces dinámicas, una cámara cenital
// inclinada que sigue al héroe, y la construcción de las mazmorras y el mundo abierto a partir de las casillas.
(function (root) {
  'use strict';
  const M = () => root.MODELS;
  // Colores y luces como en la versión anterior del motor (las intensidades de las luces están afinadas así)
  THREE.ColorManagement.enabled = false;
  const legacy = (r) => { r.useLegacyLights = true; return r; };

  // ======================================================================
  //  Renderizador compartido
  // ======================================================================
  const canvas = document.getElementById('gl');
  let renderer = null;
  // Calidad: resolución, sombras, cuántas luces se encienden y cuántas partículas hay
  // post: resplandor (bloom) y gradación de color; ao: oclusión ambiental; msaa: suavizado de bordes
  const QUALITY = {
    baja: { name: 'baja', pr: 1, shadows: false, lights: 4, particles: 0.35, post: false, ao: false, msaa: 0 },
    media: { name: 'media', pr: 1.5, shadows: true, lights: 7, particles: 0.7, post: true, ao: false, msaa: 4 },
    alta: { name: 'alta', pr: 2, shadows: true, lights: 10, particles: 1, post: true, ao: true, msaa: 4 },
  };
  // iPad y tabletas (pantalla táctil) empiezan en media; los ordenadores, en alta
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const autoQuality = () => (touch || (navigator.hardwareConcurrency || 8) <= 4 ? 'media' : 'alta');
  let Q = QUALITY[autoQuality()];
  function setQuality(q) {
    const id = q === 'auto' || !QUALITY[q] ? autoQuality() : q;
    Q = QUALITY[id];
    if (!renderer) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.pr));
    renderer.setSize(innerWidth, innerHeight, false);
    if (post) { post.dispose(); post = null; }
    if (renderer.shadowMap.enabled !== Q.shadows) {
      renderer.shadowMap.enabled = Q.shadows;
      for (const st of stages) st.scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; }); });
    }
  }
  const qualityInfo = () => ({ ...Q, pr: Math.round(Math.min(window.devicePixelRatio || 1, Q.pr) * 100) / 100 });
  function getRenderer() {
    if (renderer) return renderer;
    renderer = legacy(new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.pr));
    renderer.setSize(innerWidth, innerHeight, false);
    renderer.shadowMap.enabled = Q.shadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    window.addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight, false); if (post) post.resize(); for (const s of stages) s.resize(); });
    return renderer;
  }
  const stages = [];

  // ======================================================================
  //  Posprocesado: oclusión ambiental, resplandor, gradación de color, viñeta y miniatura (tilt-shift)
  // ======================================================================
  // Gradación en espacio lineal (antes del mapeo de tonos): exposición, contraste, saturación, tintes y viñeta
  const GradeShader = {
    uniforms: { tDiffuse: { value: null }, exposure: { value: 1 }, contrast: { value: 1.05 }, saturation: { value: 1.08 }, lift: { value: new THREE.Vector3(0, 0, 0) }, gain: { value: new THREE.Vector3(1, 1, 1) }, vignette: { value: 0.35 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: [
      'uniform sampler2D tDiffuse; uniform float exposure, contrast, saturation, vignette; uniform vec3 lift, gain; varying vec2 vUv;',
      'void main(){',
      '  vec4 t = texture2D(tDiffuse, vUv); vec3 c = max(t.rgb, 0.0) * exposure;',
      '  c = c * gain + lift * (1.0 - clamp(c, 0.0, 1.0));',
      '  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));',
      '  c = mix(vec3(l), c, saturation);',
      '  c = max(vec3(0.0), (c - 0.18) * contrast + 0.18);',
      '  float d = distance(vUv, vec2(0.5));',
      '  c *= 1.0 - vignette * smoothstep(0.35, 0.85, d);',
      '  gl_FragColor = vec4(c, t.a);',
      '}'].join('\n'),
  };
  // Miniatura: desenfoca arriba y abajo y deja nítida la franja del héroe (como una maqueta)
  const TiltShader = {
    uniforms: { tDiffuse: { value: null }, amount: { value: 0 }, focus: { value: 0.55 }, band: { value: 0.16 }, resolution: { value: new THREE.Vector2(1, 1) } },
    vertexShader: GradeShader.vertexShader,
    fragmentShader: [
      'uniform sampler2D tDiffuse; uniform float amount, focus, band; uniform vec2 resolution; varying vec2 vUv;',
      'void main(){',
      '  float k = smoothstep(band, band + 0.35, abs(vUv.y - focus)) * amount;',
      '  vec4 c = texture2D(tDiffuse, vUv);',
      '  if (k < 0.01) { gl_FragColor = c; return; }',
      '  vec4 acc = c; float w = 1.0;',
      '  for (int i = 0; i < 12; i++) { float a = float(i) * 2.39996; float r = sqrt(float(i) + 0.5) / 3.5; vec2 o = vec2(cos(a), sin(a)) * r * k * 6.0 / resolution; acc += texture2D(tDiffuse, vUv + o); w += 1.0; }',
      '  gl_FragColor = acc / w;',
      '}'].join('\n'),
  };
  const DEFAULT_GRADE = { exposure: 1, contrast: 1.06, saturation: 1.1, lift: [0, 0, 0], gain: [1, 1, 1], vignette: 0.35, tilt: 0, bloom: 0.45, bloomRadius: 0.4, bloomThreshold: 0.9, ao: 1 };
  let post = null;
  function getPost() {
    if (!Q.post || !renderer || !THREE.EffectComposer) return null;
    if (post) return post;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const isWebGL2 = renderer.capabilities.isWebGL2;
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: isWebGL2 ? Q.msaa : 0 });
    const composer = new THREE.EffectComposer(renderer, rt);
    const renderPass = new THREE.RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    composer.addPass(renderPass);
    // la oclusión ambiental mira sólo la capa 0 (sin niebla, partículas ni brillos)
    const aoCam = new THREE.PerspectiveCamera();
    aoCam.layers.set(0);
    let ao = null;
    if (Q.ao && THREE.GTAOPass) {
      ao = new THREE.GTAOPass(new THREE.Scene(), aoCam, size.x, size.y);
      ao.output = THREE.GTAOPass.OUTPUT.Default;
      ao.blendIntensity = 1;
      ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1.2, scale: 1, samples: 12 });
      ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, rings: 2, samples: 12 });
      composer.addPass(ao);
    }
    const bloom = new THREE.UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.55, 0.45, 0.82);
    composer.addPass(bloom);
    const grade = new THREE.ShaderPass(GradeShader);
    composer.addPass(grade);
    composer.addPass(new THREE.OutputPass());
    const tilt = new THREE.ShaderPass(TiltShader);
    composer.addPass(tilt);
    post = {
      composer, renderPass, ao, aoCam, bloom, grade, tilt,
      resize() { const s = renderer.getDrawingBufferSize(new THREE.Vector2()); composer.setPixelRatio(1); composer.setSize(s.x, s.y); tilt.uniforms.resolution.value.set(s.x, s.y); },
      dispose() { composer.dispose(); rt.dispose(); },
    };
    post.resize();
    return post;
  }
  // Pinta una escena con o sin posprocesado; grade: ajustes de color de ese escenario
  function present(scene, camera, g) {
    const r = getRenderer();
    const P = getPost();
    if (!P) { r.render(scene, camera); return; }
    const G = g ? { ...DEFAULT_GRADE, ...g } : DEFAULT_GRADE;
    P.renderPass.scene = scene; P.renderPass.camera = camera;
    if (P.ao) {
      P.ao.scene = scene; P.ao.camera = P.aoCam;
      P.aoCam.position.copy(camera.position); P.aoCam.quaternion.copy(camera.quaternion);
      P.aoCam.fov = camera.fov; P.aoCam.aspect = camera.aspect; P.aoCam.near = camera.near; P.aoCam.far = camera.far;
      P.aoCam.updateProjectionMatrix(); P.aoCam.updateMatrixWorld();
      P.ao.enabled = G.ao > 0; P.ao.blendIntensity = G.ao;
    }
    P.bloom.strength = G.bloom; P.bloom.radius = G.bloomRadius; P.bloom.threshold = G.bloomThreshold;
    const u = P.grade.uniforms;
    u.exposure.value = G.exposure; u.contrast.value = G.contrast; u.saturation.value = G.saturation; u.vignette.value = G.vignette;
    u.lift.value.set(...G.lift); u.gain.value.set(...G.gain);
    P.tilt.uniforms.amount.value = G.tilt; P.tilt.enabled = G.tilt > 0.01;
    if (G.focus !== undefined) P.tilt.uniforms.focus.value = G.focus;
    P.composer.render();
  }
  // Lo que no debe ensuciar la oclusión ambiental (niebla, partículas, brillos) va a la capa 1
  function fxLayer(o) { o.traverse((c) => c.layers.set(1)); return o; }

  // Escenario: escena + cámara + reserva de luces (las fuentes más cercanas a la cámara se encienden)
  function makeStage(o = {}) {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(o.fov || 38, innerWidth / innerHeight, 0.1, 200);
    camera.layers.enable(1);
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
          const L = pool[i], it = i < Q.lights ? sorted[i] : null;
          if (!it) { L.intensity = 0; continue; }
          const s = it.s;
          L.position.set(s.x, s.y, s.z);
          L.color.set(s.color);
          L.intensity = s.intensity;
          L.distance = s.dist;
        }
      },
      grade: null,
      render() { present(scene, camera, stage.grade); },
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
    tex.colorSpace = THREE.SRGBColorSpace;
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
    if (!world && mm.GL && mm.GL.ready && mm.pieceGeo('wall')) return buildDungeonGL(map, theme, out);
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
      const faceTex = new THREE.CanvasTexture(wc); faceTex.colorSpace = THREE.SRGBColorSpace;
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
    // piezas KayKit (si han cargado): árboles, pinos, rocas, montañas, casas, la taberna, tumbas y vallas
    const glLists = {};
    const GLW = mm.GL && mm.GL.ready && mm.pieceGeo('m:tree_single_A');
    const addG = (name, it, tint = '') => (glLists[name + '|' + tint] = glLists[name + '|' + tint] || []).push(it);
    const ZT = ['', '', '#b8c0a0', '#d8a878', '#e8eef6', '#6a5656'];
    for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
      const ch = map.tiles[y * map.w + x];
      const r = rand(x * 7.3 + y * 3.1), cx = x + 0.5 + (r - 0.5) * 0.3, cz = y + 0.5 + (rand(y * 5 + x) - 0.5) * 0.3;
      const s = 0.8 + r * 0.5;
      const zone = map.zones ? Number(map.zones[y * map.w + x]) || 0 : 0;
      if (GLW) {
        const ry = r * Math.PI * 2;
        let done = true;
        switch (ch) {
          case 'T': if (r < 0.28) addG('m:trees_A_small', { x: cx, z: cz, s: 0.85 * s, r: ry }); else addG(r < 0.64 ? 'm:tree_single_A' : 'm:tree_single_B', { x: cx, z: cz, s: 1.3 * s, r: ry }); break;
          case 'P': addG(r < 0.5 ? 'm:trees_B_small' : 'm:trees_B_medium', { x: cx, z: cz, s: 0.8 * s, r: ry }, zone >= 2 ? '#a8b898' : ''); break;
          case 'p': addG(r < 0.5 ? 'm:trees_B_small' : 'm:trees_B_medium', { x: cx, z: cz, s: 0.8 * s, r: ry }, '#eef4fa'); break;
          case 'y': addG(r < 0.4 ? 'h:tree_dead_large' : r < 0.75 ? 'h:tree_dead_medium' : 'h:tree_dead_small', { x: cx, z: cz, s: 0.3 * s, r: ry }, zone === 5 ? '#4a3a3a' : ''); break;
          case 'M': addG(['m:mountain_A', 'm:mountain_B', 'm:mountain_C'][Math.floor(r * 3)], { x: x + 0.5, z: y + 0.5, s: 0.85 + r * 0.45, sy: 0.9 + r * 0.9, r: Math.floor(r * 6) * Math.PI / 3 }, ZT[zone]); break;
          case 'o': addG(['m:rock_single_A', 'm:rock_single_C', 'm:rock_single_E'][Math.floor(r * 3)], { x: cx, z: cz, s: 2 + r * 1.5, r: ry }, ZT[zone]); break;
          case 'e': addG(['m:rock_single_B', 'm:rock_single_D'][Math.floor(r * 2)], { x: cx, z: cz, s: 2.5 + r, r: ry }, '#3a3030'); break;
          case 'k': addG(['m:building_home_A_blue', 'm:building_home_B_red', 'm:building_home_A_red'][Math.floor(r * 3)], { x: x + 0.5, z: y + 0.5, s: 1.25, r: Math.floor(r * 6) * Math.PI / 3 }); break;
          case 'H': addG('m:building_tavern_blue', { x: x + 0.5, z: y + 0.2, s: 1.9, r: 0 }); lights.push({ x: x + 0.5, y: 1, z: y + 1.3, color: '#ffc070', intensity: 2.2, dist: 7 }); break;
          case 't': addG(r < 0.5 ? 'h:gravestone' : 'h:gravemarker_A', { x: cx, z: cz, s: 0.38, r: (r - 0.5) * 0.6 }); break;
          case 'R': addG(r < 0.5 ? 'm:building_destroyed' : 'h:pillar', { x: x + 0.5, z: y + 0.5, s: r < 0.5 ? 0.8 : 0.32 + r * 0.1, r: ry }); break;
          case 'x': addG('m:fence_wood_straight', { x: x + 0.5, z: y + 0.5, s: 0.9, r: (map.tiles[y * map.w + x + 1] === 'x' || map.tiles[y * map.w + x - 1] === 'x') ? Math.PI / 2 : 0 }); break;
          case 'w': if (r > 0.94) addG('m:waterlily_A', { x: cx, z: cz, y: 0.03, s: 2.2, r: ry }); done = false; break;
          default: done = false;
        }
        if (done) continue;
      }
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
      waystone: [new THREE.BoxGeometry(0.35, 1.1, 0.25), mm.mat('#7a8a9a', { emissive: '#2a6aaa', ei: 0.3 })],
      skull: [new THREE.SphereGeometry(0.12, 6, 5), mm.mat('#d8d0b8')],
    };
    out.instances = [];
    for (const [key, list] of Object.entries(glLists)) {
      const [name, tint] = key.split('|');
      const P = mm.pieceGeo(name, true);
      if (!P) continue;
      let material = P.material;
      if (tint) material = [].concat(material).map((m) => { const c = m.clone(); c.color = new THREE.Color(tint); return c; });
      if (Array.isArray(material) && material.length === 1) material = material[0];
      const im = instanced(P.geometry, material, list.map((it) => ({ ...it, y: it.y || 0 })), { shadow: !/waterlily|fence/.test(name) });
      group.add(im);
      out.instances.push(im);
    }
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


  // ======================================================================
  //  Mazmorra con piezas KayKit: losas o tierra, muros de sillería con remate oscuro y manchas en el suelo
  // ======================================================================
  const GL_WALL_H = 1.3;
  function decalTexture(map) {
    const px = 32;
    const c = document.createElement('canvas');
    c.width = map.w * px; c.height = map.h * px;
    const g = c.getContext('2d');
    for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
      const ch = map.tiles[y * map.w + x];
      const X = x * px, Y = y * px;
      if (ch === '+') { g.fillStyle = 'rgba(74,48,32,.95)'; g.fillRect(X + 4, Y + 2, px - 8, px - 4); g.fillStyle = 'rgba(30,18,10,.9)'; for (let i = 1; i < 4; i++) g.fillRect(X + 4 + i * (px - 8) / 4, Y + 2, 1.5, px - 4); }
    }
    for (const p of map.props || []) {
      const X = p.x * px, Y = p.y * px;
      if (p.k === 'blood') { g.fillStyle = 'rgba(90,10,10,.75)'; g.beginPath(); g.ellipse(X + px / 2, Y + px / 2, px * 0.32, px * 0.22, rand(p.x) * 3, 0, 7); g.fill(); }
      if (p.k === 'rug') { g.fillStyle = '#6a1a1a'; g.fillRect(X + 2, Y + 4, px - 4, px - 8); g.strokeStyle = '#c8a040'; g.lineWidth = 2; g.strokeRect(X + 4, Y + 6, px - 8, px - 12); }
      if (p.k === 'puddle') { g.fillStyle = 'rgba(30,50,70,.7)'; g.beginPath(); g.ellipse(X + px / 2, Y + px / 2, px * 0.35, px * 0.22, 0, 0, 7); g.fill(); }
      if (p.k === 'web') { g.strokeStyle = 'rgba(220,220,230,.5)'; g.lineWidth = 1; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(X + px / 2, Y + px / 2); g.lineTo(X + px / 2 + Math.cos(i) * px / 2, Y + px / 2 + Math.sin(i) * px / 2); g.stroke(); } for (const r of [5, 10, 14]) { g.beginPath(); g.arc(X + px / 2, Y + px / 2, r, 0, 7); g.stroke(); } }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }
  function buildDungeonGL(map, theme, out) {
    const mm = M();
    const { group, lights, floor } = out;
    const T = THEME[theme] || THEME.cripta;
    floor.material = new THREE.MeshStandardMaterial({ color: '#050404', roughness: 1 }); // debajo de las losas, por si acaso
    floor.position.y = -0.03;
    const HS = 0.25, VS = GL_WALL_H / 4;
    const many = (a, n, b) => Array(n).fill(a).concat(b ? [b] : []);
    const floorNames = theme === 'cuevas' || theme === 'nido' ? many('floor_dirt_large', 9, 'floor_dirt_large_rocky') : theme === 'volcan' ? many('floor_tile_large', 7, 'floor_tile_large_rocks') : many('floor_tile_large', 1);
    // las piezas KayKit son claras: se oscurecen y tiñen según el tema
    const TINT = { cripta: ['#727a8c', '#8e95a6'], cuevas: ['#8e785c', '#9c8a72'], fortaleza: ['#8a7c70', '#9a8e84'], nido: ['#6e7c5e', '#86947a'], volcan: ['#7a5e58', '#8a7470'] }[theme] || ['#80808a', '#90909a'];
    const tinted = (mat, hex) => [].concat(mat).map((m) => { const c = m.clone(); c.color = new THREE.Color(hex); return c; });
    const one = (a) => (a.length === 1 ? a[0] : a);
    const floors = {};
    const addF = (n, it) => (floors[n] = floors[n] || []).push(it);
    const isWall = (x, y) => x < 0 || y < 0 || x >= map.w || y >= map.h || map.tiles[y * map.w + x] === '#';
    const segs = {}, caps = [];
    for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
      const ch = map.tiles[y * map.w + x];
      const tile = y * map.w + x;
      if (ch === '#') {
        let near = false;
        for (const [dx, dy, r] of [[0, 1, 0], [0, -1, Math.PI], [1, 0, Math.PI / 2], [-1, 0, -Math.PI / 2]]) {
          if (isWall(x + dx, y + dy)) continue;
          near = true;
          const k = rand(x * 7.1 + y * 3.3 + dx * 5 + dy * 11);
          const name = k < 0.1 ? 'wall_cracked' : k < 0.14 ? 'wall_broken' : 'wall';
          (segs[name] = segs[name] || []).push({ x: x + 0.5 + dx * 0.375, z: y + 0.5 + dy * 0.375, r, tile, cz: y + 0.5, cx: x + 0.5 });
        }
        if (!near) for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (!isWall(x + dx, y + dy)) { near = true; break; }
        if (near) caps.push({ x: x + 0.5, z: y + 0.5, tile });
        continue;
      }
      if (WATER.has(ch)) continue;
      const name = ch === '^' ? 'floor_tile_big_spikes' : floorNames[Math.floor(rand(x * 13.7 + y * 7.1) * floorNames.length)];
      addF(name, { x: x + 0.5, z: y + 0.5, y: -0.0125, r: Math.floor(rand(x + y * 3.7) * 4) * Math.PI / 2, s: HS, sy: name === 'floor_tile_big_spikes' ? HS * 0.35 : HS });
    }
    for (const [n, list] of Object.entries(floors)) {
      const P = mm.pieceGeo(n);
      if (!P) continue;
      const im = instanced(P.geometry, one(tinted(P.material, TINT[0])), list, { shadow: false });
      group.add(im);
    }
    // manchas, alfombras, telarañas y puertas, sobre las losas
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(map.w, map.h), new THREE.MeshStandardMaterial({ map: decalTexture(map), transparent: true, roughness: 0.95, depthWrite: false }));
    decal.rotation.x = -Math.PI / 2; decal.position.set(map.w / 2, 0.02, map.h / 2); decal.receiveShadow = true;
    group.add(decal);
    // muros: un segmento por cada cara que da a la sala, y un remate oscuro arriba
    const wallMeshes = [];
    for (const [n, list] of Object.entries(segs)) {
      const P = mm.pieceGeo(n);
      if (!P) continue;
      const im = new THREE.InstancedMesh(P.geometry, one(tinted(P.material, TINT[1])), list.length);
      im.castShadow = true; im.receiveShadow = true; im.count = 0;
      group.add(im);
      wallMeshes.push({ im, list });
    }
    const capMat = new THREE.MeshStandardMaterial({ color: T.top, roughness: 1 });
    const capMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.08, 1), capMat, Math.max(1, caps.length));
    capMesh.count = 0; capMesh.receiveShadow = true;
    group.add(capMesh);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    // los muros entre la cámara y el héroe se bajan para no taparlo
    const cutAt = (z, x, hx, hz) => hx !== undefined && z > hz + 0.4 && z - hz < 7 && Math.abs(x - hx) < 7;
    out.updateWalls = (seen, hx, hz) => {
      for (const W of wallMeshes) {
        let n = 0;
        for (const w of W.list) {
          if (!seen[w.tile] && !seenNear(seen, map, w.tile)) continue;
          const cut = cutAt(w.cz, w.cx, hx, hz);
          q.setFromAxisAngle(up, w.r); sc.set(HS, cut ? VS * 0.25 : VS, HS); ps.set(w.x, 0, w.z);
          m4.compose(ps, q, sc);
          W.im.setMatrixAt(n++, m4);
        }
        W.im.count = n; W.im.instanceMatrix.needsUpdate = true;
      }
      let n = 0;
      for (const c of caps) {
        if (!seen[c.tile] && !seenNear(seen, map, c.tile)) continue;
        const cut = cutAt(c.z, c.x, hx, hz);
        m4.makeTranslation(c.x, cut ? GL_WALL_H * 0.25 : GL_WALL_H, c.z);
        capMesh.setMatrixAt(n++, m4);
      }
      capMesh.count = n; capMesh.instanceMatrix.needsUpdate = true;
    };
    // decorado
    out.props = [];
    for (const p of map.props || []) {
      const pr = mm.prop(p.k, theme);
      if (!pr) continue;
      const o = pr.obj;
      if (pr.wall) o.position.set(p.x + 0.5, 0, p.y + 1);
      else { o.position.set(p.x + 0.5, 0, p.y + 0.5); o.rotation.y = rand(p.x * 3 + p.y) * Math.PI * 2; }
      o.visible = false;
      group.add(o);
      out.props.push({ o, tile: (pr.wall ? p.y + 1 : p.y) * map.w + p.x, light: pr.light ? { x: p.x + 0.5, y: pr.light.y, z: (pr.wall ? p.y + 1 : p.y + 0.5) + (pr.light.z || 0), color: pr.light.color, intensity: pr.light.intensity, dist: pr.light.dist } : null });
    }
    out.gl = true;
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
    m.layers.set(1);
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

  // ======================================================================
  //  Retratos y vistas previas: el modelo 3D de un héroe dibujado en una imagen
  // ======================================================================
  let snapR = null, snapScene = null, snapCam = null;
  const snapCache = new Map();
  // rot: giro del modelo (para el editor de personaje)
  function ensureSnap() {
    if (snapR) return;
    snapR = legacy(new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }));
    snapR.outputColorSpace = THREE.SRGBColorSpace;
    snapR.toneMapping = THREE.ACESFilmicToneMapping;
    snapScene = new THREE.Scene();
    snapScene.add(new THREE.HemisphereLight('#c8c0d8', '#3a2a1a', 0.55));
    const key1 = new THREE.DirectionalLight('#ffe0c0', 1.05); key1.position.set(1.5, 2.5, 3); snapScene.add(key1);
    const rim = new THREE.DirectionalLight('#8aa0ff', 0.8); rim.position.set(-2, 1.5, -2); snapScene.add(rim);
    snapCam = new THREE.PerspectiveCamera(30, 1, 0.05, 20);
  }

  // Dibujo 3D de un objeto para el inventario: el arma tal cual, la pieza de armadura sobre un maniquí invisible,
  // anillos y amuletos con su gema del color de la rareza
  const artCache = new Map();
  const GEM = { inferior: '#8a8a8a', normal: '#c83a3a', superior: '#e8e4d8', magico: '#4a7aff', raro: '#ffd23a', unico: '#ff8a20', conjunto: '#3ac86a' };
  function itemArt(it, w, h) {
    if (!it || !M().GL || !M().GL.ready) return null;
    const key = ['art', it.slot, it.base, it.type, it.tier || 0, it.sk || 0, it.rarity, it.set || '', w, h, M().GL.version].join('|');
    if (artCache.has(key)) return artCache.get(key);
    ensureSnap();
    const slot = it.slot, grp = new THREE.Group();
    let obj = null;
    if ((slot === 'arma' || slot === 'mano') && window.WEAPON3D) {
      obj = WEAPON3D.build(it.base, it.tier || 0, it.rarity, { sk: it.sk, set: it.set });
      if (obj) { obj.rotation.set(0.25, 0.5, slot === 'arma' && it.base !== 'arco' ? -0.78 : slot === 'mano' ? 0 : 0.2); grp.add(obj); }
    } else if (['casco', 'pecho', 'guantes', 'botas'].includes(slot)) {
      const gear = { [slot]: it.type, [slot + 'T']: it.tier || 0, [slot + 'S']: it.sk || 0, [slot + 'R']: it.rarity };
      const model = M().buildHero({ cls: 'guerrero', species: 'human', sex: 'm', hs: 'corto', skin: 0, hair: 0, gear });
      const P = model.userData.parts || {};
      const keep = new Set(P.armor || []);
      // guantes y botas: sólo los de la derecha; el peto, con la ropa del torso
      model.traverse((c) => {
        if (!c.isMesh) return;
        if (keep.has(c)) { if ((slot === 'guantes' || slot === 'botas') && c.parent && /l$/.test(c.parent.name)) c.visible = false; return; }
        if (slot === 'pecho' && /_Body$/.test(c.name)) return;
        c.visible = false;
      });
      model.rotation.y = slot === 'guantes' ? 0.35 : slot === 'botas' ? 0.7 : 0.45;
      grp.add(model); obj = model;
    } else if (slot === 'anillo' || slot === 'amuleto') {
      const gold = new THREE.MeshStandardMaterial({ color: '#c89a3a', metalness: 0.9, roughness: 0.25 });
      const gc = GEM[it.rarity] || '#c83a3a';
      const gem = new THREE.MeshStandardMaterial({ color: gc, emissive: gc, emissiveIntensity: 0.6, roughness: 0.1 });
      obj = new THREE.Group();
      if (slot === 'anillo') {
        obj.add(new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.025, 12, 32), gold));
        const g1 = new THREE.Mesh(new THREE.OctahedronGeometry(0.045), gem); g1.position.y = 0.12; obj.add(g1);
        const s = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.02, 0.03, 8), gold); s.position.y = 0.1; obj.add(s);
        obj.rotation.set(0.5, 0.4, 0);
      } else {
        const chain = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.008, 6, 40, Math.PI * 1.3), gold); chain.rotation.z = Math.PI * 1.35; chain.position.y = 0.06; obj.add(chain);
        const set = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.014, 10, 24), gold); set.position.y = -0.12; obj.add(set);
        const g1 = new THREE.Mesh(new THREE.OctahedronGeometry(0.05), gem); g1.position.y = -0.12; g1.scale.set(0.8, 1.2, 0.6); obj.add(g1);
        obj.rotation.set(0.2, 0.3, 0);
      }
      grp.add(obj);
    }
    if (!obj) return null;
    // encuadre: la caja de lo que se ve
    grp.updateMatrixWorld(true);
    const bb = new THREE.Box3();
    grp.traverse((c) => {
      if (!c.isMesh) return;
      for (let o = c; o; o = o.parent) if (!o.visible) return;
      c.geometry.computeBoundingBox();
      bb.union(c.geometry.boundingBox.clone().applyMatrix4(c.matrixWorld));
    });
    if (bb.isEmpty()) return null;
    const ctr = bb.getCenter(new THREE.Vector3()), size = bb.getSize(new THREE.Vector3());
    snapR.setPixelRatio(1);
    snapR.setSize(w, h, false);
    snapCam.aspect = w / h;
    const fit = Math.max(size.y, size.x / (w / h), size.z * 0.6) * 1.18;
    const dist = fit / (2 * Math.tan(THREE.MathUtils.degToRad(snapCam.fov / 2)));
    snapCam.position.set(ctr.x, ctr.y + size.y * 0.05, ctr.z + dist + size.z / 2);
    snapCam.lookAt(ctr);
    snapCam.updateProjectionMatrix();
    snapScene.add(grp);
    snapR.render(snapScene, snapCam);
    snapScene.remove(grp);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(snapR.domElement, 0, 0);
    if (artCache.size > 300) artCache.clear();
    artCache.set(key, c);
    return c;
  }

  function snapshot(look, w, h, mode = 'full', rot) {
    const key = JSON.stringify(look) + w + 'x' + h + mode + (rot || '') + (M().GL ? M().GL.version : 0);
    if (snapCache.has(key)) return snapCache.get(key);
    ensureSnap();
    snapR.setPixelRatio(1);
      snapR = legacy(new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }));
      snapR.outputColorSpace = THREE.SRGBColorSpace;
      snapR.toneMapping = THREE.ACESFilmicToneMapping;
      snapScene = new THREE.Scene();
      snapScene.add(new THREE.HemisphereLight('#c8c0d8', '#3a2a1a', 0.55));
      const key1 = new THREE.DirectionalLight('#ffe0c0', 1.05); key1.position.set(1.5, 2.5, 3); snapScene.add(key1);
      const rim = new THREE.DirectionalLight('#8aa0ff', 0.8); rim.position.set(-2, 1.5, -2); snapScene.add(rim);
    snapR.setSize(w, h, false);
    const model = M().buildHero(look);
    model.rotation.y = rot !== undefined ? rot : mode === 'bust' ? 0.35 : 0.55;
    if (model.userData.gl) M().posePeek(model, 'Idle', 0.5); else M().animate(model, { t: 0 });
    snapScene.add(model);
    const sc = model.scale.x;
    snapCam.aspect = w / h;
    if (mode === 'bust') { snapCam.position.set(0.1, 0.92 * sc, 1.05); snapCam.lookAt(0, 0.82 * sc, 0); }
    else { snapCam.position.set(0, 0.75 * sc, 2.7); snapCam.lookAt(0, 0.55 * sc, 0); }
    snapCam.updateProjectionMatrix();
    snapR.render(snapScene, snapCam);
    snapScene.remove(model);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(snapR.domElement, 0, 0);
    if (snapCache.size > 120) snapCache.clear();
    snapCache.set(key, c);
    return c;
  }


  // ======================================================================
  //  Partículas (puntos suaves en la GPU): chispas, polvo, magia, ascuas…
  // ======================================================================
  function particles(scene, max = 900, additive = false) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(max * 3), col = new Float32Array(max * 3), size = new Float32Array(max), alpha = new Float32Array(max);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('pcolor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('psize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('palpha', new THREE.BufferAttribute(alpha, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { scale: { value: innerHeight * 0.5 } },
      vertexShader: 'attribute vec3 pcolor; attribute float psize; attribute float palpha; uniform float scale; varying vec3 vC; varying float vA;\n' +
        'void main(){ vC = pcolor; vA = palpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = psize * scale / -mv.z; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying vec3 vC; varying float vA;\n' +
        'void main(){ vec2 d = gl_PointCoord - 0.5; float r = dot(d, d) * 4.0; if (r > 1.0) discard; gl_FragColor = vec4(vC, vA * (1.0 - r)); }',
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 7;
    pts.layers.set(1);
    scene.add(pts);
    const list = [];
    const c = new THREE.Color();
    return {
      obj: pts,
      // o: { x, y, z, vx, vy, vz, color, size, life, grav, drag, fade }
      emit(o) {
        if (list.length >= max * Q.particles) return;
        c.set(o.color || '#ffffff');
        list.push({ x: o.x, y: o.y, z: o.z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, r: c.r, g: c.g, b: c.b, size: o.size || 0.1, life: 0, max: o.life || 0.6, grav: o.grav || 0, drag: o.drag || 0, a: o.alpha || 1, grow: o.grow || 0, steady: !!o.steady });
      },
      update(dt) {
        let n = 0;
        for (let i = list.length - 1; i >= 0; i--) {
          const p = list[i];
          p.life += dt;
          if (p.life >= p.max) { list[i] = list[list.length - 1]; list.pop(); continue; }
          p.vy -= p.grav * dt;
          if (p.drag) { const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; p.vz *= k; }
          p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
          if (p.y < 0.02) { p.y = 0.02; p.vy = 0; p.vx *= 0.8; p.vz *= 0.8; }
        }
        for (const p of list) {
          const k = p.life / p.max;
          pos[n * 3] = p.x; pos[n * 3 + 1] = p.y; pos[n * 3 + 2] = p.z;
          col[n * 3] = p.r; col[n * 3 + 1] = p.g; col[n * 3 + 2] = p.b;
          size[n] = p.size * (1 + p.grow * k);
          alpha[n] = p.steady ? p.a : p.a * (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85);
          n++;
        }
        geo.setDrawRange(0, n);
        geo.attributes.position.needsUpdate = true; geo.attributes.pcolor.needsUpdate = true; geo.attributes.psize.needsUpdate = true; geo.attributes.palpha.needsUpdate = true;
        mat.uniforms.scale.value = innerHeight * 0.5;
      },
      clear() { list.length = 0; geo.setDrawRange(0, 0); },
      get count() { return list.length; },
    };
  }

  // ======================================================================
  //  Clima: lluvia, nieve, ceniza, arena y motas de polvo alrededor de la cámara
  // ======================================================================
  const WEATHER = {
    rain: { n: 900, color: '#9ab4d8', size: 0, fall: 14, wind: 2, lines: true },
    storm: { n: 1400, color: '#a8c0e0', size: 0, fall: 18, wind: 5, lines: true },
    snow: { n: 900, color: '#ffffff', size: 0.09, fall: 1.2, wind: 0.8, sway: 0.8 },
    ash: { n: 700, color: '#9a9090', size: 0.08, fall: 0.7, wind: 0.4, sway: 0.5, embers: 0.12 },
    sand: { n: 1100, color: '#d8a868', size: 0.07, fall: 0.3, wind: 9, sway: 0.4 },
    mist: { n: 260, color: '#b8c8b0', size: 0.9, fall: 0.05, wind: 0.3, sway: 0.2, alpha: 0.10 },
    motes: { n: 220, color: '#e8d8b0', size: 0.05, fall: 0.05, wind: 0.05, sway: 0.25, alpha: 0.5 },
    embers: { n: 260, color: '#ff8a3a', size: 0.06, fall: -0.6, wind: 0.2, sway: 0.5, glow: true },
  };
  function weather(scene) {
    const MAX = 1400;
    const BX = 34, BZ = 28, BY = 9;
    // gotas: segmentos de línea; el resto, puntos
    const lgeo = new THREE.BufferGeometry();
    const lpos = new Float32Array(MAX * 6);
    lgeo.setAttribute('position', new THREE.BufferAttribute(lpos, 3));
    const lmat = new THREE.LineBasicMaterial({ color: '#9ab4d8', transparent: true, opacity: 0.45, depthWrite: false });
    const lines = new THREE.LineSegments(lgeo, lmat);
    lines.frustumCulled = false; lines.renderOrder = 8; lines.layers.set(1);
    scene.add(lines);
    const pnorm = particles(scene, MAX, false), pglow = particles(scene, 400, true);
    const drops = [];
    let kind = 'none', W = null, t = 0;
    const seedDrop = (d, cx, cz, top) => { d.x = cx + (Math.random() - 0.5) * BX; d.z = cz + (Math.random() - 0.5) * BZ - 3; d.y = top ? BY * (0.7 + Math.random() * 0.3) : Math.random() * BY; d.ph = Math.random() * 6; };
    return {
      get kind() { return kind; },
      set(k, cx = 0, cz = 0) {
        if (k === kind) return;
        kind = k; W = WEATHER[k] || null;
        drops.length = 0; pnorm.clear(); pglow.clear();
        if (!W) { lgeo.setDrawRange(0, 0); return; }
        lmat.color.set(W.color);
        const n = Math.round(W.n * Q.particles);
        for (let i = 0; i < n; i++) { const d = {}; seedDrop(d, cx, cz, false); drops.push(d); }
      },
      update(dt, cx, cz) {
        t += dt;
        pnorm.clear(); pglow.clear();
        if (!W) return;
        let li = 0;
        for (const d of drops) {
          d.y -= W.fall * dt;
          d.x += (W.wind + (W.sway ? Math.sin(t * 1.3 + d.ph) * W.sway : 0)) * dt;
          if (W.sway) d.z += Math.cos(t * 1.1 + d.ph) * W.sway * 0.5 * dt;
          if (d.y < 0 || d.y > BY || Math.abs(d.x - cx) > BX / 2 + 2 || Math.abs(d.z - cz + 3) > BZ / 2 + 2) seedDrop(d, cx, cz, W.fall > 0);
          if (W.lines) {
            lpos[li * 6] = d.x; lpos[li * 6 + 1] = d.y; lpos[li * 6 + 2] = d.z;
            lpos[li * 6 + 3] = d.x - W.wind * 0.04; lpos[li * 6 + 4] = d.y + 0.45; lpos[li * 6 + 5] = d.z;
            li++;
          } else {
            const glow = W.glow || (W.embers && d.ph < W.embers * 6);
            (glow ? pglow : pnorm).emit({ x: d.x, y: d.y, z: d.z, color: glow ? '#ff7a2a' : W.color, size: W.size * (glow ? 0.9 : 1), life: 1e9, alpha: W.alpha || 0.9, steady: true });
          }
        }
        lgeo.setDrawRange(0, li * 2);
        lgeo.attributes.position.needsUpdate = true;
        // los puntos se pintan "frescos" cada fotograma (vida infinita, sin envejecer)
        pnorm.update(0); pglow.update(0);
      },
      clear() { this.set('none'); },
    };
  }

  // ======================================================================
  //  Ciclo de día y noche del mundo abierto (un día dura 24 minutos de juego)
  // ======================================================================
  const DAY_MS = 24 * 60000;
  function dayCycle(now = Date.now()) {
    const t = (now % DAY_MS) / DAY_MS;             // 0 = medianoche, 0.25 = amanecer, 0.5 = mediodía, 0.75 = anochecer
    const sun = Math.max(0, Math.sin((t - 0.25) * Math.PI * 2)); // altura del sol (0 de noche)
    const light = Math.min(1, 0.12 + sun * 1.2);
    const dusk = Math.max(0, 1 - Math.abs(sun - 0.15) / 0.15) * (sun > 0 ? 1 : 0); // tonos naranjas al salir y ponerse el sol
    const hour = Math.floor(t * 24);
    return { t, sun, light, dusk, night: sun < 0.08, hour, label: sun < 0.08 ? '🌙 Noche' : dusk > 0.4 ? (t < 0.5 ? '🌅 Amanecer' : '🌇 Atardecer') : '☀️ Día' };
  }

  // ======================================================================
  //  Habitación con trofeos: una escena propia en su lienzo
  // ======================================================================
  function roomView(cv, info) {
    const mm = M();
    const r = legacy(new THREE.WebGLRenderer({ canvas: cv, antialias: true }));
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping;
    r.shadowMap.enabled = Q.shadows; r.shadowMap.type = THREE.PCFSoftShadowMap;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#120c08');
    scene.add(new THREE.HemisphereLight('#c8a888', '#20140c', 0.45));
    const cam = new THREE.PerspectiveCamera(42, cv.width / cv.height, 0.1, 50);
    // suelo de tablas, paredes de piedra y madera
    const wood = (() => { const c = document.createElement('canvas'); c.width = 128; c.height = 128; const g = c.getContext('2d'); for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#5a3a20' : '#634126'; g.fillRect(0, i * 16, 128, 16); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, i * 16, 128, 1.5); g.fillRect((i * 37) % 128, i * 16, 1.5, 16); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 3); return t; })();
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(9, 7), new THREE.MeshStandardMaterial({ map: wood, roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    const wallM = new THREE.MeshStandardMaterial({ color: '#4e4236', roughness: 0.95 });
    const back = new THREE.Mesh(new THREE.BoxGeometry(9, 3.2, 0.3), wallM); back.position.set(0, 1.6, -3.5); back.receiveShadow = true; scene.add(back);
    for (const sx of [-1, 1]) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.2, 7), wallM); w.position.set(sx * 4.5, 1.6, 0); w.receiveShadow = true; scene.add(w); }
    for (const x of [-4.3, -1.5, 1.5, 4.3]) mm.mesh(mm.box(0.25, 3.2, 0.25), mm.mat('#3a2412'), x, 1.6, -3.3, scene);
    mm.mesh(mm.box(9, 0.25, 0.3), mm.mat('#3a2412'), 0, 3.0, -3.3, scene);
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.2), new THREE.MeshStandardMaterial({ color: '#6a1a1a', roughness: 1 }));
    rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.01, 0.6); rug.receiveShadow = true; scene.add(rug);
    // chimenea
    mm.mesh(mm.box(1.6, 1.4, 0.6), mm.mat('#4a4448'), -3.4, 0.7, -3.1, scene);
    mm.mesh(mm.box(1, 0.7, 0.3), mm.mat('#120808'), -3.4, 0.45, -2.85, scene);
    mm.flame(scene, -3.4, 0.2, -2.8, 1.6);
    const lights = [];
    const addL = (x, y, z, col, i, d) => { const L = new THREE.PointLight(col, i, d, 1.6); L.position.set(x, y, z); scene.add(L); lights.push({ L, i }); return L; };
    addL(-3.4, 0.6, -2.4, '#ff8a3a', 2.2, 7);
    addL(3.2, 2.2, -2.6, '#ffc070', 1.4, 6);
    const key = new THREE.SpotLight('#ffe0b0', 1.5, 14, 0.8, 0.6, 1.2); key.position.set(1.5, 5, 3); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); scene.add(key); scene.add(key.target);
    // el héroe en el centro, con su mascota
    const hero = mm.buildHero(info.look); hero.position.set(0, 0, 0.6); hero.rotation.y = 0.2; scene.add(hero);
    let pet = null;
    if (info.pet) { pet = mm.buildPet(info.pet.type, RULES.petEvo(info.pet.plvl)); pet.position.set(0.9, 0, 1); pet.rotation.y = -0.5; scene.add(pet); }
    // el arma que lleva, colgada en la pared
    if (info.weapon) { const w = mm.weapon(info.weapon.base, info.weapon.rarity); w.position.set(1.5, 1.9, -3.25); w.rotation.z = Math.PI / 4; w.scale.setScalar(1.8); scene.add(w); }
    // trofeos: cada jefe derrotado en su pedestal
    const spots = [];
    for (let i = 0; i < 6; i++) spots.push({ x: -2.6 + i * 1.04 + (i >= 3 ? 0.9 : 0) - 0.45, z: -2.7, r: 0 });
    for (let i = 0; i < 4; i++) { spots.push({ x: -3.9, z: -1.6 + i * 1.3, r: Math.PI / 2 }); spots.push({ x: 3.9, z: -1.6 + i * 1.3, r: -Math.PI / 2 }); }
    const trophies = (info.trophies || []).slice(0, spots.length);
    trophies.forEach((k, i) => {
      const s = spots[i];
      const g = new THREE.Group(); g.position.set(s.x, 0, s.z); g.rotation.y = s.r; scene.add(g);
      mm.mesh(mm.box(0.7, 0.5, 0.7), mm.mat('#4a4a52'), 0, 0.25, 0, g);
      mm.mesh(mm.box(0.78, 0.06, 0.78), mm.mat('#c8a040', { metal: 0.7, rough: 0.35 }), 0, 0.52, 0, g);
      const m = mm.buildEnemy(k);
      const bb = new THREE.Box3().setFromObject(m); const h = Math.max(0.01, bb.max.y - bb.min.y), w = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z);
      m.scale.multiplyScalar(Math.min(0.85 / h, 0.75 / Math.max(0.01, w)));
      m.position.y = 0.55; m.rotation.y = 0.3;
      if (m.userData.gl) mm.posePeek(m, 'Idle', 0.3); else mm.animate(m, { t: 0 });
      g.add(m);
      addL(s.x * 0.9, 1.4, s.z + (s.r ? 0 : 0.6), RULES.MONSTERS[k] && RULES.MONSTERS[k].world ? '#9a7aff' : '#ffd890', 0.5, 2.4);
    });
    // pez más grande y estandartes de logros
    if (info.stats && info.stats.bigfish) {
      const f = new THREE.Group(); f.position.set(3.0, 1.9, -3.3); scene.add(f);
      mm.mesh(mm.box(0.9, 0.5, 0.05), mm.mat('#5a3a20'), 0, 0, 0, f);
      const body = mm.mesh(mm.sph(0.18, 8, 6), mm.mat('#8aa0b0', { metal: 0.3 }), 0, 0, 0.08, f); body.scale.set(1.8, 0.8, 0.5);
      const tail = mm.mesh(mm.cone(0.12, 0.2, 4), mm.mat('#7a90a0'), 0.38, 0, 0.08, f); tail.rotation.z = Math.PI / 2;
    }
    const n = Math.min(6, Math.floor((info.achievements || []).length / 3));
    for (let i = 0; i < n; i++) { const b = mm.mesh(mm.box(0.4, 0.9, 0.03), mm.mat(['#7a1a1a', '#1a3a7a', '#1a5a2a', '#6a1a6a', '#7a5a1a', '#2a2a2a'][i]), -1.2 + i * 0.5, 2.3, -3.32, scene); b.castShadow = false; mm.mesh(mm.cone(0.2, 0.2, 3), b.material, -1.2 + i * 0.5, 1.78, -3.32, scene).rotation.z = Math.PI; }
    let raf = 0, alive = true;
    const t0 = performance.now();
    const frame = (now) => {
      if (!alive) return;
      const t = (now - t0) / 1000;
      const a = Math.sin(t * 0.25) * 0.5;
      cam.position.set(Math.sin(a) * 6.2, 3.4, 4.6 + Math.cos(a) * 1.4); cam.lookAt(0, 0.9, -0.6);
      mm.animate(hero, { t: now, emote: Math.floor(t / 6) % 3 === 1 ? 'cheers' : null });
      if (pet) mm.animate(pet, { t: now, moving: false });
      for (const l of lights) l.L.intensity = l.i * (0.9 + Math.sin(now / 120 + l.i * 9) * 0.07);
      r.render(scene, cam);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return { stop() { alive = false; cancelAnimationFrame(raf); r.dispose(); } };
  }

  root.VIEW3D = { snapshot, itemArt, makeStage, show, buildMap, fogLayer, THEME, setQuality, qualityInfo, particles, weather, dayCycle, roomView, fxLayer };
})(this);
