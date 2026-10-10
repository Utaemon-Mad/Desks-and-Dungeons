/* global MAP, RULES, SPRITES, THREE, MODELS, VIEW3D */
(() => {
  'use strict';
  const C = DD.core;
  const { buildPickers, frame, loginEl, resize, toTitle } = C;

  // ======================================================================
  //  Arranque
  // ======================================================================
  window.addEventListener('resize', resize);
  resize();
  if (document.fonts) document.fonts.ready.then(() => { if (!loginEl.classList.contains('hidden')) buildPickers(); });
  toTitle(false);
  requestAnimationFrame(frame);
})();
