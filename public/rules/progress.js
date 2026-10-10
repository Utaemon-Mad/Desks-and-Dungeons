// Progresión y oficios, compartido por servidor y navegador: materiales y forja (mejorar, encantar, combinar,
// desguazar), pesca, hierbas y cocina, tablón de misiones diarias y semanales, logros y títulos, jefes de mundo,
// el Descenso infinito con su desafío semanal y las clasificaciones semanales.
(function (root) {
  'use strict';
  const RULES = root.RULES || (typeof require !== 'undefined' ? require('./engine.js') : null);
  const round1 = (v) => Math.round(v * 10) / 10;
  const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

  // ======================================================================
  //  Materiales (los sueltan los enemigos o salen de desguazar) y productos de los oficios
  // ======================================================================
  const MATS = {
    hierro:   { name: 'Fragmento de hierro', icon: '🔩', kind: 'forja', desc: 'Lo sueltan casi todos los enemigos. Sirve para mejorar objetos.' },
    esencia:  { name: 'Esencia arcana', icon: '💠', kind: 'forja', desc: 'Magia condensada. La sueltan élites y jefes; también sale de desguazar objetos raros.' },
    polvo:    { name: 'Polvo de estrella', icon: '✨', kind: 'forja', desc: 'Muy escaso: jefes, objetos únicos y de conjunto.' },
    // peces (por zona del mundo)
    trucha:   { name: 'Trucha del valle', icon: '🐟', kind: 'pez', zone: 0, w: [0.4, 1.6] },
    carpa:    { name: 'Carpa dorada', icon: '🐠', kind: 'pez', zone: 0, w: [0.8, 3] },
    perca:    { name: 'Perca del bosque', icon: '🐟', kind: 'pez', zone: 1, w: [0.5, 2] },
    lucio:    { name: 'Lucio dentudo', icon: '🐡', kind: 'pez', zone: 1, w: [1.5, 6] },
    anguila:  { name: 'Anguila de la ciénaga', icon: '🐍', kind: 'pez', zone: 2, w: [0.6, 3] },
    siluro:   { name: 'Siluro gigante', icon: '🐋', kind: 'pez', zone: 2, w: [4, 25] },
    escorpez: { name: 'Pez escorpión', icon: '🦂', kind: 'pez', zone: 3, w: [0.4, 2] },
    salmon:   { name: 'Salmón helado', icon: '🐟', kind: 'pez', zone: 4, w: [2, 9] },
    brasa:    { name: 'Pez brasa', icon: '🔥', kind: 'pez', zone: 5, w: [1, 5] },
    dorado:   { name: 'Pez dorado legendario', icon: '🌟', kind: 'pez', zone: -1, w: [3, 12], rare: true },
    // hierbas (por zona)
    menta:    { name: 'Menta del valle', icon: '🌿', kind: 'hierba', zone: 0 },
    seta:     { name: 'Seta susurrante', icon: '🍄', kind: 'hierba', zone: 1 },
    raiz:     { name: 'Raíz de ciénaga', icon: '🥕', kind: 'hierba', zone: 2 },
    flor:     { name: 'Flor del desierto', icon: '🌵', kind: 'hierba', zone: 3 },
    liquen:   { name: 'Liquen de escarcha', icon: '❄️', kind: 'hierba', zone: 4 },
    ceniza:   { name: 'Flor de ceniza', icon: '🥀', kind: 'hierba', zone: 5 },
  };
  const FISH_BY_ZONE = [['trucha', 'trucha', 'carpa'], ['perca', 'perca', 'lucio'], ['anguila', 'anguila', 'siluro'], ['escorpez', 'escorpez', 'carpa'], ['salmon', 'salmon', 'trucha'], ['brasa', 'brasa', 'escorpez']];
  const HERB_BY_ZONE = ['menta', 'seta', 'raiz', 'flor', 'liquen', 'ceniza'];

  // Materiales al morir un enemigo
  function matDrops(rng, m) {
    const out = [];
    if (rng() < (m.boss ? 1 : m.elite ? 0.7 : 0.22)) out.push({ mat: 'hierro', n: m.boss ? 3 + Math.floor(rng() * 3) : m.elite ? 2 : 1 });
    if (rng() < (m.boss ? 1 : m.elite ? 0.35 : 0.05)) out.push({ mat: 'esencia', n: m.boss ? 2 + Math.floor(rng() * 2) : 1 });
    if (rng() < (m.boss ? 0.6 : m.elite ? 0.05 : 0.008)) out.push({ mat: 'polvo', n: m.boss && rng() < 0.3 ? 2 : 1 });
    return out;
  }

  // Una pesca: pez de la zona (a veces el dorado) con su peso
  function catchFish(rng, zone) {
    const id = rng() < 0.03 ? 'dorado' : pick(rng, FISH_BY_ZONE[Math.max(0, Math.min(5, zone))]);
    const F = MATS[id];
    const k = rng();
    return { id, w: round1(F.w[0] + (F.w[1] - F.w[0]) * k * k) };
  }

  // ======================================================================
  //  Forja de Brunilda: mejorar (+1…+10), encantar, combinar 3 en 1 y desguazar
  // ======================================================================
  const MAX_UP = 10;
  const UP_CHANCE = [1, 1, 1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3];
  function upgradeCost(it) {
    const up = it.up || 0;
    const next = up + 1;
    return { hierro: 2 + up * 2, esencia: next >= 4 ? next - 3 : 0, polvo: next >= 8 ? next - 7 : 0, gold: Math.round((10 + it.ilvl * 4) * next), chance: UP_CHANCE[up] || 0 };
  }
  const baseName = (name) => String(name).replace(/\s\+\d+$/, '');
  // Mejora: más daño o armadura; en +5 y +10 su mejor propiedad crece un 15%
  function applyUpgrade(it) {
    it.up = (it.up || 0) + 1;
    if (it.dmg) it.dmg = it.dmg.map((v) => Math.max(v + 1, Math.round(v * 1.07)));
    if (it.armor) it.armor = Math.max(it.armor + 1, Math.round(it.armor * 1.07));
    if (it.up === 5 || it.up === 10) {
      const best = Object.entries(it.stats || {}).sort((a, b) => b[1] - a[1])[0];
      if (best) { const A = RULES.AFFIXES[best[0]]; it.stats[best[0]] = A && A.dec ? round1(best[1] * 1.15) : Math.max(best[1] + 1, Math.round(best[1] * 1.15)); }
    }
    it.value = Math.round(RULES.itemValue(it) * (1 + it.up * 0.2));
    it.name = `${baseName(it.name)} +${it.up}`;
    return it;
  }

  function enchantCost(it) {
    const ri = RULES.RARITY_ORDER.indexOf(it.rarity);
    return { esencia: 2, polvo: ri >= RULES.RARITY_ORDER.indexOf('raro') ? 1 : 0, gold: 20 + it.ilvl * 5 };
  }
  // Encantar: cambia una propiedad por otra al azar del mismo tipo de objeto (nunca repetida), con un escalón de su nivel
  function enchant(rng, it, key) {
    if (!it.stats || it.stats[key] === undefined) return null;
    const pool = RULES.affixPool(it, it.ilvl).filter((k) => it.stats[k] === undefined && !['ed', 'edDef', 'minDmg', 'maxDmg'].includes(k) && !RULES.AFFIXES[k].elem);
    if (!pool.length) return null;
    const k = pick(rng, pool);
    const A = RULES.AFFIXES[k];
    const T = RULES.affixTier(rng, A, it.ilvl, it.rarity === 'unico' || it.rarity === 'conjunto');
    let v = RULES.rollAffixValue(rng, A, T) * (1 + (it.up || 0) * 0.03);
    v = A.dec ? round1(v) : Math.max(1, Math.round(v));
    const stats = {};
    for (const [kk, vv] of Object.entries(it.stats)) { if (kk === key) stats[k] = v; else stats[kk] = vv; }
    it.stats = stats;
    it.enchanted = (it.enchanted || 0) + 1;
    return { from: key, to: k, v };
  }

  // Como el cubo de Diablo 2: tres objetos iguales dan uno de la calidad siguiente
  const COMBINE_TO = { inferior: 'magico', normal: 'magico', superior: 'magico', magico: 'raro', raro: 'unico' };
  function combineCost(rarity, ilvl) {
    const ri = Math.max(0, RULES.RARITY_ORDER.indexOf(rarity) - 2);
    return { gold: Math.round(ilvl * 8 * (ri + 1) + 10), esencia: rarity === 'raro' ? 3 : rarity === 'magico' ? 1 : 0, polvo: rarity === 'raro' ? 2 : 0 };
  }
  function combine(rng, items, classes) {
    const rarity = COMBINE_TO[items[0].rarity];
    const ilvl = Math.round(items.reduce((t, it) => t + it.ilvl, 0) / items.length);
    return RULES.makeItem(rng, { ilvl, rarity, classes });
  }

  function salvage(it) {
    const up = it.up || 0;
    const t = { inferior: { hierro: 1 }, normal: { hierro: 1 + (it.ilvl > 10 ? 1 : 0) }, superior: { hierro: 2 }, magico: { hierro: 2, esencia: 1 }, raro: { hierro: 3, esencia: 2 }, unico: { esencia: 4, polvo: 2 }, conjunto: { esencia: 5, polvo: 3 } }[it.rarity] || { hierro: 1 };
    const out = { ...t };
    if (up) out.hierro = (out.hierro || 0) + up * 2;
    if (up >= 5) out.esencia = (out.esencia || 0) + 1;
    return out;
  }

  // ======================================================================
  //  Cocina de Alfonso: platos con peces y hierbas que dan bufos de 30 minutos
  // ======================================================================
  const FOOD_MIN = 30;
  const RECIPES = {
    'estofado-trucha':  { name: 'Estofado de trucha', icon: '🍲', need: { trucha: 2, menta: 1 }, stats: { hpPct: 15 }, desc: '+15% de vida máxima.' },
    'carpa-asada':      { name: 'Carpa asada con menta', icon: '🍢', need: { carpa: 1, menta: 2 }, stats: { hpRegen: 3, enRegen: 2 }, desc: '+3 vida/s y +2 energía/s.' },
    'sopa-setas':       { name: 'Sopa de setas y perca', icon: '🥣', need: { perca: 1, seta: 2 }, stats: { dmgPct: 10 }, desc: '+10% de daño.' },
    'lucio-guisado':    { name: 'Lucio guisado', icon: '🍛', need: { lucio: 1, seta: 1, menta: 1 }, stats: { dmgPct: 8, armorPct: 10 }, desc: '+8% de daño y +10% de armadura.' },
    'anguila-picante':  { name: 'Anguila picante', icon: '🌶️', need: { anguila: 1, raiz: 2 }, stats: { crit: 4, critDmg: 15 }, desc: '+4% de crítico y +15% de daño crítico.' },
    'siluro-relleno':   { name: 'Siluro relleno', icon: '🍖', need: { siluro: 1, raiz: 1, seta: 1 }, stats: { hpPct: 25 }, desc: '+25% de vida máxima.' },
    'brocheta-desierto': { name: 'Brocheta del desierto', icon: '🍡', need: { escorpez: 1, flor: 2 }, stats: { speed: 10, move: 8 }, desc: '+10% de velocidad de ataque y +8% al andar.' },
    'caldo-montana':    { name: 'Caldo de montaña', icon: '🍵', need: { salmon: 1, liquen: 2 }, stats: { armorPct: 20, hpPct: 10 }, desc: '+20% de armadura y +10% de vida.' },
    'festin-brasas':    { name: 'Festín de brasas', icon: '🔥', need: { brasa: 1, ceniza: 2 }, stats: { dmgPct: 20, lifesteal: 3 }, desc: '+20% de daño y +3% de robo de vida.' },
    'pez-dorado-real':  { name: 'Pez dorado a la real', icon: '👑', need: { dorado: 1 }, stats: { mf: 60, dmgPct: 10 }, desc: '+60% de hallazgo mágico y +10% de daño.' },
  };
  const COOK_PRICE = 10;
  // Los platos son bufos de comida (sólo uno a la vez)
  for (const [id, R] of Object.entries(RECIPES)) RULES.BUFFS['comida:' + id] = { name: R.name, icon: R.icon, food: true, min: FOOD_MIN, stats: R.stats, desc: R.desc, price: 0 };

  // ======================================================================
  //  Tablón de la taberna: misiones diarias y semanales (iguales para todos ese día o esa semana)
  // ======================================================================
  const DAY = 86400000;
  const dayKey = (now = Date.now()) => Math.floor(now / DAY);
  const weekKey = (now = Date.now()) => Math.floor((now / DAY - 4) / 7); // las semanas empiezan en lunes
  const FAM = { goblin: 'goblins', orco: 'orcos', muerto: 'no muertos', bestia: 'bestias', humano: 'bandidos y sectarios' };
  // ev: tipo de suceso que cuenta; f: filtro opcional
  const DAILY = {
    cazador:    { text: 'Derrota {n} monstruos', ev: 'kill', n: 25, icon: '⚔️' },
    elites:     { text: 'Derrota {n} enemigos de élite', ev: 'kill', f: 'elite', n: 3, icon: '💀' },
    jefe:       { text: 'Derrota a un jefe (mazmorra, región o mundo)', ev: 'kill', f: 'boss', n: 1, icon: '👑' },
    cofres:     { text: 'Abre {n} cofres', ev: 'chest', n: 4, icon: '🧰' },
    mazmorra:   { text: 'Completa {n} mazmorra', ev: 'dungeon', n: 1, icon: '🗝️' },
    forja:      { text: 'Mejora o encanta {n} objetos en la forja', ev: 'forge', n: 2, icon: '⚒️' },
    pesca:      { text: 'Pesca {n} peces', ev: 'fish', n: 3, icon: '🎣' },
    hierbas:    { text: 'Recoge {n} hierbas', ev: 'herb', n: 4, icon: '🌿' },
    cocina:     { text: 'Cocina un plato con Alfonso', ev: 'cook', n: 1, icon: '🍲' },
    materiales: { text: 'Consigue {n} materiales de forja', ev: 'mat', n: 8, icon: '🔩' },
    goblins:    { text: 'Derrota {n} goblins', ev: 'kill', f: 'fam:goblin', n: 12, icon: '🪓' },
    muertos:    { text: 'Derrota {n} no muertos', ev: 'kill', f: 'fam:muerto', n: 12, icon: '💀' },
    bestias:    { text: 'Derrota {n} bestias', ev: 'kill', f: 'fam:bestia', n: 12, icon: '🐺' },
    orcos:      { text: 'Derrota {n} orcos u ogros', ev: 'kill', f: 'fam:orco', n: 10, icon: '🏰' },
    descenso:   { text: 'Llega al piso {n} del Descenso', ev: 'floor', max: true, n: 3, icon: '🌀' },
  };
  const WEEKLY = {
    s_cazador:   { text: 'Derrota {n} monstruos esta semana', ev: 'kill', n: 300, icon: '⚔️' },
    s_jefes:     { text: 'Derrota {n} jefes', ev: 'kill', f: 'boss', n: 8, icon: '👑' },
    s_descenso:  { text: 'Llega al piso {n} del Descenso infinito', ev: 'floor', max: true, n: 10, icon: '🌀' },
    s_mazmorras: { text: 'Completa {n} mazmorras', ev: 'dungeon', n: 6, icon: '🗝️' },
    s_duelos:    { text: 'Gana {n} duelos en la arena', ev: 'duel', n: 3, icon: '🤺' },
    s_pesca:     { text: 'Pesca {n} peces', ev: 'fish', n: 20, icon: '🎣' },
    s_mundo:     { text: 'Ayuda a derrotar a un jefe de mundo', ev: 'worldboss', n: 1, icon: '🌋' },
    s_forja:     { text: 'Usa la forja {n} veces', ev: 'forge', n: 10, icon: '⚒️' },
  };
  function boardFor(day, week) {
    const rd = RULES.seeded('daily:' + day), rw = RULES.seeded('weekly:' + week);
    const pickN = (rng, keys, n) => { const k = keys.slice(), out = []; while (out.length < n && k.length) out.push(k.splice(Math.floor(rng() * k.length), 1)[0]); return out; };
    return { day, week, daily: pickN(rd, Object.keys(DAILY), 3), weekly: pickN(rw, Object.keys(WEEKLY), 2) };
  }
  const taskDef = (id) => DAILY[id] || WEEKLY[id];
  const taskText = (id) => { const T = taskDef(id); return T ? T.text.replace('{n}', T.n) : id; };
  // ¿Cuenta este suceso para la tarea?
  function taskMatch(T, ev, d = {}) {
    if (T.ev !== ev) return false;
    if (!T.f) return true;
    if (T.f === 'elite') return !!d.elite;
    if (T.f === 'boss') return !!d.boss;
    if (T.f.startsWith('fam:')) return d.fam === T.f.slice(4);
    return true;
  }
  function taskReward(id, level) {
    const weekly = !!WEEKLY[id];
    return { xp: Math.round((weekly ? 600 : 80) * level * (1 + level * 0.05)), gold: Math.round((weekly ? 140 : 20) * level), mats: weekly ? { esencia: 3, polvo: 1 } : { hierro: 3, esencia: 1 }, item: weekly ? 'raro' : null };
  }

  // ======================================================================
  //  Logros y títulos
  // ======================================================================
  // stat: contador del perfil (profile.stats); los "max" guardan el mejor valor
  const ACHIEVEMENTS = [
    { id: 'sangre', name: 'Primera sangre', stat: 'kills', n: 1, gold: 10 },
    { id: 'cazador', name: 'Cazador', stat: 'kills', n: 100, gold: 100 },
    { id: 'matamonstruos', name: 'Matamonstruos', stat: 'kills', n: 1000, gold: 500, title: 'Matamonstruos' },
    { id: 'leyenda', name: 'Leyenda de la taberna', stat: 'kills', n: 5000, gold: 2000, title: 'Leyenda de la Taberna' },
    { id: 'matajefes', name: 'Matajefes', stat: 'bosses', n: 1, gold: 50 },
    { id: 'rompecoronas', name: 'Rompecoronas', stat: 'bosses', n: 15, gold: 400, title: 'Rompecoronas' },
    { id: 'azote', name: 'Azote de reyes', stat: 'bosses', n: 60, gold: 1500, title: 'Azote de Reyes' },
    { id: 'heroe', name: 'Héroe del Reino', stat: 'worldboss', n: 1, gold: 300, title: 'Héroe del Reino' },
    { id: 'campeon', name: 'Campeón del Reino', stat: 'worldboss', n: 10, gold: 1500, title: 'Campeón del Reino' },
    { id: 'espeleologo', name: 'Espeleólogo', stat: 'dungeons', n: 10, gold: 200, title: 'Espeleólogo' },
    { id: 'descensor', name: 'Descensor', stat: 'floor', n: 10, gold: 300, title: 'Descensor' },
    { id: 'abismo', name: 'Señor del Abismo', stat: 'floor', n: 25, gold: 1500, title: 'Señor del Abismo' },
    { id: 'duelista', name: 'Primer duelo', stat: 'duels', n: 1, gold: 30 },
    { id: 'gladiador', name: 'Gladiador', stat: 'duels', n: 10, gold: 400, title: 'Gladiador' },
    { id: 'pescador', name: 'Pescador', stat: 'fish', n: 15, gold: 100, title: 'Pescador' },
    { id: 'dorado', name: 'El del pez dorado', stat: 'goldfish', n: 1, gold: 300, title: 'el del Pez Dorado' },
    { id: 'herbolario', name: 'Herbolario', stat: 'herbs', n: 30, gold: 150, title: 'Herbolario' },
    { id: 'cocinillas', name: 'Cocinillas', stat: 'cook', n: 10, gold: 150, title: 'Cocinillas' },
    { id: 'aprendiz', name: 'Aprendiz de herrero', stat: 'upmax', n: 5, gold: 150 },
    { id: 'forjador', name: 'Maestro forjador', stat: 'upmax', n: 10, gold: 1000, title: 'Maestro Forjador' },
    { id: 'fortuna', name: 'Bendecido por la fortuna', stat: 'legend', n: 1, gold: 200, title: 'el Afortunado' },
    { id: 'veterano', name: 'Veterano', stat: 'level', n: 10, gold: 200 },
    { id: 'curtido', name: 'Curtido en mil batallas', stat: 'level', n: 25, gold: 1000, title: 'Veterano' },
    { id: 'salvador', name: 'Salvador del Valle', stat: 'quests', n: 17, gold: 2000, title: 'Salvador del Valle' },
    { id: 'trabajador', name: 'Trabajador incansable', stat: 'tasks', n: 20, gold: 400, title: 'Incansable' },
    { id: 'domador', name: 'Domador', stat: 'petlvl', n: 10, gold: 300, title: 'Domador de Bestias' },
  ];
  const MAX_STATS = new Set(['floor', 'upmax', 'level', 'petlvl']);
  const STAT_NAMES = { kills: 'Monstruos derrotados', bosses: 'Jefes derrotados', worldboss: 'Jefes de mundo', dungeons: 'Mazmorras completadas', floor: 'Piso más hondo del Descenso', duels: 'Duelos ganados', fish: 'Peces pescados', goldfish: 'Peces dorados', herbs: 'Hierbas recogidas', cook: 'Platos cocinados', upmax: 'Mejor mejora en la forja', legend: 'Únicos encontrados', level: 'Nivel', quests: 'Misiones de la historia', tasks: 'Tareas del tablón', petlvl: 'Nivel de tu mascota', bigfish: 'Pez más grande (kg)' };

  // ======================================================================
  //  Jefes de mundo: aparecen cada cierto tiempo en el mundo abierto para todo el servidor
  // ======================================================================
  const WORLD_BOSSES = ['coloso-runas', 'nyxara', 'rey-espectral', 'behemot'];
  const WORLD_EVENT = { firstMs: 4 * 60000, everyMs: 20 * 60000, lastsMs: 10 * 60000 };

  // ======================================================================
  //  Descenso infinito: un piso tras otro, cada uno más difícil, con un desafío que cambia cada semana
  // ======================================================================
  const WEEKLY_MODS = {
    frenesi:    { name: 'Frenesí', icon: '⚡', desc: 'Los enemigos se mueven y atacan más rápido.' },
    elites:     { name: 'Marea de élites', icon: '💀', desc: 'Muchos más enemigos de élite (y más botín).' },
    explosivos: { name: 'Cadáveres explosivos', icon: '💥', desc: 'Los enemigos estallan al morir: ¡apártate!' },
    vampiros:   { name: 'Sed de sangre', icon: '🩸', desc: 'Los enemigos se curan con el daño que hacen.' },
    sobrios:    { name: 'Abstemios', icon: '🚫', desc: 'No se pueden usar pociones, pero cae un 50% más de oro.' },
    gigantes:   { name: 'Gigantismo', icon: '🦣', desc: 'Enemigos enormes: +50% de vida y +50% de experiencia.' },
  };
  const weekMod = (week = weekKey()) => { const ids = Object.keys(WEEKLY_MODS); return ids[((week % ids.length) + ids.length) % ids.length]; };
  const DESCENT_THEMES = ['cuevas', 'cripta', 'nido', 'fortaleza', 'volcan'];
  const descentTheme = (floor) => DESCENT_THEMES[(floor - 1) % DESCENT_THEMES.length];
  const descentLevel = (startLevel, floor) => startLevel + floor - 1;

  // ======================================================================
  //  Clasificaciones semanales
  // ======================================================================
  const BOARDS = {
    floor:     { name: 'Piso más hondo del Descenso', icon: '🌀', max: true },
    kills:     { name: 'Monstruos derrotados', icon: '⚔️' },
    bosses:    { name: 'Jefes derrotados', icon: '👑' },
    worldboss: { name: 'Jefes de mundo', icon: '🌋' },
    duels:     { name: 'Duelos ganados', icon: '🤺' },
    bigfish:   { name: 'Pez más grande (kg)', icon: '🎣', max: true },
  };

  // ======================================================================
  //  Arena del sótano de Alfonso
  // ======================================================================
  const ARENA = { maxBet: 5000, w: 15, h: 11 };
  function arenaTiles() {
    const { w, h } = ARENA;
    const t = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) t.push(x === 0 || y === 0 || x === w - 1 || y === h - 1 ? '#' : '.');
    for (const [x, y] of [[4, 3], [10, 3], [4, 7], [10, 7]]) t[y * w + x] = '#';
    return t.join('');
  }

  const PROG = {
    MATS, FISH_BY_ZONE, HERB_BY_ZONE, matDrops, catchFish,
    MAX_UP, upgradeCost, applyUpgrade, enchantCost, enchant, COMBINE_TO, combineCost, combine, salvage, baseName,
    RECIPES, COOK_PRICE, FOOD_MIN,
    DAILY, WEEKLY, FAM, dayKey, weekKey, boardFor, taskDef, taskText, taskMatch, taskReward,
    ACHIEVEMENTS, MAX_STATS, STAT_NAMES, WORLD_BOSSES, WORLD_EVENT,
    WEEKLY_MODS, weekMod, descentTheme, descentLevel, BOARDS, ARENA, arenaTiles,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = PROG;
  else root.PROG = PROG;
})(this);
