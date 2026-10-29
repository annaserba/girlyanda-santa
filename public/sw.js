/* Retire previously installed notification workers when they next update.
 * Keep this URL available for existing registrations; no new worker is registered.
 */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const subscription = await self.registration.pushManager?.getSubscription();
        if (subscription) await subscription.unsubscribe();
      } finally {
        await self.registration.unregister();
      }
    })(),
  );
});
