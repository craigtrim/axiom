import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import {
  createConnection,
  createServer,
  type Server,
  type Socket,
} from "node:net";
import os from "node:os";
import path from "node:path";

export function workspaceFilePath(file: string): string {
  const absolute = path.resolve(file);
  let canonical: string;
  try {
    canonical = realpathSync.native(absolute);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const parent = path.dirname(absolute);
    canonical =
      parent === absolute
        ? absolute
        : path.join(workspaceFilePath(parent), path.basename(absolute));
  }
  return canonical;
}

export function workspaceIdentity(file: string): string {
  const canonical = workspaceFilePath(file);
  return process.platform === "win32" ? canonical.toLowerCase() : canonical;
}

export interface WorkspaceLease {
  release(): void;
}

/** An OS-owned pipe makes checking and reserving a file one atomic operation.
 * It disappears on process exit, including a crash, and doubles as a focus signal.
 * No stale PID file can grant two processes permission to autosave the same file.
 */
export class WorkspaceOwnership {
  private held = new Map<
    string,
    { server: Server; sockets: Set<Socket>; count: number }
  >();
  constructor(private focus: () => void) {}

  async claim(
    file: string,
    raiseOwner = true,
  ): Promise<WorkspaceLease | undefined> {
    const key = workspaceIdentity(file);
    let held = this.held.get(key);
    if (!held) {
      const digest = createHash("sha256")
        .update(os.homedir() + "\0" + key)
        .digest("hex");
      const address =
        process.platform === "win32"
          ? "\\\\.\\pipe\\axiom-workspace-" + digest
          : path.join(os.tmpdir(), "axiom-" + digest.slice(0, 32) + ".sock");
      const sockets = new Set<Socket>();
      const server = createServer((socket) => {
        sockets.add(socket);
        socket.on("error", () => {});
        socket.on("close", () => sockets.delete(socket));
        socket.setTimeout(2000, () => socket.destroy());
        socket.once("data", (data) => {
          if (data.toString() === "focus") this.focus();
          socket.end("owned");
        });
      });
      try {
        await new Promise<void>((resolve, reject) => {
          server.once("error", reject);
          server.listen(address, () => {
            server.removeListener("error", reject);
            resolve();
          });
        });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE") throw error;
        if (raiseOwner) await this.raise(address);
        return undefined;
      }
      held = { server, sockets, count: 0 };
      this.held.set(key, held);
    }
    held.count++;
    let released = false;
    return {
      release: () => {
        if (released) return;
        released = true;
        if (--held.count) return;
        for (const socket of held.sockets) socket.destroy();
        held.server.close();
        this.held.delete(key);
      },
    };
  }

  private raise(address: string) {
    return new Promise<void>((resolve) => {
      const socket = createConnection(address);
      const done = () => {
        socket.destroy();
        resolve();
      };
      socket.setTimeout(2000, done);
      socket.on("error", done);
      socket.on("data", done);
      socket.on("end", done);
      socket.on("connect", () => socket.write("focus"));
    });
  }
}
