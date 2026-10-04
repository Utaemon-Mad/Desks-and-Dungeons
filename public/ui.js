/* global DD, RULES, MAP, SPRITES, DSPRITES */
// Ventanas del juego: tu retrato (con el icono rojo al subir de nivel), reparto de puntos, ficha, equipo e
// inventario, tiendas de los tres comerciantes, comercio entre jugadores, guía y tooltips de objetos.
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const me = () => DD.me;
  const derived = () => (DD.me ? RULES.derive(DD.me) : null);
  const inTavern = () => DD.scene === 'tavern';
  const RC = DSPRITES.RARITY;

  function iconCanvas(src, size = 32) {
    const c = document.createElement('canvas'); c.width = size; c.height = size;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(src, 0, 0, size, size);
    return c;
  }
  const itemIcon = (it, size) => iconCanvas(DSPRITES.itemIcon(it), size);
  function consIcon(id, size = 32) { const C = RULES.CONSUMABLES[id]; return iconCanvas(C.spell ? DSPRITES.scroll(C.color) : DSPRITES.potion(C.color), size); }

  function openOverlay(id) { document.querySelectorAll('.overlay.win').forEach((o) => { if (o.id !== id) o.classList.add('hidden'); }); $('#' + id).classList.remove('hidden'); hideTip(); }
  function closeOverlay(id) { $('#' + id).classList.add('hidden'); hideTip(); }
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
    const R = RULES.RARITIES[it.rarity] || RULES.RARITIES.comun;
    const name = el('div', 'tip-name', it.name); name.style.color = R.color;
    tip.append(name, el('div', 'tip-type', RULES.typeLine(it)));
    for (const l of RULES.describe(it)) tip.appendChild(el('div', 'tip-line', l));
    const p = me();
    if (p) {
      const lvl = RULES.levelFromXp(p.xp);
      const can = RULES.canEquip(it, p.char, lvl);
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
  function tipOn(node, it, extra) {
    node.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') showTip(it, e, extra); });
    node.addEventListener('pointermove', (e) => { if (!tip.classList.contains('hidden')) moveTip(e); });
    node.addEventListener('pointerleave', hideTip);
  }

  // Casilla de objeto (icono con borde de rareza)
  function itemCell(it, opts = {}) {
    const b = el('button', 'icell ' + (it ? 'r-' + it.rarity : 'empty'));
    b.type = 'button';
    if (it) {
      b.appendChild(itemIcon(it, 36));
      if (it.set) b.classList.add('set');
      const p = me();
      if (p && !RULES.canEquip(it, p.char, RULES.levelFromXp(p.xp)).ok && RULES.SLOTS[it.slot]) b.classList.add('cant');
      tipOn(b, it, opts.tipExtra);
      if (opts.price !== undefined) { const pr = el('span', 'price', `${opts.price}🪙`); b.appendChild(pr); }
    } else if (opts.slot) {
      const s = el('span', 'slot-ico', RULES.SLOTS[opts.slot].icon); b.appendChild(s);
      b.title = RULES.SLOTS[opts.slot].name;
    }
    if (opts.onClick) b.onclick = (e) => { hideTip(); opts.onClick(e); };
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
  DD.on('look', (m) => { if (m.id === DD.myId) renderHud(true); });
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
    const c1 = RULES.CLASSES[p.char.cls], c2 = p.char.cls2 && RULES.CLASSES[p.char.cls2];
    $('#mh-class').textContent = `${c1.name}${c2 ? ' / ' + c2.name : ''} · nivel ${d.level}`;
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
    if (combat && combat.tbuffs) for (const id of combat.tbuffs) { const A = RULES.ABILITY_BY_ID[id]; if (A) { const s = el('span', 'buff tmp', A.icon); s.title = A.name; buffs.appendChild(s); } }
  }
  $('#mh-badge').onclick = (e) => { e.stopPropagation(); openLevelUp(); };
  $('#mh-portrait').onclick = () => openChar('ficha');
  setInterval(() => { if (me()) renderHud(); }, 30000);

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
    const main = new Set([RULES.CLASSES[p.char.cls].main, p.char.cls2 ? RULES.CLASSES[p.char.cls2].main : null]);
    for (const S of RULES.STATS) {
      const row = el('div', 'lu-row' + (main.has(S.id) ? ' main' : ''));
      const nm = el('div', 'lu-name');
      nm.append(el('b', '', S.name), el('small', '', S.desc));
      const val = el('div', 'lu-val', String(d.stats[S.id] + pending[S.id]));
      if (pending[S.id]) val.classList.add('up');
      const minus = el('button', 'mini', '−'); minus.type = 'button';
      minus.disabled = !pending[S.id];
      minus.onclick = () => { pending[S.id]--; renderLevelUp(); };
      const plus = el('button', 'mini plus', '+'); plus.type = 'button';
      plus.disabled = left <= 0;
      plus.onclick = (e) => { pending[S.id] += e.shiftKey ? Math.min(5, left) : 1; renderLevelUp(); };
      row.append(nm, minus, val, plus);
      box.appendChild(row);
    }
    const diff = (a, b, label, f = (x) => x) => (a !== b ? `${label} ${f(a)} → <b>${f(b)}</b>` : '');
    $('#lu-preview').innerHTML = [
      diff(d.hp, preview.hp, '❤️ Vida'), diff(d.en, preview.en, '⚡ Energía'), diff(d.armor, preview.armor, '🛡️ Armadura'),
      diff(`${d.dmg[0]}–${d.dmg[1]}`, `${preview.dmg[0]}–${preview.dmg[1]}`, '⚔️ Daño'), diff(`${d.spell[0]}–${d.spell[1]}`, `${preview.spell[0]}–${preview.spell[1]}`, '✨ Hechizos'),
      diff(d.crit, preview.crit, '🎯 Crítico', (x) => x + '%'), diff(d.dodge, preview.dodge, '💨 Esquiva', (x) => x + '%'), diff(d.mf, preview.mf, '🍀 Botín', (x) => '+' + x + '%'),
    ].filter(Boolean).join('<br>') || '<span class="muted">Pulsa + para repartir tus puntos. Mayús + clic suma 5.</span>';
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
    else body.appendChild(skillsView(p));
  }

  function fichaView(p) {
    const d = derived();
    const wrap = el('div', 'ficha');
    const left = el('div', 'ficha-left');
    const u = DD.users.get(DD.myId);
    const pv = document.createElement('canvas'); pv.width = 120; pv.height = 150; pv.className = 'ficha-pv';
    const g = pv.getContext('2d'); g.imageSmoothingEnabled = false;
    g.translate(60, 140); g.scale(2.2, 2.2);
    if (u) DD.drawHero(g, 0, 0, u.look, { dir: 'E', t: 0, noShadow: true });
    left.appendChild(pv);
    left.appendChild(el('div', 'ficha-name', u ? u.name : ''));
    const c1 = RULES.CLASSES[p.char.cls], c2 = p.char.cls2 && RULES.CLASSES[p.char.cls2];
    left.appendChild(el('div', 'ficha-cls', `${c1.icon} ${c1.name}${c2 ? ` / ${c2.icon} ${c2.name}` : ''}`));
    left.appendChild(el('div', 'ficha-lvl', `Nivel ${d.level} · ${p.xp} PX`));
    if (d.points > 0) { const b = el('button', 'btn red', `⭐ Repartir ${d.points} puntos`); b.onclick = openLevelUp; left.appendChild(b); }
    // cambio de clase (sólo en la taberna)
    const cc = el('div', 'class-change');
    cc.appendChild(el('div', 'field-title', 'Clase y multiclase'));
    const s1 = document.createElement('select'), s2 = document.createElement('select');
    for (const [id, k] of Object.entries(RULES.CLASSES)) s1.appendChild(new Option(`${k.icon} ${k.name}`, id, false, id === p.char.cls));
    s2.appendChild(new Option('Sin segunda clase', '', false, !p.char.cls2));
    for (const [id, k] of Object.entries(RULES.CLASSES)) s2.appendChild(new Option(`${k.icon} ${k.name}`, id, false, id === p.char.cls2));
    const apply = el('button', 'btn alt', 'Cambiar');
    apply.onclick = () => {
      if (!inTavern()) { DD.toast('Vuelve a la taberna para cambiar de clase.'); return; }
      if (s1.value === p.char.cls && (s2.value || null) === (p.char.cls2 || null)) return;
      if (!confirm('Al cambiar de clase se te devuelven los puntos repartidos para que los vuelvas a asignar. ¿Seguro?')) return;
      DD.net.send({ t: 'char:save', look: { ...u.look, gear: undefined, cls: s1.value, cls2: s2.value || undefined } });
    };
    cc.append(s1, s2, apply);
    left.appendChild(cc);
    const respec = el('button', 'btn alt small', `Reiniciar puntos (${10 * d.level} 🪙)`);
    respec.onclick = () => { if (!inTavern()) { DD.toast('Sólo en la taberna.'); return; } if (confirm(`¿Reiniciar todos tus puntos por ${10 * d.level} de oro?`)) DD.net.send({ t: 'char:respec' }); };
    left.appendChild(respec);

    const right = el('div', 'ficha-right');
    right.appendChild(el('div', 'panel-title small', 'CARACTERÍSTICAS'));
    const stats = el('div', 'stat-grid');
    for (const S of RULES.STATS) {
      const box = el('div', 'stat-box');
      box.title = S.desc;
      const bonus = d.stats[S.id] - d.base[S.id] - (p.char.alloc[S.id] || 0);
      box.append(el('span', 'abbr', S.name), el('b', '', String(d.stats[S.id])), el('small', '', bonus ? `(${d.base[S.id] + (p.char.alloc[S.id] || 0)} +${bonus} equipo)` : ''));
      stats.appendChild(box);
    }
    right.appendChild(stats);
    right.appendChild(el('div', 'panel-title small', 'EN COMBATE'));
    const lines = [
      ['❤️ Vida', d.hp], ['⚡ Energía', d.en], ['🛡️ Armadura', `${d.armor}${d.block ? ` · bloqueo ${d.block}%` : ''}`],
      ['⚔️ Daño del arma', `${d.dmg[0]}–${d.dmg[1]} (${d.weapon.name})`], ['⏱️ Golpes por segundo', (1000 / d.atkMs).toFixed(2)], ['✨ Poder de hechizos', `${d.spell[0]}–${d.spell[1]}`],
      ['🎯 Crítico', `${d.crit}% (×${d.critMult})`], ['💨 Esquiva', d.dodge + '%'], ['🔮 Resistencia mágica', d.magicRes + '%'],
      ['💖 Regeneración', `${d.hpRegen}/s vida · ${d.enRegen}/s energía`], ['🍀 Hallazgo de botín', '+' + d.mf + '%'], ['🪙 Descuento en tiendas', d.discount + '%'],
    ];
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

  function equipView(p) {
    const wrap = el('div', 'equip');
    const doll = el('div', 'doll');
    const order = [['casco', 'c'], ['amuleto', 'a'], ['arma', 'w'], ['pecho', 'p'], ['mano', 'o'], ['guantes', 'g'], ['anillo', 'r'], ['botas', 'b']];
    const u = DD.users.get(DD.myId);
    const pv = document.createElement('canvas'); pv.width = 110; pv.height = 160; pv.className = 'doll-pv';
    const g = pv.getContext('2d'); g.imageSmoothingEnabled = false;
    g.translate(55, 150); g.scale(2.4, 2.4);
    if (u) DD.drawHero(g, 0, 0, u.look, { dir: 'E', t: 0, noShadow: true });
    doll.appendChild(pv);
    for (const [slot, pos] of order) {
      const it = p.equip[slot];
      const cell = itemCell(it, { slot, onClick: (e) => { if (it) actionMenu(e, [['Quitar', () => DD.net.send({ t: 'inv:unequip', slot })]]); } });
      cell.classList.add('slot-' + pos);
      const lab = el('span', 'slot-name', RULES.SLOTS[slot].name);
      cell.appendChild(lab);
      doll.appendChild(cell);
    }
    wrap.appendChild(doll);
    const bagBox = el('div', 'bag-box');
    bagBox.appendChild(el('div', 'panel-title small', `MOCHILA ${p.bag.length}/${RULES.BAG_SIZE} · 🪙 ${p.gold}`));
    const grid = el('div', 'bag');
    for (let i = 0; i < RULES.BAG_SIZE; i++) {
      const it = p.bag[i];
      grid.appendChild(itemCell(it, { onClick: (e) => { if (it) itemActions(e, it); } }));
    }
    bagBox.appendChild(grid);
    const cons = el('div', 'cons-row');
    for (const [id, n] of Object.entries(p.cons || {})) {
      const C = RULES.CONSUMABLES[id];
      const c = el('div', 'cons-cell'); c.title = `${C.name}: ${C.desc}`;
      c.append(consIcon(id, 28), el('span', 'cnt', String(n)));
      cons.appendChild(c);
    }
    if (cons.children.length) { bagBox.appendChild(el('div', 'panel-title small', 'POCIONES Y PERGAMINOS')); bagBox.appendChild(cons); }
    bagBox.appendChild(el('p', 'muted small', 'Clic en un objeto para equiparlo o tirarlo. Véndelos a los comerciantes de la taberna. Lo que equipas cambia el aspecto de tu héroe.'));
    wrap.appendChild(bagBox);
    return wrap;
  }

  function itemActions(e, it) {
    const acts = [];
    if (RULES.SLOTS[it.slot]) acts.push(['Equipar', () => DD.net.send({ t: 'inv:equip', id: it.id })]);
    if (inTavern()) acts.push([`Vender (${it.value} 🪙)`, () => DD.net.send({ t: 'shop:sell', id: it.id })]);
    acts.push(['Tirar', () => { if (it.rarity === 'comun' || confirm(`¿Tirar «${it.name}»? Se perderá para siempre.`)) DD.net.send({ t: 'inv:drop', id: it.id }); }, true]);
    actionMenu(e, acts);
  }

  function skillsView(p) {
    const d = derived();
    const wrap = el('div', 'skills');
    for (const a of d.abilities) {
      const r = el('div', 'skill-row' + (a.ready ? '' : ' locked'));
      r.append(el('span', 'skill-ic', a.icon));
      const t = el('div', 'skill-t');
      t.append(el('b', '', `${a.name}${a.ready ? '' : ` · nivel ${a.unlock}`}`), el('small', '', `${RULES.CLASSES[a.cls].name} · ${a.cost} energía · ${a.cd / 1000} s · ${a.desc}`));
      r.appendChild(t);
      wrap.appendChild(r);
    }
    wrap.appendChild(el('p', 'muted small', 'En las mazmorras usa las teclas 1-8 (o los botones de abajo). Apuntan al enemigo bajo el ratón o al más cercano. Las habilidades de la segunda clase se aprenden más tarde.'));
    return wrap;
  }

  // ======================================================================
  //  Tiendas
  // ======================================================================
  let shop = null;
  DD.on('open-shop', (npc) => { if (!inTavern()) return; shop = { npc }; openOverlay('shopwin'); $('#shop-body').innerHTML = '<p class="muted">…</p>'; DD.net.send({ t: 'shop:open', npc }); });
  DD.on('shop', (m) => { shop = m; if ($('#shopwin').classList.contains('hidden')) return; renderShop(); });
  DD.on('sold', (m) => { DD.toast(`Vendido por ${m.gold} 🪙`); DD.blip(1046, 0.08); });

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
      grid.appendChild(itemCell(it, { tipExtra: it ? `Clic para vender por ${it.value} 🪙` : '', onClick: () => { if (it) { if (it.rarity !== 'comun' && it.rarity !== 'raro' && !confirm(`¿Vender «${it.name}» por ${it.value} de oro?`)) return; DD.net.send({ t: 'shop:sell', id: it.id }); } } }));
    }
    right.appendChild(grid);
    const commons = p.bag.filter((it) => it.rarity === 'comun');
    const sellAll = el('button', 'btn alt', `Vender todo lo común (${commons.length}) · ${commons.reduce((a, b) => a + b.value, 0)} 🪙`);
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
      h('La taberna');
      p('Haz clic en el suelo para andar y en las sillas para sentarte. Habla con Enter. Pulsa sobre los comerciantes para comprar y vender: Madre Zarza (pociones), el Maestro Takeshi (armas y armaduras) y el Hombre de la Túnica (pergaminos y bendiciones).');
      p('En la lista de héroes puedes saludar, invitar a una ronda o 🤝 comerciar con tus amigos: cada uno pone objetos y oro y, cuando los dos aceptáis, se intercambian.');
      h('Las mazmorras');
      p('🗝️ Mazmorras: elige un tema (o al azar) y el nivel (desde 1 hasta tu nivel + 3). Se genera una mazmorra nueva cada vez. Tus amigos pueden unirse desde la misma ventana. Derrota al jefe para abrir el portal de salida.');
      p('Controles: clic en el suelo para andar (mantén pulsado para seguir al ratón), clic en un enemigo para atacarlo sin parar, WASD o flechas para moverte. 1-8: habilidades. Q: poción de vida (Mayús+Q la grande), E: energía, R/T: brebajes, Z X C V: pergaminos. M: mapa. I: equipo.');
      p('Los arqueros y chamanes disparan a la casilla donde estás: ¡muévete y esquivarás el proyectil! Los jefes marcan en rojo el suelo antes de un gran golpe: sal de ahí.');
      h('Subir de nivel');
      p('Con la experiencia subes de nivel y ganas 5 puntos. Aparecerá un icono rojo bajo tu retrato: púlsalo para repartirlos entre tus características.');
    } else if (guideTab === 'clases') {
      for (const [id, k] of Object.entries(RULES.CLASSES)) {
        h(`${k.icon} ${k.name}`);
        p(`${k.desc} Característica principal: ${RULES.statName(k.main)}. Armaduras: ${k.armor.map((a) => RULES.ARMOR_TYPES[a]).join(', ')}. Armas: ${k.weapons.map((w) => (RULES.WEAPONS[w] || RULES.OFFHANDS[w]).name).join(', ')}.`);
        p('Habilidades: ' + RULES.ABILITIES[id].map((a) => `${a.icon} ${a.name} (nv ${a.lvl})`).join(' · '));
      }
      h('Multiclase');
      p('Puedes sumar una segunda clase: usas sus armas y armaduras y aprendes sus habilidades, aunque más tarde (niveles 3, 6, 10 y 15). Sus características suman la mitad.');
    } else if (guideTab === 'stats') {
      for (const S of RULES.STATS) { h(S.name); p(S.desc); }
    } else if (guideTab === 'botin') {
      h('Rarezas');
      for (const id of ['comun', 'raro', 'epico', 'legendario']) {
        const R = RULES.RARITIES[id];
        const x = el('p', '', `${R.name}: ${Math.round(R.chance * 100)}% de probabilidad por enemigo · ${R.affixes[1]} propiedades extra · ×${R.mult} de poder.`);
        x.style.color = R.color; body.appendChild(x);
      }
      p('La Suerte y los bufos de hallazgo aumentan las probabilidades de raro, épico y legendario. Los élites tiran dos veces y los jefes tres, siempre con algo raro o mejor.');
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
