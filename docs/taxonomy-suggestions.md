# Suggestions

## Add Parents using existing class names

Choose **Suggest > Add Parents** from a class context menu in Graph or Hierarchy. The search starts immediately. The selected class is the child. A local index finds shorter existing class names by omitting words while retaining their order, including omissions in the middle. For Alpha Beta Gamma, existing Alpha Gamma and Beta Gamma are possible parents. Matching normalizes case, punctuation and camel case. It matches complete words, so Alpha does not match Alphabet. The review lists up to 100 matches, with the closest names first.

Existing ancestors, descendants, negated target names, anonymous expressions and individuals are excluded. Review the unchecked candidates, then choose **Add selected parents**. Axiom adds an ordinary rdfs:subClassOf link from the selected class to each chosen parent. Existing statements are preserved, and one Undo reverses the batch. Changing the selected entity invalidates an open review, and parent candidates are checked again before applying. This action uses no LLM or network service.

## Add new children through local assistants

Right-click a class in Graph or Hierarchy and choose **Suggest > Add Children** to open the dockable **Suggestions** view. Shift+F10 opens the same context menu. The view can be moved, detached, maximized and reopened through **View > Suggestions**.

Selecting **Add Children** opens the view and starts a run with the saved assistant preference. Selecting it again starts a new run, unless the same request is already running. Reopening the pane through **View > Suggestions** displays its latest run. **New run** starts another request without replacing the earlier result. **Run history** lists the selected node's runs and runs for other nodes in the current ontology. Opening or browsing history does not call an assistant.

Each run retains its original context, exact prompt, provider, time, proposals and outcome in Axiom's local user-data directory under `taxonomy-runs/history`. Accepted proposals are marked **Added**. Completed, failed and cancelled runs survive closing the view and restarting Axiom. A run interrupted by application shutdown is retained as interrupted. Closing the view or switching nodes lets an active request continue; use **Cancel suggestions** to stop it.

The request contains the selected class, every immediate parent link along its ancestry to each root, and up to 20 randomly sampled children and 20 randomly sampled descendants. Each list is sampled independently without replacement; lists of 20 or fewer are included in full. Multiple inheritance is preserved. Definitions, restrictions, equivalents and disjointness help establish the meaning of each class. Axiom does not invent an asserted link to Thing for an imported root that has no parent.

The assistant receives ordinary text describing the topic, broader categories, existing narrower categories and their connections. It is asked for useful types one level more specific than the topic, using general subject knowledge alongside the supplied background. A branch with no existing children can still receive familiar suggestions. A candidate that belongs under an existing child or deeper descendant must be omitted. Existing classes, synonyms, ancestors and instances must also be omitted. An empty result is a successful response when there are no justified additions. Each suggestion includes a readable name, description and reason. The response is a short text outline; The assistant does not supply ontology identifiers, parent bindings or edit instructions.

Open **Context sent to Claude** or **Context sent to Codex** to inspect the branch and the exact prompt. This action sends the selected class branch and its ancestry, not the unrelated branches or individual records. The summary shows sampled counts, such as 20 of 143 children and 20 of 372 descendants. Connections among narrower categories are limited to the included nodes. The prompt identifies these lists as partial. Each new run chooses a fresh sample; earlier runs retain the exact sample and prompt. The full branch stays local for duplicate checks and history validation. Ancestor traversal remains limited to 1,500 classes and 6,000 links, and the sampled prompt is limited to 140,000 characters.

Axiom parses the text and binds each suggestion to the original selected class locally. Malformed or incomplete responses produce an error without changing the ontology. Results remain in the Suggestions view for review.

Select the proposals to accept, then choose **Add selected children**. Axiom creates readable labels and derives identifier names through the shared normalization routine. Each new class has an explicit rdfs:subClassOf relationship to the selected class. The definition is stored as a comment; this operation does not translate prose into additional OWL restrictions. The whole batch can be undone or redone together.

Existing labels and normalized identifier names are checked locally across the ontology. Duplicate or incorrectly targeted proposals are disabled. The selected parent is retained even if selection changes while the assistant runs. If the ontology changes during a session, start a new run before inserting proposals. After restart, Axiom compares the saved branch context with the current ontology and validates proposals again before applying them. Adding part of a run updates its review baseline so remaining proposals can still be accepted. History remains readable even when its proposals can no longer be applied.

## Find instances

**Find instances** is a separate context-menu action with a separate prompt. Selecting it starts the run immediately. It asks for identifiable real members of the selected class, using general subject knowledge and the same plain-text exchange. It can return an empty result when no useful additions are justified. Accepted individuals receive rdf:type relationships to the selected class. They do not become subclasses.

The prompt includes up to 50 existing individuals from the selected branch and the total count. All existing names are still checked locally. Proposals use model knowledge without web research; they are not presented as externally verified facts. Review their membership and descriptions before adding them.

Both actions default to Claude and offer Codex in the Assistant selector. This preference is shared with Research and query generation. They reuse the local CLI runner used for SPARQL composition, with isolated temporary directories, plain-text output, cancellation and a five-minute timeout. Axiom does not call a model API directly. The CLI sends the prompt through its own signed-in service.

## Shared view and custom suggestions

The Suggestions view has a **Suggestion type** selector and Previous/Next buttons. Switch between Add Children, Add Parents, Find Synonyms, saved custom suggestions and Find Instances in the current view. Selecting a ready suggestion starts it automatically. If its runner is occupied, the selected request waits and starts when the runner is available. Browsing history cancels a pending start for that pane. **Open another view** creates an independent dockable tab with its own selected entity and suggestion type. Opening another view or restoring a session shows history without starting another run. Saved workspaces and restored sessions retain these tabs. Running-operation status stays in Suggestions; Hierarchy does not repeat it.

**Suggest > Define New** opens a form for a name, instructions, optional examples, a predicate and a value type (text or resource IRI). **Save suggestion** stores the definition in axiom-properties.json under Axiom's user-data directory. Saving the form starts the completed suggestion. Opening **Define New** does not start a run. Definitions are available across workspaces and app restarts; opening a workspace does not replace them. **Edit definition** updates a saved definition. Earlier runs keep the instructions used at the time.

Custom runs send the selected entity's statements and the saved instructions to the selected assistant. Results are values with reasons. Review them and choose **Add selected values** to append statements using the configured predicate. Existing statements are retained. One Undo reverses the batch. Invalid results and changed entity context block application. No proposed value is added automatically.

Parent and custom histories are retained in suggestion-history in the user-data directory. They retain the node, definition, context, prompt, results, errors and accepted selections. Reopening a pane shows its latest run for the chosen suggestion type. **New run** keeps the earlier runs. Error details use the shared audit log.

## Find synonyms

**Suggest > Find Synonyms** opens the shared Suggestions view from Graph or Hierarchy. The request starts immediately with the saved assistant preference. The request asks for close wording variations of the same entity, including spelling variants, word-order changes and established abbreviations. Broader, narrower, sibling and merely related concepts are excluded. An empty result is valid.

The prompt includes the selected entity's meaning, ancestry, children, descendants and siblings. Existing rdfs:seeAlso values accompany these terms, with text distinguished from resource links. Children, descendants and siblings are independently sampled to 20 terms per list. Up to 20 additional annotated relatives supply seeAlso examples omitted by those samples. Ancestors are included in full. The exact context and prompt are saved with the run.

A local index checks candidates against labels and text aliases across the entire ontology, including terms outside the sample. It accounts for case, punctuation, word order and ordinary inflections. A conservative lexical check rejects candidates that replace the subject or drop distinguishing words. **Excluded suggestions** shows rejected values and reasons. These checks support review; they do not establish semantic equivalence.

Review the unchecked results, then choose **Add selected synonyms**. Each accepted value becomes an rdfs:seeAlso string literal on the selected entity. Existing class relationships remain intact. The batch supports Undo. Candidates are checked again before adding, including aliases that other entities acquired after the run. Changed entity context requires a new run. Histories, errors and accepted selections survive restarting Axiom, and **New run** retains earlier results.

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
