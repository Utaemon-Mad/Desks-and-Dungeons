/* global MAP, RULES, SPRITES, THREE, MODELS, VIEW3D */
(() => {
  'use strict';
  const C = DD.core;
  const { EMOJI, OUT, WINDOWS, barkeep, bartenderLook, canvas, chatInput, closePops, editClick, flashLevel, floaters, heroesEl, net, poly, rand, rrect, setTarget, toast, up, updateBarkeep, updateNight, updateUsers, users, wrapText } = C;

  // ======================================================================
  //  Bucle de dibujo
  // ======================================================================
  let last = performance.now();
  // ======================================================================
  //  Taberna en 3D (Three.js): sala, ventanas a la noche, muebles, personajes y luces
  // ======================================================================
  const T3 = { stage: null, room: null, furn: null, furnKey: '', lights: [], models: new Map(), npcs: [], windows: [], hoverMesh: null, marker: null };
  const SEAT_Y = { chair: 0.42, stool: 0.42, sofa: 0.36 };
  const FACE = { E: Math.PI / 2, S: 0, W: -Math.PI / 2, N: Math.PI };

  function canvasTex(w, h, paint) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    paint(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
  }

  function buildRoom() {
    const g = new THREE.Group();
    const W = MAP.W, H = MAP.H, WH = 2.7;
    // suelo de tablones
    const floorTex = canvasTex(W * 48, H * 48, (c, w, h) => {
      c.fillStyle = '#5a3a22'; c.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 16) {
        const off = (y / 16 % 3) * 40;
        for (let x = -off; x < w; x += 120) {
          const r = rand(x * 0.37 + y * 1.3);
          c.fillStyle = `hsl(25, ${35 + r * 15}%, ${20 + r * 9}%)`;
          c.fillRect(x, y, 118, 15);
          c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(x + 118, y, 2, 16);
          c.fillStyle = 'rgba(255,220,180,.05)'; c.fillRect(x, y, 118, 2);
          for (let k = 0; k < 3; k++) { c.fillStyle = 'rgba(0,0,0,.12)'; c.fillRect(x + rand(x + k + y) * 110, y + 3 + k * 4, 30 + rand(k + x) * 30, 1); }
        }
        c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(0, y + 15, w, 1);
      }
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.85 }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(W / 2, 0, H / 2); floor.receiveShadow = true;
    g.add(floor);
    // tablones KayKit encima (si ya han cargado)
    const wood = MODELS.GL.ready && MODELS.pieceGeo('floor_wood_large');
    if (wood) {
      const im = new THREE.InstancedMesh(wood.geometry, [].concat(wood.material).map((m) => { const c = m.clone(); c.color = new THREE.Color('#7e6a5c'); return c; }).shift(), W * H);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(0.25, 0.25, 0.25), up = new THREE.Vector3(0, 1, 0);
      let n = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { q.setFromAxisAngle(up, ((x * 7 + y * 3) % 2) * Math.PI); m4.compose(new THREE.Vector3(x + 0.5, -0.012, y + 0.5), q, sc); im.setMatrixAt(n++, m4); }
      im.receiveShadow = true;
      g.add(im);
      floor.visible = false;
    }
    // alfombra
    const R = MAP.rug || { x0: 1, y0: 4, x1: 7, y1: 9 };
    const rugTex = canvasTex(256, 192, (c, w, h) => {
      c.fillStyle = '#5a1a1e'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#c8963a'; c.lineWidth = 6; c.strokeRect(10, 10, w - 20, h - 20);
      c.strokeStyle = '#2a4a6a'; c.lineWidth = 4; c.strokeRect(22, 22, w - 44, h - 44);
      c.fillStyle = '#7a2a2a'; for (let i = 0; i < 6; i++) { c.beginPath(); c.arc(w / 2, h / 2, 20 + i * 12, 0, 7); c.strokeStyle = i % 2 ? '#c8963a' : '#3a5a7a'; c.lineWidth = 2; c.stroke(); }
    });
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(R.x1 - R.x0, R.y1 - R.y0), new THREE.MeshStandardMaterial({ map: rugTex, roughness: 1 }));
    rug.rotation.x = -Math.PI / 2; rug.position.set((R.x0 + R.x1) / 2, 0.03, (R.y0 + R.y1) / 2); rug.receiveShadow = true;
    g.add(rug);
    // paredes: yeso arriba, zócalo de madera abajo, vigas
    const wallTex = canvasTex(512, 256, (c, w, h) => {
      c.fillStyle = '#c8b898'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 400; i++) { c.fillStyle = `rgba(${rand(i) > 0.5 ? '255,255,255' : '60,40,20'},${0.04 + rand(i * 3) * 0.05})`; c.fillRect(rand(i * 7) * w, rand(i * 11) * h, 6, 4); }
      c.fillStyle = '#4a2e1a'; c.fillRect(0, h * 0.62, w, h * 0.38);
      for (let x = 0; x < w; x += 32) { c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(x, h * 0.62, 2, h * 0.38); }
      c.fillStyle = '#2e1c10'; c.fillRect(0, h * 0.6, w, 8);
    });
    wallTex.wrapS = THREE.RepeatWrapping;
    const wallMatL = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9 });
    const texR = wallTex.clone(); texR.needsUpdate = true; texR.wrapS = THREE.RepeatWrapping; texR.repeat.set(W / 4, 1);
    wallTex.repeat.set(H / 4, 1);
    const wallMatR = new THREE.MeshStandardMaterial({ map: texR, roughness: 0.9 });
    const left = new THREE.Mesh(new THREE.BoxGeometry(0.2, WH, H + 0.2), wallMatL);
    left.position.set(-0.1, WH / 2, H / 2); left.receiveShadow = true; g.add(left);
    const right = new THREE.Mesh(new THREE.BoxGeometry(W + 0.2, WH, 0.2), wallMatR);
    right.position.set(W / 2, WH / 2, -0.1); right.receiveShadow = true; g.add(right);
    const beam = MODELS.mat('#3a2414');
    for (let z = 0; z <= H; z += 3) MODELS.mesh(MODELS.box(0.12, WH, 0.18), beam, 0.02, WH / 2, z, g);
    for (let x = 0; x <= W; x += 3) MODELS.mesh(MODELS.box(0.18, WH, 0.12), beam, x, WH / 2, 0.02, g);
    MODELS.mesh(MODELS.box(0.16, 0.16, H), beam, 0.06, WH - 0.08, H / 2, g);
    MODELS.mesh(MODELS.box(W, 0.16, 0.16), beam, W / 2, WH - 0.08, 0.06, g);
    // estantería de botellas detrás de la barra
    MODELS.mesh(MODELS.box(3, 0.06, 0.3), beam, 12.4, 1.3, 0.2, g);
    MODELS.mesh(MODELS.box(3, 0.06, 0.3), beam, 12.4, 1.75, 0.2, g);
    const cols = ['#2e7d4f', '#7a2a2a', '#3a5a9a', '#c8a040', '#6a3a8a'];
    for (let i = 0; i < 18; i++) { const b = MODELS.mesh(MODELS.cyl(0.04, 0.05, 0.22, 6), MODELS.mat(cols[i % 5], { rough: 0.25, metal: 0.1, opacity: 0.85 }), 11 + (i % 9) * 0.32, 1.45 + Math.floor(i / 9) * 0.45, 0.2, g); b.castShadow = false; }
    // ventanas a la noche (con luna, lluvia y relámpagos)
    T3.windows = [];
    for (const w of WINDOWS) {
      const sky = canvasTex(128, 192, (c, ww, hh) => {
        const gr = c.createLinearGradient(0, 0, 0, hh); gr.addColorStop(0, '#0a1430'); gr.addColorStop(1, '#1a2a4a');
        c.fillStyle = gr; c.fillRect(0, 0, ww, hh);
        if (w.moon) { c.fillStyle = '#f4f0d8'; c.beginPath(); c.arc(ww * 0.62, hh * 0.25, 16, 0, 7); c.fill(); c.fillStyle = '#0a1430'; c.beginPath(); c.arc(ww * 0.55, hh * 0.22, 14, 0, 7); c.fill(); }
        c.fillStyle = '#05080f'; c.beginPath(); c.moveTo(0, hh); c.lineTo(0, hh * 0.75); c.lineTo(ww * 0.3, hh * 0.68); c.lineTo(ww * 0.6, hh * 0.8); c.lineTo(ww, hh * 0.7); c.lineTo(ww, hh); c.fill();
        c.strokeStyle = '#05080f'; c.lineWidth = 3; c.beginPath(); c.moveTo(ww * 0.25, hh); c.lineTo(ww * 0.28, hh * 0.5); c.lineTo(ww * 0.15, hh * 0.38); c.moveTo(ww * 0.28, hh * 0.55); c.lineTo(ww * 0.4, hh * 0.42); c.stroke();
      });
      const len = w.b - w.a, z0 = w.z0 / 50, z1 = w.z1 / 50;
      const mm = new THREE.MeshStandardMaterial({ map: sky, emissive: '#ffffff', emissiveMap: sky, emissiveIntensity: 0.55, roughness: 1 });
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(len, z1 - z0), mm);
      const frameM = MODELS.mat('#2a1a10');
      const fr = new THREE.Group();
      fr.add(pane);
      MODELS.mesh(MODELS.box(len + 0.12, 0.08, 0.06), frameM, 0, (z1 - z0) / 2, 0.02, fr);
      MODELS.mesh(MODELS.box(len + 0.12, 0.1, 0.12), frameM, 0, -(z1 - z0) / 2, 0.04, fr);
      MODELS.mesh(MODELS.box(0.05, z1 - z0, 0.05), frameM, 0, 0, 0.02, fr);
      MODELS.mesh(MODELS.box(len, 0.04, 0.05), frameM, 0, 0, 0.02, fr);
      for (const sx of [-1, 1]) MODELS.mesh(MODELS.box(0.08, z1 - z0 + 0.1, 0.06), frameM, sx * len / 2, 0, 0.02, fr);
      if (w.wall === 'L') { fr.position.set(0.01, (z0 + z1) / 2, (w.a + w.b) / 2); fr.rotation.y = Math.PI / 2; }
      else { fr.position.set((w.a + w.b) / 2, (z0 + z1) / 2, 0.01); }
      g.add(fr);
      T3.windows.push({ w, mat: mm, pos: fr.position.clone() });
    }
    // antorchas de pared
    T3.torches = [];
    for (const L of TORCHES) {
      const t = new THREE.Group();
      MODELS.mesh(MODELS.box(0.08, 0.08, 0.14), MODELS.mat('#2a2a2e', { metal: 0.6 }), 0, 1.5, 0.06, t);
      const h = MODELS.mesh(MODELS.cyl(0.03, 0.025, 0.3, 5), MODELS.mat('#4a2e1a'), 0, 1.62, 0.14, t); h.rotation.x = -0.35;
      MODELS.flame(t, 0, 1.76, 0.2, 1.5);
      if (L.y === 0) t.position.set(L.x, 0, 0.02); else { t.position.set(0.02, 0, L.y); t.rotation.y = Math.PI / 2; }
      g.add(t);
      T3.torches.push({ x: L.y === 0 ? L.x : 0.35, z: L.y === 0 ? 0.35 : L.y, seed: L.x + L.y });
    }
    return g;
  }

  function buildFurniture() {
    const g = new THREE.Group();
    const lights = [];
    const place = (type, x, y, dir) => {
      const f = MODELS.furniture(type, dir);
      if (!f) return;
      f.obj.position.set(x + 0.5, 0, y + 0.5);
      g.add(f.obj);
      if (f.light) lights.push({ x: x + 0.5, y: f.light.y, z: y + 0.5 + (f.light.z || 0), color: f.light.color, intensity: f.light.intensity, dist: f.light.dist, seed: x * 3 + y });
    };
    for (const it of MAP.items) if (it.type !== 'staff') place(it.type, it.x, it.y, it.dir);
    for (const m of Object.values(MAP.MERCHANTS)) for (const pr of [m.prop, m.prop2].filter(Boolean)) place(pr.type, pr.x, pr.y);
    return { g, lights };
  }

  // Modelo de un personaje (se rehace si cambia su aspecto)
  function charModel(id, look) {
    const key = JSON.stringify(look) + MODELS.GL.version;
    let m = T3.models.get(id);
    if (m && m.key === key) return m;
    if (m) T3.stage.scene.remove(m.obj);
    const obj = MODELS.buildHero(look);
    T3.stage.scene.add(obj);
    m = { obj, key, mug: null };
    T3.models.set(id, m);
    return m;
  }

  function ensureTavern3D() {
    if (T3.stage) return;
    T3.stage = VIEW3D.makeStage({ offset: [8.2, 10.5, 8.2], fov: 36, ambient: 0.55, sky: '#7a6a8a', ground: '#2a1a10', lights: 12 });
    // la taberna: cálida, con brillo en velas y antorchas y un ligero efecto de maqueta
    T3.stage.grade = { gain: [1.07, 1.0, 0.9], lift: [0.012, 0.006, 0], saturation: 1.12, contrast: 1.08, vignette: 0.42, bloom: 0.7, bloomThreshold: 0.85, tilt: 0.8, focus: 0.5 };
    T3.stage.scene.background = new THREE.Color('#0c0608');
    T3.room = buildRoom();
    T3.stage.scene.add(T3.room);
    const hl = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.44, 24), new THREE.MeshBasicMaterial({ color: '#ffe9a8', transparent: true, opacity: 0.7, depthWrite: false }));
    hl.rotation.x = -Math.PI / 2; hl.position.y = 0.02; hl.visible = false;
    T3.stage.scene.add(hl); T3.hoverMesh = hl;
    const mk = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.3, 20), new THREE.MeshBasicMaterial({ color: '#f2c94c', transparent: true, opacity: 0.9, depthWrite: false }));
    mk.rotation.x = -Math.PI / 2; mk.position.y = 0.025; mk.visible = false;
    T3.stage.scene.add(mk); T3.marker = mk;
    window.__tavernStage = T3.stage;
  }

  function renderTavern3D(now) {
    ensureTavern3D();
    const st = T3.stage;
    // muebles (se rehacen al editar)
    // con los modelos KayKit recién cargados se rehacen el suelo y los muebles
    if (T3.roomV !== MODELS.GL.version) { st.scene.remove(T3.room); T3.room = buildRoom(); st.scene.add(T3.room); T3.roomV = MODELS.GL.version; }
    const fk = JSON.stringify(MAP.items) + MODELS.GL.version;
    if (fk !== T3.furnKey) {
      if (T3.furn) st.scene.remove(T3.furn.g);
      T3.furn = buildFurniture();
      st.scene.add(T3.furn.g);
      T3.furnKey = fk;
    }
    // personas: héroes, el tabernero y los comerciantes
    const live = new Set();
    for (const u of users.values()) {
      if (u.where) continue;
      live.add(u.id);
      const m = charModel(u.id, u.look);
      const seat = !u.path.length && u.px === u.tx && u.py === u.ty ? MAP.seatAt(u.tx, u.ty) : null;
      m.obj.position.set(u.px + 0.5, seat ? (SEAT_Y[seat.type] || 0.4) - 0.2 : 0, u.py + 0.5);
      m.obj.rotation.y = FACE[u.dir] || 0;
      const emote = u.emote && u.emote.until > now ? u.emote.e : null;
      const mugOn = u.mugUntil > now;
      if (mugOn && !m.mug) {
        if (m.obj.userData.parts.gl) { m.mug = MODELS.glProp('mug_full'); if (m.mug) m.mug.position.set(0, 0.03, 0); } else { m.mug = MODELS.mug(); m.mug.position.set(0, -0.02, 0.05); }
        if (m.mug) m.obj.userData.parts.handR.add(m.mug);
      }
      if (!mugOn && m.mug) { m.mug.parent.remove(m.mug); m.mug = null; }
      MODELS.animate(m.obj, { moving: u.path.length > 0, run: false, phase: u.phase * 2.6, t: now, sit: !!seat, emote, emoteAt: u.emote ? u.emote.until : 0, mug: mugOn });
      const top = st.project(u.px + 0.5, seat ? 1.15 : 1.35, u.py + 0.5);
      u._screen = { x: top.x, y: top.y };
    }
    for (const [id, m] of T3.models) if (!live.has(id) && !id.startsWith('npc:')) { st.scene.remove(m.obj); T3.models.delete(id); }
    const bk = charModel('npc:barkeep', bartenderLook);
    bk.obj.position.set(MAP.BARKEEP.x + 0.5, 0, MAP.BARKEEP.y + 0.5);
    bk.obj.rotation.y = -Math.PI / 2;
    const bkE = Math.floor(now / 4000) % 3 === 0;
    MODELS.animate(bk.obj, { t: now, emote: bkE ? 'cheers' : null, emoteAt: bkE ? Math.floor(now / 4000) : 0 });
    for (const [id, m] of Object.entries(MAP.MERCHANTS)) {
      const mm = charModel('npc:' + id, { cls: 'mago', skin: id === 'bruja' ? 6 : 1, hair: 0, ...m.look });
      mm.obj.position.set(m.x + 0.5, 0, m.y + 0.5);
      mm.obj.rotation.y = id === 'armero' ? 0 : Math.PI / 2;
      MODELS.animate(mm.obj, { t: now + m.x * 900 });
      const top = st.project(m.x + 0.5, 1.45, m.y + 0.5);
      m._screen = { x: top.x, y: top.y };
    }
    // casilla bajo el ratón y destino
    const hm = T3.hoverMesh;
    if (hover && MAP.inBounds(hover.x, hover.y)) {
      hm.visible = true; hm.position.set(hover.x + 0.5, 0.02, hover.y + 0.5);
      const occupied = MAP.isSeat(hover.x, hover.y) && [...users.values()].some((u) => u.id !== C.myId && !u.where && u.tx === hover.x && u.ty === hover.y);
      hm.material.color.set(C.editing ? (C.editTool === 'erase' ? '#ff6b6b' : C.editTool === 'rotate' ? '#7ad0ff' : '#ffe9a8') : MAP.isStandable(hover.x, hover.y) && !occupied ? '#ffe9a8' : '#d8433b');
    } else hm.visible = false;
    const me = users.get(C.myId);
    if (me && me.path.length) { T3.marker.visible = true; T3.marker.position.set(me.tx + 0.5, 0.025, me.ty + 0.5); T3.marker.scale.setScalar(1 + Math.sin(now / 120) * 0.15); } else T3.marker.visible = false;
    // luces: antorchas, muebles, ventanas (relámpagos) y el farol de quien juega
    const fl = flashLevel(now);
    const flick = (s) => 0.85 + Math.sin(now / 130 + s * 3) * 0.08 + Math.sin(now / 47 + s) * 0.05;
    const L = [];
    for (const t of T3.torches) L.push({ x: t.x, y: 1.85, z: t.z, color: '#ff9a40', intensity: 1.7 * flick(t.seed), dist: 6.5 });
    for (const l of T3.furn.lights) L.push({ ...l, intensity: l.intensity * flick(l.seed) });
    for (const w of T3.windows) { w.mat.emissiveIntensity = 0.55 + fl * 2.5; if (fl) L.push({ x: w.w.wall === 'L' ? 1 : w.pos.x, y: 2, z: w.w.wall === 'L' ? w.pos.z : 1, color: '#a8c0ff', intensity: fl * 6, dist: 10 }); }
    if (me && !me.where) L.push({ x: me.px + 0.5, y: 2.6, z: me.py + 0.5, color: '#ffe0b8', intensity: 0.9, dist: 6, shadow: true });
    else L.push({ x: 5, y: 2.6, z: 6, color: '#ffe0b8', intensity: 0.6, dist: 8, shadow: true });
    st.hemi.intensity = C.editing ? 0.95 : 0.55 + fl * 0.6;
    st.setLights(L);
    // cámara: la sala entera a la vista (en móvil, más cerca y siguiendo al héroe)
    const mobile = innerWidth <= 820;
    const zoom = (mobile ? 1.15 : Math.max(1.05, Math.min(1.45, (1280 / innerWidth) * 1.3 * Math.max(1, 780 / innerHeight)))) * DD.camZoom;
    st.offset.set(8.2 * zoom, 10.5 * zoom, 8.2 * zoom);
    // con la cámara cerca (móvil o zoom), sigue al héroe; si no, se ve la sala entera
    const follow = (mobile || DD.camZoom < 0.9) && me && !me.where;
    const fx = follow ? me.px + 0.5 : 7.4, fz = follow ? me.py + 0.5 : 6.4;
    T3.cam = T3.cam || { x: fx, z: fz };
    T3.cam.x += (fx - T3.cam.x) * 0.08; T3.cam.z += (fz - T3.cam.z) * 0.08;
    const panelShift = !mobile && !heroesEl.classList.contains('closed') ? 0.9 : 0;
    st.lookAt(T3.cam.x + panelShift, T3.cam.z - panelShift);
    st.render();
  }

  // Casilla de la taberna bajo el ratón (en 3D)
  function screenToTile3D(cx, cy) {
    if (!T3.stage) return { x: -1, y: -1 };
    const p = T3.stage.pick(cx, cy);
    return p ? { x: Math.floor(p.x), y: Math.floor(p.z) } : { x: -1, y: -1 };
  }

  // Nombres, bocadillos, gestos y números en pantalla
  function drawOverlays3D(now) {
    const dpr = C.view.dpr;
    C.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const list = [...users.values()].filter((u) => u._screen && !u.where).sort((a, b) => (a.px + a.py) - (b.px + b.py));
    C.ctx.textAlign = 'center'; C.ctx.textBaseline = 'middle';
    for (const u of list) {
      const s = u._screen;
      const isMe = u.id === C.myId;
      C.ctx.font = '600 12px "Pixelify Sans", sans-serif';
      const w = C.ctx.measureText(u.name).width + 12;
      const ny = s.y - 8;
      rrect(s.x - w / 2, ny - 9, w, 17, 4, isMe ? 'rgba(90,60,10,.85)' : 'rgba(20,10,4,.75)', isMe ? '#f2c94c' : null, 1);
      C.ctx.fillStyle = isMe ? '#ffe9a8' : '#f4ead2';
      C.ctx.fillText(u.name, s.x, ny);
      if (u.title) {
        C.ctx.font = 'italic 600 10px "Pixelify Sans", sans-serif';
        C.ctx.lineWidth = 3; C.ctx.strokeStyle = '#000'; C.ctx.strokeText('«' + u.title + '»', s.x, ny - 15);
        C.ctx.fillStyle = '#e8b84a'; C.ctx.fillText('«' + u.title + '»', s.x, ny - 15);
      }
      if (u.emote && u.emote.until > now) {
        const left = (u.emote.until - now) / 2600;
        C.ctx.font = '24px serif'; C.ctx.globalAlpha = Math.min(1, left * 3);
        C.ctx.fillText(EMOJI[u.emote.e] || '', s.x + w / 2 + 12, ny - 12 - (1 - left) * 10);
        C.ctx.globalAlpha = 1;
      }
      if (u.bubble && u.bubble.until > now) {
        C.ctx.font = '17px "VT323", monospace';
        const lines = wrapText(u.bubble.text, 190);
        const lw = Math.max(...lines.map((l) => C.ctx.measureText(l).width)) + 16;
        const lh = 16, bh = lines.length * lh + 10, by = ny - 16 - bh;
        C.ctx.globalAlpha = Math.min(1, (u.bubble.until - now) / 400);
        rrect(s.x - lw / 2, by, lw, bh, 6, '#fbf3dc', OUT, 2);
        poly([{ x: s.x - 6, y: by + bh - 1 }, { x: s.x + 6, y: by + bh - 1 }, { x: s.x, y: by + bh + 8 }], '#fbf3dc', null);
        C.ctx.fillStyle = '#2a1a10'; C.ctx.textBaseline = 'top';
        lines.forEach((l, i) => C.ctx.fillText(l, s.x, by + 5 + i * lh));
        C.ctx.textBaseline = 'middle';
        C.ctx.globalAlpha = 1;
      }
    }
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      const u = users.get(f.id);
      const life = (now - f.start) / f.dur;
      if (life >= 1 || !u || !u._screen) { floaters.splice(i, 1); continue; }
      C.ctx.font = '700 22px "Pixelify Sans", sans-serif';
      C.ctx.globalAlpha = 1 - Math.max(0, life - 0.7) / 0.3;
      const y = u._screen.y - 40 - life * 30;
      C.ctx.lineWidth = 4; C.ctx.strokeStyle = '#1a0a04'; C.ctx.strokeText(f.text, u._screen.x, y);
      C.ctx.fillStyle = f.color; C.ctx.fillText(f.text, u._screen.x, y);
      C.ctx.globalAlpha = 1;
    }
    // comerciantes y tabernero
    C.ctx.font = '600 11px "Pixelify Sans", sans-serif';
    for (const [id, m] of Object.entries(MAP.MERCHANTS)) {
      if (!m._screen) continue;
      const S = RULES.SHOPS[id];
      const hot = hover && MAP.merchantAt(hover.x, hover.y) === id;
      const label = (id === 'bruja' ? '🧪 ' : id === 'armero' ? '⚔️ ' : '✨ ') + S.name;
      const w = C.ctx.measureText(label).width + 12;
      rrect(m._screen.x - w / 2, m._screen.y - 9, w, 17, 4, hot ? 'rgba(90,40,110,.95)' : 'rgba(30,14,40,.82)', hot ? '#d8a8ff' : '#6a4a8a', 1);
      C.ctx.fillStyle = '#f0e0ff'; C.ctx.fillText(label, m._screen.x, m._screen.y);
    }
    const bkp = T3.stage.project(MAP.BARKEEP.x + 0.5, 1.45, MAP.BARKEEP.y + 0.5);
    const label = '🍺 Alfonso el Tabernero';
    const bw = C.ctx.measureText(label).width + 12;
    rrect(bkp.x - bw / 2, bkp.y - 9, bw, 17, 4, 'rgba(60,30,10,.85)', '#c8963a', 1);
    C.ctx.fillStyle = '#ffe6b8'; C.ctx.fillText(label, bkp.x, bkp.y);
    if (barkeep.until > now) {
      C.ctx.font = '16px "VT323", monospace';
      const tw = C.ctx.measureText(barkeep.text).width + 14;
      rrect(bkp.x - tw / 2, bkp.y - 36, tw, 22, 5, '#f4e6c0', OUT, 1.5);
      C.ctx.fillStyle = '#2a1a10'; C.ctx.fillText(barkeep.text, bkp.x, bkp.y - 25);
    }
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    updateUsers(dt);
    if (DD.scene !== 'tavern') { requestAnimationFrame(frame); return; }
    updateNight(now);
    updateBarkeep(now);
    VIEW3D.show(true);
    renderTavern3D(now);
    C.ctx.setTransform(1, 0, 0, 1, 0, 0);
    C.ctx.clearRect(0, 0, canvas.width, canvas.height);
    // viñeta suave
    const vg = C.ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, Math.min(canvas.width, canvas.height) * 0.4, canvas.width / 2, canvas.height / 2, Math.max(canvas.width, canvas.height) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.5)');
    C.ctx.fillStyle = vg; C.ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawOverlays3D(now);
    requestAnimationFrame(frame);
  }

  // Antorchas de pared (pequeñas: alumbran sólo su rincón)
  const TORCHES = [
    { x: 4, y: 0, z: 82, r: 130 }, { x: 11.5, y: 0, z: 82, r: 125 }, { x: 0, y: 8, z: 82, r: 125 }, { x: 0, y: 4.1, z: 82, r: 115 }, { x: 0, y: 11, z: 82, r: 115 },
  ];

  // ======================================================================
  //  Interacción con el escenario
  // ======================================================================
  let hover = null;
  canvas.addEventListener('pointermove', (e) => {
    const t = screenToTile3D(e.clientX, e.clientY);
    hover = MAP.inBounds(t.x, t.y) ? t : null;
  });
  canvas.addEventListener('pointerleave', () => { hover = null; });
  canvas.addEventListener('click', (e) => {
    closePops();
    const t = screenToTile3D(e.clientX, e.clientY);
    if (C.editing) { editClick(t.x, t.y); return; }
    const me = users.get(C.myId);
    if (!me) return;
    // un comerciante: abre su tienda (y te acercas)
    const shop = MAP.merchantAt(t.x, t.y) || merchantUnder(e.clientX, e.clientY);
    if (shop) {
      const m = MAP.MERCHANTS[shop];
      const spot = [[1, 0], [0, 1], [1, 1], [-1, 0], [0, -1], [2, 0], [0, 2]].map(([dx, dy]) => ({ x: m.prop.x + dx, y: m.prop.y + dy })).find((q) => MAP.isPassable(q.x, q.y));
      if (spot) { setTarget(me, spot.x, spot.y); net.send({ t: 'move', x: spot.x, y: spot.y }); }
      DD.emit('open-shop', shop);
      return;
    }
    if (!MAP.isStandable(t.x, t.y)) return;
    if (MAP.isSeat(t.x, t.y) && [...users.values()].some((u) => u.id !== C.myId && !u.where && u.tx === t.x && u.ty === t.y)) {
      toast('Ese asiento está ocupado.'); return;
    }
    setTarget(me, t.x, t.y);
    net.send({ t: 'move', x: t.x, y: t.y });
  });

  // Clic sobre el cuerpo de un comerciante (que sobresale de su casilla)
  function merchantUnder(cx, cy) {
    if (!T3.stage) return null;
    for (const [id, m] of Object.entries(MAP.MERCHANTS)) {
      const p = T3.stage.project(m.x + 0.5, 0.7, m.y + 0.5);
      if (Math.hypot(p.x - cx, p.y - cy) < 34) return id;
    }
    return null;
  }

  // Mover con el teclado (WASD / flechas) cuando no se está escribiendo
  window.addEventListener('keydown', (e) => {
    if (document.activeElement && (document.activeElement.tagName === 'INPUT')) return;
    if (DD.scene !== 'tavern' || !DD.me) return;
    if (e.key === 'Enter') { e.preventDefault(); chatInput.focus(); return; }
    const me = users.get(C.myId);
    if (!me || me.path.length) return;
    const dirs = { ArrowUp: [0, -1], w: [0, -1], ArrowDown: [0, 1], s: [0, 1], ArrowLeft: [-1, 0], a: [-1, 0], ArrowRight: [1, 0], d: [1, 0] };
    const d = dirs[e.key];
    if (!d) return;
    e.preventDefault();
    const x = me.tx + d[0], y = me.ty + d[1];
    if (!MAP.isStandable(x, y)) return;
    if (MAP.isSeat(x, y) && [...users.values()].some((u) => u.id !== C.myId && !u.where && u.tx === x && u.ty === y)) return;
    setTarget(me, x, y);
    net.send({ t: 'move', x, y });
  });

  Object.assign(C, { T3, frame });
  Object.defineProperty(C, 'hover', { get: () => hover, set: (v) => { hover = v; } });
})();
