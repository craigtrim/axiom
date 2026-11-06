// craigtrim/axiom#208: large drafts retain JSON semantics without one giant IPC string.
import { expect, it, vi } from "vitest";
import {
  DOMAIN_JSON_FRAME,
  DomainJsonReceiver,
  DomainJsonSender,
} from "../../src/main/domain-json-transport";

const large = () => ({
  id: 41,
  args: { editorDrafts: { source: { text: 'text \"\n😀'.repeat(180000) } } },
});
const cloneWire = (packet: unknown) => JSON.parse(JSON.stringify(packet));
const nextTurn = () => new Promise<void>((resolve) => setImmediate(resolve));

async function frames(packet = large()) {
  const packets: any[] = [];
  const sender = new DomainJsonSender((value, complete) => {
    packets.push(cloneWire(value));
    queueMicrotask(() => complete(null));
  });
  await new Promise<void>((resolve, reject) =>
    sender.send(packet, (error) => (error ? reject(error) : resolve())),
  );
  return packets;
}

it("sends small packets directly and waits for each native write acknowledgment", () => {
  const callbacks: ((error: Error | null) => void)[] = [];
  const packets: unknown[] = [];
  const complete = vi.fn();
  const sender = new DomainJsonSender((packet, done) => {
    packets.push(cloneWire(packet));
    callbacks.push(done);
  });
  sender.send({ id: 1, method: "configureDataService" }, complete);
  expect(packets).toEqual([{ id: 1, method: "configureDataService" }]);
  expect(complete).not.toHaveBeenCalled();
  callbacks.shift()!(null);
  expect(complete).toHaveBeenCalledExactlyOnceWith(null);
});

it("round-trips captured large drafts using bounded JSON wire frames", async () => {
  const packet = large(),
    expected = packet.args.editorDrafts.source.text;
  const packets: any[] = [];
  const delivered: unknown[] = [];
  const errors = vi.fn();
  const receiver = new DomainJsonReceiver(
    (value) => delivered.push(value),
    errors,
  );
  const stringify = JSON.stringify;
  const spy = vi.spyOn(JSON, "stringify").mockImplementation(((
    value: unknown,
    ...args: any[]
  ) => {
    if (value === packet || (typeof value === "string" && value.length > 65536))
      throw Error("A whole large packet reached JSON.stringify.");
    return stringify(value, ...(args as [any, any]));
  }) as typeof JSON.stringify);
  try {
    const sender = new DomainJsonSender((value, complete) => {
      const encoded = JSON.stringify(value);
      expect(encoded.length).toBeLessThan(1024 * 1024);
      const frame = JSON.parse(encoded);
      packets.push(frame);
      queueMicrotask(() => {
        receiver.receive(frame);
        complete(null);
      });
    });
    const sent = new Promise<void>((resolve, reject) =>
      sender.send(packet, (error) => (error ? reject(error) : resolve())),
    );
    packet.args.editorDrafts.source.text = "Changed after capture";
    await sent;
    await vi.waitFor(() => expect(delivered).toHaveLength(1));
    expect(packets.length).toBeGreaterThan(1);
    expect(
      packets.every(
        (frame, index) =>
          frame.$axiomJson === DOMAIN_JSON_FRAME &&
          frame.index === index &&
          frame.text.length <= 65536,
      ),
    ).toBe(true);
    expect(packets.at(-1).last).toBe(true);
    expect(delivered).toEqual([
      { id: 41, args: { editorDrafts: { source: { text: expected } } } },
    ]);
    expect(errors).not.toHaveBeenCalled();
  } finally {
    spy.mockRestore();
    receiver.close();
  }
});

it("holds later normal packets behind frames and captures them before later mutations", async () => {
  const packets: any[] = [],
    callbacks: ((error: Error | null) => void)[] = [];
  const sender = new DomainJsonSender((packet, complete) => {
    packets.push(cloneWire(packet));
    callbacks.push(complete);
  });
  const first = vi.fn(),
    second = vi.fn();
  sender.send(large(), first);
  const normal = { id: 42, args: { label: "Original" } };
  sender.send(normal, second);
  normal.args.label = "Changed";
  expect(packets).toHaveLength(1);
  expect(first).not.toHaveBeenCalled();
  expect(second).not.toHaveBeenCalled();
  while (callbacks.length) {
    callbacks.shift()!(null);
    await Promise.resolve();
  }
  expect(first).toHaveBeenCalledExactlyOnceWith(null);
  expect(second).toHaveBeenCalledExactlyOnceWith(null);
  expect(packets.at(-1)).toEqual({ id: 42, args: { label: "Original" } });
  const delivered: any[] = [],
    errors = vi.fn();
  const receiver = new DomainJsonReceiver(
    (packet) => delivered.push(packet),
    errors,
  );
  for (const packet of packets) receiver.receive(packet);
  expect(delivered).toHaveLength(0);
  await vi.waitFor(() => expect(delivered).toHaveLength(2));
  expect(delivered.map((packet) => packet.id)).toEqual([41, 42]);
  expect(delivered[1].args.label).toBe("Original");
  expect(errors).not.toHaveBeenCalled();
});

it("rejects every queued send once after a partial native write failure", async () => {
  const callbacks: ((error: Error | null) => void)[] = [],
    wire = vi.fn((_packet: unknown, complete: (error: Error | null) => void) =>
      callbacks.push(complete),
    );
  const sender = new DomainJsonSender(wire),
    first = vi.fn(),
    second = vi.fn();
  sender.send(large(), first);
  sender.send({ id: 2 }, second);
  callbacks.shift()!(null);
  await Promise.resolve();
  expect(wire).toHaveBeenCalledTimes(2);
  const failed = callbacks.shift()!,
    error = Error("Native pipe failed");
  failed(error);
  failed(error);
  await nextTurn();
  expect(first).toHaveBeenCalledExactlyOnceWith(error);
  expect(second).toHaveBeenCalledExactlyOnceWith(error);
  expect(wire).toHaveBeenCalledTimes(2);
  const late = vi.fn();
  sender.send({ id: 3 }, late);
  expect(late).toHaveBeenCalledExactlyOnceWith(error);
});

it("reports synchronous write failures without leaving queued callbacks", () => {
  const error = Error("Disconnected");
  const sender = new DomainJsonSender(() => {
    throw error;
  });
  const complete = vi.fn();
  sender.send({ id: 1 }, complete);
  sender.close();
  expect(complete).toHaveBeenCalledExactlyOnceWith(error);
});

it("holds residual send errors until the owner reports its terminal exit", () => {
  let written!: (error: Error | null) => void;
  const sender = new DomainJsonSender((_packet, complete) => {
    written = complete;
  });
  const order: string[] = [];
  sender.send({ id: 1 }, () => order.push("send rejected"));
  sender.suspend();
  written(Error("Child exited"));
  expect(order).toEqual([]);
  order.push("exit");
  sender.close();
  expect(order).toEqual(["exit", "send rejected"]);
});

it("abandons a partial send and rejects queued callbacks when shutdown interrupts it", async () => {
  const packets: unknown[] = [],
    callbacks: ((error: Error | null) => void)[] = [];
  const sender = new DomainJsonSender((packet, complete) => {
    packets.push(cloneWire(packet));
    callbacks.push(complete);
  });
  const first = vi.fn(),
    second = vi.fn();
  sender.send(large(), first);
  sender.send({ id: 2 }, second);
  const stopping = Error("Stopping");
  sender.close(stopping);
  callbacks.shift()!(null);
  await nextTurn();
  expect(packets).toHaveLength(1);
  expect(first).toHaveBeenCalledExactlyOnceWith(stopping);
  expect(second).toHaveBeenCalledExactlyOnceWith(stopping);
  const received = vi.fn(),
    failed = vi.fn();
  const receiver = new DomainJsonReceiver(received, failed);
  receiver.receive(packets[0]);
  // The worker intercepts its bounded control packet before parsing queued data.
  receiver.close();
  expect(received).not.toHaveBeenCalled();
  expect(failed).not.toHaveBeenCalled();
});

it.each(["index", "correlation", "marker", "size"])(
  "rejects malformed %s frames and drops the partial packet",
  async (fault) => {
    const packets = await frames(),
      delivered = vi.fn(),
      errors = vi.fn();
    const receiver = new DomainJsonReceiver(delivered, errors);
    receiver.receive(packets[0]);
    const bad = { ...packets[1] };
    if (fault === "index") bad.index++;
    if (fault === "correlation")
      bad.id = "00000000-0000-4000-8000-000000000000";
    if (fault === "marker") bad.$axiomJson = "unknown-version";
    if (fault === "size") bad.text = "x".repeat(65537);
    receiver.receive(bad);
    receiver.receive({ id: 2 });
    await nextTurn();
    expect(errors).toHaveBeenCalledOnce();
    expect(delivered).not.toHaveBeenCalled();
  },
);

it("discards partial and asynchronously parsing packets on close", async () => {
  const packets = await frames(),
    delivered = vi.fn(),
    errors = vi.fn();
  const partial = new DomainJsonReceiver(delivered, errors);
  partial.receive(packets[0]);
  partial.close();
  for (const packet of packets.slice(1)) partial.receive(packet);
  const parsing = new DomainJsonReceiver(delivered, errors);
  for (const packet of packets) parsing.receive(packet);
  parsing.receive({ id: 2 });
  parsing.close();
  await nextTurn();
  expect(delivered).not.toHaveBeenCalled();
  expect(errors).not.toHaveBeenCalled();
});

it("rejects truncated JSON after the final frame instead of delivering partial drafts", async () => {
  const packets = await frames(),
    delivered = vi.fn(),
    errors = vi.fn();
  const receiver = new DomainJsonReceiver(delivered, errors);
  receiver.receive({ ...packets[0], text: '{"unfinished":', last: true });
  await vi.waitFor(() => expect(errors).toHaveBeenCalledOnce());
  expect(delivered).not.toHaveBeenCalled();
});
