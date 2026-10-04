# Desks & Dungeons · La Taberna

Una taberna pixel-art isométrica, en plan red social, para quedar y charlar con tus amigos en tiempo real.

- **Reglas de D&D 5.ª edición (revisión de 2024, SRD 5.2)**: 12 clases, 9 especies con sus linajes, 4 trasfondos, dotes, 38 armas, 13 armaduras, 338 conjuros, 341 monstruos y 243 objetos mágicos del System Reference Document 5.2 (licencia CC-BY-4.0).
- **Ficha de personaje**: asistente en 8 pasos (clase, especie, trasfondo, características con serie estándar / compra de 27 puntos / 4d6, habilidades, equipo, conjuros y detalles) que valida las reglas y calcula CA, PG, iniciativa, salvaciones, habilidades, ataques, CD de conjuros y espacios. Al entrar puedes empezar con un personaje pregenerado de cualquier clase y especie.
- **Manual** (📖): todas las reglas navegables con buscador y filtros (conjuros por nivel/clase/escuela, monstruos por tipo/VD, objetos por rareza) y un resumen en español de las reglas básicas.
- **Combate 5e en tiempo real**: tiradas d20 + bonificador contra la CA, críticos con 20 natural, daño con los dados del arma o del conjuro, salvaciones de los monstruos contra tu CD, áreas (esfera, cono, línea), espacios de conjuro, Furia, Tomar aliento, Ataque furtivo, Imposición de manos, Arma de aliento… y los bloques de estadísticas oficiales de los monstruos. Cada tirada aparece en el registro.
- **Mundo abierto** (🗺️): un mapa de 80×56 generado para cada sala con pueblo, bosques, lagos, montañas y caminos; campamento goblin, fuerte orco, cementerio de no muertos, guarida de lobos, nido de arañas, bandidos, un osolechuza y la guarida de un dragón rojo joven. Las cuevas llevan a las mazmorras y los enemigos reaparecen al cabo de unos minutos.
- **Ambiente de noche**: ventanas góticas a un exterior con lluvia, luna y árboles muertos; relámpagos con trueno de vez en cuando y unos ojos rojos que a veces se asoman. Dentro sólo alumbran las antorchas y las velas.
- Personajes y monstruos en **pixel art**, con rasgos de especie (orejas, barba, colmillos, cuernos, escamas, altura).
- **Editor de la taberna**: quien abre una sala nueva es su dueño y, con 🔨 Editar, coloca, gira y quita muebles.
- **Mazmorras y su editor** (🗝️): pinta muros, suelo, puertas, pinchos y agua, y coloca entrada, salida, cofres, pociones y 30 tipos de enemigos (goblinoides, orcos y gigantes, no muertos, bestias, humanoides y un dragón).
- **Experiencia y oro**: los monstruos dan su experiencia oficial (repartida entre el grupo) y sueltan oro; los cofres y la salida dan premio. Se sube de nivel con la tabla oficial (300, 900, 2700… PX). Al volver a la taberna haces un descanso largo; si caes, vuelves y pierdes el 10 % del oro.
- Charla con bocadillos, la **Crónica**, gestos, dados (`/d20`, `/dado 6`), jarras y rondas.
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

## Cómo se aplican las reglas en el juego

El combate es en tiempo real: en lugar de turnos, cada acción tiene un tiempo de espera de unos 1,3 segundos (los monstruos atacan cada 1,6 s). Lo demás sigue el SRD: d20 + bonificador contra la CA, 20 natural crítico (dados dobles) y 1 natural fallo, desventaja a distancia larga o con un enemigo al lado, salvaciones contra tu CD (8 + competencia + modificador), resistencias e inmunidades de los monstruos.

Simplificaciones:
- Unos 40 conjuros de ataque, salvación y curación se pueden lanzar en combate (marcados con ⚔); el resto están en la ficha y el manual como referencia. Se lanzan al nivel mínimo y las áreas sólo dañan a los enemigos.
- Las maestrías de armas y muchos rasgos de clase se muestran en la ficha pero no tienen efecto en el combate. Sí funcionan: Furia, Tomar aliento, Ataque furtivo, Imposición de manos, Arma de aliento dracónida, Aguante incansable (orco) y Suerte (mediano).
- En los niveles 4, 8, 12, 16 y 19 la mejora de característica se aplica sola a la característica principal.
- Con 0 PG no hay salvaciones contra la muerte: vuelves a la taberna y pierdes el 10 % del oro.
- Los orcos, el jefe de guerra orco y el nigromante no están en el SRD 5.2; sus estadísticas son propias del juego.
- Las descripciones largas de conjuros, monstruos y rasgos están en el inglés original del SRD; los nombres de reglas, clases, especies, armas y unos 150 conjuros están en español.

## Actualizar los datos de reglas

```bash
git clone --depth 1 https://github.com/5e-bits/5e-srd-api /tmp/5e-srd-api
node scripts/build-srd.js /tmp/5e-srd-api/packages/5e-database/src/2024/en
```

## Licencia del contenido de reglas

Este juego incluye material del System Reference Document 5.2 («SRD 5.2») de Wizards of the Coast LLC, disponible en https://www.dndbeyond.com/srd, con licencia Creative Commons Attribution 4.0 International. Detalles en `public/rules/LICENSE-SRD.md`. Desks & Dungeons no está afiliado ni respaldado por Wizards of the Coast.

## Estructura

- `server.js`: servidor HTTP estático y WebSocket (salas, chat, editor, mazmorras, experiencia y oro).
- `server/store.js`: guarda salas, mazmorras y perfiles en `data/*.json` (cambia la carpeta con `DATA_DIR`).
- `server/dungeon.js`: partidas en mazmorra y mundo abierto: combate con reglas 5e, IA de los monstruos y botín.
- `server/world.js`: generador del mundo abierto (uno por sala).
- `public/rules/engine.js`: motor de reglas (validación y cálculo de fichas, dados, conjuros de combate, monstruos); lo usan servidor y navegador.
- `public/rules/*.json`: datos del SRD 5.2 generados por `scripts/build-srd.js` (con nombres en español de `scripts/srd-es.js`).
- `public/sheet.js` y `public/manual.js`: ficha de personaje y manual.
- `public/map.js`: mapa y muebles de la taberna, aspecto de clases y especies, y búsqueda de rutas.
- `public/dungeon-data.js`: casillas, enemigos del juego (y los tres propios), recompensas y validación de mazmorras.
- `public/sprites.js`: generador de pixel art para héroes, enemigos y casillas.
- `public/game.js`: la taberna: dibujo, personajes, editor de muebles, interfaz y red.
- `public/dungeon.js`: lista de mazmorras, partida (barra de acciones, registro de tiradas, minimapa) y editor.
- `test/smoke.js`: prueba automática (`npm test`).
- `scripts/lint.js`: comprueba la sintaxis de todos los `.js` (`npm run lint`).
- `.claude/`: prepara las sesiones de Claude Code en la nube (instala dependencias al arrancar).

Las mazmorras, los muebles y los perfiles (ficha, experiencia y oro) se guardan en `data/`. El chat no se guarda: vive en la memoria del servidor.
