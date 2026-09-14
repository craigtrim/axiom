import {
  useEffect,
  useLayoutEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  state,
  useSnapshot,
  request,
  focusedDocument,
  workbenchDocuments,
} from "./client";
import { THING } from "../domain/model";
const renameEvent = "axiom:inline-rename",
  cancelEvent = "axiom:cancel-inline-rename";

export function startInlineRename(
  iri: string,
  origin?: { document: Document; panel: string },
) {
  if (iri === THING || !state?.entities.some((e) => e.iri === iri))
    return false;
  const doc = origin?.document ?? focusedDocument(),
    panel =
      origin?.panel ??
      (doc.activeElement as HTMLElement | null)?.closest<HTMLElement>(
        "[data-panel]",
      )?.dataset.panel;
  const candidates = [...workbenchDocuments]
    .flatMap((d) => [...d.querySelectorAll<HTMLElement>("[data-rename-iri]")])
    .filter(
      (el) =>
        el.dataset.renameIri === iri &&
        el.getBoundingClientRect().width > 0 &&
        el.getBoundingClientRect().height > 0 &&
        !el.closest("dialog"),
    );
  candidates.sort((a, b) => {
    const score = (el: HTMLElement) =>
      Number(el.ownerDocument === doc) * 10 +
      Number(el.closest<HTMLElement>("[data-panel]")?.dataset.panel === panel) *
        5;
    return score(b) - score(a);
  });
  const target = candidates[0];
  if (!target) return false;
  const existing = target
    .closest("[data-panel]")
    ?.querySelector<HTMLInputElement>("[data-inline-rename] input");
  if (
    existing &&
    existing.parentElement?.getAttribute("data-inline-rename") === iri
  ) {
    existing.focus();
    existing.select();
    return true;
  }
  for (const d of workbenchDocuments) d.dispatchEvent(new Event(cancelEvent));
  target.scrollIntoView({ block: "nearest", inline: "nearest" });
  return !target.dispatchEvent(new Event(renameEvent, { cancelable: true }));
}
export function onInlineRename(target: HTMLElement, begin: () => void) {
  const handle = (event: Event) => {
    event.preventDefault();
    begin();
  };
  target.addEventListener(renameEvent, handle);
  return () => target.removeEventListener(renameEvent, handle);
}

export function InlineRenameInput({
  iri,
  name,
  finish,
}: {
  iri: string;
  name: string;
  finish: (restoreFocus: boolean) => void;
}) {
  const snapshot = useSnapshot(),
    [value, setValue] = useState(name),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null),
    busy = useRef(false),
    done = useRef(false),
    epoch = useRef(snapshot!.datasetEpoch),
    id = useId();
  const end = (restore: boolean) => {
    if (done.current) return;
    done.current = true;
    finish(restore);
  };
  useEffect(() => {
    const el = input.current!,
      doc = el.ownerDocument;
    el.focus();
    el.select();
    const cancel = () => end(false);
    doc.addEventListener(cancelEvent, cancel);
    return () => {
      done.current = true;
      doc.removeEventListener(cancelEvent, cancel);
    };
  }, []);
  useEffect(() => {
    if (
      snapshot?.datasetEpoch !== epoch.current ||
      !snapshot.entities.some((e) => e.iri === iri)
    )
      end(false);
  }, [snapshot?.datasetEpoch, snapshot?.entities]);
  const submit = async (restore: boolean) => {
    if (done.current || busy.current) return;
    if (value.trim() === name) {
      end(restore);
      return;
    }
    if (state?.datasetEpoch !== epoch.current) {
      end(false);
      return;
    }
    busy.current = true;
    setSaving(true);
    setError("");
    try {
      await request("rename", {
        iri,
        name: value,
        datasetEpoch: epoch.current,
      });
      end(restore);
    } catch (e) {
      if (!done.current) {
        setError(
          (e as Error).message.replace(
            /^Error invoking remote method '[^']+': Error: /,
            "",
          ),
        );
        if (restore) input.current?.focus();
      }
    } finally {
      busy.current = false;
      if (!done.current) setSaving(false);
    }
  };
  return (
    <span
      className="inline-rename"
      data-inline-rename={iri}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
    >
      <input
        ref={input}
        aria-label="Rename entity"
        title="Enter saves; Escape cancels"
        value={value}
        maxLength={256}
        readOnly={saving}
        aria-busy={saving}
        aria-invalid={!!error}
        aria-describedby={error ? id : undefined}
        onChange={(e) => {
          setValue(e.target.value);
          setError("");
        }}
        onBlur={() => void submit(false)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.nativeEvent.isComposing) return;
          if (e.key === "Escape") {
            e.preventDefault();
            if (!busy.current) end(true);
          }
          if (e.key === "Enter") {
            e.preventDefault();
            void submit(true);
          }
        }}
      />
      {error && (
        <span className="inline-rename-error" id={id} role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
export function EditableEntityName({
  iri,
  name,
  children,
  className = "",
}: {
  iri: string;
  name: string;
  children?: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null),
    [editing, setEditing] = useState(false);
  useLayoutEffect(
    () => onInlineRename(ref.current!, () => setEditing(true)),
    [],
  );
  const finish = (restore: boolean) => {
    setEditing(false);
    if (restore) {
      const el = ref.current;
      el?.ownerDocument.defaultView?.requestAnimationFrame(() => {
        if (el?.isConnected)
          (
            el.closest<HTMLElement>('[role="treeitem"],[role="gridcell"]') ?? el
          ).focus();
      });
    }
  };
  return (
    <span
      ref={ref}
      className={className + " editable-entity-name"}
      data-rename-iri={iri}
      tabIndex={-1}
    >
      {editing ? (
        <InlineRenameInput iri={iri} name={name} finish={finish} />
      ) : (
        (children ?? name)
      )}
    </span>
  );
}
