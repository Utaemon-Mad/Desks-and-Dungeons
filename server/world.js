// Generador del mundo abierto (uno por sala, siempre igual para la misma sala): el pueblo de Brumaverde en el
// centro y, alrededor, seis zonas cada vez más peligrosas: valle, bosque, ciénaga, yermo, picos helados y erial
// de ceniza. Cada zona tiene su terreno, su campamento con piedra de viaje y gente con misiones, sus enemigos,
// su jefe, lugares con nombre y una cueva hacia una mazmorra de su nivel.
const RULES = require('../public/rules/engine.js');

const W = 160, H = 120;
const RINGS = [17, 30, 42, 54, 66]; // radio (con ruido) donde empieza cada zona

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

// Casillas por las que se anda (para comprobar que todo se puede alcanzar)
const BLOCK = new Set(['T', 'P', 'w', 'M', 'R', 'k', 't', 'F', 'x', 'q', 'y', 'o', 'c', 'p', 'e', 'l']);
const walk = (ch) => !BLOCK.has(ch);
const FLOOR = [',', ',', 'm', 'd', 'n', 'a']; // suelo limpio de cada zona

// Gente del mundo
const NPCS = {
  alcalde: { name: 'Alcalde Brumo', look: { cls: 'paladin', sex: 'm', hs: 'barba', skin: 1, hair: 4, beard: '#d8d8d8', gear: { pecho: 'tela' }, color: '#5a2a5a' }, lines: ['Bienvenido a Brumaverde. Desde que el cielo del sur se volvió rojo, nada va bien.', 'Las piedras de viaje te llevan de campamento en campamento. Tócalas para recordarlas.'] },
  jacinta: { name: 'Jacinta la granjera', look: { cls: 'sacerdote', sex: 'f', hs: 'coleta', skin: 2, hair: 2, gear: { pecho: 'tela' }, color: '#7a5a2a' }, lines: ['¡Un aventurero! Por fin alguien que no huye de los goblins.'] },
  tilda: { name: 'Tilda la buhonera', shop: 'bruja', look: { cls: 'picaro', sex: 'f', hs: 'melena', skin: 0, hair: 3, gear: { pecho: 'cuero' }, color: '#6a3a2a' }, lines: ['Pociones de Madre Zarza, a precio de pueblo. ¿Qué te pongo?'] },
  ewan: { name: 'Ewan el leñador', look: { cls: 'guerrero', sex: 'm', hs: 'barba', skin: 2, hair: 1, beard: '#6b4226', gear: { w: 'hacha', pecho: 'cuero' } }, lines: ['El bosque cruje de noche. No son los árboles.'] },
  bran: { name: 'Bran el cazador', look: { cls: 'explorador', skin: 3, hair: 0, gear: { w: 'arco', pecho: 'cuero', casco: 'cuero' } }, lines: ['He seguido el rastro del Alfa tres lunas. Es más listo que un lobo.'] },
  morwen: { name: 'Abuela Morwen', look: { cls: 'druida', sex: 'f', hs: 'capucha', species: 'elf', skin: 14, hair: 4, gear: { w: 'baston', pecho: 'tela' }, color: '#2a3a2a' }, lines: ['Siéntate, criatura. La ciénaga habla, si sabes escuchar.'] },
  rhys: { name: 'Capitán Rhys', look: { cls: 'paladin', skin: 3, hair: 0, gear: { w: 'espada', o: 'escudo', pecho: 'placas', casco: 'placas' } }, lines: ['Fuerte del Desierto. Aquí aguantamos lo que baja del sur.'] },
  tor: { name: 'Tor el ermitaño', look: { cls: 'sacerdote', sex: 'm', hs: 'calvo', species: 'dwarf', skin: 1, hair: 4, beard: '#e8e8e8', gear: { w: 'baston', pecho: 'tela', casco: 'tela' }, color: '#5a6a7a' }, lines: ['El viento de los picos trae voces. Últimamente, gritos.'] },
  selene: { name: 'Selene, la Última Vigía', look: { cls: 'paladin', sex: 'f', hs: 'melena', species: 'elf', skin: 0, hair: 3, gear: { w: 'espadon', pecho: 'placas', casco: 'placas' }, set: 'paladin' }, lines: ['Llevo años vigilando la guarida. Ignaroth despierta un poco más cada noche.'] },
  buhonero: { name: 'Buhonero', shop: 'bruja', look: { cls: 'picaro', skin: 2, hair: 1, gear: { pecho: 'cuero', casco: 'tela' }, color: '#4a3a2a' }, lines: ['Pociones, vendas, de todo. Aquí lejos, de todo vale el doble... pero te hago precio.'] },
};

const OUTPOSTS = [
  null,
  { name: 'Campamento del Leñador', npcs: ['ewan', 'bran'] },
  { name: 'Aldea de Juncos', npcs: ['morwen'] },
  { name: 'Fuerte del Desierto', npcs: ['rhys'] },
  { name: 'Refugio de Montaña', npcs: ['tor'] },
  { name: 'La Última Vigía', npcs: ['selene'] },
];
const CAVES = [['cuevas', 2], ['nido', 5], ['cripta', 8], ['fortaleza', 12], ['fortaleza', 17], ['volcan', 23]];
const BOSS_PLACES = ['Campamento de Rufo', 'Claro del Huargo', 'Choza de Ortiga', 'Dunas del Rey Escorpión', 'Cumbre del Gigante', 'Guarida de Ignaroth'];
const EXTRA_PLACES = [['Granja de Jacinta'], ['Nido de arañas'], ['Templo hundido'], ['Oasis perdido'], ['Paso de la Ventisca'], ['Altar de la Llama']];

function generate(roomName) {
  const rand = RULES.seeded('world2:' + roomName);
  const ri = (a, b) => a + Math.floor(rand() * (b - a + 1));
  const n1 = noiseField(rand, W, H, 16), n2 = noiseField(rand, W, H, 6), n3 = noiseField(rand, W, H, 3.2), nz = noiseField(rand, W, H, 11);
  const t = new Array(W * H);
  const zone = new Uint8Array(W * H);
  const set = (x, y, ch) => { if (x > 0 && y > 0 && x < W - 1 && y < H - 1) t[y * W + x] = ch; };
  const get = (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? t[y * W + x] : 'M');
  const town = { x: W >> 1, y: H >> 1 };
  const zoneAt = (x, y) => {
    const d = Math.hypot(x - town.x, (y - town.y) * 1.33) + (nz(x, y) - 0.5) * 16;
    let z = 0;
    while (z < RINGS.length && d >= RINGS[z]) z++;
    return z;
  };

  // ---------- Terreno ----------
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const z = zoneAt(x, y);
    zone[y * W + x] = z;
    const v = n1(x, y) * 0.65 + n2(x, y) * 0.35, d2 = n3(x, y);
    let ch;
    switch (z) {
      case 0: ch = v < 0.27 ? 'w' : v < 0.3 ? 's' : d2 > 0.8 ? 'T' : d2 > 0.7 ? ';' : ','; break;
      case 1: ch = v < 0.24 ? 'w' : d2 > 0.42 ? (rand() < 0.6 ? 'T' : 'P') : d2 > 0.32 ? ';' : ','; break;
      case 2: ch = v < 0.4 ? 'q' : v < 0.45 ? 'r' : d2 > 0.8 ? 'y' : d2 < 0.12 ? ';' : 'm'; break;
      case 3: ch = v > 0.8 ? 'M' : d2 > 0.88 ? 'o' : d2 < 0.06 ? 'c' : v < 0.36 ? 'z' : 'd'; break;
      case 4: ch = v > 0.72 ? 'M' : d2 > 0.78 ? 'p' : v < 0.3 ? 'i' : 'n'; break;
      default: ch = v < 0.3 ? 'l' : d2 > 0.84 ? 'e' : 'a';
    }
    if (Math.min(x, y, W - 1 - x, H - 1 - y) < 2) ch = 'M';
    t[y * W + x] = ch;
  }
  const clearArea = (c, r, ch) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (Math.hypot(dx, dy) <= r + 0.3) set(c.x + dx, c.y + dy, ch || FLOOR[zone[(c.y + dy) * W + c.x + dx]] || ','); };

  // ---------- Pueblo de Brumaverde ----------
  clearArea(town, 7, ',');
  for (let dx = -7; dx <= 7; dx++) set(town.x + dx, town.y, '=');
  for (let dy = -6; dy <= 6; dy++) set(town.x, town.y + dy, '=');
  for (const [dx, dy] of [[-4, -3], [4, -3], [-4, 3], [4, 3], [-6, -1], [6, 1], [-2, -5], [2, 5]]) set(town.x + dx, town.y + dy, 'k');
  set(town.x, town.y, 'H');
  set(town.x + 2, town.y + 1, 'W');
  set(town.x - 2, town.y + 1, 'F');

  const labels = [{ x: town.x, y: town.y - 8, text: 'Brumaverde' }];
  const npcs = [];
  const waystones = [{ id: 'brumaverde', name: 'Brumaverde', x: town.x + 2, y: town.y + 1, zone: 0 }];
  const addNpc = (id, x, y) => { set(x, y, FLOOR[zone[y * W + x]] === 'm' ? 'u' : get(x, y) === '=' ? '=' : FLOOR[zone[y * W + x]]); npcs.push({ id, ...NPCS[id], x, y }); };
  addNpc('alcalde', town.x + 1, town.y - 2);
  addNpc('tilda', town.x - 1, town.y + 2);

  // Busca una casilla en una zona (lejos de lo ya usado)
  const used = [{ x: town.x, y: town.y, r: 10 }];
  const pickIn = (z, test = () => true, minGap = 8, prefer) => {
    for (let i = 0; i < 6000; i++) {
      const p = prefer && i < 2000 ? { x: prefer.x + ri(-8, 8), y: prefer.y + ri(-8, 8) } : { x: ri(5, W - 6), y: ri(5, H - 6) };
      if (p.x < 5 || p.y < 5 || p.x > W - 6 || p.y > H - 6) continue;
      if (zone[p.y * W + p.x] !== z || !test(get(p.x, p.y), p)) continue;
      if (used.some((u) => Math.hypot(u.x - p.x, u.y - p.y) < Math.max(minGap, u.r || 0))) continue;
      return p;
    }
    return null;
  };

  // ---------- Campamentos con piedra de viaje ----------
  const outposts = [];
  const base = rand() * Math.PI * 2;
  for (let z = 1; z <= 5; z++) {
    const ang = base + z * 1.25;
    const r = (RINGS[z - 1] + (RINGS[z] || 78)) / 2;
    const guess = { x: Math.round(town.x + Math.cos(ang) * r), y: Math.round(town.y + Math.sin(ang) * r / 1.33) };
    const p = pickIn(z, () => true, 14, guess) || pickIn(z, () => true, 6);
    if (!p) continue;
    used.push({ ...p, r: 12 });
    clearArea(p, 4, z === 2 ? 'u' : undefined);
    set(p.x, p.y, 'W');
    set(p.x - 2, p.y + 1, 'F');
    for (const [dx, dy] of [[-3, -2], [3, -2], [3, 2]]) set(p.x + dx, p.y + dy, 'k');
    const O = OUTPOSTS[z];
    waystones.push({ id: 'ws' + z, name: O.name, x: p.x, y: p.y, zone: z });
    labels.push({ x: p.x, y: p.y - 5, text: O.name });
    O.npcs.forEach((id, i) => addNpc(id, p.x + 1 + i, p.y - 1));
    addNpc('buhonero', p.x - 1, p.y + 2);
    outposts.push({ z, ...p });
  }

  // ---------- Lugares: guaridas de los jefes, cuevas y sitios con nombre ----------
  const groups = [];
  const caves = [];
  const bossSpots = [];
  for (let z = 0; z < 6; z++) {
    const Z = RULES.ZONES[z];
    const p = pickIn(z, (ch) => walk(ch), 10);
    if (p) {
      used.push({ ...p, r: 8 });
      clearArea(p, 3);
      if (z === 5) set(p.x, p.y - 2, 'D');
      if (z === 0) { set(p.x, p.y - 1, 'F'); for (const [dx, dy] of [[-2, -2], [2, -2]]) set(p.x + dx, p.y + dy, 'k'); }
      bossSpots.push({ z, ...p });
      labels.push({ x: p.x, y: p.y - 4, text: BOSS_PLACES[z] });
      groups.push({ lvl: Z.lv[1] + 1, boss: true, spawn: [{ k: Z.boss, x: p.x, y: p.y }] });
    }
    const [theme, lvl] = CAVES[z];
    const c = pickIn(z, (ch, q) => walk(ch) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => ['M', 'P', 'T', 'o', 'e', 'p'].includes(get(q.x + dx, q.y + dy))), 9)
      || pickIn(z, (ch) => walk(ch), 9);
    if (c) {
      used.push({ ...c, r: 6 });
      set(c.x, c.y, 'C');
      set(c.x, c.y + 1, FLOOR[z]);
      caves.push({ x: c.x, y: c.y, theme, level: lvl });
      labels.push({ x: c.x, y: c.y - 2, text: `${RULES.THEMES[theme].name} (nv ${lvl})` });
    }
    const e = pickIn(z, (ch) => walk(ch), 10);
    if (e) {
      used.push({ ...e, r: 6 });
      const name = EXTRA_PLACES[z][0];
      if (z === 0) { // la granja de Jacinta: cultivos y una valla
        for (let dy = -2; dy <= 2; dy++) for (let dx = -3; dx <= 3; dx++) set(e.x + dx, e.y + dy, Math.abs(dy) === 2 || Math.abs(dx) === 3 ? (dx === 0 ? ',' : 'x') : 'f');
        addNpc('jacinta', e.x, e.y + 3);
      } else if (z === 2) { clearArea(e, 2, 'u'); for (const [dx, dy] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) set(e.x + dx, e.y + dy, 'R'); }
      else if (z === 3) { clearArea(e, 2, 'w'); set(e.x - 3, e.y, 'T'); set(e.x + 3, e.y, 'T'); set(e.x, e.y - 3, 'T'); }
      else if (z === 5) { clearArea(e, 2); set(e.x, e.y, 'R'); }
      else clearArea(e, 2);
      labels.push({ x: e.x, y: e.y - 4, text: name });
      if (z === 1) groups.push({ lvl: 5, spawn: [-1, 0, 1].map((dx) => ({ k: 'giant-spider', x: e.x + dx, y: e.y + 1 })) });
    }
  }

  // ---------- Caminos (A* que prefiere el terreno fácil y tiende puentes) ----------
  const cost = (ch) => ({ '=': 1, ',': 2, ';': 2.5, s: 2.5, f: 3, m: 3, r: 3, d: 2.5, z: 2.5, n: 3, i: 3, a: 2.5, u: 1, h: 3, T: 6, P: 7, y: 6, p: 7, w: 9, q: 8, l: 14, o: 9, c: 9, e: 9, M: 40, R: 60, k: 99, t: 60, F: 99, x: 99, C: 1, D: 1, H: 1, W: 1, b: 1 }[ch] || 3);
  function road(a, b) {
    const key = (x, y) => y * W + x;
    const dist = new Map([[key(a.x, a.y), 0]]), prev = new Map();
    const open = [[0, a.x, a.y]];
    let steps = 0;
    while (open.length && steps++ < 60000) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
      const [, x, y] = open.splice(bi, 1)[0];
      if (x === b.x && y === b.y) break;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 2 || ny < 2 || nx >= W - 2 || ny >= H - 2) continue;
        const nd = dist.get(key(x, y)) + cost(get(nx, ny));
        if (!dist.has(key(nx, ny)) || nd < dist.get(key(nx, ny))) {
          dist.set(key(nx, ny), nd); prev.set(key(nx, ny), [x, y]);
          open.push([nd + (Math.abs(nx - b.x) + Math.abs(ny - b.y)) * 1.5, nx, ny]);
        }
      }
    }
    let cur = [b.x, b.y];
    while (prev.has(key(cur[0], cur[1]))) {
      const ch = get(cur[0], cur[1]);
      if (!'CDHFkRtWx'.includes(ch)) set(cur[0], cur[1], ch === 'w' || ch === 'q' || ch === 'l' ? 'b' : '=');
      cur = prev.get(key(cur[0], cur[1]));
    }
  }
  const sorted = outposts.slice().sort((a, b) => a.z - b.z);
  let from = town;
  for (const o of sorted) { road(from, o); from = o; } // camino principal: de zona en zona
  for (const o of sorted) if (o.z <= 2) road(town, o);

  // Todo lo importante tiene que poder alcanzarse a pie
  const reachable = () => {
    const seen = new Uint8Array(W * H);
    const q = [town.y * W + town.x + W];
    seen[q[0]] = 1;
    for (let h = 0; h < q.length; h++) {
      const c = q[h], x = c % W, y = (c / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = (y + dy) * W + x + dx;
        if (seen[n] || !walk(t[n])) continue;
        seen[n] = 1; q.push(n);
      }
    }
    return seen;
  };
  let seen = reachable();
  for (const p of [...bossSpots, ...caves, ...npcs]) {
    if (!seen[p.y * W + p.x] && !seen[(p.y + 1) * W + p.x]) {
      const near = [town, ...outposts].sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
      road(near, { x: p.x, y: p.y + 1 });
      seen = reachable();
    }
  }

  // ---------- Grupos de enemigos por todo el mapa ----------
  const counts = [16, 22, 22, 22, 20, 18];
  for (let z = 0; z < 6; z++) {
    const Z = RULES.ZONES[z];
    for (let i = 0; i < counts[z]; i++) {
      const p = pickIn(z, (ch, q) => walk(ch) && seen[q.y * W + q.x] && ch !== 'W' && ch !== 'C' && Math.hypot(q.x - town.x, q.y - town.y) > 13 && !outposts.some((o) => Math.hypot(q.x - o.x, q.y - o.y) < 11), 7);
      if (!p) break;
      used.push({ ...p, r: 6 });
      const n = ri(2, 3) + (z >= 3 ? 1 : 0);
      const lvl = ri(Z.lv[0], Z.lv[1]);
      const elite = rand() < 0.1;
      const spawn = [];
      for (let k = 0; k < n; k++) spawn.push({ k: Z.mobs[Math.floor(rand() * Z.mobs.length)], x: p.x + ri(-1, 1), y: p.y + ri(-1, 1), elite: elite && k === 0 });
      groups.push({ lvl, spawn });
    }
  }

  // agua poco profunda junto a las orillas del valle y el bosque
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (get(x, y) === 'w' && zone[y * W + x] <= 1 && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => get(x + dx, y + dy) === 's') && rand() < 0.35) set(x, y, 'v');
  }

  // ---------- Hierbas para el herbolario: unas cuantas por zona ----------
  const herbs = [];
  const herbCounts = [14, 16, 16, 14, 14, 12];
  for (let z = 0; z < 6; z++) {
    for (let i = 0; i < herbCounts[z]; i++) {
      const p = pickIn(z, (ch, q) => walk(ch) && seen[q.y * W + q.x] && !'=bWCHuv'.includes(ch) && !herbs.some((h) => Math.abs(h.x - q.x) + Math.abs(h.y - q.y) < 4), 1);
      if (!p) break;
      herbs.push({ id: 'h' + herbs.length, x: p.x, y: p.y, zone: z });
    }
  }

  return {
    id: 'world', name: 'Las Tierras de Brumaverde', kind: 'world', w: W, h: H,
    tiles: t.join(''), zones: Array.from(zone).join(''), start: { x: town.x, y: town.y + 2 }, town,
    groups, caves, labels, npcs, waystones, herbs,
    safe: [{ x: town.x, y: town.y, r: 9 }, ...outposts.map((o) => ({ x: o.x, y: o.y, r: 6 }))],
  };
}

module.exports = { generate, W, H, NPCS };
