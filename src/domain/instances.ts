import type { Store } from "./store";
import {
  INSTANCE_PAGE_SIZE,
  type InstancePage,
  type InstanceRow,
} from "../shared/instances";

export function instancePage(
  store: Store,
  iri: string,
  query = "",
  start = 0,
): InstancePage {
  const entity = typeof iri === "string" ? store.entities.get(iri) : undefined;
  if (!entity || !["Class", "Defined"].includes(entity.kind))
    throw Error("Choose an existing class to view its instances.");
  if (
    typeof query !== "string" ||
    query.length > 512 ||
    !Number.isInteger(start) ||
    start < 0 ||
    start > 1000000
  )
    throw Error("Invalid instance report filter or page.");
  const all = store.instanceIris(iri);
  const text = query.trim().toLocaleLowerCase();
  const matches = text
    ? all.filter((id) =>
        (store.label(id) + " " + id).toLocaleLowerCase().includes(text),
      )
    : all;
  const offset = Math.min(
    start,
    Math.max(
      0,
      Math.floor((matches.length - 1) / INSTANCE_PAGE_SIZE) *
        INSTANCE_PAGE_SIZE,
    ),
  );
  return {
    iri,
    label: store.label(iri),
    total: all.length,
    filtered: matches.length,
    start: offset,
    rows: matches
      .slice(offset, offset + INSTANCE_PAGE_SIZE)
      .map((id): InstanceRow => {
        const order = store.individualIndex.get(id);
        return {
          iri: id,
          label: store.label(id),
          classes: (store.resolve(id)?.types ?? []).map((t) => store.label(t)),
          ...(order
            ? {
                reference: order.reference,
                branch: order.branch,
                price: order.price,
                customer: store.customers[order.customerIndex]?.name,
              }
            : {}),
        };
      }),
  };
}
