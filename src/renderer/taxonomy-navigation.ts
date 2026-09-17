import { command } from "./client";
let pending: string | null = null;
export function revealInTaxonomy(iri: string) {
  pending = iri;
  command("taxonomy.reveal.open");
  command("taxonomy.reveal");
}
export function takeTaxonomyReveal() {
  const iri = pending;
  pending = null;
  return iri;
}
