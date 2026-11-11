/**
 * Café Huasimal · modo sin conexión
 * Guarda en el teléfono la app (index.html), sus estilos, letras e íconos para que abra sin internet.
 * Los envíos a Google Sheets (script.google.com) no pasan por aquí: los maneja la cola de index.html.
 * index.html se pide primero a internet (máx. ESPERA ms), así que sus cambios llegan solos; con señal débil o sin señal abre la copia guardada.
 * Al cambiar este archivo o los íconos, subir VERSION.
 */
const VERSION = 'wk-v3';
const ESPERA = 3000;
const APP = ['./', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];
const EXTERNOS = [
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap',
  'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap'
];
const TAILWIND = EXTERNOS[0];
const CDN = /^https:\/\/(cdn\.tailwindcss\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//;

// Pantallas que necesitan internet (Descargas): aviso en lugar del error del navegador.
const sinConexion = () => new Response(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sin conexión · Café Huasimal</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#FFFBF8;color:#292524;font:16px/1.5 system-ui,sans-serif;padding:24px;box-sizing:border-box;text-align:center}
.c{max-width:340px}.i{width:72px;height:72px;margin:0 auto 16px;border-radius:50%;background:#FFE8EC;display:grid;place-items:center;font-size:34px}h1{font-size:22px;margin:0 0 8px}p{color:#57534E;margin:0 0 20px}
a,button{display:inline-block;margin:4px;padding:12px 22px;border-radius:999px;border:0;font:600 15px system-ui,sans-serif;text-decoration:none;cursor:pointer}a{background:#b42440;color:#fff}button{background:#FAF5F0;color:#292524}</style></head>
<body><div class="c"><div class="i">📶</div><h1>Necesita conexión</h1><p>El avance y las descargas se leen de Google Sheets. Vuelva a intentarlo cuando tenga internet.</p>
<button onclick="location.reload()">Reintentar</button><a href="./">Ir a la recolección</a></div></body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });

// Una respuesta que llegó por redirección (Cloudflare lleva /index.html a /) no puede abrir una página: se copia limpia.
const limpia = r => r.redirected ? new Response(r.body, { status: r.status, statusText: r.statusText, headers: r.headers }) : r;

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await c.addAll(APP);
    // Sin Tailwind la app abre sin diseño: si no se pudo guardar, la instalación falla y se reintenta en la próxima visita.
    await c.put(TAILWIND, await fetch(TAILWIND, { mode: 'no-cors' }));
    for (const url of EXTERNOS.slice(1)) {
      try {
        const r = await fetch(url, { mode: 'cors' });
        await c.put(url, r.clone());
        // Las hojas de Google Fonts apuntan a archivos de letra: se guardan también.
        if (r.ok) {
          const css = await r.text();
          const fuentes = [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map(m => m[1]);
          await Promise.all(fuentes.map(f => fetch(f).then(x => c.put(f, x)).catch(() => {})));
        }
      } catch (err) { /* sin conexión durante la instalación: se guardará en el próximo uso */ }
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // La app: primero internet (para recibir actualizaciones) con un límite de ESPERA; sin señal o señal débil, la copia guardada.
  if (req.mode === 'navigate' && url.origin === location.origin) {
    const esApp = /\/(index\.html)?$/.test(url.pathname);
    e.respondWith((async () => {
      const c = await caches.open(VERSION);
      const red = fetch(req).then(async r => {
        if (r.ok && esApp) await c.put('./', limpia(r.clone()));
        return r;
      });
      e.waitUntil(red.catch(() => {}));   // si gana la copia guardada, la versión nueva se termina de guardar para la próxima vez
      const guardado = await c.match(esApp ? './' : req, { ignoreSearch: true });
      if (!guardado) return red.catch(() => sinConexion());
      const tarde = new Promise(ok => setTimeout(() => ok(null), ESPERA));
      const r = await Promise.race([red.catch(() => null), tarde]);
      return r || limpia(guardado);
    })());
    return;
  }

  // Estilos, letras e íconos: la copia guardada al instante y se renueva en segundo plano.
  if (CDN.test(req.url) || (url.origin === location.origin && APP.some(p => url.pathname.endsWith(p.slice(1))))) {
    e.respondWith((async () => {
      const c = await caches.open(VERSION);
      const guardado = await c.match(req, { ignoreVary: true });
      const red = fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => null);
      return guardado || (await red) || Response.error();
    })());
  }
});
