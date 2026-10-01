import { auditStep, auditDetail, auditMetadata } from "./audit-log";
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
import type {
  AssistantId,
  AssistantInfo,
  AssistantRunResult,
  AssistantCallMetadata,
} from "../shared/assistant";
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
  for (const id of ["claude", "codex"] as const) {
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
  schema: object | null = null,
) {
  if (id === "codex")
    return [
      "exec",
      "--json",
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
const cliVersions = new Map<string, Promise<string | null>>();
function cliVersion(command: AssistantCommand) {
  const key = JSON.stringify([command.file, ...command.args]);
  let result = cliVersions.get(key);
  if (!result) {
    result = new Promise<string | null>((resolve) => {
      const child = spawn(command.file, [...command.args, "--version"], {
        windowsHide: true,
        shell: false,
        stdio: ["ignore", "pipe", "ignore"],
        env: {
          ...process.env,
          ...(command.node ? { ELECTRON_RUN_AS_NODE: "1" } : {}),
        },
      });
      let output = "";
      const timer = setTimeout(() => {
        child.kill();
        resolve(null);
      }, 3000);
      child.stdout.on("data", (chunk) => {
        output = (output + chunk.toString()).slice(0, 2000);
      });
      child.on("error", () => {
        clearTimeout(timer);
        resolve(null);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve(code === 0 && output.trim() ? output.trim() : null);
      });
    });
    cliVersions.set(key, result);
  }
  return result;
}
export function assistantOutputMetadata(
  provider: AssistantId,
  output: string,
): Pick<AssistantCallMetadata, "model" | "providerReport"> {
  const report: Record<string, unknown> = {};
  const models = new Set<string>();
  if (provider === "claude") {
    const envelope = JSON.parse(output);
    for (const [source, target] of [
      ["duration_ms", "durationMs"],
      ["duration_api_ms", "durationApiMs"],
      ["num_turns", "numTurns"],
      ["total_cost_usd", "totalCostUsd"],
      ["usage", "usage"],
      ["modelUsage", "modelUsage"],
    ])
      if (envelope[source] !== undefined) report[target] = envelope[source];
    if (envelope.modelUsage && typeof envelope.modelUsage === "object")
      for (const model of Object.keys(envelope.modelUsage)) models.add(model);
    if (typeof envelope.model === "string") models.add(envelope.model);
  } else {
    for (const line of output.split(/\r?\n/)) {
      try {
        const event = JSON.parse(line);
        if (typeof event.model === "string") models.add(event.model);
        if (typeof event.thread?.model === "string")
          models.add(event.thread.model);
        if (event.type === "turn.completed" && event.usage)
          report.usage = event.usage;
      } catch {
        /* Non-event stdout does not identify the model. */
      }
    }
  }
  return {
    model: models.size ? [...models].sort().join(", ") : null,
    providerReport: Object.keys(report).length ? report : null,
  };
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
    return (["claude", "codex"] as const).map((id) => ({
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
    maxPromptLength = 150000,
  ): Promise<unknown> {
    return (
      await this.runWithMetadata(provider, prompt, schema, web, maxPromptLength)
    ).reply;
  }
  async runWithMetadata(
    provider: AssistantId,
    prompt: string,
    schema: object | null,
    web = false,
    maxPromptLength = 150000,
  ): Promise<AssistantRunResult> {
    if (this.active) throw Error("An assistant request is already running.");
    const job: { child?: ChildProcess; cancelled: boolean } = {
      cancelled: false,
    };
    this.active = job;
    let dir: string | undefined;
    let diagnosticStdout = "",
      diagnosticStderr = "";
    try {
      auditMetadata({ provider });
      auditDetail("Prompt", prompt);
      auditStep("Finding assistant", provider);
      const command = (await this.discover()).find((c) => c.id === provider);
      if (!command)
        throw Error("The selected assistant was not found on PATH.");
      const version = await cliVersion(command);
      await mkdir(this.root, { recursive: true });
      dir = await mkdtemp(path.join(this.root, "job-"));
      if (schema)
        await writeFile(
          path.join(dir, "schema.json"),
          JSON.stringify(schema),
          "utf8",
        );
      if (job.cancelled) throw Error("Assistant cancelled.");
      if (prompt.length > maxPromptLength)
        throw Error("The selected ontology context is too large.");
      auditMetadata({ executable: command.file, workingDirectory: dir });
      auditDetail("Arguments", [
        ...command.args,
        ...assistantArguments(command.id, dir, web, schema),
      ]);
      auditStep("Starting assistant", provider);
      const started = Date.now();
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
          diagnosticStdout =
            stdout.slice(0, 262144) +
            (stdout.length > 262144 ? "\n[Output truncated]" : "");
          if (stdout.length > 2000000 && !failure) {
            failure = Error("Assistant output exceeded the size limit.");
            this.cancel();
          }
          stdout = stdout.slice(0, 2000001);
        });
        child.stderr!.on("data", (data) => {
          stderr = (stderr + data.toString()).slice(-8000);
          diagnosticStderr = stderr;
        });
        child.stdin!.on("error", () => {});
        child.on("error", (e) => {
          clearTimeout(timer);
          reject(e);
        });
        child.on("close", (code, signal) => {
          auditMetadata({ exitCode: code, signal });
          auditStep(
            "Assistant exited",
            "Exit code " + code + (signal ? ", signal " + signal : ""),
          );
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
      const completed = Date.now();
      auditStep("Reading assistant response");
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
              envelope.result ?? "Claude could not complete this request.",
            ),
          );
        raw = envelope.structured_output ?? envelope.result ?? "";
      }
      auditDetail("Assistant response", raw);
      return {
        reply: raw,
        metadata: {
          ...assistantOutputMetadata(provider, output),
          cli: { version, path: command.args[0] ?? command.file },
          startedAt: new Date(started).toISOString(),
          completedAt: new Date(completed).toISOString(),
          durationMs: completed - started,
        },
      };
    } finally {
      auditDetail("Process stdout", diagnosticStdout);
      auditDetail("Process stderr (last 8,000 characters)", diagnosticStderr);
      this.active = undefined;
      if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
