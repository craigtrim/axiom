import { beforeEach, afterEach } from "vitest";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
let directory: string, previous: string | undefined;
beforeEach(async () => {
  previous = process.env.AXIOM_CACHE_HOME;
  directory = path.join(tmpdir(), "axiom-cache-test-" + randomUUID());
  process.env.AXIOM_CACHE_HOME = directory;
});
afterEach(async () => {
  if (previous === undefined) delete process.env.AXIOM_CACHE_HOME;
  else process.env.AXIOM_CACHE_HOME = previous;
  if (
    directory &&
    path.dirname(path.resolve(directory)) === path.resolve(tmpdir()) &&
    path.basename(directory).startsWith("axiom-cache-test-")
  )
    await rm(directory, { recursive: true, force: true });
});
