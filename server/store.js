// Almacén muy simple en ficheros JSON: salas (muebles y dueño), mazmorras y perfiles de jugador.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

function hash(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex');
}

function createStore(dir = DATA_DIR) {
  fs.mkdirSync(dir, { recursive: true });
  const files = { rooms: 'rooms.json', dungeons: 'dungeons.json', players: 'players.json', meta: 'meta.json' };
  const data = {};
  const timers = {};

  for (const [name, file] of Object.entries(files)) {
    try { data[name] = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')); }
    catch { data[name] = {}; }
  }

  // Guarda con un pequeño retraso para agrupar muchos cambios seguidos
  function save(name) {
    clearTimeout(timers[name]);
    timers[name] = setTimeout(() => flush(name), 400);
  }

  function flush(name) {
    clearTimeout(timers[name]);
    const file = path.join(dir, files[name]);
    const tmp = file + '.tmp';
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(tmp, JSON.stringify(data[name]));
      fs.renameSync(tmp, file);
    } catch (err) {
      // Un fallo de disco no debe tumbar la taberna: se reintenta en el siguiente cambio
      console.error(`No se pudo guardar ${files[name]}:`, err.message);
    }
  }

  return {
    hash,
    room(name) { return data.rooms[name] || null; },
    setRoom(name, value) { data.rooms[name] = value; save('rooms'); },
    dungeons() { return data.dungeons; },
    dungeon(id) { return data.dungeons[id] || null; },
    setDungeon(id, value) { data.dungeons[id] = value; save('dungeons'); },
    deleteDungeon(id) { delete data.dungeons[id]; save('dungeons'); },
    player(id) { return data.players[id] || null; },
    setPlayer(id, value) { data.players[id] = value; save('players'); },
    meta(key) { return data.meta[key] || null; },
    setMeta(key, value) { data.meta[key] = value; save('meta'); },
    flushAll() { for (const name of Object.keys(files)) flush(name); },
  };
}

module.exports = { createStore, hash };
