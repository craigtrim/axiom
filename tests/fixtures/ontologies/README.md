# Published ontology regression corpus

These 29 files are copies of published vocabularies used as interoperability test inputs. The source documents retain their original embedded notices and licence statements; this repository does not relicense them. The manifest records the requested and resolved URL, retrieval date, media type, byte count and SHA-256 hash for each copy.

Run npm test for import, RDF-term preservation, bounded graph admission, editing and workspace serialization. The standard Playwright suite also opens every source in Electron, edits a label, creates Course Credit, saves, closes and reopens its workspace. Supplemental tests cover TriG, N-Quads and JSON-LD explicitly.

Refresh only intentionally with node scripts/download-ontologies.mjs and review source and hash changes. Tests use these local copies and require no publisher network connection.

| Vocabulary | Retrieved file | Publisher source |
| --- | --- | --- |
| ActivityStreams | [activitystreams.ttl](activitystreams.ttl) | [Source](https://www.w3.org/ns/activitystreams-owl) |
| ADMS | [adms.ttl](adms.ttl) | [Source](https://uri.semic.eu/w3c/ns/adms.ttl) |
| CSV on the Web | [csvw.ttl](csvw.ttl) | [Source](https://www.w3.org/ns/csvw.ttl) |
| Dublin Core Elements | [dc.ttl](dc.ttl) | [Source](https://www.dublincore.org/specifications/dublin-core/dcmi-terms/dublin_core_elements.ttl) |
| DCAT | [dcat.ttl](dcat.ttl) | [Source](https://www.w3.org/ns/dcat3.ttl) |
| Dublin Core Terms | [dcterms.ttl](dcterms.ttl) | [Source](https://www.dublincore.org/specifications/dublin-core/dcmi-terms/dublin_core_terms.ttl) |
| DOAP | [doap.rdf](doap.rdf) | [Source](https://raw.githubusercontent.com/ewilderj/doap/master/schema/doap.rdf) |
| Data Quality Vocabulary | [dqv.ttl](dqv.ttl) | [Source](https://www.w3.org/ns/dqv.ttl) |
| Data Usage Vocabulary | [duv.ttl](duv.ttl) | [Source](https://www.w3.org/ns/duv.ttl) |
| EARL | [earl.rdf](earl.rdf) | [Source](https://www.w3.org/ns/earl.rdf) |
| FOAF | [foaf.rdf](foaf.rdf) | [Source](https://xmlns.com/foaf/spec/index.rdf) |
| GoodRelations | [goodrelations.owl](goodrelations.owl) | [Source](https://www.heppnetz.de/ontologies/goodrelations/v1.owl) |
| Linked Data Platform | [ldp.ttl](ldp.ttl) | [Source](https://www.w3.org/ns/ldp.ttl) |
| Web Annotation | [oa.ttl](oa.ttl) | [Source](https://www.w3.org/ns/oa.ttl) |
| ODRL | [odrl.ttl](odrl.ttl) | [Source](https://www.w3.org/ns/odrl/2/ODRL22.ttl) |
| Organization Ontology | [org.ttl](org.ttl) | [Source](https://www.w3.org/ns/org.ttl) |
| OWL | [owl.owl](owl.owl) | [Source](https://www.w3.org/2002/07/owl.rdf) |
| PROV-O | [prov.ttl](prov.ttl) | [Source](https://www.w3.org/ns/prov-o.ttl) |
| RDF | [rdf.ttl](rdf.ttl) | [Source](https://www.w3.org/1999/02/22-rdf-syntax-ns.ttl) |
| RDF Schema | [rdfs.ttl](rdfs.ttl) | [Source](https://www.w3.org/2000/01/rdf-schema.ttl) |
| Schema.org | [schema.ttl](schema.ttl) | [Source](https://schema.org/version/latest/schemaorg-current-https.ttl) |
| SPARQL Service Description | [sd.ttl](sd.ttl) | [Source](https://www.w3.org/ns/sparql-service-description.ttl) |
| SHACL | [shacl.ttl](shacl.ttl) | [Source](https://www.w3.org/ns/shacl.ttl) |
| SKOS | [skos.rdf](skos.rdf) | [Source](https://www.w3.org/2009/08/skos-reference/skos.rdf) |
| SKOS-XL | [skosxl.rdf](skosxl.rdf) | [Source](https://www.w3.org/2009/08/skos-reference/skos-xl.rdf) |
| SOSA | [sosa.ttl](sosa.ttl) | [Source](https://www.w3.org/ns/sosa/sosa.ttl) |
| SSN | [ssn.ttl](ssn.ttl) | [Source](https://www.w3.org/ns/ssn/ssn.ttl) |
| OWL-Time | [time.ttl](time.ttl) | [Source](https://www.w3.org/2006/time.ttl) |
| vCard | [vcard.ttl](vcard.ttl) | [Source](https://www.w3.org/2006/vcard/ns.ttl) |
