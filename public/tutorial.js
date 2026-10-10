// Tutorial de los primeros minutos: Alfonso enseña a andar, hablar, mirar el equipo
// y bajar a la primera mazmorra. Sale con personajes nuevos y se puede saltar.
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

  const box = el('div', 'tut hidden');
  box.innerHTML = '<div class="tut-face">🍺</div><div class="tut-body"><b class="tut-who">Alfonso el Tabernero</b><p class="tut-text"></p><div class="tut-row"><small class="tut-step"></small><span><button type="button" class="btn alt tut-skip">Saltar tutorial</button><button type="button" class="btn tut-next hidden">Siguiente</button></span></div></div>';
  document.body.appendChild(box);
  const textEl = box.querySelector('.tut-text'), stepEl = box.querySelector('.tut-step'), nextBtn = box.querySelector('.tut-next');

  const meUser = () => DD.users && DD.users.get(DD.myId);
  let start = null, said = false, opened = false, glowEl = null;

  const STEPS = [
    { text: (n) => `¡Bienvenido a mi taberna, ${n}! Soy Alfonso. Para andar, haz clic en el suelo o usa W A S D.`,
      done: () => { const u = meUser(); return u && start && (u.tx !== start.x || u.ty !== start.y); } },
    { text: () => 'Bien. Para hablar con los demás pulsa Intro, escribe algo y vuelve a pulsar Intro. ¡Saluda!', glow: '#chat-input', done: () => said },
    { text: () => 'Ahora abre tu equipo con 🎒 Equipo (o la tecla I). Arrastra un objeto de la mochila a su hueco para ponértelo: tu héroe cambiará de aspecto.', glow: '[data-act="bag"]', done: () => opened },
    { text: () => 'Los comerciantes de la sala venden pociones, armas y pergaminos: haz clic sobre ellos. Y toma, invita la casa: unas pociones para el camino (Q para beber vida, E para energía).', reward: true, manual: 'Gracias' },
    { text: () => 'Cuando estés listo, pulsa 🗝️ Mazmorras, elige nivel 1 y entra. Si tus amigos están en la taberna, pueden unirse a tu partida desde la misma ventana.', glow: '[data-act="dungeons"]', done: () => DD.scene === 'dungeon' },
    { text: () => 'Clic en un enemigo para atacarle sin parar. Las teclas 1-8 lanzan tus habilidades y Espacio hace una voltereta. Alt+clic marca un sitio para tu grupo. ¡Suerte, aventurero!', manual: '¡A por ellos!' },
  ];
  let step = -1;

  function glow(sel) {
    if (glowEl) glowEl.classList.remove('tut-glow');
    glowEl = sel ? $(sel) : null;
    if (glowEl) glowEl.classList.add('tut-glow');
  }
  function show(i) {
    step = i;
    const S = STEPS[i];
    if (!S) return finish(false);
    textEl.textContent = S.text((DD.me && meUser() && meUser().name) || 'aventurero');
    stepEl.textContent = `Paso ${i + 1} de ${STEPS.length}`;
    nextBtn.classList.toggle('hidden', !S.manual);
    nextBtn.textContent = S.manual || 'Siguiente';
    glow(S.glow);
    box.classList.remove('hidden');
    box.classList.remove('tut-in'); void box.offsetWidth; box.classList.add('tut-in');
    if (S.reward) DD.net.send({ t: 'tut:done' });
    DD.sfx && DD.sfx('chat');
  }
  function finish(skip) {
    glow(null);
    box.classList.add('hidden');
    if (skip) DD.net.send({ t: 'tut:done', skip: true });
    step = -1;
    try { localStorage.setItem('dd-tut-off', '1'); } catch { /* nada */ }
  }
  box.querySelector('.tut-skip').onclick = () => finish(true);
  nextBtn.onclick = () => show(step + 1);

  // vigila si se ha hecho lo que pide el paso
  setInterval(() => {
    if (step < 0) return;
    const S = STEPS[step];
    if (S && S.done && S.done()) { DD.sfx && DD.sfx('quest'); show(step + 1); }
  }, 400);
  DD.on('log', (m) => { if (m && m.t === 'chat' && m.id === DD.myId) said = true; });
  DD.on('open-char', () => { opened = true; });

  // empieza con personajes nuevos (nivel 1-2) que no lo han hecho todavía
  DD.on('me', (m) => {
    if (!m || step >= 0 || m.tutDone || DD.scene !== 'tavern') return;
    if (RULES.levelFromXp(m.xp || 0) > 2) return;
    setTimeout(() => {
      if (step >= 0 || !DD.me || DD.me.tutDone || DD.scene !== 'tavern') return;
      const u = meUser();
      start = u ? { x: u.tx, y: u.ty } : null;
      said = false; opened = false;
      show(0);
    }, 1500);
  });
  DD.on('to-title', () => { glow(null); box.classList.add('hidden'); step = -1; });
  // para quien quiera repetirlo: /tutorial en el chat
  DD.restartTutorial = () => { const u = meUser(); start = u ? { x: u.tx, y: u.ty } : null; said = false; opened = false; show(0); };
})();
