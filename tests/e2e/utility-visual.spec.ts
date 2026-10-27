// craigtrim/axiom#94: compare all utility states as native raw bitmaps, without tolerance or masks.
import { tabTypes, tabDate } from "../../src/shared/tab-history";
import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
// craigtrim/axiom#111: the reference comparison changes source ink only.
import { assertSyntaxPalette, monochromeSource } from "./syntax-assertions";
import {
  launchUtility,
  utilityReference,
  type UtilityFixture,
} from "./utility-reference-fixture";
let f: UtilityFixture;
test.afterEach(async () => {
  await f?.close();
  expect(f?.errors ?? []).toEqual([]);
});
const sizes: Record<number, [number, number]> = {
  5: [418, 530],
  6: [418, 530],
  12: [898, 290],
  13: [418, 530],
  14: [418, 530],
  20: [358, 530],
  21: [358, 530],
  28: [418, 530],
  29: [298, 530],
  36: [418, 530],
  37: [418, 530],
  38: [218, 290],
  39: [218, 290],
  40: [218, 290],
  41: [218, 290],
  42: [218, 290],
  43: [898, 170],
};
const menus = [6, 14, 21, 29, 37];
const views = (n: number) =>
  n <= 6 || n === 38 || n === 43
    ? "source"
    : n <= 14 || n === 39
      ? "provenance"
      : n <= 21 || n === 40
        ? "suggestionruns"
        : n <= 29 || n === 41
          ? "errorlog"
          : "tabhistory";
async function oracle(
  frame: number,
  theme: string,
  width: number,
  height: number,
  text: string,
  error: string,
) {
  let html = await readFile(utilityReference, "utf8");
  html = html
    .replace(
      "  boot();",
      "window.utilityTest={SRC,PR,WALK,RUNS,ERR,HIST,Source,Prov,Runs,Errors,Hist,render,view:v=>V=v}; boot();",
    )
    .replaceAll("Maximise pane", "Maximize pane")
    .replaceAll("Recognised credentials", "Recognized credentials");
  const external = {
    ...(await f.app.evaluate(() => {
      const g = globalThis as any;
      return {
        provenance: g.utilityProvenance,
        batch: g.utilityBatch,
        records: g.utilityRecords,
      };
    })),
    selected: !!(await f.state()).selected,
    history: (
      await f.page.evaluate(() => window.axiom.preferences.load())
    ).tabHistory?.entries.map((t) => ({
      id: t.id,
      n: t.name,
      t: tabTypes[t.type],
      d: tabDate(t.createdAt),
      auto: !t.named,
      closed: t.id.startsWith("utilitySaved"),
    })),
  };
  return f.app.evaluate(
    async (
      { BrowserWindow },
      { html, frame, theme, width, height, text, error, external, view },
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
      const input = {
        frame,
        theme,
        width,
        height,
        text,
        error,
        external,
        view,
      };
      const result = await ref.webContents.executeJavaScript(`(async()=>{
      const {frame,theme,width,height,text,error,external,view}=${JSON.stringify(input)},T=window.utilityTest;
      document.documentElement.dataset.theme=theme;
      const dock=document.querySelector('#dock');dock.style.width=(width+2)+'px';dock.style.height=(height+30)+'px';
      const style=document.createElement('style');style.textContent='.rows>.grid{min-width:470px}.btn.primary:disabled{color:var(--idle);background:none}.pane{grid-template-columns:minmax(0,1fr);position:relative}.recov{grid-row:1/-1}.leaf[aria-disabled="true"]{color:var(--idle);cursor:default}.leaf[aria-disabled="true"]:hover{background:none}@container pane (max-width:599px){.ed{grid-template-columns:32px minmax(0,1fr)}}@container pane (max-width:599px) and (max-height:209px){.bar,.body,.foot{display:none}.recov{display:grid}}';document.head.append(style);
      T.SRC.saved=text;T.SRC.text=text;
      if([2,3,4,43].includes(frame))T.SRC.saved=text+'\\n';
      if(frame===4)T.SRC.stale=true;
      const originalHead=T.Source.head;
      if(frame===3){const line=error.match(/(?:on\\s+)?line\\s+(\\d+)/i)?.[1];T.Source.head=()=>'<div class="note2 bad3"><b>'+esc(error)+'</b> The text stays here and the ontology is unchanged until it parses.</div>';const old=T.Source.bar;T.Source.bar=()=>old().replace(/Invalid on line \\d+/,line?'Invalid on line '+line:'Invalid');}
      T.Source.menu=()=>[{l:'Reload from ontology',act:'s:reload'}];
      const p=external.provenance;
      Object.assign(T.PR,{root:p.root,max:p.options.maxEntries,timeout:p.options.timeoutSeconds,offline:p.options.readOffline,status:p.status,entries:p.observations,files:p.files,dirs:p.directories,issues:p.issues,current:p.current||'',pct:p.status==='idle'?0:100,msg:p.status==='complete'?'saved with its evidence':p.status==='cancelled'?'partial, kept with its evidence':''});
      T.WALK.splice(0,T.WALK.length,...p.recent.slice().reverse().map(r=>r.path.slice(p.root.length+1)));
      T.Runs.bar=()=>{const running=external.batch.runs.some(r=>r.state==='queued'||r.state==='running');return '<button class="btn primary" type="button" id="'+(running?'rcancel':'rstart')+'">'+(running?'Cancel the batch':'Run the batch')+'</button><span class="state" id="state">assistant Claude, 5 targets</span><span class="od-fill"></span><button class="btn quiet" id="rreset">Clear results</button>';};
      T.RUNS.frozen.forEach((name,i)=>{const r=external.batch.runs[i];T.RUNS.state[name]={status:r.state==='completed'?'done':r.state,results:r.count,log:r.state==='failed'?'e1':null};});
      T.HIST.list.forEach(x=>x.closed=true);if(frame===31)T.HIST.list.splice(0,T.HIST.list.length,...external.history);
      T.HIST.list.sort((a,b)=>a.t.localeCompare(b.t)||b.d.localeCompare(a.d)||a.n.localeCompare(b.n,undefined,{numeric:true}));
      if(frame===31)T.HIST.keep='all';if(frame===32)T.HIST.sel='Citation network';if(frame===33)T.HIST.filter='2026-10-09';if(frame===34)T.HIST.filter='2025';
      if([23,24,27,28,29].includes(frame))T.ERR.open='e1';if(frame===25)T.ERR.open='e4';if(frame===26)T.ERR.open='e3';
      T.view({source:'source',provenance:'prov',suggestionruns:'runs',errorlog:'errors',tabhistory:'hist'}[view]);T.render();
      if(view==='source'){document.querySelector('#findSel').disabled=!external.selected;if(frame===4)document.querySelector('#fmt').disabled=true;}
      if([9,11].includes(frame))document.querySelector('.prog i').style.width='33.3333%';
      if(frame===25)document.querySelectorAll('.ent[data-open="true"] .dsec,.ent[data-open="true"] .prow').forEach(e=>e.remove());
      if(frame===24)document.querySelector('.dsec').open=true;
      if(frame===18)toast('No further targets will start.','The run already in flight is allowed to finish first.');
      if(frame===27)toast('Report copied.','Credentials were already redacted, and the copy is exactly what is displayed.');
      if(frame===35)toast('That tab is not retained by the current setting.','Switch to All tabs, or rename it, to keep it after closing.');
      window.dispatchEvent(new Event('resize'));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      if([6,14,21,29,37].includes(frame)){
        document.querySelector('#aMore').click();const menu=document.querySelector('.menu'),kids=[...menu.children],sep=kids.findIndex(e=>e.classList.contains('sep')),labels=sep<0?[]:kids.slice(0,sep).map(e=>e.textContent.trim());
        kids.forEach((el,i)=>{const label=el.textContent.trim();if(i>sep&&labels.includes({'Choose a different folder':'Choose folder','Clear results':'Clear results'}[label])){el.remove();return;}const control=[...document.querySelectorAll('#bar>[id]')].find(c=>c.hidden&&(c.tagName==='INPUT'?c.getAttribute('aria-label'):c.textContent.trim())===label);if(control?.disabled)el.setAttribute('aria-disabled','true');});
        if(menu.lastElementChild?.classList.contains('sep'))menu.lastElementChild.remove();
      }
      document.querySelectorAll('input').forEach(e=>e.setAttribute('value',e.value));document.querySelectorAll('textarea').forEach(e=>e.textContent=e.value);
      const pane=document.querySelector('#pane'),box=pane.getBoundingClientRect(),menu=document.querySelector('.menu');if(menu){const m=menu.getBoundingClientRect();menu.style.left=(m.x-box.x)+'px';menu.style.top=(m.y-box.y)+'px';}
      return {css:[...document.querySelectorAll('style')].map(e=>e.textContent).join('\\n'),html:pane.outerHTML,menu:menu?.outerHTML??''};
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
      text,
      error,
      external,
      view: views(frame),
    },
  );
}
async function compare(
  frame: number,
  theme: string,
  width: number,
  height: number,
  text: string,
  error: string,
) {
  const prepared = await oracle(frame, theme, width, height, text, error);
  await f.host().evaluate(
    (host, { prepared, theme }) => {
      const ref = document.createElement("div");
      ref.id = "utility-reference";
      ref.dataset.theme = theme;
      ref.style.cssText =
        "all:initial;font:13px/1.45 var(--font);color:var(--text);-webkit-font-smoothing:antialiased;display:none;position:absolute;inset:0;width:100%;height:100%;overflow:hidden;container:pane / size";
      ref.style.colorScheme = theme;
      ref.attachShadow({ mode: "open" }).innerHTML =
        `<style>${prepared.css.replace(/:root(\[[^\]]+\])/g, ":host($1)").replaceAll(":root", ":host")}</style><style>.pane{width:100%;height:100%;border:0;border-radius:0;position:relative}.menu{position:absolute}*{transition:none!important}</style>${prepared.html}${prepared.menu}`;
      host.append(ref);
    },
    { prepared, theme },
  );
  const shoot = async (reference: boolean) => {
    await f.host().evaluate(
      (host, { reference, frame }) => {
        const ref = host.querySelector<HTMLElement>("#utility-reference")!,
          content = host.querySelector<HTMLElement>(".adaptive-pane-content")!,
          recovery = host.querySelector<HTMLElement>(".pane-recovery")!;
        content.style.visibility = reference ? "hidden" : "";
        recovery.style.visibility = reference ? "hidden" : "";
        const menu = content.querySelector<HTMLElement>('[role="menu"]');
        if (menu) menu.style.visibility = reference ? "hidden" : "";
        ref.style.display = reference ? "block" : "none";
        const root = reference ? ref.shadowRoot! : host;
        (reference
          ? ref
          : host.querySelector<HTMLElement>(".utility-surface")!
        ).style.transform = "translateZ(0)";
        root
          .querySelectorAll<HTMLElement>(".btn,.fld,.sel,.seg,.menu,.gl")
          .forEach((el) => (el.style.transform = "translateZ(0)"));
        if (reference && [2, 33, 34].includes(frame))
          root
            .querySelector<HTMLElement>(frame === 2 ? "#code" : "#hf")!
            .focus({ preventScroll: true });
        if (reference && [6, 14, 21, 29, 37].includes(frame)) {
          const m = root.querySelector<HTMLElement>(".menu")!;
          if (!m.hasAttribute("popover")) {
            const box = host.getBoundingClientRect(),
              left = parseFloat(m.style.left) + box.x,
              top = parseFloat(m.style.top) + box.y;
            m.setAttribute("popover", "manual");
            Object.assign(m.style, {
              position: "fixed",
              inset: "auto",
              margin: "0",
              left: left + "px",
              top: top + "px",
            });
            m.showPopover();
          }
          const first = m.querySelector<HTMLElement>(
            '[role="menuitem"]:not([aria-disabled="true"])',
          )!;
          first.dataset.active = "true";
          first.focus();
        }
      },
      { reference, frame },
    );
    await f.page.mouse.move(1500, 900);
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
    throw Error("Unstable utility frame " + frame);
  };
  const styles = async (reference: boolean) =>
    f.host().evaluate((host, reference) => {
      const root = reference
        ? host.querySelector("#utility-reference")!.shadowRoot!
        : host;
      return [
        ...root.querySelectorAll(
          ".bar,.btn,.state,.fld,.sel,.seg,.prow,.pl,.pv,.sum,.ed,.gut,.view-lines,.note2,.foot,.ent,.eh,.ebody,.dsec,.grp,.leaf,.grid,.toast,.menu,.id,.why,.source-area,.source-editor,.source-horizontal,.source-extent,.code",
        ),
      ].map((el) => ({
        scroll: [
          el.scrollWidth,
          el.clientWidth,
          el.scrollHeight,
          el.clientHeight,
        ],
        cls: el.className,
        text: el.textContent?.slice(0, 250),
        box: el.getBoundingClientRect().toJSON(),
        style: Object.fromEntries(
          [
            "font",
            "line-height",
            "opacity",
            "border-radius",
            "flex",
            "flex-wrap",
            "color",
            "background",
            "border",
            "padding",
            "margin",
            "gap",
            "display",
          ].map((k) => [k, getComputedStyle(el).getPropertyValue(k)]),
        ),
      }));
    }, reference);
  const coloured = await shoot(false);
  await assertSyntaxPalette(f.host(), 0);
  const restoreColour = await monochromeSource(f.host());
  let actual: Buffer;
  try {
    actual = await shoot(false);
  } finally {
    await restoreColour();
  }
  const aStyles = await styles(false),
    expected = await shoot(true),
    eStyles = await styles(true),
    name = String(frame).padStart(2, "0") + "-" + theme;
  await writeFile(`artifacts/issue-94/${name}-coloured.png`, coloured);
  await writeFile(`artifacts/issue-94/${name}-actual.png`, actual);
  await writeFile(`artifacts/issue-94/${name}-expected.png`, expected);
  await writeFile(
    `artifacts/issue-94/${name}-styles.json`,
    JSON.stringify({ actual: aStyles, expected: eStyles }, null, 2),
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
  await writeFile(`artifacts/issue-94/${name}.json`, JSON.stringify(diff));
  // #165: retain exact failed frames for remote diagnosis; comparisons stay strict.
  if (diff.pixels || JSON.stringify(diff.expected) !== JSON.stringify(diff.size)) {
    await test.info().attach(name + " actual", {
      body: actual,
      contentType: "image/png",
    });
    await test.info().attach(name + " expected", {
      body: expected,
      contentType: "image/png",
    });
    await test.info().attach(name + " styles", {
      body: Buffer.from(JSON.stringify({ actual: aStyles, expected: eStyles })),
      contentType: "application/json",
    });
  }
  expect(diff.expected).toEqual(diff.size);
  expect(diff.pixels, name).toBe(0);
}
for (const theme of ["light", "dark"])
  for (let frame = 1; frame <= 43; frame++)
    test(`${theme} frame ${String(frame).padStart(2, "0")} matches raw reference pixels`, async () => {
      f = await launchUtility(theme, views(frame), frame);
      const [width, height] = sizes[frame] ?? [898, 530];
      let text = f.doc.text,
        error = "";
      if ([2, 3, 4, 43].includes(frame)) {
        text =
          frame === 3
            ? text.replace(/rdfs:label[^\n]+/, 'rdfs:label "broken"@en')
            : text + "\n# retained draft";
        const editor = f
          .pane()
          .getByRole("textbox", { name: "Ontology source", exact: true });
        await editor.focus();
        await f.page.keyboard.press("Control+A");
        await f.page.keyboard.insertText(text);
        if (frame === 3) {
          await f
            .pane()
            .getByRole("button", { name: "Apply changes", exact: true })
            .click();
          await expect(f.pane().locator(".note2.bad3")).toBeVisible();
          error = (await f.pane().locator(".note2.bad3 b").textContent())!;
        }
        if (frame === 4) {
          await f.page.evaluate(() =>
            window.axiom.request("rename", {
              iri: "http://example.org/axiom#Document",
              name: "A different view edited the ontology",
            }),
          );
          await expect(f.pane().getByRole("status").first()).toHaveText(
            "Draft is stale",
          );
        }
      }
      if (frame === 18)
        await f
          .pane()
          .getByRole("button", { name: "Cancel the batch", exact: true })
          .click();
      if ([23, 24, 27, 28, 29].includes(frame))
        await f
          .pane()
          .getByRole("button", { name: /Taxonomy suggestions for Role/ })
          .click();
      if (frame === 25)
        await f
          .pane()
          .getByRole("button", { name: /Write error log record/ })
          .click();
      if (frame === 26)
        await f
          .pane()
          .getByRole("button", { name: /Taxonomy suggestions for Measurement/ })
          .click();
      if (frame === 24) await f.pane().locator(".dsec summary").first().click();
      if (frame === 27) await f.copyReport();
      if (frame === 32)
        await f
          .pane()
          .getByRole("button", { name: /Citation network/ })
          .click();
      if ([33, 34].includes(frame))
        await f
          .pane()
          .getByRole("textbox", { name: "Filter tab history" })
          .fill(frame === 33 ? "2026-10-09" : "2025");
      if (frame === 35)
        await f
          .pane()
          .getByRole("button", { name: /Graph_2/ })
          .click({ force: true });
      await f.size(width, height);
      if (menus.includes(frame))
        await f
          .pane()
          .getByRole("button", { name: "More actions", exact: true })
          .click();
      if (![2, 33, 34, ...menus].includes(frame))
        await f.page.evaluate(() => {
          (document.activeElement as HTMLElement)?.blur();
        });
      await compare(frame, theme, width, height, text, error);
    });
