// SVG paths copied from Craig's Ontology Quality visual reference (craigtrim/axiom#44).
import type { QualitySeverity } from "../shared/ontology-quality";

export const Play = () => (
  <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M4.5 3.2 12.5 8l-8 4.8z" />
  </svg>
);
export const Chevron = () => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    aria-hidden="true"
  >
    <path d="M6 3.5 10.5 8 6 12.5" />
  </svg>
);
export const Octagon = () => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M5.6 1.8h4.8L13.8 5.2v4.8l-3.4 3.4H5.6L2.2 10V5.2z" />
    <path d="M8 4.8v3.4M8 10.6v.6" />
  </svg>
);
export const Triangle = () => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M8 2.2 14.5 13.3h-13z" />
    <path d="M8 6.3v3M8 11.4v.6" />
  </svg>
);
export const Circle = () => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <circle cx="8" cy="8" r="6" />
    <path d="M8 7.2v4M8 4.9v.6" />
  </svg>
);
export const Failed = () => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <circle cx="8" cy="8" r="6" />
    <path d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8" />
  </svg>
);
export const Rerun = () => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="M13 8a5 5 0 1 1-1.6-3.7" />
    <path d="M13.2 2.6v2.8h-2.8" />
  </svg>
);
export const Download = () => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="M8 2v7.5M5.2 7l2.8 2.8L10.8 7M3 12.5h10" />
  </svg>
);
export const OpenDetails = () => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="M6.5 3.5h-3v9h9v-3M9.5 3.5h3v3M12.5 3.5 7 9" />
  </svg>
);
export const Suppress = () => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="M3 8h10" />
    <circle cx="8" cy="8" r="6" />
  </svg>
);
export const Unsuppress = () => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="M3 8h10M8 3v10" />
  </svg>
);
export const severityClass = (s: QualitySeverity) =>
  s === "Violation" ? "violation" : s === "Warning" ? "warning" : "info";
/** Shape first, colour second, word always. */
export const SeverityGlyph = ({ severity }: { severity: QualitySeverity }) =>
  severity === "Violation" ? (
    <Octagon />
  ) : severity === "Warning" ? (
    <Triangle />
  ) : (
    <Circle />
  );
