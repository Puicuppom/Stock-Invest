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
    '@media (hover:none) and (pointer:coarse){.dash-refresh,.wl-refresh,#btn-refresh{display:none!important}}' +
    '.ptr-toast{position:fixed;left:50%;top:calc(64px + env(safe-area-inset-top,0px));z-index:2001;transform:translate(-50%,-8px);max-width:calc(100% - 32px);opacity:0;pointer-events:none;' +
    'padding:10px 16px;border-radius:999px;font-size:13px;font-weight:600;color:#ffd9b8;white-space:nowrap;' +
    'background:color-mix(in srgb,var(--ui-surface,#15111f) 92%,transparent);border:1px solid rgba(240,149,74,.45);box-shadow:0 10px 24px -8px rgba(0,0,0,.7);' +
    '-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);transition:opacity .25s,transform .3s cubic-bezier(.16,1,.3,1)}' +
    '.ptr-toast.show{opacity:1;transform:translate(-50%,0)}';
  document.head.appendChild(css);

  var el = document.createElement('div');
  el.className = 'ptr';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/></svg>';
  document.body.appendChild(el);
  var svg = el.firstChild;

  var toastEl = null, toastT = 0;
  var toast = function (msg) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'ptr-toast'; toastEl.setAttribute('role', 'status'); document.body.appendChild(toastEl); }
    toastEl.textContent = msg;
    requestAnimationFrame(function () { toastEl.classList.add('show'); });
    clearTimeout(toastT);
    toastT = setTimeout(function () { toastEl.classList.remove('show'); }, 2200);
  };
  var hhmm = function () { return new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }); };
  try { if (sessionStorage.getItem('ptrToast')) { sessionStorage.removeItem('ptrToast'); setTimeout(function () { toast('✓ อัปเดตแล้ว · ' + hhmm()); }, 400); } } catch (_) { /* ignore */ }

  var startY = 0, startX = 0, dist = 0, pulling = false, busy = false, decided = false;
  // บนสุดจริง = หน้าและทุกกรอบที่เลื่อนได้รอบนิ้ว อยู่บนสุดหมด และหน้าไม่ได้กำลังไหลอยู่
  var lastScroll = 0;
  window.addEventListener('scroll', function () { lastScroll = Date.now(); }, { capture: true, passive: true });
  var atTop = function (n) {
    if ((document.scrollingElement || document.documentElement).scrollTop > 0) return false;
    for (; n && n.nodeType === 1 && n !== document.documentElement; n = n.parentElement) {
      if (n.scrollTop > 0) {
        var oy = getComputedStyle(n).overflowY;
        if (oy === 'auto' || oy === 'scroll' || oy === 'overlay') return false;
      }
    }
    try { if (window.top !== window && window.parent.scrollY > 0) return false; } catch (_) { /* ignore */ }
    return true;
  };
  var touchEl = null;
  var top = function () { return atTop(touchEl) && Date.now() - lastScroll > 300; };
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
    touchEl = e.target;
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
    try { navigator.vibrate && navigator.vibrate(10); } catch (_) { /* ignore */ }
    el.classList.add('load');
    el.style.transform = 'translateY(' + (TRIGGER * 0.6 - 36) + 'px)';
    var t0 = Date.now();
    if (b) b.click(); else window.dispatchEvent(new CustomEvent('ptr:refresh'));
    var wait = function () {
      var still = b && b.isConnected && b.matches(BUSY);
      if ((still && Date.now() - t0 < 15000) || Date.now() - t0 < 700) return setTimeout(wait, 120);
      busy = false; hide();
      if (!b && !window.__ptrHandled) { try { sessionStorage.setItem('ptrToast', '1'); } catch (_) { /* ignore */ } location.reload(); return; }
      // หน้าปรับพอร์ตแจ้งผลเองอยู่แล้ว (จำนวนตัวที่อัปเดต)
      if (b && b.id !== 'btn-refresh') toast('✓ อัปเดตแล้ว · ' + hhmm());
    };
    setTimeout(wait, 150);
  };
  document.addEventListener('touchend', end, { passive: true });

  /* ปัดซ้าย/ขวา: ใช้เฉพาะเปลี่ยนพอร์ต (บนการ์ดมูลค่าพอร์ต) · เปลี่ยนแท็บใช้กดแถบล่าง */
})();
