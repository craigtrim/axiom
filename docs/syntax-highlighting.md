# Shared source highlighting

Issues #111 and #112 establish one syntax palette for source throughout Axiom. Source and Details support Turtle, TriG, N-Triples, N-Quads, RDF/XML and JSON-LD. Query uses SPARQL in the editor, both history views and the results context line. Authoring previews, Quality evidence, suggested relationships and inline terms use the same colours. Assistant prompts highlight their JSON portions while leaving prose in the normal text colour. Error Log process output remains plain text.

The light, dark and system palettes live in `styles.css`, beside `--mono`. The `--syntax-*` tokens belong to the shared layer. An individual view must not override them. The contrast test checks every syntax colour against the shared backgrounds used for code, including pending, invalid and stale draft backgrounds and the selection colour composited over each background.

## Adding a source display

Use `Code` inside the existing block or inline element and pass its language. It renders React text and applies CSS highlight ranges, so source cannot become HTML. It also preserves truncated strings and IRIs without extending their colour into surrounding controls. `CodeTextarea` keeps native selection, copying and scrolling for read-only prompts. Details retains its native editable textarea and paints the same text behind it.

Editors and static displays use the registered Monarch tokenizers. RDF formats share the Turtle grammar; RDF/XML uses Monaco's XML grammar; JSON and JSON-LD share the JSON grammar. SPARQL has its own grammar. `syntax-theme.ts` derives Monaco's themes from the CSS tokens. Text Analysis uses these themes too because changing Monaco's global theme can otherwise reset another editor's colours.

Chromium can round glyph advances differently when text is split into coloured spans. Source and Query therefore keep Monaco's editing and tokenization, but paint each visible line as one continuous text node. CSS highlight ranges change its foreground colour. The noninteractive layer preserves the editor's selection, caret, menus and native editing commands. Only visible lines receive paint nodes.

Detached panes need a highlight registry in their destination document. `watchSyntaxDocument` follows adopted source nodes and recreates their ranges. The main application and each popout install a watcher. Replacing text or unmounting a display releases its ranges; closing a document releases its watcher.

## Verification

`syntax-highlighting.spec.ts` checks shared colours, all Source and Details formats, contrast, exact glyph positions, detached Query, prompt JSON and truncated previews. The existing native suites check source editing, undo, invalid drafts, clipboard behavior, scroll alignment, detached Details and the smaller source surfaces. `syntax-components.spec.ts` covers the retained parent picker and its prompt.

Visual tests retain a coloured capture and normalize source foreground colours for comparison with the pinned one-ink references. They retain the original pixel tolerances and geometry checks. Palette assertions run before normalization. The reference files remain unchanged.

Query pixel comparisons disable partial raster and wait for all compositor stages before drawing. This prevents stale edge coverage after source recolouring; it does not alter the controls, reference files or comparison tolerances. These switches apply only to pixel comparisons. Behavioural and performance checks use the normal renderer. Chromium documents the rendering switches in its [automation flag reference](https://github.com/GoogleChrome/chrome-launcher/blob/main/docs/chrome-flags-for-tools.md#rendering--gpu).

Run native suites serially. For the desktop timing comparison, set `AXIOM_SYNTAX_PERFORMANCE=1` and run `npx playwright test tests/e2e/syntax-large-source.spec.ts`. It uses 28,042 lines and 1,180,150 characters, inserts text at the start, undoes it and scrolls to the end. It records input-to-paint timings and checks that the paint layer remains limited to the viewport. Run the same fixture on the plain-editor revision with `AXIOM_SYNTAX_BASELINE=1` when comparing performance. The timing test is opt-in because its measurements depend on the host.
