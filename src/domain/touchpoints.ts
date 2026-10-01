import type { Store } from "./store";
import { NS, type Triple } from "./model";
import { displayName } from "./rdf-model";
import {
  touchpointPredicates,
  type TouchpointContext,
} from "../shared/touchpoints";

export function touchpointContext(
  store: Store,
  iri: string,
  datasetEpoch: number,
): TouchpointContext {
  const entity = store.resolve(iri);
  if (!entity || iri.startsWith("_:"))
    throw Error("Choose an existing named entity.");
  const statements = [...store.scan(iri)];
  return {
    iri,
    datasetEpoch,
    version: store.version,
    label: displayName(entity),
    comment: entity.comment,
    kind: entity.kind,
    parents: [...new Set([...entity.parents, ...entity.types])]
      .sort()
      .map((id) => store.label(id)),
    aliases: [
      ...new Set(
        statements
          .filter(
            (t) =>
              t.object.literal &&
              [
                NS.rdfs + "label",
                NS.skos + "prefLabel",
                NS.skos + "altLabel",
                NS.rdfs + "seeAlso",
              ].includes(t.predicate),
          )
          .map((t) => t.object.value),
      ),
    ].sort(),
    links: statements
      .filter((t) => !t.object.literal)
      .map((t) => ({ predicate: t.predicate, iri: t.object.value })),
  };
}
export function applyTouchpoints(
  store: Store,
  iri: string,
  statements: Triple[],
) {
  const entity = store.resolve(iri);
  if (!entity || iri.startsWith("_:"))
    throw Error("The entity no longer exists.");
  const allowed = [
    ...touchpointPredicates,
    NS.rdfs + "seeAlso",
    ...(entity.kind === "Individual" ? [NS.owl + "sameAs"] : []),
  ];
  if (
    !Array.isArray(statements) ||
    !statements.length ||
    statements.length > 20
  )
    throw Error("Select between one and twenty touchpoints.");
  const keys = new Set<string>();
  for (const statement of statements) {
    if (
      !statement ||
      statement.subject !== iri ||
      !allowed.includes(statement.predicate) ||
      !statement.object ||
      statement.object.literal !== false ||
      typeof statement.object.value !== "string"
    )
      throw Error(
        "Touchpoints require an allowed predicate and a resource object.",
      );
    const url = new URL(statement.object.value);
    if (
      url.username ||
      url.password ||
      url.port ||
      !(
        (url.origin === "http://dbpedia.org" &&
          url.pathname.startsWith("/resource/")) ||
        (url.origin === "http://www.wikidata.org" &&
          /^\/entity\/Q[1-9]\d*$/.test(url.pathname)) ||
        (url.origin === "https://en.wikipedia.org" &&
          url.pathname.startsWith("/wiki/"))
      ) ||
      url.search ||
      url.hash
    )
      throw Error("Choose a Wikipedia, DBpedia or Wikidata resource.");
    const key = statement.predicate + " " + statement.object.value;
    if (keys.has(key)) throw Error("A touchpoint was selected more than once.");
    keys.add(key);
  }
  const existing = [...store.scan(iri)];
  const additions = statements.filter(
    (t) =>
      !existing.some(
        (e) =>
          e.predicate === t.predicate &&
          !e.object.literal &&
          e.object.value === t.object.value,
      ),
  );
  if (additions.length) store.updateEntity(iri, [...existing, ...additions]);
  return additions.length;
}
