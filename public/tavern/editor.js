/* global MAP, RULES, SPRITES, THREE, MODELS, VIEW3D */
(() => {
  'use strict';
  const C = DD.core;
  const { $, drawStaffZone, iso, itemDrawables, net, toast, withCtx } = C;

  // ======================================================================
  //  Editor de la taberna (sólo el dueño de la sala)
  // ======================================================================
  const editorEl = $('#editor');
  const EDIT_ORDER = ['barrel', 'crate', 'smallcrate', 'chest', 'table', 'maptable', 'roundtable', 'bar', 'bookshelf', 'plant', 'chair', 'stool', 'sofa', 'fireplace', 'candelabra', 'chandelier', 'rack', 'cauldron', 'staff'];

  function toolPreview(type) {
    const c = document.createElement('canvas');
    c.width = 112; c.height = 96;
    const g = c.getContext('2d');
    const s = 1.1, center = iso(0.5, 0.5);
    g.setTransform(s, 0, 0, s, 56 - center.x * s, 74 - center.y * s);
    withCtx(g, () => {
      const ds = itemDrawables({ type, x: 0, y: 0, dir: 'S' }, false);
      if (type === 'staff') ds.push({ depth: 0, draw: () => drawStaffZone({ x: 0, y: 0 }) });
      ds.sort((a, b) => a.depth - b.depth).forEach((d) => d.draw());
    });
    return c;
  }

  function buildEditor() {
    const box = $('#edit-tools');
    box.innerHTML = '';
    const tools = [...EDIT_ORDER.map((t) => ({ id: t, name: MAP.FURNITURE[t].name })), { id: 'rotate', name: 'Girar', icon: '↻' }, { id: 'erase', name: 'Quitar', icon: '🧹' }];
    for (const tool of tools) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tool-btn' + (C.editTool === tool.id ? ' on' : '');
      b.title = tool.name;
      if (tool.icon) { const i = document.createElement('span'); i.className = 'big-ico'; i.textContent = tool.icon; b.appendChild(i); }
      else b.appendChild(toolPreview(tool.id));
      const l = document.createElement('span'); l.textContent = tool.name; b.appendChild(l);
      b.onclick = () => { C.editTool = tool.id; buildEditor(); };
      box.appendChild(b);
    }
    $('#edit-dir').textContent = { E: '↘', S: '↙', W: '↖', N: '↗' }[C.editDir];
  }

  function setEditing(on) {
    C.editing = !!on && C.isOwner;
    editorEl.classList.toggle('hidden', !C.editing);
    document.body.classList.toggle('editing', C.editing);
    if (C.editing) { buildEditor(); toast('Modo edición: haz clic en el suelo para colocar muebles.'); }
  }

  function editClick(x, y) {
    if (!MAP.inBounds(x, y)) return;
    if (x === MAP.BARKEEP.x && y === MAP.BARKEEP.y) { toast('Ahí trabaja el tabernero.'); return; }
    if (MAP.isFixed(x, y)) { toast('Ese es el puesto de un comerciante.'); return; }
    const it = MAP.itemAt(x, y);
    if (C.editTool === 'erase') { if (it) net.send({ t: 'tedit', op: 'remove', x, y }); return; }
    if (C.editTool === 'rotate') { if (it && MAP.FURNITURE[it.type].rotates) net.send({ t: 'tedit', op: 'rotate', x, y }); return; }
    if (it && it.type === C.editTool && MAP.FURNITURE[it.type].rotates) { net.send({ t: 'tedit', op: 'rotate', x, y }); return; }
    if ([...users.values()].some((u) => !u.where && u.tx === x && u.ty === y) && MAP.FURNITURE[C.editTool].block) { toast('Hay alguien ahí de pie.'); return; }
    net.send({ t: 'tedit', op: 'place', type: C.editTool, x, y, dir: C.editDir });
  }

  function rotateEditDir() {
    C.editDir = MAP.DIRS[(MAP.DIRS.indexOf(C.editDir) + 1) % 4];
    $('#edit-dir').textContent = { E: '↘', S: '↙', W: '↖', N: '↗' }[C.editDir];
  }

  $('#edit-rot').addEventListener('click', rotateEditDir);
  $('#edit-done').addEventListener('click', () => setEditing(false));
  $('#edit-reset').addEventListener('click', () => { if (confirm('¿Volver a la taberna original? Se perderán tus cambios.')) net.send({ t: 'tedit', op: 'reset' }); });
  $('#edit-clear').addEventListener('click', () => { if (confirm('¿Quitar todos los muebles?')) net.send({ t: 'tedit', op: 'clear' }); });
  window.addEventListener('keydown', (e) => {
    if (!C.editing || (document.activeElement && document.activeElement.tagName === 'INPUT')) return;
    if (e.key === 'r' || e.key === 'R') rotateEditDir();
    if (e.key === 'Escape') setEditing(false);
  });

  Object.assign(C, { editClick, setEditing });
})();
