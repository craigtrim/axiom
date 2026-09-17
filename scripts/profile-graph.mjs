import { _electron as electron } from "@playwright/test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
await mkdir("artifacts/benchmarks", { recursive: true });
const env = {
  ...process.env,
  AXIOM_USER_DATA: await mkdtemp(path.resolve("artifacts/benchmarks/profile-")),
};
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ["."], env }),
  page = await app.firstWindow();
await page.locator('[data-testid="graph-canvas"]').waitFor();
await app.evaluate(({ Menu }) =>
  Menu.getApplicationMenu().getMenuItemById("file.example").click(),
);
await page.waitForFunction(
  async () => (await window.axiom.request("state")).ontology.example,
);
await page.evaluate(async () => {
  await window.axiom.request("regenerate", { size: 100000 });
  await window.axiom.request("budget", { value: 3000 });
  await window.axiom.request("seed", {
    iris: ["http://www.co-ode.org/ontologies/pizza/pizza.owl#Margherita"],
  });
  await window.axiom.request("layout", { mode: "grid" });
});
await app.evaluate(({ Menu }) =>
  Menu.getApplicationMenu()
    .items.find((i) => i.label === "&Graph")
    .submenu.items.find((i) => i.label === "Fit graph")
    .click(),
);
const cdp = await page.context().newCDPSession(page);
await cdp.send("Profiler.enable");
await cdp.send("Profiler.start");
await page.evaluate(
  () =>
    new Promise((resolve) => {
      const c = document.querySelector('[data-testid="graph-canvas"]');
      let n = 0;
      function tick() {
        c.dispatchEvent(
          new WheelEvent("wheel", {
            bubbles: true,
            deltaY: n % 2 ? 1 : -1,
            clientX: 600,
            clientY: 400,
          }),
        );
        if (++n < 240) requestAnimationFrame(tick);
        else resolve(null);
      }
      tick();
    }),
);
const { profile } = await cdp.send("Profiler.stop");
const hits = new Map();
for (let i = 0; i < profile.samples.length; i++)
  hits.set(
    profile.samples[i],
    (hits.get(profile.samples[i]) ?? 0) + (profile.timeDeltas[i] ?? 0),
  );
console.log(
  profile.nodes
    .map((n) => ({
      name: n.callFrame.functionName,
      url: n.callFrame.url.slice(-65),
      ms: (hits.get(n.id) ?? 0) / 1000,
    }))
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 20),
);
console.log(
  await page
    .locator('[data-testid="graph-canvas"]')
    .evaluate((c) => ({ ...c.dataset })),
);
await writeFile(
  "artifacts/benchmarks/graph.cpuprofile",
  JSON.stringify(profile),
);
await app.evaluate(({ dialog }) => {
  dialog.showMessageBox = async () => ({ response: 1 });
});
await app.close();
