import { createRoot } from "react-dom/client";
import { useEffect, useRef, useState } from "react";
import { AdaptivePane } from "../../../src/renderer/AdaptivePane";
import {
  SuggestionWorkbench,
  type SuggestionWorkbenchProps,
} from "../../../src/renderer/SuggestionWorkbench";
import { ChildSuggestionDetails } from "../../../src/renderer/AddChildrenSuggestions";
import type { ChildSuggestion } from "../../../src/renderer/add-children-model";
import type { Entity } from "../../../src/domain/model";
import type { SuggestionSort } from "../../../src/renderer/suggestion-workbench-model";
import type { TaxonomyContext } from "../../../src/shared/taxonomy-assistant";

// Deterministic service boundary around production components (craigtrim/axiom#82).
type Item = {
  id: string;
  label: string;
  def: string;
  rationale: string;
  status: ChildSuggestion["status"];
  iri: string;
};
type Run = { id: string; at: string; assistant: string; items: Item[] };
type Target = {
  label: string;
  analysis: string[];
  context: Record<string, { n: number; detail: string }>;
  runs: Run[];
};
declare global {
  interface Window {
    fixtureTargets: Target[];
    configureSuggestions: (
      overrides: Partial<SuggestionWorkbenchProps<ChildSuggestion>>,
    ) => void;
    suggestionCalls: { bypass: (boolean | undefined)[]; applied: number[][] };
  }
}
function Harness() {
  const [targets, setTargets] = useState(window.fixtureTargets);
  const [targetIndex, setTargetIndex] = useState(0);
  const [runId, setRunId] = useState(targets[0].runs[0].id);
  const [provider, setProvider] = useState<"claude" | "codex">("claude");
  const [overrides, configure] = useState<
    Partial<SuggestionWorkbenchProps<ChildSuggestion>>
  >({});
  const [running, setRunning] = useState(false);
  const sorts = useRef(new Map<string, SuggestionSort>());
  const target = targets[targetIndex],
    run = target.runs.find((r) => r.id === runId)!;
  useEffect(() => {
    window.configureSuggestions = configure;
    window.suggestionCalls = { bypass: [], applied: [] };
  }, []);
  const iri = (label: string) =>
    "axiom:" +
    label
      .replace(/[^A-Za-z0-9]+/g, " ")
      .split(" ")
      .filter(Boolean)
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join("");
  const existsNote =
    "An entity with this label or normalized name already exists. It will not be duplicated or moved.";
  const items: ChildSuggestion[] = run.items.map((it, index) => ({
    ...it,
    index,
    definition: it.def,
    reason: it.rationale,
    parentIri: iri(target.label),
    kind: "class",
    issue: it.status === "exists" ? existsNote : null,
  }));
  return (
    <AdaptivePane
      name="Suggestions"
      paneId="taxonomy"
      shared
      maximize={() => {
        document.querySelector<HTMLElement>("#host")!.style.cssText =
          "width:100%;height:100%";
      }}
    >
      <SuggestionWorkbench
        mode="children"
        name={target.label}
        targetIri={iri(target.label)}
        items={items}
        summary={target.analysis.join("\n\n")}
        context={
          <dl className="ac-context-counts">
            {Object.entries(target.context).map(([name, value]) => (
              <div key={name}>
                <dt>{name}</dt>
                <dd>
                  <b>{value.n}</b> {value.detail}
                </dd>
              </div>
            ))}
          </dl>
        }
        renderDetails={(item) => (
          <ChildSuggestionDetails
            item={item}
            context={
              { ontology: { namespace: "axiom:" } } as Pick<
                TaxonomyContext,
                "ontology"
              >
            }
            entities={
              run.items
                .filter((it) => it.status === "exists")
                .map((it) => ({
                  iri: iri(it.label),
                  name: it.label,
                })) as Entity[]
            }
          />
        )}
        entry={{
          id: runId,
          state: running ? "running" : "completed",
          provider,
        }}
        history={[...targets].reverse().flatMap((t) =>
          t.runs.map((r) => ({
            id: r.id,
            iri: iri(t.label),
            label: t.label,
            startedAt: Date.parse(r.at),
            state: "completed" as const,
            provider: "claude" as const,
            count: r.items.length,
            applied: r.items.filter((i) => i.status === "added").length,
          })),
        )}
        runId={runId}
        provider={provider}
        setProvider={setProvider}
        loading={false}
        applying={false}
        activity={running}
        waiting={false}
        targetExists
        blocked=""
        drift=""
        error=""
        navigation={{
          sorts: sorts.current,
          modes: [
            { id: "children", name: "Add Children" },
            { id: "parents", name: "Add Parents" },
            { id: "synonyms", name: "Find Synonyms" },
            { id: "instances", name: "Find Instances" },
            { id: "define", name: "Define New" },
          ],
          changeMode: () => {},
          openAnother: () => {},
        }}
        selectRun={setRunId}
        selectTarget={(id, selected) => {
          const index = targets.findIndex((t) => iri(t.label) === id);
          setTargetIndex(index);
          setRunId(selected ?? targets[index].runs[0].id);
        }}
        generate={async (bypass) => {
          window.suggestionCalls.bypass.push(bypass);
          setRunning(true);
          await new Promise((resolve) => setTimeout(resolve, 20));
          const fresh = {
            ...run,
            id: "fresh",
            at: new Date().toLocaleString(),
            items: run.items.map((it) => ({
              ...it,
              status:
                it.status === "available"
                  ? ("available" as const)
                  : ("exists" as const),
            })),
          };
          setTargets((old) =>
            old.map((t, i) =>
              i === targetIndex ? { ...t, runs: [fresh, ...t.runs] } : t,
            ),
          );
          setRunId("fresh");
          setRunning(false);
        }}
        apply={async (indices) => {
          window.suggestionCalls.applied.push(indices);
          setTargets((old) =>
            old.map((t, i) =>
              i === targetIndex
                ? {
                    ...t,
                    runs: t.runs.map((r) =>
                      r.id === runId
                        ? {
                            ...r,
                            items: r.items.map((it, j) =>
                              indices.includes(j)
                                ? { ...it, status: "added" }
                                : it,
                            ),
                          }
                        : r,
                    ),
                  }
                : t,
            ),
          );
          return indices.length;
        }}
        {...overrides}
      />
    </AdaptivePane>
  );
}
createRoot(document.getElementById("host")!).render(<Harness />);
