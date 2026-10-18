// craigtrim/axiom#94: reset waits for partial evidence and keeps the chosen root and limits.
import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ProvenanceService } from "../../src/main/provenance-service";
const roots: string[] = [];
const services: ProvenanceService[] = [];
afterEach(async () => {
  for (const root of roots) await writeFile(path.join(root, "release"), "");
  for (const service of services.splice(0)) await service.reset();
  for (const root of roots.splice(0)) {
    if (
      path.dirname(root) !== path.resolve(os.tmpdir()) ||
      !path.basename(root).startsWith("axiom-provenance-test-")
    )
      throw Error("Unexpected test directory");
    await rm(root, { recursive: true, force: true });
  }
});
it("does not report Ready or start another worker before cancellation saves its evidence", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "axiom-provenance-test-"));
  roots.push(root);
  await writeFile(
    path.join(root, "provenance-worker.cjs"),
    String.raw`
    const {parentPort,workerData:d}=require('node:worker_threads'),fs=require('node:fs/promises'),path=require('node:path');
    (async()=>{await fs.mkdir(d.directory,{recursive:true});
      const s={id:d.id,status:'running',root:d.root,options:d.options,entries:1,files:0,directories:1,issues:0,observations:7,recent:[],rdfPath:path.join(d.directory,'provenance.nt')};
      parentPort.on('message',async()=>{
        parentPort.postMessage({...s,status:'cancelled'});
        while(!(await fs.stat(path.join(d.root,'release')).catch(()=>null)))await new Promise(r=>setTimeout(r,10));
        await fs.writeFile(s.rdfPath,'partial evidence');await fs.writeFile(path.join(d.directory,'summary.json'),JSON.stringify({...s,status:'cancelled'}));parentPort.close();
      });parentPort.postMessage(s);
    })();`,
  );
  const seen: string[] = [],
    service = new ProvenanceService(
      path.join(root, "collections"),
      root,
      root,
      (s) => seen.push(s.status),
    );
  services.push(service);
  service.select(root);
  const options = { readOffline: true, maxEntries: 15, timeoutSeconds: 17 };
  const running = service.start(options);
  await vi.waitFor(() => expect(service.status().entries).toBe(1));
  const resetting = service.reset();
  await vi.waitFor(() => expect(service.status().status).toBe("cancelled"));
  expect(() => service.start(options)).toThrow("already running");
  expect(() => service.select(root)).toThrow("Cancel the current");
  expect(seen.at(-1)).toBe("cancelled");
  await writeFile(path.join(root, "release"), "");
  await resetting;
  expect(service.status()).toMatchObject({
    status: "idle",
    root,
    options,
    entries: 0,
    recent: [],
  });
  expect(
    await readFile(
      path.join(root, "collections", running.id!, "provenance.nt"),
      "utf8",
    ),
  ).toBe("partial evidence");
  expect(
    JSON.parse(
      await readFile(
        path.join(root, "collections", running.id!, "summary.json"),
        "utf8",
      ),
    ).status,
  ).toBe("cancelled");
  expect(seen.at(-1)).toBe("idle");
  service.close();
});
