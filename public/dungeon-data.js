// Datos de mazmorras y del mundo abierto, compartidos por el servidor y el navegador.
// Las estadísticas de los monstruos son las del SRD 5.2 (public/rules/monsters.json); aquí sólo se dice cuáles
// aparecen en el juego, con qué dibujo, y se añaden tres enemigos propios que el SRD 5.2 no incluye.
(function (root) {
  const W = 24, H = 16; // tamaño de las mazmorras del editor

  // Casillas (un carácter por casilla). Las cinco primeras son las del editor de mazmorras.
  const TILES = {
    '#': { name: 'Muro', walk: false },
    '.': { name: 'Suelo', walk: true },
    '+': { name: 'Puerta', walk: true },
    '^': { name: 'Pinchos', walk: true, damage: '1d4' },
    '~': { name: 'Agua', walk: false },
    // mundo abierto
    ',': { name: 'Hierba', walk: true },
    ';': { name: 'Hierba alta', walk: true },
    'T': { name: 'Árbol', walk: false },
    'P': { name: 'Pino', walk: false },
    'w': { name: 'Agua profunda', walk: false },
    'v': { name: 'Vado', walk: true },
    's': { name: 'Arena', walk: true },
    'h': { name: 'Colinas', walk: true },
    'M': { name: 'Montaña', walk: false },
    '=': { name: 'Camino', walk: true },
    'b': { name: 'Puente', walk: true },
    'g': { name: 'Tierra de tumbas', walk: true },
    't': { name: 'Lápida', walk: false },
    'R': { name: 'Ruina', walk: false },
    'F': { name: 'Hoguera', walk: false },
    'C': { name: 'Entrada de cueva', walk: true, portal: 'dungeon' },
    'H': { name: 'Pueblo', walk: true, portal: 'tavern' },
    'k': { name: 'Casa', walk: false },
    'D': { name: 'Guarida del dragón', walk: true },
  };
  const EDITOR_TILES = '#.+^~';

  // Enemigos que se pueden poner en mazmorras y que aparecen por el mundo. sprite = dibujo de sprites.js
  const ENEMIES = {
    'goblin-minion':     { family: 'Goblinoides', sprite: 'goblin', scale: 0.85 },
    'goblin-warrior':    { family: 'Goblinoides', sprite: 'goblin' },
    'goblin-boss':       { family: 'Goblinoides', sprite: 'shaman', boss: true },
    'hobgoblin-warrior': { family: 'Goblinoides', sprite: 'hobgoblin' },
    'hobgoblin-captain': { family: 'Goblinoides', sprite: 'hobgoblin', scale: 1.12, boss: true },
    'bugbear-warrior':   { family: 'Goblinoides', sprite: 'bugbear' },
    'orc':               { family: 'Orcos y gigantes', sprite: 'orc', homebrew: true },
    'orc-war-chief':     { family: 'Orcos y gigantes', sprite: 'warchief', homebrew: true, boss: true },
    'ogre':              { family: 'Orcos y gigantes', sprite: 'ogre' },
    'troll':             { family: 'Orcos y gigantes', sprite: 'troll', boss: true },
    'skeleton':          { family: 'No muertos', sprite: 'skeleton' },
    'zombie':            { family: 'No muertos', sprite: 'zombie' },
    'ghoul':             { family: 'No muertos', sprite: 'ghoul' },
    'ghast':             { family: 'No muertos', sprite: 'ghoul', tint: '#5a6a4a' },
    'specter':           { family: 'No muertos', sprite: 'specter' },
    'wight':             { family: 'No muertos', sprite: 'wight' },
    'mummy':             { family: 'No muertos', sprite: 'mummy' },
    'ogre-zombie':       { family: 'No muertos', sprite: 'zombie', scale: 1.3 },
    'wraith':            { family: 'No muertos', sprite: 'specter', tint: '#3a2a4a', boss: true },
    'necromancer':       { family: 'No muertos', sprite: 'necromancer', homebrew: true, boss: true, summons: 'skeleton' },
    'lich':              { family: 'No muertos', sprite: 'lich', boss: true, summons: 'skeleton' },
    'wolf':              { family: 'Bestias', sprite: 'wolf' },
    'dire-wolf':         { family: 'Bestias', sprite: 'wolf', scale: 1.25, tint: '#4a4a52' },
    'giant-spider':      { family: 'Bestias', sprite: 'spider' },
    'brown-bear':        { family: 'Bestias', sprite: 'bear' },
    'owlbear':           { family: 'Bestias', sprite: 'owlbear', boss: true },
    'bandit':            { family: 'Humanoides', sprite: 'hero:rogue' },
    'bandit-captain':    { family: 'Humanoides', sprite: 'hero:fighter', boss: true },
    'cultist':           { family: 'Humanoides', sprite: 'hero:warlock' },
    'young-red-dragon':  { family: 'Dragones', sprite: 'dragon', boss: true },
  };

  // Enemigos propios (no están en el SRD 5.2), con el mismo formato que monsters.json
  const HOMEBREW = [
    {
      id: 'orc', name: 'Guerrero orco', en: 'Orc Warrior (homebrew)', size: 'Medium', type: 'humanoid', alignment: 'chaotic evil',
      ac: 13, acNote: 'Hide Armor', hp: 15, hd: '2d8+6', speed: { walk: '30 ft.' }, str: 16, dex: 12, con: 16, int: 7, wis: 11, cha: 10,
      profs: [['Intimidation', 2]], resist: [], immune: [], vulnerable: [], condImmune: [], senses: { darkvision: '60 ft.', passive_perception: 10 },
      languages: 'Common, Orc', cr: 0.5, xp: 100, pb: 2,
      traits: [{ name: 'Aggressive', desc: 'As a Bonus Action, the orc can move up to its Speed toward an enemy that it can see.' }],
      actions: [
        { name: 'Greataxe', desc: 'Melee Attack Roll: +5, reach 5 ft. Hit: 9 (1d12 + 3) Slashing damage.', hit: 5, dmg: [['1d12+3', 'slashing']] },
        { name: 'Javelin', desc: 'Ranged Attack Roll: +5, range 30/120 ft. Hit: 6 (1d6 + 3) Piercing damage.', hit: 5, dmg: [['1d6+3', 'piercing']] },
      ], bonus: [], reactions: [], legendary: [], gear: 'Greataxe, Hide Armor, Javelins', homebrew: true,
    },
    {
      id: 'orc-war-chief', name: 'Jefe de guerra orco', en: 'Orc War Chief (homebrew)', size: 'Medium', type: 'humanoid', alignment: 'chaotic evil',
      ac: 16, acNote: 'Chain Mail', hp: 93, hd: '11d8+44', speed: { walk: '30 ft.' }, str: 18, dex: 12, con: 18, int: 11, wis: 11, cha: 16,
      profs: [['ST Str', 6], ['ST Con', 6], ['Intimidation', 5]], resist: [], immune: [], vulnerable: [], condImmune: [], senses: { darkvision: '60 ft.', passive_perception: 10 },
      languages: 'Common, Orc', cr: 4, xp: 1100, pb: 2,
      traits: [{ name: 'Aggressive', desc: 'As a Bonus Action, the orc can move up to its Speed toward an enemy that it can see.' }],
      actions: [
        { name: 'Multiattack', desc: 'The orc makes two Greataxe attacks.' },
        { name: 'Greataxe', desc: 'Melee Attack Roll: +6, reach 5 ft. Hit: 10 (1d12 + 4) Slashing damage.', hit: 6, dmg: [['1d12+4', 'slashing']] },
        { name: 'Spear', desc: 'Melee or Ranged Attack Roll: +6, reach 5 ft. or range 20/60 ft. Hit: 7 (1d6 + 4) Piercing damage.', hit: 6, dmg: [['1d6+4', 'piercing']] },
      ], bonus: [], reactions: [], legendary: [], gear: 'Chain Mail, Greataxe, Spear', homebrew: true,
    },
    {
      id: 'necromancer', name: 'Nigromante', en: 'Necromancer (homebrew)', size: 'Medium', type: 'humanoid', alignment: 'neutral evil',
      ac: 12, acNote: '', hp: 45, hd: '10d8', speed: { walk: '30 ft.' }, str: 9, dex: 14, con: 11, int: 17, wis: 12, cha: 11,
      profs: [['ST Int', 6], ['ST Wis', 4], ['Arcana', 6]], resist: ['necrotic'], immune: [], vulnerable: [], condImmune: [], senses: { darkvision: '60 ft.', passive_perception: 11 },
      languages: 'Common, Abyssal', cr: 3, xp: 700, pb: 2,
      traits: [{ name: 'Raise the Dead', desc: 'Every 7 seconds in this game, the necromancer raises a Skeleton next to it (no more than three at a time). Raised skeletons give a third of their experience and no gold.' }],
      actions: [
        { name: 'Multiattack', desc: 'The necromancer makes two Necrotic Bolt attacks.' },
        { name: 'Necrotic Bolt', desc: 'Ranged Attack Roll: +5, range 120 ft. Hit: 9 (2d8) Necrotic damage.', hit: 5, dmg: [['2d8', 'necrotic']] },
        { name: 'Withering Touch', desc: 'Melee Attack Roll: +5, reach 5 ft. Hit: 7 (2d6) Necrotic damage.', hit: 5, dmg: [['2d6', 'necrotic']] },
      ], bonus: [], reactions: [], legendary: [], gear: 'Bone staff', homebrew: true,
    },
  ];

  // Claves de versiones anteriores del juego
  const LEGACY_ENEMY = { goblin: 'goblin-warrior', shaman: 'goblin-boss', warchief: 'orc-war-chief' };

  const OBJECTS = { start: { name: 'Entrada' }, exit: { name: 'Salida' }, chest: { name: 'Cofre' }, potion: { name: 'Poción de curación' } };

  const REWARDS = {
    chest: { gold: [15, 35], xp: 25 },
    potion: '2d4+2',          // Poción de curación (SRD): 2d4 + 2 PG
    exit: { gold: 25, xpPerLevel: 50 },
    deathGoldLoss: 0.1,       // al caer pierdes el 10% del oro
  };

  const MAX_ENEMIES = 60;
  const MAX_OBJECTS = 140;

  const walkable = (ch) => !!(TILES[ch] && TILES[ch].walk);
  const enemyKey = (k) => (ENEMIES[k] ? k : LEGACY_ENEMY[k] && ENEMIES[LEGACY_ENEMY[k]] ? LEGACY_ENEMY[k] : null);

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
      const ek = enemyKey(o.k);
      if (!ek && !Object.prototype.hasOwnProperty.call(OBJECTS, o.k)) continue;
      const k = o.x + ',' + o.y;
      if (used.has(k) || !walkable(tiles[o.y * W + o.x])) continue;
      if (o.k === 'start' && starts++) continue;
      if (o.k === 'exit' && exits++) continue;
      if (ek && ++enemies > MAX_ENEMIES) continue;
      used.add(k);
      objects.push({ k: ek || o.k, x: o.x, y: o.y });
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
    const map = { S: 'start', E: 'exit', c: 'chest', p: 'potion', g: 'goblin-warrior', o: 'orc', s: 'skeleton', z: 'zombie', N: 'necromancer' };
    let tiles = '';
    const objects = [];
    rows.forEach((row, y) => {
      for (let x = 0; x < W; x++) {
        const ch = row[x];
        if (map[ch]) { objects.push({ k: map[ch], x, y }); tiles += '.'; } else tiles += ch;
      }
    });
    return { name: 'La Cripta del Nigromante', tiles, objects };
  }

  const DUNGEON = { W, H, TILES, EDITOR_TILES, ENEMIES, HOMEBREW, LEGACY_ENEMY, OBJECTS, REWARDS, MAX_ENEMIES, walkable, enemyKey, validate, sample };
  if (typeof module !== 'undefined' && module.exports) module.exports = DUNGEON;
  else root.DUNGEON = DUNGEON;
})(this);
