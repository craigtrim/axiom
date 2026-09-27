# Entity editing validation

Validated on September 27, 2026.

| Check | Result |
| --- | --- |
| TypeScript and application build | Passed |
| Complete domain suite | 2,650 tests across 67 files passed |
| Details Source, Find and Text Analysis desktop journeys | 57 passed |
| Same journeys against the packaged executable | 57 passed |
| Packaged code and assets | All 46 build files match `dist` |
| Packaged native runtime | All 5,544 files match the mutatoc 0.2.1 manifest |

The new regressions reproduce typing Engineering in a parent row, repairing an imported literal parent, changing a populated text row into a parent, selecting Find results in a filtered or scrolled taxonomy, closed taxonomy behavior and detached taxonomy scrolling. Merge coverage includes simultaneous parent additions, independent comments, explicit contradictions, scoped Source edits, Undo and a replaced ontology. Unit tests also preserve typing during pending saves and identifier changes.

The executable is `D:\git\axiom\artifacts\installer-editing-fixes\win-unpacked\Axiom.exe`. The installer is `D:\git\axiom\artifacts\installer-editing-fixes\Axiom-Setup-1.0.0.exe`. Build metadata and SHA-256 checksums are recorded in `artifacts/editing-validation.json`.

The Text Analysis packaged journeys restrict PATH to Windows System32 and clear native runtime overrides. The bundled runtime remains unchanged. The full desktop suite was not rerun; the previously established broader Details and menu failures are recorded in [Text Analysis validation](text-analysis-validation.md). Remote CI was not run.
