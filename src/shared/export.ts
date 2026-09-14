import type { GraphSnapshot } from "./protocol";
import type { Entity, Triple, OntologyInfo } from "../domain/model";
export const imageFormats = [
  ["png", "PNG"],
  ["jpg", "JPEG"],
  ["webp", "WebP"],
  ["svg", "SVG"],
  ["pdf", "PDF"],
  ["tiff", "TIFF"],
  ["bmp", "Bitmap (BMP)"],
  ["clipboard", "Clipboard"],
] as const;
export const reportFormats = [
  ["pdf", "PDF"],
  ["html", "HTML"],
  ["md", "Markdown"],
  ["csv", "CSV"],
  ["json", "JSON"],
] as const;
export interface ExportOptions {
  content: "diagram" | "report";
  format: string;
  scope: "graph" | "ontology";
  background: "light" | "dark" | "transparent";
  scale: number;
  quality: number;
  caption: boolean;
  legend: boolean;
  allLabels: boolean;
  includeGraph: boolean;
  includeStatements: boolean;
  pageSize: "A4" | "A3" | "Letter" | "Legal";
  landscape: boolean;
  marginMm: number;
  title: string;
  area: "graph" | "viewport" | "selection";
}
export const defaultExportOptions: ExportOptions = {
  content: "diagram",
  format: "png",
  scope: "graph",
  background: "light",
  scale: 2,
  quality: 90,
  caption: true,
  legend: true,
  allLabels: true,
  includeGraph: true,
  includeStatements: true,
  pageSize: "A4",
  landscape: true,
  marginMm: 12,
  title: "Ontology export",
  area: "graph",
};
export interface ExportRequest {
  options: ExportOptions;
  data?: string;
  datasetEpoch: number;
  version: number;
  iris: string[];
}
export interface ReportData {
  ontology: OntologyInfo;
  entities: Entity[];
  triples: Triple[];
  graph: GraphSnapshot;
  generatedAt: string;
  datasetEpoch: number;
  version: number;
}
export function validateExport(input: ExportRequest) {
  const o = input?.options;
  if (
    !o ||
    !["diagram", "report"].includes(o.content) ||
    !(o.content === "diagram" ? imageFormats : reportFormats).some(
      ([f]) => f === o.format,
    ) ||
    !["graph", "ontology"].includes(o.scope) ||
    !["light", "dark", "transparent"].includes(o.background) ||
    !["graph", "viewport", "selection"].includes(o.area) ||
    !["A4", "A3", "Letter", "Legal"].includes(o.pageSize) ||
    typeof o.title !== "string" ||
    o.title.length > 500 ||
    !Number.isFinite(o.scale) ||
    o.scale < 0.25 ||
    o.scale > 8 ||
    !Number.isFinite(o.quality) ||
    o.quality < 1 ||
    o.quality > 100 ||
    !Number.isFinite(o.marginMm) ||
    o.marginMm < 0 ||
    o.marginMm > 40 ||
    ![
      o.caption,
      o.legend,
      o.allLabels,
      o.includeGraph,
      o.includeStatements,
      o.landscape,
    ].every((v) => typeof v === "boolean") ||
    !Array.isArray(input.iris) ||
    input.iris.length > 3000 ||
    input.iris.some((i) => typeof i !== "string" || i.length > 10000) ||
    !Number.isInteger(input.datasetEpoch) ||
    !Number.isInteger(input.version)
  )
    throw Error("Invalid export options.");
  if (
    input.data !== undefined &&
    (typeof input.data !== "string" || input.data.length > 200000000)
  )
    throw Error("Export data exceeds supported limits.");
  return input;
}
