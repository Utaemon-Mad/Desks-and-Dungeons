/* global DD, RULES, PROG, DSPRITES, ICONS */
// Menú de mazmorras: elegir tema y nivel, crear partida o unirse a una de la lista.
// Comparte estado con public/dungeon.js a través de DD.dg (const D).
(() => {
  'use strict';
  const D = DD.dg;
  const { $ } = D;

  // ======================================================================
  //  Menú de mazmorras
  // ======================================================================
  const menuEl = $('#dmenu'), listEl = $('#dlist');
  const menu = { theme: 'random', level: 1, max: 4 };

  DD.on('open-dungeons', () => {
    menuEl.classList.remove('hidden');
    listEl.innerHTML = '<p class="muted">Buscando partidas…</p>';
    DD.net.send({ t: 'dmenu' });
    buildThemes();
  });
  $('#dclose').onclick = () => menuEl.classList.add('hidden');

  function buildThemes() {
    const box = $('#dthemes');
    box.innerHTML = '';
    for (const [id, th] of [['random', { name: 'Al azar', icon: '🎲' }], ...Object.entries(RULES.THEMES)]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'theme-btn' + (menu.theme === id ? ' on' : '');
      b.innerHTML = '<span class="ic"></span><span></span>';
      b.firstChild.textContent = th.icon;
      b.lastChild.textContent = th.name;
      if (id !== 'random') b.title = `Jefe: ${RULES.MONSTERS[th.boss].name}`;
      b.onclick = () => { menu.theme = id; buildThemes(); };
      box.appendChild(b);
    }
    const lv = $('#dlevel');
    lv.max = menu.max;
    lv.value = Math.min(menu.level, menu.max);
    $('#dlevel-val').textContent = lv.value;
    const me = DD.me ? RULES.levelFromXp(DD.me.xp) : 1;
    $('#dlevel-hint').textContent = Number(lv.value) > me ? '⚠️ Por encima de tu nivel: más peligro y mejor botín.' : Number(lv.value) < me - 3 ? 'Muy fácil: darán poca experiencia.' : 'Adecuada para tu nivel.';
  }
  $('#dlevel').addEventListener('input', (e) => { menu.level = Number(e.target.value); buildThemes(); });
  $('#dgo').onclick = () => { menuEl.classList.add('hidden'); DD.net.send({ t: 'dnew', theme: menu.theme === 'random' ? null : menu.theme, level: menu.level }); };
  { const b = document.createElement('button'); b.className = 'btn big raid-btn'; b.type = 'button'; b.id = 'draid'; b.textContent = '⚔️ ASALTO SEMANAL (en grupo)'; b.onclick = () => { menuEl.classList.add('hidden'); DD.emit('open-raid'); }; $('#dgo').after(b); }
  { const b = document.createElement('button'); b.className = 'btn alt big'; b.type = 'button'; b.id = 'ddescent'; b.textContent = '🌀 DESCENSO INFINITO'; b.onclick = () => { menuEl.classList.add('hidden'); DD.emit('open-descent'); }; $('#dgo').after(b); }

  DD.on('dmenu', (m) => {
    menu.max = m.maxLevel;
    if (!menu.touched && DD.me) { menu.level = RULES.levelFromXp(DD.me.xp); menu.touched = true; }
    buildThemes();
    listEl.innerHTML = '';
    if (!m.list.length) { listEl.innerHTML = '<p class="muted">No hay partidas abiertas. ¡Crea una y que se unan tus amigos!</p>'; return; }
    for (const d of m.list) {
      const row = document.createElement('div');
      row.className = 'drow';
      const info = document.createElement('div');
      info.className = 'dinfo';
      const nm = document.createElement('b'); nm.textContent = `${d.raid ? '⚔️' : (RULES.THEMES[d.theme] || {}).icon || ''} ${d.name}`;
      const meta = document.createElement('small'); meta.textContent = `Nivel ${d.level} · ${d.players.length ? 'dentro: ' + d.players.join(', ') : 'vacía'}`;
      info.append(nm, meta);
      const play = document.createElement('button'); play.className = 'btn'; play.textContent = '⚔️ UNIRSE';
      play.onclick = () => { menuEl.classList.add('hidden'); DD.net.send({ t: 'djoin', id: d.id }); };
      row.append(info, play);
      listEl.appendChild(row);
    }
  });


})();
