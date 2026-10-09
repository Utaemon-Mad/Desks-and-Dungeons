# Desks & Dungeons · La Taberna

Una taberna en 3D low-poly (Three.js, luz de velas y sombras suaves), en plan red social, para quedar y charlar con tus amigos en tiempo real, y bajar juntos a mazmorras aleatorias a por botín.

- **Pantalla de inicio**: «Pulsa cualquier tecla» y un menú con tres opciones:
  - **Nuevo personaje**: tres casillas por navegador. Creas un héroe en una casilla libre, juegas con uno que ya tengas o lo borras. El juego recuerda tus personajes, así que no hay que crearlos cada vez.
  - **Continuar**: vuelves con el último personaje, al último servidor y al sitio donde lo dejaste (la taberna, un punto del mundo abierto o la mazmorra, si sigue abierta).
  - **Elegir servidor**: hay tres (de serie, Lejano, Humbrio y Sangriento), cada uno con su taberna, su mundo y sus partidas. Tus personajes sirven en los tres. El dueño de un servidor (quien entró primero; si aún no tiene, quien le cambie el nombre) ve el botón ✏️ Nombre para renombrarlo.
  Se maneja con el ratón, con el dedo o con las flechas, Intro y Esc. Desde el ☰ Menú del juego puedes volver a la pantalla de inicio.
- **Zoom del juego**: Ctrl + rueda, la rueda sobre la escena, el pellizco (panel táctil o iPad) y Ctrl + / Ctrl − / Ctrl 0 acercan o alejan la cámara. La interfaz (barra de acciones, ventanas y menús) no cambia de tamaño. Con la cámara cerca, sigue a tu héroe.
- **Pantalla completa**: botón ⛶ en la pantalla de inicio y en el ☰ Menú. En el iPad, si Safari no la permite, «Compartir → Añadir a pantalla de inicio» instala el juego y se abre a pantalla completa, sin barras del navegador.
- **Siete clases**: guerrero, mago, explorador, pícaro, paladín, brujo y clérigo. Ya no hay segunda clase: lo que un personaje antiguo solo podía llevar gracias a ella pasa a su mochila.
- **Siete características**: Fuerza, Destreza, Constitución, Vitalidad, Resistencia, Carisma y Suerte. Al subir de nivel aparece un **icono rojo** bajo tu retrato: púlsalo para repartir los 5 puntos que ganas.
- **Equipo que se ve**: arma, mano izquierda (escudo u orbe), cabeza, pecho, manos, pies, amuleto y anillo. Lo que llevas cambia el aspecto de tu héroe (yelmos, capuchas, cotas, corazas, espadas, arcos, bastones…). Pestaña 🎒 Equipo con mochila de 36 huecos y comparación con lo que llevas puesto.
- **Botín en cuatro rarezas**: común (50 % por enemigo), raro (20 %), épico (5 %) y legendario (1 %). Cuanto más rara, más poder y más propiedades. La Suerte y los bufos de hallazgo mejoran las probabilidades.
- **Jefes y conjuntos de clase**: cada mazmorra acaba en un jefe (Grubnak el Rey Goblin, Gorthak, Malakar el Liche, Arakhna la Reina Araña, Ignaroth el Dragón Rojo) que suelta piezas de conjunto de varias clases, con bonificaciones a 2 y 4 piezas.
- **Mazmorras aleatorias con nivel**: eliges el tema (cuevas goblin, cripta, fortaleza orca, nido de bestias o guarida del dragón) y el nivel, desde 1 hasta tu nivel + 3. Los monstruos escalan con el nivel. Tus amigos se unen desde la lista de partidas abiertas.
- **Combate en tiempo real** con el movimiento llevado por el servidor (suave y sin tirones): clic para andar, clic en un enemigo para atacarlo sin parar, WASD, habilidades con energía y tiempo de espera, pociones y pergaminos. Los proyectiles enemigos van a la casilla donde estabas: si te mueves, los esquivas. Los jefes marcan en el suelo sus golpes antes de darlos.
- **Comerciantes en la taberna**: Madre Zarza, la bruja (pociones y brebajes), el Maestro Takeshi, mercader de Oriente (armas y armaduras para tu nivel, renovadas cada 10 minutos) y el Hombre de la Túnica (pergaminos y bendiciones de 20 minutos). Todos compran lo que encuentres.
- **Comercio entre jugadores**: cada uno pone objetos y oro y, cuando los dos aceptan, se intercambian.
- **Gráficos 3D** (Three.js r160): personajes animados de verdad (packs KayKit, CC0) con 35 animaciones (andar, correr, atacar según el arma, lanzar hechizos, esquivar, morir, sentarse, brindar); piel, pelo y ropa recoloreados según tu héroe, con casco, capa y armas del equipo. Mazmorras con losas, muros de sillería, antorchas, estandartes, ataúdes y cofres; taberna con mesas, sillas y barriles; mundo con casas, pinos, montañas y rocas. Lobos, zorros, perros, caballos y venados animados (Quaternius, CC0) para mascotas, monturas y bestias. Posprocesado: resplandor de luces y magia, oclusión ambiental, gradación de color por zona, viñeta y efecto maqueta. Pensado para ordenador e iPad (calidad automática alta o media).
- **Botín con características**: al recoger un objeto aparece su carta con todas sus propiedades, para qué clases es y su peso. Las armas siempre son de clases del grupo.
- **Mundo abierto grande** (🗺️, 160×120) en seis regiones cada vez más peligrosas: Valle de Brumaverde (nv 1-3), Bosque Viejo (3-6), Ciénaga (6-10), Yermo Rojo (10-14), Picos Helados (14-19) y Erial de Ceniza (19-26). Si vas sin nivel suficiente, la corrupción te va quitando vida. Campamentos con personajes, **misiones** encadenadas con historia y jefes de región, **piedras de viaje** para moverte rápido y seis cuevas-mazmorra.
- **Mascotas** (desde nivel 5): perro, lobo, zorro, jabalí u osezno en el 🐴 Establo. Te siguen, atacan con daño basado en su Fuerza y cargan equipo (su propia mochila con peso).
- **Monturas** (desde nivel 12): caballo, lobo de guerra, venado o lagarto de las dunas, más rápidos en el mundo abierto (tecla F).
- **Peso**: cada objeto pesa; tu capacidad es 40 kg + 2 por punto de Fuerza. Si vas sobrecargado, andas más lento.
- **El tabernero**: Alfonso el Tabernero sirve las jarras.
- **Forja de Brunilda** (🏛️ Pueblo): mejora objetos hasta +10 con fragmentos de hierro, esencia arcana y polvo de estrella que sueltan los enemigos; encanta una propiedad; combina tres objetos en uno de la rareza siguiente; desguaza lo que sobra.
- **Oficios**: pesca junto al agua del mundo abierto (con su minijuego de «¡pica!»), recoge hierbas de cada región y lleva lo que encuentres a la **cocina de Alfonso**, que prepara platos con bonificaciones de 30 minutos.
- **Tablón de misiones**: tres tareas diarias y dos semanales, iguales para todos.
- **Logros y títulos**: 26 logros con oro y títulos que se ven junto a tu nombre. **Clasificación semanal**: piso más hondo del Descenso, monstruos, jefes, jefes de mundo, duelos y el pez más grande.
- **Jefes de mundo**: cada 20 minutos aparece uno en el mundo abierto durante 10 minutos; todos los que le hacen daño se llevan botín épico o legendario.
- **Mascotas que crecen**: suben hasta el nivel 25 luchando contigo, aprenden una habilidad (aullido, desgarro, finta, embestida, zarpazo) y evolucionan en los niveles 10 y 20.
- **Duelos con apuesta** en la arena del sótano de Alfonso: el ganador se lleva el bote.
- **Mi habitación**: los jefes que derrotas se exponen como trofeos en una sala en 3D con tu héroe, tu mascota y tu arma; puedes visitar la de tus amigos.
- **Descenso infinito**: pisos cada vez más difíciles con un desafío que cambia cada semana (frenesí, marea de élites, cadáveres explosivos, sed de sangre, abstemios, gigantismo).
- **Efectos**: ciclo de día y noche, clima por región (lluvia y tormentas, niebla en la ciénaga, tormentas de arena, nieve, ceniza), partículas, polvo al andar, enemigos que caen al morir, voltereta para esquivar, golpes críticos con congelación de un instante y temblor de cámara. Ajustes de calidad (⚙️ Menú → Gráficos) para móviles.
- **Ambiente**: taberna de noche con ventanas góticas, lluvia y relámpagos, iluminada por antorchas, chimenea, candelabros y lámparas; mazmorras con paletas apagadas, muros en perspectiva, decorado por tema, luces de colores, ascuas y niebla de guerra.
- **Editor de la taberna** para el dueño de la sala, con chimeneas, candelabros, lámparas, cofres, armeros y calderos nuevos.
- Charla con bocadillos, la Crónica, gestos, dados (`/d20`, `/dado 6`), jarras y rondas. El enlace de invitación (☰ Menú) abre directamente tu servidor (`?sala=taberna`, `putiferricida` o `brumaverde`).

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
| M · I | Mapa (en el mundo, mapa grande) · equipo |
| F | Montar / desmontar (mundo abierto) |
| Espacio | Voltereta (esquiva) |
| G | Pescar junto al agua (y tirar cuando pica) |
| Clic en un personaje | Hablar (misiones con ! y ?) |
| Joystick (móvil) | Moverse |

## Comandos del chat

| Comando | Qué hace |
| --- | --- |
| `/d20`, `/d6`, `/dado 12` | Tira un dado y todos ven el resultado |
| `/me acción` | Narra una acción |
| `/nombre Nuevo` | Cambia tu nombre |
| `/ayuda` | Muestra la ayuda |

## Estructura

- `server.js`: servidor HTTP y WebSocket: los tres servidores (salas), cuentas con tres personajes y el sitio donde se dejó cada uno, perfiles (personaje, puntos, equipo, mochila, consumibles, bufos), tiendas, comercio, editor de la taberna y partidas.
- `server/dungeon.js`: una partida en marcha: movimiento de los héroes, IA de los monstruos, proyectiles, ataques especiales de los jefes, habilidades y botín.
- `server/gen.js`: generador de mazmorras aleatorias (salas, pasillos, decorado por tema, enemigos del nivel, cofres, trampas y sala del jefe).
- `server/world.js`: generador del mundo abierto (uno por sala): regiones, campamentos, personajes, caminos, cuevas y piedras de viaje.
- `server/store.js`: guarda salas, perfiles y clasificaciones en `data/*.json` (cambia la carpeta con `DATA_DIR`).
- `public/rules/progress.js`: materiales y forja, pesca, hierbas y cocina, tablón, logros y títulos, jefes de mundo, Descenso infinito, clasificaciones y arena.
- `public/rules/engine.js`: las reglas del juego, compartidas por servidor y navegador: características, clases, habilidades, experiencia, objetos y rarezas, conjuntos, botín, monstruos, temas, consumibles, bufos y tiendas.
- `public/game.js`: la taberna (dibujo, comerciantes, muebles, luces, interfaz y red) y la pantalla de entrada.
- `public/ui2.js`: ventanas del pueblo: forja, cocina, tablón, fama, habitación, duelos, Descenso y ajustes de gráficos.
- `public/ui.js`: ventanas: retrato con el icono de subida de nivel, reparto de puntos, ficha, equipo, tiendas, comercio, guía y tooltips.
- `public/dungeon.js`: menú de mazmorras y partida (render 3D, efectos, barra de habilidades, joystick, controles).
- `public/vendor/three.bundle.min.js`: Three.js r160 con posprocesado y cargador glTF (licencia MIT en `THREE-LICENSE.txt`; entrada en `scripts/three-entry.js`).
- `public/assets/kaykit/`: modelos KayKit de Kay Lousberg (CC0): personajes, animaciones, armas y escenario. Cómo se preparan: `scripts/assets/README.md`.
- `public/assets/quaternius/`: animales animados de Quaternius (CC0): lobo, zorro, perro, caballo y venado, para mascotas, monturas y lobos enemigos.
- `public/models.js`: modelos 3D low-poly de héroes (con su equipo), personajes, enemigos, mascotas, monturas, muebles y decorado.
- `public/view3d.js`: escenas 3D, luces y sombras, construcción de mazmorras y mundo en 3D, niebla y retratos.
- `public/sprites.js`: pixel art de héroes, comerciantes y enemigos (vistas previas del editor).
- `public/dsprites.js`: pixel art de las mazmorras: suelos y muros por tema, decorado, botín e iconos de objetos.
- `public/map.js`: mapa y muebles de la taberna, puestos de los comerciantes y aspecto de clases y razas.
- `public/dungeon-data.js`: casillas de mazmorras y mundo.
- `test/smoke.js`: prueba automática (`npm test`); `scripts/lint.js`: comprueba la sintaxis (`npm run lint`).
- `.claude/`: prepara las sesiones de Claude Code en la nube.

Las cuentas (una por navegador, con hasta tres personajes: experiencia, oro, equipo, mochila y dónde se quedó) y los muebles se guardan en `data/`. Los tres servidores están en `SERVERS` (`public/map.js`): su id no cambia nunca y su nombre de serie se puede cambiar desde el juego (se guarda en `data/meta.json`). Las mazmorras se generan al entrar y desaparecen unos minutos después de quedarse vacías. El chat vive en la memoria del servidor.
