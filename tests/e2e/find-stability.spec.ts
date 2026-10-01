import {
  test,
  expect,
  box,
  fixedBox,
  bounds,
  namespace,
  type Desktop,
} from "./modal-fixture";
import type { Snapshot } from "../../src/shared/protocol";
const phrase = "ethics & social care";
async function open(d: Desktop, text = "e") {
  await d.menu("entity.search");
  const dialog = d.page.getByRole("dialog", {
    name: "Find entities",
    exact: true,
  });
  const input = dialog.getByRole("combobox", { name: "Search entities" });
  await input.fill(text);
  await expect(dialog.getByRole("listbox")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect(dialog.getByRole("option")).toHaveCount(6);
  return { dialog, input };
}
async function record(d: Desktop, selector: string, rowSelector: string) {
  await d.page.evaluate(
    ({ selector, rowSelector }) => {
      const root = document.querySelector(selector)!,
        input = root.querySelector("input")!;
      const records: {
        rows: number;
        status: string;
        x: number;
        y: number;
        width: number;
        caret: number | null;
        length: number;
      }[] = [];
      let running = true;
      const sample = () => {
        const rect = input.getBoundingClientRect();
        records.push({
          rows: root.querySelectorAll(rowSelector).length,
          status: root.querySelector('[role="status"]')?.textContent ?? "",
          x: rect.x,
          y: rect.y,
          width: rect.width,
          caret: input.selectionStart,
          length: input.value.length,
        });
      };
      const observer = new MutationObserver(sample);
      observer.observe(root, {
        childList: true,
        subtree: true,
        characterData: true,
      });
      const frame = () => {
        if (running) {
          sample();
          requestAnimationFrame(frame);
        }
      };
      sample();
      requestAnimationFrame(frame);
      (window as any).__findObservation = () => {
        running = false;
        observer.disconnect();
        return records;
      };
    },
    { selector, rowSelector },
  );
}
async function checkRecords(d: Desktop, stableInput = true) {
  const records = (await d.page.evaluate(() =>
    (window as any).__findObservation(),
  )) as {
    rows: number;
    status: string;
    x: number;
    y: number;
    width: number;
    caret: number;
    length: number;
  }[];
  expect(records.length).toBeGreaterThan(10);
  for (const entry of records) {
    expect(entry.rows).toBeGreaterThan(0);
    expect(entry.status).not.toBe("Searching...");
    if (stableInput) {
      expect(entry.x).toBeCloseTo(records[0].x, 1);
      expect(entry.y).toBeCloseTo(records[0].y, 1);
      expect(entry.width).toBeCloseTo(records[0].width, 1);
    }
  }
}
for (const [name, width, height, zoom] of [
  ["default", 1280, 900, 1],
  ["short", 1280, 450, 1],
  ["narrow", 480, 700, 1],
  ["zoomed", 1280, 900, 1.5],
] as const) {
  test(`quick Find keeps its anchor, input and populated list through typing and deletion in a ${name} window`, async ({
    desktop: d,
  }) => {
    await d.resize(width, height, zoom);
    await d.menu("entity.search");
    const dialog = d.page.getByRole("dialog", { name: "Find entities" });
    const input = dialog.getByRole("combobox");
    const original = await box(dialog),
      inputBox = await box(input);
    await input.pressSequentially("e");
    await expect(dialog.getByRole("option")).toHaveCount(6);
    await fixedBox(dialog, original);
    await fixedBox(input, inputBox);
    await record(d, 'dialog[aria-label="Find entities"]', '[role="option"]');
    for (const ch of phrase.slice(1)) {
      await input.pressSequentially(ch);
      await fixedBox(dialog, original);
      await fixedBox(input, inputBox);
      expect(
        await input.evaluate((el) => (el as HTMLInputElement).selectionStart),
      ).toBe((await input.inputValue()).length);
    }
    for (let i = 1; i < phrase.length; i++) await input.press("Backspace");
    await expect(dialog.getByRole("listbox")).toHaveAttribute(
      "aria-busy",
      "false",
    );
    await checkRecords(d);
    await bounds(dialog);
    await expect(input).toBeFocused();
    await expect(
      dialog.getByRole("button", { name: "Show results", exact: true }),
    ).toBeInViewport();
  });
}
test("the full Find view keeps populated rows throughout query replacement", async ({
  desktop: d,
}) => {
  const { input } = await open(d);
  await input.press("Enter");
  const pane = d.page.getByRole("region", { name: "Find entities results" });
  const query = pane.getByRole("searchbox", { name: "Search the ontology" });
  await expect(pane.locator(".find-results-scroll")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await record(d, ".find-panel", ".find-results tbody tr");
  await query.press("End");
  await query.pressSequentially(phrase.slice(1), { delay: 20 });
  await expect(pane.locator(".find-results-scroll")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await checkRecords(d);
});
test("full Find retains display-only rows and blocks graph, synonym and paging actions until fresh results arrive", async ({
  desktop: d,
}) => {
  const { input } = await open(d, "ethics");
  await input.press("Enter");
  const pane = d.page.getByRole("region", { name: "Find entities results" });
  const query = pane.getByRole("searchbox", { name: "Search the ontology" });
  await expect(pane.locator(".find-result-name").first()).toBeEnabled();
  const labels = await pane.locator(".find-result-name").allTextContents();
  await intercept(d, ["marine"]);
  await query.fill("marine");
  await held(d);
  expect(await pane.locator(".find-result-name").allTextContents()).toEqual(
    labels,
  );
  await expect(pane.locator(".find-result-name").first()).toBeDisabled();
  await expect(
    pane.getByRole("button", { name: "Open results in new graph" }),
  ).toBeDisabled();
  await expect(
    pane.getByRole("button", { name: "Next results page" }),
  ).toBeDisabled();
  for (const button of await pane.locator(".find-synonym").all())
    await expect(button).toBeDisabled();
  const previous = (await d.request<Snapshot>("state")).selected;
  await pane.locator(".find-results tbody tr").first().dispatchEvent("click");
  expect((await d.request<Snapshot>("state")).selected).toBe(previous);
  await release(d);
  await expect(pane.locator(".find-result-name").first()).toBeEnabled();
  await expect(pane.locator(".find-result-name").first()).toContainText(
    "Marine biology",
  );
  await expect(
    pane.getByRole("button", { name: "Open results in new graph" }),
  ).toBeEnabled();
});
test("Find stays anchored in a detached short window and Escape restores its owner input", async ({
  desktop: d,
}) => {
  await d.menu("view.find");
  const query = d.page.getByRole("searchbox", { name: "Search the ontology" });
  await query.fill("ethics");
  await query.focus();
  const popup = d.app.waitForEvent("window");
  await d.menu("pane.detach");
  const detached = await popup;
  await d.app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().includes("popout"),
    )!;
    w.setMinimumSize(360, 300);
    w.setSize(650, 450);
  });
  const detachedQuery = detached.getByRole("searchbox", {
    name: "Search the ontology",
  });
  await detachedQuery.press("Control+f");
  const dialog = detached.getByRole("dialog", { name: "Find entities" });
  const input = dialog.getByRole("combobox");
  const original = await box(dialog),
    inputBox = await box(input);
  for (const text of [phrase, "zzzx-no-entity", ""]) {
    await input.fill(text);
    await expect(dialog.getByRole("listbox")).toHaveAttribute(
      "aria-busy",
      "false",
    );
    await fixedBox(dialog, original);
    await fixedBox(input, inputBox);
    await bounds(dialog);
  }
  await input.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(detachedQuery).toBeFocused();
  await expect(d.page.getByRole("dialog")).toHaveCount(0);
});
async function intercept(d: Desktop, queries: string[], semantic = "") {
  await d.app.evaluate(
    ({ ipcMain }, { queries, semantic }) => {
      const original = (ipcMain as any)._invokeHandlers.get("domain:request");
      const control = {
        queries,
        semantic,
        held: [] as any[],
        last: undefined as any,
      };
      (globalThis as any).__findControl = control;
      ipcMain.removeHandler("domain:request");
      ipcMain.handle("domain:request", async (event, method, args) => {
        if (method === "findSemantic" && control.semantic && control.last) {
          const rows =
            control.semantic === "reverse"
              ? [...control.last.rows].reverse()
              : control.last.rows.slice(0, 2);
          const result = { ...control.last, rows };
          return new Promise((resolve, reject) =>
            control.held.push({
              text: args.text,
              resolve: () => resolve(result),
              reject: () => reject(Error("Controlled semantic failure")),
            }),
          );
        }
        const result = await original(event, method, args);
        if (method === "find") {
          control.last = result;
          if (control.queries.includes(args.text))
            return new Promise((resolve, reject) =>
              control.held.push({
                text: args.text,
                resolve: () => resolve(result),
                reject: () => reject(Error("Controlled search failure")),
              }),
            );
        }
        return result;
      });
    },
    { queries, semantic },
  );
}
async function held(d: Desktop) {
  await expect
    .poll(() =>
      d.app.evaluate(() => (globalThis as any).__findControl.held.length),
    )
    .toBeGreaterThan(0);
}
async function release(d: Desktop, fail = false) {
  await d.app.evaluate((_, fail) => {
    const control = (globalThis as any).__findControl;
    control.queries = [];
    for (const item of control.held.splice(0))
      item[fail ? "reject" : "resolve"]();
  }, fail);
}
test("slow search retains inert rows, delays its status, reports failure and recovers", async ({
  desktop: d,
}) => {
  const { dialog, input } = await open(d, "ethics");
  const labels = await dialog.getByRole("option").allTextContents();
  await intercept(d, ["marine"]);
  await input.fill("marine");
  await held(d);
  expect(await dialog.getByRole("option").allTextContents()).toEqual(labels);
  await expect(dialog.getByRole("option").first()).toBeDisabled();
  await expect(dialog.getByRole("listbox")).toHaveAttribute(
    "aria-busy",
    "true",
  );
  await expect(dialog.getByRole("status")).toHaveText("Searching...");
  await release(d, true);
  await expect(dialog.getByRole("alert")).toContainText(
    "Controlled search failure",
  );
  expect(await dialog.getByRole("option").allTextContents()).toEqual(labels);
  await expect(dialog.getByRole("option").first()).toBeDisabled();
  await input.fill("ethics & social");
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await expect(dialog.getByRole("option").first()).toBeEnabled();
});
test("Enter during a pending query waits and selects the new query's entity", async ({
  desktop: d,
}) => {
  const { dialog, input } = await open(d, "ethics");
  await intercept(d, ["marine"]);
  await input.fill("marine");
  await held(d);
  await input.press("Enter");
  await expect(dialog).toBeVisible();
  await release(d);
  await expect(dialog).toHaveCount(0);
  const selected = (await d.request<Snapshot>("state")).selected;
  expect(selected).toMatch(/#Topic[345]\d\d$/);
  await expect(
    d.page.getByRole("searchbox", { name: "Search the ontology" }),
  ).toHaveValue("marine");
});
test("successive failed searches keep the same alert mounted until recovery", async ({
  desktop: d,
}) => {
  const { dialog, input } = await open(d, "ethics");
  await intercept(d, ["marine"]);
  await input.fill("marine");
  await held(d);
  await release(d, true);
  const alert = dialog.getByRole("alert");
  await expect(alert).toContainText("Controlled search failure");
  const node = await alert.elementHandle();
  await d.app.evaluate(() => {
    (globalThis as any).__findControl.queries = ["marine biology"];
  });
  await input.fill("marine biology");
  await held(d);
  expect(await node!.evaluate((el) => el.isConnected)).toBe(true);
  await expect(alert).toContainText("Controlled search failure");
  await release(d, true);
  expect(await node!.evaluate((el) => el.isConnected)).toBe(true);
  await input.fill("ethics & social");
  await expect(alert).toHaveCount(0);
  await expect(dialog.getByRole("option").first()).toBeEnabled();
});
test("the empty-result editor stays mounted across pending searches and preserves its draft", async ({
  desktop: d,
}) => {
  await d.menu("view.find");
  const pane = d.page.getByRole("region", { name: "Find entities results" });
  const query = pane.getByRole("searchbox", { name: "Search the ontology" });
  await query.fill("unlisted architecture");
  const editor = pane.getByRole("region", {
    name: "Not in the ontology? Add it.",
  });
  const label = editor.getByRole("textbox", {
    name: "Class label",
    exact: true,
  });
  await label.fill("A preserved draft");
  const create = editor.getByRole("button", {
    name: "Create class",
    exact: true,
  });
  await expect(create).toBeEnabled();
  const node = await label.elementHandle();
  await intercept(d, ["unlisted architecture two"]);
  await query.fill("unlisted architecture two");
  await held(d);
  expect(await node!.evaluate((el) => el.isConnected)).toBe(true);
  await expect(label).toHaveValue("A preserved draft");
  await expect(create).toBeDisabled();
  await expect(pane.locator(".find-zero h2")).toHaveText(
    "No matches for “unlisted architecture”",
  );
  await release(d);
  await expect(create).toBeEnabled();
  expect(await node!.evaluate((el) => el.isConnected)).toBe(true);
  await expect(label).toHaveValue("A preserved draft");
  await query.fill("marine");
  await expect(editor).toHaveCount(0);
  await expect(pane.locator(".find-result-name").first()).toContainText(
    "Marine biology",
  );
});
test("a changed query cancels queued Enter and ignores a late previous result", async ({
  desktop: d,
}) => {
  const { dialog, input } = await open(d, "ethics");
  await intercept(d, ["marine"]);
  await input.fill("marine");
  await held(d);
  await input.press("Enter");
  await input.fill(phrase);
  await expect(dialog.getByRole("option").first()).toBeEnabled();
  await release(d);
  await expect(dialog).toBeVisible();
  for (const label of await dialog.getByRole("option").allTextContents())
    expect(label).toContain("Ethics");
  await expect(dialog.getByRole("status")).not.toHaveText("Searching...");
});
test("a completed zero result clears retained matches, then clearing the query stays empty", async ({
  desktop: d,
}) => {
  const { dialog, input } = await open(d, "ethics");
  await intercept(d, ["zzzxqv-no-entity"]);
  await input.fill("zzzxqv-no-entity");
  await held(d);
  await expect(dialog.getByRole("option")).toHaveCount(6);
  await release(d);
  await expect(dialog.getByRole("option")).toHaveCount(0);
  await expect(dialog.getByRole("status")).toContainText("No matches");
  await input.fill("");
  await expect(dialog.getByRole("status")).toContainText("Type to search");
  await expect(
    dialog.getByRole("button", { name: "Show results" }),
  ).toBeDisabled();
});
test("switching ontologies invalidates retained results and a queued selection", async ({
  desktop: d,
}) => {
  const { dialog, input } = await open(d, "ethics");
  await intercept(d, ["marine"]);
  await input.fill("marine");
  await held(d);
  await input.press("Enter");
  await d.load(
    "<urn:Different> a <http://www.w3.org/2002/07/owl#Class> .",
    "different.ttl",
  );
  await expect(dialog.getByRole("option")).toHaveCount(0);
  await release(d);
  await expect(dialog).toHaveCount(0);
  await d.menu("entity.search");
  await dialog.getByRole("combobox").fill("marine");
  await expect(dialog.getByRole("listbox")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect(dialog.getByRole("option")).toHaveCount(0);
  expect((await d.request<Snapshot>("state")).selected).not.toContain(
    namespace,
  );
});
for (const semantic of ["reverse", "drop"]) {
  test(`semantic ${semantic} updates preserve or clamp selection without empty rows`, async ({
    desktop: d,
  }) => {
    await intercept(d, [], semantic);
    const { dialog, input } = await open(d, "ethics");
    const last = await dialog.getByRole("option").last().getAttribute("title");
    await input.press("End");
    // Choose the last lexical row before releasing a controlled semantic update.
    await input.press("ArrowDown");
    await input.press("ArrowDown");
    await input.press("ArrowDown");
    const selected = await dialog
      .getByRole("option", { selected: true })
      .getAttribute("title");
    await record(d, 'dialog[aria-label="Find entities"]', '[role="option"]');
    await held(d);
    await release(d);
    if (semantic === "drop")
      await expect(dialog.getByRole("option")).toHaveCount(2);
    else
      await expect
        .poll(() => dialog.getByRole("option").first().getAttribute("title"))
        .toBe(last);
    if (semantic === "reverse")
      expect(
        await dialog
          .getByRole("option", { selected: true })
          .getAttribute("title"),
      ).toBe(selected);
    else
      await expect(dialog.getByRole("option").first()).toHaveAttribute(
        "aria-selected",
        "true",
      );
    const descendant = await input.getAttribute("aria-activedescendant");
    expect(descendant).toBe(
      await dialog.getByRole("option", { selected: true }).getAttribute("id"),
    );
    const records = await d.page.evaluate(() =>
      (window as any).__findObservation(),
    );
    expect(records.every((r: { rows: number }) => r.rows > 0)).toBe(true);
  });
}
