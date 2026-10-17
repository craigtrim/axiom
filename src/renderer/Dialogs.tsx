// Issue 87 moves the installed-menu palette to ChromePalette; entity dialogs remain here.
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
      <div className="modal-body">{children}</div>
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
