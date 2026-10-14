/* global DD, RULES */
// La historia de cada mazmorra (RULES.LORE): al pisar una nota o ponerse delante de un mural sale un pergamino con su
// trozo de historia (en orden: 1/4, 2/4…); al caer el jefe, el final, con cuántas partes se encontraron.
(() => {
  'use strict';
  const D = DD.dg;
  const { game, viewEl } = D;
  const win = document.createElement('div'); win.id = 'lorewin'; win.className = 'hidden';
  win.innerHTML = '<div class="lw-head"><b class="lw-title"></b><small class="lw-part"></small></div><p class="lw-text"></p><button class="btn alt lw-close" type="button">Seguir</button>';
  viewEl.appendChild(win);
  let hideT = 0;
  win.querySelector('.lw-close').onclick = () => win.classList.add('hidden');

  function show(title, part, text, end) {
    win.className = end ? 'end' : '';
    win.querySelector('.lw-title').textContent = title;
    win.querySelector('.lw-part').textContent = part;
    win.querySelector('.lw-text').textContent = text;
    clearTimeout(hideT); hideT = setTimeout(() => win.classList.add('hidden'), end ? 22000 : 15000);
    DD.sfx('quest');
  }
  const loreOf = () => game.map && game.map.kind === 'dungeon' && RULES.LORE ? RULES.LORE[game.map.theme] : null;

  // cada fotograma: ¿hay una nota a mano que aún no se ha leído?
  function update() {
    const L = loreOf(), me = game.ents.get(DD.myId);
    if (!L || !me || !game.map.props) return;
    game.lore = game.lore || new Set();
    for (const p of game.map.props) {
      if ((p.k !== 'note' && p.k !== 'mural') || game.lore.has(p.n)) continue;
      const near = p.k === 'note' ? Math.max(Math.abs(me.x - p.x), Math.abs(me.y - p.y)) <= 1 : me.y >= p.y + 1 && me.y <= p.y + 2 && Math.abs(me.x - p.x) <= 1;
      if (!near) continue;
      game.lore.add(p.n);
      show(`📜 ${L.title}`, `${p.k === 'mural' ? 'Mural' : 'Hallazgo'} ${p.n + 1} de ${L.notes.length}`, L.notes[p.n] || '');
      D.log && D.log(`📜 Encuentras algo: ${L.title} (${p.n + 1}/${L.notes.length})`, 'good');
      break;
    }
  }

  // el final de la historia, al caer el jefe de la mazmorra
  function end(ev) {
    const L = loreOf();
    if (!L || !ev.boss) return;
    const got = game.lore ? game.lore.size : 0;
    setTimeout(() => show(`📜 ${L.title} · Final`, `Has descubierto ${got} de ${L.notes.length} partes de la historia`, L.end, true), 1800);
  }

  Object.assign(D, { updateLore: update, loreEnd: end });
})();
