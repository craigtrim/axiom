// craigtrim/axiom#207: JSON keeps the wire independent of either runtime's V8 version.
import { MAX_VISIBLE_NODES } from "../shared/graph-limits";

const encoding = "float64-base64-v1";
const maxLength = MAX_VISIBLE_NODES * 2;
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

function positionsPacket(packet: unknown) {
  if (
    !object(packet) ||
    !object(packet.event) ||
    packet.event.type !== "positions"
  )
    return undefined;
  if (!object(packet.event.data))
    throw Error("Invalid layout positions packet.");
  return { packet, event: packet.event, data: packet.event.data };
}

/** Regular application packets are JSON values; only layout frames contain a typed array. */
export function encodeDomainPacket(packet: unknown): unknown {
  const frame = positionsPacket(packet);
  if (!frame) return packet;
  const positions = frame.data.positions;
  if (
    !(positions instanceof Float64Array) ||
    positions.length > maxLength ||
    positions.length % 2
  )
    throw Error("Invalid layout positions array.");
  return {
    ...frame.packet,
    event: {
      ...frame.event,
      data: {
        ...frame.data,
        positions: Buffer.from(
          positions.buffer,
          positions.byteOffset,
          positions.byteLength,
        ).toString("base64"),
        positionsEncoding: encoding,
        positionsLength: positions.length,
      },
    },
  };
}

export function decodeDomainPacket(packet: unknown): unknown {
  const frame = positionsPacket(packet);
  if (!frame) return packet;
  const { positions, positionsEncoding, positionsLength, ...rest } = frame.data;
  if (
    positionsEncoding !== encoding ||
    typeof positions !== "string" ||
    !Number.isSafeInteger(positionsLength) ||
    (positionsLength as number) < 0 ||
    (positionsLength as number) > maxLength ||
    (positionsLength as number) % 2 !== 0 ||
    positions.length > 4 * Math.ceil((maxLength * 8) / 3)
  )
    throw Error("Invalid encoded layout positions.");
  const bytes = Buffer.from(positions, "base64");
  if (
    bytes.length !== (positionsLength as number) * 8 ||
    bytes.toString("base64") !== positions
  )
    throw Error("Invalid layout positions bytes.");
  // Both processes run on the same Windows x64 machine and share byte order.
  const values = new Float64Array(positionsLength as number);
  Buffer.from(values.buffer).set(bytes);
  return {
    ...frame.packet,
    event: { ...frame.event, data: { ...rest, positions: values } },
  };
}
