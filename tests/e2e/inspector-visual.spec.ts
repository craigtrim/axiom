// craigtrim/axiom#89: the pinned reference, with only the documented RDF mappings, owns every baseline.
import { test, expect, type Page, type Locator } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  launchInspector,
  inspectorReference,
  inspectorBase,
  type InspectorFixture,
} from "./inspector-reference-fixture";
import { TYPE } from "../../src/domain/model";
import {
  orderPredicates,
  type PredicateUsage,
} from "../../src/shared/predicates";
import { compactIri } from "../../src/shared/terms";

const output = path.resolve(
  process.env.AXIOM_VISUAL_OUTPUT ?? "artifacts/issue-89-visual",
);
let f: InspectorFixture, specimen: Page;
const names = [
  "class-expanded",
  "class-values-expanded",
  "individual",
  "data-property",
  "class-zero-usage",
  "draft",
  "value-focused",
  "name-invalid",
  "add-value",
  "add-statement-menu",
  "overflow-menu",
  "toast-applied",
  "toast-discarded",
  "toast-copied-iri",
  "narrow-538x530",
  "narrow-draft-menu-478x530",
  "narrow-draft-menu-378x530",
  "narrow-258x530",
  "shallow-678x350",
  "narrow-shallow-478x350",
  "recovery-218x530",
  "recovery-678x170",
];
async function open(theme: string) {
  f = await launchInspector(theme);
  await mkdir(output, { recursive: true });
  const opened = f.app.waitForEvent("window");
  await f.app.evaluate(async ({ BrowserWindow }, file) => {
    const win = new BrowserWindow({
      width: 1200,
      height: 900,
      show: false,
      focusable: false,
      webPreferences: { backgroundThrottling: false },
    });
    await win.loadFile(file);
    win.showInactive();
  }, inspectorReference);
  specimen = await opened;
  await specimen.evaluate(
    (theme) => (document.documentElement.dataset.theme = theme),
    theme,
  );
  await specimen.addStyleTag({
    content:
      ".recov{grid-row:1/-1}@container pane (max-width:599px){.st th:first-child{width:118px!important}}.vstack{grid-template-columns:minmax(0,1fr)}.dock{border-radius:0}",
  });
  await specimen
    .locator("#recovBtn")
    .evaluate((el) => (el.textContent = "Maximize pane"));
  // Equal viewport coordinates avoid origin-dependent Chromium curve rasterization.
  await align();
}
async function align() {
  const rect = (await specimen.locator("#insp").boundingBox())!;
  await f.host.evaluate(
    (el, { x, y }) =>
      Object.assign((el as HTMLElement).style, {
        left: x + "px",
        top: y + "px",
      }),
    rect,
  );
}
async function pick(id: string) {
  await f.select(id);
  await specimen.locator(`#srcList [data-id="${id}"]`).click();
}
async function size(width: number, height: number) {
  await f.size(width, height);
  await specimen.locator("#dock").evaluate(
    (el, { width, height }) => {
      Object.assign((el as HTMLElement).style, {
        width: width + 222 + "px",
        height: height + 30 + "px",
      });
      window.dispatchEvent(new Event("resize"));
    },
    { width, height },
  );
  await align();
}
async function edit() {
  const text = "A course of study in marketing and advertising";
  await f.pane
    .getByRole("textbox", { name: "rdfs:comment value 1", exact: true })
    .fill(text);
  await specimen.locator(".val[data-r='2'][data-v='0']").fill(text);
}
async function more() {
  await f.pane
    .getByRole("button", { name: "More actions", exact: true })
    .click();
  await specimen.locator("#aMore").click();
}
async function metadata(frame: number) {
  const data = await f.data();
  const snapshot = await f.state();
  const entity = f.entities.find(
    (e) => inspectorBase + e.iri.slice(3) === data.entity.iri,
  )!;
  const values =
    entity.kind === "Class"
      ? [
          data.entity.children.length,
          data.descendants,
          data.instances,
          data.referencedBy,
        ]
      : entity.kind === "Individual"
        ? [
            entity.st.find(([p]) => p === "rdf:type")![1].length,
            entity.st.reduce((n, [, vs]) => n + vs.length, 0),
            data.referencedBy,
            data.referencingSubjects,
          ]
        : [data.entity.children.length, data.usedAsPredicate];
  await specimen.evaluate(
    ({ data, entity, values, labels, frame }) => {
      const iri = document.querySelector<HTMLElement>(".ident .iri")!;
      iri.textContent = iri.title = data.entity.iri;
      document.querySelectorAll(".usage .u").forEach((el, i) => {
        el.classList.toggle("zero", values[i] === 0);
        el.querySelector(".v")!.textContent = values[i].toLocaleString("en-US");
      });
      document
        .querySelectorAll<HTMLInputElement>(".val:not([readonly])")
        .forEach((el) => {
          if (el.value.startsWith("ax:"))
            el.value = labels[el.value] ?? el.value.slice(3);
        });
      document.querySelectorAll(".st td.p").forEach((el) => {
        if (el.firstChild?.textContent?.startsWith("ax:"))
          el.firstChild.textContent = el.firstChild.textContent.slice(2);
      });
      document
        .querySelectorAll(".vrow:has(input[readonly])")
        .forEach((el) => el.remove());
      if (entity.kind === "Class" || entity.kind === "Individual") {
        const predicate =
          entity.kind === "Class" ? "rdfs:subClassOf" : "rdf:type";
        const row = Array.from(document.querySelectorAll(".st tbody tr")).find(
          (el) => el.querySelector(".p")!.textContent!.trim() === predicate,
        )!;
        const inferred = document.createElement("div");
        inferred.className = "vrow";
        inferred.innerHTML = `<input class="val" value="owl:Thing" readonly aria-label="${predicate} inferred value"><span class="inf">inferred</span>`;
        row
          .querySelector(".vstack")!
          .insertBefore(inferred, row.querySelector(".vtools"));
      }
      if (entity.id === "credits") {
        const row = document
          .querySelector(".st tbody tr")!
          .cloneNode(true) as HTMLElement;
        row.querySelector(".p")!.textContent = "rdf:type";
        row.querySelector<HTMLInputElement>(".val")!.value =
          "owl:DatatypeProperty";
        document.querySelector(".st tbody")!.append(row);
        document.querySelector(".sect .n")!.textContent = "4 over 4 predicates";
      }
      if (frame === 8)
        document.querySelector<HTMLInputElement>(
          ".val[data-r='0'][data-v='0']",
        )!.value = "";
      if (frame === 14)
        document.querySelector("#toast b")!.textContent =
          `Copied ${data.entity.iri}`;
    },
    {
      data,
      entity,
      values,
      labels: Object.fromEntries(
        snapshot.entities.map((e) => [
          "ax:" + e.iri.slice(inspectorBase.length),
          e.label,
        ]),
      ),
      frame,
    },
  );
}
async function compare(name: string, actual: Locator, expected: Locator) {
  // Paint each specimen on its own surface; unrelated shell clips must not
  // change Chromium's anti-aliasing of an otherwise identical rounded border.
  for (const root of [actual, expected])
    await root.evaluate((el) => {
      for (const surface of [el, ...el.querySelectorAll(".kind,input,svg")])
        (surface as HTMLElement).style.transform = "translateZ(0)";
    });
  for (const page of [f.page, specimen]) {
    await page
      .locator(".menu:visible")
      .evaluateAll((els) =>
        els.forEach(
          (el) => ((el as HTMLElement).style.willChange = "transform"),
        ),
      );
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
  }
  const inspect = (root: Locator) =>
    root.evaluate((el) => {
      const rootBox = el.getBoundingClientRect();
      return [el, ...el.querySelectorAll("*")]
        .filter((e) => (e as HTMLElement).checkVisibility())
        .map((e) => {
          const r = e.getBoundingClientRect(),
            c = getComputedStyle(e);
          return {
            tag: e.tagName,
            cls: e.className,
            text: e.children.length ? "" : e.textContent,
            x: r.x - rootBox.x,
            y: r.y - rootBox.y,
            w: r.width,
            h: r.height,
            font: c.font,
            color: c.color,
            background: c.backgroundColor,
            border: c.border,
            padding: c.padding,
            focusedStyle: e.matches(":focus")
              ? Object.fromEntries(
                  Array.from(c).map((key) => [key, c.getPropertyValue(key)]),
                )
              : undefined,
          };
        });
    });
  await writeFile(
    path.join(output, name + "-layout.json"),
    JSON.stringify(
      { app: await inspect(actual), reference: await inspect(expected) },
      null,
      2,
    ),
  );
  const capture = async (root: Locator) =>
    root.page().screenshot({
      clip: (await root.boundingBox())!,
      animations: "disabled",
      scale: "device",
    });
  const a = await capture(actual),
    b = await capture(expected);
  await writeFile(path.join(output, name + "-app.png"), a);
  await writeFile(path.join(output, name + "-reference.png"), b);
  const diff = await f.app.evaluate(
    ({ nativeImage }, buffers) => {
      const [a, b] = buffers.map((v) =>
        nativeImage.createFromBuffer(Buffer.from(v, "base64")),
      );
      const p = a.toBitmap(),
        q = b.toBitmap();
      if (p.length !== q.length || a.getSize().width !== b.getSize().width)
        return { pixels: -1, actual: a.getSize(), expected: b.getSize() };
      let pixels = 0;
      const rows: Record<number, number> = {};
      for (let i = 0; i < p.length; i += 4)
        if ([0, 1, 2, 3].some((c) => p[i + c] !== q[i + c])) {
          pixels++;
          const y = Math.floor(i / 4 / a.getSize().width);
          rows[y] = (rows[y] ?? 0) + 1;
        }
      return { pixels, rows };
    },
    [a.toString("base64"), b.toString("base64")],
  );
  await writeFile(
    path.join(output, name + "-diff.json"),
    JSON.stringify(diff, null, 2),
  );
  expect.soft(diff.pixels, name).toBe(0);
}
for (const theme of ["light", "dark"])
  for (const [index, label] of names.entries()) {
    const frame = index + 1,
      name = `${theme}-${String(frame).padStart(2, "0")}-${label}`;
    test(name, async () => {
      await open(theme);
      try {
        if (frame === 2) {
          await f.pane
            .getByRole("button", { name: "2 more", exact: true })
            .click();
          await specimen.locator('[data-more="rdfs:seeAlso"]').click();
        }
        if (frame === 3) await pick("MKT3100");
        if (frame === 4) await pick("credits");
        if (frame === 5) await pick("Advertising Research");
        if ([6, 12, 13, 16, 17].includes(frame)) await edit();
        if (frame === 7) {
          await f.pane
            .getByRole("textbox", { name: "rdfs:comment value 1", exact: true })
            .focus();
          await specimen.locator(".val[data-r='2'][data-v='0']").focus();
        }
        if (frame === 8) {
          await f.pane
            .getByRole("textbox", { name: "Name", exact: true })
            .fill("");
          await specimen.locator("#nameFld").fill("");
          await specimen.locator('#srcList [data-id="Course"]').click();
          await specimen.locator('#srcList [data-id="Marketing"]').click();
        }
        if (frame === 9) {
          await f.pane
            .getByRole("button", {
              name: "Add value for rdfs:label",
              exact: true,
            })
            .click();
          await specimen.locator('[data-av="0"]').click();
        }
        if (frame === 10) {
          await f.pane
            .getByRole("button", { name: "Add statement", exact: true })
            .first()
            .click();
          await specimen.locator("#aAdd").click();
          const usage = await f.page.evaluate(() =>
            window.axiom.request<PredicateUsage[]>("predicateOptions"),
          );
          const predicates = [
            TYPE,
            ...orderPredicates([], usage).filter((p) => p !== TYPE),
          ].map((p) =>
            p.startsWith(inspectorBase)
              ? ":" + compactIri(p, inspectorBase)
              : compactIri(p, inspectorBase),
          );
          await specimen.evaluate((predicates) => {
            const present = Array.from(
              document.querySelectorAll(".st td.p"),
            ).map((el) => el.firstChild!.textContent!.trim());
            (window as any).openMenu(
              document.querySelector("#aAdd"),
              predicates.map((l) => ({ l, dis: present.includes(l) })),
              () => {},
            );
          }, predicates);
        }
        if ([11, 14].includes(frame)) await more();
        if ([12, 13].includes(frame)) {
          await f.pane
            .getByRole("button", {
              name: frame === 12 ? "Apply changes" : "Discard",
              exact: true,
            })
            .click();
          await specimen.locator(frame === 12 ? "#apply" : "#discard").click();
          await expect(f.pane.locator(".toast")).toBeVisible();
        }
        if (frame === 14) {
          await f.pane
            .getByRole("menuitem", { name: "Copy IRI", exact: true })
            .click();
          await specimen.locator('.menu button:has-text("Copy IRI")').click();
          await expect(f.pane.locator(".toast")).toBeVisible();
        }
        if (frame >= 15) {
          const [w, h] = [
            [538, 530],
            [478, 530],
            [378, 530],
            [258, 530],
            [678, 350],
            [478, 350],
            [218, 530],
            [678, 170],
          ][frame - 15];
          await size(w, h);
          if ([16, 17].includes(frame)) await more();
        }
        await metadata(frame);
        if (frame === 2)
          for (const body of [
            f.pane.locator(".ibody"),
            specimen.locator("#ibody"),
          ])
            await body.evaluate((el) => (el.scrollTop = el.scrollHeight));
        const menu = [10, 11, 16, 17].includes(frame);
        for (const page of [f.page, specimen]) {
          await page.mouse.move(1, 1);
          if (!menu && ![7, 9].includes(frame))
            await page.evaluate(() =>
              (document.activeElement as HTMLElement)?.blur(),
            );
        }
        await compare(name, f.host, specimen.locator("#insp"));
        if (menu) {
          const actual = f.pane.locator(".menu:visible"),
            expected = specimen.locator(".menu:visible");
          await compare(name + "-menu", actual, expected);
          const ar = (await actual.boundingBox())!,
            er = (await expected.boundingBox())!,
            ah = (await f.host.boundingBox())!,
            eh = (await specimen.locator("#insp").boundingBox())!;
          expect
            .soft([ar.x - ah.x, ar.y - ah.y])
            .toEqual([er.x - eh.x, er.y - eh.y]);
        }
        expect(f.errors).toEqual([]);
      } finally {
        await f?.app.close();
      }
    });
  }
