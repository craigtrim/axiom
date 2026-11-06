// craigtrim/axiom#207: the application wire preserves position bytes without a V8 format dependency.
import { expect, it } from "vitest";
import {
  decodeDomainPacket,
  encodeDomainPacket,
} from "../../src/main/domain-wire";
import { MAX_VISIBLE_NODES } from "../../src/shared/graph-limits";

const frame = (positions: Float64Array) => ({
  event: {
    type: "positions",
    data: { graphId: "graph:main", revision: 4, alpha: 0.1, positions },
  },
});

it("preserves the exact bytes of a position subarray through JSON", () => {
  const storage = new Float64Array([
    77,
    0,
    -0,
    Number.NaN,
    Infinity,
    1.25,
    -9.5,
    88,
  ]);
  const positions = storage.subarray(1, 7);
  const source = frame(positions);
  const wire = JSON.parse(JSON.stringify(encodeDomainPacket(source)));
  expect(wire.event.data.positionsEncoding).toBe("float64-base64-v1");
  expect(wire.event.data.positionsLength).toBe(6);
  const result = decodeDomainPacket(wire) as ReturnType<typeof frame>;
  expect(result.event.data.positions).toBeInstanceOf(Float64Array);
  expect(Buffer.from(result.event.data.positions.buffer)).toEqual(
    Buffer.from(positions.buffer, positions.byteOffset, positions.byteLength),
  );
  expect(result.event.data).toEqual({
    graphId: "graph:main",
    revision: 4,
    alpha: 0.1,
    positions,
  });
  expect(result.event.data).not.toHaveProperty("positionsEncoding");
  expect(source.event.data.positions).toBe(positions);
});

it("leaves ordinary request, reply and catalog packets untouched", () => {
  for (const packet of [
    { id: 1, method: "select", args: { iri: "urn:entity" } },
    { id: 2, value: { entities: [{ iri: "urn:entity", label: "Name" }] } },
    { event: { type: "state", data: { entities: [{ iri: "urn:entity" }] } } },
    {
      id: 3,
      value: { positionsEncoding: "float64-base64-v1", positions: "AA==" },
    },
  ]) {
    expect(encodeDomainPacket(packet)).toBe(packet);
    expect(decodeDomainPacket(packet)).toBe(packet);
  }
});

it("accepts empty frames and rejects invalid byte counts, markers and excessive frames", () => {
  const empty = decodeDomainPacket(
    JSON.parse(JSON.stringify(encodeDomainPacket(frame(new Float64Array())))),
  ) as ReturnType<typeof frame>;
  expect(empty.event.data.positions.length).toBe(0);
  const valid = JSON.parse(
    JSON.stringify(encodeDomainPacket(frame(new Float64Array([1, 2])))),
  );
  for (const patch of [
    { positionsEncoding: "future-version" },
    { positionsLength: 1 },
    { positionsLength: -2 },
    { positionsLength: 4 },
    { positionsLength: MAX_VISIBLE_NODES * 2 + 2 },
    { positions: "not base64" },
    { positions: valid.event.data.positions + "=" },
    { positions: "A".repeat(4 * Math.ceil((MAX_VISIBLE_NODES * 16) / 3) + 4) },
  ]) {
    expect(() =>
      decodeDomainPacket({
        event: { ...valid.event, data: { ...valid.event.data, ...patch } },
      }),
    ).toThrow();
  }
  expect(() => encodeDomainPacket(frame(new Float64Array(3)))).toThrow();
  expect(() =>
    encodeDomainPacket(frame(new Float64Array(MAX_VISIBLE_NODES * 2 + 2))),
  ).toThrow();
});
