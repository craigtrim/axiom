// Geometry copied unchanged from the pinned shell reference.
const icons = {
  hierarchy:
    '<path d="M4 3h6v4H4z"/><path d="M14 10h6v4h-6z"/><path d="M14 17h6v4h-6z"/><path d="M7 7v12M7 12h7M7 19h7"/>',
  graph:
    '<circle cx="5" cy="6" r="2.4"/><circle cx="19" cy="5" r="2.4"/><circle cx="12" cy="18" r="2.4"/><path d="M7.2 7.3 10.2 15.9M16.9 6.6 13.7 15.8M7.4 5.6 16.6 5.1"/>',
  find: '<circle cx="11" cy="11" r="6.5"/><path d="M15.8 15.8 20.5 20.5"/>',
  grid: '<path d="M3 5h18v14H3z"/><path d="M3 10h18M3 15h18M9 5v14"/>',
  panel: '<path d="M4 4h16v16H4z"/><path d="M4 8.5h16M8 12.5h8M8 16.5h5"/>',
  code: '<path d="M9 6 4 12l5 6M15 6l5 6-5 6"/>',
  text: '<path d="M5 3h9l5 5v13H5z"/><path d="M14 3v5h5M8 13h8M8 17h5"/>',
  bulb: '<path d="M9 18.5h6M10 21.5h4"/><path d="M12 2.5a6 6 0 0 0-3.5 10.9c.6.5.9 1.2.9 1.9v.2h5.2v-.2c0-.7.3-1.4.9-1.9A6 6 0 0 0 12 2.5z"/>',
  shield:
    '<path d="M12 2.5 20 6v6c0 4.5-3.2 8.3-8 9.5C7.2 20.3 4 16.5 4 12V6z"/><path d="M8.5 12.2 11 14.7l4.5-5"/>',
  terminal:
    '<path d="M3 4h18v16H3z"/><path d="M7 9.5 10 12.5 7 15.5M13 15.5h4"/>',
  warn: '<path d="M12 3.4 22 20.6H2z"/><path d="M12 10v4.6M12 17.6v.1"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4 5.3 5.3"/>',
  chev: '<path d="M9 5l7 7-7 7"/>',
  tick: '<path d="M4.5 12.5 9.5 17.5 19.5 6.5"/>',
  burger: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  save: '<path d="M4 4h12l4 4v12H4z"/><path d="M8 4v5h7M8 14h8v6H8z"/>',
} as const;
export type ChromeIcon = keyof typeof icons;
export function ChromeGlyph({ name }: { name: ChromeIcon }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      dangerouslySetInnerHTML={{ __html: icons[name] }}
    />
  );
}
