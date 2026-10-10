// Nombre y aspecto de cada base de armadura y de arma, en tablas (las lee el servidor para los nombres y el
// navegador para dibujarlas: armor3d.js y weapons3d.js). Cada nivel (normal, excepcional, élite) tiene 4 variantes;
// el objeto guarda la suya en it.sk. Las variantes sólo cambian nombre y aspecto: las estadísticas salen del nivel.
// Armadura: [nombre, género, { cloth, metal, trim, parts: [piezas de armor3d.js], cape, glow, shiny, scale, tabard }]
// Arma: [nombre, género, { m: modelo 0-2 (por defecto el del nivel), metal, trim, gem, glow }]
(function (root) {
  'use strict';
  const ARMOR = {
    pecho: {
      tela: [
        [
          ["Armadura acolchada", "f", {cloth: "#c8b890", metal: "#5a3a20", trim: "#5a3a20", parts: ["quilt", "belt"]}],
          ["Túnica de peregrino", "f", {cloth: "#6a5a40", metal: "#5a3a20", trim: "#a8743a", parts: ["sash", "belt"]}],
          ["Ropa de novicio", "f", {cloth: "#8a7a5a", metal: "#5a3a20", trim: "#5a3a20", parts: ["sash", "belt", "collar"]}],
          ["Sayo de juglar", "m", {cloth: "#6a2a5a", metal: "#d9a93a", trim: "#d9a93a", parts: ["quilt", "belt", "trimNeck"]}],
        ],
        [
          ["Armadura fantasmal", "f", {cloth: "#d6dae6", metal: "#cfd5de", trim: "#cfd5de", parts: ["collar", "belt", "trimNeck"], "cape": true, "glow": "#9ab0ff"}],
          ["Manto de seda", "m", {cloth: "#7a1a2a", metal: "#d9a93a", trim: "#d9a93a", parts: ["sash", "belt", "trimNeck"], "cape": true}],
          ["Túnica del vidente", "f", {cloth: "#2a4a6a", metal: "#cfd5de", trim: "#cfd5de", parts: ["collar", "belt", "runes", "trimNeck"], "glow": "#7ad0ff"}],
          ["Hábito de penitente", "m", {cloth: "#4a3a2a", metal: "#a8743a", trim: "#a8743a", parts: ["sash", "belt", "collar"], "cape": true}],
        ],
        [
          ["Sudario del ocaso", "m", {cloth: "#2a2238", metal: "#4a2a6a", trim: "#8a5aff", parts: ["collar", "belt", "trimNeck", "runes"], "cape": true, "glow": "#8a5aff"}],
          ["Vestidura arcana", "f", {cloth: "#1a2a6a", metal: "#d9a93a", trim: "#d9a93a", parts: ["collar", "belt", "trimNeck", "runes"], "cape": true, "glow": "#7ad0ff"}],
          ["Manto de la tempestad", "m", {cloth: "#1a3a5a", metal: "#7ad0ff", trim: "#7ad0ff", parts: ["collar", "runes", "belt", "trimNeck"], "cape": true, "glow": "#7ad0ff"}],
          ["Túnica del archimago", "f", {cloth: "#5a1a1a", metal: "#d9a93a", trim: "#d9a93a", parts: ["collar", "sash", "runes", "trimNeck"], "cape": true, "glow": "#ff9a3a"}],
        ],
      ],
      cuero: [
        [
          ["Armadura de cuero", "f", {cloth: "#8a5a32", metal: "#5a3a20", trim: "#a8743a", parts: ["vest", "belt", "pads"]}],
          ["Cuero tachonado", "m", {cloth: "#5a3a20", metal: "#a9aeb7", trim: "#a9aeb7", parts: ["vest", "studs", "belt", "pads"]}],
          ["Coselete de cazador", "m", {cloth: "#6a4a2a", metal: "#5a3a20", trim: "#a8743a", parts: ["vest", "straps", "belt"]}],
          ["Pieles de lobo", "f", {cloth: "#7a6a5a", metal: "#5a3a20", trim: "#cdbb9a", parts: ["vest", "belt", "padsBig"]}],
        ],
        [
          ["Piel de serpiente", "f", {cloth: "#4a5a2a", metal: "#3a4a22", trim: "#a8743a", parts: ["vest", "scales", "belt", "pads"], "scale": "#5a6e30"}],
          ["Piel de demonio", "f", {cloth: "#6a1a12", metal: "#26262c", trim: "#e8dcc0", parts: ["vest", "straps", "belt", "padSpikes"]}],
          ["Jubón endurecido", "m", {cloth: "#5a3a1a", metal: "#3a2414", trim: "#d9a93a", parts: ["vest", "studs", "straps", "belt", "padsBig"]}],
          ["Armadura de trofeos", "f", {cloth: "#4a3a2a", metal: "#26262c", trim: "#e8dcc0", parts: ["vest", "straps", "belt", "padSpikes"]}],
        ],
        [
          ["Piel de wyrm", "f", {cloth: "#2a4a3a", metal: "#1e3a2e", trim: "#d9a93a", parts: ["vest", "scales", "straps", "belt", "padsBig"], "scale": "#2e6a52"}],
          ["Caparazón de escarabajo", "m", {cloth: "#1a2a2a", metal: "#1e4a4a", trim: "#d9a93a", parts: ["carapace", "shellPads", "belt"]}],
          ["Piel de dragón", "f", {cloth: "#5a1a12", metal: "#3a0a08", trim: "#d9a93a", parts: ["vest", "scales", "belt", "padsBig"], "scale": "#8a2a1a"}],
          ["Coraza de sombras", "f", {cloth: "#1a1a24", metal: "#2a2a3a", trim: "#8a5aff", parts: ["carapace", "straps", "belt", "shellPads"], "glow": "#8a5aff"}],
        ],
      ],
      malla: [
        [
          ["Cota de anillas", "f", {cloth: "#8c919a", metal: "#a9aeb7", trim: "#5a3a20", parts: ["mail", "belt"]}],
          ["Cota de escamas", "f", {cloth: "#7a7a6a", metal: "#a9aeb7", trim: "#5a3a20", parts: ["mail", "scales", "belt", "mailSkirt"], "scale": "#8a8a7a"}],
          ["Cota de cuero y anillas", "f", {cloth: "#6a5a4a", metal: "#8c919a", trim: "#5a3a20", parts: ["mail", "studs", "belt"]}],
          ["Camisote de soldado", "m", {cloth: "#8c919a", metal: "#a9aeb7", trim: "#8a1a1a", parts: ["mail", "belt", "tabard"], "tabard": "#8a1a1a"}],
        ],
        [
          ["Malla enlazada", "f", {cloth: "#6a707a", metal: "#a9aeb7", trim: "#5a3a20", parts: ["mail", "mailSkirt", "pauldronSmall", "belt"]}],
          ["Malla tigulada", "f", {cloth: "#5a6068", metal: "#4a4e58", trim: "#8a1a1a", parts: ["mail", "scales", "pauldronSmall", "belt", "tabard"], "scale": "#5e646e", "tabard": "#8a1a1a"}],
          ["Cota de bandas", "f", {cloth: "#5e646e", metal: "#a9aeb7", trim: "#a8743a", parts: ["mail", "scales", "mailSkirt", "pauldronRound", "belt"], "scale": "#7a7066"}],
          ["Malla de cruzado", "f", {cloth: "#6a707a", metal: "#a9aeb7", trim: "#d9a93a", parts: ["mail", "mailSkirt", "tabard", "pauldronSmall", "belt"], "tabard": "#e8e0d0"}],
        ],
        [
          ["Malla de diamante", "f", {cloth: "#cfe0f0", metal: "#cfe0f0", trim: "#cfd5de", parts: ["mail", "pauldronRound", "gorget", "belt", "tabard"], "tabard": "#24357a", "shiny": true}],
          ["Gran camisote", "m", {cloth: "#4a4e58", metal: "#4a4e58", trim: "#d9a93a", parts: ["mail", "mailSkirt", "pauldronLayer", "gorget", "belt"]}],
          ["Malla de mithril", "f", {cloth: "#d8e4f0", metal: "#e0ecf8", trim: "#cfd5de", parts: ["mail", "mailSkirt", "pauldronLayer", "gorget", "belt"], "shiny": true}],
          ["Cota del rey caído", "f", {cloth: "#3a3a44", metal: "#4a4e58", trim: "#d9a93a", parts: ["mail", "scales", "pauldronSpike", "gorget", "tabard", "belt"], "tabard": "#4a1a5a", "scale": "#4a4e58"}],
        ],
      ],
      placas: [
        [
          ["Coraza", "f", {cloth: "#6a6a70", metal: "#a9aeb7", trim: "#a9aeb7", parts: ["breast", "back", "pauldronRound", "belt", "faulds"]}],
          ["Placa gótica", "f", {cloth: "#3a3a40", metal: "#4a4e58", trim: "#4a4e58", parts: ["breast", "ridge", "back", "pauldronSpike", "gorget", "faulds"]}],
          ["Peto de campaña", "m", {cloth: "#5a5a60", metal: "#a9aeb7", trim: "#a8743a", parts: ["breast", "back", "pauldronSmall", "belt", "faulds"]}],
          ["Placa de hierro negro", "f", {cloth: "#2a2a30", metal: "#26262c", trim: "#a9aeb7", parts: ["breast", "ridge", "back", "pauldronRound", "faulds"]}],
        ],
        [
          ["Placa ornamentada", "f", {cloth: "#5a5a62", metal: "#a9aeb7", trim: "#d9a93a", parts: ["breast", "ornate", "back", "pauldronLayer", "gorget", "faulds", "trimNeck"], "cape": true}],
          ["Placa repujada", "f", {cloth: "#5a4a3a", metal: "#a8743a", trim: "#d9a93a", parts: ["breast", "ornate", "back", "pauldronRound", "faulds", "trimNeck"]}],
          ["Placa de templario", "f", {cloth: "#e8e0d0", metal: "#a9aeb7", trim: "#d9a93a", parts: ["breast", "ornate", "back", "pauldronRound", "gorget", "faulds", "tabard"], "tabard": "#8a1a1a", "cape": true}],
          ["Placa de guerra enana", "f", {cloth: "#5a4a3a", metal: "#a8743a", trim: "#d9a93a", parts: ["breast", "ridge", "back", "pauldronLayer", "gorget", "faulds"]}],
        ],
        [
          ["Placa sagrada", "f", {cloth: "#d8d0b8", metal: "#eceff3", trim: "#d9a93a", parts: ["breast", "ornate", "back", "pauldronWing", "gorget", "faulds", "trimNeck"], "cape": true, "glow": "#fff2a0"}],
          ["Placa de arconte", "f", {cloth: "#2a1a1a", metal: "#26262c", trim: "#8a1a1a", parts: ["breast", "ridge", "back", "pauldronSpike", "gorget", "faulds", "trimNeck"], "cape": true, "glow": "#ff3a2a"}],
          ["Placa del dragón dorado", "f", {cloth: "#d9a93a", metal: "#d9a93a", trim: "#eceff3", parts: ["breast", "ornate", "back", "pauldronWing", "gorget", "faulds", "trimNeck"], "cape": true, "glow": "#ffd27a"}],
          ["Placa del vacío", "f", {cloth: "#1c1428", metal: "#2a1a3a", trim: "#8a5aff", parts: ["breast", "ridge", "back", "pauldronSpike", "gorget", "faulds", "runes"], "cape": true, "glow": "#8a5aff"}],
        ],
      ],
    },
    casco: {
      tela: [
        [
          ["Capucha", "f", {cloth: "#6a5a40", metal: 0, trim: 0, parts: ["hood"]}],
          ["Gorro", "m", {cloth: "#8a1a1a", metal: 0, trim: "#d9a93a", parts: ["cap"]}],
          ["Gorro de lana", "m", {cloth: "#6a4a2a", parts: ["cap"]}],
          ["Capucha de bandido", "f", {cloth: "#3a3a2a", parts: ["hood"]}],
        ],
        [
          ["Capucha de mago", "f", {cloth: "#24357a", metal: 0, trim: "#d9a93a", parts: ["hood", "point"]}],
          ["Turbante", "m", {cloth: "#e8e0d0", metal: 0, trim: "#d9a93a", parts: ["turban"]}],
          ["Capucha de cazador", "f", {cloth: "#2a4a2a", trim: "#a8743a", parts: ["hood", "point"]}],
          ["Turbante de seda", "m", {cloth: "#3a1a5a", trim: "#d9a93a", parts: ["turban"]}],
        ],
        [
          ["Diadema", "f", {cloth: 0, metal: "#d9a93a", trim: "#d9a93a", parts: ["circlet"]}],
          ["Capucha del vacío", "f", {cloth: "#1c1428", metal: 0, trim: "#8a5aff", parts: ["hood", "hoodGlow"]}],
          ["Tiara del alba", "f", {metal: "#d9a93a", trim: "#fff2a0", parts: ["circlet"]}],
          ["Capucha del nigromante", "f", {cloth: "#0a0a0a", trim: "#7aff8a", parts: ["hood", "hoodGlow"]}],
        ],
      ],
      cuero: [
        [
          ["Gorro de cuero", "m", {cloth: "#8a5a32", metal: 0, trim: "#5a3a20", parts: ["leatherCap"]}],
          ["Casquete", "m", {cloth: "#5a3a20", metal: "#a9aeb7", trim: "#a9aeb7", parts: ["leatherCap", "band"]}],
          ["Gorra de explorador", "f", {cloth: "#7a5a3a", trim: "#5a3a20", parts: ["leatherCap", "plume"]}],
          ["Casco tachonado", "m", {cloth: "#4a3020", metal: "#a9aeb7", trim: "#a9aeb7", parts: ["leatherCap", "band"]}],
        ],
        [
          ["Sombrero de guerra", "m", {cloth: "#5a3a20", metal: 0, trim: "#a8743a", parts: ["brimHat"]}],
          ["Máscara de hueso", "f", {cloth: "#e8dcc0", metal: 0, trim: 0, parts: ["boneMask"]}],
          ["Sombrero de alas anchas", "m", {cloth: "#3a2a1a", trim: "#d9a93a", parts: ["brimHat", "plume"]}],
          ["Máscara de lobo", "f", {cloth: "#5a4a3a", parts: ["leatherCap", "boneMask"]}],
        ],
        [
          ["Shako", "m", {cloth: "#3a2a5a", metal: "#d9a93a", trim: "#d9a93a", parts: ["shako", "plume"]}],
          ["Calavera de hidra", "f", {cloth: "#e8dcc0", metal: 0, trim: 0, parts: ["skullHelm"]}],
          ["Yelmo del caudillo", "m", {cloth: "#3a2a1a", metal: "#a8743a", trim: "#d9a93a", parts: ["leatherCap", "band", "horns"]}],
          ["Máscara del chamán", "f", {cloth: "#3a2a1a", parts: ["boneMask", "plume"]}],
        ],
      ],
      malla: [
        [
          ["Almófar", "m", {cloth: "#8c919a", metal: "#8c919a", trim: 0, parts: ["coif"]}],
          ["Yelmo de malla", "m", {cloth: "#8c919a", metal: "#a9aeb7", trim: 0, parts: ["coif", "dome"]}],
          ["Capucha de malla", "f", {cloth: "#8c919a", metal: "#a9aeb7", parts: ["coif", "band"]}],
          ["Casco de anillas", "m", {cloth: "#8c919a", metal: "#a9aeb7", parts: ["coif", "basinet"]}],
        ],
        [
          ["Bacinete", "m", {cloth: "#8c919a", metal: "#a9aeb7", trim: 0, parts: ["basinet", "aventail"]}],
          ["Celada", "f", {cloth: "#8c919a", metal: "#a9aeb7", trim: 0, parts: ["sallet"]}],
          ["Celada de arquero", "f", {cloth: "#8c919a", metal: "#a9aeb7", parts: ["sallet", "plume"]}],
          ["Bacinete de pico", "m", {cloth: "#8c919a", metal: "#4a4e58", parts: ["basinet", "aventail", "plume"]}],
        ],
        [
          ["Armet", "m", {cloth: "#8c919a", metal: "#a9aeb7", trim: "#d9a93a", parts: ["armet", "plume"]}],
          ["Yelmo con púas", "m", {cloth: "#8c919a", metal: "#4a4e58", trim: 0, parts: ["dome", "spikes", "aventail"]}],
          ["Armet de mithril", "m", {cloth: "#d8e4f0", metal: "#e0ecf8", trim: "#cfd5de", parts: ["armet", "plume"]}],
          ["Yelmo del caballero negro", "m", {cloth: "#8c919a", metal: "#26262c", trim: "#8a1a1a", parts: ["armet", "spikes"]}],
        ],
      ],
      placas: [
        [
          ["Yelmo", "m", {cloth: 0, metal: "#a9aeb7", trim: 0, parts: ["dome", "nasal", "cheeks"]}],
          ["Gran yelmo", "m", {cloth: 0, metal: "#a9aeb7", trim: "#4a4e58", parts: ["greatHelm"]}],
          ["Capacete", "m", {metal: "#a9aeb7", parts: ["dome", "cheeks"]}],
          ["Yelmo de cubo", "m", {metal: "#4a4e58", trim: "#a9aeb7", parts: ["greatHelm"]}],
        ],
        [
          ["Yelmo alado", "m", {cloth: 0, metal: "#a9aeb7", trim: "#d9a93a", parts: ["dome", "nasal", "wings"]}],
          ["Yelmo con cuernos", "m", {cloth: 0, metal: "#4a4e58", trim: "#e8dcc0", parts: ["dome", "cheeks", "horns"]}],
          ["Gran yelmo dorado", "m", {metal: "#a9aeb7", trim: "#d9a93a", parts: ["greatHelm", "plume"]}],
          ["Yelmo del toro", "m", {metal: "#4a4e58", trim: "#e8dcc0", parts: ["dome", "nasal", "horns", "cheeks"]}],
        ],
        [
          ["Corona", "f", {cloth: 0, metal: "#d9a93a", trim: "#d9a93a", parts: ["crown"]}],
          ["Cabeza de demonio", "f", {cloth: 0, metal: "#26262c", trim: "#8a1a1a", parts: ["dome", "demonHorns", "demonMask"], "glow": "#ff3a2a"}],
          ["Corona de espinas", "f", {metal: "#4a4e58", trim: "#8a8a90", parts: ["crown", "spikes"]}],
          ["Yelmo del serafín", "m", {metal: "#eceff3", trim: "#d9a93a", parts: ["dome", "nasal", "wings", "plume"], "glow": "#fff2a0"}],
        ],
      ],
    },
    guantes: {
      tela: [
        [
          ["Guantes de tela", "mp", {cloth: "#c8b890", metal: 0, trim: 0, parts: ["wraps"]}],
          ["Vendas", "fp", {cloth: "#e0d8c0", metal: 0, trim: 0, parts: ["wraps", "wrapsLong"]}],
          ["Mitones de lana", "mp", {cloth: "#7a6a5a", parts: ["cuffCloth"]}],
          ["Vendas de monje", "fp", {cloth: "#d8d0c0", parts: ["wraps", "wrapsLong", "cuffCloth"]}],
        ],
        [
          ["Guantes de seda", "mp", {cloth: "#7a1a2a", metal: 0, trim: "#d9a93a", parts: ["cuffCloth"]}],
          ["Guantes arcanos", "mp", {cloth: "#24357a", metal: 0, trim: "#7ad0ff", parts: ["cuffCloth", "runeHand"], "glow": "#7ad0ff"}],
          ["Guantes del erudito", "mp", {cloth: "#3a2a5a", trim: "#d9a93a", parts: ["cuffCloth", "cuffGold"]}],
          ["Guantes de escarcha", "mp", {cloth: "#cfe0f0", trim: "#7ad0ff", parts: ["cuffCloth", "runeHand"], "glow": "#7ad0ff"}],
        ],
        [
          ["Guantes del vacío", "mp", {cloth: "#1c1428", metal: 0, trim: "#8a5aff", parts: ["cuffCloth", "runeHand"], "glow": "#8a5aff"}],
          ["Guantes de hechicero", "mp", {cloth: "#2a1a3a", metal: 0, trim: "#d9a93a", parts: ["cuffCloth", "cuffGold"]}],
          ["Guantes del lich", "mp", {cloth: "#1a1a1a", trim: "#7aff8a", parts: ["cuffCloth", "cuffGold", "runeHand"], "glow": "#7aff8a"}],
          ["Manos de fuego", "fp", {cloth: "#5a1a0a", trim: "#ff7a2a", parts: ["cuffCloth", "runeHand"], "glow": "#ff7a2a"}],
        ],
      ],
      cuero: [
        [
          ["Guantes de cuero", "mp", {cloth: "#8a5a32", metal: 0, trim: 0, parts: ["cuffLeather", "hand"]}],
          ["Guantes de piel", "mp", {cloth: "#5a3a20", metal: 0, trim: "#cdbb9a", parts: ["cuffFur", "hand"]}],
          ["Guantes de arquero", "mp", {cloth: "#6a4a2a", parts: ["bracer", "hand"]}],
          ["Guantes de trampero", "mp", {cloth: "#5a4a3a", trim: "#cdbb9a", parts: ["cuffFur", "hand"]}],
        ],
        [
          ["Guantes de tiburón", "mp", {cloth: "#6a7078", metal: 0, trim: 0, parts: ["cuffLeather", "hand"]}],
          ["Brazales", "mp", {cloth: "#5a3a20", metal: "#a9aeb7", trim: 0, parts: ["bracer", "hand"]}],
          ["Brazales tachonados", "mp", {cloth: "#4a3020", metal: "#a9aeb7", parts: ["bracer", "hand", "studsArm"]}],
          ["Guantes de sombra", "mp", {cloth: "#2a2a30", parts: ["cuffLeather", "hand", "claws"]}],
        ],
        [
          ["Guantes de vampiro", "mp", {cloth: "#5a0e10", metal: "#26262c", trim: 0, parts: ["bracer", "hand", "knuckleSpikes"]}],
          ["Brazales de ogro", "mp", {cloth: "#3a2616", metal: "#a9aeb7", trim: 0, parts: ["bracerBig", "hand", "studsArm"]}],
          ["Guantes de piel de dragón", "mp", {cloth: "#5a1a12", metal: "#3a0a08", parts: ["bracerBig", "hand", "knuckleSpikes"]}],
          ["Garras de bestia", "fp", {cloth: "#3a2a1a", trim: "#cdbb9a", parts: ["cuffFur", "hand", "claws"]}],
        ],
      ],
      malla: [
        [
          ["Guanteletes de malla", "mp", {cloth: "#8c919a", metal: "#8c919a", trim: 0, parts: ["cuffChain", "hand"]}],
          ["Mitones de anillas", "mp", {cloth: "#8c919a", metal: "#8c919a", trim: 0, parts: ["cuffChain", "handBig"]}],
          ["Guantes de malla ligera", "mp", {cloth: "#9a9ea6", metal: "#8c919a", parts: ["cuffChain", "hand"]}],
          ["Mitones de cota", "mp", {cloth: "#7a7a6a", metal: "#8c919a", parts: ["cuffChain", "handBig", "knuckleSpikes"]}],
        ],
        [
          ["Guanteletes enlazados", "mp", {cloth: "#6a707a", metal: "#a9aeb7", trim: 0, parts: ["cuffChain", "hand", "cuffPlate"]}],
          ["Brazales de escamas", "mp", {cloth: "#5e646e", metal: "#4a4e58", trim: 0, parts: ["bracer", "hand"]}],
          ["Guanteletes de cruzado", "mp", {cloth: "#6a707a", metal: "#a9aeb7", trim: "#d9a93a", parts: ["cuffPlate", "hand", "cuffGold"]}],
          ["Guanteletes de escamas", "mp", {cloth: "#5e646e", metal: "#4a4e58", parts: ["cuffChain", "handBig", "studsArm"]}],
        ],
        [
          ["Guanteletes de diamante", "mp", {cloth: "#cfe0f0", metal: "#cfe0f0", trim: "#cfd5de", parts: ["cuffPlate", "hand"], "shiny": true}],
          ["Garras de dragón", "fp", {cloth: "#4a4e58", metal: "#3a5a3a", trim: "#d9a93a", parts: ["cuffPlate", "hand", "claws"]}],
          ["Guanteletes de mithril", "mp", {cloth: "#d8e4f0", metal: "#e0ecf8", trim: "#cfd5de", parts: ["cuffFlare", "hand"], "shiny": true}],
          ["Guanteletes del rey caído", "mp", {cloth: "#4a4e58", metal: "#4a4e58", trim: "#d9a93a", parts: ["cuffFlare", "handBig", "knuckleSpikes"]}],
        ],
      ],
      placas: [
        [
          ["Guanteletes", "mp", {cloth: 0, metal: "#a9aeb7", trim: 0, parts: ["cuffPlate", "handPlate"]}],
          ["Manoplas", "fp", {cloth: 0, metal: "#a9aeb7", trim: 0, parts: ["cuffPlate", "handBig"]}],
          ["Guanteletes de hierro", "mp", {metal: "#a9aeb7", parts: ["cuffPlate", "handPlate", "studsArm"]}],
          ["Manoplas de soldado", "fp", {metal: "#4a4e58", parts: ["cuffPlate", "handBig"]}],
        ],
        [
          ["Guanteletes de guerra", "mp", {cloth: 0, metal: "#a9aeb7", trim: "#d9a93a", parts: ["cuffFlare", "handPlate", "knuckleSpikes"]}],
          ["Puños de hierro", "mp", {cloth: 0, metal: "#4a4e58", trim: 0, parts: ["cuffPlate", "handBig"]}],
          ["Guanteletes de templario", "mp", {metal: "#a9aeb7", trim: "#d9a93a", parts: ["cuffFlare", "handPlate"]}],
          ["Puños de guerra enanos", "mp", {metal: "#a8743a", trim: "#d9a93a", parts: ["cuffFlare", "handBig", "knuckleSpikes"]}],
        ],
        [
          ["Guanteletes de ogro", "mp", {cloth: 0, metal: "#4a4e58", trim: "#a8743a", parts: ["cuffFlare", "handBig", "knuckleSpikes"]}],
          ["Guanteletes de arconte", "mp", {cloth: 0, metal: "#26262c", trim: "#8a1a1a", parts: ["cuffFlare", "handPlate", "claws"], "glow": "#ff3a2a"}],
          ["Guanteletes del serafín", "mp", {metal: "#eceff3", trim: "#d9a93a", parts: ["cuffFlare", "handPlate", "runeHand"], "glow": "#fff2a0"}],
          ["Guanteletes del vacío", "mp", {metal: "#2a1a3a", trim: "#8a5aff", parts: ["cuffFlare", "handBig", "claws", "runeHand"], "glow": "#8a5aff"}],
        ],
      ],
    },
    botas: {
      tela: [
        [
          ["Sandalias", "fp", {cloth: "#8a5a32", metal: 0, trim: 0, parts: ["sandal"]}],
          ["Zapatillas", "fp", {cloth: "#6a4a6a", metal: 0, trim: 0, parts: ["slipper"]}],
          ["Alpargatas", "fp", {cloth: "#a8946a", parts: ["sandal"]}],
          ["Zapatos de peregrino", "mp", {cloth: "#5a4a3a", parts: ["slipper"]}],
        ],
        [
          ["Botas de seda", "fp", {cloth: "#7a1a2a", metal: 0, trim: "#d9a93a", parts: ["softBoot"]}],
          ["Escarpines de mago", "mp", {cloth: "#24357a", metal: 0, trim: "#d9a93a", parts: ["slipper", "curlToe"]}],
          ["Botas de juglar", "fp", {cloth: "#6a2a5a", trim: "#d9a93a", parts: ["softBoot", "curlToe"]}],
          ["Botas de escarcha", "fp", {cloth: "#cfe0f0", trim: "#cfd5de", parts: ["softBoot"], "glow": "#7ad0ff"}],
        ],
        [
          ["Pasos del vacío", "mp", {cloth: "#1c1428", metal: 0, trim: "#8a5aff", parts: ["softBoot"], "glow": "#8a5aff"}],
          ["Botas de bruma", "fp", {cloth: "#c8ccd8", metal: 0, trim: "#cfd5de", parts: ["softBoot"], "glow": "#cfe0ff"}],
          ["Pasos del lich", "mp", {cloth: "#1a1a1a", trim: "#7aff8a", parts: ["softBoot"], "glow": "#7aff8a"}],
          ["Botas de llama", "fp", {cloth: "#5a1a0a", trim: "#ff7a2a", parts: ["softBoot", "curlToe"], "glow": "#ff7a2a"}],
        ],
      ],
      cuero: [
        [
          ["Botas de cuero", "fp", {cloth: "#8a5a32", metal: 0, trim: 0, parts: ["boot"]}],
          ["Botas pesadas", "fp", {cloth: "#5a3a20", metal: 0, trim: 0, parts: ["boot", "fold"]}],
          ["Botas de cazador", "fp", {cloth: "#6a4a2a", parts: ["boot", "fold"]}],
          ["Botas de trampero", "fp", {cloth: "#5a4a3a", parts: ["boot", "scalesLeg"], "scale": "#7a6a5a"}],
        ],
        [
          ["Botas de piel de demonio", "fp", {cloth: "#5a0e10", metal: "#26262c", trim: 0, parts: ["boot", "shinSpike"]}],
          ["Botas de tiburón", "fp", {cloth: "#6a7078", metal: 0, trim: 0, parts: ["boot", "fold"]}],
          ["Botas tachonadas", "fp", {cloth: "#4a3020", metal: "#a9aeb7", parts: ["boot", "kneeCop"]}],
          ["Botas de sombra", "fp", {cloth: "#2a2a30", parts: ["boot", "shinSpike"]}],
        ],
        [
          ["Botas de wyrm", "fp", {cloth: "#2a4a3a", metal: 0, trim: "#d9a93a", parts: ["boot", "scalesLeg"], "scale": "#2e6a52"}],
          ["Botas de escarabajo", "fp", {cloth: "#1a2a2a", metal: "#1e4a4a", trim: 0, parts: ["boot", "shellShin"]}],
          ["Botas de piel de dragón", "fp", {cloth: "#5a1a12", trim: "#d9a93a", parts: ["boot", "scalesLeg"], "scale": "#8a2a1a"}],
          ["Botas de bestia", "fp", {cloth: "#3a2a1a", metal: "#3a2a1a", parts: ["boot", "fold", "shinSpike"]}],
        ],
      ],
      malla: [
        [
          ["Botas de malla", "fp", {cloth: "#8c919a", metal: "#8c919a", trim: 0, parts: ["boot", "chainLeg"]}],
          ["Botas de anillas", "fp", {cloth: "#8c919a", metal: "#8c919a", trim: 0, parts: ["boot", "chainLeg", "fold"]}],
          ["Calzas de malla", "fp", {cloth: "#8c919a", metal: "#8c919a", parts: ["boot", "chainLeg", "kneeCop"]}],
          ["Botas de soldado", "fp", {cloth: "#7a7a6a", metal: "#8c919a", parts: ["boot", "chainLeg"]}],
        ],
        [
          ["Botas enlazadas", "fp", {cloth: "#6a707a", metal: "#a9aeb7", trim: 0, parts: ["boot", "chainLeg", "kneeCop"]}],
          ["Botas de escamas", "fp", {cloth: "#5e646e", metal: "#4a4e58", trim: 0, parts: ["boot", "scalesLeg"], "scale": "#5e646e"}],
          ["Botas de cruzado", "fp", {cloth: "#6a707a", metal: "#a9aeb7", trim: "#d9a93a", parts: ["boot", "chainLeg", "kneeCop", "layered"]}],
          ["Botas de bandas", "fp", {cloth: "#5e646e", metal: "#4a4e58", parts: ["boot", "scalesLeg", "kneeCop"], "scale": "#7a7066"}],
        ],
        [
          ["Botas de diamante", "fp", {cloth: "#cfe0f0", metal: "#cfe0f0", trim: 0, parts: ["boot", "kneeCop", "greave"], "shiny": true}],
          ["Botas de mithril", "fp", {cloth: "#b8c8e0", metal: "#c8d8f0", trim: "#cfd5de", parts: ["boot", "greave", "kneeCop"], "shiny": true}],
          ["Botas del rey caído", "fp", {cloth: "#4a4e58", metal: "#4a4e58", trim: "#d9a93a", parts: ["boot", "greave", "kneeSpike"]}],
          ["Botas de escamas de wyrm", "fp", {cloth: "#2e6a52", metal: "#2e6a52", trim: "#d9a93a", parts: ["boot", "scalesLeg", "greave"], "scale": "#2e6a52"}],
        ],
      ],
      placas: [
        [
          ["Grebas", "fp", {cloth: 0, metal: "#a9aeb7", trim: 0, parts: ["greave", "kneeCop", "sabaton"]}],
          ["Botas de placas", "fp", {cloth: 0, metal: "#a9aeb7", trim: 0, parts: ["greave", "sabaton"]}],
          ["Grebas de hierro", "fp", {metal: "#a9aeb7", parts: ["greave", "sabaton", "layered"]}],
          ["Botas de placas negras", "fp", {metal: "#26262c", parts: ["greave", "kneeCop", "sabaton"]}],
        ],
        [
          ["Grebas de guerra", "fp", {cloth: 0, metal: "#a9aeb7", trim: "#d9a93a", parts: ["greave", "kneeCop", "kneeSpike", "sabaton"]}],
          ["Grebas de batalla", "fp", {cloth: 0, metal: "#4a4e58", trim: 0, parts: ["greave", "kneeCop", "sabaton", "layered"]}],
          ["Grebas de templario", "fp", {metal: "#a9aeb7", trim: "#d9a93a", parts: ["greave", "kneeCop", "sabaton"]}],
          ["Grebas enanas", "fp", {metal: "#a8743a", trim: "#d9a93a", parts: ["greave", "kneeCop", "sabaton", "layered"]}],
        ],
        [
          ["Grebas de arconte", "fp", {cloth: 0, metal: "#26262c", trim: "#8a1a1a", parts: ["greave", "kneeSpike", "sabaton", "layered"], "glow": "#ff3a2a"}],
          ["Grebas del mito", "fp", {cloth: 0, metal: "#d9a93a", trim: "#eceff3", parts: ["greave", "kneeCop", "sabaton"]}],
          ["Grebas del serafín", "fp", {metal: "#eceff3", trim: "#d9a93a", parts: ["greave", "kneeCop", "sabaton"], "glow": "#fff2a0"}],
          ["Grebas del vacío", "fp", {metal: "#2a1a3a", trim: "#8a5aff", parts: ["greave", "kneeSpike", "sabaton", "layered"], "glow": "#8a5aff"}],
        ],
      ],
    },
  };
  const WEAPONS = {
    espada: [
      [["Espada corta", "f", {}], ["Espada larga", "f", {metal: "#eef2f8", trim: "#2a2a30", "gem": "#2a2a30"}], ["Espada de bronce", "f", {metal: "#c8925a", trim: "#a8743a"}], ["Espada de hierro negro", "f", {"m": 1, metal: "#3a3a42", trim: "#5a5a62", "gem": "#5a5a62"}]],
      [["Espada de guerra", "f", {}], ["Espada bastarda", "f", {"m": 0, trim: "#9aa0a8", "gem": "#2aa84a"}], ["Espada rúnica", "f", {trim: "#4a7aff", "gem": "#4a7aff", "glow": "#4a7aff"}], ["Espada del caballero", "f", {"m": 2, metal: "#e2e6ee", trim: "#dcae3c", "gem": "#d8102a", "glow": "#ffd27a"}]],
      [["Hoja fásica", "f", {}], ["Hoja de cristal", "f", {"m": 1, metal: "#c8e8f8", trim: "#7ad0ff", "gem": "#7ad0ff", "glow": "#7ad0ff"}], ["Espada del alba", "f", {metal: "#f4f0dc", trim: "#ffd27a", "gem": "#fff2a0", "glow": "#fff2a0"}], ["Hoja del vacío", "f", {metal: "#2a1a3a", trim: "#8a5aff", "gem": "#8a5aff", "glow": "#8a5aff"}]],
    ],
    daga: [
      [["Daga", "f", {}], ["Cuchillo", "m", {metal: "#eef2f8", trim: "#2a2a30", "gem": "#2a2a30"}], ["Estilete", "m", {metal: "#c8925a", trim: "#a8743a"}], ["Daga de bronce", "f", {"m": 1, metal: "#3a3a42", trim: "#5a5a62", "gem": "#5a5a62"}]],
      [["Puñal", "m", {}], ["Kris", "m", {"m": 0, trim: "#9aa0a8", "gem": "#2aa84a"}], ["Daga rúnica", "f", {trim: "#4a7aff", "gem": "#4a7aff", "glow": "#4a7aff"}], ["Daga del asesino", "f", {"m": 2, metal: "#e2e6ee", trim: "#dcae3c", "gem": "#d8102a", "glow": "#ffd27a"}]],
      [["Cuchillo de hueso", "m", {}], ["Colmillo de dragón", "m", {"m": 1, metal: "#c8e8f8", trim: "#7ad0ff", "gem": "#7ad0ff", "glow": "#7ad0ff"}], ["Daga del alba", "f", {metal: "#f4f0dc", trim: "#ffd27a", "gem": "#fff2a0", "glow": "#fff2a0"}], ["Daga del vacío", "f", {metal: "#2a1a3a", trim: "#8a5aff", "gem": "#8a5aff", "glow": "#8a5aff"}]],
    ],
    hacha: [
      [["Hacha de mano", "f", {}], ["Hacha de leñador", "f", {metal: "#eef2f8", trim: "#2a2a30", "gem": "#2a2a30"}], ["Hacha de bronce", "f", {metal: "#c8925a", trim: "#a8743a"}], ["Hacha de hierro negro", "f", {"m": 1, metal: "#3a3a42", trim: "#5a5a62", "gem": "#5a5a62"}]],
      [["Hacha de guerra", "f", {}], ["Hacha de batalla", "f", {"m": 0, trim: "#9aa0a8", "gem": "#2aa84a"}], ["Hacha rúnica", "f", {trim: "#4a7aff", "gem": "#4a7aff", "glow": "#4a7aff"}], ["Hacha barbada", "f", {"m": 2, metal: "#e2e6ee", trim: "#dcae3c", "gem": "#d8102a", "glow": "#ffd27a"}]],
      [["Tomahawk", "m", {}], ["Hacha del berserker", "f", {"m": 1, metal: "#c8e8f8", trim: "#7ad0ff", "gem": "#7ad0ff", "glow": "#7ad0ff"}], ["Hacha del alba", "f", {metal: "#f4f0dc", trim: "#ffd27a", "gem": "#fff2a0", "glow": "#fff2a0"}], ["Hacha del abismo", "f", {metal: "#2a1a3a", trim: "#8a5aff", "gem": "#8a5aff", "glow": "#8a5aff"}]],
    ],
    maza: [
      [["Maza", "f", {}], ["Garrote", "m", {metal: "#eef2f8", trim: "#2a2a30", "gem": "#2a2a30"}], ["Maza de bronce", "f", {metal: "#c8925a", trim: "#a8743a"}], ["Maza de hierro", "f", {"m": 1, metal: "#3a3a42", trim: "#5a5a62", "gem": "#5a5a62"}]],
      [["Maza con rebordes", "f", {}], ["Lucero", "m", {"m": 0, trim: "#9aa0a8", "gem": "#2aa84a"}], ["Maza rúnica", "f", {trim: "#4a7aff", "gem": "#4a7aff", "glow": "#4a7aff"}], ["Maza bendita", "f", {"m": 2, metal: "#e2e6ee", trim: "#dcae3c", "gem": "#d8102a", "glow": "#ffd27a"}]],
      [["Maza reforzada", "f", {}], ["Maza de cristal", "f", {"m": 1, metal: "#c8e8f8", trim: "#7ad0ff", "gem": "#7ad0ff", "glow": "#7ad0ff"}], ["Lucero del alba", "m", {metal: "#f4f0dc", trim: "#ffd27a", "gem": "#fff2a0", "glow": "#fff2a0"}], ["Maza del vacío", "f", {metal: "#2a1a3a", trim: "#8a5aff", "gem": "#8a5aff", "glow": "#8a5aff"}]],
    ],
    espadon: [
      [["Mandoble", "m", {}], ["Claymore", "f", {metal: "#eef2f8", trim: "#2a2a30", "gem": "#2a2a30"}], ["Espadón de bronce", "m", {metal: "#c8925a", trim: "#a8743a"}], ["Espadón negro", "m", {"m": 1, metal: "#3a3a42", trim: "#5a5a62", "gem": "#5a5a62"}]],
      [["Montante", "m", {}], ["Flamberge", "f", {"m": 0, trim: "#9aa0a8", "gem": "#2aa84a"}], ["Montante rúnico", "m", {trim: "#4a7aff", "gem": "#4a7aff", "glow": "#4a7aff"}], ["Espadón del verdugo", "m", {"m": 2, metal: "#e2e6ee", trim: "#dcae3c", "gem": "#d8102a", "glow": "#ffd27a"}]],
      [["Espada de campeón", "f", {}], ["Espada de cristal", "f", {"m": 1, metal: "#c8e8f8", trim: "#7ad0ff", "gem": "#7ad0ff", "glow": "#7ad0ff"}], ["Mandoble del alba", "m", {metal: "#f4f0dc", trim: "#ffd27a", "gem": "#fff2a0", "glow": "#fff2a0"}], ["Hoja del abismo", "f", {metal: "#2a1a3a", trim: "#8a5aff", "gem": "#8a5aff", "glow": "#8a5aff"}]],
    ],
    martillo: [
      [["Martillo de guerra", "m", {}], ["Mazo", "m", {metal: "#eef2f8", trim: "#2a2a30", "gem": "#2a2a30"}], ["Martillo de bronce", "m", {metal: "#c8925a", trim: "#a8743a"}], ["Martillo de hierro", "m", {"m": 1, metal: "#3a3a42", trim: "#5a5a62", "gem": "#5a5a62"}]],
      [["Martillo de batalla", "m", {}], ["Martillo de asedio", "m", {"m": 0, trim: "#9aa0a8", "gem": "#2aa84a"}], ["Martillo rúnico", "m", {trim: "#4a7aff", "gem": "#4a7aff", "glow": "#4a7aff"}], ["Martillo del herrero", "m", {"m": 2, metal: "#e2e6ee", trim: "#dcae3c", "gem": "#d8102a", "glow": "#ffd27a"}]],
      [["Martillo legendario", "m", {}], ["Martillo del trueno", "m", {"m": 1, metal: "#c8e8f8", trim: "#7ad0ff", "gem": "#7ad0ff", "glow": "#7ad0ff"}], ["Martillo del alba", "m", {metal: "#f4f0dc", trim: "#ffd27a", "gem": "#fff2a0", "glow": "#fff2a0"}], ["Martillo del vacío", "m", {metal: "#2a1a3a", trim: "#8a5aff", "gem": "#8a5aff", "glow": "#8a5aff"}]],
    ],
    lanza: [
      [["Lanza", "f", {}], ["Pica", "f", {metal: "#eef2f8", trim: "#2a2a30", "gem": "#2a2a30"}], ["Lanza de bronce", "f", {metal: "#c8925a", trim: "#a8743a"}], ["Venablo", "m", {"m": 1, metal: "#3a3a42", trim: "#5a5a62", "gem": "#5a5a62"}]],
      [["Lanza de guerra", "f", {}], ["Partesana", "f", {"m": 0, trim: "#9aa0a8", "gem": "#2aa84a"}], ["Lanza rúnica", "f", {trim: "#4a7aff", "gem": "#4a7aff", "glow": "#4a7aff"}], ["Lanza del jinete", "f", {"m": 2, metal: "#e2e6ee", trim: "#dcae3c", "gem": "#d8102a", "glow": "#ffd27a"}]],
      [["Lanza de Hiperión", "f", {}], ["Lanza de cristal", "f", {"m": 1, metal: "#c8e8f8", trim: "#7ad0ff", "gem": "#7ad0ff", "glow": "#7ad0ff"}], ["Lanza del alba", "f", {metal: "#f4f0dc", trim: "#ffd27a", "gem": "#fff2a0", "glow": "#fff2a0"}], ["Lanza del vacío", "f", {metal: "#2a1a3a", trim: "#8a5aff", "gem": "#8a5aff", "glow": "#8a5aff"}]],
    ],
    arco: [
      [["Arco corto", "m", {}], ["Arco de caza", "m", {metal: "#eef2f8", trim: "#2a2a30", "gem": "#2a2a30"}], ["Arco de tejo", "m", {metal: "#c8925a", trim: "#a8743a"}], ["Arco de hueso", "m", {"m": 1, metal: "#3a3a42", trim: "#5a5a62", "gem": "#5a5a62"}]],
      [["Arco de filo", "m", {}], ["Arco largo", "m", {"m": 0, trim: "#9aa0a8", "gem": "#2aa84a"}], ["Arco rúnico", "m", {trim: "#4a7aff", "gem": "#4a7aff", "glow": "#4a7aff"}], ["Arco del explorador", "m", {"m": 2, metal: "#e2e6ee", trim: "#dcae3c", "gem": "#d8102a", "glow": "#ffd27a"}]],
      [["Arco araña", "m", {}], ["Arco de cristal", "m", {"m": 1, metal: "#c8e8f8", trim: "#7ad0ff", "gem": "#7ad0ff", "glow": "#7ad0ff"}], ["Arco del alba", "m", {metal: "#f4f0dc", trim: "#ffd27a", "gem": "#fff2a0", "glow": "#fff2a0"}], ["Arco del vacío", "m", {metal: "#2a1a3a", trim: "#8a5aff", "gem": "#8a5aff", "glow": "#8a5aff"}]],
    ],
    ballesta: [
      [["Ballesta ligera", "f", {}], ["Ballesta de caza", "f", {metal: "#eef2f8", trim: "#2a2a30", "gem": "#2a2a30"}], ["Ballesta de bronce", "f", {metal: "#c8925a", trim: "#a8743a"}], ["Ballesta de mano", "f", {"m": 1, metal: "#3a3a42", trim: "#5a5a62", "gem": "#5a5a62"}]],
      [["Ballesta de asedio", "f", {}], ["Ballesta pesada", "f", {"m": 0, trim: "#9aa0a8", "gem": "#2aa84a"}], ["Ballesta rúnica", "f", {trim: "#4a7aff", "gem": "#4a7aff", "glow": "#4a7aff"}], ["Arbalesta", "f", {"m": 2, metal: "#e2e6ee", trim: "#dcae3c", "gem": "#d8102a", "glow": "#ffd27a"}]],
      [["Ballesta colosal", "f", {}], ["Ballesta de cristal", "f", {"m": 1, metal: "#c8e8f8", trim: "#7ad0ff", "gem": "#7ad0ff", "glow": "#7ad0ff"}], ["Ballesta del alba", "f", {metal: "#f4f0dc", trim: "#ffd27a", "gem": "#fff2a0", "glow": "#fff2a0"}], ["Ballesta del vacío", "f", {metal: "#2a1a3a", trim: "#8a5aff", "gem": "#8a5aff", "glow": "#8a5aff"}]],
    ],
    baston: [
      [["Bastón corto", "m", {}], ["Cayado", "m", {metal: "#eef2f8", trim: "#2a2a30", "gem": "#2a2a30"}], ["Bastón de roble", "m", {metal: "#c8925a", trim: "#a8743a"}], ["Bastón de hueso", "m", {"m": 1, metal: "#3a3a42", trim: "#5a5a62", "gem": "#5a5a62"}]],
      [["Bastón de guerra", "m", {}], ["Bastón de batalla", "m", {"m": 0, trim: "#9aa0a8", "gem": "#2aa84a"}], ["Bastón rúnico", "m", {trim: "#4a7aff", "gem": "#4a7aff", "glow": "#4a7aff"}], ["Bastón del druida", "m", {"m": 2, metal: "#e2e6ee", trim: "#dcae3c", "gem": "#d8102a", "glow": "#ffd27a"}]],
      [["Báculo arcano", "m", {}], ["Báculo de cristal", "m", {"m": 1, metal: "#c8e8f8", trim: "#7ad0ff", "gem": "#7ad0ff", "glow": "#7ad0ff"}], ["Báculo del alba", "m", {metal: "#f4f0dc", trim: "#ffd27a", "gem": "#fff2a0", "glow": "#fff2a0"}], ["Báculo del vacío", "m", {metal: "#2a1a3a", trim: "#8a5aff", "gem": "#8a5aff", "glow": "#8a5aff"}]],
    ],
    varita: [
      [["Varita", "f", {}], ["Vara", "f", {metal: "#eef2f8", trim: "#2a2a30", "gem": "#2a2a30"}], ["Varita de hueso", "f", {metal: "#c8925a", trim: "#a8743a"}], ["Varita de cristal", "f", {"m": 1, metal: "#3a3a42", trim: "#5a5a62", "gem": "#5a5a62"}]],
      [["Varita quemada", "f", {}], ["Varita de tumba", "f", {"m": 0, trim: "#9aa0a8", "gem": "#2aa84a"}], ["Varita rúnica", "f", {trim: "#4a7aff", "gem": "#4a7aff", "glow": "#4a7aff"}], ["Varita de llamas", "f", {"m": 2, metal: "#e2e6ee", trim: "#dcae3c", "gem": "#d8102a", "glow": "#ffd27a"}]],
      [["Varita pulida", "f", {}], ["Varita de escarcha", "f", {"m": 1, metal: "#c8e8f8", trim: "#7ad0ff", "gem": "#7ad0ff", "glow": "#7ad0ff"}], ["Varita del alba", "f", {metal: "#f4f0dc", trim: "#ffd27a", "gem": "#fff2a0", "glow": "#fff2a0"}], ["Varita del vacío", "f", {metal: "#2a1a3a", trim: "#8a5aff", "gem": "#8a5aff", "glow": "#8a5aff"}]],
    ],
    escudo: [
      [["Escudo redondo", "m", {}], ["Rodela", "f", {metal: "#eef2f8", trim: "#2a2a30", "gem": "#2a2a30"}], ["Escudo de cuero", "m", {metal: "#c8925a", trim: "#a8743a"}], ["Broquel", "m", {"m": 1, metal: "#3a3a42", trim: "#5a5a62", "gem": "#5a5a62"}]],
      [["Escudo de guerra", "m", {}], ["Escudo de cometa", "m", {"m": 0, trim: "#9aa0a8", "gem": "#2aa84a"}], ["Escudo rúnico", "m", {trim: "#4a7aff", "gem": "#4a7aff", "glow": "#4a7aff"}], ["Escudo del cruzado", "m", {"m": 2, metal: "#e2e6ee", trim: "#dcae3c", "gem": "#d8102a", "glow": "#ffd27a"}]],
      [["Escudo de torre", "m", {}], ["Égida de cristal", "f", {"m": 1, metal: "#c8e8f8", trim: "#7ad0ff", "gem": "#7ad0ff", "glow": "#7ad0ff"}], ["Escudo del alba", "m", {metal: "#f4f0dc", trim: "#ffd27a", "gem": "#fff2a0", "glow": "#fff2a0"}], ["Escudo del vacío", "m", {metal: "#2a1a3a", trim: "#8a5aff", "gem": "#8a5aff", "glow": "#8a5aff"}]],
    ],
    orbe: [
      [["Orbe de águila", "m", {}], ["Orbe de cristal", "m", {metal: "#eef2f8", trim: "#2a2a30", "gem": "#2a2a30"}], ["Esfera ocular", "f", {metal: "#c8925a", trim: "#a8743a"}], ["Orbe nublado", "m", {"m": 1, metal: "#3a3a42", trim: "#5a5a62", "gem": "#5a5a62"}]],
      [["Orbe resplandeciente", "m", {}], ["Orbe de la tormenta", "m", {"m": 0, trim: "#9aa0a8", "gem": "#2aa84a"}], ["Orbe rúnico", "m", {trim: "#4a7aff", "gem": "#4a7aff", "glow": "#4a7aff"}], ["Orbe de escarcha", "m", {"m": 2, metal: "#e2e6ee", trim: "#dcae3c", "gem": "#d8102a", "glow": "#ffd27a"}]],
      [["Fragmento dimensional", "m", {}], ["Orbe del eclipse", "m", {"m": 1, metal: "#c8e8f8", trim: "#7ad0ff", "gem": "#7ad0ff", "glow": "#7ad0ff"}], ["Orbe del alba", "m", {metal: "#f4f0dc", trim: "#ffd27a", "gem": "#fff2a0", "glow": "#fff2a0"}], ["Orbe del vacío", "m", {metal: "#2a1a3a", trim: "#8a5aff", "gem": "#8a5aff", "glow": "#8a5aff"}]],
    ],
  };
  const ITEMDATA = { ARMOR, WEAPONS };
  if (typeof module !== 'undefined' && module.exports) module.exports = ITEMDATA;
  else root.ITEMDATA = ITEMDATA;
})(this);
