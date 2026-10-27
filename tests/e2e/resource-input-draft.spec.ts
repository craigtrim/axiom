import { test, expect } from "@playwright/test";
import { build } from "esbuild";

// Issue 158: exercise prop changes without a remount, including layout-effect blur.
test.beforeEach(async ({ page }) => {
  const bundle = await build({
    stdin: {
      resolveDir: process.cwd(),
      loader: "tsx",
      contents: `
        import React, {useState, useLayoutEffect} from "react";
        import {createRoot} from "react-dom/client";
        import {setState} from "./src/renderer/client";
        import {ResourceInput} from "./src/renderer/ResourceInput";
        window.changes = [];
        window.axiom = {request: async (method) => {
          if (method === "createClass") return new Promise(resolve => window.resolveParent = resolve);
          return [];
        }};
        setState({version:1,datasetEpoch:1,graph:{},types:[],customers:[],
          ontology:{namespace:"https://example.org/#"},entities:[]});
        function Fixture() {
          const [target, setTarget] = useState({value:"First alias", literal:true, focus:false, parent:false});
          window.replace = setTarget;
          useLayoutEffect(() => {
            if (target.focus) {
              document.querySelector("input").focus();
              document.querySelector("button").focus();
            }
          }, [target]);
          return <><ResourceInput value={target.value} textValue={target.literal}
            namespace="https://example.org/#" label="Value" classesOnly={target.parent} createMissingClass={target.parent}
            change={value => window.changes.push({literal:false,value})}
            useText={target.parent ? undefined : value => window.changes.push({literal:true,value})}/>
            <button>Outside</button></>;
        }
        createRoot(document.getElementById("host")).render(<Fixture/>);
      `,
    },
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    outdir: "unused",
  });
  await page.route("https://draft.axiom.test/", (route) =>
    route.fulfill({ contentType: "text/html", body: '<div id="host"></div>' }),
  );
  await page.goto("https://draft.axiom.test/");
  for (const file of bundle.outputFiles)
    if (file.path.endsWith(".js"))
      await page.addScriptTag({ content: file.text });
});

test("layout-effect focus cannot commit the previous literal", async ({
  page,
}) => {
  await expect(page.getByRole("combobox")).toHaveValue("First alias");
  await page.evaluate(() =>
    (window as any).replace({
      value: "Second alias",
      literal: true,
      focus: true,
    }),
  );
  await expect(page.getByRole("combobox")).toHaveValue("Second alias");
  expect(await page.evaluate(() => (window as any).changes)).toEqual([]);
});

test("a focused draft is discarded when the value or resource kind changes", async ({
  page,
}) => {
  const field = page.getByRole("combobox");
  await field.fill("Unsaved draft");
  await page.evaluate(() =>
    (window as any).replace({ value: "Second alias", literal: true }),
  );
  await expect(field).toBeFocused();
  await expect(field).toHaveValue("Second alias");
  await field.fill("Another draft");
  await page.evaluate(() =>
    (window as any).replace({ value: "Second alias", literal: false }),
  );
  await expect(field).toHaveValue("Second alias");
  await page.getByRole("button", { name: "Outside" }).click();
  expect(await page.evaluate(() => (window as any).changes)).toEqual([]);
});

test("a pending parent creation cannot replace a different value", async ({
  page,
}) => {
  await page.evaluate(() =>
    (window as any).replace({
      value: "https://example.org/#First",
      literal: false,
      parent: true,
    }),
  );
  const field = page.getByRole("combobox");
  await expect(field).toHaveValue("First");
  await field.fill("New parent");
  await field.press("Enter");
  await expect
    .poll(() => page.evaluate(() => typeof (window as any).resolveParent))
    .toBe("function");
  await page.evaluate(() =>
    (window as any).replace({
      value: "https://example.org/#Second",
      literal: false,
      parent: true,
    }),
  );
  // #165: replace schedules React state. Establish the changed value before
  // delivering the old asynchronous result, so this tests a stale completion.
  await expect(field).toHaveValue("Second");
  await page.evaluate(() =>
    (window as any).resolveParent("https://example.org/#Created"),
  );
  await expect(field).toBeEnabled();
  await expect(field).toHaveValue("Second");
  expect(await page.evaluate(() => (window as any).changes)).toEqual([]);
});
