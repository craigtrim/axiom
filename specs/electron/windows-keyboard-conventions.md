# Windows keyboard conventions for Axiom

Research and implementation decision, 13 September 2026.

## Decision

Axiom uses Windows access-key conventions throughout its application menus and provides a separate shortcut editor for direct command bindings. Every menu command has an Alt access path. Frequently used operations also receive familiar Ctrl or function-key defaults. Users can change the menu letters and assign their own shortcuts without editing source code.

Open **Edit > Keyboard shortcuts...** with **Alt+E, K** or **Ctrl+Shift+K**. The editor supports alternate bindings, two-stroke chords, pane scopes, conflict reporting, individual resets and JSON import/export. **F1** opens a searchable reference reflecting the current settings.

This follows Microsoft's published interaction guidance. It is an application design based on that guidance, not a Microsoft certification. The research distinguishes current Windows guidance from older Win32 conventions, and distinguishes platform APIs from behavior Axiom must implement itself.

## What Microsoft's guidance establishes

Microsoft separates access keys from accelerators. Access keys make commands discoverable through visible UI. Accelerators invoke frequent operations directly, generally using Ctrl or function keys. Its current keyboard-interaction guidance also describes Tab traversal, directional navigation and F6 movement between major application regions.[^1]

The access-key guidance organizes letters into scopes and displays visual cues. This supports a sequence such as Alt+F followed by S: F identifies the File menu; S identifies Save within that menu. Each menu needs its own unambiguous assignments. The same letter can serve different commands in different menus.[^2]

Microsoft's older Windows User Experience Interaction Guidelines give useful details for traditional desktop menus: assign access keys to menu items, retain established command combinations, and avoid Ctrl+Alt bindings because they can conflict with AltGr text input. That page explicitly identifies itself as Windows 7-era material. Its interaction conventions are relevant; its visual examples are not a prescription for a modern Electron interface.[^3]

| Evidence | Role in this decision | Boundary |
| --- | --- | --- |
| Current Microsoft keyboard interactions | Navigation and shortcut terminology | Does not provide an Electron implementation |
| Current Microsoft access-key guidance | Visible, scoped command access | WinUI keytip APIs do not run inside React |
| Current Microsoft accelerator guidance | Command discovery and contextual shortcuts | XAML routing must be translated into application behavior |
| Win32 UX keyboard guidance | Established menu conventions and AltGr considerations | Explicitly historical documentation |
| Microsoft Windows shortcut reference | Platform-owned keys and familiar operations | Operating-system behavior is not fully remappable by Axiom |
| VS Code keyboard documentation | Practical example of a remapping editor | Product precedent, not a universal Windows requirement |
| Electron API documentation and source | Menu integration and dispatch mechanisms | Framework behavior still requires desktop testing |

The Microsoft accelerator documentation discusses both application and control scopes, recommends displaying shortcuts alongside commands, and describes cases where a text control owns a combination. This is particularly relevant to Axiom's combination of Monaco, data grids and a graph canvas.[^4]

Microsoft's keyboard-accessibility guidance explicitly calls for coherent focus order, visible focus, keyboard alternatives to pointer operations and deliberate F6 behavior. Consequently, adding menu labels alone is insufficient: a command must reach the correct pane, and closing a dialog must restore useful focus.[^5]

## Access paths and direct shortcuts

The top-level letters are File F, Edit E, View V, Graph G, Query Q, Research R, Window W and Help H. Commands inside those menus receive distinct letters. Submenus introduce another step, so a layout command can be reached through Graph, Layout and its own letter.

Axiom displays the letters through Electron's menu-label convention. Electron documents that an ampersand before a character marks the access letter on Windows and Linux; a doubled ampersand displays a literal ampersand. Windows resource documentation describes the corresponding mnemonic convention for native controls.[^6][^7]

For example, the default Edit menu uses K for Keyboard shortcuts, while the default File menu uses N for New, O for Open, S for Save and A for Save as. These paths remain available for commands without a direct shortcut. Assigning a direct combination to every command by default would create many combinations to memorize, with a larger risk of collisions.

F10 opens Axiom's application menu as an Electron popup at the top of the window. Alt opens the regular menu bar. This explicit F10 handler is necessary in the tested Electron build: the native F10 sequence did not reach a command until Axiom supplied the handler. Electron's inspected menu-bar source handles Alt focus and access-letter activation directly; its source is supporting context, while the test against Axiom's installed version establishes the observed behavior.[^13]

Graph and hierarchy context menus have their own underlined letters. Shift+F10 or the keyboard's Context Menu key opens the selected entity's menu. Arrow keys move between enabled choices; Home and End reach the ends; Escape dismisses the menu and restores focus. Once a context menu is open, its letter keys operate within that menu.

Dialogs assign local Alt letters to their controls. Pressing Alt displays small keytips. Labels focus their associated inputs, and button letters activate their buttons. The main application menus are suspended while a modal dialog or entity context menu is active, preventing an Alt letter from also invoking an unrelated application command. Dialog letters are generated locally and are not part of the application-menu remapping table.

## Default bindings

These defaults are Axiom's chosen command map. Familiar editing and file combinations follow Windows practice; the graph-specific letters and numbered panes are application choices.

| Task | Default | Scope |
| --- | --- | --- |
| New, open, save workspace | Ctrl+N, Ctrl+O, Ctrl+S | Application |
| Save workspace as | Ctrl+Shift+S | Application |
| Undo | Ctrl+Z | Focused editor or workbench |
| Redo | Ctrl+Y; Ctrl+Shift+Z | Focused editor or workbench |
| Cut, copy, paste, select all | Ctrl+X, Ctrl+C, Ctrl+V, Ctrl+A | Focused control |
| Find | Ctrl+F | Entity search; Monaco find when editing a query |
| New class, new individual | Ctrl+Shift+N, Ctrl+Shift+I | Application |
| Rename selected entity | F2 | Application |
| Show selected entity in graph | Ctrl+G; Enter in hierarchy | Application / hierarchy |
| Command palette | Ctrl+Shift+P | Application |
| Shortcut editor | Ctrl+Shift+K | Application |
| Keyboard reference | F1 | Application |
| Hierarchy, graph, inspector | Ctrl+1, Ctrl+2, Ctrl+3 | Application |
| Individuals, query, research | Ctrl+4, Ctrl+5, Ctrl+6 | Application |
| Next / previous pane | F6 / Shift+F6 | Application |
| Next / previous tab in a group | Ctrl+Tab / Ctrl+Shift+Tab | Application |
| Close pane | Ctrl+W; Ctrl+F4 | Application |
| Run / cancel query | Ctrl+Enter / Ctrl+Shift+Enter | Application |
| Run / cancel research | Ctrl+R / Ctrl+Shift+R | Research pane |
| Fit, relayout, pin | F, L, P | Graph, outside text fields |
| Expand / collapse node | Enter / Shift+Enter | Graph |
| Freeze / resume graph | Space | Graph |
| Remove selected node from view or delete selected edge statement | Delete | Graph |
| Next edge, previous edge | E, Shift+E | Graph |
| Delete class | Delete | Hierarchy |
| Pan graph | Alt+arrow keys | Graph |
| Zoom graph | Plus / Minus | Graph |
| Zoom interface / actual size | Ctrl+Plus, Ctrl+Minus / Ctrl+0 | Application |
| Full screen | F11 | Application |

Graph removal and class deletion deliberately differ by focused pane. Delete on the graph removes a displayed node from the view or deletes the selected edge statement; Delete in the hierarchy opens the class-deletion flow. Typing into a filter or editor does not invoke either action.

The graph camera has separate zoom controls from the interface. A graph zoom changes how much of the diagram is visible. Interface zoom changes the size of text and controls as well. Both are discoverable and remappable.

The configurable visible-node limit remains independent of keyboard settings: default 1,000, with an allowed range of 100 through 3,000. Keyboard expansion uses the same bounded graph admission operations as pointer actions. A shortcut cannot bypass the limit or create a second rendering model.

## The remapping editor

The command list can be searched by command name, identifier, menu group or assigned shortcut. A Customized only filter narrows it to overrides. Selecting a command shows its direct bindings, scopes and menu access path.

A command accepts up to four bindings. This allows a familiar shortcut and an additional personal binding to coexist. Clear bindings removes Axiom's direct assignments for that command. Reset command restores its shipped bindings by removing the override.

The recorder captures either a single stroke or a two-stroke chord. A user can also type a normalized representation such as `Ctrl+Shift+B` or `Ctrl+K Ctrl+S`. Escape stops recording. The dialog remains open so the captured assignment can be reviewed before it is added.

The scope selector supports the entire application and each of the six workbench panes. An application binding overlaps every pane. Pane bindings can reuse a combination when their scopes do not overlap. Unmodified characters require a pane scope and are suppressed while a text input is focused.

Two-stroke chords provide additional combinations without allocating more single-stroke bindings. Axiom waits up to 1.8 seconds for the second stroke. Escape cancels a pending chord. A chord may not share its prefix with an overlapping single-stroke binding, because that would make the first stroke ambiguous. VS Code offers editable bindings, chords and context conditions; Axiom adopts that general model with a smaller set of explicit pane scopes rather than an arbitrary condition language.[^8]

The Menu access keys tab exposes the application menu hierarchy, including top-level menus and submenus. A user can change a letter and immediately inspect the resulting path. Duplicate letters within one menu prevent saving. If a chosen letter is absent from the visible label, the menu displays the letter in a parenthesized mnemonic.

Changes remain a draft until Save shortcuts. Import replaces the draft after validation; it does not immediately change the running application. Export writes the validated draft. Cancel discards unsaved changes. Reset all is also a draft operation, allowing it to be reviewed or canceled before application.

## Conflict and input rules

Axiom rejects overlapping duplicate bindings and overlapping chord prefixes. The error identifies the conflicting command, and the editor provides a way to select it. Conflicts are resolved explicitly rather than choosing an invisible winner. Different pane scopes may reuse the same combination.

Alt plus a letter or digit is reserved for menu access. Ctrl+Alt combinations are excluded to preserve AltGr input. Windows-key combinations are outside the supported grammar. The resolver ignores composition, dead-key processing and AltGraph input rather than interpreting those events as commands.

Windows owns combinations such as Alt+Tab and Alt+F4, while Ctrl+Shift+Esc opens Task Manager. The Windows shortcut reference also documents F10 for menu activation and Shift+F10 for context menus.[^9] Axiom reserves its corresponding navigation keys instead of treating them as arbitrary assignable commands.

Alt+F4 remains a platform close-window action even if another shortcut is assigned to Exit. Similarly, native text editing has built-in behavior outside Axiom's command registry. Assigning an alternative Copy shortcut does not remove the operating system's ordinary text-copy behavior.

Bindings use logical key values rather than physical scan-code positions. This keeps the recorder aligned with the characters reported by the current layout. It does not certify every international keyboard configuration. Unusual punctuation, dead-key sequences and IME use require testing on the target layout.

There is no application-global registration that captures Axiom commands while another program has focus. Electron distinguishes local command shortcuts from system-wide global shortcuts; the latter are inappropriate for this workbench's editing and navigation commands.[^10]

## Command routing and persistence

A shared TypeScript registry defines command identity, menu placement, default bindings and preferred access letters. It drives the application menu, command palette, shortcut reference and remapping editor. A command added to a menu therefore appears in the editor and reference through the same definition.

Application accelerators are displayed in Electron menus with `registerAccelerator: false`. Electron documents this option for Windows and Linux: it retains the label while leaving accelerator registration disabled.[^11] Axiom dispatches the actual combinations through one renderer handler per document. That supports pane scopes and chords without firing a command once in the renderer and again in the main process.

Menu clicks and shortcut commands use the same allowlisted command bridge. Existing enabled-state checks still apply: for example, an unavailable graph operation does not become available because a user assigns a shortcut. Operating-system menu integration and renderer keyboard dispatch have different responsibilities, but converge on the same application command.

Standard Ctrl+A, Ctrl+C, Ctrl+X and Ctrl+V in an editor are allowed to run through that editor's normal event path. This matters for timing: routing Select all through asynchronous IPC could let immediately following typing arrive before the selection changed. Remapped command invocations can still use Electron's corresponding editing roles.

Detached panes install the same keyboard resolver and share the owning workbench's settings. They route through the owning application's bridge when the detached document has no independent preload bridge. Dialogs are placed in the document that owns the current focus, and cleanup returns focus there.

Keyboard settings are personal preferences. They persist across restarts, are propagated to open windows when saved, and are excluded from workspace exports. Opening someone else's ontology workspace therefore cannot replace the recipient's keyboard map. The dedicated import/export path provides deliberate transfer between installations.

Settings use a versioned JSON object with known command identifiers. Imports validate binding syntax, scope, count and menu letters, as well as conflicts. A malformed file leaves the current draft and saved preferences intact. The format has a 100 KB limit; it contains data rather than executable handlers or a condition language.

## Alternatives and tradeoffs

| Approach | Benefit | Cost | Decision |
| --- | --- | --- | --- |
| Electron accelerators alone | Small implementation for fixed shortcuts | Does not supply Axiom's chord and scope editor | Use for displayed menu hints, not as the sole dispatcher |
| Global shortcut registration | Works when the app lacks focus | Captures keys intended for other programs | Excluded |
| Hardcoded handlers in every pane | Easy to add an isolated action | Remapping can leave old bindings active | Replace command keys with shared dispatch |
| A second custom HTML main menu | Full visual control | More focus, positioning and accessibility behavior to maintain | Retain Electron menus |
| VS Code's entire command infrastructure | Rich condition and extension model | Substantial additional architecture for this application | Adopt selected interaction ideas |
| Structured personal overrides | Portable, inspectable settings | Requires schema validation and conflict checks | Implemented |
| Automatic conflict reassignment | Fewer clicks when changing keys | Can silently break a previously useful command | Require explicit resolution |

Electron's menu presentation on Windows uses Chromium-style integration rather than WinUI controls, according to its API documentation.[^6] The relevant outcome is predictable desktop behavior, not a claim that the renderer has become a WinUI application.

Axiom's explicit F10 popup is a small departure from simply moving focus to a horizontal menu bar. It preserves keyboard command access using Electron's menu API and is tested with actual Windows keystrokes. Alt continues to use the normal bar. The distinction should remain visible in future regression testing rather than being hidden behind a generic claim of native behavior.

There are deliberate limits to customization. The editor controls application command bindings and application menu letters. It does not expose every Monaco editing command, AG Grid internal navigation rule, dialog access letter or Windows shortcut. Users can assign the workbench operations extensively while the embedded controls retain their own keyboard editing models.

## Verification and maintenance

The acceptance tests cover behavior rather than labels alone. Native-menu inventory tests require an outcome journey for every application menu command. Keyboard-specific journeys exercise recording, conflict rejection, clearing an old graph binding, chord execution, cancellation, import/export, settings persistence and detached-window operation.

Alt access is tested using Windows input directed to the foreground test window. Chromium's synthetic page input did not activate the native menu in the initial test, so DOM key dispatch alone is not used as evidence for the application menu. The helper checks the foreground window before sending keys.

The keyboard editor and reference use semantic controls, visible focus and accessible names. Context menus expose menu roles and shortcut metadata; metadata does not execute behavior by itself. WAI-ARIA defines `aria-keyshortcuts` as descriptive information about shortcuts implemented by the author.[^12]

Microsoft recommends both programmatic inspection and testing complete scenarios using keyboard navigation, including users of assistive technologies where possible.[^14] The automated desktop suite and existing accessibility scan provide regression evidence. They do not establish exhaustive Narrator, NVDA, Sticky Keys, IME or international-layout compatibility.

Future command additions should enter the shared registry, receive a distinct menu letter and extend the inventory's outcome coverage. Changes to the focused editor or docking library should trigger the detached-window and text-editing journeys. Changes to Electron should also rerun actual Windows menu input, because those events traverse a different path from synthetic DOM events.

The executable and final test counts are recorded in [verification](../../docs/verification.md). The following catalog records the shipped defaults; the in-application reference reflects personal overrides.

## Default command catalog

| Command | Direct shortcuts and scopes | Menu access |
| --- | --- | --- |
| File > New workspace | Ctrl+N | Alt+F, N |
| File > Open Pizza example | Unassigned | Alt+F, P |
| File > Open workspace... | Ctrl+O | Alt+F, O |
| File > Save workspace | Ctrl+S | Alt+F, S |
| File > Save workspace as... | Ctrl+Shift+S | Alt+F, A |
| File > Export graph as SVG... | Unassigned | Alt+F, E |
| File > Export graph as PNG... | Unassigned | Alt+F, R |
| File > Exit | Alt+F4 | Alt+F, X |
| Edit > Undo | Ctrl+Z | Alt+E, U |
| Edit > Redo | Ctrl+Y / Ctrl+Shift+Z | Alt+E, R |
| Edit > Cut | Ctrl+X | Alt+E, T |
| Edit > Copy | Ctrl+C | Alt+E, C |
| Edit > Paste | Ctrl+V | Alt+E, P |
| Edit > Select all | Ctrl+A | Alt+E, A |
| Edit > Find entities | Ctrl+F | Alt+E, F |
| Edit > New class... | Ctrl+Shift+N | Alt+E, N |
| Edit > New individual... | Ctrl+Shift+I | Alt+E, I |
| Edit > Rename entity | F2 | Alt+E, M |
| Edit > Delete class... | Delete (hierarchy) | Alt+E, D |
| Edit > Show selected entity in graph | Ctrl+G / Enter (hierarchy) | Alt+E, G |
| Edit > Research selected entity... | Unassigned | Alt+E, E |
| Edit > Keyboard shortcuts... | Ctrl+Shift+K | Alt+E, K |
| View > Command palette... | Ctrl+Shift+P | Alt+V, C |
| View > Hierarchy | Ctrl+1 | Alt+V, H |
| View > Graph | Ctrl+2 | Alt+V, G |
| View > Inspector | Ctrl+3 | Alt+V, I |
| View > Individuals | Ctrl+4 | Alt+V, N |
| View > Query | Ctrl+5 | Alt+V, Q |
| View > Research | Ctrl+6 | Alt+V, R |
| View > Reset pane layout | Unassigned | Alt+V, E |
| View > Workbench arrangement > Automatic | Unassigned | Alt+V, W, A |
| View > Workbench arrangement > Standard | Unassigned | Alt+V, W, S |
| View > Workbench arrangement > Widescreen | Unassigned | Alt+V, W, W |
| View > Theme > System | Unassigned | Alt+V, T, S |
| View > Theme > Light | Unassigned | Alt+V, T, L |
| View > Theme > Dark | Unassigned | Alt+V, T, D |
| View > Actual size | Ctrl+0 | Alt+V, A |
| View > Zoom in | Ctrl+Plus | Alt+V, Z |
| View > Zoom out | Ctrl+Minus | Alt+V, O |
| View > Toggle full screen | F11 | Alt+V, L |
| Graph > Fit graph | F (graph) | Alt+G, F |
| Graph > Relayout | L (graph) | Alt+G, R |
| Graph > Layout > Auto layout | Unassigned | Alt+G, L, A |
| Graph > Layout > Force-directed | Unassigned | Alt+G, L, F |
| Graph > Layout > Hierarchy | Unassigned | Alt+G, L, H |
| Graph > Layout > Radial | Unassigned | Alt+G, L, R |
| Graph > Layout > Cluster grid | Unassigned | Alt+G, L, C |
| Graph > Layout > Circular | Unassigned | Alt+G, L, I |
| Graph > Layout > ELK layered (Sugiyama) | Unassigned | Alt+G, L, E |
| Graph > Layout > ELK stress | Unassigned | Alt+G, L, L |
| Graph > Layout > ELK tree | Unassigned | Alt+G, L, K |
| Graph > Cancel running layout | Unassigned | Alt+G, A |
| Graph > Edit graph stylesheet... | Unassigned | Alt+G, S |
| Graph > Freeze / resume | Space (graph) | Alt+G, Z |
| Graph > Expand node or edit edge | Enter (graph) | Alt+G, E |
| Graph > Collapse selected node | Shift+Enter (graph) | Alt+G, C |
| Graph > Pin / unpin selected node | P (graph) | Alt+G, P |
| Graph > Remove selected node or edge | Delete (graph) | Alt+G, M |
| Graph > Clear graph | Unassigned | Alt+G, G |
| Graph > Pan and zoom > Pan left | Alt+Left (graph) | Alt+G, O, P |
| Graph > Pan and zoom > Pan right | Alt+Right (graph) | Alt+G, O, A |
| Graph > Pan and zoom > Pan up | Alt+Up (graph) | Alt+G, O, N |
| Graph > Pan and zoom > Pan down | Alt+Down (graph) | Alt+G, O, D |
| Graph > Pan and zoom > Zoom in | Plus (graph) | Alt+G, O, Z |
| Graph > Pan and zoom > Zoom out | Minus (graph) | Alt+G, O, O |
| Query > Run query | Ctrl+Enter | Alt+Q, R |
| Query > Cancel query | Ctrl+Shift+Enter | Alt+Q, C |
| Query > Send results to graph | Unassigned | Alt+Q, S |
| Research > Run research | Ctrl+R (research) | Alt+R, R |
| Research > Cancel research | Ctrl+Shift+R (research) | Alt+R, C |
| Research > Refresh assistants | Unassigned | Alt+R, E |
| Research > Wikipedia | Unassigned | Alt+R, W |
| Research > DBpedia | Unassigned | Alt+R, D |
| Research > Other ontologies | Unassigned | Alt+R, O |
| Research > Web search | Unassigned | Alt+R, B |
| Window > Next pane | F6 | Alt+W, N |
| Window > Previous pane | Shift+F6 | Alt+W, P |
| Window > Next tab | Ctrl+Tab | Alt+W, E |
| Window > Previous tab | Ctrl+Shift+Tab | Alt+W, R |
| Window > Move pane left | Unassigned | Alt+W, M |
| Window > Move pane right | Unassigned | Alt+W, O |
| Window > Move pane top | Unassigned | Alt+W, V |
| Window > Move pane bottom | Unassigned | Alt+W, A |
| Window > Group pane with graph | Unassigned | Alt+W, G |
| Window > Make pane wider | Unassigned | Alt+W, K |
| Window > Make pane narrower | Unassigned | Alt+W, W |
| Window > Maximise / restore pane | Unassigned | Alt+W, X |
| Window > Float pane | Unassigned | Alt+W, F |
| Window > Detach pane to window | Unassigned | Alt+W, D |
| Window > Return all panes to main window | Unassigned | Alt+W, T |
| Window > Close pane | Ctrl+W / Ctrl+F4 | Alt+W, C |
| Help > Keyboard shortcuts | F1 | Alt+H, K |
| Help > About Axiom | Unassigned | Alt+H, A |

## Sources

All sources were checked on 13 September 2026. Microsoft and Electron documentation provide the primary evidence. VS Code is cited as a product example. Electron main-branch source describes implementation context and is not treated as a pinned-version guarantee.

[^1]: Microsoft Learn, [Keyboard interactions](https://learn.microsoft.com/en-us/windows/apps/develop/input/keyboard-interactions). Current Windows guidance on navigation, access keys and accelerators.
[^2]: Microsoft Learn, [Access keys](https://learn.microsoft.com/en-us/windows/apps/develop/input/access-keys). Access scopes, visual cues and key selection.
[^3]: Microsoft Learn, [Keyboard: Windows User Experience Interaction Guidelines](https://learn.microsoft.com/en-us/windows/win32/uxguide/inter-keyboard). Explicitly Windows 7-era guidance; used for persistent keyboard conventions.
[^4]: Microsoft Learn, [Keyboard accelerators](https://learn.microsoft.com/en-us/windows/apps/develop/input/keyboard-accelerators). Application and control scopes, discovery and routing.
[^5]: Microsoft Learn, [Keyboard accessibility](https://learn.microsoft.com/en-us/windows/apps/design/accessibility/keyboard-accessibility). Focus traversal, F6 and custom-control accessibility.
[^6]: Electron, [Menu](https://www.electronjs.org/docs/latest/api/menu). Windows menu presentation, ampersand access keys and popup API.
[^7]: Microsoft Learn, [Common Control Parameters](https://learn.microsoft.com/en-us/windows/win32/menurc/common-control-parameters). Mnemonic notation for Windows controls.
[^8]: Microsoft Visual Studio Code, [Keyboard shortcuts](https://code.visualstudio.com/docs/configure/keybindings). Remapping editor, chords and contextual bindings.
[^9]: Microsoft Support, [Keyboard shortcuts in Windows](https://support.microsoft.com/en-us/accessibility/windows/keyboard-shortcuts-in-windows). Platform commands and navigation combinations.
[^10]: Electron, [Keyboard Shortcuts](https://www.electronjs.org/docs/latest/tutorial/keyboard-shortcuts). Local, renderer and global shortcut mechanisms.
[^11]: Electron, [MenuItem](https://www.electronjs.org/docs/latest/api/menu-item). Accelerator display, registration and editing roles.
[^12]: W3C, [WAI-ARIA 1.2: aria-keyshortcuts](https://www.w3.org/TR/wai-aria-1.2/#aria-keyshortcuts). Semantics of shortcut metadata.
[^13]: Electron source, [root_view.cc](https://github.com/electron/electron/blob/main/shell/browser/ui/views/root_view.cc) and [menu_bar.cc](https://github.com/electron/electron/blob/main/shell/browser/ui/views/menu_bar.cc). Inspected Alt handling and menu focus implementation.
[^14]: Microsoft Learn, [Testing for accessibility](https://learn.microsoft.com/en-us/windows/win32/winauto/accessibility-testingtools). Accessibility Insights, programmatic checks and keyboard scenario testing.
