import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, quantize } from '@gltf-transform/functions';
import fs from 'fs';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const A = '/tmp/kk/adv/addons/kaykit_character_pack_adventures/Characters/gltf/';
const S = '/tmp/kk/skel/addons/kaykit_character_pack_skeletons/Characters/gltf/';
const OUT = '/home/user/Desks-and-Dungeons/public/assets/kaykit/';
fs.mkdirSync(OUT + 'chars', { recursive: true });
fs.mkdirSync(OUT + 'props', { recursive: true });
// personajes sin animaciones (las animaciones van aparte, compartidas: todos usan el mismo esqueleto)
for (const [dir, files] of [[A, ['Knight', 'Barbarian', 'Mage', 'Rogue', 'Rogue_Hooded']], [S, ['Skeleton_Warrior', 'Skeleton_Rogue', 'Skeleton_Mage', 'Skeleton_Minion']]]) {
  for (const f of files) {
    const doc = await io.read(dir + f + '.glb');
    for (const a of doc.getRoot().listAnimations()) { for (const sm of a.listSamplers()) { const i = sm.getInput(), o = sm.getOutput(); sm.dispose(); i && i.dispose(); o && o.dispose(); } a.dispose(); }
    for (const acc of doc.getRoot().listAccessors()) if (acc.listParents().every((x) => x.propertyType === 'Root')) acc.dispose();
    await doc.transform(prune(), dedup());
    await io.write(OUT + 'chars/' + f + '.glb', doc);
  }
}
// animaciones: las del aventurero + las propias de los esqueletos, en un archivo cada una
const KEEP = ['Idle', 'Unarmed_Idle', '2H_Melee_Idle', 'Walking_A', 'Walking_B', 'Running_A', 'Running_B', '1H_Melee_Attack_Chop', '1H_Melee_Attack_Slice_Diagonal', '1H_Melee_Attack_Stab', '2H_Melee_Attack_Slice', '2H_Melee_Attack_Chop', '2H_Melee_Attack_Spin', 'Dualwield_Melee_Attack_Stab', '1H_Ranged_Shoot', '2H_Ranged_Shoot', '1H_Ranged_Aiming', 'Spellcast_Shoot', 'Spellcast_Raise', 'Spellcast_Long', 'Block', 'Hit_A', 'Hit_B', 'Death_A', 'Death_B', 'Dodge_Forward', 'Cheer', 'Interact', 'PickUp', 'Use_Item', 'Throw', 'Sit_Chair_Idle', 'Sit_Floor_Idle', 'Unarmed_Melee_Attack_Punch_A', 'Lie_Idle'];
const SKEL = ['Idle_Combat', 'Walking_D_Skeletons', 'Spawn_Ground_Skeletons', 'Taunt', 'Spellcast_Summon', 'Death_C_Skeletons'];
for (const [src, keep, out] of [[A + 'Knight.glb', KEEP, 'anims.glb'], [S + 'Skeleton_Minion.glb', SKEL, 'anims_skel.glb']]) {
  const doc = await io.read(src);
  for (const a of doc.getRoot().listAnimations()) if (!keep.includes(a.getName())) { for (const sm of a.listSamplers()) { const i = sm.getInput(), o = sm.getOutput(); sm.dispose(); i && i.listParents().length <= 1 && i.dispose(); o && o.dispose(); } a.dispose(); }
  for (const n of doc.getRoot().listNodes()) if (n.getMesh()) { n.getMesh().dispose(); n.setMesh(null); n.setSkin(null); }
  for (const s of doc.getRoot().listSkins()) s.dispose();
  for (const acc of doc.getRoot().listAccessors()) if (acc.listParents().every((x) => x.propertyType === 'Root')) acc.dispose();
  await doc.transform(prune({ keepLeaves: true }), dedup());
  await io.write(OUT + 'chars/' + out, doc);
}
console.log('ok');
