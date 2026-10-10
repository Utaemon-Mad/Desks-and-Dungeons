// Detalles de acabado: fundido entre escenas, celebración al subir de nivel
// y cartel grande cuando cae un objeto único o de conjunto.
(function () {
  'use strict';
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

  // ---------- Fundido a negro al cambiar de escena ----------
  const fade = el('div', 'scene-fade');
  document.body.appendChild(fade);
  function flash(ms = 650) {
    fade.style.transition = 'none'; fade.style.opacity = '1';
    void fade.offsetWidth; // aplica el negro antes de la transición
    fade.style.transition = `opacity ${ms}ms ease-out`; fade.style.opacity = '0';
  }
  // al pulsar para entrar o salir, oscurece un poco mientras responde el servidor
  function dim() { fade.style.transition = 'opacity 180ms ease-in'; fade.style.opacity = '0.85'; setTimeout(() => { if (fade.style.opacity === '0.85') fade.style.opacity = '0'; }, 2500); }
  DD.on('dstart', () => flash());
  DD.on('dexit', (m) => { if (!m || !m.silent) flash(); });
  DD.on('to-title', () => flash(500));
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('#dgo, #dlist .btn, #dexit, #drejoin, [data-act=world]');
    if (b) dim();
  }, true);

  // ---------- Iconos propios en la barra inferior (en vez de emojis) ----------
  if (window.ICONS) {
    for (const b of document.querySelectorAll('#bar .tool[data-act]')) {
      const ico = b.querySelector('.ico');
      if (!ico || !ICONS.names.includes(b.dataset.act)) continue;
      ico.textContent = '';
      ico.appendChild(ICONS.svg(b.dataset.act, 30, '#f0c060'));
    }
  }

  // ---------- Subir de nivel ----------
  const lvl = el('div', 'lvlup hidden');
  lvl.innerHTML = '<div class="lvl-rays"></div><div class="lvl-card"><small>¡SUBES DE NIVEL!</small><b></b><span></span></div>';
  document.body.appendChild(lvl);
  let lvlT = null;
  DD.on('levelup', (m) => {
    lvl.querySelector('b').textContent = `Nivel ${m.level}`;
    lvl.querySelector('span').textContent = m.points ? `Tienes ${m.points} punto${m.points === 1 ? '' : 's'} para repartir en tu ficha (🧙).` : '¡Más fuerte que nunca!';
    lvl.classList.remove('hidden');
    lvl.classList.remove('play'); void lvl.offsetWidth; lvl.classList.add('play');
    clearTimeout(lvlT); lvlT = setTimeout(() => lvl.classList.add('hidden'), 3600);
  });
  lvl.addEventListener('click', () => lvl.classList.add('hidden'));

  // ---------- Objeto único o de conjunto ----------
  const loot = el('div', 'bigloot hidden');
  loot.innerHTML = '<small></small><b></b><span></span>';
  document.body.appendChild(loot);
  let lootT = null;
  DD.on('bigloot', (it) => {
    loot.style.setProperty('--rc', RULES.itemColor(it));
    loot.querySelector('small').textContent = it.leg ? `★ ¡LEGENDARIO! · ${RULES.LEGENDARY[it.leg].icon} ${RULES.LEGENDARY[it.leg].name}` : it.rarity === 'conjunto' ? '¡OBJETO DE CONJUNTO!' : '¡OBJETO ÚNICO!';
    loot.querySelector('b').textContent = it.name;
    let line = '';
    try { line = RULES.typeLine ? RULES.typeLine(it) : ''; } catch { line = ''; }
    loot.querySelector('span').textContent = line;
    loot.classList.remove('hidden');
    loot.classList.remove('play'); void loot.offsetWidth; loot.classList.add('play');
    clearTimeout(lootT); lootT = setTimeout(() => loot.classList.add('hidden'), 4200);
  });
})();
