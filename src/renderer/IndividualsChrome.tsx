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
  ["inspector", "Inspector"],
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
}: {
  label: string;
  buttonClass?: string;
  button: ReactNode;
  children: ReactNode;
  width?: number;
  onOpen?: () => void;
}) {
  const id = useId(),
    trigger = useRef<HTMLButtonElement>(null),
    pop = useRef<HTMLDivElement>(null);
  return (
    <>
      <button
        ref={trigger}
        className={buttonClass}
        aria-label={label}
        popoverTarget={id}
        onClick={() => {
          const b = trigger.current!.getBoundingClientRect(),
            doc = trigger.current!.ownerDocument;
          const zoom = Number(
            trigger.current!.closest<HTMLElement>(".adaptive-pane")?.dataset
              .paneZoom ?? 1,
          );
          const w = Math.min(width ?? 250, doc.documentElement.clientWidth - 8);
          Object.assign(pop.current!.style, {
            left:
              Math.max(
                4,
                Math.min(b.left, doc.documentElement.clientWidth - w - 4),
              ) /
                zoom +
              "px",
            top: (b.bottom + 4) / zoom + "px",
            width: w / zoom + "px",
          });
          onOpen?.();
        }}
      >
        {button}
      </button>
      <div
        ref={pop}
        id={id}
        popover="auto"
        className="individual-popover"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            pop.current?.hidePopover();
            trigger.current?.focus();
          }
        }}
      >
        {children}
      </div>
    </>
  );
}
