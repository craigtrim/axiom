import { useSyncExternalStore } from "react";
import { panel, savePanel, command } from "./client";
import {
  emptyFindDraft,
  titleCaseQuery,
  type FindCreationDraft,
  type FindCreationKind,
} from "../shared/find-create";
import {
  defaultFindOptions,
  readFindOptions,
  type FindOptions,
} from "../shared/find";
let current:
  | {
      options: FindOptions;
      selected: string;
      recent: string[];
      draft: FindCreationDraft;
      created: string[];
    }
  | undefined;
const listeners = new Set<() => void>();
const creationDrafts = new Map<string, FindCreationDraft>();
let creationKey = "";
export function openFindCreation(
  origin: NonNullable<FindCreationDraft["origin"]>,
  kind: FindCreationKind = "Class",
) {
  const old = findState();
  const key = JSON.stringify([
    old.options.text.trim(),
    origin.door,
    origin.target,
  ]);
  if (creationKey && creationKey !== key)
    creationDrafts.set(creationKey, structuredClone(old.draft));
  const draft =
    creationKey === key
      ? old.draft
      : (creationDrafts.get(key) ?? {
          ...emptyFindDraft(old.options.text),
          kind,
          origin,
          parents: origin.target ? [origin.target] : [],
        });
  creationKey = key;
  current = { ...old, draft };
  for (const fn of listeners) fn();
}
export function findState() {
  if (current) return current;
  const options = readFindOptions({
    ...panel<object>("find.view", {}),
  });
  if (options.sort === "iri") options.sort = "type";
  if (![25, 50, 100, 200].includes(options.limit)) options.limit = 50;
  return (current = {
    options,
    selected: "",
    recent: panel<string[]>("find.recent", []),
    draft: emptyFindDraft(readFindOptions(panel("find.view", {})).text),
    created: [],
  });
}
export const useFindState = () =>
  useSyncExternalStore((fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, findState);
export function updateFind(change: Partial<FindOptions>, selected = "") {
  const old = findState();
  if (
    change.text !== undefined &&
    change.text !== old.options.text &&
    creationKey
  ) {
    creationDrafts.set(creationKey, structuredClone(old.draft));
    creationKey = "";
  }
  const options = readFindOptions({
    ...old.options,
    offset: 0,
    revealIri: undefined,
    ...change,
  });
  const draft =
    options.text !== old.options.text && !old.draft.labelEdited
      ? { ...old.draft, label: titleCaseQuery(options.text) }
      : old.draft;
  current = { ...old, options, selected, draft };
  savePanel("find.view", options, false);
  for (const fn of listeners) fn();
}
export function rememberFind() {
  const old = findState(),
    text = old.options.text.trim();
  if (!text) return;
  const recent = [text, ...old.recent.filter((q) => q !== text)].slice(0, 10);
  current = { ...old, recent };
  savePanel("find.recent", recent, false);
  for (const fn of listeners) fn();
}
export function selectFind(iri: string) {
  current = { ...findState(), selected: iri };
  for (const fn of listeners) fn();
}
export function updateFindDraft(change: Partial<FindCreationDraft>) {
  const old = findState();
  current = { ...old, draft: { ...old.draft, ...change } };
  for (const fn of listeners) fn();
}
export function markFindCreated(iri: string, related: string[] = []) {
  const old = findState();
  creationDrafts.delete(creationKey);
  creationKey = "";
  current = {
    ...old,
    draft: emptyFindDraft(),
    created: [...new Set([...old.created, ...related, iri])],
  };
  for (const fn of listeners) fn();
}

let epoch: number | undefined;
export function syncFindEpoch(value: number) {
  if (epoch === value) return;
  epoch = value;
  creationDrafts.clear();
  creationKey = "";
  if (current) {
    current = {
      ...current,
      selected: "",
      draft: emptyFindDraft(current.options.text),
      created: [],
    };
    for (const fn of listeners) fn();
  }
}

export function openSimilar(name: string, iri: string) {
  updateFind({
    ...defaultFindOptions,
    limit: findState().options.limit,
    text: name,
    fields: ["name"],
    kinds: ["classes", "individuals"],
    excludeIri: iri,
  });
  rememberFind();
  command("view.find");
}
