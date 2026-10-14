/* global DD, MAP, MODELS, THREE */
// La taberna viva: Lirio el Bardo toca junto a la chimenea (con notas flotando), unos cuantos parroquianos ocupan
// asientos libres, brindan, cuentan rumores de las mazmorras y a veces discuten; con Brom el Herrero se puede echar un
// pulso (minijuego; el servidor lo anuncia a toda la taberna). La chimenea crepita de vez en cuando.
// Todo es ambiente del navegador: no ocupa casillas ni cambia nada de la partida.
(() => {
  'use strict';
  const C = DD.core;
  const look = (o) => ({ ...MAP.cleanLook(o), gear: o.gear || {}, color: o.color });
  const PATRONS = [
    { id: 'brom', name: 'Brom el Herrero', pulso: true, look: look({ cls: 'guerrero', sex: 'm', hs: 'calvo', skin: 2, hair: 1, feat: { build: 2, beard: 4 }, gear: { pecho: 'cuero', pechoT: 0, pechoS: 0 }, color: '#5a3a22' }),
      lines: ['¿Alguien se atreve con un pulso? ¡Brom nunca pierde!', 'Forjé la espada del Maestro Takeshi… bueno, la empuñadura.', '¡Alfonso, otra jarra, que esta se ha evaporado!'] },
    { id: 'tobias', name: 'Tobías el Minero', look: look({ cls: 'picaro', sex: 'm', hs: 'corto', skin: 1, hair: 4, feat: { beard: 2 }, gear: { pecho: 'tela', pechoT: 0, pechoS: 1 }, color: '#6a5a3a' }),
      lines: ['Los goblins se llevaron mis picos… y mi linterna… y mi sombrero.', 'Dicen que Grubnak se ha hecho una corona de cucharas. ¡De cucharas!', 'En las cuevas hay más oro que piedra, si sabes dónde mirar.'] },
    { id: 'greta', name: 'Greta la Cazadora', look: look({ cls: 'explorador', sex: 'f', hs: 'coleta', skin: 3, hair: 2, gear: { pecho: 'cuero', pechoT: 1, pechoS: 2 }, color: '#2a4a2a' }),
      lines: ['El bosque susurra de noche. Yo ya no paso por la Arboleda.', 'Vi una araña del tamaño de un carro. No exagero. Bueno, un carro pequeño.', 'Las luciérnagas huyen del musgo negro. Seguidlas.'] },
    { id: 'meli', name: 'Meli la Pescadera', look: look({ cls: 'druida', sex: 'f', hs: 'melena', skin: 4, hair: 6, gear: { pecho: 'tela', pechoT: 0, pechoS: 2 }, color: '#2a4a6a' }),
      lines: ['¡Por los héroes de Brumaverde! ¡Salud!', 'En las catacumbas aún se oye rezar al hermano Aldric, dicen.', 'Mi primo bajó a la Fortaleza y volvió sin bigote. Pero volvió.'] },
  ];
  // discusiones entre dos parroquianos (se van turnando)
  const ARGUES = [
    [['brom', '¡Un orco no aguanta un pulso conmigo!'], ['greta', 'Un orco te arranca el brazo y se lo come, Brom.'], ['brom', '¡Pues que lo intente!'], ['greta', 'Eso dijo el último. Ahora es de la Mano Roja.']],
    [['tobias', 'El liche no existe. Es un cuento para niños.'], ['meli', 'Pues baja a la cripta y pregúntale.'], ['tobias', '…¿Otra ronda?'], ['meli', 'Eso pensaba.']],
    [['greta', 'Los dragones prefieren el oro a la carne.'], ['tobias', 'Ignaroth prefiere las dos cosas. Juntas.'], ['greta', '¿Y tú qué sabrás?'], ['tobias', 'Trabajé en su caldera. Una semana. Corriendo.']],
  ];
  const BARD = { id: 'bardo', name: 'Lirio el Bardo', look: look({ cls: 'picaro', sex: 'm', hs: 'melena', skin: 0, hair: 3, feat: { rings: 1 }, gear: { pecho: 'tela', pechoT: 1, pechoS: 1 }, color: '#7a2a5a' }),
    lines: ['♪ Malakar duerme en su torre de hueso, y el que lo despierta no vuelve de eso… ♪', '♪ Grubnak, Grubnak, rey de cucharas, guarda tu oro bajo las faldas… ♪', '♪ Brindad, brindad, que mañana bajamos, y quién sabe cuántos volvemos… ♪', '♪ En la Arboleda de las Luciérnagas, Raízmadre llora sus ramas amargas… ♪'] };

  // ---------- dónde está cada uno ----------
  let bardSpots = [], seatsKey = '', seatsFor = [];
  function spots() {
    const k = JSON.stringify(MAP.items);
    if (k === seatsKey) return;
    seatsKey = k;
    // el bardo, delante de la chimenea (o en la primera casilla libre cerca)
    const fp = MAP.items.find((i) => i.type === 'fireplace') || { x: 9, y: 0 };
    const sp = MAP.spawn || { x: 8, y: 1 };
    bardSpots = [];
    for (const [dx, dy] of [[1, 1], [-1, 1], [2, 1], [1, 2], [0, 1], [-1, 2], [-2, 1], [2, 2]]) {
      const x = fp.x + dx, y = fp.y + dy;
      if (MAP.isStandable(x, y) && !MAP.isSeat(x, y) && !MAP.merchantAt(x, y) && !(x === sp.x && y === sp.y)) bardSpots.push({ x, y });
    }
    // los parroquianos, en taburetes y sofás (las sillas son de la mesa de partida)
    const seats = [...MAP.seats.values()].filter((s) => s.type !== 'chair').sort((a, b) => a.y * 100 + a.x - (b.y * 100 + b.x));
    seatsFor = PATRONS.map((p, i) => seats[(i * 3 + 1) % Math.max(1, seats.length)] || null);
  }
  const taken = (x, y) => [...C.users.values()].some((u) => !u.where && ((u.tx === x && u.ty === y) || (u.px | 0) === x && (u.py | 0) === y));

  // ---------- el laúd del bardo ----------
  function lute() {
    const g = new THREE.Group(), wood = new THREE.MeshStandardMaterial({ color: '#8a5a2a', roughness: 0.55 }), dark = new THREE.MeshStandardMaterial({ color: '#3a2412', roughness: 0.6 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), wood); body.scale.set(1, 1.25, 0.45); g.add(body);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.03, 12), dark); hole.position.set(0, 0.02, 0.056); g.add(hole);
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.26, 0.025), dark); neck.position.set(0, 0.26, 0.01); g.add(neck);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.03), wood); head.position.set(0, 0.41, -0.01); head.rotation.x = -0.5; g.add(head);
    g.rotation.set(0.15, 0, 1.0); g.position.set(0.02, 0.7, 0.16);
    return g;
  }

  // ---------- cada fotograma: colocar y animar ----------
  const talk = []; // bocadillos: { id, text, until }
  const notes = []; // notas musicales flotando
  let nextTalk = performance.now() + 4000, nextNote = 0, nextCrackle = performance.now() + 5000, argue = null;
  const screen = {}; // dónde cae la cabeza de cada uno en la pantalla
  function place(id, lk, x, y, rot, sit, now, extra) {
    const m = C.charModel('life:' + id, lk);
    m.obj.visible = true;
    m.obj.position.set(x + 0.5, sit ? (C.SEAT_Y[sit] || 0.42) - 0.2 : 0, y + 0.5);
    m.obj.rotation.y = rot;
    if (extra) extra(m);
    return m;
  }
  function hide(id) { const m = C.T3.models.get('life:' + id); if (m) m.obj.visible = false; delete screen[id]; }

  function update(now) {
    if (!C.T3 || !C.T3.stage) return;
    spots();
    const st = C.T3.stage;
    // el bardo
    const bardSpot = bardSpots.find((b) => !taken(b.x, b.y)); // si alguien se le pone encima, se aparta
    if (bardSpot) {
      const m = place(BARD.id, BARD.look, bardSpot.x, bardSpot.y, 0, null, now, (mm) => { if (!mm.lute) { mm.lute = lute(); mm.obj.add(mm.lute); } });
      MODELS.animate(m.obj, { t: now });
      if (m.lute) m.lute.rotation.z = 1.0 + Math.sin(now / 160) * 0.05; // rasguea
      const p = st.project(bardSpot.x + 0.5, 1.45, bardSpot.y + 0.5); screen.bardo = p;
      if (now > nextNote) { nextNote = now + 600 + Math.random() * 500; notes.push({ x: p.x + (Math.random() - 0.5) * 20, y: p.y - 6, start: now, ch: Math.random() < 0.5 ? '♪' : '♫', drift: (Math.random() - 0.5) * 30 }); }
    } else hide(BARD.id);
    // los parroquianos
    PATRONS.forEach((P, i) => {
      const s = seatsFor[i];
      if (!s || taken(s.x, s.y)) { hide(P.id); return; }
      const m = place(P.id, P.look, s.x, s.y, C.FACE[s.dir] || 0, s.type, now, (mm) => {
        if (!mm.mug && mm.obj.userData.parts && mm.obj.userData.parts.handR) { mm.mug = MODELS.glProp ? MODELS.glProp('mug_full') : null; if (mm.mug) { mm.mug.position.set(0, 0.03, 0); mm.obj.userData.parts.handR.add(mm.mug); } }
      });
      const beat = Math.floor((now + i * 2300) / 7000), cheer = beat % 3 === 0;
      MODELS.animate(m.obj, { t: now + i * 900, sit: true, emote: cheer ? 'cheers' : null, emoteAt: cheer ? beat : 0, mug: true });
      screen[P.id] = st.project(s.x + 0.5, 1.15, s.y + 0.5);
    });
    // charla: rumores, coplas y alguna discusión
    for (let i = talk.length - 1; i >= 0; i--) if (talk[i].until < now) talk.splice(i, 1);
    if (argue && now >= argue.next) {
      const [who, text] = argue.lines[argue.i++];
      if (screen[who]) talk.push({ id: who, text, until: now + 3200 });
      argue.next = now + 2600;
      if (argue.i >= argue.lines.length) argue = null;
    }
    if (!argue && now > nextTalk) {
      nextTalk = now + 6000 + Math.random() * 6000;
      const r = Math.random(), present = PATRONS.filter((p) => screen[p.id]);
      if (r < 0.2) {
        const A = ARGUES[Math.floor(Math.random() * ARGUES.length)];
        if (A.every(([w]) => screen[w])) { argue = { lines: A, i: 0, next: now }; nextTalk = now + 16000; }
      } else if (r < 0.45 && screen.bardo) talk.push({ id: 'bardo', text: BARD.lines[Math.floor(Math.random() * BARD.lines.length)], until: now + 5000 });
      else if (present.length) { const P = present[Math.floor(Math.random() * present.length)]; talk.push({ id: P.id, text: P.lines[Math.floor(Math.random() * P.lines.length)], until: now + 4200 }); }
    }
    // la chimenea crepita
    if (now > nextCrackle) { nextCrackle = now + 7000 + Math.random() * 9000; if (C.tavernFx.crackle) C.tavernFx.crackle(); }
  }

  // ---------- encima de la escena: nombres, bocadillos y notas ----------
  function draw(now) {
    const g = C.ctx;
    g.font = '600 11px "Pixelify Sans", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const tag = (p, text, bg, line) => { if (!p) return; const w = g.measureText(text).width + 12; C.rrect(p.x - w / 2, p.y - 9, w, 17, 4, bg, line, 1); g.fillStyle = '#ffeed0'; g.fillText(text, p.x, p.y); };
    tag(screen.bardo, '🎻 Lirio el Bardo', 'rgba(70,20,50,.85)', '#c87aa8');
    tag(screen.brom, '💪 Brom · ¡echa un pulso!', 'rgba(70,40,20,.88)', '#e0a050');
    // notas musicales que suben y se desvanecen
    g.font = '700 18px serif';
    for (let i = notes.length - 1; i >= 0; i--) {
      const n = notes[i], u = (now - n.start) / 2200;
      if (u >= 1) { notes.splice(i, 1); continue; }
      g.globalAlpha = 1 - u; g.fillStyle = '#ffe6a0'; g.fillText(n.ch, n.x + n.drift * u, n.y - u * 60);
    }
    g.globalAlpha = 1;
    // bocadillos
    g.font = '15px "VT323", monospace';
    for (const t of talk) {
      const p = screen[t.id];
      if (!p) continue;
      const lines = C.wrapText(t.text, 230), lh = 15, w = Math.min(250, Math.max(...lines.map((l) => g.measureText(l).width)) + 16), h = lines.length * lh + 8;
      const by = p.y - 20 - h;
      g.globalAlpha = Math.min(1, (t.until - now) / 300);
      C.rrect(p.x - w / 2, by, w, h, 6, t.id === 'bardo' ? '#f4e0f0' : '#f4e6c0', C.OUT, 1.5);
      g.fillStyle = '#2a1a10'; g.textBaseline = 'top';
      lines.forEach((l, k) => g.fillText(l, p.x, by + 4 + k * lh));
      g.textBaseline = 'middle'; g.globalAlpha = 1;
    }
  }

  // ---------- el pulso con Brom ----------
  const win = document.createElement('div'); win.id = 'pulsowin'; win.className = 'overlay hidden';
  win.innerHTML = '<div class="panel card"><div class="panel-title">💪 PULSO CON BROM</div>' +
    '<p class="tag">Pulsa <b>Espacio</b> (o el botón) cuando la aguja esté en la zona verde. Fallar te cuesta fuerza; Brom no se cansa.</p>' +
    '<div class="pulso-arms"><span>🤛</span><div class="pulso-track"><i class="pulso-fill"></i><b class="pulso-mid"></b></div><span>🤜</span></div>' +
    '<div class="pulso-timing"><i class="pulso-zone"></i><b class="pulso-needle"></b></div>' +
    '<p class="pulso-msg"></p><div class="edit-row"><button class="btn big pulso-push" type="button">¡EMPUJA!</button><button class="btn alt pulso-close" type="button">Dejarlo</button></div></div>';
  document.body.appendChild(win);
  const $p = (s) => win.querySelector(s);
  let P = null;
  function openPulso() {
    if (P) return;
    win.classList.remove('hidden');
    P = { force: 0, t0: performance.now(), zone: 0.35 + Math.random() * 0.3, width: 0.18, speed: 1.1, last: performance.now(), done: false };
    $p('.pulso-msg').textContent = '«¡A ver esos brazos!»';
    $p('.pulso-zone').style.left = P.zone * 100 + '%'; $p('.pulso-zone').style.width = P.width * 100 + '%';
    requestAnimationFrame(loop);
  }
  function needle(now) { const u = ((now - P.t0) / 1000 * P.speed) % 2; return u < 1 ? u : 2 - u; }
  function loop(now) {
    if (!P) return;
    const dt = Math.min(0.1, (now - P.last) / 1000); P.last = now;
    if (!P.done) {
      P.force -= dt * (14 + (now - P.t0) / 1000 * 1.6); // Brom aprieta cada vez más
      P.speed = 1.1 + (now - P.t0) / 9000;
      if (P.force <= -100 || P.force >= 100) finish(P.force > 0);
    }
    $p('.pulso-fill').style.width = (50 + P.force / 2) + '%';
    $p('.pulso-needle').style.left = needle(now) * 100 + '%';
    requestAnimationFrame(loop);
  }
  function push() {
    if (!P || P.done) return;
    const n = needle(performance.now());
    if (n >= P.zone && n <= P.zone + P.width) { P.force += 22; $p('.pulso-msg').textContent = ['¡Bien!', '¡Aprieta!', '¡Eso es!', 'Brom suda…'][Math.floor(Math.random() * 4)]; DD.sfx && DD.sfx('hit', { vol: 0.5 }); P.zone = 0.1 + Math.random() * 0.62; $p('.pulso-zone').style.left = P.zone * 100 + '%'; }
    else { P.force -= 9; $p('.pulso-msg').textContent = '¡Fuera de tiempo! Brom gana terreno.'; DD.sfx && DD.sfx('miss'); }
  }
  function finish(win2) {
    P.done = true;
    $p('.pulso-msg').textContent = win2 ? '¡Ganas! Brom se frota el brazo: «¡Revancha cuando quieras!»' : 'Brom te tumba el brazo: «¡Otra vez será, chaval!»';
    DD.sfx && DD.sfx(win2 ? 'levelup' : 'hurt', { vol: 0.6 });
    if (C.net) C.net.send({ t: 'tavern:pulso', win: win2 });
    setTimeout(closePulso, 2600);
  }
  function closePulso() { P = null; win.classList.add('hidden'); }
  $p('.pulso-push').onclick = push;
  $p('.pulso-close').onclick = closePulso;
  window.addEventListener('keydown', (e) => { if (P && (e.key === ' ' || e.code === 'Space')) { e.preventDefault(); e.stopImmediatePropagation(); push(); } if (P && e.key === 'Escape') closePulso(); }, true);
  // pinchar a Brom (o su nombre) abre el pulso
  C.canvas.addEventListener('pointerdown', (e) => {
    const p = screen.brom;
    if (!p || DD.scene !== 'tavern' || C.editing) return;
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y - 20) < 34) { e.preventDefault(); e.stopImmediatePropagation(); openPulso(); }
  }, true);

  C.life = { update, draw, openPulso };
})();
