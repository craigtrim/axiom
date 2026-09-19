import { command, state } from "./client";
import { editEntity } from "./authoring";

interface TaxonomyReveal {
  iri: string;
  epoch: number;
  anchor?: HTMLElement;
}
let pending: TaxonomyReveal | null = null;
let ancestryTarget: { iri: string; epoch: number; document: Document } | null =
  null;

export function revealInTaxonomy(iri: string, anchor?: HTMLElement) {
  pending = { iri, epoch: state?.datasetEpoch ?? -1, anchor };
  // An ancestry click keeps the current arrangement and focus in Details.
  // The explicit graph action can open a hidden taxonomy pane.
  if (!anchor) command("taxonomy.reveal.open");
  command("taxonomy.reveal");
}
export function takeTaxonomyReveal() {
  const request = pending;
  pending = null;
  return request?.epoch === state?.datasetEpoch ? request : null;
}
export function navigateAncestry(iri: string, document: Document) {
  ancestryTarget = { iri, epoch: state?.datasetEpoch ?? -1, document };
  editEntity(iri);
}
export function revealAncestrySelection(iri: string, anchor: HTMLElement) {
  if (
    ancestryTarget?.iri !== iri ||
    ancestryTarget.epoch !== state?.datasetEpoch ||
    ancestryTarget.document !== anchor.ownerDocument
  )
    return;
  ancestryTarget = null;
  revealInTaxonomy(iri, anchor);
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
