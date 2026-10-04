/* global DD, RULES, MAP, SPRITES */
// Ficha de personaje (SRD 5.2): vista completa y asistente de creación paso a paso.
(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  // Pequeño ayudante para crear elementos
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'style') el.style.cssText = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  }

  const overlay = $('#sheet');
  const body = $('#sheet-body');
  const D = () => RULES.data;
  const SP = () => RULES.spells;
  const abilityName = (a) => D().abilities.find((x) => x.id === a);
  const skillName = (k) => (D().byId.skills[k] || {}).name || k;
  const dmgName = (t) => (D().damageTypes.find((d) => d.id === t) || {}).name || t || '';

  function close() { overlay.classList.add('hidden'); body.innerHTML = ''; }
  $('#sheet-close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !overlay.classList.contains('hidden')) close(); });

  // Ventana de detalle (conjuro, rasgo…)
  function popup(title, text, extra) {
    const box = h('div', { class: 'pop-detail panel' },
      h('div', { class: 'panel-title small', text: title }),
      extra || null,
      h('div', { class: 'detail-text', text }),
      h('button', { class: 'btn', type: 'button', text: 'CERRAR', onclick: () => box.remove() }));
    overlay.append(box);
  }
  function spellDetail(id) {
    const s = SP()[id];
    if (!s) return;
    const school = (D().schools.find((x) => x.id === s.school) || {}).name || s.school;
    const meta = h('div', { class: 'detail-meta' },
      `${s.level ? `Nivel ${s.level}` : 'Truco'} · ${school}${s.ritual ? ' · ritual' : ''}`, h('br'),
      `Lanzamiento: ${s.time} · Alcance: ${s.range} · Componentes: ${s.components.join(', ')}${s.material ? ` (${s.material})` : ''}`, h('br'),
      `Duración: ${s.concentration ? 'Concentración, ' : ''}${s.duration}`,
      RULES.COMBAT_SPELLS[id] ? h('div', { class: 'combat-tag', text: '⚔ Se puede lanzar en las mazmorras' }) : null);
    popup(s.name + (s.name !== s.en ? ` (${s.en})` : ''), s.desc + (s.higher ? `\n\n${s.higher}` : ''), meta);
  }

  // ======================================================================
  //  Vista de la ficha
  // ======================================================================
  function showSheet(userId) {
    draft = null;
    const u = DD.users.get(userId);
    if (!u || !u.sheet) return;
    const mine = userId === DD.myId;
    const d = RULES.derive(u.sheet, u.xp || 0);
    body.innerHTML = '';
    overlay.classList.remove('hidden');
    const look = { cls: u.sheet.class, species: u.sheet.species, sub: u.sheet.subspecies, skin: u.sheet.look.skin, hair: u.sheet.look.hair };

    const portrait = h('canvas', { width: 96, height: 128, class: 'sheet-portrait' });
    const g = portrait.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(SPRITES.hero(look, {}), 0, 0, 24, 32, 0, 0, 96, 128);

    const head = h('div', { class: 'sheet-head' }, portrait,
      h('div', { class: 'sheet-id' },
        h('div', { class: 'sheet-name', text: d.name }),
        h('div', { class: 'sheet-sub', text: `${d.speciesName} · ${d.className} ${d.level} · ${d.backgroundName}` }),
        h('div', { class: 'sheet-sub', text: `${(D().alignments.find((a) => a.id === u.sheet.alignment) || {}).name || ''} · Experiencia ${d.xp}${d.nextXp ? ` / ${d.nextXp}` : ''}` }),
        mine ? h('div', { class: 'edit-row' },
          h('button', { class: 'btn', type: 'button', text: '✏️ EDITAR FICHA', onclick: () => openWizard(u.sheet) }),
          h('button', { class: 'btn alt', type: 'button', text: '✨ NUEVO PERSONAJE', onclick: () => openWizard(null) })) : null));

    const stat = (label, value, small) => h('div', { class: 'stat-box' }, h('div', { class: 'stat-val', text: value }), h('div', { class: 'stat-lbl', text: label }), small ? h('small', { text: small }) : null);
    const top = h('div', { class: 'stat-row' },
      stat('Clase de armadura', d.ac, d.armorName ? d.armorName + (d.shield ? ' + escudo' : '') : d.shield ? 'Escudo' : 'Sin armadura'),
      stat('Puntos de golpe', d.hp, `Dado de golpe d${d.hitDie}`),
      stat('Iniciativa', RULES.fmt(d.initiative)),
      stat('Velocidad', `${d.speed} pies`),
      stat('Competencia', RULES.fmt(d.prof)),
      stat('Percepción pasiva', d.passive));

    const abil = h('div', { class: 'abil-row' }, RULES.ABIL.map((a) => {
      const sv = d.saves.find((s) => s.id === a);
      return h('div', { class: 'abil-box' + (sv.prof ? ' prof' : '') },
        h('div', { class: 'abil-name', text: abilityName(a).name }),
        h('div', { class: 'abil-mod', text: RULES.fmt(d.mod[a]) }),
        h('div', { class: 'abil-score', text: d.score[a] }),
        h('div', { class: 'abil-save', text: `Salvación ${RULES.fmt(sv.bonus)}${sv.prof ? ' ●' : ''}` }));
    }));

    const skills = h('div', { class: 'sheet-col' }, h('h3', { text: 'Habilidades' }),
      h('ul', { class: 'skill-list' }, d.skills.map((k) => h('li', { class: k.prof ? 'prof' : '' },
        h('span', { class: 'dot', text: k.expert ? '◆' : k.prof ? '●' : '○' }),
        h('span', { class: 'sk', text: k.name }), h('small', { text: abilityName(k.ability).abbr }), h('b', { text: RULES.fmt(k.bonus) })))));

    const attacks = h('div', { class: 'sheet-col' }, h('h3', { text: 'Ataques' }),
      h('table', { class: 'mini-table' }, h('thead', null, h('tr', null, h('th', { text: 'Arma' }), h('th', { text: 'Ataque' }), h('th', { text: 'Daño' }))),
        h('tbody', null, d.attacks.map((a) => h('tr', null, h('td', { text: a.name + (a.prof ? '' : ' (sin competencia)') }), h('td', { text: RULES.fmt(a.hit) }),
          h('td', { text: `${a.dice}${a.mod ? RULES.fmt(a.mod) : ''} ${dmgName(a.type)}` }))))));
    if (d.sneak) attacks.append(h('p', { class: 'note', text: `Ataque furtivo: +${d.sneak} una vez por turno (en el juego, si otro héroe está junto al objetivo).` }));
    for (const act of d.actions) attacks.append(h('p', { class: 'note' }, h('b', { text: act.name + ': ' }), act.desc + (act.uses ? ` (${act.uses} usos por descanso largo)` : '')));

    const cols = h('div', { class: 'sheet-cols' }, skills, attacks);

    let spellBlock = null;
    if (d.spells.length) {
      const cast = d.casting;
      spellBlock = h('div', { class: 'sheet-section' }, h('h3', { text: 'Conjuros' }),
        cast ? h('div', { class: 'stat-row small' },
          stat('Característica', abilityName(cast.ability).name), stat('CD de salvación', cast.dc), stat('Ataque de conjuro', RULES.fmt(cast.attack)),
          stat('Espacios', cast.slots.map((n, i) => (n ? `${i + 1}º:${n}` : '')).filter(Boolean).join(' ') || '—')) : null,
        h('div', { class: 'spell-chips' }, d.spells.map((s) => h('button', {
          type: 'button', class: 'chip' + (s.combat ? ' combat' : ''), title: s.combat ? 'Se puede lanzar en combate' : 'Sólo de referencia en este juego',
          onclick: () => spellDetail(s.id),
        }, `${s.level ? s.level + 'º' : 'T'} · ${s.name}${s.source === 'species' ? ' (especie)' : s.source === 'feat' ? ' (dote)' : ''}${s.combat ? ' ⚔' : ''}`))));
    }

    const feats = h('div', { class: 'sheet-section' }, h('h3', { text: 'Rasgos y dotes' }),
      h('div', { class: 'feature-list' }, d.features.map((f) => h('details', null, h('summary', null, h('b', { text: f.name }), h('small', { text: ` · ${f.source}` })), h('div', { class: 'detail-text', text: f.desc })))));

    const equip = h('div', { class: 'sheet-section' }, h('h3', { text: 'Equipo' }),
      h('p', { text: [d.armorName, d.shield ? 'Escudo' : null, ...u.sheet.weapons.map((w) => D().byId.weapons[w].name)].filter(Boolean).join(' · ') || '—' }),
      h('p', { class: 'note', text: 'Equipo inicial oficial de la clase: ' + D().byId.classes[u.sheet.class].equipment.join(' ') }));

    body.append(head, top, abil, cols, spellBlock, feats, equip);
  }

  // ======================================================================
  //  Asistente de creación
  // ======================================================================
  let draft = null;
  let step = 0;
  const STEPS = ['Clase', 'Especie', 'Trasfondo', 'Características', 'Habilidades', 'Equipo', 'Conjuros', 'Detalles'];

  function openWizard(sheet) {
    const u = DD.users.get(DD.myId);
    const xp = u ? u.xp || 0 : 0;
    draft = JSON.parse(JSON.stringify(sheet || RULES.pregen('fighter', 'human', { name: u ? u.name : 'Aventurero', look: sheet ? sheet.look : { skin: 0, hair: 0 }, xp })));
    draft.xp = xp;
    step = 0;
    overlay.classList.remove('hidden');
    renderWizard();
  }

  const lv = () => RULES.levelFromXp(draft.xp || 0);
  const cls = () => D().byId.classes[draft.class];
  const spc = () => D().byId.species[draft.species];
  const bgd = () => D().byId.backgrounds[draft.background];

  function setClass(id) {
    const keep = { name: draft.name, species: draft.species, subspecies: draft.subspecies, look: draft.look, xp: draft.xp, alignment: draft.alignment };
    draft = Object.assign(RULES.pregen(id, keep.species, { name: keep.name, look: keep.look, xp: keep.xp, subspecies: keep.subspecies }), { xp: keep.xp, alignment: keep.alignment });
  }

  function card(selected, onclick, title, lines, extra) {
    return h('button', { type: 'button', class: 'pick-card' + (selected ? ' on' : ''), onclick }, h('b', { text: title }), lines.map((l) => h('small', { text: l })), extra || null);
  }

  function renderWizard() {
    body.innerHTML = '';
    const steps = h('div', { class: 'wiz-steps' }, STEPS.map((n, i) => h('button', { type: 'button', class: 'wiz-step' + (i === step ? ' on' : '') + (i < step ? ' done' : ''), onclick: () => { step = i; renderWizard(); } }, `${i + 1}. ${n}`)));
    const main = h('div', { class: 'wiz-main' });
    const side = h('aside', { class: 'wiz-side' });
    [stepClass, stepSpecies, stepBackground, stepAbilities, stepSkills, stepEquipment, stepSpells, stepDetails][step](main);
    renderSummary(side);
    const nav = h('div', { class: 'wiz-nav' },
      h('button', { class: 'btn alt', type: 'button', text: '← ANTERIOR', disabled: step === 0, onclick: () => { step--; renderWizard(); } }),
      step < STEPS.length - 1
        ? h('button', { class: 'btn', type: 'button', text: 'SIGUIENTE →', onclick: () => { step++; renderWizard(); } })
        : h('button', { class: 'btn', type: 'button', text: '💾 GUARDAR FICHA', onclick: save }));
    body.append(h('div', { class: 'panel-title', text: 'CREACIÓN DE PERSONAJE · REGLAS SRD 5.2' }), steps, h('div', { class: 'wiz-wrap' }, main, side), nav);
    body.scrollTop = 0;
  }

  function renderSummary(side) {
    const v = RULES.validate(draft, draft.xp);
    let d = null;
    try { d = RULES.derive(v.sheet || draft, draft.xp); } catch { d = null; }
    const pv = h('canvas', { width: 96, height: 128, class: 'sheet-portrait' });
    const g = pv.getContext('2d'); g.imageSmoothingEnabled = false;
    g.drawImage(SPRITES.hero({ cls: draft.class, species: draft.species, sub: draft.subspecies, skin: draft.look.skin, hair: draft.look.hair }, {}), 0, 0, 24, 32, 0, 0, 96, 128);
    side.append(pv);
    if (d) {
      side.append(h('div', { class: 'sum-name', text: draft.name }), h('div', { class: 'sum-sub', text: `${d.speciesName} · ${d.className} ${d.level}` }),
        h('div', { class: 'sum-grid' },
          h('span', { text: 'CA' }), h('b', { text: d.ac }), h('span', { text: 'PG' }), h('b', { text: d.hp }),
          h('span', { text: 'Inic.' }), h('b', { text: RULES.fmt(d.initiative) }), h('span', { text: 'Vel.' }), h('b', { text: d.speed })),
        h('div', { class: 'sum-abil' }, RULES.ABIL.map((a) => h('div', null, h('small', { text: abilityName(a).abbr }), h('b', { text: d.score[a] }), h('small', { text: RULES.fmt(d.mod[a]) })))));
    }
    if (!v.ok) side.append(h('ul', { class: 'errors' }, v.errors.map((e) => h('li', { text: e }))));
    else side.append(h('p', { class: 'ok-msg', text: '✔ La ficha cumple las reglas' }));
  }

  // ----- Paso 1: clase -----
  function stepClass(el) {
    el.append(h('h3', { text: 'Elige tu clase' }), h('p', { class: 'note', text: 'Cambiar de clase vuelve a proponer características, equipo y conjuros recomendados; luego puedes ajustarlo todo.' }));
    el.append(h('div', { class: 'pick-grid' }, D().classes.map((c) => card(draft.class === c.id, () => { setClass(c.id); renderWizard(); }, c.name,
      [`Dado de golpe d${c.hitDie}`, `Principal: ${c.primary.map((a) => abilityName(a).name).join(c.primaryOr ? ' o ' : ' y ')}`, `Salvaciones: ${c.saves.map((a) => abilityName(a).abbr).join(', ')}`, c.spellcasting ? `Conjuros (${abilityName(c.spellcasting.ability).abbr})` : 'Sin conjuros a nivel 1']))));
    const c = cls();
    el.append(h('div', { class: 'info-box' }, h('h4', { text: `Rasgos de ${c.name} a nivel 1` }),
      c.levels[0].features.map((f) => D().features[f]).filter(Boolean).map((f) => h('details', null, h('summary', { text: f.name }), h('div', { class: 'detail-text', text: f.desc })))));
  }

  // ----- Paso 2: especie -----
  function stepSpecies(el) {
    el.append(h('h3', { text: 'Elige tu especie' }));
    el.append(h('div', { class: 'pick-grid' }, D().species.map((s) => card(draft.species === s.id, () => {
      draft.species = s.id; draft.subspecies = s.subspecies.length ? s.subspecies[0].id : null;
      if (!MAP.skinsFor(s.id).includes(draft.look.skin)) draft.look.skin = MAP.skinsFor(s.id)[0];
      if (s.id === 'elf') draft.speciesSkill = 'perception';
      else if (s.id === 'human') { draft.speciesSkill = 'perception'; draft.humanFeat = draft.humanFeat || 'alert'; }
      else { draft.speciesSkill = null; draft.humanFeat = null; }
      renderWizard();
    }, s.name, [`Tamaño ${D().sizes[s.size] || s.size} · Velocidad ${s.speed} pies`]))));
    const s = spc();
    if (s.subspecies.length) {
      el.append(h('label', { class: 'field' }, s.subspecies[0].name.split(':')[0],
        h('select', { onchange: (e) => { draft.subspecies = e.target.value; renderWizard(); } }, s.subspecies.map((x) => h('option', { value: x.id, selected: draft.subspecies === x.id, text: x.name.split(': ')[1] || x.name })))));
    }
    if (s.id === 'elf') {
      el.append(h('label', { class: 'field' }, 'Sentidos agudos (competencia)', h('select', { onchange: (e) => { draft.speciesSkill = e.target.value; renderWizard(); } },
        ['insight', 'perception', 'survival'].map((k) => h('option', { value: k, selected: draft.speciesSkill === k, text: skillName(k) })))));
    }
    if (s.id === 'human') {
      el.append(h('label', { class: 'field' }, 'Habilidoso: una habilidad', h('select', { onchange: (e) => { draft.speciesSkill = e.target.value; renderWizard(); } },
        D().skills.map((k) => h('option', { value: k.id, selected: draft.speciesSkill === k.id, text: k.name })))));
      el.append(h('label', { class: 'field' }, 'Versátil: una dote de origen', h('select', { onchange: (e) => { draft.humanFeat = e.target.value; renderWizard(); } },
        D().feats.filter((f) => f.type === 'origin').map((f) => h('option', { value: f.id, selected: draft.humanFeat === f.id, text: f.name })))));
      featExtras(el, draft.humanFeat);
    }
    const sub = s.subspecies.find((x) => x.id === draft.subspecies);
    el.append(h('div', { class: 'info-box' }, h('h4', { text: `Rasgos: ${s.name}` }),
      [...s.traits.filter((t) => !/^(High Elf|Wood Elf|Drow|Forest Gnome|Rock Gnome):/.test(t.name)), ...(sub ? sub.traits : [])].map((t) => h('details', null, h('summary', { text: t.name }), h('div', { class: 'detail-text', text: t.desc })))));
  }

  // Elecciones de dotes con opciones (Habilidoso, Iniciado en la magia)
  function featExtras(el, featId) {
    if (featId === 'skilled') {
      draft.featChoice = draft.featChoice || {};
      const chosen = new Set(draft.featChoice.skilled || []);
      el.append(h('div', { class: 'field' }, `Habilidoso: elige 3 habilidades (${chosen.size}/3)`, h('div', { class: 'check-grid' }, D().skills.map((k) => h('label', null,
        h('input', { type: 'checkbox', checked: chosen.has(k.id), onchange: (e) => { if (e.target.checked) chosen.add(k.id); else chosen.delete(k.id); draft.featChoice.skilled = [...chosen].slice(0, 3); renderWizard(); } }), k.name)))));
    }
    if (featId === 'magic-initiate') {
      draft.featChoice = draft.featChoice || {};
      const fixedCls = bgd().feat.id === 'magic-initiate' && bgd().feat.note ? bgd().feat.note.toLowerCase() : null;
      const listCls = fixedCls || draft.featChoice.miClass || 'wizard';
      const mi = draft.featChoice.magicInitiate || { cantrips: [], spell: null };
      if (!fixedCls) el.append(h('label', { class: 'field' }, 'Iniciado en la magia: lista', h('select', { onchange: (e) => { draft.featChoice.miClass = e.target.value; draft.featChoice.magicInitiate = { cantrips: [], spell: null }; renderWizard(); } },
        ['cleric', 'druid', 'wizard'].map((c) => h('option', { value: c, selected: listCls === c, text: D().byId.classes[c].name })))));
      const can = Object.values(SP()).filter((s) => s.level === 0 && s.classes.includes(listCls));
      const one = Object.values(SP()).filter((s) => s.level === 1 && s.classes.includes(listCls));
      const set = new Set(mi.cantrips);
      el.append(h('div', { class: 'field' }, `Iniciado en la magia (${D().byId.classes[listCls].name}): 2 trucos (${set.size}/2)`, h('div', { class: 'check-grid' }, can.map((s) => h('label', null,
        h('input', { type: 'checkbox', checked: set.has(s.id), onchange: (e) => { if (e.target.checked) set.add(s.id); else set.delete(s.id); draft.featChoice.magicInitiate = { cls: listCls, cantrips: [...set].slice(0, 2), spell: mi.spell }; renderWizard(); } }),
        s.name + (RULES.COMBAT_SPELLS[s.id] ? ' ⚔' : ''))))));
      el.append(h('label', { class: 'field' }, 'Y 1 conjuro de nivel 1', h('select', { onchange: (e) => { draft.featChoice.magicInitiate = { cls: listCls, cantrips: [...set], spell: e.target.value }; renderWizard(); } },
        h('option', { value: '', text: '—' }), one.map((s) => h('option', { value: s.id, selected: mi.spell === s.id, text: s.name + (RULES.COMBAT_SPELLS[s.id] ? ' ⚔' : '') })))));
    }
  }

  // ----- Paso 3: trasfondo -----
  function stepBackground(el) {
    el.append(h('h3', { text: 'Elige tu trasfondo' }), h('p', { class: 'note', text: 'En las reglas de 2024 el trasfondo da los aumentos de característica, una dote de origen y dos habilidades.' }));
    el.append(h('div', { class: 'pick-grid' }, D().backgrounds.map((b) => card(draft.background === b.id, () => {
      draft.background = b.id;
      const ord = b.abilities.slice().sort((x, y) => (draft.base[y] || 0) - (draft.base[x] || 0));
      draft.bonus = { [ord[0]]: 2, [ord[1]]: 1 };
      draft.skills = (draft.skills || []).filter((k) => !b.skills.includes(k));
      draft.featChoice = {};
      renderWizard();
    }, b.name, [`Características: ${b.abilities.map((a) => abilityName(a).abbr).join(', ')}`, `Dote: ${D().byId.feats[b.feat.id].name}${b.feat.note ? ` (${D().byId.classes[b.feat.note.toLowerCase()] ? D().byId.classes[b.feat.note.toLowerCase()].name : b.feat.note})` : ''}`, `Habilidades: ${b.skills.map(skillName).join(', ')}`]))));
    const b = bgd();
    // reparto +2/+1 o +1/+1/+1
    const pattern = Object.values(draft.bonus).length === 3 ? '111' : '21';
    el.append(h('div', { class: 'field' }, 'Aumentos de característica',
      h('div', { class: 'edit-row' },
        h('button', { type: 'button', class: 'btn' + (pattern === '21' ? '' : ' alt'), text: '+2 y +1', onclick: () => { draft.bonus = { [b.abilities[0]]: 2, [b.abilities[1]]: 1 }; renderWizard(); } }),
        h('button', { type: 'button', class: 'btn' + (pattern === '111' ? '' : ' alt'), text: '+1 a las tres', onclick: () => { draft.bonus = Object.fromEntries(b.abilities.map((a) => [a, 1])); renderWizard(); } })),
      pattern === '21' ? h('div', { class: 'edit-row' },
        h('label', null, '+2 a ', h('select', { onchange: (e) => { const two = e.target.value; const one = Object.keys(draft.bonus).find((a) => draft.bonus[a] === 1); draft.bonus = { [two]: 2 }; draft.bonus[one !== two ? one : b.abilities.find((a) => a !== two)] = 1; renderWizard(); } },
          b.abilities.map((a) => h('option', { value: a, selected: draft.bonus[a] === 2, text: abilityName(a).name })))),
        h('label', null, '+1 a ', h('select', { onchange: (e) => { const two = Object.keys(draft.bonus).find((a) => draft.bonus[a] === 2); if (e.target.value === two) return renderWizard(); draft.bonus = { [two]: 2, [e.target.value]: 1 }; renderWizard(); } },
          b.abilities.map((a) => h('option', { value: a, selected: draft.bonus[a] === 1, disabled: draft.bonus[a] === 2, text: abilityName(a).name }))))) : null));
    featExtras(el, b.feat.id);
    const ft = D().byId.feats[b.feat.id];
    el.append(h('div', { class: 'info-box' }, h('h4', { text: `Dote: ${ft.name}` }), h('div', { class: 'detail-text', text: ft.desc }),
      h('h4', { text: 'Herramientas' }), h('p', { text: b.tools.join(', ') || '—' }), h('h4', { text: 'Equipo del trasfondo' }), h('p', { text: b.equipment.join(' ') })));
  }

  // ----- Paso 4: características -----
  function stepAbilities(el) {
    el.append(h('h3', { text: 'Puntuaciones de característica' }));
    const methods = { standard: 'Serie estándar (15, 14, 13, 12, 10, 8)', pointbuy: 'Compra de puntos (27)', roll: 'Tirar 4d6 (quitar el menor)' };
    el.append(h('div', { class: 'edit-row' }, Object.entries(methods).map(([k, n]) => h('button', {
      type: 'button', class: 'btn' + (draft.method === k ? '' : ' alt'), text: n,
      onclick: () => { draft.method = k; if (k === 'pointbuy') draft.base = Object.fromEntries(RULES.ABIL.map((a) => [a, 8])); if (k === 'standard') draft.base = RULES.pregen(draft.class, draft.species, {}).base; renderWizard(); },
    }))));
    const table = h('div', { class: 'abil-edit' });
    if (draft.method === 'standard') {
      for (const a of RULES.ABIL) {
        table.append(h('label', null, abilityName(a).name, h('select', { onchange: (e) => {
          const v = Number(e.target.value); const other = RULES.ABIL.find((x) => x !== a && draft.base[x] === v);
          if (other) draft.base[other] = draft.base[a];
          draft.base[a] = v; renderWizard();
        } }, D().standardArray.map((n) => h('option', { value: n, selected: draft.base[a] === n, text: n })))));
      }
    } else if (draft.method === 'pointbuy') {
      const spent = RULES.ABIL.reduce((t, a) => t + (D().pointBuy.cost[draft.base[a]] ?? 99), 0);
      el.append(h('p', { class: 'note', text: `Puntos gastados: ${spent} / ${D().pointBuy.budget}` }));
      for (const a of RULES.ABIL) {
        table.append(h('div', { class: 'pb-row' }, h('span', { text: abilityName(a).name }),
          h('button', { type: 'button', class: 'btn alt', text: '−', disabled: draft.base[a] <= 8, onclick: () => { draft.base[a]--; renderWizard(); } }),
          h('b', { text: draft.base[a] }),
          h('button', { type: 'button', class: 'btn', text: '+', disabled: draft.base[a] >= 15 || spent - D().pointBuy.cost[draft.base[a]] + D().pointBuy.cost[draft.base[a] + 1] > D().pointBuy.budget, onclick: () => { draft.base[a]++; renderWizard(); } }),
          h('small', { text: `coste ${D().pointBuy.cost[draft.base[a]]}` })));
      }
    } else {
      el.append(h('button', { type: 'button', class: 'btn', text: '🎲 TIRAR LAS SEIS', onclick: () => {
        for (const a of RULES.ABIL) { const r = [0, 0, 0, 0].map(() => 1 + Math.floor(Math.random() * 6)).sort((x, y) => y - x); draft.base[a] = r[0] + r[1] + r[2]; }
        renderWizard();
      } }), h('p', { class: 'note', text: 'Puedes intercambiar valores entre características con los selectores.' }));
      const vals = RULES.ABIL.map((a) => draft.base[a]);
      for (const a of RULES.ABIL) {
        table.append(h('label', null, abilityName(a).name, h('select', { onchange: (e) => {
          const i = Number(e.target.value); const target = RULES.ABIL[i];
          const tmp = draft.base[a]; draft.base[a] = draft.base[target]; draft.base[target] = tmp; renderWizard();
        } }, vals.map((n, i) => h('option', { value: i, selected: RULES.ABIL[i] === a, text: `${n} (de ${abilityName(RULES.ABIL[i]).abbr})` })))));
      }
    }
    el.append(table);
    el.append(h('table', { class: 'mini-table' }, h('thead', null, h('tr', null, ['Característica', 'Base', 'Trasfondo', 'Total', 'Mod.'].map((t) => h('th', { text: t })))),
      h('tbody', null, RULES.ABIL.map((a) => { const tot = (draft.base[a] || 0) + (draft.bonus[a] || 0); return h('tr', null, h('td', { text: abilityName(a).name }), h('td', { text: draft.base[a] }), h('td', { text: draft.bonus[a] ? `+${draft.bonus[a]}` : '' }), h('td', { text: tot }), h('td', { text: RULES.fmt(RULES.mod(tot)) })); }))));
  }

  // ----- Paso 5: habilidades -----
  function stepSkills(el) {
    const c = cls(); const b = bgd();
    const chosen = new Set(draft.skills || []);
    el.append(h('h3', { text: 'Habilidades' }), h('p', { class: 'note', text: `${c.name}: ${c.skillChoices.count} a elegir. Ya tienes por el trasfondo: ${b.skills.map(skillName).join(', ')}.` }));
    el.append(h('div', { class: 'check-grid' }, c.skillChoices.from.map((k) => h('label', { class: b.skills.includes(k) ? 'disabled' : '' },
      h('input', { type: 'checkbox', disabled: b.skills.includes(k), checked: chosen.has(k) || b.skills.includes(k), onchange: (e) => {
        if (e.target.checked) { if (chosen.size >= c.skillChoices.count) { e.target.checked = false; return; } chosen.add(k); } else chosen.delete(k);
        draft.skills = [...chosen]; renderWizard();
      } }), `${skillName(k)} (${abilityName(D().byId.skills[k].ability).abbr})`))));
    if (c.id === 'rogue') {
      const all = [...new Set([...b.skills, ...draft.skills, ...(draft.speciesSkill ? [draft.speciesSkill] : [])])];
      const ex = new Set(draft.expertise || []);
      el.append(h('div', { class: 'field' }, `Pericia: dobla tu competencia en 2 habilidades (${ex.size}/2)`, h('div', { class: 'check-grid' }, all.map((k) => h('label', null,
        h('input', { type: 'checkbox', checked: ex.has(k), onchange: (e) => { if (e.target.checked) { if (ex.size >= 2) { e.target.checked = false; return; } ex.add(k); } else ex.delete(k); draft.expertise = [...ex]; renderWizard(); } }), skillName(k))))));
    }
    if (c.id === 'fighter' || ((c.id === 'paladin' || c.id === 'ranger') && lv() >= 2)) {
      el.append(h('label', { class: 'field' }, 'Estilo de combate', h('select', { onchange: (e) => { draft.fightingStyle = e.target.value; renderWizard(); } },
        D().feats.filter((f) => f.type === 'fighting-style').map((f) => h('option', { value: f.id, selected: draft.fightingStyle === f.id, text: f.name })))));
      const fs = D().byId.feats[draft.fightingStyle];
      if (fs) el.append(h('div', { class: 'info-box' }, h('div', { class: 'detail-text', text: fs.desc })));
    }
  }

  // ----- Paso 6: equipo -----
  function stepEquipment(el) {
    const c = cls();
    const armorOk = (a) => c.armor.includes('all-armor') || c.armor.includes(`${a.kind}-armor`);
    const weaponOk = (w) => c.weapons.includes(`${w.category}-weapons`) || c.weapons.includes(`${w.id}s`);
    el.append(h('h3', { text: 'Equipo' }), h('p', { class: 'note', text: 'Elige armadura, escudo y hasta tres armas. Las marcadas con ✔ son de tu competencia (sin competencia no sumas tu bonificador al ataque).' }));
    el.append(h('label', { class: 'field' }, 'Armadura', h('select', { onchange: (e) => { draft.armor = e.target.value || null; renderWizard(); } },
      h('option', { value: '', text: 'Sin armadura' }),
      D().armor.filter((a) => a.kind !== 'shield').map((a) => h('option', { value: a.id, selected: draft.armor === a.id, text: `${armorOk(a) ? '✔ ' : ''}${a.name} · CA ${a.base}${a.dex ? (a.maxDex != null ? ` + Des (máx. ${a.maxDex})` : ' + Des') : ''}${a.str ? ` · Fue ${a.str}` : ''}${a.stealth ? ' · desventaja en Sigilo' : ''}` })))));
    el.append(h('label', { class: 'check-line' }, h('input', { type: 'checkbox', checked: draft.shield, onchange: (e) => { draft.shield = e.target.checked; renderWizard(); } }), `Escudo (+2 CA)${c.armor.includes('shields') ? ' ✔' : ''}`));
    for (let i = 0; i < 3; i++) {
      el.append(h('label', { class: 'field' }, `Arma ${i + 1}`, h('select', { onchange: (e) => { const w = draft.weapons.slice(); w[i] = e.target.value; draft.weapons = w.filter(Boolean); renderWizard(); } },
        h('option', { value: '', text: '—' }),
        D().weapons.slice().sort((a, b) => (weaponOk(b) - weaponOk(a)) || a.name.localeCompare(b.name, 'es')).map((w) => h('option', { value: w.id, selected: draft.weapons[i] === w.id,
          text: `${weaponOk(w) ? '✔ ' : ''}${w.name} · ${w.damage} ${dmgName(w.type)}${w.properties.length ? ' · ' + w.properties.map((p) => D().properties.find((x) => x.id === p).name).join(', ') : ''}${w.mastery ? ` · maestría: ${D().masteries.find((x) => x.id === w.mastery).name}` : ''}` })))));
    }
    el.append(h('div', { class: 'info-box' }, h('h4', { text: 'Equipo inicial oficial' }), c.equipment.map((t) => h('p', { text: t })), bgd().equipment.map((t) => h('p', { text: t }))));
  }

  // ----- Paso 7: conjuros -----
  function stepSpells(el) {
    const c = cls();
    el.append(h('h3', { text: 'Conjuros' }));
    if (!c.spellcasting) { el.append(h('p', { text: `${c.name} no lanza conjuros${['paladin', 'ranger'].includes(c.id) ? ' hasta nivel 2' : ''}.` })); return; }
    const row = c.levels[lv() - 1];
    if (!row.cantrips && !row.prepared) { el.append(h('p', { text: `${c.name} aún no prepara conjuros a nivel ${lv()}.` })); return; }
    const maxL = row.slots.reduce((m, n, i) => (n ? i + 1 : m), 0);
    el.append(h('p', { class: 'note', text: `A nivel ${lv()}: ${row.cantrips} trucos y ${row.prepared} conjuros preparados (hasta nivel ${maxL}). ⚔ = se puede lanzar en las mazmorras del juego. Pulsa ℹ para leer el conjuro.` }));
    const listFor = (min, max) => Object.values(SP()).filter((s) => s.classes.includes(c.id) && s.level >= min && s.level <= max).sort((a, b) => a.level - b.level || (RULES.COMBAT_SPELLS[b.id] ? 1 : 0) - (RULES.COMBAT_SPELLS[a.id] ? 1 : 0) || a.name.localeCompare(b.name, 'es'));
    const block = (title, list, key, max) => {
      const set = new Set(draft[key] || []);
      el.append(h('div', { class: 'field' }, `${title} (${set.size}/${max})`, h('div', { class: 'check-grid spells' }, list.map((s) => h('label', null,
        h('input', { type: 'checkbox', checked: set.has(s.id), onchange: (e) => { if (e.target.checked) { if (set.size >= max) { e.target.checked = false; return; } set.add(s.id); } else set.delete(s.id); draft[key] = [...set]; renderWizard(); } }),
        `${s.level ? s.level + 'º ' : ''}${s.name}${RULES.COMBAT_SPELLS[s.id] ? ' ⚔' : ''}`,
        h('button', { type: 'button', class: 'info-btn', title: 'Leer', text: 'ℹ', onclick: (e) => { e.preventDefault(); spellDetail(s.id); } }))))));
    };
    if (row.cantrips) block('Trucos', listFor(0, 0), 'cantrips', row.cantrips);
    if (row.prepared) block('Conjuros preparados', listFor(1, maxL), 'spells', row.prepared);
  }

  // ----- Paso 8: detalles -----
  function stepDetails(el) {
    el.append(h('h3', { text: 'Detalles' }));
    el.append(h('label', { class: 'field' }, 'Nombre del personaje', h('input', { maxlength: 24, value: draft.name, oninput: (e) => { draft.name = e.target.value; } , onchange: () => renderWizard() })));
    el.append(h('label', { class: 'field' }, 'Alineamiento', h('select', { onchange: (e) => { draft.alignment = e.target.value; renderWizard(); } },
      D().alignments.map((a) => h('option', { value: a.id, selected: draft.alignment === a.id, text: a.name })))));
    if (draft.species !== 'dragonborn') {
      el.append(h('div', { class: 'field' }, 'Piel', h('div', { class: 'swatches' }, MAP.skinsFor(draft.species).map((i) => h('button', { type: 'button', class: draft.look.skin === i ? 'on' : '', style: `background:${MAP.SKINS[i]}`, onclick: () => { draft.look.skin = i; renderWizard(); } })))));
    }
    el.append(h('div', { class: 'field' }, 'Pelo', h('div', { class: 'swatches' }, MAP.HAIRS.map((c, i) => h('button', { type: 'button', class: draft.look.hair === i ? 'on' : '', style: `background:${c}`, onclick: () => { draft.look.hair = i; renderWizard(); } })))));
    el.append(h('p', { class: 'note', text: 'Al guardar, tu héroe en la taberna cambia de aspecto y tus amigos verán tu ficha nueva. La experiencia y el oro se conservan.' }));
  }

  function save() {
    const v = RULES.validate(draft, draft.xp);
    if (!v.ok) { DD.toast(v.errors[0]); return; }
    DD.net.send({ t: 'sheet:save', sheet: v.sheet });
  }
  DD.on('sheet:saved', (m) => {
    if (!m.ok) { DD.toast(m.errors[0]); return; }
    DD.toast('📜 Ficha guardada.');
    setTimeout(() => showSheet(DD.myId), 200);
  });

  DD.on('open-sheet', (id) => showSheet(id || DD.myId));
  DD.on('sheet', (m) => { if (!overlay.classList.contains('hidden') && !draft && m.id) showSheet(m.id); });
  window.__openWizard = openWizard;
})();
