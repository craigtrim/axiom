import { expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import postcss from "postcss";
import { sharedTokens } from "../../src/renderer/shared-tokens";

// Pin both the palette source and the remaining private owners (craigtrim/axiom#81).
const source = readFileSync(
  "tests/fixtures/design-system-visual/visual-reference.html",
);
it("ships the complete reference palette verbatim", () => {
  expect(createHash("sha256").update(source).digest("hex")).toBe(
    "076925d259b1ea221a227098f09680cd6f04c0cdb92376e9dfe47714433869e7",
  );
  const tokens = source.toString().split("\n").slice(49, 126).join("\n");
  expect(
    readFileSync("src/renderer/styles.css", "utf8").replaceAll("\r\n", "\n"),
  ).toContain(tokens);
  const names = new Set<string>();
  postcss.parse(tokens).walkDecls(/^--/, (d) => {
    names.add(d.prop.slice(2));
  });
  expect(sharedTokens).toEqual(names);
  expect(names.size).toBe(44);
});
it("removes only equal duplicate declarations and retains deferred private palettes", () => {
  const declarations: { file: string; selector: string; name: string }[] = [];
  for (const file of readdirSync("src/renderer").filter((f) =>
    f.endsWith(".css"),
  )) {
    postcss
      .parse(readFileSync("src/renderer/" + file, "utf8"))
      .walkDecls(/^--/, (d) => {
        declarations.push({
          file,
          selector: d.parent?.type === "rule" ? d.parent.selector : "",
          name: d.prop,
        });
      });
  }
  expect(declarations).toHaveLength(339);
  expect(new Set(declarations.map((d) => d.name)).size).toBe(116);
  const shared = declarations.filter(
    (d) => sharedTokens.has(d.name.slice(2)) && d.file !== "styles.css",
  );
  expect(
    shared.every(
      (d) =>
        d.file === "find-reference.css" ||
        d.file === "quality.css" ||
        (d.file === "quality-settings.css" &&
          [
            "--raised",
            "--sunken",
            "--accent",
            "--ok",
            "--warn",
            "--focus",
            ...(d.selector.includes("dark") ? [] : ["--bad"]),
          ].includes(d.name)) ||
        (d.file === "window-chrome.css" && d.name === "--h-tabs"),
    ),
  ).toBe(true);
  expect(shared.filter((d) => d.file === "quality-settings.css")).toHaveLength(
    13,
  );
  expect(
    shared.find((d) => d.file === "window-chrome.css")?.selector,
  ).toContain(".window-chrome");
});
