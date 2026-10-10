// Novedades de cada versión, mensaje del día de la taberna y envío de errores del navegador al servidor.
(function () {
  'use strict';
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const load = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const save = (k, v) => { try { localStorage.setItem(k, v); } catch { /* nada */ } };

  // ---------- Novedades (la primera es la más reciente) ----------
  const NEWS = [
    { v: 6, date: 'Octubre', title: 'Más profesional', items: [
      '🔊 Sonido y música en cada sitio: taberna, mazmorras, jefes y mundo abierto.',
      '👥 Ves la vida de tus compañeros; Alt+clic o P marca un sitio para el grupo; si caes, puedes volver con tu grupo.',
      '✨ Celebración al subir de nivel, cartel de objeto único, fundidos y cursores propios.',
      '⚙️ Ajustes: volumen, tamaño de la interfaz, modo daltónico y teclas configurables.',
      '🍺 Alfonso enseña a jugar a los personajes nuevos (/tutorial para repetirlo).',
      '🔑 Usuario y contraseña: guarda tu cuenta y juega desde cualquier ordenador o móvil.',
      '📱 Se puede instalar como aplicación desde el navegador.',
      '😈 Mazmorra nueva: el Abismo infernal, con diablillos, canes infernales, gárgolas, demonios y Azaroth.',
      '🧟 Zombis de verdad en las criptas (¡cuidado con los hinchados, que revientan!).',
      '💎 Botín más justo: los enemigos normales sueltan poco y básico; lo bueno, élites y jefes.',
      '🧱 Muros de las mazmorras estables: ya no suben y bajan al moverte.',
    ] },
    { v: 5, date: 'Octubre', title: 'Armería de Diablo', items: [
      '⚔️ 192 armaduras y 156 armas distintas que cambian el aspecto de tu héroe.',
      '🎒 Inventario nuevo: arrastra los objetos a su hueco.',
      '🚪 Antorchas en las mazmorras y puertas que tapan lo que hay detrás.',
      '👺 Goblins con cabeza propia y montones de rasgos.',
    ] },
  ];
  const win = el('div', 'overlay win hidden');
  win.id = 'newswin';
  win.innerHTML = '<div class="panel card"><button class="mini close-x" type="button" title="Cerrar">✕</button><div class="panel-title">📰 NOVEDADES</div><div class="news-body"></div><div class="edit-row"><button class="btn big" type="button">¡A JUGAR!</button></div></div>';
  document.body.appendChild(win);
  const close = () => win.classList.add('hidden');
  win.querySelector('.close-x').onclick = close;
  win.querySelector('.btn.big').onclick = close;
  win.addEventListener('click', (e) => { if (e.target === win) close(); });
  function openNews() {
    const body = win.querySelector('.news-body'); body.innerHTML = '';
    for (const n of NEWS) {
      const sec = el('div', 'news-sec');
      sec.append(el('h3', '', `${n.title}`), el('small', '', `Versión ${n.v} · ${n.date}`));
      const ul = el('ul');
      for (const it of n.items) ul.appendChild(el('li', '', it));
      sec.appendChild(ul); body.appendChild(sec);
    }
    win.classList.remove('hidden');
    save('dd-news', String(NEWS[0].v));
  }
  DD.on('open-news', openNews);
  // al entrar por primera vez después de una actualización
  DD.on('welcome-done', () => {
    const seen = Number(load('dd-news') || 0);
    if (seen && seen < NEWS[0].v) setTimeout(openNews, 1200);
    else if (!seen) save('dd-news', String(NEWS[0].v)); // a los nuevos no se les enseña la lista
  });

  // ---------- Mensaje del día ----------
  const motdEl = el('div', 'motd hidden');
  document.body.appendChild(motdEl);
  function showMotd(text) {
    motdEl.textContent = text ? '📌 ' + text : '';
    motdEl.classList.toggle('hidden', !text);
    motdEl.title = 'Mensaje del día (el dueño lo cambia con /aviso)';
  }
  DD.on('motd', (m) => showMotd(m.text));
  DD.on('welcome-done', (m) => showMotd(m && m.motd));
  motdEl.onclick = () => motdEl.classList.add('hidden');

  // ---------- Instalar como aplicación ----------
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
  let installEvt = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; });
  window.addEventListener('appinstalled', () => { DD.toast('📱 ¡Instalado! Ya puedes abrir Desks & Dungeons desde tu escritorio o pantalla de inicio.'); installEvt = null; });
  DD.on('install', async () => {
    if (matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches) return DD.toast('Ya estás jugando con la aplicación instalada.');
    if (installEvt) { installEvt.prompt(); try { await installEvt.userChoice; } catch { /* nada */ } installEvt = null; return; }
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    DD.toast(ios ? '📱 En iPhone/iPad: pulsa el botón Compartir de Safari y elige «Añadir a pantalla de inicio».' : '📱 Abre el menú del navegador (⋮) y elige «Instalar aplicación» o «Añadir a pantalla de inicio».');
  });

  // ---------- Errores del navegador → servidor ----------
  setInterval(() => {
    const q = window.__errs;
    if (!q || !q.length || !DD.net || !DD.net.ws || DD.net.ws.readyState !== 1) return;
    while (q.length) DD.net.send({ t: 'clienterr', ...q.shift(), ua: navigator.userAgent.slice(0, 120) });
  }, 3000);
})();
