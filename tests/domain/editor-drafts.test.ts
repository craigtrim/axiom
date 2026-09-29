import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { NS, TYPE, type Triple } from "../../src/domain/model";
import type { DocumentData, EditorDraft } from "../../src/shared/editor-state";
const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  onCommand: vi.fn(),
  report: vi.fn(),
}));
vi.mock("../../src/renderer/client", () => ({ ...mocks, state: undefined }));
import {
  syncEditorEpoch,
  rememberEditorDraft,
  getEditorDraft,
  applyEditorDraft,
  editorDraftSnapshot,
} from "../../src/renderer/editor-drafts";
const iri = "urn:MilitaryEngineering";
const parent = (value: string): Triple => ({
  subject: iri,
  predicate: NS.rdfs + "subClassOf",
  object: { literal: false, value },
});
const note = (value: string): Triple => ({
  subject: iri,
  predicate: NS.rdfs + "comment",
  object: { literal: true, value },
});
let epoch = 0;
function document(statements: Triple[]): DocumentData {
  return {
    entity: {
      iri,
      kind: "Class",
      label: "Military Engineering",
    } as DocumentData["entity"],
    statements,
    version: 1,
    datasetEpoch: epoch,
  };
}
function draft(base: Triple[], statements: Triple[]): EditorDraft {
  return { iri, nextIri: iri, loaded: document(base), statements };
}
function deferred<T>() {
  let resolve!: (v: T) => void, reject!: (e: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
beforeEach(() => {
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), {
      axiom: { editors: { dirty: vi.fn(), flushed: vi.fn() } },
    }),
  );
  epoch++;
  syncEditorEpoch(epoch);
  mocks.request.mockReset();
});
afterEach(() => vi.unstubAllGlobals());
describe("retained editor drafts during asynchronous saves", () => {
  it("sends the original statements to the worker for an atomic merge", async () => {
    const d = draft(
      [parent("urn:Science")],
      [parent("urn:Science"), parent("urn:Engineering")],
    );
    rememberEditorDraft(d);
    mocks.request.mockResolvedValue({ iri, document: document(d.statements) });
    await applyEditorDraft(d);
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(mocks.request).toHaveBeenCalledWith(
      "updateEntity",
      expect.objectContaining({
        original: d.loaded.statements,
        statements: d.statements,
        datasetEpoch: epoch,
        returnDocument: true,
      }),
    );
    expect(editorDraftSnapshot()).toEqual([]);
  });
  it("rebases typing during a save without dropping a concurrently added parent", async () => {
    const d = draft(
      [parent("urn:Science"), note("Before")],
      [parent("urn:Science"), note("First edit")],
    );
    rememberEditorDraft(d);
    const reply = deferred<{ iri: string; document: DocumentData }>();
    mocks.request.mockReturnValue(reply.promise);
    const saving = applyEditorDraft(d);
    await Promise.resolve();
    const typed = {
      ...d,
      statements: [parent("urn:Science"), note("More typing")],
    };
    rememberEditorDraft(typed);
    const saved = document([
      parent("urn:Science"),
      note("First edit"),
      parent("urn:Engineering"),
    ]);
    reply.resolve({ iri, document: saved });
    await saving;
    const pending = getEditorDraft(iri, epoch)!;
    expect(pending.loaded).toEqual(saved);
    expect(pending.statements).toEqual(
      expect.arrayContaining([note("More typing"), parent("urn:Engineering")]),
    );
    mocks.request.mockResolvedValue({
      iri,
      document: document(pending.statements),
    });
    await applyEditorDraft(pending);
    expect(editorDraftSnapshot()).toEqual([]);
  });
  it("retains the original draft when a real contradiction rejects the save", async () => {
    const d = draft([note("Before")], [note("Local")]);
    rememberEditorDraft(d);
    mocks.request.mockRejectedValue(Error("Conflicting comment"));
    await expect(applyEditorDraft(d)).rejects.toThrow("Conflicting comment");
    expect(getEditorDraft(iri, epoch)).toEqual(d);
  });
  it("does not bring old drafts into a newly opened ontology", async () => {
    const d = draft([note("Before")], [note("Local")]);
    rememberEditorDraft(d);
    const reply = deferred<{ iri: string; document: DocumentData }>();
    mocks.request.mockReturnValue(reply.promise);
    const saving = applyEditorDraft(d);
    await Promise.resolve();
    const saved = document(d.statements);
    syncEditorEpoch(++epoch);
    reply.resolve({ iri, document: saved });
    await saving;
    expect(editorDraftSnapshot()).toEqual([]);
  });
  it("retargets edits made during an automatic identifier rename", async () => {
    const declaration: Triple = {
      subject: iri,
      predicate: TYPE,
      object: { literal: false, value: NS.owl + "Class" },
    };
    const d = draft(
      [declaration, note("Before")],
      [declaration, note("First")],
    );
    rememberEditorDraft(d);
    const reply = deferred<{ iri: string; document: DocumentData }>();
    mocks.request.mockReturnValue(reply.promise);
    const saving = applyEditorDraft(d);
    await Promise.resolve();
    rememberEditorDraft({
      ...d,
      statements: [declaration, note("More typing")],
    });
    const next = "urn:Engineering";
    reply.resolve({
      iri: next,
      document: {
        ...document(d.statements.map((t) => ({ ...t, subject: next }))),
        entity: { ...d.loaded.entity, iri: next },
      },
    });
    await saving;
    expect(getEditorDraft(iri, epoch)).toBeUndefined();
    const pending = getEditorDraft(next, epoch)!;
    expect(pending.nextIri).toBe(next);
    expect(pending.statements.every((t) => t.subject === next)).toBe(true);
    expect(
      pending.statements.some((t) => t.object.value === "More typing"),
    ).toBe(true);
  });
  it("keeps in-flight keystrokes even when rebasing finds another conflicting change", async () => {
    const d = draft([note("Before")], [note("Saved")]);
    rememberEditorDraft(d);
    const reply = deferred<{ iri: string; document: DocumentData }>();
    mocks.request.mockReturnValue(reply.promise);
    const saving = applyEditorDraft(d);
    await Promise.resolve();
    rememberEditorDraft({ ...d, statements: [note("Typing")] });
    reply.resolve({ iri, document: document([note("Changed elsewhere")]) });
    await expect(saving).rejects.toThrow("changed");
    expect(getEditorDraft(iri, epoch)?.statements).toEqual([note("Typing")]);
  });
});

it("retains unresolved parent text as a draft until an entity is chosen", async () => {
  const unresolved = {
    ...parent("Engineering"),
    object: { literal: true, value: "Engineering" },
  };
  const d = draft([parent("urn:Science")], [parent("urn:Science"), unresolved]);
  rememberEditorDraft(d);
  await expect(applyEditorDraft(d)).rejects.toThrow(
    "matching entity or an IRI",
  );
  expect(mocks.request).not.toHaveBeenCalled();
  expect(getEditorDraft(iri, epoch)?.statements).toContainEqual(unresolved);
});

it("saves a synonym while keeping the unused Add row out of RDF", async () => {
  const synonym = (value: string): Triple => ({
    subject: iri,
    predicate: NS.rdfs + "seeAlso",
    object: { literal: true, value },
  });
  const blank: Triple = {
    subject: iri,
    predicate: "",
    object: { literal: true, value: "" },
  };
  const base = [parent("urn:Science"), synonym("")];
  const statements = [parent("urn:Science"), synonym("phleb")];
  const d = draft(base, [...statements, blank]);
  rememberEditorDraft(d);
  mocks.request.mockResolvedValue({ iri, document: document(statements) });
  await applyEditorDraft(d, true);
  expect(mocks.request).toHaveBeenCalledWith(
    "updateEntity",
    expect.objectContaining({ statements, original: base }),
  );
  const pending = getEditorDraft(iri, epoch)!;
  expect(pending.statements).toEqual([...statements, blank]);
  expect(pending.loaded.statements).toEqual(statements);
  await applyEditorDraft(pending, true);
  expect(mocks.request).toHaveBeenCalledTimes(1);
  expect(getEditorDraft(iri, epoch)?.statements).toContainEqual(blank);
  // Explicit Save clears the unused row without creating another Undo step.
  await applyEditorDraft(pending);
  expect(mocks.request).toHaveBeenCalledTimes(1);
  expect(editorDraftSnapshot()).toEqual([]);
});

it("File Save applies a restored synonym draft with a blank row and finishes once", async () => {
  const synonym: Triple = {
    subject: iri,
    predicate: NS.rdfs + "seeAlso",
    object: { literal: true, value: "phleb" },
  };
  const blank: Triple = {
    subject: iri,
    predicate: "",
    object: { literal: true, value: "" },
  };
  const statements = [parent("urn:Science"), synonym];
  rememberEditorDraft(draft([parent("urn:Science")], [...statements, blank]));
  mocks.request.mockResolvedValue({ iri, document: document(statements) });
  mocks.onCommand.mock.calls[0][0]("editors.flushGrid");
  await vi.waitFor(() =>
    expect(window.axiom.editors.flushed).toHaveBeenCalledWith(),
  );
  expect(mocks.request).toHaveBeenCalledTimes(1);
  expect(mocks.request).toHaveBeenCalledWith(
    "updateEntity",
    expect.objectContaining({ statements }),
  );
  expect(editorDraftSnapshot()).toEqual([]);
});
