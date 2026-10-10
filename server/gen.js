// Generador de mazmorras aleatorias: salas unidas por pasillos, decorado según el tema, grupos de enemigos
// del nivel elegido, cofres, trampas y la sala del jefe en el punto más lejano de la entrada.
const RULES = require('../public/rules/engine.js');

const W = 46, H = 34;

// Decorado: bloquea (b) o no; wall = va en la cara de un muro
const PROPS = {
  pillar: { b: 1 }, statue: { b: 1 }, sarcophagus: { b: 1 }, coffin: { b: 1 }, tomb: { b: 1 }, altar: { b: 1 },
  barrel: { b: 1 }, crate: { b: 1 }, table: { b: 1 }, brazier: { b: 1, light: '#ff9a3a' }, rack: { b: 1 }, cage: { b: 1 },
  throne: { b: 1 }, eggs: { b: 1 }, stalagmite: { b: 1 }, mushrooms: { b: 0, light: '#5affc8' }, tent: { b: 1 }, campfire: { b: 1, light: '#ff8a2a' },
  bones: { b: 0 }, skull: { b: 0 }, blood: { b: 0 }, rubble: { b: 0 }, web: { b: 0 }, candles: { b: 0, light: '#ffc86a' }, rug: { b: 0 },
  crystal: { b: 1, light: '#c86aff' }, lavarock: { b: 0, light: '#ff5a1a' }, puddle: { b: 0 },
  torch: { wall: 1, light: '#ffa040' }, banner: { wall: 1 }, chains: { wall: 1 }, shield: { wall: 1 }, crack: { wall: 1 },
};

// Qué decorado lleva cada tema (peso relativo)
const THEME_PROPS = {
  cuevas:    { block: ['stalagmite', 'barrel', 'crate', 'tent', 'campfire', 'cage'], floor: ['bones', 'rubble', 'mushrooms', 'skull', 'puddle', 'blood'], wall: ['torch', 'torch', 'chains', 'crack'] },
  cripta:    { block: ['pillar', 'sarcophagus', 'coffin', 'tomb', 'statue', 'altar'], floor: ['bones', 'skull', 'candles', 'web', 'rubble', 'blood'], wall: ['torch', 'banner', 'chains', 'crack'] },
  fortaleza: { block: ['pillar', 'barrel', 'crate', 'rack', 'table', 'brazier', 'cage'], floor: ['rug', 'bones', 'blood', 'rubble', 'skull'], wall: ['torch', 'banner', 'banner', 'shield', 'chains'] },
  nido:      { block: ['eggs', 'stalagmite', 'eggs', 'cage'], floor: ['web', 'web', 'bones', 'skull', 'mushrooms', 'puddle'], wall: ['torch', 'crack', 'chains'] },
  volcan:    { block: ['pillar', 'brazier', 'statue', 'altar', 'crystal', 'stalagmite'], floor: ['lavarock', 'bones', 'rubble', 'skull', 'candles'], wall: ['torch', 'banner', 'crack'] },
  abismo:    { block: ['pillar', 'brazier', 'statue', 'altar', 'crystal', 'stalagmite'], floor: ['lavarock', 'bones', 'skull', 'candles', 'rubble'], wall: ['torch', 'banner', 'crack'] },
};

function generate(o) {
  const theme = RULES.THEMES[o.theme] ? o.theme : 'cuevas';
  const T = RULES.THEMES[theme];
  const level = Math.max(1, Math.min(RULES.MAX_LEVEL + 10, o.level | 0 || 1));
  const seed = o.seed || String(Math.random());
  const rand = RULES.seeded(`dungeon:${theme}:${level}:${seed}`);
  const ri = (a, b) => a + Math.floor(rand() * (b - a + 1));
  const pickR = (arr) => arr[Math.floor(rand() * arr.length)];

  for (let attempt = 0; attempt < 8; attempt++) {
    const d = build();
    if (d) return d;
  }
  throw new Error('No se pudo generar la mazmorra');

  function build() {
    const t = new Array(W * H).fill('#');
    const set = (x, y, ch) => { if (x > 0 && y > 0 && x < W - 1 && y < H - 1) t[y * W + x] = ch; };
    const get = (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? t[y * W + x] : '#');

    // ---------- Salas ----------
    const rooms = [];
    for (let i = 0; i < 300 && rooms.length < 12; i++) {
      const w = ri(5, 10), h = ri(4, 7);
      const x = ri(2, W - w - 2), y = ri(2, H - h - 2);
      if (rooms.some((r) => x < r.x + r.w + 2 && x + w + 2 > r.x && y < r.y + r.h + 2 && y + h + 2 > r.y)) continue;
      rooms.push({ x, y, w, h, cx: x + (w >> 1), cy: y + (h >> 1) });
    }
    if (rooms.length < 7) return null;
    for (const r of rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) set(x, y, '.');

    // ---------- Pasillos: árbol de mínima distancia y un par de ciclos ----------
    const corridor = (a, b) => {
      const wide = rand() < 0.3;
      let x = a.cx, y = a.cy;
      const horizFirst = rand() < 0.5;
      const carve = (cx, cy) => { if (get(cx, cy) === '#') set(cx, cy, '.'); if (wide && get(cx + 1, cy) === '#' && cx + 1 < W - 1) set(cx + 1, cy, '.'); };
      const stepX = () => { while (x !== b.cx) { x += Math.sign(b.cx - x); carve(x, y); } };
      const stepY = () => { while (y !== b.cy) { y += Math.sign(b.cy - y); carve(x, y); } };
      if (horizFirst) { stepX(); stepY(); } else { stepY(); stepX(); }
    };
    const linked = [rooms[0]];
    const rest = rooms.slice(1);
    while (rest.length) {
      let best = null;
      for (const r of rest) for (const l of linked) {
        const dd = Math.abs(r.cx - l.cx) + Math.abs(r.cy - l.cy);
        if (!best || dd < best.d) best = { r, l, d: dd };
      }
      corridor(best.l, best.r);
      linked.push(best.r);
      rest.splice(rest.indexOf(best.r), 1);
    }
    for (let i = 0; i < 2; i++) corridor(pickR(rooms), pickR(rooms));

    const inRoom = (x, y) => rooms.find((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) || null;
    // Puertas donde un pasillo de una casilla entra en una sala
    for (const r of rooms) {
      const edge = [];
      for (let x = r.x; x < r.x + r.w; x++) { edge.push([x, r.y - 1, 0, -1]); edge.push([x, r.y + r.h, 0, 1]); }
      for (let y = r.y; y < r.y + r.h; y++) { edge.push([r.x - 1, y, -1, 0]); edge.push([r.x + r.w, y, 1, 0]); }
      for (const [x, y, dx, dy] of edge) {
        if (get(x, y) !== '.' || inRoom(x, y)) continue;
        const side1 = dx ? get(x, y - 1) : get(x - 1, y), side2 = dx ? get(x, y + 1) : get(x + 1, y);
        if (side1 === '#' && side2 === '#' && get(x + dx, y + dy) === '.' && rand() < 0.45) set(x, y, '+');
      }
    }

    // ---------- Entrada y sala del jefe (la más lejana) ----------
    const start = rooms[0];
    const startPos = { x: start.cx, y: start.cy };
    const distFrom = (sx, sy) => {
      const dist = new Int32Array(W * H).fill(-1);
      const q = [sy * W + sx]; dist[sy * W + sx] = 0;
      for (let h = 0; h < q.length; h++) {
        const c = q[h], cx = c % W, cy = (c / W) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const n = (cy + dy) * W + cx + dx;
          if (dist[n] !== -1 || !walk(t[n])) continue;
          dist[n] = dist[c] + 1; q.push(n);
        }
      }
      return dist;
    };
    const walk = (ch) => ch === '.' || ch === '+' || ch === '^';
    let dist = distFrom(startPos.x, startPos.y);
    const ranked = rooms.slice(1).sort((a, b) => dist[b.cy * W + b.cx] - dist[a.cy * W + a.cx]);
    const bossRoom = ranked.slice(0, 3).sort((a, b) => b.w * b.h - a.w * a.h)[0];
    bossRoom.boss = true;
    start.start = true;

    // ---------- Agua o lava y trampas ----------
    const liquid = theme === 'volcan' || theme === 'abismo' ? '%' : '~';
    for (const r of rooms) {
      if (r.start || r.boss || r.w < 7 || r.h < 5 || rand() > (theme === 'volcan' || theme === 'abismo' ? 0.6 : 0.3)) continue;
      const pw = ri(2, Math.min(4, r.w - 4)), ph = ri(1, Math.min(3, r.h - 3));
      const px = ri(r.x + 2, r.x + r.w - pw - 2), py = ri(r.y + 1, r.y + r.h - ph - 1);
      for (let y = py; y < py + ph; y++) for (let x = px; x < px + pw; x++) set(x, y, liquid);
    }
    if (level >= 2) {
      for (let i = 0; i < 6 + level; i++) {
        const x = ri(1, W - 2), y = ri(1, H - 2);
        if (get(x, y) === '.' && !inRoom(x, y)) set(x, y, '^');
      }
    }

    // ---------- Decorado ----------
    const TP = THEME_PROPS[theme];
    const props = [];
    const used = new Set();
    const key = (x, y) => y * W + x;
    const blocked = new Set();
    const addProp = (k, x, y) => { props.push({ k, x, y }); used.add(key(x, y)); if (PROPS[k].b) blocked.add(key(x, y)); };
    const nearDoor = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]].some(([dx, dy]) => get(x + dx, y + dy) === '+' || (!inRoom(x + dx, y + dy) && walk(get(x + dx, y + dy))));
    for (const r of rooms) {
      // pilares simétricos en salas grandes
      if (r.w >= 8 && r.h >= 6 && (theme === 'cripta' || theme === 'fortaleza' || theme === 'volcan' || theme === 'abismo' || r.boss)) {
        for (const [x, y] of [[r.x + 1, r.y + 1], [r.x + r.w - 2, r.y + 1], [r.x + 1, r.y + r.h - 2], [r.x + r.w - 2, r.y + r.h - 2]]) if (get(x, y) === '.' && !nearDoor(x, y)) addProp(r.boss && theme !== 'nido' ? 'pillar' : 'pillar', x, y);
      }
      const nb = r.start ? 1 : ri(1, 3);
      for (let i = 0; i < nb * 3 && props.filter((p) => inRoom(p.x, p.y) === r && PROPS[p.k].b).length < nb + 2; i++) {
        // contra las paredes, sin tapar puertas
        const side = ri(0, 3);
        const x = side === 0 ? r.x : side === 1 ? r.x + r.w - 1 : ri(r.x, r.x + r.w - 1);
        const y = side === 2 ? r.y : side === 3 ? r.y + r.h - 1 : ri(r.y, r.y + r.h - 1);
        if (get(x, y) !== '.' || used.has(key(x, y)) || nearDoor(x, y)) continue;
        addProp(pickR(TP.block), x, y);
      }
      const nf = ri(2, 5);
      for (let i = 0; i < nf; i++) {
        const x = ri(r.x, r.x + r.w - 1), y = ri(r.y, r.y + r.h - 1);
        if (get(x, y) !== '.' || used.has(key(x, y))) continue;
        addProp(pickR(TP.floor), x, y);
      }
      if (r.boss && theme !== 'nido' && theme !== 'cuevas') { const x = r.cx, y = r.y; if (get(x, y) === '.' && !used.has(key(x, y)) && !nearDoor(x, y)) addProp('throne', x, y); }
      if (r.boss) for (let i = 0; i < 4; i++) { const x = ri(r.x, r.x + r.w - 1), y = ri(r.y, r.y + r.h - 1); if (get(x, y) === '.' && !used.has(key(x, y))) addProp(theme === 'nido' ? 'web' : 'bones', x, y); }
    }
    // En los muros con suelo debajo (la cara que se ve): antorchas, estandartes, cadenas
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      if (get(x, y) !== '#' || !walk(get(x, y + 1)) || get(x, y - 1) !== '#') continue;
      const r = inRoom(x, y + 1);
      // antorchas cada tres casillas en el muro de cada sala (y alguna en los pasillos); entre medias, adornos
      if (r && (x - r.x) % 3 === 1) props.push({ k: 'torch', x, y });
      else if (r && rand() < (r.boss ? 0.3 : 0.16)) props.push({ k: pickR(TP.wall.filter((k) => k !== 'torch')), x, y });
      else if (!r && rand() < 0.14) props.push({ k: 'torch', x, y });
    }

    // Lo que bloquea no puede romper la conexión: se quita si deja zonas aisladas
    const solid = (x, y) => !walk(get(x, y)) || blocked.has(key(x, y));
    const reach = () => {
      const seen = new Uint8Array(W * H);
      const q = [key(startPos.x, startPos.y)]; seen[q[0]] = 1;
      for (let h = 0; h < q.length; h++) {
        const c = q[h], cx = c % W, cy = (c / W) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (seen[key(nx, ny)] || solid(nx, ny)) continue;
          seen[key(nx, ny)] = 1; q.push(key(nx, ny));
        }
      }
      return seen;
    };
    const allWalk = () => { const out = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (walk(get(x, y)) && !blocked.has(key(x, y))) out.push(key(x, y)); return out; };
    let seen = reach();
    for (let guard = 0; guard < 40 && allWalk().some((k) => !seen[k]); guard++) {
      const lonely = allWalk().find((k) => !seen[k]);
      const lx = lonely % W, ly = (lonely / W) | 0;
      // quita el obstáculo bloqueante más cercano a la zona aislada (o convierte líquido en suelo)
      let best = null;
      for (const p of props) if (PROPS[p.k].b) { const dd = Math.abs(p.x - lx) + Math.abs(p.y - ly); if (!best || dd < best.d) best = { p, d: dd }; }
      if (best && best.d < 6) { props.splice(props.indexOf(best.p), 1); blocked.delete(key(best.p.x, best.p.y)); used.delete(key(best.p.x, best.p.y)); } else {
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (get(x, y) === liquid) set(x, y, '.');
      }
      seen = reach();
    }
    if (!seen[key(bossRoom.cx, bossRoom.cy)] && !blocked.has(key(bossRoom.cx, bossRoom.cy))) return null;

    // ---------- Enemigos ----------
    const freeCell = (r, avoid) => {
      for (let i = 0; i < 60; i++) {
        const x = ri(r.x, r.x + r.w - 1), y = ri(r.y, r.y + r.h - 1);
        const k = key(x, y);
        if (!walk(get(x, y)) || get(x, y) === '^' || blocked.has(k) || avoid.has(k) || !seen[k]) continue;
        return { x, y };
      }
      return null;
    };
    const taken = new Set();
    const spawns = [];
    const mobs = T.mobs.filter((k) => (RULES.MONSTERS[k].minLevel || 1) <= level);
    for (const r of rooms) {
      if (r.start) continue;
      if (r.boss) {
        const bp = freeCell({ x: r.cx - 1, y: r.cy - 1, w: 3, h: 3 }, taken) || freeCell(r, taken);
        if (!bp) return null;
        taken.add(key(bp.x, bp.y));
        spawns.push({ k: T.boss, x: bp.x, y: bp.y, boss: true, pack: 'boss' });
        for (let i = 0; i < 2 + Math.floor(level / 8); i++) { const p = freeCell(r, taken); if (p) { taken.add(key(p.x, p.y)); spawns.push({ k: pickR(mobs), x: p.x, y: p.y, pack: 'boss' }); } }
        continue;
      }
      const n = Math.min(6, ri(2, 3) + Math.floor(level / 8) + (r.w * r.h > 45 ? 1 : 0));
      const elite = rand() < 0.12 + Math.min(0.15, level * 0.01);
      const packId = 'p' + spawns.length;
      for (let i = 0; i < n; i++) {
        const p = freeCell(r, taken);
        if (!p) break;
        taken.add(key(p.x, p.y));
        spawns.push({ k: pickR(mobs), x: p.x, y: p.y, elite: elite && i === 0, pack: packId });
      }
    }
    // algún enemigo suelto por los pasillos
    for (let i = 0; i < 3 + Math.floor(level / 4); i++) {
      const x = ri(1, W - 2), y = ri(1, H - 2);
      if (get(x, y) === '.' && !inRoom(x, y) && seen[key(x, y)] && !taken.has(key(x, y)) && Math.abs(x - startPos.x) + Math.abs(y - startPos.y) > 10) {
        taken.add(key(x, y));
        spawns.push({ k: pickR(mobs), x, y, pack: 'c' + i });
      }
    }

    // ---------- Cofres y pociones ----------
    const chests = [];
    const others = rooms.filter((r) => !r.start);
    for (let i = 0; i < ri(2, 4); i++) {
      const r = pickR(others);
      const p = freeCell(r, new Set([...taken, ...used]));
      if (!p || nearDoor(p.x, p.y)) continue;
      taken.add(key(p.x, p.y)); blocked.add(key(p.x, p.y));
      chests.push({ x: p.x, y: p.y });
    }
    const potions = [];
    for (let i = 0; i < 3; i++) { const p = freeCell(pickR(others), new Set([...taken, ...used])); if (p) { taken.add(key(p.x, p.y)); potions.push(p); } }

    const name = `${pickR(T.names)} ${pickR(T.of)}`;
    return {
      kind: 'dungeon', theme, level, name, w: W, h: H, tiles: t.join(''),
      start: startPos, boss: { x: bossRoom.cx, y: bossRoom.cy }, props, spawns, chests, potions,
    };
  }
}

module.exports = { generate, PROPS, W, H };
