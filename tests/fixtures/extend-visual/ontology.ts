export const extendBase = "https://example.test/extend#";
export const extendOntology = `
@prefix : <${extendBase}>.
@prefix owl: <http://www.w3.org/2002/07/owl#>.
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#>.
: a owl:Ontology.
:Psychology a owl:Class; rdfs:label "Psychology"; rdfs:seeAlso "Psyc", "Psych", "PSY field".
:GeneralPsychology a owl:Class; rdfs:label "General Psychology".
:ClinicalPsychology a owl:Class; rdfs:label "Clinical Psychology"; rdfs:subClassOf :Psychology.
:teaches a owl:ObjectProperty; rdfs:label "teaches"; rdfs:seeAlso "Psychology teaching".
:data a owl:DatatypeProperty; rdfs:label "psychology data".
:annotation a owl:AnnotationProperty; rdfs:label "psychology annotation".
:PSY101 a owl:NamedIndividual, :GeneralPsychology; rdfs:label "PSY 101 Fall 2026".
:other a rdfs:Datatype; rdfs:label "Psychology resource".
`;
