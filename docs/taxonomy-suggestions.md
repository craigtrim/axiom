# Taxonomy suggestions through Codex

Right-click a class in the Hierarchy pane and choose **Add children**. Axiom starts Codex from PATH using its existing CLI sign-in and opens a review dialog. Shift+F10 opens the same context menu from a focused taxonomy row. The dialog stays with its window when Hierarchy is detached.

The request contains the selected class, every immediate parent link along its ancestry to each root, and its existing children and descendants. Multiple inheritance is preserved. Definitions, restrictions, equivalents and disjointness help establish the meaning of each class. Axiom does not invent an asserted link to Thing for an imported root that has no parent.

Codex receives ordinary text describing the topic, broader categories, existing narrower categories and their connections. It is asked for useful types one level more specific than the topic, using general subject knowledge alongside the supplied background. A branch with no existing children can still receive familiar suggestions. A candidate that belongs under an existing child or deeper descendant must be omitted. Existing classes, synonyms, ancestors and instances must also be omitted. An empty result is a successful response when there are no justified additions. Each suggestion includes a readable name, description and reason. The response is a short text outline; Codex does not supply ontology identifiers, parent bindings or edit instructions.

Open **Context sent to Codex** to inspect the branch and the exact prompt. This action sends the selected class branch and its ancestry, not the unrelated branches or individual records. Selecting Thing can encompass the whole class hierarchy. Axiom sends the complete taxonomy context or asks for a narrower class; it does not silently omit links. The current limits are 1,500 traversed classes per direction, 6,000 links per direction and 140,000 prompt characters.

Axiom parses the text and binds each suggestion to the original selected class locally. Malformed or incomplete responses produce an error without changing the ontology. The review dialog and acceptance workflow remain the same.

Select the proposals to accept, then choose **Add selected children**. Axiom creates readable labels and derives identifier names through the shared normalization routine. Each new class has an explicit rdfs:subClassOf relationship to the selected class. The definition is stored as a comment; this operation does not translate prose into additional OWL restrictions. The whole batch can be undone or redone together.

Existing labels and normalized identifier names are checked locally across the ontology. Duplicate or incorrectly targeted proposals are disabled. The selected parent is retained even if selection changes while Codex runs. If the ontology changes, the proposals must be regenerated before they can be inserted. Closing the dialog or choosing Cancel stops its request.

## Find instances

**Find instances** is a separate context-menu action with a separate prompt. It asks for identifiable real members of the selected class, using general subject knowledge and the same plain-text exchange. It can return an empty result when no useful additions are justified. Accepted individuals receive rdf:type relationships to the selected class. They do not become subclasses.

The prompt includes up to 50 existing individuals from the selected branch and the total count. All existing names are still checked locally. Proposals use model knowledge without web research; they are not presented as externally verified facts. Review their membership and descriptions before adding them.

Both actions use Codex only. They reuse the local CLI runner used for SPARQL composition, with isolated temporary directories, plain-text output, cancellation and a five-minute timeout. Axiom does not call a model API directly. The CLI sends the prompt through its own signed-in service.

## Tests

Ordinary tests use local fixtures and cover context construction, duplicate handling, class and individual assertions, review, cancellation, stale responses, Undo and detached windows.

The real-Codex tests are opt-in and excluded from ordinary testing:

```powershell
npm run test:codex -- taxonomy.spec.ts
```

To exercise an existing package:

```powershell
$env:AXIOM_TEST_EXE=(Get-Content artifacts/latest-electron.json | ConvertFrom-Json).executable
npm run test:codex -- taxonomy.spec.ts
```

The five cases check missing direct vehicle categories, a complete RGB taxonomy with no additions, named planet instances with duplicate exclusion, the shipped Pizza branch, and Meaty Pizza with no recorded children. They operate the taxonomy context menu and use the real Codex on PATH. Prompt, response and installation details are retained with the Playwright report. These checks establish the observed behavior of those cases; proposed taxonomic placement still requires review.
