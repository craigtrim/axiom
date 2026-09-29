// Development-only setup. Weights are never included in the application installer.
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Readable, Transform } from "node:stream";
import path from "node:path";
import { embeddingModel } from "../src/shared/embeddings";
import { embeddingModelDirectory } from "../src/main/embedding-paths";

const directory = embeddingModelDirectory();
const source = `https://huggingface.co/${embeddingModel.source}/resolve/${embeddingModel.revision}/`;
const response = await fetch(
  `https://huggingface.co/api/models/${embeddingModel.source}/revision/${embeddingModel.revision}?blobs=true`,
);
if (!response.ok) throw Error(`Cannot read model manifest: ${response.status}`);
const metadata = await response.json();
const names = [
  "config.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "special_tokens_map.json",
  "vocab.txt",
  "onnx/model.onnx",
];
await mkdir(directory, { recursive: true });
for (const name of names) {
  const file = metadata.siblings.find(
    (f: { rfilename: string }) => f.rfilename === name,
  );
  if (!file) throw Error(`Missing model file: ${name}`);
  const target = path.join(directory, name);
  const expected = file.lfs?.sha256 ?? file.blobId;
  const digest = async (filePath: string) => {
    const hash = createHash(file.lfs ? "sha256" : "sha1");
    if (!file.lfs) hash.update(`blob ${file.size}\0`);
    for await (const data of createReadStream(filePath)) hash.update(data);
    return hash.digest("hex");
  };
  if (name === "onnx/model.onnx" && expected !== embeddingModel.weightsSha256)
    throw Error("Unexpected model checksum.");
  if (
    await digest(target).then(
      (hash) => hash === expected,
      () => false,
    )
  ) {
    console.log(`Verified ${name}`);
    continue;
  }
  await mkdir(path.dirname(target), { recursive: true });
  const download = await fetch(source + name);
  if (!download.ok || !download.body)
    throw Error(`Download failed: ${name} (${download.status})`);
  let bytes = 0,
    reported = 0;
  const progress = new Transform({
    transform(chunk, _encoding, done) {
      bytes += chunk.length;
      if (bytes - reported > 50_000_000) {
        reported = bytes;
        console.log(
          `${name}: ${Math.round(bytes / 1_000_000)} / ${Math.round(file.size / 1_000_000)} MB`,
        );
      }
      done(null, chunk);
    },
  });
  const temporary = target + ".part";
  try {
    await pipeline(
      Readable.fromWeb(download.body as never),
      progress,
      createWriteStream(temporary),
    );
    if (bytes !== file.size || (await digest(temporary)) !== expected)
      throw Error(`Model verification failed: ${name}`);
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
  console.log(`Verified ${name}`);
}
await writeFile(
  path.join(directory, "axiom-model.json"),
  JSON.stringify(embeddingModel, null, 2),
);
console.log(`Full-precision MPNet ready: ${directory}`);
