// craigtrim/axiom#207: reject changed downloads before replacing the runtime cache.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  ensureNodeRuntime,
  verifyNodeRuntime,
} from "../../scripts/setup-node-runtime.mjs";

const content = {
  "node.exe": Buffer.from("pinned executable fixture\r\n"),
  LICENSE: Buffer.from("runtime license fixture\n"),
};
const definition = {
  version: "22.23.4",
  platform: "win32",
  architecture: "x64",
  files: Object.entries(content).map(([name, bytes]) => ({
    name,
    url: "https://nodejs.example/fixture/" + name,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.length,
  })),
};
async function location(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "axiom-node-"));
  t.after(async () => {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith("axiom-node-"));
    await rm(root, { recursive: true, force: true });
  });
  return root;
}
const response = (bytes) => new Response(bytes, { status: 200 });
function download(url) {
  const name = new URL(url).pathname.split("/").at(-1);
  assert.ok(Object.hasOwn(content, name));
  return Promise.resolve(response(content[name]));
}
function setup(root, fetcher = download, extra = {}) {
  return ensureNodeRuntime({
    root,
    definition,
    platform: "win32",
    fetcher,
    ...extra,
  });
}

test("downloads a complete verified runtime and reuses it without network access", async (t) => {
  const root = await location(t);
  const directory = await setup(root);
  assert.equal(directory, path.join(root, "vendor", "node"));
  for (const [name, expected] of Object.entries(content))
    assert.deepEqual(await readFile(path.join(directory, name)), expected);
  const manifest = await verifyNodeRuntime(directory, { definition });
  assert.equal(manifest.version, definition.version);
  assert.deepEqual(Object.keys(manifest.files).sort(), ["LICENSE", "node.exe"]);
  assert.equal(
    await setup(root, () => {
      throw Error("A verified cache must not download files.");
    }),
    directory,
  );
});

test("a changed download leaves an existing cache untouched", async (t) => {
  const root = await location(t);
  const directory = path.join(root, "vendor", "node");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "node.exe"), "previous executable");
  await writeFile(path.join(directory, "LICENSE"), "previous license");
  await assert.rejects(
    setup(root, async () => response("unexpected downloaded bytes")),
    /download checksum mismatch: node\.exe/,
  );
  assert.equal(
    await readFile(path.join(directory, "node.exe"), "utf8"),
    "previous executable",
  );
  assert.equal(
    await readFile(path.join(directory, "LICENSE"), "utf8"),
    "previous license",
  );
  assert.deepEqual(await readdir(path.join(root, "vendor")), ["node"]);
});

test("a failed license download cannot expose a partially installed runtime", async (t) => {
  const root = await location(t);
  await assert.rejects(
    setup(root, async (url) =>
      url.endsWith("LICENSE")
        ? new Response("unavailable", { status: 503 })
        : download(url),
    ),
    /download failed: 503 LICENSE/,
  );
  assert.deepEqual(await readdir(path.join(root, "vendor")), []);
});

test("a modified cached executable is replaced from verified release bytes", async (t) => {
  const root = await location(t);
  const directory = await setup(root);
  await writeFile(
    path.join(directory, "node.exe"),
    "changed cached executable",
  );
  let downloads = 0;
  await setup(root, (url) => {
    downloads++;
    return download(url);
  });
  assert.equal(downloads, 2);
  assert.deepEqual(
    await readFile(path.join(directory, "node.exe")),
    content["node.exe"],
  );
  await verifyNodeRuntime(directory, { definition });
  assert.deepEqual(await readdir(path.join(root, "vendor")), ["node"]);
});

test("changing both cache bytes and its manifest cannot replace the pinned checksum", async (t) => {
  const root = await location(t);
  const directory = await setup(root);
  const manifestFile = path.join(directory, "package-manifest.json");
  const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
  const changed = Buffer.from("changed executable");
  await writeFile(path.join(directory, "node.exe"), changed);
  manifest.files["node.exe"] = {
    bytes: changed.length,
    sha256: createHash("sha256").update(changed).digest("hex"),
  };
  await writeFile(manifestFile, JSON.stringify(manifest));
  await assert.rejects(
    verifyNodeRuntime(directory, { definition }),
    /checksum mismatch: node\.exe/,
  );
});

for (const entry of ["unverified.dll", "unverified-directory/payload.dll"]) {
  test(`rejects ${entry} and replaces it only after a verified download`, async (t) => {
    const root = await location(t);
    const directory = await setup(root);
    const extra = path.join(directory, entry);
    await mkdir(path.dirname(extra), { recursive: true });
    await writeFile(extra, "unverified runtime payload");
    await assert.rejects(
      verifyNodeRuntime(directory, { definition }),
      /contains unverified files/,
    );
    await assert.rejects(
      setup(root, async () => response("changed download")),
      /download checksum mismatch/,
    );
    // A failed repair preserves the entire previous cache for inspection.
    assert.equal(await readFile(extra, "utf8"), "unverified runtime payload");
    assert.deepEqual(
      await readFile(path.join(directory, "node.exe")),
      content["node.exe"],
    );
    assert.deepEqual(await readdir(path.join(root, "vendor")), ["node"]);
    let downloads = 0;
    await setup(root, (url) => {
      downloads++;
      return download(url);
    });
    assert.equal(downloads, 2);
    assert.deepEqual((await readdir(directory)).sort(), [
      "LICENSE",
      "node.exe",
      "package-manifest.json",
    ]);
    await verifyNodeRuntime(directory, { definition });
    assert.deepEqual(await readdir(path.join(root, "vendor")), ["node"]);
  });
}

test("rejects an unsupported platform before creating or downloading runtime files", async (t) => {
  const root = await location(t);
  await assert.rejects(
    setup(
      root,
      () => {
        throw Error("Unexpected download");
      },
      { platform: "linux" },
    ),
    /targets Windows x64/,
  );
  assert.deepEqual(await readdir(root), []);
});

test("rejects a runtime definition that could write outside its staging directory", async (t) => {
  const root = await location(t);
  const unsafe = {
    ...definition,
    files: definition.files.map((file) =>
      file.name === "node.exe" ? { ...file, name: "../node.exe" } : file,
    ),
  };
  await assert.rejects(
    setup(root, download, { definition: unsafe }),
    /Invalid Node runtime definition/,
  );
  assert.deepEqual(await readdir(root), []);
});
