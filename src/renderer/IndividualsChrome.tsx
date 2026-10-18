import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { registerPaneRecovery, usePaneLayout } from "./AdaptivePane";
import "./individuals-reference.css";

function Recovery({ name }: { name: string }) {
  return (
    <section className="individuals-surface pane individuals-recovery">
      <div className="individuals-recovery-header">
        <div className="phead recovery-fallback">
          <span className="name">{name}</span>
        </div>
      </div>
    </section>
  );
}
for (const [id, name] of [
  ["individuals", "Individuals"],
  // craigtrim/axiom#89: Inspector registers its own body at the shared thresholds.
  ["touchpoints", "Touchpoints"],
])
  registerPaneRecovery(id, {
    height: 120,
    Body: () => <Recovery name={name} />,
  });

export function IndividualPaneHeader({
  children,
  recoveryOnly = false,
}: {
  children: ReactNode;
  recoveryOnly?: boolean;
}) {
  const { recovery } = usePaneLayout(),
    anchor = useRef<HTMLSpanElement>(null),
    [target, setTarget] = useState<Element | null>(null);
  useLayoutEffect(() => {
    setTarget(
      recovery
        ? (anchor.current
            ?.closest(".adaptive-pane")
            ?.querySelector(".individuals-recovery-header") ?? null)
        : null,
    );
  }, [recovery]);
  const header = <div className="phead">{children}</div>;
  return (
    <>
      <span ref={anchor} hidden />
      {target ? createPortal(header, target) : !recoveryOnly && header}
    </>
  );
}
export {
  ReasonTag,
  IdentifierTag,
  InferredTag,
  LinkedPill,
  SaveState,
  IndividualsLegend,
} from "./IndividualTokens";
/** A native top-layer popover retains keyboard focus and inherits pane tokens. */
export function IndividualPopover({
  label,
  buttonClass = "btn",
  button,
  children,
  width,
  onOpen,
  align = "start",
  valueList = false,
}: {
  label: string;
  buttonClass?: string;
  button: ReactNode;
  children: ReactNode;
  width?: number;
  onOpen?: () => void;
  align?: "start" | "end";
  valueList?: boolean;
}) {
  const id = useId(),
    trigger = useRef<HTMLButtonElement>(null),
    pop = useRef<HTMLDivElement>(null),
    releaseKeys = useRef<(() => void) | null>(null);
  useLayoutEffect(() => () => releaseKeys.current?.(), []);
  // Both reference layers stay within the window, including at pane zoom (#86).
  const place = () => {
    const button = trigger.current!,
      layer = pop.current!,
      bounds = button.getBoundingClientRect(),
      doc = button.ownerDocument,
      zoom = Number(
        button.closest<HTMLElement>(".adaptive-pane")?.dataset.paneZoom ?? 1,
      ),
      margin = valueList ? 6 : 4;
    const availableWidth =
      (doc.documentElement.clientWidth - margin * 2) / zoom;
    layer.style.maxWidth =
      Math.min(valueList ? 420 : (width ?? 250), availableWidth) + "px";
    layer.style.minWidth = valueList
      ? Math.min(200, availableWidth) + "px"
      : "";
    layer.style.maxHeight =
      Math.min(
        valueList ? 320 : Infinity,
        (doc.documentElement.clientHeight - margin * 2) / zoom,
      ) + "px";
    layer.style.width = valueList
      ? "max-content"
      : Math.min(
          width ?? 250,
          doc.documentElement.clientWidth / zoom - margin * 2,
        ) + "px";
    const size = layer.getBoundingClientRect();
    const left = align === "end" ? bounds.right - size.width : bounds.left;
    const top =
      bounds.bottom + 4 + size.height <=
      doc.documentElement.clientHeight - margin
        ? bounds.bottom + 4
        : bounds.top - 4 - size.height;
    layer.style.left =
      Math.max(
        margin,
        Math.min(left, doc.documentElement.clientWidth - size.width - margin),
      ) /
        zoom +
      "px";
    layer.style.top = Math.max(margin, top) / zoom + "px";
  };
  return (
    <>
      <button
        ref={trigger}
        className={buttonClass}
        aria-label={label}
        popoverTarget={id}
        onClick={(event) => {
          event.stopPropagation();
          onOpen?.();
        }}
      >
        {button}
      </button>
      <div
        ref={pop}
        id={id}
        popover="auto"
        className={"individual-popover" + (valueList ? " vpop" : "")}
        onClick={(event) => event.stopPropagation()}
        role={valueList ? "region" : undefined}
        aria-label={
          valueList
            ? label.replace(/^\d+ more values of /, "Values of ")
            : undefined
        }
        onToggle={(event) => {
          releaseKeys.current?.();
          releaseKeys.current = null;
          if (event.newState === "open") {
            place();
            const doc = event.currentTarget.ownerDocument;
            // Clicking a plain value can leave focus on the document (#86).
            const escape = (e: KeyboardEvent) => {
              if (e.key !== "Escape" || !pop.current?.matches(":popover-open"))
                return;
              e.preventDefault();
              e.stopPropagation();
              pop.current.hidePopover();
              trigger.current?.focus({ preventScroll: true });
            };
            doc.addEventListener("keydown", escape, true);
            releaseKeys.current = () =>
              doc.removeEventListener("keydown", escape, true);
          }
        }}
      >
        {children}
      </div>
    </>
  );
}

export function IndividualIcon({
  name,
}: {
  name: "x" | "first" | "prev" | "next" | "last";
}) {
  const paths = {
    x: "M4 4l8 8M12 4l-8 8",
    first: "M11 3.5 6.5 8 11 12.5M4.6 3.5v9",
    prev: "M10 3.5 5.5 8 10 12.5",
    next: "M6 3.5 10.5 8 6 12.5",
    last: "M5 3.5 9.5 8 5 12.5M11.4 3.5v9",
  };
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
