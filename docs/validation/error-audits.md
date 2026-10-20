# Error logs

Axiom keeps an error log for failed assistant requests and failed desktop operations. Choose **Error details** beside an error, or open **View > Error log**. The log view opens only when requested and can be docked or detached like other workbench views.

Entries identify the operation, outcome, failing stage and local completion time. Open a header to read its timeline and diagnostics in place; opening another closes the first. Nothing opens automatically. Assistant failures also retain the prompt, assistant response, bounded process stdout and stderr, exit code, executable and arguments. These sections are collapsed until opened. **Copy report** copies the displayed diagnostic record; **Show log file** reveals its JSON file in Explorer. File locations are absolute paths.

Logs are saved in Axiom's local user-data directory under `error-logs`. Retrying a request does not overwrite its previous error. Failed Suggestions runs and batch targets retain references to their own logs, including after restarting Axiom. Successful operations do not create error records. Cancelled requests are identified separately from other failures.

Recognized credentials, including bearer tokens, API keys and named password/token fields, are redacted before records are written, displayed or copied. Environment variables are not recorded. Diagnostic text fields retain at most 262,144 characters; stderr retains its last 8,000 characters. Section headers show original and retained lengths when truncated. An open section previews 1,400 characters and states how much more is retained; Copy report includes the whole retained text. Reports include the prompt and ontology context that were sent, so copying a report includes that content.

A log-write failure does not replace the original operation error. The record remains available in memory for copying, and the view identifies that it could not be saved. Individual unreadable log files do not hide other entries.

Older versions deleted temporary assistant output after each request. Their raw responses cannot be reconstructed from the generic error message. When only a displayed interface error is available, Error details records that message and identifies the lack of assistant output.

## Taxonomy proposal errors

A failed taxonomy proposal now identifies missing fields, unexpected outline lines, duplicate fields, an empty reply, or reply-size violations. Axiom retains the rejected response for inspection and does not apply any of its suggestions. The accepted outline format and ontology validation rules are unchanged.
