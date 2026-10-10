/* global SPRITES */
// Pixel art de las mazmorras: suelos y muros por tema (con cara de muro en perspectiva 3/4), decorado,
// botín en el suelo, proyectiles e iconos de objetos para el inventario. Todo se dibuja una vez y se guarda en caché.
(function (root) {
  'use strict';

  const { shade, outline } = SPRITES;
  const cache = new Map();
  const cached = (key, build) => { let c = cache.get(key); if (!c) { c = build(); cache.set(key, c); } return c; };
  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    return { c, g };
  }
  function painter(g, ox = 0, oy = 0) {
    return {
      px(x, y, col) { g.fillStyle = col; g.fillRect(x + ox, y + oy, 1, 1); },
      rect(x, y, w, h, col) { g.fillStyle = col; g.fillRect(x + ox, y + oy, w, h); },
      row(y, x0, x1, col) { g.fillStyle = col; g.fillRect(x0 + ox, y + oy, x1 - x0 + 1, 1); },
      col(x, y0, y1, col) { g.fillStyle = col; g.fillRect(x + ox, y0 + oy, 1, y1 - y0 + 1); },
    };
  }








  // ---------- Botín ----------
  const RARITY = { inferior: '#9a9a9a', normal: '#d8d4c8', superior: '#ffffff', magico: '#7a8cff', raro: '#ffe24a', unico: '#c8a46a', conjunto: '#3ee67a' };


  function potion(color) {
    return cached('pot' + color, () => {
      const { c, g } = canvas(16, 16);
      const p = painter(g);
      p.rect(6, 3, 4, 2, '#c8a070'); p.rect(7, 5, 2, 2, '#c8e0f0');
      p.rect(5, 7, 6, 6, color); p.row(7, 5, 10, '#c8e0f0'); p.px(6, 8, shade(color, 0.5)); p.col(10, 8, 12, shade(color, -0.35));
      return outline(c);
    });
  }

  function scroll(color) {
    return cached('scr' + color, () => {
      const { c, g } = canvas(16, 16);
      const p = painter(g);
      p.rect(3, 5, 10, 7, '#e8dcb8'); p.col(3, 4, 12, '#c8b890'); p.col(12, 4, 12, '#c8b890');
      p.row(7, 5, 10, '#8a7a5a'); p.row(9, 5, 9, '#8a7a5a'); p.rect(7, 10, 3, 3, color);
      return outline(c);
    });
  }

  // ---------- Iconos de objetos (inventario, tiendas, suelo) ----------
  function itemIcon(it) {
    const key = `ic:${it.slot}:${it.base}:${it.type || ''}:${it.rarity}:${it.set || ''}`;
    return cached(key, () => {
      const { c, g } = canvas(16, 16);
      const p = painter(g);
      const glow = RARITY[it.rarity] || RARITY.normal;
      const steel = it.rarity === 'unico' ? '#ffe6b0' : '#d8dce4', steelD = '#7e848e';
      const wood = '#6b4228';
      const metal = { tela: '#7a5aa0', cuero: '#7a5030', malla: '#9aa0aa', placas: '#c0c6d0' }[it.type] || '#8a8a8a';
      const metalD = shade(metal, -0.35), metalL = shade(metal, 0.3);
      switch (it.base) {
        case 'espada': for (let i = 0; i < 9; i++) { p.px(4 + i, 11 - i, steel); p.px(5 + i, 11 - i, steelD); } p.row(11, 2, 6, '#c8a040'); p.px(3, 13, wood); p.px(2, 14, wood); p.px(13, 2, glow); break;
        case 'daga': for (let i = 0; i < 5; i++) { p.px(7 + i, 9 - i, steel); p.px(8 + i, 9 - i, steelD); } p.row(10, 5, 8, '#8a6a3a'); p.px(5, 12, wood); p.px(4, 13, wood); p.px(12, 4, glow); break;
        case 'hacha': for (let i = 0; i < 11; i++) p.px(3 + i, 14 - i, wood); p.rect(9, 2, 4, 6, steelD); p.col(13, 2, 7, steel); p.rect(10, 3, 2, 4, steel); p.px(9, 4, glow); break;
        case 'maza': for (let i = 0; i < 9; i++) p.px(3 + i, 14 - i, wood); p.rect(10, 2, 4, 4, steelD); p.px(11, 3, steel); p.px(12, 1, steelD); p.px(14, 3, steelD); p.px(9, 4, steelD); p.px(12, 6, glow); break;
        case 'espadon': for (let i = 0; i < 11; i++) { p.px(3 + i, 12 - i, steel); p.px(4 + i, 12 - i, steelD); p.px(3 + i, 11 - i, steel); } p.row(12, 1, 5, '#c8a040'); p.px(2, 14, wood); p.px(1, 15, wood); p.px(14, 1, glow); break;
        case 'martillo': for (let i = 0; i < 10; i++) p.px(3 + i, 14 - i, wood); p.rect(8, 1, 7, 5, steelD); p.row(1, 8, 14, steel); p.px(11, 3, glow); break;
        case 'lanza': for (let i = 0; i < 12; i++) p.px(1 + i, 14 - i, wood); p.rect(12, 1, 3, 3, steel); p.px(14, 0, steel); p.px(11, 4, glow); break;
        case 'arco': for (let i = 0; i < 12; i++) { const x = 3 + Math.round(Math.sin(i / 11 * Math.PI) * 6); p.px(x, 2 + i, wood); } p.col(3, 2, 13, '#e8e0d0'); p.px(8, 7, glow); break;
        case 'ballesta': p.row(8, 2, 13, wood); p.rect(10, 9, 3, 5, '#4a2e1a'); p.col(5, 4, 12, steelD); p.px(5, 3, steelD); p.px(5, 13, steelD); p.row(7, 5, 13, steel); p.px(13, 8, glow); break;
        case 'baston': for (let i = 0; i < 12; i++) p.px(2 + i, 14 - i, wood); p.rect(12, 1, 3, 3, glow); p.px(13, 1, shade(glow, 0.5)); break;
        case 'varita': for (let i = 0; i < 8; i++) p.px(4 + i, 12 - i, '#3a2414'); p.rect(11, 3, 2, 2, glow); p.px(13, 2, shade(glow, 0.6)); break;
        case 'escudo': { const face = it.set === 'paladin' || it.set === 'sacerdote' ? '#e8e0c8' : '#7a2a2a'; p.rect(3, 2, 10, 10, face); p.row(12, 4, 11, face); p.row(13, 5, 10, face); p.row(14, 7, 8, face); p.row(1, 3, 12, glow); p.col(2, 2, 11, glow); p.col(13, 2, 11, glow); p.col(8, 3, 12, '#c8a040'); p.row(6, 4, 11, '#c8a040'); break; }
        case 'orbe': p.rect(4, 3, 8, 8, glow); p.rect(3, 5, 10, 4, glow); p.rect(5, 4, 3, 2, shade(glow, 0.6)); p.rect(5, 11, 6, 3, '#6b4228'); p.row(14, 4, 11, '#4a2e1a'); break;
        case 'amuleto': p.px(4, 2, '#c8a040'); p.px(5, 4, '#c8a040'); p.px(6, 6, '#c8a040'); p.px(11, 2, '#c8a040'); p.px(10, 4, '#c8a040'); p.px(9, 6, '#c8a040'); p.rect(6, 7, 4, 5, '#c8a040'); p.rect(7, 8, 2, 3, glow); break;
        case 'anillo': p.rect(4, 7, 8, 6, '#c8a040'); p.rect(6, 9, 4, 2, 'rgba(0,0,0,0)'); g.clearRect(6, 9, 4, 3); p.rect(6, 4, 4, 3, glow); p.px(7, 4, shade(glow, 0.6)); break;
        default: {
          // armaduras según la pieza
          if (it.slot === 'casco') { p.rect(3, 4, 10, 8, metal); p.row(3, 5, 10, metal); p.row(4, 4, 11, metalL); p.col(12, 5, 11, metalD); if (it.type === 'placas') { p.row(8, 4, 11, '#1a1410'); p.col(8, 9, 12, metalD); } if (it.type === 'tela') { p.rect(2, 9, 2, 5, metal); p.rect(12, 9, 2, 5, metalD); } p.px(8, 2, glow); }
          else if (it.slot === 'pecho') { p.rect(3, 3, 10, 10, metal); p.rect(1, 3, 3, 5, metal); p.rect(12, 3, 3, 5, metalD); p.row(3, 3, 12, metalL); p.col(12, 4, 12, metalD); p.row(13, 4, 11, metalD); g.clearRect(6, 3, 4, 2); p.row(9, 3, 12, glow); }
          else if (it.slot === 'guantes') { p.rect(2, 5, 5, 7, metal); p.rect(9, 5, 5, 7, metal); p.row(5, 2, 6, metalL); p.row(5, 9, 13, metalL); p.rect(2, 11, 5, 2, glow); p.rect(9, 11, 5, 2, glow); }
          else if (it.slot === 'botas') { p.rect(3, 3, 4, 9, metal); p.rect(9, 3, 4, 9, metal); p.rect(1, 10, 6, 3, metalD); p.rect(9, 10, 6, 3, metalD); p.row(3, 3, 6, glow); p.row(3, 9, 12, glow); }
        }
      }
      return outline(c, '#0c0806');
    });
  }

  root.DSPRITES = { potion, scroll, itemIcon, RARITY };
})(this);
