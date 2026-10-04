// Motor de reglas (SRD 5.2): valida fichas de personaje, calcula sus valores y resuelve tiradas.
// Se usa igual en el servidor (Node) y en el navegador. Los datos vienen de core.json (scripts/build-srd.js).
(function (root) {
  'use strict';

  let D = null;          // core.json
  let SPELLS = null;     // spells.json (indexado por id)
  const ABIL = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

  function setData(core, spells) {
    D = core;
    D.byId = {};
    for (const k of ['classes', 'species', 'backgrounds', 'feats', 'weapons', 'armor', 'skills']) {
      D.byId[k] = Object.fromEntries(D[k].map((x) => [x.id, x]));
    }
    if (spells) SPELLS = Object.fromEntries(spells.map((s) => [s.id, s]));
  }

  // ======================================================================
  //  Dados
  // ======================================================================
  const defaultRng = (n) => 1 + Math.floor(Math.random() * n);

  // "2d6+3", "1d4+1", "3d8", "5" → total. crit duplica los dados.
  function roll(expr, opts = {}) {
    const rng = opts.rng || defaultRng;
    let total = 0;
    const rolls = [];
    String(expr).replace(/\s+/g, '').split(/(?=[+-])/).forEach((term) => {
      const sign = term[0] === '-' ? -1 : 1;
      const t = term.replace(/^[+-]/, '');
      const m = /^(\d*)d(\d+)$/.exec(t);
      if (m) {
        const n = (parseInt(m[1] || '1', 10)) * (opts.crit ? 2 : 1);
        for (let i = 0; i < n; i++) { const r = rng(parseInt(m[2], 10)); rolls.push(r); total += sign * r; }
      } else if (t) total += sign * (parseInt(t, 10) || 0);
    });
    return { total: Math.max(0, total), rolls };
  }

  function scaleDice(expr, times) {
    if (times <= 1) return expr;
    return String(expr).replace(/(\d*)d(\d+)/g, (_, n, d) => `${(parseInt(n || '1', 10)) * times}d${d}`);
  }

  // ======================================================================
  //  Valores básicos
  // ======================================================================
  const mod = (score) => Math.floor((score - 10) / 2);
  const fmt = (n) => (n >= 0 ? `+${n}` : `${n}`);
  function levelFromXp(xp) {
    let lv = 1;
    while (lv < 20 && xp >= D.xpTable[lv]) lv++;
    return lv;
  }
  const profForLevel = (lv) => 2 + Math.floor((lv - 1) / 4);
  const cantripTier = (lv) => (lv >= 17 ? 4 : lv >= 11 ? 3 : lv >= 5 ? 2 : 1);
  const tiles = (ft) => Math.max(1, Math.round(ft / 5));

  // ======================================================================
  //  Conjuros jugables en combate (revisados contra el texto del SRD 5.2)
  // ======================================================================
  // kind: attack (tirada de ataque), save (salvación), auto (impacta siempre), heal
  // area: { shape: sphere|cone|line|emanation, size (pies) }  · range en pies (5 = toque)
  const COMBAT_SPELLS = {
    'fire-bolt':        { kind: 'attack', dice: '1d10', type: 'fire', range: 120 },
    'ray-of-frost':     { kind: 'attack', dice: '1d8', type: 'cold', range: 60 },
    'eldritch-blast':   { kind: 'attack', dice: '1d10', type: 'force', range: 120, beams: true },
    'chill-touch':      { kind: 'attack', dice: '1d10', type: 'necrotic', range: 5 },
    'shocking-grasp':   { kind: 'attack', dice: '1d8', type: 'lightning', range: 5 },
    'poison-spray':     { kind: 'attack', dice: '1d12', type: 'poison', range: 30 },
    'produce-flame':    { kind: 'attack', dice: '1d8', type: 'fire', range: 60 },
    'starry-wisp':      { kind: 'attack', dice: '1d8', type: 'radiant', range: 60 },
    'sorcerous-burst':  { kind: 'attack', dice: '1d8', type: 'fire', range: 120 },
    'sacred-flame':     { kind: 'save', save: 'dex', dice: '1d8', type: 'radiant', range: 60 },
    'vicious-mockery':  { kind: 'save', save: 'wis', dice: '1d6', type: 'psychic', range: 60 },
    'acid-splash':      { kind: 'save', save: 'dex', dice: '1d6', type: 'acid', range: 60, area: { shape: 'sphere', size: 5 } },
    'chromatic-orb':    { kind: 'attack', dice: '3d8', type: 'fire', range: 90 },
    'magic-missile':    { kind: 'auto', dice: '1d4+1', type: 'force', range: 120, count: 3 },
    'guiding-bolt':     { kind: 'attack', dice: '4d6', type: 'radiant', range: 120 },
    'burning-hands':    { kind: 'save', save: 'dex', half: true, dice: '3d6', type: 'fire', range: 15, area: { shape: 'cone', size: 15 } },
    'thunderwave':      { kind: 'save', save: 'con', half: true, dice: '2d8', type: 'thunder', range: 15, area: { shape: 'cone', size: 15 } },
    'inflict-wounds':   { kind: 'save', save: 'con', half: true, dice: '2d10', type: 'necrotic', range: 5 },
    'dissonant-whispers': { kind: 'save', save: 'wis', half: true, dice: '3d6', type: 'psychic', range: 60 },
    'ray-of-sickness':  { kind: 'attack', dice: '2d8', type: 'poison', range: 60 },
    'ice-knife':        { kind: 'attack', dice: '1d10', type: 'piercing', range: 60, then: { save: 'dex', dice: '2d6', type: 'cold', area: { shape: 'sphere', size: 5 } } },
    'cure-wounds':      { kind: 'heal', dice: '2d8', addMod: true, range: 5 },
    'healing-word':     { kind: 'heal', dice: '2d4', addMod: true, range: 60 },
    'scorching-ray':    { kind: 'attack', dice: '2d6', type: 'fire', range: 120, count: 3 },
    'shatter':          { kind: 'save', save: 'con', half: true, dice: '3d8', type: 'thunder', range: 60, area: { shape: 'sphere', size: 10 } },
    'acid-arrow':       { kind: 'attack', dice: '4d4', type: 'acid', range: 90, missHalf: true },
    'moonbeam':         { kind: 'save', save: 'con', half: true, dice: '2d10', type: 'radiant', range: 120, area: { shape: 'sphere', size: 5 } },
    'spiritual-weapon': { kind: 'attack', dice: '1d8', addMod: true, type: 'force', range: 60 },
    'mind-spike':       { kind: 'save', save: 'wis', half: true, dice: '3d8', type: 'psychic', range: 120 },
    'prayer-of-healing': { kind: 'heal', dice: '2d8', range: 30, multi: 5 },
    'fireball':         { kind: 'save', save: 'dex', half: true, dice: '8d6', type: 'fire', range: 150, area: { shape: 'sphere', size: 20 } },
    'lightning-bolt':   { kind: 'save', save: 'dex', half: true, dice: '8d6', type: 'lightning', range: 100, area: { shape: 'line', size: 100 } },
    'mass-healing-word': { kind: 'heal', dice: '2d4', addMod: true, range: 60, multi: 6 },
    'vampiric-touch':   { kind: 'attack', dice: '3d6', type: 'necrotic', range: 5, drain: true },
    'blight':           { kind: 'save', save: 'con', half: true, dice: '8d8', type: 'necrotic', range: 30 },
    'ice-storm':        { kind: 'save', save: 'dex', half: true, dice: '2d10+4d6', type: 'cold', range: 300, area: { shape: 'sphere', size: 20 } },
    'cone-of-cold':     { kind: 'save', save: 'con', half: true, dice: '8d8', type: 'cold', range: 60, area: { shape: 'cone', size: 60 } },
    'flame-strike':     { kind: 'save', save: 'dex', half: true, dice: '5d6+5d6', type: 'fire', range: 60, area: { shape: 'sphere', size: 10 } },
    'mass-cure-wounds': { kind: 'heal', dice: '5d8', addMod: true, range: 60, multi: 6 },
  };

  // Trucos que dan algunos linajes (se lanzan con la característica más alta entre INT, SAB y CAR)
  const INNATE = {
    'fiendish-legacy-abyssal': 'poison-spray', 'fiendish-legacy-chthonic': 'chill-touch', 'fiendish-legacy-infernal': 'fire-bolt',
    'elven-lineage-drow': 'dancing-lights', 'elven-lineage-high-elf': 'prestidigitation', 'elven-lineage-wood-elf': 'druidcraft',
    'gnomish-lineage-forest-gnome': 'minor-illusion',
  };
  const DRAGON_DAMAGE = { black: 'acid', blue: 'lightning', brass: 'fire', bronze: 'lightning', copper: 'acid', gold: 'fire', green: 'poison', red: 'fire', silver: 'cold', white: 'cold' };
  const MAGIC_INITIATE_ABILITY = { cleric: 'wis', druid: 'wis', wizard: 'int' };

  // ======================================================================
  //  Validación de una ficha (lo que elige el jugador)
  // ======================================================================
  function spellListFor(cls, level) {
    return Object.values(SPELLS || {}).filter((s) => s.classes.includes(cls) && s.level === level);
  }

  function maxSpellLevel(c, lv) {
    const slots = c.levels[lv - 1].slots;
    let m = 0;
    slots.forEach((n, i) => { if (n > 0) m = i + 1; });
    return m;
  }

  function validate(input, xp = 0) {
    const errors = [];
    const s = input || {};
    const c = D.byId.classes[s.class];
    const sp = D.byId.species[s.species];
    const bg = D.byId.backgrounds[s.background];
    if (!c) errors.push('Elige una clase.');
    if (!sp) errors.push('Elige una especie.');
    if (!bg) errors.push('Elige un trasfondo.');
    if (errors.length) return { ok: false, errors };
    const lv = levelFromXp(xp);
    const out = {
      v: 1,
      name: String(s.name || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 24) || 'Aventurero',
      class: c.id, species: sp.id, background: bg.id,
      subspecies: null, method: ['standard', 'pointbuy', 'roll'].includes(s.method) ? s.method : 'standard',
      base: {}, bonus: {}, skills: [], expertise: [], speciesSkill: null, humanFeat: null, featChoice: {},
      fightingStyle: null, armor: null, shield: false, weapons: [], cantrips: [], spells: [],
      alignment: D.alignments.some((a) => a.id === s.alignment) ? s.alignment : 'neutral',
      look: { skin: Number.isInteger(s.look && s.look.skin) ? s.look.skin : 0, hair: Number.isInteger(s.look && s.look.hair) ? s.look.hair : 0 },
    };

    // Linaje / ancestro
    if (sp.subspecies.length) {
      const sub = sp.subspecies.find((x) => x.id === s.subspecies);
      if (!sub) errors.push(`Elige ${sp.subspecies[0].name.split(':')[0].toLowerCase()}.`);
      else out.subspecies = sub.id;
    }

    // Puntuaciones de característica
    const base = {};
    for (const a of ABIL) base[a] = Number(s.base && s.base[a]);
    if (out.method === 'standard') {
      const got = ABIL.map((a) => base[a]).sort((x, y) => y - x).join(',');
      if (got !== D.standardArray.join(',')) errors.push('Con la serie estándar debes usar 15, 14, 13, 12, 10 y 8 una vez cada uno.');
    } else if (out.method === 'pointbuy') {
      let cost = 0;
      for (const a of ABIL) {
        if (!(base[a] in D.pointBuy.cost)) { errors.push('Con la compra de puntos cada característica va de 8 a 15.'); break; }
        cost += D.pointBuy.cost[base[a]];
      }
      if (cost > D.pointBuy.budget) errors.push(`Has gastado ${cost} puntos y el máximo es ${D.pointBuy.budget}.`);
    } else {
      for (const a of ABIL) if (!Number.isInteger(base[a]) || base[a] < 3 || base[a] > 18) { errors.push('Las tiradas deben estar entre 3 y 18.'); break; }
    }
    out.base = base;

    // Aumentos del trasfondo: +2/+1 o +1/+1/+1 entre sus tres características
    const bonus = {};
    let total = 0;
    for (const [a, v] of Object.entries(s.bonus || {})) {
      const n = Number(v);
      if (!n) continue;
      if (!bg.abilities.includes(a) || ![1, 2].includes(n)) { errors.push('Los aumentos del trasfondo sólo pueden ir a sus tres características.'); break; }
      bonus[a] = n; total += n;
    }
    const vals = Object.values(bonus).sort().join(',');
    if (total !== 3 || !(vals === '1,2' || vals === '1,1,1')) errors.push('Reparte +2 y +1, o +1 a tres características, entre las del trasfondo.');
    out.bonus = bonus;

    // Habilidades
    const fixed = new Set(bg.skills);
    const chosen = [...new Set((s.skills || []).filter((k) => c.skillChoices.from.includes(k) && !fixed.has(k)))];
    if (chosen.length !== c.skillChoices.count) errors.push(`Elige ${c.skillChoices.count} habilidades de clase (distintas de las del trasfondo).`);
    out.skills = chosen.slice(0, c.skillChoices.count);
    if (sp.id === 'elf') {
      if (!['insight', 'perception', 'survival'].includes(s.speciesSkill)) errors.push('Sentidos agudos: elige Perspicacia, Percepción o Supervivencia.');
      else out.speciesSkill = s.speciesSkill;
    }
    if (sp.id === 'human') {
      if (!D.byId.skills[s.speciesSkill]) errors.push('Humano habilidoso: elige una habilidad.');
      else out.speciesSkill = s.speciesSkill;
      const f = D.byId.feats[s.humanFeat];
      if (!f || f.type !== 'origin') errors.push('Humano versátil: elige una dote de origen.');
      else out.humanFeat = f.id;
    }
    const allSkills = new Set([...bg.skills, ...out.skills, ...(out.speciesSkill ? [out.speciesSkill] : [])]);

    // Dotes con elecciones
    const feats = [bg.feat.id, out.humanFeat].filter(Boolean);
    if (feats.includes('skilled')) {
      const extra = [...new Set((s.featChoice && s.featChoice.skilled) || [])].filter((k) => D.byId.skills[k] && !allSkills.has(k));
      if (extra.length !== 3) errors.push('Habilidoso: elige tres habilidades más.');
      out.featChoice.skilled = extra.slice(0, 3);
      extra.forEach((k) => allSkills.add(k));
    }
    if (feats.includes('magic-initiate')) {
      const list = (bg.feat.id === 'magic-initiate' && bg.feat.note ? bg.feat.note : (s.featChoice && s.featChoice.miClass) || 'wizard').toLowerCase();
      const cls = ['cleric', 'druid', 'wizard'].includes(list) ? list : 'wizard';
      const mi = (s.featChoice && s.featChoice.magicInitiate) || {};
      const can = [...new Set(mi.cantrips || [])].filter((id) => SPELLS[id] && SPELLS[id].level === 0 && SPELLS[id].classes.includes(cls));
      const one = SPELLS[mi.spell] && SPELLS[mi.spell].level === 1 && SPELLS[mi.spell].classes.includes(cls) ? mi.spell : null;
      if (can.length !== 2 || !one) errors.push(`Iniciado en la magia (${D.byId.classes[cls].name}): elige 2 trucos y 1 conjuro de nivel 1.`);
      out.featChoice.magicInitiate = { cls, cantrips: can.slice(0, 2), spell: one };
    }

    // Pericia del pícaro (nivel 1): dos habilidades en las que sea competente
    if (c.id === 'rogue') {
      const ex = [...new Set(s.expertise || [])].filter((k) => allSkills.has(k));
      if (ex.length !== 2) errors.push('Pericia: elige dos de tus habilidades.');
      out.expertise = ex.slice(0, 2);
    }

    // Estilo de combate (guerrero desde nivel 1; paladín y explorador desde el 2)
    const needsStyle = c.id === 'fighter' || ((c.id === 'paladin' || c.id === 'ranger') && lv >= 2);
    if (needsStyle) {
      const f = D.byId.feats[s.fightingStyle];
      if (!f || f.type !== 'fighting-style') errors.push('Elige un estilo de combate.');
      else out.fightingStyle = f.id;
    }

    // Equipo
    if (s.armor && D.byId.armor[s.armor] && D.byId.armor[s.armor].kind !== 'shield') out.armor = s.armor;
    out.shield = !!s.shield;
    out.weapons = [...new Set((s.weapons || []).filter((w) => D.byId.weapons[w]))].slice(0, 3);
    if (!out.weapons.length && !['monk'].includes(c.id)) errors.push('Elige al menos un arma.');

    // Conjuros
    if (c.spellcasting) {
      const row = c.levels[lv - 1];
      const maxL = maxSpellLevel(c, lv);
      const can = [...new Set(s.cantrips || [])].filter((id) => SPELLS[id] && SPELLS[id].level === 0 && SPELLS[id].classes.includes(c.id));
      const spl = [...new Set(s.spells || [])].filter((id) => SPELLS[id] && SPELLS[id].level >= 1 && SPELLS[id].level <= maxL && SPELLS[id].classes.includes(c.id));
      if (can.length > row.cantrips) errors.push(`Puedes conocer ${row.cantrips} trucos.`);
      if (spl.length > row.prepared) errors.push(`Puedes preparar ${row.prepared} conjuros.`);
      if (row.cantrips && can.length < row.cantrips) errors.push(`Elige ${row.cantrips} trucos.`);
      if (row.prepared && spl.length < row.prepared) errors.push(`Elige ${row.prepared} conjuros preparados.`);
      out.cantrips = can.slice(0, row.cantrips);
      out.spells = spl.slice(0, row.prepared);
    }
    return { ok: errors.length === 0, errors, sheet: out };
  }

  // ======================================================================
  //  Cálculo de la ficha
  // ======================================================================
  function derive(sheet, xp = 0) {
    const c = D.byId.classes[sheet.class];
    const sp = D.byId.species[sheet.species];
    const bg = D.byId.backgrounds[sheet.background];
    const lv = levelFromXp(xp);
    const row = c.levels[lv - 1];
    const prof = row.prof;

    // Características (+ mejora automática de la característica principal en los niveles de dote)
    const score = {};
    for (const a of ABIL) score[a] = Math.min(20, (sheet.base[a] || 10) + (sheet.bonus[a] || 0));
    const asiLevels = [4, 8, 12, 16, 19].filter((l) => l <= lv).length;
    const main = c.primary.slice().sort((a, b) => score[b] - score[a])[0];
    score[main] = Math.min(20, score[main] + 2 * asiLevels);
    const m = Object.fromEntries(ABIL.map((a) => [a, mod(score[a])]));

    const feats = [bg.feat.id, sheet.humanFeat, sheet.fightingStyle].filter(Boolean);
    const skillProf = new Set([...bg.skills, ...sheet.skills, ...(sheet.speciesSkill ? [sheet.speciesSkill] : []), ...((sheet.featChoice && sheet.featChoice.skilled) || [])]);
    const expertise = new Set(sheet.expertise || []);
    const skills = D.skills.map((k) => {
      const p = skillProf.has(k.id) ? (expertise.has(k.id) ? prof * 2 : prof) : 0;
      return { id: k.id, name: k.name, ability: k.ability, prof: !!p, expert: expertise.has(k.id), bonus: m[k.ability] + p };
    });
    const saves = ABIL.map((a) => ({ id: a, prof: c.saves.includes(a), bonus: m[a] + (c.saves.includes(a) ? prof : 0) }));

    // Puntos de golpe
    const toughness = sp.id === 'dwarf' ? 1 : 0;
    let hp = c.hitDie + m.con + toughness;
    for (let l = 2; l <= lv; l++) hp += Math.max(1, c.hitDie / 2 + 1 + m.con + toughness);
    hp = Math.max(1, hp);

    // Clase de armadura
    const armor = sheet.armor ? D.byId.armor[sheet.armor] : null;
    const shieldProf = c.armor.includes('shields');
    let ac;
    if (armor) ac = armor.base + (armor.dex ? (armor.maxDex != null ? Math.min(m.dex, armor.maxDex) : m.dex) : 0);
    else if (c.id === 'barbarian') ac = 10 + m.dex + m.con;
    else if (c.id === 'monk' && !sheet.shield) ac = 10 + m.dex + m.wis;
    else ac = 10 + m.dex;
    if (sheet.shield) ac += 2;
    if (feats.includes('defense') && armor) ac += 1;
    const armorProf = !armor || c.armor.includes('all-armor') || c.armor.includes(`${armor.kind}-armor`);

    // Velocidad
    let speed = sp.speed;
    if (sheet.subspecies === 'elven-lineage-wood-elf') speed = 35;
    if (c.id === 'monk' && !armor && !sheet.shield && row.extra && row.extra.unarmored_movement_bonus) speed += row.extra.unarmored_movement_bonus;
    if (c.id === 'barbarian' && lv >= 5) speed += 10;

    // Ataques con armas
    const weaponProf = (w) => c.weapons.includes(`${w.category}-weapons`) || c.weapons.includes(`${w.id}s`) || c.weapons.includes(w.id);
    const monkDie = c.id === 'monk' ? (row.extra && row.extra.martial_arts_die) || 6 : 0;
    const attacks = sheet.weapons.map((id) => {
      const w = D.byId.weapons[id];
      const finesse = w.properties.includes('finesse');
      const monkWeapon = monkDie && (w.category === 'simple' || w.properties.includes('light')) && w.kind === 'melee';
      let ab = w.kind === 'ranged' ? 'dex' : finesse || monkWeapon ? (m.dex > m.str ? 'dex' : 'str') : 'str';
      if (finesse && m.dex > m.str) ab = 'dex';
      const p = weaponProf(w) ? prof : 0;
      const archery = feats.includes('archery') && w.kind === 'ranged' ? 2 : 0;
      let dice = w.damage;
      if (monkWeapon && /d(\d+)/.test(dice) && parseInt(dice.split('d')[1], 10) < monkDie) dice = `1d${monkDie}`;
      const range = w.kind === 'ranged' ? w.range[0] : w.properties.includes('reach') ? 10 : 5;
      return { id: w.id, name: w.name, kind: w.kind, ability: ab, hit: m[ab] + p + archery, dice, mod: m[ab], type: w.type, range, thrown: w.thrown ? w.thrown[0] : null, mastery: w.mastery, prof: !!p };
    });
    attacks.push({ id: 'unarmed', name: 'Ataque sin armas', kind: 'melee', ability: monkDie && m.dex > m.str ? 'dex' : 'str', hit: (monkDie && m.dex > m.str ? m.dex : m.str) + prof, dice: monkDie ? `1d${monkDie}` : '1', mod: monkDie && m.dex > m.str ? m.dex : m.str, type: 'bludgeoning', range: 5, prof: true });

    // Lanzamiento de conjuros
    let casting = null;
    if (c.spellcasting) {
      const a = c.spellcasting.ability;
      casting = { ability: a, mod: m[a], dc: 8 + prof + m[a], attack: prof + m[a], slots: row.slots.slice(), cantripsKnown: row.cantrips, prepared: row.prepared, maxLevel: maxSpellLevel(c, lv) };
    }
    const innateAbility = ['int', 'wis', 'cha'].sort((a, b) => m[b] - m[a])[0];
    const known = [];
    for (const id of sheet.cantrips || []) known.push({ id, source: 'class', ability: casting && casting.ability });
    for (const id of sheet.spells || []) known.push({ id, source: 'class', ability: casting && casting.ability });
    if (INNATE[sheet.subspecies]) known.push({ id: INNATE[sheet.subspecies], source: 'species', ability: innateAbility });
    if (sp.id === 'tiefling') known.push({ id: 'thaumaturgy', source: 'species', ability: innateAbility });
    const mi = sheet.featChoice && sheet.featChoice.magicInitiate;
    if (mi) {
      const a = MAGIC_INITIATE_ABILITY[mi.cls] || 'int';
      for (const id of mi.cantrips) known.push({ id, source: 'feat', ability: a });
      if (mi.spell) known.push({ id: mi.spell, source: 'feat', ability: a, freeCast: true });
    }
    const spellList = known.filter((k, i) => SPELLS[k.id] && known.findIndex((x) => x.id === k.id) === i).map((k) => {
      const s = SPELLS[k.id];
      const a = k.ability || innateAbility;
      return { id: s.id, name: s.name, level: s.level, ability: a, attack: prof + m[a], dc: 8 + prof + m[a], mod: m[a], source: k.source, freeCast: !!k.freeCast, combat: !!COMBAT_SPELLS[s.id] };
    });

    // Rasgos de combate de clase y especie
    const actions = [];
    const ex = row.extra || {};
    if (c.id === 'fighter') actions.push({ id: 'second-wind', name: 'Tomar aliento', uses: ex.second_wind_uses || 2, dice: `1d10+${lv}`, desc: 'Recuperas 1d10 + tu nivel de guerrero en PG.' });
    if (c.id === 'barbarian') actions.push({ id: 'rage', name: 'Furia', uses: ex.rage_count || 2, bonus: ex.rage_damage_bonus || 2, desc: `Durante 1 minuto: +${ex.rage_damage_bonus || 2} al daño con ataques de Fuerza y resistencia al daño contundente, cortante y perforante.` });
    if (c.id === 'paladin') actions.push({ id: 'lay-on-hands', name: 'Imposición de manos', pool: 5 * lv, desc: `Reserva de ${5 * lv} PG para curar.` });
    if (sp.id === 'dragonborn' && sheet.subspecies) {
      const color = sheet.subspecies.replace('draconic-ancestor-', '');
      const dice = `${lv >= 17 ? 4 : lv >= 11 ? 3 : lv >= 5 ? 2 : 1}d10`;
      actions.push({ id: 'breath-weapon', name: 'Arma de aliento', uses: prof, dice, type: DRAGON_DAMAGE[color] || 'fire', save: 'dex', dc: 8 + m.con + prof, area: { shape: 'cone', size: 15 }, desc: `Cono de 15 pies: salvación de Destreza CD ${8 + m.con + prof}, ${dice} de daño (mitad si la supera).` });
    }
    const sneak = c.id === 'rogue' && ex.sneak_attack ? `${ex.sneak_attack.dice_count}d${ex.sneak_attack.dice_value}` : null;

    // Rasgos para mostrar en la ficha
    const features = [];
    for (let l = 1; l <= lv; l++) for (const f of c.levels[l - 1].features) {
      const info = D.features[f];
      if (info) features.push({ source: `${c.name} ${l}`, name: info.name, desc: info.desc });
    }
    for (const t of sp.traits) if (!/^(High Elf|Wood Elf|Drow|Forest Gnome|Rock Gnome)[:]|^(Dancing Lights|Darkness|Detect Magic|Faerie Fire|Longstrider|Misty Step|Pass without Trace)$/.test(t.name)) features.push({ source: sp.name, name: t.name, desc: t.desc });
    const sub = sp.subspecies.find((x) => x.id === sheet.subspecies);
    if (sub) for (const t of sub.traits) features.push({ source: sub.name, name: t.name, desc: t.desc });
    for (const f of feats) { const ft = D.byId.feats[f]; if (ft) features.push({ source: ft.typeName, name: ft.name, desc: ft.desc }); }
    if (asiLevels) features.push({ source: 'Juego', name: 'Mejora de característica automática', desc: `+${2 * asiLevels} a ${D.abilities.find((a) => a.id === main).name} (en este juego las mejoras de nivel 4, 8, 12, 16 y 19 se aplican solas a la característica principal).` });

    return {
      name: sheet.name, level: lv, xp, nextXp: lv < 20 ? D.xpTable[lv] : null, prof,
      className: c.name, speciesName: sub ? sub.name : sp.name, backgroundName: bg.name,
      score, mod: m, saves, skills, hp, ac, armorProf, speed, initiative: m.dex + (feats.includes('alert') ? prof : 0),
      passive: 10 + skills.find((k) => k.id === 'perception').bonus,
      attacks, casting, spells: spellList, actions, sneak, feats,
      halfling: sp.id === 'halfling', relentless: sp.id === 'orc', darkvision: { dwarf: 120, elf: 60, gnome: 60, orc: 120, tiefling: 60, dragonborn: 60 }[sp.id] || 0,
      hitDie: c.hitDie, features, shield: sheet.shield, armorName: armor ? armor.name : null,
      sizeName: sp.size, style: sheet.fightingStyle,
    };
  }

  // ======================================================================
  //  Personajes pregenerados (para empezar rápido)
  // ======================================================================
  const PRIORITY = {
    barbarian: ['str', 'con', 'dex', 'wis', 'cha', 'int'], bard: ['cha', 'dex', 'con', 'wis', 'int', 'str'],
    cleric: ['wis', 'con', 'str', 'dex', 'cha', 'int'], druid: ['wis', 'con', 'dex', 'int', 'cha', 'str'],
    fighter: ['str', 'con', 'dex', 'wis', 'int', 'cha'], monk: ['dex', 'wis', 'con', 'str', 'int', 'cha'],
    paladin: ['str', 'cha', 'con', 'wis', 'dex', 'int'], ranger: ['dex', 'wis', 'con', 'str', 'int', 'cha'],
    rogue: ['dex', 'con', 'int', 'wis', 'cha', 'str'], sorcerer: ['cha', 'con', 'dex', 'wis', 'int', 'str'],
    warlock: ['cha', 'con', 'dex', 'wis', 'int', 'str'], wizard: ['int', 'con', 'dex', 'wis', 'cha', 'str'],
  };
  const PREGEN = {
    barbarian: { bg: 'soldier', weapons: ['greataxe', 'handaxe'], armor: null },
    bard: { bg: 'acolyte', weapons: ['rapier', 'dagger'], armor: 'leather-armor', cantrips: ['vicious-mockery', 'starry-wisp'], spells: ['healing-word', 'dissonant-whispers', 'cure-wounds', 'thunderwave'] },
    cleric: { bg: 'acolyte', weapons: ['mace'], armor: 'chain-shirt', shield: true, cantrips: ['sacred-flame', 'light', 'thaumaturgy'], spells: ['guiding-bolt', 'cure-wounds', 'healing-word', 'inflict-wounds'] },
    druid: { bg: 'sage', weapons: ['quarterstaff', 'sickle'], armor: 'leather-armor', shield: true, cantrips: ['produce-flame', 'starry-wisp'], spells: ['cure-wounds', 'healing-word', 'thunderwave', 'ice-knife'] },
    fighter: { bg: 'soldier', weapons: ['longsword', 'longbow'], armor: 'chain-mail', shield: true, style: 'defense' },
    monk: { bg: 'criminal', weapons: ['shortsword', 'dart'], armor: null },
    paladin: { bg: 'soldier', weapons: ['longsword', 'javelin'], armor: 'chain-mail', shield: true, spells: ['cure-wounds', 'divine-favor'], style: 'defense' },
    ranger: { bg: 'soldier', weapons: ['longbow', 'scimitar'], armor: 'studded-leather-armor', spells: ['cure-wounds', 'hunters-mark'], style: 'archery' },
    rogue: { bg: 'criminal', weapons: ['rapier', 'shortbow'], armor: 'leather-armor' },
    sorcerer: { bg: 'acolyte', weapons: ['dagger', 'quarterstaff'], armor: null, cantrips: ['fire-bolt', 'ray-of-frost', 'shocking-grasp', 'sorcerous-burst'], spells: ['magic-missile', 'burning-hands'] },
    warlock: { bg: 'acolyte', weapons: ['dagger', 'quarterstaff'], armor: 'leather-armor', cantrips: ['eldritch-blast', 'chill-touch'], spells: ['hex', 'hellish-rebuke'] },
    wizard: { bg: 'sage', weapons: ['quarterstaff', 'dagger'], armor: null, cantrips: ['fire-bolt', 'ray-of-frost', 'shocking-grasp'], spells: ['magic-missile', 'burning-hands', 'thunderwave', 'shield'] },
  };

  function pregen(cls, species, opts = {}) {
    const c = D.byId.classes[cls] || D.byId.classes.fighter;
    const sp = D.byId.species[species] || D.byId.species.human;
    const p = PREGEN[c.id];
    const bg = D.byId.backgrounds[p.bg];
    const base = {};
    PRIORITY[c.id].forEach((a, i) => { base[a] = D.standardArray[i]; });
    const order = PRIORITY[c.id].filter((a) => bg.abilities.includes(a));
    const bonus = { [order[0]]: 2, [order[1]]: 1 };
    const skills = c.skillChoices.from.filter((k) => !bg.skills.includes(k)).slice(0, c.skillChoices.count);
    const lv = levelFromXp(opts.xp || 0);
    const row = c.levels[lv - 1];
    const maxL = c.spellcasting ? maxSpellLevel(c, lv) : 0;
    const pick = (wanted, level, n) => {
      const list = (wanted || []).filter((id) => SPELLS[id] && SPELLS[id].classes.includes(c.id) && (level === 0 ? SPELLS[id].level === 0 : SPELLS[id].level >= 1 && SPELLS[id].level <= maxL));
      const extra = Object.values(SPELLS).filter((s) => s.classes.includes(c.id) && (level === 0 ? s.level === 0 : s.level >= 1 && s.level <= maxL) && !list.includes(s.id))
        .sort((a, b) => (COMBAT_SPELLS[b.id] ? 1 : 0) - (COMBAT_SPELLS[a.id] ? 1 : 0) || b.level - a.level);
      return [...list, ...extra.map((s) => s.id)].slice(0, n);
    };
    const sheet = {
      name: opts.name || 'Aventurero', class: c.id, species: sp.id, background: bg.id,
      subspecies: sp.subspecies.length ? (opts.subspecies && sp.subspecies.some((x) => x.id === opts.subspecies) ? opts.subspecies : sp.subspecies[0].id) : null,
      method: 'standard', base, bonus, skills,
      speciesSkill: sp.id === 'elf' ? 'perception' : sp.id === 'human' ? (['perception', 'stealth', 'insight', 'athletics'].find((k) => !skills.includes(k) && !bg.skills.includes(k))) : null,
      humanFeat: sp.id === 'human' ? 'alert' : null,
      featChoice: {}, expertise: [], fightingStyle: p.style || (c.id === 'fighter' ? 'defense' : null),
      armor: p.armor, shield: !!p.shield, weapons: p.weapons,
      cantrips: c.spellcasting ? pick(p.cantrips, 0, row.cantrips) : [],
      spells: c.spellcasting ? pick(p.spells, 1, row.prepared) : [],
      alignment: 'neutral-good', look: opts.look || { skin: 0, hair: 0 },
    };
    if (bg.feat.id === 'magic-initiate') {
      const cls2 = (bg.feat.note || 'wizard').toLowerCase();
      const can = Object.values(SPELLS).filter((s) => s.level === 0 && s.classes.includes(cls2)).sort((a, b) => (COMBAT_SPELLS[b.id] ? 1 : 0) - (COMBAT_SPELLS[a.id] ? 1 : 0)).filter((s) => !sheet.cantrips.includes(s.id)).slice(0, 2).map((s) => s.id);
      const one = Object.values(SPELLS).filter((s) => s.level === 1 && s.classes.includes(cls2)).sort((a, b) => (COMBAT_SPELLS[b.id] ? 1 : 0) - (COMBAT_SPELLS[a.id] ? 1 : 0))[0];
      sheet.featChoice.magicInitiate = { cls: cls2, cantrips: can, spell: one ? one.id : null };
    }
    if (c.id === 'rogue') sheet.expertise = [...bg.skills, ...skills].filter((k) => ['stealth', 'perception', 'sleight-of-hand', 'acrobatics', 'deception'].includes(k)).slice(0, 2);
    if (sheet.expertise.length < 2 && c.id === 'rogue') sheet.expertise = [...bg.skills, ...skills].slice(0, 2);
    if ((c.id === 'paladin' || c.id === 'ranger') && lv < 2) sheet.fightingStyle = null;
    const v = validate(sheet, opts.xp || 0);
    return v.sheet;
  }

  // Al subir de nivel: conserva lo elegido y rellena lo nuevo (trucos, conjuros, estilo de combate)
  function refresh(sheet, xp) {
    const v = validate(sheet, xp);
    if (v.ok) return v.sheet;
    const c = D.byId.classes[sheet.class];
    if (!c) return pregen('fighter', 'human', { xp });
    const p = pregen(sheet.class, sheet.species, { name: sheet.name, look: sheet.look, xp, subspecies: sheet.subspecies });
    const row = c.levels[levelFromXp(xp) - 1];
    const merged = Object.assign({}, sheet, {
      fightingStyle: sheet.fightingStyle || p.fightingStyle,
      cantrips: [...new Set([...(sheet.cantrips || []), ...p.cantrips])].slice(0, row.cantrips),
      spells: [...new Set([...(sheet.spells || []), ...p.spells])].slice(0, row.prepared),
    });
    const v2 = validate(merged, xp);
    return v2.ok ? v2.sheet : p;
  }

  // ======================================================================
  //  Monstruos: cómo atacan en el juego
  // ======================================================================
  const WORD_NUM = { one: 1, two: 2, three: 3, four: 4, five: 5 };
  function monsterCombat(mon) {
    const attacks = [];
    for (const a of mon.actions || []) {
      if (a.hit == null || !a.dmg || !a.dmg.length) continue;
      const reach = /reach (\d+) ft/.exec(a.desc);
      const range = /range (\d+)(?:\/(\d+))? ft/.exec(a.desc);
      // daño principal (los extras condicionales, "if the attack roll had Advantage", no se cuentan)
      const main = a.dmg[0];
      attacks.push({ name: a.name, hit: a.hit, dice: main[0], type: main[1], melee: !!reach || (!range && /Melee/.test(a.desc)), reach: reach ? parseInt(reach[1], 10) : 5, range: range ? parseInt(range[1], 10) : 0 });
    }
    let multi = 1;
    const ma = (mon.actions || []).find((a) => a.name === 'Multiattack');
    if (ma) { const w = /makes (one|two|three|four|five)/i.exec(ma.desc); if (w) multi = WORD_NUM[w[1].toLowerCase()] || 1; }
    if (!attacks.length) attacks.push({ name: 'Golpe', hit: mon.pb + Math.max(mod(mon.str), mod(mon.dex)), dice: `1d6+${Math.max(0, mod(mon.str))}`, type: 'bludgeoning', melee: true, reach: 5, range: 0 });
    const saves = {};
    for (const a of ABIL) saves[a] = mod(mon[a]);
    for (const [name, v] of mon.profs || []) { const mm = /^ST (\w{3})/.exec(name); if (mm) saves[mm[1].toLowerCase()] = v; }
    return { attacks, multi, saves };
  }

  const RULES = {
    setData, get data() { return D; }, get spells() { return SPELLS; },
    ABIL, roll, scaleDice, mod, fmt, levelFromXp, profForLevel, cantripTier, tiles,
    validate, derive, pregen, refresh, monsterCombat, COMBAT_SPELLS, INNATE,
  };

  if (typeof module !== 'undefined' && module.exports) {
    setData(require('./core.json'), require('./spells.json'));
    module.exports = RULES;
  } else {
    root.RULES = RULES;
  }
})(this);
