import { command, request, state } from "./client";
import {
  changeQueryHistory,
  connectQueryHistory,
  historyState,
} from "./query-history";
import type { QueryResultDocument } from "../shared/query-history";
import type { QueryRunRecord } from "../shared/query-history";
import type { QueryGridInfo, QueryGridSort } from "../shared/query-grid";
import { queryResultId } from "../shared/query-history";

// craigtrim/axiom#88: the Query copy action uses its result tab's current presentation.
export interface QueryResultLayout {
  shown: number[];
  sort?: QueryGridSort;
}
const layouts = new Map<string, QueryResultLayout>();
export const queryResultLayout = (id: string) => layouts.get(id);
export function rememberQueryResultLayout(
  id: string,
  layout: QueryResultLayout,
) {
  layouts.delete(id);
  layouts.set(id, layout);
  if (layouts.size > 32) layouts.delete(layouts.keys().next().value!);
}
export async function copyQueryResults(run: QueryRunRecord, queryId: string) {
  await connectQueryHistory();
  if (
    run.session !== historyState().view?.session ||
    run.datasetEpoch !== state?.datasetEpoch
  )
    throw Error(
      "These results are no longer retained. Open the query and run it again.",
    );
  const identity = {
    id: run.summary.id,
    key: run.queryKey ?? queryId,
    epoch: run.datasetEpoch,
  };
  const info = await request<QueryGridInfo>("queryColumns", identity);
  if (!info.retained || !run.summary.rowCount)
    throw Error(
      "These results are no longer retained. Open the query and run it again.",
    );
  const layout = layouts.get(queryResultId(run));
  const shown =
    layout?.shown ??
    info.columns
      .filter((column) => column.fill > 0)
      .map((column) => column.index);
  await window.axiom.copyQueryCsv({
    ...identity,
    shown: shown.length ? shown : [0],
    sort: layout?.sort,
  });
  return { rows: run.summary.rowCount, columns: shown.length || 1 };
}

export const showQueryResults = (id: string) => command("query.results:" + id);
export async function openResultQuery(id: string) {
  await changeQueryHistory({ type: "open-run", resultId: id });
  command("view.query");
  command("query.focus");
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
    key: result.run.queryKey ?? result.queryId,
    epoch: result.run.datasetEpoch,
  });
  command("view.graph");
  command("graph.fit");
}
