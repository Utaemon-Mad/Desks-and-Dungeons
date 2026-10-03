# Desks & Dungeons · La Taberna

Una taberna pixel-art isométrica, en plan red social, para quedar y charlar con tus amigos en tiempo real.

- Crea tu héroe (Guerrero, Maga, Elfo, Pícaro, Bardo o Clérigo) y elige piel y pelo.
- Haz clic en el suelo para caminar, o en una silla, un taburete o el sofá para sentarte (también con WASD / flechas).
- Habla con bocadillos encima de tu personaje; todo queda en la **Crónica** (y quien entra después ve los últimos mensajes).
- Gestos (saludar, bailar, brindar…), tirar dados (`/d20`, `/dado 6`), pedir una jarra al tabernero.
- **Muro de letras**: escribe algo con `/muro HOLA` (o haciendo clic en el muro) y las luces lo deletrean letra a letra para todos.
- Panel de héroes con HP/ATT y oro: ganas oro hablando y lo gastas invitando a rondas a tus amigos.
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
| `/d20`, `/d6`, `/dado 12` | Tira un dado (un 20 natural en d20 da +20 de oro) |
| `/muro TEXTO` | Deletrea el texto en el muro de luces |
| `/me acción` | Narra una acción (`/me pide otra ronda`) |
| `/nombre Nuevo` | Cambia tu nombre |
| `/ayuda` | Muestra la ayuda |

## Estructura

- `server.js`: servidor HTTP estático y WebSocket (salas, chat, validación de movimientos, límite de mensajes).
- `public/map.js`: mapa de la taberna, clases y búsqueda de rutas; lo usan tanto el servidor como el navegador.
- `public/game.js`: dibujo de la sala en canvas, personajes, animaciones, interfaz y red.
- `test/smoke.js`: prueba automática (`npm test`).

No se guarda nada en disco: las salas y su historial viven en la memoria del servidor.
