# Desks & Dungeons

RPG de taberna multijugador en el navegador, todo en español. En producción en https://desks-and-dungeons.onrender.com (se despliega desde `main`).

## Stack
- Servidor: Node ≥18 + `ws` (WebSocket). Sin base de datos: JSON en `data/*.json`.
- Navegador: JavaScript sin compilar (scripts globales cargados en orden desde `public/index.html`) y Three.js r160 en `public/vendor/three.bundle.min.js`.
- Reglas compartidas por servidor y navegador en `public/rules/`.
- Modelos 3D CC0: KayKit (personajes y escenarios) y Quaternius (animales).

## Estructura
```
server.js               servidor HTTP/WebSocket, cuentas, inventario, tiendas, comercio, forja y reparto de mensajes
server/dungeon.js       instancia de mazmorra/mundo/arena: combate, IA, botín, mascotas, puertas
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
public/map.js           taberna, servidores, razas y aspecto, rasgos goblin (cleanLook)
public/dungeon-data.js  tipos de casilla de las mazmorras
public/models.js        personajes 3D (KayKit), enemigos, animales, muebles
public/goblin.js        cabeza goblin hecha a mano con sus opciones
public/armor3d.js       dibuja las armaduras en el personaje (piezas pegadas a los huesos)
public/weapons3d.js     dibuja armas y escudos (un modelo por tipo y nivel, colores por variante)
public/view3d.js        render, mapa 3D, partículas, clima, retratos y dibujos de objetos
public/game.js          núcleo de la taberna: estado, red, interfaz (crónica, héroes, avisos), puente DD.core
public/tavern/start.js  pantalla de inicio, casillas, servidores y editor de personaje
public/tavern/editor.js editor de muebles de la taberna (dueño)
public/tavern/screen.js zoom del juego y pantalla completa
public/tavern/tavern3d.js taberna en 3D, bucle de dibujo y clics en la sala
public/tavern/boot.js   arranque (se carga el último de la taberna)
public/dungeon.js       mazmorra en el navegador: escena, controles, interfaz de combate y de grupo (marcas, volver con el grupo)
public/polish.js        fundidos, celebración de nivel y cartel de objeto único
public/tutorial.js      tutorial de Alfonso para personajes nuevos
public/ui.js, ui2.js    ventanas: ficha, inventario, tiendas, forja, guía; ajustes (volumen, tamaño, daltónico, teclas en DD.keys)
public/sprites.js, dsprites.js  sprites 2D: iconos de objetos y reserva sin 3D
public/style.css        estilos
test/smoke.js           pruebas de reglas y de red (npm test)
scripts/lint.js         comprobación de sintaxis (npm run lint)
```

## No leer (no aportan y gastan contexto)
`node_modules/`, `package-lock.json`, `data/`, `public/assets/` (modelos .glb), `public/vendor/`, imágenes (`*.png`), `.git/`.

## Convenciones
- Interfaz, textos y comentarios en español.
- Las reglas están solo en `public/rules/`: el servidor y el navegador las comparten, no duplicarlas.
- El servidor manda; el cliente solo pide. Todo lo que llega del cliente se limpia (`MAP.cleanLook`, `RULES.cleanChar`).
- Antes de subir: `npm run lint && npm test`.
- Rama de trabajo: `claude/social-room-game-ypkkqo`; a la web llega al fusionar con `main`.
- Commits en español, descriptivos.
- Los archivos de `public/tavern/` comparten nombres a través de `DD.core` (`const C = DD.core`): cada archivo publica al final lo que usan los demás; las variables que cambian de valor se leen como `C.nombre`.

## Decisiones
- Objetos estilo Diablo 2: niveles normal/excepcional/élite, calidades (inferior…único, conjunto), prefijos y sufijos.
- Para añadir armaduras o armas basta una fila en `items-data.js` (nombre, género, aspecto); la variante se guarda en `it.sk` y no cambia las estadísticas.
- Stats: Fuerza, Destreza, Vigor, Inteligencia, Carisma, Suerte; máximo natural 20; nivel máximo 50.
- 5 razas y 7 clases. Los goblins llevan cabeza propia (`goblin.js`) con rasgos en `look.gob`.
- Todos los personajes KayKit comparten esqueleto: cabezas, armaduras y armas se pegan a los huesos.
- Cuentas por token del navegador: 3 personajes y 3 servidores (Lejano, Humbrio, Sangriento).
- `RULES_VERSION` + `migrateProfile` adaptan las partidas guardadas cuando cambian las reglas.
- Render gratis no guarda el disco: el servidor manda a cada navegador una copia firmada de su cuenta (`dd-backup`, HMAC con `SAVE_SECRET`) y la restaura al entrar si la ha perdido.
- Usuario y contraseña: la llave (token) de la cuenta se guarda cifrada en `a.login` (AES con SAVE_SECRET, contraseña con scrypt) y se devuelve al entrar desde otro dispositivo.
- El dueño de cada servidor tiene /aviso, /silenciar, /hablar y /expulsar. Con ADMIN_KEY en el entorno, /admin?key=… enseña los conectados y los errores de los navegadores.
- Los archivos estáticos se sirven con gzip y ETag; `assets/` y `vendor/` se guardan un día en el navegador.
