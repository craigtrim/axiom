import { openSimilar } from "./find-state";
import { openSparsity } from "./sparsity-view";
import { openTaxonomy } from "./taxonomy-view";
import { taxonomyChildren } from "../domain/class-expressions";
import { instanceAction, countLabel } from "../shared/action-state";
import { showInstances } from "./instance-report";
import { editEntity } from "./authoring";
import { startInlineRename } from "./InlineRename";
import { ContextMenu, type ContextAction } from "./ContextMenu";
import { useSnapshot, request, command, report } from "./client";
import { THING } from "../domain/model";
import {
  supportsBatchMode,
  type BatchMode,
} from "../shared/suggestion-batches";
import { openSuggestionBatch } from "./SuggestionRunsPanel";
export function EntityMenu({
  iri,
  iris: selectedIris,
  x,
  y,
  document: doc,
  close,
  branch,
  taxonomy,
}: {
  iri: string;
  iris?: string[];
  x: number;
  y: number;
  document: Document;
  close: () => void;
  branch?: { open: boolean; toggle: () => void; count?: number };
  taxonomy?: (
    mode: import("../shared/taxonomy-assistant").TaxonomyMode,
  ) => void;
}) {
  const s = useSnapshot()!,
    entity = s.entities.find((e) => e.iri === iri),
    node = s.graph.nodes.find((n) => n.iri === iri);
  const iris = [...new Set(selectedIris ?? [iri])];
  const multiple = iris.length > 1;
  const entities = new Map(s.entities.map((e) => [e.iri, e]));
  const allClass = iris.every((id) =>
    supportsBatchMode(entities.get(id), "children"),
  );
  const canSuggest = (mode: BatchMode) =>
    iris.every((id) => supportsBatchMode(entities.get(id), mode));
  const suggest = (mode: BatchMode) =>
    multiple ? openSuggestionBatch(iris, mode) : openTaxonomy(iri, mode);
  const graphNodes = iris.map((id) => s.graph.nodes.find((n) => n.iri === id));
  const allPinned = graphNodes.every((n) => n?.pinned);
  const run = async (action: () => unknown) => {
    close();
    try {
      await request("select", { iri, origin: "hierarchy" });
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
        {
          label: "New graph",
          key: "N",
          run: async () => {
            if (!multiple) return command("entity.newGraph");
            const id = await request<string>("graphCreate", {
              iris,
              expand: false,
            });
            command("view." + id);
            command("graph.fit");
          },
        },
        {
          label: "Current graph",
          key: "C",
          run: async () => {
            if (!multiple) return command("entity.showGraph");
            await request("seed", { iris, expand: false });
            command("view.graph");
            command("graph.fit");
          },
        },
      ],
    },
    {
      ...instanceAction(entity),
      enabled: !multiple && instanceAction(entity).enabled,
      key: "O",
      run: () => showInstances(iri),
    },
    {
      label: countLabel(
        branch?.open ? "Collapse branch" : "Expand branch",
        branch?.count ?? taxonomyChildren(entity).length,
      ),
      key: "B",
      visible: isClass || !!branch,
      enabled: !!branch && !!(branch.count ?? taxonomyChildren(entity).length),
      run: () => branch?.toggle(),
    },
    {
      label: "Add neighbours to graph",
      key: "E",
      run: async () => {
        await request("seed", { iris, replace: false });
        command("view.graph");
        command("graph.fit");
      },
    },
    {
      label: "Pin in graph",
      key: "P",
      checked: multiple ? allPinned : !!node?.pinned,
      enabled: graphNodes.every(Boolean),
      run: async () => {
        for (const n of graphNodes)
          if (n && (!multiple || n.pinned === allPinned))
            await request("pin", { iri: n.iri });
      },
    },
    null,
    {
      label: "Details",
      key: "T",
      enabled: !multiple && !!entity,
      run: () => editEntity(iri),
    },
    {
      label: "Rename",
      key: "R",
      enabled: !multiple && !!entity && iri !== THING,
      run: () => startInlineRename(iri, { document: doc, panel: "hierarchy" }),
    },
    {
      label: "New subclass",
      enabled: !multiple,
      key: "N",
      visible: isClass,
      run: () => command("entity.createClass"),
    },
    {
      label: "New instance",
      enabled: !multiple,
      key: "I",
      visible: isClass,
      run: () => command("entity.createIndividual"),
    },
    null,
    {
      label: "Analyze",
      enabled: !multiple,
      key: "A",
      visible: isClass,
      run: () => {},
      children: [
        {
          label: "Sparsity",
          key: "S",
          enabled: !iri.startsWith("_:"),
          run: () => openSparsity(iri),
        },
      ],
    },
    {
      label: "Find",
      key: "F",
      run: () => {},
      children: [
        {
          label: "Similar",
          key: "S",
          enabled: !multiple && (!!entity || !!node),
          run: () => openSimilar(entity?.name || node?.label || iri, iri),
        },
        {
          label: "Synonyms",
          key: "Y",
          enabled: canSuggest("synonyms"),
          run: () => suggest("synonyms"),
        },
        {
          label: "Touchpoints",
          key: "T",
          enabled: !multiple && !iri.startsWith("_:"),
          run: () => command("touchpoints.open"),
        },
        {
          label: "Instances",
          enabled: allClass,
          key: "I",
          visible: !!taxonomy && isClass,
          run: () =>
            multiple ? suggest("instances") : taxonomy?.("instances"),
        },
      ],
    },
    {
      label: "Suggest",
      key: "G",
      visible: !!entity,
      run: () => {},
      children: [
        {
          label: "Add Children",
          enabled: allClass,
          key: "C",
          run: () => suggest("children"),
        },
        {
          label: "Add Parents",
          enabled: allClass,
          key: "P",
          run: () => suggest("parents"),
        },
        {
          label: "Define New",
          enabled: !multiple,
          key: "N",
          run: () => openTaxonomy(iri, "define"),
        },
      ],
    },
    null,
    {
      label: multiple ? "Copy IRIs" : "Copy IRI",
      key: "C",
      run: () => window.axiom.copy(iris.join("\r\n")),
    },
    null,
    {
      label: "Delete class...",
      key: "D",
      visible: isClass,
      enabled: !multiple && iri !== THING,
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
