/* global MAP, RULES, SPRITES, THREE, MODELS, VIEW3D */
(() => {
  'use strict';
  const C = DD.core;
  const { load, save, toast } = C;

  // ======================================================================
  //  Zoom del juego: Ctrl + rueda, pellizco en el panel táctil o en el iPad, Ctrl + / − / 0 y la rueda
  //  sobre la escena acercan o alejan la cámara. El navegador no hace zoom: la interfaz no cambia de tamaño.
  // ======================================================================
  const ZOOM_MIN = 0.5, ZOOM_MAX = 1.8;
  DD.camZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Number(load('dd-zoom')) || 1));
  function setZoom(z) {
    DD.camZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
    save('dd-zoom', DD.camZoom.toFixed(3));
  }
  const overGame = (t) => t && (t.id === 'scene' || t.id === 'dcanvas' || t.id === 'gl');
  window.addEventListener('wheel', (e) => {
    if (!(e.ctrlKey || e.metaKey || overGame(e.target))) return;
    e.preventDefault();
    const d = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY; // líneas → píxeles
    setZoom(DD.camZoom * Math.exp(Math.max(-0.12, Math.min(0.12, d * 0.002)))); // una muesca ≈ 11 %; el pellizco del panel, más fino
  }, { passive: false });
  window.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd') setZoom(DD.camZoom / 1.12);
    else if (e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract') setZoom(DD.camZoom * 1.12);
    else if (e.key === '0' || e.code === 'Numpad0') setZoom(1);
    else return;
    e.preventDefault();
  });
  // iPad (Safari): el gesto de pellizco se convierte en zoom de la cámara
  let gestureZoom = 1;
  document.addEventListener('gesturestart', (e) => { e.preventDefault(); gestureZoom = DD.camZoom; }, { passive: false });
  document.addEventListener('gesturechange', (e) => { e.preventDefault(); setZoom(gestureZoom / (e.scale || 1)); }, { passive: false });
  document.addEventListener('gestureend', (e) => e.preventDefault(), { passive: false });
  // pellizco con dos dedos en otros navegadores táctiles
  let pinch = null;
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  document.addEventListener('touchstart', (e) => { if (e.touches.length === 2) pinch = { d: dist(e.touches), z: DD.camZoom }; }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (e.touches.length !== 2 || !pinch) return;
    e.preventDefault();
    setZoom(pinch.z * pinch.d / Math.max(1, dist(e.touches)));
  }, { passive: false });
  document.addEventListener('touchend', (e) => { if (e.touches.length < 2) pinch = null; });

  // ======================================================================
  //  Pantalla completa (en el iPad, si Safari no la permite, se explica cómo instalar el juego)
  // ======================================================================
  const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement;
  function toggleFullscreen() {
    const el = document.documentElement;
    if (fsElement()) { const r = (document.exitFullscreen || document.webkitExitFullscreen).call(document); if (r && r.then) r.then(fsLabel); return; }
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req) { toast('Para jugar a pantalla completa en el iPad: Compartir → «Añadir a pantalla de inicio» y abre el juego desde ese icono.'); return; }
    try { const r = req.call(el, { navigationUI: 'hide' }); if (r && r.then) r.then(fsLabel, () => toast('El navegador no ha dejado poner la pantalla completa.')); } catch { toast('El navegador no ha dejado poner la pantalla completa.'); }
  }
  function fsLabel() {
    const on = !!fsElement();
    for (const b of document.querySelectorAll('[data-fs]')) b.textContent = on ? '⤡ Salir de pantalla completa' : '⛶ Pantalla completa';
  }
  document.addEventListener('fullscreenchange', fsLabel);
  document.addEventListener('webkitfullscreenchange', fsLabel);
  for (const b of document.querySelectorAll('[data-fs]')) b.addEventListener('click', toggleFullscreen);
  DD.toggleFullscreen = toggleFullscreen;

})();
