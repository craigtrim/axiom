// craigtrim/axiom#93: all 28 published states, both themes, zero raw bitmap differences.
import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { addEntityReference } from "../fixtures/add-entity-visual/fixture";
import { entityIdentifier } from "../../src/shared/entity-names";
// craigtrim/axiom#111: preserve coloured source while checking the pinned layout.
import {
  assertCodeSurfaces,
  assertSyntaxPalette,
  monochromeSource,
} from "./syntax-assertions";
import {
  launchAddEntity,
  type AddEntityFixture,
} from "./add-entity-reference-fixture";
let f: AddEntityFixture;
const sizes: Record<number, [number, number]> = {
  20: [860, 530],
  21: [859, 530],
  22: [1300, 530],
  23: [898, 399],
  24: [599, 530],
  25: [458, 530],
  26: [368, 530],
  27: [599, 530],
  28: [218, 270],
};
const menuFrames = [14, 25, 26],
  pickerFrames = [3, 5, 7];
const contexts: Record<number, string> = {
  15: "PHD SEMINAR IN GIS",
  16: "iPhone accessory",
  17: "the theory of flight",
};
test.afterEach(async () => {
  await f?.close();
  expect(f?.errors ?? []).toEqual([]);
});
async function prepareReference(
  frame: number,
  theme: string,
  width: number,
  height: number,
) {
  const snapshot = await f.state(),
    query =
      frame === 3
        ? "Enginee"
        : frame === 5
          ? "Writing Skills"
          : frame === 7
            ? "Doc"
            : "";
  const hits = query
    ? await f.page.evaluate(
        async ({ query, exclude }) =>
          window.axiom.request<{ iri: string; label: string }[]>(
            "resourceSuggestions",
            { query, classesOnly: true, exclude, semantic: false },
          ),
        { query, exclude: frame === 5 ? [f.fixture.base + "Engineering"] : [] },
      )
    : [];
  let html = await readFile(addEntityReference, "utf8");
  html = html
    .replace(
      "  boot();",
      "window.addEntityTest={D,render,titleCase,toast}; boot();",
    )
    .replace(/function local\(n\) \{[^\n]+\}/, () =>
      entityIdentifier
        .toString()
        .replace("function entityIdentifier", "function local"),
    )
    .replace(
      "var hits = STORE.filter(function (s) { return s.toLowerCase().indexOf(t) >= 0 && taken.indexOf(s) < 0; }).slice(0, 6);",
      `var hits = ${JSON.stringify(hits.slice(0, 6).map((h) => snapshot.entities.find((e) => e.iri === h.iri)?.label || h.label))};`,
    )
    .replace("num(STORE.length)", String(snapshot.entities.length))
    .replace(
      "Characters outside the unreserved set need percent encoding in the IRI. The label keeps them exactly as typed.",
      "Characters other than letters, digits and underscores are left out of the IRI. The label keeps them exactly as typed.",
    )
    .replace(
      "      p.parents.forEach(function (g) {",
      "      if (!p.parents.length) lines.push('  <rdfs:subClassOf rdf:resource=\"http://www.w3.org/2002/07/owl#Thing\"/>');\n      p.parents.forEach(function (g) {",
    )
    .replace(
      /      EXAMPLES.forEach\(function \(x\) \{[\s\S]*?      \}\);/,
      '      items.push({l:"Re-run the title case conversion",act:"tc:"+D.context});',
    )
    .replace("Maximise pane", "Maximize pane");
  html = html.replace(
    "<script>",
    "<script>const realTimeout=window.setTimeout.bind(window);window.setTimeout=(fn,ms,...args)=>ms===4200?0:realTimeout(fn,ms,...args);</script><script>",
  );
  return f.app.evaluate(
    async (
      { BrowserWindow },
      { html, frame, theme, width, height, context },
    ) => {
      const ref = new BrowserWindow({
        show: false,
        width: 1560,
        height: 940,
        webPreferences: { sandbox: true },
      });
      await ref.loadURL(
        "data:text/html;charset=utf-8," + encodeURIComponent(html),
      );
      const result = await ref.webContents.executeJavaScript(`(async()=>{
      const frame=${frame},T=window.addEntityTest,D=T.D;
      document.documentElement.dataset.theme=${JSON.stringify(theme)};
      const dock=document.querySelector('#dock');dock.style.width='${width + 2}px';dock.style.height='${height + 30}px';
      const fix=document.createElement('style');fix.textContent='.btn.primary:disabled{color:var(--idle);background:none}.recov{grid-row:1/-1}.pane{position:relative}.pane.footed>.toast{inset-block-end:calc(var(--h-foot) + var(--sp-3))}@container pane (max-width:599px) and (max-height:209px){.bar,.body,.foot{display:none}.recov{display:grid}}';document.head.append(fix);
      if([2,3,4,5,6,7,8,9,13,18,19,24].includes(frame))D.name='Technical Writing';
      if([4,5,6,7,8,9,18,19,24].includes(frame))D.parents.push({name:'Engineering',draft:false,parents:[]});
      if([6,7,8,18,19,24].includes(frame))D.parents.push({name:'Writing Skills',draft:true,parents:[]});
      if(frame===3)D.picker={at:'root',text:'Enginee',active:0};
      if(frame===5)D.picker={at:'root',text:'Writing Skills',active:0};
      if(frame===7)D.picker={at:'n1',text:'Doc',active:0};
      if(frame===8)D.parents[1].parents.push('Document');
      if(frame===9)D.kind='individual';
      if(frame===10)D.name='  AT&T  Labs ';
      if(frame===11)D.name='Seminar';
      if(frame===12)D.name='';
      if(frame===13)D.stmts=[{p:'skos:altLabel',v:'Tech Writing'},{p:'rdfs:seeAlso',v:'https://en.wikipedia.org/wiki/Technical_writing'}];
      if(${JSON.stringify(context)}){D.context=${JSON.stringify(context)};D.name=T.titleCase(D.context);}
      T.render();
      if(frame===18)document.querySelector('#aCreate').click();
      if(frame===19){document.querySelector('#aClear').click();[...document.querySelectorAll('.frow')].find(r=>r.querySelector('.flbl').textContent==='Context').querySelector('.fnote').textContent='nothing, this is a blank form';}
      if(frame===27)T.toast('The planned source is on the clipboard.','It includes every parent that does not exist yet.');
      window.dispatchEvent(new Event('resize'));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      if([14,25,26].includes(frame))document.querySelector('#aMore').click();
      document.querySelectorAll('input').forEach(e=>e.setAttribute('value',e.value));document.querySelectorAll('textarea').forEach(e=>e.textContent=e.value);
      const pane=document.querySelector('#pane'),box=pane.getBoundingClientRect(),menu=document.querySelector('.menu');
      if(menu){const m=menu.getBoundingClientRect();menu.style.left=(m.x-box.x)+'px';menu.style.top=(m.y-box.y)+'px';}
      return {css:[...document.querySelectorAll('style')].map(s=>s.textContent).join('\\n'),html:pane.outerHTML,menu:menu?.outerHTML??''};
    })()`);
      ref.destroy();
      return result;
    },
    { html, frame, theme, width, height, context: contexts[frame] ?? "" },
  );
}
async function compare(
  frame: number,
  theme: string,
  width: number,
  height: number,
) {
  const prepared = await prepareReference(frame, theme, width, height);
  await f.host().evaluate(
    (host, { prepared, theme }) => {
      const ref = document.createElement("div");
      ref.id = "add-entity-reference";
      ref.dataset.theme = theme;
      ref.style.cssText =
        "all:initial;font:13px/1.45 var(--font);color:var(--text);-webkit-font-smoothing:antialiased;display:none;position:absolute;inset:0;width:100%;height:100%;overflow:hidden;container:pane / size";
      ref.style.colorScheme = theme;
      const shadow = ref.attachShadow({ mode: "open" });
      shadow.innerHTML = `<style>${prepared.css.replace(/:root(\[[^\]]+\])/g, ":host($1)").replaceAll(":root", ":host")}</style><style>.pane{width:100%;height:100%;border:0;border-radius:0;position:relative}.menu{position:absolute}</style>${prepared.html}${prepared.menu}`;
      host.append(ref);
    },
    { prepared, theme },
  );
  const shoot = async (reference: boolean) => {
    await f.host().evaluate(
      (host, { reference, frame }) => {
        const ref = host.querySelector<HTMLElement>("#add-entity-reference")!,
          content = host.querySelector<HTMLElement>(".adaptive-pane-content")!,
          recovery = host.querySelector<HTMLElement>(".pane-recovery")!;
        const actualMenu = content.querySelector<HTMLElement>('[role="menu"]');
        content.style.visibility = reference ? "hidden" : "";
        recovery.style.visibility = reference ? "hidden" : "";
        if (actualMenu) actualMenu.style.visibility = reference ? "hidden" : "";
        ref.style.display = reference ? "block" : "none";
        const root = reference ? ref.shadowRoot! : host,
          surface = reference
            ? ref
            : host.querySelector<HTMLElement>(".add-entity-surface")!;
        surface.style.transform = "translateZ(0)";
        root
          .querySelectorAll<HTMLElement>(".btn,.fld,.sel,.ta,.seg,.menu")
          .forEach((el) => (el.style.transform = "translateZ(0)"));
        root
          .querySelectorAll<HTMLElement>(".form,.sc")
          .forEach((el) => (el.scrollTop = 0));
        if (reference && [3, 5, 7].includes(frame))
          root
            .querySelector<HTMLElement>(frame === 7 ? '[data-np="1"]' : "#pp")!
            .focus({ preventScroll: true });
        if (reference && [14, 25, 26].includes(frame)) {
          const menu = root.querySelector<HTMLElement>(".menu")!;
          if (!menu.hasAttribute("popover")) {
            const box = host.getBoundingClientRect(),
              left = parseFloat(menu.style.left) + box.x,
              top = parseFloat(menu.style.top) + box.y;
            menu.setAttribute("popover", "manual");
            Object.assign(menu.style, {
              position: "fixed",
              inset: "auto",
              margin: "0",
              left: left + "px",
              top: top + "px",
            });
            menu.showPopover();
          }
          const focused = menu.querySelector<HTMLElement>(
            '[role="menuitem"]:not([aria-disabled="true"])',
          )!;
          focused.dataset.active = "true";
          focused.focus({ preventScroll: true });
        }
      },
      { reference, frame },
    );
    await f.page.evaluate(
      () =>
        new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        ),
    );
    const clip = (await f.host().boundingBox())!;
    let previous = await f.page.screenshot({
      clip,
      animations: "disabled",
      scale: "device",
    });
    for (let i = 0; i < 5; i++) {
      const current = await f.page.screenshot({
        clip,
        animations: "disabled",
        scale: "device",
      });
      if (previous.equals(current)) return current;
      previous = current;
    }
    throw Error("Unstable Add entity frame " + frame);
  };
  const diagnostics = async (reference: boolean) =>
    f.host().evaluate((host, reference) => {
      const root = reference
        ? host.querySelector("#add-entity-reference")!.shadowRoot!
        : host;
      return [
        ...root.querySelectorAll(
          ".bar,.seg,.state,.fld,.btn,.frow,.flbl,.fnote,.sect2,.pchip,.psug,.psug button,.ta,.stmt,.sel,.srcbox,.sh,.sc,.vmsg,.foot,.toast,.id,.why,.menu,.menu button",
        ),
      ].map((el) => ({
        text: el.textContent,
        cls: el.className,
        box: el.getBoundingClientRect().toJSON(),
        style: Object.fromEntries(
          [
            "font",
            "line-height",
            "font-weight",
            "color",
            "display",
            "gap",
            "padding",
            "margin",
            "border-radius",
            "background",
            "border",
          ].map((p) => [p, getComputedStyle(el).getPropertyValue(p)]),
        ),
      }));
    }, reference);
  const coloured = await shoot(false);
  await assertSyntaxPalette(f.host(), 0);
  await assertCodeSurfaces(f.host(), "pre.sc, .text-parent-option code");
  const restoreColour = await monochromeSource(f.host());
  let actual: Buffer;
  try {
    actual = await shoot(false);
  } finally {
    await restoreColour();
  }
  const actualStyles = await diagnostics(false),
    expected = await shoot(true),
    expectedStyles = await diagnostics(true),
    name = String(frame).padStart(2, "0") + "-" + theme;
  await writeFile(`artifacts/issue-93/${name}-coloured.png`, coloured);
  await writeFile(`artifacts/issue-93/${name}-actual.png`, actual);
  await writeFile(`artifacts/issue-93/${name}-expected.png`, expected);
  await writeFile(
    `artifacts/issue-93/${name}-styles.json`,
    JSON.stringify({ actual: actualStyles, expected: expectedStyles }, null, 2),
  );
  const diff = await f.app.evaluate(
    ({ nativeImage }, images) => {
      const [a, e] = images.map((s) =>
          nativeImage.createFromBuffer(Buffer.from(s, "base64")),
        ),
        ab = a.toBitmap(),
        eb = e.toBitmap();
      let pixels = 0;
      const points: number[][] = [];
      for (let i = 0; i < ab.length; i += 4)
        if (ab.readUInt32LE(i) !== eb.readUInt32LE(i)) {
          pixels++;
          if (points.length < 20)
            points.push([
              (i / 4) % a.getSize().width,
              Math.floor(i / 4 / a.getSize().width),
            ]);
        }
      return { pixels, size: a.getSize(), expected: e.getSize(), points };
    },
    [actual.toString("base64"), expected.toString("base64")],
  );
  await writeFile(`artifacts/issue-93/${name}.json`, JSON.stringify(diff));
  expect(diff.expected).toEqual(diff.size);
  expect(diff.pixels, name).toBe(0);
}
for (const theme of ["light", "dark"])
  for (let frame = 1; frame <= 28; frame++)
    test(`${theme} frame ${String(frame).padStart(2, "0")} matches raw reference pixels`, async () => {
      f = await launchAddEntity(theme, contexts[frame]);
      await f.page.evaluate(() => {
        const original = window.setTimeout.bind(window);
        window.setTimeout = ((
          handler: TimerHandler,
          ms?: number,
          ...args: any[]
        ) =>
          ms === 4200
            ? 0
            : original(handler, ms, ...args)) as typeof window.setTimeout;
      });
      const [width, height] = sizes[frame] ?? [898, 530];
      if ([2, 3, 4, 5, 6, 7, 8, 9, 13, 18, 19, 24].includes(frame)) {
        await f.setName("Technical Writing");
        await expect(f.pane().locator(".vmsg")).toHaveCount(0);
      }
      if ([4, 5, 6, 7, 8, 9, 18, 19, 24].includes(frame))
        await f.choose("Enginee");
      if ([6, 7, 8, 18, 19, 24].includes(frame))
        await f.choose("Writing Skills");
      if (pickerFrames.includes(frame)) {
        await f
          .picker(frame === 7 ? "Writing Skills" : undefined)
          .fill(
            frame === 3 ? "Enginee" : frame === 5 ? "Writing Skills" : "Doc",
          );
        await expect(
          f.pane().getByRole("listbox", { name: "Matching classes" }),
        ).toBeVisible();
      }
      if (frame === 8) await f.choose("Doc", "Writing Skills");
      if (frame === 9)
        await f
          .pane()
          .getByRole("button", { name: "Individual", exact: true })
          .click();
      if (frame === 10) {
        await f.setName("  AT&T  Labs ");
        await expect(f.pane().locator(".vmsg")).toHaveCount(2);
      }
      if (frame === 11) {
        await f.setName("Seminar");
        await expect(f.pane().locator(".vmsg")).toContainText("occupied");
      }
      if (frame === 12) {
        await f.setName("");
        await expect(f.pane().locator(".vmsg")).toContainText("required");
      }
      if (frame === 13) {
        await f
          .pane()
          .getByRole("textbox", { name: "Value", exact: true })
          .fill("Tech Writing");
        await f.pane().getByRole("button", { name: "Add a statement" }).click();
        await f
          .pane()
          .getByRole("textbox", { name: "Value", exact: true })
          .nth(1)
          .fill("https://en.wikipedia.org/wiki/Technical_writing");
      }
      if (frame === 18) {
        await f
          .pane()
          .getByRole("button", { name: "Create both", exact: true })
          .click();
        await expect(f.pane().locator(".foot")).toContainText(
          "created, and selected in Hierarchy",
        );
        await expect(f.pane().locator(".vmsg")).toContainText("already exists");
      }
      if (frame === 19) {
        await f
          .pane()
          .getByRole("button", { name: "Discard draft", exact: true })
          .click();
        await expect(f.pane().locator(".vmsg")).toContainText("required");
      }
      await f.size(width, height);
      if (menuFrames.includes(frame))
        await f
          .pane()
          .getByRole("button", { name: "More actions", exact: true })
          .click();
      if (frame === 27) await f.more("Copy the planned source");
      await f.page.mouse.move(0, 0);
      if (!pickerFrames.includes(frame) && !menuFrames.includes(frame))
        await f.page.evaluate(() =>
          (document.activeElement as HTMLElement)?.blur(),
        );
      await compare(frame, theme, width, height);
    });
