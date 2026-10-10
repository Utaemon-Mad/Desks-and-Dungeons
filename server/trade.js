'use strict';
// Tiendas de los comerciantes y comercio entre jugadores.
// Lo usa server.js: recibe lo que necesita del servidor y devuelve sus funciones.
module.exports = function (ctx) {
  const { RULES, SHOP_REFRESH_MS, derive, levelOf, send } = ctx;

  // ---------- Tiendas ----------
  function shopFor(user, npc) {
    const level = levelOf(user);
    const d = derive(user.profile);
    const scale = RULES.priceScale(level);
    if (npc === 'armero') {
      const bucket = Math.floor(Date.now() / SHOP_REFRESH_MS);
      const seed = RULES.seeded(`shop:${user.cid}:${bucket}:${level}:${user.profile.char.cls}`);
      const stock = RULES.armeroStock(seed, level, [user.profile.char.cls]);
      const bought = (user.shopBought && user.shopBought.bucket === bucket) ? user.shopBought.set : new Set();
      return { npc, kind: 'items', items: stock.map((it, i) => ({ ...it, price: RULES.itemBuyPrice(it, d.discount), sold: bought.has(i) })), bucket, refresh: (bucket + 1) * SHOP_REFRESH_MS };
    }
    if (npc === 'bruja') {
      return { npc, kind: 'cons', list: Object.entries(RULES.CONSUMABLES).filter(([, c]) => c.shop === 'bruja').map(([id, c]) => ({ id, price: RULES.buyPrice(c.price * scale, d.discount) })) };
    }
    if (npc === 'mago') {
      return {
        npc, kind: 'magic',
        list: Object.entries(RULES.CONSUMABLES).filter(([, c]) => c.shop === 'mago').map(([id, c]) => ({ id, price: RULES.buyPrice(c.price * scale, d.discount) })),
        buffs: Object.entries(RULES.BUFFS).filter(([, b]) => !b.food).map(([id, b]) => ({ id, price: RULES.buyPrice(b.price * scale, d.discount) })),
      };
    }
    return null;
  }

  // ---------- Comercio entre jugadores ----------
  const trades = new Map();

  function tradeState(t) {
    const side = (u) => ({ id: u.id, name: u.name, gold: t.offer[u.id].gold, items: t.offer[u.id].items.map((id) => u.profile.bag.find((it) => it.id === id)).filter(Boolean), ok: !!t.ok[u.id] });
    return { t: 'trade:state', id: t.id, a: side(t.a), b: side(t.b) };
  }
  function sendTrade(t) { const m = tradeState(t); send(t.a.ws, m); send(t.b.ws, m); }
  function endTrade(t, text) {
    trades.delete(t.id);
    for (const u of [t.a, t.b]) { if (u.trade === t) u.trade = null; send(u.ws, { t: 'trade:end', text }); }
  }

  return { endTrade, sendTrade, shopFor, trades };
};
