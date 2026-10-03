// Mapa de la taberna, compartido entre el servidor (validación) y el cliente (dibujo y rutas).
(function (root) {
  const W = 14; // casillas a lo largo de x (pared derecha)
  const H = 12; // casillas a lo largo de y (pared izquierda, la del muro de letras)

  // dir = hacia dónde mira el héroe sentado: E (+x), S (+y), W (-x), N (-y)
  const items = [];
  const add = (type, x, y, extra) => items.push(Object.assign({ type, x, y }, extra));

  // Rincón de los barriles y las cajas
  add('barrel', 0, 0); add('barrel', 1, 0); add('barrel', 0, 1);
  add('crate', 3, 0); add('crate', 4, 0); add('crate', 3, 1, { small: true });

  // Sofá contra el muro de letras
  add('sofa', 0, 8, { dir: 'E', end: 'start' });
  add('sofa', 0, 9, { dir: 'E' });
  add('sofa', 0, 10, { dir: 'E', end: 'end' });

  // Mesa de partida con el mapa y sus sillas
  for (let x = 3; x <= 5; x++) for (let y = 6; y <= 7; y++) add('table', x, y, { map: true });
  add('chair', 3, 5, { dir: 'S' }); add('chair', 4, 5, { dir: 'S' }); add('chair', 5, 5, { dir: 'S' });
  add('chair', 3, 8, { dir: 'N' }); add('chair', 4, 8, { dir: 'N' }); add('chair', 5, 8, { dir: 'N' });
  add('chair', 2, 6, { dir: 'E' }); add('chair', 6, 7, { dir: 'W' });

  // Mesita redonda del fondo
  add('roundtable', 7, 3);
  add('stool', 6, 3, { dir: 'E' }); add('stool', 8, 3, { dir: 'W' });

  // Barra del tabernero (en L) y taburetes
  for (let y = 2; y <= 8; y++) add('bar', 10, y, { deco: y % 3 });
  for (let x = 11; x <= 13; x++) add('bar', x, 8, { deco: x % 3 });
  for (let x = 11; x <= 13; x++) for (let y = 0; y <= 7; y++) add('staff', x, y);
  add('stool', 9, 3, { dir: 'E' }); add('stool', 9, 5, { dir: 'E' }); add('stool', 9, 7, { dir: 'E' });
  add('stool', 11, 9, { dir: 'N' }); add('stool', 13, 9, { dir: 'N' });

  // Mesa de abajo
  add('roundtable', 6, 10);
  add('stool', 5, 10, { dir: 'E' }); add('stool', 7, 10, { dir: 'W' }); add('stool', 6, 11, { dir: 'N' });

  // Barriles junto a la barra
  add('barrel', 13, 11); add('barrel', 12, 11); add('barrel', 13, 10);

  // Alfombra (sólo decoración del suelo)
  const rug = { x0: 1, y0: 4, x1: 7, y1: 9 };

  const SEAT_TYPES = { chair: 1, stool: 1, sofa: 1 };
  const BLOCK_TYPES = { barrel: 1, crate: 1, table: 1, roundtable: 1, bar: 1, staff: 1 };

  const key = (x, y) => x + ',' + y;
  const seats = new Map();
  const blocked = new Set();
  for (const it of items) {
    if (SEAT_TYPES[it.type]) seats.set(key(it.x, it.y), it);
    else if (BLOCK_TYPES[it.type]) blocked.add(key(it.x, it.y));
  }

  const inBounds = (x, y) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < W && y < H;
  const isSeat = (x, y) => seats.has(key(x, y));
  const seatAt = (x, y) => seats.get(key(x, y)) || null;
  // Casilla en la que se puede terminar un paseo (suelo libre o asiento)
  const isStandable = (x, y) => inBounds(x, y) && !blocked.has(key(x, y));
  // Casilla por la que se puede pasar de camino (los asientos sólo valen como destino)
  const isPassable = (x, y) => isStandable(x, y) && !isSeat(x, y);

  // Dijkstra en 8 direcciones sin cortar esquinas. Devuelve la lista de casillas sin incluir la de salida.
  function findPath(sx, sy, tx, ty) {
    if (!isStandable(tx, ty)) return null;
    if (sx === tx && sy === ty) return [];
    const dist = new Map(), prev = new Map();
    const open = [[0, sx, sy]];
    dist.set(key(sx, sy), 0);
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
      const [d, x, y] = open.splice(bi, 1)[0];
      if (x === tx && y === ty) break;
      if (d > dist.get(key(x, y))) continue;
      for (const [dx, dy] of dirs) {
        const nx = x + dx, ny = y + dy;
        const isTarget = nx === tx && ny === ty;
        if (!(isTarget ? isStandable(nx, ny) : isPassable(nx, ny))) continue;
        if (dx && dy && !(isPassable(x + dx, y) && isPassable(x, y + dy))) continue;
        const nd = d + (dx && dy ? 1.414 : 1);
        const k = key(nx, ny);
        if (!dist.has(k) || nd < dist.get(k)) {
          dist.set(k, nd); prev.set(k, [x, y]); open.push([nd, nx, ny]);
        }
      }
    }
    if (!prev.has(key(tx, ty))) return null;
    const path = [];
    let cur = [tx, ty];
    while (!(cur[0] === sx && cur[1] === sy)) { path.unshift({ x: cur[0], y: cur[1] }); cur = prev.get(key(cur[0], cur[1])); }
    return path;
  }

  const spawn = { x: 8, y: 1 };

  // Clases de héroe y opciones de aspecto
  const CLASSES = {
    guerrero: { name: 'Guerrero', hp: 14, att: 6, color: '#b8432f', trim: '#e0b040' },
    maga:     { name: 'Maga',     hp: 8,  att: 9, color: '#6b3fa0', trim: '#f2d36b' },
    elfo:     { name: 'Elfo',     hp: 10, att: 7, color: '#3f8a3a', trim: '#c9e07a' },
    picaro:   { name: 'Pícaro',   hp: 9,  att: 8, color: '#3b3f4a', trim: '#a0a8b8' },
    bardo:    { name: 'Bardo',    hp: 10, att: 5, color: '#d0772a', trim: '#4a7ed0' },
    clerigo:  { name: 'Clérigo',  hp: 12, att: 4, color: '#e8e0cc', trim: '#d4a52a' },
  };
  const SKINS = ['#f6d3b3', '#e8b48a', '#c98a5e', '#8d5a3b', '#5c3a26'];
  const HAIRS = ['#2b2018', '#6b4226', '#c4472d', '#e8c25a', '#d8d8d8', '#3a6fd8', '#d85aa8'];

  const MAP = { W, H, items, rug, spawn, inBounds, isSeat, seatAt, isStandable, isPassable, findPath, CLASSES, SKINS, HAIRS };

  if (typeof module !== 'undefined' && module.exports) module.exports = MAP;
  else root.MAP = MAP;
})(this);
