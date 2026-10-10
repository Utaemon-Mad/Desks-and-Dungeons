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
  // look: { cls, species, skin, hair, gear: { w, wr, o, or, casco, cascoR, pecho, pechoR, guantes, botas, set }, npc }
  // o: { back, frame (0 quieto, 1-2 andando), sit, emote, tick (0/1 para animar gestos), mug, wiping }
  const RARITY_COL = { magico: '#7a8cff', raro: '#ffe24a', unico: '#c8a46a', conjunto: '#3ee67a' };
  const SET_COL = {
    guerrero: ['#7a1a1a', '#e0b040'], mago: ['#23237a', '#c8d4ff'], explorador: ['#2a4a22', '#c8e07a'], picaro: ['#16161e', '#a070ff'],
    paladin: ['#d8d0b8', '#e8c050'], druida: ['#3a4a22', '#9ad860'], sacerdote: ['#ece4cc', '#d8a030'],
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
    paladin: { w: 'maza', o: 'escudo', pecho: 'placas' }, druida: { w: 'baston', pecho: 'cuero' },
    sacerdote: { w: 'maza', o: 'escudo', pecho: 'tela' },
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

    // --- capa (conjuntos y únicos): por detrás del cuerpo ---
    const cape = set || gear.pechoR === 'unico';
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
      if (!back && cid === 'sacerdote' && chest === 'tela') { p.col(12, 19, 22, trim); p.row(20, 11, 13, trim); }
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
    if (species === 'goblin') { p.px(6, 13, skin); p.px(5, 13, skin); p.px(4, 12, skin); p.px(3, 12, skin); p.px(2, 11, skin); p.px(5, 12, skin); p.px(17, 13, skin); p.px(18, 13, skin); p.px(19, 12, skin); p.px(20, 12, skin); p.px(21, 11, skin); p.px(18, 12, skin); p.px(5, 14, '#ffcf4a'); p.px(18, 14, '#ffcf4a'); }
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
    if (species === 'goblin' && !back && npc !== 'encapuchado' && helm !== 'placas') { p.px(11, 13, '#ffd21a'); p.px(14, 13, '#ffd21a'); p.px(12, 15, skinD); p.px(13, 15, skinD); p.px(12, 16, skinD); p.px(11, 17, '#fff6dc'); p.px(14, 17, '#fff6dc'); }
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
      const rim = RARITY_COL[gear.or] || '#8a6a3a', face = gear.set === 'paladin' || gear.set === 'sacerdote' ? '#e8e0c8' : '#7a2a2a';
      p.rect(8, 17, 8, 9, face); p.row(16, 9, 14, rim); p.row(26, 9, 14, rim); p.col(7, 17, 25, rim); p.col(16, 17, 25, rim); p.col(12, 17, 25, '#c8a040'); p.row(20, 8, 15, '#c8a040');
    }

    return outline(c);
  }

  function drawWeapon(p, gear, back, o, hx = 16, hy = 23) {
    const w = gear.w;
    if (!w) return;
    const glow = RARITY_COL[gear.wr];
    const steel = gear.wr === 'unico' ? '#ffe6b0' : STEEL_L;
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
      const face = gear.set === 'paladin' ? '#e8e0c8' : gear.set === 'sacerdote' ? '#f0e8d0' : '#7a2a2a';
      p.rect(3, 18, 6, 8, face); p.row(17, 4, 7, rim); p.row(26, 4, 7, rim); p.col(2, 19, 24, rim); p.col(9, 19, 24, rim); p.row(27, 5, 6, rim);
      p.col(5, 19, 25, shade(face, 0.25)); p.px(6, 21, '#c8a040'); p.px(5, 22, '#c8a040'); p.px(6, 22, '#c8a040'); p.px(7, 22, '#c8a040'); p.px(6, 23, '#c8a040');
    } else if (gear.o === 'orbe') {
      const col = RARITY_COL[gear.or] || (gear.set === 'druida' ? '#9ad860' : '#a060ff');
      p.rect(3, 19, 3, 3, col); p.px(4, 18, col); p.px(4, 22, col); p.px(2, 20, col); p.px(6, 20, col); p.px(3, 19, shade(col, 0.6));
    }
  }

  // ======================================================================
  //  Enemigos (24×34, pies abajo)
  // ======================================================================




  // ======================================================================
  //  Casillas de mazmorra (16×16)
  // ======================================================================




  // ======================================================================
  //  Casillas del mundo abierto (16×16)
  // ======================================================================

  root.SPRITES = { hero, shade, outline };
})(this);
