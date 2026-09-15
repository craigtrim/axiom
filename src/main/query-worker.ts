import { parentPort } from "node:worker_threads";
import { Store } from "../domain/store";
import { evaluateQuery, queryStore } from "../domain/query";
import type { QueryDataset } from "./query-runner";
let cached: ReturnType<typeof queryStore> | undefined;
let key = "";
parentPort!.on(
  "message",
  async ({
    text,
    dataset,
    datasetKey,
  }: {
    text: string;
    dataset?: QueryDataset;
    datasetKey: string;
  }) => {
    try {
      const started = performance.now();
      if (dataset) {
        const source = new Store();
        source.ontology = dataset.ontology;
        source.tbox = dataset.tbox;
        source.entities = new Map(dataset.entities.map((e) => [e.iri, e]));
        source.rebuildSchema();
        source.individuals = dataset.individuals;
        source.customers = dataset.customers;
        source.indexGenerated();
        source.version = dataset.version;
        cached = queryStore(source.scan());
        key = datasetKey;
      }
      if (!cached || key !== datasetKey)
        throw Error("Query dataset is unavailable.");
      const result = await evaluateQuery(
        cached,
        text,
        Number(datasetKey.split(":").at(-1)),
      );
      result.milliseconds = performance.now() - started;
      parentPort!.postMessage({ result });
    } catch (error) {
      parentPort!.postMessage({ error: (error as Error).message });
    }
  },
);
