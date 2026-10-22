import { resourcePredicate as requiresResource } from "../shared/statement-values";
import { useLayoutEffect, useRef, useState } from "react";
import {
  PredicateSelect,
  usePredicateOptions,
  rememberPredicate,
} from "./PredicateSelect";
import { useSnapshot } from "./client";
import { displayName } from "../domain/rdf-model";
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
import { StatementValueKeys } from "./statement-value-keys";
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
  // Issue 158: remove the clicked field without reusing it for its neighbour.
  const valueKeys = useRef(new StatementValueKeys());
  const pendingFocus = useRef(false);
  const [announcement, announce] = useState("");
  const focusPredicate = () =>
    table.current
      ?.querySelector<HTMLSelectElement>('tr[data-predicate=""] select')
      ?.focus();
  useLayoutEffect(() => {
    if (pendingFocus.current) {
      focusPredicate();
      pendingFocus.current = false;
    } else if (!triples.some((t) => !t.predicate)) {
      announce("");
    }
  }, [triples]);
  const addRow = () => {
    const blank = triples.findIndex((t) => !t.predicate);
    if (blank >= 0) {
      focusPredicate();
      return;
    }
    pendingFocus.current = true;
    announce("Row added. Choose its predicate with the chevron.");
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
  const keys = valueKeys.current.reconcile(rows.map((row) => row.t));
  const groups = groupStatements(
    rows.map((value, i) => ({
      predicate: value.t.predicate,
      value: { ...value, key: keys[i] },
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
    const row = rows.findIndex((v) => v.index === index && v.member === member);
    valueKeys.current.replace(keys[row], replacement);
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
    <>
      <span className="vh" aria-live="polite" aria-atomic="true">
        {announcement}
      </span>
      <table
        ref={table}
        className="statement-grid st"
        aria-label="Entity statements"
      >
        <colgroup>
          <col className="statement-predicate-column c-pred" />
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
            const name = compactIri(group.predicate, namespace);
            return (
              <StatementGroupRow
                details
                key={group.predicate}
                group={group}
                name={name}
                valueKey={(v) => v.key}
                removable={(v) => !declaration(v.t)}
                remove={({ index, member, members }) => {
                  update(index, member, members);
                  commit();
                }}
                add={
                  !fixed && group.predicate
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
                predicate={(hidden) =>
                  fixed ? (
                    <>
                      <span className="statement-fixed">{name}</span>
                      {hidden > 0 && (
                        <span className="statement-value-count">
                          {group.values.length}
                        </span>
                      )}
                    </>
                  ) : (
                    <PredicateSelect
                      quiet
                      count={hidden > 0 ? group.values.length : undefined}
                      label={
                        group.predicate
                          ? "Change the predicate on " + name
                          : "Choose predicate"
                      }
                      value={group.predicate}
                      options={predicates.filter(
                        (p) =>
                          p === group.predicate ||
                          !!group.predicate ||
                          !groups.some((g) => g.predicate === p),
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
                                            : (previous?.object.literal ??
                                              true),
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
                renderValue={({ t, index, member, members }, position) => {
                  const locked = declaration(t);
                  const change = (next: Triple, save = true) => {
                    update(index, member, members, next);
                    if (save) commit();
                  };
                  // Issue 85: number values within their predicate, including labels and comments.
                  const label =
                    (group.predicate ? name : "New statement") +
                    " value " +
                    (position + 1);
                  const expr = !t.object.literal && expression(t.object.value);
                  return (
                    <div className="statement-value-cell">
                      {locked ? (
                        <input
                          className="val"
                          readOnly
                          value="owl:Class"
                          aria-label={label}
                          title="This entity is an ontology class"
                        />
                      ) : !resourcePredicate(t.predicate) &&
                        ([
                          NS.rdfs + "seeAlso",
                          NS.rdfs + "isDefinedBy",
                        ].includes(t.predicate) ||
                          entities.get(t.predicate)?.kind ===
                            "AnnotationProperty") ? (
                        <ResourceInput
                          value={t.object.value}
                          textValue={t.object.literal}
                          seeAlsoSubject={
                            t.predicate === NS.rdfs + "seeAlso"
                              ? subject
                              : undefined
                          }
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
                      ) : t.object.literal &&
                        !resourcePredicate(t.predicate) ? (
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
                          // craigtrim/axiom#72: Details can create a missing named parent under owl:Thing.
                          createMissingClass={
                            classEntity && t.predicate === SUBCLASS
                          }
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
      </table>
      <div className="addrow">
        <button
          className="statement-add-row lnk"
          onMouseDown={(event) => {
            // Issue 85: collapsing a focused tools line must not move this
            // button between the pointer press and its click.
            if (event.button === 0) event.preventDefault();
          }}
          onClick={(event) => {
            event.currentTarget.focus();
            addRow();
          }}
        >
          + Add row
        </button>
      </div>
    </>
  );
}
