import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { qualityOverflow } from "./quality-overflow";

export interface QualityCommand {
  id: string;
  priority: number;
  content: ReactNode;
  /** A labelled form or direct actions suitable for the overflow popup. */
  overflow?: ReactNode;
  trailing?: boolean;
}

/** Measure the controls themselves, including changing counts, fonts and zoom.
 * Hidden bar copies are inert and invisible but retain intrinsic measurements.
 * The only interactive copy of each command is on the bar or in the popup.
 */
export function QualityToolbar({
  commands,
  more,
  menu,
  children,
}: {
  commands: QualityCommand[];
  more: RefObject<HTMLButtonElement | null>;
  menu: (overflow: ReactNode) => ReactNode;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  useLayoutEffect(() => {
    const bar = root.current;
    const trigger = more.current;
    if (!bar || !trigger) return;
    const win = bar.ownerDocument.defaultView!;
    const slots = [
      ...bar.querySelectorAll<HTMLElement>(":scope > [data-quality-command]"),
    ];
    const measure = () => {
      const style = win.getComputedStyle(bar);
      const scale = bar.getBoundingClientRect().width / parseFloat(style.width);
      if (!Number.isFinite(scale) || !scale) return;
      const gap = parseFloat(style.columnGap) || 0;
      const next = qualityOverflow(
        bar.getBoundingClientRect().width / scale,
        parseFloat(style.paddingLeft) +
          parseFloat(style.paddingRight) +
          trigger.getBoundingClientRect().width / scale +
          gap,
        gap,
        slots.map((slot) => ({
          id: slot.dataset.qualityCommand!,
          width: slot.getBoundingClientRect().width / scale,
          priority: commands.find((c) => c.id === slot.dataset.qualityCommand)!
            .priority,
        })),
      );
      if (next.size === hidden.size && [...next].every((id) => hidden.has(id)))
        return;
      // A focused command must never become an invisible keyboard destination.
      // Close a popup if its command is moving, then resume at the stable trigger.
      const active = bar.ownerDocument.activeElement as HTMLElement | null;
      const command = active?.closest<HTMLElement>(
        "[data-quality-command], [data-quality-overflow]",
      );
      const id =
        command?.dataset.qualityCommand ?? command?.dataset.qualityOverflow;
      const moving = id && next.has(id) !== hidden.has(id);
      const exportMenu = bar.querySelector<HTMLElement>(
        ".quality-export-menu:popover-open",
      );
      if (moving || exportMenu) {
        bar
          .querySelectorAll<HTMLElement>(":popover-open")
          .forEach((p) => p.hidePopover());
        trigger.focus({ preventScroll: true });
      }
      setHidden(next);
    };
    measure();
    const observer = new win.ResizeObserver(measure);
    observer.observe(bar);
    slots.forEach((slot) => observer.observe(slot));
    observer.observe(trigger);
    return () => observer.disconnect();
  });
  const command = (item: QualityCommand) => (
    <div
      key={item.id}
      className="quality-command"
      data-quality-command={item.id}
      data-overflowed={hidden.has(item.id)}
      inert={hidden.has(item.id)}
      aria-hidden={hidden.has(item.id) || undefined}
    >
      {item.content}
    </div>
  );
  return (
    <div className="tools" ref={root}>
      {commands.filter((c) => !c.trailing).map(command)}
      <span className="fill" />
      {commands.filter((c) => c.trailing).map(command)}
      {children}
      {menu(
        commands
          .filter((c) => hidden.has(c.id))
          .map((item) => (
            <div
              className="quality-overflow-command"
              data-quality-overflow={item.id}
              key={item.id}
            >
              {item.overflow ?? item.content}
            </div>
          )),
      )}
    </div>
  );
}
