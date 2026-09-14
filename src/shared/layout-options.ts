export const layoutOptions = [
  {
    id: "auto",
    label: "Auto layout",
    description: "Chooses a layout for the current visible graph.",
  },
  {
    id: "force",
    label: "Force-directed",
    description:
      "Interactive spring and repulsion simulation for relationship exploration.",
  },
  {
    id: "hierarchy",
    label: "Hierarchy",
    description: "Ranks superclass and type relationships vertically.",
  },
  {
    id: "radial",
    label: "Radial",
    description: "Places neighbours in rings around your focus.",
  },
  {
    id: "grid",
    label: "Cluster grid",
    description: "Groups visible entities by class, useful for dense views.",
  },
  {
    id: "circle",
    label: "Circular",
    description: "Places visible nodes around a circle for comparison.",
  },
  {
    id: "elk-layered",
    label: "ELK layered (Sugiyama)",
    description: "Reduces crossings between layers in directed graphs.",
  },
  {
    id: "elk-stress",
    label: "ELK stress",
    description:
      "Uses graph distances to reveal clusters. May take longer on dense graphs.",
  },
  {
    id: "elk-tree",
    label: "ELK tree",
    description: "Builds a spanning tree and arranges branches.",
  },
] as const;
export type LayoutMode = (typeof layoutOptions)[number]["id"];
export const isLayoutMode = (v: unknown): v is LayoutMode =>
  layoutOptions.some((m) => m.id === v);
export const isExternalLayout = (v: string) => v.startsWith("elk-");
