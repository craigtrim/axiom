import { editEntity } from "./authoring";
import { startInlineRename } from "./InlineRename";
import { ContextMenu } from "./ContextMenu";
import { useSnapshot, request, command, report } from "./client";
import { THING } from "../domain/model";
export function EntityMenu({
  iri,
  x,
  y,
  document: doc,
  close,
  branch,
  taxonomy,
}: {
  iri: string;
  x: number;
  y: number;
  document: Document;
  close: () => void;
  branch?: { open: boolean; toggle: () => void };
  taxonomy?: (
    mode: import("../shared/taxonomy-assistant").TaxonomyMode,
  ) => void;
}) {
  const s = useSnapshot()!,
    entity = s.entities.find((e) => e.iri === iri),
    node = s.graph.nodes.find((n) => n.iri === iri);
  const run = async (action: () => unknown) => {
    close();
    try {
      await request("select", { iri });
      await action();
    } catch (e) {
      report(String(e), true);
    }
  };
  const actions = [
    {
      label: branch?.open ? "Collapse branch" : "Expand branch",
      enabled: !!branch,
      run: () => branch?.toggle(),
    },
    {
      label: "Show in graph",
      enabled: true,
      run: async () => {
        await request("seed", { iris: [iri] });
        command("view.graph");
        command("graph.fit");
      },
    },
    {
      label: "Add neighbours to graph",
      enabled: true,
      run: async () => {
        await request("seed", { iris: [iri], replace: false });
        command("view.graph");
        command("graph.fit");
      },
    },
    {
      label: node?.pinned ? "Unpin in graph" : "Pin in graph",
      enabled: !!node,
      run: () => request("pin", { iri }),
    },
    {
      label: "New subclass",
      enabled: !!entity && ["Class", "Defined"].includes(entity.kind),
      run: () => command("entity.createClass"),
    },
    {
      label: "New instance",
      enabled: !!entity && ["Class", "Defined"].includes(entity.kind),
      run: () => command("entity.createIndividual"),
    },
    {
      label: "Rename",
      enabled: !!entity && iri !== THING,
      run: () => startInlineRename(iri, { document: doc, panel: "hierarchy" }),
    },
    {
      label: "Delete class...",
      enabled:
        !!entity && iri !== THING && ["Class", "Defined"].includes(entity.kind),
      run: () => command("entity.delete"),
    },
    { label: "Edit details", enabled: !!entity, run: () => editEntity(iri) },
    { label: "Copy IRI", enabled: true, run: () => window.axiom.copy(iri) },
    {
      label: "Research...",
      enabled: true,
      run: () => command("research.open"),
    },
  ];
  if (taxonomy) {
    const enabled = !!entity && ["Class", "Defined"].includes(entity.kind);
    actions.push(
      { label: "Add children", enabled, run: () => taxonomy("children") },
      { label: "Find instances", enabled, run: () => taxonomy("instances") },
    );
  }
  return (
    <ContextMenu
      document={doc}
      x={x}
      y={y}
      close={close}
      actions={actions.map((a, i) => ({
        ...a,
        key: ["B", "S", "A", "P", "N", "I", "R", "D", "T", "C", "E", "H", "F"][
          i
        ],
        run: () => run(a.run),
      }))}
    />
  );
}
