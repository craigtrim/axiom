import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { UpdateDownloadedEvent } from "electron-updater";

interface PendingInstaller {
  fromVersion: string;
  version: string;
  file: string;
  sha512: string;
}

/** Share only a completed, updater-verified NSIS download. A different instance
 * can validate and install it offline after the downloading instance exits.
 */
export class PendingUpdate {
  private file: string;
  constructor(directory: string) {
    this.file = path.join(directory, "pending.json");
  }

  async save(event: UpdateDownloadedEvent, fromVersion: string) {
    const installer = event.files.find((file) => /\.exe$/i.test(file.url));
    if (
      !installer?.sha512 ||
      !path.isAbsolute(event.downloadedFile) ||
      path.extname(event.downloadedFile).toLowerCase() !== ".exe"
    )
      throw Error("The downloaded update is not a complete Windows installer.");
    const pending: PendingInstaller = {
      fromVersion,
      version: event.version,
      file: event.downloadedFile,
      sha512: installer.sha512,
    };
    await mkdir(path.dirname(this.file), { recursive: true });
    const temporary = this.file + "." + randomUUID() + ".tmp";
    await writeFile(temporary, JSON.stringify(pending), "utf8");
    await rename(temporary, this.file);
  }

  async prepare(currentVersion: string) {
    let pending: PendingInstaller;
    try {
      pending = JSON.parse(await readFile(this.file, "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
    if (
      pending.fromVersion !== currentVersion ||
      pending.version === currentVersion
    )
      return undefined;
    if (
      typeof pending.file !== "string" ||
      !path.isAbsolute(pending.file) ||
      path.extname(pending.file).toLowerCase() !== ".exe" ||
      typeof pending.sha512 !== "string"
    )
      throw Error("Invalid pending update.");
    const hash = createHash("sha512");
    for await (const chunk of createReadStream(pending.file))
      hash.update(chunk);
    if (hash.digest("base64") !== pending.sha512)
      throw Error(
        "The pending update checksum no longer matches its download.",
      );
    return pending.file;
  }
}
