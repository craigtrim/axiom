export function suspendMenus(doc: Document) {
  const bridge = doc.defaultView?.axiom ?? window.axiom;
  bridge.keyboard.modal(true);
  return () => {
    try {
      bridge.keyboard.modal(false);
    } catch {}
  };
}
export function installDialogAccessKeys(dialog: HTMLDialogElement) {
  const doc = dialog.ownerDocument,
    win = doc.defaultView!,
    resume = suspendMenus(doc);
  const targets = new Map<string, HTMLElement>();
  const assign = () => {
    targets.clear();
    for (const el of dialog.querySelectorAll<HTMLElement>(
      "[data-access-key]",
    )) {
      delete el.dataset.accessKey;
      el.removeAttribute("aria-keyshortcuts");
    }
    const candidates = [
      ...dialog.querySelectorAll<HTMLElement>("label,button"),
    ].filter(
      (el) =>
        el.getClientRects().length &&
        !el.closest("[role=listbox]") &&
        !/^(Close|Cancel|OK|Remove shortcut|Reset menu)/i.test(
          el.getAttribute("aria-label") ?? el.textContent?.trim() ?? "",
        ),
    );
    candidates.sort(
      (a, b) => Number(b.matches(".primary")) - Number(a.matches(".primary")),
    );
    for (const el of candidates) {
      const target =
        el.tagName === "LABEL" ? (el as HTMLLabelElement).control : el;
      if (!target) continue;
      const label =
        el.tagName === "LABEL"
          ? [...el.childNodes]
              .filter((n) => n.nodeType === 3)
              .map((n) => n.textContent)
              .join("")
          : (el.getAttribute("aria-label") ?? el.textContent ?? "");
      const key = [...label.toUpperCase().replace(/[^A-Z0-9]/g, "")].find(
        (k) => !targets.has(k),
      );
      if (!key) continue;
      targets.set(key, target);
      el.dataset.accessKey = key;
      target.setAttribute("aria-keyshortcuts", "Alt+" + key);
    }
  };
  const keydown = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).closest("[data-shortcut-recorder]")) return;
    if (e.key === "Alt") dialog.dataset.showAccessKeys = "true";
    if (e.key === "Escape") delete dialog.dataset.showAccessKeys;
    if (!e.altKey || e.ctrlKey || e.metaKey || e.isComposing) return;
    const target = targets.get(e.key.toUpperCase());
    if (!target || target.matches(":disabled")) return;
    e.preventDefault();
    e.stopPropagation();
    delete dialog.dataset.showAccessKeys;
    if (target.tagName === "BUTTON") target.click();
    else target.focus();
  };
  const keyup = (e: KeyboardEvent) => {
    if (e.key === "Alt") delete dialog.dataset.showAccessKeys;
  };
  const observer = new MutationObserver(assign);
  observer.observe(dialog, { childList: true, subtree: true });
  assign();
  win.addEventListener("keydown", keydown);
  win.addEventListener("keyup", keyup);
  return () => {
    observer.disconnect();
    win.removeEventListener("keydown", keydown);
    win.removeEventListener("keyup", keyup);
    resume();
  };
}
