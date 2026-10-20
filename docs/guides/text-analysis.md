# Text Analysis

Open **View > Text Analysis** and type or paste plain text. **Auto** is on by default and runs matching after a 60 ms typing pause. Turn it off to edit without running matching. The last settled highlights stay visible and move with the text. They turn gray when text or ontology changes make the results **out of date**. Press **Analyze now** to refresh them. Turning Auto back on analyzes outstanding edits immediately. The switch supports Space and Enter and retains its state across restarts (craigtrim/axiom#79).

The 28 pixel action row contains Auto, the match count, the **Text | Summary** switch, **View in Graph** and **More actions**. Analyze now appears only with Auto off and is enabled when analysis is outstanding. Narrow panes move View in Graph into More actions first, then Text and Summary. The row is one tab stop; Left, Right, Home and End move between its controls. More actions contains **Add entity** and **Help**, with keyboard letters A and H. Overflowed Graph, Text and Summary use V, T and S. Escape or Tab closes the menu and restores focus to More actions.

An empty editor displays instructions without adding them to the text. Help opens the same instructions in a dismissible sheet at the bottom of the editor. The sheet closes when the pane becomes shallow. Below the shared recovery limits, the pane retains its editor and offers **Maximize pane**.

With Auto off, reopening Text Analysis, restarting Axiom, and editing or switching ontologies do not start matching. Analyze now, View in Graph, or choosing a retained match explicitly analyzes the current text. Text is saved after a typing pause and captured before closing the view or saving the workspace. Editing remains available during analysis, and results for an earlier edit cannot replace the current results.

Matches use the currently open ontology, including unsaved changes already applied through Axiom's editors. Saving an RDF file is unnecessary. With Auto on, editing the ontology triggers a new analysis of the same text. The last settled highlights, match count and Summary legend stay visible until that analysis completes, then update together. Named graphs contribute their union of asserted statements to matching; the original dataset remains unchanged.

Each canonical ontology entity has a stable background color. Synonyms share that color, so `Dog` and `canine` have the same highlight when the ontology defines that synonym. Highlights have no underline. Six fixed tints adapt to light and dark themes, and labels provide an alternative to color alone. Only the match under the caret has an outline. A range selection or leaving the editor clears that outline.

**Summary** switches Text Analysis from editable text to the colored entity list and occurrence counts. **Text** switches back. The editor stays mounted, retaining its selection, scroll position and Undo history. The chosen presentation survives restart. Summary and text share the same dockable tab.

Ctrl+click a highlight to open Axiom's existing **Details** view. A plain click places the caret and keeps focus in the editor (#128). Ctrl+clicking a gray highlight or choosing a stale Summary row shows **Analyzing first.** and opens Details only if that entity still matches. Ontology matches select the actual entity and show the standard editable statements, source and ancestry navigation. The same tab is reused across matches, including when it is detached or has been renamed. A closed Details view reopens.

A summary entry also selects its first occurrence in the text and reopens the editor if needed. Alt+Enter opens Details at the cursor or for an exactly selected match in either mode. Any other selected phrase opens Add entity. If several ontology entries share a canonical name, Details lists their identifiers so you can choose the intended entry. The normal Back control returns to the previously selected entity.

Text Analysis and Add entity share one analysis session. Moving a view to another window does not start another parser. Closing Text Analysis closes both its presentations; reopening it restores the saved presentation and text. With Auto on, editing the ontology refreshes the normal Details editor and starts a new analysis while retaining the displayed matches. Ctrl+clicking a retained highlight, pressing Alt+Enter or choosing a Summary entry waits for the current analysis and opens Details only if the entity still matches. Both modes refresh outdated results before navigation. Switching ontologies clears the old matches immediately.

Highlights come from the open ontology. Mutatoc 0.5.2 does not supply spaCy annotations such as Person, Place or Organization; those words are highlighted only when the ontology itself matches them. A blank ontology produces no matches. The editor retains your text, supports Undo, Redo and Find, and saves its text with the workbench. Up to 100,000 characters can be analyzed at once.

While an editor context menu is open, underlined letters activate commands: **F** for Find, **A** for Add entity, **T** for Cut, **C** for Copy and **P** for Paste. Find and Add entity appear only when text is selected. The same letter-key support applies to the other editor menus. Escape dismisses the menu and returns focus.

## Adding a selected phrase

Select a phrase and choose **More actions > Add entity**, press Alt+Enter, or right-click and press **A**. **View > Add entity** reopens the retained draft or starts a blank form. The separate view supports Class and Individual, with a single action row above the form and a footer below it (craigtrim/axiom#93).

The initial name uses title case: `Basic ENGLISH COMPOSITION` becomes `Basic English Composition`, and `PHD SEMINAR IN GIS` becomes `PhD Seminar in GIS`. Listed acronyms retain their canonical spelling, including `OWL`, `XSD` and `MPNet`. Mixed-case words such as `iPhone` and `McGraw` retain their spelling. The Context row keeps the original phrase. Subsequent name edits stay exactly as typed; **More actions > Re-run the title case conversion** explicitly restores the conversion of that original phrase. Find opens the same form with its query and a Context row beginning **from your search**.

For `Electronic Surveillance Systems`, an existing class named `Systems` starts as a parent chip. Class names, labels and complete literal aliases contribute to this choice. Longer matching phrases take priority, with a trailing phrase preferred when lengths are equal. Remove a chip with its close button or type in **Add a parent** to select another class. The picker uses the same ranked search as Find, including prefixes, typo tolerance and semantic enrichment. `Abstract Course`, `AbstractCourse`, `abstract-course` and `Abstract_Course` find the same class. It shows at most six classes and offers **Draft a new parent named ...** when the text does not normalize to an existing class. Arrow keys wrap through the choices. Enter waits for the current lookup; Escape clears only that picker. Unselected picker text does not block creation.

A drafted parent appears as a chip marked **(new)** and a nested row. Its own picker can select existing classes or draft further ancestors. These rows remain beside the original form, with each level indented. Removing a drafted parent's chip removes its entire branch. A class without selected parents goes under `owl:Thing`. An individual uses its selected classes as asserted types.

The Comment field writes an English language comment. Additional statements offer `skos:altLabel`, `skos:prefLabel`, `rdfs:seeAlso`, `skos:definition` and `dc:source`. A comma inside a value remains part of one literal. Use separate statements for separate aliases. The planned RDF/XML source updates as you type and includes every drafted ancestor before its child. It appears beside the form from 860 pixels wide when the pane is not shallow. **Copy the planned source** works at every usable size.

Findings appear above the form. Existing class names and aliases block creation and offer **Reveal** to open the actual Find result. An occupied IRI also blocks creation, including an IRI used only in a statement. The IRI is the ontology namespace plus the shared identifier derived from the name, without a silently added suffix. Punctuation and whitespace warnings leave Create available. Pending checks retain the last settled feedback; Create waits for a current successful check. Failed checks remain visible until a subsequent check succeeds.

**Create**, **Create both**, or **Create all** writes the root and every drafted ancestor in one transaction. Labels and comments are English language literals. One Undo removes the whole addition and Redo restores it. A failure anywhere leaves the ontology unchanged. The completed form remains visible, its new parents become ordinary chips, and the root is selected in Hierarchy. With Auto on, the ontology change refreshes Text Analysis; manual mode waits for Analyze now.

**Find existing** searches the draft's name without discarding it. **Discard draft** returns to a blank form. At smaller widths, Discard draft moves into More actions before Find existing. The name, kind, comments, statements, parent branches and unfinished picker text survive resizing, recovery, detaching, switching to Text Analysis, saving and restarting. Switching ontologies clears the old form; a stale creation request cannot modify another dataset or revision.

## Viewing matches in the graph

**View in Graph** opens a new graph containing every matched ontology entry and each direct parent path to its root. Repeated matches and shared ancestors appear once. All parent branches are retained when an entity has multiple parents. Existing graph views keep their contents. The graph includes the ancestor paths without expanding unrelated siblings or descendants.

The action stays available with stale results in either mode. It shows **Analyzing first.**, analyzes the current text, then builds the graph from the fresh matches. Further text edits or ontology changes cancel a waiting action. If the complete ancestry exceeds the application's graph limit, the action reports that limit before creating a graph.

Ontology IDs determine navigation, including when the matched text is a synonym. If multiple namespaces share the same canonical identifier, the Details tab lists the corresponding entries and the graph includes them. If the fresh analysis has no ontology matches, the action leaves existing graphs unchanged.

## Plus spans

A synonym such as `alpha+beta` defines a span. For example:

```turtle
:Pair a owl:Class;
    rdfs:label "pair";
    skos:altLabel "alpha+beta" .
```

`alpha blah blah beta` matches `pair`, and Axiom highlights the complete original phrase, including the intervening words. `beta blah blah alpha` also matches. A synonym in `rdfs:seeAlso` follows the same behavior.

The default distance is four token positions. With ordinary words, zero to three intervening words match; four do not. Every word of a span must fall within the distance, so a three-word label cannot stretch across unrelated text by leaving one of its words far away (craigtrim/axiom#52). The distance applies to the parser's tokens after earlier swaps. Punctuation takes a position, while extra spaces, tabs and line breaks take none, so a word at the end of one line and a word at the start of the next can form a span. A multiword synonym already collapsed into one token counts as one, and a repeated word counts at the occurrence closest to the rest of the span. The reference also permits spans across punctuation and words such as `not`; the plus rule does not itself impose a sentence boundary or a negation constraint.

Endpoints can be canonical names produced by earlier matches. Canonical names come from entity identifiers, so the class `:renal_trauma` with `kidney injury` as a synonym can use `renal_trauma+acute` to recognize `kidney injury blah acute`. Nested swap history supplies the complete original highlight. The original engine also generates spans for multiword canonical names such as `research_methods`.

These semantics are checked against the original Python implementation, including its distance boundary, reverse order and nested swaps. For repeated endpoints, Mutatoc 0.5.2 uses the closest occurrence where the Python implementation used the last one. The view calls mutatoc's full parser automatically with Auto on and through an explicit analysis or navigation action in manual mode.

## Runtime

The view uses mutatoc 0.5.2 through its persistent `--serve` interface. Tokenization and ontology matching run locally in C. The runtime has no Python or spaCy dependency. Axiom checks the engine version before loading an ontology, and reports incompatible runtime overrides instead of attempting to interpret their results. Later requests reuse the process and loaded ontology.

Dotted synonyms such as `U.S. History to 1865` match the complete phrase. Periods remain part of the source text, and literal tildes remain literal. Exact matches tolerate repeated spaces, tabs and line breaks between words. The original whitespace remains inside the highlight. Long dotted names are no longer restricted by the old ten-token matching limit.

Punctuated synonyms such as `Well/Health/Physical Education`, `PE:PE`, `Calc (Honors)`, `Math Lab [Remedial]` and `Computer-Aided Manufacturing` also match as complete exact phrases. Spaces around their punctuation do not prevent a match. Highlights retain the complete original phrase, including its punctuation and whitespace, and navigate to the matched ontology entity. Plus-span rules remain unchanged.

A comma inside a synonym is part of that synonym (craigtrim/axiom#76). `rdfs:seeAlso "Culture, Media Studies"` matches the whole phrase once; it does not make `Culture` or `Media Studies` separate synonyms for that class. Add entity uses the same whole-literal rule for existing names and parent suggestions. To supply several aliases, use separate literals, such as `skos:altLabel "platforms", "frameworks"`. This applies to labels, seeAlso, altLabel and inflection values. Axiom uses Mutatoc 0.5.2's default behavior and does not enable its legacy `comma_lists` option. Ontologies that previously packed aliases into one comma-separated literal need separate values to retain those individual aliases.

Apostrophes and quotation marks of any form match alike, so `Driver’s Ed` in the text matches a synonym written `Driver's Ed`, and the reverse. The highlight keeps whichever character was typed. Contractions such as `can't` stay whole, and abbreviations such as `dept.` are matched as written rather than expanded. Text containing `dept.` therefore matches a Department class only when the ontology lists `dept.` or `dept` as one of its synonyms.

Axiom exports the current dataset to Turtle when the dataset version changes. It loads that Turtle into mutatoc using class-based live matching. Unchanged ontology versions reuse the loaded graph. The built-in Pizza example supplies its vocabulary graph and the labels shown in the entity editor. Its generated order and customer tables are excluded from that vocabulary. Imported ontologies supply their complete RDF, including individual labels and custom annotations. Since 0.5.0, Mutatoc can also read ontologies written as JSON or JSONL records, but Axiom continues to send Turtle (craigtrim/axiom#43).

Source positions come from mutatoc. Each match reports `x` and `y` as code point offsets into the text exactly as it was sent, and Axiom converts them to the JavaScript UTF-16 offsets the editor uses, so spacing, line breaks and emoji stay inside the right highlight. Axiom also checks that each range slices out exactly the text mutatoc matched. A range that does not produces an error and clears the highlights rather than marking a guessed position. Axiom keeps no copy of tokenizer data (craigtrim/axiom#40).

## Development and packaging

Download and extract the complete Windows package from the [Mutatoc 0.5.2 release](https://github.com/craigtrim/mutatoc/releases/tag/v0.5.2), then run:

```powershell
npm run setup:mutatoc -- D:\git\mutatos\mutatoc\dist\mutatoc-win-x64-0.5.2
npm start
```

Setup verifies the package's SHA-256 manifest and copies its files into `vendor/mutatoc`, which is excluded from Git. The normal local directory arrangement above is detected automatically. `AXIOM_MUTATOC_HOME` can select a different extracted package directory.

`npm run package` verifies and bundles the complete native package in `resources/mutatoc`, outside Electron's application archive. Its 29 manifested files include the executable, libraries, headers, documentation and licenses. Setup rejects obsolete packages and retired Python/model runtime directories. A clean build machine must receive the extracted mutatoc package before packaging; the runtime is not downloaded automatically or stored in this repository.

A missing runtime is reported in the view without substituting a different engine. A failed process is discarded, and the next edit starts a fresh one. Closing Axiom closes the C process.

The pinned native source revision is `b444429c77c872c8bbb5aa7171501c96c27f9685`. The released Windows archive has SHA-256 `3f789ff86cea39b3e06d4dca53f604f33bbfc2cfc7f32c032def4f826320d8ea`. Tokenization, matching and source positions are all native operations.

## Verification

Selected-name tests cover every entry in `src/shared/title-case-acronyms.json` in uppercase, lowercase and canonical spelling, including surrounding punctuation. The file contains 1,130 canonical entries, including Roman numerals II–XX, and 96 held-back entries such as `IT`, `OWL` and `STEM`. Dictionary checks reject duplicates, incorrect uppercase code-point ordering and overlap with held-back entries. Other cases cover function-word positions, mixed casing, Unicode, whitespace, unknown acronyms, parent suggestions and duplicate detection. Desktop tests exercise all three selection actions, saved names, verbatim Context, nested parent drafts, manual edits after remounting and Find handoffs.

The native matching tests include a 1,512-case punctuation matrix with independently calculated UTF-16 ranges, 135 punctuated-synonym variants across three annotation properties, and repeated-occurrence and near-miss checks. They also cover 168 recorded expectations generated by the original Python Mutato repo and checked through Axiom's complete matching path. Six explicitly identified whitespace cases report `exact` instead of the original `spans`; their canonical text and source offsets are unchanged. Two explicitly identified repeated-word cases use the closest occurrence instead of the last, which shortens one span and finds one the reference missed. Other tests cover plus synonyms, three-word labels held to the span distance in prose and in a pasted list, nested matches, protocol framing, Unicode, process errors, timeouts, queue replacement, ontology changes, stale results, source positions, empty graphs, incompatible runtime versions, and all 89 words the 0.3.1 tokenizer used to rewrite, placed mid-text, at the end of the text and on a final line of their own. Navigation tests cover exact native identifiers, namespace collisions, multiple-parent paths, cycles, individual types, property ancestry, deep hierarchies and graph limits.

Desktop journeys exercise typing, clipboard paste, colors, light/dark accessibility, unsaved edits, restart, ontology switching, plus-span distance boundaries, source selection across line breaks, Details accessibility, editing through the shared Details view, ambiguous canonical names, detached Details reuse and new ancestry graphs. They also cover independent docking, resizing, closing, restart, detached-window editing, keyboard and context-menu authoring, multiple suggested and manually chosen parents, recursive parent creation, existing-parent reuse, duplicate detection, cancellation at different depths, atomic undo/redo, immediate highlighting and stale-request rejection.

```powershell
npm run typecheck
npm run test:text-analysis
npm test
npm run build
npm run test:desktop -- tests/e2e/text-analysis.spec.ts
```

`test:text-analysis` fails if the native executable is missing, so its success cannot silently omit the C integration cases. General `npm test` runs can skip native tests on machines without the package. Install the complete runtime before using the dedicated command.

The reference fixtures record the source revision, relevant source hashes and model versions. Regenerate them only with the original Python dependencies installed:

```powershell
python scripts/generate-text-analysis-reference.py --mutato D:\git\mutatos\mutato
```

The generator imports that source tree directly and never uses mutatoc to create expected results. See [the fixture provenance](../../tests/fixtures/text-analysis/README.md) for the covered contracts.

[Performance measurements](../development/text-analysis-performance.md) describe the native 0.3.0 runtime, earlier optimizations and the reproducible benchmark. Timing measurements are reported separately from functional tests.
