# Source editing and linked files

Open **View > Source** (Ctrl+7), or choose **View source** in the Inspector. The Source pane shows the complete asserted RDF document, including filesystem metadata that previously filled the Inspector's Values section. **Find selected entity** locates the selected identifier in the current serialization. The editor supports line numbers, syntax coloring, search and normal clipboard commands. Ctrl+F searches the focused source editor. Undo and Redo edit the local text draft while its text history is available; after an applied draft is refreshed, they use the shared ontology history.

## One ontology across views

The graph, taxonomy, entity editors and Source pane edit the same ontology. Changes applied in another view refresh a clean Source pane. **Apply changes** parses and validates the complete source draft before changing the ontology. A successful apply is one Undo operation; Undo and Redo also refresh the other views.

Workspace Save and ontology Export apply retained source drafts, including a draft whose pane has been closed. Choosing another source format first applies a valid draft, then renders the resulting ontology in the selected format. Closing the pane does not discard its pending text.

Invalid text stays in the editor with an error and leaves the ontology unchanged. If another view changes the ontology while a source draft is pending, the draft is retained and cannot overwrite that newer version. Copy any edits you want to keep, then choose **Discard draft and reload** to work from the current ontology. Save and Export also stop if a pending draft cannot be applied.

Typing does not update the ontology on every keystroke. Apply, Save and format switching provide the validation boundary. Layout changes remain workbench state; moving a graph node does not invent an RDF statement.

## Formats

| Source format | Extension | Preserves named graphs |
| --- | --- | --- |
| Turtle | .ttl | No |
| RDF/XML, including OWL serialized as RDF/XML | .rdf, .owl | No |
| JSON-LD | .jsonld | Yes |
| N-Triples | .nt | No |
| N-Quads | .nq | Yes |
| TriG | .trig | Yes |

Documents containing named graphs open as TriG by default. Formats that cannot retain those graphs are disabled. Format conversion preserves RDF statements, including language tags, datatypes and blank-node relationships. It regenerates whitespace and prefix choices; it is not a byte-for-byte source-file editor. Source comments are not retained in the ontology or regenerated output.

OWL axioms represented in RDF remain available in these serializations. OWL/XML, Manchester and OWL Functional Syntax are not implemented. A .owl file containing Turtle is recognized when its content begins with a prefix or base declaration. File > Export ontology writes a separate ontology file; workspace Save writes the .axiom workspace.

## Filesystem entities

Selecting a file entity, or a metadata observation with an explicit filesystem `describes` link, shows its decoded local path and **Open file** / **Show in folder** actions. Opening delegates to the Windows default application. A missing or inaccessible resource produces an error in the Inspector.

Supported image extensions also offer **Show thumbnail**. Thumbnails are initially off, and the preference is remembered. Clicking a thumbnail opens the original image. **Refresh thumbnail** requests the current file again. Previewing never replaces the original image or updates captured provenance evidence; file contents and recorded metadata can have different ages.

The application creates previews on demand through Windows thumbnail support, requesting a 384 by 384 bounding box. Codec availability determines whether a particular image can be previewed. The in-memory cache holds at most 64 previews and 16 MiB of encoded preview strings. It shares concurrent requests for the same file, runs at most two thumbnail operations at once, and bounds the waiting queue at 32.

Each request checks file identity, length and modification/change timestamps. Changed files receive a new cache entry; old entries are evicted as needed. A file that changes during thumbnail creation produces an error instead of a cached result. Failures and previews exceeding the cache budget are not retained. An already displayed thumbnail is not watched continuously; use Refresh after an external edit.

## Verification

The domain tests exercise all six formats using RDF dataset canonicalization, source-to-ontology edits, Undo/Redo, invalid and stale drafts, concurrent mutation during parsing, empty documents, named-graph protection and filesystem link resolution. Cache tests cover request sharing, file-change invalidation, bounded concurrency and eviction, failed decodes and oversized results.

Desktop tests use temporary workspaces and a synthetic PNG. They cover editing in both directions, format switching, retained invalid/conflicting drafts, Save from a closed Source pane and reopening, native thumbnail creation, native Undo/Redo/Find, and file-open/folder-reveal dispatch. The shell actions are intercepted in tests so that no external application is launched. These checks establish dispatch behavior; they do not certify every Windows file association or image codec.
