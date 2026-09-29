import path from "node:path";
import os from "node:os";

const root = path.join(
  process.env.LOCALAPPDATA || path.join(os.homedir(), ".local", "share"),
  "Axiom",
);
export const embeddingModelDirectory = () =>
  process.env.AXIOM_EMBEDDING_MODEL_DIR ||
  path.join(root, "models", "all-mpnet-base-v2-fp32");
export const embeddingCacheDirectory = () =>
  process.env.AXIOM_EMBEDDING_CACHE_DIR || path.join(root, "embedding-cache");
