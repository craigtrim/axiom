import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  TYPE,
  SUBCLASS,
  THING,
  NS,
  kindLabel,
  type Triple,
} from "../domain/model";
import { displayName, LABEL } from "../domain/rdf-model";
import { compactIri, expandIri, entityNamespace } from "../shared/terms";
import type { InspectorData } from "../shared/protocol";
import { command, useSnapshot } from "./client";
import { useEntityEditor } from "./useEntityEditor";
import { entityDragType, editEntity } from "./authoring";
import { groupStatements } from "./statement-groups";
import { usePredicateOptions } from "./PredicateSelect";
import { SharedMenu, usePaneToast, type SharedMenuItem } from "./SharedPane";
import { useActionOverflow } from "./useActionOverflow";

// craigtrim/axiom#89: expansion follows a subject and predicate through selection changes.
let expandedEpoch: number | undefined;
const expandedGroups = new Set<string>();
type Value = { t: Triple; index: number };
export function InspectorStatements({ data }: { data: InspectorData }) {
  const s = useSnapshot()!,
    e = data.entity;
  const editor = useEntityEditor(e.iri, false, true);
  const notify = usePaneToast();
  const body = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const more = useRef<HTMLButtonElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const addAnchor = useRef<HTMLButtonElement>(null);
  const [addKey, setAddKey] = useState(0),
    [addOpen, setAddOpen] = useState(false);
  const pendingFocus = useRef<{ predicate: string; index: number } | null>(
    null,
  );
  const options = usePredicateOptions([]);
  const errorId = useId();
  const namespace = entityNamespace(e.iri, s.ontology.namespace);
  const compact = (iri: string) =>
    iri.startsWith(namespace)
      ? ":" + compactIri(iri, namespace)
      : compactIri(iri, namespace);
  const resourceName = (iri: string) => {
    const value = compactIri(iri, namespace);
    return value.includes(":") && value !== iri
      ? value
      : (s.entities.find((entity) => entity.iri === iri)?.label ?? value);
  };
  // Wait for the retained draft before accepting the first keystroke.
  const editable =
    !!editor.loaded && s.entities.some((entity) => entity.iri === e.iri);
  const isClass = ["Class", "Defined"].includes(e.kind);
  const individual = e.kind === "Individual",
    property = e.kind.endsWith("Property");
  const inferredPredicate = individual ? TYPE : SUBCLASS;
  const inferred =
    ((individual && e.types.length > 0) || (isClass && e.iri !== THING)) &&
    !editor.triples.some(
      (t) =>
        t.predicate === inferredPredicate &&
        !t.object.literal &&
        t.object.value === THING,
    );
  const groups = useMemo(
    () =>
      groupStatements(
        editor.triples.map((t, index) => ({
          predicate: t.predicate,
          value: { t, index },
        })),
      ),
    [editor.triples],
  );
  const rows =
    inferred && !groups.some((g) => g.predicate === inferredPredicate)
      ? [...groups, { predicate: inferredPredicate, values: [] as Value[] }]
      : groups;
  const name = editor.triples.some(
    (t) => t.predicate === LABEL && t.object.literal,
  )
    ? editor.value(LABEL)
    : displayName(e);
  const validation = !name.trim()
    ? "A name is required."
    : name.length > 256
      ? `A name is at most 256 characters; this is ${name.length}.`
      : "";
  const stateText =
    validation ||
    editor.error ||
    (editor.changed ? "Unapplied changes" : "Saved");
  const saveActions = editable && editor.changed && !validation;
  if (expandedEpoch !== s.datasetEpoch) {
    expandedGroups.clear();
    expandedEpoch = s.datasetEpoch;
  }
  const discard = async () => {
    if (editor.saving) return;
    if (await editor.reload(true))
      notify("Draft discarded.", "The entity is back to what the store holds.");
  };
  const apply = async () => {
    if (await editor.save(false))
      notify("Applied as one edit.", "Use Undo to take it back.");
  };
  const commands = [
    ...(editable ? [{ id: "add", priority: 3 }] : []),
    { id: "details", priority: 2 },
    ...(saveActions ? [{ id: "discard", priority: 1 }] : []),
  ];
  const hidden = useActionOverflow(bar, more, commands, "shared");
  const openAdd = () => {
    addAnchor.current = hidden.has("add") ? more.current : addButton.current;
    setAddKey((n) => n + 1);
  };
  const add = (predicate: string) => {
    const first = editor.triples.find((t) => t.predicate === predicate);
    pendingFocus.current = {
      predicate,
      index: editor.triples.filter((t) => t.predicate === predicate).length,
    };
    expandedGroups.add(e.iri + "|" + predicate);
    editor.setTriples((triples) => [
      ...triples,
      {
        subject: e.iri,
        predicate,
        object: first
          ? { ...first.object, value: "" }
          : {
              literal:
                ![
                  TYPE,
                  SUBCLASS,
                  NS.rdfs + "subPropertyOf",
                  NS.rdfs + "domain",
                  NS.rdfs + "range",
                  NS.owl + "inverseOf",
                  NS.owl + "sameAs",
                  NS.owl + "equivalentClass",
                  NS.owl + "equivalentProperty",
                  NS.owl + "disjointWith",
                ].includes(predicate) &&
                s.entities.find((entity) => entity.iri === predicate)?.kind !==
                  "ObjectProperty",
              value: "",
            },
      },
    ]);
  };
  useLayoutEffect(() => {
    const pending = pendingFocus.current;
    if (!pending) return;
    const inputs = body.current
      ?.querySelector<HTMLTableRowElement>(
        `tr[data-predicate="${CSS.escape(pending.predicate)}"]`,
      )
      ?.querySelectorAll<HTMLInputElement>(".vrow input:not([readonly])");
    const field = inputs?.[Math.min(pending.index, inputs.length - 1)];
    if (field) {
      field.focus();
    } else {
      (hidden.has("add") ? more.current : addButton.current)?.focus();
    }
    pendingFocus.current = null;
  }, [editor.triples]);
  const overflow: SharedMenuItem[] = [];
  if (hidden.has("add"))
    overflow.push({ id: "add", label: "Add statement", run: openAdd });
  if (hidden.has("details"))
    overflow.push({
      id: "details",
      label: "Open in Details",
      run: () => editEntity(e.iri),
    });
  if (hidden.has("discard"))
    overflow.push({
      id: "discard",
      label: "Discard",
      disabled: editor.saving,
      run: () => void discard(),
    });
  if (overflow.length) overflow.push({ id: "separator", separator: true });
  overflow.push(
    {
      id: "copy",
      label: "Copy IRI",
      run: () => {
        void window.axiom.copy(e.iri).then(() => notify(`Copied ${e.iri}`));
      },
    },
    {
      id: "touchpoints",
      label: "Find touchpoints",
      disabled: e.iri.startsWith("_:"),
      run: () => command("touchpoints.open"),
    },
  );
  const usage: [string, number][] = isClass
    ? [
        ["Subclasses", e.children.length],
        ["Descendants", data.descendants],
        ["Direct instances", data.instances],
        ["Used as a value", data.referencedBy],
      ]
    : individual
      ? [
          ["Types", editor.triples.filter((t) => t.predicate === TYPE).length],
          ["Statements", editor.triples.length],
          ["Used as a value", data.referencedBy],
          ["Referenced by", data.referencingSubjects],
        ]
      : property
        ? [
            ["Subproperties", e.children.length],
            ["Used as a predicate", data.usedAsPredicate],
          ]
        : [["Used as a value", data.referencedBy]];
  const slot = (id: string, content: React.ReactNode, extra = "") => (
    <div
      className={"shared-command " + extra}
      data-shared-command={id}
      data-overflowed={hidden.has(id)}
      inert={hidden.has(id)}
      aria-hidden={hidden.has(id) || undefined}
    >
      {content}
    </div>
  );
  return (
    <div
      className="inspector-content-grid"
      onKeyDown={(event) => {
        if (
          event.key === "Escape" &&
          editor.changed &&
          !editor.saving &&
          !(event.target as HTMLElement).closest(".menu")
        ) {
          event.preventDefault();
          void discard();
        }
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes(entityDragType))
          event.preventDefault();
      }}
      onDrop={(event) => {
        const iri = event.dataTransfer.getData(entityDragType);
        if (iri) {
          event.preventDefault();
          editEntity(iri);
        }
      }}
    >
      <div
        ref={bar}
        className="bar"
        role="group"
        aria-label="Inspector actions"
      >
        <span
          className={
            "state msg " +
            (validation || editor.error
              ? "badink"
              : editor.changed
                ? "warnink"
                : "")
          }
          title={stateText}
          role={editor.error ? "alert" : undefined}
          data-fixed-action
        >
          <span data-natural-width>{stateText}</span>
        </span>
        {saveActions && (
          <div className="inspector-save-gap" data-fixed-action>
            <button
              className="btn primary"
              disabled={editor.saving}
              onClick={() => void apply()}
            >
              Apply changes
            </button>
          </div>
        )}
        {saveActions &&
          slot(
            "discard",
            <button
              className="btn"
              disabled={editor.saving}
              onClick={() => void discard()}
            >
              Discard
            </button>,
            "inspector-save-gap",
          )}
        <span className="od-fill" />
        {editable &&
          slot(
            "add",
            <button
              ref={addButton}
              className="btn quiet"
              aria-haspopup="menu"
              aria-expanded={addOpen && !hidden.has("add")}
              onClick={openAdd}
            >
              Add statement
            </button>,
          )}
        {slot(
          "details",
          <button className="btn quiet" onClick={() => editEntity(e.iri)}>
            Open in Details
          </button>,
        )}
        <SharedMenu trigger={more} items={overflow} />
        <SharedMenu
          trigger={addAnchor}
          renderTrigger={false}
          openKey={addKey}
          label="Add statement"
          onOpenChange={setAddOpen}
          items={[TYPE, ...options.filter((p) => p !== TYPE)].map(
            (predicate) => ({
              id: predicate,
              label: compact(predicate),
              disabled: groups.some((g) => g.predicate === predicate),
              run: () => add(predicate),
            }),
          )}
        />
      </div>
      <div className="ibody" ref={body}>
        <div className="ident">
          <div className="nm">
            <input
              aria-label="Name"
              aria-invalid={!!validation}
              aria-describedby={validation ? errorId : undefined}
              value={name}
              readOnly={!editable}
              onChange={(event) => editor.setLiteral(LABEL, event.target.value)}
            />
            <span className="kind">
              {isClass ? "Class" : kindLabel(e.kind)}
            </span>
          </div>
          <div className="iri" title={e.iri}>
            {e.iri}
          </div>
          {validation && (
            <div className="state badink" id={errorId}>
              {validation}
            </div>
          )}
        </div>
        <div className="usage">
          {usage.map(([label, count]) => (
            <div key={label} className={"u" + (count === 0 ? " zero" : "")}>
              <span className="v">{count.toLocaleString("en-US")}</span>
              <span className="k">{label}</span>
            </div>
          ))}
        </div>
        <div className="sect">
          <span className="t">Statements</span>
          <span className="n">{`${editor.triples.length.toLocaleString("en-US")} over ${groups.length} ${groups.length === 1 ? "predicate" : "predicates"}`}</span>
          <span className="sp" />
          {editable && (
            <button className="lnk" onClick={openAdd}>
              Add statement
            </button>
          )}
        </div>
        <table className="st" aria-label="Entity statements">
          <thead>
            <tr>
              <th scope="col">Predicate</th>
              <th scope="col">Value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((group) => (
              <InspectorGroup
                key={group.predicate}
                group={group}
                subject={e.iri}
                name={compact(group.predicate)}
                inferred={inferred && group.predicate === inferredPredicate}
                editable={editable}
                add={() => add(group.predicate)}
                remove={({ index }) => {
                  pendingFocus.current = {
                    predicate: group.predicate,
                    index: Math.max(
                      0,
                      group.values.findIndex((v) => v.index === index) - 1,
                    ),
                  };
                  editor.setTriples((triples) =>
                    triples.filter((_, i) => i !== index),
                  );
                }}
                render={({ t, index }, position) => (
                  <input
                    className="val"
                    readOnly={!editable}
                    aria-label={`${compact(t.predicate)} value ${position + 1}`}
                    value={
                      t.object.literal
                        ? t.object.value
                        : resourceName(t.object.value)
                    }
                    onChange={(event) => {
                      const text = event.target.value;
                      const value = t.object.literal
                        ? text
                        : (s.entities.find(
                            (entity) => displayName(entity) === text,
                          )?.iri ?? expandIri(text, namespace));
                      editor.setTriples((triples) =>
                        triples.map((triple, i) =>
                          i === index
                            ? { ...triple, object: { ...triple.object, value } }
                            : triple,
                        ),
                      );
                    }}
                  />
                )}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function InspectorGroup({
  group,
  subject,
  name,
  inferred,
  editable,
  add,
  remove,
  render,
}: {
  group: { predicate: string; values: Value[] };
  subject: string;
  name: string;
  inferred: boolean;
  editable: boolean;
  add(): void;
  remove(value: Value): void;
  render(value: Value, index: number): React.ReactNode;
}) {
  const key = subject + "|" + group.predicate;
  const [, redraw] = useState(0);
  const expanded = expandedGroups.has(key);
  const shown = expanded ? group.values : group.values.slice(0, 3);
  const hidden = group.values.length - shown.length;
  const id = useId();
  return (
    <tr data-predicate={group.predicate}>
      <td className="p" title={name}>
        {name}
        {hidden > 0 && (
          <>
            {" "}
            <span className="n">{group.values.length}</span>
          </>
        )}
      </td>
      <td className="v">
        <div
          className={"vstack" + (group.values.length > 1 ? " multi" : "")}
          id={id}
        >
          {shown.map((value, index) => (
            <div className="vrow" key={index}>
              {render(value, index)}
              {editable && (
                <button
                  className="btn quiet iconbtn rm"
                  aria-label="Remove this value"
                  onClick={() => remove(value)}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M6 6l12 12M18 6 6 18" />
                  </svg>
                </button>
              )}
            </div>
          ))}
          {inferred && (
            <div className="vrow">
              <input
                className="val"
                value="owl:Thing"
                readOnly
                aria-label={`${name} inferred value`}
              />
              <span className="inf">inferred</span>
            </div>
          )}
          {(editable || group.values.length > 3) && (
            <div className="vtools">
              {editable && (
                <button
                  className="lnk"
                  onClick={add}
                  aria-label={`Add value for ${name}`}
                >
                  Add value
                </button>
              )}
              {group.values.length > 3 && (
                <button
                  className="lnk"
                  aria-expanded={expanded}
                  aria-controls={id}
                  onClick={() => {
                    if (expanded) expandedGroups.delete(key);
                    else expandedGroups.add(key);
                    redraw((n) => n + 1);
                  }}
                >
                  {expanded ? "Show fewer" : `${hidden} more`}
                </button>
              )}
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}
