import type { GraphNode, GraphEdge } from "./viewport";
export interface StyleValues {
  fill?: string;
  stroke?: string;
  color?: string;
  background?: string;
  size?: number;
  "stroke-width"?: number;
  "font-size"?: number;
  opacity?: number;
  shape?: "circle" | "square" | "diamond" | "hexagon";
  label?: "name" | "iri" | "none";
  "line-style"?: "solid" | "dashed";
}
export interface StyleRule {
  target: "node" | "edge" | "graph";
  kind?: string;
  attribute?: string;
  value?: string;
  pseudo?: string;
  values: StyleValues;
  specificity: number;
}
export const styleExample =
  '/* Rules cascade by selector specificity and then source order. */\nnode.Class {\n  fill: #4096d8;\n  size: 32px;\n}\nnode.Individual {\n  fill: #138873;\n  shape: circle;\n}\nnode:selected { stroke: #f59e0b; stroke-width: 3px; }\nedge { stroke: #8492a6; opacity: 0.65; }\n/* node[iri="http://example.org/ontology#Person"] { fill: #aa66cc; } */\n';
const colors = new Set(["fill", "stroke", "color", "background"]),
  numbers: Record<string, [number, number]> = {
    size: [6, 120],
    "stroke-width": [0, 12],
    "font-size": [8, 32],
    opacity: [0, 1],
  };
export function parseGraphStyle(text: string): StyleRule[] {
  if (typeof text !== "string" || text.length > 50000)
    throw Error("Stylesheet must be at most 50,000 characters.");
  let source = text.replace(/\/\*[\s\S]*?\*\//g, "").trim(),
    rules: StyleRule[] = [];
  while (source) {
    const block = /^([^{}]+)\{([^{}]*)\}/.exec(source);
    if (!block)
      throw Error("Expected a selector followed by { declarations }.");
    for (const selector of block[1].split(",").map((s) => s.trim())) {
      const m =
        /^(node|edge|graph)(?:\.([A-Za-z]+))?(?:\[(iri|predicate|theme)="([^"]+)"\])?(?::(selected|pinned))?$/.exec(
          selector,
        );
      if (!m) throw Error("Unsupported selector: " + selector);
      const [, target, kind, attribute, value, pseudo] = m;
      if (
        kind &&
        (target !== "node" ||
          ![
            "Class",
            "Defined",
            "Individual",
            "ObjectProperty",
            "DataProperty",
          ].includes(kind))
      )
        throw Error("Unknown node kind: " + kind);
      if (
        (pseudo && target !== "node") ||
        (attribute === "predicate" && target !== "edge") ||
        (attribute === "iri" && target !== "node") ||
        (attribute === "theme" && target !== "graph")
      )
        throw Error("Attribute or state does not apply to " + target + ".");
      if (attribute === "theme" && !["light", "dark"].includes(value))
        throw Error("Theme must be light or dark.");
      const values: StyleValues = {};
      for (const declaration of block[2]
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean)) {
        const colon = declaration.indexOf(":");
        if (colon < 1) throw Error("Expected property: value.");
        const key = declaration.slice(0, colon).trim(),
          v = declaration.slice(colon + 1).trim();
        const allowed =
          target === "graph"
            ? ["background"]
            : target === "edge"
              ? ["stroke", "stroke-width", "opacity", "line-style"]
              : [
                  "fill",
                  "stroke",
                  "stroke-width",
                  "size",
                  "shape",
                  "color",
                  "font-size",
                  "label",
                  "opacity",
                ];
        if (!allowed.includes(key))
          throw Error("Unsupported " + target + " property: " + key);
        if (colors.has(key)) {
          if (!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(v))
            throw Error(key + " needs a #RGB or #RRGGBB color.");
          (values as any)[key] =
            v.length === 4
              ? "#" +
                v
                  .slice(1)
                  .split("")
                  .map((c) => c + c)
                  .join("")
              : v.toLowerCase();
        } else if (numbers[key]) {
          const n = Number(v.replace(/px$/, ""));
          if (
            !/^\d+(\.\d+)?(?:px)?$/.test(v) ||
            n < numbers[key][0] ||
            n > numbers[key][1]
          )
            throw Error(
              key + " must be between " + numbers[key].join(" and ") + ".",
            );
          (values as any)[key] = n;
        } else {
          const choices =
            key === "shape"
              ? ["circle", "square", "diamond", "hexagon"]
              : key === "label"
                ? ["name", "iri", "none"]
                : ["solid", "dashed"];
          if (!choices.includes(v))
            throw Error("Unsupported " + key + ": " + v);
          (values as any)[key] = v;
        }
      }
      rules.push({
        target: target as StyleRule["target"],
        kind,
        attribute,
        value,
        pseudo,
        values,
        specificity: (kind ? 10 : 0) + (attribute ? 10 : 0) + (pseudo ? 10 : 0),
      });
    }
    if (rules.length > 200) throw Error("Use at most 200 style rules.");
    source = source.slice(block[0].length).trim();
  }
  return rules.sort((a, b) => a.specificity - b.specificity);
}
const cache = new Map<string, StyleRule[]>();
export function styleRules(text = "") {
  let rules = cache.get(text);
  if (!rules) {
    rules = parseGraphStyle(text);
    if (cache.size > 12) cache.clear();
    cache.set(text, rules);
  }
  return rules;
}
export function nodeStyle(
  rules: StyleRule[],
  n: GraphNode,
  selected?: string | null,
): StyleValues {
  const result: StyleValues = {};
  for (const r of rules)
    if (
      r.target === "node" &&
      (!r.kind || r.kind === n.kind) &&
      (!r.attribute || r.value === n.iri) &&
      (!r.pseudo || (r.pseudo === "selected" ? n.iri === selected : n.pinned))
    )
      Object.assign(result, r.values);
  return result;
}
export function edgeStyle(rules: StyleRule[], e: GraphEdge): StyleValues {
  const result: StyleValues = {};
  for (const r of rules)
    if (r.target === "edge" && (!r.attribute || r.value === e.predicate))
      Object.assign(result, r.values);
  return result;
}
export function graphBackground(
  rules: StyleRule[],
  dark: boolean,
  fallback: string,
) {
  let value = fallback;
  for (const r of rules)
    if (
      r.target === "graph" &&
      (!r.attribute || r.value === (dark ? "dark" : "light"))
    )
      value = r.values.background ?? value;
  return value;
}
export const styledRadius = (
  n: GraphNode,
  text?: string,
  selected?: string | null,
) => (nodeStyle(styleRules(text), n, selected).size ?? n.radius * 2) / 2;
