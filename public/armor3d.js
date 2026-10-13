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
    } else {
      g.fillStyle = '#8a8a8a'; g.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 900; i++) { const v = 110 + Math.random() * 60 | 0; g.fillStyle = `rgba(${v},${v},${v},0.35)`; g.fillRect(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 3, 1 + Math.random() * 2); }
      g.strokeStyle = 'rgba(40,40,40,0.25)'; for (let i = 0; i < 12; i++) { g.beginPath(); g.moveTo(Math.random() * 128, Math.random() * 128); g.lineTo(Math.random() * 128, Math.random() * 128); g.stroke(); }
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(kind === 'chain' ? 6 : 2, kind === 'chain' ? 6 : 2); t.colorSpace = THREE.SRGBColorSpace;
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
          const x = sx * (hw * 0.95), y = bb.max.y - 0.04;
          put('upperarm' + s, m, sphere(18, 10, 0, Math.PI * 2, 0, Math.PI / 2), x, y, 0, 0, 0, -sx * 0.55, 0.085 * k, 0.07 * k, 0.09 * k);
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
      for (const p of sh.parts) {
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
        if (p === 'dome') put('head', metal, sphere(24, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), 0, y0, z0, 0, 0, 0, R, R * 1.02, R);
        if (p === 'nasal') put('head', metal, box(), 0, y0 - R * 0.2, z0 + R * 0.95, -0.08, 0, 0, R * 0.09, R * 0.6, R * 0.06);
        if (p === 'cheeks') for (const sx of [-1, 1]) put('head', metal, box(), sx * R * 0.86, y0 - R * 0.32, z0 + R * 0.32, 0.1, sx * 0.75, 0, R * 0.09, R * 0.62, R * 0.5);
        if (p === 'greatHelm') { put('head', metal, cyl(1, 1.03, 1, 24), 0, y0 - 0.04, z0, 0, 0, 0, R * 1.02, 0.44, R * 1.02); put('head', metal, sphere(24, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), 0, y0 + 0.18, z0, 0, 0, 0, R * 1.02, 0.08, R * 1.02); put('head', blackM, box(), 0, y0 - 0.06, z0 + R * 1.02, 0, 0, 0, R * 1.3, 0.025, 0.01); put('head', trim, box(), 0, y0 - 0.02, z0 + R * 1.03, 0, 0, 0, 0.03, 0.3, 0.012); for (let i = -2; i <= 2; i++) put('head', blackM, sphere(6, 4), i * 0.035, y0 - 0.15, z0 + R * 1.02, 0, 0, 0, 0.008); }
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
        if (p === 'leatherCap') { put('head', leather, sphere(24, 10, 0, Math.PI * 2, 0, Math.PI * 0.46), 0, y0 + 0.01, z0, 0, 0, 0, R, R * 0.98, R); for (const a of [0, Math.PI / 2, -Math.PI / 2]) put('head', mat('leather', '#2a1a10'), torus(1, 0.006, 24), 0, y0 + 0.01, z0, 0, a, 0, R * 1.01, R * 1.0, R * 1.01); }
        if (p === 'band') put('head', metal, torus(1, 0.016, 32), 0, y0 + 0.05, z0, Math.PI / 2, 0, 0, R * 0.98, R * 0.99, 1);
        if (p === 'brimHat') { put('head', leather, cyl(R * 1.7, R * 1.75, 0.02, 28), 0, y0 + 0.08, z0, 0.05, 0, 0); put('head', leather, cyl(R * 0.82, R * 0.95, 0.2, 24), 0, y0 + 0.18, z0); put('head', mat('trim', sh.trim || C.bronze, r), torus(1, 0.015, 28), 0, y0 + 0.1, z0, Math.PI / 2, 0, 0, R * 0.95, R * 0.95, 1); }
        if (p === 'boneMask') { put('head', boneM, maskGeo(0.75), 0, y0, z0 + 0.01, 0, 0, 0, R * 1.05, R * 1.05, R * 1.1); for (const sx of [-1, 1]) put('head', blackM, sphere(10, 8), sx * 0.08, y0 - 0.05, z0 + R * 1.08, 0, 0, 0, 0.035, 0.03, 0.01); for (let i = -2; i <= 2; i++) put('head', boneM, cone(5), i * 0.03, y0 - 0.18, z0 + R * 1.0, Math.PI, 0, 0, 0.012, 0.04, 0.012); }
        if (p === 'shako') { put('head', cloth, cyl(R * 0.85, R * 0.95, 0.32, 24), 0, y0 + 0.18, z0); put('head', trim, torus(1, 0.016, 28), 0, y0 + 0.04, z0, Math.PI / 2, 0, 0, R * 0.95, R * 0.95, 1); put('head', mat('leather', '#1a1010'), cyl(R * 0.55, R * 0.6, 0.015, 16), 0, y0 + 0.04, z0 + R * 0.7, 0.3, 0, 0); put('head', trim, sphere(10, 8), 0, y0 + 0.2, z0 + R * 0.88, 0, 0, 0, 0.035); }
        if (p === 'plume') put('head', mat('cloth', '#b01a1a'), cone(12), 0, y0 + (sh.parts.includes('shako') ? 0.42 : R + 0.08), z0 - 0.06, -0.5, 0, 0, 0.05, 0.22, 0.03);
        if (p === 'skullHelm') { put('head', boneM, sphere(24, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), 0, y0, z0, 0, 0, 0, R * 1.04, R * 1.04, R * 1.08); put('head', boneM, box(), 0, y0 + 0.05, z0 + R * 1.0, 0.25, 0, 0, 0.16, 0.08, 0.18); for (const sx of [-1, 1]) { put('head', blackM, sphere(8, 6), sx * 0.07, y0 + 0.09, z0 + R * 0.95, 0, 0, 0, 0.03); put('head', boneM, horn(0.2, 0.03, 1.6), sx * R * 0.8, y0 + 0.1, z0 - 0.04, 0, sx * 1.8, -sx * 0.4); } for (let i = -2; i <= 2; i++) put('head', boneM, cone(5), i * 0.03, y0 - 0.0, z0 + R * 1.18, Math.PI, 0, 0, 0.01, 0.05, 0.01); }
        if (p === 'coif') { put('head', chain, hoodGeo(0.72, 0.66), 0, y0, z0 - 0.01, 0, 0, 0, R * 1.07, R * 1.09, R * 1.09); put('head', chain, cyl(1, 1.2, 1, 20, true), 0, y0 - R * 0.95, z0 - 0.02, 0, 0, 0, R * 0.75, 0.1, R * 0.75); }
        if (p === 'aventail') put('head', chain, cyl(1, 1.15, 1, 20, true), 0, y0 - R * 0.9, z0 - 0.04, 0, 0, 0, R * 0.7, 0.09, R * 0.66);
        if (p === 'basinet') { put('head', metal, sphere(24, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), 0, y0, z0, 0, 0, 0, R, R * 1.25, R); put('head', metal, cone(16), 0, y0 + R * 1.28, z0 - 0.02, -0.15, 0, 0, R * 0.3, 0.1, R * 0.3); }
        if (p === 'sallet') { put('head', metal, sphere(24, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), 0, y0, z0, 0, 0, 0, R, R * 1.05, R * 1.04); put('head', metal, cone(16), 0, y0 - 0.06, z0 - R * 0.95, -1.1, 0, 0, R * 0.7, 0.22, 0.05); put('head', mat('cloth', '#0a0808'), box(), 0, y0 - 0.02, z0 + R * 1.0, 0, 0, 0, R * 1.2, 0.022, 0.01); }
        if (p === 'armet') { put('head', metal, sphere(24, 14, 0, Math.PI * 2, 0, Math.PI * 0.75), 0, y0, z0, 0, 0, 0, R * 1.02, R * 1.06, R * 1.04); put('head', metal, box(), 0, y0 - 0.05, z0 + R * 0.95, -0.15, 0, 0, R * 1.3, 0.13, 0.08); for (const y of [-0.03, -0.07]) put('head', blackM, box(), 0, y0 + y, z0 + R * 1.0 + 0.03, 0, 0, 0, R * 1.0, 0.012, 0.01); put('head', trim, box(), 0, y0 + R * 0.6, z0, 0, 0, 0, 0.025, 0.03, R * 1.9); }
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
