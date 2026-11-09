// craigtrim/axiom#223: compare captured metadata without encoding a combined JSON string.

const plainObject = (value: object) => {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

/** Compare plain captured data using the values retained by JSON persistence. */
export function sameJsonValue(left: unknown, right: unknown): boolean {
  if (typeof left === "number" && !Number.isFinite(left)) left = null;
  if (typeof right === "number" && !Number.isFinite(right)) right = null;
  if (left === null || right === null) return left === right;
  if (typeof left !== typeof right) return false;
  if (typeof left !== "object") {
    return (
      ["undefined", "string", "number", "boolean"].includes(typeof left) &&
      left === right
    );
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (
      !Array.isArray(left) ||
      !Array.isArray(right) ||
      left.length !== right.length
    )
      return false;
    for (let index = 0; index < left.length; index++) {
      if (
        !sameJsonValue(
          left[index] === undefined ? null : left[index],
          right[index] === undefined ? null : right[index],
        )
      )
        return false;
    }
    return true;
  }
  if (!plainObject(left as object) || !plainObject(right as object))
    return false;
  const a = left as Record<string, unknown>;
  const b = right as Record<string, unknown>;
  const keys = Object.keys(a).filter((key) => a[key] !== undefined);
  if (
    keys.length !== Object.keys(b).filter((key) => b[key] !== undefined).length
  )
    return false;
  return keys.every(
    (key) => Object.hasOwn(b, key) && sameJsonValue(a[key], b[key]),
  );
}
