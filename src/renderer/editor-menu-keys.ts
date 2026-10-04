import { menuKeys } from "../shared/menu-keys";
import { suspendMenus } from "./access-keys";
import type { editor } from "monaco-editor/editor/editor.api.js";
import { report } from "./client";
const editors = new WeakMap<Node, editor.IStandaloneCodeEditor>();
export function registerEditorMenu(instance: editor.IStandaloneCodeEditor) {
  const host = instance.getContainerDomNode();
  editors.set(host, instance);
  return () => {
    editors.delete(host);
  };
}
function owningEditor(item: HTMLElement) {
  for (
    let node: Node | null = item;
    node;
    node = node.parentNode ?? (node as ShadowRoot).host ?? null
  ) {
    const instance = editors.get(node);
    if (instance) return instance;
  }
}
const openDocuments = new WeakSet<Document>();
export const editorMenuOpen = (doc: Document) => openDocuments.has(doc);

/** Monaco's context-menu contribution exposes no public mnemonic option.
 * Annotate its rendered menus and activate the existing action through its
 * own keyboard handler, keeping editor commands, submenus and enablement intact.
 */
export function installEditorMenuKeys(doc: Document) {
  const win = doc.defaultView!;
  let resume: (() => void) | undefined;
  const observed = new WeakSet<ShadowRoot>();
  const disabled = (item: HTMLElement) =>
    item.getAttribute("aria-disabled") === "true" ||
    !!item.closest(".disabled");
  const nativePaste = (item: HTMLElement) => {
    if (
      disabled(item) ||
      item.querySelector(".action-label")?.textContent?.trim() !== "Paste"
    )
      return false;
    const instance = owningEditor(item),
      model = instance?.getModel();
    if (!instance || !model || instance.getRawOptions().readOnly) return false;
    const version = model.getVersionId(),
      selections = instance.getSelections();
    // Read through the trusted desktop bridge and paste into this editor's
    // model. Detached documents share a renderer but have independent focus.
    item.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        code: "Escape",
        keyCode: 27,
        bubbles: true,
        cancelable: true,
      }),
    );
    // Monaco can retain a stale focus flag after a popup in another document.
    instance
      .getDomNode()
      ?.querySelector<HTMLTextAreaElement>("textarea")
      ?.focus();
    void (win.axiom ?? window.axiom).editors
      .readClipboard()
      .then((text) => {
        if (!text) return;
        const current = instance.getSelections(),
          dom = instance.getDomNode();
        if (
          !dom?.isConnected ||
          !dom.contains(dom.ownerDocument.activeElement) ||
          instance.getModel() !== model ||
          model.isDisposed() ||
          model.getVersionId() !== version ||
          instance.getRawOptions().readOnly ||
          !selections ||
          !current ||
          selections.length !== current.length ||
          selections.some(
            (selection, i) => !selection.equalsSelection(current[i]),
          )
        )
          return;
        instance.trigger("menu", "paste", { text });
      })
      .catch((error) =>
        report(error instanceof Error ? error.message : String(error), true),
      );
    return true;
  };
  const annotate = () => {
    // Monaco mounts its popup inside an open shadow root. Observe that root
    // as well as the document so submenu creation and dismissal are covered.
    const roots: (Document | ShadowRoot)[] = [doc];
    for (const host of doc.querySelectorAll(".shadow-root-host")) {
      const root = host.shadowRoot;
      if (!root) continue;
      roots.push(root);
      if (!observed.has(root)) {
        observed.add(root);
        observer.observe(root, { childList: true, subtree: true });
      }
    }
    const menus = roots.flatMap((root) => [
      ...root.querySelectorAll<HTMLElement>(".monaco-menu [role=menu]"),
    ]);
    if (menus.length) openDocuments.add(doc);
    else openDocuments.delete(doc);
    if (menus.length && !resume) resume = suspendMenus(doc);
    if (!menus.length && resume) {
      resume();
      resume = undefined;
    }
    for (const menu of menus) {
      const items = [
        ...menu.querySelectorAll<HTMLElement>("[role^=menuitem]"),
      ].filter((item) => item.closest("[role=menu]") === menu);
      const labels = items.map((item) =>
        item.matches(".action-label")
          ? item
          : item.querySelector<HTMLElement>(".action-label"),
      );
      const keys = menuKeys(labels.map((label) => label?.textContent ?? ""));
      items.forEach((item, index) => {
        const label = labels[index],
          key = keys[index];
        if (!label || !key) return;
        if (
          item.dataset.menuKey === key &&
          label.querySelector("u")?.textContent?.toUpperCase() === key
        )
          return;
        item.dataset.menuKey = key;
        item.setAttribute("aria-keyshortcuts", `${key} Alt+${key}`);
        const text = label.textContent ?? "",
          at = text.toUpperCase().indexOf(key);
        const underline = doc.createElement("u");
        underline.textContent = text[at];
        label.replaceChildren(
          doc.createTextNode(text.slice(0, at)),
          underline,
          doc.createTextNode(text.slice(at + 1)),
        );
      });
    }
  };
  const keydown = (event: KeyboardEvent) => {
    if (
      event.ctrlKey ||
      event.metaKey ||
      event.isComposing ||
      event.repeat ||
      (event.key.length !== 1 && event.key !== "Enter")
    )
      return;
    const target = event.composedPath()[0] as HTMLElement | undefined;
    const menu = target?.closest<HTMLElement>(".monaco-menu [role=menu]");
    if (!menu) return;
    if (event.key === "Enter") {
      const focused = target?.closest<HTMLElement>("[role^=menuitem]");
      if (focused && nativePaste(focused)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      return;
    }
    annotate(); // Also handle a key pressed in the same task that opened the menu.
    const item = [
      ...menu.querySelectorAll<HTMLElement>("[data-menu-key]"),
    ].find(
      (candidate) =>
        candidate.closest("[role=menu]") === menu &&
        candidate.dataset.menuKey === event.key.toUpperCase(),
    );
    if (!item) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (disabled(item) || nativePaste(item)) return;
    // Mouseover selects the ActionBar's item; Enter runs the actual action.
    // This also avoids Monaco's delayed mouseup registration on newly opened menus.
    item.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    item.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        bubbles: true,
        cancelable: true,
      }),
    );
  };
  const mouseup = (event: MouseEvent) => {
    if (event.button !== 0) return;
    const item = (
      event.composedPath()[0] as HTMLElement | undefined
    )?.closest<HTMLElement>(".monaco-menu [role^=menuitem]");
    if (item && nativePaste(item)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };
  const observer = new MutationObserver(annotate);
  observer.observe(doc.body, { childList: true, subtree: true });
  win.addEventListener("keydown", keydown, true);
  win.addEventListener("mouseup", mouseup, true);
  annotate();
  return () => {
    observer.disconnect();
    openDocuments.delete(doc);
    win.removeEventListener("keydown", keydown, true);
    win.removeEventListener("mouseup", mouseup, true);
    resume?.();
  };
}
