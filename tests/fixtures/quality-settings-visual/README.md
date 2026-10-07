# The scan settings region and the states before a scan

**Purpose:** Specify the Ontology Quality scan settings region, the states the pane carries before a scan has run, and the row, wrap, width and measure discipline those need, to the level of detail required to rebuild them without reading the prototype.

**Status:** Normative. Revision 1.

**Requirement ID prefixes owned:** `QSS`

**What this document owns:** the settings region and its four rows, the geometry of that region on both axes, the affordance of every control inside it, the vocabulary census statement, the reconciliation of counts shown anywhere in the pane, and the pane's presentation before a scan has produced findings.

**What it does not own:** the check catalog, the rule record, the findings list, grouping, severity, suppression, coverage, the apply path, export, exceptions, and the scan state machine beyond its pre scan states. Those belong to `specs/quality/README.md`, which this document cites as `QLY-n` and defers to by name.

**Behavioural source of truth:** `C:\Users\Craig\AppData\Roaming\Open Design\namespaces\release-stable-win\data\projects\dd6f8408-986c-4b38-9c30-3fe336496345\quality.html`, read only.

**Why this document exists in two places.** `.gitignore` line 17 is `specs/`, and `git ls-files specs` returns nothing. Everything under `specs/` is untracked and is removed by a clean. `docs/issues56-validation.md` records the repository's own answer: "Revision 2 and its normative README are tracked under `tests/fixtures/extend-visual` because `specs/` is ignored." This document therefore exists at `specs/quality-settings/` and byte identical at `tests/fixtures/quality-settings-visual/`. If the two ever differ, the tracked copy wins, because it is the one that survived.

---

## 1. Scope, ownership and precedence

**QSS-1** This document specifies three things: the **scan settings region**, the **pre scan states** of the Ontology Quality pane, and the **geometry discipline** both require.

**QSS-2** Ownership is exclusive in both directions. A requirement in this document MUST NOT restate or contradict a `QLY` requirement outside the boundary of QSS-1, and a `QLY` requirement inside that boundary is superseded only through Appendix B.2.

**QSS-3** The deference table. Where this document is silent on any of the following, `specs/quality/README.md` governs and this document MUST NOT be read as having an opinion:

| Subject | Owner |
| --- | --- |
| The six check groups and the rule record | `QLY-46` to `QLY-57` |
| Configurable accepted predicates | `QLY-58` to `QLY-64` |
| The census as a gate on the catalog | `QLY-66` to `QLY-74` |
| The eight scan states after a scan begins | `QLY-80` |
| Staleness and its two reasons | `QLY-84` to `QLY-91` |
| Grouping, bands, severity and suppression | `QLY-92` to `QLY-110` |
| Coverage and its denominators | `QLY-111` to `QLY-125` |
| The reviewed label addition apply path | `QLY-126` to `QLY-145` |
| Export, exceptions and persistence | `QLY-146` to `QLY-167` |
| Entry points and the detached pane | `QLY-24` to `QLY-30` |

**QSS-4** This document supersedes exactly six `QLY` requirements. Each appears in Appendix B.2 with its sentence quoted verbatim, the `QSS` requirement that replaces it named, and the reason given. A silent supersession is a defect in this document.

**QSS-5** Where this document and `specs/quality/README.md` disagree inside the QSS-1 boundary, this document wins and `QLY` is stale. Outside that boundary, `QLY` wins and this document is the defect.

**QSS-6** Requirement identifiers are `QSS-n`, numbered from 1, with no gaps and no duplicates. Numbering is append only across revisions.

**QSS-7** RFC 2119 keywords in capitals carry their RFC 2119 meaning.

---

## 2. Evidence and source markers

**QSS-8** Every factual claim carries a marker naming where it came from:

| Marker | Meaning |
| --- | --- |
| `[shot: 01]` | Measured in the tall narrow capture |
| `[shot: 02]` | Measured in the full screen capture |
| `[proto]` | Read out of `quality.html` |
| `[QLY-n]` | Stated by `specs/quality/README.md` at that requirement |
| `[docs: f.md]` | Stated by that repository document |
| `[new]` | A judgment with no source behind it |

**QSS-9** The evidence folder holds exactly two captures, because exactly two exist, and both show the pane before any scan has been run.

| File | What it establishes |
| --- | --- |
| `screenshots/01-vertical-before-scan.png` | The settings block wrapped to seven rows in a 619 pixel pane, and a body that is almost entirely empty |
| `screenshots/02-full-screen-before-scan.png` | The same block as four rows in a 1,894 pixel pane, every row ending in dead width, the action pinned to the far edge, and a 245 character limits line |

**QSS-10** No capture of a correct settings region exists, because the region specified here has never run. The visual reference beside this document carries that load.

---

## 3. What the captures measured

### 3.1 Method, and the one assumption in it

**QSS-11** Both captures are device pixel images. The CSS pixel figures below are derived by dividing device pixels by a display scale of **1.5**, inferred from the `Run scan` control measuring 43 device pixels tall against a 28 to 30 pixel control height. The scale is an inference, not a reading, and every derived figure in this section carries that uncertainty. The **ratios** in section 3.4 do not, because a scale factor cancels out of a ratio.

**QSS-12** Capture geometry:

| Capture | Device pixels | Derived CSS pixels | Presentation |
| --- | --- | --- | --- |
| `[shot: 01]` | 929 by 2387 | 619 by 1591 | Expanded, just above the 616 exit |
| `[shot: 02]` | 2841 by 2395 | 1894 by 1597 | Expanded |

**QSS-13** Both captures are at the Expanded presentation on both axes, so neither exercises Narrow, Shallow or recovery. Nothing in this document may be read as evidence about those three.

### 3.2 The settings region as measured

**QSS-14** Measured against `[QLY-17]`, which budgets the settings block at 32 pixels a row and four rows maximum, so 128 total:

| | `[shot: 01]` | `[shot: 02]` | Budget |
| --- | ---: | ---: | ---: |
| Rows rendered | 7 | 4 | 4 |
| Height a row | ~38 px | ~45 px | 32 px |
| Region total | ~266 px | ~180 px | 128 px |
| Over budget by | 108 % | 41 % | |

**QSS-15** The structural row count is **four**. `[proto]` builds exactly four `.srow` elements: Scope, Entity kinds, Checks and Vocabulary. The seven rows in `[shot: 01]` are those four wrapping, not a fifth, sixth and seventh row. A reader of the narrow capture alone would reach the wrong conclusion, which is why both captures are in the evidence folder.

**QSS-16** The row height exceeds the budget in both captures and at both widths. That is independent of wrapping and is a straightforward failure to meet `[QLY-17]`.

### 3.3 Width as measured

**QSS-17** In `[shot: 02]` every settings row takes the full pane width and ends in dead width:

| Row | Content ends at | Dead width to the pane edge |
| --- | ---: | ---: |
| Scope | the select, about 147 px wide | `Run scan` is pinned about 1,520 px further right |
| Entity kinds | seven chips, about 1,078 px | about 816 px |
| Checks | four chips, a count and `Rules`, about 636 px | about 1,258 px |
| Vocabulary | three chips and a sentence, about 739 px | about 1,155 px |

**QSS-18** The 1,520 pixel gap has a named cause in the source. `[proto]` emits the Scope row as the label, the select, `<span class="od-fill"></span>`, then the primary action. `od-fill` is `flex: 1 1 0`: a spacer whose declared job is to take whatever width remains. The action is not drifting; it is being pushed, by an element written to push it.

**QSS-19** `[QLY-20]` already forbids this: "Width is room for findings, not for larger controls. A region that does not declare its own width MUST NOT take whatever the container offers." The settings region declares no width. This is an implementation defect against a requirement that predates both captures, not a gap in the specification.

### 3.4 The measure as measured

**QSS-20** The pane carries three prose regions. Their lengths, against a measure of 65 to 75 characters a line:

| Region | Characters | Lines rendered `[shot: 02]` | Characters a line |
| --- | ---: | ---: | ---: |
| Idle body | 104 | 2 | about 52 |
| Vocabulary note | 72 | 1 | 72 |
| Limits statement | 245 | **1** | **245** |

**QSS-21** The idle body and the vocabulary note are within the measure. The limits statement is 3.3 to 3.8 times it. The difference is not that one region was built carelessly: the idle body carries a width cap from `[QLY-21]` and the limits statement has no row in that table, while `[QLY-45]` requires it to be one line. Those two requirements together guarantee this result at any wide pane.

**QSS-22** That is a defect in `specs/quality/README.md`, not in the implementation, and QSS-4 records it.

---

## 4. The settings region

### 4.1 Anatomy

**QSS-23** The settings region consists of exactly **four rows** and one **action line**, in this order:

| Band | Carries |
| --- | --- |
| Row 1 | `Scope` and the scope control |
| Row 2 | `Entity kinds` and one control per kind |
| Row 3 | `Checks` and one control per group, then the enabled check count, then the per rule control |
| Row 4 | `Vocabulary` and the census statement |
| Action line | The primary action that commits all four rows |

**QSS-24** Four rows is the count at **every presentation above recovery**. The region MUST NOT render a fifth row at any width, and MUST NOT render fewer than four while any of them has content.

**QSS-25** Each row is a label column followed by a content column. The label column is **90 CSS pixels** and does not vary with the pane. A row's label is a noun naming what the row controls, never a sentence.

**QSS-26** Heights, which together replace the `[QLY-17]` settings row:

| Band | Height |
| --- | ---: |
| Row, each of the four | 32 px |
| Action line | 36 px |
| **Region total** | **164 px** |

**QSS-27** 164 pixels is the region's height at every width, because QSS-24 fixes the row count and QSS-32 forbids wrapping. The measured 266 and 180 of QSS-14 both exceed it, and the 266 exceeds it because of a failure the budget never addressed.

### 4.2 The action

**QSS-28** The primary action occupies the **action line**, not a settings row. It commits every setting above it, so it follows all of them.

**QSS-29** The action MUST NOT be separated from the settings by an expanding spacer. The distance from the leading edge of the settings region to the leading edge of the action MUST NOT exceed **the region's width cap**, which QSS-33 fixes, and in practice the action sits at the region's leading edge on its own line.

**QSS-30** `[proto]`'s `od-fill` in the Scope row MUST be removed rather than restyled. A spacer whose job is to expand is the defect; narrowing it leaves the same mechanism in place.

**QSS-31** The action carries its own state. Before a scan it reads `Run scan`. The states it takes after a scan begins are owned by `[QLY-80]` and are not specified here.

### 4.3 The wrap rule

**QSS-32** A settings row MUST NOT wrap to a second line. When its content exceeds its content column, the content column **scrolls horizontally within that row**, with the next item visible at the trailing edge so the overflow is legible rather than silent.

**QSS-33** The settings region declares a width cap of **1,040 CSS pixels**, derived from the widest row's measured natural width: a 90 pixel label column plus seven entity kind controls totalling about 909 pixels plus their gaps. Above the cap the region does not grow. Below it, QSS-32 applies.

**QSS-34** A horizontal rail is used rather than a wrap because wrapping is what produced the seven rows of `[shot: 01]`, and because a region whose height depends on its width cannot carry a height budget. QSS-26 is only enforceable because QSS-32 exists.

**QSS-35** The scroll position of each row is retained with the pane's other settings.

**QSS-36** A row that scrolls MUST remain operable from the keyboard: moving focus to a control outside the visible part of the row scrolls it into view.

**QSS-37** The Vocabulary row is the one row whose content is a sentence rather than controls. It MUST fit its content column on one line within the measure, which QSS-53 achieves by moving the enumeration behind a control rather than by scrolling a sentence.

### 4.4 Empty space

**QSS-38** Empty space to the trailing side of the capped region is **correct**, as `[QLY-23]` already states. At 1,894 pixels the region stops at 1,040 and leaves about 854 pixels blank, and that blank is the region reporting its own size honestly.

**QSS-39** Stretching the region, centring it in the pane, or filling the space with anything are each defects.

---

## 5. The measure

**QSS-40** Every prose region in the pane caps at **72 characters a line**. This is one rule, applied everywhere, rather than a per region pixel table that drifts as copy changes.

**QSS-41** The pixel equivalent of 72 characters at each type size used in the pane:

| Type size | Cap | Used by |
| --- | ---: | --- |
| 12.5 px | 440 px | The limits statement, the vocabulary note, the check count |
| 13 px | 460 px | Secondary body copy |
| 15 px | 530 px | A state headline's body |

**QSS-42** A prose region MUST NOT take the container's width at any pane size. A prose region that reaches 245 characters on one line, as the limits statement does in `[shot: 02]`, is unreadable regardless of how much room was available to render it.

**QSS-43** When authored copy does not fit its measure, the **copy is shortened**, not the measure widened. This is the general rule for authored copy and it governs QSS-44.

### 5.1 The limits statement

**QSS-44** The standing limits statement MUST name, at minimum, that the scan reads what is asserted, and that it does not reason, judge whether a definition is correct, follow a remote link, or load an unresolved import. `[QLY-43]`

**QSS-45** The statement MUST NOT also carry the withdrawal fact. The Vocabulary row states that already, and `[QLY-16]` forbids stating one fact twice. `[QLY-44]` is satisfied by the Vocabulary row, not by the limits statement.

**QSS-46** The statement is **101 characters**, wrapping to two lines within its 440 pixel measure, occupying **36 pixels**. The 245 character form measured in `[shot: 02]` is replaced, not re wrapped.

**QSS-47** The statement remains standing and always visible. It MUST NOT be placed behind a disclosure, which `[QLY-45]` already required and this document keeps.

**QSS-48** The statement MAY withdraw only at the Shallow presentation, which `[QLY-45]` already stated.

---

## 6. Control affordances

**QSS-49** Every control in the Entity kinds and Checks rows carries exactly one of **four states**, and all four MUST be distinguishable from one another by more than colour.

| State | Meaning | Rendered | Selectable | Carries |
| --- | --- | --- | --- | --- |
| Selected | In scope for the next scan | yes | yes | name, count, a filled mark |
| Available | Could be in scope, currently is not | yes | yes | name, count |
| Empty | Nothing in the ontology to scan | yes | **no** | name, `0`, a not applicable mark |
| Withdrawn | Its vocabulary is absent from the census | **no** | n/a | nothing; named only in QSS-53 |

**QSS-50** A control whose count is zero MUST NOT be selectable. `[shot: 01]` and `[shot: 02]` both render `Individuals 0`, `Object properties 0` and `Data properties 0` identically to the controls that have members, which offers three controls that cannot change the result of a scan.

**QSS-51** The permission that allowed this is `[QLY-39]`: "A kind with no instances in the store MAY be offered with a zero count." QSS-50 replaces that permission with a prohibition on selectability. The control is still rendered, because its zero is information, and `[QLY-48]` already forbids the same thing for a group chip, so the two rows now agree.

**QSS-52** A withdrawn control is **not rendered at all**: not listed, not counted, not greyed. `[QLY-67]` already requires this of the check it represents. The distinction between Empty and Withdrawn is the distinction `[QLY-74]` requires and never gave a presentation to: an Empty control is on screen and cannot be chosen, a Withdrawn control is not on screen and its absence is accounted for in one place.

**QSS-53** That one place is the Vocabulary row. It reads the detected vocabularies, then a control stating how many checks are withdrawn, which on activation **names each withdrawn check and the vocabulary that removed it**.

**QSS-54** Naming them is not a convenience. `[QLY-69]` forbids gating a check that tests for something **missing**, and a withdrawal that cannot be enumerated cannot be audited against that rule. `[shot: 01]` says three checks are withdrawn and names none of them, so the capture cannot establish whether `[QLY-69]` is honoured.

**QSS-55** A check group that is **default off** per `[QLY-65]` is in the Available state, not the Withdrawn state. It MUST be rendered as a control that can be switched on. Both captures omit `Publication metadata` entirely, which presents a default off group as though it had been withdrawn, and that is exactly the collision `[QLY-74]` forbids.

**QSS-56** Six groups exist per `[QLY-46]` and both captures render four. `Retired entities` is correctly withdrawn, because `owl:deprecated` is absent from the census. `Publication metadata` is not, and MUST appear.

**QSS-57** Every control states its count beside its name. A control without a count cannot be told from one whose count it does not know.

**QSS-58** Each of the four states MUST announce itself to assistive technology by name, not only by appearance. QSS-104 gives the announcements.
---

## 7. The vocabulary census statement

**QSS-59** The Vocabulary row states three things on one line: which vocabularies the loaded ontology uses, how many checks were withdrawn, and a way to see which.

**QSS-60** The detected vocabularies are rendered as non interactive marks. They are a report, not a control, and MUST NOT look like the selectable controls one row above.

**QSS-61** The withdrawal count is a control. Activating it reveals, for each withdrawn check, the check name and the absent vocabulary that removed it.

**QSS-62** When nothing is withdrawn the row states that plainly rather than rendering an empty control.

**QSS-63** The row is one line within the measure. `[shot: 01]` spends two rows on this, a row of marks and a row of sentence, and QSS-24 does not permit that.

**QSS-64** The census is recomputed with each scan and MUST NOT be cached across scans, which `[QLY-72]` already requires. The row therefore reports the census the next scan will use, not the one the last scan used, and before any scan has run those are the same thing.

---

## 8. Count reconciliation

**QSS-65** Any two counts of the same kind of thing rendered anywhere in the pane MUST either agree, or each state the denominator that makes them differ.

**QSS-66** `[shot: 01]` and `[shot: 02]` both render `Classes 5,559` in the Entity kinds row and `6,172 classes` in the status line. The two differ by 613 and neither accounts for the other. A reader cannot tell which number a completeness percentage will later be divided by, which is the precise failure `[QLY-38]` exists to prevent: "A denominator the reader cannot account for is a denominator the reader cannot trust."

**QSS-67** `Classes 5,559` plus `Defined classes 612` is 6,171, one short of 6,172, so the two rows are probably counting named, defined and one more thing. Probably is not a specification. The implementation MUST state the relationship rather than leave it to arithmetic that nearly works.

**QSS-68** Where a total is the sum of controls in the Entity kinds row, that row MUST carry the total. Where it is not, the differing count MUST name what it includes.

**QSS-69** This rule governs counts in the settings region and the status line only. Counts inside a report belong to `[QLY-111]` to `[QLY-125]`.

---

## 9. The states before a scan

**QSS-70** Three states exist before a scan has produced findings: **idle**, **running**, and **failed before any finding**. The five states after findings exist belong to `[QLY-80]`.

### 9.1 Idle

**QSS-71** The idle state is reached when the pane opens and no scan has been run in this session for the loaded ontology.

**QSS-72** In the idle state the settings region **is the content**. It occupies the body, not a header band above an empty body.

**QSS-73** `[shot: 01]` renders the settings region as a header band and leaves roughly **92 per cent of the body empty**, with the primary action in the top seven per cent of the pane. The reader is given an instruction and the control it names is as far from it as the pane allows.

**QSS-74** The idle body carries, in order: the state headline, its body copy within the 530 pixel measure, then the settings region of section 4 with its action line.

**QSS-75** Idle budget:

| Band | Height |
| --- | ---: |
| Command bar | 40 px |
| State headline | 28 px |
| State body, two lines at 15 px | 44 px |
| Settings region | 164 px |
| Limits statement, two lines at 12.5 px | 36 px |
| Status line | 32 px |
| **Total** | **344 px** |

**QSS-76** Everything below 344 pixels in an idle pane is empty, and that emptiness is **correct**. There is nothing to show because nothing has been scanned. `[QLY-23]` already says so and QSS-38 repeats the rule for this axis.

**QSS-77** The distinction QSS-76 draws is between emptiness that reports a fact and emptiness that reports a layout failure. An idle pane with its action 1,900 pixels from the bottom edge is the second kind: the space is empty and the thing you need has been pushed away from you. Moving the action into the settings region converts it to the first kind.

**QSS-78** The idle state MUST NOT auto run a scan. `[QLY-24]` reaches this pane from `Tools > Check ontology...` with the settings expanded, which is an explicit design that the reader configures before scanning, and this document does not overturn it.

### 9.2 Running

**QSS-79** The running state replaces the state headline and body with progress and a cancel action, and retains the settings region in a non interactive presentation so the reader can see what is being scanned.

**QSS-80** A setting MUST NOT be changed while a scan runs. A control in the running state is rendered and announced as unavailable, not removed, so the region does not change height mid scan.

**QSS-81** Progress MUST state what it is counting, not only a proportion.

### 9.3 Failed before any finding

**QSS-82** A scan that fails before producing a finding returns to a state carrying the failure reason, the settings region, and the action, which reads `Run scan` again.

**QSS-83** This state MUST NOT be presented as a clean result, which `[QLY-79]` already requires, and MUST NOT be presented as idle, because a failure that looks like a fresh pane invites the same scan to be run again with no change.

### 9.4 After a scan

**QSS-84** Once a scan completes, the settings region collapses to one summary line with a control to expand it, which `[QLY-19]` already specifies and this document does not change.

**QSS-85** The collapsed summary line MUST state the scope, the enabled check count, and the revision scanned, so the reader can tell what produced the report on screen without expanding anything.

---

## 10. Presentation

**QSS-86** Presentation is selected by container query against the pane's own measured rectangle, at the published thresholds of **600** width and **400** height, with exits at **616** and **416**, and the recovery state below **240** wide, under the names `Expanded`, `Narrow`, `Shallow` and `Narrow and shallow`. `[docs: adaptive-pane-ux.md]` No threshold is invented here and no presentation is given a new name.

**QSS-87** A viewport media query MUST NOT size anything in this region. A docked pane does not know the window size.

**QSS-88** The settings region by presentation:

| Presentation | Rows | Label column | Rails | Limits statement | Action |
| --- | ---: | --- | --- | --- | --- |
| Expanded | 4 | 90 px | only when content exceeds the cap | two lines, 440 px | its own line |
| Narrow | 4 | 72 px | on every row that needs one | two or three lines, full content column | its own line |
| Shallow | 4 | 90 px | as Expanded | withdrawn, per `[QLY-45]` | its own line |
| Narrow and shallow | 4 | 72 px | as Narrow | withdrawn | its own line |
| Recovery | 0 | n/a | n/a | withdrawn | withdrawn |

**QSS-89** The row count does not change with presentation. This is the whole point of QSS-32: a region whose structure survives every width is one whose budget means something.

**QSS-90** The action line survives every presentation above recovery. A pane that can be configured but not run is worse than one that can do neither.

**QSS-91** `[QLY-80]`'s `at-tall` behaviour, which withdraws the Entity kinds, Checks and Vocabulary rows at Shallow, is **not** adopted here. Withdrawing three of four settings rows leaves a Scope control and an action that commits settings the reader cannot see. The rows stay and the pane scrolls.

**QSS-92** QSS-91 is a departure from `[proto]`, which marks those three rows `at-tall`. It is recorded in Appendix B.1 as a prototype divergence rather than in B.2, because no `QLY` requirement states the `at-tall` behaviour; only the prototype does.

---

## 11. Keyboard

**QSS-93** Every control in the settings region is reachable from the keyboard, carries a visible focus state, and carries an accessible name that names its object rather than only its verb.

**QSS-94** Focus order is reading order: Scope, then each entity kind in rendered order, then each check group, then the per rule control, then the census control, then the action.

**QSS-95** Bindings:

| Context | Key | Action |
| --- | --- | --- |
| Any control in a row | Tab, Shift with Tab | Next, previous control, scrolling the row if needed |
| An entity kind or check control | Enter, Space | Toggle between Selected and Available |
| An empty control | Enter, Space | Nothing, and the reason is announced |
| The census control | Enter, Space | Reveal the withdrawn checks |
| The revealed list | Escape | Close and return focus to the census control |
| Anywhere in the region | Enter on the action | Start the scan |

**QSS-96** A row that has scrolled MUST bring a focused control into view, as QSS-36 requires, and MUST NOT scroll the pane to do it.

**QSS-97** An empty control remains focusable. Removing it from the tab order hides the fact that the kind exists and has nothing in it.

---

## 12. Accessibility

**QSS-98** Body text meets a contrast ratio of at least 4.5 to 1 against its own background. Marks, icons and essential graphics meet at least 3 to 1. Light and dark are audited independently; neither is inferred from the other.

**QSS-99** No control state is carried by colour alone. Selected carries a mark, Empty carries a mark and its zero, Available carries neither, and Withdrawn is absent.

**QSS-100** The settings region is announced as a group with a name, so that a reader arriving by keyboard knows what the following controls configure.

**QSS-101** Each row is announced with its label, so a control's meaning does not depend on having read a label several controls earlier.

**QSS-102** A change that is not visible where focus sits MUST be announced: a control switched on or off, a row scrolled, the census list opened, a scan started.

**QSS-103** The layout survives system font scaling. QSS-32's rails are what make that true: a region that wraps under font scaling grows without limit, and a region that scrolls does not.

**QSS-104** Announcements by state:

| State | Announced as |
| --- | --- |
| Selected | `{name}, {count}, selected` |
| Available | `{name}, {count}, not selected` |
| Empty | `{name}, none in this ontology, unavailable` |
| Withdrawn | not announced, because not rendered |

---

## 13. Copy catalogue

**QSS-105** User visible strings in this region are drawn from this catalogue. A string that appears in an implementation and not here is a defect.

| ID | String |
| --- | --- |
| `qss.row.scope` | `Scope` |
| `qss.row.kinds` | `Entity kinds` |
| `qss.row.checks` | `Checks` |
| `qss.row.vocab` | `Vocabulary` |
| `qss.scope.whole` | `Whole ontology` |
| `qss.scope.namespace` | `Namespace {namespace}` |
| `qss.scope.branch` | `Branch: {class} and descendants` |
| `qss.action.run` | `Run scan` |
| `qss.checks.count` | `{n} checks` |
| `qss.checks.rules` | `Rules` |
| `qss.vocab.withdrawn` | `{n} withdrawn` |
| `qss.vocab.none` | `Every vocabulary the catalog knows about is in use` |
| `qss.vocab.list.title` | `Withdrawn checks` |
| `qss.vocab.list.row` | `{check}, because {vocabulary} is not used here` |
| `qss.kind.empty` | `none in this ontology` |
| `qss.limits` | `Reads what is asserted. No reasoning, no definition judgement, no remote links, no unresolved imports.` |
| `qss.idle.headline` | `Ready to scan` |
| `qss.idle.body` | `Choose a scope and the checks above, then run the scan. Scanning reads the ontology and changes nothing.` |
| `qss.idle.summary` | `No scan has been run.` |
| `qss.running.headline` | `Scanning` |
| `qss.running.progress` | `{done} of {total} entities` |
| `qss.running.cancel` | `Cancel` |
| `qss.failed.headline` | `The scan failed` |
| `qss.failed.body` | `{reason}` |
| `qss.collapsed.summary` | `{scope} · {n} checks · revision {rev}` |
| `qss.collapsed.change` | `Change` |

**QSS-106** `qss.limits` is 101 characters and is the replacement for the 245 character string measured in `[shot: 02]`. The withdrawal clause that string carried is removed, because QSS-45 forbids stating that fact twice and `qss.vocab.withdrawn` already carries it.

**QSS-107** Copy MUST NOT be invented at the keyboard. A string needed and absent from this catalogue is a change to this document.

---

## 14. Constants

**QSS-108** Every number in the normative body appears here.

| Constant | Value | Requirement |
| --- | ---: | --- |
| Settings rows | 4 | QSS-23, QSS-24 |
| Label column, Expanded and Shallow | 90 px | QSS-25 |
| Label column, Narrow | 72 px | QSS-88 |
| Settings row height | 32 px | QSS-26 |
| Action line height | 36 px | QSS-26 |
| Settings region total | 164 px | QSS-26 |
| Settings region width cap | 1,040 px | QSS-33 |
| Measure | 72 characters | QSS-40 |
| Measure at 12.5 px | 440 px | QSS-41 |
| Measure at 13 px | 460 px | QSS-41 |
| Measure at 15 px | 530 px | QSS-41 |
| Limits statement length | 101 characters | QSS-46 |
| Limits statement height | 36 px | QSS-46 |
| Idle total | 344 px | QSS-75 |
| Width threshold | 600 px | QSS-86 |
| Width exit | 616 px | QSS-86 |
| Height threshold | 400 px | QSS-86 |
| Height exit | 416 px | QSS-86 |
| Recovery width | 240 px | QSS-86 |
| Body text contrast | 4.5 to 1 | QSS-98 |
| Graphic contrast | 3 to 1 | QSS-98 |
| Display scale assumed in section 3 | 1.5 | QSS-11 |

---

## 15. Registration

**QSS-109** This document owns `QSS`. Verified free at the time of writing against `EXT`, `FND`, `IND`, `QLY` and `SUG` in the spec folders, and against `DEF`, `EXT` and `FND` in `docs/`.

**QSS-110** `specs/quality/README.md` needs a pointer this task has no authority to add, because that file is existing content. The sentence to paste into its section 3 reads: "The scan settings region, the pre scan states, and the row, wrap, width and measure discipline those require are specified by `specs/quality-settings/README.md`, which owns `QSS` and supersedes QLY-17, QLY-18, QLY-21, QLY-39, QLY-45 and QLY-74 within that boundary."

**QSS-111** Six `QLY` requirements go stale the moment this document is implemented. They are listed in Appendix B.2 and the edit to `specs/quality/README.md` that would mark them is outside this task's authority, exactly as `QLY-193` recorded the same situation for the profile sentence in `docs/ontology-quality.md`.

---

## Appendix A. Native stack mapping (non normative)

**A.1** The settings region is four flex rows inside one container with a `max-width` of the QSS-33 cap and no `flex-grow` on the container. Each row is a fixed label column and a content column with `min-width: 0`.

**A.2** QSS-32's rails use the staged layout primitive: `overflow-x: auto`, `scroll-snap-type: x proximity`, trailing padding so the last item does not sit flush, and `scroll-padding-inline` so a focused control scrolls clear of the edge. The primitive sets structure only and no palette, type or spacing.

**A.3** The `od-fill` spacer QSS-18 names is a single element in `[proto]`'s Scope row. Deleting it and moving the action to its own line is the whole of QSS-28 and QSS-30 at the markup level.

**A.4** Presentation uses `container-type: size` with `container-name` on the pane element and `@container` queries. In Axiom the container is the measured rectangle supplied by `AdaptivePane.tsx`. `[docs: adaptive-pane-ux.md]`

**A.5** QSS-41's caps are `max-width` on the prose element, not `width`, so a shorter string does not reserve the measure.

**A.6** An Empty control is a `button` with `aria-disabled="true"` rather than `disabled`, so QSS-97 keeps it focusable while QSS-50 keeps it inert.

---

## Appendix B.1. Divergences measured in the captures

| # | Requirement | Measured | Required | Blocking |
| ---: | --- | --- | --- | :-: |
| 1 | QSS-28, QSS-30 | `Run scan` pinned about 1,520 px from the scope control by an expanding spacer | On its own line at the end of the settings it commits | yes |
| 2 | QSS-33, and `[QLY-20]` before it | Every settings row takes the full pane width | The region caps at 1,040 px | yes |
| 3 | QSS-46 | The limits statement is 245 characters on one line | 101 characters over two lines within the measure | yes |
| 4 | QSS-50, QSS-51 | `Individuals 0`, `Object properties 0`, `Data properties 0` rendered identically to live controls | Rendered, not selectable, marked | yes |
| 5 | QSS-55, QSS-56 | `Publication metadata` absent, indistinguishable from the correctly withdrawn `Retired entities` | Rendered as an Available control that can be switched on | yes |
| 6 | QSS-26 | Rows measure about 38 px narrow and about 45 px wide | 32 px | no |
| 7 | QSS-24, QSS-32 | Four rows wrap to seven at 619 px | Four rows at every width, rails instead of wraps | no |
| 8 | QSS-53, QSS-54 | Three checks reported withdrawn, none named | Each named with the vocabulary that removed it | no |
| 9 | QSS-63 | The census spends two rows | One row | no |
| 10 | QSS-65 to QSS-68 | `Classes 5,559` against `6,172 classes`, unreconciled | Agree, or each state its denominator | no |
| 11 | QSS-72, QSS-73 | The settings region is a header band above a body that is about 92 per cent empty | The settings region occupies the idle body | no |
| 12 | QSS-91 | `[proto]` marks three of four settings rows `at-tall`, withdrawing them when the pane is shallow | The rows stay and the pane scrolls | no |

**B.1 note.** Rows 1 to 5 block because each of them changes what a reader can do or can conclude. Rows 6 to 12 are measurable and real and none of them prevents a correct scan.

## Appendix B.2. Superseded requirements

| # | Superseded sentence | Source | Superseded by | Reason |
| ---: | --- | --- | --- | --- |
| 1 | "Settings block, per row 32, Four rows maximum, so 128 total" | `QLY-17` | QSS-24, QSS-26, QSS-32 | The budget assumes rows do not wrap and never says what happens when one cannot fit. `[shot: 01]` wrapped four rows to seven and doubled the block. A budget that assumes no wrapping is not a budget. |
| 2 | "Chrome, meaning command bar plus tools bar plus limits line plus footer, MUST total at most **136** CSS pixels at the Expanded presentation. Everything else is the findings list." | `QLY-18` | QSS-75 | The sentence budgets the scanned pane and leaves the idle pane unbudgeted, which is the state both captures are in. |
| 3 | The cap table of `QLY-21`, which carries no row for the limits statement | `QLY-21` | QSS-40, QSS-41 | A per region pixel table drifts as copy changes and silently omits regions. One measure rule, stated in characters with a pixel equivalent per type size, cannot omit a region. |
| 4 | "A kind with no instances in the store MAY be offered with a zero count" | `QLY-39` | QSS-50, QSS-51 | The permission is what put three dead controls on screen. `QLY-48` already forbids the same thing for a group chip, so the two rows disagreed with each other. |
| 5 | "The limits statement MUST be one line at the Expanded and Narrow presentations" | `QLY-45` | QSS-44 to QSS-48 | One line without a measure becomes a 245 character line at a wide pane. The replacement keeps the standing statement and the ban on a disclosure, and constrains the line rather than the line count. |
| 6 | "A default off check is available and switched off; a withdrawn check is not available. The product surface MUST NOT present them with the same affordance." | `QLY-74` | QSS-49, QSS-52, QSS-55 | The requirement is correct and was never given a presentation, so both states resolved to the same thing: absent. The four state table supplies the presentations the sentence assumed. |

**B.2 note.** Five of these six are requirements written earlier in this same session, by the same author, against the same pane. Rows 1, 3 and 5 share one cause: a rule written on one axis with no counterpart on the other, which is the third time that failure has appeared in this suite. QSS-40 states the measure once for every region precisely so there is no second place to forget it.

## Appendix B.3. What was not read

**B.3.1** The Axiom source was not read. Every claim about shipped behaviour comes from a capture, from `quality.html`, or from a repository document.

**B.3.2** `docs/verification.md` was not read. It may record measured behaviour for this pane that would settle Appendix B.1 rows 6, 10 and 12.

**B.3.3** `docs/ontology-quality.md` was read in full during the writing of `specs/quality/README.md` and was not re read for this document. The `QLY` requirements cited here were read verbatim from `specs/quality/README.md`.

**B.3.4** Neither capture exercises the Narrow, Shallow, Narrow and shallow or recovery presentations, so QSS-88 is specified from the published policy and from the structure, not from evidence.

**B.3.5** Both captures are of the same ontology and the same pre scan state. Nothing here is evidence about a pane carrying findings.

**B.3.6** The full screen capture is clipped at the leading edge on every line. Whether the window sits partly off the display or the pane clips its own label column cannot be determined from one image, and no requirement here depends on the answer.
