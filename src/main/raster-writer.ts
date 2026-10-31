// craigtrim/axiom#188: write PNG, TIFF and BMP band by band, so no whole image is ever held in memory.
import { open } from "node:fs/promises";
import { finished } from "node:stream/promises";
import { once } from "node:events";
import { createDeflate, crc32 } from "node:zlib";
import { bmpBytes, bmpStride, tiffLayout } from "../shared/raster-layout";
export interface StreamWriter {
  write(chunk: Uint8Array): Promise<void>;
  finish(): Promise<void>;
  abort(): Promise<void>;
}
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
function pngChunk(type: string, data: Uint8Array) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "latin1");
  out.set(data, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
/** Rows arrive with their PNG filter byte; the writer deflates them into IDAT chunks. */
export async function pngWriter(
  file: string,
  width: number,
  height: number,
): Promise<StreamWriter> {
  const fh = await open(file, "w"),
    rowBytes = 1 + width * 4,
    expected = rowBytes * height,
    header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  await fh.write(Buffer.concat([signature, pngChunk("IHDR", header)]));
  const deflate = createDeflate({ level: 6, chunkSize: 1 << 20 });
  let received = 0,
    written = Promise.resolve();
  deflate.on("data", (data: Buffer) => {
    written = written.then(async () => {
      await fh.write(pngChunk("IDAT", data));
    });
    // The caller awaits `written`; this keeps a failed write from surfacing as an unhandled rejection meanwhile.
    written.catch(() => undefined);
  });
  const ended = finished(deflate);
  ended.catch(() => undefined);
  return {
    async write(rows) {
      if (rows.length % rowBytes)
        throw Error("A PNG band must hold whole rows.");
      received += rows.length;
      if (received > expected)
        throw Error("The export sent more rows than the image holds.");
      if (!deflate.write(rows)) await once(deflate, "drain");
      await written;
    },
    async finish() {
      if (received !== expected)
        throw Error("The export ended before every row arrived.");
      deflate.end();
      await ended;
      await written;
      await fh.write(pngChunk("IEND", new Uint8Array(0)));
      await fh.close();
    },
    async abort() {
      deflate.destroy();
      await written.catch(() => undefined);
      await fh.close().catch(() => undefined);
    },
  };
}
function tiffHeader(width: number, height: number, classicLimit?: number) {
  const t = tiffLayout(width, height, classicLimit),
    row = width * 4,
    head = Buffer.alloc(t.dataOffset),
    word = t.big ? 8 : 4,
    arrays = t.header + t.ifd + t.extra,
    offset = (i: number) => t.dataOffset + i * t.rowsPerStrip * row,
    count = (i: number) =>
      Math.min(t.rowsPerStrip, height - i * t.rowsPerStrip) * row;
  const put = (at: number, value: number, bytes: number) =>
    bytes === 8
      ? head.writeBigUInt64LE(BigInt(value), at)
      : bytes === 4
        ? head.writeUInt32LE(value, at)
        : head.writeUInt16LE(value, at);
  head.write("II", 0, "latin1");
  if (t.big) {
    put(2, 43, 2);
    put(4, 8, 2);
    put(8, t.header, 8);
  } else {
    put(2, 42, 2);
    put(4, t.header, 4);
  }
  for (let i = 0; i < t.strips; i++) {
    if (t.strips === 1) break;
    put(arrays + i * word, offset(i), word);
    put(arrays + (t.strips + i) * word, count(i), word);
  }
  // [tag, type, count, inline values or an offset]; types: 3 SHORT, 4 LONG, 5 RATIONAL, 16 LONG8.
  const long = t.big ? 16 : 4,
    extra = t.header + t.ifd,
    entries: [number, number, number, number[] | number][] = [
      [256, 4, 1, [width]],
      [257, 4, 1, [height]],
      [258, 3, 4, t.big ? [8, 8, 8, 8] : extra],
      [259, 3, 1, [1]],
      [262, 3, 1, [2]],
      [273, long, t.strips, t.strips === 1 ? [offset(0)] : arrays],
      [277, 3, 1, [4]],
      [278, 4, 1, [t.rowsPerStrip]],
      [
        279,
        long,
        t.strips,
        t.strips === 1 ? [count(0)] : arrays + t.strips * word,
      ],
      [282, 5, 1, t.big ? [72, 1] : extra + 8],
      [283, 5, 1, t.big ? [72, 1] : extra + 16],
      [284, 3, 1, [1]],
      [296, 3, 1, [2]],
      // Canvas pixels are unassociated (not premultiplied) alpha.
      [338, 3, 1, [2]],
    ];
  if (!t.big) {
    [8, 8, 8, 8].forEach((v, i) => put(extra + i * 2, v, 2));
    put(extra + 8, 72, 4);
    put(extra + 12, 1, 4);
    put(extra + 16, 72, 4);
    put(extra + 20, 1, 4);
  }
  let at = t.header;
  put(at, entries.length, t.big ? 8 : 2);
  at += t.big ? 8 : 2;
  const size = (type: number) =>
    ({ 3: 2, 4: 4, 5: 4, 16: 8 })[type as 3 | 4 | 5 | 16];
  for (const [tag, type, n, value] of entries) {
    put(at, tag, 2);
    put(at + 2, type, 2);
    put(at + 4, n, t.big ? 8 : 4);
    const field = at + (t.big ? 12 : 8);
    if (Array.isArray(value))
      value.forEach((v, i) => put(field + i * size(type), v, size(type)));
    else put(field, value, word);
    at += t.big ? 20 : 12;
  }
  return head;
}
/** Rows arrive as RGBA, top to bottom, and go to the file unchanged. */
export async function tiffWriter(
  file: string,
  width: number,
  height: number,
  classicLimit?: number,
): Promise<StreamWriter> {
  const fh = await open(file, "w"),
    row = width * 4,
    expected = row * height;
  await fh.write(tiffHeader(width, height, classicLimit));
  let received = 0;
  return {
    async write(rows) {
      if (rows.length % row) throw Error("A TIFF band must hold whole rows.");
      received += rows.length;
      if (received > expected)
        throw Error("The export sent more rows than the image holds.");
      await fh.write(rows);
    },
    async finish() {
      if (received !== expected)
        throw Error("The export ended before every row arrived.");
      await fh.close();
    },
    async abort() {
      await fh.close().catch(() => undefined);
    },
  };
}
/** Each band arrives as padded BGR rows, bottom row first, and lands where BMP's bottom-up order puts it. */
export async function bmpWriter(
  file: string,
  width: number,
  height: number,
): Promise<StreamWriter> {
  const fh = await open(file, "w"),
    stride = bmpStride(width),
    size = bmpBytes(width, height),
    header = Buffer.alloc(54);
  header.write("BM", 0, "latin1");
  header.writeUInt32LE(size, 2);
  header.writeUInt32LE(54, 10);
  header.writeUInt32LE(40, 14);
  header.writeInt32LE(width, 18);
  header.writeInt32LE(height, 22);
  header.writeUInt16LE(1, 26);
  header.writeUInt16LE(24, 28);
  header.writeUInt32LE(stride * height, 34);
  await fh.write(header, 0, 54, 0);
  await fh.truncate(size);
  let rows = 0;
  return {
    async write(block) {
      if (block.length % stride)
        throw Error("A BMP band must hold whole rows.");
      const n = block.length / stride;
      if (rows + n > height)
        throw Error("The export sent more rows than the image holds.");
      await fh.write(block, 0, block.length, 54 + (height - rows - n) * stride);
      rows += n;
    },
    async finish() {
      if (rows !== height)
        throw Error("The export ended before every row arrived.");
      await fh.close();
    },
    async abort() {
      await fh.close().catch(() => undefined);
    },
  };
}
/** Finished file bytes, appended in order. */
export async function byteWriter(file: string): Promise<StreamWriter> {
  const fh = await open(file, "w");
  let received = 0;
  return {
    async write(bytes) {
      received += bytes.length;
      await fh.write(bytes);
    },
    async finish() {
      if (!received) throw Error("The export produced no data.");
      await fh.close();
    },
    async abort() {
      await fh.close().catch(() => undefined);
    },
  };
}
