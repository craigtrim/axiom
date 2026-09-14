import { describe, expect, test } from "vitest";
import { placeGraphCallout } from "../../src/renderer/graph-callout";

describe("graph callout placement", () => {
  test("uses the nearest available side without covering the node or label", () => {
    for (const x of [65, 500, 935])
      for (const y of [65, 350, 635]) {
        const a = { x, y, radius: 26, labelWidth: 120 };
        const b = placeGraphCallout(
          { width: 1000, height: 700 },
          { width: 320, height: 350 },
          a,
        );
        expect(b.x).toBeGreaterThanOrEqual(8);
        expect(b.y).toBeGreaterThanOrEqual(8);
        expect(b.x + b.width).toBeLessThanOrEqual(992);
        expect(b.y + b.height).toBeLessThanOrEqual(692);
        expect(
          b.x >= x + 60 ||
            b.x + b.width <= x - 60 ||
            b.y >= y + 59 ||
            b.y + b.height <= y - 35,
        ).toBe(true);
        expect(
          Math.hypot(b.end.x - b.start.x, b.end.y - b.start.y),
        ).toBeLessThan(90);
      }
  });
  test("uses vertical space in a narrow pane", () => {
    const b = placeGraphCallout(
      { width: 390, height: 800 },
      { width: 320, height: 350 },
      { x: 195, y: 150, radius: 28, labelWidth: 100 },
    );
    expect(b.side).toBe("bottom");
    expect(b.width).toBe(320);
    expect(b.y).toBeGreaterThan(210);
    expect(b.height).toBe(350);
  });
  test("constrains a tall form to scroll inside the viewport", () => {
    const b = placeGraphCallout(
      { width: 900, height: 300 },
      { width: 320, height: 600 },
      { x: 450, y: 150, radius: 28, labelWidth: 100 },
    );
    expect(b.width).toBe(320);
    expect(b.height).toBe(284);
    expect(b.y).toBe(8);
  });
  test("recomputes a connected placement when the node moves and the pane shrinks", () => {
    const content = { width: 320, height: 350 };
    const first = placeGraphCallout({ width: 1100, height: 800 }, content, {
      x: 900,
      y: 150,
      radius: 30,
      labelWidth: 150,
    });
    const next = placeGraphCallout({ width: 750, height: 650 }, content, {
      x: 150,
      y: 450,
      radius: 30,
      labelWidth: 150,
    });
    expect(first.side).toBe("left");
    expect(next.side).toBe("right");
    expect(next.start).toEqual({ x: 189, y: 450 });
    expect(next.end.x).toBe(next.x);
    expect(next.y + next.height).toBeLessThanOrEqual(642);
  });
});
