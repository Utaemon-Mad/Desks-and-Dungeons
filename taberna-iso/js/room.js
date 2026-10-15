// La taberna: paredes, chimenea, barra, mesas, luces y personajes del lugar.
// Ejes: x crece hacia la derecha de la pantalla y z hacia la izquierda; las paredes (visibles) están en x=0 (oeste) y z=0 (norte).
(() => {
  const TI = (window.TI = window.TI || {});
  const A = TI.actors, X = TI.tex;
  const W = 22, D = 18, WH = 6.4;

  TI.buildRoom = (scene) => {
    const room = { W, D, WH, colliders: [], npcs: [], actors: [], updaters: [], rects: [], spawn: new THREE.Vector3(10.5, 0, 9.0) };
    const std = (o) => new THREE.MeshStandardMaterial(o);
    const add = (o, x, y, z, ry = 0) => { o.position.set(x, y, z); o.rotation.y = ry; scene.add(o); return o; };
    const box = (w, h, d, mat, x, y, z, ry = 0, shadow = true) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.castShadow = shadow; m.receiveShadow = true; return add(m, x, y, z, ry);
    };
    const cyl = (rt, rb, h, mat, x, y, z, seg = 16) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat); m.castShadow = m.receiveShadow = true; return add(m, x, y, z); };
    const solid = (x0, z0, x1, z1, kind = 'mueble') => { room.colliders.push({ x0, z0, x1, z1 }); room.rects.push({ x0, z0, x1, z1, kind }); };
    const rep = (t, rx, ry) => { const c = t.clone(); c.repeat.set(rx, ry); c.needsUpdate = true; return c; };
    const dark = std({ color: 0x24160d, roughness: 0.85 });
    const iron = std({ color: 0x1b1c1e, roughness: 0.55, metalness: 0.7 });

    // ---------- Suelo ----------
    const fl = X.floor();
    const FW = W + 10, FD = D + 10;
    fl.map.repeat.set(FW / 4, FD / 4); fl.bump.repeat.set(FW / 4, FD / 4);
    const fg = new THREE.PlaneGeometry(FW, FD, Math.round(FW * 2), Math.round(FD * 2));
    { // oscurece el suelo fuera de la sala para que no se vea el corte
      const pos = fg.attributes.position, col = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i) + W / 2, z = -pos.getY(i) + D / 2;
        const o = Math.max(0, -x, x - W, -z, z - D), k = 1 - Math.min(1, Math.max(0, (o - 0.6) / 3.2)); const v = k * k * (3 - 2 * k);
        col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v;
      }
      fg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    const floor = new THREE.Mesh(fg, std({ map: fl.map, bumpMap: fl.bump, bumpScale: 2.2, roughness: 0.78, color: 0xa89a90, vertexColors: true }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; add(floor, W / 2, 0, D / 2);
    // suciedad y sombra de borde (decal)
    const gt = X.grime(W, D);
    const gm = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: gt, transparent: true, roughness: 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    gm.rotation.x = -Math.PI / 2; gm.receiveShadow = true; add(gm, W / 2, 0.01, D / 2);

    // ---------- Paredes ----------
    const br = X.brick();
    const brickMat = (rx, ry) => std({ map: rep(br.map, rx, ry), bumpMap: rep(br.bump, rx, ry), bumpScale: 3, roughness: 0.92, color: 0xe6d6c8 });
    const WS = 4.5; // lado de la repetición del ladrillo
    // oeste (x=0): cara hacia +x
    const west = new THREE.Mesh(new THREE.PlaneGeometry(D + 1, WH), brickMat((D + 1) / WS, WH / WS));
    west.rotation.y = Math.PI / 2; west.receiveShadow = true; add(west, 0.0, WH / 2, D / 2 - 0.5 + 0.0, Math.PI / 2);
    box(0.8, WH, D + 1.6, dark, -0.4, WH / 2, D / 2 - 0.1, 0, false);
    // norte (z=0): cara hacia +z
    const north = new THREE.Mesh(new THREE.PlaneGeometry(W + 1, WH), brickMat((W + 1) / WS, WH / WS));
    north.receiveShadow = true; add(north, W / 2 - 0.5 + 0.0, WH / 2, 0.0);
    box(W + 1.6, WH, 0.8, dark, W / 2 - 0.1, WH / 2, -0.4, 0, false);

    // zócalo de madera (altura 1.9) y vigas
    const wd = X.wood(3);
    const woodMat = (rx, ry) => std({ map: rep(wd.map, rx, ry), bumpMap: rep(wd.bump, rx, ry), bumpScale: 2, roughness: 0.8, color: 0xd8c0a8 });
    const WZ = 1.9;
    const wz1 = new THREE.Mesh(new THREE.PlaneGeometry(D, WZ), woodMat(D / 3, WZ / 3));
    wz1.rotation.y = Math.PI / 2; wz1.receiveShadow = true; add(wz1, 0.03, WZ / 2, D / 2, Math.PI / 2);
    const wz2 = new THREE.Mesh(new THREE.PlaneGeometry(W, WZ), woodMat(W / 3, WZ / 3));
    wz2.receiveShadow = true; add(wz2, W / 2, WZ / 2, 0.03);
    box(0.28, 0.2, D, dark, 0.14, WZ + 0.1, D / 2); box(W, 0.2, 0.28, dark, W / 2, WZ + 0.1, 0.14);
    // vigas verticales y horizontales
    const post = (x, z) => { box(0.55, WH, 0.55, dark, x, WH / 2, z); box(0.75, 0.3, 0.75, dark, x, 0.15, z); box(0.7, 0.25, 0.7, dark, x, 4.1, z); };
    for (const z of [0.3, 10.4, 13.9, 17.4]) post(0.3, z);
    for (const x of [1.2, 4.7, 8.3, 20.9]) post(x, 0.3);
    box(0.4, 0.4, D, dark, 0.2, 4.3, D / 2); box(W, 0.4, 0.4, dark, W / 2, 4.3, 0.2);
    box(0.4, 0.45, D, dark, 0.2, WH - 0.2, D / 2); box(W, 0.45, 0.4, dark, W / 2, WH - 0.2, 0.2);
    for (let i = 0; i < 4; i++) { // tornapuntas
      const z = [0.3, 10.4, 13.9, 17.4][i];
      const b = box(0.28, 1.6, 0.28, dark, 0.3, 3.45, z + (i === 0 ? 0.9 : 0.8), 0); b.rotation.x = i === 0 ? -0.62 : -0.62;
    }

    // ---------- Tapices ----------
    const hang = (map, x, y, z, w, h, side) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), std({ map, roughness: 1, color: 0xd0c0b0 }));
      m.receiveShadow = true;
      if (side === 'w') add(m, 0.08, y, z, Math.PI / 2); else add(m, x, y, 0.08);
      box(side === 'w' ? 0.12 : w + 0.3, 0.14, side === 'w' ? w + 0.3 : 0.12, dark, side === 'w' ? 0.1 : x, y + h / 2 + 0.07, side === 'w' ? z : 0.1);
    };
    hang(X.tapestry('#6b1f1a', '#c9a15a', 2), 0, 3.3, 12.0, 2.2, 4.0, 'w');
    hang(X.tapestry('#1f3a46', '#b9a470', 8), 0, 3.3, 15.6, 1.8, 3.5, 'w');
    hang(X.tapestry('#4a2a14', '#c9a15a', 6), 6.2, 3.4, 0, 2.0, 3.8, 'n');

    // ---------- Chimenea (pared oeste, centrada en z=6) ----------
    const st = X.stone();
    const stoneMat = (rx, ry) => std({ map: rep(st.map, rx, ry), bumpMap: rep(st.bump, rx, ry), bumpScale: 3.5, roughness: 0.95, color: 0xb8aea6 });
    const FZ = 6, FHW = 2.7; // centro y medio ancho
    box(2.6, 0.3, FHW * 2 + 0.8, stoneMat(1.5, 1.5), 1.3, 0.15, FZ);                    // suelo del hogar
    box(1.1, 3.3, 1.0, stoneMat(0.5, 1.5), 0.55, 1.95, FZ - FHW + 0.5);                 // jamba izquierda (hacia z menor)
    box(1.1, 3.3, 1.0, stoneMat(0.5, 1.5), 0.55, 1.95, FZ + FHW - 0.5);                 // jamba derecha
    box(1.7, 0.5, FHW * 2 + 0.5, dark, 0.85, 3.85, FZ);                                 // repisa de madera
    box(1.3, 0.5, FHW * 2, stoneMat(2, 0.5), 0.65, 3.4, FZ);                            // dintel
    box(0.7, 3.4, FHW * 2 - 2, std({ color: 0x0a0807, roughness: 1 }), 0.4, 1.9, FZ);   // fondo ahumado
    // campana: tres escalones que se estrechan hasta el techo
    box(1.4, 1.4, 5.6, stoneMat(2, 1), 0.7, 4.8, FZ);
    box(1.1, 1.4, 4.4, stoneMat(1.6, 1), 0.55, 6.1, FZ);
    // placa de runas brillantes
    const runeMat = new THREE.MeshBasicMaterial({ map: X.runes(2, 5, 4), transparent: true, toneMapped: false, depthWrite: false, color: new THREE.Color(2.2, 1.5, 0.9) });
    const runes = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.2), runeMat);
    add(runes, 1.43, 4.85, FZ, Math.PI / 2);
    // hierro del hogar: morillos y troncos
    for (const dz of [-1.3, 1.3]) { box(0.14, 0.7, 0.14, iron, 1.3, 0.65, FZ + dz); box(1.1, 0.12, 0.12, iron, 1.0, 0.3, FZ + dz); }
    const logMat = std({ color: 0x3a2514, roughness: 1 });
    for (const [dz, dy, len] of [[-0.9, 0.55, 2.0], [0.0, 0.62, 2.2], [0.9, 0.55, 1.9]]) {
      const l = cyl(0.17, 0.2, len, logMat, 1.1, dy, FZ + dz, 10); l.rotation.x = Math.PI / 2; l.rotation.z = (dz * 0.1);
    }
    const coals = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 3.0), new THREE.MeshBasicMaterial({ map: X.glow('rgba(255,140,40,1)', 'rgba(255,80,10,0.55)'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    coals.rotation.x = -Math.PI / 2; add(coals, 1.15, 0.34, FZ);
    // llamas
    const flames = [];
    const camYaw = Math.PI / 4;
    for (let i = 0; i < 7; i++) {
      const mat = new THREE.MeshBasicMaterial({ map: X.flame(i + 3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, color: new THREE.Color(1.5, 1.0, 0.7) });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.2), mat);
      m.geometry.translate(0, 1.1, 0);
      const z = FZ + (i - 3) * 0.55 + (Math.random() - 0.5) * 0.2;
      add(m, 1.2 + (i % 2) * 0.14, 0.5, z, camYaw);
      flames.push({ m, ph: Math.random() * 10, sp: 3 + Math.random() * 3, sz: 1.05 + (3 - Math.abs(i - 3)) * 0.16, z });
    }
    // chispas
    const NP = 50, pp = new Float32Array(NP * 3), pv = [];
    for (let i = 0; i < NP; i++) pv.push({ t: Math.random() * 3, v: 0.5 + Math.random() * 1.2, z: (Math.random() - 0.5) * 2.6, dx: Math.random() * 0.5 });
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
    const sparks = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xffb060, size: 3.2, sizeAttenuation: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, map: X.glow('rgba(255,230,160,1)', 'rgba(255,140,40,0.4)') }));
    sparks.frustumCulled = false; scene.add(sparks);
    // luz principal del fuego (con sombras)
    const fire = new THREE.PointLight(0xff7a2c, 170, 0, 2); fire.position.set(1.7, 1.5, FZ);
    fire.castShadow = true; fire.shadow.mapSize.set(1024, 1024); fire.shadow.bias = -0.0025; fire.shadow.normalBias = 0.03; fire.shadow.camera.near = 0.4; fire.shadow.camera.far = 30;
    scene.add(fire);
    const fireFill = new THREE.PointLight(0xff9040, 36, 0, 2); fireFill.position.set(3.5, 3.2, FZ); scene.add(fireFill);
    room.fire = fire;
    solid(0, FZ - FHW - 0.3, 2.3, FZ + FHW + 0.3, 'chimenea');

    // ---------- Velas (con halo) ----------
    const glowTex = X.glow();
    const halos = [];
    const halo = (x, y, z, s = 1.2, c = 0xffa050) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: c, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      sp.scale.set(s, s, 1); sp.position.set(x, y, z); scene.add(sp); halos.push({ sp, s, ph: Math.random() * 9 }); return sp;
    };
    const candle = (x, y, z, sc = 0.8, light = false) => {
      const c = A.piece('candle_lit', { tint: 1.0 }); c.scale.setScalar(sc); add(c, x, y, z);
      halo(x, y + 1.0 * sc, z, 0.9 * sc + 0.3);
      if (light) { const l = new THREE.PointLight(0xff9a48, 5, 7, 2); l.position.set(x, y + 1.3 * sc, z); scene.add(l); room.updaters.push((t) => { l.intensity = 5 * (0.85 + 0.15 * Math.sin(t * 9 + x) * Math.sin(t * 5.3 + z)); }); }
    };
    for (const dz of [-2.0, -0.4, 1.2, 2.2]) candle(0.9, 4.1, FZ + dz, 0.75, dz === -0.4);

    // ---------- Barra ----------
    const BX0 = 9.2, BX1 = 20.4, BZ = 3.7;
    const bf = X.barFront();
    const barFrontMat = std({ map: bf.map, bumpMap: bf.bump, bumpScale: 3, roughness: 0.65, color: 0xe0c8b0 });
    const top = std({ color: 0x4a2c16, roughness: 0.45, map: rep(wd.map, 4, 1), bumpMap: rep(wd.bump, 4, 1), bumpScale: 1 });
    box(BX1 - BX0, 1.7, 1.2, barFrontMat, (BX0 + BX1) / 2, 0.85, BZ - 0.6);
    box(BX1 - BX0 + 0.4, 0.16, 1.8, top, (BX0 + BX1) / 2, 1.78, BZ - 0.75);
    box(BX1 - BX0 - 0.4, 0.35, 0.3, dark, (BX0 + BX1) / 2, 0.18, BZ + 0.05);        // rodapié
    box(0.3, 0.18, 1.2, dark, BX0 - 0.2, 1.6, BZ - 0.6);
    solid(BX0 - 0.3, 0, BX1 + 0.3, BZ + 0.3, 'barra');
    // estantes y botellas detrás
    const hdr = box(BX1 - BX0 + 1.0, 1.3, 0.55, barFrontMat, (BX0 + BX1) / 2, 5.55, 0.4);
    const shelfMat = std({ color: 0x3a2314, roughness: 0.8 });
    for (const y of [2.5, 3.7]) box(BX1 - BX0 - 0.6, 0.12, 0.7, shelfMat, (BX0 + BX1) / 2, y, 0.45);
    box(BX1 - BX0 - 0.6, 1.2, 0.35, std({ color: 0x1c110a, roughness: 1 }), (BX0 + BX1) / 2, 0.6, 0.45); // aparador bajo
    const R = X.rng(77);
    for (const y of [2.56, 3.76]) for (let x = BX0 + 0.5; x < BX1 - 0.6; x += 0.55 + R() * 0.5) {
      const pick = R();
      if (pick < 0.4) { const b = A.piece(R() < 0.5 ? 'bottle_A_green' : 'bottle_A_labeled_brown', { tint: 0.9 }); b.scale.setScalar(0.85 + R() * 0.3); add(b, x, y, 0.45, R() * 6); }
      else if (pick < 0.7) { const b = A.piece('mug_full', { tint: 0.85 }); b.scale.setScalar(0.75); add(b, x, y + 0.2, 0.45, R() * 6); }
      else if (pick < 0.8) { const b = A.piece('plate_food_A', { tint: 0.85 }); b.scale.setScalar(0.6); add(b, x, y, 0.45, R() * 6); }
    }
    // barriles sobre la barra, jarras y farolillos
    for (const x of [BX0 + 0.9, BX1 - 1.2]) { const b = A.piece('barrel_large', { tint: 0.85 }); b.scale.setScalar(0.62); add(b, x, 1.86, BZ - 0.9, R() * 3); }
    for (const x of [11.5, 13.2, 14.0, 16.5, 17.3]) { const b = A.piece('mug_full', { tint: 0.9 }); b.scale.setScalar(0.62); add(b, x, 1.86, BZ - 0.7 + (R() - 0.5) * 0.5, R() * 6); }
    const lantern = (x, y, z, base = 48) => {
      const g = new THREE.Group();
      const core = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.5, 0.34), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.5, 0.7), toneMapped: false }));
      g.add(core);
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.62, 0.05), iron); p.position.set(dx * 0.19, 0, dz * 0.19); g.add(p); }
      const lid = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.2, 4), iron); lid.position.y = 0.4; lid.rotation.y = Math.PI / 4; g.add(lid);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.02, 6, 12), iron); ring.position.y = 0.58; g.add(ring);
      g.position.set(x, y, z); scene.add(g);
      halo(x, y, z, 2.0, 0xff9a40);
      const l = new THREE.PointLight(0xffa04a, base, 0, 2); l.position.set(x, y, z); scene.add(l);
      room.updaters.push((t) => { l.intensity = base * (0.88 + 0.12 * Math.sin(t * 7.1 + x) * Math.sin(t * 3.7 + 1)); });
      return g;
    };
    // cadenas colgando de las vigas
    const chain = (x, y0, y1, z) => box(0.04, y1 - y0, 0.04, iron, x, (y0 + y1) / 2, z, 0, false);
    lantern(BX0 - 0.6, 3.5, 1.2); chain(BX0 - 0.6, 3.8, 4.1, 1.2); box(0.05, 0.05, 0.9, iron, BX0 - 0.6, 4.1, 0.75, 0, false);
    lantern(BX1 + 0.5, 3.5, 1.2, 40); chain(BX1 + 0.5, 3.8, 4.1, 1.2); box(0.05, 0.05, 0.9, iron, BX1 + 0.5, 4.1, 0.75, 0, false);
    lantern(6.3, 3.0, 4.1, 34); chain(6.3, 3.3, 4.1, 4.1); // sobre la mesa de arriba
    chain(6.3, 3.3, 4.1, 4.1);
    lantern(3.0, 3.1, 11.0, 28);

    // taburetes de la barra
    for (const x of [10.6, 12.6, 16.4, 18.2]) { const s = A.piece('stool', { tint: 0.62 }); s.scale.setScalar(1.15); add(s, x, 0, BZ + 1.25); solid(x - 0.4, BZ + 0.85, x + 0.4, BZ + 1.65, 'taburete'); }

    // ---------- Mesas y sillas ----------
    const FRONT = Math.PI; // corrección del frente del modelo de silla (se ajusta tras verla)
    const chairs = [];
    const chair = (x, z, fx, fz) => {
      const c = A.piece('chair', { tint: 0.62 }); const yaw = Math.atan2(fx - x, fz - z) + FRONT;
      add(c, x, 0, z, yaw); solid(x - 0.3, z - 0.3, x + 0.3, z + 0.3, 'silla'); chairs.push({ x, z, yaw }); return c;
    };
    const dishes = (x, z, kind, ry = 0) => {
      const y = 1.0;
      if (kind === 'mug') { const m = A.piece('mug_full', { tint: 0.9 }); m.scale.setScalar(0.6); add(m, x, y, z, ry); }
      if (kind === 'plate') { const m = A.piece('plate_food_A', { tint: 0.9 }); m.scale.setScalar(0.55); add(m, x, y, z, ry); }
      if (kind === 'bottle') { const m = A.piece('bottle_A_green', { tint: 0.9 }); m.scale.setScalar(0.8); add(m, x, y, z, ry); }
    };
    const basket = (x, y, z, r = 0.5) => {
      const g = new THREE.Group();
      const b = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.78, r * 0.8, 14, 1, true), std({ color: 0x6b4a26, roughness: 1, side: THREE.DoubleSide })); b.position.y = r * 0.4; b.castShadow = true; g.add(b);
      const bot = new THREE.Mesh(new THREE.CircleGeometry(r * 0.78, 14), std({ color: 0x4a3018, roughness: 1 })); bot.rotation.x = -Math.PI / 2; bot.position.y = 0.02; g.add(bot);
      const cols = [0xb02a1c, 0xd0701a, 0x6e8a26, 0xc23a22, 0xe0a020];
      const rr = X.rng((x * 100 + z * 10) | 0);
      for (let i = 0; i < 12; i++) { const a = rr() * 6.28, d = rr() * r * 0.7; const f = new THREE.Mesh(new THREE.SphereGeometry(r * 0.26, 10, 8), std({ color: cols[(rr() * cols.length) | 0], roughness: 0.55 })); f.position.set(Math.cos(a) * d, r * 0.62 + rr() * 0.1, Math.sin(a) * d); f.castShadow = true; g.add(f); }
      g.position.set(x, y, z); scene.add(g); return g;
    };
    const table = (x, z, sx, sz, ry = 0) => {
      const t = A.piece('table_medium', { tint: 0.62 }); t.scale.set(sx, 1, sz); add(t, x, 0, z, ry);
      const hx = (ry ? sz : sx), hz = (ry ? sx : sz);
      solid(x - hx, z - hz, x + hx, z + hz, 'mesa'); return t;
    };
    // T1: arriba al centro
    table(7.6, 6.2, 1.4, 1.0); chair(6.9, 8.2, 6.9, 6.2); chair(8.5, 8.2, 8.5, 6.2); chair(5.0, 6.2, 7.6, 6.2); chair(10.2, 6.5, 7.6, 6.2);
    dishes(7.0, 6.0, 'mug'); dishes(8.6, 6.5, 'mug', 2); dishes(7.9, 5.7, 'plate'); candle(6.7, 1.0, 6.9, 0.7, true);
    // T2: izquierda, larga
    table(4.4, 12.9, 1.0, 1.6, Math.PI / 2 * 0); chair(2.3, 12.4, 4.4, 12.4); chair(6.5, 12.0, 4.4, 12.0); chair(6.5, 14.0, 4.4, 14.0);
    basket(4.4, 1.0, 12.0, 0.55); basket(4.2, 1.0, 13.7, 0.45); dishes(4.9, 12.9, 'mug'); dishes(3.9, 12.7, 'bottle');
    // T3: derecha, con parroquianos
    table(16.4, 10.6, 1.3, 1.1); chair(14.2, 10.6, 16.4, 10.6); chair(18.7, 10.6, 16.4, 10.6); chair(16.4, 12.8, 16.4, 10.6); chair(16.4, 8.4, 16.4, 10.6);
    dishes(15.6, 10.2, 'mug'); dishes(17.2, 10.6, 'mug', 2); dishes(16.4, 11.2, 'bottle'); dishes(16.6, 10.0, 'plate'); candle(16.0, 1.0, 10.9, 0.7, true);
    // T4 y T5: abajo
    table(11.6, 15.2, 1.4, 1.0); chair(10.8, 13.2, 10.8, 15.2); chair(12.6, 13.2, 12.6, 15.2); chair(10.8, 17.3, 10.8, 15.2); dishes(11.2, 15.0, 'mug'); dishes(12.4, 15.6, 'plate');
    table(6.0, 16.4, 1.0, 1.0); chair(4.1, 16.4, 6.0, 16.4); chair(8.0, 16.4, 6.0, 16.4); dishes(5.8, 16.2, 'bottle'); dishes(6.5, 16.7, 'mug');

    // alfombra
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 5.0), std({ map: X.rug(), roughness: 1, color: 0xa08c80 }));
    rug.rotation.x = -Math.PI / 2; rug.receiveShadow = true; add(rug, 16.4, 0.025, 8.8);

    // barriles y cajas en los bordes
    const stuff = (name, x, z, ry, s = 1, y = 0) => { const b = A.piece(name, { tint: 0.66 }); b.scale.setScalar(s); add(b, x, y, z, ry); };
    stuff('barrel_large', 1.5, 16.0, 0.4); solid(0.6, 15.1, 2.4, 16.9, 'barril');
    stuff('barrel_small_stack', 1.4, 13.2, Math.PI / 2, 1.0); solid(0.6, 12.3, 2.0, 14.1, 'barril');
    stuff('barrel_large', 20.2, 5.6, 0.2); solid(19.3, 4.7, 21.1, 6.5, 'barril');
    stuff('crates_stacked', 20.6, 15.2, 0.3, 0.9); solid(19.6, 14.2, 21.6, 16.2, 'cajas');
    stuff('barrel_large', 19.2, 17.0, 1, 0.9); solid(18.4, 16.2, 20.0, 17.8, 'barril');
    stuff('chest', 2.4, 1.3, 0, 0.9); // arcón junto a la pared (sin colisión)
    basket(1.3, 0, 9.9, 0.6); basket(4.9, 0, 3.7, 0.5);
    solid(0.7, 9.3, 1.9, 10.5, 'cesta');

    // ---------- Personajes ----------
    const place = (look, x, z, ry, loop) => {
      const c = A.make(look); c.root.position.set(x, 0, z); c.root.rotation.y = ry; scene.add(c.root);
      if (loop) c.loop(loop); room.actors.push(c); return c;
    };
    const npc = (def) => { room.npcs.push(def); return def; };
    // tabernero
    const bk = place('tabernero', 14.8, 1.45, 0, null);
    bk.loop('Interact', 0.2, 0.45);
    npc({ id: 'brom', name: 'Brom, el tabernero', ctl: bk, near: [14.6, 4.7], r: 1.2, face: true, xp: 40,
      lines: ['¿Qué te sirvo, forastero? Cerveza negra, sidra o rumores.', 'La cerveza, a tres monedas. Los rumores, siempre gratis.', 'Anoche algo arañó los barriles de la bodega… y no eran ratas.'] });
    // figura encapuchada junto al fuego
    const hd = place('encapuchado', 2.9, 8.9, -Math.PI / 2, 'Idle');
    npc({ id: 'hood', name: 'Figura encapuchada', ctl: hd, near: [4.3, 8.8], r: 1.1, face: true, xp: 60,
      lines: ['…el fuego recuerda lo que los hombres olvidan.', 'Las runas de la campana no las talló ningún herrero.', 'Cuando sus brasas se vuelvan azules, vete.'] });
    // parroquianos sentados (la animación de sentarse coloca al personaje sobre la silla)
    const sit = (look, ch, name, near, lines) => {
      const c = place(look, ch.x, ch.z, ch.yaw, 'Sit_Chair_Idle');
      return npc({ id: name, name, ctl: c, near, r: 1.1, face: false, sit: true, xp: 25, lines });
    };
    sit('parroquiano1', chairs.find((c) => c.x === 14.2), 'Parroquiano barbudo', [12.9, 10.6], ['Chsss… ¿Eres tú el que mató al vampiro del molino?', 'Yo solo digo que las hogueras de la colina no las enciende nadie.']);
    sit('parroquiano2', chairs.find((c) => c.x === 18.7), 'Mercader cansado', [20.2, 10.6], ['Tres caravanas perdidas este mes. Tres.', 'Si buscas trabajo, el tablón de Brom está lleno de cosas peores.']);
    sit('parroquiano3', chairs.find((c) => c.z === 12.8), 'Joven de la sidra', [16.4, 14.4], ['¿Es verdad que los monstruos no sangran como nosotros?', '…no mires tanto mi sidra, forastero.']);

    // ---------- Luces de ambiente ----------
    const hemi = new THREE.HemisphereLight(0x8a96bc, 0x241810, 0.48); scene.add(hemi);
    const sun = new THREE.DirectionalLight(0x93a4d6, 0.7);
    sun.position.set(W / 2 + 16, 22, D / 2 + 12); sun.target.position.set(W / 2, 0, D / 2); scene.add(sun, sun.target);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 70 });
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04;
    room.sun = sun; room.hemi = hemi;

    // ---------- Animación de la sala ----------
    room.update = (t, dt) => {
      const n = (a, b) => Math.sin(t * a) * Math.sin(t * b + 1.3);
      fire.intensity = 170 * (0.84 + 0.16 * n(9.1, 5.3) + 0.04 * Math.sin(t * 31));
      fireFill.intensity = 36 * (0.9 + 0.1 * n(6.2, 3.1));
      for (const f of flames) {
        const k = 0.5 + 0.5 * Math.sin(t * f.sp + f.ph), k2 = Math.sin(t * f.sp * 1.9 + f.ph * 2);
        f.m.scale.set(f.sz * (0.9 + 0.2 * k), f.sz * (0.85 + 0.35 * k + 0.1 * k2), 1);
        f.m.material.opacity = 0.75 + 0.25 * k;
        f.m.rotation.y = camYaw + 0.08 * k2;
      }
      coals.material.opacity = 0.8 + 0.2 * n(4, 7);
      const a = pg.attributes.position;
      for (let i = 0; i < NP; i++) {
        const p = pv[i]; p.t += dt * p.v * 0.5;
        if (p.t > 3.2) { p.t = 0; p.z = (Math.random() - 0.5) * 2.4; p.dx = Math.random() * 0.4; p.v = 0.5 + Math.random() * 1.2; }
        a.setXYZ(i, 1.3 + p.dx + p.t * 0.25, 0.7 + p.t * 1.1, FZ + p.z + Math.sin(t * 2 + i) * 0.15 * p.t);
      }
      a.needsUpdate = true;
      for (const h of halos) { const k = 1 + 0.07 * Math.sin(t * 8 + h.ph) * Math.sin(t * 3.1 + h.ph); h.sp.scale.set(h.s * k, h.s * k, 1); }
      for (const u of room.updaters) u(t, dt);
      for (const c of room.actors) c.update(dt);
    };
    return room;
  };
})();
