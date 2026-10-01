import path from "node:path";
import { createHash } from "node:crypto";
import {
  atomicCacheFile,
  axiomCacheRoot,
  clearCacheDirectory,
  readCacheFile,
} from "./cache-files";
import {
  wikipediaHost,
  type TouchpointCandidate,
  type TouchpointProvider,
  type TouchpointSearchResult,
  type WikipediaError,
} from "../shared/touchpoints";

const hash = (text: string, length: number) =>
  createHash("sha256").update(text, "utf8").digest("hex").slice(0, length);
export const wikipediaQueryKey = (query: string) =>
  query.trim().replace(/\s+/g, " ").toLowerCase();
export function wikipediaEntityDirectory(iri: string) {
  let local =
    iri.slice(
      iri.lastIndexOf("#") >= 0
        ? iri.lastIndexOf("#") + 1
        : iri.lastIndexOf("/") + 1,
    ) || "entity";
  local = local
    .replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g, "_")
    .replace(/[. ]+$/, "");
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(local))
    local = "_" + local;
  local =
    [...local]
      .slice(0, 64)
      .join("")
      .replace(/[. ]+$/, "") || "entity";
  return local + "-" + hash(iri, 8);
}
function titlePath(title: string) {
  return encodeURIComponent(title.replaceAll(" ", "_"))
    .replaceAll("%3A", ":")
    .replaceAll("%2F", "/");
}
export function parseWikipediaResponse(input: unknown): TouchpointCandidate[] {
  const data = input as any;
  if (
    !data ||
    typeof data !== "object" ||
    data.error ||
    (!data.query && data.batchcomplete !== true)
  )
    throw Error("Wikipedia returned an invalid response.");
  const pages = data.query?.pages ?? [];
  if (!Array.isArray(pages) || pages.length > 20)
    throw Error("Wikipedia returned an invalid page list.");
  const redirects = data.query?.redirects ?? [];
  if (
    !Array.isArray(redirects) ||
    redirects.length > 1000 ||
    redirects.some(
      (r: any) =>
        !r ||
        typeof r.from !== "string" ||
        typeof r.to !== "string" ||
        r.from.length > 512 ||
        r.to.length > 512,
    )
  )
    throw Error("Wikipedia returned invalid redirects.");
  const ids = new Set<number>();
  return pages
    .map((p: any): TouchpointCandidate => {
      if (
        !p ||
        !Number.isSafeInteger(p.pageid) ||
        p.pageid < 1 ||
        ids.has(p.pageid) ||
        typeof p.title !== "string" ||
        !p.title ||
        p.title.length > 512 ||
        !Number.isInteger(p.index) ||
        p.index < 1 ||
        p.index > 20 ||
        (p.description !== undefined && typeof p.description !== "string")
      )
        throw Error("Wikipedia returned an invalid page.");
      ids.add(p.pageid);
      const url = new URL(
        p.fullurl || `https://${wikipediaHost}/wiki/${titlePath(p.title)}`,
      );
      if (
        url.protocol !== "https:" ||
        url.hostname !== wikipediaHost ||
        url.username ||
        url.password ||
        url.port ||
        !url.pathname.startsWith("/wiki/") ||
        url.search ||
        url.hash
      )
        throw Error("Wikipedia returned an invalid page URL.");
      const item = p.pageprops?.wikibase_item;
      const names = new Set<string>([p.title]);
      for (let i = 0; i < redirects.length; i++)
        for (const redirect of redirects)
          if (typeof redirect.from === "string" && names.has(redirect.to))
            names.add(redirect.from);
      names.delete(p.title);
      return {
        id: String(p.pageid),
        label: p.title,
        description: (p.description ?? "").slice(0, 4000),
        iri: "http://dbpedia.org/resource/" + titlePath(p.title),
        url: url.href,
        rank: p.index,
        ...(typeof item === "string" && /^Q[1-9]\d*$/.test(item)
          ? { wikidataIri: "http://www.wikidata.org/entity/" + item }
          : {}),
        disambiguation:
          !!p.pageprops && Object.hasOwn(p.pageprops, "disambiguation"),
        redirects: [...names],
      };
    })
    .sort(
      (a: TouchpointCandidate, b: TouchpointCandidate) =>
        a.rank - b.rank || a.label.localeCompare(b.label),
    );
}
interface Entry {
  format: 1;
  entityIri: string;
  query: string;
  host: string;
  fetchedAt: string;
  result: TouchpointCandidate[];
}
interface Options {
  fetch: typeof globalThis.fetch;
  version: string;
  electronVersion: string;
  root?: string;
  now?: () => number;
  wait?: (milliseconds: number) => Promise<void>;
  timeoutMs?: number;
}
export class WikipediaClient implements TouchpointProvider {
  readonly id = "wikipedia";
  private root: string;
  private now: () => number;
  private wait: (milliseconds: number) => Promise<void>;
  private queue: Promise<unknown> = Promise.resolve();
  private until = 0;
  private previousWait = 0;
  private generation = 0;
  private writing: Promise<unknown> = Promise.resolve();
  constructor(private options: Options) {
    this.root = path.resolve(options.root ?? axiomCacheRoot());
    this.now = options.now ?? Date.now;
    this.wait =
      options.wait ??
      ((ms) =>
        new Promise((resolve) =>
          setTimeout(resolve, Math.min(ms, 2_147_483_647)),
        ));
  }
  cacheFile(entityIri: string, query: string) {
    return path.join(
      this.root,
      "wikipedia",
      wikipediaEntityDirectory(entityIri),
      "search-" + hash(wikipediaQueryKey(query), 10) + ".json",
    );
  }
  async clear() {
    ++this.generation;
    await this.writing;
    await clearCacheDirectory(this.root, "wikipedia");
  }
  private async cached(
    entityIri: string,
    query: string,
  ): Promise<Entry | undefined> {
    try {
      const raw = await readCacheFile(this.cacheFile(entityIri, query));
      if (!raw) return;
      const entry = JSON.parse(raw);
      if (
        entry.format !== 1 ||
        entry.entityIri !== entityIri ||
        typeof entry.query !== "string" ||
        wikipediaQueryKey(entry.query) !== wikipediaQueryKey(query) ||
        entry.host !== wikipediaHost ||
        typeof entry.fetchedAt !== "string" ||
        !Number.isFinite(Date.parse(entry.fetchedAt)) ||
        !Array.isArray(entry.result) ||
        entry.result.length > 20
      )
        return;
      // Reparse through the network boundary so corrupt cached candidates are misses.
      const result = parseWikipediaResponse({
        query: {
          pages: entry.result.map((c: TouchpointCandidate) => ({
            pageid: Number(c.id),
            title: c.label,
            description: c.description,
            index: c.rank,
            fullurl: c.url,
            pageprops: {
              ...(c.disambiguation ? { disambiguation: "" } : {}),
              ...(c.wikidataIri
                ? { wikibase_item: c.wikidataIri.split("/").pop() }
                : {}),
            },
          })),
          redirects: entry.result.flatMap((c: TouchpointCandidate) =>
            c.redirects.map((from) => ({ from, to: c.label })),
          ),
        },
      });
      if (JSON.stringify(result) !== JSON.stringify(entry.result)) return;
      return entry;
    } catch {
      return;
    }
  }
  async search(input: {
    entityIri: string;
    query: string;
    refresh?: boolean;
  }): Promise<TouchpointSearchResult> {
    if (
      !input ||
      typeof input.entityIri !== "string" ||
      !input.entityIri ||
      input.entityIri.length > 10000 ||
      typeof input.query !== "string" ||
      !input.query.trim() ||
      input.query.length > 500
    )
      throw Error(
        "Enter a Wikipedia query of at most 500 characters for an existing entity.",
      );
    const entry = await this.cached(input.entityIri, input.query);
    const fallback = entry
      ? {
          candidates: entry.result,
          fetchedAt: entry.fetchedAt,
          cached: true,
          stale: false,
        }
      : { candidates: [], cached: false, stale: false };
    if (entry && !input.refresh) return fallback;
    const generation = this.generation;
    const operation = this.queue
      .catch(() => {})
      .then(async (): Promise<TouchpointSearchResult> => {
        while (this.until > this.now())
          await this.wait(this.until - this.now());
        // Another queued search may have populated this entry while we waited.
        if (!input.refresh) {
          const newest = await this.cached(input.entityIri, input.query);
          if (newest)
            return {
              candidates: newest.result,
              fetchedAt: newest.fetchedAt,
              cached: true,
              stale: false,
            };
        }
        const controller = new AbortController();
        const timer = setTimeout(
          () => controller.abort(),
          this.options.timeoutMs ?? 15000,
        );
        const fail = (error: WikipediaError): TouchpointSearchResult => ({
          ...fallback,
          stale: !!entry,
          error,
        });
        const throttled = (header: string | null) => {
          const seconds =
            header && /^\d+(?:\.\d+)?$/.test(header.trim())
              ? +header
              : header
                ? (Date.parse(header) - this.now()) / 1000
                : 5;
          const wait = Math.max(
            Number.isFinite(seconds) ? Math.ceil(seconds) : 5,
            this.previousWait * 2,
            1,
          );
          this.previousWait = wait;
          this.until = this.now() + wait * 1000;
          return fail({
            kind: "rate-limit",
            message: `Wikipedia asked Axiom to wait ${wait} seconds.`,
            waitSeconds: wait,
            retryAt: new Date(this.until).toISOString(),
            status: 429,
          });
        };
        try {
          const url = new URL(`https://${wikipediaHost}/w/api.php`);
          url.search = new URLSearchParams({
            action: "query",
            generator: "search",
            gsrsearch: input.query.trim(),
            gsrlimit: "20",
            prop: "pageprops|description|info",
            ppprop: "wikibase_item|disambiguation",
            inprop: "url",
            redirects: "1",
            format: "json",
            formatversion: "2",
          }).toString();
          const response = await this.options.fetch(url, {
            signal: controller.signal,
            headers: {
              "User-Agent": `Axiom/${this.options.version} (https://github.com/craigtrim/axiom) Electron/${this.options.electronVersion}`,
              "Accept-Encoding": "gzip",
              Accept: "application/json",
            },
          });
          if (response.status === 429)
            return throttled(response.headers.get("Retry-After"));
          if (response.status !== 200) {
            this.previousWait = 0;
            return fail({
              kind: "http",
              status: response.status,
              message: `Wikipedia returned HTTP ${response.status}.`,
            });
          }
          let candidates: TouchpointCandidate[];
          try {
            const text = await response.text();
            if (Buffer.byteLength(text) > 2_000_000)
              throw Error("Response exceeded the size limit.");
            const data = JSON.parse(text);
            if (data?.error?.code === "ratelimited")
              return throttled(response.headers.get("Retry-After"));
            this.previousWait = 0;
            candidates = parseWikipediaResponse(data);
          } catch (error) {
            if (controller.signal.aborted) throw error;
            this.previousWait = 0;
            return fail({
              kind: "invalid-response",
              message: "Wikipedia returned an invalid response.",
            });
          }
          this.previousWait = 0;
          const fetchedAt = new Date(this.now()).toISOString();
          if (generation === this.generation) {
            this.writing = atomicCacheFile(
              this.cacheFile(input.entityIri, input.query),
              JSON.stringify({
                format: 1,
                entityIri: input.entityIri,
                query: input.query,
                host: wikipediaHost,
                fetchedAt,
                result: candidates,
              } satisfies Entry),
            ).catch(() => {});
            await this.writing;
          }
          return { candidates, fetchedAt, cached: false, stale: false };
        } catch {
          this.previousWait = 0;
          return fail({
            kind: controller.signal.aborted ? "timeout" : "offline",
            message: controller.signal.aborted
              ? "Wikipedia did not respond within 15 seconds."
              : "Axiom could not reach Wikipedia. Check your connection and try again.",
          });
        } finally {
          clearTimeout(timer);
        }
      });
    this.queue = operation;
    return operation;
  }
}
