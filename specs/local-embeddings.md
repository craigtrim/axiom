# Local meaning similarity

Axiom uses `sentence-transformers/all-mpnet-base-v2` for semantic Find, Find Similar, and the synonym review's cosine distance column. Inference runs on the CPU in a separate worker using Transformers.js 4.3.0 and ONNX Runtime. Weights and output embeddings use full precision (FP32).

The model is installed separately on this machine. It is excluded from the installer, and the application does not download models or call an embedding API.

## Local setup

Run `npm run setup:embeddings` from the repository. The script downloads the compatible ONNX export from `Xenova/all-mpnet-base-v2` at revision `e086c5e0b3a57b0ce46dd6d9c0662948860b35f3`. It verifies every file against the pinned revision and checks the 435,826,547-byte FP32 weights against SHA-256 `a488b290590d86da3b81c502b242343ca8312e83cfc618b2cd1ae50c09d8f669`.

On Windows, the default location is `%LOCALAPPDATA%\Axiom\models\all-mpnet-base-v2-fp32`. Development and installed builds use the same location. `AXIOM_EMBEDDING_MODEL_DIR` can override it. Model distribution and a self-hosted download interface remain deferred.

## Scores and caching

Inputs are normalized to NFC, trimmed and lowercased. Punctuation and word order remain intact. The tokenizer truncates at 384 tokens; mean pooling respects the attention mask, and vectors are normalized before cosine comparison.

Find ranks the best matching selected field value by cosine similarity, descending, while retaining its existing facets, threshold, pagination and graph actions. Synonyms display cosine distance (`1 - similarity`), where lower values mean closer meaning. This column can be sorted independently. Levenshtein remains the initial sort, and semantic scores never disable synonym selection.

Vectors are cached in memory and under `%LOCALAPPDATA%\Axiom\embedding-cache`. Cache keys include the model revision, precision, preprocessing and runtime version. `AXIOM_EMBEDDING_CACHE_DIR` can override the cache location. The first search over a new ontology computes its selected field values; later searches reuse those vectors.

A missing model produces an explicit error for semantic search. Literal and prefix search still work. Synonym review and additions remain available when semantic scoring cannot run.

## Validation

Domain tests separate field selection and pagination from model inference. When the local model is installed, `tests/domain/mpnet.test.ts` exercises real FP32 inference, cache reuse and the difference between semantic and spelling similarity. Desktop tests cover semantic Find, graph results, synonym sorting, saved runs and detached panes.
