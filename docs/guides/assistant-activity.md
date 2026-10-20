# Assistant activity in workbench panes

[Issue 88](https://github.com/craigtrim/axiom/issues/88) places Query's running row inside its Describe composer: Cancel generation, elapsed time to one decimal, and no estimate. Query has no additional assistant band; its shell tab retains the activity glyph. Suggestions keeps its task status in its own interface. Closing Query or Suggestions allows a running task to continue. Reopening the pane restores its status. Suggestions retains each run under its original entity.

The renderer reserves each workflow before preparing its context. Repeated clicks cannot launch duplicate requests. The main process also rejects overlapping calls within a service. Cancel keeps the reservation until the request settles, including cancellation during preparation. Failure releases the reservation and preserves its diagnostic in the owning service. Query cancellation waits for the main-process job to settle before reporting completion.

Query and taxonomy tasks can run independently. The shared provider choice defaults to Claude; Codex remains selectable. Discovery uses installed CLI commands and their existing sign-in. Query generation and custom Define New requests always run the provider. The four built-in suggestion actions use the [model cache](model-cache.md).

Find Touchpoints uses the [Wikipedia client](touchpoints.md), with its own shared request queue and explicit Search and Refresh controls.

Tests use controlled subprocesses and isolated cache directories. They cover repeated invocations, stale status polling, cancellation, failure, history retention and cache reuse without calling a live model service.
