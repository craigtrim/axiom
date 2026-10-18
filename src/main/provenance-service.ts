import { Worker } from "node:worker_threads";
import { randomUUID } from "node:crypto";
import path from "node:path";
import {
  validateProvenanceOptions,
  type ProvenanceStatus,
} from "../shared/provenance";
export class ProvenanceService {
  // craigtrim/axiom#94: resetting waits for the worker to save its partial evidence.
  private resetting = false;
  private worker?: Worker;
  private selectedRoot?: string;
  private value: ProvenanceStatus = {
    status: "idle",
    entries: 0,
    files: 0,
    directories: 0,
    issues: 0,
    recent: [],
  };
  constructor(
    private output: string,
    private workerDirectory: string,
    private helpers: string,
    private notify: (s: ProvenanceStatus) => void,
  ) {}
  select(root: string) {
    if (this.worker || this.resetting)
      throw Error(
        "Cancel the current collection before choosing another folder.",
      );
    this.selectedRoot = path.resolve(root);
    this.value = {
      status: "idle",
      root: this.selectedRoot,
      entries: 0,
      files: 0,
      directories: 0,
      issues: 0,
      recent: [],
      options: this.value.options,
    };
    this.notify(this.value);
    return this.selectedRoot;
  }
  status() {
    return structuredClone(this.value);
  }
  start(input: unknown) {
    if (this.worker || this.resetting)
      throw Error("Collection is already running.");
    if (!this.selectedRoot) throw Error("Choose a folder first.");
    const options = validateProvenanceOptions(input),
      id = randomUUID();
    this.value = {
      id,
      root: this.selectedRoot,
      status: "running",
      entries: 0,
      files: 0,
      directories: 0,
      issues: 0,
      recent: [],
      observations: 0,
      options,
    };
    this.notify(this.value);
    const w = new Worker(
      path.join(this.workerDirectory, "provenance-worker.cjs"),
      {
        workerData: {
          root: this.selectedRoot,
          id,
          options,
          directory: path.join(this.output, id),
          helpers: this.helpers,
        },
      },
    );
    this.worker = w;
    w.on("message", (s: ProvenanceStatus) => {
      this.value = s;
      this.notify(s);
    });
    w.on("error", (e) => {
      this.value = { ...this.value, status: "error", message: e.message };
      this.notify(this.value);
    });
    w.on("exit", () => {
      if (this.value.status === "running") {
        this.value = {
          ...this.value,
          status: "error",
          message: "Metadata worker stopped unexpectedly.",
        };
        this.notify(this.value);
      }
      if (this.worker === w) this.worker = undefined;
    });
    return this.status();
  }
  cancel() {
    this.worker?.postMessage("cancel");
  }
  async reset() {
    this.resetting = true;
    try {
      const worker = this.worker;
      if (worker) {
        const exited = new Promise<void>((resolve) =>
          worker.once("exit", () => resolve()),
        );
        this.cancel();
        await exited;
      }
      this.value = {
        status: "idle",
        root: this.selectedRoot,
        options: this.value.options,
        entries: 0,
        observations: 0,
        files: 0,
        directories: 0,
        issues: 0,
        recent: [],
      };
      this.notify(this.value);
      return this.status();
    } finally {
      this.resetting = false;
    }
  }
  close() {
    this.cancel();
  }
}
