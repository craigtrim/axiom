import type { Triple } from "../domain/model";
import { statementKey } from "../domain/rdf-model";
import { writeTurtleSnippet } from "../domain/turtle-snippet";

interface Subject {
  statements: Triple[];
  key: string;
  blankNodes: boolean;
}
export type AnalysisSubjects = Map<string, Subject>;

// craigtrim/axiom#137: compare complete subjects from the exact context export.
export function analysisSubjects(
  statements?: Triple[],
): AnalysisSubjects | undefined {
  if (!statements) return undefined;
  const subjects: AnalysisSubjects = new Map();
  for (const statement of statements) {
    let subject = subjects.get(statement.subject);
    if (!subject) {
      subject = {
        statements: [],
        key: "",
        blankNodes: statement.subject.startsWith("_:"),
      };
      subjects.set(statement.subject, subject);
    }
    subject.statements.push(statement);
    subject.key += statementKey(statement) + "\n";
    subject.blankNodes ||=
      !statement.object.literal && statement.object.value.startsWith("_:");
  }
  return subjects;
}

export async function textAnalysisUpdate(
  previous: AnalysisSubjects,
  next: AnalysisSubjects,
) {
  const changed = [...new Set([...previous.keys(), ...next.keys()])].filter(
    (iri) => previous.get(iri)?.key !== next.get(iri)?.key,
  );
  if (
    changed.some(
      (iri) => previous.get(iri)?.blankNodes || next.get(iri)?.blankNodes,
    )
  )
    return undefined;
  const replace: Record<string, string> = {};
  const remove: string[] = [];
  for (const iri of changed) {
    const subject = next.get(iri);
    if (subject) {
      // Absolute IRIs make fragments independent of the loaded prefix table.
      replace[iri] = await writeTurtleSnippet(
        subject.statements,
        {},
        "",
        new Set(),
        "turtle",
      );
    } else remove.push(iri);
  }
  return { op: "update", replace, remove };
}
