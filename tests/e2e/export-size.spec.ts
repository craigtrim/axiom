// craigtrim/axiom#188: raster exports have no Axiom maximum, and only a format's own ceiling stops one.
import { launchExample } from "./example-fixture";
import {
  test,
  expect,
  type ElectronApplication,
  type Locator,
  type Page,
} from "@playwright/test";
import { access, mkdir, mkdtemp, readFile } from "node:fs/promises";
import path from "node:path";
import { createInflate } from "node:zlib";
import UTIF from "utif";
import type { Snapshot } from "../../src/shared/protocol";
let app: ElectronApplication, page: Page, profile: string;
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

/** Inflates a PNG's IDAT stream and checks that every row arrived drawn on the opaque background. */
async function checkPng(
  file: string,
  width: number,
  height: number,
  between: [number, number],
) {
  const bytes = await readFile(file);
  expect(bytes.readUInt32BE(16)).toBe(width);
  expect(bytes.readUInt32BE(20)).toBe(height);
  const rowBytes = 1 + width * 4,
    inflate = createInflate(),
    blankRows: number[] = [],
    sums = new Set<number>(),
    // Class nodes are filled with the light theme's e-class token, #0F6CBD.
    marks = new Map<string, { x: number; y: number; n: number }>(),
    pixel = new Uint8Array(4);
  let position = 0,
    rows = 0,
    sum = 0;
  inflate.on("data", (chunk: Buffer) => {
    for (let i = 0; i < chunk.length; i++, position++) {
      const at = position % rowBytes;
      if (at === 4 && chunk[i] !== 255)
        blankRows.push(Math.floor(position / rowBytes));
      if (at > 0) {
        pixel[(at - 1) % 4] = chunk[i];
        if (
          (at - 1) % 4 === 3 &&
          pixel[0] === 15 &&
          pixel[1] === 108 &&
          pixel[2] === 189 &&
          pixel[3] === 255
        ) {
          const x = (at - 1) / 4 - 0.75,
            y = Math.floor(position / rowBytes),
            key = Math.floor(x / 16) + "," + Math.floor(y / 16),
            cell = marks.get(key) ?? { x: 0, y: 0, n: 0 };
          cell.x += x;
          cell.y += y;
          cell.n++;
          marks.set(key, cell);
        }
      }
      sum += chunk[i];
      if (at === rowBytes - 1) {
        sums.add(sum);
        sum = 0;
        rows++;
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
  expect(position).toBe(rowBytes * height);
  expect(rows).toBe(height);
  // The scaled height rounds up, so only the last row may be partly covered.
  expect(blankRows.filter((row) => row !== height - 1)).toEqual([]);
  expect(sums.size).toBeGreaterThan(10);
  // Join neighbouring marked cells into shapes; two node shapes must sit exactly the scaled node distance apart,
  // which fails if a band or column is drawn from the wrong offset.
  const seen = new Set<string>(),
    shapes: { x: number; y: number }[] = [];
  for (const start of marks.keys()) {
    if (seen.has(start)) continue;
    let x = 0,
      y = 0,
      n = 0;
    const queue = [start];
    seen.add(start);
    while (queue.length) {
      const key = queue.pop()!,
        cell = marks.get(key)!,
        [cx, cy] = key.split(",").map(Number);
      x += cell.x;
      y += cell.y;
      n += cell.n;
      for (const dx of [-1, 0, 1])
        for (const dy of [-1, 0, 1]) {
          const next = cx + dx + "," + (cy + dy);
          if (marks.has(next) && !seen.has(next)) {
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
          Math.abs(b.x - a.x - between[0]) <= 3 &&
          Math.abs(b.y - a.y - between[1]) <= 3,
      ),
    ),
  ).toBe(true);
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
