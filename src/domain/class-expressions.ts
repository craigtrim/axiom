import {
  NS,
  SUBCLASS,
  type Entity,
  type Triple,
  type Neighbour,
  type IntersectionBranch,
} from "./model";

export const INTERSECTION = NS.owl + "intersectionOf";
export const EQUIVALENT_CLASS = NS.owl + "equivalentClass";
const FIRST = NS.rdf + "first",
  REST = NS.rdf + "rest",
  NIL = NS.rdf + "nil";
export const taxonomyParents = (e?: Entity) =>
  e?.taxonomyParents ?? e?.parents ?? [];
export const taxonomyChildren = (e?: Entity) =>
  e?.taxonomyChildren ?? e?.children ?? [];
export const namedClass = (e: Entity) =>
  !e.iri.startsWith("_:") && ["Class", "Defined"].includes(e.kind);

/** Presentation only. The asserted RDF, including every collection cell, stays intact. */
export function projectIntersections(
  entities: Map<string, Entity>,
  triples: Triple[],
) {
  const subjects = new Map<string, Triple[]>(),
    lists = new Set<string>();
  const neighbours = new Map<string, Neighbour[]>();
  for (const t of triples) {
    const ts = subjects.get(t.subject) ?? [];
    ts.push(t);
    subjects.set(t.subject, ts);
  }
  for (const e of entities.values()) {
    delete e.expressionText;
    delete e.intersection;
    delete e.classExpressions;
    delete e.taxonomyParents;
    delete e.taxonomyChildren;
    if (e.kind === "Intersection") e.kind = "Resource";
  }
  const add = (
    from: string,
    to: string,
    predicate: string,
    intersection?: IntersectionBranch,
  ) => {
    for (const [iri, n] of [
      [from, { iri: to, predicate, outgoing: true, intersection }],
      [to, { iri: from, predicate, outgoing: false, intersection }],
    ] as const) {
      const ns = neighbours.get(iri) ?? [];
      ns.push(n);
      neighbours.set(iri, ns);
    }
  };
  for (const [iri, ts] of subjects) {
    const heads = ts.filter((t) => t.predicate === INTERSECTION);
    if (!heads.length) continue;
    const e = entities.get(iri);
    if (!e) continue;
    if (iri.startsWith("_:")) e.kind = "Intersection";
    else if (["Class", "Resource"].includes(e.kind)) e.kind = "Defined";
    const members: string[] = [],
      seen = new Set<string>();
    let issue: string | undefined;
    if (heads.length !== 1 || heads[0].object.literal)
      issue = "The intersection has no unambiguous RDF list.";
    else {
      let cell = heads[0].object.value;
      const graph = heads[0].graph ?? "";
      while (cell !== NIL) {
        if (seen.has(cell)) {
          issue = "The intersection list contains a cycle.";
          break;
        }
        if (seen.size >= 4096) {
          issue =
            "The intersection exceeds the display limit of 4,096 members.";
          break;
        }
        seen.add(cell);
        if (cell.startsWith("_:")) lists.add(cell);
        const rows = (subjects.get(cell) ?? []).filter(
          (t) => (t.graph ?? "") === graph,
        );
        const first = rows.filter((t) => t.predicate === FIRST),
          rest = rows.filter((t) => t.predicate === REST);
        if (
          first.length !== 1 ||
          rest.length !== 1 ||
          first[0].object.literal ||
          rest[0].object.literal
        ) {
          issue = "The intersection list is incomplete or ambiguous.";
          break;
        }
        members.push(first[0].object.value);
        cell = rest[0].object.value;
      }
    }
    e.intersection = {
      members: issue ? [] : [...new Set(members)],
      ...(issue ? { issue } : {}),
    };
    if (!issue)
      for (const member of e.intersection.members) {
        const target = entities.get(member);
        // List members are class expressions, even without an explicit owl:Class declaration.
        if (target && !member.startsWith("_:") && target.kind === "Resource")
          target.kind = "Class";
      }
  }
  // Both directions of equivalentClass are legal; subClassOf is directional.
  const reference = (owner: string, expression: string, predicate: string) => {
    const e = entities.get(owner);
    if (!e || !entities.get(expression)?.intersection) return;
    if (e.kind === "Resource" && !owner.startsWith("_:")) e.kind = "Class";
    if (!namedClass(e)) return;
    const refs = (e.classExpressions ??= []);
    if (!refs.some((r) => r.iri === expression && r.predicate === predicate))
      refs.push({ iri: expression, predicate });
    if (predicate === EQUIVALENT_CLASS) e.kind = "Defined";
  };
  for (const t of triples)
    if (
      !t.object.literal &&
      [SUBCLASS, EQUIVALENT_CLASS].includes(t.predicate)
    ) {
      reference(t.subject, t.object.value, t.predicate);
      if (t.predicate === EQUIVALENT_CLASS)
        reference(t.object.value, t.subject, t.predicate);
    }
  // Flatten only conjunctions for the taxonomy. Never turn a restriction into a named parent.
  const memberCache = new Map<string, string[]>();
  const namedMembers = (iri: string, path = new Set<string>()): string[] => {
    const e = entities.get(iri);
    if (!e || path.has(iri) || path.size >= 64) return [];
    if (namedClass(e)) return [iri];
    if (memberCache.has(iri)) return memberCache.get(iri)!;
    if (e.intersection) {
      if (e.intersection.issue) return [];
      const next = new Set(path).add(iri);
      const members = [
        ...new Set(
          e.intersection.members.flatMap((m) => namedMembers(m, next)),
        ),
      ];
      memberCache.set(iri, members);
      return members;
    }
    return [];
  };
  for (const e of entities.values())
    if (namedClass(e)) {
      const extra = [
        ...(e.intersection && !e.intersection.issue
          ? e.intersection.members.flatMap((m) => namedMembers(m))
          : []),
        ...(e.classExpressions ?? []).flatMap((r) => namedMembers(r.iri)),
      ];
      const parents = [...new Set([...e.parents, ...extra])].filter(
        (p) => p !== e.iri && !p.startsWith("_:"),
      );
      if (extra.length || parents.length !== e.parents.length)
        e.taxonomyParents = parents;
    }
  for (const e of entities.values()) {
    const children = e.children.filter((i) => !i.startsWith("_:"));
    if (children.length !== e.children.length) e.taxonomyChildren = children;
  }
  for (const e of entities.values())
    if (namedClass(e))
      for (const p of taxonomyParents(e)) {
        const parent = entities.get(p);
        if (parent && !taxonomyChildren(parent).includes(e.iri))
          (parent.taxonomyChildren ??= [
            ...parent.children.filter((i) => !i.startsWith("_:")),
          ]).push(e.iri);
      }
  for (const e of entities.values())
    if (e.taxonomyChildren)
      e.taxonomyChildren.sort((a, b) =>
        (entities.get(a)?.name ?? a).localeCompare(entities.get(b)?.name ?? b),
      );
  for (const e of entities.values())
    if (e.iri.startsWith("_:"))
      e.expressionText = expressionLabel(e.iri, entities, subjects);
  const flatten = (iri: string, path = new Set<string>()): string[] => {
    if (path.has(iri) || path.size > 64) return [];
    const e = entities.get(iri);
    if (iri.startsWith("_:") && e?.intersection) {
      if (e.intersection.issue) return [];
      const next = new Set(path).add(iri);
      return e.intersection.members.flatMap((m) => flatten(m, next));
    }
    return [iri];
  };
  for (const owner of entities.values())
    if (namedClass(owner)) {
      const refs = [
        ...(owner.classExpressions ?? []).filter((r) => r.iri.startsWith("_:")),
        ...(owner.intersection
          ? [{ iri: owner.iri, predicate: EQUIVALENT_CLASS }]
          : []),
      ];
      for (const ref of refs) {
        const expr = entities.get(ref.iri)?.intersection;
        if (!expr || expr.issue) continue;
        const members = [
          ...new Set(expr.members.flatMap((m) => flatten(m))),
        ].filter((m) => m !== owner.iri);
        const axioms = triples.filter(
          (t) =>
            !t.object.literal &&
            (ref.iri === owner.iri
              ? t.subject === owner.iri && t.predicate === INTERSECTION
              : t.predicate === ref.predicate &&
                ((t.subject === owner.iri && t.object.value === ref.iri) ||
                  (ref.predicate === EQUIVALENT_CLASS &&
                    t.subject === ref.iri &&
                    t.object.value === owner.iri))),
        );
        for (const axiom of axioms)
          for (const member of members)
            add(owner.iri, member, ref.predicate, {
              iri: ref.iri,
              axiom,
              members: expr.members,
            });
      }
    }
  return { lists, neighbours };
}

export function expressionLabel(
  iri: string,
  entities: Map<string, Entity>,
  triples: Map<string, Triple[]>,
) {
  const e = entities.get(iri);
  if (e?.intersection)
    return e.intersection.issue
      ? "Intersection (check source)"
      : "Intersection";
  if (!iri.startsWith("_:")) return undefined;
  const ts = triples.get(iri) ?? [],
    property = ts.find((t) => t.predicate === NS.owl + "onProperty")?.object
      .value;
  if (!property) return undefined;
  const q = ts.find((t) =>
    [
      "someValuesFrom",
      "allValuesFrom",
      "hasValue",
      "minCardinality",
      "maxCardinality",
      "cardinality",
    ].some((k) => t.predicate === NS.owl + k),
  );
  const name = (i: string) =>
    entities.get(i)?.label ??
    entities.get(i)?.name ??
    i.slice(Math.max(i.lastIndexOf("#"), i.lastIndexOf("/")) + 1);
  return q
    ? name(property) +
        " " +
        ({
          someValuesFrom: "some",
          allValuesFrom: "only",
          hasValue: "value",
          minCardinality: "min",
          maxCardinality: "max",
          cardinality: "exactly",
        }[q.predicate.slice(NS.owl.length)] ?? "") +
        " " +
        (q.object.literal ? q.object.value : name(q.object.value))
    : "Property restriction";
}
