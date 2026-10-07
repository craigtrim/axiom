import { createHash, randomUUID } from "node:crypto";
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  statSync,
} from "node:fs";
import path from "node:path";

function alive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

/** Only installation coordination is shared. Records never contain user settings.
 * A process withdraws after all its windows have finished saving, at will-quit.
 */
export class InstanceRegistry {
  private file: string;
  private directory: string;
  private installKey: string;
  private executableStamp: number | undefined;
  readonly updateDirectory: string;
  constructor(root: string, executable: string, profile: string) {
    this.directory = path.join(root, "running-instances");
    this.installKey = createHash("sha256")
      .update(executable.toLowerCase())
      .digest("hex");
    this.updateDirectory = path.join(root, "updates", this.installKey);
    try {
      this.executableStamp = statSync(executable).mtimeMs;
    } catch {}
    mkdirSync(this.directory, { recursive: true });
    this.file = path.join(
      this.directory,
      process.pid + "-" + randomUUID() + ".json",
    );
    writeFileSync(
      this.file,
      JSON.stringify({
        pid: process.pid,
        installKey: this.installKey,
        profile,
      }),
    );
    // Register before checking the installer gate. An installer election rechecks
    // registrations after taking that gate, closing the start-versus-exit race.
    const gate = path.join(this.directory, this.installKey + ".update");
    try {
      const previous = JSON.parse(readFileSync(gate, "utf8"));
      if (
        previous.executableStamp === this.executableStamp &&
        (alive(previous.pid) || Date.now() - previous.time < 120_000)
      )
        throw Error(
          "Axiom is installing an update. Try opening it again shortly.",
        );
      // Only startup removes expired gates, while its active registration prevents
      // any process from electing a new installer.
      try {
        unlinkSync(gate);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        this.leave();
        throw error;
      }
    }
  }

  leave() {
    try {
      unlinkSync(this.file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  private hasPeers() {
    // Retain a conservative answer on unreadable/partial registrations.
    for (const name of readdirSync(this.directory)) {
      if (!name.endsWith(".json")) continue;
      const file = path.join(this.directory, name);
      try {
        const record = JSON.parse(readFileSync(file, "utf8"));
        if (!Number.isInteger(record.pid) || record.pid <= 0) return true;
        if (record.installKey === this.installKey && alive(record.pid))
          return true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") return true;
      }
    }
    return false;
  }

  claimUpdate() {
    if (this.hasPeers()) return false;
    // Simultaneous final exits may both see no peers. Only one starts the installer.
    // The short grace period also covers the handoff after its parent process exits.
    const file = path.join(this.directory, this.installKey + ".update");
    try {
      writeFileSync(
        file,
        JSON.stringify({
          pid: process.pid,
          time: Date.now(),
          executableStamp: this.executableStamp,
        }),
        { flag: "wx" },
      );
      if (this.hasPeers()) {
        unlinkSync(file);
        return false;
      }
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
      throw error;
    }
  }
}
