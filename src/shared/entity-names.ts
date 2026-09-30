/** Authoring identity is Unicode-aware and independent of retrieval tokenization. */
export const entityNameWords = (text: string) =>
  text.normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}\p{M}]+/gu) ?? [];
export const entityNameKey = (text: string) =>
  entityNameWords(text).join(" ") || text.normalize("NFKC").trim().toLowerCase();
export function entityIdentifier(label: string) {
  const words = label.trim().normalize("NFKC").match(/[\p{L}\p{N}\p{M}_]+/gu) ?? [];
  let name = words.map(w => w[0].toUpperCase() + w.slice(1)).join("") || "Entity";
  if (!/^\p{L}/u.test(name)) name = "Entity" + name;
  return name.slice(0, 200);
}
