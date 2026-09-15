import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { FilePreviewService } from "../../src/main/file-preview-service";
import type { LinkedFile } from "../../src/shared/source";
const preview = { dataUrl: "data:image/png;base64,AAAA", width: 2, height: 2 };
const fixture = async (): Promise<LinkedFile> => {
  const dir = await mkdtemp(path.join(tmpdir(), "axiom-preview-test-")),
    file = path.join(dir, "image.png");
  await writeFile(file, "initial");
  return { iri: "urn:test", path: file, name: "image.png", image: true };
};
describe("thumbnail cache", () => {
  it("deduplicates requests and invalidates changed files", async () => {
    const file = await fixture();
    let calls = 0;
    const cache = new FilePreviewService(async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 10));
      return preview;
    });
    await Promise.all([
      cache.thumbnail(file),
      cache.thumbnail(file),
      cache.thumbnail(file),
    ]);
    expect(calls).toBe(1);
    await cache.thumbnail(file);
    expect(calls).toBe(1);
    await writeFile(file.path, "changed image contents");
    await cache.thumbnail(file);
    expect(calls).toBe(2);
  });
  it("bounds cache entries and concurrent decoders", async () => {
    const files = await Promise.all(Array.from({ length: 6 }, fixture));
    let active = 0,
      peak = 0,
      calls = 0;
    const cache = new FilePreviewService(
      async () => {
        calls++;
        peak = Math.max(peak, ++active);
        await new Promise((r) => setTimeout(r, 10));
        active--;
        return preview;
      },
      10000,
      2,
    );
    await Promise.all(files.map((f) => cache.thumbnail(f)));
    expect(peak).toBe(2);
    await cache.thumbnail(files[0]);
    expect(calls).toBe(7);
  });
  it("does not cache failures, changed-during-read images, or oversized previews", async () => {
    const file = await fixture();
    let calls = 0;
    const cache = new FilePreviewService(async () => {
      if (++calls === 1) {
        await writeFile(file.path, "changed while decoding");
        return preview;
      }
      return preview;
    }, 1);
    await expect(cache.thumbnail(file)).rejects.toThrow("changed");
    await cache.thumbnail(file);
    await cache.thumbnail(file);
    expect(calls).toBe(3);
    await expect(cache.thumbnail({ ...file, image: false })).rejects.toThrow(
      "file type",
    );
    await expect(
      cache.thumbnail({ ...file, path: file.path + ".missing" }),
    ).rejects.toThrow();
  });
});
