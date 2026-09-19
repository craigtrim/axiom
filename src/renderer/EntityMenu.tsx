import { openTaxonomy } from "./taxonomy-view";
import { taxonomyChildren } from "../domain/class-expressions";
import { instanceAction, countLabel } from "../shared/action-state";
import { showInstances } from "./instance-report";
import { editEntity } from "./authoring";
import { startInlineRename } from "./InlineRename";
import { ContextMenu, type ContextAction } from "./ContextMenu";
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
  const isClass = !!entity && ["Class", "Defined"].includes(entity.kind);
  const actions: (ContextAction | null)[] = [
    {
      label: "Show in graph",
      key: "S",
      run: () => {},
      children: [
        { label: "New graph", key: "N", run: () => command("entity.newGraph") },
        {
          label: "Current graph",
          key: "C",
          run: () => command("entity.showGraph"),
        },
      ],
    },
    {
      ...instanceAction(entity),
      key: "O",
      run: () => showInstances(iri),
    },
    {
      label: countLabel(
        branch?.open ? "Collapse branch" : "Expand branch",
        taxonomyChildren(entity).length,
      ),
      key: "B",
      visible: isClass || !!branch,
      enabled: !!branch && !!taxonomyChildren(entity).length,
      run: () => branch?.toggle(),
    },
    {
      label: "Add neighbours to graph",
      key: "A",
      run: async () => {
        await request("seed", { iris: [iri], replace: false });
        command("view.graph");
        command("graph.fit");
      },
    },
    {
      label: "Pin in graph",
      key: "P",
      checked: !!node?.pinned,
      enabled: !!node,
      run: () => request("pin", { iri }),
    },
    null,
    {
      label: "Details",
      key: "T",
      enabled: !!entity,
      run: () => editEntity(iri),
    },
    {
      label: "Rename",
      key: "R",
      enabled: !!entity && iri !== THING,
      run: () => startInlineRename(iri, { document: doc, panel: "hierarchy" }),
    },
    {
      label: "New subclass",
      key: "N",
      visible: isClass,
      run: () => command("entity.createClass"),
    },
    {
      label: "New instance",
      key: "I",
      visible: isClass,
      run: () => command("entity.createIndividual"),
    },
    null,
    {
      label: "Suggest",
      key: "G",
      visible: !!entity,
      run: () => {},
      children: [
        {
          label: "Add Children",
          enabled: isClass,
          key: "C",
          run: () => openTaxonomy(iri, "children"),
        },
        {
          label: "Add Parents",
          enabled: isClass,
          key: "P",
          run: () => openTaxonomy(iri, "parents"),
        },
        {
          label: "Find Synonyms",
          key: "S",
          enabled: !iri.startsWith("_:"),
          run: () => openTaxonomy(iri, "synonyms"),
        },
        {
          label: "Define New",
          key: "N",
          run: () => openTaxonomy(iri, "define"),
        },
      ],
    },
    { label: "Research...", key: "E", run: () => command("research.open") },
    {
      label: "Find instances",
      key: "F",
      visible: !!taxonomy && isClass,
      run: () => taxonomy?.("instances"),
    },
    null,
    { label: "Copy IRI", key: "C", run: () => window.axiom.copy(iri) },
    null,
    {
      label: "Delete class...",
      key: "D",
      visible: isClass,
      enabled: iri !== THING,
      run: () => command("entity.delete"),
    },
  ];
  const wrap = (a: ContextAction | null): ContextAction | null =>
    a && { ...a, run: () => run(a.run), children: a.children?.map(wrap) };
  return (
    <ContextMenu
      document={doc}
      x={x}
      y={y}
      close={close}
      actions={actions.map(wrap)}
    />
  );
}
