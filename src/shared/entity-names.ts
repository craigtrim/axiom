// Issue 157: only standalone ampersands name the word "and"; R&D stays intact.
export const normalizeEntityName = (text: string) =>
  text.replace(/(?<=\s)&(?=\s)/gu, "and");

export function entityAmpersandSynonym(name: string) {
  const synonym = name.replace(/(?<=\s)and(?=\s)/giu, "&");
  return synonym === name ? undefined : synonym;
}

/** Authoring identity is Unicode-aware and independent of retrieval tokenization. */
export const entityNameWords = (text: string) =>
  normalizeEntityName(text)
    .normalize("NFKC")
    .toLowerCase()
    .match(/[\p{L}\p{N}\p{M}]+/gu) ?? [];
export const entityNameKey = (text: string) =>
  entityNameWords(text).join(" ") ||
  text.normalize("NFKC").trim().toLowerCase();
export function entityIdentifier(label: string) {
  const words =
    normalizeEntityName(label)
      .trim()
      .normalize("NFKC")
      // #70: retain camel-case word boundaries before normalizing ID casing.
      .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, "$1 $2")
      .replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, "$1 $2")
      .match(/[\p{L}\p{N}\p{M}_]+/gu) ?? [];
  let name =
    words
      .map((w) => {
        const [first, ...rest] = [...w.toLowerCase()];
        return first.toUpperCase() + rest.join("");
      })
      .join("") || "Entity";
  if (!/^\p{L}/u.test(name)) name = "Entity" + name;
  return [...name].slice(0, 200).join("");
}
