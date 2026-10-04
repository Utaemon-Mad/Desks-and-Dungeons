// Generador del mundo abierto: un mapa por sala (siempre el mismo para la misma sala), con el pueblo de la
// taberna, bosques, lagos, montañas, caminos, cuevas que llevan a las mazmorras y zonas con enemigos.
const W = 80, H = 56;

// Generador pseudoaleatorio con semilla (mulberry32)
function seeded(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Ruido de valor suave (varias octavas)
function noiseField(rand, w, h, scale) {
  const gw = Math.ceil(w / scale) + 2, gh = Math.ceil(h / scale) + 2;
  const grid = Array.from({ length: gw * gh }, () => rand());
  const sm = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const gx = x / scale, gy = y / scale;
    const x0 = Math.floor(gx), y0 = Math.floor(gy);
    const tx = sm(gx - x0), ty = sm(gy - y0);
    const g = (i, j) => grid[(j % gh) * gw + (i % gw)];
    const a = g(x0, y0) + (g(x0 + 1, y0) - g(x0, y0)) * tx;
    const b = g(x0, y0 + 1) + (g(x0 + 1, y0 + 1) - g(x0, y0 + 1)) * tx;
    return a + (b - a) * ty;
  };
}

function generate(roomName) {
  const rand = seeded('world:' + roomName);
  const ri = (a, b) => a + Math.floor(rand() * (b - a + 1));
  const n1 = noiseField(rand, W, H, 14), n2 = noiseField(rand, W, H, 6), m1 = noiseField(rand, W, H, 11), m2 = noiseField(rand, W, H, 4);
  const t = new Array(W * H);
  const set = (x, y, ch) => { if (x >= 0 && y >= 0 && x < W && y < H) t[y * W + x] = ch; };
  const get = (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? t[y * W + x] : 'M');

  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    // borde de montañas para cerrar el mapa
    const edge = Math.min(x, y, W - 1 - x, H - 1 - y);
    const e = n1(x, y) * 0.7 + n2(x, y) * 0.3 + (edge < 3 ? (3 - edge) * 0.18 : 0);
    const m = m1(x, y) * 0.7 + m2(x, y) * 0.3;
    let ch;
    if (edge === 0) ch = 'M';
    else if (e < 0.3) ch = 'w';
    else if (e < 0.34) ch = 's';
    else if (e > 0.8) ch = 'M';
    else if (e > 0.69) ch = m > 0.55 ? 'P' : 'h';
    else if (m > 0.62) ch = rand() < 0.72 ? 'T' : ';';
    else if (m > 0.52) ch = rand() < 0.22 ? 'T' : ';';
    else ch = rand() < 0.04 ? 'T' : ',';
    t[y * W + x] = ch;
  }

  // Pueblo cerca del centro
  const town = { x: Math.floor(W / 2) + ri(-6, 6), y: Math.floor(H / 2) + ri(-4, 4) };
  for (let dy = -4; dy <= 4; dy++) for (let dx = -5; dx <= 5; dx++) set(town.x + dx, town.y + dy, ',');
  for (const [dx, dy] of [[-3, -2], [3, -2], [-3, 2], [3, 2], [-4, 0], [4, 0]]) set(town.x + dx, town.y + dy, 'k');
  for (let dx = -5; dx <= 5; dx++) set(town.x + dx, town.y, '=');
  for (let dy = -4; dy <= 4; dy++) set(town.x, town.y + dy, '=');
  set(town.x, town.y, 'H');

  const far = (p, min) => Math.hypot(p.x - town.x, p.y - town.y) >= min;
  // Busca una casilla que cumpla la condición y esté lejos del pueblo (si no hay, la más lejana que la cumpla)
  const used = [];
  const pick = (test, min) => {
    let best = null, bestD = -1;
    for (let i = 0; i < 4000; i++) {
      const p = { x: ri(4, W - 5), y: ri(4, H - 5) };
      if (!test(get(p.x, p.y), p) || used.some((u) => Math.hypot(u.x - p.x, u.y - p.y) < 7)) continue;
      const d = Math.hypot(p.x - town.x, p.y - town.y);
      if (d >= min) { used.push(p); return p; }
      if (d > bestD) { bestD = d; best = p; }
    }
    const p = best || { x: ri(6, W - 7), y: ri(6, H - 7) };
    used.push(p);
    return p;
  };
  const clearArea = (c, r, ch = ',') => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (Math.hypot(dx, dy) <= r + 0.3) set(c.x + dx, c.y + dy, ch); };

  const groups = [];
  const labels = [{ x: town.x, y: town.y - 5, text: 'Pueblo' }];
  const caves = [];

  // Zonas de enemigos
  const goblinCamp = pick((ch) => ch === 'T' || ch === ';', 14);
  clearArea(goblinCamp, 3); set(goblinCamp.x, goblinCamp.y, 'F');
  groups.push({ lvl: 1, spawn: [['goblin-warrior', -2, -1], ['goblin-archer', 2, 1], ['goblin-minion', -1, 2], ['goblin-minion', 1, -2], ['goblin-shaman', 0, 2]].map(([k, dx, dy]) => ({ k, x: goblinCamp.x + dx, y: goblinCamp.y + dy })) });
  labels.push({ x: goblinCamp.x, y: goblinCamp.y - 4, text: 'Campamento goblin' });

  const orcFort = pick((ch) => ch === 'h' || ch === 'P', 18);
  clearArea(orcFort, 4, 'h');
  for (let a = 0; a < 24; a++) { const ang = a / 24 * Math.PI * 2; if (a % 6 === 0) continue; set(Math.round(orcFort.x + Math.cos(ang) * 4), Math.round(orcFort.y + Math.sin(ang) * 4), 'R'); }
  set(orcFort.x, orcFort.y, 'F');
  groups.push({ lvl: 5, spawn: [['orc', -2, 0], ['orc', 2, 0], ['orc-archer', 0, -2], ['orc-war-chief', 0, 2], ['orc-shaman', -2, 2]].map(([k, dx, dy]) => ({ k, x: orcFort.x + dx, y: orcFort.y + dy })) });
  labels.push({ x: orcFort.x, y: orcFort.y - 6, text: 'Fuerte orco' });

  const grave = pick((ch) => ch === ',' || ch === ';' || ch === 'h', 16);
  clearArea(grave, 4, 'g');
  for (let i = 0; i < 14; i++) { const dx = ri(-3, 3), dy = ri(-3, 3); if ((dx + dy) % 2 === 0 && (dx || dy)) set(grave.x + dx, grave.y + dy, 't'); }
  groups.push({ lvl: 4, spawn: [['skeleton', -2, -1], ['skeleton-archer', 2, -1], ['zombie', -1, 2], ['zombie', 1, 2], ['ghoul', 0, 0], ['wight', 0, -3]].map(([k, dx, dy]) => ({ k, x: grave.x + dx, y: grave.y + dy })) });
  labels.push({ x: grave.x, y: grave.y - 5, text: 'Cementerio' });

  const den = pick((ch) => ch === 'T', 12);
  clearArea(den, 2, ';');
  groups.push({ lvl: 2, spawn: [['wolf', -1, 0], ['wolf', 1, 0], ['wolf', 0, 1], ['dire-wolf', 0, -1]].map(([k, dx, dy]) => ({ k, x: den.x + dx, y: den.y + dy })) });
  labels.push({ x: den.x, y: den.y - 3, text: 'Guarida de lobos' });

  const nest = pick((ch) => ch === 'T', 15);
  clearArea(nest, 2, ';');
  groups.push({ lvl: 3, spawn: [['giant-spider', -1, 0], ['giant-spider', 1, 1], ['giant-spider', 0, -1]].map(([k, dx, dy]) => ({ k, x: nest.x + dx, y: nest.y + dy })) });
  labels.push({ x: nest.x, y: nest.y - 3, text: 'Nido de arañas' });

  const bandits = pick((ch) => ch === ',' || ch === ';', 10);
  clearArea(bandits, 2); set(bandits.x, bandits.y, 'F');
  groups.push({ lvl: 2, spawn: [['bandit', -1, -1], ['bandit-archer', 1, -1], ['bandit', -1, 1], ['bandit-captain', 1, 1]].map(([k, dx, dy]) => ({ k, x: bandits.x + dx, y: bandits.y + dy })) });
  labels.push({ x: bandits.x, y: bandits.y - 3, text: 'Campamento bandido' });

  const lair = pick((ch, p) => (ch === 'M' || ch === 'P' || ch === 'h') && Math.min(p.x, p.y, W - 1 - p.x, H - 1 - p.y) > 3, 28);
  clearArea(lair, 3, 'h'); set(lair.x, lair.y, 'D');
  groups.push({ lvl: 10, spawn: [{ k: 'young-red-dragon', x: lair.x, y: lair.y + 1 }] });
  labels.push({ x: lair.x, y: lair.y - 4, text: 'Guarida del dragón' });

  // Bestias sueltas
  for (let i = 0; i < 4; i++) {
    const p = pick((ch) => ch === ',' || ch === ';', 9);
    groups.push({ lvl: 2 + i, spawn: [{ k: i % 2 ? 'wolf' : 'brown-bear', x: p.x, y: p.y }] });
  }
  const owl = pick((ch) => ch === 'T', 18);
  clearArea(owl, 1, ';');
  groups.push({ lvl: 6, spawn: [{ k: 'owlbear', x: owl.x, y: owl.y }] });

  // Cuevas: una mazmorra aleatoria de cada tema, cada vez más difícil cuanto más lejos del pueblo
  const CAVES = [['cuevas', 1, 10], ['nido', 3, 14], ['cripta', 4, 16], ['fortaleza', 6, 20], ['volcan', 9, 24]];
  const THEME_NAMES = { cuevas: 'Cuevas goblin', nido: 'Nido de bestias', cripta: 'Cripta', fortaleza: 'Fortaleza orca', volcan: 'Guarida del dragón' };
  for (const [theme, lvl, minD] of CAVES) {
    const p = pick((ch, q) => (ch === 'h' || ch === 'P') && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => get(q.x + dx, q.y + dy) !== 'M'), minD);
    clearArea(p, 1, 'h');
    set(p.x, p.y, 'C');
    caves.push({ x: p.x, y: p.y, theme, level: lvl });
    labels.push({ x: p.x, y: p.y - 2, text: `${THEME_NAMES[theme]} (nv ${lvl})` });
  }

  // Caminos del pueblo a cada lugar (A* barato; cruza agua con puentes y abre paso entre árboles)
  const cost = (ch) => ({ '=': 1, ',': 2, ';': 2.5, s: 2.5, h: 3, g: 2, T: 5, P: 6, w: 9, v: 6, M: 30, R: 50, k: 99, t: 50, F: 99, C: 1, D: 1, H: 1, b: 1 }[ch] || 3);
  function road(a, b) {
    const key = (x, y) => y * W + x;
    const dist = new Map([[key(a.x, a.y), 0]]), prev = new Map();
    const open = [[0, a.x, a.y]];
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
      const [, x, y] = open.splice(bi, 1)[0];
      if (x === b.x && y === b.y) break;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1) continue;
        const nd = dist.get(key(x, y)) + cost(get(nx, ny));
        if (!dist.has(key(nx, ny)) || nd < dist.get(key(nx, ny))) {
          dist.set(key(nx, ny), nd); prev.set(key(nx, ny), [x, y]);
          open.push([nd + Math.abs(nx - b.x) + Math.abs(ny - b.y), nx, ny]);
        }
      }
    }
    let cur = [b.x, b.y];
    while (prev.has(key(cur[0], cur[1]))) {
      const ch = get(cur[0], cur[1]);
      if (!'CDHFkRt'.includes(ch)) set(cur[0], cur[1], ch === 'w' || ch === 'v' ? 'b' : '=');
      cur = prev.get(key(cur[0], cur[1]));
    }
  }
  const near = (p) => ({ x: p.x, y: p.y + 3 });
  for (const p of [goblinCamp, near(orcFort), grave, den, bandits, ...caves, lair]) road(town, p);

  // Todo lo que haya quedado aislado (bestias en mitad del bosque…) se conecta con un camino
  const reachable = () => {
    const seen = new Uint8Array(W * H);
    const q = [[town.x, town.y + 1]];
    seen[(town.y + 1) * W + town.x] = 1;
    const walk = (ch) => !'TPwMRktF'.includes(ch);
    while (q.length) {
      const [x, y] = q.shift();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[ny * W + nx] || !walk(get(nx, ny))) continue;
        seen[ny * W + nx] = 1; q.push([nx, ny]);
      }
    }
    return seen;
  };
  let seen = reachable();
  for (const g of groups) {
    const s0 = g.spawn[0];
    if (!seen[s0.y * W + s0.x]) { road(town, s0); seen = reachable(); }
  }

  // agua poco profunda junto a las orillas (vados)
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (get(x, y) === 'w' && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => get(x + dx, y + dy) === 's') && rand() < 0.35) set(x, y, 'v');
  }

  return {
    id: 'world', name: 'Las Tierras Oscuras', kind: 'world', w: W, h: H,
    tiles: t.join(''), start: { x: town.x, y: town.y + 1 }, town,
    objects: [{ k: 'start', x: town.x, y: town.y + 1 }],
    groups, caves, labels,
  };
}

module.exports = { generate, W, H };
