// craigtrim/axiom#79: retain the manual latency gate with tracked highlights.
// craigtrim/axiom#73: measure real keyboard editing separately from parser throughput.
import { _electron as electron, expect } from "@playwright/test";
import { build } from "esbuild";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const name = process.argv[2] ?? "manual";
const count = Number(process.env.AXIOM_BENCH_CONCEPTS ?? 2000);
const samples = Number(process.env.AXIOM_BENCH_SAMPLES ?? 240);
const characters = Number(process.env.AXIOM_BENCH_CHARACTERS ?? 98000);
const initialCharacters = Number(
  process.env.AXIOM_BENCH_INITIAL_CHARACTERS ?? characters,
);
const directory = path.resolve("artifacts/manual-editor", name);
await mkdir(directory, { recursive: true });
const profile = await mkdtemp(path.join(directory, "profile-"));
const ontology = path.join(profile, "terms.ttl");
const labels = Array.from(
  { length: count },
  (_, i) => `term${String(i).padStart(5, "0")}`,
);
const block = labels
  .map((label, i) => label + (i % 8 === 7 ? "\n" : " "))
  .join("");
const passage = block
  .repeat(Math.ceil(characters / block.length))
  .slice(0, characters);
await writeFile(
  ontology,
  "@prefix : <https://editor.test/#> .\n@prefix owl: <http://www.w3.org/2002/07/owl#> .\n@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n" +
    labels
      .map((label, i) => `:c${i} a owl:Class; rdfs:label "${label}" .`)
      .join("\n"),
);
const env = {
  ...process.env,
  AXIOM_USER_DATA: profile,
  AXIOM_CACHE_HOME: path.join(profile, "cache"),
};
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({
  executablePath: process.env.AXIOM_TEST_EXE,
  args: process.env.AXIOM_TEST_EXE ? [] : ["."],
  env,
});
const clipboardText = await app.evaluate(({ clipboard }) =>
  clipboard.readText(),
);
const report = {
  name,
  at: new Date().toISOString(),
  executable: process.env.AXIOM_TEST_EXE,
  method:
    "Keydown capture to the second animation frame, a conservative next-paint proxy. Paste and selection include Playwright round-trip time. Native clipboard paste avoids the distinct Chromium bulk InsertText path.",
  hardware: {
    cpu: os.cpus()[0].model,
    cores: os.cpus().length,
    memoryGiB: os.totalmem() / 2 ** 30,
    os: os.release(),
  },
  workload: {
    characters: passage.length,
    lines: passage.split("\n").length,
    classes: count,
  },
  measurements: {},
};
try {
  const page = await app.firstWindow();
  const paste = async (text) => {
    await app.evaluate(
      ({ clipboard }, text) => clipboard.writeText(text),
      text,
    );
    await page.keyboard.press("Control+V");
  };
  await page.getByTestId("graph-canvas").waitFor();
  await app.evaluate(({ dialog, BrowserWindow, ipcMain }, ontology) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (process.env.AXIOM_TEST_BACKGROUND === "1") win.setFocusable(false);
    win.setSize(1400, 1000);
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [ontology],
    });
    dialog.showSaveDialog = async () => ({
      canceled: false,
      filePath: ontology + ".axiom",
    });
    dialog.showMessageBox = async () => ({
      response: 0,
      checkboxChecked: false,
    });
    globalThis.__analysisCalls = 0;
    const handler = ipcMain._invokeHandlers.get("textAnalysis:parse");
    ipcMain.removeHandler("textAnalysis:parse");
    ipcMain.handle("textAnalysis:parse", (event, ...args) => {
      globalThis.__analysisCalls++;
      return handler(event, ...args);
    });
  }, ontology);
  const menu = (id) =>
    app.evaluate(({ Menu, BrowserWindow }, id) => {
      const item = Menu.getApplicationMenu().getMenuItemById(id);
      item.click(item, BrowserWindow.getAllWindows()[0]);
    }, id);
  await menu("file.open");
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          window.axiom.request("state").then((s) => s.classCount),
        ),
      { timeout: 60000 },
    )
    .toBe(count + 1);
  console.log("Loaded ontology", count);
  await page.evaluate(async () => {
    await window.axiom.request("motion", { reduced: true });
    await window.axiom.request("clear");
  });
  await menu("view.textanalysis");
  const panel = page.getByRole("region", {
    name: "Text Analysis",
    exact: true,
  });
  const editor = panel.getByRole("textbox", {
    name: "Text to analyze",
    exact: true,
  });
  await editor.focus();
  console.log("Editor ready");
  await paste(passage.slice(0, initialCharacters));
  console.log("Inserted text", Math.min(passage.length, initialCharacters));
  await expect(panel.locator(".text-analysis-status")).toHaveText(
    `${Math.floor(Math.min(passage.length, initialCharacters) / 10)} matches`,
    {
      timeout: 120000,
    },
  );
  report.workload.result = await panel
    .locator(".text-analysis-status")
    .textContent();
  console.log("Initial analysis", report.workload.result);
  await panel
    .getByRole("switch", { name: "Auto, analyze while typing" })
    .click();
  await expect(panel.getByRole("switch")).toHaveAttribute(
    "aria-checked",
    "false",
  );
  await editor.focus();
  if (initialCharacters < passage.length) {
    await page.keyboard.press("Control+A");
    await paste(passage);
    console.log("Inserted paused text", passage.length);
  }
  await page.keyboard.press("Control+Home");
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Profiler.enable");
  async function measure(key, target) {
    await target.focus();
    await page.keyboard.press("Control+Home");
    await page.evaluate(() => {
      globalThis.__editing = {
        keys: [],
        tasks: [],
        mutations: 0,
        active: true,
      };
      const state = globalThis.__editing;
      state.listener = (event) => {
        if (!state.active || !["x", "Backspace"].includes(event.key)) return;
        const start = performance.now();
        // Two frames include a paint opportunity after the input handler.
        requestAnimationFrame(() =>
          requestAnimationFrame(() =>
            state.keys.push({ key: event.key, ms: performance.now() - start }),
          ),
        );
      };
      document.addEventListener("keydown", state.listener, true);
      state.longTasks = new PerformanceObserver((list) =>
        state.tasks.push(
          ...list
            .getEntries()
            .map((e) => ({ start: e.startTime, ms: e.duration })),
        ),
      );
      state.longTasks.observe({ type: "longtask" });
      state.observer = new MutationObserver(
        (records) => (state.mutations += records.length),
      );
      const summary = document.querySelector(".text-analysis-summary-host");
      if (summary)
        state.observer.observe(summary, {
          subtree: true,
          childList: true,
          attributes: true,
          characterData: true,
        });
    });
    const before = await app.evaluate(() => globalThis.__analysisCalls);
    await cdp.send("Profiler.start");
    for (let i = 0; i < samples; i++) {
      await page.keyboard.press(i % 2 ? "Backspace" : "x");
      await page.waitForFunction(
        (n) => globalThis.__editing.keys.length >= n,
        i + 1,
      );
    }
    const { profile: cpu } = await cdp.send("Profiler.stop");
    await writeFile(
      path.join(directory, `${key}.cpuprofile`),
      JSON.stringify(cpu),
    );
    const metrics = await page.evaluate(() => {
      const s = globalThis.__editing;
      s.active = false;
      document.removeEventListener("keydown", s.listener, true);
      s.observer.disconnect();
      s.longTasks.disconnect();
      const percentile = (values) => {
        values.sort((a, b) => a - b);
        const p = (n) => values[Math.floor((values.length - 1) * n)] ?? 0;
        return {
          samples: values.length,
          p50: p(0.5),
          p95: p(0.95),
          p99: p(0.99),
          max: p(1),
        };
      };
      return {
        typingMs: percentile(
          s.keys.filter((x) => x.key === "x").map((x) => x.ms),
        ),
        deletionMs: percentile(
          s.keys.filter((x) => x.key === "Backspace").map((x) => x.ms),
        ),
        longTasks: s.tasks,
        hiddenSummaryMutations: s.mutations,
      };
    });
    metrics.parseRequests =
      (await app.evaluate(() => globalThis.__analysisCalls)) - before;
    const startPaste = performance.now();
    await paste(" pasted text ".repeat(50));
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    metrics.pasteRoundTripMs = performance.now() - startPaste;
    const startSelection = performance.now();
    await page.keyboard.press("Control+Home");
    await page.keyboard.press("Control+Shift+End");
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    metrics.selectAllRoundTripMs = performance.now() - startSelection;
    report.measurements[key] = metrics;
    console.log(key, JSON.stringify(metrics));
  }
  await measure("paused", editor);
  // Compare against an editor with equivalent layout and no application subscribers.
  const plain = await build({
    stdin: {
      contents: `import * as monaco from 'monaco-editor/editor/editor.api.js';
    window.makePlainEditor = (text) => {
      const old = document.querySelector('.text-analysis-editor');
      const bounds = old.getBoundingClientRect();
      const host = document.createElement('div');
      Object.assign(host.style, { position:'fixed', left: bounds.x+'px', top: bounds.y+'px', width: bounds.width+'px', height: bounds.height+'px', zIndex:'99999', background:'white' });
      document.body.append(host);
      const instance = monaco.editor.create(host, { value:text, language:'plaintext', editContext:false, automaticLayout:true, wordWrap:'on', minimap:{enabled:false}, lineNumbers:'off', glyphMargin:false, folding:false, lineDecorationsWidth:12, fontSize:14, fontFamily:'Cascadia Mono, Cascadia Code, Consolas, monospace', lineHeight:22, padding:{top:10,bottom:10}, scrollBeyondLastLine:false, renderLineHighlight:'none', ariaLabel:'Plain baseline' });
      instance.focus();
    };`,
      resolveDir: process.cwd(),
      loader: "js",
    },
    bundle: true,
    write: false,
    outdir: "artifacts/manual-editor/plain",
    format: "iife",
    loader: { ".ttf": "dataurl" },
    logLevel: "silent",
  });
  for (const output of plain.outputFiles) {
    if (output.path.endsWith(".css"))
      await page.addStyleTag({ content: output.text });
    else if (output.path.endsWith(".js"))
      await cdp.send("Runtime.evaluate", { expression: output.text });
  }
  await page.evaluate((text) => window.makePlainEditor(text), passage);
  await measure(
    "plain",
    page.getByRole("textbox", { name: "Plain baseline", exact: true }),
  );
  await writeFile(
    path.join(directory, "report.json"),
    JSON.stringify(report, null, 2),
  );
} finally {
  await app
    .evaluate(({ clipboard }, text) => clipboard.writeText(text), clipboardText)
    .catch(() => {});
  // This owns a throwaway profile. Avoid measuring or waiting for workspace export.
  await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
}
