/* ราคาสดชุดเดียวทั้งเว็บ (ใช้ร่วมกับ src/lib/live-prices.ts — โปรโตคอลเดียวกัน)
 * key = "SYMBOL::US" | "SYMBOL::TH" (ไม่มี .BK) · หน้าไหนดึงราคามาก็ publish → ทุกหน้า (รวม iframe) ได้ทันที */
(function () {
  if (window.LivePrices) return;
  var KEY = 'livePrices:v1', CH = 'investpui-live';
  var mem = null, subs = [], bc = null, saveT = 0;
  var norm = function (id) { var p = String(id).split('::'); return p[0].toUpperCase().replace(/\.BK$/, '') + '::' + (p[1] || 'US'); };
  var load = function () { if (mem) return mem; try { mem = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { mem = {}; } return mem; };
  var save = function () { clearTimeout(saveT); saveT = setTimeout(function () { try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch (_) { /* ignore */ } }, 400); };
  var apply = function (q, broadcast) {
    if (!q) return;
    var m = load(), changed = {}, any = false;
    Object.keys(q).forEach(function (id) {
      var v = q[id]; if (!v || !(v.price > 0)) return;
      var k = norm(id), at = v.at || Date.now();
      if (m[k] && m[k].at > at) return;
      m[k] = Object.assign({}, m[k], v, { at: at }); changed[k] = m[k]; any = true;
    });
    if (!any) return;
    save();
    subs.forEach(function (f) { try { f(changed); } catch (_) { /* ignore */ } });
    if (broadcast && bc) bc.postMessage({ quotes: changed });
  };
  try { bc = new BroadcastChannel(CH); bc.onmessage = function (e) { apply(e.data && e.data.quotes, false); }; } catch (_) { bc = null; }
  window.LivePrices = {
    key: norm,
    all: load,
    get: function (id) { return load()[norm(id)] || null; },
    publish: function (q) { apply(q, true); },
    subscribe: function (f) { subs.push(f); return function () { subs = subs.filter(function (x) { return x !== f; }); }; }
  };
})();
