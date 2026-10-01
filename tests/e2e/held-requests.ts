import { expect, type ElectronApplication } from "@playwright/test";

/** Hold real worker replies, so assertions exercise the entire pending interval. */
export async function holdRequests(
  app: ElectronApplication,
  methods: string[],
  channel = "domain:request",
) {
  await app.evaluate(
    ({ ipcMain }, { methods, channel }) => {
      const original = (ipcMain as any)._invokeHandlers.get(channel);
      const control = { methods, held: [] as any[], calls: [] as any[] };
      (globalThis as any).__heldRequests = control;
      ipcMain.removeHandler(channel);
      ipcMain.handle(channel, (event, ...payload) => {
        const [method, args] =
          channel === "domain:request" ? payload : [channel, payload[0]];
        control.calls.push({ method, args });
        if (!control.methods.includes(method))
          return original(event, ...payload);
        const response = Promise.resolve()
          .then(() => original(event, ...payload))
          .then(
            (value) => ({ value }),
            (error) => ({ error }),
          );
        return new Promise((resolve, reject) =>
          control.held.push({
            method,
            args,
            resolve: () =>
              void response.then((result) =>
                "error" in result
                  ? reject(result.error)
                  : resolve(result.value),
              ),
            reject: () => reject(Error("Controlled preview failure")),
          }),
        );
      });
    },
    { methods, channel },
  );
}
export async function waitForHeld(app: ElectronApplication, count = 1) {
  await expect
    .poll(() =>
      app.evaluate(() => (globalThis as any).__heldRequests.held.length),
    )
    .toBeGreaterThanOrEqual(count);
}
export async function releaseRequests(
  app: ElectronApplication,
  options: { fail?: boolean; keepHolding?: boolean; reverse?: boolean } = {},
) {
  await app.evaluate((_, options) => {
    const control = (globalThis as any).__heldRequests;
    if (!options.keepHolding) control.methods = [];
    const held = control.held.splice(0);
    if (options.reverse) held.reverse();
    held.forEach((item: any) => item[options.fail ? "reject" : "resolve"]());
  }, options);
}
export function requestCount(app: ElectronApplication, method: string) {
  return app.evaluate(
    (_, method) =>
      (globalThis as any).__heldRequests.calls.filter(
        (item: any) => item.method === method,
      ).length,
    method,
  );
}
