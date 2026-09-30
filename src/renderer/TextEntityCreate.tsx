import { useEffect, useId, useRef, useState } from "react";
import { request, setState, state, useSnapshot } from "./client";
import { TextParentPicker, parentIri } from "./TextParentPicker";
import { revealInTaxonomy } from "./taxonomy-navigation";
import { THING } from "../domain/model";
import { entityNameKey as nameKey } from "../shared/entity-names";
import { SourceDisclosure } from "./EntityEditorParts";
import type { FindCreationPreview } from "../shared/find-create";
import type {
  TextEntityDraft,
  TextEntityClassDraft,
  TextEntityCreated,
} from "./text-analysis-session";
import type { Snapshot } from "../shared/protocol";
import type {
  TextAnalysisDraft,
  TextAnalysisClassInput,
} from "../shared/text-analysis";

const newClass = (label = ""): TextEntityClassDraft => ({
  label: label.replace(/\s+/gu, " ").trim(),
  comment: "",
  parents: [],
  manualParents: false,
});
const classInput = (draft: TextEntityClassDraft): TextAnalysisClassInput => ({
  label: draft.label,
  comment: draft.comment,
  ...(draft.iri !== undefined ? { iri: draft.iri } : {}),
  ...(draft.statements ? { statements: draft.statements } : {}),
  ...(draft.checkAllEntities ? { checkAllEntities: true } : {}),
  parents: draft.parents.length
    ? draft.parents.map((parent) =>
        "iri" in parent ? parent : { create: classInput(parent.create) },
      )
    : [{ iri: THING }],
});

function FindHandoffSource({ value, snapshot, change }: { value: TextEntityClassDraft; snapshot: Snapshot; change(value: TextEntityClassDraft): void }) {
  const [source, setSource] = useState("");
  const input = { ...value.findDraft!, label: value.label, iri: value.iri, comment: value.comment, parents: value.parents.flatMap(p => "iri" in p ? [p.iri] : []) };
  const key = JSON.stringify([input, snapshot.datasetEpoch, snapshot.version]);
  useEffect(() => {
    let active = true;
    setSource("");
    void request<FindCreationPreview>("findCreatePreview", { creation: input, datasetEpoch: snapshot.datasetEpoch, version: snapshot.version })
      .then(preview => { if (active) setSource(preview.source); }).catch(() => {});
    return () => { active = false; };
  }, [key]);
  return <>
    {value.parents.some(p => "create" in p) && <p>New parents are staged with this draft. Source shows the currently saved parent references.</p>}
    <SourceDisclosure open={value.findDraft!.sourceOpen} change={sourceOpen => change({ ...value, findDraft: { ...value.findDraft!, sourceOpen } })} source={source} />
  </>;
}

export function TextEntityCreate({
  phrase,
  context,
  datasetEpoch,
  close,
  added,
  draft,
  changeDraft,
}: {
  phrase: string;
  context?: { before: string; after: string };
  draft?: TextEntityDraft;
  changeDraft?(value: TextEntityDraft): void;
  datasetEpoch: number;
  close(): void;
  added(
    iri: string,
    label: string,
    parents: string[],
    classes: TextEntityCreated[],
  ): void;
}) {
  const [value, setValue] = useState<TextEntityDraft>(
    () => draft ?? { frames: [{ value: newClass(phrase) }] },
  );
  useEffect(() => {
    changeDraft?.(value);
  }, [value, changeDraft]);
  const frames = value.frames,
    frame = frames[frames.length - 1];
  const change = (next: TextEntityClassDraft) =>
    setValue({ frames: [...frames.slice(0, -1), { ...frame, value: next }] });
  const finishParent = (parent: TextEntityClassDraft["parents"][number]) => {
    const previous = frames[frames.length - 2];
    const parents = [...previous.value.parents];
    if (frame.editIndex !== undefined)
      parents.splice(frame.editIndex, 1, parent);
    else if (!(
      "iri" in parent && parents.some((p) => "iri" in p && p.iri === parent.iri)
    ))
      parents.push(parent);
    const seen = new Set<string>();
    const uniqueParents = parents.filter((choice) => {
      if (!("iri" in choice)) return true;
      if (seen.has(choice.iri)) return false;
      seen.add(choice.iri);
      return true;
    });
    setValue({
      frames: [
        ...frames.slice(0, -2),
        {
          ...previous,
          value: {
            ...previous.value,
            parents: uniqueParents,
            manualParents: true,
          },
        },
      ],
    });
  };
  return (
    <TextClassEditor
      key={frames.length}
      value={frame.value}
      phrase={phrase}
      context={context}
      ancestors={frames.slice(0, -1).map((item) => item.value.label)}
      datasetEpoch={datasetEpoch}
      change={change}
      createParent={(label) =>
        setValue({ frames: [...frames, { value: { ...newClass(label), checkAllEntities: frames[0].value.checkAllEntities } }] })
      }
      editParent={(index) => {
        const parent = frame.value.parents[index];
        if ("create" in parent)
          setValue({
            frames: [...frames, { value: parent.create, editIndex: index }],
          });
      }}
      finishParent={finishParent}
      cancel={() =>
        frames.length > 1 ? setValue({ frames: frames.slice(0, -1) }) : close()
      }
      close={close}
      added={added}
    />
  );
}

function TextClassEditor({
  value,
  phrase,
  context,
  ancestors,
  datasetEpoch,
  change,
  createParent,
  editParent,
  finishParent,
  cancel,
  close,
  added,
}: {
  value: TextEntityClassDraft;
  phrase: string;
  context?: { before: string; after: string };
  ancestors: string[];
  datasetEpoch: number;
  change(value: TextEntityClassDraft): void;
  createParent(label: string): void;
  editParent(index: number): void;
  finishParent(parent: TextEntityClassDraft["parents"][number]): void;
  cancel(): void;
  close(): void;
  added(
    iri: string,
    label: string,
    parents: string[],
    classes: TextEntityCreated[],
  ): void;
}) {
  const snapshot = useSnapshot()!;
  const id = useId();
  const nested = ancestors.length > 0;
  const [preview, setPreview] = useState<TextAnalysisDraft>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const parentConfirmed = !search.trim();
  const pending = useRef(false),
    latest = useRef({ value, change });
  latest.current = { value, change };
  useEffect(() => {
    let current = true;
    setPreview(undefined);
    setError("");
    if (!value.label.trim()) return;
    const timer = setTimeout(() => {
      void request<TextAnalysisDraft>("textAnalysisDraft", {
        label: value.label,
        iri: value.iri,
        checkAllEntities: value.checkAllEntities,
        datasetEpoch,
        version: snapshot.version,
      })
        .then((next) => {
          if (!current) return;
          setPreview(next);
          const { value: draft, change: update } = latest.current;
          if (!draft.manualParents)
            update({
              ...draft,
              parents:
                next.defaultParent === THING
                  ? []
                  : [{ iri: next.defaultParent }],
            });
        })
        .catch((error) => {
          if (current)
            setError(error instanceof Error ? error.message : String(error));
        });
    }, 120);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [value.label, value.iri, datasetEpoch, snapshot.version]);
  const ancestor = ancestors.some(
    (label) => nameKey(label) === nameKey(value.label),
  );
  const valid =
    !!value.label.trim() &&
    preview &&
    preview.label === value.label.replace(/\s+/gu, " ").trim() &&
    preview.version === snapshot.version &&
    preview.datasetEpoch === snapshot.datasetEpoch &&
    !preview.existing.length &&
    !ancestor;
  const selected = (iri: string) =>
    value.parents.some((parent) => "iri" in parent && parent.iri === iri);
  const setParents = (parents: TextEntityClassDraft["parents"]) =>
    change({ ...value, parents, manualParents: true });
  const addParent = (iri: string) => {
    if (!selected(iri)) setParents([...value.parents, { iri }]);
    setSearch("");
  };
  const parentName = (parent: TextEntityClassDraft["parents"][number]) => {
    if ("create" in parent) return parent.create.label;
    const entity = snapshot.entities.find((item) => item.iri === parent.iri);
    return (
      entity?.label ||
      entity?.name ||
      (parent.iri === THING ? "Thing" : parent.iri)
    );
  };
  const openExisting = async (iri: string) => {
    if (!preview) return;
    if (nested) {
      finishParent({ iri });
      return;
    }
    try {
      await request("select", { iri, datasetEpoch, version: preview.version });
      setState(await request<Snapshot>("state"));
      close();
      revealInTaxonomy(iri);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  };
  const submit = () => {
    if (!valid || !parentConfirmed || pending.current) return;
    if (nested) {
      finishParent({ create: { ...value, label: preview.label } });
      return;
    }
    pending.current = true;
    setBusy(true);
    setError("");
    void request<string>("textAnalysisCreate", {
      creation: classInput(value),
      datasetEpoch,
      version: preview.version,
    })
      .then(async (iri) => {
        const next = await request<Snapshot>("state");
        if (
          next.datasetEpoch !== datasetEpoch ||
          state?.datasetEpoch !== datasetEpoch
        )
          return;
        setState(next);
        const seen = new Set(snapshot.entities.map((entity) => entity.iri));
        const byIri = new Map(
          next.entities.map((entity) => [entity.iri, entity]),
        );
        const created: TextEntityCreated[] = [];
        const collect = (id: string) => {
          if (seen.has(id)) return;
          seen.add(id);
          const entity = byIri.get(id);
          if (!entity) return;
          entity.parents.forEach(collect);
          created.push({
            iri: entity.iri,
            label: entity.label || entity.name,
            parents: entity.parents,
          });
        };
        collect(iri);
        const root = byIri.get(iri)!;
        added(iri, root.label || root.name, root.parents, created);
      })
      .catch((error) =>
        setError(error instanceof Error ? error.message : String(error)),
      )
      .finally(() => {
        pending.current = false;
        setBusy(false);
      });
  };
  const currentPreview =
    preview?.label === value.label.replace(/\s+/gu, " ").trim() &&
    preview.version === snapshot.version &&
    preview.datasetEpoch === snapshot.datasetEpoch
      ? preview
      : undefined;
  const collisions = currentPreview?.existing ?? [];
  const nameError = !value.label.trim() ? "A class needs a name." : "";
  return (
    <section
      aria-label="Add entity"
      className="text-entity-create"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.defaultPrevented) {
          event.preventDefault();
          event.stopPropagation();
          if (!busy) cancel();
        }
      }}
    >
      <div className="text-create-context">
        {nested ? (
          <>
            <button type="button" disabled={busy} onClick={cancel}>
              {ancestors.at(-1)}
            </button>
            <span aria-hidden="true">›</span>
            <span>new parent</span>
          </>
        ) : (
          <>
            <span>{value.findDraft ? "Adding from Find" : "Adding from selection"}</span>
            <span className="text-create-source">
              {context?.before}
              <mark>{phrase}</mark>
              {context?.after}
            </span>
          </>
        )}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="text-create-scroll">
          {collisions.length ? (
            <div className="text-existing-entities">
              {collisions.map((entity) => (
                <div key={entity.iri}>
                  <p>
                    <strong>{entity.label}</strong> already exists in this
                    ontology. Adding it again would create a duplicate.
                  </p>
                  <code>
                    {parentIri(entity.iri, snapshot.ontology.namespace)}
                  </code>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void openExisting(entity.iri)}
                  >
                    {nested
                      ? `Use ${entity.label} as parent`
                      : `Open ${entity.label} in Taxonomy`}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-create-columns">
              <div className="text-create-identity">
                <h3>Class</h3>
                {value.findDraft && <div className="find-handoff-details">
                  <p>Your Find draft is preserved. Parents created here are saved with this class.</p>
                  <label>Subject<input aria-label="Subject IRI" value={value.iri ?? ""} disabled={busy}
                    onChange={event => change({ ...value, iri: event.target.value })} /></label>
                  {value.findDraft.statements.map(row => <p key={row.id}><code>{row.predicate}</code>: {row.value || "empty value"}</p>)}
                  <FindHandoffSource value={value} snapshot={snapshot} change={change} />
                </div>}
                <label className="text-create-name">
                  Name
                  <input
                    aria-label="Name"
                    autoFocus
                    maxLength={256}
                    value={value.label}
                    disabled={busy}
                    aria-invalid={!!nameError}
                    aria-describedby={id + "-name-error"}
                    onChange={(event) =>
                      change({ ...value, label: event.target.value })
                    }
                  />
                </label>
                <p
                  id={id + "-name-error"}
                  role="status"
                  className={nameError ? "validation-error" : "muted"}
                >
                  {nameError ||
                    (!currentPreview && !error ? "Checking name…" : "")}
                </p>
                <label>
                  Description
                  <textarea
                    aria-label="Description"
                    maxLength={10000}
                    rows={3}
                    placeholder="Optional"
                    value={value.comment}
                    disabled={busy}
                    onChange={(event) =>
                      change({ ...value, comment: event.target.value })
                    }
                  />
                </label>
              </div>
              <div className="text-create-parents">
                <h3>Parents</h3>
                <div className="text-parent-chips">
                  {!value.parents.length && (
                    <span className="text-parents-empty">
                      <span aria-hidden="true">ⓘ</span> No parent chosen. Will
                      be added under <code>Thing</code>
                    </span>
                  )}
                  {value.parents.map((parent, index) => (
                    <span
                      className="text-parent-chip"
                      data-new={"create" in parent || undefined}
                      key={"iri" in parent ? parent.iri : index}
                    >
                      {"create" in parent ? (
                        <button
                          type="button"
                          className="text-parent-chip-edit"
                          disabled={busy}
                          onClick={() => editParent(index)}
                        >
                          {parentName(parent)}
                        </button>
                      ) : (
                        <span title={parent.iri}>{parentName(parent)}</span>
                      )}
                      {"create" in parent && <small>new</small>}
                      <button
                        type="button"
                        className="text-parent-chip-remove"
                        disabled={busy}
                        onClick={() =>
                          setParents(
                            value.parents.filter((_, at) => at !== index),
                          )
                        }
                      >
                        <span aria-hidden="true">×</span>
                        <span className="sr-only">
                          Remove {parentName(parent)}
                        </span>
                      </button>
                    </span>
                  ))}
                </div>
                <TextParentPicker
                  snapshot={snapshot}
                  value={value}
                  preview={currentPreview}
                  disabled={busy}
                  ready={!!valid}
                  text={search}
                  setText={setSearch}
                  add={addParent}
                  create={createParent}
                />
              </div>
            </div>
          )}
          {ancestor && (
            <p role="alert" className="validation-error">
              A class cannot be its own ancestor. Choose a different parent
              name.
            </p>
          )}
          {error && (
            <p role="alert" className="validation-error">
              {error}
            </p>
          )}
        </div>
        <footer className="text-entity-create-actions">
          <span>
            {nested ? (
              `Saved together with ${ancestors[0]} when you add it.`
            ) : !value.parents.length ? (
              <>
                Adding under <code>Thing</code>.
              </>
            ) : (
              ""
            )}
          </span>
          <div>
            <button type="button" disabled={busy} onClick={cancel}>
              {nested ? "Discard parent" : "Cancel"}
            </button>
            {!collisions.length && (
              <button
                className="primary"
                type="submit"
                disabled={!valid || !parentConfirmed || busy}
              >
                {busy ? "Adding…" : nested ? "Use as parent" : "Add class"}
              </button>
            )}
          </div>
        </footer>
      </form>
    </section>
  );
}
