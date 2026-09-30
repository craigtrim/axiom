import {
  command,
  onCommand,
  state,
  selectionFromHierarchy,
  selectionRevision,
  setSelectionOrigin,
} from "./client";

interface TaxonomyReveal {
  iri: string;
  epoch: number;
  revision: number;
  anchor?: HTMLElement;
  details?: HTMLElement;
}
let pending: TaxonomyReveal | null = null;
// Keep completion across Details remounts caused by docking or detaching.
let completed: Pick<TaxonomyReveal, "iri" | "epoch" | "revision"> | null = null;

export function currentTaxonomyReveal(request: TaxonomyReveal) {
  return (
    request.epoch === state?.datasetEpoch &&
    request.revision === selectionRevision &&
    request.iri === state?.selected &&
    !state?.graph.selectedEdge
  );
}
export function completeTaxonomyReveal(request: TaxonomyReveal) {
  if (!currentTaxonomyReveal(request)) return;
  const { iri, epoch, revision } = request;
  completed = { iri, epoch, revision };
  command("taxonomy.revealed");
}

export function revealInTaxonomy(
  iri: string,
  anchor?: HTMLElement,
  onlyOpen = false,
) {
  setSelectionOrigin();
  pending = {
    iri,
    epoch: state?.datasetEpoch ?? -1,
    revision: selectionRevision,
    anchor,
  };
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
  return request && currentTaxonomyReveal(request) ? request : null;
}
/** Reveal each Details selection once without opening or focusing another pane. */
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
  const done = () =>
    completed?.iri === iri &&
    completed.epoch === epoch &&
    completed.revision === selectionRevision;
  const reveal = () => {
    if (
      done() ||
      state?.datasetEpoch !== epoch ||
      state.selected !== iri ||
      state.graph.selectedEdge ||
      selectionFromHierarchy ||
      !details.isConnected
    )
      return;
    if (!details.checkVisibility({ visibilityProperty: true })) return;
    const editor = details.querySelector<HTMLElement>("[data-entity-iri]");
    if (editor?.dataset.entityIri !== iri) return;
    const anchor = editor.querySelector<HTMLElement>(".ancestry-current");
    // Class documents load asynchronously. Wait for this selection's card
    // instead of completing the reveal against the temporary loading panel.
    if (!anchor && ["Class", "Defined"].includes(entity.kind)) return;
    pending = {
      iri,
      epoch,
      revision: selectionRevision,
      anchor: anchor ?? details,
      details,
    };
    command("taxonomy.reveal");
  };
  const schedule = () => {
    if (done() || selectionFromHierarchy) return;
    win.cancelAnimationFrame(frame);
    frame = win.requestAnimationFrame(() => {
      frame = win.requestAnimationFrame(reveal);
    });
  };
  const resize = new win.ResizeObserver(schedule);
  // Entity documents and ancestry load after the selection itself changes.
  const content = new win.MutationObserver(schedule);
  const stop = () => {
    resize.disconnect();
    content.disconnect();
    win.cancelAnimationFrame(frame);
    if (pending?.details === details) pending = null;
  };
  const start = () => {
    if (done() || selectionFromHierarchy) return;
    resize.observe(details);
    content.observe(details, {
      childList: true,
      subtree: true,
      attributes: true,
    });
    schedule();
  };
  const off = onCommand((id) => {
    if (id === "taxonomy.revealed" && done()) stop();
    if (id === "selection.follow") start();
    if (id === "taxonomy.follow" || id === "taxonomy.layout") schedule();
  });
  start();
  return () => {
    off();
    stop();
  };
}

/** Scroll only the taxonomy, using rendered coordinates to respect pane zoom. */
export function alignTaxonomyRow(
  tree: HTMLElement,
  row: HTMLElement,
  anchor?: HTMLElement,
) {
  if (!tree.checkVisibility({ visibilityProperty: true })) return false;
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
