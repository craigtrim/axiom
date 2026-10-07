import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { registerPaneRecovery, usePaneLayout } from "./AdaptivePane";
import { DetailsBack } from "./DetailsNavigation";
import type { EntitySourceController } from "./EntitySource";
import { useSnapshot } from "./client";
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
    more = useRef<HTMLButtonElement>(null),
    menu = useRef<HTMLDivElement>(null);
  const [target, setTarget] = useState<Element | null>(null);
  const id = useId();
  useLayoutEffect(() => {
    setTarget(
      recovery
        ? (anchor.current
            ?.closest(".adaptive-pane")
            ?.querySelector(".details-recovery-header") ?? null)
        : null,
    );
    if (menu.current?.matches(":popover-open")) menu.current.hidePopover();
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
      {reload && (
        <>
          <button
            ref={more}
            className="btn more"
            hidden={narrow}
            popoverTarget={id}
            aria-label="More entity actions"
            onClick={() => {
              const box = more.current!.getBoundingClientRect();
              const scale = Number(
                more.current!.closest<HTMLElement>(".adaptive-pane")?.dataset
                  .paneZoom ?? 1,
              );
              Object.assign(menu.current!.style, {
                top: (box.bottom + 4) / scale + "px",
                left: Math.max(4, (box.right - 130) / scale) + "px",
              });
            }}
          >
            More
          </button>
          <div
            ref={menu}
            id={id}
            popover="auto"
            className="details-more-menu"
            role="group"
            aria-label="Entity actions options"
          >
            <button
              className="btn"
              onClick={() => {
                menu.current?.hidePopover();
                reload();
                more.current?.focus();
              }}
            >
              Reload
            </button>
          </div>
        </>
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
