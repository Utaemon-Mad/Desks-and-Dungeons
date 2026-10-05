# Recursos 3D

Los modelos de `public/assets/kaykit/` son de los packs gratuitos de **KayKit** (Kay Lousberg, licencia CC0):
Adventurers, Skeletons, Dungeon Remastered, Halloween Bits y Medieval Hexagon.

Estos scripts los preparan para el juego con [glTF-Transform](https://gltf-transform.dev):
quitan las animaciones repetidas de cada personaje (todos comparten esqueleto y van en `anims.glb`)
y juntan armas y piezas de escenario en un archivo por pack.

```bash
npm i @gltf-transform/core@3 @gltf-transform/extensions@3 @gltf-transform/functions@3
git clone --depth 1 https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0 /tmp/kk/adv
# … y los demás packs en /tmp/kk/{skel,dun,hall,hex}
node scripts/assets/kaykit-characters.mjs
node scripts/assets/kaykit-weapons.mjs
node scripts/assets/kaykit-scenery.mjs
```

`scripts/three-entry.js` es la entrada del paquete de Three.js r160 con sus complementos
(posprocesado, cargador glTF, utilidades de esqueletos):
`npx esbuild scripts/three-entry.js --bundle --minify --format=iife --outfile=public/vendor/three.bundle.min.js`.
