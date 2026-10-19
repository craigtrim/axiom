import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Code } from "./Code";
import type { SourceFormat } from "../shared/source";
import { onCommand, report } from "./client";
import { ContextMenu } from "./ContextMenu";

/** Native text editing keeps fractional line metrics identical to the reference,
 * and gives clipboard and undo/redo to the browser's text editing history. */
export function DetailsSourceEditor({
  value,
  format,
  label,
  disabled,
  change,
}: {
  value: string;
  format: SourceFormat;
  label: string;
  disabled?: boolean;
  change(value: string): void;
}) {
  const root = useRef<HTMLDivElement>(null),
    editor = useRef<HTMLTextAreaElement>(null),
    highlight = useRef<HTMLPreElement>(null),
    search = useRef<HTMLInputElement>(null);
  const [finding, setFinding] = useState(false),
    [query, setQuery] = useState("");
  const [result, setResult] = useState("");
  const [menu, setMenu] = useState<{ x: number; y: number }>();
  // craigtrim/axiom#111: paint shared tokens behind the unchanged native editing surface.
  const align = () => {
    const input = editor.current,
      pre = highlight.current;
    if (!input || !pre) return;
    const css = input.ownerDocument.defaultView!.getComputedStyle(input);
    const scrollbar =
      input.offsetWidth -
      input.clientWidth -
      parseFloat(css.borderLeftWidth) -
      parseFloat(css.borderRightWidth);
    pre.style.paddingRight = parseFloat(css.paddingRight) + scrollbar + "px";
    pre.scrollTop = input.scrollTop;
    pre.scrollLeft = input.scrollLeft;
  };
  useLayoutEffect(align, [value, format]);
  useEffect(() => {
    const observer = new ResizeObserver(align);
    observer.observe(editor.current!);
    return () => observer.disconnect();
  }, []);
  // craigtrim/axiom#118: wrapped text sizes the editor; it stops at the pane
  // body's free room, but never below the 14 rows it always had.
  const fit = () => {
    const input = editor.current,
      stack = input?.parentElement,
      body = input?.closest(".pbody"),
      last = body?.lastElementChild;
    if (!input?.offsetParent || !stack || !body || !last) return;
    const view = input.ownerDocument.defaultView!,
      css = view.getComputedStyle(input),
      area = body.getBoundingClientRect(),
      box = stack.getBoundingClientRect();
    // Content coordinates, so scrolling the body never changes the answer.
    const top = box.top - area.top - body.clientTop + body.scrollTop,
      below = last.getBoundingClientRect().bottom - box.bottom,
      room =
        body.clientHeight -
        parseFloat(view.getComputedStyle(body).paddingBottom) -
        top -
        below,
      floor =
        14 * parseFloat(css.lineHeight) +
        parseFloat(css.paddingTop) +
        parseFloat(css.paddingBottom);
    input.style.maxHeight = Math.max(Math.floor(room), floor) + "px";
  };
  const fitting = useRef<{ observer: ResizeObserver; seen: WeakSet<Element> }>(
    undefined,
  );
  useLayoutEffect(() => {
    fit();
    const body = editor.current?.closest(".pbody");
    if (!body) return;
    // The room changes with the body and with anything above the editor.
    fitting.current ??= {
      observer: new ResizeObserver(fit),
      seen: new WeakSet(),
    };
    for (const el of [body, ...body.children])
      if (
        !fitting.current.seen.has(el) &&
        (el === body || !el.contains(root.current))
      ) {
        fitting.current.seen.add(el);
        fitting.current.observer.observe(el);
      }
  });
  useEffect(
    () => () => {
      fitting.current?.observer.disconnect();
      fitting.current = undefined;
    },
    [],
  );
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
      <div className="details-source-stack">
        <pre ref={highlight} className="source-highlight" aria-hidden="true">
          <Code language={format}>{value + "\n"}</Code>
        </pre>
        <textarea
          ref={editor}
          className="src source-input"
          aria-label={label}
          spellCheck={false}
          disabled={disabled}
          value={value}
          onChange={(event) => change(event.target.value)}
          onScroll={align}
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
      </div>
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
