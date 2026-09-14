# Axiom — SPARQL Console

**Purpose:** This document specifies the SPARQL console Surface in full — the accepted query language, its tokeniser, parser, evaluator, triple source, caps, error copy, editor behaviour, result presentation and its divergences from SPARQL 1.1 — to the level of detail required to reimplement it from this document alone.

**Status:** Normative

**Requirement ID prefixes owned:** `SPQ`

---

## Purpose and honest scope

Read this section before any other. Everything that follows is bounded by it.

### What the console is

The SPARQL console is a **real evaluator over basic graph patterns**. It tokenises and parses a query text into a query object, joins the triple patterns of that query against the **Store** in written order, applies `FILTER` comparisons, `DISTINCT`, `ORDER BY` and `LIMIT`, and renders the resulting solution table. It is not a mock-up, not a canned-result demo, and not a string matcher: a query the user types is genuinely executed against the same in-memory **Store** that the graph, the tree and the individuals table read `[src: evaluate()]` `[src: scan()]`.

Its distinguishing property is that **generated Individuals are never materialised as triples**. The pattern matcher reads them out of the compact record array and its indexes at match time and synthesises triple arrays on demand, which is why a Store describing 100,000 generated Individuals — 725,239 conceptual triples — answers a well-ordered query in the same order of magnitude as one describing 1,000 `[src: scan()]` `[src: DEMO_PRED]`. See [Data model and store](11-data-model-and-store.md#the-store-object) for the record layout and the indexes this depends on.

### What the console is not

It is **not a SPARQL 1.1 implementation**, and MUST NOT be presented to a user as one. Specifically, and without hedging:

- It supports exactly one query form, `SELECT`. There is no `CONSTRUCT`, `ASK` or `DESCRIBE` `[src: parseQuery()]`.
- It supports exactly one group-graph-pattern shape: a flat, conjunctive list of triple patterns plus `FILTER` lines inside a single `WHERE { … }` block. There is no `OPTIONAL`, no `UNION`, no nested group, no sub-select, no `GRAPH`, no `MINUS`, no `BIND`, no `VALUES` `[src: parseQuery()]`.
- `FILTER` accepts exactly one comparison between exactly two terms. There is no boolean algebra, no function library, no regex, no arithmetic, no `BOUND`, no `IN` `[src: parseQuery()]`.
- There are no aggregates and no `GROUP BY`; counting is left to the user, and the built-in example set says so in its own copy `[src: EXAMPLES]`.
- There are no property paths, no blank nodes, no `rdf:List` handling and no entailment of any kind. Nothing is inferred; only what is asserted — including the flattened restriction triples described below — can match.
- Literal datatypes are carried but are **not** used for comparison; equality is lexical `[src: termEq()]`.

### The honesty obligation

**SPQ-1** The console MUST describe its own capability in the Surface itself rather than leaving the user to discover the boundary by failure. The reference build carries the label `Basic graph patterns · FILTER · LIMIT` in the console toolbar `[src: .sparql__bar]`.

**SPQ-2** Every error the console raises MUST name both the cause and the remedy, in that order (see [Error taxonomy](#error-taxonomy)). An error that states only that something is wrong is a defect.

**SPQ-3** Every result the console reports MUST state the figures that let the user judge whether the result is complete: the returned row count, the pre-`LIMIT` total when a `LIMIT` reduced it, the elapsed time, the size of the Store the query ran against, and any truncation that occurred (see [Results presentation](#results-presentation)).

**SPQ-4** The console MUST NOT silently return a partial answer. Where the evaluator caps intermediate results, that cap MUST be reported in the same status line as the row count `[src: runQuery()]` `[src: SOLUTION_CAP]`.

---

## The accepted grammar in EBNF

### Notation

The grammar below is EBNF: `::=` defines a production, `|` alternation, `?` zero or one, `*` zero or more, `+` one or more, `( )` grouping, `'x'` a literal terminal, and `UPPERCASE` a terminal produced by the tokeniser (see [Tokenisation](#tokenisation)). Keyword terminals are matched **case-insensitively** `[src: parseQuery()]`; all other terminals are case-sensitive.

Every production carrying the marker **[D]** diverges from the SPARQL 1.1 grammar. The divergence is explained in the note that follows the grammar and, where it removes a feature, in [Divergences from SPARQL 1.1](#divergences-from-sparql-11).

### The grammar

```ebnf
Query            ::= PrefixDecl* SelectClause WhereClause SolutionModifier   /* [D] no BASE, no query form but SELECT */

PrefixDecl       ::= 'PREFIX' PNAME_NS IRIREF                                /* [D] see SPQ-9 and the defect note */

SelectClause     ::= 'SELECT' 'DISTINCT'? Projection                         /* [D] no REDUCED, no expressions, no AS */
Projection       ::= '*' | ( VAR | '*' )+                                    /* [D] '*' and variables may be mixed */

WhereClause      ::= 'WHERE' '{' GroupItem* '}'                              /* [D] WHERE is mandatory, not optional */
GroupItem        ::= TriplePattern | Filter
TriplePattern    ::= Term Term Term '.'?                                     /* [D] '.' optional; no ';' or ',' lists */
Filter           ::= 'FILTER' '(' Term CompOp Term ')' '.'?                  /* [D] exactly one comparison, no exprs */
CompOp           ::= '=' | '!=' | '<' | '<=' | '>' | '>='

SolutionModifier ::= OrderClause? LimitClause?                               /* [D] no GROUP BY, HAVING, OFFSET */
OrderClause      ::= 'ORDER' 'BY'? OrderTarget                               /* [D] 'BY' optional; one key only */
OrderTarget      ::= 'ASC' '(' VAR ')'? | 'DESC' '(' VAR ')'? | VAR          /* [D] closing ')' optional */
LimitClause      ::= 'LIMIT' NUMBER                                          /* [D] any NUMBER token, incl. negative */

Term             ::= VAR | IRIREF | PNAME | STRING | NUMBER | 'a'            /* [D] no blank nodes, no lang tags,
                                                                                    no ^^datatype suffix, no true/false */

/* ---- terminals, produced by the tokeniser ---- */
COMMENT          ::= '#' ( ~'\n' )*                                          /* discarded */
STRING           ::= '"' ( ~['"' '\'] | '\' ANY )* '"'
VAR              ::= '?' [A-Za-z_] [A-Za-z0-9_]*
IRIREF           ::= '<' ( ~'>' )* '>'
PNAME            ::= [A-Za-z_] [A-Za-z0-9_-]* ':' [A-Za-z_] [A-Za-z0-9_-]*
PNAME_NS         ::= [A-Za-z_] [A-Za-z0-9_-]* ':'                            /* [D] see the defect note */
NUMBER           ::= '-'? [0-9]+ ( '.' [0-9]* )?
PUNCT            ::= '{' | '}' | '(' | ')' | '.' | ';' | ',' | '*'
WORD             ::= [A-Za-z_] [A-Za-z0-9_]*
OP               ::= '<=' | '>=' | '!=' | '=' | '<' | '>'
SYM              ::= any single non-space character matched by none of the above
```

### Notes on each divergence

**SPQ-5** Keyword recognition MUST be case-insensitive: a candidate token MUST be classified as a keyword when its upper-cased text equals the keyword `[src: parseQuery()]`. `select ?s where { … }` is therefore accepted exactly as `SELECT ?s WHERE { … }`.

**SPQ-6** The `a` terminal MUST be matched case-**sensitively** and only in lower case. `A` in a predicate position is not a valid term and MUST raise the invalid-term error `[src: parseQuery()]`. (This matches SPARQL 1.1, whose `a` is likewise lower-case only; it is listed here because `A` appears in the editor's keyword highlight set `[src: KEYWORDS]` and users therefore see it coloured as though it were valid.)

**SPQ-7** The `.` separator between triple patterns MUST be optional. The parser consumes a `.` if the next token is one, and otherwise continues reading terms `[src: parseQuery()]`. Consequently `{ ?s a pizza:Pizza ?s pizza:hasTopping ?t }` parses as two patterns. This is a deliberate leniency; an implementation MUST NOT reject a query solely for a missing `.`.

**SPQ-8** Predicate-object lists (`;`) and object lists (`,`) MUST NOT be accepted. The tokeniser emits `;` and `,` as punctuation, and the term reader rejects them with the invalid-term error `[src: parseQuery()]`.

**SPQ-9** A `PREFIX` declaration MUST bind the declared prefix label, **including its trailing colon**, to the IRI given in angle brackets, and that binding MUST override any built-in binding of the same label for the remainder of the query. **Status:** specified, not implemented in the reference build. The reference build rejects every `PREFIX` declaration; see [Defects in the reference build](#defects-in-the-reference-build-verified), defect D1, for the verified evidence and for the workaround the built-in prefix table provides.

**SPQ-10** `WHERE` MUST be present. SPARQL 1.1 permits the keyword to be omitted before the group graph pattern; this grammar does not, and its absence raises a dedicated error `[src: parseQuery()]`.

**SPQ-11** The projection MUST be read as a run of `VAR` and `*` tokens, terminated by the first token that is neither. If the **first** collected token is `*`, the projection MUST be the set of all variables occurring in the triple patterns, in order of first occurrence; otherwise the projection MUST be the collected list verbatim `[src: parseQuery()]`. A `*` appearing in any position other than the first therefore becomes a projected "variable" named `*`, which is never bound, and the query MUST then fail the projection-binding check (SPQ-43).

**SPQ-12** `ORDER` MUST accept an optional `BY`; `ORDER ?price` and `ORDER BY ?price` MUST be equivalent `[src: parseQuery()]`.

**SPQ-13** `ASC` and `DESC` MUST be followed by `(`; the closing `)` MUST be optional `[src: parseQuery()]`. A bare `ORDER BY ?v` without a direction keyword MUST mean ascending.

**SPQ-14** Exactly one sort key MUST be supported. A second key is not parsed: the token after the key terminates the clause, and any remaining content that is not `LIMIT` is silently ignored (SPQ-40).

**SPQ-15** `LIMIT` MUST take a single `NUMBER` token and MUST convert it with a base-10 integer parse `[src: parseQuery()]`. Non-integral and negative inputs are accepted by the parser; see SPQ-95 for the required handling and defect D5 for the reference build's behaviour.

**SPQ-16** There is no `OFFSET`, no `GROUP BY`, no `HAVING` and no `REDUCED`. A query containing them fails at the point the unexpected token is read, typically as an invalid-term or brace error.

---

## Terms and their resolution

A **term** is the unit occupying a subject, predicate or object slot of a triple pattern, or either side of a `FILTER` comparison. The parser converts one token into one of exactly two internal shapes `[src: parseQuery()]`:

| Internal shape | Meaning |
|---|---|
| `{ v: "?name" }` | A **variable** reference. Matches anything; binds on match. |
| `{ c: value }` | A **constant**. `value` is either an absolute IRI string, or a literal object `{ lit, dt }`. |

**SPQ-17** The parser MUST resolve each token class to a term as follows, and MUST raise the invalid-term error for any token class not in this table `[src: parseQuery()]`:

| Token class | Example source text | Resolution | Resulting term |
|---|---|---|---|
| `VAR` | `?pizza` | Used verbatim, including the leading `?`; the `?` is part of the variable's name everywhere in the engine | `{ v: "?pizza" }` |
| `IRIREF` | `<http://example.org/pizzeria#Pizza_000001>` | Angle brackets stripped; the remainder is taken as an **absolute** IRI with no resolution against any base | `{ c: "http://example.org/pizzeria#Pizza_000001" }` |
| `PNAME` | `pizza:Margherita` | Split at the **first** `:`; the prefix label *including* the colon is looked up in the prefix table; the local part is appended to the bound IRI by string concatenation | `{ c: "http://www.co-ode.org/ontologies/pizza/pizza.owl#Margherita" }` |
| `STRING` | `"Shoreditch"` | Surrounding quotes stripped, then every `\x` pair replaced by `x`; wrapped as a literal with datatype `string` | `{ c: { lit: "Shoreditch", dt: "string" } }` |
| `NUMBER` | `13`, `-4.5` | Converted to a JavaScript-equivalent double-precision number; wrapped as a literal with datatype `decimal` | `{ c: { lit: 13, dt: "decimal" } }` |
| `WORD` equal to `a` | `a` | Synonym for `rdf:type` | `{ c: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type" }` `[src: RDF_TYPE]` |
| anything else | `;`, `!`, `A`, `}` | Rejected | invalid-term error |

### Variables

**SPQ-18** A variable's identity MUST be its full token text including the `?`. Two occurrences of the same text in one query denote the same variable and MUST join.

**SPQ-19** A variable name MUST begin with a letter or underscore after the `?`. `?1` does not tokenise as a variable; the `?` is emitted as a `SYM` token and the invalid-term error follows `[src: tokenize()]`.

**SPQ-20** `$`-sigil variables (legal in SPARQL 1.1) MUST NOT be accepted; there is no production for them.

### Prefixed names

**SPQ-21** The prefix table MUST be seeded, before any query text is read, with the following six built-in bindings, and a query MUST be able to use them without declaring anything `[src: PFX]` `[src: NS]`:

| Label | IRI |
|---|---|
| `pizza:` | `http://www.co-ode.org/ontologies/pizza/pizza.owl#` |
| `demo:` | `http://example.org/pizzeria#` |
| `rdf:` | `http://www.w3.org/1999/02/22-rdf-syntax-ns#` |
| `rdfs:` | `http://www.w3.org/2000/01/rdf-schema#` |
| `owl:` | `http://www.w3.org/2002/07/owl#` |
| `xsd:` | `http://www.w3.org/2001/XMLSchema#` |

`pizza:` is the real Pizza ontology namespace; `demo:` is the generated dataset's namespace. They are separate vocabularies and MUST never be conflated in copy, examples or documentation — see [the fixture](62-pizza-ontology-fixture.md).

**SPQ-22** A prefixed name whose label is not in the table MUST raise the unknown-prefix error, and that error MUST list the labels that *are* available `[src: parseQuery()]`.

**SPQ-23** The local part MUST be appended to the namespace IRI by plain string concatenation, with no percent-decoding and no escape processing.

**SPQ-24** An empty prefix label (`:Pizza`) and an empty local part (`pizza:`) MUST NOT tokenise as a prefixed name, because the `PNAME` terminal requires a letter or underscore on both sides of the colon `[src: tokenize()]`. Both are legal in SPARQL 1.1; both are divergences.

### IRIs

**SPQ-25** An `IRIREF` MUST be taken as absolute. There is no `BASE` and no relative-IRI resolution.

**SPQ-26** The `IRIREF` terminal MUST NOT be assumed to be well formed: the tokeniser matches `<` followed by any run of non-`>` characters followed by `>`, including whitespace and newlines `[src: tokenize()]`. This over-greedy definition is the cause of defect D2.

### String literals

**SPQ-27** A string literal MUST be delimited by double quotes. Single-quoted, triple-quoted and long literals MUST NOT be accepted.

**SPQ-28** Escape handling MUST be as implemented: the backslash is removed and the following character is kept verbatim `[src: parseQuery()]`. `"So\"ho"` yields the four-plus-two-character value `So"ho`, and `"a\nb"` yields the five-character value `anb` — **not** a newline. This is a divergence: SPARQL 1.1 defines `\n`, `\t`, `\r`, `\b`, `\f`, `\"`, `\'`, `\\` and `\uXXXX`. An implementation MUST reproduce the reference behaviour for `\"` and `\\`; it SHOULD additionally implement the SPARQL escape set, in which case it MUST document the difference, because a query that relied on `\n` meaning a literal `n` would change meaning.

**SPQ-29** Language tags (`"x"@en`) and datatype suffixes (`"1"^^xsd:integer`) MUST NOT be accepted. The `@` and `^` characters tokenise as `SYM` and raise the invalid-term error on the *next* read, since the literal itself has already been consumed as a complete term.

**SPQ-30** A string literal MUST be constructed with datatype `string` `[src: lit()]`.

### Numeric literals

**SPQ-31** A numeric literal MUST be constructed with datatype `decimal` regardless of whether the text contained a decimal point `[src: parseQuery()]`. `5` becomes `{ lit: 5, dt: "decimal" }`, and it still matches the generated `demo:rating` value `{ lit: 5, dt: "integer" }`, because term equality ignores datatype (SPQ-65).

**SPQ-32** The `NUMBER` terminal MUST accept a leading `-`. Exponent notation (`1e6`) MUST NOT be accepted: `1e6` tokenises as the number `1` followed by the word `e6`.

### The `a` keyword

**SPQ-33** `a` MUST resolve to the IRI `http://www.w3.org/1999/02/22-rdf-syntax-ns#type` in any of the three triple positions, not only the predicate position `[src: parseQuery()]` `[src: RDF_TYPE]`. Writing `a` as a subject is accepted by the parser and simply matches nothing.

---

## Tokenisation

`[src: tokenize()]`

### The token regular expression

**SPQ-34** The tokeniser MUST scan the query text left to right, at each position attempting the following alternatives **in this exact order** and taking the first that matches. The order is load-bearing: reordering it changes the language.

| # | Alternative (pattern) | Token class emitted | Notes |
|---|---|---|---|
| 1 | `#[^\n]*` | *(discarded)* | Comment to end of line |
| 2 | `"(?:[^"\\]|\\.)*"` | `str` | Double-quoted, backslash escapes consumed but not decoded |
| 3 | `\?[A-Za-z_][\w]*` | `var` | `\w` is `[A-Za-z0-9_]`; hyphens not permitted |
| 4 | `<[^>]*>` | `iri` | **Over-greedy**; see SPQ-36 |
| 5 | `[A-Za-z_][\w-]*:[A-Za-z_][\w-]*` | `pname` | Hyphens permitted in both parts after the first character |
| 6 | `-?\d+\.?\d*` | `num` | Optional sign, optional fractional part |
| 7 | `[{}().;,*]` | `punct` | The complete punctuation set |
| 8 | `[A-Za-z_][\w]*` | `word` | Keywords, `a`, and bare prefix labels |
| 9 | `<=\|>=\|!=\|=\|<\|>` | `op` | Comparison operators |
| 10 | `\S` | `sym` | Any single remaining non-space character |

**SPQ-35** Whitespace MUST be skipped: it matches no alternative and the scan advances past it. Newlines are whitespace and carry no syntactic weight except that they terminate a comment.

**SPQ-36** Alternative 4 precedes alternative 9, so at any `<` the tokeniser first attempts to read an IRI. Because `[^>]*` also matches newlines, a `<` comparison operator followed anywhere later in the text by a `>` is swallowed into a bogus `iri` token. This is verified reference behaviour and the cause of defect D2. A conformant implementation MUST NOT reproduce it: the `IRIREF` terminal MUST additionally exclude whitespace and the `<` character from its body, which makes `FILTER (?a < 1) FILTER (?b > 2)` tokenise correctly. **Status:** specified, not implemented in the reference build.

**SPQ-37** A bare prefix label followed by whitespace (`pizza:` in a `PREFIX` line) MUST tokenise as a single `PNAME_NS` token. **Status:** specified, not implemented in the reference build — the reference tokeniser has no `PNAME_NS` alternative, so `pizza:` becomes the two tokens `word("pizza")` and `sym(":")`, which is the direct cause of defect D1 `[src: tokenize()]`.

### Token record shape

**SPQ-38** Each token MUST be recorded as a triple of *(class, text, position)*, where position is the zero-based character offset of the token's first character in the original query text `[src: tokenize()]`. The reference build records the offset but does not yet use it in error reporting; see SPQ-116.

**SPQ-39** The token class set MUST be exactly: `str`, `var`, `iri`, `pname`, `num`, `punct`, `word`, `op`, `sym`. Comments produce no token.

### Worked tokenisation

For the input

```sparql
SELECT ?pizza WHERE {
  ?pizza a pizza:NamedPizza .
}
LIMIT 200
```

the token stream is, verbatim and in order:

| # | Class | Text | Offset |
|---|---|---|---|
| 1 | `word` | `SELECT` | 0 |
| 2 | `var` | `?pizza` | 7 |
| 3 | `word` | `WHERE` | 14 |
| 4 | `punct` | `{` | 20 |
| 5 | `var` | `?pizza` | 24 |
| 6 | `word` | `a` | 31 |
| 7 | `pname` | `pizza:NamedPizza` | 33 |
| 8 | `punct` | `.` | 50 |
| 9 | `punct` | `}` | 52 |
| 10 | `word` | `LIMIT` | 54 |
| 11 | `num` | `200` | 60 |

---

## Parsing

`[src: parseQuery()]`

### Parser state

**SPQ-40** The parser MUST be a single-pass recursive-descent reader over the token array with exactly this state: the token array, a read cursor, and a prefix table initialised as a copy of the built-in table `[src: PFX]`. The copy MUST be per-query: a `PREFIX` declaration MUST NOT mutate the built-in table or leak into the next query.

The three primitive operations are:

- `peek()` — the token at the cursor, or nothing at end of input.
- `next()` — the token at the cursor; advances the cursor.
- `isWord(W)` — true when `peek()` exists, is of class `word`, and its upper-cased text equals `W`.
- `expect(v)` — `next()`, and raise the expected-token error unless the token's text is exactly `v`.

### Numbered pseudocode

**SPQ-41** The parse MUST proceed in exactly this order. Step numbers are referenced by the error table.

```
 1  toks   := tokenize(text)
 2  i      := 0
 3  prefixes := copy of PFX

 4  while isWord('PREFIX'):
 5      next()                                   -- consume PREFIX
 6      label := next()                          -- expected: PNAME_NS
 7      iriTok := next()                         -- expected: iri
 8      if label is missing or iriTok is missing or iriTok.class <> 'iri':
 9          raise QueryError('Malformed PREFIX declaration.',
 9a                          'Write it as: PREFIX pizza: <' + NS.pizza + '>')
10      prefixes[label.text] := iriTok.text without its first and last character

11  if not isWord('SELECT'):
12      raise QueryError('Only SELECT queries are supported.',
12a                     'Start the query with SELECT, or pick an example from the right.')
13  next()                                       -- consume SELECT

14  distinct := false
15  if isWord('DISTINCT'): next(); distinct := true

16  vars := []
17  while peek() exists and (peek().class = 'var' or peek().text = '*'):
18      t := next()
19      append (t.text = '*' ? '*' : t.text) to vars
20  if vars is empty:
21      raise QueryError('SELECT needs at least one variable.',
21a                     'For example: SELECT ?pizza ?topping')

22  if not isWord('WHERE'):
23      raise QueryError('Expected WHERE after the projection.',
23a                     'The shape is: SELECT ?x WHERE { ... }')
24  next()                                       -- consume WHERE
25  expect('{')

26  patterns := []; filters := []
27  while peek() exists and peek().text <> '}':
28      if isWord('FILTER'):
29          next()
30          expect('(')
31          lhs := term(next())
32          opTok := next()
33          if opTok is missing or opTok.class <> 'op':
34              raise QueryError('FILTER needs a comparison operator.',
34a                             'Supported: = != < <= > >=')
35          rhs := term(next())
36          expect(')')
37          append { lhs, op: opTok.text, rhs } to filters
38          if peek() exists and peek().text = '.': next()
39          continue
40      s := term(next()); p := term(next()); o := term(next())
41      append [s, p, o] to patterns
42      if peek() exists and peek().text = '.': next()
43  expect('}')

44  order := nothing; limit := nothing
45  if isWord('ORDER'):
46      next()
47      if isWord('BY'): next()
48      dir := +1
49      if isWord('DESC'):      next(); dir := -1; expect('(')
50      else if isWord('ASC'):  next();           expect('(')
51      v := next()
52      if v is missing or v.class <> 'var':
53          raise QueryError('ORDER BY needs a variable.',
53a                         'For example: ORDER BY DESC(?price)')
54      if peek() exists and peek().text = ')': next()
55      order := { v: v.text, dir }

56  if isWord('LIMIT'):
57      next()
58      n := next()
59      if n is missing or n.class <> 'num':
60          raise QueryError('LIMIT needs a number.', 'For example: LIMIT 100')
61      limit := integer parse of n.text, base 10

62  if patterns is empty:
63      raise QueryError('The WHERE block has no triple patterns.',
63a                     'Add at least one, for example: ?pizza a pizza:NamedPizza .')

64  allVars := ordered set of every term with a `v` field across every pattern,
65             visited subject, predicate, object, pattern by pattern, in written order
66  projection := (vars[0] = '*') ? list(allVars) : vars
67  for each v in projection:
68      if v not in allVars:
69          raise QueryError('Variable ' + v + ' is selected but never bound in the WHERE block.',
69a                         'Either bind it in a pattern, or remove it from SELECT.')

70  return { prefixes, projection, distinct, patterns, filters, order, limit }
```

and the term reader invoked at steps 31, 35, 40:

```
term(t):
 1  if t is missing:
 2      raise QueryError('The pattern ends too early.',
 2a                     'Every triple pattern needs a subject, a predicate and an object.')
 3  if t.class = 'var'   : return { v: t.text }
 4  if t.class = 'iri'   : return { c: t.text without first and last character }
 5  if t.class = 'str'   : return { c: literal(unescape(t.text without quotes), 'string') }
 6  if t.class = 'num'   : return { c: literal(number(t.text), 'decimal') }
 7  if t.class = 'pname' :
 8      label := t.text up to and including the first ':'
 9      local := t.text after the first ':'
10      if label not in prefixes:
11          raise QueryError('Unknown prefix “' + label + '”.',
11a                         'Declare it with PREFIX, or use one of: ' + join(keys(prefixes), ' '))
12      return { c: prefixes[label] + local }
13  if t.class = 'word' and t.text = 'a': return { c: RDF_TYPE }
14  raise QueryError('“' + t.text + '” is not a valid term.',
14a                 'Terms are variables (?x), prefixed names (pizza:Pizza), IRIs (<…>) or literals ("…").')
```

### Consequences of the parse order that MUST be preserved

**SPQ-42** Steps 44–61 run **after** the closing brace is consumed. Content between `}` and `ORDER`/`LIMIT` that is neither is silently ignored, as is any content after the `LIMIT` number. An implementation MAY instead raise a trailing-content error; if it does, the error MUST follow SPQ-2 and name the offending token.

**SPQ-43** The projection-binding check (steps 64–69) MUST consider only variables occurring in **triple patterns**. Variables occurring solely inside a `FILTER` MUST NOT be added to the bound set, and therefore MUST NOT satisfy the check for a projected variable — but they also MUST NOT be rejected when they appear only in the filter, where they evaluate as unbound (SPQ-87).

**SPQ-44** `*` expansion MUST use first-occurrence order over the patterns, scanning subject, then predicate, then object, pattern by pattern. For `SELECT * WHERE { ?b ?a ?c }` the projection is `?b, ?a, ?c` — verified.

**SPQ-45** The query object returned by the parser MUST have exactly these seven fields:

| Field | Type | Meaning |
|---|---|---|
| `prefixes` | map of label → IRI | The built-in table plus any declarations; retained for diagnostics, not used after parsing |
| `projection` | ordered list of variable names | Result column order; never empty |
| `distinct` | boolean | Whether `DISTINCT` was given |
| `patterns` | ordered list of `[s, p, o]` term triples | Join order is written order |
| `filters` | ordered list of `{ lhs, op, rhs }` | Applied after all joins |
| `order` | `{ v, dir }` or nothing | `dir` is `+1` for ascending, `-1` for descending |
| `limit` | integer or nothing | Row cap applied last |

**SPQ-46** The parser MUST be total with respect to its error set: every failure MUST be one of the errors in [Error taxonomy](#error-taxonomy), carrying both a message and a hint. An implementation-level exception that escapes the parser MUST be caught at the call site and presented with the fallback hint `Check the query syntax against one of the examples.` `[src: runQuery()]`.

---

## The triple source

`[src: scan()]`

This is where the design earns its scalability, and it is the part an implementer is most likely to get wrong. `scan(s, p, o)` is a **generator**: it takes a subject, predicate and object that are each either a bound value (an IRI string or a literal object) or *unbound*, and yields matching triples one at a time. It is the **only** way the evaluator touches the Store.

### The governing requirement

**SPQ-47** Generated Individuals MUST NOT be materialised as triples at any point — not at Store build time, not at query start, not per pattern, and not as a cache. Each matching triple MUST be synthesised at the moment it is yielded, from the compact record and the constant predicate IRI `[src: scan()]` `[src: DEMO_PRED]`. Materialising 725,239 triple objects for a 100,000-Individual Store is the design failure this Surface exists to avoid; see [Data model and store](11-data-model-and-store.md#the-store-object).

**SPQ-48** `scan` MUST yield triples lazily, so that a `LIMIT`-bounded or early-terminating consumer does not pay for the whole source. It MUST NOT build an intermediate array of all matches.

**SPQ-49** Triples yielded from the static arrays are the **stored** arrays themselves, not copies `[src: scan()]`. A consumer MUST treat every yielded triple as immutable.

### The five sources, in yield order

**SPQ-50** `scan` MUST consult its sources in exactly this order, and the yield order MUST be stable for a given Store state because it determines the order of unsorted result rows:

1. **TBox triples** — `store.tbox`, scanned linearly.
2. **Flattened restriction triples** — `store.rbox`, scanned linearly.
3. **`rdf:type` triples over generated Individuals** — dispatched by which positions are bound.
4. **Demo predicate triples over generated Individuals** — dispatched by predicate and subject.
5. **Customer label triples** — dispatched by subject.

### Source 1 and 2 — the static triples

**SPQ-51** For each triple in `store.tbox` and then each triple in `store.rbox`, the scanner MUST skip it unless: the subject is unbound or identical to the triple's subject; the predicate is unbound or identical to the triple's predicate; and the object is unbound or **term-equal** to the triple's object (SPQ-64). Subject and predicate use identity; only the object uses term equality, because only the object can be a literal `[src: scan()]`.

**SPQ-52** `store.rbox` MUST be built from the entity restriction and equivalence axioms before any query runs, and MUST be rebuilt whenever an axiom changes `[src: buildRBox()]`. The reference build builds it during boot and rebuilds it after a class deletion `[src: init()]` `[src: deleteSelected()]`.

**SPQ-53** `buildRBox()` MUST emit one triple *(entity, restriction property, filler)* for every restriction and every equivalent-class expression of every entity where the expression is a restriction, has a property, and has quantifier `some` or `value`; all fillers of a multi-filler expression are emitted `[src: buildRBox()]` `[src: restrictionTargets()]`. Restrictions with quantifier `only`, `min`, `max` or `exactly` MUST NOT be emitted, because they do not assert the relationship the triple would imply.

On the fixture, these two arrays measure: `store.tbox` = **239** triples, `store.rbox` = **140** triples, over 114 entities. Both are independent of the generated dataset size.

**Complexity:** O(|TBox| + |RBox|) per call, unconditionally, regardless of how tightly the pattern is bound. This is the dominant per-call constant of the evaluator, and it is the reason SPQ-97 requires static indexes.

### Source 3 — `rdf:type` over generated Individuals

**SPQ-54** When the predicate is unbound or identical to `rdf:type`, the scanner MUST dispatch on the bound positions as follows `[src: scan()]`:

| Case | Dispatch | Yields | Complexity |
|---|---|---|---|
| Subject **bound** | `store.indIndex.get(s)` (hash lookup), then a **linear search** of `store.customers` for a matching IRI | *(s, `rdf:type`, record type)* when the record exists and the object is unbound or identical to that type; and *(s, `rdf:type`, `demo:Customer`)* when the IRI is a customer and the object is unbound or identical to `demo:Customer` | O(1) + **O(C)** where C is the customer count — see defect D3 |
| Subject unbound, object **bound** | `store.byType.get(o)` — the by-type index — plus two special cases | every *(record IRI, `rdf:type`, o)* in the bucket; and, when the object is `demo:Customer`, every customer; and, when the object is `demo:Order`, every generated Individual | O(\|bucket\|) |
| Both unbound | full iteration | *(record IRI, `rdf:type`, record type)* for every generated Individual, then *(customer IRI, `rdf:type`, `demo:Customer`)* for every customer | O(N + C) |

**SPQ-55** The asymmetry in the table above is a defect an implementation MUST NOT reproduce: with the object bound to `demo:Order` every generated Individual matches, but with the subject bound to a generated Individual the `demo:Order` type triple is **not** yielded `[src: scan()]`. `SELECT ?t WHERE { <…#Pizza_000001> a ?t }` returns only the pizza class (verified: one row, `pizza:FruttiDiMare`). A conformant implementation MUST yield both the pizza class type and `demo:Order` in every direction. **Status:** specified, not implemented in the reference build.

### Source 4 — the demo predicate accessors

**SPQ-56** The scanner MUST recognise exactly six generated predicates. Each is a function from a compact Individual record to a term `[src: DEMO_PRED]`:

| Predicate IRI | Source field | Term produced | Datatype | Example value |
|---|---|---|---|---|
| `demo:orderRef` | `rec.ref` | literal | `string` | `"AX-100000"` |
| `demo:branch` | `rec.branch` | literal | `string` | `"Shoreditch"` — one of the six branch names |
| `demo:priceGBP` | `rec.price` | literal | `decimal` | `12.37` (a number, not a string) |
| `demo:preparedAt` | `rec.ts` | literal | `dateTime` | `"2026-08-16T05:51:00.000Z"` — ISO 8601, UTC, millisecond precision |
| `demo:rating` | `rec.rating` | literal | `integer` | `5` (a number; range 1–5) |
| `demo:orderedBy` | `rec.cust` | **IRI**, not a literal | — | `http://example.org/pizzeria#Customer_000042` |

**SPQ-57** `demo:orderedBy` MUST yield the customer's IRI as a plain IRI term so that it joins to the customer's label triple. When the referenced customer does not exist the accessor MUST yield nothing and the scanner MUST skip the triple entirely `[src: DEMO_PRED]`.

**SPQ-58** Predicate dispatch MUST be: if the predicate is bound, the accessor set is the single matching accessor, or empty when the predicate is not one of the six; if the predicate is unbound, the accessor set is **all six**, evaluated in declaration order `[src: scan()]`.

**SPQ-59** For each selected accessor the scanner MUST dispatch on the subject:

| Case | Dispatch | Complexity |
|---|---|---|
| Subject **bound** | `store.indIndex.get(s)`; if absent, skip this accessor; else compute the value and yield when the object is unbound or term-equal | O(1) per accessor |
| Subject unbound | iterate every generated Individual record; compute the value; skip nulls; yield when the object is unbound or term-equal | O(N) per accessor |

The worst case of this dispatch — predicate unbound and subject unbound — is O(6N) and is exactly what `SELECT ?s ?p ?o WHERE { ?s ?p ?o }` triggers.

### Source 5 — the customer label source

**SPQ-60** When the predicate is unbound or identical to `rdfs:label`, the scanner MUST yield *(customer IRI, `rdfs:label`, literal customer name)* — with the subject bound, by finding the customer with that IRI; with the subject unbound, by iterating every customer, filtered by term equality against the object when the object is bound `[src: scan()]`.

**SPQ-61** The bound-subject case MUST be an indexed lookup. **Status:** specified, not implemented in the reference build — the reference performs a linear search of the customer array on every call, which is defect D3 `[src: scan()]`.

**SPQ-62** Generated Individuals other than customers have **no** `rdfs:label` triple. A query joining `?order rdfs:label ?name` returns nothing for orders; labels for orders are derived for display only and are not part of the queryable Store. See [Data model and store](11-data-model-and-store.md#the-store-object).

### Total scannable triples

**SPQ-63** The number of triples `scan` can yield with all three positions unbound MUST equal |TBox| + |RBox| + 7N + 2C, where N is the generated Individual count and C the customer count. The Store's reported triple count omits |RBox| `[src: tripleCount()]`; on the default dataset the scan yields 87,379 triples while the status line reports 87,239. The discrepancy is |RBox| = 140. An implementation MUST make the two agree, and the reported figure MUST be the larger, scannable one. **Status:** specified, not implemented in the reference build.

| Generated Individuals | Customers | Reported triples `[src: tripleCount()]` | Scannable triples |
|---|---|---|---|
| 1,000 | 125 | 7,489 | 7,629 |
| 12,000 *(default)* | 1,500 | 87,239 | 87,379 |
| 50,000 | 6,250 | 362,739 | 362,879 |
| 100,000 | 12,500 | 725,239 | 725,379 |

---

## Term equality

`[src: termEq()]`

**SPQ-64** Two terms MUST be equal when, and only when:

1. they are **identical** — the same IRI string, or the same literal object reference; or
2. they are **both literals** and the string forms of their lexical values are equal.

Otherwise they are unequal. In particular an IRI is never equal to a literal, whatever their lexical forms.

**SPQ-65** Literal comparison MUST ignore the datatype. `{ lit: 5, dt: "decimal" }` equals `{ lit: 5, dt: "integer" }` and equals `{ lit: "5", dt: "string" }` — verified: `?s demo:rating 5` and `?s demo:rating "5"` return the same 313 rows on the 1,000-Individual dataset. This is a deliberate simplification that makes the console forgiving about numeric literals written without a datatype, and a divergence from SPARQL 1.1, where `"5"^^xsd:string` and `5` are distinct RDF terms and do not match in a basic graph pattern.

**SPQ-66** Literal comparison MUST be on the **string form** of the lexical value, so `12.30` and `12.3` are **not** equal (their string forms differ), while `12.3` written as a number and `"12.3"` written as a string are.

**SPQ-67** Term equality MUST be used for the object position of a pattern match and for both sides of nothing else; `FILTER` uses its own comparison rules (SPQ-79 onwards), and `DISTINCT` uses its own key construction (SPQ-89).

---

## Evaluation

`[src: evaluate()]` `[src: bindOf()]`

### Solution representation

**SPQ-68** A **solution** MUST be a mapping from variable name (including the `?`) to a bound value, where a bound value is an IRI string or a literal object. A variable absent from the mapping is unbound.

**SPQ-69** The solution set MUST be an ordered list, and evaluation MUST begin with a list containing exactly one solution: the empty mapping `[src: evaluate()]`. This is what makes a query with zero patterns degenerate to one empty row — a state the parser prevents (step 62).

**SPQ-70** Binding lookup MUST be: for a term with a `v` field, the value bound to that variable in the current solution, or *unbound* if it has none; for a constant term, the constant `[src: bindOf()]`.

### The nested-loop join

**SPQ-71** Patterns MUST be joined in **written order**. The evaluator MUST NOT reorder patterns, MUST NOT estimate selectivity, and MUST NOT plan `[src: evaluate()]`. Query performance is therefore the query author's responsibility; see [Query performance](#query-performance-and-pattern-ordering).

**SPQ-72** The join MUST be the following nested-loop algorithm:

```
 1  solutions := [ {} ]
 2  truncated := false
 3  for each pattern [sp, pp, op] in q.patterns, in order:
 4      out := []
 5      for each solution b in solutions:
 6          s := bindOf(b, sp); p := bindOf(b, pp); o := bindOf(b, op)
 7          for each triple t in scan(s, p, o):
 8              nb := a shallow copy of b
 9              if sp is a variable: nb[sp.v] := t.subject
10              if pp is a variable: nb[pp.v] := t.predicate
11              if op is a variable: nb[op.v] := t.object
12              append nb to out
13              if length(out) >= SOLUTION_CAP:
14                  truncated := true
15                  break                      -- stop scanning this solution
16          if truncated: break                -- stop consuming solutions
17      solutions := out
18      if solutions is empty: break           -- early exit: nothing can follow
```

**SPQ-73** Binding extension MUST copy the solution before writing into it (step 8); solutions MUST NOT be mutated in place, because the same input solution is extended once per matching triple.

**SPQ-74** A variable repeated within one pattern MUST self-join through the write order of steps 9–11: the object write wins over the predicate write, which wins over the subject write. `{ ?x ?x ?x }` therefore binds `?x` to the object of every triple whose subject, predicate and object are pairwise consistent under `scan`'s own filtering — the pattern is passed to `scan` with all positions unbound on the first extension, so the *correct* self-join semantics are **not** implemented. An implementation MUST filter a candidate triple that repeats a variable so that all occurrences agree before extending. **Status:** specified, not implemented in the reference build.

**SPQ-75** The early exit at step 18 is required: once the intermediate result is empty no later pattern can add a solution, and the remaining patterns MUST NOT be scanned.

### The solution cap

**SPQ-76** The intermediate solution list MUST be capped at `SOLUTION_CAP` = **200,000** solutions per pattern step `[src: SOLUTION_CAP]`.

**SPQ-77** When the cap is reached the evaluator MUST record that the result is truncated and MUST report it to the user; truncation MUST NOT be hidden (SPQ-4, SPQ-111).

**SPQ-78** Once truncation has occurred, evaluation of the **remaining** patterns MUST continue correctly over the solutions already collected. **Status:** specified, not implemented in the reference build. In the reference build the truncation flag is function-scoped and is re-tested at step 16 of every subsequent pattern, so after truncation each later pattern consumes only the **first** solution and discards the other 199,999. Verified on the 100,000-Individual dataset: `SELECT ?s ?o ?r WHERE { ?s ?p ?o . ?s demo:rating ?r }` returns **0** rows with truncation reported, where the correct answer is non-empty. This is defect D4.

### Order of operations after the join

**SPQ-79** After the join the evaluator MUST apply, in exactly this order `[src: evaluate()]`:

1. **FILTER** — all filters, conjunctively, over whole solutions.
2. **Projection** — map each solution to a row of values, one per projected variable, in projection order; a projected variable with no binding yields *unbound*.
3. **DISTINCT** — if requested.
4. **ORDER BY** — if requested.
5. **Total** — record the row count *at this point* as the pre-`LIMIT` total.
6. **LIMIT** — if requested.

**SPQ-80** `FILTER` MUST be applied **after** all patterns have been joined, never interleaved. A filter therefore cannot reduce intermediate cardinality and cannot prevent the solution cap from being hit. An implementation MAY push a filter down to the earliest pattern that binds all of its variables, provided the observable result is unchanged; doing so SHOULD be treated as an optimisation and MUST NOT change error behaviour.

**SPQ-81** The evaluator MUST return exactly four fields: the column list (identical to the projection), the row list, the pre-`LIMIT` total, and the truncation flag `[src: evaluate()]`.

---

## FILTER semantics

`[src: evaluate()]`

### Supported operators

**SPQ-82** Exactly six operators MUST be supported, and no others: `=`, `!=`, `<`, `<=`, `>`, `>=` `[src: parseQuery()]`. Any other token in the operator position raises the missing-comparison-operator error.

**SPQ-83** Multiple `FILTER` lines MUST be combined conjunctively: a solution survives only if **every** filter holds `[src: evaluate()]`. There is no disjunction; `||`, `&&` and `!` are not in the grammar.

### The comparison algorithm

**SPQ-84** Each filter MUST be evaluated against a solution by this algorithm, exactly:

```
 1  a := bindOf(solution, filter.lhs)      -- IRI, literal, or unbound
 2  c := bindOf(solution, filter.rhs)
 3  av := (a is a literal) ? a.lit : a     -- unwrap literals to their lexical value
 4  cv := (c is a literal) ? c.lit : c
 5  an := numeric coercion of av           -- unbound coerces to 0; a non-numeric string to NaN
 6  cn := numeric coercion of cv
 7  numeric := an is finite AND cn is finite AND av <> '' AND cv <> ''
 8  x := numeric ? an : stringOf(av)
 9  y := numeric ? cn : stringOf(cv)
10  apply the operator to (x, y) and return the boolean
```

**SPQ-85** The numeric-versus-string decision rule is step 7 and MUST be reproduced exactly: the comparison is **numeric** when both operands coerce to finite numbers *and* neither operand is the empty string; otherwise it is a **string** comparison of the two operands' string forms.

**SPQ-86** String comparison MUST be the plain ordinal comparison of the string forms for `<`, `<=`, `>`, `>=`, `=` and `!=`. It MUST NOT be locale-aware. (`ORDER BY` does use a locale-aware comparison; the two are deliberately different in the reference build, and an implementation MUST keep them distinguishable — see SPQ-93.)

### Unbound and non-literal operands

**SPQ-87** An **unbound** operand MUST be handled as the algorithm handles it, and the consequences MUST be documented to the user:

| Other operand | Behaviour of the unbound operand | Consequence |
|---|---|---|
| Numeric | Coerces to **0** and the comparison is numeric | `FILTER (?missing > 1)` is false for every solution; `FILTER (?missing != 1)` is **true** for every solution — verified |
| Non-numeric string or IRI | Coerces to the string `"null"` and the comparison is a string comparison | Ordering against `"null"` is meaningless but deterministic |

This diverges from SPARQL 1.1, where evaluating an unbound variable in a comparison raises a type error and the filter's effective boolean value is `false` — which would make `FILTER (?missing != 1)` eliminate every solution rather than retain it. An implementation MUST choose one rule and document it; it SHOULD adopt the SPARQL rule and MUST then say so in the console, because the observable result changes. **Status (SPARQL-conformant unbound handling):** specified, not implemented in the reference build.

**SPQ-88** An **IRI** operand MUST be compared as its own string form. `FILTER (?s > 1)` where `?s` is bound to an IRI coerces the IRI to NaN, so the comparison becomes the string comparison `"http://…" > "1"`, which is true — verified. This is a divergence: SPARQL 1.1 defines `<`, `<=`, `>` and `>=` only for compatible literal pairs and raises a type error for IRIs.

**SPQ-89** A **literal** operand MUST be unwrapped to its lexical value before comparison, so the datatype plays no part in a filter, exactly as in term equality (SPQ-65). `FILTER (?rating >= 5)` matches the `integer` rating; `FILTER (?price > 13)` matches the `decimal` price; `FILTER (?ref > "AX-105000")` compares reference strings ordinally.

**SPQ-90** The empty string MUST force a string comparison (step 7). `FILTER (?b > "")` is therefore true for every bound non-empty string — verified — rather than a numeric comparison against zero.

---

## DISTINCT

**SPQ-91** When `DISTINCT` is requested the evaluator MUST retain the **first** occurrence of each distinct row and discard later duplicates, preserving the order of first occurrence `[src: evaluate()]`.

**SPQ-92** The solution key MUST be constructed per row by mapping each cell to a string and concatenating them:

| Cell | Key contribution |
|---|---|
| Literal | the letter `L` followed by the string form of the lexical value |
| IRI | the IRI string |
| Unbound | the string `null` |

**SPQ-93** The `L` prefix is the mechanism that distinguishes an IRI from a literal with the same lexical form: an IRI cell `Soho` and a literal cell `"Soho"` produce the keys `Soho` and `LSoho` and MUST NOT be collapsed `[src: evaluate()]`.

**SPQ-94** The key parts MUST be joined with a separator that cannot occur in a part, so that `["ab", "c"]` and `["a", "bc"]` produce different keys. **Status:** specified, not implemented in the reference build — the reference joins with the empty string, so those two rows collide and one is wrongly discarded `[src: evaluate()]`. This is defect D6. A conformant implementation MUST use a separator such as `U+001F` (unit separator), or a structural key.

**SPQ-95** `DISTINCT` MUST be applied to the **projected row**, not to the solution. Two solutions that differ only in a variable that is not projected produce one row.

---

## ORDER BY

**SPQ-96** Sorting MUST be applied after `DISTINCT` and before `LIMIT` (SPQ-79).

**SPQ-97** The sort key MUST be located by finding the ordering variable's index in the **projection**. When the ordering variable is not projected, the index is absent and the rows MUST be returned unsorted `[src: evaluate()]`. Verified: `SELECT ?s WHERE { ?s demo:priceGBP ?p } ORDER BY DESC(?p)` returns rows in scan order with no warning. An implementation MUST either sort on the underlying solution regardless of projection — the SPARQL 1.1 behaviour — or report that the ordering was ignored. Silence is not acceptable under SPQ-2. **Status:** specified, not implemented in the reference build.

**SPQ-98** The comparator MUST select numeric or lexical comparison per pair of values, exactly as follows `[src: evaluate()]`:

```
1  av := (a[idx] is a literal) ? a[idx].lit : a[idx]
2  bv := (b[idx] is a literal) ? b[idx].lit : b[idx]
3  an := numeric coercion of av ; bn := numeric coercion of bv
4  if an is finite AND bn is finite: return (an - bn) * dir
5  return localeCompare(stringOf(av), stringOf(bv)) * dir
```

**SPQ-99** The numeric branch MUST be taken whenever both values coerce to finite numbers, including the case of numeric strings. Note the difference from `FILTER` (SPQ-85): the ordering comparator has **no** empty-string guard, so an empty string coerces to 0 and sorts as a zero. An implementation SHOULD apply the same guard in both places and MUST document the choice.

**SPQ-100** The lexical branch MUST be a locale-aware collation of the string forms, not an ordinal comparison `[src: evaluate()]`. Order references (`AX-100000`, `AX-100001`, …) therefore sort in human order — verified.

**SPQ-101** Direction MUST be applied by multiplying the comparison result by `+1` for ascending or `-1` for descending `[src: evaluate()]`.

**SPQ-102** The sort MUST be **stable**: rows comparing equal MUST retain their relative order from the pre-sort list.

---

## LIMIT

**SPQ-103** `LIMIT` MUST be applied last, after ordering, by taking a prefix of the ordered row list `[src: evaluate()]`.

**SPQ-104** The pre-`LIMIT` total MUST be captured **before** the prefix is taken and MUST be returned alongside the rows `[src: evaluate()]`.

**SPQ-105** When the total exceeds the returned row count, the status line MUST report both figures and MUST say that a `LIMIT` was applied (SPQ-152). Reporting a truncated row count without its total is a violation of SPQ-3.

**SPQ-106** A `LIMIT` of zero MUST return zero rows with the total intact.

**SPQ-107** A negative `LIMIT` MUST be rejected with the missing-number error's remedy wording, or clamped to zero. **Status:** specified, not implemented in the reference build — the reference accepts `LIMIT -5` and returns *all but the last five rows*, reporting `308 rows of 313 (LIMIT applied)`; verified. This is defect D5.

**SPQ-108** A non-integral `LIMIT` MUST be truncated towards zero by the base-10 integer parse (`LIMIT 3.7` limits to 3) `[src: parseQuery()]`.

---

## Query performance and pattern ordering

This section is guidance for the **query author** and a set of obligations on the implementation. It exists because the evaluator has no planner (SPQ-71), so the written order of patterns *is* the execution plan.

### The rule

> **Bind the subject as early as possible, and never leave a generated-Individual pattern with an unbound subject in any position but the first.**

### Why, in terms of the dispatch table

Every pattern step costs *(number of surviving solutions) × (cost of one `scan` call)*. The cost of one `scan` call depends entirely on which positions are bound:

| Pattern shape | Index used | Cost of one call | Safe position |
|---|---|---|---|
| `<bound-subject> demo:<pred> ?v` | `store.indIndex` hash | O(1) + O(\|TBox\|+\|RBox\|) | Any |
| `<bound-subject> a ?t` | `store.indIndex` hash, then linear customer search | O(C) + statics | Any, but see defect D3 |
| `?s a <bound-class>` | `store.byType` bucket | O(\|bucket\|) + statics | First |
| `?s demo:<pred> <bound-literal>` | none — full record sweep | O(N) + statics | **First only** |
| `?s demo:<pred> ?v` | none — full record sweep | O(N) + statics | **First only** |
| `?s ?p ?o` | none — everything | O(6N + C) + statics | **First only**, and expect truncation |
| `<bound-subject> ?p ?o` | `store.indIndex` hash ×6 | O(1) + statics | Any |
| `?x rdfs:subClassOf <class>` | none — TBox sweep | O(\|TBox\|+\|RBox\|) | Any; the statics are small |

### Worked example — the good order

```sparql
SELECT ?order ?price ?ref WHERE {
  ?order demo:branch "Shoreditch" .    -- 1 call, O(N): sweeps records once, keeps ~N/6
  ?order demo:priceGBP ?price .        -- ~N/6 calls, O(1) each: indIndex hit
  ?order demo:orderRef ?ref .          -- ~N/6 calls, O(1) each: indIndex hit
  FILTER (?price > 13)
}
```

One linear sweep, then two indexed lookups per surviving solution. This is example 4 of the built-in set `[src: EXAMPLES]`, and it is the canonical shape.

### Worked example — the bad order

```sparql
SELECT ?a ?b WHERE {
  ?a demo:rating 5 .                   -- 1 call, O(N): ~N/6 solutions survive
  ?b demo:branch "Soho" .              -- ~N/6 calls, each a full O(N) sweep  ← cartesian
}
```

`?b` shares no variable with `?a`, so the second pattern is a full sweep per surviving solution: O(N²/6). At N = 1,000 this takes 71 ms and returns 55,401 rows; at N = 12,000 it exceeds the solution cap and truncates. Measured. An unconnected pattern is nearly always a mistake; see SPQ-113.

### Obligations on the implementation

**SPQ-109** The implementation MUST provide the by-type index and the Individual-by-IRI index that make the indexed rows of the table above O(1) or O(|bucket|) `[src: store]`. See [Data model and store](11-data-model-and-store.md#the-store-object).

**SPQ-110** The implementation MUST index the static triples by subject and by predicate, so that a bound-subject or bound-predicate pattern does not pay O(|TBox| + |RBox|) per call. **Status:** specified, not implemented in the reference build — the reference scans both arrays linearly on every call `[src: scan()]`. With 200,000 intermediate solutions and 379 static triples this alone is 7.6 × 10⁷ comparisons.

**SPQ-111** The implementation MUST index customers by IRI so that the bound-subject `rdf:type` and `rdfs:label` paths are O(1) (defect D3).

**SPQ-112** The console SHOULD warn — without refusing to run — when a query contains a pattern that shares no variable with any earlier pattern, because that pattern forces a cartesian product. **Status:** specified, not implemented in the reference build.

### Expected timings

Non-normative. Measured on the built-in example set and the probes above, on the reference fixture, single-threaded, warm; figures are the evaluator only and exclude rendering. They are given so an implementer can recognise an order-of-magnitude regression, not as a conformance target.

| Query | 1,000 Individuals | 12,000 *(default)* | 50,000 | 100,000 |
|---|---|---|---|---|
| Example 2 — hot toppings (TBox + RBox only) | < 1 ms | < 1 ms | < 1 ms | < 1 ms |
| Example 6 — everything about `pizza:Margherita` | < 1 ms | < 1 ms | < 1 ms | < 1 ms |
| Example 3 — cheese pizzas, two-hop TBox join | 4 ms | < 1 ms | 9 ms | < 1 ms |
| `?o a pizza:Margherita` — by-type bucket | < 1 ms | < 1 ms | < 1 ms | 2 ms |
| Example 4 — branch filter + two indexed hops | 9 ms | 39 ms | 153 ms | 263 ms |
| Example 7 — branch filter + type per order | 5 ms | 38 ms | 421 ms | 1,567 ms |
| Example 5 — rating + customer join (linear customer search) | 13 ms | 82 ms | 772 ms | 2,697 ms |
| `?s ?p ?o` — open scan, truncates at the cap | 9 ms | 71 ms | 112 ms | 109 ms |
| Cartesian pair (the bad order above) | 71 ms | 187 ms *(truncated)* | — | — |

The two right-hand columns of the last two measured rows are dominated by defect D3, not by the join itself. Fixing SPQ-111 is expected to bring example 5 at 100,000 Individuals below 200 ms.

**SPQ-113** Any query whose evaluation is expected to exceed 250 ms MUST be run without blocking the interface from having already painted its running state (SPQ-158).

---

## Error taxonomy

### The principle

**SPQ-114** Every error MUST carry two parts: a **message** naming the cause, and a **hint** naming the remedy `[src: QueryError]`. The error type MUST make the hint a first-class field rather than embedding it in prose, so the presentation layer can style the two differently.

**SPQ-115** Both parts MUST be presented together, the message emphasised and the hint following it `[src: runQuery()]`.

**SPQ-116** An error MUST NOT clear the query text, and MUST clear the previous result table so that a stale result is never shown beside a failed run `[src: runQuery()]`.

**SPQ-117** An error SHOULD additionally indicate the character offset at which the parse failed, using the offset recorded per token (SPQ-38). **Status:** specified, not implemented in the reference build.

### The table

Messages and hints are **verbatim**, including the curly quotation marks `“”`. `<v>`, `<tok>` and `<var>` denote interpolated text.

| # | Condition | Message (verbatim) | Hint (verbatim) | Remedy |
|---|---|---|---|---|
| E1 | The query does not begin with `SELECT` after any prologue — `ASK`, `CONSTRUCT`, `DESCRIBE`, or anything else (parse step 11) | `Only SELECT queries are supported.` | `Start the query with SELECT, or pick an example from the right.` | Rewrite as a `SELECT`, or load an example |
| E2 | `SELECT` (or `SELECT DISTINCT`) is followed by no variable and no `*` (step 20) | `SELECT needs at least one variable.` | `For example: SELECT ?pizza ?topping` | Add a projection variable or `*` |
| E3 | The projection is not followed by `WHERE` (step 22) | `Expected WHERE after the projection.` | `The shape is: SELECT ?x WHERE { ... }` | Insert `WHERE` |
| E4 | An expected literal token is missing or different — `{`, `}`, `(`, `)` (steps 25, 30, 36, 43, 49, 50) | `Expected “<v>” but found “<tok>”.` | `Check the braces and the dot at the end of each triple pattern.` | Balance the braces or parentheses |
| E5 | The same, at end of input — the commonest form of an unbalanced brace | `Expected “<v>” but found the end of the query.` | `Check the braces and the dot at the end of each triple pattern.` | Close the `WHERE` block |
| E6 | A `PREFIX` line is not *label* + IRI (step 8) | `Malformed PREFIX declaration.` | `Write it as: PREFIX pizza: <http://www.co-ode.org/ontologies/pizza/pizza.owl#>` | Write the declaration in the shown shape. **In the reference build this error fires for every syntactically correct `PREFIX` line — defect D1** |
| E7 | A prefixed name's label is not bound (term reader step 11) | `Unknown prefix “<v>”.` | `Declare it with PREFIX, or use one of: pizza: demo: rdf: rdfs: owl: xsd:` | Use a built-in prefix, or declare the label. The hint MUST list the currently bound labels, space-separated, in table order |
| E8 | A token in a term position is none of the accepted classes — `;`, `,`, `!`, `A`, `}`, an operator, a stray symbol (term reader step 14) | `“<tok>” is not a valid term.` | `Terms are variables (?x), prefixed names (pizza:Pizza), IRIs (<…>) or literals ("…").` | Replace the token with a term. Commonly caused by `;`/`,` lists (SPQ-8) or by `A` for `a` (SPQ-6) |
| E9 | The token stream ends in the middle of a triple pattern (term reader step 2) | `The pattern ends too early.` | `Every triple pattern needs a subject, a predicate and an object.` | Complete the pattern. Note: a pattern truncated by `}` raises **E8** on `}`, not E9; E9 fires only at true end of input |
| E10 | `FILTER (` *term* is not followed by a comparison operator (step 33) | `FILTER needs a comparison operator.` | `Supported: = != < <= > >=` | Use one of the six operators. Also fires for a complex expression, a function call, or `<`/`>` swallowed by defect D2 |
| E11 | `ORDER [BY] [ASC(|DESC(]` is not followed by a variable (step 52) | `ORDER BY needs a variable.` | `For example: ORDER BY DESC(?price)` | Sort on a variable; expressions are not supported |
| E12 | `LIMIT` is not followed by a number token (step 59) | `LIMIT needs a number.` | `For example: LIMIT 100` | Give an integer |
| E13 | The `WHERE` block contains no triple pattern — empty, or `FILTER`-only (step 62) | `The WHERE block has no triple patterns.` | `Add at least one, for example: ?pizza a pizza:NamedPizza .` | Add a pattern |
| E14 | A projected variable never occurs in a triple pattern (step 68) | `Variable <var> is selected but never bound in the WHERE block.` | `Either bind it in a pattern, or remove it from SELECT.` | Bind it, or drop it from the projection. Also fires for a stray `*` in a non-leading projection position (SPQ-11) |
| E15 | Any other failure escaping the parser or evaluator | *(the underlying exception's message)* | `Check the query syntax against one of the examples.` | Report it: reaching E15 means an error escaped the taxonomy, which is a defect `[src: runQuery()]` |

**SPQ-118** Errors E1–E14 MUST be raised at the parse step shown; an implementation MUST NOT defer a parse error to evaluation time, because doing so would report a syntax problem only after a potentially long run.

**SPQ-119** The unknown-prefix hint (E7) MUST be generated from the live prefix table rather than hard-coded, so a declared prefix appears in the list.

**SPQ-120** No evaluation-time error exists: once a query parses, evaluation MUST complete or truncate, never fail `[src: evaluate()]`. Unbound variables, type mismatches and empty results are all normal outcomes, not errors.

---

## The editor

### Structure

**SPQ-121** The query editor MUST present a single plain-text editing region with syntax highlighting, in a monospaced face, with soft wrapping. The reference build realises it as a transparent text input overlaid on a highlighted render of the same text `[src: .sparql__input]` `[src: .sparql__hl]`.

**SPQ-122** The highlighted render and the editable text MUST remain **pixel-aligned** at all times. This requires that both use the identical font family, size, line height, padding and wrapping mode, and that the render's scroll position is synchronised to the editor's on every scroll `[src: wire()]`. Any drift between them is a defect, not a cosmetic issue: it puts the caret visibly away from the character it is editing.

**SPQ-123** The highlight MUST be recomputed on every text change `[src: wire()]`.

**SPQ-124** The caret MUST remain visible and MUST take the primary text colour even though the editable layer's own text is transparent `[src: .sparql__input]`.

### Highlight token classes

**SPQ-125** The highlighter MUST classify text with the following ordered alternation and MUST map each class to the named **Design token** — never to a literal colour `[src: highlight()]` `[src: KEYWORDS]`:

| Order | Pattern | Class | Design token | Notes |
|---|---|---|---|---|
| 1 | `#` to end of line | comment | `--text-disabled`, italic | `[src: .tok-com]` |
| 2 | `"…"` with backslash escapes | string | `--e-dataprop` | `[src: .tok-str]` |
| 3 | `?name` | variable | `--accent` | `[src: .tok-var]` |
| 4 | `<…>` | IRI | `--e-individual` | `[src: .tok-iri]` |
| 5 | `prefix:local` | prefixed name | `--e-individual` | Same token as an IRI, deliberately: both denote a resource |
| 6 | `-?\b\d+\.?\d*\b` | number | `--warn` | `[src: .tok-num]` |
| 7 | bare word | keyword *or* nothing | `--e-objprop`, weight 600 | Highlighted only when its upper-cased form is in the keyword set; otherwise left unstyled |

**SPQ-126** The keyword set MUST be exactly: `PREFIX`, `SELECT`, `DISTINCT`, `WHERE`, `FILTER`, `LIMIT`, `ORDER`, `BY`, `ASC`, `DESC`, `A` `[src: KEYWORDS]`. Keyword highlighting MUST be case-insensitive.

**SPQ-127** `A` is in the highlight set but is **not** accepted by the parser (SPQ-6). An implementation MUST resolve this either by removing `A` from the highlight set or by accepting `A` as a synonym for `a`. **Status:** specified, not implemented in the reference build.

**SPQ-128** The highlighter's IRI pattern is `<[^>]*>` and carries the same over-greedy behaviour as the tokeniser (SPQ-36), so a `<` operator can visibly colour the rest of the query as an IRI. That visual is in fact an accurate depiction of what the tokeniser does, and MUST remain consistent with it: the highlighter and the tokeniser MUST use the same terminal definitions, so that fixing D2 fixes both.

**SPQ-129** The highlighted render MUST append a trailing newline so that a query ending in a newline keeps the final blank line's height and alignment is preserved `[src: highlight()]`.

### Keyboard

**SPQ-130** `Ctrl`+`Enter` (and `Cmd`+`Enter` on platforms with that modifier) MUST run the query and MUST suppress the default newline insertion `[src: wire()]`.

**SPQ-131** `Tab` MUST insert **two spaces** at the caret, replacing the selection if any, and MUST leave the caret after the inserted spaces; it MUST NOT move focus out of the editor, and the highlight MUST be resynchronised immediately `[src: wire()]`.

**SPQ-132** There MUST additionally be a visible run control carrying the label `Run` with the shortcut `Ctrl+Enter` shown beside it `[src: #qRun]`.

**SPQ-133** Selecting an example MUST replace the entire editor content with that example's text, resynchronise the highlight, and run it immediately `[src: wire()]`.

**SPQ-134** On first presentation the editor MUST be pre-loaded with the first example's text, highlighted but **not** run; the status line MUST read `Ready. Pick an example on the right, or write a query.` `[src: wire()]` `[src: #qStatus]`.

---

## Example queries

`[src: EXAMPLES]`

**SPQ-135** The console MUST present a persistent list of named example queries alongside the editor, each showing its title and a one-line note `[src: wire()]`.

**SPQ-136** The example set MUST be exactly the following seven, with these titles, notes and texts **verbatim**. The `<…>` IRIs are shown expanded, as the user sees them.

### 1. Named pizzas and their toppings

*Note:* `Walks the flattened hasTopping restrictions.`

```sparql
PREFIX pizza: <http://www.co-ode.org/ontologies/pizza/pizza.owl#>

SELECT ?pizza ?topping WHERE {
  ?pizza a pizza:NamedPizza .
  ?pizza pizza:hasTopping ?topping .
}
LIMIT 200
```

*Demonstrates:* a two-pattern TBox join and the flattened restriction index (SPQ-53).
*Expected shape:* two columns of `pizza:` IRIs, one row per pizza-topping pair.
*Actual result in the reference build:* **zero rows**, because `pizza:NamedPizza` is asserted as the `rdfs:subClassOf` parent of each named pizza, not as its `rdf:type`; the named pizzas' only `rdf:type` triple is `owl:Class` — verified `[src: buildTBox()]`. This is defect D7. The pattern that returns the intended 103 rows is `?pizza rdfs:subClassOf pizza:NamedPizza`.

### 2. Every hot topping

*Note:* `The Spiciness value partition in use.`

```sparql
PREFIX pizza: <http://www.co-ode.org/ontologies/pizza/pizza.owl#>

SELECT ?topping WHERE {
  ?topping pizza:hasSpiciness pizza:Hot .
}
```

*Demonstrates:* a single pattern answered entirely from the flattened restriction triples — `hasSpiciness some Hot` is a restriction, not an assertion, and would require a blank-node walk in real RDF.
*Expected shape:* one column, 5 rows: `pizza:CajunSpiceTopping`, `pizza:HotSpicedBeefTopping`, `pizza:TobascoPepperSauce`, `pizza:JalapenoPepperTopping`, `pizza:SpicyTopping` — verified, independent of dataset size.

### 3. Pizzas carrying a cheese topping

*Note:* `A two-hop join through the topping hierarchy.`

```sparql
PREFIX pizza: <http://www.co-ode.org/ontologies/pizza/pizza.owl#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

SELECT DISTINCT ?pizza WHERE {
  ?pizza pizza:hasTopping ?topping .
  ?topping rdfs:subClassOf pizza:CheeseTopping .
}
```

*Demonstrates:* `DISTINCT` collapsing the several cheese toppings of one pizza into one row, and a join whose second hop is a TBox axiom.
*Expected shape:* one column, **21** rows, alphabetically from `pizza:American` to `pizza:Veneziana` — verified. Note that the join is one level deep: a topping that is a cheese topping only transitively would not match, because nothing is inferred (SPQ-174).

### 4. Expensive Shoreditch orders

*Note:* `FILTER over the generated dataset.`

```sparql
PREFIX demo: <http://example.org/pizzeria#>

SELECT ?order ?price ?ref WHERE {
  ?order demo:branch "Shoreditch" .
  ?order demo:priceGBP ?price .
  ?order demo:orderRef ?ref .
  FILTER (?price > 13)
}
ORDER BY DESC(?price)
LIMIT 100
```

*Demonstrates:* the canonical fast shape (one sweep, then indexed hops), a numeric `FILTER` against a `decimal` literal, descending numeric `ORDER BY`, and a `LIMIT` whose pre-limit total must be reported.
*Expected shape:* three columns — IRI, decimal literal, string literal — 100 rows of 626 on the default dataset; 5,094 pre-limit at 100,000 Individuals — verified.

### 5. Five-star orders and customers

*Note:* `Joins generated individuals to customers.`

```sparql
PREFIX demo: <http://example.org/pizzeria#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

SELECT ?order ?customer ?name WHERE {
  ?order demo:rating 5 .
  ?order demo:orderedBy ?customer .
  ?customer rdfs:label ?name .
}
LIMIT 150
```

*Demonstrates:* a literal match against an `integer`-typed generated value using an undatatyped `5` (SPQ-65); `demo:orderedBy` yielding an IRI rather than a literal (SPQ-57); and a join from a generated Individual to a customer.
*Expected shape:* three columns — IRI, IRI, string literal — 150 rows of 3,455 on the default dataset — verified. This is the query most affected by defect D3.

### 6. Everything asserted about Margherita

*Note:* `An open predicate and object.`

```sparql
PREFIX pizza: <http://www.co-ode.org/ontologies/pizza/pizza.owl#>

SELECT ?predicate ?object WHERE {
  pizza:Margherita ?predicate ?object .
}
```

*Demonstrates:* a bound subject with both other positions open, and the mixture of TBox and flattened-restriction triples in one result.
*Expected shape:* two columns, **5** rows, in this order — verified:

| `?predicate` | `?object` | Source |
|---|---|---|
| `rdfs:subClassOf` | `pizza:NamedPizza` | TBox |
| `rdf:type` | `owl:Class` | TBox |
| `pizza:hasTopping` | `pizza:MozzarellaTopping` | Flattened restriction |
| `pizza:hasTopping` | `pizza:TomatoTopping` | Flattened restriction |
| `pizza:hasCountryOfOrigin` | `pizza:Italy` | Flattened `value` restriction |

### 7. Which pizzas does Soho sell most?

*Note:* `No aggregates yet — this returns the raw rows to count.`

```sparql
PREFIX demo: <http://example.org/pizzeria#>

SELECT ?order ?type WHERE {
  ?order demo:branch "Soho" .
  ?order a ?type .
}
LIMIT 500
```

*Demonstrates:* the deliberate absence of aggregation, stated in the example's own note; and the bound-subject `rdf:type` dispatch.
*Expected shape:* two columns of IRIs, 500 rows of 1,940 on the default dataset — verified. `?type` is the pizza class (for example `pizza:Margherita`), never `demo:Order`, because of the asymmetry in SPQ-55.

**SPQ-137** Every example's note MUST state what the example is for, and where an example demonstrates a limitation it MUST say so plainly, as example 7 does `[src: EXAMPLES]`.

**SPQ-138** Because the reference build rejects `PREFIX` (defect D1), all seven examples fail to parse as shipped; each becomes runnable by deleting its `PREFIX` lines, since all six labels they use are built in (SPQ-21). An implementation that fixes D1 MUST leave the example texts unchanged.

---

## Results presentation

`[src: renderQueryResults()]` `[src: QR]`

### Result state

**SPQ-139** The rendered result MUST be held as exactly three pieces of state: the ordered column list, the ordered row list, and the ordered list of distinct IRIs occurring anywhere in the rows `[src: QR]`.

**SPQ-140** The column list MUST be the query's projection, in projection order, and each column heading MUST be the variable name including its `?` `[src: renderQueryResults()]`.

**SPQ-141** When there are no columns — the state after an error or before the first run — the table MUST render nothing at all, not an empty grid `[src: renderQueryResults()]`.

### Virtualisation

**SPQ-142** Rows MUST be virtualised: only the rows intersecting the visible region, plus an overscan margin, are realised `[src: renderQueryResults()]`. The arithmetic MUST be:

| Quantity | Value |
|---|---|
| Row height | 32 units `[src: ROW_H]` |
| Scrollable extent | row count × row height |
| First realised row | `max(0, floor(scrollTop / 32) - 6)` |
| Realised row count | `ceil(visibleHeight / 32) + 12` |
| Realised block offset | first realised row × 32 |

**SPQ-143** Column widths MUST be equal fractions with a floor of 160 units per column `[src: renderQueryResults()]`.

**SPQ-144** Re-rendering MUST occur on scroll and MUST be cheap enough to keep pace with it; the reference re-renders the visible slice on every scroll event, passively `[src: wire()]`.

**SPQ-145** The result table MUST share its row height, virtualisation arithmetic and cell presentation with the individuals table so the two Surfaces read as one component; see [Individuals table](31-individuals-table.md) and [Component library](41-component-library.md).

### Cells

**SPQ-146** A cell MUST be rendered according to the kind of its value `[src: renderQueryResults()]`:

| Value kind | Rendering | Interaction |
|---|---|---|
| **IRI** | The shortened form — the built-in prefix label plus local name where a built-in namespace matches, else the IRI in angle brackets `[src: shorten()]` — in the accent colour, truncated with ellipsis | **Activatable.** Activating it selects that Entity on the shared selection bus and reveals it in the graph |
| **Literal** | The lexical value, in the monospaced face at the code size, truncated with ellipsis | None |
| **Unbound** | The single character `—` (em dash) | None |

**SPQ-147** The unbound placeholder MUST be `—` and MUST be visually distinguishable from a literal whose value is the string `—`; an implementation SHOULD render the placeholder in the secondary text colour. **Status (the colour distinction):** specified, not implemented in the reference build.

**SPQ-148** Activating an IRI cell MUST drive the **same** selection path as the tree and the individuals table — set the selection, render the inspector, update the tree selection and the status bar, and reveal the Entity in the graph `[src: selectEntity()]` `[src: wire()]`. The console MUST NOT have a private selection concept. See [Class tree and inspector](30-class-tree-and-inspector.md).

**SPQ-149** Revealing an Entity from a result MUST obey the **Budget** exactly as any other reveal does; it MUST NOT raise the Budget or bypass **Eviction**. See [Graph viewport and Budget](20-graph-viewport-and-budget.md).

### The distinct-IRI list

**SPQ-150** After each successful run the console MUST compute the ordered list of distinct IRI values appearing in **any** cell of the returned rows, preserving first-occurrence order and excluding literals and unbound cells `[src: runQuery()]`.

**SPQ-151** This list MUST be computed over the **returned** rows only — after `LIMIT` — not over the pre-limit total.

### The status line contract

**SPQ-152** After every run the status line MUST report, in one line, all of the following, and MUST NOT omit any of them when applicable `[src: runQuery()]`:

| Element | Form | Condition |
|---|---|---|
| Success marker | A success icon in the success colour | Always on success |
| Row count | The returned row count, emphasised, followed by `row` or `rows` correctly pluralised | Always |
| Pre-limit total | ` of <total> (LIMIT applied)` | Only when the total exceeds the returned count |
| Elapsed time | ` in <ms> ms`, emphasised; the measured duration rounded, with a floor of 1 | Always |
| Store size | ` over <n> triples` | Always; the Store triple count the query ran against `[src: tripleCount()]` |
| Distinct IRIs | ` · <n> distinct IRIs` | Always |
| Truncation notice | ` · intermediate results capped at 200,000` | Only when the solution cap was reached `[src: SOLUTION_CAP]` |

A complete success line therefore reads, for example:

> **100** rows of 626 (LIMIT applied) in **39 ms** over 87,239 triples · 100 distinct IRIs

**SPQ-153** Numeric figures in the status line MUST be thousands-separated in British English formatting `[src: fmt()]`.

**SPQ-154** The elapsed time MUST measure evaluation only — parse plus evaluate — and MUST NOT include rendering `[src: runQuery()]`.

**SPQ-155** The reported Store triple count MUST be the same figure the rest of the application reports, so that the console never contradicts the status bar `[src: tripleCount()]`. See SPQ-63 for the required correction to that figure.

**SPQ-156** On error the status line MUST switch to the error treatment — warning icon, danger colour, danger-subtle background, a leading danger-coloured rule — and MUST show message then hint `[src: .sparql__error]` `[src: runQuery()]`.

**SPQ-157** The result state MUST be invalidated when the Store changes — a dataset regeneration, an entity edit or a deletion — and the status line MUST say that the result is stale. **Status:** specified, not implemented in the reference build: regenerating the dataset leaves the previous result table and status line in place, now describing a Store that no longer exists `[src: regenerate()]`. This is defect D8.

---

## Running state

**SPQ-158** Before evaluation begins the console MUST show a visible running indicator: a spinner and the text `Evaluating…`, replacing the previous status line content `[src: runQuery()]` `[src: .spinner]`.

**SPQ-159** The send-to-graph control MUST be disabled for the duration of the run `[src: runQuery()]`.

**SPQ-160** The running indicator MUST be **painted before** evaluation starts. An implementation MUST therefore yield to the presentation layer between showing the indicator and running the query; the reference build defers evaluation to the next frame for exactly this reason, with the comment that the running state must actually be seen on a big Store `[src: runQuery()]`. Without the yield, a 2.7-second evaluation appears as a frozen window.

**SPQ-161** A run that exceeds roughly one frame MUST NOT leave the interface unable to repaint. **Status:** specified, not implemented in the reference build — the reference evaluates synchronously after the single frame yield, so the window is unresponsive for the duration. A conformant implementation MUST evaluate off the interface thread (see [Appendix A](#appendix-a--native-stack-mapping-non-normative)) and SHOULD offer cancellation for runs exceeding 2 seconds.

**SPQ-162** The result table MUST be scrolled back to its top on each successful run, so a result is never first seen from the middle of a previous scroll position `[src: runQuery()]`.

---

## Send results to graph

**SPQ-163** The console MUST provide a `Send results to graph` control `[src: #qToGraph]`.

**SPQ-164** The control MUST be disabled whenever the distinct-IRI list is empty — before the first run, after an error, and after a run whose result contains only literals `[src: runQuery()]`.

**SPQ-165** Activating it MUST take the **first Budget-many** IRIs from the distinct-IRI list and seed the **Viewport** with them `[src: wire()]` `[src: seedView()]`.

**SPQ-166** Seeding MUST replace the current **Viewport** contents and MUST set the seeded IRIs as the **Focus set** `[src: seedView()]`.

**SPQ-167** **Seed, do not expand.** The seed MUST be performed with expansion disabled, so that no neighbour of a seeded node is pulled in `[src: wire()]`. A query result is an explicit selection by the user; auto-expanding it would immediately exhaust the **Budget** with nodes the user did not ask for.

**SPQ-168** After seeding, the layout MUST be recomputed fresh and the view fitted `[src: seedView()]`, and the Budget readout MUST be refreshed `[src: wire()]`.

**SPQ-169** The console MUST report the outcome with a toast whose copy is exactly:

> `Seeded the graph with <taken> of <total> IRIs from the result set.`

where `<taken>` is the number actually seeded and `<total>` the size of the distinct-IRI list, both thousands-separated `[src: wire()]` `[src: showToast()]`.

**SPQ-170** The report MUST state both figures even when they are equal, so the user is never left to infer whether anything was dropped (SPQ-3).

**SPQ-171** Where seeding causes **Eviction** or refusal under the **Budget**, that MUST additionally be reported by the Viewport's own honest-reporting contract; see [Graph viewport and Budget](20-graph-viewport-and-budget.md).

---

## Divergences from SPARQL 1.1

**SPQ-172** The console MUST NOT claim SPARQL 1.1 conformance in any copy, documentation, menu label or marketing text.

Each row states whether the omission is **deliberate** — outside the product's purpose, not planned — or a **candidate** for a later release. Candidates carry the status line required by the suite conventions.

| Feature | Status | Rationale / plan |
|---|---|---|
| `OPTIONAL` | **Candidate.** **Status:** specified, not implemented in the reference build. | Left-join over a nested group. The single highest-value addition: inspecting an Entity's optional properties is a natural ontology task. Requires the evaluator to gain a nested group representation and a left-join operator |
| `UNION` | **Candidate.** **Status:** specified, not implemented in the reference build. | Disjunction of two groups; mechanically straightforward once nested groups exist |
| Property paths (`/`, `*`, `+`, `?`, `^`, `\|`) | **Candidate.** **Status:** specified, not implemented in the reference build. | `rdfs:subClassOf*` is the single most requested ontology query. Needs a transitive closure evaluator bounded by the same solution cap |
| Aggregates (`COUNT`, `SUM`, `AVG`, `MIN`, `MAX`, `SAMPLE`, `GROUP_CONCAT`) and `GROUP BY`/`HAVING` | **Candidate.** **Status:** specified, not implemented in the reference build. | Example 7 exists precisely because they are missing, and says so `[src: EXAMPLES]` |
| Sub-queries (`{ SELECT … }`) | **Deliberate omission.** | Requires a general algebra; out of proportion to the Surface's purpose |
| `BIND` and expression assignment | **Candidate.** **Status:** specified, not implemented in the reference build. | Needs an expression evaluator, which `FILTER` would share |
| `VALUES` / inline data | **Candidate.** **Status:** specified, not implemented in the reference build. | Cheap to add: a pre-seeded solution list instead of the single empty solution (SPQ-69) |
| `CONSTRUCT` | **Deliberate omission.** | The product has no triple-output Surface; the graph Viewport is not an RDF sink |
| `ASK` | **Candidate.** **Status:** specified, not implemented in the reference build. | Trivially derivable: evaluate and report whether any solution survives |
| `DESCRIBE` | **Deliberate omission.** | The inspector already performs the equivalent for a selected Entity, better |
| Named graphs, `GRAPH`, `FROM`, `FROM NAMED`, the dataset clause | **Deliberate omission.** | The **Store** is a single unnamed graph by design; see [Data model and store](11-data-model-and-store.md) |
| Blank nodes — in data and in patterns (`_:b`, `[]`) | **Deliberate omission.** | The Store has no blank nodes at all; OWL restrictions that would be blank nodes are flattened (see below) |
| Complex `FILTER` expressions: boolean connectives, arithmetic, `BOUND`, `IN`, `EXISTS`, `NOT EXISTS`, `regex`, `str`, `lang`, `datatype`, `sameTerm`, casts | **Candidate** for a bounded subset — boolean connectives, `BOUND`, `regex`, `str`. **Status:** specified, not implemented in the reference build. The full function library is a **deliberate omission**. | `FILTER` currently parses exactly one comparison `[src: parseQuery()]` |
| `OFFSET` | **Candidate.** **Status:** specified, not implemented in the reference build. | Pairs with `LIMIT`; trivial |
| Multiple `ORDER BY` keys and ordering by an expression | **Candidate.** **Status:** specified, not implemented in the reference build. | The parser reads one variable only (SPQ-14) |
| `REDUCED` | **Deliberate omission.** | `DISTINCT` suffices |
| `BASE` and relative IRIs | **Deliberate omission.** | All IRIs are absolute (SPQ-25) |
| Language tags and `^^datatype` literal suffixes | **Candidate.** **Status:** specified, not implemented in the reference build. | Requires the term model to carry a language tag and comparison to respect datatype; today datatype is carried but ignored (SPQ-65) |
| Datatype-aware comparison and value-space equality | **Candidate.** **Status:** specified, not implemented in the reference build. | Today `5`, `"5"` and `5.0` are one term (SPQ-65) |
| Entailment regimes (RDFS, OWL) | **Deliberate omission.** | The whole suite excludes reasoning; see the suite [README](README.md) |
| Federated query (`SERVICE`) | **Deliberate omission.** | The product is offline by design |
| Update (`INSERT`, `DELETE`, `LOAD`, `CLEAR`) | **Deliberate omission.** | Editing is performed through the tree, inspector and table Surfaces, which keep the indexes consistent |
| Result serialisation (SPARQL JSON, XML, CSV/TSV) | **Candidate.** **Status:** specified, not implemented in the reference build. | Result export is a natural companion to the graph export paths in [Graph rendering and export](22-graph-rendering-and-export.md) |

---

## The flattened-restriction caveat

### What is flattened

**SPQ-173** Existential (`some`) and value (`value`) restrictions MUST be exposed to the query engine as **direct triples** *(class, property, filler)*, so that a query can match a class to a restriction filler without walking a blank-node path `[src: buildRBox()]`.

In OWL's RDF mapping, the axiom

> `pizza:Margherita rdfs:subClassOf (pizza:hasTopping some pizza:MozzarellaTopping)`

is serialised as a blank node of type `owl:Restriction` carrying `owl:onProperty` and `owl:someValuesFrom`. A conformant SPARQL query against that RDF must read:

```sparql
?pizza rdfs:subClassOf ?r .
?r owl:onProperty pizza:hasTopping .
?r owl:someValuesFrom ?topping .
```

The console instead answers:

```sparql
?pizza pizza:hasTopping ?topping .
```

### Why, and what it costs

**SPQ-174** This is a **deliberate divergence** from OWL's RDF mapping, adopted because the console's purpose is to let an ontologist interrogate the ontology they are editing, and the three-pattern blank-node walk is both unmemorable and unsupported by a grammar with no blank nodes (see [Divergences from SPARQL 1.1](#divergences-from-sparql-11)). The cost is precision, and it MUST be disclosed:

1. A matched triple asserts *a restriction exists*, not that any individual has the property. `pizza:Margherita pizza:hasTopping pizza:MozzarellaTopping` is a **class-level** axiom, not an instance-level fact. A user who reads the result as instance data is being misled.
2. Universal (`only`), cardinality (`min`, `max`, `exactly`) and negated restrictions are **not** flattened `[src: buildRBox()]`, so their absence from a result does not mean the axiom is absent from the ontology. A query over `hasTopping` sees `some` and `value` restrictions only.
3. Equivalent-class restrictions are flattened alongside subclass restrictions and are **indistinguishable** in a result `[src: buildRBox()]`: a defined class's necessary-and-sufficient condition and a primitive class's necessary condition produce the same triple.
4. The flattened triples are not counted in the Store's reported triple total (SPQ-63), so the Store appears smaller than what the query can see.
5. Nothing is inferred. `?topping rdfs:subClassOf pizza:CheeseTopping` matches one level only; a grandchild class does not match (example 3).

**SPQ-175** The console MUST tell the user that restrictions are flattened, in the Surface, at the point of use — not only in documentation. The disclosure MUST name the three facts a user needs: that `some` and `value` restrictions appear as direct triples; that `only`, `min`, `max` and `exactly` do not appear at all; and that a matched triple is a class-level axiom, not instance data. **Status:** specified, not implemented in the reference build — the reference discloses the flattening only in an example's note, `Walks the flattened hasTopping restrictions.` `[src: EXAMPLES]`, which explains neither the omissions nor the class-level reading.

**SPQ-176** Where a result row was produced by a flattened restriction rather than an asserted triple, the console SHOULD mark it as such. **Status:** specified, not implemented in the reference build.

---

## Defects in the reference build (verified)

Every defect below was reproduced by extracting the reference engine unmodified and executing it. They are recorded here because an implementer working from the prototype's observed behaviour would otherwise reproduce them. Each names the requirement that supersedes it.

| ID | Defect | Evidence | Superseded by |
|---|---|---|---|
| **D1** | **Every `PREFIX` declaration is rejected.** The tokeniser has no terminal for a prefix label followed by whitespace, so `pizza:` becomes `word("pizza")` + `sym(":")`; the parser then reads the `:` where it expects an IRI and raises `Malformed PREFIX declaration.` All seven built-in examples fail to parse as shipped `[src: tokenize()]` `[src: parseQuery()]` | `parseQuery('PREFIX ex: <http://e#>\nSELECT ?s WHERE { ?s a ex:T }')` → `Malformed PREFIX declaration.` | SPQ-9, SPQ-37 |
| **D2** | **A `<` comparison operator can be swallowed into an IRI token.** The IRI terminal `<[^>]*>` precedes the operator terminal and crosses newlines, so the `<` in one `FILTER` consumes everything up to a later `>` `[src: tokenize()]` | `FILTER (?a < 1)\nFILTER (?b > 2)` tokenises the run `< 1)\nFILTER (?b >` as one `iri` token, and the parse then fails with `FILTER needs a comparison operator.` | SPQ-36 |
| **D3** | **Customer lookup by IRI is a linear search.** Both the bound-subject `rdf:type` path and the bound-subject `rdfs:label` path scan the customer array `[src: scan()]` | Example 5 at 100,000 Individuals (12,500 customers) takes 2,697 ms against 263 ms for the structurally similar example 4 | SPQ-61, SPQ-111 |
| **D4** | **After truncation, later patterns see only one solution.** The truncation flag is function-scoped and re-tested per pattern, so every subsequent pattern breaks out of its solution loop after the first solution `[src: evaluate()]` | At 100,000 Individuals, `SELECT ?s ?o ?r WHERE { ?s ?p ?o . ?s demo:rating ?r }` returns 0 rows, truncation reported | SPQ-78 |
| **D5** | **A negative `LIMIT` drops rows from the end.** The limit is applied as a prefix slice, and a negative argument slices from the end `[src: evaluate()]` | `LIMIT -5` over 313 rows returns 308 rows and reports `308 rows of 313 (LIMIT applied)` | SPQ-107 |
| **D6** | **`DISTINCT` keys can collide.** Cell keys are concatenated without a separator `[src: evaluate()]` | Rows `["ab","c"]` and `["a","bc"]` both key to `LabLc`-style collisions and one is discarded | SPQ-94 |
| **D7** | **Example 1 returns zero rows.** It matches `?pizza a pizza:NamedPizza`, but named pizzas are related to `pizza:NamedPizza` by `rdfs:subClassOf`; their only `rdf:type` is `owl:Class` `[src: buildTBox()]` `[src: EXAMPLES]` | The query returns 0 rows at every dataset size; the `rdfs:subClassOf` form returns 103 | SPQ-136 example 1 |
| **D8** | **Results are not invalidated when the Store changes.** Regenerating the dataset leaves the previous result table and status line displayed `[src: regenerate()]` | Run a query at 1,000 Individuals, regenerate at 100,000: the old rows and the old triple count remain on screen | SPQ-157 |
| **D9** | **The reported triple count excludes the flattened restriction triples**, so the console reports a Store smaller than the one it queries `[src: tripleCount()]` `[src: buildRBox()]` | Open scan at 1,000 Individuals yields 7,629 triples; the status line reports 7,489 | SPQ-63 |
| **D10** | **`rdf:type` dispatch is asymmetric for `demo:Order`.** Bound-object matching yields every generated Individual; bound-subject matching never yields the `demo:Order` type `[src: scan()]` | `?c a demo:Order` → 1,000 rows; `<…#Pizza_000001> a ?t` → 1 row, the pizza class only | SPQ-55 |
| **D11** | **A repeated variable within one pattern does not self-join.** All three positions are passed to the scanner unbound and the last write wins `[src: evaluate()]` | `{ ?x ?x ?x }` returns rows where subject, predicate and object differ | SPQ-74 |

---

## Conformance checklist

An implementation is conformant with this document when all of the following hold. This list is a navigation aid, not a substitute for the numbered requirements; the authoritative tests live in [Acceptance criteria and tests](61-acceptance-criteria-and-tests.md).

1. The grammar of [The accepted grammar in EBNF](#the-accepted-grammar-in-ebnf) is accepted in full, including a working `PREFIX` (SPQ-9).
2. The tokeniser produces the nine token classes with positions, discards comments, and does **not** swallow `<` operators (SPQ-34 to SPQ-39).
3. The parser follows the numbered pseudocode and produces the seven-field query object (SPQ-41, SPQ-45).
4. No generated Individual is ever materialised as a triple (SPQ-47).
5. Every dispatch path of the triple source meets its stated complexity, with the static triples indexed (SPQ-50 to SPQ-63, SPQ-110).
6. Term equality is lexical and datatype-blind, and an IRI never equals a literal (SPQ-64 to SPQ-66).
7. The join is a nested loop in written order, with early exit, a 200,000-solution cap, and correct continuation after truncation (SPQ-71 to SPQ-78).
8. `FILTER`, `DISTINCT`, `ORDER BY` and `LIMIT` are applied in the specified order with the specified semantics (SPQ-79 to SPQ-108).
9. Every error in the taxonomy is raised with its verbatim message and hint (SPQ-114 to SPQ-120).
10. The editor's highlight stays aligned with the text, `Tab` inserts two spaces, and `Ctrl`+`Enter` runs (SPQ-121 to SPQ-134).
11. All seven examples are present verbatim and all seven run (SPQ-136, SPQ-138).
12. The status line carries every element of its contract, including the truncation notice (SPQ-152).
13. The running indicator is painted before evaluation begins, and evaluation does not freeze the interface (SPQ-158 to SPQ-161).
14. Send-to-graph seeds without expanding and reports both figures (SPQ-163 to SPQ-171).
15. The flattening of restrictions is disclosed in the Surface (SPQ-175).

---

## Appendix A — Native stack mapping (non-normative)

Nothing in this appendix is binding. It records how the normative requirements above would most naturally be met on a Windows 11 native stack, and is offered so that an implementer does not have to rediscover the options.

### A.1 Parser construction

Three routes, in increasing order of ceremony:

| Route | Fit | Notes |
|---|---|---|
| **Hand-written recursive descent**, directly transcribing the pseudocode of SPQ-41 | Recommended | The grammar is tiny — one query form, one group shape, one comparison per filter. A hand-written parser is around 250 lines of C#, keeps the error messages exactly where SPQ-114 needs them (attached to the production that failed, with a hint), and costs nothing at build time. A generated parser's error recovery is generally *worse* for this purpose, because generic "unexpected token" messages violate SPQ-2 |
| **ANTLR 4** with the C# target | Reasonable if the grammar is expected to grow towards the candidates in the divergence table | A published SPARQL 1.1 ANTLR grammar can be cut down. Requires a custom `IAntlrErrorListener` to map syntax errors onto the taxonomy, since the default messages do not carry remedies |
| **Parser combinators** (`Superpower`, `Pidgin`, `Sprache`) | Good middle ground | Composable, and error positions come free. `Pidgin` is the fastest of the three and allocates least |

Whichever route is taken, the tokeniser should be written with the corrected terminals of SPQ-36 and SPQ-37 rather than transcribing the reference regular expression, which carries defects D1 and D2 in its alternation order. A lexer written as an explicit character-scanning state machine — rather than a single alternation regular expression — is both faster and free of the ordering hazard.

Text positions should be carried through as `(offset, line, column)` from the start, so that SPQ-117 can be satisfied without a later refactor.

### A.2 A syntax-highlighted editor on Windows

| Option | Assessment |
|---|---|
| **AvalonEdit** (WPF; usable from WinUI 3 via an island, or directly in a WPF shell) | The mature choice. Provides a token-based highlighting engine, folding, a proper caret model and selection. Highlighting is defined as an `.xshd` rule set — the token classes of SPQ-125 map one-to-one onto rule spans, with the colours bound to the **Design token** palette rather than written literally |
| **Monaco or CodeMirror inside a WebView2** | Capable and familiar, but drags a browser runtime into a native application, complicates theming against the **Design token** set, and makes SPQ-122 someone else's problem in a way that is hard to audit |
| **`RichEditBox` / `RichTextBlock` with run-level formatting** | Workable for a query of this size. Re-tokenise on change, rebuild the runs, and take care to suppress the control's own auto-formatting. Beware quadratic behaviour when rebuilding runs on every keystroke |
| **Overlay approach (as in the reference build): a transparent text box over a formatted render** | Not recommended natively. It is a web technique that survives only because the two layers share one text-layout engine. On a native stack, font metrics, run breaking and scroll quantisation differ enough that SPQ-122 becomes a recurring alignment bug |

Whatever the control, `Tab` must be intercepted before the focus manager sees it (SPQ-131), and `Ctrl`+`Enter` must be registered as an accelerator scoped to the console Surface so that it does not fire while another Surface has focus (SPQ-130).

### A.3 Running evaluation off the UI thread

SPQ-160 and SPQ-161 together require that the running state is painted first and that the window stays responsive:

1. Set the status line to the running state on the UI thread.
2. Hand the parsed query to a worker — `Task.Run` onto the thread pool is sufficient; the evaluator is pure over an immutable snapshot of the **Store**.
3. Marshal the result back via the dispatcher and render.

Two constraints follow. First, the evaluator must not touch UI-affine state; the **Store** indexes are plain collections and are safe to read concurrently **provided** no edit is in flight — take a version stamp before the run and compare it after, discarding the result if the Store changed (which is also how SPQ-157 is satisfied). Second, cancellation should be plumbed as a `CancellationToken` checked inside the scan loop at a coarse interval (every few thousand yielded triples), so a runaway cartesian product can be abandoned.

The solution cap (SPQ-76) should be enforced as a hard count, and the cap value should be a configuration constant rather than a literal, so that a 64-bit desktop build can raise it.

### A.4 The interface a real triple store would implement

The single most valuable structural decision is to define the triple source as an interface from the start, so that the virtual source specified in [The triple source](#the-triple-source) can be swapped for a real store — an embedded RDF database, a remote SPARQL endpoint, or a memory-mapped index — without touching the evaluator:

```csharp
public interface ITripleSource
{
    // Lazy, streaming, allocation-light. Any argument may be null, meaning unbound.
    IEnumerable<Triple> Scan(Term? subject, Term? predicate, Term? obj);

    // Reported Store size, including flattened restriction triples (SPQ-63).
    long TripleCount { get; }

    // Monotonic; changes whenever any triple the source can yield changes (SPQ-157).
    long Version { get; }

    // Optional selectivity hint: -1 when unknown. A future planner would consume this.
    long EstimateCardinality(Term? subject, Term? predicate, Term? obj);
}
```

`Triple` should be a readonly struct of three `Term` values, and `Term` a readonly struct discriminating IRI from literal, with the literal carrying its lexical value and datatype. Returning structs through a `IEnumerable<Triple>` still allocates an enumerator per call; on the hot paths — where `Scan` is invoked once per intermediate solution — an allocation-free enumerator struct with a custom `GetEnumerator` avoids millions of allocations at 100,000 Individuals.

Two implementations satisfy this interface and should both exist from the first week: the virtual source over the compact records (the product's own), and a trivial in-memory list source used by the conformance tests, so that the evaluator can be tested against hand-written triples with no generator involved. A third — a real store — then becomes a drop-in, and the `EstimateCardinality` hint becomes the seam where a genuine query planner could later replace the written-order execution of SPQ-71 without changing any other requirement in this document.
