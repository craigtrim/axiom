import { useSyncExternalStore } from "react";
import { rememberDocumentDraft } from "./editor-drafts";
import { request } from "./client";
import type { SourceDocument } from "../shared/source";
export interface SourceDraft {
  loaded: SourceDocument;
  text: string;
}
let draft: SourceDraft | undefined;
let applying: Promise<unknown> | undefined;
const listeners = new Set<() => void>();
export const useSourceDraft = () =>
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => draft,
  );
export function setSourceDraft(next?: SourceDraft) {
  draft = next && next.text !== next.loaded.text ? next : undefined;
  rememberDocumentDraft(
    "source",
    draft ? { flush: applySourceDraft, discard: () => setSourceDraft() } : null,
  );
  for (const fn of listeners) fn();
}
export function applySourceDraft(): Promise<unknown> {
  if (applying) return applying;
  if (!draft) return Promise.resolve();
  const pending = draft;
  applying = request("applySource", { ...pending.loaded, text: pending.text })
    .then((result) => {
      if (draft === pending) setSourceDraft();
      return result;
    })
    .finally(() => {
      applying = undefined;
    });
  return applying;
}
