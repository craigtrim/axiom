# Text Analysis validation

Issue #79 replaces the wrapping toolbar and standing help with a 28-pixel action row. Auto, the match count, Text and Summary, View in Graph, and More actions use the shared palette and controls from #81. Overflow measures the available space. Manual editing retains the last settled highlights; navigation analyzes outstanding edits before using a match. The editor remains mounted through presentation changes and recovery.

The implementation also fixes a click whose Monaco mouse-up hit test can report the end of the line after decorations repaint. Navigation uses the editor's committed caret position. Explicit waits announce their purpose, and expired notices do not replay when the view is reopened.

## Visual comparison

The pinned HTML has SHA-256 `9b03390692b0871189b2120186238921568079afe65ebf7e851aaa55d6542b04`. The desktop test compares the issue's sixteen states in both themes, plus two narrow editor states, for 36 comparisons. It uses the reference's fixture data for these images and the real Monaco editor. Native matching and navigation have separate coverage.

The fixture README records the issue's approved corrections and #81's stronger control borders. Twenty-six comparisons have no differing pixels beyond two channel values. Ten narrow comparisons differ by 21 or 24 pixels at wrapped highlight corners: Monaco rounds separate line fragments while the reference slices a continuous HTML mark. The test allows at most 24 differing pixels only in those captures, and rejects dimension changes. The reference bytes remain unchanged.

## Manual editing latency

Measurements were taken on October 17, 2026, using the development build, Electron 44.3.0 and the installed Mutatoc 0.5.2 runtime. The machine ran Windows 10.0.19045 on an AMD Ryzen Threadripper 3960X with 48 logical processors and 127.9 GiB RAM. Each workload used a separate profile and completed native analysis before Auto was turned off.

The benchmark samples 120 typed characters and 120 deletions. It measures from keydown to the second animation-frame callback, a conservative approximation of the next paint opportunity. The plain comparison is a separate Monaco editor in the same application with equivalent typography and wrapping. Graph motion is disabled. The measurements describe these workloads and do not measure physical display latency or an actively animating graph.

| Workload | Editor | Typing p50 / p95 / p99 / max (ms) | Deletion p50 / p95 / p99 / max (ms) |
| --- | --- | --- | --- |
| 10,000 characters, 50 concepts, 1,000 matches, 121 lines | Manual, retained highlights | 30.8 / 31.2 / 31.3 / 31.4 | 30.8 / 31.2 / 31.3 / 34.1 |
| Same small workload | Plain comparison | 30.9 / 31.2 / 31.4 / 31.8 | 30.9 / 31.2 / 31.3 / 32.8 |
| 98,000 characters, 2,000 concepts, 9,800 matches, 1,226 lines | Manual, retained highlights | 28.5 / 29.3 / 29.7 / 36.7 | 28.5 / 29.3 / 29.3 / 29.4 |
| Same large workload | Plain comparison | 28.7 / 29.3 / 29.6 / 37.3 | 28.7 / 29.4 / 29.5 / 29.6 |

Both workloads meet #73's retained acceptance limits: p95 at or below 50 ms and p99 at or below 100 ms for typing and deletion. Neither manual run recorded parser calls, hidden Summary mutations, or main-thread long tasks of at least 50 ms during the typing samples.

The single native-paste operations took 90.1 and 112.7 ms for the small and large manual workloads. Select-all took 59.2 and 98.3 ms. These values include Playwright round-trip overhead and are individual observations, not percentiles.

The reports and CPU profiles are retained under `C:\Users\Craig\AppData\Local\Temp\axiom-epic80\evidence-79\benchmark-small` and `benchmark-large`. Reproduce with `scripts/benchmark-text-editor.mjs`, setting `AXIOM_MUTATOC_HOME` to the installed runtime, `AXIOM_BENCH_SAMPLES=240`, and the concepts/characters variables to 50/10000 or 2000/98000. The benchmark uses native clipboard paste and restores the clipboard afterward.

## Functional verification

Build and type checking pass. The combined checkout, including the existing local commits, passes all 11,924 unit tests. The general unit suite skips 182 native cases without a runtime in the fresh worktree. The desktop suite explicitly supplies the installed native runtime.

The final combined desktop run passes all 96 scenarios in 5.1 minutes. Both visual tests pass, covering 36 reference comparisons with the bounded corner differences described above. Earlier source checks caught the moved-highlight hit-test problem and outdated assertions for the former controls; both were corrected before this run.

Coverage includes native matching, pending and stale results, cancellation, graph ancestry, Details reuse, manual typing, accessibility in both themes, keyboard and context-menu actions, overflow, recovery, Undo, presentation and restart persistence, detached windows, and Add entity authoring. Logs and desktop evidence are retained under `C:\Users\Craig\AppData\Local\Temp\axiom-epic80`.
