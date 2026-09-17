/* Fan Engage service worker.
 *
 * Two responsibilities:
 *   1. Receive push events and render notifications using the payload
 *      our server module sends (see lib/notifications/push.ts).
 *   2. When the user taps the notification, focus an existing FE tab if
 *      one exists at the target URL — otherwise open a new one.
 *
 * No caching strategy here on purpose. App Router handles its own
 * caching; we don't want a service worker to interfere.
 */

self.addEventListener("install", () => {
  // Activate immediately on first install / update.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Fan Engage", body: event.data.text() };
  }

  const title = payload.title || "Fan Engage";
  const options = {
    body: payload.body || "",
    icon: payload.icon || "/icon-192.png",
    badge: payload.badge || "/badge-72.png",
    tag: payload.tag,
    renotify: false,
    data: {
      url: payload.url || "/",
      ...(payload.data || {}),
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      // Look for an existing FE window we can focus instead of opening a new one.
      const sameOrigin = allClients.find((c) => {
        try {
          return new URL(c.url).origin === self.location.origin;
        } catch {
          return false;
        }
      });

      if (sameOrigin) {
        await sameOrigin.focus();
        if ("navigate" in sameOrigin) {
          try {
            await sameOrigin.navigate(targetUrl);
          } catch {
            // some browsers reject cross-document navigate; fall through
          }
        }
        return;
      }

      await self.clients.openWindow(targetUrl);
    })(),
  );
});
