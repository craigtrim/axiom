import { Worker } from "node:worker_threads";
import path from "node:path";
import type { Store } from "../domain/store";
import type { QueryResult } from "../domain/query";
import type {
  OntologyInfo,
  Triple,
  Entity,
  Individual,
  Customer,
} from "../domain/model";
export interface QueryDataset {
  ontology: OntologyInfo;
  tbox: Triple[];
  entities: Entity[];
  individuals: Individual[];
  customers: Customer[];
  version: number;
}
export class QueryRunner {
  private worker?: Worker;
  private key = "";
  constructor(
    private workerFile = path.join(__dirname, "query-worker.cjs"),
    private timeoutMs = 30000,
  ) {}
  async run(
    store: Store,
    epoch: number,
    text: string,
    signal: AbortSignal,
  ): Promise<QueryResult> {
    if (signal.aborted) throw Error("Query cancelled.");
    const worker = (this.worker ??= new Worker(this.workerFile));
    const key = epoch + ":" + store.version;
    const dataset: QueryDataset | undefined =
      this.key === key
        ? undefined
        : {
            ontology: store.ontology,
            tbox: store.tbox,
            entities: [...store.entities.values()],
            individuals: store.individuals,
            customers: store.customers,
            version: store.version,
          };
    return new Promise((resolve, reject) => {
      const finish = (error?: Error, result?: QueryResult) => {
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
        worker.off("message", message);
        worker.off("error", failed);
        worker.off("exit", exited);
        if (error) {
          if (this.worker === worker) {
            this.worker = undefined;
            this.key = "";
          }
          void worker.terminate();
          reject(error);
        } else {
          this.key = key;
          resolve(result!);
        }
      };
      const abort = () => finish(Error("Query cancelled."));
      const failed = (error: Error) => finish(error);
      const exited = (code: number) =>
        finish(Error("Query worker stopped (exit " + code + ")."));
      const message = (data: { error?: string; result?: QueryResult }) =>
        data.error ? finish(Error(data.error)) : finish(undefined, data.result);
      const timer = setTimeout(
        () =>
          finish(
            Error(
              "Query timed out after " +
                this.timeoutMs / 1000 +
                " seconds. Narrow the query or add a LIMIT.",
            ),
          ),
        this.timeoutMs,
      );
      signal.addEventListener("abort", abort, { once: true });
      worker.once("message", message);
      worker.once("error", failed);
      worker.once("exit", exited);
      worker.postMessage({ text, dataset, datasetKey: key });
    });
  }
}
