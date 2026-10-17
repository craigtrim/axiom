import { useRef, type ReactNode, type RefObject } from "react";
import { useActionOverflow } from "./useActionOverflow";

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
  // Keep existing Quality behavior on the common measurement path (craigtrim/axiom#81).
  const hidden = useActionOverflow(root, more, commands, "quality");
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
