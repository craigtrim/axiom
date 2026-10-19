// craigtrim/axiom#94: Monaco retains editing behavior inside the utility reference frame.
import { registerEditorMenu } from "./editor-menu-keys";
import { ErrorNotice } from "./ErrorNotice";
import { ontologyLanguage } from "./ontology-language";
import { syntaxTheme } from "./syntax-theme";
import { paintEditorSyntax } from "./syntax-paint";
import { usePaneLayout } from "./AdaptivePane";
import { UtilityFrame, UtilityToolbar } from "./UtilityPane";
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
  invalidSourcePrefix,
  sourcePrefixes,
  type SourceDocument,
  type SourceFormat,
} from "../shared/source";
export function SourcePanel() {
  const snapshot = useSnapshot()!;
  const layout = usePaneLayout();
  const [notice, setNotice] = useState(false);
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
  const area = useRef<HTMLDivElement>(null);
  const horizontal = useRef<HTMLDivElement>(null);
  const extent = useRef<HTMLDivElement>(null);
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
    // craigtrim/axiom#111: format changes use the same grammar as static source.
    const model = monaco.editor.createModel("", ontologyLanguage(format));
    const instance = monaco.editor.create(host.current, {
      model,
      editContext: false,
      automaticLayout: true,
      minimap: { enabled: false },
      autoIndent: "none",
      formatOnPaste: false,
      autoClosingBrackets: "never",
      autoClosingQuotes: "never",
      autoSurround: "never",
      fontFamily: "Cascadia Mono, Cascadia Code, Consolas, monospace",
      fontSize: 12,
      lineHeight: 18,
      padding: { top: 8, bottom: 8 },
      lineNumbersMinChars: 3,
      lineDecorationsWidth: 26,
      glyphMargin: false,
      folding: false,
      renderLineHighlight: "none",
      overviewRulerLanes: 0,
      overviewRulerBorder: false,
      guides: { indentation: false, highlightActiveIndentation: false },
      scrollbar: {
        useShadows: false,
        horizontal: "hidden",
        horizontalScrollbarSize: 0,
      },
      scrollBeyondLastColumn: 2,
      tabSize: 2,
      lineNumbers: "on",
      wordWrap: "off",
      scrollBeyondLastLine: false,
      ariaLabel: "Ontology source",
      theme: syntaxTheme(ownerDocument),
    });
    editor.current = instance;
    const removeSyntax = paintEditorSyntax(host.current);
    const removeEditorMenu = registerEditorMenu(instance);
    const change = instance.onDidChangeModelContent(() => {
      if (!updating.current && current.current) {
        setError("");
        setNotice(false);
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
      monaco.editor.setTheme(syntaxTheme(ownerDocument)),
    );
    observer.observe(ownerDocument.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => {
      commands();
      observer.disconnect();
      change.dispose();
      removeEditorMenu();
      removeSyntax();
      instance.dispose();
      model.dispose();
      editor.current = null;
    };
  }, []);
  useEffect(() => {
    const instance = editor.current;
    if (!instance) return;
    const gutter = layout.narrow ? 32 : 40;
    // Leave eight pixels between the shared gutter and Monaco's text origin.
    const numberWidth =
      instance.getOption(monaco.editor.EditorOption.fontInfo)
        .typicalHalfwidthCharacterWidth * 3;
    instance.updateOptions({
      lineDecorationsWidth: Math.max(0, gutter + 8 - numberWidth),
    });
    instance.updateOptions({
      lineDecorationsWidth:
        instance.getOption(monaco.editor.EditorOption.lineDecorationsWidth) +
        gutter +
        8 -
        instance.getLayoutInfo().contentLeft,
    });
    host.current?.style.setProperty("--source-gutter", gutter + "px");
  }, [layout.narrow]);
  const text = draft?.text ?? doc?.text ?? "";
  const language = ontologyLanguage(
    draft?.loaded.format ?? doc?.format ?? format,
  );
  useEffect(() => {
    const model = editor.current?.getModel();
    if (model && model.getLanguageId() !== language)
      monaco.editor.setModelLanguage(model, language);
  }, [language]);
  useEffect(() => {
    const instance = editor.current,
      container = area.current,
      rail = horizontal.current,
      measure = extent.current;
    if (!instance || !container || !rail || !measure) return;
    // The native horizontal rail matches the plain editor and drives Monaco's retained viewport.
    const size = () => {
      const overflow = measure.getBoundingClientRect().width > rail.clientWidth;
      container.style.setProperty(
        "--source-scroll-height",
        overflow ? "15px" : "0px",
      );
      rail.style.visibility = overflow ? "visible" : "hidden";
      rail.scrollLeft = instance.getScrollLeft();
    };
    const scroll = () => instance.setScrollLeft(rail.scrollLeft);
    rail.addEventListener("scroll", scroll);
    const viewport = instance.onDidScrollChange((e) => {
      if (e.scrollLeftChanged) rail.scrollLeft = e.scrollLeft;
    });
    const observer = new container.ownerDocument.defaultView!.ResizeObserver(
      size,
    );
    observer.observe(container);
    observer.observe(measure);
    observer.observe(rail);
    size();
    return () => {
      rail.removeEventListener("scroll", scroll);
      viewport.dispose();
      observer.disconnect();
    };
  }, [text, layout.narrow]);
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
    setNotice(true);
  };
  const stale =
    !!draft &&
    (draft.loaded.version !== snapshot.version ||
      draft.loaded.datasetEpoch !== snapshot.datasetEpoch);
  const invalid = !!draft && !!error && error.startsWith(invalidSourcePrefix);
  const parserMessage = invalid
    ? error.slice(invalidSourcePrefix.length)
    : error;
  const line = error.match(/(?:on\s+)?line\s+(\d+)/i)?.[1];
  const formatId = draft?.loaded.format ?? doc?.format ?? "turtle";
  const formats: {
    id: SourceFormat;
    name: string;
    extension: string;
    graphs: boolean;
  }[] = [
    { id: "trig", name: "TriG", extension: ".trig", graphs: true },
    { id: "jsonld", name: "JSON-LD", extension: ".jsonld", graphs: true },
    { id: "nquads", name: "N-Quads", extension: ".nq", graphs: true },
    { id: "turtle", name: "Turtle", extension: ".ttl", graphs: false },
    { id: "rdfxml", name: "RDF/XML", extension: ".rdf, .owl", graphs: false },
    { id: "ntriples", name: "N-Triples", extension: ".nt", graphs: false },
  ];
  const selectedFormat = formats.find((f) => f.id === formatId)!;
  const reloadSource = () => {
    setSourceDraft();
    setError("");
    setNotice(false);
    setReload((n) => n + 1);
  };
  const status = loading
    ? "Loading source..."
    : busy
      ? "Applying source..."
      : stale
        ? "Draft is stale"
        : invalid
          ? line
            ? `Invalid on line ${line}`
            : "Invalid"
          : draft
            ? "Draft pending"
            : !doc
              ? "Source unavailable"
              : "Clean";
  return (
    <UtilityFrame
      id="source"
      label="Ontology source editor"
      toolbar={
        <UtilityToolbar
          label="Source actions"
          primaryWidth={200}
          primary={
            <select
              className="sel"
              aria-label="Source format"
              value={formatId}
              disabled={busy || loading || stale}
              onChange={(e) => void convert(e.target.value as SourceFormat)}
            >
              {formats.map((f) => (
                <option
                  key={f.id}
                  value={f.id}
                  disabled={doc?.namedGraphs && !f.graphs}
                >
                  {f.name}
                  {doc?.namedGraphs && !f.graphs
                    ? ", cannot keep named graphs"
                    : ""}
                </option>
              ))}
            </select>
          }
          state={
            <span className="utility-source-status" role="status">
              {status}
            </span>
          }
          stateKind={
            stale || invalid || (!loading && !doc)
              ? "badink"
              : draft
                ? "warnink"
                : ""
          }
          afterState={
            <button
              className="btn primary"
              disabled={!draft || busy || loading || stale || invalid}
              onClick={() => void apply()}
            >
              Apply changes
            </button>
          }
          actions={[
            {
              id: "discard",
              label: "Discard draft and reload",
              priority: 1,
              disabled: !draft || busy || loading,
              run: reloadSource,
            },
            {
              id: "find",
              label: "Find selected entity",
              priority: 2,
              disabled: !snapshot.selected || loading,
              run: findSelected,
            },
          ]}
          items={[
            {
              id: "reload",
              label: "Reload from ontology",
              disabled: busy || loading,
              run: reloadSource,
            },
          ]}
        />
      }
      head={
        stale ? (
          <div className="note2 bad3" role="alert">
            <b>
              Another view changed the ontology while this draft was pending.
            </b>
            {
              " The draft is kept and cannot overwrite the newer version. Copy anything you want, then discard and reload to work from the current ontology."
            }
          </div>
        ) : error ? (
          <div className="note2 bad3" role="alert">
            {invalid ? (
              <>
                <b>{parserMessage}</b>
                {
                  " The text stays here and the ontology is unchanged until it parses."
                }
              </>
            ) : (
              <ErrorNotice error={error} />
            )}
          </div>
        ) : draft ? (
          <div className="note2 wrn3">
            <b>Pending draft.</b>
            {
              " Typing does not change the ontology. Apply parses and validates the whole document, and a successful apply is one Undo operation. Closing the pane does not discard this text."
            }
          </div>
        ) : notice ? (
          <div className="note2">
            <b>
              The selected entity has no explicit identifier in this
              serialization.
            </b>
            {" Use Find to locate its label."}
          </div>
        ) : null
      }
      footer={
        <>
          <span>
            {selectedFormat.name + " "}
            <span className="num">{selectedFormat.extension}</span>
          </span>
          <span>
            {"named graphs " +
              (selectedFormat.graphs ? "preserved" : "not preserved")}
          </span>
          <span>
            <span className="num">
              {text.split("\n").length.toLocaleString()}
            </span>
            {" lines, "}
            <span className="num">{text.length.toLocaleString()}</span>
            {" characters"}
          </span>
          <span>
            {doc?.namedGraphs
              ? "this document contains a named graph"
              : "no named graphs"}
          </span>
          <span>
            conversion regenerates whitespace and prefixes, and does not keep
            comments
          </span>
        </>
      }
    >
      <div
        ref={area}
        className="source-area"
        style={
          {
            "--source-gutter": (layout.narrow ? 32 : 40) + "px",
          } as React.CSSProperties
        }
      >
        <div className="source-focus-surface" aria-hidden="true" />
        <div ref={host} className="source-editor" />
        <div
          ref={horizontal}
          className="source-horizontal"
          aria-hidden="true"
          tabIndex={-1}
        >
          <div ref={extent} className="source-extent">
            {text}
          </div>
        </div>
      </div>
    </UtilityFrame>
  );
}
