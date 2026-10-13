# Desks & Dungeons

RPG de taberna multijugador en el navegador, todo en español. En producción en https://desks-and-dungeons.onrender.com (se despliega desde `main`).

## Stack
- Servidor: Node ≥18 + `ws` (WebSocket). Sin base de datos: JSON en `data/*.json`.
- Navegador: JavaScript sin compilar (scripts globales cargados en orden desde `public/index.html`) y Three.js r160 en `public/vendor/three.bundle.min.js`.
- Reglas compartidas por servidor y navegador en `public/rules/`.
- Modelos 3D CC0: KayKit (personajes y escenarios) y Quaternius (animales).

## Estructura
```
server.js               servidor HTTP/WebSocket: conexión, perfiles, reparto de mensajes (HANDLERS y el switch que queda) y montaje de módulos
server/handlers/       mensajes del cliente por zonas: char.js (ficha, talentos, equipo), craft.js (tiendas, comercio, forja, cocina), play.js (misiones, tablón, temporada, taberna, mercado, descenso, duelos)
server/progress.js     materiales, tablón, clasificaciones, mascotas, pesca/hierbas y lo que pasa al matar
server/modes.js        duelos, descenso infinito e información de salas
server/trade.js        comercio entre jugadores (trades) y tiendas por jugador
server/web.js           archivos estáticos (gzip, ETag), panel /admin y errores de los navegadores
server/accounts.js      copias de seguridad firmadas y usuario/contraseña
server/social.js        hazañas, mejoras de la taberna, mercado, temporadas, recompensa diaria y Asalto semanal
server/dungeon.js       instancia de mazmorra/mundo/arena: combate, IA, botín, mascotas, puertas
server/turns.js         combate por turnos estilo D&D 5e (se instala en Instance): reloj de juego, iniciativa, turnos, reacciones
server/gen.js           generador de mazmorras (salas, puertas, decorado, antorchas)
server/world.js         mundo abierto y NPC
server/store.js         guardado en data/*.json
public/index.html       página única y orden de carga de los scripts
public/audio.js         sonido y música hechos con WebAudio (SFX.play, SFX.music)
public/icons.js         iconos SVG propios (ICONS.svg, ICONS.skill) para la barra y las habilidades
public/admin.js         novedades, mensaje del día, instalar como app y envío de errores del navegador
public/portada.html     portada de presentación (/portada); guia.pdf es la guía para imprimir
public/rules/engine.js  reglas: stats, razas, clases, habilidades, objetos estilo Diablo 2, afijos, botín, monstruos
public/rules/progress.js forja, misiones, logros, descenso semanal
public/rules/items-data.js tabla de nombre y aspecto de las 192 armaduras y 156 armas/escudos (4 variantes por nivel)
public/rules/monsters-data.js tablas de monstruos y temas de mazmorra
public/rules/talents-data.js árbol de talentos de cada clase
public/map.js           taberna, servidores, aspecto de los héroes y sus rasgos (cleanLook, FEATURES)
public/dungeon-data.js  tipos de casilla de las mazmorras
public/models.js        base de los modelos: materiales, héroes (bloques y KayKit), carga de modelos y animación; lo compartido en MODELS._
public/models-creatures.js enemigos, mascotas y monturas (bloques y modelos de verdad), rasgos de monstruo
public/models-props.js  muebles de la taberna, decorado de mazmorra, plantas, caña y jarra
public/armor3d.js       dibuja las armaduras en el personaje (piezas pegadas a los huesos)
public/weapons3d.js     dibuja armas y escudos (un modelo por tipo y nivel, colores por variante)
public/view3d.js        render, mapa 3D, partículas, clima, retratos y dibujos de objetos
public/game.js          núcleo de la taberna: estado, red, interfaz (crónica, héroes, avisos), puente DD.core
public/tavern/start.js  pantalla de inicio, casillas, servidores y editor de personaje
public/tavern/editor.js editor de muebles de la taberna (dueño)
public/tavern/screen.js zoom del juego y pantalla completa
public/tavern/ambience.js ambiente de la taberna: haces de luna, halos y charcos de luz, polvo, ascuas (C.tavernFx)
public/tavern/mesa.js    mesa de partida: panel con el plano de la próxima mazmorra, marcas, listo, dados y comercio (C.mesa)
public/tavern/tavern3d.js taberna en 3D, bucle de dibujo y clics en la sala
public/tavern/boot.js   arranque (se carga el último de la taberna)
public/dungeon.js       mazmorra en el navegador: estado, red, eventos, controles y escena 3D; comparte en DD.dg
public/dungeon/menu.js  menú de mazmorras (tema, nivel, lista de partidas)
public/dungeon/party.js vida del grupo, volver con el grupo, HUD y barra de habilidades
public/dungeon/overlay.js marcas, nombres, bocadillos y minimapa dibujados encima; joystick táctil
public/dungeon/turns.js barra de iniciativa, panel de tu turno, casillas alcanzables y avisos del combate por turnos
public/polish.js        fundidos, celebración de nivel y cartel de objeto único
public/tutorial.js      tutorial de Alfonso para personajes nuevos
public/ui.js, ui2.js    ventanas: ficha, inventario, tiendas, forja, guía; ajustes (volumen, tamaño, daltónico, teclas en DD.keys)
public/sprites.js, dsprites.js  sprites 2D: iconos de objetos y reserva sin 3D
public/css/*.css        estilos por zonas (base, dungeon, windows, start, inventory, extras), en ese orden
test/smoke.js           pruebas de reglas y de red (npm test)
scripts/lint.js         comprobación de sintaxis (npm run lint)
```

## Dónde tocar para… (busca el nombre con grep, no leas el archivo entero)
- Enemigo nuevo o cambiar sus números: fila en `MONSTERS` (rules/monsters-data.js); su modelo en `ENEMY_GL` + `monsterFeatures` (models-creatures.js).
- Mazmorra/tema nuevo: `THEMES` (monsters-data.js) + colores en view3d.js (`volcan`/`abismo` como ejemplo) + decorado en server/gen.js. El bosque (`bosque`) es especial: sin puertas ni antorchas (`forest` en gen.js), árboles en vez de muros (`buildForestGL`), suelo pintado (`forestTile`) y luciérnagas (`fireflies`).
- Detalle de las mazmorras (`buildDungeonGL`): tono por losa y por piedra (`tone`), columnas de esquina y telarañas (`extras`, enseñadas al explorar), muros con estanterías y ventanales.
- Cuánto botín cae: `DROP` y `legChance` en `rollLoot` (engine.js). Poderes legendarios: `LEGENDARY` (engine.js) y su efecto en server/dungeon.js (`p.d.leg`).
- Clases y habilidades: `CLASSES`, `ABILITIES` (engine.js); aspecto y rasgos del editor: `FEATURES`, `HAIR_LIST`, `HUMAN_SKINS` (map.js) y `faceFeatures` (models.js). Talentos: rules/talents-data.js.
- Afijos, únicos, conjuntos, pociones: `AFFIXES`, `UNIQUE_NAMES`, `SETS`, `CONSUMABLES` (engine.js).
- Dificultad de los monstruos por nivel: `monsterAt` (engine.js). Asalto: `RAID` (progress.js).
- Recompensa diaria, logros, tareas, mejoras de la taberna, temporadas: `LOGIN_REWARDS`, `ACHIEVEMENTS`, `DAILY`, `TAVERN_LEVELS`, `SEASON_PTS` (progress.js).
- Combate (daño, habilidades, muerte, botín al morir): `damageEnemy`, `tryPending`, `killEnemy`, `hurtPlayer` (server/dungeon.js).
- Combate por turnos (server/turns.js): empieza en `encStart` cuando un monstruo tiene `aggro` (o empieza el duelo); orden `encRound`/`encNext`, turno `encBegin`/`encEndTurn` (`TURN_MS` 30 s reales, `TURN_GAME_MS` de juego por turno), presupuesto `p.tb` = { move, action, bonus } y `react` por ronda, IA `encEnemy`, ataques de oportunidad `encLeaveReach…`, órdenes `endTurn`/`revive` (mensajes `dend`/`drevive`). Daño por turnos: `turnDmgMult` (un ataque = unos 6 s de golpes: ×6000/atkMs entre 4 y 9; habilidades ×0,55 de eso, venenos ×2; jefes y élites aguantan más con más héroes) y `turnHurtMult` (golpes de los monstruos ×4500/atk entre 1,5 y 4). Todo el tiempo de combate usa `this.clock()` (reloj de juego que sólo corre mientras pasa algo), nunca `Date.now()`. Las pruebas de tiempo real pasan `turns: false` en los hooks.
- Mensajes del cliente al servidor: `server/handlers/*.js` (`'nombre:accion'(cx, msg)`); los que quedan, en el `switch (msg.t)` de server.js.
- Luz y ambiente de cada tema (luz ambiente, rebote, neblina): `THEME` (view3d.js); neblina `mistLayer`, agua y lava `liquidMaterial`, suciedad del suelo `grime`; luces de la escena en `renderGame` (dungeon.js).
- Efectos de golpe y muerte: `gore`, `hitBurst`, `splat`, `slash`, `setFlash` (dungeon.js). Calidad automática por fps: `trackFps` (view3d.js).
- Juego en grupo (server/dungeon.js): botín personal `lootParty` (+ `owner` en el botín), recogida automática en `tick`, tumbado y reanimar `tickDowned` (`DOWN_MS`, `REVIVE_S`), combos `combo`, resumen `stat`/`summaryStats` (mensaje `dsummary`), salida tras el jefe `PORTAL_MS`/`finish`.
- Sorpresas de mazmorra: afijo al azar (`this.mod`/`modMf` en el constructor de Instance), sala secreta (casilla `S` en server/gen.js, `breakWall`), mímico (`mimico` en monsters-data.js, `ch.mimic` en `openChest`, modelo `mimic` en models-creatures.js), mercader errante (`def.merchant`).
- Objetivo semanal del grupo `GROUP_GOALS` (progress.js) y `goalAdd`/`goalBonus` (social.js); muro de trofeos `trophyAdd` (social.js) y `buildTrophies` (tavern3d.js); marcos por logros `FRAMES`; encargos de Alfonso `STORY` (progress.js, tarea semanal `h_<semana>`); ronda de dados `dice:*` (server/handlers/play.js, ventana en ui2.js).
- Mesa de partida: casillas `maptable` unidas (`mapTables`, `atMapTable` en map.js) se dibujan como una mesa (`buildMapTable`, tavern3d.js); al sentarse, vista de arriba (`atMesa` en `renderTavern3D`, con `setViewOffset`) y panel `mesa.js`. Servidor: `mesa:*` en server/handlers/play.js; la semilla del plano es la de la mazmorra (`newDungeon(…, seed)`), y bajan todos cuando todos están listos (`mesaStart`).
- Sonidos y música: `FX` y `TRACKS` (audio.js). Iconos: `P` (icons.js). Novedades: `NEWS` (admin.js).
- Ventanas: ui.js (ficha, inventario, talentos, tiendas, guía) y ui2.js (pueblo, forja, fama, ajustes, asalto, taberna, mercado).

## Probar
- Siempre: `npm run lint && npm test` (test/smoke.js arranca el servidor y prueba reglas, red y combate).
- En el navegador sólo si cambia algo visual: Playwright con Chromium en /opt/pw-browsers (`--use-gl=angle --use-angle=swiftshader`); ver scripts de ejemplo en el scratchpad si existen.

## No leer (no aportan y gastan contexto)
`node_modules/`, `package-lock.json`, `data/`, `public/assets/` (modelos .glb), `public/vendor/`, imágenes (`*.png`), `.git/`.

## Convenciones
- Interfaz, textos y comentarios en español.
- Las reglas están solo en `public/rules/`: el servidor y el navegador las comparten, no duplicarlas.
- El servidor manda; el cliente solo pide. Todo lo que llega del cliente se limpia (`MAP.cleanLook`, `RULES.cleanChar`).
- Antes de subir: `npm run lint && npm test`.
- Rama de trabajo: `claude/social-room-game-ypkkqo`; a la web llega al fusionar con `main`.
- Commits en español, descriptivos.
- Los módulos de `server/` reciben en `CTX`/`CTX2` lo que necesitan de server.js y devuelven sus funciones; lo que viene de otro módulo se envuelve (`const x = (...a) => ctx.x(...a)`). Los de `server/handlers/` devuelven `{ 'tipo'(cx, msg) }` y `cx` trae `ws, user, room, err, allow…`.
- `public/dungeon/*.js` comparten con dungeon.js a través de `DD.dg` (`const D = DD.dg`), como `public/tavern/` con `DD.core`; `models-*.js` usan `MODELS._`.
- Los archivos de `public/tavern/` comparten nombres a través de `DD.core` (`const C = DD.core`): cada archivo publica al final lo que usan los demás; las variables que cambian de valor se leen como `C.nombre`.

## Decisiones
- Objetos estilo Diablo 2: niveles normal/excepcional/élite, calidades (inferior…único, conjunto), prefijos y sufijos.
- Para añadir armaduras o armas basta una fila en `items-data.js` (nombre, género, aspecto); la variante se guarda en `it.sk` y no cambia las estadísticas. Cuero y placas tienen una quinta variante samurái (piezas `doBands`, `sode`, `kusazuri`, `kabuto`, `kuwagata`, `menpo`, `kote`, `suneate`, `haidate`, `tabi`, `waraji`, `hachimaki`, `jingasa` en armor3d.js). La katana es un arma más en `WEAPONS` (engine.js) con su modelo en weapons3d.js.
- Cascos: las piezas están medidas para una cabeza de referencia (`RREF`) y se escalan con `zoom` a la cabeza real; con casco que tapa, `tuckHair` (models.js) mete el pelo dentro de la forma del cráneo.
- armor3d.js mide cuerpo y cabeza con la malla ya deformada (`setFromObject(…, true)`), así las piezas se ajustan a las proporciones de `humanize`; `tube` pone mangas, brazales y quijotes de un hueso al siguiente.
- Stats: Fuerza, Destreza, Vigor, Inteligencia, Carisma, Suerte; máximo natural 20; nivel máximo 50.
- Sólo humanos (las razas se quitaron: `raceId` siempre da 'human' y `migrateProfile` pasa a humanos a los de antes, con los puntos devueltos) y 7 clases. Aspecto: sexo, peinado (`HAIR_LIST`, cada uno es la cabeza de un modelo KayKit), piel (`HUMAN_SKINS`), pelo y rasgos en `look.feat` (`FEATURES` en map.js: complexión, altura, barba, cejas, marcas, pintura, pendientes); en 3D, `faceFeatures` (models.js) los pega al hueso de la cabeza.
- Proporciones más humanas en los modelos KayKit: `humanize`/`applyHuman` (models.js) encogen la cabeza y alargan tronco, brazos y piernas separando las articulaciones después de cada fotograma de animación.
- Todos los personajes KayKit comparten esqueleto: cabezas, armaduras y armas se pegan a los huesos.
- Cuentas por token del navegador: 3 personajes y 3 servidores (Lejano, Humbrio, Sangriento).
- `RULES_VERSION` + `migrateProfile` adaptan las partidas guardadas cuando cambian las reglas.
- Render gratis no guarda el disco: el servidor manda a cada navegador una copia firmada de su cuenta (`dd-backup`, HMAC con `SAVE_SECRET`) y la restaura al entrar si la ha perdido.
- Usuario y contraseña: la llave (token) de la cuenta se guarda cifrada en `a.login` (AES con SAVE_SECRET, contraseña con scrypt) y se devuelve al entrar desde otro dispositivo.
- El dueño de cada servidor tiene /aviso, /silenciar, /hablar y /expulsar. Con ADMIN_KEY en el entorno, /admin?key=… enseña los conectados y los errores de los navegadores.
- Botín: los enemigos normales sueltan poco y básico (`DROP` en engine.js); los legendarios son únicos con `it.leg` (poderes en `LEGENDARY`, aplicados en server/dungeon.js con `p.d.leg`).
- Talentos en `char.talents` (`TALENTS` en engine.js); `derive` los suma como el equipo y da `d.abBoost` por habilidad.
- progress.js: recompensa diaria (`LOGIN_REWARDS`, `acct.daily`), Asalto semanal (`RAID`, mapa con semilla de la semana), temporadas (`season:<n>` en meta), mejoras de la taberna (`room.fund`) y mercado (`market` en meta).
- Los archivos estáticos se sirven con gzip y ETag; `assets/` y `vendor/` se guardan un día en el navegador.

## Railway (despliegue) y mudanza desde Render
- `railway.json`: arranque `npm start`, comprobación de salud en `/healthz`. Volumen montado en `/data` y variables `DATA_DIR=/data`, `SAVE_SECRET` (el mismo valor que en Render, o ninguno si allí no estaba) y `ADMIN_KEY`.
- Mudanza: con `MOVED_TO=https://nueva-direccion` en el servidor viejo, su página lleva a cada jugador a la nueva con su llave y su copia firmada en el `#mudanza=` (`sendMoved` en server.js; se recoge al principio de index.html). La copia sólo se acepta si `SAVE_SECRET` es igual en los dos.
