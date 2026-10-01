import { describe, expect, it } from "vitest";
import dictionary from "../../src/shared/title-case-acronyms.json";
import { selectedEntityName } from "../../src/shared/selected-entity-name";

describe("selected entity name dictionary", () => {
  for (const [name, entries] of Object.entries(dictionary)) {
    it(`${name} is nonempty, sorted by uppercase code point, and unique ignoring case`, () => {
      expect(entries.length).toBeGreaterThan(0);
      expect(
        entries.every((entry) => entry.length > 0 && entry === entry.trim()),
      ).toBe(true);
      const keys = entries.map((entry) => entry.toUpperCase());
      expect(keys).toEqual([...keys].sort());
      expect(new Set(keys).size).toBe(keys.length);
    });
  }
  it("does not promote held-back words into the acronym dictionary", () => {
    const heldBack = new Set(
      dictionary.heldBack.map((entry) => entry.toUpperCase()),
    );
    expect(
      dictionary.acronyms.filter((entry) => heldBack.has(entry.toUpperCase())),
    ).toEqual([]);
  });
  it.each([
    "II",
    "III",
    "IV",
    "V",
    "VI",
    "VII",
    "VIII",
    "IX",
    "X",
    "XI",
    "XII",
    "XIII",
    "XIV",
    "XV",
    "XVI",
    "XVII",
    "XVIII",
    "XIX",
    "XX",
  ])("includes course numeral %s", (numeral) => {
    expect(dictionary.acronyms).toContain(numeral);
    expect(selectedEntityName(`CALCULUS ${numeral.toLowerCase()}`)).toBe(
      `Calculus ${numeral}`,
    );
  });
});

describe("canonical acronym spelling", () => {
  for (const mode of ["lowercase", "uppercase", "canonical"] as const) {
    it.each(dictionary.acronyms)(
      `${mode} %s retains its canonical spelling in titles and punctuation`,
      (canonical) => {
        const input =
          mode === "lowercase"
            ? canonical.toLowerCase()
            : mode === "uppercase"
              ? canonical.toUpperCase()
              : canonical;
        expect(selectedEntityName(input)).toBe(canonical);
        expect(selectedEntityName(`INTRO TO ${input} METHODS`)).toBe(
          `Intro to ${canonical} Methods`,
        );
        expect(selectedEntityName(`“${input},” (${input}) [${input}]!`)).toBe(
          `“${canonical},” (${canonical}) [${canonical}]!`,
        );
      },
    );
  }
  it.each(dictionary.heldBack)(
    "treats held-back %s as an ordinary word",
    (entry) => {
      const expected = entry[0] + entry.slice(1).toLowerCase();
      expect(selectedEntityName(entry)).toBe(expected);
      expect(selectedEntityName(entry.toLowerCase())).toBe(expected);
    },
  );
});

describe("selected phrase title casing", () => {
  it.each([
    ["Basic ENGLISH COMPOSITION", "Basic English Composition"],
    ["PERSONAL DIMENSIONS OF EDUCATION", "Personal Dimensions of Education"],
    [
      "Basic ETHICS & SOCIAL RESPONSIBILITY",
      "Basic Ethics & Social Responsibility",
    ],
    ["INTRO TO HIV PREVENTION", "Intro to HIV Prevention"],
    ["PHD SEMINAR IN GIS", "PhD Seminar in GIS"],
    ["CALCULUS II", "Calculus II"],
    ["TCPA COMPLIANCE", "Tcpa Compliance"],
    ["WHAT IS IT", "What Is It"],
    ["LEONARDO DA VINCI", "Leonardo Da Vinci"],
    ["OWL AND STEM", "Owl and Stem"],
    ["iphone and mcgraw", "Iphone and Mcgraw"],
    ["iPhone AND McGraw", "iPhone and McGraw"],
    ["eBay iPhone McGraw eLearning", "eBay iPhone McGraw eLearning"],
    ["THE ROLE OF The EDITOR", "The Role of The Editor"],
    ["pHd IoT MRNA kwh IOS grpc oauth", "PhD IoT mRNA kWh iOS gRPC OAuth"],
    ["at&t and r&d", "AT&T and R&D"],
    ["HIV-BASED PREVENTION", "HIV-Based Prevention"],
    ["STATE-OF-THE-ART LEARNING", "State-of-the-Art Learning"],
    ["(the) SCIENCE OF [the]", "(The) Science of [The]"],
    ["& THE THEORY OF &", "& The Theory Of &"],
    [
      "INTRO: HIV, PHD; GIS / MRNA + TCPA",
      "Intro: HIV, PhD; GIS / mRNA + Tcpa",
    ],
    ["STUDENT'S GUIDE TO HIV", "Student's Guide to HIV"],
    ["STUDENTS’ GUIDE TO HIV", "Students’ Guide to HIV"],
    ["McGraw’s GUIDE", "McGraw’s Guide"],
    ["  basic\n\t ENGLISH\r\n COMPOSITION  ", "Basic English Composition"],
    ["\u00a0intro\u2003to\u00a0hiv\u00a0", "Intro to HIV"],
    ["ÉCOLOGIE ET ÉDUCATION", "Écologie Et Éducation"],
    ["CAFE\u0301 STUDIES", "Cafe\u0301 Studies"],
    ["😀 INTRO TO HIV 🚀", "😀 Intro to HIV 🚀"],
    ["计算机 SCIENCE", "计算机 Science"],
    ["2D AND 3D IN x86", "2D and 3D in x86"],
    ["123abc 42", "123Abc 42"],
    ["", ""],
    [" \t\n", ""],
    ["& / + — ...", "& / + — ..."],
    ["123 456", "123 456"],
  ])("seeds %j as %j", (source, expected) => {
    expect(selectedEntityName(source)).toBe(expected);
    expect(selectedEntityName(expected)).toBe(expected);
  });

  for (const word of [
    "a",
    "an",
    "and",
    "at",
    "by",
    "for",
    "in",
    "of",
    "on",
    "or",
    "the",
    "to",
  ]) {
    for (const input of [word, word.toUpperCase()]) {
      it(`handles first, interior, last, and sole function word ${input}`, () => {
        const capitalized = word[0].toUpperCase() + word.slice(1);
        expect(selectedEntityName(input)).toBe(capitalized);
        expect(selectedEntityName(`${input} LEARNING`)).toBe(
          `${capitalized} Learning`,
        );
        expect(selectedEntityName(`LEARNING ${input} LIFE`)).toBe(
          `Learning ${word} Life`,
        );
        expect(selectedEntityName(`LEARNING ${input}`)).toBe(
          `Learning ${capitalized}`,
        );
        expect(selectedEntityName(`“${input}” LEARNING ${input}!`)).toBe(
          `“${capitalized}” Learning ${capitalized}!`,
        );
      });
    }
  }
});
