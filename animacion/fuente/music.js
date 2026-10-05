// Música + efectos sintetizados, sincronizados con anim.js. Escribe music.wav
const fs = require('fs');
const SR = 44100, DUR = 17.4, N = Math.floor(SR * DUR);
const L = new Float32Array(N), R = new Float32Array(N);       // mezcla seca
const RL = new Float32Array(N), RR = new Float32Array(N);     // envío a reverb
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
let seed = 12345; const noise = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 * 2 - 1; };

function add(start, data, gain, pan = 0, rev = 0.3) {
  const s0 = Math.floor(start * SR), gl = Math.cos((pan + 1) * Math.PI / 4), gr = Math.sin((pan + 1) * Math.PI / 4);
  for (let i = 0; i < data.length; i++) { const j = s0 + i; if (j < 0 || j >= N) continue; const v = data[i] * gain; L[j] += v * gl; R[j] += v * gr; RL[j] += v * gl * rev; RR[j] += v * gr * rev; }
}
function gen(dur, f) { const n = Math.floor(dur * SR), d = new Float32Array(n); for (let i = 0; i < n; i++) d[i] = f(i / SR, i); return d; }

const bell = (m, dur = 1.6) => { const f = mtof(m); return gen(dur, t => Math.min(1, t / 0.002) * (Math.exp(-t * 3) * Math.sin(2 * Math.PI * f * t) + 0.3 * Math.exp(-t * 7) * Math.sin(2 * Math.PI * f * 2 * t) + 0.12 * Math.exp(-t * 12) * Math.sin(2 * Math.PI * f * 3.98 * t))); };
const marimba = (m, dur = 0.6) => { const f = mtof(m); return gen(dur, t => Math.min(1, t / 0.002) * Math.exp(-t * 9) * (Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(2 * Math.PI * f * 4 * t) * Math.exp(-t * 30))); };
function pluck(m, dur = 1.5, decay = 0.994) {
  const f = mtof(m), p = Math.max(2, Math.round(SR / f)), n = Math.floor(dur * SR), d = new Float32Array(n), buf = new Float32Array(p);
  for (let i = 0; i < p; i++) buf[i] = noise();
  for (let k = 0; k < 3; k++) for (let i = 0; i < p; i++) buf[i] = (buf[i] + buf[(i + 1) % p]) * 0.5;
  let idx = 0;
  for (let i = 0; i < n; i++) { const nx = (idx + 1) % p; const v = buf[idx]; buf[idx] = decay * 0.5 * (buf[idx] + buf[nx]); d[i] = v * Math.min(1, i / 40); idx = nx; }
  return d;
}
const bass = (m, dur = 0.5) => { const f = mtof(m); return gen(dur, t => Math.min(1, t / 0.006) * Math.exp(-t * 3) * Math.min(1, (dur - t) / 0.04) * Math.tanh(1.4 * (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * t)))); };
const kick = () => { let ph = 0; return gen(0.3, t => { ph += 2 * Math.PI * (45 + 90 * Math.exp(-t * 25)) / SR; return Math.sin(ph) * Math.exp(-t * 14); }); };
function hp(d) { let prev = 0; for (let i = 0; i < d.length; i++) { const x = d[i]; d[i] = x - prev; prev = x; } return d; }
function lp(d, a) { let y = 0; for (let i = 0; i < d.length; i++) { y += a * (d[i] - y); d[i] = y; } return d; }
const shaker = () => hp(gen(0.07, t => noise() * Math.exp(-t * 60)));
const snare = (dec = 25) => { const n = hp(gen(0.18, t => noise() * Math.exp(-t * dec))); const tone = gen(0.18, t => Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t * 30) * 0.5); return n.map((v, i) => v + tone[i]); };
const crash = () => hp(hp(gen(2.5, t => noise() * Math.exp(-t * 1.6))));
const pad = (ms, dur) => gen(dur, t => { const env = Math.min(1, t / 0.6) * Math.min(1, (dur - t) / 1.2); let s = 0; for (const m of ms) { const f = mtof(m); s += Math.sin(2 * Math.PI * f * t + 0.3 * Math.sin(2 * Math.PI * 5 * t)) + 0.3 * Math.sin(2 * Math.PI * 2 * f * t); } return env * s / ms.length; });

// ---------------------------------------------------------------- canción
const BEAT = 12.3 / 24, BAR = BEAT * 4;
const CH = {
  C: { uke: [67, 60, 64, 72], root: 36, bell: [72, 76, 79] },
  G: { uke: [67, 62, 67, 71], root: 43, bell: [71, 74, 79] },
  Am: { uke: [69, 60, 64, 69], root: 45, bell: [69, 72, 76] },
  F: { uke: [69, 60, 65, 69], root: 41, bell: [69, 72, 77] },
};
const PROG = ['C', 'G', 'Am', 'F', 'C', 'G'];
const MEL = [
  [[0, 76], [0.5, 79], [1, 84, 1], [2, 79], [2.5, 76], [3, 74], [3.5, 76]],
  [[0, 74], [0.5, 79], [1, 83, 1], [2, 81], [2.5, 79], [3, 74, 1]],
  [[0, 72], [0.5, 76], [1, 81, 1], [2, 79], [2.5, 76], [3, 72], [3.5, 74]],
  [[0, 77], [1, 81], [1.5, 79], [2, 77], [2.5, 76], [3, 74, 1]],
  [[0, 76], [0.5, 79], [1, 84, 1], [2, 86], [2.5, 84], [3, 79], [3.5, 81]],
];
function strum(t0, notes, down, gain) {
  const ord = down ? notes : [...notes].reverse();
  ord.forEach((m, k) => add(t0 + k * 0.014, pluck(m, 1.2), gain * (down ? 1 : 0.7), -0.25 + k * 0.05, 0.25));
}
for (let b = 0; b < 6; b++) {
  const t0 = b * BAR, ch = CH[PROG[b]], build = b === 5;
  const pat = build ? [0, .5, 1, 1.5, 2, 2.5, 3, 3.5] : [0, 1, 1.5, 2.5, 3, 3.5];
  pat.forEach((bt, i) => { const g = build ? 0.16 + 0.03 * i : 0.2; strum(t0 + bt * BEAT, ch.uke, Number.isInteger(bt) || build, b === 0 ? g * 0.8 : g); });
  for (const bt of [0, 2]) add(t0 + bt * BEAT, bass(ch.root, BEAT * 1.7), 0.42, 0, 0.05);
  if (b > 0) for (const bt of [0, 2]) add(t0 + bt * BEAT, kick(), 0.22, 0, 0);
  if (b > 0 && !build) for (const bt of [1, 3]) add(t0 + bt * BEAT, snare(35), 0.08, 0.1, 0.2);
  for (let k = 0; k < 8; k++) add(t0 + k * BEAT / 2, shaker(), k % 2 ? 0.07 : 0.035, 0.4, 0.05);
  if (!build) for (const [bt, m, d] of MEL[b]) add(t0 + bt * BEAT, bell(m + 12 * 0, d ? 2.0 : 1.4), 0.2, 0.15, 0.45);
  else {
    const up = [67, 69, 71, 72, 74, 76, 77, 79, 81, 83, 84, 86, 88, 89, 91, 93];
    up.forEach((m, k) => add(t0 + k * BEAT / 4, marimba(m), 0.15 + k * 0.012, -0.3 + k * 0.04, 0.4));
    for (let k = 0; k < 32; k++) add(t0 + k * BEAT / 8, snare(45), 0.015 + 0.0045 * k, 0, 0.15);
  }
}
// gran final
const TADA = 12.33;
add(TADA, kick(), 0.32, 0, 0); add(TADA, crash(), 0.12, 0, 0.4);
strum(TADA, [60, 64, 67, 72, 76], true, 0.3);
add(TADA, bass(36, 2.5), 0.45, 0, 0.1);
[84, 88, 91, 96, 100].forEach((m, k) => add(TADA + 0.06 + k * 0.07, bell(m, 2.2), 0.13, -0.4 + k * 0.2, 0.6));
add(TADA + 0.2, pad([60, 64, 67, 72], 4.8), 0.13, 0, 0.6);
// letras del título: tic suave por letra
for (let i = 0; i < 25; i++) { const pent = [72, 74, 76, 79, 81, 84, 86, 88]; add(12.6 + i * 0.05, marimba(pent[(i * 3) % 8], 0.35), 0.07, ((i % 5) - 2) * 0.2, 0.3); }
// remate melódico
[[13.85, 79], [14.1, 81], [14.35, 84]].forEach(([t, m], k) => { add(t, bell(m, k === 2 ? 2.5 : 1.2), 0.2, 0, 0.5); add(t, marimba(m - 12), 0.12, 0, 0.3); });
strum(14.35, [60, 64, 67, 72], true, 0.18);
add(14.35, bass(36, 2.2), 0.3, 0, 0.1);
add(14.6, pad([60, 64, 67, 71, 74], 2.6), 0.08, 0, 0.6);

// ---------------------------------------------------------------- efectos
function trainX(t) {
  if (t < 5.0) { const p = Math.max(0, Math.min(1, (t - 1.8) / 3.2)); return 635 + 1665 * Math.pow(1 - p, 2.2); }
  if (t < 7.95) return 635; const d = t - 7.95; return 635 - 550 * d * d;
}
// chuf-chuf
{ let dist = 0, next = 0; for (let t = 1.8; t < 10.6; t += 1 / 200) { const v = Math.abs(trainX(t + 0.0025) - trainX(t - 0.0025)) / 0.005; dist += v / 200; if (dist >= next && v > 40) { const g = Math.min(1, v / 900) * (t > 9.4 ? Math.max(0, 1 - (t - 9.4) / 1.2) : 1); add(t, lp(gen(0.16, tt => noise() * Math.exp(-tt * 22)), 0.12), 0.35 * g, 0.5, 0.15); next += 210; } } }
// freno / vapor
add(4.1, hp(gen(1.4, t => noise() * Math.min(1, t / 0.2) * Math.min(1, (1.4 - t) / 0.6))), 0.035, 0.4, 0.3);
add(7.6, hp(gen(1.2, t => noise() * Math.min(1, t / 0.1) * Math.exp(-t * 2))), 0.04, 0.3, 0.3);
// silbato
add(7.7, gen(0.9, t => { const env = Math.min(1, t / 0.08) * Math.min(1, (0.9 - t) / 0.25); const vib = 1 + 0.006 * Math.sin(2 * Math.PI * 6 * t); let s = 0; for (const f of [740, 932, 1109]) s += Math.sin(2 * Math.PI * f * vib * t); return env * (s / 3 + 0.15 * noise()); }), 0.09, 0.3, 0.5);
// puerta + brillo del meeple
add(5.15, gen(0.25, t => Math.sin(2 * Math.PI * (300 - 400 * t) * t) * Math.exp(-t * 12)), 0.1, 0.4, 0.2);
[96, 100, 103, 108].forEach((m, k) => add(5.8 + k * 0.055, bell(m, 1.0), 0.09, 0.4, 0.6));
// saltitos "boing"
for (const [t, f0] of [[6.4, 380], [6.95, 420]]) { let ph = 0; add(t, gen(0.2, tt => { ph += 2 * Math.PI * (f0 + 900 * tt) / SR; return Math.sin(ph) * Math.exp(-tt * 14); }), 0.13, 0.35, 0.2); }
add(7.4, gen(0.15, t => Math.sin(2 * Math.PI * 160 * t) * Math.exp(-t * 25)), 0.25, 0.35, 0.1);
// sorpresa de la niña
[[4.85, 88], [5.92, 91], [8.85, 84], [8.93, 91]].forEach(([t, m]) => add(t, marimba(m, 0.4), 0.12, -0.3, 0.3));
// whoosh del zoom
{ let y = 0; add(9.5, gen(2.9, t => { const p = t / 2.9; const a = 0.01 + 0.25 * p * p; y += a * (noise() - y); return y * p * p * Math.min(1, (2.9 - t) / 0.05) * 2.2; }), 0.22, 0, 0.3); }

// ---------------------------------------------------------------- reverb + master
function reverb(inp) {
  const out = new Float32Array(N), combs = [1557, 1617, 1491, 1422, 1277, 1356];
  for (const D of combs) { const b = new Float32Array(D); let i = 0, f = 0; for (let n = 0; n < N; n++) { const y = b[i]; f = y * 0.7 + f * 0.3; b[i] = inp[n] + f * 0.8; out[n] += y / combs.length; i = (i + 1) % D; } }
  for (const D of [225, 556, 441]) { const b = new Float32Array(D); let i = 0; for (let n = 0; n < N; n++) { const bv = b[i], x = out[n]; const y = -x + bv; b[i] = x + bv * 0.5; out[n] = y; i = (i + 1) % D; } }
  return out;
}
const wl = reverb(RL), wr = reverb(RR);
const outL = new Float32Array(N), outR = new Float32Array(N);
let peak = 0;
for (let n = 0; n < N; n++) { const t = n / SR; const fade = Math.min(1, (17.25 - t) / 0.7) ; const g = Math.max(0, fade); outL[n] = (L[n] + wl[n] * 0.9) * g; outR[n] = (R[n] + wr[n] * 0.9) * g; peak = Math.max(peak, Math.abs(outL[n]), Math.abs(outR[n])); }
const norm = 0.85 / peak;
const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
for (let n = 0; n < N; n++) { buf.writeInt16LE(Math.round(Math.tanh(outL[n] * norm * 1.1) * 32000), 44 + n * 4); buf.writeInt16LE(Math.round(Math.tanh(outR[n] * norm * 1.1) * 32000), 46 + n * 4); }
fs.writeFileSync(__dirname + '/music.wav', buf);
console.log('peak', peak.toFixed(3), 'ok');
