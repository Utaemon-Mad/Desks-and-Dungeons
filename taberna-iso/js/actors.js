// Modelos (KayKit, CC0): carga, repintado de texturas y control de animaciones de los personajes.
(() => {
  const TI = (window.TI = window.TI || {});
  const A = (TI.actors = {});
  const BASE = 'assets/';
  const CHARS = ['Rogue', 'Barbarian', 'Rogue_Hooded', 'Mage'];
  const S = { chars: {}, clips: {}, props: {}, pieces: {} };
  A.store = S;

  A.load = (onProgress) => {
    const L = new THREE.GLTFLoader();
    const files = ['anims', 'dungeon', 'weapons', ...CHARS];
    let done = 0;
    const get = (n) => new Promise((res, rej) => L.load(BASE + n + '.glb', (g) => { onProgress && onProgress(++done / files.length); res(g); }, undefined, rej));
    return Promise.all(files.map(get)).then(([anims, dungeon, weapons, ...chars]) => {
      for (const c of anims.animations) S.clips[c.name] = c;
      for (const o of dungeon.scene.children) S.pieces[o.name] = o;
      for (const o of weapons.scene.children) S.props[o.name] = o;
      CHARS.forEach((n, i) => (S.chars[n] = chars[i].scene));
    });
  };

  // ----- Repintado: las texturas KayKit son una cuadrícula de 8x8 colores; se cambia la casilla entera -----
  const cache = new Map();
  function recolor(srcMat, key, cells) {
    const id = srcMat.uuid + key;
    if (cache.has(id)) return cache.get(id);
    const im = srcMat.map.image, w = im.width;
    const c = document.createElement('canvas'); c.width = c.height = w;
    const g = c.getContext('2d'); g.drawImage(im, 0, 0);
    const cs = w / 8;
    for (const [cell, col] of Object.entries(cells)) { const [cx, cy] = cell.split(',').map(Number); g.fillStyle = col; g.fillRect(cx * cs, cy * cs, cs, cs); }
    const t = new THREE.CanvasTexture(c); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    const m = srcMat.clone(); m.map = t; m.roughness = 0.8; m.metalness = 0;
    cache.set(id, m);
    return m;
  }
  A.recolor = recolor;

  // Aspectos: casillas de la textura (columna,fila) → color nuevo
  A.LOOKS = {
    cazador: { model: 'Rogue', hide: ['Rogue_Cape', 'Knife', 'Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Throwable'],
      cells: { '1,0': '#d9dad6', '1,1': '#b4b6b5', '0,2': '#2b2b2e', '0,3': '#1d1d20', '1,2': '#3a3a3e', '1,3': '#28282b' } },
    tabernero: { model: 'Barbarian', hide: ['1H_Axe_Offhand', 'Barbarian_Round_Shield', '1H_Axe', '2H_Axe', 'Barbarian_Hat', 'Barbarian_Cape'],
      cells: { '0,2': '#7a5a3a', '0,3': '#5a4128', '1,2': '#8a6a46', '2,4': '#7a5a3a', '1,3': '#5a4128' } },
    encapuchado: { model: 'Rogue_Hooded', hide: ['Knife', 'Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Throwable'],
      cells: { '0,2': '#2a2220', '0,3': '#1a1412', '1,2': '#352b27', '1,3': '#241c19' } },
    parroquiano1: { model: 'Barbarian', hide: ['1H_Axe_Offhand', 'Barbarian_Round_Shield', '1H_Axe', '2H_Axe', 'Barbarian_Hat', 'Barbarian_Cape', 'Mug'],
      cells: { '0,2': '#55683a', '0,3': '#3e4e2a', '1,2': '#667a46', '2,4': '#55683a', '1,3': '#3e4e2a' } },
    parroquiano2: { model: 'Rogue', hide: ['Rogue_Cape', 'Knife', 'Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Throwable'],
      cells: { '1,0': '#3a2a22', '1,1': '#2c1f19', '0,2': '#7a3a24', '0,3': '#5a2a1a', '1,2': '#8a4a30', '1,3': '#6a3320' } },
    parroquiano3: { model: 'Mage', hide: ['Mage_Hat', 'Mage_Cape', 'Spellbook', 'Spellbook_open', '1H_Wand', '2H_Staff'],
      cells: { '0,2': '#3d4f6e', '1,2': '#4b6086', '0,3': '#2a374f' } },
  };

  // Crea un personaje: grupo raíz + mezclador de animaciones
  A.make = (lookName, opts = {}) => {
    const look = A.LOOKS[lookName];
    const src = S.chars[look.model];
    const m = THREE.SkeletonUtils.clone(src);
    const hide = new Set(look.hide || []);
    m.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
      if (hide.has(o.name)) { o.visible = false; return; }
      if (look.cells) o.material = recolor(o.material, lookName, look.cells);
    });
    const root = new THREE.Group();
    root.add(m);
    const mixer = new THREE.AnimationMixer(m);
    const ctl = { root, model: m, mixer, look, loco: 'Idle', cur: null, actions: {} };
    const act = (n) => (ctl.actions[n] || (ctl.actions[n] = mixer.clipAction(S.clips[n])));
    // animación continua (idle, andar, correr, sentado…)
    ctl.loop = (n, fade = 0.2, speed = 1) => {
      ctl.loco = n;
      if (ctl.busy) return;
      const a = act(n);
      if (ctl.cur === a) { a.timeScale = speed; return; }
      a.reset().setLoop(THREE.LoopRepeat, Infinity).setEffectiveTimeScale(speed).setEffectiveWeight(1).play();
      if (ctl.cur) ctl.cur.crossFadeTo(a, fade, false);
      ctl.cur = a;
    };
    // animación de una sola vez (ataque, esquiva…); al acabar vuelve a la continua
    ctl.once = (n, speed = 1, fade = 0.12) => {
      const a = act(n);
      a.reset().setLoop(THREE.LoopOnce, 1).setEffectiveTimeScale(speed).setEffectiveWeight(1);
      a.clampWhenFinished = true; a.play();
      if (ctl.cur) ctl.cur.crossFadeTo(a, fade, false);
      ctl.cur = a; ctl.busy = true;
      const dur = a.getClip().duration / speed;
      clearTimeout(ctl._t);
      ctl._t = setTimeout(() => { ctl.busy = false; const back = act(ctl.loco); back.reset().setLoop(THREE.LoopRepeat, Infinity).play(); a.crossFadeTo(back, 0.2, false); ctl.cur = back; }, Math.max(100, dur * 1000 - 120));
      return dur;
    };
    ctl.loop('Idle');
    ctl.update = (dt) => mixer.update(dt);
    ctl.node = (name) => m.getObjectByName(name);
    return ctl;
  };

  // Pieza de decorado (clon con sombras y un poco más oscura/mate para que case con la luz de la taberna)
  const matCache = new Map();
  A.piece = (name, { tint = 0.82, warm = 1, rough = 0.86, glow } = {}) => {
    const src = S.pieces[name] || S.props[name];
    if (!src) { console.warn('Falta la pieza', name); return new THREE.Group(); }
    const o = src.clone(true);
    o.traverse((c) => {
      if (!c.isMesh) return;
      c.castShadow = true; c.receiveShadow = true;
      const key = c.material.uuid + tint + warm + rough;
      let m = matCache.get(key);
      if (!m) {
        m = c.material.clone(); m.roughness = rough; m.metalness = Math.min(m.metalness, 0.25);
        m.color.setRGB(tint * (1 + (warm - 1) * 0.5), tint, tint * (2 - warm));
        matCache.set(key, m);
      }
      c.material = m;
    });
    return o;
  };

  // Arma de la colección de armas, con color de metal propio
  A.weapon = (name, color, emissive) => {
    const o = S.props[name].clone(true);
    o.traverse((c) => {
      if (!c.isMesh) return;
      c.castShadow = true; c.receiveShadow = true;
      c.material = c.material.clone();
      if (color) c.material.color.set(color);
      c.material.roughness = 0.35; c.material.metalness = 0.55;
      if (emissive) { c.material.emissive = new THREE.Color(emissive); c.material.emissiveIntensity = 0.45; }
    });
    return o;
  };
})();
