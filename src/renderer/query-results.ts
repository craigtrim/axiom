import { command, request, state } from "./client";
import {
  changeQueryHistory,
  connectQueryHistory,
  historyState,
} from "./query-history";
import type { QueryResultDocument } from "../shared/query-history";

export const showQueryResults = (id: string) => command("query.results:" + id);
export async function openResultQuery(id: string) {
  await changeQueryHistory({ type: "open-run", resultId: id });
  command("view.query");
}
export async function graphQueryResults(result: QueryResultDocument) {
  await connectQueryHistory();
  if (
    result.run.session !== historyState().view?.session ||
    result.run.datasetEpoch !== state?.datasetEpoch
  )
    throw Error(
      "These results belong to an earlier dataset. Open the query and run it again.",
    );
  await request("queryGraph", {
    id: result.run.summary.id,
    key: result.queryId,
    epoch: result.run.datasetEpoch,
  });
  command("view.graph");
  command("graph.fit");
}
