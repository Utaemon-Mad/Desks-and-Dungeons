// Texturas procedurales (canvas): suelo de tablones, ladrillo, piedra, madera, alfombra, runas, llamas y brillos.
// Todo se dibuja con semilla fija, así la taberna sale igual en cada carga.
(() => {
  const TI = (window.TI = window.TI || {});
  const T = (TI.tex = {});

  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const rng = (seed) => { let s = seed >>> 0; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; };
  const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
  // pasa un canvas a textura (repetible); srgb=false para mapas de relieve
  function tex(canvas, repeat, srgb = true) {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (repeat) t.repeat.set(repeat[0], repeat[1]);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 8;
    return t;
  }
  T.tex = tex;
  T.rng = rng;

  // veta de la madera: trazos largos y ondulados dentro de un rectángulo
  function grain(g, x, y, w, h, r, dark = 0.22, light = 0.07, n = 22) {
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    for (let i = 0; i < n; i++) {
      const yy = y + r() * h, ph = r() * 6.28, am = 0.6 + r() * 2.2, fr = 0.006 + r() * 0.012;
      g.beginPath();
      for (let px = 0; px <= w; px += 24) { const py = yy + Math.sin(px * fr + ph) * am; px ? g.lineTo(x + px, py) : g.moveTo(x + px, py); }
      g.strokeStyle = r() < 0.7 ? `rgba(18,9,4,${dark * (0.4 + r() * 0.8)})` : `rgba(150,105,66,${light * (0.5 + r())})`;
      g.lineWidth = 0.6 + r() * 1.6;
      g.stroke();
    }
    g.restore();
  }

  // ----- Suelo de tablones (color + relieve), sin costuras -----
  T.floor = () => {
    const W = 1024, c = mk(W, W), g = c.getContext('2d'), r = rng(7);
    const rows = 8, rh = W / rows;
    g.fillStyle = '#0d0705'; g.fillRect(0, 0, W, W);
    const bases = ['#4a3020', '#3e281a', '#553a26', '#4b3322', '#392418', '#5b4029', '#43301f'];
    for (let i = 0; i < rows; i++) {
      let x = -r() * 420;
      while (x < W) {
        const len = 300 + r() * 520, base = bases[(r() * bases.length) | 0], y = i * rh;
        const seed = r(), local = rng((seed * 1e9) | 0);
        for (const ox of x + len > W ? [0, -W] : [0]) {
          const px = x + ox;
          g.fillStyle = base; g.fillRect(px + 2, y + 2, len - 3, rh - 3);
          // sombreado del tablón: más claro arriba, oscuro abajo y en los extremos
          const gr = g.createLinearGradient(0, y, 0, y + rh);
          gr.addColorStop(0, 'rgba(255,225,180,0.10)'); gr.addColorStop(0.5, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.30)');
          g.fillStyle = gr; g.fillRect(px + 2, y + 2, len - 3, rh - 3);
          grain(g, px + 2, y + 2, len - 3, rh - 3, local);
          // nudo
          if (local() < 0.35) {
            const kx = px + 60 + local() * (len - 120), ky = y + rh * (0.3 + local() * 0.4);
            for (let k = 4; k > 0; k--) { g.beginPath(); g.ellipse(kx, ky, k * 5, k * 2.6, 0, 0, 6.28); g.strokeStyle = `rgba(15,7,3,${0.18 + k * 0.06})`; g.lineWidth = 1.4; g.stroke(); }
          }
          // clavos en los extremos
          for (const nx of [px + 12, px + len - 14]) for (const ny of [y + rh * 0.3, y + rh * 0.7]) {
            g.fillStyle = 'rgba(10,6,4,0.85)'; g.beginPath(); g.arc(nx, ny, 2.6, 0, 6.28); g.fill();
            g.fillStyle = 'rgba(190,160,120,0.35)'; g.beginPath(); g.arc(nx - 0.7, ny - 0.8, 0.9, 0, 6.28); g.fill();
          }
          // manchas de desgaste
          for (let s = 0; s < 3; s++) {
            const sx = px + local() * len, sy = y + local() * rh, rr = 30 + local() * 60;
            const rg = g.createRadialGradient(sx, sy, 0, sx, sy, rr);
            const light = local() < 0.5;
            rg.addColorStop(0, light ? 'rgba(180,130,80,0.10)' : 'rgba(0,0,0,0.16)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
            g.fillStyle = rg; g.fillRect(sx - rr, sy - rr, rr * 2, rr * 2);
          }
        }
        x += len;
      }
    }
    // polvo y astillas
    for (let i = 0; i < 5000; i++) { g.fillStyle = r() < 0.6 ? 'rgba(0,0,0,0.14)' : 'rgba(200,160,110,0.07)'; g.fillRect(r() * W, r() * W, 1 + r() * 2, 1); }
    return { map: tex(c, [5.5, 4.5]), bump: tex(c, [5.5, 4.5], false) };
  };

  // ----- Suciedad grande del suelo (una sola pasada por toda la sala): manchas oscuras y camino gastado -----
  T.grime = (w, d) => {
    const S = 1024, c = mk(S, S), g = c.getContext('2d'), r = rng(31);
    g.clearRect(0, 0, S, S);
    // camino gastado (más claro) en diagonal por el centro
    for (let i = 0; i < 40; i++) {
      const t = i / 39, x = S * (0.15 + 0.7 * t) + (r() - 0.5) * 80, y = S * (0.2 + 0.6 * t) + (r() - 0.5) * 80, rr = 70 + r() * 90;
      const rg = g.createRadialGradient(x, y, 0, x, y, rr);
      rg.addColorStop(0, 'rgba(150,105,65,0.10)'); rg.addColorStop(1, 'rgba(150,105,65,0)');
      g.fillStyle = rg; g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    }
    // manchas oscuras (cerveza, hollín, barro)
    for (let i = 0; i < 70; i++) {
      const x = r() * S, y = r() * S, rr = 20 + r() * 90, a = 0.07 + r() * 0.2;
      const rg = g.createRadialGradient(x, y, 0, x, y, rr);
      rg.addColorStop(0, `rgba(8,4,2,${a})`); rg.addColorStop(0.6, `rgba(8,4,2,${a * 0.5})`); rg.addColorStop(1, 'rgba(8,4,2,0)');
      g.fillStyle = rg; g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    }
    // borde sucio junto a las paredes (esquina norte/oeste arriba a la izquierda del canvas)
    const e = g.createLinearGradient(0, 0, S * 0.12, 0); e.addColorStop(0, 'rgba(0,0,0,0.5)'); e.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = e; g.fillRect(0, 0, S * 0.12, S);
    const e2 = g.createLinearGradient(0, 0, 0, S * 0.12); e2.addColorStop(0, 'rgba(0,0,0,0.5)'); e2.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = e2; g.fillRect(0, 0, S, S * 0.12);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  };

  // ----- Ladrillo oscuro con argamasa -----
  T.brick = () => {
    const W = 1024, c = mk(W, W), g = c.getContext('2d'), r = rng(11);
    g.fillStyle = '#2a211c'; g.fillRect(0, 0, W, W);
    const bw = 128, bh = 64, cols = ['#6b3a2a', '#5d3325', '#7a4632', '#53301f', '#6e4535', '#4a2a1e', '#74402c'];
    for (let j = 0; j < W / bh; j++) for (let i = -1; i < W / bw + 1; i++) {
      const x = i * bw + (j % 2 ? bw / 2 : 0), y = j * bh, col = cols[(r() * cols.length) | 0];
      g.fillStyle = col; g.fillRect(x + 3, y + 3, bw - 6, bh - 6);
      const gr = g.createLinearGradient(0, y, 0, y + bh);
      gr.addColorStop(0, 'rgba(255,220,180,0.10)'); gr.addColorStop(1, 'rgba(0,0,0,0.22)');
      g.fillStyle = gr; g.fillRect(x + 3, y + 3, bw - 6, bh - 6);
      for (let k = 0; k < 14; k++) { g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.18)' : 'rgba(220,170,130,0.08)'; g.fillRect(x + 4 + r() * (bw - 10), y + 4 + r() * (bh - 10), 1 + r() * 4, 1 + r() * 2); }
    }
    // hollín que sube desde abajo
    const sg = g.createLinearGradient(0, W, 0, 0); sg.addColorStop(0, 'rgba(0,0,0,0.0)'); sg.addColorStop(1, 'rgba(0,0,0,0.0)');
    return { map: tex(c, null), bump: tex(c, null, false) };
  };

  // ----- Piedra de la chimenea -----
  T.stone = () => {
    const W = 512, c = mk(W, W), g = c.getContext('2d'), r = rng(5);
    g.fillStyle = '#1b1816'; g.fillRect(0, 0, W, W);
    let y = 0;
    while (y < W) {
      const h = 56 + r() * 40; let x = -r() * 100;
      while (x < W) {
        const w = 90 + r() * 110, v = 70 + r() * 36;
        g.fillStyle = `rgb(${v + 6},${v},${v - 6})`; g.fillRect(x + 3, y + 3, w - 6, h - 6);
        const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, 'rgba(255,255,255,0.10)'); gr.addColorStop(1, 'rgba(0,0,0,0.25)');
        g.fillStyle = gr; g.fillRect(x + 3, y + 3, w - 6, h - 6);
        for (let k = 0; k < 40; k++) { g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.06)'; g.fillRect(x + r() * w, y + r() * h, 1 + r() * 3, 1 + r() * 2); }
        x += w;
      }
      y += h;
    }
    return { map: tex(c, null), bump: tex(c, null, false) };
  };

  // ----- Madera oscura en vertical (zócalo y paneles) -----
  T.wood = (seed = 3, base = '#3a2415') => {
    const W = 512, c = mk(W, W), g = c.getContext('2d'), r = rng(seed);
    const n = 6, pw = W / n;
    for (let i = 0; i < n; i++) {
      g.fillStyle = base; g.fillRect(i * pw, 0, pw, W);
      g.fillStyle = `rgba(${r() < 0.5 ? '255,200,140' : '0,0,0'},${0.04 + r() * 0.06})`; g.fillRect(i * pw, 0, pw, W);
    }
    g.save(); g.translate(W, 0); g.rotate(Math.PI / 2);
    for (let i = 0; i < n; i++) grain(g, 0, i * pw, W, pw, r, 0.25, 0.07, 16);
    g.restore();
    g.fillStyle = 'rgba(0,0,0,0.65)'; for (let i = 0; i <= n; i++) g.fillRect(i * pw - 1.5, 0, 3, W);
    return { map: tex(c, null), bump: tex(c, null, false) };
  };

  // ----- Frente de la barra: paneles tallados -----
  T.barFront = () => {
    const W = 2048, H = 320, c = mk(W, H), g = c.getContext('2d'), r = rng(19);
    g.fillStyle = '#35200f'; g.fillRect(0, 0, W, H);
    grain(g, 0, 0, W, H, r, 0.28, 0.08, 70);
    const n = 7, pw = W / n;
    for (let i = 0; i < n; i++) {
      const x = i * pw + 22, w = pw - 44, y = 26, h = H - 52;
      // marco en relieve
      g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(x - 6, y - 6, w + 12, h + 12);
      g.fillStyle = '#4a2e18'; g.fillRect(x, y, w, h);
      g.fillStyle = '#2b1a0d'; g.fillRect(x + 14, y + 14, w - 28, h - 28);
      grain(g, x + 14, y + 14, w - 28, h - 28, r, 0.2, 0.05, 14);
      // tallado: rombo con volutas
      g.strokeStyle = 'rgba(190,140,80,0.55)'; g.lineWidth = 3; g.lineCap = 'round';
      const cx = x + w / 2, cy = y + h / 2;
      g.beginPath(); g.moveTo(cx, y + 28); g.lineTo(x + w - 30, cy); g.lineTo(cx, y + h - 28); g.lineTo(x + 30, cy); g.closePath(); g.stroke();
      for (const s of [-1, 1]) {
        g.beginPath(); g.arc(cx + s * 62, cy, 22, s > 0 ? Math.PI : 0, s > 0 ? Math.PI * 3.1 : Math.PI * 2.1); g.stroke();
        g.beginPath(); g.moveTo(cx + s * 40, cy - 40); g.quadraticCurveTo(cx + s * 100, cy - 50, cx + s * 96, cy - 4); g.stroke();
        g.beginPath(); g.moveTo(cx + s * 40, cy + 40); g.quadraticCurveTo(cx + s * 100, cy + 50, cx + s * 96, cy + 4); g.stroke();
      }
      g.beginPath(); g.arc(cx, cy, 10, 0, 6.28); g.stroke();
    }
    return { map: tex(c, null), bump: tex(c, null, false) };
  };

  // ----- Alfombra -----
  T.rug = () => {
    const W = 512, H = 384, c = mk(W, H), g = c.getContext('2d'), r = rng(23);
    g.fillStyle = '#6a2418'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#2d1a10'; g.fillRect(14, 14, W - 28, H - 28);
    g.fillStyle = '#8a3a22'; g.fillRect(26, 26, W - 52, H - 52);
    g.strokeStyle = '#c9a15a'; g.lineWidth = 4; g.strokeRect(36, 36, W - 72, H - 72);
    g.strokeStyle = '#4a1a10'; g.lineWidth = 3;
    for (let i = 0; i < 5; i++) { const q = 60 + i * 24; g.strokeRect(q, q * 0.75 + 12, W - 2 * q, H - 1.5 * q - 24); }
    const cx = W / 2, cy = H / 2;
    g.fillStyle = '#b8863d'; g.beginPath(); g.moveTo(cx, cy - 80); g.lineTo(cx + 110, cy); g.lineTo(cx, cy + 80); g.lineTo(cx - 110, cy); g.closePath(); g.fill();
    g.fillStyle = '#5a1d12'; g.beginPath(); g.moveTo(cx, cy - 56); g.lineTo(cx + 76, cy); g.lineTo(cx, cy + 56); g.lineTo(cx - 76, cy); g.closePath(); g.fill();
    g.fillStyle = '#c9a15a'; g.beginPath(); g.arc(cx, cy, 14, 0, 6.28); g.fill();
    for (let i = 0; i < 9000; i++) { g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.18)' : 'rgba(255,200,150,0.07)'; g.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 2); }
    // flecos
    g.fillStyle = '#d9c9a8'; for (let x = 0; x < W; x += 6) { g.fillRect(x, 0, 2, 7); g.fillRect(x, H - 7, 2, 7); }
    return tex(c, null);
  };

  // ----- Runas brillantes (placa de la campana de la chimenea). Se dibujan con trazos propios -----
  const GLYPHS = [
    [[[.3, 0], [.3, 1]], [[.3, .1], [.8, .35], [.3, .6]]],
    [[[.2, 0], [.2, 1]], [[.2, .15], [.75, .4]], [[.2, .55], [.75, .8]]],
    [[[.5, 0], [.5, 1]], [[.5, .2], [.1, .5]], [[.5, .2], [.9, .5]]],
    [[[.25, 0], [.25, 1]], [[.25, 0], [.8, .3], [.25, .6]]],
    [[[.15, 0], [.85, 1]], [[.85, 0], [.15, 1]]],
    [[[.5, 0], [.1, .5], [.5, 1], [.9, .5], [.5, 0]]],
    [[[.3, 0], [.3, 1]], [[.3, .5], [.8, 0]], [[.3, .5], [.8, 1]]],
    [[[.5, 0], [.5, 1]], [[.15, .25], [.5, .5], [.85, .25]]],
    [[[.2, 0], [.2, 1]], [[.2, 0], [.8, .5], [.2, 1]]],
    [[[.5, 0], [.5, 1]], [[.1, .3], [.5, .15], [.9, .3]], [[.1, .75], [.5, .6], [.9, .75]]],
  ];
  T.runes = (lines = 2, perLine = 6, seed = 4) => {
    const W = 1024, H = 512, c = mk(W, H), g = c.getContext('2d'), r = rng(seed);
    g.clearRect(0, 0, W, H);
    g.lineCap = 'round'; g.lineJoin = 'round';
    const cw = W / perLine, ch = H / lines;
    for (let j = 0; j < lines; j++) for (let i = 0; i < perLine; i++) {
      const gl = GLYPHS[(r() * GLYPHS.length) | 0];
      const x0 = i * cw + cw * 0.22, w = cw * 0.56, y0 = j * ch + ch * 0.14, h = ch * 0.72;
      for (const [blur, lw, col] of [[34, 16, 'rgba(255,110,20,0.8)'], [14, 11, 'rgba(255,160,60,1)'], [0, 6, 'rgba(255,225,160,1)']]) {
        g.shadowBlur = blur; g.shadowColor = '#ff7a1a'; g.strokeStyle = col; g.lineWidth = lw;
        for (const pl of gl) { g.beginPath(); pl.forEach(([px, py], k) => (k ? g.lineTo(x0 + px * w, y0 + py * h) : g.moveTo(x0 + px * w, y0 + py * h))); g.stroke(); }
      }
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
  };

  // ----- Llama (varias formas) y brillo circular -----
  T.flame = (seed = 1) => {
    const W = 128, H = 256, c = mk(W, H), g = c.getContext('2d'), r = rng(seed * 97);
    g.filter = 'blur(4px)';
    // gota con la punta torcida; se apilan capas del borde (naranja rojizo) al centro (amarillo casi blanco)
    const drop = (cx, base, tip, w, bend, fill) => {
      g.fillStyle = fill; g.beginPath(); g.moveTo(cx - w, base);
      g.bezierCurveTo(cx - w * 1.15, base - (base - tip) * 0.45, cx - w * 0.25 + bend * 0.4, tip + (base - tip) * 0.3, cx + bend, tip);
      g.bezierCurveTo(cx + w * 0.3 + bend * 0.5, tip + (base - tip) * 0.3, cx + w * 1.15, base - (base - tip) * 0.45, cx + w, base);
      g.quadraticCurveTo(cx, base + w * 0.7, cx - w, base); g.fill();
    };
    const lobes = 2 + ((r() * 2) | 0);
    for (let l = 0; l < lobes; l++) {
      const cx = W / 2 + (l - (lobes - 1) / 2) * 24 + (r() - 0.5) * 8, tip = 24 + r() * 70 + (l % 2) * 26, w = 24 + r() * 10, bend = (r() - 0.5) * 26, base = H - 40;
      drop(cx, base, tip, w, bend, 'rgba(210,50,10,0.55)');
      drop(cx, base, tip + (base - tip) * 0.18, w * 0.8, bend * 0.8, 'rgba(255,100,15,0.75)');
      drop(cx, base, tip + (base - tip) * 0.42, w * 0.58, bend * 0.5, 'rgba(255,170,40,0.85)');
      drop(cx, base, tip + (base - tip) * 0.66, w * 0.34, bend * 0.2, 'rgba(255,225,130,0.9)');
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  T.glow = (inner = 'rgba(255,190,110,1)', mid = 'rgba(255,120,40,0.35)') => {
    const S = 128, c = mk(S, S), g = c.getContext('2d');
    const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, inner); gr.addColorStop(0.25, mid); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  // ----- Paño (tapiz) con dibujo sencillo -----
  T.tapestry = (main = '#6b1f1a', trim = '#c9a15a', seed = 2) => {
    const W = 256, H = 512, c = mk(W, H), g = c.getContext('2d'), r = rng(seed);
    g.fillStyle = main; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 4000; i++) { g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.18)' : 'rgba(255,220,180,0.06)'; g.fillRect(r() * W, r() * H, 1 + r() * 2, 2 + r() * 4); }
    g.strokeStyle = trim; g.lineWidth = 6; g.strokeRect(14, 14, W - 28, H - 28);
    g.lineWidth = 2; g.strokeRect(26, 26, W - 52, H - 52);
    // triángulo con ojo y rayas: emblema propio del cazador
    g.lineWidth = 7; g.beginPath(); g.moveTo(W / 2, 150); g.lineTo(W - 70, 330); g.lineTo(70, 330); g.closePath(); g.stroke();
    g.beginPath(); g.arc(W / 2, 270, 26, 0, 6.28); g.stroke();
    g.beginPath(); g.arc(W / 2, 270, 8, 0, 6.28); g.fillStyle = trim; g.fill();
    for (let i = 0; i < 5; i++) { g.fillRect(40 + i * 40, H - 80, 6, 40); }
    return tex(c, null);
  };
})();
