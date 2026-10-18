// Issue #86 retains the grid contracts while adding page-edge navigation and movable columns.
import { test, expect, type Desktop } from "./modal-fixture";
import { holdRequests, waitForHeld, releaseRequests } from "./held-requests";
import type { Snapshot } from "../../src/shared/protocol";
import { readFile } from "node:fs/promises";
import path from "node:path";
const base = "https://example.test/schools#";
const fixture =
  `@prefix : <${base}> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
:School a owl:Class; rdfs:label "School" .
:Campus a owl:Class; rdfs:label "Campus" .
:Site a :Campus; rdfs:label "Campus site" .
` +
  Array.from(
    { length: 205 },
    (_, i) =>
      `:S${i} a :School; rdfs:label "School ${String(i).padStart(3, "0")}"; rdfs:comment "Description ${i % 7}"; rdfs:seeAlso "${i === 204 ? "Hiddennickname" : "Alias " + i}", "Other ${i}"; :establishedYear ${1900 + i}; :hasCountry "Q${i % 3}" .`,
  ).join("\n");
const grid = (d: Desktop) =>
  d.page.getByRole("region", { name: "Individuals", exact: true });
const inspector = (d: Desktop) =>
  d.page.getByRole("region", { name: "Entity inspector", exact: true });
async function prepare(d: Desktop, text = fixture) {
  await d.load(text, "schools.ttl");
  await d.menu("view.individuals");
  await d.page
    .locator('.adaptive-pane[data-pane-id="individuals"]')
    .evaluate((el) =>
      Object.assign((el as HTMLElement).style, {
        position: "fixed",
        left: "24px",
        top: "24px",
        width: "1100px",
        height: "660px",
        zIndex: "100",
      }),
    );
  await grid(d)
    .getByLabel("Filter by class")
    .selectOption(base + "School");
  await expect(grid(d).getByRole("row").nth(1)).toContainText("School 000");
}
async function columns(d: Desktop) {
  await grid(d)
    .getByRole("button", { name: /^Columns/ })
    .click();
  return d.page.locator(".chooser:visible");
}
test("column visibility, order and widths persist per class through close and workspace reopen", async ({
  desktop: d,
}) => {
  await prepare(d);
  let chooser = await columns(d);
  await chooser.getByRole("button", { name: "None", exact: true }).click();
  await chooser
    .getByRole("checkbox", { name: "rdfs:seeAlso", exact: true })
    .check();
  await chooser
    .getByRole("checkbox", { name: "rdfs:comment", exact: true })
    .check();
  const earlier = chooser.getByRole("button", {
    name: "Move rdfs:seeAlso earlier",
    exact: true,
  });
  await chooser
    .getByRole("checkbox", { name: "rdfs:seeAlso", exact: true })
    .focus();
  await earlier.click();
  // The subject remains visible, but is no longer forced to lead on restore.
  const subject = chooser.getByRole("checkbox", {
    name: "Individual",
    exact: true,
  });
  await subject
    .locator("xpath=ancestor::div[contains(@class, 'crow')]")
    .hover();
  const later = chooser.getByRole("button", {
    name: "Move Individual later",
    exact: true,
  });
  const count = await chooser.getByRole("checkbox").count();
  for (let i = 1; i < count; i++) await later.click();
  await d.page.keyboard.press("Escape");
  await expect(grid(d).getByRole("button", { name: /^Columns/ })).toBeFocused();
  const width = grid(d).getByRole("separator", {
    name: "Width of rdfs:comment",
    exact: true,
  });
  const initial = Number(await width.getAttribute("aria-valuenow"));
  await width.press("ArrowRight");
  await width.press("Shift+ArrowRight");
  await expect(width).toHaveAttribute("aria-valuenow", String(initial + 40));
  await expect(grid(d).getByRole("status")).toContainText(
    `rdfs:comment is ${initial + 40} pixels wide`,
  );
  const headers = () => grid(d).locator("thead .hlab").allTextContents();
  const order = await headers();
  expect(order[0]).toMatch(/^rdfs:seeAlso/);
  expect(order.at(-1)).toMatch(/^Individual/);
  await expect(grid(d).locator("thead th.pin")).toContainText("rdfs:seeAlso");
  await grid(d)
    .getByLabel("Filter by class")
    .selectOption(base + "Campus");
  await grid(d)
    .getByLabel("Filter by class")
    .selectOption(base + "School");
  await expect(width).toHaveAttribute("aria-valuenow", String(initial + 40));
  expect(await headers()).toEqual(order);
  await grid(d).getByRole("textbox", { name: "Filter individuals" }).focus();
  await d.menu("pane.close");
  await d.menu("view.individuals");
  await expect(width).toHaveAttribute("aria-valuenow", String(initial + 40));
  const file = path.join(d.profile, "layout.axiom");
  await d.app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, file);
  await d.menu("file.save");
  await expect
    .poll(async () => (await d.request<Snapshot>("state")).dirty)
    .toBe(false);
  expect(
    JSON.parse(await readFile(file, "utf8")).workbench.panelState[
      "table.individuals.layouts"
    ][base + "School"].widths["http://www.w3.org/2000/01/rdf-schema#comment"],
  ).toBe(initial + 40);
  await d.menu("file.new");
  await expect
    .poll(async () => (await d.request<Snapshot>("state")).classCount)
    .toBe(1);
  // The worker publishes the new graph before the main process finishes its
  // workspace checkpoint. Wait for that transition before issuing File > Open.
  const blankName = (await d.request<Snapshot>("state")).ontology.name;
  await expect
    .poll(
      async () =>
        JSON.parse(
          await readFile(path.join(d.profile, "last-session.json"), "utf8"),
        ).workspace.ontology.name,
    )
    .toBe(blankName);
  await d.menu("file.open");
  await expect
    .poll(async () => (await d.request<Snapshot>("state")).individualCount)
    .toBe(206);
  await d.menu("view.individuals");
  await expect(width).toHaveAttribute("aria-valuenow", String(initial + 40));
  expect(await headers()).toEqual(order);
  chooser = await columns(d);
  await chooser.getByRole("button", { name: "Reset", exact: true }).click();
  await d.page.keyboard.press("Escape");
  await expect(width).toHaveAttribute("aria-valuenow", String(initial));
});

test("new individuals reveal in the current scope without changing another class's filter", async ({
  desktop: d,
}) => {
  await prepare(d);
  const filter = grid(d).getByRole("textbox", { name: "Filter individuals" });
  await filter.fill("noexistingmatch");
  await expect(grid(d).locator(".empty")).toBeVisible();
  const iri = await d.request<string>("createIndividual", {
    name: "Zzz new school",
    type: base + "School",
  });
  await expect(filter).toHaveValue("");
  await expect(
    grid(d).getByRole("textbox", { name: "Page number" }),
  ).toHaveValue("3");
  const row = grid(d).locator(`tr[data-iri="${iri}"]`);
  await expect(row).toHaveAttribute("aria-selected", "true");
  await expect(row).toBeFocused();
  await expect
    .poll(async () => (await d.request<Snapshot>("state")).selected)
    .toBe(iri);
  await filter.fill("noexistingmatch");
  await d.request("createIndividual", {
    name: "Zzz new campus",
    type: base + "Campus",
  });
  await expect(filter).toHaveValue("noexistingmatch");
  await expect(grid(d).locator(".empty")).toBeVisible();
});

test("rapid arrow keys retain every step before selection replies arrive", async ({
  desktop: d,
}) => {
  await prepare(d);
  const body = grid(d).locator(".gwrap");
  await body.focus();
  await body.evaluate((el) => {
    for (let i = 0; i < 3; i++)
      el.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowDown",
          bubbles: true,
          cancelable: true,
        }),
      );
  });
  await expect
    .poll(async () => (await d.request<Snapshot>("state")).selected)
    .toBe(base + "S2");
  await expect(grid(d).locator(`tr[data-iri="${base}S2"]`)).toBeFocused();
});

test("pager clamps input and the narrow toolbar keeps every retained control inside the pane", async ({
  desktop: d,
}) => {
  await prepare(d);
  const page = grid(d).getByRole("textbox", { name: "Page number" });
  await page.fill("999");
  await page.press("Enter");
  await expect(page).toHaveValue("3");
  await expect(
    grid(d).getByRole("button", { name: "Last page" }),
  ).toBeDisabled();
  await page.fill("nonsense");
  await page.press("Enter");
  await expect(page).toHaveValue("1");
  await page.fill("Infinity");
  await page.press("Enter");
  await expect(page).toHaveValue("1");
  await expect(
    grid(d).getByRole("button", { name: "Previous page" }),
  ).toBeDisabled();
  const host = d.page.locator('.adaptive-pane[data-pane-id="individuals"]');
  for (const width of [600, 599, 503, 360, 300, 240]) {
    await host.evaluate(
      (el, w) => ((el as HTMLElement).style.width = w + "px"),
      width,
    );
    await expect
      .poll(() =>
        grid(d)
          .locator(".tbar")
          .evaluate((el) => {
            const box = el.getBoundingClientRect();
            return [...el.querySelectorAll("input,select,button")]
              .filter((node) => (node as HTMLElement).offsetWidth)
              .every((node) => {
                const b = node.getBoundingClientRect();
                return b.left >= box.left && b.right <= box.right;
              });
          }),
      )
      .toBe(true);
  }
});
for (const deltaY of [-150, -10000])
  test(`value lists stay inside the window at pane zoom (${deltaY}) and preserve selection`, async ({
    desktop: d,
  }) => {
    const values = Array.from({ length: 40 }, (_, i) =>
      JSON.stringify(`Alias ${i}: ${"long value ".repeat(9)}`),
    ).join(", ");
    await prepare(d, fixture.replace('"Alias 0", "Other 0"', values));
    const chooser = await columns(d);
    await chooser
      .getByRole("checkbox", { name: "rdfs:seeAlso", exact: true })
      .check();
    await d.page.keyboard.press("Escape");
    await d.request("select", { iri: base + "S1" });
    await d.resize(640, 760);
    const host = d.page.locator('.adaptive-pane[data-pane-id="individuals"]');
    await host.evaluate((el) =>
      Object.assign((el as HTMLElement).style, {
        width: "600px",
        height: "400px",
      }),
    );
    await host.dispatchEvent("wheel", { ctrlKey: true, deltaY });
    const owner = grid(d).getByRole("button", {
      name: "39 more values of rdfs:seeAlso",
    });
    const viewport = await owner.evaluate((el) => {
      const zoom = Number(
        el.closest<HTMLElement>(".adaptive-pane")!.dataset.paneZoom,
      );
      Object.assign((el as HTMLElement).style, {
        position: "fixed",
        zIndex: "1000",
        top: (innerHeight - 45) / zoom + "px",
        left: (innerWidth - 55) / zoom + "px",
      });
      return { width: innerWidth, height: innerHeight, zoom };
    });
    expect(viewport.zoom).toBeGreaterThan(1);
    await owner.click();
    const popup = d.page.getByRole("region", {
      name: "Values of rdfs:seeAlso",
    });
    await expect(popup.locator("li")).toHaveCount(40);
    const bounds = (await popup.boundingBox())!,
      anchor = (await owner.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(6);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width - 5);
    expect(bounds.y).toBeGreaterThanOrEqual(6);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height - 5);
    if (deltaY === -150)
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(anchor.y - 3);
    await popup.locator("li").first().click();
    expect((await d.request<Snapshot>("state")).selected).toBe(base + "S1");
    await d.page.keyboard.press("Escape");
    await expect(popup).toBeHidden();
    await expect(owner).toBeFocused();
  });

test("shown fields control filtering, multivalues open accessibly, and keyboard selection retains row nodes", async ({
  desktop: d,
}) => {
  await prepare(d);
  const filter = grid(d).getByRole("textbox", { name: "Filter individuals" });
  const hidden = await columns(d);
  await hidden
    .getByRole("checkbox", { name: "rdfs:seeAlso", exact: true })
    .uncheck();
  await d.page.keyboard.press("Escape");
  await filter.fill("Hiddennickname");
  await expect(grid(d)).toContainText('No individual matches "Hiddennickname"');
  const chooser = await columns(d);
  await chooser
    .getByRole("checkbox", { name: "rdfs:seeAlso", exact: true })
    .check();
  await d.page.keyboard.press("Escape");
  await expect(grid(d).getByRole("row").nth(1)).toContainText("School 204");
  const more = grid(d).getByRole("button", {
    name: "1 more values of rdfs:seeAlso",
  });
  await more.click();
  await expect(
    d.page.getByRole("region", { name: "Values of rdfs:seeAlso" }),
  ).toContainText("Other 204");
  await d.page.keyboard.press("Escape");
  await expect(more).toBeFocused();
  await filter.fill("");
  await expect(grid(d).getByRole("row").nth(1)).toContainText("School 000");
  const body = grid(d).locator(".gwrap");
  await body.evaluate((el) => {
    (window as any).__gridFirst = el.querySelector("tbody tr[data-iri]");
  });
  await body.press("Home");
  await expect
    .poll(async () => (await d.request<Snapshot>("state")).selected)
    .toBe(base + "S0");
  await body.press("ArrowDown");
  await expect
    .poll(async () => (await d.request<Snapshot>("state")).selected)
    .toBe(base + "S1");
  expect(
    await body.evaluate(
      (el) =>
        (window as any).__gridFirst === el.querySelector("tbody tr[data-iri]"),
    ),
  ).toBe(true);
  await body.press("End");
  await expect
    .poll(async () => (await d.request<Snapshot>("state")).selected)
    .toBe(base + "S99");
  await body.press("PageDown");
  await expect
    .poll(async () => (await d.request<Snapshot>("state")).selected)
    .toBe(base + "S100");
  await body.press("PageUp");
  await expect
    .poll(async () => (await d.request<Snapshot>("state")).selected)
    .toBe(base + "S0");
  await body.press("End");
  await d.page.keyboard.press("ArrowDown");
  await expect
    .poll(async () => (await d.request<Snapshot>("state")).selected)
    .toBe(base + "S100");
  await expect(
    grid(d).locator('tr[data-iri="' + base + 'S100"]'),
  ).toBeFocused();
  await d.page.keyboard.press("ArrowUp");
  await expect
    .poll(async () => (await d.request<Snapshot>("state")).selected)
    .toBe(base + "S99");
  await expect(grid(d).locator('tr[data-iri="' + base + 'S99"]')).toBeFocused();
  await body.press("Home");
  const width = grid(d).getByRole("separator", {
    name: "Width of Individual",
    exact: true,
  });
  await width.press("Enter");
  const fitted = Number(await width.getAttribute("aria-valuenow"));
  expect(fitted).toBeGreaterThanOrEqual(56);
  expect(fitted).toBeLessThanOrEqual(720);
  await width.press("Home");
  await expect(width).toHaveAttribute("aria-valuenow", "260");
  await body.evaluate((el) => {
    (window as any).__rowMutations = 0;
    const observer = new MutationObserver((mutations) => {
      (window as any).__rowMutations += mutations.length;
    });
    observer.observe(el.querySelector("tbody")!, {
      childList: true,
      subtree: true,
    });
    (window as any).__rowObserver = observer;
  });
  const handle = (await width.boundingBox())!;
  await d.page.mouse.move(
    handle.x + handle.width / 2,
    handle.y + handle.height / 2,
  );
  await d.page.mouse.down();
  await d.page.mouse.move(
    handle.x + handle.width / 2 + 45,
    handle.y + handle.height / 2,
    { steps: 8 },
  );
  await d.page.mouse.up();
  await expect(width).toHaveAttribute("aria-valuenow", "305");
  expect(
    await body.evaluate(() => {
      (window as any).__rowObserver.disconnect();
      return (window as any).__rowMutations;
    }),
  ).toBe(0);
  const comment = grid(d)
    .getByRole("separator", { name: "Width of rdfs:comment", exact: true })
    .locator("xpath=ancestor::th");
  const alias = grid(d)
    .getByRole("separator", { name: "Width of rdfs:seeAlso", exact: true })
    .locator("xpath=ancestor::th");
  await alias
    .locator(".hlab")
    .dragTo(comment, { targetPosition: { x: 20, y: 12 } });
  await expect
    .poll(async () => await grid(d).locator("thead .hlab .t").allTextContents())
    .toEqual(["Individual", "rdfs:seeAlso", "rdfs:comment", ":hasCountry"]);
  await grid(d)
    .getByRole("button", { name: /^Individual/ })
    .press("Enter");
  await expect(grid(d).locator('th[aria-sort="descending"]')).toHaveCount(1);
});
test("Inspector retains a subject draft and typing during Apply, with one Undo per apply", async ({
  desktop: d,
}) => {
  await d.load(fixture, "schools.ttl");
  await d.request("select", { iri: base + "S0" });
  await d.menu("view.inspector");
  const pane = inspector(d),
    label = pane.getByRole("textbox", {
      name: "rdfs:label value 1",
      exact: true,
    });
  await expect(label).toHaveValue("School 000");
  await label.fill("Draft name");
  await d.request("select", { iri: base + "S1" });
  await expect(label).toHaveValue("School 001");
  await d.request("select", { iri: base + "S0" });
  await expect(label).toHaveValue("Draft name");
  await expect(pane.locator(".usage")).not.toContainText("Subclasses");
  await holdRequests(d.app, ["updateEntity"]);
  await pane
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await waitForHeld(d.app);
  await label.fill("Typed during save");
  await releaseRequests(d.app);
  await expect(label).toHaveValue("Typed during save");
  // craigtrim/axiom#89: the action row owns the Inspector's retained draft state.
  await expect(pane.locator(".bar .state")).toHaveText("Unapplied changes");
  await expect
    .poll(
      async () =>
        (await d.request<Snapshot>("state")).entities.find(
          (e) => e.iri === base + "S0",
        )?.label,
    )
    .toBe("Draft name");
  await pane
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await expect(pane.locator(".bar .state")).toHaveText("Saved");
  await d.menu("edit.undo");
  await expect(label).toHaveValue("Draft name");
  await d.menu("edit.undo");
  await expect(label).toHaveValue("School 000");
  await label.fill("Discard me");
  await label.press("Escape");
  await expect(label).toHaveValue("School 000");
});
test("Inspector rename and grouped additions retain drafts and identify refused predicates", async ({
  desktop: d,
}) => {
  await d.load(fixture, "schools.ttl");
  await d.request("select", { iri: base + "S0" });
  await d.menu("view.inspector");
  const pane = inspector(d);
  await pane
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Renamed header");
  await expect(
    pane.getByRole("textbox", { name: "rdfs:label value 1", exact: true }),
  ).toHaveValue("Renamed header");
  await pane
    .getByRole("button", { name: "Add value for rdfs:seeAlso", exact: true })
    .click();
  await expect(
    pane.getByRole("textbox", { name: "rdfs:seeAlso value 3", exact: true }),
  ).toHaveValue("");
  await pane
    .getByRole("textbox", { name: "rdfs:seeAlso value 3", exact: true })
    .fill("Third alias");
  await pane
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await expect(pane.locator(".bar .state")).toHaveText("Saved");
  await pane
    .getByRole("textbox", { name: "rdfs:label value 1", exact: true })
    .fill("Pending");
  await d.request("rename", { iri: base + "S0", name: "Concurrent" });
  await pane
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await expect(pane.getByRole("alert")).toContainText(/label/);
  await expect(
    pane.getByRole("textbox", { name: "rdfs:label value 1", exact: true }),
  ).toHaveValue("Pending");
});
