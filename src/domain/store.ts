import { classMoveIssue } from "./taxonomy-move";
import { simplifySubclassIntersections } from "./intersection-definitions";
import { discardUnusedIntersection } from "./intersection-cleanup";
import {
  projectIntersections,
  expressionLabel,
  INTERSECTION,
  taxonomyChildren,
  namedClass,
} from "./class-expressions";
import {
  displayName,
  uniqueLabelIri,
  labelledIri,
  isDefaultIdentifier,
  preferredLabel,
  validLabel,
  projectEntities,
  validateStatement,
  statementKey,
  LABEL,
  COMMENT,
} from "./rdf-model";
import {
  NS,
  TYPE,
  SUBCLASS,
  SUBPROPERTY,
  THING,
  entity,
  local,
  humanise,
  shorten,
  iriTerm,
  literal,
  equivalent,
  branches,
  compare,
  type Entity,
  type OntologyInfo,
  type Kind,
  type Individual,
  type Customer,
  type Triple,
  type Term,
  type Neighbour,
  type Adjacency,
  type TableFilter,
} from "./model";
export class Store {
  ontology: OntologyInfo = {
    name: "Pizza ontology",
    namespace: NS.pizza,
    example: true,
  };
  entities = new Map<string, Entity>();
  tbox: Triple[] = [];
  rbox: Triple[] = [];
  individuals: Individual[] = [];
  customers: Customer[] = [];
  individualIndex = new Map<string, Individual>();
  customerIndex = new Map<string, Customer>();
  byType = new Map<string, Individual[]>();
  namedByType = new Map<string, string[]>();
  bySubject = new Map<string, Triple[]>();
  byPredicate = new Map<string, Triple[]>();
  reverse = new Map<string, Neighbour[]>();
  private intersections = {
    lists: new Set<string>(),
    neighbours: new Map<string, Neighbour[]>(),
  };
  graphVisible(iri: string) {
    return (
      this.exists(iri) &&
      !this.intersections.lists.has(iri) &&
      !(iri.startsWith("_:") && this.entities.get(iri)?.intersection)
    );
  }
  private byCustomer?: Map<string, Individual[]>;
  version = 0;
  undoStack: { label: string; undo: () => void; redo: () => void }[] = [];
  redoStack: typeof this.undoStack = [];
  get classCount() {
    return [...this.entities.values()].filter(namedClass).length;
  }
  get propertyCount() {
    return [...this.entities.values()].filter((e) =>
      e.kind.endsWith("Property"),
    ).length;
  }
  get individualCount() {
    return (
      this.individuals.length +
      this.customers.length +
      [...this.entities.values()].filter((e) => e.kind === "Individual").length
    );
  }
  get tripleCount() {
    return (
      this.tbox.length +
      this.rbox.length +
      7 * this.individuals.length +
      2 * this.customers.length
    );
  }
  addEntity(iri: string, kind: Kind) {
    const e = this.entities.get(iri) ?? entity(iri, kind);
    e.kind = kind;
    this.entities.set(iri, e);
    return e;
  }
  label(iri: string) {
    return (
      (this.entities.get(iri)?.kind === "Intersection" || iri.startsWith("_:")
        ? expressionLabel(iri, this.entities, this.bySubject)
        : undefined) ??
      this.individualIndex.get(iri)?.reference ??
      (this.entities.has(iri)
        ? displayName(this.entities.get(iri)!)
        : (this.customerIndex.get(iri)?.name ?? humanise(local(iri))))
    );
  }
  kind(iri: string): Kind {
    return this.entities.get(iri)?.kind ?? "Individual";
  }
  exists(iri: string) {
    return (
      this.entities.has(iri) ||
      this.individualIndex.has(iri) ||
      this.customerIndex.has(iri)
    );
  }
  resolve(iri: string): Entity | undefined {
    const e = this.entities.get(iri);
    if (e) return e;
    const o = this.individualIndex.get(iri),
      c = this.customerIndex.get(iri);
    if (!o && !c) return;
    return {
      ...entity(iri, "Individual"),
      name: c?.name ?? local(iri),
      types: [o?.type ?? NS.demo + "Customer"],
      comment: "Generated demo individual.",
    };
  }
  instanceCount(iri: string) {
    const named = this.namedByType.get(iri)?.length ?? 0;
    if (!this.ontology.example) return named;
    return (
      named +
      (iri === NS.demo + "Order"
        ? this.individuals.length
        : iri === NS.demo + "Customer"
          ? this.customers.length
          : (this.byType.get(iri)?.length ?? 0))
    );
  }
  instanceIris(iri: string) {
    const named = this.namedByType.get(iri) ?? [];
    if (!this.ontology.example) return named;
    return named.concat(
      iri === NS.demo + "Customer"
        ? this.customers.map((c) => c.iri)
        : (iri === NS.demo + "Order"
            ? this.individuals
            : (this.byType.get(iri) ?? [])
          ).map((i) => i.iri),
    );
  }
  descendantCount(iri: string) {
    const seen = new Set([iri]),
      pending = [iri];
    while (pending.length)
      for (const c of taxonomyChildren(this.entities.get(pending.pop()!)))
        if (!seen.has(c)) {
          seen.add(c);
          pending.push(c);
        }
    return seen.size - 1;
  }
  indexGenerated() {
    this.individualIndex = new Map();
    this.byType = new Map();
    for (const i of this.individuals) {
      this.individualIndex.set(i.iri, i);
      const b = this.byType.get(i.type) ?? [];
      b.push(i);
      this.byType.set(i.type, b);
    }
    this.customerIndex = new Map(this.customers.map((c) => [c.iri, c]));
    this.byCustomer = undefined;
  }
  loadGenerated(individuals: Individual[], customers: Customer[]) {
    this.individuals = individuals;
    this.customers = customers;
    this.indexGenerated();
    this.undoStack = [];
    this.redoStack = [];
    this.version++;
  }
  rebuildSchema() {
    const definitions = simplifySubclassIntersections(this.tbox);
    if (definitions.size) {
      const projected = projectEntities(this.tbox);
      if (this.ontology.assertedOnly) this.entities = projected;
      else
        for (const iri of definitions) {
          const current = this.entities.get(iri),
            next = projected.get(iri);
          if (current && next) {
            current.parents = next.parents;
            current.equivalents = next.equivalents;
            current.kind = next.kind;
          }
        }
    }
    this.namedByType = new Map();
    for (const e of this.entities.values())
      if (e.kind === "Individual")
        for (const t of e.types) {
          const list = this.namedByType.get(t) ?? [];
          list.push(e.iri);
          this.namedByType.set(t, list);
        }
    this.rbox = [];
    this.reverse = new Map();
    this.bySubject = new Map();
    this.byPredicate = new Map();
    for (const e of this.entities.values()) {
      e.children = [];
      for (const r of [...e.restrictions, ...e.equivalents]) {
        for (const target of r.fillers) {
          this.addReverse(target, {
            iri: e.iri,
            predicate: r.property ?? NS.owl + "equivalentClass",
            outgoing: false,
          });
          if (
            !this.ontology.assertedOnly &&
            r.shape === "restriction" &&
            (r.quantifier === "some" || r.quantifier === "value")
          )
            this.rbox.push({
              subject: e.iri,
              predicate: r.property!,
              object: iriTerm(target),
            });
        }
      }
      for (const t of e.types)
        this.addReverse(t, {
          iri: e.iri,
          predicate: TYPE,
          outgoing: false,
        });
      for (const d of e.disjoint)
        this.addReverse(d, {
          iri: e.iri,
          predicate: NS.owl + "disjointWith",
          outgoing: false,
        });
      if (e.inverse)
        this.addReverse(e.inverse, {
          iri: e.iri,
          predicate: NS.owl + "inverseOf",
          outgoing: false,
        });
      if (e.domain)
        this.addReverse(e.domain, {
          iri: e.iri,
          predicate: NS.rdfs + "domain",
          outgoing: false,
        });
      if (e.range)
        this.addReverse(e.range, {
          iri: e.iri,
          predicate: NS.rdfs + "range",
          outgoing: false,
        });
    }
    for (const e of this.entities.values())
      for (const p of new Set(e.parents))
        this.entities.get(p)?.children.push(e.iri);
    for (const e of this.entities.values())
      e.children.sort((a, b) => local(a).localeCompare(local(b), "en-GB"));
    for (const t of [...this.tbox, ...this.rbox]) {
      const s = this.bySubject.get(t.subject) ?? [];
      s.push(t);
      this.bySubject.set(t.subject, s);
      const p = this.byPredicate.get(t.predicate) ?? [];
      p.push(t);
      this.byPredicate.set(t.predicate, p);
      if (
        !t.object.literal &&
        (this.ontology.assertedOnly ||
          (this.exists(t.subject) && this.exists(t.object.value)))
      )
        this.addReverse(t.object.value, {
          iri: t.subject,
          predicate: t.predicate,
          outgoing: false,
        });
    }
    this.intersections = projectIntersections(this.entities, this.tbox);
  }
  private addReverse(iri: string, n: Neighbour) {
    const b = this.reverse.get(iri) ?? [];
    b.push(n);
    this.reverse.set(iri, b);
  }
  ordersFor(customer: string) {
    if (!this.byCustomer) {
      this.byCustomer = new Map();
      for (const i of this.individuals) {
        const key = this.customers[i.customerIndex]?.iri;
        if (!key) continue;
        const b = this.byCustomer.get(key) ?? [];
        b.push(i);
        this.byCustomer.set(key, b);
      }
    }
    return this.byCustomer.get(customer) ?? [];
  }
  neighbours(
    iri: string,
    membership?: Set<string>,
    visit?: (edge: Neighbour) => void,
  ): Adjacency {
    const list: Neighbour[] = [],
      seen = new Set<string>();
    let total = 0;
    const add = (
      target: string,
      predicate: string,
      outgoing: boolean,
      intersection?: import("./model").IntersectionBranch,
    ) => {
      if (
        !intersection &&
        [iri, target].some(
          (i) => i.startsWith("_:") && this.entities.get(i)?.intersection,
        )
      )
        return;
      const source = outgoing ? iri : target,
        object = outgoing ? target : iri;
      if (
        this.intersections.lists.has(source) ||
        this.intersections.lists.has(object)
      )
        return;
      // Declaration triples and RDF collection cells are not graph relationships.
      if (
        predicate === TYPE &&
        [NS.owl + "Class", NS.rdfs + "Class", NS.owl + "Restriction"].includes(
          object,
        )
      )
        return;
      const key = JSON.stringify([
        target,
        predicate,
        outgoing,
        intersection?.axiom,
      ]);
      if (seen.has(key)) return;
      seen.add(key);
      total++;
      visit?.({
        iri: target,
        predicate,
        outgoing,
        ...(intersection ? { intersection } : {}),
      });
      if (list.length < 4000 && (!membership || membership.has(target)))
        list.push({
          iri: target,
          predicate,
          outgoing,
          ...(intersection ? { intersection } : {}),
        });
    };
    const i = this.individualIndex.get(iri),
      e = this.entities.get(iri);
    if (i) {
      add(i.type, TYPE, true);
      add(NS.demo + "Order", TYPE, true);
      const c = this.customers[i.customerIndex];
      if (c) add(c.iri, NS.demo + "orderedBy", true);
    } else if (this.customerIndex.has(iri)) {
      add(NS.demo + "Customer", TYPE, true);
      for (const o of this.ordersFor(iri))
        add(o.iri, NS.demo + "orderedBy", false);
    } else if (e) {
      for (const t of this.bySubject.get(iri) ?? [])
        if (
          !t.object.literal &&
          (this.ontology.assertedOnly || this.exists(t.object.value))
        )
          if (t.predicate !== INTERSECTION)
            add(t.object.value, t.predicate, true);
      const pred = e.kind.endsWith("Property") ? SUBPROPERTY : SUBCLASS;
      for (const p of e.parents) add(p, pred, true);
      for (const c of e.children) add(c, pred, false);
      for (const r of [...e.restrictions, ...e.equivalents])
        for (const f of r.fillers)
          add(f, r.property ?? NS.owl + "equivalentClass", true);
      for (const d of e.disjoint) add(d, NS.owl + "disjointWith", true);
      if (e.domain) add(e.domain, NS.rdfs + "domain", true);
      if (e.range) add(e.range, NS.rdfs + "range", true);
      if (e.inverse) add(e.inverse, NS.owl + "inverseOf", true);
      for (const t of e.types) add(t, TYPE, true);
      for (const r of this.reverse.get(iri) ?? [])
        if (r.predicate !== INTERSECTION) add(r.iri, r.predicate, false);
      for (const r of this.intersections.neighbours.get(iri) ?? [])
        add(r.iri, r.predicate, r.outgoing, r.intersection);
      for (const o of this.byType.get(iri) ?? []) add(o.iri, TYPE, false);
      if (iri === NS.demo + "Customer")
        for (const c of this.customers) add(c.iri, TYPE, false);
      if (iri === NS.demo + "Order")
        for (const o of this.individuals) add(o.iri, TYPE, false);
    }
    return { list, total };
  }
  value(i: Individual, name: string): Term {
    switch (name) {
      case "orderRef":
        return literal(i.reference);
      case "branch":
        return literal(i.branch);
      case "priceGBP":
        return literal(i.price, "decimal");
      case "rating":
        return literal(i.rating, "integer");
      case "preparedAt":
        return literal(new Date(i.timestamp).toISOString(), "dateTime");
      case "orderedBy":
        return iriTerm(this.customers[i.customerIndex].iri);
      default:
        throw Error("Unknown predicate");
    }
  }
  *scan(subject?: string, predicate?: string, obj?: Term): Generator<Triple> {
    const match = (t: Triple) =>
      (!subject || subject === t.subject) &&
      (!predicate || predicate === t.predicate) &&
      (!obj || equivalent(obj, t.object));
    const statics = subject
      ? (this.bySubject.get(subject) ?? [])
      : predicate
        ? (this.byPredicate.get(predicate) ?? [])
        : [...this.tbox, ...this.rbox];
    for (const t of statics) if (match(t)) yield t;
    const subjectOrder = subject
        ? this.individualIndex.get(subject)
        : undefined,
      subjectCustomer = subject ? this.customerIndex.get(subject) : undefined;
    if (!predicate || predicate === TYPE) {
      const orders = subject
        ? subjectOrder
          ? [subjectOrder]
          : []
        : obj
          ? obj.value === NS.demo + "Order"
            ? this.individuals
            : (this.byType.get(obj.value) ?? [])
          : this.individuals;
      for (const i of orders) {
        const t = {
          subject: i.iri,
          predicate: TYPE,
          object: iriTerm(
            !subject && obj?.value === NS.demo + "Order"
              ? NS.demo + "Order"
              : i.type,
          ),
        };
        if (match(t)) yield t;
      }
      if (!obj || obj.value === NS.demo + "Customer")
        for (const c of subject
          ? subjectCustomer
            ? [subjectCustomer]
            : []
          : this.customers) {
          const t = {
            subject: c.iri,
            predicate: TYPE,
            object: iriTerm(NS.demo + "Customer"),
          };
          if (match(t)) yield t;
        }
    }
    const names = [
      "orderRef",
      "branch",
      "priceGBP",
      "preparedAt",
      "rating",
      "orderedBy",
    ];
    for (const name of !predicate
      ? names
      : predicate.startsWith(NS.demo) &&
          names.includes(predicate.slice(NS.demo.length))
        ? [predicate.slice(NS.demo.length)]
        : []) {
      const orders = subject
        ? subjectOrder
          ? [subjectOrder]
          : []
        : name === "orderedBy" && obj && !obj.literal
          ? this.ordersFor(obj.value)
          : this.individuals;
      for (const i of orders) {
        const t = {
          subject: i.iri,
          predicate: NS.demo + name,
          object: this.value(i, name),
        };
        if (match(t)) yield t;
      }
    }
    if (!predicate || predicate === NS.rdfs + "label")
      for (const c of subject
        ? subjectCustomer
          ? [subjectCustomer]
          : []
        : this.customers) {
        const t = {
          subject: c.iri,
          predicate: NS.rdfs + "label",
          object: literal(c.name),
        };
        if (match(t)) yield t;
      }
  }
  querySnapshot() {
    const s = new Store();
    s.ontology = { ...this.ontology };
    s.entities = new Map(
      [...this.entities].map(([k, v]) => [k, structuredClone(v)]),
    );
    s.tbox = this.tbox.slice();
    s.rebuildSchema();
    s.individuals = this.individuals.slice();
    s.customers = this.customers.slice();
    s.indexGenerated();
    s.version = this.version;
    return s;
  }
  table(filter: TableFilter) {
    const q = filter.query.trim().toLowerCase();
    const rows = this.individuals.filter(
      (i) =>
        (!filter.type || i.type === filter.type) &&
        (!filter.branch || i.branch === filter.branch) &&
        (!q ||
          [
            i.reference,
            local(i.type),
            i.branch,
            local(i.iri),
            this.customers[i.customerIndex]?.name ?? "",
          ]
            .join(" ")
            .toLowerCase()
            .includes(q)),
    );
    const selectors: Record<string, (i: Individual) => string | number> = {
      iri: (i) => i.index,
      type: (i) => i.type,
      ref: (i) => i.reference,
      branch: (i) => i.branch,
      price: (i) => i.price,
      rating: (i) => i.rating,
      ts: (i) => i.timestamp,
      cust: (i) => this.customers[i.customerIndex]?.name ?? "",
    };
    const key = selectors[filter.sort] ?? selectors.iri;
    if (filter.sort !== "iri" || filter.direction !== 1)
      rows.sort((a, b) => compare(key(a), key(b)) * filter.direction);
    return rows;
  }
  validateName(input: string, _except?: string) {
    try {
      validLabel(input);
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  }
  mintIri(label: string) {
    return uniqueLabelIri(label, this.ontology.namespace, (iri) =>
      this.exists(iri),
    );
  }
  entityStatements(iri: string) {
    const e = this.entities.get(iri);
    if (!e) throw Error("The entity is no longer available.");
    const result = structuredClone(this.tbox.filter((t) => t.subject === iri));
    if (
      !this.ontology.assertedOnly &&
      !result.some((t) => t.predicate === LABEL)
    )
      result.push({
        subject: iri,
        predicate: LABEL,
        object: { value: displayName(e), literal: true },
      });
    if (
      !this.ontology.assertedOnly &&
      e.comment &&
      !result.some((t) => t.predicate === COMMENT)
    )
      result.push({
        subject: iri,
        predicate: COMMENT,
        object: { value: e.comment, literal: true },
      });
    return result;
  }
  updateEntity(
    iri: string,
    statements: Triple[],
    nextIri = iri,
    related?: { subjects: Set<string>; statements: Triple[] },
  ) {
    if (!this.entities.has(iri))
      throw Error("The entity is no longer available.");
    if (!Array.isArray(statements) || statements.length > 100000)
      throw Error("Too many entity statements.");
    for (const t of statements) {
      validateStatement(t);
      if (t.subject !== iri)
        throw Error("All edited statements must describe this entity.");
    }
    if (nextIri === iri)
      nextIri = labelledIri(
        iri,
        preferredLabel(statements)?.object.value ?? "",
        (candidate) => this.exists(candidate),
      );
    if (iri === THING && nextIri !== iri)
      throw Error("The ontology root IRI cannot be changed.");
    if (nextIri !== iri && this.ontology.example && !isDefaultIdentifier(iri))
      throw Error(
        "The generated example uses fixed IRIs. Export it as RDF and reimport it before changing identifiers.",
      );
    if (nextIri !== iri && this.exists(nextIri))
      throw Error("That IRI already exists.");
    if (!statements.length)
      throw Error("Keep at least one statement for this entity.");
    for (const t of related?.statements ?? []) {
      validateStatement(t);
      if (!t.subject.startsWith("_:"))
        throw Error("Related statements must describe anonymous resources.");
    }
    const before = this.schemaState();
    this.record(
      "Edit " + this.label(iri),
      () => {
        const triples = this.tbox
          .filter((t) => t.subject !== iri && !related?.subjects.has(t.subject))
          .concat(
            structuredClone([...statements, ...(related?.statements ?? [])]),
          )
          .map((t) => ({
            ...t,
            subject: t.subject === iri ? nextIri : t.subject,
            predicate: t.predicate === iri ? nextIri : t.predicate,
            object:
              !t.object.literal && t.object.value === iri
                ? { ...t.object, value: nextIri }
                : t.object,
            ...(t.graph === iri ? { graph: nextIri } : {}),
          }));
        const seen = new Set<string>();
        this.tbox = triples.filter((t) => {
          const k = statementKey(t);
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
        // Parent edits replace simple subclass intersections with named parents.
        // Keep shared or annotated anonymous descriptions intact.
        for (const old of before.tbox) {
          if (
            old.subject === iri &&
            old.predicate === SUBCLASS &&
            !old.object.literal &&
            old.object.value.startsWith("_:") &&
            !this.tbox.some((t) => statementKey(t) === statementKey(old))
          )
            for (const removed of discardUnusedIntersection(this.tbox, old))
              this.entities.delete(removed);
        }
        const projected = projectEntities(this.tbox);
        if (this.ontology.assertedOnly) this.entities = projected;
        else
          for (const [id, e] of projected) {
            if (id === nextIri || !this.entities.has(id))
              this.entities.set(id, e);
          }
        if (nextIri !== iri) {
          this.entities.delete(iri);
          for (const e of this.entities.values()) {
            for (const key of ["parents", "types", "disjoint"] as const)
              e[key] = e[key].map((v) => (v === iri ? nextIri : v));
            for (const key of ["domain", "range", "inverse"] as const)
              if (e[key] === iri) e[key] = nextIri;
            for (const r of [...e.restrictions, ...e.equivalents]) {
              if (r.property === iri) r.property = nextIri;
              r.fillers = r.fillers.map((v) => (v === iri ? nextIri : v));
            }
          }
        }
        this.rebuildSchema();
      },
      () => this.restoreSchema(before),
    );
    return nextIri;
  }
  createEdge(statement: Triple) {
    if (
      [statement.subject, statement.object.value].some(
        (i) => this.entities.get(i)?.kind === "Intersection",
      )
    )
      throw Error(
        "Intersection junctions represent OWL expressions. Edit the axiom in Source.",
      );
    this.editEdge(undefined, statement);
  }
  editEdge(original: Triple | undefined, replacement?: Triple) {
    if (!original && !replacement) throw Error("Choose a relationship to add.");
    if (original) validateStatement(original);
    if (original?.object.literal)
      throw Error("Select a relationship between resources.");
    const index = original
      ? this.tbox.findIndex((t) => statementKey(t) === statementKey(original))
      : this.tbox.length;
    if (index < 0)
      throw Error("This relationship changed. Select the edge again.");
    if (replacement) {
      validateStatement(replacement);
      if (replacement.object.literal)
        throw Error("Choose a resource as the edge target.");
      if (
        !this.entities.has(replacement.subject) ||
        !this.entities.has(replacement.object.value)
      )
        throw Error("Choose existing ontology entities as the endpoints.");
      if (original && replacement.graph !== original.graph)
        throw Error("Keep the relationship in its original statement graph.");
      if (original && statementKey(replacement) === statementKey(original))
        return;
      if (this.tbox.some((t) => statementKey(t) === statementKey(replacement)))
        throw Error(
          "That relationship already exists in this statement graph.",
        );
    }
    const before = this.schemaState();
    this.record(
      original ? (replacement ? "Edit edge" : "Remove edge") : "Add edge",
      () => {
        this.tbox.splice(
          index,
          original ? 1 : 0,
          ...(replacement ? [structuredClone(replacement)] : []),
        );
        const projected = projectEntities(this.tbox);
        if (this.ontology.assertedOnly)
          for (const [iri, e] of projected) this.entities.set(iri, e);
        const subjects = new Set([
          ...(original ? [original.subject] : []),
          ...(replacement ? [replacement.subject] : []),
        ]);
        const predicates = new Set([
          ...(original ? [original.predicate] : []),
          ...(replacement ? [replacement.predicate] : []),
        ]);
        for (const iri of subjects) {
          const previous = this.entities.get(iri);
          if (!previous) continue;
          const next = projected.get(iri) ?? entity(iri, previous.kind);
          if (this.ontology.assertedOnly) this.entities.set(iri, next);
          else {
            const merged = { ...previous };
            if (predicates.has(SUBCLASS) || predicates.has(SUBPROPERTY))
              merged.parents = next.parents;
            if (predicates.has(TYPE)) merged.types = next.types;
            if (predicates.has(NS.owl + "disjointWith"))
              merged.disjoint = next.disjoint;
            if (predicates.has(NS.rdfs + "domain")) merged.domain = next.domain;
            if (predicates.has(NS.rdfs + "range")) merged.range = next.range;
            if (predicates.has(NS.owl + "inverseOf"))
              merged.inverse = next.inverse;
            if (predicates.has(NS.owl + "equivalentClass"))
              merged.equivalents = previous.equivalents
                .filter((r) => r.shape !== "class")
                .concat(next.equivalents.filter((r) => r.shape === "class"));
            this.entities.set(iri, merged);
          }
        }
        this.rebuildSchema();
      },
      () => this.restoreSchema(before),
    );
  }
  moveClass(iri: string, parent: string, fromParent: string | null) {
    const issue = classMoveIssue(this.entities, iri, parent);
    if (issue) throw Error(issue);
    const entity = this.entities.get(iri)!;
    if (
      fromParent !== null &&
      !(entity.taxonomyParents ?? entity.parents).includes(fromParent)
    )
      throw Error("The original parent changed. Drag the class again.");
    const statements = this.entityStatements(iri);
    const previous = statements.filter(
      (t) =>
        t.predicate === SUBCLASS &&
        !t.object.literal &&
        t.object.value === fromParent,
    );
    const existing = statements.filter(
      (t) =>
        t.predicate === SUBCLASS &&
        !t.object.literal &&
        t.object.value === parent,
    );
    if (parent === fromParent && existing.length) return false;
    // The dragged branch changes. Other parents, restrictions and definitions remain asserted.
    const target = [
      ...existing,
      ...(previous.length
        ? previous.map((t) => ({ ...t, object: iriTerm(parent) }))
        : existing.length
          ? []
          : [{ subject: iri, predicate: SUBCLASS, object: iriTerm(parent) }]),
    ];
    const next = [
      ...target,
      ...statements.filter(
        (t) => !previous.includes(t) && !existing.includes(t),
      ),
    ];
    if (JSON.stringify(next) === JSON.stringify(statements)) return false;
    this.updateEntity(iri, next);
    this.undoStack[this.undoStack.length - 1].label =
      "Move " + this.label(iri) + " under " + this.label(parent);
    return true;
  }
  addClassParents(owner: string, members: string[]) {
    const e = this.entities.get(owner);
    if (
      !e ||
      !namedClass(e) ||
      !Array.isArray(members) ||
      !members.length ||
      members.length > 4096
    )
      throw Error("Choose existing parent classes.");
    for (const id of members) {
      const member = this.entities.get(id);
      if (!member || !namedClass(member) || id === owner)
        throw Error("Choose distinct existing parent classes.");
      const pending = [id],
        seen = new Set<string>();
      while (pending.length) {
        const next = pending.pop()!;
        if (next === owner) throw Error("This would create a taxonomy cycle.");
        if (seen.has(next)) continue;
        seen.add(next);
        const ancestor = this.entities.get(next);
        pending.push(...(ancestor?.taxonomyParents ?? ancestor?.parents ?? []));
      }
    }
    return this.updateEntity(owner, [
      ...this.entityStatements(owner),
      ...[...new Set(members)].map((value) => ({
        subject: owner,
        predicate: SUBCLASS,
        object: iriTerm(value),
      })),
    ]);
  }
  setIntersection(
    owner: string,
    members: string[],
    predicate = NS.owl + "equivalentClass",
    original?: Triple,
  ) {
    const e = this.entities.get(owner);
    if (!e || !namedClass(e)) throw Error("Choose a named class.");
    if (![SUBCLASS, NS.owl + "equivalentClass"].includes(predicate))
      throw Error("Choose subclass or equivalence.");
    if (
      !Array.isArray(members) ||
      members.length > 4096 ||
      new Set(members).size !== members.length ||
      members.some(
        (i) => typeof i !== "string" || !this.entities.has(i) || i === owner,
      )
    )
      throw Error("Choose distinct existing member classes.");
    if (!original && members.length < 2)
      throw Error("Choose at least two member classes.");
    const index = original
      ? this.tbox.findIndex((t) => statementKey(t) === statementKey(original))
      : -1;
    if (original && index < 0)
      throw Error("The intersection changed. Reload its details.");
    if (
      original &&
      !(
        original.subject === owner ||
        (original.predicate === NS.owl + "equivalentClass" &&
          original.object.value === owner)
      )
    )
      throw Error("Choose this class's intersection.");
    for (const member of members) {
      const pending = [member],
        seen = new Set<string>();
      while (pending.length) {
        const id = pending.pop()!;
        if (id === owner) throw Error("This would create a taxonomy cycle.");
        if (seen.has(id)) continue;
        seen.add(id);
        const node = this.entities.get(id);
        pending.push(...(node?.taxonomyParents ?? node?.parents ?? []));
      }
    }
    if (
      !original &&
      (e.classExpressions ?? []).some(
        (r) =>
          r.predicate === predicate &&
          JSON.stringify(
            [...(this.entities.get(r.iri)?.intersection?.members ?? [])].sort(),
          ) === JSON.stringify([...members].sort()),
      )
    )
      throw Error("This intersection already exists.");
    const before = this.schemaState(),
      graph = original?.graph;
    const additions: Triple[] = [];
    const triple = (
      subject: string,
      predicate: string,
      value: string,
    ): Triple => ({
      subject,
      predicate,
      object: iriTerm(value),
      ...(graph ? { graph } : {}),
    });
    if (members.length === 1)
      additions.push(triple(owner, predicate, members[0]));
    else if (members.length > 1) {
      const token = crypto.randomUUID().replaceAll("-", ""),
        expression = "_:intersection" + token;
      additions.push(
        triple(owner, predicate, expression),
        triple(expression, TYPE, NS.owl + "Class"),
        triple(expression, INTERSECTION, "_:list" + token + "_0"),
      );
      members.forEach((member, i) =>
        additions.push(
          triple("_:list" + token + "_" + i, NS.rdf + "first", member),
          triple(
            "_:list" + token + "_" + i,
            NS.rdf + "rest",
            i === members.length - 1
              ? NS.rdf + "nil"
              : "_:list" + token + "_" + (i + 1),
          ),
        ),
      );
    }
    this.record(
      original ? "Change intersection" : "Add intersection",
      () => {
        if (index >= 0) {
          this.tbox.splice(index, 1);
          for (const iri of discardUnusedIntersection(this.tbox, original!))
            this.entities.delete(iri);
        }
        this.tbox.push(...structuredClone(additions));
        const projected = projectEntities(this.tbox);
        for (const [iri, next] of projected) {
          const prior = this.entities.get(iri);
          if (this.ontology.assertedOnly || !prior)
            this.entities.set(iri, next);
          else if (iri === owner) {
            prior.parents = next.parents;
            prior.equivalents = prior.equivalents
              .filter((r) => r.shape !== "class")
              .concat(next.equivalents.filter((r) => r.shape === "class"));
          }
        }
        this.rebuildSchema();
      },
      () => this.restoreSchema(before),
    );
  }
  createProperty(
    label: string,
    kind: "ObjectProperty" | "DataProperty" | "AnnotationProperty",
  ) {
    label = validLabel(label);
    const iri = this.mintIri(label),
      before = this.schemaState();
    this.record(
      "Create " + label,
      () => {
        const e = this.addEntity(iri, kind);
        e.name = label;
        e.label = label;
        this.tbox.push(
          {
            subject: iri,
            predicate: TYPE,
            object: iriTerm(
              NS.owl +
                {
                  ObjectProperty: "ObjectProperty",
                  DataProperty: "DatatypeProperty",
                  AnnotationProperty: "AnnotationProperty",
                }[kind],
            ),
          },
          { subject: iri, predicate: LABEL, object: literal(label) },
        );
        this.rebuildSchema();
      },
      () => this.restoreSchema(before),
    );
    return iri;
  }
  replaceRdf(statements: Triple[]) {
    const next = structuredClone(statements);
    for (const t of next) validateStatement(t);
    const projected = projectEntities(next);
    const before = {
      schema: this.schemaState(),
      ontology: structuredClone(this.ontology),
      individuals: this.individuals,
      customers: this.customers,
    };
    this.record(
      "Edit ontology source",
      () => {
        this.tbox = structuredClone(next);
        this.entities = new Map(structuredClone([...projected]));
        this.ontology = {
          ...this.ontology,
          assertedOnly: true,
          example: false,
        };
        this.individuals = [];
        this.customers = [];
        this.indexGenerated();
        this.rebuildSchema();
      },
      () => {
        this.ontology = structuredClone(before.ontology);
        this.individuals = before.individuals;
        this.customers = before.customers;
        this.indexGenerated();
        this.restoreSchema(before.schema);
      },
    );
  }
  private record(label: string, redo: () => void, undo: () => void) {
    redo();
    this.undoStack.push({ label, redo, undo });
    this.redoStack = [];
    this.version++;
  }
  rename(iri: string, name: string) {
    const e = this.entities.get(iri);
    if (!e) throw Error("Generated individuals cannot be renamed.");
    if (e.kind === "Intersection")
      throw Error("An intersection is an OWL expression, not a named class.");
    if (iri === THING) throw Error("The ontology root cannot be renamed.");
    name = validLabel(name);
    const nextIri = labelledIri(iri, name, (candidate) =>
      this.exists(candidate),
    );
    if (nextIri !== iri) {
      const statements = this.entityStatements(iri),
        target = statements.find(
          (t) =>
            t.predicate === LABEL &&
            t.object.literal &&
            (t.object.language ?? "") === (e.labelLanguage ?? "") &&
            t.object.value === (e.label ?? e.name),
        );
      if (target) target.object.value = name;
      else
        statements.push({
          subject: iri,
          predicate: LABEL,
          object: { literal: true, value: name },
        });
      return this.updateEntity(iri, statements, nextIri);
    }
    if (e.label === name) return iri;
    const before = this.schemaState(),
      oldLabel = e.label ?? e.name,
      language = e.labelLanguage;
    this.record(
      "Rename " + this.label(iri),
      () => {
        const target = this.entities.get(iri)!;
        target.name = name;
        target.label = name;
        const index = this.tbox.findIndex(
          (t) =>
            t.subject === iri &&
            t.predicate === LABEL &&
            t.object.literal &&
            (t.object.language ?? "") === (language ?? "") &&
            t.object.value === oldLabel,
        );
        if (index >= 0) {
          const t = this.tbox[index];
          this.tbox[index] = { ...t, object: { ...t.object, value: name } };
        } else
          this.tbox.push({
            subject: iri,
            predicate: LABEL,
            object: {
              value: name,
              literal: true,
              ...(language
                ? { language, datatype: NS.rdf + "langString" }
                : {}),
            },
          });
        this.rebuildSchema();
      },
      () => this.restoreSchema(before),
    );
    return iri;
  }
  private schemaState() {
    return {
      entities: structuredClone([...this.entities]),
      tbox: structuredClone(this.tbox),
    };
  }
  private restoreSchema(s: ReturnType<Store["schemaState"]>) {
    this.entities = new Map(structuredClone(s.entities));
    this.tbox = structuredClone(s.tbox);
    this.rebuildSchema();
  }
  createClass(name: string, parent: string, comment = "") {
    const error = this.validateName(name);
    if (error) throw Error(error);
    const p = this.entities.get(parent);
    if (!p || !["Class", "Defined"].includes(p.kind))
      throw Error("Choose an existing superclass.");
    const iri = this.mintIri(name);
    if (this.exists(iri))
      throw Error("That IRI already exists. Choose a different name.");
    const before = this.schemaState();
    this.record(
      "Create " + name,
      () => {
        const e = this.addEntity(iri, "Class");
        e.name = name.trim();
        e.label = e.name;
        this.tbox.push({
          subject: iri,
          predicate: LABEL,
          object: literal(e.name),
        });
        if (comment.trim())
          this.tbox.push({
            subject: iri,
            predicate: COMMENT,
            object: literal(comment.trim()),
          });
        e.parents = [parent];
        e.comment = comment.trim();
        this.tbox.push({
          subject: iri,
          predicate: TYPE,
          object: iriTerm(NS.owl + "Class"),
        });
        this.tbox.push({
          subject: iri,
          predicate: SUBCLASS,
          object: iriTerm(parent),
        });
        this.rebuildSchema();
      },
      () => this.restoreSchema(before),
    );
    return iri;
  }
  deleteClass(iri: string) {
    if (iri === THING)
      throw Error("owl:Thing is the ontology root and cannot be deleted.");
    const e = this.entities.get(iri);
    if (!e || !["Class", "Defined"].includes(e.kind))
      throw Error("Select a class to delete.");
    const before = this.schemaState();
    this.record(
      "Delete " + e.name,
      () => {
        this.entities.delete(iri);
        this.tbox = this.tbox.filter(
          (t) =>
            t.subject !== iri && (t.object.literal || t.object.value !== iri),
        );
        for (const c of this.entities.values()) {
          if (c.parents.includes(iri)) {
            c.parents = [
              ...new Set([
                ...c.parents.filter((p) => p !== iri),
                ...(e.parents.length ? e.parents : [THING]).filter(
                  (p) => p !== c.iri,
                ),
              ]),
            ];
            for (const p of c.parents)
              if (
                !this.tbox.some(
                  (t) =>
                    t.subject === c.iri &&
                    t.predicate === SUBCLASS &&
                    t.object.value === p,
                )
              )
                this.tbox.push({
                  subject: c.iri,
                  predicate: SUBCLASS,
                  object: iriTerm(p),
                });
          }
          c.disjoint = c.disjoint.filter((i) => i !== iri);
          for (const key of ["restrictions", "equivalents"] as const)
            c[key] = c[key]
              .map((r) => ({
                ...r,
                fillers: r.fillers.filter((f) => f !== iri),
              }))
              .filter((r) => r.fillers.length || r.quantifier === "max");
          for (const key of ["domain", "range", "inverse"] as const)
            if (c[key] === iri) delete c[key];
          c.types = c.types.filter((t) => t !== iri);
        }
        this.rebuildSchema();
      },
      () => this.restoreSchema(before),
    );
  }
  editCell(iri: string, column: string, input: string) {
    const i = this.individualIndex.get(iri);
    if (!i) throw Error("This individual is no longer in the Store.");
    let value: string | number;
    if (column === "branch") {
      value = input.trim();
      if (!branches.includes(value)) throw Error("Choose an existing branch.");
    } else if (column === "price") value = validatePrice(input);
    else if (column === "rating") value = validateRating(input);
    else throw Error("That column is not editable.");
    const next = { ...i, [column]: value };
    const replace = (record: Individual) => {
      this.individuals[i.index] = record;
      this.individualIndex.set(iri, record);
      const b = this.byType.get(i.type)!;
      b[b.findIndex((x) => x.iri === iri)] = record;
      this.byCustomer = undefined;
    };
    this.record(
      "Edit " + column,
      () => replace(next),
      () => replace(i),
    );
  }
  addSynonym(iri: string, label: string) {
    if (!this.exists(iri)) throw Error("The entity no longer exists.");
    label = label.trim();
    if (!label || label.length > 256)
      throw Error("Enter a synonym of 1 to 256 characters.");
    const predicate = "http://www.w3.org/2004/02/skos/core#altLabel";
    if (
      this.tbox.some(
        (t) =>
          t.subject === iri &&
          t.predicate === predicate &&
          t.object.value === label,
      )
    )
      return;
    const before = this.schemaState();
    this.record(
      "Add synonym",
      () => {
        this.tbox.push({
          subject: iri,
          predicate,
          object: { value: label, literal: true },
        });
        this.rebuildSchema();
      },
      () => this.restoreSchema(before),
    );
  }
  createNamedIndividual(name: string, type: string, comment = "") {
    const error = this.validateName(name);
    if (error) throw Error(error);
    const parent = this.entities.get(type);
    if (!parent || !["Class", "Defined"].includes(parent.kind))
      throw Error("Choose an existing class.");
    const iri = this.mintIri(name);
    if (this.exists(iri)) throw Error("That IRI already exists.");
    const before = this.schemaState();
    this.record(
      "Create " + name,
      () => {
        const e = this.addEntity(iri, "Individual");
        e.name = name.trim();
        e.label = e.name;
        this.tbox.push({
          subject: iri,
          predicate: LABEL,
          object: literal(e.name),
        });
        if (comment.trim())
          this.tbox.push({
            subject: iri,
            predicate: COMMENT,
            object: literal(comment.trim()),
          });
        e.types = [type];
        e.comment = comment;
        this.tbox.push({
          subject: iri,
          predicate: TYPE,
          object: iriTerm(type),
        });
        this.rebuildSchema();
      },
      () => this.restoreSchema(before),
    );
    return iri;
  }
  createIndividual(
    type: string,
    branch: string,
    price: string,
    rating = 5,
    customerIndex = 0,
    timestamp = Date.now(),
  ) {
    if (!this.byType.has(type))
      throw Error("Choose an instantiated pizza type.");
    if (!branches.includes(branch)) throw Error("Choose an existing branch.");
    const amount = validatePrice(price);
    validateRating(String(rating));
    if (
      !Number.isInteger(customerIndex) ||
      customerIndex < 0 ||
      customerIndex >= this.customers.length
    )
      throw Error("Choose an existing customer.");
    const index = this.individuals.length;
    let suffix = index + 1;
    let iri = "";
    do {
      iri = NS.demo + "Pizza_" + String(suffix++).padStart(6, "0");
    } while (this.exists(iri));
    const i: Individual = {
      index,
      iri,
      type,
      branch,
      price: amount,
      rating,
      customerIndex,
      timestamp,
      reference: "AX-" + String((100000 + index) % 1000000).padStart(6, "0"),
    };
    this.record(
      "Create " + local(iri),
      () => {
        this.individuals.push(i);
        this.individualIndex.set(iri, i);
        this.byType.get(type)!.push(i);
        this.byCustomer = undefined;
      },
      () => {
        this.individuals.pop();
        this.individualIndex.delete(iri);
        this.byType.set(
          type,
          this.byType.get(type)!.filter((x) => x.iri !== iri),
        );
        this.byCustomer = undefined;
      },
    );
    return iri;
  }
  undo() {
    const op = this.undoStack.pop();
    if (!op) return false;
    op.undo();
    this.redoStack.push(op);
    this.version++;
    return true;
  }
  redo() {
    const op = this.redoStack.pop();
    if (!op) return false;
    op.redo();
    this.undoStack.push(op);
    this.version++;
    return true;
  }
}
export function validatePrice(input: string) {
  const text = input.trim().replace(/^£/, "");
  if (!text)
    throw Error(
      "Price is required. Enter an amount in pounds, for example 12.50.",
    );
  if (
    !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text) ||
    !Number.isFinite(+text)
  )
    throw Error("Enter a number in pounds, for example 12.50.");
  const value = +text;
  if (value < 0) throw Error("Price cannot be negative.");
  if (value > 500)
    throw Error("Price exceeds the £500 sanity limit for a single pizza.");
  return Math.floor(value * 100 + 0.5) / 100;
}
export function validateRating(input: string) {
  const text = input.trim();
  if (!text)
    throw Error("Rating is required. Enter a whole number from 1 to 5.");
  const value = Number(text);
  if (!Number.isInteger(value)) throw Error("Rating must be a whole number.");
  if (value < 1 || value > 5) throw Error("Rating must be between 1 and 5.");
  return value;
}
