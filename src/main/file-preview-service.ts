import { stat } from "node:fs/promises";
import type { FilePreview, LinkedFile } from "../shared/source";

// Only user-requested thumbnails enter this cache. It never stores source bytes.
export class FilePreviewService {
  private cache = new Map<string, { preview: FilePreview; bytes: number }>();
  private pending = new Map<string, Promise<FilePreview>>();
  private bytes = 0;
  private active = 0;
  private waiting: (() => void)[] = [];
  constructor(
    private produce: (path: string) => Promise<FilePreview>,
    private maxBytes = 16 * 1024 * 1024,
    private maxEntries = 64,
  ) {}
  private async signature(path: string) {
    const s = await stat(path, { bigint: true });
    if (!s.isFile()) throw Error("This resource is not a regular file.");
    return [path, s.dev, s.ino, s.size, s.mtimeNs, s.ctimeNs].join("|");
  }
  async thumbnail(file: LinkedFile): Promise<FilePreview> {
    if (!file.image)
      throw Error("A thumbnail is not available for this file type.");
    const key = await this.signature(file.path);
    const cached = this.cache.get(key);
    if (cached) {
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached.preview;
    }
    const pending = this.pending.get(key);
    if (pending) return pending;
    const work = this.generate(file.path, key);
    this.pending.set(key, work);
    try {
      return await work;
    } finally {
      this.pending.delete(key);
    }
  }
  private async generate(path: string, key: string) {
    if (this.active >= 2) {
      if (this.waiting.length >= 32)
        throw Error("Thumbnail previews are busy. Try again shortly.");
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    } else this.active++;
    try {
      const preview = await this.produce(path);
      if (
        !preview.dataUrl.startsWith("data:image/png;base64,") ||
        preview.width <= 0 ||
        preview.height <= 0
      )
        throw Error("The image could not be previewed.");
      if ((await this.signature(path)) !== key)
        throw Error(
          "The file changed while its thumbnail was being created. Try again.",
        );
      const bytes = preview.dataUrl.length * 2;
      if (bytes <= this.maxBytes) {
        while (
          this.cache.size &&
          (this.bytes + bytes > this.maxBytes ||
            this.cache.size >= this.maxEntries)
        ) {
          const oldest = this.cache.keys().next().value!;
          this.bytes -= this.cache.get(oldest)!.bytes;
          this.cache.delete(oldest);
        }
        this.cache.set(key, { preview, bytes });
        this.bytes += bytes;
      }
      return preview;
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.active--;
    }
  }
}
