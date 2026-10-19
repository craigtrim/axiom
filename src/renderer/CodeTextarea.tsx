import { useLayoutEffect, useRef } from "react";
import { Code } from "./Code";

// craigtrim/axiom#111: read-only prompts keep native selection and clipboard behavior.
export function CodeTextarea({
  value,
  rows,
  "aria-label": label,
}: {
  value: string;
  rows: number;
  "aria-label": string;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  const paint = useRef<HTMLPreElement>(null);
  const align = () => {
    const field = input.current!,
      pre = paint.current!;
    const css = field.ownerDocument.defaultView!.getComputedStyle(field);
    for (const key of [
      "font-family",
      "font-size",
      "font-weight",
      "font-style",
      "font-variant-ligatures",
      "font-feature-settings",
      "font-kerning",
      "line-height",
      "letter-spacing",
      "tab-size",
      "padding-top",
      "padding-bottom",
      "padding-left",
      "padding-right",
      "border-width",
      "text-align",
      "text-indent",
      "word-spacing",
    ])
      pre.style.setProperty(key, css.getPropertyValue(key));
    const box = field.getBoundingClientRect(),
      parent = field.parentElement!.getBoundingClientRect();
    Object.assign(pre.style, {
      top: box.top - parent.top + "px",
      left: box.left - parent.left + "px",
      width: box.width + "px",
      height: box.height + "px",
      boxSizing: "border-box",
      paddingRight:
        parseFloat(css.paddingRight) +
        field.offsetWidth -
        field.clientWidth -
        parseFloat(css.borderLeftWidth) -
        parseFloat(css.borderRightWidth) +
        "px",
    });
    pre.scrollTop = field.scrollTop;
    pre.scrollLeft = field.scrollLeft;
  };
  useLayoutEffect(() => {
    align();
    const resize = new ResizeObserver(align);
    resize.observe(input.current!);
    return () => resize.disconnect();
  }, [value]);
  return (
    <div className="syntax-textarea">
      <textarea
        ref={input}
        aria-label={label}
        value={value}
        rows={rows}
        readOnly
        onScroll={align}
      />
      <pre ref={paint} aria-hidden="true">
        <Code language="prompt">{value + "\n"}</Code>
      </pre>
    </div>
  );
}
