import { auditStep, auditMetadata, auditId } from "./audit-log";
import { randomUUID } from "node:crypto";
import { TaxonomyHistory } from "./taxonomy-history";
import { LocalAssistantRunner, discoverAssistants } from "./local-assistant";
import { ModelCache, modelHash, type ModelCacheKey } from "./model-cache";
import { entityRandom } from "../domain/seeded-random";
import {
  buildTaxonomyPrompt,
  sampleTaxonomyContext,
  taxonomyDrift,
  parseTaxonomyReply,
  taxonomyMode,
  type TaxonomyContext,
  type TaxonomyHistoryEntry,
  type TaxonomyHistoryReview,
  type TaxonomyHistorySummary,
  type TaxonomyRequest,
  type TaxonomyResponse,
  type TaxonomyStatus,
  type TaxonomySuggestion,
} from "../shared/taxonomy-assistant";

export function canonicalTaxonomyContext(
  context: TaxonomyContext,
): TaxonomyContext {
  const copy = structuredClone(context);
  const term = (t: TaxonomyContext["selected"]) => {
    t.parents.sort();
    t.disjoint.sort();
    for (const restriction of [...t.restrictions, ...t.equivalents])
      restriction.fillers.sort();
    t.restrictions.sort((a, b) =>
      JSON.stringify(a).localeCompare(JSON.stringify(b)),
    );
    t.equivalents.sort((a, b) =>
      JSON.stringify(a).localeCompare(JSON.stringify(b)),
    );
  };
  [
    copy.selected,
    ...copy.ancestors,
    ...copy.descendants,
    ...(copy.childTerms ?? []),
  ].forEach(term);
  copy.ancestors.sort((a, b) => a.iri.localeCompare(b.iri));
  copy.descendants.sort((a, b) => a.iri.localeCompare(b.iri));
  copy.childTerms?.sort((a, b) => a.iri.localeCompare(b.iri));
  copy.directChildren.sort();
  copy.roots.sort();
  copy.ancestorLinks.sort((a, b) =>
    JSON.stringify(a).localeCompare(JSON.stringify(b)),
  );
  copy.descendantLinks.sort((a, b) =>
    JSON.stringify(a).localeCompare(JSON.stringify(b)),
  );
  copy.existingInstances
    .sort((a, b) => a.iri.localeCompare(b.iri))
    .forEach((t) => t.types.sort());
  if (copy.names)
    copy.names = Object.fromEntries(
      Object.entries(copy.names).sort(([a], [b]) => a.localeCompare(b)),
    );
  return copy;
}

export class TaxonomyAssistantService {
  private runner: LocalAssistantRunner;
  private current: TaxonomyStatus = { running: false };
  private cancelled = false;
  private applying = false;
  private historyStore: TaxonomyHistory;
  private session = randomUUID();
  constructor(
    root: string,
    private context: (input: TaxonomyRequest) => Promise<TaxonomyContext>,
    private validate: (
      context: TaxonomyContext,
      suggestions: TaxonomySuggestion[],
    ) => Promise<(string | null)[]>,
    private insert: (
      context: TaxonomyContext,
      suggestions: TaxonomySuggestion[],
    ) => Promise<string[]>,
    discover = discoverAssistants,
    timeoutMs = 300000,
    private cache = new ModelCache(),
    runner?: Pick<LocalAssistantRunner, "runWithMetadata" | "cancel">,
  ) {
    this.runner = new LocalAssistantRunner(root, discover, timeoutMs);
    if (runner) this.runner = runner as LocalAssistantRunner;
    this.historyStore = new TaxonomyHistory(root + "/history");
  }
  status() {
    return {
      ...this.current,
      cancelling: this.current.running && this.cancelled,
    };
  }
  cancel(id?: string) {
    if (id !== undefined && id !== this.current.id) return;
    this.cancelled = true;
    this.runner.cancel();
  }
  async run(input: TaxonomyRequest): Promise<TaxonomyResponse> {
    if (this.current.running || this.applying)
      throw Error("Taxonomy suggestions are already running.");
    if (
      !input ||
      typeof input.id !== "string" ||
      !input.id ||
      input.id.length > 100 ||
      typeof input.iri !== "string" ||
      !input.iri ||
      input.iri.length > 10000 ||
      !Number.isInteger(input.datasetEpoch) ||
      !Number.isInteger(input.version)
    )
      throw Error("Choose a class to find suggestions.");
    taxonomyMode(input.mode);
    const provider = input.provider ?? "claude";
    if (!["claude", "codex"].includes(provider))
      throw Error("Choose Claude or Codex.");
    this.current = {
      running: true,
      provider,
      id: input.id,
      startedAt: Date.now(),
      mode: input.mode,
    };
    this.cancelled = false;
    let entry: TaxonomyHistoryEntry | undefined;
    try {
      if (await this.historyStore.get(input.id))
        throw Error("This run ID is already in use.");
      auditStep("Preparing ontology context");
      const completeContext = canonicalTaxonomyContext(
        await this.context(input),
      );
      const context = sampleTaxonomyContext(
        completeContext,
        entityRandom(completeContext.selected.iri),
      );
      auditMetadata({
        entity: context.selected.label,
        iri: context.selected.iri,
        provider,
      });
      this.current = { ...this.current, activeEntity: context.selected.label };
      if (
        context.datasetEpoch !== input.datasetEpoch ||
        context.version !== input.version
      )
        throw Error("The ontology changed. Find suggestions again.");
      entry = {
        id: input.id,
        session: this.session,
        auditId: auditId(),
        provider,
        startedAt: this.current.startedAt!,
        state: "running",
        context,
        reviewContext: completeContext,
        prompt:
          buildTaxonomyPrompt(context) +
          "\n\nContext identity: " +
          modelHash(context.ontology.namespace + "\n" + context.selected.iri) +
          "\nContext fingerprint: " +
          modelHash(
            JSON.stringify({
              ...completeContext,
              version: undefined,
              datasetEpoch: undefined,
            }),
          ),
        applied: [],
      };
      await this.historyStore.put(entry);
      if (this.cancelled) throw Error("Taxonomy suggestions cancelled.");
      const key: ModelCacheKey = {
        purpose: input.mode === "children" ? "add-children" : "find-instances",
        entity: { label: context.selected.label, iri: context.selected.iri },
        ontology: context.ontology,
        provider,
        prompt: entry.prompt,
      };
      let completion = !input.bypassCache
        ? await this.cache.get(key)
        : undefined;
      if (completion) {
        try {
          parseTaxonomyReply(completion.reply, context);
        } catch {
          completion = undefined;
        }
      }
      const hit = !!completion;
      if (this.cancelled) throw Error("Taxonomy suggestions cancelled.");
      completion ??= await this.runner.runWithMetadata(
        provider,
        entry.prompt,
        null,
      );
      if (this.cancelled) throw Error("Taxonomy suggestions cancelled.");
      auditStep("Parsing taxonomy proposal");
      const result = parseTaxonomyReply(completion.reply, context);
      auditStep("Validating taxonomy suggestions");
      const issues = await this.validate(context, result.suggestions);
      if (this.cancelled) throw Error("Taxonomy suggestions cancelled.");
      if (!hit) await this.cache.put(key, completion, () => this.cancelled);
      if (this.cancelled) throw Error("Taxonomy suggestions cancelled.");
      const response = {
        cache: {
          hit,
          completedAt: completion.metadata.completedAt,
          model: completion.metadata.model,
        },
        provider,
        id: input.id,
        context,
        result,
        issues,
        completedAt: new Date().toISOString(),
      };
      await this.historyStore.put({
        ...entry,
        state: "completed",
        response,
        completedAt: response.completedAt,
      });
      this.current = { running: false, id: input.id, response };
      return response;
    } catch (e) {
      try {
        if (entry)
          await this.historyStore.put({
            ...entry,
            state: this.cancelled ? "cancelled" : "failed",
            error: (e as Error).message,
            completedAt: new Date().toISOString(),
          });
      } finally {
        this.current = {
          running: false,
          id: input.id,
          error: (e as Error).message,
        };
      }
      throw e;
    }
  }

  async history(): Promise<TaxonomyHistorySummary[]> {
    return (await this.historyStore.list()).map((e) => ({
      id: e.id,
      iri: e.context.selected.iri,
      label: e.context.selected.label,
      namespace: e.context.ontology.namespace,
      mode: e.context.mode,
      provider: e.provider,
      startedAt: e.startedAt,
      state: e.state,
      applied: e.applied.length,
      count: e.response?.result.suggestions.length ?? 0,
    }));
  }
  /**
   * Editing the ontology never invalidates a run on its own. Only a class that
   * has gone, or a different ontology, leaves nothing to add the suggestions to.
   */
  private async reviewContext(entry: TaxonomyHistoryEntry) {
    const original = entry.reviewContext ?? entry.context;
    let current: TaxonomyContext;
    try {
      current = await this.context({
        id: entry.id,
        iri: original.selected.iri,
        mode: original.mode,
        datasetEpoch: original.datasetEpoch,
        version: original.version,
      });
    } catch (e) {
      throw Error(
        "These suggestions have nowhere to go. " + (e as Error).message,
      );
    }
    if (
      current.ontology.namespace !== original.ontology.namespace ||
      (entry.session === this.session &&
        current.datasetEpoch !== original.datasetEpoch)
    )
      throw Error(
        "These suggestions belong to a different ontology. Start a new run.",
      );
    return current;
  }
  async read(id: string): Promise<TaxonomyHistoryReview> {
    const entry =
      typeof id === "string" ? await this.historyStore.get(id) : undefined;
    if (!entry)
      throw Error(
        "These suggestions are no longer available. Start a new run.",
      );
    let blocked = "",
      drift = "";
    try {
      drift = taxonomyDrift(
        entry.reviewContext ?? entry.context,
        await this.reviewContext(entry),
      );
    } catch (e) {
      blocked = (e as Error).message;
    }
    return { entry, blocked, drift };
  }
  async apply(id: string, indices: number[]) {
    if (this.current.running || this.applying)
      throw Error("Wait for the current suggestions to finish.");
    this.applying = true;
    try {
      const entry =
        typeof id === "string" ? await this.historyStore.get(id) : undefined;
      const response = entry?.response;
      if (!entry || !response)
        throw Error(
          "These suggestions are no longer available. Start a new run.",
        );
      if (
        !Array.isArray(indices) ||
        !indices.length ||
        indices.length > 12 ||
        new Set(indices).size !== indices.length ||
        indices.some(
          (i) =>
            !Number.isInteger(i) ||
            i < 0 ||
            i >= response.result.suggestions.length ||
            response.issues[i] ||
            entry.applied.includes(i),
        )
      )
        throw Error("Select available suggestions.");
      const context = await this.reviewContext(entry);
      const suggestions = indices.map((i) => response.result.suggestions[i]);
      const issues = await this.validate(context, suggestions);
      if (issues.some(Boolean)) throw Error(issues.find(Boolean)!);
      const created = await this.insert(context, suggestions);
      const reviewContext = await this.context({
        id,
        iri: context.selected.iri,
        mode: context.mode,
        datasetEpoch: context.datasetEpoch,
        version: context.version,
      });
      await this.historyStore.put({
        ...entry,
        session: this.session,
        reviewContext,
        applied: [...entry.applied, ...indices],
      });
      return created;
    } finally {
      this.applying = false;
    }
  }
}
