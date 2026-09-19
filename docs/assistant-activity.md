# Assistant activity in workbench panes

External assistant tasks show a fixed status strip above the pane's scrolling content. The strip identifies the assistant and task, shows elapsed seconds, and provides Cancel. Research and Query also show a spinner beside their tab titles. Reduced-motion settings stop the spinner animation; the task text remains visible.

| Task                                      | Owning pane | Launch control                                  |
| ----------------------------------------- | ----------- | ----------------------------------------------- |
| Ontology research                         | Research    | Run research, menu command or keyboard shortcut |
| SPARQL generation                         | Query       | Generate query / Generate again                 |
| Child-class or named-instance suggestions | Suggestions | Find children / Find instances, then New run    |

Suggestion status is confined to its Suggestions view, including elapsed time and Cancel. Hierarchy shows no duplicate status.

Closing the Suggestions view, Query composer, Research pane or Query pane allows the task to continue. Suggestions stores each run with its node and restores the latest run when that node is reopened. Reopening the pane restores its running indicator and cancellation control. Detached and compact panes use the same behavior.

Research retains the entity name captured at launch, even when selection changes. Input controls and repeated launch actions remain disabled during the request. Different assistant workflows may run independently.

## Lifecycle

A shared renderer store reserves each workflow synchronously before context preparation, history flushing or IPC. This reservation survives component unmounts. Repeated Research commands are discarded while work is active instead of being queued for later execution.

Cancel marks the request as cancelling and keeps its launch reserved until the pending request settles. A cancellation during preparation is checked before invoking the CLI. A failed cancellation keeps the task visible and allows another cancellation attempt. Completion and errors release the reservation.

The main process also rejects concurrent requests. Query's reservation includes reading its history baseline and delivering the generated query, in addition to the assistant service call. Background polling restores service activity independently of view visibility. Replies requested before a local launch or completion cannot overwrite the newer activity state.

## Verification

The store tests cover 100 repeated requests per workflow, stale polling, cancellation during preparation, retry, cancellation failure and independent jobs. Desktop tests launch controlled CLI processes and check repeated clicks, direct IPC retries, original entity attribution, closed and reopened panes, both taxonomy modes, cancellation, malformed output, detached pane sizes and reduced motion. The activity strip has a targeted axe scan.

These checks exercise subprocess management and the interface. They do not call the live Codex or Claude service.

## Research cache

Research stores successful, validated results under `research-runs/cache/<md5>.json` in Axiom's local user-data directory. The key is the MD5 hash of the exact UTF-8 prompt sent to the assistant, including instructions, output schema, ontology context and the web-research setting. Whitespace changes produce a different key. Internal dataset/session and version counters stay in the local request checks and are excluded from the prompt.

An identical prompt reuses the cached result before assistant discovery or launch. The cache persists across restarts and has no automatic expiry. Changing the selected assistant alone still reuses an identical prompt; the result retains its original provider and completion time. Research displays **Using cached research** with that attribution. Cached results remain accessible when the CLI is unavailable.

Cache hits use the current local context version for suggestion review, while retaining the original research timestamp. They receive a new response ID so the view updates its context and review state. Suggestions still require explicit acceptance and the existing validation at application time.

The stored prompt must match exactly as well as its MD5 key. Cache reads validate the file format and result structure. Missing, malformed or unreadable entries are treated as misses. Writes use a temporary file and rename. Failed or cancelled assistant responses are excluded. A cache-write failure preserves the result and displays a message that repeating the request may run the assistant again.
