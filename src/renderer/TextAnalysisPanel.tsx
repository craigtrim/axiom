import { registerEditorMenu } from "./editor-menu-keys";
// craigtrim/axiom#111: Monaco's global theme must preserve source colours in other panes.
import { syntaxTheme } from "./syntax-theme";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as monaco from "monaco-editor/editor/editor.api.js";
import "monaco-editor/editor/contrib/find/browser/findController.js";
import "monaco-editor/editor/contrib/clipboard/browser/clipboard.js";
import "monaco-editor/editor/contrib/wordOperations/browser/wordOperations.js";
import "monaco-editor/editor/contrib/hover/browser/hoverContribution.js";
import { onCommand, request, command, setState, state } from "./client";
import "monaco-editor/editor/contrib/contextmenu/browser/contextmenu.js";
import type { Snapshot } from "../shared/protocol";
import {
  useTextAnalysis,
  editAnalysisText,
  flushAnalysisText,
  analyzeTextNow,
  textAnalysisSession,
  attachTextEditor,
  inspectTextEntity,
  setTextAnalysisView,
  waitForCurrentTextAnalysis,
  setLiveTextAnalysis,
} from "./text-analysis-state";
import { TextAnalysisToolbar } from "./TextAnalysisToolbar";
import { registerPaneRecovery, usePaneLayout } from "./AdaptivePane";
import "./text-analysis.css";
import { TextAnalysisSummary } from "./TextAnalysisSummary";
import { textEntityGroups, hasUnanalyzedText } from "./text-analysis-session";
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

// craigtrim/axiom#79: custom recovery copy uses the shared size thresholds.
registerPaneRecovery("textanalysis", {
  Body: ({ maximize }) => (
    <div className="text-analysis-recovery">
      <div className="id">Text Analysis</div>
      <div className="why">
        Too little room to edit. The text and its matches are retained.
      </div>
      <div>{maximize}</div>
    </div>
  ),
});

export function TextAnalysisPanel() {
  const session = useTextAnalysis();
  const { snapshot, input, analysis, result, view, liveAnalysis } = session;
  const layout = usePaneLayout();
  const [help, setHelp] = useState(false);
  const [toast, setToast] = useState("");
  useEffect(() => {
    if (layout.shallow || layout.recovery) setHelp(false);
  }, [layout.shallow, layout.recovery]);
  useEffect(() => {
    const remaining = (session.notice?.expiresAt ?? 0) - Date.now();
    if (!session.notice || remaining <= 0) {
      setToast("");
      return;
    }
    setToast(session.notice.tail);
    const timer = setTimeout(() => setToast(""), remaining);
    return () => clearTimeout(timer);
  }, [session.notice]);
  const outOfDate = hasUnanalyzedText(session);
  // craigtrim/axiom#73: manual mode keeps ordinary editing separate from analysis.
  const text = input.text;
  const [selectedText, setSelectedText] = useState("");
  const addSelection = useRef<() => void>(() => {});
  const [graphError, setGraphError] = useState("");
  const graphPending = useRef(false);
  const interaction = useRef<{
    result: TextAnalysisResult;
    byDecoration: Map<string, TextEntity>;
  } | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const scrollHost = useRef<HTMLDivElement>(null);
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const applyingText = useRef(false);
  const decorations = useRef<monaco.editor.IEditorDecorationsCollection | null>(
    null,
  );
  const refreshCaretDecoration = useRef<() => void>(() => {});
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
      automaticLayout: false,
      wordWrap: "on",
      wrappingStrategy: "advanced",
      minimap: { enabled: false },
      lineNumbers: "off",
      glyphMargin: false,
      folding: false,
      lineDecorationsWidth: 12,
      fontSize: 14,
      fontFamily: "Cascadia Mono, Cascadia Code, Consolas, monospace",
      lineHeight: 22,
      padding: { top: 10, bottom: 10 },
      scrollbar: {
        vertical: "hidden",
        verticalScrollbarSize: 12,
        useShadows: false,
      },
      overviewRulerLanes: 0,
      overviewRulerBorder: false,
      hideCursorInOverviewRuler: true,
      scrollBeyondLastLine: false,
      renderLineHighlight: "none",
      ariaLabel: "Text to analyze",
      theme: syntaxTheme(owner),
    });
    editor.current = instance;
    const scroll = scrollHost.current!;
    let layingOut = false;
    const layoutEditor = () => {
      if (layingOut || !host.current) return;
      layingOut = true;
      const width = host.current.clientWidth,
        height = host.current.clientHeight;
      if (!width || !height) {
        layingOut = false;
        return;
      }
      const before = instance.getLayoutInfo();
      // Measure overflow at the new viewport before reserving its scrollbar (#79).
      if (
        before.height !== height ||
        before.width + (scroll.hidden ? 0 : scroll.offsetWidth) !== width
      )
        instance.layout({ width, height });
      const overflow = instance.getContentHeight() > height;
      scroll.hidden = !overflow;
      const desiredWidth = Math.max(
        0,
        width - (overflow ? scroll.offsetWidth : 0),
      );
      const currentLayout = instance.getLayoutInfo();
      if (
        width &&
        height &&
        (currentLayout.width !== desiredWidth ||
          currentLayout.height !== height)
      )
        instance.layout({ width: desiredWidth, height });
      scroll.firstElementChild!.setAttribute(
        "style",
        `height:${instance.getContentHeight()}px`,
      );
      scroll.scrollTop = instance.getScrollTop();
      layingOut = false;
    };
    const resized = new ResizeObserver(layoutEditor);
    resized.observe(host.current);
    const contentSize = instance.onDidContentSizeChange(layoutEditor);
    const scrolled = instance.onDidScrollChange(() => {
      scroll.scrollTop = instance.getScrollTop();
    });
    const scrollEditor = () => instance.setScrollTop(scroll.scrollTop);
    scroll.addEventListener("scroll", scrollEditor);
    layoutEditor();
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
    const caret = instance.createDecorationsCollection();
    // Query Monaco's interval tree instead of scanning every match during typing.
    const matchesAt = (range: monaco.IRange) =>
      model.getDecorationsInRange(range).flatMap((decoration) => {
        const entity = interaction.current?.byDecoration.get(decoration.id);
        return entity ? [{ entity, range: decoration.range }] : [];
      });
    const selectedMatch = (selection: monaco.Selection) =>
      matchesAt(selection).some((item) => item.range.equalsRange(selection));
    const refreshCaret = () => {
      const selection = instance.getSelection();
      const match =
        instance.hasTextFocus() && selection?.isEmpty()
          ? matchesAt(selection)[0]
          : undefined;
      caret.set(
        match
          ? [
              {
                range: match.range,
                options: {
                  inlineClassName: `ta-caret h${1 + (entityHue(match.entity.key) % 6)}`,
                },
              },
            ]
          : [],
      );
    };
    const focusChanged = instance.onDidFocusEditorText(refreshCaret);
    refreshCaretDecoration.current = refreshCaret;
    const blur = instance.onDidBlurEditorText(() => caret.clear());
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
      if (!applyingText.current) editAnalysisText(() => instance.getValue());
    });
    const showDetails = (offset: number, key?: string) => {
      const current = interaction.current;
      if (!current) return;
      const position = model.getPositionAt(offset);
      const match = matchesAt(
        new monaco.Range(
          position.lineNumber,
          position.column,
          position.lineNumber,
          position.column,
        ),
      ).find((item) => !key || item.entity.key === key);
      if (match) void inspectTextEntity(match.entity);
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
      // The mouse-up hit test can lag a decoration repaint; Monaco's committed
      // selection identifies the actual clicked text (craigtrim/axiom#79).
      if (
        selection &&
        event.target.type === monaco.editor.MouseTargetType.CONTENT_TEXT
      )
        showDetails(model.getOffsetAt(selection.getStartPosition()));
    });
    const selectionChanged = instance.onDidChangeCursorSelection(() => {
      refreshCaret();
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
      monaco.editor.setTheme(syntaxTheme(owner)),
    );
    observer.observe(owner.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => {
      flushAnalysisText();
      detach();
      resized.disconnect();
      contentSize.dispose();
      scrolled.dispose();
      scroll.removeEventListener("scroll", scrollEditor);
      observer.disconnect();
      commands();
      mouseDown.dispose();
      mouseUp.dispose();
      change.dispose();
      selectionChanged.dispose();
      focusChanged.dispose();
      blur.dispose();
      addAction.dispose();
      findAction.dispose();
      removeEditorMenu();
      instance.dispose();
      model.dispose();
      editor.current = null;
      decorations.current = null;
      refreshCaretDecoration.current = () => {};
      interaction.current = null;
    };
  }, []);
  useEffect(() => {
    const instance = editor.current;
    const current = textAnalysisSession.getSnapshot();
    if (
      instance &&
      !current.editing &&
      instance.getValue() !== current.input.text
    ) {
      applyingText.current = true;
      try {
        instance.setValue(current.input.text);
      } finally {
        applyingText.current = false;
      }
    }
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
  const openGraph = async () => {
    if (graphPending.current) return;
    graphPending.current = true;
    setGraphError("");
    try {
      const fresh = await waitForCurrentTextAnalysis(
        "View in Graph waits for the current matches before building.",
      );
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
    }
  };
  useLayoutEffect(() => {
    const model = editor.current?.getModel();
    if (!model || !result || model.getValue() !== result.text) {
      decorations.current?.clear();
      interaction.current = null;
      refreshCaretDecoration.current();
      return;
    }
    const byDecoration = new Map<string, TextEntity>();
    interaction.current = { result, byDecoration };
    const classes = new Map(
      legend.map(({ entity }, i) => [
        entity.key,
        `ta-match h${1 + (entityHue(entity.key) % 6)} text-entity-${i}`,
      ]),
    );
    const byStart = new Map(
      result.entities.map((entity) => [entity.start, entity]),
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
    for (const decoration of model.getAllDecorations()) {
      if (!decoration.options.inlineClassName?.startsWith("ta-match "))
        continue;
      const index = model.getOffsetAt(decoration.range.getStartPosition());
      const entity = byStart.get(index);
      if (entity) byDecoration.set(decoration.id, entity);
    }
    refreshCaretDecoration.current();
  }, [result, legend]);
  const helpCopy = (
    <>
      {liveAnalysis ? (
        <>
          Type or paste plain text. Matches update as you type. Click a
          highlight to open{" "}
        </>
      ) : (
        <>
          Type or paste plain text. Press <b>Analyze now</b> to update matches.
          Click a highlight to open{" "}
        </>
      )}
      <b>Details</b>. Select a phrase and press <b>Alt+Enter</b>, or right click
      and press <b>A</b>, to add it as an entity.
    </>
  );
  return (
    <section
      className={
        "panel shared-layer text-analysis-panel" + (outOfDate ? " drift" : "")
      }
      data-panel="textanalysis"
      aria-label="Text Analysis"
    >
      <TextAnalysisToolbar
        auto={liveAnalysis}
        stale={outOfDate}
        busy={!!session.waiting}
        count={entities.length}
        ontology={snapshot.ontology.name}
        view={view}
        canAdd={!!selectedText && selectedText.length <= 256}
        help={help}
        toggleAuto={() => setLiveTextAnalysis(!liveAnalysis)}
        analyze={analyzeTextNow}
        graph={() => void openGraph()}
        add={() => addSelection.current()}
        setView={setTextAnalysisView}
        toggleHelp={() => setHelp(!help)}
      />
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
      <div className="body">
        <div className="ed" hidden={view !== "text"}>
          <div className="text-analysis-editor" ref={host} />
          <div
            className="text-analysis-scroll"
            ref={scrollHost}
            aria-hidden="true"
            hidden
          >
            <div />
          </div>
          {!session.editing && !text && <div className="empty">{helpCopy}</div>}
        </div>
        <div className="text-analysis-summary-host" hidden={view !== "summary"}>
          {(liveAnalysis || view === "summary") && <TextAnalysisSummary />}
        </div>
        {help && (
          <div className="sheet">
            <button
              className="x"
              aria-label="Close help"
              onClick={() => setHelp(false)}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
            <p>{helpCopy}</p>
          </div>
        )}
        {toast && (
          <div className="toast" role="status">
            <b>Analyzing first.</b> <span className="sub">{toast}</span>
          </div>
        )}
      </div>
    </section>
  );
}
