// craigtrim/axiom#91: compare all 28 published states in both themes as raw bitmaps.
import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { hierarchyReference } from "../fixtures/hierarchy-visual/fixture";
import {
  launchHierarchy,
  type HierarchyFixture,
} from "./hierarchy-reference-fixture";
const sizes: Record<number, [number, number]> = {
  22: [420, 560],
  23: [420, 560],
  24: [300, 560],
  25: [420, 560],
  26: [900, 300],
  27: [380, 300],
  28: [220, 300],
};
const menuFrames = [8, 23];
let f: HierarchyFixture;
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
  let html = await readFile(hierarchyReference, "utf8");
  // Decisions 9, 11, 15 and the issue's alphabetical sibling policy apply to the fixture too.
  html = html
    .replace(
      "  boot();",
      "  window.hierarchyTest={S,MODEL,CLASSES,PROPS,render}; boot();",
    )
    .replace(
      "CLASSES.length - 1, properties: PROPS.length - 2",
      "CLASSES.length, properties: PROPS.length",
    )
    .replace("Maximise pane", "Maximize pane");
  return f.app.evaluate(
    async ({ BrowserWindow }, { html, frame, theme, width, height }) => {
      const ref = new BrowserWindow({
        show: false,
        width: 1000,
        height: 800,
        webPreferences: { sandbox: true },
      });
      await ref.loadURL(
        "data:text/html;charset=utf-8," + encodeURIComponent(html),
      );
      const result = await ref.webContents.executeJavaScript(`(async()=>{
      const frame=${frame}, T=window.hierarchyTest, S=T.S;
      document.documentElement.dataset.theme=${JSON.stringify(theme)};
      const dock=document.querySelector('#dock');dock.style.width='${width}px';dock.style.height='${height}px';
      const fix=document.createElement('style');fix.textContent='.recov{grid-row:1/-1}.pane{position:relative}.pane.footed .toast{inset-block-end:calc(var(--h-foot) + var(--sp-3))}@container pane (max-height:399px) and (min-height:180px){.tree{grid-row:2/-1}}';document.head.append(fix);
      const row=id=>document.querySelector('.tr[data-id="'+id+'"]');
      const click=(id,ctrl=false)=>row(id).dispatchEvent(new MouseEvent('click',{bubbles:true,ctrlKey:ctrl}));
      const expand=id=>document.querySelector('.exp[data-exp="'+id+'"]').click();
      const filter=value=>{const el=document.querySelector('#filter');el.value=value;el.setAttribute('value',value);el.dispatchEvent(new Event('input',{bubbles:true}));};
      let dt;
      const start=id=>{dt=new DataTransfer();row(id).dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:dt}));};
      const over=(id,drop=false)=>{const el=id==='empty'?document.querySelector('#rootdrop'):row(id);const box=el.getBoundingClientRect();el.dispatchEvent(new DragEvent(drop?'drop':'dragover',{bubbles:true,cancelable:true,dataTransfer:dt,clientX:box.x+60,clientY:box.y+Math.min(13,box.height/2)}));};
      if(frame===2){expand('Person');click('Researcher');}
      if(frame===3){click('Person');click('Organization',true);click('Software Agent',true);}
      if(frame===4){S.sel={'Person':1};S.focus='Person';T.render();}
      if(frame===5){T.MODEL.properties.roots.sort();document.querySelector('[data-tab="properties"]').click();document.querySelector('.keys>span:last-child').remove();}
      if(frame===6||frame===21)filter('art');if(frame===7)filter('zzz');
      if(frame===9||frame===24){Object.keys(T.MODEL.classes.map).forEach(id=>S.open[id]=1);T.render();}
      if(frame===24)click('Researcher');
      if(frame===16){click('Software Agent');click('Device',true);}
      if([10,11,12,14,15,16,17,18].includes(frame))start('Software Agent');
      if([13,19,25].includes(frame))start('Agent');
      if([10,16,17,18].includes(frame))over('Artifact');
      if(frame===11){over('Organization');await new Promise(r=>setTimeout(r,900));T.render();over('Organization');}
      if([12,13,19,25].includes(frame))over('Software Agent');
      if(frame===14)over('Agent');if(frame===15)over('empty');
      if([17,18].includes(frame)){over('Artifact',true);if(frame===18)document.querySelector('#undoBtn').click();
        const order=T.CLASSES.map(n=>n[0]);Object.values(T.MODEL.classes.map).forEach(n=>n.kids.sort((a,b)=>order.indexOf(a)-order.indexOf(b)));T.render();}
      if(frame===19)over('Software Agent',true);
      if(frame===20){start('owl:Thing');T.render();}
      if(frame===21)expand('Organization');
      window.dispatchEvent(new Event('resize'));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      if(frame===25){const state=document.querySelector('#state');Object.assign(state.style,{flex:'0 1 auto',minWidth:'0',overflow:'hidden',textOverflow:'ellipsis'});}
      if([8,23].includes(frame)){document.querySelector('#aMore').click();document.querySelectorAll('.menu button').forEach(b=>{const id={'Open in Details':'aDetails','Show in graph':'aGraph'}[b.textContent];if(id&&document.getElementById(id).disabled)b.setAttribute('aria-disabled','true');});}
      const pane=document.querySelector('#pane'),box=pane.getBoundingClientRect(),menu=document.querySelector('.menu');
      if(menu){const m=menu.getBoundingClientRect();menu.style.left=(m.x-box.x)+'px';menu.style.top=(m.y-box.y)+'px';}
      return {css:[...document.querySelectorAll('style')].map(s=>s.textContent).join('\\n'),html:pane.outerHTML,menu:menu?.outerHTML??''};
    })()`);
      ref.destroy();
      return result;
    },
    { html, frame, theme, width, height },
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
      ref.id = "hierarchy-reference";
      ref.dataset.theme = theme;
      ref.style.cssText =
        "all:initial;font:13px/1.45 var(--font);color:var(--text);-webkit-font-smoothing:antialiased;display:none;position:absolute;inset:0;width:100%;height:100%;overflow:hidden;container:pane / size";
      ref.style.colorScheme = theme;
      const shadow = ref.attachShadow({ mode: "open" });
      shadow.innerHTML = `<style>${prepared.css.replace(/:root(\[[^\]]+\])/g, ":host($1)").replaceAll(":root", ":host")}</style><style>.pane{width:100%;height:100%;border:0;border-radius:0;position:relative}.menu{position:absolute}</style>${prepared.html}${prepared.menu}`;
      document.querySelector('[data-pane-id="hierarchy"]')!.append(ref);
    },
    { prepared, theme, frame },
  );
  const shoot = async (reference: boolean) => {
    await f.page.evaluate(
      ({ reference, frame }) => {
        const host = document.querySelector('[data-pane-id="hierarchy"]')!;
        const ref = host.querySelector<HTMLElement>("#hierarchy-reference")!;
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
          : host.querySelector<HTMLElement>(".hierarchy-surface")!;
        surface.style.transform = "translateZ(0)";
        root
          .querySelectorAll<HTMLElement>(".btn,.fld,.seg,.tr,.exp,.menu")
          .forEach((el) => (el.style.transform = "translateZ(0)"));
        root
          .querySelectorAll<HTMLElement>(".menu")
          .forEach((el) => (el.style.willChange = "transform"));
        if (reference && frame === 4)
          root
            .querySelector<HTMLElement>('[data-id="Person"]')!
            .focus({ preventScroll: true });
        if (reference && [8, 23].includes(frame)) {
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
    throw Error("Unstable Hierarchy frame " + frame);
  };
  const diagnostics = async (reference: boolean) =>
    f.page.evaluate((reference) => {
      const root = reference
        ? document.querySelector("#hierarchy-reference")!.shadowRoot!
        : document.querySelector('[data-pane-id="hierarchy"]')!;
      return [
        ...root.querySelectorAll(
          ".bar,.seg,.state,.fld,.tr,.exp,.nm,.cnt,.alt,.foot,.toast,.undo,.keys,.recov,.pane-recovery,.hierarchy-recovery,.id,.why,.menu,.menu button",
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
          ].map((p) => [p, getComputedStyle(el).getPropertyValue(p)]),
        ),
      }));
    }, reference);
  const actual = await shoot(false);
  const actualStyles = await diagnostics(false);
  const expected = await shoot(true);
  const expectedStyles = await diagnostics(true);
  const name = String(frame).padStart(2, "0") + "-" + theme;
  await writeFile(`artifacts/issue-91/${name}-actual.png`, actual);
  await writeFile(`artifacts/issue-91/${name}-expected.png`, expected);
  await writeFile(
    `artifacts/issue-91/${name}-styles.json`,
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
  await writeFile(`artifacts/issue-91/${name}.json`, JSON.stringify(diff));
  expect(diff.expected).toEqual(diff.size);
  expect(diff.pixels, name).toBe(0);
}

for (const theme of ["light", "dark"])
  for (let frame = 1; frame <= 28; frame++)
    test(`${theme} frame ${String(frame).padStart(2, "0")} matches raw reference pixels`, async () => {
      f = await launchHierarchy(theme);
      await f.page.emulateMedia({ reducedMotion: "reduce" });
      const [width, height] = sizes[frame] ?? [900, 560];
      await f.size(width - 2, height - 30);
      if (frame === 2) {
        await f.row("Person").getByRole("button").click();
        await f.row("Researcher").click();
      }
      if (frame === 3) {
        await f.row("Person").click();
        await f.row("Organization").click({ modifiers: ["Control"] });
        await f.row("Software Agent").click({ modifiers: ["Control"] });
      }
      if (frame === 4) {
        await f.row("owl:Thing").focus();
        await f.page.keyboard.press("ArrowDown");
        await f.page.keyboard.press("ArrowDown");
        await expect(f.row("Person")).toBeFocused();
      }
      if (frame === 5)
        await f.pane
          .getByRole("button", { name: "Properties", exact: true })
          .click();
      if ([6, 21].includes(frame))
        await f.pane
          .getByRole("textbox", { name: "Filter hierarchy" })
          .fill("art");
      if (frame === 7)
        await f.pane
          .getByRole("textbox", { name: "Filter hierarchy" })
          .fill("zzz");
      if ([9, 24].includes(frame)) await f.more("Expand every branch");
      if (frame === 24) {
        await f.row("Researcher").click();
        await f.pane.locator(".tree").evaluate((el) => (el.scrollTop = 0));
      }
      if (frame === 16) {
        await f.row("Software Agent").click();
        await f.row("Device").click({ modifiers: ["Control"] });
      }
      if ([10, 16, 17, 18].includes(frame))
        await f.drag("Software Agent", "Artifact", [17, 18].includes(frame));
      if (frame === 17) {
        await expect(
          f.pane.getByRole("button", { name: "Undo move", exact: true }),
        ).toBeVisible();
        await expect(f.pane.locator(".toast")).toContainText(
          "Moved Software Agent under Artifact.",
        );
      }
      if (frame === 11) {
        await f.drag("Software Agent", "Organization");
        await expect(f.row("Company")).toBeVisible();
      }
      if (frame === 12) await f.drag("Software Agent", "Software Agent");
      if ([13, 19, 25].includes(frame))
        await f.drag("Agent", "Software Agent", frame === 19);
      if (frame === 14) await f.drag("Software Agent", "Agent");
      if (frame === 15) await f.drag("Software Agent", "", false, true);
      if (frame === 18)
        await f.pane
          .getByRole("button", { name: "Undo move", exact: true })
          .click();
      if (frame === 20)
        await f.row("owl:Thing").dispatchEvent("dragstart", {
          dataTransfer: await f.page.evaluateHandle(() => new DataTransfer()),
        });
      if (frame === 21) await f.row("Organization").getByRole("button").click();
      if (menuFrames.includes(frame))
        await f.pane.getByRole("button", { name: "More actions" }).click();
      await f.page.mouse.move(0, 0);
      if (frame !== 4 && !menuFrames.includes(frame))
        await f.page.evaluate(() =>
          (document.activeElement as HTMLElement)?.blur(),
        );
      await compare(frame, theme, width, height);
    });
