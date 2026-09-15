# Third-party notices

Axiom uses Electron (MIT), React (MIT), FlexLayout (MIT), Monaco Editor (MIT), and AG Grid Community (MIT). It does not use AG Grid Enterprise.

The packaged application includes Chromium and Node.js through Electron. Their full notices are supplied beside the executable in LICENSE and LICENSES.chromium.html. JavaScript dependency licence comments are retained by the bundler.

RDF import and export use N3 (MIT), rdfxml-streaming-parser (MIT), and jsonld-streaming-parser (MIT). TIFF export uses UTIF (MIT). Filesystem metadata collection bundles the Windows ExifTool distribution and its portable Perl runtime; their original licence files are retained in the metadata helper directory and the generated third-party notices.

The published ontology regression corpus has its own [source manifest and attribution](tests/fixtures/ontologies/README.md).

The Pizza ontology fixture is derived from the University of Manchester and Stanford Pizza ontology. The original vocabulary and source attribution are recorded in specs and in the fixture data.

SPARQL execution uses Comunica, Traqula and their dependencies. Version-checked supplemental notices are documented in licenses/README.md and included in the generated third-party notice file. The vendored W3C SPARQL corpus retains its own licenses and source revision in tests/conformance/w3c/SOURCE.md.
