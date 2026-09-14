# Axiom authoring, export and filesystem provenance

Research date: 13 September 2026. Scope: the Electron application, graph and taxonomy authoring, document export, RDF interoperability, and evidence-based filesystem provenance. Implementation and test results are tracked in [verification](../../docs/verification.md).

## Decision

Keep the graph as a diagram surface, the taxonomy as the primary place to create classes, and a document tab as the place to edit an entity completely. Use a single Export dialog with controls appropriate to the selected output. Accept human-readable labels without imposing identifier syntax on them.

The closest Microsoft precedents are Visio and Visual Studio Class Designer. Microsoft Graph is a service API; it is not a desktop diagram editor. Neither Electron nor a docking library supplies the complete authoring behavior discussed here. The relevant conventions must be implemented in Axiom.

## What the Microsoft products establish

| Product or guidance | Documented interaction | Application to Axiom |
| --- | --- | --- |
| Visio shapes | Select shapes, move them by dragging, and edit their text directly. | Selection, movement, and label editing belong on the diagram. |
| Visual Studio Class Designer | Add types from the toolbox to a class diagram; edit details through the associated detail and property surfaces. | Keep quick creation small, then open a full entity document for detailed work. |
| Visual Studio diagram integration | Bring existing types into a diagram from the project; diagram presentation and code are separate concerns. | Adding an entity to the visible graph must not duplicate its ontology definition. |
| Visio Shape Data | A context command opens a task pane containing properties of the selected shape. | Offer Edit details in entity context menus and the inspector. |
| Microsoft dialog guidance | A modal interrupts interaction with the underlying application until its task is resolved. | Use a modal for an export transaction, not routine taxonomy creation or renaming. |

These are documented precedents, not a claim that Axiom can copy every operation verbatim. Visio shapes and C# types have different semantics from RDF classes and individuals. In particular, the reviewed Microsoft material does not establish blank-canvas double-click as a universal creation convention. Axiom adopts it as an additional shortcut, with visible Add entity and context-menu commands for discoverability. [Visio shape basics](https://support.microsoft.com/en-US/Visio/shape-basics-resize-format-move-and-add-text-to-shapes), [Class Designer creation](https://learn.microsoft.com/en-us/visualstudio/ide/class-designer/how-to-create-types?view=visualstudio), [class diagrams](https://learn.microsoft.com/en-us/visualstudio/ide/class-designer/designing-and-viewing-classes-and-types?view=vs-2022), [Shape Data](https://support.microsoft.com/en-us/visio/add-data-to-visio-shapes), [dialogs](https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/dialogs-and-flyouts/dialogs).

## Authoring behavior

The taxonomy's New class command inserts an editing row beneath the selected class. The user enters a label, confirms with Enter or Create, and remains in context. Escape cancels. The same approach supports property creation. An instance has an explicit class choice; it must not silently acquire the wrong type because another pane last held focus.

On the graph, a blank-space double-click or Add entity opens an anchored creation form. A context menu offers class or instance creation at that position. A created entity is added to the ontology and admitted to the graph under the existing node-budget policy. Its placement is retained. A full graph does not justify silently exceeding the configured budget.

A double-click on an existing node edits its label. Expansion remains available as an explicit command and through the keyboard. In the taxonomy, double-click retains its established expand/collapse behavior. These surfaces have different jobs, so their double-click targets should be explicit in help.

Edit details opens a document tab beside Graph. The inspector offers the same action. Dropping a taxonomy entity into the inspector opens that document. The entity tab exposes the label, IRI, comment and all outgoing RDF statements, including annotations, class relationships, property characteristics, instance values, language tags, datatypes and named graphs. Resource-valued statements can lead to another entity document. A paged statement list keeps a large entity usable without dropping statements.

Editing should be transactional at the entity level. Apply changes commits the entity together. Workspace Save also handles retained drafts. Closing or moving a pane must not quietly lose an unapplied draft. If the underlying entity changed while it was being edited, Axiom must detect the conflict instead of overwriting newer assertions.

Forms should use persistent labels, readable grouping and responsive layouts. Do not replace field names with placeholders or compress a full ontology editor into a creation popover. This applies Microsoft's form guidance to Axiom's data model. [Microsoft forms guidance](https://learn.microsoft.com/en-us/windows/apps/design/controls/forms).

## Labels and identifiers

RDFS defines `rdfs:label` as a human-readable name. It is not an identifier validator. RDF IRIs identify resources; literal values carry text, optional language tags and datatypes. RDF does not require class IRIs to use CamelCase either. Axiom may generate CamelCase identifiers as its own default, but the user must not have to type one to name an entity. [RDF Schema](https://www.w3.org/TR/rdf-schema/), [RDF concepts](https://www.w3.org/TR/rdf11-concepts/).

Entering **Course Credit** therefore creates a label with that text and generates an available local identifier such as `CourseCredit`. A collision gets a separate identifier; two resources may legitimately share a label. Unicode, spaces and punctuation belong in human labels. Empty labels and control characters remain appropriate creation validation failures.

Rename changes the label and preserves the IRI. Changing the IRI is a distinct operation in the full editor, where incoming references can be updated together. Imported language-tagged labels must survive editing and serialization. A friendly display label must not replace the resource's identity in saved RDF.

## Export research and decision

Visio's desktop export workflow separates choosing an output format from format-specific settings. It supports graphics and PDF; its shape-data reports are a separate structured-data capability. Axiom should preserve that distinction inside one clear dialog: **Diagram** or **Ontology report**. This is a synthesis for Axiom, not a claim that Visio's report formats or layout are identical. [Visio graphics export](https://support.microsoft.com/en-us/visio/save-a-visio-diagram-as-a-graphic-or-image-file), [shape-data reports](https://support.microsoft.com/en-us/visio/create-a-report-of-shape-data).

| Content | Formats | Relevant controls |
| --- | --- | --- |
| Diagram | PNG, JPEG, WebP, TIFF, BMP, SVG, PDF, clipboard | Area, background, title, legend, labels |
| Raster diagram | PNG, JPEG, WebP, TIFF, BMP, clipboard | Scale and resulting pixel dimensions; JPEG/WebP quality |
| Vector diagram | SVG | Vector geometry and text, no misleading raster scale |
| PDF | Diagram or report | Paper, orientation, margins, pagination |
| Structured report | HTML, Markdown, CSV, JSON | Scope and supported content sections |

PNG is the useful general default. SVG is appropriate for scalable diagrams, JPEG for compatibility where transparency is unnecessary, WebP for smaller web images, TIFF/BMP for workflows requiring those formats, and PDF for distribution or printing. Format support is inexpensive relative to separate workflows, but it is not free: encoders, transparency rules, dimensions, valid file signatures and actual reopening must be verified.

The dialog previews the selected diagram and reports output dimensions. Controls appear only where meaningful. JPEG and BMP require an opaque background. Vector outputs must not offer a scale control pretending to change their resolution. Raster size limits should produce a clear error, never an undisclosed reduction from the user's chosen scale.

The three diagram areas are all admitted graph nodes, the current viewport, or a selected node with its displayed connections. “All displayed” refers to the graph's admitted set, not every entity in the ontology. Export must not bypass the graph cap or silently load thousands of unseen nodes.

A report can cover the displayed graph or the complete ontology. The complete report decomposes the data into classes, properties, individuals and other resources, with identifiers and asserted statements. Language and datatype distinctions remain visible. A PDF report may legitimately run to many pages. It needs page numbers and stable headings; a screenshot stretched onto one page does not meet that requirement.

Electron provides a PDF printing API with page, margin, tagged-PDF and outline options. That is a useful implementation primitive, not proof that a resulting document is fully accessible or publication-ready. Test the produced PDF, pagination and visual layout. [Electron webContents](https://www.electronjs.org/docs/latest/api/web-contents).

## Interoperability and the ontology corpus

Use established parsers for RDF/XML, Turtle, N-Triples, N-Quads, TriG and JSON-LD. A filename ending in .owl often contains RDF/XML; the suffix is not a separate data model. Keep blank nodes, literal datatypes, language tags and named graphs rather than reducing a document to the fields the graph happens to display. Reject an export into a format that cannot preserve a dataset's named graphs unless the user has explicitly chosen a transformation.

The implementation uses N3, rdfxml-streaming-parser and jsonld-streaming-parser. Their supported syntax does not make Axiom a full OWL reasoner or a complete SPARQL implementation. Remote JSON-LD contexts are rejected in this import workflow, and OWL imports are not fetched implicitly. Both behaviors must remain clear import errors or documented scope, not silent data loss. [N3](https://github.com/rdfjs/N3.js/), [RDF/XML parser](https://github.com/rdfjs/rdfxml-streaming-parser.js), [JSON-LD parser](https://github.com/rubensworks/jsonld-streaming-parser.js).

The checked-in corpus contains 29 published vocabularies: RDF, RDFS, OWL, PROV, SKOS, SKOS-XL, ORG, TIME, DCAT, SHACL, ODRL, SOSA, SSN, vCard, CSVW, LDP, ActivityStreams, OA, ADMS, DQV, DUV, EARL, SPARQL Service Description, DCTERMS, DC, FOAF, Schema.org, DOAP and GoodRelations. The manifest records retrieval URLs, dates, content types, byte counts and SHA-256 hashes. Actual upstream Turtle and RDF/XML documents provide the main import corpus; supplemental syntax tests exercise named graphs and JSON-LD explicitly. This avoids claiming that changing a suffix creates another format.

For every corpus member, the standard suite should import, inspect the graph under a bounded node budget, edit a label, create a class with spaces in its label, save a workspace, close it and reopen it. Domain tests additionally check RDF serialization and term preservation. A downloaded file alone is not evidence that the application supports it.

## Filesystem provenance: what can be known

PROV-O distinguishes entities, activities and agents. Generation, derivation and attribution have defined meanings. An account owning a file is not automatically its author; a creation timestamp is not a verified authoring event; equal hashes do not establish which file was copied from the other. Axiom must preserve those distinctions. [W3C PROV-O](https://www.w3.org/TR/prov-o/).

The directly observed activity is **this metadata collection**. Its start, end, selected root and options can be recorded as facts. Each file or directory is a PROV entity, and a directory can be a collection with observed members. Each metadata observation is an entity generated by the collection activity and derived from the observed file. Axiom is the software agent associated with the collection. These statements describe the operation Axiom actually performed.

Source timestamps, owner SIDs, author strings, downloaded-from fields, file IDs and signatures remain source evidence under a filesystem vocabulary. Original field names, values, types, errors and source families are retained. This permits later investigation without asserting an unsupported historical narrative. A raw USN record is evidence; interpreting an entire creation or editing workflow from it would need additional support.

Windows timestamps are mutable, and filesystems differ in timestamp behavior and precision. Collection can itself affect last-access observations. Capture before and after information and flag files that change during collection. A successful content hash represents the bytes read during that observation; it is not a guarantee of a globally atomic filesystem snapshot. [SetFileTime](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-setfiletime).

## Metadata coverage

The collector should enumerate exposed metadata, not maintain a short list of attractive Explorer columns.

| Source family | Evidence to retain |
| --- | --- |
| Native file records | Creation, write, access and change times with raw FILETIME values; attributes; logical and allocated sizes; link count; deletion state |
| Identity and location | File ID, volume identity, final path, native and normalized names, reparse tag and data |
| Storage | Sector information, alignment, compression, integrity information and filesystem capability flags |
| Streams and extended attributes | Enumerated stream names/sizes/allocation; alternate-stream hashes; Zone.Identifier where exposed; extended-attribute names and raw values |
| Windows property system | Every returned property key, canonical name where available, variant type and value, including vectors and binary values |
| Security | Owner and group SIDs, DACL rules and SDDL; SACL results or the actual access failure |
| Embedded content metadata | Document, image, audio and video metadata, unknown tags and embedded records where the reader supports them |
| Executable trust metadata | Version resources, Authenticode status and exposed signer/timestamp certificates |
| Collection integrity | SHA-256 where readable, before/after file state, source errors, timeouts, skipped content and completion status |

The Windows property system exposes a property store that can be enumerated through its count and keys. Native file-information classes expose other records and capabilities. Availability depends on filesystem, driver, file type, installed property handlers and account permissions. An unavailable value must remain distinguishable from an empty value or a source that was never read. [Shell property store](https://learn.microsoft.com/en-us/windows/win32/api/shobjidl_core/nf-shobjidl_core-shgetpropertystorefromparsingname), [property enumeration](https://learn.microsoft.com/en-us/windows/win32/api/propsys/nf-propsys-ipropertystore-getcount), [file-information classes](https://learn.microsoft.com/en-us/windows/win32/api/minwinbase/ne-minwinbase-file_info_by_handle_class), [GetFileInformationByHandleEx](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-getfileinformationbyhandleex).

Stream enumeration and security descriptors require their own APIs and access conditions. The collector attempts these sources and retains returned error codes instead of presenting a false “all metadata complete” badge. Reading an audit ACL may fail under an ordinary account. That failure is useful coverage evidence; changing the file's permissions to obtain more access would change the thing being observed. [Stream enumeration](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-findfirststreamw), [security information](https://learn.microsoft.com/en-us/windows/win32/api/aclapi/nf-aclapi-getnamedsecurityinfow).

ExifTool broadens coverage beyond Windows' installed property handlers. The Windows distribution is packaged as a helper, not a second user-facing application. Extraction requests grouped, duplicate, unknown and embedded tags; composite calculated tags are excluded. The exact reader arguments and diagnostics are retained with the evidence. This still does not guarantee support for every proprietary format or encrypted payload. [Vendored Windows ExifTool](https://github.com/photostructure/exiftool-vendored.exe), [ExifTool integration documentation](https://photostructure.github.io/exiftool-vendored.js/).

No application can truthfully promise to recover every historical fact from a filesystem. Deleted records may be gone; journals may be unavailable or rotated; cloud content may not be local; encryption and permissions may withhold data. The requirement is to look deeply, preserve everything the configured readers return, attempt relevant families and expose coverage limits. It is not permission to invent missing history.

## Collection workflow and limits

File > Create provenance from folder opens a dedicated pane. The native folder picker establishes the root. Collection runs in a background worker and can be cancelled. A running or cancelled collection does not replace the current ontology automatically.

The pane reports the current entry, observations, files, directories and coverage notes. Raw evidence JSON Lines, RDF and a summary are written together. Opening the completed result is an explicit action; partial results are labelled as partial. The normal workspace save/discard behavior protects an existing ontology.

Reparse entries are observed without walking their targets. This avoids cycles and unannounced traversal outside the selected root. Offline or recall-on-access content is an explicit option because reading it can download data. The default entry limit is zero, meaning all entries. A user-selected entry limit, cancellation or source timeout must appear in the resulting evidence.

Per-source timeouts and output-size limits are necessary to keep a malformed file or property handler from freezing the application. Their activation must be recorded, and must not be reported as complete coverage. The ontology import capacity and the graph node budget are separate constraints: a large raw evidence archive can exist even when the whole RDF result exceeds the current in-memory import limit.

## Tradeoffs and acceptance

The chosen workflow reduces interruption during routine authoring and keeps complex editing in a reusable pane. It adds draft management and conflict detection, which are more work than a modal. A common export dialog makes many formats discoverable, but requires conditional controls and genuine file validation. Broad metadata collection yields a larger and slower dataset than a shallow file listing; progress, cancellation and auditable coverage are part of the feature.

Acceptance requires natural-label creation and inline rename through actual desktop controls; entity-tab editing and retained drafts; valid output files for each offered format; multi-page report PDF; the 29-file ontology lifecycle corpus; native Windows metadata collection against a known fixture tree; source-content hashes unchanged by the operation; and save/reopen of the resulting PROV ontology. The final verification record should distinguish tests that ran from any checks blocked by the desktop environment.

## Additional native evidence

The implementation also enumerates hard-link names, short paths, encryption status, allocated ranges and retrieval pointers. It attempts existing USN journal access once per observed volume and retains only records matching observed file IDs. Journal records remain evidence fields rather than guessed user activities. On the development account, the journal query returned access denied; that result is recorded. Journal processing has a source timeout and a 512 MB read limit, while native allocation buffers report partial results explicitly.

Hard-link enumeration reports other names for a file, not a copy direction. Allocated ranges report storage regions that may contain data, not proof that every byte is nonzero. The USN query reports the existing journal's identity and bounds. [Hard-link enumeration](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-findfirstfilenamew), [allocated ranges](https://learn.microsoft.com/en-us/windows/win32/api/winioctl/ni-winioctl-fsctl_query_allocated_ranges), [USN journal query](https://learn.microsoft.com/en-us/windows/win32/api/winioctl/ni-winioctl-fsctl_query_usn_journal).
