# Desks & Dungeons · La Taberna

Una taberna pixel-art isométrica, en plan red social, para quedar y charlar con tus amigos en tiempo real.

- Crea tu héroe (Guerrero, Maga, Elfo, Pícaro, Bardo o Clérigo) y elige piel y pelo.
- Haz clic en el suelo para caminar, o en una silla, un taburete o el sofá para sentarte (también con WASD / flechas).
- Habla con bocadillos encima de tu personaje; todo queda en la **Crónica** (y quien entra después ve los últimos mensajes).
- Gestos (saludar, bailar, brindar…), tirar dados (`/d20`, `/dado 6`), pedir una jarra al tabernero.
- **Ambiente de noche**: ventanas góticas a un exterior con lluvia, luna y árboles muertos; relámpagos con trueno de vez en cuando y unos ojos rojos que a veces se asoman. Dentro sólo alumbran las antorchas y las velas.
- Personajes en **pixel art**, con animaciones de andar, sentarse y gestos.
- **Editor de la taberna**: quien abre una sala nueva es su dueño y, con el botón 🔨 Editar, puede colocar, girar y quitar barriles, mesas, sillas, sofás, estanterías, plantas…
- **Mazmorras** (🗝️): bajad juntos a combatir contra **goblins** (goblin, chamán), **orcos** (orco, jefe orco) y **no muertos** (esqueleto, zombi, nigromante que invoca esqueletos). Se ataca chocando contra el enemigo.
- **Editor de mazmorras**: pinta muros, suelo, puertas, pinchos y agua, y coloca entrada, salida, cofres, pociones y enemigos. Las mazmorras de otros se pueden copiar.
- **Experiencia y oro**: cada enemigo da experiencia y suelta monedas; los cofres dan oro y experiencia; llegar a la salida da un premio. Al subir de nivel ganas vida y ataque. Si caes, vuelves a la taberna y pierdes el 10 % del oro. El progreso se guarda en el servidor y se recupera al volver desde el mismo navegador.
- Salas privadas: comparte el nombre de la sala o el enlace `?sala=nombre` (Menú → Copiar enlace).

## Jugar en tu ordenador

Necesitas [Node.js](https://nodejs.org) 18 o más reciente.

```bash
npm install
npm start
```

Abre http://localhost:3000. Para probarlo con varias personas en tu misma red wifi, tus amigos pueden entrar con la IP de tu ordenador, por ejemplo `http://192.168.1.20:3000`.

## Jugar con amigos por internet

El juego es un único servidor Node (HTTP + WebSocket), así que se puede publicar en cualquier servicio que ejecute Node:

- **Render / Railway / Fly.io**: crea un servicio web desde este repositorio con el comando de arranque `npm start`. El puerto se lee de la variable `PORT`.
- **Rápido y temporal desde tu PC**: con `npm start` en marcha, ejecuta `npx cloudflared tunnel --url http://localhost:3000` (o `ngrok http 3000`) y comparte la URL que te dé.

## Comandos del chat

| Comando | Qué hace |
| --- | --- |
| `/d20`, `/d6`, `/dado 12` | Tira un dado y todos ven el resultado |
| `/me acción` | Narra una acción (`/me pide otra ronda`) |
| `/nombre Nuevo` | Cambia tu nombre |
| `/ayuda` | Muestra la ayuda |

## Recompensas

| Enemigo | Familia | Vida | Ataque | Experiencia | Oro |
| --- | --- | --- | --- | --- | --- |
| Goblin | Goblins | 6 | 2 | 10 | 2–6 |
| Chamán goblin | Goblins | 8 | 3 | 18 | 5–10 |
| Orco | Orcos | 16 | 4 | 25 | 6–14 |
| Jefe orco | Orcos | 40 | 7 | 100 | 40–70 |
| Esqueleto | No muertos | 10 | 3 | 15 | 3–8 |
| Zombi | No muertos | 14 | 3 | 18 | 2–7 |
| Nigromante | No muertos | 30 | 6 | 90 | 35–60 |

Cofre: 15–35 de oro y 15 de experiencia. Salida: 25 de oro y 40 de experiencia. Para llegar al nivel *n* hacen falta 50·*n*·(*n*−1) puntos de experiencia (nivel 2 con 100, nivel 3 con 300…).

## Estructura

- `server.js`: servidor HTTP estático y WebSocket (salas, chat, editor, mazmorras, experiencia y oro).
- `server/store.js`: guarda salas, mazmorras y perfiles en `data/*.json` (cambia la carpeta con `DATA_DIR`).
- `server/dungeon.js`: partidas en mazmorra: IA de los enemigos, combate y botín.
- `public/map.js`: mapa y muebles de la taberna, clases, niveles y búsqueda de rutas (servidor y navegador).
- `public/dungeon-data.js`: casillas, enemigos, recompensas y validación de mazmorras (servidor y navegador).
- `public/sprites.js`: generador de pixel art para héroes, enemigos y casillas.
- `public/game.js`: la taberna: dibujo, personajes, editor de muebles, interfaz y red.
- `public/dungeon.js`: lista de mazmorras, partida y editor.
- `test/smoke.js`: prueba automática (`npm test`).
- `scripts/lint.js`: comprueba la sintaxis de todos los `.js` (`npm run lint`).
- `.claude/`: prepara las sesiones de Claude Code en la nube (instala dependencias al arrancar).

Las mazmorras, los muebles y los perfiles se guardan en `data/`. El chat no se guarda: vive en la memoria del servidor.
