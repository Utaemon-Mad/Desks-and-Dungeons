import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, textureCompress } from '@gltf-transform/functions';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const A = '/tmp/kk/adv/addons/kaykit_character_pack_adventures/Assets/gltf/';
const S = '/tmp/kk/skel/addons/kaykit_character_pack_skeletons/Assets/gltf/';
const list = [[A, ['sword_1handed', 'sword_2handed', 'axe_1handed', 'axe_2handed', 'dagger', 'staff', 'wand', 'crossbow_1handed', 'crossbow_2handed', 'shield_round', 'shield_square', 'shield_spikes', 'shield_badge', 'shield_round_color', 'shield_square_color', 'spellbook_open', 'quiver', 'mug_full', 'arrow', 'smokebomb']], [S, ['Skeleton_Blade', 'Skeleton_Axe', 'Skeleton_Staff', 'Skeleton_Crossbow', 'Skeleton_Shield_Small_A', 'Skeleton_Shield_Large_A', 'Skeleton_Arrow']]];
const doc = new Document();
for (const [dir, names] of list) for (const n of names) {
  const d = await io.read(dir + n + '.gltf');
  // cada pieza: un nodo raíz con su nombre
  const sc = d.getRoot().getDefaultScene() || d.getRoot().listScenes()[0];
  const kids = sc.listChildren();
  if (kids.length === 1) kids[0].setName(n);
  else { const g = d.createNode(n); for (const k of kids) { sc.removeChild(k); g.addChild(k); } sc.addChild(g); }
  doc.merge(d);
}
const scenes = doc.getRoot().listScenes();
const main = scenes[0];
for (const sc of scenes.slice(1)) { for (const k of sc.listChildren()) { sc.removeChild(k); main.addChild(k); } sc.dispose(); }
doc.getRoot().setDefaultScene(main);
const buffers = doc.getRoot().listBuffers();
for (const b of buffers.slice(1)) { for (const a of doc.getRoot().listAccessors()) if (a.getBuffer() === b) a.setBuffer(buffers[0]); b.dispose(); }
await doc.transform(dedup(), prune());
await io.write('/home/user/Desks-and-Dungeons/public/assets/kaykit/props/weapons.glb', doc);
console.log(main.listChildren().map((n) => n.getName()).join(', '));
