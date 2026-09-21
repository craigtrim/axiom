import { useSyncExternalStore } from "react";
import { panel, savePanel, command } from "./client";
import {
  defaultFindOptions,
  readFindOptions,
  type FindOptions,
} from "../shared/find";
let current:
  { options: FindOptions; selected: string; recent: string[] } | undefined;
const listeners = new Set<() => void>();
export function findState() {
  return (current ??= {
    options: readFindOptions(panel("find.view", {})),
    selected: "",
    recent: panel<string[]>("find.recent", []),
  });
}
export const useFindState = () =>
  useSyncExternalStore((fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, findState);
export function updateFind(change: Partial<FindOptions>, selected = "") {
  const old = findState();
  const options = readFindOptions({ ...old.options, offset: 0, ...change });
  current = { ...old, options, selected };
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

let epoch: number | undefined;
export function syncFindEpoch(value: number) {
  if (epoch === value) return;
  epoch = value;
  if (current) selectFind("");
}

export function openSimilar(name: string, iri: string) {
  updateFind({
    ...defaultFindOptions,
    text: name,
    match: "cosine",
    fields: ["name"],
    kinds: ["classes", "individuals"],
    excludeIri: iri,
  });
  rememberFind();
  command("view.find");
}
