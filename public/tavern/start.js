/* global MAP, RULES, SPRITES, THREE, MODELS, VIEW3D */
(() => {
  'use strict';
  const C = DD.core;
  const { $, blip, drawHero, load, net, playerToken, save, toast, users } = C;

  // ======================================================================
  //  Pantalla de inicio: «pulsa una tecla» → nuevo personaje (3 casillas), continuar o elegir servidor.
  //  Los personajes se guardan en el servidor con el token de este navegador.
  // ======================================================================
  const titleEl = $('#start'), slotsEl = $('#slots'), serversEl = $('#servers'), loginEl = $('#login');
  const SCREENS = [titleEl, slotsEl, serversEl, loginEl];
  const profile = (() => { try { return JSON.parse(load('dd-profile')) || {}; } catch { return {}; } })();
  const look = MAP.cleanLook(Object.assign({ cls: 'guerrero', species: 'human', skin: 0, hair: 0 }, profile.look));
  const validServer = (id) => (MAP.SERVERS.some((x) => x.id === id) ? id : null);
  // nombre actual del servidor (el dueño puede cambiarlo; llega con la cuenta)
  const serverName = (id) => ((acct && acct.servers.find((x) => x.id === id)) || MAP.SERVERS.find((x) => x.id === id) || MAP.SERVERS[0]).name;
  let server = validServer(new URLSearchParams(location.search).get('sala')) || validServer(load('dd-server')) || MAP.SERVERS[0].id;
  let acct = null;      // { slots, last, servers } de la cuenta
  let screen = 'press'; // press | menu | slots | servers | create
  let createSlot = 0;
  let sel = 0;          // opción resaltada con el teclado

  // Conexión corta para la pantalla de inicio (ver, crear y borrar personajes antes de entrar)
  const lobby = {
    ws: null, wait: [],
    call(msg) {
      return new Promise((resolve) => {
        // al saludar se manda la copia de seguridad de la cuenta (por si el servidor se reinició y la perdió)
        const go = () => { this.wait.push(resolve); this.ws.send(JSON.stringify({ ...msg, token: playerToken(), backup: msg.t === 'hello' ? C.backup() : undefined })); };
        if (this.ws && this.ws.readyState === 1) return go();
        if (!this.ws || this.ws.readyState > 1) {
          const proto = location.protocol === 'https:' ? 'wss' : 'ws';
          const ws = this.ws = new WebSocket(`${proto}://${location.host}/ws`);
          ws.onmessage = (ev) => {
            let m; try { m = JSON.parse(ev.data); } catch { return; }
            if (m.t === 'error') toast(m.text);
            if (m.backup) C.saveBackup(m.backup);
            if (m.t === 'account' || m.t === 'error') { const r = this.wait.shift(); if (r) r(m); }
          };
          ws.onclose = () => { for (const r of this.wait.splice(0)) r({ t: 'error' }); };
          ws.onerror = () => {};
        }
        this.ws.addEventListener('open', go, { once: true });
      });
    },
    close() { if (this.ws) { const ws = this.ws; this.ws = null; ws.onclose = null; ws.close(); } },
  };

  async function refreshAccount() {
    const m = await lobby.call({ t: 'hello' });
    if (m.t === 'account') acct = m;
    renderMenu();
    return acct;
  }

  function show(el) { for (const e of SCREENS) e.classList.toggle('hidden', e !== el); document.body.classList.add('at-title'); }

  function toTitle(atMenu = true) {
    SFX.music('menu');
    net.close(); users.clear(); DD.me = null; C.myId = null;
    DD.emit('to-title');
    C.setEditing(false);
    for (const o of document.querySelectorAll('.overlay')) if (!SCREENS.includes(o)) o.classList.add('hidden');
    show(titleEl);
    screen = atMenu ? 'menu' : 'press';
    $('#press').classList.toggle('hidden', atMenu);
    $('#main-menu').classList.toggle('hidden', !atMenu);
    sel = 0;
    refreshAccount();
  }

  function slotLine(sl) {
    const k = RULES.CLASSES[sl.cls];
    const where = sl.at === 'world' ? `en ${sl.place || 'el mundo'}` : sl.at === 'dungeon' ? `en «${sl.place || 'una mazmorra'}»` : 'en la taberna';
    return { title: `${sl.name}${sl.title ? ` «${sl.title}»` : ''}`, sub: `${k ? k.icon + ' ' + k.name : ''} · nivel ${sl.level}`, where: sl.server ? `${serverName(sl.server)} · ${where}` : 'Sin estrenar' };
  }

  function renderMenu() {
    const last = acct && acct.last && acct.slots[acct.last.slot];
    const cont = $('#main-menu [data-go="continue"]');
    cont.disabled = !last;
    $('#mm-cont').textContent = last ? `${slotLine(last).title} · nv ${last.level} · ${slotLine(last).where}` : acct ? 'Aún no has jugado con ningún personaje' : 'Conectando…';
    const used = acct ? acct.slots.filter(Boolean).length : 0;
    $('#mm-new').textContent = acct ? `${used} de 3 casillas ocupadas` : 'Tres casillas para tus héroes';
    const sv = acct && acct.servers.find((x) => x.id === server);
    $('#mm-acct').textContent = acct && acct.login ? `Guardada como «${acct.login}»` : 'Guárdala con usuario y contraseña';
    $('#mm-srv').textContent = `${serverName(server)}${sv ? ` · ${sv.online} ${sv.online === 1 ? 'jugador' : 'jugadores'}` : ''}`;
    menuSel();
    if (screen === 'slots') renderSlots();
    if (screen === 'servers') renderServers();
  }

  const menuButtons = () => [...$('#main-menu').querySelectorAll('button')].filter((b) => !b.disabled);
  function menuSel() {
    const bs = menuButtons();
    sel = Math.max(0, Math.min(sel, bs.length - 1));
    for (const b of $('#main-menu').querySelectorAll('button')) b.classList.toggle('sel', b === bs[sel]);
  }

  function heroCanvas(lk, w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    try { c.getContext('2d').drawImage(VIEW3D.snapshot(lk, w, h, 'full'), 0, 0); } catch { drawHero(c.getContext('2d'), w / 2, h - 10, lk, { dir: 'E', t: 0 }); }
    return c;
  }

  function renderSlots() {
    $('#slots-srv').textContent = serverName(server);
    const box = $('#slot-list'); box.innerHTML = '';
    (acct ? acct.slots : [null, null, null]).forEach((sl, i) => {
      const card = document.createElement('div');
      if (!sl) {
        card.className = 'slot empty'; card.textContent = `＋ Crear personaje (casilla ${i + 1})`;
        card.onclick = () => openCreate(i);
      } else {
        const L = slotLine(sl);
        card.className = 'slot';
        card.appendChild(heroCanvas(sl.look, 72, 88));
        const info = document.createElement('div'); info.className = 'info';
        info.innerHTML = '<div class="nm"></div><div class="sub"></div><div class="sub"></div>';
        info.children[0].textContent = L.title; info.children[1].textContent = L.sub; info.children[2].textContent = L.where;
        const acts = document.createElement('div'); acts.className = 'acts';
        const play = document.createElement('button'); play.className = 'btn'; play.type = 'button'; play.textContent = 'JUGAR';
        play.onclick = () => enterGame(i, server);
        const del = document.createElement('button'); del.className = 'btn alt'; del.type = 'button'; del.textContent = 'Borrar';
        del.onclick = async () => {
          if (!confirm(`¿Borrar a ${sl.name} para siempre? Se pierden su nivel, su oro y su equipo.`)) return;
          const m = await lobby.call({ t: 'char:del', slot: i });
          if (m.t === 'account') { acct = m; renderMenu(); }
        };
        acts.append(play, del);
        card.append(info, acts);
      }
      box.appendChild(card);
    });
  }

  function renderServers() {
    const box = $('#server-list'); box.innerHTML = '';
    for (const sv of MAP.SERVERS) {
      const st = acct && acct.servers.find((x) => x.id === sv.id);
      const name = serverName(sv.id);
      const b = document.createElement('div');
      b.className = 'server' + (sv.id === server ? ' cur' : '');
      b.tabIndex = 0;
      b.innerHTML = '<div class="info"><div class="nm"></div><div class="sub"></div></div><div class="on"></div>';
      b.querySelector('.nm').textContent = (sv.id === server ? '✔ ' : '') + name;
      b.querySelector('.sub').textContent = st ? (st.mine ? '👑 Eres el dueño de este servidor' : st.online ? 'Hay gente jugando' : 'Ahora mismo está vacío') : '';
      b.querySelector('.on').textContent = st ? `👥 ${st.online}` : '';
      b.onclick = () => { server = sv.id; save('dd-server', server); toast(`Servidor: ${name}`); goMenu(); };
      if (st && st.canEdit) {
        const ed = document.createElement('button'); ed.type = 'button'; ed.className = 'btn alt rename'; ed.textContent = '✏️ Nombre';
        ed.title = 'Cambiar el nombre del servidor';
        ed.onclick = async (e) => {
          e.stopPropagation();
          const nn = (prompt('Nuevo nombre del servidor:', name) || '').trim().slice(0, MAP.SERVER_NAME_MAX);
          if (!nn || nn === name) return;
          const m = await lobby.call({ t: 'server:rename', id: sv.id, name: nn });
          if (m.t === 'account') { acct = m; toast(`El servidor ahora se llama «${nn}».`); renderMenu(); }
        };
        b.appendChild(ed);
      }
      box.appendChild(b);
    }
  }

  function goMenu() { show(titleEl); screen = 'menu'; $('#press').classList.add('hidden'); $('#main-menu').classList.remove('hidden'); menuSel(); }
  function openSlots() { show(slotsEl); screen = 'slots'; renderSlots(); refreshAccount(); }
  function openServers() { show(serversEl); screen = 'servers'; renderServers(); refreshAccount(); }

  function pick(go) {
    blip(520, 0.06);
    if (go === 'new') openSlots();
    else if (go === 'server') openServers();
    else if (go === 'continue' && acct && acct.last) enterGame(acct.last.slot, acct.last.server);
    else if (go === 'account') openAccount();
  }

  function enterGame(slot, srv) {
    lobby.close();
    for (const e of SCREENS) e.classList.add('hidden');
    document.body.classList.remove('at-title');
    blip(440, 0.1);
    net.connect({ slot, server: srv });
  }

  function pressAnyKey() {
    if (screen !== 'press') return;
    screen = 'menu';
    $('#press').classList.add('hidden');
    $('#main-menu').classList.remove('hidden');
    blip(660, 0.08);
    sel = 0; menuSel();
  }

  if (matchMedia('(pointer: coarse)').matches) { $('#press').textContent = 'Toca la pantalla para empezar'; document.querySelector('.title-foot').classList.add('hidden'); }
  $('#main-menu').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && !b.disabled) pick(b.dataset.go); });
  $('#main-menu').addEventListener('mousemove', (e) => { const b = e.target.closest('button'); const i = menuButtons().indexOf(b); if (i >= 0 && i !== sel) { sel = i; menuSel(); } });
  titleEl.addEventListener('pointerdown', () => pressAnyKey());
  for (const b of document.querySelectorAll('[data-back]')) b.addEventListener('click', goMenu);
  $('#login-back').addEventListener('click', () => { if (edMode === 'edit') loginEl.classList.add('hidden'); else openSlots(); });
  window.addEventListener('keydown', (e) => {
    if (titleEl.classList.contains('hidden') && slotsEl.classList.contains('hidden') && serversEl.classList.contains('hidden')) return;
    if (!acctWin.classList.contains('hidden')) { if (e.key === 'Escape') acctWin.classList.add('hidden'); return; }
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
    if (screen === 'press') { if (!e.repeat) { e.preventDefault(); pressAnyKey(); } return; }
    if (screen === 'menu') {
      const bs = menuButtons();
      if (e.key === 'ArrowDown' || e.key === 's') { sel = (sel + 1) % bs.length; menuSel(); e.preventDefault(); }
      else if (e.key === 'ArrowUp' || e.key === 'w') { sel = (sel - 1 + bs.length) % bs.length; menuSel(); e.preventDefault(); }
      else if (e.key === 'Enter' || e.key === ' ') { if (bs[sel]) pick(bs[sel].dataset.go); e.preventDefault(); }
      else if (e.key === 'Escape') { screen = 'press'; $('#press').classList.remove('hidden'); $('#main-menu').classList.add('hidden'); }
      return;
    }
    if (e.key === 'Escape') goMenu();
  });

  // ---------- Editor de personaje ----------
  // create: héroe nuevo en una casilla (con el reparto de los primeros puntos); edit: cambiar aspecto, raza o clase
  let edMode = 'create', edRot = 0.55, edZoom = false;
  const edAlloc = Object.fromEntries(RULES.STAT_IDS.map((k) => [k, 0]));
  const starterCache = {};
  const fmtMods = (mods) => Object.entries(mods).map(([k, v]) => `${v > 0 ? '+' : ''}${v} ${RULES.STATS.find((x) => x.id === k).abbr}`).join(' ');
  const edChar = () => ({ cls: look.cls, alloc: { ...edAlloc }, look: { species: look.species } });

  function openEditor(mode) {
    edMode = mode;
    if (mode === 'create') { show(loginEl); screen = 'create'; } else loginEl.classList.remove('hidden');
    const create = mode === 'create';
    $('#ed-title').textContent = create ? `NUEVO HÉROE · CASILLA ${createSlot + 1}` : 'ASPECTO, RAZA Y CLASE';
    $('#ed-submit').textContent = create ? 'CREAR Y JUGAR' : 'GUARDAR CAMBIOS';
    $('#ed-name-l').classList.toggle('hidden', !create);
    $('#ed-stats-sec').classList.toggle('hidden', !create);
    $('#ed-edit-note').classList.toggle('hidden', create);
    buildPickers();
    if (create) setTimeout(() => $('#login-name').focus(), 50);
  }
  function openCreate(slot) {
    createSlot = slot;
    for (const k of RULES.STAT_IDS) edAlloc[k] = 0;
    $('#login-name').value = '';
    openEditor('create');
  }
  DD.on('open-editor', (o) => { Object.assign(look, MAP.cleanLook(o.look)); openEditor('edit'); });

  function pickRow(box, items, cur, onPick) {
    box.innerHTML = '';
    for (const it of items) {
      const b = document.createElement('button'); b.type = 'button';
      b.className = cur === it.id ? 'on' : '';
      if (it.title) b.title = it.title;
      b.innerHTML = '<span></span>' + (it.sub ? '<small></small>' : '');
      b.firstChild.textContent = it.label;
      if (it.sub) b.lastChild.textContent = it.sub;
      b.onclick = () => { onPick(it.id); buildPickers(); };
      box.appendChild(b);
    }
  }

  function clampAlloc() {
    const base = RULES.baseStats(edChar());
    let budget = RULES.POINTS_START;
    for (const k of RULES.STAT_IDS) { edAlloc[k] = Math.max(0, Math.min(edAlloc[k], RULES.STAT_MAX - base[k], budget)); budget -= edAlloc[k]; }
  }

  function buildPickers() {
    pickRow($('#sex-pick'), Object.entries(MAP.SEXES).map(([id, name]) => ({ id, label: name })), look.sex, (id) => { look.sex = id; look.hs = MAP.hairstyle(id, id === 'm' && look.species === 'dwarf' ? 'barba' : null).id; });
    pickRow($('#species-pick'), RULES.RACE_IDS.map((id) => ({ id, label: RULES.RACES[id].name, sub: fmtMods(RULES.RACES[id].mods), title: RULES.RACES[id].perkText })), look.species, (id) => {
      look.species = id;
      if (!MAP.skinsFor(id).includes(look.skin)) look.skin = MAP.skinsFor(id)[0];
    });
    $('#ed-race-note').textContent = RULES.RACES[look.species].perkText;
    pickRow($('#class-pick'), RULES.CLASS_IDS.map((id) => { const k = RULES.CLASSES[id]; return { id, label: `${k.icon} ${k.name}`, sub: fmtMods(k.base), title: k.desc }; }), look.cls, (id) => { look.cls = id; });
    const K = RULES.CLASSES[look.cls];
    $('#login-sheet-note').textContent = `${K.desc} Prefiere: ${K.weapons.map((w) => (RULES.WEAPONS[w] || RULES.OFFHANDS[w]).name.toLowerCase()).join(', ')}.`;
    pickRow($('#hs-pick'), MAP.HAIRSTYLES[look.sex].map((h) => ({ id: h.id, label: h.name })), look.hs, (id) => { look.hs = id; });
    // goblins: su propio modelo de cabeza, con sus rasgos (el peinado sale de aquí y no de la lista general)
    const isGob = look.species === 'goblin';
    $('#hs-pick').classList.toggle('hidden', isGob);
    $('#hs-title').textContent = isGob ? 'Colores' : 'Peinado';
    $('#gob-sec').classList.toggle('hidden', !isGob);
    if (isGob) {
      look.gob = MAP.cleanGoblin(look.gob, look.sex);
      const box = $('#gob-picks'); box.innerHTML = '';
      for (const k of MAP.GOBLIN_KEYS) {
        const F = MAP.GOBLIN[k];
        const wrap = document.createElement('div'); wrap.className = 'gob-field';
        wrap.innerHTML = '<div class="field-title"></div><div class="class-pick small"></div>';
        wrap.firstChild.textContent = F.name;
        box.appendChild(wrap);
        pickRow(wrap.lastChild, F.opts.map((label, i) => ({ id: i, label })), look.gob[k], (id) => { look.gob[k] = id; });
      }
    } else delete look.gob;
    const skinEl = $('#skin-pick'); skinEl.innerHTML = '';
    MAP.skinsFor(look.species).forEach((i) => {
      const b = document.createElement('button'); b.type = 'button';
      b.style.background = MAP.SKINS[i]; b.className = look.skin === i ? 'on' : '';
      b.onclick = () => { look.skin = i; buildPickers(); };
      skinEl.appendChild(b);
    });
    const hairEl = $('#hair-pick'); hairEl.innerHTML = '';
    MAP.HAIRS.forEach((col, i) => {
      const b = document.createElement('button'); b.type = 'button';
      b.style.background = col; b.className = look.hair === i ? 'on' : '';
      b.onclick = () => { look.hair = i; buildPickers(); };
      hairEl.appendChild(b);
    });

    // características: base de raza + clase, más los primeros puntos (sin pasar de 20)
    clampAlloc();
    const base = RULES.baseStats(edChar());
    const left = RULES.POINTS_START - Object.values(edAlloc).reduce((a, b) => a + b, 0);
    $('#ed-points').textContent = left;
    const sb = $('#ed-stats'); sb.innerHTML = '';
    for (const S of RULES.STATS) {
      const row = document.createElement('div'); row.className = 'ed-stat'; row.title = S.desc;
      const v = base[S.id] + edAlloc[S.id];
      row.innerHTML = '<div class="nm"><span></span><small></small></div><div class="bar"><i></i></div><button type="button">−</button><div class="val"></div><button type="button">+</button>';
      row.querySelector('.nm span').textContent = S.name;
      row.querySelector('.nm small').textContent = S.desc.split(/[,(]/)[0];
      const bar = row.querySelector('.bar');
      bar.firstChild.style.width = (100 * base[S.id] / RULES.STAT_MAX) + '%';
      if (edAlloc[S.id]) { const a = document.createElement('i'); a.className = 'alloc'; a.style.cssText = `width:${100 * edAlloc[S.id] / RULES.STAT_MAX}%;margin-top:-8px;margin-left:${100 * base[S.id] / RULES.STAT_MAX}%`; bar.appendChild(a); }
      const val = row.querySelector('.val'); val.textContent = v; if (S.id === K.main) val.classList.add('main');
      const [minus, plus] = row.querySelectorAll('button');
      minus.disabled = !edAlloc[S.id];
      plus.disabled = left <= 0 || v >= RULES.STAT_MAX;
      minus.onclick = () => { edAlloc[S.id]--; buildPickers(); };
      plus.onclick = () => { edAlloc[S.id]++; buildPickers(); };
      sb.appendChild(row);
    }

    // vista previa: el héroe con el equipo inicial de su clase y lo que tendría en combate
    if (!starterCache[look.cls]) starterCache[look.cls] = RULES.starterItems(look.cls, RULES.seeded('preview:' + look.cls));
    const equip = Object.fromEntries(starterCache[look.cls].map((it) => [it.slot, it]));
    const gear = RULES.gearLook(equip);
    const pv = $('#preview'), g = pv.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, pv.width, pv.height);
    try { g.drawImage(VIEW3D.snapshot({ ...look, gear }, pv.width, pv.height, edZoom ? 'bust' : 'full', edRot), 0, 0); } catch { drawHero(g, 130, 300, { ...look, gear }, { dir: 'E', t: 0 }); }
    const R = RULES.RACES[look.species];
    $('#ed-summary').textContent = `${R.name}${look.sex === 'f' ? ' · mujer' : ''} · ${K.icon} ${K.name}`;
    const d = RULES.derive({ xp: 0, char: edMode === 'create' ? edChar() : { ...edChar(), alloc: Object.fromEntries(RULES.STAT_IDS.map((k) => [k, 0])) }, equip, bag: [], buffs: {} });
    const dv = [['❤️ Vida', d.hp], ['⚡ Energía', d.en], ['⚔️ Daño', `${d.dmg[0]}–${d.dmg[1]}`], ['✨ Hechizos', `${d.spell[0]}–${d.spell[1]}`], ['🛡️ Armadura', d.armor], ['🎯 Crítico', d.crit + '%'], ['💨 Esquiva', d.dodge + '%'], ['🔮 Res. mágica', d.magicRes + '%']];
    $('#ed-derived').innerHTML = '';
    for (const [k, v] of dv) { const r = document.createElement('div'); r.innerHTML = '<span></span> <b></b>'; r.firstChild.textContent = k; r.lastChild.textContent = v; $('#ed-derived').appendChild(r); }
  }
  $('#ed-rl').addEventListener('click', () => { edRot -= 0.6; buildPickers(); });
  $('#ed-rr').addEventListener('click', () => { edRot += 0.6; buildPickers(); });
  // primer plano de la cara en la vista previa (para afinar los rasgos)
  $('#ed-zoom').addEventListener('click', () => { edZoom = !edZoom; $('#ed-zoom').classList.toggle('on', edZoom); buildPickers(); });
  // goblin al azar: todos los rasgos, el tono de piel y el color de pelo
  $('#gob-rand').addEventListener('click', () => {
    const r = (n) => Math.floor(Math.random() * n);
    look.gob = Object.fromEntries(MAP.GOBLIN_KEYS.map((k) => [k, r(MAP.GOBLIN[k].opts.length)]));
    const skins = MAP.skinsFor('goblin'); look.skin = skins[r(skins.length)];
    look.hair = r(MAP.HAIRS.length);
    buildPickers();
  });

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    Object.assign(profile, { look: { ...look } });
    save('dd-profile', JSON.stringify(profile));
    if (edMode === 'edit') {
      net.send({ t: 'char:save', look: { ...look } });
      loginEl.classList.add('hidden');
      return;
    }
    const name = $('#login-name').value.trim().slice(0, 16);
    if (!name) { $('#login-name').focus(); toast('Ponle un nombre a tu héroe.'); return; }
    const m = await lobby.call({ t: 'char:new', slot: createSlot, name, look: { ...look }, alloc: { ...edAlloc } });
    if (m.t !== 'account') return;
    acct = m;
    enterGame(createSlot, server);
  });

  // ---------- Mi cuenta: usuario y contraseña ----------
  const acctWin = $('#acctwin');
  $('#acct-close').onclick = () => acctWin.classList.add('hidden');
  function field(label, type, ph) {
    const w = document.createElement('label'); w.className = 'acct-field';
    const s = document.createElement('span'); s.textContent = label;
    const i = document.createElement('input'); i.type = type; i.placeholder = ph || ''; i.maxLength = type === 'password' ? 100 : 20; i.autocomplete = type === 'password' ? 'current-password' : 'username';
    w.append(s, i); return [w, i];
  }
  function btn(text, cls, fn) { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ' + (cls || ''); b.textContent = text; b.onclick = fn; return b; }
  function para(text, cls) { const p = document.createElement('p'); p.className = cls || 'tag small'; p.textContent = text; return p; }
  function openAccount(tab) {
    acctWin.classList.remove('hidden');
    const body = $('#acct-body'); body.innerHTML = '';
    const user = acct && acct.login;
    if (user && tab !== 'login') {
      body.append(para(`Tu cuenta está guardada como «${user}». Para jugar desde otro ordenador o desde el móvil, pulsa «Mi cuenta → Entrar con mi cuenta» allí y escribe tu usuario y contraseña.`, 'tag'));
      body.append(btn('Cambiar la contraseña', 'alt', () => openAccount('register')), btn('Entrar con otra cuenta', 'alt', () => openAccount('login')));
      return;
    }
    const tabs = document.createElement('div'); tabs.className = 'title-row';
    const mode = tab || (user ? 'login' : 'register');
    tabs.append(btn(user ? 'Cambiar contraseña' : 'Guardar mi cuenta', mode === 'register' ? '' : 'alt', () => openAccount('register')), btn('Entrar con mi cuenta', mode === 'login' ? '' : 'alt', () => openAccount('login')));
    body.append(tabs);
    const [fu, iu] = field('Usuario', 'text', 'p. ej. dani87');
    const [fp, ip] = field('Contraseña', 'password', 'mínimo 6 caracteres');
    if (user) { iu.value = user; }
    if (mode === 'register') {
      body.append(para('Ponle usuario y contraseña a esta cuenta (tus personajes de este navegador) para no perderla y entrar desde cualquier dispositivo.'));
      const [fp2, ip2] = field('Repite la contraseña', 'password', '');
      ip.autocomplete = ip2.autocomplete = 'new-password';
      body.append(fu, fp, fp2, btn('💾 GUARDAR', 'big', async () => {
        if (ip.value !== ip2.value) return toast('Las contraseñas no coinciden.');
        const m = await lobby.call({ t: 'acct:register', user: iu.value, pass: ip.value });
        if (m.t !== 'account') return;
        acct = m; renderMenu();
        toast(`🔑 Cuenta guardada como «${m.registered}».`);
        openAccount();
      }));
    } else {
      body.append(para('Escribe el usuario y la contraseña que pusiste en tu otro dispositivo. Este navegador pasará a usar esa cuenta (los personajes que tuviera aquí sin guardar dejarán de verse).'));
      body.append(fu, fp, btn('🚪 ENTRAR', 'big', async () => {
        const m = await lobby.call({ t: 'acct:login', user: iu.value, pass: ip.value });
        if (m.t !== 'account' || !m.token) return;
        save('dd-token', m.token);
        if (m.backup) C.saveBackup(m.backup);
        lobby.close();
        await refreshAccount();
        toast(`¡Hola de nuevo, ${m.login}! Ya tienes aquí tus personajes.`);
        acctWin.classList.add('hidden');
      }));
    }
    // Intro en cualquier casilla = pulsar el botón grande
    for (const i of body.querySelectorAll('input')) i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const b = body.querySelector('.btn.big'); if (b) b.click(); } });
    setTimeout(() => iu.focus(), 50);
  }

  // ---------- Carga: barra de progreso y consejos mientras llegan los modelos 3D ----------
  const TIPS = [
    'Alt+clic (o la tecla P) marca un sitio en el suelo para todo el grupo.',
    'Espacio hace una voltereta: eres invulnerable un instante. Úsala contra los golpes de los jefes.',
    'Los jefes marcan el suelo en rojo antes de un gran golpe: ¡sal de ahí!',
    'Pasa el ratón por un objeto para comparar sus propiedades con lo que llevas puesto.',
    'Los goblins encuentran más objetos mágicos: +15% de hallazgo mágico.',
    'Madre Zarza vende pociones: lleva unas cuantas antes de bajar a una mazmorra.',
    'Si caes, aparece «Volver con tu grupo» en la taberna mientras tus amigos sigan dentro.',
    'En ☰ Menú → Ajustes puedes cambiar el volumen, la calidad, el tamaño del texto y las teclas.',
    'Los objetos de conjunto (verdes) los sueltan los jefes. ¡Junta varias piezas para ganar bonificaciones!',
    'Con 🔗 Copiar enlace de invitación tus amigos entran directamente en tu taberna.',
    'Las puertas cerradas tapan lo que hay detrás: ábrelas con cuidado.',
    'En la Forja de Brunilda puedes mejorar tus objetos hasta +10.',
  ];
  const tipEl = $('#load-tip'), loadBox = $('#loadbox'), fillEl = $('#load-fill'), loadTxt = $('#load-txt');
  let tipI = Math.floor(Math.random() * TIPS.length);
  const nextTip = () => { if (tipEl) { tipEl.textContent = '💡 ' + TIPS[tipI++ % TIPS.length]; tipEl.classList.remove('tip-in'); void tipEl.offsetWidth; tipEl.classList.add('tip-in'); } };
  nextTip();
  const tipTimer = setInterval(() => { if (titleEl.classList.contains('hidden')) return; nextTip(); }, 6500);
  window.addEventListener('dd-load', (e) => {
    const { done, total } = e.detail || {};
    if (!total || !fillEl) return;
    const pct = Math.round(100 * done / total);
    fillEl.style.width = pct + '%';
    loadTxt.textContent = pct < 100 ? `Cargando héroes y monstruos… ${pct}%` : '¡Listo!';
  });
  const loadDone = () => { if (!loadBox) return; fillEl.style.width = '100%'; loadTxt.textContent = '¡Listo!'; setTimeout(() => loadBox.classList.add('done'), 600); };
  if (DD.modelsReady) DD.modelsReady.then(loadDone, loadDone); else loadDone();
  void tipTimer;

  Object.assign(C, { buildPickers, loginEl, profile, renderSlots, toTitle });
  Object.defineProperty(C, 'screen', { get: () => screen, set: (v) => { screen = v; } });
})();
