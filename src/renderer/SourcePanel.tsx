import { useEffect, useRef, useState } from "react";
import * as monaco from "monaco-editor/editor/editor.api.js";
import "monaco-editor/editor/contrib/find/browser/findController.js";
import "monaco-editor/editor/contrib/clipboard/browser/clipboard.js";
import { useSnapshot, request, onCommand, act } from "./client";
import {
  useSourceDraft,
  setSourceDraft,
  applySourceDraft,
} from "./source-draft";
import {
  sourceFormats,
  sourcePrefixes,
  type SourceDocument,
  type SourceFormat,
} from "../shared/source";
window.MonacoEnvironment ??= {
  getWorker: () => new Worker(new URL("editor.worker.js", location.href)),
};
monaco.languages.register({ id: "ontology-source" });
monaco.languages.setMonarchTokensProvider("ontology-source", {
  tokenizer: {
    root: [
      [/<!--/, "comment", "@xmlComment"],
      [/#.*$/, "comment"],
      [/"""/, "string", "@longString"],
      [/"(?:[^"\\]|\\.)*"/, "string"],
      [/'(?:[^'\\]|\\.)*'/, "string"],
      [/<[^>]*>/, "tag"],
      [/@(?:prefix|base)|\b(?:PREFIX|BASE|a|true|false)\b/, "keyword"],
      [/[a-zA-Z_][\w.-]*:[\w.-]*/, "type.identifier"],
      [/[+-]?\d+(?:\.\d+)?/, "number"],
      [/[{}()[\];,.]/, "delimiter"],
    ],
    xmlComment: [
      [/-->/, "comment", "@pop"],
      [/./, "comment"],
    ],
    longString: [
      [/"""/, "string", "@pop"],
      [/./, "string"],
    ],
  },
});
export function SourcePanel() {
  const snapshot = useSnapshot()!;
  const draft = useSourceDraft();
  const [doc, setDoc] = useState<SourceDocument>();
  const [format, setFormat] = useState<SourceFormat | undefined>(
    draft?.loaded.format,
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const updating = useRef(false);
  const current = useRef(doc);
  current.current = draft?.loaded ?? doc;
  useEffect(() => {
    if (draft) {
      setDoc(draft.loaded);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    void request<SourceDocument>("sourceDocument", format ? { format } : {})
      .then((value) => {
        if (active) {
          setDoc(value);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [snapshot.version, snapshot.datasetEpoch, format, !!draft, reload]);
  useEffect(() => {
    if (!host.current) return;
    const ownerDocument = host.current.ownerDocument;
    const model = monaco.editor.createModel("", "ontology-source");
    const instance = monaco.editor.create(host.current, {
      model,
      editContext: false,
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 13,
      lineNumbers: "on",
      wordWrap: "on",
      scrollBeyondLastLine: false,
      ariaLabel: "Ontology source",
      theme:
        ownerDocument.documentElement.dataset.theme === "dark"
          ? "vs-dark"
          : "vs",
    });
    editor.current = instance;
    const change = instance.onDidChangeModelContent(() => {
      if (!updating.current && current.current) {
        setError("");
        setSourceDraft({ loaded: current.current, text: instance.getValue() });
      }
    });
    const commands = onCommand((id) => {
      if (id === "source.find") {
        instance.focus();
        void instance.getAction("actions.find")?.run();
      }
      if (!instance.hasTextFocus()) return;
      if (id === "edit.undo") {
        if (model.canUndo()) instance.trigger("menu", "undo", null);
        else if (instance.getValue() === current.current?.text)
          void act("undo");
      }
      if (id === "edit.redo") {
        if (model.canRedo()) instance.trigger("menu", "redo", null);
        else if (instance.getValue() === current.current?.text)
          void act("redo");
      }
    });
    const observer = new MutationObserver(() =>
      monaco.editor.setTheme(
        ownerDocument.documentElement.dataset.theme === "dark"
          ? "vs-dark"
          : "vs",
      ),
    );
    observer.observe(ownerDocument.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => {
      commands();
      observer.disconnect();
      change.dispose();
      instance.dispose();
      model.dispose();
      editor.current = null;
    };
  }, []);
  const text = draft?.text ?? doc?.text ?? "";
  useEffect(() => {
    const instance = editor.current;
    if (instance && instance.getValue() !== text) {
      updating.current = true;
      instance.setValue(text);
      updating.current = false;
    }
  }, [text]);
  useEffect(() => {
    editor.current?.updateOptions({ readOnly: loading || busy || !doc });
  }, [loading, busy, !!doc]);
  const apply = async () => {
    setBusy(true);
    setError("");
    try {
      await applySourceDraft();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const convert = async (next: SourceFormat) => {
    setBusy(true);
    setError("");
    try {
      await applySourceDraft();
      const value = await request<SourceDocument>("sourceDocument", {
        format: next,
      });
      setDoc(value);
      setFormat(next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const findSelected = () => {
    const iri = snapshot.selected,
      instance = editor.current;
    if (!iri || !instance) return;
    const tokens = [
      iri,
      ...Object.entries(sourcePrefixes)
        .filter(([, ns]) => iri.startsWith(ns))
        .map(([p, ns]) => p + ":" + iri.slice(ns.length)),
    ];
    for (const token of tokens) {
      const match = instance
        .getModel()
        ?.findMatches(token, false, false, true, null, false)[0];
      if (match) {
        instance.setSelection(match.range);
        instance.revealRangeInCenter(match.range);
        instance.focus();
        return;
      }
    }
    setError(
      "The selected entity has no explicit identifier in this serialization. Use Find to locate its label.",
    );
  };
  const stale =
    !!draft &&
    (draft.loaded.version !== snapshot.version ||
      draft.loaded.datasetEpoch !== snapshot.datasetEpoch);
  return (
    <section
      className="panel source-panel"
      data-panel="source"
      aria-label="Ontology source editor"
    >
      <div className="panel-toolbar">
        <label>
          Format{" "}
          <select
            aria-label="Source format"
            value={doc?.format ?? "turtle"}
            disabled={busy || loading}
            onChange={(e) => void convert(e.target.value as SourceFormat)}
          >
            {sourceFormats.map((f) => (
              <option
                key={f.id}
                value={f.id}
                disabled={doc?.namedGraphs && !f.graphs}
              >
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={!draft || busy || loading || stale}
          onClick={() => void apply()}
        >
          Apply changes
        </button>
        <button
          disabled={busy}
          onClick={() => {
            setSourceDraft();
            setError("");
            setReload((n) => n + 1);
          }}
        >
          {draft ? "Discard draft and reload" : "Reload from ontology"}
        </button>
        <button disabled={!snapshot.selected || loading} onClick={findSelected}>
          Find selected entity
        </button>
        <button
          disabled={busy || loading}
          onClick={() => window.axiom.command("file.exportOntology")}
        >
          Export...
        </button>
      </div>
      <div className="source-status" role="status">
        {loading
          ? "Loading source..."
          : busy
            ? "Applying source..."
            : draft
              ? "Unapplied source changes"
              : !doc
                ? "Source unavailable"
                : "Synchronized with graph and taxonomy"}
        {doc && !loading
          ? " · " + doc.statements.toLocaleString() + " statements"
          : ""}
      </div>
      {stale && (
        <p className="source-message" role="alert">
          The ontology changed in another view. Your draft is preserved. Copy
          any edits you want to keep before reloading the current document.
        </p>
      )}
      {error && (
        <p className="source-message field-error" role="alert">
          {error}
        </p>
      )}
      {doc?.namedGraphs && (
        <p className="source-message muted">
          This document contains named graphs. TriG, N-Quads and JSON-LD
          preserve them.
        </p>
      )}
      <div ref={host} className="source-editor" />
    </section>
  );
}
