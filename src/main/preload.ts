import { cleanErrorMessage } from "../shared/audit";
import { contextBridge, ipcRenderer } from "electron";
import type {
  AxiomBridge,
  DomainMethod,
  Preferences,
} from "../shared/protocol";
const invoke = async (channel: string, ...args: unknown[]) => {
  try {
    return await ipcRenderer.invoke(channel, ...args);
  } catch (error) {
    throw Error(cleanErrorMessage(error));
  }
};
const listen = (channel: string, fn: (value: any) => void) => {
  const handler = (_event: Electron.IpcRendererEvent, value: any) => fn(value);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};
const bridge: AxiomBridge = {
  maximizeWindow: (url) => ipcRenderer.invoke("pane:maximizeWindow", url),
  editors: {
    dirty: (count) => ipcRenderer.send("editors:dirty", count),
    flushed: (error) => ipcRenderer.send("editors:flushed", error),
  },
  files: {
    open: (iri) => invoke("files:open", iri),
    reveal: (iri) => invoke("files:reveal", iri),
    thumbnail: (iri) => invoke("files:thumbnail", iri),
  },
  provenance: {
    choose: () => invoke("provenance:choose"),
    start: (o) => invoke("provenance:start", o),
    status: () => invoke("provenance:status"),
    cancel: () => invoke("provenance:cancel"),
    open: () => invoke("provenance:open"),
    reveal: () => invoke("provenance:reveal"),
  },
  keyboard: {
    modal: (active) => ipcRenderer.send("keyboard:modal", active),
    menu: () => ipcRenderer.send("keyboard:menu"),
    save: (settings) => invoke("keyboard:save", settings),
    import: () => invoke("keyboard:import"),
    export: (settings) => invoke("keyboard:export", settings),
  },
  queryHistory: {
    result: (id) => invoke("queryHistory:result", id),
    load: () => invoke("queryHistory:load"),
    apply: (action) => invoke("queryHistory:apply", action),
    search: (text) => invoke("queryHistory:search", text),
  },
  queryAssistant: {
    assistants: () => invoke("queryAssistant:assistants"),
    run: (r) => invoke("queryAssistant:run", r),
    cancel: () => invoke("queryAssistant:cancel"),
    status: () => invoke("queryAssistant:status"),
  },
  taxonomyAssistant: {
    history: () => invoke("taxonomyAssistant:history"),
    read: (id) => invoke("taxonomyAssistant:read", id),
    run: (input) => invoke("taxonomyAssistant:run", input),
    status: () => invoke("taxonomyAssistant:status"),
    cancel: (id) => invoke("taxonomyAssistant:cancel", id),
    apply: (id, indices) => invoke("taxonomyAssistant:apply", id, indices),
  },
  research: {
    assistants: () => invoke("research:assistants"),
    run: (r) => invoke("research:run", r),
    cancel: () => invoke("research:cancel"),
    status: () => invoke("research:status"),
    open: (url) => invoke("research:open", url),
  },
  request: <T>(method: DomainMethod, args?: Record<string, unknown>) =>
    invoke("domain:request", method, args) as Promise<T>,
  preferences: {
    load: () => invoke("preferences:load"),
    save: (
      p: Preferences,
      captured?: boolean,
      drafts?: import("../shared/editor-state").SavedEditorDrafts,
    ) => invoke("preferences:save", p, captured, drafts),
  },
  onEvent: (fn) => listen("domain:event", fn),
  onCommand: (fn) => listen("command", fn),
  menuState: (state) => ipcRenderer.send("menu:state", state),
  command: (command) => ipcRenderer.send("command", command),
  exportFile: (format, data) => invoke("export", format, data),
  exportDocument: (input) => invoke("export:document", input),
  copy: (text) => invoke("copy", text),
};
contextBridge.exposeInMainWorld("axiom", bridge);
