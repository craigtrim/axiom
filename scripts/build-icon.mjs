import { mkdir, writeFile } from "node:fs/promises";
const sizes = [16, 32, 48, 64, 256],
  images = [];
const distance = (x, y, ax, ay, bx, by) => {
  const t = Math.max(
    0,
    Math.min(
      1,
      ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) /
        ((bx - ax) ** 2 + (by - ay) ** 2),
    ),
  );
  return Math.hypot(x - ax - t * (bx - ax), y - ay - t * (by - ay));
};
for (const size of sizes) {
  const maskStride = Math.ceil(size / 32) * 4,
    buffer = Buffer.alloc(40 + size * size * 4 + maskStride * size);
  buffer.writeUInt32LE(40, 0);
  buffer.writeInt32LE(size, 4);
  buffer.writeInt32LE(size * 2, 8);
  buffer.writeUInt16LE(1, 12);
  buffer.writeUInt16LE(32, 14);
  buffer.writeUInt32LE(size * size * 4, 20);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const nx = (x + 0.5) / size,
        ny = (y + 0.5) / size,
        cornerX = Math.max(0.16 - nx, 0, nx - 0.84),
        cornerY = Math.max(0.16 - ny, 0, ny - 0.84),
        inside =
          nx > 0.04 &&
          nx < 0.96 &&
          ny > 0.04 &&
          ny < 0.96 &&
          Math.hypot(cornerX, cornerY) < 0.12;
      const letter =
        Math.min(
          distance(nx, ny, 0.28, 0.77, 0.5, 0.24),
          distance(nx, ny, 0.5, 0.24, 0.72, 0.77),
          distance(nx, ny, 0.38, 0.59, 0.62, 0.59),
        ) < 0.047;
      const at = 40 + ((size - 1 - y) * size + x) * 4;
      buffer[at] = letter ? 255 : 189;
      buffer[at + 1] = letter ? 255 : 108;
      buffer[at + 2] = letter ? 255 : 15;
      buffer[at + 3] = inside ? 255 : 0;
      if (!inside)
        buffer[40 + size * size * 4 + (size - 1 - y) * maskStride + (x >> 3)] |=
          128 >> (x % 8);
    }
  images.push(buffer);
}
const directory = Buffer.alloc(6 + 16 * sizes.length);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(sizes.length, 4);
let offset = directory.length;
images.forEach((b, i) => {
  const at = 6 + 16 * i;
  directory[at] = directory[at + 1] = sizes[i] === 256 ? 0 : sizes[i];
  directory.writeUInt16LE(1, at + 4);
  directory.writeUInt16LE(32, at + 6);
  directory.writeUInt32LE(b.length, at + 8);
  directory.writeUInt32LE(offset, at + 12);
  offset += b.length;
});
await mkdir("assets", { recursive: true });
await writeFile("assets/axiom.ico", Buffer.concat([directory, ...images]));
