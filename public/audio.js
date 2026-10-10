// Sonido del juego hecho con WebAudio, sin archivos: efectos (golpes, hechizos, monedas, puertas…)
// y música compuesta para cada sitio (menú, taberna, mazmorra, jefe, mundo abierto).
// Uso: SFX.play('hit', { crit: true }), SFX.music('tavern'), SFX.setVol('music', 0.5).
(function (root) {
  'use strict';
  const AC = root.AudioContext || root.webkitAudioContext;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } },
  };
  let vols = { master: 0.8, music: 0.45, sfx: 0.8 };
  try { vols = Object.assign(vols, JSON.parse(store.get('dd-vol')) || {}); } catch { /* valores por defecto */ }
  let muted = store.get('dd-sound') === '0';

  let ctx = null, master, sfxBus, musicBus, verb, noiseBuf;
  const lastPlay = {};

  function init() {
    if (ctx || !AC) return ctx;
    try { ctx = new AC(); } catch { return null; }
    master = ctx.createGain();
    // compresor final: muchos golpes a la vez no saturan
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.2;
    master.connect(comp); comp.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.connect(master);
    musicBus = ctx.createGain(); musicBus.connect(master);
    // reverberación: respuesta de impulso hecha con ruido que se apaga (sala de piedra)
    verb = ctx.createConvolver();
    const len = ctx.sampleRate * 2.4, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    verb.buffer = ir;
    const wet = ctx.createGain(); wet.gain.value = 0.32; verb.connect(wet); wet.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    applyVols();
    return ctx;
  }
  function applyVols() {
    if (!ctx) return;
    const t = ctx.currentTime;
    master.gain.setTargetAtTime(muted ? 0 : vols.master, t, 0.05);
    sfxBus.gain.setTargetAtTime(vols.sfx, t, 0.05);
    musicBus.gain.setTargetAtTime(vols.music * 0.55, t, 0.05);
  }
  // El navegador solo deja sonar tras un gesto del jugador
  function unlock() {
    if (!init()) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    if (wantTrack && !track) startTrack(wantTrack);
  }
  ['pointerdown', 'keydown', 'touchstart'].forEach((e) => root.addEventListener(e, unlock, { passive: true }));
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend().catch(() => {}); else ctx.resume().catch(() => {});
  });

  const ready = () => ctx && ctx.state === 'running' && !muted;
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // ---------- Piezas básicas ----------
  function env(g, t, a, peak, d, sustain = 0.0001) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain), t + a + d);
  }
  function osc(type, f, t, dur, peak, out, o = {}) {
    const n = ctx.createOscillator(), g = ctx.createGain();
    n.type = type; n.frequency.setValueAtTime(f, t);
    if (o.to) n.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + (o.glide || dur));
    if (o.detune) n.detune.value = o.detune;
    env(g, t, o.a || 0.004, peak, dur);
    n.connect(g); g.connect(o.filter || out);
    n.start(t); n.stop(t + (o.a || 0.004) + dur + 0.05);
    return g;
  }
  function noise(t, dur, peak, out, o = {}) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; s.loop = true;
    f.type = o.type || 'bandpass'; f.frequency.setValueAtTime(o.f || 1000, t); f.Q.value = o.q || 1;
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    env(g, t, o.a || 0.003, peak, dur);
    s.connect(f); f.connect(g); g.connect(out);
    s.start(t, Math.random() * 1.5); s.stop(t + (o.a || 0.003) + dur + 0.05);
    return g;
  }
  function send(node, amt) { const g = ctx.createGain(); g.gain.value = amt; node.connect(g); g.connect(verb); }
  function bell(f, t, peak, out, dur = 1.6) {
    const g = osc('sine', f, t, dur, peak, out);
    osc('sine', f * 2.76, t, dur * 0.5, peak * 0.25, out);
    osc('sine', f * 5.4, t, dur * 0.25, peak * 0.1, out);
    return g;
  }
  function metal(f, t, peak, out, dur = 0.9) {
    [1, 2.31, 3.89, 5.12, 6.7].forEach((r, i) => osc(i % 2 ? 'square' : 'sine', f * r, t, dur / (1 + i * 0.6), peak / (1 + i * 1.4), out));
  }

  // ---------- Efectos ----------
  const FX = {
    click(t, o, out) { osc('triangle', 1400, t, 0.03, 0.12, out, { to: 900 }); },
    open(t, o, out) { noise(t, 0.08, 0.25, out, { f: 700, q: 2 }); osc('sine', 180, t, 0.09, 0.3, out, { to: 110 }); },
    close(t, o, out) { noise(t, 0.06, 0.2, out, { f: 500, q: 2 }); osc('sine', 140, t, 0.07, 0.25, out, { to: 90 }); },
    chat(t, o, out) { osc('sine', 880, t, 0.06, 0.12, out, { to: 1100 }); },
    join(t, o, out) { bell(784, t, 0.18, out, 0.6); bell(1047, t + 0.12, 0.16, out, 0.8); },
    error(t, o, out) { osc('square', 160, t, 0.18, 0.1, out); osc('square', 120, t + 0.12, 0.2, 0.1, out); },
    swing(t, o, out) { noise(t, 0.14, 0.22, out, { f: 600, to: 2600, q: 0.8, a: 0.02 }); },
    hit(t, o, out) {
      const k = o.crit ? 1.6 : 1;
      noise(t, 0.08, 0.5 * k, out, { f: 1800, to: 500, q: 1.2 });
      osc('sine', 150, t, 0.12, 0.55 * k, out, { to: 55 });
      if (o.crit) { metal(620, t, 0.18, out, 0.5); send(osc('sine', 90, t, 0.3, 0.4, out, { to: 40 }), 0.4); }
    },
    hurt(t, o, out) { osc('sine', 110, t, 0.18, 0.6, out, { to: 45 }); noise(t, 0.1, 0.35, out, { type: 'lowpass', f: 900 }); osc('sawtooth', 220, t, 0.15, 0.08, out, { to: 120 }); },
    block(t, o, out) { metal(420, t, 0.22, out, 0.4); },
    miss(t, o, out) { noise(t, 0.1, 0.12, out, { f: 2400, to: 4000, q: 2 }); },
    cast(t, o, out) {
      const k = o.kind || 'arcane';
      if (k === 'fire') { const g = noise(t, 0.5, 0.45, out, { type: 'lowpass', f: 400, to: 1800, a: 0.06 }); send(g, 0.3); osc('sawtooth', 90, t, 0.4, 0.12, out, { to: 160 }); }
      else if (k === 'ice') { [1568, 2093, 2637, 3136].forEach((f, i) => bell(f, t + i * 0.035, 0.07, out, 0.5)); noise(t, 0.3, 0.12, out, { type: 'highpass', f: 5000 }); }
      else if (k === 'holy') { [523, 659, 784, 1047].forEach((f) => send(osc('sine', f, t, 0.9, 0.08, out, { a: 0.08 }), 0.6)); }
      else if (k === 'nature') { noise(t, 0.35, 0.25, out, { f: 900, to: 300, q: 3, a: 0.04 }); osc('triangle', 330, t, 0.3, 0.12, out, { to: 495 }); }
      else if (k === 'storm') { noise(t, 0.6, 0.6, out, { type: 'lowpass', f: 3000, to: 200 }); send(osc('sawtooth', 70, t, 0.5, 0.2, out, { to: 40 }), 0.5); }
      else if (k === 'shadow') { send(osc('sawtooth', 220, t, 0.5, 0.12, out, { to: 70 }), 0.4); noise(t, 0.4, 0.2, out, { f: 300, q: 4 }); }
      else if (k === 'shout') { osc('sawtooth', 160, t, 0.35, 0.18, out, { to: 110, a: 0.03 }); noise(t, 0.3, 0.2, out, { f: 500, q: 1 }); }
      else { const g = osc('sine', 500, t, 0.35, 0.18, out, { to: 1400, a: 0.02 }); send(g, 0.5); osc('triangle', 750, t, 0.3, 0.08, out, { to: 2100 }); }
    },
    heal(t, o, out) { [659, 784, 988].forEach((f, i) => send(bell(f, t + i * 0.06, 0.1, out, 0.8), 0.5)); },
    die(t, o, out) {
      if (o.boss) {
        send(osc('sine', 80, t, 1.6, 0.9, out, { to: 28 }), 0.6);
        noise(t, 1.4, 0.7, out, { type: 'lowpass', f: 1200, to: 80 });
        metal(196, t + 0.05, 0.2, out, 1.4);
      } else { osc('sine', 130, t, 0.22, 0.45, out, { to: 50 }); noise(t, 0.18, 0.3, out, { type: 'lowpass', f: 1400, to: 200 }); }
    },
    coin(t, o, out) { bell(1976, t, 0.14, out, 0.35); bell(2637, t + 0.07, 0.12, out, 0.5); },
    item(t, o, out) {
      const r = o.rarity || 'normal';
      if (r === 'unico' || r === 'conjunto') { [523, 659, 784, 1047, 1319].forEach((f, i) => send(bell(f, t + i * 0.09, 0.16, out, 1.4), 0.6)); }
      else if (r === 'raro') { [659, 880, 1319].forEach((f, i) => send(bell(f, t + i * 0.08, 0.14, out, 1), 0.4)); }
      else if (r === 'magico') { [784, 1175].forEach((f, i) => bell(f, t + i * 0.08, 0.13, out, 0.8)); }
      else { noise(t, 0.06, 0.2, out, { f: 1200, q: 2 }); osc('triangle', 600, t, 0.08, 0.12, out); }
    },
    potion(t, o, out) { for (let i = 0; i < 4; i++) osc('sine', 400 + i * 120, t + i * 0.06, 0.07, 0.12, out, { to: 700 + i * 150 }); },
    chest(t, o, out) {
      osc('sawtooth', 110, t, 0.35, 0.06, out, { to: 160, a: 0.05 });
      noise(t + 0.25, 0.12, 0.3, out, { f: 400, q: 2 });
      FX.coin(t + 0.35, o, out); FX.coin(t + 0.45, o, out);
    },
    door(t, o, out) {
      const g = osc('sawtooth', 70, t, 0.6, 0.07, out, { to: 95, a: 0.08 });
      send(g, 0.4);
      noise(t, 0.6, 0.12, out, { f: 300, q: 6, to: 450, a: 0.1 });
      osc('sine', 90, t + 0.55, 0.2, 0.4, out, { to: 50 });
    },
    roll(t, o, out) { noise(t, 0.22, 0.25, out, { f: 400, to: 1400, q: 0.7, a: 0.03 }); },
    tele(t, o, out) { osc('sawtooth', 80, t, 0.6, 0.08, out, { to: 160, a: 0.2 }); },
    boom(t, o, out) { send(osc('sine', 70, t, 0.9, 0.9, out, { to: 30 }), 0.5); noise(t, 0.8, 0.6, out, { type: 'lowpass', f: 1600, to: 90 }); },
    portal(t, o, out) { const g = osc('sine', 300, t, 1.4, 0.15, out, { to: 1200, a: 0.3 }); send(g, 0.8); osc('triangle', 450, t + 0.1, 1.2, 0.08, out, { to: 1800, a: 0.3 }); },
    levelup(t, o, out) {
      [523, 659, 784, 1047].forEach((f, i) => send(bell(f, t + i * 0.11, 0.18, out, 1.2), 0.6));
      [1047, 1319, 1568].forEach((f) => send(osc('triangle', f, t + 0.5, 1.2, 0.07, out, { a: 0.05 }), 0.7));
    },
    quest(t, o, out) { [392, 523, 659, 784].forEach((f, i) => send(osc('triangle', f, t + i * 0.1, 0.4, 0.12, out), 0.4)); },
    forge(t, o, out) { if (o.ok === false) { osc('sine', 120, t, 0.3, 0.4, out, { to: 60 }); noise(t, 0.2, 0.2, out, { type: 'lowpass', f: 600 }); return; } metal(523, t, 0.25, out, 1.1); metal(523, t + 0.28, 0.2, out, 1.1); },
    bite(t, o, out) { bell(1568, t, 0.15, out, 0.3); bell(1865, t + 0.12, 0.15, out, 0.3); },
    worldboss(t, o, out) { send(osc('sawtooth', 55, t, 2, 0.25, out, { a: 0.3 }), 0.6); send(osc('sawtooth', 82, t + 0.4, 1.8, 0.2, out, { a: 0.3 }), 0.6); },
    dice(t, o, out) { for (let i = 0; i < 5; i++) noise(t + i * 0.07 + Math.random() * 0.03, 0.03, 0.25 - i * 0.04, out, { f: 2500, q: 3 }); },
    ping(t, o, out) { send(bell(1319, t, 0.2, out, 0.6), 0.5); bell(1760, t + 0.1, 0.15, out, 0.6); },
    down(t, o, out) { [392, 330, 262, 196].forEach((f, i) => send(osc('triangle', f, t + i * 0.16, 0.4, 0.12, out), 0.5)); },
    buy(t, o, out) { FX.coin(t, o, out); FX.coin(t + 0.09, o, out); },
  };
  // límite para que cien golpes a la vez no saturen
  const GAP = { hit: 0.03, swing: 0.04, coin: 0.05, miss: 0.05, die: 0.04, chat: 0.08, click: 0.03 };

  function play(name, o = {}) {
    if (!ready() || !FX[name]) return;
    const now = ctx.currentTime;
    if (GAP[name] && lastPlay[name] && now - lastPlay[name] < GAP[name]) return;
    lastPlay[name] = now;
    const out = ctx.createGain();
    out.gain.value = o.vol == null ? 1 : o.vol;
    if (o.pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, o.pan)); out.connect(p); p.connect(sfxBus); } else out.connect(sfxBus);
    try { FX[name](now + 0.005, o, out); } catch { /* nada */ }
    setTimeout(() => out.disconnect(), 4000);
  }
  // tono suelto (compatibilidad con los avisos antiguos), ahora más suave
  function tone(freq, dur) {
    if (!ready()) return;
    const t = ctx.currentTime, out = ctx.createGain(); out.connect(sfxBus);
    osc('triangle', freq, t, Math.max(0.06, dur * 1.4), 0.12, out);
    osc('sine', freq * 2, t, Math.max(0.04, dur), 0.04, out);
    setTimeout(() => out.disconnect(), 2000);
  }

  // ---------- Música ----------
  // Notas: «D4:2» = re4 que dura dos corcheas. «r» = silencio.
  const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function parse(s) {
    return s.split(/[\s|]+/).filter(Boolean).map((tok) => {
      const [n, d] = tok.split(':');
      if (n === 'r') return [null, +(d || 1)];
      const m = /^([A-G])(b|#)?(\d)$/.exec(n);
      return [12 * (+m[3] + 1) + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0), +(d || 1)];
    });
  }
  const seq = (s) => { const out = []; let at = 0; for (const [n, d] of parse(s)) { if (n != null) out.push({ at, n, d }); at += d; } return { notes: out, len: at }; };

  // Instrumentos de la música
  function pluck(t, m, dur, v, out) {
    const f = mtof(m), lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(f * 6, t); lp.frequency.exponentialRampToValueAtTime(f * 1.5, t + dur);
    lp.connect(out);
    osc('triangle', f, t, dur * 1.6, v, out, { filter: lp, a: 0.003 });
    osc('sawtooth', f, t, dur * 0.6, v * 0.18, out, { filter: lp, a: 0.002, detune: 4 });
  }
  function pad(t, ms, dur, v, out, cutoff = 700) {
    const lp = ctx.createBiquadFilter(), g = ctx.createGain();
    lp.type = 'lowpass'; lp.frequency.value = cutoff; lp.connect(g); g.connect(out);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + dur * 0.35); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    for (const m of ms) for (const dt of [-8, 8]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = dt; o.connect(lp); o.start(t); o.stop(t + dur + 0.1); }
    const s = ctx.createGain(); s.gain.value = 0.5; g.connect(s); s.connect(verb);
  }
  function bass(t, m, dur, v, out) { osc('triangle', mtof(m), t, dur, v, out, { a: 0.01 }); osc('sine', mtof(m) / 2, t, dur, v * 0.6, out, { a: 0.01 }); }
  function drum(t, low, v, out) {
    if (low) { osc('sine', 130, t, 0.25, v, out, { to: 48 }); noise(t, 0.05, v * 0.3, out, { type: 'lowpass', f: 500 }); }
    else noise(t, 0.07, v * 0.5, out, { f: 2200, q: 1.5 });
  }
  function tom(t, v, out) { osc('sine', 110, t, 0.35, v, out, { to: 55 }); noise(t, 0.12, v * 0.4, out, { type: 'lowpass', f: 900 }); }
  function sawBass(t, m, dur, v, out) {
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(1400, t); lp.frequency.exponentialRampToValueAtTime(300, t + dur); lp.Q.value = 4; lp.connect(out);
    osc('sawtooth', mtof(m), t, dur, v, out, { filter: lp, a: 0.005 });
  }

  // Taberna: giga en re dórico, 3/4, corcheas
  const TAV_A = seq('D4:2 F4 A4:2 G4 | F4:2 E4 D4:3 | C4:2 E4 G4:2 F4 | E4:2 D4 C4:3 | D4:2 F4 A4:2 D5 | C5:2 A4 G4:2 E4 | F4 G4 A4 G4 F4 E4 | D4:6');
  const TAV_B = seq('A4:2 D5 D5:2 C5 | A4:2 G4 A4:3 | G4:2 C5 C5:2 B4 | G4:2 F4 G4:3 | A4:2 D5 C5:2 A4 | G4:2 E4 C4:2 E4 | F4 E4 D4 E4 F4 E4 | D4:6');
  const TAV_ROOT = { A: [50, 50, 48, 48, 50, 45, 43, 50], B: [50, 45, 48, 43, 50, 48, 45, 50] };
  // Mundo: arpegios tranquilos en do mayor, 4/4
  const WORLD_CH = [[48, 52, 55, 60, 64], [45, 48, 52, 57, 60], [41, 45, 48, 53, 57], [43, 47, 50, 55, 59]];
  // Mazmorra: acordes oscuros y campanas sueltas en la menor
  const DUN_CH = [[45, 52, 57, 60], [41, 48, 53, 57], [38, 45, 50, 53], [40, 47, 52, 56]];
  const DUN_BELL = [69, 72, 74, 76, 79, 81, 84];
  // Jefe: ostinato rápido
  const BOSS_OST = [45, 45, 48, 45, 52, 45, 50, 48];
  const BOSS_CH = [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 56, 59]];

  const TRACKS = {
    tavern: { step: 0.19, vol: 1, tick(t, i, out) {
      // 8 compases A + 8 compases B, 6 corcheas por compás
      const bar = Math.floor(i / 6) % 16, pos = i % 6, part = bar < 8 ? 'A' : 'B', b8 = bar % 8;
      const tune = part === 'A' ? TAV_A : TAV_B, at = b8 * 6 + pos;
      for (const n of tune.notes) if (n.at === at) pluck(t, n.n + (Math.floor(i / 96) % 2 && Math.random() < 0.15 ? 12 : 0), n.d * this.step, 0.2, out);
      const root = TAV_ROOT[part][b8];
      if (pos === 0) bass(t, root - 12, this.step * 3, 0.22, out);
      if (pos === 4) bass(t, root - 5, this.step * 2, 0.14, out);
      if (pos === 2 || pos === 4) { pluck(t, root, this.step * 1.5, 0.06, out); pluck(t, root + 7, this.step * 1.5, 0.05, out); }
      if (pos === 0) drum(t, true, 0.35, out); else if (pos === 2 || pos === 4) drum(t, false, 0.18, out); else if (Math.random() < 0.2) drum(t, false, 0.08, out);
    } },
    menu: { step: 0.24, vol: 0.8, tick(t, i, out) { TRACKS.tavern.tick.call({ step: this.step }, t, i, out); } },
    world: { step: 0.36, vol: 0.9, tick(t, i, out) {
      const bar = Math.floor(i / 8) % 4, pos = i % 8, ch = WORLD_CH[bar];
      if (pos === 0) { pad(t, ch.slice(0, 3).map((m) => m + 12), this.step * 8, 0.035, out, 900); bass(t, ch[0] - 12, this.step * 6, 0.16, out); }
      const up = [0, 1, 2, 3, 4, 3, 2, 1][pos];
      if (pos !== 7 || Math.random() < 0.5) pluck(t, ch[up] + 12, this.step * 1.5, 0.12, out);
      if (Math.random() < 0.08) pluck(t + this.step / 2, ch[(up + 2) % 5] + 24, this.step, 0.06, out);
    } },
    dungeon: { step: 0.5, vol: 1, tick(t, i, out) {
      const bar = Math.floor(i / 16) % 4, pos = i % 16;
      if (pos === 0) { pad(t, DUN_CH[bar], this.step * 16, 0.05, out, 420); bass(t, DUN_CH[bar][0] - 12, this.step * 14, 0.12, out); }
      if (Math.random() < 0.18) { const m = DUN_BELL[(Math.random() * DUN_BELL.length) | 0]; const g = bell(mtof(m), t, 0.045, out, 2.4); send(g, 0.9); }
      if (Math.random() < 0.04) { const f = 1800 + Math.random() * 1600; send(osc('sine', f, t, 0.12, 0.05, out, { to: f * 0.5 }), 1); } // gota de agua
      if (pos === 8 && Math.random() < 0.5) drum(t, true, 0.12, out);
    } },
    boss: { step: 0.107, vol: 1, tick(t, i, out) {
      const pos = i % 16, bar = Math.floor(i / 16) % 4, ch = BOSS_CH[bar];
      sawBass(t, BOSS_OST[i % 8] - 12 + (bar === 1 ? -4 : bar === 2 ? -2 : bar === 3 ? -5 : 0), this.step * 0.9, 0.16, out);
      if (pos === 0 || pos === 8 || pos === 11 || pos === 14) tom(t, pos === 0 ? 0.5 : 0.35, out);
      if (pos % 4 === 2) drum(t, false, 0.15, out);
      if (pos === 0 && bar % 2 === 0) pad(t, ch, this.step * 30, 0.06, out, 1200);
    } },
  };

  let track = null, wantTrack = null, timer = null;
  function startTrack(name) {
    const T = TRACKS[name];
    if (!T || !ctx) return;
    if (track) {
      const old = track; old.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.6);
      setTimeout(() => old.g.disconnect(), 3500);
    }
    const g = ctx.createGain(); g.gain.value = 0.0001; g.connect(musicBus);
    g.gain.setTargetAtTime(T.vol, ctx.currentTime + 0.1, 0.8);
    track = { name, T, g, i: 0, next: ctx.currentTime + 0.15 };
    if (!timer) timer = setInterval(pump, 60);
  }
  function pump() {
    if (!track || !ctx || ctx.state !== 'running') return;
    const ahead = ctx.currentTime + 0.25;
    if (track.next < ctx.currentTime - 1) track.next = ctx.currentTime + 0.05; // vuelta de una pestaña dormida
    while (track.next < ahead) {
      try { track.T.tick(track.next, track.i, track.g); } catch { /* nada */ }
      track.i++; track.next += track.T.step;
    }
  }
  function music(name) {
    if (name === wantTrack) return;
    wantTrack = name;
    if (!ctx) return; // empezará con el primer gesto
    if (!name) { if (track) { const old = track; old.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.5); setTimeout(() => old.g.disconnect(), 3000); track = null; } return; }
    startTrack(name);
  }

  function setVol(kind, v) {
    vols[kind] = Math.max(0, Math.min(1, +v || 0));
    store.set('dd-vol', JSON.stringify(vols));
    applyVols();
  }
  function setMuted(m) { muted = !!m; store.set('dd-sound', muted ? '0' : '1'); if (!muted) unlock(); applyVols(); }

  root.SFX = {
    play, tone, music, setVol, setMuted, unlock,
    get vols() { return { ...vols }; }, get muted() { return muted; }, get track() { return wantTrack; },
    get ctx() { return init(); }, get out() { init(); return sfxBus; },
  };
})(typeof window !== 'undefined' ? window : globalThis);
