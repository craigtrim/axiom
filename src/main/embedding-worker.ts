import { parentPort } from "node:worker_threads";
import { MpnetEmbeddings } from "./mpnet";
const embeddings = new MpnetEmbeddings();
let queue = Promise.resolve();
parentPort!.on(
  "message",
  ({ id, query, texts }: { id: number; query: string; texts: string[] }) => {
    queue = queue.then(async () => {
      try {
        parentPort!.postMessage({
          id,
          scores: await embeddings.compare(query, texts),
        });
      } catch (error) {
        parentPort!.postMessage({ id, error: (error as Error).message });
      }
    });
  },
);
