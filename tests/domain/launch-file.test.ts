// craigtrim/axiom#1
import { expect, it } from "vitest";
import { launchCandidates } from "../../src/shared/launch-file";
const exe = "C:\\Program Files\\Axiom\\Axiom.exe";
const electron = "C:\\git\\axiom\\node_modules\\electron\\dist\\electron.exe";
const workspace = "C:\\work\\Ontology.axiom";

it("reads the file a packaged build receives", () => {
  expect(launchCandidates([exe, workspace])).toEqual([workspace]);
});
it("skips the application directory a development run carries", () => {
  expect(launchCandidates([electron, ".", workspace])).toEqual([workspace]);
});
it("ignores Chromium switches wherever they appear", () => {
  // These are the switches a real handover carries, in the order Electron sends them.
  expect(
    launchCandidates([
      exe,
      "--allow-file-access-from-files",
      "--secure-schemes=app",
      "--source-app-id",
      workspace,
    ]),
  ).toEqual([workspace]);
  expect(launchCandidates([electron, "--inspect", ".", workspace])).toEqual([
    workspace,
  ]);
});
it("keeps an application id ahead of the file so the caller can tell them apart", () => {
  // Where a build gives --source-app-id a value of its own, that value ends in
  // ".axiom" too. Both are returned in order, and only the file exists on disk.
  expect(
    launchCandidates([
      exe,
      "--source-app-id",
      "com.craigtrim.axiom",
      workspace,
    ]),
  ).toEqual(["com.craigtrim.axiom", workspace]);
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
    expect(launchCandidates([exe, "C:\\work\\Pizza." + extension])).toEqual([
      "C:\\work\\Pizza." + extension,
    ]);
});
it("matches an extension in any case", () => {
  expect(launchCandidates([exe, "C:\\work\\Ontology.AXIOM"])).toEqual([
    "C:\\work\\Ontology.AXIOM",
  ]);
});
it("returns nothing when no openable file was supplied", () => {
  expect(launchCandidates([exe])).toEqual([]);
  expect(launchCandidates([electron, "."])).toEqual([]);
  expect(launchCandidates([exe, "C:\\work\\notes.txt"])).toEqual([]);
  expect(launchCandidates([exe, "--enable-logging"])).toEqual([]);
});
it("keeps a path that contains spaces intact", () => {
  const spaced = "C:\\My Work\\Pizza Ontology.axiom";
  expect(launchCandidates([exe, spaced])).toEqual([spaced]);
});
it("keeps a relative path for the caller to resolve", () => {
  expect(launchCandidates([exe, "Ontology.axiom"])).toEqual(["Ontology.axiom"]);
});
