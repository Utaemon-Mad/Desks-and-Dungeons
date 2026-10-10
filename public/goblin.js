// Modelo propio de cabeza goblin, hecho a mano con geometría y texturas pintadas en el navegador.
// Sustituye la cabeza KayKit del personaje (el cuerpo y las animaciones siguen siendo los de KayKit) y
// admite todas las opciones de MAP.GOBLIN: forma de la cabeza, orejas, nariz, ojos, mirada, dientes,
// peinado, pendientes, marcas y complexión.
// Las medidas van en las unidades de la geometría de la cabeza KayKit (ancho ≈ 1,09; cara en z ≈ 0,44),
// así el casco y el resto del equipo siguen encajando.
(function (root) {
  'use strict';
  const T = () => root.THREE;
  const V = (x, y, z) => new (T().Vector3)(x, y, z);
  const lin = (hex) => '#' + new (T().Color)(hex).convertSRGBToLinear().getHexString();
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const gauss = (dx, dy, dz, s) => Math.exp(-(dx * dx + dy * dy + dz * dz) / (s * s));

  // Generador pseudoaleatorio con semilla (el mismo aspecto da siempre el mismo goblin)
  function rng(seed) {
    let h = 2166136261;
    for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  }

  // ---------- cachés ----------
  const geoCache = new Map(), matCache = new Map(), texCache = new Map();
  const cached = (map, key, fn) => { if (!map.has(key)) map.set(key, fn()); return map.get(key); };
  function mat(color, o = {}) {
    const key = [color, o.metal || 0, o.rough === undefined ? 0.6 : o.rough, o.emissive || '', o.ei || 0, o.map ? o.map.uuid : '', o.flat ? 1 : 0].join('|');
    return cached(matCache, key, () => new (T().MeshStandardMaterial)({
      color: o.map ? '#ffffff' : lin(color), map: o.map || null, roughness: o.rough === undefined ? 0.6 : o.rough, metalness: o.metal || 0,
      emissive: o.emissive ? lin(o.emissive) : '#000000', emissiveIntensity: o.ei || (o.emissive ? 1 : 0), flatShading: !!o.flat,
    }));
  }

  // ======================================================================
  //  Forma de la cabeza
  // ======================================================================
  const HEADS = [
    { r: [0.45, 0.47, 0.46], c: [0, 1.7, -0.01], back: 0, jaw: 1 },        // redonda
    { r: [0.42, 0.55, 0.5], c: [0, 1.75, -0.04], back: 0.22, jaw: 0.85 },  // alargada (cráneo de pepino hacia atrás)
    { r: [0.54, 0.44, 0.47], c: [0, 1.67, -0.01], back: 0, jaw: 1.45 },     // ancha
    { r: [0.38, 0.4, 0.4], c: [0, 1.62, 0.02], back: 0, jaw: 0.95 },      // pequeña
  ];
  const PHI0 = -Math.PI / 2; // la costura de la esfera queda en la nuca; la cara, en el centro de la textura

  // Curva de la boca: sonrisa torcida (sube por las comisuras)
  const mouthY = (x) => 1.405 + 0.06 * Math.pow(Math.abs(x) / 0.22, 2) + 0.012 * x / 0.22;

  function headGeo(hi) {
    return cached(geoCache, 'head' + hi, () => {
      const H = HEADS[hi];
      const g = new (T().SphereGeometry)(1, 120, 90, PHI0, Math.PI * 2);
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const dx = pos.getX(i), dy = pos.getY(i), dz = pos.getZ(i);
        let x = dx * H.r[0], y = dy * H.r[1], z = dz * H.r[2];
        const front = smooth(0.15, 0.75, dz);
        // cráneo alargado hacia atrás y arriba
        if (H.back) { const b = smooth(-0.2, -0.9, dz) * smooth(-0.3, 0.6, dy); z -= H.back * b; y += H.back * 0.5 * b; }
        // hocico: la parte baja de la cara sale hacia delante; la barbilla, estrecha y picuda
        const ly = H.c[1] + y;
        const muzzle = front * Math.exp(-Math.pow((ly - 1.43) / 0.16, 2)) * Math.exp(-Math.pow(x / 0.3, 2));
        z += 0.075 * muzzle;
        const chin = smooth(1.42, 1.2, ly);
        x *= 1 - 0.32 * chin * (2 - H.jaw);
        z += 0.05 * chin * front;
        y -= 0.04 * chin * front;
        // mejillas huesudas
        for (const sx of [-1, 1]) { const k = gauss(x - sx * 0.29, ly - 1.53, z - 0.3, 0.13); x += sx * 0.035 * k * H.jaw; z += 0.02 * k; }
        // frente con cresta ósea sobre los ojos
        const brow = front * Math.exp(-Math.pow((ly - 1.715) / 0.05, 2)) * Math.exp(-Math.pow(x / 0.36, 4));
        z += 0.05 * brow;
        // cuencas de los ojos
        for (const sx of [-1, 1]) { const k = gauss(x - sx * 0.19, ly - 1.6, (z - 0.4) * 0.6, 0.1); z -= 0.04 * k * front; }
        // surco de la boca, con la sonrisa torcida
        const mk = front * Math.exp(-Math.pow((ly - mouthY(x)) / 0.02, 2)) * Math.exp(-Math.pow(x / 0.235, 6));
        z -= 0.035 * mk;
        // labio de abajo un poco abultado
        const lip = front * Math.exp(-Math.pow((ly - mouthY(x) + 0.035) / 0.025, 2)) * Math.exp(-Math.pow(x / 0.2, 4));
        z += 0.015 * lip;
        // sienes hundidas
        for (const sx of [-1, 1]) { const k = gauss(x - sx * 0.4, ly - 1.75, z - 0.12, 0.12); x -= sx * 0.025 * k; }
        pos.setXYZ(i, x + H.c[0], y + H.c[1], z + H.c[2]);
      }
      g.computeVertexNormals();
      // la costura de la nuca: cada par de vértices repetidos comparte normal
      const W = 121, nor = g.attributes.normal;
      for (let r = 0; r <= 90; r++) {
        const a = r * W, b = r * W + 120;
        const n = V(nor.getX(a) + nor.getX(b), nor.getY(a) + nor.getY(b), nor.getZ(a) + nor.getZ(b)).normalize();
        nor.setXYZ(a, n.x, n.y, n.z); nor.setXYZ(b, n.x, n.y, n.z);
      }
      return g;
    });
  }

  // Punto de la piel en coordenadas de lienzo (textura equirectangular de la esfera)
  function toCanvas(hi, x, y, z, W, Hc) {
    const H = HEADS[hi];
    const d = V((x - H.c[0]) / H.r[0], (y - H.c[1]) / H.r[1], (z - H.c[2]) / H.r[2]).normalize();
    let phi = Math.atan2(d.z, -d.x) - PHI0;
    phi = ((phi % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    return [phi / (2 * Math.PI) * W, Math.acos(clamp(d.y, -1, 1)) / Math.PI * Hc];
  }

  // ---------- textura de la piel ----------
  function skinTexture(hi, skin, marks, seed) {
    return cached(texCache, ['skin', hi, skin, marks, seed].join('|'), () => {
      const W = 2048, H = 1024;
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d');
      const base = new (T().Color)(skin);
      const hex = (col) => '#' + col.getHexString();
      const P = (x, y, z) => toCanvas(hi, x, y, z, W, H);
      const blob = (x, y, z, r, color, a) => {
        const [cx, cy] = P(x, y, z);
        const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
        gr.addColorStop(0, color.replace('A', a)); gr.addColorStop(1, color.replace('A', 0));
        g.fillStyle = gr; g.fillRect(cx - r, cy - r, r * 2, r * 2);
      };
      const rgba = (col) => `rgba(${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)},A)`;
      g.fillStyle = hex(base); g.fillRect(0, 0, W, H);
      const R = rng(seed);
      // piel moteada
      const dark = base.clone().multiplyScalar(0.8), light = base.clone().lerp(new (T().Color)('#fff2b0'), 0.25);
      for (let i = 0; i < 2600; i++) {
        const x = R() * W, y = R() * H, r = 3 + R() * 18;
        g.fillStyle = (R() < 0.5 ? rgba(dark) : rgba(light)).replace('A', 0.05 + R() * 0.07);
        g.beginPath(); g.ellipse(x, y, r, r * (0.6 + R() * 0.6), R() * 3, 0, Math.PI * 2); g.fill();
      }
      // coronilla y nuca más oscuras, hocico más claro, mofletes y nariz sonrosados
      blob(0, 2.2, 0, 520, rgba(base.clone().multiplyScalar(0.78)), 0.55);
      blob(0, 1.48, 0.47, 230, rgba(light), 0.55);
      const blush = base.clone().lerp(new (T().Color)('#d0505a'), 0.45);
      for (const sx of [-1, 1]) blob(sx * 0.27, 1.5, 0.35, 120, rgba(blush), 0.4);
      blob(0, 1.52, 0.47, 70, rgba(blush), 0.35);
      // sombra en las cuencas y bajo la cresta de la frente
      for (const sx of [-1, 1]) blob(sx * 0.19, 1.62, 0.38, 95, rgba(base.clone().multiplyScalar(0.55)), 0.6);
      blob(0, 1.75, 0.44, 160, rgba(base.clone().multiplyScalar(0.85)), 0.35);
      // arruguitas de la frente y patas de gallo
      g.lineCap = 'round';
      const lineAt = (pts, color, w) => { g.strokeStyle = color; g.lineWidth = w; g.beginPath(); pts.forEach(([x, y, z], i) => { const [cx, cy] = P(x, y, z); if (i) g.lineTo(cx, cy); else g.moveTo(cx, cy); }); g.stroke(); };
      const wr = rgba(base.clone().multiplyScalar(0.7));
      for (const yy of [1.82, 1.87]) lineAt([-0.16, -0.05, 0.05, 0.16].map((x, i) => [x, yy + (i % 3 ? 0.006 : 0), 0.4]), wr.replace('A', 0.45), 3);
      for (const sx of [-1, 1]) for (const dy of [-0.03, 0, 0.03]) lineAt([[sx * 0.29, 1.6 + dy * 0.5, 0.3], [sx * 0.34, 1.6 + dy, 0.25]], wr.replace('A', 0.4), 2.5);
      // labios: línea oscura en el surco y comisuras marcadas
      const mouthPts = []; for (let x = -0.23; x <= 0.231; x += 0.02) mouthPts.push([x, mouthY(x), 0.46 - 0.6 * x * x]);
      lineAt(mouthPts, 'rgba(40,10,12,0.9)', 7);
      lineAt(mouthPts.map(([x, y, z]) => [x, y - 0.03, z]), rgba(base.clone().multiplyScalar(0.62)).replace('A', 0.5), 9);
      // ---- marcas ----
      if (marks === 1) { // verrugas: manchas oscuras debajo de cada bulto
        for (const [x, y, z] of WARTS) blob(x, y, z, 26, rgba(base.clone().multiplyScalar(0.55)), 0.7);
      } else if (marks === 2) { // pecas sobre la nariz y los mofletes
        const fr = rgba(base.clone().lerp(new (T().Color)('#3a1a08'), 0.75));
        for (let i = 0; i < 160; i++) {
          const sx = R() < 0.5 ? -1 : 1, x = sx * (0.04 + R() * 0.28), y = 1.48 + R() * 0.12;
          const [cx, cy] = P(x, y, 0.4);
          g.fillStyle = fr.replace('A', 0.6 + R() * 0.35); g.beginPath(); g.arc(cx, cy, 4 + R() * 6, 0, Math.PI * 2); g.fill();
        }
      } else if (marks === 3) { // cicatriz cosida que cruza el ojo izquierdo
        const sc = [[0.08, 1.76, 0.42], [0.17, 1.66, 0.4], [0.25, 1.52, 0.36], [0.3, 1.43, 0.3]];
        lineAt(sc, 'rgba(110,30,30,0.6)', 30);
        lineAt(sc, 'rgba(240,195,175,0.95)', 13);
        for (let i = 0; i < 6; i++) {
          const t = (i + 0.5) / 6, a = sc[Math.floor(t * 3)], b = sc[Math.floor(t * 3) + 1], f = t * 3 % 1;
          const p = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, 0.4];
          const [cx, cy] = P(...p);
          g.strokeStyle = 'rgba(40,15,15,0.9)'; g.lineWidth = 5; g.beginPath(); g.moveTo(cx - 20, cy - 10); g.lineTo(cx + 20, cy + 10); g.stroke();
        }
      } else if (marks === 4) { // pintura de guerra roja: banda sobre los ojos con goterones
        const [x0, y0] = P(-0.42, 1.6, 0.2), [x1] = P(0.42, 1.6, 0.2);
        const [, yt] = P(0, 1.67, 0.42), [, yb] = P(0, 1.55, 0.42);
        g.fillStyle = 'rgba(170,20,20,0.82)';
        g.beginPath(); g.moveTo(x0, yt + 6);
        for (let x = x0; x <= x1; x += 18) g.lineTo(x, yt + Math.sin(x * 0.05) * 5);
        for (let x = x1; x >= x0; x -= 14) g.lineTo(x, yb + (R() < 0.25 ? 18 + R() * 30 : Math.sin(x * 0.07) * 6));
        g.closePath(); g.fill();
        g.fillStyle = 'rgba(170,20,20,0.82)';
        for (const sx of [-1, 1]) { const [cx, cy] = P(sx * 0.12, 1.32, 0.42); g.fillRect(cx - 5, cy - 30, 10, 60); }
        void y0;
      } else if (marks === 5) { // pintura azul tribal: espirales en los mofletes, puntos en la frente, raya en la barbilla
        g.strokeStyle = 'rgba(40,90,200,0.85)'; g.lineWidth = 9;
        for (const sx of [-1, 1]) {
          const [cx, cy] = P(sx * 0.28, 1.5, 0.33);
          g.beginPath(); for (let a = 0; a < 11; a += 0.2) { const r = 4 + a * 4.2; g.lineTo(cx + Math.cos(a * sx) * r, cy + Math.sin(a * sx) * r); } g.stroke();
          lineAt([[sx * 0.12, 1.86, 0.4], [sx * 0.2, 1.78, 0.4], [sx * 0.3, 1.82, 0.32]], 'rgba(40,90,200,0.85)', 8);
        }
        g.fillStyle = 'rgba(40,90,200,0.9)';
        for (const x of [-0.06, 0, 0.06]) { const [cx, cy] = P(x, 1.93, 0.4); g.beginPath(); g.arc(cx, cy, 8, 0, Math.PI * 2); g.fill(); }
        lineAt([[0, 1.36, 0.47], [0, 1.24, 0.42]], 'rgba(40,90,200,0.85)', 14);
      }
      const t = new (T().CanvasTexture)(c);
      t.colorSpace = T().SRGBColorSpace; t.anisotropy = 8;
      return t;
    });
  }
  const WARTS = [[0.27, 1.47, 0.37], [-0.12, 1.8, 0.42], [0.05, 1.29, 0.42], [-0.3, 1.58, 0.3]];

  // ---------- textura de pelo: mechones que salen de la coronilla ----------
  function hairTexture(col) {
    return cached(texCache, 'hair|' + col, () => {
      const W = 1024, H = 512, c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d'), base = new (T().Color)(col);
      g.fillStyle = '#' + base.getHexString(); g.fillRect(0, 0, W, H);
      const R = rng('pelo' + col);
      for (let i = 0; i < 2200; i++) {
        const x = R() * W, y0 = R() * H * 0.2, len = 60 + R() * 300;
        const k = 0.65 + R() * 0.6, cc = base.clone().multiplyScalar(k);
        g.strokeStyle = `rgba(${Math.min(255, cc.r * 255) | 0},${Math.min(255, cc.g * 255) | 0},${Math.min(255, cc.b * 255) | 0},${0.25 + R() * 0.4})`;
        g.lineWidth = 1 + R() * 2.5;
        g.beginPath(); g.moveTo(x, y0); g.bezierCurveTo(x + (R() - 0.5) * 30, y0 + len * 0.4, x + (R() - 0.5) * 40, y0 + len * 0.7, x + (R() - 0.5) * 50, y0 + len); g.stroke();
      }
      const t = new (T().CanvasTexture)(c);
      t.colorSpace = T().SRGBColorSpace; t.wrapS = T().RepeatWrapping; t.anisotropy = 8;
      return t;
    });
  }

  // ======================================================================
  //  Piezas
  // ======================================================================
  // Tubo que se afila siguiendo una curva (narices, mechones, colas)
  function taperTube(pts, r0, r1, rs = 16, seg = 24, flat = 1, bulge = 0.1) {
    const curve = new (T().CatmullRomCurve3)(pts.map((p) => V(...p)));
    const fr = curve.computeFrenetFrames(seg, false);
    const pos = [], idx = [];
    for (let i = 0; i <= seg; i++) {
      const t = i / seg, p = curve.getPointAt(t);
      const r = r1 + (r0 - r1) * Math.pow(1 - t, 0.85) * (1 + bulge * Math.sin(t * Math.PI));
      for (let j = 0; j < rs; j++) {
        const a = (j / rs) * Math.PI * 2, cx = Math.cos(a) * r, cy = Math.sin(a) * r * flat;
        const n = fr.normals[i], b = fr.binormals[i];
        pos.push(p.x + n.x * cx + b.x * cy, p.y + n.y * cx + b.y * cy, p.z + n.z * cx + b.z * cy);
      }
    }
    const tip = curve.getPointAt(1);
    pos.push(tip.x, tip.y, tip.z);
    for (let i = 0; i < seg; i++) for (let j = 0; j < rs; j++) {
      const a = i * rs + j, b = i * rs + (j + 1) % rs;
      idx.push(a, a + rs, b, b, a + rs, b + rs);
    }
    const last = seg * rs, tipI = (seg + 1) * rs;
    for (let j = 0; j < rs; j++) idx.push(last + j, tipI, last + (j + 1) % rs);
    const g = new (T().BufferGeometry)();
    g.setAttribute('position', new (T().Float32BufferAttribute)(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  // ---------- orejas ----------
  // L: largo, W: medio ancho en la base, tip: desvío de la punta hacia el borde de arriba,
  // angle: giro hacia fuera (1,57 = horizontal), nicks: muescas del borde de arriba (0..1), scallop: borde de murciélago
  const EARS = [
    { L: 0.95, W: 0.16, tip: 0.07, angle: 1.08, nicks: [], cut: 0, scallop: 0 },
    { L: 0.78, W: 0.27, tip: 0.1, angle: 1.0, nicks: [], cut: 0, scallop: 3 },
    { L: 0.88, W: 0.17, tip: -0.08, angle: 2.2, nicks: [], cut: 0, scallop: 0 },
    { L: 0.86, W: 0.18, tip: 0.04, angle: 1.15, nicks: [0.35, 0.62], cut: 0.1, scallop: 0 },
    { L: 0.52, W: 0.15, tip: 0.05, angle: 0.9, nicks: [], cut: 0, scallop: 0 },
  ];
  function earGeo(style, side, inner) {
    return cached(geoCache, `ear${style}${side}${inner ? 'i' : ''}`, () => {
      const E = EARS[style], m = -side, sc = inner ? 0.68 : 1;
      const S = new (T().Shape)();
      const P = (x, y) => [x * m * sc, y * sc];
      const tipY = E.L * (1 - E.cut);
      S.moveTo(...P(-E.W, 0));
      S.bezierCurveTo(...P(-E.W * 1.2, E.L * 0.22), ...P(-E.W * 0.6, E.L * 0.62), ...P(E.tip, tipY));
      if (E.cut) { S.lineTo(...P(E.tip + 0.03, tipY - 0.02)); S.lineTo(...P(E.tip + 0.06, tipY - 0.05)); }
      // borde de arriba, de la punta a la base, con muescas o festones
      const up = (t) => [E.tip + (E.W - E.tip) * Math.pow(t, 0.8) + 0.04 * Math.sin(t * Math.PI), tipY * (1 - t)];
      const N = 24;
      for (let i = 1; i <= N; i++) {
        const t = i / N;
        let [x, y] = up(t);
        if (E.scallop && !inner) x -= 0.045 * Math.pow(Math.abs(Math.sin(t * Math.PI * E.scallop)), 0.6) * (1 - t * 0.5);
        if (!inner) for (const n of E.nicks) { const d = Math.abs(t - n); if (d < 0.05) x -= 0.06 * (1 - d / 0.05); }
        S.lineTo(...P(x, y));
      }
      S.lineTo(...P(-E.W, 0));
      const g = new (T().ExtrudeGeometry)(S, {
        depth: inner ? 0.008 : 0.03, curveSegments: 20,
        bevelEnabled: true, bevelThickness: inner ? 0.008 : 0.022, bevelSize: inner ? 0.01 : 0.018, bevelSegments: 4,
      });
      g.translate(0, inner ? 0.06 : 0, inner ? 0.035 : -0.015);
      // oreja ahuecada: los bordes se curvan hacia delante y la punta un poco hacia atrás
      const ps = g.attributes.position;
      for (let i = 0; i < ps.count; i++) { const x = ps.getX(i), y = ps.getY(i); ps.setZ(i, ps.getZ(i) + 1.5 * x * x - 0.07 * y * y); }
      g.computeVertexNormals();
      return g;
    });
  }
  // punto del borde de arriba de la oreja (t: 0 base, 1 punta), en el espacio de la oreja
  function earEdge(style, side, t) {
    const E = EARS[style], tipY = E.L * (1 - E.cut), u = 1 - t;
    const x = E.tip + (E.W - E.tip) * Math.pow(u, 0.8) + 0.04 * Math.sin(u * Math.PI);
    return V(x * -side, tipY * t, 0.02);
  }

  // ---------- narices ----------
  const NOSES = [
    { pts: [[0, 0, 0], [0, 0.01, 0.22], [0, -0.005, 0.4], [0, -0.06, 0.53], [0, -0.12, 0.56]], r: 0.09 },  // ganchuda
    { pts: [[0, 0, 0], [0, 0.004, 0.25], [0, -0.006, 0.48], [0, -0.03, 0.66]], r: 0.085 },               // recta y larga
    { pts: [[0, 0, 0], [0, -0.01, 0.22], [0, 0.01, 0.38], [0, 0.08, 0.48]], r: 0.095 },                  // respingona
    { pts: [[0, 0, 0], [0, -0.01, 0.22], [0, -0.035, 0.45]], r: 0.135 },                                // zanahoria
    { pts: [[0, 0, 0], [0, 0.002, 0.3], [0, -0.006, 0.6], [0, -0.02, 0.82]], r: 0.065 },                // aguja
  ];

  // ---------- colores de ojos (globo, iris) ----------
  const EYES = [['#ffc21a', '#e06a00'], ['#fff23a', '#c8b000'], ['#e8b84a', '#9a5a10'], ['#e4ff4a', '#7aa010']];
  // mirada: cuánto tapa el párpado de arriba, inclinación, párpado de abajo, pupilas bizcas, cejas
  const LOOKS = [
    { lid: 0.4, slant: 0.32, low: 0, cross: 0, brow: 0.25 },
    { lid: 0.24, slant: 0.05, low: 0, cross: 0, brow: -0.1 },
    { lid: 0.44, slant: -0.45, low: 0.18, cross: 0, brow: -0.55 },
    { lid: 0.3, slant: 0.1, low: 0, cross: 0.028, brow: 0.15 },
    { lid: 0.56, slant: 0.18, low: 0.22, cross: 0, brow: 0.3 },
  ];

  // ======================================================================
  //  Montaje
  // ======================================================================
  // P: partes del personaje (head: hueso de la cabeza, headMesh: cabeza KayKit), o: { skin, hair, gob, sex, helmet, seed }
  function build(P, o) {
    const THREE = T();
    const gob = o.gob || (root.MAP && root.MAP.goblinDefaults ? root.MAP.goblinDefaults(o.sex) : {});
    const hi = gob.head || 0, H = HEADS[hi];
    const grp = new THREE.Group();
    grp.name = 'goblin-head';
    // la cabeza nueva ocupa el sitio de la KayKit (mismas unidades) y va pegada al hueso de la cabeza
    let top = P.headMesh; while (top.parent) top = top.parent;
    top.updateMatrixWorld(true);
    P.headMesh.matrixWorld.decompose(grp.position, grp.quaternion, grp.scale);
    if (hi === 3) grp.scale.multiplyScalar(1.0);
    P.headMesh.visible = false;

    const skinC = new THREE.Color(o.skin);
    const sHex = '#' + skinC.getHexString();
    const darkHex = '#' + skinC.clone().multiplyScalar(0.7).getHexString();
    const noseHex = '#' + skinC.clone().lerp(new THREE.Color('#d0505a'), 0.12).getHexString();
    const add = (geom, material, x = 0, y = 0, z = 0, parent = grp) => { const m = new THREE.Mesh(geom, material); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
    const sphG = (r, w = 20, h = 14) => cached(geoCache, `s${r}|${w}|${h}`, () => new THREE.SphereGeometry(r, w, h));
    const coneG = (r, h, s = 10) => cached(geoCache, `c${r}|${h}|${s}`, () => new THREE.ConeGeometry(r, h, s));
    const torG = (r, t) => cached(geoCache, `t${r}|${t}`, () => new THREE.TorusGeometry(r, t, 12, 32));
    const cylG = (r0, r1, h) => cached(geoCache, `y${r0}|${r1}|${h}`, () => new THREE.CylinderGeometry(r0, r1, h, 12));

    // ---- cráneo con la piel pintada ----
    const head = add(headGeo(hi), mat(sHex, { map: skinTexture(hi, sHex, gob.marks || 0, o.seed || 'gob'), rough: 0.62 }));
    head.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    const C = V(...H.c);
    // punto de la piel en la dirección d desde el centro de la cabeza
    const onSkin = (d) => { d = d.clone().normalize(); ray.set(C.clone().addScaledVector(d, 2), d.clone().negate()); const h = ray.intersectObject(head)[0]; return h ? { p: h.point, n: h.face.normal.clone() } : { p: C.clone().addScaledVector(d, 0.45), n: d }; };
    // profundidad de la cara en (x, y)
    const faceZ = (x, y) => { ray.set(V(x, y, 2), V(0, 0, -1)); const h = ray.intersectObject(head)[0]; return h ? h.point.z : 0.4; };

    const gold = mat('#ffcf4a', { metal: 0.7, rough: 0.22, emissive: '#4a3000', ei: 0.4 });
    const silver = mat('#dfe3ea', { metal: 0.85, rough: 0.22 });
    const ruby = mat('#d8102a', { rough: 0.12, emissive: '#5a0008', ei: 0.6 });
    const ivory = mat('#efe4c2', { rough: 0.35 });
    const bone = mat('#e8dcc0', { rough: 0.55 });
    const skinM = mat(sHex, { rough: 0.62 }), darkM = mat(darkHex, { rough: 0.7 }), noseM = mat(noseHex, { rough: 0.55 });
    const innerEar = mat('#' + skinC.clone().lerp(new THREE.Color('#c86070'), 0.18).multiplyScalar(0.8).getHexString(), { rough: 0.6 });
    const hairHex = o.hair || '#2a1a10';
    const hairM = mat(hairHex, { rough: 0.55 });

    // ---- orejas ----
    const es = gob.ears || 0, E = EARS[es];
    const ears = [];
    for (const sx of [-1, 1]) {
      const e = new THREE.Group();
      const at = onSkin(V(sx, -0.1, -0.05));
      e.position.copy(at.p).add(V(-sx * 0.02, 0, 0));
      e.rotation.set(-0.18, sx * 0.42, -sx * E.angle);
      grp.add(e);
      add(earGeo(es, sx, false), skinM, 0, 0, 0, e);
      add(earGeo(es, sx, true), innerEar, 0, 0, 0, e);
      const rootM = add(sphG(0.11), skinM, 0, 0.03, -0.01, e); rootM.scale.set(1.25, 0.8, 0.6);
      ears.push({ e, sx, base: at.p.clone() });
    }

    // ---- ojos ----
    const L = LOOKS[gob.look || 0], [eyeCol, irisCol] = EYES[gob.eyes || 0];
    const globe = mat(eyeCol, { emissive: eyeCol, ei: 0.25, rough: 0.15 });
    const iris = mat(irisCol, { emissive: irisCol, ei: 0.2, rough: 0.15 });
    const black = mat('#050403', { rough: 0.1 }), shine = mat('#ffffff', { emissive: '#ffffff', ei: 1.4 });
    const lidG = (cov) => cached(geoCache, 'lid' + cov, () => new THREE.SphereGeometry(0.112, 28, 12, 0, Math.PI * 2, 0, Math.PI * cov));
    for (const sx of [-1, 1]) {
      const ex = sx * 0.19, ey = 1.6, ez = faceZ(ex, ey) + 0.005;
      const eg = new THREE.Group(); eg.position.set(ex, ey, ez - 0.012); grp.add(eg);
      const ball = add(sphG(0.1, 32, 24), globe, 0, 0, 0, eg); ball.scale.set(1.12, 0.95, 0.62);
      const px = -sx * L.cross;
      const ir = add(sphG(0.066, 28, 20), iris, px, -0.004, 0.03, eg); ir.scale.set(0.95, 1.05, 0.55);
      const pu = add(sphG(0.024, 14, 10), black, px, -0.004, 0.06, eg); pu.scale.set(0.6, 2.5, 0.4);
      add(sphG(0.013, 10, 8), shine, px - 0.03, 0.034, 0.064, eg);
      add(sphG(0.007, 8, 6), shine, px + 0.024, -0.032, 0.064, eg);
      const lid = add(lidG(L.lid), darkM, 0, 0.003, -0.004, eg);
      lid.scale.set(1.16, 0.97, 0.7); lid.rotation.set(0.45, 0, sx * L.slant);
      if (L.low) { const lo = add(lidG(L.low), darkM, 0, -0.003, -0.004, eg); lo.scale.set(1.14, 0.95, 0.7); lo.rotation.set(Math.PI - 0.3, 0, -sx * 0.1); }
      // pestañas para ellas
      if (o.sex === 'f') for (let i = 0; i < 5; i++) {
        const a = (i - 2) * 0.32, lx = Math.sin(a) * 0.1 * 1.16, ly = Math.cos(a) * 0.09 * Math.cos(L.lid * Math.PI) + 0.02;
        const lash = add(coneG(0.006, 0.05, 5), mat('#120a08', { rough: 0.5 }), lx, ly + 0.03, 0.04, eg);
        lash.rotation.set(-0.5, 0, -a * 1.3 - sx * L.slant);
      }
      // ceja de pelo sobre la cresta, inclinada según la mirada
      const bz = faceZ(sx * 0.2, 1.725);
      const brow = add(taperGeo('brow', [[-0.1, 0, 0], [0, 0.012, 0.01], [0.1, 0, 0]], 0.026, 0.008, 10, 12, 0.5), hairM, sx * 0.2, 1.73, bz - 0.01);
      brow.rotation.set(0, sx * 0.25, sx * L.brow);
      if (sx < 0) brow.scale.x = -1;
    }

    // ---- nariz ----
    const N = NOSES[gob.nose || 0];
    const nose = add(taperGeo('nose' + (gob.nose || 0), N.pts, N.r, 0.004, 20, 30, 0.82, 0.08), noseM, 0, 1.525, faceZ(0, 1.525) - 0.11);
    void nose;

    // ---- boca y dientes ----
    const tooth = (x, h, w, up, material = ivory, tilt = 0) => {
      const y = mouthY(x), z = faceZ(x, y + (up ? -0.02 : 0.02)) - 0.012;
      const t = add(coneG(w, h, 8), material, x, up ? y - 0.012 + h / 2 : y + 0.006 - h / 2, z);
      t.rotation.set(up ? -0.12 : Math.PI + 0.12, 0, tilt);
      return t;
    };
    const TT = gob.teeth || 0;
    if (TT === 0) { // colmillos de abajo y dientecitos de arriba
      for (const sx of [-1, 1]) tooth(sx * 0.14, 0.1, 0.028, true, ivory, -sx * 0.15);
      for (const x of [-0.075, -0.025, 0.025, 0.075]) tooth(x, 0.045, 0.017, false);
    } else if (TT === 1) { // sierra arriba y abajo
      for (let x = -0.17; x <= 0.171; x += 0.034) { tooth(x, 0.045, 0.015, false); tooth(x + 0.017, 0.04, 0.014, true); }
    } else if (TT === 2) { // diente de oro
      [-0.09, -0.03, 0.03, 0.09].forEach((x, i) => tooth(x, 0.05, 0.02, false, i === 2 ? gold : ivory));
      for (const sx of [-1, 1]) tooth(sx * 0.15, 0.06, 0.02, true, ivory, -sx * 0.12);
    } else if (TT === 3) { // mellado: falta uno y otro está roto
      tooth(-0.11, 0.06, 0.02, false, ivory, 0.15); tooth(-0.05, 0.028, 0.018, false); tooth(0.08, 0.05, 0.019, false, ivory, -0.2);
      tooth(0.13, 0.07, 0.022, true, ivory, -0.25);
    } else { // dientón: dos paletas grandes
      for (const sx of [-1, 1]) {
        const y = mouthY(sx * 0.03), z = faceZ(sx * 0.03, y) - 0.005;
        const b = add(new THREE.BoxGeometry(0.052, 0.085, 0.022), ivory, sx * 0.03, y - 0.035, z); b.rotation.set(0.1, 0, sx * 0.04);
      }
      for (const sx of [-1, 1]) tooth(sx * 0.15, 0.05, 0.018, true);
    }

    // ---- pendientes ----
    const RG = gob.rings || 0;
    for (const { e, sx, base } of ears) {
      const metal = RG === 1 ? silver : gold;
      // aro del lóbulo, colgando bajo la raíz de la oreja
      if (RG !== 4) {
        const lobe = add(torG(0.085, 0.017), metal, base.x + sx * 0.04, base.y - 0.13, base.z + 0.03);
        lobe.rotation.y = Math.PI / 2;
        add(sphG(0.022), metal, base.x + sx * 0.035, base.y - 0.045, base.z + 0.03);
        if (RG === 3) { const d = add(sphG(0.032, 16, 12), ruby, base.x + sx * 0.04, base.y - 0.235, base.z + 0.03); d.scale.y = 1.4; add(coneG(0.02, 0.03, 8), gold, base.x + sx * 0.04, base.y - 0.205, base.z + 0.03); }
      }
      const ring = (t, material, r = 0.05) => { const p = earEdge(es, sx, t); const m = add(torG(r, 0.013), material, p.x + 0.012 * sx, p.y, p.z, e); m.rotation.set(Math.PI / 2, 0, 0); return m; };
      if (RG === 0 || RG === 1) ring(0.36, metal);
      if (RG === 1) { const p = earEdge(es, sx, 0.55); add(sphG(0.03), silver, p.x, p.y, p.z + 0.03, e); }
      if (RG === 2) [0.22, 0.34, 0.46, 0.58].forEach((t, i) => ring(t, i % 2 ? silver : gold, 0.045 - i * 0.004));
      if (RG === 3) { const p = earEdge(es, sx, 0.4); add(sphG(0.03), gold, p.x, p.y, p.z + 0.03, e); }
      if (RG === 4) { // huesos atravesados y un colmillo colgando
        const p = earEdge(es, sx, 0.3);
        const b = add(cylG(0.014, 0.014, 0.16), bone, p.x, p.y, p.z + 0.01, e); b.rotation.z = Math.PI / 2;
        for (const s of [-1, 1]) add(sphG(0.024), bone, p.x + s * 0.08, p.y, p.z + 0.01, e);
        const cord = add(cylG(0.006, 0.006, 0.12), mat('#5a3a1a', { rough: 0.9 }), base.x + sx * 0.04, base.y - 0.08, base.z + 0.03); void cord;
        const fang = add(coneG(0.022, 0.08, 8), ivory, base.x + sx * 0.04, base.y - 0.17, base.z + 0.03); fang.rotation.z = Math.PI;
      }
    }
    if (RG === 5) { // aro en la nariz (y aros de oro en las orejas, puestos arriba)
      const r = add(torG(0.045, 0.011), gold, 0, 1.475, faceZ(0, 1.5) + 0.055);
      r.rotation.x = 0.35;
    }

    // ---- marcas en relieve ----
    if (gob.marks === 1) for (const [x, y, z] of WARTS) { const s = onSkin(V(x - H.c[0], y - H.c[1], z - H.c[2])); const w = add(sphG(0.022, 12, 10), darkM, s.p.x, s.p.y, s.p.z); w.scale.set(1, 1, 0.7); }

    // ---- pelo ----
    const HS = gob.hair || 0;
    if (!o.helmet && HS) {
      const hairTex = mat(hairHex, { map: hairTexture(hairHex), rough: 0.5 });
      const R = rng('hair' + (o.seed || ''));
      // casquete de pelo pegado al cráneo. region(x, y, z) da cuánto se mete el punto en la zona con pelo
      // (positivo dentro, negativo fuera): el pelo se levanta poco a poco desde el borde, sin escalones
      const cap = (region, lift = 0.028) => {
        const src = headGeo(hi), pos = src.attributes.position, nor = src.attributes.normal;
        const g = new THREE.BufferGeometry();
        const np = new Float32Array(pos.count * 3), m = new Float32Array(pos.count);
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
          m[i] = region(x, y, z);
          const l = -0.012 + (lift + 0.012) * smooth(-0.005, 0.05, m[i]);
          np[i * 3] = x + nor.getX(i) * l; np[i * 3 + 1] = y + nor.getY(i) * l; np[i * 3 + 2] = z + nor.getZ(i) * l;
        }
        g.setAttribute('position', new THREE.BufferAttribute(np, 3));
        g.setAttribute('uv', src.attributes.uv);
        const idx = src.index.array, keep = [];
        for (let i = 0; i < idx.length; i += 3) if (m[idx[i]] > -0.03 || m[idx[i + 1]] > -0.03 || m[idx[i + 2]] > -0.03) keep.push(idx[i], idx[i + 1], idx[i + 2]);
        g.setIndex(keep);
        g.computeVertexNormals();
        return add(g, hairTex);
      };
      // coronilla: el borde de delante hace picos de flequillo; los lados no bajan hasta las orejas
      const crown = (x, y, z) => Math.min(
        y - (1.98 - 0.12 * smooth(0.1, -0.45, z) + 0.06 * smooth(0.2, 0.45, z) - 0.04 * Math.pow(Math.abs(Math.sin(x * 22)), 0.7) * smooth(0.15, 0.4, z)),
        0.42 - 0.06 * smooth(1.9, 1.75, y) - Math.abs(x));
      const nape = (x, y, z) => Math.min(y - 1.78, -0.05 - z, 0.4 - Math.abs(x));
      const spike = (d, len, r, bend = 0.1, flat = 0.5) => {
        const s = onSkin(d), n = s.n;
        const back = V(0, 0.15, -1).normalize();
        const pts = [[0, 0, 0], n.clone().multiplyScalar(len * 0.5).addScaledVector(back, len * bend * 0.4).toArray(), n.clone().multiplyScalar(len).addScaledVector(back, len * bend).toArray()];
        const m = add(taperTube(pts, r, 0.004, 10, 10, flat, 0.15), hairTex, s.p.x - n.x * 0.02, s.p.y - n.y * 0.02, s.p.z - n.z * 0.02);
        return m;
      };
      if (HS === 1) { // cresta: púas en fila de la frente a la nuca
        for (let i = 0; i < 9; i++) {
          const a = -0.25 + i * 0.27; // de la frente (delante) a la nuca
          spike(V(0, Math.cos(a), -Math.sin(a)), 0.2 + 0.12 * Math.sin(i / 8 * Math.PI), 0.06, 0.35, 0.4);
        }
      } else if (HS === 2) { // moño en la coronilla con cinta
        cap((x, y, z) => Math.min(crown(x, y, z), y - 2.0));
        const top = onSkin(V(0, 1, -0.45));
        const bun = add(sphG(0.15, 28, 20), hairTex, top.p.x, top.p.y + 0.1, top.p.z - 0.02); bun.scale.set(1, 0.85, 1);
        const band = add(torG(0.1, 0.022), mat('#b02a2a', { rough: 0.6 }), top.p.x, top.p.y + 0.02, top.p.z); band.rotation.x = Math.PI / 2 + 0.4;
        for (let i = 0; i < 3; i++) spike(V(-0.3 + i * 0.3, 1, -0.6), 0.12, 0.02, 0.5, 0.6);
      } else if (HS === 3) { // trenzas: casquete y dos trenzas detrás de las orejas
        cap((x, y, z) => Math.max(crown(x, y, z), nape(x, y, z)));
        for (const sx of [-1, 1]) {
          const s0 = onSkin(V(sx * 0.75, 0.25, -0.55)).p;
          for (let i = 0; i < 9; i++) {
            const t = i / 8, r = 0.065 - 0.025 * t;
            const b = add(sphG(r, 16, 12), hairTex, s0.x + sx * (0.02 + 0.04 * t) + (i % 2 ? 0.012 : -0.012) * sx, s0.y - 0.07 * i, s0.z - 0.04 - 0.05 * t);
            b.scale.set(1, 1.25, 1); b.rotation.z = (i % 2 ? 0.4 : -0.4);
          }
          add(torG(0.035, 0.012), mat(o.sex === 'f' ? '#c84a8a' : '#7a4a1a', { rough: 0.6 }), s0.x + sx * 0.06, s0.y - 0.6, s0.z - 0.09).rotation.x = Math.PI / 2;
          const tuft = add(coneG(0.04, 0.08, 10), hairTex, s0.x + sx * 0.06, s0.y - 0.66, s0.z - 0.09); tuft.rotation.z = Math.PI;
        }
      } else if (HS === 4) { // alborotado: casquete y mechones de punta en todas direcciones
        cap((x, y, z) => Math.max(crown(x, y, z), Math.min(y - 1.85, -z)));
        for (let i = 0; i < 34; i++) {
          const a = R() * Math.PI * 2, el = 0.35 + R() * 0.6;
          const d = V(Math.cos(a) * Math.cos(el), Math.sin(el) + 0.25, Math.sin(a) * Math.cos(el) - 0.15);
          if (d.z > 0.45 && d.y < 0.8) continue; // nada sobre la cara
          spike(d, 0.09 + R() * 0.1, 0.035, (R() - 0.3) * 0.6, 0.6);
        }
      } else if (HS === 5) { // mechones ralos que se levantan
        for (let i = 0; i < 7; i++) {
          const a = -0.5 + i * 0.17, d = V(Math.sin(a) * 0.6, 1, -0.2 + 0.25 * Math.cos(i * 1.7));
          const s = onSkin(d);
          const pts = [[0, 0, 0], [Math.sin(a) * 0.05, 0.1, -0.02], [Math.sin(a) * 0.14 + (R() - 0.5) * 0.06, 0.17, 0.02 + (R() - 0.5) * 0.06]];
          add(taperTube(pts, 0.012, 0.002, 6, 10, 1, 0.1), hairTex, s.p.x, s.p.y - 0.01, s.p.z);
        }
      } else if (HS === 6) { // coleta larga con cinta
        cap((x, y, z) => Math.max(crown(x, y, z), nape(x, y, z)));
        const s = onSkin(V(0, 0.55, -1)).p;
        add(taperTube([[0, 0, 0], [0, -0.05, -0.14], [0, -0.28, -0.24], [0, -0.55, -0.2], [0, -0.72, -0.12]], 0.085, 0.01, 18, 26, 0.8, 0.25), hairTex, s.x, s.y, s.z + 0.02);
        add(torG(0.07, 0.022), mat(o.sex === 'f' ? '#c84a8a' : '#3a5a2a', { rough: 0.6 }), s.x, s.y - 0.03, s.z - 0.08).rotation.x = 0.6;
      }
    }
    P.head.attach(grp);
    return grp;
  }
  // geometrías de tubo con caché por nombre
  function taperGeo(key, ...args) { return cached(geoCache, 'tt' + key, () => taperTube(...args)); }

  // Complexión: escala del cuerpo (ancho y fondo)
  const BUILD = [0.85, 1, 1.2];

  root.GOBLIN3D = { build, BUILD };
})(this);
