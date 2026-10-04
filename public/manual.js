/* global DD, RULES */
// Manual: compendio navegable de las reglas del SRD 5.2 (clases, especies, conjuros, monstruos…).
(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  }

  const overlay = $('#manual'), tabsEl = $('#manual-tabs'), bodyEl = $('#manual-body'), searchEl = $('#manual-search'), filtersEl = $('#manual-filters');
  const extra = { monsters: null, items: null };
  let tab = 'rules';
  let filters = {};
  let limit = 60;

  $('#manual-close').addEventListener('click', () => overlay.classList.add('hidden'));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.add('hidden'); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') overlay.classList.add('hidden'); });
  searchEl.addEventListener('input', () => { limit = 60; render(); });

  DD.on('open-manual', (opts) => {
    overlay.classList.remove('hidden');
    if (opts && opts.tab) { tab = opts.tab; filters = {}; searchEl.value = opts.search || ''; }
    renderTabs(); render();
  });

  const D = () => RULES.data;
  const fmt = RULES.fmt;
  const abbr = (a) => D().abilities.find((x) => x.id === a).abbr;
  const dmg = (t) => (D().damageTypes.find((d) => d.id === t) || {}).name || t || '';
  const crText = (cr) => (cr === 0.125 ? '1/8' : cr === 0.25 ? '1/4' : cr === 0.5 ? '1/2' : String(cr));

  async function loadExtra(name) {
    if (!extra[name]) extra[name] = await fetch(`rules/${name}.json`).then((r) => r.json());
    return extra[name];
  }

  const TABS = [
    ['rules', 'Reglas básicas'], ['classes', 'Clases'], ['species', 'Especies'], ['backgrounds', 'Trasfondos'], ['feats', 'Dotes'],
    ['weapons', 'Armas'], ['armor', 'Armaduras'], ['spells', 'Conjuros'], ['monsters', 'Monstruos'], ['items', 'Objetos mágicos'], ['conditions', 'Estados'],
  ];

  function renderTabs() {
    tabsEl.innerHTML = '';
    for (const [id, name] of TABS) tabsEl.append(h('button', { type: 'button', class: 'wiz-step' + (tab === id ? ' on' : ''), text: name, onclick: () => { tab = id; filters = {}; searchEl.value = ''; limit = 60; renderTabs(); render(); } }));
  }

  function select(key, label, options) {
    return h('select', { onchange: (e) => { filters[key] = e.target.value; limit = 60; render(); } },
      h('option', { value: '', text: label }), options.map(([v, t]) => h('option', { value: v, selected: filters[key] === String(v), text: t })));
  }

  const matches = (txt) => { const q = searchEl.value.trim().toLowerCase(); return !q || txt.toLowerCase().includes(q); };
  const entry = (title, meta, ...content) => h('details', { class: 'm-entry' }, h('summary', null, h('b', { text: title }), meta ? h('small', { text: meta }) : null), ...content);
  const text = (t) => h('div', { class: 'detail-text', text: t });

  function paged(list, make) {
    const shown = list.slice(0, limit);
    bodyEl.append(h('p', { class: 'note', text: `${list.length} resultados` }));
    shown.forEach((x) => bodyEl.append(make(x)));
    if (list.length > limit) bodyEl.append(h('button', { type: 'button', class: 'btn m-more', text: `VER MÁS (${list.length - limit})`, onclick: () => { limit += 60; render(); } }));
  }

  async function render() {
    if (!RULES.data) { bodyEl.textContent = 'Cargando reglas…'; return; }
    bodyEl.innerHTML = '';
    filtersEl.innerHTML = '';
    searchEl.parentElement.style.display = tab === 'rules' ? 'none' : '';
    switch (tab) {
      case 'rules': return renderRules();
      case 'classes': return paged(D().classes.filter((c) => matches(c.name + c.en)), (c) => entry(c.name, `d${c.hitDie} · ${c.primary.map(abbr).join(c.primaryOr ? ' o ' : ' y ')}${c.spellcasting ? ' · lanza conjuros' : ''}`,
        h('p', null, `Salvaciones: ${c.saves.map(abbr).join(', ')} · Armaduras: ${c.armor.join(', ') || 'ninguna'} · Armas: ${c.weapons.join(', ')}`), h('p', null, `Habilidades: ${c.skillChoices.desc}`),
        h('table', { class: 'm-table' }, h('tr', null, ['Nivel', 'Comp.', 'Rasgos', 'Trucos', 'Prep.', 'Espacios'].map((t) => h('th', { text: t }))),
          c.levels.map((l) => h('tr', null, h('td', { text: l.level }), h('td', { text: fmt(l.prof) }), h('td', { text: l.features.map((f) => (D().features[f] || {}).name || f).join(', ') }),
            h('td', { text: l.cantrips || '' }), h('td', { text: l.prepared || '' }), h('td', { text: l.slots.map((n, i) => (n ? `${i + 1}º:${n}` : '')).filter(Boolean).join(' ') })))),
        h('h4', { text: 'Rasgos' }), Object.entries(D().features).filter(([, f]) => f.class === c.id).map(([, f]) => entry(f.name, f.level ? `Nivel ${f.level}` : '', text(f.desc))),
        c.subclasses.map((s) => entry(`Subclase: ${s.name}`, '', text(s.summary + '\n\n' + s.desc)))));
      case 'species': return paged(D().species.filter((s) => matches(s.name + s.en)), (s) => entry(s.name, `${D().sizes[s.size] || s.size} · ${s.speed} pies`,
        s.traits.map((t) => entry(t.name, '', text(t.desc))), s.subspecies.map((x) => entry(x.name, '', x.traits.map((t) => entry(t.name, '', text(t.desc)))))));
      case 'backgrounds': return paged(D().backgrounds.filter((b) => matches(b.name + b.en)), (b) => entry(b.name, `${b.abilities.map(abbr).join(', ')} · ${D().byId.feats[b.feat.id].name}`,
        h('p', null, `Habilidades: ${b.skills.map((k) => D().byId.skills[k].name).join(', ')} · Herramientas: ${b.tools.join(', ') || '—'}`), h('p', null, b.equipment.join(' '))));
      case 'feats':
        filtersEl.append(select('type', 'Todos los tipos', Object.entries({ origin: 'De origen', general: 'General', 'fighting-style': 'Estilo de combate', 'epic-boon': 'Don épico' })));
        return paged(D().feats.filter((f) => (!filters.type || f.type === filters.type) && matches(f.name + f.en)), (f) => entry(f.name, f.typeName, text(f.desc)));
      case 'weapons':
        filtersEl.append(select('cat', 'Todas', [['simple', 'Sencillas'], ['martial', 'Marciales']]));
        bodyEl.append(h('table', { class: 'mini-table' }, h('tr', null, ['Arma', 'Tipo', 'Daño', 'Propiedades', 'Maestría', 'Coste', 'Peso'].map((t) => h('th', { text: t }))),
          D().weapons.filter((w) => (!filters.cat || w.category === filters.cat) && matches(w.name + w.en)).map((w) => h('tr', null,
            h('td', { text: w.name }), h('td', { text: `${w.category === 'martial' ? 'Marcial' : 'Sencilla'} ${w.kind === 'ranged' ? 'a distancia' : 'cuerpo a cuerpo'}` }),
            h('td', { text: `${w.damage} ${dmg(w.type)}${w.versatile ? ` (${w.versatile})` : ''}` }),
            h('td', { text: w.properties.map((p) => D().properties.find((x) => x.id === p).name + (p === 'range' || p === 'ammunition' ? ` ${w.range.filter(Boolean).join('/')}` : p === 'thrown' && w.thrown ? ` ${w.thrown.join('/')}` : '')).join(', ') }),
            h('td', { text: w.mastery ? D().masteries.find((x) => x.id === w.mastery).name : '' }), h('td', { text: w.cost }), h('td', { text: `${w.weight} lb` })))));
        bodyEl.append(h('h4', { text: 'Maestrías' }), D().masteries.map((m) => entry(m.name, m.en, text(m.desc))), h('h4', { text: 'Propiedades' }), D().properties.map((p) => entry(p.name, p.en, text(p.desc))));
        return;
      case 'armor':
        bodyEl.append(h('table', { class: 'mini-table' }, h('tr', null, ['Armadura', 'Tipo', 'CA', 'Fuerza', 'Sigilo', 'Coste', 'Peso'].map((t) => h('th', { text: t }))),
          D().armor.filter((a) => matches(a.name + a.en)).map((a) => h('tr', null, h('td', { text: a.name }), h('td', { text: { light: 'Ligera', medium: 'Intermedia', heavy: 'Pesada', shield: 'Escudo' }[a.kind] }),
            h('td', { text: a.kind === 'shield' ? '+2' : `${a.base}${a.dex ? (a.maxDex != null ? ` + Des (máx. ${a.maxDex})` : ' + Des') : ''}` }), h('td', { text: a.str || '—' }), h('td', { text: a.stealth ? 'Desventaja' : '—' }), h('td', { text: a.cost }), h('td', { text: `${a.weight} lb` })))));
        return;
      case 'spells': {
        filtersEl.append(select('level', 'Todos los niveles', [[0, 'Trucos'], 1, 2, 3, 4, 5, 6, 7, 8, 9].map((x) => (Array.isArray(x) ? x : [x, `Nivel ${x}`]))));
        filtersEl.append(select('cls', 'Todas las clases', D().classes.filter((c) => c.spellcasting).map((c) => [c.id, c.name])));
        filtersEl.append(select('school', 'Todas las escuelas', D().schools.map((s) => [s.id, s.name])));
        filtersEl.append(select('combat', 'Todos', [['1', '⚔ Lanzables en el juego']]));
        const list = Object.values(RULES.spells).filter((s) => (filters.level === undefined || filters.level === '' || s.level === Number(filters.level)) && (!filters.cls || s.classes.includes(filters.cls)) && (!filters.school || s.school === filters.school) && (!filters.combat || RULES.COMBAT_SPELLS[s.id]) && matches(s.name + ' ' + s.en))
          .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name, 'es'));
        return paged(list, (s) => entry(`${s.name}${RULES.COMBAT_SPELLS[s.id] ? ' ⚔' : ''}`, `${s.level ? `Nivel ${s.level}` : 'Truco'} · ${(D().schools.find((x) => x.id === s.school) || {}).name}${s.name !== s.en ? ` · ${s.en}` : ''}`,
          h('p', null, `Lanzamiento: ${s.time}${s.ritual ? ' (ritual)' : ''} · Alcance: ${s.range} · Componentes: ${s.components.join(', ')}${s.material ? ` (${s.material})` : ''} · Duración: ${s.concentration ? 'Concentración, ' : ''}${s.duration}`),
          h('p', null, `Clases: ${s.classes.map((c) => D().byId.classes[c] ? D().byId.classes[c].name : c).join(', ')}`), text(s.desc + (s.higher ? `\n\n${s.higher}` : ''))));
      }
      case 'monsters': {
        bodyEl.append(h('p', { class: 'note', text: 'Cargando bestiario…' }));
        const mons = await loadExtra('monsters');
        if (tab !== 'monsters') return;
        bodyEl.innerHTML = '';
        filtersEl.innerHTML = '';
        filtersEl.append(select('type', 'Todos los tipos', Object.entries(D().monsterTypes)));
        filtersEl.append(select('cr', 'Cualquier VD', [['0-1', 'VD 0 a 1'], ['2-4', 'VD 2 a 4'], ['5-10', 'VD 5 a 10'], ['11-16', 'VD 11 a 16'], ['17-30', 'VD 17+']]));
        const [lo, hi] = filters.cr ? filters.cr.split('-').map(Number) : [0, 99];
        return paged(mons.filter((m) => (!filters.type || m.type === filters.type) && m.cr >= lo && m.cr <= hi && matches(m.name + ' ' + m.en)), (m) => entry(m.name, `VD ${crText(m.cr)} (${m.xp} PX) · ${D().monsterTypes[m.type] || m.type}${m.name !== m.en ? ` · ${m.en}` : ''}`, statblock(m)));
      }
      case 'items': {
        bodyEl.append(h('p', { class: 'note', text: 'Cargando objetos…' }));
        const items = await loadExtra('items');
        if (tab !== 'items') return;
        bodyEl.innerHTML = '';
        filtersEl.innerHTML = '';
        filtersEl.append(select('rarity', 'Cualquier rareza', Object.entries(D().rarity)));
        return paged(items.filter((i) => (!filters.rarity || i.rarity === filters.rarity) && matches(i.name)), (i) => entry(i.name, `${i.category} · ${D().rarity[i.rarity] || i.rarity}${i.attunement ? ' · requiere sintonía' : ''}`, text(i.desc)));
      }
      case 'conditions': return paged(D().conditions.filter((c) => matches(c.name + c.en)), (c) => entry(c.name, c.en, text(c.desc)));
    }
  }

  function statblock(m) {
    const speed = Object.entries(m.speed || {}).map(([k, v]) => (k === 'walk' ? v : `${k} ${v}`)).join(', ');
    const sec = (title, list) => (list && list.length ? [h('h5', { text: title }), list.map((a) => h('p', null, h('b', { text: a.name + '. ' }), a.desc))] : []);
    return h('div', { class: 'statblock' },
      h('p', null, h('i', { text: `${D().sizes[m.size] || m.size} ${D().monsterTypes[m.type] || m.type}, ${m.alignment}` })),
      h('div', { class: 'sb-line' }),
      h('p', null, h('b', { text: 'CA ' }), `${m.ac}${m.acNote ? ` (${m.acNote})` : ''} · `, h('b', { text: 'PG ' }), `${m.hp} (${m.hd}) · `, h('b', { text: 'Velocidad ' }), speed),
      h('div', { class: 'sb-abil' }, RULES.ABIL.map((a) => h('div', null, h('b', { text: abbr(a) }), `${m[a]} (${fmt(RULES.mod(m[a]))})`))),
      h('div', { class: 'sb-line' }),
      m.profs.length ? h('p', null, h('b', { text: 'Competencias ' }), m.profs.map(([n, v]) => `${n} ${fmt(v)}`).join(', ')) : null,
      m.resist.length ? h('p', null, h('b', { text: 'Resistencias ' }), m.resist.join(', ')) : null,
      m.immune.length ? h('p', null, h('b', { text: 'Inmunidades ' }), [...m.immune, ...m.condImmune].join(', ')) : null,
      m.vulnerable.length ? h('p', null, h('b', { text: 'Vulnerabilidades ' }), m.vulnerable.join(', ')) : null,
      h('p', null, h('b', { text: 'Sentidos ' }), Object.entries(m.senses).map(([k, v]) => `${k.replace('_', ' ')} ${v}`).join(', ')),
      h('p', null, h('b', { text: 'Idiomas ' }), m.languages || '—', ' · ', h('b', { text: 'VD ' }), `${crText(m.cr)} (${m.xp} PX; BC ${fmt(m.pb)})`),
      ...sec('Rasgos', m.traits), ...sec('Acciones', m.actions), ...sec('Acciones adicionales', m.bonus), ...sec('Reacciones', m.reactions), ...sec('Acciones legendarias', m.legendary));
  }

  function renderRules() {
    const sec = (title, ...paras) => entry(title, '', ...paras.map((p) => h('p', { text: p })));
    bodyEl.append(
      h('p', { class: 'note', text: 'Resumen de las reglas básicas del SRD 5.2 (reglas de 2024), escrito para este juego. El texto completo de clases, conjuros y monstruos está en las otras pestañas.' }),
      sec('Las tres tiradas con d20',
        'Pruebas de característica, tiradas de salvación y tiradas de ataque: tira 1d20 y suma el modificador de la característica, más tu bonificador por competencia si eres competente.',
        'Una prueba o salvación tiene éxito si iguala o supera la Clase de Dificultad (CD). Un ataque impacta si iguala o supera la Clase de Armadura (CA) del objetivo.',
        'Modificador = (puntuación − 10) ÷ 2, redondeando hacia abajo. Una puntuación de 15 da +2; una de 8 da −1.'),
      sec('Ventaja y desventaja', 'Con ventaja tiras dos d20 y te quedas con el mayor; con desventaja, con el menor. Si tienes ambas, se anulan.'),
      sec('Bonificador por competencia', 'Es +2 en los niveles 1-4, +3 en 5-8, +4 en 9-12, +5 en 13-16 y +6 en 17-20. Se suma a ataques con armas y conjuros que dominas, a salvaciones y habilidades en las que eres competente, y a la CD de tus conjuros (8 + competencia + modificador).'),
      sec('Combate',
        'Al empezar, todos tiran iniciativa (prueba de Destreza). En tu turno puedes moverte hasta tu velocidad y realizar una acción (Atacar, Magia, Correr, Esquivar, Destrabarse, Esconderse, Ayudar, Buscar, Influir, Estudiar, Preparar o Usar un objeto), además de una acción adicional si algo te la concede. Tienes una reacción por ronda.',
        'Un 20 natural en una tirada de ataque es un golpe crítico: impacta siempre y duplica los dados de daño. Un 1 natural falla siempre.',
        'Con 0 puntos de golpe quedas inconsciente y haces salvaciones contra la muerte (CD 10) al principio de cada turno: tres éxitos te estabilizan y tres fallos te matan.'),
      sec('Descansos', 'Descanso corto (1 hora): puedes gastar dados de golpe para recuperar PG. Descanso largo (8 horas): recuperas todos los PG, la mitad de los dados de golpe y los espacios de conjuro.'),
      sec('Creación de personaje (2024)',
        '1) Elige clase. 2) Elige trasfondo: da +2/+1 o +1/+1/+1 a tres características concretas, una dote de origen, dos habilidades y una herramienta. 3) Elige especie: da rasgos como visión en la oscuridad, resistencias o trucos. 4) Genera puntuaciones con la serie estándar (15, 14, 13, 12, 10, 8), la compra de 27 puntos o tirando 4d6 y quitando el menor. 5) Elige alineamiento y detalles.'),
      sec('Subir de nivel', `Se sube con puntos de experiencia (PX): ${D().xpTable.slice(1, 10).map((x, i) => `nivel ${i + 2} con ${x}`).join(', ')}…`),
      sec('Cómo se aplican en este juego',
        'Las mazmorras y el mundo abierto se juegan en tiempo real: en vez de turnos, cada acción tiene un tiempo de espera (atacar o lanzar un conjuro tarda unos 1,5 segundos).',
        'Los ataques sí usan las reglas: d20 + bonificador contra la CA, 20 natural crítico, daño con los dados del arma o del conjuro, salvaciones de los monstruos contra tu CD y bloques de estadísticas oficiales del SRD.',
        'Simplificaciones: no hay ventaja por posición, las maestrías de armas y muchos rasgos sólo se muestran en la ficha, los conjuros se lanzan siempre al nivel mínimo, las mejoras de nivel 4, 8… se aplican solas a tu característica principal, y caer a 0 PG te devuelve a la taberna (pierdes el 10 % del oro) en lugar de hacer salvaciones contra la muerte.',
        'Los conjuros marcados con ⚔ se pueden lanzar en combate; el resto aparecen en tu ficha y en este manual como referencia.'),
    );
  }
})();
