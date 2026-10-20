# Utility view reference

Issue #94 supplies the reference for Source, Filesystem provenance, Suggestion runs, Error log and Tab history. The HTML is pinned unchanged at 74,359 bytes with SHA-256 `24ce03774c0951988db376e208360c327798ac03a636360689d94a924e09a7c7`. Its `.gitattributes` entry prevents newline conversion.

`utility-visual.spec.ts` compares all 43 published states in light and dark. It launches the real Electron application, imports the reference ontology and supplies recorded provenance, batch and audit inputs through the native IPC boundary. Source editing, parsing, selection, recovery, menus, copying and history settings still use the application controls. The adjacent behavior suites exercise the real services and persistence.

The oracle renders the pinned page with the corrections recorded in the issue. It uses the 120 second timeout, actual observation counts, current selection and parser message. A queued batch exposes Cancel the batch. The All tabs state includes tabs saved by changing the shared preference. History keeps the application's documented sort order. Stale drafts disable conversion, unavailable menu commands remain disabled, and records without process diagnostics omit those sections.

The rendered reference governs the measurements where its prose differs: number fields are 82.5 pixels wide, their inline hints inherit 13 pixel text, and the history filter is 115.5 pixels wide. Results values align right while their heading aligns left. Source keeps Monaco and uses a native horizontal scrollbar synchronized with its viewport. Its plain palette is scoped so other Monaco editors retain their own styling.

Source's focus surface uses an opaque backdrop below the editor in dark mode. Light mode keeps the editor text surface opaque and draws the focus border above it. This avoids Chromium's different rounding of the dark inset shadow and transparent text layers. Both modes use the shared ground and focus tokens and retain Monaco's selection highlighting.

The reference and application are captured at identical coordinates in the same native renderer at device scale 2, with reduced motion and matching paint boundaries for controls and clipped glyphs. The tests require equal dimensions and zero differing raw bitmap pixels. They use no masks, perceptual thresholds or color tolerance. The generated PNGs, per-frame counts and computed geometry are saved under `artifacts/issue-94`.

From a built checkout:

```powershell
npm run test:desktop -- tests/e2e/utility-visual.spec.ts tests/e2e/utility-reference.spec.ts
```
