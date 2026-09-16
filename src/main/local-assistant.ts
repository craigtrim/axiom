import { spawn, type ChildProcess } from "node:child_process";
import {
  access,
  stat,
  readFile,
  writeFile,
  mkdir,
  mkdtemp,
  rm,
} from "node:fs/promises";
import path from "node:path";
import {
  researchSchema,
  type AssistantId,
  type AssistantInfo,
} from "../shared/research";
export interface AssistantCommand {
  id: AssistantId;
  file: string;
  args: string[];
  node?: boolean;
}
const exists = async (file: string) => {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
};
export async function discoverAssistants(
  env = process.env,
): Promise<AssistantCommand[]> {
  const result: AssistantCommand[] = [];
  for (const id of ["codex", "claude"] as const) {
    for (const directory of (env.PATH ?? env.Path ?? "")
      .split(path.delimiter)
      .filter(Boolean)) {
      const dir = directory.replace(/^"|"$/g, "");
      const native = path.join(
        dir,
        process.platform === "win32" ? id + ".exe" : id,
      );
      if (await exists(native)) {
        result.push({ id, file: native, args: [] });
        break;
      }
      if (id === "codex") {
        const entry = path.join(
          dir,
          "node_modules",
          "@openai",
          "codex",
          "bin",
          "codex.js",
        );
        if (await exists(entry)) {
          result.push({
            id,
            file: process.execPath,
            args: [entry],
            node: true,
          });
          break;
        }
      }
    }
  }
  return result;
}
export function assistantArguments(
  id: AssistantId,
  dir: string,
  web: boolean,
  schema: object | null = researchSchema,
) {
  if (id === "codex")
    return [
      "exec",
      "--sandbox",
      "read-only",
      "--skip-git-repo-check",
      "--ephemeral",
      "--ignore-user-config",
      "-C",
      dir,
      "-c",
      "features.shell_tool=false",
      "-c",
      "features.multi_agent=false",
      "-c",
      "features.skill_search=false",
      "-c",
      "features.skip_host_skill_discovery=true",
      "-c",
      'web_search="' + (web ? "live" : "disabled") + '"',
      ...(schema ? ["--output-schema", path.join(dir, "schema.json")] : []),
      "--output-last-message",
      path.join(dir, "result.json"),
      "-",
    ];
  return [
    "--print",
    "--output-format",
    "json",
    ...(schema ? ["--json-schema", JSON.stringify(schema)] : []),
    "--tools",
    web ? "WebSearch,WebFetch" : "",
    "--allowedTools",
    web ? "WebSearch,WebFetch" : "",
    "--strict-mcp-config",
    "--mcp-config",
    '{"mcpServers":{}}',
    "--no-session-persistence",
    "--setting-sources",
    "",
    "--settings",
    '{"disableAllHooks":true}',
    "--permission-mode",
    "dontAsk",
    "--permission-prompts",
    "none",
    "--max-turns",
    "12",
  ];
}
export class LocalAssistantRunner {
  private active?: { child?: ChildProcess; cancelled: boolean };
  constructor(
    private root: string,
    private discover = discoverAssistants,
    private timeoutMs = 300000,
  ) {
    this.root = path.resolve(root);
  }
  async assistants(): Promise<AssistantInfo[]> {
    const found = await this.discover();
    return (["codex", "claude"] as const).map((id) => ({
      id,
      name: id === "codex" ? "Codex" : "Claude",
      available: found.some((c) => c.id === id),
      path:
        found.find((c) => c.id === id)?.args[0] ??
        found.find((c) => c.id === id)?.file,
      message: found.some((c) => c.id === id)
        ? "Uses your existing CLI sign-in."
        : "Not found on PATH. Install and sign in, then refresh.",
    }));
  }
  cancel() {
    const job = this.active;
    if (!job) return;
    job.cancelled = true;
    if (job.child?.pid) {
      if (process.platform === "win32")
        spawn("taskkill.exe", ["/PID", String(job.child.pid), "/T", "/F"], {
          windowsHide: true,
          shell: false,
          stdio: "ignore",
        }).on("error", () => job.child?.kill());
      else job.child.kill("SIGTERM");
    }
  }
  async run(
    provider: AssistantId,
    prompt: string,
    schema: object | null,
    web = false,
  ): Promise<unknown> {
    if (this.active) throw Error("An assistant request is already running.");
    const job: { child?: ChildProcess; cancelled: boolean } = {
      cancelled: false,
    };
    this.active = job;
    let dir: string | undefined;
    try {
      const command = (await this.discover()).find((c) => c.id === provider);
      if (!command)
        throw Error("The selected assistant was not found on PATH.");
      await mkdir(this.root, { recursive: true });
      dir = await mkdtemp(path.join(this.root, "job-"));
      if (schema)
        await writeFile(
          path.join(dir, "schema.json"),
          JSON.stringify(schema),
          "utf8",
        );
      if (job.cancelled) throw Error("Assistant cancelled.");
      if (prompt.length > 150000)
        throw Error("The selected ontology context is too large.");
      const output = await new Promise<string>((resolve, reject) => {
        const child = spawn(
          command.file,
          [
            ...command.args,
            ...assistantArguments(command.id, dir!, web, schema),
          ],
          {
            cwd: dir,
            windowsHide: true,
            shell: false,
            stdio: ["pipe", "pipe", "pipe"],
            env: {
              ...process.env,
              ...(command.node ? { ELECTRON_RUN_AS_NODE: "1" } : {}),
            },
          },
        );
        job.child = child;
        let stdout = "",
          stderr = "",
          failure: Error | undefined;
        const timer = setTimeout(() => {
          failure = Error("Assistant timed out. Try a shorter request.");
          this.cancel();
        }, this.timeoutMs);
        child.stdout!.on("data", (data) => {
          stdout += data.toString();
          if (stdout.length > 2000000) {
            failure = Error("Assistant output exceeded the size limit.");
            this.cancel();
          }
        });
        child.stderr!.on("data", (data) => {
          stderr = (stderr + data.toString()).slice(-8000);
        });
        child.stdin!.on("error", () => {});
        child.on("error", (e) => {
          clearTimeout(timer);
          reject(e);
        });
        child.on("close", (code) => {
          clearTimeout(timer);
          if (failure) reject(failure);
          else if (job.cancelled) reject(Error("Assistant cancelled."));
          else if (code !== 0)
            reject(
              Error(
                "Assistant exited with code " +
                  code +
                  ". " +
                  stderr.slice(-1200),
              ),
            );
          else resolve(stdout);
        });
        child.stdin!.end(prompt);
      });
      let raw: unknown;
      if (command.id === "codex") {
        const file = path.join(dir, "result.json");
        if ((await stat(file)).size > 2000000)
          throw Error("Assistant output exceeded the size limit.");
        raw = await readFile(file, "utf8");
      } else {
        const envelope = JSON.parse(output);
        if (envelope.is_error)
          throw Error(
            String(
              envelope.result ?? "Claude could not complete this research.",
            ),
          );
        raw = envelope.structured_output ?? envelope.result ?? "";
      }
      return raw;
    } finally {
      this.active = undefined;
      if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
