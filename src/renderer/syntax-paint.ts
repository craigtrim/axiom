import { syntaxKinds, type SyntaxKind } from "./syntax-theme";

export type SyntaxRange = { from: number; to: number; kind: SyntaxKind };
const registrations = new WeakMap<
  Element,
  { document: Document; migrate(): void }
>();
const documents = new Map<
  Document,
  { count: number; observer: MutationObserver }
>();
export function watchSyntaxDocument(document: Document) {
  let entry = documents.get(document);
  if (!entry) {
    const observer = new document.defaultView!.MutationObserver((records) => {
      // FlexLayout adopts mounted elements into another document without a
      // React remount. Live ranges are reset by that move, so recreate them.
      for (const record of records)
        for (const node of [...record.addedNodes, ...record.removedNodes]) {
          if (node.nodeType !== 1) continue;
          const element = node as Element;
          for (const candidate of [
            element,
            ...element.querySelectorAll(".syntax-code, .syntax-line"),
          ]) {
            const registration = registrations.get(candidate);
            if (
              registration &&
              registration.document !== candidate.ownerDocument
            )
              registration.migrate();
          }
        }
    });
    observer.observe(document, { childList: true, subtree: true });
    entry = { count: 0, observer };
    documents.set(document, entry);
  }
  entry.count++;
  return () => {
    if (--entry.count === 0) {
      entry.observer.disconnect();
      documents.delete(document);
    }
  };
}
// craigtrim/axiom#111: browser highlights colour one text run without splitting glyph advances.
export function paintSyntax(element: HTMLElement, tokens: SyntaxRange[]) {
  const added: [Highlight, Range][] = [];
  let release = () => {};
  const clear = () => {
    for (const [highlight, range] of added) highlight.delete(range);
    added.length = 0;
    release();
  };
  const registration = {
    document: element.ownerDocument,
    migrate() {
      clear();
      this.document = element.ownerDocument;
      const owner = this.document.defaultView as Window & typeof globalThis;
      const registry = owner.CSS.highlights,
        text = element.firstChild;
      release = watchSyntaxDocument(this.document);
      if (!text) return;
      for (const token of tokens) {
        const key = "axiom-" + token.kind;
        let highlight = registry.get(key);
        if (!highlight) registry.set(key, (highlight = new owner.Highlight()));
        const range = this.document.createRange();
        range.setStart(text, token.from);
        range.setEnd(text, token.to);
        highlight.add(range);
        added.push([highlight, range]);
      }
    },
  };
  registrations.set(element, registration);
  registration.migrate();
  return () => {
    clear();
    registrations.delete(element);
  };
}

export function paintEditorSyntax(host: HTMLElement) {
  const owner = host.ownerDocument.defaultView!;
  let overlay: HTMLDivElement | undefined,
    pending = 0;
  const painted: {
    element: HTMLDivElement;
    signature: string;
    clear: () => void;
  }[] = [];
  const update = () => {
    pending = 0;
    const lines = host.querySelector<HTMLElement>(".view-lines");
    if (!lines) return;
    if (overlay?.parentElement !== lines.parentElement) {
      for (const line of painted) line.clear();
      painted.length = 0;
      overlay?.remove();
      overlay = host.ownerDocument.createElement("div");
      overlay.className = "syntax-overlay";
      overlay.setAttribute("aria-hidden", "true");
      lines.parentElement!.append(overlay);
    }
    const font = owner.getComputedStyle(lines);
    overlay.style.cssText = lines.style.cssText;
    Object.assign(overlay.style, {
      fontFamily: font.fontFamily,
      fontSize: font.fontSize,
      fontWeight: font.fontWeight,
      fontStyle: font.fontStyle,
      fontStretch: font.fontStretch,
      fontVariantLigatures: font.fontVariantLigatures,
      fontKerning: font.fontKerning,
      lineHeight: font.lineHeight,
      letterSpacing: font.letterSpacing,
      fontFeatureSettings: font.fontFeatureSettings,
      fontVariationSettings: font.fontVariationSettings,
    });
    const palette = new Map<string, SyntaxKind>();
    const css = owner.getComputedStyle(host.ownerDocument.documentElement);
    for (const kind of syntaxKinds) {
      const hex = css
        .getPropertyValue("--syntax-" + kind)
        .trim()
        .slice(1);
      const rgb = [0, 2, 4].map((offset) =>
        parseInt(hex.slice(offset, offset + 2), 16),
      );
      palette.set(`rgb(${rgb.join(", ")})`, kind);
    }
    let index = 0;
    for (const line of lines.querySelectorAll<HTMLElement>(".view-line")) {
      const ranges: SyntaxRange[] = [];
      const walker = host.ownerDocument.createTreeWalker(
        line,
        NodeFilter.SHOW_TEXT,
      );
      let offset = 0,
        node: Node | null;
      while ((node = walker.nextNode())) {
        const length = node.textContent!.length;
        const kind = palette.get(
          owner.getComputedStyle(node.parentElement!).color,
        );
        if (kind) ranges.push({ from: offset, to: offset + length, kind });
        offset += length;
      }
      const signature =
        line.style.cssText +
        "\0" +
        line.textContent +
        "\0" +
        JSON.stringify(ranges);
      let row = painted[index++];
      if (!row) {
        const element = host.ownerDocument.createElement("div");
        element.className = "syntax-line";
        overlay.append(element);
        row = { element, signature: "", clear: () => {} };
        painted.push(row);
      }
      if (row.signature !== signature) {
        row.clear();
        row.element.style.cssText = line.style.cssText;
        row.element.textContent = line.textContent;
        row.signature = signature;
        row.clear = paintSyntax(row.element, ranges);
      }
    }
    for (const row of painted.splice(index)) {
      row.clear();
      row.element.remove();
    }
    host.classList.add("syntax-editor");
  };
  const schedule = () => {
    if (!pending) pending = owner.requestAnimationFrame(update);
  };
  const observer = new MutationObserver((records) => {
    if (
      records.some(
        (record) =>
          !overlay?.contains(record.target) &&
          !(
            record.type === "childList" &&
            record.addedNodes.length &&
            [...record.addedNodes].every((n) => n === overlay)
          ) &&
          !(record.target === host && record.attributeName === "class"),
      )
    )
      schedule();
  });
  observer.observe(host, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["style", "class"],
  });
  const theme = new MutationObserver(schedule);
  theme.observe(host.ownerDocument.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  schedule();
  return () => {
    observer.disconnect();
    theme.disconnect();
    owner.cancelAnimationFrame(pending);
    for (const row of painted) row.clear();
    overlay?.remove();
    host.classList.remove("syntax-editor");
  };
}
