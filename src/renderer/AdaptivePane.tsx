import {
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { suspendMenus } from "./access-keys";

export interface PaneLayout {
  width: number;
  height: number;
  narrow: boolean;
  shallow: boolean;
  compact: boolean;
  recovery: boolean;
  mode: "expanded" | "narrow" | "shallow" | "constrained";
}
const initial: PaneLayout = {
  width: 1000,
  height: 600,
  narrow: false,
  shallow: false,
  compact: false,
  recovery: false,
  mode: "expanded",
};
const PaneContext = createContext(initial);
export const usePaneLayout = () => useContext(PaneContext);

export function measurePane(
  width: number,
  height: number,
  previous?: PaneLayout,
): PaneLayout {
  const narrow = width < (previous?.narrow ? 616 : 600);
  const shallow = height < (previous?.shallow ? 416 : 400);
  return {
    width,
    height,
    narrow,
    shallow,
    compact: narrow || shallow,
    recovery: width < 240 || height < (narrow ? 210 : 180),
    mode: narrow
      ? shallow
        ? "constrained"
        : "narrow"
      : shallow
        ? "shallow"
        : "expanded",
  };
}

export function AdaptivePane({
  children,
  name,
  paneId,
  visual = false,
  maximize,
}: {
  children: ReactNode;
  name: string;
  paneId: string;
  visual?: boolean;
  maximize: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const recover = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const [layout, setLayout] = useState(initial);
  useLayoutEffect(() => {
    const host = root.current!;
    const win = host.ownerDocument.defaultView!;
    const update = () => {
      const { width, height } = host.getBoundingClientRect();
      // Hidden tabs report zero. Retain their last useful presentation.
      if (width < 1 || height < 1) return;
      setLayout((old) => {
        const next = measurePane(Math.round(width), Math.round(height), old);
        if (visual) next.recovery = false;
        if (next.recovery && !old.recovery) {
          const focused = host.ownerDocument
            .activeElement as HTMLElement | null;
          if (focused && content.current?.contains(focused))
            previousFocus.current = focused;
        }
        return old.width === next.width && old.height === next.height
          ? old
          : next;
      });
    };
    const observer = new win.ResizeObserver(update);
    observer.observe(host);
    update();
    return () => observer.disconnect();
  }, [visual]);
  const recoveryFocused =
    !!recover.current &&
    recover.current.ownerDocument.activeElement === recover.current;
  useLayoutEffect(() => {
    if (layout.recovery && previousFocus.current) {
      recover.current?.focus();
    } else if (!layout.recovery && recoveryFocused) {
      const previous = previousFocus.current;
      const target =
        previous?.isConnected && previous.checkVisibility()
          ? previous
          : content.current?.querySelector<HTMLElement>(
              'button:not([hidden]):not(:disabled), input:not(:disabled), [tabindex="0"]',
            );
      target?.focus();
      previousFocus.current = null;
    }
  }, [layout.recovery]);
  return (
    <PaneContext.Provider value={layout}>
      <div
        ref={root}
        className="adaptive-pane"
        data-pane-layout={layout.mode}
        data-pane-compact={layout.compact}
        data-pane-narrow={layout.narrow}
        data-pane-shallow={layout.shallow}
        data-pane-recovery={layout.recovery}
        data-pane-visual={visual}
        data-pane-name={name}
        data-pane-id={paneId}
      >
        <div
          ref={content}
          className="adaptive-pane-content"
          inert={layout.recovery || undefined}
          aria-hidden={layout.recovery || undefined}
        >
          {children}
        </div>
        <div
          hidden={!layout.recovery}
          className="pane-recovery"
          role="region"
          aria-label={name + " pane"}
        >
          <strong>{name}</strong>
          <button ref={recover} onClick={maximize}>
            Maximize pane
          </button>
          <span className="muted">Your work is retained.</span>
        </div>
      </div>
    </PaneContext.Provider>
  );
}

/** The secondary controls stay mounted when they move into native popover overflow. */
export function PaneToolbar({
  children,
  secondary,
  label,
  className = "",
  collapseAt = 1200,
}: {
  children: ReactNode;
  secondary?: ReactNode;
  label: string;
  className?: string;
  collapseAt?: number;
}) {
  const { width, compact, recovery } = usePaneLayout();
  const overflow = compact || width < collapseAt;
  const id = useId();
  const menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const focusedInside = !!menu.current?.contains(
    menu.current.ownerDocument.activeElement,
  );
  const position = () => {
    if (!menu.current || !trigger.current) return;
    const win = trigger.current.ownerDocument.defaultView!;
    const box = trigger.current.getBoundingClientRect();
    const w = Math.min(340, win.innerWidth - 16);
    Object.assign(menu.current.style, {
      width: w + "px",
      left: Math.max(8, Math.min(box.right - w, win.innerWidth - w - 8)) + "px",
      top:
        Math.max(
          8,
          Math.min(
            box.bottom + 4,
            win.innerHeight -
              Math.min(320, menu.current.scrollHeight || 200) -
              8,
          ),
        ) + "px",
      maxHeight: Math.max(100, win.innerHeight - 24) + "px",
    });
  };
  useLayoutEffect(() => {
    if (
      overflow &&
      !recovery &&
      focusedInside &&
      menu.current &&
      !menu.current.matches(":popover-open")
    ) {
      position();
      menu.current.showPopover();
    }
    if (!overflow || recovery) {
      if (menu.current?.matches(":popover-open")) menu.current.hidePopover();
      menu.current?.removeAttribute("style");
      setOpen(false);
    }
  }, [overflow, recovery]);
  useEffect(() => {
    if (!open || !menu.current) return;
    const doc = menu.current.ownerDocument;
    const resume = suspendMenus(doc);
    const close = () => menu.current?.hidePopover();
    doc.defaultView!.addEventListener("resize", close);
    return () => {
      resume();
      doc.defaultView!.removeEventListener("resize", close);
    };
  }, [open]);
  return (
    <div
      className={"panel-toolbar pane-toolbar " + className}
      role="group"
      aria-label={label}
    >
      <div className="pane-primary">{children}</div>
      {secondary && (
        <>
          <button
            ref={trigger}
            className="pane-more"
            hidden={!overflow}
            popoverTarget={id}
            aria-label={"More " + label.toLowerCase()}
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={position}
          >
            More
          </button>
          <div
            ref={menu}
            id={id}
            className="pane-secondary"
            popover={overflow ? "auto" : undefined}
            role={overflow ? "dialog" : "group"}
            aria-label={label + " options"}
            onToggle={(event) => {
              const showing = event.newState === "open";
              setOpen(showing);
              if (showing) {
                position();
                if (
                  !menu.current?.contains(
                    menu.current.ownerDocument.activeElement,
                  )
                )
                  menu.current
                    ?.querySelector<HTMLElement>(
                      "button:not(:disabled), input:not(:disabled), select:not(:disabled)",
                    )
                    ?.focus();
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") event.stopPropagation();
            }}
            onClick={(event) => {
              if (overflow && (event.target as HTMLElement).closest("button"))
                menu.current?.hidePopover();
            }}
          >
            {secondary}
          </div>
        </>
      )}
    </div>
  );
}

/** Secondary content is always mounted; explicit expansion survives pane changes. */
export function PaneDetails({
  title,
  children,
  className = "",
  always = false,
}: {
  title: ReactNode;
  children: ReactNode;
  className?: string;
  always?: boolean;
}) {
  const { compact } = usePaneLayout();
  const ref = useRef<HTMLDetailsElement>(null);
  const [expanded, setExpanded] = useState(false);
  const focused = !!ref.current
    ?.querySelector(".pane-details-body")
    ?.contains(ref.current.ownerDocument.activeElement);
  const open = (!compact && !always) || expanded || focused;
  useEffect(() => {
    if (focused && compact) setExpanded(true);
  }, [compact, focused]);
  return (
    <details
      ref={ref}
      className={
        "pane-details " + (always ? "pane-details-always " : "") + className
      }
      open={open}
    >
      <summary
        onClick={(event) => {
          event.preventDefault();
          if (compact || always) setExpanded(!open);
        }}
      >
        {title}
      </summary>
      <div className="pane-details-body">{children}</div>
    </details>
  );
}
