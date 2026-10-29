import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

function loadWorker() {
  type Handler = (event: {
    waitUntil: (work: Promise<unknown>) => void;
  }) => void;
  const listeners = new Map<string, Handler>();
  const unsubscribe = vi.fn().mockResolvedValue(true);
  const worker = {
    addEventListener: (name: string, handler: Handler) =>
      listeners.set(name, handler),
    skipWaiting: vi.fn().mockResolvedValue(undefined),
    registration: {
      unregister: vi.fn().mockResolvedValue(true),
      pushManager: {
        getSubscription: vi.fn().mockResolvedValue({ unsubscribe }),
      },
    },
  };
  runInNewContext(
    readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"),
    { self: worker },
  );
  return { listeners, worker, unsubscribe };
}

describe("retired notification worker", () => {
  it("unsubscribes and unregisters without installing notification handlers", async () => {
    const { listeners, worker, unsubscribe } = loadWorker();
    expect([...listeners.keys()]).toEqual(["install", "activate"]);
    const pending: Promise<unknown>[] = [];
    const event = {
      waitUntil: (work: Promise<unknown>) => {
        pending.push(work);
      },
    };
    listeners.get("install")!(event);
    listeners.get("activate")!(event);
    await Promise.all(pending);
    expect(worker.skipWaiting).toHaveBeenCalledOnce();
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(worker.registration.unregister).toHaveBeenCalledOnce();
  });

  it("unregisters even if removing a subscription fails", async () => {
    const { listeners, worker } = loadWorker();
    worker.registration.pushManager.getSubscription.mockRejectedValue(
      new Error("Push unavailable"),
    );
    const pending: Promise<unknown>[] = [];
    listeners.get("activate")!({
      waitUntil: (work) => {
        pending.push(work);
      },
    });
    await expect(pending[0]).rejects.toThrow("Push unavailable");
    expect(worker.registration.unregister).toHaveBeenCalledOnce();
  });
});
