import { displayName } from "../domain/rdf-model";
import { kindLabel } from "../domain/model";
import type { ReportData, ExportOptions } from "../shared/export";
export const escapeHtml = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const escapeCsv = (s: string) =>
  '"' + (/^[=+@\-]/.test(s) ? "'" : "") + s.replaceAll('"', '""') + '"';
export function reportDocument(data: ReportData, o: ExportOptions, svg = "") {
  const bySubject = new Map<string, typeof data.triples>();
  for (const t of data.triples) {
    const group = bySubject.get(t.subject) ?? [];
    group.push(t);
    bySubject.set(t.subject, group);
  }
  const groups = new Map<string, typeof data.entities>();
  for (const e of data.entities) {
    const k = kindLabel(e.kind);
    const group = groups.get(k) ?? [];
    group.push(e);
    groups.set(k, group);
  }
  for (const list of groups.values())
    list.sort((a, b) => displayName(a).localeCompare(displayName(b)));
  if (o.format === "json")
    return JSON.stringify(
      {
        title: o.title,
        scope: o.scope,
        ontology: data.ontology,
        generatedAt: data.generatedAt,
        entities: data.entities,
        ...(o.includeStatements ? { statements: data.triples } : {}),
        ...(o.includeGraph ? { graph: data.graph } : {}),
      },
      null,
      2,
    );
  if (o.format === "csv")
    return (
      "\uFEFF" +
      [
        [
          "Subject",
          "Property",
          "Value",
          "Term kind",
          "Language",
          "Datatype",
          "Named graph",
        ],
        ...data.triples.map((t) => [
          t.subject,
          t.predicate,
          t.object.value,
          t.object.literal ? "Literal" : "Resource",
          t.object.language ?? "",
          t.object.datatype ?? "",
          t.graph ?? "",
        ]),
      ]
        .map((row) => row.map(escapeCsv).join(","))
        .join("\r\n")
    );
  const title = o.title || data.ontology.name,
    h = escapeHtml;
  if (o.format === "md") {
    const escape = (s: string) => s.replace(/[\\*_`[\]<>#|]/g, (c) => "\\" + c);
    return (
      "# " +
      escape(title) +
      "\n\nScope: " +
      o.scope +
      ". Exported " +
      data.generatedAt +
      ".\n\n" +
      data.entities.length +
      " resources; " +
      data.triples.length +
      " statements.\n\n" +
      [...groups]
        .map(
          ([kind, es]) =>
            "## " +
            kind +
            "\n\n" +
            es
              .map(
                (e) =>
                  "### " +
                  escape(displayName(e)) +
                  "\n\n" +
                  escape(e.iri) +
                  "\n\n" +
                  escape(e.comment) +
                  "\n\n" +
                  (o.includeStatements
                    ? (bySubject.get(e.iri) ?? [])
                        .map(
                          (t) =>
                            "- " +
                            escape(t.predicate) +
                            ": " +
                            escape(t.object.value) +
                            (t.object.language
                              ? " (@" + escape(t.object.language) + ")"
                              : t.object.datatype
                                ? " (" + escape(t.object.datatype) + ")"
                                : "") +
                            (t.graph ? " [graph " + escape(t.graph) + "]" : ""),
                        )
                        .join("\n")
                    : ""),
              )
              .join("\n\n"),
        )
        .join("\n\n")
    );
  }
  const content =
    "<h1>" +
    h(title) +
    "</h1><p>" +
    h(data.ontology.name) +
    " · " +
    h(data.generatedAt) +
    "</p><p>Scope: " +
    (o.scope === "ontology" ? "Complete ontology" : "Displayed graph") +
    ". " +
    data.entities.length.toLocaleString() +
    " resources and " +
    data.triples.length.toLocaleString() +
    " statements. The diagram contains " +
    data.graph.nodes.length.toLocaleString() +
    " admitted nodes. Relationships are asserted data; this report does not add inferred statements.</p>" +
    "<h2>Contents</h2><ul>" +
    [...groups]
      .map(
        ([kind, es], i) =>
          '<li><a href="#group-' +
          i +
          '">' +
          h(kind) +
          " (" +
          es.length +
          ")</a></li>",
      )
      .join("") +
    "</ul>" +
    (o.includeGraph
      ? '<h2>Graph</h2><div class="diagram">' + svg + "</div>"
      : "") +
    [...groups]
      .map(
        ([kind, es], i) =>
          '<section><h2 id="group-' +
          i +
          '">' +
          h(kind) +
          "</h2>" +
          es
            .map(
              (e) =>
                "<article><h3>" +
                h(displayName(e)) +
                '</h3><p class="iri">' +
                h(e.iri) +
                "</p>" +
                (e.comment ? "<p>" + h(e.comment) + "</p>" : "") +
                (o.includeStatements
                  ? "<dl>" +
                    (bySubject.get(e.iri) ?? [])
                      .map(
                        (t) =>
                          '<div class="statement"><dt>' +
                          h(t.predicate) +
                          "</dt><dd><pre>" +
                          h(t.object.value) +
                          "</pre><small>" +
                          (t.object.literal ? "Literal" : "Resource") +
                          (t.object.language
                            ? " · @" + h(t.object.language)
                            : t.object.datatype
                              ? " · " + h(t.object.datatype)
                              : "") +
                          (t.graph ? " · Graph: " + h(t.graph) : "") +
                          "</small></dd></div>",
                      )
                      .join("") +
                    "</dl>"
                  : "") +
                "</article>",
            )
            .join("") +
          "</section>",
      )
      .join("");
  return htmlDocument(title, content, o);
}
export function htmlDocument(title: string, content: string, o: ExportOptions) {
  return (
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:"><title>' +
    escapeHtml(title) +
    "</title><style>" +
    "@page{size:" +
    o.pageSize +
    " " +
    (o.landscape ? "landscape" : "portrait") +
    ";margin:" +
    o.marginMm +
    "mm}body{font:11pt Segoe UI,Arial,sans-serif;color:#151515;background:white;margin:0}h1{font-size:24pt}h2{font-size:17pt;break-after:avoid}h3{font-size:13pt;break-after:avoid}p,li{line-height:1.45}a{color:#165a91}section{break-before:page}article{border-bottom:1px solid #bbb;padding:8pt 0}dt{font-weight:600;overflow-wrap:anywhere}dd{margin:4pt 0 10pt 14pt}pre{font:10pt Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere;margin:0}small,.iri{font-size:9pt;color:#555;overflow-wrap:anywhere}.diagram{height:" +
    (o.landscape ? "150mm" : "215mm") +
    ";width:100%;break-inside:avoid}.diagram svg{width:100%;height:100%}.statement{margin:6pt 0} @media screen{body{max-width:1100px;margin:32px auto;padding:0 28px}}" +
    "</style></head><body>" +
    content +
    "</body></html>"
  );
}
