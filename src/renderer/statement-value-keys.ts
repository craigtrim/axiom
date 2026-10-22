import type { Triple } from "../domain/model";

// Issue 158: fields follow statements through deletion, and keep focus while edited.
const signature = (t: Triple) =>
  JSON.stringify([
    t.subject,
    t.predicate,
    t.object.literal,
    t.object.value,
    t.object.language,
    t.object.datatype,
    t.graph,
  ]);

export class StatementValueKeys {
  private next = 0;
  private values: { signature: string; key: number }[] = [];

  reconcile(triples: Triple[]): number[] {
    const available = new Map<string, number[]>();
    for (const value of this.values) {
      const keys = available.get(value.signature) ?? [];
      keys.push(value.key);
      available.set(value.signature, keys);
    }
    this.values = triples.map((t) => {
      const value = signature(t);
      return {
        signature: value,
        key: available.get(value)?.shift() ?? this.next++,
      };
    });
    return this.values.map((v) => v.key);
  }

  replace(key: number, triple?: Triple) {
    if (!triple) this.values = this.values.filter((v) => v.key !== key);
    else {
      const value = this.values.find((v) => v.key === key);
      if (value) value.signature = signature(triple);
    }
  }
}
