import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { parseRdf, storeFromRdf } from "../src/domain/rdf-io";
import { textAnalysisContext } from "../src/domain/text-analysis-context";
import { MutatocClient, mutatocExecutable } from "../src/main/mutatoc-client";
import {
  textEntities,
  type MutatocToken,
  type TokenDictionaries,
} from "../src/main/text-analysis-spans";

const [input, output = "artifacts/text-analysis-benchmark.json", runtime] =
  process.argv.slice(2);
if (!input)
  throw Error(
    "Supply an ontology path, optional report path and optional mutatoc executable path.",
  );
const ontology = path.resolve(input);
const executable = runtime
  ? path.resolve(runtime)
  : mutatocExecutable(process.cwd(), "", false);
const hash = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const timings: { stage: string; milliseconds: number }[] = [];
async function measure<T>(
  stage: string,
  run: () => T | Promise<T>,
): Promise<T> {
  const start = performance.now();
  const result = await run();
  const milliseconds = Math.round((performance.now() - start) * 100) / 100;
  timings.push({ stage, milliseconds });
  console.log(`${stage}: ${milliseconds} ms`);
  return result;
}
const source = await readFile(ontology, "utf8");
const rdf = await measure("RDF import", () =>
  parseRdf(source, path.basename(ontology), pathToFileURL(ontology).href),
);
const store = await measure("Build store", () =>
  storeFromRdf(rdf.triples, path.basename(ontology)),
);
const context = await measure("Capture context", () =>
  textAnalysisContext(store, 1),
);
const client = new MutatocClient(executable, 600_000);
const results: {
  characters: number;
  iteration: number;
  outputSha256: string;
  spansSha256: string;
}[] = [];
try {
  await measure("Native load", () =>
    client.request({
      op: "load",
      turtle: context.turtle,
      name: context.name,
      class_based: true,
      interface: "data",
    }),
  );
  const dictionaries: TokenDictionaries = {
    contractions: await client.request({
      op: "lingpatlab",
      method: "dictionary",
      name: "d_enclictics",
    }),
    abbreviations: await client.request({
      op: "lingpatlab",
      method: "dictionary",
      name: "d_abbreviations",
    }),
  };
  const short =
    "community organizing is here. This is really a form of social justice activism. Combat lifesaver.";
  const paragraph =
    short +
    " Biology and chemistry are fields of science. Alice traveled to London in September. We study computer science and mathematics at the university.";
  await measure("First parse (includes model startup)", () =>
    client.request({ op: "parse", text: short }),
  );
  for (const text of [short, paragraph, Array(10).fill(paragraph).join("\n")]) {
    for (let iteration = 1; iteration <= 3; iteration++) {
      const name = `${text.length} characters, run ${iteration}`;
      const parsed = await measure(`Full parse: ${name}`, () =>
        client.request<{ text: string; tokens: MutatocToken[] }>({
          op: "parse",
          text,
        }),
      );
      const spans = await measure(`Map spans: ${name}`, () =>
        textEntities(text, parsed.tokens, dictionaries),
      );
      results.push({
        characters: text.length,
        iteration,
        outputSha256: hash(JSON.stringify(parsed)),
        spansSha256: hash(JSON.stringify(spans)),
      });
    }
    const tokens = await measure(
      `Tokenization: ${text.length} characters`,
      () => client.request<MutatocToken[]>({ op: "tokenize", text }),
    );
    await measure(`Prepared matching: ${text.length} characters`, () =>
      client.request({ op: "parse_tokens", tokens }),
    );
  }
} finally {
  client.close();
}
await mkdir(path.dirname(path.resolve(output)), { recursive: true });
await writeFile(
  output,
  JSON.stringify(
    {
      ontology,
      ontologySha256: hash(source),
      executable,
      executableSha256: hash(await readFile(executable)),
      triples: rdf.triples.length,
      timings,
      results,
    },
    null,
    2,
  ) + "\n",
);
