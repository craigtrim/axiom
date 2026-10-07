export function DetailsGlyph({
  kind,
}: {
  kind: "back" | "chevron" | "remove" | "plus";
}) {
  const paths = {
    back: "M9.5 3.5 5 8l4.5 4.5",
    chevron: "M4 6.2 8 10l4-3.8",
    remove: "M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6",
    plus: "M8 3.5v9M3.5 8h9",
  };
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
      <path d={paths[kind]} />
    </svg>
  );
}
