import { useMemo, useState } from "react";
import { Modal } from "./Dialogs";
import {
  NumberField,
  NumberValidation,
  useNumberValidation,
} from "./NumberField";
import { state, report } from "./client";
import { exportScene, type Camera } from "./scene";
import { streamDiagram } from "./export-stream";
import { bigTiffNote, formatCeiling } from "../shared/raster-layout";
import type { GraphSnapshot } from "../shared/protocol";
import {
  defaultExportOptions,
  imageFormats,
  reportFormats,
  type ExportOptions,
} from "../shared/export";
export function ExportDialog({
  graph,
  camera,
  size,
  initialFormat = "png",
  close,
}: {
  graph: GraphSnapshot;
  camera: Camera;
  size: { width: number; height: number };
  initialFormat?: string;
  close: () => void;
}) {
  const numbers = useNumberValidation();
  const [snapshot] = useState(() => structuredClone(graph)),
    [epoch] = useState(state!.datasetEpoch),
    [version] = useState(state!.version),
    [selected] = useState(state!.selected);
  const [options, setOptions] = useState<ExportOptions>({
      ...defaultExportOptions,
      format: initialFormat,
      title: state!.ontology.name,
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const change = <K extends keyof ExportOptions>(
    key: K,
    value: ExportOptions[K],
  ) => setOptions((o) => ({ ...o, [key]: value }));
  const diagram = useMemo(() => {
    if (options.area !== "selection" || !selected) return snapshot;
    const ids = new Set([
      selected,
      ...snapshot.edges
        .filter((e) => e.source === selected || e.target === selected)
        .flatMap((e) => [e.source, e.target]),
    ]);
    return {
      ...snapshot,
      nodes: snapshot.nodes.filter((n) => ids.has(n.iri)),
      edges: snapshot.edges.filter(
        (e) => ids.has(e.source) && ids.has(e.target),
      ),
      groups: [],
      rings: [],
    };
  }, [snapshot, options.area, selected]);
  const raster =
    options.content === "diagram" && !["svg", "pdf"].includes(options.format);
  const compatibleTransparency =
    options.content === "diagram" &&
    ["png", "webp", "svg", "tiff", "clipboard"].includes(options.format);
  const hasDiagram =
    options.content === "diagram" ||
    (options.includeGraph && ["pdf", "html"].includes(options.format));
  const effectiveBackground = compatibleTransparency
    ? options.background
    : options.background === "dark"
      ? "dark"
      : "light";
  const preview = useMemo(
    () =>
      exportScene(diagram, options.background === "dark", "svg", selected, {
        ...options,
        background: effectiveBackground,
        viewport: options.area === "viewport" ? { ...size, camera } : undefined,
      }),
    [diagram, options, size, camera, selected],
  );
  // craigtrim/axiom#188: no Axiom maximum; only the chosen format's own ceiling stops an export.
  const pixels = {
      width: Math.max(1, Math.round(preview.width * options.scale)),
      height: Math.max(1, Math.round(preview.height * options.scale)),
    },
    ceiling = raster
      ? formatCeiling(options.format, pixels.width, pixels.height)
      : "",
    tiffNote = raster
      ? bigTiffNote(options.format, pixels.width, pixels.height)
      : "";
  async function save() {
    if (numbers.invalid || busy || ceiling) return;
    setBusy(true);
    setError("");
    try {
      const exportOptions = { ...options, background: effectiveBackground },
        request = {
          options: exportOptions,
          datasetEpoch: epoch,
          version,
          iris: diagram.nodes.map((n) => n.iri),
        };
      const result =
        options.content === "diagram" && options.format !== "pdf"
          ? await streamDiagram({
              diagram,
              selected,
              options: {
                ...exportOptions,
                viewport:
                  options.area === "viewport" ? { ...size, camera } : undefined,
              },
              svg: preview,
              request,
            })
          : await window.axiom.exportDocument({
              ...request,
              data: preview.data,
            });
      if (result) {
        report(
          result === "clipboard"
            ? "Graph copied to clipboard."
            : "Exported " + result,
        );
        close();
      }
    } catch (e) {
      setError(
        (e as Error).message.replace(
          /^Error invoking remote method '[^']+': Error: /,
          "",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <NumberValidation.Provider value={numbers.report}>
      <Modal
        title="Export"
        close={() => {
          if (!busy) close();
        }}
      >
        <div className="export-dialog">
          <div className="export-options">
            <label>
              Content
              <select
                aria-label="Export content"
                value={options.content}
                onChange={(e) =>
                  setOptions((o) => ({
                    ...o,
                    content: e.target.value as "diagram" | "report",
                    format: e.target.value === "report" ? "pdf" : "png",
                    landscape: e.target.value === "diagram",
                  }))
                }
              >
                <option value="diagram">Diagram</option>
                <option value="report">Ontology report</option>
              </select>
            </label>
            <label>
              Format
              <select
                aria-label="Export format"
                value={options.format}
                onChange={(e) => change("format", e.target.value)}
              >
                {(options.content === "diagram"
                  ? imageFormats
                  : reportFormats
                ).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {options.format !== "csv" && (
              <label className="wide-field">
                Title
                <input
                  aria-label="Export title"
                  value={options.title}
                  maxLength={500}
                  onChange={(e) => change("title", e.target.value)}
                />
              </label>
            )}
            {options.content === "diagram" ? (
              <label className="wide-field">
                Diagram area
                <select
                  aria-label="Diagram area"
                  value={options.area}
                  onChange={(e) =>
                    change("area", e.target.value as ExportOptions["area"])
                  }
                >
                  <option value="graph">All displayed nodes</option>
                  <option value="viewport">Current view</option>
                  <option value="selection" disabled={!selected}>
                    Selected node and connections
                  </option>
                </select>
              </label>
            ) : (
              <label className="wide-field">
                Report scope
                <select
                  aria-label="Report scope"
                  value={options.scope}
                  onChange={(e) =>
                    change("scope", e.target.value as "graph" | "ontology")
                  }
                >
                  <option value="graph">Displayed graph</option>
                  <option value="ontology">Complete ontology</option>
                </select>
              </label>
            )}
            {hasDiagram && (
              <label>
                {options.content === "report"
                  ? "Diagram background"
                  : "Background"}
                <select
                  aria-label="Export background"
                  value={
                    compatibleTransparency
                      ? options.background
                      : options.background === "dark"
                        ? "dark"
                        : "light"
                  }
                  onChange={(e) =>
                    change(
                      "background",
                      e.target.value as ExportOptions["background"],
                    )
                  }
                >
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                  {compatibleTransparency && (
                    <option value="transparent">Transparent</option>
                  )}
                </select>
              </label>
            )}
            {raster && (
              <label>
                Scale
                <NumberField
                  aria-label="Export scale"
                  min={0.25}
                  max={8}
                  step={0.25}
                  value={options.scale}
                  change={(value) => change("scale", value)}
                />
              </label>
            )}
            {raster && ["jpg", "webp"].includes(options.format) && (
              <label>
                Quality (%)
                <NumberField
                  aria-label="Image quality"
                  integer
                  min={1}
                  max={100}
                  value={options.quality}
                  change={(value) => change("quality", value)}
                />
              </label>
            )}
            {options.format === "pdf" && (
              <>
                <label>
                  Paper
                  <select
                    aria-label="PDF paper"
                    value={options.pageSize}
                    onChange={(e) =>
                      change(
                        "pageSize",
                        e.target.value as ExportOptions["pageSize"],
                      )
                    }
                  >
                    {["A4", "A3", "Letter", "Legal"].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Orientation
                  <select
                    aria-label="PDF orientation"
                    value={options.landscape ? "landscape" : "portrait"}
                    onChange={(e) =>
                      change("landscape", e.target.value === "landscape")
                    }
                  >
                    <option value="landscape">Landscape</option>
                    <option value="portrait">Portrait</option>
                  </select>
                </label>
                <label>
                  Margins (mm)
                  <NumberField
                    aria-label="PDF margins"
                    min={0}
                    max={40}
                    value={options.marginMm}
                    change={(value) => change("marginMm", value)}
                  />
                </label>
              </>
            )}
            {hasDiagram && (
              <>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={options.caption}
                    onChange={(e) => change("caption", e.target.checked)}
                  />
                  Title and caption
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={options.legend}
                    onChange={(e) => change("legend", e.target.checked)}
                  />
                  Legend
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={options.allLabels}
                    onChange={(e) => change("allLabels", e.target.checked)}
                  />
                  All node labels
                </label>
              </>
            )}
            {options.content === "report" && (
              <>
                {["pdf", "html", "json"].includes(options.format) && (
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={options.includeGraph}
                      onChange={(e) => change("includeGraph", e.target.checked)}
                    />
                    Include graph
                  </label>
                )}
                {options.format !== "csv" && (
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={options.includeStatements}
                      onChange={(e) =>
                        change("includeStatements", e.target.checked)
                      }
                    />
                    Include full statements
                  </label>
                )}
                <p className="wide-field">
                  The report groups classes, properties and instances, with
                  their identifiers, annotations and relationships.
                  Complete-ontology reports can contain many pages.
                </p>
              </>
            )}
          </div>
          <div className="export-preview">
            {hasDiagram ? (
              <>
                <img
                  alt="Export diagram preview"
                  src={
                    "data:image/svg+xml;charset=utf-8," +
                    encodeURIComponent(preview.data)
                  }
                />
                <p>
                  {diagram.nodes.length.toLocaleString()} displayed nodes ·{" "}
                  {diagram.edges.length.toLocaleString()} relationships
                </p>
                {raster && (
                  <p>
                    {pixels.width.toLocaleString()} ×{" "}
                    {pixels.height.toLocaleString()} pixels
                  </p>
                )}
                {tiffNote && <p>{tiffNote}</p>}
              </>
            ) : (
              <div>
                <h3>
                  {options.format === "csv"
                    ? "Statement table"
                    : "Ontology report"}
                </h3>
                <p>
                  {options.scope === "ontology"
                    ? "Complete ontology"
                    : "Displayed graph"}
                </p>
                <p>
                  {options.format === "csv"
                    ? "One row per asserted statement, with subject, property, value, term kind, language, datatype and named graph."
                    : "Resources are grouped by kind, with their labels, identifiers, annotations and relationships."}
                </p>
                <p>
                  The export preserves source values and does not add inferred
                  statements.
                </p>
              </div>
            )}
          </div>
        </div>
        {(ceiling || error) && (
          <div className="error" role="alert">
            {ceiling || error}
          </div>
        )}
        <footer>
          <button onClick={close} disabled={busy}>
            Cancel
          </button>
          <button
            className="primary"
            onClick={() => void save()}
            disabled={busy || numbers.invalid || !!ceiling}
          >
            {busy
              ? "Exporting..."
              : options.format === "clipboard"
                ? "Copy"
                : "Export"}
          </button>
        </footer>
      </Modal>
    </NumberValidation.Provider>
  );
}
