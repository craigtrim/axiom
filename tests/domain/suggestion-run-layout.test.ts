// craigtrim/axiom#148: width capacity and height fitting have independent boundaries.
import { expect, it } from "vitest";
import { suggestionRunLayout as layout } from "../../src/renderer/suggestion-run-layout";

it("uses the fewest sets that fit, capped at three when none fit", () => {
  expect(layout(3000, 676, 25, 100).columns).toBe(1);
  expect(layout(3000, 364, 25, 100).columns).toBe(2);
  expect(layout(3000, 363, 25, 100).columns).toBe(3);
  expect(layout(3000, 260, 25, 100).columns).toBe(3);
  expect(layout(3000, 259, 25, 100).columns).toBe(3);
});
it("reserves the widest label, padding, and all fixed columns", () => {
  expect(layout(1300, 260, 25, 300)).toEqual({
    columns: 1,
    capacity: 1,
    minWidth: 666,
  });
  expect(layout(1400, 364, 25, 300).columns).toBe(2);
  expect(layout(300, 260, 25, 300).minWidth).toBe(666);
});
it("requires sixteen extra pixels to add a set and drops it before labels clip", () => {
  expect(layout(971, 100, 25, 100, 1).capacity).toBe(1);
  expect(layout(972, 100, 25, 100, 1).capacity).toBe(2);
  expect(layout(956, 100, 25, 100, 2).capacity).toBe(2);
  expect(layout(955, 100, 25, 100, 2).capacity).toBe(1);
  expect(layout(1457, 100, 25, 100, 2).capacity).toBe(2);
  expect(layout(1458, 100, 25, 100, 2).capacity).toBe(3);
  expect(layout(1442, 100, 25, 100, 3).capacity).toBe(3);
  expect(layout(1441, 100, 25, 100, 3).capacity).toBe(2);
});
it("retains width capacity through a tall single-column layout", () => {
  const tall = layout(1450, 1000, 25, 100, 3);
  expect(tall).toMatchObject({ columns: 1, capacity: 3 });
  expect(layout(1450, 260, 25, 100, tall.capacity).columns).toBe(3);
});
it("keeps empty and single-target queues in one set", () => {
  for (const runs of [0, 1]) expect(layout(3000, 1, runs, 100).columns).toBe(1);
});
