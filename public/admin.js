// Novedades de cada versión, mensaje del día de la taberna y envío de errores del navegador al servidor.
(function () {
  'use strict';
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const load = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const save = (k, v) => { try { localStorage.setItem(k, v); } catch { /* nada */ } };

  // ---------- Novedades (la primera es la más reciente) ----------
  const NEWS = [
    { v: 18, date: 'Octubre', title: 'Mazo Morra', items: [
      '🃏 Nuevo minijuego en el menú principal: Mazo Morra, una mazmorra entera en un solo mazo de cartas (inspirado en One Deck Dungeon).',
      '🎲 Tiras dados de Fuerza, Agilidad y Magia y los colocas en las casillas de cada monstruo; el mazo es el reloj. Tres plantas y un jefe.',
      '🧙 Cuatro héroes y tres mazmorras en pixel art: la Cripta del Rey Liche, la Guarida de la Dragona y el Laberinto del Minotauro.',
    ] },
    { v: 17, date: 'Octubre', title: 'Gatos en la taberna', items: [
      '🐈 Nube (blanca) y Tizón (negro) corretean por la taberna: se paran a descansar, Tizón persigue a Nube, maúllan de vez en cuando y, si los pinchas, ronronean.',
      '🍺 La barra de Alfonso es más baja: ya no tapa al tabernero ni a los de los taburetes.',
      '🎻 Arreglado: el bardo y los parroquianos salían con los brazos en cruz.',
    ] },
    { v: 16, date: 'Octubre', title: 'Ocho mazmorras nuevas, misiones y un HUD de leyenda', items: [
      '❤️ HUD nuevo al estilo Diablo: orbes de vida (rojo) y energía (azul) abajo, con el líquido que se mueve y late cuando te queda poca vida, y la barra de experiencia en el panel de piedra.',
      '⏸️ Menú de pausa (☰ o Esc): tu héroe gira despacio sobre un círculo de runas y al lado tienes todas las opciones. Si juegas solo, la mazmorra se para de verdad; en grupo sigue corriendo.',
      '🗺️ Ocho mazmorras nuevas: Catedral profanada (vidrieras, bancos y alfombra hasta el altar), Tumba del faraón (jeroglíficos, urnas, chacales y sarcófagos de oro), Cavernas profundas, Camino del bosque, Calles de la ciudad bajo la lluvia, Campo de batalla lleno de caídos, Ciudad en llamas y el Infierno, con ríos de lava. Cada una con sus monstruos, su jefe y su historia.',
      '🗝️ Misiones dentro de las mazmorras: un portón cierra la sala del jefe. Para abrirlo, encontrad las tres llaves, accionad las tres palancas (cada una despierta una emboscada) o aguantad las oleadas en la sala del portón mientras se abre. Al abrirlo, experiencia para todos.',
    ] },
    { v: 15, date: 'Octubre', title: 'Dados, jefes, historias y una taberna viva', items: [
      '🎲 En el combate por turnos cada ataque tira un d20 de verdad: vuela por la sala, rueda y enseña la tirada, el bonificador y la CA a batir. Con un 20 natural, crítico con cámara lenta y destello; con un 1, pifia.',
      '👑 Los jefes entran a lo grande: franjas de cine, la cámara va hacia ellos y su cartel con nombre y frase. A media vida montan en cólera (segunda fase): pegan más fuerte y más rápido, y algunos llaman refuerzos.',
      '📜 Las mazmorras cuentan una historia: notas, diarios y murales repartidos por las salas, de la entrada al jefe. Al acercarte los lees, y al derrotar al jefe ves cómo acaba (y cuántas partes encontraste).',
      '🍺 La taberna está viva: Lirio el Bardo toca el laúd junto a la chimenea, los parroquianos brindan, cuentan rumores y discuten, y la chimenea crepita. Pincha a Brom el Herrero para echarle un pulso (Espacio cuando la aguja esté en la zona verde): toda la taberna se entera de quién gana.',
    ] },
    { v: 14, date: 'Octubre', title: 'Yelmos, escudos y adornos', items: [
      '⛑️ Cascos de verdad: ya no son cacerolas. Yelmos nasales con bandas remachadas, carrilleras, bacinetes apuntados que bajan hasta la mandíbula (el de pico con su hocico y respiraderos), celadas con cola y rendija, armets con visera de pico, cresta y gola, grandes yelmos de tapa plana con cruz de refuerzo, y gorros de cuero en gajos cosidos.',
      '🛡️ Seis escudos por nivel, cada uno con su forma: rodelas, broqueles, adargas, tarjas, escudos de cometa, de guerra y de cruzado, rodelas de acero grabadas, tarjas de justa, escudos de torre y de torreón (con almenas y puerta) y paveses. Cara curvada, tablas de madera, cuero o piedra, pintura heráldica y bordes y remaches de metal.',
      '✨ Armaduras más adornadas: remaches y filos dorados en las de placas, emblemas en las mejores, costuras, lazadas y hebillas en las de cuero, cuellos y faldones dorados en las de malla, bordados y gemas en las de tela; y lo mismo en hombreras, guantes y botas.',
      '🪞 El acero refleja la luz: armaduras y armas brillan como metal de verdad.',
      '🧷 Los cascos tapan toda la cabeza: melenas, coletas y flequillos se recogen dentro. El escudo va por fuera del antebrazo (ya no lo atraviesa) y los escudos largos, a lo largo del brazo.',
    ] },
    { v: 13, date: 'Octubre', title: 'Vista isométrica', items: [
      '📐 Todo el juego en vista isométrica: la taberna, las mazmorras y el mundo se ven desde una esquina, girados 45° y sin perspectiva, como en los clásicos.',
      '🎮 Las teclas y el joystick siguen la pantalla: arriba es arriba aunque en el mapa sea el noroeste. El minimapa también va girado.',
      '🧱 Los muros y árboles del lado de la cámara (al sur y al este de cada sala) son bajos, y las columnas, estatuas y casas que tapan a tu héroe se vuelven transparentes al pasar por detrás.',
      '🎥 Cámara libre en combate: arrastra la vista (o con el botón derecho) para ver por dónde te atacan, gírala de 90 en 90 con ⟲ ⟳ o con «,» y «.», y 🎯 (H) la devuelve a tu héroe. Al acabar el combate vuelve sola.',
    ] },
    { v: 12, date: 'Octubre', title: 'El Bosque umbrío', items: [
      '🌲 Mazmorra nueva: el Bosque umbrío. Claros unidos por senderos entre árboles, pinos y robles otoñales, hierba que se mueve con la luz de la luna, luciérnagas, farolillos y hogueras. Lobos, arañas, bandidos, fuegos fatuos y retoños corruptos… y al fondo, Raízmadre, el Ent Corrupto.',
      '🏰 Mazmorras con más detalle: cada losa y cada piedra con su tono, columnas en las esquinas, estanterías y ventanales enrejados en criptas y fortalezas, telarañas en los rincones y mucho más por el suelo (costillares, calaveras con vela, monedas, sacos, barricas, armas tiradas).',
      '🪖 Los cascos ya tapan bien la cabeza: el pelo se recoge debajo y los adornos (coronas, alas, cuernos) se ajustan al tamaño de la cabeza.',
      '🏴‍☠️ El parche en el ojo lleva una cinta fina que rodea la cabeza (antes parecía una tabla atravesada).',
      '🏹 Ballestas nuevas: culata con empuñadura, pala curva, cuerda, virote con plumas, estribo y herrajes; apuntan hacia delante al disparar.',
    ] },
    { v: 11, date: 'Octubre', title: 'El camino del samurái', items: [
      '⚔️ Katanas: arma a dos manos, más rápida que el mandoble y que aprovecha la Destreza. Doce modelos, de la Uchigatana a la Muramasa y la Hoja del dragón dormido. Guerreros y pícaros la prefieren.',
      '🏯 Armaduras samurái en cuero y placas: dō lacado con sus lamas atadas, sode (hombreras de placas), kusazuri (faldón), kabuto con cubrenuca y kuwagata, menpō, kote, suneate y haidate, tabi y sandalias waraji. Y para los ligeros, hachimaki y jingasa.',
      '🛡️ Las armaduras se ajustan mejor: cascos y piezas se miden sobre el cuerpo ya proporcionado, guantes y botas ya no van agrandados, las corazas llevan brazales, las cotas mangas de malla y las grebas cubren también el muslo.',
    ] },
    { v: 10, date: 'Octubre', title: 'Héroes humanos', items: [
      '🧑 Todos los héroes son humanos: se acabaron elfos, enanos, orcos y goblins. Si tenías uno, ahora es humano (conserva algo de su planta) y te devolvemos los puntos para repartirlos de nuevo.',
      '🎨 Editor con muchas más opciones: 5 peinados para cualquiera, 12 tonos de piel, 16 colores de pelo, complexión, altura, barba (perilla, bigote, corta, poblada, larga), cejas, marcas (cicatriz, pecas, pintura de guerra, tatuaje, parche) con su color y pendientes. 🎲 Al azar te propone uno.',
      '🧍 Proporciones más humanas: cabeza más pequeña, piernas y brazos más largos y cuerpo más esbelto.',
      '💡 Mazmorras menos oscuras, sobre todo en el móvil, y nuevo ajuste de brillo en ⚙️ Menú → Ajustes → Gráficos (Oscuro, Normal, Claro, Muy claro).',
      '🚪 Nadie te espera nada más entrar: los monstruos ya no aparecen junto a la casilla de salida.',
    ] },
    { v: 9, date: 'Octubre', title: 'Combate por turnos', items: [
      '🎲 El combate ahora es por turnos, como en D&D: se explora en tiempo real, pero cuando un monstruo te ve se para el tiempo y cada uno juega su turno por orden de iniciativa (d20 + Destreza).',
      '👣 En tu turno: unas 6 casillas de movimiento (iluminadas en el suelo), ⚔️ una acción (atacar, habilidad, defenderse o reanimar), ✚ una acción adicional (pociones y bufos) y ↺ una reacción para el ataque de oportunidad.',
      '⏱️ 30 segundos para decidir; F o «Terminar turno» para pasar. Arriba ves el orden de la ronda y el aro dorado marca quién juega.',
      '👑 Los jefes avisan en el suelo y el golpe cae en su siguiente turno: usa el tuyo para apartarte. Aturdido = pierdes el turno; ralentizado = la mitad de movimiento.',
      '🤺 Los duelos de la arena también son por turnos.',
      '⚖️ Daño ajustado a los turnos: cada turno son unos 6 segundos de pelea, así que un ataque pega como varios golpes del tiempo real (las armas rápidas, más). Los combates normales duran 2-5 rondas y los jefes algo más; en grupo, jefes y élites aguantan más.',
    ] },
    { v: 8, date: 'Octubre', title: 'Una taberna con alma', items: [
      '🗺️ MESA DE PARTIDA: la mesa grande es una sola. Siéntate y la cámara la mira desde arriba con todos los jugadores; se abre el plano de la próxima mazmorra (¡la de verdad!). Marcad el plano, elegid tema y nivel, jugad a los dados o comerciad, y cuando todos digáis «listo» bajáis juntos.',
      '🌙 La luz de la luna entra por las ventanas y dibuja la cruz del marco en el suelo.',
      '🔥 Chimenea de piedra con brasas que laten y ascuas que suben; cada llama brilla y deja su charco de luz.',
      '🍺 Barra nueva de madera barnizada con velas, jarras y botellas; estandartes de la casa y el letrero de Desks & Dungeons.',
      '✨ Motas de polvo flotando en el aire y sombras de verdad de las antorchas cercanas (calidad alta).',
      '🛠️ Arreglada la pantalla en blanco tras varias mazmorras y el movimiento es más suave.',
    ] },
    { v: 7, date: 'Octubre', title: 'Para engancharse', items: [
      '🟠 Objetos LEGENDARIOS con poderes: Rebote, Estallido, Sed de sangre, Frenesí, Égida, Trueno y Eco.',
      '✨ El botín bueno cae con un haz de luz de su color y suena al caer.',
      '🎁 Recompensa diaria: entra cada día y al séptimo abre el gran cofre.',
      '⚔️ Asalto semanal: el mismo mapa para todos, más difícil, con cofre y clasificación por tiempo.',
      '🌟 Árbol de talentos: tres ramas por clase y un punto cada dos niveles.',
      '🏆 Temporadas de 6 semanas: puntos por jugar y aura dorada para los mejores.',
      '🏦 Mejoras de la taberna entre todos y tablón de hazañas.',
      '🏪 Mercado entre jugadores: vende tu botín y cobra aunque no estés conectado.',
    ] },
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

  // ---------- Recompensa diaria con racha ----------
  const dwin = el('div', 'overlay win hidden');
  dwin.id = 'dailywin';
  dwin.innerHTML = '<div class="panel card"><div class="panel-title">🎁 RECOMPENSA DIARIA</div><p class="tag daily-sub"></p><div class="daily-row"></div><p class="daily-got hidden"></p><div class="edit-row"><button class="btn big daily-claim" type="button">RECOGER</button></div></div>';
  document.body.appendChild(dwin);
  let offer = null;
  function renderDaily(claimedNow) {
    const row = dwin.querySelector('.daily-row'); row.innerHTML = '';
    for (const R of offer.rewards) {
      const c = el('div', 'daily-day');
      const past = R.day < offer.streak || (claimedNow && R.day === offer.streak);
      if (past) c.classList.add('done');
      if (R.day === offer.streak && !claimedNow) c.classList.add('today');
      if (R.day === 7) c.classList.add('big');
      c.append(el('small', '', `Día ${R.day}`), el('b', '', past ? '✔' : R.icon), el('span', '', R.text));
      row.appendChild(c);
    }
    dwin.querySelector('.daily-sub').textContent = claimedNow ? `¡Racha de ${offer.streak} ${offer.streak === 1 ? 'día' : 'días'}! Vuelve mañana para el siguiente.` : `Entra cada día para mejorar el premio. Hoy toca el día ${offer.streak} de 7${offer.streak > 1 ? ' (¡no rompas la racha!)' : ''}.`;
    const b = dwin.querySelector('.daily-claim');
    b.textContent = claimedNow ? '¡A JUGAR!' : 'RECOGER';
  }
  function showDaily() {
    if (!offer) return;
    // si Alfonso está explicando el tutorial, se espera a que termine
    const tut = document.querySelector('.tut');
    if (tut && !tut.classList.contains('hidden')) return setTimeout(showDaily, 3000);
    dwin.querySelector('.daily-got').classList.add('hidden');
    renderDaily(false);
    dwin.classList.remove('hidden');
    DD.sfx && DD.sfx('open');
  }
  DD.on('login:offer', (m) => { if (m.claimed) return; offer = m; showDaily(); });
  DD.on('login:claimed', (m) => {
    if (!offer) return;
    renderDaily(true);
    const g = dwin.querySelector('.daily-got'); g.textContent = 'Recibes: ' + m.got.join(', '); g.classList.remove('hidden');
    DD.sfx && DD.sfx(m.streak === 7 ? 'levelup' : 'chest');
    offer.claimedNow = true;
  });
  dwin.querySelector('.daily-claim').onclick = () => {
    if (offer && !offer.claimedNow) DD.net.send({ t: 'login:claim' });
    else { dwin.classList.add('hidden'); offer = null; }
  };

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
