import { layoutOptions } from "./layout-options";
export const scopes = [
  "app",
  "graph",
  "hierarchy",
  "query",
  "individuals",
  "inspector",
  "research",
] as const;
export type ShortcutScope = (typeof scopes)[number];
export interface ShortcutBinding {
  keys: string;
  scope: ShortcutScope;
}
export interface CommandDefinition {
  id: string;
  label: string;
  group: string;
  defaults: ShortcutBinding[];
  role?: string;
}
export interface MenuDefinition {
  id: string;
  label: string;
  key: string;
  children: (MenuDefinition | string | null)[];
}
const app = (...keys: string[]): ShortcutBinding[] =>
  keys.map((keys) => ({ keys, scope: "app" }));
const at = (scope: ShortcutScope, ...keys: string[]): ShortcutBinding[] =>
  keys.map((keys) => ({ keys, scope }));
const commands: CommandDefinition[] = [];
function c(
  id: string,
  label: string,
  group: string,
  defaults: ShortcutBinding[] = [],
  role?: string,
) {
  commands.push({ id, label, group, defaults, role });
  return id;
}
function menu(
  id: string,
  label: string,
  key: string,
  children: MenuDefinition["children"],
): MenuDefinition {
  return { id, label, key, children };
}
export const menuTree: MenuDefinition[] = [
  menu("menu.file", "File", "F", [
    c("file.new", "New workspace", "File", app("Ctrl+N")),
    menu("menu.file.open", "Open", "O", [
      c("file.open", "Workspace...", "File > Open", app("Ctrl+O")),
      menu("menu.file.recent", "Recent", "R", []),
      menu("menu.file.examples", "Examples", "E", [
        c("file.example", "Pizza", "File > Open > Examples"),
      ]),
    ]),
    c("file.import", "Import ontology...", "File"),
    c("file.exportOntology", "Export ontology...", "File"),
    c("file.close", "Close workspace", "File"),
    c("file.provenance", "Create provenance from folder...", "File"),
    null,
    c("file.save", "Save workspace", "File", app("Ctrl+S")),
    c("file.saveAs", "Save workspace as...", "File", app("Ctrl+Shift+S")),
    null,
    c("graph.export.svg", "Export graph as SVG...", "File"),
    c("graph.export.png", "Export graph as PNG...", "File"),
    null,
    c("app.quit", "Exit", "File", app("Alt+F4")),
  ]),
  menu("menu.edit", "Edit", "E", [
    c("edit.undo", "Undo", "Edit", app("Ctrl+Z")),
    c("edit.redo", "Redo", "Edit", app("Ctrl+Y", "Ctrl+Shift+Z")),
    null,
    c("role.cut", "Cut", "Edit", app("Ctrl+X"), "cut"),
    c("role.copy", "Copy", "Edit", app("Ctrl+C"), "copy"),
    c("role.paste", "Paste", "Edit", app("Ctrl+V"), "paste"),
    c("role.selectAll", "Select all", "Edit", app("Ctrl+A"), "selectAll"),
    null,
    c("entity.search", "Find entities", "Edit", app("Ctrl+F")),
    c("entity.createClass", "New class", "Edit", app("Ctrl+Shift+N")),
    c("entity.createIndividual", "New individual", "Edit", app("Ctrl+Shift+I")),
    c("entity.edit", "Edit entity details", "Edit", app("Alt+Enter")),
    c("entity.createProperty", "New property", "Edit"),
    c("entity.rename", "Rename entity", "Edit", app("F2")),
    c("entity.delete", "Delete class...", "Edit", at("hierarchy", "Delete")),
    c("entity.showGraph", "Show selected entity in graph", "Edit", [
      ...app("Ctrl+G"),
      ...at("hierarchy", "Enter"),
    ]),
    c("entity.showInstances", "Show instances", "Edit"),
    c("research.open", "Research selected entity...", "Edit"),
    null,
    c(
      "keyboard.settings",
      "Keyboard shortcuts...",
      "Edit",
      app("Ctrl+Shift+K"),
    ),
  ]),
  menu("menu.view", "View", "V", [
    c("palette", "Command palette...", "View", app("Ctrl+Shift+P")),
    null,
    ...[
      "Hierarchy",
      "Graph",
      "Inspector",
      "Individuals",
      "Query",
      "Research",
      "Source",
    ].map((label, i) =>
      c("view." + label.toLowerCase(), label, "View", app("Ctrl+" + (i + 1))),
    ),
    null,
    c("layout.reset", "Reset pane layout", "View"),
    menu(
      "menu.arrangement",
      "Workbench arrangement",
      "W",
      ["Automatic", "Standard", "Widescreen"].map((label, i) =>
        c(
          "arrangement." + ["auto", "standard", "wide"][i],
          label,
          "View > Workbench arrangement",
        ),
      ),
    ),
    menu(
      "menu.theme",
      "Theme",
      "T",
      ["System", "Light", "Dark"].map((label) =>
        c("theme." + label.toLowerCase(), label, "View > Theme"),
      ),
    ),
    null,
    c("role.resetZoom", "Actual size", "View", app("Ctrl+0"), "resetZoom"),
    c("role.zoomIn", "Zoom in", "View", app("Ctrl+Plus"), "zoomIn"),
    c("role.zoomOut", "Zoom out", "View", app("Ctrl+Minus"), "zoomOut"),
    c(
      "role.togglefullscreen",
      "Toggle full screen",
      "View",
      app("F11"),
      "togglefullscreen",
    ),
  ]),
  menu("menu.graph", "Graph", "G", [
    c(
      "graph.create",
      "Add entity at graph position",
      "Graph",
      at("graph", "Insert"),
    ),
    c("graph.export", "Export...", "Graph", app("Ctrl+Shift+E")),
    c("graph.fit", "Fit graph", "Graph", at("graph", "F")),
    c("graph.relayout", "Relayout", "Graph", at("graph", "L")),
    menu(
      "menu.graphLayout",
      "Layout",
      "L",
      layoutOptions.map((p) =>
        c("graph.layout." + p.id, p.label, "Graph > Layout"),
      ),
    ),
    c("graph.cancelLayout", "Cancel running layout", "Graph"),
    c("graph.styles", "Edit graph stylesheet...", "Graph"),
    c("graph.freeze", "Freeze / resume", "Graph", at("graph", "Space")),
    null,
    c(
      "graph.expand",
      "Expand node or edit edge",
      "Graph",
      at("graph", "Enter"),
    ),
    c(
      "graph.collapse",
      "Collapse selected node",
      "Graph",
      at("graph", "Shift+Enter"),
    ),
    c("graph.pin", "Pin / unpin selected node", "Graph", at("graph", "P")),
    c(
      "graph.remove",
      "Remove selected node or edge",
      "Graph",
      at("graph", "Delete"),
    ),
    menu("menu.edge", "Edges", "E", [
      c("graph.connect", "Connect nodes...", "Graph > Edges", at("graph", "C")),
      null,
      c("edge.edit", "Edit selected edge", "Graph > Edges"),
      c("edge.remove", "Remove selected edge", "Graph > Edges"),
      c("edge.resetRoute", "Reset edge route", "Graph > Edges"),
      c("edge.next", "Select next edge", "Graph > Edges", at("graph", "E")),
      c(
        "edge.previous",
        "Select previous edge",
        "Graph > Edges",
        at("graph", "Shift+E"),
      ),
    ]),
    c("graph.clear", "Clear graph", "Graph"),
    menu("menu.graphNavigation", "Pan and zoom", "Z", [
      ...["Left", "Right", "Up", "Down"].map((d) =>
        c(
          "graph.pan." + d.toLowerCase(),
          "Pan " + d.toLowerCase(),
          "Graph > Pan and zoom",
          at("graph", "Alt+" + d),
        ),
      ),
      c(
        "graph.zoom.in",
        "Zoom in",
        "Graph > Pan and zoom",
        at("graph", "Plus"),
      ),
      c(
        "graph.zoom.out",
        "Zoom out",
        "Graph > Pan and zoom",
        at("graph", "Minus"),
      ),
    ]),
  ]),
  menu("menu.query", "Query", "Q", [
    c("query.run", "Run query", "Query", app("Ctrl+Enter")),
    c("query.cancel", "Cancel query", "Query", app("Ctrl+Shift+Enter")),
    c("query.graph", "Send results to graph", "Query"),
    null,
    c("query.format", "Format SPARQL", "Query", at("query", "Shift+Alt+F")),
    c("query.generate", "Compose query with an agent", "Query"),
  ]),
  menu("menu.research", "Research", "R", [
    c("research.run", "Run research", "Research", at("research", "Ctrl+R")),
    c(
      "research.cancel",
      "Cancel research",
      "Research",
      at("research", "Ctrl+Shift+R"),
    ),
    c("research.refresh", "Refresh assistants", "Research"),
    null,
    ...[
      ["wikipedia", "Wikipedia"],
      ["dbpedia", "DBpedia"],
      ["ontologies", "Other ontologies"],
      ["web", "Web search"],
    ].map(([id, label]) => c("research.source." + id, label, "Research")),
  ]),
  menu("menu.window", "Window", "W", [
    c("pane.next", "Next pane", "Window", app("F6")),
    c("pane.previous", "Previous pane", "Window", app("Shift+F6")),
    c("pane.nextTab", "Next tab", "Window", app("Ctrl+Tab")),
    c("pane.previousTab", "Previous tab", "Window", app("Ctrl+Shift+Tab")),
    null,
    menu(
      "menu.movePane",
      "Move pane",
      "M",
      ["Left", "Right", "Top", "Bottom"].map((d) =>
        c("pane.move." + d.toLowerCase(), d, "Window > Move pane"),
      ),
    ),
    c("pane.group", "Group pane with graph", "Window"),
    c("pane.wider", "Make pane wider", "Window"),
    c("pane.narrower", "Make pane narrower", "Window"),
    null,
    c("pane.maximise", "Maximise / restore pane", "Window"),
    c("pane.float", "Float pane", "Window"),
    c("pane.detach", "Detach pane to window", "Window"),
    c("pane.reattach", "Return all panes to main window", "Window"),
    c("pane.close", "Close pane", "Window", app("Ctrl+W", "Ctrl+F4")),
  ]),
  menu("menu.help", "Help", "H", [
    c("help.shortcuts", "Keyboard shortcuts", "Help", app("F1")),
    c("help.about", "About Axiom", "Help"),
  ]),
];
export const commandDefinitions = commands;
export const commandById = new Map(commands.map((c) => [c.id, c]));
export const preferredAccessKeys: Record<string, string> = {
  "file.new": "N",
  "file.example": "P",
  "file.open": "W",
  "file.save": "S",
  "file.saveAs": "A",
  "app.quit": "X",
  "edit.undo": "U",
  "edit.redo": "R",
  "role.cut": "T",
  "role.copy": "C",
  "role.paste": "P",
  "role.selectAll": "A",
  "entity.search": "F",
  "entity.createClass": "N",
  "entity.createIndividual": "I",
  "entity.rename": "M",
  "entity.delete": "D",
  "entity.showGraph": "G",
  "research.open": "E",
  "keyboard.settings": "K",
  "graph.fit": "F",
  "graph.relayout": "R",
  "graph.cancelLayout": "A",
  "graph.styles": "S",
  "graph.freeze": "Z",
  "graph.expand": "E",
  "graph.collapse": "C",
  "graph.pin": "P",
  "graph.remove": "M",
  "graph.clear": "G",
  "menu.graphNavigation": "O",
  "help.shortcuts": "K",
  "help.about": "A",
};
export interface AccessEntry {
  id: string;
  label: string;
  parent: string;
  key: string;
  path: string[];
}
export const accessEntries: AccessEntry[] = [];
function allocate(
  nodes: (MenuDefinition | string | null)[],
  parent = "",
  prefix: string[] = [],
) {
  const entries = nodes
    .filter((n): n is MenuDefinition | string => n !== null)
    .map((n) =>
      typeof n === "string"
        ? { id: n, label: commandById.get(n)!.label }
        : { id: n.id, label: n.label },
    );
  const used = new Set<string>(),
    assigned = new Map<string, string>();
  for (const e of entries) {
    const group = nodes.find((n) => typeof n === "object" && n?.id === e.id) as
      MenuDefinition | undefined;
    const preferred = preferredAccessKeys[e.id] ?? group?.key;
    if (preferred && !used.has(preferred)) {
      assigned.set(e.id, preferred);
      used.add(preferred);
    }
  }
  for (const e of entries) {
    if (!assigned.has(e.id)) {
      const key = [
        ...e.label.toUpperCase().replace(/[^A-Z0-9]/g, ""),
        ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
      ].find((k) => !used.has(k));
      if (!key) throw Error("Menu has too many access keys.");
      assigned.set(e.id, key);
      used.add(key);
    }
    accessEntries.push({
      ...e,
      parent,
      key: assigned.get(e.id)!,
      path: prefix,
    });
  }
  for (const n of nodes)
    if (n && typeof n !== "string")
      allocate(n.children, n.id, [...prefix, n.id]);
}
allocate(menuTree);
export const accessById = new Map(accessEntries.map((e) => [e.id, e]));
