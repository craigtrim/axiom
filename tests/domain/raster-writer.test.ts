// craigtrim/axiom#188: the streaming writers produce files that decode back to the rows they were given.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { crc32, inflateSync } from "node:zlib";
import UTIF from "utif";
import {
  bmpWriter,
  byteWriter,
  pngWriter,
  tiffHeader,
  tiffWriter,
  writeAll,
} from "../../src/main/raster-writer";
import {
  bandRows,
  bigTiffNote,
  bmpBytes,
  bmpStride,
  clipboardLimit,
  encodeRows,
  encodeSegment,
  fitsCanvas,
  formatCeiling,
  MAX_BYTE_STREAM,
  MAX_TIFF_STRIPS,
  sendsRows,
  tiffLayout,
  tileColumns,
} from "../../src/shared/raster-layout";
let directory: string,
  next = 0;
beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "axiom-raster-"));
});
afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});
/** A temp file as openExportStream makes one: created empty before a writer opens it. */
const file = (ext: string) => {
  const target = path.join(directory, "image-" + ++next + ext);
  writeFileSync(target, "");
  return target;
};
/** Deterministic RGBA pixels with varied alpha. */
function pixels(width: number, height: number) {
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < rgba.length; i++) rgba[i] = (i * 37 + (i >> 2)) & 255;
  return rgba;
}
const rows = (rgba: Uint8Array, width: number, from: number, to: number) =>
  rgba.subarray(from * width * 4, to * width * 4);

describe("raster layout", () => {
  it("knows Chromium's canvas ceilings", () => {
    expect(fitsCanvas(16384, 16384)).toBe(true);
    expect(fitsCanvas(16385, 16384)).toBe(false);
    expect(fitsCanvas(65535, 4096)).toBe(true);
    expect(fitsCanvas(65536, 1)).toBe(false);
    expect(fitsCanvas(14823, 16488)).toBe(true);
  });
  it("cuts wide images into canvas-sized columns and bounded bands", () => {
    for (const width of [1, 65535, 65536, 140000, 200001]) {
      const columns = tileColumns(width);
      expect(columns.reduce((sum, c) => sum + c.width, 0)).toBe(width);
      expect(columns.every((c) => c.width <= 65535)).toBe(true);
      expect(columns[0].x).toBe(0);
    }
    expect(bandRows(14823, 16488) * 14823).toBeLessThanOrEqual(16777216);
    expect(bandRows(20000000, 3)).toBe(1);
    expect(bandRows(10, 5)).toBe(5);
    // A narrow, tall image keeps each band inside the canvas side.
    expect(bandRows(200, 100000)).toBe(65535);
  });
  it("encodes a row the same whether it leaves whole or in column segments", () => {
    const width = 7,
      rgba = new Uint8ClampedArray(pixels(width, 1));
    for (const format of ["png", "tiff", "bmp"]) {
      const whole = encodeRows(format, rgba, width, 1),
        pieces = [
          encodeSegment(format, rgba.subarray(0, 12), 3, true, false, width),
          encodeSegment(format, rgba.subarray(12, 28), 4, false, true, width),
        ],
        joined = new Uint8Array(pieces.reduce((n, p) => n + p.length, 0));
      pieces.reduce((at, p) => (joined.set(p, at), at + p.length), 0);
      expect([...joined]).toEqual([...whole]);
    }
    expect(encodeRows("bmp", rgba, width, 1)).toHaveLength(bmpStride(width));
  });
  it("keeps writing until a short write has put every byte down", async () => {
    const landed: [number, number | null][] = [];
    await writeAll(
      {
        write: (async (
          bytes: Uint8Array,
          offset: number,
          length: number,
          position: number | null,
        ) => {
          const n = Math.min(length, 3);
          landed.push([offset, position]);
          return { bytesWritten: n, buffer: bytes };
        }) as never,
      },
      new Uint8Array(8),
      100,
    );
    expect(landed).toEqual([
      [0, 100],
      [3, 103],
      [6, 106],
    ]);
    await expect(
      writeAll(
        { write: (async () => ({ bytesWritten: 0 })) as never },
        new Uint8Array(1),
      ),
    ).rejects.toThrow("stopped accepting data");
  });
  it("names only the ceiling of the chosen format", () => {
    expect(formatCeiling("webp", 16383, 16383)).toBe("");
    expect(formatCeiling("webp", 16384, 10)).toBe(
      "WebP supports up to 16,383 pixels per side. Choose PNG to export this size.",
    );
    expect(formatCeiling("jpg", 65500, 4096)).toBe("");
    expect(formatCeiling("jpg", 65501, 10)).toBe(
      "JPEG supports up to 65,500 pixels per side. Choose PNG to export this size.",
    );
    expect(formatCeiling("jpg", 20000, 20000)).toBe(
      "JPEG supports up to 65,500 pixels per side. Axiom's JPEG encoder also requires the image to fit within 268,435,456 pixels. Choose PNG to export this size.",
    );
    expect(formatCeiling("bmp", 37000, 38000)).toBe("");
    expect(bmpBytes(37838, 37838)).toBeGreaterThan(4294967295);
    expect(formatCeiling("bmp", 37838, 37838)).toMatch(
      /^BMP files hold up to 4,294,967,295 bytes, and this image needs 4,295,\d{3},\d{3}\. Choose PNG to export this size\.$/,
    );
    expect(formatCeiling("clipboard", 16385, 16384)).toContain(
      "too large for the clipboard",
    );
    for (const format of ["png", "tiff", "svg"])
      expect(formatCeiling(format, 200000, 200000)).toBe("");
  });
  it("writes classic TIFF while offsets fit in 32 bits and BigTIFF beyond", () => {
    expect(tiffLayout(30000, 30000).big).toBe(false);
    expect(tiffLayout(32768, 32768).big).toBe(true);
    expect(bigTiffNote("tiff", 30000, 30000)).toBe("");
    expect(bigTiffNote("tiff", 32768, 32768)).toContain("BigTIFF");
    expect(bigTiffNote("png", 32768, 32768)).toBe("");
  });
  it("keeps TIFF strip arrays bounded and BigTIFF offsets exact past 2^53 bytes", () => {
    const huge = tiffLayout(300000, 300000000);
    expect(huge.big).toBe(true);
    expect(huge.strips).toBeLessThanOrEqual(MAX_TIFF_STRIPS);
    expect(huge.dataOffset).toBeLessThan(17 * 1048576);
    const width = 1599999999,
      height = 6000000,
      t = tiffLayout(width, height),
      head = tiffHeader(width, height),
      arrays = t.header + t.ifd + t.extra,
      last = t.strips - 1,
      exact =
        BigInt(t.dataOffset) +
        BigInt(last) * BigInt(t.rowsPerStrip) * BigInt(width) * 4n;
    expect(exact).toBeGreaterThan(BigInt(Number.MAX_SAFE_INTEGER));
    expect(head.readBigUInt64LE(arrays + last * 8)).toBe(exact);
    expect(head.readBigUInt64LE(arrays + (t.strips + last) * 8)).toBe(
      BigInt(height - last * t.rowsPerStrip) * BigInt(width) * 4n,
    );
  });
  it("sizes the clipboard's byte limit from the declared image", () => {
    expect(clipboardLimit(1, 1)).toBeLessThan(1048576 + 16);
    expect(clipboardLimit(16384, 16384)).toBeGreaterThan(16384 * 16384 * 4);
    expect(clipboardLimit(65535, 65535)).toBe(MAX_BYTE_STREAM);
  });
  it("sends pixel rows for TIFF, BMP and PNG past the canvas", () => {
    expect(sendsRows("tiff", 10, 10)).toBe(true);
    expect(sendsRows("bmp", 10, 10)).toBe(true);
    expect(sendsRows("png", 16384, 16384)).toBe(false);
    expect(sendsRows("png", 16385, 16384)).toBe(true);
    expect(sendsRows("jpg", 16385, 16384)).toBe(false);
  });
});

function pngChunks(bytes: Buffer) {
  expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const chunks: { type: string; data: Buffer }[] = [];
  for (let at = 8; at < bytes.length;) {
    const length = bytes.readUInt32BE(at),
      type = bytes.toString("latin1", at + 4, at + 8),
      data = bytes.subarray(at + 8, at + 8 + length);
    expect(bytes.readUInt32BE(at + 8 + length)).toBe(
      crc32(bytes.subarray(at + 4, at + 8 + length)),
    );
    chunks.push({ type, data });
    at += 12 + length;
  }
  return chunks;
}
describe("PNG writer", () => {
  it("deflates rows that arrive in bands into a valid RGBA PNG", async () => {
    const width = 5,
      height = 4,
      rgba = pixels(width, height),
      target = file(".png"),
      png = await pngWriter(target, width, height),
      filtered = (from: number, to: number) => {
        const out = new Uint8Array((to - from) * (1 + width * 4));
        for (let y = from; y < to; y++)
          out.set(
            rows(rgba, width, y, y + 1),
            (y - from) * (1 + width * 4) + 1,
          );
        return out;
      };
    await png.write(filtered(0, 3));
    await png.write(filtered(3, 4));
    await png.finish();
    const chunks = pngChunks(await readFile(target));
    expect(chunks.map((c) => c.type)).toEqual(
      expect.arrayContaining(["IHDR", "IDAT", "IEND"]),
    );
    expect(chunks.at(-1)!.type).toBe("IEND");
    const ihdr = chunks[0].data;
    expect([
      ihdr.readUInt32BE(0),
      ihdr.readUInt32BE(4),
      ihdr[8],
      ihdr[9],
    ]).toEqual([width, height, 8, 6]);
    const raw = inflateSync(
      Buffer.concat(chunks.filter((c) => c.type === "IDAT").map((c) => c.data)),
    );
    expect(raw.equals(Buffer.from(filtered(0, height)))).toBe(true);
  });
  it("accepts chunks that split rows and refuses too much or too little", async () => {
    const width = 3,
      height = 2,
      rgba = pixels(width, height),
      stream = encodeRows("png", new Uint8ClampedArray(rgba), width, height),
      target = file(".png"),
      png = await pngWriter(target, width, height);
    for (const [from, to] of [
      [0, 5],
      [5, 17],
      [17, stream.length],
    ])
      await png.write(stream.subarray(from, to));
    await png.finish();
    const chunks = pngChunks(await readFile(target)),
      raw = inflateSync(
        Buffer.concat(
          chunks.filter((c) => c.type === "IDAT").map((c) => c.data),
        ),
      );
    expect(raw.equals(Buffer.from(stream))).toBe(true);
    const short = await pngWriter(file(".png"), 3, 2);
    await short.write(new Uint8Array(13));
    await expect(short.finish()).rejects.toThrow("before every row arrived");
    await short.abort();
    const long = await pngWriter(file(".png"), 3, 2);
    await expect(long.write(new Uint8Array(27))).rejects.toThrow(
      "more rows than the image holds",
    );
    await long.abort();
  });
});

function tiffPixels(bytes: Buffer) {
  const ifds = UTIF.decode(bytes);
  UTIF.decodeImage(bytes, ifds[0]);
  return {
    width: ifds[0].width,
    height: ifds[0].height,
    rgba: new Uint8Array(UTIF.toRGBA8(ifds[0])),
    ifd: ifds[0],
  };
}
describe("TIFF writer", () => {
  it("writes a classic single-strip TIFF that decodes to the same pixels", async () => {
    const width = 7,
      height = 5,
      rgba = pixels(width, height),
      target = file(".tiff"),
      tiff = await tiffWriter(target, width, height);
    await tiff.write(rows(rgba, width, 0, 2));
    await tiff.write(rows(rgba, width, 2, 5));
    await tiff.finish();
    const decoded = tiffPixels(await readFile(target));
    expect([decoded.width, decoded.height]).toEqual([width, height]);
    expect(decoded.ifd.t338).toEqual([2]);
    expect(Buffer.from(decoded.rgba).equals(Buffer.from(rgba))).toBe(true);
  });
  it("splits wide images into several strips", async () => {
    const width = 140000,
      height = 5,
      rgba = pixels(width, height),
      target = file(".tiff"),
      tiff = await tiffWriter(target, width, height);
    expect(tiffLayout(width, height).strips).toBe(5);
    await tiff.write(rows(rgba, width, 0, 3));
    await tiff.write(rows(rgba, width, 3, 5));
    await tiff.finish();
    const decoded = tiffPixels(await readFile(target));
    expect(decoded.ifd.t273).toHaveLength(5);
    expect(Buffer.from(decoded.rgba).equals(Buffer.from(rgba))).toBe(true);
  });
  it("switches to BigTIFF with 64-bit offsets past the classic limit", async () => {
    for (const height of [3, 900]) {
      const width = 400,
        rgba = pixels(width, height),
        target = file(".tiff"),
        tiff = await tiffWriter(target, width, height, 0);
      await tiff.write(rgba);
      await tiff.finish();
      const bytes = await readFile(target);
      expect(bytes.toString("latin1", 0, 2)).toBe("II");
      expect([bytes.readUInt16LE(2), bytes.readUInt16LE(4)]).toEqual([43, 8]);
      const ifd = Number(bytes.readBigUInt64LE(8)),
        count = Number(bytes.readBigUInt64LE(ifd)),
        entry = (tag: number) => {
          for (let i = 0; i < count; i++) {
            const at = ifd + 8 + i * 20;
            if (bytes.readUInt16LE(at) === tag)
              return {
                n: Number(bytes.readBigUInt64LE(at + 4)),
                at: at + 12,
              };
          }
          throw Error("Missing tag " + tag);
        },
        long8s = (tag: number) => {
          const e = entry(tag),
            from = e.n === 1 ? e.at : Number(bytes.readBigUInt64LE(e.at));
          return Array.from({ length: e.n }, (_, i) =>
            Number(bytes.readBigUInt64LE(from + i * 8)),
          );
        };
      expect(bytes.readUInt32LE(entry(256).at)).toBe(width);
      expect(bytes.readUInt32LE(entry(257).at)).toBe(height);
      const offsets = long8s(273),
        counts = long8s(279),
        data = Buffer.concat(
          offsets.map((o, i) => bytes.subarray(o, o + counts[i])),
        );
      expect(offsets.length).toBe(tiffLayout(width, height, 0).strips);
      expect(data.equals(Buffer.from(rgba))).toBe(true);
    }
  });
});

describe("BMP writer", () => {
  it("maps top-down rows, split anywhere, onto BMP's bottom-up rows", async () => {
    const width = 3,
      height = 4,
      stride = bmpStride(width),
      rgba = pixels(width, height),
      stream = encodeRows("bmp", new Uint8ClampedArray(rgba), width, height),
      target = file(".bmp"),
      bmp = await bmpWriter(target, width, height);
    expect(stream).toHaveLength(stride * height);
    for (const [from, to] of [
      [0, 7],
      [7, 30],
      [30, stream.length],
    ])
      await bmp.write(stream.subarray(from, to));
    await bmp.finish();
    const bytes = await readFile(target);
    expect(bytes.length).toBe(bmpBytes(width, height));
    expect(bytes.toString("latin1", 0, 2)).toBe("BM");
    expect([
      bytes.readUInt32LE(2),
      bytes.readUInt32LE(10),
      bytes.readInt32LE(18),
      bytes.readInt32LE(22),
      bytes.readUInt16LE(28),
    ]).toEqual([bytes.length, 54, width, height, 24]);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4,
          j = 54 + (height - 1 - y) * stride + x * 3;
        expect([...bytes.subarray(j, j + 3)]).toEqual([
          rgba[i + 2],
          rgba[i + 1],
          rgba[i],
        ]);
      }
  });
  it("refuses more rows than the image holds", async () => {
    const bmp = await bmpWriter(file(".bmp"), 1, 1);
    await expect(bmp.write(new Uint8Array(8))).rejects.toThrow(
      "more rows than the image holds",
    );
    await bmp.abort();
  });
});

describe("byte writer", () => {
  it("appends finished bytes and refuses an empty export or one past its limit", async () => {
    const target = file(".svg"),
      bytes = await byteWriter(target, 100);
    await bytes.write(new TextEncoder().encode("<svg>"));
    await bytes.write(new TextEncoder().encode("</svg>"));
    await bytes.finish();
    expect(await readFile(target, "utf8")).toBe("<svg></svg>");
    const empty = await byteWriter(file(".png"), 100);
    await expect(empty.finish()).rejects.toThrow("no data");
    await empty.abort();
    const over = await byteWriter(file(".png"), 4);
    await expect(over.write(new Uint8Array(5))).rejects.toThrow(
      "more data than allowed",
    );
    await over.abort();
  });
});

describe("temp files at quit", () => {
  it("never creates its file, so a temp the quit sweep removed stays gone", async () => {
    for (const writer of [
      (target: string) => pngWriter(target, 1, 1),
      (target: string) => tiffWriter(target, 1, 1),
      (target: string) => bmpWriter(target, 1, 1),
      (target: string) => byteWriter(target, 100),
    ]) {
      // The sweep removes the temp while the writer's open is still on its way.
      const target = file(".axiom-export.tmp");
      await rm(target);
      await expect(writer(target)).rejects.toThrow("ENOENT");
      await expect(access(target)).rejects.toThrow("ENOENT");
    }
  });
});
