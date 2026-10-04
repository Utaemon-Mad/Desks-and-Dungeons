// Datos de las mazmorras compartidos por el servidor y el navegador: casillas, objetos, enemigos y validación.
(function (root) {
  const W = 24, H = 16;

  // Casillas del suelo (un carácter por casilla)
  const TILES = {
    '#': { name: 'Muro', walk: false },
    '.': { name: 'Suelo', walk: true },
    '+': { name: 'Puerta', walk: true },
    '^': { name: 'Pinchos', walk: true, damage: 1 },
    '~': { name: 'Agua', walk: false },
  };

  // Enemigos: vida, ataque, experiencia, oro (mín-máx), ms por paso, alcance de aviso
  const ENEMIES = {
    goblin:     { name: 'Goblin',          family: 'Goblins',   hp: 6,  att: 2, xp: 10,  gold: [2, 6],   step: 420, range: 6 },
    shaman:     { name: 'Chamán goblin',   family: 'Goblins',   hp: 8,  att: 3, xp: 18,  gold: [5, 10],  step: 520, range: 7 },
    orc:        { name: 'Orco',            family: 'Orcos',     hp: 16, att: 4, xp: 25,  gold: [6, 14],  step: 620, range: 6 },
    warchief:   { name: 'Jefe orco',       family: 'Orcos',     hp: 40, att: 7, xp: 100, gold: [40, 70], step: 700, range: 7, boss: true },
    skeleton:   { name: 'Esqueleto',       family: 'No muertos', hp: 10, att: 3, xp: 15,  gold: [3, 8],   step: 520, range: 7 },
    zombie:     { name: 'Zombi',           family: 'No muertos', hp: 14, att: 3, xp: 18,  gold: [2, 7],   step: 900, range: 5 },
    necromancer:{ name: 'Nigromante',      family: 'No muertos', hp: 30, att: 6, xp: 90,  gold: [35, 60], step: 800, range: 8, boss: true, summons: 'skeleton' },
  };

  // Objetos que se colocan con el editor
  const OBJECTS = {
    start:  { name: 'Entrada' },
    exit:   { name: 'Salida' },
    chest:  { name: 'Cofre' },
    potion: { name: 'Poción' },
  };

  const REWARDS = {
    chest: { gold: [15, 35], xp: 15 },
    potionHeal: 0.5,       // cura la mitad de la vida máxima
    exit: { gold: 25, xp: 40 },
    deathGoldLoss: 0.1,    // al caer pierdes el 10% del oro
  };

  const MAX_ENEMIES = 60;
  const MAX_OBJECTS = 140;

  const walkable = (ch) => !!(TILES[ch] && TILES[ch].walk);

  // Comprueba y limpia una mazmorra enviada por el editor. Devuelve { ok, dungeon } o { ok: false, error }.
  function validate(d) {
    if (!d || typeof d !== 'object') return { ok: false, error: 'Mazmorra vacía.' };
    const name = String(d.name || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 32);
    if (!name) return { ok: false, error: 'Ponle un nombre a la mazmorra.' };
    const tiles = String(d.tiles || '');
    if (tiles.length !== W * H || /[^#.+^~]/.test(tiles)) return { ok: false, error: 'El mapa no es válido.' };
    const objects = [];
    const used = new Set();
    let starts = 0, exits = 0, enemies = 0;
    for (const o of Array.isArray(d.objects) ? d.objects.slice(0, MAX_OBJECTS) : []) {
      if (!o || !Number.isInteger(o.x) || !Number.isInteger(o.y) || o.x < 0 || o.y < 0 || o.x >= W || o.y >= H) continue;
      const isEnemy = Object.prototype.hasOwnProperty.call(ENEMIES, o.k);
      if (!isEnemy && !Object.prototype.hasOwnProperty.call(OBJECTS, o.k)) continue;
      const k = o.x + ',' + o.y;
      if (used.has(k) || !walkable(tiles[o.y * W + o.x])) continue;
      if (o.k === 'start' && starts++) continue;
      if (o.k === 'exit' && exits++) continue;
      if (isEnemy && ++enemies > MAX_ENEMIES) continue;
      used.add(k);
      objects.push({ k: o.k, x: o.x, y: o.y });
    }
    if (!starts) return { ok: false, error: 'Falta la entrada (dónde aparecen los héroes).' };
    if (!exits) return { ok: false, error: 'Falta la salida.' };
    return { ok: true, dungeon: { name, tiles, objects } };
  }

  // Mazmorra de ejemplo para que haya algo que jugar desde el principio
  function sample() {
    const rows = [
      '########################',
      '#....#.......#.........#',
      '#.S..+...g...+....o....#',
      '#....#.......#.........#',
      '#....###+#####..c......#',
      '#..p...#.....###+#######',
      '####...#..g..#.......^^#',
      '#..#...+.....+...s...^.#',
      '#c.#...#.....#.......^.#',
      '#..+...###+###...s.....#',
      '#..#.....z.......####+##',
      '####..~~~~~......#.....#',
      '#.....~~~~~..s...#..N..#',
      '#..z.........#...+.....#',
      '#........p...#...#....E#',
      '########################',
    ];
    const map = { S: 'start', E: 'exit', c: 'chest', p: 'potion', g: 'goblin', o: 'orc', s: 'skeleton', z: 'zombie', N: 'necromancer' };
    let tiles = '';
    const objects = [];
    rows.forEach((row, y) => {
      for (let x = 0; x < W; x++) {
        const ch = row[x];
        if (map[ch]) { objects.push({ k: map[ch], x, y }); tiles += '.'; }
        else tiles += ch;
      }
    });
    return { name: 'La Cripta del Nigromante', tiles, objects };
  }

  const DUNGEON = { W, H, TILES, ENEMIES, OBJECTS, REWARDS, MAX_ENEMIES, walkable, validate, sample };
  if (typeof module !== 'undefined' && module.exports) module.exports = DUNGEON;
  else root.DUNGEON = DUNGEON;
})(this);
