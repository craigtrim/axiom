// craigtrim/axiom#188: write PNG, TIFF and BMP band by band, so no whole image is ever held in memory.
import { open, type FileHandle } from "node:fs/promises";
import { finished } from "node:stream/promises";
import { once } from "node:events";
import { createDeflate, crc32 } from "node:zlib";
import {
  bmpBytes,
  bmpStride,
  rowStreamBytes,
  tiffLayout,
} from "../shared/raster-layout";
export interface StreamWriter {
  write(chunk: Uint8Array): Promise<void>;
  finish(): Promise<void>;
  abort(): Promise<void>;
}
type Writable = Pick<FileHandle, "write">;
/** A write can land fewer bytes than asked for, so keep going until all of them are down. */
export async function writeAll(
  fh: Writable,
  bytes: Uint8Array,
  position?: number,
) {
  for (let done = 0; done < bytes.length;) {
    const { bytesWritten } = await fh.write(
      bytes,
      done,
      bytes.length - done,
      position === undefined ? null : position + done,
    );
    if (bytesWritten <= 0)
      throw Error("The export file stopped accepting data.");
    done += bytesWritten;
  }
}
/** Opens the file and runs the header step, closing the file if that step fails. */
async function openWith(
  file: string,
  start: (fh: FileHandle) => Promise<void>,
) {
  const fh = await open(file, "w");
  try {
    await start(fh);
  } catch (e) {
    await fh.close().catch(() => undefined);
    throw e;
  }
  return fh;
}
/** Counts a row stream's bytes exactly, past 2^53 too, and refuses more than the image holds. */
function tally(expected: bigint) {
  let received = 0n;
  return {
    add(bytes: number) {
      const start = received;
      received += BigInt(bytes);
      if (received > expected)
        throw Error("The export sent more rows than the image holds.");
      return start;
    },
    check() {
      if (received !== expected)
        throw Error("The export ended before every row arrived.");
    },
  };
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
/** Rows arrive led by their PNG filter byte; the writer deflates them into IDAT chunks. */
export async function pngWriter(
  file: string,
  width: number,
  height: number,
): Promise<StreamWriter> {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const fh = await openWith(file, (fh) =>
      writeAll(fh, Buffer.concat([signature, pngChunk("IHDR", header)])),
    ),
    count = tally(BigInt(rowStreamBytes("png", width)) * BigInt(height)),
    deflate = createDeflate({ level: 6, chunkSize: 1 << 20 });
  let written = Promise.resolve();
  deflate.on("data", (data: Buffer) => {
    written = written.then(() => writeAll(fh, pngChunk("IDAT", data)));
    // The caller awaits `written`; this keeps a failed write from surfacing as an unhandled rejection meanwhile.
    written.catch(() => undefined);
  });
  const ended = finished(deflate);
  ended.catch(() => undefined);
  return {
    async write(bytes) {
      count.add(bytes.length);
      if (!deflate.write(bytes)) await once(deflate, "drain");
      await written;
    },
    async finish() {
      count.check();
      deflate.end();
      await ended;
      await written;
      await writeAll(fh, pngChunk("IEND", new Uint8Array(0)));
      await fh.close();
    },
    async abort() {
      deflate.destroy();
      await written.catch(() => undefined);
      await fh.close().catch(() => undefined);
    },
  };
}
/** Offsets and byte counts are exact bigints, so BigTIFF stays correct past 2^53 bytes. */
export function tiffHeader(
  width: number,
  height: number,
  classicLimit?: number,
) {
  const t = tiffLayout(width, height, classicLimit),
    row = BigInt(width) * 4n,
    head = Buffer.alloc(t.dataOffset),
    word = t.big ? 8 : 4,
    arrays = t.header + t.ifd + t.extra,
    offset = (i: number) =>
      BigInt(t.dataOffset) + BigInt(i) * BigInt(t.rowsPerStrip) * row,
    count = (i: number) =>
      BigInt(Math.min(t.rowsPerStrip, height - i * t.rowsPerStrip)) * row;
  const put = (at: number, value: number | bigint, bytes: number) =>
    bytes === 8
      ? head.writeBigUInt64LE(BigInt(value), at)
      : bytes === 4
        ? head.writeUInt32LE(Number(value), at)
        : head.writeUInt16LE(Number(value), at);
  head.write("II", 0, "latin1");
  if (t.big) {
    put(2, 43, 2);
    put(4, 8, 2);
    put(8, t.header, 8);
  } else {
    put(2, 42, 2);
    put(4, t.header, 4);
  }
  if (t.strips > 1)
    for (let i = 0; i < t.strips; i++) {
      put(arrays + i * word, offset(i), word);
      put(arrays + (t.strips + i) * word, count(i), word);
    }
  // [tag, type, count, inline values or an offset]; types: 3 SHORT, 4 LONG, 5 RATIONAL, 16 LONG8.
  const long = t.big ? 16 : 4,
    extra = t.header + t.ifd,
    entries: [number, number, number, (number | bigint)[] | number][] = [
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
/** RGBA arrives top to bottom and goes to the file unchanged. */
export async function tiffWriter(
  file: string,
  width: number,
  height: number,
  classicLimit?: number,
): Promise<StreamWriter> {
  const fh = await openWith(file, (fh) =>
      writeAll(fh, tiffHeader(width, height, classicLimit)),
    ),
    count = tally(BigInt(width) * 4n * BigInt(height));
  return {
    async write(bytes) {
      count.add(bytes.length);
      await writeAll(fh, bytes);
    },
    async finish() {
      count.check();
      await fh.close();
    },
    async abort() {
      await fh.close().catch(() => undefined);
    },
  };
}
/** Padded BGR rows arrive top to bottom; each lands where BMP's bottom-up order puts it. */
export async function bmpWriter(
  file: string,
  width: number,
  height: number,
): Promise<StreamWriter> {
  const stride = bmpStride(width),
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
  const fh = await openWith(file, async (fh) => {
      await writeAll(fh, header, 0);
      await fh.truncate(size);
    }),
    count = tally(BigInt(stride) * BigInt(height));
  return {
    async write(bytes) {
      // BMP files stay under 4 GB, so the position fits a number.
      let from = Number(count.add(bytes.length));
      for (let done = 0; done < bytes.length;) {
        const row = Math.floor(from / stride),
          offset = from % stride,
          piece = Math.min(stride - offset, bytes.length - done);
        await writeAll(
          fh,
          bytes.subarray(done, done + piece),
          54 + (height - 1 - row) * stride + offset,
        );
        done += piece;
        from += piece;
      }
    },
    async finish() {
      count.check();
      await fh.close();
    },
    async abort() {
      await fh.close().catch(() => undefined);
    },
  };
}
/** Finished file bytes, appended in order, up to `limit`. */
export async function byteWriter(
  file: string,
  limit: number,
): Promise<StreamWriter> {
  const fh = await open(file, "w");
  let received = 0;
  return {
    async write(bytes) {
      received += bytes.length;
      if (received > limit)
        throw Error("The export sent more data than allowed.");
      await writeAll(fh, bytes);
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
