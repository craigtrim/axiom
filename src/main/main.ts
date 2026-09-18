import { RecentFiles } from "./recent-files";
import { SessionStore, type SavedSession } from "./session-store";
import type { Workspace } from "../domain/workspace";
import { instanceAction } from "../shared/action-state";
import { QueryHistoryService } from "./query-history-service";
import examples from "../domain/data/examples.json";
import { ProvenanceService } from "./provenance-service";
import { FilePreviewService } from "./file-preview-service";
import type { LinkedFile } from "../shared/source";
import { exportDocument } from "./export-service";
import { QueryAssistantService } from "./query-assistant-service";
import { ResearchService } from "./research-service";
import { TaxonomyAssistantService } from "./taxonomy-assistant-service";
import { layoutOptions } from "../shared/layout-options";
import { THING } from "../domain/model";
import { readPreferences } from "../shared/preferences";
import { menuTree, commandById, type MenuDefinition } from "../shared/commands";
import {
  mnemonicLabel,
  effectiveBindings,
  readKeyboardSettings,
} from "../shared/shortcuts";
import {
  app,
  shell,
  BrowserWindow,
  Menu,
  dialog,
  ipcMain,
  protocol,
  net,
  nativeTheme,
  clipboard,
  ClipboardItem,
  nativeImage,
  screen,
  type MenuItemConstructorOptions,
} from "electron";
import { Worker } from "node:worker_threads";
import {
  readFile,
  writeFile,
  mkdir,
  rename,
  copyFile,
  stat,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { DomainMethod, Preferences, Snapshot } from "../shared/protocol";
protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);
if (process.env.AXIOM_USER_DATA)
  app.setPath("userData", path.resolve(process.env.AXIOM_USER_DATA));
app.setName("Axiom");
app.setAppUserModelId("com.craigtrim.axiom");
let mainWindow: BrowserWindow | null = null,
  worker: Worker,
  sequence = 0,
  preferences: Preferences = { version: 1, theme: "light" },
  lastState: Snapshot | undefined,
  workspacePath: string | undefined,
  closing = false;
const pending = new Map<
  number,
  { resolve: (v: any) => void; reject: (e: Error) => void }
>();
const methods = new Set<DomainMethod>([
  "new",
  "example",
  "search",
  "state",
  "regenerate",
  "select",
  "selectEdge",
  "edgeDocument",
  "editEdge",
  "createEdge",
  "graphInteraction",
  "routeEdge",
  "inspector",
  "instances",
  "table",
  "tableGraph",
  "seed",
  "expand",
  "expandMax",
  "collapse",
  "remove",
  "pin",
  "drag",
  "budget",
  "eviction",
  "layout",
  "spacing",
  "edgeVisibility",
  "countVisibility",
  "freeze",
  "clear",
  "rename",
  "createClass",
  "deleteClass",
  "editCell",
  "createIndividual",
  "undo",
  "redo",
  "query",
  "cancelQuery",
  "queryPage",
  "queryActivate",
  "queryResult",
  "queryGraph",
  "serialize",
  "load",
  "importRdf",
  "rdfExport",
  "sourceDocument",
  "applySource",
  "linkedFile",
  "resourceSuggestions",
  "predicateOptions",
  "entitySource",
  "applyEntitySource",
  "entityDocument",
  "updateEntity",
  "createProperty",
  "reportData",
  "markSaved",
  "motion",
  "stylesheet",
  "graphStyleCatalog",
  "graphCreate",
  "intersectionSuggestions",
  "subclassSuggestions",
  "applySubclassSuggestions",
  "applyIntersection",
  "graphActivate",
  "uiHistory",
  "cancelLayout",
  "queryContext",
  "taxonomyContext",
  "validateTaxonomySuggestions",
  "applyTaxonomySuggestions",
  "researchContext",
  "applySuggestions",
]);
function request<T = unknown>(
  method: DomainMethod,
  args: Record<string, unknown> = {},
): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, method, args });
  });
}
const research = new ResearchService(
  path.join(app.getPath("userData"), "research-runs"),
  (iri) => request("researchContext", { iri }),
);
const taxonomyAssistant = new TaxonomyAssistantService(
  path.join(app.getPath("userData"), "taxonomy-runs"),
  (input) => request("taxonomyContext", { iri: input.iri, mode: input.mode }),
  (context, suggestions) =>
    request("validateTaxonomySuggestions", {
      iri: context.selected.iri,
      mode: context.mode,
      datasetEpoch: context.datasetEpoch,
      version: context.version,
      suggestions,
    }),
  (context, suggestions) =>
    request("applyTaxonomySuggestions", {
      iri: context.selected.iri,
      mode: context.mode,
      datasetEpoch: context.datasetEpoch,
      version: context.version,
      suggestions,
    }),
);
const queryHistory = new QueryHistoryService(
  path.join(app.getPath("userData"), "query-history.json"),
  () => String(preferences.panelState?.["query.text"] ?? examples[0].Text),
  (data) =>
    mainWindow?.webContents.send("domain:event", {
      type: "query-history",
      data,
    }),
);
const queryAssistant = new QueryAssistantService(
  path.join(app.getPath("userData"), "query-runs"),
  (instructions) => request("queryContext", { instructions }),
);
let queryAssistantJob:
  | {
      cancelled: boolean;
      startedAt: number;
      provider: import("../shared/research").AssistantId;
    }
  | undefined;
const provenance = new ProvenanceService(
  path.join(app.getPath("userData"), "provenance"),
  __dirname,
  path
    .join(__dirname, "..", "metadata")
    .replace("app.asar", "app.asar.unpacked"),
  (s) =>
    mainWindow?.webContents.send("domain:event", {
      type: "provenance",
      data: s,
    }),
);
const filePreviews = new FilePreviewService(async (file) => {
  const image = await nativeImage.createThumbnailFromPath(file, {
    width: 384,
    height: 384,
  });
  if (image.isEmpty()) throw Error("The image could not be previewed.");
  return { dataUrl: image.toDataURL(), ...image.getSize() };
});
async function resolveLinkedFile(iri: unknown) {
  if (typeof iri !== "string" || iri.length > 10000)
    throw Error("Invalid file entity.");
  const file = await request<LinkedFile | null>("linkedFile", { iri });
  if (!file) throw Error("This entity does not link to a filesystem file.");
  return file;
}
const sessions = new SessionStore(app.getPath("userData"));
const recentFiles = new RecentFiles(app.getPath("userData"));
async function rememberFile(file: string) {
  try {
    await recentFiles.remember(file);
  } catch (error) {
    console.warn("Could not save recent files:", error);
  }
  installMenu();
}
let sessionBaseline: SavedSession;
async function checkpointSession(capture = true) {
  if (capture) await capturePreferences();
  sessionBaseline = {
    format: "axiom-session",
    version: 1,
    workspace: await request<Workspace>("serialize"),
    workspacePath,
    workbench: preferences,
  };
  await sessions.save(sessionBaseline);
}
const settingsPath = () => path.join(app.getPath("userData"), "workbench.json");
let saveQueue = Promise.resolve();
function savePreferences(p: Preferences) {
  preferences = readPreferences({ ...preferences, ...p, version: 1 });
  const content = JSON.stringify(preferences);
  saveQueue = saveQueue
    .catch(() => {})
    .then(async () => {
      await mkdir(app.getPath("userData"), { recursive: true });
      const temp = settingsPath() + ".tmp";
      await writeFile(temp, content, "utf8");
      try {
        await copyFile(settingsPath(), settingsPath() + ".bak");
      } catch {}
      for (let attempt = 0; ; attempt++) {
        try {
          await rename(temp, settingsPath());
          break;
        } catch (error) {
          if (
            attempt >= 4 ||
            !["EPERM", "EBUSY", "EACCES"].includes(
              (error as NodeJS.ErrnoException).code ?? "",
            )
          )
            throw error;
          // Windows file watchers can briefly retain a handle on the old file.
          await new Promise((resolve) =>
            setTimeout(resolve, 25 * (attempt + 1)),
          );
        }
      }
    });
  return saveQueue;
}
function authorised(
  event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent,
) {
  const url = event.senderFrame?.url;
  if (
    !url ||
    new URL(url).protocol !== "app:" ||
    new URL(url).hostname !== "axiom"
  )
    throw Error("Unrecognised application frame.");
}
function send(command: string) {
  mainWindow?.webContents.send("command", command);
}
let editorDraftCount = 0;
let editorFlush:
  { resolve: () => void; reject: (e: Error) => void } | undefined;
async function flushEditors() {
  if (!editorDraftCount) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      editorFlush = undefined;
      reject(
        Error(
          "The entity editors did not finish saving. Review open drafts and try again.",
        ),
      );
    }, 30000);
    editorFlush = {
      resolve: () => {
        clearTimeout(timer);
        resolve();
      },
      reject: (e) => {
        clearTimeout(timer);
        reject(e);
      },
    };
    send("editors.flush");
  });
}
async function confirmDiscard(onDiscard?: () => void) {
  if (!lastState?.dirty && !editorDraftCount) return true;
  const r = await dialog.showMessageBox(mainWindow!, {
    type: "question",
    buttons: ["Save workspace", "Discard changes", "Cancel"],
    defaultId: 0,
    cancelId: 2,
    message: "Save changes to this workspace?",
  });
  if (r.response === 2) return false;
  if (r.response === 0)
    return (
      (await saveWorkspace(false)) && !lastState?.dirty && !editorDraftCount
    );
  onDiscard?.();
  return true;
}
let saving: Promise<boolean> | undefined;
function saveWorkspace(as: boolean) {
  if (saving) return saving;
  saving = writeWorkspace(as).finally(() => {
    saving = undefined;
  });
  return saving;
}
let captureResolve: (() => void) | undefined;
let capturing: Promise<void> | undefined;
function capturePreferences() {
  if (capturing) return capturing;
  capturing = new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      captureResolve = undefined;
      resolve();
    };
    const timer = setTimeout(done, 1500);
    captureResolve = done;
    send("workspace.capture");
  }).finally(() => {
    capturing = undefined;
  });
  return capturing;
}
async function writeWorkspace(as: boolean) {
  await flushEditors();
  let file = workspacePath;
  if (!file || as) {
    const r = await dialog.showSaveDialog(mainWindow!, {
      title: "Save Axiom workspace",
      defaultPath: file ?? "Ontology.axiom",
      filters: [{ name: "Axiom workspace", extensions: ["axiom"] }],
    });
    if (r.canceled || !r.filePath) return false;
    file = r.filePath;
  }
  await capturePreferences();
  const document = await request<{
    storeVersion: number;
    datasetEpoch: number;
  }>("serialize");
  const temp = file + ".tmp";
  await writeFile(
    temp,
    JSON.stringify({
      ...(document as object),
      workbench: { ...preferences, keyboard: undefined },
    }),
    { encoding: "utf8" },
  );
  await rename(temp, file);
  workspacePath = file;
  await request("markSaved", {
    version: document.storeVersion,
    epoch: document.datasetEpoch,
    revision: (document as any).workspaceRevision,
  });
  await checkpointSession(false);
  await rememberFile(file);
  return true;
}
async function openWorkspace(recentFile?: string) {
  if (!(await confirmDiscard())) return;
  let file = recentFile;
  if (!file) {
    const r = await dialog.showOpenDialog(mainWindow!, {
      title: "Open Axiom workspace",
      properties: ["openFile"],
      filters: [
        {
          name: "Workspaces and ontologies",
          extensions: [
            "axiom",
            "ttl",
            "rdf",
            "owl",
            "xml",
            "nt",
            "nq",
            "trig",
            "jsonld",
          ],
        },
        { name: "Axiom workspace", extensions: ["axiom"] },
      ],
    });
    if (r.canceled || !r.filePaths[0]) return;
    file = r.filePaths[0];
  }
  if (!file.toLowerCase().endsWith(".axiom")) {
    await importOntologyFile(file);
    return;
  }
  if ((await stat(file)).size > 256 * 1024 * 1024)
    throw Error("Workspace exceeds the 256 MB limit.");
  const data = JSON.parse(await readFile(file, "utf8"));
  const restored =
    data.workbench === undefined
      ? undefined
      : readPreferences({ ...data.workbench, keyboard: preferences.keyboard });
  await request("load", { document: data });
  workspacePath = file;
  mainWindow?.setTitle(path.basename(file) + " | Axiom");
  if (restored) {
    await savePreferences(restored);
    nativeTheme.themeSource = preferences.theme;
    installMenu();
    send("workspace.preferences");
  }
  await checkpointSession();
  await rememberFile(file);
}
async function command(id: string, recentFile?: string) {
  try {
    if (id.startsWith("role.")) {
      const item = Menu.getApplicationMenu()?.getMenuItemById(id),
        w = BrowserWindow.getFocusedWindow() ?? mainWindow;
      if (item && w) item.click({} as never, w, w.webContents as never);
      return;
    }
    switch (id) {
      case "graph.fit":
        send("graph.fit.manual");
        break;
      case "file.import":
        await importOntology();
        break;
      case "file.exportOntology":
        await exportOntology();
        break;
      case "file.close":
        if (await confirmDiscard()) {
          workspacePath = undefined;
          await request("new", { blank: true });
          send("workspace.new");
          await checkpointSession();
        }
        break;
      case "file.open":
        await openWorkspace(recentFile);
        break;
      case "file.save":
        await saveWorkspace(false);
        break;
      case "file.saveAs":
        await saveWorkspace(true);
        break;
      case "file.example":
        if (await confirmDiscard()) {
          workspacePath = undefined;
          await request("example");
          send("workspace.example");
          await checkpointSession();
        }
        break;
      case "file.new":
        if (await confirmDiscard()) {
          workspacePath = undefined;
          await request("new");
          send("workspace.new");
          await checkpointSession();
        }
        break;
      case "app.quit":
        app.quit();
        break;
      case "help.about":
        await dialog.showMessageBox(mainWindow!, {
          type: "info",
          title: "About Axiom",
          message: "Axiom Ontology Workbench",
          detail:
            "Version " +
            app.getVersion() +
            "\nElectron desktop application\n\nCreate an ontology or explore the Pizza example. Edit classes and individuals and run the supported SELECT query subset. Workspace files preserve RDF data and the workbench. Import RDF/XML, Turtle, N-Triples, N-Quads, TriG and JSON-LD. This release displays asserted statements without OWL reasoning.",
        });
        break;
      default:
        send(id);
    }
  } catch (e) {
    await dialog.showMessageBox(mainWindow!, {
      type: "error",
      message: "The operation could not be completed.",
      detail: e instanceof Error ? e.message : String(e),
    });
  }
}
let queryRunning = false,
  hasQueryResults = false;
let paneMenuState: Record<string, boolean> = {};
const modalWindows = new Map<number, number>();
const modalTracked = new Set<number>();
function refreshMenu() {
  const menu = Menu.getApplicationMenu();
  if (!menu) return;
  for (const item of menu.items) item.enabled = modalWindows.size === 0;
  for (const [id, enabled] of Object.entries(paneMenuState)) {
    const item = menu.getMenuItemById(id);
    if (item) item.enabled = enabled;
  }
  const selected = lastState?.entities.find(
      (e) => e.iri === lastState?.selected,
    ),
    node = lastState?.graph.nodes.find((n) => n.iri === lastState?.selected);
  const set = (id: string, enabled: boolean) => {
    const item = menu.getMenuItemById(id);
    if (item) item.enabled = enabled;
  };
  set("entity.edit", !!selected || !!lastState?.graph.selectedEdge);
  set("entity.rename", !!selected && selected.iri !== THING);
  set(
    "entity.delete",
    !!selected &&
      ["Class", "Defined"].includes(selected.kind) &&
      selected.iri !== THING,
  );
  const selectedEdge = lastState?.graph.edges.find(
    (e) =>
      JSON.stringify([e.source, e.predicate, e.target]) ===
      lastState?.graph.selectedEdge,
  );
  set("graph.pin", !!node);
  set("graph.connect", !!lastState?.entities.length);
  set("graph.expand", !!node?.degree || !!selectedEdge);
  set("graph.remove", !!node || !!selectedEdge);
  for (const id of ["edge.edit", "edge.remove"]) set(id, !!selectedEdge);
  set("edge.resetRoute", !!selectedEdge?.bend);
  for (const id of ["edge.next", "edge.previous"])
    set(
      id,
      lastState?.graph.edgesVisible !== false &&
        !!lastState?.graph.edges.length,
    );
  set("graph.collapse", !!node && node.shownDegree > 0);
  for (const id of [
    "graph.fit",
    "graph.relayout",
    "graph.freeze",
    "graph.clear",
    "graph.export.svg",
    "graph.export.png",
  ])
    set(id, !!lastState?.graph.nodes.length);
  set("graph.cancelLayout", !!lastState?.graph.layoutPending);
  set("research.open", !!lastState?.selected);
  set("entity.showGraph", !!lastState?.selected);
  const instances = instanceAction(selected);
  set("entity.showInstances", instances.enabled);
  const instanceItem = menu.getMenuItemById("entity.showInstances");
  if (instanceItem) {
    const binding = effectiveBindings(
      "entity.showInstances",
      preferences.keyboard,
    )[0];
    instanceItem.label =
      mnemonicLabel(
        "entity.showInstances",
        instances.label,
        preferences.keyboard,
      ) + (binding?.keys.includes(" ") ? "\t" + binding.keys : "");
  }
  for (const id of [
    "research.source.wikipedia",
    "research.source.dbpedia",
    "research.source.ontologies",
    "research.source.web",
  ])
    set(id, !!lastState?.selected);
  set("research.run", !!lastState?.selected && !research.status().running);
  set(
    "research.cancel",
    research.status().running && !research.status().cancelling,
  );
  set("query.run", !queryRunning);
  set("query.cancel", queryRunning);
  set("query.graph", hasQueryResults && !queryRunning);
}
function recentMenu(): MenuItemConstructorOptions[] {
  const files = recentFiles.list();
  if (!files.length) return [];
  return files.map((file, index) => {
    const key = "123456789ABC"[index];
    return {
      id: "file.recent." + index,
      label: "&" + key + " " + file.replace(/&/g, "&&"),
      click: () => void command("file.open", file),
    };
  });
}
function installMenu() {
  const build = (
    nodes: (MenuDefinition | string | null)[],
  ): MenuItemConstructorOptions[] =>
    nodes.map((node) => {
      if (node === null) return { type: "separator" };
      if (typeof node !== "string")
        return {
          id: node.id,
          label: mnemonicLabel(node.id, node.label, preferences.keyboard),
          enabled:
            node.id !== "menu.file.recent" || recentFiles.list().length > 0,
          submenu:
            node.id === "menu.file.recent"
              ? recentMenu()
              : build(node.children),
        };
      const c = commandById.get(node)!;
      const binding = effectiveBindings(node, preferences.keyboard)[0];
      const accelerator =
        binding && !binding.keys.includes(" ") ? binding.keys : undefined;
      const item: MenuItemConstructorOptions = {
        id: node,
        label:
          mnemonicLabel(node, c.label, preferences.keyboard) +
          (binding?.keys.includes(" ") ? "\t" + binding.keys : ""),
        accelerator: accelerator ?? "",
        registerAccelerator: false,
        click: () => void command(node),
      };
      if (c.role) item.role = c.role as MenuItemConstructorOptions["role"];
      if (node.startsWith("theme.")) {
        item.type = "radio";
        item.checked = preferences.theme === node.slice(6);
      }
      return item;
    });
  Menu.setApplicationMenu(Menu.buildFromTemplate(build(menuTree)));
  refreshMenu();
}
app.whenReady().then(async () => {
  try {
    const p = JSON.parse(await readFile(settingsPath(), "utf8"));
    preferences = readPreferences(p);
  } catch {
    try {
      const p = JSON.parse(await readFile(settingsPath() + ".bak", "utf8"));
      preferences = readPreferences(p);
    } catch {}
  }
  if (!["system", "light", "dark"].includes(preferences.theme))
    preferences.theme = "light";
  nativeTheme.themeSource = preferences.theme;
  protocol.handle("app", async (req) => {
    const u = new URL(req.url);
    if (u.host !== "axiom") return new Response("Not found", { status: 404 });
    const root = path.resolve(__dirname, "../renderer"),
      target = path.resolve(root, "." + decodeURIComponent(u.pathname));
    if (target !== root && !target.startsWith(root + path.sep))
      return new Response("Not found", { status: 404 });
    return net.fetch(pathToFileURL(target).toString());
  });
  worker = new Worker(path.join(__dirname, "domain-worker.cjs"));
  worker.on("message", (packet) => {
    if (packet.event) {
      if (packet.event.type === "query-state") {
        queryRunning = packet.event.data.running;
        hasQueryResults = packet.event.data.hasResults;
      }
      if (packet.event.type === "selection" && lastState)
        lastState = {
          ...lastState,
          selected: packet.event.data.iri,
          graph: { ...lastState.graph, selectedEdge: null },
        };
      if (packet.event.type === "state") {
        lastState = packet.event.data;
        mainWindow?.setTitle(
          (workspacePath
            ? path.basename(workspacePath)
            : (lastState?.ontology.name ?? "Untitled ontology")) +
            (lastState?.dirty ? " *" : "") +
            " | Axiom",
        );
      }
      refreshMenu();
      for (const w of BrowserWindow.getAllWindows())
        if (!w.isDestroyed()) w.webContents.send("domain:event", packet.event);
      return;
    }
    const p = pending.get(packet.id);
    if (!p) return;
    pending.delete(packet.id);
    if (packet.error)
      p.reject(
        new Error(packet.error + (packet.hint ? " " + packet.hint : "")),
      );
    else p.resolve(packet.value);
  });
  worker.on("error", (e) => {
    for (const p of pending.values()) p.reject(e);
    pending.clear();
    if (mainWindow)
      void dialog.showMessageBox(mainWindow, {
        type: "error",
        message: "The data service stopped.",
        detail: e.message,
      });
  });
  await recentFiles.load();
  const restoredSession = await sessions.restore(async (session) => {
    await request("load", { document: session.workspace });
    preferences = readPreferences({
      ...session.workbench,
      keyboard: preferences.keyboard,
    });
    workspacePath = session.workspacePath;
    if (workspacePath) {
      try {
        await stat(workspacePath);
      } catch {
        workspacePath = undefined;
      }
    }
  });
  if (!recentFiles.list().length && restoredSession.session) {
    // Carry a known file from the last session into newly introduced history.
    const source = restoredSession.session.workspace.ontology?.source?.baseIRI;
    let previousFile = workspacePath;
    try {
      if (!previousFile && source?.startsWith("file:"))
        previousFile = fileURLToPath(source);
      if (previousFile && (await stat(previousFile)).isFile())
        await recentFiles.remember(previousFile);
    } catch {}
  }
  if (!restoredSession.session) {
    preferences.panelState = {
      ...preferences.panelState,
      "query.text":
        "SELECT ?subject ?predicate ?object WHERE { ?subject ?predicate ?object . } LIMIT 100",
      "query.example": 0,
      "hierarchy.open": [],
    };
  }
  nativeTheme.themeSource = preferences.theme;
  sessionBaseline = {
    format: "axiom-session",
    version: 1,
    workspace: await request<Workspace>("serialize"),
    workspacePath,
    workbench: preferences,
  };
  const bounds = preferences.bounds;
  const validBounds =
    bounds &&
    [bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) &&
    screen
      .getAllDisplays()
      .some(
        (d) =>
          bounds.x + Math.min(bounds.width, 100) > d.workArea.x &&
          bounds.x < d.workArea.x + d.workArea.width &&
          bounds.y + 30 > d.workArea.y &&
          bounds.y < d.workArea.y + d.workArea.height,
      );
  mainWindow = new BrowserWindow({
    width: 1380,
    height: 920,
    ...(validBounds ? bounds : {}),
    minWidth: 840,
    minHeight: 600,
    title: "Axiom Ontology Workbench",
    icon: path.join(__dirname, "../assets/axiom.ico"),
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#202020" : "#f3f3f3",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  const secure = (w: BrowserWindow) => {
    w.webContents.on("will-navigate", (event, url) => {
      if (!url.startsWith("app://axiom/")) event.preventDefault();
    });
    w.webContents.setWindowOpenHandler(({ url }) =>
      /^app:\/\/axiom\/popout\.html(?:\?id=[a-f0-9-]{36})?$/.test(url)
        ? {
            action: "allow",
            overrideBrowserWindowOptions: {
              minWidth: 320,
              minHeight: 240,
              webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: true,
                backgroundThrottling: false,
              },
            },
          }
        : { action: "deny" },
    );
    w.webContents.on("did-create-window", (child) => secure(child));
    w.webContents.session.setPermissionRequestHandler(
      (_wc, _permission, callback) => callback(false),
    );
  };
  secure(mainWindow);
  installMenu();
  ipcMain.handle(
    "domain:request",
    (event, method: DomainMethod, args: Record<string, unknown>) => {
      authorised(event);
      if (
        !methods.has(method) ||
        [
          "serialize",
          "load",
          "markSaved",
          "new",
          "example",
          "importRdf",
          "rdfExport",
          "reportData",
        ].includes(method)
      )
        throw Error("Unknown operation.");
      if (
        args !== undefined &&
        (!args || typeof args !== "object" || Array.isArray(args))
      )
        throw Error("Invalid arguments.");
      return request(method, args);
    },
  );
  ipcMain.on("editors:dirty", (event, count) => {
    authorised(event);
    if (Number.isInteger(count) && count >= 0 && count <= 1000)
      editorDraftCount = count;
  });
  ipcMain.on("editors:flushed", (event, error) => {
    authorised(event);
    if (typeof error === "string")
      editorFlush?.reject(Error(error.slice(0, 2000)));
    else editorFlush?.resolve();
    editorFlush = undefined;
  });
  ipcMain.handle("files:open", async (event, iri) => {
    authorised(event);
    const file = await resolveLinkedFile(iri);
    await stat(file.path);
    const error = await shell.openPath(file.path);
    if (error) throw Error(error);
  });
  ipcMain.handle("files:reveal", async (event, iri) => {
    authorised(event);
    const file = await resolveLinkedFile(iri);
    await stat(file.path);
    shell.showItemInFolder(file.path);
  });
  ipcMain.handle("files:thumbnail", async (event, iri) => {
    authorised(event);
    return filePreviews.thumbnail(await resolveLinkedFile(iri));
  });
  ipcMain.handle("provenance:choose", async (event) => {
    authorised(event);
    if (provenance.status().status === "running")
      throw Error("Cancel collection before selecting another folder.");
    const r = await dialog.showOpenDialog(mainWindow!, {
      title: "Choose provenance root folder",
      properties: ["openDirectory"],
    });
    return r.canceled ? null : provenance.select(r.filePaths[0]);
  });
  ipcMain.handle("provenance:status", (event) => {
    authorised(event);
    return provenance.status();
  });
  ipcMain.handle("provenance:start", (event, o) => {
    authorised(event);
    return provenance.start(o);
  });
  ipcMain.handle("provenance:cancel", (event) => {
    authorised(event);
    provenance.cancel();
  });
  ipcMain.handle("provenance:open", async (event) => {
    authorised(event);
    const s = provenance.status();
    if (s.status === "running" || !s.entries || !s.rdfPath)
      throw Error("Finish collecting before opening the ontology.");
    if (!(await confirmDiscard())) return false;
    await importOntologyFile(s.rdfPath);
    return true;
  });
  ipcMain.handle("provenance:reveal", (event) => {
    authorised(event);
    const file = provenance.status().evidencePath;
    if (file) shell.showItemInFolder(file);
  });
  ipcMain.handle("queryAssistant:assistants", (event) => {
    authorised(event);
    return queryAssistant.assistants();
  });
  ipcMain.handle("queryHistory:result", (event, id) => {
    authorised(event);
    return queryHistory.result(id);
  });
  ipcMain.handle("queryHistory:load", (event) => {
    authorised(event);
    return queryHistory.load();
  });
  ipcMain.handle("queryHistory:apply", (event, action) => {
    authorised(event);
    return queryHistory.apply(action);
  });
  ipcMain.handle("queryHistory:search", (event, text) => {
    authorised(event);
    return queryHistory.search(text);
  });
  ipcMain.handle("queryAssistant:run", async (event, input) => {
    authorised(event);
    if (queryAssistantJob) throw Error("Query generation is already running.");
    const job = {
      cancelled: false,
      startedAt: Date.now(),
      provider: input?.provider,
    };
    queryAssistantJob = job;
    try {
      const baseline = await queryHistory.baseline(input?.queryId);
      if (job.cancelled) throw Error("Query generation cancelled.");
      const response = await queryAssistant.run(input);
      if (job.cancelled) throw Error("Query generation cancelled.");
      await queryHistory.deliver(response, baseline);
      return response;
    } finally {
      queryAssistantJob = undefined;
    }
  });
  ipcMain.handle("queryAssistant:status", (event) => {
    authorised(event);
    const status = queryAssistant.status();
    return queryAssistantJob
      ? {
          ...status,
          running: true,
          startedAt: queryAssistantJob.startedAt,
          provider: queryAssistantJob.provider,
          cancelling: queryAssistantJob.cancelled,
        }
      : status;
  });
  ipcMain.handle("queryAssistant:cancel", (event) => {
    authorised(event);
    if (queryAssistantJob) queryAssistantJob.cancelled = true;
    queryAssistant.cancel();
  });
  ipcMain.handle("taxonomyAssistant:run", (event, input) => {
    authorised(event);
    return taxonomyAssistant.run(input);
  });
  ipcMain.handle("taxonomyAssistant:status", (event) => {
    authorised(event);
    return taxonomyAssistant.status();
  });
  ipcMain.handle("taxonomyAssistant:cancel", (event, id) => {
    authorised(event);
    if (typeof id !== "string" || !id || id.length > 100)
      throw Error("Invalid request ID.");
    taxonomyAssistant.cancel(id);
  });
  ipcMain.handle("taxonomyAssistant:apply", (event, id, indices) => {
    authorised(event);
    return taxonomyAssistant.apply(id, indices);
  });
  ipcMain.handle("research:assistants", (event) => {
    authorised(event);
    return research.assistants();
  });
  ipcMain.handle("research:run", (event, input) => {
    authorised(event);
    const pending = research.run(input);
    refreshMenu();
    return pending.finally(() => refreshMenu());
  });
  ipcMain.handle("research:cancel", (event) => {
    authorised(event);
    research.cancel();
    refreshMenu();
  });
  ipcMain.handle("research:status", (event) => {
    authorised(event);
    return research.status();
  });
  ipcMain.handle("research:open", (event, url) => {
    authorised(event);
    if (typeof url !== "string" || url.length > 10000)
      throw Error("Invalid source URL.");
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password)
      throw Error("Only HTTPS research links are supported.");
    return shell.openExternal(parsed.href);
  });
  ipcMain.on("keyboard:menu", (event) => {
    authorised(event);
    if (modalWindows.size) return;
    const owner = BrowserWindow.fromWebContents(event.sender) ?? mainWindow!;
    Menu.getApplicationMenu()?.popup({
      window: owner,
      x: 0,
      y: 0,
      sourceType: "keyboard",
      callback: () => {
        if (!owner.isDestroyed()) owner.webContents.focus();
      },
    });
  });
  ipcMain.on("keyboard:modal", (event, active) => {
    authorised(event);
    if (typeof active !== "boolean") return;
    const id = event.sender.id,
      count = modalWindows.get(id) ?? 0;
    if (active) {
      modalWindows.set(id, count + 1);
      if (!modalTracked.has(id)) {
        modalTracked.add(id);
        event.sender.once("destroyed", () => {
          modalWindows.delete(id);
          modalTracked.delete(id);
          refreshMenu();
        });
      }
    } else if (count > 1) modalWindows.set(id, count - 1);
    else modalWindows.delete(id);
    refreshMenu();
  });
  ipcMain.handle("keyboard:save", async (event, input) => {
    authorised(event);
    const settings = readKeyboardSettings(input);
    await savePreferences({ ...preferences, keyboard: settings });
    installMenu();
    for (const w of BrowserWindow.getAllWindows())
      w.webContents.send("domain:event", {
        type: "keyboard-changed",
        data: settings,
      });
    return settings;
  });
  ipcMain.handle("keyboard:import", async (event) => {
    authorised(event);
    const r = await dialog.showOpenDialog(
      BrowserWindow.fromWebContents(event.sender) ?? mainWindow!,
      {
        title: "Import keyboard shortcuts",
        properties: ["openFile"],
        filters: [{ name: "Axiom keyboard shortcuts", extensions: ["json"] }],
      },
    );
    if (r.canceled) return null;
    if ((await stat(r.filePaths[0])).size > 100000)
      throw Error("Keyboard settings exceed 100 KB.");
    return readKeyboardSettings(
      JSON.parse(await readFile(r.filePaths[0], "utf8")),
    );
  });
  ipcMain.handle("keyboard:export", async (event, input) => {
    authorised(event);
    const settings = readKeyboardSettings(input);
    const r = await dialog.showSaveDialog(
      BrowserWindow.fromWebContents(event.sender) ?? mainWindow!,
      {
        title: "Export keyboard shortcuts",
        defaultPath: "axiom-keyboard.json",
        filters: [{ name: "Axiom keyboard shortcuts", extensions: ["json"] }],
      },
    );
    if (r.canceled || !r.filePath) return null;
    await writeFile(r.filePath, JSON.stringify(settings, null, 2), "utf8");
    return r.filePath;
  });
  ipcMain.handle("preferences:load", (event) => {
    authorised(event);
    return preferences;
  });
  ipcMain.handle(
    "preferences:save",
    async (event, p: Preferences, captured?: boolean) => {
      authorised(event);
      if (!p || p.version !== 1 || JSON.stringify(p).length > 2000000)
        throw Error("Invalid layout settings.");
      const previousTheme = preferences.theme;
      await savePreferences(p);
      if (captured === true) captureResolve?.();
      nativeTheme.themeSource = preferences.theme;
      if (previousTheme !== preferences.theme) installMenu();
    },
  );
  ipcMain.on("menu:state", (event, state: Record<string, boolean>) => {
    authorised(event);
    if (!state || typeof state !== "object") return;
    paneMenuState = Object.fromEntries(
      Object.entries(state).filter(
        ([key, value]) =>
          /^pane\.(next|previous|nextTab|previousTab|move\.(left|right|top|bottom)|group|wider|narrower|maximise|float|detach|reattach|close)$/.test(
            key,
          ) && typeof value === "boolean",
      ),
    );
    refreshMenu();
  });
  ipcMain.handle("pane:maximizeWindow", (event, url: string) => {
    authorised(event);
    if (
      typeof url !== "string" ||
      !/^app:\/\/axiom\/popout\.html(?:\?id=[a-f0-9-]{36})?$/.test(url)
    )
      throw Error("Unknown pane window.");
    const target = BrowserWindow.getAllWindows().find(
      (win) => win.webContents.getURL() === url,
    );
    if (!target) throw Error("The pane window is no longer open.");
    target.maximize();
  });
  ipcMain.on("command", (event, id: string) => {
    authorised(event);
    if (commandById.has(id)) {
      const item = Menu.getApplicationMenu()?.getMenuItemById(id);
      if (!item || item.enabled) void command(id);
    }
  });
  ipcMain.handle("copy", (event, text: string) => {
    authorised(event);
    if (typeof text !== "string" || text.length > 10000000)
      throw Error("Invalid clipboard data.");
    return clipboard.writeText(text);
  });
  ipcMain.handle("export:document", async (event, input) => {
    authorised(event);
    return exportDocument(
      input,
      BrowserWindow.fromWebContents(event.sender) ?? mainWindow!,
      request,
    );
  });
  ipcMain.handle("export", async (event, format: string, data: string) => {
    authorised(event);
    if (
      !["svg", "png", "clipboard"].includes(format) ||
      typeof data !== "string" ||
      data.length > 150000000
    )
      throw Error("Invalid export.");
    if (format === "clipboard") {
      const image = nativeImage.createFromDataURL(data);
      if (image.isEmpty()) throw Error("The image could not be copied.");
      await clipboard.write([
        new ClipboardItem({
          "image/png": new Blob([new Uint8Array(image.toPNG())], {
            type: "image/png",
          }),
        }),
      ]);
      return "clipboard";
    }
    const r = await dialog.showSaveDialog(mainWindow!, {
      title: "Export graph",
      defaultPath: "axiom-graph." + format,
      filters: [
        { name: format.toUpperCase() + " image", extensions: [format] },
      ],
    });
    if (r.canceled || !r.filePath) return null;
    await writeFile(
      r.filePath,
      format === "svg"
        ? data
        : Buffer.from(data.replace(/^data:image\/png;base64,/, ""), "base64"),
    );
    return r.filePath;
  });
  let closePending = false;
  mainWindow.on("close", (event) => {
    if (closing) return;
    event.preventDefault();
    if (closePending) return;
    closePending = true;
    void (async () => {
      await capturePreferences();
      let discarded = false;
      if (
        !(await confirmDiscard(() => {
          discarded = true;
        }))
      ) {
        closePending = false;
        return;
      }
      closing = true;
      if (mainWindow && !mainWindow.isDestroyed())
        await savePreferences({
          ...preferences,
          bounds: mainWindow.getNormalBounds(),
          maximized: mainWindow.isMaximized(),
        });
      if (discarded)
        await sessions.save({ ...sessionBaseline, workbench: preferences });
      else await checkpointSession(false);
      mainWindow?.close();
    })().catch((e) => {
      closePending = false;
      closing = false;
      void dialog.showMessageBox(mainWindow!, {
        type: "error",
        message: "Could not close the workspace.",
        detail: String(e),
      });
    });
  });
  await mainWindow.loadURL("app://axiom/index.html");
  lastState = await request<Snapshot>("state");
  mainWindow.setTitle(
    (workspacePath ? path.basename(workspacePath) : lastState.ontology.name) +
      " | Axiom",
  );
  if (!restoredSession.session && restoredSession.errors.length)
    void dialog.showMessageBox(mainWindow, {
      type: "warning",
      message:
        "The last session could not be restored. Axiom opened an empty workspace.",
      detail: "You can open your saved ontology or workspace from File > Open.",
    });
  refreshMenu();
  if (preferences.maximized) mainWindow.maximize();
});
app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => {
  taxonomyAssistant.cancel();
  queryAssistant.cancel();
  provenance.close();
  research.cancel();
  if (closing) void worker?.terminate();
});

async function importOntologyFile(file: string) {
  if ((await stat(file)).size > 128 * 1024 * 1024)
    throw Error("Ontology exceeds the 128 MB import limit.");
  const result = await request("importRdf", {
    text: await readFile(file, "utf8"),
    fileName: path.basename(file),
    baseIRI: pathToFileURL(file).href,
  });
  workspacePath = undefined;
  send("workspace.imported");
  await checkpointSession();
  await rememberFile(file);
  return result;
}
async function importOntology() {
  if (!(await confirmDiscard())) return;
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: "Import ontology",
    properties: ["openFile"],
    filters: [
      {
        name: "RDF and OWL ontologies",
        extensions: ["ttl", "rdf", "owl", "xml", "nt", "nq", "trig", "jsonld"],
      },
      { name: "All files", extensions: ["*"] },
    ],
  });
  if (!result.canceled) await importOntologyFile(result.filePaths[0]);
}
async function exportOntology() {
  await flushEditors();
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: "Export ontology",
    defaultPath: "ontology.ttl",
    filters: [
      { name: "Turtle", extensions: ["ttl"] },
      { name: "RDF/XML / OWL", extensions: ["rdf", "owl"] },
      { name: "N-Triples", extensions: ["nt"] },
      { name: "TriG (named graphs)", extensions: ["trig"] },
      { name: "N-Quads (named graphs)", extensions: ["nq"] },
      { name: "JSON-LD", extensions: ["jsonld"] },
    ],
  });
  if (result.canceled || !result.filePath) return;
  const format = (
    {
      ".ttl": "turtle",
      ".rdf": "rdfxml",
      ".owl": "rdfxml",
      ".xml": "rdfxml",
      ".nt": "ntriples",
      ".trig": "trig",
      ".nq": "nquads",
      ".jsonld": "jsonld",
    } as Record<string, string>
  )[path.extname(result.filePath).toLowerCase()];
  if (!format) throw Error("Use a supported RDF filename extension.");
  const text = (await request("rdfExport", { format })) as string;
  await writeFile(result.filePath, text, "utf8");
}
