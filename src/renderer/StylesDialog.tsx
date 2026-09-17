import { StyleClassTree } from "./StyleClassTree";
import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "./Dialogs";
import { useSnapshot, request, savePanel } from "./client";
import {
  parseGraphStyle,
  styleExample,
  styleSelector,
  updateGraphStyle,
  nodeStyle,
  type StyleValues,
} from "../domain/graph-style";
import {
  graphPalettes,
  type GraphStyleCatalog,
} from "../domain/graph-appearance";
import { type Kind } from "../domain/model";
import { type GraphNode, nodeRadius } from "../domain/viewport";
import { Draw, render, kindToken } from "./scene";
import tokens from "../domain/data/tokens.json";

type Patch = Partial<Record<keyof StyleValues, string | number | undefined>>;
const pages = ["Nodes", "Relationships", "Sizing", "Advanced"] as const;
type StylePage = (typeof pages)[number];
function NumberSetting({
  label,
  value,
  min,
  max,
  change,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  change: (n: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <label>
      {label}
      <input
        type="number"
        min={min}
        max={max}
        step="1"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => {
          if (draft !== "" && e.currentTarget.validity.valid)
            change(Number(draft));
          else setDraft(String(value));
        }}
      />
    </label>
  );
}
function Sizing({
  values,
  change,
  inherit = false,
}: {
  values: StyleValues;
  change: (p: Patch) => void;
  inherit?: boolean;
}) {
  const mode =
    values["size-by"] ??
    (values.size !== undefined ? "fixed" : inherit ? "inherit" : "auto");
  return (
    <>
      <label>
        Size by
        <select
          value={mode}
          onChange={(e) => {
            const value = e.target.value;
            change({
              "size-by": value === "inherit" ? undefined : value,
              size: value === "fixed" ? (values.size ?? 32) : undefined,
            });
          }}
        >
          {inherit && <option value="inherit">Use global sizing</option>}
          <option value="auto">Axiom default</option>
          <option value="fixed">Fixed size</option>
          <option value="connections">Connections</option>
          <option value="instances">Direct instances</option>
          <option value="count">Nodes of the same kind</option>
          <option value="weighted">Weighted combination</option>
        </select>
      </label>
      {mode === "fixed" && (
        <NumberSetting
          label="Diameter (px)"
          min={6}
          max={120}
          value={values.size ?? 32}
          change={(n) => change({ size: n })}
        />
      )}
      {!["inherit", "auto", "fixed"].includes(mode) && (
        <>
          <div className="appearance-fields">
            <NumberSetting
              label="Minimum diameter (px)"
              min={6}
              max={values["size-max"] ?? 64}
              value={values["size-min"] ?? 16}
              change={(n) => change({ "size-min": n })}
            />
            <NumberSetting
              label="Maximum diameter (px)"
              min={values["size-min"] ?? 16}
              max={120}
              value={values["size-max"] ?? 64}
              change={(n) => change({ "size-max": n })}
            />
          </div>
          <label>
            Distribution
            <select
              value={values["size-scale"] ?? "linear"}
              onChange={(e) => change({ "size-scale": e.target.value })}
            >
              <option value="linear">Proportional area</option>
              <option value="log">Logarithmic area (reduce outliers)</option>
            </select>
          </label>
          {mode === "weighted" && (
            <div className="appearance-fields appearance-weights">
              <NumberSetting
                label="Connections weight"
                min={0}
                max={100}
                value={values["connections-weight"] ?? 50}
                change={(n) => change({ "connections-weight": n })}
              />
              <NumberSetting
                label="Instances weight"
                min={0}
                max={100}
                value={values["instances-weight"] ?? 50}
                change={(n) => change({ "instances-weight": n })}
              />
              <NumberSetting
                label="Same-kind count weight"
                min={0}
                max={100}
                value={values["count-weight"] ?? 0}
                change={(n) => change({ "count-weight": n })}
              />
            </div>
          )}
          <p className="appearance-help">
            Each count is compared with its dataset maximum before weighting.
            Zero counts use the minimum size. Expanding the graph does not
            change the scale.
          </p>
        </>
      )}
    </>
  );
}
function sampleNode(
  iri: string,
  kind: Kind,
  label: string,
  x: number,
  score: number,
  catalog?: GraphStyleCatalog,
): GraphNode {
  const m = catalog?.maximums ?? {
    connections: 10,
    instances: 100,
    count: 100,
  };
  const degree = Math.round(m.connections * score);
  return {
    iri,
    kind,
    label,
    x,
    y: 58,
    vx: 0,
    vy: 0,
    degree,
    radius: nodeRadius(degree, kind),
    charge: 0,
    shownDegree: degree,
    distance: 0,
    touched: 0,
    pinned: false,
    expanded: false,
    dragging: false,
    styleMetrics: {
      connections: degree,
      instances: m.instances * score,
      count: m.count * score,
      maxConnections: m.connections,
      maxInstances: m.instances,
      maxCount: m.count,
    },
  };
}
export function StylesDialog({
  close,
  advanced = false,
}: {
  close: () => void;
  advanced?: boolean;
}) {
  const s = useSnapshot()!,
    epoch = useRef(s.datasetEpoch),
    [text, setText] = useState(s.graph.stylesheet ?? ""),
    [error, setError] = useState(""),
    [catalog, setCatalog] = useState<GraphStyleCatalog>(),
    [loading, setLoading] = useState(true),
    [page, setPage] = useState<StylePage>(advanced ? "Advanced" : "Nodes"),
    [scope, setScope] = useState("kinds"),
    [classTarget, setClassTarget] = useState("node"),
    [filter, setFilter] = useState(""),
    [chosen, setChosen] = useState(""),
    [limit, setLimit] = useState(80),
    [palette, setPalette] = useState(0),
    [previewDark, setPreviewDark] = useState(false),
    [busy, setBusy] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let active = true;
    setLoading(true);
    request<GraphStyleCatalog>("graphStyleCatalog")
      .then((c) => {
        if (active) setCatalog(c);
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
  }, [s.version, s.datasetEpoch]);
  const parsed = useMemo(() => {
    try {
      return { rules: parseGraphStyle(text), error: "" };
    } catch (e) {
      return { rules: [], error: (e as Error).message };
    }
  }, [text]);
  const items =
    page === "Relationships"
      ? (catalog?.predicates ?? [])
      : scope === "kinds"
        ? (catalog?.kinds ?? [])
        : (catalog?.classes ?? []);
  const filtered = items.filter((x) =>
    (x.label + " " + x.id).toLowerCase().includes(filter.toLowerCase()),
  );
  const chosenItem =
    items.find((x) => x.id === chosen) ??
    (scope === "classes" && page === "Nodes" && !filter
      ? items.find((x) => x.id === s.selected)
      : undefined) ??
    filtered[0];
  const selector =
    page === "Sizing"
      ? "node"
      : page === "Relationships"
        ? chosenItem
          ? 'edge[predicate="' + chosenItem.id + '"]'
          : "edge"
        : !chosenItem
          ? "node"
          : scope === "kinds"
            ? "node." + chosenItem.id
            : "node[" +
              (classTarget === "node"
                ? "iri"
                : classTarget === "branch"
                  ? "ancestor"
                  : "type") +
              '="' +
              chosenItem.id +
              '"]';
  const values: StyleValues = Object.assign(
    {},
    ...parsed.rules
      .filter((r) => styleSelector(r) === selector)
      .map((r) => r.values),
  );
  const change = (patch: Patch) => {
    try {
      const next = updateGraphStyle(text, selector, patch);
      setText(next);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const applyPalette = () => {
    if (!catalog) return;
    try {
      let next = text;
      const entries =
        page === "Relationships" ? catalog.predicates : catalog.kinds;
      // IRI/kind order makes assignments independent of translated labels and filters.
      [...entries]
        .sort((a, b) => a.id.localeCompare(b.id))
        .forEach((item, i) => {
          const sel =
            page === "Relationships"
              ? 'edge[predicate="' + item.id + '"]'
              : "node." + item.id;
          next = updateGraphStyle(next, sel, {
            [page === "Relationships" ? "stroke" : "fill"]:
              graphPalettes[palette].colors[
                i % graphPalettes[palette].colors.length
              ],
          });
        });
      setText(next);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const resetRule = () =>
    change(Object.fromEntries(Object.keys(values).map((k) => [k, undefined])));
  const kind: Kind =
    scope === "classes" && classTarget === "instances"
      ? "Individual"
      : (chosenItem?.kind ?? "Class");
  const previewNodes =
    page === "Sizing"
      ? [0, 0.5, 1].map((score, i) =>
          sampleNode(
            "preview-" + i,
            "Class",
            ["Zero", "Half maximum", "Maximum"][i],
            [84, 260, 436][i],
            score,
            catalog,
          ),
        )
      : [
          sampleNode(
            scope === "classes" &&
              classTarget !== "instances" &&
              page === "Nodes"
              ? (chosenItem?.id ?? "preview-a")
              : "preview-a",
            page === "Relationships" ? "Class" : kind,
            page === "Relationships" ? "From" : (chosenItem?.label ?? "Node"),
            160,
            0.5,
            catalog,
          ),
          sampleNode("preview-b", "Class", "To", 400, 0.5, catalog),
        ].slice(0, page === "Relationships" ? 2 : 1);
  if (
    page === "Nodes" &&
    scope === "classes" &&
    classTarget === "instances" &&
    previewNodes[0]
  )
    previewNodes[0].types = [chosenItem?.id ?? ""];
  if (page === "Nodes" && previewNodes[0]) {
    previewNodes[0].x = 260;
    if (classTarget === "branch")
      previewNodes[0].taxonomyAncestors = [chosenItem?.id ?? ""];
  }
  const previewSignature = JSON.stringify(previewNodes);
  useEffect(() => {
    const target = canvas.current;
    if (!target || parsed.error) return;
    const g = {
      ...s.graph,
      stylesheet: text,
      nodes: previewNodes,
      edges:
        page === "Relationships" && chosenItem
          ? [
              {
                source: "preview-a",
                target: "preview-b",
                predicate: chosenItem.id,
                parallelIndex: 0,
                parallelCount: 1,
              },
            ]
          : [],
      groups: [],
      rings: [],
      focus: [],
      selectedEdge: null,
      mode: "force" as const,
    };
    render(
      new Draw(target.getContext("2d")!, 520, 165),
      g,
      { x: 0, y: 12, zoom: 1 },
      previewDark,
      null,
      null,
      10,
      { allLabels: true },
    );
  }, [text, page, previewSignature, chosenItem?.id, previewDark, parsed.error]);
  const effective = nodeStyle(parsed.rules, previewNodes[0]);
  const colorKey = page === "Relationships" ? "stroke" : "fill";
  const fallbackColor =
    page === "Relationships"
      ? "#8492a6"
      : (previewDark ? tokens.dark : tokens.light)[
          kindToken[kind] as "e-class"
        ];
  const color =
    values[colorKey] ??
    (page === "Nodes" ? effective.fill : undefined) ??
    fallbackColor;
  const stale = epoch.current !== s.datasetEpoch;
  async function apply() {
    setBusy(true);
    try {
      parseGraphStyle(text);
      await request("stylesheet", { text, datasetEpoch: epoch.current });
      savePanel("graph.stylesheet", text, false);
      close();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  const catalogList = (
    <aside className="appearance-catalog" aria-label="Style categories">
      {page === "Nodes" && (
        <label>
          Browse
          <select
            value={scope}
            onChange={(e) => {
              setScope(e.target.value);
              setChosen("");
              setFilter("");
              setLimit(80);
            }}
          >
            <option value="kinds">Node kinds</option>
            <option value="classes">Ontology classes</option>
          </select>
        </label>
      )}
      <input
        aria-label="Find style category"
        placeholder={
          page === "Relationships"
            ? "Find relationship type"
            : "Find node category"
        }
        value={filter}
        onChange={(e) => {
          setFilter(e.target.value);
          setLimit(80);
        }}
      />
      <p className="appearance-help">
        {filtered.length.toLocaleString()}{" "}
        {page === "Relationships" ? "relationship types" : "categories"} ·{" "}
        {scope === "classes" && page === "Nodes"
          ? "direct instances"
          : "dataset counts"}
      </p>
      {scope === "classes" && page === "Nodes" ? (
        <StyleClassTree
          filter={filter}
          selected={chosenItem?.id}
          select={setChosen}
        />
      ) : (
        <div className="appearance-list">
          {filtered.slice(0, limit).map((item) => (
            <button
              type="button"
              key={item.id}
              title={item.id}
              aria-pressed={item.id === chosenItem?.id}
              onClick={() => setChosen(item.id)}
            >
              <span>{item.label}</span>
              <span className="appearance-count">
                {item.count.toLocaleString()}
              </span>
            </button>
          ))}
          {!filtered.length && !loading && <p>No matching categories.</p>}
          {filtered.length > limit && (
            <button onClick={() => setLimit(limit + 80)}>
              Show more ({filtered.length - limit})
            </button>
          )}
        </div>
      )}
    </aside>
  );
  return (
    <Modal
      title={advanced ? "Graph stylesheet" : "Graph appearance"}
      close={close}
    >
      <div className="graph-appearance">
        <p className="appearance-summary">
          {loading
            ? "Analyzing graph categories..."
            : catalog
              ? catalog.nodes.toLocaleString() +
                " nodes · " +
                catalog.relationships.toLocaleString() +
                " relationships across the dataset"
              : "Graph appearance settings"}
        </p>
        <div
          role="tablist"
          aria-label="Graph appearance sections"
          className="appearance-tabs"
        >
          {pages.map((name, i) => (
            <button
              role="tab"
              key={name}
              id={"appearance-tab-" + name}
              aria-controls="appearance-panel"
              aria-selected={page === name}
              tabIndex={page === name ? 0 : -1}
              onClick={() => {
                setPage(name);
                setChosen("");
                setFilter("");
                setLimit(80);
              }}
              onKeyDown={(e) => {
                const next =
                  e.key === "ArrowRight"
                    ? (i + 1) % pages.length
                    : e.key === "ArrowLeft"
                      ? (i + pages.length - 1) % pages.length
                      : e.key === "Home"
                        ? 0
                        : e.key === "End"
                          ? pages.length - 1
                          : -1;
                if (next >= 0) {
                  e.preventDefault();
                  setPage(pages[next]);
                  setChosen("");
                  setFilter("");
                  (
                    e.currentTarget.parentElement?.children[next] as HTMLElement
                  ).focus();
                }
              }}
            >
              {name}
            </button>
          ))}
        </div>
        <div
          id="appearance-panel"
          role="tabpanel"
          aria-labelledby={"appearance-tab-" + page}
          className={
            "appearance-panel " +
            (page === "Sizing" || page === "Advanced" ? "appearance-wide" : "")
          }
        >
          {page !== "Sizing" && page !== "Advanced" && catalogList}
          <div className="appearance-editor">
            {page === "Advanced" ? (
              <>
                <p>
                  Edit the CSS-like stylesheet. These rules also control PNG and
                  SVG exports.
                </p>
                <textarea
                  aria-label="Graph stylesheet"
                  className="code-input"
                  spellCheck={false}
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    setError("");
                  }}
                  rows={16}
                />
                <details>
                  <summary>Selectors and properties</summary>
                  <p>
                    Selectors: node, node.Class, node.Defined,
                    node.Intersection, node.Individual, node.ObjectProperty,
                    node.DataProperty, node.AnnotationProperty, node.Resource,
                    node.Datatype, node:selected, node:pinned, node[iri="..."],
                    node[type="..."], edge[predicate="..."],
                    graph[theme="dark"].
                  </p>
                  <p>
                    Nodes: fill, stroke, stroke-width, size, shape, color,
                    font-size, label, opacity. Edges: stroke, stroke-width,
                    opacity, line-style. Graph: background.
                  </p>
                  <p>
                    Sizing: size-by (auto, fixed, connections, instances, count,
                    weighted), size-min, size-max, size-scale (linear, log),
                    connections-weight, instances-weight, count-weight. Sizes
                    are graph pixels, between 6 and 120.
                  </p>
                  <p>
                    Specific selectors override general rules. With equal
                    specificity, the last matching rule wins. This also applies
                    to individuals with multiple types.
                  </p>
                </details>
                <button
                  onClick={() => {
                    setText(styleExample);
                    setError("");
                  }}
                >
                  Load example
                </button>
              </>
            ) : (
              <>
                <div className="appearance-preview">
                  <canvas
                    ref={canvas}
                    width={520}
                    height={165}
                    role="img"
                    aria-label="Graph style preview"
                  />
                  <label>
                    <input
                      type="checkbox"
                      checked={previewDark}
                      onChange={(e) => setPreviewDark(e.target.checked)}
                    />
                    Dark preview
                  </label>
                  <span>Sample appearance</span>
                </div>
                {page === "Sizing" ? (
                  <>
                    <h3>Global node sizing</h3>
                    <Sizing values={values} change={change} />
                    <details>
                      <summary>What the counts mean</summary>
                      <p>
                        Connections counts graph relationships attached to each
                        node, including those outside the visible graph. Direct
                        instances counts individuals explicitly assigned to a
                        class. Nodes of the same kind counts all Class,
                        Individual, or other nodes of that kind.
                      </p>
                      <p>
                        Weighted combination averages the normalized counts
                        using your weights. For example, weights of 25 for
                        connections and 75 for instances give instances three
                        times the influence. Counts update when the dataset
                        changes. Styles for a specific node, kind, or class can
                        override global sizing.
                      </p>
                    </details>
                  </>
                ) : (
                  chosenItem && (
                    <>
                      <h3 title={chosenItem.id}>{chosenItem.label}</h3>
                      {scope === "classes" && page === "Nodes" && (
                        <label>
                          Apply to
                          <select
                            value={classTarget}
                            onChange={(e) => setClassTarget(e.target.value)}
                          >
                            <option value="node">The class node</option>
                            <option value="branch">
                              Class and all subclasses
                            </option>
                            <option value="instances">
                              Instances of this class (
                              {chosenItem.count.toLocaleString()})
                            </option>
                          </select>
                        </label>
                      )}
                      <div className="appearance-fields">
                        <label>
                          {page === "Relationships"
                            ? "Line color"
                            : "Fill color"}
                          <input
                            aria-label={
                              page === "Relationships"
                                ? "Line color"
                                : "Fill color"
                            }
                            type="color"
                            value={color}
                            onChange={(e) =>
                              change({ [colorKey]: e.target.value })
                            }
                          />
                        </label>
                        <label>
                          Palette
                          <select
                            value={palette}
                            onChange={(e) => setPalette(Number(e.target.value))}
                          >
                            {graphPalettes.map((p, i) => (
                              <option key={p.id} value={i}>
                                {p.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <div
                        className="appearance-swatches"
                        aria-label="Palette colors"
                      >
                        {graphPalettes[palette].colors.map((c) => (
                          <button
                            key={c}
                            aria-label={"Use color " + c}
                            title={c}
                            style={{ background: c }}
                            onClick={() => change({ [colorKey]: c })}
                          />
                        ))}
                      </div>
                      <div className="appearance-palette-actions">
                        <button
                          onClick={() => change({ [colorKey]: undefined })}
                        >
                          Use inherited color
                        </button>
                        {(scope === "kinds" || page === "Relationships") && (
                          <button onClick={applyPalette}>
                            Apply palette to{" "}
                            {page === "Relationships"
                              ? "relationship types"
                              : "node kinds"}
                          </button>
                        )}
                      </div>
                      <p className="appearance-help">
                        Colors repeat when categories exceed the palette. Labels
                        and shapes remain available to distinguish them.
                      </p>
                      {page === "Relationships" ? (
                        <>
                          <div className="appearance-fields">
                            <NumberSetting
                              label="Line width (px)"
                              min={0}
                              max={12}
                              value={values["stroke-width"] ?? 1}
                              change={(n) => change({ "stroke-width": n })}
                            />
                            <label>
                              Line style
                              <select
                                value={values["line-style"] ?? "inherit"}
                                onChange={(e) =>
                                  change({
                                    "line-style":
                                      e.target.value === "inherit"
                                        ? undefined
                                        : e.target.value,
                                  })
                                }
                              >
                                <option value="inherit">Inherit</option>
                                <option value="solid">Solid</option>
                                <option value="dashed">Dashed</option>
                              </select>
                            </label>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="appearance-fields">
                            <label>
                              Shape
                              <select
                                value={values.shape ?? "inherit"}
                                onChange={(e) =>
                                  change({
                                    shape:
                                      e.target.value === "inherit"
                                        ? undefined
                                        : e.target.value,
                                  })
                                }
                              >
                                <option value="inherit">Inherit</option>
                                {["circle", "square", "diamond", "hexagon"].map(
                                  (x) => (
                                    <option key={x}>{x}</option>
                                  ),
                                )}
                              </select>
                            </label>
                            <label>
                              Caption
                              <select
                                value={values.label ?? "inherit"}
                                onChange={(e) =>
                                  change({
                                    label:
                                      e.target.value === "inherit"
                                        ? undefined
                                        : e.target.value,
                                  })
                                }
                              >
                                <option value="inherit">Inherit</option>
                                <option value="name">Name</option>
                                <option value="iri">Identifier (IRI)</option>
                                <option value="none">None</option>
                              </select>
                            </label>
                          </div>
                          <Sizing values={values} change={change} inherit />
                        </>
                      )}
                      <button
                        onClick={resetRule}
                        disabled={!Object.keys(values).length}
                      >
                        Reset this rule
                      </button>
                    </>
                  )
                )}
              </>
            )}
          </div>
        </div>
        {(error || parsed.error || stale) && (
          <p role="alert">
            {stale
              ? "The workspace changed. Close and reopen these settings."
              : error || parsed.error}
          </p>
        )}
        <footer>
          <button
            onClick={() => {
              setText("");
              setError("");
            }}
          >
            Reset styles
          </button>
          <span className="appearance-footer-space" />
          <button onClick={close}>Cancel</button>
          <button
            className="primary"
            disabled={busy || stale || !!parsed.error || !!error}
            onClick={() => void apply()}
          >
            {busy ? "Applying..." : "Apply"}
          </button>
        </footer>
      </div>
    </Modal>
  );
}
