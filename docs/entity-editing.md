# Entity editing and Find

In Details, a subclass parent uses the ontology resource picker. Typing `Enginee` offers Engineering; arrows and Enter or a mouse click select its actual IRI. A parent imported as a literal also uses this picker so it can be corrected. Changing a populated text row to `rdfs:subClassOf` preserves the text and offers matching classes. New unresolved parent text stays in the retained draft until a resource is chosen. Imported malformed assertions can remain unchanged while another field is edited.

Find selects the matching entity and reveals it in an open Hierarchy pane. It clears the hierarchy filter, selects Classes or Properties, expands the ancestor path and scrolls the selected row into view. This works in detached panes and keeps keyboard focus in Find. A closed Hierarchy pane stays closed.

Find's class-row menu offers Subclass, Sibling and Instance. Sibling opens a new class draft with every direct named parent of the row, leaving out anonymous restrictions and `owl:Thing`. Review or remove those parents before creating the class; an empty parent field creates it under `owl:Thing`. The context bar follows your edits, and one Undo removes the new class and its statements. Escape and Back to results retain separate drafts for each row and action. `owl:Thing` itself has no Sibling action. In an open menu, pressing S repeatedly cycles through matching items, including Synonym in narrow panes.

## Concurrent edits

Details, Inspector and an entity's scoped Source editor compare the loaded statements, the draft and the current ontology before saving. The worker merges them in the same operation that updates the entity, avoiding a gap between checking the version and applying the changes.

| Changes | Result |
| --- | --- |
| A comment edited while another view adds a parent | Both changes are saved. |
| Different parents added to the same class | Both parents are retained. |
| The same assertion added or removed twice | The result contains no duplicate assertion. |
| Different assertions removed or replaced | Independent changes are combined. |
| Different language variants or statement graphs edited | Each variant or graph retains its changes. |
| Separate, non-overlapping parts of a comment edited | Both text changes are combined. |
| The same value replaced differently, or replaced while another view deletes it | Saving stops with the affected predicate named; the draft remains available. |
| An anonymous expression deleted while its contents change elsewhere | Saving stops rather than losing the expression edit. |
| A different ontology opened while a save is pending | The old draft cannot change the new ontology. |

A save also retains typing that occurs while the request is in progress. Those later keystrokes are rebased onto the saved result, including changes merged from another view. Undo reverses the applied edit while retaining the other view's earlier work.

RDF terms retain their language, datatype and statement graph. Scoped Source editing preserves anonymous structures and references shared by other entities. Ambiguous anonymous replacements and overlapping text changes can still require review. Full-ontology Source replacement retains its separate document conflict checks.

## Regression coverage

`tests/domain/entity-merge.test.ts` exercises independent, identical and conflicting RDF edits, comment changes, functional properties and anonymous structures. `tests/domain/editor-drafts.test.ts` covers saves in progress, identifier changes, unresolved parent text, preserved conflicts and ontology switches. Entity Source tests exercise merging across all supported serialization formats and Undo.

The desktop suites `details-source.spec.ts` and `find.spec.ts` exercise the real resource picker, keyboard and mouse selection, detached windows, concurrent editor changes, stale worker requests, taxonomy scrolling and closed panes. The Text Analysis journeys also run because that view shares Details and the resource picker.

See [the verified Windows build and test results](entity-editing-validation.md).
