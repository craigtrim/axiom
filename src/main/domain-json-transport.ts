// craigtrim/axiom#208: JSON IPC carries bounded frames across different V8 runtimes.
import { randomUUID } from "node:crypto";
import { encodeJson, readJsonChunks, type JsonChunks } from "./json-io";

export const DOMAIN_JSON_FRAME = "axiom-json-frame-v1";
const chunkSize = 64 * 1024;
const directLimit = 1024 * 1024;
type Completion = (error: Error | null) => void;
type WireSend = (packet: unknown, complete: Completion) => void;
interface Transmission {
  direct?: unknown;
  chunks?: JsonChunks;
  id?: string;
  index: number;
  complete: Completion;
}

/** A conservative bound lets ordinary packets keep Node's immediate capture. */
function fitsDirect(packet: unknown) {
  let remaining = directLimit;
  const pending = [packet],
    seen = new Set<object>();
  while (pending.length) {
    const value = pending.pop();
    if (typeof value === "string") remaining -= value.length * 6 + 2;
    else if (typeof value === "number") remaining -= 32;
    else if (
      !value ||
      typeof value === "boolean" ||
      typeof value === "undefined"
    )
      remaining -= 5;
    else if (typeof value !== "object") return false;
    else {
      if (seen.has(value) || "toJSON" in value) return false;
      seen.add(value);
      if (Array.isArray(value)) {
        remaining -= value.length + 2;
        if (remaining < 0) return false;
        for (const item of value) pending.push(item);
      } else {
        const prototype = Object.getPrototypeOf(value);
        if (prototype !== null && prototype !== Object.prototype) return false;
        remaining -= 2;
        for (const key of Object.keys(value)) {
          remaining -= key.length * 6 + 4;
          if (remaining < 0) return false;
          pending.push((value as Record<string, unknown>)[key]);
        }
      }
    }
    if (remaining < 0) return false;
  }
  return true;
}

export class DomainJsonSender {
  private queue: Transmission[] = [];
  private waiting = false;
  private closed?: Error;
  private suspended = false;
  constructor(private sendWire: WireSend) {}

  send(packet: unknown, complete: Completion = () => {}) {
    if (this.closed || this.suspended) {
      complete(this.closed ?? Error("The JSON pipe has stopped."));
      return;
    }
    let item: Transmission;
    try {
      if (!this.queue.length && !this.waiting && fitsDirect(packet))
        item = { direct: packet, index: 0, complete };
      else {
        // Capture now, including normal packets waiting behind another send.
        const chunks = encodeJson(packet, chunkSize);
        let length = 0;
        for (const chunk of chunks) length += chunk.length;
        item =
          length <= directLimit
            ? { direct: JSON.parse(chunks.join("")), index: 0, complete }
            : { chunks, id: randomUUID(), index: 0, complete };
      }
    } catch (error) {
      complete(error instanceof Error ? error : Error(String(error)));
      return;
    }
    this.queue.push(item);
    this.pump();
  }

  /** Hold residual callbacks until the owner has reported the terminal exit. */
  suspend() {
    this.suspended = true;
  }

  close(error = Error("The JSON pipe has stopped.")) {
    if (this.closed) return;
    this.closed = error;
    const pending = this.queue;
    this.queue = [];
    this.waiting = false;
    for (const item of pending) {
      item.chunks = undefined;
      item.direct = undefined;
      item.complete(error);
    }
  }

  private pump() {
    if (this.closed || this.suspended || this.waiting || !this.queue.length)
      return;
    const item = this.queue[0];
    const last = !item.chunks || item.index === item.chunks.length - 1;
    const packet = item.chunks
      ? {
          $axiomJson: DOMAIN_JSON_FRAME,
          id: item.id,
          index: item.index,
          last,
          text: item.chunks[item.index],
        }
      : item.direct;
    this.waiting = true;
    let completed = false;
    const sent: Completion = (error) => {
      if (completed || this.closed) return;
      completed = true;
      if (this.suspended) return;
      this.waiting = false;
      if (error) {
        this.close(error);
        return;
      }
      if (last) {
        this.queue.shift();
        item.chunks = undefined;
        item.direct = undefined;
        item.complete(null);
      } else item.index++;
      queueMicrotask(() => this.pump());
    };
    try {
      this.sendWire(packet, sent);
    } catch (error) {
      sent(error instanceof Error ? error : Error(String(error)));
    }
  }
}

interface Assembly {
  id: string;
  chunks: string[];
}
type Delivery = { chunks: string[] } | { packet: unknown };
export class DomainJsonReceiver {
  private partial?: Assembly;
  private deliveries: Delivery[] = [];
  private draining = false;
  private closed = false;
  constructor(
    private deliver: (packet: unknown) => void,
    private failed: (error: Error) => void,
  ) {}

  receive(packet: unknown) {
    if (this.closed) return;
    try {
      if (
        packet &&
        typeof packet === "object" &&
        Object.hasOwn(packet, "$axiomJson")
      ) {
        const frame = packet as Record<string, unknown>;
        if (
          frame.$axiomJson !== DOMAIN_JSON_FRAME ||
          typeof frame.id !== "string" ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            frame.id,
          ) ||
          !Number.isSafeInteger(frame.index) ||
          (frame.index as number) < 0 ||
          typeof frame.last !== "boolean" ||
          typeof frame.text !== "string" ||
          frame.text.length > chunkSize
        )
          throw Error("Invalid JSON pipe frame.");
        this.partial ??= { id: frame.id, chunks: [] };
        if (
          this.partial.id !== frame.id ||
          frame.index !== this.partial.chunks.length
        )
          throw Error("Out-of-order JSON pipe frame.");
        this.partial.chunks.push(frame.text);
        if (frame.last) {
          this.deliveries.push({ chunks: this.partial.chunks });
          this.partial = undefined;
        }
      } else {
        if (this.partial) throw Error("Incomplete JSON pipe packet.");
        this.deliveries.push({ packet });
      }
      void this.drain();
    } catch (error) {
      this.close();
      this.failed(error instanceof Error ? error : Error(String(error)));
    }
  }

  close() {
    this.closed = true;
    this.partial = undefined;
    this.deliveries = [];
  }

  private async drain() {
    if (this.draining || this.closed) return;
    this.draining = true;
    try {
      while (this.deliveries.length && !this.closed) {
        const item = this.deliveries.shift()!;
        const packet =
          "chunks" in item
            ? await readJsonChunks(this.chunks(item.chunks))
            : item.packet;
        if (!this.closed) this.deliver(packet);
      }
    } catch (error) {
      if (!this.closed) {
        this.close();
        this.failed(error instanceof Error ? error : Error(String(error)));
      }
    } finally {
      this.draining = false;
    }
  }

  private *chunks(chunks: string[]) {
    for (const chunk of chunks) {
      if (this.closed) return;
      yield chunk;
    }
  }
}
