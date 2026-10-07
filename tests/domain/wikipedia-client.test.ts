import { describe, it, expect, vi } from "vitest";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  WikipediaClient,
  parseWikipediaResponse,
  wikipediaEntityDirectory,
  wikipediaQueryKey,
} from "../../src/main/wikipedia-client";

const fixture = JSON.parse(
  await readFile(
    new URL("../fixtures/wikipedia/sustainable-business.json", import.meta.url),
    "utf8",
  ),
);
const mercury = JSON.parse(
  await readFile(
    new URL("../fixtures/wikipedia/mercury.json", import.meta.url),
    "utf8",
  ),
);
const input = {
  entityIri: "https://example.org/#SustainableBusiness",
  query: "sustainable business",
};
function setup(
  responses: () => Promise<Response> = async () => Response.json(fixture),
) {
  const fetch = vi.fn(responses);
  const client = new WikipediaClient({
    fetch: fetch as typeof globalThis.fetch,
    version: "1.2.3",
    electronVersion: "44.3",
    root: process.env.AXIOM_CACHE_HOME,
  });
  return { fetch, client };
}
async function alter(client: WikipediaClient, change: (entry: any) => void) {
  const file = client.cacheFile(input.entityIri, input.query),
    entry = JSON.parse(await readFile(file, "utf8"));
  change(entry);
  await writeFile(file, JSON.stringify(entry));
}
it("parses recorded English Wikipedia generator responses in provider order", () => {
  for (const data of [fixture, mercury]) {
    const candidates = parseWikipediaResponse(data);
    expect(candidates).toHaveLength(20);
    expect(candidates.map((c) => c.rank)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
    for (const c of candidates) {
      expect(c.iri).toMatch(/^http:\/\/dbpedia.org\/resource\//);
      expect(c.url).toMatch(/^https:\/\/en.wikipedia.org\/wiki\//);
      expect(c.description).toBeTypeOf("string");
    }
  }
});
it("preserves redirect chains, distinguishes disambiguation and omits invalid Wikidata IDs", () => {
  const data = {
    query: {
      pages: [
        {
          pageid: 1,
          title: "Planet Mercury",
          index: 1,
          pageprops: { wikibase_item: "Q308" },
        },
        {
          pageid: 2,
          title: "Mercury",
          index: 2,
          pageprops: { disambiguation: "", wikibase_item: "bad" },
        },
      ],
      redirects: [
        { from: "Mercury planet", to: "Planet Mercury" },
        { from: "Hermes", to: "Mercury planet" },
      ],
    },
  };
  const parsed = parseWikipediaResponse(data);
  expect(parsed[0].redirects).toEqual(["Mercury planet", "Hermes"]);
  expect(parsed[0].wikidataIri).toBe("http://www.wikidata.org/entity/Q308");
  expect(parsed[1].disambiguation).toBe(true);
  expect(parsed[1].wikidataIri).toBeUndefined();
});
it("uses a single batched generator request with identification and compression", async () => {
  const { client, fetch } = setup();
  await client.search(input);
  const [url, options] = (
    fetch.mock.calls as unknown as [URL, RequestInit][]
  )[0];
  expect(url.origin).toBe("https://en.wikipedia.org");
  expect(Object.fromEntries(url.searchParams)).toEqual({
    action: "query",
    generator: "search",
    gsrsearch: input.query,
    gsrlimit: "20",
    prop: "pageprops|description|info",
    ppprop: "wikibase_item|disambiguation",
    inprop: "url",
    redirects: "1",
    format: "json",
    formatversion: "2",
  });
  expect(options.headers).toMatchObject({
    "User-Agent":
      "Axiom/1.2.3 (https://github.com/craigtrim/axiom) Electron/44.3",
    "Accept-Encoding": "gzip",
  });
});
it("reuses a years-old disk entry across clients with no expiry or network access", async () => {
  const { client } = setup();
  const first = await client.search(input);
  await alter(client, (e) => (e.fetchedAt = "2001-01-01T00:00:00.000Z"));
  const next = setup(async () => {
    throw Error("Network must not be used");
  });
  const result = await next.client.search(input);
  expect(result).toMatchObject({
    cached: true,
    stale: false,
    fetchedAt: "2001-01-01T00:00:00.000Z",
    candidates: first.candidates,
  });
  expect(next.fetch).not.toHaveBeenCalled();
});
it("shares trim, case and whitespace variants but isolates entities and queries", async () => {
  const { client, fetch } = setup();
  await client.search(input);
  expect(
    (await client.search({ ...input, query: "  SUSTAINABLE   Business  " }))
      .cached,
  ).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(1);
  await client.search({
    ...input,
    entityIri: "https://other.org/#SustainableBusiness",
  });
  await client.search({ ...input, query: "business ethics" });
  expect(fetch).toHaveBeenCalledTimes(3);
});
it("only explicit refresh replaces a saved result; failed refresh preserves it", async () => {
  const { client, fetch } = setup();
  const saved = await client.search(input);
  fetch.mockImplementationOnce(async () => {
    throw Error("offline");
  });
  expect(await client.search({ ...input, refresh: true })).toMatchObject({
    candidates: saved.candidates,
    cached: true,
    stale: true,
    error: { kind: "offline" },
  });
  expect((await client.search(input)).cached).toBe(true);
  fetch.mockImplementationOnce(async () => Response.json(mercury));
  expect((await client.search({ ...input, refresh: true })).candidates).toEqual(
    parseWikipediaResponse(mercury),
  );
  expect(fetch).toHaveBeenCalledTimes(3);
});
it("caches a valid empty search", async () => {
  const { client, fetch } = setup(async () =>
    Response.json({ batchcomplete: true }),
  );
  expect((await client.search(input)).candidates).toEqual([]);
  expect((await client.search(input)).cached).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(1);
});
it.each([
  ["format", (e: any) => (e.format = 2)],
  ["entity", (e: any) => (e.entityIri += "other")],
  ["query collision", (e: any) => (e.query = "other")],
  ["host", (e: any) => (e.host = "evil.example")],
  ["date", (e: any) => (e.fetchedAt = "invalid")],
  ["IRI", (e: any) => (e.result[0].iri = "https://evil.example/")],
  ["page URL", (e: any) => (e.result[0].url = "https://evil.example/")],
  ["result", (e: any) => (e.result = null)],
])("treats a corrupt %s cache field as a miss", async (_name, change) => {
  const { client, fetch } = setup();
  await client.search(input);
  await alter(client, change as (e: any) => void);
  expect((await client.search(input)).cached).toBe(false);
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("treats truncated cache files as misses and writes no leftover temporary files", async () => {
  const { client } = setup();
  await client.search(input);
  const file = client.cacheFile(input.entityIri, input.query);
  await writeFile(file, '{"format":');
  expect((await client.search(input)).cached).toBe(false);
  expect(await readdir(path.dirname(file))).toEqual([path.basename(file)]);
});
it.each([
  "CON",
  "con.txt",
  "PRN",
  "AUX",
  "NUL",
  "COM1",
  "LPT9",
  "a:b<c>d|e?f*g",
  "space. ",
  "..",
  "",
  "x".repeat(200),
])("creates a safe Windows directory for local name %j", (local) => {
  const iri = "https://example.org/#" + local,
    dir = wikipediaEntityDirectory(iri),
    name = dir.slice(0, -9);
  expect(name).not.toMatch(/[<>:"/\\|?*\x00-\x1f]/);
  expect(name).not.toMatch(/[. ]$/);
  expect([...name].length).toBeLessThanOrEqual(64);
  expect(dir.slice(-9)).toBe(
    "-" + createHash("sha256").update(iri).digest("hex").slice(0, 8),
  );
});
it("normalizes query filenames and keeps full IRI hashes", () => {
  const { client } = setup();
  expect(wikipediaQueryKey("  A\t B  ")).toBe("a b");
  expect(path.basename(client.cacheFile(input.entityIri, " A  B "))).toBe(
    "search-" +
      createHash("sha256").update("a b").digest("hex").slice(0, 10) +
      ".json",
  );
  expect(wikipediaEntityDirectory("https://a/#Thing")).not.toBe(
    wikipediaEntityDirectory("https://b/#Thing"),
  );
});
it("serializes different queries and coalesces simultaneous identical misses", async () => {
  let active = 0,
    maximum = 0;
  const { client, fetch } = setup(async () => {
    active++;
    maximum = Math.max(maximum, active);
    await new Promise((r) => setTimeout(r, 5));
    active--;
    return Response.json(fixture);
  });
  const results = await Promise.all([
    client.search(input),
    client.search(input),
    client.search({ ...input, query: "other" }),
  ]);
  expect(maximum).toBe(1);
  expect(fetch).toHaveBeenCalledTimes(2);
  // Concurrent disk lookups may finish in either order. Exactly one of the
  // identical requests fetches; the other consumes that cached response.
  expect(
    results
      .slice(0, 2)
      .map((result) => result.cached)
      .sort(),
  ).toEqual([false, true]);
  expect(results[2].cached).toBe(false);
});
it.each([null, "7", "Wed, 01 Jan 2025 00:00:09 GMT"])(
  "holds the shared queue for Retry-After %s and doubles consecutive throttles",
  async (header) => {
    let now = Date.parse("2025-01-01T00:00:00Z");
    const waits: number[] = [];
    const fetch = vi.fn(
      async () =>
        new Response("", {
          status: 429,
          headers: header ? { "Retry-After": header } : undefined,
        }),
    );
    const client = new WikipediaClient({
      fetch,
      version: "1",
      electronVersion: "1",
      now: () => now,
      wait: async (ms) => {
        waits.push(ms);
        now += ms;
      },
    });
    const first = await client.search(input);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(first.error?.kind).toBe("rate-limit");
    const seconds = header === "7" ? 7 : header ? 9 : 5;
    expect(first.error?.waitSeconds).toBe(seconds);
    const second = await client.search({ ...input, query: "next" });
    expect(waits).toEqual([seconds * 1000]);
    expect(second.error?.waitSeconds).toBe(seconds * 2);
    expect(fetch).toHaveBeenCalledTimes(2);
  },
);
it.each([400, 403, 404, 500, 503])(
  "returns a typed HTTP %i error without caching it",
  async (status) => {
    const { client, fetch } = setup(async () => new Response("no", { status }));
    expect((await client.search(input)).error).toMatchObject({
      kind: "http",
      status,
    });
    await client.search(input);
    expect(fetch).toHaveBeenCalledTimes(2);
  },
);
it.each(["{", "null", '{"query":{"pages":{}}}', "x".repeat(2_000_001)])(
  "rejects malformed or oversized response %#",
  async (text) => {
    const { client, fetch } = setup(async () => new Response(text));
    expect((await client.search(input)).error?.kind).toBe("invalid-response");
    await client.search(input);
    expect(fetch).toHaveBeenCalledTimes(2);
  },
);
it("aborts timed-out requests and does not cache them", async () => {
  const fetch = vi.fn(
    (_url: unknown, options?: RequestInit) =>
      new Promise<Response>((_resolve, reject) =>
        options!.signal!.addEventListener("abort", () =>
          reject(Error("aborted")),
        ),
      ),
  );
  const client = new WikipediaClient({
    fetch: fetch as typeof globalThis.fetch,
    version: "1",
    electronVersion: "1",
    timeoutMs: 5,
  });
  expect((await client.search(input)).error?.kind).toBe("timeout");
  await client.search(input);
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("clears only Wikipedia entries and prevents an in-flight response from repopulating them", async () => {
  let release!: (r: Response) => void;
  const { client } = setup(() => new Promise((r) => (release = r)));
  const other = path.join(process.env.AXIOM_CACHE_HOME!, "model");
  await mkdir(other, { recursive: true });
  await writeFile(path.join(other, "keep"), "yes");
  const pending = client.search(input);
  await vi.waitFor(() => expect(release).toBeTypeOf("function"));
  await client.clear();
  release(Response.json(fixture));
  await pending;
  await expect(
    readFile(client.cacheFile(input.entityIri, input.query)),
  ).rejects.toThrow();
  expect(await readFile(path.join(other, "keep"), "utf8")).toBe("yes");
});
