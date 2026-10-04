# Text Analysis

Open **View > Text Analysis** and type or paste plain text. Matching runs automatically after a 60 ms typing pause. The editor stays responsive while matching runs. Only the newest pending edit is parsed, and results from older edits cannot replace current highlights.

Matches use the currently open ontology, including unsaved changes already applied through Axiom's editors. Saving an RDF file is unnecessary. Editing the ontology triggers a new analysis of the same text. Named graphs contribute their union of asserted statements to matching; the original dataset remains unchanged.

Each canonical ontology entity has a stable background color. Synonyms share that color, so `Dog` and `canine` have the same highlight when the ontology defines that synonym. Highlights have no underline. Colors adapt to light and dark themes, and labels provide an alternative to color alone.

**View Summary** switches Text Analysis from editable text to the colored entity list and occurrence counts. **View Text** switches back. The editor stays mounted, retaining its selection, scroll position and Undo history. The chosen presentation survives restart. Summary and text share the same dockable tab.

Click a highlight or summary entry to open Axiom's existing **Details** view. Ontology matches select the actual entity and show the standard editable statements, source and ancestry navigation. The same tab is reused across matches, including when it is detached or has been renamed. A closed Details view reopens.

A summary entry also selects its first occurrence in the text and reopens the editor if needed. Alt+Enter opens Details at the cursor or for an exactly selected match. If several ontology entries share a canonical name, Details lists their identifiers so you can choose the intended entry. The normal Back control returns to the previously selected entity.

Text Analysis and Add entity share one analysis session. Moving a view to another window does not start another parser. Closing Text Analysis closes both its presentations; reopening it restores the saved presentation and text. Editing the ontology refreshes the normal Details editor and starts a new analysis. Text or ontology changes clear obsolete annotation information.

Highlights come from the open ontology. Mutatoc 0.5.0 does not supply spaCy annotations such as Person, Place or Organization; those words are highlighted only when the ontology itself matches them. A blank ontology produces no matches. The editor retains your text, supports Undo, Redo and Find, and saves its text with the workbench. Up to 100,000 characters can be analyzed at once.

While an editor context menu is open, underlined letters activate commands: **F** for Find, **A** for Add entity, **T** for Cut, **C** for Copy and **P** for Paste. Find and Add entity appear only when text is selected. The same letter-key support applies to the other editor menus. Escape dismisses the menu and returns focus.

## Adding a selected phrase

Select a phrase and choose **Add entity**, press Alt+Enter, or right-click and press **A**. The independent **Add entity** view retains the existing name, parents, description and source-context form. It has no Summary sub-tab. Use the workbench controls to resize, move, close, maximize or detach it. **View > Add entity** reopens a draft or starts a blank form without requiring selected text. Opening Text Analysis alone does not open Add entity. Unfinished class and parent drafts survive switching between text and Summary, opening a graph, and moving or detaching the Add entity view. Existing automatic Text Entities tab names migrate to Add entity while preserving numeric suffixes, custom names and pane positions.

The initial name uses title case: `Basic ENGLISH COMPOSITION` becomes `Basic English Composition`, and `PHD SEMINAR IN GIS` becomes `PhD Seminar in GIS`. Listed acronyms use their canonical spelling. Other all-uppercase or all-lowercase words are capitalized, with `a`, `an`, `and`, `at`, `by`, `for`, `in`, `of`, `on`, `or`, `the` and `to` lowercase inside a title. Mixed-case names such as `iPhone` and `McGraw` retain their spelling. Punctuation is preserved. The Context row retains the source phrase, and you can edit the name freely. This conversion runs only when a selection first opens Add entity; Find drafts and parent names you type keep their spelling.

For `Electronic Surveillance Systems`, an existing class named `Systems` becomes a suggested parent. Class names, labels and literal synonyms contribute suggestions. Longer matching phrases take priority, with a trailing phrase preferred when the lengths are equal. The best match starts selected. Each suggestion toggles independently, so `Computer Software Applications` can belong under both `Computing` and `Software`. **Add existing parent** uses the workbench's resource search to find additional classes. **Selected parents** lists every choice with a Remove button. With no parents selected, the class goes under Thing.

**Create new parent** opens a parent draft in the same view. Enter its name, select its parents, or create another parent from there. Each level offers the same suggestions and search. **Use new parent** returns to the child draft; **Edit** revisits a new parent's name, description and ancestry. If the name already identifies an existing class, **Use ... as parent** reuses that class. **Cancel parent**, or Escape inside a parent draft, discards that draft and returns to the child.

No classes are created until **Add class** saves the original class and all its new ancestors together. One Undo removes that entire addition; Redo restores it. Every selected parent gets an asserted subclass relationship. Existing class names and aliases cannot be duplicated, and a class cannot be its own ancestor. An invalid choice anywhere in the addition leaves the ontology unchanged. The unsaved ontology change immediately triggers analysis, giving the new phrase its own highlight. Cancel leaves the ontology unchanged. Switching ontologies clears the form; a stale creation request cannot modify a different ontology or an older revision.

## Viewing matches in the graph

**View in Graph** opens a new graph containing every matched ontology entry and each direct parent path to its root. Repeated matches and shared ancestors appear once. All parent branches are retained when an entity has multiple parents. Existing graph views keep their contents. The graph includes the ancestor paths without expanding unrelated siblings or descendants.

The action uses the ontology version that produced the highlights. An ontology change invalidates old details and graph requests. If the complete ancestry exceeds the application's graph limit, the action reports that limit before creating a graph.

Ontology IDs determine navigation, including when the matched text is a synonym. If multiple namespaces share the same canonical identifier, the Details tab lists the corresponding entries and the graph includes them. The graph button becomes available when at least one ontology entry is matched.

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

The view uses mutatoc 0.5.0 through its persistent `--serve` interface. Tokenization and ontology matching run locally in C. The runtime has no Python or spaCy dependency. Axiom checks the engine version before loading an ontology, and reports incompatible runtime overrides instead of attempting to interpret their results. Later requests reuse the process and loaded ontology.

Dotted synonyms such as `U.S. History to 1865` match the complete phrase. Periods remain part of the source text, and literal tildes remain literal. Exact matches tolerate repeated spaces, tabs and line breaks between words. The original whitespace remains inside the highlight. Long dotted names are no longer restricted by the old ten-token matching limit.

Punctuated synonyms such as `Well/Health/Physical Education`, `PE:PE`, `Calc (Honors)`, `Math Lab [Remedial]` and `Computer-Aided Manufacturing` also match as complete exact phrases. Spaces around their punctuation do not prevent a match. Highlights retain the complete original phrase, including its punctuation and whitespace, and navigate to the matched ontology entity. Plus-span rules remain unchanged.

Apostrophes and quotation marks of any form match alike, so `Driver’s Ed` in the text matches a synonym written `Driver's Ed`, and the reverse. The highlight keeps whichever character was typed. Contractions such as `can't` stay whole, and abbreviations such as `dept.` are matched as written rather than expanded. Text containing `dept.` therefore matches a Department class only when the ontology lists `dept.` or `dept` as one of its synonyms.

Axiom exports the current dataset to Turtle when the dataset version changes. It loads that Turtle into mutatoc using class-based live matching. Unchanged ontology versions reuse the loaded graph. The built-in Pizza example supplies its vocabulary graph and the labels shown in the entity editor. Its generated order and customer tables are excluded from that vocabulary. Imported ontologies supply their complete RDF, including individual labels and custom annotations. Mutatoc 0.5.0 can also read ontologies written as JSON or JSONL records, but Axiom continues to send Turtle (craigtrim/axiom#43).

Source positions come from mutatoc. Each match reports `x` and `y` as code point offsets into the text exactly as it was sent, and Axiom converts them to the JavaScript UTF-16 offsets the editor uses, so spacing, line breaks and emoji stay inside the right highlight. Axiom also checks that each range slices out exactly the text mutatoc matched. A range that does not produces an error and clears the highlights rather than marking a guessed position. Axiom keeps no copy of tokenizer data (craigtrim/axiom#40).

## Development and packaging

Download and extract the complete Windows package from the [Mutatoc 0.5.0 release](https://github.com/craigtrim/mutatoc/releases/tag/v0.5.0), then run:

```powershell
npm run setup:mutatoc -- D:\git\mutatos\mutatoc\dist\mutatoc-win-x64-0.5.0
npm start
```

Setup verifies the package's SHA-256 manifest and copies its files into `vendor/mutatoc`, which is excluded from Git. The normal local directory arrangement above is detected automatically. `AXIOM_MUTATOC_HOME` can select a different extracted package directory.

`npm run package` verifies and bundles the complete native package in `resources/mutatoc`, outside Electron's application archive. Its 28 manifested files include the executable, libraries, headers, documentation and licenses. Setup rejects obsolete packages and retired Python/model runtime directories. A clean build machine must receive the extracted mutatoc package before packaging; the runtime is not downloaded automatically or stored in this repository.

A missing runtime is reported in the view without substituting a different engine. A failed process is discarded, and the next edit starts a fresh one. Closing Axiom closes the C process.

The pinned native source revision is `0cb5d3770a02bad0eda5d0d1e14801dbaf1aa496`. The released Windows archive has SHA-256 `b94ecd62116e12ccccf59a22b4f0d7c6e81d77e83281589e3cd4db9cc84acd44`. Tokenization, matching and source positions are all native operations.

## Verification

Selected-name tests cover every entry in `src/shared/title-case-acronyms.json` in uppercase, lowercase and canonical spelling, including surrounding punctuation. The file contains 1,130 canonical entries, including Roman numerals II–XX, and 96 held-back entries such as `IT`, `OWL` and `STEM`. Dictionary checks reject duplicates, incorrect uppercase code-point ordering and overlap with held-back entries. Other cases cover function-word positions, mixed casing, Unicode, whitespace, unknown acronyms, parent suggestions and duplicate detection. Desktop tests exercise all three selection actions, saved names, verbatim Context, nested parent drafts, manual edits after remounting and Find handoffs.

The native matching tests include a 1,512-case punctuation matrix with independently calculated UTF-16 ranges, 135 punctuated-synonym variants across three annotation properties, and repeated-occurrence and near-miss checks. They also cover 168 recorded expectations generated by the original Python Mutato repo and checked through Axiom's complete matching path. Six explicitly identified whitespace cases report `exact` instead of the original `spans`; their canonical text and source offsets are unchanged. Other tests cover plus synonyms, nested matches, protocol framing, Unicode, process errors, timeouts, queue replacement, ontology changes, stale results, source positions, empty graphs, incompatible runtime versions, and all 89 words the 0.3.1 tokenizer used to rewrite, placed mid-text, at the end of the text and on a final line of their own. Navigation tests cover exact native identifiers, namespace collisions, multiple-parent paths, cycles, individual types, property ancestry, deep hierarchies and graph limits.

Desktop journeys exercise typing, clipboard paste, colors, light/dark accessibility, unsaved edits, restart, ontology switching, plus-span distance boundaries, source selection across line breaks, Details accessibility, editing through the shared Details view, ambiguous canonical names, detached Details reuse and new ancestry graphs. They also cover independent docking, resizing, closing, restart, detached-window editing, keyboard and context-menu authoring, multiple suggested and manually chosen parents, recursive parent creation, existing-parent reuse, duplicate detection, cancellation at different depths, atomic undo/redo, immediate highlighting and stale-request rejection.

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

[Performance measurements](text-analysis-performance.md) describe the native 0.3.0 runtime, earlier optimizations and the reproducible benchmark. Timing measurements are reported separately from functional tests.
