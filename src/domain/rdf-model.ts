import {
  NS,
  TYPE,
  SUBCLASS,
  SUBPROPERTY,
  THING,
  entity,
  type Entity,
  type Triple,
  type Kind,
} from "./model";
export const LABEL = NS.rdfs + "label",
  COMMENT = NS.rdfs + "comment";
export const displayName = (e: Entity) =>
  e.expressionText ??
  e.label ??
  e.name.replace(/_/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2");
export function identifier(label: string) {
  const words =
    label
      .trim()
      .normalize("NFKC")
      .match(/[\p{L}\p{N}_]+/gu) ?? [];
  let name = words.map((w) => w[0].toLocaleUpperCase() + w.slice(1)).join("");
  if (!name) name = "Entity";
  if (!/^\p{L}/u.test(name)) name = "Entity" + name;
  return name.slice(0, 200);
}
export function identifierParts(iri: string) {
  const split =
    Math.max(iri.lastIndexOf("#"), iri.lastIndexOf("/"), iri.lastIndexOf(":")) +
    1;
  return { namespace: iri.slice(0, split), name: iri.slice(split) };
}
export function isDefaultIdentifier(iri: string) {
  if (iri.startsWith("_:")) return false;
  const name = identifierParts(iri)
    .name.normalize("NFKC")
    .replace(/[\s_-]/gu, "");
  return /^New(?:Class|Node|Entity|Individual|Instance|Property|ObjectProperty|DataProperty|AnnotationProperty)(?:[0-9]+)?$/i.test(
    name,
  );
}
export function uniqueLabelIri(
  label: string,
  namespace: string,
  exists: (iri: string) => boolean,
) {
  const stem = identifier(label);
  let candidate = namespace + stem,
    suffix = 2;
  while (exists(candidate)) candidate = namespace + stem + suffix++;
  return candidate;
}
// Only placeholder identifiers follow labels. Established identifiers remain
// stable even when they happen to match the old label's normalized spelling.
export function labelledIri(
  iri: string,
  label: string,
  exists: (iri: string) => boolean,
) {
  if (
    !isDefaultIdentifier(iri) ||
    !label.trim() ||
    isDefaultIdentifier(identifier(label))
  )
    return iri;
  return uniqueLabelIri(
    label,
    identifierParts(iri).namespace,
    (candidate) => candidate !== iri && exists(candidate),
  );
}
export function preferredLabel(statements: Triple[]) {
  return statements
    .filter((t) => t.predicate === LABEL && t.object.literal)
    .sort((a, b) => rank(a.object.language) - rank(b.object.language))[0];
}
export function validLabel(input: unknown) {
  if (typeof input !== "string" || !input.trim())
    throw Error("A label is required.");
  if (input.trim().length > 256)
    throw Error("Use a label of 256 characters or fewer.");
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(input))
    throw Error("Labels cannot contain control characters.");
  return input.trim();
}
export function validResource(value: unknown, blank = true): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 10000 &&
    ((blank && /^_:[A-Za-z0-9_][^\s]*$/.test(value)) ||
      /^[a-z][a-z0-9+.-]*:[^\s<>"{}|^\x00-\x1f]*$/i.test(value))
  );
}
export function validateStatement(t: Triple) {
  if (
    !t ||
    !validResource(t.subject) ||
    !validResource(t.predicate, false) ||
    !t.object ||
    typeof t.object.literal !== "boolean" ||
    typeof t.object.value !== "string" ||
    t.object.value.length > 1000000 ||
    (!t.object.literal && !validResource(t.object.value)) ||
    (t.graph !== undefined && !validResource(t.graph)) ||
    (t.object.language !== undefined &&
      !/^[a-zA-Z]+(?:-[a-zA-Z0-9]+)*$/.test(t.object.language)) ||
    (t.object.datatype !== undefined &&
      !validResource(t.object.datatype, false) &&
      !Object.hasOwn(
        {
          string: 1,
          decimal: 1,
          integer: 1,
          dateTime: 1,
          boolean: 1,
          double: 1,
        },
        t.object.datatype,
      ))
  )
    throw Error("Invalid RDF statement.");
  if (!t.object.literal && (t.object.datatype || t.object.language))
    throw Error("Resource terms cannot have a language or datatype.");
  if (
    t.object.language &&
    t.object.datatype &&
    t.object.datatype !== NS.rdf + "langString"
  )
    throw Error("A language-tagged value cannot have a different datatype.");
}
export const statementKey = (t: Triple) =>
  JSON.stringify([
    t.subject,
    t.predicate,
    t.object.value,
    t.object.literal,
    t.object.language ?? "",
    t.object.datatype ?? "",
    t.graph ?? "",
  ]);
export function projectEntities(triples: Triple[]): Map<string, Entity> {
  const map = new Map<string, Entity>(),
    kinds = new Map<string, Kind>(),
    bySubject = new Map<string, Triple[]>();
  const setKind = (iri: string, kind: Kind) => {
    if (!kinds.has(iri) || kind !== "Resource") kinds.set(iri, kind);
  };
  for (const t of triples) {
    (
      bySubject.get(t.subject) ??
      (bySubject.set(t.subject, []), bySubject.get(t.subject)!)
    ).push(t);
    if (t.predicate === TYPE && !t.object.literal) {
      const v = t.object.value;
      const kind: Kind =
        v === NS.owl + "Class" || v === NS.rdfs + "Class"
          ? "Class"
          : v === NS.owl + "ObjectProperty"
            ? "ObjectProperty"
            : v === NS.owl + "DatatypeProperty"
              ? "DataProperty"
              : v === NS.owl + "AnnotationProperty"
                ? "AnnotationProperty"
                : v === NS.rdf + "Property"
                  ? "ObjectProperty"
                  : v === NS.rdfs + "Datatype"
                    ? "Datatype"
                    : v === NS.owl + "NamedIndividual"
                      ? "Individual"
                      : "Resource";
      setKind(t.subject, kind);
      if (
        kind === "Resource" &&
        !v.startsWith(NS.owl) &&
        !v.startsWith(NS.rdf) &&
        !v.startsWith(NS.rdfs)
      ) {
        if (!kinds.has(t.subject)) setKind(t.subject, "Individual");
        setKind(v, "Class");
      }
    }
    if (t.predicate === SUBCLASS) {
      setKind(t.subject, "Class");
      if (!t.object.literal && !t.object.value.startsWith("_:"))
        setKind(t.object.value, "Class");
    }
    if (t.predicate === SUBPROPERTY) {
      if (!kinds.has(t.subject)) setKind(t.subject, "ObjectProperty");
      if (!t.object.literal && !kinds.has(t.object.value))
        setKind(t.object.value, "ObjectProperty");
    }
  }
  for (const t of triples) {
    if (!kinds.has(t.subject)) kinds.set(t.subject, "Resource");
    if (!t.object.literal && !kinds.has(t.object.value))
      kinds.set(t.object.value, "Resource");
  }
  for (const [iri, kind] of kinds) map.set(iri, entity(iri, kind));
  if (!map.has(THING)) map.set(THING, entity(THING, "Class"));
  map.get(THING)!.kind = "Class";
  for (const [iri, e] of map) {
    const ts = bySubject.get(iri) ?? [],
      resources = (p: string) =>
        ts
          .filter((t) => t.predicate === p && !t.object.literal)
          .map((t) => t.object.value);
    const label = preferredLabel(ts);
    if (label) {
      e.label = label.object.value;
      e.name = e.label;
      e.labelLanguage = label.object.language;
    }
    e.comment =
      ts.find((t) => t.predicate === COMMENT && t.object.literal)?.object
        .value ?? "";
    e.parents = resources(
      e.kind.endsWith("Property") ? SUBPROPERTY : SUBCLASS,
    ).filter((p) => !p.startsWith("_:"));
    e.types = resources(TYPE).filter(
      (t) =>
        ![
          NS.owl + "Class",
          NS.rdfs + "Class",
          NS.owl + "NamedIndividual",
          NS.owl + "ObjectProperty",
          NS.owl + "DatatypeProperty",
          NS.owl + "AnnotationProperty",
          NS.rdf + "Property",
        ].includes(t),
    );
    if (
      e.kind === "Resource" &&
      e.types.some((t) => ["Class", "Defined"].includes(map.get(t)?.kind ?? ""))
    )
      e.kind = "Individual";
    e.disjoint = resources(NS.owl + "disjointWith");
    e.domain = resources(NS.rdfs + "domain")[0];
    e.range = resources(NS.rdfs + "range")[0];
    e.inverse = resources(NS.owl + "inverseOf")[0];
    e.characteristics = resources(TYPE)
      .filter(
        (t) =>
          t.startsWith(NS.owl) &&
          /Property$/.test(t) &&
          ![
            NS.owl + "ObjectProperty",
            NS.owl + "DatatypeProperty",
            NS.owl + "AnnotationProperty",
          ].includes(t),
      )
      .map((t) =>
        t
          .slice(NS.owl.length)
          .replace(/Property$/, "")
          .toLowerCase(),
      );
    for (const t of ts.filter(
      (t) =>
        [SUBCLASS, NS.owl + "equivalentClass"].includes(t.predicate) &&
        !t.object.literal,
    )) {
      const target = t.object.value,
        bt = bySubject.get(target) ?? [],
        property = bt.find((t) => t.predicate === NS.owl + "onProperty")?.object
          .value;
      const q = bt.find((t) =>
        [
          NS.owl + "someValuesFrom",
          NS.owl + "allValuesFrom",
          NS.owl + "hasValue",
          NS.owl + "minCardinality",
          NS.owl + "maxCardinality",
          NS.owl + "cardinality",
        ].includes(t.predicate),
      );
      if (property && q) {
        const quantifier = (
          {
            someValuesFrom: "some",
            allValuesFrom: "only",
            hasValue: "value",
            minCardinality: "min",
            maxCardinality: "max",
            cardinality: "exactly",
          } as Record<string, string>
        )[q.predicate.slice(NS.owl.length)];
        (t.predicate === SUBCLASS ? e.restrictions : e.equivalents).push({
          shape: "restriction",
          property,
          quantifier,
          fillers: q.object.literal ? [] : [q.object.value],
          ...(q.object.literal && /^\d+$/.test(q.object.value)
            ? { cardinality: Number(q.object.value) }
            : {}),
        });
      } else if (
        t.predicate === NS.owl + "equivalentClass" &&
        !target.startsWith("_:")
      )
        e.equivalents.push({ shape: "class", fillers: [target] });
    }
    if (e.kind === "Class" && e.equivalents.length) e.kind = "Defined";
  }
  return map;
}
function rank(language?: string) {
  return !language ? 0 : /^en(?:-|$)/i.test(language) ? 1 : 2;
}
