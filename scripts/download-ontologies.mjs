import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const sources = [
    ["rdf", "RDF", "https://www.w3.org/1999/02/22-rdf-syntax-ns.ttl", "ttl"],
    ["rdfs", "RDF Schema", "https://www.w3.org/2000/01/rdf-schema.ttl", "ttl"],
    ["owl", "OWL", "https://www.w3.org/2002/07/owl.rdf", "owl"],
    ["prov", "PROV-O", "https://www.w3.org/ns/prov-o.ttl", "ttl"],
    [
      "skos",
      "SKOS",
      "https://www.w3.org/2009/08/skos-reference/skos.rdf",
      "rdf",
    ],
    [
      "skosxl",
      "SKOS-XL",
      "https://www.w3.org/2009/08/skos-reference/skos-xl.rdf",
      "rdf",
    ],
    ["org", "Organization Ontology", "https://www.w3.org/ns/org.ttl", "ttl"],
    ["time", "OWL-Time", "https://www.w3.org/2006/time.ttl", "ttl"],
    ["dcat", "DCAT", "https://www.w3.org/ns/dcat.ttl", "ttl"],
    ["shacl", "SHACL", "https://www.w3.org/ns/shacl.ttl", "ttl"],
    ["odrl", "ODRL", "https://www.w3.org/ns/odrl/2/ODRL22.ttl", "ttl"],
    ["sosa", "SOSA", "https://www.w3.org/ns/sosa/sosa.ttl", "ttl"],
    ["ssn", "SSN", "https://www.w3.org/ns/ssn/ssn.ttl", "ttl"],
    ["vcard", "vCard", "https://www.w3.org/2006/vcard/ns.ttl", "ttl"],
    ["qb", "RDF Data Cube", "https://www.w3.org/linked-data/cube", "ttl"],
    ["csvw", "CSV on the Web", "https://www.w3.org/ns/csvw.ttl", "ttl"],
    ["ldp", "Linked Data Platform", "https://www.w3.org/ns/ldp.ttl", "ttl"],
    [
      "activitystreams",
      "ActivityStreams",
      "https://www.w3.org/ns/activitystreams-owl",
      "ttl",
    ],
    ["oa", "Web Annotation", "https://www.w3.org/ns/oa.ttl", "ttl"],
    ["adms", "ADMS", "https://www.w3.org/ns/adms.ttl", "ttl"],
    ["dqv", "Data Quality Vocabulary", "https://www.w3.org/ns/dqv.ttl", "ttl"],
    ["duv", "Data Usage Vocabulary", "https://www.w3.org/ns/duv.ttl", "ttl"],
    ["earl", "EARL", "https://www.w3.org/ns/earl.rdf", "rdf"],
    [
      "sd",
      "SPARQL Service Description",
      "https://www.w3.org/ns/sparql-service-description.ttl",
      "ttl",
    ],
    [
      "dcterms",
      "Dublin Core Terms",
      "https://www.dublincore.org/specifications/dublin-core/dcmi-terms/dublin_core_terms.ttl",
      "ttl",
    ],
    [
      "dc",
      "Dublin Core Elements",
      "https://www.dublincore.org/specifications/dublin-core/dcmi-terms/dublin_core_elements.ttl",
      "ttl",
    ],
    ["foaf", "FOAF", "https://xmlns.com/foaf/spec/index.rdf", "rdf"],
    [
      "schema",
      "Schema.org",
      "https://schema.org/version/latest/schemaorg-current-https.ttl",
      "ttl",
    ],
    [
      "doap",
      "DOAP",
      "https://raw.githubusercontent.com/ewilderj/doap/master/schema/doap.rdf",
      "rdf",
    ],
    [
      "goodrelations",
      "GoodRelations",
      "https://www.heppnetz.de/ontologies/goodrelations/v1.owl",
      "owl",
    ],
    [
      "geosparql",
      "GeoSPARQL",
      "https://opengeospatial.github.io/ogc-geosparql/geosparql11/geo.ttl",
      "ttl",
    ],
  ],
  dir = "tests/fixtures/ontologies";
await mkdir(dir, { recursive: true });
const manifest = [];
let next = 0;
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (next < sources.length) {
      const [id, title, url, ext] = sources[next++];
      try {
        const response = await fetch(url, {
          headers: {
            Accept:
              "text/turtle, application/rdf+xml;q=0.9, application/ld+json;q=0.8",
          },
          signal: AbortSignal.timeout(45000),
        });
        if (!response.ok) throw Error("HTTP " + response.status);
        const data = Buffer.from(await response.arrayBuffer());
        if (data.length > 25000000) throw Error("Oversize fixture");
        if (/<!doctype html|<html[ >]/i.test(data.toString("utf8", 0, 2000)))
          throw Error("Returned HTML");
        const file = id + "." + ext;
        await writeFile(dir + "/" + file, data);
        manifest.push({
          id,
          title,
          url,
          resolvedUrl: response.url,
          file,
          bytes: data.length,
          sha256: createHash("sha256").update(data).digest("hex"),
          mediaType: response.headers.get("content-type"),
          downloadedAt: new Date().toISOString(),
        });
        console.log(id + ": " + data.length + " bytes");
      } catch (e) {
        console.log(id + ": " + e.message);
      }
    }
  }),
);
manifest.sort((a, b) => a.id.localeCompare(b.id));
await writeFile(
  dir + "/manifest.json",
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log("Downloaded " + manifest.length + " published vocabularies");
