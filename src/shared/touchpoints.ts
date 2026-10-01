import { NS } from "../domain/model";
export const wikipediaHost = "en.wikipedia.org";
export interface TouchpointCandidate {
  id: string;
  iri: string;
  label: string;
  description: string;
  url: string;
  rank: number;
  wikidataIri?: string;
  disambiguation: boolean;
  redirects: string[];
}
export interface WikipediaError {
  kind: "offline" | "timeout" | "http" | "invalid-response" | "rate-limit";
  message: string;
  status?: number;
  retryAt?: string;
  waitSeconds?: number;
}
export interface TouchpointSearchResult {
  candidates: TouchpointCandidate[];
  fetchedAt?: string;
  cached: boolean;
  stale: boolean;
  error?: WikipediaError;
}
export interface TouchpointProvider {
  id: string;
  search(input: {
    entityIri: string;
    query: string;
    refresh?: boolean;
  }): Promise<TouchpointSearchResult>;
}
export interface TouchpointContext {
  datasetEpoch: number;
  version: number;
  iri: string;
  label: string;
  comment: string;
  kind: string;
  aliases: string[];
  parents: string[];
  links: { predicate: string; iri: string }[];
}
export const touchpointPredicates = [
  "exactMatch",
  "closeMatch",
  "broadMatch",
  "narrowMatch",
  "relatedMatch",
].map((name) => NS.skos + name);
export const touchpointName = (value: string) =>
  value
    .normalize("NFKC")
    .replaceAll("_", " ")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
export function suggestedTouchpointPredicate(
  context: TouchpointContext,
  candidate: TouchpointCandidate,
) {
  const names = new Set(
    [context.label, ...context.aliases].map(touchpointName),
  );
  return (
    NS.skos +
    ([candidate.label, ...candidate.redirects].some((name) =>
      names.has(touchpointName(name)),
    )
      ? "exactMatch"
      : "closeMatch")
  );
}
export type TouchpointObject = "dbpedia" | "wikidata" | "wikipedia";
export function touchpointObject(
  candidate: TouchpointCandidate,
  object: TouchpointObject,
) {
  return object === "wikipedia"
    ? candidate.url
    : object === "wikidata"
      ? candidate.wikidataIri
      : candidate.iri;
}
export interface TouchpointSelection {
  id: string;
  predicate: string;
  object: TouchpointObject;
}
export interface TouchpointResponse extends TouchpointSearchResult {
  token: string;
  query: string;
  context: TouchpointContext;
}
