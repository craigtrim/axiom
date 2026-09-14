type Point = { x: number; y: number };
type Size = { width: number; height: number };
type Side = "right" | "left" | "bottom" | "top";
export type CalloutAnchor = Point & { radius: number; labelWidth: number };
const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(Math.max(lo, hi), v));

/** Keep the callout inside the canvas and reserve space for its node and label. */
export function placeGraphCallout(
  viewport: Size,
  content: Size,
  anchor: CalloutAnchor,
) {
  const pad = 8,
    gap = 24,
    width = Math.max(1, viewport.width - pad * 2),
    height = Math.max(1, viewport.height - pad * 2),
    wanted = {
      width: Math.min(content.width, width),
      height: Math.min(content.height, height),
    },
    r = anchor.radius + 9,
    half = Math.max(r, anchor.labelWidth / 2),
    left = anchor.x - half,
    right = anchor.x + half,
    top = anchor.y - r,
    bottom = anchor.y + r + 24;
  const spaces = [
    {
      side: "right" as Side,
      x: right + gap,
      y: pad,
      width: viewport.width - pad - right - gap,
      height,
    },
    { side: "left" as Side, x: pad, y: pad, width: left - gap - pad, height },
    {
      side: "bottom" as Side,
      x: pad,
      y: bottom + gap,
      width,
      height: viewport.height - pad - bottom - gap,
    },
    { side: "top" as Side, x: pad, y: pad, width, height: top - gap - pad },
  ];
  const score = (s: (typeof spaces)[number]) =>
    Math.max(0, Math.min(s.width, wanted.width)) *
    Math.max(0, Math.min(s.height, wanted.height)) *
    (s.width >= Math.min(240, wanted.width) ? 1 : 0.2);
  const space =
    spaces.find((s) => s.width >= wanted.width && s.height >= wanted.height) ??
    spaces.reduce((best, s) => (score(s) > score(best) ? s : best));
  const box = {
    width: Math.min(wanted.width, Math.max(1, space.width)),
    height: Math.min(wanted.height, Math.max(1, space.height)),
    x: 0,
    y: 0,
  };
  box.x = clamp(
    space.side === "right"
      ? space.x
      : space.side === "left"
        ? left - gap - box.width
        : anchor.x - box.width / 2,
    pad,
    viewport.width - pad - box.width,
  );
  box.y = clamp(
    space.side === "bottom"
      ? space.y
      : space.side === "top"
        ? top - gap - box.height
        : anchor.y - box.height / 2,
    pad,
    viewport.height - pad - box.height,
  );
  const horizontal = space.side === "left" || space.side === "right";
  const end = horizontal
    ? {
        x: space.side === "right" ? box.x : box.x + box.width,
        y: clamp(anchor.y, box.y + 12, box.y + box.height - 12),
      }
    : {
        x: clamp(anchor.x, box.x + 12, box.x + box.width - 12),
        y: space.side === "bottom" ? box.y : box.y + box.height,
      };
  const start = horizontal
    ? { x: anchor.x + (space.side === "right" ? r : -r), y: anchor.y }
    : { x: anchor.x, y: space.side === "bottom" ? bottom : top };
  return { ...box, side: space.side, start, end };
}
