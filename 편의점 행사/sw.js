const CACHE = 'cvs-v4';
const PRECACHE = [
  './',
  './1_1.html',
  './ads.js',
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ── 알림 스케줄 관리 ────────────────────────────────────────────────
// 앱에서 SCHEDULE_NOTIFICATIONS 메시지로 스케줄 목록을 전달받아
// 해당 요일·시각에 로컬 푸시 알림을 발송한다 (백엔드 불필요).
let notifSchedules = [];
let notifTimerId = null;

self.addEventListener('message', e => {
  if (e.data?.type !== 'SCHEDULE_NOTIFICATIONS') return;
  notifSchedules = e.data.schedules || [];
  rescheduleNotifTimer();
});

function msUntilDayHour(dow, hour, minute, from) {
  const d = new Date(from);
  d.setHours(hour, minute, 0, 0);
  let diff = (dow - from.getDay() + 7) % 7;
  if (diff === 0 && d <= from) diff = 7;
  d.setDate(d.getDate() + diff);
  return d - from;
}

function rescheduleNotifTimer() {
  if (notifTimerId) { clearTimeout(notifTimerId); notifTimerId = null; }
  if (notifSchedules.length === 0) return;
  const now = new Date();
  let nearest = Infinity;
  notifSchedules.forEach(s => {
    const ms = msUntilDayHour(s.dayOfWeek, s.hour, s.minute, now);
    if (ms < nearest) nearest = ms;
  });
  const delay = Math.min(nearest, 24 * 60 * 60 * 1000);
  notifTimerId = setTimeout(fireScheduledNotifs, delay);
}

function fireScheduledNotifs() {
  const now = new Date();
  notifSchedules.forEach(s => {
    // 5분 이내 타이밍이면 발송
    if (msUntilDayHour(s.dayOfWeek, s.hour, s.minute, now) < 5 * 60 * 1000) {
      self.registration.showNotification(s.title, {
        body: s.body,
        icon: './icon-192.png',
        badge: './icon-32.png',
        tag: s.type,
      });
    }
  });
  rescheduleNotifTimer();
}

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(list => {
      if (list.length) return list[0].focus();
      return clients.openWindow('./');
    })
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // deals.json / stores/ 는 네트워크 우선 → 실패 시 캐시 폴백
  if (url.pathname.includes('deals.json') || url.pathname.includes('/stores/')) {
    e.respondWith(
      fetch(e.request)
        .then(res => { caches.open(CACHE).then(c => c.put(e.request, res.clone())); return res; })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // 나머지는 캐시 우선 → 없으면 네트워크
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
      return res;
    }))
  );
});
