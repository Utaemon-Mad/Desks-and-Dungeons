/* global DD, RULES, MAP, SPRITES, DSPRITES, PROG */
// Ventanas del juego: tu retrato (con el icono rojo al subir de nivel), reparto de puntos, ficha, equipo e
// inventario, tiendas de los tres comerciantes, comercio entre jugadores, guía y tooltips de objetos.
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const me = () => DD.me;
  const derived = () => (DD.me ? RULES.derive(DD.me) : null);
  const inTavern = () => DD.scene === 'tavern';

  function iconCanvas(src, size = 32) {
    const c = document.createElement('canvas'); c.width = size; c.height = size;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(src, 0, 0, size, size);
    return c;
  }
  const itemIcon = (it, size) => iconCanvas(DSPRITES.itemIcon(it), size);
  function consIcon(id, size = 32) { const C = RULES.CONSUMABLES[id]; return iconCanvas(C.spell ? DSPRITES.scroll(C.color) : DSPRITES.potion(C.color), size); }

  function openOverlay(id) { if ($('#' + id).classList.contains('hidden')) DD.sfx('open'); document.querySelectorAll('.overlay.win').forEach((o) => { if (o.id !== id) o.classList.add('hidden'); }); $('#' + id).classList.remove('hidden'); hideTip(); }
  function closeOverlay(id) { if (!$('#' + id).classList.contains('hidden')) DD.sfx('close'); $('#' + id).classList.add('hidden'); hideTip(); }
  document.querySelectorAll('.overlay.win').forEach((o) => {
    o.addEventListener('pointerdown', (e) => { if (e.target === o) closeOverlay(o.id); });
    const x = o.querySelector('.close-x'); if (x) x.onclick = () => { closeOverlay(o.id); if (o.id === 'tradewin') DD.net.send({ t: 'trade:cancel' }); };
  });
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const open = [...document.querySelectorAll('.overlay.win:not(.hidden)')];
    for (const o of open) { closeOverlay(o.id); if (o.id === 'tradewin') DD.net.send({ t: 'trade:cancel' }); }
  });

  // ======================================================================
  //  Tooltip de objetos (con comparación con lo que llevas puesto)
  // ======================================================================
  const tip = $('#tip');
  function hideTip() { tip.classList.add('hidden'); }
  function showTip(it, ev, extra) {
    tip.innerHTML = '';
    const R = RULES.RARITIES[it.rarity] || RULES.RARITIES.normal;
    const name = el('div', 'tip-name', (it.leg ? '★ ' : '') + it.name); name.style.color = RULES.itemColor ? RULES.itemColor(it) : R.color;
    tip.append(name, el('div', 'tip-type', it.leg ? RULES.typeLine(it).replace('Único', 'Legendario') : RULES.typeLine(it)));
    const p = me();
    // características que tendrías sin lo que llevas en ese hueco (para los requisitos)
    const stats = p ? RULES.derive({ ...p, equip: { ...p.equip, [it.slot]: p.equip[it.slot] && p.equip[it.slot].id === it.id ? it : undefined } }).stats : null;
    for (const l of RULES.describeRich(it, stats)) tip.appendChild(el('div', 'tip-line' + (l.c ? ' ' + l.c : ''), l.t));
    if (p) {
      const lvl = RULES.levelFromXp(p.xp);
      const can = RULES.canEquip(it, p.char, lvl, stats);
      const req = el('div', 'tip-req', `Nivel ${it.req || 1}`);
      if (!can.ok) { req.textContent = can.reason; req.classList.add('bad'); }
      tip.appendChild(req);
      const cur = p.equip[it.slot];
      if (cur && cur.id !== it.id) {
        const diff = [];
        if (it.dmg && cur.dmg) { const d = Math.round(((it.dmg[0] + it.dmg[1]) - (cur.dmg[0] + cur.dmg[1])) / 2); if (d) diff.push([`${d > 0 ? '+' : ''}${d} de daño medio`, d > 0]); }
        if ((it.armor || 0) !== (cur.armor || 0)) { const d = (it.armor || 0) - (cur.armor || 0); diff.push([`${d > 0 ? '+' : ''}${d} de armadura`, d > 0]); }
        for (const k of new Set([...Object.keys(it.stats || {}), ...Object.keys(cur.stats || {})])) {
          const d = Math.round(((it.stats[k] || 0) - (cur.stats[k] || 0)) * 10) / 10;
          if (d) diff.push([RULES.fmtStat(k, Math.abs(d)).replace(/^[+-]?/, d > 0 ? '+' : '-').replace(/^\+-/, '-'), d > 0]);
        }
        if (diff.length) {
          tip.appendChild(el('div', 'tip-cmp-t', `Frente a «${cur.name}»:`));
          for (const [t, good] of diff) tip.appendChild(el('div', 'tip-cmp ' + (good ? 'up' : 'down'), (good ? '▲ ' : '▼ ') + t));
        }
      }
    }
    if (it.set) {
      const S = RULES.SETS[it.set];
      const n = p ? RULES.SLOT_IDS.filter((s) => p.equip[s] && p.equip[s].set === it.set).length : 0;
      tip.appendChild(el('div', 'tip-set', `Conjunto ${S.name} (${n}/4)`));
      tip.appendChild(el('div', 'tip-set' + (n >= 2 ? ' on' : ''), '2 piezas: ' + Object.entries(S.b2).map(([k, v]) => RULES.fmtStat(k, v)).join(', ')));
      tip.appendChild(el('div', 'tip-set' + (n >= 4 ? ' on' : ''), '4 piezas: ' + Object.entries(S.b4).map(([k, v]) => RULES.fmtStat(k, v)).join(', ')));
    }
    tip.appendChild(el('div', 'tip-value', extra || `Se vende por ${it.value} 🪙`));
    tip.classList.remove('hidden');
    moveTip(ev);
  }
  function moveTip(ev) {
    const r = tip.getBoundingClientRect();
    let x = ev.clientX + 16, y = ev.clientY + 12;
    if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - 16;
    if (y + r.height > innerHeight - 8) y = innerHeight - r.height - 8;
    tip.style.left = Math.max(4, x) + 'px'; tip.style.top = Math.max(4, y) + 'px';
  }
  let lastTouch = 0;
  function tipOn(node, it, extra) {
    node.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') lastTouch = Date.now(); });
    node.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') showTip(it, e, extra); });
    node.addEventListener('pointermove', (e) => { if (e.pointerType !== 'touch' && !tip.classList.contains('hidden')) moveTip(e); });
    node.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') hideTip(); });
  }
  // En móvil (sin ratón) la ficha del objeto se enseña arriba al tocarlo
  function touchTip(it, extra) {
    showTip(it, { clientX: 8, clientY: 8 }, extra);
    tip.style.left = '8px'; tip.style.top = '8px';
  }
  document.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch' && !e.target.closest('.icell, .ctx-menu')) hideTip(); });
  DD.showItemTip = showTip;
  DD.hideItemTip = hideTip;
  DD.ui = { el, openOverlay, closeOverlay, itemCell: (it, o) => itemCell(it, o), actionMenu: (e, a) => actionMenu(e, a), hideTip };

  // Casilla de objeto (icono con borde de rareza)
  function itemCell(it, opts = {}) {
    const b = el('button', 'icell ' + (it ? 'r-' + it.rarity + (it.leg ? ' r-leg' : '') : 'empty'));
    b.type = 'button';
    if (it) {
      let art = null;
      if (opts.art && window.VIEW3D && VIEW3D.itemArt) { try { art = VIEW3D.itemArt(it, opts.art[0], opts.art[1]); } catch { art = null; } }
      if (art) { art.className = 'art'; b.appendChild(art); } else b.appendChild(itemIcon(it, 36));
      if (it.set) b.classList.add('set');
      const p = me();
      // en rojo lo que no puedes llevar (nivel o requisitos de características, sin contar lo que ya llevas en ese hueco)
      if (p && RULES.SLOTS[it.slot] && !(p.equip[it.slot] && p.equip[it.slot].id === it.id)) {
        const st = RULES.derive({ ...p, equip: { ...p.equip, [it.slot]: undefined } }).stats;
        if (!RULES.canEquip(it, p.char, RULES.levelFromXp(p.xp), st).ok) b.classList.add('cant');
      }
      tipOn(b, it, opts.tipExtra);
      if (opts.price !== undefined) { const pr = el('span', 'price', `${opts.price}🪙`); b.appendChild(pr); }
    } else if (opts.slot) {
      const s = el('span', 'slot-ico', RULES.SLOTS[opts.slot].icon); b.appendChild(s);
      b.title = RULES.SLOTS[opts.slot].name;
    }
    b.onclick = (e) => {
      const touch = Date.now() - lastTouch < 800;
      if (touch && it) touchTip(it, opts.tipExtra); else hideTip();
      if (opts.onClick) opts.onClick(e);
    };
    return b;
  }

  // Menú pequeño de acciones sobre un objeto
  function actionMenu(ev, actions) {
    closeMenu();
    const m = el('div', 'ctx-menu panel');
    for (const [label, fn, danger] of actions) {
      const b = el('button', danger ? 'danger' : '', label); b.type = 'button';
      b.onclick = (e) => { e.stopPropagation(); closeMenu(); fn(); };
      m.appendChild(b);
    }
    document.body.appendChild(m);
    const r = m.getBoundingClientRect();
    m.style.left = Math.min(innerWidth - r.width - 6, ev.clientX) + 'px';
    m.style.top = Math.min(innerHeight - r.height - 6, ev.clientY) + 'px';
    setTimeout(() => document.addEventListener('pointerdown', closeMenuOutside), 0);
  }
  function closeMenuOutside(e) { if (!e.target.closest('.ctx-menu')) closeMenu(); }
  function closeMenu() { document.querySelectorAll('.ctx-menu').forEach((m) => m.remove()); document.removeEventListener('pointerdown', closeMenuOutside); }

  // ======================================================================
  //  Tu retrato: nivel, vida, energía, experiencia, oro y el icono rojo de puntos
  // ======================================================================
  const hud = $('#myhero');
  let combat = null;
  DD.on('combat', (c) => { combat = c; renderHud(); });
  DD.on('dexit', () => { combat = null; renderHud(); });
  DD.on('me', () => { renderHud(); if (!$('#charwin').classList.contains('hidden')) renderChar(); if (!$('#levelup').classList.contains('hidden')) renderLevelUp(); if (!$('#tradewin').classList.contains('hidden')) renderTrade(); if (shop && !$('#shopwin').classList.contains('hidden')) renderShop(); });
  DD.on('look', (m) => { if (m.id === DD.myId) { renderHud(true); if (!$('#charwin').classList.contains('hidden')) renderChar(); } });
  DD.on('me-stats', () => renderHud());
  DD.on('welcome', () => { hud.classList.remove('hidden'); });

  let lastLook = '';
  function renderHud(force) {
    const p = me();
    if (!p) return;
    const d = derived();
    const u = DD.users.get(DD.myId);
    const look = u ? u.look : null;
    const key = JSON.stringify(look);
    if (look && (force || key !== lastLook)) {
      lastLook = key;
      const pc = $('#mh-portrait');
      pc.innerHTML = '';
      pc.appendChild(DD.portrait(look, 40));
    }
    $('#mh-name').textContent = u ? u.name : '';
    $('#mh-class').textContent = `${RULES.CLASSES[p.char.cls].name} · nivel ${d.level}`;
    const hp = combat ? combat.hp : d.hp, maxHp = combat ? combat.maxHp : d.hp;
    const en = combat ? combat.en : d.en, maxEn = combat ? combat.maxEn : d.en;
    $('#mh-hp').style.width = Math.max(0, 100 * hp / maxHp) + '%';
    $('#mh-hp-t').textContent = `${Math.max(0, hp)}/${maxHp}`;
    $('#mh-en').style.width = Math.max(0, 100 * en / maxEn) + '%';
    $('#mh-en-t').textContent = `${Math.max(0, en)}/${maxEn}`;
    const base = RULES.XP_TABLE[d.level], next = RULES.XP_TABLE[d.level + 1] || base;
    $('#mh-xp').style.width = Math.min(100, 100 * (p.xp - base) / Math.max(1, next - base)) + '%';
    $('#mh-xp').parentElement.title = `${p.xp - base} / ${next - base} PX para el nivel ${d.level + 1}`;
    $('#mh-gold').textContent = p.gold;
    const badge = $('#mh-badge');
    badge.classList.toggle('hidden', d.points <= 0);
    badge.textContent = `+${d.points}`;
    const buffs = $('#mh-buffs');
    buffs.innerHTML = '';
    for (const b of d.buffs) {
      const B = RULES.BUFFS[b.id];
      const s = el('span', 'buff', B.icon);
      s.title = `${B.name}: ${B.desc.replace(/ durante.*/, '')} (quedan ${Math.ceil((b.until - Date.now()) / 60000)} min)`;
      buffs.appendChild(s);
    }
    if (combat && combat.tbuffs) for (const id of combat.tbuffs) { const A = RULES.ABILITY_BY_ID[id] || (id.startsWith('pet:') && RULES.PET_SKILLS[id.slice(4)] ? { icon: '🐾', name: RULES.PET_SKILLS[id.slice(4)].name } : null); if (A) { const s = el('span', 'buff tmp', A.icon); s.title = A.name; buffs.appendChild(s); } }
  }
  $('#mh-badge').onclick = (e) => { e.stopPropagation(); openLevelUp(); };
  $('#mh-portrait').onclick = () => openChar('ficha');
  setInterval(() => { if (me()) renderHud(); }, 30000);

  // Tarjeta del objeto recién recogido (con sus características)
  let cardTimer = 0;
  DD.on('dgot', (m) => {
    const it = m.item;
    const card = $('#lootcard');
    card.innerHTML = '';
    const R = RULES.RARITIES[it.rarity] || RULES.RARITIES.normal;
    const top = el('div', 'lc-top');
    top.appendChild(itemIcon(it, 40));
    const t = el('div', '');
    const nm = el('b', '', it.name); nm.style.color = R.color;
    t.append(nm, el('small', '', RULES.typeLine(it)));
    top.appendChild(t);
    card.appendChild(top);
    for (const l of RULES.describe(it)) card.appendChild(el('div', 'tip-line', l));
    const p = me();
    if (p) { const can = RULES.canEquip(it, p.char, RULES.levelFromXp(p.xp)); if (!can.ok) card.appendChild(el('div', 'tip-req bad', can.reason)); else card.appendChild(el('div', 'tip-req', 'Pulsa I para equiparlo')); }
    card.style.borderColor = R.color;
    // en la taberna, a la izquierda de la lista de héroes para no taparse
    const hl = $('#heroes');
    card.style.right = DD.scene === 'tavern' && hl && hl.offsetParent && innerWidth > 820 ? Math.round(innerWidth - hl.getBoundingClientRect().left + 10) + 'px' : '';
    card.classList.remove('hidden');
    clearTimeout(cardTimer);
    cardTimer = setTimeout(() => card.classList.add('hidden'), ['inferior', 'normal', 'superior'].includes(it.rarity) ? 3500 : 6000);
  });
  $('#lootcard').onclick = () => { $('#lootcard').classList.add('hidden'); openChar('equipo'); };

  // ======================================================================
  //  Subida de nivel: repartir puntos
  // ======================================================================
  const pending = {};
  function openLevelUp() {
    for (const k of RULES.STAT_IDS) pending[k] = 0;
    openOverlay('levelup');
    renderLevelUp();
  }
  DD.on('open-levelup', openLevelUp);
  DD.on('levelup', () => { const b = $('#mh-badge'); b.classList.remove('pulse'); void b.offsetWidth; b.classList.add('pulse'); });

  function renderLevelUp() {
    const p = me();
    if (!p) return;
    const d = derived();
    const used = Object.values(pending).reduce((a, b) => a + b, 0);
    const left = d.points - used;
    $('#lu-points').textContent = left;
    const box = $('#lu-stats');
    box.innerHTML = '';
    const preview = RULES.derive({ ...p, char: { ...p.char, alloc: Object.fromEntries(RULES.STAT_IDS.map((k) => [k, (p.char.alloc[k] || 0) + (pending[k] || 0)])) } });
    const main = new Set([RULES.CLASSES[p.char.cls].main]);
    for (const S of RULES.STATS) {
      const row = el('div', 'lu-row' + (main.has(S.id) ? ' main' : ''));
      const nm = el('div', 'lu-name');
      const nat = d.natural[S.id] + pending[S.id];
      nm.append(el('b', '', S.name), el('small', '', S.desc));
      const val = el('div', 'lu-val', String(d.stats[S.id] + pending[S.id]));
      val.title = `Natural ${nat}/${RULES.STAT_MAX}${d.stats[S.id] > d.natural[S.id] ? ` · +${d.stats[S.id] - d.natural[S.id]} del equipo` : ''}`;
      if (pending[S.id]) val.classList.add('up');
      if (nat >= RULES.STAT_MAX) val.classList.add('max');
      const room = RULES.STAT_MAX - nat;
      const minus = el('button', 'mini', '−'); minus.type = 'button';
      minus.disabled = !pending[S.id];
      minus.onclick = () => { pending[S.id]--; renderLevelUp(); };
      const plus = el('button', 'mini plus', '+'); plus.type = 'button';
      plus.disabled = left <= 0 || room <= 0;
      plus.title = room <= 0 ? `Máximo natural: ${RULES.STAT_MAX}` : '';
      plus.onclick = (e) => { pending[S.id] += e.shiftKey ? Math.min(5, left, room) : 1; renderLevelUp(); };
      row.append(nm, minus, val, plus);
      box.appendChild(row);
    }
    const diff = (a, b, label, f = (x) => x) => (a !== b ? `${label} ${f(a)} → <b>${f(b)}</b>` : '');
    $('#lu-preview').innerHTML = [
      diff(d.hp, preview.hp, '❤️ Vida'), diff(d.en, preview.en, '⚡ Energía'), diff(d.armor, preview.armor, '🛡️ Armadura'),
      diff(`${d.dmg[0]}–${d.dmg[1]}`, `${preview.dmg[0]}–${preview.dmg[1]}`, '⚔️ Daño'), diff(`${d.spell[0]}–${d.spell[1]}`, `${preview.spell[0]}–${preview.spell[1]}`, '✨ Hechizos'),
      diff(d.crit, preview.crit, '🎯 Crítico', (x) => x + '%'), diff(d.dodge, preview.dodge, '💨 Esquiva', (x) => x + '%'), diff(d.mf, preview.mf, '🍀 Botín', (x) => '+' + x + '%'),
    ].filter(Boolean).join('<br>') || `<span class="muted">Pulsa + para repartir tus puntos. Mayús + clic suma 5. Ninguna característica pasa de ${RULES.STAT_MAX} de forma natural; el equipo sí la sube más.</span>`;
    $('#lu-ok').disabled = !used;
  }
  $('#lu-ok').onclick = () => {
    const alloc = {}; for (const k of RULES.STAT_IDS) if (pending[k]) alloc[k] = pending[k];
    DD.net.send({ t: 'char:points', alloc });
    for (const k of RULES.STAT_IDS) pending[k] = 0;
    DD.blip(880, 0.1);
    closeOverlay('levelup');
  };
  $('#lu-reset').onclick = () => { for (const k of RULES.STAT_IDS) pending[k] = 0; renderLevelUp(); };

  // ======================================================================
  //  Personaje: ficha · equipo · habilidades
  // ======================================================================
  let charTab = 'ficha';
  function openChar(tab) { if (!me()) return; charTab = tab || charTab; openOverlay('charwin'); renderChar(); }
  DD.on('open-char', openChar);
  document.querySelectorAll('#char-tabs button').forEach((b) => { b.onclick = () => { charTab = b.dataset.tab; renderChar(); }; });

  function renderChar() {
    const p = me();
    if (!p) return;
    document.querySelectorAll('#char-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === charTab));
    const body = $('#char-body');
    body.innerHTML = '';
    if (charTab === 'ficha') body.appendChild(fichaView(p));
    else if (charTab === 'equipo') body.appendChild(equipView(p));
    else if (charTab === 'misiones') body.appendChild(questsView(p));
    else if (charTab === 'talentos') body.appendChild(talentsView(p));
    else body.appendChild(skillsView(p));
  }

  function fichaView(p) {
    const d = derived();
    const wrap = el('div', 'ficha');
    const left = el('div', 'ficha-left');
    const u = DD.users.get(DD.myId);
    const pv = document.createElement('canvas'); pv.width = 180; pv.height = 230; pv.className = 'ficha-pv';
    if (u) pv.getContext('2d').drawImage(DD.heroImage(u.look, 180, 230, 'full'), 0, 0);
    left.appendChild(pv);
    left.appendChild(el('div', 'ficha-name', u ? u.name : ''));
    const c1 = RULES.CLASSES[p.char.cls];
    const race = RULES.RACES[d.race];
    const look = (u && u.look) || {};
    left.appendChild(el('div', 'ficha-cls', `${c1.icon} ${c1.name} · ${race.name}${look.sex === 'f' ? ' (mujer)' : ''}`));
    left.appendChild(el('div', 'ficha-lvl', `Nivel ${d.level} · ${p.xp} PX`));
    left.appendChild(el('div', 'muted small', race.perkText));
    if (d.points > 0) { const b = el('button', 'btn red', `⭐ Repartir ${d.points} puntos`); b.onclick = openLevelUp; left.appendChild(b); }
    // aspecto, raza y clase: se cambian con el editor de personaje (sólo en la taberna)
    const edit = el('button', 'btn alt', '✏️ Aspecto, raza y clase');
    edit.onclick = () => {
      if (!inTavern()) { DD.toast('Vuelve a la taberna para cambiar tu aspecto, tu raza o tu clase.'); return; }
      closeOverlay('charwin');
      DD.emit('open-editor', { look: { ...look, cls: p.char.cls, gear: undefined } });
    };
    left.appendChild(edit);
    const respec = el('button', 'btn alt small', `Reiniciar puntos (${10 * d.level} 🪙)`);
    respec.onclick = () => { if (!inTavern()) { DD.toast('Sólo en la taberna.'); return; } if (confirm(`¿Reiniciar todos tus puntos por ${10 * d.level} de oro?`)) DD.net.send({ t: 'char:respec' }); };
    left.appendChild(respec);

    const right = el('div', 'ficha-right');
    right.appendChild(el('div', 'panel-title small', 'CARACTERÍSTICAS'));
    const stats = el('div', 'stat-grid');
    for (const S of RULES.STATS) {
      const box = el('div', 'stat-box');
      box.title = S.desc;
      const bonus = d.stats[S.id] - d.natural[S.id];
      box.append(el('span', 'abbr', S.name), el('b', '', String(d.stats[S.id])), el('small', '', `natural ${d.natural[S.id]}/${RULES.STAT_MAX}${bonus ? ` · ${bonus > 0 ? '+' : ''}${bonus} equipo` : ''}`));
      stats.appendChild(box);
    }
    right.appendChild(stats);
    right.appendChild(el('div', 'panel-title small', 'EN COMBATE'));
    const lines = [
      ['❤️ Vida', d.hp], ['⚡ Energía', d.en], ['🛡️ Armadura', `${d.armor}${d.block ? ` · bloqueo ${d.block}%` : ''}`],
      ['⚔️ Daño del arma', `${d.dmg[0]}–${d.dmg[1]} (${d.weapon.name})`],
      ['📈 Bonificación de daño', `+${d.statPct}% por ${RULES.statName(d.weapon.stat)} · +${d.mastery}% por nivel`],
      ['⏱️ Golpes por segundo', (1000 / d.atkMs).toFixed(2)], ['✨ Poder de hechizos', `${d.spell[0]}–${d.spell[1]}`], ['🎯 Puntería', '+' + d.hit + '%'],
      ['🎯 Crítico', `${d.crit}% (×${d.critMult})`], ['💨 Esquiva', d.dodge + '%'], ['🔮 Resistencia mágica', d.magicRes + '%'],
      ['💖 Regeneración', `${d.hpRegen}/s vida · ${d.enRegen}/s energía`], ['🍀 Hallazgo de botín', '+' + d.mf + '%'], ['🪙 Descuento en tiendas', d.discount + '%'],
    ];
    for (const [k, r] of Object.entries(d.elem || {})) lines.push([`${RULES.ELEMENTS[k].icon} Daño de ${RULES.ELEMENTS[k].name}`, `${r[0]}–${r[1]}`]);
    if (d.undead) lines.push(['💀 Contra no muertos', '+' + d.undead + '%']);
    if (d.lifesteal) lines.push(['🩸 Robo de vida', d.lifesteal + '%']);
    if (d.cdr) lines.push(['⏳ Enfriamiento', '-' + d.cdr + '%']);
    const tbl = el('div', 'derived');
    for (const [k, v] of lines) { const r = el('div', 'drow2'); r.append(el('span', '', k), el('b', '', String(v))); tbl.appendChild(r); }
    right.appendChild(tbl);
    if (d.sets.length) {
      right.appendChild(el('div', 'panel-title small', 'CONJUNTOS'));
      for (const s of d.sets) right.appendChild(el('div', 'tip-set on', `${s.name}: ${s.n}/4 piezas`));
    }
    if (d.buffs.length) {
      right.appendChild(el('div', 'panel-title small', 'BENDICIONES'));
      for (const b of d.buffs) { const B = RULES.BUFFS[b.id]; right.appendChild(el('div', 'buff-line', `${B.icon} ${B.name} · quedan ${Math.ceil((b.until - Date.now()) / 60000)} min`)); }
    }
    wrap.append(left, right);
    return wrap;
  }

  // Inventario al estilo de los RPG clásicos: retrato y mochila a la izquierda, muñeco con el equipo a la derecha
  // y un panel con lo que da tu equipo. Los objetos se ven en 3D. Arrastra de la mochila a un hueco para
  // equiparlo (o del hueco a la mochila para quitarlo); clic para ver las opciones.
  const DOLL = [
    ['casco', 'casco', [120, 120]], ['amuleto', 'amu', [64, 64]],
    ['arma', 'arma', [116, 206]], ['pecho', 'pecho', [152, 206]], ['mano', 'mano', [116, 206]],
    ['guantes', 'guan', [116, 116]], ['botas', 'botas', [152, 116]], ['anillo', 'ani', [64, 64]],
  ];
  function equipView(p) {
    const wrap = el('div', 'inv2');
    const left = el('div', 'inv-left'), right = el('div', 'inv-right');
    // ---- retrato ----
    const u = DD.users.get(DD.myId);
    const d = derived();
    const port = el('div', 'inv-portrait frame-orn');
    const pv = document.createElement('canvas'); pv.width = 300; pv.height = 230;
    if (u) { try { pv.getContext('2d').drawImage(DD.heroImage(u.look, 300, 230, 'full'), 0, 0); } catch { /* sin 3D */ } }
    port.appendChild(pv);
    const plate = el('div', 'inv-plate');
    plate.append(el('b', '', u ? u.name : ''), el('small', '', `${RULES.CLASSES[p.char.cls].name} · nivel ${d.level}`));
    port.appendChild(plate);
    left.appendChild(port);
    // ---- mochila ----
    const bagHead = el('div', 'inv-head');
    bagHead.append(el('span', '', `Mochila ${p.bag.length}/${RULES.BAG_SIZE}`), el('span', 'gold', `🪙 ${p.gold}`));
    left.appendChild(bagHead);
    const grid = el('div', 'inv-bag frame-orn');
    for (let i = 0; i < RULES.BAG_SIZE; i++) {
      const it = p.bag[i];
      const c = itemCell(it, { art: [60, 60], onClick: (e) => { if (it) itemActions(e, it); } });
      if (it) { c.draggable = true; c.ondragstart = (e) => { e.dataTransfer.setData('text/dd-item', it.id); e.dataTransfer.setData('text/dd-for-' + it.slot, '1'); c.classList.add('dragging'); }; c.ondragend = () => c.classList.remove('dragging'); }
      c.ondragover = (e) => { if (e.dataTransfer.types.includes('text/dd-slot')) { e.preventDefault(); c.classList.add('drop'); } };
      c.ondragleave = () => c.classList.remove('drop');
      c.ondrop = (e) => { c.classList.remove('drop'); const slot = e.dataTransfer.getData('text/dd-slot'); if (slot) { e.preventDefault(); DD.net.send({ t: 'inv:unequip', slot }); } };
      grid.appendChild(c);
    }
    left.appendChild(grid);
    const load = el('div', 'load' + (d.overloaded ? ' over' : ''), `⚖️ Carga ${d.weight} / ${d.capacity} kg${d.overloaded ? ' · ¡sobrecargado, andas más lento!' : ''}`);
    load.title = 'La Fuerza aumenta lo que puedes cargar. Una mascota lleva más.';
    left.appendChild(load);
    // ---- muñeco con el equipo ----
    const doll = el('div', 'inv-doll frame-orn');
    for (const [slot, area, size] of DOLL) {
      const it = p.equip[slot];
      const cell = itemCell(it, { slot, art: size, onClick: (e) => { if (it) actionMenu(e, [['Quitar', () => DD.net.send({ t: 'inv:unequip', slot })]]); } });
      cell.classList.add('doll-slot', 'ds-' + area);
      cell.style.gridArea = area;
      cell.appendChild(el('span', 'slot-name', RULES.SLOTS[slot].name));
      if (it) { cell.draggable = true; cell.ondragstart = (e) => e.dataTransfer.setData('text/dd-slot', slot); }
      // sólo se suelta en su hueco (el tipo del arrastre lleva la ranura del objeto)
      cell.ondragover = (e) => { if (e.dataTransfer.types.includes('text/dd-for-' + slot)) { e.preventDefault(); cell.classList.add('drop'); } };
      cell.ondragleave = () => cell.classList.remove('drop');
      cell.ondrop = (e) => { cell.classList.remove('drop'); const id = e.dataTransfer.getData('text/dd-item'); if (id && e.dataTransfer.types.includes('text/dd-for-' + slot)) { e.preventDefault(); DD.net.send({ t: 'inv:equip', id }); } };
      doll.appendChild(cell);
    }
    const armor = el('div', 'inv-armor');
    armor.innerHTML = `<span title="Armadura">🛡️ <b>${d.armor}</b></span><span title="Daño">⚔️ <b>${d.dmg[0]}–${d.dmg[1]}</b></span>`;
    armor.style.gridArea = 'stat';
    doll.appendChild(armor);
    right.appendChild(doll);
    // ---- panel: lo que da el equipo ----
    const info = el('div', 'inv-info frame-orn');
    const rows = [['❤️ Vida', d.hp], ['⚡ Energía', d.en], ['⚔️ Daño', `${d.dmg[0]}–${d.dmg[1]}`], ['✨ Hechizos', `${d.spell[0]}–${d.spell[1]}`], ['🛡️ Armadura', d.armor], ['🎯 Crítico', d.crit + '%'], ['💨 Esquiva', d.dodge + '%'], ['🔮 Res. mágica', d.magicRes + '%']];
    const tbl = el('div', 'inv-stats');
    for (const [k, v] of rows) tbl.append(el('span', '', k), el('b', '', String(v)));
    info.append(el('div', 'inv-head', 'Tu equipo'), tbl);
    const setN = {};
    for (const s2 of RULES.SLOT_IDS) if (p.equip[s2] && p.equip[s2].set) setN[p.equip[s2].set] = (setN[p.equip[s2].set] || 0) + 1;
    for (const [k, n] of Object.entries(setN)) info.appendChild(el('div', 'set-line', `Conjunto de ${RULES.CLASSES[k] ? RULES.CLASSES[k].name.toLowerCase() : k}: ${n} piezas`));
    info.appendChild(el('p', 'muted small', 'Arrastra un objeto de la mochila a su hueco para equiparlo, o del hueco a la mochila para quitarlo. Clic para más opciones. Lo que llevas cambia el aspecto de tu héroe.'));
    right.appendChild(info);
    // ---- pociones, materiales y mascota ----
    const extra = el('div', 'inv-extra');
    const cons = el('div', 'cons-row');
    for (const [id, n] of Object.entries(p.cons || {})) {
      const C = RULES.CONSUMABLES[id];
      const c = el('div', 'cons-cell'); c.title = `${C.name}: ${C.desc}`;
      c.append(consIcon(id, 28), el('span', 'cnt', String(n)));
      cons.appendChild(c);
    }
    if (cons.children.length) { extra.appendChild(el('div', 'inv-head', 'Pociones y pergaminos')); extra.appendChild(cons); }
    const mats = Object.entries(p.mats || {}).filter(([k, n]) => n > 0 && window.PROG && PROG.MATS[k]);
    if (mats.length) {
      const row = el('div', 'mats-row');
      for (const [k, n] of mats) { const t = el('span', 'mat', `${PROG.MATS[k].icon} ${n}`); t.title = PROG.MATS[k].name + (PROG.MATS[k].desc ? ' — ' + PROG.MATS[k].desc : ''); row.appendChild(t); }
      extra.appendChild(el('div', 'inv-head', 'Materiales'));
      extra.appendChild(row);
    }
    if (p.pet) {
      const P = RULES.PETS[p.pet.type];
      const plvl = RULES.petLevelFromXp(p.pet.xp);
      const st = RULES.petStats(p.pet.type, RULES.levelFromXp(p.xp), plvl);
      extra.appendChild(el('div', 'inv-head', `${P.icon} ${p.pet.name} (${RULES.petTitle(p.pet.type, plvl)}, nv ${plvl}) · lleva ${RULES.petBagWeight(p.pet)} / ${st.cap} kg`));
      const pg = el('div', 'bag small');
      for (let i = 0; i < 12; i++) {
        const it = p.pet.bag[i];
        pg.appendChild(itemCell(it, { onClick: () => { if (it) DD.net.send({ t: 'pet:take', id: it.id }); } }));
      }
      extra.appendChild(pg);
    }
    if (extra.children.length) right.appendChild(extra);
    wrap.append(left, right);
    return wrap;
  }

  function itemActions(e, it) {
    const acts = [];
    if (RULES.SLOTS[it.slot]) acts.push(['Equipar', () => DD.net.send({ t: 'inv:equip', id: it.id })]);
    if (inTavern()) acts.push([`Vender (${it.value} 🪙)`, () => DD.net.send({ t: 'shop:sell', id: it.id })]);
    if (me().pet) acts.push([`Dar a ${me().pet.name}`, () => DD.net.send({ t: 'pet:put', id: it.id })]);
    acts.push(['Tirar', () => { if (['inferior', 'normal', 'superior'].includes(it.rarity) || confirm(`¿Tirar «${it.name}»? Se perderá para siempre.`)) DD.net.send({ t: 'inv:drop', id: it.id }); }, true]);
    actionMenu(e, acts);
  }

  // Talentos: tres ramas por clase; cada escalón se abre con 3 puntos más en su rama
  function talentsView(p) {
    const d = derived();
    const c = p.char, t = c.talents || {};
    const wrap = el('div', 'talents');
    const head = el('div', 'tal-head');
    head.appendChild(el('b', '', `${d.talentPoints} punto${d.talentPoints === 1 ? '' : 's'} de talento libre${d.talentPoints === 1 ? '' : 's'}`));
    head.appendChild(el('span', 'muted small', ' · uno cada 2 niveles · para abrir cada fila hacen falta 3 puntos más en esa rama'));
    if (RULES.talentSpent(t)) {
      const rb = el('button', 'btn alt', `Reiniciar (${15 * d.level} 🪙)`);
      rb.onclick = () => { if (confirm('¿Reiniciar todos los talentos?')) DD.net.send({ t: 'talent:reset' }); };
      head.appendChild(rb);
    }
    wrap.appendChild(head);
    const cols = el('div', 'tal-trees');
    RULES.TALENTS[c.cls].forEach((tree, ti) => {
      const spent = tree.t.reduce((a, tl) => a + (t[tl.id] || 0), 0);
      const col = el('div', 'tal-tree');
      col.appendChild(el('div', 'tal-title', `${tree.icon} ${tree.name} · ${spent}`));
      tree.t.forEach((tl, i) => {
        const r = t[tl.id] || 0, open = spent >= i * 3, can = !RULES.canTalent(c, d.level, tl.id);
        const b = el('button', 'tal' + (r ? ' has' : '') + (r >= tl.max ? ' max' : '') + (open ? '' : ' locked') + (can ? ' can' : ''));
        b.type = 'button';
        b.append(el('span', 'tal-ic', tl.icon), el('b', '', tl.name), el('small', '', tl.desc), el('em', '', `${r}/${tl.max}`));
        b.title = open ? (can ? 'Clic para subir este talento' : RULES.canTalent(c, d.level, tl.id) || '') : `Pon ${i * 3} puntos en ${tree.name} para abrirlo`;
        b.onclick = () => { if (can) { DD.net.send({ t: 'talent:add', id: tl.id }); DD.sfx && DD.sfx('click'); } else DD.toast(RULES.canTalent(c, d.level, tl.id) || ''); };
        col.appendChild(b);
      });
      cols.appendChild(col);
    });
    wrap.appendChild(cols);
    return wrap;
  }

  function skillsView(p) {
    const d = derived();
    const wrap = el('div', 'skills');
    for (const a of d.abilities) {
      const r = el('div', 'skill-row' + (a.ready ? '' : ' locked'));
      { const ic = el('span', 'skill-ic'); if (window.ICONS) ic.appendChild(ICONS.skill(a, 26)); else ic.textContent = a.icon; r.append(ic); }
      const t = el('div', 'skill-t');
      t.append(el('b', '', `${a.name}${a.ready ? '' : ` · nivel ${a.unlock}`}`), el('small', '', `${RULES.CLASSES[a.cls].name} · ${a.cost} energía · ${a.cd / 1000} s · ${a.desc}`));
      r.appendChild(t);
      wrap.appendChild(r);
    }
    wrap.appendChild(el('p', 'muted small', 'En las mazmorras usa las teclas 1-8 (o los botones de abajo). Apuntan al enemigo bajo el ratón o al más cercano.'));
    return wrap;
  }

  // ======================================================================
  //  Tiendas
  // ======================================================================
  let shop = null;
  DD.on('open-shop', (npc) => { if (!inTavern() && npc !== 'bruja') return; shop = { npc }; openOverlay('shopwin'); $('#shop-body').innerHTML = '<p class="muted">…</p>'; DD.net.send({ t: 'shop:open', npc }); });
  DD.on('shop', (m) => { shop = m; if ($('#shopwin').classList.contains('hidden')) return; renderShop(); });
  DD.on('sold', (m) => { DD.toast(`Vendido por ${m.gold} 🪙`); DD.sfx('buy'); });

  function renderShop() {
    const p = me();
    if (!p || !shop || !shop.kind) return;
    const S = RULES.SHOPS[shop.npc];
    const m = MAP.MERCHANTS[shop.npc];
    const head = $('#shop-head');
    head.innerHTML = '';
    head.appendChild(DD.portrait({ cls: 'mago', skin: shop.npc === 'bruja' ? 6 : 1, hair: 0, ...m.look }, 40));
    const t = el('div', 'shop-title');
    t.append(el('b', '', S.name), el('small', '', S.title), el('q', '', S.greet));
    head.append(t, el('div', 'shop-gold', `🪙 ${p.gold}`));
    const body = $('#shop-body');
    body.innerHTML = '';
    const left = el('div', 'shop-stock');
    if (shop.kind === 'items') {
      left.appendChild(el('div', 'panel-title small', `A LA VENTA · se renueva en ${Math.max(1, Math.ceil((shop.refresh - Date.now()) / 60000))} min`));
      const grid = el('div', 'stock-grid');
      shop.items.forEach((it, i) => {
        const cell = itemCell(it.sold ? null : it, { price: it.sold ? undefined : it.price, tipExtra: `Precio: ${it.price} 🪙`, onClick: () => { if (!it.sold) buy({ i }, it.price, it.name); } });
        if (it.sold) { cell.classList.add('sold'); cell.appendChild(el('span', 'slot-ico', '✔')); }
        if (!it.sold && p.gold < it.price) cell.classList.add('poor');
        grid.appendChild(cell);
      });
      left.appendChild(grid);
    } else {
      left.appendChild(el('div', 'panel-title small', shop.kind === 'cons' ? 'POCIONES Y BREBAJES' : 'PERGAMINOS'));
      for (const c of shop.list) left.appendChild(consRow(c, p));
      if (shop.buffs) {
        left.appendChild(el('div', 'panel-title small', 'BENDICIONES (duran 20 minutos)'));
        for (const b of shop.buffs) {
          const B = RULES.BUFFS[b.id];
          const r = el('div', 'buy-row');
          r.append(el('span', 'buy-ic', B.icon));
          const tt = el('div', 'buy-t'); tt.append(el('b', '', B.name), el('small', '', B.desc)); r.appendChild(tt);
          const btn = el('button', 'btn', `${b.price} 🪙`); btn.disabled = p.gold < b.price;
          btn.onclick = () => DD.net.send({ t: 'shop:buy', npc: shop.npc, buff: b.id });
          r.appendChild(btn);
          left.appendChild(r);
        }
      }
    }
    const right = el('div', 'shop-sell');
    right.appendChild(el('div', 'panel-title small', 'VENDER (clic en un objeto)'));
    const grid = el('div', 'bag small');
    for (let i = 0; i < RULES.BAG_SIZE; i++) {
      const it = p.bag[i];
      grid.appendChild(itemCell(it, { tipExtra: it ? `Clic para vender por ${it.value} 🪙` : '', onClick: () => { if (it) { if (!['inferior', 'normal', 'superior', 'magico'].includes(it.rarity) && !confirm(`¿Vender «${it.name}» por ${it.value} de oro?`)) return; DD.net.send({ t: 'shop:sell', id: it.id }); } } }));
    }
    right.appendChild(grid);
    const commons = p.bag.filter((it) => ['inferior', 'normal', 'superior'].includes(it.rarity));
    const sellAll = el('button', 'btn alt', `Vender lo normal, superior e inferior (${commons.length}) · ${commons.reduce((a, b) => a + b.value, 0)} 🪙`);
    sellAll.disabled = !commons.length;
    sellAll.onclick = () => DD.net.send({ t: 'shop:sell', ids: commons.map((it) => it.id) });
    right.appendChild(sellAll);
    body.append(left, right);
  }

  function consRow(c, p) {
    const C = RULES.CONSUMABLES[c.id];
    const r = el('div', 'buy-row');
    r.appendChild(consIcon(c.id, 32));
    const tt = el('div', 'buy-t'); tt.append(el('b', '', `${C.name}${p.cons[c.id] ? ` (tienes ${p.cons[c.id]})` : ''}`), el('small', '', C.desc)); r.appendChild(tt);
    for (const n of [1, 5]) {
      const btn = el('button', n === 1 ? 'btn' : 'btn alt', n === 1 ? `${c.price} 🪙` : `×5 · ${c.price * 5}`);
      btn.disabled = p.gold < c.price * n;
      btn.onclick = () => DD.net.send({ t: 'shop:buy', npc: shop.npc, id: c.id, n });
      r.appendChild(btn);
    }
    return r;
  }

  function buy(what, price, name) {
    const p = me();
    if (p.gold < price) { DD.toast('No tienes oro suficiente.'); return; }
    if (p.bag.length >= RULES.BAG_SIZE) { DD.toast('Tu mochila está llena.'); return; }
    DD.net.send({ t: 'shop:buy', npc: shop.npc, ...what });
    DD.toast(`Compras «${name}».`);
  }

  // ======================================================================
  //  Comercio entre jugadores
  // ======================================================================
  let trade = null;
  DD.on('trade:invite', (m) => {
    const box = el('div', 'invite panel');
    box.append(el('div', '', `🤝 ${m.name} quiere comerciar contigo.`));
    const ok = el('button', 'btn', 'ACEPTAR'), no = el('button', 'btn alt', 'NO');
    ok.onclick = () => { DD.net.send({ t: 'trade:accept', from: m.from }); box.remove(); };
    no.onclick = () => { DD.net.send({ t: 'trade:cancel', from: m.from }); box.remove(); };
    box.append(ok, no);
    document.body.appendChild(box);
    DD.blip(660, 0.15);
    setTimeout(() => box.remove(), 30000);
  });
  DD.on('trade:state', (m) => { trade = m; openOverlay('tradewin'); renderTrade(); });
  DD.on('trade:end', (m) => { trade = null; closeOverlay('tradewin'); DD.toast(m.text); });

  function renderTrade() {
    if (!trade || !me()) return;
    const mine = trade.a.id === DD.myId ? trade.a : trade.b, theirs = trade.a.id === DD.myId ? trade.b : trade.a;
    const body = $('#trade-body');
    body.innerHTML = '';
    const side = (s, isMe) => {
      const c = el('div', 'trade-side' + (s.ok ? ' ok' : ''));
      c.appendChild(el('div', 'panel-title small', `${isMe ? 'TU OFERTA' : 'OFERTA DE ' + s.name.toUpperCase()}${s.ok ? ' ✔' : ''}`));
      const grid = el('div', 'bag small');
      for (let i = 0; i < 12; i++) {
        const it = s.items[i];
        grid.appendChild(itemCell(it, { onClick: () => { if (isMe && it) offer(mine.items.filter((x) => x.id !== it.id).map((x) => x.id), mine.gold); } }));
      }
      c.appendChild(grid);
      if (isMe) {
        const g = el('label', 'trade-gold', 'Oro: ');
        const inp = document.createElement('input'); inp.type = 'number'; inp.min = 0; inp.max = me().gold; inp.value = s.gold;
        inp.onchange = () => offer(mine.items.map((x) => x.id), Math.max(0, Math.min(me().gold, Number(inp.value) || 0)));
        g.appendChild(inp);
        c.appendChild(g);
      } else c.appendChild(el('div', 'trade-gold', `Oro: ${s.gold} 🪙`));
      return c;
    };
    body.append(side(mine, true), side(theirs, false));
    const bagBox = el('div', 'trade-bag');
    bagBox.appendChild(el('div', 'panel-title small', 'TU MOCHILA (clic para ofrecer)'));
    const grid = el('div', 'bag small');
    const offered = new Set(mine.items.map((x) => x.id));
    for (const it of me().bag) {
      if (offered.has(it.id)) continue;
      grid.appendChild(itemCell(it, { onClick: () => offer([...offered, it.id], mine.gold) }));
    }
    bagBox.appendChild(grid);
    body.appendChild(bagBox);
    $('#trade-ok').textContent = mine.ok ? 'ESPERANDO…' : 'ACEPTAR TRATO';
    $('#trade-ok').disabled = mine.ok;
  }
  function offer(items, gold) { DD.net.send({ t: 'trade:offer', items, gold }); }
  $('#trade-ok').onclick = () => DD.net.send({ t: 'trade:ok' });
  $('#trade-cancel').onclick = () => DD.net.send({ t: 'trade:cancel' });

  // ======================================================================
  //  Misiones
  // ======================================================================
  function questGoal(Q, a) {
    const g = Q.goal, n = a ? a.n : 0;
    if (g.kind === 'kill') return `Derrota ${n}/${g.n}: ${[...new Set(g.mobs.map((k) => RULES.MONSTERS[k].name))].join(', ')}`;
    if (g.kind === 'boss') return `Derrota a ${RULES.MONSTERS[g.mob].name} ${n ? '✔' : ''}`;
    const N = (DD.worldNpcs || {})[g.npc];
    const NAMES = { alcalde: 'Alcalde Brumo', jacinta: 'Jacinta la granjera', ewan: 'Ewan el leñador', bran: 'Bran el cazador', morwen: 'Abuela Morwen', rhys: 'Capitán Rhys', tor: 'Tor el ermitaño', selene: 'Selene, la Última Vigía' };
    return `Habla con ${N ? N.name : NAMES[g.npc] || g.npc} ${n ? '✔' : ''}`;
  }
  function questsView(p) {
    const wrap = el('div', 'skills');
    const act = Object.entries(p.quests || {});
    if (!act.length) wrap.appendChild(el('p', 'muted', 'No tienes misiones. Habla con la gente del mundo abierto (🗺️ Mundo): el alcalde de Brumaverde te espera.'));
    for (const [id, a] of act) {
      const Q = RULES.QUESTS[id];
      if (!Q) continue;
      const r = el('div', 'skill-row');
      const t = el('div', 'skill-t');
      const done = a.n >= (Q.goal.n || 1);
      t.append(el('b', '', `${done ? '✔ ' : '📜 '}${Q.name} · ${RULES.ZONES[Q.zone].name}`), el('small', '', `${questGoal(Q, a)}${done ? ' · ¡Vuelve a entregarla!' : ''} · Recompensa: ${Q.xp} PX, ${Q.gold} 🪙${Q.item ? ', objeto ' + RULES.RARITIES[Q.item].name.toLowerCase() : ''}`));
      const ab = el('button', 'btn alt small', 'Abandonar'); ab.style.width = 'auto';
      ab.onclick = () => { if (confirm(`¿Abandonar «${Q.name}»?`)) DD.net.send({ t: 'quest:abandon', id }); };
      r.append(el('span', 'skill-ic', done ? '✅' : '📜'), t, ab);
      wrap.appendChild(r);
    }
    wrap.appendChild(el('p', 'muted small', `Misiones completadas: ${(p.questsDone || []).length} de ${Object.keys(RULES.QUESTS).length}.`));
    return wrap;
  }
  // seguimiento en pantalla (en las partidas)
  function renderTracker() {
    const box = $('#qtrack');
    const p = me();
    if (!box || !p) return;
    const act = Object.entries(p.quests || {}).slice(0, 3);
    box.innerHTML = '';
    box.classList.toggle('hidden', !act.length || DD.scene !== 'dungeon');
    for (const [id, a] of act) {
      const Q = RULES.QUESTS[id];
      if (!Q) continue;
      const done = a.n >= (Q.goal.n || 1);
      const line = el('div', 'qline' + (done ? ' done' : ''));
      line.append(el('b', '', Q.name), el('small', '', done ? '¡Entrégala!' : questGoal(Q, a)));
      box.appendChild(line);
    }
  }
  DD.on('me', renderTracker);
  DD.on('dstart', (m) => { if (m.dungeon.npcs) DD.worldNpcs = Object.fromEntries(m.dungeon.npcs.map((n) => [n.id, n])); setTimeout(renderTracker, 50); });
  DD.on('dexit', () => setTimeout(renderTracker, 50));

  // ---------- Conversación con un personaje ----------
  DD.on('npc', (m) => {
    openOverlay('npcwin');
    const head = $('#npc-head');
    head.innerHTML = '';
    head.appendChild(DD.portrait(m.look || { cls: 'picaro' }, 40));
    const t = el('div', 'shop-title');
    t.append(el('b', '', m.name), el('q', '', m.lines[Math.floor(Math.random() * m.lines.length)]));
    head.appendChild(t);
    const body = $('#npc-body');
    body.innerHTML = '';
    for (const q of m.quests) {
      const Q = RULES.QUESTS[q.id];
      const a = (me().quests || {})[q.id];
      const box = el('div', 'quest-box ' + q.state);
      box.append(el('b', '', `📜 ${Q.name}`), el('p', '', Q.text), el('small', '', `${questGoal(Q, a)} · Recompensa: ${Q.xp} PX, ${Q.gold} 🪙${Q.item ? ', objeto ' + RULES.RARITIES[Q.item].name.toLowerCase() : ''}`));
      if (q.state === 'available') { const b = el('button', 'btn', 'ACEPTAR'); b.onclick = () => { DD.net.send({ t: 'quest:accept', id: q.id }); closeOverlay('npcwin'); }; box.appendChild(b); }
      if (q.state === 'locked') box.appendChild(el('div', 'tip-req bad', `Necesitas nivel ${Q.minLevel}.`));
      if (q.state === 'ready' && (Q.npc === m.id || Q.goal.npc === m.id)) {
        const b = el('button', 'btn red', 'ENTREGAR'); b.onclick = () => { DD.net.send({ t: 'quest:turnin', id: q.id }); closeOverlay('npcwin'); DD.blip(1320, 0.2); }; box.appendChild(b);
      }
      if (q.state === 'active') box.appendChild(el('div', 'tip-req', 'En curso…'));
      body.appendChild(box);
    }
    if (!m.quests.length) body.appendChild(el('p', 'muted', 'No tiene nada más que pedirte, por ahora.'));
    if (m.shop) { const b = el('button', 'btn alt', '🧪 Comprar pociones'); b.onclick = () => { closeOverlay('npcwin'); DD.emit('open-shop', m.shop); }; body.appendChild(b); }
  });

  // ---------- Piedras de viaje ----------
  let wayFromTavern = false;
  function openWaystones(here) {
    const p = me();
    const list = (DD.worldWaystones || []).filter((w) => p.waystones.includes(w.id));
    openOverlay('waywin');
    const body = $('#way-body');
    body.innerHTML = '';
    for (const w of list) {
      const Z = RULES.ZONES[w.zone];
      const r = el('div', 'buy-row');
      r.append(el('span', 'buy-ic', '🗿'));
      const tt = el('div', 'buy-t'); tt.append(el('b', '', w.name), el('small', '', `${Z.name} · nivel ${Z.lv[0]}-${Z.lv[1]}`)); r.appendChild(tt);
      const b = el('button', 'btn', w.id === here ? 'AQUÍ' : 'VIAJAR');
      b.disabled = w.id === here;
      b.onclick = () => { closeOverlay('waywin'); if (wayFromTavern) DD.net.send({ t: 'wenter', ws: w.id }); else DD.net.send({ t: 'dtravel', id: w.id }); };
      r.appendChild(b);
      body.appendChild(r);
    }
    const left = 6 - list.length;
    if (left > 0) body.appendChild(el('p', 'muted small', `Te quedan ${left} piedras por descubrir: cada campamento tiene la suya.`));
  }
  DD.on('waystones', (m) => { wayFromTavern = false; openWaystones(m.here); });
  DD.on('dstart', (m) => { if (m.dungeon.waystones && m.dungeon.waystones.length) DD.worldWaystones = m.dungeon.waystones; });
  DD.on('open-world', () => {
    const p = me();
    if (!p || !DD.worldWaystones || p.waystones.length <= 1) { DD.net.send({ t: 'wenter' }); return; }
    wayFromTavern = true; openWaystones(null);
  });

  // ---------- Establo ----------
  DD.on('open-stable', () => { openOverlay('stablewin'); renderStable(); });
  DD.on('me', () => { if (!$('#stablewin').classList.contains('hidden')) renderStable(); });
  function renderStable() {
    const p = me();
    const lvl = RULES.levelFromXp(p.xp);
    const body = $('#stable-body');
    body.innerHTML = '';
    if (p.pet) {
      const P = RULES.PETS[p.pet.type], plvl = RULES.petLevelFromXp(p.pet.xp);
      const st = RULES.petStats(p.pet.type, Math.max(lvl, RULES.PET_LEVEL), plvl);
      const S = RULES.PET_SKILLS[p.pet.type];
      const box = el('div', 'quest-box ready');
      box.appendChild(el('b', '', `${P.icon} ${p.pet.name} · ${RULES.petTitle(p.pet.type, plvl)} · nivel ${plvl}/${RULES.PET_MAX}`));
      if (plvl < RULES.PET_MAX) {
        const a = RULES.petXpFor(plvl), b = RULES.petXpFor(plvl + 1);
        const bar = el('div', 'meter xp'); const f = el('i'); f.style.width = Math.round(100 * (p.pet.xp - a) / Math.max(1, b - a)) + '%'; bar.appendChild(f);
        bar.style.position = 'relative'; bar.style.height = '12px'; bar.style.margin = '4px 0';
        box.appendChild(bar);
      }
      box.appendChild(el('small', '', `Fuerza ${st.fue}, muerde ${st.dmg[0]}–${st.dmg[1]}, vida ${st.hp}, carga ${st.cap} kg. Gana experiencia cuando lucháis juntos.`));
      box.appendChild(el('small', '', `${plvl >= RULES.PET_SKILL_LEVEL ? '✔' : `🔒 (nivel ${RULES.PET_SKILL_LEVEL})`} Habilidad «${S.name}»: ${S.desc}`));
      box.appendChild(el('small', '', `Evoluciona en el nivel 10 (${P.evo[0]}) y en el 20 (${P.evo[1]}): más grande, más fuerte y con la habilidad mejorada.`));
      body.appendChild(box);
    }
    body.appendChild(el('div', 'panel-title small', `MASCOTAS (desde el nivel ${RULES.PET_LEVEL}) · 🪙 ${p.gold}${p.pet ? ' · cambiar de mascota empieza de cero' : ''}`));
    for (const [id, P] of Object.entries(RULES.PETS)) {
      const st = RULES.petStats(id, Math.max(lvl, RULES.PET_LEVEL));
      const r = el('div', 'buy-row');
      r.append(el('span', 'buy-ic', P.icon));
      const tt = el('div', 'buy-t'); tt.append(el('b', '', `${P.name}${p.pet && p.pet.type === id ? ' (la tuya)' : ''}`), el('small', '', `${P.desc} Fuerza ${st.fue}, muerde ${st.dmg[0]}–${st.dmg[1]}, carga ${st.cap} kg, vida ${st.hp}.`)); r.appendChild(tt);
      const b = el('button', 'btn', `${P.price} 🪙`);
      b.disabled = lvl < RULES.PET_LEVEL || p.gold < P.price || (p.pet && p.pet.type === id);
      b.onclick = () => { const name = prompt('¿Cómo se llamará?', P.name); if (name !== null) DD.net.send({ t: 'stable:buy', kind: 'pet', id, name }); };
      r.appendChild(b);
      body.appendChild(r);
    }
    body.appendChild(el('div', 'panel-title small', 'MONTURAS (sólo en el mundo abierto; F para montar)'));
    for (const [id, M] of Object.entries(RULES.MOUNTS)) {
      const r = el('div', 'buy-row');
      r.append(el('span', 'buy-ic', M.icon));
      const tt = el('div', 'buy-t'); tt.append(el('b', '', `${M.name}${p.mount === id ? ' (la tuya)' : ''}`), el('small', '', `${M.desc} Nivel ${M.minLevel}.`)); r.appendChild(tt);
      const b = el('button', 'btn', `${M.price} 🪙`);
      b.disabled = lvl < M.minLevel || p.gold < M.price || p.mount === id;
      b.onclick = () => DD.net.send({ t: 'stable:buy', kind: 'mount', id });
      r.appendChild(b);
      body.appendChild(r);
    }
    if (lvl < RULES.PET_LEVEL) body.appendChild(el('p', 'muted small', `Vuelve cuando seas nivel ${RULES.PET_LEVEL}: las bestias no siguen a novatos.`));
  }

  // ======================================================================
  //  Guía del juego
  // ======================================================================
  let guideTab = 'jugar';
  DD.on('open-guide', () => { openOverlay('guide'); renderGuide(); });
  document.querySelectorAll('#guide-tabs button').forEach((b) => { b.onclick = () => { guideTab = b.dataset.tab; renderGuide(); }; });

  function renderGuide() {
    document.querySelectorAll('#guide-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === guideTab));
    const body = $('#guide-body');
    body.innerHTML = '';
    const h = (t) => body.appendChild(el('h3', '', t));
    const p = (t) => body.appendChild(el('p', '', t));
    if (guideTab === 'jugar') {
      { const a = el('a', 'btn alt', '📘 Abrir la guía en PDF (para imprimir o enseñar)'); a.href = 'guia.pdf'; a.target = '_blank'; a.rel = 'noopener'; body.appendChild(a); }
      h('La taberna');
      p('Haz clic en el suelo para andar y en las sillas para sentarte. Habla con Enter. Pulsa sobre los comerciantes para comprar y vender: Madre Zarza (pociones), el Maestro Takeshi (armas y armaduras) y el Hombre de la Túnica (pergaminos y bendiciones).');
      p('En la lista de héroes puedes saludar, invitar a una ronda o 🤝 comerciar con tus amigos: cada uno pone objetos y oro y, cuando los dos aceptáis, se intercambian.');
      h('Las mazmorras');
      p('🗝️ Mazmorras: elige un tema (o al azar) y el nivel (desde 1 hasta tu nivel + 3). Se genera una mazmorra nueva cada vez. Tus amigos pueden unirse desde la misma ventana. Derrota al jefe para abrir el portal de salida.');
      p('Controles: clic en el suelo para andar (mantén pulsado para seguir al ratón), clic en un enemigo para atacarlo sin parar, WASD o flechas para moverte. 1-8: habilidades. Q: poción de vida (Mayús+Q la grande), E: energía, R/T: brebajes, Z X C V: pergaminos. M: mapa. I: equipo.');
      p('👥 En grupo: a la izquierda ves la vida de tus compañeros. Alt+clic (o clic central, o la tecla P) marca un sitio para todos; con Mayús, un aviso de peligro. Si caes, en la taberna aparece «Volver con tu grupo» mientras tus amigos sigan dentro.');
      p('Los arqueros y chamanes disparan a la casilla donde estás: ¡muévete y esquivarás el proyectil! Los jefes marcan en rojo el suelo antes de un gran golpe: sal de ahí.');
      h('El mundo abierto');
      p('🗺️ Mundo: Brumaverde está en el centro y, cuanto más lejos, más nivel hace falta: valle (1-3), bosque (3-6), ciénaga (6-10), yermo (10-14), picos helados (14-19) y erial de ceniza (19-26). Si entras en una zona muy por encima de tu nivel, la corrupción te irá quitando vida.');
      p('Habla con la gente (clic sobre ellos): los que tienen ❗ te dan misiones y los que tienen ❓ esperan que se las entregues. Las piedras de viaje 🗿 de cada campamento te llevan de una a otra. M abre el mapa grande.');
      h('Mascotas y monturas');
      p(`🐾 Establo (en la taberna): desde el nivel ${RULES.PET_LEVEL} puedes adoptar una mascota que te sigue, muerde a tus enemigos según su Fuerza y lleva una mochila propia con su peso máximo (Equipo → «Dar a…»). Desde el nivel ${RULES.MOUNT_LEVEL}, una montura para correr por el mundo abierto (F para montar).`);
      p('Todo pesa: si llevas más de lo que tu Fuerza aguanta, andarás más lento.');
      p(`Tu mascota sube de nivel luchando contigo (hasta el ${RULES.PET_MAX}): en el nivel ${RULES.PET_SKILL_LEVEL} aprende su habilidad y en los niveles 10 y 20 evoluciona (más grande y más fuerte).`);
      h('El pueblo (🏛️)');
      p('⚒️ Forja de Brunilda: mejora tus objetos hasta +10 con fragmentos de hierro, esencia arcana y polvo de estrella (los sueltan los enemigos), encanta una propiedad para cambiarla por otra, combina tres objetos de la misma rareza en uno mejor o desguaza lo que no quieras.');
      p('🍲 Cocina de Alfonso: pesca en el mundo abierto (🎣 o G junto al agua; cuando pique, ¡tira!) y recoge hierbas con un clic. Alfonso te cocina platos que dan bonificaciones durante 30 minutos.');
      p('📋 Tablón: tres tareas cada día y dos cada semana, iguales para todos. 🏅 Fama: logros que dan oro y títulos que se ven junto a tu nombre, y la clasificación semanal. 🏠 Habitación: los jefes que derrotas aparecen como trofeos; visita la de tus amigos desde la lista de héroes.');
      h('Retos');
      p('🌀 Descenso infinito: piso tras piso, cada uno más difícil, con un desafío distinto cada semana. Cada 5 pisos, un objeto raro; cada 10, uno único.');
      p('🌋 Jefes de mundo: cada cierto tiempo aparece uno en el mundo abierto. Todos los que le hagan daño se llevan un objeto raro o único.');
      p('🤺 Duelos: desde la lista de héroes, reta a un amigo en el sótano de Alfonso, con una apuesta de oro si queréis. El ganador se lo lleva todo.');
      p('Espacio (o 🤸): voltereta de dos casillas que te hace invulnerable un instante. ⚙️ Menú → Gráficos: calidad, clima y temblor de cámara.');
      h('Subir de nivel');
      p(`Empiezas con ${RULES.POINTS_START} puntos para repartir en el editor. Cada nivel da 1 punto más, y cada 5 niveles uno extra (hasta el nivel ${RULES.MAX_LEVEL}). Aparecerá un icono rojo bajo tu retrato: púlsalo para repartirlos. Ninguna característica pasa de ${RULES.STAT_MAX} de forma natural (raza + clase + puntos); el equipo sí puede subirla más.`);
    } else if (guideTab === 'clases') {
      h('Razas');
      for (const id of RULES.RACE_IDS) { const R = RULES.RACES[id]; p(`${R.name}: ${Object.entries(R.mods).map(([s, v]) => `${v > 0 ? '+' : ''}${v} ${RULES.statName(s)}`).join(', ')}. ${R.perkText}`); }
      for (const [id, k] of Object.entries(RULES.CLASSES)) {
        h(`${k.icon} ${k.name}`);
        p(`${k.desc} Característica principal: ${RULES.statName(k.main)} (${Object.entries(k.base).map(([s, v]) => `+${v} ${RULES.statName(s)}`).join(', ')}). Prefiere armaduras de ${k.armor.map((a) => RULES.ARMOR_TYPES[a].toLowerCase()).join(', ')} y ${k.weapons.map((w) => (RULES.WEAPONS[w] || RULES.OFFHANDS[w]).name.toLowerCase()).join(', ')}; puede llevar cualquier cosa si cumple los requisitos.`);
        p('Habilidades: ' + RULES.ABILITIES[id].map((a) => `${a.icon} ${a.name} (nv ${a.lvl})`).join(' · '));
      }
      h('Tus personajes');
      p('Cada navegador guarda hasta tres personajes. En la pantalla de inicio puedes crear uno nuevo en una casilla libre, jugar con cualquiera de ellos o borrarlo. «Continuar» te devuelve al último personaje, en el último servidor y en el sitio donde lo dejaste.');
    } else if (guideTab === 'stats') {
      for (const S of RULES.STATS) { h(S.name); p(S.desc); }
    } else if (guideTab === 'botin') {
      h('Calidades (como en Diablo 2)');
      const QD = {
        inferior: 'Agrietado, dañado o tosco: un 25% menos de daño o defensa y sin propiedades.',
        normal: 'El objeto base, sin propiedades.',
        superior: 'Un 5–15% más de daño o defensa.',
        magico: 'Un prefijo («Espada corta cruel») y/o un sufijo («… del Zorro»).',
        raro: 'De 3 a 6 propiedades y un nombre al azar («Mordisco Lúgubre»).',
        unico: 'Nombre propio y siempre las mismas propiedades, de los escalones más altos.',
        conjunto: 'Piezas de clase que sueltan los jefes; dan bonificaciones con 2 y 4 piezas.',
      };
      for (const id of RULES.RARITY_ORDER) {
        const R = RULES.RARITIES[id];
        const x = el('p', '', `${R.name}${R.chance ? ` (${Math.round(R.chance * 100)}% por enemigo)` : ''}: ${QD[id]}`);
        x.style.color = R.color; body.appendChild(x);
      }
      p('Los anillos y amuletos son siempre mágicos o mejores. La Suerte y los bufos dan hallazgo mágico, que cuenta entero para los mágicos y menos para raros y únicos (rendimientos decrecientes). Los élites tiran dos veces y los jefes tres, siempre con algo mágico o mejor.');
      h('Tipos base y requisitos');
      p(`Cada arma y armadura tiene tres niveles: normal, excepcional (desde el nivel ${RULES.TIERS[1].lvl} de objeto) y élite (desde el ${RULES.TIERS[2].lvl}). Cuanto más alto, más daño o defensa y más Fuerza, Destreza o Inteligencia pide. Cualquier clase puede llevar cualquier cosa si cumple los requisitos.`);
      p('Daño: cada punto de la característica del arma suma un 5% (Fuerza para espadas, hachas, mazas, mandobles, martillos y lanzas; Destreza para arcos y ballestas; las dos al 75% para las dagas; Inteligencia para bastones y varitas). Además, cada nivel del personaje suma un 4% (dominio de combate).');
      for (const [id, W] of Object.entries(RULES.WEAPONS)) p(`${W.tiers.map((t) => t[0]).join(' → ')}: ${W.hands === 2 ? 'a dos manos' : 'a una mano'}, velocidad ${RULES.speedName(W.ms)}${W.undead ? `, +${W.undead}% contra no muertos` : ''}.`);
      h('Prefijos y sufijos');
      p('Cada propiedad tiene escalones según el nivel del objeto: «dentado» (+10–20% de daño) aparece desde el nivel 1, «despiadado» (+101–130%) desde el 43 y «feroz» (+131–170%) desde el 50. Lo mismo con «del Zorro», «del Tigre» o «del Coloso» para la vida, «del Buey» o «del Titán» para la Fuerza, y el daño de fuego, frío, rayo y veneno.');
      h('Conjuntos de clase (sólo jefes)');
      for (const [cls, S] of Object.entries(RULES.SETS)) {
        const x = el('p', '', `${S.name} (${RULES.CLASSES[cls].name}): ${S.pieces.map((q) => q[2]).join(', ')}. 2 piezas: ${Object.entries(S.b2).map(([k, v]) => RULES.fmtStat(k, v)).join(', ')}. 4 piezas: ${Object.entries(S.b4).map(([k, v]) => RULES.fmtStat(k, v)).join(', ')}.`);
        x.style.color = RULES.RARITIES.conjunto.color; body.appendChild(x);
      }
      h('Jefes y su botín');
      for (const th of Object.values(RULES.THEMES)) { const B = RULES.MONSTERS[th.boss]; p(`${th.icon} ${B.name} (${th.name}): conjuntos de ${B.sets.map((c) => RULES.CLASSES[c].name).join(', ')}.`); }
    } else if (guideTab === 'monstruos') {
      const fam = { goblin: 'Goblinoides', orco: 'Orcos y gigantes', muerto: 'No muertos', bestia: 'Bestias', humano: 'Humanos', dragon: 'Dragones' };
      for (const [f, name] of Object.entries(fam)) {
        h(name);
        p(Object.values(RULES.MONSTERS).filter((m) => m.fam === f).map((m) => `${m.name}${m.boss ? ' (jefe)' : ''}${m.range > 1 ? ' 🏹' : ''}`).join(' · '));
      }
      p('Los monstruos tienen el nivel de la mazmorra: más vida, daño y armadura cuanto más alto. Si son mucho más débiles que tú dan menos experiencia.');
    }
  }
})();
