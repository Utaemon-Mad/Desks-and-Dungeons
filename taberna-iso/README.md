# La Taberna del Cuervo (prototipo)

Prototipo aparte de un RPG de acción en vista isométrica, con el ambiente de una taberna medieval oscura: fuego en la chimenea, faroles, sombras largas, polvo en el aire y un cazador de pelo blanco con dos espadas a la espalda. Nace de una imagen de referencia (composición y ambiente, no personajes ni marcas de otros juegos) y **no comparte código con Desks & Dungeons**: es un proyecto nuevo en esta carpeta.

## Probarlo

```
node taberna-iso/serve.js        # http://localhost:8080
```

También vale cualquier servidor de archivos estáticos apuntando a `taberna-iso/`. Hace falta un navegador con WebGL2.

## Controles

| Acción | Control |
|---|---|
| Moverse | clic en el suelo (mantén pulsado para seguir al cursor) o WASD / flechas (arriba = noroeste) |
| Hablar | clic en un personaje (Brom, la figura encapuchada, los parroquianos); darles conversación da experiencia |
| Habilidades | `1` Tajo · `2`/`Q` Llamarada · `3`/Espacio Esquiva · `4` Guardia · clic derecho = Tajo hacia el cursor |
| Otros | `R` descansar junto al fuego · `E` desenvainar · `F` poción · `Shift` andar · rueda = zoom · `M` sonido |

## Cómo está hecho

Sin compilar, con scripts globales cargados en orden desde `index.html` (como el juego principal). Three.js r160 con complementos va en `vendor/three.bundle.min.js` (el mismo paquete del juego principal).

| Archivo | Qué hace |
|---|---|
| `js/tex.js` | Texturas hechas en canvas: tablones de suelo con veta y clavos, ladrillo, piedra, paneles tallados, alfombra, tapices, **runas brillantes** (trazos propios), llamas |
| `js/actors.js` | Carga de modelos KayKit, repintado de texturas (casillas 8×8) para pelo blanco y ropas, mezclador de animaciones, piezas de decorado |
| `js/room.js` | La sala: paredes, vigas, chimenea con llamas y chispas, barra con estantes, mesas y sillas, luces con parpadeo, personajes del lugar |
| `js/hud.js` | Interfaz: barras, ranuras con enfriamiento, rueda de acciones, minimapa girado como la cámara, globos de diálogo |
| `js/main.js` | Render con postprocesado, cámara ortográfica isométrica, búsqueda de camino (A*), habilidades y efectos, sonido con WebAudio, retrato en vivo |

Ambiente: luz de fuego con sombras (la única luz puntual que proyecta sombra), faroles y velas que parpadean, una luz fría de relleno, oclusión ambiental (GTAO), brillo (bloom), viñeta, gradación frío/cálido y grano de película. Los metales reflejan un entorno procedural (sólo ellos lo notan). La calidad baja sola si los fps caen de 30 (`?q=low` y `?q=high` la fijan).

Depuración desde la consola del navegador: `TI.dbg` (cámara, héroe, sala, `step(dt, n)` para avanzar la simulación sin dibujar, `TI.maxDt`, `TI.freeCam`).

## Lo que falta (siguientes pasos razonables)

- Enemigos y combate de verdad (las habilidades ahora sólo tienen animación, efecto y enfriamiento).
- Inventario y equipo, tiendas, misiones del tablón; guardar partida.
- Salir de la taberna: calle, bodega y mazmorra (el juego principal ya tiene generador de mazmorras).
- Multijugador: aprovechar el servidor WebSocket de Desks & Dungeons.
- Ciclo de día y noche, más parroquianos con rutinas, música.
- Arte: los modelos KayKit son estilizados (cabezas grandes); para acercarse más a la imagen de referencia hacen falta personajes de proporciones realistas y texturas PBR de más resolución (ambientCG / Poly Haven, CC0).

## Créditos

Modelos: KayKit (personajes, mobiliario de mazmorra y armas), licencia CC0 (`assets/LICENSE.txt`). Three.js (MIT, `vendor/THREE-LICENSE.txt`). El resto (texturas, código, interfaz) es propio.
