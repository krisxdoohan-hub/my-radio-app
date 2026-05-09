/* ============================================================
   sw.js — Service Worker for 台灣廣播 PWA
   策略：
   ・Shell 檔案 (HTML/CSS/JS) → Cache First（離線可用）
   ・音頻串流 → Network Only（直播不快取）
   ============================================================ */

/* ── 版本號 ──
   每次更新 index.html 的 APP_VERSION 時，
   請同步修改此處的版本字串，
   瀏覽器才會捨棄舊快取並重新下載所有資源。
   目前版本：v0.0.0
── */
const CACHE_NAME  = 'tw-radio-v0.0.0';

// 需要離線快取的 Shell 資源
const SHELL_URLS = [
  './',
  './index.html',
  './manifest.json',
];

/* ── install：預先快取 Shell ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] 快取 Shell 資源');
      return cache.addAll(SHELL_URLS);
    })
  );
  self.skipWaiting();   // 立即啟用新版本
});

/* ── activate：清除舊版快取 ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key  => {
            console.log('[SW] 刪除舊快取：', key);
            return caches.delete(key);
          })
      )
    )
  );
  self.clients.claim();
});

/* ── fetch：攔截請求 ── */
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 音頻串流 → 直接走網路，不做快取
  const isAudioStream =
    event.request.destination === 'audio' ||
    url.pathname.endsWith('.mp3')          ||
    url.pathname.endsWith('.aac')          ||
    url.hostname.includes('revma.com')     ||
    url.hostname.includes('stream')        ||
    url.hostname.includes('cast')          ||
    url.hostname.includes('live');

  if (isAudioStream) {
    event.respondWith(fetch(event.request));
    return;
  }

  // GitHub API → 直接走網路
  if (url.hostname === 'api.github.com') {
    event.respondWith(fetch(event.request));
    return;
  }

  // 其他資源 → Cache First，失敗才網路
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // 動態快取成功的 GET 請求
        if (
          response.ok &&
          event.request.method === 'GET' &&
          !url.hostname.includes('api.github.com')
        ) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    }).catch(() => {
      // 完全離線且無快取：回傳空頁提示
      return new Response('<h2 style="font-family:sans-serif;text-align:center;margin-top:40vh;color:#94a3b8">離線中，請連上網路後重試</h2>', {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    })
  );
});
