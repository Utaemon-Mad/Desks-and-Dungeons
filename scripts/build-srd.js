// Convierte el SRD 5.2 (reglas de 2024) del proyecto 5e-bits/5e-srd-api en ficheros compactos para el juego.
//
// Uso:
//   git clone --depth 1 https://github.com/5e-bits/5e-srd-api /tmp/5e-srd-api
//   node scripts/build-srd.js /tmp/5e-srd-api/packages/5e-database/src/2024/en
//
// Escribe public/rules/core.json, spells.json, monsters.json e items.json.
// El contenido del SRD 5.2 es de Wizards of the Coast LLC con licencia CC-BY-4.0 (ver public/rules/LICENSE-SRD.md).
const fs = require('fs');
const path = require('path');
const ES = require('./srd-es.js');

const src = process.argv[2];
if (!src || !fs.existsSync(path.join(src, '5e-SRD-Spells.json'))) {
  console.error('Indica la carpeta src/2024/en del repositorio 5e-srd-api.');
  process.exit(1);
}
const OUT = path.join(__dirname, '..', 'public', 'rules');
fs.mkdirSync(OUT, { recursive: true });

const load = (name) => JSON.parse(fs.readFileSync(path.join(src, `5e-SRD-${name}.json`), 'utf8'));
const parse = (v) => (typeof v === 'string' ? JSON.parse(v) : v);
const missing = [];
const es = (table, key, fallback) => {
  const v = ES[table][key];
  if (v === undefined) { missing.push(`${table}:${key}`); return fallback; }
  return v;
};
const clean = (s) => (s || '').replace(/\r/g, '').replace(/\n {2,}/g, '\n').trim();
const cats = (x) => (x.equipment_categories || []).map((c) => c.index);

// ---------- Básicos ----------
const abilities = load('Ability-Scores').map((a) => ({ id: a.index, abbr: ES.abilities[a.index][0], name: ES.abilities[a.index][1], en: a.full_name, desc: a.description }));
const skills = load('Skills').map((s) => ({ id: s.index, name: es('skills', s.index, s.name), en: s.name, ability: s.ability_score.index, desc: s.description }));
const conditions = load('Conditions').map((c) => ({ id: c.index, name: es('conditions', c.index, c.name), en: c.name, desc: clean(c.description) }));
const schools = load('Magic-Schools').map((s) => ({ id: s.index, name: es('schools', s.index, s.name), en: s.name, desc: s.description }));
const damageTypes = load('Damage-Types').map((d) => ({ id: d.index, name: es('damage', d.index, d.name), en: d.name, desc: d.description }));
const alignments = load('Alignments').map((a) => ({ id: a.index, name: ES.alignments[a.index] || a.name, en: a.name, abbr: a.abbreviation }));
const languages = load('Languages').map((l) => ({ id: l.index, name: l.name, rare: !!l.is_rare }));
const properties = load('Weapon-Properties').map((p) => ({ id: p.index, name: es('properties', p.index, p.name), en: p.name, desc: clean(p.description) }));
const masteries = load('Weapon-Mastery-Properties').map((p) => ({ id: p.index, name: es('mastery', p.index, p.name), en: p.name, desc: clean(p.description) }));

// ---------- Especies ----------
const traits = load('Traits');
const subspecies = load('Subspecies');
const species = load('Species').map((s) => ({
  id: s.index, name: es('species', s.index, s.name), en: s.name, size: s.size, speed: s.speed, type: s.type,
  traits: traits.filter((t) => (t.species || []).some((x) => x.index === s.index)).map((t) => ({ id: t.index, name: t.name, desc: clean(t.description) })),
  subspecies: subspecies.filter((x) => x.species.index === s.index).map((x) => ({
    id: x.index, name: es('subspecies', x.index, x.name), en: x.name, damage: x.damage_type ? x.damage_type.index : null,
    traits: (x.traits || []).map((t) => { const full = traits.find((y) => y.index === t.index); return { id: t.index, name: t.name, desc: full ? clean(full.description) : '' }; }),
  })),
}));

// ---------- Trasfondos y dotes ----------
const feats = load('Feats').map((f) => ({ id: f.index, name: es('feats', f.index, f.name), en: f.name, type: f.type, typeName: ES.featTypes[f.type] || f.type, desc: clean(f.description) }));
const backgrounds = load('Backgrounds').map((b) => ({
  id: b.index, name: es('backgrounds', b.index, b.name), en: b.name,
  abilities: b.ability_scores.map((a) => a.index),
  feat: { id: b.feat.index, note: b.feat.note || null },
  skills: b.proficiencies.filter((p) => p.index.startsWith('skill-')).map((p) => p.index.replace('skill-', '')),
  tools: b.proficiencies.filter((p) => !p.index.startsWith('skill-')).map((p) => p.name.replace(/^Tool: /, '')),
  equipment: (b.equipment_options || []).map((o) => o.desc),
}));

// ---------- Equipo ----------
const equipment = load('Equipment');
const weapons = equipment.filter((e) => cats(e).includes('weapons')).map((w) => ({
  id: w.index, name: es('weapons', w.index, w.name), en: w.name,
  category: cats(w).includes('martial-weapons') ? 'martial' : 'simple',
  kind: cats(w).includes('ranged-weapons') ? 'ranged' : 'melee',
  damage: w.damage ? w.damage.damage_dice : null, type: w.damage ? w.damage.damage_type.index : null,
  versatile: w.two_handed_damage ? w.two_handed_damage.damage_dice : null,
  range: w.range ? [w.range.normal, w.range.long || null] : null,
  thrown: w.throw_range ? [w.throw_range.normal, w.throw_range.long] : null,
  properties: (w.properties || []).map((p) => p.index),
  mastery: w.mastery ? w.mastery.index : null,
  cost: w.cost ? `${w.cost.quantity} ${w.cost.unit}` : '', weight: w.weight || 0,
}));
const armor = equipment.filter((e) => cats(e).includes('armor')).map((a) => {
  const c = cats(a);
  return {
    id: a.index, name: es('armor', a.index, a.name), en: a.name,
    kind: c.includes('shields') || a.index === 'shield' ? 'shield' : c.includes('heavy-armor') ? 'heavy' : c.includes('medium-armor') ? 'medium' : 'light',
    base: a.armor_class ? a.armor_class.base : 0, dex: a.armor_class ? !!a.armor_class.dex_bonus : false,
    maxDex: a.armor_class && a.armor_class.max_bonus != null ? a.armor_class.max_bonus : null,
    str: a.str_minimum || 0, stealth: !!a.stealth_disadvantage,
    cost: a.cost ? `${a.cost.quantity} ${a.cost.unit}` : '', weight: a.weight || 0,
  };
});
// Corrección: en el SRD 5.2 la armadura de pieles es armadura intermedia (CA 12 + Des, máx. 2)
for (const a of armor) if (a.id === 'hide-armor') { a.kind = 'medium'; a.maxDex = 2; }
const gear = equipment.filter((e) => !cats(e).includes('weapons') && !cats(e).includes('armor')).map((g) => ({
  id: g.index, name: g.name, cats: cats(g), cost: g.cost ? `${g.cost.quantity} ${g.cost.unit}` : '', weight: g.weight || 0,
  desc: clean(Array.isArray(g.description) ? g.description.join('\n') : g.description || ''),
}));

// ---------- Clases ----------
const levels = load('Levels').filter((l) => !l.subclass);
const features = load('Features');
const subclasses = load('Subclasses');
const SPELL_KEYS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const classes = load('Classes').map((c) => {
  const profs = c.proficiencies.map((p) => p.index);
  const choice = parse(c.proficiency_choices)[0];
  const skillOpts = choice.from.options ? choice.from.options.map((o) => (o.item ? o.item.index.replace('skill-', '') : null)).filter(Boolean) : skills.map((s) => s.id);
  const sc = c.spellcasting ? parse(c.spellcasting) : null;
  const lv = levels.filter((l) => l.class.index === c.index).sort((a, b) => a.level - b.level);
  return {
    id: c.index, name: es('classes', c.index, c.name), en: c.name, hitDie: c.hit_die,
    primary: c.primary_ability.ability_scores
      ? c.primary_ability.ability_scores.map((a) => a.index)
      : c.primary_ability.ability_score_options.from.options.map((o) => o.item.index),
    primaryOr: !c.primary_ability.ability_scores,
    saves: c.saving_throws.map((s) => s.index),
    armor: profs.filter((p) => /armor|shields/.test(p)),
    weapons: profs.filter((p) => /weapons$/.test(p) || ['scimitars', 'shortswords', 'hand-crossbows', 'longswords', 'rapiers', 'whips'].includes(p)),
    tools: profs.filter((p) => /tool|kit/.test(p)),
    skillChoices: { count: choice.choose, from: skillOpts.length ? skillOpts : skills.map((s) => s.id), desc: choice.desc },
    equipment: parse(c.starting_equipment_options).map((o) => o.desc),
    spellcasting: sc ? { ability: sc.spellcasting_ability.index, level: sc.level } : null,
    levels: lv.map((l) => ({
      level: l.level, prof: l.prof_bonus, features: (l.features || []).map((f) => f.index),
      cantrips: l.spellcasting ? l.spellcasting.cantrips_known || 0 : 0,
      prepared: l.spellcasting ? l.spellcasting.prepared_spells || 0 : 0,
      slots: l.spellcasting ? SPELL_KEYS.map((k) => l.spellcasting[`spell_slots_level_${k}`] || 0) : [0, 0, 0, 0, 0, 0, 0, 0, 0],
      extra: l.class_specific || null,
    })),
    subclasses: subclasses.filter((s) => s.class.index === c.index).map((s) => ({ id: s.index, name: s.name, summary: clean(s.summary || ''), desc: clean(s.description || '') })),
  };
});
const featureMap = {};
for (const f of features) featureMap[f.index] = { name: f.name, level: f.level ? parseInt(String(f.level.name).replace(/\D+/g, ''), 10) || null : null, class: f.class ? f.class.index : null, desc: clean(f.description) };

// Tabla oficial de avance de personaje (SRD 5.2)
const xpTable = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];

const core = {
  source: 'System Reference Document 5.2 (SRD 5.2) · Wizards of the Coast LLC · CC-BY-4.0',
  abilities, skills, conditions, schools, damageTypes, alignments, languages, properties, masteries,
  species, backgrounds, feats, classes, features: featureMap, weapons, armor, gear, xpTable,
  sizes: ES.sizes, monsterTypes: ES.monsterTypes, rarity: ES.rarity,
  pointBuy: { budget: 27, cost: { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 } },
  standardArray: [15, 14, 13, 12, 10, 8],
};

// ---------- Conjuros ----------
const spells = load('Spells').map((s) => ({
  id: s.index, name: ES.spells[s.index] || s.name, en: s.name, level: s.level, school: s.school.index,
  classes: s.classes.map((c) => c.index), time: s.casting_time, ritual: !!s.ritual,
  range: String(s.range).replace(/ Component.*$/, ''), components: s.components, material: s.material || null,
  duration: s.duration, concentration: !!s.concentration, attack: s.attack_type || null,
  damageType: s.damage && s.damage.damage_type ? s.damage.damage_type.index : null,
  desc: clean(s.description), higher: s.higher_level ? clean(s.higher_level) : null,
})).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name, 'es'));

// ---------- Monstruos ----------
const block = (arr) => (arr || []).map((a) => {
  const o = { name: a.name, desc: clean(a.desc) };
  if (a.attack_bonus != null) o.hit = a.attack_bonus;
  if (a.damage && a.damage.length) o.dmg = a.damage.filter((d) => d.damage_dice).map((d) => [d.damage_dice, d.damage_type ? d.damage_type.index : null]);
  return o;
});
const monsters = load('Monsters').map((m) => ({
  id: m.index, name: ES.monsters[m.index] || m.name, en: m.name, size: m.size, type: m.type, alignment: m.alignment,
  ac: (m.armor_class && m.armor_class[0]) ? m.armor_class[0].value : 10,
  acNote: (m.armor_class && m.armor_class[0] && m.armor_class[0].armor) ? m.armor_class[0].armor.map((a) => a.name).join(', ') : '',
  hp: m.hit_points, hd: m.hit_points_roll || m.hit_dice, speed: m.speed,
  str: m.strength, dex: m.dexterity, con: m.constitution, int: m.intelligence, wis: m.wisdom, cha: m.charisma,
  profs: (m.proficiencies || []).map((p) => [p.proficiency.name.replace('Saving Throw: ', 'ST ').replace('Skill: ', ''), p.value]),
  resist: m.damage_resistances || [], immune: m.damage_immunities || [], vulnerable: m.damage_vulnerabilities || [],
  condImmune: (m.condition_immunities || []).map((c) => c.index || c),
  senses: m.senses || {}, languages: m.languages || '', cr: m.challenge_rating, xp: m.xp || 0, pb: m.proficiency_bonus || 2,
  traits: block(m.special_abilities), actions: block(m.actions), bonus: block(m.bonus_actions),
  reactions: block(m.reactions), legendary: block(m.legendary_actions), gear: m.gear || '',
})).sort((a, b) => a.cr - b.cr || a.name.localeCompare(b.name, 'es'));

// ---------- Objetos mágicos ----------
const items = load('Magic-Items').filter((i) => !i.variant).map((i) => ({
  id: i.index, name: i.name, category: i.equipment_category ? i.equipment_category.name : '',
  rarity: i.rarity ? i.rarity.name : '', attunement: !!i.attunement, desc: clean(Array.isArray(i.desc) ? i.desc.join('\n') : i.desc || ''),
})).sort((a, b) => a.name.localeCompare(b.name));

const write = (name, data) => {
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(data));
  console.log(`${name}: ${(fs.statSync(path.join(OUT, name)).size / 1024).toFixed(0)} KB`);
};
write('core.json', core);
write('spells.json', spells);
write('monsters.json', monsters);
write('items.json', items);
console.log(`${classes.length} clases, ${species.length} especies, ${backgrounds.length} trasfondos, ${feats.length} dotes, ${weapons.length} armas, ${armor.length} armaduras, ${spells.length} conjuros, ${monsters.length} monstruos, ${items.length} objetos mágicos`);
const untranslatedSpells = spells.filter((s) => s.name === s.en).length;
console.log(`Conjuros con nombre en español: ${spells.length - untranslatedSpells}/${spells.length}`);
if (missing.length) console.log('Sin traducción:', [...new Set(missing)].join(', '));
const unknownSpellKeys = Object.keys(ES.spells).filter((k) => !spells.some((s) => s.id === k));
const unknownMonsterKeys = Object.keys(ES.monsters).filter((k) => !monsters.some((m) => m.id === k));
if (unknownSpellKeys.length) console.log('Traducciones de conjuros que no existen en el SRD:', unknownSpellKeys.join(', '));
if (unknownMonsterKeys.length) console.log('Traducciones de monstruos que no existen en el SRD:', unknownMonsterKeys.join(', '));
