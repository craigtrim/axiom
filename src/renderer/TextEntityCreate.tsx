// craigtrim/axiom#111: source uses the same tokens as the editable views.
import { Code } from "./Code";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { NS, THING, shorten } from "../domain/model";
import { isDefaultIdentifier } from "../domain/rdf-model";
import { entityRetargeted } from "./editor-drafts";
import {
  addEntityIri,
  cleanEntityName,
  plannedEntitySource,
  type AddEntityApplied,
  type AddEntityFinding,
  type AddEntityInput,
  type AddEntityCheck,
  type AddEntityNode,
} from "../shared/add-entity";
import { selectedEntityName } from "../shared/selected-entity-name";
import { command, request, setState, state, useSnapshot } from "./client";
import { SharedMenu, usePaneToast, type SharedMenuItem } from "./SharedPane";
import { usePaneLayout } from "./AdaptivePane";
import { useActionOverflow } from "./useActionOverflow";
import { useRetainedPreview } from "./use-retained-preview";
import { updateFind } from "./find-state";
import { defaultFindOptions } from "../shared/find";
import { revealInOpenTaxonomy } from "./taxonomy-navigation";
import { AddEntityPicker } from "./AddEntityPicker";
import { AddEntityStatements } from "./AddEntityStatements";
import type {
  TextEntityDraft,
  TextEntityClassDraft,
} from "./text-analysis-session";
import type { Snapshot } from "../shared/protocol";

// craigtrim/axiom#203: Create, Rename and Apply report the root triples they wrote.
interface AddEntityWrite {
  iri: string;
  created: string[];
  parents: string[];
  applied: AddEntityApplied;
  edited?: boolean;
}
export const emptyEntityDraft = (label = ""): TextEntityClassDraft => ({
  label,
  comment: "",
  parents: [],
  manualParents: false,
  statements: [
    { predicate: NS.skos + "altLabel", object: { literal: true, value: "" } },
  ],
});
const inputNode = (n: TextEntityClassDraft): AddEntityNode => ({
  label: n.label,
  comment: n.comment,
  statements: n.statements,
  parents: n.parents.map((p) =>
    "iri" in p ? p : { create: inputNode(p.create) },
  ),
});
const countDrafts = (n: TextEntityClassDraft): number =>
  n.parents.reduce(
    (count, p) => count + ("create" in p ? 1 + countDrafts(p.create) : 0),
    0,
  );
function initialDraft(
  draft: TextEntityDraft | undefined,
  phrase: string,
): TextEntityDraft {
  if (!draft)
    return {
      frames: [{ value: emptyEntityDraft(selectedEntityName(phrase)) }],
      kind: "class",
      origin: phrase ? "selection" : "blank",
      phrase,
    };
  // craigtrim/axiom#93: an older frame stack reopens as nested rows without losing work.
  const frames = structuredClone(draft.frames);
  while (frames.length > 1) {
    const last = frames.pop()!,
      parent = frames.at(-1)!.value,
      ref = { create: last.value };
    if (last.editIndex !== undefined)
      parent.parents.splice(last.editIndex, 1, ref);
    else parent.parents.push(ref);
    parent.manualParents = true;
  }
  const root = frames[0].value;
  root.statements ??= emptyEntityDraft().statements;
  return {
    ...draft,
    frames,
    kind: draft.kind ?? "class",
    origin:
      draft.origin ??
      (root.findDraft ? "find" : phrase ? "selection" : "blank"),
    phrase: draft.phrase ?? phrase,
  };
}
export function TextEntityCreate({
  phrase,
  datasetEpoch,
  draft,
  changeDraft,
}: {
  phrase: string;
  datasetEpoch: number;
  draft?: TextEntityDraft;
  changeDraft(value: TextEntityDraft): void;
}) {
  const snapshot = useSnapshot()!,
    layout = usePaneLayout(),
    notify = usePaneToast();
  const [value, setValue] = useState(() => initialDraft(draft, phrase));
  const root = value.frames[0].value,
    kind = value.kind ?? "class",
    context = value.phrase ?? phrase;
  // #169: Discard resets retained validation; only actual draft content enables it.
  const [draftEpoch, setDraftEpoch] = useState(0);
  const hasDraft = !!(
    root.label ||
    root.comment ||
    root.parents.length ||
    root.pickerText ||
    root.statements?.some((s) => s.object.value)
  );
  const [busy, setBusy] = useState(false),
    pending = useRef(false),
    mounted = useRef(true);
  const bar = useRef<HTMLDivElement>(null),
    more = useRef<HTMLButtonElement>(null);
  const hidden = useActionOverflow(
    bar,
    more,
    [
      { id: "clear", priority: 3 },
      { id: "find", priority: 2 },
      { id: "state", priority: 1 },
    ],
    "shared",
  );
  const creation: AddEntityInput = { kind, root: inputNode(root) };
  // #177: Name edits retain the root identity; Undo/Redo can restore either rename IRI.
  const createdRoot = value.createdRootIris
    ?.map((iri) => snapshot.entities.find((entity) => entity.iri === iri))
    .find((entity) => !!entity);
  // craigtrim/axiom#203: every field then edits that entity, merged against the last write.
  const target = createdRoot
    ? { iri: createdRoot.iri, applied: value.applied }
    : undefined;
  const key = JSON.stringify([
    creation,
    snapshot.datasetEpoch,
    snapshot.version,
    target?.iri,
  ]);
  const latest = useRef(key);
  latest.current = key;
  const currentDraft = useRef(value);
  currentDraft.current = value;
  const check = useRetainedPreview<AddEntityCheck>(
    key,
    `${datasetEpoch}:${draftEpoch}`,
    () =>
      request("addEntityCheck", {
        creation,
        datasetEpoch,
        version: snapshot.version,
        target,
      }),
  );
  // #203: compare the name as creation writes it, so "&" does not read as a rename.
  const renameChoice =
    !!createdRoot &&
    cleanEntityName(root.label) !== (createdRoot.label ?? createdRoot.name);
  // A check from before the last write would offer Apply for edits already written.
  const applyCheck =
      target && check.value?.version === snapshot.version
        ? check.value.apply
        : undefined,
    applyFindings = applyCheck?.findings ?? [],
    applyErrors = applyFindings.filter((f) => f.kind === "bad2");
  const applyChoice = !!createdRoot && !renameChoice && !!applyCheck?.changed;
  const renameBlocked =
    renameChoice && !!applyCheck?.changed && !!applyErrors.length;
  // #177: completed-result state must not depend on delayed creation feedback.
  const alreadyCreated = !!createdRoot && !renameChoice && !applyChoice;
  const newIri = addEntityIri(root.label, snapshot.ontology.namespace);
  const replacesPlaceholder =
    !!createdRoot &&
    isDefaultIdentifier(createdRoot.iri) &&
    !isDefaultIdentifier(newIri);
  const findings = check.value?.findings ?? [],
    errors = findings.filter((f) => f.kind === "bad2");
  // #119/#177: hide the completed result, but explain blocked creation during a rename choice.
  // #203: after Create, the band reports what blocks Apply, never the entity itself.
  const shown: { finding: AddEntityFinding; prefix?: string }[] =
      createdRoot && !renameChoice
        ? applyFindings.map((finding) => ({ finding }))
        : [
            ...findings
              .filter(
                (f) =>
                  !f.reveal ||
                  renameChoice ||
                  (!value.created?.includes(f.reveal.iri) && !createdRoot),
              )
              .map((finding) => ({
                finding,
                prefix: renameChoice ? "Create new: " : undefined,
              })),
            ...(renameBlocked
              ? applyErrors
                  .filter((f) => !errors.some((e) => e.message === f.message))
                  .map((finding) => ({ finding, prefix: "Rename: " }))
              : []),
          ],
    problems = shown.filter((s) => s.finding.kind === "bad2").length,
    warnings = shown.length - problems;
  const drafts = countDrafts(root),
    source = plannedEntitySource(creation, snapshot.ontology.namespace);
  const problemText = (n: number) => `${n} problem${n === 1 ? "" : "s"}`;
  const stateText =
    renameChoice && root.label.trim()
      ? renameBlocked
        ? problemText(applyErrors.length)
        : errors.length
          ? "Ready to rename"
          : "Ready to rename or create"
      : applyChoice
        ? problems
          ? problemText(problems)
          : "Ready to apply"
        : createdRoot && !renameChoice
          ? "Created"
          : problems
            ? problemText(problems)
            : warnings
              ? `${warnings} note${warnings === 1 ? "" : "s"}`
              : shown.length < findings.length
                ? "Created"
                : root.label.trim()
                  ? "Ready to create"
                  : "Draft";
  // #203: a draft saved before Apply existed has no last write to merge against.
  const changeRoot = (next: TextEntityClassDraft, nameOnly = false) =>
    setValue((v) => ({
      ...v,
      created: nameOnly || v.applied ? v.created : undefined,
      createdRootIris: nameOnly || v.applied ? v.createdRootIris : undefined,
      frames: [{ value: next }],
    }));
  useEffect(() => {
    changeDraft(value);
  }, [value, changeDraft]);
  // #203: a draft saved before Apply adopts its unedited plan as the last write.
  useEffect(() => {
    const adopted = check.fresh ? check.value?.apply?.adopted : undefined;
    if (adopted)
      setValue((v) =>
        v.applied || !v.createdRootIris ? v : { ...v, applied: adopted },
      );
  }, [check.fresh, check.value]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!check.fresh || !check.value) return;
    setValue((v) => {
      const n = v.frames[0].value,
        parents =
          check.value!.defaultParent === THING
            ? []
            : [{ iri: check.value!.defaultParent }];
      if (
        !v.error &&
        (n.manualParents ||
          JSON.stringify(n.parents) === JSON.stringify(parents))
      )
        return v;
      return {
        ...v,
        error: undefined,
        frames: [{ value: n.manualParents ? n : { ...n, parents } }],
      };
    });
  }, [check.fresh, check.value]);
  useLayoutEffect(() => {
    const pane = bar.current?.closest<HTMLElement>(".add-entity-surface");
    if (pane)
      pane.dataset.source = String(layout.width >= 860 && !layout.shallow);
  }, [layout.width, layout.shallow]);
  const discard = () => {
    if (busy || !hasDraft) return;
    setDraftEpoch((epoch) => epoch + 1);
    setValue({
      frames: [{ value: emptyEntityDraft() }],
      kind,
      origin: "blank",
      phrase: "",
    });
    notify(
      "Draft discarded.",
      "View, Add entity reopens a blank form without needing selected text.",
    );
  };
  const find = (iri?: string, label = root.label) => {
    updateFind(
      { ...defaultFindOptions, text: label.trim(), revealIri: iri },
      iri ?? "",
    );
    command("view.find");
  };
  const copy = async () => {
    try {
      await window.axiom.copy(source);
      notify(
        "The planned source is on the clipboard.",
        "It includes every parent that does not exist yet.",
      );
    } catch (e) {
      setValue((v) => ({ ...v, error: (e as Error).message }));
    }
  };
  const submit = async () => {
    if (
      alreadyCreated ||
      pending.current ||
      errors.length ||
      check.error ||
      value.error ||
      !root.label.trim()
    )
      return;
    pending.current = true;
    try {
      const fresh = await check.validate();
      if (
        !fresh ||
        fresh.findings.some((f) => f.kind === "bad2") ||
        !mounted.current ||
        latest.current !== key ||
        state?.datasetEpoch !== datasetEpoch ||
        state.version !== snapshot.version
      )
        return;
      const actual = root.manualParents
        ? creation
        : {
            ...creation,
            root: {
              ...creation.root,
              parents:
                fresh.defaultParent === THING
                  ? []
                  : [{ iri: fresh.defaultParent }],
            },
          };
      setBusy(true);
      const submittedDraft = currentDraft.current;
      const result = await request<AddEntityWrite>("addEntityCreate", {
        creation: actual,
        datasetEpoch,
        version: fresh.version,
      });
      const next = await request<Snapshot>("state");
      if (
        !mounted.current ||
        next.datasetEpoch !== datasetEpoch ||
        state?.datasetEpoch !== datasetEpoch
      )
        return;
      setState(next);
      setValue((v) =>
        v !== submittedDraft
          ? v
          : {
              ...v,
              created: result.created,
              createdRootIris: [result.iri],
              applied: result.applied,
              error: undefined,
              frames: [
                {
                  value: {
                    ...root,
                    manualParents: true,
                    pickerText: "",
                    parents: result.parents.map((iri) => ({ iri })),
                  },
                },
              ],
            },
      );
      // craigtrim/axiom#144: follow only a visible Hierarchy, leaving its layout alone.
      revealInOpenTaxonomy(result.iri);
      notify(
        `Created ${result.created.length > 1 ? `${result.created.length} ${kind === "class" ? "classes" : "entities"}` : root.label.trim()} in one transaction.`,
        `The saved parents were reread, the new ${kind === "class" ? "class" : "individual"} is selected in Hierarchy, and one Undo removes all of it.`,
      );
    } catch (e) {
      if (mounted.current)
        setValue((v) => ({ ...v, error: (e as Error).message }));
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  // #177/#203: Rename and Apply write the draft to the entity it created. The
  // worker plans and validates the write itself, so neither waits for a check.
  const writeCreated = async (rename: boolean) => {
    if (
      pending.current ||
      !createdRoot ||
      !target?.applied ||
      !(rename ? renameChoice && !renameBlocked : applyChoice) ||
      (!rename && applyErrors.length) ||
      !root.label.trim() ||
      state?.datasetEpoch !== datasetEpoch
    )
      return;
    pending.current = true;
    setBusy(true);
    const original = createdRoot,
      name = cleanEntityName(root.label),
      rootIris = value.createdRootIris;
    try {
      const submittedDraft = currentDraft.current;
      const result = await request<AddEntityWrite>("addEntityApply", {
        creation,
        target,
        rename,
        datasetEpoch,
        version: snapshot.version,
      });
      if (!mounted.current || state?.datasetEpoch !== datasetEpoch) return;
      const iri = result.iri;
      if (iri !== original.iri)
        entityRetargeted(original.iri, iri, datasetEpoch);
      await request("select", { iri, datasetEpoch });
      const next = await request<Snapshot>("state");
      if (
        !mounted.current ||
        next.datasetEpoch !== datasetEpoch ||
        state?.datasetEpoch !== datasetEpoch
      )
        return;
      setState(next);
      setValue((v) =>
        v.createdRootIris !== rootIris
          ? v
          : {
              ...v,
              applied: result.applied,
              created: [
                ...new Set([...(v.created ?? []), iri, ...result.created]),
              ],
              createdRootIris: [
                iri,
                ...(rootIris ?? []).filter((old) => old !== iri),
              ],
              error: undefined,
              // Drafted parents now exist, so the chips name what was written.
              frames:
                v === submittedDraft
                  ? [
                      {
                        value: {
                          ...v.frames[0].value,
                          manualParents: true,
                          pickerText: "",
                          parents: result.parents.map((p) => ({ iri: p })),
                        },
                      },
                    ]
                  : v.frames,
            },
      );
      revealInOpenTaxonomy(iri);
      const label = original.label ?? original.name,
        parents = result.created.length;
      if (rename)
        notify(
          `Renamed ${label} to ${name}.`,
          `${iri === original.iri ? "The IRI did not change: " : "The placeholder IRI changed to "}${iri}. One Undo restores the old name${iri === original.iri ? "" : " and IRI"}${result.edited ? " and the draft's other edits" : ""}.`,
        );
      else
        notify(
          `Applied changes to ${label}.`,
          parents
            ? `${parents} new parent${parents === 1 ? " was" : "s were"} created in the same step, and one Undo removes all of it.`
            : "One Undo restores the previous values.",
        );
    } catch (e) {
      if (mounted.current)
        setValue((v) => ({ ...v, error: (e as Error).message }));
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const mutate = (
    path: number[],
    edit: (n: TextEntityClassDraft) => TextEntityClassDraft,
  ) => {
    const walk = (
      n: TextEntityClassDraft,
      depth: number,
    ): TextEntityClassDraft =>
      depth === path.length
        ? edit(n)
        : {
            ...n,
            parents: n.parents.map((p, i) =>
              i === path[depth] && "create" in p
                ? { create: walk(p.create, depth + 1) }
                : p,
            ),
          };
    setValue((v) => ({
      ...v,
      created: v.applied ? v.created : undefined,
      createdRootIris: v.applied ? v.createdRootIris : undefined,
      frames: [{ value: walk(v.frames[0].value, 0) }],
    }));
  };
  const parentName = (p: TextEntityClassDraft["parents"][number]) =>
    "create" in p
      ? p.create.label
      : snapshot.entities.find((e) => e.iri === p.iri)?.label ||
        snapshot.entities.find((e) => e.iri === p.iri)?.name ||
        p.iri;
  const cross = (width = 1.7) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
  const parentRows = (
    n: TextEntityClassDraft,
    path: number[] = [],
  ): ReactNode => (
    <>
      <div
        className={"frow top" + (path.length ? " nest" : "")}
        style={
          path.length ? { marginInlineStart: path.length * 16 } : undefined
        }
      >
        <span className="flbl">
          {path.length ? n.label : kind === "class" ? "Subclass of" : "Type"}
        </span>
        <div className="fctl">
          <div className="rowline">
            {n.parents.map((p, i) => (
              <span
                className={"pchip" + ("create" in p ? " draft" : "")}
                key={("iri" in p ? p.iri : p.create.label) + i}
              >
                {/* #165: long parent names wrap without losing their remove control. */}
                <span className="pname">
                  {parentName(p) + ("create" in p ? " (new)" : "")}
                </span>
                <button
                  className="x"
                  type="button"
                  aria-label={`Remove ${parentName(p)}`}
                  disabled={busy}
                  onClick={() =>
                    mutate(path, (x) => ({
                      ...x,
                      manualParents: true,
                      parents: x.parents.filter((_, j) => j !== i),
                    }))
                  }
                >
                  {cross(2.6)}
                </button>
              </span>
            ))}
          </div>
          <AddEntityPicker
            node={n}
            snapshot={snapshot}
            disabled={busy}
            label={path.length ? `Parent for ${n.label}` : "Add a parent"}
            placeholder={
              path.length
                ? "Parent for this new class"
                : "Type a class name, for example Enginee"
            }
            change={(text) => mutate(path, (x) => ({ ...x, pickerText: text }))}
            take={(parent) =>
              mutate(path, (x) => ({
                ...x,
                manualParents: true,
                pickerText: "",
                parents: [...x.parents, parent],
              }))
            }
          />
        </div>
      </div>
      {n.parents.map((p, i) =>
        "create" in p ? (
          <div className="nested-row-group" key={i}>
            {parentRows(p.create, [...path, i])}
          </div>
        ) : null,
      )}
    </>
  );
  const menu: SharedMenuItem[] = [
    ...(hidden.has("clear")
      ? [
          {
            id: "clear",
            label: "Discard draft",
            run: discard,
            disabled: busy || !hasDraft,
          },
        ]
      : []),
    ...(hidden.has("find")
      ? [
          {
            id: "find",
            label: "Find existing",
            run: () => find(),
            disabled: busy,
          },
        ]
      : []),
    ...(hidden.has("clear") || hidden.has("find")
      ? [{ id: "hidden-separator", separator: true as const }]
      : []),
    {
      id: "title",
      label: "Re-run the title case conversion",
      disabled: !context || busy,
      run: () =>
        changeRoot({ ...root, label: selectedEntityName(context) }, true),
    },
    { id: "separator", separator: true },
    { id: "copy", label: "Copy the planned source", run: () => void copy() },
  ];
  return (
    <>
      <div
        className="bar"
        role="group"
        aria-label="Add entity actions"
        ref={bar}
      >
        <span
          className="seg"
          role="group"
          aria-label="Entity kind"
          data-fixed-action
        >
          {(["class", "individual"] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              disabled={busy}
              onClick={() =>
                setValue((v) => ({
                  ...v,
                  created: undefined,
                  createdRootIris: undefined,
                  applied: undefined,
                  kind: k,
                }))
              }
            >
              {k === "class" ? "Class" : "Individual"}
            </button>
          ))}
        </span>
        <span
          className={`state shared-command ${renameChoice && root.label.trim() && !renameBlocked ? "okink" : problems ? "badink" : warnings ? "warnink" : root.label.trim() ? "okink" : ""}`}
          data-shared-command="state"
          data-overflowed={hidden.has("state")}
          aria-hidden={hidden.has("state") || undefined}
        >
          {stateText}
        </span>
        <span className="od-fill" />
        {renameChoice && (
          <button
            type="button"
            className="btn primary"
            data-fixed-action
            disabled={busy || !root.label.trim() || renameBlocked}
            onClick={() => void writeCreated(true)}
          >
            Rename
          </button>
        )}
        <button
          type="button"
          className={renameChoice ? "btn" : "btn primary"}
          data-fixed-action
          disabled={
            alreadyCreated ||
            busy ||
            !!(applyChoice ? applyErrors : errors).length ||
            !!check.error ||
            !!value.error ||
            !root.label.trim()
          }
          onClick={() => void (applyChoice ? writeCreated(false) : submit())}
        >
          {renameChoice
            ? "Create new"
            : applyChoice
              ? "Apply"
              : drafts === 0
                ? "Create"
                : drafts === 1
                  ? "Create both"
                  : "Create all"}
        </button>
        <span
          className="shared-command"
          data-shared-command="find"
          data-overflowed={hidden.has("find")}
          inert={hidden.has("find")}
          aria-hidden={hidden.has("find") || undefined}
        >
          <button
            className="btn quiet"
            type="button"
            disabled={busy}
            onClick={() => find()}
          >
            Find existing
          </button>
        </span>
        <span
          className="shared-command"
          data-shared-command="clear"
          data-overflowed={hidden.has("clear")}
          inert={hidden.has("clear")}
          aria-hidden={hidden.has("clear") || undefined}
        >
          <button
            className="btn quiet"
            type="button"
            disabled={busy || !hasDraft}
            onClick={discard}
          >
            Discard draft
          </button>
        </span>
        <SharedMenu trigger={more} items={menu} />
      </div>
      <div className="body">
        <div className="work2">
          <div className="form">
            <div role="status" className="validation-band">
              {renameChoice && (
                <div className="vmsg rename-choice">
                  {`${createdRoot!.label ?? createdRoot!.name} was created from this draft. Rename changes its name; Create new adds ${root.label.trim() || "a new entity"} beside it.`}
                </div>
              )}
              {shown.map(({ finding: f, prefix }, i) => (
                <div className={`vmsg ${f.kind}`} key={i}>
                  <span
                    className={`tag ${f.kind === "bad2" ? "err" : "wrn"}`}
                    aria-hidden="true"
                  >
                    <span className="gl" />
                  </span>
                  {(prefix ?? "") + f.message}
                  {f.reveal && (
                    <>
                      {" "}
                      <button
                        type="button"
                        className="btn quiet"
                        onClick={() => find(f.reveal!.iri, f.reveal!.label)}
                      >
                        {`Reveal ${f.reveal.label}`}
                      </button>
                    </>
                  )}
                </div>
              ))}
              {(check.error || value.error) && (
                <div className="vmsg bad2">{check.error || value.error}</div>
              )}
            </div>
            <div className="fields">
              <div className="frow">
                <span className="flbl">Name</span>
                <div className="fctl">
                  <input
                    className="fld wide"
                    aria-label="Name"
                    maxLength={256}
                    value={root.label}
                    onChange={(e) =>
                      changeRoot({ ...root, label: e.target.value }, true)
                    }
                  />
                  <div className="fnote">
                    {renameChoice ? (
                      <>
                        {replacesPlaceholder
                          ? "Rename replaces the placeholder IRI "
                          : "Rename keeps IRI "}
                        <span className="mono">{createdRoot!.iri}</span>
                        {"; Create new writes "}
                        <span className="mono">{newIri}</span>
                        {replacesPlaceholder &&
                          ". Rename chooses an unused IRI from the new name."}
                      </>
                    ) : (
                      <>
                        IRI{" "}
                        <span className="mono">
                          {createdRoot?.iri ?? newIri}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="frow">
                <span className="flbl">Context</span>
                <div className="fctl">
                  <div className="fnote">
                    {value.origin === "blank" ? (
                      "nothing, this is a blank form"
                    ) : (
                      <>
                        {value.origin === "find"
                          ? "from your search "
                          : "from the selection "}
                        <span className="mono">{context}</span>
                        {", title cased once when this view opened"}
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="sect2">
                <span className="st">Parents</span>
                <span className="sn">
                  {root.parents.length
                    ? `${root.parents.length} selected, ${root.parents.filter((p) => "create" in p).length} to be created`
                    : kind === "class"
                      ? "none, so it would be created under owl:Thing"
                      : "none"}
                </span>
              </div>
              {parentRows(root)}
              <div className="sect2">
                <span className="st">Description</span>
              </div>
              <div className="frow top">
                <span className="flbl">Comment</span>
                <div className="fctl">
                  <textarea
                    className="ta"
                    aria-label="Comment"
                    value={root.comment}
                    maxLength={10000}
                    onChange={(e) =>
                      changeRoot({ ...root, comment: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="sect2">
                <span className="st">Additional statements</span>
                <span className="sn">{`${root.statements?.filter((s) => s.object.value.trim()).length ?? 0} with a value`}</span>
              </div>
              {/* Issue 164 groups values over the retained flat draft. */}
              <AddEntityStatements
                statements={root.statements ?? []}
                change={(statements) => changeRoot({ ...root, statements })}
                removeIcon={cross()}
              />
            </div>
          </div>
          <div className="srcbox">
            <div className="sh">
              {renameChoice ? "Source for Create new" : "Planned source"}
              <span className="sn2">{`${drafts + 1} ${drafts ? "entities" : "entity"}, one transaction`}</span>
            </div>
            <pre className="sc" aria-label="Planned source" tabIndex={0}>
              <Code language="rdfxml">{source}</Code>
            </pre>
          </div>
        </div>
      </div>
      <div className="foot">
        <span>one undoable transaction</span>
        <span>
          {"names and IRIs checked across "}
          <span className="num">
            {(
              check.value?.entityCount ?? snapshot.entities.length
            ).toLocaleString("en-US")}
          </span>
          {" entities"}
        </span>
        <span>the draft survives resizing, detaching and recovery</span>
        {!!value.created?.length && (
          <span className="tag good">
            <span className="gl" />
            created, and selected in Hierarchy
          </span>
        )}
      </div>
    </>
  );
}
