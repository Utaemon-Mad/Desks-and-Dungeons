/* global MAP */
// Pixel art: héroes, enemigos y casillas de mazmorra dibujados píxel a píxel (con contorno automático) y guardados en caché.
(function (root) {
  'use strict';

  const OUTLINE = '#1b120c';
  const cache = new Map();

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f; } else { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
    return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  }

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    return { c, g };
  }

  // Pequeño "pincel" de píxeles con desplazamiento opcional
  function painter(g, ox = 0, oy = 0) {
    const p = {
      ox, oy,
      px(x, y, col) { g.fillStyle = col; g.fillRect(x + p.ox, y + p.oy, 1, 1); },
      rect(x, y, w, h, col) { g.fillStyle = col; g.fillRect(x + p.ox, y + p.oy, w, h); },
      row(y, x0, x1, col) { g.fillStyle = col; g.fillRect(x0 + p.ox, y + p.oy, x1 - x0 + 1, 1); },
      col(x, y0, y1, col) { g.fillStyle = col; g.fillRect(x + p.ox, y0 + p.oy, 1, y1 - y0 + 1); },
      clear(x, y) { g.clearRect(x + p.ox, y + p.oy, 1, 1); },
    };
    return p;
  }

  // Añade un contorno de 1 píxel alrededor de todo lo dibujado
  function outline(c, color = OUTLINE) {
    const g = c.getContext('2d');
    const { width: w, height: h } = c;
    const img = g.getImageData(0, 0, w, h);
    const a = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) a[i] = img.data[i * 4 + 3] > 40 ? 1 : 0;
    const n = parseInt(color.slice(1), 16);
    const rgb = [n >> 16, (n >> 8) & 255, n & 255];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (a[y * w + x]) continue;
      if ((x > 0 && a[y * w + x - 1]) || (x < w - 1 && a[y * w + x + 1]) || (y > 0 && a[(y - 1) * w + x]) || (y < h - 1 && a[(y + 1) * w + x])) {
        const i = (y * w + x) * 4;
        img.data[i] = rgb[0]; img.data[i + 1] = rgb[1]; img.data[i + 2] = rgb[2]; img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  function cached(key, build) {
    let c = cache.get(key);
    if (!c) { c = build(); cache.set(key, c); }
    return c;
  }

  // ======================================================================
  //  Héroes (24×34, pies en y=31) con el equipo que llevan a la vista
  // ======================================================================
  // look: { cls, cls2, species, skin, hair, gear: { w, wr, o, or, casco, cascoR, pecho, pechoR, guantes, botas, set }, npc }
  // o: { back, frame (0 quieto, 1-2 andando), sit, emote, tick (0/1 para animar gestos), mug, wiping }
  const RARITY_COL = { raro: '#4aa0ff', epico: '#c060ff', legendario: '#ff9a2a', conjunto: '#3ee67a' };
  const SET_COL = {
    guerrero: ['#7a1a1a', '#e0b040'], mago: ['#23237a', '#c8d4ff'], explorador: ['#2a4a22', '#c8e07a'], picaro: ['#16161e', '#a070ff'],
    paladin: ['#d8d0b8', '#e8c050'], brujo: ['#2e0a30', '#6aff8a'], clerigo: ['#ece4cc', '#d8a030'],
  };
  const STEEL = '#a8aeb8', STEEL_D = '#6e747e', STEEL_L = '#d8dce4', LEATHER = '#6b4428', LEATHER_D = '#4a2e1a';

  function hero(look, o = {}) {
    const g = look.gear || {};
    const gk = [g.w, g.wr, g.o, g.or, g.casco, g.cascoR, g.pecho, g.pechoR, g.guantes, g.botas, g.set].join(',');
    const key = ['h', look.cls, look.species || '', look.sub || '', look.skin, look.hair, look.color || '', look.npc || '', gk, o.back ? 1 : 0, o.frame || 0, o.sit ? 1 : 0, o.emote || '', o.tick || 0, o.mug ? 1 : 0, o.wiping ? 1 : 0].join(':');
    return cached(key, () => drawHero(look, o));
  }

  // Equipo inicial de una clase (para personajes sin equipo: bandidos, vista previa…)
  const DEFAULT_GEAR = {
    guerrero: { w: 'espada', o: 'escudo', pecho: 'malla', casco: 'placas' }, mago: { w: 'baston', pecho: 'tela', casco: 'tela' },
    explorador: { w: 'arco', pecho: 'cuero', casco: 'cuero' }, picaro: { w: 'daga', pecho: 'cuero', casco: 'tela' },
    paladin: { w: 'maza', o: 'escudo', pecho: 'placas' }, brujo: { w: 'varita', o: 'orbe', pecho: 'tela', casco: 'tela' },
    clerigo: { w: 'maza', o: 'escudo', pecho: 'malla', casco: 'tela' },
  };

  function drawHero(look, o) {
    const { c, g } = canvas(24, 34);
    const npc = look.npc || null;
    const cid = MAP.CLASSES[look.cls] ? look.cls : (MAP.LEGACY_CLASS[look.cls] || 'guerrero');
    const k = MAP.CLASSES[cid];
    const gear = look.gear || (npc ? {} : DEFAULT_GEAR[cid]);
    const set = gear.set && SET_COL[gear.set];
    const species = look.species || 'human';
    let body = look.color || k.color, trim = k.trim;
    if (set) { body = set[0]; trim = set[1]; }
    const dragonColor = species === 'dragonborn' && look.sub ? MAP.DRAGON_COLORS[look.sub.replace('draconic-ancestor-', '')] : null;
    const skin = dragonColor || MAP.SKINS[look.skin] || MAP.SKINS[0], skinD = shade(skin, -0.18);
    const hair = MAP.HAIRS[look.hair] || MAP.HAIRS[0], hairD = shade(hair, -0.3), hairL = shade(hair, 0.25);
    const back = !!o.back;
    const p = painter(g, 0, 2);
    const up = o.sit ? 3 : 0;
    const em = o.emote;

    // Ropa según el equipo
    let chest = gear.pecho || null;
    if (npc === 'bruja' || npc === 'encapuchado') chest = 'npcrobe';
    if (npc === 'mercader') chest = 'kimono';
    if (npc === 'tabernero') chest = null;
    const robe = chest === 'tela' || chest === 'npcrobe' || chest === 'kimono';
    const accent = RARITY_COL[gear.pechoR] || trim;
    let cloth = body;
    if (npc === 'bruja') cloth = '#2a1a34';
    if (npc === 'encapuchado') cloth = '#2a2226';
    if (npc === 'mercader') cloth = '#28305a';
    const clothD = shade(cloth, -0.3), clothL = shade(cloth, 0.18);
    const bootCol = gear.botas === 'placas' || gear.botas === 'malla' ? STEEL_D : gear.botas === 'cuero' ? LEATHER_D : gear.botas === 'tela' ? '#8a6a4a' : '#24160e';
    const pants = gear.botas === 'placas' ? STEEL : '#3a2a20';
    const glove = gear.guantes === 'placas' || gear.guantes === 'malla' ? STEEL : gear.guantes === 'cuero' ? LEATHER : skin;

    // --- capa (conjuntos y legendarios): por detrás del cuerpo ---
    const cape = set || gear.pechoR === 'legendario';
    if (cape && !o.sit) {
      const capeCol = set ? shade(set[0], -0.15) : '#7a2a10';
      if (back) { p.rect(6, 18 + up, 12, 11, capeCol); p.col(17, 18 + up, 28 + up, shade(capeCol, -0.3)); p.row(29 + up, 7, 16, shade(capeCol, -0.3)); }
      else { p.rect(6, 18 + up, 1, 10, capeCol); p.rect(17, 18 + up, 1, 10, shade(capeCol, -0.3)); }
    }

    // --- piernas ---
    if (o.sit) {
      p.rect(9, 26, 8, 2, pants); p.rect(15, 27, 3, 3, bootCol);
      p.rect(9, 26, 3, 3, pants);
    } else if (!robe) {
      const f = o.frame || 0;
      const l = f === 1 ? -1 : 0, r = f === 2 ? -1 : 0;
      p.rect(9, 26 + l, 2, 4, pants); p.rect(9, 28 + l, 3, 2 - l, bootCol);
      p.rect(13, 26 + r, 2, 4, pants); p.rect(13, 28 + r, 3, 2 - r, bootCol);
      if (gear.botas === 'placas') { p.px(9, 26 + l, STEEL_L); p.px(13, 26 + r, STEEL_L); }
    } else {
      const f = o.frame || 0;
      p.rect(9, 29 - (f === 1 ? 1 : 0), 3, 1, bootCol); p.rect(13, 29 - (f === 2 ? 1 : 0), 3, 1, bootCol);
    }

    p.oy = 2 + up;
    // --- arma a la espalda o en la mano izquierda (arco y escudo por delante del cuerpo se dibujan después) ---
    if (back) drawWeapon(p, gear, true, o);

    // --- cuerpo ---
    if (robe && !o.sit) {
      p.rect(8, 18, 8, 6, cloth); p.rect(7, 24, 10, 5, cloth);
      p.col(16, 24, 28, clothD); p.col(15, 18, 23, clothD); p.col(8, 19, 23, clothL);
      if (chest === 'kimono') { p.row(22, 8, 15, '#a02a2a'); p.row(23, 8, 15, '#a02a2a'); if (!back) { p.px(11, 18, '#e8e0d0'); p.px(12, 19, '#e8e0d0'); p.px(13, 20, '#e8e0d0'); } }
      else { p.row(23, 8, 15, accent); p.row(28, 7, 16, accent); }
      if (!back && cid === 'clerigo' && chest === 'tela') { p.col(12, 19, 22, trim); p.row(20, 11, 13, trim); }
      if (!back && npc === 'encapuchado') { p.px(12, 25, '#c8a040'); p.px(11, 26, '#c8a040'); p.px(13, 26, '#c8a040'); }
    } else {
      // camisa base
      p.rect(8, 18, 8, 7, cloth); p.col(15, 18, 24, clothD); p.col(8, 19, 23, clothL);
      if (chest === 'cuero') {
        p.rect(8, 18, 8, 6, LEATHER); p.col(15, 18, 23, LEATHER_D); p.col(9, 19, 22, shade(LEATHER, 0.15));
        if (!back) { p.col(11, 18, 23, LEATHER_D); p.px(12, 20, accent); }
      } else if (chest === 'malla') {
        p.rect(8, 18, 8, 6, STEEL_D);
        for (let y = 18; y < 24; y++) for (let x = 8 + (y % 2); x < 16; x += 2) p.px(x, y, STEEL);
        p.col(15, 18, 23, '#555a64');
        if (!back) { p.rect(10, 19, 4, 4, cloth); p.px(11, 20, accent); p.px(12, 20, accent); }
      } else if (chest === 'placas') {
        p.rect(8, 18, 8, 6, STEEL); p.row(18, 8, 15, STEEL_L); p.col(15, 18, 23, STEEL_D); p.col(9, 19, 22, STEEL_L);
        p.rect(6, 17, 3, 3, STEEL); p.rect(15, 17, 3, 3, STEEL_D); p.px(6, 17, STEEL_L); // hombreras
        if (!back) { p.col(12, 19, 22, STEEL_D); p.px(11, 20, accent); p.px(12, 21, accent); }
        if (set && !back) { p.row(20, 9, 14, trim); }
      }
      p.row(24, 8, 15, chest === 'placas' ? STEEL_D : '#3a2414');
      if (!back) p.px(12, 24, '#c8a040');
      if (look.apron) { p.rect(9, 19, 6, 8, '#efe6d0'); p.col(14, 19, 26, '#cfc4aa'); }
    }

    // --- brazos ---
    const sleeve = chest === 'placas' ? STEEL_D : chest === 'malla' ? STEEL_D : chest === 'cuero' ? LEATHER_D : clothD;
    const sleeveF = chest === 'placas' ? STEEL : chest === 'malla' ? STEEL : chest === 'cuero' ? LEATHER : cloth;
    p.rect(7, 18, 1, 5, sleeve); p.px(7, 23, glove === skin ? skinD : shade(glove, -0.2));
    let handX = 16, handY = 23;
    if (em === 'wave' || em === 'fight') {
      const t = o.tick ? 1 : 0;
      p.rect(16, 14 + t, 1, 4, sleeveF); p.px(16, 18, sleeveF); p.px(16 + t, 13 + t, glove);
      handX = 16 + t; handY = 13 + t;
    } else if (em === 'cheers' || o.mug) {
      p.rect(16, 18, 1, 3, sleeveF); p.px(16, 21, glove);
      p.rect(17, 18, 3, 4, '#b8b8c0'); p.rect(17, 19, 3, 2, '#e8a820'); p.row(17, 17, 19, '#fff6dc'); p.px(20, 19, '#8a8a92');
      handX = -1;
    } else if (o.wiping) {
      const t = o.tick ? 1 : 0;
      p.rect(16, 18, 1, 4, sleeveF); p.rect(16 + t, 22, 3, 2, '#d8d8e0');
      handX = -1;
    } else {
      const sw = (o.frame === 1 ? -1 : o.frame === 2 ? 1 : 0);
      p.rect(16, 18 + sw, 1, 5, sleeveF); p.px(16, 23 + sw, glove);
      handY = 23 + sw;
    }

    // --- cabeza ---
    p.rect(7, 9, 10, 9, skin);
    p.clear(7, 9); p.clear(16, 9); p.clear(7, 17); p.clear(16, 17);
    p.col(16, 10, 16, skinD); p.row(17, 8, 15, skinD);
    if (look.beard && !back) { p.rect(9, 15, 7, 3, look.beard); p.row(18, 10, 14, look.beard); p.px(12, 16, skin); }
    if (species === 'elf') { p.px(6, 13, skin); p.px(5, 12, skin); p.px(4, 11, skin); p.px(17, 13, skin); p.px(18, 12, skin); p.px(19, 11, skin); }
    if (species === 'gnome') { p.px(6, 13, skin); p.px(5, 12, skin); p.px(17, 13, skin); p.px(18, 12, skin); }
    if (species === 'dragonborn' && !back) { p.rect(16, 13, 2, 3, skin); p.px(17, 13, skinD); p.row(16, 15, 17, skinD); }

    const helm = npc ? null : gear.casco || null;
    const hidesHair = helm === 'placas' || helm === 'malla' || helm === 'tela' || npc === 'encapuchado' || npc === 'mercader';
    // --- pelo ---
    if (!look.bald && species !== 'dragonborn' && !hidesHair) {
      const hc = npc === 'bruja' ? '#b8b8c0' : hair, hcD = npc === 'bruja' ? '#8a8a92' : hairD, hcL = npc === 'bruja' ? '#d8d8e0' : hairL;
      if (back) {
        p.rect(7, 8, 10, 10, hc); p.row(8, 8, 15, hcL); p.col(16, 9, 17, hcD);
        if (robe || npc === 'bruja') p.rect(7, 17, 10, 4, hc);
      } else {
        p.row(7, 9, 14, hc); p.row(8, 8, 15, hc); p.row(9, 7, 16, hc); p.row(10, 7, 16, hc);
        p.row(11, 7, 10, hc); p.row(11, 13, 16, hc); p.px(14, 12, hc);
        p.col(7, 12, 14, hc); p.col(16, 11, 13, hcD);
        p.row(8, 9, 12, hcL);
        if (robe || npc === 'bruja') { p.rect(6, 11, 2, 9, hc); p.col(6, 12, 19, hcD); p.rect(16, 11, 2, 8, hcD); }
      }
    }

    // --- cara ---
    if (!back && npc !== 'encapuchado' && helm !== 'placas') {
      const closed = em === 'laugh' || em === 'sleep';
      if (closed) { p.row(14, 10, 11, '#1b1410'); p.row(14, 13, 14, '#1b1410'); }
      else { p.col(11, 13, 14, '#1b1410'); p.col(14, 13, 14, '#1b1410'); p.px(11, 13, '#ffffff'); p.px(14, 13, '#ffffff'); }
      p.px(10, 15, '#e88a8a'); p.px(15, 15, '#e88a8a');
      if (em === 'laugh' || em === 'cheers') p.row(16, 12, 13, '#6a1a1a'); else p.px(13, 16, skinD);
      if (npc === 'bruja') { p.px(12, 15, skinD); p.px(12, 16, skinD); p.px(13, 16, '#3a5a2a'); }
      if (npc === 'mercader') { p.row(16, 10, 11, '#1b1410'); p.row(16, 14, 15, '#1b1410'); p.px(9, 17, '#1b1410'); p.px(16, 17, '#1b1410'); }
    }

    // --- rasgos de especie ---
    if (!helm && !npc) {
      if (species === 'dwarf' && !back && !look.beard) { p.rect(9, 15, 7, 3, hair); p.row(18, 10, 14, hair); p.px(12, 19, hair); p.px(12, 16, skin); p.px(13, 16, skin); }
      if (species === 'tiefling') { const hn = '#3a2a2a'; p.px(9, 7, hn); p.px(8, 6, hn); p.px(8, 5, hn); p.px(9, 4, hn); p.px(14, 7, hn); p.px(15, 6, hn); p.px(15, 5, hn); p.px(14, 4, hn); }
    }
    if (species === 'orc' && !back && helm !== 'placas') { p.px(11, 16, '#fff6dc'); p.px(11, 15, '#fff6dc'); p.px(14, 16, '#fff6dc'); p.px(14, 15, '#fff6dc'); }
    if (species === 'dwarf' && !back && helm && helm !== 'placas') { p.rect(9, 15, 7, 3, hair); p.row(18, 10, 14, hair); p.px(12, 16, skin); p.px(13, 16, skin); }
    if (species === 'dragonborn' && !helm) {
      p.rect(7, 8, 10, 3, skin); p.row(8, 9, 14, shade(skin, 0.15));
      p.px(8, 7, skinD); p.px(10, 6, skinD); p.px(13, 6, skinD); p.px(15, 7, skinD);
      if (back) { p.rect(7, 11, 10, 6, skin); p.col(11, 9, 16, skinD); }
    }

    // --- cascos ---
    const hr = RARITY_COL[gear.cascoR];
    const hoodCol = set ? set[0] : cloth;
    if (helm === 'tela') {
      p.row(6, 9, 14, hoodCol); p.row(7, 8, 15, hoodCol); p.rect(7, 8, 10, 3, hoodCol);
      p.rect(6, 10, 2, 9, hoodCol); p.rect(16, 10, 2, 9, shade(hoodCol, -0.3));
      p.row(7, 9, 12, shade(hoodCol, 0.2));
      if (back) p.rect(7, 11, 10, 7, hoodCol); else p.row(10, 8, 15, shade(hoodCol, -0.35));
      if (hr) p.row(11, 7, 16, hr);
      if (cid === 'mago' || set === SET_COL.mago) { /* capucha alta de mago */ p.row(5, 10, 13, hoodCol); p.row(4, 11, 12, hoodCol); }
    } else if (helm === 'cuero') {
      p.row(7, 9, 14, LEATHER); p.row(8, 8, 15, LEATHER); p.row(9, 7, 16, LEATHER); p.row(10, 7, 16, LEATHER_D);
      p.row(8, 9, 12, shade(LEATHER, 0.2));
      if (hr) p.px(15, 8, hr);
      if (cid === 'explorador') { p.px(16, 7, '#c8e07a'); p.px(17, 6, '#c8e07a'); p.px(18, 5, '#a8c05a'); }
    } else if (helm === 'malla') {
      p.row(6, 9, 14, STEEL_D); p.row(7, 8, 15, STEEL_D); p.rect(7, 8, 10, 3, STEEL_D);
      for (let y = 7; y < 11; y++) for (let x = 8 + (y % 2); x < 16; x += 2) p.px(x, y, STEEL);
      p.rect(6, 10, 2, 8, STEEL_D); p.rect(16, 10, 2, 8, '#555a64');
      if (back) p.rect(7, 11, 10, 7, STEEL_D);
      if (hr) p.row(10, 8, 15, hr);
    } else if (helm === 'placas') {
      p.row(5, 9, 14, STEEL); p.row(6, 8, 15, STEEL); p.rect(7, 7, 10, 10, STEEL);
      p.row(6, 9, 12, STEEL_L); p.col(16, 7, 16, STEEL_D); p.row(17, 8, 15, STEEL_D);
      if (!back) { p.row(13, 8, 15, '#1b1410'); p.col(12, 10, 16, STEEL_D); p.px(10, 13, '#3a3a40'); }
      const plume = hr || (set ? trim : null);
      if (plume) { p.row(3, 11, 13, plume); p.row(4, 10, 14, plume); p.px(12, 2, plume); p.col(13, 1, 2, plume); }
      if (cid === 'paladin' && !back) { p.px(12, 8, '#e8c050'); p.px(11, 9, '#e8c050'); p.px(13, 9, '#e8c050'); }
    }

    // --- sombreros de los comerciantes ---
    if (npc === 'bruja') {
      const hat = '#1a1220', band = '#6a2a8a';
      p.row(10, 4, 19, hat); p.row(9, 6, 17, hat); p.row(8, 8, 15, hat); p.row(8, 8, 15, band);
      p.rect(9, 5, 6, 3, hat); p.rect(10, 3, 4, 2, hat); p.rect(11, 1, 3, 2, hat); p.px(14, 0, hat); p.px(15, 0, hat);
      p.px(10, 8, '#ffd23f');
    } else if (npc === 'mercader') {
      const straw = '#c8a860', strawD = '#9a7a40';
      p.row(9, 3, 20, strawD); p.row(8, 5, 18, straw); p.row(7, 7, 16, straw); p.row(6, 9, 14, straw); p.row(5, 11, 12, strawD);
      p.row(8, 6, 17, strawD);
    } else if (npc === 'encapuchado') {
      const hood = '#2a2226', hoodD = '#141012';
      p.row(5, 9, 14, hood); p.row(6, 8, 15, hood); p.rect(6, 7, 12, 4, hood); p.rect(5, 10, 3, 9, hood); p.rect(16, 10, 3, 9, hoodD);
      if (back) p.rect(7, 10, 10, 8, hood);
      else { p.rect(8, 10, 8, 7, '#08060a'); p.px(10, 13, '#7affe0'); p.px(14, 13, '#7affe0'); p.px(10, 12, '#3a8a7a'); p.px(14, 12, '#3a8a7a'); }
    }

    // --- arma y mano izquierda ---
    if (!back && handX >= 0) drawWeapon(p, gear, false, o, handX, handY);
    if (!back) drawOffhand(p, gear, o);
    if (back && gear.o === 'escudo' && !o.sit) {
      const rim = RARITY_COL[gear.or] || '#8a6a3a', face = gear.set === 'paladin' || gear.set === 'clerigo' ? '#e8e0c8' : '#7a2a2a';
      p.rect(8, 17, 8, 9, face); p.row(16, 9, 14, rim); p.row(26, 9, 14, rim); p.col(7, 17, 25, rim); p.col(16, 17, 25, rim); p.col(12, 17, 25, '#c8a040'); p.row(20, 8, 15, '#c8a040');
    }

    return outline(c);
  }

  function drawWeapon(p, gear, back, o, hx = 16, hy = 23) {
    const w = gear.w;
    if (!w) return;
    const glow = RARITY_COL[gear.wr];
    const steel = gear.wr === 'legendario' ? '#ffe6b0' : STEEL_L;
    if (back) {
      // a la espalda: en diagonal por detrás
      if (w === 'arco') { p.col(5, 14, 27, '#6b4228'); p.px(6, 13, '#6b4228'); p.px(6, 28, '#6b4228'); p.col(7, 14, 27, '#d8d0c0'); }
      else if (w === 'baston' || w === 'lanza') { p.col(17, 10, 29, '#6b4228'); p.px(17, 9, glow || (w === 'lanza' ? STEEL_L : '#7ad0ff')); }
      else if (w === 'espadon' || w === 'martillo') { p.col(17, 8, 26, w === 'espadon' ? steel : '#6b4228'); if (w === 'martillo') p.rect(15, 8, 5, 3, STEEL_D); }
      return;
    }
    const x = hx + 1, y = hy;
    switch (w) {
      case 'espada': p.col(x, y - 11, y - 1, steel); p.col(x + 1, y - 10, y - 2, STEEL_D); p.row(y, x - 1, x + 2, '#c8a040'); p.px(x, y + 1, '#4a2e1a'); if (glow) p.px(x, y - 12, glow); break;
      case 'daga': p.col(x, y - 5, y - 1, steel); p.row(y, x - 1, x + 1, '#8a6a3a'); if (glow) p.px(x, y - 6, glow); break;
      case 'hacha': p.col(x, y - 10, y + 2, '#6b4228'); p.rect(x + 1, y - 10, 3, 4, STEEL); p.col(x + 4, y - 10, y - 7, steel); if (glow) p.px(x + 2, y - 9, glow); break;
      case 'maza': p.col(x, y - 8, y + 2, '#6b4228'); p.rect(x - 1, y - 11, 3, 3, STEEL); p.px(x, y - 12, STEEL_D); p.px(x - 2, y - 10, STEEL_D); p.px(x + 2, y - 10, STEEL_D); if (glow) p.px(x, y - 10, glow); break;
      case 'espadon': p.col(x, y - 16, y - 1, steel); p.col(x + 1, y - 15, y - 2, STEEL_D); p.row(y, x - 2, x + 2, '#c8a040'); p.col(x, y + 1, y + 3, '#4a2e1a'); if (glow) { p.px(x, y - 17, glow); p.px(x, y - 8, glow); } break;
      case 'martillo': p.col(x, y - 13, y + 3, '#6b4228'); p.rect(x - 2, y - 16, 6, 4, STEEL); p.row(y - 16, x - 2, x + 3, steel); if (glow) p.px(x, y - 14, glow); break;
      case 'lanza': p.col(x, y - 17, y + 5, '#6b4228'); p.col(x, y - 20, y - 18, steel); p.px(x - 1, y - 18, STEEL); p.px(x + 1, y - 18, STEEL); if (glow) p.px(x, y - 16, glow); break;
      case 'arco': { const bx = x + 1; p.col(bx + 1, y - 9, y + 3, '#6b4228'); p.px(bx, y - 10, '#6b4228'); p.px(bx, y + 4, '#6b4228'); p.col(bx - 1, y - 9, y + 3, '#e8e0d0'); if (glow) p.px(bx + 1, y - 3, glow); break; }
      case 'ballesta': p.row(y - 1, x - 1, x + 5, '#6b4228'); p.col(x + 4, y - 4, y + 2, '#4a2e1a'); p.row(y - 2, x, x + 3, STEEL); if (glow) p.px(x + 5, y - 1, glow); break;
      case 'baston': p.col(x, y - 14, y + 5, '#6b4228'); p.px(x - 1, y - 15, '#6b4228'); p.px(x + 1, y - 15, '#6b4228'); p.px(x, y - 15, glow || '#7ad0ff'); p.px(x, y - 16, shade(glow || '#7ad0ff', 0.4)); break;
      case 'varita': p.col(x, y - 6, y, '#3a2414'); p.px(x, y - 7, glow || '#c080ff'); p.px(x, y - 8, shade(glow || '#c080ff', 0.5)); break;
    }
    void o;
  }

  function drawOffhand(p, gear) {
    if (gear.o === 'escudo') {
      const rim = RARITY_COL[gear.or] || '#8a6a3a';
      const face = gear.set === 'paladin' ? '#e8e0c8' : gear.set === 'clerigo' ? '#f0e8d0' : '#7a2a2a';
      p.rect(3, 18, 6, 8, face); p.row(17, 4, 7, rim); p.row(26, 4, 7, rim); p.col(2, 19, 24, rim); p.col(9, 19, 24, rim); p.row(27, 5, 6, rim);
      p.col(5, 19, 25, shade(face, 0.25)); p.px(6, 21, '#c8a040'); p.px(5, 22, '#c8a040'); p.px(6, 22, '#c8a040'); p.px(7, 22, '#c8a040'); p.px(6, 23, '#c8a040');
    } else if (gear.o === 'orbe') {
      const col = RARITY_COL[gear.or] || (gear.set === 'brujo' ? '#6aff8a' : '#a060ff');
      p.rect(3, 19, 3, 3, col); p.px(4, 18, col); p.px(4, 22, col); p.px(2, 20, col); p.px(6, 20, col); p.px(3, 19, shade(col, 0.6));
    }
  }

  // ======================================================================
  //  Enemigos (24×34, pies abajo)
  // ======================================================================
  // Tamaño del lienzo por tipo de enemigo: [ancho, alto, desplazamiento x, desplazamiento y]
  const BIG = { warchief: [30, 38, 3, 4], necromancer: [30, 38, 3, 4], lich: [30, 38, 3, 4], ogre: [34, 42, 5, 6], troll: [34, 44, 5, 8], bear: [34, 36, 5, 0], owlbear: [34, 40, 5, 4], dragon: [44, 44, 10, 8], bugbear: [28, 38, 2, 4] };

  function enemy(type, o = {}) {
    const key = ['e', type, o.frame || 0, o.hit ? 1 : 0, o.tint || '', o.weapon || ''].join(':');
    return cached(key, () => {
      const [w, hgt, ox, oy] = BIG[type] || [24, 34, 0, 2];
      const { c, g } = canvas(w, hgt);
      const p = painter(g, ox, oy);
      (ENEMY_DRAW[type] || ENEMY_DRAW.goblin)(p, o.frame || 0);
      // arqueros y lanzadores llevan su arma en la mano
      if (o.weapon === 'bow') { p.col(19, 13, 26, '#6b4228'); p.px(18, 12, '#6b4228'); p.px(18, 27, '#6b4228'); p.col(17, 13, 26, '#d8d0c0'); }
      if (o.weapon === 'spear') { p.col(19, 6, 28, '#6b4228'); p.col(19, 3, 5, '#c8ccd4'); p.px(18, 5, '#a8aeb8'); p.px(20, 5, '#a8aeb8'); }
      outline(c);
      if (o.tint) { g.globalCompositeOperation = 'source-atop'; g.globalAlpha = 0.5; g.fillStyle = o.tint; g.fillRect(0, 0, c.width, c.height); g.globalAlpha = 1; }
      if (o.hit) { g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(255,240,230,.45)'; g.fillRect(0, 0, c.width, c.height); }
      return c;
    });
  }

  function legs(p, f, x1, x2, y, h, col, bootCol) {
    const l = f === 1 ? -1 : 0, r = f === 2 ? -1 : 0;
    p.rect(x1, y + l, 2, h, col); p.rect(x1, y + h - 1 + l, 3, 1, bootCol || shade(col, -0.3));
    p.rect(x2, y + r, 2, h, col); p.rect(x2, y + h - 1 + r, 3, 1, bootCol || shade(col, -0.3));
  }

  const ENEMY_DRAW = {
    hobgoblin(p, f) {
      const s = '#d0703a', sd = '#a0502a', arm = '#5a5e6a';
      legs(p, f, 9, 13, 26, 4, '#3a2a1a');
      p.rect(8, 18, 8, 8, arm); p.col(15, 18, 25, '#3a3e4a'); p.row(18, 8, 15, '#7a808a'); p.row(24, 8, 15, '#2a1a0e');
      p.rect(7, 19, 1, 5, s); p.rect(16, 19, 1, 4, s);
      p.col(18, 10, 25, '#c8ccd4'); p.col(19, 11, 24, '#9aa0aa'); p.row(25, 17, 20, '#6b4228');
      p.rect(7, 8, 10, 10, s); p.clear(7, 8); p.clear(16, 8); p.col(16, 9, 16, sd); p.row(17, 8, 15, sd);
      p.px(5, 11, s); p.px(6, 12, s); p.px(18, 11, s); p.px(17, 12, s);
      p.row(7, 8, 15, '#2a1a10'); p.row(6, 9, 14, '#2a1a10');
      p.px(10, 12, '#ffd23f'); p.px(14, 12, '#ffd23f'); p.row(15, 10, 14, '#4a1a0a'); p.px(10, 15, '#fff6dc'); p.px(14, 15, '#fff6dc');
    },
    bugbear(p, f) {
      const fur = '#7a5530', fd = '#5a3a1e';
      legs(p, f, 8, 14, 27, 5, fd);
      p.rect(6, 15, 12, 12, fur); p.col(17, 15, 26, fd); p.rect(8, 18, 8, 6, '#a07a4a');
      p.rect(4, 16, 2, 9, fur); p.rect(18, 16, 2, 8, fur); p.px(4, 25, fd); p.px(19, 24, fd);
      p.col(21, 8, 26, '#6b4228'); p.rect(20, 6, 3, 4, '#8a8e98');
      p.rect(6, 4, 12, 11, fur); p.clear(6, 4); p.clear(17, 4); p.col(17, 5, 14, fd);
      p.px(5, 4, fur); p.px(4, 3, fur); p.px(18, 4, fur); p.px(19, 3, fur);
      p.rect(9, 9, 6, 4, '#c8a070'); p.px(10, 8, '#ffd23f'); p.px(14, 8, '#ffd23f'); p.px(12, 10, '#2a1a10'); p.row(12, 10, 14, '#2a1a10');
    },
    ogre(p, f) {
      const s = '#b8a060', sd = '#8a7a40', hide = '#6b4a2a';
      legs(p, f, 9, 16, 30, 5, '#4a3a22');
      p.rect(6, 15, 16, 16, s); p.col(21, 15, 30, sd); p.rect(7, 24, 14, 6, hide); p.row(24, 7, 20, '#4a2e1a');
      p.rect(3, 16, 3, 11, s); p.rect(22, 16, 3, 10, s); p.rect(2, 26, 4, 3, sd);
      p.col(25, 6, 28, '#6b4228'); p.rect(24, 3, 4, 7, '#5a3a1a'); p.px(24, 4, '#8a6a3a');
      p.rect(8, 3, 12, 12, s); p.clear(8, 3); p.clear(19, 3); p.col(19, 4, 14, sd); p.row(14, 9, 18, sd);
      p.row(3, 10, 17, '#3a2a1a'); p.px(11, 8, '#1b120c'); p.px(16, 8, '#1b120c'); p.rect(12, 9, 3, 2, sd);
      p.row(12, 11, 16, '#3a1a10'); p.px(11, 11, '#fff6dc'); p.px(16, 11, '#fff6dc');
    },
    troll(p, f) {
      const s = '#4a7a4a', sd = '#2f5a30';
      legs(p, f, 10, 16, 32, 4, sd);
      p.rect(8, 14, 12, 18, s); p.col(19, 14, 31, sd); p.rect(10, 20, 8, 6, '#6a5a3a');
      p.rect(4, 14, 3, 16, s); p.rect(21, 14, 3, 16, s); p.row(30, 3, 6, '#e8e4d0'); p.row(30, 21, 24, '#e8e4d0');
      p.rect(9, 3, 10, 11, s); p.clear(9, 3); p.clear(18, 3); p.col(18, 4, 13, sd);
      p.row(2, 10, 17, '#2a3a2a'); p.px(11, 1, '#2a3a2a'); p.px(15, 1, '#2a3a2a');
      p.px(15, 7, '#ff3a2a'); p.px(11, 7, '#ff3a2a'); p.rect(13, 8, 2, 3, sd);
      p.row(12, 11, 16, '#1b120c'); p.px(12, 12, '#fff6dc'); p.px(15, 12, '#fff6dc');
    },
    ghoul(p, f) {
      const s = '#a8a89a', sd = '#7a7a6e';
      legs(p, f, 9, 13, 27, 3, sd);
      p.rect(8, 18, 8, 9, s); p.col(15, 18, 26, sd); p.rect(9, 20, 6, 5, '#4a4a42'); p.row(21, 9, 14, s);
      p.rect(15, 18, 5, 2, s); p.px(20, 20, '#e8e4d0'); p.px(21, 19, '#e8e4d0'); p.rect(5, 19, 3, 2, s); p.px(4, 21, '#e8e4d0');
      p.rect(7, 10, 10, 8, s); p.clear(7, 10); p.clear(16, 10); p.col(16, 11, 17, sd);
      p.px(10, 13, '#ffef7a'); p.px(14, 13, '#ffef7a'); p.row(16, 10, 14, '#3a1a1a'); p.px(10, 17, '#fff6dc'); p.px(12, 17, '#fff6dc'); p.px(14, 17, '#fff6dc');
      p.px(9, 9, '#3a3a32'); p.px(12, 9, '#3a3a32');
    },
    specter(p, f) {
      const c = 'rgba(170,190,230,.85)', cd = 'rgba(110,130,180,.85)';
      const sway = f === 1 ? 1 : 0;
      p.rect(7, 17, 10, 10, c); p.rect(8 + sway, 27, 2, 3, c); p.rect(12 - sway, 27, 2, 4, c); p.rect(15, 27, 2, 2, c);
      p.col(16, 17, 26, cd); p.rect(5, 18, 2, 6, c); p.rect(17, 18, 2, 6, c); p.px(4, 24, cd); p.px(19, 24, cd);
      p.rect(7, 8, 10, 10, c); p.row(7, 9, 14, c); p.rect(9, 11, 6, 6, 'rgba(20,20,40,.9)');
      p.px(10, 13, '#c8f0ff'); p.px(13, 13, '#c8f0ff');
    },
    wight(p, f) {
      const bone = '#c8c0a8', arm = '#3a3e48';
      legs(p, f, 9, 13, 26, 4, '#2a2e38');
      p.rect(8, 17, 8, 9, arm); p.col(15, 17, 25, '#22262e'); p.row(17, 8, 15, '#5a5e6a'); p.row(22, 8, 15, '#6a2a2a');
      p.rect(7, 18, 1, 5, bone); p.rect(16, 18, 1, 4, bone);
      p.col(18, 9, 24, '#6a8aa0'); p.col(19, 10, 23, '#3a5a70'); p.row(24, 17, 20, '#4a3a2a');
      p.rect(8, 8, 8, 9, bone); p.clear(8, 8); p.clear(15, 8); p.rect(7, 6, 10, 3, arm); p.row(5, 9, 14, arm);
      p.rect(9, 11, 2, 2, '#0c0c18'); p.rect(13, 11, 2, 2, '#0c0c18'); p.px(10, 12, '#7ad0ff'); p.px(13, 12, '#7ad0ff');
      p.row(15, 9, 14, '#8a8270');
    },
    mummy(p, f) {
      const w = '#d8ccaa', wd = '#a89a78';
      legs(p, f, 9, 13, 26, 4, w, wd);
      p.rect(8, 17, 8, 9, w); p.col(15, 17, 25, wd);
      for (let y = 18; y < 26; y += 2) p.row(y, 8, 15, wd);
      p.rect(15, 18, 5, 2, w); p.rect(5, 18, 3, 2, w); p.px(20, 19, wd); p.px(4, 19, wd);
      p.rect(7, 8, 10, 9, w); p.clear(7, 8); p.clear(16, 8); p.row(10, 7, 16, wd); p.row(14, 7, 16, wd);
      p.row(12, 9, 14, '#1b120c'); p.px(10, 12, '#ffef7a'); p.px(13, 12, '#ffef7a');
    },
    lich(p, f) {
      ENEMY_DRAW.necromancer(p, f);
      p.row(6, 8, 15, '#e0b830'); p.px(8, 5, '#e0b830'); p.px(11, 4, '#e0b830'); p.px(12, 4, '#e0b830'); p.px(15, 5, '#e0b830'); p.px(11, 5, '#ff4a4a');
      p.rect(9, 11, 6, 6, '#d8d0c0'); p.px(10, 13, '#1b120c'); p.px(13, 13, '#1b120c'); p.px(10, 13, '#7ad0ff'); p.px(13, 13, '#7ad0ff'); p.row(16, 10, 13, '#1b120c');
    },
    wolf(p, f) {
      const c = '#7a7a82', cd = '#55555c', l = '#a8a8b0';
      const a = f === 1 ? -1 : 0, b = f === 2 ? -1 : 0;
      p.rect(5, 22, 14, 6, c); p.row(22, 6, 17, l); p.row(27, 6, 17, cd);
      p.rect(6, 28 + a, 2, 3, cd); p.rect(9, 28 + b, 2, 3, c); p.rect(15, 28 + a, 2, 3, cd); p.rect(17, 28 + b, 2, 3, c);
      p.rect(2, 21, 3, 2, c); p.px(1, 20, c); p.px(1, 19, cd);
      p.rect(17, 17, 6, 6, c); p.rect(21, 20, 3, 3, l); p.px(23, 20, '#1b120c');
      p.px(18, 15, c); p.px(18, 16, c); p.px(21, 15, c); p.px(21, 16, c);
      p.px(20, 19, '#ffd23f'); p.row(23, 21, 23, '#3a1a1a');
    },
    spider(p, f) {
      const c = '#2a2a32', cl = '#4a4a5a';
      const a = f === 1 ? 1 : 0;
      for (const [x, d] of [[4, -1], [6, -1], [16, 1], [18, 1]]) { p.px(x, 22 - a, c); p.px(x + d, 24, c); p.px(x + d * 2, 27 + a, c); p.px(x + d * 2, 28 + a, c); }
      p.rect(7, 18, 10, 8, c); p.row(18, 8, 15, cl); p.rect(9, 20, 6, 3, '#7a2a2a');
      p.rect(9, 25, 6, 4, c); p.px(10, 27, '#ff3a2a'); p.px(13, 27, '#ff3a2a'); p.px(11, 26, '#ff3a2a'); p.px(12, 26, '#ff3a2a');
      p.px(10, 29, '#e8e4d0'); p.px(13, 29, '#e8e4d0');
    },
    bear(p, f) {
      const c = '#6b4226', cd = '#4a2e1a', l = '#8a5a36';
      const a = f === 1 ? -1 : 0, b = f === 2 ? -1 : 0;
      p.rect(4, 18, 20, 10, c); p.row(18, 5, 22, l); p.col(23, 19, 27, cd);
      p.rect(5, 28 + a, 3, 4, cd); p.rect(9, 28 + b, 3, 4, c); p.rect(18, 28 + a, 3, 4, cd); p.rect(21, 28 + b, 3, 4, c);
      p.rect(21, 14, 8, 8, c); p.rect(26, 18, 3, 3, '#a07a4a'); p.px(28, 18, '#1b120c');
      p.px(22, 13, c); p.px(26, 13, c); p.px(24, 16, '#1b120c'); p.row(21, 26, 28, '#3a1a1a');
    },
    owlbear(p, f) {
      const c = '#7a5a3a', cd = '#5a3e26', feather = '#a08a6a';
      legs(p, f, 9, 17, 30, 4, cd);
      p.rect(6, 14, 16, 16, c); p.col(21, 14, 29, cd); p.rect(9, 17, 10, 9, feather);
      for (let y = 18; y < 26; y += 2) p.row(y, 10, 17, '#8a7050');
      p.rect(2, 16, 4, 10, c); p.rect(22, 16, 4, 10, c); p.row(26, 1, 5, '#e8e4d0'); p.row(26, 22, 26, '#e8e4d0');
      p.rect(7, 3, 14, 11, feather); p.row(3, 8, 19, '#c8b08a');
      p.px(7, 2, feather); p.px(6, 1, feather); p.px(20, 2, feather); p.px(21, 1, feather);
      p.rect(9, 6, 3, 3, '#f4ecd0'); p.rect(16, 6, 3, 3, '#f4ecd0'); p.px(10, 7, '#1b120c'); p.px(17, 7, '#1b120c');
      p.rect(13, 9, 2, 3, '#e0b040'); p.px(13, 12, '#8a6a2a');
    },
    dragon(p, f) {
      const c = '#b83a2a', cd = '#8a2418', belly = '#e0a060', wing = '#7a1a10';
      const flap = f === 1 ? -2 : 0;
      p.rect(0, 6 + flap, 10, 10, wing); p.rect(24, 6 + flap, 10, 10, wing);
      for (let i = 0; i < 4; i++) { p.col(2 + i * 2, 8 + flap, 15 + flap, cd); p.col(25 + i * 2, 8 + flap, 15 + flap, cd); }
      p.rect(8, 14, 18, 14, c); p.rect(12, 17, 10, 10, belly); for (let y = 18; y < 27; y += 2) p.row(y, 12, 21, '#c88a50');
      p.rect(9, 28, 4, 4, cd); p.rect(21, 28, 4, 4, cd); p.row(31, 8, 13, '#e8e4d0'); p.row(31, 20, 25, '#e8e4d0');
      p.rect(0, 24, 9, 3, c); p.px(0, 23, cd);
      p.rect(12, 2, 10, 11, c); p.rect(19, 7, 6, 5, c); p.row(11, 19, 24, cd);
      p.px(13, 1, '#e8e4d0'); p.px(12, 0, '#e8e4d0'); p.px(20, 1, '#e8e4d0'); p.px(21, 0, '#e8e4d0');
      p.px(18, 5, '#ffd23f'); p.px(15, 5, '#ffd23f'); p.px(23, 8, '#1b120c');
      p.row(12, 20, 24, '#ff8a2a');
    },
    goblin(p, f) {
      const s = '#6aa84f', sd = '#4a7a34', rag = '#7a5a2a';
      legs(p, f, 9, 13, 26, 4, '#4a3a22');
      p.rect(9, 20, 6, 6, rag); p.col(14, 20, 25, shade(rag, -0.3)); p.row(25, 9, 14, '#5a3a1a');
      p.rect(8, 21, 1, 4, s); p.rect(15, 21, 1, 3, s); p.px(15, 24, sd);
      p.col(17, 17, 24, '#c8ccd4'); p.px(16, 24, '#6b4228'); p.px(17, 25, '#6b4228');
      p.rect(7, 11, 10, 9, s); p.clear(7, 11); p.clear(16, 11);
      p.col(16, 12, 18, sd); p.row(19, 8, 15, sd);
      p.px(6, 13, s); p.px(5, 12, s); p.px(4, 11, s); p.px(3, 10, sd); p.px(6, 14, sd);
      p.px(17, 13, s); p.px(18, 12, s); p.px(19, 11, s); p.px(20, 10, sd); p.px(17, 14, sd);
      p.row(14, 10, 11, '#ffd23f'); p.row(14, 13, 14, '#ffd23f'); p.px(11, 14, '#c0201a'); p.px(14, 14, '#c0201a');
      p.px(12, 16, sd); p.row(17, 10, 14, '#3a1a10'); p.px(11, 17, '#fff6dc'); p.px(14, 17, '#fff6dc');
      p.row(11, 9, 14, sd);
    },
    shaman(p, f) {
      ENEMY_DRAW.goblin(p, f);
      p.rect(9, 20, 6, 6, '#6a3a8a'); p.col(14, 20, 25, '#4a2a62'); p.row(22, 9, 14, '#d0b060');
      p.row(10, 8, 15, '#efe6cf'); p.px(9, 9, '#e04040'); p.px(12, 8, '#3a8ae0'); p.px(14, 9, '#e04040'); p.px(12, 7, '#3a8ae0');
      p.col(18, 12, 28, '#6b4228'); p.rect(17, 9, 3, 3, '#efe6cf'); p.px(17, 10, '#1b120c'); p.px(19, 10, '#1b120c');
    },
    orc(p, f) {
      const s = '#7d9a4a', sd = '#5a7434', leather = '#5a3a24', metal = '#8a8e98';
      legs(p, f, 8, 13, 26, 4, '#3a2a1a', '#20140c');
      p.rect(6, 17, 12, 9, leather); p.col(17, 17, 25, shade(leather, -0.3)); p.row(24, 6, 17, '#2a1a0e'); p.px(12, 24, '#c0a040');
      p.rect(4, 16, 4, 3, metal); p.rect(16, 16, 4, 3, metal); p.row(16, 4, 7, '#b0b4bc'); p.row(16, 16, 19, '#b0b4bc');
      p.rect(4, 19, 2, 5, s); p.rect(18, 19, 2, 5, s); p.px(4, 24, sd); p.px(19, 24, sd);
      p.col(21, 8, 27, '#6b4228'); p.rect(19, 7, 4, 6, '#a8aeb8'); p.col(19, 7, 12, '#d4d8e0'); p.px(22, 7, '#6e747e');
      p.rect(7, 7, 10, 9, s); p.clear(7, 7); p.clear(16, 7);
      p.col(16, 8, 15, sd); p.row(15, 8, 15, sd); p.row(10, 8, 15, sd);
      p.px(10, 11, '#ff3a2a'); p.px(14, 11, '#ff3a2a'); p.px(10, 12, '#7a0000'); p.px(14, 12, '#7a0000');
      p.row(14, 10, 14, '#2a1a10'); p.px(10, 13, '#fff6dc'); p.px(14, 13, '#fff6dc'); p.px(10, 12, '#fff6dc'); p.px(14, 12, '#fff6dc');
      p.row(6, 9, 13, '#1b120c');
    },
    warchief(p, f) {
      p.rect(5, 16, 14, 13, '#8a1a1a'); p.col(18, 16, 28, '#5a0a0a');  // capa
      ENEMY_DRAW.orc(p, f);
      const m = '#5a5e68', ml = '#9aa0aa', horn = '#efe6cf';
      p.rect(7, 4, 10, 4, m); p.row(3, 9, 14, m); p.row(4, 9, 12, ml); p.row(8, 6, 17, '#3a3e48');
      p.px(5, 5, horn); p.px(4, 4, horn); p.px(4, 3, horn); p.px(5, 2, horn); p.px(6, 6, horn);
      p.px(18, 5, horn); p.px(19, 4, horn); p.px(19, 3, horn); p.px(18, 2, horn); p.px(17, 6, horn);
      p.row(20, 6, 17, '#c0a040');
    },
    skeleton(p, f) {
      const b = '#e8e4d0', bd = '#b8b29a';
      legs(p, f, 10, 13, 26, 4, b, bd);
      p.col(11, 17, 24, b); p.col(12, 17, 24, bd);
      p.row(18, 9, 14, b); p.row(20, 9, 14, b); p.row(22, 10, 13, b); p.row(24, 9, 14, bd); p.row(25, 9, 14, b);
      p.col(8, 18, 24, b); p.col(15, 18, 23, b); p.px(15, 24, bd);
      p.col(17, 14, 24, '#a87a4a'); p.col(16, 15, 22, '#c89a6a'); p.row(24, 15, 18, '#5a3a1a');
      p.rect(8, 8, 8, 8, b); p.clear(8, 8); p.clear(15, 8); p.col(15, 9, 14, bd);
      p.rect(9, 11, 2, 2, '#1b120c'); p.rect(13, 11, 2, 2, '#1b120c'); p.px(12, 13, '#1b120c');
      p.row(15, 9, 14, bd); p.px(10, 15, '#1b120c'); p.px(12, 15, '#1b120c'); p.px(14, 15, '#1b120c');
      p.px(10, 11, '#ff6a3a');
    },
    zombie(p, f) {
      const s = '#8aa070', sd = '#647a50', shirt = '#4a5a8a';
      legs(p, f, 9, 13, 26, 4, '#4a3a3a');
      p.rect(8, 18, 8, 7, shirt); p.col(15, 18, 24, shade(shirt, -0.3)); p.px(9, 24, s); p.px(13, 23, s); p.px(10, 21, '#7a2a2a');
      p.rect(15, 18, 6, 2, shirt); p.rect(20, 18, 2, 2, s); p.px(21, 20, sd);
      p.rect(6, 19, 2, 2, shirt); p.px(5, 19, s);
      p.rect(7, 9, 10, 9, s); p.clear(7, 9); p.clear(16, 9);
      p.col(16, 10, 16, sd); p.row(17, 8, 15, sd);
      p.row(8, 8, 13, '#2a2a20'); p.px(15, 8, '#2a2a20'); p.px(8, 9, '#2a2a20'); p.px(11, 9, '#2a2a20');
      p.px(11, 13, '#f4f0d0'); p.px(14, 13, '#f4f0d0'); p.px(11, 12, sd); p.px(14, 12, sd);
      p.row(15, 11, 14, '#3a1010'); p.px(12, 16, '#3a1010'); p.px(9, 14, '#7a2a2a');
    },
    necromancer(p, f) {
      const r = '#2a1a3a', rd = '#1a0f26', rl = '#4a3466';
      p.rect(7, 18, 10, 6, r); p.rect(6, 24, 12, 6, r); p.col(17, 24, 29, rd); p.col(16, 18, 23, rd);
      p.row(22, 7, 16, '#7a5aa0'); p.px(9, 29 - (f === 1 ? 1 : 0), '#120a1a'); p.px(14, 29 - (f === 2 ? 1 : 0), '#120a1a');
      p.rect(5, 18, 2, 5, rl); p.px(5, 23, '#c8c0b0');
      p.col(20, 6, 30, '#3a2a1a'); p.rect(19, 2, 3, 3, '#e8e4d0'); p.px(19, 3, '#1b120c'); p.px(21, 3, '#1b120c'); p.row(5, 19, 21, '#7cff6a');
      p.rect(17, 18, 3, 2, rl); p.px(19, 20, '#c8c0b0');
      p.row(6, 9, 14, r); p.row(7, 8, 15, r); p.rect(7, 8, 10, 10, r); p.rect(6, 11, 1, 8, rd); p.rect(17, 11, 1, 8, rd);
      p.row(7, 9, 12, rl);
      p.rect(9, 11, 6, 6, '#0c0612');
      p.px(10, 13, '#7cff6a'); p.px(13, 13, '#7cff6a'); p.px(10, 14, '#3a8a2a'); p.px(13, 14, '#3a8a2a');
    },
  };

  // ======================================================================
  //  Casillas de mazmorra (16×16)
  // ======================================================================
  function rand(seed) { const s = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }

  function floorTile(x, y) {
    const v = Math.floor(rand(x * 13 + y * 7) * 4);
    return cached('f' + v, () => {
      const { c, g } = canvas(16, 16);
      const p = painter(g);
      const base = ['#4a4652', '#46424e', '#4e4a56', '#48444f'][v];
      p.rect(0, 0, 16, 16, base);
      // losas
      p.row(7, 0, 15, '#36323d'); p.row(15, 0, 15, '#36323d');
      p.col(v % 2 ? 5 : 9, 0, 6, '#36323d'); p.col(v % 2 ? 11 : 3, 8, 14, '#36323d');
      p.row(0, 0, 15, shade(base, 0.08)); p.row(8, 0, 15, shade(base, 0.08));
      if (v === 2) { p.px(12, 3, '#36323d'); p.px(13, 4, '#36323d'); p.px(13, 5, '#36323d'); }
      if (v === 3) { p.px(3, 11, '#5a5664'); p.px(4, 11, '#5a5664'); }
      return c;
    });
  }

  function wallTile(face) {
    return cached('w' + (face ? 1 : 0), () => {
      const { c, g } = canvas(16, 16);
      const p = painter(g);
      p.rect(0, 0, 16, 16, '#2a2630');
      p.row(0, 0, 15, '#3a3542'); p.col(0, 0, 15, '#332f3b');
      p.px(4, 4, '#3a3542'); p.px(11, 9, '#3a3542'); p.px(7, 12, '#221f28');
      if (face) {
        const top = 8;
        p.rect(0, top, 16, 8, '#5a5462');
        for (let r = 0; r < 2; r++) {
          const yy = top + r * 4;
          p.row(yy, 0, 15, '#3a3442');
          for (let x = (r ? 4 : 0); x < 16; x += 8) p.col(x, yy, yy + 3, '#3a3442');
          p.row(yy + 1, 0, 15, '#6a6472');
        }
        p.row(15, 0, 15, '#2a2430');
      }
      return c;
    });
  }

  function overlayTile(kind, frame = 0) {
    return cached('o' + kind + frame, () => {
      const { c, g } = canvas(16, 16);
      const p = painter(g);
      switch (kind) {
        case 'door':
          p.rect(2, 1, 12, 14, '#6b4228'); p.col(5, 1, 14, '#4a2e1a'); p.col(8, 1, 14, '#4a2e1a'); p.col(11, 1, 14, '#4a2e1a');
          p.row(4, 2, 13, '#3a3a42'); p.row(11, 2, 13, '#3a3a42'); p.px(11, 8, '#e0b040');
          return outline(c);
        case 'spikes': {
          const h = frame ? 2 : 0;
          for (const [sx, sy] of [[3, 4], [10, 4], [3, 11], [10, 11]]) {
            p.rect(sx, sy, 3, 2, '#2a2630');
            p.col(sx + 1, sy - 3 + h, sy, '#c8ccd4'); p.px(sx + 1, sy - 3 + h, '#ffffff');
          }
          return c;
        }
        case 'water':
          p.rect(0, 0, 16, 16, '#24427a');
          p.row(3 + frame, 2, 6, '#3a66b0'); p.row(9 - frame, 8, 13, '#3a66b0'); p.row(13, 3 + frame, 6 + frame, '#3a66b0');
          p.px(12, 2 + frame, '#7aa8e8');
          return c;
        case 'start':
          p.rect(3, 3, 10, 10, 'rgba(120,200,255,.25)'); p.row(3, 5, 10, '#7ad0ff'); p.row(12, 5, 10, '#7ad0ff'); p.col(3, 5, 10, '#7ad0ff'); p.col(12, 5, 10, '#7ad0ff');
          p.px(7, 7, '#c8f0ff'); p.px(8, 8, '#c8f0ff');
          return c;
        case 'exit':
          p.rect(1, 1, 14, 14, '#141018');
          for (let i = 0; i < 5; i++) { p.row(2 + i * 3, 2 + i, 13 - i, '#6a6472'); p.row(3 + i * 3, 2 + i, 13 - i, '#3a3442'); }
          return c;
        case 'chest':
        case 'chestopen': {
          const open = kind === 'chestopen';
          p.rect(2, 7, 12, 7, '#8a5a2a'); p.row(13, 2, 13, '#5a3a1a'); p.col(13, 7, 13, '#6b4228');
          p.row(9, 2, 13, '#e0b040'); p.col(7, 7, 13, '#e0b040'); p.col(8, 7, 13, '#c09020');
          if (open) { p.rect(2, 3, 12, 4, '#6b4228'); p.rect(3, 6, 10, 2, '#2a1a0e'); p.px(5, 6, '#ffd23f'); p.px(9, 6, '#ffd23f'); }
          else { p.rect(2, 4, 12, 3, '#9c6a3a'); p.row(4, 2, 13, '#b07a44'); p.rect(7, 8, 2, 2, '#ffd23f'); }
          return outline(c);
        }
        case 'potion':
          p.rect(6, 3, 4, 2, '#c8a070'); p.rect(7, 5, 2, 2, '#c8e0f0');
          p.rect(5, 7, 6, 6, '#d8303a'); p.row(7, 5, 10, '#c8e0f0'); p.px(6, 8, '#ff9aa0'); p.col(10, 8, 12, '#a01a24');
          return outline(c);
        case 'coins':
          p.rect(4, 9, 4, 2, '#ffd23f'); p.rect(8, 10, 4, 2, '#e0b040'); p.rect(6, 7, 4, 2, '#ffe680');
          p.px(5, 9, '#fff6c0'); p.px(9, 10, '#fff6c0');
          return outline(c);
      }
      return c;
    });
  }

  // ======================================================================
  //  Casillas del mundo abierto (16×16)
  // ======================================================================
  function worldTile(ch, x, y, frame = 0) {
    const v = Math.floor(rand(x * 7.3 + y * 13.1) * 4);
    const key = 'W' + ch + v + (ch === 'w' || ch === 'v' || ch === 'F' ? frame : '');
    return cached(key, () => {
      const { c, g } = canvas(16, 16);
      const p = painter(g);
      const grass = () => {
        const base = ['#2f4a2a', '#2c4628', '#324e2c', '#2e4829'][v];
        p.rect(0, 0, 16, 16, base);
        for (let i = 0; i < 6; i++) p.px(Math.floor(rand(v * 50 + i) * 16), Math.floor(rand(v * 70 + i) * 16), shade(base, i % 2 ? 0.15 : -0.2));
      };
      switch (ch) {
        case ',': grass(); break;
        case ';': grass(); for (let i = 0; i < 5; i++) { const gx = 2 + i * 3, gy = 4 + (i * 5 + v) % 9; p.col(gx, gy, gy + 3, '#4a6a3a'); p.px(gx + 1, gy, '#5a7a44'); } break;
        case 'T': grass(); p.rect(7, 10, 2, 5, '#4a2e1a'); p.rect(3, 2, 10, 9, '#1f3a1e'); p.rect(4, 1, 8, 1, '#1f3a1e'); p.row(3, 4, 10, '#2f5a2c'); p.px(5, 5, '#2f5a2c'); p.px(10, 7, '#173016'); return outline(c, '#0c140b');
        case 'P': grass(); p.rect(7, 12, 2, 3, '#3a2414'); for (let i = 0; i < 4; i++) p.row(3 + i * 2, 7 - i, 8 + i, '#1a3226'); p.row(11, 3, 12, '#1a3226'); p.px(7, 1, '#1a3226'); p.px(8, 2, '#24443a'); return outline(c, '#0a120e');
        case 'w': p.rect(0, 0, 16, 16, '#14284a'); p.row(4 + frame, 2, 6, '#1e3a66'); p.row(10 - frame, 8, 13, '#1e3a66'); p.px(12, 3 + frame, '#3a5a8a'); break;
        case 'v': p.rect(0, 0, 16, 16, '#24426a'); p.row(5 + frame, 3, 8, '#3a5a8a'); p.row(11 - frame, 7, 12, '#3a5a8a'); p.px(3, 12, '#6a6a5a'); p.px(12, 4, '#6a6a5a'); break;
        case 's': p.rect(0, 0, 16, 16, '#7a6a4a'); p.px(3, 4, '#8a7a5a'); p.px(11, 9, '#6a5a3a'); p.px(6, 13, '#8a7a5a'); break;
        case 'h': grass(); p.rect(2, 8, 12, 5, '#3a5232'); p.row(7, 4, 11, '#3a5232'); p.row(7, 5, 9, '#4a6a3a'); p.rect(9, 3, 6, 4, '#36502f'); p.row(3, 10, 13, '#46663a'); break;
        case 'M': p.rect(0, 0, 16, 16, '#2a2a30'); for (let i = 0; i < 8; i++) p.row(15 - i * 2, i, 15 - i, '#4a4a52'); p.row(1, 7, 8, '#d8dce4'); p.row(2, 6, 9, '#b8bcc4'); p.px(5, 9, '#3a3a40'); p.px(10, 11, '#5a5a62'); break;
        case '=': p.rect(0, 0, 16, 16, '#4a3c2a'); p.px(3, 3, '#5a4a36'); p.px(11, 6, '#3a2e20'); p.px(6, 11, '#6a5a44'); p.px(13, 13, '#5a4a36'); break;
        case 'b': p.rect(0, 0, 16, 16, '#14284a'); p.rect(0, 2, 16, 12, '#6b4a2a'); for (let i = 0; i < 16; i += 4) p.col(i, 2, 13, '#4a2e1a'); p.row(2, 0, 15, '#8a6a3a'); p.row(13, 0, 15, '#3a2414'); break;
        case 'g': p.rect(0, 0, 16, 16, '#2a2622'); p.px(4, 5, '#3a342e'); p.px(11, 10, '#1e1a16'); p.px(8, 13, '#3a342e'); break;
        case 't': p.rect(0, 0, 16, 16, '#2a2622'); p.rect(5, 4, 6, 9, '#7a7a82'); p.row(3, 6, 9, '#7a7a82'); p.row(4, 5, 10, '#9a9aa2'); p.col(8, 6, 9, '#4a4a52'); p.row(7, 7, 9, '#4a4a52'); p.row(13, 4, 11, '#1a1612'); break;
        case 'R': p.rect(0, 0, 16, 16, '#3a3a3e'); for (let r = 0; r < 4; r++) { p.row(r * 4, 0, 15, '#2a2a2e'); for (let i = (r % 2) * 4; i < 16; i += 8) p.col(i, r * 4, r * 4 + 3, '#2a2a2e'); } p.row(1, 0, 15, '#5a5a5e'); break;
        case 'F': p.rect(0, 0, 16, 16, '#3a2e22'); p.row(13, 3, 12, '#4a2e1a'); p.row(12, 4, 11, '#5a3a1a'); p.rect(6, 6 - frame, 4, 6 + frame, '#e8601c'); p.rect(7, 8 - frame, 2, 4, '#ffd25a'); p.px(8, 4 - frame, '#ffb03a'); break;
        case 'C': p.rect(0, 0, 16, 16, '#36502f'); p.rect(1, 3, 14, 13, '#4a4a52'); p.row(2, 3, 12, '#4a4a52'); p.rect(4, 7, 8, 9, '#050308'); p.row(6, 5, 10, '#050308'); p.row(5, 6, 9, '#050308'); p.row(3, 2, 13, '#6a6a72'); break;
        case 'H': p.rect(0, 0, 16, 16, '#4a3c2a'); p.rect(2, 7, 12, 8, '#6b4a2a'); for (let i = 0; i < 6; i++) p.row(1 + i, 7 - i, 8 + i, '#7a2a1a'); p.row(7, 1, 14, '#5a1a10'); p.rect(6, 10, 4, 5, '#3a2414'); p.rect(3, 9, 2, 2, '#ffcf6a'); p.rect(11, 9, 2, 2, '#ffcf6a'); return outline(c);
        case 'k': grass(); p.rect(3, 8, 10, 7, '#5a4a3a'); for (let i = 0; i < 5; i++) p.row(3 + i, 7 - i, 8 + i, '#4a3a4a'); p.rect(7, 11, 2, 4, '#2a1a10'); p.px(4, 10, '#c8a050'); return outline(c, '#120c08');
        case 'D': p.rect(0, 0, 16, 16, '#2a1a14'); p.px(3, 4, '#e8e4d0'); p.px(4, 4, '#e8e4d0'); p.px(11, 10, '#e8e4d0'); p.row(12, 5, 8, '#c8c0b0'); p.px(9, 6, '#5a2a1a'); p.px(6, 9, '#4a1a10'); break;
        default: grass();
      }
      return c;
    });
  }

  root.SPRITES = { hero, enemy, floorTile, wallTile, overlayTile, worldTile, shade, outline };
})(this);
