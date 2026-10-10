/* global THREE, MODELS */
// Enemigos, mascotas y monturas: de bloques (reserva sin modelos) y con modelos de verdad (KayKit y Quaternius).
// Usa lo común de models.js (MODELS y MODELS._) y añade sus funciones a MODELS.
(function () {
  'use strict';
  const { mat, mesh, box, cyl, sph, cone, weapon, GL, buildHero } = MODELS;
  const { geo, psph, pivot, shade, mix, lin, linHex, WOOD, buildGL, CLASS_CHAR, ANIMALS } = MODELS._;

  // ======================================================================
  //  Enemigos
  // ======================================================================
  // Humanoide genérico: piel, ropa, tamaño y extras
  function humanoid(o) {
    const root = new THREE.Group();
    const body = pivot(root, 0, 0, 0);
    const P = { root, body };
    const skin = mat(o.skin), cloth = mat(o.cloth || '#4a3a2a'), dark = mat(shade(o.cloth || '#4a3a2a', -0.35));
    const legH = o.legH || 0.3, torsoH = o.torsoH || 0.32, w = o.width || 1;
    P.legL = pivot(body, -0.08 * w, legH + 0.05, 0); P.legR = pivot(body, 0.08 * w, legH + 0.05, 0);
    for (const L of [P.legL, P.legR]) { mesh(cyl(0.06 * w, 0.05 * w, legH, 6), o.bones ? skin : dark, 0, -legH / 2, 0, L); mesh(box(0.1 * w, 0.07, 0.14), o.bones ? skin : mat('#2a1a10'), 0, -legH - 0.01, 0.02, L); }
    const torso = pivot(body, 0, legH + 0.05, 0);
    P.torso = torso;
    if (o.bones) {
      mesh(cyl(0.025, 0.025, torsoH, 5), skin, 0, torsoH / 2, 0, torso);
      for (let i = 0; i < 4; i++) mesh(geo('rib', () => new THREE.TorusGeometry(0.1, 0.014, 3, 8, Math.PI * 1.4)), skin, 0, 0.08 + i * 0.06, 0, torso).rotation.set(Math.PI / 2, 0, Math.PI * 0.8);
      mesh(cyl(0.1, 0.08, 0.06, 6), skin, 0, 0.02, 0, torso);
    } else {
      mesh(cyl(0.17 * w, 0.14 * w, torsoH, 8), o.robe ? cloth : o.armor ? mat(o.armor, { metal: 0.5, rough: 0.5 }) : cloth, 0, torsoH / 2, 0, torso);
      if (o.robe) mesh(cyl(0.16 * w, 0.24 * w, 0.42, 8), cloth, 0, -0.16, 0, torso);
      if (o.fur) mesh(cyl(0.2 * w, 0.17 * w, torsoH * 0.6, 7), mat(o.fur), 0, torsoH * 0.75, 0, torso);
      if (o.wraps) for (let i = 0; i < 4; i++) mesh(cyl(0.175 * w, 0.175 * w, 0.025, 8), mat('#e8dcc0'), 0, 0.05 + i * 0.08, 0, torso).rotation.z = (i % 2 ? 0.15 : -0.15);
    }
    if (o.hunch) torso.rotation.x = o.hunch;
    const armLen = o.armLen || 0.3;
    P.armL = pivot(torso, -0.21 * w, torsoH - 0.02, 0); P.armR = pivot(torso, 0.21 * w, torsoH - 0.02, 0);
    for (const A of [P.armL, P.armR]) { mesh(cyl(o.bones ? 0.022 : 0.05 * w, o.bones ? 0.022 : 0.045 * w, armLen, 5), o.bones || o.bareArms ? skin : cloth, 0, -armLen / 2, 0, A); mesh(sph(0.05 * w, 5, 4), skin, 0, -armLen - 0.02, 0, A); }
    P.handR = pivot(P.armR, 0, -armLen - 0.02, 0.02); P.handL = pivot(P.armL, 0, -armLen - 0.02, 0.05);
    const head = pivot(torso, 0, torsoH + 0.13, 0);
    P.head = head;
    const hs = o.headSize || 0.14;
    const hm = mesh(sph(hs, 8, 6), skin, 0, 0.02, 0, head);
    if (o.skull) { mesh(box(0.03, 0.03, 0.01), mat('#0a0806'), -0.045, 0.03, hs - 0.01, head); mesh(box(0.03, 0.03, 0.01), mat('#0a0806'), 0.045, 0.03, hs - 0.01, head); mesh(box(0.1, 0.04, 0.08), skin, 0, -0.08, 0.05, head); }
    else {
      const eye = o.eyes ? mat(o.eyes, { emissive: o.eyes, ei: 1.8 }) : mat('#1b1410');
      for (const sx of [-1, 1]) mesh(box(0.028, 0.025, 0.01), eye, sx * 0.05, 0.04, hs - 0.005, head);
    }
    if (o.ears) for (const sx of [-1, 1]) { const e = mesh(cone(0.04, 0.16, 4), skin, sx * (hs + 0.04), 0.05, 0, head); e.rotation.z = -sx * 1.3; }
    if (o.tusks) for (const sx of [-1, 1]) mesh(cone(0.015, 0.05, 4), mat('#fff6dc'), sx * 0.05, -0.04, hs - 0.02, head);
    if (o.snout) mesh(box(0.1, 0.07, 0.1), skin, 0, -0.01, hs, head);
    if (o.hood) mesh(psph(hs + 0.04, 0, Math.PI * 0.68), mat(o.hood), 0, 0.03, -0.01, head);
    if (o.crown) for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; mesh(cone(0.025, 0.08, 4), mat('#e8c040', { metal: 0.7, rough: 0.3, emissive: '#5a4010', ei: 0.4 }), Math.cos(a) * 0.1, hs + 0.04, Math.sin(a) * 0.1, head); }
    if (o.horns) for (const sx of [-1, 1]) { const h = mesh(cone(0.03, 0.16, 5), mat('#e8e0c8'), sx * 0.12, hs + 0.02, 0, head); h.rotation.z = -sx * 0.7; }
    if (o.mask) mesh(box(0.2, 0.16, 0.03), mat(o.mask), 0, 0.03, hs, head);
    if (o.feather) mesh(cone(0.02, 0.2, 4), mat('#d84a2a'), 0.06, hs + 0.1, -0.02, head);
    hm.scale.y = o.headY || 1;
    if (o.weapon) {
      const W = weapon(o.weapon, null, P.handR);
      if (W) { if (o.weapon === 'arco') { P.handL.add(W); W.position.set(0, -0.12, 0.05); } else W.rotation.x = Math.PI / 2 - 0.3; P.weapon = W; }
    }
    if (o.club) { const c = mesh(cyl(0.035, 0.07, 0.5, 6), mat(WOOD), 0, 0, 0.2, P.handR); c.rotation.x = Math.PI / 2 - 0.2; P.weapon = c; }
    if (o.staff) { const s = weapon('baston', o.staffGlow ? 'raro' : null, P.handR); s.rotation.x = 0.1; P.weapon = s; }
    if (o.ghost) {
      for (const L of [P.legL, P.legR]) L.visible = false;
      mesh(cone(0.22, 0.5, 8), cloth, 0, 0.3, 0, body).rotation.x = Math.PI;
    }
    root.scale.setScalar(o.scale || 1);
    root.userData.parts = P;
    return root;
  }

  function quadruped(o) {
    const root = new THREE.Group();
    const body = pivot(root, 0, 0, 0);
    const P = { root, body, quad: true };
    const fur = mat(o.color), dark = mat(shade(o.color, -0.3)), light = mat(shade(o.color, 0.2));
    const L = o.len || 0.6, H = o.h || 0.32;
    const torso = pivot(body, 0, H + 0.08, 0);
    P.torso = torso;
    const t = mesh(box(o.w || 0.28, o.th || 0.26, L), fur, 0, 0, 0, torso);
    if (o.belly) mesh(box((o.w || 0.28) * 0.9, 0.08, L * 0.8), light, 0, -0.12, 0, torso);
    P.legs = [];
    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      const lg = pivot(body, sx * (o.w || 0.28) * 0.35, H, sz * L * 0.36);
      mesh(cyl(0.045, 0.04, H, 5), dark, 0, -H / 2, 0, lg);
      P.legs.push(lg);
    }
    const head = pivot(torso, 0, 0.08, L / 2 + 0.06);
    P.head = head;
    mesh(box(o.hw || 0.2, o.hh || 0.18, 0.2), fur, 0, 0, 0.02, head);
    if (o.snout !== false) mesh(box(0.11, 0.09, 0.14), light, 0, -0.03, 0.17, head);
    for (const sx of [-1, 1]) mesh(box(0.03, 0.03, 0.01), mat(o.eyes || '#ffd23f', { emissive: o.eyes || '#ffd23f', ei: 0.9 }), sx * 0.06, 0.04, 0.125, head);
    if (o.ears) for (const sx of [-1, 1]) mesh(cone(0.04, 0.09, 4), dark, sx * 0.07, 0.12, -0.02, head);
    if (o.beak) { const b = mesh(cone(0.05, 0.14, 4), mat('#d8b860'), 0, -0.02, 0.18, head); b.rotation.x = Math.PI / 2; }
    if (o.tail) { const tl = mesh(cyl(0.03, 0.015, 0.3, 4), fur, 0, 0.05, -L / 2 - 0.12, torso); tl.rotation.x = -1; }
    void t;
    root.scale.setScalar(o.scale || 1);
    root.userData.parts = P;
    return root;
  }

  function spider(o) {
    const root = new THREE.Group();
    const body = pivot(root, 0, 0, 0);
    const P = { root, body, spider: true, legs: [] };
    const c = mat(o.color || '#2a2224'), cd = mat(shade(o.color || '#2a2224', -0.3));
    const torso = pivot(body, 0, 0.22, 0);
    P.torso = torso;
    mesh(sph(0.2, 8, 6), c, 0, 0.04, -0.18, torso).scale.set(1, 0.8, 1.2);
    mesh(sph(0.12, 7, 5), cd, 0, 0, 0.08, torso);
    for (let i = 0; i < 8; i++) {
      const sx = i < 4 ? -1 : 1, k = i % 4;
      const lg = pivot(torso, sx * 0.08, 0, 0.12 - k * 0.08);
      const a = mesh(cyl(0.018, 0.015, 0.3, 4), cd, sx * 0.13, 0.05, 0, lg); a.rotation.z = sx * 1.1;
      const b = mesh(cyl(0.015, 0.01, 0.28, 4), cd, sx * 0.3, -0.07, 0, lg); b.rotation.z = -sx * 0.5;
      lg.rotation.y = sx * (k - 1.5) * 0.35;
      P.legs.push(lg);
    }
    for (const sx of [-1, 1]) mesh(sph(0.022, 4, 3), mat('#ff2a1a', { emissive: '#ff2a1a', ei: 2 }), sx * 0.04, 0.05, 0.19, torso);
    root.scale.setScalar(o.scale || 1);
    root.userData.parts = P;
    return root;
  }

  function dragon(o) {
    const root = quadruped({ color: o.color || '#8a1a12', len: 1.1, h: 0.42, w: 0.5, th: 0.42, hw: 0.28, hh: 0.24, scale: o.scale || 1, eyes: '#ffd23f', tail: true, belly: true });
    const P = root.userData.parts;
    const wingM = mat(shade(o.color || '#8a1a12', -0.2), { side: true });
    for (const sx of [-1, 1]) {
      const wg = pivot(P.torso, sx * 0.25, 0.18, 0);
      const shape = new THREE.Shape();
      shape.moveTo(0, 0); shape.lineTo(sx * 0.9, 0.35); shape.lineTo(sx * 0.8, -0.05); shape.lineTo(sx * 0.5, -0.25); shape.lineTo(0, -0.3);
      const w = mesh(geo('wing' + sx, () => new THREE.ShapeGeometry(shape)), wingM, 0, 0, 0, wg);
      w.rotation.x = -Math.PI / 2 + 0.3;
      P['wing' + sx] = wg;
    }
    P.head.position.y += 0.18; P.head.position.z += 0.12;
    for (const sx of [-1, 1]) { const h = mesh(cone(0.03, 0.18, 5), mat('#e8dcc0'), sx * 0.08, 0.14, -0.06, P.head); h.rotation.x = -0.9; }
    return root;
  }

  const tintHex = (base, t) => (t ? mix(base, t, 0.55) : base);
  // sprite (clave de RULES.MONSTERS) → modelo
  function buildEnemy(k) {
    if (GL.ready) { const g = buildEnemyGL(k); if (g) return g; }
    const M = RULES.MONSTERS[k] || { sprite: 'goblin' };
    const s = M.sprite || 'goblin';
    const t = M.tint;
    let m;
    if (s.startsWith('hero:')) return buildHero({ cls: s.slice(5), species: 'human', skin: 2, hair: 0, color: '#3a2a22' });
    switch (s) {
      case 'goblin': m = humanoid({ skin: tintHex('#6a9a3a', t), cloth: '#5a4026', ears: true, scale: 0.72, headSize: 0.16, weapon: M.weapon === 'bow' ? 'arco' : 'daga', eyes: '#ffd23f' }); break;
      case 'shaman': m = humanoid({ skin: tintHex('#6a9a3a', t), cloth: tintHex('#7a2a2a', t), ears: true, scale: 0.78, headSize: 0.16, mask: '#e8dcc0', feather: true, staff: true, robe: true, crown: M.boss }); break;
      case 'hobgoblin': m = humanoid({ skin: tintHex('#c8603a', t), cloth: '#3a3e4a', armor: '#5a5e6a', ears: true, weapon: 'espada', eyes: '#ffd23f', scale: 0.95 }); break;
      case 'bugbear': m = humanoid({ skin: tintHex('#7a5530', t), cloth: '#5a3a1e', fur: '#6a4a28', ears: true, club: true, scale: 1.2, width: 1.2, headSize: 0.16 }); break;
      case 'orc': m = humanoid({ skin: tintHex('#5a7a4a', t), cloth: '#4a3020', tusks: true, weapon: M.weapon === 'spear' ? 'lanza' : 'hacha', scale: 1.05, width: 1.15, eyes: '#ff3a2a' }); break;
      case 'warchief': m = humanoid({ skin: tintHex('#4a6a3a', t), cloth: '#3a2a20', armor: '#4a4e58', tusks: true, horns: true, weapon: 'espadon', scale: 1.2, width: 1.25, eyes: '#ff3a2a', crown: M.boss }); break;
      case 'ogre': m = humanoid({ skin: tintHex('#b8a060', t), cloth: '#6b4a2a', club: true, scale: 1.55, width: 1.45, headSize: 0.15, bareArms: true }); break;
      case 'troll': m = humanoid({ skin: tintHex('#4a7a4a', t), cloth: '#5a4a32', armLen: 0.45, hunch: 0.35, scale: 1.5, tusks: true, eyes: '#ff3a2a', bareArms: true }); break;
      case 'skeleton': m = humanoid({ skin: tintHex('#d8d0b8', t), bones: true, skull: true, weapon: M.weapon === 'bow' ? 'arco' : 'espada', headSize: 0.12 }); break;
      case 'zombie': m = humanoid({ skin: tintHex('#7a8a6a', t), cloth: '#4a4438', hunch: 0.3, eyes: '#ffef7a' }); m.userData.parts.armL.rotation.x = -1.3; m.userData.parts.armR.rotation.x = -1.3; m.userData.parts.zombie = true; break;
      case 'ghoul': m = humanoid({ skin: tintHex('#a8a89a', t), cloth: '#3a3a32', hunch: 0.5, eyes: '#ffef7a', bareArms: true, scale: 0.95 }); break;
      case 'specter': m = humanoid({ skin: tintHex('#aabee6', t), cloth: tintHex('#8aa0d0', t), ghost: true, hood: tintHex('#8aa0d0', t), eyes: '#c8f0ff' }); m.traverse((c) => { if (c.isMesh) { c.material = c.material.clone(); c.material.transparent = true; c.material.opacity = 0.65; c.castShadow = false; } }); m.userData.float = true; break;
      case 'wight': m = humanoid({ skin: '#c8c0a8', cloth: '#22262e', armor: '#3a3e48', weapon: 'espada', eyes: '#6ad0ff', skull: true }); break;
      case 'mummy': m = humanoid({ skin: '#d8ccb0', cloth: '#c8bca0', wraps: true, eyes: '#ffd23f', scale: 1.05 }); m.userData.parts.armL.rotation.x = -1.3; m.userData.parts.armR.rotation.x = -1.3; break;
      case 'lich': m = humanoid({ skin: '#d8d0b8', cloth: tintHex('#3a1a4a', t), robe: true, skull: true, crown: true, staff: true, staffGlow: true, eyes: '#7affe0', hood: '#2a1030' }); m.userData.float = true; break;
      case 'necromancer': m = humanoid({ skin: tintHex('#c8b8a8', t), cloth: tintHex('#1a1420', t), robe: true, hood: tintHex('#1a1420', t), staff: true, staffGlow: true, eyes: '#9aff7a' }); break;
      case 'wolf': m = quadruped({ color: tintHex('#6a6a72', t), ears: true, tail: true, scale: 0.85, belly: true }); break;
      case 'spider': m = spider({ color: tintHex('#2a2224', t), scale: M.scale ? 1 : 1 }); break;
      case 'bear': m = quadruped({ color: tintHex('#5a3a22', t), len: 0.8, h: 0.34, w: 0.42, th: 0.4, hw: 0.26, hh: 0.24, ears: true, scale: 1.1, belly: true }); break;
      case 'owlbear': m = quadruped({ color: tintHex('#7a5a3a', t), len: 0.75, h: 0.38, w: 0.42, th: 0.42, hw: 0.28, hh: 0.26, ears: true, beak: true, snout: false, scale: 1.2, eyes: '#ffa020' }); break;
      case 'dragon': m = dragon({ color: tintHex('#8a1a12', t), scale: 1 }); break;
      default: m = humanoid({ skin: '#6a9a3a', ears: true, scale: 0.7 });
    }
    m.scale.multiplyScalar(M.scale || 1);
    m.userData.kind = 'enemy';
    return m;
  }

  // evo: 0 normal, 1 y 2 evolucionada (más grande, otro pelaje y, al final, runas que brillan)
  function buildPet(type, evo = 0) {
    if (GL.ready) { const g = buildPetGL(type, evo); if (g) return g; }
    const P = RULES.PETS[type] || RULES.PETS.perro;
    const tint = evo ? P.evoTint[evo - 1] : P.tint;
    const m = P.sprite === 'bear' ? quadruped({ color: tint, len: 0.7, h: 0.28, w: 0.36, th: 0.34, hw: 0.24, hh: 0.22, ears: true, belly: true, eyes: evo === 2 ? '#7affff' : undefined }) : quadruped({ color: tint, ears: true, tail: true, belly: true, eyes: evo === 2 ? '#ff5a3a' : undefined });
    if (type === 'jabali') { const h = m.userData.parts.head; for (const sx of [-1, 1]) { const tk = mesh(cone(0.02, 0.1, 4), mat('#fff6dc'), sx * 0.06, -0.04, 0.24, h); tk.rotation.x = -1.2; } mesh(box(0.3, 0.05, 0.5), mat('#6a6e78', { metal: 0.5 }), 0, 0.15, 0, m.userData.parts.torso); }
    if (evo >= 1) {
      // collar con pinchos y, al evolucionar del todo, runas brillantes en el lomo
      mesh(box(0.2, 0.05, 0.08), mat('#3a2a1a'), 0, 0.02, 0.2, m.userData.parts.torso);
      for (const sx of [-1, 1]) mesh(cone(0.02, 0.06, 4), mat('#c8c8d0', { metal: 0.7 }), sx * 0.08, 0.05, 0.2, m.userData.parts.torso);
    }
    if (evo >= 2) for (let i = 0; i < 3; i++) mesh(box(0.05, 0.02, 0.05), mat('#7affff', { emissive: '#3affff', ei: 2 }), 0, 0.14, -0.1 + i * 0.1, m.userData.parts.torso);
    m.scale.multiplyScalar((type === 'osezno' ? 0.75 : 0.7) * (1 + evo * 0.18));
    m.userData.kind = 'pet';
    return m;
  }

  function buildMount(type) {
    if (GL.ready) { const g = buildMountGL(type); if (g) return g; }
    const M = RULES.MOUNTS[type] || RULES.MOUNTS.caballo;
    let m;
    if (type === 'lagarto') m = quadruped({ color: M.color, len: 0.9, h: 0.24, w: 0.34, th: 0.24, hw: 0.2, hh: 0.14, tail: true, eyes: '#ffd23f' });
    else if (type === 'lobo') m = quadruped({ color: M.color, len: 0.85, h: 0.42, w: 0.32, th: 0.3, ears: true, tail: true, belly: true });
    else {
      m = quadruped({ color: M.color, len: 0.85, h: 0.5, w: 0.3, th: 0.3, hw: 0.16, hh: 0.3, ears: true, tail: true, eyes: '#1a1410' });
      const P = m.userData.parts; P.head.position.y += 0.18; P.head.rotation.x = 0.5;
      mesh(box(0.05, 0.3, 0.06), mat('#2a1a10'), 0, 0.2, 0.32, P.torso); // crin
    }
    mesh(box(0.32, 0.06, 0.34), mat('#7a2a1a'), 0, 0.17, 0, m.userData.parts.torso); // silla
    m.userData.saddleY = (type === 'lagarto' ? 0.24 : type === 'lobo' ? 0.42 : 0.5) + 0.25;
    m.userData.kind = 'mount';
    return m;
  }

  // Rasgos de monstruo pegados a los huesos: cuernos, alas, cola, ojos que brillan, heridas…
  // f: { horns: 'small'|'big'|'curl', wings: color, tail: color, eyes: color, wounds: true, ears: true, skinHex }
  function monsterFeatures(root, f) {
    const P = root.userData.parts;
    if (!P || !P.headMesh) return;
    root.updateMatrixWorld(true);
    const bones = {};
    P.model.traverse((c) => { if (c.isBone) bones[c.name] = c; });
    P.headMesh.geometry.computeBoundingBox();
    const hb = P.headMesh.geometry.boundingBox.clone().applyMatrix4(P.headMesh.matrixWorld);
    const hc = hb.getCenter(new THREE.Vector3()), hs = hb.getSize(new THREE.Vector3());
    let body = null;
    P.model.traverse((c) => { if (c.isSkinnedMesh && /_Body$/.test(c.name)) body = c; });
    const bb = body ? new THREE.Box3().setFromObject(body) : new THREE.Box3(new THREE.Vector3(-0.18, 0.17, -0.16), new THREE.Vector3(0.18, 0.59, 0.16));
    const bw = bb.max.x - bb.min.x, bh = bb.max.y - bb.min.y;
    const skin = mat(linHex(f.skinHex || '#8a2a1a'));
    const H = new THREE.Group();
    // ojos que brillan
    if (f.eyes) {
      const em = new THREE.MeshBasicMaterial({ color: f.eyes });
      for (const sx of [-1, 1]) {
        const e = mesh(sph(hs.x * 0.065, 8, 6), em, hc.x + sx * hs.x * 0.17, hc.y - hs.y * 0.04, hb.max.z - hs.z * 0.08, H);
        e.scale.set(1.2, 0.8, 0.5); e.castShadow = false;
      }
    }
    // cuernos
    if (f.horns) {
      const hornM = mat(linHex(f.hornHex || '#2a1a14'), { rough: 0.5 });
      const big = f.horns !== 'small', k = f.horns === 'curl' ? 1.25 : big ? 1 : 0.6;
      for (const sx of [-1, 1]) {
        const base = new THREE.Group();
        base.position.set(hc.x + sx * hs.x * 0.26, hb.max.y - hs.y * 0.12, hc.z + hs.z * 0.04);
        base.rotation.z = -sx * (big ? 0.55 : 0.35); base.rotation.x = -0.25;
        H.add(base);
        const h1 = mesh(cone(hs.x * 0.09 * k, hs.y * 0.34 * k, 7), hornM, 0, hs.y * 0.17 * k, 0, base);
        if (f.horns === 'curl') { base.rotation.x = -0.6; h1.scale.set(1.15, 1, 1.15); }
      }
    }
    // orejas puntiagudas (diablillos)
    if (f.ears) {
      for (const sx of [-1, 1]) {
        const e = mesh(cone(hs.x * 0.07, hs.x * 0.36, 5), skin, hc.x + sx * hs.x * 0.5, hc.y + hs.y * 0.02, hc.z - hs.z * 0.04, H);
        e.rotation.z = -sx * 1.1; e.rotation.x = -0.2;
      }
    }
    // heridas y carne podrida (zombis)
    if (f.wounds) {
      const blood = mat('#3a0806', { rough: 0.4 }), rot = mat(linHex('#4a5a34'));
      const spots = [[0.32, 0.18, 0.7, blood], [-0.36, -0.05, 0.6, rot], [0.1, 0.38, 0.55, rot], [-0.2, 0.3, 0.75, blood]];
      for (const [x, y, zf, m] of spots) {
        const w = mesh(sph(hs.x * 0.11, 7, 5), m, hc.x + x * hs.x, hc.y + y * hs.y, hc.z + zf * hs.z * 0.5, H);
        w.scale.set(1, 0.7, 0.35);
        w.lookAt(new THREE.Vector3(hc.x + x * hs.x * 3, hc.y + y * hs.y * 3, hc.z + hs.z * 2));
      }
    }
    if (P.head) P.head.attach(H);
    // alas de murciélago a la espalda
    const chest = bones.chest || bones.spine || P.head;
    if (f.wings && chest) {
      const W = new THREE.Group();
      const shp = new THREE.Shape();
      shp.moveTo(0, 0);
      shp.lineTo(0.55, 0.32); shp.lineTo(0.95, 0.2); shp.lineTo(0.82, 0.02); shp.lineTo(0.66, 0.06);
      shp.lineTo(0.56, -0.14); shp.lineTo(0.4, -0.02); shp.lineTo(0.26, -0.2); shp.lineTo(0.14, -0.04); shp.lineTo(0, -0.12);
      const wg = new THREE.ShapeGeometry(shp);
      const memb = mat(linHex(f.wings), { side: true, rough: 0.7 });
      const boneM = mat(linHex(f.wingBone || '#1a0a08'));
      const span = bw * (f.wingSpan || 1.4);
      for (const sx of [-1, 1]) {
        const g = new THREE.Group();
        g.position.set(bb.getCenter(new THREE.Vector3()).x + sx * bw * 0.12, bb.min.y + bh * 0.78, bb.min.z + 0.01);
        g.rotation.set(0.15, sx * -0.55, sx * 0.25);
        const wmesh = mesh(wg, memb, 0, 0, 0, g); wmesh.scale.set(sx * span, span, 1);
        // hueso del ala por el borde de arriba
        const b1 = mesh(cyl(span * 0.018, span * 0.012, span * 0.64, 5), boneM, sx * span * 0.27, span * 0.16, 0.002, g); b1.rotation.z = -sx * 1.03;
        const b2 = mesh(cyl(span * 0.012, span * 0.008, span * 0.42, 5), boneM, sx * span * 0.75, span * 0.26, 0.002, g); b2.rotation.z = sx * 1.86;
        W.add(g);
      }
      chest.attach(W);
    }
    // cola con punta de flecha
    const hips = bones.hips || chest;
    if (f.tail && hips) {
      const T = new THREE.Group();
      const z0 = bb.min.z + 0.01, y0 = bb.min.y + bh * 0.22, L = bh * (f.tailLen || 1);
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, y0, z0), new THREE.Vector3(0, y0 - L * 0.18, z0 - L * 0.32),
        new THREE.Vector3(L * 0.08, y0 - L * 0.12, z0 - L * 0.62), new THREE.Vector3(L * 0.1, y0 + L * 0.12, z0 - L * 0.82),
      ]);
      const tm = mat(linHex(f.tail));
      mesh(new THREE.TubeGeometry(curve, 18, bw * 0.045, 6, false), tm, 0, 0, 0, T);
      const end = curve.getPoint(1), dir = curve.getTangent(1);
      const tip = mesh(cone(bw * 0.1, bw * 0.2, 4), tm, end.x, end.y, end.z, T);
      tip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      tip.scale.z = 0.35;
      hips.attach(T);
    }
  }

  // Enemigos humanoides con modelo de verdad (los animales y dragones siguen siendo low poly propios)
  const ENEMY_GL = {
    goblin: (M) => ['Barbarian', { tint: M.tint || '#8ac060', scale: 0.72, w: M.weapon === 'bow' ? 'ballesta' : 'daga', weaponKind: M.weapon === 'bow' ? 'ranged2' : 'dagger' }],
    shaman: (M) => ['Mage', { tint: M.tint || '#8ac060', scale: 0.78, helmet: true, w: 'baston', weaponKind: 'magic' }],
    hobgoblin: (M) => ['Knight', { tint: M.tint || '#e0905a', w: 'espada', o: 'escudo', weaponKind: 'melee1' }],
    bugbear: (M) => ['Barbarian', { tint: M.tint || '#b08050', scale: 1.2, helmet: true, w: 'hacha', wProp: 'axe_2handed', weaponKind: 'melee2' }],
    orc: (M) => ['Barbarian', { tint: M.tint || '#8aa870', scale: 1.06, w: M.weapon === 'spear' ? 'lanza' : 'hacha', weaponKind: M.weapon === 'spear' ? 'ranged1' : 'melee1' }],
    warchief: (M) => ['Knight', { tint: M.tint || '#7aa060', scale: 1.2, helmet: true, cape: true, w: 'espadon', weaponKind: 'melee2' }],
    ogre: (M) => ['Barbarian', { tint: M.tint || '#e0c890', scale: 1.55, w: 'hacha', wProp: 'axe_2handed', weaponKind: 'melee2' }],
    troll: (M) => ['Barbarian', { tint: M.tint || '#70a870', scale: 1.5, weaponKind: 'unarmed', walk: 'Walking_B' }],
    skeleton: (M) => (M.weapon === 'bow' ? ['Skeleton_Rogue', { tint: M.tint, helmet: true, w: 'ballesta', wProp: 'Skeleton_Crossbow', weaponKind: 'ranged2' }] : ['Skeleton_Warrior', { tint: M.tint, w: 'espada', wProp: 'Skeleton_Blade', o: 'escudo', oProp: 'Skeleton_Shield_Small_A', weaponKind: 'melee1' }]),
    wight: (M) => ['Skeleton_Warrior', { tint: M.tint || '#9ab0d8', helmet: true, cape: true, w: 'hacha', wProp: 'Skeleton_Axe', weaponKind: 'melee1' }],
    zombie: (M) => [M.bloated ? 'Barbarian' : 'Rogue', { tint: M.bloated ? '#b4c494' : '#a4c494', skin: M.tint || (M.bloated ? '#8aa070' : '#7a9a6a'), cloth: M.bloated ? '#5a4a30' : '#4a3a2e', hair: '#2a2a20', weaponKind: 'unarmed', walk: 'Walking_D_Skeletons', feat: { eyes: '#d8ff9a', wounds: true }, wide: M.bloated ? 1.35 : 1 }],
    imp: (M) => ['Rogue', { tint: '#ff6e5e', skin: M.tint || '#c0301c', cloth: '#3a0c08', hair: '#1a0806', weaponKind: 'magic', float: true, feat: { skinHex: M.tint || '#c0301c', eyes: '#ffe24a', horns: 'small', ears: true, wings: '#5a1008', tail: M.tint || '#c0301c', wingSpan: 1.6, tailLen: 0.9 } }],
    gargoyle: (M) => ['Barbarian', { tint: '#a2a8b0', skin: M.tint || '#6e7278', cloth: '#4a4e54', hair: '#3a3e44', weaponKind: 'unarmed', feat: { skinHex: '#6e7278', eyes: '#ff3a2a', horns: 'big', hornHex: '#4a4e54', wings: '#5a5e64', wingBone: '#3a3e44', wingSpan: 1.5 } }],
    demon: (M) => ['Barbarian', { tint: '#ff6450', skin: M.tint || '#8a1a10', cloth: '#1e0806', hair: '#120404', w: 'hacha', wProp: 'axe_2handed', weaponKind: 'melee2', feat: { skinHex: M.tint || '#8a1a10', eyes: '#ffa02a', horns: 'curl', hornHex: '#1a1210', wings: '#3a0806', tail: M.tint || '#8a1a10', wingSpan: 1.7, tailLen: 1.1 } }],
    ghoul: (M) => ['Rogue', { tint: M.tint || '#c0c0b0', weaponKind: 'unarmed', walk: 'Walking_B' }],
    mummy: (M) => ['Mage', { tint: M.tint || '#f0e4c8', weaponKind: 'unarmed', walk: 'Walking_D_Skeletons' }],
    specter: (M) => ['Rogue_Hooded', { tint: M.tint || '#a8c0ff', opacity: 0.62, float: true, weaponKind: 'magic' }],
    necromancer: (M) => ['Mage', { cloth: M.tint || '#1a2a1a', helmet: true, cape: true, w: 'baston', weaponKind: 'magic' }],
    lich: (M) => ['Skeleton_Mage', { tint: M.tint || '#d8d0f8', helmet: true, w: 'baston', wProp: 'Skeleton_Staff', weaponKind: 'magic', float: true }],
  };
  function buildEnemyGL(k) {
    const M = RULES.MONSTERS[k] || {};
    const s = M.sprite || '';
    let spec = null;
    if (s.startsWith('hero:')) {
      const cls = s.slice(5);
      spec = [CLASS_CHAR[cls] || 'Rogue', { cloth: M.tint || (cls === 'mago' ? '#5a1010' : '#4a3a2a'), helmet: M.boss, cape: M.boss, w: cls === 'explorador' ? 'ballesta' : cls === 'mago' ? 'varita' : cls === 'guerrero' ? 'hacha' : 'daga', weaponKind: cls === 'explorador' ? 'ranged2' : cls === 'mago' ? 'magic' : cls === 'guerrero' ? 'melee1' : 'dagger' }];
    } else if (ENEMY_GL[s]) spec = ENEMY_GL[s](M);
    else if (ENEMY_ANIMAL[s] && GL.animals[ENEMY_ANIMAL[s]]) {
      const m = buildAnimalGL(ENEMY_ANIMAL[s], { tint: M.tint, glowEyes: M.eyes || (M.boss ? '#ff3a2a' : null) });
      m.userData.kind = 'enemy';
      m.scale.multiplyScalar(M.scale || 1);
      return m;
    }
    if (!spec) return null;
    const [name, o] = spec;
    if (M.boss && !o.feat) { o.cape = true; o.helmet = true; }
    const m = buildGL(name, { ...o, kind: 'enemy' });
    if (o.feat) { try { monsterFeatures(m, o.feat); } catch (e) { console.warn('rasgos de monstruo', e); } }
    if (o.wide && o.wide !== 1) { const b = m.userData.parts.model; b.scale.x *= o.wide; b.scale.z *= o.wide; }
    m.scale.multiplyScalar(M.scale || 1);
    return m;
  }

  const PET_GL = { perro: 'ShibaInu', lobo: 'Wolf', zorro: 'Fox' };
  const MOUNT_GL = { caballo: ['Horse', 1.3], lobo: ['Wolf', 0.98], ciervo: ['Stag', 1.5] };
  const ENEMY_ANIMAL = { wolf: 'Wolf', hellhound: 'Wolf' };
  function buildAnimalGL(name, o = {}) {
    const A = GL.animals[name];
    if (!A) return null;
    const m = THREE.SkeletonUtils.clone(A.scene);
    const tint = o.tint ? lin(o.tint) : null;
    const nodes = {};
    m.traverse((c) => {
      if (c.name) nodes[c.name] = c;
      if (!c.isMesh) return;
      c.castShadow = true; c.receiveShadow = true; c.frustumCulled = false;
      const recolor = (src) => {
        const mm = src.clone();
        mm.roughness = 0.9; mm.metalness = 0;
        const n = src.name || '';
        // el pelaje principal toma el color pedido; lo oscuro y lo claro, versiones de ese color
        if (tint && /^(Main|Material)$/.test(n)) mm.color.copy(tint);
        else if (tint && /^(Main_Dark|Material\.010)$/.test(n)) mm.color.copy(tint).multiplyScalar(0.55);
        else if (tint && /^(Main_Light|Material\.003)$/.test(n)) mm.color.lerp(tint, 0.35);
        if (o.glowEyes && /Eye/.test(n) && !/White/.test(n)) { mm.emissive = new THREE.Color(o.glowEyes); mm.emissiveIntensity = 0.35; }
        return mm;
      };
      c.material = Array.isArray(c.material) ? c.material.map(recolor) : recolor(c.material);
    });
    const root = new THREE.Group();
    m.scale.multiplyScalar((o.height || ANIMALS[name]) / A.height);
    root.add(m);
    root.userData.parts = { gl: true, root, model: m, nodes };
    root.userData.gl = { mixer: new THREE.AnimationMixer(m), actions: {}, base: null, shot: null, last: 0, marks: {}, animal: true, clipSrc: A.clips };
    return root;
  }
  function buildPetGL(type, evo) {
    const name = PET_GL[type];
    if (!name || !GL.animals[name]) return null;
    const P = RULES.PETS[type] || {};
    const m = buildAnimalGL(name, { tint: evo ? P.evoTint && P.evoTint[evo - 1] : null, glowEyes: evo === 2 ? '#7affff' : null, height: ANIMALS[name] * (1 + evo * 0.18) });
    m.userData.kind = 'pet';
    return m;
  }
  function buildMountGL(type) {
    const def = MOUNT_GL[type];
    if (!def || !GL.animals[def[0]]) return null;
    const m = buildAnimalGL(def[0], { height: def[1] });
    const P = m.userData.parts;
    // silla y manta: siguen el lomo mientras galopa, y el jinete va encima
    const saddle = new THREE.Group();
    mesh(box(0.34, 0.05, 0.42), mat('#6a2418'), 0, 0, 0, saddle);
    mesh(box(0.26, 0.07, 0.26), mat('#5a3a22'), 0, 0.05, 0, saddle);
    mesh(box(0.27, 0.03, 0.03), mat('#c8a040', { metal: 0.6 }), 0, 0.09, 0.12, saddle);
    m.add(saddle);
    const bone = P.nodes.Torso2 || P.nodes.Torso;
    const v = new THREE.Vector3();
    const backY = () => { if (!bone) return def[1] * 0.68; m.updateMatrixWorld(true); bone.getWorldPosition(v); m.worldToLocal(v); return v.y; };
    const off = def[1] * 0.68 - backY(); // en reposo, la silla queda a esa altura
    m.userData.ride = () => { const y = backY() + off; saddle.position.y = y; return y; };
    m.userData.saddleY = m.userData.ride() + 0.02; // el modelo animado se sienta más hundido que el de bloques
    m.userData.kind = 'mount';
    return m;
  }

  Object.assign(MODELS, { buildEnemy, buildPet, buildMount });
  MODELS._.humanoid = humanoid;
})();
