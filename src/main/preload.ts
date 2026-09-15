import { contextBridge, ipcRenderer } from "electron";
import type {
  AxiomBridge,
  DomainMethod,
  Preferences,
} from "../shared/protocol";
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
    open: (iri) => ipcRenderer.invoke("files:open", iri),
    reveal: (iri) => ipcRenderer.invoke("files:reveal", iri),
    thumbnail: (iri) => ipcRenderer.invoke("files:thumbnail", iri),
  },
  provenance: {
    choose: () => ipcRenderer.invoke("provenance:choose"),
    start: (o) => ipcRenderer.invoke("provenance:start", o),
    status: () => ipcRenderer.invoke("provenance:status"),
    cancel: () => ipcRenderer.invoke("provenance:cancel"),
    open: () => ipcRenderer.invoke("provenance:open"),
    reveal: () => ipcRenderer.invoke("provenance:reveal"),
  },
  keyboard: {
    modal: (active) => ipcRenderer.send("keyboard:modal", active),
    menu: () => ipcRenderer.send("keyboard:menu"),
    save: (settings) => ipcRenderer.invoke("keyboard:save", settings),
    import: () => ipcRenderer.invoke("keyboard:import"),
    export: (settings) => ipcRenderer.invoke("keyboard:export", settings),
  },
  queryHistory: {
    result: (id) => ipcRenderer.invoke("queryHistory:result", id),
    load: () => ipcRenderer.invoke("queryHistory:load"),
    apply: (action) => ipcRenderer.invoke("queryHistory:apply", action),
    search: (text) => ipcRenderer.invoke("queryHistory:search", text),
  },
  queryAssistant: {
    assistants: () => ipcRenderer.invoke("queryAssistant:assistants"),
    run: (r) => ipcRenderer.invoke("queryAssistant:run", r),
    cancel: () => ipcRenderer.invoke("queryAssistant:cancel"),
    status: () => ipcRenderer.invoke("queryAssistant:status"),
  },
  taxonomyAssistant: {
    run: (input) => ipcRenderer.invoke("taxonomyAssistant:run", input),
    status: () => ipcRenderer.invoke("taxonomyAssistant:status"),
    cancel: (id) => ipcRenderer.invoke("taxonomyAssistant:cancel", id),
    apply: (id, indices) =>
      ipcRenderer.invoke("taxonomyAssistant:apply", id, indices),
  },
  research: {
    assistants: () => ipcRenderer.invoke("research:assistants"),
    run: (r) => ipcRenderer.invoke("research:run", r),
    cancel: () => ipcRenderer.invoke("research:cancel"),
    status: () => ipcRenderer.invoke("research:status"),
    open: (url) => ipcRenderer.invoke("research:open", url),
  },
  request: <T>(method: DomainMethod, args?: Record<string, unknown>) =>
    ipcRenderer.invoke("domain:request", method, args) as Promise<T>,
  preferences: {
    load: () => ipcRenderer.invoke("preferences:load"),
    save: (p: Preferences, captured?: boolean) =>
      ipcRenderer.invoke("preferences:save", p, captured),
  },
  onEvent: (fn) => listen("domain:event", fn),
  onCommand: (fn) => listen("command", fn),
  menuState: (state) => ipcRenderer.send("menu:state", state),
  command: (command) => ipcRenderer.send("command", command),
  exportFile: (format, data) => ipcRenderer.invoke("export", format, data),
  exportDocument: (input) => ipcRenderer.invoke("export:document", input),
  copy: (text) => ipcRenderer.invoke("copy", text),
};
contextBridge.exposeInMainWorld("axiom", bridge);
