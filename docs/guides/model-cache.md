# Model cache

Find Synonyms, Add Parents, Add Children and Find Instances reuse successful replies for the same entity, provider and exact prompt. Draft Add Parents requests also participate. Query generation and custom Define New actions remain uncached.

Each cache hit creates an ordinary new run-history record and passes through the normal parser and local validation. The review shows **Cached result**, its original completion date and the reported model, when available. **Run again** explicitly bypasses the cache. Changing providers causes a fresh call and replaces that entry. **Edit > Settings > Clear model cache** removes saved model replies.

Entries have no automatic expiry. Cache reads happen before provider discovery, so a valid saved reply can be reviewed when the CLI is unavailable. Applying suggestions still requires the normal explicit review and current ontology validation.

## Files and identity

Entries live in the user's home directory:

```text
~/.axiom/model/<purpose>/<MD5 of trimmed preferred label>/
  prompt.txt
  result.json or result.txt
  meta.json
```

The purposes are `find-synonyms`, `add-parents`, `add-children` and `find-instances`. Synonyms and parents use `result.json`; children and instances use `result.txt`. `prompt.txt` contains the exact prompt sent to the CLI. The result preserves the provider reply used by the existing parser.

Metadata records format version, purpose, label and its MD5, entity IRI, ontology IRI when available, namespace, provider, CLI path and version, model, prompt MD5, result filename and byte count, application version, call timestamps and measured duration. Provider-reported token usage, cost, duration and turn counts are retained when available. An unreported model remains null.

Matching labels do not authorize reuse across different entity IRIs or namespaces. Cache reads verify the exact prompt, provider and metadata identity, plus result length and hash. Prompt and result files are replaced atomically, and metadata is written last. Missing files, malformed metadata, mismatched contents and invalid parsed replies cause fresh calls. Failed, timed-out and cancelled calls do not produce reusable entries. Valid empty proposals do.

## Repeatable context

Sampling uses an entity-IRI seed derived from MD5. Canonical ordering keeps unchanged ontology context repeatable across runs and restarts. Lists over twenty retain the same sample for an unchanged entity. Context fingerprints detect changes outside the transmitted sample. Timestamps, run IDs and dataset counters remain outside prompts.

Tests override the cache root with `AXIOM_CACHE_HOME` and use fixture CLIs. The normal root is `~/.axiom`, independently of Electron's user-data directory. Tests cover all four purposes, draft requests, provider switches, explicit reruns, damaged and partial files, cancellation, empty results, old timestamps and stable context sampling.
