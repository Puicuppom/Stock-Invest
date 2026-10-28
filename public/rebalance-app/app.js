const SUPABASE_URL = window.REBALANCE_CONFIG?.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = window.REBALANCE_CONFIG?.SUPABASE_ANON_KEY || '';
const SYNC_KEY = window.REBALANCE_CONFIG?.SYNC_KEY || '';

/* ── หลายพอร์ต ──
 * พอร์ตหลัก (id "main") ใช้คีย์ localStorage และ sync_key เดิมทุกอย่าง ข้อมูลเก่าจึงไม่ต้องย้าย
 * พอร์ตอื่นเก็บคีย์แบบ "pf:<id>:<key>" และซิงค์เป็นแถวของตัวเอง "<SYNC_KEY>__pf_<id>"
 * รายชื่อพอร์ตซิงค์ในแถว "<SYNC_KEY>__portfolios" */
const PF_MAIN_ID = 'main';
const PF_INDEX_KEY = 'rbPortfolioIndex';
const PF_ACTIVE_KEY = 'rbActivePortfolio';
const PF_INDEX_SYNC_KEY = SYNC_KEY ? SYNC_KEY + '__portfolios' : '';

function pfStorageKey(id, key) {
    return id === PF_MAIN_ID ? key : `pf:${id}:${key}`;
}

function pfSyncKey(id) {
    if (!SYNC_KEY) return '';
    return id === PF_MAIN_ID ? SYNC_KEY : `${SYNC_KEY}__pf_${id}`;
}

function normalizePortfolioIndex(raw) {
    const list = Array.isArray(raw?.list) ? raw.list : [];
    const seen = new Set();
    const clean = [];
    for (const p of list) {
        const id = String(p?.id || '').replace(/[^a-z0-9]/gi, '');
        if (!id || seen.has(id)) continue;
        seen.add(id);
        clean.push({ id, name: String(p.name || '').trim() || 'พอร์ต' });
    }
    if (!seen.has(PF_MAIN_ID)) clean.unshift({ id: PF_MAIN_ID, name: 'พอร์ตหลัก' });
    const deleted = (Array.isArray(raw?.deleted) ? raw.deleted : [])
        .map(String).filter(id => id !== PF_MAIN_ID);
    return {
        list: clean.filter(p => !deleted.includes(p.id)),
        deleted,
        updatedAt: Number(raw?.updatedAt) || 0
    };
}

function loadPortfolioIndex() {
    try {
        return normalizePortfolioIndex(JSON.parse(localStorage.getItem(PF_INDEX_KEY) || 'null'));
    } catch {
        return normalizePortfolioIndex(null);
    }
}

let portfolioIndex = loadPortfolioIndex();

function savePortfolioIndexLocal() {
    localStorage.setItem(PF_INDEX_KEY, JSON.stringify(portfolioIndex));
}

const activePortfolioId = (() => {
    const saved = localStorage.getItem(PF_ACTIVE_KEY);
    return portfolioIndex.list.some(p => p.id === saved) ? saved : PF_MAIN_ID;
})();
const ACTIVE_SYNC_KEY = pfSyncKey(activePortfolioId);

/* localStorage ที่แยกตามพอร์ตที่เปิดอยู่ */
const store = {
    getItem: key => localStorage.getItem(pfStorageKey(activePortfolioId, key)),
    setItem: (key, val) => localStorage.setItem(pfStorageKey(activePortfolioId, key), val),
    removeItem: key => localStorage.removeItem(pfStorageKey(activePortfolioId, key))
};

function getActivePortfolioName() {
    return portfolioIndex.list.find(p => p.id === activePortfolioId)?.name || 'พอร์ตหลัก';
}

/* กลุ่มอัตโนมัติ + สไตล์พอร์ต (สำเนาของ src/lib/portfolio-plan.ts) */
const PLAN_BUCKETS = {
    core: { icon: '📦', name: 'ETF', color: '#38bdf8' },
    income: { icon: '💰', name: 'หุ้นปันผล', color: '#f59e0b' },
    quality: { icon: '🚀', name: 'หุ้นเติบโต', color: '#22c55e' },
    dip: { icon: '🏷️', name: 'หุ้นลดราคา', color: '#ec4899' },
    small: { icon: '💎', name: 'หุ้นขนาดเล็ก', color: '#a78bfa' },
    cash: { icon: '💵', name: 'เงินสด', color: '#94a3b8' }
};
const PLAN_PROFILE_DEFAULTS = {
    safe: { name: 'มั่นคง', mix: { core: 55, income: 25, quality: 10, cash: 10 } },
    balanced: { name: 'สมดุล', mix: { core: 40, income: 15, quality: 25, dip: 10, cash: 10 } },
    growth: { name: 'เติบโต', mix: { core: 30, quality: 35, dip: 20, small: 10, cash: 5 } }
};
/* สัดส่วนสไตล์ที่ผู้ใช้ตั้งเอง — เก็บใน localStorage กลาง (ใช้ร่วมกับหน้า คัดหุ้น › จัดพอร์ต) และซิงค์ไปกับพอร์ต */
const PLAN_STORE_KEY = 'planProfiles:v1';
function loadPlanProfiles() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(PLAN_STORE_KEY) || 'null'); } catch { /* ignore */ }
    const out = {};
    for (const [id, d] of Object.entries(PLAN_PROFILE_DEFAULTS)) {
        const m = saved?.profiles?.[id];
        out[id] = { name: d.name, mix: m && typeof m === 'object' ? { ...m } : { ...d.mix } };
    }
    return { profiles: out, updatedAt: Number(saved?.updatedAt) || 0 };
}
let planStore = loadPlanProfiles();
let PLAN_PROFILES = planStore.profiles;
function savePlanProfiles(touch = true) {
    if (touch) planStore.updatedAt = Date.now();
    planStore.profiles = PLAN_PROFILES;
    try { localStorage.setItem(PLAN_STORE_KEY, JSON.stringify({ profiles: Object.fromEntries(Object.entries(PLAN_PROFILES).map(([k, v]) => [k, v.mix])), updatedAt: planStore.updatedAt })); } catch { /* ignore */ }
}

/* แผนของพอร์ตนี้ — ต้องประกาศก่อน bootstrap() */
let myPlan = (() => { const v = localStorage.getItem(pfStorageKey(activePortfolioId, 'myPlan')); return PLAN_PROFILES[v] ? v : ''; })();
let planView = '';   // แท็บที่กำลังดูในการ์ด

const DEFAULT_PORTFOLIO_GROUPS = [
    { id: 'income', name: 'ปันผล', hint: 'Income · ปันผล Reinvest ซ่อมพอร์ต', kind: 'etf', profitTaking: false },
    { id: 'growth', name: 'เติบโต', hint: 'Tech Growth · เสาหลักหุ้นรายตัว', kind: 'stock', profitTaking: true },
    { id: 'alpha', name: 'Alpha', hint: 'Growth / Tactical · จับจังหวะตามแนวรับ', kind: 'stock', profitTaking: true },
    { id: 'cash', name: 'เงินสด', hint: 'Cash · สำรองและรอลงทุน', kind: 'cash', profitTaking: false }
];

function normalizePortfolioGroup(g) {
    const kind = g.kind || 'stock';
    const profitTaking = kind === 'cash' ? false : (g.profitTaking ?? (kind === 'stock'));
    return { ...g, kind, profitTaking };
}

function loadPortfolioGroups() {
    const saved = JSON.parse(store.getItem('portfolioGroups') || 'null');
    if (Array.isArray(saved) && saved.length) {
        return saved.map(normalizePortfolioGroup);
    }
    const legacy = JSON.parse(store.getItem('groupConfig') || 'null');
    return DEFAULT_PORTFOLIO_GROUPS.map(g => normalizePortfolioGroup({
        ...g,
        name: legacy?.labels?.[g.id] || g.name,
        hint: legacy?.hints?.[g.id] || g.hint
    }));
}

let portfolioGroups = loadPortfolioGroups();

function savePortfolioGroups() {
    store.setItem('portfolioGroups', JSON.stringify(portfolioGroups));
    scheduleCloudSave();
}

function groupIds() {
    return portfolioGroups.map(g => g.id);
}

function getGroupMeta(id) {
    return portfolioGroups.find(g => g.id === id);
}

function getGroupLabel(id) {
    return getGroupMeta(id)?.name || id;
}

function isCashGroup(id) {
    return getGroupMeta(id)?.kind === 'cash';
}

function groupUsesProfitTaking(groupId) {
    return false;
    if (isCashGroup(groupId)) return false;
    return getGroupMeta(groupId)?.profitTaking === true;
}

function getCashGroupId() {
    return portfolioGroups.find(g => g.kind === 'cash')?.id || 'cash';
}

const STRATEGY = {
    QQQI: { target: 38, group: 'income', kind: 'etf', role: 'แกนปันผลรายเดือน · Reinvest' },
    RDTE: { target: 7,  group: 'income', kind: 'etf', role: 'ปันผลรายสัปดาห์ · Yield สูง' },
    MSFT: { target: 20, group: 'growth', kind: 'stock', role: 'เสาหลัก Tech · ปรับฐานน้อย' },
    AVGO: { target: 15, group: 'growth', kind: 'stock', role: 'หุ้นเติบโตระยะยาว' },
    META: { target: 12, group: 'alpha',  kind: 'stock', role: 'FCF แข็ง · ซื้อตามส่วนลด' },
    PLTR: { target: 8,  group: 'alpha',  kind: 'stock', role: 'ซิ่งพื้นฐานดี · จับจังหวะ' }
};

const defaultAssets = [
    { name: 'QQQI', kind: 'etf',   group: 'income', shares: 0, avgCost: 0, target: 38 },
    { name: 'RDTE', kind: 'etf',   group: 'income', shares: 0, avgCost: 0, target: 7 },
    { name: 'MSFT', kind: 'stock', group: 'growth', shares: 0, avgCost: 0, target: 20 },
    { name: 'AVGO', kind: 'stock', group: 'growth', shares: 0, avgCost: 0, target: 15 },
    { name: 'META', kind: 'stock', group: 'alpha',  shares: 0, avgCost: 0, target: 12 },
    { name: 'PLTR', kind: 'stock', group: 'alpha',  shares: 0, avgCost: 0, target: 8 },
    { name: 'USD',  kind: 'cash',  group: 'cash',   shares: 0, avgCost: 1, target: 0 }
];

const ETF_SYMBOLS = new Set(['QQQI', 'RDTE', 'JEPQ', 'SMH', 'IBIT', 'VOO', 'SPY', 'QQQ', 'VTI', 'ACWI']);

const CASH_SYMBOLS = new Set(['USD', 'CASH', 'เงินสด']);

function inferKind(name, group) {
    if (isCashGroup(group)) return 'cash';
    const metaKind = getGroupMeta(group)?.kind;
    if (metaKind === 'etf') return 'etf';
    if (metaKind === 'stock') {
        return ETF_SYMBOLS.has(String(name).toUpperCase()) ? 'etf' : 'stock';
    }
    return ETF_SYMBOLS.has(String(name).toUpperCase()) ? 'etf' : 'stock';
}

function resolveAssetGroup(asset) {
    const g = asset.group || inferGroup(asset.name, asset.kind);
    if (isCashAsset(asset) && isCashGroup(g)) return g;
    if (isCashAsset(asset)) return getCashGroupId();
    return g;
}

function inferGroup(name, kind) {
    if (kind === 'cash') return getCashGroupId();
    const s = STRATEGY[name];
    if (s && getGroupMeta(s.group)) return s.group;
    if (kind === 'etf') {
        return portfolioGroups.find(g => g.kind === 'etf')?.id || portfolioGroups[0]?.id;
    }
    return portfolioGroups.find(g => g.kind === 'stock')?.id || portfolioGroups[0]?.id;
}

function isCashAsset(asset) {
    if (asset.kind === 'cash') return true;
    return isCashGroup(getAssetGroup(asset));
}

function getAssetRole(name) {
    return STRATEGY[name]?.role || '';
}

function mergeDefaultPortfolio(list) {
    const removed = new Set(deletedAssets.map(n => n.toUpperCase()));
    const names = new Set(list.map(a => a.name));
    defaultAssets.forEach(d => {
        if (!names.has(d.name) && !removed.has(d.name)) {
            list.push({ ...d, peakValue: 0, tiersDone: [false, false, false] });
        }
    });
    return list;
}

function markAssetDeleted(name) {
    const sym = String(name).toUpperCase();
    if (!deletedAssets.includes(sym)) {
        deletedAssets.push(sym);
        store.setItem('deletedAssets', JSON.stringify(deletedAssets));
    }
}

function unmarkAssetDeleted(name) {
    const sym = String(name).toUpperCase();
    deletedAssets = deletedAssets.filter(n => n !== sym);
    store.setItem('deletedAssets', JSON.stringify(deletedAssets));
}

function applyStrategyMigration(list) {
    if (store.getItem('strategyTargets') === '2') return list;
    list.forEach(a => {
        if (a.kind === 'cash' || a.group === 'cash' || isCashGroup(a.group)) {
            a.kind = 'cash';
            a.group = isCashGroup(a.group) ? a.group : getCashGroupId();
            a.avgCost = 1;
            return;
        }
        const s = STRATEGY[a.name];
        if (s) {
            a.target = s.target;
            a.group = s.group;
            a.kind = s.kind;
        } else if (!a.group) {
            a.group = inferGroup(a.name, a.kind || inferKind(a.name, a.group));
        }
    });
    store.setItem('strategyTargets', '2');
    return list;
}

function sortPortfolioByGroup() {
    myPortfolio.sort((a, b) => {
        const ga = groupIds().indexOf(getAssetGroup(a));
        const gb = groupIds().indexOf(getAssetGroup(b));
        return ga - gb;
    });
}

let priceCache = {};
const PLAN_CACHE_KEY = 'planBucketCache:v1';
let planCache = (() => { try { return JSON.parse(localStorage.getItem(PLAN_CACHE_KEY) || '{}') || {}; } catch { return {}; } })();
let priceRefetch = false;
let priceFetching = false;

/* พอร์ตย่อยที่ยังไม่มีข้อมูลในเครื่องนี้ (เช่น สร้างจากอีกเครื่อง) — เริ่มว่าง แล้วรอโหลดจากคลาวด์ */
if (activePortfolioId !== PF_MAIN_ID && !store.getItem('myPortfolio')) {
    store.setItem('deletedAssets', JSON.stringify(defaultAssets.filter(a => a.kind !== 'cash').map(a => a.name.toUpperCase())));
    store.setItem('myPortfolio', JSON.stringify(defaultAssets.filter(a => a.kind === 'cash')));
    store.setItem('strategyTargets', '2');
    store.setItem('localUpdatedAt', '0');
}

let deletedAssets = JSON.parse(store.getItem('deletedAssets') || '[]');
let pendingPortfolioRepairSync = false;

let myPortfolio = JSON.parse(store.getItem('myPortfolio')) || defaultAssets;
pendingPortfolioRepairSync = isPortfolioBroken(myPortfolio);
myPortfolio = mergeDefaultPortfolio(myPortfolio);
myPortfolio = applyStrategyMigration(myPortfolio);
myPortfolio = myPortfolio.map(a => {
    const group = a.group || inferGroup(a.name, a.kind);
    const kind = a.kind || inferKind(a.name, group);
    const item = {
        name: a.name,
        kind,
        group: isCashGroup(group) ? group : group,
        shares: a.shares ?? 0,
        avgCost: kind === 'cash' ? 1 : (a.avgCost ?? 0),
        target: a.target ?? 0,
        peakValue: a.peakValue || 0,
        tiersDone: a.tiersDone || [false, false, false]
    };
    if ((!item.shares || item.shares === 0) && a.value > 0) item._legacyValue = a.value;
    if ((!item.avgCost || item.avgCost === 0) && a.cost > 0 && item.shares > 0) {
        item.avgCost = a.cost / item.shares;
    }
    return item;
});
myPortfolio = repairPortfolioList(myPortfolio);
sortPortfolioByGroup();

function getPrice(symbol) {
    return priceCache[symbol]?.price || 0;
}

function syncAssetValues() {
    myPortfolio.forEach(a => {
        if (isCashAsset(a)) {
            a.price = 1;
            a.avgCost = 1;
            a.value = a.shares || 0;
            a.cost = a.shares || 0;
            return;
        }
        const price = getPrice(a.name);
        if (a._legacyValue && price > 0) {
            a.shares = a._legacyValue / price;
            delete a._legacyValue;
        }
        a.price = price;
        a.value = (a.shares || 0) * price;
        a.cost = (a.shares || 0) * (a.avgCost || 0);
    });
}

async function fetchPrices(fullRender = false) {
    const fxPromise = fetchUsdThbRate();
    if (priceFetching) {
        // กำลังโหลดรอบก่อนอยู่ → นัดโหลดอีกรอบเมื่อเสร็จ (เช่น คลาวด์เพิ่มหุ้นเข้ามาระหว่างนั้น)
        priceRefetch = priceRefetch || fullRender || 'yes';
        await fxPromise;
        return { busy: true, total: 0, failed: 0 };
    }
    const symbols = myPortfolio.filter(a => !isCashAsset(a)).map(a => a.name).filter(Boolean);
    if (!symbols.length) {
        await fxPromise;
        return { total: 0, failed: 0 };
    }

    priceFetching = true;

    await Promise.all(symbols.map(async (symbol) => {
        try {
            const res = await fetch(`/api/stock?symbol=${encodeURIComponent(symbol)}`);
            const data = await res.json();
            if (res.ok && data.price) {
                priceCache[symbol] = {
                    price: data.price,
                    at: Date.now(),
                    fairValue: data.fairValue || null,
                    srLevels: data.srLevels || null,
                    plan: data.plan || null,
                };
                rememberPlan(symbol, data.plan);
            } else {
                priceCache[symbol] = {
                    price: priceCache[symbol]?.price || 0,
                    fairValue: priceCache[symbol]?.fairValue || null,
                    srLevels: priceCache[symbol]?.srLevels || null,
                    plan: priceCache[symbol]?.plan || null,
                    error: true,
                };
            }
        } catch {
            priceCache[symbol] = {
                price: priceCache[symbol]?.price || 0,
                fairValue: priceCache[symbol]?.fairValue || null,
                srLevels: priceCache[symbol]?.srLevels || null,
                plan: priceCache[symbol]?.plan || null,
                error: true,
            };
        }
    }));

    priceFetching = false;
    // ราคาจากเส้นทางวิเคราะห์อาจแคชไว้ ~15 นาที → ทับด้วยราคาสดทันที
    await fetchLiveQuotes(false);
    syncAssetValues();
    await fxPromise;

    if (fullRender || !document.querySelector('.asset-card')) {
        renderAndCalculate();
    } else {
        recalculate();
    }
    if (priceRefetch) {
        const full = priceRefetch === true;
        priceRefetch = false;
        // โหลดเฉพาะตัวที่ยังไม่มีข้อมูลวิเคราะห์ ไม่ต้องโหลดทั้งพอร์ตซ้ำ
        if (myPortfolio.some(x => !isCashAsset(x) && !priceCache[x.name]?.srLevels && !priceCache[x.name]?.error)) setTimeout(() => fetchPrices(full), 0);
    }
    return { total: symbols.length, failed: symbols.filter(sym => priceCache[sym]?.error).length };
}

/* ── ราคาสด: ดึงทุกตัวในคำขอเดียว (ไม่แคช) ทุก 30 วิ ขณะเปิดหน้าอยู่ ── */
let liveFetching = false;
let lastLiveAt = 0;
async function fetchLiveQuotes(render = true) {
    const symbols = [...new Set(myPortfolio.filter(a => !isCashAsset(a)).map(a => a.name).filter(Boolean))];
    if (!symbols.length || liveFetching) return 0;
    liveFetching = true;
    let n = 0;
    try {
        const items = symbols.map(s => /\.BK$/i.test(s) ? `${encodeURIComponent(s)}:TH` : `${encodeURIComponent(s)}:US`).join(',');
        const res = await fetch(`/api/quotes?items=${items}`, { cache: 'no-store' });
        if (!res.ok) return 0;
        const { quotes } = await res.json();
        for (const s of symbols) {
            const q = quotes?.[`${s}::${/\.BK$/i.test(s) ? 'TH' : 'US'}`];
            if (!q || !(q.price > 0)) continue;
            priceCache[s] = { ...(priceCache[s] || {}), price: q.price, ext: q.ext || null, at: Date.now(), error: false };
            n++;
        }
        if (n) lastLiveAt = Date.now();
    } catch {
        /* ใช้ราคาเดิม */
    } finally {
        liveFetching = false;
    }
    if (n && render) {
        syncAssetValues();
        if (!document.querySelector('.asset-card')) renderAndCalculate(); else recalculate();
        refreshAssetSheetPrices();
    }
    updatePriceStamp();
    return n;
}

function updatePriceStamp() {
    const btn = document.getElementById('btn-refresh');
    if (btn && lastLiveAt) btn.title = `ราคา ณ ${new Date(lastLiveAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · อัปเดตเองทุก 30 วิ`;
}

/* ราคาในแผ่นซื้อ/ขาย: ไม่ทับค่าที่ผู้ใช้พิมพ์เอง */
function refreshAssetSheetPrices() {
    const input = document.getElementById('trade-price');
    if (!input || input.dataset.touched || assetSheetIndex == null) return;
    const p = getPrice(myPortfolio[assetSheetIndex]?.name);
    if (p > 0) input.value = formatInputVal(p);
}

setInterval(() => {
    if (document.visibilityState === 'visible') fetchLiveQuotes();
}, 30000);
// แนวรับ/ต้านและมูลค่ายุติธรรม เปลี่ยนช้า → ดึงเต็มทุก 10 นาที
setInterval(() => {
    if (document.visibilityState === 'visible') fetchPrices();
}, 600000);
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastLiveAt > 15000) fetchLiveQuotes();
});

let toastTimer = null;
function showToast(msg, kind = '') {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'toast show' + (kind ? ' ' + kind : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = 'toast'; }, 2600);
}

async function refreshAll() {
    const btn = document.getElementById('btn-refresh');
    if (btn.disabled) return;
    btn.disabled = true;
    btn.classList.add('spinning');
    try {
        // รอรอบที่กำลังโหลดอยู่ (เช่น ตอนเปิดหน้า) ให้จบก่อน แล้วค่อยดึงใหม่
        let tries = 0;
        while (priceFetching && tries++ < 50) await new Promise(r => setTimeout(r, 200));
        const [result] = await Promise.all([
            fetchPrices(true),
            sb ? loadFromCloud().catch(() => setSyncStatus('error')) : null
        ]);
        renderAndCalculate();
        const time = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
        if (!result || result.total === 0) {
            showToast('ยังไม่มีหุ้นในพอร์ตนี้ให้อัปเดตราคา');
        } else if (result.failed === result.total) {
            showToast('อัปเดตราคาไม่สำเร็จ ลองใหม่อีกครั้ง', 'error');
        } else if (result.failed) {
            showToast(`อัปเดตแล้ว ${result.total - result.failed}/${result.total} ตัว · ${time}`, 'warn');
        } else {
            showToast(`อัปเดตราคา ${result.total} ตัวแล้ว · ${time}`);
        }
    } finally {
        btn.disabled = false;
        btn.classList.remove('spinning');
    }
}

document.getElementById('btn-refresh').addEventListener('click', refreshAll);

/* ── Supabase cloud sync (no login) ── */
const sb = SUPABASE_URL && SUPABASE_ANON_KEY && SYNC_KEY
    ? window.supabase?.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;
let cloudSaving = false;
let cloudSaveTimer = null;
let realtimeChannel = null;

function setSyncStatus(state) {
    const el = document.getElementById('btn-sync');
    const labels = {
        local: 'ในเครื่อง',
        synced: 'ซิงค์แล้ว',
        syncing: 'กำลังซิงค์',
        error: 'ไม่สำเร็จ',
        '': 'อัตโนมัติ'
    };
    const titles = {
        local: 'บันทึกในเครื่องนี้ ยังไม่ได้ตั้งค่าซิงค์',
        synced: 'ซิงค์แล้วทุกอุปกรณ์',
        syncing: 'กำลังซิงค์',
        error: 'ซิงค์ไม่สำเร็จ จะลองใหม่เมื่อมีการแก้ไข',
        '': 'ซิงค์อัตโนมัติ'
    };
    if (el) {
        el.classList.remove('synced', 'syncing', 'error', 'local');
        if (state) el.classList.add(state);
        el.title = titles[state] || titles[''];
        const label = el.querySelector('em');
        if (label) label.textContent = labels[state] || labels[''];
    }
    const set = document.getElementById('set-sync');
    if (set) set.textContent = ({ local: 'บันทึกในเครื่องนี้', synced: 'ซิงค์แล้ว', syncing: 'กำลังซิงค์', error: 'ซิงค์ไม่สำเร็จ' })[state] || 'อัตโนมัติ';
}

function normalizePortfolioList(list, skipMigration = false) {
    const removed = new Set(deletedAssets.map(n => n.toUpperCase()));
    list = (list || []).filter(a => !removed.has(String(a.name).toUpperCase()));
    list = mergeDefaultPortfolio(list);
    if (!skipMigration) list = applyStrategyMigration(list);
    list = list.map(a => {
        const group = a.group || inferGroup(a.name, a.kind);
        const kind = a.kind || inferKind(a.name, group);
        return {
            name: a.name,
            kind,
            group: isCashGroup(group) ? group : group,
            shares: a.shares ?? 0,
            avgCost: kind === 'cash' ? 1 : (a.avgCost ?? 0),
            target: a.target ?? 0,
            peakValue: a.peakValue || 0,
            tiersDone: a.tiersDone || [false, false, false]
        };
    });
    return repairPortfolioList(list);
}

function repairPortfolioList(list) {
    const validIds = new Set(portfolioGroups.map(g => g.id));
    const fallback = portfolioGroups.find(g => g.kind === 'stock')
        || portfolioGroups.find(g => g.kind === 'etf')
        || portfolioGroups[0];
    const bySymbol = new Map();
    for (const a of list) {
        const key = String(a.name).toUpperCase();
        if (!bySymbol.has(key)) bySymbol.set(key, []);
        bySymbol.get(key).push(a);
    }
    const out = [];
    for (const assets of bySymbol.values()) {
        const pick = assets.length === 1
            ? assets[0]
            : (assets.find(a => validIds.has(a.group || inferGroup(a.name, a.kind))) || assets[0]);
        const group = pick.group || inferGroup(pick.name, pick.kind);
        if (validIds.has(group)) {
            out.push({ ...pick, group });
            continue;
        }
        const newGroup = fallback?.id || getCashGroupId();
        const kind = isCashGroup(newGroup) ? 'cash' : inferKind(pick.name, newGroup);
        out.push({
            ...pick,
            group: newGroup,
            kind,
            avgCost: kind === 'cash' ? 1 : (pick.avgCost || 0)
        });
    }
    return out;
}

function isPortfolioBroken(list) {
    if (!Array.isArray(list) || !list.length) return false;
    const validIds = new Set(portfolioGroups.map(g => g.id));
    const seen = new Set();
    for (const a of list) {
        const key = String(a.name).toUpperCase();
        if (seen.has(key)) return true;
        seen.add(key);
        const g = a.group || inferGroup(a.name, a.kind);
        if (!validIds.has(g)) return true;
    }
    return false;
}

function applyPortfolioRepair() {
    myPortfolio = repairPortfolioList(myPortfolio);
    sortPortfolioByGroup();
}

function applyCloudData(cloud) {
    if (!cloud) return;
    if (Array.isArray(cloud.portfolioGroups) && cloud.portfolioGroups.length) {
        portfolioGroups = cloud.portfolioGroups.map(normalizePortfolioGroup);
        store.setItem('portfolioGroups', JSON.stringify(portfolioGroups));
    } else if (cloud.groupConfig) {
        portfolioGroups.forEach(g => {
            if (cloud.groupConfig.labels?.[g.id]) g.name = cloud.groupConfig.labels[g.id];
            if (cloud.groupConfig.hints?.[g.id]) g.hint = cloud.groupConfig.hints[g.id];
        });
        store.setItem('portfolioGroups', JSON.stringify(portfolioGroups));
    }
    if (Array.isArray(cloud.deletedAssets)) {
        deletedAssets = cloud.deletedAssets.map(n => String(n).toUpperCase());
        store.setItem('deletedAssets', JSON.stringify(deletedAssets));
    }
    if (Array.isArray(cloud.portfolio)) {
        if (isPortfolioBroken(cloud.portfolio)) pendingPortfolioRepairSync = true;
        myPortfolio = normalizePortfolioList(cloud.portfolio, true);
        sortPortfolioByGroup();
        store.setItem('myPortfolio', JSON.stringify(myPortfolio));
    }
    if (Array.isArray(cloud.profitTiers) && cloud.profitTiers.length === 3) {
        profitTiers = cloud.profitTiers;
        store.setItem('profitTiers', JSON.stringify(profitTiers));
        renderTierSettings();
    }
    if (typeof cloud.dipBuyPct === 'number') {
        dipBuyPct = cloud.dipBuyPct;
        store.setItem('dipBuyPct', String(dipBuyPct));
    }
    if (portfolioGroups.some(g => g.id === cloud.activeTab)) {
        activeTab = cloud.activeTab;
        store.setItem('activeTab', activeTab);
        updateTabUI();
    }
    if (typeof cloud.myPlan === 'string' && (cloud.myPlan === '' || PLAN_PROFILES[cloud.myPlan])) {
        myPlan = cloud.myPlan;
        store.setItem('myPlan', cloud.myPlan);
    }
    if (cloud.planProfiles?.profiles && Number(cloud.planProfiles.updatedAt) > planStore.updatedAt) {
        for (const [id, mix] of Object.entries(cloud.planProfiles.profiles)) if (PLAN_PROFILES[id] && mix) PLAN_PROFILES[id].mix = { ...mix };
        planStore.updatedAt = Number(cloud.planProfiles.updatedAt);
        savePlanProfiles(false);
    }
    if (cloud.strategyTargets) {
        store.setItem('strategyTargets', cloud.strategyTargets);
    }
    store.setItem('localUpdatedAt', String(cloud.updatedAt || Date.now()));
}

function getCloudPayload() {
    return {
        version: 1,
        portfolio: myPortfolio.map(a => ({
            name: a.name,
            kind: a.kind || inferKind(a.name, a.group),
            group: resolveAssetGroup(a),
            shares: a.shares || 0,
            avgCost: a.avgCost || 0,
            target: a.target || 0,
            peakValue: a.peakValue || 0,
            tiersDone: a.tiersDone || [false, false, false]
        })),
        profitTiers,
        dipBuyPct,
        activeTab,
        strategyTargets: store.getItem('strategyTargets') || '2',
        portfolioGroups,
        deletedAssets,
        myPlan: store.getItem('myPlan') || '',
        planProfiles: { profiles: Object.fromEntries(Object.entries(PLAN_PROFILES).map(([k, v]) => [k, v.mix])), updatedAt: planStore.updatedAt },
        updatedAt: Date.now()
    };
}

function scheduleCloudSave() {
    clearTimeout(cloudSaveTimer);
    cloudSaveTimer = setTimeout(saveToCloud, 900);
}

function flushCloudSave() {
    clearTimeout(cloudSaveTimer);
    return saveToCloud();
}

async function saveToCloud() {
    if (!sb) { setSyncStatus(SUPABASE_URL ? 'error' : 'local'); return; }
    if (cloudSaving) return;
    cloudSaving = true;
    const syncDelay = setTimeout(() => setSyncStatus('syncing'), 600);
    const payload = getCloudPayload();
    const { error } = await sb.from('portfolios').upsert({
        sync_key: ACTIVE_SYNC_KEY,
        data: payload,
        updated_at: new Date().toISOString()
    }, { onConflict: 'sync_key' });
    clearTimeout(syncDelay);
    cloudSaving = false;
    if (error) {
        console.warn('cloud save', error);
        setSyncStatus('error');
    } else {
        store.setItem('localUpdatedAt', String(payload.updatedAt));
        setSyncStatus('synced');
    }
}

async function loadFromCloud() {
    setSyncStatus('syncing');
    const { data, error } = await sb
        .from('portfolios')
        .select('data, updated_at')
        .eq('sync_key', ACTIVE_SYNC_KEY)
        .maybeSingle();

    if (error) {
        console.warn('cloud load', error);
        setSyncStatus('error');
        return;
    }

    const localUpdated = parseInt(store.getItem('localUpdatedAt') || '0', 10);
    if (!data) {
        await saveToCloud();
        return;
    }

    const cloudUpdated = new Date(data.updated_at).getTime();
    const cloud = data.data || {};
    const cloudPayloadUpdated = cloud.updatedAt || 0;

    if (cloudUpdated > localUpdated || cloudPayloadUpdated > localUpdated) {
        applyCloudData(cloud);
        setSyncStatus('synced');
    } else if (localUpdated > cloudUpdated) {
        await saveToCloud();
    } else {
        setSyncStatus('synced');
    }
}

function setupRealtime() {
    if (realtimeChannel) {
        sb.removeChannel(realtimeChannel);
        realtimeChannel = null;
    }
    realtimeChannel = sb
        .channel('portfolio-sync-' + activePortfolioId)
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'portfolios',
            filter: 'sync_key=eq.' + ACTIVE_SYNC_KEY
        }, payload => {
            if (!payload.new?.data) return;
            const cloud = payload.new.data;
            const incomingAt = cloud.updatedAt || 0;
            const localUpdated = parseInt(store.getItem('localUpdatedAt') || '0', 10);
            if (incomingAt <= localUpdated) return;
            if (isUserEditing()) return;
            applyCloudData(cloud);
            if (document.querySelector('.asset-card')) {
                syncAssetValues();
                recalculate();
            } else {
                renderAndCalculate();
            }
            setSyncStatus('synced');
        })
        .subscribe();
}

async function initCloudSync() {
    if (!sb) { setSyncStatus(SUPABASE_URL ? 'error' : 'local'); return; }
    try {
        await loadFromCloud();
        setupRealtime();
    } catch { setSyncStatus('error'); }
}

let usdThbRate = 0;
/* อัตราแลกเปลี่ยนบนกล่องสรุป: 1 $ = xx.xx ฿ */
function renderFxRate() {
    const el = document.getElementById('fx-rate');
    if (!el || !(usdThbRate > 0)) return;
    el.hidden = false;
    el.innerHTML = `<b>${usdThbRate.toFixed(2)}</b> ฿/USD`;
    el.title = `อัตราแลกเปลี่ยน USD/THB · อัปเดต ${new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}`;
}
let displayCurrency = (() => {
    try { return localStorage.getItem('rbCurrency') === 'THB' ? 'THB' : 'USD'; } catch { return 'USD'; }
})();

function updateCurrencyButton() {
    const thb = displayCurrency === 'THB';
    document.querySelectorAll('.cur-seg button').forEach(b => {
        const on = b.dataset.cur === (thb ? 'THB' : 'USD');
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', String(on));
    });
}

function setCurrency(cur) {
    if ((displayCurrency === 'THB') !== (cur === 'THB')) toggleCurrency();
}

function toggleCurrency() {
    displayCurrency = displayCurrency === 'THB' ? 'USD' : 'THB';
    try { localStorage.setItem('rbCurrency', displayCurrency); } catch { /* ignore */ }
    updateCurrencyButton();
    if (displayCurrency === 'THB' && !(usdThbRate > 0)) {
        showToast('กำลังโหลดค่าเงินบาท…');
        fetchUsdThbRate();
    }
    renderAndCalculate();
    if (typeof refreshAssetSheet === 'function' && assetSheetIndex != null) refreshAssetSheet();
}

let fxJob = null, fxAt = 0;
function fetchUsdThbRate() {
    // ใช้ร่วมกันระหว่างที่กำลังโหลด และไม่ดึงซ้ำภายใน 5 นาที
    if (fxJob) return fxJob;
    if (Date.now() - fxAt < 300000 && usdThbRate > 0) return Promise.resolve();
    fxJob = loadUsdThbRate().finally(() => { fxJob = null; fxAt = Date.now(); });
    return fxJob;
}
async function loadUsdThbRate() {
    try {
        const res = await fetch('/api/stock?symbol=THB%3DX');
        const data = await res.json();
        if (res.ok && data.price > 0) {
            usdThbRate = data.price;
            renderFxRate();
            if (document.querySelector('.asset-card')) {
                recalculate();
            } else {
                const { totalValue, totalTarget } = computePortfolio();
                updateSummary(totalValue, totalTarget);
            }
        }
    } catch { /* keep last rate */ }
}

function loadActiveTab() {
    const saved = store.getItem('activeTab');
    if (portfolioGroups.some(g => g.id === saved)) return saved;
    return portfolioGroups[0]?.id || 'income';
}

let activeTab = loadActiveTab();

function showProfitTaking() {
    return groupUsesProfitTaking(activeTab);
}

function updateProfitGroupsMeta() {
    const el = document.getElementById('profit-groups-meta');
    if (!el) return;
    const names = portfolioGroups.filter(g => groupUsesProfitTaking(g.id)).map(g => getGroupLabel(g.id));
    el.textContent = names.length ? names.join(', ') : 'ยังไม่ได้เลือกกลุ่ม';
}

function setTab(tab) {
    if (!portfolioGroups.some(g => g.id === tab)) return;
    activeTab = tab;
    store.setItem('activeTab', activeTab);
    updateTabUI();
    renderAndCalculate();
    scheduleCloudSave();
}

function rebuildTabBar() {
    const bar = document.getElementById('mode-bar');
    if (!bar) return;
    bar.innerHTML = portfolioGroups.map(g => {
        const pct = getTargetByGroup(g.id);
        const active = g.id === activeTab ? ' active' : '';
        return `<button class="mode-btn${active}" id="mode-${g.id}" type="button" onclick="setTab('${g.id}')">${getGroupLabel(g.id)} ${fmtPct(pct)}</button>`;
    }).join('');
}

function updateTabUI() {
    rebuildTabBar();
    const squadNote = document.getElementById('squad-note');
    if (squadNote) squadNote.textContent = '';
    updateGroupTargetSum();
    const addInput = document.getElementById('new-asset-name');
    if (addInput) {
        addInput.placeholder = 'ชื่อย่อ เช่น MSFT · เงินสดพิมพ์ USD';
    }
}

function renderGroupAllocationSettings() {
    const el = document.getElementById('group-allocation-rows');
    if (!el) return;
    const canDelete = portfolioGroups.length > 1;
    el.innerHTML = `<div class="group-allocation-cols">
            <span class="group-col-head col-drag" aria-hidden="true">≡</span>
            <span class="group-col-head col-name">ชื่อกลุ่ม</span>
            <span class="group-col-head">ประเภท</span>
            <span class="group-col-head" title="เปิดขายทำกำไร 3 ส่วน">กำไร</span>
            <span class="group-col-head">%</span>
            <span class="group-col-head col-del" aria-hidden="true"></span>
        </div>
        <div class="group-allocation-list" id="group-allocation-list">` + portfolioGroups.map(g => {
        const val = getTargetByGroup(g.id);
        const del = canDelete
            ? `<button type="button" class="btn-delete-group" aria-label="ลบกลุ่ม" onclick="deletePortfolioGroup('${g.id}')">✕</button>`
            : '';
        const profitCtrl = isCashGroup(g.id)
            ? `<span class="group-profit-off" title="เงินสด — ไม่ใช้ขายทำกำไร">—</span>`
            : `<label class="group-profit-toggle toggle-switch" title="เปิดขายทำกำไร 3 ส่วน">
                <input type="checkbox"${g.profitTaking ? ' checked' : ''} onchange="updateGroupProfitTaking('${g.id}', this.checked)">
                <span class="toggle-slider"></span>
               </label>`;
        const kindSelect = `<select class="group-kind-select" onchange="updateGroupKind('${g.id}', this.value)" aria-label="ประเภทกลุ่ม" title="ประเภทกลุ่ม">
            <option value="stock"${g.kind === 'stock' ? ' selected' : ''}>หุ้น</option>
            <option value="etf"${g.kind === 'etf' ? ' selected' : ''}>ETF</option>
            <option value="cash"${g.kind === 'cash' ? ' selected' : ''}>สด</option>
        </select>`;
        return `<div class="group-allocation-row" data-group-id="${g.id}">
            <button type="button" class="group-drag-handle" aria-label="สลับลำดับ ${getGroupLabel(g.id)}">≡</button>
            <input class="group-name-input" type="text" value="${getGroupLabel(g.id)}"
                oninput="updateGroupName('${g.id}', this.value)">
            ${kindSelect}
            ${profitCtrl}
            <div class="group-pct-cell">
                <input class="group-pct-input" type="text" inputmode="decimal" value="${formatInputVal(val)}"
                    oninput="updateGroupTarget('${g.id}', this.value)">
                <span class="group-pct-suffix">%</span>
            </div>
            ${del}
        </div>`;
    }).join('') + '</div>';
    updateGroupTargetSum();
    updateProfitGroupsMeta();
}

function updateGroupProfitTaking(id, enabled) {
    const g = getGroupMeta(id);
    if (!g || isCashGroup(id)) return;
    g.profitTaking = enabled;
    savePortfolioGroups();
    updateProfitGroupsMeta();
    if (activeTab === id) scheduleRecalculate();
}

function updateGroupKind(id, kind) {
    const g = getGroupMeta(id);
    if (!g || !['stock', 'etf', 'cash'].includes(kind)) return;
    const wasCash = g.kind === 'cash';
    g.kind = kind;
    if (kind === 'cash') g.profitTaking = false;
    myPortfolio.filter(a => getAssetGroup(a) === id).forEach(a => {
        if (kind === 'cash') {
            a.kind = 'cash';
            a.avgCost = 1;
        } else if (wasCash || a.kind === 'cash') {
            a.kind = inferKind(a.name, id);
            if (a.avgCost === 1) a.avgCost = 0;
        } else {
            a.kind = inferKind(a.name, id);
        }
    });
    savePortfolioGroups();
    persistPortfolio();
    renderGroupAllocationSettings();
    rebuildTabBar();
    updateTabUI();
    renderAndCalculate();
    scheduleCloudSave();
}

function updateGroupName(id, val) {
    const g = getGroupMeta(id);
    if (!g) return;
    g.name = val;
    savePortfolioGroups();
    rebuildTabBar();
    const breakdownEl = document.getElementById('target-breakdown');
    if (breakdownEl) {
        breakdownEl.textContent = portfolioGroups
            .map(gr => `${getGroupLabel(gr.id)} ${fmtPct(getTargetByGroup(gr.id))}`)
            .join(' · ');
    }
}

function addPortfolioGroup() {
    const id = 'g' + Date.now().toString(36);
    portfolioGroups.push(normalizePortfolioGroup({ id, name: 'กลุ่มใหม่', hint: '', kind: 'stock', targetPct: 0, profitTaking: false }));
    savePortfolioGroups();
    renderGroupAllocationSettings();
    rebuildTabBar();
    scheduleCloudSave();
}

function deletePortfolioGroup(id) {
    if (portfolioGroups.length <= 1) return;
    const meta = getGroupMeta(id);
    const assets = myPortfolio.filter(a => getAssetGroup(a) === id);
    if (assets.length) {
        const fallback = portfolioGroups.find(g => g.id !== id);
        if (!confirm(`กลุ่ม "${meta?.name || id}" มี ${assets.length} รายการ — ย้ายไป "${fallback.name}"?`)) return;
        assets.forEach(a => {
            a.group = fallback.id;
            if (isCashGroup(id) && !isCashGroup(fallback.id)) {
                a.kind = inferKind(a.name, fallback.id);
                if (a.avgCost === 1) a.avgCost = 0;
            } else if (!isCashGroup(id) && isCashGroup(fallback.id)) {
                a.kind = 'cash';
                a.avgCost = 1;
            }
        });
    }
    portfolioGroups = portfolioGroups.filter(g => g.id !== id);
    if (activeTab === id) {
        activeTab = portfolioGroups[0].id;
        store.setItem('activeTab', activeTab);
    }
    savePortfolioGroups();
    persistPortfolio();
    renderGroupAllocationSettings();
    rebuildTabBar();
    renderAndCalculate();
    scheduleCloudSave();
}

function updateGroupTargetSum() {
    const sum = portfolioGroups.reduce((s, g) => s + getTargetByGroup(g.id), 0);
    const el = document.getElementById('group-target-sum');
    const meta = document.getElementById('group-targets-meta');
    const ok = Math.abs(sum - 100) < 0.01;
    const text = `รวม ${fmtPct(sum)}` + (ok ? ' ✓' : ' ⚠');
    if (el) {
        el.textContent = text;
        el.style.color = ok ? 'var(--green)' : '#b7791f';
    }
    if (meta) meta.textContent = portfolioGroups.map(g => fmtPct(getTargetByGroup(g.id))).join(' · ');
}

function setGroupTarget(group, pct) {
    const meta = getGroupMeta(group);
    if (meta) meta.targetPct = pct;
    const assets = myPortfolio.filter(a => getAssetGroup(a) === group);
    if (!assets.length) {
        savePortfolioGroups();
        return;
    }
    const oldSum = assets.reduce((s, a) => s + (a.target || 0), 0);
    if (oldSum <= 0) {
        const each = pct / assets.length;
        assets.forEach(a => { a.target = each; });
    } else {
        const ratio = pct / oldSum;
        assets.forEach(a => { a.target = (a.target || 0) * ratio; });
    }
    savePortfolioGroups();
}

function isUserEditing() {
    const el = document.activeElement;
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
}

function updateGroupTarget(group, val) {
    const trimmed = String(val).trim();
    if (trimmed === '' || trimmed === '.' || trimmed === '-') return;
    const pct = parseFloat(trimmed);
    if (isNaN(pct) || pct < 0) return;
    setGroupTarget(group, pct);
    schedulePersistPortfolio();
    scheduleRecalculate();
}

function openSettingsSheet() {
    renderGroupAllocationSettings();
    renderTierSettings();
    updateProfitGroupsMeta();
    document.getElementById('settings-overlay').classList.add('open');
}

function closeSettingsSheet(e) {
    if (e && e.target !== document.getElementById('settings-overlay')) return;
    document.getElementById('settings-overlay').classList.remove('open');
}

function toggleSettingsPanel(id) {
    const panel = document.getElementById(id);
    const section = panel?.closest('.settings-section');
    if (!panel || !section) return;
    const willOpen = panel.classList.contains('hidden');
    panel.classList.toggle('hidden');
    section.classList.toggle('open', willOpen);
}

updateTabUI();

const defaultTiers = [
    { type: 'profit', profitPct: 15, sellPct: 30 },
    { type: 'profit', profitPct: 25, sellPct: 30 },
    { type: 'trailing', trailingPct: 10 }
];
let profitTiers = JSON.parse(store.getItem('profitTiers')) || defaultTiers;
if (!profitTiers[2] || profitTiers[2].type !== 'trailing') {
    profitTiers = defaultTiers;
    store.setItem('profitTiers', JSON.stringify(profitTiers));
}

function renderTierSettings() {
    const el = document.getElementById('tier-settings');
    el.innerHTML = profitTiers.map((tier, i) => {
        if (tier.type === 'trailing') {
            return `<div class="tier-item">
                <div class="tier-num">ส่วน 3 · Trailing</div>
                <div class="tier-row">
                    <label>ร่วง</label>
                    <input class="setting-input" type="number" inputmode="decimal" value="${tier.trailingPct || 10}"
                        oninput="updateTier(${i}, 'trailingPct', this.value)">
                    <span class="setting-suffix">%</span>
                </div>
                <div class="peak-hint">จากจุดสูงสุด → ขายที่เหลือ</div>
            </div>`;
        }
        return `<div class="tier-item">
            <div class="tier-num">ส่วน ${i + 1}</div>
            <div class="tier-row">
                <label>กำไร</label>
                <input class="setting-input" type="number" inputmode="decimal" value="${tier.profitPct}"
                    oninput="updateTier(${i}, 'profitPct', this.value)">
                <span class="setting-suffix">%</span>
            </div>
            <div class="tier-row">
                <label>ขาย</label>
                <input class="setting-input" type="number" inputmode="decimal" value="${tier.sellPct}"
                    oninput="updateTier(${i}, 'sellPct', this.value)">
                <span class="setting-suffix">%</span>
            </div>
        </div>`;
    }).join('');
}

function persistPortfolio() {
    const data = myPortfolio.map(a => ({
        name: a.name,
        kind: a.kind || inferKind(a.name, a.group),
        group: resolveAssetGroup(a),
        shares: a.shares || 0,
        avgCost: isCashAsset(a) ? 1 : (a.avgCost || 0),
        target: a.target || 0,
        peakValue: a.peakValue || 0,
        tiersDone: a.tiersDone || [false, false, false]
    }));
    store.setItem('myPortfolio', JSON.stringify(data));
    store.setItem('localUpdatedAt', String(Date.now()));
    scheduleCloudSave();
}

function getTargetByGroup(group) {
    const assets = myPortfolio.filter(a => getAssetGroup(a) === group);
    if (assets.length) return assets.reduce((s, a) => s + (a.target || 0), 0);
    return getGroupMeta(group)?.targetPct || 0;
}

function getAssetGroup(asset) {
    return asset.group || inferGroup(asset.name, asset.kind);
}

/* แสดงทุกสินทรัพย์ในรายการเดียว (ไม่แยกแท็บกลุ่มแล้ว) */
function isVisibleAsset(asset) {
    return true;
}

function updatePeakValues() {
    syncAssetValues();
    myPortfolio.forEach(a => {
        if (a.value > (a.peakValue || 0)) a.peakValue = a.value;
    });
}

function getStockData(symbol) {
    return priceCache[symbol] || {};
}

function formatFvHeader(symbol) {
    // ใช้เป้านักวิเคราะห์ (เฉลี่ย) แทนราคายุติธรรมของแอป
    const fv = getStockData(symbol).fairValue;
    const target = fv?.analystTarget;
    const price = getPrice(symbol);
    if (!target) return { fv: '—', opp: '', oppCls: 'muted' };
    const up = price > 0 ? ((target - price) / price) * 100 : null;
    const fvText = fmtTrade(target);
    if (up == null) return { fv: fvText, opp: '', oppCls: 'muted' };
    const sign = up > 0 ? '+' : '';
    return {
        fv: fvText,
        opp: `${sign}${fmt(up, 2)}%`,
        oppCls: up > 0 ? 'gain' : up < 0 ? 'loss' : 'muted',
    };
}

/* กำไร/ขาดทุนที่จะได้ถ้าราคาขึ้น (หรือลง) ไปถึงเป้านักวิเคราะห์ คิดจากจำนวนหุ้นที่ถืออยู่ */
function fvHeaderInnerHtml(symbol, asset) {
    const h = formatFvHeader(symbol);
    const oppHtml = h.opp ? ` <span class="asset-fv-opp ${h.oppCls}">${h.opp}</span>` : '';
    let gainHtml = '';
    const fv = getStockData(symbol).fairValue?.analystTarget;
    const price = getPrice(symbol);
    const shares = asset?.shares || 0;
    if (fv > 0 && price > 0 && shares > 0) {
        const gain = (fv - price) * shares;
        const sign = gain > 0 ? '+' : gain < 0 ? '−' : '';
        const cls = gain > 0 ? 'gain' : gain < 0 ? 'loss' : 'muted';
        const thbStr = '';
        const thb = thbStr ? ` <span class="thb">(${thbStr})</span>` : '';
        const label = gain >= 0 ? 'ถ้าถึงราคานี้' : 'ถ้าลงถึงราคานี้';
        gainHtml = `<span class="asset-fv-gain"><span class="asset-fv-gain-label">${label}</span> <span class="${cls}">${sign}${fmtUsd(Math.abs(gain))}${thb}</span></span>`;
    }
    return `<span class="asset-fv-main">เป้านักวิเคราะห์ <span class="asset-fv-price">${h.fv}</span>${oppHtml}</span>${gainHtml}`;
}

function renderFvHeaderHtml(symbol, asset) {
    if (asset && isCashAsset(asset)) {
        return `<div class="asset-fv-head"><span class="asset-fv-inline muted">เงินสด</span></div>`;
    }
    return `<div class="asset-fv-head"><span class="asset-fv-inline">${fvHeaderInnerHtml(symbol, asset)}</span></div>`;
}

function updateFvHeader(card, symbol, asset) {
    if (asset && isCashAsset(asset)) return;
    const el = card.querySelector('.asset-fv-inline');
    if (!el) return;
    el.innerHTML = fvHeaderInnerHtml(symbol, asset);
}

/* สัญญาณจากแนวรับ/แนวต้าน (แยกจากการปรับสัดส่วน)
 * ราคาห่างแนวรับไม่เกิน 1% = ซื้อ · ห่างแนวต้านไม่เกิน 1% = ขาย · นอกนั้น = รอ */
function getTradeSignal(asset) {
    if (isCashAsset(asset)) return { text: '—', sub: '', cls: 'hold' };
    const lv = computePriceLevels(asset);
    if (!lv || lv.loading || (!lv.buy && !lv.sell)) return { text: '—', sub: '', cls: 'hold' };
    if (lv.buy?.near) return { text: 'ซื้อ', sub: `ใกล้แนวรับ ${fmtTrade(lv.buy.price)}`, cls: 'buy' };
    if (lv.sell?.near) return { text: 'ขาย', sub: `ใกล้แนวต้าน ${fmtTrade(lv.sell.price)}`, cls: 'sell' };
    return { text: 'รอ', sub: lv.buy ? `ยังไม่ถึงแนวรับ ${fmtTrade(lv.buy.price)}` : '', cls: 'hold' };
}

/* ชิปบนแถวย่อ: ⚖ = ปรับสัดส่วน · 📍 = แนวรับ/แนวต้าน */
function rowActsHtml(asset, action, sig) {
    const cash = isCashAsset(asset);
    let html = '';
    if (action && action.cls !== 'hold') {
        html += `<span class="cr-act ${action.cls}" title="ปรับสัดส่วน: ${action.text}">⚖ ${action.cls === 'buy' ? (cash ? 'เติม' : 'ซื้อ') : (cash ? 'ลด' : 'ขาย')}</span>`;
    }
    if (!cash && sig && sig.cls !== 'hold') {
        html += `<span class="cr-act sr ${sig.cls}" title="แนวรับ/ต้าน: ${sig.sub}">📍 ${sig.text}</span>`;
    }
    return html;
}

function updateTier(index, field, val) {
    profitTiers[index][field] = parseFloat(val) || 0;
    store.setItem('profitTiers', JSON.stringify(profitTiers));
    scheduleCloudSave();
    scheduleRecalculate();
}

renderTierSettings();

let dipBuyPct = parseFloat(store.getItem('dipBuyPct')) || 10;

function usdDual(usd, sign = '') {
    return sign + fmtUsd(Math.abs(usd));
}

function thbDual(usd, sign = '') {
    return '';
}

function fmt(n, dec = 2) {
    return n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtPct(n) {
    return fmt(n, 2) + '%';
}

/* สกุลเงินที่แสดง (ปุ่ม $ / ฿ บนหัว) — เปลี่ยนแค่การแสดงผล ข้อมูลที่กรอกยังเป็นดอลลาร์ */
function isThbDisplay() {
    return displayCurrency === 'THB' && usdThbRate > 0;
}

/* ราคาต่อหุ้น / จำนวนเงินที่ต้องซื้อขาย: เป็นดอลลาร์เสมอ เพราะซื้อขายเป็นดอลลาร์ (ปุ่ม ฿ เปลี่ยนแค่มูลค่ารวม/กำไร) */
function fmtTrade(n) {
    return '$' + fmt(n, 2);
}

function fmtUsd(n) {
    if (isThbDisplay()) return '฿' + fmt(n * usdThbRate, 2);
    return '$' + fmt(n, 2);
}

function formatInputVal(n, dec = 2) {
    if (n == null || n === '' || isNaN(n)) return '';
    return Number(n).toFixed(dec);
}

let persistDebounce = null;
function schedulePersistPortfolio() {
    clearTimeout(persistDebounce);
    persistDebounce = setTimeout(persistPortfolio, 600);
}

let recalcDebounce = null;
function scheduleRecalculate() {
    clearTimeout(recalcDebounce);
    recalcDebounce = setTimeout(recalculate, 120);
}

function getAssetPrice(asset) {
    return getPrice(asset.name) || asset.price || 0;
}

function usdToShares(usd, asset) {
    const price = getAssetPrice(asset);
    if (!price || price <= 0 || !usd) return 0;
    return usd / price;
}

function formatShareAdvice(usd, asset) {
    const shares = usdToShares(usd, asset);
    if (!shares) return '';
    return ` · ${fmt(shares, 2)} หุ้น`;
}

function getAction(diff, asset) {
    if (isCashAsset(asset)) {
        if (diff > 0.01) return { cls: 'buy', text: `เติม ${fmtTrade(diff)}` };
        if (diff < -0.01) return { cls: 'sell', text: `ลด ${fmtTrade(Math.abs(diff))}` };
        return { cls: 'hold', text: 'พอดี' };
    }
    const sharePart = formatShareAdvice(Math.abs(diff), asset);
    if (diff > 0.01) return { cls: 'buy', text: `ซื้อ ${fmtTrade(diff)}${sharePart}` };
    if (diff < -0.01) return { cls: 'sell', text: `ขาย ${fmtTrade(Math.abs(diff))}${sharePart}` };
    return { cls: 'hold', text: 'สมดุล' };
}

function computePortfolio() {
    updatePeakValues();
    let totalValue = 0, totalTarget = 0;
    myPortfolio.forEach(a => {
        totalValue += a.value;
        totalTarget += a.target;
    });

    const assets = myPortfolio.map((asset, index) => {
        const curPct = totalValue > 0 ? (asset.value / totalValue) * 100 : 0;
        const ideal = totalValue * (asset.target / 100);
        const diff = ideal - asset.value;
        const cost = asset.cost || 0;
        const profit = cost > 0 ? asset.value - cost : 0;
        const profitPct = cost > 0 ? (profit / cost) * 100 : 0;
        const tradeSignal = getTradeSignal(asset);
        return { index, asset, curPct, ideal, diff, action: getAction(diff, asset), cost, profit, profitPct, tradeSignal };
    });

    return { totalValue, totalTarget, assets };
}

function formatProfit(profit, profitPct) {
    const sign = profit >= 0 ? '+' : '';
    const cls = profit >= 0 ? 'gain' : 'loss';
    return { text: `${sign}${fmtPct(profitPct)} (${fmtUsd(Math.abs(profit))})`, cls };
}

/* ต้นทุนและกำไร/ขาดทุนรวม — ไม่รวมเงินสด, ไม่รวมตัวที่ยังไม่มีราคาหรือยังไม่ได้ใส่ต้นทุน */
function computeProfitSummary() {
    let cost = 0, value = 0, pending = 0, noCost = 0;
    myPortfolio.forEach(a => {
        if (isCashAsset(a) || !(a.shares > 0)) return;
        const price = getAssetPrice(a);
        if (!(price > 0)) { pending++; return; }
        if (!(a.avgCost > 0)) { noCost++; return; }
        cost += a.shares * a.avgCost;
        value += a.shares * price;
    });
    const profit = value - cost;
    const pct = cost > 0 ? (profit / cost) * 100 : 0;
    return { cost, value, profit, pct, pending, noCost };
}

function updateProfitSummary() {
    const box = document.getElementById('pl-box');
    const pctEl = document.getElementById('pl-pct');
    const amountEl = document.getElementById('pl-amount');
    const noteEl = document.getElementById('pl-note');
    const costEl = document.getElementById('cost-value');
    const costThbEl = document.getElementById('cost-thb');
    if (!box || !pctEl || !amountEl || !noteEl || !costEl || !costThbEl) return;
    const { cost, profit, pct, pending, noCost } = computeProfitSummary();
    const cls = cost > 0 ? (profit > 0 ? ' gain' : profit < 0 ? ' loss' : '') : '';
    box.className = 'hero-pl summary-pl' + cls;
    if (cost > 0) {
        const sign = profit > 0 ? '+' : profit < 0 ? '−' : '';
        pctEl.textContent = `${sign}${fmt(Math.abs(pct), 2)}%`;
        const thbStr = '';
        amountEl.innerHTML = `<span class="usd">${usdDual(profit, sign)}</span>`
            + (thbStr ? ` <span class="thb">${thbDual(profit, sign)}</span>` : '');
        costEl.innerHTML = usdDual(cost);
        costThbEl.innerHTML = thbDual(cost);
    } else {
        pctEl.textContent = '—';
        amountEl.textContent = 'ใส่ราคาทุนเพื่อดูกำไร';
        costEl.textContent = '—';
        costThbEl.textContent = '';
    }
    const notes = [];
    if (pending) notes.push(`รอราคา ${pending} ตัว`);
    if (noCost) notes.push(`ไม่ได้ใส่ทุน ${noCost} ตัว`);
    noteEl.textContent = notes.join(' · ');
    noteEl.hidden = !notes.length;
    box.title = 'คิดจากหุ้นที่มีจำนวนและราคาทุน ไม่รวมเงินสด';
}

function updateSummary(totalValue, totalTarget) {
    document.getElementById('total-value').textContent = fmtUsd(totalValue);
    const thbEl = document.getElementById('total-value-thb');
    if (thbEl) {
        thbEl.innerHTML = thbDual(totalValue);
    }

    updateProfitSummary();

    const targetBox = document.getElementById('target-box');
    const targetEl = document.getElementById('target-status');
    targetBox.className = totalTarget === 100 ? 'ok' : 'warn';
    targetEl.textContent = fmt(totalTarget, Number.isInteger(Math.round(totalTarget * 100) / 100) ? 0 : 2) + '%' + (Math.abs(totalTarget - 100) > 0.005 ? ' ⚠' : ' ✓');
    // รายละเอียดแยกกลุ่มดูได้ที่แท็บด้านล่าง — เก็บไว้เป็น tooltip
    targetBox.title = 'เป้าหมายรวม · ' + portfolioGroups
        .map(g => `${getGroupLabel(g.id)} ${fmtPct(getTargetByGroup(g.id))}`)
        .join(' · ');
    updateTabUI();
    renderPlanCard();
}

function recalculate() {
    const { totalValue, totalTarget, assets } = computePortfolio();
    updateSummary(totalValue, totalTarget);
    updateTabUI();

    assets.forEach(({ index, curPct, ideal, action, cost, profitPct, tradeSignal, asset }) => {
        const card = document.querySelector(`.asset-card[data-index="${index}"]`);
        if (!card) return;

        paintBucket(card, asset);
        const crPct = card.querySelector('.cr-pct');
        if (crPct) crPct.innerHTML = crPctHtml(asset, curPct);
        const crAlloc = card.querySelector('.cr-alloc');
        if (crAlloc) crAlloc.innerHTML = crAllocHtml(asset, curPct);
        const crValue = card.querySelector('.cr-value');
        if (crValue) crValue.innerHTML = crValueHtml(asset);
        const crProfit = card.querySelector('.cr-profit');
        if (crProfit) crProfit.innerHTML = crProfitHtml(asset, cost, asset.value - cost, profitPct);
        const targetPctEl = card.querySelector('.asset-target-pct');
        if (targetPctEl) targetPctEl.textContent = fmtPct(asset.target || 0);
        const pctEl = card.querySelector('.asset-pct');
        if (pctEl) pctEl.textContent = fmtPct(curPct);
        const sharesEl = card.querySelector('.asset-shares');
        if (sharesEl) sharesEl.textContent = formatSharesLabel(asset);
        const valueCell = card.querySelector('.cell-value');
        if (valueCell) valueCell.innerHTML = valueCellHtml(asset);
        const profitCell = card.querySelector('.cell-profit');
        if (profitCell) profitCell.innerHTML = profitCellHtml(asset, cost, asset.value - cost, profitPct);
        const dtGrid = card.querySelector('.dt-grid');
        if (dtGrid) dtGrid.innerHTML = detailStatsHtml(asset);
        const priceCell = card.querySelector('.cell-price');
        if (priceCell) priceCell.innerHTML = priceCellHtml(asset);

        updateFvHeader(card, asset.name, asset);

        const levelsEl = card.querySelector('.asset-levels');
        if (levelsEl) levelsEl.innerHTML = renderPriceLevelsInner(asset);
        const adviceEl = card.querySelector('.asset-advice');
        if (adviceEl) adviceEl.innerHTML = renderAdviceInner(tradeSignal, action);
        const actsEl = card.querySelector('.cr-acts');
        if (actsEl) actsEl.innerHTML = rowActsHtml(asset, action, tradeSignal);
    });

    if (assetSheetIndex != null) {
        const item = assets.find(a => a.index === assetSheetIndex);
        if (item) updateAssetSheetLive({ ...item, asset: item.asset });
    }

    if (document.getElementById('settings-overlay')?.classList.contains('open')) {
        updateGroupTargetSum();
    }
}

let assetSheetIndex = null;

function openAssetSheet(index) {
    assetSheetIndex = index;
    document.getElementById('asset-sheet-title').textContent = myPortfolio[index].name;
    refreshAssetSheet();
    document.getElementById('asset-overlay').classList.add('open');
}

function closeAssetSheet(e) {
    if (e && e.target !== document.getElementById('asset-overlay')) return;
    document.getElementById('asset-overlay').classList.remove('open');
    assetSheetIndex = null;
}

function refreshAssetSheet() {
    if (assetSheetIndex == null) return;
    const { assets } = computePortfolio();
    const item = assets.find(a => a.index === assetSheetIndex);
    if (!item) return;
    document.getElementById('asset-sheet-body').innerHTML = renderAssetSheetBody(item);
}

function updateAssetSheetLive({ cost, profit, profitPct, tradeSignal, asset, action }) {
    if (asset && isCashAsset(asset)) {
        const adviceEl = document.getElementById('asset-sheet-advice');
        if (adviceEl) {
            adviceEl.textContent = action ? action.text : '—';
        }
        return;
    }
    const profitFmt = cost > 0 ? formatProfit(profit, profitPct) : { text: '—', cls: '' };
    const profitEl = document.getElementById('asset-sheet-profit');
    if (profitEl) {
        profitEl.textContent = profitFmt.text;
        profitEl.className = 'cell-value asset-profit ' + profitFmt.cls;
    }
    const adviceEl = document.getElementById('asset-sheet-advice');
    if (adviceEl) {
        adviceEl.textContent = action ? action.text : '—';
        adviceEl.style.display = '';
    }
}

function renderGroupSelectHtml(index, asset) {
    return ''; // ไม่แยกกลุ่มแล้ว
    const cur = getAssetGroup(asset);
    const opts = portfolioGroups.map(g =>
        `<option value="${g.id}"${g.id === cur ? ' selected' : ''}>${getGroupLabel(g.id)}</option>`
    ).join('');
    return `<div class="asset-sheet-field">
        <label>ย้ายไปกลุ่ม</label>
        <select class="asset-group-select" onchange="updateAssetGroup(${index}, this.value)">${opts}</select>
    </div>`;
}

function updateAssetGroup(index, newGroup) {
    if (!portfolioGroups.some(g => g.id === newGroup)) return;
    const asset = myPortfolio[index];
    const oldGroup = getAssetGroup(asset);
    if (oldGroup === newGroup) return;
    const name = asset.name;
    const sheetOpen = assetSheetIndex === index;
    asset.group = newGroup;
    if (isCashGroup(newGroup)) {
        asset.kind = 'cash';
        asset.avgCost = 1;
    } else if (isCashGroup(oldGroup) || asset.kind === 'cash') {
        asset.kind = inferKind(asset.name, newGroup);
        if (asset.avgCost === 1) asset.avgCost = 0;
    }
    sortPortfolioByGroup();
    syncAssetValues();
    persistPortfolio();
    scheduleCloudSave();
    if (sheetOpen) {
        assetSheetIndex = myPortfolio.findIndex(a => a.name === name);
        refreshAssetSheet();
    }
    renderAndCalculate();
}

function renderAssetSheetBody({ index, asset, cost, profit, profitPct, tradeSignal, action }) {
    if (isCashAsset(asset)) {
        const adviceText = action ? action.text : '—';
        return `
        <div class="trade-box">
            <div class="trade-head">💵 คงเหลือ <b>${fmtTrade(asset.shares || 0)}</b></div>
            <div class="asset-sheet-field">
                <label>จำนวนเงิน ($)</label>
                <input type="text" inputmode="decimal" id="cash-amt" placeholder="0.00" autocomplete="off">
            </div>
            <div class="trade-btns">
                <button type="button" class="tb-buy" onclick="cashMove(${index}, 1)">＋ เติม</button>
                <button type="button" class="tb-sell" onclick="cashMove(${index}, -1)">− ถอน</button>
            </div>
        </div>
        <div class="sheet-sub">✎ แก้ไขเอง</div>
        ${renderGroupSelectHtml(index, asset)}
        <div class="asset-sheet-grid">
            <div class="asset-sheet-field">
                <label>จำนวนเงิน ($)</label>
                <input type="text" inputmode="decimal" value="${asset.shares ? formatInputVal(asset.shares) : ''}" placeholder="0.00" autocomplete="off"
                    oninput="updateAsset(${index}, 'shares', this.value)">
            </div>
            <div class="asset-sheet-field">
                <label>เป้าหมายสัดส่วน (%)</label>
                <input type="text" inputmode="decimal" value="${asset.target ? formatInputVal(asset.target) : ''}" placeholder="0.00" autocomplete="off"
                    oninput="updateAsset(${index}, 'target', this.value)">
            </div>
            <div class="asset-sheet-field">
                <label>ปรับสัดส่วน</label>
                <div class="setting-hint asset-sheet-advice" id="asset-sheet-advice">${adviceText}</div>
            </div>
        </div>
        <button class="btn-settings-done" type="button" style="margin-top:14px;background:var(--red)" onclick="deleteAssetFromSheet(${index})">ลบออกจากพอร์ต</button>
        <button class="btn-settings-done" type="button" onclick="closeAssetSheet()">เสร็จสิ้น</button>`;
    }
    const role = getAssetRole(asset.name);
    const profitFmt = cost > 0 ? formatProfit(profit, profitPct) : { text: '—', cls: '' };
    const adviceText = action ? action.text : '—';
    return `
        ${role ? `<div class="setting-hint" style="margin-bottom:12px">${role}</div>` : ''}
        ${renderTradeBox(index, asset)}
        ${renderGroupSelectHtml(index, asset)}
        <div class="sheet-sub">✎ แก้ไขเอง</div>
        <div class="asset-sheet-grid">
            <div class="asset-sheet-field">
                <label>จำนวนหุ้น</label>
                <input type="text" inputmode="decimal" value="${asset.shares ? formatInputVal(asset.shares) : ''}" placeholder="0.00" autocomplete="off"
                    oninput="updateAsset(${index}, 'shares', this.value)">
            </div>
            <div class="asset-sheet-field">
                <label>ต้นทุนเฉลี่ย/หุ้น ($)</label>
                <input type="text" inputmode="decimal" value="${asset.avgCost ? formatInputVal(asset.avgCost) : ''}" placeholder="0.00" autocomplete="off"
                    oninput="updateAsset(${index}, 'avgCost', this.value)">
            </div>
            <div class="asset-sheet-field">
                <label>เป้าหมายสัดส่วน (%)</label>
                <input type="text" inputmode="decimal" value="${asset.target ? formatInputVal(asset.target) : ''}" placeholder="0.00" autocomplete="off"
                    oninput="updateAsset(${index}, 'target', this.value)">
            </div>
            ${showProfitTaking() || tradeSignal.cls !== 'hold' ? `
            <div class="asset-sheet-field">
                <label>กำไร/ขาดทุน</label>
                <div class="buy-item"><span class="cell-value asset-profit ${profitFmt.cls}" id="asset-sheet-profit">${profitFmt.text}</span></div>
                <div class="setting-hint asset-sheet-advice" id="asset-sheet-advice" style="margin-top:8px">${adviceText}</div>
            </div>` : ''}
        </div>
        <button class="btn-settings-done" type="button" style="margin-top:14px;background:var(--red)" onclick="deleteAssetFromSheet(${index})">ลบออกจากพอร์ต</button>
        <button class="btn-settings-done" type="button" onclick="closeAssetSheet()">เสร็จสิ้น</button>`;
}

function fmtShares(n) {
    return (n || 0).toLocaleString('en-US', { maximumFractionDigits: 4 });
}

function formatSharesLabel(asset) {
    if (isCashAsset(asset)) return '';
    return asset.shares > 0 ? `${fmtShares(asset.shares)} หุ้น` : 'ยังไม่มีหุ้น';
}

/* เนื้อหาช่อง ราคา / มูลค่า บนการ์ด — ดอลลาร์ตัวหลัก, บาทบรรทัดรอง */
function thbInline(usd, sign = '', cls = '') {
    const t = thbDual(usd, sign);
    return t ? ` <span class="stat-thb-inline ${cls}">${t}</span>` : '';
}

function priceCellHtml(asset) {
    const price = getPrice(asset.name);
    const priceText = price > 0 ? fmtTrade(price) : (priceCache[asset.name]?.error ? 'ไม่พบ' : '…');
    const costHtml = asset.avgCost > 0
        ? `ทุน ${fmtTrade(asset.avgCost)}`
        : 'ยังไม่ใส่ทุน';
    return `<span class="stat-line"><span class="stat-num asset-price hi">${priceText}</span></span>`
        + `<span class="stat-line stat-sub muted asset-cost">${costHtml}</span>`
        + extLineHtml(asset);
}

function valueCellHtml(asset) {
    const totalCost = !isCashAsset(asset) && asset.avgCost > 0 && asset.shares > 0 ? asset.shares * asset.avgCost : 0;
    return `<span class="stat-line"><span class="stat-num asset-value">${usdDual(asset.value)}</span>${thbInline(asset.value)}</span>`
        + (totalCost > 0
            ? `<span class="stat-line stat-sub muted asset-total-cost">ทุน ${usdDual(totalCost)}${thbInline(totalCost)}</span>`
            : '');
}

function profitCellHtml(asset, cost, profit, profitPct) {
    if (!(cost > 0)) return `<span class="stat-num muted">—</span><span class="stat-sub muted">ยังไม่ใส่ทุน</span>`;
    if (!(getPrice(asset.name) > 0)) return `<span class="stat-num muted">…</span>`;
    const sign = profit > 0 ? '+' : profit < 0 ? '−' : '';
    const cls = profit > 0 ? 'gain' : profit < 0 ? 'loss' : 'muted';
    return `<span class="stat-num asset-pl ${cls}">${sign}${fmt(Math.abs(profitPct), 2)}%</span>`
        + `<span class="stat-line"><span class="stat-sub ${cls}">${usdDual(profit, sign)}</span>${thbInline(profit, sign, cls)}</span>`;
}

/* แยก 2 สัญญาณ: ⚖ ปรับสัดส่วน (ให้ตรงเป้า) · 📍 แนวรับ/ต้าน (จังหวะราคา) */
function renderAdviceInner(tradeSignal, action) {
    const item = (cls, label, text, tcls, sub) =>
        `<div class="advice-item ${cls}"><span class="advice-label">${label}</span> <span class="advice-text ${tcls}">${text}</span>${sub ? ` <span class="advice-sub">${sub}</span>` : ''}</div>`;
    return item('rb', '⚖ ปรับสัดส่วน', action.text, action.cls);
}

/* ซื้อไม่เกิน = แนวรับใกล้สุดใต้ราคา, ขาย = แนวต้านใกล้สุดเหนือราคา
 * ใช้โหมดเดียวกับหน้าวิเคราะห์หุ้น (ถือยาว = swing, เทรดสั้น = pivot) */
function getSrMode() {
    try {
        return localStorage.getItem('stock-sr-mode') === 'pivot' ? 'pivot' : 'swing';
    } catch {
        return 'swing';
    }
}

function computePriceLevels(asset) {
    if (isCashAsset(asset)) return null;
    const sr = priceCache[asset.name]?.srLevels?.[getSrMode()];
    if (!sr) return { loading: !priceCache[asset.name], buy: null, sell: null };
    const fv = getStockData(asset.name).fairValue?.analystTarget || null;
    const price = getPrice(asset.name);
    const near = lv => lv && price > 0 && Math.abs(price - lv.price) / lv.price <= 0.01;
    return {
        buy: sr.support ? { ...sr.support, aboveFv: fv > 0 && sr.support.price > fv, near: near(sr.support) } : null,
        sell: sr.resistance ? { ...sr.resistance, near: near(sr.resistance) } : null
    };
}

function renderPriceLevelsInner(asset) {
    const lv = computePriceLevels(asset);
    if (!lv) return '';
    if (lv.loading) return '';
    const note = level => {
        const price = getPrice(asset.name);
        if (!(price > 0)) return ` <span class="lv-note">(${level.label})</span>`;
        const d = ((level.price - price) / price) * 100;
        return ` <span class="lv-note">(${d > 0 ? '+' : '−'}${fmt(Math.abs(d), 1)}% · ${level.label})</span>`;
    };
    let buyHtml, sellHtml;
    if (lv.buy) {
        const tags = (lv.buy.near ? ' <span class="lv-tag">✓ ใกล้แนวรับ</span>' : '')
            + (lv.buy.aboveFv ? ' <span class="lv-warn">⚠ สูงกว่าเป้านักวิเคราะห์</span>' : '');
        buyHtml = `<span class="lv-item lv-buy"><span class="lv-label">ซื้อไม่เกิน</span> <span class="lv-price">${fmtTrade(lv.buy.price)}</span>${note(lv.buy)}${tags}</span>`;
    } else {
        buyHtml = `<span class="lv-item lv-buy"><span class="lv-label">ซื้อไม่เกิน</span> <span class="lv-note">ไม่มีแนวรับใต้ราคานี้</span></span>`;
    }
    if (lv.sell) {
        const tag = lv.sell.near ? ' <span class="lv-tag">✓ ใกล้แนวต้าน</span>' : '';
        sellHtml = `<span class="lv-item lv-sell"><span class="lv-label">ขาย</span> <span class="lv-price">${fmtTrade(lv.sell.price)}</span>${note(lv.sell)}${tag}</span>`;
    } else {
        sellHtml = `<span class="lv-item lv-sell"><span class="lv-label">ขาย</span> <span class="lv-note">ไม่มีแนวต้านเหนือราคานี้</span></span>`;
    }
    return buyHtml + sellHtml;
}

/* รายละเอียดเมื่อกางแถว: เฉพาะข้อมูลที่แถวยังไม่มี (มูลค่า/กำไร/สัดส่วน อยู่บนแถวแล้ว) */
function detailStatsHtml(asset) {
    if (isCashAsset(asset)) return '';
    const price = getPrice(asset.name);
    const shares = asset.shares || 0;
    const totalCost = shares > 0 && asset.avgCost > 0 ? shares * asset.avgCost : 0;
    const cell = (label, value, sub = '') => `<div class="dt-cell"><span class="dt-label">${label}</span><b class="dt-value">${value}</b>${sub}</div>`;
    return cell('ราคา', price > 0 ? fmtTrade(price) : (priceCache[asset.name]?.error ? 'ไม่พบ' : '…'))
        + cell('ทุน/หุ้น', asset.avgCost > 0 ? fmtTrade(asset.avgCost) : '—')
        + cell('จำนวนหุ้น', shares > 0 ? fmtShares(shares) : '—')
        + cell('ต้นทุนรวม', totalCost > 0 ? fmtUsd(totalCost) : '—');
}

function renderAssetCard(index, asset, curPct, ideal, cost, profit, profitPct, tradeSignal, action) {
    const cash = isCashAsset(asset);
    return `
            ${cash ? '' : `<div class="dt-grid">${detailStatsHtml(asset)}</div>
            <div class="asset-levels">${renderPriceLevelsInner(asset)}</div>`}
            <div class="asset-advice">${renderAdviceInner(tradeSignal, action)}</div>`;
}

function renderAssetGrid(index, asset, curPct, ideal, profitFmt, cost, profit, profitPct, tradeSignal, action) {
    return renderAssetCard(index, asset, curPct, ideal, cost, profit, profitPct, tradeSignal, action);
}

/* ส่วนบนของแถว (แสดงตอนพับ) — ใช้ทั้งตอนวาดใหม่และตอนอัปเดตสด */
function crPctHtml(asset, curPct) {
    const b = assetBucket(asset);
    const ico = b ? `<i class="cr-bucket" style="background:${PLAN_BUCKETS[b.bucket].color}" title="${PLAN_BUCKETS[b.bucket].name}${b.reason ? ' · ' + b.reason : ''}"></i>` : '';
    return `${ico}${fmtPct(curPct)} <span class="cr-target">/ ${fmtPct(asset.target || 0)}</span>`;
}

/* คอลัมน์สัดส่วน (เห็นบนคอม): แถบตอนนี้ + ขีดเป้า */
function crAllocHtml(asset, curPct) {
    const b = assetBucket(asset);
    const color = b ? PLAN_BUCKETS[b.bucket].color : 'var(--ui-accent)';
    const tgt = asset.target || 0;
    const scale = Math.max(curPct, tgt, 1) * 1.15;
    const gap = curPct - tgt;
    const tone = Math.abs(gap) < 1 ? 'ok' : gap > 0 ? 'over' : 'under';
    return `<span class="al-nums"><b>${fmt(curPct, 1)}%</b><small>เป้า ${fmt(tgt, 1)}%</small><em class="${tone}">${tone === 'ok' ? '' : (gap > 0 ? '+' : '−') + fmt(Math.abs(gap), 1)}</em></span>
        <span class="al-track"><i style="width:${Math.min(100, curPct / scale * 100)}%;background:${color}"></i><b style="left:${Math.min(100, tgt / scale * 100)}%"></b></span>`;
}

/* ราคาก่อนเปิด/หลังปิด (หุ้นสหรัฐ) จากราคาสด — แสดงเป็นบรรทัดเล็ก แบบเดียวกับหน้า Watchlist */
function extLineHtml(asset) {
    if (isCashAsset(asset)) return '';
    const e = priceCache[asset.name]?.ext;
    if (!e || !(e.price > 0) || !Number.isFinite(e.changePercent)) return '';
    const up = e.changePercent >= 0;
    return `<small class="cr-ext ${up ? 'gain' : 'loss'}" title="${e.session === 'pre' ? 'ราคาก่อนตลาดเปิด' : 'ราคาหลังตลาดปิด'}"><span>${e.session === 'pre' ? 'ก่อนเปิด' : 'หลังปิด'}</span> ${fmtTrade(e.price)} ${up ? '+' : ''}${fmt(e.changePercent, 2)}%</small>`;
}

function crValueHtml(asset) {
    const other = isThbDisplay()
        ? `≈ $${fmt(asset.value || 0, 2)}`
        : (usdThbRate > 0 ? `≈ ฿${fmt((asset.value || 0) * usdThbRate, 0)}` : '');
    return `<b>${fmtUsd(asset.value || 0)}</b><small>${other}</small>`;
}

function crProfitHtml(asset, cost, profit, profitPct) {
    return crProfitMain(asset, cost, profit, profitPct) + extLineHtml(asset);
}
function crProfitMain(asset, cost, profit, profitPct) {
    const up = profit >= 0;
    return cost > 0 && !isCashAsset(asset)
        ? `<b class="${up ? 'gain' : 'loss'}">${up ? '+' : '−'}${fmtPct(Math.abs(profitPct))}</b>
           <small class="${up ? 'gain' : 'loss'}">(${up ? '+' : '−'}${fmtUsd(Math.abs(profit))})</small>`
        : `<b class="muted">—</b><small class="muted">${isCashAsset(asset) ? 'เงินสด' : 'ยังไม่ใส่ทุน'}</small>`;
}

function appendAssetCard(list, payload) {
    const { index, asset, curPct, ideal, action, cost, profit, profitPct, tradeSignal } = payload;
    const profitFmt = cost > 0 ? formatProfit(profit, profitPct) : { text: '—', cls: '' };
    const row = document.createElement('div');
    const open = openRows.has(asset.name);
    row.className = 'asset-card compact' + (open ? ' open' : '');
    row.dataset.index = index;
    row.dataset.name = asset.name;
    paintBucket(row, asset);
    const profitHtml = crProfitHtml(asset, cost, profit, profitPct);
    const act = `<span class="cr-acts">${rowActsHtml(asset, action, tradeSignal)}</span>`;
    row.innerHTML = `
        <div class="cr-swipe-wrap">
        <span class="row-actions">
            <button type="button" class="ra-gear" onclick="openAssetSheet(${index})" aria-label="ตั้งค่า ${asset.name}">⚙<small>ตั้งค่า</small></button>
            ${portfolioIndex.list.length > 1 ? `<button type="button" class="ra-move" onclick="openMoveSheet(${index})" aria-label="ย้าย ${asset.name} ไปพอร์ตอื่น">⇄<small>ย้าย</small></button>` : ''}
            <button type="button" class="ra-del" onclick="deleteAsset(${index})" aria-label="ลบ ${asset.name}">✕<small>ลบ</small></button>
        </span>
        <div class="cr-row" onclick="toggleRow('${asset.name}', event)" role="button" tabindex="0" aria-expanded="${open}">
            <div class="asset-badge">${asset.name.slice(0, 4)}${logoImg(asset)}</div>
            <div class="cr-name">
                <b>${asset.name}</b>
                <small class="cr-pct">${crPctHtml(asset, curPct)}</small>
                ${act}
            </div>
            <div class="cr-alloc">${crAllocHtml(asset, curPct)}</div>
            <div class="cr-value">${crValueHtml(asset)}</div>
            <div class="cr-profit">${profitHtml}</div>
        </div>
        </div>
        <div class="cr-detail">
        <div class="asset-header">
            <span class="drag-handle" aria-label="สลับลำดับ ${asset.name}">≡</span>
            <div class="asset-badge">${asset.name.slice(0, 4)}</div>
            <div class="asset-name-wrap">
                <div class="asset-name">${asset.name}</div>
                <div class="asset-shares">${formatSharesLabel(asset)}</div>
            </div>
            ${renderFvHeaderHtml(asset.name, asset)}
        </div>
        ${renderAssetGrid(index, asset, curPct, ideal, profitFmt, cost, profit, profitPct, tradeSignal, action)}
        </div>`;
    list.appendChild(row);
}

/* โลโก้หุ้นจาก Financial Modeling Prep — โหลดไม่ได้ก็ลบรูปทิ้ง เหลือกล่องชื่อย่อเดิม */
function logoImg(asset) {
    if (isCashAsset(asset)) return '';
    const sym = String(asset.name || '').toUpperCase().replace(/[^A-Z0-9.\-]/g, '');
    if (!sym) return '';
    return `<img class="asset-logo" src="https://financialmodelingprep.com/image-stock/${encodeURIComponent(sym)}.png" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`;
}

/* แถวกระชับ: แตะเพื่อเปิดรายละเอียด (จำว่าตัวไหนเปิดอยู่ระหว่างคำนวณใหม่) */
const openRows = new Set();
function toggleRow(name, e) {
    if (e && e.target.closest && e.target.closest('.drag-handle')) return;
    if (openRows.has(name)) openRows.delete(name); else openRows.add(name);
    const card = document.querySelector(`.asset-card[data-name="${CSS.escape(name)}"]`);
    if (card) {
        card.classList.toggle('open', openRows.has(name));
        card.querySelector('.cr-row')?.setAttribute('aria-expanded', String(openRows.has(name)));
    }
}

/* เรียงรายการ: manual = ลำดับที่ลากจัดเอง (ค่าเริ่มต้น) */
const SORT_MODES = ['manual', 'value', 'profitPct', 'profit', 'cost'];
let sortMode = (() => { try { const v = localStorage.getItem('rbSort'); return SORT_MODES.includes(v) ? v : 'manual'; } catch { return 'manual'; } })();
let sortDesc = (() => { try { return localStorage.getItem('rbSortDir') !== 'asc'; } catch { return true; } })();

function setSortMode(mode) {
    if (!SORT_MODES.includes(mode)) return;
    sortMode = mode;
    try { localStorage.setItem('rbSort', mode); } catch { /* ignore */ }
    renderAndCalculate();
}

function toggleSortDir() {
    sortDesc = !sortDesc;
    try { localStorage.setItem('rbSortDir', sortDesc ? 'desc' : 'asc'); } catch { /* ignore */ }
    renderAndCalculate();
}

function sortItems(items) {
    if (sortMode === 'manual') return items;
    const key = item => {
        if (sortMode === 'value') return item.asset.value || 0;
        if (sortMode === 'cost') return item.cost || 0;
        if (!(item.cost > 0)) return null; // ไม่มีต้นทุน/เงินสด ไปท้ายสุด
        return sortMode === 'profit' ? item.profit : item.profitPct;
    };
    return [...items].sort((a, b) => {
        const ka = key(a), kb = key(b);
        if (ka == null && kb == null) return 0;
        if (ka == null) return 1;
        if (kb == null) return -1;
        return sortDesc ? kb - ka : ka - kb;
    });
}

function updateSortBar(count) {
    const sel = document.getElementById('sort-select');
    if (sel) sel.value = sortMode;
    const dir = document.getElementById('sort-dir');
    if (dir) { dir.textContent = sortDesc ? '↓' : '↑'; dir.hidden = sortMode === 'manual'; }
    const c = document.getElementById('sort-count');
    if (c) c.textContent = `${count} สินทรัพย์`;
}

function renderAndCalculate() {
    const list = document.getElementById('assets-list');
    list.innerHTML = '';
    list.classList.toggle('sorted', sortMode !== 'manual');

    syncAssetValues();
    const { totalValue, totalTarget, assets } = computePortfolio();
    updateSummary(totalValue, totalTarget);

    const visible = sortItems(assets.filter(({ asset }) => isVisibleAsset(asset)));
    updateSortBar(visible.length);

    if (visible.length === 0) {
        list.innerHTML = `<div class="empty-state">ยังไม่มีสินทรัพย์<br>กดปุ่มด้านล่างเพื่อเพิ่ม</div>`;
        return;
    }

    visible.forEach(item => appendAssetCard(list, item));
}

function updateAsset(index, field, val) {
    const trimmed = String(val).trim();
    if (trimmed === '' || trimmed === '.' || trimmed === '-') return;
    const num = parseFloat(trimmed);
    if (isNaN(num)) return;
    myPortfolio[index][field] = num;
    syncAssetValues();
    scheduleRecalculate();
    schedulePersistPortfolio();
}

function deleteAssetFromSheet(index) {
    if (!confirm(`ลบ ${myPortfolio[index].name} ออกจากพอร์ต?`)) return;
    const name = myPortfolio[index].name;
    closeAssetSheet();
    markAssetDeleted(name);
    myPortfolio.splice(index, 1);
    persistPortfolio();
    flushCloudSave();
    renderAndCalculate();
}

function deleteAsset(index) {
    if (confirm(`ลบ ${myPortfolio[index].name} ออกจากพอร์ต?`)) {
        const name = myPortfolio[index].name;
        if (assetSheetIndex === index) closeAssetSheet();
        markAssetDeleted(name);
        myPortfolio.splice(index, 1);
        persistPortfolio();
        flushCloudSave();
        renderAndCalculate();
    }
}

function openAddSheet() {
    document.getElementById('add-overlay').classList.add('open');
    document.getElementById('new-asset-name').value = '';
    setTimeout(() => document.getElementById('new-asset-name').focus(), 100);
}

function closeAddSheet(e) {
    if (e && e.target !== document.getElementById('add-overlay')) return;
    document.getElementById('add-overlay').classList.remove('open');
}

function addAsset() {
    let name = document.getElementById('new-asset-name').value.trim().toUpperCase();
    // ไม่มีแท็บกลุ่มแล้ว: USD/CASH → กลุ่มเงินสด, อื่น ๆ → เดาจากชื่อ
    const group = /^(USD|THB|CASH)$/.test(name) ? getCashGroupId() : inferGroup(name, inferKind(name, null));
    if (isCashGroup(group)) {
        if (!name) name = 'USD';
    } else if (!name) {
        return;
    }
    const kind = isCashGroup(group) ? 'cash' : (getGroupMeta(group)?.kind || inferKind(name, group));
    unmarkAssetDeleted(name);
    myPortfolio.push({
        name, kind, group,
        shares: 0, avgCost: kind === 'cash' ? 1 : 0, target: 0,
        peakValue: 0, tiersDone: [false, false, false]
    });
    sortPortfolioByGroup();
    closeAddSheet();
    persistPortfolio();
    renderAndCalculate();
    fetchPrices();
}

document.getElementById('new-asset-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') addAsset();
});

/* Drag to reorder (≡ handle — long-press or drag vertically) */
let drag = null;
const DRAG_PRESS_MS = 280;
const DRAG_MOVE_PX = 8;

function getPoint(e) {
    return e.touches ? e.touches[0] : e;
}

function activateDrag(point) {
    if (!drag || drag.active) return;
    const { card, list } = drag;
    const rect = card.getBoundingClientRect();

    drag.active = true;
    drag.placeholder = document.createElement('div');
    drag.placeholder.className = 'drag-placeholder';
    drag.placeholder.style.height = rect.height + 'px';
    list.insertBefore(drag.placeholder, card);

    card.classList.add('drag-float');
    card.style.width = rect.width + 'px';
    card.style.left = rect.left + 'px';
    card.style.top = (point.clientY - drag.offsetY) + 'px';

    list.classList.add('drag-active');
    document.body.classList.add('drag-active');
    if (navigator.vibrate) navigator.vibrate(15);
}

function movePlaceholder(clientY) {
    const cards = [...drag.list.querySelectorAll('.asset-card')];
    for (const card of cards) {
        if (card === drag.card) continue;
        const rect = card.getBoundingClientRect();
        if (clientY < rect.top + rect.height / 2) {
            drag.list.insertBefore(drag.placeholder, card);
            return;
        }
    }
    drag.list.appendChild(drag.placeholder);
}

function finishDrag() {
    if (!drag.active) return;
    const { card, list, placeholder } = drag;
    list.insertBefore(card, placeholder);
    placeholder.remove();

    card.classList.remove('drag-float');
    card.removeAttribute('style');
    list.classList.remove('drag-active');
    document.body.classList.remove('drag-active');

    const cards = [...list.querySelectorAll('.asset-card')];
    const reordered = cards.map(c => myPortfolio[parseInt(c.dataset.index)]);
    const rebuilt = [];
    groupIds().forEach(g => {
        if (g === activeTab) rebuilt.push(...reordered);
        else rebuilt.push(...myPortfolio.filter(a => getAssetGroup(a) === g));
    });
    myPortfolio = rebuilt;
    persistPortfolio();
    flushCloudSave();
    renderAndCalculate();
}

function onDragStart(e) {
    if (drag) return;
    const handle = e.target.closest('.drag-handle');
    if (!handle) return;

    const card = handle.closest('.asset-card');
    if (!card) return;

    const point = getPoint(e);
    if (e.type === 'mousedown') e.preventDefault();

    drag = {
        card,
        list: card.parentElement,
        startX: point.clientX,
        startY: point.clientY,
        offsetY: point.clientY - card.getBoundingClientRect().top,
        timer: setTimeout(() => {
            if (drag && !drag.active) activateDrag({ clientX: drag.startX, clientY: drag.startY });
        }, DRAG_PRESS_MS),
        active: false
    };
}

function onDragMove(e) {
    if (!drag) return;
    const point = getPoint(e);

    if (!drag.active) {
        const dy = Math.abs(point.clientY - drag.startY);
        const dx = Math.abs(point.clientX - drag.startX);
        if (dy >= DRAG_MOVE_PX && dy > dx) {
            clearTimeout(drag.timer);
            activateDrag(point);
        }
        return;
    }

    e.preventDefault();
    drag.card.style.top = (point.clientY - drag.offsetY) + 'px';
    movePlaceholder(point.clientY);
}

function onDragEnd() {
    if (!drag) return;
    clearTimeout(drag.timer);
    if (drag.active) finishDrag();
    drag = null;
}

/* ปัดซ้าย = ตั้งค่า/ลบ · กดค้างแล้วลาก = จัดเรียง (เหมือนหน้า Watchlist) */
const RG_PRESS_MS = 380;
const RG_SLOP = 10;
function attachRowGestures(list, o) {
    let st = null;
    let openRow = null;
    let suppress = false;
    const isRow = (el) => !!el && el instanceof HTMLElement && el.matches(o.row) && el.parentElement === list;
    const rowOf = (t) => {
        const el = t?.closest?.(o.row) ?? null;
        return isRow(el) ? el : null;
    };
    const setX = (row, x, anim) => {
        const s = o.swipeEl(row);
        if (!s)
            return;
        s.style.transition = anim ? "transform .2s ease" : "none";
        s.style.transform = x ? `translateX(${x}px)` : "";
    };
    const close = () => {
        if (!openRow)
            return;
        setX(openRow, 0, true);
        openRow.classList.remove("swiped");
        openRow = null;
    };
    const start = (target, x, y) => {
        const row = rowOf(target);
        if (!row)
            return;
        suppress = false;
        // แตะปุ่มด้านหลังที่เปิดอยู่ → ปล่อยให้คลิกทำงานตามปกติ
        if (openRow === row && target.closest?.(".row-actions"))
            return;
        if (openRow && openRow !== row) {
            close();
            suppress = true;
        }
        const s = { row, x, y, mode: "idle", dx: 0, base: openRow === row ? -o.actionsWidth(row) : 0, timer: null, pending: null };
        st = s;
        if (o.canDrag()) {
            s.timer = window.setTimeout(() => {
                if (st !== s || s.mode !== "idle")
                    return;
                s.mode = "drag";
                suppress = true;
                if (openRow) {
                    setX(openRow, 0, true);
                    openRow.classList.remove("swiped");
                    openRow = null;
                }
                row.classList.add("dragging");
                navigator.vibrate?.(12);
            }, RG_PRESS_MS);
        }
    };
    /** คืนค่า true ถ้าควรกันการเลื่อนหน้า */
    const move = (x, y) => {
        const s = st;
        if (!s)
            return false;
        const dx = x - s.x, dy = y - s.y;
        if (s.mode === "idle") {
            if (Math.abs(dx) > RG_SLOP && Math.abs(dx) > Math.abs(dy) * 1.2) {
                s.mode = "swipe";
                suppress = true;
            }
            else if (Math.abs(dy) > RG_SLOP || Math.abs(dx) > RG_SLOP)
                s.mode = "scroll";
            if (s.mode !== "idle" && s.timer) {
                clearTimeout(s.timer);
                s.timer = null;
            }
        }
        if (s.mode === "swipe") {
            const w = o.actionsWidth(s.row);
            s.dx = Math.max(-w - 24, Math.min(0, s.base + dx));
            setX(s.row, s.dx, false);
            return true;
        }
        if (s.mode === "drag") {
            const row = s.row;
            if (s.pending) {
                const done = s.pending.dir === "down" ? row.previousElementSibling === s.pending.el : row.nextElementSibling === s.pending.el;
                if (done)
                    s.pending = null;
            }
            let off = y - s.y;
            if (!s.pending) {
                const next = row.nextElementSibling, prev = row.previousElementSibling;
                if (isRow(next) && off > next.offsetHeight / 2) {
                    s.y += next.offsetHeight;
                    off -= next.offsetHeight;
                    s.pending = { el: next, dir: "down" };
                    o.onCross(row, next, "down");
                }
                else if (isRow(prev) && off < -prev.offsetHeight / 2) {
                    s.y -= prev.offsetHeight;
                    off += prev.offsetHeight;
                    s.pending = { el: prev, dir: "up" };
                    o.onCross(row, prev, "up");
                }
            }
            row.style.transform = `translateY(${off}px)`;
            return true;
        }
        return false;
    };
    const end = () => {
        const s = st;
        st = null;
        if (!s)
            return;
        if (s.timer)
            clearTimeout(s.timer);
        if (s.mode === "swipe") {
            const w = o.actionsWidth(s.row);
            const open = s.dx < -w / 2;
            setX(s.row, open ? -w : 0, true);
            if (open) {
                openRow = s.row;
                s.row.classList.add("swiped");
            }
            else {
                s.row.classList.remove("swiped");
                if (openRow === s.row)
                    openRow = null;
            }
        }
        else if (s.mode === "drag") {
            s.row.classList.remove("dragging");
            s.row.style.transform = "";
            o.onDrop?.(s.row);
        }
    };
    const onTouchStart = (e) => { if (e.touches.length === 1)
        start(e.target, e.touches[0].clientX, e.touches[0].clientY); };
    const onTouchMove = (e) => { if (st && e.touches.length === 1 && move(e.touches[0].clientX, e.touches[0].clientY) && e.cancelable)
        e.preventDefault(); };
    const onMouseDown = (e) => { if (e.button === 0)
        start(e.target, e.clientX, e.clientY); };
    const onMouseMove = (e) => { if (st && move(e.clientX, e.clientY))
        e.preventDefault(); };
    const onClickCapture = (e) => {
        const row = rowOf(e.target);
        if (suppress) {
            suppress = false;
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        if (openRow && !(row === openRow && e.target.closest?.(".row-actions"))) {
            close();
            e.preventDefault();
            e.stopPropagation();
        }
    };
    const onContext = (e) => { if (rowOf(e.target))
        e.preventDefault(); };
    const onDocDown = (e) => { if (openRow && !openRow.contains(e.target))
        close(); };
    list.addEventListener("touchstart", onTouchStart, { passive: true });
    list.addEventListener("touchmove", onTouchMove, { passive: false });
    list.addEventListener("touchend", end);
    list.addEventListener("touchcancel", end);
    list.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", end);
    list.addEventListener("click", onClickCapture, true);
    list.addEventListener("contextmenu", onContext);
    document.addEventListener("touchstart", onDocDown, { passive: true });
    document.addEventListener("mousedown", onDocDown);
    return () => {
        list.removeEventListener("touchstart", onTouchStart);
        list.removeEventListener("touchmove", onTouchMove);
        list.removeEventListener("touchend", end);
        list.removeEventListener("touchcancel", end);
        list.removeEventListener("mousedown", onMouseDown);
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", end);
        list.removeEventListener("click", onClickCapture, true);
        list.removeEventListener("contextmenu", onContext);
        document.removeEventListener("touchstart", onDocDown);
        document.removeEventListener("mousedown", onDocDown);
    };
}

function persistOrderFromDom(list) {
    const reordered = [...list.querySelectorAll('.asset-card')].map(c => myPortfolio[parseInt(c.dataset.index)]).filter(Boolean);
    if (reordered.length !== myPortfolio.length) return;
    myPortfolio = reordered;
    persistPortfolio();
    flushCloudSave();
    renderAndCalculate();
}

(function initRowGestures() {
    const list = document.getElementById('assets-list');
    attachRowGestures(list, {
        row: '.asset-card',
        swipeEl: card => card.querySelector('.cr-row'),
        actionsWidth: card => card.querySelector('.row-actions')?.offsetWidth || 148,
        canDrag: () => sortMode === 'manual' && list.querySelectorAll('.asset-card').length > 1,
        onCross: (card, neighbor, dir) => {
            if (dir === 'down') list.insertBefore(neighbor, card);
            else list.insertBefore(card, neighbor);
        },
        onDrop: () => persistOrderFromDom(list)
    });
})();

(function initDragSort() {
    const list = document.getElementById('assets-list');
    list.addEventListener('touchstart', onDragStart, { passive: false });
    list.addEventListener('mousedown', onDragStart);
    document.addEventListener('touchmove', onDragMove, { passive: false });
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('touchend', onDragEnd);
    document.addEventListener('touchcancel', onDragEnd);
    document.addEventListener('mouseup', onDragEnd);
    list.addEventListener('contextmenu', e => {
        if (e.target.closest('.drag-handle')) e.preventDefault();
    });
})();

/* Drag to reorder groups (≡ in settings) */
let groupDrag = null;

function activateGroupDrag(point) {
    if (!groupDrag || groupDrag.active) return;
    const { card, list } = groupDrag;
    const rect = card.getBoundingClientRect();
    groupDrag.active = true;
    groupDrag.placeholder = document.createElement('div');
    groupDrag.placeholder.className = 'group-drag-placeholder';
    groupDrag.placeholder.style.height = rect.height + 'px';
    list.insertBefore(groupDrag.placeholder, card);
    card.classList.add('drag-float');
    card.style.width = rect.width + 'px';
    card.style.left = rect.left + 'px';
    card.style.top = (point.clientY - groupDrag.offsetY) + 'px';
    list.classList.add('drag-active');
    document.body.classList.add('drag-active');
    if (navigator.vibrate) navigator.vibrate(15);
}

function moveGroupPlaceholder(clientY) {
    const rows = [...groupDrag.list.querySelectorAll('.group-allocation-row')];
    for (const row of rows) {
        if (row === groupDrag.card) continue;
        const rect = row.getBoundingClientRect();
        if (clientY < rect.top + rect.height / 2) {
            groupDrag.list.insertBefore(groupDrag.placeholder, row);
            return;
        }
    }
    groupDrag.list.appendChild(groupDrag.placeholder);
}

function finishGroupDrag() {
    if (!groupDrag.active) return;
    const { card, list, placeholder } = groupDrag;
    list.insertBefore(card, placeholder);
    placeholder.remove();
    card.classList.remove('drag-float');
    card.removeAttribute('style');
    list.classList.remove('drag-active');
    document.body.classList.remove('drag-active');
    const rows = [...list.querySelectorAll('.group-allocation-row')];
    portfolioGroups = rows.map(r => getGroupMeta(r.dataset.groupId)).filter(Boolean);
    savePortfolioGroups();
    sortPortfolioByGroup();
    persistPortfolio();
    rebuildTabBar();
    const { totalValue, totalTarget } = computePortfolio();
    updateSummary(totalValue, totalTarget);
    renderAndCalculate();
    flushCloudSave();
}

function onGroupDragStart(e) {
    if (groupDrag || drag) return;
    const handle = e.target.closest('.group-drag-handle');
    if (!handle) return;
    const row = handle.closest('.group-allocation-row');
    const list = document.getElementById('group-allocation-list');
    if (!row || !list) return;
    const point = getPoint(e);
    if (e.type === 'mousedown') e.preventDefault();
    groupDrag = {
        card: row,
        list,
        startX: point.clientX,
        startY: point.clientY,
        offsetY: point.clientY - row.getBoundingClientRect().top,
        timer: setTimeout(() => {
            if (groupDrag && !groupDrag.active) {
                activateGroupDrag({ clientX: groupDrag.startX, clientY: groupDrag.startY });
            }
        }, DRAG_PRESS_MS),
        active: false
    };
}

function onGroupDragMove(e) {
    if (!groupDrag) return;
    const point = getPoint(e);
    if (!groupDrag.active) {
        const dy = Math.abs(point.clientY - groupDrag.startY);
        const dx = Math.abs(point.clientX - groupDrag.startX);
        if (dy >= DRAG_MOVE_PX && dy > dx) {
            clearTimeout(groupDrag.timer);
            activateGroupDrag(point);
        }
        return;
    }
    e.preventDefault();
    groupDrag.card.style.top = (point.clientY - groupDrag.offsetY) + 'px';
    moveGroupPlaceholder(point.clientY);
}

function onGroupDragEnd() {
    if (!groupDrag) return;
    clearTimeout(groupDrag.timer);
    if (groupDrag.active) finishGroupDrag();
    groupDrag = null;
}

(function initGroupDragSort() {
    document.addEventListener('touchstart', onGroupDragStart, { passive: false });
    document.addEventListener('mousedown', onGroupDragStart);
    document.addEventListener('touchmove', onGroupDragMove, { passive: false });
    document.addEventListener('mousemove', onGroupDragMove);
    document.addEventListener('touchend', onGroupDragEnd);
    document.addEventListener('touchcancel', onGroupDragEnd);
    document.addEventListener('mouseup', onGroupDragEnd);
})();

/* PWA */
let deferredPrompt;
const btnInstall = document.getElementById('btn-install');

window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    btnInstall.classList.add('visible');
});

btnInstall.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    btnInstall.classList.remove('visible');
});

/* ── จัดการหลายพอร์ต ── */
function escapePfHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function newPortfolioId() {
    let id;
    do {
        id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    } while (portfolioIndex.list.some(p => p.id === id) || portfolioIndex.deleted.includes(id));
    return id;
}

function readPortfolioAssets(id) {
    try {
        const list = JSON.parse(localStorage.getItem(pfStorageKey(id, 'myPortfolio')) || 'null');
        return Array.isArray(list) ? list : null;
    } catch {
        return null;
    }
}

function renderPortfolioSwitcher() {
    const label = document.getElementById('portfolio-current-name');
    if (label) label.textContent = getActivePortfolioName();
    const setName = document.getElementById('set-portfolio-name');
    if (setName) setName.textContent = getActivePortfolioName();
    document.title = `${getActivePortfolioName()} · ReBalance Stock`;
}

function renderPortfolioList() {
    const wrap = document.getElementById('portfolio-list');
    if (!wrap) return;
    wrap.innerHTML = portfolioIndex.list.map(p => {
        const active = p.id === activePortfolioId;
        const assets = active ? myPortfolio : readPortfolioAssets(p.id);
        const count = assets ? assets.filter(a => a.kind !== 'cash').length : null;
        const meta = count === null ? 'ยังไม่ได้เปิดในเครื่องนี้' : `${count} สินทรัพย์`;
        return `
        <div class="pf-row${active ? ' active' : ''}">
            <button type="button" class="pf-pick" onclick="switchPortfolio('${p.id}')">
                <span class="pf-check">${active ? '✓' : ''}</span>
                <span class="pf-info">
                    <span class="pf-name">${escapePfHtml(p.name)}</span>
                    <span class="pf-meta">${meta}${p.id === PF_MAIN_ID ? ' · พอร์ตหลัก' : ''}</span>
                </span>
            </button>
            <button type="button" class="pf-icon-btn" title="เปลี่ยนชื่อ" aria-label="เปลี่ยนชื่อ ${escapePfHtml(p.name)}" onclick="renamePortfolio('${p.id}')">✎</button>
            ${p.id === PF_MAIN_ID ? '<span class="pf-icon-spacer"></span>' : `<button type="button" class="pf-icon-btn danger" title="ลบพอร์ต" aria-label="ลบ ${escapePfHtml(p.name)}" onclick="deletePortfolio('${p.id}')">🗑</button>`}
        </div>`;
    }).join('');
}

function openPortfolioSheet() {
    renderPortfolioList();
    document.getElementById('new-portfolio-name').value = '';
    document.getElementById('portfolio-overlay').classList.add('open');
}

function closePortfolioSheet(e) {
    if (e && e.target !== document.getElementById('portfolio-overlay')) return;
    document.getElementById('portfolio-overlay').classList.remove('open');
}

async function waitCloudIdle(timeoutMs = 4000) {
    const start = Date.now();
    while (cloudSaving && Date.now() - start < timeoutMs) {
        await new Promise(r => setTimeout(r, 120));
    }
}

/* บันทึกพอร์ตปัจจุบันให้ครบก่อนออกจากหน้า */
async function flushActivePortfolio() {
    clearTimeout(persistDebounce);
    persistPortfolio();
    await waitCloudIdle();
    await flushCloudSave();
}

async function switchPortfolio(id) {
    if (id === activePortfolioId) {
        closePortfolioSheet();
        return;
    }
    if (!portfolioIndex.list.some(p => p.id === id)) return;
    await flushActivePortfolio();
    localStorage.setItem(PF_ACTIVE_KEY, id);
    location.reload();
}

async function createPortfolio() {
    const input = document.getElementById('new-portfolio-name');
    const name = input.value.trim();
    if (!name) {
        input.focus();
        return;
    }
    const copyGroups = document.getElementById('new-portfolio-copy-groups').checked;
    const id = newPortfolioId();

    // เริ่มต้นพอร์ตใหม่: เหลือแค่เงินสด USD ไม่ดึงหุ้นตั้งต้นของพอร์ตหลักมา
    const groups = copyGroups
        ? portfolioGroups.map(g => ({ ...g }))
        : DEFAULT_PORTFOLIO_GROUPS.map(normalizePortfolioGroup);
    const cashGroup = groups.find(g => g.kind === 'cash')?.id || 'cash';
    const set = (k, v) => localStorage.setItem(pfStorageKey(id, k), v);
    set('portfolioGroups', JSON.stringify(groups));
    set('myPortfolio', JSON.stringify([
        { name: 'USD', kind: 'cash', group: cashGroup, shares: 0, avgCost: 1, target: 0, peakValue: 0, tiersDone: [false, false, false] }
    ]));
    set('deletedAssets', JSON.stringify(defaultAssets.filter(a => a.kind !== 'cash').map(a => a.name.toUpperCase())));
    set('strategyTargets', '2');
    set('profitTiers', JSON.stringify(profitTiers));
    set('dipBuyPct', String(dipBuyPct));
    set('activeTab', groups.find(g => g.kind !== 'cash')?.id || groups[0].id);
    set('localUpdatedAt', String(Date.now()));

    portfolioIndex.list.push({ id, name });
    portfolioIndex.updatedAt = Date.now();
    savePortfolioIndexLocal();
    await savePortfolioIndexToCloud();
    await switchPortfolio(id);
}

async function renamePortfolio(id) {
    const p = portfolioIndex.list.find(x => x.id === id);
    if (!p) return;
    const name = prompt('ชื่อพอร์ต', p.name);
    if (name === null) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed === p.name) return;
    p.name = trimmed;
    portfolioIndex.updatedAt = Date.now();
    savePortfolioIndexLocal();
    renderPortfolioList();
    renderPortfolioSwitcher();
    await savePortfolioIndexToCloud();
}

async function deletePortfolio(id) {
    if (id === PF_MAIN_ID) return;
    const p = portfolioIndex.list.find(x => x.id === id);
    if (!p) return;
    if (!confirm(`ลบพอร์ต "${p.name}" และข้อมูลทั้งหมดในพอร์ตนี้?\nลบแล้วกู้คืนไม่ได้`)) return;

    portfolioIndex.list = portfolioIndex.list.filter(x => x.id !== id);
    if (!portfolioIndex.deleted.includes(id)) portfolioIndex.deleted.push(id);
    portfolioIndex.updatedAt = Date.now();
    savePortfolioIndexLocal();
    removePortfolioLocalData(id);
    await savePortfolioIndexToCloud();
    if (sb) {
        const { error } = await sb.from('portfolios').delete().eq('sync_key', pfSyncKey(id));
        if (error) console.warn('cloud delete portfolio', error);
    }

    if (id === activePortfolioId) {
        localStorage.setItem(PF_ACTIVE_KEY, PF_MAIN_ID);
        location.reload();
        return;
    }
    renderPortfolioList();
}

function removePortfolioLocalData(id) {
    const prefix = pfStorageKey(id, '');
    for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith(prefix)) localStorage.removeItem(k);
    }
}

async function savePortfolioIndexToCloud() {
    if (!sb || !PF_INDEX_SYNC_KEY) return;
    const { error } = await sb.from('portfolios').upsert({
        sync_key: PF_INDEX_SYNC_KEY,
        data: { version: 1, ...portfolioIndex },
        updated_at: new Date().toISOString()
    }, { onConflict: 'sync_key' });
    if (error) console.warn('cloud save portfolio list', error);
}

/* โหลดรายชื่อพอร์ตจากคลาวด์ — ชุดที่แก้ล่าสุดชนะ ส่วนพอร์ตที่ถูกลบจะถูกลบทุกเครื่อง */
async function syncPortfolioIndex() {
    if (!sb || !PF_INDEX_SYNC_KEY) return;
    const { data, error } = await sb
        .from('portfolios')
        .select('data')
        .eq('sync_key', PF_INDEX_SYNC_KEY)
        .maybeSingle();
    if (error) {
        console.warn('cloud load portfolio list', error);
        return;
    }
    const cloud = data?.data ? normalizePortfolioIndex(data.data) : null;
    if (!cloud) {
        if (portfolioIndex.list.length > 1 || portfolioIndex.deleted.length) await savePortfolioIndexToCloud();
        return;
    }
    const deleted = [...new Set([...cloud.deleted, ...portfolioIndex.deleted])];
    const newer = cloud.updatedAt > portfolioIndex.updatedAt ? cloud : portfolioIndex;
    const older = newer === cloud ? portfolioIndex : cloud;
    const list = newer.list.map(p => ({ ...p }));
    // พอร์ตที่มีแค่อีกฝั่ง (สร้างคนละเครื่องพร้อมกัน) ยังเก็บไว้
    for (const p of older.list) {
        if (!list.some(x => x.id === p.id)) list.push({ ...p });
    }
    const merged = normalizePortfolioIndex({
        list,
        deleted,
        updatedAt: Math.max(cloud.updatedAt, portfolioIndex.updatedAt)
    });
    const changedLocal = JSON.stringify(merged) !== JSON.stringify(portfolioIndex);
    const changedCloud = JSON.stringify(merged) !== JSON.stringify(cloud);
    portfolioIndex = merged;
    savePortfolioIndexLocal();
    merged.deleted.forEach(id => {
        if (id !== activePortfolioId) removePortfolioLocalData(id);
    });
    if (changedCloud) await savePortfolioIndexToCloud();
    if (changedLocal) {
        if (!portfolioIndex.list.some(p => p.id === activePortfolioId)) {
            localStorage.setItem(PF_ACTIVE_KEY, PF_MAIN_ID);
            location.reload();
            return;
        }
        renderPortfolioSwitcher();
        renderPortfolioList();
    }
}

document.getElementById('new-portfolio-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') createPortfolio();
});

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncPortfolioIndex();
});

async function bootstrap() {
    updateCurrencyButton();
    renderPortfolioSwitcher();
    renderAndCalculate();
    fetchPrices(true);
    await initCloudSync();
    await syncPortfolioIndex();
    applyPortfolioRepair();
    if (pendingPortfolioRepairSync) {
        persistPortfolio();
        await flushCloudSave();
        pendingPortfolioRepairSync = false;
    }
    renderAndCalculate();
    fetchUsdThbRate();
    fetchPrices(true);
}

bootstrap();


/* ── ย้ายสินทรัพย์ไปพอร์ตอื่น ──
 * อ่านข้อมูลพอร์ตปลายทาง (ในเครื่อง หรือจากคลาวด์ถ้าใหม่กว่า) → เพิ่ม/รวมหุ้น → บันทึกทั้งในเครื่องและคลาวด์ → ลบออกจากพอร์ตนี้ */
let moveSheetIndex = null;

function openMoveSheet(index) {
    const asset = myPortfolio[index];
    if (!asset) return;
    moveSheetIndex = index;
    document.getElementById('move-title').textContent = `ย้าย ${asset.name} ไปพอร์ต`;
    const others = portfolioIndex.list.filter(p => p.id !== activePortfolioId);
    document.getElementById('move-list').innerHTML = others.map(p => {
        const assets = readPortfolioAssets(p.id);
        const has = assets?.some(x => String(x.name).toUpperCase() === asset.name.toUpperCase());
        const meta = assets ? `${assets.filter(x => x.kind !== 'cash').length} สินทรัพย์${has ? ` · มี ${escapePfHtml(asset.name)} อยู่แล้ว (รวมจำนวนหุ้น)` : ''}` : 'ยังไม่ได้เปิดในเครื่องนี้';
        return `<button type="button" class="pf-pick move-pick" onclick="moveAssetTo('${p.id}')">
            <span class="pf-check">⇄</span>
            <span class="pf-info"><span class="pf-name">${escapePfHtml(p.name)}</span><span class="pf-meta">${meta}</span></span>
        </button>`;
    }).join('');
    document.getElementById('move-overlay').classList.add('open');
}

function closeMoveSheet(e) {
    if (e && e.target !== document.getElementById('move-overlay')) return;
    document.getElementById('move-overlay').classList.remove('open');
    moveSheetIndex = null;
}

function readPortfolioState(id) {
    const get = k => localStorage.getItem(pfStorageKey(id, k));
    const json = (k, d) => { try { const v = JSON.parse(get(k) || 'null'); return v ?? d; } catch { return d; } };
    const portfolio = json('myPortfolio', null);
    if (!Array.isArray(portfolio)) return null;
    return {
        version: 1,
        portfolio,
        profitTiers: json('profitTiers', profitTiers),
        dipBuyPct: Number(get('dipBuyPct')) || dipBuyPct,
        activeTab: get('activeTab') || '',
        strategyTargets: get('strategyTargets') || '2',
        portfolioGroups: json('portfolioGroups', DEFAULT_PORTFOLIO_GROUPS),
        deletedAssets: json('deletedAssets', []),
        updatedAt: Number(get('localUpdatedAt')) || 0
    };
}

function writePortfolioState(id, s) {
    const set = (k, v) => localStorage.setItem(pfStorageKey(id, k), v);
    set('myPortfolio', JSON.stringify(s.portfolio));
    set('portfolioGroups', JSON.stringify(s.portfolioGroups));
    set('deletedAssets', JSON.stringify(s.deletedAssets));
    set('profitTiers', JSON.stringify(s.profitTiers));
    set('dipBuyPct', String(s.dipBuyPct));
    if (s.activeTab) set('activeTab', s.activeTab);
    set('strategyTargets', s.strategyTargets || '2');
    set('localUpdatedAt', String(s.updatedAt));
}

async function moveAssetTo(targetId) {
    const index = moveSheetIndex;
    const asset = myPortfolio[index];
    const target = portfolioIndex.list.find(p => p.id === targetId);
    if (!asset || !target) return;
    const sym = asset.name.toUpperCase();
    const list = document.getElementById('move-list');
    list.classList.add('busy');

    // 1) ข้อมูลพอร์ตปลายทางล่าสุด
    let state = readPortfolioState(targetId);
    const targetSyncKey = pfSyncKey(targetId);
    if (sb && targetSyncKey) {
        const { data, error } = await sb.from('portfolios').select('data, updated_at').eq('sync_key', targetSyncKey).maybeSingle();
        if (error) {
            list.classList.remove('busy');
            showToast('เชื่อมคลาวด์ไม่ได้ ย้ายไม่สำเร็จ ลองใหม่อีกครั้ง', 'error');
            return;
        }
        const cloud = data?.data;
        const cloudAt = Math.max(Number(cloud?.updatedAt) || 0, data ? new Date(data.updated_at).getTime() : 0);
        if (Array.isArray(cloud?.portfolio) && (!state || cloudAt > state.updatedAt)) state = { ...state, ...cloud, version: 1 };
    }
    if (!state) {
        const groups = DEFAULT_PORTFOLIO_GROUPS.map(normalizePortfolioGroup);
        state = {
            version: 1,
            portfolio: [{ name: 'USD', kind: 'cash', group: groups.find(g => g.kind === 'cash')?.id || 'cash', shares: 0, avgCost: 1, target: 0, peakValue: 0, tiersDone: [false, false, false] }],
            profitTiers, dipBuyPct, activeTab: groups[0].id, strategyTargets: '2', portfolioGroups: groups,
            deletedAssets: defaultAssets.filter(a => a.kind !== 'cash').map(a => a.name.toUpperCase()), updatedAt: 0
        };
    }

    // 2) กลุ่มปลายทาง: ใช้กลุ่มเดิมถ้ามี ไม่งั้นหากลุ่มประเภทเดียวกัน
    const groups = (state.portfolioGroups || []).map(normalizePortfolioGroup);
    const kind = asset.kind || inferKind(asset.name, asset.group);
    const srcGroup = resolveAssetGroup(asset);
    const group = groups.some(g => g.id === srcGroup) ? srcGroup
        : (groups.find(g => g.kind === (kind === 'cash' ? 'cash' : kind)) || groups.find(g => g.kind !== 'cash') || groups[0])?.id || srcGroup;
    const cash = isCashAsset(asset);

    // 3) เพิ่ม หรือรวมกับตัวเดิม (ถัวต้นทุนตามจำนวนหุ้น)
    const portfolio = state.portfolio.map(x => ({ ...x }));
    const existing = portfolio.find(x => String(x.name).toUpperCase() === sym);
    if (existing) {
        const s1 = Number(existing.shares) || 0, s2 = Number(asset.shares) || 0;
        const total = s1 + s2;
        existing.avgCost = cash ? 1 : (total > 0 ? ((Number(existing.avgCost) || 0) * s1 + (Number(asset.avgCost) || 0) * s2) / total : (existing.avgCost || asset.avgCost || 0));
        existing.shares = total;
    } else {
        portfolio.push({
            name: asset.name, kind, group,
            shares: asset.shares || 0, avgCost: cash ? 1 : (asset.avgCost || 0),
            target: 0, peakValue: asset.peakValue || 0, tiersDone: asset.tiersDone || [false, false, false]
        });
    }
    state = {
        ...state,
        portfolio,
        portfolioGroups: groups,
        deletedAssets: (state.deletedAssets || []).map(n => String(n).toUpperCase()).filter(n => n !== sym),
        updatedAt: Date.now()
    };

    // 4) บันทึกปลายทาง: คลาวด์ก่อน (ถ้ามี) แล้วค่อยในเครื่อง
    if (sb && targetSyncKey) {
        const { error } = await sb.from('portfolios').upsert({ sync_key: targetSyncKey, data: state, updated_at: new Date().toISOString() }, { onConflict: 'sync_key' });
        if (error) {
            list.classList.remove('busy');
            showToast('บันทึกพอร์ตปลายทางไม่สำเร็จ ยังไม่ได้ย้าย', 'error');
            return;
        }
    }
    writePortfolioState(targetId, state);

    // 5) เอาออกจากพอร์ตนี้
    list.classList.remove('busy');
    closeMoveSheet();
    if (assetSheetIndex === index) closeAssetSheet();
    if (!cash) markAssetDeleted(asset.name);
    myPortfolio.splice(index, 1);
    persistPortfolio();
    flushCloudSave();
    renderAndCalculate();
    showToast(existing ? `รวม ${asset.name} เข้ากับ ${target.name} แล้ว` : `ย้าย ${asset.name} ไป ${target.name} แล้ว · ตั้งสัดส่วนเป้าในพอร์ตนั้นอีกครั้ง`);
}


/* ── ซื้อ / ขาย (เงินเข้า-ออกเงินสด USD) · เติม / ถอนเงินสด ── */
function cashAssetUsd(create) {
    let c = myPortfolio.find(x => isCashAsset(x) && String(x.name).toUpperCase() === 'USD');
    if (!c && create) {
        c = { name: 'USD', kind: 'cash', group: getCashGroupId(), shares: 0, avgCost: 1, target: 0, peakValue: 0, tiersDone: [false, false, false] };
        myPortfolio.push(c);
        deletedAssets = deletedAssets.filter(n => n !== 'USD');
        store.setItem('deletedAssets', JSON.stringify(deletedAssets));
    }
    return c || null;
}

function parseTradeNum(id) {
    const v = parseFloat(String(document.getElementById(id)?.value || '').replace(/,/g, ''));
    return Number.isFinite(v) && v > 0 ? v : null;
}

function renderTradeBox(index, asset) {
    const price = getPrice(asset.name);
    const cash = cashAssetUsd(false);
    return `
        <div class="trade-box">
            <div class="trade-head">มี <b>${fmtShares(asset.shares)}</b> หุ้น · 💵 เงินสด <b id="trade-cash-left">${fmtTrade(cash?.shares || 0)}</b></div>
            <div class="asset-sheet-grid trade-grid">
                <div class="asset-sheet-field">
                    <label>จำนวนหุ้น</label>
                    <input type="text" inputmode="decimal" id="trade-qty" placeholder="0" autocomplete="off" oninput="updateTradeTotal()">
                </div>
                <div class="asset-sheet-field">
                    <label>ราคา/หุ้น ($)</label>
                    <input type="text" inputmode="decimal" id="trade-price" value="${price > 0 ? formatInputVal(price) : ''}" placeholder="0.00" autocomplete="off" oninput="this.dataset.touched='1';updateTradeTotal()">
                </div>
            </div>
            <div class="trade-total" id="trade-total">รวม —</div>
            <label class="trade-opt"><input type="checkbox" id="trade-use-cash" checked><span>ตัด/เข้าเงินสด USD</span></label>
            <div class="trade-btns">
                <button type="button" class="tb-buy" onclick="tradeAsset(${index}, 'buy')">ซื้อ</button>
                <button type="button" class="tb-sell" onclick="tradeAsset(${index}, 'sell')"${asset.shares > 0 ? '' : ' disabled'}>ขาย</button>
            </div>
        </div>`;
}

function updateTradeTotal() {
    const q = parseTradeNum('trade-qty'), p = parseTradeNum('trade-price');
    const el = document.getElementById('trade-total');
    if (el) el.textContent = q && p ? `รวม ${fmtTrade(q * p)}` : 'รวม —';
}

function afterTrade(name, msg, kind) {
    syncAssetValues();
    persistPortfolio();
    flushCloudSave();
    renderAndCalculate();
    if (assetSheetIndex != null) {
        assetSheetIndex = myPortfolio.findIndex(a => a.name === name);
        refreshAssetSheet();
    }
    showToast(msg, kind);
}

function tradeAsset(index, side) {
    const asset = myPortfolio[index];
    if (!asset || isCashAsset(asset)) return;
    const q = parseTradeNum('trade-qty'), p = parseTradeNum('trade-price');
    if (!q || !p) { showToast('ใส่จำนวนหุ้นและราคาก่อน', 'error'); return; }
    const useCash = document.getElementById('trade-use-cash')?.checked;
    const amount = q * p;
    const shares = Number(asset.shares) || 0, avg = Number(asset.avgCost) || 0;
    if (side === 'buy') {
        const cash = useCash ? cashAssetUsd(true) : null;
        if (cash && (cash.shares || 0) + 1e-9 < amount) {
            showToast(`เงินสดไม่พอ (มี ${fmtTrade(cash.shares || 0)} · ต้องใช้ ${fmtTrade(amount)}) · เติมเงินก่อน หรือเอาติ๊กตัดเงินสดออก`, 'error');
            return;
        }
        asset.avgCost = (shares * avg + amount) / (shares + q);
        asset.shares = shares + q;
        if (cash) cash.shares = Math.round(((cash.shares || 0) - amount) * 100) / 100;
        afterTrade(asset.name, `ซื้อ ${asset.name} ${fmtShares(q)} หุ้น @ ${fmtTrade(p)}${cash ? ` · ตัดเงินสด ${fmtTrade(amount)}` : ''}`);
    } else {
        if (q > shares + 1e-9) { showToast(`มีแค่ ${fmtShares(shares)} หุ้น`, 'error'); return; }
        const realized = avg > 0 ? (p - avg) * q : null;
        const cash = useCash ? cashAssetUsd(true) : null;
        asset.shares = Math.max(0, Math.round((shares - q) * 1e6) / 1e6);
        if (asset.shares === 0) asset.peakValue = 0;
        if (cash) cash.shares = Math.round(((cash.shares || 0) + amount) * 100) / 100;
        const pl = realized == null ? '' : ` · ${realized >= 0 ? 'กำไร' : 'ขาดทุน'} ${fmtTrade(Math.abs(realized))}`;
        afterTrade(asset.name, `ขาย ${asset.name} ${fmtShares(q)} หุ้น @ ${fmtTrade(p)}${pl}${cash ? ` · เข้าเงินสด ${fmtTrade(amount)}` : ''}`);
    }
}

function cashMove(index, dir) {
    const cash = myPortfolio[index];
    if (!cash || !isCashAsset(cash)) return;
    const amt = parseTradeNum('cash-amt');
    if (!amt) { showToast('ใส่จำนวนเงินก่อน', 'error'); return; }
    if (dir < 0 && amt > (cash.shares || 0) + 1e-9) { showToast(`ถอนได้ไม่เกิน ${fmtTrade(cash.shares || 0)}`, 'error'); return; }
    cash.shares = Math.round(((cash.shares || 0) + dir * amt) * 100) / 100;
    afterTrade(cash.name, `${dir > 0 ? 'เติม' : 'ถอน'}เงินสด ${fmtTrade(amt)} · คงเหลือ ${fmtTrade(cash.shares)}`);
}


/* ── จัดกลุ่มอัตโนมัติ + พอร์ตใกล้เคียงสไตล์ไหน ──
 * กลุ่มคำนวณที่เซิร์ฟเวอร์ (src/lib/portfolio-plan.ts) · ตารางสไตล์ด้านล่างเป็นสำเนาของ PROFILE_MIX */

/* จำกลุ่มของแต่ละหุ้นไว้ในเครื่อง → เปิดแอปแล้วเห็นสีกลุ่มทันที ไม่ต้องรอโหลด */
function rememberPlan(symbol, plan) {
    if (!plan || !PLAN_BUCKETS[plan.bucket]) return;
    const old = planCache[symbol];
    if (old && old.bucket === plan.bucket && old.reason === plan.reason) return;
    planCache[symbol] = { bucket: plan.bucket, reason: plan.reason || '' };
    try { localStorage.setItem(PLAN_CACHE_KEY, JSON.stringify(planCache)); } catch { /* ignore */ }
}
function assetBucket(asset) {
    if (isCashAsset(asset)) return { bucket: 'cash', reason: '' };
    const p = priceCache[asset.name]?.plan || planCache[asset.name];
    return p && PLAN_BUCKETS[p.bucket] ? p : null;
}
function bucketColor(asset) {
    const b = assetBucket(asset);
    return b ? PLAN_BUCKETS[b.bucket].color : '';
}
function paintBucket(card, asset) {
    const c = bucketColor(asset);
    if (c) card.style.setProperty('--bk', c); else card.style.removeProperty('--bk');
}

/* แผนของพอร์ตนี้ (มั่นคง/สมดุล/เติบโต) — เลือกเอง · ยังไม่เลือก = ใช้แบบที่ใกล้เคียงที่สุด */
function setMyPlan(id) {
    if (!PLAN_PROFILES[id]) return;
    myPlan = id;
    planView = id;
    store.setItem('myPlan', id);
    store.setItem('localUpdatedAt', String(Date.now()));
    scheduleCloudSave();
    renderPlanCard();
    showToast(`ตั้งแผนพอร์ตเป็น ${PLAN_PROFILES[id].name} แล้ว`);
}
function viewPlan(id) {
    planView = id;
    renderPlanCard();
}

function planStats() {
    const items = myPortfolio.filter(a => !isCashAsset(a) || (a.shares || 0) > 0 || (a.target || 0) > 0);
    const totalValue = items.reduce((s, a) => s + (a.value || 0), 0);
    const byValue = totalValue > 0;
    const weight = a => byValue ? (a.value || 0) : (a.target || 0);
    const total = items.reduce((s, a) => s + weight(a), 0);
    const cur = {}, names = {}, members = {};
    let unknown = 0;
    for (const a of items) {
        const b = assetBucket(a);
        if (!b) { unknown++; continue; }
        if (total > 0) cur[b.bucket] = (cur[b.bucket] || 0) + weight(a) / total * 100;
        (names[b.bucket] = names[b.bucket] || []).push(a.name);
    }
    // สมาชิกทุกตัว (รวมที่ยังไม่มีมูลค่า) สำหรับปรับเป้า
    for (const a of myPortfolio) {
        const b = assetBucket(a);
        if (b) (members[b.bucket] = members[b.bucket] || []).push(a);
    }
    const ranked = Object.entries(PLAN_PROFILES).map(([id, p]) => {
        const diff = Object.keys(PLAN_BUCKETS).reduce((s, k) => s + Math.abs((cur[k] || 0) - (p.mix[k] || 0)), 0) / 2;
        return { id, p, match: Math.max(0, 100 - diff) };
    });
    return { items, byValue, total, cur, names, members, unknown, ranked };
}

/* ปรับ % เป้าของหุ้นแต่ละตัวให้ตรงแผน: แบ่ง % ของกลุ่มตามสัดส่วนเป้าเดิมในกลุ่ม (ไม่มีเป้า → ตามมูลค่า → เท่ากัน) */
function applyPlanTargets(id) {
    const p = PLAN_PROFILES[id];
    if (!p) return;
    const { members, unknown } = planStats();
    if (unknown) { showToast(`รอจัดกลุ่มอีก ${unknown} ตัวก่อน แล้วลองใหม่`, 'warn'); return; }
    const missing = Object.keys(p.mix).filter(k => p.mix[k] > 0 && !(members[k] || []).length);
    const dropped = Object.keys(members).filter(k => !(p.mix[k] > 0)).flatMap(k => members[k].map(a => a.name));
    const lines = [`ปรับเป้าหุ้นทุกตัวให้ตรงแผน "${p.name}"?`];
    if (missing.length) lines.push(`• ยังไม่มีหุ้นในกลุ่ม: ${missing.map(k => `${PLAN_BUCKETS[k].name} ${p.mix[k]}%`).join(', ')} (เป้ารวมจะไม่ครบ 100% จนกว่าจะเพิ่มหุ้น)`);
    if (dropped.length) lines.push(`• แผนนี้ไม่มีกลุ่มของ ${dropped.join(', ')} → เป้าเป็น 0%`);
    if (!confirm(lines.join('\n'))) return;
    for (const [k, list] of Object.entries(members)) {
        const pct = p.mix[k] || 0;
        const byTarget = list.reduce((s, a) => s + (a.target || 0), 0);
        const byVal = list.reduce((s, a) => s + (a.value || 0), 0);
        list.forEach(a => {
            const w = byTarget > 0 ? (a.target || 0) / byTarget : byVal > 0 ? (a.value || 0) / byVal : 1 / list.length;
            a.target = Math.round(pct * w * 100) / 100;
        });
    }
    if (myPlan !== id) { myPlan = id; store.setItem('myPlan', id); }
    persistPortfolio();
    flushCloudSave();
    renderAndCalculate();
    showToast(`ปรับเป้าตามแผน ${p.name} แล้ว`);
}

function renderPlanCard() {
    const el = document.getElementById('plan-card');
    if (!el) return;
    const { items, byValue, total, cur, names, unknown, ranked } = planStats();
    if (!items.length || total <= 0) { el.hidden = true; return; }
    const best = [...ranked].sort((x, y) => y.match - x.match)[0];
    const mine = ranked.find(r => r.id === myPlan) || null;
    const head = mine || best;                       // หัวการ์ด: แผนของฉัน (ถ้าตั้งไว้) ไม่งั้นแบบที่ใกล้สุด
    const view = ranked.find(r => r.id === planView) || head;
    const keys = Object.keys(PLAN_BUCKETS).filter(k => (cur[k] || 0) > 0.05 || (view.p.mix[k] || 0) > 0)
        .sort((x, y) => (cur[y] || 0) - (cur[x] || 0) || (view.p.mix[y] || 0) - (view.p.mix[x] || 0));
    const wasOpen = el.open;
    el.hidden = false;
    el.innerHTML = `
        <summary>
            <div class="pc-top">
                <span class="pc-title">สัดส่วนสินทรัพย์</span>
                <span class="pc-match">${mine ? 'แผน' : 'ใกล้เคียง'} <b>${head.p.name}</b> <span class="pc-score" title="${mine ? 'ตรงตามแผน' : 'ความใกล้เคียง'}">${head.match.toFixed(0)}%</span></span>
                <span class="pc-chev" aria-hidden="true"></span>
            </div>
            <div class="pc-bar">${keys.filter(k => cur[k] > 0).map(k => `<i style="flex:${cur[k]};background:${PLAN_BUCKETS[k].color}" title="${PLAN_BUCKETS[k].name} ${fmt(cur[k], 1)}%"></i>`).join('')}</div>
            <div class="pc-legend">${keys.filter(k => cur[k] > 0).map(k => `<span><i style="background:${PLAN_BUCKETS[k].color}"></i>${PLAN_BUCKETS[k].name} <b>${fmt(cur[k], 0)}%</b></span>`).join('')}</div>
        </summary>
        <div class="pc-body">
            <div class="pc-profiles" role="tablist" aria-label="ดูแผน">
                ${ranked.map(r => `<button type="button" role="tab" aria-selected="${r === view}" class="${r === view ? 'on' : ''}" onclick="viewPlan('${r.id}')">
                    ${r.p.name}${r.id === myPlan ? ' <i class="pc-mine" title="แผนของคุณ"></i>' : ''}<b>${r.match.toFixed(0)}%</b></button>`).join('')}
            </div>
            <div class="pc-head"><span>กลุ่ม</span><span>${byValue ? 'ตอนนี้' : 'เป้า'}</span><span>${view.p.name}</span><span>ส่วนต่าง</span></div>
            ${keys.map(k => {
                const c = cur[k] || 0, t = view.p.mix[k] || 0, gap = c - t;
                const tone = Math.abs(gap) < 5 ? 'ok' : gap > 0 ? 'over' : 'under';
                return `<div class="pc-row">
                    <div class="pc-name"><i style="background:${PLAN_BUCKETS[k].color}"></i><span>${PLAN_BUCKETS[k].name}<small>${(names[k] || []).join(', ') || 'ยังไม่มีหุ้นในกลุ่มนี้'}</small></span></div>
                    <span class="pc-num">${fmt(c, 1)}%</span>
                    <span class="pc-num muted">${t}%</span>
                    <span class="pc-gap ${tone}">${tone === 'ok' ? '—' : `${gap > 0 ? '+' : '−'}${fmt(Math.abs(gap), 1)}`}</span>
                    <div class="pc-track"><i style="width:${Math.min(100, c)}%;background:${PLAN_BUCKETS[k].color}"></i><b style="left:${t}%" title="${view.p.name} ${t}%"></b></div>
                </div>`;
            }).join('')}
            <div class="pc-actions">
                ${view.id === myPlan
                    ? `<span class="pc-current">แผนของพอร์ตนี้</span>`
                    : `<button type="button" class="pc-btn primary" onclick="setMyPlan('${view.id}')">ใช้แผน${view.p.name}</button>`}
                <button type="button" class="pc-btn" onclick="applyPlanTargets('${view.id}')">ปรับเป้าหุ้นตามแผนนี้</button>
            </div>
            <button type="button" class="pc-edit" onclick="openProfileSheet('${view.id}')">แก้สัดส่วนของแต่ละแผน</button>
            <p class="pc-note">${unknown ? `กำลังจัดกลุ่มอีก ${unknown} รายการ · ` : ''}คิดจาก${byValue ? 'มูลค่าปัจจุบัน' : 'สัดส่วนเป้าหมาย'} · ขีดตั้ง = สัดส่วนของแผน${view.p.name} · สัดส่วนแผนเป็นตัวอย่างทั่วไป ไม่ใช่คำแนะนำการลงทุน</p>
        </div>`;
    el.open = wasOpen;
}

/* ── แผ่นแก้สัดส่วนสไตล์ ── */
let profileSheetId = 'growth';
function openProfileSheet(id) {
    profileSheetId = PLAN_PROFILES[id] ? id : 'growth';
    renderProfileSheet();
    document.getElementById('profile-overlay').classList.add('open');
}
function closeProfileSheet(e) {
    if (e && e.target !== document.getElementById('profile-overlay')) return;
    document.getElementById('profile-overlay').classList.remove('open');
}
function profileSum(id) {
    return Object.values(PLAN_PROFILES[id].mix).reduce((s, v) => s + (Number(v) || 0), 0);
}
function stepProfile(bucket, d) {
    const mix = PLAN_PROFILES[profileSheetId].mix;
    mix[bucket] = Math.max(0, Math.min(100, (Number(mix[bucket]) || 0) + d));
    if (!mix[bucket]) delete mix[bucket];
    savePlanProfiles();
    scheduleCloudSave();
    renderProfileSheet();
    renderPlanCard();
}
function setProfileValue(bucket, val) {
    const n = Math.max(0, Math.min(100, Math.round(Number(val) || 0)));
    const mix = PLAN_PROFILES[profileSheetId].mix;
    if (n) mix[bucket] = n; else delete mix[bucket];
    savePlanProfiles();
    scheduleCloudSave();
    renderProfileSum();
    renderPlanCard();
}
function resetProfile() {
    PLAN_PROFILES[profileSheetId].mix = { ...PLAN_PROFILE_DEFAULTS[profileSheetId].mix };
    savePlanProfiles();
    scheduleCloudSave();
    renderProfileSheet();
    renderPlanCard();
}
function renderProfileSum() {
    const sum = profileSum(profileSheetId);
    const el = document.getElementById('ps-sum');
    if (!el) return;
    el.className = 'ps-sum ' + (sum === 100 ? 'ok' : 'warn');
    el.innerHTML = sum === 100 ? 'รวม 100%' : `รวม ${sum}% · ${sum > 100 ? 'เกิน' : 'ขาด'} ${Math.abs(100 - sum)}%`;
    const mix = PLAN_PROFILES[profileSheetId].mix;
    const bar = document.getElementById('ps-bar');
    if (bar) bar.innerHTML = Object.keys(PLAN_BUCKETS).filter(k => mix[k] > 0).map(k => `<i style="flex:${mix[k]};background:${PLAN_BUCKETS[k].color}"></i>`).join('');
}
function renderProfileSheet() {
    const mix = PLAN_PROFILES[profileSheetId].mix;
    document.getElementById('ps-tabs').innerHTML = Object.entries(PLAN_PROFILES).map(([id, p]) =>
        `<button type="button" class="${id === profileSheetId ? 'on' : ''}" onclick="profileSheetId='${id}';renderProfileSheet()">${p.name}</button>`).join('');
    document.getElementById('ps-rows').innerHTML = Object.keys(PLAN_BUCKETS).map(k => `
        <div class="ps-row${mix[k] ? '' : ' zero'}">
            <span class="ps-name"><i style="background:${PLAN_BUCKETS[k].color}"></i>${PLAN_BUCKETS[k].name}</span>
            <span class="ps-step">
                <button type="button" aria-label="ลด ${PLAN_BUCKETS[k].name}" onclick="stepProfile('${k}', -5)">−</button>
                <input type="text" inputmode="numeric" value="${mix[k] || 0}" aria-label="${PLAN_BUCKETS[k].name} (%)" onchange="setProfileValue('${k}', this.value)">
                <button type="button" aria-label="เพิ่ม ${PLAN_BUCKETS[k].name}" onclick="stepProfile('${k}', 5)">＋</button>
            </span>
        </div>`).join('');
    renderProfileSum();
}
