import { describe, expect, it } from "vitest";
import type { Triple } from "../../src/domain/model";
import { StatementValueKeys } from "../../src/renderer/statement-value-keys";

const triple = (value: string): Triple => ({
  subject: "urn:subject",
  predicate: "urn:predicate",
  object: { literal: true, value },
});

// Issue 158: distinguish duplicate blanks without tying surviving editors to positions.
describe("statement field identity", () => {
  it("keeps the second field through first-value removal and a document reload", () => {
    const keys = new StatementValueKeys();
    const initial = keys.reconcile([triple("first"), triple("second")]);
    keys.replace(initial[0]);
    expect(keys.reconcile([triple("second")])).toEqual([initial[1]]);
  });
  it("keeps the edited field mounted while text changes", () => {
    const keys = new StatementValueKeys();
    const initial = keys.reconcile([triple("old"), triple("other")]);
    keys.replace(initial[0], triple("new"));
    expect(keys.reconcile([triple("new"), triple("other")])).toEqual(initial);
  });
  it("gives identical blank fields separate keys and removes only the selected one", () => {
    const keys = new StatementValueKeys();
    const initial = keys.reconcile([triple(""), triple(""), triple("")]);
    expect(new Set(initial).size).toBe(3);
    keys.replace(initial[0]);
    expect(keys.reconcile([triple(""), triple("")])).toEqual(initial.slice(1));
  });
});
