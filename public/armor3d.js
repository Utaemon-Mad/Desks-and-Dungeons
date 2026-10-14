// Armaduras que se ven en el personaje: cada base de la tabla ITEMDATA.ARMOR (pecho, casco, guantes y botas;
// tela, cuero, malla y placas; normal, excepcional y élite; cuatro variantes) tiene su aspecto: petos, hombreras,
// faldones, cotas, tabardos, capas, yelmos, capuchas, coronas, guanteletes, grebas…
// Las piezas se colocan sobre el esqueleto KayKit en su postura de reposo (en cruz) y se pegan a los huesos,
// así siguen todas las animaciones. Diseños propios inspirados en el estilo de Diablo 2.
(function (root) {
  'use strict';
  const T = () => root.THREE;
  const lin = (hex) => '#' + new (T().Color)(hex).convertSRGBToLinear().getHexString();

  // ---------- colores ----------
  const C = {
    steel: '#a9aeb7', dark: '#4a4e58', black: '#26262c', gold: '#d9a93a', bronze: '#a8743a', white: '#eceff3', silver: '#cfd5de',
    leather: '#8a5a32', leatherD: '#5a3a20', leatherK: '#3a2616', red: '#8a1a1a', blood: '#5a0e10', blue: '#24357a', purple: '#4a2a6a',
    void: '#1c1428', green: '#3a5a2a', teal: '#1a4a4a', bone: '#e8dcc0', fur: '#cdbb9a', chain: '#8c919a', diamond: '#cfe0f0',
  };

  // ---------- aspecto de cada base: sale de la tabla compartida (public/rules/items-data.js) ----------
  // look: { cloth, metal, trim, parts, cape, glow, shiny, scale, tabard }
  const SPEC = {};
  for (const [slot, types] of Object.entries(root.ITEMDATA.ARMOR)) {
    SPEC[slot] = {};
    for (const [t, tiers] of Object.entries(types)) SPEC[slot][t] = tiers.map((vs) => vs.map((v) => v[2]));
  }
  function spec(slot, gear) {
    const t = gear[slot];
    if (!t || !SPEC[slot] || !SPEC[slot][t]) return null;
    const vs = SPEC[slot][t][Math.min(2, gear[slot + 'T'] || 0)];
    return vs[Math.min(vs.length - 1, Math.max(0, gear[slot + 'S'] | 0))];
  }

  // Ropa y capa que pide el peto (el resto del aspecto lo ponen las piezas)
  function chestStyle(gear) {
    const sp = gear && spec('pecho', gear);
    return sp ? { cloth: sp.cloth, cape: !!sp.cape } : null;
  }

  // ---------- materiales ----------
  const mats = new Map();
  function mat(kind, color, rarity, setTrim) {
    const key = [kind, color, rarity || '', setTrim || ''].join('|');
    if (mats.has(key)) return mats.get(key);
    const THREE = T();
    let c = new THREE.Color(color || '#888888'), emissive = '#000000', ei = 0, rough = 0.85, metal = 0;
    if (kind === 'metal') { rough = 0.32; metal = 0.85; }
    if (kind === 'shiny') { rough = 0.18; metal = 0.95; }
    if (kind === 'chain') { rough = 0.5; metal = 0.75; }
    if (kind === 'leather') rough = 0.7;
    if (kind === 'bone') rough = 0.6;
    if (kind === 'lacquer') { rough = 0.22; metal = 0.15; } // laca japonesa: brillante pero sin ser metal
    if (kind === 'glow') { emissive = color; ei = 1.6; rough = 0.4; }
    // rareza: los mágicos brillan en azul, los raros en amarillo, los únicos se doran
    const metalish = kind === 'metal' || kind === 'shiny' || kind === 'chain' || kind === 'trim' || kind === 'lacquer';
    if (kind === 'trim') { rough = 0.3; metal = 0.8; if (setTrim) c = new THREE.Color(setTrim); }
    if (metalish && rarity === 'magico') { emissive = '#3050ff'; ei = 0.18; }
    if (metalish && rarity === 'raro') { emissive = '#ffcc33'; ei = 0.14; if (kind === 'trim') c = new THREE.Color(C.gold); }
    if (metalish && rarity === 'unico') { c.lerp(new THREE.Color(C.gold), 0.35); emissive = '#ff9a20'; ei = 0.22; }
    const m = new THREE.MeshStandardMaterial({ color: lin('#' + c.getHexString()), roughness: rough, metalness: metal, emissive: lin(emissive), emissiveIntensity: ei });
    // reflejo de ambiente (VIEW3D.metalEnv): sin él el metal sale negro; y el acero, con algo de martillado
    const env = metalish && root.VIEW3D && root.VIEW3D.metalEnv ? root.VIEW3D.metalEnv() : null;
    if (env) { m.envMap = env; m.envMapIntensity = kind === 'shiny' ? 0.95 : kind === 'chain' ? 0.5 : kind === 'lacquer' ? 0.45 : 0.75; }
    if (kind === 'metal' || kind === 'shiny') {
      m.roughnessMap = tex('hammer'); m.roughness = kind === 'shiny' ? 0.42 : 0.72; m.metalness = kind === 'shiny' ? 0.95 : 0.8;
      // el acero ennegrecido o pavonado: menos espejo y algo de color propio, para que no se vea negro del todo
      const hsl = {}; c.getHSL(hsl); if (hsl.l < 0.3) { m.metalness = 0.55; m.roughness = 0.6; }
    }
    if (kind === 'chain') { m.map = tex('chain'); m.color.multiplyScalar(1.6); }
    if (kind === 'leather') m.map = tex('grain');
    mats.set(key, m);
    return m;
  }

  // ---------- geometrías base (en caché; se copian y se colocan) ----------
  const geos = new Map();
  const G = (key, fn) => { if (!geos.has(key)) geos.set(key, fn()); return geos.get(key); };
  const sphere = (ws = 20, hs = 14, p0 = 0, pl = Math.PI * 2, t0 = 0, tl = Math.PI) => G(`s${ws},${hs},${p0.toFixed(3)},${pl.toFixed(3)},${t0.toFixed(3)},${tl.toFixed(3)}`, () => new (T().SphereGeometry)(1, ws, hs, p0, pl, t0, tl));
  const cyl = (rt, rb, h, seg = 16, open = false) => G(`c${rt},${rb},${h},${seg},${open}`, () => new (T().CylinderGeometry)(rt, rb, h, seg, 1, open));
  const box = () => G('box', () => new (T().BoxGeometry)(1, 1, 1));
  const cone = (seg = 10) => G('k' + seg, () => new (T().ConeGeometry)(1, 1, seg));
  const torus = (r, t, ts = 24) => G(`t${r},${t},${ts}`, () => new (T().TorusGeometry)(r, t, 8, ts));
  // trozos de toro y de cilindro (costillas del kabuto y shikoro, que dejan la cara libre)
  const arc = (t, a0, al, ts = 20) => G(`ta${t},${a0},${al}`, () => new (T().TorusGeometry)(1, t, 6, ts, al).rotateZ(a0));
  const cylArc = (rt, rb, gap) => G(`ca${rt},${rb},${gap}`, () => new (T().CylinderGeometry)(rt, rb, 1, 22, 1, true, gap, Math.PI * 2 - gap * 2));
  // media caja redondeada (peto y espaldar): una esfera estirada hacia las esquinas para abrazar el torso
  const shell = (backSide) => G('shell' + (backSide ? 'b' : 'f'), () => {
    const g = new (T().SphereGeometry)(1, 28, 18, backSide ? Math.PI : 0, Math.PI, 0, Math.PI);
    const p = g.attributes.position, k = 0.55;
    for (let i = 0; i < p.count; i++) { const f = (v) => Math.sign(v) * Math.pow(Math.abs(v), k); p.setXYZ(i, f(p.getX(i)), f(p.getY(i)) * 0.98, f(p.getZ(i))); }
    g.computeVertexNormals();
    return g;
  });
  // capucha / almófar: casquete que baja hasta la nuca con un hueco solo para la cara
  const hoodGeo = (tl, hole) => G(`hood${tl},${hole}`, () => {
    const THREE = T(), g = new THREE.SphereGeometry(1, 28, 18, 0, Math.PI * 2, 0, Math.PI * tl);
    const p = g.attributes.position, idx = g.index.array, keep = [];
    const face = new THREE.Vector3(0, -0.35, 1).normalize(), v = new THREE.Vector3();
    const inHole = (i) => v.set(p.getX(i), p.getY(i), p.getZ(i)).normalize().dot(face) > Math.cos(hole);
    for (let i = 0; i < idx.length; i += 3) if (!(inHole(idx[i]) && inHole(idx[i + 1]) && inHole(idx[i + 2]))) keep.push(idx[i], idx[i + 1], idx[i + 2]);
    g.setIndex(keep);
    return g;
  });
  // máscara: solo la parte de la esfera que cae sobre la cara
  const maskGeo = (ang) => G('mask' + ang, () => {
    const THREE = T(), g = new THREE.SphereGeometry(1, 28, 18);
    const p = g.attributes.position, idx = g.index.array, keep = [];
    const face = new THREE.Vector3(0, -0.1, 1).normalize(), v = new THREE.Vector3();
    const inside = (i) => v.set(p.getX(i), p.getY(i), p.getZ(i)).normalize().dot(face) > Math.cos(ang);
    for (let i = 0; i < idx.length; i += 3) if (inside(idx[i]) && inside(idx[i + 1]) && inside(idx[i + 2])) keep.push(idx[i], idx[i + 1], idx[i + 2]);
    g.setIndex(keep);
    return g;
  });
  // menpō: la mitad de abajo de la cara (de la nariz a la barbilla)
  const maskLowGeo = () => G('maskLow', () => {
    const THREE = T(), g = new THREE.SphereGeometry(1, 28, 18);
    const p = g.attributes.position, idx = g.index.array, keep = [];
    const face = new THREE.Vector3(0, -0.45, 1).normalize(), v = new THREE.Vector3();
    const inside = (i) => { v.set(p.getX(i), p.getY(i), p.getZ(i)); return v.y < -0.12 && v.clone().normalize().dot(face) > Math.cos(0.85); };
    for (let i = 0; i < idx.length; i += 3) if (inside(idx[i]) && inside(idx[i + 1]) && inside(idx[i + 2])) keep.push(idx[i], idx[i + 1], idx[i + 2]);
    g.setIndex(keep);
    return g;
  });
  // ---------- yelmos con forma: casquete de perfil ojival o redondo que baja por los lados y la nuca ----------
  // o: apex (0 redondo … 1 apuntado), front/side/back (hasta qué ángulo desde arriba baja por delante, por los lados y
  // por detrás; π/2 es la altura de las cejas), faceW (medio ancho de la abertura de la cara), flare (cuánto se abre el
  // borde), tail (cola de la celada por detrás), beak (pico de la visera), depth (largo de delante atrás).
  // a: ángulo alrededor (0 = la cara), t: de 0 (arriba) a 1 (el borde). Todo en unidades de una cabeza de radio 1.
  const HELM = {
    nasal: { apex: 0.3, front: 0.5, side: 0.63, back: 0.67, faceW: 0.8, flare: 0.04 },
    cap: { apex: 0.25, front: 0.47, side: 0.6, back: 0.63, faceW: 0.85, flare: 0.02 },
    basinet: { apex: 1.0, front: 0.49, side: 0.71, back: 0.75, faceW: 0.62, flare: 0.03 },
    sallet: { apex: 0.12, front: 0.6, side: 0.64, back: 0.7, faceW: 1.0, flare: 0.07, tail: 0.17 },
    armet: { apex: 0.06, front: 0.79, side: 0.74, back: 0.73, faceW: 1.1, flare: 0.04, beak: 0.34 },
    great: { apex: 0, front: 0.8, side: 0.8, back: 0.8, faceW: 1.2, flare: 0.0, flat: 0.62, keel: 0.12 },
  };
  const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  function helmPhi(o, a) {
    const c = Math.cos(a), aa = Math.abs(Math.atan2(Math.sin(a), c));
    const fs = smooth(o.faceW + 0.35, o.faceW, aa); // 1 en la cara, 0 en los lados
    const sb = smooth(Math.PI * 0.55, Math.PI, aa); // 0 en los lados, 1 en la nuca
    return Math.PI * (o.side + (o.front - o.side) * fs + (o.back - o.side) * sb + (o.tail || 0) * sb * sb);
  }
  function helmPt(o, a, t, lift = 1) {
    const pm = helmPhi(o, a), ph = t * pm, c = Math.cos(a);
    let sx = Math.sin(ph) * Math.sin(a), y = Math.cos(ph), sz = Math.sin(ph) * c;
    if (o.flat) { // gran yelmo: cilindro con tapa casi plana
      const top = o.flat, k = Math.min(1, ph / 0.55);
      const rr = 0.86 + 0.16 * smooth(0, 1, k);
      sx = Math.sin(a) * rr * (ph < 0.06 ? ph / 0.06 : 1); sz = c * rr * (ph < 0.06 ? ph / 0.06 : 1);
      y = ph < 0.55 ? top + 0.12 * (1 - k * k) : top - (ph - 0.55) / (pm - 0.55) * (top + 0.92);
      if (o.keel) sz += o.keel * Math.pow(Math.max(0, c), 8) * (ph > 0.3 ? 1 : ph / 0.3);
    } else {
      y *= 1 + (o.apex || 0) * 0.42 * Math.pow(Math.max(0, y), 4);
      const fl = 1 + (o.flare || 0) * smooth(pm - 0.35, pm, ph) + (o.tail || 0) * 1.4 * smooth(pm - 0.6, pm, ph) * Math.max(0, -c);
      sx *= fl; sz *= fl;
      if (o.beak) { const b = o.beak * Math.pow(Math.max(0, c), 6) * smooth(Math.PI * 0.36, Math.PI * 0.5, ph) * smooth(Math.PI * 0.8, Math.PI * 0.6, ph); sz += b; }
    }
    return [sx * lift, y * lift, sz * (o.depth || 1.08) * lift];
  }
  const helmGeo = (name) => G('helm' + name, () => {
    const THREE = T(), o = HELM[name], N = 48, M = 16, pos = [], uv = [], idx = [];
    for (let i = 0; i <= N; i++) for (let j = 0; j <= M; j++) { const a = i / N * Math.PI * 2; pos.push(...helmPt(o, a, j / M)); uv.push(i / N * 4, j / M * 2); }
    for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) { const A = i * (M + 1) + j, B = (i + 1) * (M + 1) + j; idx.push(A, A + 1, B, B, A + 1, B + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  });
  // tubo por la superficie del yelmo: el borde (t = 1), un meridiano (a fijo) o un paralelo (t fijo); f(s) da [a, t]
  const helmLine = (key, name, f, r, lift = 1.012, closed = false, n = 48) => G('hl' + name + key, () => {
    const THREE = T(), o = HELM[name], pts = [];
    for (let i = 0; i <= n; i++) { const [a, t] = f(i / n); pts.push(new THREE.Vector3(...helmPt(o, a, t, lift))); }
    if (closed) pts.pop();
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, closed), n * 2, r, 6, closed);
  });
  // trozo de la superficie (carrilleras, visera): a de a0 a a1, t de t0 a t1(a)
  const helmPatch = (key, name, a0, a1, t0, t1, lift) => G('hp' + name + key, () => {
    const THREE = T(), o = HELM[name], N = 14, M = 10, pos = [], idx = [];
    for (let i = 0; i <= N; i++) for (let j = 0; j <= M; j++) { const a = a0 + (a1 - a0) * i / N, tt = t0 + (t1(a) - t0) * j / M; pos.push(...helmPt(o, a, tt, lift)); }
    for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) { const A = i * (M + 1) + j, B = (i + 1) * (M + 1) + j; idx.push(A, A + 1, B, B, A + 1, B + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    return g;
  });
  // perfil plano extruido (nasal)
  const extrude2 = (key, pts, depth) => G('x' + key, () => {
    const THREE = T(), sh = new THREE.Shape();
    pts.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
    const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1 });
    g.translate(0, 0, -depth / 2); g.computeVertexNormals(); return g;
  });
  // el mismo material por las dos caras (por la abertura de la cara se ve el interior del yelmo)
  const ds = new Map();
  const twoSided = (m) => { if (!ds.has(m)) { const c = m.clone(); c.side = T().DoubleSide; ds.set(m, c); } return ds.get(m); };

  // texturas pintadas: anillas de la cota y grano del cuero
  const texs = new Map();
  function tex(kind) {
    if (texs.has(kind)) return texs.get(kind);
    const THREE = T(), c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    if (kind === 'chain') {
      g.fillStyle = '#5a5e66'; g.fillRect(0, 0, 128, 128);
      for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
        const cx = x * 16 + (y % 2) * 8, cy = y * 14;
        g.strokeStyle = '#2a2c30'; g.lineWidth = 4; g.beginPath(); g.ellipse(cx, cy, 7, 6, 0, 0, Math.PI * 2); g.stroke();
        g.strokeStyle = '#e8ecf2'; g.lineWidth = 2; g.beginPath(); g.ellipse(cx, cy, 7, 6, 0, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
      }
    } else if (kind === 'hammer') {
      // acero martillado: manchas suaves de más y menos brillo (mapa de rugosidad)
      g.fillStyle = '#5a5a5a'; g.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 260; i++) { const v = 60 + Math.random() * 90 | 0, r = 3 + Math.random() * 9; g.fillStyle = `rgba(${v},${v},${v},0.22)`; g.beginPath(); g.arc(Math.random() * 128, Math.random() * 128, r, 0, Math.PI * 2); g.fill(); }
      for (let i = 0; i < 40; i++) { g.strokeStyle = 'rgba(150,150,150,0.18)'; g.beginPath(); const y = Math.random() * 128; g.moveTo(0, y); g.lineTo(128, y + Math.random() * 6 - 3); g.stroke(); }
    } else {
      g.fillStyle = '#8a8a8a'; g.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 900; i++) { const v = 110 + Math.random() * 60 | 0; g.fillStyle = `rgba(${v},${v},${v},0.35)`; g.fillRect(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 3, 1 + Math.random() * 2); }
      g.strokeStyle = 'rgba(40,40,40,0.25)'; for (let i = 0; i < 12; i++) { g.beginPath(); g.moveTo(Math.random() * 128, Math.random() * 128); g.lineTo(Math.random() * 128, Math.random() * 128); g.stroke(); }
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(kind === 'chain' ? 6 : 2, kind === 'chain' ? 6 : 2); if (kind !== 'hammer') t.colorSpace = THREE.SRGBColorSpace;
    texs.set(kind, t);
    return t;
  }
  // cuerno curvado que se afila
  function horn(len, r0, curl, seg = 10) {
    return G(`h${len},${r0},${curl}`, () => {
      const THREE = T(), pts = [];
      for (let i = 0; i <= 4; i++) { const t = i / 4; pts.push(new THREE.Vector3(0, Math.sin(t * curl) * len / curl, (1 - Math.cos(t * curl)) * len / curl)); }
      const curve = new THREE.CatmullRomCurve3(pts), fr = curve.computeFrenetFrames(seg, false);
      const pos = [], idx = [], rs = 8;
      for (let i = 0; i <= seg; i++) {
        const t = i / seg, p = curve.getPointAt(t), r = r0 * (1 - t) + 0.002;
        for (let j = 0; j < rs; j++) { const a = j / rs * Math.PI * 2, n = fr.normals[i], b = fr.binormals[i]; pos.push(p.x + (n.x * Math.cos(a) + b.x * Math.sin(a)) * r, p.y + (n.y * Math.cos(a) + b.y * Math.sin(a)) * r, p.z + (n.z * Math.cos(a) + b.z * Math.sin(a)) * r); }
      }
      for (let i = 0; i < seg; i++) for (let j = 0; j < rs; j++) { const a = i * rs + j, b = i * rs + (j + 1) % rs; idx.push(a, a + rs, b, b, a + rs, b + rs); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      return g;
    });
  }
  // ala: forma plana con plumas
  function wingGeo() {
    return G('wing', () => {
      const THREE = T(), s = new THREE.Shape();
      s.moveTo(0, 0); s.quadraticCurveTo(0.05, 0.16, 0.02, 0.3); s.lineTo(-0.04, 0.22); s.lineTo(-0.06, 0.26); s.lineTo(-0.09, 0.16); s.lineTo(-0.12, 0.18); s.quadraticCurveTo(-0.1, 0.05, 0, 0);
      const g = new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1 });
      g.computeVertexNormals(); return g;
    });
  }

  // ======================================================================
  //  Montaje: las piezas se juntan por hueso y material en una sola malla
  // ======================================================================
  function build(rootObj, gear, o = {}) {
    if (!gear) return;
    const THREE = T();
    const P = rootObj.userData.parts;
    if (!P || !P.model) return;
    const bones = {};
    P.model.traverse((c) => { if (c.isBone) bones[c.name] = c; });
    rootObj.updateMatrixWorld(true);
    // medidas del cuerpo y de la cabeza (en reposo), con la malla ya deformada por el esqueleto: así cuentan la
    // cabeza más pequeña y el tronco más largo de las proporciones humanas (humanize, en models.js)
    let body = null;
    P.model.traverse((c) => { if (c.isSkinnedMesh && /_Body$/.test(c.name)) body = c; });
    const bb = body ? new THREE.Box3().setFromObject(body, true) : new THREE.Box3(new THREE.Vector3(-0.18, 0.17, -0.16), new THREE.Vector3(0.18, 0.59, 0.16));
    const hw = (bb.max.x - bb.min.x) / 2, hd = (bb.max.z - bb.min.z) / 2;
    const hb = P.headMesh ? new THREE.Box3().setFromObject(P.headMesh, true) : new THREE.Box3(new THREE.Vector3(-0.24, 0.54, -0.21), new THREE.Vector3(0.24, 1.02, 0.23));
    const hc = hb.getCenter(new THREE.Vector3()), hr = (hb.max.x - hb.min.x) / 2;
    const groups = new Map();
    const tmp = new THREE.Object3D();
    // pone una copia de la geometría g en (x,y,z) con giro (rx,ry,rz) y escala (sx,sy,sz), pegada al hueso
    // zoom: agranda un poco las piezas alrededor de un punto (guantes y botas, para que se lean bien desde lejos)
    let zoom = null;
    const put = (bone, material, g, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => {
      if (!bones[bone]) return;
      if (zoom) { const [px, py, pz, k] = zoom; x = px + (x - px) * k; y = py + (y - py) * k; z = pz + (z - pz) * k; sx *= k; sy *= k; sz *= k; }
      tmp.position.set(x, y, z); tmp.rotation.set(rx, ry, rz); tmp.scale.set(sx, sy, sz); tmp.updateMatrix();
      const key = bone + '|' + material.uuid;
      if (!groups.has(key)) groups.set(key, { bone, material, list: [] });
      const gg = g.index ? g.toNonIndexed() : g.clone();
      for (const n of Object.keys(gg.attributes)) if (n !== 'position' && n !== 'normal' && n !== 'uv') gg.deleteAttribute(n);
      if (!gg.attributes.uv) gg.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(gg.attributes.position.count * 2), 2));
      groups.get(key).list.push(gg.applyMatrix4(tmp.matrix));
    };
    const both = (fn) => { fn(1, 'l'); fn(-1, 'r'); };
    // giro de una placa colgada alrededor de la cintura: mira hacia fuera (ángulo th) y se abre por abajo (tilt)
    const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), eu = new THREE.Euler();
    const around = (th, tilt) => {
      qa.setFromAxisAngle(new THREE.Vector3(Math.cos(th), 0, -Math.sin(th)), tilt).multiply(qb.setFromAxisAngle(new THREE.Vector3(0, 1, 0), th));
      eu.setFromQuaternion(qa); return [eu.x, eu.y, eu.z];
    };
    // grosor de brazos y piernas (malla ya deformada) para que mangas y quijotes abracen la extremidad
    const limbR = {};
    P.model.traverse((c) => {
      if (!c.isSkinnedMesh) return;
      const m = /_(Arm|Leg)(Left|Right)$/.exec(c.name);
      if (!m) return;
      const b3 = new THREE.Box3().setFromObject(c, true);
      limbR[m[1].toLowerCase()] = m[1] === 'Arm' ? (b3.max.z - b3.min.z) / 2 : Math.min(b3.max.x - b3.min.x, b3.max.z - b3.min.z) / 2;
    });
    // tubo que va de un hueso al siguiente (de la articulación a, hasta una fracción del camino a b), pegado al primero
    const up = new THREE.Vector3(0, 1, 0), qq = new THREE.Quaternion(), ee = new THREE.Euler();
    const tube = (bone, next, m, r0, r1, from = 0, to = 1, seg = 14) => {
      if (!bones[bone] || !bones[next]) return;
      const a = bones[bone].getWorldPosition(new THREE.Vector3()), b = bones[next].getWorldPosition(new THREE.Vector3());
      const d = b.clone().sub(a), len = d.length() * (to - from);
      const mid = a.clone().addScaledVector(d, (from + to) / 2);
      ee.setFromQuaternion(qq.setFromUnitVectors(up, d.normalize()));
      put(bone, m, cyl(r1, r0, 1, seg, true), mid.x, mid.y, mid.z, ee.x, ee.y, ee.z, 1, len, 1);
    };
    const rar = (slot) => gear[slot + 'R'];
    const setTrim = o.setTrim || null;

    // ---------------- pecho ----------------
    const sc = spec('pecho', gear);
    if (sc) {
      const r = rar('pecho');
      const metal = mat(sc.shiny ? 'shiny' : 'metal', sc.metal, r), trim = mat('trim', sc.trim, r, setTrim), leather = mat('leather', sc.cloth), dark = mat('leather', '#2a1a10');
      const chain = mat('chain', sc.metal || C.chain, r), clothM = mat('cloth', sc.cloth);
      const cy = (bb.min.y + bb.max.y) / 2 - 0.01;
      const fr = (k = 1) => [hw * 1.02 * k, (bb.max.y - bb.min.y) * 0.34, hd * 1.0 * k];
      const front = shell(false), back = shell(true);
      const chestTier = gear.pechoT || 0, chestType = gear.pecho;
      // punto de la superficie del peto (shell) para pegar adornos encima: x, y del personaje -> z
      const fz = (x, y, lift = 0.003) => {
        const [a, b, c] = fr(), X = Math.max(-0.999, Math.min(0.999, x / a)), Y = Math.max(-0.999, Math.min(0.999, (y - cy - 0.02) / (b * 0.98)));
        const x0 = Math.sign(X) * Math.pow(Math.abs(X), 1 / 0.55), y0 = Math.sign(Y) * Math.pow(Math.abs(Y), 1 / 0.55);
        return 0.005 + Math.pow(Math.sqrt(Math.max(0, 1 - x0 * x0 - y0 * y0)), 0.55) * (c + 0.01) + lift;
      };
      // cordón por la superficie del peto (filos, costuras): lista de [x, y]
      const piping = (m, xy, rr) => { const v = xy.map(([x, y]) => new THREE.Vector3(x, y, fz(x, y, rr * 0.6))); if (v.length > 1) put('chest', m, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(v), v.length * 3, rr, 5, false), 0, 0, 0); };
      const span = (n, f) => [...Array(n + 1)].map((_, i) => f(i / n));
      for (const p of sc.parts) {
        if (p === 'breast') { const [a, b, c] = fr(); put('chest', metal, front, 0, cy + 0.02, 0.005, 0, 0, 0, a, b, c + 0.01); }
        if (p === 'back') { const [a, b, c] = fr(); put('chest', metal, back, 0, cy + 0.02, -0.005, 0, 0, 0, a, b, c); }
        if (p === 'ridge') { put('chest', metal, box(), 0, cy + 0.02, hd * 1.12, 0, 0, 0, 0.025, 0.22, 0.02); for (const y of [-0.06, 0.02]) put('chest', metal, box(), 0, cy + y, hd * 1.06, 0, 0, 0, hw * 1.7, 0.012, 0.02); }
        if (p === 'ornate') { put('chest', trim, sphere(16, 12), 0, cy + 0.04, hd * 1.15, 0, 0, 0, 0.04, 0.04, 0.015); put('chest', trim, torus(0.055, 0.008), 0, cy + 0.04, hd * 1.13, 0, 0, 0); for (const sx of [-1, 1]) put('chest', trim, box(), sx * hw * 0.55, cy - 0.02, hd * 1.08, 0, sx * 0.5, sx * 0.25, 0.012, 0.16, 0.012); }
        if (p === 'vest') { const [a, b, c] = fr(0.98); put('chest', leather, front, 0, cy + 0.02, 0, 0, 0, 0, a, b, c); put('chest', leather, back, 0, cy + 0.02, 0, 0, 0, 0, a, b, c); }
        if (p === 'carapace') { const [a, b, c] = fr(); put('chest', metal, front, 0, cy + 0.02, 0.004, 0, 0, 0, a, b, c + 0.01); put('chest', metal, back, 0, cy + 0.02, 0, 0, 0, 0, a, b, c); for (let i = 0; i < 4; i++) put('chest', trim, box(), 0, cy - 0.07 + i * 0.045, hd * 1.08, 0, 0, 0, hw * 1.6 - i * 0.02, 0.008, 0.02); }
        if (p === 'mail') { const [a, b, c] = fr(0.995); put('chest', chain, front, 0, cy + 0.02, 0, 0, 0, 0, a, b, c); put('chest', chain, back, 0, cy + 0.02, 0, 0, 0, 0, a, b, c); }
        if (p === 'studs') for (let i = 0; i < 4; i++) for (let j = -2; j <= 2; j++) { const x = j * hw * 0.3, y = cy - 0.06 + i * 0.05; put('chest', trim, sphere(8, 6), x, y, Math.sqrt(Math.max(0, 1 - (x / (hw * 1.03)) ** 2)) * hd * 1.09 + 0.002, 0, 0, 0, 0.012); }
        if (p === 'scales') { const sm = mat(sc.shiny ? 'shiny' : 'metal', sc.scale || sc.metal, r); for (let i = 0; i < 5; i++) for (let j = -3; j <= 3; j++) { const x = (j + (i % 2) * 0.5) * hw * 0.24; if (Math.abs(x) > hw * 0.9) continue; const y = cy + 0.08 - i * 0.04, z = Math.sqrt(Math.max(0, 1 - (x / (hw * 1.03)) ** 2)) * hd * 1.08 + 0.006; put('chest', sm, sphere(10, 6, 0, Math.PI * 2, 0, Math.PI / 2), x, y, z, Math.PI / 2 + 0.4, 0, 0, 0.032, 0.02, 0.026); } }
        if (p === 'quilt') for (const y of [-0.07, -0.01, 0.05]) put('chest', dark, torus(1, 0.012, 32), 0, cy + y, 0, Math.PI / 2, 0, 0, hw * 1.02, hd * 1.08, 1);
        if (p === 'sash') put('chest', trim, box(), 0, cy, hd * 1.06, 0, 0, 0.75, 0.05, (bb.max.y - bb.min.y) * 0.8, 0.012);
        if (p === 'straps') for (const sx of [-1, 1]) put('chest', dark, box(), 0, cy + 0.01, hd * 1.1, 0, 0, sx * 0.6, 0.03, (bb.max.y - bb.min.y) * 0.75, 0.012);
        if (p === 'belt') { put('hips', dark, torus(1, 0.02, 32), 0, bb.min.y + 0.045, 0, Math.PI / 2, 0, 0, hw * 1.04, hd * 1.1, 1); put('hips', trim, box(), 0, bb.min.y + 0.045, hd * 1.12, 0, 0, 0, 0.045, 0.04, 0.012); }
        if (p === 'faulds') { put('hips', metal, cyl(1, 1.12, 1, 20, true), 0, bb.min.y + 0.01, 0, 0, 0, 0, hw * 1.05, 0.07, hd * 1.12); both((sx, s) => put('upperleg' + s, metal, box(), sx * 0.075, bb.min.y - 0.04, hd * 0.75, 0.12, 0, 0, 0.09, 0.08, 0.016)); }
        if (p === 'mailSkirt') put('hips', chain, cyl(1, 1.18, 1, 20, true), 0, bb.min.y - 0.02, 0, 0, 0, 0, hw * 1.03, 0.1, hd * 1.08);
        if (p === 'tabard') { const tm = mat('cloth', sc.tabard || C.red); put('chest', tm, box(), 0, cy - 0.02, hd * 1.14, 0, 0, 0, hw * 0.8, (bb.max.y - bb.min.y) * 0.7, 0.01); put('hips', tm, box(), 0, bb.min.y - 0.05, hd * 1.1, 0.1, 0, 0, hw * 0.75, 0.14, 0.01); put('chest', trim, box(), 0, cy + 0.02, hd * 1.15 + 0.006, 0, 0, Math.PI / 4, 0.05, 0.05, 0.006); }
        if (p === 'gorget') put('chest', metal, torus(1, 0.03, 24), 0, bb.max.y - 0.02, 0, Math.PI / 2, 0, 0, hw * 0.55, hd * 0.6, 1);
        if (p === 'collar') put('chest', mat('cloth', sc.cloth), cyl(1, 0.8, 1, 20, true), 0, bb.max.y + 0.015, -0.01, -0.2, 0, 0, hw * 0.62, 0.07, hd * 0.68);
        if (p === 'trimNeck') put('chest', trim, torus(1, 0.012, 28), 0, bb.max.y - 0.03, 0.005, Math.PI / 2, 0, 0, hw * 0.6, hd * 0.66, 1);
        if (p === 'runes' && sc.glow) { const gm = mat('glow', sc.glow); for (const [x, y] of [[0, 0.02], [-hw * 0.45, -0.05], [hw * 0.45, -0.05]]) put('chest', gm, box(), x, cy + y, Math.sqrt(Math.max(0, 1 - (x / (hw * 1.03)) ** 2)) * hd * 1.09 + 0.004, 0, 0, Math.PI / 4, 0.022, 0.022, 0.004); }
        // ---- samurái: dō lacado con sus lamas atadas, sode (hombreras de placas), kusazuri (faldón) y mon ----
        if (p === 'doBands') {
          const lac = mat('lacquer', sc.cloth, r), lace = mat('cloth', sc.trim);
          const [a, b, c] = fr();
          put('chest', lac, front, 0, cy + 0.02, 0.005, 0, 0, 0, a, b, c + 0.01); put('chest', lac, back, 0, cy + 0.02, -0.005, 0, 0, 0, a, b, c);
          for (let i = 0; i < 5; i++) put('chest', lace, torus(1, 0.007, 36), 0, cy - 0.09 + i * 0.042, 0, Math.PI / 2, 0, 0, hw * (1.05 - (i === 4 ? 0.06 : 0)), hd * 1.13, 1);
          for (const x of [-0.5, -0.17, 0.17, 0.5]) put('chest', lace, box(), x * hw, cy - 0.01, Math.sqrt(Math.max(0, 1 - (x * 1.0) ** 2)) * hd * 1.1, 0, x * 0.9, 0, 0.012, 0.17, 0.008);
        }
        if (p === 'sode' || p === 'sodeBig' || p === 'sodeSmall') both((sx, s) => {
          const A = bones['upperarm' + s], B = bones['lowerarm' + s];
          if (!A || !B) return;
          const a = A.getWorldPosition(new THREE.Vector3()), b = B.getWorldPosition(new THREE.Vector3());
          const n = p === 'sodeBig' ? 5 : p === 'sodeSmall' ? 3 : 4, wz = p === 'sodeBig' ? 0.19 : p === 'sodeSmall' ? 0.12 : 0.15;
          const lac = mat('lacquer', sc.cloth, r), lace = mat('cloth', sc.trim), ar = (limbR.arm || 0.05);
          // en reposo el brazo está en cruz: las lamas van sobre él y, al bajar el brazo, cuelgan por fuera
          for (let i = 0; i < n; i++) {
            const k = 0.05 + i * 0.16, x = a.x + (b.x - a.x) * k, y = a.y + (b.y - a.y) * k + ar * 1.45 - i * 0.004;
            put('upperarm' + s, lac, box(), x, y, a.z, 0, 0, sx * 0.18, 0.05, 0.012, wz);
            put('upperarm' + s, lace, box(), x + sx * 0.012, y + 0.007, a.z, 0, 0, sx * 0.18, 0.006, 0.004, wz * 0.98);
          }
        });
        if (p === 'kusazuri') {
          const lac = mat('lacquer', sc.cloth, r), lace = mat('cloth', sc.trim);
          for (let i = 0; i < 8; i++) {
            const th = i / 8 * Math.PI * 2, sxn = Math.sin(th), bone = Math.abs(sxn) > 0.5 ? (sxn > 0 ? 'upperlegl' : 'upperlegr') : 'hips';
            const R = 1.12, x = sxn * hw * R, z = Math.cos(th) * hd * R * 1.05, y = bb.min.y - 0.06;
            const [rx, ry, rz] = around(th, -0.22);
            put(bone, lac, box(), x, y, z, rx, ry, rz, hw * 0.62, 0.14, 0.012);
            for (const dy of [-0.045, 0, 0.045]) put(bone, lace, box(), x + sxn * 0.007, y + dy, z + Math.cos(th) * 0.007, rx, ry, rz, hw * 0.6, 0.007, 0.006);
          }
        }
        if (p === 'mon') { put('chest', trim, torus(0.04, 0.008), 0, cy + 0.05, hd * 1.15, 0, 0, 0); put('chest', trim, sphere(10, 8), 0, cy + 0.05, hd * 1.14, 0, 0, 0, 0.022, 0.022, 0.008); }
        // hombreras (pegadas al brazo para que acompañen el movimiento)
        const pad = (sx, s, m, k, extra) => {
          const x = sx * (hw * 0.95), y = bb.max.y - 0.04, th = -sx * 0.55;
          put('upperarm' + s, m, sphere(18, 10, 0, Math.PI * 2, 0, Math.PI / 2), x, y, 0, 0, 0, th, 0.085 * k, 0.07 * k, 0.09 * k);
          // remaches por el borde (en las de metal) o pespunte (en las de cuero)
          const rv = m === leather ? dark : chestTier ? trim : mat('metal', '#5e626c', r);
          for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2, lx = Math.cos(a) * 0.08 * k, lz = Math.sin(a) * 0.085 * k; if (lx * sx < -0.02 * k) continue; put('upperarm' + s, rv, sphere(8, 6), x + lx * Math.cos(th), y + lx * Math.sin(th) + 0.004, lz, 0, 0, 0, m === leather ? 0.006 : 0.0075); }
          if (extra) extra(x, y);
        };
        if (p === 'pads') both((sx, s) => pad(sx, s, leather, 0.9));
        if (p === 'padsBig') both((sx, s) => pad(sx, s, leather, 1.15, (x, y) => put('upperarm' + s, trim, torus(0.085, 0.008), x + sx * 0.01, y - 0.005, 0, Math.PI / 2, 0, -sx * 0.55)));
        if (p === 'padSpikes') both((sx, s) => pad(sx, s, leather, 1, (x, y) => { for (const dz of [-0.04, 0, 0.04]) put('upperarm' + s, mat('bone', C.bone), cone(), x + sx * 0.03, y + 0.06, dz, 0, 0, -sx * 0.5, 0.014, 0.06, 0.014); }));
        if (p === 'shellPads') both((sx, s) => { pad(sx, s, metal, 1.15); pad(sx, s, metal, 0.85, null); });
        if (p === 'pauldronSmall') both((sx, s) => pad(sx, s, metal, 0.9));
        if (p === 'pauldronRound') both((sx, s) => pad(sx, s, metal, 1.15, (x, y) => put('upperarm' + s, trim, torus(0.098, 0.01, 28), x + sx * 0.01, y - 0.005, 0, Math.PI / 2, 0, -sx * 0.55)));
        if (p === 'pauldronLayer') both((sx, s) => { pad(sx, s, metal, 1.2, (x, y) => { for (let i = 1; i <= 2; i++) put('upperarm' + s, metal, sphere(18, 8, 0, Math.PI * 2, 0, Math.PI / 2), x + sx * 0.03 * i, y - 0.035 * i, 0, 0, 0, -sx * (0.55 + 0.25 * i), 0.09, 0.05, 0.095); put('upperarm' + s, trim, torus(0.1, 0.009, 28), x + sx * 0.01, y - 0.005, 0, Math.PI / 2, 0, -sx * 0.55); }); });
        if (p === 'pauldronSpike') both((sx, s) => pad(sx, s, metal, 1.25, (x, y) => { for (const [dz, h] of [[-0.05, 0.08], [0, 0.12], [0.05, 0.08]]) put('upperarm' + s, metal, cone(), x + sx * 0.03, y + 0.07 + h * 0.3, dz, 0, 0, -sx * 0.35, 0.018, h, 0.018); }));
        if (p === 'pauldronWing') both((sx, s) => pad(sx, s, metal, 1.3, (x, y) => { put('upperarm' + s, trim, torus(0.11, 0.01, 28), x + sx * 0.01, y - 0.005, 0, Math.PI / 2, 0, -sx * 0.55); put('upperarm' + s, metal, wingGeo(), x + sx * 0.02, y + 0.02, -0.03, 0, sx > 0 ? 0 : Math.PI, -sx * 0.2, 0.9); }));
      }
      // brazos: las corazas llevan brazales de placas y las cotas, mangas de malla (hasta el codo)
      const ar = (limbR.arm || 0.05) * 1.18;
      const metalChest = sc.parts.some((p) => p === 'breast' || p === 'carapace');
      if (sc.parts.includes('doBands')) both((sx, s) => tube('upperarm' + s, 'lowerarm' + s, mat('cloth', sc.trim), ar * 0.95, ar * 0.9, 0.1, 1.0));
      if (metalChest || sc.parts.includes('mail')) both((sx, s) => tube('upperarm' + s, 'lowerarm' + s, metalChest ? metal : chain, ar, ar * 0.92, 0.1, 1.02));
      if (metalChest) both((sx, s) => tube('lowerarm' + s, 'wrist' + s, metal, ar * 0.94, ar * 0.86, 0.05, 0.6));
      if (sc.glow && (sc.parts.includes('breast') || sc.parts.includes('collar'))) put('chest', mat('glow', sc.glow), sphere(10, 8), 0, cy + 0.04, hd * 1.16, 0, 0, 0, 0.018);
      // ---- adornos según el tipo y el nivel: remaches, filos dorados, costuras, hebillas, emblemas y gemas ----
      {
        const [A, B] = fr(), Y = (k) => cy + 0.02 + k * B * 0.98, has = (n) => sc.parts.includes(n);
        const gemM = mat('glow', sc.glow || (chestTier === 2 ? '#d8102a' : '#4a7aff'));
        const rivetRow = (m, k, n, w, s = 0.0075) => { for (let i = 0; i < n; i++) { const x = (i / (n - 1) - 0.5) * 2 * w * A; put('chest', m, sphere(8, 6), x, Y(k), fz(x, Y(k), 0.002), 0, 0, 0, s); } };
        const emblem = (m, k, rays) => { const y = Y(k), z = fz(0, y, 0.004); put('chest', m, torus(0.032, 0.006, 24), 0, y, z); for (let i = 0; i < rays; i++) { const a = i / rays * Math.PI * 2; put('chest', m, cone(5), Math.sin(a) * 0.05, y + Math.cos(a) * 0.05, fz(Math.sin(a) * 0.05, y + Math.cos(a) * 0.05, 0.004), Math.PI / 2 * 0, 0, -a, 0.008, 0.03, 0.004); } put('chest', gemM, sphere(12, 8), 0, y, z + 0.004, 0, 0, 0, 0.016, 0.016, 0.01); };
        if (has('breast') || has('carapace')) {
          const rv = chestTier ? trim : mat('metal', '#5e626c', r);
          rivetRow(rv, 0.8, 7, 0.55); rivetRow(rv, -0.86, 9, 0.7);
          piping(metal, span(10, (q) => [0, Y(-0.85 + q * 1.6)]), 0.006); // arista del peto
          if (chestTier >= 1) {
            for (const sx of [-1, 1]) piping(trim, span(10, (q) => [sx * A * (0.62 - 0.08 * q), Y(-0.8 + q * 1.55)]), 0.0055);
            piping(trim, span(12, (q) => [(q - 0.5) * 1.2 * A, Y(0.74 - 0.12 * Math.cos((q - 0.5) * Math.PI))]), 0.0055);
            piping(trim, span(12, (q) => [(q - 0.5) * 1.5 * A, Y(-0.78)]), 0.0055);
          }
          if (chestTier >= 2 && !has('ornate')) emblem(trim, 0.15, 8);
        }
        if (has('vest')) {
          const st = mat('leather', '#24160c');
          for (const sx of [-1, 1]) for (let i = 0; i < 9; i++) { const x = sx * A * 0.55, y = Y(-0.8 + i * 0.19); put('chest', st, box(), x, y, fz(x, y, 0.001), 0, 0, 0, 0.004, 0.016, 0.003); }
          // lazada del frente
          for (let i = 0; i < 5; i++) { const y = Y(-0.5 + i * 0.25); for (const sx of [-1, 1]) put('chest', st, box(), 0, y, fz(0, y, 0.002), 0, 0, sx * 0.7, 0.004, 0.05, 0.003); put('chest', chestTier ? trim : mat('metal', '#8a8e96', r), sphere(6, 4), 0.022, y, fz(0.022, y, 0.002), 0, 0, 0, 0.005); put('chest', chestTier ? trim : mat('metal', '#8a8e96', r), sphere(6, 4), -0.022, y, fz(-0.022, y, 0.002), 0, 0, 0, 0.005); }
          // hebillas de las correas de los lados
          for (const sx of [-1, 1]) { const x = sx * A * 0.8, y = Y(-0.2); put('chest', st, box(), x, y, fz(x, y, 0.001), 0, sx * 0.6, 0, 0.012, 0.05, 0.004); put('chest', trim, torus(0.012, 0.003, 10), x, y, fz(x, y, 0.004), 0, sx * 0.6, 0); }
          if (chestTier >= 1) { piping(trim, span(10, (q) => [(q - 0.5) * 1.3 * A, Y(0.78)]), 0.004); for (let i = 0; i < 6; i++) { const x = (i / 5 - 0.5) * 1.2 * A; put('chest', trim, sphere(6, 4), x, Y(-0.84), fz(x, Y(-0.84), 0.002), 0, 0, 0, 0.007); } }
          if (chestTier >= 2) emblem(trim, 0.35, 6);
        }
        if (has('mail')) {
          if (!has('belt')) { put('hips', dark, torus(1, 0.018, 32), 0, bb.min.y + 0.05, 0, Math.PI / 2, 0, 0, hw * 1.05, hd * 1.11, 1); put('hips', trim, box(), 0, bb.min.y + 0.05, hd * 1.13, 0, 0, 0, 0.04, 0.036, 0.01); }
          if (chestTier >= 1) { put('chest', trim, torus(1, 0.009, 32), 0, bb.max.y - 0.025, 0.004, Math.PI / 2, 0, 0, hw * 0.62, hd * 0.68, 1); if (has('mailSkirt')) put('hips', trim, torus(1, 0.01, 36), 0, bb.min.y - 0.065, 0, Math.PI / 2, 0, 0, hw * 1.17, hd * 1.22, 1); }
          if (chestTier >= 2) emblem(trim, 0.3, 6);
        }
        if (chestType === 'tela') {
          // bordados: franja del frente (orfrey) y cuello; gemas en las mejores
          const emb = mat('cloth', sc.trim || '#c8a050');
          put('chest', emb, box(), 0, cy - 0.01, hd * 1.08, 0, 0, 0, 0.045, (bb.max.y - bb.min.y) * 0.8, 0.008);
          if (chestTier >= 1) { put('chest', trim, torus(1, 0.008, 32), 0, bb.max.y - 0.03, 0.005, Math.PI / 2, 0, 0, hw * 0.6, hd * 0.66, 1); for (let i = 0; i < 4; i++) put('chest', trim, box(), 0, cy + 0.12 - i * 0.07, hd * 1.1, 0, 0, Math.PI / 4, 0.016, 0.016, 0.006); }
          if (chestTier >= 2) for (let i = 0; i < 3; i++) put('chest', gemM, sphere(10, 8), 0, cy + 0.085 - i * 0.07, hd * 1.11, 0, 0, 0, 0.011);
        }
      }
    }

    // ---------------- casco ----------------
    const sh = spec('casco', gear);
    if (sh) {
      const r = rar('casco');
      const metal = mat('metal', sh.metal || C.steel, r), trim = mat('trim', sh.trim || C.gold, r, setTrim), cloth = mat('cloth', sh.cloth || '#555'), leather = mat('leather', sh.cloth || C.leather);
      const chain = mat('chain', sh.cloth || C.chain, r), boneM = mat('bone', C.bone), blackM = mat('cloth', '#0a0808');
      // las piezas están medidas para una cabeza de referencia (la de los modelos KayKit originales) y se escalan a la
      // de este personaje alrededor de su centro; el casco se estira hacia arriba si la cabeza es más alta que ancha
      const RREF = 0.26, R = RREF, y0 = hc.y + 0.045, z0 = hc.z;
      zoom = [hc.x, hc.y, hc.z, hr * 1.07 / RREF];
      // yelmos con forma (HELM): casquete, borde, remaches por la superficie
      const edge = sh.trim ? trim : mat('metal', '#5e626c', r);
      const HS = R * 1.02;
      const at = (name, a, t, lift = 1, k = HS) => { const v = helmPt(HELM[name], a, t, lift); return [v[0] * k, y0 + v[1] * k, z0 + v[2] * k]; };
      const shell = (name, m) => put('head', twoSided(m), helmGeo(name), 0, y0, z0, 0, 0, 0, HS);
      const line = (key, name, m, f, rr, lift, closed, n) => put('head', m, helmLine(key, name, f, rr, lift, closed, n), 0, y0, z0, 0, 0, 0, HS);
      const rim = (name, m, rr = 0.035) => line('rim', name, m, (q) => [q * Math.PI * 2, 1], rr, 1.0, true, 64);
      const rivet = (m, pos, s = 0.0075) => put('head', m, sphere(8, 6), pos[0], pos[1], pos[2], 0, 0, 0, s);
      const rivets = (name, m, n, t, lift = 1.02, a0 = 0, a1 = Math.PI * 2, s) => { for (let i = 0; i < n; i++) rivet(m, at(name, a0 + (a1 - a0) * (i + 0.5) / n, t, lift), s); };
      const black = mat('cloth', '#050404');
      for (const p of sh.parts) {
        // ---- yelmo nasal (spangenhelm): casquete apuntado, cuatro bandas remachadas, borde y nasal ----
        if (p === 'dome') {
          shell('nasal', metal); rim('nasal', edge);
          for (const a of [0.785, 2.356, 3.927, 5.498]) { line('sp' + a, 'nasal', edge, (q) => [a, 0.03 + q * 0.95], 0.022, 1.008, false, 16); for (const t of [0.35, 0.6, 0.85]) rivet(trim, at('nasal', a, t, 1.03), 0.006); }
          rivets('nasal', trim, 18, 0.965, 1.035);
          put('head', edge, sphere(10, 8), ...at('nasal', 0, 0, 1.01), 0, 0, 0, 0.014);
        }
        if (p === 'nasal') {
          const fz = at('nasal', 0, 1, 1.03);
          put('head', twoSided(metal), extrude2('nasalBar', [[-0.014, 0], [0.014, 0], [0.012, -0.11], [0.022, -0.15], [-0.022, -0.15], [-0.012, -0.11]], 0.008), 0, fz[1] + 0.02, fz[2] + 0.004, -0.12, 0, 0, R / RREF);
          put('head', trim, sphere(8, 6), 0, fz[1] + 0.005, fz[2] + 0.012, 0, 0, 0, 0.007);
        }
        // carrilleras: placas que cuelgan del borde y siguen la curva de la cara, con su bisagra
        if (p === 'cheeks') for (const sx of [-1, 1]) {
          const a0 = sx > 0 ? 0.5 : -1.55, a1 = sx > 0 ? 1.55 : -0.5, mid = sx * 1.02;
          put('head', twoSided(metal), helmPatch('ch' + sx, 'nasal', a0, a1, 0.93, (a) => 1.42 - 0.3 * ((a - mid) / 0.52) ** 2, 1.035), 0, y0, z0, 0, 0, 0, HS);
          for (const a of [mid - 0.25, mid + 0.25]) rivet(trim, at('nasal', a, 0.99, 1.06), 0.007);
          rivet(edge, at('nasal', mid, 1.25, 1.06), 0.006);
        }
        // ---- bacinete: casquete ojival que baja hasta la mandíbula; anillas (vervelles) para la malla ----
        if (p === 'basinet') { shell('basinet', metal); rim('basinet', edge, 0.03); rivets('basinet', edge, 22, 0.975, 1.03, 0, Math.PI * 2, 0.006); }
        // visera de pico de perro (bacinete de pico): hocico con rendijas y agujeros para respirar
        if (p === 'hounskull') {
          const c = at('basinet', 0, 1.08, 1.0);
          put('head', twoSided(metal), cone(18), 0, c[1] + 0.005, c[2] + 0.05, Math.PI / 2 + 0.15, 0, 0, R * 0.5, R * 0.85, R * 0.46);
          for (const sx of [-1, 1]) { put('head', black, box(), sx * 0.04, c[1] + 0.045, c[2] + 0.04, 0.5, sx * 0.3, 0, 0.05, 0.008, 0.014); for (let i = 0; i < 3; i++) rivet(black, [sx * (0.03 + i * 0.012), c[1] - 0.05, c[2] + 0.08 + i * 0.015], 0.004); rivet(trim, at('basinet', sx * 1.5, 0.98, 1.05), 0.012); }
        }
        // ---- celada: casquete redondo con cola larga por detrás, rendija de la vista y cresta ----
        if (p === 'sallet') {
          shell('sallet', metal); rim('sallet', edge, 0.03);
          line('slit', 'sallet', black, (q) => [-0.95 + q * 1.9, 0.83], 0.03, 1.012, false, 24);
          line('ridge', 'sallet', edge, (q) => (q < 0.5 ? [0, 0.6 * (1 - q * 2)] : [Math.PI, (q * 2 - 1) * 0.9]), 0.03, 1.01, false, 32);
          rivets('sallet', trim, 10, 0.72, 1.025, Math.PI * 0.55, Math.PI * 1.45, 0.006);
        }
        // ---- armet: yelmo cerrado con visera de pico, rendija, respiraderos, cresta, gola y rodela en la nuca ----
        if (p === 'armet') {
          shell('armet', metal);
          line('slit', 'armet', black, (q) => [-0.85 + q * 1.7, 0.6], 0.032, 1.035, false, 24);
          line('visor', 'armet', edge, (q) => [-1.35 + q * 2.7, 0.53], 0.022, 1.03, false, 24);
          for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) rivet(black, at('armet', 0.3 + j * 0.12, 0.72 + i * 0.05, 1.03), 0.005);
          for (const sx of [-1, 1]) rivet(trim, at('armet', sx * 1.42, 0.56, 1.03), 0.013);
          line('comb', 'armet', sh.trim ? trim : metal, (q) => (q < 0.5 ? [0, 0.45 * (1 - q * 2)] : [Math.PI, (q * 2 - 1) * 0.75]), 0.045, 1.02, false, 32);
          rim('armet', edge, 0.03);
          for (let i = 0; i < 2; i++) put('head', metal, torus(1, 0.06, 32), 0, y0 - R * (1.06 + i * 0.12), z0 - 0.01, Math.PI / 2, 0, 0, R * (0.62 + i * 0.08), R * (0.66 + i * 0.08), R * 0.5);
          { const b = at('armet', Math.PI, 0.86, 1.04); put('head', edge, cyl(1, 1, 1, 18), b[0], b[1], b[2], Math.PI / 2, 0, 0, 0.028, 0.006, 0.028); }
        }
        // ---- gran yelmo: cilindro de tapa plana con quilla, rendijas, respiraderos, cruz de refuerzo y remaches ----
        if (p === 'greatHelm') {
          shell('great', metal);
          for (const sx of [-1, 1]) line('slit' + sx, 'great', black, (q) => [sx * (0.1 + q * 0.75), 0.555], 0.035, 1.01, false, 16);
          for (let i = 0; i < 3; i++) for (let j = 0; j < 5; j++) rivet(black, at('great', 0.22 + j * 0.11, 0.69 + i * 0.045, 1.01), 0.0055);
          line('cross', 'great', edge, (q) => [0, 0.12 + q * 0.86], 0.03, 1.02, false, 24);
          line('brow', 'great', edge, (q) => [-1.25 + q * 2.5, 0.5], 0.028, 1.02, false, 24);
          line('top', 'great', edge, (q) => [q * Math.PI * 2, 0.22], 0.03, 1.0, true, 48);
          rim('great', edge, 0.032); rivets('great', trim, 16, 0.96, 1.03); rivets('great', trim, 12, 0.3, 1.03);
        }
        // ---- gorro de cuero en gajos cosidos, con borde enrollado y botón ----
        if (p === 'leatherCap') {
          const seam = mat('leather', '#24160c');
          shell('cap', leather); rim('cap', mat('leather', sh.cloth ? sh.cloth : C.leatherD), 0.06);
          for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.26; line('seam' + i, 'cap', seam, (q) => [a, 0.02 + q * 0.9], 0.012, 1.006, false, 14); }
          put('head', seam, sphere(10, 8), ...at('cap', 0, 0, 1.01), 0, 0, 0, 0.016);
        }
        // banda de acero remachada (casquete, tachonado, caudillo)
        if (p === 'band') { line('band', 'cap', metal, (q) => [q * Math.PI * 2, 0.8], 0.04, 1.012, true, 48); rivets('cap', trim, 14, 0.8, 1.05, 0, Math.PI * 2, 0.008); }
        if (p === 'aventail') put('head', chain, cylArc(1, 1.32, 0.55), 0, y0 - R * 0.98, z0 - 0.015, 0, 0, 0, R * 0.92, R * 0.55, R * 0.92);
        // ---- samurái: kabuto con costillas y shikoro (cubrenuca en capas), kuwagata (cuernos dorados), menpō, hachimaki y jingasa ----
        if (p === 'kabuto') {
          const lac = mat('lacquer', sh.metal || '#1a1a1e', r), lace = mat('cloth', sh.cloth || '#2a4a9a');
          put('head', lac, sphere(24, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), 0, y0 + 0.01, z0, 0, 0, 0, R * 1.02, R * 0.98, R * 1.02);
          for (let i = 0; i < 6; i++) put('head', trim, arc(0.012, 0, Math.PI), 0, y0 + 0.01, z0, 0, i / 6 * Math.PI, 0, R * 1.03, R * 0.99, R * 1.03);
          put('head', trim, cyl(0.02, 0.03, 0.02, 12), 0, y0 + R * 0.99, z0);
          for (let i = 0; i < 3; i++) {
            put('head', lac, cylArc(1, 1.18, 0.95), 0, y0 - 0.01 - i * 0.045, z0 - 0.01, 0, 0, 0, R * (1.06 + i * 0.1), 0.05, R * (1.06 + i * 0.1));
            put('head', lace, cylArc(1, 1, 0.95), 0, y0 - 0.032 - i * 0.045, z0 - 0.01, 0, 0, 0, R * (1.14 + i * 0.1), 0.006, R * (1.14 + i * 0.1));
          }
          for (const sx of [-1, 1]) put('head', lac, box(), sx * Math.sin(0.95) * R * 1.12, y0 - 0.015, z0 + Math.cos(0.95) * R * 1.12, 0, sx * 1.1, sx * 0.2, 0.012, 0.07, 0.06);
          put('head', lac, box(), 0, y0 + 0.01, z0 + R * 1.0, 0.25, 0, 0, R * 1.5, 0.012, 0.06);
        }
        if (p === 'kuwagata') { for (const sx of [-1, 1]) put('head', trim, box(), sx * 0.045, y0 + R * 0.62, z0 + R * 0.96, 0.15, 0, -sx * 0.32, 0.016, R * 1.15, 0.008); put('head', sh.glow ? mat('glow', sh.glow) : trim, sphere(12, 8), 0, y0 + R * 0.24, z0 + R * 1.03, 0, 0, 0, 0.026, 0.026, 0.01); }
        if (p === 'menpo') {
          put('head', mat('lacquer', '#7a1414', r), maskLowGeo(), 0, y0, z0 + 0.008, 0, 0, 0, R * 1.04, R * 1.04, R * 1.08);
          for (const sx of [-1, 1]) put('head', mat('cloth', '#e8e0d0'), box(), sx * 0.03, y0 - R * 0.42, z0 + R * 1.06, 0, 0, sx * 0.35, 0.05, 0.01, 0.01);
        }
        if (p === 'hachimaki') {
          const band = mat('cloth', sh.cloth || '#eeeeee');
          put('head', band, torus(1, 0.016, 32), 0, y0 + 0.03, z0, Math.PI / 2 - 0.08, 0, 0, R * 1.0, R * 1.02, 1);
          put('head', mat('cloth', sh.trim || '#c8102a'), sphere(10, 8), 0, y0 + 0.04, z0 + R * 1.01, 0, 0, 0, 0.02, 0.02, 0.006);
          for (const sx of [-1, 1]) put('head', band, box(), sx * 0.03, y0 - 0.04, z0 - R * 1.02, 0.35, 0, sx * 0.25, 0.02, 0.12, 0.006);
        }
        if (p === 'jingasa') { put('head', mat('lacquer', sh.metal || '#2a2018', r), cone(24), 0, y0 + R * 0.72, z0, 0, 0, 0, R * 2.0, R * 0.55, R * 2.0); put('head', trim, torus(1, 0.01, 32), 0, y0 + R * 0.46, z0, Math.PI / 2, 0, 0, R * 1.95, R * 1.95, 1); put('head', mat('cloth', sh.cloth || '#c8102a'), sphere(10, 8), 0, y0 + R * 1.0, z0, 0, 0, 0, 0.022); }
        if (p === 'wings') for (const sx of [-1, 1]) put('head', trim, wingGeo(), sx * R * 0.95, y0 + 0.02, z0 - 0.02, 0, sx > 0 ? -0.3 : Math.PI + 0.3, -sx * 0.15, 1.1);
        if (p === 'horns') for (const sx of [-1, 1]) put('head', boneM, horn(0.28, 0.04, 2.2), sx * R * 0.85, y0 + 0.06, z0, 0, sx * 1.4, -sx * 0.6);
        if (p === 'demonHorns') for (const sx of [-1, 1]) put('head', mat('bone', '#3a2a22'), horn(0.36, 0.05, 3.0), sx * R * 0.7, y0 + 0.12, z0 - 0.02, -0.4, sx * 1.6, -sx * 0.3);
        if (p === 'demonMask') { put('head', metal, box(), 0, y0 - 0.1, z0 + R * 0.95, -0.1, 0, 0, R * 1.5, 0.16, 0.04); put('head', mat('glow', sh.glow || '#ff3a2a'), box(), 0, y0 - 0.06, z0 + R * 0.98 + 0.02, 0, 0, 0, R * 1.0, 0.018, 0.01); for (let i = -2; i <= 2; i++) put('head', metal, cone(6), i * 0.04, y0 - 0.2, z0 + R * 0.95, Math.PI, 0, 0, 0.015, 0.05, 0.015); }
        if (p === 'crown') { put('head', trim, cyl(1, 1, 1, 24, true), 0, y0 + 0.15, z0, 0, 0, 0, R * 0.92, 0.06, R * 0.92); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; put('head', trim, cone(6), Math.sin(a) * R * 0.92, y0 + 0.21, z0 + Math.cos(a) * R * 0.92, 0, 0, 0, 0.02, 0.07, 0.02); } for (const [a, col] of [[0, '#d8102a'], [Math.PI / 2, '#2a6aff'], [-Math.PI / 2, '#2aaa4a']]) put('head', mat('glow', col), sphere(10, 8), Math.sin(a) * R * 0.94, y0 + 0.15, z0 + Math.cos(a) * R * 0.94, 0, 0, 0, 0.02); }
        if (p === 'spikes') for (let i = 0; i < 7; i++) { const a = (i / 6 - 0.5) * Math.PI * 0.9; put('head', metal, cone(), Math.sin(a) * R * 0.55, y0 + R * 0.88, z0 + Math.cos(a) * R * 0.2 - 0.03, Math.cos(a) * 0.2 - 0.1, 0, -Math.sin(a) * 0.5, 0.025, 0.14, 0.025); }
        if (p === 'hood') { put('head', cloth, hoodGeo(0.7, 0.72), 0, y0 + 0.01, z0 - 0.015, 0, 0, 0, R * 1.1, R * 1.12, R * 1.12); put('head', cloth, cone(16), 0, y0 - 0.14, z0 - R * 0.8, -0.5, 0, 0, R * 0.75, 0.3, 0.14); }
        if (p === 'point') put('head', cloth, cone(16), 0, y0 + R * 1.15, z0 - 0.08, -0.6, 0, 0, R * 0.5, 0.3, R * 0.5);
        if (p === 'hoodGlow') for (const sx of [-1, 1]) put('head', mat('glow', sh.trim || '#8a5aff'), sphere(8, 6), sx * 0.07, y0 - 0.05, z0 + R * 0.7, 0, 0, 0, 0.02);
        if (p === 'cap') { put('head', cloth, sphere(24, 10, 0, Math.PI * 2, 0, Math.PI * 0.42), 0, y0 + 0.02, z0 - 0.02, -0.15, 0, 0, R * 1.02, R * 0.9, R * 1.05); put('head', trim, torus(1, 0.02, 28), 0, y0 + 0.07, z0 - 0.02, Math.PI / 2 - 0.15, 0, 0, R * 0.93, R * 0.95, 1); }
        if (p === 'turban') { for (let i = 0; i < 4; i++) put('head', cloth, torus(1, 0.045, 28), 0, y0 + 0.07 + i * 0.045, z0 - 0.01, Math.PI / 2 - 0.1, 0, 0.2 * (i % 2 ? 1 : -1), R * (0.95 - i * 0.12), R * (0.97 - i * 0.12), 1); put('head', mat('glow', '#d8102a'), sphere(10, 8), 0, y0 + 0.12, z0 + R * 0.95, 0, 0, 0, 0.03); put('head', trim, torus(0.035, 0.008), 0, y0 + 0.12, z0 + R * 0.93); }
        if (p === 'circlet') { put('head', trim, torus(1, 0.012, 32), 0, y0 + 0.06, z0, Math.PI / 2 - 0.12, 0, 0, R * 0.97, R * 0.99, 1); put('head', mat('glow', '#2a9aff'), sphere(10, 8), 0, y0 + 0.09, z0 + R * 0.98, 0, 0, 0, 0.025); }
        if (p === 'brimHat') { put('head', leather, cyl(R * 1.7, R * 1.75, 0.02, 28), 0, y0 + 0.08, z0, 0.05, 0, 0); put('head', leather, cyl(R * 0.82, R * 0.95, 0.2, 24), 0, y0 + 0.18, z0); put('head', mat('trim', sh.trim || C.bronze, r), torus(1, 0.015, 28), 0, y0 + 0.1, z0, Math.PI / 2, 0, 0, R * 0.95, R * 0.95, 1); }
        if (p === 'boneMask') { put('head', boneM, maskGeo(0.75), 0, y0, z0 + 0.01, 0, 0, 0, R * 1.05, R * 1.05, R * 1.1); for (const sx of [-1, 1]) put('head', blackM, sphere(10, 8), sx * 0.08, y0 - 0.05, z0 + R * 1.08, 0, 0, 0, 0.035, 0.03, 0.01); for (let i = -2; i <= 2; i++) put('head', boneM, cone(5), i * 0.03, y0 - 0.18, z0 + R * 1.0, Math.PI, 0, 0, 0.012, 0.04, 0.012); }
        if (p === 'shako') { put('head', cloth, cyl(R * 0.85, R * 0.95, 0.32, 24), 0, y0 + 0.18, z0); put('head', trim, torus(1, 0.016, 28), 0, y0 + 0.04, z0, Math.PI / 2, 0, 0, R * 0.95, R * 0.95, 1); put('head', mat('leather', '#1a1010'), cyl(R * 0.55, R * 0.6, 0.015, 16), 0, y0 + 0.04, z0 + R * 0.7, 0.3, 0, 0); put('head', trim, sphere(10, 8), 0, y0 + 0.2, z0 + R * 0.88, 0, 0, 0, 0.035); }
        if (p === 'plume') put('head', mat('cloth', '#b01a1a'), cone(12), 0, y0 + (sh.parts.includes('shako') ? 0.42 : R + 0.08), z0 - 0.06, -0.5, 0, 0, 0.05, 0.22, 0.03);
        if (p === 'skullHelm') { put('head', boneM, sphere(24, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), 0, y0, z0, 0, 0, 0, R * 1.04, R * 1.04, R * 1.08); put('head', boneM, box(), 0, y0 + 0.05, z0 + R * 1.0, 0.25, 0, 0, 0.16, 0.08, 0.18); for (const sx of [-1, 1]) { put('head', blackM, sphere(8, 6), sx * 0.07, y0 + 0.09, z0 + R * 0.95, 0, 0, 0, 0.03); put('head', boneM, horn(0.2, 0.03, 1.6), sx * R * 0.8, y0 + 0.1, z0 - 0.04, 0, sx * 1.8, -sx * 0.4); } for (let i = -2; i <= 2; i++) put('head', boneM, cone(5), i * 0.03, y0 - 0.0, z0 + R * 1.18, Math.PI, 0, 0, 0.01, 0.05, 0.01); }
        if (p === 'coif') { put('head', chain, hoodGeo(0.72, 0.66), 0, y0, z0 - 0.01, 0, 0, 0, R * 1.07, R * 1.09, R * 1.09); put('head', chain, cyl(1, 1.2, 1, 20, true), 0, y0 - R * 0.95, z0 - 0.02, 0, 0, 0, R * 0.75, 0.1, R * 0.75); }
      }
    }

    zoom = null;
    // ---------------- guantes ----------------
    const sg = spec('guantes', gear);
    if (sg) {
      const r = rar('guantes');
      const metal = mat(sg.shiny ? 'shiny' : 'metal', sg.metal || C.steel, r), trim = mat('trim', sg.trim || C.gold, r, setTrim);
      const leather = mat('leather', sg.cloth || C.leather), cloth = mat('cloth', sg.cloth || '#ccc'), chain = mat('chain', sg.cloth || C.chain, r);
      both((sx, s) => {
        const W = bones['wrist' + s], H = bones['hand' + s];
        if (!W || !H) return;
        const wp = W.getWorldPosition(new THREE.Vector3()), hp = H.getWorldPosition(new THREE.Vector3());
        const cx = (wp.x + bones['lowerarm' + s].getWorldPosition(new THREE.Vector3()).x) / 2;
        const lowerB = 'lowerarm' + s, handB = 'hand' + s;
        zoom = [wp.x, wp.y, wp.z, 1.12];
        const cuff = (m, len, rad, flare = 1) => put(lowerB, m, cyl(rad * flare, rad, len, 16), wp.x - sx * len / 2 + sx * 0.005, wp.y, wp.z, 0, 0, sx * Math.PI / 2);
        for (const p of sg.parts) {
          if (p === 'kote') {
            // manga de tela con placas lacadas por encima del antebrazo y la mano
            const lac = mat('lacquer', sg.metal || '#1a1a1e', r);
            cuff(cloth, 0.13, 0.05, 1.08);
            for (let i = 0; i < 3; i++) put(lowerB, lac, box(), wp.x - sx * (0.03 + i * 0.04), wp.y + 0.046, wp.z, 0, 0, 0, 0.034, 0.01, 0.05);
            put(lowerB, trim, box(), wp.x - sx * 0.005, wp.y + 0.04, wp.z, 0, 0, 0, 0.008, 0.012, 0.055);
          }
          if (p === 'wraps') for (let i = 0; i < 3; i++) put(lowerB, cloth, torus(0.042, 0.008, 16), wp.x - sx * i * 0.022, wp.y, wp.z, 0, Math.PI / 2, 0.3);
          if (p === 'wrapsLong') for (let i = 3; i < 6; i++) put(lowerB, cloth, torus(0.045, 0.008, 16), wp.x - sx * i * 0.022, wp.y, wp.z, 0, Math.PI / 2, -0.3);
          if (p === 'cuffCloth') cuff(cloth, 0.06, 0.048, 1.15);
          if (p === 'cuffGold') put(lowerB, trim, torus(0.054, 0.008, 18), wp.x - sx * 0.06, wp.y, wp.z, 0, Math.PI / 2, 0);
          if (p === 'runeHand' && sg.glow) put(handB, mat('glow', sg.glow), box(), hp.x + sx * 0.02, hp.y + 0.035, hp.z, 0, 0, Math.PI / 4, 0.02, 0.004, 0.02);
          if (p === 'cuffLeather') cuff(leather, 0.06, 0.047, 1.1);
          if (p === 'cuffFur') { cuff(leather, 0.05, 0.046); put(lowerB, mat('cloth', sg.trim || C.fur), torus(0.05, 0.02, 16), wp.x - sx * 0.06, wp.y, wp.z, 0, Math.PI / 2, 0); }
          if (p === 'bracer') put(lowerB, leather, cyl(0.052, 0.046, 0.11, 16), cx, wp.y, wp.z, 0, 0, sx * Math.PI / 2);
          if (p === 'bracerBig') put(lowerB, leather, cyl(0.062, 0.05, 0.12, 16), cx, wp.y, wp.z, 0, 0, sx * Math.PI / 2);
          if (p === 'studsArm') for (let i = 0; i < 3; i++) put(lowerB, metal, sphere(8, 6), cx - sx * 0.04 + sx * i * 0.04, wp.y + 0.058, wp.z, 0, 0, 0, 0.012);
          if (p === 'cuffChain') cuff(chain, 0.07, 0.048, 1.1);
          if (p === 'cuffPlate') cuff(metal, 0.07, 0.05, 1.2);
          if (p === 'cuffFlare') { cuff(metal, 0.08, 0.05, 1.45); put(lowerB, trim, torus(0.07, 0.008, 20), wp.x - sx * 0.08, wp.y, wp.z, 0, Math.PI / 2, 0); }
          if (p === 'hand') put(handB, sg.parts.includes('cuffChain') ? chain : leather, box(), hp.x + sx * 0.015, hp.y, hp.z, 0, 0, 0, 0.06, 0.065, 0.075);
          if (p === 'handBig') put(handB, sg.parts.includes('cuffChain') ? chain : metal, box(), hp.x + sx * 0.018, hp.y, hp.z, 0, 0, 0, 0.07, 0.075, 0.085);
          if (p === 'handPlate') { put(handB, metal, box(), hp.x + sx * 0.016, hp.y + 0.006, hp.z, 0, 0, 0, 0.065, 0.068, 0.08); put(handB, metal, box(), hp.x + sx * 0.05, hp.y + 0.01, hp.z, 0, 0, 0, 0.02, 0.06, 0.082); }
          if (p === 'knuckleSpikes') for (const dz of [-0.025, 0, 0.025]) put(handB, metal, cone(6), hp.x + sx * 0.05, hp.y + 0.045, hp.z + dz, 0, 0, 0, 0.008, 0.03, 0.008);
          if (p === 'claws') for (const dz of [-0.025, 0, 0.025]) put(handB, mat('bone', '#e8e0d0'), cone(6), hp.x + sx * 0.075, hp.y - 0.01, hp.z + dz, 0, 0, -sx * Math.PI / 2, 0.009, 0.05, 0.009);
        }
        // ---- adornos de los guantes: remaches y nudillos en los de placas, cordones en los brazales, puños bordados ----
        const gt = gear.guantesT || 0, gh = (n) => sg.parts.includes(n);
        if (gh('cuffPlate') || gh('cuffFlare') || gh('handPlate') || gh('handBig')) {
          for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + 0.4; put(lowerB, gt ? trim : mat('metal', '#5e626c', r), sphere(8, 6), wp.x - sx * 0.05, wp.y + Math.cos(a) * 0.056, wp.z + Math.sin(a) * 0.056, 0, 0, 0, 0.0065); }
          if (gh('handPlate') || gh('handBig')) { put(handB, gt ? trim : metal, box(), hp.x + sx * 0.045, hp.y + 0.04, hp.z, 0, 0, 0, 0.012, 0.008, 0.085); for (const dz of [-0.028, 0, 0.028]) put(handB, metal, sphere(8, 6), hp.x + sx * 0.05, hp.y + 0.045, hp.z + dz, 0, 0, 0, 0.008); }
          if (gt >= 1) put(lowerB, trim, torus(0.056, 0.005, 20), wp.x - sx * 0.025, wp.y, wp.z, 0, Math.PI / 2, 0);
          if (gt >= 2) put(lowerB, mat('glow', sg.glow || '#d8102a'), sphere(10, 8), wp.x - sx * 0.06, wp.y + 0.058, wp.z, 0, 0, 0, 0.011);
        }
        if (gh('bracer') || gh('bracerBig') || gh('cuffLeather')) {
          const lace = mat('leather', '#24160c'), bx = gh('cuffLeather') ? wp.x - sx * 0.03 : cx;
          for (let i = -1; i <= 1; i++) put(lowerB, lace, box(), bx + sx * i * 0.03, wp.y + 0.003, wp.z + 0.056, 0, 0, 0, 0.006, 0.04, 0.004);
          if (gt >= 1) for (let i = -1; i <= 1; i++) put(lowerB, trim, sphere(6, 4), bx + sx * i * 0.03, wp.y + 0.058, wp.z, 0, 0, 0, 0.0065);
          if (gt >= 2) put(lowerB, trim, torus(0.016, 0.004, 12), bx, wp.y + 0.06, wp.z, Math.PI / 2, 0, 0);
        }
        if ((gh('cuffCloth') || gh('wraps') || gh('wrapsLong')) && gt >= 1) put(lowerB, trim, torus(0.05, 0.005, 18), wp.x - sx * 0.03, wp.y, wp.z, 0, Math.PI / 2, 0);
      });
    }

    // ---------------- botas ----------------
    const sb = spec('botas', gear);
    if (sb) {
      const r = rar('botas');
      const metal = mat(sb.shiny ? 'shiny' : 'metal', sb.metal || C.steel, r), trim = mat('trim', sb.trim || C.gold, r, setTrim);
      const leather = mat('leather', sb.cloth || C.leather), cloth = mat('cloth', sb.cloth || '#666'), chain = mat('chain', sb.cloth || C.chain, r);
      both((sx, s) => {
        const L = bones['lowerleg' + s], F = bones['foot' + s];
        if (!L || !F) return;
        const lp = L.getWorldPosition(new THREE.Vector3()), fp = F.getWorldPosition(new THREE.Vector3());
        const legB = 'lowerleg' + s, footB = 'foot' + s;
        const shinY = (lp.y + fp.y) / 2;
        const lr = (limbR.leg || 0.05) * 1.12;
        // muslos: las grebas de placas llevan quijote y las de malla, calzas de malla (del faldón a la rodilla)
        if (sb.parts.includes('greave')) tube('upperleg' + s, legB, metal, lr * 1.12, lr, 0.3, 0.98);
        else if (sb.parts.includes('chainLeg')) tube('upperleg' + s, legB, chain, lr * 1.1, lr * 0.98, 0.25, 1);
        zoom = [fp.x, 0, fp.z, 1.1];
        for (const p of sb.parts) {
          if (p === 'suneate') {
            // espinilleras de tablillas lacadas sobre la polaina de tela
            const lac = mat('lacquer', sb.metal || '#1a1a1e', r), h = lp.y - fp.y;
            put(legB, cloth, cyl(0.05, 0.045, h, 14), lp.x, shinY, lp.z, 0, 0, 0);
            for (const k of [-1, 0, 1]) put(legB, lac, box(), lp.x + k * 0.026, shinY + 0.005, lp.z + 0.05 - Math.abs(k) * 0.012, 0, k * 0.5, 0, 0.022, h * 0.82, 0.008);
            put(legB, trim, torus(0.054, 0.005, 16), lp.x, lp.y - 0.02, lp.z, Math.PI / 2, 0, 0);
          }
          if (p === 'haidate') {
            const lac = mat('lacquer', sb.metal || '#1a1a1e', r), U = bones['upperleg' + s];
            if (U) {
              const up = U.getWorldPosition(new THREE.Vector3()), my = (up.y + lp.y) / 2 + 0.02;
              put('upperleg' + s, mat('cloth', sb.cloth || '#2a2a3a'), box(), (up.x + lp.x) / 2, my, lp.z + lr * 0.95, -0.08, 0, 0, lr * 2.3, (up.y - lp.y) * 0.62, 0.01);
              for (let i = 0; i < 3; i++) for (let j = -2; j <= 2; j++) put('upperleg' + s, lac, box(), (up.x + lp.x) / 2 + j * lr * 0.42, my + 0.04 - i * 0.04, lp.z + lr * 0.95 + 0.008, -0.08, 0, 0, lr * 0.36, 0.03, 0.006);
            }
          }
          if (p === 'tabi') put(footB, mat('cloth', '#eceae4'), sphere(14, 10, 0, Math.PI * 2, 0, Math.PI / 2), fp.x, 0.0, fp.z + 0.035, 0, 0, 0, 0.05, 0.05, 0.09);
          if (p === 'waraji') { put(footB, mat('leather', '#c8a868'), box(), fp.x, 0.006, fp.z + 0.035, 0, 0, 0, 0.088, 0.012, 0.155); for (const dz of [0.0, 0.05]) put(footB, mat('cloth', sb.trim || '#2a4a9a'), box(), fp.x, 0.028, fp.z + dz, 0, 0, 0, 0.095, 0.01, 0.012); }
          if (p === 'sandal') { put(footB, leather, box(), fp.x, 0.008, fp.z + 0.035, 0, 0, 0, 0.085, 0.014, 0.15); for (const dz of [0.0, 0.05]) put(footB, mat('leather', '#3a2414'), box(), fp.x, 0.03, fp.z + dz, 0, 0, 0, 0.09, 0.012, 0.014); }
          if (p === 'slipper') put(footB, cloth, sphere(14, 10, 0, Math.PI * 2, 0, Math.PI / 2), fp.x, 0.0, fp.z + 0.035, 0, 0, 0, 0.05, 0.05, 0.09);
          if (p === 'curlToe') put(footB, cloth, horn(0.06, 0.012, 2.5), fp.x, 0.02, fp.z + 0.12, -0.3, 0, 0);
          if (p === 'softBoot') { put(legB, cloth, cyl(0.048, 0.044, lp.y - fp.y + 0.02, 14), lp.x, shinY, lp.z, 0, 0, 0); put(footB, cloth, sphere(14, 10, 0, Math.PI * 2, 0, Math.PI / 2), fp.x, 0.0, fp.z + 0.035, 0, 0, 0, 0.052, 0.055, 0.095); if (sb.trim) put(legB, trim, torus(0.05, 0.007, 16), lp.x, lp.y + 0.01, lp.z, Math.PI / 2, 0, 0); if (sb.glow) put(legB, mat('glow', sb.glow), box(), lp.x, shinY, lp.z + 0.048, 0, 0, Math.PI / 4, 0.016, 0.016, 0.004); }
          if (p === 'boot') { put(legB, leather, cyl(0.05, 0.046, lp.y - fp.y + 0.02, 14), lp.x, shinY, lp.z, 0, 0, 0); put(footB, leather, box(), fp.x, 0.022, fp.z + 0.035, 0, 0, 0, 0.088, 0.045, 0.15); }
          if (p === 'fold') put(legB, mat('leather', sb.cloth ? new THREE.Color(sb.cloth).multiplyScalar(0.8).getStyle() : C.leatherD), cyl(0.06, 0.056, 0.035, 14), lp.x, lp.y + 0.005, lp.z);
          if (p === 'shinSpike') put(legB, mat('bone', C.bone), cone(6), lp.x, shinY + 0.01, lp.z + 0.055, Math.PI / 2 - 0.3, 0, 0, 0.012, 0.05, 0.012);
          if (p === 'shellShin') put(legB, metal, sphere(14, 8, 0, Math.PI, 0, Math.PI), lp.x, shinY, lp.z + 0.005, 0, 0, 0, 0.052, 0.06, 0.06);
          if (p === 'scalesLeg') { const sm = mat('metal', sb.scale || C.steel, r); for (let i = 0; i < 3; i++) put(legB, sm, sphere(10, 6, 0, Math.PI * 2, 0, Math.PI / 2), lp.x, lp.y - 0.015 - i * 0.022, lp.z + 0.05, Math.PI / 2 + 0.4, 0, 0, 0.035, 0.02, 0.03); }
          if (p === 'chainLeg') put(legB, chain, cyl(0.053, 0.05, lp.y - fp.y, 14), lp.x, shinY + 0.01, lp.z, 0, 0, 0);
          if (p === 'greave') { put(legB, metal, sphere(16, 10, 0, Math.PI, 0, Math.PI), lp.x, shinY, lp.z + 0.004, 0, 0, 0, 0.055, 0.058, 0.062); put(legB, metal, cyl(0.05, 0.047, lp.y - fp.y, 14), lp.x, shinY, lp.z, 0, 0, 0); if (sb.trim) put(legB, trim, torus(0.054, 0.006, 16), lp.x, fp.y + 0.01, lp.z, Math.PI / 2, 0, 0); if (sb.glow) put(legB, mat('glow', sb.glow), box(), lp.x, shinY, lp.z + 0.064, 0, 0, 0, 0.012, 0.04, 0.004); }
          if (p === 'kneeCop') put(legB, metal, sphere(14, 10), lp.x, lp.y, lp.z + lr * 0.55, 0, 0, 0, lr * 0.75, lr * 0.7, lr * 0.55);
          if (p === 'kneeSpike') put(legB, metal, cone(6), lp.x, lp.y + 0.01, lp.z + 0.07, Math.PI / 2, 0, 0, 0.012, 0.045, 0.012);
          if (p === 'sabaton') { put(footB, metal, box(), fp.x, 0.024, fp.z + 0.04, 0, 0, 0, 0.09, 0.048, 0.155); for (let i = 0; i < 3; i++) put(footB, metal, box(), fp.x, 0.05, fp.z + 0.04 + i * 0.03, 0.2, 0, 0, 0.085, 0.01, 0.028); }
          if (p === 'layered') for (let i = 0; i < 3; i++) put(legB, metal, torus(0.053, 0.006, 16), lp.x, fp.y + 0.015 + i * 0.022, lp.z, Math.PI / 2, 0, 0);
        }
        // ---- adornos de las botas: remaches y filo en las grebas, hebillas en las de cuero, vuelta bordada en las de tela ----
        const bt = gear.botasT || 0, bh = (n) => sb.parts.includes(n), h = lp.y - fp.y;
        if (bh('greave') || bh('sabaton')) {
          for (const side of [-1, 1]) for (let i = 0; i < 4; i++) put(legB, bt ? trim : mat('metal', '#5e626c', r), sphere(8, 6), lp.x + side * 0.05, fp.y + 0.03 + i * h * 0.22, lp.z + 0.012, 0, 0, 0, 0.006);
          if (bt >= 1) put(legB, trim, box(), lp.x, shinY, lp.z + 0.064, 0, 0, 0, 0.008, h * 0.75, 0.004);
          if (bh('kneeCop') || bt >= 1) put(legB, bt ? trim : metal, torus(1, 0.1, 20), lp.x, lp.y, lp.z + lr * 0.55 + 0.004, 0, 0, 0, lr * 0.62, lr * 0.58, lr * 0.3);
          if (bt >= 2) put(legB, mat('glow', sb.glow || '#d8102a'), sphere(10, 8), lp.x, lp.y + 0.005, lp.z + lr * 0.95, 0, 0, 0, 0.01);
        }
        if (bh('boot') || bh('softBoot') && !bh('slipper')) {
          const strap = mat('leather', '#24160c');
          put(legB, strap, torus(0.052, 0.006, 16), lp.x, fp.y + 0.035, lp.z, Math.PI / 2, 0, 0);
          put(legB, trim, box(), lp.x + sx * 0.04, fp.y + 0.035, lp.z + 0.03, 0, sx * 0.8, 0, 0.016, 0.014, 0.004);
          if (bt >= 1) { put(legB, strap, torus(0.05, 0.006, 16), lp.x, shinY + 0.02, lp.z, Math.PI / 2, 0, 0); put(legB, trim, box(), lp.x + sx * 0.04, shinY + 0.02, lp.z + 0.03, 0, sx * 0.8, 0, 0.016, 0.014, 0.004); }
          if (bt >= 2) put(footB, trim, box(), fp.x, 0.048, fp.z + 0.1, 0.3, 0, 0, 0.06, 0.006, 0.03);
        }
      });
    }

    zoom = null;
    // ---------- juntar y pegar a los huesos ----------
    const merge = THREE.BufferGeometryUtils && THREE.BufferGeometryUtils.mergeGeometries;
    const out = [];
    for (const { bone, material, list } of groups.values()) {
      const geo = merge && list.length > 1 ? merge(list, false) : list[0];
      if (!geo) continue;
      const mesh = new THREE.Mesh(geo, material);
      mesh.castShadow = true; mesh.receiveShadow = true;
      rootObj.add(mesh);
      mesh.updateMatrixWorld(true);
      bones[bone].attach(mesh);
      out.push(mesh);
    }
    P.armor = out;
    return out;
  }

  // ¿Este casco tapa el pelo? (las diademas y coronas no)
  function coversHair(gear) {
    const sh = gear && spec('casco', gear);
    return !!sh && !sh.parts.some((p) => p === 'circlet' || p === 'crown' || p === 'boneMask' || p === 'hachimaki');
  }

  root.ARMOR3D = { build, chestStyle, coversHair, SPEC };
})(this);
