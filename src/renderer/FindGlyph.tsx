import type { ReactNode } from "react";

// Paths copied from the authoritative Find visual reference.
const glyphs = {
  close: <path d="M4 4l8 8M12 4l-8 8" />,
  clock: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4.6V8l2.3 1.4" />
    </>
  ),
  more: (
    <>
      <circle cx="3.5" cy="8" r=".9" fill="currentColor" />
      <circle cx="8" cy="8" r=".9" fill="currentColor" />
      <circle cx="12.5" cy="8" r=".9" fill="currentColor" />
    </>
  ),
  filter: <path d="M2.5 3.5h11l-4.2 5v4.2l-2.6 1.3V8.5z" />,
  plus: <path d="M8 3.5v9M3.5 8h9" />,
  chev: <path d="M4.5 6.5 8 10l3.5-3.5" />,
  first: <path d="M10.5 4 6.5 8l4 4M4.5 4v8" />,
  prev: <path d="M10 4 6 8l4 4" />,
  next: <path d="M6 4l4 4-4 4" />,
  last: <path d="M5.5 4 9.5 8l-4 4M11.5 4v8" />,
  graph: (
    <>
      <circle cx="4" cy="4" r="2" />
      <circle cx="12" cy="6" r="2" />
      <circle cx="7" cy="12.5" r="2" />
      <path d="M5.7 5.1 10.3 5.4M5.3 5.8 6.3 10.6M10.8 7.7 8.5 11.1" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export function FindGlyph({ name }: { name: keyof typeof glyphs }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {glyphs[name]}
    </svg>
  );
}
