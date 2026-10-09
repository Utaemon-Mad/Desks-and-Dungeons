// Reglas propias de Desks & Dungeons: 7 características, 7 clases, objetos con
// rarezas, conjuntos de clase, botín, monstruos escalados por nivel, habilidades, tiendas y bufos.
// Lo usan el servidor (que manda) y el navegador (para mostrar fichas, objetos y precios).
(function (root) {
  'use strict';

  const MAX_LEVEL = 50;
  const BAG_SIZE = 36;
  const POINTS_START = 5;      // puntos libres al crear el personaje
  const POINTS_PER_LEVEL = 5;  // puntos por cada nivel ganado

  // ======================================================================
  //  Características
  // ======================================================================
  const STATS = [
    { id: 'fue', name: 'Fuerza', abbr: 'FUE', desc: 'Daño con espadas, hachas, mazas y armas pesadas.' },
    { id: 'des', name: 'Destreza', abbr: 'DES', desc: 'Daño con dagas, arcos y ballestas; puntería y esquiva.' },
    { id: 'con', name: 'Constitución', abbr: 'CON', desc: 'Armadura natural: reduce el daño que recibes.' },
    { id: 'vit', name: 'Vitalidad', abbr: 'VIT', desc: 'Puntos de vida y regeneración de vida.' },
    { id: 'res', name: 'Resistencia', abbr: 'RES', desc: 'Energía para las habilidades, su recuperación y defensa contra la magia.' },
    { id: 'car', name: 'Carisma', abbr: 'CAR', desc: 'Poder de hechizos y curaciones, y mejores precios en las tiendas.' },
    { id: 'sue', name: 'Suerte', abbr: 'SUE', desc: 'Golpes críticos, esquiva y mejor botín.' },
  ];
  const STAT_IDS = STATS.map((s) => s.id);
  const statName = (id) => (STATS.find((s) => s.id === id) || {}).name || id;

  // Otros atributos que dan los objetos, conjuntos y bufos
  const EXTRA = {
    hp: { name: 'Vida', fmt: (v) => `+${v} de vida` },
    en: { name: 'Energía', fmt: (v) => `+${v} de energía` },
    armor: { name: 'Armadura', fmt: (v) => `+${v} de armadura` },
    dmgPct: { name: 'Daño', fmt: (v) => `+${v}% de daño` },
    crit: { name: 'Crítico', fmt: (v) => `+${v}% de probabilidad de crítico` },
    critDmg: { name: 'Daño crítico', fmt: (v) => `+${v}% de daño crítico` },
    speed: { name: 'Velocidad de ataque', fmt: (v) => `+${v}% de velocidad de ataque` },
    move: { name: 'Velocidad', fmt: (v) => `+${v}% de velocidad al andar` },
    lifesteal: { name: 'Robo de vida', fmt: (v) => `${v}% del daño te cura` },
    mf: { name: 'Hallazgo', fmt: (v) => `+${v}% de probabilidad de botín` },
    hpRegen: { name: 'Regeneración', fmt: (v) => `+${v} de vida por segundo` },
    enRegen: { name: 'Recuperación', fmt: (v) => `+${v} de energía por segundo` },
    cdr: { name: 'Enfriamiento', fmt: (v) => `-${v}% de espera de habilidades` },
    dodge: { name: 'Esquiva', fmt: (v) => `+${v}% de esquiva` },
    armorPct: { name: 'Armadura %', fmt: (v) => `+${v}% de armadura` },
    hpPct: { name: 'Vida %', fmt: (v) => `+${v}% de vida máxima` },
    healPct: { name: 'Curación', fmt: (v) => `+${v}% a tus curaciones` },
  };
  function fmtStat(k, v) {
    if (STAT_IDS.includes(k)) return `+${v} ${statName(k)}`;
    return EXTRA[k] ? EXTRA[k].fmt(v) : `${k} ${v}`;
  }

  // ======================================================================
  //  Clases
  // ======================================================================
  const ARMOR_TYPES = { tela: 'Tela', cuero: 'Cuero', malla: 'Malla', placas: 'Placas' };

  const CLASSES = {
    guerrero: {
      name: 'Guerrero', icon: '⚔️', main: 'fue', hp: 1.15, base: { fue: 4, con: 3, vit: 3 }, favored: ['fue', 'vit', 'con'],
      armor: ['tela', 'cuero', 'malla', 'placas'], weapons: ['espada', 'hacha', 'maza', 'espadon', 'martillo', 'lanza', 'escudo'],
      start: [['arma', 'espada'], ['mano', 'escudo'], ['pecho', 'malla']],
      desc: 'Lucha en primera línea con armas pesadas y armadura de placas.',
    },
    mago: {
      name: 'Mago', icon: '🔮', main: 'car', hp: 0.9, base: { car: 5, res: 3, sue: 2 }, favored: ['car', 'res', 'sue'],
      armor: ['tela'], weapons: ['baston', 'varita', 'orbe', 'daga'],
      start: [['arma', 'baston'], ['pecho', 'tela']],
      desc: 'Lanza hechizos a distancia: proyectiles, bolas de fuego y escarcha.',
    },
    explorador: {
      name: 'Explorador', icon: '🏹', main: 'des', hp: 1, base: { des: 5, sue: 2, vit: 3 }, favored: ['des', 'sue', 'vit'],
      armor: ['tela', 'cuero', 'malla'], weapons: ['arco', 'ballesta', 'daga', 'espada', 'lanza'],
      start: [['arma', 'arco'], ['pecho', 'cuero']],
      desc: 'Arquero certero que acribilla a los enemigos antes de que lleguen.',
    },
    picaro: {
      name: 'Pícaro', icon: '🗡️', main: 'des', hp: 0.95, base: { des: 5, sue: 3, res: 2 }, favored: ['des', 'sue', 'res'],
      armor: ['tela', 'cuero'], weapons: ['daga', 'espada', 'arco', 'ballesta'],
      start: [['arma', 'daga'], ['pecho', 'cuero']],
      desc: 'Rápido y letal: puñaladas, venenos y muchos críticos.',
    },
    paladin: {
      name: 'Paladín', icon: '🛡️', main: 'fue', hp: 1.12, base: { fue: 3, car: 3, con: 2, vit: 2 }, favored: ['fue', 'car', 'con'],
      armor: ['tela', 'cuero', 'malla', 'placas'], weapons: ['espada', 'maza', 'martillo', 'espadon', 'escudo'],
      start: [['arma', 'maza'], ['mano', 'escudo'], ['pecho', 'malla']],
      desc: 'Guerrero sagrado que golpea, protege al grupo y cura con las manos.',
    },
    brujo: {
      name: 'Brujo', icon: '👁️', main: 'car', hp: 0.95, base: { car: 5, vit: 3, res: 2 }, favored: ['car', 'vit', 'res'],
      armor: ['tela', 'cuero'], weapons: ['varita', 'baston', 'orbe', 'daga'],
      start: [['arma', 'varita'], ['mano', 'orbe'], ['pecho', 'tela']],
      desc: 'Pactó con algo oscuro: maldice, drena vida y desata el vacío.',
    },
    clerigo: {
      name: 'Clérigo', icon: '✨', main: 'car', hp: 1.05, base: { car: 4, vit: 3, con: 3 }, favored: ['car', 'vit', 'con'],
      armor: ['tela', 'cuero', 'malla'], weapons: ['maza', 'baston', 'escudo', 'orbe'],
      start: [['arma', 'maza'], ['mano', 'escudo'], ['pecho', 'malla']],
      desc: 'Sana al grupo y castiga a los no muertos con llamas sagradas.',
    },
  };
  const CLASS_IDS = Object.keys(CLASSES);
  // Clases de versiones anteriores del juego (reglas del SRD) → clase actual
  const LEGACY_CLASS = {
    fighter: 'guerrero', barbarian: 'guerrero', wizard: 'mago', sorcerer: 'mago', ranger: 'explorador', druid: 'clerigo',
    rogue: 'picaro', monk: 'picaro', bard: 'picaro', paladin: 'paladin', warlock: 'brujo', cleric: 'clerigo',
    maga: 'mago', elfo: 'explorador', bardo: 'picaro',
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
    brujo: [
      { id: 'descarga', lvl: 1, name: 'Descarga sobrenatural', icon: '🟣', cost: 8, cd: 2500, kind: 'bolt', range: 8, mult: 0.85, count: 2, fx: 'void', desc: 'Dos rayos de energía oscura (85% cada uno).' },
      { id: 'maldicion', lvl: 3, name: 'Maldición', icon: '🕯️', cost: 15, cd: 10000, kind: 'mark', range: 8, vuln: 25, dot: 2.0, dur: 8000, desc: 'El objetivo recibe un 25% más de daño y sufre 200% en 8 s.' },
      { id: 'drenar', lvl: 6, name: 'Drenar vida', icon: '🩸', cost: 20, cd: 8000, kind: 'bolt', range: 7, mult: 1.8, leech: 0.5, fx: 'blood', desc: 'Roba vida: 180% de daño y te cura la mitad.' },
      { id: 'hadar', lvl: 10, name: 'Hambre de Hadar', icon: '🌑', cost: 40, cd: 18000, kind: 'blast', range: 8, radius: 2, mult: 0.4, dot: 3.0, dur: 6000, slow: 6000, fx: 'void', desc: 'Oscuridad helada en 5×5: 300% en 6 s y los ralentiza.' },
    ],
    clerigo: [
      { id: 'curar', lvl: 1, name: 'Curar heridas', icon: '💚', cost: 15, cd: 3000, kind: 'heal', range: 6, pct: 0.25, desc: 'Cura a un aliado (o a ti) el 25% de su vida, más tu poder.' },
      { id: 'llama', lvl: 3, name: 'Llama sagrada', icon: '🔥', cost: 10, cd: 3000, kind: 'bolt', range: 7, mult: 1.6, fx: 'holy', undead: 0.5, desc: 'Fuego divino (160%; +50% contra no muertos).' },
      { id: 'plegaria', lvl: 6, name: 'Plegaria de sanación', icon: '🙏', cost: 35, cd: 15000, kind: 'healAll', radius: 5, pct: 0.25, desc: 'Cura a todo el grupo cercano el 25% de su vida.' },
      { id: 'espiritus', lvl: 10, name: 'Espíritus guardianes', icon: '👼', cost: 35, cd: 20000, kind: 'aura', radius: 2, mult: 0.6, dur: 8000, fx: 'holy', desc: 'Espíritus que dañan cada segundo a los enemigos cercanos (60%) durante 8 s.' },
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
  const pointsTotal = (level) => POINTS_START + POINTS_PER_LEVEL * (level - 1);
  const pointsSpent = (char) => STAT_IDS.reduce((t, k) => t + (char.alloc[k] || 0), 0);
  const pointsFree = (char, level) => Math.max(0, pointsTotal(level) - pointsSpent(char));

  // Características base: 5 en todo + las de la clase
  function baseStats(char) {
    const s = Object.fromEntries(STAT_IDS.map((k) => [k, 5]));
    for (const [k, v] of Object.entries(CLASSES[char.cls].base)) s[k] += v;
    return s;
  }

  // ======================================================================
  //  Objetos
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

  // g: género del nombre (m, f, mp, fp) para concordar los adjetivos
  const WEAPONS = {
    espada:   { name: 'Espada', g: 'f', stat: 'fue', dmg: [4, 8], ms: 900, hands: 1, range: 1, kind: 'melee' },
    daga:     { name: 'Daga', g: 'f', stat: 'des', dmg: [3, 6], ms: 650, hands: 1, range: 1, kind: 'melee' },
    hacha:    { name: 'Hacha', g: 'f', stat: 'fue', dmg: [5, 10], ms: 1050, hands: 1, range: 1, kind: 'melee' },
    maza:     { name: 'Maza', g: 'f', stat: 'fue', dmg: [5, 9], ms: 1000, hands: 1, range: 1, kind: 'melee' },
    espadon:  { name: 'Mandoble', g: 'm', stat: 'fue', dmg: [10, 17], ms: 1350, hands: 2, range: 1, kind: 'melee' },
    martillo: { name: 'Martillo de guerra', g: 'm', stat: 'fue', dmg: [11, 16], ms: 1400, hands: 2, range: 1, kind: 'melee' },
    lanza:    { name: 'Lanza', g: 'f', stat: 'fue', dmg: [7, 12], ms: 1150, hands: 2, range: 2, kind: 'melee' },
    arco:     { name: 'Arco', g: 'm', stat: 'des', dmg: [4, 9], ms: 1000, hands: 2, range: 7, kind: 'ranged' },
    ballesta: { name: 'Ballesta', g: 'f', stat: 'des', dmg: [7, 13], ms: 1450, hands: 2, range: 8, kind: 'ranged' },
    baston:   { name: 'Bastón', g: 'm', stat: 'car', dmg: [5, 10], ms: 1100, hands: 2, range: 6, kind: 'magic' },
    varita:   { name: 'Varita', g: 'f', stat: 'car', dmg: [3, 7], ms: 800, hands: 1, range: 6, kind: 'magic' },
  };
  const FISTS = { name: 'Puños', stat: 'fue', dmg: [1, 3], ms: 800, hands: 1, range: 1, kind: 'melee' };
  const OFFHANDS = {
    escudo: { name: 'Escudo', g: 'm', armor: 6 },
    orbe:   { name: 'Orbe', g: 'm', car: true },
  };
  const ARMOR_BASE = { tela: 2, cuero: 4, malla: 6, placas: 8 };
  const ARMOR_SLOT = { casco: 0.6, pecho: 1.4, guantes: 0.4, botas: 0.5 };
  const ARMOR_NAMES = {
    casco:   { tela: ['Capucha', 'f'], cuero: ['Gorro de cuero', 'm'], malla: ['Almófar', 'm'], placas: ['Yelmo', 'm'] },
    pecho:   { tela: ['Túnica', 'f'], cuero: ['Jubón de cuero', 'm'], malla: ['Cota de malla', 'f'], placas: ['Coraza', 'f'] },
    guantes: { tela: ['Guantes de tela', 'mp'], cuero: ['Guantes de cuero', 'mp'], malla: ['Guanteletes de malla', 'mp'], placas: ['Guanteletes', 'mp'] },
    botas:   { tela: ['Sandalias', 'fp'], cuero: ['Botas de cuero', 'fp'], malla: ['Botas de malla', 'fp'], placas: ['Grebas', 'fp'] },
  };
  const JEWELS = { amuleto: { name: 'Amuleto', g: 'm' }, anillo: { name: 'Anillo', g: 'm' } };

  // Las cuatro rarezas del botín: cuanto menos probable, mejor. Los objetos de conjunto sólo los sueltan los jefes.
  const RARITIES = {
    comun:      { name: 'Común', chance: 0.50, color: '#d8d4c8', affixes: [1, 1], mult: 1, value: 1 },
    raro:       { name: 'Raro', chance: 0.20, color: '#4aa0ff', affixes: [2, 2], mult: 1.15, value: 3 },
    epico:      { name: 'Épico', chance: 0.05, color: '#c060ff', affixes: [3, 3], mult: 1.32, value: 8 },
    legendario: { name: 'Legendario', chance: 0.01, color: '#ff9a2a', affixes: [4, 4], mult: 1.55, value: 25 },
    conjunto:   { name: 'Conjunto', chance: 0, color: '#3ee67a', affixes: [3, 3], mult: 1.5, value: 30 },
  };
  const RARITY_ORDER = ['comun', 'raro', 'epico', 'legendario', 'conjunto'];

  // Afijos: valor máximo según el nivel del objeto y dónde pueden salir
  const AFFIXES = {
    fue: { v: (l) => 1 + l * 0.6, adj: ['brutal', 'brutal', 'brutales', 'brutales'], suf: 'del Toro' },
    des: { v: (l) => 1 + l * 0.6, adj: ['ágil', 'ágil', 'ágiles', 'ágiles'], suf: 'del Zorro' },
    con: { v: (l) => 1 + l * 0.6, adj: ['robusto', 'robusta', 'robustos', 'robustas'], suf: 'de la Montaña' },
    vit: { v: (l) => 1 + l * 0.6, adj: ['vigoroso', 'vigorosa', 'vigorosos', 'vigorosas'], suf: 'del Oso' },
    res: { v: (l) => 1 + l * 0.6, adj: ['incansable', 'incansable', 'incansables', 'incansables'], suf: 'del Lobo' },
    car: { v: (l) => 1 + l * 0.6, adj: ['arcano', 'arcana', 'arcanos', 'arcanas'], suf: 'del Sabio' },
    sue: { v: (l) => 1 + l * 0.6, adj: ['afortunado', 'afortunada', 'afortunados', 'afortunadas'], suf: 'del Trébol' },
    hp: { v: (l) => 6 + l * 5, adj: ['vital', 'vital', 'vitales', 'vitales'], suf: 'de la Vida' },
    armor: { v: (l) => 2 + l * 1.5, adj: ['reforzado', 'reforzada', 'reforzados', 'reforzadas'], suf: 'del Bastión' },
    dmgPct: { v: (l) => Math.min(30, 4 + l * 0.6), adj: ['cruel', 'cruel', 'crueles', 'crueles'], suf: 'de la Matanza' },
    crit: { v: (l) => Math.min(8, 1 + l * 0.15), adj: ['letal', 'letal', 'letales', 'letales'], suf: 'del Halcón', dec: true },
    critDmg: { v: (l) => Math.min(50, 8 + l), adj: ['despiadado', 'despiadada', 'despiadados', 'despiadadas'], suf: 'de la Carnicería' },
    speed: { v: (l) => Math.min(15, 3 + l * 0.25), adj: ['veloz', 'veloz', 'veloces', 'veloces'], suf: 'del Rayo' },
    move: { v: (l) => Math.min(12, 3 + l * 0.2), adj: ['ligero', 'ligera', 'ligeros', 'ligeras'], suf: 'del Viento' },
    lifesteal: { v: (l) => Math.min(6, 1 + l * 0.1), adj: ['vampírico', 'vampírica', 'vampíricos', 'vampíricas'], suf: 'del Vampiro', dec: true },
    mf: { v: (l) => Math.min(40, 5 + l), adj: ['reluciente', 'reluciente', 'relucientes', 'relucientes'], suf: 'del Buscador' },
    hpRegen: { v: (l) => 0.5 + l * 0.2, adj: ['regenerador', 'regeneradora', 'regeneradores', 'regeneradoras'], suf: 'del Trol', dec: true },
    enRegen: { v: (l) => 0.5 + l * 0.15, adj: ['místico', 'mística', 'místicos', 'místicas'], suf: 'del Manantial', dec: true },
    cdr: { v: (l) => Math.min(10, 2 + l * 0.2), adj: ['sereno', 'serena', 'serenos', 'serenas'], suf: 'del Monje' },
  };
  const STAT_AFFIXES = STAT_IDS;
  const SLOT_AFFIXES = {
    arma: [...STAT_AFFIXES, 'dmgPct', 'crit', 'critDmg', 'speed', 'lifesteal'],
    mano: [...STAT_AFFIXES, 'hp', 'armor', 'crit', 'cdr', 'enRegen'],
    casco: [...STAT_AFFIXES, 'hp', 'armor', 'cdr', 'mf'],
    pecho: [...STAT_AFFIXES, 'hp', 'armor', 'hpRegen', 'enRegen'],
    guantes: [...STAT_AFFIXES, 'armor', 'crit', 'speed', 'critDmg'],
    botas: [...STAT_AFFIXES, 'hp', 'armor', 'move', 'mf'],
    amuleto: [...STAT_AFFIXES, 'hp', 'dmgPct', 'crit', 'critDmg', 'lifesteal', 'mf', 'cdr', 'enRegen', 'hpRegen'],
    anillo: [...STAT_AFFIXES, 'hp', 'dmgPct', 'crit', 'critDmg', 'speed', 'lifesteal', 'mf', 'enRegen'],
  };

  const LEGENDARY_NAMES = {
    arma: ['Filo del Alba', 'Llanto de la Viuda', 'Segadora de Almas', 'Colmillo de Medianoche', 'Juramento Roto', 'Ira del Dragón', 'Susurro del Vacío', 'Lamento del Rey', 'Aguijón de Ceniza', 'Furia Carmesí'],
    mano: ['Bastión Inquebrantable', 'Esfera del Eclipse', 'Muro de los Mártires', 'Corazón de Tormenta'],
    casco: ['Corona del Rey Hueco', 'Mirada del Basilisco', 'Yelmo de los Mil Ecos'],
    pecho: ['Égida del Último Rey', 'Piel del Leviatán', 'Manto de la Noche Eterna', 'Vestigio del Titán'],
    guantes: ['Garras del Wendigo', 'Manos del Verdugo', 'Toque de la Plaga'],
    botas: ['Pasos del Espectro', 'Andar del Peregrino', 'Huella de Ceniza'],
    amuleto: ['Corazón de Brasas', 'Lágrima de la Luna', 'Sello del Abismo'],
    anillo: ['Estrella del Peregrino', 'Anillo del Ahorcado', 'Ojo del Cuervo'],
  };

  // Conjuntos de clase: equipo muy fuerte que sólo sueltan los jefes de las mazmorras
  const SETS = {
    guerrero: { name: 'Furia del Coloso', pieces: [['arma', 'espadon', 'Mandoble del Coloso'], ['casco', 'placas', 'Yelmo del Coloso'], ['pecho', 'placas', 'Coraza del Coloso'], ['guantes', 'placas', 'Puños del Coloso']], b2: { fue: 10, hp: 60 }, b4: { dmgPct: 25, armorPct: 20 } },
    mago: { name: 'Tejido del Archimago', pieces: [['arma', 'baston', 'Bastón del Archimago'], ['casco', 'tela', 'Capucha del Archimago'], ['pecho', 'tela', 'Túnica del Archimago'], ['botas', 'tela', 'Sandalias del Archimago']], b2: { car: 10, en: 40 }, b4: { dmgPct: 25, cdr: 20 } },
    explorador: { name: 'Sendero del Cazador', pieces: [['arma', 'arco', 'Arco del Cazador'], ['casco', 'cuero', 'Gorro del Cazador'], ['pecho', 'cuero', 'Jubón del Cazador'], ['botas', 'cuero', 'Botas del Cazador']], b2: { des: 10, crit: 5 }, b4: { dmgPct: 20, speed: 15 } },
    picaro: { name: 'Sombra de Medianoche', pieces: [['arma', 'daga', 'Daga de Medianoche'], ['casco', 'cuero', 'Capucha de Medianoche'], ['pecho', 'cuero', 'Jubón de Medianoche'], ['guantes', 'cuero', 'Guantes de Medianoche']], b2: { des: 10, crit: 6 }, b4: { critDmg: 60, dodge: 8 } },
    paladin: { name: 'Juramento del Alba', pieces: [['arma', 'maza', 'Maza del Alba'], ['mano', 'escudo', 'Escudo del Alba'], ['pecho', 'placas', 'Coraza del Alba'], ['casco', 'placas', 'Yelmo del Alba']], b2: { fue: 6, car: 6 }, b4: { armorPct: 30, lifesteal: 5 } },
    brujo: { name: 'Pacto del Abismo', pieces: [['arma', 'varita', 'Varita del Abismo'], ['mano', 'orbe', 'Orbe del Abismo'], ['pecho', 'tela', 'Túnica del Abismo'], ['casco', 'tela', 'Capucha del Abismo']], b2: { car: 10, lifesteal: 3 }, b4: { dmgPct: 30, hp: 80 } },
    clerigo: { name: 'Luz de la Catedral', pieces: [['arma', 'maza', 'Maza de la Catedral'], ['mano', 'escudo', 'Escudo de la Catedral'], ['pecho', 'malla', 'Cota de la Catedral'], ['casco', 'malla', 'Almófar de la Catedral']], b2: { car: 8, vit: 6 }, b4: { healPct: 40, armorPct: 20 } },
  };

  // ---------- Generación ----------
  const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
  const round1 = (v) => Math.round(v * 10) / 10;
  const uid = (rng) => Array.from({ length: 10 }, () => Math.floor(rng() * 36).toString(36)).join('');

  function rollRarity(rng, mf = 0) {
    const k = 1 + mf / 100;
    const r = rng();
    let acc = 0;
    for (const id of ['legendario', 'epico', 'raro', 'comun']) {
      acc += Math.min(id === 'comun' ? RARITIES[id].chance : 0.6, RARITIES[id].chance * (id === 'comun' ? 1 : k));
      if (r < acc) return id;
    }
    return null;
  }

  // Tipos de objeto que puede llevar alguien con estas clases (para el botín "inteligente")
  function allowedBases(classes) {
    const weapons = new Set(), armor = new Set();
    for (const c of classes) { if (!CLASSES[c]) continue; for (const w of CLASSES[c].weapons) weapons.add(w); for (const a of CLASSES[c].armor) armor.add(a); }
    return { weapons: [...weapons], armor: [...armor] };
  }

  // o: { ilvl, rarity, slot?, base?, classes? (para quién es), set? (clase del conjunto), piece? }
  function makeItem(rng, o) {
    const ilvl = Math.max(1, Math.min(MAX_LEVEL + 5, o.ilvl | 0 || 1));
    const rarity = o.rarity || 'comun';
    const R = RARITIES[rarity];
    const classes = (o.classes || []).filter((c) => CLASSES[c]);
    const fit = classes.length ? allowedBases(classes) : null;
    const it = { id: uid(rng), rarity, ilvl, req: ilvl, stats: {} };
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
    if (slot === 'mano' && fit && !fit.weapons.some((w) => OFFHANDS[w])) slot = 'arma';
    it.slot = slot;
    let noun, g;
    if (slot === 'arma') {
      if (!base) base = pick(rng, fit ? fit.weapons.filter((w) => WEAPONS[w]) : Object.keys(WEAPONS));
      const W = WEAPONS[base];
      const k = (1 + 0.2 * (ilvl - 1)) * R.mult;
      it.dmg = [Math.max(1, Math.round(W.dmg[0] * k)), Math.max(2, Math.round(W.dmg[1] * k))];
      noun = W.name; g = W.g;
    } else if (slot === 'mano') {
      if (!base) {
        const opts = fit ? fit.weapons.filter((w) => OFFHANDS[w]) : Object.keys(OFFHANDS);
        base = pick(rng, opts.length ? opts : Object.keys(OFFHANDS));
      }
      const O = OFFHANDS[base];
      if (O.armor) { it.armor = Math.round(O.armor * (1 + 0.18 * (ilvl - 1)) * R.mult); it.block = Math.round(8 + Math.min(12, ilvl * 0.3)); }
      if (O.car) it.stats.car = Math.round((2 + ilvl * 0.4) * R.mult);
      noun = O.name; g = O.g;
    } else if (ARMOR_SLOT[slot]) {
      if (!base) base = pick(rng, fit && rng() < 0.9 ? fit.armor : Object.keys(ARMOR_BASE));
      it.type = base;
      it.armor = Math.max(1, Math.round(ARMOR_BASE[base] * ARMOR_SLOT[slot] * (1 + 0.18 * (ilvl - 1)) * R.mult));
      [noun, g] = ARMOR_NAMES[slot][base];
    } else {
      base = slot;
      noun = JEWELS[slot].name; g = JEWELS[slot].g;
    }
    it.base = base;

    // Afijos: los del conjunto salen de las características de la clase; el resto, al azar (a veces de quien lo encuentra)
    const n = R.affixes[0] + Math.floor(rng() * (R.affixes[1] - R.affixes[0] + 1));
    const pool = o.set ? SLOT_AFFIXES[slot].filter((k) => CLASSES[o.set].favored.includes(k) || ['hp', 'dmgPct', 'crit', 'critDmg', 'armor', 'cdr'].includes(k)) : SLOT_AFFIXES[slot].slice();
    const favored = o.set ? CLASSES[o.set].favored : classes.length && rng() < 0.6 ? CLASSES[pick(rng, classes)].favored : null;
    const chosen = [];
    if (o.set) chosen.push(CLASSES[o.set].main);
    while (chosen.length < n + (o.set ? 1 : 0) && pool.length) {
      let k;
      if (favored && rng() < 0.55) { const f = favored.filter((x) => pool.includes(x) && !chosen.includes(x)); k = f.length ? pick(rng, f) : null; }
      if (!k) { const rest = pool.filter((x) => !chosen.includes(x)); if (!rest.length) break; k = pick(rng, rest); }
      chosen.push(k);
    }
    for (const k of chosen) {
      const A = AFFIXES[k];
      const max = A.v(ilvl) * R.mult;
      let v = max * (0.6 + rng() * 0.4);
      v = A.dec ? round1(v) : Math.max(1, Math.round(v));
      it.stats[k] = (it.stats[k] || 0) + v;
    }

    // Nombre
    if (!it.name) {
      const gi = { m: 0, f: 1, mp: 2, fp: 3 }[g] || 0;
      if (rarity === 'legendario') it.name = pick(rng, LEGENDARY_NAMES[slot]);
      else if (rarity === 'comun' || !chosen.length) it.name = noun;
      else {
        const [a1, a2] = chosen;
        it.name = `${noun} ${AFFIXES[a1].adj[gi]}`;
        if (rarity === 'epico' && a2) it.name += ' ' + AFFIXES[a2].suf;
      }
    }
    it.value = itemValue(it);
    it.weight = itemWeight(it);
    return it;
  }

  // Peso de un objeto (kg): lo pesado se lleva mejor con Fuerza o con una mascota de carga
  const WEAPON_WEIGHT = { espada: 3, daga: 1, hacha: 4, maza: 4, espadon: 7, martillo: 8, lanza: 5, arco: 2, ballesta: 5, baston: 3, varita: 1 };
  const ARMOR_WEIGHT = { tela: 1, cuero: 2, malla: 4, placas: 6 };
  function itemWeight(it) {
    if (!it) return 0;
    if (it.slot === 'arma') return WEAPON_WEIGHT[it.base] || 3;
    if (it.slot === 'mano') return it.base === 'escudo' ? 5 : 1;
    if (it.type) return round1(ARMOR_WEIGHT[it.type] * ({ casco: 0.6, pecho: 1.8, guantes: 0.4, botas: 0.7 }[it.slot] || 1));
    return 0.2;
  }

  // Clases que pueden llevar un objeto
  function classesFor(it) {
    return CLASS_IDS.filter((c) => {
      const C = CLASSES[c];
      if (it.slot === 'arma' || it.slot === 'mano') return C.weapons.includes(it.base);
      if (it.type) return C.armor.includes(it.type);
      return true;
    });
  }

  function itemValue(it) {
    const R = RARITIES[it.rarity] || RARITIES.comun;
    return Math.max(1, Math.round((4 + it.ilvl * 3) * R.value));
  }

  // Botín de un enemigo. o: { ilvl, mf, classes, elite, boss, sets }
  function rollLoot(rng, o) {
    const out = [];
    const rolls = o.boss ? 3 : o.elite ? 2 : o.chest ? 1 : 1;
    const mf = (o.mf || 0) + (o.boss ? 150 : o.elite ? 80 : o.chest ? 60 : 0);
    for (let i = 0; i < rolls; i++) {
      let rarity = rollRarity(rng, mf);
      if ((o.boss || o.chest) && (!rarity || rarity === 'comun')) rarity = 'raro';
      if (!rarity) continue;
      out.push(makeItem(rng, { ilvl: o.ilvl, rarity, classes: o.classes }));
    }
    if (o.boss && o.sets && o.sets.length) {
      // Pieza de conjunto: mejor si es de la clase de alguien del grupo
      const chance = 0.25 + Math.min(0.35, (o.mf || 0) / 400) + Math.min(0.15, o.ilvl * 0.005);
      if (rng() < chance) {
        const mine = o.sets.filter((s) => (o.classes || []).includes(s));
        const set = pick(rng, mine.length && rng() < 0.7 ? mine : o.sets);
        out.push(makeItem(rng, { ilvl: o.ilvl, rarity: 'conjunto', set }));
      }
    }
    return out;
  }

  function starterItems(cls, rng) {
    return CLASSES[cls].start.map(([slot, base]) => makeItem(rng, { ilvl: 1, rarity: 'comun', slot, base }));
  }

  // ¿Puede llevarlo? (nivel, clase y tipo de armadura)
  function canEquip(it, char, level) {
    if (!it || !SLOTS[it.slot]) return { ok: false, reason: 'Eso no se puede equipar.' };
    if (level < (it.req || 1)) return { ok: false, reason: `Necesitas nivel ${it.req}.` };
    const classes = [char.cls];
    const { weapons, armor } = allowedBases(classes);
    if (it.slot === 'arma' || it.slot === 'mano') {
      if (!weapons.includes(it.base)) return { ok: false, reason: `${classes.map((c) => CLASSES[c].name).join(' / ')} no sabe usar ${it.slot === 'arma' ? WEAPONS[it.base].name.toLowerCase() : OFFHANDS[it.base].name.toLowerCase()}.` };
    } else if (it.type && !armor.includes(it.type)) {
      return { ok: false, reason: `Tu clase no lleva armadura de ${ARMOR_TYPES[it.type].toLowerCase()}.` };
    }
    return { ok: true };
  }

  function typeLine(it) {
    const R = RARITIES[it.rarity] || RARITIES.comun;
    let kind;
    if (it.slot === 'arma') kind = WEAPONS[it.base] ? WEAPONS[it.base].name : 'Arma';
    else if (it.slot === 'mano') kind = OFFHANDS[it.base] ? OFFHANDS[it.base].name : 'Mano izquierda';
    else if (it.type) kind = `${SLOTS[it.slot].name} · ${ARMOR_TYPES[it.type]}`;
    else kind = SLOTS[it.slot] ? SLOTS[it.slot].name : '';
    return `${kind} · ${R.name}${it.set ? ` (${SETS[it.set].name})` : ''}`;
  }

  // Líneas de descripción de un objeto (para los tooltips)
  function describe(it) {
    const lines = [];
    if (it.dmg) {
      const W = WEAPONS[it.base];
      lines.push(`Daño ${it.dmg[0]}–${it.dmg[1]} · ${(1000 / W.ms).toFixed(1)} golpes/s`);
      lines.push(W.kind === 'melee' ? `Cuerpo a cuerpo${W.range > 1 ? ' (alcance 2)' : ''} · ${W.hands === 2 ? 'a dos manos' : 'una mano'} · usa ${statName(W.stat)}` : `${W.kind === 'magic' ? 'Mágica' : 'A distancia'} (alcance ${W.range}) · usa ${statName(W.stat)}`);
    }
    if (it.armor) lines.push(`Armadura ${it.armor}${it.block ? ` · ${it.block}% de bloqueo` : ''}`);
    for (const [k, v] of Object.entries(it.stats || {})) lines.push(fmtStat(k, v));
    const cl = classesFor(it);
    if (cl.length < CLASS_IDS.length) lines.push(`Para: ${cl.map((c) => CLASSES[c].name).join(', ')}`);
    lines.push(`Peso ${it.weight !== undefined ? it.weight : itemWeight(it)} kg`);
    return lines;
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
    'ojo-fortuna': { name: 'Ojo de la fortuna', icon: '🍀', price: 80, min: 20, stats: { mf: 50 }, desc: '+50% de probabilidad de botín durante 20 minutos.' },
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
      const rarity = r < 0.08 ? 'epico' : r < 0.4 ? 'raro' : 'comun';
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

  // Limpia una ficha guardada (o enviada por un cliente)
  function cleanChar(c, level) {
    const out = newChar(c && c.cls, c && c.look);
    if (c && c.alloc) {
      let budget = pointsTotal(level || 1);
      for (const k of STAT_IDS) {
        const v = Math.max(0, Math.min(budget, Math.floor(Number(c.alloc[k]) || 0)));
        out.alloc[k] = v; budget -= v;
      }
    }
    return out;
  }

  // Suma de atributos de los objetos equipados, los conjuntos y los bufos
  function gearTotals(equip, buffs, now) {
    const t = {};
    const add = (k, v) => { t[k] = round1((t[k] || 0) + v); };
    let armor = 0, block = 0;
    const setCount = {};
    for (const slot of SLOT_IDS) {
      const it = equip && equip[slot];
      if (!it) continue;
      if (it.armor) armor += it.armor;
      if (it.block) block += it.block;
      for (const [k, v] of Object.entries(it.stats || {})) add(k, v);
      if (it.set) setCount[it.set] = (setCount[it.set] || 0) + 1;
    }
    const sets = [];
    for (const [s, n] of Object.entries(setCount)) {
      const S = SETS[s];
      if (n >= 2) for (const [k, v] of Object.entries(S.b2)) add(k, v);
      if (n >= 4) for (const [k, v] of Object.entries(S.b4)) add(k, v);
      sets.push({ id: s, name: S.name, n });
    }
    const active = [];
    for (const [id, until] of Object.entries(buffs || {})) {
      if (!BUFFS[id] || until <= (now || Date.now())) continue;
      for (const [k, v] of Object.entries(BUFFS[id].stats)) add(k, v);
      active.push({ id, until });
    }
    return { t, armor, block, sets, buffs: active };
  }

  // Ficha completa a partir del perfil { xp, char, equip, buffs }
  function derive(profile, now) {
    const char = profile.char;
    const level = levelFromXp(profile.xp || 0);
    const base = baseStats(char);
    const g = gearTotals(profile.equip, profile.buffs, now);
    const stats = {};
    for (const k of STAT_IDS) stats[k] = Math.round(base[k] + (char.alloc[k] || 0) + (g.t[k] || 0));
    const x = (k) => g.t[k] || 0;
    const hpMult = CLASSES[char.cls].hp;

    const w = profile.equip && profile.equip.arma;
    const W = w ? WEAPONS[w.base] : FISTS;
    const wdmg = w ? w.dmg : FISTS.dmg;
    const statMult = 1 + stats[W.stat] * 0.03;
    const dmgMult = statMult * (1 + x('dmgPct') / 100);
    const spellBase = W.kind === 'magic' ? wdmg : [3 + level * 1.5, 6 + level * 2.5];
    const spellMult = (1 + stats.car * 0.03) * (1 + x('dmgPct') / 100);

    // carga: lo equipado y la mochila; pasarse ralentiza
    let weight = 0;
    for (const sl of SLOT_IDS) weight += itemWeight(profile.equip && profile.equip[sl]);
    for (const it of profile.bag || []) weight += itemWeight(it);
    weight = round1(weight);
    const capacity = 40 + stats.fue * 2;
    const overloaded = weight > capacity;
    const d = {
      level, cls: char.cls, stats, base, alloc: char.alloc, weight, capacity, overloaded,
      points: pointsFree(char, level),
      hp: Math.round(((30 + stats.vit * 6 + stats.con + level * 8) * hpMult + x('hp')) * (1 + x('hpPct') / 100)),
      en: Math.round(40 + stats.res * 4 + level * 2 + x('en')),
      hpRegen: round1(0.4 + stats.vit * 0.06 + x('hpRegen')),
      enRegen: round1(3 + stats.res * 0.2 + x('enRegen')),
      armor: Math.round((g.armor + x('armor') + stats.con * 1.5) * (1 + x('armorPct') / 100)),
      block: Math.min(40, g.block),
      weapon: { base: w ? w.base : 'puños', name: w ? w.name : FISTS.name, kind: W.kind, range: W.range, stat: W.stat, hands: W.hands },
      dmg: [Math.max(1, Math.round(wdmg[0] * dmgMult)), Math.max(1, Math.round(wdmg[1] * dmgMult))],
      spell: [Math.max(1, Math.round(spellBase[0] * spellMult)), Math.max(2, Math.round(spellBase[1] * spellMult))],
      atkMs: Math.round(W.ms / (1 + x('speed') / 100)),
      crit: round1(Math.min(60, 5 + stats.sue * 0.35 + x('crit'))),
      critMult: round1(1.5 + x('critDmg') / 100),
      dodge: round1(Math.min(35, stats.sue * 0.2 + stats.des * 0.15 + x('dodge'))),
      hit: round1(stats.des * 0.25),
      moveMs: Math.max(120, Math.round(200 / (1 + x('move') / 100) * (overloaded ? 1.4 : 1))),
      mf: Math.round(stats.sue + x('mf')),
      discount: round1(Math.min(20, stats.car * 0.4)),
      healPow: round1(1 + stats.car * 0.03 + x('healPct') / 100),
      cdr: Math.min(30, x('cdr')),
      magicRes: Math.min(50, round1(stats.res * 0.5)),
      lifesteal: Math.min(20, x('lifesteal')),
      sets: g.sets, buffs: g.buffs,
      abilities: abilitiesFor(char, level),
    };
    return d;
  }

  function abilitiesFor(char, level) {
    const out = [];
    for (const a of ABILITIES[char.cls]) out.push({ ...a, cls: char.cls, unlock: a.lvl, ready: level >= a.lvl });
    return out;
  }

  // Aspecto del héroe para los sprites: clase, especie, colores y el equipo que se ve
  function gearLook(equip) {
    const e = equip || {};
    const g = {};
    if (e.arma) { g.w = e.arma.base; g.wr = e.arma.rarity; }
    if (e.mano) { g.o = e.mano.base; g.or = e.mano.rarity; }
    for (const s of ['casco', 'pecho', 'guantes', 'botas']) if (e[s]) { g[s] = e[s].type; g[s + 'R'] = e[s].rarity; }
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
  const MONSTERS = {
    'goblin-minion':   { name: 'Goblin enclenque', fam: 'goblin', sprite: 'goblin', scale: 0.85, hp: 14, dmg: [1, 3], armor: 1, ms: 330, atk: 1300, xp: 6, gold: [1, 3] },
    'goblin-warrior':  { name: 'Goblin', fam: 'goblin', sprite: 'goblin', hp: 20, dmg: [2, 4], armor: 2, ms: 330, atk: 1300, xp: 8, gold: [1, 4] },
    'goblin-archer':   { name: 'Goblin arquero', fam: 'goblin', sprite: 'goblin', weapon: 'bow', hp: 15, dmg: [2, 4], armor: 1, ms: 330, atk: 2100, range: 6, proj: 'arrow', ai: 'ranged', xp: 9, gold: [1, 4] },
    'goblin-shaman':   { name: 'Chamán goblin', fam: 'goblin', sprite: 'shaman', hp: 18, dmg: [2, 5], armor: 1, ms: 360, atk: 2400, range: 5, proj: 'bolt', magic: true, ai: 'healer', xp: 12, gold: [2, 6] },
    'hobgoblin-warrior': { name: 'Hobgoblin', fam: 'goblin', sprite: 'hobgoblin', hp: 34, dmg: [3, 6], armor: 5, ms: 340, atk: 1400, xp: 14, gold: [2, 6], minLevel: 2 },
    'bugbear-warrior': { name: 'Osgo', fam: 'goblin', sprite: 'bugbear', hp: 46, dmg: [4, 8], armor: 3, ms: 320, atk: 1600, xp: 18, gold: [3, 8], minLevel: 3 },
    'orc':             { name: 'Orco', fam: 'orco', sprite: 'orc', hp: 38, dmg: [3, 7], armor: 4, ms: 330, atk: 1450, xp: 15, gold: [2, 7] },
    'orc-archer':      { name: 'Orco lanzador', fam: 'orco', sprite: 'orc', weapon: 'spear', tint: '#6a5a3a', hp: 28, dmg: [3, 6], armor: 2, ms: 340, atk: 2200, range: 6, proj: 'javelin', ai: 'ranged', xp: 15, gold: [2, 7] },
    'orc-shaman':      { name: 'Chamán orco', fam: 'orco', sprite: 'warchief', scale: 0.9, tint: '#3a5a8a', hp: 30, dmg: [3, 6], armor: 2, ms: 360, atk: 2400, range: 5, proj: 'bolt', magic: true, ai: 'healer', xp: 18, gold: [3, 9], minLevel: 2 },
    'orc-war-chief':   { name: 'Jefe de guerra orco', fam: 'orco', sprite: 'warchief', hp: 110, dmg: [6, 11], armor: 7, ms: 330, atk: 1500, xp: 60, gold: [15, 30] },
    'ogre':            { name: 'Ogro', fam: 'orco', sprite: 'ogre', hp: 105, dmg: [7, 12], armor: 4, ms: 430, atk: 1900, xp: 40, gold: [6, 14], minLevel: 4 },
    'troll':           { name: 'Trol', fam: 'orco', sprite: 'troll', hp: 95, dmg: [5, 10], armor: 3, ms: 360, atk: 1500, regen: 2, xp: 45, gold: [6, 14], minLevel: 6 },
    'skeleton':        { name: 'Esqueleto', fam: 'muerto', sprite: 'skeleton', hp: 22, dmg: [2, 5], armor: 3, ms: 340, atk: 1400, xp: 8, gold: [1, 4], undead: true },
    'skeleton-archer': { name: 'Esqueleto arquero', fam: 'muerto', sprite: 'skeleton', weapon: 'bow', tint: '#5a5040', hp: 16, dmg: [2, 4], armor: 2, ms: 340, atk: 2100, range: 6, proj: 'arrow', ai: 'ranged', xp: 9, gold: [1, 4], undead: true },
    'zombie':          { name: 'Zombi', fam: 'muerto', sprite: 'zombie', hp: 38, dmg: [3, 5], armor: 1, ms: 500, atk: 1600, xp: 9, gold: [1, 4], undead: true },
    'ghoul':           { name: 'Necrófago', fam: 'muerto', sprite: 'ghoul', hp: 30, dmg: [3, 6], armor: 2, ms: 270, atk: 1300, xp: 12, gold: [2, 5], undead: true, minLevel: 2 },
    'specter':         { name: 'Espectro', fam: 'muerto', sprite: 'specter', hp: 26, dmg: [3, 6], armor: 0, ms: 290, atk: 1500, magic: true, xp: 14, gold: [2, 6], undead: true, minLevel: 2 },
    'wight':           { name: 'Tumulario', fam: 'muerto', sprite: 'wight', hp: 44, dmg: [4, 7], armor: 4, ms: 340, atk: 1450, xp: 18, gold: [3, 8], undead: true, minLevel: 3 },
    'mummy':           { name: 'Momia', fam: 'muerto', sprite: 'mummy', hp: 70, dmg: [5, 9], armor: 3, ms: 460, atk: 1700, xp: 24, gold: [4, 10], undead: true, minLevel: 4 },
    'necromancer':     { name: 'Nigromante', fam: 'muerto', sprite: 'necromancer', hp: 48, dmg: [4, 8], armor: 2, ms: 380, atk: 2300, range: 6, proj: 'necro', magic: true, ai: 'summoner', summons: 'skeleton', xp: 40, gold: [8, 18], minLevel: 5 },
    'wolf':            { name: 'Lobo', fam: 'bestia', sprite: 'wolf', hp: 18, dmg: [2, 4], armor: 1, ms: 230, atk: 1200, xp: 7, gold: [0, 2] },
    'dire-wolf':       { name: 'Huargo', fam: 'bestia', sprite: 'wolf', scale: 1.25, tint: '#4a4a52', hp: 40, dmg: [4, 7], armor: 2, ms: 230, atk: 1300, xp: 16, gold: [1, 4], minLevel: 3 },
    'giant-spider':    { name: 'Araña gigante', fam: 'bestia', sprite: 'spider', hp: 24, dmg: [2, 5], armor: 2, ms: 260, atk: 1300, poison: true, xp: 10, gold: [1, 3] },
    'brown-bear':      { name: 'Oso pardo', fam: 'bestia', sprite: 'bear', hp: 60, dmg: [4, 8], armor: 3, ms: 320, atk: 1600, xp: 22, gold: [2, 6], minLevel: 2 },
    'owlbear':         { name: 'Osolechuza', fam: 'bestia', sprite: 'owlbear', hp: 115, dmg: [6, 11], armor: 4, ms: 330, atk: 1600, xp: 50, gold: [8, 16], minLevel: 5 },
    'bandit':          { name: 'Bandido', fam: 'humano', sprite: 'hero:picaro', hp: 24, dmg: [2, 5], armor: 2, ms: 310, atk: 1300, xp: 9, gold: [3, 8] },
    'bandit-archer':   { name: 'Bandido arquero', fam: 'humano', sprite: 'hero:explorador', hp: 18, dmg: [2, 5], armor: 1, ms: 310, atk: 2000, range: 6, proj: 'arrow', ai: 'ranged', xp: 10, gold: [3, 8] },
    'bandit-captain':  { name: 'Capitán bandido', fam: 'humano', sprite: 'hero:guerrero', hp: 70, dmg: [5, 9], armor: 5, ms: 310, atk: 1400, xp: 30, gold: [12, 25] },
    'cultist':         { name: 'Sectario', fam: 'humano', sprite: 'hero:brujo', hp: 22, dmg: [3, 6], armor: 1, ms: 330, atk: 2200, range: 5, proj: 'fire', magic: true, ai: 'ranged', xp: 11, gold: [3, 8] },
    'kobold':          { name: 'Kóbold', fam: 'dragon', sprite: 'goblin', tint: '#a0402a', scale: 0.8, hp: 14, dmg: [2, 4], armor: 2, ms: 280, atk: 1200, xp: 7, gold: [1, 4] },
    // Mundo abierto: ciénaga, yermo, picos y erial
    'ahogado':         { name: 'Ahogado', fam: 'muerto', sprite: 'zombie', tint: '#3a6a6a', hp: 42, dmg: [3, 6], armor: 2, ms: 460, atk: 1500, xp: 11, gold: [1, 5], undead: true },
    'hombre-lagarto':  { name: 'Hombre lagarto', fam: 'bestia', sprite: 'hobgoblin', tint: '#3a7a3a', hp: 36, dmg: [3, 6], armor: 4, ms: 320, atk: 1350, xp: 13, gold: [2, 6] },
    'escorpion':       { name: 'Escorpión gigante', fam: 'bestia', sprite: 'spider', tint: '#a8642a', scale: 1.2, hp: 40, dmg: [3, 7], armor: 6, ms: 280, atk: 1300, poison: true, xp: 14, gold: [1, 4] },
    'bandido-desierto': { name: 'Saqueador del desierto', fam: 'humano', sprite: 'hero:picaro', hp: 30, dmg: [3, 6], armor: 3, ms: 300, atk: 1300, xp: 13, gold: [4, 10] },
    'lobo-escarcha':   { name: 'Lobo de escarcha', fam: 'bestia', sprite: 'wolf', tint: '#b8d0e8', scale: 1.1, hp: 34, dmg: [3, 6], armor: 3, ms: 220, atk: 1200, xp: 13, gold: [1, 4] },
    'yeti':            { name: 'Yeti', fam: 'bestia', sprite: 'owlbear', tint: '#e8eef4', hp: 90, dmg: [6, 10], armor: 4, ms: 340, atk: 1600, xp: 32, gold: [4, 10] },
    'troll-hielo':     { name: 'Trol de hielo', fam: 'orco', sprite: 'troll', tint: '#8ab0d8', hp: 100, dmg: [5, 10], armor: 5, ms: 360, atk: 1500, regen: 2, xp: 40, gold: [5, 12] },
    'elemental-fuego': { name: 'Elemental de fuego', fam: 'dragon', sprite: 'specter', tint: '#ff6a1a', hp: 40, dmg: [4, 8], armor: 2, ms: 300, atk: 2000, range: 5, proj: 'fire', magic: true, ai: 'ranged', xp: 18, gold: [2, 6] },
    'demonio':         { name: 'Demonio menor', fam: 'dragon', sprite: 'hobgoblin', tint: '#8a1a1a', hp: 55, dmg: [5, 9], armor: 5, ms: 290, atk: 1300, xp: 22, gold: [4, 10] },
    'rufo':            { name: 'Rufo, el jefe bandido', fam: 'humano', sprite: 'hero:guerrero', scale: 1.3, boss: true, hp: 180, dmg: [4, 7], armor: 4, ms: 320, atk: 1400, xp: 70, gold: [30, 50], specials: ['charge', 'summon'], summons: 'bandit', sets: ['picaro', 'explorador'] },
    'huargo-alfa':     { name: 'El Huargo Alfa', fam: 'bestia', sprite: 'wolf', tint: '#3a3a42', scale: 1.7, boss: true, hp: 260, dmg: [5, 9], armor: 4, ms: 230, atk: 1300, xp: 110, gold: [40, 70], specials: ['slam', 'summon'], summons: 'wolf', sets: ['explorador', 'guerrero'] },
    'bruja-pantano':   { name: 'Ortiga, la Bruja del Pantano', fam: 'muerto', sprite: 'necromancer', tint: '#3a8a3a', scale: 1.35, boss: true, hp: 280, dmg: [5, 9], armor: 3, ms: 360, atk: 1900, range: 6, proj: 'bolt', magic: true, xp: 140, gold: [50, 90], specials: ['nova', 'summon', 'volley'], summons: 'ahogado', sets: ['brujo', 'mago', 'clerigo'] },
    'rey-escorpion':   { name: 'El Rey Escorpión', fam: 'bestia', sprite: 'spider', tint: '#d8a030', scale: 2.3, boss: true, hp: 340, dmg: [6, 11], armor: 8, ms: 280, atk: 1300, poison: true, xp: 170, gold: [60, 110], specials: ['slam', 'summon', 'volley'], summons: 'escorpion', sets: ['picaro', 'guerrero', 'paladin'] },
    'gigante-escarcha': { name: 'El Gigante de Escarcha', fam: 'orco', sprite: 'ogre', tint: '#9ac0e8', scale: 1.8, boss: true, hp: 420, dmg: [8, 13], armor: 8, ms: 420, atk: 1800, xp: 210, gold: [80, 130], specials: ['slam', 'nova', 'charge'], sets: ['guerrero', 'paladin', 'clerigo'] },
    // Jefes de mazmorra: botín de conjuntos de varias clases
    'rey-goblin':      { name: 'Grubnak, el Rey Goblin', fam: 'goblin', sprite: 'shaman', scale: 1.55, tint: '#c8a030', boss: true, hp: 240, dmg: [4, 8], armor: 5, ms: 340, atk: 1400, xp: 90, gold: [40, 70], specials: ['slam', 'summon'], summons: 'goblin-warrior', sets: ['explorador', 'picaro', 'guerrero'] },
    'gorthak':         { name: 'Gorthak, Señor de la Guerra', fam: 'orco', sprite: 'warchief', scale: 1.45, boss: true, hp: 320, dmg: [6, 11], armor: 7, ms: 330, atk: 1500, xp: 120, gold: [50, 90], specials: ['slam', 'charge', 'summon'], summons: 'orc', sets: ['guerrero', 'paladin', 'clerigo'] },
    'lich':            { name: 'Malakar, el Liche', fam: 'muerto', sprite: 'lich', scale: 1.4, boss: true, hp: 260, dmg: [5, 9], armor: 4, ms: 380, atk: 1900, range: 6, proj: 'necro', magic: true, xp: 120, gold: [50, 90], undead: true, specials: ['nova', 'volley', 'summon'], summons: 'skeleton', sets: ['mago', 'brujo', 'clerigo'] },
    'reina-arana':     { name: 'Arakhna, la Reina Araña', fam: 'bestia', sprite: 'spider', scale: 2, tint: '#5a2a6a', boss: true, hp: 280, dmg: [5, 10], armor: 5, ms: 280, atk: 1300, poison: true, xp: 110, gold: [45, 80], specials: ['volley', 'summon', 'slam'], summons: 'giant-spider', sets: ['picaro', 'explorador', 'brujo'] },
    // jefes de mundo (aparecen en el mundo abierto cada cierto tiempo; mucha vida, para pelear en grupo)
    'coloso-runas':    { name: 'El Coloso de las Runas', fam: 'orco', sprite: 'ogre', tint: '#7a8aa8', scale: 2.3, boss: true, world: true, hp: 900, dmg: [7, 12], armor: 10, ms: 430, atk: 1800, xp: 500, gold: [150, 260], specials: ['slam', 'nova', 'charge'], sets: CLASS_IDS },
    'nyxara':          { name: 'Nyxara, Dragona de las Sombras', fam: 'dragon', sprite: 'dragon', tint: '#3a2a7a', scale: 1.7, boss: true, world: true, hp: 820, dmg: [7, 12], armor: 8, ms: 360, atk: 1600, xp: 520, gold: [160, 280], specials: ['breath', 'nova', 'summon'], summons: 'specter', sets: CLASS_IDS },
    'rey-espectral':   { name: 'El Rey Espectral', fam: 'muerto', sprite: 'lich', tint: '#2a6aff', scale: 2, boss: true, world: true, hp: 760, dmg: [6, 11], armor: 6, ms: 380, atk: 1800, range: 6, proj: 'necro', magic: true, undead: true, xp: 500, gold: [150, 260], specials: ['nova', 'volley', 'summon'], summons: 'wight', sets: CLASS_IDS },
    'behemot':         { name: 'Behemot del Bosque Viejo', fam: 'bestia', sprite: 'bear', tint: '#2e4a1e', scale: 2.4, boss: true, world: true, hp: 950, dmg: [7, 13], armor: 9, ms: 300, atk: 1500, xp: 520, gold: [150, 260], specials: ['slam', 'charge', 'summon'], summons: 'dire-wolf', sets: CLASS_IDS },
    'young-red-dragon': { name: 'Ignaroth, el Dragón Rojo', fam: 'dragon', sprite: 'dragon', scale: 1.3, boss: true, hp: 400, dmg: [7, 12], armor: 8, ms: 360, atk: 1600, xp: 160, gold: [80, 140], specials: ['breath', 'slam', 'summon'], summons: 'kobold', sets: CLASS_IDS },
  };
  // Claves de versiones anteriores
  const LEGACY_MONSTER = { 'goblin-boss': 'goblin-shaman', goblin: 'goblin-warrior', shaman: 'goblin-shaman', warchief: 'orc-war-chief', ghast: 'ghoul', 'ogre-zombie': 'zombie', wraith: 'specter', 'hobgoblin-captain': 'hobgoblin-warrior' };

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
      summons: M.summons || null, specials: M.specials || [], sets: M.sets || [],
    };
  }

  // Temas de las mazmorras aleatorias
  const THEMES = {
    cuevas:    { name: 'Cuevas goblin', icon: '🪓', mobs: ['goblin-warrior', 'goblin-warrior', 'goblin-minion', 'goblin-archer', 'goblin-archer', 'goblin-shaman', 'hobgoblin-warrior', 'bugbear-warrior', 'wolf'], boss: 'rey-goblin', names: ['Madriguera', 'Cuevas', 'Túneles', 'Guarida'], of: ['de los Dientes Rotos', 'del Rey Goblin', 'de la Oreja Cortada', 'del Hongo Negro'] },
    cripta:    { name: 'Cripta de los no muertos', icon: '💀', mobs: ['skeleton', 'skeleton', 'skeleton-archer', 'zombie', 'zombie', 'ghoul', 'specter', 'wight', 'mummy', 'necromancer'], boss: 'lich', names: ['Cripta', 'Catacumbas', 'Osario', 'Mausoleo'], of: ['del Liche', 'de los Olvidados', 'de la Plaga', 'del Último Rezo'] },
    fortaleza: { name: 'Fortaleza orca', icon: '🏰', mobs: ['orc', 'orc', 'orc-archer', 'orc-shaman', 'hobgoblin-warrior', 'ogre', 'troll'], boss: 'gorthak', names: ['Fortaleza', 'Bastión', 'Fuerte', 'Ciudadela'], of: ['de la Mano Roja', 'de Gorthak', 'del Cráneo Partido', 'de Hierro Negro'] },
    nido:      { name: 'Nido de bestias', icon: '🕷️', mobs: ['giant-spider', 'giant-spider', 'wolf', 'wolf', 'dire-wolf', 'brown-bear', 'owlbear'], boss: 'reina-arana', names: ['Nido', 'Cubil', 'Madriguera', 'Bosque Hueco'], of: ['de la Reina Araña', 'de las Mil Patas', 'de la Seda Negra'] },
    volcan:    { name: 'Guarida del dragón', icon: '🐉', mobs: ['kobold', 'kobold', 'cultist', 'cultist', 'bandit', 'bandit-archer', 'ogre'], boss: 'young-red-dragon', names: ['Guarida', 'Forja', 'Caldera', 'Templo'], of: ['de Ignaroth', 'de Ceniza', 'de la Llama Eterna'] },
  };

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
    'gallinas': { npc: 'jacinta', name: 'Ladrones de gallinas', zone: 0, goal: { kind: 'kill', mobs: ['goblin-warrior', 'goblin-minion', 'goblin-archer', 'goblin-shaman'], n: 6 }, xp: 120, gold: 40, item: 'raro', text: 'Los goblins bajan cada noche a robarme las gallinas. Si me traes paz, te pagaré bien.' },
    'rufo': { npc: 'jacinta', after: 'gallinas', name: 'El jefe Rufo', zone: 0, goal: { kind: 'boss', mob: 'rufo' }, xp: 260, gold: 80, item: 'epico', text: 'Detrás de los goblins está Rufo, un bandido que les paga con cerveza robada. Su campamento está al norte del valle.' },
    'carta-lenador': { npc: 'alcalde', name: 'Carta para el bosque', zone: 0, goal: { kind: 'talk', npc: 'ewan' }, xp: 150, gold: 30, text: 'Algo pudre el bosque desde hace semanas. Lleva esta carta a Ewan, el leñador del campamento del bosque.' },
    'aranas': { npc: 'ewan', name: 'Telarañas por todas partes', zone: 1, minLevel: 3, goal: { kind: 'kill', mobs: ['giant-spider'], n: 8 }, xp: 380, gold: 90, item: 'raro', text: 'Las arañas han tejido nidos donde antes cortábamos leña. Algo las empuja hacia aquí desde el sur.' },
    'alfa': { npc: 'bran', name: 'El Huargo Alfa', zone: 1, minLevel: 4, goal: { kind: 'boss', mob: 'huargo-alfa' }, xp: 600, gold: 150, item: 'epico', text: 'Un huargo enorme guía a las manadas. Tiene los ojos rojos, como si algo lo poseyera. Acaba con él.' },
    'carta-cienaga': { npc: 'ewan', after: 'aranas', name: 'El rastro de la podredumbre', zone: 1, goal: { kind: 'talk', npc: 'morwen' }, xp: 420, gold: 60, text: 'La podredumbre viene de la Ciénaga de Hollow. La abuela Morwen, en la Aldea de Juncos, sabrá qué ocurre.' },
    'ahogados': { npc: 'morwen', name: 'Los que no descansan', zone: 2, minLevel: 6, goal: { kind: 'kill', mobs: ['ahogado', 'zombie', 'ghoul'], n: 10 }, xp: 900, gold: 180, item: 'raro', text: 'Los ahogados salen del agua por las noches. La ciénaga los despierta... o alguien los despierta.' },
    'bruja': { npc: 'morwen', after: 'ahogados', name: 'La Bruja del Pantano', zone: 2, minLevel: 8, goal: { kind: 'boss', mob: 'bruja-pantano' }, xp: 1500, gold: 300, item: 'epico', text: 'Mi hermana Zarza se fue a la taberna; la otra, Ortiga, se quedó y vendió su alma al fuego del sur. Detenla.' },
    'carta-yermo': { npc: 'morwen', after: 'bruja', name: 'Hacia las Tierras Yermas', zone: 2, goal: { kind: 'talk', npc: 'rhys' }, xp: 1000, gold: 120, text: 'Ortiga hablaba de un dragón que despierta en el Erial de Ceniza. Avisa al capitán Rhys, en el Fuerte del Desierto.' },
    'escorpiones': { npc: 'rhys', name: 'Aguijones en la arena', zone: 3, minLevel: 10, goal: { kind: 'kill', mobs: ['escorpion', 'bandido-desierto'], n: 10 }, xp: 2000, gold: 350, item: 'raro', text: 'Los escorpiones y los saqueadores cortan las rutas de suministro. Necesito el camino despejado.' },
    'rey-escorpion': { npc: 'rhys', after: 'escorpiones', name: 'El Rey Escorpión', zone: 3, minLevel: 12, goal: { kind: 'boss', mob: 'rey-escorpion' }, xp: 3200, gold: 600, item: 'epico', text: 'Su rey duerme bajo las dunas. Cuando él caiga, los demás huirán.' },
    'carta-picos': { npc: 'rhys', after: 'rey-escorpion', name: 'El paso de montaña', zone: 3, goal: { kind: 'talk', npc: 'tor' }, xp: 2200, gold: 200, text: 'Para llegar al Erial hay que cruzar los Picos Helados. El ermitaño Tor conoce el paso.' },
    'yetis': { npc: 'tor', name: 'Bestias de la ventisca', zone: 4, minLevel: 14, goal: { kind: 'kill', mobs: ['yeti', 'lobo-escarcha', 'troll-hielo'], n: 10 }, xp: 4200, gold: 600, item: 'raro', text: 'La ventisca ha enloquecido a las bestias. Si quieres pasar, tendrás que abrirte camino.' },
    'gigante': { npc: 'tor', after: 'yetis', name: 'El Gigante de Escarcha', zone: 4, minLevel: 16, goal: { kind: 'boss', mob: 'gigante-escarcha' }, xp: 6500, gold: 1000, item: 'epico', text: 'Un gigante guarda el paso. Dicen que el dragón le prometió el valle entero.' },
    'carta-ceniza': { npc: 'tor', after: 'gigante', name: 'La Última Vigía', zone: 4, goal: { kind: 'talk', npc: 'selene' }, xp: 4500, gold: 400, text: 'Al otro lado está la Última Vigía. Selene lleva años esperando a alguien capaz de acabar con Ignaroth.' },
    'demonios': { npc: 'selene', name: 'Hijos de la llama', zone: 5, minLevel: 19, goal: { kind: 'kill', mobs: ['demonio', 'elemental-fuego', 'cultist'], n: 12 }, xp: 9000, gold: 1200, item: 'epico', text: 'El dragón alimenta a demonios y sectarios. Diezma sus filas antes del asalto final.' },
    'ignaroth': { npc: 'selene', after: 'demonios', name: 'Ignaroth', zone: 5, minLevel: 22, goal: { kind: 'boss', mob: 'young-red-dragon' }, xp: 16000, gold: 3000, item: 'legendario', text: 'Es la hora. Sube a su guarida y acaba con la plaga de ceniza para siempre.' },
  };

  // ======================================================================
  //  Utilidades de combate (las usa el servidor)
  // ======================================================================
  const reduction = (armor, attackerLevel) => Math.min(0.75, armor / (armor + 30 + 10 * attackerLevel));
  // Experiencia por debajo de tu nivel: se reduce si el monstruo es mucho más débil
  const xpPenalty = (playerLevel, monsterLevel) => (monsterLevel >= playerLevel - 3 ? 1 : Math.max(0.2, 1 - 0.15 * (playerLevel - 3 - monsterLevel)));

  const RULES = {
    MAX_LEVEL, BAG_SIZE, POINTS_START, POINTS_PER_LEVEL, STATS, STAT_IDS, EXTRA, CLASSES, CLASS_IDS, LEGACY_CLASS, ARMOR_TYPES,
    ABILITIES, ABILITY_BY_ID, XP_TABLE, SLOTS, SLOT_IDS, WEAPONS, FISTS, OFFHANDS, ARMOR_NAMES, JEWELS,
    RARITIES, RARITY_ORDER, AFFIXES, SLOT_AFFIXES, SETS, CONSUMABLES, BUFFS, SHOPS, MONSTERS, LEGACY_MONSTER, THEMES,
    statName, fmtStat, classId, levelFromXp, pointsTotal, pointsSpent, pointsFree, baseStats, newChar, cleanChar,
    rollRarity, makeItem, itemValue, rollLoot, starterItems, canEquip, typeLine, describe, allowedBases,
    PETS, PET_LEVEL, MOUNT_LEVEL, MOUNTS, petStats, PET_MAX, petXpFor, petLevelFromXp, petEvo, petTitle, PET_SKILLS, PET_SKILL_LEVEL, petBagWeight, ZONES, QUESTS, itemWeight, classesFor,
    priceScale, buyPrice, itemBuyPrice, armeroStock, seeded, gearTotals, derive, abilitiesFor, gearLook, monsterAt, reduction, xpPenalty,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = RULES;
  else root.RULES = RULES;
})(this);
