// Reglas propias de Desks & Dungeons: 6 características (máximo natural 20), 5 razas, 7 clases y objetos al estilo
// de Diablo 2 (tipos base en tres niveles, requisitos de Fuerza/Destreza/Inteligencia, calidades, prefijos y sufijos
// según el nivel del objeto), conjuntos de clase, botín, monstruos escalados por nivel, habilidades, tiendas y bufos.
// Lo usan el servidor (que manda) y el navegador (para mostrar fichas, objetos y precios).
(function (root) {
  'use strict';
  // nombre y aspecto de cada base de armadura y de arma (4 variantes por nivel)
  const node = typeof module !== 'undefined' && module.exports;
  const ITEMDATA = node ? require('./items-data.js') : root.ITEMDATA;
  const MONSTERDATA = node ? require('./monsters-data.js') : root.MONSTERDATA;
  const TALENTDATA = node ? require('./talents-data.js') : root.TALENTDATA;

  const MAX_LEVEL = 50;
  const BAG_SIZE = 36;
  const RULES_VERSION = 2;    // perfiles guardados con reglas anteriores se convierten al cargarlos
  const STAT_BASE = 5;        // todas las características empiezan en 5 (más raza y clase)
  const STAT_MAX = 20;        // máximo natural (raza + clase + puntos); el equipo puede pasar de ahí
  const POINTS_START = 5;     // puntos libres al crear el personaje
  // 1 punto por nivel y otro más cada 5 niveles: no da para llegar a 20 en todo, hay que elegir
  const pointsTotal = (level) => POINTS_START + (level - 1) + Math.floor(level / 5);

  // ======================================================================
  //  Características
  // ======================================================================
  const STATS = [
    { id: 'fue', name: 'Fuerza', abbr: 'FUE', desc: 'Daño con espadas, hachas, mazas y armas pesadas (+5% por punto), capacidad de carga y requisito de armas y armaduras pesadas.' },
    { id: 'des', name: 'Destreza', abbr: 'DES', desc: 'Daño con arcos, ballestas y dagas (+5% por punto), puntería, esquiva, bloqueo con escudo y algo de armadura.' },
    { id: 'vig', name: 'Vigor', abbr: 'VIG', desc: 'Vida (más cuanto más nivel tienes), regeneración de vida y algo de resistencia mágica.' },
    { id: 'int', name: 'Inteligencia', abbr: 'INT', desc: 'Energía y su recuperación, poder de hechizos y curaciones, resistencia mágica y requisito de bastones, varitas y orbes.' },
    { id: 'car', name: 'Carisma', abbr: 'CAR', desc: 'Mejores precios en las tiendas, mascotas más fuertes y curaciones algo mejores.' },
    { id: 'sue', name: 'Suerte', abbr: 'SUE', desc: 'Golpes críticos, esquiva y hallazgo mágico (mejor botín).' },
  ];
  const STAT_IDS = STATS.map((s) => s.id);
  const statName = (id) => (STATS.find((s) => s.id === id) || {}).name || id;

  // Otros atributos que dan los objetos, conjuntos, razas y bufos
  const EXTRA = {
    hp: { name: 'Vida', fmt: (v) => `+${v} de vida` },
    en: { name: 'Energía', fmt: (v) => `+${v} de energía` },
    armor: { name: 'Armadura', fmt: (v) => `+${v} de armadura` },
    dmgPct: { name: 'Daño', fmt: (v) => `+${v}% de daño` },
    spellPct: { name: 'Hechizos', fmt: (v) => `+${v}% de daño de hechizos` },
    crit: { name: 'Crítico', fmt: (v) => `+${v}% de probabilidad de crítico` },
    critDmg: { name: 'Daño crítico', fmt: (v) => `+${v}% de daño crítico` },
    speed: { name: 'Velocidad de ataque', fmt: (v) => `+${v}% de velocidad de ataque` },
    move: { name: 'Velocidad', fmt: (v) => `+${v}% de velocidad al andar` },
    lifesteal: { name: 'Robo de vida', fmt: (v) => `${v}% del daño te cura` },
    mf: { name: 'Hallazgo mágico', fmt: (v) => `+${v}% de hallazgo mágico` },
    hpRegen: { name: 'Regeneración', fmt: (v) => `+${v} de vida por segundo` },
    enRegen: { name: 'Recuperación', fmt: (v) => `+${v} de energía por segundo` },
    cdr: { name: 'Enfriamiento', fmt: (v) => `-${v}% de espera de habilidades` },
    dodge: { name: 'Esquiva', fmt: (v) => `+${v}% de esquiva` },
    armorPct: { name: 'Armadura %', fmt: (v) => `+${v}% de armadura` },
    hpPct: { name: 'Vida %', fmt: (v) => `+${v}% de vida máxima` },
    healPct: { name: 'Curación', fmt: (v) => `+${v}% a tus curaciones` },
    hit: { name: 'Puntería', fmt: (v) => `+${v}% de puntería` },
    block: { name: 'Bloqueo', fmt: (v) => `+${v}% de probabilidad de bloquear` },
    resAll: { name: 'Resistencia mágica', fmt: (v) => `+${v}% de resistencia mágica` },
    undead: { name: 'Contra no muertos', fmt: (v) => `+${v}% de daño contra no muertos` },
  };
  // Daño elemental de las armas (se suma a cada golpe y no lo para la armadura)
  const ELEMENTS = {
    fuego: { name: 'fuego', icon: '🔥', color: '#ff7a2a' },
    frio: { name: 'frío', icon: '❄️', color: '#9ad8ff', slow: 1500 },
    rayo: { name: 'rayo', icon: '⚡', color: '#fff27a' },
    veneno: { name: 'veneno', icon: '☠️', color: '#7ad85a' },
  };
  function fmtStat(k, v) {
    if (STAT_IDS.includes(k)) return `+${v} ${statName(k)}`;
    return EXTRA[k] ? EXTRA[k].fmt(v) : `${k} ${v}`;
  }

  // ======================================================================
  //  Razas: modifican las características (todas suman +6) y dan un rasgo propio
  // ======================================================================
  const RACES = {
    human:  { name: 'Humano', mods: { fue: 1, des: 1, vig: 1, int: 1, car: 1, sue: 1 }, perk: {}, perkText: 'Versátil: +1 a todas las características.' },
    elf:    { name: 'Elfo', mods: { des: 3, int: 2, sue: 2, vig: -1 }, perk: { dodge: 3, hit: 5 }, perkText: 'Gracia élfica: +3% de esquiva y +5% de puntería.' },
    dwarf:  { name: 'Enano', mods: { fue: 2, vig: 4, sue: 1, car: -1 }, perk: { armorPct: 10, resAll: 5 }, perkText: 'Piel de piedra: +10% de armadura y +5% de resistencia mágica.' },
    orc:    { name: 'Orco', mods: { fue: 4, vig: 3, des: 1, int: -1, car: -1 }, perk: { dmgPct: 5, hpRegen: 0.5 }, perkText: 'Furia orca: +5% de daño y +0,5 de vida por segundo.' },
    goblin: { name: 'Goblin', mods: { des: 3, sue: 4, int: 1, fue: -2 }, perk: { mf: 15, move: 5 }, perkText: 'Codicia goblin: +15% de hallazgo mágico y +5% de velocidad al andar.' },
  };
  const RACE_IDS = Object.keys(RACES);
  // Especies de versiones anteriores → raza actual
  const LEGACY_RACE = { dragonborn: 'human', tiefling: 'human', halfling: 'human', gnome: 'dwarf', goliath: 'orc' };
  const raceId = (r) => (RACES[r] ? r : LEGACY_RACE[r] || 'human');
  const SEXES = { m: 'Hombre', f: 'Mujer' };

  // ======================================================================
  //  Clases (sus modificadores suman +8)
  // ======================================================================
  const ARMOR_TYPES = { tela: 'Tela', cuero: 'Cuero', malla: 'Malla', placas: 'Placas' };

  // weapons/armor: lo que la clase prefiere (el botín y las tiendas se inclinan hacia ello). Llevar cualquier cosa
  // depende sólo de los requisitos del objeto, como en Diablo 2.
  const CLASSES = {
    guerrero: {
      name: 'Guerrero', icon: '⚔️', main: 'fue', hp: 1.15, base: { fue: 4, vig: 3, des: 1 }, favored: ['fue', 'vig', 'des'],
      armor: ['cuero', 'malla', 'placas'], weapons: ['espada', 'hacha', 'maza', 'espadon', 'martillo', 'lanza', 'escudo'],
      start: [['arma', 'espada'], ['mano', 'escudo'], ['pecho', 'malla']],
      desc: 'Lucha en primera línea con armas pesadas y armadura de placas.',
    },
    mago: {
      name: 'Mago', icon: '🔮', main: 'int', hp: 0.9, base: { int: 5, sue: 2, car: 1 }, favored: ['int', 'sue', 'vig'],
      armor: ['tela'], weapons: ['baston', 'varita', 'orbe', 'daga'],
      start: [['arma', 'baston'], ['pecho', 'tela']],
      desc: 'Lanza hechizos a distancia: proyectiles, bolas de fuego y escarcha.',
    },
    explorador: {
      name: 'Explorador', icon: '🏹', main: 'des', hp: 1, base: { des: 5, vig: 1, sue: 2 }, favored: ['des', 'sue', 'vig'],
      armor: ['tela', 'cuero', 'malla'], weapons: ['arco', 'ballesta', 'daga', 'espada', 'lanza'],
      start: [['arma', 'arco'], ['pecho', 'cuero']],
      desc: 'Arquero certero que acribilla a los enemigos antes de que lleguen.',
    },
    picaro: {
      name: 'Pícaro', icon: '🗡️', main: 'des', hp: 0.95, base: { des: 4, sue: 3, car: 1 }, favored: ['des', 'sue', 'fue'],
      armor: ['tela', 'cuero'], weapons: ['daga', 'espada', 'arco', 'ballesta'],
      start: [['arma', 'daga'], ['pecho', 'cuero']],
      desc: 'Rápido y letal: puñaladas, venenos y muchos críticos.',
    },
    paladin: {
      name: 'Paladín', icon: '🛡️', main: 'fue', hp: 1.12, base: { fue: 3, vig: 3, car: 2 }, favored: ['fue', 'car', 'vig'],
      armor: ['malla', 'placas'], weapons: ['espada', 'maza', 'martillo', 'espadon', 'escudo'],
      start: [['arma', 'maza'], ['mano', 'escudo'], ['pecho', 'malla']],
      desc: 'Guerrero sagrado que golpea, protege al grupo y cura con las manos.',
    },
    sacerdote: {
      name: 'Sacerdote', icon: '✨', main: 'int', hp: 1.05, base: { int: 3, car: 3, vig: 2 }, favored: ['int', 'car', 'vig'],
      armor: ['tela', 'cuero', 'malla'], weapons: ['maza', 'baston', 'escudo', 'orbe'],
      start: [['arma', 'maza'], ['mano', 'escudo'], ['pecho', 'tela']],
      desc: 'Sana al grupo y castiga a los no muertos con llamas sagradas.',
    },
    druida: {
      name: 'Druida', icon: '🌿', main: 'int', hp: 1.05, base: { int: 4, vig: 3, des: 1 }, favored: ['int', 'vig', 'des'],
      armor: ['tela', 'cuero'], weapons: ['baston', 'lanza', 'hacha', 'daga', 'orbe'],
      start: [['arma', 'baston'], ['pecho', 'cuero']],
      desc: 'Guardián del bosque: zarzas venenosas, tormentas y raíces que atrapan.',
    },
  };
  const CLASS_IDS = Object.keys(CLASSES);
  // Clases de versiones anteriores del juego → clase actual
  const LEGACY_CLASS = {
    fighter: 'guerrero', barbarian: 'guerrero', wizard: 'mago', sorcerer: 'mago', ranger: 'explorador', druid: 'druida',
    rogue: 'picaro', monk: 'picaro', bard: 'picaro', warlock: 'mago', cleric: 'sacerdote', clerigo: 'sacerdote',
    brujo: 'mago', maga: 'mago', elfo: 'explorador', bardo: 'picaro',
  };
  const classId = (c) => (CLASSES[c] ? c : LEGACY_CLASS[c] || null);

  // ======================================================================
  //  Habilidades (4 por clase)
  // ======================================================================
  // kind: strike (golpe con el arma), bolt (hechizo a un objetivo), blast (área en un punto), nova (área alrededor),
  // cone, line, heal, healAll, buff (grupo), dash, blink, aura, mark (debilita al objetivo)
  const ABILITIES = {
    guerrero: [
      { id: 'golpe', lvl: 1, name: 'Golpe brutal', icon: '💥', cost: 10, cd: 4000, kind: 'strike', mult: 1.9, desc: 'Un golpe con el 190% del daño del arma.' },
      { id: 'torbellino', lvl: 3, name: 'Torbellino', icon: '🌀', cost: 20, cd: 7000, kind: 'nova', radius: 1, mult: 1.3, weapon: true, desc: 'Gira y golpea a todos los enemigos de alrededor (130%).' },
      { id: 'grito', lvl: 6, name: 'Grito de guerra', icon: '📣', cost: 25, cd: 25000, kind: 'buff', radius: 5, buff: { dmgPct: 30 }, dur: 10000, desc: 'El grupo hace un 30% más de daño durante 10 s.' },
      { id: 'carga', lvl: 10, name: 'Carga', icon: '🐂', cost: 20, cd: 12000, kind: 'dash', range: 6, mult: 1.6, stun: 1500, desc: 'Embiste a un enemigo lejano (160%) y lo aturde 1,5 s.' },
    ],
    mago: [
      { id: 'misiles', lvl: 1, name: 'Proyectiles mágicos', icon: '✨', cost: 8, cd: 2500, kind: 'bolt', range: 7, mult: 0.6, count: 3, desc: 'Tres proyectiles que nunca fallan (60% cada uno).' },
      { id: 'bola', lvl: 3, name: 'Bola de fuego', icon: '🔥', cost: 20, cd: 6000, kind: 'blast', range: 7, radius: 1, mult: 1.7, fx: 'fire', desc: 'Explota en un área de 3×3 (170%).' },
      { id: 'escarcha', lvl: 6, name: 'Nova de escarcha', icon: '❄️', cost: 25, cd: 12000, kind: 'nova', radius: 2, mult: 1.0, stun: 2000, fx: 'cold', desc: 'Congela a los enemigos cercanos 2 s (100%).' },
      { id: 'meteoro', lvl: 10, name: 'Meteoro', icon: '☄️', cost: 45, cd: 18000, kind: 'blast', range: 8, radius: 2, mult: 3.0, fx: 'fire', desc: 'Cae un meteoro en un área de 5×5 (300%).' },
    ],
    explorador: [
      { id: 'multiple', lvl: 1, name: 'Disparo múltiple', icon: '🎯', cost: 12, cd: 4000, kind: 'cone', range: 7, mult: 0.9, weapon: true, desc: 'Dispara en abanico a todos los enemigos de delante (90%).' },
      { id: 'perforante', lvl: 3, name: 'Flecha perforante', icon: '➶', cost: 15, cd: 6000, kind: 'line', range: 8, mult: 1.6, weapon: true, desc: 'Atraviesa a todos los enemigos en línea (160%).' },
      { id: 'lluvia', lvl: 6, name: 'Lluvia de flechas', icon: '🌧️', cost: 30, cd: 12000, kind: 'blast', range: 8, radius: 2, mult: 1.3, weapon: true, desc: 'Cubre de flechas un área de 5×5 (130%).' },
      { id: 'marca', lvl: 10, name: 'Marca del cazador', icon: '🎯', cost: 15, cd: 15000, kind: 'mark', range: 8, vuln: 40, dur: 10000, desc: 'El objetivo recibe un 40% más de daño de todos durante 10 s.' },
    ],
    picaro: [
      { id: 'punalada', lvl: 1, name: 'Puñalada', icon: '🗡️', cost: 12, cd: 4000, kind: 'strike', mult: 2.2, flank: 0.6, desc: 'Golpe del 220% (+60% si otro héroe está junto al objetivo).' },
      { id: 'veneno', lvl: 3, name: 'Hoja envenenada', icon: '☠️', cost: 15, cd: 8000, kind: 'strike', mult: 1.0, dot: 1.8, dur: 6000, desc: 'Golpea y envenena: 180% más de daño en 6 s.' },
      { id: 'sombra', lvl: 6, name: 'Paso sombrío', icon: '👤', cost: 20, cd: 10000, kind: 'blink', range: 6, desc: 'Aparece junto al objetivo; tu siguiente golpe es crítico.' },
      { id: 'abanico', lvl: 10, name: 'Abanico de cuchillos', icon: '🔪', cost: 30, cd: 10000, kind: 'nova', radius: 2, mult: 1.5, weapon: true, desc: 'Lanza cuchillos a todos los enemigos cercanos (150%).' },
    ],
    paladin: [
      { id: 'sagrado', lvl: 1, name: 'Golpe sagrado', icon: '🔆', cost: 12, cd: 5000, kind: 'strike', mult: 1.7, leech: 0.3, desc: 'Golpe del 170%; te cura el 30% del daño.' },
      { id: 'manos', lvl: 3, name: 'Imposición de manos', icon: '🙌', cost: 25, cd: 20000, kind: 'heal', range: 3, pct: 0.35, desc: 'Cura a un aliado cercano (o a ti) el 35% de su vida.' },
      { id: 'aura', lvl: 6, name: 'Aura de protección', icon: '🛡️', cost: 25, cd: 25000, kind: 'buff', radius: 5, buff: { dr: 25 }, dur: 10000, desc: 'El grupo recibe un 25% menos de daño durante 10 s.' },
      { id: 'juicio', lvl: 10, name: 'Martillo del juicio', icon: '🔨', cost: 30, cd: 12000, kind: 'blast', range: 6, radius: 1, mult: 2.0, stun: 1500, fx: 'holy', weapon: true, desc: 'Un martillo de luz golpea un área de 3×3 y aturde (200%).' },
    ],
    sacerdote: [
      { id: 'curar', lvl: 1, name: 'Curar heridas', icon: '💚', cost: 15, cd: 3000, kind: 'heal', range: 6, pct: 0.25, desc: 'Cura a un aliado (o a ti) el 25% de su vida, más tu poder.' },
      { id: 'llama', lvl: 3, name: 'Llama sagrada', icon: '🔥', cost: 10, cd: 3000, kind: 'bolt', range: 7, mult: 1.6, fx: 'holy', undead: 0.5, desc: 'Fuego divino (160%; +50% contra no muertos).' },
      { id: 'plegaria', lvl: 6, name: 'Plegaria de sanación', icon: '🙏', cost: 35, cd: 15000, kind: 'healAll', radius: 5, pct: 0.25, desc: 'Cura a todo el grupo cercano el 25% de su vida.' },
      { id: 'espiritus', lvl: 10, name: 'Espíritus guardianes', icon: '👼', cost: 35, cd: 20000, kind: 'aura', radius: 2, mult: 0.6, dur: 8000, fx: 'holy', desc: 'Espíritus que dañan cada segundo a los enemigos cercanos (60%) durante 8 s.' },
    ],
    druida: [
      { id: 'zarzas', lvl: 1, name: 'Zarzas venenosas', icon: '🌿', cost: 8, cd: 2500, kind: 'bolt', range: 7, mult: 0.8, dot: 1.2, dur: 5000, fx: 'nature', desc: 'Un látigo de espinas (80%) que envenena: 120% más en 5 s.' },
      { id: 'rejuvenecer', lvl: 3, name: 'Rejuvenecer', icon: '🍃', cost: 20, cd: 12000, kind: 'heal', range: 6, pct: 0.3, desc: 'La savia del bosque cura a un aliado (o a ti) el 30% de su vida.' },
      { id: 'tormenta', lvl: 6, name: 'Tormenta', icon: '⛈️', cost: 30, cd: 12000, kind: 'blast', range: 8, radius: 2, mult: 1.5, fx: 'lightning', desc: 'Rayos sobre un área de 5×5 (150%).' },
      { id: 'raices', lvl: 10, name: 'Raíces del bosque', icon: '🌳', cost: 30, cd: 16000, kind: 'nova', radius: 2, mult: 0.9, stun: 2500, fx: 'nature', desc: 'Raíces que atrapan a los enemigos cercanos 2,5 s (90%).' },
    ],
  };
  const ABILITY_BY_ID = {};
  for (const [cls, list] of Object.entries(ABILITIES)) for (const a of list) ABILITY_BY_ID[a.id] = { ...a, cls };

  // ======================================================================
  //  Experiencia y puntos
  // ======================================================================
  const XP_TABLE = [0, 0]; // XP_TABLE[n] = experiencia total para llegar al nivel n
  for (let L = 1; L < MAX_LEVEL; L++) XP_TABLE.push(XP_TABLE[L] + Math.round(60 * L + 40 * L * L));
  function levelFromXp(xp) {
    let L = 1;
    while (L < MAX_LEVEL && xp >= XP_TABLE[L + 1]) L++;
    return L;
  }
  const pointsSpent = (char) => STAT_IDS.reduce((t, k) => t + (char.alloc[k] || 0), 0);
  const pointsFree = (char, level) => Math.max(0, pointsTotal(level) - pointsSpent(char));

  // Características base: 5 en todo + raza + clase (sin pasar de 20)
  function baseStats(char) {
    const s = Object.fromEntries(STAT_IDS.map((k) => [k, STAT_BASE]));
    const R = RACES[raceId(char.look && char.look.species)];
    for (const [k, v] of Object.entries(R.mods)) s[k] += v;
    for (const [k, v] of Object.entries((CLASSES[char.cls] || CLASSES.guerrero).base)) s[k] += v;
    for (const k of STAT_IDS) s[k] = Math.max(1, Math.min(STAT_MAX, s[k]));
    return s;
  }
  // Cuánto se puede subir cada característica con puntos (hasta el máximo natural)
  const statRoom = (char, k) => Math.max(0, STAT_MAX - baseStats(char)[k] - (char.alloc[k] || 0));

  // ======================================================================
  //  Objetos al estilo Diablo 2
  // ======================================================================
  const SLOTS = {
    arma: { name: 'Arma', icon: '⚔️' },
    mano: { name: 'Mano izquierda', icon: '🛡️' },
    casco: { name: 'Cabeza', icon: '⛑️' },
    pecho: { name: 'Pecho', icon: '🥋' },
    guantes: { name: 'Manos', icon: '🧤' },
    botas: { name: 'Pies', icon: '🥾' },
    amuleto: { name: 'Amuleto', icon: '📿' },
    anillo: { name: 'Anillo', icon: '💍' },
  };
  const SLOT_IDS = Object.keys(SLOTS);

  // Tres niveles de cada tipo base, como en Diablo 2: normal, excepcional y élite. Cada nivel aparece a partir de
  // un nivel de objeto, pega más y pide más Fuerza/Destreza/Inteligencia.
  const TIERS = [
    { name: 'Normal', lvl: 1, mult: 1 },
    { name: 'Excepcional', lvl: 18, mult: 2.4 },
    { name: 'Élite', lvl: 34, mult: 4.2 },
  ];
  const TIER_GROWTH = 0.025; // dentro de su nivel, cada nivel de objeto de más pega un 2,5% más (hasta +40%)

  // dmg: daño del nivel normal; stat: qué características suben el daño (×5% por punto, como la Fuerza en Diablo 2);
  // ms: milisegundos entre golpes; g: género del nombre (m, f, mp, fp) para concordar los adjetivos
  const WEAPONS = {
    espada:   { name: 'Espada', kind: 'melee', hands: 1, range: 1, ms: 900, dmg: [4, 8], stat: { fue: 1 }, weight: 3,
      tiers: [['Espada corta', 'f', { fue: 5 }], ['Espada de guerra', 'f', { fue: 10, des: 6 }], ['Hoja fásica', 'f', { fue: 14, des: 9 }]] },
    daga:     { name: 'Daga', kind: 'melee', hands: 1, range: 1, ms: 650, dmg: [3, 6], stat: { fue: 0.75, des: 0.75 }, weight: 1,
      tiers: [['Daga', 'f', { des: 4 }], ['Puñal', 'm', { des: 9 }], ['Cuchillo de hueso', 'm', { des: 14 }]] },
    hacha:    { name: 'Hacha', kind: 'melee', hands: 1, range: 1, ms: 1050, dmg: [5, 10], stat: { fue: 1 }, weight: 4,
      tiers: [['Hacha de mano', 'f', { fue: 6 }], ['Hacha de guerra', 'f', { fue: 11 }], ['Tomahawk', 'm', { fue: 15, des: 6 }]] },
    maza:     { name: 'Maza', kind: 'melee', hands: 1, range: 1, ms: 1000, dmg: [5, 9], stat: { fue: 1 }, weight: 4, undead: 50,
      tiers: [['Maza', 'f', { fue: 4 }], ['Maza con rebordes', 'f', { fue: 10 }], ['Maza reforzada', 'f', { fue: 15 }]] },
    espadon:  { name: 'Mandoble', kind: 'melee', hands: 2, range: 1, ms: 1350, dmg: [10, 17], stat: { fue: 1 }, weight: 7,
      tiers: [['Mandoble', 'm', { fue: 8, des: 4 }], ['Montante', 'm', { fue: 13, des: 7 }], ['Espada de campeón', 'f', { fue: 17, des: 10 }]] },
    martillo: { name: 'Martillo de guerra', kind: 'melee', hands: 2, range: 1, ms: 1400, dmg: [11, 16], stat: { fue: 1 }, weight: 8, undead: 50,
      tiers: [['Martillo de guerra', 'm', { fue: 9 }], ['Martillo de batalla', 'm', { fue: 14 }], ['Martillo legendario', 'm', { fue: 18 }]] },
    lanza:    { name: 'Lanza', kind: 'melee', hands: 2, range: 2, ms: 1150, dmg: [7, 12], stat: { fue: 1 }, weight: 5,
      tiers: [['Lanza', 'f', { fue: 6, des: 4 }], ['Lanza de guerra', 'f', { fue: 11, des: 8 }], ['Lanza de Hiperión', 'f', { fue: 15, des: 11 }]] },
    arco:     { name: 'Arco', kind: 'ranged', hands: 2, range: 7, ms: 1000, dmg: [4, 9], stat: { des: 1 }, weight: 2,
      tiers: [['Arco corto', 'm', { des: 5 }], ['Arco de filo', 'm', { des: 10, fue: 5 }], ['Arco araña', 'm', { des: 15, fue: 7 }]] },
    ballesta: { name: 'Ballesta', kind: 'ranged', hands: 2, range: 8, ms: 1450, dmg: [7, 13], stat: { des: 1 }, weight: 5,
      tiers: [['Ballesta ligera', 'f', { fue: 5, des: 5 }], ['Ballesta de asedio', 'f', { fue: 10, des: 9 }], ['Ballesta colosal', 'f', { fue: 14, des: 13 }]] },
    baston:   { name: 'Bastón', kind: 'magic', hands: 2, range: 6, ms: 1100, dmg: [5, 10], stat: { int: 1 }, weight: 3,
      tiers: [['Bastón corto', 'm', { int: 4 }], ['Bastón de guerra', 'm', { int: 9 }], ['Báculo arcano', 'm', { int: 14 }]] },
    varita:   { name: 'Varita', kind: 'magic', hands: 1, range: 6, ms: 800, dmg: [3, 7], stat: { int: 1 }, weight: 1,
      tiers: [['Varita', 'f', { int: 5 }], ['Varita quemada', 'f', { int: 10 }], ['Varita pulida', 'f', { int: 15 }]] },
  };
  const FISTS = { name: 'Puños', kind: 'melee', hands: 1, range: 1, ms: 800, dmg: [1, 3], stat: { fue: 1 } };
  const OFFHANDS = {
    escudo: { name: 'Escudo', armor: 6, block: [10, 14, 18], weight: 5,
      tiers: [['Escudo redondo', 'm', { fue: 3 }], ['Escudo de guerra', 'm', { fue: 8 }], ['Escudo de torre', 'm', { fue: 13 }]] },
    orbe:   { name: 'Orbe', spell: [8, 14, 20], weight: 1,
      tiers: [['Orbe de águila', 'm', { int: 4 }], ['Orbe resplandeciente', 'm', { int: 9 }], ['Fragmento dimensional', 'm', { int: 14 }]] },
  };
  const ARMOR_BASE = { tela: 2, cuero: 4, malla: 6, placas: 8 };
  const ARMOR_SLOT = { casco: 0.6, pecho: 1.4, guantes: 0.4, botas: 0.5 };
  const ARMOR_REQ = { tela: [0, 0, 0], cuero: [2, 5, 8], malla: [4, 8, 12], placas: [7, 11, 15] };
  // Bases de armadura al estilo de Diablo 2: por ranura, tipo y nivel (normal, excepcional, élite), dos variantes
  // cada una (it.sk = 0 o 1). Cada base tiene su aspecto en el modelo 3D (public/armor3d.js).
  const ARMOR_SKINS = ITEMDATA.ARMOR; // [ranura][tipo][nivel][variante] = [nombre, género, aspecto]
  const WEAPON_SKINS = ITEMDATA.WEAPONS; // [tipo][nivel][variante] = [nombre, género, aspecto]
  // variante guardada en el objeto (las de partidas viejas eran 0 o 1), dentro de las que hay
  const skin = (list, sk) => list[Math.min(list.length - 1, Math.max(0, sk | 0))];

  const JEWELS = { amuleto: { name: 'Amuleto', g: 'm' }, anillo: { name: 'Anillo', g: 'm' } };

  // Concordancia de adjetivos: g = m, f, mp, fp
  function adj(word, g) {
    if (!word) return '';
    const fem = g === 'f' || g === 'fp', pl = g === 'mp' || g === 'fp';
    let w = word;
    if (fem) { if (/o$/.test(w)) w = w.slice(0, -1) + 'a'; else if (/(or|ón|án)$/.test(w)) w = w.replace(/ón$/, 'ona').replace(/án$/, 'ana').replace(/or$/, 'ora'); }
    if (pl) { if (/z$/.test(w)) w = w.slice(0, -1) + 'ces'; else if (/[aeiouáéó]$/.test(w)) w += 's'; else w += 'es'; }
    return w.replace(/ónes$/, 'ones').replace(/ánes$/, 'anes');
  }

  // Calidades (rarezas) de Diablo 2: inferior, normal, superior, mágico (azul), raro (amarillo), único (dorado) y de
  // conjunto (verde). chance: probabilidad por enemigo; mult: poder de los afijos; value: precio
  const RARITIES = {
    inferior:  { name: 'Inferior', chance: 0.08, color: '#9a9a9a', mult: 1, value: 0.5 },
    normal:    { name: 'Normal', chance: 0.30, color: '#e8e4d8', mult: 1, value: 1 },
    superior:  { name: 'Superior', chance: 0.10, color: '#ffffff', mult: 1, value: 1.6 },
    magico:    { name: 'Mágico', chance: 0.20, color: '#7a8cff', mult: 1, value: 3 },
    raro:      { name: 'Raro', chance: 0.05, color: '#ffe24a', mult: 1, value: 8 },
    unico:     { name: 'Único', chance: 0.01, color: '#c8a46a', mult: 1, value: 25 },
    conjunto:  { name: 'Conjunto', chance: 0, color: '#3ee67a', mult: 1, value: 30 },
  };
  const RARITY_ORDER = ['inferior', 'normal', 'superior', 'magico', 'raro', 'unico', 'conjunto'];
  // Rarezas de versiones anteriores → actuales (antes «raro» era el azul)
  const LEGACY_RARITY = { comun: 'normal', raro: 'magico', epico: 'raro', legendario: 'unico' };
  const INFERIOR_WORDS = ['agrietado', 'dañado', 'tosco', 'mellado'];

  // Afijos: p = prefijo (adjetivo tras el nombre: «Espada corta cruel»), s = sufijo («… del Zorro»). Cada escalón:
  // [nivel mínimo del objeto, valor mínimo, valor máximo, nombre]. Los elementales dan el daño medio del escalón.
  const AFFIXES = {
    ed:       { p: 1, slots: ['arma'], label: 'daño mejorado', tiers: [[1, 10, 20, 'dentado'], [5, 21, 30, 'mortífero'], [11, 31, 45, 'cruel'], [18, 46, 60, 'brutal'], [27, 61, 80, 'masivo'], [35, 81, 100, 'salvaje'], [43, 101, 130, 'despiadado'], [50, 131, 170, 'feroz']] },
    edDef:    { p: 1, slots: ['mano', 'casco', 'pecho', 'guantes', 'botas'], label: 'defensa mejorada', tiers: [[1, 10, 20, 'robusto'], [6, 21, 30, 'fuerte'], [12, 31, 40, 'glorioso'], [20, 41, 50, 'bendito'], [28, 51, 65, 'santo'], [36, 66, 80, 'sagrado'], [45, 81, 100, 'divino']] },
    hit:      { p: 1, slots: ['arma', 'guantes', 'anillo', 'amuleto'], tiers: [[1, 2, 4, 'certero'], [10, 5, 8, 'preciso'], [22, 9, 13, 'infalible'], [38, 14, 18, 'implacable']] },
    critDmg:  { p: 1, slots: ['arma', 'guantes', 'amuleto'], tiers: [[8, 10, 20, 'afilado'], [22, 21, 35, 'letal'], [38, 36, 50, 'aniquilador']] },
    dmgPct:   { p: 1, slots: ['guantes', 'anillo', 'amuleto'], tiers: [[8, 3, 5, 'fiero'], [20, 6, 9, 'furioso'], [36, 10, 14, 'colérico']] },
    spellPct: { p: 1, slots: ['arma', 'mano', 'amuleto', 'casco'], magic: true, tiers: [[1, 8, 15, 'hechizado'], [12, 16, 28, 'rúnico'], [26, 29, 42, 'sibilino'], [42, 43, 60, 'apocalíptico']] },
    en:       { p: 1, slots: ['arma', 'mano', 'casco', 'pecho', 'amuleto', 'anillo'], tiers: [[1, 5, 10, 'místico'], [12, 11, 20, 'encantado'], [28, 21, 35, 'sobrenatural']] },
    resAll:   { p: 1, slots: ['mano', 'casco', 'pecho', 'botas', 'amuleto', 'anillo'], tiers: [[12, 4, 8, 'prismático'], [26, 9, 14, 'irisado'], [40, 15, 20, 'caleidoscópico']] },
    dodge:    { p: 1, slots: ['pecho', 'guantes', 'botas'], tiers: [[6, 2, 3, 'escurridizo'], [20, 4, 6, 'evasivo'], [36, 7, 9, 'fantasmal']] },
    healPct:  { p: 1, slots: ['mano', 'pecho', 'amuleto'], tiers: [[6, 5, 10, 'sanador'], [20, 11, 18, 'piadoso'], [36, 19, 28, 'milagroso']] },
    fue:      { s: 1, slots: ['arma', 'casco', 'pecho', 'guantes', 'botas', 'amuleto', 'anillo', 'mano'], tiers: [[1, 1, 2, 'de Fuerza'], [8, 3, 4, 'del Poderío'], [18, 5, 7, 'del Buey'], [30, 8, 11, 'del Gigante'], [44, 12, 15, 'del Titán']] },
    des:      { s: 1, slots: ['arma', 'casco', 'pecho', 'guantes', 'botas', 'amuleto', 'anillo', 'mano'], tiers: [[1, 1, 2, 'de la Destreza'], [8, 3, 4, 'de la Habilidad'], [18, 5, 7, 'de la Precisión'], [30, 8, 11, 'de la Maestría'], [44, 12, 15, 'de la Perfección']] },
    vig:      { s: 1, slots: ['arma', 'casco', 'pecho', 'guantes', 'botas', 'amuleto', 'anillo', 'mano'], tiers: [[1, 1, 2, 'de la Vida'], [8, 3, 4, 'de la Vitalidad'], [18, 5, 7, 'del Aguante'], [30, 8, 11, 'de la Robustez'], [44, 12, 15, 'de la Inmortalidad']] },
    int:      { s: 1, slots: ['arma', 'casco', 'pecho', 'guantes', 'botas', 'amuleto', 'anillo', 'mano'], tiers: [[1, 1, 2, 'de la Energía'], [8, 3, 4, 'de la Mente'], [18, 5, 7, 'de la Brillantez'], [30, 8, 11, 'de la Hechicería'], [44, 12, 15, 'del Archimago']] },
    car:      { s: 1, slots: ['casco', 'pecho', 'amuleto', 'anillo', 'mano'], tiers: [[1, 1, 2, 'del Orador'], [8, 3, 4, 'del Diplomático'], [18, 5, 7, 'del Embajador'], [30, 8, 11, 'del Príncipe'], [44, 12, 15, 'del Rey']] },
    sue:      { s: 1, slots: ['arma', 'casco', 'guantes', 'botas', 'amuleto', 'anillo'], tiers: [[1, 1, 2, 'del Trébol'], [8, 3, 4, 'de la Suerte'], [18, 5, 7, 'del Azar'], [30, 8, 11, 'del Destino'], [44, 12, 15, 'de los Dioses']] },
    hp:       { s: 1, slots: ['mano', 'casco', 'pecho', 'guantes', 'botas', 'amuleto', 'anillo'], tiers: [[1, 5, 10, 'del Chacal'], [6, 11, 20, 'del Zorro'], [12, 21, 35, 'del Lobo'], [20, 36, 55, 'del Tigre'], [30, 56, 80, 'del Mamut'], [42, 81, 120, 'del Coloso']] },
    minDmg:   { s: 1, slots: ['arma'], tiers: [[1, 1, 2, 'del Artesano'], [12, 3, 5, 'del Herrero'], [30, 6, 10, 'del Maestro Forjador']] },
    maxDmg:   { s: 1, slots: ['arma'], tiers: [[1, 2, 4, 'de la Herida'], [10, 5, 8, 'de la Mutilación'], [24, 9, 15, 'de la Carnicería'], [40, 16, 25, 'de la Masacre']] },
    fuego:    { s: 1, slots: ['arma'], elem: 1, tiers: [[3, 2, 4, 'de la Llama'], [14, 6, 10, 'del Ardor'], [28, 12, 18, 'de la Incineración'], [42, 20, 30, 'del Infierno']] },
    frio:     { s: 1, slots: ['arma'], elem: 1, tiers: [[3, 2, 3, 'de la Escarcha'], [14, 5, 8, 'del Carámbano'], [28, 10, 15, 'del Glaciar'], [42, 16, 24, 'del Invierno Eterno']] },
    rayo:     { s: 1, slots: ['arma'], elem: 1, tiers: [[3, 2, 5, 'de la Chispa'], [14, 6, 12, 'del Relámpago'], [28, 13, 22, 'del Trueno'], [42, 23, 36, 'de la Tempestad']] },
    veneno:   { p: 1, slots: ['arma'], elem: 1, tiers: [[3, 3, 5, 'emponzoñado'], [14, 7, 11, 'venenoso'], [28, 13, 20, 'pestilente'], [42, 22, 32, 'virulento']] },
    lifesteal: { s: 1, slots: ['arma', 'guantes', 'anillo', 'amuleto'], tiers: [[4, 2, 3, 'de la Sanguijuela'], [16, 4, 5, 'de la Lamprea'], [32, 6, 8, 'del Vampiro']] },
    speed:    { s: 1, slots: ['arma', 'guantes'], tiers: [[3, 8, 12, 'de la Presteza'], [14, 13, 20, 'de la Celeridad'], [28, 21, 30, 'de la Rapidez']] },
    crit:     { s: 1, slots: ['arma', 'guantes', 'anillo', 'amuleto'], tiers: [[5, 2, 3, 'del Halcón'], [18, 4, 6, 'del Águila'], [34, 7, 10, 'del Grifo']] },
    mf:       { s: 1, slots: ['casco', 'guantes', 'botas', 'amuleto', 'anillo'], tiers: [[5, 5, 10, 'del Buscador'], [16, 11, 20, 'del Tesoro'], [30, 21, 35, 'de la Fortuna']] },
    hpRegen:  { s: 1, slots: ['pecho', 'casco', 'anillo', 'amuleto'], dec: 1, tiers: [[4, 1, 2, 'de la Regeneración'], [18, 3, 4, 'del Trol'], [34, 5, 7, 'de la Hidra']] },
    enRegen:  { s: 1, slots: ['arma', 'mano', 'casco', 'pecho', 'anillo', 'amuleto'], dec: 1, tiers: [[4, 1, 2, 'del Manantial'], [18, 3, 4, 'de la Fuente'], [34, 5, 6, 'del Torrente']] },
    move:     { s: 1, slots: ['botas'], tiers: [[1, 8, 12, 'del Viento'], [15, 13, 18, 'de la Prisa'], [30, 19, 25, 'del Relámpago Veloz']] },
    cdr:      { s: 1, slots: ['casco', 'amuleto', 'anillo'], tiers: [[10, 3, 5, 'del Monje'], [24, 6, 8, 'del Sabio'], [40, 9, 12, 'del Iluminado']] },
    block:    { s: 1, slots: ['mano'], shield: 1, tiers: [[1, 4, 7, 'del Bloqueo'], [15, 8, 11, 'de la Desviación'], [30, 12, 16, 'del Baluarte']] },
  };
  // Nombres de los objetos raros (dos palabras al azar, como «Mordisco Lúgubre» en Diablo 2)
  const RARE_A = ['Mordisco', 'Grito', 'Colmillo', 'Tormenta', 'Pesadilla', 'Ruina', 'Sombra', 'Llanto', 'Espina', 'Ira', 'Plaga', 'Eco', 'Garra', 'Calavera', 'Brasa', 'Hueso', 'Lamento', 'Furia', 'Aullido', 'Presagio', 'Veneno', 'Juramento', 'Corona', 'Ala'];
  const RARE_B = ['Lúgubre', 'Cruel', 'Feroz', 'del Cuervo', 'de Hierro', 'de la Noche', 'del Abismo', 'del Ocaso', 'de Ceniza', 'de la Tumba', 'de Sangre', 'de Escarcha', 'del Trueno', 'de Medianoche', 'Voraz', 'Salvaje', 'del Lobo', 'de Plata'];
  // Objetos legendarios: únicos muy raros con un poder que cambia cómo juegas (it.leg)
  const LEGENDARY = {
    rebote: { name: 'Rebote', icon: '⚡', desc: 'Tus disparos, rayos y golpes a distancia rebotan a otro enemigo cercano con el 60% del daño.' },
    estallido: { name: 'Estallido', icon: '💥', desc: 'Los enemigos que matas estallan y hieren a los de alrededor con el 30% de su vida máxima.' },
    sed: { name: 'Sed de sangre', icon: '🩸', desc: 'Cada enemigo que matas te cura el 6% de tu vida máxima.' },
    frenesi: { name: 'Frenesí', icon: '🌪️', desc: 'Al matar ganas un 30% de velocidad de ataque y de movimiento durante 4 s.' },
    egida: { name: 'Égida', icon: '🛡️', desc: 'Si bajas del 30% de vida, un escudo absorbe daño igual al 35% de tu vida máxima (cada 45 s).' },
    trueno: { name: 'Trueno', icon: '🌩️', desc: 'Cada cuarto golpe con el arma cae un rayo sobre el objetivo (150% del daño) que salta a 2 enemigos más.' },
    eco: { name: 'Eco', icon: '🔁', desc: 'Tus habilidades tienen un 25% de probabilidad de no gastar energía ni tiempo de espera.' },
  };
  const LEGENDARY_COLOR = '#ff8a1a';
  const itemColor = (it) => (it && it.leg ? LEGENDARY_COLOR : (RARITIES[it && it.rarity] || RARITIES.normal).color);

  const UNIQUE_NAMES = {
    arma: ['Filo del Alba', 'Llanto de la Viuda', 'Segadora de Almas', 'Colmillo de Medianoche', 'Juramento Roto', 'Ira del Dragón', 'Susurro del Vacío', 'Lamento del Rey', 'Aguijón de Ceniza', 'Furia Carmesí'],
    mano: ['Bastión Inquebrantable', 'Esfera del Eclipse', 'Muro de los Mártires', 'Corazón de Tormenta'],
    casco: ['Corona del Rey Hueco', 'Mirada del Basilisco', 'Yelmo de los Mil Ecos'],
    pecho: ['Égida del Último Rey', 'Piel del Leviatán', 'Manto de la Noche Eterna', 'Vestigio del Titán'],
    guantes: ['Garras del Wendigo', 'Manos del Verdugo', 'Toque de la Plaga'],
    botas: ['Pasos del Espectro', 'Andar del Peregrino', 'Huella de Ceniza'],
    amuleto: ['Corazón de Brasas', 'Lágrima de la Luna', 'Sello del Abismo'],
    anillo: ['Estrella del Peregrino', 'Anillo del Ahorcado', 'Ojo del Cuervo'],
  };

  // Conjuntos de clase: equipo muy fuerte que sólo sueltan los jefes
  const SETS = {
    guerrero: { name: 'Furia del Coloso', pieces: [['arma', 'espadon', 'Mandoble del Coloso'], ['casco', 'placas', 'Yelmo del Coloso'], ['pecho', 'placas', 'Coraza del Coloso'], ['guantes', 'placas', 'Puños del Coloso']], b2: { fue: 4, hp: 60 }, b4: { dmgPct: 25, armorPct: 20 } },
    mago: { name: 'Tejido del Archimago', pieces: [['arma', 'baston', 'Bastón del Archimago'], ['casco', 'tela', 'Capucha del Archimago'], ['pecho', 'tela', 'Túnica del Archimago'], ['botas', 'tela', 'Sandalias del Archimago']], b2: { int: 4, en: 40 }, b4: { spellPct: 25, cdr: 15 } },
    explorador: { name: 'Sendero del Cazador', pieces: [['arma', 'arco', 'Arco del Cazador'], ['casco', 'cuero', 'Gorro del Cazador'], ['pecho', 'cuero', 'Jubón del Cazador'], ['botas', 'cuero', 'Botas del Cazador']], b2: { des: 4, crit: 5 }, b4: { dmgPct: 20, speed: 15 } },
    picaro: { name: 'Sombra de Medianoche', pieces: [['arma', 'daga', 'Daga de Medianoche'], ['casco', 'cuero', 'Capucha de Medianoche'], ['pecho', 'cuero', 'Jubón de Medianoche'], ['guantes', 'cuero', 'Guantes de Medianoche']], b2: { des: 4, crit: 6 }, b4: { critDmg: 60, dodge: 8 } },
    paladin: { name: 'Juramento del Alba', pieces: [['arma', 'maza', 'Maza del Alba'], ['mano', 'escudo', 'Escudo del Alba'], ['pecho', 'placas', 'Coraza del Alba'], ['casco', 'placas', 'Yelmo del Alba']], b2: { fue: 3, car: 3 }, b4: { armorPct: 30, lifesteal: 5 } },
    sacerdote: { name: 'Luz de la Catedral', pieces: [['arma', 'maza', 'Maza de la Catedral'], ['mano', 'escudo', 'Escudo de la Catedral'], ['pecho', 'malla', 'Cota de la Catedral'], ['casco', 'malla', 'Almófar de la Catedral']], b2: { int: 3, vig: 3 }, b4: { healPct: 40, armorPct: 20 } },
    druida: { name: 'Círculo del Gran Roble', pieces: [['arma', 'baston', 'Bastón del Gran Roble'], ['casco', 'cuero', 'Corona de Astas'], ['pecho', 'cuero', 'Jubón del Gran Roble'], ['botas', 'cuero', 'Botas del Gran Roble']], b2: { int: 3, vig: 3 }, b4: { spellPct: 20, hpRegen: 5 } },
  };
  const LEGACY_SET = { clerigo: 'sacerdote', brujo: 'mago' };

  // ---------- Generación ----------
  const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
  const round1 = (v) => Math.round(v * 10) / 10;
  const uid = (rng) => Array.from({ length: 10 }, () => Math.floor(rng() * 36).toString(36)).join('');

  // Hallazgo mágico con rendimientos decrecientes, como en Diablo 2 (cuenta menos para únicos y raros)
  function rollRarity(rng, mf = 0) {
    const eff = { unico: (mf * 250) / (mf + 250), raro: (mf * 600) / (mf + 600), magico: mf };
    const r = rng();
    let acc = 0;
    for (const id of ['unico', 'raro', 'magico', 'superior', 'normal', 'inferior']) {
      const k = eff[id] !== undefined ? 1 + Math.max(0, eff[id]) / 100 : 1;
      acc += Math.min(0.6, RARITIES[id].chance * k);
      if (r < acc) return id;
    }
    return null;
  }

  // Tipos de objeto que prefieren estas clases (para el botín "inteligente" y las tiendas)
  function allowedBases(classes) {
    const weapons = new Set(), armor = new Set();
    for (const c of classes) { if (!CLASSES[c]) continue; for (const w of CLASSES[c].weapons) weapons.add(w); for (const a of CLASSES[c].armor) armor.add(a); }
    return { weapons: [...weapons], armor: [...armor] };
  }

  // Nivel (normal, excepcional, élite) de un tipo base que cae con este nivel de objeto: el más alto posible el 60%
  function rollTier(rng, ilvl) {
    let t = TIERS.reduce((best, T, i) => (ilvl >= T.lvl ? i : best), 0);
    while (t > 0 && rng() > 0.6) t--;
    return t;
  }
  const tierGrowth = (tier, ilvl) => 1 + TIER_GROWTH * Math.max(0, Math.min(16, ilvl - TIERS[tier].lvl));

  // Datos del tipo base de un objeto: nombre, género, requisitos y daño/armadura base
  function baseInfo(it) {
    const tier = it.tier || 0;
    if (it.slot === 'arma' && WEAPONS[it.base]) {
      const W = WEAPONS[it.base];
      const [name, g] = skin(WEAPON_SKINS[it.base][tier], it.sk);
      return { name, g, req: W.tiers[tier][2], W };
    }
    if (it.slot === 'mano' && OFFHANDS[it.base]) {
      const O = OFFHANDS[it.base];
      const [name, g] = skin(WEAPON_SKINS[it.base][tier], it.sk);
      return { name, g, req: O.tiers[tier][2], O };
    }
    if (ARMOR_SLOT[it.slot] && ARMOR_SKINS[it.slot][it.type]) {
      const [name, g] = skin(ARMOR_SKINS[it.slot][it.type][Math.min(2, tier)], it.sk);
      const fue = ARMOR_REQ[it.type][tier];
      return { name, g, req: fue ? { fue } : {} };
    }
    if (JEWELS[it.slot]) return { name: JEWELS[it.slot].name, g: JEWELS[it.slot].g, req: {} };
    return { name: it.name || '?', g: 'm', req: {} };
  }

  // Escalón de un afijo para un nivel de objeto (al azar entre los posibles; best: de los dos más altos)
  function affixTier(rng, A, ilvl, best) {
    const ok = A.tiers.filter((t) => t[0] <= ilvl);
    if (!ok.length) return null;
    return best ? ok[Math.max(0, ok.length - 1 - Math.floor(rng() * 2))] : pick(rng, ok);
  }
  function rollAffixValue(rng, A, T) {
    const v = T[1] + rng() * (T[2] - T[1]);
    return A.dec ? round1(v) : Math.round(v);
  }

  // Afijos posibles para un objeto (los de hechizos sólo en armas mágicas y orbes; bloqueo sólo en escudos)
  function affixPool(it, ilvl) {
    const magicW = (it.slot === 'arma' && WEAPONS[it.base] && WEAPONS[it.base].kind === 'magic') || (it.slot === 'mano' && it.base === 'orbe');
    return Object.keys(AFFIXES).filter((k) => {
      const A = AFFIXES[k];
      if (!A.slots.includes(it.slot)) return false;
      if (ilvl && A.tiers[0][0] > ilvl) return false;
      if (A.magic && !magicW && it.slot !== 'amuleto' && it.slot !== 'casco') return false;
      if (A.shield && it.base !== 'escudo') return false;
      if (it.slot === 'mano' && it.base === 'orbe' && (k === 'edDef' || k === 'block')) return false;
      return true;
    });
  }

  // o: { ilvl, rarity, slot?, base?, tier?, classes? (para quién es), set? (clase del conjunto), piece?, type? }
  function makeItem(rng, o) {
    const ilvl = Math.max(1, Math.min(MAX_LEVEL + 5, o.ilvl | 0 || 1));
    let rarity = o.rarity || 'normal';
    const classes = (o.classes || []).filter((c) => CLASSES[c]);
    const fit = classes.length ? allowedBases(classes) : null;
    const it = { id: uid(rng), rarity, ilvl, stats: {}, v: RULES_VERSION };
    let slot = o.slot, base = o.base;
    if (o.set) {
      const piece = o.piece || pick(rng, SETS[o.set].pieces);
      [slot, base] = piece;
      it.name = piece[2];
      it.set = o.set;
    }
    if (!slot) {
      const r = rng();
      slot = r < 0.34 ? 'arma' : r < 0.44 ? 'mano' : r < 0.58 ? 'pecho' : r < 0.68 ? 'casco' : r < 0.77 ? 'guantes' : r < 0.86 ? 'botas' : r < 0.93 ? 'amuleto' : 'anillo';
    }
    if (slot === 'mano' && fit && !fit.weapons.some((w) => OFFHANDS[w]) && rng() < 0.7) slot = 'arma';
    // anillos y amuletos siempre son, como poco, mágicos (como en Diablo 2)
    if (JEWELS[slot] && ['inferior', 'normal', 'superior'].includes(rarity)) rarity = 'magico';
    it.rarity = rarity;
    it.slot = slot;
    const tier = o.tier !== undefined ? o.tier : o.set ? (ilvl >= TIERS[2].lvl ? 2 : ilvl >= TIERS[1].lvl ? 1 : 0) : rollTier(rng, ilvl);
    const qMult = rarity === 'inferior' ? 0.75 : 1;
    const grow = tierGrowth(tier, ilvl);
    if (slot === 'arma') {
      if (!base) base = pick(rng, fit && rng() < 0.75 ? fit.weapons.filter((w) => WEAPONS[w]) : Object.keys(WEAPONS));
      const W = WEAPONS[base];
      it.tier = tier;
      const k = TIERS[tier].mult * grow * qMult;
      it.dmg = [Math.max(1, Math.round(W.dmg[0] * k)), Math.max(2, Math.round(W.dmg[1] * k))];
    } else if (slot === 'mano') {
      if (!base) {
        const opts = fit ? fit.weapons.filter((w) => OFFHANDS[w]) : [];
        base = pick(rng, opts.length && rng() < 0.8 ? opts : Object.keys(OFFHANDS));
      }
      const O = OFFHANDS[base];
      it.tier = tier;
      if (O.armor) { it.armor = Math.max(1, Math.round(O.armor * TIERS[tier].mult * grow * qMult)); it.block = O.block[tier]; }
      if (O.spell) it.stats.spellPct = Math.round(O.spell[tier] * grow);
    } else if (ARMOR_SLOT[slot]) {
      if (!base) base = pick(rng, fit && rng() < 0.8 ? fit.armor : Object.keys(ARMOR_BASE));
      it.type = base;
      it.tier = tier;
      it.armor = Math.max(1, Math.round(ARMOR_BASE[base] * ARMOR_SLOT[slot] * TIERS[tier].mult * grow * qMult));
    } else {
      base = slot;
    }
    it.base = base;
    // variante de la base (nombre y aspecto), sin gastar tiradas del generador: sale del nivel, la calidad y el tipo
    const skins = it.type ? ARMOR_SKINS[slot][it.type][Math.min(2, tier)] : WEAPON_SKINS[base] ? WEAPON_SKINS[base][Math.min(2, tier)] : null;
    if (skins) it.sk = o.sk !== undefined ? Math.max(0, Math.min(skins.length - 1, o.sk | 0)) : (ilvl * 7 + tier * 3 + base.length + RARITY_ORDER.indexOf(rarity) + slot.length) % skins.length;
    const B = baseInfo(it);

    // Afijos
    const pool = affixPool(it, ilvl);
    const chosen = []; // [clave, escalón]
    const add = (k, best) => {
      if (chosen.some((c) => c[0] === k)) return false;
      const T = affixTier(rng, AFFIXES[k], ilvl, best);
      if (!T) return false;
      chosen.push([k, T]);
      return true;
    };
    const prefixes = pool.filter((k) => AFFIXES[k].p), suffixes = pool.filter((k) => AFFIXES[k].s);
    const favored = o.set ? CLASSES[o.set].favored : classes.length && rng() < 0.6 ? CLASSES[pick(rng, classes)].favored : null;
    if (rarity === 'magico') {
      const r = rng();
      if (r < 0.75 && prefixes.length) add(pick(rng, prefixes));
      if ((r >= 0.25 || !chosen.length) && suffixes.length) add(favored && rng() < 0.5 ? pick(rng, favored.filter((f) => suffixes.includes(f)).concat(suffixes)) : pick(rng, suffixes));
    } else if (rarity === 'raro') {
      const n = 3 + Math.floor(rng() * 3) + (ilvl >= 40 && rng() < 0.5 ? 1 : 0);
      let np = 0, ns = 0;
      for (let tries = 0; chosen.length < n && tries < 40; tries++) {
        const wantP = np < 3 && (ns >= 3 || rng() < 0.5);
        const list = wantP ? prefixes : suffixes;
        let k = favored && !wantP && rng() < 0.45 ? pick(rng, favored.filter((f) => list.includes(f))) : null;
        if (!k) k = pick(rng, list);
        if (k && add(k)) { if (wantP) np++; else ns++; }
      }
    } else if (rarity === 'unico') {
      // Los únicos tienen siempre las mismas propiedades (las decide su nombre); los valores varían dentro del escalón
      it.name = pick(rng, UNIQUE_NAMES[slot]);
      const nr = seeded('unico:' + it.name + ':' + base);
      const wanted = slot === 'arma' ? ['ed'] : ARMOR_SLOT[slot] || it.base === 'escudo' ? ['edDef'] : [];
      const rest = pool.filter((k) => !wanted.includes(k));
      while (wanted.length < 5 && rest.length) wanted.push(rest.splice(Math.floor(nr() * rest.length), 1)[0]);
      for (const k of wanted) add(k, true);
    } else if (rarity === 'conjunto') {
      const keys = [CLASSES[o.set].main, ...pool.filter((k) => CLASSES[o.set].favored.includes(k) || ['hp', 'crit', 'resAll', 'lifesteal', 'speed'].includes(k))];
      for (const k of keys) { if (chosen.length >= 3) break; if (pool.includes(k)) add(k, true); }
    }
    // Superior: un poco más de daño o de defensa (+5…15%)
    if (rarity === 'superior') {
      const e = 5 + Math.floor(rng() * 11);
      if (it.dmg) it.ed = e; else if (it.armor) it.edDef = e;
    }
    for (const [k, T] of chosen) {
      const A = AFFIXES[k];
      const v = rollAffixValue(rng, A, T);
      if (k === 'ed') it.ed = (it.ed || 0) + v;
      else if (k === 'edDef') it.edDef = (it.edDef || 0) + v;
      else if (k === 'minDmg') it.addMin = v;
      else if (k === 'maxDmg') it.addMax = v;
      else if (A.elem) {
        const lo = Math.max(1, Math.round(k === 'rayo' ? v * 0.2 : v * 0.6)), hi = Math.max(lo + 1, Math.round(k === 'rayo' ? v * 1.8 : v * 1.4));
        it.elem = it.elem || {}; it.elem[k] = [lo, hi];
      } else it.stats[k] = (it.stats[k] || 0) + v;
    }
    // El daño mejorado y los añadidos se aplican al daño base del arma (y la defensa mejorada a la armadura)
    if (it.dmg && (it.ed || it.addMin || it.addMax)) {
      const m = 1 + (it.ed || 0) / 100;
      it.dmg = [Math.round(it.dmg[0] * m) + (it.addMin || 0), Math.round(it.dmg[1] * m) + (it.addMax || 0)];
      if (it.dmg[1] <= it.dmg[0]) it.dmg[1] = it.dmg[0] + 1;
    }
    if (it.armor && it.edDef) it.armor = Math.round(it.armor * (1 + it.edDef / 100));
    if (it.slot === 'arma' && WEAPONS[base] && WEAPONS[base].undead) it.stats.undead = (it.stats.undead || 0) + WEAPONS[base].undead;

    // Requisitos: los del tipo base, y nivel según el tipo y el afijo más alto (como en Diablo 2)
    it.reqStats = { ...B.req };
    const affixLvl = chosen.reduce((m, [, T]) => Math.max(m, T[0]), 0);
    it.req = Math.max(TIERS[tier] ? TIERS[tier].lvl : 1, Math.ceil(affixLvl * 0.9), rarity === 'unico' || rarity === 'conjunto' ? Math.max(1, ilvl - 5) : 1);

    // Nombre
    if (!it.name) {
      if (rarity === 'inferior') it.name = `${B.name} ${adj(pick(rng, INFERIOR_WORDS), B.g)}`;
      else if (rarity === 'superior') it.name = `${B.name} superior${/p$/.test(B.g) ? 'es' : ''}`;
      else if (rarity === 'magico') {
        const pre = chosen.find(([k]) => AFFIXES[k].p), suf = chosen.find(([k]) => AFFIXES[k].s);
        it.name = [B.name, pre ? adj(pre[1][3], B.g) : '', suf ? suf[1][3] : ''].filter(Boolean).join(' ');
      } else if (rarity === 'raro') it.name = `${pick(rng, RARE_A)} ${pick(rng, RARE_B)}`;
      else it.name = B.name;
    }
    if (o.leg && LEGENDARY[o.leg] && rarity === 'unico') { it.leg = o.leg; it.value = 0; }
    it.value = itemValue(it) * (it.leg ? 3 : 1);
    it.weight = itemWeight(it);
    return it;
  }

  // Peso de un objeto (kg): lo pesado se lleva mejor con Fuerza o con una mascota de carga
  const ARMOR_WEIGHT = { tela: 1, cuero: 2, malla: 4, placas: 6 };
  function itemWeight(it) {
    if (!it) return 0;
    if (it.slot === 'arma') return WEAPONS[it.base] ? WEAPONS[it.base].weight : 3;
    if (it.slot === 'mano') return OFFHANDS[it.base] ? OFFHANDS[it.base].weight : 1;
    if (it.type) return round1(ARMOR_WEIGHT[it.type] * ({ casco: 0.6, pecho: 1.8, guantes: 0.4, botas: 0.7 }[it.slot] || 1));
    return 0.2;
  }

  // Clases para las que está pensado un objeto (sólo orientativo: lo que manda son los requisitos)
  function classesFor(it) {
    return CLASS_IDS.filter((c) => {
      const C = CLASSES[c];
      if (it.slot === 'arma' || it.slot === 'mano') return C.weapons.includes(it.base);
      if (it.type) return C.armor.includes(it.type);
      return true;
    });
  }

  function itemValue(it) {
    const R = RARITIES[it.rarity] || RARITIES.normal;
    return Math.max(1, Math.round((4 + it.ilvl * 3) * R.value * (1 + (it.tier || 0) * 0.3)));
  }

  // Botín de un enemigo. o: { ilvl, mf, classes, elite, boss, chest, sets }
  // Los enemigos normales sueltan poco y casi siempre básico; la calidad sube con el nivel del enemigo,
  // y los élites, cofres y jefes son los que dan lo bueno.
  const DROP = {
    // probabilidad de soltar un objeto en cada tirada y pesos de cada calidad
    normal: { chance: 0.10, w: { inferior: 30, normal: 55, superior: 11, magico: 4, raro: 0.25, unico: 0.02 } },
    elite: { chance: 0.4, w: { inferior: 8, normal: 45, superior: 25, magico: 18, raro: 2.5, unico: 0.2 } },
    chest: { chance: 1, w: { inferior: 12, normal: 50, superior: 20, magico: 15, raro: 1.5, unico: 0.12 } },
    boss: { chance: 1, w: { magico: 78, raro: 20, unico: 1.5 } },
  };
  function rollDropRarity(rng, kind, lvl, mf) {
    const w = { ...DROP[kind].w };
    // con el nivel del enemigo sube la calidad (en el nivel 1 casi nada mágico; hacia el 30 bastante más)
    const up = Math.max(0, lvl - 1);
    if (w.magico) w.magico *= 1 + up / 12;
    if (w.raro) w.raro *= 1 + up / 8;
    if (w.unico) w.unico *= 1 + up / 6;
    // hallazgo mágico con rendimientos decrecientes (el de antes)
    const m = Math.max(0, mf || 0);
    if (w.magico) w.magico *= 1 + m / 100;
    if (w.raro) w.raro *= 1 + (m * 600) / (m + 600) / 100;
    if (w.unico) w.unico *= 1 + (m * 250) / (m + 250) / 100;
    const total = Object.values(w).reduce((a, b) => a + b, 0);
    let r = rng() * total;
    for (const [id, v] of Object.entries(w)) { r -= v; if (r < 0) return id; }
    return 'normal';
  }
  function rollLoot(rng, o) {
    const out = [];
    const kind = o.boss ? 'boss' : o.chest ? 'chest' : o.elite ? 'elite' : 'normal';
    const rolls = o.boss ? 2 : o.elite ? 2 : 1;
    const lvl = Math.max(1, o.ilvl | 0);
    for (let i = 0; i < rolls; i++) {
      if (rng() >= DROP[kind].chance * (kind === 'normal' ? 1 + Math.min(0.5, (o.mf || 0) / 400) : 1)) continue;
      // legendario: muy raro, sobre todo de jefes y a más nivel
      const legChance = { boss: 0.015, elite: 0.004, chest: 0.004, normal: 0.0003 }[kind] * (1 + lvl / 20) * (1 + Math.min(1, (o.mf || 0) / 300));
      if (rng() < legChance) { out.push(makeItem(rng, { ilvl: lvl, rarity: 'unico', classes: o.classes, leg: pick(rng, Object.keys(LEGENDARY)) })); continue; }
      const rarity = rollDropRarity(rng, kind, lvl, o.mf);
      // los enemigos normales sueltan objetos de su nivel o algo por debajo
      const ilvl = kind === 'normal' ? Math.max(1, lvl - Math.floor(rng() * 3)) : lvl;
      out.push(makeItem(rng, { ilvl, rarity, classes: o.classes }));
    }
    if (o.boss && o.sets && o.sets.length) {
      // Pieza de conjunto: mejor si es de la clase de alguien del grupo
      const chance = 0.25 + Math.min(0.35, (o.mf || 0) / 400) + Math.min(0.15, o.ilvl * 0.005);
      if (rng() < chance) {
        const sets = o.sets.map((s) => LEGACY_SET[s] || s).filter((s) => SETS[s]);
        const mine = sets.filter((s) => (o.classes || []).includes(s));
        const set = pick(rng, mine.length && rng() < 0.7 ? mine : sets);
        if (set) out.push(makeItem(rng, { ilvl: o.ilvl, rarity: 'conjunto', set }));
      }
    }
    return out;
  }

  function starterItems(cls, rng) {
    return CLASSES[classId(cls) || 'guerrero'].start.map(([slot, base]) => makeItem(rng, { ilvl: 1, rarity: 'normal', slot, base, tier: 0 }));
  }

  // ¿Puede llevarlo? (nivel y requisitos de características; stats: las que tienes ahora con el equipo)
  function canEquip(it, char, level, stats) {
    if (!it || !SLOTS[it.slot]) return { ok: false, reason: 'Eso no se puede equipar.' };
    if (level < (it.req || 1)) return { ok: false, reason: `Necesitas nivel ${it.req}.` };
    if (stats) {
      for (const [k, v] of Object.entries(it.reqStats || {})) if ((stats[k] || 0) < v) return { ok: false, reason: `Necesitas ${v} de ${statName(k)} (tienes ${stats[k] || 0}).` };
    }
    return { ok: true };
  }

  // Velocidad del arma con su nombre de Diablo 2
  function speedName(ms) {
    return ms <= 700 ? 'muy rápida' : ms <= 900 ? 'rápida' : ms <= 1100 ? 'normal' : ms <= 1300 ? 'lenta' : 'muy lenta';
  }

  function typeLine(it) {
    const R = RARITIES[it.rarity] || RARITIES.normal;
    const B = baseInfo(it);
    let kind;
    if (it.slot === 'arma' || it.slot === 'mano') kind = `${B.name} (${TIERS[it.tier || 0].name.toLowerCase()})`;
    else if (it.type) kind = `${SLOTS[it.slot].name} · ${ARMOR_TYPES[it.type]} · ${TIERS[it.tier || 0].name.toLowerCase()}`;
    else kind = SLOTS[it.slot] ? SLOTS[it.slot].name : '';
    return `${kind} · ${R.name}${it.set ? ` (${SETS[it.set] ? SETS[it.set].name : ''})` : ''}`;
  }

  // Líneas de descripción de un objeto (para los tooltips). Cada línea: { t: texto, c?: 'mod' (azul) | 'req' | 'muted' }
  function describeRich(it, stats) {
    const lines = [];
    const B = baseInfo(it);
    if (it.dmg) {
      const W = WEAPONS[it.base];
      lines.push({ t: `Daño ${it.dmg[0]}–${it.dmg[1]}`, c: it.ed || it.addMin || it.addMax || it.up ? 'mod' : '' });
      lines.push({ t: `${W.kind === 'melee' ? `Cuerpo a cuerpo${W.range > 1 ? ' (alcance 2)' : ''}` : `${W.kind === 'magic' ? 'Mágica' : 'A distancia'} (alcance ${W.range})`} · ${W.hands === 2 ? 'a dos manos' : 'a una mano'} · velocidad ${speedName(W.ms)}`, c: 'muted' });
      lines.push({ t: `+5% de daño por punto de ${Object.keys(W.stat).map(statName).join(' y ')}${Object.keys(W.stat).length > 1 ? ' (×0,75)' : ''}`, c: 'muted' });
    }
    if (it.armor) lines.push({ t: `Defensa ${it.armor}${it.block ? ` · ${it.block}% de bloqueo` : ''}`, c: it.edDef || it.up ? 'mod' : '' });
    const req = it.reqStats || B.req || {};
    for (const [k, v] of Object.entries(req)) lines.push({ t: `Requiere ${statName(k)}: ${v}`, c: stats && (stats[k] || 0) < v ? 'bad' : 'req' });
    if (it.ed) lines.push({ t: `+${it.ed}% de daño mejorado`, c: 'mod' });
    if (it.edDef) lines.push({ t: `+${it.edDef}% de defensa mejorada`, c: 'mod' });
    if (it.addMin) lines.push({ t: `+${it.addMin} al daño mínimo`, c: 'mod' });
    if (it.addMax) lines.push({ t: `+${it.addMax} al daño máximo`, c: 'mod' });
    for (const [k, r] of Object.entries(it.elem || {})) lines.push({ t: `${ELEMENTS[k].icon} ${r[0]}–${r[1]} de daño de ${ELEMENTS[k].name}${k === 'frio' ? ' (ralentiza)' : ''}`, c: 'mod' });
    for (const [k, v] of Object.entries(it.stats || {})) lines.push({ t: fmtStat(k, v), c: 'mod' });
    if (it.leg && LEGENDARY[it.leg]) lines.push({ t: `★ Legendario · ${LEGENDARY[it.leg].icon} ${LEGENDARY[it.leg].name}: ${LEGENDARY[it.leg].desc}`, c: 'leg' });
    const cl = classesFor(it);
    if (cl.length < CLASS_IDS.length) lines.push({ t: `Ideal para: ${cl.map((c) => CLASSES[c].name).join(', ')}`, c: 'muted' });
    lines.push({ t: `Peso ${it.weight !== undefined ? it.weight : itemWeight(it)} kg`, c: 'muted' });
    return lines;
  }
  const describe = (it, stats) => describeRich(it, stats).map((l) => l.t);

  // Objetos de versiones anteriores (rarezas y características viejas) → reglas actuales
  const LEGACY_STAT = { con: 'vig', vit: 'vig', res: 'int', car: 'int' };
  function migrateItem(it) {
    if (!it || it.v === RULES_VERSION) return it;
    it.rarity = LEGACY_RARITY[it.rarity] || (RARITIES[it.rarity] ? it.rarity : 'normal');
    if (it.set) it.set = LEGACY_SET[it.set] || it.set;
    const stats = {};
    for (const [k, v] of Object.entries(it.stats || {})) {
      const nk = LEGACY_STAT[k] || k;
      // las características de antes eran mucho más grandes: ahora valen una cuarta parte
      const nv = LEGACY_STAT[k] || STAT_IDS.includes(k) ? Math.max(1, Math.round(v * 0.25)) : v;
      if (EXTRA[nk] || STAT_IDS.includes(nk)) stats[nk] = (stats[nk] || 0) + nv;
    }
    it.stats = stats;
    it.tier = it.tier || 0;
    if (it.slot === 'mano' && it.base === 'orbe' && !it.stats.spellPct) it.stats.spellPct = 8;
    if (it.slot === 'arma' && WEAPONS[it.base] && WEAPONS[it.base].undead && !it.stats.undead) it.stats.undead = WEAPONS[it.base].undead;
    it.reqStats = { ...baseInfo(it).req };
    it.req = Math.min(it.req || 1, Math.max(1, Math.ceil((it.ilvl || 1) * 0.9)));
    it.v = RULES_VERSION;
    it.value = Math.round(itemValue(it) * (1 + (it.up || 0) * 0.2));
    it.weight = itemWeight(it);
    return it;
  }

  // Perfiles de versiones anteriores: clase y raza nuevas, puntos devueltos (las características cambiaron) y objetos convertidos
  function migrateProfile(p) {
    if (!p || !p.char) return p;
    p.char.cls = classId(p.char.cls) || 'guerrero';
    delete p.char.cls2;
    p.char.look = p.char.look || {};
    p.char.look.species = raceId(p.char.look.species);
    if ((p.rv || 1) < RULES_VERSION) {
      p.char.alloc = Object.fromEntries(STAT_IDS.map((k) => [k, 0]));
      p.rv = RULES_VERSION;
      p.statsReset = true; // se avisa al jugador de que tiene que volver a repartir
    }
    for (const sl of SLOT_IDS) if (p.equip && p.equip[sl]) migrateItem(p.equip[sl]);
    for (const it of p.bag || []) migrateItem(it);
    if (p.pet && p.pet.bag) for (const it of p.pet.bag) migrateItem(it);
    return p;
  }

  // ======================================================================
  //  Consumibles, bufos y tiendas
  // ======================================================================
  const CONSUMABLES = {
    'pocion-vida-p': { name: 'Poción de vida pequeña', icon: '🧪', color: '#d83a3a', price: 12, heal: 0.3, shop: 'bruja', desc: 'Recupera el 30% de tu vida.' },
    'pocion-vida-g': { name: 'Poción de vida grande', icon: '🧪', color: '#ff2a4a', price: 35, heal: 0.65, shop: 'bruja', desc: 'Recupera el 65% de tu vida.' },
    'pocion-energia': { name: 'Poción de energía', icon: '🧪', color: '#3a7ad8', price: 15, energy: 0.5, shop: 'bruja', desc: 'Recupera la mitad de tu energía.' },
    'brebaje-trol': { name: 'Brebaje de trol', icon: '🍵', color: '#5aa03a', price: 45, regen: 30000, shop: 'bruja', desc: 'Regeneras vida cinco veces más rápido durante 30 s.' },
    'elixir': { name: 'Elixir de la bruja', icon: '⚗️', color: '#c060ff', price: 90, heal: 1, energy: 1, shop: 'bruja', desc: 'Recupera toda la vida y la energía.' },
    'perg-fuego': { name: 'Pergamino de bola de fuego', icon: '📜', color: '#ff7a2a', price: 40, spell: { kind: 'blast', range: 7, radius: 2, mult: 2.5, fx: 'fire' }, shop: 'mago', desc: 'Una gran bola de fuego en un área de 5×5.' },
    'perg-rayo': { name: 'Pergamino de relámpago', icon: '📜', color: '#fff27a', price: 40, spell: { kind: 'chain', range: 7, targets: 4, mult: 1.8, fx: 'lightning' }, shop: 'mago', desc: 'Un rayo salta entre los cuatro enemigos más cercanos.' },
    'perg-sanacion': { name: 'Pergamino de sanación', icon: '📜', color: '#7dff8a', price: 45, spell: { kind: 'healAll', radius: 6, pct: 0.5 }, shop: 'mago', desc: 'Cura la mitad de la vida a todo el grupo cercano.' },
    'perg-retorno': { name: 'Pergamino de retorno', icon: '🌀', color: '#7ad0ff', price: 25, spell: { kind: 'return' }, shop: 'mago', desc: 'Te devuelve a la taberna sano y salvo, sin perder oro.' },
  };
  const BUFFS = {
    'bend-fuerza': { name: 'Bendición de fuerza', icon: '💪', price: 60, min: 20, stats: { dmgPct: 20 }, desc: '+20% de daño durante 20 minutos.' },
    'piel-piedra': { name: 'Piel de piedra', icon: '🪨', price: 60, min: 20, stats: { armorPct: 30 }, desc: '+30% de armadura durante 20 minutos.' },
    'ojo-fortuna': { name: 'Ojo de la fortuna', icon: '🍀', price: 80, min: 20, stats: { mf: 50 }, desc: '+50% de hallazgo mágico durante 20 minutos.' },
    'prisa': { name: 'Prisa arcana', icon: '⚡', price: 70, min: 20, stats: { speed: 15, move: 10 }, desc: '+15% de velocidad de ataque y +10% al andar durante 20 minutos.' },
    'vigor': { name: 'Vigor del roble', icon: '🌳', price: 60, min: 20, stats: { hpPct: 20 }, desc: '+20% de vida máxima durante 20 minutos.' },
  };
  const SHOPS = {
    bruja: { name: 'Madre Zarza', title: 'la bruja de las pociones', greet: '¿Pociones, querida? Recién salidas del caldero.' },
    armero: { name: 'Maestro Takeshi', title: 'mercader de armas de Oriente', greet: 'Acero forjado al otro lado del mar. Elija con calma.' },
    mago: { name: 'El Hombre de la Túnica', title: 'hechizos y bendiciones', greet: '…Sabía que vendrías. Tengo justo lo que necesitas.' },
  };
  const priceScale = (level) => 1 + 0.25 * (level - 1);
  const buyPrice = (base, discount) => Math.max(1, Math.round(base * (1 - (discount || 0) / 100)));
  const itemBuyPrice = (it, discount) => buyPrice(it.value * 4, discount);

  // Género de Takeshi: 8 objetos para tu nivel (casi siempre de tus clases); cambia cada 10 minutos
  function armeroStock(seedRng, level, classes) {
    const out = [];
    const slots = ['arma', 'arma', 'arma', 'mano', 'pecho', 'casco', 'guantes', 'botas'];
    for (const slot of slots) {
      const r = seedRng();
      const rarity = r < 0.08 ? 'raro' : r < 0.4 ? 'magico' : r < 0.6 ? 'superior' : 'normal';
      out.push(makeItem(seedRng, { ilvl: level, rarity, slot, classes: seedRng() < 0.8 ? classes : [] }));
    }
    return out;
  }

  // Generador con semilla (mulberry32), para tiendas y mazmorras repetibles
  function seeded(str) {
    let h = 1779033703 ^ String(str).length;
    for (let i = 0; i < String(str).length; i++) { h = Math.imul(h ^ String(str).charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    let a = h >>> 0;
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ======================================================================
  //  Personaje: ficha calculada
  // ======================================================================
  function newChar(cls, look) {
    cls = classId(cls) || 'guerrero';
    return { cls, alloc: Object.fromEntries(STAT_IDS.map((k) => [k, 0])), look: look || {} };
  }

  // Limpia una ficha guardada (o enviada por un cliente): puntos dentro del total y sin pasar del máximo natural
  // ======================================================================
  //  Talentos: 3 ramas por clase, 4 talentos por rama (el último, de 1 punto). Un punto cada 2 niveles.
  //  Para abrir el escalón n de una rama hay que haber puesto 3·(n−1) puntos en ella.
  //  e: bonificaciones por punto (las mismas claves que el equipo; ab:<habilidad> = % de daño o curación)
  // ======================================================================
  const TALENTS = TALENTDATA;
  const TALENT_BY_ID = {};
  for (const [cls, trees] of Object.entries(TALENTS)) trees.forEach((tr, ti) => tr.t.forEach((tl, i) => { TALENT_BY_ID[tl.id] = { ...tl, cls, tree: ti, tier: i }; }));
  const talentPoints = (level) => Math.max(0, Math.floor((level - 1) / 2));
  const talentSpent = (talents) => Object.values(talents || {}).reduce((a, b) => a + b, 0);
  const treeSpent = (talents, cls, ti) => TALENTS[cls][ti].t.reduce((a, tl) => a + ((talents || {})[tl.id] || 0), 0);
  // ¿se puede subir este talento?
  function canTalent(char, level, id) {
    const tl = TALENT_BY_ID[id];
    if (!tl || tl.cls !== char.cls) return 'Ese talento no es de tu clase.';
    const t = char.talents || {};
    if ((t[id] || 0) >= tl.max) return 'Ese talento ya está al máximo.';
    if (talentSpent(t) >= talentPoints(level)) return 'No te quedan puntos de talento (uno cada 2 niveles).';
    if (treeSpent(t, char.cls, tl.tree) < tl.tier * 3) return `Pon ${tl.tier * 3} puntos en ${TALENTS[char.cls][tl.tree].name} para abrir este talento.`;
    return null;
  }
  // limpia los talentos guardados (clase cambiada, nivel o datos raros)
  function cleanTalents(cls, talents, level) {
    const out = {};
    if (!TALENTS[cls] || !talents || typeof talents !== 'object') return out;
    const char = { cls, talents: out };
    // se vuelven a poner por orden de escalón, respetando las reglas
    const ids = Object.keys(talents).filter((id) => TALENT_BY_ID[id] && TALENT_BY_ID[id].cls === cls).sort((a, b) => TALENT_BY_ID[a].tier - TALENT_BY_ID[b].tier);
    for (const id of ids) for (let r = 0; r < Math.min(TALENT_BY_ID[id].max, Math.floor(Number(talents[id]) || 0)); r++) { if (canTalent(char, level, id)) break; out[id] = (out[id] || 0) + 1; }
    return out;
  }
  // bonificaciones de los talentos: { claves de equipo } y { ab: { habilidad: % } }
  function talentBonus(char) {
    const t = {}, ab = {};
    for (const [id, r] of Object.entries((char && char.talents) || {})) {
      const tl = TALENT_BY_ID[id];
      if (!tl || tl.cls !== char.cls) continue;
      for (const [k, v] of Object.entries(tl.e)) {
        if (k.startsWith('ab:')) ab[k.slice(3)] = (ab[k.slice(3)] || 0) + v * r;
        else t[k] = (t[k] || 0) + v * r;
      }
    }
    return { t, ab };
  }

  function cleanChar(c, level) {
    const out = newChar(c && c.cls, c && c.look ? { ...c.look, species: raceId(c.look.species) } : {});
    if (c && c.alloc) {
      const base = baseStats(out);
      let budget = pointsTotal(level || 1);
      for (const k of STAT_IDS) {
        const v = Math.max(0, Math.min(budget, STAT_MAX - base[k], Math.floor(Number(c.alloc[k]) || 0)));
        out.alloc[k] = v; budget -= v;
      }
    }
    if (c && c.talents) out.talents = cleanTalents(out.cls, c.talents, level || 1);
    return out;
  }

  // Suma de atributos de los objetos equipados, los conjuntos, la raza y los bufos
  function gearTotals(equip, buffs, now, char) {
    const t = {};
    const add = (k, v) => { t[k] = round1((t[k] || 0) + v); };
    let armor = 0, block = 0;
    const elem = {};
    const setCount = {};
    for (const slot of SLOT_IDS) {
      const it = equip && equip[slot];
      if (!it) continue;
      if (it.armor) armor += it.armor;
      if (it.block) block += it.block;
      for (const [k, v] of Object.entries(it.stats || {})) add(k, v);
      for (const [k, r] of Object.entries(it.elem || {})) { const e = elem[k] || (elem[k] = [0, 0]); e[0] += r[0]; e[1] += r[1]; }
      if (it.set) setCount[it.set] = (setCount[it.set] || 0) + 1;
    }
    const sets = [];
    for (const [s, n] of Object.entries(setCount)) {
      const S = SETS[s];
      if (!S) continue;
      if (n >= 2) for (const [k, v] of Object.entries(S.b2)) add(k, v);
      if (n >= 4) for (const [k, v] of Object.entries(S.b4)) add(k, v);
      sets.push({ id: s, name: S.name, n });
    }
    if (char) for (const [k, v] of Object.entries(RACES[raceId(char.look && char.look.species)].perk)) add(k, v);
    const active = [];
    for (const [id, until] of Object.entries(buffs || {})) {
      if (!BUFFS[id] || until <= (now || Date.now())) continue;
      for (const [k, v] of Object.entries(BUFFS[id].stats)) add(k, v);
      active.push({ id, until });
    }
    return { t, armor, block, elem, sets, buffs: active };
  }

  // Ficha completa a partir del perfil { xp, char, equip, buffs }
  function derive(profile, now) {
    const char = profile.char;
    const level = levelFromXp(profile.xp || 0);
    const base = baseStats(char);
    const g = gearTotals(profile.equip, profile.buffs, now, char);
    const TB = talentBonus(char);
    for (const [k, v] of Object.entries(TB.t)) g.t[k] = round1((g.t[k] || 0) + v);
    const stats = {}, natural = {};
    for (const k of STAT_IDS) {
      natural[k] = Math.min(STAT_MAX, base[k] + (char.alloc[k] || 0));
      stats[k] = Math.round(natural[k] + (g.t[k] || 0));
    }
    const x = (k) => g.t[k] || 0;
    const hpMult = (CLASSES[char.cls] || CLASSES.guerrero).hp;

    const w = profile.equip && profile.equip.arma;
    const W = w && WEAPONS[w.base] ? WEAPONS[w.base] : FISTS;
    const wdmg = w ? w.dmg : FISTS.dmg;
    // Como en Diablo 2: cada punto de la característica del arma da +5% de daño (dagas: Fuerza y Destreza al 75%)
    const statPct = Object.entries(W.stat).reduce((t, [k, f]) => t + stats[k] * f * 5, 0);
    const mastery = 1 + 0.04 * (level - 1); // dominio de combate: +4% de daño por nivel
    let dmgMult = (1 + statPct / 100) * mastery * (1 + x('dmgPct') / 100);
    const spellBase = W.kind === 'magic' ? wdmg : [3 + level * 1.5, 6 + level * 2.5];
    // hechizos: con arma mágica escalan como el resto de armas; sin ella, su base ya crece con el nivel
    const spellMult = (1 + stats.int * 0.05) * (W.kind === 'magic' ? mastery : 1 + 0.02 * (level - 1)) * (1 + (x('dmgPct') + x('spellPct')) / 100);
    if (W.kind === 'magic') dmgMult = spellMult; // el bastón y la varita golpean con el poder de los hechizos
    const shield = profile.equip && profile.equip.mano && profile.equip.mano.base === 'escudo';

    // carga: lo equipado y la mochila; pasarse ralentiza
    let weight = 0;
    for (const sl of SLOT_IDS) weight += itemWeight(profile.equip && profile.equip[sl]);
    for (const it of profile.bag || []) weight += itemWeight(it);
    weight = round1(weight);
    const capacity = 40 + stats.fue * 4;
    const overloaded = weight > capacity;
    const elem = {};
    for (const [k, r] of Object.entries(g.elem)) elem[k] = [Math.round(r[0] * mastery), Math.round(r[1] * mastery)];
    const d = {
      level, cls: char.cls, race: raceId(char.look && char.look.species), stats, natural, base, alloc: char.alloc, weight, capacity, overloaded,
      points: pointsFree(char, level),
      hp: Math.round(((30 + level * 8 + stats.vig * (4 + level * 0.3)) * hpMult + x('hp')) * (1 + x('hpPct') / 100)),
      en: Math.round(40 + level * 2 + stats.int * (3 + level * 0.08) + x('en')),
      hpRegen: round1(0.4 + stats.vig * 0.1 + level * 0.02 + x('hpRegen')),
      enRegen: round1(3 + stats.int * 0.2 + x('enRegen')),
      armor: Math.round((g.armor + x('armor') + stats.des * (1 + level * 0.04)) * (1 + x('armorPct') / 100)),
      block: Math.min(50, round1(g.block + x('block') + (shield ? stats.des * 0.5 : 0))),
      weapon: { base: w ? w.base : 'puños', name: w ? w.name : FISTS.name, kind: W.kind, range: W.range, stat: Object.keys(W.stat)[0], hands: W.hands },
      statPct: Math.round(statPct), mastery: Math.round((mastery - 1) * 100),
      dmg: [Math.max(1, Math.round(wdmg[0] * dmgMult)), Math.max(1, Math.round(wdmg[1] * dmgMult))],
      elem,
      spell: [Math.max(1, Math.round(spellBase[0] * spellMult)), Math.max(2, Math.round(spellBase[1] * spellMult))],
      atkMs: Math.round(W.ms / (1 + x('speed') / 100)),
      crit: round1(Math.min(60, 5 + stats.sue * 0.75 + x('crit'))),
      critMult: round1(1.5 + x('critDmg') / 100),
      dodge: round1(Math.min(40, stats.des * 0.6 + stats.sue * 0.25 + x('dodge'))),
      hit: round1(stats.des * 0.75 + x('hit')),
      moveMs: Math.max(120, Math.round(200 / (1 + x('move') / 100) * (overloaded ? 1.4 : 1))),
      mf: Math.round(stats.sue * 3 + x('mf')),
      discount: round1(Math.min(25, stats.car)),
      petPow: round1(1 + stats.car * 0.03),
      healPow: round1(1 + stats.int * 0.03 + stats.car * 0.02 + x('healPct') / 100),
      cdr: Math.min(30, x('cdr')),
      magicRes: Math.min(75, round1(stats.int + stats.vig * 0.5 + x('resAll'))),
      lifesteal: Math.min(20, x('lifesteal')),
      undead: x('undead'),
      sets: g.sets, buffs: g.buffs,
      abilities: abilitiesFor(char, level),
    };
    d.abBoost = TB.ab;
    d.talentPoints = talentPoints(level) - talentSpent(char.talents);
    d.leg = {};
    for (const sl of SLOT_IDS) { const it = profile.equip && profile.equip[sl]; if (it && it.leg && LEGENDARY[it.leg]) d.leg[it.leg] = true; }
    return d;
  }

  function abilitiesFor(char, level) {
    const out = [];
    for (const a of ABILITIES[classId(char.cls) || 'guerrero']) out.push({ ...a, cls: char.cls, unlock: a.lvl, ready: level >= a.lvl });
    return out;
  }

  // Aspecto del héroe para los sprites: clase, especie, colores y el equipo que se ve
  function gearLook(equip) {
    const e = equip || {};
    const g = {};
    if (e.arma) { g.w = e.arma.base; g.wr = e.arma.rarity; }
    if (e.mano) { g.o = e.mano.base; g.or = e.mano.rarity; }
    if (e.arma) { g.wt = e.arma.tier || 0; g.wS = e.arma.sk || 0; }
    if (e.mano) { g.ot = e.mano.tier || 0; g.oS = e.mano.sk || 0; }
    for (const s of ['casco', 'pecho', 'guantes', 'botas']) if (e[s]) { g[s] = e[s].type; g[s + 'R'] = e[s].rarity; g[s + 'T'] = e[s].tier || 0; g[s + 'S'] = e[s].sk || 0; }
    const sets = {};
    for (const s of SLOT_IDS) if (e[s] && e[s].set) sets[e[s].set] = (sets[e[s].set] || 0) + 1;
    const best = Object.entries(sets).sort((a, b) => b[1] - a[1])[0];
    if (best && best[1] >= 2) g.set = best[0];
    return g;
  }

  // ======================================================================
  //  Monstruos
  // ======================================================================
  // hp/dmg/armor a nivel 1; ms = milisegundos por casilla; atk = ms entre ataques; range > 1 = a distancia (proyectil)
  // ai: melee | ranged | healer | summoner | boss; magic = daño mágico (lo reduce la Resistencia)
  const MONSTERS = MONSTERDATA.MONSTERS;
  // los jefes de mundo sueltan piezas de conjunto de todas las clases
  for (const M of Object.values(MONSTERS)) if (M.sets === 'todas') M.sets = CLASS_IDS;
  const LEGACY_MONSTER = MONSTERDATA.LEGACY_MONSTER;

  // Estadísticas de un monstruo a un nivel (élite: más vida, daño y botín)
  function monsterAt(k, level, elite) {
    const M = MONSTERS[k] || MONSTERS[LEGACY_MONSTER[k]];
    if (!M) return null;
    const L = Math.max(1, level | 0);
    const e = elite ? 1 : 0;
    return {
      k: MONSTERS[k] ? k : LEGACY_MONSTER[k], name: (elite ? 'Élite: ' : '') + M.name, level: L, elite: !!elite, boss: !!M.boss,
      hp: Math.round(M.hp * (1 + 0.55 * (L - 1)) * (e ? 2.6 : 1)),
      dmg: [M.dmg[0] * (1 + 0.32 * (L - 1)) * (e ? 1.4 : 1), M.dmg[1] * (1 + 0.32 * (L - 1)) * (e ? 1.4 : 1)],
      armor: Math.round(M.armor * (1 + 0.4 * (L - 1))),
      xp: Math.round(M.xp * (1 + 0.6 * (L - 1)) * (e ? 3 : 1)),
      gold: [Math.round(M.gold[0] * (1 + 0.4 * (L - 1)) * (e ? 2 : 1)), Math.round(M.gold[1] * (1 + 0.4 * (L - 1)) * (e ? 2 : 1))],
      ms: M.ms, atk: M.atk, range: M.range || 1, proj: M.proj || null, ai: M.ai || (M.boss ? 'boss' : 'melee'),
      magic: !!M.magic, undead: !!M.undead, regen: M.regen ? M.regen * (1 + 0.5 * (L - 1)) : 0, poison: !!M.poison,
      summons: M.summons || null, specials: M.specials || [], sets: M.sets || [], explode: !!M.explode,
    };
  }

  // Temas de las mazmorras aleatorias
  const THEMES = MONSTERDATA.THEMES;

  // ======================================================================
  //  Mascotas (desde nivel 5) y monturas (desde nivel 12)
  // ======================================================================
  // La mascota te sigue, ataca a tus enemigos con daño según su Fuerza y lleva una mochila propia con su peso máximo
  const PETS = {
    perro:   { name: 'Perro de guerra', icon: '🐕', sprite: 'wolf', tint: '#8a5a2a', scale: 0.72, fue: 6, cap: 30, hp: 1, price: 250, desc: 'Leal y equilibrado. Carga bastante.', evo: ['Mastín de batalla', 'Cerbero de la taberna'], evoTint: ['#6a3a1a', '#3a1a10'] },
    lobo:    { name: 'Lobo gris', icon: '🐺', sprite: 'wolf', tint: '#8a8e98', scale: 0.8, fue: 9, cap: 22, hp: 0.9, price: 350, desc: 'Muerde más fuerte, carga menos.', evo: ['Lobo del crepúsculo', 'Fenrir menor'], evoTint: ['#4a4e6a', '#1e2240'] },
    jabali:  { name: 'Jabalí acorazado', icon: '🐗', sprite: 'bear', tint: '#5a3a2a', scale: 0.5, fue: 7, cap: 45, hp: 1.3, price: 450, desc: 'Una mula con colmillos: el que más carga.', evo: ['Jabalí de hierro', 'Gran verraco de guerra'], evoTint: ['#4a4040', '#2a2020'] },
    zorro:   { name: 'Zorro de las brumas', icon: '🦊', sprite: 'wolf', tint: '#c8642a', scale: 0.6, fue: 8, cap: 18, hp: 0.85, price: 500, desc: 'Rápido y astuto: confunde a sus presas.', evo: ['Zorro de fuego fatuo', 'Kitsune de nueve colas'], evoTint: ['#d84a1a', '#e8e0f0'] },
    osezno:  { name: 'Osezno de las cavernas', icon: '🐻', sprite: 'bear', tint: '#7a5030', scale: 0.6, fue: 11, cap: 35, hp: 1.2, price: 600, desc: 'Fuerte y resistente. Crece contigo.', evo: ['Oso pardo', 'Oso rúnico'], evoTint: ['#5a3a20', '#2a3a5a'] },
  };
  const PET_LEVEL = 5, MOUNT_LEVEL = 12;
  // La mascota sube de nivel con lo que lucháis juntos (hasta el 25) y evoluciona en los niveles 10 y 20
  const PET_MAX = 25;
  const petXpFor = (n) => Math.round(60 * Math.pow(Math.max(0, n - 1), 2.2));
  function petLevelFromXp(xp) { let n = 1; while (n < PET_MAX && (xp || 0) >= petXpFor(n + 1)) n++; return n; }
  const petEvo = (plvl) => (plvl >= 20 ? 2 : plvl >= 10 ? 1 : 0);
  const petTitle = (type, plvl) => { const P = PETS[type]; const e = petEvo(plvl); return P ? (e ? P.evo[e - 1] : P.name) : ''; };
  // Habilidad de cada mascota (desde su nivel 3; más fuerte al evolucionar)
  const PET_SKILLS = {
    perro:  { name: 'Aullido de manada', kind: 'buff', cd: 18000, dmgPct: 15, dur: 8000, desc: 'Aúlla y tu daño sube un 15% durante 8 s.' },
    lobo:   { name: 'Desgarro', kind: 'bleed', cd: 9000, mult: 2, dur: 6000, desc: 'Desgarra a su presa: sangra el doble de su mordisco en 6 s.' },
    jabali: { name: 'Embestida', kind: 'stun', cd: 11000, mult: 1.5, stun: 1500, desc: 'Embiste y aturde 1,5 s.' },
    zorro:  { name: 'Finta', kind: 'stun', cd: 8000, mult: 1.2, stun: 1000, desc: 'Amaga, muerde y deja a su presa aturdida 1 s.' },
    osezno: { name: 'Zarpazo', kind: 'aoe', cd: 9000, mult: 1.2, radius: 1, desc: 'Un zarpazo que alcanza a todos los que tiene alrededor.' },
  };
  const PET_SKILL_LEVEL = 3;
  function petStats(type, level, plvl = 1) {
    const P = PETS[type];
    if (!P) return null;
    const evoMult = [1, 1.2, 1.45][petEvo(plvl)];
    const fue = Math.round((P.fue + level * 1.6 + (plvl - 1) * 1.2) * evoMult);
    return { fue, hp: Math.round((40 + level * 14 + (plvl - 1) * 10) * P.hp * evoMult), dmg: [Math.round(1 + fue * 0.45), Math.round(3 + fue * 0.7)], atk: Math.round(1200 / (1 + (plvl - 1) * 0.01)), cap: Math.round(P.cap + fue * 1.2), ms: 220, plvl, evo: petEvo(plvl) };
  }
  const MOUNTS = {
    caballo: { name: 'Caballo de guerra', icon: '🐴', speed: 60, price: 1200, minLevel: 12, color: '#6a4426', desc: '+60% de velocidad en el mundo abierto.' },
    lobo:    { name: 'Huargo de monta', icon: '🐺', speed: 70, price: 1800, minLevel: 14, color: '#5a5a62', desc: '+70% de velocidad en el mundo abierto.' },
    ciervo:  { name: 'Venado del bosque', icon: '🦌', speed: 75, price: 2200, minLevel: 16, color: '#7a4a26', desc: '+75% de velocidad en el mundo abierto.' },
    lagarto: { name: 'Lagarto de ceniza', icon: '🦎', speed: 85, price: 2600, minLevel: 18, color: '#7a2a1a', desc: '+85% de velocidad en el mundo abierto.' },
  };
  const petBagWeight = (pet) => round1(((pet && pet.bag) || []).reduce((t, it) => t + itemWeight(it), 0));

  // ======================================================================
  //  Mundo abierto: zonas por distancia al pueblo (cuanto más lejos, más nivel)
  // ======================================================================
  const ZONES = [
    { id: 'valle', name: 'Valle de Brumaverde', lv: [1, 3], mobs: ['goblin-warrior', 'goblin-minion', 'goblin-archer', 'wolf', 'bandit', 'bandit-archer', 'goblin-shaman'], boss: 'rufo', color: '#3a5a2e' },
    { id: 'bosque', name: 'Bosque de los Susurros', lv: [3, 6], mobs: ['giant-spider', 'wolf', 'dire-wolf', 'brown-bear', 'goblin-archer', 'hobgoblin-warrior', 'bugbear-warrior'], boss: 'huargo-alfa', color: '#1e3a1e' },
    { id: 'pantano', name: 'Ciénaga de Hollow', lv: [6, 10], mobs: ['ahogado', 'hombre-lagarto', 'zombie', 'ghoul', 'giant-spider', 'specter'], boss: 'bruja-pantano', color: '#3a4a2a' },
    { id: 'yermo', name: 'Tierras Yermas', lv: [10, 14], mobs: ['escorpion', 'bandido-desierto', 'mummy', 'orc', 'orc-archer', 'ogre'], boss: 'rey-escorpion', color: '#8a5a32' },
    { id: 'picos', name: 'Picos Helados', lv: [14, 19], mobs: ['lobo-escarcha', 'yeti', 'troll-hielo', 'wight', 'orc'], boss: 'gigante-escarcha', color: '#a8b8c8' },
    { id: 'ceniza', name: 'Erial de Ceniza', lv: [19, 26], mobs: ['elemental-fuego', 'demonio', 'kobold', 'cultist', 'troll'], boss: 'young-red-dragon', color: '#3a2222' },
  ];

  // ======================================================================
  //  Misiones: cada zona tiene su historia y su gente
  // ======================================================================
  // goal: { kind: 'kill', mobs: [...], n } | { kind: 'boss', mob } | { kind: 'talk', npc }
  const QUESTS = {
    'gallinas': { npc: 'jacinta', name: 'Ladrones de gallinas', zone: 0, goal: { kind: 'kill', mobs: ['goblin-warrior', 'goblin-minion', 'goblin-archer', 'goblin-shaman'], n: 6 }, xp: 120, gold: 40, item: 'magico', text: 'Los goblins bajan cada noche a robarme las gallinas. Si me traes paz, te pagaré bien.' },
    'rufo': { npc: 'jacinta', after: 'gallinas', name: 'El jefe Rufo', zone: 0, goal: { kind: 'boss', mob: 'rufo' }, xp: 260, gold: 80, item: 'raro', text: 'Detrás de los goblins está Rufo, un bandido que les paga con cerveza robada. Su campamento está al norte del valle.' },
    'carta-lenador': { npc: 'alcalde', name: 'Carta para el bosque', zone: 0, goal: { kind: 'talk', npc: 'ewan' }, xp: 150, gold: 30, text: 'Algo pudre el bosque desde hace semanas. Lleva esta carta a Ewan, el leñador del campamento del bosque.' },
    'aranas': { npc: 'ewan', name: 'Telarañas por todas partes', zone: 1, minLevel: 3, goal: { kind: 'kill', mobs: ['giant-spider'], n: 8 }, xp: 380, gold: 90, item: 'magico', text: 'Las arañas han tejido nidos donde antes cortábamos leña. Algo las empuja hacia aquí desde el sur.' },
    'alfa': { npc: 'bran', name: 'El Huargo Alfa', zone: 1, minLevel: 4, goal: { kind: 'boss', mob: 'huargo-alfa' }, xp: 600, gold: 150, item: 'raro', text: 'Un huargo enorme guía a las manadas. Tiene los ojos rojos, como si algo lo poseyera. Acaba con él.' },
    'carta-cienaga': { npc: 'ewan', after: 'aranas', name: 'El rastro de la podredumbre', zone: 1, goal: { kind: 'talk', npc: 'morwen' }, xp: 420, gold: 60, text: 'La podredumbre viene de la Ciénaga de Hollow. La abuela Morwen, en la Aldea de Juncos, sabrá qué ocurre.' },
    'ahogados': { npc: 'morwen', name: 'Los que no descansan', zone: 2, minLevel: 6, goal: { kind: 'kill', mobs: ['ahogado', 'zombie', 'ghoul'], n: 10 }, xp: 900, gold: 180, item: 'magico', text: 'Los ahogados salen del agua por las noches. La ciénaga los despierta... o alguien los despierta.' },
    'bruja': { npc: 'morwen', after: 'ahogados', name: 'La Bruja del Pantano', zone: 2, minLevel: 8, goal: { kind: 'boss', mob: 'bruja-pantano' }, xp: 1500, gold: 300, item: 'raro', text: 'Mi hermana Zarza se fue a la taberna; la otra, Ortiga, se quedó y vendió su alma al fuego del sur. Detenla.' },
    'carta-yermo': { npc: 'morwen', after: 'bruja', name: 'Hacia las Tierras Yermas', zone: 2, goal: { kind: 'talk', npc: 'rhys' }, xp: 1000, gold: 120, text: 'Ortiga hablaba de un dragón que despierta en el Erial de Ceniza. Avisa al capitán Rhys, en el Fuerte del Desierto.' },
    'escorpiones': { npc: 'rhys', name: 'Aguijones en la arena', zone: 3, minLevel: 10, goal: { kind: 'kill', mobs: ['escorpion', 'bandido-desierto'], n: 10 }, xp: 2000, gold: 350, item: 'magico', text: 'Los escorpiones y los saqueadores cortan las rutas de suministro. Necesito el camino despejado.' },
    'rey-escorpion': { npc: 'rhys', after: 'escorpiones', name: 'El Rey Escorpión', zone: 3, minLevel: 12, goal: { kind: 'boss', mob: 'rey-escorpion' }, xp: 3200, gold: 600, item: 'raro', text: 'Su rey duerme bajo las dunas. Cuando él caiga, los demás huirán.' },
    'carta-picos': { npc: 'rhys', after: 'rey-escorpion', name: 'El paso de montaña', zone: 3, goal: { kind: 'talk', npc: 'tor' }, xp: 2200, gold: 200, text: 'Para llegar al Erial hay que cruzar los Picos Helados. El ermitaño Tor conoce el paso.' },
    'yetis': { npc: 'tor', name: 'Bestias de la ventisca', zone: 4, minLevel: 14, goal: { kind: 'kill', mobs: ['yeti', 'lobo-escarcha', 'troll-hielo'], n: 10 }, xp: 4200, gold: 600, item: 'magico', text: 'La ventisca ha enloquecido a las bestias. Si quieres pasar, tendrás que abrirte camino.' },
    'gigante': { npc: 'tor', after: 'yetis', name: 'El Gigante de Escarcha', zone: 4, minLevel: 16, goal: { kind: 'boss', mob: 'gigante-escarcha' }, xp: 6500, gold: 1000, item: 'raro', text: 'Un gigante guarda el paso. Dicen que el dragón le prometió el valle entero.' },
    'carta-ceniza': { npc: 'tor', after: 'gigante', name: 'La Última Vigía', zone: 4, goal: { kind: 'talk', npc: 'selene' }, xp: 4500, gold: 400, text: 'Al otro lado está la Última Vigía. Selene lleva años esperando a alguien capaz de acabar con Ignaroth.' },
    'demonios': { npc: 'selene', name: 'Hijos de la llama', zone: 5, minLevel: 19, goal: { kind: 'kill', mobs: ['demonio', 'elemental-fuego', 'cultist'], n: 12 }, xp: 9000, gold: 1200, item: 'raro', text: 'El dragón alimenta a demonios y sectarios. Diezma sus filas antes del asalto final.' },
    'ignaroth': { npc: 'selene', after: 'demonios', name: 'Ignaroth', zone: 5, minLevel: 22, goal: { kind: 'boss', mob: 'young-red-dragon' }, xp: 16000, gold: 3000, item: 'unico', text: 'Es la hora. Sube a su guarida y acaba con la plaga de ceniza para siempre.' },
  };

  // ======================================================================
  //  Utilidades de combate (las usa el servidor)
  // ======================================================================
  const reduction = (armor, attackerLevel) => Math.min(0.75, armor / (armor + 30 + 10 * attackerLevel));
  // Experiencia por debajo de tu nivel: se reduce si el monstruo es mucho más débil
  const xpPenalty = (playerLevel, monsterLevel) => (monsterLevel >= playerLevel - 3 ? 1 : Math.max(0.2, 1 - 0.15 * (playerLevel - 3 - monsterLevel)));

  const RULES = {
    MAX_LEVEL, BAG_SIZE, RULES_VERSION, STAT_BASE, STAT_MAX, POINTS_START, STATS, STAT_IDS, EXTRA, ELEMENTS, RACES, RACE_IDS, SEXES, CLASSES, CLASS_IDS, LEGACY_CLASS, ARMOR_TYPES, ARMOR_SKINS, WEAPON_SKINS,
    ABILITIES, ABILITY_BY_ID, XP_TABLE, SLOTS, SLOT_IDS, TIERS, WEAPONS, FISTS, OFFHANDS, ARMOR_REQ, JEWELS,
    RARITIES, RARITY_ORDER, LEGACY_RARITY, AFFIXES, SETS, CONSUMABLES, BUFFS, SHOPS, MONSTERS, LEGACY_MONSTER, THEMES,
    statName, fmtStat, classId, raceId, levelFromXp, pointsTotal, pointsSpent, pointsFree, baseStats, statRoom, newChar, cleanChar,
    TALENTS, TALENT_BY_ID, talentPoints, talentSpent, canTalent, cleanTalents, talentBonus, LEGENDARY, LEGENDARY_COLOR, itemColor, rollRarity, rollDropRarity, makeItem, itemValue, rollLoot, starterItems, canEquip, typeLine, describe, describeRich, baseInfo, speedName, allowedBases, affixPool, affixTier, rollAffixValue,
    migrateItem, migrateProfile, adj,
    PETS, PET_LEVEL, MOUNT_LEVEL, MOUNTS, petStats, PET_MAX, petXpFor, petLevelFromXp, petEvo, petTitle, PET_SKILLS, PET_SKILL_LEVEL, petBagWeight, ZONES, QUESTS, itemWeight, classesFor,
    priceScale, buyPrice, itemBuyPrice, armeroStock, seeded, gearTotals, derive, abilitiesFor, gearLook, monsterAt, reduction, xpPenalty,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = RULES;
  else root.RULES = RULES;
})(this);
