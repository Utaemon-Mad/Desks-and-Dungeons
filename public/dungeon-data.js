// Casillas de las mazmorras y del mundo abierto, compartidas por el servidor y el navegador.
(function (root) {
  // Un carácter por casilla
  const TILES = {
    '#': { name: 'Muro', walk: false },
    '.': { name: 'Suelo', walk: true },
    '+': { name: 'Puerta', walk: true },
    '^': { name: 'Pinchos', walk: true, trap: true },
    '~': { name: 'Agua', walk: false },
    '%': { name: 'Lava', walk: false },
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
  const DUNGEON_CHARS = '#.+^~%';

  const walkable = (ch) => !!(TILES[ch] && TILES[ch].walk);

  const DUNGEON = { TILES, DUNGEON_CHARS, walkable, deathGoldLoss: 0.1 };
  if (typeof module !== 'undefined' && module.exports) module.exports = DUNGEON;
  else root.DUNGEON = DUNGEON;
})(this);
