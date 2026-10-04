import { describe, expect, it } from "vitest";
import {
  findCreationOffer,
  emptyFindDraft,
  type FindCollision,
} from "../../src/shared/find-create";
import { previewFindCreation } from "../../src/domain/find-creation";
import { EntitySearchIndex } from "../../src/domain/entity-search";
import { declaration, fromTriples, iri } from "../fixtures/search/fixture";

describe("Find new-class offer (#48)", () => {
  const collision = (kind: FindCollision["kind"]): FindCollision => ({
    iri: "https://example.test/NetworkCertification",
    label: "Network Certification",
    path: "Thing",
    kind,
  });
  it.each([
    "",
    "   ",
    "https://example.test/Network",
    "rdfs:label",
    "/network.*/",
  ])("does not offer query syntax or empty text: %s", (query) => {
    expect(findCreationOffer(query, [])).toMatchObject({
      visible: false,
      enabled: false,
    });
  });
  for (const nearMatches of [false, true]) {
    it(`offers a new concept ${nearMatches ? "with" : "without"} real search results`, async () => {
      const store = fromTriples(
        declaration(
          iri("Existing"),
          nearMatches ? "Network Security" : "Biology",
        ),
      );
      const query = "network certification";
      expect(new EntitySearchIndex(store).find({ text: query }).total > 0).toBe(
        nearMatches,
      );
      const preview = await previewFindCreation(
        store,
        emptyFindDraft(query),
        1,
      );
      expect(findCreationOffer(query, preview.collisions)).toEqual({
        label: "Network Certification",
        visible: true,
        enabled: true,
        title: 'Add "Network Certification" as a new class',
      });
    });
  }
  it.each(["exact", "iri"] as const)(
    "blocks a %s collision and names the existing entity",
    (kind) => {
      expect(
        findCreationOffer("Network Certification", [collision(kind)]),
      ).toMatchObject({
        visible: true,
        enabled: false,
        title: "Network Certification already exists",
      });
    },
  );
  it("allows normalized-only similarities but finds a later blocking collision", () => {
    expect(
      findCreationOffer("Network Certification", [collision("normalized")])
        .enabled,
    ).toBe(true);
    expect(
      findCreationOffer("Network Certification", [
        collision("normalized"),
        collision("iri"),
      ]).enabled,
    ).toBe(false);
  });
});
