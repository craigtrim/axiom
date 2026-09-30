# Axiom: Text Entity Create

**Purpose:** This document specifies the Add entity view, the form in which a phrase selected in Text Analysis becomes a new class in the open ontology, together with any parents it is placed under and any parents that have to be created to place it.

**Status:** Normative. [`visual-reference.html`](visual-reference.html) is descriptive and owns no requirements.

**Requirement ID prefixes owned:** `TEC`

---

## The reference implementations

This document has two sources and separates them deliberately, because one is what the product does today and the other is what it is specified to do.

> **The behavioural source of truth for the specified design is an HTML prototype:**
>
> `C:\Users\Craig\AppData\Roaming\Open Design\namespaces\release-stable-win\data\projects\f44d45f4-5cd5-4a3f-82fa-fe522d950280\entity.html`
>
> One self-contained file, 1,025 lines. It is **read-only**. Never edit it, move it, reformat it, or run it as part of implementing this document. A verbatim copy is held beside this document as [`visual-reference.html`](visual-reference.html).

> **The current shipped build is the Electron renderer:**
>
> `src/renderer/TextEntityCreate.tsx`, 495 lines, with its draft types in `src/renderer/text-analysis-session.ts` and its authoring service in `src/domain/text-analysis-authoring.ts`.

The prototype is a redesign of the current build's layout and control set. It is not a reimplementation of its machinery: it holds no Store, makes no IPC call and has no dataset epoch. Where the prototype is silent about machinery, **the current build wins and this document records its behaviour as a requirement**. Where the two disagree about layout, control set, copy or interaction, **this document and the prototype win, and the current build is a defect to be repaired**.

### Citation convention

Two citation namespaces are in use, which is a departure from [`README.md`](../README.md#4-citing-the-reference-implementation).

| Form | Names a symbol in | Example |
|---|---|---|
| `[src: ...]` | the prototype, in the five shapes the suite registers | `[src: comboOptions()]`, `[src: .chips]`, `[src: --accent]` |
| `[cur: ...]` | the current Electron build, qualified by file where it is not `TextEntityCreate.tsx` | `[cur: parentConfirmed]`, `[cur: text-analysis-session.ts TextEntityDraft]` |

Every citation of either kind names a symbol that exists in the named file and was read before the sentence carrying it was written. A `[cur: ...]` citation is a statement about behaviour that exists today. It is never used to support a statement about the specified design.

### House style deviations

This document uses no em dash character, on the author's instruction, following [`add-children/README.md`](../add-children/README.md#house-style-deviations). Two suite conventions are affected:

1. The appendix heading is `Appendix A. Native stack mapping (non-normative)` rather than the form given in [`README.md`](../README.md#1-heading-structure).
2. Where sibling documents set off a clause with an em dash, this document uses a colon, a comma or a full stop.

The prototype's own copy was brought into line with that rule before the copy catalogue below was written, so that every string in the catalogue is quoted verbatim and none of them carries the character.

British English is used throughout, as the suite requires, in this document's own prose. Product copy and identifiers are quoted exactly as they are and are never corrected.

---

## Scope

The Add entity view occupies the lower pane of the Text Analysis workspace, beneath the text being analysed. It takes one **Phrase**, selected in the text above, and produces one class in the Store, placed under zero or more parents, any of which MAY itself be a class that does not exist yet.

### In scope

The layout, the control set, the state machine, the validation gates, the commit semantics, the keyboard model and every user-facing string of the Add entity view and its sibling Summary view.

### Out of scope

Named so that their absence is deliberate rather than an omission:

1. **Text Analysis itself.** The matching of text against the ontology, the highlight colours, the match count and the timing readout belong to the upper pane. The prototype draws that pane at reduced fidelity, as context for the pane below and as the source of the selection link. It is not specified here and MUST NOT be implemented from the prototype.
2. **The assistant call.** Provider selection, prompt construction, the catalogue encoding, the request limit and the failure modes are specified in [`parent-suggestions.md`](../parent-suggestions.md). This document specifies only where the assistant sits in this view, what its result does to this view's controls, and what it is forbidden from doing.
3. **The Taxonomy reveal.** `Open <label> in Taxonomy` hands off to the class tree specified in [`30-class-tree-and-inspector.md`](../30-class-tree-and-inspector.md). What that surface does on arrival is its own concern.
4. **The write into the Store.** The triples a commit produces, and its undo entry, are the concern of [`11-data-model-and-store.md`](../11-data-model-and-store.md). This document specifies the shape handed to the writer and the order of the writes, not the writer.
5. **Properties and individuals.** This view creates classes only.

### Relationship to the rest of the suite

**TEC-1** This view defines no design tokens. Every visual value MUST come from [`40-design-system.md`](../40-design-system.md) through the binding table in [Token bindings](#token-bindings), and an implementation MUST NOT copy the prototype's literals.

**TEC-2** This view defines no general-purpose components. Tab strip, Command bar, Button, Segmented control, Text field, Chip, Select field and Splitter MUST come from [`41-component-library.md`](../41-component-library.md). This document specifies only the composites that do not already exist there: the Context row, the Parents region, the Parent combobox, the Existing-class notice and the pinned Action footer.

**TEC-3** A commit from this view mutates the hierarchy that [`30-class-tree-and-inspector.md`](../30-class-tree-and-inspector.md) presents. The view MUST NOT hold a private copy of that hierarchy across a commit: after a commit it MUST read the Store again before offering any class as a parent.

---

## Terminology

Used exactly as defined, and never aliased.

| Term | Meaning |
|---|---|
| **Phrase** | The run of text selected in Text Analysis that a Draft begins from |
| **Draft** | The whole in-progress creation: a stack of Frames |
| **Frame** | One class being edited: its name, its description and its parent choices |
| **Frame stack** | The ordered list of Frames. The last is the one on screen |
| **Root Frame** | The first Frame in the stack: the class the Phrase names |
| **Nested Frame** | Any Frame after the first: a parent being created for the Frame beneath it |
| **Parent choice** | One entry in a Frame's parent list: either an existing class by IRI, or a whole nested class to be created |
| **Created parent** | A Parent choice of the second kind |
| **Preview** | The service response for a Frame's current name: the existing classes it collides with, the parents matched from the Phrase, and a default parent |
| **Commit** | The single write that creates the Root Frame's class and every Created parent under it |

---

## What this design replaces

Non-normative. It is recorded because the shape of the specified view is a direct answer to a specific failure, and an implementer who does not know the failure will drift back into it.

The current build asks one question, *what are this class's parents*, through five separate controls, stacked vertically in a pane that is wide and short:

| Region | Control | Citation |
|---|---|---|
| Suggested parents from the phrase | a row of toggle buttons | `[cur: legend>Suggested parents from the phrase (select any)]` |
| Selected parents | a list with Edit and Remove per row | `[cur: legend>Selected parents]` |
| Add existing parent | a label and a `ResourceInput` | `[cur: className=text-parent-input]` |
| Create new parent | a button taking the search field's current text | `[cur: createParent()]` |
| Assistant suggestions | `DraftParentSuggestions`, its own panel with its own list | `[cur: DraftParentSuggestions]` |

Four consequences follow, and all four are visible in the screenshots the redesign was drawn from:

1. The answer to one question is scattered across five places, so the user has to read all five to know what the answer currently is.
2. The five regions are tall, the pane is short, and the description field and the commit action are pushed below the fold. The action the whole form exists to reach is the least reachable thing in it.
3. `Create new parent` takes its text from the search field beside a different control, so its label does not say what it will create and its enabled state does not say whether it will do anything.
4. Nesting is invisible. Creating a parent pushes a new Frame that reuses the same form `[cur: createParent()]`, and the only sign of it is one line of prose `[cur: className=text-parent-context]`.

The specified view answers the question once: one chip list showing the current answer, and one combobox under it through which every route to a parent arrives. The five regions become four groups in one dropdown `[src: comboOptions()]`.

---

## Data contract

### The Draft

**TEC-4** A Draft MUST be a stack of Frames and nothing else `[cur: text-analysis-session.ts TextEntityDraft]`. It carries no separate notion of "the class being added": that is the first element of the stack.

```
Draft          = { frames: Frame[] }
Frame          = { value: Class, editIndex?: integer }
Class          = { label: string, comment: string, parents: ParentChoice[], manualParents: boolean }
ParentChoice   = ExistingParent or CreatedParent
ExistingParent = { iri: string }
CreatedParent  = { create: Class }
```

**TEC-5** A Draft MUST be initialised with exactly one Frame whose `label` is the Phrase, whose `comment` is empty, whose `parents` is empty and whose `manualParents` is false `[cur: newClass()]`.

**TEC-6** `label` MUST be limited to 256 characters and `comment` to 10,000 `[cur: maxLength]` `[src: #f-name]` `[src: #f-desc]`. Both limits MUST be enforced at the input, not at commit.

**TEC-7** A Draft MUST survive the view being closed and reopened within the same Text Analysis session, and MUST be handed back on reopen `[cur: changeDraft()]` `[cur: text-analysis-session.ts updateDraft()]`. Selecting a different Phrase MUST discard the Draft and start a new one `[src: startDraft()]`.

**TEC-8** `manualParents` MUST become true the moment the user changes the parent list by any route `[cur: setParents()]`, and MUST NOT be set by the arrival of a Preview.

### The default parent

**TEC-9** While `manualParents` is false, each arriving Preview MUST replace the Frame's parent list with the Preview's `defaultParent`, or with the empty list when that default is `owl:Thing` `[cur: next.defaultParent]`. The default is the first parent the authoring service matched from the name `[cur: text-analysis-authoring.ts defaultParent]`.

**TEC-10** Once `manualParents` is true an arriving Preview MUST NOT alter the parent list, even when the name has changed and the previous default no longer matches. A user who has touched the parents owns them.

### The parent list

**TEC-11** A parent list MUST NOT contain the same IRI twice. Deduplication MUST happen at the point of addition, not at commit `[cur: addParent()]` `[cur: finishParent()]`. In the specified view an IRI already in the list MUST NOT be offered in the combobox at all `[src: comboOptions()]`, so the duplicate is unreachable rather than rejected.

**TEC-12** Two Created parents carrying the same label MUST be permitted to coexist, because they are two independent drafts until they are written and the user MAY be mid-edit on one of them. The offer to create is suppressed instead: see TEC-50.

**TEC-13** An empty parent list at commit MUST be written as the single parent `owl:Thing` `[cur: classInput()]`. The list MUST NOT be written empty and the commit MUST NOT be rejected for it.

**TEC-14** TEC-13 is a silent substitution, and this view MUST NOT leave it silent. Both the empty state of the parents region and the footer note MUST state the destination in words: see TEC-39 and TEC-23.

### The Preview

**TEC-15** A Preview MUST be requested for the current Frame's name, debounced by 120ms after the last keystroke `[cur: setTimeout]`, and MUST be discarded rather than applied if the name changed while it was in flight `[cur: current]`.

**TEC-16** A Preview MUST carry: the normalised label it was computed for, the Store version, the dataset epoch, the list of existing classes the label collides with, the list of parents matched from the Phrase, and the default parent `[cur: TextAnalysisDraft]`.

**TEC-17** A Preview MUST be treated as stale, and every commit path MUST be closed, unless all four of these hold `[cur: valid]`:

1. its label equals the Frame's label with runs of whitespace collapsed and the ends trimmed,
2. its Store version equals the current Store version,
3. its dataset epoch equals the current dataset epoch,
4. it reports no existing collision.

**TEC-18** An empty or whitespace-only name MUST NOT produce a Preview request `[cur: if (!value.label.trim()) return]`.

---

## Surface anatomy

The view is the lower of two panes. Both panes are specified here only as far as this view depends on them.

```
+-----------------------------------------------------------------------+
| Text Analysis            (upper pane, out of scope: TEC scope item 1) |
+=======================================================================+  <- Splitter
| Text Entities_5 | Details_6                        [pop] [maximise]   |  Tab strip
+-----------------------------------------------------------------------+
| [ Summary | Add entity ]                                  View Text   |  Toolbar
+-----------------------------------------------------------------------+
| Adding from selection   Introduction to [American Music]              |  Context row
+---------------------------------+-------------------------------------+
| CLASS                           | PARENTS                             |
|  Name                           |  [ Music x ] [ Fine Arts x ]        |  Form, two columns
|  [American Music            ]   |  [ Search classes, or type... ]     |
|                                 |    [ Claude v ][ Suggest ]          |
|  Description                    |  Uses your installed Claude...      |
|  [                          ]   |                                     |
+---------------------------------+-------------------------------------+
| Adding under Thing.                          [ Cancel ] [ Add class ] |  Action footer
+-----------------------------------------------------------------------+
```

**TEC-19** The pane MUST be laid out as four fixed bands and one flexible region, in this order: tab strip, toolbar, Context row, form, Action footer `[src: .pane]` `[src: .entity-body]`. The form is the only region that MAY scroll. The Context row and the Action footer MUST remain visible at every supported size and MUST NOT scroll with the form.

**TEC-20** The form MUST be laid out in two columns at widths above the fold breakpoint: the class identity in the first, the parents region in the second `[src: .form]`. The first column MUST have a minimum of 280px and a maximum of 400px; the second MUST take the remaining width.

**TEC-21** Below the fold breakpoint the form MUST fold to one column, identity first `[src: @media (max-width: 900px)]`. No other layout change is permitted at that breakpoint: no control is withdrawn and no label is shortened.

**TEC-22** The two panes MUST be separated by a draggable Splitter with a keyboard model `[src: #splitter]`. The lower pane MUST be given at least 22% and at most 78% of the window height, MUST default to 52%, and Enter MUST restore that default `[src: set()]`.

**TEC-23** The Action footer MUST carry, on the leading edge, a note that states the consequence of committing right now, and on the trailing edge the cancel action then the commit action, in that order `[src: footer()]`. The note MUST be one of exactly three states:

| Condition | Note |
|---|---|
| Nested Frame | `Saved together with <root label> when you add it.` |
| Root Frame, no parents chosen | `Adding under Thing.` |
| Root Frame, at least one parent | empty |

**TEC-24** The commit action MUST be the only visually primary control in the view `[src: .btn--primary]`. No other control in the pane may take that treatment, including the assistant.

**TEC-25** The toolbar MUST carry a two-way segmented control, `Summary` and `Add entity`, and it MUST reflect which view is showing rather than acting as a pair of independent buttons `[src: #mode-summary]` `[src: #mode-add]`.

**TEC-26** `Add entity` MUST be disabled when there is no Draft in progress, and when the Draft belongs to a superseded dataset epoch `[cur: TextEntitiesPanel.tsx disabled]`. A Draft begins from a selection in the text above, never from the tab. The prototype instead starts a Draft from the last Phrase when the tab is pressed `[src: #mode-add]`; that is a prototype convenience so that the view has something to show, and it is not specified.

---

## The Context row and the frame stack

The Context row answers one question that the current build leaves to inference: *what am I adding, and where am I*.

**TEC-27** On a Root Frame the Context row MUST show the label `Adding from selection` followed by the source line of text with the Phrase marked within it `[src: contextRow()]`. The surrounding words MUST be shown, not just the Phrase: the Phrase alone does not tell the user which of several matches they clicked.

**TEC-28** The mark MUST use the same highlight treatment the text pane above uses for that phrase, so that the two panes agree visually `[src: .context-phrase mark]`.

**TEC-29** Where the Phrase cannot be located in the source line, the Context row MUST fall back to the Phrase alone and MUST NOT show an unmarked line `[src: contextRow()]`.

**TEC-30** On a Nested Frame the Context row MUST be replaced by a breadcrumb: an activatable crumb naming the Frame one level down, a separator, and the word `new parent` `[src: .crumb]`. Activating the crumb MUST discard the Nested Frame and return to the Frame below it.

**TEC-31** The breadcrumb MUST be the view's only depth indicator, and the depth it shows MUST be one level, not a count. The current build prints `(level N)` `[cur: className=text-parent-context]`; that is a number the user cannot act on and MUST NOT be reproduced.

**TEC-32** Pushing a Nested Frame MUST reset the combobox text, the active option and any assistant result, and MUST NOT reset the Frame below it `[src: chooseOption()]`.

**TEC-33** Cancelling a Nested Frame MUST discard only that Frame `[cur: cancel()]` `[src: footer()]`. Cancelling a Root Frame MUST discard the whole Draft and return to the Summary view `[src: footer()]`.

---

## The class identity column

**TEC-34** The name field MUST be a single-line text field, labelled `Name`, autofocused when a Draft starts, and constrained to 256 characters `[src: #f-name]`.

**TEC-35** The name field MUST be no wider than 340px and the description no wider than 400px `[src: .field--name input]` `[src: .field--desc textarea]`. The constraint is deliberate: a field's width is a statement about how much text belongs in it, and a 900px-wide name field invites a sentence.

**TEC-36** The description MUST be a multi-line field labelled `Description`, three rows tall, vertically resizable, capped at 10,000 characters, and carrying the placeholder `Optional` `[src: #f-desc]`. The word `(optional)` MUST NOT be appended to the label: the placeholder carries it.

**TEC-37** A name validation failure MUST be shown inline, beneath the field, with the field marked invalid, and MUST be cleared on the next keystroke `[src: .err]` `[src: .field[data-invalid]]`. The error text for an empty name MUST be `A class needs a name.`

---

## The parents region

One region, three parts, in this order: the chip list that states the current answer, the combobox through which every parent arrives, and one line of help under it `[src: parentsRegion()]`.

### The chip list

**TEC-38** The chip list MUST be the only place in the view that states which parents are currently chosen. No other control may carry a selected or pressed state that means the same thing.

**TEC-39** When the list is empty it MUST NOT render as a blank box. It MUST carry an information glyph and the text `No parent chosen. Will be added under Thing`, with `Thing` set in the monospace face to mark it as an identifier rather than a word `[src: .chips-empty]`.

**TEC-40** Each chip MUST carry the parent's label and a remove control. The remove control MUST be reachable by keyboard, MUST carry an accessible name of the form `Remove <label>`, and MUST remove that one parent without confirmation `[src: parentChips()]`.

**TEC-41** A Created parent's chip MUST be visually distinct from an existing class's chip by two signals, not one: a dashed border and the trailing word `new` `[src: .chip[data-new]]` `[src: .chip-note]`. Colour alone MUST NOT carry the distinction.

**TEC-42** The chip list MUST wrap and grow. It MUST NOT scroll horizontally, MUST NOT truncate a label, and MUST NOT cap the number of chips shown. A parent the user cannot see is a parent they cannot remove.

**TEC-43** The chip list MUST reserve its height when empty, so that the combobox beneath it does not move as the first chip arrives `[src: .chips]`.

### The combobox

**TEC-44** One combobox MUST be the entry point for every parent, by every route: matched from the Phrase, suggested by an assistant, searched for among existing classes, or created new `[src: comboOptions()]`. An implementation MUST NOT reintroduce a separate control for any one route.

**TEC-45** Options MUST be grouped, and the groups MUST appear in this order:

| Order | Group header | Contents |
|---|---|---|
| 1 | `From the phrase` | Classes whose label occurs as a whole word in the Phrase |
| 2 | `Suggested by <assistant>` | The last assistant result, named by the assistant that produced it |
| 3 | `Existing classes` | Every other class in the ontology, filtered by the typed text |
| 4 | `Create` | The single offer to create the typed text as a new class |

**TEC-46** A group with no items MUST be omitted entirely, header included `[src: comboOptions()]`. An empty group header is a statement that something is missing, and nothing is.

**TEC-47** Group 1 MUST match on word boundaries, not on substrings `[src: comboOptions()]`. `Music` matches the phrase `American Music`; `Mus` does not.

**TEC-48** Groups 1 and 2 MUST NOT repeat in group 3, and no group may offer a class already in the chip list `[src: comboOptions()]`.

**TEC-49** Group 3 MUST be capped at 8 items `[src: rest.slice(0, 8)]`. The cap exists so that typing narrows the list rather than scrolling it. An implementation MAY raise the cap but MUST NOT remove it, and MUST NOT report the cap in the list: the user's next keystroke is the remedy, not a count.

**TEC-50** Group 4 MUST be offered only when all three of these hold `[src: comboOptions()]`:

1. the combobox contains non-empty text,
2. no existing class has that label, compared case-insensitively on the trimmed text,
3. no Created parent already in the chip list has that label.

**TEC-51** The create option MUST state what it will create, by quoting the typed text inside its own label: `Create "<text>" as a new parent` `[src: parentsRegion()]`. The current build's `Create new parent` button MUST NOT be reproduced: it takes text from a field beside a different control and its label never says what it will do.

**TEC-52** Every option that names an existing class MUST show, on the trailing edge, that class's IRI with the ontology namespace collapsed to a leading colon, in the monospace face `[src: .lb-meta]`. Two classes with the same label in different namespaces MUST be distinguishable without hovering.

**TEC-53** When no option matches, the list MUST show `No class matches that. Keep typing to create one.` rather than closing `[src: .lb-empty]`. Closing on no match hides the one route still open.

**TEC-54** Choosing an existing class MUST add its chip, clear the typed text, and return focus to the combobox `[src: chooseOption()]`. The list MUST stay available for a second choice: choosing one parent is not a statement that the user is finished.

**TEC-55** Choosing the create option MUST push a Nested Frame seeded with the typed text `[src: chooseOption()]`, and MUST NOT add a chip at that point. The chip appears when the Nested Frame is committed: see TEC-79.

**TEC-56** The dropdown MUST be no wider than the combobox, MUST cap at 232px tall and scroll within that, and MUST be drawn above the form's own content `[src: .listbox]`.

**TEC-57** The dropdown MUST dismiss on blur, on Escape and on choosing an option, and MUST NOT dismiss on a pointer press that lands on an option `[src: onmousedown]` `[src: onblur]`. An option chosen with the pointer MUST be applied on press, not on release, so that the blur handler cannot swallow it.

### The assistant control

**TEC-58** The assistant MUST be a two-part control immediately beside the combobox: a provider select and one action `[src: .assist]`. It MUST NOT be a panel, a section or a separate list. `DraftParentSuggestions` as a region of its own MUST NOT be reproduced `[cur: DraftParentSuggestions]`.

**TEC-59** The provider select MUST offer the assistants Axiom is configured for, MUST carry the accessible name `Assistant`, and MUST use the existing CLI sign-in as specified in [`parent-suggestions.md`](../parent-suggestions.md). The prototype's fixture offers `Claude` and `Codex` `[src: parentsRegion()]`; the list is not fixed by this document.

**TEC-60** The result of a run MUST arrive as group 2 of the same combobox, under the name of the assistant that produced it `[src: comboOptions()]`. An assistant suggestion MUST NOT become a chosen parent without the user choosing it, which is the rule [`parent-suggestions.md`](../parent-suggestions.md) already states.

**TEC-61** Changing the provider MUST discard the previous result `[src: parentsRegion()]`. A suggestion attributed to the wrong assistant is worse than no suggestion.

**TEC-62** While a run is in flight the action MUST show a busy indicator and the text `Thinking…` and MUST be disabled `[src: runAssistant()]`. No other control in the view may be disabled by the run: the user MUST be able to keep typing, keep choosing parents and keep editing the description while the assistant works.

**TEC-63** On completion the dropdown MUST open and focus MUST return to the combobox `[src: runAssistant()]`, so the result is one keystroke from being used.

**TEC-64** The help line under the combobox MUST state which sign-in the assistant will use before a run, and where the results went after one `[src: .assist-help]`:

| Condition | Text |
|---|---|
| No result yet | `Uses your installed <assistant> sign-in. Suggestions appear in the same list.` |
| Result present | `<assistant> suggested <n> parents. They are in the list above, under its name.` |

**TEC-65** The busy indicator MUST respect the reduced-motion preference `[src: @media (prefers-reduced-motion: reduce)]`.

---

## The existing-class branch

When the name already belongs to a class, adding it is not a thing the user can do, and the form MUST stop offering to do it.

**TEC-66** When the Preview reports a collision, the form's two columns MUST be replaced by a single notice `[src: existingBranch()]`. The name field, the parents region and the description MUST NOT remain on screen beneath it: a form the commit gate has closed is an invitation to keep typing.

**TEC-67** The notice MUST name the class and state the consequence: `<label> already exists in this ontology. Adding it again would create a duplicate.` `[src: existingBranch()]`.

**TEC-68** The notice MUST show the colliding class's IRI in the monospace face, namespace collapsed, so that a label collision in a different namespace is visible `[src: existingBranch()]`.

**TEC-69** The notice MUST offer exactly one action, and which one depends on the Frame `[src: existingBranch()]` `[cur: openExisting()]`:

| Frame | Action | Effect |
|---|---|---|
| Root | `Open <label> in Taxonomy` | Select that class, close this view, reveal it in the class tree |
| Nested | `Use <label> as parent` | Discard the Nested Frame and add that class as a parent of the Frame below |

**TEC-70** The commit action MUST be absent from the footer in this branch, not merely disabled `[src: footer()]`. The cancel action MUST remain.

**TEC-71** A collision MUST be detected on the normalised name, matching the authoring service, and MUST clear as soon as the name is edited away from it `[cur: valid]` `[cur: nameKey()]`.

---

## Validation and the commit gate

Five conditions close the commit gate, and the current build already implements all five. The specified view keeps every one of them and changes only how they are shown.

**TEC-72** The commit action MUST be disabled unless all of the following hold:

| # | Condition | Citation |
|---|---|---|
| 1 | the name is non-empty after trimming | `[src: submit()]` |
| 2 | a Preview has arrived and is not stale, by TEC-17 | `[cur: valid]` |
| 3 | the Preview reports no collision | `[cur: valid]` |
| 4 | the name does not equal any ancestor Frame's name | `[cur: ancestor]` |
| 5 | no uncommitted text is sitting in the parent search | `[cur: parentConfirmed]` |

**TEC-73** Condition 4 MUST be reported, not merely enforced, with the text `A class cannot be its own ancestor. Choose a different parent name.` `[cur: className=validation-error]`.

**TEC-74** Condition 5 exists because text in the parent search is an intention the user has not finished expressing, and committing over it silently discards it. In the current build it is a boolean cleared by Escape or by a committed search `[cur: parentConfirmed]`. In the specified view the same hazard MUST be resolved the same way: while the combobox holds non-empty text the commit action MUST be disabled, and Escape MUST clear the text and re-open the gate.

**TEC-75** A disabled commit action MUST NOT be the only account of why it is disabled. For each of the five conditions the view MUST show its reason in the form, next to the thing that caused it: the name error under the name field, the ancestor error and the service error above the footer, the collision as the notice in TEC-66, and the pending search as the open dropdown itself.

**TEC-76** A service error MUST be shown verbatim, in an assertive live region, and MUST NOT be summarised or replaced with a generic message `[cur: setError()]`.

**TEC-77** While a commit is in flight the commit action MUST show `Adding…` and every field MUST be disabled `[cur: busy]`. A second commit MUST be impossible while the first is pending `[cur: pending]`.

**TEC-78** Escape anywhere in the view, when not busy and not already handled by an open dropdown, MUST cancel the current Frame `[cur: onKeyDown]` `[src: onkeydown]`. Escape MUST be handled by the dropdown first when one is open, and MUST NOT both close the dropdown and cancel the Frame.

---

## Commit

**TEC-79** Committing a Nested Frame MUST NOT write anything. It MUST fold that Frame into the parent list of the Frame below it as a Created parent, and return there `[cur: finishParent()]` `[src: submit()]`. The commit action's label MUST say so: `Use as parent`, not `Add class`.

**TEC-80** Where the Nested Frame was opened to edit an existing Created parent, committing it MUST replace that parent in place, at its original index, rather than appending `[cur: editIndex]` `[cur: finishParent()]`.

**TEC-81** Committing the Root Frame MUST write the whole stack in one operation: the class itself, and every Created parent, at every depth, reachable from its parent list `[cur: classInput()]`. Partial writes MUST NOT be possible. The user is told this before they commit, by the footer note in TEC-23.

**TEC-82** The commit MUST carry the dataset epoch and the Store version the Preview was computed against, and MUST be rejected by the service if either has moved `[cur: textAnalysisCreate]`.

**TEC-83** After a successful commit the view MUST re-read the Store, MUST report the created IRI, its normalised label and its resulting parents to the Text Analysis session, and MUST NOT report the labels it sent `[cur: added()]`. The parents that were written are the answer; the parents that were requested are a guess.

**TEC-84** If the dataset epoch changed between sending the commit and reading the result, the view MUST discard the result rather than applying it to a different dataset `[cur: next.datasetEpoch !== datasetEpoch]`.

**TEC-85** After a successful commit the Draft MUST be discarded and the view MUST switch to the Summary view `[src: submit()]`. The form MUST NOT be left populated with a class that now exists.

---

## What a commit puts into the Summary view

Summary is the Text Entities panel's other view. It is not specified by this document, with one exception: what a commit from this view leaves behind in it.

**TEC-86** The Summary view's entity legend MUST be retained `[cur: TextEntitiesPanel.tsx className=text-analysis-legend]`. The prototype shows an `Added this session` list in its place `[src: summaryBody()]`; that is a stand-in for a view the prototype does not implement, and it MUST NOT replace the legend. A cumulative session list is not specified by this document.

**TEC-87** After a successful commit the Summary view MUST carry a confirmation naming what was written and where: `Added <label> under <parents, comma separated>.`, with each parent resolved to its label from the Store and falling back to its IRI when it has none `[cur: TextEntitiesPanel.tsx className=text-analysis-created]`.

**TEC-88** The confirmation MUST offer one action, `View in Taxonomy`, which reveals the created class in the class tree `[cur: TextEntitiesPanel.tsx revealInTaxonomy()]`.

**TEC-89** The confirmation MUST be withdrawn when the created class is no longer present in the Store `[cur: TextEntitiesPanel.tsx snapshot.entities.some()]`, so that an undo does not leave a claim behind that the ontology contradicts.

**TEC-90** The confirmation MUST name every class the commit created, not only the Root Frame's. The current build names one `[cur: added()]`, while TEC-81 can write several in the same operation, so a user who created two parents along the way is told about neither. **Status:** specified, not implemented in the current build.

**TEC-91** The Summary view MUST occupy the whole pane, with no Context row and no Action footer `[src: .entity-body[data-mode="summary"]]`.

---

## Keyboard model

**TEC-92** Every control in the view MUST be reachable in reading order: the segmented control, then the name, then the description, then the chip removals in chip order, then the combobox, then the assistant select, then the assistant action, then cancel, then commit.

**TEC-93** The name field MUST take focus when a Draft starts `[cur: autoFocus]`.

**TEC-94** In the combobox, with the dropdown closed, Down or Up MUST open it and make the first option active `[src: onkeydown]`.

**TEC-95** With the dropdown open, Down and Up MUST move the active option and MUST wrap at both ends `[src: onkeydown]`.

**TEC-96** Enter MUST choose the active option. With no option active and exactly one option in the list, Enter MUST choose that one `[src: onkeydown]`. With no option active and several, Enter MUST do nothing, and MUST NOT submit the form.

**TEC-97** Escape in the combobox MUST close the dropdown and clear the active option, and MUST stop there: it MUST NOT reach the Frame-level cancel in TEC-78 `[src: e.stopPropagation()]`.

**TEC-98** The Splitter MUST respond to Up and Down with a 3% step and to Enter with a return to the default split `[src: keydown]`.

**TEC-99** Enter in the name field MUST submit the form when the commit gate is open, and MUST do nothing when it is closed `[cur: onSubmit]`.

---

## Accessibility

**TEC-100** The pane MUST carry the accessible name `Text Entities`, and the form region the accessible name `Add entity` `[cur: aria-label="Add entity"]` `[src: aria-label]`.

**TEC-101** The combobox MUST implement the combobox pattern: `role="combobox"`, `aria-expanded` tracking the dropdown, `aria-controls` naming the listbox, and `aria-activedescendant` naming the active option `[src: #combo-input]`.

**TEC-102** The listbox MUST carry `role="listbox"` and the accessible name `Parent classes`; each option MUST carry `role="option"` and `aria-selected` reflecting whether it is active `[src: #combo-list]`.

**TEC-103** Group headers MUST NOT be focusable and MUST NOT be options `[src: .lb-group]`.

**TEC-104** Each chip's remove control MUST carry a text accessible name of the form `Remove <label>`, supplied as visually hidden text rather than by a title attribute alone `[src: .sr]`.

**TEC-105** The name error, the ancestor error and any service error MUST be announced. The name error MUST be referenced from the field by `aria-describedby` `[src: #f-name-err]`, and the ancestor and service errors MUST be assertive live regions `[cur: role="alert"]`.

**TEC-106** Body text MUST clear 4.5 to 1 against its background and every essential graphic MUST clear 3 to 1. The prototype's measured values, against white, are recorded in its token comment `[src: :root]`: `--text` at 16.5 to 1, `--muted` at 6.0 to 1, `--accent` at 6.7 to 1, `--danger` at 6.5 to 1, and every highlight ground at 13 to 1 or better with `--text` over it.

**TEC-107** No state in this view may be signalled by colour alone. The two that could be are specified with a second signal in TEC-41 and TEC-72.

**TEC-108** The focus indicator MUST be a 2px outline offset by 1px, on every focusable control including chips and options `[src: :focus-visible]`.

**TEC-109** The Splitter MUST carry `role="separator"`, `aria-orientation`, `aria-valuenow` and an accessible name that states what it resizes and that arrow keys work `[src: #splitter]`.

---

## Responsive behaviour

**TEC-110** The view MUST be usable from 375px wide upward. Below the fold breakpoint of 900px the form folds to one column, by TEC-21.

**TEC-111** The Action footer MUST remain pinned at every height. The commit action MUST NOT require scrolling to reach at any supported size. This is the single most important layout requirement in the document: it is the failure the redesign exists to fix.

**TEC-112** The pane MUST tolerate a height as small as 22% of the window, by TEC-22. At that height the form scrolls and the four fixed bands do not.

**TEC-113** No control may be withdrawn at any width. Where space is short the form folds; nothing is hidden behind a breakpoint.

---

## Constants

**TEC-114** Every numeric value this view depends on is listed here. No constant appears only in prose, and an implementation MUST take its visual values from the `DS` tokens the next table binds to, not from these literals.

| Constant | Value | Applies to | Source |
|---|---|---|---|
| Spacing step | 4px | the rhythm all spacing is built on | `[src: --s1]` |
| Spacing scale | 4, 8, 12, 16, 24, 32px | all padding and gaps | `[src: --s1]` |
| Control height | 28px minimum | buttons and the segmented control | `[src: .btn]` |
| Control padding | 0 horizontal 12px | buttons | `[src: .btn]` |
| Control label size | 13.5px | buttons | `[src: .btn]` |
| Icon button size | 26px square | tab strip actions | `[src: .icon-btn]` |
| Icon size | 15px square, 1.6px stroke | all icons but the chip remove | `[src: .icon]` |
| Chip remove icon | 11px square, 2px stroke | the chip remove control | `[src: .chip-x .icon]` |
| Tab padding | 9px top, 16px sides, 8px bottom | tab strip | `[src: .tab]` |
| Tab selected marker | 2px top border | tab strip | `[src: .tab]` |
| Band padding | 8px vertical, 12px horizontal | toolbar and Context row | `[src: .bar]` |
| Splitter thickness | 6px | between the panes | `[src: .app]` |
| Splitter handle | 30px wide, inset 2px from each edge | the Splitter | `[src: .splitter::after]` |
| Split default | 52% to the lower pane | the Splitter | `[src: set()]` |
| Split bounds | 22% to 78%, either pane | the Splitter | `[src: set()]` |
| Splitter keyboard step | 3% | the Splitter | `[src: keydown]` |
| Form first column | minimum 280px, maximum 400px | the identity column | `[src: .form]` |
| Form column gap | 24px | between the two columns | `[src: .form]` |
| Form padding | 16px vertical, 12px horizontal | the form | `[src: .form]` |
| Name field width | maximum 340px | the name field | `[src: .field--name input]` |
| Description width | maximum 400px | the description field | `[src: .field--desc textarea]` |
| Description height | 3 rows, 56px minimum | the description field | `[src: #f-desc]` |
| Field padding | 5px vertical, 8px horizontal | all text inputs | `[src: input[type="text"]]` |
| Name limit | 256 characters | the name field | `[src: #f-name]` |
| Description limit | 10,000 characters | the description field | `[src: #f-desc]` |
| Chip list minimum height | 34px | the chip list, empty or not | `[src: .chips]` |
| Chip list padding | 4px, with 6px gaps | the chip list | `[src: .chips]` |
| Chip label size | 13px | a parent chip | `[src: .chip]` |
| Chip remove control | 18px square | a parent chip | `[src: .chip-x]` |
| Chip note size | 11px | the `new` marker | `[src: .chip-note]` |
| Combobox width | maximum 460px | the parent combobox | `[src: .combo-field]` |
| Dropdown width | the lesser of 460px and the field width | the dropdown | `[src: .listbox]` |
| Dropdown maximum height | 232px | the dropdown | `[src: .listbox]` |
| Dropdown offset | 3px below the field | the dropdown | `[src: .listbox]` |
| Dropdown padding | 4px | the dropdown | `[src: .listbox]` |
| Option padding | 5px vertical, 8px horizontal | an option row | `[src: .lb-opt]` |
| Group header size | 10.5px | a group header | `[src: .lb-group]` |
| Option IRI size | 11.5px | the trailing IRI on an option | `[src: .lb-meta]` |
| Existing-class group cap | 8 items | group 3 of the dropdown | `[src: comboOptions()]` |
| Section label size | 11px, 700 weight, 0.05em tracking | `CLASS` and `PARENTS` | `[src: .sec-label]` |
| Field label size | 12.5px, 600 weight | field labels | `[src: .field > label]` |
| Help and error size | 12px | the assistant help line, field errors | `[src: .err]` |
| Body size | 14px, 1.5 line height | everything else | `[src: body]` |
| Context row size | 12.5px | the Context row and breadcrumb | `[src: .context]` |
| Preview debounce | 120ms | the Preview request | `[cur: setTimeout]` |
| Dropdown blur delay | 120ms | dismissal on blur | `[src: onblur]` |
| Busy indicator | 13px, 2px ring, 0.8s rotation | the assistant action | `[src: .spin]` |
| Control radius | 4px | buttons, fields, options | `[src: --r]` |
| Panel radius | 6px | the dropdown, the notice | `[src: --r-lg]` |
| Chip radius | fully rounded | chips and the chip remove | `[src: --r-pill]` |
| Focus indicator | 2px outline, 1px offset | every focusable control | `[src: :focus-visible]` |
| Fold breakpoint | 900px | below which the form folds to one column | `[src: @media (max-width: 900px)]` |
| Minimum width | 375px | the narrowest supported width | this document |
| Body contrast floor | 4.5 to 1 | text against its background | this document |
| Graphic contrast floor | 3 to 1 | borders, glyphs, chips, marks | this document |

### Token bindings

**TEC-115** The prototype's tokens map to `DS` tokens one for one. The prototype is light only, by its own declaration `[src: :root]`. An implementation MUST take both themes from [`40-design-system.md`](../40-design-system.md), and MUST derive the dark theme independently rather than by inverting the light one.

| Prototype token | Role |
|---|---|
| `--chrome`, `--chrome-2` | window chrome behind the panes, and its hover layer |
| `--surface`, `--surface-2` | the pane ground, and the recessed ground behind the chip list |
| `--border`, `--border-soft` | control stroke, and hairline between bands |
| `--text`, `--muted` | primary text, and labels and help text |
| `--accent`, `--accent-soft`, `--accent-line` | the commit action, selection and active option, and the notice stroke |
| `--danger`, `--danger-soft` | error text and the invalid field ground |
| `--font`, `--mono` | the interface face, and identifiers and analysed text |

**TEC-116** The monospace face is not decoration. It MUST be used for exactly three things and nothing else: the analysed text, an IRI, and the word `Thing` where it names the class rather than the concept `[src: .bar-file]` `[src: .lb-meta]` `[src: .chips-empty code]`.

---

## Copy catalogue

**TEC-117** Every user-facing string of this view is listed here, quoted verbatim. Copy is part of this specification. An implementer MUST NOT invent wording, and MUST NOT paraphrase or translate these strings without a corresponding change to this table. Angle brackets mark an interpolated value.

| Copy ID | String | Where | Source |
|---|---|---|---|
| `MODE-SUMMARY` | `Summary` | segmented control | `[src: #mode-summary]` |
| `MODE-ADD` | `Add entity` | segmented control | `[src: #mode-add]` |
| `TOOL-VIEWTEXT` | `View Text` | toolbar | `[src: .bar-end]` |
| `CTX-FROM` | `Adding from selection` | Context row, Root Frame | `[src: contextRow()]` |
| `CTX-NESTED` | `new parent` | Context row, Nested Frame | `[src: contextRow()]` |
| `SEC-CLASS` | `Class` | section label, first column | `[src: formBody()]` |
| `SEC-PARENTS` | `Parents` | section label, second column | `[src: formBody()]` |
| `FIELD-NAME` | `Name` | field label | `[src: #f-name]` |
| `FIELD-DESC` | `Description` | field label | `[src: #f-desc]` |
| `FIELD-DESC-PLACEHOLDER` | `Optional` | description placeholder | `[src: #f-desc]` |
| `NAME-EMPTY` | `A class needs a name.` | inline field error | `[src: submit()]` |
| `NAME-CHECKING` | `Checking name…` | below the name while the Preview is pending or stale | TEC-15, TEC-75 |
| `ANCESTOR` | `A class cannot be its own ancestor. Choose a different parent name.` | form error | `[cur: className=validation-error]` |
| `PARENTS-EMPTY` | `No parent chosen. Will be added under Thing` | chip list empty state | `[src: .chips-empty]` |
| `PARENT-NEW` | `new` | chip marker on a Created parent | `[src: .chip-note]` |
| `PARENT-REMOVE` | `Remove <label>` | chip remove, accessible name | `[src: parentChips()]` |
| `COMBO-PLACEHOLDER` | `Search classes, or type a new name…` | the parent combobox | `[src: #combo-input]` |
| `COMBO-LABEL` | `Parent classes` | listbox accessible name | `[src: #combo-list]` |
| `COMBO-EMPTY` | `No class matches that. Keep typing to create one.` | dropdown, no match | `[src: .lb-empty]` |
| `COMBO-PENDING` | `Choose a parent from the list, or press Escape to clear the search.` | help when pending search text loses focus | TEC-74, TEC-75 |
| `GROUP-PHRASE` | `From the phrase` | dropdown group header | `[src: comboOptions()]` |
| `GROUP-ASSISTANT` | `Suggested by <assistant>` | dropdown group header | `[src: comboOptions()]` |
| `GROUP-EXISTING` | `Existing classes` | dropdown group header | `[src: comboOptions()]` |
| `GROUP-CREATE` | `Create` | dropdown group header | `[src: comboOptions()]` |
| `OPT-CREATE` | `Create “<text>” as a new parent` | dropdown create option | `[src: parentsRegion()]` |
| `ASSIST-LABEL` | `Assistant` | provider select, accessible name | `[src: parentsRegion()]` |
| `ASSIST-RUN` | `Suggest` | assistant action, at rest | `[src: parentsRegion()]` |
| `ASSIST-PROMPT` | `Prompt` | disclosure beside the assistant help | [`parent-suggestions.md`](../parent-suggestions.md) |
| `ASSIST-PROMPT-LABEL` | `Parent prompt` | read-only prompt field, accessible name | [`parent-suggestions.md`](../parent-suggestions.md) |
| `ASSIST-COPY` | `Copy prompt` | prompt disclosure | [`parent-suggestions.md`](../parent-suggestions.md) |
| `ASSIST-BUSY` | `Thinking…` | assistant action, in flight | `[src: parentsRegion()]` |
| `ASSIST-HELP` | `Uses your installed <assistant> sign-in. Suggestions appear in the same list.` | help line, no result | `[src: .assist-help]` |
| `ASSIST-DONE` | `<assistant> suggested <n> parents. They are in the list above, under its name.` | help line, result present | `[src: .assist-help]` |
| `EXISTS` | `<label> already exists in this ontology. Adding it again would create a duplicate.` | existing-class notice | `[src: existingBranch()]` |
| `EXISTS-OPEN` | `Open <label> in Taxonomy` | notice action, Root Frame | `[src: existingBranch()]` |
| `EXISTS-USE` | `Use <label> as parent` | notice action, Nested Frame | `[src: existingBranch()]` |
| `FOOT-THING` | `Adding under Thing.` | footer note, no parents | `[src: footer()]` |
| `FOOT-NESTED` | `Saved together with <root label> when you add it.` | footer note, Nested Frame | `[src: footer()]` |
| `ACT-ADD` | `Add class` | commit action, Root Frame | `[src: footer()]` |
| `ACT-ADD-BUSY` | `Adding…` | commit action, in flight | TEC-118 |
| `ACT-USE` | `Use as parent` | commit action, Nested Frame | `[src: footer()]` |
| `ACT-CANCEL` | `Cancel` | cancel action, Root Frame | `[src: footer()]` |
| `ACT-DISCARD` | `Discard parent` | cancel action, Nested Frame | `[src: footer()]` |
| `DONE` | `Added <label> under <parents>.` | Summary confirmation | `[cur: TextEntitiesPanel.tsx className=text-analysis-created]` |
| `DONE-VIEW` | `View in Taxonomy` | Summary confirmation action | `[cur: TextEntitiesPanel.tsx]` |
| `SPLIT-LABEL` | `Resize the text and entity panes. Arrow keys resize.` | Splitter accessible name | `[src: #splitter]` |
| `PANE-LABEL` | `Text Entities` | pane accessible name | `[src: aria-label]` |
| `FORM-LABEL` | `Add entity` | form region accessible name | `[cur: aria-label="Add entity"]` |

**TEC-118** `COMBO-PLACEHOLDER`, `ASSIST-BUSY`, `NAME-CHECKING` and `ACT-ADD-BUSY` MUST use the horizontal ellipsis. `OPT-CREATE` MUST use typographic quotation marks. These are the real characters and MUST be used as written.

---

## Deviations and known gaps

Recorded so that a reader does not have to work out whether something is a decision or an oversight.

1. **Editing a Created parent.** The current build lets a Created parent be reopened and edited in place, through an `Edit` control on its row `[cur: editParent()]` `[cur: editIndex]`. TEC-80 keeps that behaviour, but the prototype's chip list offers only removal, so the prototype provides no route to reach it. **Status:** TEC-80 is specified, not implemented in the prototype. An implementation SHOULD reach it by activating the chip itself, which is the only affordance the chip list has left.
2. **The commit gate in the prototype.** The prototype has no Store, no Preview and no dataset epoch, so conditions 2, 3 and 4 of TEC-72 are not modelled in it, and TEC-74 is not modelled either: its combobox does not close the gate while it holds text. All four are specified from the current build, which implements them. **Status:** specified, not implemented in the prototype.
3. **The Root Frame's existing-class action.** In the prototype, `Open <label> in Taxonomy` re-renders and does nothing, because there is no Taxonomy to open `[src: existingBranch()]`. Its behaviour is specified in TEC-69 from the current build `[cur: openExisting()]`.
4. **Assistant behaviour in the prototype is a fixture.** The 900ms delay and the label-keyed suggestion pool `[src: runAssistant()]` exist so that the busy state and the result group can be seen. Neither is a requirement. The real behaviour is [`parent-suggestions.md`](../parent-suggestions.md).
5. **The upper pane is drawn at reduced fidelity.** The prototype's Text Analysis pane exists to give the lower pane its context and its selection link. Its highlight colours, its match count and its timing readout are fixtures.
6. **Fixture data.** The prototype uses twenty class labels from `courses.owl` in the `http://devry.edu/courses#` namespace `[src: NS]` `[src: CLASSES]`, taken from the screenshots the redesign was drawn from. That is not the fixture in [`62-pizza-ontology-fixture.md`](../62-pizza-ontology-fixture.md) that the suite's acceptance tests assume. FIX-103 and FIX-104 now define the Pizza phrases and expected commit; ACC-26 registers the automated coverage. The earlier course and animal cases remain regression fixtures.
7. **Dark theme.** The prototype is light only and says so `[src: :root]`. TEC-115 governs.
8. **The Summary view.** The prototype replaces it with an `Added this session` list. TEC-86 forbids that substitution in the product. The one thing the prototype's list shows that the current build does not, that every class a commit created is worth naming, is carried forward as TEC-90.
9. **Screenshots.** None were produced. [`visual-reference.html`](visual-reference.html) carries the visual burden, and unlike its sibling in [`add-children/`](../add-children/README.md) it is a verbatim copy of the prototype rather than a separate specimen, because in this case the prototype is one view and shows every state of it directly.
10. **Em dashes.** See [House style deviations](#house-style-deviations).

---

## Registration

This document is registered in the suite index. The entries below record its prefix, document map and reading order placement.

**Prefix registry**, in the table under `Requirement ID prefix registry`:

```
| `TEC` | [`text-entity-create/README.md`](text-entity-create/README.md) | Add entity: the draft stack, the parents region, the commit gate |
```

**Document map**, in the table under `Document map`:

```
| [`text-entity-create/README.md`](text-entity-create/README.md) | Text Entity Create | `TEC` | The Add entity view: draft stack, parent selection, validation gates, commit | 30 min |
```

**Reading order**, after the Surface documents and before the design system:

```
11. **[`text-entity-create/README.md`](text-entity-create/README.md)** - the Add entity view: how a phrase from Text Analysis becomes a class, with the parents it needs and the parents that have to be created first. Read after the Surfaces, because it writes into the hierarchy the tree presents, and after [`parent-suggestions.md`](parent-suggestions.md), which owns the assistant call this view surfaces.
```

[`41-component-library.md`](../41-component-library.md) has no entry for a combobox with grouped options, a chip input or a pinned action footer. The five composites named in TEC-2 are specified here for now. If a second surface needs any of them, it is promoted there and this document cites it instead.

---

## Appendix A. Native stack mapping (non-normative)

Advisory only. A conformant implementation MAY meet the numbered requirements by other means.

### Control mapping

| This document | WinUI 3 | Avalonia |
|---|---|---|
| Two-pane split | `Grid` with a `GridSplitter` on a row | `Grid` with a `GridSplitter` |
| Tab strip | `TabView` | `TabControl` |
| Segmented control | `Selector` styled as segments, or two `RadioButton` controls | `RadioButton` group |
| Context row | a `Grid` band above the form | the same |
| Breadcrumb | `BreadcrumbBar` | an `ItemsControl` of link buttons |
| Name and description | `TextBox`, and `TextBox` with `AcceptsReturn` | the same |
| Chip list | `ItemsRepeater` in a `WrapLayout`, each item a `Border` with a close `Button` | `ItemsControl` with a `WrapPanel` |
| Parent combobox | `TextBox` with a `Popup` holding a grouped `ListView` | `AutoCompleteBox`, or `TextBox` with a `Popup` |
| Group headers | `ListView.GroupStyle` over a `CollectionViewSource` | `ItemsControl` with grouping |
| Assistant chooser | `ComboBox` | `ComboBox` |
| Assistant action | `Button` with a `ProgressRing` in its content | `Button` with a spinner |
| Existing-class notice | `InfoBar` set to informational, not closable | a styled `Border` |
| Action footer | a `Grid` row sized `Auto` below the form | the same |
| Commit confirmation | `InfoBar` in the Summary view | a notification region |

### Notes on the mapping

1. **Do not use `AutoSuggestBox` for the parent combobox.** It has no grouping, and TEC-45 needs four named groups in a fixed order. A `TextBox` with a `Popup` over a grouped `ListView` is more work and is the only route that satisfies TEC-45, TEC-46 and TEC-52 together.
2. **Pointer-press selection.** TEC-57 requires an option to be applied on press rather than release, so that losing focus cannot swallow the choice. In WinUI, handle `PointerPressed` on the item and mark the event handled; do not rely on `ItemClick`.
3. **The fixed bands.** Place the tab strip, toolbar, Context row and Action footer in `Grid` rows sized `Auto`, around one row sized `*` for the form. TEC-19 and TEC-111 require that the footer never scrolls, and a scrolling header region will violate both.
4. **The two columns.** A `Grid` with `ColumnDefinition` of `Auto` bounded by `MinWidth="280" MaxWidth="400"` and `*` matches TEC-20. Fold with an adaptive trigger at 900px, and do not fold by hiding.
5. **The frame stack.** Remount the editor per stack depth, as the current build does with a depth-keyed component `[cur: key={frames.length}]`. Per-frame transient state, the Preview, the search text and the busy flag, MUST NOT leak between Frames.
6. **Debounce and cancellation.** TEC-15 needs both a 120ms debounce and the discarding of a response whose name is stale. A `CancellationTokenSource` replaced on each keystroke gives both.
7. **Announcements.** TEC-105 needs the ancestor and service errors announced assertively. Use `AutomationProperties` live-region support, and raise a notification rather than relying on focus movement.
8. **Contrast.** The `DS` palette is authored per theme. Do not compute the dark theme from the light one; TEC-115 forbids it.
