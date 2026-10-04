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
  //  Héroes (24×32, pies en y=31)
  // ======================================================================
  // o: { back, frame (0 quieto, 1-2 andando), sit, emote, tick (0/1 para animar gestos) }
  function hero(look, o = {}) {
    const key = ['h', look.cls, look.species || '', look.sub || '', look.skin, look.hair, look.color || '', look.npc ? 1 : 0, o.back ? 1 : 0, o.frame || 0, o.sit ? 1 : 0, o.emote || '', o.tick || 0].join(':');
    return cached(key, () => drawHero(look, o));
  }

  function drawHero(look, o) {
    const { c, g } = canvas(24, 34);
    const OLD = ['guerrero', 'maga', 'elfo', 'picaro', 'bardo', 'clerigo'];
    const cid = MAP.CLASSES[look.cls] ? look.cls : (MAP.LEGACY_CLASS[look.cls] || 'fighter');
    const k = MAP.CLASSES[cid];
    const style = MAP.CLASSES[look.cls] ? k.style : (OLD.includes(look.cls) ? look.cls : k.style);
    const species = look.species || 'human';
    const body = look.color || k.color, trim = k.trim;
    const bodyD = shade(body, -0.28), bodyL = shade(body, 0.18);
    const dragonColor = species === 'dragonborn' && look.sub ? MAP.DRAGON_COLORS[look.sub.replace('draconic-ancestor-', '')] : null;
    const skin = dragonColor || MAP.SKINS[look.skin] || MAP.SKINS[0], skinD = shade(skin, -0.18);
    const hair = MAP.HAIRS[look.hair] || MAP.HAIRS[0], hairD = shade(hair, -0.3), hairL = shade(hair, 0.25);
    const pants = '#3a2a20', boots = '#24160e';
    const robe = style === 'maga' || style === 'clerigo';
    const back = !!o.back;
    const p = painter(g, 0, 2);
    const up = o.sit ? 3 : 0; // el cuerpo baja al sentarse

    // --- piernas ---
    if (o.sit) {
      p.rect(9, 26, 8, 2, pants); p.rect(15, 27, 3, 3, boots);
      p.rect(9, 26, 3, 3, pants);
    } else if (!robe) {
      const f = o.frame || 0;
      const l = f === 1 ? -1 : 0, r = f === 2 ? -1 : 0;
      p.rect(9, 26 + l, 2, 4, pants); p.rect(9, 29 + l, 3, 1 - l, boots);
      p.rect(13, 26 + r, 2, 4, pants); p.rect(13, 29 + r, 3, 1 - r, boots);
    } else {
      const f = o.frame || 0;
      p.rect(9, 29 - (f === 1 ? 1 : 0), 3, 1, boots); p.rect(13, 29 - (f === 2 ? 1 : 0), 3, 1, boots);
    }

    p.oy = 2 + up;
    // --- capa por detrás (pícaro, maga) ---
    if (back && (style === 'picaro' || style === 'maga')) p.rect(7, 18, 10, 9, bodyD);

    // --- cuerpo ---
    if (robe && !o.sit) {
      p.rect(8, 18, 8, 6, body);
      p.rect(7, 24, 10, 5, body);
      p.col(16, 24, 28, bodyD); p.col(15, 18, 23, bodyD);
      p.row(23, 8, 15, trim);
      if (!back && style === 'clerigo') { p.col(12, 19, 22, trim); p.row(20, 11, 13, trim); }
      if (!back && style === 'maga') p.px(11, 25, trim);
    } else {
      p.rect(8, 18, 8, 7, body);
      p.col(15, 18, 24, bodyD); p.col(8, 19, 23, bodyL);
      p.row(23, 8, 15, robe ? trim : '#4a2e1a');
      if (!back) p.px(12, 23, trim);
      if (style === 'guerrero' && !back) { p.rect(9, 18, 6, 4, '#b0b4bc'); p.row(18, 9, 14, '#d4d8e0'); p.col(14, 18, 21, '#8a8e98'); }
      if (style === 'elfo' && !back) { p.col(10, 18, 22, '#6b4228'); }
      if (style === 'bardo' && !back) { p.rect(9, 19, 4, 4, '#a0602a'); p.px(10, 20, '#3a1a0a'); p.col(13, 16, 19, '#6b3a1a'); }
      if (look.apron) { p.rect(9, 19, 6, 8, '#efe6d0'); p.col(14, 19, 26, '#cfc4aa'); }
    }
    if (back && style === 'elfo') { p.rect(9, 16, 2, 8, '#6b4228'); p.px(9, 15, '#c9e07a'); p.px(10, 15, '#c9e07a'); }

    // --- brazos ---
    const em = o.emote;
    p.rect(7, 18, 1, 5, bodyD); p.px(7, 23, skinD);       // brazo trasero
    if (em === 'wave' || em === 'fight') {
      const t = o.tick ? 1 : 0;
      p.rect(16, 14 + t, 1, 4, body); p.px(16, 18, body); p.px(16 + t, 13 + t, skin);
      if (em === 'fight') { p.col(17, 4, 12, '#dfe4ec'); p.col(18, 5, 12, '#a9b0bc'); p.row(13, 16, 19, '#7a5a2a'); }
    } else if (em === 'cheers' || o.mug) {
      p.rect(16, 18, 1, 3, body); p.px(16, 21, skin);
      p.rect(17, 18, 3, 4, '#b8b8c0'); p.rect(17, 19, 3, 2, '#e8a820'); p.row(17, 17, 19, '#fff6dc'); p.px(20, 19, '#8a8a92');
    } else if (o.wiping) {
      const t = o.tick ? 1 : 0;
      p.rect(16, 18, 1, 4, body); p.rect(16 + t, 22, 3, 2, '#d8d8e0');
    } else {
      const sw = (o.frame === 1 ? -1 : o.frame === 2 ? 1 : 0);
      p.rect(16, 18 + sw, 1, 5, body); p.px(16, 23 + sw, skin);
    }
    // bastón de la maga
    if (style === 'maga' && !back && !em) { p.col(18, 12, 28, '#6b4228'); p.px(18, 11, trim); p.px(18, 10, '#fff6c0'); }

    // --- cabeza ---
    p.rect(7, 9, 10, 9, skin);
    p.clear(7, 9); p.clear(16, 9); p.clear(7, 17); p.clear(16, 17);
    p.col(16, 10, 16, skinD); p.row(17, 8, 15, skinD);
    if (look.beard && !back) { p.rect(9, 15, 7, 3, look.beard); p.row(18, 10, 14, look.beard); p.px(12, 16, skin); }

    // orejas de elfo
    if (species === 'elf') { p.px(6, 13, skin); p.px(5, 12, skin); p.px(4, 11, skin); p.px(17, 13, skin); p.px(18, 12, skin); p.px(19, 11, skin); }
    if (species === 'gnome') { p.px(6, 13, skin); p.px(5, 12, skin); p.px(17, 13, skin); p.px(18, 12, skin); }
    if (species === 'dragonborn' && !back) { p.rect(16, 13, 2, 3, skin); p.px(17, 13, skinD); p.row(16, 15, 17, skinD); }

    // --- pelo ---
    if (!look.bald && species !== 'dragonborn') {
      if (back) {
        p.rect(7, 8, 10, 10, hair); p.row(8, 8, 15, hairL); p.col(16, 9, 17, hairD);
        if (style === 'maga' || style === 'elfo') p.rect(7, 17, 10, 3, hair);
      } else {
        p.row(7, 9, 14, hair); p.row(8, 8, 15, hair); p.row(9, 7, 16, hair); p.row(10, 7, 16, hair);
        p.row(11, 7, 10, hair); p.row(11, 13, 16, hair); p.px(14, 12, hair);
        p.col(7, 12, 14, hair); p.col(16, 11, 13, hairD);
        p.row(8, 9, 12, hairL);
        if (style === 'maga' || style === 'elfo') { p.rect(6, 11, 2, 9, hair); p.col(6, 12, 19, hairD); }
      }
    }

    // --- cara ---
    if (!back) {
      const closed = em === 'laugh' || em === 'sleep';
      if (closed) { p.row(14, 10, 11, '#1b1410'); p.row(14, 13, 14, '#1b1410'); }
      else { p.col(11, 13, 14, '#1b1410'); p.col(14, 13, 14, '#1b1410'); p.px(11, 13, '#ffffff'); p.px(14, 13, '#ffffff'); }
      p.px(10, 15, '#e88a8a'); p.px(15, 15, '#e88a8a');
      if (em === 'laugh' || em === 'cheers') { p.row(16, 12, 13, '#6a1a1a'); } else p.px(13, 16, skinD);
    }

    // --- rasgos de especie ---
    if (species === 'dwarf' && !back && !look.beard) { const hc = MAP.HAIRS[look.hair] || MAP.HAIRS[0]; p.rect(9, 15, 7, 3, hc); p.row(18, 10, 14, hc); p.px(12, 19, hc); p.px(12, 16, skin); p.px(13, 16, skin); }
    if (species === 'orc' && !back) { p.px(11, 16, '#fff6dc'); p.px(11, 15, '#fff6dc'); p.px(14, 16, '#fff6dc'); p.px(14, 15, '#fff6dc'); }
    if (species === 'tiefling') { const hn = '#3a2a2a'; p.px(9, 7, hn); p.px(8, 6, hn); p.px(8, 5, hn); p.px(9, 4, hn); p.px(14, 7, hn); p.px(15, 6, hn); p.px(15, 5, hn); p.px(14, 4, hn); }
    if (species === 'dragonborn') {
      p.rect(7, 8, 10, 3, skin); p.row(8, 9, 14, shade(skin, 0.15));
      p.px(8, 7, skinD); p.px(10, 6, skinD); p.px(13, 6, skinD); p.px(15, 7, skinD);
      if (!back) { p.px(9, 11, skinD); p.px(15, 12, skinD); } else { p.rect(7, 11, 10, 6, skin); p.col(11, 9, 16, skinD); }
    }
    if (species === 'goliath' && !back) { p.px(9, 12, skinD); p.px(10, 13, skinD); p.px(15, 11, skinD); p.px(8, 16, skinD); }

    // --- sombreros y capuchas ---
    switch (look.cls) {
      case 'guerrero': {
        const m = '#9aa0aa', md = '#6e747e', ml = '#c8ccd4', horn = '#efe6cf';
        p.row(6, 9, 14, m); p.row(7, 8, 15, m); p.rect(7, 8, 10, 3, m); p.row(11, 6, 17, md);
        p.row(7, 9, 12, ml); p.col(16, 8, 10, md);
        if (!back) p.col(12, 8, 10, md);
        p.px(5, 8, horn); p.px(4, 7, horn); p.px(4, 6, horn); p.px(3, 5, horn); p.px(6, 9, horn);
        p.px(18, 8, horn); p.px(19, 7, horn); p.px(19, 6, horn); p.px(20, 5, horn); p.px(17, 9, horn);
        break;
      }
      case 'maga': {
        p.row(10, 5, 18, bodyD); p.row(9, 7, 16, body); p.row(8, 8, 15, body); p.row(7, 9, 14, body);
        p.row(6, 9, 13, body); p.row(5, 10, 13, body); p.row(4, 10, 12, body); p.row(3, 11, 13, body); p.row(2, 12, 14, body); p.px(15, 1, body);
        p.row(9, 8, 15, trim); p.px(11, 6, trim);
        p.col(13, 3, 8, bodyD);
        break;
      }
      case 'elfo':
        if (!back) { p.row(10, 7, 16, trim); p.px(11, 9, '#4caf50'); p.px(12, 8, '#4caf50'); p.px(12, 9, '#4caf50'); }
        break;
      case 'picaro': {
        p.row(6, 9, 14, body); p.row(7, 8, 15, body); p.rect(7, 8, 10, 4, body);
        p.rect(6, 10, 2, 9, body); p.rect(16, 10, 2, 9, bodyD);
        p.row(7, 9, 12, bodyL);
        if (back) p.rect(7, 12, 10, 7, body);
        else { p.row(11, 8, 15, bodyD); p.rect(9, 15, 7, 2, '#2a2a30'); }
        break;
      }
      case 'bardo':
        if (look.npc) break;
        p.row(7, 8, 14, trim); p.row(8, 7, 16, trim); p.row(9, 6, 17, shade(trim, -0.25));
        p.row(7, 9, 11, shade(trim, 0.25));
        p.px(6, 7, '#e04040'); p.px(5, 6, '#e04040'); p.px(4, 5, '#ff6a5a'); p.px(4, 4, '#e04040'); p.px(3, 3, '#ff6a5a');
        break;
      case 'clerigo': {
        const hood = '#f4eedc';
        p.row(6, 9, 14, hood); p.row(7, 8, 15, hood); p.rect(7, 8, 10, 3, hood);
        p.rect(6, 10, 2, 8, hood); p.rect(16, 10, 2, 8, '#d8cfb6');
        p.row(10, 7, 16, trim); if (!back) p.px(12, 9, '#7ad0ff');
        if (back) p.rect(7, 11, 10, 7, hood);
        break;
      }
    }
    return outline(c);
  }

  // ======================================================================
  //  Enemigos (24×34, pies abajo)
  // ======================================================================
  function enemy(type, o = {}) {
    const key = ['e', type, o.frame || 0, o.hit ? 1 : 0].join(':');
    return cached(key, () => {
      const { c, g } = canvas(type === 'warchief' || type === 'necromancer' ? 30 : 24, type === 'warchief' || type === 'necromancer' ? 38 : 34);
      const p = painter(g, type === 'warchief' || type === 'necromancer' ? 3 : 0, type === 'warchief' || type === 'necromancer' ? 4 : 2);
      (ENEMY_DRAW[type] || ENEMY_DRAW.goblin)(p, o.frame || 0);
      outline(c);
      if (o.hit) { g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(255,255,255,.75)'; g.fillRect(0, 0, c.width, c.height); }
      return c;
    });
  }

  function legs(p, f, x1, x2, y, h, col, bootCol) {
    const l = f === 1 ? -1 : 0, r = f === 2 ? -1 : 0;
    p.rect(x1, y + l, 2, h, col); p.rect(x1, y + h - 1 + l, 3, 1, bootCol || shade(col, -0.3));
    p.rect(x2, y + r, 2, h, col); p.rect(x2, y + h - 1 + r, 3, 1, bootCol || shade(col, -0.3));
  }

  const ENEMY_DRAW = {
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

  root.SPRITES = { hero, enemy, floorTile, wallTile, overlayTile, shade, outline };
})(this);
