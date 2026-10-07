import { useEffect, useRef, useState } from "react";
import { onCommand, report } from "./client";
import { ContextMenu } from "./ContextMenu";

/** Native text editing keeps fractional line metrics identical to the reference,
 * and gives clipboard and undo/redo to the browser's text editing history. */
export function DetailsSourceEditor({
  value,
  label,
  disabled,
  change,
}: {
  value: string;
  label: string;
  disabled?: boolean;
  change(value: string): void;
}) {
  const root = useRef<HTMLDivElement>(null),
    editor = useRef<HTMLTextAreaElement>(null),
    search = useRef<HTMLInputElement>(null);
  const [finding, setFinding] = useState(false),
    [query, setQuery] = useState("");
  const [result, setResult] = useState("");
  const [menu, setMenu] = useState<{ x: number; y: number }>();
  const localCommand = (id: string) => {
    const el = editor.current!;
    el.focus();
    el.ownerDocument.execCommand(id);
  };
  const paste = async () => {
    const el = editor.current!,
      text = el.value,
      start = el.selectionStart,
      end = el.selectionEnd;
    el.focus();
    try {
      const content = await (
        el.ownerDocument.defaultView!.axiom ?? window.axiom
      ).editors.readClipboard();
      if (
        el.isConnected &&
        !el.disabled &&
        el.value === text &&
        el.selectionStart === start &&
        el.selectionEnd === end
      ) {
        el.focus();
        el.ownerDocument.execCommand("insertText", false, content);
      }
    } catch (error) {
      report((error as Error).message, true);
    }
  };
  useEffect(
    () =>
      onCommand((id) => {
        if (
          id === "details.find" &&
          root.current?.contains(root.current.ownerDocument.activeElement)
        ) {
          setFinding(true);
          requestAnimationFrame(() => {
            search.current?.focus();
            search.current?.select();
          });
        }
      }),
    [],
  );
  const find = (backward = false) => {
    const el = editor.current;
    if (!el || !query) return;
    const text = value.toLocaleLowerCase(),
      term = query.toLocaleLowerCase();
    const start = backward ? el.selectionStart - 1 : el.selectionEnd;
    let index = backward
      ? start < 0
        ? -1
        : text.lastIndexOf(term, start)
      : text.indexOf(term, start);
    if (index < 0)
      index = backward ? text.lastIndexOf(term) : text.indexOf(term);
    if (index < 0) {
      setResult("No matches");
      return;
    }
    setResult("Match found");
    el.focus();
    el.setSelectionRange(index, index + query.length);
    const line = value.slice(0, index).split("\n").length - 1;
    el.scrollTop = Math.max(0, line * 19.375 - el.clientHeight / 2);
  };
  return (
    <div
      ref={root}
      className="details-source-text"
      onKeyDown={(event) => {
        if (finding && event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          setFinding(false);
          editor.current?.focus();
        }
      }}
    >
      {finding && (
        <div
          className="details-source-find"
          role="search"
          aria-label="Find in entity source"
        >
          <input
            ref={search}
            aria-label="Find in source"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setResult("");
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                find(event.shiftKey);
              }
            }}
          />
          <button className="btn" onClick={() => find(true)}>
            Previous
          </button>
          <button className="btn" onClick={() => find()}>
            Next
          </button>
          <button
            className="btn quiet"
            aria-label="Close source find"
            onClick={() => {
              setFinding(false);
              editor.current?.focus();
            }}
          >
            ×
          </button>
          <span className="vh" role="status">
            {result}
          </span>
        </div>
      )}
      <textarea
        ref={editor}
        className="src"
        aria-label={label}
        spellCheck={false}
        disabled={disabled}
        value={value}
        rows={Math.min(14, Math.max(1, value.split("\n").length))}
        onChange={(event) => change(event.target.value)}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setMenu({ x: event.clientX, y: event.clientY });
        }}
        onKeyDown={(event) => {
          if (
            (event.shiftKey && event.key === "F10") ||
            event.key === "ContextMenu"
          ) {
            event.preventDefault();
            event.stopPropagation();
            const box = event.currentTarget.getBoundingClientRect();
            setMenu({ x: box.x + 12, y: box.y + 20 });
          }
        }}
      />
      {menu && (
        <ContextMenu
          document={editor.current!.ownerDocument}
          x={menu.x}
          y={menu.y}
          label="Source editing"
          close={() => setMenu(undefined)}
          actions={[
            {
              label: "Undo",
              key: "U",
              enabled: !disabled,
              run: () => localCommand("undo"),
            },
            {
              label: "Redo",
              key: "R",
              enabled: !disabled,
              run: () => localCommand("redo"),
            },
            null,
            {
              label: "Cut",
              key: "T",
              enabled:
                !disabled &&
                editor.current!.selectionStart !== editor.current!.selectionEnd,
              run: () => localCommand("cut"),
            },
            {
              label: "Copy",
              key: "C",
              enabled:
                editor.current!.selectionStart !== editor.current!.selectionEnd,
              run: () => localCommand("copy"),
            },
            { label: "Paste", key: "P", enabled: !disabled, run: paste },
            {
              label: "Select all",
              key: "A",
              run: () => {
                editor.current!.focus();
                editor.current!.select();
              },
            },
            null,
            {
              label: "Find",
              key: "F",
              run: () => {
                setFinding(true);
                requestAnimationFrame(() => search.current?.focus());
              },
            },
          ]}
        />
      )}
    </div>
  );
}
