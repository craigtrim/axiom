import {
  test,
  expect,
  _electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import { holdRequests, waitForHeld, releaseRequests } from "./held-requests";

let app: ElectronApplication, page: Page;
const errors: string[] = [];
const pane = () => page.locator('[data-panel="find"]');
const host = () => page.locator('[data-pane-id="find"]');
const rows = () => pane().locator(".find-results tbody tr");
const query = () =>
  pane().getByRole("searchbox", { name: "Search the ontology" });
const inspector = () => pane().locator(".find-inspector");
async function menu(id: string) {
  const win = await app.browserWindow(page);
  const target = await win.evaluate((w) => w.id);
  await app.evaluate(
    ({ Menu, BrowserWindow }, { id, target }) => {
      const w = BrowserWindow.fromId(target)!;
      Menu.getApplicationMenu()!
        .getMenuItemById(id)!
        .click({} as never, w, w.webContents as never);
    },
    { id, target },
  );
}
const settle = () =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
async function size(height: number, width = 860) {
  await host().evaluate(
    (el, size) =>
      Object.assign((el as HTMLElement).style, {
        position: "fixed",
        top: "24px",
        left: "24px",
        width: `${size.width}px`,
        height: `${size.height}px`,
        zIndex: "1000",
      }),
    { width, height },
  );
  await settle();
  await expect
    .poll(async () => (await pane().boundingBox())!.height)
    .toBeCloseTo(height, 0);
}
const geometry = () =>
  pane().evaluate((root) => {
    const list = root.querySelector<HTMLElement>(".find-results-scroll")!;
    const table = root.querySelector<HTMLElement>(".find-results")!;
    return {
      top: list.getBoundingClientRect().top,
      width: table.getBoundingClientRect().width,
      tableHeight: table.getBoundingClientRect().height,
      height: list.clientHeight,
      content: list.scrollHeight,
      scroll: list.scrollTop,
      columns: [...table.querySelectorAll("th")].map(
        (el) => el.getBoundingClientRect().width,
      ),
    };
  });
test.beforeEach(async () => {
  errors.length = 0;
  await mkdir("artifacts/issue-36", { recursive: true });
  const profile = await mkdtemp(path.resolve("artifacts/issue-36/test-"));
  const env = {
    ...process.env,
    AXIOM_USER_DATA: profile,
    AXIOM_CACHE_HOME: path.join(profile, "cache"),
    AXIOM_EMBEDDING_MODEL_DIR: path.join(profile, "missing-model"),
  } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  app = await _electron.launch({
    executablePath: process.env.AXIOM_TEST_EXE,
    args: process.env.AXIOM_TEST_EXE ? [] : ["."],
    env,
  });
  page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  await expect(page.locator(".docking-workspace")).toBeVisible();
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((w) => {
      w.setFocusable(false);
      w.unmaximize();
      w.setContentSize(1200, 950);
    }),
  );
  const file = path.join(profile, "context.ttl");
  await writeFile(
    file,
    `@prefix : <https://context.test/> . @prefix owl: <http://www.w3.org/2002/07/owl#> . @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> . @prefix skos: <http://www.w3.org/2004/02/skos/core#> .
    : a owl:Ontology . :Root a owl:Class; rdfs:label "Foundation" .
    ${Array.from({ length: 80 }, (_, i) => `:Topic${i} a owl:Class; rdfs:label "${i < 6 ? "Boundary" : "Topic"} ${String(i).padStart(2, "0")}"; rdfs:subClassOf :Root; skos:altLabel "Alias ${i}"; rdfs:comment "Description ${i}" .`).join("\n")}`,
  );
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, file);
  await menu("file.open");
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          (await window.axiom.request<{ ontology: { name: string } }>("state"))
            .ontology.name,
      ),
    )
    .toBe("context.ttl");
  await menu("view.find");
  await expect(rows()).toHaveCount(50);
  await size(560);
});
test.afterEach(async ({}, info) => {
  try {
    if (info.status !== info.expectedStatus && !page.isClosed())
      await info.attach("context", {
        body: await page.screenshot(),
        contentType: "image/png",
      });
    expect(errors).toEqual([]);
  } finally {
    await app?.close();
  }
});

test("the empty context takes no space and clears immediately while replacement results are pending", async () => {
  await expect(inspector()).toHaveCount(0);
  const pager = (await pane().locator(".find-pagination").boundingBox())!;
  const store = (await pane().locator(".find-store").boundingBox())!;
  expect(store.y).toBeCloseTo(pager.y + pager.height, 0);
  await query().fill("Boundary");
  await expect(rows()).toHaveCount(6);
  await rows().first().press("Space");
  await expect(inspector()).toBeVisible();
  for (const text of [
    "Boundary 00",
    "Class",
    "https://context.test/Topic0",
    "Foundation",
    "Alias 0",
    "Description 0",
  ])
    await expect(inspector()).toContainText(text);
  await holdRequests(app, ["find"]);
  await query().fill("Missing name");
  await waitForHeld(app);
  await expect(inspector()).toHaveCount(0);
  await expect(rows()).toHaveCount(6);
  await releaseRequests(app);
  await expect(rows()).toHaveCount(0);
  await expect(inspector()).toHaveCount(0);
  await expect(pane()).not.toContainText("Select a result to inspect it.");
});

for (const detached of [false, true]) {
  test(`selection preserves columns when it introduces scrolling (${detached ? "detached" : "docked"})`, async () => {
    if (detached) {
      const opened = app.waitForEvent("window");
      await query().focus();
      await menu("pane.detach");
      page = await opened;
      page.on("pageerror", (e) => errors.push(e.message));
      await (
        await app.browserWindow(page)
      ).evaluate((w) => {
        w.setFocusable(false);
        w.setContentSize(1200, 950);
      });
      await expect(pane()).toBeVisible();
      await size(560);
    }
    await query().fill("Boundary");
    await expect(rows()).toHaveCount(6);
    const initial = await geometry();
    // Put the last row just above the bottom, so adding context needs a scrollbar.
    await size(560 + initial.tableHeight - initial.height + 12);
    const before = await geometry();
    expect(before.content).toBe(before.height);
    await pane().screenshot({
      path: `artifacts/issue-36/${detached ? "detached" : "docked"}-unselected.png`,
    });
    await rows().first().press("Space");
    await expect(inspector()).toBeVisible();
    await settle();
    const after = await geometry();
    expect(after.content).toBeGreaterThan(after.height);
    expect(after.top).toBe(before.top);
    expect(after.width).toBe(before.width);
    expect(after.columns).toEqual(before.columns);
    expect(after.scroll).toBe(before.scroll);
    await writeFile(
      `artifacts/issue-36/selection-${detached ? "detached" : "docked"}.json`,
      JSON.stringify({ before, after }, null, 2),
    );
    await pane().screenshot({
      path: `artifacts/issue-36/${detached ? "detached" : "docked"}-selected.png`,
    });
  });
}

test("selecting a scrolled result preserves its position and focus", async () => {
  const list = pane().locator(".find-results-scroll");
  await list.evaluate((el) => {
    el.scrollTop = 400;
  });
  const visible = await rows().evaluateAll((elements) => {
    const view = elements[0]
      .closest(".find-results-scroll")!
      .getBoundingClientRect();
    return elements.findIndex((el) => {
      const r = el.getBoundingClientRect();
      return r.top > view.top + 40 && r.bottom < view.bottom - 40;
    });
  });
  expect(visible).toBeGreaterThan(0);
  const row = rows().nth(visible);
  await row.focus();
  const before = await geometry();
  const top = (await row.boundingBox())!.y;
  await row.press("Space");
  await expect(inspector()).toBeVisible();
  await settle();
  expect((await geometry()).scroll).toBe(before.scroll);
  expect((await row.boundingBox())!.y).toBe(top);
  await expect(row).toBeFocused();
});

test("short panes keep the result header stable when a selection cannot fit its context", async () => {
  await query().fill("Boundary");
  await expect(rows()).toHaveCount(6);
  for (const height of [360, 340, 300]) {
    await query().fill("");
    await query().fill("Boundary");
    await expect(rows()).toHaveCount(6);
    await expect(inspector()).toHaveCount(0);
    await size(height);
    const before = await geometry();
    const header = await pane().locator(".find-results-toolbar").isVisible();
    const pager = await pane().locator(".find-pagination").isVisible();
    await rows().first().press("Space");
    await settle();
    expect((await geometry()).top).toBe(before.top);
    expect(await pane().locator(".find-results-toolbar").isVisible()).toBe(
      header,
    );
    expect(await pane().locator(".find-pagination").isVisible()).toBe(pager);
    await expect(rows().first()).toBeFocused();
  }
  await size(560);
  await expect(inspector()).toBeVisible();
});
