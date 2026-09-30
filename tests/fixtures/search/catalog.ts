/** Hand-authored vocabulary. Expected identities never come from search output. */
export const concepts = [
  ["Reading Comprehension", "Text Understanding"],
  ["Language Acquisition", "Speech Development"],
  ["Cognitive Psychology", "Mental Processes"],
  ["Developmental Biology", "Embryonic Growth"],
  ["Quantum Mechanics", "Subatomic Physics"],
  ["Organic Chemistry", "Carbon Compounds"],
  ["Linear Algebra", "Vector Spaces"],
  ["Discrete Mathematics", "Finite Structures"],
  ["Computer Science", "Algorithmic Foundations"],
  ["Software Engineering", "Program Construction"],
  ["Database Systems", "Persistent Storage"],
  ["Network Security", "Cyber Defence"],
  ["Machine Learning", "Predictive Algorithms"],
  ["Neural Networks", "Connectionist Models"],
  ["Computer Vision", "Scene Interpretation"],
  ["Natural Language", "Human Communication"],
  ["Information Retrieval", "Document Discovery"],
  ["Knowledge Representation", "Concept Encoding"],
  ["Semantic Reasoning", "Meaning Inference"],
  ["Graph Theory", "Vertex Connections"],
  ["Digital Signal", "Sampled Waveforms"],
  ["Image Processing", "Picture Transformation"],
  ["Pattern Recognition", "Feature Classification"],
  ["Statistical Inference", "Population Estimation"],
  ["Bayesian Analysis", "Posterior Beliefs"],
  ["Financial Accounting", "Business Bookkeeping"],
  ["Corporate Finance", "Company Funding"],
  ["Market Research", "Consumer Surveys"],
  ["Supply Logistics", "Freight Coordination"],
  ["Project Management", "Delivery Scheduling"],
  ["Public Policy", "Government Decisions"],
  ["Social Welfare", "Community Assistance"],
  ["Environmental Science", "Ecosystem Studies"],
  ["Climate Modelling", "Weather Simulation"],
  ["Marine Ecology", "Ocean Habitats"],
  ["Forest Conservation", "Woodland Protection"],
  ["Urban Planning", "City Development"],
  ["Civil Engineering", "Infrastructure Design"],
  ["Structural Mechanics", "Load Behaviour"],
  ["Electrical Circuits", "Current Pathways"],
  ["Chemical Kinetics", "Reaction Rates"],
  ["Molecular Genetics", "Hereditary Sequences"],
  ["Cellular Biology", "Microscopic Organisms"],
  ["Human Anatomy", "Bodily Structures"],
  ["Medical Imaging", "Diagnostic Scanning"],
  ["Clinical Nursing", "Patient Care"],
  ["Dental Hygiene", "Oral Cleanliness"],
  ["Pharmacy Practice", "Medication Dispensing"],
  ["Veterinary Medicine", "Animal Healing"],
  ["Agricultural Economics", "Farming Markets"],
  ["Food Safety", "Edible Quality"],
  ["Water Treatment", "Liquid Purification"],
  ["Renewable Energy", "Sustainable Power"],
  ["Solar Radiation", "Sunlight Emissions"],
  ["Stellar Evolution", "Star Formation"],
  ["Planetary Geology", "Extraterrestrial Rocks"],
  ["Ancient History", "Classical Civilizations"],
  ["Modern Literature", "Contemporary Writing"],
  ["Visual Design", "Graphic Composition"],
  ["Musical Harmony", "Tonal Relationships"],
  ["Linguistic Semantics", "Lexical Meaning"],
  ["Computational Linguistics", "Automated Parsing"],
  ["Criminal Justice", "Penal Procedures"],
  ["Constitutional Law", "Foundational Rights"],
].map(([label, alias], index) => ({
  id: `concept-${String(index + 1).padStart(2, "0")}`,
  label,
  alias,
  localName: label.replaceAll(" ", "_"),
}));

type Pattern = {
  id: string;
  purpose: string;
  query(a: string, b: string): string;
};
const remove = (text: string) => text.slice(0, 2) + text.slice(3);
const substitute = (text: string) =>
  text.slice(0, 2) + (text[2] === "q" ? "x" : "q") + text.slice(3);
export const lexicalPatterns: Pattern[] = [
  {
    id: "exact",
    purpose: "exact preferred label",
    query: (a, b) => `${a} ${b}`,
  },
  {
    id: "lowercase",
    purpose: "case-insensitive lowercase",
    query: (a, b) => `${a} ${b}`.toLowerCase(),
  },
  {
    id: "uppercase",
    purpose: "case-insensitive uppercase",
    query: (a, b) => `${a} ${b}`.toUpperCase(),
  },
  {
    id: "reversed",
    purpose: "word-order independence",
    query: (a, b) => `${b} ${a}`,
  },
  {
    id: "last-prefix",
    purpose: "unfinished last term",
    query: (a, b) => `${a} ${b.slice(0, 4)}`,
  },
  {
    id: "first-prefix",
    purpose: "unfinished first term",
    query: (a, b) => `${a.slice(0, 4)} ${b}`,
  },
  {
    id: "both-prefixes",
    purpose: "prefix matching on every term",
    query: (a, b) => `${a.slice(0, 4)} ${b.slice(0, 4)}`,
  },
  {
    id: "reversed-prefixes",
    purpose: "prefixes in reversed order",
    query: (a, b) => `${b.slice(0, 4)} ${a.slice(0, 4)}`,
  },
  {
    id: "hyphen",
    purpose: "hyphen token boundary",
    query: (a, b) => `${a}-${b}`,
  },
  {
    id: "underscore",
    purpose: "underscore token boundary",
    query: (a, b) => `${a}_${b}`,
  },
  {
    id: "slash",
    purpose: "slash token boundary",
    query: (a, b) => `${a}/${b}`,
  },
  { id: "tab", purpose: "tab token boundary", query: (a, b) => `${a}\t${b}` },
  {
    id: "newline",
    purpose: "pasted multiline query",
    query: (a, b) => `${a}\n${b}`,
  },
  {
    id: "nbsp",
    purpose: "nonbreaking space from pasted text",
    query: (a, b) => `${a}\u00a0${b}`,
  },
  {
    id: "padding",
    purpose: "leading, trailing and repeated spaces",
    query: (a, b) => `  ${a}   ${b}  `,
  },
  {
    id: "and",
    purpose: "filler between terms",
    query: (a, b) => `${a} and ${b}`,
  },
  {
    id: "stopwords",
    purpose: "several filler words",
    query: (a, b) => `the ${a} of the ${b}`,
  },
  {
    id: "extra-tail",
    purpose: "unmatched suffix retains useful matches",
    query: (a, b) => `${a} ${b} zzqvopaque`,
  },
  {
    id: "extra-head",
    purpose: "unmatched leading term retains useful matches",
    query: (a, b) => `zzqvopaque ${a} ${b}`,
  },
  {
    id: "repeat",
    purpose: "duplicate term does not duplicate entities",
    query: (a, b) => `${a} ${a} ${b}`,
  },
  {
    id: "delete-first",
    purpose: "one missing character in the first term",
    query: (a, b) => `${remove(a)} ${b}`,
  },
  {
    id: "delete-last",
    purpose: "one missing character in the last term",
    query: (a, b) => `${a} ${remove(b)}`,
  },
  {
    id: "substitute-first",
    purpose: "one incorrect character",
    query: (a, b) => `${substitute(a)} ${b}`,
  },
  {
    id: "insert-last",
    purpose: "one extra character",
    query: (a, b) => `${a} ${b.slice(0, 2)}q${b.slice(2)}`,
  },
];
export const aliasPatterns: Pattern[] = [
  { id: "exact", purpose: "complete alias", query: (a, b) => `${a} ${b}` },
  {
    id: "lowercase",
    purpose: "lowercase alias",
    query: (a, b) => `${a} ${b}`.toLowerCase(),
  },
  {
    id: "reversed",
    purpose: "alias terms in reversed order",
    query: (a, b) => `${b} ${a}`,
  },
  {
    id: "prefix",
    purpose: "unfinished alias",
    query: (a, b) => `${a} ${b.slice(0, 4)}`,
  },
  {
    id: "both-prefixes",
    purpose: "two alias prefixes",
    query: (a, b) => `${a.slice(0, 4)} ${b.slice(0, 4)}`,
  },
  {
    id: "filler",
    purpose: "alias with filler",
    query: (a, b) => `${a} and ${b}`,
  },
  {
    id: "typo",
    purpose:
      "alias with one spelling error in a term of at least four characters",
    query: (a, b) => `${a.length === 4 ? substitute(a) : remove(a)} ${b}`,
  },
  {
    id: "extra",
    purpose: "alias with an unknown term",
    query: (a, b) => `${a} ${b} zzqvopaque`,
  },
];
export const lexicalCases = concepts.flatMap((concept) => {
  const [a, b] = concept.label.split(" ");
  return lexicalPatterns.map((pattern) => ({
    id: `LEX-${concept.id}-${pattern.id}`,
    purpose: pattern.purpose,
    query: pattern.query(a, b),
    concept,
  }));
});
export const aliasCases = concepts.flatMap((concept) => {
  const [a, b] = concept.alias.split(" ");
  return aliasPatterns.map((pattern) => ({
    id: `ALIAS-${concept.id}-${pattern.id}`,
    purpose: pattern.purpose,
    query: pattern.query(a, b),
    concept,
  }));
});
