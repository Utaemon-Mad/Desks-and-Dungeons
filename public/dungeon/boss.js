/* global DD, RULES */
// Entrada de los jefes y su furia: la primera vez que se ve al jefe, la cámara va hasta él, salen franjas de cine y un
// cartel con su nombre, su título y lo que dice (RULES.BOSS_LINES); suena su rugido. A media vida el servidor manda
// 'phase': el jefe se enfurece (frase de furia, temblor, destello rojo y ascuas a su alrededor mientras viva).
(() => {
  'use strict';
  const D = DD.dg;
  const { $, game, viewEl } = D;
  const INTRO = 3800;

  // franjas de cine y cartel
  const bars = document.createElement('div'); bars.id = 'cine'; bars.className = 'hidden';
  bars.innerHTML = '<i class="cine-top"></i><i class="cine-bot"></i>';
  const card = document.createElement('div'); card.id = 'bosscard'; card.className = 'hidden';
  card.innerHTML = '<small class="bc-pre"></small><b class="bc-name"></b><span class="bc-title"></span><p class="bc-line"></p>';
  viewEl.appendChild(bars); viewEl.appendChild(card);

  const split = (name) => { const i = name.indexOf(', '); return i > 0 ? [name.slice(0, i), name.slice(i + 2)] : [name, '']; };
  function showCard(pre, name, title, line, cls, ms) {
    card.className = cls || '';
    card.querySelector('.bc-pre').textContent = pre;
    card.querySelector('.bc-name').textContent = name;
    card.querySelector('.bc-title').textContent = title;
    card.querySelector('.bc-line').textContent = line || '';
    clearTimeout(showCard.t); showCard.t = setTimeout(() => card.classList.add('hidden'), ms);
  }

  // ---------- cada fotograma ----------
  function update(now) {
    if (!game.map || game.map.kind === 'arena') return;
    game.introDone = game.introDone || new Set();
    const b = game.boss;
    if (b && b.kind === 'enemy' && !game.introDone.has(b.id) && !game.bossIntro) {
      game.introDone.add(b.id);
      const M = RULES.MONSTERS[b.k] || {}, [name, title] = split(M.name || b.k), L = (RULES.BOSS_LINES || {})[b.k] || {};
      game.bossIntro = { id: b.id, start: now };
      bars.classList.remove('hidden'); requestAnimationFrame(() => bars.classList.add('on'));
      showCard(M.world ? '— Jefe de mundo —' : '— Jefe —', name, title, L.intro, 'intro', INTRO - 300);
      DD.sfx('worldboss');
      if (!DD.gfx || DD.gfx.shake) game.shake = now + 350;
    }
    if (game.bossIntro && now - game.bossIntro.start > INTRO) { game.bossIntro = null; bars.classList.remove('on'); setTimeout(() => bars.classList.add('hidden'), 500); }
    // ascuas rojas alrededor de los jefes enfurecidos
    if (game.raging) for (const id of game.raging) {
      const e = game.ents.get(id);
      if (!e) { game.raging.delete(id); continue; }
      if (Math.random() < 0.6) D.spark((e.rx ?? e.x) + 0.5 + (Math.random() - 0.5) * 0.9, (e.ry ?? e.y) + 0.4 + (Math.random() - 0.5) * 0.6, Math.random() < 0.5 ? '#ff3a1a' : '#ffae3a', true);
    }
  }

  // la cámara durante la entrada: va al jefe, se acerca un poco y vuelve
  function bossCam(now) {
    const I = game.bossIntro;
    if (!I) return null;
    const e = game.ents.get(I.id);
    if (!e) return null;
    const u = (now - I.start) / INTRO;
    if (u > 0.85) return null; // el último trozo vuelve al héroe
    return { x: (e.rx ?? e.x) + 0.5, z: (e.ry ?? e.y) + 0.5, zoom: 1 - 0.22 * Math.sin(Math.min(1, u / 0.85) * Math.PI) };
  }

  // ---------- la furia (segunda fase) ----------
  function phase(ev, now) {
    game.raging = game.raging || new Set();
    game.raging.add(ev.id);
    const M = RULES.MONSTERS[ev.k] || {}, [name] = split(M.name || ev.k), L = (RULES.BOSS_LINES || {})[ev.k] || {};
    showCard('— ¡Furia! —', `${name} se enfurece`, 'Golpea más fuerte y más rápido', L.rage, 'rage', 3200);
    const f = document.createElement('div'); f.className = 'rage-flash'; document.body.appendChild(f); setTimeout(() => f.remove(), 900);
    if (!DD.gfx || DD.gfx.shake) game.shake = performance.now() + 700;
    for (let i = 0; i < 40; i++) D.spark(ev.x + 0.5, ev.y + 0.4, i % 2 ? '#ff3a1a' : '#ffd23f', true);
    D.ring(ev.x, ev.y, '#ff3a1a');
    DD.sfx('boom');
  }

  Object.assign(D, { updateBoss: update, bossCam, bossPhase: phase });
})();
