// craigtrim/axiom#208: chunked sessions retain legacy bytes and recoverable atomic writes.
import { afterEach, expect, it } from "vitest";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SessionStore, type SavedSession } from "../../src/main/session-store";
import { buildEmptyStore, readWorkspace } from "../../src/domain/workspace";
const directories: string[] = [];
afterEach(async () => {
  for (const d of directories.splice(0))
    await rm(d, { recursive: true, force: true });
});
async function storage() {
  const d = await mkdtemp(path.join(os.tmpdir(), "axiom-session-"));
  directories.push(d);
  return new SessionStore(d);
}
function session(name = "Untitled ontology"): SavedSession {
  const s = buildEmptyStore();
  s.ontology.name = name;
  return {
    format: "axiom-session",
    version: 1,
    workbench: { version: 1, theme: "light" },
    workspace: {
      format: "axiom-workspace",
      version: 1,
      ontology: s.ontology,
      entities: [...s.entities.values()],
      tbox: s.tbox,
      individuals: [],
      customers: [],
      selected: null,
      graph: { iris: [], focus: [], pins: [], budget: 1000, layout: "auto" },
    },
  };
}
it("has no default demo or saved session in a fresh profile", async () => {
  const s = await storage();
  const r = await s.restore(async () => {
    throw Error("Unexpected restore");
  });
  expect(r.session).toBeUndefined();
  expect(r.errors).toEqual([]);
});
it("restores a serialized workspace and its empty selection", async () => {
  const s = await storage();
  await s.save(session());
  let applied = false;
  const r = await new SessionStore(path.dirname(s.file)).restore(
    async (saved) => {
      const w = readWorkspace(saved.workspace);
      expect(w.selected).toBeNull();
      expect(w.view.nodes.size).toBe(0);
      applied = true;
    },
  );
  expect(applied).toBe(true);
  expect(r.recovered).toBe(false);
});
it("serializes writes and preserves the preceding valid snapshot", async () => {
  const s = await storage();
  await Promise.all([
    s.save(session("First")),
    s.save(session("Second")),
    s.save(session("Last")),
  ]);
  expect(
    JSON.parse(await readFile(s.file, "utf8")).workspace.ontology.name,
  ).toBe("Last");
  expect(
    JSON.parse(await readFile(s.file + ".bak", "utf8")).workspace.ontology.name,
  ).toBe("Second");
});
it.each(["json", "workspace"])(
  "recovers a valid backup after invalid %s without poisoning it on save",
  async (mode) => {
    const s = await storage();
    await s.save(session("First"));
    await s.save(session("Second"));
    const invalid = session("Broken");
    invalid.workspace.entities = [];
    await writeFile(
      s.file,
      mode === "json" ? "broken {" : JSON.stringify(invalid),
    );
    const reopened = new SessionStore(path.dirname(s.file));
    const r = await reopened.restore(async (saved) => {
      readWorkspace(saved.workspace);
    });
    expect(r.recovered).toBe(true);
    expect(r.session?.workspace.ontology?.name).toBe("First");
    await reopened.save(session("Recovered"));
    expect(
      JSON.parse(await readFile(s.file + ".bak", "utf8")).workspace.ontology
        .name,
    ).toBe("First");
  },
);
it("returns no session when both saved copies are invalid", async () => {
  const s = await storage();
  await writeFile(s.file, "broken");
  await writeFile(s.file + ".bak", "broken");
  const r = await s.restore(async () => {});
  expect(r.session).toBeUndefined();
  expect(r.errors).toHaveLength(2);
});
// #162: missing named workspaces are intentionally skipped, including backup fallback.
it("opens empty when the current session is skipped even if a valid backup exists", async () => {
  const s = await storage();
  await s.save(session("Older workspace"));
  await s.save(session("Missing workspace"));
  const applied: string[] = [];
  const result = await s.restore(async (saved) => {
    applied.push(saved.workspace.ontology!.name);
    return false;
  });
  expect(applied).toEqual(["Missing workspace"]);
  expect(result).toEqual({ session: undefined, recovered: false, errors: [] });
});
it("skips a backup naming a missing workspace after a damaged current session", async () => {
  const s = await storage();
  await s.save(session("Missing workspace"));
  await s.save(session("Current"));
  await writeFile(s.file, "broken {");
  const result = await s.restore(async () => false);
  expect(result).toEqual({ session: undefined, recovered: false, errors: [] });
});
it("rejects a relative save path before writing", async () => {
  const s = await storage();
  expect(() =>
    s.save({ ...session(), workspacePath: "relative.axiom" }),
  ).toThrow(/Invalid saved session/);
});

it("captures queued session contents before the caller can mutate them", async () => {
  const s = await storage();
  const original = session("Before mutation");
  const pending = s.save(original);
  original.workspace.ontology!.name = "After mutation";
  original.workspace.tbox[0].object.value = "urn:changed";
  await pending;
  const saved = JSON.parse(await readFile(s.file, "utf8")) as SavedSession;
  expect(saved.workspace.ontology?.name).toBe("Before mutation");
  expect(saved.workspace.tbox[0].object.value).toBe(
    session().workspace.tbox[0].object.value,
  );
});

it("keeps the exact accepted legacy bytes as backup after recovery", async () => {
  const s = await storage();
  const raw =
    " \n" + JSON.stringify(session("Legacy \uD83D\uDE00"), null, 2) + "\n";
  await writeFile(s.file, '{"format":"axiom-session"');
  await writeFile(s.file + ".bak", raw);
  const reopened = new SessionStore(path.dirname(s.file));
  const result = await reopened.restore(async (saved) => {
    readWorkspace(saved.workspace);
  });
  expect(result.recovered).toBe(true);
  await reopened.save(session("Recovered"));
  expect(await readFile(s.file + ".bak", "utf8")).toBe(raw);
});

it("retains the last complete session through a failed write and retries in order", async () => {
  const s = await storage();
  await s.save(session("Accepted"));
  await mkdir(s.file + ".tmp");
  await expect(s.save(session("Failed"))).rejects.toThrow();
  expect(
    JSON.parse(await readFile(s.file, "utf8")).workspace.ontology.name,
  ).toBe("Accepted");
  await rm(s.file + ".tmp", { recursive: true });
  await s.save(session("Retry"));
  expect(
    JSON.parse(await readFile(s.file, "utf8")).workspace.ontology.name,
  ).toBe("Retry");
  expect(
    JSON.parse(await readFile(s.file + ".bak", "utf8")).workspace.ontology.name,
  ).toBe("Accepted");
  await expect(stat(s.file + ".tmp")).rejects.toMatchObject({ code: "ENOENT" });
  await expect(stat(s.file + ".bak.tmp")).rejects.toMatchObject({
    code: "ENOENT",
  });
});
