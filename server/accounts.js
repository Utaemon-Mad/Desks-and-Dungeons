'use strict';
// Copias de seguridad firmadas de las cuentas y usuario/contraseña (llave cifrada, scrypt, límite de intentos).
// Lo usa server.js: recibe lo que necesita del servidor y devuelve sus funciones.
module.exports = function (ctx) {
  const { crypto, store, zlib } = ctx;

  const SAVE_SECRET = process.env.SAVE_SECRET || 'desks-and-dungeons:copia-de-seguridad';
  const backupSig = (pid, d) => crypto.createHmac('sha256', SAVE_SECRET).update(pid + '.' + d).digest('base64url');
  function makeBackup(pid) {
    const a = store.player(pid);
    if (!a) return null;
    const d = zlib.gzipSync(JSON.stringify(a)).toString('base64');
    return { pid, d, sig: backupSig(pid, d) };
  }
  // Sólo se restaura si el servidor no tiene esa cuenta (nunca pisa datos más nuevos)
  function restoreBackup(pid, b) {
    if (!pid || store.player(pid) || !b || typeof b !== 'object' || b.pid !== pid || typeof b.d !== 'string' || typeof b.sig !== 'string' || b.d.length > 240000) return false;
    const want = Buffer.from(backupSig(pid, b.d)), got = Buffer.from(b.sig);
    if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return false;
    let a;
    try { a = JSON.parse(zlib.gunzipSync(Buffer.from(b.d, 'base64')).toString()); } catch { return false; }
    if (!a || !Array.isArray(a.slots)) return false;
    store.setPlayer(pid, a);
    if (a.login && a.login.user) indexLogin(a.login.user, pid);
    console.log('Cuenta restaurada desde la copia del navegador');
    return true;
  }

  // ---------- Usuario y contraseña ----------
  // La cuenta sigue siendo la «llave» (token) del navegador. Al poner usuario y contraseña, la llave se guarda
  // cifrada en la propia cuenta; al entrar desde otro dispositivo con la contraseña, el servidor se la devuelve.
  const AUTH_KEY = crypto.createHash('sha256').update('dd-auth:' + SAVE_SECRET).digest();
  function sealToken(t) {
    const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', AUTH_KEY, iv);
    const enc = Buffer.concat([c.update(t, 'utf8'), c.final()]);
    return Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
  }
  function openToken(s) {
    try {
      const b = Buffer.from(s, 'base64'), d = crypto.createDecipheriv('aes-256-gcm', AUTH_KEY, b.subarray(0, 12));
      d.setAuthTag(b.subarray(12, 28));
      return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
    } catch { return null; }
  }
  const passHash = (pass, salt) => crypto.scryptSync(pass, salt, 32, { N: 16384, r: 8, p: 1 }).toString('hex');
  const cleanUser = (u) => (typeof u === 'string' ? u.trim().toLowerCase() : '');
  const USER_RE = /^[a-z0-9ñ_.-]{3,20}$/;
  const loginFails = new Map(); // usuario -> { n, until }
  function indexLogin(user, pid) {
    const ix = store.meta('logins') || {};
    if (ix[user] !== pid) { ix[user] = pid; store.setMeta('logins', ix); }
  }
  // al arrancar, el índice se rehace con las cuentas guardadas
  for (const [pid, a] of Object.entries(store.players())) if (a && a.login && a.login.user) indexLogin(a.login.user, pid);

  return { USER_RE, cleanUser, indexLogin, loginFails, makeBackup, openToken, passHash, restoreBackup, sealToken };
};
