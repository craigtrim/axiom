import { useEffect, useRef, useState, type ReactNode } from "react";
import { installDialogAccessKeys } from "./access-keys";
import { createPortal } from "react-dom";
import { useSnapshot, request, command, focusedDocument } from "./client";
import { branches, NS, THING, humanise, local } from "../domain/model";
export function Modal({
  title,
  close,
  children,
  document: owner,
  onClosed,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
  document?: Document;
  onClosed?: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    target = useRef(owner ?? focusedDocument());
  useEffect(() => {
    const d = ref.current!,
      previous = target.current.activeElement as HTMLElement | null;
    d.showModal();
    const removeAccess = installDialogAccessKeys(d);
    return () => {
      removeAccess();
      d.close();
      previous?.focus();
      onClosed?.();
    };
  }, []);
  return createPortal(
    <dialog
      ref={ref}
      className="modal"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      aria-label={title}
    >
      <header>
        <h2>{title}</h2>
        <button aria-label="Close dialog" onClick={close}>
          ×
        </button>
      </header>
      {children}
    </dialog>,
    target.current.body,
  );
}
export type EntityDialog = "delete";
export function EditDialog({
  close,
}: {
  kind: EntityDialog;
  close: () => void;
}) {
  const s = useSnapshot()!,
    entity = s.entities.find((e) => e.iri === s.selected),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit() {
    if (!entity) return;
    setBusy(true);
    setError("");
    try {
      await request("deleteClass", { iri: entity.iri });
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Delete class" close={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <p>
          Delete <strong>{entity?.name ?? "the selected class"}</strong> and its
          asserted schema references? Generated individuals are preserved. You
          can undo this change.
        </p>
        {error && (
          <p className="validation-error" role="alert">
            {error}
          </p>
        )}
        <footer>
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button type="submit" className="danger" disabled={busy || !entity}>
            {busy ? "Deleting..." : "Delete"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
export function Palette({
  items,
  close,
  run,
}: {
  items: {
    id: string;
    label: string;
    shortcut?: string;
    enabled?: boolean;
    title?: string;
  }[];
  close: () => void;
  run: (id: string) => void;
}) {
  const [filter, setFilter] = useState(""),
    [selected, setSelected] = useState(0),
    matches = items.filter((i) =>
      filter
        .toLowerCase()
        .split(/\s+/)
        .every((word) => i.label.toLowerCase().includes(word)),
    );
  return (
    <Modal title="Command palette" close={close}>
      <input
        autoFocus
        aria-label="Find a command"
        placeholder="Type a command"
        value={filter}
        onChange={(e) => {
          setFilter(e.target.value);
          setSelected(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setSelected(Math.min(matches.length - 1, selected + 1));
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setSelected(Math.max(0, selected - 1));
          }
          if (e.key === "Enter" && matches[selected]) {
            e.preventDefault();
            if (matches[selected].enabled === false) return;
            close();
            run(matches[selected].id);
          }
        }}
      />
      <div className="palette-results" role="listbox" aria-label="Commands">
        {matches.map((item, i) => (
          <button
            key={item.id}
            role="option"
            aria-selected={i === selected}
            aria-disabled={item.enabled === false || undefined}
            title={item.title}
            onMouseMove={() => setSelected(i)}
            onClick={() => {
              if (item.enabled === false) return;
              close();
              run(item.id);
            }}
          >
            {item.label}
            <kbd>{item.shortcut}</kbd>
          </button>
        ))}
        {!matches.length && <p>No matching commands.</p>}
      </div>
    </Modal>
  );
}
