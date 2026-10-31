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
  if (r.data?.startsWith("<?xml"))
    r.data = r.data.slice(r.data.indexOf("?>") + 2).trimStart();
  const o = r.options,
    s = (await request("state")) as Snapshot;
  if (s.datasetEpoch !== r.datasetEpoch || s.version !== r.version)
    throw Error(
      "The ontology changed while export was open. Reopen Export to use the current data.",
    );
  if (o.format === "clipboard") {
    const image = nativeImage.createFromDataURL(r.data ?? "");
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
  } else if (o.format === "pdf")
    output = htmlDocument(
      o.title,
      '<div class="diagram">' + (r.data ?? "") + "</div>",
      o,
    );
  else if (o.format === "svg") {
    if (!r.data?.startsWith("<svg")) throw Error("Invalid SVG export.");
    output = r.data;
  } else {
    const m = r.data?.match(
      /^data:image\/(?:png|jpeg|webp|tiff|bmp);base64,([A-Za-z0-9+/=\r\n]+)$/,
    );
    if (!m) throw Error("Invalid image export.");
    output = Buffer.from(m[1], "base64");
  }
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
  const temp = file + "." + randomUUID() + ".axiom-export.tmp";
  await writeFile(temp, output);
  await rename(temp, file);
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
  file: string | null;
  temp: string | null;
  writer: StreamWriter | null;
  clipboard: Buffer[] | null;
  clipboardBytes: number;
  clipboardLimit: number;
  writing: boolean;
  queue: Promise<void>;
}
const streams = new Map<string, ExportStream>(),
  watched = new Set<number>(),
  // Bumped whenever a window's renderer goes away, so an open that was still in its save dialog knows to stop.
  generations = new Map<number, number>();
function retire(owner: number) {
  generations.set(owner, (generations.get(owner) ?? 0) + 1);
  for (const [key, stream] of streams)
    if (stream.owner === owner) void cancelExportStream(key, owner);
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
  const r = validateExport({ ...input, data: undefined }),
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
  const sender = contents.id;
  if (!watched.has(sender)) {
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
  // The dialog runs one export at a time, so an older stream from this window is stale.
  for (const [key, stream] of streams)
    if (stream.owner === sender) await cancelExportStream(key, sender);
  const generation = generations.get(sender) ?? 0,
    id = randomUUID(),
    stream: ExportStream = {
      owner: sender,
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
    const temp = file + "." + randomUUID() + ".axiom-export.tmp";
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
      await rm(temp, { force: true });
      throw e;
    }
  }
  if ((generations.get(sender) ?? 0) !== generation || contents.isDestroyed()) {
    await stream.writer?.abort();
    if (stream.temp) await rm(stream.temp, { force: true });
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
  if (!(chunk instanceof Uint8Array) || chunk.length > MAX_STREAM_CHUNK)
    throw Error("Invalid export data.");
  // One write at a time, with its bytes reserved before any are held.
  if (stream.writing) throw Error("Wait for the previous export write.");
  if (stream.clipboard) {
    if (stream.clipboardBytes + chunk.length > stream.clipboardLimit)
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
    const image = nativeImage.createFromBuffer(Buffer.concat(stream.clipboard));
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
  } catch (e) {
    await stream.writer!.abort();
    await rm(stream.temp!, { force: true });
    throw e;
  }
  return stream.file!;
}
export async function cancelExportStream(id: string, owner: number) {
  const stream = streams.get(id);
  if (!stream || stream.owner !== owner) return;
  streams.delete(id);
  await stream.queue.catch(() => undefined);
  await stream.writer?.abort();
  if (stream.temp) await rm(stream.temp, { force: true });
}
