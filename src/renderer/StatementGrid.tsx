import { PredicateSelect, usePredicateOptions } from "./PredicateSelect";
import { useSnapshot, savePanel } from "./client";
import { displayName, LABEL, COMMENT } from "../domain/rdf-model";
import {
  NS,
  TYPE,
  SUBCLASS,
  type Triple,
  type OntologyInfo,
} from "../domain/model";
import { editEntity } from "./authoring";
import { ResourceInput } from "./ResourceInput";
import { compactIri, entityNamespace } from "../shared/terms";
export { compactIri, expandIri, entityNamespace } from "../shared/terms";
export function StatementGrid({
  triples,
  ontology,
  replace,
  commit,
  classEntity,
  parentExpressions = {},
}: {
  triples: Triple[];
  ontology: OntologyInfo;
  replace(triples: Triple[]): void;
  commit(): void;
  classEntity: boolean;
  parentExpressions?: Record<string, string[]>;
}) {
  const snapshot = useSnapshot()!;
  const predicates = usePredicateOptions(triples.map((t) => t.predicate));
  const entities = new Map(snapshot.entities.map((e) => [e.iri, e]));
  const namespace = entityNamespace(
    triples[0]?.subject ?? "",
    ontology.namespace,
  );
  const declaration = (t: Triple) =>
    classEntity &&
    t.predicate === TYPE &&
    !t.object.literal &&
    t.object.value === NS.owl + "Class";
  const rows = triples
    .flatMap<{ t: Triple; index: number; member: number; members?: string[] }>(
      (t, index) => {
        const members =
          t.predicate === SUBCLASS && !t.object.literal
            ? parentExpressions[t.object.value]
            : undefined;
        return members
          ? members.map((value, member) => ({
              t: { ...t, object: { ...t.object, value } },
              index,
              member,
              members,
            }))
          : [{ t, index, member: -1, members: undefined }];
      },
    )
    .sort((a, b) => Number(declaration(b.t)) - Number(declaration(a.t)));
  const update = (
    index: number,
    member: number,
    members: string[] | undefined,
    replacement?: Triple,
  ) => {
    const next = triples.flatMap((t, i) => {
      if (i !== index) return [t];
      if (!members) return replacement ? [replacement] : [];
      return members.flatMap((value, j) =>
        j === member
          ? replacement
            ? [replacement]
            : []
          : [{ ...t, object: { ...t.object, value } }],
      );
    });
    replace(next);
  };
  const open = (iri: string) => {
    savePanel("details.source.open", true, false);
    editEntity(iri);
  };
  const expression = (iri: string) => {
    const e = entities.get(iri);
    if (!e?.intersection)
      return iri.startsWith("_:") ? "Class expression" : undefined;
    if (e.intersection.issue) return "Expression: check source";
    return (
      "All of: " +
      e.intersection.members
        .map((m) =>
          entities.has(m)
            ? displayName(entities.get(m)!)
            : compactIri(m, namespace),
        )
        .join(", ")
    );
  };
  return (
    <table className="statement-grid" aria-label="Entity statements">
      <colgroup>
        <col className="statement-predicate-column" />
        <col />
      </colgroup>
      <thead>
        <tr>
          <th>Predicate</th>
          <th>Value</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ t, index, member, members }, position) => {
          const locked = declaration(t),
            number = position + 1;
          const change = (next: Triple, save = true) => {
            update(index, member, members, next);
            if (save) commit();
          };
          const label =
            t.predicate === LABEL &&
            !rows.slice(0, position).some((r) => r.t.predicate === LABEL)
              ? "Entity label"
              : t.predicate === COMMENT &&
                  !rows
                    .slice(0, position)
                    .some((r) => r.t.predicate === COMMENT)
                ? "Entity comment"
                : "Value " + number;
          const expr = !t.object.literal && expression(t.object.value);
          return (
            <tr
              key={index + ":" + member}
              data-predicate={t.predicate}
              data-readonly={locked || undefined}
            >
              <td>
                {locked ? (
                  <span className="statement-fixed" title="Class declaration">
                    rdf:type
                  </span>
                ) : (
                  <PredicateSelect
                    label={"Predicate " + number}
                    value={t.predicate}
                    options={predicates}
                    namespace={namespace}
                    change={(predicate) => {
                      const resource =
                        [
                          TYPE,
                          SUBCLASS,
                          NS.rdfs + "seeAlso",
                          NS.rdfs + "isDefinedBy",
                          NS.rdfs + "domain",
                          NS.rdfs + "range",
                          NS.owl + "equivalentClass",
                          NS.owl + "disjointWith",
                          NS.owl + "inverseOf",
                        ].includes(predicate) ||
                        entities.get(predicate)?.kind === "ObjectProperty";
                      change({
                        ...t,
                        predicate,
                        ...(!t.object.value
                          ? { object: { ...t.object, literal: !resource } }
                          : {}),
                      });
                    }}
                  />
                )}
              </td>
              <td>
                <div className="statement-value-cell">
                  {locked ? (
                    <span
                      className="statement-fixed"
                      title="This entity is an ontology class"
                    >
                      owl:Class
                    </span>
                  ) : t.object.literal ? (
                    <textarea
                      aria-label={label}
                      title={t.object.value}
                      rows={1}
                      spellCheck={false}
                      value={t.object.value}
                      onBlur={commit}
                      onKeyDown={(e) => {
                        if (
                          e.key === "Enter" &&
                          !e.shiftKey &&
                          !e.nativeEvent.isComposing
                        ) {
                          e.preventDefault();
                          e.currentTarget.blur();
                        }
                      }}
                      onChange={(e) =>
                        change(
                          {
                            ...t,
                            object: { ...t.object, value: e.target.value },
                          },
                          false,
                        )
                      }
                    />
                  ) : expr ? (
                    <span
                      className="statement-expression"
                      title={t.object.value}
                    >
                      {expr}
                    </span>
                  ) : (
                    <ResourceInput
                      value={t.object.value}
                      namespace={namespace}
                      label={label}
                      classesOnly={classEntity && t.predicate === SUBCLASS}
                      exclude={
                        classEntity && t.predicate === SUBCLASS
                          ? [t.subject]
                          : []
                      }
                      change={(value) =>
                        change({ ...t, object: { ...t.object, value } })
                      }
                    />
                  )}
                  {!locked && !t.object.literal && (
                    <button
                      className="statement-reference"
                      aria-label={"Open details for value " + number}
                      title="Details and source"
                      disabled={!t.object.value}
                      onClick={() => open(t.object.value)}
                    >
                      ⋯
                    </button>
                  )}
                  {!locked && (
                    <button
                      className="statement-remove"
                      aria-label={"Remove statement " + number}
                      title="Remove statement"
                      onClick={() => {
                        update(index, member, members);
                        commit();
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
