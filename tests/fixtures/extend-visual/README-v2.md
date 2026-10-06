# Row extend: recording a synonym or creating a related entity from a result row

**Purpose:** Specify the control that lets an author act on an entity from the row they found it in: record the current query as a synonym of it, or create a new entity related to it. One control, never one button per action.

**Status:** Normative. Revision 2, incorporating the approved changes in issues #49, #55 and #56. Revision 1 remains pinned in `tests/fixtures/extend-visual/visual-reference.html`; Revision 2 is pinned separately as `visual-reference-v2.html`.

**Requirement ID prefix owned:** `EXT`

**Verified free:** `EXT` collides with nothing. The prefixes in use across the spec tree are `FND` (`specs/find`), `QLY` (`specs/quality`) and `SUG` (`specs/add-children`).

---

## 0. How to read this document

### 0.1 Citation tags

Every factual claim carries its source. A claim with no tag is this document asserting on its own authority, which should not happen; report it as a defect here.

| Tag | Means |
| --- | --- |
| `[user]` | A direct instruction from the product owner. Highest authority. |
| `[docs: find-similarity.md]` | Stated in that file, which describes shipped behaviour. |
| `[docs: issues47-48-validation.md]` | A validation log naming passing tests. It is what makes the above evidence rather than intent. |
| `[docs: <file>]` | Stated in that file under `docs/`. |
| `[proto: find.html]` | Observed by reading the prototype. A rendering decision, not an authority. |
| `[new]` | A judgment with no source behind it. Argue with these first. |

### 0.2 Precedence

1. `[user]`. A direct instruction supersedes every document, including this one.
2. `[docs: find-similarity.md]`, where `[docs: issues47-48-validation.md]` names a passing test for the same behaviour. That pairing is evidence of what is built.
3. Other documents under `docs/`.
4. This document.
5. `[proto: find.html]`.

**EXT-1** Where this document and `find.html` disagree, this document MUST be treated as correct and the prototype as the defect. Every such disagreement MUST appear in Appendix B.1.

**EXT-2** Where this document and `docs/find-similarity.md` disagree, the divergence MUST appear in Appendix B.2 with the superseded sentence quoted and the superseding authority named. A silent divergence is a defect here.

**EXT-3** Requirement numbering is append only. A requirement MUST NOT be renumbered, and a withdrawn one MUST be marked withdrawn in place rather than deleted.

---

## 1. Scope

**EXT-4** This document specifies one control: the action cluster that sits on a result row and acts on that row's entity.

**EXT-5** It MUST NOT specify search, scope, counts, ranking, paging, the zero state, or the remedy ladder. Those belong to `specs/find`.

**EXT-6** It MUST NOT specify the entity editor's internals. It specifies only what each door into that editor prefills, and the one capability extension of section 7.3.

**EXT-7** The control is specified as a **component**, not as a Find feature. The Hierarchy pane and the Details ancestry region present entity rows with the same affordances, and specifying this inside a surface document is how views drift apart. `[new]` Find is the first adopter; section 9.4 states what a second adopter MUST keep.

---

## 2. Revision 1 history and retained behavior

This section exists because the prototype was built before the shipped behaviour was read, and it diverged in two ways that matter.

### 2.1 The shipped row action

**EXT-8** `docs/find-similarity.md` states: *"The row action is labeled **+ Synonym**: it adds the query as `rdfs:seeAlso` on that existing entity."* `docs/issues47-48-validation.md` names the passing tests, including synonym undo and redo, so this is built behaviour.

**EXT-9** The synonym action MUST therefore assert **the current query**, in one press, with no field and no typing. The value is already on screen; asking the author to retype it is a regression.

**EXT-10** `[proto: find.html]` opens an inline text field instead. That is a divergence, recorded in Appendix B.1, and the most consequential one in this document.

### 2.2 Creation as a separate action

**EXT-11** Revision 1 quoted the then-current Find document: *"New-class creation and adding a synonym remain separate actions."* Creation was on *"the quiet **+** beside the graph action"* in the results header. That header door still opens the shared editor with the title-cased query; the row creation doors were added by #49 and #55.

**EXT-12** `[user]` supersedes that sentence for **placement only**: the product owner asked for `+ Instance` and `+ Subclass` alongside the existing synonym action, managed as one control rather than as further standing buttons.

**EXT-13** Co-location is not conflation. Each action MUST still write its own triple, carry its own label, and be separately undoable. The sentence the instruction supersedes is about where the actions live, not about merging them.

**EXT-14** The header `+` of EXT-11 MUST be retained. Section 6.2 gives both doors their own job rather than replacing one with the other.

---

## 3. The control

### 3.1 Anatomy

**EXT-15** The control MUST be one cluster per row, occupying one trailing cell of the row, in a column of its own.

**EXT-16** It MUST be a split control: a main button carrying the default action, and one adjoining chevron opening a menu of the rest.

```
Psychology              Class    Psyc, Psych, PSY     [+ Synonym][v]
```

**EXT-17** The cluster MUST NOT present one standing button per action. Three standing pills across a full page of rows is roughly 280 CSS pixels of permanent chrome per row taken from the entity name and its path. `[new]`

**EXT-18** The chevron MUST be absent, not disabled, when the row's entity offers no relation. A split control with an empty menu is a control that lies about what it can do.

### 3.2 The quiet reveal

**EXT-19** The cluster MUST be hidden at rest.

**EXT-20** It MUST be revealed on any of: row hover, row focus within, row selection, and while its own menu is open.

**EXT-21** Its width MUST be reserved while hidden, so that revealing it never reflows the row or the table.

**EXT-22** Where no fine pointer exists, the cluster MUST stand rather than hide, because a coarse pointer has no hover and would otherwise never reach it.

**EXT-23** Hiding MUST use a mechanism that preserves layout. Removing the cluster from flow and restoring it on hover is a defect against EXT-21.

### 3.3 The split weighting

**EXT-24** The main button MUST carry the action that **annotates the row's entity in place**. The menu MUST carry the actions that **create a new entity**.

**EXT-25** The reason MUST be preserved in any later change: annotating is cheap, reversible and common, and creating writes a new subject into the ontology. The common action gets one press; the ones that create take a deliberate second.

**EXT-26** The weighting MUST NOT be inverted to make the actions symmetric. They are not symmetric.

### 3.4 Space budget

**EXT-27** Per presentation, in CSS pixels:

| Presentation | Column width | Cluster |
| --- | --- | --- |
| Expanded and Shallow | 148 | Main button with its label, plus chevron |
| Narrow and Narrow-and-shallow | 44 | One menu button, label withdrawn |

**EXT-28** The cluster MUST NOT exceed one row's height. It MUST NOT wrap to a second line at any presentation.

**EXT-29** The row MUST NOT grow to accommodate the cluster. If the cluster does not fit the row's existing height, the presentation is wrong, not the row.

---

## 4. The relation matrix

**EXT-30** The menu's contents MUST be **derived from the row entity's own type**. It MUST NOT be a fixed list filtered at press time.

**EXT-31** The matrix:

| Row entity | Menu offers | Asserts |
| --- | --- | --- |
| Class or defined class | Subclass | `rdfs:subClassOf` |
| Class or defined class, except `owl:Thing` | Sibling | `rdfs:subClassOf` to the row's named parents |
| Class or defined class | Instance | `rdf:type` |
| Property | Subproperty | `rdfs:subPropertyOf` |
| Individual | nothing | |
| Unclassified | nothing | |

**EXT-32** An individual MUST NOT be offered Subclass or Instance. An individual has no subclasses and no instances; offering either asserts a triple that is not well formed.

**EXT-33** A property MUST be offered Subproperty and MUST NOT be offered Subclass. A property is specialised with `rdfs:subPropertyOf`, not subclassed.

**EXT-34** A relation the entity cannot hold MUST be **absent**, never present and disabled. A disabled item invites the author to work out why; an absent one states the fact by its absence, and EXT-18 removes the chevron entirely when nothing remains.

**EXT-35** Every menu item MUST name the predicate it will assert, beside its label, in the monospace face reserved for predicates and IRIs.

**EXT-36** An expanded split menu MUST carry, once per menu rather than once per item, what the actions produce: a new class, a new individual, a new property. A folded menu uses the entity name alone as its header and omits this caption, as approved in #49. This exception also applies when an unavailable synonym leaves only the folded menu button in an expanded pane.

**EXT-37** The menu MUST name the row entity it acts under, so a menu opened from the wrong row is visible before it is used.

```
+------------------------------------+
| Under Psychology                   |
| Subclass          rdfs:subClassOf  |
| Sibling           rdfs:subClassOf  |
| Instance                 rdf:type  |
| ---------------------------------- |
| creates a new class, or a new      |
| individual                         |
+------------------------------------+
```

---

## 5. Synonym

**EXT-38** The main button MUST be labelled `+ Synonym`. `[docs: find-similarity.md]`

**EXT-39** Pressing it MUST assert the **current query** as `rdfs:seeAlso` on the row's entity. `[docs: find-similarity.md]`

**EXT-40** It MUST NOT open a field, a dialog, an editor or an overlay. One press, one triple.

**EXT-41** The action MUST be unavailable when any of the following holds, and unavailability MUST be expressed by withdrawing the button rather than disabling it where the whole cluster would then be empty:

| Condition | Why |
| --- | --- |
| The query is empty | There is no value to assert |
| The query is an IRI | `[docs: find-similarity.md]` excludes IRIs from the parallel creation path; the same exclusion applies here `[new]` |
| The query is query syntax | Same source, same reasoning |
| The query is already recorded on that entity | The triple exists; asserting it again is a no op that would read as success |

**EXT-42** Where the synonym action is unavailable but the menu is not, the cluster MUST present the menu button alone, in the form section 9.2 gives the narrow presentation.

**EXT-43** After a successful assertion the entity MUST be findable by that term on the next search, because the synonym field is one the search reads. The loop closes where it started. `[new]`

**EXT-44** The result MUST be announced, naming the value and the entity, on a polite live region.

**EXT-45** Retained results from a completed search that are superseded by a running one MUST NOT accept the action until the current search completes. `[docs: find-similarity.md]` states that retained results *"cannot be selected, added as synonyms or sent to a graph until the current search completes"*.

---

## 6. The relation actions

### 6.1 What they do

**EXT-46** A relation action MUST open the entity editor with the relation and the target already applied, and MUST NOT create anything on its own. Creation is the author's act in the editor, not the menu's.

**EXT-47** The editor MUST open as an overlay over the results, without changing their page, selection or scroll. `[docs: find-similarity.md]`

**EXT-48** `Back to results` and Escape MUST close the editor and retain the draft for reopening. `[docs: find-similarity.md]`

### 6.2 Related doors, one editor

**EXT-49** There MUST be exactly one entity editor. The doors differ only in what they prefill.

| Door | Opens with | Source |
| --- | --- | --- |
| Header `+` | The title-cased query, no parent | `[docs: find-similarity.md]` |
| Row `Subclass` | That row as the parent | `[user]` |
| Row `Sibling` | The row's direct named taxonomy parents; exclude blank nodes, the row itself and `owl:Thing` | `[user: #55]` |
| Row `Instance` | That row as the asserted type | `[user]` |
| Row `Subproperty` | That row as the parent property; preserve its property kind | `[user: #49]` |

Sibling retains all named parents, including those exposed by a defined intersection. It does not copy anonymous restrictions. With no named parents it opens with an empty parent set and follows the `owl:Thing` fallback. Its draft remains keyed to the source row and the Sibling door, independently of Subclass and the other doors.

**EXT-50** The editor MUST NOT fork into variants per door. A second editor is the fragmentation this suite exists to prevent.

**EXT-51** The header `+` MUST remain available when rows exist, because it creates an entity that is **not** related to any one row. A row door cannot express that.

**EXT-52** Where a shallow pane withdraws the count strip, the header creation action MUST remain reachable under `More`. `[docs: find-similarity.md]` The row cluster is unaffected by that withdrawal, because it lives in the row rather than the strip.

### 6.3 The context line

**EXT-53** The editor MUST state which door was used, before anything is committed, naming the relation, the predicate and the target.

**EXT-54** The context line MUST distinguish the doors in words, not only by a prefilled field, and MUST describe the current draft after allowed edits. A prefilled parent that the author did not notice is how the wrong triple gets written.

| Door | Context line |
| --- | --- |
| Header `+` | Adding the search phrase |
| Subclass | New class, subclass of `<target>`, asserted with `rdfs:subClassOf` |
| Sibling | New class, sibling of `<row>`, under `<parents>`, asserted with `rdfs:subClassOf` |
| Instance | New individual, instance of `<target>`, asserted with `rdf:type` |
| Subproperty | New property, subproperty of `<target>`, asserted with `rdfs:subPropertyOf` |

**EXT-55** The name hint MUST name what is being created: a class, an individual or a property. One label cannot serve all three.

---

## 7. The editor contract

**EXT-56** This document does not restate the editor. It states only what the doors require of it.

### 7.1 Carried from the existing contract

**EXT-57** The label MUST follow the title-cased query until edited, and the subject IRI MUST follow the label until overridden. `[docs: find-similarity.md]`

**EXT-58** Labels MUST be limited to 256 characters and comments to 10,000. `[docs: find-similarity.md]`

**EXT-59** The collision check MUST read the **whole ontology**, regardless of the current search filters or result count. `[docs: find-similarity.md]` A zero result under a narrowed scope is not evidence of absence.

**EXT-60** Without a parent, a class MUST be added under `owl:Thing`. `[docs: find-similarity.md]`

### 7.2 Required of the row doors

**EXT-61** A row door MUST prefill the relation target from the row, and that target MUST be visible and changeable in the editor rather than hidden state.

**EXT-62** Clearing the prefilled target MUST NOT silently convert the draft into a different kind of entity. It MUST either retain the kind and fall back per EXT-60, or state what it will do.

**EXT-63** A row door MUST NOT allow the target to be the subject being created. A self referential relation is not well formed.

### 7.3 The declared capability extension

**EXT-64** Revision 1 extended the then class-only editor with individuals. The current shared editor supports classes, individuals and object, data and annotation properties, as implemented for #49. The `Instance` door requires genuine individual creation, not a class with a different prefill.

**EXT-65** This is a capability extension, not a prefill change, and it MUST be declared as such rather than assumed. An implementation that cannot create individuals MUST withhold the `Instance` item rather than open an editor that will produce a class.

**EXT-66** When creating an individual, the asserted relation MUST be `rdf:type` to the target class, and MUST NOT be written as `rdfs:subClassOf`.

**EXT-67** The same applies to `Subproperty`: an implementation that cannot create properties MUST withhold the item.

---

## 8. Menu behaviour

**EXT-68** At most **one** menu MUST be open across all rows.

**EXT-69** A press outside the menu MUST close it.

**EXT-70** Escape MUST close it and return focus to the chevron that opened it.

**EXT-71** Closing the menu MUST NOT alter the row selection, the page, or the scroll position.

**EXT-72** Pressing a row action MUST NOT also select the row underneath it. The action and the selection are different intents.

**EXT-73** Opening a menu on one row MUST close any menu open on another, without acting on either row.

**EXT-74** The menu MUST be anchored to its chevron and MUST NOT be a centred dialog. A dialog for a short relation menu is a modal interruption for a local choice.

---

## 9. Presentations

### 9.1 Thresholds

**EXT-75** The control MUST follow the published presentation policy of `docs/adaptive-pane-ux.md`: thresholds at **600** width and **400** height, with exits at **616** and **416**, under the names `Expanded`, `Narrow`, `Shallow` and `Narrow and shallow`.

**EXT-76** No threshold other than those MUST appear. `[proto: find.html]` carries 720 and 1100 width and 520 and 820 height tiers, which `specs/find` already records as a defect. This document does not adopt them.

**EXT-77** The presentation MUST use the shared measured pane rectangle and hysteresis described in `docs/adaptive-pane-ux.md`, never viewport media queries or a second set of independent breakpoints. React and CSS MUST use that same presentation state. The static reference's container queries illustrate entry thresholds only; the running application owns hysteresis.

### 9.2 The narrow collapse

**EXT-78** Below the width threshold the split MUST fold into **one** menu button carrying every available action, including Synonym.

**EXT-79** The folded button MUST retain an accessible name that names the entity, not only the verb.

**EXT-80** The folded menu MUST list Synonym first, separated from the relation actions, preserving the weighting of EXT-24 by order where it can no longer be expressed by position.

### 9.3 Below recovery

**EXT-81** In recovery the retained row list is hidden and inert. Its controls MUST be absent from the visible and interactive surface, including any already open native popover. Entering recovery MUST close the row menu without transferring focus back into inert content.

### 9.4 A second adopter

**EXT-82** A surface adopting this control MUST keep: the derived matrix of section 4, the quiet reveal of 3.2, the split weighting of 3.3, and the one editor rule of EXT-49.

**EXT-83** A surface adopting this control MAY change the default action on the button face, where a different in place annotation is the common one for that surface. It MUST NOT put a creating action on the face.

---

## 10. Keyboard and accessibility

**EXT-84** Every part of the cluster MUST be reachable by keyboard alone, in the row's reading order, with a visible focus state.

**EXT-85** Required bindings:

| Key | Action |
| --- | --- |
| `Tab` | Into the cluster, main button then chevron |
| `Enter` or `Space` on the main button | Record the synonym |
| `Enter` or `Space` on the chevron | Open the menu |
| `Escape` with the menu open | Close it, return focus to the chevron |

**EXT-86** The chevron MUST expose its expanded state and MUST declare that it opens a menu.

**EXT-87** Every icon only control MUST carry an accessible name naming the entity: `More ways to extend Psychology`, not `More`.

**EXT-88** The control MUST NOT rely on colour to distinguish the main button from the chevron. They are distinguished by shape, border and glyph.

**EXT-89** Focus MUST remain visible against both themes, each audited independently.

---

## 11. Undo

**EXT-90** A recorded synonym MUST be **one undoable edit**, matching the synonym undo and redo coverage named in `docs/issues47-48-validation.md`.

**EXT-91** A created entity MUST be one undoable edit, carrying its relation assertion with it. Undoing the creation MUST NOT leave the relation triple behind.

**EXT-92** Undo MUST NOT be offered as a confirmation step before the action. The actions are cheap and reversible; a confirmation dialog on each would cost more than the mistake. `[new]`

---

## 12. Copy catalogue

Strings carry stable identifiers. An implementation MUST NOT display copy outside this catalogue, except for entity labels, predicates and the query itself.

| ID | String |
| --- | --- |
| `ext.synonym` | `+ Synonym` |
| `ext.synonym.title` | `Add {query} as a synonym of {entity}` |
| `ext.synonym.done` | `{query} added to {entity}` |
| `ext.synonym.exists` | `{entity} already records {query}` |
| `ext.more` | `More ways to extend {entity}` |
| `ext.menu.under` | `Under {entity}` |
| `ext.menu.folded` | `{entity}` |
| `ext.item.subclass` | `Subclass` |
| `ext.item.sibling` | `Sibling` |
| `ext.item.instance` | `Instance` |
| `ext.item.subproperty` | `Subproperty` |
| `ext.menu.creates.class` | `creates a new class` |
| `ext.menu.creates.individual` | `creates a new individual` |
| `ext.menu.creates.class-or-individual` | `creates a new class, or a new individual` |
| `ext.menu.creates.property` | `creates a new property` |
| `ext.ctx.header` | `Adding {query} from your search` |
| `ext.ctx.subclass` | `New class, subclass of {target}, asserted with rdfs:subClassOf` |
| `ext.ctx.sibling` | `New class, sibling of {row}, under {parents}, asserted with rdfs:subClassOf` |
| `ext.ctx.instance` | `New individual, instance of {target}, asserted with rdf:type` |
| `ext.ctx.subproperty` | `New property, subproperty of {target}, asserted with rdfs:subPropertyOf` |
| `ext.hint.class` | `The label the class will carry.` |
| `ext.hint.individual` | `The label the individual will carry.` |
| `ext.hint.property` | `The label the property will carry.` |
| `ext.created` | `{label} added as a {noun} {under} {target}` |
| `ext.created.root` | `{label} added under owl:Thing` |
| `ext.busy` | `Finishing the current search` |
| `ext.back` | `Back to results` |

The catalogue governs the extension control, context and acknowledgement, not unrelated editor fields and validation messages (EXT-6). Empty class targets use `owl:Thing`; missing individual/property targets remain visibly invalid until chosen. When a Sibling draft changes to another supported kind, its context uses that kind's current relation sentence rather than continuing to promise a class or `rdfs:subClassOf`.

**EXT-93** `ext.synonym.title` and `ext.menu.under` MUST NOT be shortened to drop the entity name. Both exist so the author can tell which row the control belongs to before acting.

---

## 13. Constants

No constant appears only in prose.

| Constant | Value | Source |
| --- | --- | --- |
| Presentation thresholds | 600 width, 400 height | `[docs: adaptive-pane-ux.md]` |
| Presentation exits | 616, 416 | `[docs: adaptive-pane-ux.md]` |
| Column width, Expanded and Shallow | 148 | EXT-27 |
| Column width, folded | 44 | EXT-27 |
| Open menus, maximum | 1 | EXT-68 |
| Label limit | 256 characters | `[docs: find-similarity.md]` |
| Comment limit | 10,000 characters | `[docs: find-similarity.md]` |
| Parent fallback | `owl:Thing` | `[docs: find-similarity.md]` |
| Busy announcement floor | 300 milliseconds | `[docs: find-similarity.md]` |
| Minimum action target | 24 by 24 CSS pixels at 100% pane zoom | EXT-104 |
| Separator height | 1 CSS pixel, with 3 pixels margin above and below | EXT-105 |
| Popup viewport inset | 8 unzoomed viewport pixels on each side | EXT-99 |

---

## 14. Registration

**EXT-94** The spec suite has no index at present; the original `specs/README.md` with its prefix registry was deleted with the rest of the tree.

**EXT-95** When an index is reinstated, these rows register this document:

| Row type | Text |
| --- | --- |
| Prefix registry | `EXT` · Row extend: recording a synonym or creating a related entity from a result row · `specs/extend/README.md` |
| Document map | `specs/extend/` · The row action cluster. Relation matrix, quiet reveal, the synonym contract, the related doors into one editor |
| Reading order | After `specs/find`, which owns the surface this control first appears on |

**EXT-96** Registration MUST NOT silently edit `specs/README.md` or other specs. The rows above are for the owner to apply. Explicitly authorized revisions to this row-extend specification are recorded by revision and issue, without renumbering requirements.

---

## Appendix A. Native stack mapping (non-normative)

Nothing here is normative. The body above is framework neutral.

**A.1 Reveal.** Reserve the width and toggle visibility rather than display, so EXT-21 holds. Put the hiding behind a fine pointer query so EXT-22 holds without a second code path.

**A.2 Menu.** Anchor to the chevron inside a positioned ancestor. A plain positioned element with an explicit dismiss handler works regardless of the Chromium version in the shell; the native popover API is a later simplification, not a requirement.

**A.3 Delegation.** Handle the cluster's presses **before** the row select branch, and return, so EXT-72 holds without the row handler needing to know the cluster exists.

**A.4 Prototype symbols.** For an implementer reading `find.html` alongside this document: the matrix is `extensions(e)` returning `{ kind, label, pred, cap }`; the relation table is `REL` keyed `sub`, `inst`, `subp`; the cluster is `rowActions(e)` emitting `.rowact` with `.ra-main` and `.ra-more`; open state is `state.menuFor`; the doors run through `openAdd(phrase, rel)`; and the presses are delegated on `data-syn`, `data-menu` and `data-ext`.

---

## Appendix B. Divergences

### B.1 `find.html` against this document

The prototype is the defect in every row.

| # | Divergence | Requirement | Severity |
| --- | --- | --- | --- |
| 1 | `+ Synonym` opens an inline text field for the author to type a value. The shipped action asserts the current query in one press. | EXT-9, EXT-39, EXT-40 | **Blocking.** A regression against built and tested behaviour. |
| 2 | The synonym action has no unavailability rules: it is offered on an empty query, on an IRI, and when the value is already recorded. | EXT-41 | High |
| 3 | The editor cannot create individuals, so the `Instance` door produces a class under a parent rather than an individual of a type. | EXT-64 to EXT-66 | High |
| 4 | Width and height tiers at 720, 1100, 520 and 820 rather than the published 600 and 400 with their exits. | EXT-75, EXT-76 | Medium. Already recorded against the Find spec. |
| 5 | The header `+` creation door is absent; the prototype carries `Add entity` only at a zero result. | EXT-14, EXT-51 | Medium |
| 6 | The `More` overflow for a shallow pane is not implemented. | EXT-52 | Medium |
| 7 | No self reference guard on the prefilled target. | EXT-63 | Low |
| 8 | Retained results from a superseded search still accept the action. | EXT-45 | Low |

### B.2 Historical Revision 1 divergences against `docs/find-similarity.md`

These quotations describe the documents when Revision 1 was authored. The current Find documentation now covers the row menus, shared editor kinds and synonym withdrawal. The dispositions below are historical, not outstanding claims that the implementation lacks these capabilities. Issues #49, #55 and #56 and Revision 2 supersede them.

| # | Divergence | Disposition |
| --- | --- | --- |
| 1 | The doc states *"New-class creation and adding a synonym remain separate actions."* This document co-locates them in one split control. | Superseded by `[user]` for placement only, per EXT-12. EXT-13 keeps them separate actions in every other respect: separate triples, separate labels, separately undoable. The doc sentence is now stale on placement and should be edited, which this task has no authority to do. |
| 2 | The doc states *"The inline editor creates classes."* The `Instance` door needs individuals. | Declared as a capability extension in EXT-64, not assumed. EXT-65 requires the item to be withheld rather than silently producing a class. |
| 3 | The doc does not state a relation matrix, because no relation actions existed. | Added on `[user]` instruction, marked `[new]` where it goes beyond RDF's own constraints. |
| 4 | The doc does not state unavailability rules for the synonym action. | EXT-41 extends the creation path's documented IRI and syntax exclusions to the synonym action by analogy, marked `[new]`. |

### B.3 Left stale elsewhere

**EXT-97** Resolved in Revision 2: the historical placement sentence in B.2 row 1 has been superseded in `docs/find-similarity.md`. Its current wording includes the split control, relation doors and shared editor. This identifier is retained to preserve requirement history.

### B.4 Runtime requirements added by the #56 audit

**EXT-98** An open menu MUST follow its trigger after native pane resize, docking layout changes and pane zoom, even when the presentation name does not change. Position MUST be based on the final measured layout.

**EXT-99** Menu bounds MUST fit the owner window's available viewport at the current pane zoom, with an 8-pixel viewport inset. A constrained menu MUST wrap its content and scroll vertically as needed. Keyboard navigation MUST reveal the focused item by scrolling the menu alone, without moving the result list.

**EXT-100** Entering recovery MUST dismiss an open extension menu. Recovering the pane MUST return focus to a usable working control, without restoring an orphan menu.

**EXT-101** Dismissing a menu with an outside pointer press MUST preserve the clicked control's focus. Escape MUST return focus to the trigger. These are distinct focus policies.

**EXT-102** When successful synonym recording withdraws the focused action, focus MUST remain on the row or a surviving row control. The next Tab MUST continue in the row's reading order. This applies to class and individual rows, including the folded menu.

**EXT-103** Long or unbroken entity labels MUST remain readable in menu headers and editor contexts. They MUST wrap within the available width rather than paint outside the surface or silently lose identifying text.

**EXT-104** Each main, folded and adjoining dropdown target MUST be at least 24 by 24 CSS pixels at 100% pane zoom. The expanded action column remains 148 pixels; its dropdown target is 24 pixels wide and the control remains 26 pixels tall.

**EXT-105** Required menu separators MUST paint a visible rule: nonzero width and one CSS pixel of height, with three pixels of vertical margin on each side. A semantic separator with zero rendered area does not satisfy EXT-80.

**EXT-106** The editor context MUST name the actual current kind, relation predicate and effective target before creation, including after changing kind or clearing parents. An empty class parent set MUST name `owl:Thing`. A Sibling draft changed to an individual or property MUST stop claiming that it creates a class with `rdfs:subClassOf`.

**EXT-107** Verification MUST include real docked and detached app states in both themes, native resizing, supported minimum pane sizes, zoom, recovery, keyboard focus, long labels and edited drafts. Isolated control pixel comparisons alone are not sufficient. Expected visual images MUST come from the versioned independent HTML reference, never application screenshots.

---

## Appendix C. Evidence and provenance

Revision 1 was authored from the Find documents and historical prototype. Its original HTML remains immutable in `tests/fixtures/extend-visual/visual-reference.html`, SHA-256 `ccf5025880e27b2536c483574d533b5e58d3f2a032c59d84a95963d0ee55a881`.

Revision 2 incorporates the #56 requirement-by-requirement audit of the actual packaged application, extension component, editor context, shared pane policy, domain and desktop tests, and both theme renderings. The original historical `find.html` is not present in the audited workspace; Appendix B.1 records its historical defects rather than claiming they remain defects in Axiom.

The audit and screenshot evidence are in `artifacts/extend-audit-full`. Regression checks are in `tests/e2e/extend-audit.spec.ts`; the versioned visual reference and its provenance are in `tests/fixtures/extend-visual`. Implementation validation is recorded in `docs/issues56-validation.md`.

Both menus and individual/property creation run in the application and have screenshots and functional coverage. Native mixed-monitor DPI and physical screen-reader/touchscreen sessions are separate manual checks; emulated pointer media and pane zoom do not establish those results.

**House style.** No em dashes and no en dashes appear in this document, per a standing instruction. Separators are the middot, the colon and the period.
