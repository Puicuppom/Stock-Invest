const SUPABASE_URL = window.REBALANCE_CONFIG?.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = window.REBALANCE_CONFIG?.SUPABASE_ANON_KEY || '';
const SYNC_KEY = window.REBALANCE_CONFIG?.SYNC_KEY || '';

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
    const saved = JSON.parse(localStorage.getItem('portfolioGroups') || 'null');
    if (Array.isArray(saved) && saved.length) {
        return saved.map(normalizePortfolioGroup);
    }
    const legacy = JSON.parse(localStorage.getItem('groupConfig') || 'null');
    return DEFAULT_PORTFOLIO_GROUPS.map(g => normalizePortfolioGroup({
        ...g,
        name: legacy?.labels?.[g.id] || g.name,
        hint: legacy?.hints?.[g.id] || g.hint
    }));
}

let portfolioGroups = loadPortfolioGroups();

function savePortfolioGroups() {
    localStorage.setItem('portfolioGroups', JSON.stringify(portfolioGroups));
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

function getGroupHint(id) {
    return getGroupMeta(id)?.hint || '';
}

function isCashGroup(id) {
    return getGroupMeta(id)?.kind === 'cash';
}

function groupUsesProfitTaking(groupId) {
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
        localStorage.setItem('deletedAssets', JSON.stringify(deletedAssets));
    }
}

function unmarkAssetDeleted(name) {
    const sym = String(name).toUpperCase();
    deletedAssets = deletedAssets.filter(n => n !== sym);
    localStorage.setItem('deletedAssets', JSON.stringify(deletedAssets));
}

function applyStrategyMigration(list) {
    if (localStorage.getItem('strategyTargets') === '2') return list;
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
    localStorage.setItem('strategyTargets', '2');
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
let priceFetching = false;

let deletedAssets = JSON.parse(localStorage.getItem('deletedAssets') || '[]');
let pendingPortfolioRepairSync = false;

let myPortfolio = JSON.parse(localStorage.getItem('myPortfolio')) || defaultAssets;
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
        await fxPromise;
        return;
    }
    const symbols = myPortfolio.filter(a => !isCashAsset(a)).map(a => a.name).filter(Boolean);
    if (!symbols.length) {
        await fxPromise;
        return;
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
                };
            } else {
                priceCache[symbol] = {
                    price: priceCache[symbol]?.price || 0,
                    fairValue: priceCache[symbol]?.fairValue || null,
                    error: true,
                };
            }
        } catch {
            priceCache[symbol] = {
                price: priceCache[symbol]?.price || 0,
                fairValue: priceCache[symbol]?.fairValue || null,
                error: true,
            };
        }
    }));

    syncAssetValues();
    priceFetching = false;
    await fxPromise;

    if (fullRender || !document.querySelector('.asset-card')) {
        renderAndCalculate();
    } else {
        recalculate();
    }
}

document.getElementById('btn-refresh').addEventListener('click', () => fetchPrices());

/* ── Supabase cloud sync (no login) ── */
const sb = SUPABASE_URL && SUPABASE_ANON_KEY && SYNC_KEY
    ? window.supabase?.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;
let cloudSaving = false;
let cloudSaveTimer = null;
let realtimeChannel = null;

function setSyncStatus(state) {
    const btn = document.getElementById('btn-sync');
    if (!btn) return;
    btn.classList.remove('synced', 'syncing', 'error', 'local');
    if (state) btn.classList.add(state);
    const titles = {
        local: 'บันทึกในเครื่อง — ยังไม่ได้ตั้งค่าซิงค์',
        synced: 'ซิงค์แล้ว — ทุกอุปกรณ์',
        syncing: 'กำลังซิงค์…',
        error: 'ซิงค์ไม่สำเร็จ',
        '': 'ซิงค์อัตโนมัติ'
    };
    btn.title = titles[state] || titles[''];
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
        localStorage.setItem('portfolioGroups', JSON.stringify(portfolioGroups));
    } else if (cloud.groupConfig) {
        portfolioGroups.forEach(g => {
            if (cloud.groupConfig.labels?.[g.id]) g.name = cloud.groupConfig.labels[g.id];
            if (cloud.groupConfig.hints?.[g.id]) g.hint = cloud.groupConfig.hints[g.id];
        });
        localStorage.setItem('portfolioGroups', JSON.stringify(portfolioGroups));
    }
    if (Array.isArray(cloud.deletedAssets)) {
        deletedAssets = cloud.deletedAssets.map(n => String(n).toUpperCase());
        localStorage.setItem('deletedAssets', JSON.stringify(deletedAssets));
    }
    if (Array.isArray(cloud.portfolio)) {
        if (isPortfolioBroken(cloud.portfolio)) pendingPortfolioRepairSync = true;
        myPortfolio = normalizePortfolioList(cloud.portfolio, true);
        sortPortfolioByGroup();
        localStorage.setItem('myPortfolio', JSON.stringify(myPortfolio));
    }
    if (Array.isArray(cloud.profitTiers) && cloud.profitTiers.length === 3) {
        profitTiers = cloud.profitTiers;
        localStorage.setItem('profitTiers', JSON.stringify(profitTiers));
        renderTierSettings();
    }
    if (typeof cloud.dipBuyPct === 'number') {
        dipBuyPct = cloud.dipBuyPct;
        localStorage.setItem('dipBuyPct', String(dipBuyPct));
    }
    if (portfolioGroups.some(g => g.id === cloud.activeTab)) {
        activeTab = cloud.activeTab;
        localStorage.setItem('activeTab', activeTab);
        updateTabUI();
    }
    if (cloud.strategyTargets) {
        localStorage.setItem('strategyTargets', cloud.strategyTargets);
    }
    localStorage.setItem('localUpdatedAt', String(cloud.updatedAt || Date.now()));
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
        strategyTargets: localStorage.getItem('strategyTargets') || '2',
        portfolioGroups,
        deletedAssets,
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
        sync_key: SYNC_KEY,
        data: payload,
        updated_at: new Date().toISOString()
    }, { onConflict: 'sync_key' });
    clearTimeout(syncDelay);
    cloudSaving = false;
    if (error) {
        console.warn('cloud save', error);
        setSyncStatus('error');
    } else {
        localStorage.setItem('localUpdatedAt', String(payload.updatedAt));
        setSyncStatus('synced');
    }
}

async function loadFromCloud() {
    setSyncStatus('syncing');
    const { data, error } = await sb
        .from('portfolios')
        .select('data, updated_at')
        .eq('sync_key', SYNC_KEY)
        .maybeSingle();

    if (error) {
        console.warn('cloud load', error);
        setSyncStatus('error');
        return;
    }

    const localUpdated = parseInt(localStorage.getItem('localUpdatedAt') || '0', 10);
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
        .channel('portfolio-sync')
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'portfolios',
            filter: 'sync_key=eq.' + SYNC_KEY
        }, payload => {
            if (!payload.new?.data) return;
            const cloud = payload.new.data;
            const incomingAt = cloud.updatedAt || 0;
            const localUpdated = parseInt(localStorage.getItem('localUpdatedAt') || '0', 10);
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

async function fetchUsdThbRate() {
    try {
        const res = await fetch('/api/stock?symbol=THB%3DX');
        const data = await res.json();
        if (res.ok && data.price > 0) {
            usdThbRate = data.price;
            const { totalValue, totalTarget } = computePortfolio();
            updateSummary(totalValue, totalTarget);
        }
    } catch { /* keep last rate */ }
}

function loadActiveTab() {
    const saved = localStorage.getItem('activeTab');
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
    localStorage.setItem('activeTab', activeTab);
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
    const squadPct = getTargetByGroup(activeTab);
    document.getElementById('squad-note').textContent =
        `เป้าทัพนี้ ${fmtPct(squadPct)} · รวมทั้งพอร์ตต้องครบ 100.00%`;
    updateGroupTargetSum();
    const addInput = document.getElementById('new-asset-name');
    if (addInput) {
        addInput.placeholder = isCashGroup(activeTab) ? 'ชื่อ เช่น USD, CASH' : 'ชื่อย่อ เช่น QQQI, MSFT';
    }
    const fab = document.querySelector('.fab');
    if (fab) {
        fab.innerHTML = isCashGroup(activeTab)
            ? '<span>＋</span> เพิ่มเงินสด'
            : '<span>＋</span> เพิ่มสินทรัพย์';
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
        localStorage.setItem('activeTab', activeTab);
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
let profitTiers = JSON.parse(localStorage.getItem('profitTiers')) || defaultTiers;
if (!profitTiers[2] || profitTiers[2].type !== 'trailing') {
    profitTiers = defaultTiers;
    localStorage.setItem('profitTiers', JSON.stringify(profitTiers));
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
    localStorage.setItem('myPortfolio', JSON.stringify(data));
    localStorage.setItem('localUpdatedAt', String(Date.now()));
    scheduleCloudSave();
}

function getTargetByKind(kind) {
    return myPortfolio.filter(a => a.kind === kind).reduce((s, a) => s + (a.target || 0), 0);
}

function getTargetByGroup(group) {
    const assets = myPortfolio.filter(a => getAssetGroup(a) === group);
    if (assets.length) return assets.reduce((s, a) => s + (a.target || 0), 0);
    return getGroupMeta(group)?.targetPct || 0;
}

function getAssetGroup(asset) {
    return asset.group || inferGroup(asset.name, asset.kind);
}

function isVisibleAsset(asset) {
    return getAssetGroup(asset) === activeTab;
}

function updatePeakValues() {
    syncAssetValues();
    myPortfolio.forEach(a => {
        if (a.value > (a.peakValue || 0)) a.peakValue = a.value;
    });
}

function getProfitAdvice(asset, profitPct, cost) {
    if (!cost || cost <= 0 || !groupUsesProfitTaking(getAssetGroup(asset)) || isCashAsset(asset)) return null;

    const t1 = profitTiers[0];
    const t2 = profitTiers[1];
    const t3 = profitTiers[2];
    const peak = asset.peakValue || asset.value || 0;
    const dropFromPeak = peak > 0 ? ((peak - asset.value) / peak) * 100 : 0;
    const peakProfitPct = ((peak - cost) / cost) * 100;
    const cumulative2 = (t1.sellPct || 0) + (t2.sellPct || 0);
    const remaining = Math.max(0, 100 - cumulative2);

    if (peakProfitPct >= (t2.profitPct || 0) && profitPct >= (t1.profitPct || 0)
        && dropFromPeak >= (t3.trailingPct || 10) && remaining > 0) {
        const sellAmount = asset.value * (remaining / 100);
        return {
            type: 'trailing',
            sellPct: remaining,
            sellAmount,
            text: 'ขาย',
            sub: `${fmtUsd(sellAmount)}${formatShareAdvice(sellAmount, asset)} · Trailing ${fmtPct(remaining)}`
        };
    }

    if (profitPct >= (t2.profitPct || 0)) {
        const sellAmount = asset.value * (cumulative2 / 100);
        return {
            type: 'profit',
            tier: 2,
            sellPct: cumulative2,
            sellAmount,
            text: 'ขาย',
            sub: `${fmtUsd(sellAmount)}${formatShareAdvice(sellAmount, asset)} · ${fmtPct(cumulative2)}`
        };
    }

    if (profitPct >= (t1.profitPct || 0)) {
        const pct = t1.sellPct || 0;
        const sellAmount = asset.value * (pct / 100);
        return {
            type: 'profit',
            tier: 1,
            sellPct: pct,
            sellAmount,
            text: 'ขาย',
            sub: `${fmtUsd(sellAmount)}${formatShareAdvice(sellAmount, asset)} · ${fmtPct(pct)}`
        };
    }

    return null;
}

function getStockData(symbol) {
    return priceCache[symbol] || {};
}

function formatFvHeader(symbol) {
    const fv = getStockData(symbol).fairValue;
    const price = getPrice(symbol);
    if (!fv?.fairValue) return { fv: '—', opp: '', oppCls: 'muted' };
    const up = fv.upsidePercent != null
        ? fv.upsidePercent
        : (price > 0 ? ((fv.fairValue - price) / price) * 100 : null);
    const fvText = fmtUsd(fv.fairValue);
    if (up == null) return { fv: fvText, opp: '', oppCls: 'muted' };
    const sign = up > 0 ? '+' : '';
    return {
        fv: fvText,
        opp: `${sign}${fmt(up, 2)}%`,
        oppCls: up > 0 ? 'gain' : up < 0 ? 'loss' : 'muted',
    };
}

function formatCostCell(asset, profitPct, cost) {
    const pl = formatPlPct(profitPct, cost);
    return {
        main: asset.avgCost > 0 ? fmtUsd(asset.avgCost) : '—',
        empty: !asset.avgCost,
        sub: pl.text,
        subCls: pl.cls,
    };
}

function formatSignalLine(tradeSignal) {
    return tradeSignal.sub ? `${tradeSignal.text} ${tradeSignal.sub}` : tradeSignal.text;
}

function renderFvHeaderHtml(symbol, asset) {
    if (asset && isCashAsset(asset)) {
        return `<div class="asset-fv-head"><span class="asset-fv-inline muted">เงินสด</span></div>`;
    }
    const h = formatFvHeader(symbol);
    const oppHtml = h.opp ? `<span class="asset-fv-opp ${h.oppCls}">${h.opp}</span>` : '';
    return `<div class="asset-fv-head"><span class="asset-fv-inline">ราคายุติธรรม <span class="asset-fv-price">${h.fv}</span> ${oppHtml}</span></div>`;
}

function updateFvHeader(card, symbol, asset) {
    if (asset && isCashAsset(asset)) return;
    const el = card.querySelector('.asset-fv-inline');
    if (!el) return;
    const h = formatFvHeader(symbol);
    const oppHtml = h.opp ? `<span class="asset-fv-opp ${h.oppCls}">${h.opp}</span>` : '';
    el.innerHTML = `ราคายุติธรรม <span class="asset-fv-price">${h.fv}</span> ${oppHtml}`;
}

function updateCostLine(card, costCell) {
    const el = card.querySelector('.asset-cost-line');
    if (!el) return;
    if (costCell.empty) {
        el.textContent = '—';
        el.className = 'stat-num asset-cost-line muted';
        return;
    }
    el.innerHTML = `<span class="hi">${costCell.main}</span><span class="${costCell.subCls}">${costCell.sub}</span>`;
    el.className = 'stat-num asset-cost-line';
}

function renderCostLineHtml(costCell) {
    if (costCell.empty) return '<span class="stat-num asset-cost-line muted">—</span>';
    return `<span class="stat-num asset-cost-line"><span class="hi">${costCell.main}</span><span class="${costCell.subCls}">${costCell.sub}</span></span>`;
}

function formatTradeAmount(usd, asset) {
    if (!usd || usd < 0.01) return '';
    if (isCashAsset(asset)) return fmtUsd(usd);
    return `${fmtUsd(usd)}${formatShareAdvice(usd, asset)}`;
}

function getTradeSignal(asset, diff, ideal) {
    if (isCashAsset(asset)) {
        if (diff > 0.01) {
            return { text: 'เติม', sub: formatTradeAmount(diff, asset), cls: 'buy' };
        }
        if (diff < -0.01) {
            return { text: 'ลด', sub: formatTradeAmount(Math.abs(diff), asset), cls: 'sell' };
        }
        return { text: 'พอดี', sub: '', cls: 'hold' };
    }
    const cost = asset.cost || 0;
    const profitPct = cost > 0 ? ((asset.value - cost) / cost) * 100 : 0;
    const profitAdvice = getProfitAdvice(asset, profitPct, cost);
    if (profitAdvice) {
        return { text: profitAdvice.text, sub: profitAdvice.sub, cls: 'sell' };
    }
    const fv = getStockData(asset.name).fairValue;
    const price = getPrice(asset.name) || asset.price || 0;
    if (!fv?.fairValue || price <= 0) {
        return { text: '—', sub: '', cls: 'hold' };
    }
    if (price < fv.fairValue) {
        const amount = diff > 0.01 ? diff : (ideal > 0 ? ideal * 0.1 : 0);
        return { text: 'ซื้อ', sub: formatTradeAmount(amount, asset), cls: 'buy' };
    }
    if (price > fv.fairValue) {
        const amount = diff < -0.01 ? Math.abs(diff) : (asset.value > 0 ? asset.value * 0.1 : 0);
        return { text: 'ขาย', sub: formatTradeAmount(amount, asset), cls: 'sell' };
    }
    return { text: 'ถือ', sub: '', cls: 'hold' };
}

function updateTier(index, field, val) {
    profitTiers[index][field] = parseFloat(val) || 0;
    localStorage.setItem('profitTiers', JSON.stringify(profitTiers));
    scheduleCloudSave();
    scheduleRecalculate();
}


renderTierSettings();

let dipBuyPct = parseFloat(localStorage.getItem('dipBuyPct')) || 10;

function updateDipBuy(val) {
    dipBuyPct = parseFloat(val) || 0;
    localStorage.setItem('dipBuyPct', dipBuyPct);
    scheduleCloudSave();
}

function getBuyAlerts(asset, diff, curPct) {
    const alerts = [];
    if (diff > 0.01) {
        alerts.push({
            type: 'rebalance',
            amount: diff,
            gap: asset.target - curPct,
            text: `ปรับสัดส่วน ${fmtUsd(diff)} (ต่ำเป้า ${fmtPct(asset.target - curPct)})`
        });
    }
    return alerts;
}

function fmt(n, dec = 2) {
    return n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtPct(n) {
    return fmt(n, 2) + '%';
}

function fmtUsd(n) {
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
        if (diff > 0.01) return { cls: 'buy', text: `เติม ${fmtUsd(diff)}` };
        if (diff < -0.01) return { cls: 'sell', text: `ลด ${fmtUsd(Math.abs(diff))}` };
        return { cls: 'hold', text: 'พอดี' };
    }
    const sharePart = formatShareAdvice(Math.abs(diff), asset);
    if (diff > 0.01) return { cls: 'buy', text: `ซื้อ ${fmtUsd(diff)}${sharePart}` };
    if (diff < -0.01) return { cls: 'sell', text: `ขาย ${fmtUsd(Math.abs(diff))}${sharePart}` };
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
        const tradeSignal = getTradeSignal(asset, diff, ideal);
        return { index, asset, curPct, ideal, diff, action: getAction(diff, asset), cost, profit, profitPct, tradeSignal };
    });

    return { totalValue, totalTarget, assets };
}

function formatProfit(profit, profitPct) {
    const sign = profit >= 0 ? '+' : '';
    const cls = profit >= 0 ? 'gain' : 'loss';
    return { text: `${sign}${fmtPct(profitPct)} (${fmtUsd(Math.abs(profit))})`, cls };
}

function updateSummary(totalValue, totalTarget) {
    document.getElementById('total-value').textContent = fmt(totalValue, 2);
    const thbEl = document.getElementById('total-value-thb');
    if (thbEl) {
        thbEl.textContent = usdThbRate > 0
            ? '฿' + fmt(totalValue * usdThbRate, 2)
            : '฿…';
    }

    const targetBox = document.getElementById('target-box');
    const targetEl = document.getElementById('target-status');
    const breakdownEl = document.getElementById('target-breakdown');
    targetBox.className = 'summary-item' + (totalTarget === 100 ? ' ok' : ' warn');
    targetEl.textContent = fmtPct(totalTarget) + (totalTarget !== 100 ? ' ⚠' : ' ✓');
    breakdownEl.textContent = portfolioGroups
        .map(g => `${getGroupLabel(g.id)} ${fmtPct(getTargetByGroup(g.id))}`)
        .join(' · ');
    updateTabUI();
}

function renderAdviceRow(tradeSignal, action) {
    const leftCls = tradeSignal.cls + ' advice';
    const signalText = formatSignalLine(tradeSignal);
    const rightCls = 'asset-rebalance ' + action.cls;
    return `
                <div class="stat-pair">
                    <div class="stat-col">
                        <span class="stat-label">สัญญาณ</span>
                        <span class="stat-num asset-trade-signal ${leftCls}">${signalText}</span>
                    </div>
                    <div class="stat-col">
                        <span class="stat-label">สัดส่วน</span>
                        <span class="stat-num ${rightCls}">${action.text}</span>
                    </div>
                </div>`;
}

function updateAdviceRow(card, tradeSignal, action) {
    const leftNum = card.querySelector('.asset-trade-signal');
    const rightEl = card.querySelector('.asset-rebalance');
    if (!leftNum || !rightEl) return;

    const leftCls = tradeSignal.cls + ' advice';
    leftNum.textContent = formatSignalLine(tradeSignal);
    leftNum.className = 'stat-num asset-trade-signal ' + leftCls;
    rightEl.textContent = action.text;
    rightEl.className = 'stat-num asset-rebalance ' + action.cls;
}

function recalculate() {
    const { totalValue, totalTarget, assets } = computePortfolio();
    updateSummary(totalValue, totalTarget);
    updateTabUI();

    assets.forEach(({ index, curPct, ideal, action, cost, profitPct, tradeSignal, asset }) => {
        const card = document.querySelector(`.asset-card[data-index="${index}"]`);
        if (!card) return;

        const targetPctEl = card.querySelector('.asset-target-pct');
        if (targetPctEl) targetPctEl.textContent = fmtPct(asset.target || 0);
        const pctEl = card.querySelector('.asset-pct');
        if (pctEl) pctEl.textContent = fmtPct(curPct);
        const idealEl = card.querySelector('.asset-ideal');
        if (idealEl) idealEl.textContent = fmtUsd(ideal);
        const valEl = card.querySelector('.asset-value');
        if (valEl) valEl.textContent = fmtUsd(asset.value);

        const costCell = formatCostCell(asset, profitPct, cost);
        if (!isCashAsset(asset)) {
            updateCostLine(card, costCell);
            const price = getPrice(asset.name);
            const priceEl = card.querySelector('.asset-price');
            if (priceEl) {
                priceEl.textContent = price > 0 ? fmtUsd(price) : (priceCache[asset.name]?.error ? 'ไม่พบ' : '…');
                priceEl.className = 'stat-num asset-price hi';
            }
        }

        updateFvHeader(card, asset.name, asset);

        updateAdviceRow(card, tradeSignal, action);
    });

    if (assetSheetIndex != null) {
        const item = assets.find(a => a.index === assetSheetIndex);
        if (item) updateAssetSheetLive({ ...item, asset: item.asset });
    }

    if (document.getElementById('settings-overlay')?.classList.contains('open')) {
        updateGroupTargetSum();
    }
}

function formatPlPct(profitPct, cost) {
    if (!cost) return { text: '—', cls: 'muted' };
    const sign = profitPct >= 0 ? '+' : '';
    return {
        text: sign + fmt(profitPct, 2) + '%',
        cls: profitPct >= 0 ? 'gain' : 'loss'
    };
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

function updateAssetSheetLive({ cost, profit, profitPct, tradeSignal, asset }) {
    if (asset && isCashAsset(asset)) {
        const adviceEl = document.getElementById('asset-sheet-advice');
        if (adviceEl) {
            const detail = tradeSignal.sub ? ` · ${tradeSignal.sub}` : '';
            adviceEl.textContent = `สัดส่วน: ${tradeSignal.text}${detail}`;
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
        const detail = tradeSignal.sub ? ` · ${tradeSignal.sub}` : '';
        adviceEl.textContent = `สัญญาณ: ${tradeSignal.text}${detail}`;
        adviceEl.style.display = '';
    }
}

function renderGroupSelectHtml(index, asset) {
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

function renderAssetSheetBody({ index, asset, cost, profit, profitPct, tradeSignal }) {
    if (isCashAsset(asset)) {
        const adviceDetail = tradeSignal.sub ? ` · ${tradeSignal.sub}` : '';
        const adviceText = `สัดส่วน: ${tradeSignal.text}${adviceDetail}`;
        return `
        <div class="setting-hint" style="margin-bottom:12px">เงินสด · กรอกยอดเป็น USD</div>
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
    const adviceDetail = tradeSignal.sub ? ` · ${tradeSignal.sub}` : '';
    const adviceText = `สัญญาณ: ${tradeSignal.text}${adviceDetail}`;
    return `
        ${role ? `<div class="setting-hint" style="margin-bottom:12px">${role}</div>` : ''}
        ${renderGroupSelectHtml(index, asset)}
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

function renderAssetCard(index, asset, curPct, ideal, cost, profit, profitPct, tradeSignal, action) {
    const cash = isCashAsset(asset);
    const costCell = formatCostCell(asset, profitPct, cost);
    const price = getPrice(asset.name);
    const priceText = price > 0 ? fmtUsd(price) : '…';
    return `
            <div class="asset-stats">
                <div class="stat-pair">
                    <div class="stat-col">
                        <span class="stat-label">สัดส่วน · เป้า</span>
                        <span class="stat-num asset-target-pct">${fmtPct(asset.target || 0)}</span>
                    </div>
                    <div class="stat-col">
                        <span class="stat-label">สัดส่วน · จริง</span>
                        <span class="stat-num asset-pct hi">${fmtPct(curPct)}</span>
                    </div>
                </div>
                <div class="stat-pair">
                    <div class="stat-col">
                        <span class="stat-label">มูลค่า · เป้า</span>
                        <span class="stat-num asset-ideal">${fmtUsd(ideal)}</span>
                    </div>
                    <div class="stat-col">
                        <span class="stat-label">มูลค่า · จริง</span>
                        <span class="stat-num asset-value hi">${fmtUsd(asset.value)}</span>
                    </div>
                </div>
                ${cash ? '' : `
                <div class="stat-pair">
                    <div class="stat-col">
                        <span class="stat-label">ราคา · ทุน</span>
                        ${renderCostLineHtml(costCell)}
                    </div>
                    <div class="stat-col">
                        <span class="stat-label">ราคา · ปัจจุบัน</span>
                        <span class="stat-num asset-price hi">${priceText}</span>
                    </div>
                </div>`}
                ${renderAdviceRow(tradeSignal, action)}
            </div>`;
}

function renderAssetGrid(index, asset, curPct, ideal, profitFmt, cost, profit, profitPct, tradeSignal, action) {
    return renderAssetCard(index, asset, curPct, ideal, cost, profit, profitPct, tradeSignal, action);
}

function appendAssetCard(list, payload) {
    const { index, asset, curPct, ideal, action, cost, profit, profitPct, tradeSignal } = payload;
    const profitFmt = cost > 0 ? formatProfit(profit, profitPct) : { text: '—', cls: '' };
    const row = document.createElement('div');
    row.className = 'asset-card';
    row.dataset.index = index;
    row.dataset.name = asset.name;
    row.innerHTML = `
        <div class="asset-header">
            <span class="drag-handle" aria-label="สลับลำดับ ${asset.name}">≡</span>
            <div class="asset-badge">${asset.name.slice(0, 4)}</div>
            <div class="asset-name">${asset.name}</div>
            ${renderFvHeaderHtml(asset.name, asset)}
            <button class="btn-card-gear" type="button" aria-label="ตั้งค่า ${asset.name}" onclick="openAssetSheet(${index})">⚙</button>
            <button class="btn-delete" type="button" aria-label="ลบ ${asset.name}" onclick="deleteAsset(${index})">×</button>
        </div>
        ${renderAssetGrid(index, asset, curPct, ideal, profitFmt, cost, profit, profitPct, tradeSignal, action)}`;
    list.appendChild(row);
}

function renderAndCalculate() {
    const list = document.getElementById('assets-list');
    list.innerHTML = '';

    syncAssetValues();
    const { totalValue, totalTarget, assets } = computePortfolio();
    updateSummary(totalValue, totalTarget);

    const visible = assets.filter(({ asset }) => isVisibleAsset(asset));

    if (visible.length === 0) {
        list.innerHTML = `<div class="empty-state">ยังไม่มีสินทรัพย์ใน${getGroupLabel(activeTab)}<br>กดปุ่มด้านล่างเพื่อเพิ่ม</div>`;
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
    const group = activeTab;
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



async function bootstrap() {
    renderAndCalculate();
    fetchPrices(true);
    await initCloudSync();
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
