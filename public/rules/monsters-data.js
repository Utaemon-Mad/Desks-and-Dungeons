// Tablas de monstruos y de temas de mazmorra (las usan engine.js en el servidor y en el navegador).
// Para añadir un enemigo basta una fila en MONSTERS (y su modelo en models-creatures.js si es nuevo).
// sets: 'todas' = piezas de conjunto de todas las clases (lo resuelve engine.js)
(function (root) {
  'use strict';
  const MONSTERS = {
    // el mímico no sale en ninguna sala: aparece al abrir algunos cofres
    'mimico':          { name: 'Mímico', fam: 'bestia', sprite: 'mimic', hp: 60, dmg: [4, 8], armor: 5, ms: 380, atk: 1500, xp: 30, gold: [10, 25] },
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
    'zombi-hinchado':  { name: 'Zombi hinchado', fam: 'muerto', sprite: 'zombie', bloated: true, scale: 1.1, hp: 52, dmg: [3, 6], armor: 1, ms: 560, atk: 1700, xp: 14, gold: [2, 5], undead: true, explode: true, minLevel: 2 },
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
    'retono':          { name: 'Retoño corrupto', fam: 'bestia', sprite: 'ent', scale: 0.82, tint: '#6a5a3a', hp: 40, dmg: [3, 6], armor: 3, ms: 340, atk: 1400, regen: 1, xp: 16, gold: [2, 5], minLevel: 2 },
    'fuego-fatuo':     { name: 'Fuego fatuo', fam: 'muerto', sprite: 'specter', tint: '#9aff9a', hp: 20, dmg: [3, 6], armor: 0, ms: 250, atk: 2000, magic: true, range: 5, proj: 'bolt', ai: 'ranged', xp: 12, gold: [2, 5], minLevel: 3 },
    'owlbear':         { name: 'Osolechuza', fam: 'bestia', sprite: 'owlbear', hp: 115, dmg: [6, 11], armor: 4, ms: 330, atk: 1600, xp: 50, gold: [8, 16], minLevel: 5 },
    'bandit':          { name: 'Bandido', fam: 'humano', sprite: 'hero:picaro', hp: 24, dmg: [2, 5], armor: 2, ms: 310, atk: 1300, xp: 9, gold: [3, 8] },
    'bandit-archer':   { name: 'Bandido arquero', fam: 'humano', sprite: 'hero:explorador', hp: 18, dmg: [2, 5], armor: 1, ms: 310, atk: 2000, range: 6, proj: 'arrow', ai: 'ranged', xp: 10, gold: [3, 8] },
    'bandit-captain':  { name: 'Capitán bandido', fam: 'humano', sprite: 'hero:guerrero', hp: 70, dmg: [5, 9], armor: 5, ms: 310, atk: 1400, xp: 30, gold: [12, 25] },
    'cultist':         { name: 'Sectario', fam: 'humano', sprite: 'hero:mago', hp: 22, dmg: [3, 6], armor: 1, ms: 330, atk: 2200, range: 5, proj: 'fire', magic: true, ai: 'ranged', xp: 11, gold: [3, 8] },
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
    // Abismo infernal: diablillos, canes del infierno, gárgolas y demonios
    'diablillo':       { name: 'Diablillo', fam: 'demonio', sprite: 'imp', scale: 0.62, hp: 15, dmg: [2, 4], armor: 1, ms: 240, atk: 1800, range: 5, proj: 'fire', magic: true, ai: 'ranged', xp: 8, gold: [1, 4] },
    'can-infernal':    { name: 'Can infernal', fam: 'demonio', sprite: 'hellhound', tint: '#3a1410', eyes: '#ff5a1a', scale: 1.15, hp: 30, dmg: [3, 6], armor: 2, ms: 210, atk: 1200, xp: 12, gold: [1, 3], minLevel: 2 },
    'gargola':         { name: 'Gárgola', fam: 'demonio', sprite: 'gargoyle', scale: 1.05, hp: 52, dmg: [4, 7], armor: 9, ms: 360, atk: 1500, xp: 20, gold: [3, 8], minLevel: 3 },
    'brujo-infernal':  { name: 'Brujo del abismo', fam: 'demonio', sprite: 'hero:mago', tint: '#3a0808', hp: 40, dmg: [4, 7], armor: 2, ms: 360, atk: 2300, range: 6, proj: 'fire', magic: true, ai: 'summoner', summons: 'diablillo', xp: 34, gold: [6, 14], minLevel: 3 },
    'demonio':         { name: 'Demonio', fam: 'demonio', sprite: 'demon', scale: 1.3, hp: 80, dmg: [6, 10], armor: 5, ms: 320, atk: 1500, xp: 32, gold: [5, 12], minLevel: 4 },
    'rufo':            { name: 'Rufo, el jefe bandido', fam: 'humano', sprite: 'hero:guerrero', scale: 1.3, boss: true, hp: 180, dmg: [4, 7], armor: 4, ms: 320, atk: 1400, xp: 70, gold: [30, 50], specials: ['charge', 'summon'], summons: 'bandit', sets: ['picaro', 'explorador'] },
    'huargo-alfa':     { name: 'El Huargo Alfa', fam: 'bestia', sprite: 'wolf', tint: '#3a3a42', scale: 1.7, boss: true, hp: 260, dmg: [5, 9], armor: 4, ms: 230, atk: 1300, xp: 110, gold: [40, 70], specials: ['slam', 'summon'], summons: 'wolf', sets: ['explorador', 'guerrero'] },
    'bruja-pantano':   { name: 'Ortiga, la Bruja del Pantano', fam: 'muerto', sprite: 'necromancer', tint: '#3a8a3a', scale: 1.35, boss: true, hp: 280, dmg: [5, 9], armor: 3, ms: 360, atk: 1900, range: 6, proj: 'bolt', magic: true, xp: 140, gold: [50, 90], specials: ['nova', 'summon', 'volley'], summons: 'ahogado', sets: ['druida', 'mago', 'sacerdote'] },
    'rey-escorpion':   { name: 'El Rey Escorpión', fam: 'bestia', sprite: 'spider', tint: '#d8a030', scale: 2.3, boss: true, hp: 340, dmg: [6, 11], armor: 8, ms: 280, atk: 1300, poison: true, xp: 170, gold: [60, 110], specials: ['slam', 'summon', 'volley'], summons: 'escorpion', sets: ['picaro', 'guerrero', 'paladin'] },
    'gigante-escarcha': { name: 'El Gigante de Escarcha', fam: 'orco', sprite: 'ogre', tint: '#9ac0e8', scale: 1.8, boss: true, hp: 420, dmg: [8, 13], armor: 8, ms: 420, atk: 1800, xp: 210, gold: [80, 130], specials: ['slam', 'nova', 'charge'], sets: ['guerrero', 'paladin', 'sacerdote'] },
    // Jefes de mazmorra: botín de conjuntos de varias clases
    'rey-goblin':      { name: 'Grubnak, el Rey Goblin', fam: 'goblin', sprite: 'shaman', scale: 1.55, tint: '#c8a030', boss: true, hp: 240, dmg: [4, 8], armor: 5, ms: 340, atk: 1400, xp: 90, gold: [40, 70], specials: ['slam', 'summon'], summons: 'goblin-warrior', sets: ['explorador', 'picaro', 'guerrero'] },
    'gorthak':         { name: 'Gorthak, Señor de la Guerra', fam: 'orco', sprite: 'warchief', scale: 1.45, boss: true, hp: 320, dmg: [6, 11], armor: 7, ms: 330, atk: 1500, xp: 120, gold: [50, 90], specials: ['slam', 'charge', 'summon'], summons: 'orc', sets: ['guerrero', 'paladin', 'sacerdote'] },
    'lich':            { name: 'Malakar, el Liche', fam: 'muerto', sprite: 'lich', scale: 1.4, boss: true, hp: 260, dmg: [5, 9], armor: 4, ms: 380, atk: 1900, range: 6, proj: 'necro', magic: true, xp: 120, gold: [50, 90], undead: true, specials: ['nova', 'volley', 'summon'], summons: 'skeleton', sets: ['mago', 'druida', 'sacerdote'] },
    'reina-arana':     { name: 'Arakhna, la Reina Araña', fam: 'bestia', sprite: 'spider', scale: 2, tint: '#5a2a6a', boss: true, hp: 280, dmg: [5, 10], armor: 5, ms: 280, atk: 1300, poison: true, xp: 110, gold: [45, 80], specials: ['volley', 'summon', 'slam'], summons: 'giant-spider', sets: ['picaro', 'explorador', 'druida'] },
    // jefes de mundo (aparecen en el mundo abierto cada cierto tiempo; mucha vida, para pelear en grupo)
    'coloso-runas':    { name: 'El Coloso de las Runas', fam: 'orco', sprite: 'ogre', tint: '#7a8aa8', scale: 2.3, boss: true, world: true, hp: 900, dmg: [7, 12], armor: 10, ms: 430, atk: 1800, xp: 500, gold: [150, 260], specials: ['slam', 'nova', 'charge'], sets: 'todas' },
    'nyxara':          { name: 'Nyxara, Dragona de las Sombras', fam: 'dragon', sprite: 'dragon', tint: '#3a2a7a', scale: 1.7, boss: true, world: true, hp: 820, dmg: [7, 12], armor: 8, ms: 360, atk: 1600, xp: 520, gold: [160, 280], specials: ['breath', 'nova', 'summon'], summons: 'specter', sets: 'todas' },
    'rey-espectral':   { name: 'El Rey Espectral', fam: 'muerto', sprite: 'lich', tint: '#2a6aff', scale: 2, boss: true, world: true, hp: 760, dmg: [6, 11], armor: 6, ms: 380, atk: 1800, range: 6, proj: 'necro', magic: true, undead: true, xp: 500, gold: [150, 260], specials: ['nova', 'volley', 'summon'], summons: 'wight', sets: 'todas' },
    'ent-corrupto':    { name: 'Raízmadre, el Ent Corrupto', fam: 'bestia', sprite: 'ent', scale: 1.9, tint: '#4a3a24', boss: true, hp: 300, dmg: [6, 11], armor: 7, ms: 360, atk: 1500, regen: 2, xp: 120, gold: [50, 90], specials: ['slam', 'summon', 'volley'], summons: 'retono', sets: ['druida', 'explorador', 'guerrero'] },
    'behemot':         { name: 'Behemot del Bosque Viejo', fam: 'bestia', sprite: 'bear', tint: '#2e4a1e', scale: 2.4, boss: true, world: true, hp: 950, dmg: [7, 13], armor: 9, ms: 300, atk: 1500, xp: 520, gold: [150, 260], specials: ['slam', 'charge', 'summon'], summons: 'dire-wolf', sets: 'todas' },
    'azaroth':         { name: 'Azaroth, Señor del Abismo', fam: 'demonio', sprite: 'demon', scale: 1.85, boss: true, hp: 360, dmg: [6, 11], armor: 7, ms: 330, atk: 1500, xp: 150, gold: [60, 110], specials: ['slam', 'nova', 'summon'], summons: 'diablillo', sets: ['mago', 'picaro', 'paladin'] },
    'young-red-dragon': { name: 'Ignaroth, el Dragón Rojo', fam: 'dragon', sprite: 'dragon', scale: 1.3, boss: true, hp: 400, dmg: [7, 12], armor: 8, ms: 360, atk: 1600, xp: 160, gold: [80, 140], specials: ['breath', 'slam', 'summon'], summons: 'kobold', sets: 'todas' },
  };
  // Claves de versiones anteriores
  const LEGACY_MONSTER = { 'goblin-boss': 'goblin-shaman', goblin: 'goblin-warrior', shaman: 'goblin-shaman', warchief: 'orc-war-chief', ghast: 'ghoul', 'ogre-zombie': 'zombie', wraith: 'specter', 'hobgoblin-captain': 'hobgoblin-warrior' };

  const THEMES = {
    cuevas:    { name: 'Cuevas goblin', icon: '🪓', mobs: ['goblin-warrior', 'goblin-warrior', 'goblin-minion', 'goblin-archer', 'goblin-archer', 'goblin-shaman', 'hobgoblin-warrior', 'bugbear-warrior', 'wolf'], boss: 'rey-goblin', names: ['Madriguera', 'Cuevas', 'Túneles', 'Guarida'], of: ['de los Dientes Rotos', 'del Rey Goblin', 'de la Oreja Cortada', 'del Hongo Negro'] },
    cripta:    { name: 'Cripta de los no muertos', icon: '💀', mobs: ['skeleton', 'skeleton', 'skeleton-archer', 'zombie', 'zombie', 'zombie', 'zombi-hinchado', 'ghoul', 'specter', 'wight', 'mummy', 'necromancer'], boss: 'lich', names: ['Cripta', 'Catacumbas', 'Osario', 'Mausoleo'], of: ['del Liche', 'de los Olvidados', 'de la Plaga', 'del Último Rezo'] },
    fortaleza: { name: 'Fortaleza orca', icon: '🏰', mobs: ['orc', 'orc', 'orc-archer', 'orc-shaman', 'hobgoblin-warrior', 'ogre', 'troll'], boss: 'gorthak', names: ['Fortaleza', 'Bastión', 'Fuerte', 'Ciudadela'], of: ['de la Mano Roja', 'de Gorthak', 'del Cráneo Partido', 'de Hierro Negro'] },
    nido:      { name: 'Nido de bestias', icon: '🕷️', mobs: ['giant-spider', 'giant-spider', 'wolf', 'wolf', 'dire-wolf', 'brown-bear', 'owlbear'], boss: 'reina-arana', names: ['Nido', 'Cubil', 'Madriguera', 'Bosque Hueco'], of: ['de la Reina Araña', 'de las Mil Patas', 'de la Seda Negra'] },
    volcan:    { name: 'Guarida del dragón', icon: '🐉', mobs: ['kobold', 'kobold', 'cultist', 'cultist', 'bandit', 'bandit-archer', 'ogre'], boss: 'young-red-dragon', names: ['Guarida', 'Forja', 'Caldera', 'Templo'], of: ['de Ignaroth', 'de Ceniza', 'de la Llama Eterna'] },
    bosque:    { name: 'Bosque umbrío', icon: '🌲', mobs: ['wolf', 'wolf', 'retono', 'retono', 'giant-spider', 'bandit', 'bandit-archer', 'fuego-fatuo', 'dire-wolf', 'brown-bear', 'owlbear'], boss: 'ent-corrupto', names: ['Bosque', 'Arboleda', 'Espesura', 'Floresta'], of: ['de Raízmadre', 'de los Susurros', 'del Musgo Negro', 'de las Luciérnagas'] },
    abismo:    { name: 'Abismo infernal', icon: '😈', mobs: ['diablillo', 'diablillo', 'diablillo', 'can-infernal', 'can-infernal', 'gargola', 'brujo-infernal', 'demonio', 'zombie'], boss: 'azaroth', names: ['Abismo', 'Sima', 'Fosa', 'Puerta'], of: ['de Azaroth', 'del Fuego Negro', 'de los Condenados', 'del Averno'] },
  };
  // Lo que dicen los jefes al aparecer (intro) y al enfurecerse a media vida (rage)
  const BOSS_LINES = {
    'rufo': { intro: '«¿Más bolsas de oro con patas? Muchachos, ¡a cobrar el peaje!»', rage: '«¡Basta de juegos! ¡Que no salga nadie vivo de aquí!»' },
    'huargo-alfa': { intro: 'Un aullido hiela la sangre: la manada entera responde desde las sombras.', rage: 'El Alfa enseña los colmillos y llama a toda su manada.' },
    'bruja-pantano': { intro: '«Ah, carne fresca para mi caldero… y huesos para mis ahogados.»', rage: '«¡Levantaos, hijos del cieno! ¡Arrastradlos al fondo!»' },
    'rey-escorpion': { intro: 'La arena tiembla. Una cola de aguijón asoma, goteando veneno.', rage: 'El Rey Escorpión chasquea las pinzas y la arena se llena de crías.' },
    'gigante-escarcha': { intro: '«Pequeñas cosas calientes… os dejaré congeladas para el invierno.»', rage: 'El aire se vuelve hielo: el Gigante ruge y golpea el suelo.' },
    'rey-goblin': { intro: '«¡Grubnak manda! ¡Todo lo brillante es de Grubnak!»', rage: '«¡Grubnak enfadado! ¡A ellos, inútiles, a ellos!»' },
    'gorthak': { intro: '«Gorthak ha roto cien escudos. El tuyo será el ciento uno.»', rage: '«¡SANGRE Y HIERRO! ¡La Mano Roja no retrocede!»' },
    'lich': { intro: '«He esperado mil años en este silencio. Unos minutos más no importan… para mí.»', rage: '«Vuestras almas alimentarán mi filacteria. ¡Levantaos, mis siervos!»' },
    'reina-arana': { intro: 'De las vigas cuelgan capullos que aún se mueven. Arakhna desciende por su hilo.', rage: 'La Reina chilla y de la seda brotan cientos de patas.' },
    'coloso-runas': { intro: 'Las runas del Coloso se encienden una a una. Algo muy viejo despierta.', rage: 'Las runas arden al rojo: el Coloso ya no se contiene.' },
    'nyxara': { intro: '«Habéis venido a mi sombra. Ninguna luz os seguirá dentro.»', rage: '«¡Que la noche os trague a todos!»' },
    'rey-espectral': { intro: 'Una corona sin cabeza flota en el frío. El Rey Espectral reclama su trono.', rage: '«¡De rodillas ante vuestro rey!»' },
    'ent-corrupto': { intro: '«Este bosque era mío antes que vuestros abuelos… y lo será después de vuestros nietos.»', rage: 'Raízmadre cruje y el suelo se abre: los retoños brotan a sus pies.' },
    'behemot': { intro: 'Los árboles se apartan. El Behemot del Bosque Viejo os ha olido.', rage: 'El Behemot se alza sobre sus patas traseras y brama.' },
    'azaroth': { intro: '«Mortales en mi abismo. Qué ofrenda tan… inesperada.»', rage: '«¡Ardéis ya y aún no lo sabéis! ¡Venid, mis diablillos!»' },
    'young-red-dragon': { intro: '«Oro, ascuas y huesos. Mi tesoro crece cada día. Hoy, con vosotros.»', rage: 'Ignaroth abre las alas y el calor se vuelve insoportable.' },
  };
  // Historia de cada tipo de mazmorra: notas y murales que se encuentran por las salas (en orden) y lo que se cuenta al
  // vencer al jefe. Las notas van en el decorado (prop 'nota' en server/gen.js) y se leen al pisarlas.
  const LORE = {
    cuevas: { title: 'El tesoro de los Dientes Rotos', notes: [
      'Diario del minero Tobías: «Abrimos una veta nueva y salieron ellos. Pequeños, verdes y con demasiados dientes. Nos quitaron los picos y las linternas.»',
      'Mural pintado con barro: un goblin enorme con corona de cucharas, sobre un montón de cosas brillantes. Los demás goblins, de rodillas.',
      'Nota arrugada: «Si alguien encuentra esto, mi hermano Bartolo sigue vivo en las celdas del fondo. Grubnak lo usa para pulir su corona.»',
      'Lista de botín garabateada: «3 ollas, 1 campana, 14 botones, la dentadura de oro del alcalde. TODO PARA GRUBNAK.»',
    ], end: 'Entre los trastos de Grubnak aparece una dentadura de oro y una celda abierta: Bartolo se ha ido corriendo hacia la taberna. Alfonso le pondrá una jarra a vuestra cuenta.' },
    cripta: { title: 'El Último Rezo', notes: [
      'Lápida agrietada: «Aquí yace el hermano Aldric, que guardó la puerta para que nadie bajara. Que nadie baje.»',
      'Mural desconchado: un mago con túnica negra sostiene una gema verde sobre una fila de tumbas abiertas.',
      'Página de un libro de rezos, con la letra cada vez más torcida: «Malakar prometió que volveríamos a ver a los nuestros. Mintió. Los vemos, pero ya no son ellos.»',
      'Inscripción en la piedra: «La filacteria duerme junto a su dueño. Rompe una y el otro caerá.»',
    ], end: 'La gema verde de Malakar se apaga con un último suspiro. En las criptas, por fin, hay silencio. El hermano Aldric puede descansar.' },
    fortaleza: { title: 'La Mano Roja', notes: [
      'Orden de guerra con una mano roja estampada: «Toda aldea que no pague, arde. Firmado: Gorthak.»',
      'Mural de sangre seca: la Mano Roja sobre un mapa. Tres aldeas tachadas. La cuarta es Brumaverde.',
      'Carta de un prisionero: «Les he oído contar los días. Cuando llegue la luna llena marcharán sobre el valle.»',
      'Tablón de entrenamiento lleno de muescas: «Gorthak: 100 escudos rotos. Siguiente: el tuyo.»',
    ], end: 'El estandarte de la Mano Roja cae al barro. Sin Gorthak, los orcos se dispersan por las colinas y Brumaverde dormirá tranquila esta luna.' },
    nido: { title: 'La Seda Negra', notes: [
      'Mochila de un cazador, envuelta en seda: «El bosque se ha quedado sin pájaros. Algo grande teje entre los árboles.»',
      'Mural rascado en la corteza: una araña con corona y, debajo, cientos de huevos.',
      'Nota del cazador: «Los capullos se mueven. Hay gente dentro. Voy a por ayuda… si encuentro el camino de vuelta.»',
      'Marcas en un árbol: «Por aquí NO. Por aquí tampoco.»',
    ], end: 'Arakhna se encoge y su seda se deshace. De los capullos salen, aturdidos, varios cazadores. Uno de ellos jura invitaros a la próxima ronda.' },
    volcan: { title: 'La Llama Eterna', notes: [
      'Tablilla de los kobolds: «Gran Ignaroth duerme sobre el oro. Nosotros le traemos más oro. Así no nos come.»',
      'Mural ennegrecido por el fuego: un dragón rojo enroscado alrededor de una corona y una ciudad en llamas.',
      'Diario de un cultista: «El dragón nos prometió escamas de fuego para todos. Ya van tres hermanos que ha usado de cena.»',
      'Inscripción en el altar: «La Llama Eterna no se apaga con agua, sino con valor.»',
    ], end: 'Ignaroth cae sobre su montaña de oro y las ascuas se apagan por fin. Los kobolds, sin dueño, salen huyendo con lo que pueden cargar.' },
    bosque: { title: 'Los Susurros del Musgo Negro', notes: [
      'Hacha clavada en un tronco: «Talamos un roble viejo y desde entonces el bosque susurra. Los árboles se mueven de noche.»',
      'Mural tallado en la corteza: un árbol con ojos y raíces que agarran a un leñador.',
      'Diario de una druida: «Raízmadre era la guardiana de este bosque. Algo la ha corrompido: el musgo negro le sale del corazón.»',
      'Nota clavada con una flecha: «Las luciérnagas huyen del musgo. Síguelas y llegarás a ella.»',
    ], end: 'El musgo negro se deshace en ceniza y Raízmadre suspira. Por primera vez en años, el bosque calla y deja dormir a los que viven en él.' },
    abismo: { title: 'La Puerta del Averno', notes: [
      'Pergamino chamuscado: «El círculo funcionó. La puerta está abierta. Que los dioses nos perdonen.»',
      'Mural pintado con ceniza: Azaroth con cuernos de fuego y, a sus pies, el círculo de los invocadores.',
      'Confesión de un brujo: «Pedimos poder y Azaroth nos lo dio. Ahora no podemos dormir sin oír sus risas.»',
      'Grabado en el suelo: «Lo que se abre desde dentro sólo se cierra desde dentro.»',
    ], end: 'Con Azaroth vencido, la puerta del Averno se cierra con un trueno. El calor desaparece y el abismo vuelve a ser sólo una cueva oscura.' },
  };
  const MONSTERDATA = { MONSTERS, LEGACY_MONSTER, THEMES, BOSS_LINES, LORE };
  if (typeof module !== 'undefined' && module.exports) module.exports = MONSTERDATA;
  else root.MONSTERDATA = MONSTERDATA;
})(this);
