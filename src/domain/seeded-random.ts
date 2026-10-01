import { createHash } from "node:crypto";
/** Stable per-entity sampling; explicit random injection remains available to tests. */
export function entityRandom(iri: string) {
  let seed = createHash("md5").update(iri, "utf8").digest().readUInt32LE(0);
  return () => {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
