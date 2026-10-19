// #122/#123: reproduce the schools ontology shape without external data.
export const schoolBase = "https://fixture.example/schools#";
export function schoolOntology(count = 21461) {
  const annotations = [
    "hasQID",
    "hasType",
    "hasCountry",
    "establishedYear",
    "locatedIn",
    "hasWebsite",
    "hasCoordinates",
  ];
  const header = `@prefix : <${schoolBase}>.
@prefix owl: <http://www.w3.org/2002/07/owl#>.
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#>.
:School a owl:Class; rdfs:label "School".
`;
  return (
    header +
    Array.from(
      { length: count },
      (_, i) =>
        `:school${i} a :School; rdfs:label "School ${String(i).padStart(5, "0")} University"; rdfs:comment "School ${i} serves its region."; rdfs:seeAlso "College ${i}", "Academy ${i}"; owl:sameAs <https://fixture.example/external/${i}>; ` +
        annotations
          .slice(0, 1 + (i % annotations.length))
          .map((name) => `:${name} "${name} ${i}"`)
          .join("; ") +
        ".",
    ).join("\n")
  );
}
