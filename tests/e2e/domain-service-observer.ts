// craigtrim/axiom#207: observe the real utility relay without a production test hook.
import type { ElectronApplication, Page } from "@playwright/test";

type Scalar = string | number | boolean | null;
export interface DomainReplyReceipt {
  id: number;
  method: string;
  args: Record<string, Scalar>;
  jobId?: number;
  startedJobId?: number;
  state?: string;
  scanned?: number;
  total?: number;
}

/** craigtrim/axiom#208: synchronize with one real reply without copying its payload. */
export async function observeDomainReply(
  app: ElectronApplication,
  page: Page,
  method: string,
  matchArgs: Record<string, Scalar> = {},
  options: { jobCompletion?: boolean } = {},
) {
  if (options.jobCompletion && method !== "qualityStart")
    throw Error("Job completion observation requires qualityStart.");
  const observed = await app.evaluate(
    () => !!(globalThis as any).__domainServiceObserver?.utility,
  );
  if (!observed) await observeDomainService(app, page);
  const observation = await app.evaluateHandle(
    (_, { method, matchArgs, jobCompletion }) => {
      const owner = (globalThis as any).__domainServiceObserver,
        utility = owner.utility;
      let requestId: number | undefined;
      let startedJobId: number | undefined;
      const pending = new Map<
        number,
        {
          method: string;
          args: Record<string, string | number | boolean | null>;
        }
      >();
      let finished = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let resolve!: (receipt: DomainReplyReceipt) => void;
      let reject!: (error: Error) => void;
      const done = new Promise<DomainReplyReceipt>((yes, no) => {
        resolve = yes;
        reject = no;
      });
      // The operation may finish before the test reaches wait(). Keep its rejection.
      void done.catch(() => {});
      const beforeRequest: any = (packet: any) => {
        beforeRequest.previous?.(packet);
        if (!Number.isSafeInteger(packet.id)) return;
        const args = packet.args ?? {};
        const start =
          requestId === undefined &&
          packet.method === method &&
          Object.entries(matchArgs).every(([key, value]) =>
            Object.is(args[key], value),
          );
        const status =
          jobCompletion &&
          startedJobId !== undefined &&
          packet.method === "qualityStatus" &&
          args.id === startedJobId;
        if (!start && !status) return;
        if (start) requestId = packet.id;
        const selected: Record<string, string | number | boolean | null> = {};
        for (const key of new Set(["id", ...Object.keys(matchArgs)])) {
          const value = args[key];
          if (
            value === null ||
            ["string", "number", "boolean"].includes(typeof value)
          )
            selected[key] = value;
        }
        pending.set(packet.id, { method: packet.method, args: selected });
      };
      beforeRequest.previous = owner.beforeRequest;
      beforeRequest.replyObserver = true;
      const cleanup = () => {
        pending.clear();
        if (timer) clearTimeout(timer);
        utility.off("message", onMessage);
        utility.off("exit", onExit);
        if (owner.beforeRequest === beforeRequest)
          owner.beforeRequest = beforeRequest.previous;
        else {
          // Remove this hook without disturbing a later, overlapping observer.
          let current = owner.beforeRequest;
          while (current?.replyObserver) {
            if (current.previous === beforeRequest) {
              current.previous = beforeRequest.previous;
              break;
            }
            current = current.previous;
          }
        }
      };
      const settle = (error?: Error, receipt?: DomainReplyReceipt) => {
        if (finished) return;
        finished = true;
        cleanup();
        if (error) reject(error);
        else resolve(receipt!);
      };
      const onMessage = (message: any) => {
        if (
          message?.channel !== "axiom-domain-v1" ||
          message.type !== "packet" ||
          !pending.has(message.packet?.id)
        )
          return;
        const packet = message.packet;
        const request = pending.get(packet.id)!;
        pending.delete(packet.id);
        if (packet.error) {
          settle(Error(String(packet.error)));
          return;
        }
        const value = packet.value;
        const receipt: DomainReplyReceipt = {
          id: packet.id,
          method: request.method,
          args: request.args,
        };
        if (typeof value?.id === "number") receipt.jobId = value.id;
        if (typeof value?.state === "string") receipt.state = value.state;
        if (typeof value?.scanned === "number") receipt.scanned = value.scanned;
        if (typeof value?.total === "number") receipt.total = value.total;
        if (jobCompletion) {
          if (request.method === "qualityStart") {
            if (!Number.isSafeInteger(receipt.jobId) || receipt.jobId! <= 0) {
              settle(
                Error("The observed quality scan did not return a job ID."),
              );
              return;
            }
            startedJobId = receipt.jobId;
          }
          if (receipt.jobId !== startedJobId) {
            settle(
              Error("The observed quality reply belongs to a different job."),
            );
            return;
          }
          if (receipt.state === "running") return;
          if (
            !["complete", "failed", "canceled"].includes(receipt.state ?? "")
          ) {
            settle(
              Error("The observed quality reply has an invalid job state."),
            );
            return;
          }
          receipt.startedJobId = startedJobId;
        }
        settle(undefined, receipt);
      };
      const onExit = () =>
        settle(
          Error(
            "The data service exited before the observed " + method + " reply.",
          ),
        );
      owner.beforeRequest = beforeRequest;
      utility.on("message", onMessage);
      utility.once("exit", onExit);
      timer = setTimeout(
        () =>
          settle(
            Error(
              "The observed " +
                method +
                " operation did not finish within 30 seconds.",
            ),
          ),
        30000,
      );
      timer.unref();
      return {
        done,
        dispose: () => settle(Error("The domain reply observer was disposed.")),
      };
    },
    { method, matchArgs, jobCompletion: options.jobCompletion === true },
  );
  let disposed = false;
  const dispose = async () => {
    if (disposed) return;
    disposed = true;
    try {
      await observation.evaluate((value) => value.dispose());
    } finally {
      await observation.dispose();
    }
  };
  return {
    async wait(): Promise<DomainReplyReceipt> {
      try {
        return await observation.evaluate((value) => value.done);
      } finally {
        await dispose();
      }
    },
    dispose,
  };
}

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
      const envelope = (args as unknown[])[0] as
        { channel?: string } | undefined;
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
