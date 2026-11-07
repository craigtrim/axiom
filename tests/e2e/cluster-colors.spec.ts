// craigtrim/axiom#185: Color clusters colors each cluster once hiding splits the graph.
// craigtrim/axiom#200: the box always shows and says why while it is disabled.
// craigtrim/axiom#205: visual clustering, its live slider and saved per-view setting.
import { launchExample } from "./example-fixture";
import { observeDomainService } from "./domain-service-observer";
import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Locator,
  type Page,
} from "@playwright/test";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import path from "node:path";
import type { Snapshot, DomainMethod } from "../../src/shared/protocol";
import {
  entity,
  iriTerm,
  NS,
  SUBCLASS,
  THING,
  TYPE,
} from "../../src/domain/model";
import type { Workspace } from "../../src/domain/workspace";
let app: ElectronApplication, page: Page, profile: string;
const errors: string[] = [];
const state = () =>
  page.evaluate(() => window.axiom.request<Snapshot>("state"));
const request = (method: DomainMethod, args: Record<string, unknown> = {}) =>
  page.evaluate(({ method, args }) => window.axiom.request(method, args), {
    method,
    args,
  });
async function menu(id: string) {
  await app.evaluate(({ Menu, BrowserWindow }, id) => {
    const win = BrowserWindow.getAllWindows()[0];
    const item = Menu.getApplicationMenu()!.getMenuItemById(id)!;
    item.click({} as never, win, win.webContents as never);
  }, id);
}
function options() {
  const env = {
    ...process.env,
    AXIOM_CACHE_HOME: path.join(profile, "cache"),
    AXIOM_USER_DATA: profile,
  } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  return {
    executablePath: process.env.AXIOM_TEST_EXE,
    args: process.env.AXIOM_TEST_EXE ? [] : ["."],
    env,
  };
}
async function attach() {
  page = await app.firstWindow();
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({
      response: 1,
      checkboxChecked: false,
    });
  });
  page.on("pageerror", (e) => errors.push(e.message));
  if (process.env.AXIOM_TEST_BACKGROUND === "1")
    await (
      await app.browserWindow(page)
    ).evaluate((w) => w.setFocusable(false));
  await expect(
    page
      .locator(".graph-panel:visible .graph-command-layer")
      .getByRole("button", { name: "Display", exact: true })
      .first(),
  ).toBeVisible();
}
// The graph's display settings live in the Display flyout, a light-dismiss popover.
const displayTrigger = (scope: Locator) =>
  scope
    .locator(".graph-command-layer")
    .getByRole("button", { name: "Display", exact: true });
async function openDisplay(scope = page.locator(".graph-panel:visible")) {
  const trigger = displayTrigger(scope);
  if ((await trigger.getAttribute("aria-expanded")) !== "true")
    await trigger.click();
  const flyout = scope.getByRole("dialog", {
    name: "Display options",
    exact: true,
  });
  await expect(flyout).toBeVisible();
  return flyout;
}
// Closed before canvas screenshots, which would otherwise include the flyout.
async function closeDisplay(scope = page.locator(".graph-panel:visible")) {
  const trigger = displayTrigger(scope);
  if ((await trigger.getAttribute("aria-expanded")) === "true")
    await trigger.click();
  await expect(
    scope.getByRole("dialog", { name: "Display options", exact: true }),
  ).toBeHidden();
}
test.beforeEach(async () => {
  errors.length = 0;
  await mkdir("artifacts/testing", { recursive: true });
  profile = await mkdtemp(path.resolve("artifacts/testing/clusters-"));
  app = await launchExample(options());
  await attach();
});
test.afterEach(async ({}, info) => {
  if (info.status !== info.expectedStatus)
    await info.attach("clusters-failure", {
      body: await page.screenshot(),
      contentType: "image/png",
    });
  await app.close();
  expect(errors).toEqual([]);
});
const colorClusters = () =>
  page
    .locator(".graph-panel:visible")
    .getByRole("checkbox", { name: "Color clusters", exact: true });
const clusterLabel = () =>
  page.locator(".graph-panel:visible .graph-cluster-colors");
const clusterSlider = () =>
  page
    .locator(".graph-panel:visible")
    .getByRole("slider", { name: "Clusters", exact: true });
const reasons = {
  enabled: "Give each cluster at this Clusters setting its own color.",
  one: "Needs two or more clusters. At this Clusters setting the displayed nodes form one cluster; move the Clusters slider or hide nodes to split it.",
  none: "Needs two or more clusters. At this Clusters setting no displayed nodes group together.",
  empty: "Needs two or more clusters. The graph shows no nodes.",
};
// The reason shows on hover over the box or its name, and screen readers read it.
async function reason(text: string) {
  await expect(clusterLabel()).toHaveAttribute("title", text);
  await expect(colorClusters()).toHaveAccessibleDescription(text);
}
// Connected groups of two or more displayed nodes, as the issue defines them.
function clusters(g: Snapshot["graph"], skip?: string) {
  const iris = g.nodes.map((n) => n.iri).filter((iri) => iri !== skip);
  const links = new Map(iris.map((iri) => [iri, new Set<string>()]));
  for (const e of g.edges)
    if (links.has(e.source) && links.has(e.target)) {
      links.get(e.source)!.add(e.target);
      links.get(e.target)!.add(e.source);
    }
  const seen = new Set<string>(),
    groups: string[][] = [];
  for (const iri of iris) {
    if (seen.has(iri)) continue;
    const group = [iri];
    seen.add(iri);
    for (let i = 0; i < group.length; i++)
      for (const next of links.get(group[i])!)
        if (!seen.has(next)) {
          seen.add(next);
          group.push(next);
        }
    if (group.length > 1) groups.push(group);
  }
  return { groups, links };
}
// Hide the first node whose removal leaves at least two clusters.
async function split() {
  const g = (await state()).graph;
  const cut = g.nodes.find((n) => clusters(g, n.iri).groups.length > 1)!;
  expect(cut, "the example graph has a node that splits it").toBeTruthy();
  await request("remove", { iri: cut.iri });
  await expect
    .poll(async () => (await state()).graph.clusterCount)
    .toBeGreaterThan(1);
  return cut.iri;
}

test("Color clusters is disabled with its reason until a split, colors each cluster and keeps other clusters' colors when a node is hidden", async () => {
  await request("freeze");
  await request("layout", { mode: "circle" });
  await request("clusterLooseness", { value: 0 });
  await menu("graph.fit");
  const initial = await state();
  expect(initial.graph.clusterCount).toBe(
    clusters(initial.graph).groups.length,
  );
  expect(
    initial.graph.clusterCount,
    "the example graph opens as one cluster",
  ).toBe(1);
  await openDisplay();
  await expect(colorClusters()).toBeVisible();
  await expect(colorClusters()).toBeDisabled();
  await expect(clusterSlider()).toBeEnabled();
  await reason(reasons.one);
  const cut = await split();
  await expect(colorClusters()).toBeEnabled();
  await reason(reasons.enabled);
  // Showing the hidden node again joins the graph back into one cluster.
  await request("seed", { iris: [cut], replace: false, expand: false });
  await expect.poll(async () => (await state()).graph.clusterCount).toBe(1);
  await expect(colorClusters()).toBeDisabled();
  await reason(reasons.one);
  await request("remove", { iri: cut });
  await expect
    .poll(async () => (await state()).graph.clusterCount)
    .toBeGreaterThan(1);
  await expect(colorClusters()).toBeEnabled();
  await expect(colorClusters()).not.toBeChecked();
  const canvas = page.getByTestId("graph-canvas");
  await closeDisplay();
  const before = await canvas.screenshot();
  await openDisplay();
  await colorClusters().click();
  await expect.poll(async () => (await state()).graph.clusterColors).toBe(true);
  await expect(colorClusters()).toBeChecked();
  await closeDisplay();
  const colored = (await state()).graph,
    { groups, links } = clusters(colored),
    number = new Map(colored.nodes.map((n) => [n.iri, n.cluster]));
  const numbers = groups.map((g) => number.get(g[0]));
  expect(new Set(numbers).size).toBe(groups.length);
  for (const [i, g] of groups.entries())
    for (const iri of g) expect(number.get(iri)).toBe(numbers[i]);
  for (const n of colored.nodes)
    if (!groups.some((g) => g.includes(n.iri)))
      expect(n.cluster).toBeUndefined();
  await expect
    .poll(async () => (await canvas.screenshot()).equals(before))
    .toBe(false);
  await page.screenshot({ path: "artifacts/testing/cluster-colors.png" });

  await openDisplay();
  await colorClusters().focus();
  await page.keyboard.press("Control+z");
  await expect(colorClusters()).not.toBeChecked();
  await page.keyboard.press("Control+y");
  await expect(colorClusters()).toBeChecked();
  expect((await state()).graph.nodes.map((n) => [n.iri, n.cluster])).toEqual(
    colored.nodes.map((n) => [n.iri, n.cluster]),
  );
  await closeDisplay();

  // A leaf of a cluster of three or more leaves that cluster in one piece.
  const largest = groups.reduce((a, g) => (g.length > a.length ? g : a));
  expect(largest.length).toBeGreaterThan(2);
  const leaf = largest.find((iri) => links.get(iri)!.size === 1)!;
  await request("remove", { iri: leaf });
  await expect
    .poll(async () => (await state()).graph.nodes.some((n) => n.iri === leaf))
    .toBe(false);
  const after = (await state()).graph;
  for (const n of after.nodes) expect(n.cluster).toBe(number.get(n.iri));

  const svg = path.join(profile, "clusters.svg");
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, svg);
  await menu("graph.export.svg");
  await page
    .getByRole("dialog", { name: "Export", exact: true })
    .getByRole("button", { name: "Export", exact: true })
    .click();
  // The first cluster color is #3F90DA in both themes.
  await expect
    .poll(async () => {
      try {
        return await readFile(svg, "utf8");
      } catch {
        return "";
      }
    })
    .toMatch(/#3f90da/i);
  // The second is #C68101 in the light theme and #FFA90E in the dark one, so
  // two clusters were drawn in two different colors.
  expect(await readFile(svg, "utf8")).toMatch(/#c68101|#ffa90e/i);

  await openDisplay();
  await colorClusters().click();
  await expect
    .poll(async () => (await state()).graph.clusterColors)
    .toBe(false);
  expect(
    (await state()).graph.nodes.every((n) => n.cluster === undefined),
  ).toBe(true);

  await request("clear");
  await expect.poll(async () => (await state()).graph.nodes.length).toBe(0);
  await expect(colorClusters()).toBeDisabled();
  await reason(reasons.empty);
  await expect(clusterSlider()).toBeDisabled();
  // One node on its own is displayed but belongs to no cluster.
  await request("seed", { iris: [cut], replace: false, expand: false });
  await expect.poll(async () => (await state()).graph.nodes.length).toBe(1);
  expect((await state()).graph.clusterCount).toBe(0);
  await expect(colorClusters()).toBeDisabled();
  await reason(reasons.none);
  await expect(clusterSlider()).toBeEnabled();
});

test("Color clusters is saved with the workspace and restored on reopen", async () => {
  await request("freeze");
  await request("clusterLooseness", { value: 0 });
  await split();
  await openDisplay();
  await colorClusters().click();
  await expect.poll(async () => (await state()).graph.clusterColors).toBe(true);
  const second = await request("graphCreate", {
    iris: (await state()).graph.nodes.map((node) => node.iri),
    expand: false,
  });
  expect(typeof second).toBe("string");
  expect((await state()).graphs![second as string].clusterLooseness).toBe(1);
  await request("freeze", { graphId: second });
  await request("clusterLooseness", { value: 0.65, graphId: second });
  await request("graphActivate", { id: "graph" });
  const file = path.join(profile, "Clusters.axiom");
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, file);
  await menu("file.saveAs");
  await expect.poll(async () => (await state()).dirty).toBe(false);
  const doc = JSON.parse(await readFile(file, "utf8"));
  expect(doc.graphs.graph.clusterColors).toBe(true);
  expect(doc.graphs.graph.clusterLooseness).toBe(0);
  expect(doc.graphs[second as string].clusterLooseness).toBe(0.65);
  await expect
    .poll(async () => {
      try {
        return JSON.parse(
          await readFile(path.join(profile, "last-session.json"), "utf8"),
        ).workspace.graphs[second as string].clusterLooseness;
      } catch {
        return undefined;
      }
    })
    .toBe(0.65);
  await app.close();
  app = await electron.launch(options());
  await attach();
  const restored = await state();
  expect(restored.graphs!.graph.clusterColors).toBe(true);
  expect(restored.graphs!.graph.clusterLooseness).toBe(0);
  expect(restored.graphs![second as string].clusterLooseness).toBe(0.65);
  expect(restored.graph.clusterCount).toBeGreaterThan(1);
  await page.getByRole("tab", { name: "Graph", exact: true }).click();
  await openDisplay();
  await expect(colorClusters()).toBeChecked();
  await expect(clusterSlider()).toHaveAttribute("aria-valuetext", "0%");
});

// Two packed squares joined by one long relationship: one island, two visual groups.
function visualWorkspace(): Workspace {
  const iris = Array.from({ length: 8 }, (_, i) => "urn:clusters:node" + i);
  const members = iris.map((iri, i) => {
    const node = entity(iri, "Class");
    node.parents = [i ? iris[i - 1] : THING];
    return node;
  });
  return {
    format: "axiom-workspace",
    version: 1,
    entities: [entity(THING, "Class"), ...members],
    tbox: members.flatMap((node) => [
      { subject: node.iri, predicate: TYPE, object: iriTerm(NS.owl + "Class") },
      {
        subject: node.iri,
        predicate: SUBCLASS,
        object: iriTerm(node.parents[0]),
      },
    ]),
    individuals: [],
    customers: [],
    selected: null,
    graph: {
      iris,
      focus: [],
      pins: [],
      budget: 1000,
      layout: "circle",
      frozen: true,
      positions: iris.map((iri, i) => ({
        iri,
        x: (i < 4 ? -336 : 300) + (i % 2) * 36,
        y: Math.floor((i % 4) / 2) * 36 - 18,
      })),
      // An older workspace has no clusterLooseness and must open at Loose.
    },
  };
}

test("Clusters defaults to Loose, previews a connected graph's visual groups and records one undo step per drag", async () => {
  expect((await state()).graph.clusterLooseness).toBe(1);
  await request("load", { document: visualWorkspace() });
  await expect.poll(async () => (await state()).graph.clusterLooseness).toBe(1);
  await expect.poll(async () => (await state()).graph.clusterCount).toBe(2);
  expect(clusters((await state()).graph).groups).toHaveLength(1);
  await openDisplay();
  await expect(clusterSlider()).toHaveAttribute("min", "0");
  await expect(clusterSlider()).toHaveAttribute("max", "100");
  await expect(clusterSlider()).toHaveAttribute("step", "5");
  await expect(clusterSlider()).toHaveAttribute("aria-valuetext", "100%");
  const control = page.locator(".graph-panel:visible .graph-clusters");
  await expect(control.getByText("Strict", { exact: true })).toBeVisible();
  await expect(control.getByText("Loose", { exact: true })).toBeVisible();
  await expect(colorClusters()).toBeEnabled();
  await expect(colorClusters()).not.toBeChecked();
  await colorClusters().check();
  await clusterSlider().focus();
  await page.keyboard.press("Home");
  await expect.poll(async () => (await state()).graph.clusterLooseness).toBe(0);
  await expect.poll(async () => (await state()).graph.clusterCount).toBe(1);
  await expect(colorClusters()).toBeChecked();
  await expect(colorClusters()).toBeDisabled();
  await expect(clusterSlider()).toBeEnabled();
  await reason(reasons.one);

  // Give the drag a distinct predecessor; Undo must remove every preview together.
  await request("edgeVisibility", { visible: false });
  const before = await state();
  expect(before.undoLabel).not.toBe("Change clusters");
  const coordinates = (snapshot: Snapshot) =>
    snapshot.graph.nodes.map((node) => [node.iri, node.x, node.y]);
  await observeDomainService(app, page);
  const observation = await app.evaluateHandle(() => {
    const owner = (globalThis as any).__domainServiceObserver;
    const previous = owner.beforeRequest;
    const requests: {
      at: number;
      value: number;
      preview: boolean;
      graphId: string;
      datasetEpoch: number;
    }[] = [];
    const started = performance.now();
    const beforeRequest = (packet: {
      method: string;
      args: Record<string, unknown>;
    }) => {
      previous?.(packet);
      if (packet.method === "clusterLooseness")
        requests.push({
          at: performance.now(),
          ...packet.args,
        } as (typeof requests)[number]);
    };
    owner.beforeRequest = beforeRequest;
    return {
      requests,
      started,
      dispose: () => {
        if (owner.beforeRequest === beforeRequest)
          owner.beforeRequest = previous;
      },
    };
  });
  try {
    const box = (await clusterSlider().boundingBox())!;
    const x = (percent: number) =>
      box.x + 8 + ((box.width - 16) * percent) / 100;
    const y = box.y + box.height / 2;
    await page.mouse.move(x(0), y);
    await page.mouse.down();
    await page.mouse.move(x(45), y, { steps: 12 });
    await expect
      .poll(async () => (await state()).graph.clusterLooseness)
      .toBeGreaterThan(0.3);
    await expect.poll(async () => (await state()).graph.clusterCount).toBe(2);
    await expect(colorClusters()).toBeEnabled();
    expect(
      (await observation.evaluate((value) => value.requests)).some(
        (entry) => entry.preview,
      ),
    ).toBe(true);
    await page.mouse.move(x(100), y, { steps: 14 });
    await page.mouse.up();
    await expect
      .poll(async () => (await state()).graph.clusterLooseness)
      .toBe(1);
    await expect
      .poll(() =>
        observation.evaluate(
          (value) => value.requests.filter((entry) => !entry.preview).length,
        ),
      )
      .toBe(1);
    const sent = await observation.evaluate((value) => value.requests);
    expect(sent.at(-1)).toMatchObject({ value: 1, preview: false });
    const previews = sent.filter((entry) => entry.preview);
    expect(previews.length).toBeGreaterThan(0);
    // A timer coalesces input events; native delivery must not forward every pointer step.
    expect(previews.length).toBeLessThan(26);
    const elapsed =
      sent.at(-1)!.at - (await observation.evaluate((value) => value.started));
    expect(previews.length).toBeLessThanOrEqual(Math.ceil(elapsed / 80) + 1);
    for (const entry of sent) {
      expect(entry.graphId).toBe("graph");
      expect(entry.datasetEpoch).toBe(before.datasetEpoch);
      expect(Math.round(entry.value * 100) % 5).toBe(0);
    }
    await expect(clusterSlider()).toHaveAttribute("aria-valuetext", "100%");
    const after = await state();
    expect(after.undoLabel).toBe("Change clusters");
    expect(coordinates(after)).toEqual(coordinates(before));
    await menu("edit.undo");
    await expect
      .poll(async () => (await state()).graph.clusterLooseness)
      .toBe(0);
    expect((await state()).undoLabel).toBe(before.undoLabel);
    expect((await state()).graph.clusterCount).toBe(1);
    await menu("edit.redo");
    await expect
      .poll(async () => (await state()).graph.clusterLooseness)
      .toBe(1);
    expect((await state()).graph.clusterCount).toBe(2);
    expect(coordinates(await state())).toEqual(coordinates(before));
  } finally {
    await page.mouse.up();
    await observation.evaluate((value) => value.dispose());
    await observation.dispose();
  }
});
