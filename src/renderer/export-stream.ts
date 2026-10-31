// craigtrim/axiom#188: render a Diagram export, in one canvas or in bands, and stream it to the main process.
import { exportScene, exportTiles } from "./scene";
import type { GraphSnapshot } from "../shared/protocol";
import type { ExportOptions, ExportStreamRequest } from "../shared/export";
import {
  bandRows,
  bmpStride,
  fitsCanvas,
  sendsRows,
  tileColumns,
} from "../shared/raster-layout";
type SceneOptions = Parameters<typeof exportScene>[4];
/** At most one chunk is in flight: every write waits for the main process. */
const CHUNK = 16777216;
async function sendBytes(id: string, bytes: Uint8Array) {
  // slice, not subarray: IPC would otherwise copy the whole underlying buffer each time.
  for (let i = 0; i < bytes.length; i += CHUNK)
    await window.axiom.exportWrite(id, bytes.slice(i, i + CHUNK));
}
const mime: Record<string, string> = {
  jpg: "image/jpeg",
  webp: "image/webp",
};
function toBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(Error("Axiom could not encode an image this large.")),
      type,
      quality,
    ),
  );
}
/** One band as the writer for this format expects it. */
function encodeBand(
  format: string,
  rgba: Uint8ClampedArray,
  width: number,
  rows: number,
) {
  const row = width * 4;
  if (format === "tiff")
    return new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength);
  if (format === "png") {
    // Each row starts with PNG filter 0, which the zeroed buffer already holds.
    const out = new Uint8Array(rows * (row + 1));
    for (let r = 0; r < rows; r++)
      out.set(rgba.subarray(r * row, (r + 1) * row), r * (row + 1) + 1);
    return out;
  }
  // BMP: padded BGR rows, bottom row first, as they sit in the file.
  const stride = bmpStride(width),
    out = new Uint8Array(rows * stride);
  for (let r = 0; r < rows; r++) {
    const from = (rows - 1 - r) * row,
      to = r * stride;
    for (let x = 0; x < width; x++) {
      out[to + x * 3] = rgba[from + x * 4 + 2];
      out[to + x * 3 + 1] = rgba[from + x * 4 + 1];
      out[to + x * 3 + 2] = rgba[from + x * 4];
    }
  }
  return out;
}
async function sendRows(
  id: string,
  format: string,
  width: number,
  height: number,
  region: (x: number, y: number, w: number, h: number) => Uint8ClampedArray,
) {
  const rows = bandRows(width, height),
    columns = tileColumns(width);
  for (let y = 0; y < height; y += rows) {
    const n = Math.min(rows, height - y);
    let rgba: Uint8ClampedArray;
    if (columns.length === 1) rgba = region(0, y, width, n);
    else {
      rgba = new Uint8ClampedArray(width * n * 4);
      for (const c of columns) {
        const part = region(c.x, y, c.width, n);
        for (let r = 0; r < n; r++)
          rgba.set(
            part.subarray(r * c.width * 4, (r + 1) * c.width * 4),
            (r * width + c.x) * 4,
          );
      }
    }
    await window.axiom.exportWrite(id, encodeBand(format, rgba, width, n));
  }
}
export async function streamDiagram({
  diagram,
  selected,
  options,
  svg,
  request,
}: {
  diagram: GraphSnapshot;
  selected: string | null;
  options: ExportOptions & NonNullable<SceneOptions>;
  svg: { data: string; width: number; height: number };
  request: Omit<ExportStreamRequest, "encoding" | "width" | "height">;
}) {
  const format = options.format,
    dark = options.background === "dark",
    tiles =
      format === "svg" ? null : exportTiles(diagram, dark, selected, options),
    width = tiles?.width ?? Math.max(1, Math.round(svg.width)),
    height = tiles?.height ?? Math.max(1, Math.round(svg.height)),
    encoding =
      format !== "svg" && sendsRows(format, width, height) ? "rows" : "bytes";
  const id = await window.axiom.exportOpen({
    ...request,
    encoding,
    width,
    height,
  });
  if (!id) return null;
  try {
    if (format === "svg")
      await sendBytes(id, new TextEncoder().encode(svg.data));
    else if (encoding === "rows" && !fitsCanvas(width, height))
      await sendRows(id, format, width, height, tiles!.region);
    else {
      const { canvas } = exportScene(diagram, dark, "png", selected, options);
      if (encoding === "rows") {
        const ctx = canvas!.getContext("2d")!;
        await sendRows(
          id,
          format,
          width,
          height,
          (x, y, w, h) => ctx.getImageData(x, y, w, h).data,
        );
      } else {
        const blob = await toBlob(
          canvas!,
          mime[format] ?? "image/png",
          options.quality / 100,
        );
        await sendBytes(id, new Uint8Array(await blob.arrayBuffer()));
      }
    }
    return await window.axiom.exportClose(id);
  } catch (e) {
    await window.axiom.exportCancel(id).catch(() => undefined);
    throw e;
  }
}
