import { useEffect, useRef, useState } from "react";
import { request, setState, state, useSnapshot } from "./client";
import { ResourceInput } from "./ResourceInput";
import { DraftParentSuggestions } from "./DraftParentSuggestions";
import { revealInTaxonomy } from "./taxonomy-navigation";
import { THING } from "../domain/model";
import type {
  TextEntityDraft,
  TextEntityClassDraft,
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
const nameKey = (label: string) =>
  label
    .normalize("NFKC")
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu)
    ?.join(" ") ?? label.trim();
const classInput = (draft: TextEntityClassDraft): TextAnalysisClassInput => ({
  label: draft.label,
  comment: draft.comment,
  parents: draft.parents.length
    ? draft.parents.map((parent) =>
        "iri" in parent ? parent : { create: classInput(parent.create) },
      )
    : [{ iri: THING }],
});

export function TextEntityCreate({
  phrase,
  datasetEpoch,
  close,
  added,
  draft,
  changeDraft,
}: {
  phrase: string;
  draft?: TextEntityDraft;
  changeDraft?(value: TextEntityDraft): void;
  datasetEpoch: number;
  close(): void;
  added(iri: string, label: string, parents: string[]): void;
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
      ancestors={frames.slice(0, -1).map((item) => item.value.label)}
      datasetEpoch={datasetEpoch}
      change={change}
      createParent={(label) =>
        setValue({ frames: [...frames, { value: newClass(label) }] })
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
  ancestors: string[];
  datasetEpoch: number;
  change(value: TextEntityClassDraft): void;
  createParent(label: string): void;
  editParent(index: number): void;
  finishParent(parent: TextEntityClassDraft["parents"][number]): void;
  cancel(): void;
  close(): void;
  added(iri: string, label: string, parents: string[]): void;
}) {
  const snapshot = useSnapshot()!;
  const nested = ancestors.length > 0;
  const [preview, setPreview] = useState<TextAnalysisDraft>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [searchKey, setSearchKey] = useState(0);
  const [parentConfirmed, setParentConfirmed] = useState(true);
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
  }, [value.label, datasetEpoch, snapshot.version]);
  const ancestor = ancestors.some(
    (label) => nameKey(label) === nameKey(value.label),
  );
  const valid =
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
    setSearchKey((key) => key + 1);
    setParentConfirmed(true);
  };
  const parentName = (parent: TextEntityClassDraft["parents"][number]) =>
    "create" in parent
      ? parent.create.label
      : (snapshot.entities.find((entity) => entity.iri === parent.iri)?.label ??
        (parent.iri === THING ? "Thing" : parent.iri));
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
        added(
          iri,
          preview.label,
          next.entities.find((entity) => entity.iri === iri)?.parents ?? [],
        );
      })
      .catch((error) =>
        setError(error instanceof Error ? error.message : String(error)),
      )
      .finally(() => {
        pending.current = false;
        setBusy(false);
      });
  };
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
      {nested ? (
        <p className="text-parent-context">
          Parent for <strong>{ancestors[ancestors.length - 1]}</strong>{" "}
          <small>(level {ancestors.length})</small>
        </p>
      ) : (
        <p className="muted">
          Add the selected phrase as a class. Select any parents it belongs
          under, or create a new parent.
        </p>
      )}
      {nested && (
        <p className="muted">
          Choose this parent's parents below. New classes are saved together
          when you add the original class.
        </p>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label>
          Class name
          <input
            aria-label="Class name"
            autoFocus
            maxLength={256}
            value={value.label}
            disabled={busy}
            onChange={(event) =>
              change({ ...value, label: event.target.value })
            }
          />
        </label>
        {!!preview?.existing.length && (
          <div className="text-existing-entities">
            <p>This phrase already names an existing class.</p>
            {preview.existing.map((entity) => (
              <button
                type="button"
                key={entity.iri}
                title={entity.iri}
                onClick={() => void openExisting(entity.iri)}
              >
                {nested
                  ? `Use ${entity.label} as parent`
                  : `Open ${entity.label} in Taxonomy`}
              </button>
            ))}
          </div>
        )}
        {!preview?.existing.length && (
          <>
            {!!preview?.parents.length && (
              <fieldset className="text-parent-suggestions">
                <legend>Suggested parents from the phrase (select any)</legend>
                {preview.parents.map((candidate) => (
                  <button
                    type="button"
                    key={candidate.iri}
                    aria-pressed={selected(candidate.iri)}
                    title={`${candidate.iri} (matches “${candidate.matchedText}”)`}
                    disabled={busy}
                    onClick={() =>
                      setParents(
                        selected(candidate.iri)
                          ? value.parents.filter(
                              (parent) =>
                                !(
                                  "iri" in parent &&
                                  parent.iri === candidate.iri
                                ),
                            )
                          : [...value.parents, { iri: candidate.iri }],
                      )
                    }
                  >
                    {candidate.label}
                  </button>
                ))}
              </fieldset>
            )}
            <fieldset className="text-selected-parents">
              <legend>Selected parents</legend>
              {!value.parents.length && (
                <p className="muted">
                  No parents selected. This class will be added under Thing.
                </p>
              )}
              {value.parents.map((parent, index) => (
                <div
                  className="text-selected-parent"
                  key={"iri" in parent ? parent.iri : index}
                >
                  <span title={"iri" in parent ? parent.iri : undefined}>
                    {parentName(parent)}
                    {"create" in parent && <small> (new)</small>}
                  </span>
                  {"create" in parent && (
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={`Edit parent ${parentName(parent)}`}
                      onClick={() => editParent(index)}
                    >
                      Edit
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={`Remove parent ${parentName(parent)}`}
                    onClick={() =>
                      setParents(value.parents.filter((_, at) => at !== index))
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
            </fieldset>
            <div
              className="text-parent-input"
              onInput={(event) => {
                setParentConfirmed(false);
                setSearch((event.target as HTMLInputElement).value);
              }}
              onKeyDownCapture={(event) => {
                if (event.key === "Escape") {
                  setParentConfirmed(true);
                  setSearch("");
                }
              }}
            >
              <span>Add existing parent</span>
              <ResourceInput
                key={searchKey}
                value=""
                namespace={snapshot.ontology.namespace}
                label="Add existing parent"
                commitOnBlur={false}
                classesOnly
                exclude={value.parents.flatMap((parent) =>
                  "iri" in parent ? [parent.iri] : [],
                )}
                disabled={busy || !preview}
                change={addParent}
              />
            </div>
            <div>
              <button
                type="button"
                disabled={busy}
                onClick={() => createParent(search)}
              >
                Create new parent
              </button>
            </div>
            <label>
              Description (optional)
              <textarea
                aria-label="Description"
                maxLength={10000}
                rows={2}
                value={value.comment}
                disabled={busy}
                onChange={(event) =>
                  change({ ...value, comment: event.target.value })
                }
              />
            </label>
            <DraftParentSuggestions
              snapshot={snapshot}
              draft={{
                label: value.label,
                comment: value.comment,
                parents: value.parents.flatMap((p) =>
                  "iri" in p ? [p.iri] : [],
                ),
                version: snapshot.version,
                datasetEpoch,
              }}
              disabled={busy || !valid}
              toggle={(iri) =>
                setParents(
                  selected(iri)
                    ? value.parents.filter(
                        (p) => !("iri" in p && p.iri === iri),
                      )
                    : [...value.parents, { iri }],
                )
              }
            />
          </>
        )}
        {ancestor && (
          <p role="alert" className="validation-error">
            A class cannot be its own ancestor. Choose a different parent name.
          </p>
        )}
        {error && (
          <p role="alert" className="validation-error">
            {error}
          </p>
        )}
        <div className="text-entity-create-actions">
          <button type="submit" disabled={!valid || !parentConfirmed || busy}>
            {busy ? "Adding..." : nested ? "Use new parent" : "Add class"}
          </button>
          <button type="button" disabled={busy} onClick={cancel}>
            {nested ? "Cancel parent" : "Cancel"}
          </button>
        </div>
      </form>
    </section>
  );
}
