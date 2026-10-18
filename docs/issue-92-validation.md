# Touchpoints reference validation

Issue #92 moves Touchpoints onto the shared action row, footer, menu, toast and recovery rules. Each subject retains its own query and choices. Opening a pane reads its saved result without fetching; Search reuses that result, while Refresh requests a replacement.

## Evidence

All 46 raw bitmap comparisons pass with zero differing pixels. The 23 frames in each theme cover saved and missing results, selected controls, requests, refresh failures, duplicate and stale refusals, successful application, individual relationships, unavailable ranking, menus, narrow and shallow panes, recovery and keyboard focus. The pinned reference is unchanged; its hash and the recorded corrections are documented in `tests/fixtures/touchpoints-visual/README.md`.

All 13 Touchpoints behavior scenarios pass. They exercise the real domain worker and recorded Wikipedia responses, including cache-only opening, scoped and global cache clearing, no request while typing, retained choices after a failed refresh, exact duplicate refusal, two separately undoable batches, stale results, rapid clicks, pending requests across tabs, disambiguation, absent Wikidata, empty results and entirely linked results. Keyboard navigation and accessibility pass, including the shared recovery view. Geometry assertions check the 28-pixel action row and its 74.4-pixel wrapped form.

Four neighboring workflows pass: opening Touchpoints from Hierarchy and Graph, the graph action menu, and detached-pane keyboard recovery with accessibility scans. The latter caught an empty list advertised without list items; empty and pending results now use a named group. Hierarchy's older test reveals its filter through More actions before filling it.

TypeScript and the production build pass. The complete unit suite passes 11,971 tests, with 182 optional tests skipped. The unit coverage includes saved reads, scoped clearing during an outstanding request, ranking, atomic duplicate rejection, retained response tokens and generated-title migration.

The service retains its result token after Apply and captures the exact resulting ontology version within the worker mutation. A later outside edit still makes another Apply stale. Resource statements and `xsd:anyURI` literals remain distinguishable: both mark a candidate Linked, but only an identical resource statement rejects a new resource statement. The whole batch is validated before any write.

## Compatibility

The cache format is unchanged. Per-subject clear checks its resolved directory and prevents an earlier request from recreating a removed entry. Generated saved tab titles migrate from the middle dot to a comma; user-provided names remain unchanged. No data migration or deployment is required.

The obsolete Touchpoints exhibit is removed from the Individuals visual suite. Touchpoints now has its own pinned reference and comparison suite; the remaining Individuals exhibits stay intact.

## Reproduction

Run `npm run typecheck`, `npm test` and `npm run build`. Then run the two commands in the fixture README. Native suites run sequentially. A local MPNet installation is required for the ranked reference frames; tests make no paid model calls or live Wikipedia requests.

For a manual check, select a class and open Find touchpoints. Search, select two candidates, change one relationship to `rdfs:seeAlso`, and apply. Undo removes both statements. Search again, select a candidate, then change the ontology elsewhere: Apply should explain that the result is stale and retain the selection. Narrow the pane to inspect wrapping and recovery, then clear this subject's saved result through More actions.
