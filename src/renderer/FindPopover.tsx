import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { usePaneLayout } from "./AdaptivePane";
import { suspendMenus } from "./access-keys";

/** A persistent disclosure: resizing repositions it without closing the user's work. */
export function FindPopover({
  label,
  children,
  face,
  className = "",
  triggerRef,
}: {
  label: string;
  children: ReactNode;
  face?: ReactNode;
  className?: string;
  triggerRef?: RefObject<HTMLButtonElement | null>;
}) {
  const id = useId(),
    ownTrigger = useRef<HTMLButtonElement>(null);
  const trigger = triggerRef ?? ownTrigger,
    body = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const { width, height, recovery } = usePaneLayout();
  const reopen = useRef(false);
  const position = () => {
    if (!body.current || !trigger.current) return;
    const button = trigger.current,
      win = button.ownerDocument.defaultView!;
    const scale = Number(
      button.closest<HTMLElement>(".adaptive-pane")?.dataset.paneZoom ?? 1,
    );
    const rect = button.getBoundingClientRect();
    const w = Math.min(320, win.innerWidth / scale - 16);
    Object.assign(body.current.style, {
      width: w + "px",
      maxHeight: Math.max(24, win.innerHeight / scale - 24) + "px",
      left:
        Math.max(
          8,
          Math.min(rect.right / scale - w, win.innerWidth / scale - w - 8),
        ) + "px",
      top:
        Math.max(
          8,
          Math.min(
            rect.bottom / scale + 4,
            win.innerHeight / scale -
              Math.min(body.current.scrollHeight, 300) -
              8,
          ),
        ) + "px",
    });
  };
  useLayoutEffect(() => {
    if (recovery && body.current?.matches(":popover-open")) {
      reopen.current = true;
      body.current.hidePopover();
    } else if (!recovery && reopen.current) {
      reopen.current = false;
      position();
      body.current?.showPopover();
    } else if (open) position();
  }, [width, height, recovery]);
  useLayoutEffect(
    () =>
      open && body.current
        ? suspendMenus(body.current.ownerDocument)
        : undefined,
    [open],
  );
  return (
    <>
      <button
        type="button"
        ref={trigger}
        className={className}
        popoverTarget={id}
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={position}
      >
        {face ?? label}
      </button>
      <div
        id={id}
        ref={body}
        popover="auto"
        role="dialog"
        aria-label={label}
        className="find-popover"
        onToggle={(event) => {
          const showing = event.newState === "open";
          setOpen(showing);
          if (showing) {
            position();
            body.current
              ?.querySelector<HTMLElement>(
                "button:not(:disabled), select, input",
              )
              ?.focus();
          }
        }}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          event.stopPropagation();
          body.current?.hidePopover();
          trigger.current?.focus();
        }}
        onClick={(event) => {
          if (!(event.target as HTMLElement).closest("button")) return;
          body.current?.hidePopover();
          trigger.current?.focus();
        }}
      >
        {children}
      </div>
    </>
  );
}
