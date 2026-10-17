import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { registerPaneRecovery, usePaneLayout } from "./AdaptivePane";
import { DetailsBack } from "./DetailsNavigation";
import type { EntitySourceController } from "./EntitySource";
import { useSnapshot } from "./client";
import { SharedMenu } from "./SharedPane";
import "./details.css";

function DetailsRecovery() {
  return (
    <div className="details-pane details-recovery">
      <div className="details-recovery-header">
        <header className="phead details-recovery-fallback">
          <span className="name">Details</span>
        </header>
      </div>
    </div>
  );
}
registerPaneRecovery("details", { height: 120, Body: DetailsRecovery });

/** Portaling the same header preserves navigation context and the controller
 * while AdaptivePane keeps the rest of the pane mounted and inert. */
export function DetailsHeader({
  name,
  source,
  status = "Saved",
  reload,
}: {
  name: string;
  source?: EntitySourceController;
  status?: string;
  reload?: () => void;
}) {
  const { recovery, narrow } = usePaneLayout();
  const anchor = useRef<HTMLSpanElement>(null),
    more = useRef<HTMLButtonElement>(null);
  const [target, setTarget] = useState<Element | null>(null);
  useLayoutEffect(() => {
    setTarget(
      recovery
        ? (anchor.current
            ?.closest(".adaptive-pane")
            ?.querySelector(".details-recovery-header") ?? null)
        : null,
    );
  }, [recovery, narrow]);
  const word =
    source?.state === "pending"
      ? "Source draft"
      : source?.state === "invalid"
        ? "Source will not parse"
        : source?.state === "stale"
          ? "Draft is behind the ontology"
          : status;
  const header: ReactNode = (
    <header className="phead">
      <DetailsBack quiet />
      <span className="name">{name}</span>
      <div className={"state " + (source?.state ?? "clean")}>
        <span className="word" role="status">
          {word}
        </span>
        {source?.draft && (
          <button
            className="btn"
            disabled={source.busy}
            onClick={source.discard}
          >
            {source.state === "stale"
              ? "Discard draft and reload"
              : source.state === "invalid"
                ? "Discard draft"
                : "Discard"}
          </button>
        )}
        {source?.state === "pending" && (
          <button
            className="btn primary"
            disabled={source.busy}
            onClick={() => void source.save()}
          >
            Save source
          </button>
        )}
      </div>
      {/* Issue 85 uses the shared keyboard menu with the reference's text trigger. */}
      {reload && (
        <SharedMenu
          trigger={more}
          label="More"
          triggerContent="More"
          triggerClassName="btn more"
          hidden={narrow}
          items={[{ id: "reload", label: "Reload", run: reload }]}
        />
      )}
      <span className="vh" aria-live="polite" aria-atomic="true">
        {source?.announcement}
      </span>
    </header>
  );
  return (
    <>
      <span ref={anchor} hidden />
      {target ? createPortal(header, target) : header}
    </>
  );
}

export function DetailsFooter({ iri }: { iri: string }) {
  const s = useSnapshot()!,
    { shallow } = usePaneLayout();
  return (
    <footer className="pfoot" hidden={shallow}>
      <span>{iri}</span>
      <span className="od-fill" />
      <span>{"revision " + s.version}</span>
    </footer>
  );
}
