import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ChromeMenuItem } from "../shared/window-chrome";
import { focusedDocument, report } from "./client";

interface Entry {
  item: ChromeMenuItem;
  path: string;
  enabled: boolean;
}
function leaves(
  items: ChromeMenuItem[],
  path: string[] = [],
  enabled = true,
): Entry[] {
  return items
    .filter((item) => item.visible && !item.separator)
    .flatMap((item) =>
      item.children
        ? leaves(item.children, [...path, item.label], enabled && item.enabled)
        : [{ item, path: path.join(" > "), enabled: enabled && item.enabled }],
    );
}
export function ChromePalette({ close }: { close: () => void }) {
  const [owner] = useState(focusedDocument);
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Entry[]>([]);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState(0);
  const id = useId();
  const rows = items
    .filter(({ item, path }) =>
      (item.label + " " + path)
        .toLowerCase()
        .includes(filter.trim().toLowerCase()),
    )
    .slice(0, 60);
  const run = (entry: Entry) => {
    if (!entry.enabled) return;
    close();
    void window.axiom.chrome
      .execute(entry.item.id, entry.item.label)
      .catch((error) => report(error.message, true));
  };
  useEffect(() => {
    let live = true;
    const previous = owner.activeElement as HTMLElement | null;
    const element = dialog.current!;
    element.showModal();
    input.current?.focus();
    void window.axiom.chrome
      .menus()
      .then((menus) => {
        if (live) setItems(leaves(menus));
      })
      .catch((error) => report(error.message, true));
    return () => {
      live = false;
      element.close();
      previous?.focus();
    };
  }, []);
  useEffect(() => {
    owner
      .getElementById(id + "-" + selected)
      ?.scrollIntoView({ block: "nearest" });
  }, [selected, filter]);
  return createPortal(
    <dialog
      ref={dialog}
      className="shell-surface chrome-palette-shell"
      aria-label="Command palette"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="palette">
        <input
          ref={input}
          role="combobox"
          aria-label="Find a command"
          aria-controls={id}
          aria-expanded="true"
          aria-autocomplete="list"
          aria-activedescendant={
            rows[selected] ? id + "-" + selected : undefined
          }
          placeholder="Type a command"
          autoComplete="off"
          spellCheck={false}
          value={filter}
          onChange={(event) => {
            setFilter(event.target.value);
            setSelected(0);
          }}
          onKeyDown={(event) => {
            if (
              ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) &&
              (event.key.startsWith("Arrow") || event.ctrlKey)
            ) {
              event.preventDefault();
              setSelected(
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? Math.max(0, rows.length - 1)
                    : Math.max(
                        0,
                        Math.min(
                          rows.length - 1,
                          selected + (event.key === "ArrowDown" ? 1 : -1),
                        ),
                      ),
              );
            }
            if (event.key === "Enter" && rows[selected]) {
              event.preventDefault();
              run(rows[selected]);
            }
          }}
        />
        <div className="plist" id={id} role="listbox" aria-label="Commands">
          {rows.map((entry, index) => (
            <button
              type="button"
              className="pi"
              role="option"
              key={entry.item.id}
              id={id + "-" + index}
              aria-selected={index === selected}
              data-active={index === selected || undefined}
              aria-disabled={!entry.enabled || undefined}
              tabIndex={-1}
              onPointerMove={() => setSelected(index)}
              onClick={() => run(entry)}
            >
              <span>{entry.item.label}</span>
              <span className="ppath">{entry.path}</span>
              {entry.item.accelerator && (
                <span className="pacc">{entry.item.accelerator}</span>
              )}
            </button>
          ))}
          {!rows.length && (
            <div className="pempty">No command matches that text.</div>
          )}
        </div>
      </div>
    </dialog>,
    owner.body,
  );
}
