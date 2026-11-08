// The phone's side of texts from Marco and Dante. A push arrives with no payload; this fetches
// what's unseen (supabase/functions/push?inbox=1) and shows one notification per text. Tapping
// one opens that thread. Nothing here marks a text seen - opening the thread does.
const SUPABASE_URL = 'https://qyphdwcjzhgobsfpeonh.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF5cGhkd2Nqemhnb2JzZnBlb25oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM1OTUxMzksImV4cCI6MjEwOTE3MTEzOX0.amjwhpx3GG4GSenJ2F0KErfAvZXw7636YAltYfhGlWs';
const PLAYER_ID = '00000000-0000-4000-8000-000000000001';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  e.waitUntil((async () => {
    let texts = [];
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/push?inbox=1&player_id=${PLAYER_ID}`, { headers: { Authorization: `Bearer ${SUPABASE_ANON}`, apikey: SUPABASE_ANON } });
      texts = (await r.json()).texts || [];
    } catch (_) { /* offline: a plain buzz below */ }
    if (!texts.length) return self.registration.showNotification('THE_LAB', { body: 'Someone texted you.', tag: 'lab-text', data: { url: './text.html' } });
    // one notification per text, newest last; the tag keeps a repeat push from doubling them
    for (const t of texts.slice().reverse()) await self.registration.showNotification(t.name, { body: t.text, tag: `lab-text-${t.id}`, data: { url: `./text.html?who=${t.who}` }, icon: '../assets/icons/texts-192.png', badge: '../assets/icons/texts-192.png' });
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || './text.html', self.registration.scope).href;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = all.find(c => c.url.split('?')[0] === url.split('?')[0]);
    if (open) { await open.focus(); if ('navigate' in open) await open.navigate(url); return; }
    await self.clients.openWindow(url);
  })());
});
