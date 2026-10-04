// Mapa de la taberna, compartido entre el servidor (validación) y el cliente (dibujo y rutas).
// Los muebles se pueden editar: cada sala guarda su propia lista de objetos.
(function (root) {
  const W = 14; // casillas a lo largo de x (pared derecha)
  const H = 12; // casillas a lo largo de y (pared izquierda, la de las ventanas)

  // dir = hacia dónde mira quien se sienta: E (+x), S (+y), W (-x), N (-y)
  const DIRS = ['E', 'S', 'W', 'N'];

  // Catálogo de muebles que se pueden colocar con el editor
  const FURNITURE = {
    barrel:     { name: 'Barril',          block: true },
    crate:      { name: 'Caja',            block: true },
    smallcrate: { name: 'Caja pequeña',    block: true },
    table:      { name: 'Mesa',            block: true },
    maptable:   { name: 'Mesa con mapa',   block: true },
    roundtable: { name: 'Mesa redonda',    block: true },
    bar:        { name: 'Barra',           block: true },
    bookshelf:  { name: 'Estantería',      block: true, rotates: true },
    plant:      { name: 'Planta',          block: true },
    chair:      { name: 'Silla',           seat: true, rotates: true },
    stool:      { name: 'Taburete',        seat: true },
    sofa:       { name: 'Sofá',            seat: true, rotates: true },
    fireplace:  { name: 'Chimenea',        block: true, light: true },
    candelabra: { name: 'Candelabro',      block: true, light: true },
    chandelier: { name: 'Lámpara de techo', light: true },
    chest:      { name: 'Cofre',           block: true },
    rack:       { name: 'Armero',          block: true },
    cauldron:   { name: 'Caldero',         block: true, light: true },
    staff:      { name: 'Zona del personal', block: true, hidden: true },
  };

  // El tabernero siempre está aquí y nadie puede poner muebles encima
  const BARKEEP = { x: 12, y: 4 };
  // Los tres comerciantes, cada uno con su puesto (casilla del comerciante y la de su mostrador)
  const MERCHANTS = {
    mago:   { x: 0, y: 3, prop: { x: 1, y: 3, type: 'crystal' }, look: { npc: 'encapuchado' } },
    bruja:  { x: 0, y: 6, prop: { x: 1, y: 6, type: 'cauldron' }, look: { npc: 'bruja' } },
    armero: { x: 6, y: 0, prop: { x: 5, y: 0, type: 'rack' }, prop2: { x: 7, y: 0, type: 'rack' }, look: { npc: 'mercader' } },
  };
  const FIXED = new Set([[BARKEEP.x, BARKEEP.y]].concat(...Object.values(MERCHANTS).map((m) => [[m.x, m.y], [m.prop.x, m.prop.y]].concat(m.prop2 ? [[m.prop2.x, m.prop2.y]] : []))).map(([x, y]) => x + ',' + y));
  function merchantAt(x, y) {
    for (const [id, m] of Object.entries(MERCHANTS)) {
      if ((m.x === x && m.y === y) || (m.prop.x === x && m.prop.y === y) || (m.prop2 && m.prop2.x === x && m.prop2.y === y)) return id;
    }
    return null;
  }

  function defaultItems() {
    const items = [];
    const add = (type, x, y, dir) => items.push(dir ? { type, x, y, dir } : { type, x, y });
    // Rincón de los barriles y las cajas
    add('barrel', 0, 0); add('barrel', 1, 0); add('barrel', 0, 1);
    add('chest', 2, 0); add('crate', 3, 0); add('crate', 4, 0); add('smallcrate', 3, 1);
    // Chimenea en la pared del fondo, lámparas colgadas y candelabros
    add('fireplace', 9, 0);
    add('chandelier', 4, 3); add('chandelier', 7, 7);
    add('candelabra', 9, 10); add('candelabra', 2, 11);
    // Sofá contra la pared de las ventanas
    add('sofa', 0, 8, 'E'); add('sofa', 0, 9, 'E'); add('sofa', 0, 10, 'E');
    // Mesa de partida con el mapa y sus sillas
    for (let x = 3; x <= 5; x++) for (let y = 6; y <= 7; y++) add('maptable', x, y);
    add('chair', 3, 5, 'S'); add('chair', 4, 5, 'S'); add('chair', 5, 5, 'S');
    add('chair', 3, 8, 'N'); add('chair', 4, 8, 'N'); add('chair', 5, 8, 'N');
    add('chair', 2, 6, 'E'); add('chair', 6, 7, 'W');
    // Mesita redonda del fondo
    add('roundtable', 7, 3); add('stool', 6, 3); add('stool', 8, 3);
    // Barra del tabernero (en L) y taburetes
    for (let y = 2; y <= 8; y++) add('bar', 10, y);
    for (let x = 11; x <= 13; x++) add('bar', x, 8);
    for (let x = 11; x <= 13; x++) for (let y = 0; y <= 7; y++) if (!(x === BARKEEP.x && y === BARKEEP.y)) add('staff', x, y);
    add('stool', 9, 3); add('stool', 9, 5); add('stool', 9, 7);
    add('stool', 11, 9); add('stool', 13, 9);
    // Mesa de abajo
    add('roundtable', 6, 10); add('stool', 5, 10); add('stool', 7, 10); add('stool', 6, 11);
    // Barriles junto a la barra y una planta
    add('barrel', 13, 11); add('barrel', 12, 11); add('barrel', 13, 10);
    add('plant', 1, 11);
    return items;
  }

  const key = (x, y) => x + ',' + y;
  const inBounds = (x, y) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < W && y < H;

  // Limpia una lista de muebles que llega de fuera (del editor o de disco)
  function sanitizeItems(list) {
    const out = [];
    const used = new Set(FIXED);
    if (!Array.isArray(list)) return out;
    for (const it of list.slice(0, W * H)) {
      if (!it || !Object.prototype.hasOwnProperty.call(FURNITURE, it.type)) continue;
      if (!inBounds(it.x, it.y) || used.has(key(it.x, it.y))) continue;
      used.add(key(it.x, it.y));
      const clean = { type: it.type, x: it.x, y: it.y };
      if (FURNITURE[it.type].rotates) clean.dir = DIRS.includes(it.dir) ? it.dir : 'S';
      out.push(clean);
    }
    return out;
  }

  // Taburetes: miran hacia el mueble bloqueante más cercano que tengan al lado
  function autoDir(it, blocked) {
    if (it.dir) return it.dir;
    const order = [['E', 1, 0], ['W', -1, 0], ['S', 0, 1], ['N', 0, -1]];
    for (const [d, dx, dy] of order) if (blocked.has(key(it.x + dx, it.y + dy))) return d;
    return 'S';
  }

  function createMap(initialItems) {
    const map = {
      W, H, DIRS, FURNITURE, BARKEEP, MERCHANTS, merchantAt, isFixed: (x, y) => FIXED.has(key(x, y)),
      rug: { x0: 1, y0: 4, x1: 7, y1: 9 },
      spawn: { x: 8, y: 1 },
      items: [], seats: new Map(), blocked: new Set(), byTile: new Map(),
      inBounds,
      setItems(list) {
        this.items = sanitizeItems(list);
        this.seats = new Map(); this.blocked = new Set(); this.byTile = new Map();
        for (const k of FIXED) this.blocked.add(k);
        for (const it of this.items) {
          this.byTile.set(key(it.x, it.y), it);
          if (FURNITURE[it.type].block) this.blocked.add(key(it.x, it.y));
        }
        for (const it of this.items) {
          if (FURNITURE[it.type].seat) { it.dir = autoDir(it, this.blocked); this.seats.set(key(it.x, it.y), it); }
        }
        return this;
      },
      itemAt(x, y) { return this.byTile.get(key(x, y)) || null; },
      isSeat(x, y) { return this.seats.has(key(x, y)); },
      seatAt(x, y) { return this.seats.get(key(x, y)) || null; },
      // Casilla en la que se puede terminar un paseo (suelo libre o asiento)
      isStandable(x, y) { return inBounds(x, y) && !this.blocked.has(key(x, y)); },
      // Casilla por la que se puede pasar de camino (los asientos sólo valen como destino)
      isPassable(x, y) { return this.isStandable(x, y) && !this.isSeat(x, y); },
      findPath(sx, sy, tx, ty) { return findPath(this, sx, sy, tx, ty); },
    };
    return map.setItems(initialItems || defaultItems());
  }

  // Dijkstra en 8 direcciones sin cortar esquinas. Devuelve la lista de casillas sin incluir la de salida.
  function findPath(m, sx, sy, tx, ty) {
    if (!m.isStandable(tx, ty)) return null;
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
        if (!(isTarget ? m.isStandable(nx, ny) : m.isPassable(nx, ny))) continue;
        if (dx && dy && !(m.isPassable(x + dx, y) && m.isPassable(x, y + dy))) continue;
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

  // Aspecto de las clases: "style" elige el dibujo base del sprite; color y trim, la ropa
  const CLASSES = {
    guerrero:   { name: 'Guerrero',   style: 'guerrero', color: '#8a3a2a', trim: '#c8a050' },
    mago:       { name: 'Mago',       style: 'maga',     color: '#4a2f7a', trim: '#e0c060' },
    explorador: { name: 'Explorador', style: 'elfo',     color: '#3a5a32', trim: '#a8c070' },
    picaro:     { name: 'Pícaro',     style: 'picaro',   color: '#2e3038', trim: '#8a90a0' },
    paladin:    { name: 'Paladín',    style: 'guerrero', color: '#2f4a8a', trim: '#e8cc6a' },
    brujo:      { name: 'Brujo',      style: 'maga',     color: '#24162e', trim: '#8a5ac0' },
    clerigo:    { name: 'Clérigo',    style: 'clerigo',  color: '#d8d0bc', trim: '#c8962a' },
  };
  // Clases antiguas → clase actual
  const LEGACY_CLASS = {
    fighter: 'guerrero', barbarian: 'guerrero', wizard: 'mago', sorcerer: 'mago', ranger: 'explorador', druid: 'clerigo',
    rogue: 'picaro', monk: 'picaro', bard: 'picaro', paladin: 'paladin', warlock: 'brujo', cleric: 'clerigo',
    maga: 'mago', elfo: 'explorador', bardo: 'picaro',
  };

  const SPECIES = {
    dragonborn: { name: 'Dracónido', scale: 1.05 }, dwarf: { name: 'Enano', scale: 0.86 }, elf: { name: 'Elfo', scale: 1 },
    gnome: { name: 'Gnomo', scale: 0.78 }, goliath: { name: 'Goliat', scale: 1.15 }, halfling: { name: 'Mediano', scale: 0.78 },
    human: { name: 'Humano', scale: 1 }, orc: { name: 'Orco', scale: 1.06 }, tiefling: { name: 'Tiflin', scale: 1 },
  };
  // Tonos de piel: los 5 primeros valen para todos; el resto según la especie
  const SKINS = ['#f6d3b3', '#e8b48a', '#c98a5e', '#8d5a3b', '#5c3a26', '#8aab62', '#6a8a4a', '#c0605a', '#8a4a8a', '#5a6ab8', '#a8aeb8', '#7e8692'];
  const SPECIES_SKINS = { orc: [5, 6, 1, 3], tiefling: [7, 8, 9, 1, 3], goliath: [10, 11, 2, 3] };
  const skinsFor = (species) => SPECIES_SKINS[species] || [0, 1, 2, 3, 4];
  const DRAGON_COLORS = { black: '#3a3a44', blue: '#3a6ad0', brass: '#c8a040', bronze: '#a87030', copper: '#b8683a', gold: '#e0b830', green: '#3a8a4a', red: '#b83a2a', silver: '#c0c8d0', white: '#e8eef0' };
  const HAIRS = ['#2b2018', '#6b4226', '#c4472d', '#e8c25a', '#d8d8d8', '#3a6fd8', '#d85aa8'];

  // Normaliza el aspecto que llega de un cliente (o de una versión anterior del juego)
  function cleanLook(look) {
    look = look || {};
    let cls = Object.prototype.hasOwnProperty.call(CLASSES, look.cls) ? look.cls : LEGACY_CLASS[look.cls];
    if (!Object.prototype.hasOwnProperty.call(CLASSES, cls)) cls = 'guerrero';
    let cls2 = Object.prototype.hasOwnProperty.call(CLASSES, look.cls2) ? look.cls2 : null;
    if (cls2 === cls) cls2 = null;
    const species = Object.prototype.hasOwnProperty.call(SPECIES, look.species) ? look.species : 'human';
    const idx = (v, n) => (Number.isInteger(v) && v >= 0 && v < n ? v : 0);
    const out = { cls, species, skin: idx(look.skin, SKINS.length), hair: idx(look.hair, HAIRS.length) };
    if (cls2) out.cls2 = cls2;
    if (!skinsFor(species).includes(out.skin)) out.skin = skinsFor(species)[0];
    if (typeof look.sub === 'string' && /^[a-z-]{1,40}$/.test(look.sub)) out.sub = look.sub;
    return out;
  }

  const MAP = createMap();
  Object.assign(MAP, { createMap, defaultItems, sanitizeItems, MERCHANTS, merchantAt, CLASSES, LEGACY_CLASS, SPECIES, SKINS, SPECIES_SKINS, skinsFor, DRAGON_COLORS, HAIRS, cleanLook });

  if (typeof module !== 'undefined' && module.exports) module.exports = MAP;
  else root.MAP = MAP;
})(this);
