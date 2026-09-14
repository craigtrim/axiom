import { _electron as electron } from "@playwright/test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
await mkdir("artifacts/benchmarks", { recursive: true });
const profile = await mkdtemp(path.resolve("artifacts/benchmarks/profile-"));
const env = { ...process.env, AXIOM_USER_DATA: profile };
delete env.ELECTRON_RUN_AS_NODE;
const started = performance.now(),
  app = await electron.launch({
    executablePath: process.env.AXIOM_TEST_EXE,
    args: process.env.AXIOM_TEST_EXE ? [] : ["."],
    env,
  }),
  page = await app.firstWindow();
await page.locator('[data-testid="graph-canvas"]').waitFor();
const out = {
  startupMs: performance.now() - started,
  at: new Date().toISOString(),
};
const errors = [];
page.on("pageerror", (e) => {
  errors.push(e.message);
  console.log("ERROR", e.message);
});
console.log("Started", out.startupMs);
const begin = performance.now();
await page.evaluate(() => window.axiom.request("regenerate", { size: 100000 }));
await page.locator(".status-counts").filter({ hasText: "725,379" }).waitFor();
out.regenerationMs = performance.now() - begin;
console.log("Regenerated", out.regenerationMs);
await page.evaluate(async () => {
  await window.axiom.request("budget", { value: 3000 });
  await window.axiom.request("seed", {
    iris: ["http://www.co-ode.org/ontologies/pizza/pizza.owl#Margherita"],
  });
});
async function frames(mode, count = 600) {
  console.log("Frames", mode);
  await page.bringToFront();
  await page.evaluate((mode) => window.axiom.request("layout", { mode }), mode);
  const canvas = page.locator('[data-testid="graph-canvas"]');
  await app.evaluate(({ Menu }) => {
    const item = Menu.getApplicationMenu()
      .items.find((i) => i.label === "&Graph")
      .submenu.items.find((i) => i.label === "Fit graph");
    item.click();
  });
  const b = await canvas.boundingBox();
  await page.mouse.move(b.x + 15, b.y + 15);

  const result = await page.evaluate(
    ({ count }) =>
      new Promise((resolve) => {
        const c = document.querySelector('[data-testid="graph-canvas"]'),
          r = c.getBoundingClientRect(),
          samples = [],
          intervals = [];
        let last = 0,
          raf = 0,
          step = 0;
        const move = () => {
          step++;
          c.dispatchEvent(
            new WheelEvent("wheel", {
              bubbles: true,
              clientX: r.x + 15 + Math.sin(step * 0.01) * 50,
              clientY: r.y + 15 + Math.cos(step * 0.01) * 15,
              deltaY: step % 2 === 0 ? 1 : -1,
            }),
          );
          raf = requestAnimationFrame(move);
        };
        const receive = (e) => {
          samples.push(e.detail.milliseconds);
          if (last) intervals.push(e.detail.time - last);
          last = e.detail.time;
          if (samples.length >= count) {
            cancelAnimationFrame(raf);
            c.removeEventListener("axiom:frame", receive);
            samples.sort((a, b) => a - b);
            intervals.sort((a, b) => a - b);
            const p = (a, v) => a[Math.floor((a.length - 1) * v)];
            resolve({
              draws: samples.length,
              drawMs: {
                p50: p(samples, 0.5),
                p95: p(samples, 0.95),
                p99: p(samples, 0.99),
              },
              intervalMs: {
                p50: p(intervals, 0.5),
                p95: p(intervals, 0.95),
                p99: p(intervals, 0.99),
              },
            });
          }
        };
        c.addEventListener("axiom:frame", receive);
        raf = requestAnimationFrame(move);
        setTimeout(() => {
          if (samples.length < count) {
            cancelAnimationFrame(raf);
            c.removeEventListener("axiom:frame", receive);
            resolve({
              timeout: true,
              samples: samples.length,
              draws: c.dataset.draws,
              p95: c.dataset.p95,
              step,
              wheels: c.dataset.wheels,
              connected: c.isConnected,
            });
          }
        }, 30000);
      }),
    { count },
  );
  console.log("Result", mode, result);
  return result;
}
out.graph3kForce = await frames("force");
out.graph3kGrid = await frames("grid");
await page.evaluate(async () => {
  await window.axiom.request("clear");
  await window.axiom.request("budget", { value: 1000 });
  await window.axiom.request("seed", {
    iris: ["http://www.co-ode.org/ontologies/pizza/pizza.owl#Margherita"],
  });
});
out.graph1kForce = await frames("force");
await page.screenshot({ path: "artifacts/benchmarks/graph-1000.png" });
const cdp = await page.context().newCDPSession(page);
await cdp.send("HeapProfiler.collectGarbage");
await cdp.detach();
out.rendererGarbageCollected = true;
out.gpu = await app.evaluate(({ app }) => app.getGPUFeatureStatus());
out.processes = await app.evaluate(async ({ app }) =>
  app
    .getAppMetrics()
    .map((p) => ({ type: p.type, name: p.name, memory: p.memory })),
);
out.workingSetMB = out.processes.reduce(
  (sum, p) => sum + p.memory.workingSetSize / 1024,
  0,
);
out.errors = errors;
await writeFile(
  "artifacts/benchmarks/desktop.json",
  JSON.stringify(out, null, 2),
);
console.log(JSON.stringify(out, null, 2));
await app.evaluate(({ dialog }) => {
  dialog.showMessageBox = async () => ({
    response: 1,
    checkboxChecked: false,
  });
});
await app.close();
