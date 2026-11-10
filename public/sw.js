/* InvestPui service worker: รับแจ้งเตือน (Web Push) แล้วเปิดหน้าที่เกี่ยวข้องเมื่อแตะ */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
    let n = {};
    try { n = e.data ? e.data.json() : {}; } catch { n = { title: 'InvestPui', body: e.data ? e.data.text() : '' }; }
    e.waitUntil(self.registration.showNotification(n.title || 'InvestPui', {
        body: n.body || '',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: n.tag || undefined,
        renotify: !!n.tag,
        data: { url: n.url || '/' },
    }));
});

self.addEventListener('notificationclick', e => {
    e.notification.close();
    const url = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin).href;
    e.waitUntil((async () => {
        const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const w of wins) {
            if ('focus' in w) { await w.focus(); if ('navigate' in w) { try { await w.navigate(url); } catch { /* ignore */ } } return; }
        }
        await self.clients.openWindow(url);
    })());
});
