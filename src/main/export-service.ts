import {
  BrowserWindow,
  dialog,
  clipboard,
  nativeImage,
  ClipboardItem,
} from "electron";
import { randomUUID } from "node:crypto";
import { writeFile, rename } from "node:fs/promises";
import path from "node:path";
import {
  validateExport,
  type ExportRequest,
  type ReportData,
} from "../shared/export";
import { htmlDocument, reportDocument, escapeHtml } from "./report";
import type { DomainMethod, Snapshot } from "../shared/protocol";
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
    const win = new BrowserWindow({
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
    });
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
