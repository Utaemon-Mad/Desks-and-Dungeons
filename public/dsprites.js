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
  const rand = (seed) => { const s = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

  // Paletas apagadas, de tonos medievales oscuros
  const THEMES = {
    cuevas:    { floor: '#3e3428', floor2: '#463a2c', crack: '#2a2219', wall: '#241c16', face: '#4e3e2e', faceD: '#33281e', faceL: '#5e4c38', moss: null, liquid: ['#1e3a5a', '#2e5a8a'] },
    cripta:    { floor: '#383a42', floor2: '#40424a', crack: '#26272d', wall: '#1c1d22', face: '#4a4c56', faceD: '#30313a', faceL: '#5a5c66', moss: '#3a4a34', liquid: ['#1a2e3a', '#2a4a5a'] },
    fortaleza: { floor: '#3a3230', floor2: '#4a3a2c', crack: '#26201e', wall: '#1e1a1a', face: '#544a44', faceD: '#38302c', faceL: '#665a52', moss: null, liquid: ['#1e3a5a', '#2e5a8a'] },
    nido:      { floor: '#2c3426', floor2: '#323c2a', crack: '#1c2218', wall: '#161c14', face: '#34402c', faceD: '#222a1c', faceL: '#44523a', moss: '#4a6a34', liquid: ['#2a3a1a', '#4a5a2a'] },
    volcan:    { floor: '#2a2224', floor2: '#30282a', crack: '#7a2a10', wall: '#140e10', face: '#3a2a2a', faceD: '#24181a', faceL: '#4a3634', moss: null, liquid: ['#c8400a', '#ff8a1a'] },
  };
  const theme = (t) => THEMES[t] || THEMES.cripta;

  // ---------- Suelo ----------
  function floor(t, x, y) {
    const v = Math.floor(rand(x * 13 + y * 7) * 6);
    return cached(`df:${t}:${v}`, () => {
      const T = theme(t);
      const { c, g } = canvas(16, 16);
      const p = painter(g);
      const base = v % 2 ? T.floor : T.floor2;
      p.rect(0, 0, 16, 16, base);
      // ruido de textura
      for (let i = 0; i < 18; i++) { const px = Math.floor(rand(v * 50 + i) * 16), py = Math.floor(rand(v * 70 + i * 3) * 16); p.px(px, py, shade(base, rand(i + v) > 0.5 ? 0.07 : -0.1)); }
      if (t === 'fortaleza' && v < 3) {
        // tablones de madera
        p.rect(0, 0, 16, 16, '#4a3626');
        for (let i = 0; i < 4; i++) { p.row(i * 4 + 3, 0, 15, '#2e2016'); p.row(i * 4, 0, 15, '#56402c'); }
        p.col((v * 5) % 16, 0, 3, '#2e2016'); p.col((v * 5 + 8) % 16, 4, 7, '#2e2016'); p.col((v * 3 + 4) % 16, 8, 11, '#2e2016');
      } else if (t === 'cuevas' || t === 'nido') {
        // tierra y piedras sueltas
        p.px(3 + v, 4, T.crack); p.px(4 + v, 4, T.crack); p.px(11, 9 + (v % 3), shade(base, 0.12)); p.px(12, 9 + (v % 3), shade(base, 0.12));
        if (v === 4) { p.rect(6, 10, 3, 2, shade(base, 0.15)); p.row(12, 6, 8, T.crack); }
        if (T.moss && v === 1) { p.rect(1, 12, 4, 2, T.moss); p.px(2, 11, T.moss); }
      } else {
        // losas de piedra
        const seam = shade(base, -0.22);
        p.row(7, 0, 15, seam); p.row(15, 0, 15, seam);
        p.col(v % 2 ? 5 : 9, 0, 6, seam); p.col(v % 2 ? 11 : 3, 8, 14, seam);
        p.row(0, 0, 15, shade(base, 0.07)); p.row(8, 0, 15, shade(base, 0.07));
        if (v === 2) { p.px(12, 3, T.crack); p.px(13, 4, T.crack); p.px(13, 5, T.crack); }
        if (T.moss && v === 5) { p.px(2, 6, T.moss); p.px(3, 6, T.moss); p.px(3, 5, T.moss); }
      }
      if (t === 'volcan' && v >= 3) { p.px(4, 5, '#a8380e'); p.px(5, 6, '#c8501a'); p.px(6, 6, '#a8380e'); p.px(11, 12, '#a8380e'); }
      return c;
    });
  }

  // ---------- Muros: tapa oscura; si debajo hay suelo, cara de muro de piedra a la vista ----------
  function wall(t, x, y, face) {
    const v = Math.floor(rand(x * 7 + y * 11) * 3);
    return cached(`dw:${t}:${face ? 1 : 0}:${v}`, () => {
      const T = theme(t);
      const { c, g } = canvas(16, 16);
      const p = painter(g);
      p.rect(0, 0, 16, 16, T.wall);
      p.px(3 + v, 3, shade(T.wall, 0.15)); p.px(10, 8 + v, shade(T.wall, 0.12)); p.px(6, 12, shade(T.wall, -0.3));
      if (face) {
        const top = 3;
        p.row(top - 1, 0, 15, shade(T.face, 0.25)); // borde superior iluminado
        p.rect(0, top, 16, 16 - top, T.face);
        if (t === 'cuevas' || t === 'nido') {
          // roca irregular
          for (let i = 0; i < 6; i++) { const rx = Math.floor(rand(v * 9 + i) * 13), ry = top + 2 + Math.floor(rand(v * 5 + i * 2) * 9); p.rect(rx, ry, 3, 2, i % 2 ? T.faceL : T.faceD); }
          if (T.moss) { p.rect(0, 14, 16, 2, T.moss); p.px(3 + v, 13, T.moss); p.px(10, 12, T.moss); }
        } else {
          // sillares
          for (let r = 0; r < 3; r++) {
            const yy = top + r * 4;
            p.row(yy, 0, 15, T.faceD);
            for (let xx = (r % 2 ? 4 : 0) + v; xx < 16; xx += 8) p.col(xx % 16, yy, yy + 3, T.faceD);
            p.row(yy + 1, 0, 15, T.faceL);
          }
          if (T.moss && v === 1) { p.px(2, 14, T.moss); p.px(3, 13, T.moss); p.px(12, 14, T.moss); }
        }
        p.row(15, 0, 15, shade(T.faceD, -0.3));
      }
      return c;
    });
  }

  function liquid(t, frame) {
    return cached(`dl:${t}:${frame}`, () => {
      const T = theme(t);
      const { c, g } = canvas(16, 16);
      const p = painter(g);
      const [a, b] = T.liquid;
      p.rect(0, 0, 16, 16, a);
      p.row(3 + frame, 2, 6, b); p.row(9 - frame, 8, 13, b); p.row(13, 3 + frame, 6 + frame, b);
      p.px(12, 2 + frame, shade(b, 0.4));
      if (t === 'volcan') { p.px(5, 7, '#ffd25a'); p.px(10 - frame, 12, '#ffd25a'); }
      return c;
    });
  }

  function door(t) {
    return cached('dd:' + t, () => {
      const { c, g } = canvas(16, 16);
      const p = painter(g);
      p.rect(2, 1, 12, 14, '#5a3820'); p.col(5, 1, 14, '#3a2414'); p.col(8, 1, 14, '#3a2414'); p.col(11, 1, 14, '#3a2414');
      p.row(4, 2, 13, '#2a2a30'); p.row(11, 2, 13, '#2a2a30'); p.px(11, 8, '#c8a040');
      return outline(c);
    });
  }

  function spikes(frame) {
    return cached('dsp' + frame, () => {
      const { c, g } = canvas(16, 16);
      const p = painter(g);
      const h = frame ? 2 : 0;
      for (const [sx, sy] of [[3, 4], [10, 4], [3, 11], [10, 11]]) {
        p.rect(sx, sy, 3, 2, '#1e1a22');
        p.col(sx + 1, sy - 3 + h, sy, '#b8bcc4'); p.px(sx + 1, sy - 3 + h, '#ffffff');
      }
      return c;
    });
  }

  // ---------- Decorado ----------
  // Devuelve { img, h }: h = altura sobre la casilla (para dibujar los altos hacia arriba)
  const PROP_SIZE = { pillar: 30, statue: 26, brazier: 20, rack: 22, cage: 22, throne: 24, stalagmite: 22, tent: 22, crystal: 22, tomb: 18, altar: 16, eggs: 16, coffin: 16, sarcophagus: 16, barrel: 18, crate: 16, table: 16, campfire: 16 };
  function prop(k, t, frame = 0) {
    return cached(`dp:${k}:${t}:${frame}`, () => {
      const h = PROP_SIZE[k] || 16;
      const { c, g } = canvas(16, h);
      const p = painter(g, 0, h - 16);
      const T = theme(t);
      const stone = T.faceL, stoneD = T.faceD;
      let line = true;
      switch (k) {
        case 'pillar': {
          const top = -(h - 16);
          p.rect(3, top + 2, 10, h - 3, stone); p.col(4, top + 3, 13, shade(stone, 0.15)); p.col(11, top + 2, 13, stoneD); p.col(12, top + 2, 13, stoneD);
          p.rect(2, top, 12, 3, shade(stone, 0.1)); p.rect(2, 12, 12, 3, shade(stone, 0.05)); p.row(14, 2, 13, stoneD);
          p.col(7, top + 4, 11, shade(stone, -0.1));
          break;
        }
        case 'statue': {
          const top = -(h - 16);
          p.rect(3, 11, 10, 4, stoneD); p.row(11, 3, 12, stone);
          p.rect(6, top + 2, 4, 4, stone); p.rect(5, top + 6, 6, 9, stone); p.col(10, top + 6, 10, stoneD); p.rect(3, top + 7, 2, 5, stone); p.rect(11, top + 7, 2, 5, stoneD);
          p.col(13, top + 1, 11, '#8a8e98'); p.px(13, top, '#c8ccd4');
          p.px(7, top + 3, '#1a1a1e'); p.px(9, top + 3, '#1a1a1e');
          break;
        }
        case 'sarcophagus': case 'coffin': {
          const wood = k === 'coffin';
          const col = wood ? '#4a3020' : stone, colD = wood ? '#2e1c12' : stoneD;
          p.rect(2, 2, 12, 12, col); p.row(2, 3, 12, shade(col, 0.15)); p.col(13, 2, 13, colD); p.row(13, 2, 13, colD);
          if (!wood) { p.rect(5, 4, 6, 8, shade(col, 0.08)); p.px(7, 5, colD); p.px(8, 5, colD); p.col(7, 7, 10, colD); p.col(8, 7, 10, colD); }
          else { p.row(6, 4, 11, colD); p.col(8, 3, 11, colD); }
          break;
        }
        case 'tomb': {
          const top = -(h - 16);
          p.rect(4, top + 3, 8, h - 4, stone); p.row(top + 2, 5, 10, stone); p.col(11, top + 3, 14, stoneD);
          p.col(8, top + 5, top + 9, stoneD); p.row(top + 6, 7, 9, stoneD);
          p.row(14, 3, 12, '#1a1612');
          break;
        }
        case 'altar': {
          p.rect(2, 6, 12, 8, stone); p.row(6, 2, 13, shade(stone, 0.2)); p.col(13, 6, 13, stoneD);
          p.rect(4, 3, 2, 3, '#efe6cf'); p.rect(10, 3, 2, 3, '#efe6cf');
          p.px(4, 2 - frame, '#ffcf4a'); p.px(10, 2 - (1 - frame), '#ffcf4a');
          p.rect(6, 8, 4, 3, '#6a1a1a');
          break;
        }
        case 'barrel': {
          const top = -(h - 16);
          p.rect(3, top + 3, 10, h - 4, '#6a4224'); p.row(top + 2, 4, 11, '#5a3418'); p.rect(4, top + 3, 8, 2, '#3a2412');
          p.row(top + 7, 3, 12, '#2a2a2e'); p.row(12, 3, 12, '#2a2a2e'); p.col(12, top + 3, 14, '#4a2c16'); p.col(5, top + 5, 13, '#7a5230');
          break;
        }
        case 'crate': {
          p.rect(2, 3, 12, 11, '#7a5530'); p.row(3, 2, 13, '#8a6538'); p.col(13, 3, 13, '#5a3a1a'); p.row(13, 2, 13, '#5a3a1a');
          for (let i = 0; i < 10; i++) { p.px(3 + i, 4 + i, '#5a3a1a'); }
          p.col(7, 3, 13, '#5a3a1a');
          break;
        }
        case 'table': {
          p.rect(1, 4, 14, 6, '#5a3c22'); p.row(4, 1, 14, '#6a4a2a'); p.row(9, 1, 14, '#3a2414');
          p.col(2, 10, 14, '#3a2414'); p.col(13, 10, 14, '#3a2414');
          p.rect(4, 2, 3, 3, '#b8b8c0'); p.rect(4, 3, 3, 1, '#e8a820'); p.rect(10, 3, 2, 2, '#c8a070');
          break;
        }
        case 'brazier': {
          const top = -(h - 16);
          p.col(5, top + 10, 14, '#2a2a2e'); p.col(10, top + 10, 14, '#2a2a2e'); p.col(8, top + 10, 14, '#2a2a2e');
          p.rect(3, top + 7, 10, 4, '#3a3a40'); p.row(top + 7, 3, 12, '#5a5a62');
          p.rect(5, top + 2 - frame, 6, 5 + frame, '#e8601c'); p.rect(6, top + 4 - frame, 4, 3, '#ffd25a'); p.px(8, top + 1 - frame, '#ffb03a'); p.px(6, top + frame, '#ff8a2a');
          break;
        }
        case 'rack': {
          const top = -(h - 16);
          p.col(2, top + 2, 14, '#4a2e1a'); p.col(13, top + 2, 14, '#4a2e1a'); p.row(top + 4, 2, 13, '#4a2e1a'); p.row(12, 2, 13, '#4a2e1a');
          p.col(5, top + 1, 11, '#c8ccd4'); p.col(8, top, 11, '#a8aeb8'); p.rect(10, top + 1, 2, 3, '#8a8e98'); p.col(11, top + 4, 11, '#6b4228');
          break;
        }
        case 'cage': {
          const top = -(h - 16);
          p.row(top + 1, 3, 12, '#3a3a40'); p.row(14, 2, 13, '#3a3a40');
          for (let x = 3; x <= 12; x += 3) p.col(x, top + 1, 14, '#5a5a62');
          p.px(7, 10, '#c8c0a8'); p.px(8, 11, '#c8c0a8'); p.px(7, 12, '#e8e4d0');
          break;
        }
        case 'throne': {
          const top = -(h - 16);
          p.rect(3, top + 1, 10, 12, '#5a1a1a'); p.rect(4, top + 2, 8, 10, '#7a2424'); p.row(top + 1, 3, 12, '#c8a040'); p.px(3, top, '#c8a040'); p.px(12, top, '#c8a040'); p.px(8, top, '#c8a040');
          p.rect(2, 10, 12, 5, '#4a3020'); p.row(10, 2, 13, '#c8a040');
          break;
        }
        case 'eggs': {
          for (const [ex, ey] of [[4, 8], [9, 7], [7, 11], [11, 11]]) { p.rect(ex, ey, 4, 4, '#c8c8a8'); p.px(ex + 1, ey, '#e8e8d0'); p.px(ex + 3, ey + 3, '#8a8a6a'); }
          p.row(14, 2, 14, '#3a4a2a');
          break;
        }
        case 'stalagmite': {
          const top = -(h - 16);
          for (let i = 0; i < h - 2; i++) { const w = 1 + Math.floor(i / 3); p.row(top + 1 + i, 8 - w, 7 + w, i % 4 === 0 ? stoneD : stone); }
          p.col(9, top + 6, 14, stoneD);
          break;
        }
        case 'mushrooms': {
          line = false;
          for (const [mx, my, col] of [[3, 9, '#5affc8'], [9, 11, '#3adfa8'], [11, 6, '#7affd8']]) { p.col(mx + 1, my + 2, my + 4, '#c8c0a8'); p.rect(mx, my, 3, 2, col); p.px(mx + 1, my, shade(col, 0.5)); }
          break;
        }
        case 'tent': {
          const top = -(h - 16);
          for (let i = 0; i < h - 2; i++) p.row(top + 1 + i, 8 - Math.floor(i / 2), 7 + Math.floor(i / 2), i < 2 ? '#6a5a3a' : '#8a6a3a');
          p.rect(6, 9, 4, 6, '#1a1210'); p.col(8, top, top + 2, '#4a2e1a');
          break;
        }
        case 'campfire': {
          p.row(13, 3, 12, '#4a2e1a'); p.row(12, 4, 11, '#5a3a1a'); p.px(3, 11, '#6a6a72'); p.px(12, 11, '#6a6a72');
          p.rect(6, 6 - frame, 4, 6 + frame, '#e8601c'); p.rect(7, 8 - frame, 2, 4, '#ffd25a'); p.px(8, 4 - frame, '#ffb03a');
          break;
        }
        case 'crystal': {
          const top = -(h - 16);
          p.rect(6, top + 2, 4, h - 4, '#8a4ad8'); p.col(7, top + 3, 12, '#d8b0ff'); p.px(8, top + 1, '#f0d8ff');
          p.rect(3, top + 8, 3, 7, '#6a3ab8'); p.px(4, top + 7, '#b080f0'); p.rect(10, top + 6, 3, 9, '#7a42c8'); p.px(11, top + 5, '#c090ff');
          break;
        }
        // planos (sin contorno)
        case 'bones': line = false; p.row(10, 4, 9, '#c8c0a8'); p.px(3, 9, '#e8e4d0'); p.px(3, 11, '#e8e4d0'); p.px(10, 9, '#e8e4d0'); p.px(10, 11, '#e8e4d0'); p.row(6, 9, 12, '#b8b098'); p.px(12, 5, '#d8d0b8'); break;
        case 'skull': p.rect(6, 8, 5, 4, '#d8d0b8'); p.row(12, 7, 9, '#c8c0a8'); p.px(7, 10, '#1a1612'); p.px(9, 10, '#1a1612'); break;
        case 'blood': line = false; p.rect(4, 8, 6, 3, '#4a0e0e'); p.rect(6, 7, 4, 5, '#5a1212'); p.px(11, 10, '#4a0e0e'); p.px(3, 12, '#4a0e0e'); break;
        case 'rubble': line = false; p.rect(3, 10, 3, 2, stone); p.rect(7, 11, 2, 2, stoneD); p.rect(10, 9, 3, 3, stone); p.px(11, 9, shade(stone, 0.2)); break;
        case 'web': line = false; { const w = 'rgba(220,220,230,.55)'; for (let i = 0; i < 16; i++) { p.px(i, i, w); p.px(15 - i, i, w); } p.row(8, 0, 15, w); p.col(8, 0, 15, w); for (const r of [3, 6]) { p.row(8 - r, 8 - r, 8 + r, w); p.row(8 + r, 8 - r, 8 + r, w); } } break;
        case 'candles': line = false; for (const [cx, cy] of [[4, 9], [8, 11], [11, 8]]) { p.rect(cx, cy, 2, 4, '#efe6cf'); p.px(cx, cy - 1 - ((frame + cx) % 2), '#ffcf4a'); } break;
        case 'rug': line = false; p.rect(1, 2, 14, 12, '#5a1a1a'); p.rect(2, 3, 12, 10, '#7a2a24'); p.rect(4, 5, 8, 6, '#5a1a1a'); p.row(3, 2, 13, '#c8a040'); p.row(12, 2, 13, '#c8a040'); break;
        case 'lavarock': line = false; p.rect(4, 9, 5, 3, '#2a1a1a'); p.px(5, 10, '#ff5a1a'); p.px(7, 10, '#ffa03a'); p.rect(10, 6, 3, 2, '#2a1a1a'); p.px(11, 6, '#ff5a1a'); break;
        case 'puddle': line = false; p.rect(3, 9, 9, 4, T.liquid[0]); p.rect(5, 8, 5, 6, T.liquid[0]); p.px(6, 9, T.liquid[1]); break;
        // en la cara de los muros
        case 'torch': line = false; p.rect(7, 8, 2, 6, '#4a2e1a'); p.rect(6, 7, 4, 2, '#2a2a2e'); p.rect(6, 3 - frame, 4, 4 + frame, '#e8601c'); p.rect(7, 4 - frame, 2, 3, '#ffd25a'); p.px(8, 2 - frame, '#ffb03a'); break;
        case 'banner': p.rect(5, 4, 6, 10, t === 'cripta' ? '#2a2a4a' : t === 'nido' ? '#2a4a2a' : '#6a1414'); p.row(4, 4, 11, '#c8a040'); p.px(5, 14, '#6a1414'); p.px(10, 14, '#6a1414'); p.px(7, 8, '#c8a040'); p.px(8, 8, '#c8a040'); p.px(7, 9, '#c8a040'); p.px(8, 10, '#c8a040'); break;
        case 'chains': line = false; for (const cx of [5, 10]) for (let y = 4; y < 13; y += 2) { p.px(cx, y, '#6a6a72'); p.px(cx, y + 1, '#3a3a40'); } p.rect(9, 13, 3, 2, '#5a5a62'); break;
        case 'shield': p.rect(5, 5, 6, 7, '#6a1a1a'); p.row(4, 6, 9, '#a8aeb8'); p.col(4, 6, 10, '#a8aeb8'); p.col(11, 6, 10, '#a8aeb8'); p.row(12, 6, 9, '#a8aeb8'); p.px(7, 8, '#c8a040'); p.px(8, 8, '#c8a040'); break;
        case 'crack': line = false; p.px(6, 4, '#0a0808'); p.px(7, 5, '#0a0808'); p.px(7, 6, '#0a0808'); p.px(8, 7, '#0a0808'); p.px(8, 8, '#0a0808'); p.px(9, 9, '#0a0808'); p.px(6, 7, '#0a0808'); break;
      }
      return line ? outline(c, '#0c0806') : c;
    });
  }
  const ANIMATED = new Set(['brazier', 'campfire', 'candles', 'torch', 'altar']);

  // ---------- Botín ----------
  const RARITY = { inferior: '#9a9a9a', normal: '#d8d4c8', superior: '#ffffff', magico: '#7a8cff', raro: '#ffe24a', unico: '#c8a46a', conjunto: '#3ee67a' };

  function goldPile() {
    return cached('gold', () => {
      const { c, g } = canvas(16, 16);
      const p = painter(g);
      p.rect(4, 10, 4, 2, '#ffd23f'); p.rect(8, 11, 4, 2, '#e0b040'); p.rect(6, 8, 4, 2, '#ffe680'); p.rect(7, 6, 3, 2, '#ffd23f');
      p.px(5, 10, '#fff6c0'); p.px(9, 11, '#fff6c0'); p.px(8, 6, '#fff6c0');
      return outline(c);
    });
  }

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

  root.DSPRITES = { THEMES, floor, wall, liquid, door, spikes, prop, PROP_SIZE, ANIMATED, goldPile, potion, scroll, itemIcon, RARITY };
})(this);
