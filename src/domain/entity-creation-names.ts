import { entityAmpersandSynonym } from "../shared/entity-names";
import { NS, type Triple } from "./model";

// Issue 157: one generated string synonym, including when it was entered by hand.
export function nameSynonymStatements(
  subject: string,
  name: string,
  statements: Pick<Triple, "predicate" | "object">[] = [],
): Triple[] {
  const value = entityAmpersandSynonym(name);
  const predicate = NS.rdfs + "seeAlso";
  if (
    !value ||
    statements.some(
      (t) =>
        t.predicate === predicate &&
        t.object.literal &&
        t.object.value === value &&
        !t.object.language &&
        (!t.object.datatype ||
          t.object.datatype === "string" ||
          t.object.datatype === NS.xsd + "string"),
    )
  )
    return [];
  return [
    {
      subject,
      predicate,
      object: { literal: true, value, datatype: NS.xsd + "string" },
    },
  ];
}
