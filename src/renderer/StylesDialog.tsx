import { useState } from "react";
import { Modal } from "./Dialogs";
import { useSnapshot, request, savePanel } from "./client";
import { parseGraphStyle, styleExample } from "../domain/graph-style";
export function StylesDialog({ close }: { close: () => void }) {
  const s = useSnapshot()!,
    [text, setText] = useState(s.graph.stylesheet ?? ""),
    [error, setError] = useState("");
  const apply = async () => {
    try {
      parseGraphStyle(text);
      await request("stylesheet", { text });
      savePanel("graph.stylesheet", text, false);
      close();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Modal title="Graph stylesheet" close={close}>
      <p>
        Style the graph with CSS-like rules. Changes also appear in PNG and SVG
        exports.
      </p>
      <textarea
        aria-label="Graph stylesheet"
        className="code-input"
        spellCheck={false}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={16}
      />
      <details>
        <summary>Selectors and properties</summary>
        <p>
          Selectors: node, node.Class, node.Defined, node.Individual,
          node.ObjectProperty, node.DataProperty, node:selected, node:pinned,
          node[iri="..."], edge[predicate="..."], graph[theme="dark"]. Separate
          selectors with commas.
        </p>
        <p>
          Node properties: fill, stroke, stroke-width, size, shape, color,
          font-size, label, opacity. Edge properties: stroke, stroke-width,
          opacity, line-style. Graph property: background. Colors use #RGB or
          #RRGGBB. Shapes: circle, square, diamond, hexagon. Labels: name, iri,
          none. Lines: solid, dashed.
        </p>
      </details>
      {error && <p role="alert">{error}</p>}
      <footer>
        <button onClick={() => setText(styleExample)}>Load example</button>
        <button onClick={() => setText("")}>Reset styles</button>
        <button onClick={close}>Cancel</button>
        <button className="primary" onClick={() => void apply()}>
          Apply
        </button>
      </footer>
    </Modal>
  );
}
