/* Planta XTENSOR: abre la app aunque el iPad recargue sin red.
 *
 * - /planta/piso (la app de planta): red primero con 4 s de espera; si no hay
 *   red, la última copia guardada. Las rutas viejas de planta caen ahí también.
 * - /_next/static, /_next/image, /brand: caché primero (archivos con hash, no cambian).
 * - Todo lo demás (APIs, POST) pasa directo: la bandeja de salida se encarga.
 */
const SHELL_CACHE = "xt-planta-shell-v1";
const ASSET_CACHE = "xt-planta-assets-v1";
const SHELL_URL = "/planta/piso";
const NETWORK_TIMEOUT_MS = 4000;
const MAX_ASSETS = 400;
const FLOOR_PATHS = ["/planta", "/planta/", "/planta/operarios", "/planta/maquinas", "/planta/almacen"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(refreshShell().catch(() => undefined));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name.startsWith("xt-planta-") && name !== SHELL_CACHE && name !== ASSET_CACHE).map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    if (url.pathname === SHELL_URL) {
      event.respondWith(shellFirstFromNetwork(request));
      return;
    }
    if (isFloorPath(url.pathname) || url.pathname === "/planta/tablero") {
      event.respondWith(navigateWithFallback(request, url.pathname));
    }
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/_next/image") || url.pathname.startsWith("/brand/")) {
    event.respondWith(cacheFirst(request));
  }
});

function isFloorPath(pathname) {
  return FLOOR_PATHS.includes(pathname) || pathname.startsWith("/planta/maquinas/");
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function isCacheableShell(response) {
  return response.ok && !response.redirected && (response.headers.get("content-type") || "").includes("text/html");
}

async function shellFirstFromNetwork(request) {
  try {
    const response = await withTimeout(fetch(request), NETWORK_TIMEOUT_MS);
    if (isCacheableShell(response)) {
      const copy = response.clone();
      caches.open(SHELL_CACHE).then((cache) => cache.put(SHELL_URL, copy.clone()).then(() => cacheAssetsOf(copy)));
    }
    return response;
  } catch {
    const cached = await caches.match(SHELL_URL);
    return cached || offlinePage("Sin conexión", "El iPad todavía no tiene la app guardada. Conéctalo una vez y vuelve a intentar.");
  }
}

/** Otras páginas de planta: red; sin red, la app guardada (o un aviso para la cartelera). */
async function navigateWithFallback(request, pathname) {
  try {
    return await withTimeout(fetch(request), NETWORK_TIMEOUT_MS * 2);
  } catch {
    if (pathname === "/planta/tablero") {
      return offlinePage("La cartelera necesita conexión", "Vuelve a la planta para seguir registrando sin señal.");
    }
    const cached = await caches.match(SHELL_URL);
    return cached || offlinePage("Sin conexión", "El iPad todavía no tiene la app guardada. Conéctalo una vez y vuelve a intentar.");
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(ASSET_CACHE);
    await cache.put(request, response.clone());
    trimAssets(cache);
  }
  return response;
}

async function refreshShell() {
  const response = await fetch(SHELL_URL, { credentials: "include", cache: "no-store" });
  if (!isCacheableShell(response)) return;
  const cache = await caches.open(SHELL_CACHE);
  await cache.put(SHELL_URL, response.clone());
  await cacheAssetsOf(response);
}

/** Guarda los JS/CSS que pide la app, para que abra completa sin red. */
async function cacheAssetsOf(response) {
  const html = await response.text();
  const urls = new Set();
  const pattern = /(?:src|href)="(\/_next\/static\/[^"]+)"/g;
  let match;
  while ((match = pattern.exec(html))) urls.add(match[1]);
  const cache = await caches.open(ASSET_CACHE);
  await Promise.all(
    [...urls].map(async (url) => {
      if (await cache.match(url)) return;
      try {
        const asset = await fetch(url);
        if (asset.ok) await cache.put(url, asset);
      } catch {
        // Se intentará en la próxima carga con red.
      }
    }),
  );
  trimAssets(cache);
}

/** Tras varios despliegues se acumulan archivos viejos: se borran los más antiguos. */
async function trimAssets(cache) {
  const keys = await cache.keys();
  const excess = keys.length - MAX_ASSETS;
  for (let index = 0; index < excess; index++) await cache.delete(keys[index]);
}

function offlinePage(title, message) {
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f1ea;color:#111;font-family:-apple-system,Helvetica,Arial,sans-serif;text-align:center;padding:24px}
h1{font-size:2.2rem;margin:0 0 .5rem;text-transform:uppercase}p{font-size:1.1rem;color:#555;max-width:32rem}
a{display:inline-block;margin-top:1rem;padding:.9rem 1.6rem;border:1px solid #111;background:#f5c518;color:#111;font-weight:700;text-decoration:none}</style></head>
<body><div><h1>${title}</h1><p>${message}</p><a href="${SHELL_URL}">Volver a la planta</a></div></body></html>`;
  return new Response(html, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
