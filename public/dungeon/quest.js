// Objetivos de la mazmorra (server/quests.js): el portón de la sala del jefe (un rastrillo que sube al abrirse),
// las llaves que flotan donde están, las palancas (clic para accionarlas), el cartelito del objetivo y los avisos.
(() => {
  const D = DD.dg;
  const { game } = D;
  let mapRef = null, scene = null;
  const gates = [], keys = new Map(), levers = new Map();
  const lin = (h) => '#' + new THREE.Color(h).convertSRGBToLinear().getHexString();
  const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: lin(c), roughness: o.r ?? 0.6, metalness: o.m || 0, emissive: o.e ? lin(o.e) : '#000000', emissiveIntensity: o.ei || 0 });
  const box = (w, h, d, m, x, y, z, par) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; par.add(o); return o; };

  // ---------- Modelos ----------
  function gateModel(theme, alongX) {
    const g = new THREE.Group();
    const iron = M('#3a3a42', { r: 0.4, m: 0.85 }), stone = M(theme === 'tumba' ? '#a8885a' : theme === 'infierno' ? '#3a1a18' : '#6a6870'), spike = M('#5a5a62', { r: 0.35, m: 0.9 });
    // marco: dos postes y un dintel con calavera
    box(0.16, 1.5, 0.3, stone, -0.5, 0.75, 0, g); box(0.16, 1.5, 0.3, stone, 0.5, 0.75, 0, g); box(1.16, 0.18, 0.34, stone, 0, 1.5, 0, g);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), M('#d8ccb0')); skull.position.set(0, 1.5, 0.18); g.add(skull);
    // rastrillo: barrotes con pinchos y travesaños; sube al abrirse
    const bars = new THREE.Group(); g.add(bars);
    for (let i = 0; i < 6; i++) { const x = -0.38 + i * 0.152; box(0.04, 1.32, 0.04, iron, x, 0.7, 0, bars); const c = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.12, 5), spike); c.rotation.x = Math.PI; c.position.set(x, 0.0, 0); bars.add(c); }
    for (const y of [0.35, 0.75, 1.15]) box(0.84, 0.05, 0.05, iron, 0, y, 0, bars);
    // un candado brillante en el centro mientras está cerrado
    const lock = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.022, 6, 12), M('#e8b830', { m: 0.8, r: 0.3, e: '#ffb020', ei: 0.6 })); lock.position.set(0, 0.62, 0.06); bars.add(lock);
    if (!alongX) g.rotation.y = Math.PI / 2;
    g.userData.bars = bars; g.userData.lock = lock;
    return g;
  }
  function keyModel() {
    const g = new THREE.Group(), inner = new THREE.Group(); g.add(inner);
    const gold = M('#ffcf3a', { m: 0.9, r: 0.25, e: '#ffb020', ei: 0.55 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.03, 8, 16), gold); ring.position.y = 0.16; inner.add(ring);
    box(0.04, 0.32, 0.04, gold, 0, -0.06, 0, inner);
    box(0.1, 0.035, 0.04, gold, 0.05, -0.18, 0, inner); box(0.07, 0.035, 0.04, gold, 0.035, -0.11, 0, inner);
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 8), new THREE.MeshBasicMaterial({ color: '#ffd86a', transparent: true, opacity: 0.16, depthWrite: false })); halo.position.y = 0.0; inner.add(halo);
    inner.position.y = 0.7;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.42, 24), new THREE.MeshBasicMaterial({ color: '#ffd86a', transparent: true, opacity: 0.25, depthWrite: false })); disc.rotation.x = -Math.PI / 2; disc.position.y = 0.03; g.add(disc);
    g.userData.inner = inner;
    return g;
  }
  function leverModel() {
    const g = new THREE.Group();
    const stone = M('#6a6460'), iron = M('#3a3a42', { r: 0.4, m: 0.85 }), wood = M('#5a3a20');
    box(0.5, 0.42, 0.42, stone, 0, 0.21, 0, g); box(0.56, 0.06, 0.48, stone, 0, 0.44, 0, g);
    box(0.3, 0.06, 0.12, iron, 0, 0.5, 0, g);
    const pivot = new THREE.Group(); pivot.position.set(0, 0.52, 0); g.add(pivot);
    box(0.05, 0.5, 0.05, wood, 0, 0.25, 0, pivot);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), M('#c82a1a', { e: '#ff3a1a', ei: 0.7 })); knob.position.y = 0.52; pivot.add(knob);
    pivot.rotation.z = 0.7;
    g.userData.pivot = pivot; g.userData.knob = knob;
    return g;
  }

  // ---------- Montar y quitar ----------
  function clear() {
    for (const o of [...gates.map((g) => g.obj), ...keys.values(), ...levers.values()]) if (o.parent) o.parent.remove(o);
    gates.length = 0; keys.clear(); levers.clear();
    mapRef = null; scene = null;
    const p = document.getElementById('dquest'); if (p) p.classList.add('hidden');
  }
  function build() {
    const q = game.quest, map = game.map;
    scene = D.stage.scene; mapRef = map;
    if (!q) return;
    const solid = (x, y) => x < 0 || y < 0 || x >= map.w || y >= map.h || map.tiles[y * map.w + x] === '#';
    const inGate = (x, y) => q.gate.some((g) => g.x === x && g.y === y);
    for (const g of q.gate) {
      // el rastrillo cruza el paso: a lo largo de x si hay muro o más portón a izquierda y derecha
      const alongX = (solid(g.x - 1, g.y) || inGate(g.x - 1, g.y)) && (solid(g.x + 1, g.y) || inGate(g.x + 1, g.y)) || !((solid(g.x, g.y - 1) || inGate(g.x, g.y - 1)) && (solid(g.x, g.y + 1) || inGate(g.x, g.y + 1)));
      const o = gateModel(map.theme, alongX); o.position.set(g.x + 0.5, 0, g.y + 0.5);
      scene.add(o); gates.push({ obj: o, i: g.y * map.w + g.x });
      if (q.open) o.userData.bars.position.y = 1.3;
    }
    if (q.type === 'keys') for (const s of q.spots) { const o = keyModel(); o.position.set(s.x + 0.5, 0, s.y + 0.5); scene.add(o); keys.set(s.x + ',' + s.y, o); }
    if (q.type === 'levers') for (const s of q.spots) { const o = leverModel(); o.position.set(s.x + 0.5, 0, s.y + 0.5); o.rotation.y = 0.6; scene.add(o); levers.set(s.x + ',' + s.y, o); }
  }

  // ---------- Cada fotograma ----------
  function panel() {
    let el = document.getElementById('dquest');
    if (!el) { el = document.createElement('div'); el.id = 'dquest'; el.className = 'hidden'; document.getElementById('dview').appendChild(el); }
    return el;
  }
  const TXT = {
    keys: (q) => ['🗝️ Las llaves del portón', `Encuentra las llaves repartidas por las salas: ${q.got}/${q.need}`],
    levers: (q) => ['🔧 Las palancas del portón', `Acciona las palancas (clic en ellas): ${q.got}/${q.need}`],
    waves: (q) => ['⚔️ Aguanta las oleadas', q.wave ? `Oleada ${q.wave} de ${q.waves}: ¡que no os echen de la sala!` : 'Busca la sala del portón y aguanta allí mientras se abre'],
  };
  let lastTxt = '';
  function update(now, dt) {
    if (!D.stage || !game.map) return;
    if (game.map !== mapRef || D.stage.scene !== scene) { clear(); build(); }
    const q = game.quest;
    const el = panel();
    if (!q || game.map.kind !== 'dungeon') { el.classList.add('hidden'); return; }
    // el cartel del objetivo
    const [title, sub] = q.open ? ['🏰 El portón está abierto', '¡El jefe os espera!'] : TXT[q.type](q);
    const pct = q.open ? 100 : Math.round(100 * q.got / Math.max(1, q.need));
    const key = title + sub + pct;
    if (key !== lastTxt) {
      lastTxt = key;
      el.innerHTML = '<b></b><small></small><i><u></u></i>';
      el.querySelector('b').textContent = title; el.querySelector('small').textContent = sub;
      el.querySelector('u').style.width = pct + '%';
      el.classList.toggle('done', !!q.open);
    }
    el.classList.remove('hidden');
    const seen = game.seen, W = game.map.w;
    for (const g of gates) {
      g.obj.visible = !!seen[g.i];
      const bars = g.obj.userData.bars;
      const target = q.open ? 1.3 : q.type === 'waves' ? 0.9 * q.got / Math.max(1, q.need) * 0.4 : 0; // con las oleadas, va subiendo poco a poco
      bars.position.y += (target - bars.position.y) * Math.min(1, dt * (q.open ? 1.6 : 3));
      g.obj.userData.lock.visible = !q.open;
    }
    for (const s of q.spots || []) {
      const k = s.x + ',' + s.y;
      const o = keys.get(k) || levers.get(k);
      if (!o) continue;
      o.visible = !!seen[s.y * W + s.x] && (q.type !== 'keys' || !s.done);
      if (keys.has(k)) { const inner = o.userData.inner; inner.rotation.y = now / 600; inner.position.y = 0.7 + Math.sin(now / 400 + s.x) * 0.08; }
      else {
        const pv = o.userData.pivot;
        pv.rotation.z += ((s.done ? -0.7 : 0.7) - pv.rotation.z) * Math.min(1, dt * 6);
        o.userData.knob.material.emissive.set(s.done ? '#3aff6a' : '#ff3a1a');
        o.userData.knob.material.color.set(s.done ? '#2ac84a' : '#c82a1a');
      }
    }
  }

  // luces: las llaves brillan en dorado y las palancas en rojo (verde ya accionadas)
  function lights() {
    const q = game.quest, out = [];
    if (!q || q.open || !game.seen) return out;
    for (const s of q.spots || []) {
      if (!game.seen[s.y * game.map.w + s.x] || (q.type === 'keys' && s.done)) continue;
      out.push(q.type === 'keys' ? { x: s.x + 0.5, y: 0.9, z: s.y + 0.5, color: '#ffd86a', intensity: 1.3, dist: 3.5 } : { x: s.x + 0.5, y: 1.0, z: s.y + 0.5, color: s.done ? '#5aff7a' : '#ff5a3a', intensity: 0.8, dist: 2.6 });
    }
    return out;
  }

  // clic en una palanca (o en la casilla de debajo, que el modelo sobresale)
  function leverAt(x, y) {
    const q = game.quest;
    if (!q || q.type !== 'levers' || q.open) return null;
    return (q.spots || []).find((s) => !s.done && s.x === x && (s.y === y || s.y === y - 1) && game.seen[s.y * game.map.w + s.x]) || null;
  }

  function event(ev) {
    const me = DD.myId;
    if (ev.kind === 'key') {
      DD.sfx('quest'); for (let i = 0; i < 14; i++) D.spark(ev.x + 0.5, ev.y + 0.5, '#ffd23f', true); D.ring(ev.x, ev.y, '#ffd23f');
      D.float(ev.x, ev.y, `🗝️ ${ev.got}/${ev.need}`, '#ffd23f', true);
    } else if (ev.kind === 'lever') {
      DD.sfx('door', { vol: 0.9 }); for (let i = 0; i < 8; i++) D.spark(ev.x + 0.5, ev.y + 0.5, '#9aff9a', true);
      D.float(ev.x, ev.y, `🔧 ${ev.got}/${ev.need}`, '#9aff9a', true);
      if (ev.got < ev.need) D.banner('¡EMBOSCADA!', 'La palanca ha despertado algo en la oscuridad');
    } else if (ev.kind === 'wave') {
      DD.sfx('worldboss'); D.banner(`OLEADA ${ev.wave} DE ${ev.waves}`, ev.wave === 1 ? '¡Aguantad mientras el portón se abre!' : '¡Ahí vienen más!');
      if (!DD.gfx || DD.gfx.shake) game.shake = performance.now() + 400;
    } else if (ev.kind === 'wavedone') {
      DD.sfx('quest'); DD.toast(`🛡️ Oleada ${ev.wave} de ${ev.waves} rechazada`);
    } else if (ev.kind === 'gate') {
      DD.sfx('portal'); D.banner('¡EL PORTÓN SE ABRE!', `+${ev.xp} PX · el jefe os espera`);
      if (!DD.gfx || DD.gfx.shake) game.shake = performance.now() + 700;
      for (const g of gates) { const x = g.i % game.map.w, y = (g.i / game.map.w) | 0; for (let i = 0; i < 6; i++) D.puff(x + 0.5, y + 0.5, '#8a8070', 2, 0.4); }
    }
    void me;
  }

  Object.assign(D, { updateQuest: update, clearQuest: clear, questEvent: event, leverAt, questLights: lights });
})();
