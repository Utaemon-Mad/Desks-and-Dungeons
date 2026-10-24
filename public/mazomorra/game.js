// Mazo Morra: pantalla del juego. Las reglas están en rules.js (MZR) y los dibujos en sprites.js (MZS);
// aquí sólo se pinta el estado y se traducen los clics en acciones. Tras cada acción se repinta todo.
(function () {
  'use strict';
  const R = window.MZR, S = window.MZS;
  const SND = window.SFX || { play() {}, music() {}, setMuted() {}, muted: true };
  const $ = (q) => document.querySelector(q);

  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } },
  };
  let G = null;
  let sel = [];        // dados seleccionados (ids)
  let dropFor = null;  // 'item' | 'skill' mientras se elige qué dejar al coger una recompensa
  let rolling = false; // los dados acaban de tirarse (animación)
  const pick = store.get('mz-pick', { hero: 'guerrera', dun: 'cripta' });

  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function btn(label, cls, onClick, disabled) {
    const b = el('button', 'btn' + (cls ? ' ' + cls : ''), label);
    b.type = 'button'; b.disabled = !!disabled;
    b.addEventListener('click', onClick);
    return b;
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const sprite = (name, cls) => S.img(name, cls);
  const icons = (name, n) => Array.from({ length: n }, () => `<img class="px" src="${S.url(name)}" alt="">`).join('');
  const colorName = (c) => R.COLORS[c].name;

  // Dado con puntos de píxel
  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  function dieEl(d, opts = {}) {
    const e = el('div', `die ${d.c}${opts.small ? ' sm' : ''}${sel.includes(d.id) ? ' sel' : ''}${opts.dead ? ' dead' : ''}`);
    for (let i = 0; i < 9; i++) e.appendChild(el('i', PIPS[d.v] && PIPS[d.v].includes(i) ? 'on' : ''));
    e.title = `${colorName(d.c)} ${d.v}`;
    return e;
  }
  function diceSummary(dice) {
    const row = el('div', 'dice-row');
    for (const c of ['F', 'A', 'M']) {
      const w = el('span', 'stat');
      w.appendChild(dieEl({ c, v: dice[c] > 6 ? 6 : Math.max(1, dice[c]) }, { small: true }));
      w.appendChild(el('b', 'c-' + c, '×' + dice[c]));
      w.style.display = 'inline-flex'; w.style.alignItems = 'center'; w.style.gap = '4px'; w.style.marginRight = '8px';
      w.querySelector('b').style.fontSize = '11px';
      row.appendChild(w);
    }
    return row;
  }
  function itemText(it) {
    const parts = [];
    for (const c of ['F', 'A', 'M']) if (it[c]) parts.push(`<span class="c-${c}">+${it[c]} ${colorName(c)}</span>`);
    if (it.hp) parts.push(`<span class="c-hp">+${it.hp} de vida máxima</span>`);
    return parts.join(', ');
  }

  // ---------- Portada ----------
  function renderTitle() {
    const hp = $('#hero-pick'); hp.innerHTML = '';
    for (const [id, h] of Object.entries(R.HEROES)) {
      const o = el('div', 'opt panel' + (pick.hero === id ? ' on' : ''));
      o.appendChild(sprite(h.sprite));
      o.appendChild(el('div', 'nm', esc(h.name)));
      o.appendChild(el('div', 'cl', `${h.title} · ${h.hp} de vida`));
      o.appendChild(diceSummary(h.dice));
      o.appendChild(el('div', 'txt', `<b>${esc(R.SKILLS[h.skill].name)}:</b> ${esc(R.SKILLS[h.skill].text)}`));
      o.addEventListener('click', () => { pick.hero = id; store.set('mz-pick', pick); SND.play('click'); renderTitle(); });
      hp.appendChild(o);
    }
    const dp = $('#dun-pick'); dp.innerHTML = '';
    for (const [id, d] of Object.entries(R.DUNGEONS)) {
      const o = el('div', 'opt panel' + (pick.dun === id ? ' on' : ''));
      o.appendChild(sprite(d.boss.sprite));
      o.appendChild(el('div', 'nm', esc(d.name)));
      o.appendChild(el('div', 'cl', `Jefe: ${esc(d.boss.name)} (${d.boss.hp} de vida)`));
      o.appendChild(el('div', 'txt', esc(d.ruleText)));
      o.addEventListener('click', () => { pick.dun = id; store.set('mz-pick', pick); SND.play('click'); renderTitle(); });
      dp.appendChild(o);
    }
    const rec = store.get('mz-record', { plays: 0, wins: 0, best: 0 });
    $('#record').textContent = rec.plays ? `Partidas: ${rec.plays} · Victorias: ${rec.wins} · Mejor puntuación: ${rec.best}` : 'Aún no has bajado nunca. ¡Suerte!';
  }

  function start() {
    G = R.newGame(pick.hero, pick.dun);
    sel = []; dropFor = null;
    $('#title').classList.add('hidden');
    $('#game').classList.remove('hidden');
    $('#end').classList.add('hidden');
    SND.play('door'); SND.music('dungeon');
    G.events = [];
    render();
    window.scrollTo(0, 0);
  }
  function toTitle() {
    G = null;
    for (const id of ['#game', '#enc', '#reward', '#end']) $(id).classList.add('hidden');
    $('#title').classList.remove('hidden');
    SND.music('menu');
    renderTitle();
  }

  // Ejecuta una acción de las reglas y reacciona a lo que pasó (sonidos, destellos)
  function act(fn) {
    if (!G) return;
    const before = G.hero.hp;
    const ok = fn();
    if (ok === false) { SND.play('error'); return; }
    const ev = G.events.splice(0);
    const fx = { roll: 'dice', skill: 'cast', heal: 'heal', win: 'coin', take: 'item', levelup: 'levelup', descend: 'down', boss: 'worldboss', bosshit: 'hit', victory: 'quest' };
    for (const e of ev) if (fx[e]) SND.play(fx[e]);
    if (G.hero.hp < before) { SND.play('hurt'); flash('hurt'); }
    else if (ev.includes('levelup') || ev.includes('victory')) flash('good');
    if (ev.includes('roll')) { rolling = true; setTimeout(() => { rolling = false; }, 460); }
    if (ev.includes('boss')) SND.music('boss');
    if (G.over) finish();
    render();
  }
  function flash(kind) {
    const f = $('#flash');
    f.className = ''; void f.offsetWidth; f.className = kind;
    if (kind === 'hurt') { const g = $('#game'); g.classList.remove('shake'); void g.offsetWidth; g.classList.add('shake'); }
  }

  // ---------- Partida ----------
  function render() {
    if (!G) return;
    renderTop(); renderBoard(); renderKit(); renderLog(); renderEnc(); renderReward();
  }

  function heartsEl(hp, max) {
    const h = el('div', 'hearts');
    for (let i = 0; i < max; i++) { const im = sprite('heart', i < hp ? '' : 'empty'); h.appendChild(im); }
    return h;
  }
  function renderTop() {
    const T = $('#top'), H = R.HEROES[G.hero.id], st = R.stats(G);
    T.innerHTML = '';
    const who = el('div', 'who');
    who.appendChild(sprite(H.sprite));
    const info = el('div');
    info.appendChild(el('div', 'nm', `${esc(H.name)} · Nv ${G.hero.lvl}`));
    info.appendChild(heartsEl(G.hero.hp, st.maxHp));
    const next = R.XP_LEVEL[G.hero.lvl];
    const bar = el('div', 'xpbar'); bar.title = next ? `Experiencia ${G.hero.xp}/${next}` : 'Nivel máximo';
    const fill = el('i'); const prev = R.XP_LEVEL[G.hero.lvl - 1] || 0;
    fill.style.width = next ? `calc(${Math.min(100, ((G.hero.xp - prev) / (next - prev)) * 100)}% - 4px)` : 'calc(100% - 4px)';
    bar.appendChild(fill); info.appendChild(bar);
    who.appendChild(info);
    T.appendChild(who);
    T.appendChild(diceSummary(st.dice));
    T.appendChild(el('div', 'grow'));
    const fl = G.floor > R.FLOORS ? 'JEFE' : `${G.floor}/${R.FLOORS}`;
    T.appendChild(el('div', 'stat', `<b>${fl}</b><span>planta</span>`));
    T.appendChild(el('div', 'stat', `<b>${G.deck.length}</b><span>tiempo</span>`));
    T.appendChild(el('div', 'stat', `<b>${G.hero.xp}</b><span>exp${next ? ' / ' + next : ''}</span>`));
  }

  function renderBoard() {
    const B = $('#board'), A = $('#actions');
    B.innerHTML = ''; A.innerHTML = '';
    const D = R.DUNGEONS[G.dungeon];
    if (G.floor > R.FLOORS) {
      const p = el('div', 'floor-rule', `Estás ante ${esc(D.boss.name)}.`);
      B.appendChild(p);
      return;
    }
    const deck = el('div', 'pile deck' + (G.deck.length ? '' : ' empty'));
    deck.appendChild(sprite('back'));
    deck.appendChild(el('div', 'cnt', G.deck.length));
    deck.appendChild(el('div', 'lbl', 'mazo (tiempo)'));
    B.appendChild(deck);

    const doors = el('div', 'doors');
    for (let i = 0; i < R.MAX_DOORS; i++) {
      const d = G.doors[i];
      if (!d) { doors.appendChild(el('div', 'door slot', '<span>sin puerta</span>')); continue; }
      const c = R.CARDS[d.id];
      const box = el('div', 'door panel' + (d.open ? ' open' : ''));
      if (d.open) {
        box.appendChild(sprite(c.sprite));
        box.appendChild(el('div', 'nm', esc(c.name)));
        box.appendChild(el('span', 'tag', c.kind === 'peril' ? '⚠' : '⚔'));
      } else {
        box.appendChild(sprite('door'));
        box.appendChild(el('div', 'nm', 'Puerta cerrada'));
      }
      box.title = d.open ? 'Volver a este encuentro' : 'Abrir la puerta';
      box.addEventListener('click', () => { SND.play('door'); act(() => R.openDoor(G, i)); });
      doors.appendChild(box);
    }
    B.appendChild(doors);

    const st = el('div', 'pile stairs' + (R.canDescend(G) ? ' ready' : ' empty'));
    st.appendChild(sprite('stairs'));
    st.appendChild(el('div', 'cnt', G.floor >= R.FLOORS ? 'JEFE' : 'BAJAR'));
    st.appendChild(el('div', 'lbl', 'escaleras'));
    if (R.canDescend(G)) st.addEventListener('click', () => act(() => R.descend(G)));
    B.appendChild(st);

    if (D.rule && G.floor >= 2) B.appendChild(el('div', 'floor-rule', '⚑ ' + esc(D.ruleText)));

    A.appendChild(btn('EXPLORAR<small>−2 tiempo, nueva puerta</small>', '', () => act(() => R.explore(G)), !R.canExplore(G)));
    if (R.canDescend(G)) A.appendChild(btn(G.floor >= R.FLOORS ? 'AL JEFE<small>baja al fondo</small>' : 'BAJAR<small>siguiente planta</small>', 'red', () => act(() => R.descend(G))));
    for (const sk of allSkills()) if (R.SKILLS[sk].when === 'floor') {
      A.appendChild(btn(`${esc(R.SKILLS[sk].name).toUpperCase()}<small>${esc(R.SKILLS[sk].text)}</small>`, 'alt', () => act(() => R.useSkill(G, sk)), !R.canUseSkill(G, sk)));
    }
    let hint = '';
    if (!G.deck.length) hint = G.floor >= R.FLOORS ? 'Se acabó el mazo: baja a enfrentarte al jefe (o termina antes las puertas abiertas).' : 'Se acabó el mazo de esta planta: baja por las escaleras cuando quieras.';
    else if (!G.doors.length) hint = 'Explora para encontrar puertas.';
    else if (G.doors.length >= R.MAX_DOORS) hint = 'Ya hay cuatro puertas: abre alguna antes de seguir explorando.';
    if (hint) A.appendChild(el('p', 'hint', hint));
  }
  const allSkills = () => [R.HEROES[G.hero.id].skill, ...G.hero.skills];

  function renderKit() {
    const K = $('#kit'), st = R.stats(G);
    K.innerHTML = '';
    K.appendChild(el('h3', '', `OBJETOS ${G.hero.items.length}/${st.slots}`));
    const items = el('ul', 'list');
    for (const id of G.hero.items) { const li = el('li'); li.appendChild(sprite(R.CARDS[id].sprite)); li.appendChild(el('div', 'tx', `${esc(R.CARDS[id].item.name)}<small>${itemText(R.CARDS[id].item)}</small>`)); items.appendChild(li); }
    for (let i = G.hero.items.length; i < st.slots; i++) items.appendChild(el('li', 'empty', 'hueco libre'));
    K.appendChild(items);
    K.appendChild(el('h3', '', `HABILIDADES ${G.hero.skills.length}/${st.slots}`));
    const sks = el('ul', 'list');
    const hs = R.HEROES[G.hero.id].skill;
    const li0 = el('li', 'hero-sk'); li0.appendChild(sprite('star')); li0.appendChild(el('div', 'tx', `${esc(R.SKILLS[hs].name)} <small>${esc(R.SKILLS[hs].text)}</small>`)); sks.appendChild(li0);
    for (const sk of G.hero.skills) { const li = el('li'); li.appendChild(sprite('sword')); li.appendChild(el('div', 'tx', `${esc(R.SKILLS[sk].name)} <small>${esc(R.SKILLS[sk].text)}</small>`)); sks.appendChild(li); }
    for (let i = G.hero.skills.length; i < st.slots; i++) sks.appendChild(el('li', 'empty', 'hueco libre'));
    K.appendChild(sks);
  }

  function renderLog() {
    const L = $('#log');
    L.innerHTML = '';
    for (const l of G.log.slice(-40)) L.appendChild(el('p', l.kind, esc(l.text)));
    L.scrollTop = L.scrollHeight;
  }

  // ---------- Encuentro ----------
  function renderEnc() {
    const M = $('#enc'), E = G && G.enc;
    if (!E || G.over) { M.classList.add('hidden'); return; }
    M.classList.remove('hidden');
    const P = M.querySelector('.modal-in');
    P.innerHTML = '';
    const boss = E.kind === 'boss', card = boss ? R.DUNGEONS[G.dungeon].boss : R.CARDS[E.id];

    const head = el('div', 'enc-head');
    const art = el('div', 'art'); art.appendChild(sprite(card.sprite)); head.appendChild(art);
    const info = el('div', 'info');
    info.appendChild(el('div', 'nm', esc(card.name)));
    info.appendChild(el('div', 'kind', boss ? `Jefe · ronda ${G.boss.round}` : E.kind === 'peril' ? `Peligro · ${card.xp} exp` : `Monstruo · ${card.xp} exp${G.floor > 1 ? ` · planta ${G.floor} (+${G.floor - 1})` : ''}`));
    const abs = E.kind === 'peril' ? [] : [...R.abOf(G)].map((a) => R.ABILITIES[a]);
    for (const a of abs) info.appendChild(el('div', 'ab', esc(a)));
    const sm = el('div', 'status-mini', `<span>${icons('heart', 1)} ${G.hero.hp}/${R.stats(G).maxHp}</span><span>${icons('hourglass', 1)} ${G.deck.length}</span>`);
    info.appendChild(sm);
    if (boss) {
      const hb = el('div', 'bosshp'); const fi = el('i'); fi.style.width = `calc(${(G.boss.hp / G.boss.max) * 100}% - 6px)`;
      hb.appendChild(fi); hb.appendChild(el('span', '', `${G.boss.hp}/${G.boss.max}`)); info.appendChild(hb);
    }
    head.appendChild(info);
    P.appendChild(head);

    if (E.kind === 'peril') renderPeril(P, E, card);
    else renderFight(P, E, boss);
  }

  function penIcons(o) {
    let h = '';
    if (o.hp) h += icons('heart', o.hp);
    if (o.t) h += icons('hourglass', o.t);
    if (o.atk) h += icons('sword', o.atk);
    return h;
  }
  function penText(o) {
    const p = [];
    if (o.hp) p.push(`−${o.hp} vida`);
    if (o.t) p.push(`−${o.t} tiempo`);
    return p.join(' y ');
  }

  function renderFight(P, E, boss) {
    const boxes = el('div', 'boxes');
    E.boxes.forEach((bx, i) => {
      const done = R.boxDone(E, bx);
      const b = el('div', `box ${bx.c}${bx.atk ? ' atk' : ''}${done ? ' done' : ''}`);
      const canSel = E.rolled && sel.length === 1 && R.canPlace(G, sel[0], i);
      if (canSel) b.classList.add('can');
      b.appendChild(el('div', 'need', `${bx.n === 2 ? 'Σ' : ''}${bx.v}+ <small>${bx.c === 'X' ? 'cualquier color' : colorName(bx.c)}${bx.n === 2 ? ' · 2 dados' : ''}</small>`));
      const slots = el('div', 'slots');
      for (const id of bx.dice) {
        const d = E.dice.find((x) => x.id === id);
        const de = dieEl(d);
        de.title = 'Quitar este dado';
        de.addEventListener('click', (ev) => { ev.stopPropagation(); act(() => R.unplace(G, id)); });
        slots.appendChild(de);
      }
      for (let k = bx.dice.length; k < bx.n; k++) slots.appendChild(el('div', 'slot'));
      b.appendChild(slots);
      if (bx.n === 2 && bx.dice.length) b.appendChild(el('div', 'sum', `suma ${R.boxSum(E, bx)}`));
      b.appendChild(el('div', 'pen', penIcons(bx)));
      b.title = bx.atk ? `Si la llenas: ${bx.atk} de daño al jefe` : `Si no la llenas: ${penText(bx)}`;
      if (done) b.appendChild(el('div', 'ok', bx.atk ? '¡ZAS!' : 'OK'));
      b.addEventListener('click', () => clickBox(i));
      boxes.appendChild(b);
    });
    P.appendChild(boxes);

    if (!E.rolled) {
      const foot = el('div', 'enc-foot');
      foot.appendChild(el('div', 'pv', boss ? 'Tira tus dados y colócalos. Las casillas con espada dañan al jefe.' : 'Coloca tus dados en las casillas. Las que dejes sin llenar te dañan.'));
      const bs = el('div');
      if (!boss) {
        const fc = R.fleeCost(G);
        bs.appendChild(btn(`HUIR<small>${fc ? '−' + fc + ' tiempo' : 'gratis'}</small>`, 'alt', () => act(() => R.flee(G))));
      }
      bs.appendChild(btn('¡LUCHAR!<small>tirar los dados</small>', 'red', () => { sel = []; act(() => R.roll(G)); }));
      foot.appendChild(bs);
      P.appendChild(foot);
      return;
    }
    renderTray(P, E);
    const pv = R.preview(G);
    const foot = el('div', 'enc-foot');
    const parts = [];
    if (pv.hp) parts.push(`<b>−${pv.hp} vida</b>`);
    if (pv.t) parts.push(`<b>−${pv.t} tiempo</b>`);
    if (boss) parts.push(`<b class="good">${pv.dealt} de daño al jefe</b>`);
    foot.appendChild(el('div', 'pv', parts.length ? 'Al terminar: ' + parts.join(' · ') : '<b class="good">¡Sin daño!</b>'));
    foot.appendChild(btn(boss ? 'TERMINAR RONDA' : 'TERMINAR', 'red', () => { sel = []; act(() => R.resolve(G)); }));
    P.appendChild(foot);
  }

  function renderTray(P, E) {
    const tray = el('div', 'tray');
    const free = R.free(E);
    tray.appendChild(el('div', 'lbl', free.length ? 'Tus dados: toca uno y luego una casilla (o toca la casilla y se pone el mejor dado que valga). Toca un dado colocado para quitarlo.' : 'No te quedan dados libres.'));
    const row = el('div', 'dice-row');
    for (const d of free) {
      const de = dieEl(d);
      if (rolling) de.classList.add('rolling');
      de.addEventListener('click', () => { sel = sel.includes(d.id) ? sel.filter((x) => x !== d.id) : sel.concat(d.id); SND.play('click'); renderEnc(); });
      row.appendChild(de);
    }
    tray.appendChild(row);
    P.appendChild(tray);
    sel = sel.filter((id) => free.some((d) => d.id === id));

    const bar = el('div', 'skills-bar');
    if (E.kind !== 'peril') bar.appendChild(btn('FUSIONAR<small>2 dados iguales → 1 heroico</small>', 'alt', () => { const ids = sel; sel = []; act(() => R.merge(G, ids)); }, !R.canMerge(G, sel)));
    for (const sk of allSkills()) {
      const S0 = R.SKILLS[sk];
      if (S0.when !== 'combat') continue;
      const used = E.used[sk];
      const b = btn(`${esc(S0.name).toUpperCase()}${used ? ' ✓' : ''}<small>${esc(S0.text)}</small>`, '', () => { const ids = sel; sel = []; act(() => R.useSkill(G, sk, ids)); }, !R.canUseSkill(G, sk, sel));
      bar.appendChild(b);
    }
    P.appendChild(bar);
  }

  function clickBox(i) {
    const E = G.enc;
    if (!E.rolled) return;
    if (sel.length === 1) {
      const id = sel[0];
      if (R.canPlace(G, id, i)) { sel = []; SND.play('block'); act(() => R.place(G, id, i)); } else SND.play('error');
      return;
    }
    // Sin selección: pone el dado más bajo que llena la casilla (en las de dos dados, el primero es el más alto)
    const bx = E.boxes[i];
    const fit = R.free(E).filter((d) => R.canPlace(G, d.id, i));
    const need = bx.v - R.boxSum(E, bx);
    const byLow = (a, b) => (a.c === 'H') - (b.c === 'H') || a.v - b.v;
    const d = bx.n === 2 && !bx.dice.length ? fit.sort((a, b) => (a.c === 'H') - (b.c === 'H') || b.v - a.v)[0] : fit.filter((x) => x.v >= need).sort(byLow)[0];
    if (!d) { SND.play('error'); return; }
    SND.play('block');
    act(() => R.place(G, d.id, i));
  }

  function renderPeril(P, E, card) {
    if (!E.rolled) {
      P.appendChild(el('p', '', 'Elige cómo superarlo: tiras los dados de ese color y sumas. Si no llegas, sufres lo que pone.'));
      const opts = el('div', 'peril-opts');
      card.opts.forEach((o, i) => {
        const n = R.stats(G).dice[o.c];
        const v = o.v + 2 * (G.floor - 1);
        opts.appendChild(btn(`<span class="c-${o.c}">${colorName(o.c).toUpperCase()}</span> ${v}+<small>Tiras ${n} dado${n === 1 ? '' : 's'}${R.has(G, 'manos') ? ' (+3)' : ''}. Si fallas: ${penText(o)}.</small>`, 'alt', () => { sel = []; act(() => R.roll(G, i)); }));
      });
      P.appendChild(opts);
      const foot = el('div', 'enc-foot');
      const fc = R.fleeCost(G);
      foot.appendChild(el('div', 'pv', 'Puedes dejarlo para luego.'));
      foot.appendChild(btn(`MARCHARSE<small>${fc ? '−' + fc + ' tiempo' : 'gratis'}</small>`, 'alt', () => act(() => R.flee(G))));
      P.appendChild(foot);
      return;
    }
    const tot = R.perilTotal(G), need = R.perilTarget(G), ok = tot >= need;
    P.appendChild(el('div', 'peril-sum ' + (ok ? 'ok' : 'ko'), `${tot} / ${need}`));
    renderTray(P, E);
    const o = card.opts[E.opt];
    const pv = R.preview(G);
    const foot = el('div', 'enc-foot');
    foot.appendChild(el('div', 'pv', ok ? '<b class="good">¡Lo superas!</b>' : `Si aceptas así: <b>${penText({ hp: pv.hp, t: pv.t }) || 'nada'}</b>${pv.hp !== (o.hp || 0) || pv.t !== (o.t || 0) ? ` (en la carta: ${penText(o)})` : ''}`));
    foot.appendChild(btn('ACEPTAR', 'red', () => { sel = []; act(() => R.resolve(G)); }));
    P.appendChild(foot);
  }

  // ---------- Recompensa ----------
  function renderReward() {
    const M = $('#reward');
    if (!G || !G.reward || G.over) { M.classList.add('hidden'); dropFor = null; return; }
    M.classList.remove('hidden');
    const P = M.querySelector('.modal-in'), c = R.CARDS[G.reward], o = R.rewardOptions(G);
    P.innerHTML = '';
    const head = el('div', 'enc-head');
    const art = el('div', 'art'); art.appendChild(sprite(c.sprite)); head.appendChild(art);
    head.appendChild(el('div', 'info', `<div class="nm">${c.kind === 'peril' ? 'Dejas atrás' : 'Vences a'}: ${esc(c.name)}</div><div class="kind">Elige en qué se convierte esta carta.</div>`));
    P.appendChild(head);

    if (dropFor) {
      const list = dropFor === 'item' ? G.hero.items : G.hero.skills;
      P.appendChild(el('h3', '', dropFor === 'item' ? 'NO TE CABEN MÁS OBJETOS: ¿CUÁL DEJAS?' : 'NO TE CABEN MÁS HABILIDADES: ¿CUÁL OLVIDAS?'));
      const dl = el('div', 'drop-list');
      for (const x of list) {
        const label = dropFor === 'item' ? `${esc(R.CARDS[x].item.name)}<small>${itemText(R.CARDS[x].item)}</small>` : `${esc(R.SKILLS[x].name)}<small>${esc(R.SKILLS[x].text)}</small>`;
        dl.appendChild(btn(label, 'alt', () => { const w = dropFor; dropFor = null; act(() => R.takeReward(G, w, x)); }));
      }
      dl.appendChild(btn('CANCELAR', '', () => { dropFor = null; SND.play('click'); renderReward(); }));
      P.appendChild(dl);
      return;
    }
    const opts = el('div', 'rw-opts');
    const take = (what) => { if (o[what].full) { dropFor = what; SND.play('click'); renderReward(); } else act(() => R.takeReward(G, what)); };
    opts.appendChild(btn(`OBJETO<small>${esc(c.item.name)}: ${itemText(c.item)}${o.item.full ? ' (tendrás que dejar otro)' : ''}</small>`, '', () => take('item')));
    const sk = R.SKILLS[c.skill];
    opts.appendChild(btn(`HABILIDAD<small>${esc(sk.name)}: ${esc(sk.text)}${!o.skill.ok ? ' (ya la tienes)' : o.skill.full ? ' (tendrás que olvidar otra)' : ''}</small>`, '', () => take('skill'), !o.skill.ok));
    const next = R.XP_LEVEL[G.hero.lvl];
    opts.appendChild(btn(`EXPERIENCIA<small>+${c.xp} exp${next ? ` (tienes ${G.hero.xp}/${next})` : ' (nivel máximo)'}</small>`, '', () => take('xp')));
    P.appendChild(opts);
  }

  // ---------- Final ----------
  function finish() {
    const rec = store.get('mz-record', { plays: 0, wins: 0, best: 0 });
    const sc = R.score(G);
    rec.plays++; if (G.over === 'win') rec.wins++;
    const best = sc > rec.best; if (best) rec.best = sc;
    store.set('mz-record', rec);
    SND.music(null);
    if (G.over === 'lose') SND.play('die');
    const M = $('#end'), P = M.querySelector('.modal-in');
    P.innerHTML = '';
    const H = R.HEROES[G.hero.id], D = R.DUNGEONS[G.dungeon];
    P.appendChild(el('h2', '', G.over === 'win' ? '¡VICTORIA!' : 'HAS CAÍDO'));
    const art = el('div', 'end-art');
    art.appendChild(sprite(H.sprite));
    if (G.over === 'win') art.appendChild(sprite('star'));
    art.appendChild(sprite(G.floor > R.FLOORS ? D.boss.sprite : 'esqueleto'));
    P.appendChild(art);
    const where = G.floor > R.FLOORS ? `ante ${D.boss.name}` : `en la planta ${G.floor}`;
    P.appendChild(el('p', '', G.over === 'win' ? `${esc(H.name)} ha vencido a ${esc(D.boss.name)} y ha limpiado ${esc(D.name)}.` : `${esc(H.name)} cayó ${esc(where)} de ${esc(D.name)}.`));
    P.appendChild(el('p', '', `Encuentros superados: ${G.won} · Nivel ${G.hero.lvl} · Puntuación: <b class="c-F">${sc}</b>${best ? ' · ¡nuevo récord!' : ''}`));
    const row = el('div', 'actions');
    row.appendChild(btn('OTRA VEZ', 'red', start));
    row.appendChild(btn('MENÚ', 'alt', toTitle));
    P.appendChild(row);
    M.classList.remove('hidden');
  }

  // ---------- Arranque ----------
  document.body.style.setProperty('--wall', `url(${S.url('wall')})`);
  document.querySelectorAll('[data-sprite]').forEach((e) => e.appendChild(sprite(e.dataset.sprite)));
  $('#go').addEventListener('click', start);
  const mute = $('#mute');
  const paintMute = () => { mute.textContent = SND.muted ? '♪ NO' : '♪'; };
  mute.addEventListener('click', () => { SND.setMuted(!SND.muted); paintMute(); });
  paintMute();
  SND.music('menu');
  renderTitle();
  window.MZ = { get G() { return G; }, start, render }; // para depurar desde la consola
})();
