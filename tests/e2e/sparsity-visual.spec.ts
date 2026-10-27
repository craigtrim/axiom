// craigtrim/axiom#90: every published frame is compared as raw device pixels.
import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { sparsityReference } from "../fixtures/sparsity-visual/fixture";
import {
  launchSparsity,
  type SparsityFixture,
} from "./sparsity-reference-fixture";

const sizes: Record<number, [number, number]> = {
  13: [560, 560],
  14: [560, 560],
  15: [420, 560],
  16: [380, 560],
  17: [320, 560],
  18: [320, 560],
  19: [900, 400],
  20: [900, 400],
  21: [420, 380],
  22: [230, 400],
  23: [900, 200],
};
const selectedFrames = [6, 9, 14, 15, 16, 20, 21];
const reportFrames = [3, 4, 5, 6, 7, 8, 9, 11, 12, 14, 15, 16, 20, 21];
const menuFrames = [9, 10, 15, 16];
let f: SparsityFixture;
test.afterEach(async () => {
  await f?.app.close();
  expect(f?.errors ?? []).toEqual([]);
});

async function prepareReference(
  frame: number,
  theme: string,
  width: number,
  height: number,
) {
  let html = await readFile(sparsityReference, "utf8");
  // The issue's four corrections, plus its explicit baseline/page and button semantics.
  html = html
    .replace("  boot();", "  window.sparsityTest = {S,compute,render}; boot();")
    .replace(
      "if (r.score < S.min) return false;",
      "if (r.score === 0 || r.score < S.min) return false;",
    )
    .replace(
      'if (S.sel === g.parent + "|" + r.name) out.push({ g: g, r: r, sibs: 1 });',
      "",
    )
    .replace(
      'peer mean</span></button>";',
      'peer mean</span></button>" + (S.sel === it.g.parent + "|" + r.name ? sibsHtml(it.g,r) : "");',
    )
    .replaceAll("aria-selected", "aria-pressed")
    .replaceAll('role="option"', "")
    .replace("Maximise pane", "Maximize pane");
  return f.app.evaluate(
    async (
      { BrowserWindow },
      {
        html,
        frame,
        theme,
        width,
        height,
        selectedFrames,
        reportFrames,
        menuFrames,
      },
    ) => {
      const ref = new BrowserWindow({
        show: false,
        width: 1000,
        height: 800,
        webPreferences: { sandbox: true },
      });
      await ref.loadURL(
        "data:text/html;charset=utf-8," + encodeURIComponent(html),
      );
      const result = await ref.webContents.executeJavaScript(`(async () => {
      const frame=${frame}, theme=${JSON.stringify(theme)}, S=window.sparsityTest.S;
      document.documentElement.dataset.theme=theme;
      const dock=document.querySelector('#dock'); dock.style.width='${width}px'; dock.style.height='${height}px';
      const fix=document.createElement('style'); fix.textContent='.recov{grid-row:1/-1}.band{white-space:nowrap}.band>span:not([class]){flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis}.pane{position:relative}';document.head.append(fix);
      if(frame===2){S.scope='Business';S.infl=40;S.min=50;S.leaves=false;}
      if(${JSON.stringify(reportFrames)}.includes(frame)) window.sparsityTest.compute();
      if(frame===5){S.open.Agriculture=true;S.open.Business=true;}
      if(${JSON.stringify(selectedFrames)}.includes(frame)){S.open.Business=true;S.sel='Business|Business Artifact 1.4';}
      if(frame===12)S.open.Business=true;
      if(frame===7||frame===8){S.report.groups.forEach(g=>S.open[g.parent]=true);}
      if(frame===11)S.filter='zzz';
      window.sparsityTest.render();
      if(frame===8){const bands=Object.fromEntries([...document.querySelectorAll('.band')].map(b=>[b.dataset.band,b.outerHTML]));S.page=1;window.sparsityTest.render();const first=document.querySelector('#rows>*');if(first?.classList.contains('fin'))first.insertAdjacentHTML('beforebegin',bands[first.dataset.row.split('|')[0]]);}
      if(frame===3)toast('Measured 769 candidates.','205 sibling groups compared, nothing in the ontology was changed.');
      if(frame===11)document.querySelector('#filter').setAttribute('value','zzz');
      window.dispatchEvent(new Event('resize'));
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      if(${JSON.stringify(menuFrames)}.includes(frame))document.querySelector('#aMore').click();
      const pane=document.querySelector('#pane'),box=pane.getBoundingClientRect(),menu=document.querySelector('.menu');
      if(menu){const m=menu.getBoundingClientRect();menu.style.left=(m.x-box.x)+'px';menu.style.top=(m.y-box.y)+'px';}
      return {css:[...document.querySelectorAll('style')].map(s=>s.textContent).join('\\n'),html:pane.outerHTML,menu:menu?.outerHTML??''};
    })()`);
      ref.destroy();
      return result;
    },
    {
      html,
      frame,
      theme,
      width,
      height,
      selectedFrames,
      reportFrames,
      menuFrames,
    },
  );
}

async function compare(
  frame: number,
  theme: string,
  width: number,
  height: number,
) {
  const prepared = await prepareReference(frame, theme, width, height);
  await f.page.evaluate(
    ({ prepared, theme, frame }) => {
      const ref = document.createElement("div");
      ref.id = "sparsity-reference";
      ref.dataset.theme = theme;
      ref.style.cssText =
        "all:initial;font:13px/1.45 var(--font);color:var(--text);-webkit-font-smoothing:antialiased;display:none;position:absolute;inset:0;width:100%;height:100%;overflow:hidden;container:pane / size";
      ref.style.colorScheme = theme;
      const shadow = ref.attachShadow({ mode: "open" });
      shadow.innerHTML = `<style>${prepared.css.replace(/:root(\[[^\]]+\])/g, ":host($1)").replaceAll(":root", ":host")}</style><style>.pane{width:100%;height:100%;border:0;border-radius:0;position:relative}.menu{position:absolute}</style>${prepared.html}${prepared.menu}`;
      document.querySelector('[data-pane-id="sparsity"]')!.append(ref);
    },
    { prepared, theme, frame },
  );
  const shoot = async (reference: boolean) => {
    await f.page.evaluate(
      ({ reference, frame }) => {
        const host = document.querySelector('[data-pane-id="sparsity"]')!;
        const ref = host.querySelector<HTMLElement>("#sparsity-reference")!;
        const content = host.querySelector<HTMLElement>(
          ".adaptive-pane-content",
        )!;
        const recovery = host.querySelector<HTMLElement>(".pane-recovery")!;
        const actualMenu = content.querySelector<HTMLElement>('[role="menu"]');
        content.style.visibility = reference ? "hidden" : "";
        recovery.style.visibility = reference ? "hidden" : "";
        if (actualMenu) actualMenu.style.visibility = reference ? "hidden" : "";
        ref.style.display = reference ? "block" : "none";
        const root = reference ? ref.shadowRoot! : host;
        const surface = reference
          ? ref
          : host.querySelector<HTMLElement>(".sparsity-surface")!;
        surface.style.transform = "translateZ(0)";
        root
          .querySelectorAll<HTMLElement>(
            ".btn,.fld,.sel,.chip,.sw,.fin,.band,.rail,.menu,.foot,.tag,.tag .gl",
          )
          .forEach((el) => (el.style.transform = "translateZ(0)"));
        root
          .querySelectorAll<HTMLElement>(".menu")
          .forEach((el) => (el.style.willChange = "transform"));
        if (reference && frame === 18) {
          const rail = root.querySelectorAll<HTMLElement>(".srow>.rail")[1];
          rail.scrollLeft = rail.scrollWidth;
        }
        if (reference && frame === 12)
          root
            .querySelector<HTMLElement>(
              '[data-row="Business|Business Artifact 1.4"]',
            )!
            .focus({ preventScroll: true });
        if (reference && [9, 10, 15, 16].includes(frame)) {
          const menu = root.querySelector<HTMLElement>(".menu")!;
          // Put both popups in Chromium's top layer so the rounded border is rasterized alike.
          if (!menu.hasAttribute("popover")) {
            const box = host.getBoundingClientRect();
            const left = parseFloat(menu.style.left) + box.x,
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
          );
          // SharedMenu exposes the active keyboard item through the reference's data-active token.
          if (focused) focused.dataset.active = "true";
          (focused ?? menu).focus({ preventScroll: true });
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
    const clip = (await f.host.boundingBox())!;
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
    throw Error("Unstable Sparsity frame " + frame);
  };
  const diagnostics = async (reference: boolean) =>
    f.page.evaluate((reference) => {
      const root = reference
        ? document.querySelector("#sparsity-reference")!.shadowRoot!
        : document.querySelector('[data-pane-id="sparsity"]')!;
      return [
        ...root.querySelectorAll(
          ".chip,.band,.fin,.sibs,.sib,.mean,.recov,.pane-recovery,.sparsity-recovery,.id,.why,.menu,.menu button,.foot,.tag,.tag .gl",
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
            "background-color",
            "width",
            "height",
            "clip-path",
            "transform",
            "will-change",
          ].map((p) => [p, getComputedStyle(el).getPropertyValue(p)]),
        ),
      }));
    }, reference);
  const actual = await shoot(false);
  const actualStyles = await diagnostics(false);
  const expected = await shoot(true);
  const expectedStyles = await diagnostics(true);
  const name = String(frame).padStart(2, "0") + "-" + theme;
  await writeFile(`artifacts/issue-90/${name}-actual.png`, actual);
  await writeFile(`artifacts/issue-90/${name}-expected.png`, expected);
  await writeFile(
    `artifacts/issue-90/${name}-styles.json`,
    JSON.stringify({ actual: actualStyles, expected: expectedStyles }, null, 2),
  );
  const diff = await f.app.evaluate(
    ({ nativeImage }, images) => {
      const [a, e] = images.map((s) =>
        nativeImage.createFromBuffer(Buffer.from(s, "base64")),
      );
      const ab = a.toBitmap(),
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
  await writeFile(`artifacts/issue-90/${name}.json`, JSON.stringify(diff));
  // #165: preserve native rendering evidence on the hosted runner for exact-pixel failures.
  if (
    diff.pixels ||
    diff.size.width !== diff.expected.width ||
    diff.size.height !== diff.expected.height
  ) {
    await test
      .info()
      .attach(name + "-actual", { body: actual, contentType: "image/png" });
    await test
      .info()
      .attach(name + "-expected", { body: expected, contentType: "image/png" });
    await test.info().attach(name + "-diagnostics", {
      body: JSON.stringify(
        { diff, actual: actualStyles, expected: expectedStyles },
        null,
        2,
      ),
      contentType: "application/json",
    });
  }
  expect(diff.expected).toEqual(diff.size);
  expect(diff.pixels, name).toBe(0);
}

for (const theme of ["light", "dark"])
  for (let frame = 1; frame <= 23; frame++)
    test(`${theme} frame ${String(frame).padStart(2, "0")} matches raw reference pixels`, async () => {
      f = await launchSparsity(theme);
      await f.page.emulateMedia({ reducedMotion: "reduce" });
      if (frame === 2) {
        await f.pane
          .getByRole("button", { name: "40 percent", exact: true })
          .click();
        await f.pane.getByRole("switch").click();
        await f.pane
          .getByRole("combobox", { name: "Scope" })
          .selectOption(f.fixture.iri("Business"));
        await f.pane
          .getByRole("spinbutton", { name: "Minimum score" })
          .fill("50");
      }
      if (reportFrames.includes(frame)) await f.compute();
      if (frame === 5) {
        await f.group("Agriculture").click();
        await f.group("Business").click();
      }
      if (selectedFrames.includes(frame)) {
        await f.group("Business").click();
        await f.finding("Business", "Business Artifact 1.4").click();
      }
      if (frame === 7 || frame === 8) await f.more("Expand every group");
      if (frame === 8)
        await f.pane.getByRole("button", { name: "Next", exact: true }).click();
      if (frame === 11)
        await f.pane
          .getByRole("textbox", { name: "Filter classes" })
          .fill("zzz");
      if (frame === 12) {
        await f.group("Business").click();
        const finding = f.finding("Business", "Business Artifact 1.4");
        await finding.focus();
        await finding.press("Tab");
        await f.page.keyboard.press("Shift+Tab");
        await expect(finding).toBeFocused();
        expect(
          await finding.evaluate((el) => el.matches(":focus-visible")),
        ).toBe(true);
      }
      const [width, height] = sizes[frame] ?? [900, 560];
      await f.size(width - 2, height - 30);
      if (frame === 18)
        await f.pane
          .locator(".srow>.rail")
          .nth(1)
          .evaluate((el) => (el.scrollLeft = el.scrollWidth));
      if (menuFrames.includes(frame))
        await f.pane.getByRole("button", { name: "More actions" }).click();
      await f.page.mouse.move(0, 0);
      if (frame !== 12 && !menuFrames.includes(frame))
        await f.page.evaluate(() =>
          (document.activeElement as HTMLElement)?.blur(),
        );
      if (frame !== 3)
        await expect(f.host.locator(".toast")).toBeHidden({
          timeout: 6000,
        });
      await compare(frame, theme, width, height);
    });
