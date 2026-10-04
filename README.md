# Desks & Dungeons · La Taberna

Una taberna pixel-art isométrica, en plan red social, para quedar y charlar con tus amigos en tiempo real, y bajar juntos a mazmorras aleatorias a por botín.

- **Siete clases y multiclase**: guerrero, mago, explorador, pícaro, paladín, brujo y clérigo. Puedes sumar una segunda clase: usas sus armas y armaduras y aprendes sus habilidades (más tarde, en los niveles 3, 6, 10 y 15).
- **Siete características**: Fuerza, Destreza, Constitución, Vitalidad, Resistencia, Carisma y Suerte. Al subir de nivel aparece un **icono rojo** bajo tu retrato: púlsalo para repartir los 5 puntos que ganas.
- **Equipo que se ve**: arma, mano izquierda (escudo u orbe), cabeza, pecho, manos, pies, amuleto y anillo. Lo que llevas cambia el aspecto de tu héroe (yelmos, capuchas, cotas, corazas, espadas, arcos, bastones…). Pestaña 🎒 Equipo con mochila de 36 huecos y comparación con lo que llevas puesto.
- **Botín en cuatro rarezas**: común (50 % por enemigo), raro (20 %), épico (5 %) y legendario (1 %). Cuanto más rara, más poder y más propiedades. La Suerte y los bufos de hallazgo mejoran las probabilidades.
- **Jefes y conjuntos de clase**: cada mazmorra acaba en un jefe (Grubnak el Rey Goblin, Gorthak, Malakar el Liche, Arakhna la Reina Araña, Ignaroth el Dragón Rojo) que suelta piezas de conjunto de varias clases, con bonificaciones a 2 y 4 piezas.
- **Mazmorras aleatorias con nivel**: eliges el tema (cuevas goblin, cripta, fortaleza orca, nido de bestias o guarida del dragón) y el nivel, desde 1 hasta tu nivel + 3. Los monstruos escalan con el nivel. Tus amigos se unen desde la lista de partidas abiertas.
- **Combate en tiempo real** con el movimiento llevado por el servidor (suave y sin tirones): clic para andar, clic en un enemigo para atacarlo sin parar, WASD, habilidades con energía y tiempo de espera, pociones y pergaminos. Los proyectiles enemigos van a la casilla donde estabas: si te mueves, los esquivas. Los jefes marcan en el suelo sus golpes antes de darlos.
- **Comerciantes en la taberna**: Madre Zarza, la bruja (pociones y brebajes), el Maestro Takeshi, mercader de Oriente (armas y armaduras para tu nivel, renovadas cada 10 minutos) y el Hombre de la Túnica (pergaminos y bendiciones de 20 minutos). Todos compran lo que encuentres.
- **Comercio entre jugadores**: cada uno pone objetos y oro y, cuando los dos aceptan, se intercambian.
- **Mundo abierto** (🗺️) con pueblo, bosques, campamentos y cinco cuevas que llevan a mazmorras de cada tema, cada vez más difíciles.
- **Ambiente**: taberna de noche con ventanas góticas, lluvia y relámpagos, iluminada por antorchas, chimenea, candelabros y lámparas; mazmorras con paletas apagadas, muros en perspectiva, decorado por tema, luces de colores, ascuas y niebla de guerra.
- **Editor de la taberna** para el dueño de la sala, con chimeneas, candelabros, lámparas, cofres, armeros y calderos nuevos.
- Charla con bocadillos, la Crónica, gestos, dados (`/d20`, `/dado 6`), jarras y rondas. Salas privadas con `?sala=nombre`.

## Jugar en tu ordenador

Necesitas [Node.js](https://nodejs.org) 18 o más reciente.

```bash
npm install
npm start
```

Abre http://localhost:3000. En tu misma red wifi, tus amigos pueden entrar con la IP de tu ordenador, por ejemplo `http://192.168.1.20:3000`.

## Jugar con amigos por internet

El juego es un único servidor Node (HTTP + WebSocket):

- **Render / Railway / Fly.io**: crea un servicio web desde este repositorio con el comando de arranque `npm start`. El puerto se lee de la variable `PORT`.
- **Rápido y temporal desde tu PC**: con `npm start` en marcha, ejecuta `npx cloudflared tunnel --url http://localhost:3000` y comparte la URL que te dé.

## Controles en las mazmorras

| Tecla | Qué hace |
| --- | --- |
| Clic en el suelo (o mantener) | Andar |
| Clic en un enemigo | Atacarlo sin parar |
| WASD / flechas | Moverse |
| 1-8 | Habilidades (apuntan al enemigo bajo el ratón o al más cercano) |
| Q (Mayús+Q) | Poción de vida (la grande) |
| E · R · T | Energía · brebaje de trol · elixir |
| Z · X · C · V | Pergaminos: fuego, relámpago, sanación, retorno |
| M · I | Mapa · equipo |

## Comandos del chat

| Comando | Qué hace |
| --- | --- |
| `/d20`, `/d6`, `/dado 12` | Tira un dado y todos ven el resultado |
| `/me acción` | Narra una acción |
| `/nombre Nuevo` | Cambia tu nombre |
| `/ayuda` | Muestra la ayuda |

## Estructura

- `server.js`: servidor HTTP y WebSocket: salas, perfiles (personaje, puntos, equipo, mochila, consumibles, bufos), tiendas, comercio, editor de la taberna y partidas.
- `server/dungeon.js`: una partida en marcha: movimiento de los héroes, IA de los monstruos, proyectiles, ataques especiales de los jefes, habilidades y botín.
- `server/gen.js`: generador de mazmorras aleatorias (salas, pasillos, decorado por tema, enemigos del nivel, cofres, trampas y sala del jefe).
- `server/world.js`: generador del mundo abierto (uno por sala).
- `server/store.js`: guarda salas y perfiles en `data/*.json` (cambia la carpeta con `DATA_DIR`).
- `public/rules/engine.js`: las reglas del juego, compartidas por servidor y navegador: características, clases, habilidades, experiencia, objetos y rarezas, conjuntos, botín, monstruos, temas, consumibles, bufos y tiendas.
- `public/game.js`: la taberna (dibujo, comerciantes, muebles, luces, interfaz y red) y la pantalla de entrada.
- `public/ui.js`: ventanas: retrato con el icono de subida de nivel, reparto de puntos, ficha, equipo, tiendas, comercio, guía y tooltips.
- `public/dungeon.js`: menú de mazmorras y partida (dibujo, luces, efectos, barra de habilidades, controles).
- `public/sprites.js`: pixel art de héroes (con su equipo), comerciantes y enemigos.
- `public/dsprites.js`: pixel art de las mazmorras: suelos y muros por tema, decorado, botín e iconos de objetos.
- `public/map.js`: mapa y muebles de la taberna, puestos de los comerciantes y aspecto de clases y razas.
- `public/dungeon-data.js`: casillas de mazmorras y mundo.
- `test/smoke.js`: prueba automática (`npm test`); `scripts/lint.js`: comprueba la sintaxis (`npm run lint`).
- `.claude/`: prepara las sesiones de Claude Code en la nube.

Los perfiles (personaje, experiencia, oro, equipo y mochila) y los muebles se guardan en `data/`. Las mazmorras se generan al entrar y desaparecen unos minutos después de quedarse vacías. El chat vive en la memoria del servidor.
