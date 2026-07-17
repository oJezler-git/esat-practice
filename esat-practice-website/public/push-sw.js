// Push + notification handlers, imported into the generated Workbox service
// worker via vite-plugin-pwa's workbox.importScripts. Kept as a plain script so
// it runs in the SW global scope alongside the Workbox runtime.

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "ESAT Practice";
  const options = {
    body: data.body || "Time for a quick practice session.",
    icon: "/icon-512.png",
    badge: "/icon-512.png",
    tag: data.tag || "esat-notification",
    requireInteraction: !!data.requireInteraction,
    vibrate: Array.isArray(data.vibrate) ? data.vibrate : undefined,
    actions: Array.isArray(data.actions) ? data.actions : undefined,
    data: { url: data.url || "/practice" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "dismiss") return;

  const targetUrl = (event.notification.data && event.notification.data.url) || "/practice";

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of clientList) {
        // Focus an existing tab and route it to the target if we can.
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) {
            try {
              await client.navigate(targetUrl);
            } catch {
              // Cross-origin or navigation blocked — focusing is enough.
            }
          }
          return;
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })(),
  );
});
