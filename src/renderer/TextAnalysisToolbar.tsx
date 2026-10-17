import { useLayoutEffect, useRef } from "react";
import { usePaneLayout } from "./AdaptivePane";
import { SharedMenu, type SharedMenuItem } from "./SharedPane";
import { useActionOverflow } from "./useActionOverflow";

const commands = [
  { id: "graph", priority: 2 },
  { id: "presentation", priority: 1 },
];

// craigtrim/axiom#79: shared controls and measurement, with one roving toolbar stop.
export function TextAnalysisToolbar(props: {
  auto: boolean;
  stale: boolean;
  busy: boolean;
  count: number;
  ontology: string;
  view: "text" | "summary";
  canAdd: boolean;
  help: boolean;
  toggleAuto(): void;
  analyze(): void;
  graph(): void;
  add(): void;
  setView(view: "text" | "summary"): void;
  toggleHelp(): void;
}) {
  const layout = usePaneLayout();
  const bar = useRef<HTMLDivElement>(null);
  const more = useRef<HTMLButtonElement>(null);
  const hidden = useActionOverflow(bar, more, commands, "shared");
  const buttons = () =>
    [...bar.current!.querySelectorAll<HTMLButtonElement>("button")].filter(
      (button) =>
        !button.closest('[role="menu"]') &&
        !button.disabled &&
        !button.closest('[data-overflowed="true"]') &&
        button.checkVisibility(),
    );
  const rove = (target: HTMLButtonElement) => {
    for (const button of bar.current!.querySelectorAll<HTMLButtonElement>(
      "button",
    ))
      if (!button.closest('[role="menu"]'))
        button.tabIndex = button === target ? 0 : -1;
  };
  useLayoutEffect(() => {
    const available = buttons();
    const active = available.find(
      (button) => button === bar.current!.ownerDocument.activeElement,
    );
    const stop =
      active ??
      available.find((button) => button.tabIndex === 0) ??
      available[0];
    if (stop) rove(stop);
  });
  const items: SharedMenuItem[] = [
    ...(hidden.has("graph")
      ? [
          {
            id: "graph",
            label: "View in Graph",
            accessKey: "v",
            commandId: "graph",
            run: props.graph,
          },
        ]
      : []),
    {
      id: "add",
      label: "Add entity",
      accessKey: "a",
      shortcut: "Alt+Enter",
      disabled: !props.canAdd,
      reason: props.canAdd
        ? undefined
        : "Select a phrase of up to 256 characters",
      run: props.add,
    },
    { id: "after-add", separator: true },
    ...(hidden.has("presentation")
      ? [
          {
            id: "text",
            label: "Text",
            accessKey: "t",
            commandId: "presentation",
            checked: props.view === "text",
            run: () => props.setView("text"),
          },
          {
            id: "summary",
            label: "Summary",
            accessKey: "s",
            commandId: "presentation",
            checked: props.view === "summary",
            run: () => props.setView("summary"),
          },
          { id: "after-presentation", separator: true as const },
        ]
      : []),
    {
      id: "help",
      label: props.help ? "Hide help" : "Help",
      accessKey: "h",
      run: props.toggleHelp,
    },
  ];
  const count = `${props.count} ${props.count === 1 ? "match" : "matches"}`;
  return (
    <div
      ref={bar}
      className="bar"
      role="toolbar"
      aria-label="Text Analysis actions"
      onFocusCapture={(event) => {
        const target = event.target as HTMLElement;
        if (target.tagName === "BUTTON" && !target.closest('[role="menu"]'))
          rove(target as HTMLButtonElement);
      }}
      onKeyDown={(event) => {
        if (
          (event.target as HTMLElement).closest('[role="menu"]') ||
          !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
        )
          return;
        const list = buttons(),
          index = list.indexOf(event.target as HTMLButtonElement);
        event.preventDefault();
        event.stopPropagation();
        list[
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? list.length - 1
              : (index + (event.key === "ArrowRight" ? 1 : -1) + list.length) %
                list.length
        ]?.focus();
      }}
    >
      <button
        data-fixed-action
        className="sw"
        role="switch"
        aria-label="Auto, analyze while typing"
        aria-checked={props.auto}
        tabIndex={0}
        onClick={props.toggleAuto}
        title={
          props.auto
            ? "Auto is on. Matches update 60 ms after you stop typing."
            : "Auto is off. Edit without analyzing, then press Analyze now."
        }
      >
        <span className="track" aria-hidden="true">
          <span className="knob" />
        </span>
        Auto
      </button>
      <span
        data-fixed-action
        className={
          "state text-analysis-status" +
          (props.busy ? " busy" : !props.auto && props.stale ? " warnink" : "")
        }
        role="status"
        title={`${count} in ${props.ontology}${props.stale ? ", out of date" : ""}`}
      >
        <span data-natural-width>
          {props.busy ? (
            "Analyzing"
          ) : (
            <>
              {props.count}
              <span hidden={layout.narrow && layout.shallow}>
                {" "}
                {props.count === 1 ? "match" : "matches"}
                {!props.auto && props.stale ? "," : ""}
              </span>
              {!props.auto && props.stale ? " out of date" : ""}
            </>
          )}
        </span>
      </span>
      {!props.auto && (
        <button
          data-fixed-action
          className="btn primary"
          tabIndex={-1}
          disabled={!props.stale || props.busy}
          onClick={props.analyze}
          title={
            props.stale
              ? "Analyze the current text"
              : "The text has not changed since the last analysis"
          }
        >
          Analyze now
        </button>
      )}
      <span className="od-fill" />
      <div
        className="shared-command"
        data-shared-command="presentation"
        data-overflowed={hidden.has("presentation")}
        inert={hidden.has("presentation")}
        aria-hidden={hidden.has("presentation") || undefined}
      >
        <div className="seg" role="group" aria-label="Presentation">
          <button
            tabIndex={-1}
            aria-pressed={props.view === "text"}
            onClick={() => props.setView("text")}
          >
            Text
          </button>
          <button
            tabIndex={-1}
            aria-pressed={props.view === "summary"}
            onClick={() => props.setView("summary")}
          >
            Summary
          </button>
        </div>
      </div>
      <div
        className="shared-command"
        data-shared-command="graph"
        data-overflowed={hidden.has("graph")}
        inert={hidden.has("graph")}
        aria-hidden={hidden.has("graph") || undefined}
      >
        <button
          className="btn quiet text-analysis-graph"
          tabIndex={-1}
          onClick={props.graph}
        >
          View in Graph
        </button>
      </div>
      <SharedMenu trigger={more} items={items} />
    </div>
  );
}
