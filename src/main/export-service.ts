import {
  BrowserWindow,
  dialog,
  clipboard,
  nativeImage,
  ClipboardItem,
  type WebContents,
} from "electron";
import { randomUUID } from "node:crypto";
import { writeFile, rename, rm } from "node:fs/promises";
import { closeSync, openSync, rmSync } from "node:fs";
import path from "node:path";
import {
  validateExport,
  type ExportOptions,
  type ExportRequest,
  type ExportStreamRequest,
  type ReportData,
} from "../shared/export";
import {
  clipboardLimit,
  formatCeiling,
  MAX_BYTE_STREAM,
  MAX_STREAM_CHUNK,
  sendsRows,
} from "../shared/raster-layout";
import {
  bmpWriter,
  byteWriter,
  pngWriter,
  tiffWriter,
  type StreamWriter,
} from "./raster-writer";
import { htmlDocument, reportDocument, escapeHtml } from "./report";
import type { DomainMethod, Snapshot } from "../shared/protocol";
// #165: PDF helper windows obey the same quiet policy as the main window.
import { testWindowOptions } from "./quiet-testing";
export async function exportDocument(
  input: ExportRequest,
  owner: BrowserWindow,
  request: (
    method: DomainMethod,
    args?: Record<string, unknown>,
  ) => Promise<unknown>,
) {
  const r = validateExport(input);
  // craigtrim/axiom#188: every other Diagram export streams, so only a PDF or a report arrives whole.
  if (r.options.content === "diagram" && r.options.format !== "pdf")
    throw Error("Invalid export options.");
  if (r.data?.startsWith("<?xml"))
    r.data = r.data.slice(r.data.indexOf("?>") + 2).trimStart();
  const o = r.options,
    s = (await request("state")) as Snapshot;
  if (s.datasetEpoch !== r.datasetEpoch || s.version !== r.version)
    throw Error(
      "The ontology changed while export was open. Reopen Export to use the current data.",
    );
  const file = await chooseExportFile(owner, o);
  if (!file) return null;
  let output: string | Buffer;
  if (o.content === "report") {
    const data = (await request("reportData", {
      scope: o.scope,
      iris: r.iris,
    })) as ReportData;
    if (data.datasetEpoch !== r.datasetEpoch || data.version !== r.version)
      throw Error("The ontology changed during export. Try again.");
    output = reportDocument(data, o, r.data ?? "");
  } else
    output = htmlDocument(
      o.title,
      '<div class="diagram">' + (r.data ?? "") + "</div>",
      o,
    );
  if (o.format === "pdf") {
    const win = new BrowserWindow(
      testWindowOptions({
        show: false,
        width: 1200,
        height: 900,
        webPreferences: {
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          javascript: false,
          partition: "axiom-export-" + Date.now(),
        },
      }),
    );
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    win.webContents.session.setPermissionRequestHandler((_w, _p, cb) =>
      cb(false),
    );
    win.webContents.session.webRequest.onBeforeRequest((details, cb) =>
      cb({
        cancel:
          !details.url.startsWith("data:") && details.url !== "about:blank",
      }),
    );
    try {
      await win.loadURL(
        "data:text/html;charset=utf-8," + encodeURIComponent(String(output)),
      );
      output = await win.webContents.printToPDF({
        printBackground: true,
        pageSize: o.pageSize,
        landscape: o.landscape,
        preferCSSPageSize: true,
        margins: {
          top: o.marginMm / 25.4,
          bottom: o.marginMm / 25.4,
          left: o.marginMm / 25.4,
          right: o.marginMm / 25.4,
        },
        generateDocumentOutline: true,
        generateTaggedPDF: true,
        displayHeaderFooter: o.content === "report",
        headerTemplate: "<span></span>",
        footerTemplate:
          '<div style="font-size:8px;width:100%;text-align:center"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
      });
    } finally {
      if (!win.isDestroyed()) win.destroy();
    }
  }
  const temp = createTemp(file);
  try {
    await writeFile(temp, output, { flag: "r+" });
    await rename(temp, file);
  } catch (e) {
    await removeTemp(temp);
    throw e;
  }
  doomed.delete(temp);
  return file;
}
async function chooseExportFile(owner: BrowserWindow, o: ExportOptions) {
  const result = await dialog.showSaveDialog(owner, {
    title: "Export " + (o.content === "diagram" ? "diagram" : "report"),
    defaultPath: "axiom-" + o.content + "." + o.format,
    filters: [
      {
        name: o.format.toUpperCase(),
        extensions: [
          o.format,
          ...(o.format === "jpg"
            ? ["jpeg"]
            : o.format === "tiff"
              ? ["tif"]
              : []),
        ],
      },
    ],
  });
  if (result.canceled || !result.filePath) return null;
  const ext = path.extname(result.filePath).toLowerCase(),
    allowed = [
      "." + o.format,
      ...(o.format === "jpg" ? [".jpeg"] : o.format === "tiff" ? [".tif"] : []),
    ];
  const file = ext ? result.filePath : result.filePath + "." + o.format;
  if (ext && !allowed.includes(ext))
    throw Error(
      "Use the selected " + o.format.toUpperCase() + " filename extension.",
    );
  return file;
}
// craigtrim/axiom#188: a Diagram export arrives in awaited bands, so no whole image passes through one message.
interface ExportStream {
  owner: number;
  width: number;
  height: number;
  file: string | null;
  temp: string | null;
  writer: StreamWriter | null;
  clipboard: Buffer[] | null;
  clipboardBytes: number;
  clipboardLimit: number;
  writing: boolean;
  queue: Promise<void>;
}
// The renderer sends a clipboard PNG in 16 MiB pieces, so even a 2 GiB one needs 128; tiny writes cannot pile up past this.
const MAX_CLIPBOARD_CHUNKS = 1024;
const streams = new Map<string, ExportStream>(),
  watched = new Set<number>(),
  // Bumped whenever a window's renderer goes away, so an open that was still in its save dialog knows to stop.
  generations = new Map<number, number>(),
  // Every export temp file from creation until it is renamed or removed; the quit sweep removes what is left.
  doomed = new Set<string>(),
  pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
// Set by the quit sweep: no export temp file may be created after it.
let swept = false;
/**
 * A new export temp file beside `file`, tracked until it is renamed or removed. It is created synchronously as it is
 * tracked and later only reopened, so no write still in flight at quit can create it after the sweep.
 */
function createTemp(file: string) {
  if (swept) throw Error("Axiom is closing.");
  const temp = file + "." + randomUUID() + ".axiom-export.tmp";
  doomed.add(temp);
  try {
    closeSync(openSync(temp, "wx"));
  } catch (e) {
    // The open can fail after it made the file, so the temp stays tracked unless it is gone.
    try {
      rmSync(temp, { force: true });
      doomed.delete(temp);
    } catch {
      // Left for the quit sweep.
    }
    throw e;
  }
  return temp;
}
/**
 * Removes a temp file and untracks it once it is gone. A removal that fails leaves it tracked for the quit sweep and
 * does not reject, so a cleanup started without a caller, as when a window goes away, never surfaces as a failure.
 */
async function removeTemp(temp: string) {
  await rm(temp, { force: true }).then(
    () => doomed.delete(temp),
    () => undefined,
  );
}
function retire(owner: number) {
  generations.set(owner, (generations.get(owner) ?? 0) + 1);
  for (const [key, stream] of streams)
    if (stream.owner === owner) void cancelExportStream(key, owner);
}
function watch(contents: WebContents) {
  const sender = contents.id;
  if (watched.has(sender)) return;
  watched.add(sender);
  // A crashed or reloaded renderer has lost its export ids, so its open exports end with it.
  contents.on("render-process-gone", () => retire(sender));
  contents.on("did-start-navigation", (details) => {
    if (details.isMainFrame && !details.isSameDocument) retire(sender);
  });
  contents.once("destroyed", () => {
    watched.delete(sender);
    retire(sender);
  });
}
async function discard(stream: ExportStream) {
  if (stream.temp) doomed.add(stream.temp);
  await stream.queue.catch(() => undefined);
  await stream.writer?.abort();
  if (stream.temp) await removeTemp(stream.temp);
}
/** Removes every export temp file synchronously, because asynchronous work at quit is abandoned. */
export function abandonExportStreams() {
  swept = true;
  for (const stream of streams.values())
    if (stream.temp) doomed.add(stream.temp);
  streams.clear();
  for (const temp of doomed)
    try {
      rmSync(temp, { force: true });
    } catch {
      // Quitting cannot wait or retry, and one locked temp must not keep the others or the rest of quit from running.
    }
  doomed.clear();
}
export async function openExportStream(
  input: ExportStreamRequest,
  owner: BrowserWindow,
  contents: WebContents,
  request: (
    method: DomainMethod,
    args?: Record<string, unknown>,
  ) => Promise<unknown>,
) {
  const sender = contents.id;
  // Watch the window and note its generation before the first await, so any crash or reload from here on counts.
  watch(contents);
  const generation = generations.get(sender) ?? 0,
    r = validateExport({ ...input, data: undefined }),
    o = r.options,
    { width, height, encoding } = input;
  if (o.content !== "diagram" || o.format === "pdf")
    throw Error("Invalid export options.");
  if (
    ![width, height].every(
      (n) => Number.isSafeInteger(n) && n >= 1 && n <= 2147483647,
    ) ||
    encoding !== (sendsRows(o.format, width, height) ? "rows" : "bytes")
  )
    throw Error("Invalid export size.");
  const ceiling =
    o.format === "svg" ? "" : formatCeiling(o.format, width, height);
  if (ceiling) throw Error(ceiling);
  const s = (await request("state")) as Snapshot;
  if (s.datasetEpoch !== r.datasetEpoch || s.version !== r.version)
    throw Error(
      "The ontology changed while export was open. Reopen Export to use the current data.",
    );
  // The dialog runs one export at a time, so an older stream from this window is stale.
  for (const [key, stream] of streams)
    if (stream.owner === sender) await cancelExportStream(key, sender);
  const id = randomUUID(),
    stream: ExportStream = {
      owner: sender,
      width,
      height,
      file: null,
      temp: null,
      writer: null,
      clipboard: null,
      clipboardBytes: 0,
      clipboardLimit: clipboardLimit(width, height),
      writing: false,
      queue: Promise.resolve(),
    };
  if (o.format === "clipboard") stream.clipboard = [];
  else {
    const file = await chooseExportFile(owner, o);
    if (!file) return null;
    const temp = createTemp(file);
    stream.file = file;
    stream.temp = temp;
    try {
      stream.writer =
        encoding === "bytes"
          ? await byteWriter(temp, MAX_BYTE_STREAM)
          : o.format === "png"
            ? await pngWriter(temp, width, height)
            : o.format === "tiff"
              ? await tiffWriter(temp, width, height)
              : await bmpWriter(temp, width, height);
    } catch (e) {
      await removeTemp(temp);
      throw e;
    }
  }
  if ((generations.get(sender) ?? 0) !== generation || contents.isDestroyed()) {
    await discard(stream);
    throw Error("The window that started this export closed.");
  }
  streams.set(id, stream);
  return id;
}
function ownStream(id: string, owner: number) {
  const stream = streams.get(id);
  if (!stream || stream.owner !== owner)
    throw Error("This export is no longer open.");
  return stream;
}
export async function writeExportStream(
  id: string,
  chunk: Uint8Array,
  owner: number,
) {
  const stream = ownStream(id, owner);
  // An empty write would cost a round trip and a queued await while adding nothing.
  if (
    !(chunk instanceof Uint8Array) ||
    chunk.length === 0 ||
    chunk.length > MAX_STREAM_CHUNK
  )
    throw Error("Invalid export data.");
  // One write at a time, with its bytes reserved before any are held.
  if (stream.writing) throw Error("Wait for the previous export write.");
  if (stream.clipboard) {
    if (
      stream.clipboardBytes + chunk.length > stream.clipboardLimit ||
      stream.clipboard.length >= MAX_CLIPBOARD_CHUNKS
    )
      throw Error("The export sent more data than allowed.");
    stream.clipboardBytes += chunk.length;
  }
  stream.writing = true;
  stream.queue = stream.queue.then(async () => {
    if (stream.clipboard) stream.clipboard.push(Buffer.from(chunk));
    else await stream.writer!.write(chunk);
  });
  try {
    await stream.queue;
  } finally {
    stream.writing = false;
  }
}
export async function closeExportStream(id: string, owner: number) {
  const stream = ownStream(id, owner);
  streams.delete(id);
  if (stream.clipboard) {
    await stream.queue;
    const png = Buffer.concat(stream.clipboard);
    // Decode only the PNG that was declared: its header must name the declared size.
    if (
      png.length < 24 ||
      !png.subarray(0, 8).equals(pngSignature) ||
      png.toString("latin1", 12, 16) !== "IHDR" ||
      png.readUInt32BE(16) !== stream.width ||
      png.readUInt32BE(20) !== stream.height
    )
      throw Error("The clipboard image does not match the export.");
    const image = nativeImage.createFromBuffer(png);
    if (image.isEmpty()) throw Error("No image is available to copy.");
    await clipboard.write([
      new ClipboardItem({
        "image/png": new Blob([new Uint8Array(image.toPNG())], {
          type: "image/png",
        }),
      }),
    ]);
    return "clipboard";
  }
  try {
    await stream.queue;
    await stream.writer!.finish();
    await rename(stream.temp!, stream.file!);
    doomed.delete(stream.temp!);
  } catch (e) {
    await discard(stream);
    throw e;
  }
  return stream.file!;
}
export async function cancelExportStream(id: string, owner: number) {
  const stream = streams.get(id);
  if (!stream || stream.owner !== owner) return;
  streams.delete(id);
  await discard(stream);
}
