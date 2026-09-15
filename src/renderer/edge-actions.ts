import { command, request, report, state } from "./client";
import type { EdgeDocument } from "../shared/protocol";
export function inspectEdge() {
  command("view.inspector");
  command("edge.focus");
}
export async function removeEdge(key: string) {
  try {
    const doc = await request<EdgeDocument>("edgeDocument", { key });
    if (!doc.statements.length) {
      report(doc.reason!, true);
      inspectEdge();
      return;
    }
    if (doc.statements.length > 1) {
      report(
        "Choose the statement graph in the edge inspector before removing this relationship.",
      );
      inspectEdge();
      return;
    }
    await request("editEdge", {
      key,
      original: doc.statements[0],
      datasetEpoch: doc.datasetEpoch,
      version: doc.version,
    });
  } catch (e) {
    report((e as Error).message, true);
  }
}
export function resetEdgeRoute(key: string) {
  return request("routeEdge", {
    key,
    bend: null,
    datasetEpoch: state!.datasetEpoch,
  }).catch((e) => report(e.message, true));
}
