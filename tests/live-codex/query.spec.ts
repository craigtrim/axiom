import { launchExample } from "../e2e/example-fixture";
import {
  test,
  expect,
  type ElectronApplication,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { discoverAssistants } from "../../src/main/local-assistant";
import { readFileSync } from "node:fs";
import {
  NS,
  THING,
  expand,
  local,
  humanise,
  type Term,
} from "../../src/domain/model";
import type {
  QueryAssistantResponse,
  QueryAssistantStatus,
} from "../../src/shared/query-assistant";
import type { QuerySummary } from "../../src/shared/protocol";

let app: ElectronApplication, page: Page;
let generated: QueryAssistantResponse | undefined;
const errors: string[] = [];
const fixture = JSON.parse(
  readFileSync("src/domain/data/pizza.json", "utf8"),
) as {
  classes: { iri: string; parents: string[] }[];
  pizzas: { iri: string }[];
};
const initial =
  "SELECT ?subject ?predicate ?object WHERE { ?subject ?predicate ?object . } LIMIT 100";
const classes = [
  ...fixture.classes,
  ...fixture.pizzas.map((e) => ({ ...e, parents: ["pizza:NamedPizza"] })),
].map((e) => ({ iri: expand(e.iri), parents: e.parents.map(expand) }));
const classSet = new Set(classes.map((e) => e.iri));
const american = [NS.pizza + "American", NS.pizza + "AmericanHot"];
const editorText = () =>
  page.evaluate(async () =>
    String(
      (await window.axiom.preferences.load()).panelState?.["query.text"] ?? "",
    ).replaceAll("\r\n", "\n"),
  );
async function enter(text: string) {
  const region = page.getByRole("region", { name: "Compose a SPARQL query" });
  const reopen = await region.isVisible();
  if (reopen)
    await region.getByRole("button", { name: "Close query composer" }).click();
  await page.locator(".monaco-editor textarea").focus();
  await page.keyboard.press("Control+A");
  await page.keyboard.insertText(text);
  await expect.poll(editorText).toBe(text);
  if (reopen)
    await page
      .getByRole("button", { name: "Compose query", exact: true })
      .click();
}
async function attach(info: TestInfo, name: string, value: unknown) {
  await info.attach(name, {
    body: Buffer.from(JSON.stringify(value, null, 2)),
    contentType: "application/json",
  });
}
test.beforeEach(async ({}, info) => {
  generated = undefined;
  errors.length = 0;
  if (process.env.AXIOM_LIVE_CODEX !== "1")
    throw Error("Live Codex tests require explicit opt-in.");
  const command = (await discoverAssistants()).find((c) => c.id === "codex");
  expect(
    command,
    "Codex must be installed on the real PATH; no skip or fake provider",
  ).toBeDefined();
  const version = await promisify(execFile)(
    command!.file,
    [...command!.args, "--version"],
    { windowsHide: true, timeout: 15000 },
  );
  await attach(info, "codex-installation", {
    executable: command!.file,
    arguments: command!.args,
    version: version.stdout.trim(),
    build: process.env.AXIOM_TEST_EXE ?? "source Electron build",
  });
  console.log(
    "Live provider:",
    command!.args[0] ?? command!.file,
    version.stdout.trim(),
  );
  await mkdir("artifacts/testing", { recursive: true });
  const profile = await mkdtemp(path.resolve("artifacts/testing/codex-live-"));
  const env = { ...process.env, AXIOM_USER_DATA: profile } as Record<
    string,
    string
  >;
  delete env.ELECTRON_RUN_AS_NODE;
  // PATH and CLI authentication are inherited unchanged. No fixture executable or IPC mock.
  app = await launchExample({
    executablePath: process.env.AXIOM_TEST_EXE,
    args: process.env.AXIOM_TEST_EXE ? [] : ["."],
    env,
  });
  page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  await expect(page.getByTestId("graph-canvas")).toBeVisible();
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({
      response: 1,
      checkboxChecked: false,
    });
  });
  await page.evaluate(() => window.axiom.command("query.generate"));
  await expect(
    page.getByRole("region", { name: "Compose a SPARQL query" }),
  ).toBeVisible();
  const installed = await page.evaluate(() =>
    window.axiom.queryAssistant.assistants(),
  );
  expect(installed.find((a) => a.id === "codex")?.available).toBe(true);
  expect(installed.find((a) => a.id === "codex")?.path).toBe(
    command!.args[0] ?? command!.file,
  );
  await page
    .getByRole("combobox", { name: "Query agent" })
    .selectOption("codex");
  await enter(initial);
});
test.afterEach(async ({}, info) => {
  if (app) {
    try {
      if (page && !page.isClosed()) {
        await attach(
          info,
          "final-agent-status",
          await page.evaluate(() => window.axiom.queryAssistant.status()),
        );
        if (info.status !== info.expectedStatus)
          await info.attach("desktop", {
            body: await page.screenshot(),
            contentType: "image/png",
          });
        await page.evaluate(() => window.axiom.queryAssistant.cancel());
      }
    } finally {
      await app.close();
    }
  }
  expect(errors).toEqual([]);
});
async function generate(instructions: string, info: TestInfo, refine = false) {
  const composer = page.getByRole("region", { name: "Compose a SPARQL query" });
  if (!(await composer.isVisible()))
    await page
      .getByRole("button", { name: "Compose query", exact: true })
      .click();
  const before = await editorText();
  const original = await page.evaluate(() => window.axiom.queryHistory.load());
  await composer
    .getByRole("textbox", { name: "Describe your query" })
    .fill(instructions);
  await composer
    .getByRole("checkbox", { name: "Refine the current query" })
    .setChecked(refine);
  await composer
    .getByRole("button", { name: "Generate query", exact: true })
    .click();
  console.log("Prompt:", instructions);
  let status: QueryAssistantStatus = { running: true };
  await expect
    .poll(
      async () => {
        status = await page.evaluate(() =>
          window.axiom.queryAssistant.status(),
        );
        return (
          !status.running &&
          (!!status.error ||
            status.response?.request.instructions === instructions)
        );
      },
      { timeout: 200000, intervals: [1000] },
    )
    .toBe(true);
  await attach(info, "agent-response", status);
  expect(status.error, "Codex CLI error").toBeUndefined();
  expect(status.response?.request.provider).toBe("codex");
  generated = status.response!;
  if (generated.result.status === "query") {
    await expect.poll(editorText).toBe(generated.result.sparql);
    const delivered = await page.evaluate(() =>
      window.axiom.queryHistory.load(),
    );
    expect(delivered.activeId).not.toBe(original.activeId);
    expect(delivered.entries).toHaveLength(original.entries.length + 1);
    const retained = await page.evaluate(
      (before) => window.axiom.queryHistory.search(before),
      before,
    );
    expect(retained.some((e) => e.id === original.activeId)).toBe(true);
    await expect(
      page.getByRole("button", { name: "Use query", exact: true }),
    ).toHaveCount(0);
  }
  if (refine) expect(generated.request.currentQuery).toBe(before);
  await expect(page.locator(".query-run-status")).not.toContainText("displayed");
  return generated;
}
async function useAndRun(info: TestInfo): Promise<(Term | null)[][]> {
  expect(generated?.result.status, generated?.result.explanation).toBe("query");
  expect(generated?.validation, generated?.result.sparql).toBeNull();
  await expect(page.locator(".query-main .monaco-editor")).toBeVisible();
  await expect.poll(editorText).toBe(generated!.result.sparql);
  await page.getByRole("button", { name: /^Run(?: |$)/ }).click();
  await expect(page.locator(".query-results-panel:visible .query-summary")).toContainText("displayed", {
    timeout: 20000,
  });
  await expect(page.locator(".query-error")).toHaveCount(0);
  // Retrieve results using the same worker route used by the grid, independently of variable names.
  const result = await execute(generated!.result.sparql);
  await attach(info, "executed-query-results", result);
  expect(result.summary.capped).toBe(false);
  return result.rows;
}
async function execute(text: string) {
  return page.evaluate(async (text) => {
    const summary = await window.axiom.request<QuerySummary>("query", { text });
    const rows: (Term | null)[][] = [];
    for (let start = 0; start < summary.rowCount; start += 1000) {
      const result = await window.axiom.request<{ rows: (Term | null)[][] }>(
        "queryPage",
        {
          id: summary.id,
          start,
          end: Math.min(summary.rowCount, start + 1000),
        },
      );
      rows.push(...result.rows);
    }
    return { summary, rows };
  }, text);
}
function resourceRows(rows: (Term | null)[][], universe = classSet) {
  const resources = rows.map(
    (row) => row.find((t) => t && !t.literal && universe.has(t.value))?.value,
  );
  expect(
    resources.every(Boolean),
    "Every returned row must identify a requested entity",
  ).toBe(true);
  return [...new Set(resources as string[])].sort();
}
test("American prefix from the reported prompt returns classes and remains a prefix query", async ({}, info) => {
  await generate("All classes where type starts with American", info);
  const rows = await useAndRun(info);
  expect(resourceRows(rows)).toEqual(american.slice().sort());
  // The query must express the condition, not enumerate the two supplied names.
  const added = await page.evaluate(() =>
    window.axiom.request<string>("createClass", {
      name: "American Special",
      parent: "http://www.w3.org/2002/07/owl#Thing",
    }),
  );
  const after = await execute(generated!.result.sparql);
  await attach(info, "results-after-adding-a-matching-class", after);
  expect(resourceRows(after.rows, new Set([...classSet, added]))).toEqual(
    [...american, added].sort(),
  );
});
test("case-insensitive class prefix matches mixed-case input", async ({}, info) => {
  await generate(
    "List class IRIs whose class names start with aMeRiCaN, ignoring case.",
    info,
  );
  expect(resourceRows(await useAndRun(info))).toEqual(american.slice().sort());
});
test("class-name substring returns the complete expected class set", async ({}, info) => {
  await generate(
    "List class IRIs whose names contain Cheese. Return class IRIs, not pizza orders.",
    info,
  );
  const expected = classes
    .filter((e) => humanise(local(e.iri)).includes("Cheese"))
    .map((e) => e.iri)
    .sort();
  expect(expected.length).toBeGreaterThan(2);
  expect(resourceRows(await useAndRun(info))).toEqual(expected);
});
test("direct parent lookup returns the asserted parents", async ({}, info) => {
  await generate(
    "List the IRIs of the direct parent classes of AmericanHot.",
    info,
  );
  expect(resourceRows(await useAndRun(info))).toEqual(
    classes
      .find((e) => e.iri === NS.pizza + "AmericanHot")!
      .parents.slice()
      .sort(),
  );
});
test("refinement preserves the intended filter, descending order and limit", async ({}, info) => {
  await enter("SELECT ?class WHERE { ?class a owl:Class . } LIMIT 100");
  await generate(
    "Keep only classes whose names start with American, sort class IRIs descending, and return one row.",
    info,
    true,
  );
  expect(resourceRows(await useAndRun(info))).toEqual([
    NS.pizza + "AmericanHot",
  ]);
});
test("instance query filters by the type name without returning classes as instances", async ({}, info) => {
  await generate(
    "List five pizza order IRIs whose asserted type has a class name starting with American. Return each order IRI and its type.",
    info,
  );
  const rows = await useAndRun(info);
  expect(rows).toHaveLength(5);
  for (const row of rows) {
    const order = row.find(
      (t) => t && !t.literal && t.value.startsWith(NS.demo + "Pizza_"),
    );
    expect(order, "Each row must contain a real order").toBeDefined();
    const expected = (
      await page.evaluate(
        (iri) =>
          window.axiom.request<{ order?: { type: string } }>("inspector", {
            iri,
          }),
        order!.value,
      )
    ).order?.type;
    expect(american).toContain(expected);
    expect(row.some((t) => t && !t.literal && t.value === expected)).toBe(true);
  }
});
test("COUNT returns the actual number of declared classes", async ({}, info) => {
  await generate(
    "Use COUNT to return the number of owl:Class declarations as one aggregate result.",
    info,
  );
  const rows = await useAndRun(info);
  expect(rows).toHaveLength(1);
  expect(Number(rows[0].find((t) => t?.literal)?.value)).toBe(classSet.size);
});
test("ASK returns a boolean answer", async ({}, info) => {
  await generate(
    "Use ASK to determine whether AmericanHot is declared as an owl:Class.",
    info,
  );
  const rows = await useAndRun(info);
  expect(rows).toHaveLength(1);
  expect(rows[0][0]?.value).toBe("true");
});
test("OPTIONAL retains classes without asserted labels", async ({}, info) => {
  await generate(
    "List American and AmericanHot class IRIs with their optional asserted rdfs:label. Keep a row even if its label is missing.",
    info,
  );
  const rows = await useAndRun(info);
  expect(resourceRows(rows)).toEqual(american.slice().sort());
  expect(rows.every((row) => row.includes(null))).toBe(true);
});
test("property paths traverse all asserted ancestors", async ({}, info) => {
  await generate(
    "List all ancestor class IRIs of AmericanHot by following rdfs:subClassOf one or more times. Include indirect ancestors and remove duplicates.",
    info,
  );
  const pending = [NS.pizza + "AmericanHot"],
    ancestors = new Set<string>();
  while (pending.length) {
    const current = pending.pop();
    for (const parent of classes.find((c) => c.iri === current)?.parents ?? [])
      if (!ancestors.has(parent)) {
        ancestors.add(parent);
        pending.push(parent);
      }
  }
  expect(
    resourceRows(await useAndRun(info), new Set([...classSet, THING])),
  ).toEqual([...ancestors].sort());
});
test("GROUP BY counts real orders by American pizza type", async ({}, info) => {
  await generate(
    "Count pizza orders grouped by their asserted type, keeping only types whose class name starts with American. Return type IRI and count.",
    info,
  );
  const rows = await useAndRun(info);
  expect(resourceRows(rows)).toEqual(american.slice().sort());
  const bindings = (
    await execute(
      "SELECT ?order ?type WHERE { ?order a ?type . VALUES ?type { pizza:American pizza:AmericanHot } }",
    )
  ).rows;
  for (const row of rows) {
    const type = row.find(
      (t) => t && !t.literal && american.includes(t.value),
    )!.value;
    const count = row.find((t) => t?.literal);
    expect(Number(count?.value)).toBe(
      bindings.filter((r) => r.some((t) => t?.value === type)).length,
    );
  }
});
test("imported labels are matched independently of identifier spelling", async ({}, info) => {
  const file = path.resolve(info.outputPath("courses.ttl"));
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(
    file,
    `@prefix ex: <https://example.test/courses#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
ex:CreditUnit a owl:Class ; rdfs:label "Course Credit" .
ex:TransferUnit a owl:Class ; rdfs:label "Course Credit Transfer" .
ex:CourseCreditArchive a owl:Class ; rdfs:label "Archived credits" .
ex:Course a owl:Class ; rdfs:label "Course" .
`,
  );
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, file);
  await page.evaluate(() => window.axiom.command("file.import"));
  await expect
    .poll(
      async () =>
        (
          await page.evaluate(() =>
            window.axiom.request<{ ontology: { example: boolean } }>("state"),
          )
        ).ontology.example,
    )
    .toBe(false);
  await page.evaluate(() => window.axiom.command("query.generate"));
  await enter(initial);
  await generate(
    'List class IRIs whose labels start with "Course Credit". Match labels, not identifier names.',
    info,
  );
  const expected = [
    "https://example.test/courses#CreditUnit",
    "https://example.test/courses#TransferUnit",
  ];
  expect(
    resourceRows(
      await useAndRun(info),
      new Set([
        ...expected,
        "https://example.test/courses#CourseCreditArchive",
        "https://example.test/courses#Course",
      ]),
    ),
  ).toEqual(expected);
});
