import { resourcePredicate as requiresResource } from "../shared/statement-values";
import { useLayoutEffect, useRef } from "react";
import {
  PredicateSelect,
  usePredicateOptions,
  rememberPredicate,
} from "./PredicateSelect";
import { useSnapshot } from "./client";
import { displayName, LABEL, COMMENT } from "../domain/rdf-model";
import {
  NS,
  TYPE,
  SUBCLASS,
  type Triple,
  type OntologyInfo,
} from "../domain/model";
import { ResourceInput } from "./ResourceInput";
import { compactIri, entityNamespace } from "../shared/terms";
import { groupStatements } from "./statement-groups";
import { StatementGroupRow } from "./StatementGroupRow";
export { compactIri, expandIri, entityNamespace } from "../shared/terms";
export function StatementGrid({
  subject,
  triples,
  ontology,
  replace,
  commit,
  classEntity,
  parentExpressions = {},
}: {
  subject: string;
  triples: Triple[];
  ontology: OntologyInfo;
  replace(triples: Triple[]): void;
  commit(): void;
  classEntity: boolean;
  parentExpressions?: Record<string, string[]>;
}) {
  const table = useRef<HTMLTableElement>(null);
  const pendingFocus = useRef(false);
  const focusPredicate = () =>
    table.current
      ?.querySelector<HTMLSelectElement>('tr[data-predicate=""] select')
      ?.focus();
  useLayoutEffect(() => {
    if (pendingFocus.current) {
      focusPredicate();
      pendingFocus.current = false;
    }
  }, [triples]);
  const addRow = () => {
    const blank = triples.findIndex((t) => !t.predicate);
    if (blank >= 0) {
      focusPredicate();
      return;
    }
    pendingFocus.current = true;
    replace([
      ...triples,
      { subject, predicate: "", object: { literal: true, value: "" } },
    ]);
  };
  const snapshot = useSnapshot()!;
  const predicates = usePredicateOptions(triples.map((t) => t.predicate));
  const entities = new Map(snapshot.entities.map((e) => [e.iri, e]));
  const namespace = entityNamespace(subject, ontology.namespace);
  const resourcePredicate = (predicate: string) =>
    requiresResource(predicate, entities.get(predicate)?.kind);
  const declaration = (t: Triple) =>
    classEntity &&
    t.predicate === TYPE &&
    !t.object.literal &&
    t.object.value === NS.owl + "Class";
  const rows = triples.flatMap<{
    t: Triple;
    index: number;
    member: number;
    members?: string[];
  }>((t, index) => {
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
  });
  const groups = groupStatements(
    rows.map((value, position) => ({
      predicate: value.t.predicate,
      value: { ...value, number: position + 1 },
    })),
  ).sort(
    (a, b) =>
      Number(b.values.some((v) => declaration(v.t))) -
      Number(a.values.some((v) => declaration(v.t))),
  );
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
    <table
      ref={table}
      className="statement-grid"
      aria-label="Entity statements"
    >
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
        {groups.map((group) => {
          const fixed = group.predicate === TYPE;
          const single = [LABEL, COMMENT, TYPE].includes(group.predicate);
          const name = compactIri(group.predicate, namespace);
          return (
            <StatementGroupRow
              key={group.predicate}
              group={group}
              name={name}
              valueKey={(v) => v.index + ":" + v.member}
              removable={(v) => !declaration(v.t)}
              remove={({ index, member, members }) => {
                update(index, member, members);
                commit();
              }}
              add={
                !single && group.predicate
                  ? () => {
                      const last = group.values.at(-1)!.index;
                      replace([
                        ...triples.slice(0, last + 1),
                        {
                          subject,
                          predicate: group.predicate,
                          object: {
                            literal: !resourcePredicate(group.predicate),
                            value: "",
                          },
                        },
                        ...triples.slice(last + 1),
                      ]);
                    }
                  : undefined
              }
              predicate={
                fixed ? (
                  <span className="statement-fixed">{name}</span>
                ) : (
                  <PredicateSelect
                    label={"Predicate " + group.values[0].number}
                    value={group.predicate}
                    options={predicates.filter(
                      (p) =>
                        p === group.predicate ||
                        ((!group.predicate
                          ? !groups.some((g) => g.predicate === p)
                          : true) &&
                          (![LABEL, COMMENT].includes(p) ||
                            (group.values.length === 1 &&
                              !groups.some((g) => g.predicate === p)))),
                    )}
                    namespace={namespace}
                    change={(predicate) => {
                      rememberPredicate(predicate, snapshot.datasetEpoch);
                      const resource = resourcePredicate(predicate);
                      const previous = triples.find(
                        (t) => t.predicate === predicate,
                      );
                      replace(
                        triples.map((t) =>
                          t.predicate !== group.predicate
                            ? t
                            : {
                                ...t,
                                predicate,
                                ...(!t.object.value
                                  ? {
                                      object: {
                                        ...t.object,
                                        literal: resource
                                          ? false
                                          : (previous?.object.literal ?? true),
                                      },
                                    }
                                  : {}),
                              },
                        ),
                      );
                      if (
                        !group.values.some(
                          ({ t }) =>
                            resource && t.object.literal && t.object.value,
                        )
                      )
                        commit();
                    }}
                  />
                )
              }
              renderValue={(
                { t, index, member, members, number },
                position,
              ) => {
                const locked = declaration(t);
                const change = (next: Triple, save = true) => {
                  update(index, member, members, next);
                  if (save) commit();
                };
                const label =
                  t.predicate === LABEL && position === 0
                    ? "Entity label"
                    : t.predicate === COMMENT && position === 0
                      ? "Entity comment"
                      : "Value " + number;
                const expr = !t.object.literal && expression(t.object.value);
                return (
                  <div className="statement-value-cell">
                    {locked ? (
                      <span
                        className="statement-fixed"
                        title="This entity is an ontology class"
                      >
                        owl:Class
                      </span>
                    ) : !resourcePredicate(t.predicate) &&
                      ([NS.rdfs + "seeAlso", NS.rdfs + "isDefinedBy"].includes(
                        t.predicate,
                      ) ||
                        entities.get(t.predicate)?.kind ===
                          "AnnotationProperty") ? (
                      <ResourceInput
                        value={t.object.value}
                        textValue={t.object.literal}
                        namespace={namespace}
                        label={label}
                        useText={(value) =>
                          change({
                            ...t,
                            object: t.object.literal
                              ? { ...t.object, value }
                              : { literal: true, value },
                          })
                        }
                        change={(value) =>
                          change({ ...t, object: { literal: false, value } })
                        }
                      />
                    ) : t.object.literal && !resourcePredicate(t.predicate) ? (
                      <input
                        type="text"
                        aria-label={label}
                        title={t.object.value}
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
                        textValue={t.object.literal}
                        classesOnly={classEntity && t.predicate === SUBCLASS}
                        exclude={
                          classEntity && t.predicate === SUBCLASS
                            ? [t.subject]
                            : []
                        }
                        change={(value) =>
                          change({ ...t, object: { literal: false, value } })
                        }
                      />
                    )}
                    {/* craigtrim/axiom#37: no per-value open button; Ancestry and Source cover navigation. */}
                  </div>
                );
              }}
            />
          );
        })}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={2}>
            <button className="statement-add-row" onClick={addRow}>
              + Add row
            </button>
          </td>
        </tr>
      </tfoot>
    </table>
  );
}
