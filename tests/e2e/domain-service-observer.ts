// craigtrim/axiom#207: observe the real utility relay without a production test hook.
import type { ElectronApplication, Page } from "@playwright/test";

export async function observeDomainService(
  app: ElectronApplication,
  page: Page,
) {
  await app.evaluate(() => {
    const { EventEmitter } = process.getBuiltinModule(
      "events",
    ) as typeof import("node:events");
    const original = EventEmitter.prototype.emit;
    const observation = {
      utility: null as any,
      counts: {} as Record<string, number>,
      hold: undefined as string | undefined,
      held: false,
      exit: undefined as { code: number } | undefined,
      beforeRequest: undefined as
        | ((packet: { id: number; method: string; args?: unknown }) => void)
        | undefined,
      restore: () => {
        EventEmitter.prototype.emit = original;
      },
    };
    (globalThis as any).__domainServiceObserver = observation;
    EventEmitter.prototype.emit = function (event, ...args) {
      const envelope = args[0];
      if (
        !observation.utility &&
        event === "message" &&
        envelope?.channel === "axiom-domain-v1" &&
        typeof (this as any).postMessage === "function" &&
        typeof (this as any).kill === "function" &&
        Number.isSafeInteger((this as any).pid) &&
        (this as any).pid > 0
      ) {
        const utility = (observation.utility = this as any);
        observation.restore();
        utility.once("exit", (code: number) => {
          observation.exit = { code };
        });
        const postMessage = utility.postMessage;
        utility.postMessage = function (message: any, ...rest: any[]) {
          if (
            message?.channel === "axiom-domain-v1" &&
            message.type === "request" &&
            typeof message.packet?.method === "string"
          ) {
            const packet = message.packet;
            observation.counts[packet.method] =
              (observation.counts[packet.method] ?? 0) + 1;
            observation.beforeRequest?.(packet);
            if (packet.method === observation.hold) {
              observation.held = true;
              return;
            }
          }
          return Reflect.apply(postMessage, this, [message, ...rest]);
        };
      }
      return Reflect.apply(original, this, [event, ...args]);
    };
  });
  try {
    // The real reply identifies the relay even after its initial ready event.
    await page.evaluate(() => window.axiom.request("state"));
    await app.evaluate(() => {
      if (!(globalThis as any).__domainServiceObserver.utility)
        throw Error("The ontology utility relay was not observed.");
    });
  } finally {
    await app.evaluate(() =>
      (globalThis as any).__domainServiceObserver.restore(),
    );
  }
}
