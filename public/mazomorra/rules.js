// Mazo Morra: juego de cartas y dados de un jugador inspirado en One Deck Dungeon.
// Reglas puras (sin pantalla): el mazo es el reloj, cada carta es un monstruo o un peligro, y al vencerla
// eliges quedártela como objeto (más dados), habilidad o experiencia. Tres plantas y un jefe.
// Se usa en el navegador (window.MZR) y en las pruebas (require).
(function (root) {
  'use strict';

  // Colores de los dados: F fuerza (amarillo), A agilidad (rosa), M magia (azul), H heroico (comodín)
  const COLORS = {
    F: { name: 'Fuerza', short: 'FUE' },
    A: { name: 'Agilidad', short: 'AGI' },
    M: { name: 'Magia', short: 'MAG' },
    H: { name: 'Heroico', short: 'HER' },
    X: { name: 'Cualquiera', short: 'CUA' },
  };

  const HEROES = {
    guerrera: { name: 'Brunilda', title: 'Guerrera', sprite: 'guerrera', hp: 8, dice: { F: 3, A: 2, M: 1 }, skill: 'furia', text: 'Mucha fuerza y mucha vida. Su furia le cuesta sangre.' },
    picara: { name: 'Sombra', title: 'Pícara', sprite: 'picara', hp: 7, dice: { F: 1, A: 3, M: 1 }, skill: 'sigilo', text: 'Huye sin perder tiempo y esquiva casi todo.' },
    maga: { name: 'Ofelia', title: 'Maga', sprite: 'maga', hp: 7, dice: { F: 1, A: 1, M: 3 }, skill: 'arcano', text: 'Poca vida, pero sus chispas arreglan cualquier tirada.' },
    paladin: { name: 'Teodoro', title: 'Paladín', sprite: 'paladin', hp: 7, dice: { F: 2, A: 1, M: 2 }, skill: 'curar', text: 'Equilibrado. Reza para curarse una vez por planta.' },
  };

  // Habilidades. `when`: 'combat' (en un combate o peligro, una vez por encuentro), 'floor' (una vez por planta,
  // también fuera de combate) o 'passive' (siempre). `need`: dados que hay que tener seleccionados.
  const SKILLS = {
    golpe: { name: 'Golpe brutal', when: 'combat', need: 1, text: 'Un dado de Fuerza pasa a valer 6.' },
    finta: { name: 'Finta', when: 'combat', need: 0, text: 'Vuelve a tirar todos tus dados de Agilidad libres.' },
    arcano: { name: 'Chispa arcana', when: 'combat', need: 1, text: '+2 a un dado de Magia (máx. 6).' },
    escudo: { name: 'Escudo', when: 'combat', need: 0, text: 'Este encuentro, la casilla sin llenar que más daño haga no te hace nada.' },
    reloj: { name: 'Paso rápido', when: 'combat', need: 0, text: 'Este encuentro, las casillas de tiempo no te cuestan nada.' },
    cambio: { name: 'Transmutar', when: 'combat', need: 1, text: 'Un dado se vuelve heroico (vale en cualquier casilla).' },
    curar: { name: 'Plegaria', when: 'floor', need: 0, text: 'Cura 2 de vida. Una vez por planta.' },
    suerte: { name: 'Suerte', when: 'combat', need: -1, text: 'Vuelve a tirar los dados libres que elijas.' },
    furia: { name: 'Furia', when: 'combat', need: 0, text: 'Pierdes 1 de vida y ganas un dado heroico de 5.' },
    sigilo: { name: 'Sigilo', when: 'passive', text: 'Huir no te cuesta tiempo.' },
    manos: { name: 'Manos finas', when: 'passive', text: '+3 en las pruebas de los peligros.' },
    doble: { name: 'Golpe doble', when: 'combat', need: 1, text: 'Un dado de 3 o menos dobla su valor.' },
    piel: { name: 'Piel dura', when: 'passive', text: 'En cada encuentro (y cada ronda del jefe) recibes 1 de daño menos.' },
  };

  // Habilidades de los monstruos
  const ABILITIES = {
    unos: 'Huesos: los dados de 1 no se pueden colocar.',
    volador: 'Volador: tus dados de Fuerza valen 1 menos.',
    etereo: 'Etéreo: los dados de Fuerza no sirven.',
    piedra: 'Piedra: tus dados de Magia valen 1 menos.',
    veneno: 'Veneno: si te hace daño, 1 más.',
    rapido: 'Rápido: huir cuesta 1 tiempo más.',
  };

  // Casillas: c color (F, A, M o X cualquiera), v valor mínimo, n dados (2 = la suma de dos), hp daño o t tiempo si no se llena.
  const b = (c, v, pen, n = 1) => Object.assign({ c, v, n }, pen);
  const CARDS = {
    rata: { kind: 'monster', name: 'Rata gigante', sprite: 'rata', xp: 1, boxes: [b('A', 3, { hp: 1 }), b('F', 3, { hp: 1 })],
      item: { name: 'Botas de cuero', A: 1 }, skill: 'finta' },
    murcielago: { kind: 'monster', name: 'Murciélago', sprite: 'murcielago', xp: 1, ab: 'volador', boxes: [b('A', 4, { t: 1 }), b('A', 3, { hp: 1 })],
      item: { name: 'Capa de ala', A: 1 }, skill: 'reloj' },
    limo: { kind: 'monster', name: 'Limo verde', sprite: 'limo', xp: 1, boxes: [b('F', 4, { hp: 1 }), b('M', 3, { hp: 1 })],
      item: { name: 'Frasco de limo', hp: 2 }, skill: 'escudo' },
    goblin: { kind: 'monster', name: 'Goblin', sprite: 'goblin', xp: 2, boxes: [b('F', 4, { hp: 1 }), b('A', 5, { hp: 1 }), b('X', 7, { t: 1 }, 2)],
      item: { name: 'Garrote', F: 1 }, skill: 'golpe' },
    esqueleto: { kind: 'monster', name: 'Esqueleto', sprite: 'esqueleto', xp: 2, ab: 'unos', boxes: [b('F', 5, { hp: 2 }), b('M', 4, { hp: 1 })],
      item: { name: 'Espada vieja', F: 1 }, skill: 'doble' },
    arana: { kind: 'monster', name: 'Araña', sprite: 'arana', xp: 2, ab: 'veneno', boxes: [b('A', 5, { hp: 1 }), b('A', 8, { hp: 1 }, 2), b('M', 4, { t: 1 })],
      item: { name: 'Guantes de seda', A: 1 }, skill: 'sigilo' },
    kobold: { kind: 'monster', name: 'Kobold chamán', sprite: 'kobold', xp: 2, boxes: [b('M', 5, { hp: 2 }), b('A', 4, { hp: 1 })],
      item: { name: 'Amuleto de hueso', M: 1 }, skill: 'arcano' },
    orco: { kind: 'monster', name: 'Orco', sprite: 'orco', xp: 3, boxes: [b('F', 9, { hp: 2 }, 2), b('F', 5, { hp: 1 }), b('A', 4, { hp: 1 })],
      item: { name: 'Hacha de orco', F: 1 }, skill: 'furia' },
    fantasma: { kind: 'monster', name: 'Fantasma', sprite: 'fantasma', xp: 3, ab: 'etereo', boxes: [b('M', 5, { hp: 2 }), b('M', 8, { hp: 1 }, 2), b('X', 4, { t: 1 })],
      item: { name: 'Velo espectral', M: 1 }, skill: 'cambio' },
    golem: { kind: 'monster', name: 'Gólem', sprite: 'golem', xp: 3, boxes: [b('F', 10, { hp: 2 }, 2), b('M', 5, { hp: 1 }), b('F', 5, { hp: 1 })],
      item: { name: 'Corazón de piedra', hp: 3 }, skill: 'piel' },
    lobo: { kind: 'monster', name: 'Hombre lobo', sprite: 'lobo', xp: 3, ab: 'rapido', boxes: [b('A', 9, { hp: 2 }, 2), b('F', 5, { hp: 1 }), b('A', 5, { hp: 1 })],
      item: { name: 'Colmillo', A: 1 }, skill: 'suerte' },
    cultista: { kind: 'monster', name: 'Cultista', sprite: 'cultista', xp: 2, boxes: [b('M', 4, { hp: 1 }), b('X', 8, { hp: 1 }, 2), b('A', 3, { t: 1 })],
      item: { name: 'Libro prohibido', M: 1 }, skill: 'curar' },
    mimico: { kind: 'monster', name: 'Mímico', sprite: 'mimico', xp: 3, boxes: [b('F', 5, { hp: 2 }), b('A', 5, { hp: 1 }), b('M', 5, { hp: 1 })],
      item: { name: 'Bolsa sin fondo', hp: 2 }, skill: 'suerte' },
    gargola: { kind: 'monster', name: 'Gárgola', sprite: 'gargola', xp: 3, ab: 'piedra', boxes: [b('F', 6, { hp: 1 }), b('M', 8, { hp: 2 }, 2), b('X', 4, { t: 1 })],
      item: { name: 'Escudo de roca', F: 1 }, skill: 'escudo' },
    // Peligros: eliges una de dos pruebas; tiras los dados de ese color (y los heroicos) y sumas.
    pinchos: { kind: 'peril', name: 'Foso de pinchos', sprite: 'pinchos', xp: 1, opts: [{ c: 'A', v: 7, hp: 2 }, { c: 'F', v: 9, t: 2 }],
      item: { name: 'Pértiga', A: 1 }, skill: 'manos' },
    runa: { kind: 'peril', name: 'Runa explosiva', sprite: 'runa', xp: 1, opts: [{ c: 'M', v: 7, hp: 2 }, { c: 'A', v: 9, hp: 1, t: 1 }],
      item: { name: 'Tiza rúnica', M: 1 }, skill: 'cambio' },
    puerta: { kind: 'peril', name: 'Puerta atrancada', sprite: 'puerta', xp: 1, opts: [{ c: 'F', v: 8, t: 3 }, { c: 'M', v: 9, hp: 1 }],
      item: { name: 'Palanca', F: 1 }, skill: 'golpe' },
    gas: { kind: 'peril', name: 'Trampa de gas', sprite: 'gas', xp: 1, opts: [{ c: 'A', v: 8, hp: 2 }, { c: 'M', v: 7, hp: 1, t: 1 }],
      item: { name: 'Pañuelo húmedo', hp: 2 }, skill: 'reloj' },
    abismo: { kind: 'peril', name: 'Puente roto', sprite: 'abismo', xp: 2, opts: [{ c: 'A', v: 10, hp: 2 }, { c: 'F', v: 10, t: 2 }],
      item: { name: 'Cuerda', A: 1 }, skill: 'manos' },
    espejo: { kind: 'peril', name: 'Espejo maldito', sprite: 'espejo', xp: 2, opts: [{ c: 'M', v: 10, hp: 2 }, { c: 'F', v: 11, hp: 1 }],
      item: { name: 'Esquirla de espejo', M: 1 }, skill: 'piel' },
  };
  const DECK = ['rata', 'rata', 'murcielago', 'murcielago', 'limo', 'limo', 'goblin', 'goblin', 'esqueleto', 'arana', 'kobold', 'orco',
    'fantasma', 'golem', 'lobo', 'cultista', 'mimico', 'gargola', 'pinchos', 'runa', 'puerta', 'gas', 'abismo', 'espejo'];

  // Mazmorras: cada una con su regla de planta (desde la planta 2) y su jefe.
  // Los jefes tienen casillas de defensa (dañan si no las llenas) y de ataque (atk: daño al jefe si las llenas).
  const DUNGEONS = {
    cripta: { name: 'Cripta del Rey Liche', rule: 'unos', ruleText: 'Desde la planta 2, los dados de 1 no se pueden colocar.',
      boss: { name: 'Rey Liche', sprite: 'liche', hp: 8, boxes: [b('M', 5, { hp: 2 }), b('F', 8, { hp: 1 }, 2), b('A', 4, { hp: 1 }), b('X', 5, { atk: 2 }), b('X', 8, { atk: 1 }, 2), b('X', 4, { atk: 1 })] } },
    guarida: { name: 'Guarida de la Dragona', rule: 'calor', ruleText: 'Desde la planta 2, bajar las escaleras quema: −1 de vida.',
      boss: { name: 'Dragona roja', sprite: 'dragona', hp: 8, boxes: [b('A', 6, { hp: 2 }), b('M', 9, { hp: 2 }, 2), b('F', 5, { hp: 1 }), b('X', 5, { atk: 2 }), b('X', 9, { atk: 2 }, 2)] } },
    laberinto: { name: 'Laberinto del Minotauro', rule: 'dobles', ruleText: 'Desde la planta 2, las casillas de dos dados piden 1 más.',
      boss: { name: 'Minotauro', sprite: 'minotauro', hp: 9, boxes: [b('F', 6, { hp: 2 }), b('F', 9, { hp: 1 }, 2), b('A', 5, { hp: 1 }), b('X', 6, { atk: 2 }), b('X', 4, { atk: 1 }), b('X', 7, { atk: 1 }, 2)] } },
  };

  const XP_LEVEL = [0, 4, 9, 15]; // experiencia para el nivel 1, 2, 3 y 4
  const MAX_DOORS = 4;
  const FLOORS = 3;

  // ---------- Utilidades ----------
  function rng(seed) { // mulberry32: partidas repetibles en las pruebas
    let a = seed >>> 0;
    return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const d6 = (G) => 1 + Math.floor(G.rand() * 6);
  function shuffle(G, arr) {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(G.rand() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  }
  const log = (G, text, kind) => { G.log.push({ text, kind: kind || '' }); if (G.log.length > 60) G.log.shift(); };
  const has = (G, sk) => G.hero.skills.includes(sk) || HEROES[G.hero.id].skill === sk;

  // ---------- Héroe ----------
  function stats(G) {
    const h = G.hero, base = HEROES[h.id], dice = Object.assign({}, base.dice);
    let hp = base.hp + (h.lvl - 1);
    for (const id of h.items) { const it = CARDS[id].item; for (const c of ['F', 'A', 'M']) dice[c] += it[c] || 0; hp += it.hp || 0; }
    return { dice, maxHp: hp, slots: h.lvl + 1 };
  }
  function heal(G, n) { const max = stats(G).maxHp; G.hero.hp = Math.min(max, G.hero.hp + n); }
  function hurt(G, n, why) {
    if (n <= 0) return;
    G.hero.hp -= n;
    log(G, `−${n} de vida${why ? ' (' + why + ')' : ''}.`, 'bad');
    if (G.hero.hp <= 0 && !G.over) { G.hero.hp = 0; G.over = 'lose'; G.enc = null; G.reward = null; log(G, 'Has caído en la mazmorra…', 'bad'); }
  }
  // Pasa el tiempo: se descartan cartas del mazo. Si ya no quedan, cada tiempo cuesta 1 de vida.
  function passTime(G, n, why) {
    let lost = 0;
    for (let i = 0; i < n; i++) { if (G.deck.length) G.discard.push(G.deck.pop()); else lost++; }
    if (n - lost > 0) log(G, `Pasa el tiempo: ${n - lost} carta${n - lost > 1 ? 's' : ''} del mazo${why ? ' (' + why + ')' : ''}.`);
    if (lost) hurt(G, lost, 'no queda tiempo');
  }
  function gainXp(G, n) {
    const h = G.hero;
    h.xp += n;
    log(G, `+${n} de experiencia.`, 'good');
    while (h.lvl < XP_LEVEL.length && h.xp >= XP_LEVEL[h.lvl]) {
      h.lvl++;
      heal(G, 3);
      log(G, `¡Subes a nivel ${h.lvl}! +1 de vida máxima, te curas 3 y tienes un hueco más de objeto y de habilidad.`, 'great');
      G.events.push('levelup');
    }
  }

  // ---------- Partida ----------
  function newGame(heroId, dungeonId, seed) {
    const G = {
      seed: seed == null ? (Math.random() * 2 ** 32) >>> 0 : seed, rand: null,
      hero: { id: heroId, hp: 0, lvl: 1, xp: 0, items: [], skills: [] },
      dungeon: dungeonId, floor: 1, deck: [], discard: [], doors: [],
      enc: null, reward: null, over: null, log: [], events: [], floorUsed: {}, nextDie: 1, won: 0,
    };
    G.rand = rng(G.seed);
    G.hero.hp = stats(G).maxHp;
    G.deck = shuffle(G, DECK.slice());
    log(G, `${HEROES[heroId].name} entra en ${DUNGEONS[dungeonId].name}.`, 'great');
    return G;
  }
  const floorRule = (G, r) => G.floor >= 2 && DUNGEONS[G.dungeon].rule === r;

  function canExplore(G) { return !G.over && !G.enc && !G.reward && G.doors.length < MAX_DOORS && G.deck.length > 0; }
  // Explorar: pasan 2 de tiempo y aparece una puerta nueva (boca abajo) con la carta de arriba del mazo.
  function explore(G) {
    if (!canExplore(G)) return false;
    passTime(G, 2, 'explorar');
    if (G.over) return true;
    if (G.deck.length) { G.doors.push({ id: G.deck.pop(), open: false }); log(G, 'Encuentras una puerta.'); }
    else log(G, 'No queda mazo: no hay más puertas en esta planta.');
    return true;
  }
  function canDescend(G) { return !G.over && !G.enc && !G.reward && G.deck.length === 0; }
  // Bajar: las cartas descartadas y las puertas que quedan forman el mazo de la planta siguiente. Tras la tercera, el jefe.
  function descend(G) {
    if (!canDescend(G)) return false;
    if (G.floor >= FLOORS) { startBoss(G); return true; }
    G.floor++;
    G.deck = shuffle(G, G.discard.concat(G.doors.map((d) => d.id)));
    G.discard = []; G.doors = []; G.floorUsed = {};
    log(G, `Bajas a la planta ${G.floor}. Los monstruos son más duros (+${G.floor - 1}). Descansas en la escalera: +2 de vida.`, 'great');
    heal(G, 2);
    if (floorRule(G, 'calor')) hurt(G, 1, 'calor de la guarida');
    G.events.push('descend');
    return true;
  }

  // ---------- Encuentros ----------
  function openDoor(G, i) {
    const d = G.doors[i];
    if (!d || G.over || G.enc || G.reward) return false;
    if (!d.open) { d.open = true; log(G, `Abres la puerta: ${CARDS[d.id].name}.`); }
    const card = CARDS[d.id];
    G.enc = { door: i, id: d.id, kind: card.kind, dice: [], boxes: [], used: {}, armed: {}, rolled: false, opt: -1 };
    if (card.kind === 'monster') G.enc.boxes = card.boxes.map((bx) => Object.assign({}, bx, { v: target(G, bx, 'monster'), dice: [] }));
    return true;
  }
  function target(G, bx, kind) {
    let v = bx.v;
    if (kind === 'monster') v += G.floor - 1;
    if (bx.n === 2 && kind !== 'boss' && floorRule(G, 'dobles')) v += 1;
    return v;
  }
  function fleeCost(G) {
    if (!G.enc || G.enc.kind === 'boss') return 0;
    let t = has(G, 'sigilo') ? 0 : 1;
    if (CARDS[G.enc.id].ab === 'rapido') t++;
    return t;
  }
  // Huir antes de tirar: la puerta queda abierta para volver más tarde.
  function flee(G) {
    if (!G.enc || G.enc.kind === 'boss' || G.enc.rolled) return false;
    const t = fleeCost(G);
    G.enc = null;
    log(G, 'Te retiras de la puerta.');
    if (t) passTime(G, t, 'huir');
    return true;
  }
  function abOf(G) {
    const out = new Set();
    if (G.enc && G.enc.kind === 'monster' && CARDS[G.enc.id].ab) out.add(CARDS[G.enc.id].ab);
    if (floorRule(G, 'unos')) out.add('unos');
    return out;
  }
  function newDie(G, c, v) {
    const ab = abOf(G);
    if (v == null) v = d6(G);
    if (c === 'F' && ab.has('volador')) v = Math.max(1, v - 1);
    if (c === 'M' && ab.has('piedra')) v = Math.max(1, v - 1);
    return { id: G.nextDie++, c, v };
  }
  // Tirar: todos tus dados (en un peligro, sólo los del color elegido y los heroicos).
  function roll(G, opt) {
    const E = G.enc;
    if (!E || E.rolled) return false;
    const dice = stats(G).dice;
    let colors = ['F', 'A', 'M'];
    if (E.kind === 'peril') {
      const o = CARDS[E.id].opts[opt];
      if (!o) return false;
      E.opt = opt; colors = [o.c];
    }
    for (const c of colors) for (let i = 0; i < dice[c]; i++) E.dice.push(newDie(G, c));
    E.rolled = true;
    G.events.push('roll');
    return true;
  }
  const free = (E) => E.dice.filter((d) => !E.boxes.some((bx) => bx.dice.includes(d.id)));
  const dieById = (E, id) => E.dice.find((d) => d.id === id);
  function canPlace(G, dieId, boxI) {
    const E = G.enc, d = E && dieById(E, dieId), bx = E && E.boxes[boxI];
    if (!d || !bx || bx.dice.length >= bx.n || bx.dice.includes(dieId)) return false;
    if (E.boxes.some((x) => x.dice.includes(dieId))) return false;
    const ab = abOf(G);
    if (ab.has('unos') && d.v === 1) return false;
    if (ab.has('etereo') && d.c === 'F') return false;
    return d.c === 'H' || bx.c === 'X' || d.c === bx.c;
  }
  function place(G, dieId, boxI) {
    if (!canPlace(G, dieId, boxI)) return false;
    G.enc.boxes[boxI].dice.push(dieId);
    return true;
  }
  function unplace(G, dieId) {
    const E = G.enc;
    if (!E) return false;
    for (const bx of E.boxes) { const i = bx.dice.indexOf(dieId); if (i >= 0) { bx.dice.splice(i, 1); return true; } }
    return false;
  }
  const boxSum = (E, bx) => bx.dice.reduce((s, id) => s + dieById(E, id).v, 0);
  const boxDone = (E, bx) => bx.dice.length === bx.n && boxSum(E, bx) >= bx.v;
  // Fusionar: dos dados libres del mismo color se cambian por un dado heroico con el valor del mayor.
  function canMerge(G, ids) {
    const E = G.enc;
    if (!E || ids.length !== 2) return false;
    const [a, c] = ids.map((id) => free(E).find((d) => d.id === id));
    return !!(a && c && a.c === c.c && a.c !== 'H');
  }
  function merge(G, ids) {
    if (!canMerge(G, ids)) return false;
    const E = G.enc, [a, c] = ids.map((id) => dieById(E, id));
    E.dice = E.dice.filter((d) => d !== a && d !== c);
    E.dice.push({ id: G.nextDie++, c: 'H', v: Math.max(a.v, c.v) });
    return true;
  }

  // Habilidades
  function canUseSkill(G, sk, sel) {
    const S = SKILLS[sk], E = G.enc;
    if (!S || !has(G, sk) || G.over) return false;
    if (S.when === 'passive') return false;
    if (S.when === 'floor') return !G.floorUsed[sk] && G.hero.hp < stats(G).maxHp && !G.reward;
    if (!E || !E.rolled || E.used[sk]) return false;
    const dice = (sel || []).map((id) => free(E).find((d) => d.id === id)).filter(Boolean);
    if (S.need === 1 && dice.length !== 1) return false;
    if (S.need === -1 && !dice.length) return false;
    const d = dice[0];
    if (sk === 'golpe') return d.c === 'F' && d.v < 6;
    if (sk === 'arcano') return d.c === 'M' && d.v < 6;
    if (sk === 'cambio') return d.c !== 'H';
    if (sk === 'doble') return d.v <= 3;
    if (sk === 'finta') return free(E).some((x) => x.c === 'A');
    if (sk === 'furia') return G.hero.hp > 1;
    return true;
  }
  function useSkill(G, sk, sel) {
    if (!canUseSkill(G, sk, sel)) return false;
    const S = SKILLS[sk], E = G.enc;
    if (S.when === 'floor') { G.floorUsed[sk] = true; heal(G, 2); log(G, `${S.name}: te curas 2.`, 'good'); G.events.push('heal'); return true; }
    E.used[sk] = true;
    const d = sel && sel.length ? dieById(E, sel[0]) : null;
    if (sk === 'golpe') d.v = 6;
    else if (sk === 'arcano') d.v = Math.min(6, d.v + 2);
    else if (sk === 'cambio') d.c = 'H';
    else if (sk === 'doble') d.v = Math.min(6, d.v * 2);
    else if (sk === 'finta') for (const x of free(E)) { if (x.c === 'A') Object.assign(x, { v: newDie(G, 'A').v }); }
    else if (sk === 'suerte') for (const id of sel) { const x = dieById(E, id); x.v = newDie(G, x.c === 'H' ? 'X' : x.c).v; }
    else if (sk === 'furia') { hurt(G, 1, 'furia'); E.dice.push({ id: G.nextDie++, c: 'H', v: 5 }); }
    else if (sk === 'escudo' || sk === 'reloj') E.armed[sk] = true;
    log(G, `Usas ${S.name}.`);
    G.events.push('skill');
    return true;
  }

  // Resultado del peligro: suma de los dados libres (del color y heroicos) contra el valor pedido.
  function perilTotal(G) {
    const E = G.enc;
    return E.dice.reduce((s, d) => s + d.v, 0) + (has(G, 'manos') ? 3 : 0);
  }
  function perilTarget(G) { const o = CARDS[G.enc.id].opts[G.enc.opt]; return o ? o.v + 2 * (G.floor - 1) : 0; }

  // Lo que costaría cerrar el encuentro ahora: daño, tiempo y (contra el jefe) daño que le haces.
  function preview(G) {
    const E = G.enc;
    if (!E || !E.rolled) return null;
    let t = 0, dealt = 0, ok = true;
    const pens = [];
    if (E.kind === 'peril') {
      const o = CARDS[E.id].opts[E.opt];
      ok = perilTotal(G) >= perilTarget(G);
      if (!ok) { if (o.hp) pens.push(o.hp); t += o.t || 0; }
    } else {
      for (const bx of E.boxes) {
        const done = boxDone(E, bx);
        if (bx.atk) { if (done) dealt += bx.atk; continue; }
        if (done) continue;
        if (bx.hp) pens.push(bx.hp);
        if (bx.t) t += bx.t;
      }
    }
    if (E.armed.escudo && pens.length) pens.splice(pens.indexOf(Math.max(...pens)), 1);
    let hp = pens.reduce((s, x) => s + x, 0);
    if (E.armed.reloj) t = 0;
    if (E.kind === 'boss') { hp += t; t = 0; } // ante el jefe ya no hay tiempo que perder
    if (hp && E.kind === 'monster' && CARDS[E.id].ab === 'veneno') hp++;
    if (hp && has(G, 'piel')) hp--;
    return { hp, t, dealt, ok };
  }

  // Cerrar el encuentro: se aplican las casillas sin llenar (o el fallo del peligro).
  function resolve(G) {
    const E = G.enc;
    if (!E || !E.rolled || G.over) return false;
    const P = preview(G), hp = P.hp, t = P.t;
    if (E.kind === 'peril') log(G, P.ok ? `¡Superas el peligro! (${perilTotal(G)} de ${perilTarget(G)})` : `Fallas la prueba (${perilTotal(G)} de ${perilTarget(G)}).`, P.ok ? 'good' : 'bad');
    E.dealt = P.dealt;
    if (hp) G.events.push('hurt');
    hurt(G, hp, E.kind === 'peril' ? 'peligro' : 'golpes');
    if (G.over) return true;
    if (t) passTime(G, t, 'el combate se alarga');
    if (G.over) return true;
    if (E.kind === 'boss') return bossRound(G);
    // Vencido: la carta sale de las puertas y eliges recompensa.
    G.doors.splice(E.door, 1);
    G.enc = null;
    G.won++;
    G.reward = E.id;
    log(G, `¡${CARDS[E.id].name} vencido!`, 'good');
    G.events.push('win');
    return true;
  }

  // Recompensa: objeto (más dados o vida), habilidad o experiencia. `drop`: objeto o habilidad que sale si ya no caben.
  function rewardOptions(G) {
    const c = CARDS[G.reward];
    if (!c) return null;
    const st = stats(G);
    return {
      item: { ok: true, full: G.hero.items.length >= st.slots },
      skill: { ok: !has(G, c.skill), full: G.hero.skills.length >= st.slots },
      xp: { ok: true },
    };
  }
  function takeReward(G, what, drop) {
    const c = CARDS[G.reward], o = rewardOptions(G);
    if (!c || !o[what] || !o[what].ok) return false;
    const h = G.hero;
    if (what === 'item' || what === 'skill') {
      const list = what === 'item' ? h.items : h.skills;
      if (o[what].full) { const i = list.indexOf(drop); if (i < 0) return false; list.splice(i, 1); }
      if (what === 'item') {
        const hpBefore = stats(G).maxHp;
        list.push(G.reward);
        const extra = stats(G).maxHp - hpBefore;
        if (extra > 0) heal(G, extra);
        h.hp = Math.min(h.hp, stats(G).maxHp);
        log(G, `Te quedas ${c.item.name}.`, 'good');
      } else { list.push(c.skill); log(G, `Aprendes ${SKILLS[c.skill].name}.`, 'good'); }
      G.reward = null;
    } else { const xp = c.xp; G.reward = null; gainXp(G, xp); }
    G.events.push('take');
    return true;
  }

  // ---------- Jefe ----------
  function startBoss(G) {
    const B = DUNGEONS[G.dungeon].boss;
    G.floor = FLOORS + 1; G.doors = [];
    G.boss = { hp: B.hp, max: B.hp, round: 0 };
    log(G, `Bajas al fondo. ¡${B.name} te espera!`, 'great');
    G.events.push('boss');
    bossNewRound(G);
  }
  function bossNewRound(G) {
    const B = DUNGEONS[G.dungeon].boss;
    G.boss.round++;
    G.enc = { kind: 'boss', id: 'boss', dice: [], used: {}, armed: {}, rolled: false, dealt: 0,
      boxes: B.boxes.map((bx) => Object.assign({}, bx, { dice: [] })) };
  }
  function bossRound(G) {
    const dealt = G.enc.dealt || 0;
    G.boss.hp = Math.max(0, G.boss.hp - dealt);
    if (dealt) { log(G, `¡Le haces ${dealt} de daño a ${DUNGEONS[G.dungeon].boss.name}!`, 'good'); G.events.push('bosshit'); }
    if (G.boss.hp <= 0) { G.enc = null; G.over = 'win'; log(G, `¡${DUNGEONS[G.dungeon].boss.name} cae! Has limpiado la mazmorra.`, 'great'); G.events.push('victory'); return true; }
    bossNewRound(G);
    return true;
  }

  // Lo que el jugador puede hacer ahora (para la interfaz y las pruebas)
  function score(G) { return G.won * 10 + G.hero.xp * 5 + (G.over === 'win' ? 200 : 0) + (G.floor - 1) * 25; }

  const API = {
    COLORS, HEROES, SKILLS, ABILITIES, CARDS, DECK, DUNGEONS, XP_LEVEL, MAX_DOORS, FLOORS,
    newGame, stats, has, canExplore, explore, canDescend, descend, openDoor, flee, fleeCost, roll, free, canPlace, place, unplace,
    boxSum, boxDone, canMerge, merge, canUseSkill, useSkill, perilTotal, perilTarget, resolve, rewardOptions, takeReward, abOf, score, rng, preview,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.MZR = API;
})(typeof window !== 'undefined' ? window : globalThis);
