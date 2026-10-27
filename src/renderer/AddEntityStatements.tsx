// Issue 164 groups the existing flat draft without changing its RDF terms or order.
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { NS, shorten } from "../domain/model";
import { addEntityPredicates, type AddEntityNode } from "../shared/add-entity";
import { groupStatements } from "./statement-groups";
import { StatementGroupRow } from "./StatementGroupRow";

type Statements = NonNullable<AddEntityNode["statements"]>;

export function AddEntityStatements({
  statements,
  change,
  removeIcon,
}: {
  statements: Statements;
  change(statements: Statements): void;
  removeIcon: ReactNode;
}) {
  const container = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<{ predicate?: string; select?: boolean } | null>(
    null,
  );
  const groups = groupStatements(
    statements.map((statement, index) => ({
      predicate: statement.predicate,
      value: { ...statement, index },
    })),
  );
  const unused = addEntityPredicates.filter(
    (predicate) => !groups.some((group) => group.predicate === predicate),
  );
  const nextPredicate = unused.includes(NS.rdfs + "seeAlso")
    ? NS.rdfs + "seeAlso"
    : unused[0];
  useLayoutEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    const group = Array.from(
      container.current?.querySelectorAll<HTMLElement>(
        ".statement-group-row",
      ) ?? [],
    ).find((row) => row.dataset.predicate === target.predicate);
    const field = group?.querySelector<HTMLElement>(
      target.select ? "select" : "input",
    );
    (
      field ?? container.current?.querySelector<HTMLElement>(".add-statement")
    )?.focus();
    pendingFocus.current = null;
  }, [statements]);
  return (
    <div ref={container}>
      {groups.map((group, groupIndex) => (
        <StatementGroupRow
          form
          key={group.predicate}
          group={group}
          name={shorten(group.predicate)}
          removeIcon={removeIcon}
          valueKey={(value) => value.index}
          add={() => {
            const after = group.values.at(-1)!.index + 1;
            change([
              ...statements.slice(0, after),
              {
                predicate: group.predicate,
                object: { literal: true, value: "" },
              },
              ...statements.slice(after),
            ]);
          }}
          remove={({ index }) => {
            if (group.values.length === 1)
              pendingFocus.current = {
                predicate: (groups[groupIndex + 1] ?? groups[groupIndex - 1])
                  ?.predicate,
              };
            change(statements.filter((_, i) => i !== index));
          }}
          predicate={
            <select
              className="sel sp2"
              aria-label="Predicate"
              value={group.predicate}
              onChange={(event) => {
                const predicate = event.target.value;
                pendingFocus.current = { predicate, select: true };
                change(
                  statements.map((statement) =>
                    statement.predicate === group.predicate
                      ? { ...statement, predicate }
                      : statement,
                  ),
                );
              }}
            >
              {addEntityPredicates
                .filter(
                  (predicate) =>
                    predicate === group.predicate ||
                    unused.includes(predicate) ||
                    group.values.some((value) => value.object.value.trim()),
                )
                .map((predicate) => (
                  <option key={predicate} value={predicate}>
                    {shorten(predicate)}
                  </option>
                ))}
            </select>
          }
          renderValue={({ object, index }) => (
            <input
              className="fld sv"
              aria-label="Value"
              placeholder="Value, one literal per statement"
              maxLength={10000}
              value={object.value}
              onChange={(event) =>
                change(
                  statements.map((statement, i) =>
                    i === index
                      ? {
                          ...statement,
                          object: {
                            ...statement.object,
                            value: event.target.value,
                          },
                        }
                      : statement,
                  ),
                )
              }
            />
          )}
        />
      ))}
      {!!nextPredicate && (
        <div className="stmt">
          <button
            type="button"
            className="btn quiet add-statement"
            onClick={() => {
              pendingFocus.current = { predicate: nextPredicate };
              change([
                ...statements,
                {
                  predicate: nextPredicate,
                  object: { literal: true, value: "" },
                },
              ]);
            }}
          >
            Add a statement
          </button>
          <span className="fnote">
            a comma inside a literal is part of that literal, so use separate
            statements for separate aliases
          </span>
        </div>
      )}
    </div>
  );
}
