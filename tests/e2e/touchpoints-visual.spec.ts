// craigtrim/axiom#92: compare every shipping frame as raw bitmaps with zero tolerance.
import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { touchpointsReference } from "../fixtures/touchpoints-visual/fixture";
import {
  launchTouchpoints,
  type TouchpointsFixture,
} from "./touchpoints-reference-fixture";
import { holdRequests, waitForHeld } from "./held-requests";
let f: TouchpointsFixture;
const sizes: Record<number, [number, number]> = {
  16: [520, 560],
  17: [360, 560],
  18: [900, 300],
  19: [360, 300],
  20: [220, 560],
  21: [900, 200],
  22: [360, 230],
};
const menuFrames = [14, 15];
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
  const saved = await f.saved();
  const scores = Object.fromEntries(
    saved?.candidates.map((c) => [c.label, c.similarity ?? 0]) ?? [],
  );
  let html = await readFile(touchpointsReference, "utf8");
  html = html
    .replace(
      "  boot();",
      "window.touchpointsTest={P,V,render,search,apply}; boot();",
    )
    .replace("Maximise pane", "Maximize pane")
    // Remove simulation items before measuring the right-aligned shipping menu.
    .replace(
      "openMenu(this, items, function (it)",
      "openMenu(this, items.slice(3), function (it)",
    )
    .replace('nodb: f.indexOf("u") >= 0', "nodb: false")
    .replace(
      'v.rows = kind === "refresh" ? full : full.filter(function (c) { return !c.fresh; });',
      'v.rows = kind === "refresh" ? full.filter(c=>c.title!=="Publication") : full.filter(c=>!c.fresh);',
    )
    .replace(
      'c.nodb && c.tgt === "DBpedia"',
      'c.title === "Research" && c.rel === "skos:closeMatch" && c.tgt === "DBpedia"',
    )
    .replace(
      " has no DBpedia resource, so that statement is unavailable.",
      " already has that statement, so it is invalid.",
    )
    .replace(
      "Change its target to Wikipedia, or deselect it, and apply again.",
      "Change its relationship or target, or deselect it, and apply again.",
    )
    .replace(" selected, 1 unavailable.", " selected, 1 invalid.")
    .replace(
      /    var q = v.label.toLowerCase\(\);[\s\S]*?    return list.sort\(function \(a, b\) \{ return b.rank - a.rank \|\| a.wiki - b.wiki; \}\);/,
      "    list.forEach(c=>c.rank=Math.round(100*(window.touchpointScores[c.title]??0))); return list.sort((a,b)=>(window.touchpointScores[b.title]??0)-(window.touchpointScores[a.title]??0)||a.wiki-b.wiki);",
    );
  html = html.replace(
    "<script>",
    `<script>window.touchpointScores=${JSON.stringify(scores)};window.holdSearch=false;const realTimeout=window.setTimeout.bind(window);window.setTimeout=(fn,ms,...args)=>ms===4200?0:ms===420?(window.holdSearch?0:realTimeout(fn,0,...args)):realTimeout(fn,ms,...args);</script><script>`,
  );
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
      const frame=${frame},T=window.touchpointsTest;
      document.documentElement.dataset.theme=${JSON.stringify(theme)};
      const dock=document.querySelector('#dock');dock.style.width='${width}px';dock.style.height='${height}px';
      const fix=document.createElement('style');fix.textContent='.btn.primary:disabled{color:var(--idle);background:none}.pane{position:relative}.pane.footed>.toast{inset-block-end:calc(var(--h-foot) + var(--sp-3))}.recov{grid-row:1/-1}@container pane (max-width:599px) and (max-height:209px){.bar,.body,.foot{display:none}.recov{display:grid}}';document.head.append(fix);
      if(${width}<402&&${width}>=242)fix.textContent+='.pane.footed{grid-template-rows:auto minmax(0,1fr) var(--h-foot)}';
      const row=n=>[...document.querySelectorAll('.cand')].find(el=>el.dataset.c===n);
      const pick=n=>row(n).querySelector('.pick').click();
      const rel=(n,value)=>{const el=row(n).querySelector('[data-rel]');el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));};
      const search=async kind=>{T.search(kind);await new Promise(r=>realTimeout(r,50));};
      if([12,13,21].includes(frame))document.querySelector('[data-pane="ind"]').click();
      if([2,8].includes(frame)){pick('Academic journal');pick('Peer review');rel('Peer review','rdfs:seeAlso');}
      if(frame===3){window.holdSearch=true;T.search('search');}
      if(frame===4){await search('search');T.V().fetched='2 March 2026, 14:11';T.render();}
      if(frame===5)await search('refresh');
      if(frame===6){await search('refresh');await search('refresh');}
      if(frame===7){pick('Academic journal');pick('Research');T.apply();}
      if(frame===8)T.apply();
      if(frame===9){T.V().stale=true;pick('Academic journal');T.apply();}
      if(frame===10){row('Journal').querySelector('.cdesc').click();}
      if(frame===11){T.V().model=false;T.render();}
      if(frame===13){await search('search');document.querySelector('#toast').hidden=true;pick('Marie Curie');rel('Marie Curie','owl:sameAs');const el=row('Marie Curie').querySelector('[data-tgt]');el.value='Wikidata';el.dispatchEvent(new Event('change',{bubbles:true}));pick('Pierre Curie');}
      if([16,17].includes(frame))pick('Academic journal');
      if([12,21].includes(frame))document.querySelector('#foot').children[3].remove();
      window.dispatchEvent(new Event('resize'));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      if([14,15].includes(frame)){document.querySelector('#aMore').click();document.querySelector('.menu button').focus();}
      const rows=document.querySelector('#rows');
      if(frame===7)row('Research').scrollIntoView({block:'center'});else if(frame===10)rows.scrollTop=rows.scrollHeight;else rows.scrollTop=0;
      document.querySelector('#q').setAttribute('value',document.querySelector('#q').value);
      const pane=document.querySelector('#pane'),box=pane.getBoundingClientRect(),menu=document.querySelector('.menu');
      if(menu){const m=menu.getBoundingClientRect();menu.style.left=(m.x-box.x)+'px';menu.style.top=(m.y-box.y)+'px';}
      return {css:[...document.querySelectorAll('style')].map(s=>s.textContent).join('\\n'),html:pane.outerHTML,menu:menu?.outerHTML??'',scroll:rows.scrollTop};
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
  const name = String(frame).padStart(2, "0") + "-" + theme;
  const prepared = await prepareReference(frame, theme, width, height);
  await f.host().evaluate(
    (host, { prepared, theme }) => {
      const ref = document.createElement("div");
      ref.id = "touchpoints-reference";
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
      (host, { reference, frame, scroll }) => {
        const ref = host.querySelector<HTMLElement>("#touchpoints-reference")!,
          content = host.querySelector<HTMLElement>(".adaptive-pane-content")!,
          recovery = host.querySelector<HTMLElement>(".pane-recovery")!;
        const actualMenu = content.querySelector<HTMLElement>('[role="menu"]');
        content.style.visibility = reference ? "hidden" : "";
        recovery.style.visibility = reference ? "hidden" : "";
        if (actualMenu) actualMenu.style.visibility = reference ? "hidden" : "";
        ref.style.display = reference ? "block" : "none";
        const root = reference ? ref.shadowRoot! : host;
        const surface = reference
          ? ref
          : host.querySelector<HTMLElement>(".touchpoints-surface")!;
        surface.style.transform = "translateZ(0)";
        root
          .querySelectorAll<HTMLElement>(".btn,.fld,.sel,.pick,.menu")
          .forEach((el) => (el.style.transform = "translateZ(0)"));
        if (reference) {
          root.querySelector<HTMLElement>("#rows")!.scrollTop = scroll;
          if (frame === 23)
            root
              .querySelector<HTMLElement>(".pick")!
              .focus({ preventScroll: true });
        }
        if (reference && [14, 15].includes(frame)) {
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
      { reference, frame, scroll: prepared.scroll },
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
      // #165: stability means identical dimensions and decoded pixels. PNG
      // container/compression differences are not a rendered-frame difference.
      const stable = await f.app.evaluate(
        ({ nativeImage }, images) => {
          const [a, b] = images.map((image) =>
            nativeImage.createFromBuffer(Buffer.from(image, "base64")),
          );
          const as = a.getSize(),
            bs = b.getSize();
          return (
            as.width === bs.width &&
            as.height === bs.height &&
            a.toBitmap().equals(b.toBitmap())
          );
        },
        [previous.toString("base64"), current.toString("base64")],
      );
      if (stable) return current;
      if (i === 4) {
        const kind = reference ? "reference" : "actual";
        for (const [suffix, body] of [
          ["previous", previous],
          ["current", current],
        ] as const)
          await test.info().attach(`${name}-${kind}-${suffix}`, {
            body,
            contentType: "image/png",
          });
        await test.info().attach(`${name}-${kind}-unstable-styles`, {
          body: Buffer.from(JSON.stringify(await diagnostics(reference))),
          contentType: "application/json",
        });
      }
      previous = current;
    }
    throw Error("Unstable Touchpoints frame " + frame);
  };
  const diagnostics = async (reference: boolean) =>
    f.host().evaluate((host, reference) => {
      const root = reference
        ? host.querySelector("#touchpoints-reference")!.shadowRoot!
        : host;
      return [
        ...root.querySelectorAll(
          ".bar,.pin,.pk,.fld,.btn,.cand,.pick,.ctitle,.cdesc,.copt,.sel,.ciri,.empty,.why2,.foot,.toast,.id,.why,.menu,.menu button",
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
  const actual = await shoot(false),
    actualStyles = await diagnostics(false),
    expected = await shoot(true),
    expectedStyles = await diagnostics(true);
  await writeFile(`artifacts/issue-92/${name}-actual.png`, actual);
  await writeFile(`artifacts/issue-92/${name}-expected.png`, expected);
  await writeFile(
    `artifacts/issue-92/${name}-styles.json`,
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
  await writeFile(`artifacts/issue-92/${name}.json`, JSON.stringify(diff));
  // #165: preserve exact failed comparisons in the CI artifact for review.
  if (
    diff.pixels ||
    JSON.stringify(diff.expected) !== JSON.stringify(diff.size)
  ) {
    await test
      .info()
      .attach(name + " actual", { body: actual, contentType: "image/png" });
    await test
      .info()
      .attach(name + " expected", { body: expected, contentType: "image/png" });
    await test.info().attach(name + " styles", {
      body: Buffer.from(
        JSON.stringify({ actual: actualStyles, expected: expectedStyles }),
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
      f = await launchTouchpoints(theme, frame === 11);
      // Hold only the shared toast timer, as the published capture script does.
      await f.page.evaluate(() => {
        const original = window.setTimeout.bind(window);
        (window as any).touchpointsToasts = [];
        window.setTimeout = ((
          handler: TimerHandler,
          ms?: number,
          ...args: any[]
        ) => {
          if (ms === 4200) {
            (window as any).touchpointsToasts.push(handler);
            return 0;
          }
          return original(handler, ms, ...args);
        }) as typeof window.setTimeout;
      });
      const [width, height] = sizes[frame] ?? [900, 560];
      if ([12, 13, 21].includes(frame)) await f.open(true);
      await f.size(width - 2, height - 30);
      if ([2, 8].includes(frame)) {
        await f.select("Academic journal");
        await f.select("Peer review");
        await f.relation("Peer review", "rdfs:seeAlso");
      }
      if (frame === 3) {
        await holdRequests(f.app, ["touchpoints:search"], "touchpoints:search");
        await f
          .pane()
          .getByRole("button", { name: "Search", exact: true })
          .click();
        await waitForHeld(f.app);
      }
      if (frame === 4) await f.search();
      if (frame === 5) {
        await f.reply("429");
        await f.search(true);
      }
      if (frame === 6) {
        await f.reply("refresh");
        await f.search(true);
      }
      if (frame === 7) {
        await f.select("Academic journal");
        await f.select("Research");
        await f
          .pane()
          .getByRole("button", { name: "Apply selected touchpoints" })
          .click();
      }
      if (frame === 8) {
        await f
          .pane()
          .getByRole("button", { name: "Apply selected touchpoints" })
          .click();
        await expect(f.pane().locator(".touchpoints-note")).toContainText(
          "Added 2 resource statements",
        );
      }
      if (frame === 9) {
        await f.page.evaluate(() =>
          window.axiom.request("createClass", {
            name: "Outside edit",
            parent: "http://www.w3.org/2002/07/owl#Thing",
          }),
        );
        await f.select("Academic journal");
        await f
          .pane()
          .getByRole("button", { name: "Apply selected touchpoints" })
          .click();
      }
      if (frame === 10) {
        await f.row("Journal").locator(".cdesc").click();
      }
      if (frame === 13) {
        await f.search();
        await f.page.evaluate(() => {
          (window as any).touchpointsToasts
            .splice(0)
            .forEach((fn: () => void) => fn());
        });
        await f.select("Marie Curie");
        await f.relation("Marie Curie", "owl:sameAs");
        await f
          .row("Marie Curie")
          .getByRole("combobox", {
            name: "Target for Marie Curie",
            exact: true,
          })
          .selectOption("wikidata");
        await f.select("Pierre Curie");
      }
      if ([16, 17].includes(frame)) await f.select("Academic journal");
      if (menuFrames.includes(frame))
        await f.pane().getByRole("button", { name: "More actions" }).click();
      if (frame === 23) {
        await f.pane().getByRole("button", { name: "More actions" }).focus();
        await f.page.keyboard.press("Tab");
        await expect(f.pane().getByRole("checkbox").first()).toBeFocused();
      }
      if (frame === 7)
        await f
          .row("Research")
          .evaluate((el) => el.scrollIntoView({ block: "center" }));
      else
        await f
          .host()
          .locator(".rows")
          .evaluate((el, frame) => {
            el.scrollTop = frame === 10 ? el.scrollHeight : 0;
          }, frame);
      await f.page.mouse.move(0, 0);
      if (frame !== 23 && !menuFrames.includes(frame))
        await f.page.evaluate(() =>
          (document.activeElement as HTMLElement)?.blur(),
        );
      await compare(frame, theme, width, height);
    });
