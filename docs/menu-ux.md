# Menu organization for Axiom

Design review and implementation record, updated 16 September 2026. The source audit and proposals below record the design rationale. The delivered behavior includes the approved grouping and the subsequently requested instance-report shortcuts.

## Delivered behavior

Hierarchy and graph context menus now use separators for logical groups. Common commands remain directly accessible. Pin in graph shows a checkmark; class-only commands are omitted for other entity types; Delete class remains last. Graph canvas menus contain the two creation actions. Window now has a Move pane submenu with Left, Right, Top and Bottom. Menu entries retain explicit access keys, disabled items are focusable without being executable, Escape restores focus, and Tab moves outside the popup.

Show instances opens the same read-only Individuals report from a hierarchy context menu, graph context menu, graph selection bar, hierarchy count, Inspector usage count or Edit menu. Selecting a class in the existing Individuals filters uses that report too. Each page contains at most 100 records, with filtering and Previous/Next controls. It combines generated and named records using the same direct-membership lookup as the hierarchy count. Showing a report never seeds, expands or replaces the graph. Clicking a report row opens its Inspector details.

The report identifies its class and direct-instance count. If its last instance is removed while the report is open, it displays an empty state. It stays scoped to that class when other selections change. Switching workspaces clears the report, and closing then reopening the Individuals pane retains it during the current session. Detached panes use the same report.

Connect nodes is available in the graph toolbar, node context menu, Graph > Edges and command palette. The graph shortcut is C. It starts the same source/target selection flow as the selected node's drag handle, with a confirmation dialog before changing the ontology.

## Counts and action availability

Actions that open an existing collection show its current count and remain visible but disabled when that count is zero. Show instances uses the same direct-membership count in hierarchy and graph menus, the graph selection button, Inspector, Edit and the command palette. Labels read Show instances (527) or Show instances (0). Hierarchy and Inspector shortcuts show the number directly. Class choices in the report and Individuals filters also show counts and disable empty choices.

Counts update after edits and Undo. Instance buttons and popup items explain the empty state in their tooltip, and the shared invocation guard blocks stale or remapped requests. A report already open remains available when its last instance disappears. The application menu updates labels and availability through Electron's [dynamic MenuItem properties](https://www.electronjs.org/docs/latest/api/menu-item#instance-properties).

Apply the rule to browsing existing data. Creation and discovery commands such as New instance, Add children and Find instances remain available for an empty class. Hierarchy branch actions show the immediate child count and disable empty branches. Graph Expand is disabled when there are no neighbours; Collapse is disabled when there are no shown connections. These states agree across graph controls, context menus, the application menu and the command palette. Collection sizes must describe the actual scope of the action; do not use a descendant count for a direct-instance report.

## Recommendation

Add separators between meaningful groups in the entity and graph context menus. Keep their frequently needed commands directly accessible. Introduce a submenu when its name predicts a coherent set of choices and the extra step has a clear benefit. The existing context menus do not need cascades merely because they have several groups.

For a first revision, keep all four context-menu types flat. Use a Move pane submenu in the application Window menu, which currently repeats four directional commands. Keep the existing Theme, Workbench arrangement, Layout and Pan and zoom submenus. This is an Axiom design judgment; no usage study establishes the relative frequency of its commands yet.

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
| Hierarchy entity menu | Up to 13 flat commands. Branch navigation, graph actions, creation, deletion and assistant actions share one uninterrupted list. Delete class sits before Edit details and Copy IRI. | Group navigation, editing/creation, assistant actions, copying and deletion. Keep all actions at the first level. |
| Graph node menu | Ten entries including Dismiss. Pin / unpin does not expose the current state. | Group editing, research, graph display and copying. Use checked Pin in graph. Dismiss can be removed after verifying outside-click and keyboard dismissal. |
| Graph edge menu | Five flat actions: editing, reconnection, route reset and removal. | Keep editing/reconnection together; separate route display and removal. A two-item Reconnect submenu adds little value. |
| Empty graph canvas | Two creation commands plus Dismiss. | Two direct creation commands are sufficient. No separator or submenu is needed between them. |
| Application menu bar | Separators and several submenus already exist. Window contains 16 command entries, including four Move pane directions. | Preserve useful existing submenus. Group the four directions under Move pane. |

Source: [EntityMenu.tsx](../src/renderer/EntityMenu.tsx), [GraphPanel.tsx](../src/renderer/GraphPanel.tsx), [commands.ts](../src/shared/commands.ts), and the menu installation in [main.ts](../src/main/main.ts).

## Menu layouts

These outlines show the implemented logical boundaries, not pixel specifications. Pin in graph has a checkmark when pinned. Expand branch changes to Collapse branch when appropriate.

### Hierarchy class

```text
Show in graph
Show instances
Expand branch
Add neighbours to graph
Pin in graph
--------------------------
Edit details
Rename
New subclass
New instance
--------------------------
Research...
Add children
Find instances
--------------------------
Copy IRI
--------------------------
Delete class...
```

Show in graph is prominent because moving an entity into the graph is central to this workbench. The four editing and creation actions stay together. The three assistant actions share a boundary without requiring an extra click. Copy IRI remains a single direct command. Delete class has its own final group to make accidental selection less likely.

The additional separators make this menu taller. Check it at high display scaling and in small detached windows; grouping is not a substitute for keeping the entire command list reachable.

### Graph node

```text
Edit details
Show instances
Rename
Connect nodes
New instance
--------------------------
Research...
--------------------------
Expand
Collapse
Pin in graph
Remove from view
--------------------------
Copy IRI
```

Remove from view stays in the graph-display group. Its label must continue to distinguish it from deleting ontology data. Graph-specific exploration stays directly accessible; a Graph submenu would hide much of the reason to right-click a graph node.

### Graph edge

```text
Edit edge
Reconnect source
Reconnect target
--------------------------
Reset route
--------------------------
Remove edge
```

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
Maximise / restore pane
Float pane
Detach pane to window
Return all panes to main window
Close pane
```

The directional submenu reduces four repeated top-level entries to one predictable category. It is a better initial use of nesting than putting New subclass and New instance behind New, or Research/Add children/Find instances behind a broad label such as More. The latter choices deserve reconsideration only if observation shows the direct menus are hard to scan.

## Consistency rules

- Use the same labels and grouping rationale wherever the same action appears. Context-specific commands can differ between Hierarchy and Graph.
- Bind access keys to action identities rather than array positions. EntityMenu now assigns explicit letters to actions. Preserve established mnemonics where possible and check collisions within each menu level.
- Show pin state using a stable checked option. Do not add a checkmark to one-shot commands such as Research.
- Omit operations that cannot apply to the object type, such as New subclass for a property. Keep expected operations disabled when temporarily unavailable, such as assistant suggestions during a run. Normalize separators after filtering so none appear first, last or consecutively.
- Use submenus with predictable names. Reserve the arrow for opening the submenu; the parent must not also run an unrelated action. Prefer a single submenu level for Axiom's context menus. That depth limit is a product choice, not a Microsoft requirement.
- Keep command order stable within an object type. Do not reorder according to recent clicks without evidence that the benefit outweighs relearning.
- Review ellipses by behavior: requesting information before completing a command differs from simply opening a pane. Apply any wording correction consistently across menus and buttons.

## Keyboard and accessibility work

Axiom's shared [ContextMenu.tsx](../src/renderer/ContextMenu.tsx) already supports arrow navigation, Home/End, mnemonics, outside-click dismissal and returning focus on close. Its action model now distinguishes separators and optional checked states, with conditional visibility and explicit keys. Cascades remain in the Electron menu bar.

The [W3C menu pattern](https://www.w3.org/WAI/ARIA/apg/patterns/menubar/) supplies the relevant semantics for the React implementation: separators are noninteractive; submenu triggers expose their expanded state; Right opens a submenu; Left returns to its parent; Escape closes the current level. Disabled menu items remain discoverable through focus but cannot execute. Tab leaves the menu rather than moving between its items.

The original component skipped disabled buttons and handled Tab like Escape. The revised component makes disabled items focusable and sends Tab to the next control outside the menu. A submenu must also stay reachable near window edges and during diagonal pointer movement. Focus and positioning must use the invoking document, including detached panes.

The minimum verification for a revision is keyboard-only operation, checked/disabled announcements, outside-click dismissal, correct target attribution, small-window scrolling, and light/dark/high-contrast rendering. Test conditional menus on classes, properties, individuals and Thing. For any cascade, include left-opening placement, pointer travel, parent focus restoration and closing the whole menu after a command. Automated accessibility checks supplement an actual screen-reader pass.

## Implementation choice

Axiom uses Electron menus for the menu bar and a custom React popup for these object menus. [Electron's Menu API](https://www.electronjs.org/docs/latest/api/menu) supports popup menus and submenus, but documents Chromium-like presentation on Windows. Switching to it would not by itself guarantee the exact WinUI or Explorer appearance.

The shared React component now renders separators and checked options. Before adding cascades, compare Electron popup menus with extending the custom component, including detached-window ownership and preserving local UI actions such as inline rename. A shared typed menu description should distinguish commands, separators, checked options and submenu parents whichever renderer is chosen.

## Evidence still needed

The grouping follows documented conventions and the source audit. There is no measured task-time improvement or Axiom command-frequency dataset behind them. Compare the current menus with grouped flat menus first. Observe time to find commands, wrong selections, pointer travel and keyboard completion. Trial a nested variant only for groups where it produces a measurable improvement. The initial research supports separators more strongly than adding cascades to the node menus.
