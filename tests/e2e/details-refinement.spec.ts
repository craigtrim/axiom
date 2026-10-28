// Issue 85: exercise grouped annotations, field names, counts and the shared menu.
import { test, expect, type Desktop } from "./modal-fixture";
import { NS, THING, type Triple } from "../../src/domain/model";
import type { Snapshot } from "../../src/shared/protocol";
import { holdRequests, releaseRequests, waitForHeld } from "./held-requests";

const base = "https://details.test/";
async function open(
  d: Desktop,
  statements = 'rdfs:label "Course"; rdfs:comment "First comment"',
) {
  const epoch = (await d.request<Snapshot>("state")).datasetEpoch;
  await d.load(
    `@prefix : <${base}> . @prefix owl: <${NS.owl}> . @prefix rdfs: <${NS.rdfs}> .
    :Course a owl:Class ${statements ? "; " + statements : ""} .`,
    "details-refinement.ttl",
  );
  await expect
    .poll(async () => (await d.request<Snapshot>("state")).datasetEpoch)
    .not.toBe(epoch);
  await d.request("select", { iri: base + "Course" });
  await d.menu("view.details");
  const pane = d.page.getByRole("region", { name: "Details", exact: true });
  if (!(await pane.locator(".src").isVisible())) {
    await pane.locator(".phead .name").click();
    await d.menu("pane.maximise");
  }
  return pane;
}
async function values(d: Desktop, predicate: string) {
  const doc = await d.request<{ statements: Triple[] }>("entityDocument", {
    iri: base + "Course",
  });
  return doc.statements
    .filter((t) => t.predicate === predicate)
    .map((t) => t.object.value);
}

test("label and comment can each gain a second value without changing the other group", async ({
  desktop: d,
}) => {
  const pane = await open(d);
  for (const [predicate, value] of [
    ["label", "Second label"],
    ["comment", "Second comment"],
  ]) {
    const row = pane.locator(`tr[data-predicate="${NS.rdfs + predicate}"]`);
    const field = row.getByRole("textbox", {
      name: `rdfs:${predicate} value 1`,
      exact: true,
    });
    const add = row.getByRole("button", { name: "+ Add value", exact: true });
    await d.page.mouse.move(0, 0);
    await expect(add).toBeHidden();
    await row.hover();
    await expect(add).toBeHidden();
    await field.focus();
    await expect(add).toBeVisible();
    await add.click();
    const added = row.getByRole("textbox", {
      name: `rdfs:${predicate} value 2`,
      exact: true,
    });
    await expect(added).toBeFocused();
    await added.fill(value!);
    await added.press("Tab");
    await expect
      .poll(() => values(d, NS.rdfs + predicate))
      .toEqual([predicate === "label" ? "Course" : "First comment", value]);
  }
  await expect(pane.locator(".scount")).toHaveText("5 statements");
  await expect(
    pane.locator(`tr[data-predicate="${NS.rdf}type"]`).getByRole("button"),
  ).toHaveCount(0);
  await pane.getByRole("button", { name: "+ Add row", exact: true }).click();
  await expect(
    pane.getByRole("combobox", { name: "Choose predicate", exact: true }),
  ).toBeFocused();
  await expect(pane.locator('.pbody [aria-live="polite"]')).toHaveText(
    "Row added. Choose its predicate with the chevron.",
  );
});

test("statement counts use the singular and group thousands without expanding values", async ({
  desktop: d,
}) => {
  let pane = await open(d, "");
  await expect(pane.locator(".scount")).toHaveText("1 statement");
  pane = await open(
    d,
    "rdfs:seeAlso " +
      Array.from({ length: 1233 }, (_, i) => JSON.stringify("Alias " + i)).join(
        ", ",
      ),
  );
  await expect(pane.locator(".scount")).toHaveText("1,234 statements");
  const group = pane.locator(`tr[data-predicate="${NS.rdfs}seeAlso"]`);
  await expect(
    group.getByRole("combobox", { name: /rdfs:seeAlso value/ }),
  ).toHaveCount(3);
  await expect(
    group.getByRole("button", { name: "1230 more", exact: true }),
  ).toBeVisible();
});

test("resource suggestions leave the focused single-value Add action reachable", async ({
  desktop: d,
}) => {
  const pane = await open(d, 'rdfs:label "Course"; rdfs:seeAlso "Alias"');
  await expect(pane.locator(".src")).toBeVisible();
  const group = pane.locator(`tr[data-predicate="${NS.rdfs}seeAlso"]`);
  await group
    .getByRole("combobox", { name: "rdfs:seeAlso value 1", exact: true })
    .click();
  const choices = d.page.getByRole("listbox");
  await expect(choices).toBeVisible();
  const add = group.getByRole("button", { name: "+ Add value", exact: true });
  const action = (await add.boundingBox())!;
  await expect
    .poll(async () => {
      const popup = (await choices.boundingBox())!;
      return (
        popup.y >= action.y + action.height ||
        popup.y + popup.height <= action.y
      );
    })
    .toBe(true);
  await add.click();
  await expect(
    group.getByRole("combobox", { name: "rdfs:seeAlso value 2", exact: true }),
  ).toBeFocused();
});

test("adding a value after editing another row commits that cell without saving the new blank", async ({
  desktop: d,
}) => {
  const pane = await open(d, 'rdfs:label "Course"; rdfs:seeAlso "A", "B"');
  await pane
    .getByRole("textbox", { name: "rdfs:label value 1", exact: true })
    .fill("Revised course");
  const aliases = pane.locator(`tr[data-predicate="${NS.rdfs}seeAlso"]`);
  await aliases
    .getByRole("button", { name: "+ Add value", exact: true })
    .click();
  const added = aliases.getByRole("combobox", {
    name: "rdfs:seeAlso value 3",
    exact: true,
  });
  await expect(added).toBeFocused();
  await expect
    .poll(() => values(d, NS.rdfs + "label"))
    .toEqual(["Revised course"]);
  expect(await values(d, NS.rdfs + "seeAlso")).toEqual(["A", "B"]);
  await added.fill("C");
  await added.press("Tab");
  await expect
    .poll(() => values(d, NS.rdfs + "seeAlso"))
    .toEqual(["A", "B", "C"]);
});

test("a queued cell save retains the new blank while an earlier save reply is pending", async ({
  desktop: d,
}) => {
  const pane = await open(
    d,
    'rdfs:label "Course"; rdfs:comment "Before"; rdfs:seeAlso "A", "B"',
  );
  await holdRequests(d.app, ["updateEntity"]);
  try {
    const comment = pane.getByRole("textbox", {
      name: "rdfs:comment value 1",
      exact: true,
    });
    await comment.fill("First commit");
    await comment.press("Tab");
    await waitForHeld(d.app);
    await pane
      .getByRole("textbox", { name: "rdfs:label value 1", exact: true })
      .fill("Queued label");
    const aliases = pane.locator(`tr[data-predicate="${NS.rdfs}seeAlso"]`);
    await aliases
      .getByRole("button", { name: "+ Add value", exact: true })
      .click();
    const added = aliases.getByRole("combobox", {
      name: "rdfs:seeAlso value 3",
      exact: true,
    });
    await expect(added).toBeFocused();
    await releaseRequests(d.app);
    await expect
      .poll(() => values(d, NS.rdfs + "label"))
      .toEqual(["Queued label"]);
    expect(await values(d, NS.rdfs + "comment")).toEqual(["First commit"]);
    expect(await values(d, NS.rdfs + "seeAlso")).toEqual(["A", "B"]);
    await expect(added).toHaveValue("");
    await added.fill("C");
    await added.press("Tab");
    await expect
      .poll(() => values(d, NS.rdfs + "seeAlso"))
      .toEqual(["A", "B", "C"]);
  } finally {
    await releaseRequests(d.app);
  }
});

for (const theme of ["light", "dark"] as const)
  test(`More has shared menu styling and returns keyboard focus in ${theme}`, async ({
    desktop: d,
  }) => {
    const pane = await open(d);
    await d.page.evaluate(
      (theme) => (document.documentElement.dataset.theme = theme),
      theme,
    );
    const more = pane.getByRole("button", { name: "More", exact: true });
    const item = pane.getByRole("menuitem", { name: "Reload", exact: true });
    await expect(more).toHaveAttribute("aria-haspopup", "menu");
    for (const close of ["Escape", "Tab", "Enter", "Space"]) {
      await more.focus();
      await more.press("ArrowDown");
      await expect(more).toHaveAttribute("aria-expanded", "true");
      await expect(item).toBeFocused();
      // #173: navigation visits Delete class while retaining Reload activation below.
      const remove = pane.getByRole("menuitem", {
        name: "Delete class...",
        exact: true,
      });
      for (const [key, target] of [
        ["ArrowDown", remove],
        ["ArrowDown", item],
        ["ArrowUp", remove],
        ["Home", item],
        ["End", remove],
        ["Home", item],
      ] as const) {
        await d.page.keyboard.press(key);
        await expect(target).toBeFocused();
      }
      const popup = pane.getByRole("menu", { name: "More", exact: true });
      const style = await popup.evaluate((el) => {
        const css = getComputedStyle(el),
          row = getComputedStyle(el.querySelector('[role="menuitem"]')!);
        return {
          background: css.backgroundColor,
          border: css.borderTopWidth,
          radius: css.borderRadius,
          width: el.getBoundingClientRect().width,
          rowHeight: parseFloat(row.height),
          rowColor: row.backgroundColor,
        };
      });
      expect(style.background).toBe(
        theme === "light" ? "rgb(255, 255, 255)" : "rgb(28, 33, 40)",
      );
      const dpr = await d.page.evaluate(() => devicePixelRatio);
      expect(parseFloat(style.border)).toBeCloseTo(Math.floor(dpr) / dpr, 5);
      expect(style.radius).toBe("6px");
      expect(style.width).toBeGreaterThanOrEqual(189);
      expect(style.rowHeight).toBeCloseTo(26, 0);
      const expected = await pane.evaluate((el) =>
        getComputedStyle(el).getPropertyValue("--row-selected").trim(),
      );
      const resolved = await d.page.evaluate((color) => {
        const el = document.createElement("span");
        el.style.color = color;
        document.body.append(el);
        const value = getComputedStyle(el).color;
        el.remove();
        return value;
      }, expected);
      expect(style.rowColor).toBe(resolved);
      await item.press(close);
      await expect(popup).toBeHidden();
      await expect(more).toBeFocused();
      await expect(more).toHaveAttribute("aria-expanded", "false");
    }
  });

// #173: the header action uses the existing confirmation and restores the same RDF on Undo.
for (const kind of ["Class", "Defined"] as const)
  test(`Details More deletes a ${kind} and Undo restores its statements`, async ({
    desktop: d,
  }) => {
    const pane = await open(
      d,
      'rdfs:label "Course"; rdfs:comment "Keep this statement"' +
        (kind === "Defined" ? "; owl:equivalentClass owl:Thing" : ""),
    );
    const before = await d.request<{ statements: Triple[] }>("entityDocument", {
      iri: base + "Course",
    });
    expect(
      (await d.request<Snapshot>("state")).entities.find(
        (e) => e.iri === base + "Course",
      )?.kind,
    ).toBe(kind);
    await pane.getByRole("button", { name: "More", exact: true }).click();
    const menu = pane.getByRole("menu", { name: "More", exact: true });
    await expect(menu.getByRole("menuitem")).toHaveText([
      "Reload",
      "Delete class...",
    ]);
    await expect(menu.getByRole("separator")).toHaveCount(1);
    await menu
      .getByRole("menuitem", { name: "Delete class...", exact: true })
      .click();
    const dialog = d.page.getByRole("dialog", {
      name: "Delete class",
      exact: true,
    });
    await expect(dialog).toContainText("Course");
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(
      (await d.request<Snapshot>("state")).entities.some(
        (e) => e.iri === base + "Course",
      ),
    ).toBe(true);
    await pane.getByRole("button", { name: "More", exact: true }).click();
    await menu
      .getByRole("menuitem", { name: "Delete class...", exact: true })
      .click();
    await dialog.getByRole("button", { name: "Delete", exact: true }).click();
    await expect
      .poll(async () =>
        (await d.request<Snapshot>("state")).entities.some(
          (e) => e.iri === base + "Course",
        ),
      )
      .toBe(false);
    await d.menu("edit.undo");
    await expect
      .poll(async () =>
        (await d.request<Snapshot>("state")).entities.some(
          (e) => e.iri === base + "Course",
        ),
      )
      .toBe(true);
    expect(
      (
        await d.request<{ statements: Triple[] }>("entityDocument", {
          iri: base + "Course",
        })
      ).statements,
    ).toEqual(before.statements);
  });

test("Details More protects owl:Thing and keeps non-class menus limited to Reload", async ({
  desktop: d,
}) => {
  const pane = await open(d);
  await d.load(
    `@prefix : <${base}> . @prefix owl: <${NS.owl}> . @prefix rdfs: <${NS.rdfs}> .
    :Course a owl:Class; rdfs:label "Course" .
    :Student a owl:NamedIndividual, :Course; rdfs:label "Student" .
    :teaches a owl:ObjectProperty; rdfs:label "teaches" .`,
    "details-kinds.ttl",
  );
  await d.menu("view.details");
  for (const name of ["Student", "teaches"]) {
    await d.request("select", { iri: base + name });
    await expect(
      pane.getByRole("textbox", { name: "rdfs:label value 1", exact: true }),
    ).toHaveValue(name);
    await pane.getByRole("button", { name: "More", exact: true }).click();
    const menu = pane.getByRole("menu", { name: "More", exact: true });
    await expect(menu.getByRole("menuitem")).toHaveText(["Reload"]);
    await expect(menu.getByRole("separator")).toHaveCount(0);
    await d.page.keyboard.press("Escape");
  }
  await d.request("select", { iri: THING });
  await expect(pane).toHaveAttribute("data-entity-iri", THING);
  await pane.getByRole("button", { name: "More", exact: true }).click();
  const remove = pane.getByRole("menuitem", {
    name: "Delete class...",
    exact: true,
  });
  await expect(remove).toHaveAttribute("aria-disabled", "true");
  await remove.click({ force: true });
  await expect(
    d.page.getByRole("dialog", { name: "Delete class", exact: true }),
  ).toHaveCount(0);
  expect(
    (await d.request<Snapshot>("state")).entities.some((e) => e.iri === THING),
  ).toBe(true);
});

for (const mode of ["statements", "source"] as const)
  test(`Details More disables deletion throughout a pending ${mode} save`, async ({
    desktop: d,
  }) => {
    const pane = await open(d);
    await holdRequests(d.app, [
      mode === "source" ? "applyEntitySource" : "updateEntity",
    ]);
    try {
      if (mode === "source") {
        const editor = pane.getByRole("textbox", { name: /^Source for / });
        await expect(editor).toHaveValue(/First comment/);
        await editor.fill(
          (await editor.inputValue()).replace("First comment", "Saved comment"),
        );
        await pane
          .getByRole("button", { name: "Save source", exact: true })
          .click();
      } else {
        const field = pane.getByRole("textbox", {
          name: "rdfs:comment value 1",
          exact: true,
        });
        await field.fill("Saved comment");
        await field.press("Tab");
      }
      await waitForHeld(d.app);
      await pane.getByRole("button", { name: "More", exact: true }).click();
      const remove = pane.getByRole("menuitem", {
        name: "Delete class...",
        exact: true,
      });
      await expect(remove).toHaveAttribute("aria-disabled", "true");
      await remove.click({ force: true });
      await expect(
        d.page.getByRole("dialog", { name: "Delete class", exact: true }),
      ).toHaveCount(0);
      await releaseRequests(d.app);
      await expect(remove).not.toHaveAttribute("aria-disabled", "true");
      expect(await values(d, NS.rdfs + "comment")).toEqual(["Saved comment"]);
    } finally {
      await releaseRequests(d.app);
    }
  });
