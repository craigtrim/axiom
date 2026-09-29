import { expect, it } from "vitest";
import { levenshteinDistance } from "../../src/shared/text-distance";

it.each([
  ["", "", 0],
  ["", "abc", 3],
  ["kitten", "sitting", 3],
  ["ab", "ba", 2],
  ["Systems Administration", "System Administration", 1],
  ["Systems Administration", "Systems Admin", 9],
  ["Systems Administration", "System Admin", 10],
  ["Admin", "ADMIN", 0],
  ["café", "cafe\u0301", 0],
  ["😀", "", 1],
  ["a😀b", "ab", 1],
  ["sys admin", "sys-admin", 1],
])("counts edits between %s and %s", (left, right, distance) => {
  expect(levenshteinDistance(left, right)).toBe(distance);
  expect(levenshteinDistance(right, left)).toBe(distance);
});
