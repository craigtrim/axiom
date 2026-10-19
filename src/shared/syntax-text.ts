// craigtrim/axiom#111: keep prose outside embedded JSON in assistant prompts.
export function promptSegments(
  text: string,
): { text: string; json: boolean }[] {
  const result: { text: string; json: boolean }[] = [];
  let plain = 0;
  for (let start = 0; start < text.length; start++) {
    if (!'["{'.includes(text[start])) continue;
    // Bracketed prose (for example [redacted]) is not a JSON candidate.
    if (text[start] === "{" && !/^\{\s*["}]/.test(text.slice(start))) continue;
    if (
      text[start] === "[" &&
      !/^\[\s*(?:["{[\]\d-]|true\b|false\b|null\b)/.test(text.slice(start))
    )
      continue;
    let end = start,
      depth = 0,
      quoted = false,
      escaped = false;
    for (; end < text.length; end++) {
      const c = text[end];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (quoted && c === "\\") {
        escaped = true;
        continue;
      }
      if (c === '"') quoted = !quoted;
      if (!quoted) {
        if (c === "{" || c === "[") depth++;
        if (c === "}" || c === "]") depth--;
        if (depth === 0) {
          end++;
          break;
        }
      }
    }
    const value = text.slice(start, end);
    let valid = false;
    try {
      JSON.parse(value);
      valid = true;
    } catch {
      /* A truncated diagnostic may end inside its JSON. */
    }
    if (!valid && !(end === text.length && /^[{[]\s*"/.test(value))) {
      start = end - 1;
      continue;
    }
    if (start > plain)
      result.push({ text: text.slice(plain, start), json: false });
    result.push({ text: value, json: true });
    start = end - 1;
    plain = end;
  }
  if (plain < text.length)
    result.push({ text: text.slice(plain), json: false });
  return result;
}
