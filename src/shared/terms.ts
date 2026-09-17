import { NS } from "../domain/model";
export function entityNamespace(iri: string, fallback: string) {
  const at = Math.max(iri.lastIndexOf("#"), iri.lastIndexOf("/"));
  return !iri.startsWith("_:") && at >= 0 ? iri.slice(0, at + 1) : fallback;
}
export function compactIri(iri: string, namespace: string) {
  // Standard vocabulary names keep their recognized prefixes even in their own Details.
  for (const [prefix, base] of Object.entries(NS))
    if (!["pizza", "demo"].includes(prefix) && iri.startsWith(base))
      return prefix + ":" + iri.slice(base.length);
  if (namespace && iri.startsWith(namespace) && iri.length > namespace.length)
    return iri.slice(namespace.length);
  for (const [prefix, base] of Object.entries(NS))
    if (iri.startsWith(base)) return prefix + ":" + iri.slice(base.length);
  return iri;
}
export function expandIri(value: string, namespace: string) {
  const text = value.trim();
  if (!text) return "";
  if (text.startsWith("<") && text.endsWith(">")) return text.slice(1, -1);
  const colon = text.indexOf(":");
  const base = Object.prototype.hasOwnProperty.call(NS, text.slice(0, colon))
    ? (NS as Record<string, string>)[text.slice(0, colon)]
    : undefined;
  if (colon >= 0 && base) return base + text.slice(colon + 1);
  if (/^[a-z][a-z0-9+.-]*:/i.test(text)) return text;
  return namespace + text.replace(/^:/, "");
}
