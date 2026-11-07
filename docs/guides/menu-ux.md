# Menu organization for Axiom

Design review and implementation record, updated 1 November 2026. The source audit and original proposals below record the design rationale. The delivered behavior includes the approved Analyze, Find and Suggest grouping and instance-report shortcuts.

## Command consistency (1 November 2026)

The graph's buttons and settings had been added one issue at a time, and the same action carried different names in different places. This pass gives every command one label, one shortcut and one enabled and checked state, all defined in [commands.ts](../../src/shared/commands.ts). The menu bar, the command palette, the graph's command row and the context menus read from that definition.

### Graph chrome

The graph pane follows the rule the other views already follow: one 28 px action row and nothing else. The toolbar (43 px, and it wrapped), the settings footer and the selection bar together took about 115 CSS px of the pane; the canvas now gets that height back, less the 28 px row. The row is a `SharedActionRow`, so it measures its width and moves commands into More actions in a fixed order rather than wrapping.

| Position | Control | Menu equivalent |
| --- | --- | --- |
| Left, never overflows | Add entity | Graph > Add entity (Insert) |
| Right | Expand to limit | Graph > Expand to limit |
| | Hand, a toggle with a pressed state | Graph > Hand, checked |
| | Fit, Center | Graph > Fit graph (F), Center graph |
| | Relayout, the layout list | Graph > Relayout (L), Layout, a radio group |
| | Freeze layout, a toggle with a pressed state | Graph > Freeze layout (Space), checked |
| | Cancel layout, only while one runs | Graph > Cancel running layout |
| | Display, opening Display options | Graph > Display options |
| | Export | Graph > Export... (Ctrl+Shift+E) |
| | More actions | Select edge..., Graph appearance..., Graph stylesheet..., Clear graph |

Display options holds Show edges, Show labels, Show counts, Color clusters, Clusters, Node spacing, Visible node limit and Eviction policy. The Clusters slider sits directly under Color clusters, from Strict (0%) connected islands to Loose (100%) groups that sit together in the layout (craigtrim/axiom#205). It defaults to Loose, saves separately for each graph view, previews during a drag and creates one Undo step per gesture. It stays enabled while the graph shows nodes, including when Color clusters is off or disabled. Color clusters remains visible and explains why it is disabled below two clusters at the selected setting.

The visibility and color toggles also appear in Graph > Show, and the eviction choices in Graph > Eviction policy. Graph > Display options opens the sliders and other settings from the menu bar or palette. Select edge... replaces the toolbar's edge list, which listed every edge in view; it opens a filterable list instead.

A toggle keeps its label and shows its state as a pressed button in the row and a checkmark in menus. Freeze no longer becomes Resume, and Pin no longer becomes Unpin.

The status bar shows the active graph's readout in the main window: the node count against the limit, the layout, relationships and held-back neighbors, and the selected node or edge. Clicking the node count opens Display options. Detached windows have no status bar, so the graph row shows the node count there, and the reconnect instruction appears in the row in either window.

Object commands left the pane chrome. A node's Expand, Collapse, Pin in graph, Show in Hierarchy, Touchpoints and Show instances are in its context menu, the Graph and Edit menus and the keyboard. An edge's Details, Reset route and Remove edge are in its context menu and Graph > Edges.

### Menu rules

- One label per behavior. Where a command row button repeats the view's name, it drops it ("Fit" in the row, "Fit graph" in the menu), following rule 3 of [adaptive layouts](adaptive-pane-ux.md#rules-every-applicable-view-shares).
- Sentence case and US English, following Microsoft's style guide: Add children, Define new, Maximize pane, neighbors.
- An ellipsis on a menu item that opens a dialog for more input, such as Export..., Select edge... or Delete class.... Command row buttons omit it.
- Context menus show the shortcut right-aligned and set the object's default action in bold: Expand for a node, Details for an edge and for a Hierarchy row. The shortcut is shown but not announced, so an item's accessible name stays its label.
- Access keys are unique within each menu level. Details is T in every entity and edge menu. Each item announces both the bare letter and Alt with it, since both work.
- Shift+F10 and the Menu key open the menu for the selected node or edge. With nothing selected on the graph they open the canvas menu at the canvas center.
- The menu bar order is File, Edit, View, Graph, Query, Tools, Window, Help, with Tools after the application's own menus.
- Commands that had been reachable only from a context menu are now also on the menu bar: Edit > Show in Hierarchy, Add neighbors to graph and Copy IRI, and Query > New query.

### Not changed in this pass

Right-click menus (`ContextMenu`) and pane overflow menus (`SharedMenu`) are still two components. They now share the same checkmark, radio and shortcut conventions. The other views keep their own More triggers because their visual references pin them, but Details' More no longer hides in a narrow pane, where it was the only path to Reload.

## Editor context-menu access keys (4 October 2026)

Monaco editor menus now show underlined, unique letter keys. Text Analysis uses F for Find, A for Add entity, T for Cut, C for Copy and P for Paste. Selected-text commands appear only with a selection. Query, ontology source, entity source and detached-window editor menus use the same adapter. Existing hierarchy, graph and tab menus retain their access keys. Plain letters or Alt+letter activate an enabled item; arrows, Enter and Escape retain menu navigation. Ctrl/Meta shortcuts and composition events are not treated as menu letters.

The adapter observes Monaco's open shadow-root popups, suspends application accelerators while a popup is open, and delegates actions to Monaco's action handler. Paste reads plain text through the trusted desktop bridge and applies it to the owning Monaco editor for mouse, Enter and P activation, including detached panes that share the main renderer. Browser clipboard-read permission remains disabled. Replies are ignored if the editor, focus, selection, model version or read-only state changed while the read was pending.

## Delivered behavior

File > Open contains Workspace... (Ctrl+O), Recent and Examples. Examples contains Pizza. Recent retains up to 12 successfully opened or saved workspace and ontology files across restarts, newest first. Reopening a file moves it to the top without adding a duplicate. Every entry shows its full absolute file path. Recent is disabled when empty. Recent-file clicks use the same unsaved-change handling and file validation as Workspace...; a failed or cancelled open does not add that file to the list.

Hierarchy and graph context menus now use separators for logical groups. Common commands remain directly accessible. Pin in graph shows a checkmark; class-only commands are omitted for other entity types; Delete class remains last. Graph canvas menus contain the two creation actions followed by the view commands. Window now has a Move pane submenu with Left, Right, Top and Bottom. Menu entries retain explicit access keys, disabled items are focusable without being executable, Escape restores focus, and Tab moves outside the popup.

Entity menus in Hierarchy and Graph place **Analyze**, **Find** and **Suggest** together. Analyze contains **Sparsity** and appears for classes only. Find contains **Similar**, **Synonyms** and **Touchpoints**; Hierarchy classes also offer **Instances**. Suggest contains **Add children**, **Add parents** and **Define new**. Research has been replaced by Touchpoints. Blank nodes retain disabled Synonyms and Touchpoints actions. Sparsity is also disabled for anonymous classes because the report analyzes named-class branches.

With the context menu open, **A**, **F** and **G** open Analyze, Find and Suggest on either surface. Inside Find, **S**, **Y**, **T** and **I** select Similar, Synonyms, Touchpoints and Instances respectively. Sparsity uses **S** inside Analyze; Suggest uses **C**, **P** and **N**. Hierarchy's Add neighbors to graph uses **E**. Graph's Show in Hierarchy uses **Y**, the same letter as Edit > Show in Hierarchy, while Rename retains **N**. Details is **T** in every entity and edge menu. Left or Escape closes a submenu and returns focus to its trigger, including after switching submenus with the pointer.

Show instances scopes the Individuals grid in place for an imported ontology, from the hierarchy, graph or Edit menu. The class choice above the grid uses the same scope and retains each class's column layout. Each page contains at most 100 records. The built-in example's generated records retain their read-only instance report. Showing individuals never seeds, expands or replaces the graph. Selecting a row fills Inspector.

The report identifies its class and direct-instance count. If its last instance is removed while the report is open, it displays an empty state. It stays scoped to that class when other selections change. Switching workspaces clears the report, and closing then reopening the Individuals pane retains it during the current session. Detached panes use the same report.

Dragging from an unselected node draws an edge; dragging an already selected node moves it. With **Hand** pressed in the graph's command row (craigtrim/axiom#189), dragging any node moves it and dragging anywhere else moves the view. Connect nodes is available through Graph > Edges and the command palette, with C as the graph shortcut. The node context menu omits this command. These commands support keyboard endpoint selection and share the same attachment behavior as dragging. See [Connecting nodes](graph-editing.md#connecting-nodes) for the gesture rules and ontology relationship defaults.

## Counts and action availability

Actions that open an existing collection show its current count and remain visible but disabled when that count is zero. Show instances uses the same direct-membership count in hierarchy and graph menus, Inspector, Edit and the command palette. Labels read Show instances (527) or Show instances (0). Inspector shortcuts show the number directly. Hierarchy counts are plain text and omit zero; its row menu retains Show instances (#91). Class choices in the report and Individuals filters also show counts and disable empty choices.

Counts update after edits and Undo. Instance buttons and popup items explain the empty state in their tooltip, and the shared invocation guard blocks stale or remapped requests. A report already open remains available when its last instance disappears. The application menu updates labels and availability through Electron's [dynamic MenuItem properties](https://www.electronjs.org/docs/latest/api/menu-item#instance-properties).

Apply the rule to browsing existing data. Creation and discovery commands such as New instance, Add children and Find instances remain available for an empty class. Hierarchy branch actions show the immediate child count and disable empty branches. Graph Expand is disabled when there are no neighbours; Collapse is disabled when there are no shown connections. These states agree across graph controls, context menus, the application menu and the command palette. Collection sizes must describe the actual scope of the action; do not use a descendant count for a direct-instance report.

## Original recommendation

Add separators between meaningful groups in the entity and graph context menus. Keep their frequently needed commands directly accessible. Introduce a submenu when its name predicts a coherent set of choices and the extra step has a clear benefit. The existing context menus do not need cascades merely because they have several groups.

The first revision kept all four context-menu types flat and used a Move pane submenu in the application Window menu. Issue #18 subsequently approved the Analyze, Find and Suggest submenus for the entity menus. Theme, Workbench arrangement, Layout and Pan and zoom retain their existing submenus. No usage study establishes the relative frequency of these commands.

## Microsoft guidance and its scope

| Source | Finding | Application to Axiom |
| --- | --- | --- |
| [Fluent 2: Menu](https://fluent2.microsoft.design/components/web/react/core/menu/usage) | Group related options, use dividers for clearer boundaries, order actions sensibly, and place dangerous actions late. Excessive nesting makes commands harder to reach and their context harder to remember. | Group the existing commands before considering cascades. Put Delete class at the end. |
| [Windows: Menu flyout and menu bar](https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/menus) | Current controls explicitly support separators, submenus, toggles and mutually exclusive choices. Icons are useful when recognizable; every command does not need one. | Separators and checked pin state are established conventions. Avoid inventing icons for ontology-specific operations. |
| [Windows: Menus and context menus](https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/menus-and-context-menus) | Context menus attach secondary commands to an object. Frequent commands can also have direct controls. The WinUI recommendation for familiar editing commands includes a command bar flyout. | Preserve pane buttons and shortcuts. An icon-only editing strip is not automatically appropriate for specialized commands such as Add children. |
| [Windows 7 desktop menu guide](https://learn.microsoft.com/en-us/windows/win32/uxguide/cmd-menus) | Separators distinguish groups. The guide discourages unnecessary context-menu cascades, suggests no more than 15 context items and seven items per group, and recommends useful sets of at least three submenu choices. | Treat these numbers as legacy heuristics, not current Windows 11 requirements. The page explicitly says it has not been updated for newer Windows versions. |
| [Windows app best practices](https://learn.microsoft.com/en-us/windows/apps/get-started/best-practices) | Common controls and consistent platform behavior reduce relearning. Its Windows 11 Explorer section describes shell-specific organization and extension rules. | Apply familiar behavior. Explorer's Show more options and app-extension flyouts are not a prescribed information architecture for an ontology editor. |

The supplied screenshot demonstrates separators and cascading menus. It does not establish that every context menu should use both, or that its visual styling is the current Windows 11 reference.

## Source audit before implementation

Counts below exclude separators and include disabled entries. They describe the application-owned menus inspected in source, not third-party editor or grid internals.

| Surface | Current implementation | Proposed organization |
| --- | --- | --- |
| Hierarchy entity menu | Up to 13 flat commands. Branch navigation, graph actions, creation, deletion and assistant actions share one uninterrupted list. Delete class sits before Details and Copy IRI. | Group navigation, editing/creation, assistant actions, copying and deletion. Use a Show in graph submenu for Current graph and New graph. |
| Graph node menu | Ten entries including Dismiss. Pin / unpin does not expose the current state. | Group editing, external links, graph display and copying. Use checked Pin in graph. Dismiss can be removed after verifying outside-click and keyboard dismissal. |
| Graph edge menu | Five flat actions: editing, reconnection, route reset and removal. | Keep editing/reconnection together; separate route display and removal. A two-item Reconnect submenu adds little value. |
| Empty graph canvas | Two creation commands plus Dismiss. | Two direct creation commands are sufficient. No separator or submenu is needed between them. |
| Application menu bar | Separators and several submenus already exist. Window contains 16 command entries, including four Move pane directions. | Preserve useful existing submenus. Group the four directions under Move pane. |

Source: [EntityMenu.tsx](../../src/renderer/EntityMenu.tsx), [GraphPanel.tsx](../../src/renderer/GraphPanel.tsx), [commands.ts](../../src/shared/commands.ts), and the menu installation in [main.ts](../../src/main/main.ts).

## Menu layouts

These outlines show the implemented logical boundaries, not pixel specifications. Pin in graph has a checkmark when pinned. Expand branch changes to Collapse branch when appropriate.

### Hierarchy class

```text
Show in graph > New graph / Current graph (Ctrl+G)
Show instances
Expand branch
Add neighbors to graph
Pin in graph
--------------------------
Details                    Alt+Enter    bold: Enter opens it
Rename                     F2
New subclass               Ctrl+Shift+N
New instance               Ctrl+Shift+I
--------------------------
Analyze > Sparsity
Find > Similar / Synonyms / Touchpoints / Instances
Suggest > Add children / Add parents / Define new
--------------------------
Copy IRI
--------------------------
Delete class...            Delete
```

Show in graph is prominent because moving an entity into the graph is central to this workbench. The four editing and creation actions stay together. Analyze, Find and Suggest form an adjacent group. Find > Instances discovers new members of a class, while Show instances opens the existing records. Copy IRI remains a single direct command. Delete class has its own final group to make accidental selection less likely.

The additional separators make this menu taller. Check it at high display scaling and in small detached windows; grouping is not a substitute for keeping the entire command list reachable.

### Graph node

```text
Expand (Collapse when expanded)    Enter (Shift+Enter)    bold: the default
Hide                               Delete
Rename                             F2
Details                            Alt+Enter
Show in Hierarchy
New instance
Show instances (count)
--------------------------
Analyze > Sparsity
Find > Similar / Synonyms / Touchpoints
Suggest > Add children / Add parents / Define new
--------------------------
Pin in graph                       P
Copy IRI
```

Hide removes the node from the current view and preserves ontology data. Expand and Collapse share one position in the menu. Expansion state is saved per graph. Show in Hierarchy reveals the row while keyboard focus stays on Graph. Show instances opens the existing report and is disabled at zero.

Add parents uses the selected assistant to propose existing parents from the ontology catalog. Users review the matches before Axiom adds parent relationships. Touchpoints independently searches Wikipedia for external resources.

### Graph edge

```text
Details              (T)    Enter     bold: the default
Reconnect source     (S)
Reconnect target     (G)
--------------------------
Reset route          (R)
--------------------------
Remove edge          (M)    Delete
```

### Graph canvas

The empty canvas is the graph view itself, so its menu carries the view commands. Shift+F10 or the Menu key opens it at the canvas center when nothing is selected.

```text
New class here
New instance here
--------------------------
Fit graph                   F
Center graph
Relayout                    L
Freeze layout               Space    (checked while frozen)
--------------------------
Show > Show edges / Show labels / Show counts / Color clusters
Display options
--------------------------
Export...                   Ctrl+Shift+E
```

### Pane tab

```text
Rename tab
Tab history
--------------------------
Maximize pane
Float pane
Detach pane to window
--------------------------
Close tab                   Ctrl+W
```

The three pane commands come from the Window menu and act on the tab that was right-clicked.

### Application Window menu

```text
Next pane
Previous pane
Next tab
Previous tab
--------------------------
Move pane                 > Left
                            Right
                            Top
                            Bottom
Group pane with graph
Make pane wider
Make pane narrower
--------------------------
Maximize pane
Float pane
Detach pane to window
Return all panes to main window
Close pane
```

The directional submenu reduces four repeated top-level entries to one predictable category. It is a better initial use of nesting than putting New subclass and New instance behind New, or Touchpoints/Add children/Find instances behind a broad label such as More. The latter choices deserve reconsideration only if observation shows the direct menus are hard to scan.

## Consistency rules

- Use the same labels and grouping rationale wherever the same action appears. Context-specific commands can differ between Hierarchy and Graph.
- Bind access keys to action identities rather than array positions. EntityMenu now assigns explicit letters to actions. Preserve established mnemonics where possible and check collisions within each menu level.
- Show pin state using a stable checked option. Do not add a checkmark to one-shot commands such as finding touchpoints.
- Omit operations that cannot apply to the object type, such as New subclass for a property. Keep expected operations disabled when temporarily unavailable, such as assistant suggestions during a run. Normalize separators after filtering so none appear first, last or consecutively.
- Use submenus with predictable names. Reserve the arrow for opening the submenu; the parent must not also run an unrelated action. Prefer a single submenu level for Axiom's context menus. That depth limit is a product choice, not a Microsoft requirement.
- Keep command order stable within an object type. Do not reorder according to recent clicks without evidence that the benefit outweighs relearning.
- Review ellipses by behavior: requesting information before completing a command differs from simply opening a pane. Apply any wording correction consistently across menus and buttons.

## Keyboard and accessibility work

Axiom's shared [ContextMenu.tsx](../../src/renderer/ContextMenu.tsx) already supports arrow navigation, Home/End, mnemonics, outside-click dismissal and returning focus on close. Its action model now distinguishes separators and optional checked states, with conditional visibility and explicit keys. The Show in graph cascade uses the same component in Hierarchy.

The [W3C menu pattern](https://www.w3.org/WAI/ARIA/apg/patterns/menubar/) supplies the relevant semantics for the React implementation: separators are noninteractive; submenu triggers expose their expanded state; Right opens a submenu; Left returns to its parent; Escape closes the current level. Disabled menu items remain discoverable through focus but cannot execute. Tab leaves the menu rather than moving between its items.

The original component skipped disabled buttons and handled Tab like Escape. The revised component makes disabled items focusable and sends Tab to the next control outside the menu. A submenu must also stay reachable near window edges and during diagonal pointer movement. Focus and positioning must use the invoking document, including detached panes.

The minimum verification for a revision is keyboard-only operation, checked/disabled announcements, outside-click dismissal, correct target attribution, small-window scrolling, and light/dark/high-contrast rendering. Test conditional menus on classes, properties, individuals and Thing. For any cascade, include left-opening placement, pointer travel, parent focus restoration and closing the whole menu after a command. Automated accessibility checks supplement an actual screen-reader pass.

## Implementation choice

Axiom's Windows title band and its application-menu popups are rendered in the page using the shared React ContextMenu component, following Craig's issue #66 shell reference. Electron still builds the authoritative command menu: the bridge reads its labels, access keys, enabled/checked state and accelerators, and validates the selected item again before invoking it. This preserves the existing command registry, native roles and dynamic Recent entries. Detached panes keep Electron's F10 popup.

The shared React component now renders separators and checked options. The Show in graph cascade extends this component and preserves detached-window ownership and local UI actions. A shared typed menu description should distinguish commands, separators, checked options and submenu parents whichever renderer is chosen.

## Evidence still needed

The grouping follows documented conventions and the source audit. There is no measured task-time improvement or Axiom command-frequency dataset behind them. Compare the current menus with grouped flat menus first. Observe time to find commands, wrong selections, pointer travel and keyboard completion. Trial a nested variant only for groups where it produces a measurable improvement. The initial research supports separators more strongly than adding cascades to the node menus.

## Zooming an individual view

Hold Ctrl and turn the mouse wheel over Individuals or another view to zoom that view. An ordinary wheel gesture scrolls its content. Each view remembers its own scale, including when detached and returned to the main window. The supported range is 50% to 300%.

Graph retains its existing wheel zoom. The View menu's zoom commands and Ctrl+Plus/Ctrl+Minus continue to control Axiom as a whole.

The shared pane wrapper handles the gesture before a grid or editor can consume it. Tests in tests/e2e/pane-zoom.spec.ts cover Individuals scrolling and row selection, other views and editors, saved scale, detached panes, and Graph's existing wheel behavior.
