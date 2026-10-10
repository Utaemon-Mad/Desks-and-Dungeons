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
  const torus = (r, t) => geo(`t${r},${t}`, () => new THREE.TorusGeometry(r, t, 10, 28));
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
    const skinHex = MAP.SKINS[look.skin] || MAP.SKINS[0];
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
    if (species === 'elf' || species === 'goblin') for (const sx of [-1, 1]) { const big = species === 'goblin'; const e = mesh(cone(big ? 0.06 : 0.03, big ? 0.28 : 0.12, 4), skin, sx * (big ? 0.2 : 0.15), 0.1, 0, head); e.rotation.z = -sx * (big ? 1.35 : 1.2); if (big) mesh(torus(0.022, 0.006), mat('#ffcf4a', { metal: 0.6, rough: 0.25 }), sx * 0.15, 0.06, 0, head).rotation.y = Math.PI / 2; }
    if (species === 'orc') for (const sx of [-1, 1]) mesh(cone(0.012, 0.04, 4), mat('#fff6dc'), sx * 0.04, -0.01, 0.13, head);
    // pelo
    const hidesHair = helm === 'placas' || helm === 'malla' || helm === 'tela' || npc === 'encapuchado' || npc === 'mercader';
    if (!look.bald && !hidesHair) {
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
    // progreso de la carga (para la barra de la pantalla de inicio)
    GL.progress = { done: 0, total: 0 };
    const tick = (x) => { GL.progress.done++; try { window.dispatchEvent(new CustomEvent('dd-load', { detail: GL.progress })); } catch { /* nada */ } return x; };
    const get = (u) => { GL.progress.total++; return new Promise((res, rej) => L.load(base + u, (g) => res(tick(g)), undefined, rej)); };
    const names = Object.keys(CHAR_DEF);
    // animales (Quaternius): si alguno falla, se queda el modelo de siempre
    const animalBase = base.replace(/kaykit\/$/, 'quaternius/');
    const getAnimal = (n) => { GL.progress.total++; return new Promise((res) => L.load(animalBase + n + '.glb', (g) => res(tick(g)), undefined, () => res(tick(null)))); };
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
    const attach = (hand, propName, base, rarity, tier, sk) => {
      let w = null;
      // armas hechas a mano por tipo y nivel (weapons3d.js); si no está, las de KayKit o las de siempre
      if (base && globalThis.WEAPON3D) {
        w = globalThis.WEAPON3D.build(base, tier || 0, rarity, { sk, set: o.set, setColor: o.capeColor });
        if (w) { w.scale.setScalar(1 / s); w.rotation.set(0, 0, base === 'arco' ? Math.PI / 2 : 0); if (hand) hand.add(w); return w; }
      }
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
    if (o.w) P.weapon = attach(o.w === 'arco' ? hL : hR, o.wProp || WEAPON_PROP[o.w], o.w, o.wr, o.wt, o.wS);
    if (o.o) P.off = attach(hL, o.oProp || (o.o === 'escudo' ? (name === 'Knight' ? 'shield_badge' : name === 'Barbarian' ? 'shield_round' : 'shield_square') : o.o === 'orbe' ? 'spellbook_open' : null), o.o, o.or, o.ot, o.oS);
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

  // Héroe con modelo de verdad: clase → modelo, colores de piel, pelo y ropa, casco, capa y armas
  function buildHeroGL(look) {
    const npc = look.npc || null;
    const cid = MAP.CLASSES[look.cls] ? look.cls : 'guerrero';
    const K = MAP.CLASSES[cid];
    const gear = look.gear || (npc ? {} : DEFAULT_GEAR[cid]);
    const set = gear.set && SET_COL[gear.set];
    const [name, npcCloth] = NPC_CHAR[npc] || [CLASS_CHAR[cid] || 'Knight', null];
    const species = look.species || 'human';
    const skin = MAP.SKINS[look.skin] || MAP.SKINS[0];
    const hair = npc === 'bruja' ? '#b8b8c0' : MAP.HAIRS[look.hair] || MAP.HAIRS[0];
    // el peto manda en el color de la ropa (y algunos llevan capa); los conjuntos, en su color
    const A3 = !npc && globalThis.ARMOR3D;
    const chestSt = A3 ? A3.chestStyle(gear) : null;
    const cloth = set ? set[0] : npcCloth || (chestSt && chestSt.cloth) || look.color || K.color;
    const W = gear.w && RULES.WEAPONS[gear.w];
    const kind = !W ? 'unarmed' : W.kind === 'magic' ? 'magic' : W.kind === 'ranged' ? (gear.w === 'arco' ? 'ranged1' : 'ranged2') : gear.w === 'daga' ? 'dagger' : W.hands === 2 ? 'melee2' : 'melee1';
    // sexo y peinado: la cabeza sale de otro modelo (los comerciantes de la taberna conservan la suya)
    const hs = !npc && MAP.hairstyle ? MAP.hairstyle(look.sex, look.hs) : null;
    const helmet = !!gear.casco && !npc && !(hs && hs.id === 'capucha');
    const cape = !!set || gear.pechoR === 'unico' || gear.pechoR === 'raro' || npc === 'bruja' || !!(chestSt && chestSt.cape);
    const goblin = species === 'goblin' && !npc && globalThis.GOBLIN3D;
    const root = buildGL(name, {
      skin, hair, cloth, helmet: helmet && !A3, cape, capeColor: set ? set[1] : RARITY[gear.pechoR] || cloth, set: gear.set,
      w: gear.w, wr: gear.wr, wt: gear.wt, wS: gear.wS, o: gear.o, or: gear.or, ot: gear.ot, oS: gear.oS, weaponKind: kind, mug: npc === 'tabernero',
      head: hs && !goblin ? hs.head : null,
    });
    // los goblins llevan su propia cabeza hecha a mano (goblin.js), con todas sus opciones
    const gob = goblin && MAP.cleanGoblin ? MAP.cleanGoblin(look.gob, look.sex) : null;
    if (goblin) globalThis.GOBLIN3D.build(root.userData.parts, { skin, hair, gob, sex: look.sex, helmet: A3 ? A3.coversHair(gear) : !!gear.casco, seed: JSON.stringify(gob) + skin });
    else raceFeatures(root, species, { skin, hair, beard: look.beard || ((hs && hs.beard) || (species === 'dwarf' && hs && hs.head !== 'Barbarian' && look.sex !== 'f') ? hair : null), helmet, head: (hs && hs.head) || name });
    const SP = MAP.SPECIES[species] || {};
    root.scale.setScalar(SP.scale || 1);
    const body = root.userData.parts.model;
    if (SP.wide) { body.scale.x *= SP.wide; body.scale.z *= SP.wide; }
    if (SP.slim) { body.scale.x *= SP.slim; body.scale.z *= SP.slim; }
    // armaduras que se ven: petos, hombreras, yelmos, guanteletes, grebas… (armor3d.js)
    if (A3) A3.build(root, gear, { setTrim: set ? set[1] : null });
    if (gob) { const b = globalThis.GOBLIN3D.BUILD[gob.build] || 1; body.scale.x *= b; body.scale.z *= b; }
    // brillo del equipo bueno: el arma destella de vez en cuando con el color de su calidad
    const wcol = gear.wleg ? RULES.LEGENDARY_COLOR : ['raro', 'unico', 'conjunto'].includes(gear.wr) ? RARITY[gear.wr] : null;
    const Pw = root.userData.parts.weapon;
    if (wcol && Pw) {
      const meshes = [];
      Pw.traverse((c) => { if (c.isMesh && c.material && c.material.emissive) { c.material = c.material.clone(); c.material.emissive = new THREE.Color(wcol); meshes.push(c); } });
      const base = gear.wleg || gear.wr === 'unico' || gear.wr === 'conjunto' ? 0.45 : 0.22;
      if (meshes.length) meshes[0].onBeforeRender = () => {
        const t = performance.now() / 1000;
        const glint = Math.pow(Math.max(0, Math.sin(t * 1.6)), 14);
        for (const c of meshes) c.material.emissiveIntensity = base + glint * 1.8;
      };
    }
    // aura de temporada (premio de los mejores) o de quien lleva un legendario: anillo a los pies y chispas que suben
    const auraCol = (look.aura && globalThis.PROG && PROG.AURAS[look.aura]) || (gear.leg && RULES.LEGENDARY_COLOR);
    if (auraCol) {
      const A = new THREE.Group(); A.name = 'aura';
      const ringM = new THREE.MeshBasicMaterial({ color: auraCol, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.4, 32), ringM); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; A.add(ring);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.32, 32), new THREE.MeshBasicMaterial({ color: auraCol, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending })); disc.rotation.x = -Math.PI / 2; disc.position.y = 0.015; A.add(disc);
      const motes = [];
      for (let i = 0; i < 8; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 4), ringM); m.userData.a = (i / 8) * Math.PI * 2; m.userData.o = i * 0.13; A.add(m); motes.push(m); }
      ring.onBeforeRender = () => {
        const t = performance.now() / 1000;
        ring.scale.setScalar(1 + 0.06 * Math.sin(t * 3));
        for (const m of motes) { const k = (t * 0.5 + m.userData.o) % 1; m.position.set(Math.cos(m.userData.a + t) * 0.3, k * 1.1, Math.sin(m.userData.a + t) * 0.3); m.scale.setScalar(1 - k); }
      };
      root.add(A);
    }
    return root;
  }

  // Rasgos de raza sobre la cabeza del modelo: orejas de elfo y de goblin, colmillos de orco y barba
  // (se colocan con la caja de la cabeza y se pegan al hueso de la cabeza para que se muevan con ella)
  const linHex = (hex) => '#' + new THREE.Color(hex).convertSRGBToLinear().getHexString();
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

  // ======================================================================
  //  Animales con modelos de verdad (Quaternius, CC0): lobo, zorro, perro, caballo y venado
  // ======================================================================
  const ANIMALS = { Wolf: 0.62, Fox: 0.46, ShibaInu: 0.5, Horse: 1.3, Stag: 1.5 }; // altura en casillas

  // models-creatures.js y models-props.js añaden enemigos, mascotas, monturas, muebles y decorado;
  // lo que comparten está en MODELS._
  root.MODELS = { mat, mesh, box, cyl, sph, buildHero, animate, weapon, RARITY, GL, loadAssets, posePeek, pieceGeo, piece, glProp: (n) => (GL.props[n] ? GL.props[n].clone(true) : null), cone,
    _: { geo, torus, psph, halfSph, pivot, shade, mix, lin, linHex, WOOD, STEEL, LEATHER_D, offhand, buildGL, CLASS_CHAR, ANIMALS } };
})(this);
