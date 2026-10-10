/* global DD, RULES, PROG, DSPRITES, ICONS */
// Interfaz de grupo y de combate: vida de los compañeros, volver con el grupo, HUD y barra de habilidades.
// Comparte estado con public/dungeon.js a través de DD.dg (const D).
(() => {
  'use strict';
  const D = DD.dg;
  const { $, entAt, game, monName, serverNow, viewEl } = D;

  // ---------- Grupo: vida de los compañeros ----------
  const partyEl = document.createElement('div');
  partyEl.id = 'dparty';
  viewEl.appendChild(partyEl);
  const partyRows = new Map();
  function updateParty() {
    const me = game.ents.get(DD.myId);
    let mates = [...game.ents.values()].filter((e) => e.kind === 'hero' && e.id !== DD.myId);
    if (game.map && game.map.kind === 'world' && me) mates = mates.filter((e) => Math.max(Math.abs(e.x - me.x), Math.abs(e.y - me.y)) <= 30);
    if (game.map && game.map.kind === 'arena') mates = [];
    mates = mates.slice(0, 6);
    const ids = new Set(mates.map((e) => e.id));
    for (const [id, row] of partyRows) if (!ids.has(id)) { row.remove(); partyRows.delete(id); }
    for (const e of mates) {
      let row = partyRows.get(e.id);
      if (!row) {
        row = document.createElement('div'); row.className = 'pmate';
        row.innerHTML = '<div class="pm-top"><b></b><small></small></div><div class="meter hp"><i></i></div>';
        row.title = 'Clic: marcar dónde está';
        row.onclick = () => DD.net.send({ t: 'dping', x: e.x, y: e.y });
        partyEl.appendChild(row); partyRows.set(e.id, row);
      }
      const pct = e.maxHp ? Math.max(0, Math.min(100, 100 * e.hp / e.maxHp)) : 100;
      row.querySelector('b').textContent = e.name || '¿?';
      row.querySelector('small').textContent = e.lvl ? `nv ${e.lvl}` : '';
      row.querySelector('i').style.width = pct + '%';
      row.classList.toggle('low', pct < 30);
      if (e.prevPct != null && pct < 30 && e.prevPct >= 30) DD.toast(`⚠️ ¡${e.name} está muy malherido!`);
      e.prevPct = pct;
    }
    partyEl.classList.toggle('hidden', !mates.length);
  }

  // ---------- Volver con el grupo después de caer ----------
  const rejoinBtn = document.createElement('button');
  rejoinBtn.id = 'drejoin'; rejoinBtn.type = 'button'; rejoinBtn.className = 'btn big hidden';
  rejoinBtn.textContent = '⚔️ VOLVER CON TU GRUPO';
  document.body.appendChild(rejoinBtn);
  let rejoinId = null, rejoinTimer = null;
  rejoinBtn.onclick = () => { if (rejoinId) DD.net.send({ t: 'djoin', id: rejoinId }); rejoinBtn.classList.add('hidden'); };
  function offerRejoin(id) {
    rejoinId = id; rejoinBtn.classList.remove('hidden');
    clearTimeout(rejoinTimer); rejoinTimer = setTimeout(() => rejoinBtn.classList.add('hidden'), 5 * 60000);
  }


  function updateHud() {
    const y = game.you;
    DD.emit('combat', y);
    const left = [...game.ents.values()].filter((e) => e.kind === 'enemy').length;
    $('#dleft').textContent = game.map && game.map.kind === 'world' ? `M: mapa · ${game.daycycle ? game.daycycle.label : ''}` : game.map && game.map.kind === 'arena' ? '🤺 Duelo' : game.portal ? (game.map.descent ? '🌀 Portal al siguiente piso' : '🌀 Portal abierto') : `👹 ${left}`;
    const b = game.boss;
    const bb = $('#dboss');
    if (b) { bb.classList.remove('hidden'); $('#dboss-name').textContent = monName(b); $('#dboss-bar').style.width = Math.max(0, 100 * b.hp / b.maxHp) + '%'; }
    else bb.classList.add('hidden');
  }

  // ---------- Barra de habilidades y consumibles ----------
  const CONS_KEYS = { 'pocion-vida-p': 'Q', 'pocion-vida-g': 'Q', 'pocion-energia': 'E', 'brebaje-trol': 'R', elixir: 'T', 'perg-fuego': 'Z', 'perg-rayo': 'X', 'perg-sanacion': 'C', 'perg-retorno': 'V' };
  function abilities() { return DD.me ? RULES.derive(DD.me).abilities.filter((a) => a.ready) : []; }
  function consList() {
    if (!DD.me) return [];
    const c = DD.me.cons || {};
    const out = [];
    // la poción de vida: primero la pequeña, la grande con Mayús+Q
    for (const id of Object.keys(RULES.CONSUMABLES)) if (c[id]) out.push({ id, n: c[id], key: CONS_KEYS[id] });
    return out;
  }

  function buildBar() {
    const bar = $('#dactions');
    bar.innerHTML = '';
    const d = DD.me ? RULES.derive(DD.me) : null;
    if (d) {
      const atk = document.createElement('div');
      atk.className = 'act-btn attack';
      atk.title = `Ataque básico: ${d.weapon.name} (${d.dmg[0]}–${d.dmg[1]}). Clic en un enemigo.`;
      atk.innerHTML = '<span class="ic"></span><span class="lb"></span><span class="cd"></span>';
      atk.querySelector('.ic').appendChild(window.ICONS ? ICONS.svg('sword', 26, '#e8e4d8') : document.createTextNode('⚔️'));
      atk.querySelector('.lb').textContent = d.weapon.name;
      bar.appendChild(atk);
    }
    abilities().forEach((a, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'act-btn skill';
      b.dataset.id = a.id;
      b.title = `${a.name} (${i + 1}) · ${a.cost} energía · ${a.cd / 1000}s\n${a.desc}`;
      b.innerHTML = '<span class="k"></span><span class="ic"></span><span class="lb"></span><span class="cd"></span>';
      b.querySelector('.k').textContent = i + 1;
      b.querySelector('.ic').appendChild(window.ICONS ? ICONS.skill(a, 26) : document.createTextNode(a.icon));
      b.querySelector('.lb').textContent = a.name;
      b.onclick = () => castSkill(a);
      bar.appendChild(b);
    });
    const sep = document.createElement('span'); sep.className = 'act-sep'; bar.appendChild(sep);
    for (const c of consList()) {
      const C = RULES.CONSUMABLES[c.id];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'act-btn cons';
      b.dataset.cons = c.id;
      b.title = `${C.name} (${c.key || ''})\n${C.desc}`;
      b.innerHTML = '<span class="k"></span><span class="ic"></span><span class="cnt"></span><span class="cd"></span>';
      b.querySelector('.k').textContent = c.key || '';
      b.querySelector('.ic').appendChild(consIcon(c.id));
      b.querySelector('.cnt').textContent = c.n;
      b.onclick = () => useCons(c.id);
      bar.appendChild(b);
    }
  }

  function consIcon(id) {
    const C = RULES.CONSUMABLES[id];
    const src = C.spell ? DSPRITES.scroll(C.color) : DSPRITES.potion(C.color);
    const c = document.createElement('canvas'); c.width = 32; c.height = 32;
    const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(src, 0, 0, 32, 32);
    return c;
  }

  function updateBar() {
    const y = game.you;
    if (!y) return;
    const now = serverNow();
    for (const b of document.querySelectorAll('#dactions .skill')) {
      const a = RULES.ABILITY_BY_ID[b.dataset.id];
      const left = (y.cds[b.dataset.id] || 0) - now;
      const cd = b.querySelector('.cd');
      cd.style.height = left > 0 ? Math.min(100, 100 * left / a.cd) + '%' : '0';
      b.classList.toggle('off', y.en < a.cost);
    }
    for (const b of document.querySelectorAll('#dactions .cons')) {
      const left = (y.cds['cons:' + b.dataset.cons] || 0) - now;
      b.querySelector('.cd').style.height = left > 0 ? Math.min(100, left / 15) + '%' : '0';
    }
    const atk = document.querySelector('#dactions .attack .cd');
    if (atk) { const left = y.nextAttack - now; atk.style.height = left > 0 ? Math.min(100, 100 * left / y.atkMs) + '%' : '0'; }
  }

  function hoverTarget() {
    const h = game.hover;
    if (!h) return {};
    let enemy = entAt(h.x, h.y, 'enemy');
    const hero = entAt(h.x, h.y, 'hero');
    if (!enemy && game.map.kind === 'arena' && hero && hero.id !== DD.myId) enemy = { id: 'pv:' + hero.id };
    return { enemy, hero, x: h.x, y: h.y };
  }

  function castSkill(a) {
    const h = hoverTarget();
    const msg = { t: 'dskill', id: a.id };
    if (a.kind === 'heal') { if (h.hero) msg.target = h.hero.id; }
    else if (h.enemy) msg.target = h.enemy.id;
    else if ((a.kind === 'blast' || a.kind === 'cone' || a.kind === 'line') && h.x !== undefined && game.mouseOnMap) { msg.x = h.x; msg.y = h.y; }
    DD.net.send(msg);
  }

  function useCons(id) {
    const h = hoverTarget();
    DD.net.send({ t: 'duse', cid: id, target: h.enemy ? h.enemy.id : undefined });
  }


  Object.assign(D, { abilities, buildBar, castSkill, consList, offerRejoin, rejoinBtn, updateBar, updateHud, updateParty, useCons });
})();
