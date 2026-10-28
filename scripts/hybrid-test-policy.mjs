// Required native cases assigned to Craig's local Windows desktop.
// CI runs the exact complement; neither group is optional for delivery.
// Keep keyboard/menu/modal suites and named focus/caret/overflow contracts together.
export const localDesktopCases = [
  // #177 validation: retain cross-window focus and camera/keyboard checks locally.
  {
    file: "multi-instance.spec.ts",
    title:
      "Open, Recent and Save As refuse another instance's file without changing either workspace",
  },
  {
    file: "graph-spacing.spec.ts",
    title:
      "the footer slider changes every layout, keeps zoom and pins, and retains spacing on relayout",
  },
  // #174: native context-menu key handling and focus restoration run locally.
  {
    file: "find.spec.ts",
    title:
      "Find row context menu opens from both keyboard keys and restores row focus",
  },
  {
    file: "adaptive-panes.spec.ts",
    title:
      "Compact edge actions, overflow and recovery remain keyboard accessible",
  },
  {
    file: "add-entity-groups.spec.ts",
    title:
      "grouped values focus, collapse, preview and commit as separate statements",
  },
  {
    file: "add-entity-groups.spec.ts",
    title: "single-value actions follow pointer and keyboard visibility",
  },
  {
    file: "add-entity-groups.spec.ts",
    title:
      "unused predicates, merging and final removal keep groups and focus coherent",
  },
  {
    file: "add-entity-reference.spec.ts",
    title:
      "blank forms enable Discard only for content in the row and overflow menu",
  },
  {
    file: "design-system-behavior.spec.ts",
    title:
      "a moving focused action returns focus to More and disabled primary keeps its border",
  },
  {
    file: "design-system-behavior.spec.ts",
    title:
      "menu handles disabled items, keyboard, outside press and one popup per document",
  },
  {
    file: "design-system-behavior.spec.ts",
    title:
      "recovery covers the pane, retains mounted drafts and restores focus",
  },
  {
    file: "details-ancestry.spec.ts",
    title:
      "a detached ancestry view centers the taxonomy selection without taking its focus",
  },
  {
    file: "details-refinement.spec.ts",
    title: "More has shared menu styling and returns keyboard focus in dark",
  },
  {
    file: "details-refinement.spec.ts",
    title: "More has shared menu styling and returns keyboard focus in light",
  },
  {
    file: "details-refinement.spec.ts",
    title:
      "resource suggestions leave the focused single-value Add action reachable",
  },
  {
    file: "details.spec.ts",
    title:
      "edge Details reuses hidden and detached tabs without taking focus on selection",
  },
  {
    file: "edge-creation.spec.ts",
    title:
      "low-zoom drops, keyboard commands and detached panes retain direct attachment",
  },
  {
    file: "edges.spec.ts",
    title:
      "dragging and keyboard bending save routes with Undo, Redo and workspace reload",
  },
  {
    file: "edges.spec.ts",
    title:
      "edge keyboard context menus reconnect and remain usable in detached windows",
  },
  {
    file: "entity-context-menu.spec.ts",
    title:
      "detached graph submenus fit both themes, restore focus and target the selected node",
  },
  {
    file: "entity-context-menu.spec.ts",
    title:
      "graph Analyze keyboard action opens the requested class and preserves RDF",
  },
  {
    file: "entity-context-menu.spec.ts",
    title:
      "graph Anonymous menu keeps unique keys, scoped actions and keyboard parent focus",
  },
  {
    file: "entity-context-menu.spec.ts",
    title:
      "graph Defined menu keeps unique keys, scoped actions and keyboard parent focus",
  },
  {
    file: "entity-context-menu.spec.ts",
    title:
      "graph Example menu keeps unique keys, scoped actions and keyboard parent focus",
  },
  {
    file: "entity-context-menu.spec.ts",
    title: "graph Find keyboard action opens Touchpoints without a search",
  },
  {
    file: "entity-context-menu.spec.ts",
    title:
      "graph relation menu keeps unique keys, scoped actions and keyboard parent focus",
  },
  {
    file: "entity-context-menu.spec.ts",
    title:
      "graph Root menu keeps unique keys, scoped actions and keyboard parent focus",
  },
  {
    file: "entity-context-menu.spec.ts",
    title:
      "graph Thing menu keeps unique keys, scoped actions and keyboard parent focus",
  },
  {
    file: "entity-context-menu.spec.ts",
    title:
      "graph value menu keeps unique keys, scoped actions and keyboard parent focus",
  },
  {
    file: "entity-context-menu.spec.ts",
    title:
      "hierarchy Analyze keyboard action opens the requested class and preserves RDF",
  },
  {
    file: "entity-context-menu.spec.ts",
    title:
      "hierarchy Defined menu keeps unique keys, scoped actions and keyboard parent focus",
  },
  {
    file: "entity-context-menu.spec.ts",
    title: "hierarchy Find keyboard action opens Touchpoints without a search",
  },
  {
    file: "entity-context-menu.spec.ts",
    title:
      "hierarchy relation menu keeps unique keys, scoped actions and keyboard parent focus",
  },
  {
    file: "entity-context-menu.spec.ts",
    title:
      "hierarchy Root menu keeps unique keys, scoped actions and keyboard parent focus",
  },
  {
    file: "entity-context-menu.spec.ts",
    title:
      "hierarchy Thing menu keeps unique keys, scoped actions and keyboard parent focus",
  },
  {
    file: "entity-context-menu.spec.ts",
    title:
      "hierarchy value menu keeps unique keys, scoped actions and keyboard parent focus",
  },
  {
    file: "extend-audit.spec.ts",
    title:
      "#56 dark: minimum pane and zoom keep choices and keyboard focus visible",
  },
  {
    file: "extend-audit.spec.ts",
    title:
      "#56 dark: recovery dismisses the open dropdown and restores working focus",
  },
  {
    file: "extend-audit.spec.ts",
    title:
      "#56 light: minimum pane and zoom keep choices and keyboard focus visible",
  },
  {
    file: "extend-audit.spec.ts",
    title:
      "#56 light: recovery dismisses the open dropdown and restores working focus",
  },
  {
    file: "extend-audit.spec.ts",
    title:
      "#56 outside dismissal keeps the clicked input's focus and accepts typing",
  },
  {
    file: "extend-audit.spec.ts",
    title:
      "#56 synonym addition retains row focus and remains available: PSY 101 Fall 2026, narrow=false",
  },
  {
    file: "extend-audit.spec.ts",
    title:
      "#56 synonym addition retains row focus and remains available: PSY 101 Fall 2026, narrow=true",
  },
  {
    file: "extend-audit.spec.ts",
    title:
      "#56 synonym addition retains row focus and remains available: Psychology, narrow=false",
  },
  {
    file: "extend-audit.spec.ts",
    title:
      "fallback leaves memory intact, stale results cannot execute, and keyboard opens either half",
  },
  {
    file: "extend-audit.spec.ts",
    title:
      "remembered action repeats against the current row and query, with correct saved RDF and focus",
  },
  {
    file: "find-adaptive.spec.ts",
    title:
      "Find recovery retains its query and returns focus through Maximize pane",
  },
  {
    file: "find-adaptive.spec.ts",
    title:
      "focused scope stays mounted and withdrawn pager focus returns to the query",
  },
  {
    file: "find-adaptive.spec.ts",
    title:
      "Options retains the result scroll and returns focus on Escape, even after growing",
  },
  {
    file: "find-adaptive.spec.ts",
    title:
      "query and result keyboard bindings select, page and open Details deliberately",
  },
  {
    file: "find-adaptive.spec.ts",
    title:
      "Recent searches and More disclose by keyboard and remain open across resizing",
  },
  {
    file: "find-context.spec.ts",
    title: "selecting a scrolled result preserves its position and focus",
  },
  {
    file: "find.spec.ts",
    title:
      "Find also scrolls a detached taxonomy without taking focus from the results",
  },
  {
    file: "find.spec.ts",
    title:
      "Find synonym action permits name and synonym matches, withholds blank text and supports keyboard activation",
  },
  {
    file: "graph-zoom.spec.ts",
    title:
      "wheel and keyboard zoom continue below the former floor and Fit recovers the view",
  },
  {
    file: "hierarchy-multiselect.spec.ts",
    title:
      "keyboard ranges, Ctrl+Space, Ctrl+A and filtering use visible rows only",
  },
  {
    file: "hierarchy-reference.spec.ts",
    title:
      "keyboard focus, ranges and Enter use the focused row and the existing Details tab",
  },
  {
    file: "hierarchy-reference.spec.ts",
    title:
      "overflow retains disabled actions, keyboard navigation and the hierarchy search command",
  },
  {
    file: "hierarchy-visual.spec.ts",
    title: "dark frame 27 matches raw reference pixels",
  },
  {
    file: "hierarchy-visual.spec.ts",
    title: "light frame 27 matches raw reference pixels",
  },
  {
    file: "individuals-behavior.spec.ts",
    title:
      "shown fields control filtering, multivalues open accessibly, and keyboard selection retains row nodes",
  },
  {
    file: "inspector-reference.spec.ts",
    title:
      "actions overflow in order and menus preserve the draft and owner focus",
  },
  {
    file: "inspector-reference.spec.ts",
    title:
      "shared size hysteresis and Maximize retain the same focused draft field",
  },
  {
    file: "inspector-visual.spec.ts",
    title: "dark-07-value-focused",
  },
  {
    file: "inspector-visual.spec.ts",
    title: "dark-11-overflow-menu",
  },
  {
    file: "inspector-visual.spec.ts",
    title: "light-07-value-focused",
  },
  {
    file: "inspector-visual.spec.ts",
    title: "light-11-overflow-menu",
  },
  {
    file: "instances-menu.spec.ts",
    title:
      "menus expose groups, checked pin state, disabled items and meaningful keyboard navigation",
  },
  {
    file: "keyboard.spec.ts",
    title: "Alt menu paths, dialog access keys and keyboard context menus work",
  },
  {
    file: "keyboard.spec.ts",
    title: "chords execute once, time out, and do not consume ordinary typing",
  },
  {
    file: "keyboard.spec.ts",
    title:
      "keyboard help and palette show current shortcuts and pane navigation works",
  },
  {
    file: "keyboard.spec.ts",
    title:
      "menu letters and imported shortcuts persist across restart and workspace opens",
  },
  {
    file: "keyboard.spec.ts",
    title:
      "remapped shortcuts work inside detached panes and dialogs stay with their owner",
  },
  {
    file: "keyboard.spec.ts",
    title:
      "the shortcut editor records bindings, reports collisions and removes the old graph key",
  },
  {
    file: "menus.spec.ts",
    title:
      "a new ontology runs its own query and keeps Monaco menu Undo and Redo local",
  },
  {
    file: "menus.spec.ts",
    title:
      "a styled 3000-node graph stays bounded and the renderer answers during ELK work",
  },
  {
    file: "menus.spec.ts",
    title:
      "Additional graph layouts finish off-thread, honor pins and can be cancelled",
  },
  {
    file: "menus.spec.ts",
    title:
      "context Rename stays in the hierarchy and supports remapped keys and properties",
  },
  {
    file: "menus.spec.ts",
    title:
      "edge menu commands select, inspect, reroute and remove relationships",
  },
  {
    file: "menus.spec.ts",
    title:
      "Edit operates on native text selections and opens global entity search",
  },
  {
    file: "menus.spec.ts",
    title: "every native menu entry has an assigned outcome test",
  },
  {
    file: "menus.spec.ts",
    title:
      "file cancellation and malformed input preserve the current ontology",
  },
  {
    file: "menus.spec.ts",
    title:
      "File creates a blank ontology, saves exact limits and reopens editable data",
  },
  {
    file: "menus.spec.ts",
    title:
      "graph changes undo in order including expansion, one drag gesture, styles, limits and saved state",
  },
  {
    file: "menus.spec.ts",
    title:
      "graph commands operate in a detached window and reopen a closed graph",
  },
  {
    file: "menus.spec.ts",
    title:
      "Graph menus change layouts and bounded membership and export both formats",
  },
  {
    file: "menus.spec.ts",
    title:
      "graph rename edits the selected node label and Enter does not expand the graph",
  },
  {
    file: "menus.spec.ts",
    title:
      "Graph stylesheet validates, renders in exports, undoes and survives a saved workspace",
  },
  {
    file: "menus.spec.ts",
    title:
      "Help opens shortcuts and About and File Exit closes the application",
  },
  {
    file: "menus.spec.ts",
    title:
      "individual names edit inside the table and workspace replacement cancels drafts",
  },
  {
    file: "menus.spec.ts",
    title:
      "inline hierarchy rename validates, cancels and saves without changing the branch",
  },
  {
    file: "menus.spec.ts",
    title:
      "Keyboard settings and graph navigation menus act on the current pane",
  },
  {
    file: "menus.spec.ts",
    title: "New Workspace cancels an active query and clears old results",
  },
  {
    file: "menus.spec.ts",
    title:
      "pointer moves and camera gestures each undo without undoing ontology edits",
  },
  {
    file: "menus.spec.ts",
    title: "Query menus format text and open the agent composer",
  },
  {
    file: "menus.spec.ts",
    title:
      "Query menus run, cancel and send results even after the query pane closes",
  },
  {
    file: "menus.spec.ts",
    title:
      "RDF files, detailed entity editing and provenance have working menu routes",
  },
  {
    file: "menus.spec.ts",
    title: "Show instances opens the class report without adding graph nodes",
  },
  {
    file: "menus.spec.ts",
    title:
      "taxonomy double-click expands only the branch and every node exposes a keyboard context menu",
  },
  {
    file: "menus.spec.ts",
    title: "View applies native zoom, full screen and all theme choices",
  },
  {
    file: "menus.spec.ts",
    title:
      "View restores all panes, resets layout and runs the command palette",
  },
  {
    file: "menus.spec.ts",
    title:
      "View reveals panes behind a maximised pane and reset returns detached windows",
  },
  {
    file: "menus.spec.ts",
    title:
      "Window moves, groups, resizes, maximises, floats and detaches panes",
  },
  {
    file: "menus.spec.ts",
    title:
      "Workbench arrangements adapt to widescreen and preserve manual layouts",
  },
  {
    file: "modal-stability.spec.ts",
    title:
      "Command palette keeps its anchor and input while filtering in a default window",
  },
  {
    file: "modal-stability.spec.ts",
    title:
      "Command palette keeps its anchor and input while filtering in a narrow window",
  },
  {
    file: "modal-stability.spec.ts",
    title:
      "Command palette keeps its anchor and input while filtering in a short window",
  },
  {
    file: "modal-stability.spec.ts",
    title:
      "Customize keyboard shortcuts keeps its anchor and input while filtering in a default window",
  },
  {
    file: "modal-stability.spec.ts",
    title:
      "Customize keyboard shortcuts keeps its anchor and input while filtering in a narrow window",
  },
  {
    file: "modal-stability.spec.ts",
    title:
      "Customize keyboard shortcuts keeps its anchor and input while filtering in a short window",
  },
  {
    file: "modal-stability.spec.ts",
    title:
      "Delete keeps its anchor when an operation fails and Cancel preserves the ontology",
  },
  {
    file: "modal-stability.spec.ts",
    title:
      "Export stays anchored through preview and content switches and native Save cancellation",
  },
  {
    file: "modal-stability.spec.ts",
    title:
      "Graph appearance remains anchored through conditional controls and errors",
  },
  {
    file: "modal-stability.spec.ts",
    title:
      "Graph stylesheet remains anchored through conditional controls and errors",
  },
  {
    file: "modal-stability.spec.ts",
    title:
      "Keyboard shortcuts keeps its anchor and input while filtering in a default window",
  },
  {
    file: "modal-stability.spec.ts",
    title:
      "Keyboard shortcuts keeps its anchor and input while filtering in a narrow window",
  },
  {
    file: "modal-stability.spec.ts",
    title:
      "Keyboard shortcuts keeps its anchor and input while filtering in a short window",
  },
  {
    file: "modal-stability.spec.ts",
    title:
      "Query history retains its input geometry and has no horizontal overflow in a default window",
  },
  {
    file: "modal-stability.spec.ts",
    title:
      "Query history retains its input geometry and has no horizontal overflow in a narrow window",
  },
  {
    file: "modal-stability.spec.ts",
    title:
      "Query history retains its input geometry and has no horizontal overflow in a short window",
  },
  {
    file: "modal-stability.spec.ts",
    title:
      "query-history failure retains disabled rows and recovers on a new query",
  },
  {
    file: "modal-stability.spec.ts",
    title:
      "Regenerate confirmation remains bounded and Cancel retains the example dataset",
  },
  {
    file: "modal-stability.spec.ts",
    title:
      "tab settings and Rename keep geometry, validate empty names and restore focus",
  },
  {
    file: "ontology-export.spec.ts",
    title: "a complete focused cell remains a draft until its normal commit",
  },
  {
    file: "ontology-quality.spec.ts",
    title:
      "failure and cancellation cannot be mistaken for a completed clean scan",
  },
  {
    file: "ontology-quality.spec.ts",
    title:
      "overflow keeps every severity, suppression and view control usable at minimum width",
  },
  {
    file: "ontology-quality.spec.ts",
    title:
      "overflow keeps long active filters clearable and restores the findings",
  },
  {
    file: "ontology-quality.spec.ts",
    title: "overflow layout remains reachable in dark at all pane sizes",
  },
  {
    file: "ontology-quality.spec.ts",
    title: "overflow layout remains reachable in light at all pane sizes",
  },
  {
    file: "ontology-quality.spec.ts",
    title:
      "overflow moves grouping, text filtering and both exports into More and restores their state",
  },
  {
    file: "ontology-quality.spec.ts",
    title:
      "overflow retains keyboard focus when controls move and Escape returns to More",
  },
  {
    file: "ontology-quality.spec.ts",
    title:
      "overflow works in a detached pane through zoom and short-window resizing",
  },
  {
    file: "ontology-quality.spec.ts",
    title: "Quality focus, hover and motion follow the reference in dark",
  },
  {
    file: "ontology-quality.spec.ts",
    title: "Quality focus, hover and motion follow the reference in light",
  },
  {
    file: "pane-zoom.spec.ts",
    title:
      "Individuals reports remain scrollable and their overflow controls stay on screen when zoomed",
  },
  {
    file: "quality-visual.spec.ts",
    title: "dark a2-running-bar",
  },
  {
    file: "quality-visual.spec.ts",
    title: "light a2-running-bar",
  },
  {
    file: "query-reference.spec.ts",
    title:
      "Fields writes one undoable edit and narrow return paths keep editor focus",
  },
  {
    file: "query-reference.spec.ts",
    title:
      "History keeps twelve newest documents and restores focus through overflow",
  },
  {
    file: "query-results.spec.ts",
    title:
      "the native graph action follows the focused results or query document",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual dark 01-query-fields",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual dark 02-fields-written",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual dark 03-describe-idle",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual dark 04-describe-context-open",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual dark 05-describe-refine-on",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual dark 06-describe-running",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual dark 07-describe-validated",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual dark 08-describe-validated-synonyms",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual dark 09-describe-refused-update",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual dark 10-describe-refused-term",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual dark 11-describe-unsupported",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual dark 12-describe-signed-out",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual dark 13-describe-agents-refreshed",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual dark 14-describe-cancelled",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual dark 15-opened-in-editor",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual dark 16-opened-for-correction",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual dark 17-run-error",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual dark 18-results-grid",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual dark 19-results-run-toast",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual dark 20-results-sorted",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual dark 21-results-columns-menu",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual dark 22-results-zero-rows",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual dark 23-history-popup",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual dark 24-more-menu-query",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual dark 25-more-menu-results",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual dark 26-narrow-800x560",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual dark 27-narrow-compose-800x560",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual dark 28-narrow-results-560x560",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual dark 29-narrow-menu-420x560",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual dark 30-shallow-900x360",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual dark 31-shallow-results-900x360",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual dark 32-recovery-220x300",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual light 01-query-fields",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual light 02-fields-written",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual light 03-describe-idle",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual light 04-describe-context-open",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual light 05-describe-refine-on",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual light 06-describe-running",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual light 07-describe-validated",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual light 08-describe-validated-synonyms",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual light 09-describe-refused-update",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual light 10-describe-refused-term",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual light 11-describe-unsupported",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual light 12-describe-signed-out",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual light 13-describe-agents-refreshed",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual light 14-describe-cancelled",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual light 15-opened-in-editor",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual light 16-opened-for-correction",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual light 17-run-error",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual light 18-results-grid",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual light 19-results-run-toast",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual light 20-results-sorted",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual light 21-results-columns-menu",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual light 22-results-zero-rows",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual light 23-history-popup",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual light 24-more-menu-query",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual light 25-more-menu-results",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual light 26-narrow-800x560",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual light 27-narrow-compose-800x560",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual light 28-narrow-results-560x560",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual light 29-narrow-menu-420x560",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual light 30-shallow-900x360",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual light 31-shallow-results-900x360",
  },
  {
    file: "query-visual.spec.ts",
    title: "Query visual light 32-recovery-220x300",
  },
  {
    file: "resource-input-draft.spec.ts",
    title:
      "a focused draft is discarded when the value or resource kind changes",
  },
  {
    file: "resource-input-draft.spec.ts",
    title: "layout-effect focus cannot commit the previous literal",
  },
  {
    file: "seealso-warnings.spec.ts",
    title:
      "warning popup fits a narrow detached pane at 150% zoom and keeps keyboard dismissal reachable",
  },
  {
    file: "source-files.spec.ts",
    title: "native Undo, Redo and Find act on the focused source editor",
  },
  {
    file: "sparsity-reference.spec.ts",
    title:
      "overflow runs navigation, pins a revealed filter and retains the keyboard menu model",
  },
  {
    file: "sparsity.spec.ts",
    title:
      "influence and label filtering update positive findings while retaining focus",
  },
  {
    file: "statement-groups.spec.ts",
    title:
      "keyboard traversal reaches each field, remove action, add action and expansion",
  },
  {
    file: "statement-groups.spec.ts",
    title:
      "single value tools appear on focus and keyboard removal removes the last statement",
  },
  {
    file: "suggestion-runs-layout.spec.ts",
    title:
      "25 targets use the fewest fitting sets and retain order and resize focus",
  },
  {
    file: "suggestions-visual.spec.ts",
    title:
      "Suggestions panels keep trigger focus, follow tab order and stay open over table scrolling",
  },
  {
    file: "suggestions-workbench.spec.ts",
    title:
      "uses the document pill with the absolute folder and keeps palette shortcuts",
  },
  {
    file: "taxonomy-assistant.spec.ts",
    title:
      "opens the dockable view from a keyboard context action in detached Hierarchy",
  },
  {
    file: "text-analysis.spec.ts",
    title: "#128 plain highlight clicks keep the caret and focus with Auto off",
  },
  {
    file: "text-analysis.spec.ts",
    title: "#128 plain highlight clicks keep the caret and focus with Auto on",
  },
  {
    file: "text-analysis.spec.ts",
    title:
      "keyboard ontology matches reuse Details and unmatched names have no inferred annotations",
  },
  {
    file: "text-analysis.spec.ts",
    title: "name collisions retain the Name field, caret and editable text",
  },
  {
    file: "touchpoints-reference.spec.ts",
    title: "keyboard, recovery and narrow controls preserve the selected row",
  },
  {
    file: "touchpoints-visual.spec.ts",
    title: "dark frame 14 matches raw reference pixels",
  },
  {
    file: "touchpoints-visual.spec.ts",
    title: "dark frame 15 matches raw reference pixels",
  },
  {
    file: "touchpoints-visual.spec.ts",
    title: "light frame 14 matches raw reference pixels",
  },
  {
    file: "touchpoints-visual.spec.ts",
    title: "light frame 15 matches raw reference pixels",
  },
  {
    file: "utility-reference.spec.ts",
    title:
      "history filter returns from overflow without displacing More, and settings remain shared",
  },
  {
    file: "ux-refinement.spec.ts",
    title:
      "Find in taxonomy clears filters, reveals the row, and retains graph focus",
  },
  {
    file: "window-chrome.spec.ts",
    title:
      "chrome commands update native themes, document state, shortcuts and zoom while detached panes retain their native menu",
  },
  {
    file: "window-chrome.spec.ts",
    title:
      "menus share native state and support keyboard navigation, compact folds, scrolling and the palette",
  },
  {
    file: "window-chrome.spec.ts",
    title: "title band and popup match the reference in dark",
  },
  {
    file: "window-chrome.spec.ts",
    title: "title band and popup match the reference in light",
  },
  {
    file: "workbench-shell.spec.ts",
    title:
      "an existing detached tab pulses in its own window without a focus request",
  },
  {
    file: "workbench-shell.spec.ts",
    title:
      "the full shell switches real panes and documents, keeps focus, scrolls, and follows save and scan state",
  },
  {
    file: "workbench.spec.ts",
    title: "keyboard commands, themes and accessible controls",
  },
];
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const localDesktopGrep = localDesktopCases
  .map(({ file, title }) => escape(file) + ".*" + escape(title) + "$")
  .join("|");
export function verifyLocalDesktopResults(report) {
  const actual = [];
  function walk(suites) {
    for (const suite of suites ?? []) {
      for (const spec of suite.specs ?? [])
        for (const test of spec.tests ?? []) {
          if (
            test.expectedStatus !== "passed" ||
            test.status !== "expected" ||
            test.results?.length !== 1 ||
            test.results[0].status !== "passed"
          )
            throw Error(
              "Local desktop test must pass once without retries or skips: " +
                spec.file +
                " > " +
                spec.title,
            );
          actual.push(JSON.stringify([spec.file, spec.title]));
        }
      walk(suite.suites);
    }
  }
  walk(report.suites);
  const expected = localDesktopCases.map(({ file, title }) =>
    JSON.stringify([file, title]),
  );
  if (
    JSON.stringify(actual.sort()) !== JSON.stringify(expected.sort()) ||
    report.errors?.length
  )
    throw Error(
      "Local desktop results do not contain the complete required inventory.",
    );
  return { listed: actual.length, passed: actual.length, skipped: [] };
}
