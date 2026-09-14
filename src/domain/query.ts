import {
  NS,
  TYPE,
  iriTerm,
  literal,
  equivalent,
  termDatatype,
  compare,
  type Term,
  type Triple,
} from "./model";
import { Store } from "./store";
export class QueryError extends Error {
  constructor(
    message: string,
    public hint = "Check the query syntax against one of the examples.",
  ) {
    super(message);
    this.name = "QueryError";
  }
}
export interface QueryTerm {
  variable?: string;
  constant?: Term;
}
export interface Pattern {
  subject: QueryTerm;
  predicate: QueryTerm;
  object: QueryTerm;
}
export interface ParsedQuery {
  columns: string[];
  patterns: Pattern[];
  filters: { left: QueryTerm; operator: string; right: QueryTerm }[];
  distinct: boolean;
  order?: string;
  descending: boolean;
  limit?: number;
}
export interface QueryResult {
  columns: string[];
  rows: Term[][];
  total: number;
  capped: boolean;
  iris: string[];
  milliseconds: number;
  storeVersion: number;
}
export function parseQuery(text: string): ParsedQuery {
  const re =
    /(?<space>\s+)|(?<comment>#[^\r\n]*)|(?<string>"(?:\\.|[^"\\])*")|(?<variable>\?[A-Za-z_][A-Za-z0-9_]*)|(?<iri><[^<>\s]*>)|(?<name>[A-Za-z_][A-Za-z0-9_-]*:[A-Za-z0-9_-]*)|(?<number>-?[0-9]+(?:\.[0-9]*)?)|(?<operator><=|>=|!=|=|<|>)|(?<word>[A-Za-z_][A-Za-z0-9_]*)|(?<punct>[{}().;,*])|(?<symbol>\S)/gy;
  const tokens: { kind: string; text: string; offset: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const kind = Object.keys(m.groups!).find(
      (k) => m!.groups![k] !== undefined,
    )!;
    if (kind !== "space" && kind !== "comment")
      tokens.push({ kind, text: m[0], offset: m.index });
  }
  let at = 0;
  const prefixes: Record<string, string> = { ...NS },
    peek = () => tokens[at],
    is = (s: string) => peek()?.text.toUpperCase() === s.toUpperCase(),
    eat = (s: string) => {
      if (!is(s)) return false;
      at++;
      return true;
    },
    take = () => {
      if (!peek())
        throw new QueryError(
          "The pattern ends too early.",
          "Every triple pattern needs a subject, predicate and object.",
        );
      return tokens[at++];
    },
    need = (s: string, message?: string, hint?: string) => {
      if (!eat(s))
        throw new QueryError(
          message ??
            "Expected " +
              s +
              " but found " +
              (peek()?.text ?? "the end of the query") +
              ".",
          hint ??
            "Check the braces and the dot at the end of each triple pattern.",
        );
    };
  const term = (): QueryTerm => {
    const t = take();
    if (t.kind === "variable") return { variable: t.text };
    if (t.kind === "iri") return { constant: iriTerm(t.text.slice(1, -1)) };
    if (t.kind === "string")
      return {
        constant: literal(t.text.slice(1, -1).replace(/\\(.)/g, "$1")),
      };
    if (t.kind === "number")
      return {
        constant: literal(
          Number(t.text),
          t.text.includes(".") ? "decimal" : "integer",
        ),
      };
    if (t.text === "a") return { constant: iriTerm(TYPE) };
    if (t.kind === "name") {
      const i = t.text.indexOf(":"),
        p = t.text.slice(0, i);
      if (!prefixes[p])
        throw new QueryError(
          "Unknown prefix " + p + ":.",
          "Declare it with PREFIX, or use " +
            Object.keys(prefixes).join(", ") +
            ".",
        );
      return { constant: iriTerm(prefixes[p] + t.text.slice(i + 1)) };
    }
    throw new QueryError(
      t.text + " is not a valid term.",
      "Use variables (?x), prefixed names, IRIs or quoted literals.",
    );
  };
  while (eat("PREFIX")) {
    const p = take(),
      u = take();
    if (p.kind !== "name" || !p.text.endsWith(":") || u.kind !== "iri")
      throw new QueryError(
        "Malformed PREFIX declaration.",
        "Write PREFIX pizza: <http://www.co-ode.org/ontologies/pizza/pizza.owl#>",
      );
    prefixes[p.text.slice(0, -1)] = u.text.slice(1, -1);
  }
  need(
    "SELECT",
    "Only SELECT queries are supported.",
    "Start with SELECT, or choose a worked example.",
  );
  const distinct = eat("DISTINCT");
  let columns: string[] = [];
  while (peek()?.kind === "variable" || is("*")) columns.push(take().text);
  if (!columns.length)
    throw new QueryError(
      "SELECT needs at least one variable.",
      "For example: SELECT ?pizza ?topping",
    );
  need(
    "WHERE",
    "Expected WHERE after the projection.",
    "Use SELECT ?x WHERE { ... }",
  );
  need("{");
  const patterns: Pattern[] = [],
    filters: ParsedQuery["filters"] = [];
  while (peek() && !is("}")) {
    if (eat(".")) continue;
    if (eat("FILTER")) {
      need("(");
      const left = term(),
        op = take();
      if (op.kind !== "operator")
        throw new QueryError(
          "FILTER needs a comparison operator.",
          "Supported: = != < <= > >=",
        );
      const right = term();
      need(")");
      filters.push({ left, operator: op.text, right });
      eat(".");
    } else {
      if (["OPTIONAL", "UNION", "BIND", "GRAPH"].some(is))
        throw new QueryError(
          take().text.toUpperCase() + " is not supported.",
          "Use a flat basic graph pattern with FILTER and LIMIT.",
        );
      patterns.push({
        subject: term(),
        predicate: term(),
        object: term(),
      });
      eat(".");
    }
  }
  need("}");
  if (!patterns.length)
    throw new QueryError(
      "The WHERE block has no triple patterns.",
      "Add a pattern, for example ?pizza a pizza:NamedPizza .",
    );
  const variables = [
    ...new Set(
      patterns
        .flatMap((p) => [p.subject, p.predicate, p.object])
        .map((t) => t.variable)
        .filter((v): v is string => !!v),
    ),
  ];
  if (columns.includes("*")) {
    if (columns.length !== 1)
      throw new QueryError("SELECT * cannot be combined with named variables.");
    columns = variables;
  }
  for (const c of columns)
    if (!variables.includes(c))
      throw new QueryError(
        "Variable " + c + " is selected but never bound in the WHERE block.",
        "Bind it in a pattern or remove it from SELECT.",
      );
  let order: string | undefined,
    descending = false,
    limit: number | undefined;
  if (eat("ORDER")) {
    eat("BY");
    const wrapped = is("ASC") || is("DESC");
    if (wrapped) {
      descending = eat("DESC");
      if (!descending) eat("ASC");
      need("(");
    }
    const t = take();
    if (t.kind !== "variable")
      throw new QueryError(
        "ORDER BY needs a variable.",
        "Use ORDER BY DESC(?price).",
      );
    order = t.text;
    if (wrapped) need(")");
  }
  if (eat("LIMIT")) {
    const t = take();
    if (
      t.kind !== "number" ||
      Number(t.text) < 0 ||
      Number(t.text) > 2147483647
    )
      throw new QueryError("LIMIT needs a number.", "For example: LIMIT 100");
    limit = Math.trunc(Number(t.text));
  }
  if (peek())
    throw new QueryError(
      "Unexpected token " + peek().text + " after the query.",
      "Only one ORDER BY key and a non-negative LIMIT are supported.",
    );
  return { columns, patterns, filters, distinct, order, descending, limit };
}
export async function executeQuery(
  store: Store,
  text: string,
  signal?: AbortSignal,
  cap = 200000,
): Promise<QueryResult> {
  const start = performance.now(),
    query = parseQuery(text),
    storeVersion = store.version;
  type Row = Record<string, Term>;
  let solutions: Row[] = [{}],
    capped = false,
    operations = 0;
  const bind = (r: Row, t: QueryTerm) =>
    t.variable ? r[t.variable] : t.constant;
  const checkpoint = () => {
    if (signal?.aborted)
      throw new QueryError(
        "Query cancelled.",
        "Run the query again when ready.",
      );
  };
  for (const p of query.patterns) {
    const next: Row[] = [];
    let full = false;
    for (const row of solutions) {
      checkpoint();
      const s = bind(row, p.subject),
        pr = bind(row, p.predicate),
        o = bind(row, p.object);
      if (s?.literal || pr?.literal) continue;
      for (const t of store.scan(s?.value, pr?.value, o)) {
        if (++operations % 4096 === 0) {
          await new Promise<void>((r) => setTimeout(r, 0));
          checkpoint();
        }
        const c = { ...row };
        const unify = (term: QueryTerm, value: Term) => {
          if (!term.variable) return equivalent(term.constant!, value);
          if (c[term.variable]) return equivalent(c[term.variable], value);
          c[term.variable] = value;
          return true;
        };
        if (
          !unify(p.subject, iriTerm(t.subject)) ||
          !unify(p.predicate, iriTerm(t.predicate)) ||
          !unify(p.object, t.object)
        )
          continue;
        if (next.length >= cap) {
          capped = true;
          full = true;
          break;
        }
        next.push(c);
      }
      if (full) break;
    }
    solutions = next;
    if (!solutions.length) break;
  }
  checkpoint();
  const valueCompare = (a: Term, b: Term) =>
    a.value.trim() !== "" &&
    b.value.trim() !== "" &&
    Number.isFinite(+a.value) &&
    Number.isFinite(+b.value)
      ? compare(+a.value, +b.value)
      : compare(a.value, b.value);
  let rows = solutions
    .filter((row) =>
      query.filters.every((f) => {
        const a = bind(row, f.left),
          b = bind(row, f.right);
        if (!a || !b) return false;
        const c = valueCompare(a, b);
        return {
          "=": c === 0,
          "!=": c !== 0,
          "<": c < 0,
          "<=": c <= 0,
          ">": c > 0,
          ">=": c >= 0,
        }[f.operator];
      }),
    )
    .map((r) => query.columns.map((c) => r[c]));
  solutions = [];
  if (query.distinct) {
    const seen = new Set<string>();
    rows = rows.filter((r) => {
      const k = JSON.stringify(
        r.map((t) => [
          t.literal,
          t.value,
          t.literal ? termDatatype(t) : "",
          (t.language ?? "").toLowerCase(),
        ]),
      );
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }
  if (query.order) {
    const index = query.columns.indexOf(query.order);
    if (index >= 0)
      rows.sort(
        (a, b) =>
          valueCompare(a[index], b[index]) * (query.descending ? -1 : 1),
      );
  }
  const total = rows.length;
  if (query.limit !== undefined) rows = rows.slice(0, query.limit);
  const iris = [
    ...new Set(
      rows.flatMap((r) => r.filter((t) => !t.literal).map((t) => t.value)),
    ),
  ];
  return {
    columns: query.columns,
    rows,
    total,
    capped,
    iris,
    milliseconds: Math.max(1, Math.round(performance.now() - start)),
    storeVersion,
  };
}
