/**
 * Registra /sw.js para que la planta abra aunque se recargue sin red. Si el
 * navegador no lo soporta (Chrome viejo en iOS), todo sigue funcionando
 * mientras la página esté abierta; el iPad reporta `sw_supported` al
 * sincronizar (se ve en /admin/sincronizacion).
 */
export function registerFloorServiceWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("/sw.js", { scope: "/planta/" }).catch(() => undefined);
}
