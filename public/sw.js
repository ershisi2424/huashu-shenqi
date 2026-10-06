/* 大哥维护话术神器 - Service Worker 离线缓存
 * 策略：precache shell + runtime cache 静态资源/数据
 */
const VERSION = "v1.0.3-private-api";
const STATIC_CACHE = `static-${VERSION}`;
const RUNTIME_CACHE = `runtime-${VERSION}`;
const SCOPE_URL = new URL(self.registration?.scope || "./", location.origin);
const apiRoot = new URL("api/", SCOPE_URL).pathname;

// 预缓存 shell：manifest + HTML 入口 + 占位图标
const PRECACHE_URLS = [
  "./",
  "./manifest.webmanifest",
  "./icons/icon-192.svg",
  "./icons/icon-512.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => ![STATIC_CACHE, RUNTIME_CACHE].includes(k))
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // 跳过跨域（例如：外部图床）
  if (url.origin !== location.origin) return;

  // 私有 API 必须始终走网络，避免跨账号复用缓存响应。
  if (url.pathname === apiRoot.slice(0, -1) || url.pathname.startsWith(apiRoot)) return;

  // HTML 文档：network-first，保证 GitHub Pages 新版内容先拉
  if (req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html")) {
    event.respondWith(
      fetch(req)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy));
          return resp;
        })
        .catch(() =>
          caches.match(req).then((cached) => cached || caches.match("./"))
        )
    );
    return;
  }

  // 静态资源 / 数据：cache-first（带网络后台刷新）
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((resp) => {
          if (resp && resp.status === 200 && resp.type === "basic") {
            const copy = resp.clone();
            caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy));
          }
          return resp;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
