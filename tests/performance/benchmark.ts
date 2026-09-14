import { buildStore } from "../../src/domain/fixture";
import { Viewport } from "../../src/domain/viewport";
import { Layouts } from "../../src/domain/layouts";
import { executeQuery } from "../../src/domain/query";
import { NS, defaultFilter } from "../../src/domain/model";
import examples from "../../src/domain/data/examples.json";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
async function main() {
  const output: Record<string, unknown> = {
    host: {
      cpu: os.cpus()[0].model,
      memoryGB: os.totalmem() / 2 ** 30,
      platform: os.platform(),
      node: process.version,
    },
    measuredAt: new Date().toISOString(),
  };
  const samples = async <T>(f: () => T | Promise<T>, n = 7) => {
    const ms: number[] = [];
    let last: T | undefined;
    for (let i = 0; i < n + 1; i++) {
      const t = performance.now();
      last = await f();
      if (i) ms.push(performance.now() - t);
    }
    ms.sort((a, b) => a - b);
    return {
      p50: ms[Math.floor(n * 0.5)],
      p95: ms[Math.min(n - 1, Math.floor(n * 0.95))],
      samples: ms,
    };
  };
  output.generation100k = await samples(() => buildStore(100000), 5);
  const store = buildStore(100000);
  output.adjacency = await samples(() =>
    store.neighbours(NS.pizza + "Margherita"),
  );
  output.customersAdjacency = await samples(() =>
    store.neighbours(NS.demo + "Customer"),
  );
  output.tableFilter = await samples(() =>
    store.table({ ...defaultFilter, query: "shoreditch" }),
  );
  output.tableSort = await samples(() =>
    store.table({ ...defaultFilter, sort: "price", direction: -1 }),
  );
  const query: Record<string, unknown> = {};
  for (const size of [1000, 12000, 50000, 100000]) {
    const s = buildStore(size);
    const times = [];
    for (let i = 0; i < examples.length; i++)
      times.push({
        example: i + 1,
        ...(await samples(() => executeQuery(s, examples[i].Text), 5)),
      });
    query[size] = times;
  }
  output.queries = query;
  const view = new Viewport(store);
  view.setBudget(3000);
  view.seed([NS.pizza + "Margherita"]);
  const layouts = new Layouts(view, store);
  const layout: Record<string, unknown> = {};
  for (const mode of ["hierarchy", "radial", "grid"] as const) {
    layouts.choice = mode;
    layout[mode] = await samples(() => layouts.run());
  }
  layouts.choice = "force";
  layouts.run();
  let ticks = 0,
    t = performance.now();
  while (view.alpha >= 0.004) {
    layouts.force.step(true);
    ticks++;
  }
  layout.forceRest = {
    milliseconds: performance.now() - t,
    ticks,
    nodes: view.nodes.size,
  };
  output.layouts = layout;
  await mkdir("artifacts/benchmarks", { recursive: true });
  await writeFile(
    "artifacts/benchmarks/domain.json",
    JSON.stringify(output, null, 2),
  );
  console.log(JSON.stringify(output, null, 2));
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
