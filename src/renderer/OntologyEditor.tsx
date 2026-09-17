import { useEffect, useRef } from "react";
import * as monaco from "monaco-editor/editor/editor.api.js";
import "monaco-editor/editor/contrib/find/browser/findController.js";
import "monaco-editor/editor/contrib/clipboard/browser/clipboard.js";
import { ontologyLanguage } from "./ontology-language";
import { onCommand } from "./client";
import type { SourceFormat } from "../shared/source";
export default function OntologyEditor({
  value,
  format,
  label,
  disabled,
  change,
}: {
  value: string;
  format?: SourceFormat;
  label: string;
  disabled?: boolean;
  change(value: string): void;
}) {
  const host = useRef<HTMLDivElement>(null),
    editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const updating = useRef(false),
    current = useRef({ change });
  current.current = { change };
  useEffect(() => {
    const el = host.current!,
      doc = el.ownerDocument;
    const model = monaco.editor.createModel(value, ontologyLanguage(format));
    const instance = monaco.editor.create(el, {
      model,
      editContext: false,
      automaticLayout: true,
      minimap: { enabled: false },
      fontFamily: "Cascadia Mono, Consolas, monospace",
      fontSize: 13,
      lineHeight: 21,
      tabSize: 4,
      lineNumbers: "on",
      lineNumbersMinChars: 3,
      glyphMargin: false,
      folding: true,
      wordWrap: "on",
      scrollBeyondLastLine: false,
      ariaLabel: label,
      readOnly: disabled,
      theme: doc.documentElement.dataset.theme === "dark" ? "vs-dark" : "vs",
      padding: { top: 10, bottom: 10 },
    });
    editor.current = instance;
    const listener = instance.onDidChangeModelContent(() => {
      if (!updating.current) current.current.change(instance.getValue());
    });
    const commands = onCommand((id) => {
      if (!instance.hasTextFocus()) return;
      if (id === "edit.undo") instance.trigger("menu", "undo", null);
      if (id === "edit.redo") instance.trigger("menu", "redo", null);
    });
    const observer = new MutationObserver(() =>
      monaco.editor.setTheme(
        doc.documentElement.dataset.theme === "dark" ? "vs-dark" : "vs",
      ),
    );
    observer.observe(doc.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => {
      commands();
      observer.disconnect();
      listener.dispose();
      instance.dispose();
      model.dispose();
      editor.current = null;
    };
  }, []);
  useEffect(() => {
    const e = editor.current;
    if (e && e.getValue() !== value) {
      updating.current = true;
      e.setValue(value);
      updating.current = false;
    }
  }, [value]);
  useEffect(() => {
    const e = editor.current;
    if (e) {
      e.updateOptions({ readOnly: disabled });
      monaco.editor.setModelLanguage(e.getModel()!, ontologyLanguage(format));
    }
  }, [disabled, format]);
  return (
    <div ref={host} className="ontology-code-editor" data-format={format} />
  );
}
