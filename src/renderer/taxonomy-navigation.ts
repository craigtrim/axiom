import {
  command,
  onCommand,
  state,
  selectionFromHierarchy,
  setSelectionOrigin,
} from "./client";

interface TaxonomyReveal {
  iri: string;
  epoch: number;
  anchor?: HTMLElement;
  details?: HTMLElement;
}
let pending: TaxonomyReveal | null = null;

export function revealInTaxonomy(
  iri: string,
  anchor?: HTMLElement,
  onlyOpen = false,
) {
  setSelectionOrigin();
  pending = { iri, epoch: state?.datasetEpoch ?? -1, anchor };
  // Explicit navigation can open a hidden taxonomy pane.
  if (!anchor)
    command(onlyOpen ? "taxonomy.reveal.existing" : "taxonomy.reveal.open");
  command("taxonomy.reveal");
}
export function revealInOpenTaxonomy(iri: string) {
  const entity = state?.entities.find((e) => e.iri === iri);
  if (
    !entity ||
    ![
      "Class",
      "Defined",
      "ObjectProperty",
      "DataProperty",
      "AnnotationProperty",
    ].includes(entity.kind)
  )
    return;
  revealInTaxonomy(iri, undefined, true);
}
export function clearTaxonomyReveal() {
  pending = null;
}
export function takeTaxonomyReveal() {
  const request = pending;
  pending = null;
  return request?.epoch === state?.datasetEpoch ? request : null;
}
/** Follow Details without opening, selecting, or focusing another pane. */
export function followDetailsInTaxonomy(iri: string, details: HTMLElement) {
  const entity = state?.entities.find((e) => e.iri === iri);
  if (
    !entity ||
    (!["Class", "Defined"].includes(entity.kind) &&
      !entity.kind.endsWith("Property"))
  )
    return;
  const epoch = state!.datasetEpoch;
  const win = details.ownerDocument.defaultView!;
  let frame = 0;
  let geometry = "";
  let previousAnchor: HTMLElement | undefined;
  const reveal = () => {
    if (
      state?.datasetEpoch !== epoch ||
      state.selected !== iri ||
      state.graph.selectedEdge ||
      selectionFromHierarchy ||
      !details.isConnected
    )
      return;
    if (!details.checkVisibility({ visibilityProperty: true })) {
      geometry = "";
      return;
    }
    const anchor =
      details.querySelector<HTMLElement>(".ancestry-current") ?? details;
    const paneBounds = details.getBoundingClientRect();
    const anchorBounds = anchor.getBoundingClientRect();
    const next = [
      paneBounds.x,
      paneBounds.y,
      paneBounds.width,
      paneBounds.height,
      anchorBounds.x,
      anchorBounds.y,
      anchorBounds.width,
      anchorBounds.height,
    ].join(",");
    if (geometry === next && previousAnchor === anchor) return;
    geometry = next;
    previousAnchor = anchor;
    pending = { iri, epoch, anchor, details };
    command("taxonomy.reveal");
  };
  const schedule = () => {
    win.cancelAnimationFrame(frame);
    frame = win.requestAnimationFrame(() => {
      frame = win.requestAnimationFrame(reveal);
    });
  };
  const resize = new win.ResizeObserver(schedule);
  resize.observe(details);
  // Entity documents and ancestry load after the selection itself changes.
  const content = new win.MutationObserver(schedule);
  content.observe(details, {
    childList: true,
    subtree: true,
    attributes: true,
  });
  const off = onCommand((id) => {
    if (id === "taxonomy.follow" || id === "selection.follow") geometry = "";
    if (
      id === "taxonomy.follow" ||
      id === "taxonomy.layout" ||
      id === "selection.follow"
    )
      schedule();
  });
  const focus = (event: FocusEvent) => {
    if (details.contains(event.relatedTarget as Node | null)) return;
    geometry = "";
    schedule();
  };
  const interact = () => {
    setSelectionOrigin();
    geometry = "";
    schedule();
  };
  details.addEventListener("pointerdown", interact, true);
  details.addEventListener("focusin", focus);
  details.addEventListener("scroll", schedule, true);
  schedule();
  return () => {
    off();
    resize.disconnect();
    content.disconnect();
    details.removeEventListener("pointerdown", interact, true);
    details.removeEventListener("focusin", focus);
    details.removeEventListener("scroll", schedule, true);
    win.cancelAnimationFrame(frame);
    if (pending?.details === details) pending = null;
  };
}

/** Scroll only the taxonomy, using rendered coordinates to respect pane zoom. */
export function alignTaxonomyRow(
  tree: HTMLElement,
  row: HTMLElement,
  anchor?: HTMLElement,
) {
  const viewport = tree.getBoundingClientRect();
  const bounds = row.getBoundingClientRect();
  if (!tree.clientHeight || !viewport.height || !bounds.height) return false;
  const scale = viewport.height / tree.offsetHeight;
  const top = viewport.top + tree.clientTop * scale;
  const bottom = top + tree.clientHeight * scale;
  let target = (top + bottom) / 2;
  if (
    anchor?.isConnected &&
    anchor.ownerDocument === tree.ownerDocument &&
    anchor.checkVisibility()
  ) {
    const card = anchor.getBoundingClientRect();
    const center = card.top + card.height / 2;
    // A stacked pane or a scrolled-away card cannot share a visible horizontal
    // line with this tree. Center within the tree in that case.
    if (
      card.height &&
      center >= top + bounds.height / 2 &&
      center <= bottom - bounds.height / 2
    )
      target = center;
  }
  // offsetHeight rounds to whole CSS pixels. Correct once using the rendered
  // row position so that rounding cannot accumulate over a long, zoomed list.
  for (let pass = 0; pass < 2; pass++) {
    const current = row.getBoundingClientRect();
    const delta = current.top + current.height / 2 - target;
    if (Math.abs(delta) < 0.5) break;
    tree.scrollTop = Math.max(
      0,
      Math.min(
        tree.scrollHeight - tree.clientHeight,
        tree.scrollTop + delta / scale,
      ),
    );
  }
  return true;
}
