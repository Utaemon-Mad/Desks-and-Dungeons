import { NodeIO } from '@gltf-transform/core';
import { prune, dedup } from '@gltf-transform/functions';
import fs from 'fs';
// Animales de Quaternius ("Ultimate Animated Animals", CC0) para mascotas, monturas y bestias.
// Entrada: las versiones .glb ligeras (6 animaciones por animal) en /tmp/kk/animals.
const IN = '/tmp/kk/animals/';
const OUT = '/home/user/Desks-and-Dungeons/public/assets/quaternius/';
fs.mkdirSync(OUT, { recursive: true });
const io = new NodeIO();
// mismos nombres de animación para todos
const RENAME = { Attack_Headbutt: 'Attack', Idle_HitReact1: 'Hit' };
for (const f of ['Wolf', 'Fox', 'ShibaInu', 'Horse', 'Stag']) {
  const doc = await io.read(IN + f + '.glb');
  for (const a of doc.getRoot().listAnimations()) if (RENAME[a.getName()]) a.setName(RENAME[a.getName()]);
  await doc.transform(prune({ keepLeaves: true }), dedup());
  await io.write(OUT + f + '.glb', doc);
}
