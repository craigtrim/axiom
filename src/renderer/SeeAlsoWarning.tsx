import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { Term } from "../domain/model";
import {
  defaultSeeAlsoWarnings,
  readSeeAlsoWarnings,
  seeAlsoOccurrence,
  type SeeAlsoMatches,
  type SeeAlsoWarningSettings,
} from "../shared/seealso-warnings";
import {
  command,
  onCommand,
  panel,
  report,
  request,
  savePanel,
  useSnapshot,
} from "./client";
import { Modal } from "./Dialogs";
import "./seealso-warning.css";

const settingsKey = "warnings.seeAlso";
const useSettings = () =>
  useSyncExternalStore(
    (notify) =>
      onCommand((id) => {
        if (id === settingsKey || id === "workspace.preferences") notify();
      }),
    () => panel(settingsKey, defaultSeeAlsoWarnings),
  );
function saveSettings(settings: SeeAlsoWarningSettings) {
  savePanel(settingsKey, readSeeAlsoWarnings(settings), false);
  command(settingsKey);
}

/** Advisory only: no interaction with the editor's validation or save path. */
export function SeeAlsoWarning({
  subject,
  term,
}: {
  subject?: string;
  term: Pick<Term, "literal" | "value">;
}) {
  const snapshot = useSnapshot()!;
  const settings = useSettings();
  const occurrence = seeAlsoOccurrence(
    snapshot.ontology.iri ?? snapshot.ontology.namespace,
    subject ?? "",
    term,
  );
  const enabled =
    settings.enabled &&
    !!subject &&
    !!term.value.trim() &&
    !settings.dismissed.includes(occurrence);
  const key = JSON.stringify([
    occurrence,
    snapshot.datasetEpoch,
    snapshot.version,
  ]);
  const [result, setResult] = useState<{
    key: string;
    matches: SeeAlsoMatches;
  }>();
  const anchor = useRef<HTMLSpanElement>(null),
    popup = useRef<HTMLDivElement>(null);
  const id = useId();
  const place = () => {
    const button = anchor.current?.querySelector("button"),
      box = popup.current;
    if (!button || !box) return;
    const rect = button.getBoundingClientRect(),
      win = button.ownerDocument.defaultView!;
    const scale = Number(
      button.closest<HTMLElement>(".adaptive-pane")?.dataset.paneZoom ?? 1,
    );
    const width = Math.min(360 * scale, win.innerWidth - 16);
    box.style.width = width / scale + "px";
    box.style.maxHeight = (win.innerHeight - 16) / scale + "px";
    const height = box.getBoundingClientRect().height;
    Object.assign(box.style, {
      left:
        Math.max(8, Math.min(rect.right - width, win.innerWidth - width - 8)) /
          scale +
        "px",
      top:
        Math.max(8, Math.min(rect.bottom + 4, win.innerHeight - height - 8)) /
          scale +
        "px",
    });
  };
  useEffect(() => {
    const win = anchor.current?.ownerDocument.defaultView;
    if (!win) return;
    const reposition = () => {
      if (popup.current?.matches(":popover-open")) place();
    };
    win.addEventListener("resize", reposition);
    win.addEventListener("scroll", reposition, true);
    return () => {
      win.removeEventListener("resize", reposition);
      win.removeEventListener("scroll", reposition, true);
    };
  }, [result]);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void request<SeeAlsoMatches>("seeAlsoMatches", {
        iri: subject,
        value: term.value,
        literal: term.literal,
        datasetEpoch: snapshot.datasetEpoch,
      })
        .then((matches) => {
          if (!cancelled) setResult({ key, matches });
        })
        .catch(() => {
          if (!cancelled) setResult(undefined);
        });
    }, 100);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key, enabled]);
  const matches = enabled && result?.key === key ? result.matches : undefined;
  const dismiss = (all: boolean) => {
    const current = panel(settingsKey, defaultSeeAlsoWarnings);
    // Return focus before removing the warning's controls.
    popup.current?.hidePopover();
    anchor.current?.parentElement
      ?.querySelector<HTMLInputElement>("input")
      ?.focus({ preventScroll: true });
    saveSettings(
      all
        ? { ...current, enabled: false }
        : { ...current, dismissed: [...current.dismissed, occurrence] },
    );
    report(
      all
        ? "Shared seeAlso warnings turned off. Change this in Edit > Settings > Warnings."
        : "Warning dismissed for this entity and value.",
    );
  };
  if (!matches?.total) return null;
  return (
    <span ref={anchor} className="seealso-warning">
      <button
        type="button"
        className="seealso-warning-trigger"
        popoverTarget={id}
        aria-label="Shared seeAlso value warning"
        title={`Also used by ${matches.total} other ${matches.total === 1 ? "entity" : "entities"}. Allowed; review or dismiss.`}
        onClick={place}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            d="M12 3 2 21h20L12 3Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path
            d="M12 9v5m0 3v.3"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>
      <div
        ref={popup}
        id={id}
        popover="auto"
        className="seealso-warning-popup"
        role="group"
        aria-label="Shared seeAlso value"
        onToggle={(event) => {
          if (event.newState === "open") place();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            popup.current?.hidePopover();
            anchor.current?.querySelector<HTMLButtonElement>("button")?.focus();
          }
        }}
      >
        <strong>Shared seeAlso value</strong>
        <p>
          This value is also recorded on {matches.total} other{" "}
          {matches.total === 1 ? "entity" : "entities"}. Shared values are
          allowed; you can keep editing and save normally.
        </p>
        <ul>
          {matches.entities.map((entity) => (
            <li key={entity.iri}>
              <span>{entity.label}</span>
              <small>{entity.iri}</small>
            </li>
          ))}
        </ul>
        {matches.total > matches.entities.length && (
          <p>And {matches.total - matches.entities.length} more.</p>
        )}
        {term.literal && (
          <p className="seealso-warning-note">
            Text is compared without case or surrounding spaces, across language
            tags and datatypes.
          </p>
        )}
        <div className="seealso-warning-actions">
          <button type="button" onClick={() => dismiss(false)}>
            Dismiss this warning
          </button>
          <button type="button" onClick={() => dismiss(true)}>
            Don’t warn about shared seeAlso values
          </button>
        </div>
      </div>
    </span>
  );
}

export function WarningSettings({ close }: { close(): void }) {
  const settings = useSettings();
  return (
    <Modal title="Warnings" close={close}>
      <p>Warnings are advisory. They never prevent saving.</p>
      <label className="seealso-warning-setting">
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(event) =>
            saveSettings({ ...settings, enabled: event.currentTarget.checked })
          }
        />{" "}
        Warn when a seeAlso value is shared by other entities
      </label>
      <p>Applies to current and future workspaces on this computer.</p>
      <p>
        {settings.dismissed.length} individual{" "}
        {settings.dismissed.length === 1
          ? "warning dismissed"
          : "warnings dismissed"}
        . Each dismissal applies to that entity and value in its ontology.
      </p>
      <button
        type="button"
        disabled={!settings.dismissed.length}
        onClick={() => saveSettings({ ...settings, dismissed: [] })}
      >
        Restore dismissed warnings
      </button>
    </Modal>
  );
}
