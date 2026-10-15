// Arranque: renderizado con postprocesado, cámara isométrica, héroe (movimiento, habilidades), diálogos y bucle principal.
(() => {
  const TI = window.TI, A = TI.actors, X = TI.tex, H = TI.hud;
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const Q = params.get('q') || 'auto'; // auto | high | low

  // ---------- Renderizador ----------
  const canvas = $('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  let pr = Math.min(window.devicePixelRatio || 1, Q === 'low' ? 1 : 1.5);
  renderer.setPixelRatio(pr);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070504);

  // Cámara ortográfica isométrica: mira desde el sureste (x+, z+) y desde arriba
  const DIR = new THREE.Vector3(1, 1.6, 1).normalize();
  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 1, 220);
  let zoom = 1.3; const VH0 = 8.8;
  const camTarget = new THREE.Vector3(11, 0, 9), camCur = new THREE.Vector3(11, 0, 9);
  function setCamera() {
    const aspect = innerWidth / innerHeight, vh = VH0 / zoom;
    camera.left = -vh * aspect; camera.right = vh * aspect; camera.top = vh; camera.bottom = -vh; camera.updateProjectionMatrix();
  }
  function placeCamera() { camera.position.copy(camCur).addScaledVector(DIR, 80); camera.lookAt(camCur); }

  // Entorno para reflejos (sólo los metales lo notan): cúpula oscura con franjas cálidas y dos focos
  function buildEnv() {
    const env = new THREE.Scene();
    const g = new THREE.SphereGeometry(20, 24, 16), pos = g.attributes.position, col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 20, c = new THREE.Color();
      if (y > 0.1) c.setRGB(0.10, 0.12, 0.18).lerp(new THREE.Color(0.5, 0.55, 0.7), y * 0.5);
      else c.setRGB(0.22, 0.10, 0.04).lerp(new THREE.Color(0.8, 0.35, 0.1), Math.max(0, 1 - Math.abs(y + 0.05) * 6));
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    env.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    for (const [x, y, z, c] of [[-14, 4, -4, 0xffa050], [4, 10, -14, 0xffd8a0], [12, 3, 10, 0x9fb4ff]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(7, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(6), side: THREE.DoubleSide }));
      m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m);
    }
    const pm = new THREE.PMREMGenerator(renderer), rt = pm.fromScene(env, 0.02); pm.dispose();
    scene.environment = rt.texture;
    scene.traverse((o) => { if (o.isMesh && o.material && !Array.isArray(o.material) && o.material.isMeshStandardMaterial) o.material.envMapIntensity = o.material.metalness > 0.3 ? 1.0 : 0.1; });
  }

  // ---------- Postprocesado: AO, brillo (bloom), gradación y grano ----------
  const GradeShader = {
    uniforms: { tDiffuse: { value: null } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
      void main(){
        vec4 c = texture2D(tDiffuse, vUv);
        vec2 q = (vUv - 0.5) * vec2(1.0, 1.1);
        float v = 1.0 - smoothstep(0.28, 0.95, length(q));
        c.rgb *= mix(0.30, 1.0, v);
        float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
        vec3 cool = c.rgb * vec3(0.90, 0.98, 1.08), warm = c.rgb * vec3(1.10, 1.0, 0.86);
        c.rgb = mix(cool, warm, smoothstep(0.04, 0.55, l));
        gl_FragColor = c;
      }`,
  };
  const GrainShader = {
    uniforms: { tDiffuse: { value: null }, uT: { value: 0 } },
    vertexShader: GradeShader.vertexShader,
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uT; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + uT) * 43758.5453); }
      void main(){ vec4 c = texture2D(tDiffuse, vUv); c.rgb += (h(vUv * 900.0) - 0.5) * 0.035; gl_FragColor = c; }`,
  };
  let composer, gtao, bloom, grain;
  function buildComposer() {
    const w = innerWidth, h = innerHeight;
    const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: Q === 'low' ? 0 : 4 });
    composer = new THREE.EffectComposer(renderer, rt);
    composer.setPixelRatio(pr); composer.setSize(w, h);
    composer.addPass(new THREE.RenderPass(scene, camera));
    try {
      gtao = new THREE.GTAOPass(scene, camera, w * pr, h * pr);
      gtao.output = THREE.GTAOPass.OUTPUT.Default;
      gtao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.6, thickness: 1.5, scale: 1.1, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
      gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, radiusExponent: 1, rings: 2, samples: 12 });
      // el AO no debe ver llamas, halos ni cristales de luz (mezcla aditiva)
      gtao.overrideVisibility = function () {
        const c = this._visibilityCache;
        this.scene.traverse((o) => { c.set(o, o.visible); if (o.isPoints || o.isLine || o.isSprite || (o.material && !Array.isArray(o.material) && o.material.blending === THREE.AdditiveBlending)) o.visible = false; });
      };
      gtao.enabled = Q !== 'low';
      composer.addPass(gtao);
    } catch (e) { console.warn('Sin oclusión ambiental:', e); gtao = null; }
    bloom = new THREE.UnrealBloomPass(new THREE.Vector2(w, h), 0.55, 0.7, 0.9);
    composer.addPass(bloom);
    composer.addPass(new THREE.ShaderPass(GradeShader));
    composer.addPass(new THREE.OutputPass());
    grain = new THREE.ShaderPass(GrainShader); composer.addPass(grain);
  }
  function onResize() {
    renderer.setSize(innerWidth, innerHeight, false);
    if (composer) { composer.setPixelRatio(pr); composer.setSize(innerWidth, innerHeight); }
    setCamera();
  }

  // ---------- Sonido (WebAudio sencillo): crepitar, murmullo, golpes ----------
  const SND = { ctx: null, on: true };
  function audioStart() {
    if (SND.ctx) { if (SND.ctx.state === 'suspended') SND.ctx.resume(); return; }
    try {
      const ctx = SND.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const master = SND.master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
      const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
      let b0 = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b0 = 0.98 * b0 + 0.02 * w; d[i] = b0 * 6; } // ruido marrón
      SND.buf = buf;
      const murmur = ctx.createBufferSource(); murmur.buffer = buf; murmur.loop = true;
      const lp = ctx.createBiquadFilter(); lp.type = 'bandpass'; lp.frequency.value = 420; lp.Q.value = 0.7;
      const mg = ctx.createGain(); mg.gain.value = 0.18; murmur.connect(lp).connect(mg).connect(master); murmur.start();
      const fireB = ctx.createBufferSource(); fireB.buffer = buf; fireB.loop = true;
      const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 260;
      const fg = ctx.createGain(); fg.gain.value = 0.22; fireB.connect(fl).connect(fg).connect(master); fireB.start();
      setInterval(() => { if (!SND.on) return; const o = ctx.createBufferSource(); o.buffer = buf; o.playbackRate.value = 1 + Math.random() * 3; const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1800 + Math.random() * 3000; const g = ctx.createGain(); const t = ctx.currentTime; g.gain.setValueAtTime(0.0, t); g.gain.linearRampToValueAtTime(0.10 * Math.random() + 0.03, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0008, t + 0.05 + Math.random() * 0.05); o.connect(f).connect(g).connect(master); o.start(t, Math.random()); o.stop(t + 0.15); }, 160);
    } catch (e) { /* sin audio */ }
  }
  function sfx(kind) {
    const ctx = SND.ctx; if (!ctx || !SND.on) return;
    const t = ctx.currentTime, o = ctx.createBufferSource(); o.buffer = SND.buf; const f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'bandpass'; f.Q.value = 1.2;
    if (kind === 'slash') { f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(3200, t + 0.18); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.28); }
    else if (kind === 'fire') { f.type = 'lowpass'; f.frequency.setValueAtTime(1800, t); f.frequency.exponentialRampToValueAtTime(300, t + 0.7); g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.8); }
    else if (kind === 'dash') { f.frequency.setValueAtTime(500, t); f.frequency.exponentialRampToValueAtTime(1800, t + 0.25); g.gain.setValueAtTime(0.4, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3); }
    else if (kind === 'ward') { f.type = 'lowpass'; f.frequency.value = 700; g.gain.setValueAtTime(0.7, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.6); }
    else { f.frequency.value = 1200; g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12); }
    o.connect(f).connect(g).connect(SND.master); o.start(t, Math.random()); o.stop(t + 0.9);
  }

  // ---------- Estado del héroe ----------
  const hero = { pos: new THREE.Vector3(), yaw: Math.PI, path: [], talk: null, hp: 920, hpMax: 1100, sta: 100, fury: 18, xp: 220, xpMax: 1000, lvl: 12, lock: 0, resting: false, armed: false, staWait: 0, dash: null };
  let room, heroCtl, pointerDown = false, mouse = { x: 0, y: 0 }, lastClickPath = 0;
  const keys = new Set();

  // ---------- Navegación: cuadrícula con A* ----------
  const CS = 0.4, HR = 0.5; let NX, NZ, blocked;
  function buildNav() {
    NX = Math.ceil(room.W / CS); NZ = Math.ceil(room.D / CS); blocked = new Uint8Array(NX * NZ);
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const x = (i + 0.5) * CS, z = (j + 0.5) * CS;
      let b = x < 0.9 || x > room.W - 0.9 || z < 0.9 || z > room.D - 0.9;
      if (!b) for (const c of room.colliders) if (x > c.x0 - HR && x < c.x1 + HR && z > c.z0 - HR && z < c.z1 + HR) { b = true; break; }
      blocked[j * NX + i] = b ? 1 : 0;
    }
  }
  const cellOf = (x, z) => [Math.max(0, Math.min(NX - 1, Math.floor(x / CS))), Math.max(0, Math.min(NZ - 1, Math.floor(z / CS)))];
  function nearestFree(i, j) {
    if (!blocked[j * NX + i]) return [i, j];
    for (let r = 1; r < 30; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      const a = i + di, b = j + dj;
      if (a >= 0 && b >= 0 && a < NX && b < NZ && !blocked[b * NX + a]) return [a, b];
    }
    return [i, j];
  }
  function clearLine(x0, z0, x1, z1) {
    const d = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(d / 0.2);
    for (let k = 0; k <= n; k++) { const t = k / n, [i, j] = cellOf(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t); if (blocked[j * NX + i]) return false; }
    return true;
  }
  function findPath(sx, sz, tx, tz) {
    let [si, sj] = nearestFree(...cellOf(sx, sz)), [ti, tj] = nearestFree(...cellOf(tx, tz));
    const idx = (i, j) => j * NX + i, g = new Float32Array(NX * NZ).fill(1e9), from = new Int32Array(NX * NZ).fill(-1), closed = new Uint8Array(NX * NZ);
    const open = [[0, si, sj]]; g[idx(si, sj)] = 0;
    const hf = (i, j) => Math.hypot(i - ti, j - tj);
    let found = false;
    while (open.length) {
      let bi = 0; for (let k = 1; k < open.length; k++) if (open[k][0] < open[bi][0]) bi = k;
      const [, i, j] = open.splice(bi, 1)[0];
      if (closed[idx(i, j)]) continue; closed[idx(i, j)] = 1;
      if (i === ti && j === tj) { found = true; break; }
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        if (!di && !dj) continue;
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= NX || b >= NZ || blocked[idx(a, b)]) continue;
        if (di && dj && (blocked[idx(i + di, j)] || blocked[idx(i, j + dj)])) continue;
        const ng = g[idx(i, j)] + (di && dj ? 1.414 : 1);
        if (ng < g[idx(a, b)]) { g[idx(a, b)] = ng; from[idx(a, b)] = idx(i, j); open.push([ng + hf(a, b), a, b]); }
      }
    }
    if (!found) return [];
    const cells = []; for (let c = idx(ti, tj); c !== -1; c = from[c]) cells.push([(c % NX + 0.5) * CS, (Math.floor(c / NX) + 0.5) * CS]);
    cells.reverse();
    // suavizado: saltar a la casilla más lejana con línea libre
    const out = []; let k = 0;
    while (k < cells.length - 1) { let far = k + 1; for (let m = cells.length - 1; m > k + 1; m--) if (clearLine(cells[k][0], cells[k][1], cells[m][0], cells[m][1])) { far = m; break; } out.push(cells[far]); k = far; }
    return out;
  }
  // ¿se puede estar en (x,z)? (para esquivar y teclado)
  const freeAt = (x, z) => { const [i, j] = cellOf(x, z); return !blocked[j * NX + i]; };

  // ---------- Efectos ----------
  const fx = [];
  const glowTex = () => (glowTex.t || (glowTex.t = X.glow()));
  function fxSlash() {
    const g = new THREE.Group(); g.position.copy(hero.pos).add(new THREE.Vector3(Math.sin(hero.yaw) * 1.0, 1.3, Math.cos(hero.yaw) * 1.0));
    g.rotation.y = hero.yaw - Math.PI / 2;
    const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.7, 28, 1, -1.05, 2.1), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 2.1, 2.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2 + 0.3; g.add(m); scene.add(g);
    fx.push({ t: 0, life: 0.28, g, upd(f) { const k = f.t / f.life; g.scale.setScalar(0.6 + k * 0.9); m.material.opacity = (1 - k) * (1 - k); g.rotation.y = hero.yaw - Math.PI / 2 + (k - 0.5) * 0.6; }, end() { scene.remove(g); m.geometry.dispose(); m.material.dispose(); } });
  }
  function fxFire() {
    const dirx = Math.sin(hero.yaw), dirz = Math.cos(hero.yaw);
    const tex = X.flame(9);
    for (let i = 0; i < 26; i++) {
      const mat = new THREE.MeshBasicMaterial({ map: X.flame(1 + (i % 6)), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, color: new THREE.Color(1.8, 1.2, 0.8) });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.8), mat); m.geometry.translate(0, 0.9, 0); m.rotation.y = Math.PI / 4;
      const sp = 5 + Math.random() * 5, ang = (Math.random() - 0.5) * 0.7, c = Math.cos(ang), s = Math.sin(ang);
      const vx = (dirx * c + dirz * s) * sp, vz = (dirz * c - dirx * s) * sp, life = 0.45 + Math.random() * 0.4, delay = Math.random() * 0.15;
      m.position.set(hero.pos.x + dirx * 0.8, 0.7 + Math.random() * 0.8, hero.pos.z + dirz * 0.8); m.visible = false; scene.add(m);
      fx.push({ t: -delay, life, upd(f) { if (f.t < 0) return; m.visible = true; const k = f.t / f.life; m.position.x += vx * 0.016; m.position.z += vz * 0.016; m.position.y += 0.012; m.scale.setScalar(0.5 + k * 1.3); mat.opacity = 1 - k * k; }, end() { scene.remove(m); mat.dispose(); m.geometry.dispose(); } });
    }
    const l = new THREE.PointLight(0xff7a2a, 220, 0, 2); l.position.set(hero.pos.x + dirx * 3, 1.5, hero.pos.z + dirz * 3); scene.add(l);
    fx.push({ t: 0, life: 0.7, upd(f) { l.intensity = 220 * (1 - f.t / f.life); l.position.x += dirx * 0.1; l.position.z += dirz * 0.1; }, end() { scene.remove(l); } });
  }
  function fxRing(color, big = 2.4, life = 0.7, y = 0.06) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.0, 40), new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.position.set(hero.pos.x, y, hero.pos.z); scene.add(m);
    fx.push({ t: 0, life, upd(f) { const k = f.t / f.life; m.scale.setScalar(0.4 + k * big); m.material.opacity = (1 - k); }, end() { scene.remove(m); m.geometry.dispose(); m.material.dispose(); } });
  }
  function fxDust(n = 10) {
    for (let i = 0; i < n; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0x9a8268, transparent: true, depthWrite: false, opacity: 0.5 }));
      sp.position.set(hero.pos.x + (Math.random() - 0.5) * 0.6, 0.2, hero.pos.z + (Math.random() - 0.5) * 0.6); sp.scale.setScalar(0.4); scene.add(sp);
      const vx = (Math.random() - 0.5) * 1.2, vz = (Math.random() - 0.5) * 1.2;
      fx.push({ t: 0, life: 0.6, upd(f) { const k = f.t / f.life; sp.position.x += vx * 0.016; sp.position.z += vz * 0.016; sp.position.y += 0.01; sp.scale.setScalar(0.4 + k * 1.0); sp.material.opacity = 0.5 * (1 - k); }, end() { scene.remove(sp); sp.material.dispose(); } });
    }
  }
  function fxClick(x, z) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.38, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 1.1, 0.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.05, z); scene.add(m);
    fx.push({ t: 0, life: 0.5, upd(f) { const k = f.t / f.life; m.scale.setScalar(1 + k * 0.8); m.material.opacity = 1 - k; }, end() { scene.remove(m); m.geometry.dispose(); m.material.dispose(); } });
  }

  // ---------- Habilidades ----------
  const SKILLS = [
    { name: 'Tajo', icon: 'tajo', cd: 1.0, cost: 8, anim: '1H_Melee_Attack_Slice_Diagonal', speed: 1.5, fury: 8, run() { fxSlash(); sfx('slash'); } },
    { name: 'Llamarada', icon: 'llamarada', cd: 5, cost: 22, anim: 'Spellcast_Shoot', speed: 1.1, fury: 14, run() { fxFire(); sfx('fire'); } },
    { name: 'Esquiva', icon: 'esquiva', cd: 3, cost: 12, anim: 'Dodge_Forward', speed: 1.0, fury: 0, run() { sfx('dash'); fxDust(14); hero.dash = { t: 0, dur: 0.4, dist: 3.6, dx: Math.sin(hero.yaw), dz: Math.cos(hero.yaw) }; } },
    { name: 'Guardia', icon: 'guardia', cd: 6, cost: 16, anim: 'Block', speed: 1.0, fury: 10, run() { fxRing(new THREE.Color(2.0, 1.4, 0.7), 2.6, 0.8); sfx('ward'); } },
  ];
  const cdEnd = [0, 0, 0, 0];
  const nowS = () => performance.now() / 1000;
  function useSkill(i, aimAt) {
    const s = SKILLS[i]; if (!s) return;
    if (nowS() < cdEnd[i] || hero.lock > 0) return;
    if (hero.sta < s.cost) { H.toast('Sin aguante'); return; }
    audioStart();
    hero.sta -= s.cost; hero.staWait = 0.9; hero.fury = Math.min(100, hero.fury + s.fury);
    cdEnd[i] = nowS() + s.cd; H.flash(i);
    hero.resting = false; hero.path = []; hero.talk = null; H.hush();
    if (aimAt) hero.yaw = Math.atan2(aimAt.x - hero.pos.x, aimAt.z - hero.pos.z);
    heroCtl.root.rotation.y = hero.yaw;
    const dur = heroCtl.once(s.anim, s.speed);
    hero.lock = Math.min(dur * 0.8, 0.9);
    showSword(true, dur + 0.8);
    s.run();
  }
  // espadas: a la espalda (dos, de acero y de plata) y una en la mano al combatir
  let backSwords = [], handSword = null, drawT = 0;
  function showSword(inHand, t = 0) {
    if (!handSword) return;
    handSword.visible = inHand; backSwords[0].visible = !inHand; drawT = inHand ? t : 0;
  }
  function mountSwords() {
    const chest = heroCtl.node('chest'), hand = heroCtl.node('handslotr');
    if (!chest) return;
    const steel = A.weapon('sword_1handed', 0xb9c4cc), silver = A.weapon('sword_1handed', 0xe8eeff, 0x3a4a6a);
    // el hueso del pecho tiene los mismos ejes que el personaje (+z = delante): empuñaduras sobre los hombros, hojas cruzadas hacia abajo
    for (const [sw, rz, x] of [[steel, Math.PI + 0.5, -0.1], [silver, Math.PI - 0.5, 0.1]]) {
      sw.scale.setScalar(0.5); sw.position.set(x * 1.4, 0.3, -0.5); sw.rotation.set(0.05, 0, rz);
      chest.add(sw); backSwords.push(sw);
    }
    if (hand) { handSword = A.weapon('sword_1handed', 0xdfe6ec); handSword.visible = false; hand.add(handSword); }
  }

  // ---------- Entrada ----------
  const raycaster = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), ndc = new THREE.Vector2();
  function groundAt(cx, cy) {
    ndc.set((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1); raycaster.setFromCamera(ndc, camera);
    const p = new THREE.Vector3(); return raycaster.ray.intersectPlane(plane, p) ? p : null;
  }
  const toScreen = (v) => { const p = v.clone().project(camera); return { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight }; };
  function npcAt(cx, cy) {
    let best = null, bd = 52 * Math.sqrt(zoom);
    for (const n of room.npcs) { const s = toScreen(n.ctl.root.position.clone().add(new THREE.Vector3(0, 1.2, 0))); const d = Math.hypot(s.x - cx, s.y - cy); if (d < bd) { bd = d; best = n; } }
    return best;
  }
  function goTo(x, z, quiet) {
    const p = findPath(hero.pos.x, hero.pos.z, x, z);
    hero.path = p; hero.resting = false;
    if (!quiet) fxClick(p.length ? p[p.length - 1][0] : x, p.length ? p[p.length - 1][1] : z);
  }
  function talkTo(n) {
    audioStart();
    hero.talk = n; goTo(n.near[0], n.near[1], true);
  }
  function arriveTalk(n) {
    const rp = n.ctl.root.position;
    hero.yaw = Math.atan2(rp.x - hero.pos.x, rp.z - hero.pos.z);
    if (n.face) n.ctl.root.rotation.y = Math.atan2(hero.pos.x - rp.x, hero.pos.z - rp.z);
    n.i = n.i || 0;
    const line = n.lines[n.i % n.lines.length]; n.i++;
    n.said = line; n.sayT = 6;
    const s = toScreen(rp.clone().add(new THREE.Vector3(0, 2.8, 0)));
    H.say(n.name, line, s.x, s.y); sfx('click');
    if (!n.met) { n.met = true; gainXp(n.xp); H.toast(`${n.name} · +${n.xp} PE`); }
    hero.talkNpc = n;
  }
  function gainXp(v) {
    hero.xp += v;
    while (hero.xp >= hero.xpMax) { hero.xp -= hero.xpMax; hero.lvl++; hero.hpMax += 40; hero.hp = hero.hpMax; H.level(hero.lvl); H.toast(`¡Nivel ${hero.lvl}!`); fxRing(new THREE.Color(2.2, 1.8, 0.8), 3.2, 1.1); }
  }

  canvas.addEventListener('pointerdown', (e) => {
    audioStart();
    if (e.button === 2) { const g = groundAt(e.clientX, e.clientY); useSkill(0, g); return; }
    pointerDown = true; mouse.x = e.clientX; mouse.y = e.clientY;
    const n = npcAt(e.clientX, e.clientY);
    if (n) { talkTo(n); pointerDown = false; return; }
    hero.talk = null; H.hush();
    const g = groundAt(e.clientX, e.clientY); if (g) goTo(g.x, g.z);
  });
  addEventListener('pointerup', () => { pointerDown = false; });
  canvas.addEventListener('pointermove', (e) => {
    mouse.x = e.clientX; mouse.y = e.clientY;
    const n = npcAt(e.clientX, e.clientY);
    canvas.classList.toggle('pointer', !!n);
    H.tip(n ? n.name : '', e.clientX, e.clientY);
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoom = Math.max(0.65, Math.min(2.6, zoom * (e.deltaY < 0 ? 1.1 : 0.9))); setCamera(); }, { passive: false });
  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    keys.add(k);
    if (k >= '1' && k <= '4') useSkill(+k - 1, groundAt(mouse.x, mouse.y));
    else if (k === 'q') useSkill(1, groundAt(mouse.x, mouse.y));
    else if (k === ' ') { e.preventDefault(); useSkill(2); }
    else if (k === 'r') toggleRest();
    else if (k === 'e') toggleDraw();
    else if (k === 'f') potion();
    else if (k === 'm') { SND.on = !SND.on; if (SND.master) SND.master.gain.value = SND.on ? 0.5 : 0; H.toast(SND.on ? 'Sonido activado' : 'Sonido apagado'); }
    else if (k === 'escape') H.hush();
  });
  addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  H.init(SKILLS, (i) => useSkill(i, groundAt(mouse.x, mouse.y)));
  H.bind('w-sign', () => useSkill(1, groundAt(mouse.x, mouse.y))); H.bind('w-rest', () => toggleRest()); H.bind('w-draw', () => toggleDraw()); H.bind('w-potion', () => potion());
  H.bind('ic-sign', () => useSkill(1)); H.bind('ic-x', () => H.toast('Ajustes: próximamente')); H.bind('gear', () => H.toast('Ajustes: próximamente'));

  function toggleRest() {
    if (hero.lock > 0) return;
    hero.resting = !hero.resting; hero.path = []; hero.talk = null; H.hush();
    H.toast(hero.resting ? 'Descansas junto al fuego…' : 'Te levantas');
  }
  function toggleDraw() { hero.armed = !hero.armed; showSword(hero.armed, hero.armed ? 1e9 : 0); H.toast(hero.armed ? 'Desenvainas' : 'Envainas'); sfx('slash'); }
  let potionCd = 0;
  function potion() {
    if (hero.lock > 0 || nowS() < potionCd) return;
    potionCd = nowS() + 8; hero.path = []; hero.resting = false;
    const dur = heroCtl.once('Use_Item', 1.3); hero.lock = dur * 0.6;
    setTimeout(() => { hero.hp = Math.min(hero.hpMax, hero.hp + 220); H.toast('Poción: +220 de vida'); fxRing(new THREE.Color(0.7, 2.0, 0.8), 1.6, 0.8); sfx('ward'); }, 600);
  }

  // ---------- Retrato (segundo renderizador con su propia escena) ----------
  let portrait = null;
  function buildPortrait() {
    try {
      const pc = $('pc'); const pr2 = new THREE.WebGLRenderer({ canvas: pc, antialias: true, alpha: true });
      pr2.setPixelRatio(1); pr2.setSize(192, 192, false); pr2.toneMapping = THREE.ACESFilmicToneMapping; pr2.toneMappingExposure = 1.1;
      const ps = new THREE.Scene(); ps.background = new THREE.Color(0x1c130d);
      const pcam = new THREE.PerspectiveCamera(22, 1, 0.1, 30); pcam.position.set(0.55, 1.95, 3.6); pcam.lookAt(0, 1.84, 0);
      const key = new THREE.DirectionalLight(0xffb070, 3.2); key.position.set(3, 2.5, 3); ps.add(key);
      const rim = new THREE.DirectionalLight(0x7fa0ff, 1.6); rim.position.set(-3, 2, -2); ps.add(rim);
      ps.add(new THREE.AmbientLight(0x6a5a50, 0.9));
      const c = A.make('cazador'); ps.add(c.root);
      portrait = { r: pr2, s: ps, cam: pcam, c, acc: 0 };
    } catch (e) { console.warn('Sin retrato:', e); }
  }

  // ---------- Polvo en el aire ----------
  let motes;
  function buildMotes() {
    const N = 140, pos = new Float32Array(N * 3), vel = [];
    for (let i = 0; i < N; i++) { pos.set([Math.random() * room.W, 0.5 + Math.random() * 5, Math.random() * room.D], i * 3); vel.push([(Math.random() - 0.5) * 0.12, 0.03 + Math.random() * 0.06, (Math.random() - 0.5) * 0.12]); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const p = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffc890, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, map: X.glow('rgba(255,255,255,1)', 'rgba(255,200,140,0.3)'), toneMapped: false }));
    p.frustumCulled = false; scene.add(p);
    motes = { g, vel, N, upd(dt) { const a = g.attributes.position; for (let i = 0; i < N; i++) { let x = a.getX(i) + vel[i][0] * dt, y = a.getY(i) + vel[i][1] * dt, z = a.getZ(i) + vel[i][2] * dt; if (y > 5.8) y = 0.4; if (x < 0) x = room.W; if (x > room.W) x = 0; if (z < 0) z = room.D; if (z > room.D) z = 0; a.setXYZ(i, x, y, z); } a.needsUpdate = true; } };
  }

  // ---------- Bucle ----------
  const clock = new THREE.Clock(); let T = 0, fpsAcc = 0, fpsN = 0, qLevel = 0, miniT = 0;
  function angleLerp(a, b, k) { let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * Math.min(1, k); }
  function update(dt) {
    T += dt;
    // continuar mientras se mantiene pulsado el ratón
    if (pointerDown && hero.lock <= 0 && T - lastClickPath > 0.18) { lastClickPath = T; const g = groundAt(mouse.x, mouse.y); if (g) goTo(g.x, g.z, true); }
    // teclado (WASD / flechas), relativo a la pantalla: arriba = hacia el noroeste
    let kx = 0, kz = 0;
    if (keys.has('w') || keys.has('arrowup')) { kx -= 1; kz -= 1; }
    if (keys.has('s') || keys.has('arrowdown')) { kx += 1; kz += 1; }
    if (keys.has('a') || keys.has('arrowleft')) { kx -= 1; kz += 1; }
    if (keys.has('d') || keys.has('arrowright')) { kx += 1; kz -= 1; }
    const kmove = kx || kz;
    if (kmove && hero.lock <= 0) { hero.path = []; hero.talk = null; hero.resting = false; H.hush(); }

    hero.lock = Math.max(0, hero.lock - dt);
    let speed = 0, tx = 0, tz = 0;
    if (hero.dash) {
      const d = hero.dash; const step = d.dist * dt / d.dur; d.t += dt;
      const nx = hero.pos.x + d.dx * step, nz = hero.pos.z + d.dz * step;
      if (freeAt(nx, nz)) { hero.pos.x = nx; hero.pos.z = nz; }
      if (d.t >= d.dur) hero.dash = null;
    } else if (hero.lock <= 0 && !hero.resting) {
      const run = keys.has('shift') ? 3.2 : 5.6;
      if (kmove) {
        const l = Math.hypot(kx, kz); tx = kx / l; tz = kz / l; speed = run;
        const nx = hero.pos.x + tx * speed * dt, nz = hero.pos.z + tz * speed * dt;
        if (freeAt(nx, nz)) { hero.pos.x = nx; hero.pos.z = nz; } else if (freeAt(nx, hero.pos.z)) hero.pos.x = nx; else if (freeAt(hero.pos.x, nz)) hero.pos.z = nz; else speed = 0;
      } else if (hero.path.length) {
        const p = hero.path[0], dx = p[0] - hero.pos.x, dz = p[1] - hero.pos.z, d = Math.hypot(dx, dz), step = run * dt;
        if (d <= step) { hero.pos.x = p[0]; hero.pos.z = p[1]; hero.path.shift(); speed = hero.path.length ? run : 0; if (!hero.path.length && hero.talk) { arriveTalk(hero.talk); hero.talk = null; } }
        else { tx = dx / d; tz = dz / d; hero.pos.x += tx * step; hero.pos.z += tz * step; speed = run; }
      }
      if (speed > 0) hero.yaw = angleLerp(hero.yaw, Math.atan2(tx, tz), dt * 14);
    }
    if (!hero.path.length && hero.talk && !kmove) { arriveTalk(hero.talk); hero.talk = null; }
    heroCtl.root.position.set(hero.pos.x, 0, hero.pos.z);
    heroCtl.root.rotation.y = angleLerp(heroCtl.root.rotation.y, hero.yaw, dt * 16);
    if (!hero.dash) {
      if (hero.resting) heroCtl.loop('Sit_Floor_Idle'); else if (speed > 0) heroCtl.loop(speed > 4 ? 'Running_A' : 'Walking_A', 0.15, speed > 4 ? 1.0 : 1.0); else heroCtl.loop('Idle');
    }
    if (drawT > 0 && !hero.armed) { drawT -= dt; if (drawT <= 0) showSword(false); }

    // recursos
    hero.staWait = Math.max(0, hero.staWait - dt);
    if (!hero.staWait) hero.sta = Math.min(100, hero.sta + (hero.resting ? 30 : 14) * dt);
    hero.fury = Math.max(0, hero.fury - 2.5 * dt);
    hero.hp = Math.min(hero.hpMax, hero.hp + (hero.resting ? 18 : 1.2) * dt);
    H.hp(hero.hp, hero.hpMax); H.sta(hero.sta / 100); H.fury(hero.fury / 100); H.xp(hero.xp / hero.xpMax);
    for (let i = 0; i < SKILLS.length; i++) { const left = cdEnd[i] - nowS(); H.cooldown(i, left > 0 ? Math.min(1, left / SKILLS[i].cd) : 0, Math.max(0, left)); }

    // sala y personajes
    room.update(T, dt); heroCtl.update(dt); if (motes) motes.upd(dt);
    for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; f.t += dt; if (f.t >= f.life) { f.end && f.end(); fx.splice(i, 1); } else f.upd(f); }
    // diálogo: el globo sigue a quien habla; se cierra si te alejas
    if (hero.talkNpc) {
      const n = hero.talkNpc, rp = n.ctl.root.position;
      if (Math.hypot(rp.x - hero.pos.x, rp.z - hero.pos.z) > 4.2) { hero.talkNpc = null; H.hush(); }
      else { const s = toScreen(rp.clone().add(new THREE.Vector3(0, 2.8, 0))); H.moveSay(s.x, s.y); }
    }
    // cámara: sigue al héroe sin salirse de la sala
    // la cámara mira un poco al noroeste del héroe, así él queda algo por debajo del centro (como en la referencia)
    if (!TI.freeCam) camTarget.set(Math.max(3.5, Math.min(room.W - 5, hero.pos.x * 0.8 + room.W * 0.1 - 1.8)), 0, Math.max(3.5, Math.min(room.D - 5, hero.pos.z * 0.8 + room.D * 0.1 - 1.8)));
    camCur.lerp(camTarget, 1 - Math.exp(-dt * 4)); placeCamera();
    // luz de sombra sigue a la cámara (así no hace falta una caja enorme)
    // minimapa y retrato
    miniT += dt; if (miniT > 0.05) { miniT = 0; H.mini(room, hero.pos, hero.yaw); }
    if (portrait) { portrait.acc += dt; portrait.c.update(dt); if (portrait.acc > 0.05) { portrait.acc = 0; portrait.r.render(portrait.s, portrait.cam); } }
  }

  function autoQuality(dt) {
    if (Q !== 'auto') return;
    fpsAcc += dt; fpsN++;
    if (fpsAcc > 2.5) {
      const fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0;
      if (fps < 30 && qLevel < 3) {
        qLevel++;
        if (qLevel === 1 && gtao) gtao.enabled = false;
        else if (qLevel === 2) { pr = 1; renderer.setPixelRatio(1); composer.setPixelRatio(1); composer.setSize(innerWidth, innerHeight); }
        else if (qLevel === 3) { room.fire.castShadow = false; room.sun.castShadow = false; bloom.enabled = false; }
      }
    }
  }
  function loop() {
    requestAnimationFrame(loop);
    const dt = Math.min(TI.maxDt || 0.05, clock.getDelta());
    update(dt); autoQuality(dt);
    grain.uniforms.uT.value = T % 10;
    composer.render();
  }

  // ---------- Inicio ----------
  addEventListener('resize', onResize);
  A.load((p) => { $('lp').style.width = (p * 90) + '%'; }).then(() => {
    $('ls').textContent = 'Poniendo la mesa…';
    room = TI.buildRoom(scene);
    heroCtl = A.make('cazador'); scene.add(heroCtl.root);
    hero.pos.copy(room.spawn); heroCtl.root.position.copy(hero.pos); heroCtl.root.rotation.y = hero.yaw;
    mountSwords(); buildEnv(); buildNav(); buildMotes(); buildPortrait(); H.buildMini(room);
    H.level(hero.lvl);
    setCamera(); camCur.set(room.spawn.x * 0.8 + room.W * 0.1 - 1.8, 0, room.spawn.z * 0.8 + room.D * 0.1 - 1.8); camTarget.copy(camCur); placeCamera();
    buildComposer(); onResize();
    $('lp').style.width = '100%';
    setTimeout(() => { $('loading').classList.add('off'); }, 250);
    clock.start(); loop();
    window.TI.dbg = { step(dt, n = 1) { for (let i = 0; i < n; i++) update(dt); }, DIR, scene, camera, renderer, composer, hero, heroCtl, room, gtao, bloom, setZoom(z) { zoom = z; setCamera(); }, camCur, camTarget, goTo, useSkill, talkTo, fx, get zoom() { return zoom; } };
    window.TI.ready = true;
  }).catch((e) => { console.error(e); $('ls').textContent = 'Error al cargar: ' + e.message; });
})();
