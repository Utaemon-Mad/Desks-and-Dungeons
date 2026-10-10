/* global THREE, MAP, RULES */
// Modelos 3D low poly (estilo de pocos polígonos con sombreado plano): héroes que muestran todo su equipo,
// comerciantes, enemigos, mascotas, monturas, muebles de la taberna y decorado de las mazmorras.
// 1 unidad = 1 casilla. Los personajes miden ~1 unidad. Todo se construye con primitivas y se reutiliza.
(function (root) {
  'use strict';

  // ---------- Materiales y geometrías en caché ----------
  const matCache = new Map();
  function mat(color, o = {}) {
    const key = [color, o.metal || 0, o.rough || 0, o.emissive || '', o.ei || 0, o.opacity || 1, o.side || 0].join('|');
    let m = matCache.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color, flatShading: true, roughness: o.rough !== undefined ? o.rough : 0.82, metalness: o.metal || 0,
        emissive: o.emissive || '#000000', emissiveIntensity: o.ei || (o.emissive ? 1 : 0),
        transparent: (o.opacity || 1) < 1, opacity: o.opacity || 1, side: o.side ? THREE.DoubleSide : THREE.FrontSide,
      });
      matCache.set(key, m);
    }
    return m;
  }
  const geoCache = new Map();
  function geo(key, make) { let g = geoCache.get(key); if (!g) { g = make(); geoCache.set(key, g); } return g; }
  const cyl = (rt, rb, h, s = 7) => geo(`c${rt},${rb},${h},${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s));
  const box = (w, h, d) => geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
  const sph = (r, ws = 8, hs = 6) => geo(`s${r},${ws},${hs}`, () => new THREE.SphereGeometry(r, ws, hs));
  const cone = (r, h, s = 7) => geo(`k${r},${h},${s}`, () => new THREE.ConeGeometry(r, h, s));
  const torus = (r, t) => geo(`t${r},${t}`, () => new THREE.TorusGeometry(r, t, 6, 18));
  const psph = (r, t0, tl) => geo(`ps${r},${t0},${tl}`, () => new THREE.SphereGeometry(r, 9, 7, 0, Math.PI * 2, t0, tl));
  const halfSph = (r) => geo(`hs${r}`, () => new THREE.SphereGeometry(r, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2));

  function mesh(g, m, x = 0, y = 0, z = 0, parent) {
    const o = new THREE.Mesh(g, m);
    o.position.set(x, y, z);
    o.castShadow = true;
    o.receiveShadow = true;
    if (parent) parent.add(o);
    return o;
  }
  function pivot(parent, x, y, z) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }

  const shade = (hex, f) => {
    const c = new THREE.Color(hex);
    if (f < 0) c.multiplyScalar(1 + f); else c.lerp(new THREE.Color('#ffffff'), f);
    return '#' + c.getHexString();
  };
  const mix = (a, b, t) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();

  const RARITY = { inferior: null, normal: null, superior: null, magico: '#4a6aff', raro: '#ffd23a', unico: '#d8a050', conjunto: '#2ee06a' };
  const STEEL = '#9aa2ae', STEEL_D = '#5e6672', LEATHER = '#6a4226', LEATHER_D = '#3e2614', WOOD = '#6b4426';
  const SET_COL = {
    guerrero: ['#7a1a1a', '#e0b040'], mago: ['#23237a', '#c8d4ff'], explorador: ['#2a4a22', '#c8e07a'], picaro: ['#16161e', '#a070ff'],
    paladin: ['#e0d8c0', '#e8c050'], druida: ['#3a4a22', '#9ad860'], sacerdote: ['#ece4cc', '#d8a030'],
  };
  const DEFAULT_GEAR = {
    guerrero: { w: 'espada', o: 'escudo', pecho: 'malla', casco: 'placas' }, mago: { w: 'baston', pecho: 'tela', casco: 'tela' },
    explorador: { w: 'arco', pecho: 'cuero', casco: 'cuero' }, picaro: { w: 'daga', pecho: 'cuero', casco: 'tela' },
    paladin: { w: 'maza', o: 'escudo', pecho: 'placas' }, druida: { w: 'baston', pecho: 'cuero' },
    sacerdote: { w: 'maza', o: 'escudo', pecho: 'tela' },
  };

  // ======================================================================
  //  Armas
  // ======================================================================
  function weapon(base, rarity, parent) {
    const g = new THREE.Group();
    const glow = RARITY[rarity];
    const steel = mat(rarity === 'unico' ? '#f0d8a0' : '#c8ced8', { metal: 0.7, rough: 0.35 });
    const accent = glow ? mat(glow, { emissive: glow, ei: 0.8 }) : mat('#c8a040', { metal: 0.6, rough: 0.4 });
    const wood = mat(WOOD);
    switch (base) {
      case 'espada': mesh(box(0.035, 0.46, 0.012), steel, 0, 0.3, 0, g); mesh(box(0.15, 0.025, 0.04), accent, 0, 0.07, 0, g); mesh(cyl(0.018, 0.018, 0.1, 5), mat(LEATHER_D), 0, 0.01, 0, g); break;
      case 'daga': mesh(box(0.03, 0.2, 0.01), steel, 0, 0.16, 0, g); mesh(box(0.09, 0.02, 0.03), accent, 0, 0.05, 0, g); mesh(cyl(0.015, 0.015, 0.07, 5), mat(LEATHER_D), 0, 0, 0, g); break;
      case 'hacha': mesh(cyl(0.018, 0.018, 0.5, 5), wood, 0, 0.18, 0, g); { const h = mesh(box(0.16, 0.13, 0.025), steel, 0.07, 0.38, 0, g); h.rotation.z = 0.15; } mesh(box(0.03, 0.03, 0.03), accent, 0, 0.42, 0, g); break;
      case 'maza': mesh(cyl(0.02, 0.02, 0.42, 5), wood, 0, 0.16, 0, g); mesh(geo('dodec', () => new THREE.DodecahedronGeometry(0.075)), steel, 0, 0.4, 0, g); mesh(sph(0.025, 5, 4), accent, 0, 0.48, 0, g); break;
      case 'espadon': mesh(box(0.05, 0.72, 0.014), steel, 0, 0.45, 0, g); mesh(box(0.24, 0.03, 0.05), accent, 0, 0.08, 0, g); mesh(cyl(0.02, 0.02, 0.18, 5), mat(LEATHER_D), 0, -0.02, 0, g); break;
      case 'martillo': mesh(cyl(0.02, 0.02, 0.62, 5), wood, 0, 0.22, 0, g); mesh(box(0.22, 0.12, 0.12), steel, 0, 0.52, 0, g); mesh(box(0.05, 0.13, 0.13), accent, 0, 0.52, 0, g); break;
      case 'lanza': mesh(cyl(0.018, 0.018, 1.0, 5), wood, 0, 0.35, 0, g); mesh(cone(0.04, 0.16, 5), steel, 0, 0.92, 0, g); mesh(cyl(0.03, 0.03, 0.03, 6), accent, 0, 0.84, 0, g); break;
      case 'arco': {
        const arc = mesh(geo('bow', () => new THREE.TorusGeometry(0.32, 0.016, 4, 10, Math.PI * 0.9)), wood, 0, 0.18, 0, g);
        arc.rotation.z = Math.PI / 2 - Math.PI * 0.45; arc.rotation.y = Math.PI / 2;
        const str = mesh(cyl(0.004, 0.004, 0.6, 3), mat('#e8e0d0'), 0, 0.18, -0.06, g); void str;
        if (glow) mesh(sph(0.03, 5, 4), accent, 0, 0.18, 0.3, g);
        break;
      }
      case 'ballesta': { mesh(box(0.05, 0.05, 0.42), wood, 0, 0.1, 0.12, g); const b = mesh(box(0.42, 0.03, 0.03), steel, 0, 0.1, 0.28, g); void b; mesh(box(0.03, 0.03, 0.03), accent, 0, 0.13, 0.05, g); break; }
      case 'baston': { mesh(cyl(0.022, 0.026, 0.95, 5), wood, 0, 0.3, 0, g); const c = glow || '#7ad0ff'; mesh(geo('oct', () => new THREE.OctahedronGeometry(0.06)), mat(c, { emissive: c, ei: 1.4 }), 0, 0.84, 0, g); break; }
      case 'varita': { mesh(cyl(0.012, 0.016, 0.3, 5), mat('#3a2414'), 0, 0.12, 0, g); const c = glow || '#c080ff'; mesh(sph(0.03, 6, 4), mat(c, { emissive: c, ei: 1.5 }), 0, 0.29, 0, g); break; }
      default: return null;
    }
    if (parent) parent.add(g);
    return g;
  }

  function offhand(base, rarity, set, parent) {
    const g = new THREE.Group();
    const glow = RARITY[rarity];
    if (base === 'escudo') {
      const face = set === 'paladin' || set === 'sacerdote' ? '#e8e0c8' : '#7a2222';
      const disc = mesh(cyl(0.2, 0.2, 0.04, 9), mat(face), 0, 0, 0, g);
      disc.rotation.x = Math.PI / 2;
      const rim = mesh(geo('rim', () => new THREE.TorusGeometry(0.2, 0.022, 4, 12)), glow ? mat(glow, { emissive: glow, ei: 0.6 }) : mat(STEEL, { metal: 0.6, rough: 0.4 }), 0, 0, 0, g);
      void rim;
      mesh(box(0.05, 0.26, 0.05), mat('#c8a040', { metal: 0.6, rough: 0.4 }), 0, 0, 0.03, g);
      mesh(box(0.2, 0.05, 0.05), mat('#c8a040', { metal: 0.6, rough: 0.4 }), 0, 0.03, 0.03, g);
    } else if (base === 'orbe') {
      const c = glow || (set === 'druida' ? '#9ad860' : '#a060ff');
      mesh(sph(0.08, 8, 6), mat(c, { emissive: c, ei: 1.2, opacity: 0.85 }), 0, 0, 0, g);
    } else return null;
    if (parent) parent.add(g);
    return g;
  }

  // ======================================================================
  //  Héroes y personajes humanos
  // ======================================================================
  // look: { cls, species, skin, hair, gear, npc, beard, bald, apron, color }
  function buildHero(look) {
    if (GL.ready && !look.lowpoly) return buildHeroGL(look);
    const npc = look.npc || null;
    const cid = MAP.CLASSES[look.cls] ? look.cls : 'guerrero';
    const K = MAP.CLASSES[cid];
    const gear = look.gear || (npc ? {} : DEFAULT_GEAR[cid]);
    const set = gear.set && SET_COL[gear.set];
    const species = look.species || 'human';
    let cloth = look.color || K.color, trim = K.trim;
    if (set) { cloth = set[0]; trim = set[1]; }
    if (npc === 'bruja') cloth = '#2a1a34';
    if (npc === 'encapuchado') cloth = '#2a2226';
    if (npc === 'mercader') cloth = '#28305a';
    const skinHex = species === 'dragonborn' ? '#9a3a2a' : MAP.SKINS[look.skin] || MAP.SKINS[0];
    const hairHex = npc === 'bruja' ? '#b8b8c0' : MAP.HAIRS[look.hair] || MAP.HAIRS[0];
    const skin = mat(skinHex), hairM = mat(hairHex);
    const chest = npc === 'bruja' || npc === 'encapuchado' ? 'robe' : npc === 'mercader' ? 'kimono' : gear.pecho || null;
    const robe = chest === 'tela' || chest === 'robe' || chest === 'kimono';
    const accentHex = RARITY[gear.pechoR] || trim;
    const clothM = mat(cloth), clothD = mat(shade(cloth, -0.3)), accent = mat(accentHex, RARITY[gear.pechoR] ? { emissive: accentHex, ei: 0.35 } : {});
    const steelM = mat(STEEL, { metal: 0.65, rough: 0.38 }), steelD = mat(STEEL_D, { metal: 0.6, rough: 0.45 });
    const leatherM = mat(LEATHER), leatherD = mat(LEATHER_D);
    const pantsM = gear.botas === 'placas' ? steelM : mat('#3a2a20');
    const bootM = gear.botas === 'placas' || gear.botas === 'malla' ? steelD : gear.botas === 'cuero' ? leatherD : gear.botas === 'tela' ? mat('#8a6a4a') : mat('#24160e');
    const gloveM = gear.guantes === 'placas' || gear.guantes === 'malla' ? steelM : gear.guantes === 'cuero' ? leatherM : skin;

    const root = new THREE.Group();
    const body = pivot(root, 0, 0, 0); // para el balanceo al andar
    const P = { root, body };

    // --- piernas ---
    P.legL = pivot(body, -0.075, 0.4, 0); P.legR = pivot(body, 0.075, 0.4, 0);
    for (const L of [P.legL, P.legR]) {
      mesh(cyl(0.062, 0.055, 0.3, 6), pantsM, 0, -0.17, 0, L);
      mesh(box(0.11, 0.1, 0.16), bootM, 0, -0.35, 0.02, L);
      if (gear.botas === 'placas') mesh(box(0.1, 0.08, 0.04), steelM, 0, -0.18, 0.06, L);
    }
    // --- tronco ---
    const torso = pivot(body, 0, 0.4, 0);
    P.torso = torso;
    if (robe) {
      mesh(cyl(0.16, 0.25, 0.42, 8), chest === 'kimono' ? clothM : clothM, 0, -0.16, 0, torso);
      mesh(cyl(0.255, 0.255, 0.04, 8), chest === 'kimono' ? mat('#a02a2a') : accent, 0, -0.36, 0, torso);
    }
    const chestMat = chest === 'placas' ? steelM : chest === 'malla' ? mat('#7e8692', { metal: 0.5, rough: 0.55 }) : chest === 'cuero' ? leatherM : clothM;
    mesh(cyl(0.17, 0.14, 0.34, 8), chestMat, 0, 0.17, 0, torso);
    mesh(cyl(0.15, 0.15, 0.05, 8), chest === 'placas' ? steelD : leatherD, 0, 0.02, 0, torso); // cinturón
    mesh(box(0.05, 0.04, 0.02), mat('#c8a040', { metal: 0.6 }), 0, 0.02, 0.15, torso);
    if (chest === 'placas') {
      mesh(box(0.2, 0.2, 0.06), steelM, 0, 0.2, 0.12, torso);
      for (const sx of [-1, 1]) mesh(sph(0.085, 7, 5), steelM, sx * 0.19, 0.31, 0, torso);
      mesh(box(0.04, 0.12, 0.02), accent, 0, 0.2, 0.16, torso);
    } else if (chest === 'malla') {
      mesh(box(0.15, 0.18, 0.04), clothM, 0, 0.15, 0.13, torso); // sobreveste
      mesh(box(0.15, 0.03, 0.045), accent, 0, 0.25, 0.13, torso);
    } else if (chest === 'cuero') {
      const strap = mesh(box(0.04, 0.38, 0.02), leatherD, 0, 0.17, 0.15, torso); strap.rotation.z = 0.6;
      mesh(box(0.1, 0.03, 0.03), accent, 0, 0.3, 0.13, torso);
    } else if (!robe) {
      mesh(box(0.12, 0.03, 0.03), accent, 0, 0.3, 0.14, torso);
    }
    if (chest === 'kimono') mesh(box(0.06, 0.3, 0.02), mat('#e8e0d0'), 0, 0.17, 0.15, torso);
    if (look.apron) mesh(box(0.22, 0.42, 0.03), mat('#efe6d0'), 0, -0.02, 0.15, torso);
    // capa de los conjuntos y únicos
    if (set || gear.pechoR === 'unico') {
      const capeC = set ? shade(set[0], -0.1) : '#7a2a10';
      const cape = mesh(box(0.34, 0.6, 0.02), mat(capeC), 0, 0.03, -0.16, torso);
      cape.rotation.x = 0.12;
      P.cape = cape;
    }
    // --- brazos ---
    const sleeveM = chest === 'placas' ? steelM : chest === 'malla' ? mat('#7e8692', { metal: 0.5, rough: 0.55 }) : chest === 'cuero' ? leatherM : clothM;
    P.armL = pivot(torso, -0.21, 0.31, 0); P.armR = pivot(torso, 0.21, 0.31, 0);
    for (const A of [P.armL, P.armR]) {
      mesh(cyl(0.05, 0.045, 0.3, 6), sleeveM, 0, -0.15, 0, A);
      mesh(sph(0.05, 6, 5), gloveM, 0, -0.32, 0, A);
    }
    P.handR = pivot(P.armR, 0, -0.32, 0.02);
    P.handL = pivot(P.armL, 0, -0.3, 0.06);
    // --- cabeza ---
    const head = pivot(torso, 0, 0.47, 0);
    P.head = head;
    mesh(cyl(0.05, 0.06, 0.06, 6), skin, 0, -0.07, 0, head);
    const helm = npc ? null : gear.casco || null;
    const headS = mesh(sph(0.125, 9, 7), skin, 0, 0.06, 0, head);
    headS.scale.set(1, 1.05, 0.95);
    // cara
    const faceHidden = helm === 'placas' || npc === 'encapuchado';
    if (!faceHidden) {
      const gob = species === 'goblin';
      for (const sx of [-1, 1]) mesh(box(0.025, 0.035, 0.01), gob ? mat('#ffd21a', { emissive: '#c89a00', ei: 0.7 }) : mat('#1b1410'), sx * 0.05, 0.07, 0.13, head);
      if (gob) {
        mesh(cone(0.022, 0.11, 5), skin, 0, 0.02, 0.18, head).rotation.x = Math.PI / 2 + 0.3;
        for (const sx of [-1, 1]) mesh(cone(0.01, 0.03, 4), mat('#fff6dc'), sx * 0.035, -0.035, 0.13, head).rotation.x = Math.PI;
      } else mesh(box(0.03, 0.04, 0.04), mat(shade(skinHex, -0.15)), 0, 0.03, 0.14, head);
      if (npc === 'bruja') mesh(cone(0.025, 0.08, 5), mat(shade(skinHex, -0.1)), 0, 0.02, 0.17, head).rotation.x = Math.PI / 2;
      if (npc === 'mercader') { mesh(box(0.12, 0.012, 0.01), mat('#1b1410'), 0, -0.01, 0.14, head); mesh(box(0.012, 0.05, 0.01), mat('#1b1410'), -0.055, -0.04, 0.135, head); mesh(box(0.012, 0.05, 0.01), mat('#1b1410'), 0.055, -0.04, 0.135, head); }
    }
    if (look.beard || species === 'dwarf') { const bd = mesh(cone(0.11, 0.16, 6), mat(look.beard || hairHex), 0, -0.06, 0.07, head); bd.rotation.x = Math.PI; }
    // rasgos de especie
    if (species === 'elf' || species === 'gnome' || species === 'goblin') for (const sx of [-1, 1]) { const big = species === 'goblin'; const e = mesh(cone(big ? 0.06 : 0.03, big ? 0.28 : 0.12, 4), skin, sx * (big ? 0.2 : 0.15), 0.1, 0, head); e.rotation.z = -sx * (big ? 1.35 : 1.2); if (big) mesh(torus(0.022, 0.006), mat('#ffcf4a', { metal: 0.6, rough: 0.25 }), sx * 0.15, 0.06, 0, head).rotation.y = Math.PI / 2; }
    if (species === 'orc') for (const sx of [-1, 1]) mesh(cone(0.012, 0.04, 4), mat('#fff6dc'), sx * 0.04, -0.01, 0.13, head);
    if (species === 'tiefling' && helm !== 'placas') for (const sx of [-1, 1]) { const h = mesh(cone(0.025, 0.12, 5), mat('#3a2a2a'), sx * 0.08, 0.2, 0, head); h.rotation.z = -sx * 0.4; }
    if (species === 'dragonborn') { mesh(box(0.12, 0.08, 0.12), skin, 0, 0.02, 0.12, head); for (const sx of [-1, 1]) { const h = mesh(cone(0.02, 0.1, 4), mat('#d8c8a0'), sx * 0.06, 0.18, -0.06, head); h.rotation.x = -0.8; } }
    // pelo
    const hidesHair = helm === 'placas' || helm === 'malla' || helm === 'tela' || npc === 'encapuchado' || npc === 'mercader';
    if (!look.bald && species !== 'dragonborn' && !hidesHair) {
      const cap = mesh(halfSph(0.14), hairM, 0, 0.075, -0.015, head);
      cap.scale.set(1.02, 0.95, 1.05);
      mesh(box(0.2, 0.06, 0.05), hairM, 0, 0.13, 0.07, head); // flequillo
      if (robe || npc === 'bruja' || look.hair % 2 === 1) mesh(box(0.25, 0.26, 0.08), hairM, 0, -0.02, -0.1, head);
    }
    // cascos y sombreros
    const hr = RARITY[gear.cascoR];
    const hrM = hr ? mat(hr, { emissive: hr, ei: 0.6 }) : null;
    if (helm === 'tela') {
      const hood = mesh(psph(0.175, 0, Math.PI * 0.62), mat(set ? set[0] : cloth), 0, 0.07, -0.01, head);
      void hood;
      mesh(cone(0.11, 0.18, 7), mat(set ? set[0] : cloth), 0, 0.27, -0.04, head).rotation.x = -0.3;
      if (hrM) mesh(geo('hoodrim', () => new THREE.TorusGeometry(0.16, 0.015, 4, 10)), hrM, 0, 0.06, 0.03, head);
    } else if (helm === 'cuero') {
      mesh(halfSph(0.16), leatherM, 0, 0.08, 0, head);
      mesh(cyl(0.17, 0.17, 0.02, 9), leatherD, 0, 0.08, 0, head);
      if (cid === 'explorador') { const f = mesh(cone(0.015, 0.16, 4), mat('#c8e07a'), 0.1, 0.2, -0.05, head); f.rotation.z = -0.6; }
      if (hrM) mesh(sph(0.025, 5, 4), hrM, 0.12, 0.12, 0.05, head);
    } else if (helm === 'malla') {
      mesh(psph(0.17, 0, Math.PI * 0.65), mat('#7e8692', { metal: 0.5, rough: 0.5 }), 0, 0.06, 0, head);
      if (hrM) mesh(geo('coifrim', () => new THREE.TorusGeometry(0.15, 0.015, 4, 10)), hrM, 0, 0.12, 0, head);
    } else if (helm === 'placas') {
      mesh(cyl(0.16, 0.15, 0.2, 9), steelM, 0, 0.04, 0, head);
      mesh(halfSph(0.16), steelM, 0, 0.14, 0, head);
      mesh(box(0.2, 0.02, 0.02), mat('#0a0806'), 0, 0.07, 0.155, head);
      mesh(box(0.025, 0.12, 0.02), steelD, 0, 0.02, 0.16, head);
      const plume = hr || (set ? trim : null);
      if (plume) { const pl = mesh(box(0.04, 0.12, 0.18), mat(plume, { emissive: plume, ei: 0.3 }), 0, 0.3, -0.02, head); void pl; }
    }
    if (npc === 'bruja') {
      mesh(cyl(0.3, 0.3, 0.02, 12), mat('#1a1220'), 0, 0.13, 0, head);
      const h = mesh(cone(0.15, 0.42, 8), mat('#1a1220'), 0, 0.34, -0.02, head); h.rotation.x = -0.25;
      mesh(cyl(0.155, 0.155, 0.04, 8), mat('#6a2a8a'), 0, 0.16, 0, head);
    } else if (npc === 'mercader') {
      mesh(cone(0.34, 0.16, 10), mat('#c8a860'), 0, 0.2, 0, head);
      mesh(halfSph(0.145), mat('#1b1410'), 0, 0.06, -0.01, head);
    } else if (npc === 'encapuchado') {
      mesh(psph(0.19, 0, Math.PI * 0.72), mat('#1a1416'), 0, 0.06, -0.02, head);
      mesh(box(0.18, 0.15, 0.02), mat('#050305'), 0, 0.04, 0.15, head);
      for (const sx of [-1, 1]) mesh(sph(0.018, 5, 4), mat('#7affe0', { emissive: '#7affe0', ei: 2 }), sx * 0.045, 0.06, 0.165, head);
    }
    // --- armas ---
    if (gear.w) {
      const W = weapon(gear.w, gear.wr, P.handR);
      if (W) {
        if (gear.w === 'arco') { P.handL.add(W); W.rotation.set(0, 0, 0); W.position.set(0, -0.15, 0.05); }
        else if (gear.w === 'ballesta') { W.position.set(0, 0, 0); }
        else { W.rotation.x = Math.PI / 2 - 0.3; W.position.set(0, 0, 0); }
        P.weapon = W;
      }
    }
    if (gear.o) {
      const O = offhand(gear.o, gear.or, gear.set, P.handL);
      if (O) { O.position.set(-0.04, 0.06, 0.1); if (gear.o === 'orbe') O.position.set(0, -0.05, 0.12); P.off = O; }
    }
    // tamaño según la raza
    const sc = (MAP.SPECIES[species] || {}).scale || 1;
    root.scale.setScalar(sc);
    root.userData.parts = P;
    root.userData.kind = 'hero';
    return root;
  }

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

  // ======================================================================
  //  Animación
  // ======================================================================
  // st: { moving, phase, t, attack (0..1), sit, emote, hit }
  function animate(model, st) {
    if (model.userData.gl) return animateGL(model, st);
    const P = model.userData.parts;
    if (!P) return;
    const t = st.t || 0;
    const sw = st.moving ? Math.sin(st.phase) : 0;
    if (P.quad) {
      P.legs.forEach((lg, i) => { lg.rotation.x = (i === 0 || i === 3 ? 1 : -1) * sw * 0.6; });
      P.body.position.y = st.moving ? Math.abs(Math.sin(st.phase)) * 0.03 : Math.sin(t / 600) * 0.005;
      P.head.rotation.x = st.attack ? -Math.sin(st.attack * Math.PI) * 0.5 : 0;
      if (P['wing-1']) { const f = Math.sin(t / 300) * 0.25; P['wing-1'].rotation.z = f; P.wing1.rotation.z = -f; }
      return;
    }
    if (P.spider) { P.legs.forEach((lg, i) => { lg.rotation.x = Math.sin(st.phase * 1.5 + i) * (st.moving ? 0.35 : 0.05); }); return; }
    P.legL.rotation.x = sw * 0.7; P.legR.rotation.x = -sw * 0.7;
    if (!P.zombie) { P.armL.rotation.x = -sw * 0.5; P.armR.rotation.x = sw * 0.5; }
    P.body.position.y = (st.moving ? Math.abs(Math.sin(st.phase)) * 0.035 : Math.sin(t / 500) * 0.006) + (model.userData.float ? 0.12 + Math.sin(t / 400) * 0.04 : 0);
    P.armL.rotation.z = 0.08; P.armR.rotation.z = -0.08;
    if (P.cape) P.cape.rotation.x = 0.12 + (st.moving ? 0.25 + Math.sin(st.phase * 2) * 0.05 : 0);
    if (st.sit) { P.legL.rotation.x = -1.5; P.legR.rotation.x = -1.5; P.body.position.y = -0.18; }
    if (st.attack) {
      const k = Math.sin(st.attack * Math.PI);
      P.armR.rotation.x = -1.8 * k; P.armR.rotation.z = -0.3 * k;
      P.torso.rotation.y = -0.4 * k;
    } else P.torso.rotation.y = 0;
    if (st.emote === 'wave' || st.emote === 'fight') { P.armR.rotation.x = -2.6; P.armR.rotation.z = -0.3 + Math.sin(t / 120) * 0.3; }
    if (st.emote === 'cheers' || st.mug) { P.armR.rotation.x = -1.6; }
    if (st.emote === 'dance') { P.body.rotation.y = Math.sin(t / 200) * 0.6; P.armL.rotation.x = -2.4; P.armR.rotation.x = -2.4 + Math.sin(t / 150); }
    else P.body.rotation.y = 0;
    if (st.cast) { const k = Math.sin(Math.min(1, st.cast) * Math.PI); P.armL.rotation.x = -2.4 * k; P.armR.rotation.x = -2.4 * k; P.armL.rotation.z = 0.5 * k; P.armR.rotation.z = -0.5 * k; }
    if (st.fish) { P.armR.rotation.x = -1.1 + Math.sin(t / 700) * 0.05; P.armL.rotation.x = -0.9; }
    if (st.emote === 'laugh') P.head.rotation.x = Math.sin(t / 80) * 0.15;
    else if (st.emote === 'sleep') P.head.rotation.x = 0.4;
    else if (st.emote === 'think') { P.head.rotation.z = 0.2; P.armR.rotation.x = -2; }
    else { P.head.rotation.x = 0; P.head.rotation.z = 0; }
  }

  // Planta para el herbolario (cada zona la suya, con un brillo para encontrarla)
  const HERB_LOOK = [['#4a9a3a', '#b8ff7a'], ['#7a5a3a', '#d8b8ff'], ['#5a6a2a', '#ffb05a'], ['#5a8a3a', '#ff7aa0'], ['#8aa0b0', '#bff0ff'], ['#3a2a2a', '#ff6a2a']];
  function herb(zone) {
    const [leaf, glow] = HERB_LOOK[zone] || HERB_LOOK[0];
    const g = new THREE.Group();
    for (let i = 0; i < 5; i++) { const l = mesh(cone(0.05, 0.28, 4), mat(leaf), Math.cos(i * 1.3) * 0.07, 0.12, Math.sin(i * 1.3) * 0.07, g); l.rotation.set(Math.sin(i) * 0.5, 0, Math.cos(i) * 0.5); }
    mesh(sph(0.045, 6, 5), mat(glow, { emissive: glow, ei: 1.6 }), 0, 0.3, 0, g);
    g.userData.glow = glow;
    return g;
  }
  // Caña de pescar (en la mano derecha)
  function rod() {
    const g = new THREE.Group();
    const c = mesh(cyl(0.008, 0.014, 0.9, 5), mat('#6a4426'), 0, 0.45, 0, g); c.castShadow = false;
    return g;
  }

  // Jarra en la mano (taberna)
  function mug() {
    const g = new THREE.Group();
    mesh(cyl(0.05, 0.045, 0.11, 7), mat('#b8b8c0', { metal: 0.6, rough: 0.4 }), 0, 0, 0, g);
    mesh(cyl(0.045, 0.045, 0.02, 7), mat('#fff6dc'), 0, 0.06, 0, g);
    return g;
  }

  // ======================================================================
  //  Muebles de la taberna y decorado de las mazmorras
  // ======================================================================
  function flame(parent, x, y, z, s = 1) {
    const f = mesh(cone(0.04 * s, 0.12 * s, 5), mat('#ffb040', { emissive: '#ff8a20', ei: 2.2 }), x, y + 0.06 * s, z, parent);
    f.castShadow = false;
    const f2 = mesh(cone(0.022 * s, 0.07 * s, 5), mat('#fff0a0', { emissive: '#ffe080', ei: 2.5 }), x, y + 0.04 * s, z, parent);
    f2.castShadow = false;
    f.userData.flame = true;
    return f;
  }
  function candle(parent, x, y, z) { mesh(cyl(0.02, 0.02, 0.1, 6), mat('#efe6cf'), x, y + 0.05, z, parent); flame(parent, x, y + 0.1, z, 0.5); }

  // Devuelve { obj, light?: { color, intensity, dist, y } }
  function furniture(type, dir) {
    if (GL.ready) { const f = furnitureGL(type, dir); if (f) return f; }
    const g = new THREE.Group();
    const wood = mat('#6a4226'), woodD = mat('#4a2c18'), woodL = mat('#8a5a32');
    let light = null;
    const rotY = { E: Math.PI / 2, S: 0, W: -Math.PI / 2, N: Math.PI }[dir || 'S'] || 0;
    switch (type) {
      case 'barrel': mesh(cyl(0.26, 0.26, 0.55, 10), wood, 0, 0.28, 0, g); for (const y of [0.1, 0.46]) mesh(cyl(0.27, 0.27, 0.04, 10), mat('#2a2a2e', { metal: 0.5 }), 0, y, 0, g); mesh(cyl(0.24, 0.24, 0.02, 10), woodD, 0, 0.56, 0, g); break;
      case 'crate': mesh(box(0.7, 0.55, 0.7), woodL, 0, 0.28, 0, g); for (const sx of [-1, 1]) mesh(box(0.06, 0.56, 0.72), woodD, sx * 0.32, 0.28, 0, g); break;
      case 'smallcrate': mesh(box(0.45, 0.38, 0.45), woodL, 0, 0.19, 0, g); mesh(box(0.47, 0.06, 0.47), woodD, 0, 0.36, 0, g); break;
      case 'table': case 'maptable':
        mesh(box(1.0, 0.07, 1.0), wood, 0, 0.5, 0, g);
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) mesh(box(0.07, 0.5, 0.07), woodD, sx * 0.4, 0.25, sz * 0.4, g);
        if (type === 'maptable') { const p = mesh(box(0.86, 0.01, 0.86), mat('#e0cc98'), 0, 0.54, 0, g); p.receiveShadow = true; mesh(box(0.3, 0.012, 0.04), mat('#4a7ab0'), 0.1, 0.55, 0.1, g); mesh(box(0.04, 0.012, 0.35), mat('#6b8a4a'), -0.15, 0.55, -0.05, g); mesh(cyl(0.03, 0.03, 0.06, 6), mat('#d8433b'), 0.2, 0.58, -0.2, g); }
        break;
      case 'roundtable': mesh(cyl(0.42, 0.42, 0.06, 12), wood, 0, 0.5, 0, g); mesh(cyl(0.06, 0.08, 0.48, 6), woodD, 0, 0.24, 0, g); mesh(cyl(0.22, 0.22, 0.04, 8), woodD, 0, 0.02, 0, g); candle(g, -0.12, 0.53, 0.05); { const m = mug(); m.position.set(0.15, 0.58, -0.05); g.add(m); } light = { color: '#ffb060', intensity: 0.8, dist: 3, y: 0.75 }; break;
      case 'bar': mesh(box(1.0, 0.85, 1.0), woodD, 0, 0.42, 0, g); mesh(box(1.04, 0.07, 1.04), woodL, 0, 0.88, 0, g); mesh(box(1.0, 0.06, 0.02), mat('#c8a040', { metal: 0.6 }), 0, 0.2, 0.51, g); break;
      case 'bookshelf': {
        const s = new THREE.Group(); g.add(s);
        mesh(box(0.95, 1.7, 0.38), woodD, 0, 0.85, -0.28, s);
        const cols = ['#8a2a2a', '#2a5a8a', '#3a7a3a', '#c09030', '#6a3a8a'];
        for (let r = 0; r < 4; r++) for (let i = 0; i < 6; i++) mesh(box(0.11, 0.3, 0.26), mat(cols[(i + r) % 5]), -0.33 + i * 0.13, 0.25 + r * 0.4, -0.22, s);
        s.rotation.y = rotY;
        break;
      }
      case 'plant': mesh(cyl(0.2, 0.15, 0.35, 8), mat('#a0522d'), 0, 0.18, 0, g); for (const [x, y, z, r] of [[0, 0.6, 0, 0.22], [-0.15, 0.48, 0.05, 0.16], [0.15, 0.5, -0.05, 0.17], [0, 0.78, 0.05, 0.14]]) mesh(sph(r, 6, 5), mat('#3f8a3a'), x, y, z, g); break;
      case 'stool': mesh(cyl(0.18, 0.18, 0.05, 8), woodL, 0, 0.42, 0, g); for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; const l = mesh(cyl(0.025, 0.025, 0.42, 4), woodD, Math.cos(a) * 0.12, 0.2, Math.sin(a) * 0.12, g); l.rotation.set(Math.sin(a) * 0.15, 0, -Math.cos(a) * 0.15); } break;
      case 'chair': {
        const c = new THREE.Group(); g.add(c);
        mesh(box(0.45, 0.06, 0.45), woodL, 0, 0.42, 0, c);
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) mesh(box(0.05, 0.42, 0.05), woodD, sx * 0.19, 0.21, sz * 0.19, c);
        mesh(box(0.45, 0.5, 0.06), wood, 0, 0.7, -0.2, c);
        c.rotation.y = rotY;
        break;
      }
      case 'sofa': { const c = new THREE.Group(); g.add(c); mesh(box(0.95, 0.35, 0.8), mat('#23407a'), 0, 0.25, 0.05, c); mesh(box(0.95, 0.5, 0.2), mat('#1c3466'), 0, 0.55, -0.32, c); c.rotation.y = rotY; break; }
      case 'fireplace': {
        mesh(box(1.0, 1.4, 0.7), mat('#5a5258'), 0, 0.7, -0.1, g);
        mesh(box(0.6, 0.6, 0.4), mat('#140a08'), 0, 0.3, 0.12, g);
        mesh(box(1.1, 0.1, 0.8), mat('#7a6a5a'), 0, 1.0, -0.05, g);
        for (let i = -1; i <= 1; i++) flame(g, i * 0.13, 0.08, 0.15, 1.6);
        mesh(box(0.5, 0.06, 0.15), mat('#3a1a0a'), 0, 0.05, 0.15, g);
        light = { color: '#ff8a3a', intensity: 2.2, dist: 6, y: 0.5, z: 0.5 };
        break;
      }
      case 'candelabra': mesh(cyl(0.14, 0.18, 0.06, 8), mat('#3a3036', { metal: 0.6 }), 0, 0.03, 0, g); mesh(cyl(0.025, 0.025, 1.1, 5), mat('#5a4e40', { metal: 0.6 }), 0, 0.58, 0, g); mesh(box(0.42, 0.03, 0.03), mat('#5a4e40', { metal: 0.6 }), 0, 1.1, 0, g); for (const x of [-0.19, 0, 0.19]) candle(g, x, x ? 1.12 : 1.16, 0); light = { color: '#ffc070', intensity: 1.2, dist: 4.5, y: 1.3 }; break;
      case 'chandelier': {
        const y = 2.2;
        mesh(cyl(0.008, 0.008, 1.2, 3), mat('#1a1414'), 0, y + 0.6, 0, g);
        mesh(geo('ring', () => new THREE.TorusGeometry(0.4, 0.03, 4, 12)), mat('#3a2e24', { metal: 0.5 }), 0, y, 0, g).rotation.x = Math.PI / 2;
        for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; candle(g, Math.cos(a) * 0.4, y, Math.sin(a) * 0.4); }
        g.userData.noShadow = true;
        light = { color: '#ffc070', intensity: 1.6, dist: 6.5, y: y - 0.1 };
        break;
      }
      case 'chest': mesh(box(0.7, 0.4, 0.5), mat('#6a3e1e'), 0, 0.2, 0, g); mesh(cyl(0.25, 0.25, 0.7, 8, 1), mat('#8a5428'), 0, 0.4, 0, g).rotation.z = Math.PI / 2; mesh(box(0.72, 0.05, 0.52), mat('#c8a040', { metal: 0.7 }), 0, 0.25, 0, g); mesh(box(0.08, 0.1, 0.03), mat('#e8c050', { metal: 0.7 }), 0, 0.3, 0.26, g); break;
      case 'rack':
        mesh(box(0.85, 0.08, 0.25), woodD, 0, 0.04, 0, g); for (const sx of [-1, 1]) mesh(box(0.06, 1.2, 0.06), woodD, sx * 0.4, 0.6, 0, g); mesh(box(0.86, 0.05, 0.06), woodD, 0, 1.0, 0, g);
        for (const [x, b] of [[-0.22, 'espada'], [0, 'lanza'], [0.22, 'espadon']]) { const w = weapon(b, null, g); w.position.set(x, 0.1, 0.05); }
        break;
      case 'cauldron': {
        for (let i = -1; i <= 1; i++) flame(g, i * 0.12, 0.02, 0, 1.2);
        mesh(psph(0.34, Math.PI * 0.3, Math.PI * 0.7), mat('#24242a', { metal: 0.5, rough: 0.5 }), 0, 0.48, 0, g);
        const brew = mesh(cyl(0.29, 0.29, 0.03, 12), mat('#3adf6a', { emissive: '#2aaf4a', ei: 1.6 }), 0, 0.68, 0, g); brew.userData.bubble = true;
        light = { color: '#5aff8a', intensity: 1.5, dist: 4, y: 0.9 };
        break;
      }
      case 'crystal': {
        mesh(box(0.6, 0.6, 0.6), mat('#2a1a3a'), 0, 0.3, 0, g);
        mesh(cyl(0.12, 0.12, 0.05, 8), mat('#8a6a3a', { metal: 0.5 }), 0, 0.63, 0, g);
        const ball = mesh(sph(0.16, 12, 10), mat('#b070ff', { emissive: '#8a40ff', ei: 1.4, opacity: 0.85 }), 0, 0.82, 0, g); ball.userData.pulse = true;
        candle(g, -0.22, 0.6, 0.18);
        light = { color: '#b070ff', intensity: 1.5, dist: 4, y: 1 };
        break;
      }
      default: return null;
    }
    g.traverse((c) => { if (c.isMesh && g.userData.noShadow) c.castShadow = false; });
    return { obj: g, light };
  }

  function prop(k, theme) {
    if (GL.ready) { const p = propGL(k, theme); if (p) return p; }
    const g = new THREE.Group();
    const stoneC = { cripta: '#6a6c76', cuevas: '#6e5c48', fortaleza: '#6a605a', nido: '#4a5a40', volcan: '#4a3a3a' }[theme] || '#6a6c76';
    const stone = mat(stoneC), stoneD = mat(shade(stoneC, -0.3));
    let light = null, wall = false, block = true;
    switch (k) {
      case 'pillar': mesh(cyl(0.22, 0.25, 1.8, 8), stone, 0, 0.9, 0, g); mesh(box(0.6, 0.15, 0.6), stoneD, 0, 0.07, 0, g); mesh(box(0.6, 0.15, 0.6), stoneD, 0, 1.8, 0, g); break;
      case 'statue': mesh(box(0.6, 0.3, 0.6), stoneD, 0, 0.15, 0, g); { const h = humanoid({ skin: stoneC, cloth: stoneC, armor: stoneC, weapon: null, scale: 1.1 }); h.position.y = 0.3; h.traverse((c) => { if (c.isMesh) c.material = stone; }); g.add(h); } break;
      case 'sarcophagus': mesh(box(0.7, 0.5, 0.95), stone, 0, 0.25, 0, g); mesh(box(0.74, 0.08, 1.0), stoneD, 0, 0.52, 0, g); mesh(box(0.25, 0.04, 0.5), stone, 0, 0.57, 0, g); break;
      case 'coffin': mesh(box(0.5, 0.3, 0.9), mat('#4a3020'), 0, 0.15, 0, g); mesh(box(0.52, 0.05, 0.92), mat('#2e1c12'), 0, 0.32, 0, g); break;
      case 'tomb': mesh(box(0.5, 0.7, 0.15), stone, 0, 0.35, 0, g); mesh(cyl(0.25, 0.25, 0.15, 8, 1), stone, 0, 0.7, 0, g).rotation.x = Math.PI / 2; break;
      case 'altar': mesh(box(0.9, 0.55, 0.6), stone, 0, 0.27, 0, g); mesh(box(0.4, 0.02, 0.4), mat('#6a1a1a'), 0, 0.56, 0, g); candle(g, -0.3, 0.55, 0.1); candle(g, 0.3, 0.55, 0.1); light = { color: '#ffc070', intensity: 0.9, dist: 3.5, y: 0.9 }; break;
      case 'barrel': return furniture('barrel');
      case 'crate': return furniture('crate');
      case 'table': return furniture('table');
      case 'brazier': mesh(cyl(0.05, 0.08, 0.6, 5), mat('#2a2a2e', { metal: 0.6 }), 0, 0.3, 0, g); mesh(cyl(0.28, 0.16, 0.18, 8), mat('#3a3a40', { metal: 0.6 }), 0, 0.68, 0, g); for (let i = 0; i < 4; i++) flame(g, Math.cos(i * 1.6) * 0.1, 0.76, Math.sin(i * 1.6) * 0.1, 2); light = { color: '#ff8a3a', intensity: 2.2, dist: 6, y: 1.1 }; break;
      case 'rack': return furniture('rack');
      case 'cage': mesh(cyl(0.35, 0.35, 0.05, 8), mat('#3a3a40', { metal: 0.6 }), 0, 0.03, 0, g); mesh(cyl(0.35, 0.35, 0.05, 8), mat('#3a3a40', { metal: 0.6 }), 0, 1.0, 0, g); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; mesh(cyl(0.015, 0.015, 1.0, 3), mat('#5a5a62', { metal: 0.6 }), Math.cos(a) * 0.34, 0.5, Math.sin(a) * 0.34, g); } mesh(sph(0.08, 6, 5), mat('#d8d0b8'), 0, 0.12, 0, g); break;
      case 'throne': mesh(box(0.8, 0.5, 0.7), mat('#4a3020'), 0, 0.25, 0, g); mesh(box(0.8, 1.4, 0.15), mat('#5a1a1a'), 0, 0.9, -0.3, g); mesh(box(0.84, 0.08, 0.2), mat('#c8a040', { metal: 0.7 }), 0, 1.6, -0.3, g); break;
      case 'eggs': for (const [x, z] of [[-0.15, 0], [0.15, 0.05], [0, -0.18], [0.05, 0.2]]) mesh(sph(0.13, 7, 6), mat('#c8c8a8'), x, 0.15, z, g).scale.y = 1.3; block = true; break;
      case 'stalagmite': mesh(cone(0.25, 1.1, 6), stone, 0, 0.55, 0, g); mesh(cone(0.12, 0.6, 5), stoneD, 0.2, 0.3, 0.1, g); break;
      case 'mushrooms': for (const [x, z, s] of [[-0.15, 0.1, 1], [0.15, -0.1, 0.8], [0.05, 0.2, 0.6]]) { mesh(cyl(0.02, 0.025, 0.15 * s, 4), mat('#c8c0a8'), x, 0.07 * s, z, g); mesh(halfSph(0.08 * s), mat('#5affc8', { emissive: '#2adfa8', ei: 1.4 }), x, 0.15 * s, z, g); } light = { color: '#5affc8', intensity: 0.8, dist: 2.5, y: 0.4 }; block = false; break;
      case 'tent': mesh(cone(0.6, 1.0, 6), mat('#8a6a3a'), 0, 0.5, 0, g); break;
      case 'campfire': for (let i = 0; i < 5; i++) mesh(box(0.4, 0.06, 0.06), mat('#4a2e1a'), 0, 0.04, 0, g).rotation.y = i * 0.6; for (let i = 0; i < 3; i++) flame(g, Math.cos(i * 2) * 0.06, 0.06, Math.sin(i * 2) * 0.06, 2.2); light = { color: '#ff8a2a', intensity: 2, dist: 6, y: 0.6 }; break;
      case 'crystal': for (const [x, z, s] of [[0, 0, 1], [-0.2, 0.1, 0.6], [0.18, -0.08, 0.7]]) mesh(geo('oct2', () => new THREE.OctahedronGeometry(0.2)), mat('#9a5af0', { emissive: '#7a3ad8', ei: 1.3 }), x, 0.3 * s, z, g).scale.set(s, s * 2, s); light = { color: '#b070ff', intensity: 1.2, dist: 3.5, y: 0.6 }; break;
      case 'bones': for (let i = 0; i < 3; i++) mesh(cyl(0.02, 0.02, 0.3, 4), mat('#d8d0b8'), (i - 1) * 0.1, 0.02, i * 0.05, g).rotation.set(Math.PI / 2, i * 0.8, 0); block = false; break;
      case 'skull': mesh(sph(0.08, 6, 5), mat('#d8d0b8'), 0, 0.07, 0, g); block = false; break;
      case 'rubble': for (let i = 0; i < 4; i++) mesh(geo('rock', () => new THREE.DodecahedronGeometry(0.08)), stoneD, (i - 1.5) * 0.12, 0.05, (i % 2) * 0.12, g); block = false; break;
      case 'candles': for (const [x, z] of [[-0.1, 0], [0.1, 0.08], [0, -0.1]]) candle(g, x, 0, z); light = { color: '#ffc070', intensity: 0.7, dist: 2.5, y: 0.3 }; block = false; break;
      case 'lavarock': mesh(geo('rock', () => new THREE.DodecahedronGeometry(0.08)), mat('#2a1a1a'), 0, 0.05, 0, g); mesh(sph(0.04, 5, 4), mat('#ff5a1a', { emissive: '#ff5a1a', ei: 2 }), 0.06, 0.05, 0, g); light = { color: '#ff5a1a', intensity: 0.5, dist: 1.6, y: 0.2 }; block = false; break;
      case 'blood': case 'web': case 'rug': case 'puddle': case 'crack': return null; // se pintan en la textura del suelo
      case 'torch': wall = true; mesh(cyl(0.025, 0.02, 0.28, 5), mat('#4a2e1a'), 0, 0.95, 0.12, g).rotation.x = -0.4; flame(g, 0, 1.08, 0.18, 1.4); light = { color: '#ff9a40', intensity: 1.8, dist: 5.5, y: 1.15, z: 0.35 }; block = false; break;
      case 'banner': wall = true; { const col = theme === 'cripta' ? '#2a2a4a' : theme === 'nido' ? '#2a4a2a' : '#6a1414'; mesh(box(0.4, 0.8, 0.02), mat(col), 0, 1.0, 0.06, g); mesh(box(0.44, 0.04, 0.04), mat('#c8a040', { metal: 0.6 }), 0, 1.4, 0.06, g); mesh(box(0.08, 0.08, 0.025), mat('#c8a040', { metal: 0.6 }), 0, 1.05, 0.075, g); } block = false; break;
      case 'chains': wall = true; for (const x of [-0.12, 0.12]) for (let i = 0; i < 5; i++) mesh(geo('link', () => new THREE.TorusGeometry(0.03, 0.008, 3, 6)), mat('#5a5a62', { metal: 0.7 }), x, 1.3 - i * 0.07, 0.05, g).rotation.y = i % 2 ? Math.PI / 2 : 0; block = false; break;
      case 'shield': wall = true; { const s = offhand('escudo', null, null, g); s.position.set(0, 1.0, 0.05); } block = false; break;
      default: return null;
    }
    return { obj: g, light, wall, block };
  }

  // ======================================================================
  //  Personajes con modelos de verdad (KayKit, CC0): esqueleto animado, piel, pelo y ropa recoloreados,
  //  armas en las manos y animaciones (andar, correr, atacar, lanzar, esquivar, morir, sentarse…)
  // ======================================================================
  const GL = { ready: false, version: 0, chars: {}, clips: {}, props: {}, pieces: {}, geo: {}, animals: {}, height: 1 };
  // Piezas de escenario: mazmorra (sin prefijo), cementerio (h:) y pueblo medieval (m:)
  const PIECE_PACKS = [['props/dungeon.glb', ''], ['props/halloween.glb', 'h:'], ['props/medieval.glb', 'm:']];
  const SKIN_KEY = '#f6c19d';
  // Colores originales de cada modelo que se pueden cambiar (ropa, pelo) y sus piezas opcionales
  const CHAR_DEF = {
    Knight: { cloth: ['#8a4a37', 0.12], helmet: 'Knight_Helmet', cape: 'Knight_Cape' },
    Barbarian: { cloth: ['#4b6a7f', 0.1], helmet: 'Barbarian_Hat', cape: 'Barbarian_Cape' },
    Mage: { cloth: ['#4d4976', 0.09], hair: ['#2a2629', 0.05], helmet: 'Mage_Hat', cape: 'Mage_Cape' },
    Rogue: { cloth: ['#07755e', 0.12], hair: ['#834331', 0.09], cape: 'Rogue_Cape' },
    Rogue_Hooded: { cloth: ['#07755e', 0.12], cape: 'Rogue_Cape' },
    Skeleton_Warrior: { helmet: 'Skeleton_Warrior_Helmet', cape: 'Skeleton_Warrior_Cloak', skel: true },
    Skeleton_Rogue: { helmet: 'Skeleton_Rogue_Hood', cape: 'Skeleton_Rogue_Cape', skel: true },
    Skeleton_Mage: { helmet: 'Skeleton_Mage_Hat', skel: true },
    Skeleton_Minion: { cape: 'Skeleton_Minion_Cloak', skel: true },
  };
  const CLASS_CHAR = { guerrero: 'Barbarian', paladin: 'Knight', sacerdote: 'Mage', mago: 'Mage', druida: 'Mage', explorador: 'Rogue', picaro: 'Rogue_Hooded' };
  const NPC_CHAR = { bruja: ['Mage', '#2a1a34'], mercader: ['Rogue', '#28305a'], encapuchado: ['Rogue_Hooded', '#2a2226'], tabernero: ['Barbarian', '#6a4a2a'] };
  // Arma de la mochila → pieza del pack (las que no están se hacen con el modelo low poly propio)
  const WEAPON_PROP = { espada: 'sword_1handed', espadon: 'sword_2handed', hacha: 'axe_1handed', daga: 'dagger', baston: 'staff', varita: 'wand', ballesta: 'crossbow_2handed' };

  function loadAssets(base = 'assets/kaykit/') {
    if (GL.loading) return GL.loading;
    if (!THREE.GLTFLoader) return Promise.resolve(false);
    const L = new THREE.GLTFLoader();
    const get = (u) => new Promise((res, rej) => L.load(base + u, res, undefined, rej));
    const names = Object.keys(CHAR_DEF);
    // animales (Quaternius): si alguno falla, se queda el modelo de siempre
    const animalBase = base.replace(/kaykit\/$/, 'quaternius/');
    const getAnimal = (n) => new Promise((res) => L.load(animalBase + n + '.glb', res, undefined, () => res(null)));
    const animalNames = Object.keys(ANIMALS);
    GL.loading = Promise.all([get('chars/anims.glb'), get('chars/anims_skel.glb'), get('props/weapons.glb'), Promise.all(animalNames.map(getAnimal)), ...PIECE_PACKS.map(([f]) => get(f)), ...names.map((n) => get('chars/' + n + '.glb'))]).then(([anims, animsSkel, weapons, animals, ...rest]) => {
      animals.forEach((g, i) => {
        if (!g) return;
        const clips = {};
        for (const c of g.animations) clips[c.name] = c;
        g.scene.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(g.scene);
        GL.animals[animalNames[i]] = { scene: g.scene, clips, height: Math.max(0.01, box.max.y - box.min.y) };
      });
      const packs = rest.splice(0, PIECE_PACKS.length);
      const chars = rest;
      packs.forEach((pk, i) => { for (const o of pk.scene.children) GL.pieces[PIECE_PACKS[i][1] + o.name] = o; });
      for (const c of [...anims.animations, ...animsSkel.animations]) GL.clips[c.name] = c;
      names.forEach((n, i) => {
        const s = chars[i].scene;
        s.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
        GL.chars[n] = s;
      });
      // altura del caballero (sin casco ni armas) para dejar a todos a la escala del juego
      const bb = new THREE.Box3();
      GL.chars.Knight.traverse((o) => { if (o.isSkinnedMesh && !/Helmet|Cape/.test(o.name)) { o.geometry.computeBoundingBox(); bb.union(o.geometry.boundingBox); } });
      GL.height = Math.max(0.5, bb.max.y - bb.min.y);
      for (const o of weapons.scene.children) { o.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } }); GL.props[o.name] = o; }
      GL.ready = true; GL.version++;
      return true;
    }).catch((e) => { console.warn('No se pudieron cargar los modelos KayKit:', e); return false; });
    return GL.loading;
  }

  const lin = (hex) => new THREE.Color(hex).convertSRGBToLinear();
  // Material con cambio de colores: los texeles parecidos a un color "clave" pasan al color elegido (conservando el sombreado)
  // rects: [[u0, v0, u1, v1, desde, hacia]] recolorea una zona de la textura (las texturas KayKit son tiras de color)
  function swapMaterial(src, swaps, tint, opacity, rects) {
    const m = src.clone();
    const rR = [0, 1].map((i) => (rects && rects[i] ? new THREE.Vector4(...rects[i].slice(0, 4)) : new THREE.Vector4(2, 2, 2, 2)));
    const rFrom = [0, 1].map((i) => (rects && rects[i] ? lin(rects[i][4]) : new THREE.Color(1, 1, 1)));
    const rTo = [0, 1].map((i) => (rects && rects[i] ? lin(rects[i][5]) : new THREE.Color(1, 1, 1)));
    m.roughness = 0.88; m.metalness = 0; // acabado mate, como el arte original (sin brillos de plástico)
    const kFrom = [0, 1, 2].map((i) => (swaps[i] ? lin(swaps[i][0]) : new THREE.Color(0, 0, 0)));
    const kTo = [0, 1, 2].map((i) => (swaps[i] ? lin(swaps[i][1]) : new THREE.Color(0, 0, 0)));
    const kTol = [0, 1, 2].map((i) => (swaps[i] ? swaps[i][2] : 0));
    if (tint) m.color = lin(tint);
    if (m.emissive && m.emissive.getHex() !== 0) m.emissiveIntensity = Math.min(m.emissiveIntensity || 1, 0.35); // ojos que brillan, sin deslumbrar
    if (opacity !== undefined) { m.transparent = true; m.opacity = opacity; m.depthWrite = false; }
    m.onBeforeCompile = (sh) => {
      sh.uniforms.kFrom = { value: kFrom }; sh.uniforms.kTo = { value: kTo }; sh.uniforms.kTol = { value: kTol };
      sh.uniforms.rR = { value: rR }; sh.uniforms.rFrom = { value: rFrom }; sh.uniforms.rTo = { value: rTo };
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 kFrom[3]; uniform vec3 kTo[3]; uniform float kTol[3]; uniform vec4 rR[2]; uniform vec3 rFrom[2]; uniform vec3 rTo[2];')
        .replace('#include <map_fragment>', [
          '#include <map_fragment>',
          '#ifdef USE_MAP',
          'for (int i = 0; i < 2; i++) { if (vMapUv.x >= rR[i].x && vMapUv.x < rR[i].z && vMapUv.y >= rR[i].y && vMapUv.y < rR[i].w) {',
          '  diffuseColor.rgb = diffuseColor.rgb / max(rFrom[i] * vDiffuseTint, vec3(0.02)) * rTo[i] * vDiffuseTint;',
          '} }',
          '#endif',
          'for (int i = 0; i < 3; i++) { if (kTol[i] > 0.0) {',
          '  float dk = length(diffuseColor.rgb - kFrom[i] * vDiffuseTint);',
          '  float w = 1.0 - smoothstep(kTol[i] * 0.55, kTol[i], dk);',
          '  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb / max(kFrom[i] * vDiffuseTint, vec3(0.02)) * kTo[i] * vDiffuseTint, w);',
          '} }'].join('\n'))
        .replace('void main() {', 'void main() {\n  vec3 vDiffuseTint = diffuse;');
    };
    m.customProgramCacheKey = () => 'kswap';
    return m;
  }

  // Color medio del pelo de cada cabeza y zona de la textura donde está (columna 2, fila 1 de la tira de colores)
  const HEAD_HAIR = { Knight: '#e0b888', Barbarian: '#8a8079', Mage: '#2a2629', Rogue: '#8f5039', Rogue_Hooded: '#a26149' };
  const HAIR_RECT = [0.125, 0, 0.25, 0.25];
  const HOOD_RECT = [0.125, 0.25, 0.25, 0.5];

  // Pone en el modelo m la cabeza de otro (todos los personajes KayKit comparten esqueleto)
  function swapHead(m, headModel) {
    const tpl = GL.chars[headModel];
    if (!tpl) return null;
    let src = null, dst = null;
    tpl.traverse((c) => { if (c.isSkinnedMesh && /_Head/.test(c.name)) src = c; });
    m.traverse((c) => { if (c.isSkinnedMesh && /_Head/.test(c.name)) dst = c; });
    if (!src || !dst) return null;
    const h = new THREE.SkinnedMesh(src.geometry, src.material);
    h.name = src.name;
    h.castShadow = true; h.receiveShadow = true; h.frustumCulled = false;
    dst.parent.add(h);
    h.position.copy(dst.position); h.quaternion.copy(dst.quaternion); h.scale.copy(dst.scale);
    h.bind(dst.skeleton, dst.bindMatrix);
    dst.parent.remove(dst);
    return h;
  }

  // Monta un personaje: name (modelo), o: { cloth, skin, hair, tint, opacity, helmet, cape, w, wr, o, or, scale, weaponKind, mug,
  //   head: modelo del que sale la cabeza (sexo y peinado) }
  function buildGL(name, o = {}) {
    const def = CHAR_DEF[name];
    const tpl = GL.chars[name];
    const m = THREE.SkeletonUtils.clone(tpl);
    const headModel = o.head && GL.chars[o.head] ? o.head : name;
    if (headModel !== name) swapHead(m, headModel);
    const nodes = {};
    m.traverse((c) => { if (c.name) nodes[c.name] = c; });
    let headMesh = null;
    m.traverse((c) => {
      if (!c.isMesh) return;
      const isHelmet = def.helmet && c.name === def.helmet, isCape = def.cape && c.name === def.cape;
      if (isHelmet) c.visible = !!o.helmet;
      else if (isCape) c.visible = !!o.cape;
      else if (!c.isSkinnedMesh) { c.visible = false; return; } // las armas de serie se esconden: se ponen las del equipo
      const swaps = [], rects = [];
      const isHead = c.isSkinnedMesh && /_Head/.test(c.name);
      if (isHead) headMesh = c;
      if (!def.skel) {
        if (o.skin) swaps.push([SKIN_KEY, o.skin, 0.16]);
        if (isHead) {
          // el pelo (y la capucha) se recolorean por zona de la textura: vale para cualquier cabeza
          if (o.hair && HEAD_HAIR[headModel]) rects.push([...HAIR_RECT, HEAD_HAIR[headModel], o.hair]);
          if (headModel === 'Rogue_Hooded' && o.cloth) rects.push([...HOOD_RECT, '#008053', o.cloth]);
        } else if (o.cloth && def.cloth) swaps.push([def.cloth[0], o.cloth, def.cloth[1]]);
        if (o.cape && /Cape/.test(c.name) && o.capeColor && def.cloth) swaps.push([def.cloth[0], o.capeColor, def.cloth[1] * 1.4]);
      }
      c.material = swapMaterial(c.material, swaps, o.tint, o.opacity, rects);
      if (o.opacity !== undefined) c.castShadow = false;
    });
    const root = new THREE.Group();
    const s = 1.02 / GL.height * (o.scale || 1);
    m.scale.setScalar(s);
    root.add(m);
    const hR = nodes.handslotr || nodes['handslot.r'], hL = nodes.handslotl || nodes['handslot.l']; // el cargador quita los puntos de los nombres
    const P = { gl: true, root, model: m, armR: hR, handR: hR, handL: hL, head: nodes.head, headMesh };
    // armas del equipo en las manos
    const attach = (hand, propName, base, rarity) => {
      let w = null;
      if (propName && GL.props[propName]) {
        w = GL.props[propName].clone(true);
        w.position.set(0, 0.033, 0); w.rotation.set(0, Math.PI, 0);
        if (rarity && RARITY[rarity]) w.traverse((c) => { if (c.isMesh) { c.material = c.material.clone(); c.material.emissive = new THREE.Color(RARITY[rarity]); c.material.emissiveIntensity = rarity === 'unico' || rarity === 'conjunto' ? 0.55 : 0.25; } });
      } else if (base) {
        w = weapon(base, rarity) || offhand(base, rarity, o.set);
        if (w) { w.scale.setScalar(1 / s); w.rotation.set(0, 0, base === 'arco' ? Math.PI / 2 : 0); }
      }
      if (w && hand) hand.add(w);
      return w;
    };
    if (o.w) P.weapon = attach(o.w === 'arco' ? hL : hR, o.wProp || WEAPON_PROP[o.w], o.w, o.wr);
    if (o.o) P.off = attach(hL, o.oProp || (o.o === 'escudo' ? (name === 'Knight' ? 'shield_badge' : name === 'Barbarian' ? 'shield_round' : 'shield_square') : o.o === 'orbe' ? 'spellbook_open' : null), o.o, o.or);
    if (o.mug && GL.props.mug_full) { const mg = GL.props.mug_full.clone(true); mg.position.set(0, 0.03, 0); hR.add(mg); P.mug = mg; }
    root.userData.parts = P;
    root.userData.gl = { mixer: new THREE.AnimationMixer(m), actions: {}, base: null, shot: null, last: 0, marks: {}, kind: o.weaponKind || 'melee1', walk: o.walk, idle: o.idle, float: o.float };
    root.userData.kind = o.kind || 'hero';
    if (o.float) m.position.y = 0.1;
    return root;
  }

  // Animaciones del esqueleto según el estado (andar, quieto, sentado…) y golpes o hechizos que se disparan una vez
  const ATTACK_CLIPS = {
    melee1: ['1H_Melee_Attack_Chop', '1H_Melee_Attack_Slice_Diagonal', '1H_Melee_Attack_Stab'], melee2: ['2H_Melee_Attack_Slice', '2H_Melee_Attack_Chop'],
    dagger: ['Dualwield_Melee_Attack_Stab', '1H_Melee_Attack_Stab'], ranged1: ['1H_Ranged_Shoot'], ranged2: ['2H_Ranged_Shoot'], magic: ['Spellcast_Shoot'], unarmed: ['Unarmed_Melee_Attack_Punch_A'],
  };
  function glAction(G, name, once) {
    let a = G.actions[name];
    if (!a) {
      const clip = (G.clipSrc || GL.clips)[name];
      if (!clip) return null;
      a = G.mixer.clipAction(clip);
      if (once) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      G.actions[name] = a;
    }
    return a;
  }
  function glPlay(G, name, once, fade = 0.15) {
    const a = glAction(G, name, once);
    if (!a) return null;
    if (once) {
      if (G.shot && G.shot !== a) G.shot.fadeOut(fade);
      a.reset().setEffectiveWeight(1).fadeIn(0.06).play();
      G.shot = a;
      G.shotEnd = G.time + a.getClip().duration / (a.timeScale || 1);
      if (G.base) G.base.setEffectiveWeight(0.0);
      return a;
    }
    if (G.base === a) return a;
    if (G.base) G.base.fadeOut(fade);
    a.reset().setEffectiveWeight(1).fadeIn(fade).play();
    G.base = a;
    return a;
  }
  // st: { t, moving, run, sit, emote, mug, attackAt, castAt, hitAt, rollAt, deadAt, fish }
  function animateGL(model, st) {
    const G = model.userData.gl;
    const t = (st.t || 0) / 1000;
    const dt = G.last ? Math.min(0.1, Math.max(0, t - G.last)) : 0;
    G.last = t; G.time = (G.time || 0) + dt;
    const fire = (k, at) => { if (at && at !== G.marks[k]) { G.marks[k] = at; return true; } return false; };
    if (G.animal) {
      // animales: quieto, al paso o al galope; muerden, se encogen al recibir y caen al morir
      if (st.deadAt) { if (fire('dead', st.deadAt)) glPlay(G, 'Death', true, 0.08); G.mixer.update(dt); return; }
      if (fire('atk', st.attackAt)) glPlay(G, 'Attack', true, 0.06);
      else if (fire('hit', st.hitAt) && !G.shot) glPlay(G, 'Hit', true, 0.05);
      if (G.shot && G.time >= G.shotEnd - 0.12) { G.shot.fadeOut(0.18); G.shot = null; if (G.base) G.base.setEffectiveWeight(1); }
      glPlay(G, st.moving ? (st.run === false ? 'Walk' : 'Gallop') : 'Idle', false);
      if (G.shot && G.base) G.base.setEffectiveWeight(0.0);
      G.mixer.update(dt);
      return;
    }
    if (st.deadAt) { if (fire('dead', st.deadAt)) glPlay(G, 'Death_A', true, 0.08); G.mixer.update(dt); return; }
    if (fire('roll', st.rollAt)) glPlay(G, 'Dodge_Forward', true, 0.05);
    else if (fire('cast', st.castAt)) glPlay(G, G.kind === 'magic' ? 'Spellcast_Shoot' : 'Spellcast_Raise', true);
    else if (fire('atk', st.attackAt)) { const l = ATTACK_CLIPS[G.kind] || ATTACK_CLIPS.melee1; glPlay(G, l[(G.n = (G.n || 0) + 1) % l.length], true, 0.06); }
    else if (fire('hit', st.hitAt) && !G.shot) glPlay(G, 'Hit_A', true, 0.05);
    if (fire('emote', st.emote && st.emoteAt)) glPlay(G, st.emote === 'cheers' || st.emote === 'dance' ? 'Cheer' : st.emote === 'wave' ? 'Interact' : st.emote === 'fight' ? '1H_Melee_Attack_Chop' : 'Interact', true);
    if (G.shot && G.time >= G.shotEnd - 0.12) { G.shot.fadeOut(0.18); G.shot = null; if (G.base) G.base.setEffectiveWeight(1); }
    // estado de fondo
    let base = G.idle || (G.kind === 'melee2' ? '2H_Melee_Idle' : 'Idle');
    if (st.sit) base = st.sitFloor ? 'Sit_Floor_Idle' : 'Sit_Chair_Idle';
    else if (st.moving) base = st.run === false ? (G.walk || 'Walking_A') : (G.walk || 'Running_A');
    else if (st.fish) base = '1H_Ranged_Aiming';
    else if (st.emote === 'dance' && !G.shot) base = 'Cheer';
    else if (st.emote === 'sleep') base = 'Sit_Floor_Idle';
    glPlay(G, base, false);
    if (G.shot && G.base) G.base.setEffectiveWeight(0.0);
    if (G.float) model.userData.parts.model.position.y = 0.12 + Math.sin(t * 2.4) * 0.04;
    G.mixer.update(dt);
  }
  // Pose fija (retratos): el modelo en un fotograma de una animación
  function posePeek(model, clip = 'Idle', time = 0.4) {
    const G = model.userData.gl;
    if (!G) return;
    const a = glAction(G, clip, false);
    if (!a) return;
    a.reset().play(); G.mixer.update(time);
  }

  // Geometría de una pieza de escenario (todas sus mallas juntas) para dibujar muchas copias de golpe
  const matteCache = new Map();
  function matte(m) {
    let c = matteCache.get(m);
    if (!c) { c = m.clone(); c.roughness = Math.max(0.8, c.roughness || 0); c.metalness = 0; matteCache.set(m, c); }
    return c;
  }
  function pieceGeo(name, centered) {
    if (centered) {
      // la misma pieza con su centro (en planta) en el origen y apoyada en el suelo
      if (GL.geo[name + '#c']) return GL.geo[name + '#c'];
      const P = pieceGeo(name);
      if (!P) return null;
      const g = P.geometry.clone();
      const b = P.box;
      g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
      g.computeBoundingBox();
      GL.geo[name + '#c'] = { geometry: g, material: P.material, box: g.boundingBox };
      return GL.geo[name + '#c'];
    }
    if (GL.geo[name]) return GL.geo[name];
    const node = GL.pieces[name];
    if (!node) return null;
    node.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(node.matrixWorld).invert();
    const parts = [];
    node.traverse((c) => {
      if (!c.isMesh) return;
      let g = c.geometry.clone();
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, c.matrixWorld));
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (!g.attributes.normal) g.computeVertexNormals();
      if (g.index) g = g.toNonIndexed();
      parts.push([g, c.material]);
    });
    if (!parts.length) return null;
    const mats = [...new Set(parts.map((p) => p[1]))];
    const geometry = THREE.BufferGeometryUtils.mergeGeometries(parts.map((p) => p[0]), mats.length > 1);
    if (mats.length > 1) geometry.groups.forEach((gr, i) => { gr.materialIndex = mats.indexOf(parts[i][1]); });
    geometry.computeBoundingBox();
    const material = mats.length > 1 ? mats.map(matte) : matte(mats[0]);
    GL.geo[name] = { geometry, material, box: geometry.boundingBox };
    return GL.geo[name];
  }
  // Una copia suelta de una pieza a escala s (para decorado y muebles)
  function piece(name, s = 1, o = {}) {
    const P = pieceGeo(name);
    if (!P) return null;
    let material = P.material;
    if (o.tint) material = [].concat(material).map((m) => { const c = m.clone(); c.color = new THREE.Color(o.tint); return c; });
    if (Array.isArray(material) && material.length === 1) material = material[0];
    const m = new THREE.Mesh(P.geometry, material);
    m.scale.setScalar(s);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }
  // Decorado de las mazmorras con piezas KayKit (lo que no tiene equivalente sigue siendo low poly propio)
  const BANNER_BY_THEME = { cripta: 'banner_patternB_white', cuevas: 'banner_patternA_brown', fortaleza: 'banner_patternA_red', nido: 'banner_patternA_green', volcan: 'banner_patternA_red' };
  function propGL(k, theme) {
    const g = new THREE.Group();
    let light = null, wall = false, block = true;
    const put = (name, s, x = 0, y = 0, z = 0, ry = 0) => { const m = piece(name, s); if (!m) return null; m.position.set(x, y, z); m.rotation.y = ry; g.add(m); return m; };
    switch (k) {
      case 'pillar': if (!put('pillar_decorated', 0.36)) return null; break;
      case 'sarcophagus': if (!put('h:coffin_decorated', 0.32)) return null; break;
      case 'coffin': if (!put('h:coffin', 0.28)) return null; break;
      case 'tomb': if (!put('h:gravestone', 0.42)) return null; break;
      case 'altar': if (!put('h:shrine_candles', 0.5)) return null; light = { color: '#ffc070', intensity: 1.0, dist: 3.5, y: 0.9 }; break;
      case 'barrel': if (!put('barrel_large', 0.32)) return null; break;
      case 'crate': if (!put('crates_stacked', 0.3)) return null; break;
      case 'table': if (!put('table_medium_decorated_A', 0.34)) return null; break;
      case 'bones': put('h:bone_A', 0.4, -0.08, 0.03, 0.05, 0.6); put('h:bone_B', 0.4, 0.1, 0.02, -0.06, 2); block = false; break;
      case 'skull': if (!put('h:skull', 0.18, 0, 0, 0, 0.4)) return null; block = false; break;
      case 'rubble': if (!put('rubble_half', 0.12, -0.2, 0, 0)) return null; block = false; break;
      case 'candles': if (!put('candle_triple', 0.42)) return null; light = { color: '#ffc070', intensity: 0.8, dist: 2.6, y: 0.4 }; block = false; break;
      case 'torch': wall = true; if (!put('torch_mounted', 0.42, 0, 0.82, 0.02)) return null; flame(g, 0, 1.1, 0.16, 1.4); light = { color: '#ff9a40', intensity: 1.8, dist: 5.5, y: 1.15, z: 0.35 }; block = false; break;
      case 'banner': wall = true; if (!put(BANNER_BY_THEME[theme] || 'banner_patternA_red', 0.3, 0, 0.12, -0.12)) return null; block = false; break;
      case 'shield': wall = true; if (!put('banner_shield_red', 0.3, 0, 0.12, -0.12)) return null; block = false; break;
      default: return null;
    }
    return { obj: g, light, wall, block };
  }

  // Muebles de la taberna con piezas KayKit (barra, chimenea, estanterías… siguen siendo propios)
  function furnitureGL(type, dir) {
    const rotY = { E: Math.PI / 2, S: 0, W: -Math.PI / 2, N: Math.PI }[dir || 'S'] || 0;
    const g = new THREE.Group();
    let light = null;
    const put = (name, s, x = 0, y = 0, z = 0, ry = 0) => { const m = piece(name, s); if (!m) return null; m.position.set(x, y, z); m.rotation.y = ry; g.add(m); return m; };
    switch (type) {
      case 'barrel': if (!put('barrel_large', 0.3, 0, 0, 0, rotY)) return null; break;
      case 'crate': if (!put('box_large', 0.42, 0, 0, 0, 0.2)) return null; break;
      case 'smallcrate': if (!put('box_large', 0.3, 0, 0, 0, -0.3)) return null; break;
      case 'table': if (!put('table_medium_decorated_A', 0.42)) return null; light = { color: '#ffb060', intensity: 0.5, dist: 2.5, y: 0.8 }; break;
      case 'maptable': if (!put('table_medium', 0.42)) return null; { const m = put('plate_food_A', 0.2, 0.1, 0.42, 0.05); void m; } break;
      case 'roundtable': if (!put('table_small_decorated_A', 0.6)) return null; light = { color: '#ffb060', intensity: 0.8, dist: 3, y: 0.85 }; break;
      case 'chair': if (!put('chair', 0.52, 0, 0, 0, rotY + Math.PI)) return null; break;
      case 'stool': if (!put('stool', 0.62)) return null; break;
      case 'chest': if (!put('chest', 0.34, 0, 0, 0, rotY)) return null; break;
      default: return null;
    }
    return { obj: g, light };
  }

  // Héroe con modelo de verdad: clase → modelo, colores de piel, pelo y ropa, casco, capa y armas
  function buildHeroGL(look) {
    const npc = look.npc || null;
    const cid = MAP.CLASSES[look.cls] ? look.cls : 'guerrero';
    const K = MAP.CLASSES[cid];
    const gear = look.gear || (npc ? {} : DEFAULT_GEAR[cid]);
    const set = gear.set && SET_COL[gear.set];
    const [name, npcCloth] = NPC_CHAR[npc] || [CLASS_CHAR[cid] || 'Knight', null];
    const species = look.species || 'human';
    const skin = species === 'dragonborn' ? '#9a3a2a' : MAP.SKINS[look.skin] || MAP.SKINS[0];
    const hair = npc === 'bruja' ? '#b8b8c0' : MAP.HAIRS[look.hair] || MAP.HAIRS[0];
    const cloth = set ? set[0] : npcCloth || look.color || K.color;
    const W = gear.w && RULES.WEAPONS[gear.w];
    const kind = !W ? 'unarmed' : W.kind === 'magic' ? 'magic' : W.kind === 'ranged' ? (gear.w === 'arco' ? 'ranged1' : 'ranged2') : gear.w === 'daga' ? 'dagger' : W.hands === 2 ? 'melee2' : 'melee1';
    // sexo y peinado: la cabeza sale de otro modelo (los comerciantes de la taberna conservan la suya)
    const hs = !npc && MAP.hairstyle ? MAP.hairstyle(look.sex, look.hs) : null;
    const helmet = !!gear.casco && !npc && !(hs && hs.id === 'capucha');
    const cape = !!set || gear.pechoR === 'unico' || gear.pechoR === 'raro' || npc === 'bruja';
    const root = buildGL(name, {
      skin, hair, cloth, helmet, cape, capeColor: set ? set[1] : RARITY[gear.pechoR] || cloth, set: gear.set,
      w: gear.w, wr: gear.wr, o: gear.o, or: gear.or, weaponKind: kind, mug: npc === 'tabernero',
      head: hs ? hs.head : null,
    });
    raceFeatures(root, species, { skin, hair, beard: look.beard || ((hs && hs.beard) || (species === 'dwarf' && hs && hs.head !== 'Barbarian' && look.sex !== 'f') ? hair : null), helmet, head: (hs && hs.head) || name });
    const SP = MAP.SPECIES[species] || {};
    root.scale.setScalar(SP.scale || 1);
    const body = root.userData.parts.model;
    if (SP.wide) { body.scale.x *= SP.wide; body.scale.z *= SP.wide; }
    if (SP.slim) { body.scale.x *= SP.slim; body.scale.z *= SP.slim; }
    return root;
  }

  // Rasgos de raza sobre la cabeza del modelo: orejas de elfo y de goblin, colmillos de orco y barba
  // (se colocan con la caja de la cabeza y se pegan al hueso de la cabeza para que se muevan con ella)
  const linHex = (hex) => '#' + new THREE.Color(hex).convertSRGBToLinear().getHexString();
  // Cabeza sin orejas redondas (para los goblins): los vértices de la oreja se meten en el cráneo
  const earless = new Map();
  function earlessHead(geo) {
    if (earless.has(geo)) return earless.get(geo);
    const g = geo.clone(), pos = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      if (Math.abs(x) > 0.455 && y > 1.36 && y < 1.68 && z > -0.08 && z < 0.06 && uv.getX(i) < 0.1) pos.setX(i, Math.sign(x) * 0.43);
    }
    pos.needsUpdate = true;
    earless.set(geo, g);
    return g;
  }
  const GOBLIN_FACE = { Knight: { eye: -0.145, nose: -0.21 }, def: { eye: -0.06, nose: -0.13 } };
  function raceFeatures(root, species, o) {
    const P = root.userData.parts;
    if (!P.head || !P.headMesh || (species === 'human' && !o.beard)) return;
    root.updateMatrixWorld(true);
    P.headMesh.geometry.computeBoundingBox();
    const box = P.headMesh.geometry.boundingBox.clone().applyMatrix4(P.headMesh.matrixWorld);
    const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    const g = new THREE.Group();
    const skin = mat(linHex(o.skin));
    if (species === 'elf') {
      for (const sx of [-1, 1]) {
        const e = mesh(cone(size.x * 0.055, size.x * 0.32, 5), skin, c.x + sx * size.x * 0.5, c.y - size.y * 0.02, c.z - size.z * 0.06, g);
        e.rotation.z = -sx * 0.95; e.rotation.x = -0.25;
      }
    }
    if (species === 'orc') {
      for (const sx of [-1, 1]) mesh(cone(size.x * 0.035, size.y * 0.13, 5), mat('#f0e6c8'), c.x + sx * size.x * 0.14, box.min.y + size.y * 0.24, box.max.z - size.z * 0.06, g);
    }
    if (species === 'goblin') {
      // fuera las orejas redondas del modelo: se aplastan contra el cráneo
      P.headMesh.geometry = earlessHead(P.headMesh.geometry);
      // orejas enormes en forma de hoja, con el interior más oscuro
      const inner = mat(linHex(o.skin), { emissive: '#3a0a0a', ei: 0.35 });
      for (const sx of [-1, 1]) {
        const e = new THREE.Group();
        e.position.set(c.x + sx * size.x * 0.42, c.y - size.y * 0.06, c.z - size.z * 0.08);
        e.rotation.set(-0.2, sx * 0.35, -sx * 1.12);
        g.add(e);
        const outer = mesh(cone(size.x * 0.16, size.x * 0.8, 6), skin, 0, size.x * 0.4, 0, e);
        outer.scale.z = 0.38;
        const inn = mesh(cone(size.x * 0.1, size.x * 0.6, 6), inner, 0, size.x * 0.34, size.z * 0.035, e);
        inn.scale.z = 0.22;
      }
      // pendientes de aro dorado (chicos y chicas): uno en el lóbulo y otro más arriba en la oreja
      const gold = mat(linHex('#ffcf4a'), { metal: 0.6, rough: 0.25, emissive: linHex('#5a3c00'), ei: 0.5 });
      for (const sx of [-1, 1]) {
        const lobe = mesh(torus(size.x * 0.09, size.x * 0.022), gold, c.x + sx * size.x * 0.47, c.y - size.y * 0.22, c.z - size.z * 0.05, g);
        lobe.rotation.y = Math.PI / 2;
        const up = mesh(torus(size.x * 0.055, size.x * 0.017), gold, c.x + sx * size.x * 0.66, c.y - size.y * 0.025, c.z - size.z * 0.09, g);
        up.rotation.set(0, Math.PI / 2, sx * 0.4);
      }
      // altura de los ojos pintados en la textura según el modelo de cabeza
      const F = GOBLIN_FACE[o.head] || GOBLIN_FACE.def;
      // nariz larga y muy picuda, un poco caída
      const nose = mesh(cone(size.x * 0.075, size.z * 0.5, 6), skin, c.x, c.y + size.y * F.nose, box.max.z + size.z * 0.15, g);
      nose.rotation.x = Math.PI / 2 + 0.32;
      // ojos amarillos con pupila rasgada
      const eyeM = mat(linHex('#ffd21a'), { emissive: linHex('#c89a00'), ei: 0.9, rough: 0.3 });
      const pupM = mat('#0a0806', { rough: 0.2 });
      for (const sx of [-1, 1]) {
        const ex = c.x + sx * size.x * 0.175, ey = c.y + size.y * F.eye, ez = box.max.z - size.z * 0.07;
        const eye = mesh(sph(size.x * 0.085, 12, 10), eyeM, ex, ey, ez, g);
        eye.scale.set(1.15, 0.85, 0.45);
        const pup = mesh(sph(size.x * 0.02, 8, 6), pupM, ex, ey, ez + size.x * 0.032, g);
        pup.scale.set(0.7, 2.6, 0.5);
      }
      // dientes puntiagudos asomando bajo el labio
      const tooth = mat('#f4eedc', { rough: 0.4 });
      for (const [tx, th] of [[-0.15, 0.1], [-0.06, 0.07], [0.06, 0.07], [0.15, 0.1]]) {
        const t = mesh(cone(size.x * 0.03, size.y * th, 4), tooth, c.x + tx * size.x, box.min.y + size.y * 0.27 - size.y * th / 2, box.max.z - size.z * 0.1, g);
        t.rotation.x = Math.PI;
      }
    }
    if (o.beard) {
      // barba poblada: una esfera achatada bajo la boca y una punta
      const bm = mat(linHex(o.beard));
      const b = mesh(sph(size.x * 0.27, 8, 6), bm, c.x, box.min.y + size.y * 0.16, box.max.z - size.z * 0.2, g);
      b.scale.set(1, 0.9, 0.55);
      const t = mesh(cone(size.x * 0.16, size.y * 0.22, 6), bm, c.x, box.min.y - size.y * 0.04, box.max.z - size.z * 0.17, g);
      t.rotation.x = Math.PI; t.scale.z = 0.6;
    }
    P.head.attach(g);
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
    zombie: (M) => ['Skeleton_Minion', { tint: M.tint || '#a8c890', cape: true, weaponKind: 'unarmed', walk: 'Walking_D_Skeletons' }],
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
      const m = buildAnimalGL(ENEMY_ANIMAL[s], { tint: M.tint, glowEyes: M.boss ? '#ff3a2a' : null });
      m.userData.kind = 'enemy';
      m.scale.multiplyScalar(M.scale || 1);
      return m;
    }
    if (!spec) return null;
    const [name, o] = spec;
    if (M.boss) { o.cape = true; o.helmet = true; }
    const m = buildGL(name, { ...o, kind: 'enemy' });
    m.scale.multiplyScalar(M.scale || 1);
    return m;
  }

  // ======================================================================
  //  Animales con modelos de verdad (Quaternius, CC0): lobo, zorro, perro, caballo y venado
  // ======================================================================
  const ANIMALS = { Wolf: 0.62, Fox: 0.46, ShibaInu: 0.5, Horse: 1.3, Stag: 1.5 }; // altura en casillas
  const PET_GL = { perro: 'ShibaInu', lobo: 'Wolf', zorro: 'Fox' };
  const MOUNT_GL = { caballo: ['Horse', 1.3], lobo: ['Wolf', 0.98], ciervo: ['Stag', 1.5] };
  const ENEMY_ANIMAL = { wolf: 'Wolf' };
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

  root.MODELS = { mat, mesh, box, cyl, sph, cone, shade, mix, buildHero, buildEnemy, buildPet, buildMount, animate, furniture, prop, weapon, flame, candle, mug, herb, rod, RARITY, GL, loadAssets, posePeek, pieceGeo, piece, glProp: (n) => (GL.props[n] ? GL.props[n].clone(true) : null) };
})(this);
