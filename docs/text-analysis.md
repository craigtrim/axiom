# Text Analysis

Open **View > Text Analysis** and type or paste plain text. Matching runs automatically after a 60 ms typing pause. The editor stays responsive while the model runs. Only the newest pending edit is parsed, and results from older edits cannot replace current highlights.

Matches use the currently open ontology, including unsaved changes already applied through Axiom's editors. Saving an RDF file is unnecessary. Editing the ontology triggers a new analysis of the same text. Named graphs contribute their union of asserted statements to matching; the original dataset remains unchanged.

Each canonical ontology entity has a stable background color. Synonyms share that color, so `Dog` and `canine` have the same highlight when the ontology defines that synonym. Highlights have no underline. Colors adapt to light and dark themes, and labels provide an alternative to color alone.

**Text Entities** opens alongside Text Analysis as a separate dockable view. Its **Summary** tab lists matched entities and occurrence counts. Use the workbench's normal controls to resize, move, close, maximize or detach it. Its position and visibility survive restart. **View Entities** in the editor, or **View > Text Entities**, reopens it. Closing either view leaves the other available.

Click a highlight or summary entry to open Axiom's existing **Details** view. Ontology matches select the actual entity and show the standard editable statements, source and ancestry navigation. The same tab is reused across matches, including when it is detached or has been renamed. A closed Details view reopens. Text Entities has only **Summary** and **Add entity** tabs.

A summary entry also selects its first occurrence in the text and reopens the editor if needed. Alt+Enter opens Details at the cursor or for an exactly selected match. If several ontology entries share a canonical name, Details lists their identifiers so you can choose the intended entry. Model annotations show their matched text, category and matching method in the same Details view, without an invented ontology link. The normal Back control returns to the previously selected entity.

Both text views share one analysis session. Moving a view to another window does not start another parser, and the summary stays available when the text editor closes. Editing the ontology refreshes the normal Details editor and starts a new analysis. Text or ontology changes clear obsolete annotation information.

spaCy named entities also appear, grouped by category such as Person, Place or Organization. Ontology matches take precedence over overlapping model annotations. A blank ontology still shows model annotations through mutatoc's native tokenization interface. The editor retains your text, supports Undo, Redo and Find, and saves its text with the workbench. Up to 100,000 characters can be analyzed at once.

## Adding a selected phrase

Select a phrase and choose **Add selected text**, press Alt+Enter, or use **Add selected text to taxonomy** in the editor's context menu. The **Add entity** tab in Text Entities lets you review the class name, parents and optional description before choosing **Add class**. Unfinished class and parent drafts survive moving or detaching the view, including the parent you are currently editing.

For `Electronic Surveillance Systems`, an existing class named `Systems` becomes a suggested parent. Class names, labels and literal synonyms contribute suggestions. Longer matching phrases take priority, with a trailing phrase preferred when the lengths are equal. The best match starts selected. Each suggestion toggles independently, so `Computer Software Applications` can belong under both `Computing` and `Software`. **Add existing parent** uses the workbench's resource search to find additional classes. **Selected parents** lists every choice with a Remove button. With no parents selected, the class goes under Thing.

**Create new parent** opens a parent draft in the same view. Enter its name, select its parents, or create another parent from there. Each level offers the same suggestions and search. **Use new parent** returns to the child draft; **Edit** revisits a new parent's name, description and ancestry. If the name already identifies an existing class, **Use ... as parent** reuses that class. **Cancel parent**, or Escape inside a parent draft, discards that draft and returns to the child.

No classes are created until **Add class** saves the original class and all its new ancestors together. One Undo removes that entire addition; Redo restores it. Every selected parent gets an asserted subclass relationship. Existing class names and aliases cannot be duplicated, and a class cannot be its own ancestor. An invalid choice anywhere in the addition leaves the ontology unchanged. The unsaved ontology change immediately triggers analysis, giving the new phrase its own highlight. Cancel leaves the ontology unchanged. Switching ontologies clears the form; a stale creation request cannot modify a different ontology or an older revision.

## Viewing matches in the graph

**View in Graph** opens a new graph containing every matched ontology entry and each direct parent path to its root. Repeated matches and shared ancestors appear once. All parent branches are retained when an entity has multiple parents. Existing graph views keep their contents. The graph includes the ancestor paths without expanding unrelated siblings or descendants.

The action uses the ontology version that produced the highlights. An ontology change invalidates old details and graph requests. If the complete ancestry exceeds the application's graph limit, the action reports that limit before creating a graph.

Ontology IDs determine navigation, including when the matched text is a synonym. If multiple namespaces share the same canonical identifier, the Details tab lists the corresponding entries and the graph includes them. Language-model annotations have their own details but no inferred ontology links. The graph button becomes available when at least one ontology entry is matched.

## Plus spans

A synonym such as `alpha+beta` defines a span. For example:

```turtle
:Pair a owl:Class;
    rdfs:label "pair";
    skos:altLabel "alpha+beta" .
```

`alpha blah blah beta` matches `pair`, and Axiom highlights the complete original phrase, including the intervening words. `beta blah blah alpha` also matches. A synonym in `rdfs:seeAlso` follows the same behavior.

The default distance is four token positions. With ordinary words and single spaces, zero to three intervening words match; four do not. The distance applies to the parser's tokens after earlier swaps. Punctuation and whitespace tokenization can affect that distance, and a multiword synonym already collapsed into one token counts as one. The reference also permits spans across punctuation and words such as `not`; the plus rule does not itself impose a sentence boundary or a negation constraint.

Endpoints can be canonical names produced by earlier matches. Canonical names come from entity identifiers, so the class `:renal_trauma` with `kidney injury` as a synonym can use `renal_trauma+acute` to recognize `kidney injury blah acute`. Nested swap history supplies the complete original highlight. The original engine also generates spans for multiword canonical names such as `research_methods`.

These semantics are checked against the original Python implementation, including its distance boundary, reverse order, repeated endpoints and nested swaps. The view calls mutatoc's full parser automatically as text changes.

## Runtime

The view uses mutatoc 0.2.1 through its persistent `--serve` interface. Ontology matching and LingPatLab processing run in C. The supplied spaCy model runs through mutatoc's retained Python worker. Text is processed locally. The first analysis includes model startup; later requests reuse the process and model. No LingPatLab Python package is required.

Axiom exports the current dataset to Turtle when the dataset version changes. It loads that Turtle into mutatoc using class-based live matching. Unchanged ontology versions reuse the loaded graph. The built-in Pizza example supplies its vocabulary graph and the labels shown in the entity editor. Its generated order and customer tables are excluded from that vocabulary. Imported ontologies supply their complete RDF, including individual labels and custom annotations.

Source positions come from the original tokens retained in mutatoc's swap history. Axiom accounts for the tokenizer's literal abbreviation and contraction expansions using dictionaries obtained from mutatoc. It converts the positions to JavaScript UTF-16 offsets while retaining original spacing, line breaks and emoji. An unrecognized transformation produces an error and clears the highlights rather than guessing a position.

## Development and packaging

Extract the complete Windows mutatoc 0.2.1 package, then run:

```powershell
npm run setup:mutatoc -- D:\git\mutatos\mutatoc\dist\mutatoc-win-x64-0.2.1
npm start
```

Setup verifies the package's SHA-256 manifest and copies its files into `vendor/mutatoc`, which is excluded from Git. The normal local directory arrangement above is detected automatically. `AXIOM_MUTATOC_HOME` can select a different extracted package directory.

`npm run package` verifies and bundles the complete runtime in `resources/mutatoc`, outside Electron's application archive. That includes Python, the model, worker scripts and their licenses. The installed application needs no system Python installation. A clean build machine must receive the extracted mutatoc package before packaging; the runtime is not downloaded automatically or stored in this repository.

A missing runtime is reported in the view without substituting a different NLP engine. A failed process is discarded, and the next edit starts a fresh one. Closing Axiom closes the C process and its model workers.

## Verification

The dedicated suite runs 310 tests. It includes 168 recorded expectations generated by the original Python Mutato repo, then checked through Axiom's RDF import, ontology export, native parser, canonical text and original highlight offsets. The corpus covers plus synonyms in both annotation properties, nested synonyms and ordinary multiword spans. Other tests cover protocol framing, Unicode, process errors, timeouts, queue replacement, ontology changes, stale results, source positions, empty graphs and tokenizer dictionaries. Navigation tests cover exact native identifiers, namespace collisions, multiple-parent paths, cycles, individual types, property ancestry, deep hierarchies and graph limits.

Twenty-three desktop journeys exercise typing, clipboard paste, colors, light/dark accessibility, unsaved edits, restart, ontology switching, plus-span distance boundaries, source selection across line breaks, Details accessibility, editing through the shared Details view, ambiguous canonical names, detached Details reuse and new ancestry graphs. They also cover independent docking, resizing, closing, restart, detached-window editing, keyboard and context-menu authoring, multiple suggested and manually chosen parents, recursive parent creation, existing-parent reuse, duplicate detection, cancellation at different depths, atomic undo/redo, immediate highlighting and stale-request rejection.

```powershell
npm run typecheck
npm run test:text-analysis
npm test
npm run build
npx playwright test tests/e2e/text-analysis.spec.ts
```

`test:text-analysis` fails if the native executable is missing, so its success cannot silently omit the C integration cases. General `npm test` runs can skip native tests on machines without the package. Install the complete runtime before using the dedicated command.

The reference fixtures record the source revision, relevant source hashes and model versions. Regenerate them only with the original Python dependencies installed:

```powershell
python scripts/generate-text-analysis-reference.py --mutato D:\git\mutatos\mutato
```

The generator imports that source tree directly and never uses mutatoc to create expected results. See [the fixture provenance](../tests/fixtures/text-analysis/README.md) for the covered contracts.

[Performance measurements](text-analysis-performance.md) describe the 0.2.1 optimizations and the reproducible benchmark.
