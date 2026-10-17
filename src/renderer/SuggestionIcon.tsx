// Glyph paths from the pinned Suggestions reference (craigtrim/axiom#82).
export function SuggestionIcon({
  name,
  reverse = false,
}: {
  name: string;
  reverse?: boolean;
}) {
  const shapes: Record<string, React.ReactNode> = {
    chev: <path d="M6 3.5 10.5 8 6 12.5" />,
    check: <path d="M3 8.5 6.2 11.7 13 4.9" />,
    plus: <path d="M8 3.5v9M3.5 8h9" />,
    dup: (
      <>
        <rect x="2.5" y="2.5" width="8" height="8" rx="1.5" />
        <path d="M5.5 13.5h6a2 2 0 0 0 2-2v-6" />
      </>
    ),
    search: (
      <>
        <circle cx="7" cy="7" r="4.2" />
        <path d="m10.2 10.2 3 3" />
      </>
    ),
    sort: <path d="M8 12.5v-9M4.5 7 8 3.5 11.5 7" />,
    run: (
      <path d="M8 2.2 9.4 6l3.8 1.4L9.4 8.8 8 12.6 6.6 8.8 2.8 7.4 6.6 6z" />
    ),
    info: (
      <>
        <circle cx="8" cy="8" r="5.8" />
        <path d="M8 7.2v3.6M8 5.1v.1" />
      </>
    ),
    empty: (
      <>
        <path d="M3 9.5 5.5 4h13L21 9.5V19a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19z" />
        <path d="M3 9.5h5l1 2.5h6l1-2.5h5" />
      </>
    ),
  };
  const weight =
    name === "check" || name === "sort"
      ? 1.8
      : name === "chev" || name === "plus"
        ? 1.6
        : name === "info" || name === "empty"
          ? 1.4
          : 1.5;
  return (
    <svg
      className="ac-icon"
      aria-hidden="true"
      viewBox={name === "empty" ? "0 0 24 24" : "0 0 16 16"}
      fill="none"
      stroke="currentColor"
      strokeWidth={weight}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={reverse ? { transform: "rotate(180deg)" } : undefined}
    >
      {shapes[name]}
    </svg>
  );
}
