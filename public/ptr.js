/* ดึงลงเพื่อรีเฟรช (มือถือ) — ใช้ร่วมกันทั้งหน้าหลักและหน้าปรับพอร์ต
 * ดึงตอนอยู่บนสุด ≥ 70px แล้วปล่อย → กดปุ่มรีเฟรชของหน้านั้นให้ แล้วหมุนจนโหลดเสร็จ */
(function () {
  if (window.__ptr) return;
  window.__ptr = true;
  if (!('ontouchstart' in window)) return;

  var TARGETS = ['.dash-refresh', '.wl-refresh', '#btn-refresh', '[data-ptr-refresh]'];
  var BUSY = '.spin, .spinning, .is-loading, [disabled], [aria-busy="true"]';
  var TRIGGER = 70, MAX = 110;
  var SKIP = '.overlay.open, .sheet, .chart-canvas, .chart-shell.is-full, input, textarea, select, [data-no-ptr], .wl-row.dragging';

  var css = document.createElement('style');
  css.textContent =
    'html{overscroll-behavior-y:contain}' +
    '.ptr{position:fixed;left:50%;top:0;z-index:2000;width:38px;height:38px;margin-left:-19px;border-radius:50%;display:grid;place-items:center;' +
    'background:var(--ui-surface,#15111f);border:1px solid rgba(240,149,74,.45);box-shadow:0 6px 18px -6px rgba(240,149,74,.55);' +
    'transform:translateY(-48px);opacity:0;pointer-events:none;transition:transform .25s cubic-bezier(.16,1,.3,1),opacity .2s}' +
    '.ptr.drag{transition:none}' +
    '.ptr svg{width:20px;height:20px;color:#f0954a}' +
    '.ptr.ready svg{color:#ec6f9a}' +
    '.ptr.load svg{animation:ptr-spin .8s linear infinite}' +
    '@keyframes ptr-spin{to{transform:rotate(360deg)}}' +
    '@media (hover:none) and (pointer:coarse){.dash-refresh,.wl-refresh,#btn-refresh{display:none!important}}';
  document.head.appendChild(css);

  var el = document.createElement('div');
  el.className = 'ptr';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/></svg>';
  document.body.appendChild(el);
  var svg = el.firstChild;

  var startY = 0, startX = 0, dist = 0, pulling = false, busy = false, decided = false;
  var top = function () { return (document.scrollingElement || document.documentElement).scrollTop <= 0; };
  var target = function () {
    for (var i = 0; i < TARGETS.length; i++) { var b = document.querySelector(TARGETS[i]); if (b) return b; }
    return null;
  };
  var show = function (d) {
    var y = Math.min(d, MAX) * 0.6 - 48 + 12;
    el.style.transform = 'translateY(' + y + 'px)';
    el.style.opacity = String(Math.min(1, d / 40));
    svg.style.transform = 'rotate(' + d * 3 + 'deg)';
    el.classList.toggle('ready', d >= TRIGGER);
  };
  var hide = function () {
    el.classList.remove('drag', 'ready', 'load');
    el.style.transform = 'translateY(-48px)';
    el.style.opacity = '0';
    svg.style.transform = '';
  };

  document.addEventListener('touchstart', function (e) {
    if (busy || e.touches.length !== 1 || !top()) return;
    if (e.target.closest && e.target.closest(SKIP)) return;
    startY = e.touches[0].clientY; startX = e.touches[0].clientX;
    dist = 0; pulling = true; decided = false;
  }, { passive: true });

  document.addEventListener('touchmove', function (e) {
    if (!pulling) return;
    var dy = e.touches[0].clientY - startY, dx = e.touches[0].clientX - startX;
    if (!decided) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      decided = true;
      // เลื่อนแนวนอน (ปัดลบแถว) หรือดันขึ้น → ไม่ใช่ดึงรีเฟรช
      if (Math.abs(dx) > Math.abs(dy) || dy < 0 || !top()) { pulling = false; return; }
      el.classList.add('drag');
    }
    dist = Math.max(0, dy * 0.55);
    if (dist > 0 && e.cancelable) e.preventDefault();
    show(dist);
  }, { passive: false });

  var end = function () {
    if (!pulling) return;
    pulling = false;
    el.classList.remove('drag');
    if (dist < TRIGGER) { hide(); return; }
    var b = target();
    busy = true;
    el.classList.add('load');
    el.style.transform = 'translateY(' + (TRIGGER * 0.6 - 36) + 'px)';
    var t0 = Date.now();
    if (b) b.click(); else window.dispatchEvent(new CustomEvent('ptr:refresh'));
    var wait = function () {
      var still = b && b.isConnected && b.matches(BUSY);
      if ((still && Date.now() - t0 < 15000) || Date.now() - t0 < 700) return setTimeout(wait, 120);
      busy = false; hide();
      if (!b && !window.__ptrHandled) location.reload();
    };
    setTimeout(wait, 150);
  };
  document.addEventListener('touchend', end, { passive: true });

  /* ── ปัดซ้าย/ขวา = เปลี่ยนแท็บหลัก (ทำงานทั้งหน้าหลักและในกรอบหน้าปรับพอร์ต) ── */
  var SW_SKIP = '.wl-row, .asset-card, .cr-swipe-wrap, .chart-shell, .overlay.open, .sheet, input, textarea, select, [data-no-swipe], .app-navigation';
  var sw = null;
  var scrollsX = function (n) {
    for (; n && n !== document.body && n.nodeType === 1; n = n.parentElement) {
      var ox = getComputedStyle(n).overflowX;
      if ((ox === 'auto' || ox === 'scroll') && n.scrollWidth > n.clientWidth + 2) return true;
    }
    return false;
  };
  document.addEventListener('touchstart', function (e) {
    sw = null;
    if (e.touches.length !== 1) return;
    var t = e.target;
    if (t.closest && t.closest(SW_SKIP)) return;
    if (scrollsX(t)) return;
    sw = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
  }, { passive: true });
  document.addEventListener('touchend', function (e) {
    if (!sw || pulling || busy) { sw = null; return; }
    var p = e.changedTouches[0], dx = p.clientX - sw.x, dy = p.clientY - sw.y, dt = Date.now() - sw.t;
    sw = null;
    if (Math.abs(dx) < 80 || Math.abs(dx) < Math.abs(dy) * 2 || dt > 700) return;
    var sel = window.getSelection && String(window.getSelection());
    if (sel) return;
    var go = null;
    try { go = (window.top && window.top.__swipeNav) || window.__swipeNav; } catch (_) { go = window.__swipeNav; }
    if (go) go(dx < 0 ? 'left' : 'right');
  }, { passive: true });
  document.addEventListener('touchcancel', function () { pulling = false; hide(); }, { passive: true });
})();
