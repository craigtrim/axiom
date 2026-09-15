# SPARQL authoring and local agent integration in Axiom

## Recommendation

Axiom should offer deterministic query formatting beside a bounded natural-language query composer. The composer should launch a locally installed Codex or Claude executable, receive a structured proposal, and validate the extracted SPARQL against Axiom's query engine before making it available for insertion. Execution should remain a separate Run action. This design uses the agent to draft text while Axiom retains ownership of ontology context and query execution.

The appropriate initial integration is a subprocess adapter for each CLI. A conversation server becomes useful when the product needs persistent discussions, streamed intermediate actions or interactive tool approvals. Those requirements do not follow from asking an agent to produce one query. Introducing them now would add lifecycle work without improving the central authoring interaction.

The implementation follows this recommendation. Query has a Format button and Shift+Alt+F shortcut, a Compose query control, and an explicit review step. Codex is the initial preference; the selected provider is remembered, and an available provider is selected if the preference is missing. Public SPARQL skills inform the prompting approach, but none is installed or loaded automatically.

Axiom now uses Comunica for SPARQL 1.1 Query, with Traqula parsing and an N3 RDF/JS dataset. The agent receives that capability contract, and Axiom validates generated queries before insertion. Requests for ordinary prefix matching, aggregation or property paths can execute locally. Remote SERVICE and ontology modification remain outside the query panel.

## Existing query capabilities

The W3C SPARQL 1.1 specification includes several query forms, optional graph patterns, aggregation and other constructs beyond a basic SELECT query. Language-level validity therefore does not establish compatibility with a particular application's implementation.[^1] Axiom needs both a clear capability description and validation using its own parser.

The local parser in `src/domain/query-parser.ts` accepts the SPARQL 1.1 grammar. The query panel admits SELECT, ASK, CONSTRUCT and DESCRIBE. Execution in `src/domain/query.ts` retains RDF term metadata and unbound result cells, with a worker that can be cancelled during planning or evaluation. The engine operates on asserted triples without implicit OWL entailments.

| Request or construct | Current treatment in Axiom |
|---|---|
| SELECT, ASK, CONSTRUCT and DESCRIBE | Supported |
| Prefix or substring matching | STRSTARTS, CONTAINS, REGEX and related string functions |
| Counts and grouped results | Aggregates, GROUP BY and HAVING |
| Ancestors and descendants | Property paths over asserted relationships |
| Missing values and alternatives | OPTIONAL, UNION, MINUS, EXISTS and NOT EXISTS |
| Intermediate bindings and nested queries | BIND, VALUES and subqueries |
| Result ordering and pagination | ORDER BY, OFFSET and LIMIT |
| Named graphs and dataset clauses | GRAPH and FROM over local graph data |
| Remote SERVICE or HTTP retrieval | Not enabled |
| SPARQL Update through the query panel | Rejected; backend update tests use isolated stores |

The agent context records actual asserted types and labels separately from display names. Prefix matching must remain a filter over the data, rather than a list of matching identifiers seen during generation. Ancestor queries must allow undeclared relationship endpoints such as owl:Thing.

The distinction between schema and instance data deserves explicit guidance. A class label does not imply that its members have the same label. A property's domain is a schema statement, not evidence that a particular individual has a value for that property. Likewise, a direct subclass query does not answer a request for all descendants.

A generated query may parse and reference known identifiers while still answering the wrong question. The review therefore includes an explanation and assumptions. Validation confirms syntax and supplied identifier membership; it does not certify the natural-language interpretation or guarantee useful results. The interface should avoid presenting a parser check as proof of semantic correctness.

## Formatting

Formatting should be immediate and independent of agent availability. The operation changes presentation, so invoking a model would introduce avoidable delay and variation. A good result uppercases recognized keywords, separates major clauses and indents graph patterns while preserving the text of variables, IRIs and literals. Comments must survive, and Undo must restore the previous document.

A specialist implementation already exists: `sparqling/sparql-formatter` offers a JavaScript library and browser bundle for SPARQL formatting.[^2] Its accompanying paper describes a PEG parser, an AST-based formatter and separate tracking of comments by position.[^3] This makes it a credible candidate for an eventual full-language editor. It is substantially more relevant than a generic SQL formatter, whose similar-looking keywords do not establish compatibility with RDF query syntax.

The selected implementation uses Traqula's complete SPARQL 1.1 lexer and parser. Formatting changes whitespace and keyword case, then validates the result and compares its token sequence with the original. Literal contents, escape spelling and comments remain intact. The editor applies the result as one undoable operation.

The specialist formatter was evaluated locally but rejected after token-preservation failures involving collections and property paths. The maintained lexer permits presentation changes without regenerating literals from an AST. Every executable W3C query in Axiom's local scope is checked against its expected result before and after formatting.

The lowercase predicate abbreviation `a` must retain its spelling. Keyword case normalization must not turn `?select`, an IRI containing `where`, or a string containing `SELECT` into different data. Tests include these cases, decimal numbers, embedded quotes and comments. Formatting is also checked for idempotence: applying it twice produces the same result.

The example selector now describes the actual editor content. Once the document differs from a supplied example, the selector displays Custom query. Leaving the old example title visible would give an edited or generated query a misleading identity, particularly when users return to the pane after working elsewhere.

## CLI integration choices

Official Codex documentation describes `codex exec` as its noninteractive interface, with final output separated from progress messages. It supports JSON Schema output and writing the final response to a file. Saved CLI authentication can be reused.[^4] Those facilities match a bounded request that returns a single query proposal.

Claude documents `-p` or `--print` for noninteractive use, JSON output and schema-constrained responses. Its `--bare` mode is a significant caveat: although it suppresses configuration discovery, it does not use a subscription login and requires an alternative authentication route.[^5] Axiom therefore does not select bare mode for its existing-sign-in workflow.

| Approach | Fit for the current task | Main cost or limitation |
|---|---|---|
| Codex exec and Claude print adapters | Strong: launch, return one proposal, exit | Provider-specific flags and response envelopes |
| Codex App Server | Useful for a richer Codex conversation UI | Persistent protocol lifecycle and provider-specific integration |
| Agent Client Protocol | Potential common interface for interactive agents | Requires compatible agent implementations or adapters |
| MCP server exposing Axiom context | Useful if agents need to retrieve context incrementally | Adds callable application tools and permission design |
| Direct model API integration | Technically possible | Does not meet the chosen installed-CLI interaction |
| Watching an arbitrary output folder | Weak | Ambiguous ownership, stale files and incomplete writes |

Codex App Server provides a bidirectional JSON-RPC interface. Its documented stdio transport uses newline-delimited JSON, and the lifecycle includes initialization, threads, turns and notifications.[^6] The additional structure would be valuable for an ongoing “explain this result, revise the query, compare alternatives” interaction. For a single proposal, the existing exec path is easier to supervise and test.

Agent Client Protocol also describes a client launching an agent subprocess and communicating over stdio. Its architecture separates the editor client from agent sessions and updates.[^7] It is a reasonable future abstraction when multiple installed agents provide compatible adapters. Protocol availability alone is not evidence that every local Codex or Claude installation can be driven identically, so that compatibility should be established before replacing the working provider adapters.

MCP addresses another part of the problem. It exposes tools and resources to an AI application, with discovery and invocation mechanisms.[^8] An Axiom MCP server could eventually provide operations such as retrieving class definitions or validating a proposed query. It would not, on its own, supply the user-facing agent conversation or choose which installed CLI to run.

For now, a complete bounded context is passed with the request. The agent does not need to browse, read the workspace or execute SPARQL to draft a proposal. The distinction keeps the initial interface small. It also leaves a migration path: context retrieval can become a tool later without changing the editor's proposal and validation contract.

## Process and output contract

Axiom owns the process lifecycle in Electron's main process. The renderer requests discovery, generation, cancellation or status through the application bridge. It cannot supply an arbitrary executable path or shell command. The shared runner is also used by entity research, avoiding separate implementations of discovery and cancellation.

Discovery checks PATH for supported native executables and the Codex npm entry point. The executable is launched with an argument array and no shell. Each run receives a temporary working directory, an output schema and the prompt over standard input. Relative working directories are resolved to absolute paths so the process and its output files refer to the same location.

For Codex, the adapter reads the final response file. For Claude, it reads the JSON envelope and extracts structured output, falling back to the result text when necessary. Diagnostic output is bounded, output size is limited, and a timeout ends a stalled run. Cancellation terminates the process tree on Windows. A completed or failed job releases the lock so another request can start.

The proposal contains four fields:

| Field | Purpose |
|---|---|
| status | Distinguishes a query proposal from an unsupported request |
| sparql | Contains exactly one query, or is empty for unsupported requests |
| explanation | Describes the intended result or the obstacle |
| assumptions | Makes interpretive choices visible for review |

Structured output is the preferred boundary, but it does not eliminate runtime validation. Axiom checks field types and lengths and rejects inconsistent combinations, such as an unsupported response containing runnable query text. Compatibility extraction accepts a single SPARQL code fence or a plain SELECT/PREFIX query. Multiple code blocks are rejected rather than choosing one by position.

Extraction is followed by local parsing. An update request, extra trailing query, unsupported construct or unbound projection fails before insertion becomes available. Constant IRIs are checked against the supplied context, including class and property relationships and observed RDF types. This check catches invented identifiers; it cannot prove that a join expresses the requested meaning.

A successful proposal is formatted with the same deterministic formatter used by the editor button. The generation service never calls the query execution method. Keeping that separation in code makes the review boundary testable, rather than relying on the assistant to follow a request not to execute its answer.

## Ontology context

The most useful context is specific to the open ontology. A generic explanation of RDF cannot tell an agent whether the local identifier is `CourseCredit`, `CreditUnit`, or something less obvious. Labels and identifiers should travel together, and the actual predicates present in the data should be visible.

Axiom supplies the ontology name and namespace, bounded entity information, predicate counts and observed RDF types. Entity entries include labels, kinds and direct parents, with property domain, range and inverse information when present. The description influences term ranking so a named class or property has a better chance of appearing in the limited context.

The current limits include 160 ranked entity entries and 120 predicate entries. Entity serialization has a character budget, and the full prompt has a separate bound. Omitted entities are counted in the interface. These limits are engineering controls, not an assertion that every ontology question can be answered from that much context.

A bounded list creates an honest failure mode. If a relevant identifier is absent, the agent should explain that the context is insufficient. It should not silently invent a namespace term because the name looks plausible. Describing a more specific entity can change the selected context and enable a later request.

Schema retrieval is also the strongest transferable idea in the SIB SPARQL-LLM project. Its published implementation combines endpoint metadata, query examples and validation, and supports retrieving relevant schema information.[^9] The associated paper describes the approach for federated bioinformatics knowledge graphs.[^10] That is useful evidence for grounding and validation, but it does not establish an accuracy rate for Axiom's local ontologies.

A future improvement would be retrieval of a small number of reviewed query examples compatible with Axiom's grammar. Examples should demonstrate correct joins and schema/instance distinctions. Their value depends on the underlying assertions and supported engine features. Copying examples from an unrelated endpoint can introduce identifiers and functions that are valid there but unusable here.

## Public semantic-web skills

Two directly relevant public skill files are available in OpenLinkSoftware's ai-agent-skills repository. They provide natural-language-to-SPARQL workflows for DBpedia and Wikidata. Both contain concrete query guidance, so they are useful starting material. Their execution assumptions are tightly coupled to their target services.

The DBpedia skill maps questions to DBpedia properties and calls for checking prefixes, bindings and query shape. It also fixes a DBpedia endpoint and includes routing through external services, plus HTML reporting conventions.[^11] The validation discipline transfers to Axiom; the endpoint choices and report harness do not.

The Wikidata skill emphasizes Q/P identifiers, statement modeling and label handling. Its examples use Wikidata's label service and richer query constructs, and its workflow includes remote execution routes.[^12] Those patterns can help explain how endpoint-specific knowledge improves generation. They should not be installed as Axiom's default query policy.

| Source | Useful material | Material requiring replacement | Assessment |
|---|---|---|---|
| OpenLink DBpedia query skill | Identifier mappings, query-shape review, explicit provenance | Fixed endpoint, routing, external reporting conventions | Reference material; low direct compatibility |
| OpenLink Wikidata query skill | Explicit identifier handling and statement-model awareness | Wikidata services and Q/P assumptions | Useful domain example; low direct compatibility |
| SIB SPARQL-LLM | Schema retrieval and validation architecture | Endpoint stack and federated-query assumptions | Strong architectural reference, not a drop-in skill |
| sparqling formatter and paper | Parser-aware formatting and comment handling | Token-preservation failures in local evaluation | Assessed; the implementation uses Traqula |
| W3C query specification | Authoritative syntax and semantics | No Axiom-specific execution guarantees | Standards reference |

A skill file is executable guidance in an agent environment. Reviewing one requires more than checking whether its examples look reasonable. Its tool calls, external services, installation instructions and surrounding repository policies can materially alter the requested workflow. Axiom's authoring contract should therefore be maintained locally, with public examples treated as evidence to assess.

The current contract is application code, not a separately installed skill. It gives both providers the same grammar limits, context format and response schema. This avoids drift between provider-specific instruction files. If a distributable skill is added later, it should be generated or checked against that contract and accompanied by executable compatibility examples.

## User experience

Format is a visible toolbar action, and Compose query opens beside the editor in a wide pane. In a narrow pane, the composer temporarily uses the body and returns to the main editor after generation. The [query-history UX research](query-history-ux.md) records the responsive design and evidence.

The composer begins with a description field and a provider selector. The selector remembers the latest choice. Missing providers are labeled, and Refresh agents repeats PATH discovery. Setup guidance points to installation and terminal sign-in; there is no API-key field in the application.

“Refine the current query” is an explicit option. When enabled, the current editor text becomes part of the request. When disabled, generation uses the natural-language description and ontology context. This distinction lets the same interaction support both a new query and a revision without making users learn separate modes.

Context is inspectable before generation. The expanded view includes the actual prompt and ontology data being sent, along with the selected executable path. Names and labels are included, while unrelated literal values and query results are excluded by default. Existing query text is included only through the refinement option.

Generation displays elapsed time and a Cancel generation action. Closing the composer does not lose the running job; reopening reads its status from the main process. The interface does not claim a percentage complete because neither adapter supplies a meaningful estimate of how much drafting remains.

Generated SPARQL opens in the main editor as a new retained document. Explanation and assumptions appear in a disclosure beside that document. Unsupported requests create no empty page. Validation failures retain the generated text for correction and disable Run for the unchanged invalid proposal.

Previous and Next browse retained query documents. New query and example selection preserve the current draft. The position indicator opens searchable history. Each recently used document has its own Monaco model and Undo stack. Run remains a separate action, with results attached to the selected document.

## State, authentication and failure handling

Each request records its ontology context and source query identifier and edit version. Changed ontology context is flagged in the generated document. If the user edited or navigated while generation was running, the response is retained as a new query and an Open generated query notice appears without switching the editor. The renderer also preserves unsaved keystrokes that precede the debounce timer.

An executable on PATH is not proof of authentication or service availability. Discovery establishes that a candidate can be found. A real generation request can still fail because the CLI is signed out, a model is unavailable, a quota is exhausted or the network is interrupted. The interface should surface the available diagnostic and allow retry.

Using a local CLI does not mean model inference is local or offline. The selected CLI uses its configured account and service. Axiom does not directly call a model API or collect an API credential in this workflow. Users still need to consider the contents of the context that the CLI receives.

The adapter constrains tool availability and configuration discovery for the bounded task, but it should not be described as a universally hermetic execution environment. CLI behavior and supported flags change across releases. The installed executable and its account configuration remain part of the dependency boundary, and compatibility needs periodic testing.

The local versions examined were Codex 0.154.0 and Claude Code 2.1.270. Both were exercised through the shared adapter with a small synthetic ontology containing Course Credit and its parent class. Both returned a query that passed Axiom's validation. Those checks establish working integration on this machine; they are not broad evaluations of natural-language query accuracy.

## Verification and maintenance

Tests should measure behavior at each boundary. Formatter tests compare parsed queries before and after presentation changes and check idempotence. Extraction tests include structured responses, plain query text, a single fence, multiple fences and malformed fields. These cases protect against the common temptation to treat the first code block in an arbitrary response as authoritative.

Process tests use deterministic executable fixtures for both providers. They verify schema arguments, final-response handling and release of the run lock. Cancellation and timeout tests cover stalled subprocesses. These tests make failure handling repeatable without consuming a model request for every build.

Desktop tests cover formatting and Undo, automatic delivery without execution, preservation of newer edits, unsupported requests, invented identifiers, cancellation and reopening. Query-history checks cover branching without truncating later entries, result ownership, full-text search, restart and compact versus wide layouts. The opt-in live suite uses only real Codex on PATH and verifies automatic delivery, source preservation and actual query results.

The live suite contains twelve semantic cases, including the reported American prefix request, changes to the data after generation, case-insensitive matching, direct parents, refinement, instance types, COUNT, ASK, OPTIONAL, ancestor paths, grouped counts and imported labels. Assertions compare result sets with fixture-derived expectations rather than requiring one query spelling. Reports retain the provider version, requests, responses and result evidence. These cases establish observed behavior on controlled fixtures, not a general natural-language accuracy rate.

The local language suite runs independently of model access and covers the vendored W3C SPARQL 1.0 and 1.1 corpus within an explicit local scope, plus literal regressions. Its coverage inventory records excluded HTTP and entailment cases. See [SPARQL testing](sparql-testing.md) for commands and engine maintenance requirements.

## Sources

1. W3C. [SPARQL 1.1 Query Language](https://www.w3.org/TR/sparql11-query/). Recommendation, 21 March 2013. Used for the distinction between the full language and Axiom's implementation.
2. sparqling. [SPARQL 1.1 formatter](https://github.com/sparqling/sparql-formatter). Repository documentation, accessed 14 September 2026. Used for available formatter interfaces.
3. Hirokazu Chiba. [Formatting SPARQL 1.1 via Parsing Expression Grammar](https://ceur-ws.org/Vol-3659/IJCKG_2023_P5.pdf). IJCKG 2023 Poster and Demo track. Used for parsing and comment-preservation design.
4. OpenAI. [Non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode). Living documentation, accessed 14 September 2026. Used for Codex exec, structured output and authentication behavior.
5. Anthropic. [Run Claude Code programmatically](https://code.claude.com/docs/en/headless). Living documentation, accessed 14 September 2026. Used for print mode, structured output and the bare-mode authentication caveat.
6. OpenAI. [Codex App Server](https://learn.chatgpt.com/docs/app-server). Living documentation, accessed 14 September 2026. Used for transport and lifecycle comparison.
7. Agent Client Protocol. [Architecture](https://agentclientprotocol.com/get-started/architecture). Living documentation, accessed 14 September 2026. Used for the client/agent subprocess model.
8. Model Context Protocol. [Architecture overview](https://modelcontextprotocol.io/docs/2026-07-28/learn/architecture). Documentation version 2026-07-28, accessed 14 September 2026. Used for tool and resource integration.
9. SIB Swiss Institute of Bioinformatics. [SPARQL query generation with LLMs](https://github.com/sib-swiss/sparql-llm/blob/main/README.md). Repository documentation, accessed 14 September 2026. Used for schema retrieval and validation architecture.
10. Vincent Emonet et al. [LLM-based SPARQL Query Generation from Natural Language over Federated Knowledge Graphs](https://arxiv.org/abs/2410.06062v4). Revised 10 February 2025. Used for the application of metadata and query examples to generation.
11. OpenLink Software. [DBpedia Query Skill](https://github.com/OpenLinkSoftware/ai-agent-skills/blob/main/dbpedia-query-skill/SKILL.md). Repository file, accessed 14 September 2026. Assessed as endpoint-specific reference material.
12. OpenLink Software. [Wikidata Query Skill](https://github.com/OpenLinkSoftware/ai-agent-skills/blob/main/wikidata-query-skill/SKILL.md). Repository file, accessed 14 September 2026. Assessed as endpoint-specific reference material.

[^1]: W3C, [SPARQL 1.1 Query Language](https://www.w3.org/TR/sparql11-query/), 2013.
[^2]: sparqling, [SPARQL 1.1 formatter](https://github.com/sparqling/sparql-formatter), accessed 14 September 2026.
[^3]: Hirokazu Chiba, [Formatting SPARQL 1.1 via Parsing Expression Grammar](https://ceur-ws.org/Vol-3659/IJCKG_2023_P5.pdf), 2023.
[^4]: OpenAI, [Non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode), accessed 14 September 2026.
[^5]: Anthropic, [Run Claude Code programmatically](https://code.claude.com/docs/en/headless), accessed 14 September 2026.
[^6]: OpenAI, [Codex App Server](https://learn.chatgpt.com/docs/app-server), accessed 14 September 2026.
[^7]: Agent Client Protocol, [Architecture](https://agentclientprotocol.com/get-started/architecture), accessed 14 September 2026.
[^8]: Model Context Protocol, [Architecture overview](https://modelcontextprotocol.io/docs/2026-07-28/learn/architecture), 2026-07-28.
[^9]: SIB, [SPARQL query generation with LLMs](https://github.com/sib-swiss/sparql-llm/blob/main/README.md), accessed 14 September 2026.
[^10]: Emonet et al., [LLM-based SPARQL Query Generation](https://arxiv.org/abs/2410.06062v4), 2025.
[^11]: OpenLink Software, [DBpedia Query Skill](https://github.com/OpenLinkSoftware/ai-agent-skills/blob/main/dbpedia-query-skill/SKILL.md), accessed 14 September 2026.
[^12]: OpenLink Software, [Wikidata Query Skill](https://github.com/OpenLinkSoftware/ai-agent-skills/blob/main/wikidata-query-skill/SKILL.md), accessed 14 September 2026.
