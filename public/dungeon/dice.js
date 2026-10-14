/* global DD, THREE */
// Dados 3D del combate por turnos: cada ataque con arma (y los golpes de los monstruos) tira un d20 que sale del atacante,
// rueda y bota hasta el objetivo y se para enseñando su cara; luego sale la cuenta («14 + 5 = 19 · CA 15»).
// El servidor decide la tirada (ev.roll = { f: cara, b: bonificador, ca }); aquí sólo se enseña.
// Un 20 natural para un instante el tiempo, acerca la cámara y estalla en oro; un 1 natural es una pifia.
(() => {
  'use strict';
  const D = DD.dg;
  const { game } = D;
  const R = 0.25; // radio del dado (más grande que uno de verdad, para que se lea)
  let geo = null, mats = null;
  const live = [];

  // ---------- el d20: icosaedro con un número en cada cara (atlas de 5 × 4 casillas) ----------
  function build() {
    if (geo) return;
    const W = 1024, H = 1024, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#5a0c10'; g.fillRect(0, 0, W, H);
    const cell = (i) => [(i % 5) / 5, Math.floor(i / 5) / 4]; // esquina de abajo a la izquierda, en uv
    const tri = [[0.5, 0.94], [0.06, 0.1], [0.94, 0.1]]; // arriba, abajo izquierda, abajo derecha (dentro de la casilla)
    for (let i = 0; i < 20; i++) {
      const [u0, v0] = cell(i), px = (u, v) => [(u0 + u / 5) * W, (1 - (v0 + v / 4)) * H];
      // cara: rojo granate con el borde más claro
      g.beginPath(); tri.forEach(([u, v], k) => { const [x, y] = px(u, v); if (k) g.lineTo(x, y); else g.moveTo(x, y); }); g.closePath();
      const [cx, cy] = px(0.5, 0.38);
      const grd = g.createRadialGradient(cx, cy, 4, cx, cy, 120); grd.addColorStop(0, i === 19 ? '#b8231c' : '#8a161a'); grd.addColorStop(1, '#4a080c');
      g.fillStyle = grd; g.fill(); g.strokeStyle = '#d8a84a'; g.lineWidth = 6; g.stroke();
      // número en oro (el 6 y el 9 llevan punto debajo)
      const n = String(i + 1);
      g.font = `bold ${n.length > 1 ? 74 : 86}px Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 8; g.strokeStyle = '#2a0406'; g.strokeText(n, cx, cy + 6);
      g.fillStyle = i === 19 ? '#ffe27a' : i === 0 ? '#c8c0b0' : '#f0d58a'; g.fillText(n, cx, cy + 6);
      if (n === '6' || n === '9') g.fillRect(cx - 12, cy + 50, 24, 7);
    }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    geo = new THREE.IcosahedronGeometry(R, 0);
    if (geo.index) geo = geo.toNonIndexed();
    const uv = new Float32Array(geo.attributes.position.count * 2);
    for (let f = 0; f < 20; f++) { const [u0, v0] = cell(f); tri.forEach(([u, v], k) => { uv[(f * 3 + k) * 2] = u0 + u / 5; uv[(f * 3 + k) * 2 + 1] = v0 + v / 4; }); }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    // normal de cada cara y hacia dónde queda la parte de arriba de su número (para dejarlo derecho)
    const P = geo.attributes.position, a = new THREE.Vector3(), b = new THREE.Vector3(), cc = new THREE.Vector3();
    geo.userData.faces = [];
    for (let f = 0; f < 20; f++) {
      a.fromBufferAttribute(P, f * 3); b.fromBufferAttribute(P, f * 3 + 1); cc.fromBufferAttribute(P, f * 3 + 2);
      const cen = a.clone().add(b).add(cc).divideScalar(3);
      geo.userData.faces.push({ n: cen.clone().normalize(), up: a.clone().sub(cen).normalize() });
    }
    const env = window.VIEW3D && VIEW3D.metalEnv ? VIEW3D.metalEnv() : null;
    mats = {
      die: new THREE.MeshStandardMaterial({ map: tex, roughness: 0.28, metalness: 0.1, envMap: env, envMapIntensity: 0.6, flatShading: true }),
      glow: new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }),
    };
    mats.die.userData.keep = true; tex.userData.keep = true;
  }

  // giro que deja la cara f mirando a la cámara con el número derecho
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
  function faceToCamera(f, cam) {
    const F = geo.userData.faces[f];
    const toCam = new THREE.Vector3(0, 0, 1).applyQuaternion(cam.quaternion).normalize();
    const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion).normalize();
    qa.setFromUnitVectors(F.n, toCam);
    v1.copy(F.up).applyQuaternion(qa).projectOnPlane(toCam).normalize();
    v2.copy(camUp).projectOnPlane(toCam).normalize();
    let ang = Math.acos(Math.max(-1, Math.min(1, v1.dot(v2))));
    if (v1.clone().cross(v2).dot(toCam) < 0) ang = -ang;
    qb.setFromAxisAngle(toCam, ang);
    return qb.clone().multiply(qa);
  }

  // ---------- una tirada ----------
  function roll(ev, t, by, now) {
    const st = D.stage;
    if (!st || !ev.roll || !t) return;
    build();
    const r = ev.roll;
    const mesh = new THREE.Mesh(geo, mats.die);
    mesh.castShadow = true;
    const from = by ? { x: (by.rx ?? by.x) + 0.5, z: (by.ry ?? by.y) + 0.5 } : { x: (t.rx ?? t.x) + 0.5, z: (t.ry ?? t.y) + 0.5 };
    // cae delante del objetivo, un poco hacia la cámara, para que no lo tape nadie
    const cd = new THREE.Vector3(0, 0, 1).applyQuaternion(st.camera.quaternion); cd.y = 0; cd.normalize();
    const to = { x: (t.rx ?? t.x) + 0.5 + cd.x * 0.55, z: (t.ry ?? t.y) + 0.5 + cd.z * 0.55 };
    mesh.position.set(from.x, 1.3, from.z);
    const spin = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    mesh.quaternion.setFromAxisAngle(spin, Math.random() * 6);
    st.scene.add(mesh);
    const nat20 = r.f === 20, nat1 = r.f === 1;
    let halo = null;
    if (nat20) { halo = new THREE.Mesh(new THREE.SphereGeometry(R * 1.9, 16, 12), mats.glow); halo.visible = false; st.scene.add(halo); }
    live.push({ mesh, halo, from, to, spin, start: now, r, ev, t, nat20, nat1, landed: false, final: faceToCamera(r.f - 1, st.camera) });
    DD.sfx('dice', { vol: ev.by === DD.myId || ev.t === DD.myId ? 1 : 0.4 });
  }

  const FLY = 520, ROLL = 380, HOLD = 1300, OUT = 260;
  function update(now) {
    const st = D.stage;
    for (let i = live.length - 1; i >= 0; i--) {
      const L = live[i], k = now - L.start, m = L.mesh;
      if (k < FLY) {
        // vuelo en arco con dos botes, girando
        const u = k / FLY, ease = 1 - (1 - u) * (1 - u);
        m.position.x = L.from.x + (L.to.x - L.from.x) * ease;
        m.position.z = L.from.z + (L.to.z - L.from.z) * ease;
        const hop = u < 0.6 ? Math.sin(u / 0.6 * Math.PI) * 0.9 : Math.sin((u - 0.6) / 0.4 * Math.PI) * 0.25;
        m.position.y = R + 0.02 + hop * (1 - u * 0.3) + (1 - u) * 0.3;
        m.rotateOnWorldAxis(L.spin, 0.32 * (1 - u * 0.5));
      } else if (k < FLY + ROLL) {
        // rueda hasta pararse con la cara que ha salido mirando a la cámara
        const u = (k - FLY) / ROLL;
        m.position.set(L.to.x, R + 0.02, L.to.z);
        m.quaternion.slerp(L.final, Math.min(1, 0.12 + u * u * 0.9));
      } else if (!L.landed) {
        L.landed = true;
        m.quaternion.copy(L.final);
        landed(L, now);
      } else if (k > FLY + ROLL + HOLD) {
        const u = Math.min(1, (k - FLY - ROLL - HOLD) / OUT);
        m.scale.setScalar(1 - u);
        if (L.halo) L.halo.scale.setScalar(1 - u);
        if (u >= 1) { st && st.scene.remove(m); if (L.halo) { st && st.scene.remove(L.halo); L.halo.geometry.dispose(); } live.splice(i, 1); }
      }
      if (L.halo && L.landed) { L.halo.visible = true; L.halo.position.copy(m.position); L.halo.scale.setScalar(1 + Math.sin(now / 90) * 0.12); }
    }
  }

  // al pararse: la cuenta encima del objetivo y, si es un 20 o un 1, su momento
  function landed(L, now) {
    const { r, ev, t } = L, hit = !ev.miss && !ev.dodge, tot = r.f + r.b;
    const sum = `🎲 ${r.f} ${r.b < 0 ? '−' : '+'} ${Math.abs(r.b)} = ${tot} · CA ${r.ca}`;
    if (L.nat20) {
      game.floaters.push({ x: t.x, y: t.y - 0.6, text: '¡20 NATURAL! ¡CRÍTICO!', color: '#ffd23f', big: true, crit: true, start: now });
      punch(now, ev.by === DD.myId || ev.t === DD.myId);
      DD.sfx('levelup', { vol: 0.5 });
    } else if (L.nat1) {
      game.floaters.push({ x: t.x, y: t.y - 0.6, text: ev.dodge ? '¡Pifia del monstruo!' : '¡Pifia!', color: '#b0a8a0', big: true, start: now });
      DD.sfx('miss');
    }
    game.floaters.push({ x: t.x, y: t.y - 0.3, text: sum + (hit ? (ev.block ? ' · Bloqueado' : ' · ¡Impacta!') : ev.dodge ? ' · Esquiva' : ' · Falla'), color: L.nat20 ? '#ffd23f' : hit ? '#bff0a0' : '#c0c4cc', start: now });
  }

  // 20 natural: un instante de tiempo parado, la cámara se acerca y la pantalla destella en oro
  function punch(now, mine) {
    game.hitstop = now + (mine ? 240 : 120);
    game.critZoom = { start: now, dur: 900, k: mine ? 0.2 : 0.1 };
    const f = document.createElement('div'); f.className = 'crit-flash';
    document.body.appendChild(f); setTimeout(() => f.remove(), 700);
    if (!DD.gfx || DD.gfx.shake) game.shake = now + 260;
  }
  // multiplicador del zoom de la cámara mientras dura el acercamiento del crítico
  function zoomPunch(now) {
    const z = game.critZoom;
    if (!z) return 1;
    const u = (now - z.start) / z.dur;
    if (u >= 1) { game.critZoom = null; return 1; }
    return 1 - z.k * Math.sin(Math.min(1, u) * Math.PI);
  }
  // al salir de la mazmorra no quedan dados por ahí
  function clear() { const st = D.stage; for (const L of live) { st && st.scene.remove(L.mesh); if (L.halo) st && st.scene.remove(L.halo); } live.length = 0; }

  Object.assign(D, { dice: roll, updateDice: update, zoomPunch, clearDice: clear });
})();
