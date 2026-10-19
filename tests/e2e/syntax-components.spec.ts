import { test, expect } from "@playwright/test";
import { build } from "esbuild";
import { assertCodeBothThemes } from "./syntax-assertions";
import path from "node:path";

// craigtrim/axiom#111: exercise the retained parent picker, including its portal.
// Class creation now normally opens Add entity; this component still supports
// restored Find drafts and shares source colours with the current authoring view.
test("retained parent picker colours local and external identifiers", async ({
  page,
}) => {
  const bundle = await build({
    stdin: {
      contents: `
        import React, {useState} from "react";
        import {createRoot} from "react-dom/client";
        import {TextParentPicker} from "./src/renderer/TextParentPicker";
        const snapshot = {version:1,datasetEpoch:1,ontology:{name:"Example",namespace:"urn:example:"},entities:[
          {iri:"urn:example:Parent",name:"Parent",label:"Parent",comment:"",kind:"Class",parents:[]},
          {iri:"https://example.org/Other",name:"Other",label:"Other",comment:"",kind:"Class",parents:[]}
        ]};
        function Fixture(){
          const [text,setText]=useState("");
          return <TextParentPicker snapshot={snapshot} value={{label:"Draft",comment:"",parents:[],manualParents:true}}
            ready={true} disabled={false} text={text} setText={setText} add={()=>{}} create={()=>{}} />;
        }
        createRoot(document.getElementById("host")).render(<Fixture/>);
      `,
      resolveDir: process.cwd(),
      loader: "tsx",
    },
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    outdir: "unused",
  });
  await page.route("https://syntax.axiom.test/", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<html data-theme="light"><body><div id="host" style="margin:40px;width:500px"></div></body></html>',
    }),
  );
  await page.goto("https://syntax.axiom.test/");
  await page.addStyleTag({ path: path.resolve("dist/renderer/app.css") });
  for (const file of bundle.outputFiles)
    if (file.path.endsWith(".css"))
      await page.addStyleTag({ content: file.text });
    else if (file.path.endsWith(".js"))
      await page.addScriptTag({ content: file.text });
  await page.getByRole("combobox").first().click();
  await expect(page.locator(".text-parent-option code")).toHaveText([
    "https://example.org/Other",
    ":Parent",
  ]);
  await assertCodeBothThemes(page.locator("body"), ".text-parent-option code");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Prompt", exact: true }).click();
  await assertCodeBothThemes(page.locator("body"), ".text-parent-prompt pre");
  const prompt = page.getByRole("textbox", { name: "Parent prompt" });
  await prompt.selectText();
  const selected = await prompt.evaluate((el: HTMLTextAreaElement) => {
    const probe = document.createElement("span");
    probe.style.backgroundColor = "var(--sel)";
    document.body.append(probe);
    const result = {
      text: el.value.slice(el.selectionStart, el.selectionEnd),
      actual: getComputedStyle(el, "::selection").backgroundColor,
      expected: getComputedStyle(probe).backgroundColor,
    };
    probe.remove();
    return result;
  });
  expect(selected.text).toBe(await prompt.inputValue());
  expect(selected.actual).toBe(selected.expected);
});
