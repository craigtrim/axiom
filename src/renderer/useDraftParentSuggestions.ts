import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildParentPrompt,
  parentContext,
  type ParentDraft,
} from "../shared/parent-suggestions";
import type { SuggestionRun } from "../shared/suggestions";
import type { Snapshot } from "../shared/protocol";
import { useAssistantProvider } from "./assistant-provider";

export function useDraftParentSuggestions(
  snapshot: Snapshot,
  draft: ParentDraft,
  completed: () => void,
) {
  const [provider, setProvider] = useAssistantProvider();
  const [entry, setEntry] = useState<SuggestionRun>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sentPrompt, setSentPrompt] = useState("");
  const active = useRef<string | undefined>(undefined);
  const onComplete = useRef(completed);
  onComplete.current = completed;
  const key = JSON.stringify([
    draft.label,
    draft.comment,
    draft.datasetEpoch,
    provider,
  ]);
  const preview = useMemo(() => {
    if (!draft.label.trim()) return { prompt: "", error: "" };
    try {
      return {
        prompt: buildParentPrompt(parentContext(snapshot, draft)),
        error: "",
      };
    } catch (e) {
      return { prompt: "", error: (e as Error).message };
    }
  }, [key, JSON.stringify(draft.parents), snapshot.version]);
  useEffect(() => {
    setEntry(undefined);
    setError("");
    setSentPrompt("");
    setBusy(false);
    return () => {
      const id = active.current;
      active.current = undefined;
      if (id) void window.axiom.suggestions.cancel(id).catch(() => {});
    };
  }, [key]);
  const generate = async (bypassCache = false) => {
    if (active.current || !preview.prompt) return;
    const id = crypto.randomUUID();
    active.current = id;
    setBusy(true);
    setEntry(undefined);
    setError("");
    setSentPrompt(preview.prompt);
    try {
      const result = await window.axiom.suggestions.run({
        bypassCache,
        id,
        iri: "",
        mode: "parents",
        provider,
        draft,
      });
      if (active.current === id) {
        setEntry(result);
        onComplete.current();
      }
    } catch (e) {
      if (active.current === id) {
        setError((e as Error).message);
        const runs = await window.axiom.suggestions.history().catch(() => []);
        if (active.current === id) setEntry(runs.find((r) => r.id === id));
      }
    } finally {
      if (active.current === id) {
        active.current = undefined;
        setBusy(false);
      }
    }
  };
  return {
    provider,
    setProvider,
    entry,
    busy,
    generate,
    prompt: entry?.prompt || sentPrompt || preview.prompt,
    error: error || entry?.error || preview.error,
    setError,
    assistant: (entry?.provider ?? provider) === "codex" ? "Codex" : "Claude",
  };
}
