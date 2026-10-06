import { registerEditorMenu } from "./editor-menu-keys";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as monaco from "monaco-editor/editor/editor.api.js";
import "monaco-editor/editor/contrib/find/browser/findController.js";
import "monaco-editor/editor/contrib/clipboard/browser/clipboard.js";
import "monaco-editor/editor/contrib/hover/browser/hoverContribution.js";
import { onCommand, request, command, setState, state } from "./client";
import "monaco-editor/editor/contrib/contextmenu/browser/contextmenu.js";
import type { Snapshot } from "../shared/protocol";
import {
  useTextAnalysis,
  updateAnalysisText,
  textAnalysisSession,
  attachTextEditor,
  inspectTextEntity,
  setTextAnalysisView,
  waitForCurrentTextAnalysis,
} from "./text-analysis-state";
import { TextAnalysisSummary } from "./TextAnalysisSummary";
import { textEntityGroups } from "./text-analysis-session";
import {
  entityHue,
  type TextAnalysisResult,
  type TextEntity,
} from "../shared/text-analysis";
import { defaultFindOptions } from "../shared/find";
import { findState, rememberFind, updateFind } from "./find-state";

function matchedOntologyIris(result?: TextAnalysisResult) {
  return [
    ...new Set(
      (result?.entities ?? [])
        .filter((entity) => entity.source === "ontology")
        .flatMap((entity) =>
          result?.concepts && Object.hasOwn(result.concepts, entity.label)
            ? result.concepts[entity.label].map((concept) => concept.iri)
            : [],
        ),
    ),
  ];
}

export function TextAnalysisPanel() {
  const { snapshot, input, analysis, result, view } = useTextAnalysis();
  const text = input.text;
  const [selectedText, setSelectedText] = useState("");
  const addSelection = useRef<() => void>(() => {});
  const [graphError, setGraphError] = useState("");
  const [openingGraph, setOpeningGraph] = useState(false);
  const graphPending = useRef(false);
  const interaction = useRef<{
    result: TextAnalysisResult;
  } | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const decorations = useRef<monaco.editor.IEditorDecorationsCollection | null>(
    null,
  );
  useLayoutEffect(() => {
    if (!host.current) return;
    const owner = host.current.ownerDocument;
    const model = monaco.editor.createModel(
      textAnalysisSession.getSnapshot().input.text,
      "plaintext",
    );
    const instance = monaco.editor.create(host.current, {
      model,
      editContext: false,
      automaticLayout: true,
      wordWrap: "on",
      minimap: { enabled: false },
      lineNumbers: "off",
      glyphMargin: false,
      folding: false,
      lineDecorationsWidth: 10,
      fontSize: 15,
      lineHeight: 26,
      padding: { top: 12, bottom: 12 },
      scrollBeyondLastLine: false,
      renderLineHighlight: "none",
      ariaLabel: "Text to analyze",
      theme: owner.documentElement.dataset.theme === "dark" ? "vs-dark" : "vs",
    });
    editor.current = instance;
    const removeEditorMenu = registerEditorMenu(instance);
    decorations.current = instance.createDecorationsCollection();
    const trackedRange = (entity: TextEntity) => {
      const displayed = interaction.current?.result;
      const index = displayed?.entities.indexOf(entity) ?? -1;
      const range = index < 0 ? null : decorations.current?.getRange(index);
      // Decorations track insertions, but an edited/deleted word must not open
      // the concept that used to occupy its old offsets.
      return range &&
        !range.isEmpty() &&
        model.getValueInRange(range) ===
          displayed!.text.slice(entity.start, entity.end)
        ? range
        : undefined;
    };
    const selectedMatch = (selection: monaco.Selection) =>
      interaction.current?.result.entities.some((entity) =>
        trackedRange(entity)?.equalsRange(selection),
      );
    const detach = attachTextEditor({
      focus: () => {
        // The editor stays mounted beneath Summary; wait for React to reveal it.
        owner.defaultView?.requestAnimationFrame(() => {
          if (textAnalysisSession.getSnapshot().view === "text")
            instance.focus();
        });
      },
      select: (entity) => {
        let range = trackedRange(entity);
        const analysis = textAnalysisSession.getSnapshot().analysis;
        // A legend can reopen an editor before its decoration effect runs.
        if (
          !range &&
          analysis.status === "ready" &&
          analysis.result.text === model.getValue() &&
          analysis.result.entities.includes(entity)
        ) {
          const start = model.getPositionAt(entity.start),
            end = model.getPositionAt(entity.end);
          range = new monaco.Range(
            start.lineNumber,
            start.column,
            end.lineNumber,
            end.column,
          );
        }
        if (!range) return false;
        instance.setSelection(range);
        instance.revealRangeInCenterIfOutsideViewport(range);
        return true;
      },
    });
    const change = instance.onDidChangeModelContent(() => {
      updateAnalysisText(instance.getValue());
    });
    const showDetails = (offset: number, key?: string) => {
      const current = interaction.current;
      if (!current) return;
      const candidates = current.result.entities
        .filter((entity) => !key || entity.key === key)
        .flatMap((entity) => {
          const range = trackedRange(entity);
          return range
            ? [
                {
                  entity,
                  start: model.getOffsetAt(range.getStartPosition()),
                  end: model.getOffsetAt(range.getEndPosition()),
                },
              ]
            : [];
        });
      const entity =
        candidates.find(
          (entity) => offset >= entity.start && offset < entity.end,
        ) ?? candidates.find((entity) => offset === entity.end);
      if (entity) {
        void inspectTextEntity(entity.entity);
      }
    };
    let down: { x: number; y: number } | undefined;
    const mouseDown = instance.onMouseDown((event) => {
      down = event.event.leftButton
        ? { x: event.event.posx, y: event.event.posy }
        : undefined;
    });
    const mouseUp = instance.onMouseUp((event) => {
      const start = down;
      down = undefined;
      if (
        !start ||
        !event.target.position ||
        event.event.detail !== 1 ||
        Math.hypot(start.x - event.event.posx, start.y - event.event.posy) > 4
      )
        return;
      const selection = instance.getSelection();
      if (selection && !selection.isEmpty()) {
        if (!selectedMatch(selection)) return;
      }
      if (event.target.type === monaco.editor.MouseTargetType.CONTENT_TEXT)
        showDetails(model.getOffsetAt(event.target.position));
    });
    const selectionChanged = instance.onDidChangeCursorSelection(() => {
      const selection = instance.getSelection();
      setSelectedText(
        selection && instance.getSelections()?.length === 1
          ? model.getValueInRange(selection).trim()
          : "",
      );
    });
    const addAction = instance.addAction({
      id: "textanalysis.addSelection",
      label: "Add entity",
      contextMenuGroupId: "9_cutcopypaste",
      contextMenuOrder: 5,
      precondition: "editorHasSelection",
      run: () => addSelection.current(),
    });
    const findAction = instance.addAction({
      id: "textanalysis.findSelection",
      label: "Find",
      contextMenuGroupId: "9_cutcopypaste",
      contextMenuOrder: 4,
      precondition: "editorHasSelection",
      run: () => {
        const selection = instance.getSelection();
        if (!selection || instance.getSelections()?.length !== 1) return;
        const text = model.getValueInRange(selection).trim();
        if (!text) return;
        updateFind({
          ...defaultFindOptions,
          limit: findState().options.limit,
          text,
        });
        rememberFind();
        command("view.find");
      },
    });
    const commands = onCommand((id) => {
      if (!instance.hasTextFocus()) return;
      if (id === "textanalysis.details") {
        const selection = instance.getSelection();
        if (selection && !selection.isEmpty()) {
          const start = model.getOffsetAt(selection.getStartPosition());
          if (selectedMatch(selection)) showDetails(start);
          else addSelection.current();
        } else {
          const position = instance.getPosition();
          if (position) showDetails(model.getOffsetAt(position));
        }
      }
      if (id === "edit.undo") instance.trigger("menu", "undo", null);
      if (id === "edit.redo") instance.trigger("menu", "redo", null);
      if (id === "textanalysis.find")
        void instance.getAction("actions.find")?.run();
    });
    const observer = new MutationObserver(() =>
      monaco.editor.setTheme(
        owner.documentElement.dataset.theme === "dark" ? "vs-dark" : "vs",
      ),
    );
    observer.observe(owner.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => {
      detach();
      observer.disconnect();
      commands();
      mouseDown.dispose();
      mouseUp.dispose();
      change.dispose();
      selectionChanged.dispose();
      addAction.dispose();
      findAction.dispose();
      removeEditorMenu();
      instance.dispose();
      model.dispose();
      editor.current = null;
      decorations.current = null;
      interaction.current = null;
    };
  }, []);
  useEffect(() => {
    const instance = editor.current;
    const currentText = textAnalysisSession.getSnapshot().input.text;
    if (instance && instance.getValue() !== currentText)
      instance.setValue(currentText);
    setGraphError("");
  }, [text, snapshot.datasetEpoch, snapshot.version]);
  addSelection.current = () => {
    const instance = editor.current,
      model = instance?.getModel(),
      selection = instance?.getSelection();
    if (!model || !selection || instance?.getSelections()?.length !== 1) return;
    const phrase = model.getValueInRange(selection).trim();
    if (!phrase || phrase.length > 256) return;
    const raw = model.getValueInRange(selection);
    textAnalysisSession.create(
      phrase,
      model.getOffsetAt(selection.getStartPosition()) + raw.indexOf(phrase),
    );
    command("textentities.open");
  };
  const entities = result?.entities ?? [];
  const legend = useMemo(() => textEntityGroups(result), [result]);
  const matchedIris = useMemo(() => matchedOntologyIris(result), [result]);
  const openGraph = async () => {
    if (!result || !matchedIris.length || graphPending.current) return;
    graphPending.current = true;
    setOpeningGraph(true);
    setGraphError("");
    try {
      const fresh = await waitForCurrentTextAnalysis();
      if (
        !fresh ||
        !editor.current ||
        fresh.datasetEpoch !== state?.datasetEpoch ||
        fresh.version !== state.version
      )
        return;
      const iris = matchedOntologyIris(fresh);
      if (!iris.length) return;
      const id = await request<string>("graphCreate", {
        textAnalysis: iris,
        datasetEpoch: fresh.datasetEpoch,
        version: fresh.version,
      });
      if (!editor.current || state?.datasetEpoch !== fresh.datasetEpoch) return;
      setState(await request<Snapshot>("state"));
      if (state?.datasetEpoch === fresh.datasetEpoch) command("view." + id);
    } catch (error) {
      setGraphError(error instanceof Error ? error.message : String(error));
    } finally {
      graphPending.current = false;
      setOpeningGraph(false);
    }
  };
  useLayoutEffect(() => {
    const model = editor.current?.getModel();
    if (!model || !result || model.getValue() !== result.text) {
      decorations.current?.clear();
      interaction.current = null;
      return;
    }
    interaction.current = { result };
    const classes = new Map(
      legend.map(({ entity }, i) => [entity.key, "text-entity-" + i]),
    );
    decorations.current?.set(
      result.entities.map((entity) => {
        const start = model.getPositionAt(entity.start),
          end = model.getPositionAt(entity.end);
        const hover = {
          value:
            `${entity.label} (${entity.source === "ontology" ? "Ontology" : "Named entity"}) ${entity.method}`.replace(
              /[\\`*_{}\[\]()<>#+.!|~]/g,
              "\\$&",
            ),
          isTrusted: false,
        };
        return {
          range: new monaco.Range(
            start.lineNumber,
            start.column,
            end.lineNumber,
            end.column,
          ),
          options: {
            inlineClassName: classes.get(entity.key),
            hoverMessage: hover,
            stickiness:
              monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
          },
        };
      }),
    );
  }, [result, legend]);
  const status = !text.trim()
    ? "Type or paste text to begin."
    : analysis.status === "error"
      ? "Analysis unavailable"
      : !result
        ? ""
        : `${entities.length} ${entities.length === 1 ? "match" : "matches"}`;
  return (
    <section
      className="panel text-analysis-panel"
      data-panel="textanalysis"
      aria-label="Text Analysis"
    >
      <style>
        {legend
          .map(({ entity }, i) => {
            const hue = entityHue(entity.key);
            return `.text-analysis-panel .text-entity-${i}{background:hsl(${hue} 75% 90%);color:#202020}[data-theme=dark] .text-analysis-panel .text-entity-${i}{background:hsl(${hue} 35% 27%);color:#fff}`;
          })
          .join("\n")}
      </style>
      <div className="text-analysis-heading">
        <strong>Text Analysis</strong>
        <span className="text-analysis-ontology" title={snapshot.ontology.name}>
          {snapshot.ontology.name}
        </span>
        <button
          className="text-analysis-graph"
          disabled={!matchedIris.length || openingGraph}
          title="Open all matched ontology entries and their ancestors in a new graph"
          onClick={() => void openGraph()}
        >
          {openingGraph ? "Opening..." : "View in Graph"}
        </button>
        {view === "text" && (
          <button
            disabled={!selectedText || selectedText.length > 256}
            title="Select a phrase of up to 256 characters, then add it to the taxonomy"
            onClick={() => addSelection.current()}
          >
            Add entity
          </button>
        )}
        <button
          onClick={() => {
            setTextAnalysisView(view === "text" ? "summary" : "text");
            if (view === "summary")
              requestAnimationFrame(() => editor.current?.focus());
          }}
        >
          {view === "text" ? "View Summary" : "View Text"}
        </button>
        <span
          role="status"
          aria-live="polite"
          className="text-analysis-status"
          title={result ? `Analysis took ${result.milliseconds} ms` : undefined}
        >
          {status}
        </span>
      </div>
      <p className="text-analysis-hint" hidden={view !== "text"}>
        Type or paste plain text. Matches update automatically using the open
        ontology. Click a highlight to open the Details view. Select a new
        phrase and choose Add entity, or press Alt+Enter.
      </p>
      {analysis.status === "error" && (
        <p role="alert" className="error text-analysis-error">
          {analysis.message}
        </p>
      )}
      {graphError && (
        <p role="alert" className="error text-analysis-error">
          {graphError}
        </p>
      )}
      <div
        className="text-analysis-editor"
        ref={host}
        hidden={view !== "text"}
      />
      <div className="text-analysis-summary-host" hidden={view !== "summary"}>
        <TextAnalysisSummary />
      </div>
    </section>
  );
}
