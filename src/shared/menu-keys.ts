const preferred: Record<string, string> = {
  cut: "T",
  copy: "C",
  paste: "P",
  find: "F",
  "add entity": "A",
  undo: "U",
  redo: "R",
  "select all": "S",
  "format document": "D",
};

/** Reserve familiar keys before assigning remaining labels, including disabled items. */
export function menuKeys(labels: string[]): (string | undefined)[] {
  const used = new Set<string>();
  const keys = labels.map((label) => {
    const key = preferred[label.toLowerCase().trim()];
    if (!key || used.has(key)) return undefined;
    used.add(key);
    return key;
  });
  return keys.map((key, index) => {
    if (key) return key;
    const candidate = [...labels[index].toUpperCase()].find(
      (letter) => /^[A-Z0-9]$/.test(letter) && !used.has(letter),
    );
    if (candidate) used.add(candidate);
    return candidate;
  });
}
