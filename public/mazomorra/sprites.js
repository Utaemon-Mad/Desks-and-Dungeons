// Mazo Morra: sprites pixel art de 16×16 dibujados con letras (cada letra es un color de PAL).
// Los que llevan `half` se dibujan sólo por la mitad izquierda (8 columnas) y se reflejan; `over` añade
// píxeles sueltos después (armas, detalles que rompen la simetría). Uso: MZS.url('orco') → imagen PNG.
(function (root) {
  'use strict';
  const PAL = {
    k: '#1b1325', w: '#f4efe0', g: '#9aa0aa', G: '#5a5f6a', m: '#d6dce4',
    r: '#d0383f', R: '#7d1d2b', o: '#e8832c', y: '#f5cf4f', Y: '#b8862a',
    l: '#7ccf4f', d: '#2f7a35', b: '#4f95e6', B: '#28488c', c: '#a8ecf4',
    p: '#e8589a', P: '#8c2e78', v: '#7a5ac0', V: '#3e2a6a', s: '#f2bf96', S: '#c47e56',
    n: '#8a5530', N: '#4e2c18', t: '#3a2f3f', T: '#6b5a70',
  };
  const px = (list, ch) => list.map(([x, y]) => [x, y, ch]);
  const range = (x, y0, y1, ch) => { const o = []; for (let y = y0; y <= y1; y++) o.push([x, y, ch]); return o; };

  const S = {
    // ---- Héroes ----
    guerrera: { half: [
      '........', '......kk', '.....kmm', '....kmgg', '....kggg', '....kGkk', '....kgss', '.....kss',
      '...kkrrr', '..kgkrrr', '..kgkrYY', '.ksk.rrr', '.kk.kNNN', '....kGGk', '....kNNk', '....kkkk',
    ], over: [...range(14, 1, 9, 'm'), [13, 10, 'Y'], [14, 10, 'Y'], [15, 10, 'Y'], [14, 11, 's'], [13, 1, 'k'], [15, 1, 'k']] },
    picara: { half: [
      '........', '......kk', '.....kdd', '....kddd', '....kdNN', '....kdks', '....kdss', '.....kNN',
      '...kkddd', '..kdkdNd', '..kdkdYY', '.ksk.ddd', '.kk.kNNN', '....kNNk', '....kNNk', '....kkkk',
    ], over: [[1, 8, 'm'], [1, 9, 'm'], [14, 8, 'm'], [14, 9, 'm'], [1, 10, 'Y'], [14, 10, 'Y']] },
    maga: { half: [
      '.......k', '......kb', '.....kbb', '.....kby', '...kkbbb', '..kBBBBB', '....kyks', '....kyss',
      '...kkybb', '..kbkbbb', '..kbkbby', '.ksk.bbb', '.kk.kbbb', '...kbbbb', '...kBBBB', '...kkkkk',
    ], over: [...range(14, 2, 14, 'n'), [13, 0, 'c'], [14, 0, 'w'], [15, 0, 'c'], [13, 1, 'c'], [14, 1, 'c'], [15, 1, 'c'], [14, 11, 's']] },
    paladin: { half: [
      '........', '......kk', '.....kyy', '....kyYY', '....kyss', '....kyks', '....kyss', '.....kss',
      '...kkmww', '..kmkwwr', '..kmkwrr', '.ksk.wwr', '.kk.kBBB', '....kGGk', '....kGGk', '....kkkk',
    ], over: [...range(14, 5, 10, 'n'), [13, 3, 'g'], [14, 3, 'm'], [15, 3, 'g'], [13, 4, 'g'], [14, 4, 'g'], [15, 4, 'g'], [14, 11, 's']] },

    // ---- Monstruos ----
    rata: { rows: [
      '................', '................', '................', '................', '................',
      '..........kk.kk.', '.........kpkkpk.', '.....kkkkkgggggk', '....kgggggggkggk', '...kgggggggggggp',
      '..kgggggggggggk.', '.kkgGgggggGgkk..', 'k..kGkkkkkGk....', 'pk.kkk...kkk....', '.pk.............', '................',
    ] },
    murcielago: { half: [
      '........', '........', '........', '.k......', 'kPk....k', 'kPPk..kP', 'kPPPkkPP', 'kPPPPPrP',
      '.kPPPPPP', '.kPPkPPw', '..kk.kPP', '......kk', '........', '........', '........', '........',
    ] },
    limo: { half: [
      '........', '........', '........', '........', '........', '......kk', '....kkll', '...klllw',
      '..kllwll', '..kllkll', '.klllkll', '.kllllll', 'kdllllll', 'kddlllll', 'kddddddd', '.kkkkkkk',
    ] },
    goblin: { half: [
      '........', '........', '........', '......kk', '.....kll', 'kk..klll', 'klkkllrl', '.kllllll',
      '..kllwkw', '...kllll', '..knNNNN', '.kl.kNNN', '.kk.kNNN', '....kllk', '....kNNk', '....kkkk',
    ] },
    esqueleto: { half: [
      '........', '......kk', '.....kww', '....kwww', '....kwkw', '....kwww', '.....kww', '.....kkw',
      '...kkwkk', '..kw.kww', '..kw.kkk', '.kw..kww', '.k...kkk', '....kw.k', '....kw.k', '...kkk.k',
    ], over: [[15, 15, '.'], [0, 15, '.']] },
    arana: { half: [
      '........', '........', '........', '........', 'k.......', '.k...kkk', '..k.kttt', 'kk.ktttt',
      '..kktrtt', '.k.kttTt', 'k..ktttt', '.kk.kttt', 'k...kkkk', '.k.k..k.', 'k..k...k', '........',
    ] },
    kobold: { half: [
      '........', '........', '.......y', '......yo', '.....koo', '....kooo', '...kooyk', '...koooo',
      '....kwoo', '...kkvvv', '..kokvvv', '.kok.vvv', '..k.kvvv', '....koko', '....kook', '....kkkk',
    ], over: [...range(1, 4, 12, 'n'), [0, 3, 'c'], [1, 3, 'c'], [2, 3, 'c'], [1, 2, 'c']] },
    orco: { half: [
      '........', '........', '.....kkk', '....kddd', '...kdddd', '...kdrdd', '...kdddd', '...kdwdk',
      '..kkdddd', '.kddkNNN', 'kdddkNNN', 'kddkkYYY', '.kk.kNNN', '...kddkk', '...kNNNk', '...kkkkk',
    ], over: [...range(15, 2, 11, 'n'), [13, 2, 'g'], [14, 2, 'g'], [13, 3, 'g'], [14, 3, 'm'], [13, 4, 'g'], [14, 4, 'g']] },
    fantasma: { half: [
      '........', '........', '.....kkk', '....kccc', '...kcccc', '...kckkc', '...kckkc', '..kccccc',
      '..kcccck', '.kccccck', '.kcccccc', '.kcccccc', 'kccccccc', 'kcckcccc', 'kck.kcck', 'kk...kk.',
    ] },
    golem: { half: [
      '........', '...kkkkk', '..kgggGg', '..kgGggg', '..kggcgg', '..kggggg', 'kkkkGggg', 'kgggkggg',
      'kgGgkgGg', 'kggGkggg', 'kgggkgGg', '.kkkkggg', '...kgggk', '...kgGgk', '..kggggk', '..kkkkkk',
    ] },
    lobo: { half: [
      '........', '...kk...', '...kNk..', '...kNNkk', '...kNNNN', '..kNNyNN', '..kNNNNN', '...kNNkw',
      '..kkNNNw', '.kNNkNNN', 'kNNNkNNN', 'kwkNkRRR', '.k..kNNN', '....kNNk', '...kNNNk', '...kkkkk',
    ] },
    cultista: { half: [
      '........', '......kk', '.....kRR', '....kRRR', '....kRtt', '....kRyt', '....kRtt', '....kRRR',
      '...kRRRR', '..kRRRRR', '..kRRRYR', '.ksRRRRR', '.kkRRRRR', '..kRRRRR', '.kRRRRRR', '.kkkkkkk',
    ] },
    mimico: { half: [
      '........', '........', '........', '...kkkkk', '..knnnnn', '..knYnnn', '.kNNNNNN', '.kwkwkwk',
      '.krrrrrr', '.kwkwkwk', '.kNNNNNN', '.knnnYYY', '.knnnYkY', '.knnnnnn', '.kNNNNNN', '..kkkkkk',
    ] },
    gargola: { half: [
      'k.......', 'Gk......', 'GGk...kk', 'GGGk.kGG', 'GGGGkGgG', 'GGGGkgrg', '.GGGkggg', '..GkkgwG',
      '...kGGGG', '..kGGkGG', '..kGkGGG', '.kGk.GGG', '.kk.kGGG', '....kGGk', '...kGGkk', '...kkkk.',
    ] },

    // ---- Peligros ----
    pinchos: { rows: [
      '................', '................', '................', '................', '................',
      '................', '.......m........', '..m....m....m...', '..m...mgm...m...', '.mgm..mgm..mgm..',
      '.mgm.mgggm.mgm..', 'mgggmgggggmgggm.', 'kkkkkkkkkkkkkkkk', 'tttttttttttttttt', 'TtTtTtTtTtTtTtTt', 'tttttttttttttttt',
    ] },
    runa: { half: [
      '........', '........', '....kkkk', '...kGGGG', '..kGGGGG', '.kGGGcGG', '.kGGcGGG', '.kGcGGGc',
      '.kGcccGc', '.kGGGcGG', '.kGGcGcG', '..kGGGGG', '...kGGGG', '....kkkk', '........', '........',
    ] },
    puerta: { half: [
      '...kkkkk', '..knnnnn', '.knnNnnn', '.knnNnnn', '.knnNnnn', 'kYYYYYYY', 'kYkYYYkY', 'knnNnnnn',
      'knnNnnnn', 'knnNnnyy', 'knnNnnnn', 'kYYYYYYY', 'kYkYYYkY', 'knnNnnnn', 'knnNnnnn', 'kkkkkkkk',
    ] },
    gas: { rows: [
      '................', '....ll....ll....', '...llll..llll...', '..lldlll.lldl...', '...llll.llll....',
      '....ll..lll.....', '......lll.......', '.....ll.........', '....kkkkkkk.....', '...kGGGGGGGk....',
      '...kGkGkGkGk....', '...kGGGGGGGk....', 'kkkkkkkkkkkkkkkk', 'tttttttttttttttt', 'TtTtTtTtTtTtTtTt', 'tttttttttttttttt',
    ] },
    abismo: { rows: [
      '................', '................', '................', '................', '................',
      'nnnnn......nnnnn', 'NkNkN......NkNkN', 'gggk.n....n.kggg', 'GGgk..n..n..kgGG', 'GGGk..n.....kGGG',
      'GgGGk......kGGgG', 'GGGGk......kGGGG', 'GGgGGk....kGgGGG', 'GGGGGk....kGGGGG', 'GgGGGGk..kGGGgGG', 'GGGGGGkVVkGGGGGG',
    ] },
    espejo: { half: [
      '....kkkk', '...kYYYY', '..kYcccc', '..kYcwcc', '.kYcwccc', '.kYcccPc', '.kYccPPc', '.kYcPcPc',
      '.kYccccc', '.kYccccc', '..kYcccc', '..kYYYYY', '...kkYYk', '....kYYk', '...kYYYY', '...kkkkk',
    ] },

    // ---- Jefes ----
    liche: { half: [
      '..y..y..', '..yk.yk.', '..yyyyyy', '...kwwww', '...kwkkw', '...kwrkw', '...kwwww', '....kwkw',
      '..kVVVVk', '.kVVVVVV', 'kVVkVVyV', 'kVVkVVVV', 'kwkVVVVV', '.k.kVVVV', '...kVVVV', '..kkkkkk',
    ], over: [...range(15, 2, 14, 'n'), [14, 1, 'c'], [15, 1, 'p'], [15, 0, 'c']] },
    dragona: { rows: [
      '....kk..........', '...krrk.........', '..krrrrk.....kk.', '.krrkyrrk...krRk', '.krrrrrrrk.krRRk',
      'krwkwrrrrrkrRRRk', '.kkkkrrrrrrrRRk.', '.....krrrrrrrk..', '....krroorrrrk..', '...krroooorrrkk.',
      '...krroooorrrrrk', '...kkroooorrkkrk', '....krrrrrrk.krk', '....kRk..kRk..kk', '...kRRk.kRRk....', '...kkkk.kkkk....',
    ] },
    minotauro: { half: [
      'w.......', 'wk......', 'kwk..kkk', '.kwkkNNN', '..kkNNNN', '...kNrNN', '...kNNNN', '...kNNss',
      '..kkNNsk', '.kNNkNNN', 'kNNNkNNN', 'kNNkkYYY', '.kk.kRRR', '...kNNkk', '...kNNNk', '...kkkkk',
    ], over: [...range(0, 3, 12, 'n'), [1, 2, 'g'], [1, 3, 'm'], [1, 4, 'g'], [0, 2, 'g'], [2, 3, 'g']] },

    // ---- Piezas del tablero ----
    back: { half: [
      'kkkkkkkk', 'kRRRRRRR', 'kRrrrrrr', 'kRrRRRRR', 'kRrRyyyy', 'kRrRyRRR', 'kRrRyRyy', 'kRrRyRyR',
      'kRrRyRyR', 'kRrRyRyy', 'kRrRyRRR', 'kRrRyyyy', 'kRrRRRRR', 'kRrrrrrr', 'kRRRRRRR', 'kkkkkkkk',
    ] },
    door: { half: [
      '..kkkkkk', '.kGGGGGG', 'kGgkkkkk', 'kGknnnnn', 'kGknNnnn', 'kGknNnnn', 'kGknNnnn', 'kGknNnnn',
      'kGknNnny', 'kGknNnnY', 'kGknNnnn', 'kGknNnnn', 'kGknNnnn', 'kGknNnnn', 'kGknNnnn', 'kkkkkkkk',
    ], over: [[8, 8, 'n'], [8, 9, 'n']] },
    stairs: { rows: [
      'kkkkkkkkkkkkkkkk', 'kggggggggggggggk', 'kGGGGGGGGGGGGGGk', 'ktttkggggggggggk', 'ktttkGGGGGGGGGGk',
      'kttttttkgggggggk', 'kttttttkGGGGGGGk', 'ktttttttttkggggk', 'ktttttttttkGGGGk', 'kttttttttttttkgk',
      'kttttttttttttkGk', 'kVtttttttttttttk', 'kVVttttttttttttk', 'kVVVVtttttttttVk', 'kVVVVVVttttVVVVk', 'kkkkkkkkkkkkkkkk',
    ] },
    heart: { rows: [
      '................', '................', '..kkk....kkk....', '.krrrk..krrrk...', 'krwrrrkkrrrrrk..', 'krwrrrrrrrrrrk..',
      'krrrrrrrrrrrrk..', 'krrrrrrrrrrrrk..', '.krrrrrrrrrrk...', '..krrrrrrrrk....', '...krrrrrrk.....',
      '....krrrrk......', '.....krrk.......', '......kk........', '................', '................',
    ] },
    hourglass: { rows: [
      '................', '...kkkkkkkkk....', '...knnnnnnnk....', '....kcccccck....', '....kyyyyyyk....', '.....kyyyyk.....',
      '......kyyk......', '.......kk.......', '......kcck......', '.....kccyck.....', '....kcccyyck....',
      '....kcyyyyyk....', '...knnnnnnnk....', '...kkkkkkkkk....', '................', '................',
    ] },
    star: { rows: [
      '................', '.......kk.......', '......kyyk......', '......kyyk......', '.kkkkkkyykkkkkk.', 'kyyyyyyyyyyyyyyk',
      '.kyyyyyyyyyyyyk.', '..kyyyyyyyyyyk..', '...kyyyyyyyyk...', '...kyyyykyyyk...', '..kyyyk..kyyyk..',
      '..kyyk....kyyk..', '.kyk........kyk.', '.kk..........kk.', '................', '................',
    ] },
    sword: { rows: [
      '................', '.............kk.', '............kmmk', '...........kmmk.', '..........kmmk..', '.........kmmk...',
      '........kmmk....', '...kk..kmmk.....', '...kYkkmmk......', '....kYmmk.......', '.....kYk........',
      '....kYkYk.......', '...knk.kYk......', '..knk...kk......', '..kk............', '................',
    ] },
    wall: { rows: [
      'TTTTTTTkTTTTTTTk', 'TttttttkTttttttk', 'TttttttkTttttttk', 'TttttttkTttttttk', 'TttttttkTttttttk', 'TttttttkTttttttk',
      'TttttttkTttttttk', 'kkkkkkkkkkkkkkkk', 'TTTkTTTTTTTkTTTT', 'tttkTtttttttkTtt', 'tttkTtttttttkTtt', 'tttkTtttttttkTtt',
      'tttkTtttttttkTtt', 'tttkTtttttttkTtt', 'tttkTtttttttkTtt', 'kkkkkkkkkkkkkkkk',
    ] },
    torch: { rows: [
      '................', '.......y........', '......yoy.......', '.....yoroy......', '.....orrro......', '......ooo.......',
      '.....kNNNk......', '......knk.......', '......knk.......', '......knk.......', '......knk.......',
      '......knk.......', '......kNk.......', '.......k........', '................', '................',
    ] },
  };

  function rowsOf(def) {
    let rows = def.rows || def.half.map((h) => h + h.split('').reverse().join(''));
    rows = rows.map((r) => r.split(''));
    for (const [x, y, ch] of def.over || []) if (rows[y]) rows[y][x] = ch;
    return rows;
  }
  const cache = {};
  function canvas(name, scale = 1) {
    const def = S[name];
    if (!def) return null;
    const rows = rowsOf(def), h = rows.length, w = rows[0].length;
    const cv = document.createElement('canvas');
    cv.width = w * scale; cv.height = h * scale;
    const g = cv.getContext('2d');
    rows.forEach((row, y) => row.forEach((ch, x) => { if (PAL[ch]) { g.fillStyle = PAL[ch]; g.fillRect(x * scale, y * scale, scale, scale); } }));
    return cv;
  }
  // PNG en memoria (a escala 1: el navegador lo agranda sin suavizar con image-rendering: pixelated)
  function url(name) {
    if (!(name in cache)) { const cv = canvas(name, 1); cache[name] = cv ? cv.toDataURL() : ''; }
    return cache[name];
  }
  function img(name, cls) {
    const im = document.createElement('img');
    im.src = url(name); im.alt = ''; im.className = 'px' + (cls ? ' ' + cls : ''); im.draggable = false;
    return im;
  }
  root.MZS = { PAL, SPRITES: S, rowsOf, canvas, url, img };
})(typeof window !== 'undefined' ? window : globalThis);
