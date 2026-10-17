import { useLayoutEffect, useState, type RefObject } from "react";
import { qualityOverflow } from "./quality-overflow";

/** Share Quality's natural-width measurement and focus handling (craigtrim/axiom#81). */
export function useActionOverflow(
  root: RefObject<HTMLDivElement | null>,
  more: RefObject<HTMLButtonElement | null>,
  commands: readonly { id: string; priority: number }[],
  prefix: "quality" | "shared",
) {
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  useLayoutEffect(() => {
    const bar = root.current;
    const trigger = more.current;
    if (!bar || !trigger) return;
    const win = bar.ownerDocument.defaultView!;
    const attribute = `data-${prefix}-command`;
    const overflowAttribute = `data-${prefix}-overflow`;
    const slots = [
      ...bar.querySelectorAll<HTMLElement>(`:scope > [${attribute}]`),
    ];
    const fixed = [
      ...bar.querySelectorAll<HTMLElement>(":scope > [data-fixed-action]"),
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
          gap +
          fixed.reduce((width, el) => {
            // A shrinking state must not consume room before actions overflow.
            const content = el.querySelector<HTMLElement>(
              "[data-natural-width]",
            );
            const ownStyle = win.getComputedStyle(el);
            return (
              width +
              (content
                ? content.getBoundingClientRect().width / scale +
                  parseFloat(ownStyle.paddingLeft) +
                  parseFloat(ownStyle.paddingRight)
                : el.getBoundingClientRect().width / scale) +
              gap
            );
          }, 0),
        gap,
        slots.map((slot) => ({
          id: slot.getAttribute(attribute)!,
          width: slot.getBoundingClientRect().width / scale,
          priority: commands.find((c) => c.id === slot.getAttribute(attribute))!
            .priority,
        })),
      );
      if (next.size === hidden.size && [...next].every((id) => hidden.has(id)))
        return;
      const active = bar.ownerDocument.activeElement as HTMLElement | null;
      const command = active?.closest<HTMLElement>(
        `[${attribute}], [${overflowAttribute}]`,
      );
      const id =
        command?.getAttribute(attribute) ??
        command?.getAttribute(overflowAttribute);
      if (
        (id && next.has(id) !== hidden.has(id)) ||
        bar.querySelector(":popover-open")
      ) {
        bar
          .querySelectorAll<HTMLElement>(":popover-open")
          .forEach((p) => p.hidePopover());
        trigger.focus({ preventScroll: true });
      }
      setHidden(next);
    };
    measure();
    const observer = new win.ResizeObserver(measure);
    [
      bar,
      trigger,
      ...slots,
      ...fixed,
      ...bar.querySelectorAll<HTMLElement>("[data-natural-width]"),
    ].forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  });
  return hidden;
}
