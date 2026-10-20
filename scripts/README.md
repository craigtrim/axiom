# Repository scripts

Run npm commands from the repository root. Build helpers also resolve the checkout
from their own location; keep that behavior if scripts are moved.

| Command or script | Purpose |
| --- | --- |
| `npm run build:exe` | Build the Windows package, run focused packaged checks and verify files |
| `npm run build` | Bundle the application into `dist` |
| `npm run package` | Build the application, notices and Windows installer |
| `npm run check:docs` | Check local documentation links |
| `npm test`, `npm run test:desktop` | Domain and desktop checks using the configurations in `config` |
| `npm run setup:mutatoc -- <folder>` | Verify and install the native runtime |
| `npm run setup:embeddings` | Download and verify the optional local search model |
| `npm run test:text-analysis` | Run native text-analysis domain checks |
| `npm run test:codex` | Explicitly opt into tests that invoke the installed assistant |
| `npm run test:search:catalog` | Write the search-query catalog under `artifacts/catalogs` |
| `npm run benchmark`, `npm run benchmark:desktop` | Domain and desktop benchmarks |
| `benchmark-text-analysis.ts`, `benchmark-text-editor.mjs`, `profile-graph.mjs` | Focused performance measurements |
| `build-icon.mjs`, `notices.mjs` | Generate the icon and dependency notices |
| `download-ontologies.mjs`, `generate-text-analysis-reference.py` | Maintain reference fixtures deliberately |
| `migrate-courses-intersections.mjs` | One-off ontology migration; inspect its arguments before use |

The local PowerShell launcher remains at the repository root and is ignored by Git.
Shared implementation lives in `build-exe.mjs`. See the
[repository layout](../docs/development/repository-layout.md) for output locations.
