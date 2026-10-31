// craigtrim/axiom#188: raster exports have no Axiom maximum, and only a format's own ceiling stops one.
import { launchExample } from "./example-fixture";
import {
  test,
  expect,
  type ElectronApplication,
  type Locator,
  type Page,
} from "@playwright/test";
import { access, mkdir, mkdtemp, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createInflate } from "node:zlib";
import UTIF from "utif";
import type { Snapshot } from "../../src/shared/protocol";
import type { ExportOptions } from "../../src/shared/export";
import { bandRows, bmpStride } from "../../src/shared/raster-layout";
let app: ElectronApplication,
  page: Page,
  profile: string,
  closed = false;
const errors: string[] = [];
const state = () =>
  page.evaluate(() => window.axiom.request<Snapshot>("state"));
async function menu(id: string) {
  const epoch = id === "file.new" ? (await state()).datasetEpoch : undefined;
  await app.evaluate(({ Menu, BrowserWindow }, id) => {
    const win = BrowserWindow.getAllWindows()[0];
    Menu.getApplicationMenu()!
      .getMenuItemById(id)!
      .click({} as never, win, win.webContents as never);
  }, id);
  if (epoch !== undefined)
    await expect.poll(async () => (await state()).datasetEpoch).not.toBe(epoch);
}
test.beforeEach(async () => {
  errors.length = 0;
  closed = false;
  await mkdir("artifacts/testing", { recursive: true });
  profile = await mkdtemp(path.resolve("artifacts/testing/export-size-"));
  const env = {
    ...process.env,
    AXIOM_CACHE_HOME: path.join(profile, "cache"),
    AXIOM_USER_DATA: profile,
  } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  app = await launchExample({
    executablePath: process.env.AXIOM_TEST_EXE,
    args: process.env.AXIOM_TEST_EXE ? [] : ["."],
    env,
  });
  page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  if (process.env.AXIOM_TEST_BACKGROUND === "1")
    await (
      await app.browserWindow(page)
    ).evaluate((win) => win.setFocusable(false));
  await expect(page.getByTestId("graph-canvas")).toBeVisible();
});
test.afterEach(async ({}, info) => {
  if (closed) return;
  if (info.status !== info.expectedStatus)
    await info.attach("export-size-failure", {
      body: await page.screenshot(),
      contentType: "image/png",
    });
  await app.close();
  expect(errors).toEqual([]);
});
/** Classes placed at fixed graph coordinates, so the export's size is known. */
async function scene(points: [number, number][]) {
  await menu("file.new");
  await page.evaluate(async (points) => {
    await window.axiom.request("freeze");
    const iris: string[] = [];
    for (let i = 0; i < points.length; i++)
      iris.push(
        await window.axiom.request<string>("createClass", {
          name: "Corner " + (i + 1),
          parent: "http://www.w3.org/2002/07/owl#Thing",
        }),
      );
    await window.axiom.request("seed", { iris, expand: false });
    const s = await window.axiom.request<Snapshot>("state");
    for (let i = 0; i < points.length; i++)
      await window.axiom.request("drag", {
        iri: iris[i],
        x: points[i][0],
        y: points[i][1],
        dragging: false,
        datasetEpoch: s.datasetEpoch,
      });
    await window.axiom.request("select", { iri: null });
  }, points);
}
async function exportDialog(format: string, scale: number) {
  await menu("graph.export.png");
  const dialog = page.getByRole("dialog", { name: "Export", exact: true });
  await dialog
    .getByRole("combobox", { name: "Export format", exact: true })
    .selectOption(format);
  const field = dialog.getByLabel("Export scale", { exact: true });
  await field.fill(String(scale));
  await field.press("Tab");
  return dialog;
}
async function shownSize(dialog: Locator) {
  const text = await dialog.getByText(/^[\d,]+ × [\d,]+ pixels$/).innerText(),
    [width, height] = text
      .replace(" pixels", "")
      .split(" × ")
      .map((n) => Number(n.replace(/,/g, "")));
  return { width, height };
}
async function saveTo(file: string) {
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, file);
}
async function exportTo(dialog: Locator, file: string, timeout = 30000) {
  await saveTo(file);
  await dialog.getByRole("button", { name: "Export", exact: true }).click();
  await expect(dialog).toBeHidden({ timeout });
}

/** Collects pixels in the class node fill (#0F6CBD, the light theme's e-class token) into 16 px cells. */
function classMarks() {
  const cells = new Map<string, { x: number; y: number; n: number }>();
  return {
    row(
      y: number,
      bytes: Uint8Array,
      at: number,
      width: number,
      channels: 3 | 4,
    ) {
      for (let x = 0; x < width; x++) {
        const i = at + x * channels,
          [r, b] =
            channels === 3
              ? [bytes[i + 2], bytes[i]]
              : [bytes[i], bytes[i + 2]];
        if (
          r === 15 &&
          bytes[i + 1] === 108 &&
          b === 189 &&
          (channels === 3 || bytes[i + 3] === 255)
        ) {
          const key = Math.floor(x / 16) + "," + Math.floor(y / 16),
            cell = cells.get(key) ?? { x: 0, y: 0, n: 0 };
          cell.x += x;
          cell.y += y;
          cell.n++;
          cells.set(key, cell);
        }
      }
    },
    /** Two node shapes must sit exactly this far apart, which fails if any band or column came from the wrong offset. */
    expectApart(dx: number, dy: number) {
      const seen = new Set<string>(),
        shapes: { x: number; y: number }[] = [];
      for (const start of cells.keys()) {
        if (seen.has(start)) continue;
        let x = 0,
          y = 0,
          n = 0;
        const queue = [start];
        seen.add(start);
        while (queue.length) {
          const key = queue.pop()!,
            cell = cells.get(key)!,
            [cx, cy] = key.split(",").map(Number);
          x += cell.x;
          y += cell.y;
          n += cell.n;
          for (const ox of [-1, 0, 1])
            for (const oy of [-1, 0, 1]) {
              const next = cx + ox + "," + (cy + oy);
              if (cells.has(next) && !seen.has(next)) {
                seen.add(next);
                queue.push(next);
              }
            }
        }
        shapes.push({ x: x / n, y: y / n });
      }
      expect(
        shapes.some((a) =>
          shapes.some(
            (b) =>
              Math.abs(b.x - a.x - dx) <= 3 && Math.abs(b.y - a.y - dy) <= 3,
          ),
        ),
      ).toBe(true);
    },
  };
}
/** Reverses one PNG row filter in place (bytes per pixel 4). */
function unfilter(type: number, row: Uint8Array, prior: Uint8Array) {
  for (let i = 0; i < row.length; i++) {
    const left = i >= 4 ? row[i - 4] : 0,
      up = prior[i],
      corner = i >= 4 ? prior[i - 4] : 0;
    if (type === 1) row[i] += left;
    else if (type === 2) row[i] += up;
    else if (type === 3) row[i] += (left + up) >> 1;
    else if (type === 4) {
      const p = left + up - corner,
        pa = Math.abs(p - left),
        pb = Math.abs(p - up),
        pc = Math.abs(p - corner);
      row[i] += pa <= pb && pa <= pc ? left : pb <= pc ? up : corner;
    }
  }
}
/** Decodes a PNG row by row: every row arrives, sits on the opaque background, and the two nodes are where they belong. */
async function checkPng(
  file: string,
  width: number,
  height: number,
  [dx, dy]: [number, number],
) {
  const bytes = await readFile(file);
  expect(bytes.readUInt32BE(16)).toBe(width);
  expect(bytes.readUInt32BE(20)).toBe(height);
  const rowBytes = 1 + width * 4,
    inflate = createInflate(),
    marks = classMarks(),
    blankRows: number[] = [];
  let row = new Uint8Array(width * 4),
    prior = new Uint8Array(width * 4),
    filter = 0,
    filled = -1,
    y = 0;
  inflate.on("data", (chunk: Buffer) => {
    for (let i = 0; i < chunk.length;) {
      if (filled < 0) {
        filter = chunk[i++];
        filled = 0;
        continue;
      }
      const take = Math.min(row.length - filled, chunk.length - i);
      row.set(chunk.subarray(i, i + take), filled);
      filled += take;
      i += take;
      if (filled === row.length) {
        unfilter(filter, row, prior);
        if (row[3] !== 255) blankRows.push(y);
        marks.row(y, row, 0, width, 4);
        [row, prior] = [prior, row];
        filled = -1;
        y++;
      }
    }
  });
  const done = new Promise((resolve, reject) => {
    inflate.on("end", resolve);
    inflate.on("error", reject);
  });
  for (let at = 8; at < bytes.length;) {
    const length = bytes.readUInt32BE(at),
      type = bytes.toString("latin1", at + 4, at + 8);
    if (type === "IDAT") inflate.write(bytes.subarray(at + 8, at + 8 + length));
    at += 12 + length;
  }
  inflate.end();
  await done;
  expect(y).toBe(height);
  // The scaled height rounds up, so only the last row may be partly covered.
  expect(blankRows.filter((r) => r !== height - 1)).toEqual([]);
  marks.expectApart(dx, dy);
}

test("a PNG past the canvas area is drawn in bands at the size the dialog shows", async () => {
  test.setTimeout(300000);
  await scene([
    [0, 0],
    [2000, 1950],
  ]);
  const dialog = await exportDialog("png", 8),
    { width, height } = await shownSize(dialog);
  expect(width * height).toBeGreaterThan(268435456);
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  const file = path.join(profile, "large.png");
  await exportTo(dialog, file, 240000);
  await checkPng(file, width, height, [2000 * 8, 1950 * 8]);
});

test("a tall, narrow PNG past the canvas side streams in canvas-high bands", async () => {
  test.setTimeout(180000);
  await scene([
    [0, 0],
    [0, 270000],
  ]);
  const dialog = await exportDialog("png", 0.25),
    { width, height } = await shownSize(dialog);
  expect(height).toBeGreaterThan(65535);
  expect(width).toBeLessThan(256);
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  const file = path.join(profile, "tall.png");
  await exportTo(dialog, file, 150000);
  await checkPng(file, width, height, [0, 270000 * 0.25]);
});

test("a PNG wider than the canvas side is drawn in columns and joined row by row", async () => {
  test.setTimeout(300000);
  await scene([
    [0, 0],
    [9000, 100],
  ]);
  const dialog = await exportDialog("png", 8),
    { width, height } = await shownSize(dialog);
  expect(width).toBeGreaterThan(65535);
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  const file = path.join(profile, "wide.png");
  await exportTo(dialog, file, 240000);
  await checkPng(file, width, height, [9000 * 8, 100 * 8]);
});

test("an image past the old 9,000-pixel guard that fits one canvas exports as PNG, TIFF and BMP across bands", async () => {
  test.setTimeout(420000);
  await scene([
    [0, 0],
    [2000, 1950],
  ]);
  for (const format of ["png", "tiff", "bmp"]) {
    const dialog = await exportDialog(format, 5),
      { width, height } = await shownSize(dialog),
      file = path.join(profile, "past-guard." + format);
    // Past the old guard, inside one canvas, and more than one band of rows.
    expect(Math.max(width, height)).toBeGreaterThan(9000);
    expect(width * height).toBeGreaterThan(40000000);
    expect(width * height).toBeLessThanOrEqual(268435456);
    expect(height).toBeGreaterThan(bandRows(width, height));
    await expect(dialog.getByRole("alert")).toHaveCount(0);
    await exportTo(dialog, file, 300000);
    if (format === "png") {
      await checkPng(file, width, height, [2000 * 5, 1950 * 5]);
      continue;
    }
    const bytes = await readFile(file),
      marks = classMarks();
    if (format === "tiff") {
      const ifd = UTIF.decode(bytes)[0],
        first = (ifd.t273 as number[])[0];
      expect([(ifd.t256 as number[])[0], (ifd.t257 as number[])[0]]).toEqual([
        width,
        height,
      ]);
      // The writer lays strips out in order, so rows follow one another from the first strip.
      for (let y = 0; y < height; y++) {
        const at = first + y * width * 4;
        if (y < height - 1) expect(bytes[at + 3]).toBe(255);
        marks.row(y, bytes, at, width, 4);
      }
    } else {
      const stride = bmpStride(width);
      expect([bytes.readInt32LE(18), bytes.readInt32LE(22)]).toEqual([
        width,
        height,
      ]);
      expect(bytes.length).toBe(54 + stride * height);
      for (let y = 0; y < height; y++)
        marks.row(y, bytes, 54 + (height - 1 - y) * stride, width, 3);
    }
    marks.expectApart(2000 * 5, 1950 * 5);
  }
});

test("the Export dialog opens at once for a layout tens of millions of units wide", async () => {
  await scene([
    [0, 0],
    [64000000, 0],
  ]);
  const dialog = await exportDialog("png", 0.25),
    { width, height } = await shownSize(dialog),
    preview = dialog.getByRole("img", {
      name: "Export diagram preview",
      exact: true,
    });
  expect(width).toBeGreaterThan(16000000);
  expect(height).toBeLessThan(200);
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  // The grid is one SVG pattern, so neither the preview nor a saved SVG grows with the layout's area.
  expect((await preview.getAttribute("src"))!.length).toBeLessThan(100000);
  await dialog
    .getByRole("combobox", { name: "Export format", exact: true })
    .selectOption("svg");
  const file = path.join(profile, "wide.svg");
  await exportTo(dialog, file);
  const svg = await readFile(file, "utf8");
  expect(svg.length).toBeLessThan(100000);
  expect(Number(svg.match(/<svg [^>]*width="(\d+)"/)![1])).toBeGreaterThan(
    64000000,
  );
  expect(svg).toMatch(/fill="url\(#axiom-grid-[0-9a-z]+\)"/);
  // Past 250,000 dots a PDF keeps the pattern as well, so it stays small.
  const again = await exportDialog("png", 0.25),
    pdf = path.join(profile, "wide.pdf");
  await again
    .getByRole("combobox", { name: "Export format", exact: true })
    .selectOption("pdf");
  await exportTo(again, pdf);
  const bytes = await readFile(pdf);
  expect(bytes.toString("latin1", 0, 5)).toBe("%PDF-");
  expect(bytes.length).toBeLessThan(1000000);
});

test("a PDF of a normal diagram prints its grid as vector dots", async () => {
  await scene([
    [0, 0],
    [300, 200],
    [-150, 120],
  ]);
  const dialog = await exportDialog("png", 1),
    file = path.join(profile, "normal.pdf");
  await dialog
    .getByRole("combobox", { name: "Export format", exact: true })
    .selectOption("pdf");
  await exportTo(dialog, file);
  const pdf = (await readFile(file)).toString("latin1");
  expect(pdf.startsWith("%PDF-")).toBe(true);
  // Chromium prints an SVG pattern as a bitmap, so a grid of single dots leaves the PDF with no image at all.
  expect(pdf).not.toMatch(/\/Subtype\s*\/Image/);
});

test("TIFF and BMP stream rows that decode at the size the dialog shows", async () => {
  await scene([
    [0, 0],
    [300, 200],
    [-150, 120],
  ]);
  for (const format of ["tiff", "bmp"]) {
    const dialog = await exportDialog(format, 1.5),
      { width, height } = await shownSize(dialog),
      file = path.join(profile, "small." + format);
    await exportTo(dialog, file);
    const bytes = await readFile(file);
    if (format === "tiff") {
      const ifds = UTIF.decode(bytes);
      UTIF.decodeImage(bytes, ifds[0]);
      expect([ifds[0].width, ifds[0].height]).toEqual([width, height]);
      const rgba = new Uint8Array(UTIF.toRGBA8(ifds[0]));
      for (let y = 0; y < height - 1; y++)
        expect(rgba[y * width * 4 + 3]).toBe(255);
      expect(new Set(rgba).size).toBeGreaterThan(10);
    } else {
      const stride = Math.ceil((width * 3) / 4) * 4;
      expect(bytes.toString("latin1", 0, 2)).toBe("BM");
      expect([
        bytes.readInt32LE(18),
        bytes.readInt32LE(22),
        bytes.length,
      ]).toEqual([width, height, 54 + stride * height]);
      expect(new Set(bytes.subarray(54)).size).toBeGreaterThan(10);
    }
  }
});

test("a format past its own ceiling names it, disables Export and writes nothing", async () => {
  await scene([
    [0, 0],
    [2000, 1950],
  ]);
  const dialog = await exportDialog("png", 8),
    alert = dialog.getByRole("alert"),
    button = (name: string) =>
      dialog.getByRole("button", { name, exact: true }),
    format = dialog.getByRole("combobox", {
      name: "Export format",
      exact: true,
    }),
    file = path.join(profile, "refused.webp");
  await saveTo(file);
  await expect(alert).toHaveCount(0);
  await expect(button("Export")).toBeEnabled();
  await format.selectOption("webp");
  await expect(alert).toHaveText(
    "WebP supports up to 16,383 pixels per side. Choose PNG to export this size.",
  );
  await expect(button("Export")).toBeDisabled();
  await format.selectOption("jpg");
  await expect(alert).toHaveText(
    "JPEG supports up to 65,500 pixels per side. Axiom's JPEG encoder also requires the image to fit within 268,435,456 pixels. Choose PNG to export this size.",
  );
  await expect(button("Export")).toBeDisabled();
  await format.selectOption("clipboard");
  await expect(alert).toContainText("too large for the clipboard");
  await expect(button("Copy")).toBeDisabled();
  for (const fits of ["tiff", "bmp", "png"]) {
    await format.selectOption(fits);
    await expect(alert).toHaveCount(0);
    await expect(button("Export")).toBeEnabled();
  }
  await format.selectOption("webp");
  await button("Export").click({ force: true });
  await expect(dialog).toBeVisible();
  await expect(access(file)).rejects.toThrow();
  expect(await page.content()).not.toContain("9,000 pixels");
});

/** A Diagram export request built in the page, for driving the export bridge directly. */
function directExport(format: string, width: number, height: number) {
  return page.evaluate(
    async ({ format, width, height }) => {
      const s = await window.axiom.request<Snapshot>("state"),
        options: ExportOptions = {
          content: "diagram",
          format,
          scope: "graph",
          background: "light",
          scale: 1,
          quality: 90,
          caption: true,
          legend: true,
          allLabels: true,
          includeGraph: true,
          includeStatements: true,
          pageSize: "A4",
          landscape: true,
          marginMm: 12,
          title: "Direct export",
          area: "graph",
        };
      return window.axiom.exportOpen({
        options,
        datasetEpoch: s.datasetEpoch,
        version: s.version,
        iris: [],
        encoding: format === "tiff" ? "rows" : "bytes",
        width,
        height,
      });
    },
    { format, width, height },
  );
}

test("the clipboard refuses empty writes, more than 1,024 writes and a PNG whose size differs from the declared export", async () => {
  await scene([
    [0, 0],
    [300, 200],
  ]);
  const id = await directExport("clipboard", 1, 1);
  expect(id).toBeTruthy();
  const [empty, many, mismatch] = await page.evaluate(async (id) => {
    const refusal = async (work: () => Promise<unknown>) => {
      try {
        await work();
        return "accepted";
      } catch (e) {
        return (e as Error).message;
      }
    };
    const empty = await refusal(() =>
      window.axiom.exportWrite(id, new Uint8Array(0)),
    );
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 2;
    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b!), "image/png"),
    );
    await window.axiom.exportWrite(
      id,
      new Uint8Array(await blob.arrayBuffer()),
    );
    // A 1 x 1 PNG may take about 1 MB, so 1,023 one-byte writes stay under the byte limit.
    for (let i = 0; i < 1023; i++)
      await window.axiom.exportWrite(id, new Uint8Array(1));
    const many = await refusal(() =>
      window.axiom.exportWrite(id, new Uint8Array(1)),
    );
    return [empty, many, await refusal(() => window.axiom.exportClose(id))];
  }, id!);
  expect(empty).toContain("Invalid export data.");
  expect(many).toContain("The export sent more data than allowed.");
  expect(mismatch).toContain("The clipboard image does not match the export.");
});

test("closing Axiom during an export leaves no temp file", async () => {
  await scene([
    [0, 0],
    [300, 200],
  ]);
  const file = path.join(profile, "unfinished.tiff"),
    temps = async () =>
      (await readdir(profile)).filter((name) =>
        name.endsWith(".axiom-export.tmp"),
      );
  await saveTo(file);
  const id = await directExport("tiff", 10, 10);
  expect(id).toBeTruthy();
  await page.evaluate(
    (id) => window.axiom.exportWrite(id, new Uint8Array(40)),
    id!,
  );
  expect(await temps()).toHaveLength(1);
  closed = true;
  await app.close();
  expect(errors).toEqual([]);
  expect(await temps()).toEqual([]);
  await expect(access(file)).rejects.toThrow();
});
