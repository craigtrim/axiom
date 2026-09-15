import { readFile, writeFile, mkdir, rename, copyFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { QueryAssistantResponse } from "../shared/query-assistant";
import {
  queryTitle,
  queryResultId,
  type QueryResultDocument,
  type QueryEntry,
  type QueryEntrySummary,
  type QueryHistoryAction,
  type QueryHistoryData,
  type QueryHistoryView,
} from "../shared/query-history";
import { sameQueryContent } from "../domain/query-format";
export class QueryHistoryService {
  readonly session = randomUUID();
  private data?: QueryHistoryData;
  private loading?: Promise<void>;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private file: string,
    private initialText: () => string,
    private publish: (view: QueryHistoryView) => void = () => {},
  ) {}
  private async ready() {
    return (this.loading ??= (async () => {
      try {
        const raw = await readFile(this.file, "utf8");
        if (raw.length > 50000000)
          throw Error("Query history exceeds the 50 MB storage limit.");
        const data = JSON.parse(raw) as QueryHistoryData;
        if (
          data.version !== 1 ||
          !Number.isInteger(data.revision) ||
          !Array.isArray(data.entries) ||
          !data.entries.length ||
          data.entries.some(
            (e) =>
              !e ||
              typeof e.id !== "string" ||
              typeof e.text !== "string" ||
              typeof e.title !== "string" ||
              !Number.isInteger(e.editVersion),
          ) ||
          new Set(data.entries.map((e) => e.id)).size !== data.entries.length ||
          !data.entries.some((e) => e.id === data.activeId)
        )
          throw Error(
            "Query history is invalid. The existing file has been kept.",
          );
        data.results ??= [];
        for (const e of data.entries) {
          if (
            e.lastRun &&
            !data.results.some((r) => r.id === queryResultId(e.lastRun!))
          )
            data.results.push({
              ...this.resultDocument(e, e.lastRun, data.results.length + 1),
              completedAt: "",
            });
        }
        data.results.forEach((r, i) => {
          r.sequence ??= i + 1;
        });
        this.data = data;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          this.loading = undefined;
          throw error;
        }
        const entry = this.entry(this.initialText(), "manual", "", "");
        this.data = {
          version: 1,
          revision: 0,
          activeId: entry.id,
          entries: [entry],
        };
      }
    })());
  }
  private entry(
    text: string,
    source: QueryEntry["source"],
    origin: string,
    namespace: string,
    title?: string,
  ): QueryEntry {
    if (typeof text !== "string" || text.length > 100000)
      throw Error(
        "A query can contain up to 100,000 characters. Your existing queries have been kept.",
      );
    const time = new Date().toISOString();
    return {
      id: randomUUID(),
      title: title?.slice(0, 160) || queryTitle(text),
      text,
      source,
      origin: origin.slice(0, 300),
      namespace: namespace.slice(0, 1000),
      createdAt: time,
      createdSession: this.session,
      updatedAt: time,
      editVersion: 0,
    };
  }
  private view(): QueryHistoryView {
    const d = this.data!;
    return {
      revision: d.revision,
      session: this.session,
      activeId: d.activeId,
      pendingId: d.pendingId,
      entries: d.entries.map((e) => this.summary(e)),
      current: d.entries.find((e) => e.id === d.activeId)!,
    };
  }
  private summary(e: QueryEntry): QueryEntrySummary {
    return {
      id: e.id,
      title: e.title,
      source: e.source,
      origin: e.origin,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
      preview: e.text.replace(/\s+/g, " ").slice(0, 180),
      rows: e.lastRun?.summary.rowCount,
    };
  }
  async load() {
    await this.ready();
    await this.queue.catch(() => {});
    return this.view();
  }
  private resultDocument(
    e: QueryEntry,
    run: NonNullable<QueryEntry["lastRun"]>,
    sequence: number,
  ): QueryResultDocument {
    return {
      id: queryResultId(run),
      sequence,
      queryId: e.id,
      title: run.title ?? e.title,
      completedAt: new Date().toISOString(),
      origin: run.origin ?? e.origin,
      namespace: run.namespace ?? e.namespace,
      run: { ...structuredClone(run), queryKey: run.queryKey ?? e.id },
    };
  }
  async result(id: string) {
    await this.ready();
    await this.queue.catch(() => {});
    return structuredClone(
      this.data!.results?.find((r) => r.id === id) ?? null,
    );
  }
  async search(text: string) {
    await this.ready();
    await this.queue.catch(() => {});
    if (typeof text !== "string" || text.length > 1000)
      throw Error("Search text is too long.");
    const q = text.toLocaleLowerCase();
    return this.data!.entries.filter((e) =>
      (e.title + "\n" + e.text + "\n" + e.origin)
        .toLocaleLowerCase()
        .includes(q),
    ).map((e) => this.summary(e));
  }
  private change(fn: (d: QueryHistoryData) => void): Promise<QueryHistoryView> {
    const task = this.queue
      .catch(() => {})
      .then(async () => {
        await this.ready();
        const before = this.data!;
        const draft = structuredClone(before);
        fn(draft);
        draft.revision++;
        const text = JSON.stringify(draft);
        if (text.length > 50000000)
          throw Error(
            "Query history is full (50 MB). No older queries were deleted.",
          );
        await mkdir(path.dirname(this.file), { recursive: true });
        const temp = this.file + ".tmp";
        await writeFile(temp, text, "utf8");
        try {
          await copyFile(this.file, this.file + ".bak");
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
        for (let attempt = 0; ; attempt++) {
          try {
            await rename(temp, this.file);
            break;
          } catch (error) {
            if (
              attempt >= 4 ||
              !["EPERM", "EBUSY", "EACCES"].includes(
                (error as NodeJS.ErrnoException).code ?? "",
              )
            )
              throw error;
            await new Promise((r) => setTimeout(r, 25 * (attempt + 1)));
          }
        }
        this.data = draft;
        const view = this.view();
        this.publish(view);
        return view;
      });
    this.queue = task;
    return task;
  }
  apply(action: QueryHistoryAction) {
    return this.change((d) => {
      if (!action || typeof action !== "object")
        throw Error("Invalid query history action.");
      if (action.type === "add") {
        const e = this.entry(
          action.text,
          action.source ?? "manual",
          action.origin,
          action.namespace,
          action.title,
        );
        d.entries.push(e);
        d.activeId = e.id;
        d.pendingId = undefined;
        return;
      }
      if (action.type === "open-run") {
        const result = d.results?.find((r) => r.id === action.resultId);
        if (!result)
          throw Error("The saved query for these results could not be found.");
        let source =
          d.entries.find(
            (e) =>
              e.id === result.queryId &&
              sameQueryContent(e.text, result.run.text),
          ) ??
          d.entries.find(
            (e) =>
              e.restoredRunId === result.id &&
              sameQueryContent(e.text, result.run.text),
          );
        if (!source) {
          source = this.entry(
            result.run.text,
            "manual",
            result.origin,
            result.namespace,
            result.title,
          );
          source.restoredRunId = result.id;
          source.lastRun = structuredClone(result.run);
          d.entries.push(source);
        }
        d.activeId = source.id;
        if (d.pendingId === source.id) d.pendingId = undefined;
        return;
      }
      const e = d.entries.find((e) => e.id === action.id);
      if (!e) throw Error("Query not found in history.");
      if (action.type === "select") {
        d.activeId = e.id;
        if (d.pendingId === e.id) d.pendingId = undefined;
        if (
          action.pendingId &&
          d.entries.some((q) => q.id === action.pendingId)
        )
          d.pendingId = action.pendingId;
      } else if (action.type === "edit") {
        if (typeof action.text !== "string" || action.text.length > 100000)
          throw Error(
            "A query can contain up to 100,000 characters. The editor text is still available.",
          );
        if (e.text !== action.text) {
          e.text = action.text;
          e.editVersion++;
          e.updatedAt = new Date().toISOString();
          if (e.source === "manual") e.title = queryTitle(e.text);
        }
        if (action.viewState !== undefined) e.viewState = action.viewState;
      } else if (action.type === "view") e.viewState = action.viewState;
      else if (action.type === "run") {
        if (
          action.run.session !== this.session ||
          typeof action.run.text !== "string" ||
          action.run.text.length > 100000 ||
          !Number.isInteger(action.run.summary?.id)
        )
          throw Error("Invalid query result reference.");
        const result = this.resultDocument(
          e,
          action.run,
          (d.results?.length ?? 0) + 1,
        );
        d.results ??= [];
        if (d.results.some((r) => r.id === result.id))
          throw Error("This query execution is already recorded.");
        d.results.push(result);
        e.lastRun = structuredClone(result.run);
      } else throw Error("Unknown query history action.");
    });
  }
  async baseline(id?: string) {
    const view = await this.load(),
      e = this.data!.entries.find((e) => e.id === (id ?? view.activeId));
    if (!e) throw Error("The source query is no longer available.");
    return { id: e.id, editVersion: e.editVersion };
  }
  async deliver(
    response: QueryAssistantResponse,
    baseline: { id: string; editVersion: number },
  ) {
    if (response.result.status !== "query" || !response.result.sparql)
      return this.load();
    return this.change((d) => {
      if (
        d.entries.some(
          (e) =>
            e.generation?.completedAt === response.completedAt &&
            e.generation.request.provider === response.request.provider,
        )
      )
        return;
      const e = this.entry(
        response.result.sparql,
        "agent",
        response.context.ontology,
        response.context.namespace,
        response.request.instructions,
      );
      // Keep the explanation and validation with its query, without retaining the full prompt/context on every page.
      e.generation = {
        ...response,
        context: { ...response.context, terms: [], predicates: [], types: [] },
      };
      d.entries.push(e);
      const origin = d.entries.find((e) => e.id === baseline.id);
      if (
        d.activeId === baseline.id &&
        origin?.editVersion === baseline.editVersion
      ) {
        d.activeId = e.id;
        d.pendingId = undefined;
      } else d.pendingId = e.id;
    });
  }
}
