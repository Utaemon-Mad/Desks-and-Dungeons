import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup } from '@gltf-transform/functions';
import { getBounds } from '@gltf-transform/core';
import fs from 'fs';
import path from 'path';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const OUT = '/home/user/Desks-and-Dungeons/public/assets/kaykit/props/';
function findFile(dir, name) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) { const r = findFile(p, name); if (r) return r; }
    else if (f.name === name + '.gltf' || f.name === name + '.gltf.glb' || f.name === name + '.glb') return p;
  }
  return null;
}
async function pack(out, dir, names) {
  const doc = new Document();
  const info = {};
  for (const n of names) {
    const f = findFile(dir, n);
    if (!f) { console.log('FALTA', n); continue; }
    const d = await io.read(f);
    const sc = d.getRoot().getDefaultScene() || d.getRoot().listScenes()[0];
    const b = getBounds(sc);
    info[n] = { min: b.min.map((v) => +v.toFixed(2)), max: b.max.map((v) => +v.toFixed(2)) };
    const kids = sc.listChildren();
    const g = d.createNode(n);
    for (const k of kids) { sc.removeChild(k); g.addChild(k); }
    sc.addChild(g);
    doc.merge(d);
  }
  const scenes = doc.getRoot().listScenes();
  const main = scenes[0];
  for (const sc of scenes.slice(1)) { for (const k of sc.listChildren()) { sc.removeChild(k); main.addChild(k); } sc.dispose(); }
  doc.getRoot().setDefaultScene(main);
  const buffers = doc.getRoot().listBuffers();
  for (const b of buffers.slice(1)) { for (const a of doc.getRoot().listAccessors()) if (a.getBuffer() === b) a.setBuffer(buffers[0]); b.dispose(); }
  await doc.transform(dedup(), prune());
  await io.write(OUT + out, doc);
  return info;
}
const DUN = ['floor_tile_large', 'floor_tile_large_rocks', 'floor_tile_small_broken_A', 'floor_dirt_large', 'floor_dirt_large_rocky', 'floor_tile_big_spikes', 'floor_wood_large', 'floor_wood_large_dark', 'wall', 'wall_cracked', 'wall_broken', 'wall_corner', 'wall_pillar', 'wall_shelves', 'wall_archedwindow_gated', 'pillar', 'pillar_decorated', 'column', 'barrel_large', 'barrel_small_stack', 'box_large', 'box_stacked', 'crates_stacked', 'table_medium_decorated_A', 'table_long_decorated_A', 'table_long_tablecloth_decorated_A', 'table_small_decorated_A', 'table_medium', 'chair', 'stool', 'candle_triple', 'candle_lit', 'torch_mounted', 'torch_lit', 'banner_patternA_red', 'banner_patternA_blue', 'banner_patternA_green', 'banner_patternA_brown', 'banner_patternB_white', 'banner_shield_red', 'rubble_half', 'rubble_large', 'chest', 'chest_gold', 'sword_shield', 'keg_decorated', 'shelves', 'shelf_small_candles', 'coin_stack_small', 'coin_stack_medium', 'plate_food_A', 'bottle_A_labeled_brown', 'bottle_A_green', 'trunk_large_A', 'bed_decorated', 'keyring_hanging', 'barrier_column'];
const HALL = ['coffin', 'coffin_decorated', 'crypt', 'gravestone', 'grave_A', 'gravemarker_A', 'bone_A', 'bone_B', 'skull', 'skull_candle', 'ribcage', 'shrine_candles', 'tree_dead_large', 'tree_dead_medium', 'tree_dead_small', 'tree_pine_yellow_large', 'tree_pine_orange_medium', 'lantern_standing', 'post_lantern', 'arch', 'pillar', 'candle_triple', 'pumpkin_orange_jackolantern', 'plaque_candles', 'fence'];
const HEX = ['building_home_A_blue', 'building_home_B_red', 'building_home_A_red', 'building_tavern_blue', 'building_well_blue', 'building_windmill_red', 'building_church_blue', 'building_market_red', 'building_blacksmith_blue', 'building_tower_A_blue', 'building_destroyed', 'building_grain', 'tree_single_A', 'tree_single_B', 'trees_A_small', 'trees_A_medium', 'trees_B_small', 'trees_B_medium', 'rock_single_A', 'rock_single_B', 'rock_single_C', 'rock_single_D', 'rock_single_E', 'mountain_A', 'mountain_B', 'mountain_C', 'mountain_A_grass', 'hill_single_A', 'hills_A_trees', 'fence_wood_straight', 'fence_stone_straight', 'tent', 'flag_red', 'flag_blue', 'crate_A_big', 'sack', 'barrel', 'weaponrack', 'resource_lumber', 'waterlily_A', 'waterplant_A', 'wheelbarrow', 'bucket_water', 'target'];
const all = {};
Object.assign(all, { dungeon: await pack('dungeon.glb', '/tmp/kk/dun/addons/kaykit_dungeon_remastered/Assets/gltf', DUN) });
Object.assign(all, { halloween: await pack('halloween.glb', '/tmp/kk/hall/addons/kaykit_halloween_bits/Assets/gltf', HALL) });
Object.assign(all, { medieval: await pack('medieval.glb', '/tmp/kk/hex/addons/kaykit_medieval_hexagon_pack/Assets/gltf', HEX) });
fs.writeFileSync('/tmp/kk/bounds.json', JSON.stringify(all, null, 1));
console.log('ok');
