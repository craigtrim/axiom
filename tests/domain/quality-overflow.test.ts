import { describe, expect, it } from "vitest";
import { qualityOverflow } from "../../src/renderer/quality-overflow";

describe("quality command overflow", () => {
  const commands = [
    { id: "violation", width: 110, priority: 10 },
    { id: "warning", width: 100, priority: 20 },
    { id: "group", width: 105, priority: 100 },
    { id: "filter", width: 200, priority: 90 },
    { id: "export", width: 75, priority: 80 },
  ];
  it("retains every command at an exact fit and does not mutate the input", () => {
    const frozen = Object.freeze(commands.map((c) => Object.freeze({ ...c })));
    expect([...qualityOverflow(672, 52, 6, frozen)]).toEqual([]);
    expect([...qualityOverflow(671.99, 52, 6, frozen)]).toEqual(["group"]);
  });
  it.each([
    [560, ["group", "filter"]],
    [354, ["group", "filter", "export"]],
    [273, ["group", "filter", "export", "warning"]],
    [167, ["group", "filter", "export", "warning", "violation"]],
  ] as const)("reserves More and spacing at width %s", (width, expected) => {
    expect([...qualityOverflow(width, 52, 6, commands)]).toEqual(expected);
  });
  it("moves an oversized active filter without displacing a higher priority severity", () => {
    expect([
      ...qualityOverflow(240, 52, 6, [
        commands[0],
        {
          id: "active-namespace",
          width: 2000,
          priority: 50,
        },
      ]),
    ]).toEqual(["active-namespace"]);
  });
  it("handles no commands, fractional CSS sizes and stable equal priorities", () => {
    expect([...qualityOverflow(240, 52, 6, [])]).toEqual([]);
    const items = [
      { id: "a", width: 100.25, priority: 1 },
      { id: "b", width: 100.5, priority: 1 },
    ];
    expect([...qualityOverflow(240.75, 28, 6, items)]).toEqual([]);
    expect([...qualityOverflow(240.74, 28, 6, items)]).toEqual(["a"]);
  });
  it("restores all commands as width grows and accounts for changing counts", () => {
    expect(qualityOverflow(240, 52, 6, commands).size).toBeGreaterThan(0);
    expect(qualityOverflow(1200, 52, 6, commands).size).toBe(0);
    expect([
      ...qualityOverflow(
        672,
        52,
        6,
        commands.map((c) => ({ ...c, width: c.width + 10 })),
      ),
    ]).toEqual(["group"]);
  });
});
