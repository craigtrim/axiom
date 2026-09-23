// craigtrim/axiom#1
import { expect, it } from "vitest";
import { launchPath } from "../../src/shared/launch-file";
const exe = "C:\\Program Files\\Axiom\\Axiom.exe";
const electron = "C:\\git\\axiom\\node_modules\\electron\\dist\\electron.exe";
const workspace = "C:\\work\\Ontology.axiom";

it("reads the file a packaged build receives", () => {
  expect(launchPath([exe, workspace])).toBe(workspace);
});
it("skips the application directory a development run carries", () => {
  expect(launchPath([electron, ".", workspace])).toBe(workspace);
});
it("ignores Chromium switches wherever they appear", () => {
  expect(launchPath([exe, "--allow-file-access-from-files", workspace])).toBe(
    workspace,
  );
  expect(launchPath([electron, "--inspect", ".", workspace])).toBe(workspace);
});
it("ignores the value a switch carries as its own argument", () => {
  // A handover from a second launch arrives with --source-app-id and its value.
  expect(
    launchPath([
      exe,
      "--secure-schemes=app",
      "--source-app-id",
      ".",
      workspace,
    ]),
  ).toBe(workspace);
  expect(launchPath([exe, "--source-app-id", "com.craigtrim.axiom"])).toBe(
    undefined,
  );
});
it("accepts the ontology files File > Open accepts", () => {
  for (const extension of [
    "ttl",
    "rdf",
    "owl",
    "xml",
    "nt",
    "nq",
    "trig",
    "jsonld",
  ])
    expect(launchPath([exe, "C:\\work\\Pizza." + extension])).toBe(
      "C:\\work\\Pizza." + extension,
    );
});
it("matches an extension in any case", () => {
  expect(launchPath([exe, "C:\\work\\Ontology.AXIOM"])).toBe(
    "C:\\work\\Ontology.AXIOM",
  );
});
it("returns nothing when no openable file was supplied", () => {
  expect(launchPath([exe])).toBeUndefined();
  expect(launchPath([electron, "."])).toBeUndefined();
  expect(launchPath([exe, "C:\\work\\notes.txt"])).toBeUndefined();
  expect(launchPath([exe, "--enable-logging"])).toBeUndefined();
});
it("takes only the first path when several are supplied", () => {
  expect(launchPath([exe, workspace, "C:\\work\\Second.axiom"])).toBe(
    workspace,
  );
});
it("keeps a path that contains spaces intact", () => {
  const spaced = "C:\\My Work\\Pizza Ontology.axiom";
  expect(launchPath([exe, spaced])).toBe(spaced);
});
it("keeps a relative path for the caller to resolve", () => {
  expect(launchPath([exe, "Ontology.axiom"])).toBe("Ontology.axiom");
});
