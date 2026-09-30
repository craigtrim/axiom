import { parentPort } from "node:worker_threads";
import { MpnetEmbeddings } from "./mpnet";
import { EmbeddingEngine } from "./embedding-engine";
const embeddings = new MpnetEmbeddings();
const engine = new EmbeddingEngine((texts) => embeddings.embed(texts));
parentPort!.on("message", async ({ id, type, key, query, texts, consumer }) => {
  try {
    if (type === "reset") {
      engine.reset();
      return;
    }
    if (type === "cancel") {
      engine.cancel(consumer);
      return;
    }
    if (type === "release") {
      engine.release(key);
      return;
    }
    const value =
      type === "prepare"
        ? await engine.prepare(key, texts)
        : type === "search"
          ? await engine.search(key, query, consumer)
          : await engine.compare(query, texts);
    parentPort!.postMessage({ id, value });
  } catch (error) {
    parentPort!.postMessage({ id, error: (error as Error).message });
  }
});
