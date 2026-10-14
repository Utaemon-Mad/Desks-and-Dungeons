// Menú de pausa (botón ☰ o Esc): a un lado tu héroe girando despacio sobre un círculo de luz,
// al otro todas las opciones de la barra de abajo y del menú. En una partida en solitario el juego se para de verdad
// (el servidor congela el reloj de la mazmorra); en grupo sigue corriendo y se avisa.
(() => {
  const $ = (s) => document.querySelector(s);
  const win = document.createElement('div');
  win.id = 'pausewin'; win.className = 'hidden';
  win.innerHTML =
    '<div class="pz-hero"><div class="pz-stage" id="pz-stage"></div>' +
    '<div class="pz-plate"><b id="pz-name"></b><span id="pz-class"></span></div>' +
    '<div class="pz-stats" id="pz-stats"></div></div>' +
    '<div class="pz-side"><div class="pz-head"><span class="pz-title">PAUSA</span><span class="pz-state" id="pz-state"></span></div>' +
    '<div class="pz-groups" id="pz-groups"></div>' +
    '<button class="btn big pz-resume" id="pz-resume" type="button">▶ CONTINUAR <small>(Esc)</small></button></div>';
  document.body.appendChild(win);

  // Opciones: [icono, texto, qué hace, sólo en la taberna]
  const bar = (act) => () => { const b = document.querySelector(`#bar [data-act="${act}"]`); if (b) b.click(); };
  const menu = (m) => () => { const b = document.querySelector(`#menu-pop [data-m="${m}"]`); if (b) b.click(); };
  const svc = (s) => () => { const b = document.querySelector(`#svc-pop [data-s="${s}"]`); if (b) b.click(); };
  const GROUPS = [
    ['Tu héroe', [
      ['🧙', 'Personaje', bar('char')], ['🎒', 'Equipo', bar('bag')], ['😄', 'Gestos', bar('emotes')],
      ['🐾', 'Establo', bar('stable'), true], ['🏠', 'Mi habitación', svc('room'), true],
    ]],
    ['Aventura', [
      ['🗝️', 'Mazmorras', bar('dungeons'), true], ['🗺️', 'Mundo abierto', bar('world'), true], ['🌀', 'Descenso', svc('descent'), true],
      ['📋', 'Tablón', svc('board'), true], ['🏅', 'Logros y fama', svc('fame'), true],
    ]],
    ['Taberna y pueblo', [
      ['⚒️', 'Forja', svc('forge'), true], ['🍲', 'Cocina', svc('cook'), true], ['🏪', 'Mercado', svc('market'), true],
      ['🏦', 'La taberna', svc('tavern'), true], ['🍺', 'Pedir jarra', bar('drink'), true], ['🎲', 'Dados', bar('dice')],
    ]],
    ['Grupo', [
      ['🛡️', 'Héroes', bar('heroes')], ['🔗', 'Invitar', menu('invite')],
    ]],
    ['Juego', [
      ['📖', 'Guía', bar('guide')], ['📜', 'Comandos', menu('help')], ['📰', 'Novedades', menu('news')], ['📘', 'Guía en PDF', menu('pdf')],
      ['⚙️', 'Ajustes', menu('gfx')], ['⛶', 'Pantalla compl.', menu('fs')], ['📱', 'Instalar', menu('install')],
      ['🚪', 'Menú principal', menu('hero')],
    ]],
  ];

  let open = false;
  const inTavern = () => DD.scene === 'tavern';
  function build() {
    const box = $('#pz-groups'); box.innerHTML = '';
    for (const [title, opts] of GROUPS) {
      const list = opts.filter((o) => !o[3] || inTavern());
      if (!list.length) continue;
      const g = document.createElement('section'); g.className = 'pz-group';
      const h = document.createElement('h4'); h.textContent = title; g.appendChild(h);
      const grid = document.createElement('div'); grid.className = 'pz-grid';
      for (const [ico, label, fn] of list) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'pz-opt';
        b.innerHTML = '<span class="ico"></span><span class="lb"></span>';
        b.firstChild.textContent = ico; b.lastChild.textContent = label;
        b.onclick = () => { close(); setTimeout(fn, 0); };
        grid.appendChild(b);
      }
      g.appendChild(grid); box.appendChild(g);
    }
  }
  function fillHero() {
    const u = DD.users && DD.users.get(DD.myId);
    const p = DD.me;
    $('#pz-name').textContent = u ? u.name : '';
    const st = $('#pz-stats'); st.innerHTML = '';
    if (p) {
      const d = RULES.derive(p);
      const K = RULES.CLASSES[p.char.cls];
      $('#pz-class').textContent = `${K ? K.icon + ' ' + K.name : ''} · nivel ${d.level}`;
      const rows = [['❤️', 'Vida', d.hp], ['⚡', 'Energía', d.en], ['⚔️', 'Daño', `${d.dmg[0]}–${d.dmg[1]}`], ['🛡️', 'Armadura', d.armor], ['🎯', 'Crítico', d.crit + '%'], ['🪙', 'Oro', p.gold]];
      for (const [i, k, v] of rows) { const r = document.createElement('div'); r.innerHTML = '<span></span><b></b>'; r.firstChild.textContent = `${i} ${k}`; r.lastChild.textContent = v; st.appendChild(r); }
    }
    try { if (u && u.look && window.VIEW3D && VIEW3D.turntable) VIEW3D.turntable.show($('#pz-stage'), u.look); } catch (err) { console.warn('pausa: sin héroe 3D', err); }
  }
  function setState(text, cls) { const s = $('#pz-state'); s.textContent = text; s.className = 'pz-state ' + (cls || ''); }
  function openPause() {
    if (open || document.body.classList.contains('at-title')) return;
    open = true;
    if (DD.closePops) DD.closePops();
    document.querySelectorAll('.pop').forEach((p) => p.classList.add('hidden'));
    build(); fillHero();
    win.classList.remove('hidden');
    DD.sfx && DD.sfx('open');
    if (inTavern()) setState('La taberna sigue a lo suyo', 'info');
    else { setState('Pausando…', 'info'); DD.net.send({ t: 'dpause', on: true }); }
  }
  function close() {
    if (!open) return;
    open = false;
    win.classList.add('hidden');
    if (window.VIEW3D && VIEW3D.turntable) VIEW3D.turntable.hide();
    if (!inTavern()) DD.net.send({ t: 'dpause', on: false });
    DD.sfx && DD.sfx('close');
  }
  DD.on('dpaused', (m) => {
    if (!open) return;
    if (m.group) setState('⚠ En grupo el juego no se para: ¡cuidado!', 'warn');
    else setState(m.on ? '⏸ Juego en pausa' : '', m.on ? 'ok' : '');
  });
  $('#pz-resume').onclick = close;
  win.addEventListener('pointerdown', (e) => { if (e.target === win) close(); });
  // al cambiar de escena (salir de la mazmorra, volver al título) se cierra
  DD.on('welcome', () => { if (open) close(); });

  // el botón ☰ de la barra abre la pausa en vez del menú pequeño
  const menuBtn = document.querySelector('#bar [data-act="menu"]');
  if (menuBtn) menuBtn.addEventListener('click', (e) => { e.stopImmediatePropagation(); openPause(); }, true);
  // Esc: abre o cierra la pausa (si no hay otra ventana abierta, ni se está escribiendo)
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (open) { e.stopImmediatePropagation(); close(); return; }
    const typing = document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName);
    const other = document.querySelector('.overlay:not(.hidden):not(#pausewin), #editor:not(.hidden), .pop:not(.hidden)');
    if (typing || other || document.body.classList.contains('editing') || document.body.classList.contains('at-title')) return;
    e.preventDefault(); e.stopImmediatePropagation(); openPause();
  }, true);

  DD.pause = { open: openPause, close, isOpen: () => open };
})();
